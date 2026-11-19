// The touch mask of the "Texture" output: white discs on black, in OUTPUT-CANVAS pixels, following each
// wall's Mapping. One implementation, run by the engine (the Spout sender, outputs/texture.js) and by the
// operator UI (the live preview in Outputs › Texture, served as /shared/mask.js): the preview is the output.
// Plain JavaScript on a Uint8Array — no Node or browser API.

import { wallUvToCanvas } from './geometry.js';

/** Radius of a touch's disc in metres: fixed, or following the measured width of what touches (never below `radius`). */
export function discRadiusM(o, t) {
  return o.sizeMode === 'touch' ? Math.max(o.radius, (t.size || 0) / 2) : o.radius;
}

// ---------------------------------------------------------------- calibration pattern (the pixel map)
// A grid in WALL METRES carried through each wall's mapping, so it shows on the physical wall whether the mapping
// (and the calibration) lines up. `wallPattern` is the geometry, shared by this rasteriser and the projection page
// (which strokes it on a 2D canvas); `TouchMask` rasterises it, with the calibration targets, into the mask.

/**
 * The pattern of one wall in OUTPUT-CANVAS pixels: outline, 0.5 m lines (every second one is a metre line, with its
 * label), centre cross, corner marks, the wall id. Pure geometry — no drawing.
 * Text anchors are the bottom-left of the text (the id: bottom-centre); `textPx` is a comfortable text height.
 */
export function wallPattern(wall) {
  const W = wall.width, H = wall.height;
  const N = wall.mapping?.mode === 'grid' ? 24 : 1; // a mesh bends the lines: sample them
  const Pt = (x, y) => wallUvToCanvas(wall, x / W, 1 - y / H);
  const along = (fn) => { const a = []; for (let k = 0; k <= N; k++) a.push(fn(k / N)); return a; };
  const [ax, ay] = Pt(W / 2, H / 2), [bx, by] = Pt(W / 2 + 0.1, H / 2);
  const pxPerM = Math.hypot(bx - ax, by - ay) * 10; // the mapping's local scale at the centre
  const lines = [];
  for (let i = 1; i * 0.5 < W - 1e-6; i++) {
    const x = i * 0.5, major = i % 2 === 0;
    lines.push({ axis: 'x', metres: x, major, pts: along((t) => Pt(x, t * H)), label: major ? { text: `${x}m`, at: Pt(x + 0.03, 0.03) } : null });
  }
  for (let i = 1; i * 0.5 < H - 1e-6; i++) {
    const y = i * 0.5, major = i % 2 === 0;
    lines.push({ axis: 'y', metres: y, major, pts: along((t) => Pt(t * W, y)), label: major ? { text: `${y}m`, at: Pt(0.05, y + 0.03) } : null });
  }
  const arm = Math.min(0.2, W / 4, H / 4), L = Math.min(0.2, W / 4, H / 4), inset = Math.min(0.05, W / 8, H / 8);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => {
    const cx = sx > 0 ? inset : W - inset, cy = sy > 0 ? inset : H - inset; // inside the corner
    return [Pt(cx + sx * L, cy), Pt(cx, cy), Pt(cx, cy + sy * L)];
  });
  return {
    pxPerM, textPx: pxPerM * 0.12, lines, corners,
    outline: along((t) => Pt(t * W, H)).concat(along((t) => Pt(W, H * (1 - t))), along((t) => Pt(W * (1 - t), 0)), along((t) => Pt(0, H * t))),
    cross: [[Pt(W / 2 - arm, H / 2), Pt(W / 2 + arm, H / 2)], [Pt(W / 2, H / 2 - arm), Pt(W / 2, H / 2 + arm)]],
    centre: Pt(W / 2, H / 2),
    id: { text: wall.id, at: Pt(W / 2, H / 2 + 0.12) },
  };
}

/** What the pattern must show right now (null = nothing: the output stays pure touches). */
export function overlayOf({ grid, calib, verify, fit } = {}) {
  return grid || calib || verify || fit ? { grid: !!grid, calib: calib || null, verify: verify || null, fit: fit || null } : null;
}

