// Demo HAP movies for screenshots of the UI (tests/live-ui.test.mjs › screenshots): the same container make-hap.mjs
// writes, with pictures that look like content (soft gradients and waves) instead of the test pattern, so a review of
// the grid judges thumbnails as an operator will see them. TEST-ONLY; generated at test time, never committed.
// How: make-hap builds the movie with UNCOMPRESSED frames (every sample is the same size, header + DXT texture), then
// each sample is overwritten in place by the demo picture's frame — the index stays true.

import { makeHap, encodeTexture, hapFrame } from './make-hap.mjs';

/** Colour schemes: [top-left, bottom-right, accent] in RGB. */
export const PALETTES = [
  [[8, 28, 64], [20, 150, 190], [120, 230, 255]],   // ocean
  [[60, 10, 6], [230, 110, 30], [255, 220, 120]],   // ember
  [[30, 22, 50], [70, 190, 150], [190, 120, 255]],  // aurora
  [[70, 50, 30], [220, 180, 120], [255, 240, 200]], // dunes
  [[6, 8, 18], [30, 40, 90], [255, 200, 90]],       // night
  [[10, 40, 20], [80, 160, 60], [200, 240, 140]],   // forest
  [[70, 20, 50], [250, 120, 110], [255, 210, 160]], // coral
];

const mix = (a, b, t) => a + (b - a) * t;

/** One RGBA picture: a diagonal gradient, slow waves of the accent, a vignette; `f` moves the waves. */
function paint(width, height, pal, f) {
  const [a, b, c] = pal, px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height, t = Math.min(1, Math.max(0, u * 0.65 + v * 0.35));
    const w = 0.5 + 0.5 * Math.sin(u * 9 + Math.sin(v * 5 + f * 0.7) * 2 + f);
    const k = Math.pow(w, 6) * 0.55;
    const vig = 1 - 0.35 * ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2;
    const o = (y * width + x) * 4;
    for (let i = 0; i < 3; i++) px[o + i] = Math.max(0, Math.min(255, Math.round(mix(mix(a[i], b[i], t), c[i], k) * vig)));
    px[o + 3] = 255;
  }
  return px;
}

/**
 * A HAP movie (bytes) of `frames` pictures of palette `palette`, each shown `secondsPerFrame` seconds.
 * @param {{width?:number, height?:number, frames?:number, secondsPerFrame?:number, palette?:number}} [o]
 */
export function demoHap({ width = 320, height = 180, frames = 4, secondsPerFrame = 5, palette = 0 } = {}) {
  const base = makeHap({ width, height, frames, timescale: 10, durations: Array(frames).fill(Math.round(secondsPerFrame * 10)), hap: { compress: false } });
  const bytes = base.bytes.slice();
  const pal = PALETTES[palette % PALETTES.length];
  for (let f = 0; f < frames; f++) {
    const sample = hapFrame(encodeTexture(paint(width, height, pal, f), width, height, 'hap'), 'hap', { compress: false });
    if (sample.length !== base.truth.sizes[f]) throw new Error('demoHap: an uncompressed frame changed size');
    bytes.set(sample, base.truth.offsets[f]);
  }
  return bytes;
}
