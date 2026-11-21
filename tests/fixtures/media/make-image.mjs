// Image fixtures for the format tests, written by functions here (nothing is downloaded or committed): the headers of each
// format Chromium reads with a size the test knows, so the engine's header reader (engine/media/sniff.js) is checked against
// what was written, not against itself; and whole images (PNG, BMP) with the corner markers of make-hap.mjs when a real
// decoder has to read them. TEST-ONLY.

import { encodePng } from '../../../engine/media/png.js';
import { MARKERS } from './make-hap.mjs';

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le16 = (n) => [n & 255, (n >>> 8) & 255];
const be16 = (n) => [(n >>> 8) & 255, n & 255];
const txt = (s) => [...Buffer.from(s, 'latin1')];

/** An RGBA picture w×h: a grey ramp with the four corner markers (8 px) and a half-transparent block in the middle. */
export function markerPicture(w, h, { alphaBlock = true } = {}) {
  const px = new Uint8Array(w * h * 4), M = Math.min(8, w >> 2, h >> 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let c = [60 + ((x * 100 / w) | 0), 60 + ((y * 100 / h) | 0), 90], a = 255;
    const top = y < M, bottom = y >= h - M, left = x < M, right = x >= w - M;
    if (top && left) c = MARKERS.topLeft; else if (top && right) c = MARKERS.topRight; else if (bottom && left) c = MARKERS.bottomLeft; else if (bottom && right) c = MARKERS.bottomRight;
    else if (alphaBlock && x >= (w >> 1) - M && x < (w >> 1) + M && y >= (h >> 1) - M && y < (h >> 1) + M) { c = [255, 255, 255]; a = 128; }
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a;
  }
  return px;
}

/** A complete PNG (RGBA). */
export const pngFile = (w, h, px = markerPicture(w, h)) => new Uint8Array(encodePng(w, h, px, 4));

/** The head of a PNG of any size: signature, IHDR (with bit depth) and, when `animated`, an acTL chunk before IDAT. Not decodable. */
export function pngHead(w, h, { bitDepth = 8, animated = false } = {}) {
  const chunk = (type, data) => [...be32(data.length), ...txt(type), ...data, 0, 0, 0, 0]; // (CRC not checked by a header reader)
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [...be32(w), ...be32(h), bitDepth, 6, 0, 0, 0]),
    ...(animated ? chunk('acTL', [...be32(2), ...be32(0)]) : []), ...chunk('IDAT', [0, 0, 0, 0])]);
}

/** A JPEG head: SOI, an APP1/EXIF segment with `orientation` (little-endian TIFF), SOF0 (or SOF2 progressive) of w×h. */
export function jpegHead(w, h, { orientation = 1, progressive = false } = {}) {
  const tiff = [...txt('II'), 0x2a, 0, ...le32(8), ...le16(1), ...le16(0x0112), ...le16(3), ...le32(1), ...le16(orientation), 0, 0, ...le32(0)];
  const exif = [...txt('Exif'), 0, 0, ...tiff];
  const sof = [8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...be16(exif.length + 2), ...exif, 0xff, progressive ? 0xc2 : 0xc0, ...be16(sof.length + 2), ...sof, 0xff, 0xda, 0, 2]);
}

/** A WebP head: lossy ('VP8 '), lossless ('VP8L') or extended ('VP8X', optionally animated). */
export function webpHead(w, h, kind = 'lossy', { animated = false } = {}) {
  let body;
  if (kind === 'lossy') body = [...txt('VP8 '), ...le32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)];
  else if (kind === 'lossless') body = [...txt('VP8L'), ...le32(5), 0x2f, ...le32((w - 1) | ((h - 1) << 14))];
  else body = [...txt('VP8X'), ...le32(10), animated ? 2 : 0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255];
  return Uint8Array.from([...txt('RIFF'), ...le32(4 + body.length), ...txt('WEBP'), ...body]);
}