// 5×7 bitmap font (one row per byte, 5 bits, the left pixel is bit 4): digits, A–Z, '.', 'm', '-'.
const FONT = {};
{
  const rows = {
    0: '0E 11 13 15 19 11 0E', 1: '04 0C 04 04 04 04 0E', 2: '0E 11 01 02 04 08 1F', 3: '1F 02 04 02 01 11 0E', 4: '02 06 0A 12 1F 02 02',
    5: '1F 10 1E 01 01 11 0E', 6: '06 08 10 1E 11 11 0E', 7: '1F 01 02 04 08 08 08', 8: '0E 11 11 0E 11 11 0E', 9: '0E 11 11 0F 01 02 0C',
    A: '0E 11 11 1F 11 11 11', B: '1E 11 11 1E 11 11 1E', C: '0E 11 10 10 10 11 0E', D: '1E 11 11 11 11 11 1E', E: '1F 10 10 1E 10 10 1F',
    F: '1F 10 10 1E 10 10 10', G: '0E 11 10 17 11 11 0F', H: '11 11 11 1F 11 11 11', I: '0E 04 04 04 04 04 0E', J: '07 02 02 02 02 12 0C',
    K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1F', M: '11 1B 15 15 11 11 11', N: '11 11 19 15 13 11 11', O: '0E 11 11 11 11 11 0E',
    P: '1E 11 11 1E 10 10 10', Q: '0E 11 11 11 15 12 0D', R: '1E 11 11 1E 14 12 11', S: '0F 10 10 0E 01 01 1E', T: '1F 04 04 04 04 04 04',
    U: '11 11 11 11 11 11 0E', V: '11 11 11 11 11 0A 04', W: '11 11 11 15 15 15 0A', X: '11 11 0A 04 0A 11 11', Y: '11 11 0A 04 04 04 04',
    Z: '1F 01 02 04 08 10 1F', '.': '00 00 00 00 00 0C 0C', m: '00 00 1A 15 15 15 15', '-': '00 00 00 1F 00 00 00',
  };
  for (const [ch, r] of Object.entries(rows)) FONT[ch] = r.split(' ').map((x) => parseInt(x, 16));
}
const glyph = (ch) => FONT[ch] || FONT[ch.toUpperCase()] || null;

/** Width in pixels of a text at glyph scale `s` (5 px + 1 px gap per character). */
export const textWidth = (text, s) => Math.max(0, text.length * 6 - 1) * s;

/** Writes bright pixels into a Uint8Array buffer: lines, discs, rings, text. All max-blended. */
class Pen {
  constructor(buf, w, h) { this.buf = buf; this.w = w; this.h = h; }
  px(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) { const i = y * this.w + x; if (v > this.buf[i]) this.buf[i] = v; } }
  /** A line `t` pixels thick, stepped along its major axis. */
  line(x0, y0, x1, y1, t, v) {
    if (!(Number.isFinite(x0 + y0 + x1 + y1))) return;
    const dx = x1 - x0, dy = y1 - y0, r = Math.round(t / 2);
    if (Math.abs(dx) >= Math.abs(dy)) {
      const a = Math.max(0, Math.round(Math.min(x0, x1))), b = Math.min(this.w - 1, Math.round(Math.max(x0, x1)));
      for (let x = a; x <= b; x++) { const yc = dx === 0 ? y0 : y0 + (dy * (x - x0)) / dx; for (let k = 0; k < t; k++) this.px(x, Math.round(yc) - r + k, v); }
    } else {
      const a = Math.max(0, Math.round(Math.min(y0, y1))), b = Math.min(this.h - 1, Math.round(Math.max(y0, y1)));
      for (let y = a; y <= b; y++) { const xc = y0 === y1 ? x0 : x0 + (dx * (y - y0)) / dy; for (let k = 0; k < t; k++) this.px(Math.round(xc) - r + k, y, v); }
    }
  }
  poly(pts, k, t, v, closed = false) {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0] * k, pts[i - 1][1] * k, pts[i][0] * k, pts[i][1] * k, t, v);
    if (closed && pts.length > 2) this.line(pts.at(-1)[0] * k, pts.at(-1)[1] * k, pts[0][0] * k, pts[0][1] * k, t, v);
  }
  dot(cx, cy, r, v) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, v);
  }
  ring(cx, cy, r, t, v) {
    const n = Math.max(16, Math.ceil(r * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      this.line(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), t, v);
    }
  }
  /** `anchor`: 'left' = the bottom-left corner of the text at (x, y); 'center' = its bottom-centre. */
  text(str, x, y, s, v, anchor = 'left') {
    let x0 = Math.round(anchor === 'center' ? x - textWidth(str, s) / 2 : x);
    const y0 = Math.round(y) - 7 * s;
    for (const ch of String(str)) {
      const g = glyph(ch);
      if (g) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) {
        for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) this.px(x0 + c * s + a, y0 + r * s + b, v);
      }
      x0 += 6 * s;
    }
  }
}

