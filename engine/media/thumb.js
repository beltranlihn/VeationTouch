// Clip thumbnails without a GPU (MEDIA-SERVER.md §4d.4), so they exist without the desktop app too: one frame is read
// (at 10 % of the duration, or the one the operator picks), decompressed, and each 4×4 DXT block becomes ONE pixel —
// the average of its 16 decoded texels (a quarter of the resolution: 1799×228 for 7196×912). That image is resampled to
// the two sizes and written as PNG:
//   wide: 480 px wide with the whole strip (480×61 for 7196×912) — inspector and monitor
//   cell: 160×90 — a centred crop that fills the cell; for a strip (wider than 3:1) the crop sits on top and the whole
//         strip runs along the bottom as a band
// Orientation: block row 0 of a HAP texture is the TOP of the image (measured in VEATION), and PNG row 0 is the top:
// nothing is flipped. HAP Q is scaled YCoCg in DXT5 and is converted here; HAP Alpha is composited over black.

import fs from 'node:fs';
import { decodeFrame, codedError } from './hap.js';
import { encodePng } from './png.js';
import { openMovie } from './probe.js';

const expand = (v, palette, k) => { // RGB565 → 8-bit RGB at palette[k*3]
  const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
  palette[k * 3] = (r << 3) | (r >> 2); palette[k * 3 + 1] = (g << 2) | (g >> 4); palette[k * 3 + 2] = (b << 3) | (b >> 2);
};

/** The 4-colour palette of the DXT colour block at t[o]. BC1 with c0 ≤ c1 is the 3-colour mode (index 3 = black). */
function colorPalette(t, o, threeColorMode, pal) {
  const c0 = t[o] | (t[o + 1] << 8), c1 = t[o + 2] | (t[o + 3] << 8);
  expand(c0, pal, 0); expand(c1, pal, 1);
  for (let i = 0; i < 3; i++) {
    const a = pal[i], b = pal[3 + i];
    if (threeColorMode && c0 <= c1) { pal[6 + i] = (a + b + 1) >> 1; pal[9 + i] = 0; }
    else { pal[6 + i] = Math.round((2 * a + b) / 3); pal[9 + i] = Math.round((a + 2 * b) / 3); }
  }
}

/** The 8 alpha values of a BC3 alpha block at t[o]. */
function alphaPalette(t, o, al) {
  const a0 = t[o], a1 = t[o + 1]; al[0] = a0; al[1] = a1;
  if (a0 > a1) for (let i = 1; i < 7; i++) al[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
  else { for (let i = 1; i < 5; i++) al[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); al[6] = 0; al[7] = 255; }
}

/**
 * One RGB pixel per 4×4 block of a decoded HAP frame (hap.js › decodeFrame): the block average, row 0 = top.
 * @param {{tex:'dxt1'|'dxt5'|'ycocg', data:Uint8Array, blocksX:number, blocksY:number}} frame
 * @returns {{width:number, height:number, rgb:Uint8Array}}
 */
export function blockImage(frame) {
  const { tex, data, blocksX: bw, blocksY: bh } = frame;
  const rgb = new Uint8Array(bw * bh * 3), pal = new Uint8Array(12), al = new Uint8Array(8);
  const bb = tex === 'dxt1' ? 8 : 16;
  for (let i = 0, n = bw * bh; i < n; i++) {
    const o = i * bb, co = tex === 'dxt1' ? o : o + 8;
    colorPalette(data, co, tex === 'dxt1', pal);
    const idx = (data[co + 4] | (data[co + 5] << 8) | (data[co + 6] << 16) | (data[co + 7] << 24)) >>> 0;
    let r = 0, g = 0, b = 0;
    if (tex === 'dxt1') {
      for (let p = 0; p < 16; p++) { const k = ((idx >>> (2 * p)) & 3) * 3; r += pal[k]; g += pal[k + 1]; b += pal[k + 2]; }
    } else {
      alphaPalette(data, o, al);
      const lo = (data[o + 2] | (data[o + 3] << 8) | (data[o + 4] << 16)) >>> 0, hi = (data[o + 5] | (data[o + 6] << 8) | (data[o + 7] << 16)) >>> 0;
      for (let p = 0; p < 16; p++) {
        const k = ((idx >>> (2 * p)) & 3) * 3, a = al[p < 8 ? (lo >>> (3 * p)) & 7 : (hi >>> (3 * (p - 8))) & 7];
        if (tex === 'ycocg') {
          // Scaled YCoCg (Vidvox ScaledCoCgYToRGBA): R = Co, G = Cg (offset 128, ×scale), B = (scale-1)·8, A = Y
          const s = pal[k + 2] / 8 + 1, co2 = (pal[k] - 128) / s, cg = (pal[k + 1] - 128) / s;
          r += a + co2 - cg; g += a + cg; b += a - co2 - cg;
        } else { r += pal[k] * a / 255; g += pal[k + 1] * a / 255; b += pal[k + 2] * a / 255; } // over black
      }
    }
    rgb[i * 3] = Math.max(0, Math.min(255, Math.round(r / 16)));
    rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g / 16)));
    rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b / 16)));
  }
  return { width: bw, height: bh, rgb };
}