/** A GIF with `frames` image descriptors (1 pixel each) on a w×h screen. */
export function gifFile(w, h, frames = 1) {
  const out = [...txt('GIF89a'), ...le16(w), ...le16(h), 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
  for (let i = 0; i < frames; i++) out.push(0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0);
  out.push(0x3b);
  return Uint8Array.from(out);
}

/** A complete 24-bit BMP of w×h (bottom-up rows) with the corner markers: a real image any decoder reads. */
export function bmpFile(w, h) {
  const px = markerPicture(w, h, { alphaBlock: false }), row = (w * 3 + 3) & ~3, size = 54 + row * h, b = Buffer.alloc(size);
  b.write('BM', 0, 'latin1'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3; b[d] = px[s + 2]; b[d + 1] = px[s + 1]; b[d + 2] = px[s]; }
  return new Uint8Array(b);
}

/** An AVIF head: ftyp(avif) + a meta box holding an ispe of w×h. `sequence`: brand avis. Not decodable. */
export function avifHead(w, h, { sequence = false } = {}) {
  const box = (type, data) => [...be32(8 + data.length), ...txt(type), ...data];
  const ftyp = box('ftyp', [...txt(sequence ? 'avis' : 'avif'), 0, 0, 0, 0, ...txt('mif1')]);
  const ispe = box('ispe', [0, 0, 0, 0, ...be32(w), ...be32(h)]);
  return Uint8Array.from([...ftyp, ...box('meta', [0, 0, 0, 0, ...box('iprp', box('ipco', ispe))])]);
}

/** The first bytes of formats we recognise and refuse. */
export const OTHER = {
  heic: Uint8Array.from([...be32(24), ...txt('ftypheic'), 0, 0, 0, 0, ...txt('mif1heic')]),
  tiff: Uint8Array.from([...txt('II'), 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0]),
  psd: Uint8Array.from([...txt('8BPS'), 0, 1, 0, 0, 0, 0, 0, 0]),
  exr: Uint8Array.from([0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0, 0, 0, 0, 0]),
  svg: Uint8Array.from(txt('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')),
  mp3: Uint8Array.from([...txt('ID3'), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  flac: Uint8Array.from([...txt('fLaC'), 0, 0, 0, 0x22, 0, 0, 0, 0]),
  ogg: Uint8Array.from([...txt('OggS'), 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]),
  adts: Uint8Array.from([0xff, 0xf1, 0x50, 0x80, 0, 0x1f, 0xfc, 0, 0, 0]),
  aiff: Uint8Array.from([...txt('FORM'), 0, 0, 0, 4, ...txt('AIFF')]),
  avi: Uint8Array.from([...txt('RIFF'), 0, 0, 0, 0, ...txt('AVI ')]),
  webm: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...txt('webm'), 0, 0]),
  text: Uint8Array.from(txt('hello, this is only a text file')),
};

/** A WAV file: `frames` sample frames of `channels` channels, `bits` bits (8 unsigned, 16/24/32 integer, 32/64 float when `float`), sample(i, c) in [-1, 1]. */
export function wavFile({ frames = 100, channels = 2, rate = 48000, bits = 16, float = false, sample = (i, c) => Math.sin(i * 0.05 + c), extensible = false } = {}) {
  const bps = bits / 8, data = Buffer.alloc(frames * channels * bps);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const v = sample(i, c), o = (i * channels + c) * bps;
    if (float) { if (bits === 32) data.writeFloatLE(v, o); else data.writeDoubleLE(v, o); }
    else if (bits === 8) data[o] = Math.round(v * 127) + 128;
    else if (bits === 16) data.writeInt16LE(Math.round(v * 32767), o);
    else if (bits === 24) { const n = Math.round(v * 8388607); data[o] = n & 255; data[o + 1] = (n >> 8) & 255; data[o + 2] = (n >> 16) & 255; }
    else data.writeInt32LE(Math.round(v * 2147483647), o);
  }
  const fmt = Buffer.alloc(extensible ? 40 : 16);
  fmt.writeUInt16LE(extensible ? 0xfffe : float ? 3 : 1, 0); fmt.writeUInt16LE(channels, 2); fmt.writeUInt32LE(rate, 4); fmt.writeUInt32LE(rate * channels * bps, 8);
  fmt.writeUInt16LE(channels * bps, 12); fmt.writeUInt16LE(bits, 14);
  if (extensible) { fmt.writeUInt16LE(22, 16); fmt.writeUInt16LE(bits, 18); fmt.writeUInt16LE(float ? 3 : 1, 24); }
  const list = Buffer.from('LIST\x04\x00\x00\x00INFO', 'latin1'); // a chunk before data that must be skipped
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + 8 + fmt.length + list.length + 8 + data.length, 4); head.write('WAVE', 8, 'latin1');
  const h2 = Buffer.alloc(8); h2.write('fmt ', 0, 'latin1'); h2.writeUInt32LE(fmt.length, 4);
  const h3 = Buffer.alloc(8); h3.write('data', 0, 'latin1'); h3.writeUInt32LE(data.length, 4);
  return new Uint8Array(Buffer.concat([head, h2, fmt, list, h3, data]));
}
