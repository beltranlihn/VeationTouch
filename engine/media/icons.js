// A thumbnail for a file the engine cannot decode itself (an image, a video, a sound) when the media helper is not there
// (the engine runs alone, headless): a neutral card with the file's kind drawn on it, in the interface's own greys. The
// clip grid stays usable; the desktop app's helper replaces it with the real picture (engine/media/index.js › thumbFile).
// Pure CPU, no dependencies: draws into an RGB buffer and hands it to png.js.

import { encodePng } from './png.js';

const BG = [0x1b, 0x1b, 0x1b], FG = [0x6a, 0x6a, 0x6a], FG2 = [0x8c, 0x8c, 0x8c];

function canvas(w, h) {
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(BG, i * 3);
  const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) rgb.set(c, (y * w + x) * 3); };
  const rect = (x0, y0, x1, y1, c) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) px(x, y, c); };
  const tri = (a, b, c, col) => { // filled triangle by half-planes
    const [ax, ay] = a, [bx, by] = b, [cx, cy] = c;
    const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx)), y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
    const e = (px_, py_, qx, qy, x, y) => (x - px_) * (qy - py_) - (y - py_) * (qx - px_);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = e(ax, ay, bx, by, x, y), w1 = e(bx, by, cx, cy, x, y), w2 = e(cx, cy, ax, ay, x, y);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(x, y, col);
    }
  };
  return { rgb, rect, tri };
}

/**
 * @param {'image'|'video'|'audio'|'hap'} kind @param {number} w @param {number} [h] (default 9/16 of w)
 * @returns {Buffer} the PNG
 */
export function kindIcon(kind, w = 160, h = Math.round((w * 9) / 16)) {
  const { rgb, rect, tri } = canvas(w, h);
  const u = Math.min(w, h * 16 / 9) / 160; // one unit of the 160×90 design
  const cx = w / 2, cy = h / 2;
  if (kind === 'image') { // a frame with a sun and two hills
    rect(cx - 36 * u, cy - 24 * u, cx + 36 * u, cy + 24 * u, FG);
    rect(cx - 34 * u, cy - 22 * u, cx + 34 * u, cy + 22 * u, BG);
    tri([cx - 30 * u, cy + 20 * u], [cx - 8 * u, cy - 6 * u], [cx + 14 * u, cy + 20 * u], FG2);
    tri([cx - 2 * u, cy + 20 * u], [cx + 16 * u, cy + 2 * u], [cx + 32 * u, cy + 20 * u], FG);
    rect(cx + 14 * u, cy - 18 * u, cx + 24 * u, cy - 8 * u, FG2);
  } else if (kind === 'audio') { // a row of bars
    const bars = [6, 14, 24, 12, 30, 18, 8, 26, 14, 20, 10, 5];
    bars.forEach((a, i) => rect(cx - 36 * u + i * 6.2 * u, cy - a * u, cx - 36 * u + i * 6.2 * u + 3.6 * u, cy + a * u, i % 2 ? FG : FG2));
  } else { // a play triangle
    tri([cx - 12 * u, cy - 18 * u], [cx - 12 * u, cy + 18 * u], [cx + 18 * u, cy], FG2);
  }
  return encodePng(w, h, rgb, 3);
}
