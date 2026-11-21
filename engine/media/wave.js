// The picture of a sound (the thumbnail of an audio-only clip): its waveform, drawn as bars in the interface's own greys.
// Made here, from the PCM the engine already serves, never in the page and never from the internet: the peaks are read in
// small windows spread along the file (no need to decode all of a long sound), so it costs a few milliseconds a file.
// Pure CPU: no dependencies; png.js writes the file.

import { encodePng } from './png.js';

const BG = [0x1b, 0x1b, 0x1b], MID = [0x6a, 0x6a, 0x6a], TOP = [0x9a, 0x9a, 0x9a], AXIS = [0x33, 0x33, 0x33];
export const WAVE_BARS = 96;     // bars in the picture (the 480 px one draws each 5 px wide, the 160 px one 1.6)
export const WAVE_WINDOW = 4096; // sample frames read for each bar

/** The loudest sample (0–1) of a block of PCM in the encoding the engine serves ('s16le', 'f32le', 's24le', 'u8'…). */
export function peakOf(body, encoding, channels = 1) {
  const m = /^([fsu])(8|16|24|32|64)(le|be)?$/.exec(encoding || '');
  if (!m || !body?.length) return 0;
  const [, type, bits, end] = m, size = bits / 8, le = end !== 'be';
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let max = 0;
  const step = Math.max(1, Math.floor(body.length / size / 2048)) * size; // at most ~2048 samples looked at per window
  for (let o = 0; o + size <= body.length; o += step) {
    let v;
    if (type === 'f') v = size === 4 ? dv.getFloat32(o, le) : dv.getFloat64(o, le);
    else if (type === 'u') v = size === 1 ? (dv.getUint8(o) - 128) / 128 : dv.getUint16(o, le) / 32768 - 1;
    else if (size === 1) v = dv.getInt8(o) / 128;
    else if (size === 2) v = dv.getInt16(o, le) / 32768;
    else if (size === 3) { const x = le ? dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16) : dv.getUint8(o + 2) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o) << 16); v = (x & 0x800000 ? x - 0x1000000 : x) / 8388608; }
    else v = dv.getInt32(o, le) / 2147483648;
    v = Math.abs(v);
    if (v > max) max = v;
  }
  void channels;
  return Math.min(1, max);
}

/** Peaks (0–1, WAVE_BARS of them) → a PNG w × h: mirrored bars on a centre line, the loud ones lighter. */
export function renderWave(peaks, w, h = Math.round((w * 9) / 16)) {
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(BG, i * 3);
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) rgb.set(c, (y * w + x) * 3); };
  const cy = h / 2, n = peaks.length, bw = w / n, gain = 1 / Math.max(0.25, Math.max(...peaks)); // quiet files are lifted, never beyond 4×
  for (let x = 0; x < w; x++) put(x, Math.floor(cy), AXIS);
  for (let i = 0; i < n; i++) {
    const half = Math.max(1, Math.round(Math.min(1, peaks[i] * gain) * (h * 0.42)));
    const x0 = Math.floor(i * bw + bw * 0.18), x1 = Math.max(x0 + 1, Math.floor((i + 1) * bw - bw * 0.18));
    for (let x = x0; x < x1; x++) for (let y = Math.floor(cy) - half; y <= Math.floor(cy) + half; y++) put(x, y, Math.abs(y - cy) > half * 0.62 ? TOP : MID);
  }
  return encodePng(w, h, rgb, 3);
}
