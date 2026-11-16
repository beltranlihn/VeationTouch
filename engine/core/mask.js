// The touch mask of the "Texture" output: white discs on black, in OUTPUT-CANVAS pixels, following each
// wall's Mapping. One implementation, run by the engine (the Spout sender, outputs/texture.js) and by the
// operator UI (the live preview in Outputs › Texture, served as /shared/mask.js): the preview is the output.
// Plain JavaScript on a Uint8Array — no Node or browser API.

import { wallUvToCanvas } from './geometry.js';

/** Radius of a touch's disc in metres: fixed, or following the measured width of what touches (never below `radius`). */
export function discRadiusM(o, t) {
  return o.sizeMode === 'touch' ? Math.max(o.radius, (t.size || 0) / 2) : o.radius;
}

export class TouchMask {
  constructor() { this.w = 0; this.h = 0; this.mask = new Uint8Array(0); this.idle = false; }

  /** @returns {boolean} whether the size changed (the mask is then black) */
  resize(w, h) {
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    this.idle = false;
    return true;
  }

  /**
   * One frame. `walls` = [{wall, touches:[{x, y, size}]}] (metres), `o` = the output's options
   * {radius, softness, trailMs, sizeMode}, `scale` = mask pixels per canvas pixel, `dtMs` since the last frame.
   * @returns {boolean} false when nothing changed (no touches and the trail has faded: the mask stays black)
   */
  render(walls, o, scale, dtMs) {
    const mask = this.mask;
    const any = walls.some((x) => x.touches.length);
    if (!any && this.idle) return false;
    if (o.trailMs > 0) {
      const k = Math.exp(-dtMs / o.trailMs);
      let alive = 0;
      for (let i = 0; i < mask.length; i++) { const v = (mask[i] * k) | 0; mask[i] = v; alive |= v; }
      this.idle = !any && alive === 0;
    } else {
      mask.fill(0);
      this.idle = !any;
    }
    for (const { wall, touches } of walls) {
      for (const t of touches) {
        const [cx, cy] = wallUvToCanvas(wall, t.x / wall.width, 1 - t.y / wall.height);
        const [ex, ey] = wallUvToCanvas(wall, (t.x + 0.1) / wall.width, 1 - t.y / wall.height);
        const pxPerM = Math.hypot(ex - cx, ey - cy) * 10 * scale; // the mapping's local scale at the touch
        this.disc(cx * scale, cy * scale, Math.max(1, discRadiusM(o, t) * pxPerM), o.softness);
      }
    }
    return true;
  }

  /** A disc with a smoothstep edge (`soft` = the fraction of the radius that fades), max-blended. */
  disc(cx, cy, r, soft) {
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
        if (d > inner) { const s = (r - d) / (r - inner); v = Math.round(255 * s * s * (3 - 2 * s)); }
        const i = y * w + x;
        if (v > mask[i]) mask[i] = v;
      }
    }
  }
}