/** Box-filter weights: destination pixel i covers source [start + i·span/n, start + (i+1)·span/n). */
function weights(srcLen, start, span, n) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i * span) / n, b = start + ((i + 1) * span) / n, w = [];
    for (let j = Math.floor(a); j < Math.ceil(b); j++) {
      const f = Math.min(b, j + 1) - Math.max(a, j);
      if (f > 0) w.push([Math.max(0, Math.min(srcLen - 1, j)), f / (b - a)]);
    }
    r.push(w);
  }
  return r;
}

/**
 * Area resampling of the rectangle (sx, sy, sw, sh) of an RGB image into dst at (dx, dy), size dw×dh.
 * @param {{width:number, height:number, rgb:Uint8Array}} src @param {{width:number, rgb:Uint8Array}} dst
 */
export function resample(src, [sx, sy, sw, sh], dst, [dx, dy, dw, dh]) {
  const wx = weights(src.width, sx, sw, dw), wy = weights(src.height, sy, sh, dh);
  const row = new Float64Array(src.width * 3);
  for (let y = 0; y < dh; y++) {
    row.fill(0);
    for (const [j, f] of wy[y]) for (let x = 0, o = j * src.width * 3; x < src.width * 3; x++) row[x] += src.rgb[o + x] * f;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0;
      for (const [i, f] of wx[x]) { r += row[i * 3] * f; g += row[i * 3 + 1] * f; b += row[i * 3 + 2] * f; }
      const o = ((dy + y) * dst.width + dx + x) * 3;
      dst.rgb[o] = Math.round(r); dst.rgb[o + 1] = Math.round(g); dst.rgb[o + 2] = Math.round(b);
    }
  }
}

/**
 * The two thumbnail images (RGB) from a block image of a W×H clip.
 * @param {{width:number, height:number, rgb:Uint8Array}} img @param {number} W @param {number} H the clip size in pixels
 */
export function thumbnailImages(img, W, H) {
  const vw = W / 4, vh = H / 4; // the picture inside the block image (the last block column/row may be padding)
  const wide = { width: 480, height: Math.max(1, Math.round((480 * H) / W)) };
  wide.rgb = new Uint8Array(wide.width * wide.height * 3);
  resample(img, [0, 0, vw, vh], wide, [0, 0, wide.width, wide.height]);
  const cell = { width: 160, height: 90, rgb: new Uint8Array(160 * 90 * 3) };
  const band = W / H > 3 ? Math.max(8, Math.min(45, Math.round((160 * H) / W))) : 0;
  const ch = 90 - band, aspect = 160 / ch; // the crop fills 160×ch without distortion (cover)
  let cw = vw, chh = vh;
  if (vw / vh > aspect) cw = vh * aspect; else chh = vw / aspect;
  resample(img, [(vw - cw) / 2, (vh - chh) / 2, cw, chh], cell, [0, 0, 160, ch]);
  if (band) resample(img, [0, 0, vw, vh], cell, [0, ch, 160, band]);
  return { wide, cell };
}

/** The frame a thumbnail shows by default: the last one whose time ≤ 10 % of the duration. */
export function defaultThumbFrame(video, at = 0.1) {
  const t = video.pts[0] + (video.dur - video.pts[0]) * at;
  let i = 0; while (i + 1 < video.count && video.pts[i + 1] <= t) i++;
  return i;
}

/**
 * Both thumbnails of a HAP movie as PNG.
 * @param {string} file @param {{frame?:number, at?:number}} [opts] frame index, or a fraction of the duration (0.1)
 * @returns {Promise<{frame:number, wide:{width:number, height:number, png:Buffer}, cell:{width:number, height:number, png:Buffer}}>}
 */
export async function makeThumbnails(file, opts = {}) {
  const mv = await openMovie(file);
  try {
    const v = mv.index.video;
    if (!v || !v.count) throw codedError('not-hap', 'the movie has no video frames');
    const frame = Math.max(0, Math.min(v.count - 1, opts.frame ?? defaultThumbFrame(v, opts.at ?? 0.1)));
    const sample = await mv.read(v.offsets[frame], v.sizes[frame]);
    if (sample.length < v.sizes[frame]) throw codedError('truncated', `the file ends inside frame ${frame}`);
    const img = blockImage(decodeFrame(sample, v.fourcc, v.width, v.height));
    const { wide, cell } = thumbnailImages(img, v.width, v.height);
    return {
      frame,
      wide: { width: wide.width, height: wide.height, png: encodePng(wide.width, wide.height, wide.rgb, 3) },
      cell: { width: cell.width, height: cell.height, png: encodePng(cell.width, cell.height, cell.rgb, 3) },
    };
  } finally { await mv.close(); }
}

/**
 * Writes both thumbnails. @param {string} file @param {{wide:string, cell:string}} out PNG paths
 * @param {{frame?:number, at?:number}} [opts] @returns {Promise<number>} the frame used
 */
export async function writeThumbnails(file, out, opts) {
  const t = await makeThumbnails(file, opts);
  await fs.promises.writeFile(out.wide, t.wide.png);
  await fs.promises.writeFile(out.cell, t.cell.png);
  return t.frame;
}
