// Per-wall tracker: fuses detections from every sensor of a wall into touches with
// persistent ids, filters them (One Euro) and runs their life cycle:
//   tentative ──(confirmFrames hits)──▶ active ──(no data for coastMs)──▶ up
// Detections arrive per sensor revolution (~10 Hz each, unsynchronised); `tick()` runs at
// the output rate (60 Hz) and may extrapolate a little (predictMs) to hide the 10 Hz steps.

import { OneEuro, hungarian } from './filters.js';

export const TRACKER_DEFAULTS = Object.freeze({
  mergeDist: 0.08,        // m, detections closer than this in one revolution = one hand
  gateBase: 0.15,         // m, association gate at dt = 0
  maxSpeed: 4.0,          // m/s, gate grows with time since last seen
  confirmFrames: 2,       // revolutions before a touch is reported (≈ 100–200 ms at 10 Hz)
  tentativeMs: 260,       // a tentative track not confirmed in this time is dropped
  coastMs: 220,           // keep a touch alive through short dropouts/occlusions
  predictMs: 60,          // max extrapolation between revolutions (0 = off)
  oneEuro: { minCutoff: 1.2, beta: 0.6, dCutoff: 1.0 },
});

export class WallTracker {
  /** @param {{id:string}} wall @param {object} params @param {{next:number}} ids shared id source */
  constructor(wall, params, ids) {
    this.wall = wall;
    this.ids = ids;
    this.tracks = [];
    this.configure(params);
  }

  configure(params) {
    this.p = { ...TRACKER_DEFAULTS, ...(params || {}), oneEuro: { ...TRACKER_DEFAULTS.oneEuro, ...(params?.oneEuro || {}) } };
    for (const t of this.tracks) { t.fx.set(this.p.oneEuro); t.fy.set(this.p.oneEuro); }
  }

  _merge(dets) {
    const out = [];
    for (const d of dets) {
      const m = out.find((o) => Math.hypot(o.x - d.x, o.y - d.y) < this.p.mergeDist);
      if (m) {
        const w = m.n + d.n;
        m.x = (m.x * m.n + d.x * d.n) / w; m.y = (m.y * m.n + d.y * d.n) / w;
        m.size = Math.max(m.size, d.size); m.n = w;
      } else out.push({ ...d });
    }
    return out;
  }

  /** @param {{x:number,y:number,size:number,n:number}[]} dets @param {number} tMs */
  ingest(dets, tMs) {
    const D = this._merge(dets);
    const T = this.tracks;
    if (T.length && D.length) {
      const cost = T.map((tr) => {
        const dt = Math.min(0.5, Math.max(0, (tMs - tr.lastSeen) / 1000));
        const px = tr.x + tr.vx * dt, py = tr.y + tr.vy * dt;
        const gate = this.p.gateBase + this.p.maxSpeed * dt;
        return D.map((d) => { const c = Math.hypot(d.x - px, d.y - py); return c <= gate ? c : 1e6; });
      });
      const asg = hungarian(cost);
      const used = new Set();
      asg.forEach((j, i) => {
        if (j < 0 || cost[i][j] >= 1e6) return;
        used.add(j);
        this._update(T[i], D[j], tMs);
      });
      D.forEach((d, j) => { if (!used.has(j)) this._spawn(d, tMs); });
    } else {
      for (const d of D) this._spawn(d, tMs);
    }
  }

  _spawn(d, tMs) {
    const tr = {
      id: 0, state: 'tentative', hits: 1, born: tMs, lastSeen: tMs,
      rawX: d.x, rawY: d.y, x: d.x, y: d.y, vx: 0, vy: 0, size: d.size,
      fx: new OneEuro(this.p.oneEuro), fy: new OneEuro(this.p.oneEuro), downAt: 0,
    };
    tr.fx.filter(d.x, tMs / 1000); tr.fy.filter(d.y, tMs / 1000);
    this.tracks.push(tr);
  }

  _update(tr, d, tMs) {
    const dt = (tMs - tr.lastSeen) / 1000;
    const nx = tr.fx.filter(d.x, tMs / 1000), ny = tr.fy.filter(d.y, tMs / 1000);
    if (dt > 1e-3) {
      const k = 0.5;
      tr.vx = k * ((nx - tr.x) / dt) + (1 - k) * tr.vx;
      tr.vy = k * ((ny - tr.y) / dt) + (1 - k) * tr.vy;
    }
    tr.x = nx; tr.y = ny; tr.rawX = d.x; tr.rawY = d.y;
    tr.size = 0.7 * tr.size + 0.3 * d.size;
    tr.lastSeen = tMs;
    tr.hits++;
  }

  /**
   * Advance the life cycle. Returns the visible touches and the down/up events.
   * @param {number} nowMs
   */
  tick(nowMs) {
    const events = [];
    const keep = [];
    for (const tr of this.tracks) {
      const since = nowMs - tr.lastSeen;
      if (tr.state === 'tentative') {
        // `confirmNow`: the room-level corner linker says this track continues a touch from the next wall
        if (tr.hits >= this.p.confirmFrames || this.confirmNow?.(this.wall.id, tr)) {
          tr.state = 'active';
          tr.id = this.ids.next++;
          tr.downAt = nowMs;
          events.push({ type: 'down', id: tr.id, wallId: this.wall.id, x: tr.x, y: tr.y, t: nowMs });
        } else if (nowMs - tr.born > this.p.tentativeMs) continue; // never confirmed: drop silently
      }
      if (tr.state === 'active' && since > this.p.coastMs) {
        events.push({ type: 'up', id: tr.id, wallId: this.wall.id, x: tr.x, y: tr.y, t: nowMs, duration: (nowMs - tr.downAt) / 1000 });
        continue;
      }
      keep.push(tr);
    }
    this.tracks = keep;
    const touches = [];
    for (const tr of keep) {
      if (tr.state !== 'active') continue;
      const lead = this.p.predictMs > 0 ? Math.min(nowMs - tr.lastSeen, this.p.predictMs) / 1000 : 0;
      touches.push({
        id: tr.id, wallId: this.wall.id,
        x: tr.x + tr.vx * lead, y: tr.y + tr.vy * lead,
        vx: tr.vx, vy: tr.vy, size: tr.size,
        age: (nowMs - tr.downAt) / 1000,
        seenMs: nowMs - tr.lastSeen,
        coasting: nowMs - tr.lastSeen > 150,
      });
    }
    return { touches, events };
  }

  clear() {
    const events = this.tracks.filter((t) => t.state === 'active')
      .map((t) => ({ type: 'up', id: t.id, wallId: this.wall.id, x: t.x, y: t.y, t: performance.now() }));
    this.tracks = [];
    return events;
  }
}
