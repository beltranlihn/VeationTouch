// Synthetic scene for one wall, used by the simulator driver and the S2E emulator.
// The scan plane is parallel to the wall, so inside that plane the "room" is a rectangle:
// floor (y = 0), the two adjacent walls (x = 0, x = W) and open air above (no ceiling).
// Hands are discs of ~4 cm radius crossing the plane.

import { poseMatrix, invert, apply } from '../core/geometry.js';

const HAND_R = 0.045;

export class SimWall {
  /**
   * @param {{width:number, height:number}} wall
   * @param {{x:number,y:number,rotation:number,mirror?:boolean}} pose  true sensor pose
   */
  constructor(wall, pose, { wanderers = 0, noiseMm = 4, seed = 1, plane = null } = {}) {
    this.wall = wall;
    this.setPose(pose);
    this.setPlane(plane);
    this.noiseMm = noiseMm;
    this.injected = new Map(); // id → {x, y}
    this.wanderers = [];
    this._seed = seed >>> 0 || 1;
    this.setWanderers(wanderers);
    this.obstacles = []; // static discs {x, y, r} (e.g. a lamp crossing the plane)
  }

  setPose(pose) {
    this.pose = pose;
    this.m = poseMatrix(pose);
    this.inv = invert(this.m);
    this.origin = [pose.x, pose.y];
  }

  /**
   * Scan plane not exactly parallel to the wall: `gapMm` from the wall at the sensor, leaning towards it by
   * `tiltDeg` along the wall-frame direction `towardsDeg` (0 = +x, -90 = down). Rays reach the wall where the gap
   * closes (grazing) and see nothing beyond. null = perfectly parallel.
   */
  setPlane(plane) {
    this.plane = plane && plane.tiltDeg > 0 ? { gapMm: 20, towardsDeg: -90, ...plane } : null;
  }

  rand() {
    // xorshift32 — deterministic for tests
    let x = this._seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this._seed = x >>> 0;
    return this._seed / 4294967296;
  }

  setWanderers(n) {
    const W = this.wall.width;
    while (this.wanderers.length < n) {
      this.wanderers.push({
        x: 0.4 + this.rand() * (W - 0.8), y: 0.6 + this.rand() * 1.4,
        vx: (this.rand() - 0.5) * 0.6, vy: (this.rand() - 0.5) * 0.3,
        on: this.rand() > 0.3, t: this.rand() * 3,
      });
    }
    this.wanderers.length = n;
  }

  /** Advance wanderers by dt seconds (touch, slide, lift, move elsewhere). */
  step(dt) {
    const W = this.wall.width;
    for (const w of this.wanderers) {
      w.t -= dt;
      if (w.t <= 0) {
        w.on = !w.on;
        w.t = w.on ? 0.8 + this.rand() * 3 : 0.3 + this.rand() * 1.5;
        if (w.on) {
          w.x = 0.3 + this.rand() * (W - 0.6); w.y = 0.4 + this.rand() * 1.6;
          w.vx = (this.rand() - 0.5) * 0.8; w.vy = (this.rand() - 0.5) * 0.4;
        }
      }
      if (w.on) {
        w.x += w.vx * dt; w.y += w.vy * dt;
        if (w.x < 0.2 || w.x > W - 0.2) w.vx = -w.vx;
        if (w.y < 0.3 || w.y > 2.3) w.vy = -w.vy;
      }
    }
  }

  hands() {
    const out = [];
    for (const h of this.injected.values()) out.push(h);
    for (const w of this.wanderers) if (w.on) out.push(w);
    return out;
  }

  /** Gaussian-ish noise (sum of uniforms). */
  noise() {
    return ((this.rand() + this.rand() + this.rand() - 1.5) / 1.5) * this.noiseMm;
  }

  /**
   * Distance (mm) seen along a raw sensor angle, 0 = no return.
   * @param {number} angleDeg sensor-frame angle
   * @param {{x:number,y:number,r:number}[]} hands
   */
  raycast(angleDeg, hands) {
    const a = (angleDeg * Math.PI) / 180;
    // sensor-frame direction → wall-frame direction (rotation + mirror, no translation)
    const [ox, oy] = this.origin;
    const [px, py] = apply(this.m, Math.cos(a), Math.sin(a));
    const dx = px - ox, dy = py - oy;
    let best = Infinity;
    // floor y = 0
    if (dy < -1e-9) { const t = -oy / dy; const x = ox + dx * t; if (x >= -0.05 && x <= this.wall.width + 0.05) best = Math.min(best, t); }
    // side walls x = 0 and x = W (they stop at the wall height + 0.3 m, the room is open above)
    const top = this.wall.height + 0.3;
    if (dx < -1e-9) { const t = -ox / dx; const y = oy + dy * t; if (y >= 0 && y <= top) best = Math.min(best, t); }
    if (dx > 1e-9) { const t = (this.wall.width - ox) / dx; const y = oy + dy * t; if (y >= 0 && y <= top) best = Math.min(best, t); }
    if (this.plane) {
      const u = (this.plane.towardsDeg * Math.PI) / 180;
      const k = dx * Math.cos(u) + dy * Math.sin(u);
      if (k > 1e-6) best = Math.min(best, this.plane.gapMm / 1000 / (Math.tan((this.plane.tiltDeg * Math.PI) / 180) * k));
    }
    for (const h of hands.concat(this.obstacles)) {
      const r = h.r ?? HAND_R;
      const fx = ox - h.x, fy = oy - h.y;
      const b = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - r * r;
      const disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t > 0.05) best = Math.min(best, t);
      }
    }
    if (!Number.isFinite(best) || best > 30) return 0;
    const mm = best * 1000 + this.noise();
    return mm < 50 ? 0 : mm;
  }

  /** Full revolution: `n` samples starting at angle `a0`. */
  scan(n = 3200, a0 = 0) {
    const hands = this.hands();
    const angle = new Float32Array(n), dist = new Float32Array(n), quality = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const ang = (a0 + (i * 360) / n) % 360;
      angle[i] = ang;
      const d = this.raycast(ang, hands);
      dist[i] = d;
      quality[i] = d > 0 ? 180 : 0;
    }
    return { angle, dist, quality };
  }
}

/** Wall-frame point → sensor-frame point for a pose (used by tests). */
export function wallToSensor(pose, x, y) {
  return apply(invert(poseMatrix(pose)), x, y);
}
