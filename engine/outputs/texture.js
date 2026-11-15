// "Texture" output: a black-and-white (greyscale) mask of the touches, rendered in OUTPUT-CANVAS
// pixels through each wall's mapping, shared over Spout so TouchDesigner / Unreal / Resolume use it
// directly as a texture (particles, fluids, masks…). Rendered on the CPU — at the default quarter
// resolution (960×600 for a 3840×2400 canvas) a frame costs a few milliseconds.

import { createRequire } from 'node:module';
import { wallToCanvas } from '../profile.js';

let spout = null, spoutError = null, spoutOwner = null;
function loadSpout() {
  if (spout || spoutError) return spout;
  try { spout = createRequire(import.meta.url)('../../native/spout-send/dsp_spout.node'); } catch (e) { spoutError = e.message; }
  return spout;
}

export class TextureRenderer {
  constructor() { this.w = 0; this.h = 0; this.mask = null; this.rgba = null; this.idle = false; }

  configure(o, profile) {
    this.o = o;
    this.profile = profile;
    const w = Math.max(16, Math.round(profile.canvas.width * o.scale));
    const h = Math.max(16, Math.round(profile.canvas.height * o.scale));
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      this.mask = new Uint8Array(w * h);
      this.rgba = Buffer.alloc(w * h * 4);
      for (let i = 3; i < this.rgba.length; i += 4) this.rgba[i] = 255;
      this.idle = false;
    }
  }

  /** @param {{wall:object, touches:object[]}[]} walls @param {number} dtMs since the previous render */
  render(walls, dtMs) {
    const { o, mask, w, h } = this;
    const any = walls.some((x) => x.touches.length);
    if (!any && this.idle) return false;           // nothing changed: keep the last (black) frame
    if (o.trailMs > 0) {
      const k = Math.exp(-dtMs / o.trailMs);
      let alive = 0;
      for (let i = 0; i < mask.length; i++) { const v = (mask[i] * k) | 0; mask[i] = v; alive |= v; }
      this.idle = !any && alive === 0;
    } else {
      mask.fill(0);
      this.idle = !any;
    }
    const s = o.scale;
    for (const { wall, touches } of walls) {
      for (const t of touches) {
        const [cx, cy] = wallToCanvas(wall, t.x, t.y);
        const [ex, ey] = wallToCanvas(wall, t.x + 0.1, t.y);
        const pxPerM = Math.hypot(ex - cx, ey - cy) * 10 * s;
        this._disc(cx * s, cy * s, Math.max(1, o.radius * pxPerM), o.softness);
      }
    }
    // expand to RGBA (grey, opaque)
    const rgba = this.rgba;
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) { const v = mask[i]; rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; }
    return true;
  }

  _disc(cx, cy, r, soft) {
    const { mask, w, h } = this;
    const inner = r * (1 - Math.min(0.95, soft));
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        let v = 255;
        if (d > inner) { const t = (r - d) / (r - inner); v = Math.round(255 * t * t * (3 - 2 * t)); } // smoothstep edge
        const i = y * w + x;
        if (v > mask[i]) mask[i] = v;
      }
    }
  }
}

/** One texture destination → one Spout sender (the addon allows one sender per process). */
export class TextureOutput {
  constructor(log) { this.log = log; this.r = new TextureRenderer(); this.started = false; this.last = 0; this.error = null; }

  configure(o, profile) {
    this.r.configure(o, profile);
    if (spoutOwner && spoutOwner !== this) { this.error = 'only one Texture output can be active'; return; }
    const sp = loadSpout();
    if (!sp) { this.error = `Spout not available (${spoutError})`; return; }
    if (!this.started || this.name !== o.senderName) {
      if (this.started) sp.stop();
      this.started = sp.start(o.senderName);
      this.name = o.senderName;
      spoutOwner = this.started ? this : null;
      this.error = this.started ? null : 'Spout sender could not start (DirectX 11 unavailable?)';
      if (this.started) this.log.info(`Spout sender "${o.senderName}" ${this.r.w}×${this.r.h}`);
    }
  }

  /** @returns {boolean} whether a frame was sent */
  send(walls, nowMs) {
    if (!this.started) return false;
    const dt = this.last ? nowMs - this.last : 16;
    this.last = nowMs;
    this.r.render(walls, dt);
    return spout.send(this.r.rgba, this.r.w, this.r.h, false);
  }

  close() {
    if (this.started && spout) { try { spout.stop(); } catch { /* ignore */ } }
    if (spoutOwner === this) spoutOwner = null;
    this.started = false;
  }
}