/** Rasterises the pattern of every wall (and the running session's targets) into `buf`, at `k` mask px per canvas px. */
function drawPattern(buf, w, h, k, walls, ov) {
  const pen = new Pen(buf, w, h);
  const T = (base) => base * Math.max(1, Math.round(k * 2)); // thicker lines at higher resolutions
  for (const { wall } of walls) {
    const pat = wallPattern(wall);
    const pm = pat.pxPerM * k; // mask px per metre
    const s = Math.max(1, Math.round((pat.textPx * k) / 7)); // glyph scale: readable at the output's scale
    for (const l of pat.lines) pen.poly(l.pts, k, l.major ? T(2) : T(1), l.major ? 200 : 110);
    pen.poly(pat.outline, k, T(2), 255, true);
    for (const c of pat.corners) pen.poly(c, k, T(3), 255);
    for (const [a, b] of pat.cross) pen.line(a[0] * k, a[1] * k, b[0] * k, b[1] * k, T(2), 255);
    for (const l of pat.lines) if (l.label) pen.text(l.label.text, l.label.at[0] * k, l.label.at[1] * k, s, 220);
    pen.text(wall.id, pat.id.at[0] * k, pat.id.at[1] * k, s * 2, 255, 'center');

    // the running calibration: every target a dot, the current one a ring + crosshair + its number
    const c = ov.calib;
    if (c && c.wallId === wall.id) {
      const Pt = (x, y) => wallUvToCanvas(wall, x / wall.width, 1 - y / wall.height);
      c.targets.forEach((t, i) => {
        const [x, y] = Pt(t.x, t.y).map((q) => q * k);
        if (i === c.index && c.phase !== 'done') {
          const R = Math.max(5, pm * 0.14);
          pen.ring(x, y, R, T(2), 255);
          const g0 = R * 0.4, g1 = R * 1.8;
          pen.line(x - g1, y, x - g0, y, T(1), 255); pen.line(x + g0, y, x + g1, y, T(1), 255);
          pen.line(x, y - g1, x, y - g0, T(1), 255); pen.line(x, y + g0, x, y + g1, T(1), 255);
          if (c.phase === 'release') pen.dot(x, y, Math.max(2, R * 0.3), 255);
          pen.text(String(i + 1), x + R * 1.1, y - R * 1.1, s * 2, 255);
        } else pen.dot(x, y, Math.max(2, pm * 0.03), t.skipped ? 90 : 200);
      });
    }
    // verification: its check points (the one being measured ringed larger; a measured point has its dot)
    const v = ov.verify;
    if (v && v.wallId === wall.id) {
      const Pt = (x, y) => wallUvToCanvas(wall, x / wall.width, 1 - y / wall.height);
      v.targets.forEach((t, i) => {
        const [x, y] = Pt(t.x, t.y).map((q) => q * k);
        const cur = i === v.index && v.phase !== 'done';
        pen.ring(x, y, Math.max(cur ? 4 : 3, pm * (cur ? 0.1 : 0.04)), cur ? T(2) : T(1), cur ? 255 : 200);
        if (cur) pen.text(String(i + 1), x + pm * 0.14, y - pm * 0.14, s * 2, 255);
        if (t.measured) { const [mx, my] = Pt(t.measured[0], t.measured[1]).map((q) => q * k); pen.dot(mx, my, Math.max(2, pm * 0.02), 255); }
      });
    }
    // Fit: the mesh node being moved
    const f = ov.fit;
    if (f && f.wallId === wall.id && f.node != null && wall.mapping?.mode === 'grid' && wall.mapping.points[f.node]) {
      const [x, y] = wall.mapping.points[f.node].map((q) => q * k);
      const R = Math.max(5, pm * 0.11);
      pen.ring(x, y, R, T(2), 255);
      pen.line(x - R * 1.7, y, x - R * 0.45, y, T(1), 255); pen.line(x + R * 0.45, y, x + R * 1.7, y, T(1), 255);
      pen.line(x, y - R * 1.7, x, y - R * 0.45, T(1), 255); pen.line(x, y + R * 1.7, x, y + R * 0.45, T(1), 255);
    }
  }
}

export class TouchMask {
  constructor() { this.w = 0; this.h = 0; this.mask = new Uint8Array(0); this.idle = false; this.pattern = null; this.patKey = null; this.view = null; }

  /** The finished frame: the touches, with the calibration pattern on top when `render` was given an overlay. */
  get frame() { return this.patKey !== null ? this.view : this.mask; }

  /** @returns {boolean} whether the size changed (the mask is then black) */
  resize(w, h) {
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    this.pattern = null; this.view = null; this.patKey = null;
    this.idle = false;
    return true;
  }

  /**
   * One frame. `walls` = [{wall, touches:[{x, y, size}]}] (metres), `o` = the output's options
   * {radius, softness, trailMs, sizeMode}, `scale` = mask pixels per canvas pixel, `dtMs` since the last frame.
   * `overlay` (see overlayOf): draw the calibration pattern of the walls given, on top of the touches — read the
   * result from `frame`. The touches (and their trail) are never disturbed by it.
   * @returns {boolean} false when nothing changed (no touches and the trail has faded: the mask stays black)
   */
  render(walls, o, scale, dtMs, overlay = null) {
    const mask = this.mask;
    const any = walls.some((x) => x.touches.length);
    // the pattern changes with the walls' geometry and the session, not with the touches: redrawn only then
    const key = overlay ? JSON.stringify([overlay, walls.map((x) => [x.wall.id, x.wall.width, x.wall.height, x.wall.mapping, x.wall.pixelRect]), scale, this.w, this.h], (name, v) => (name === 'progress' || name === 'flash' || name === 'armed' || name === 'near' ? undefined : v)) : null; // (live feedback of the session, not the pattern)
    if (!any && this.idle && key === this.patKey) return false;
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
    if (key !== null) {
      if (key !== this.patKey || !this.pattern) {
        this.pattern ??= new Uint8Array(this.w * this.h);
        this.pattern.fill(0);
        drawPattern(this.pattern, this.w, this.h, scale, walls, overlay);
      }
      this.view ??= new Uint8Array(this.w * this.h);
      const v = this.view, p = this.pattern;
      for (let i = 0; i < mask.length; i++) v[i] = mask[i] > p[i] ? mask[i] : p[i];
    }
    this.patKey = key;
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
