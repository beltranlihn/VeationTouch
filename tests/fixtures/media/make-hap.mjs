// Generator of tiny HAP .mov files for the tests (no FFmpeg): HAP / HAP Alpha / HAP Q, chunked or not, Snappy or raw,
// with or without PCM audio in every supported format, plus fakes (HapM, Hap7, avc1, AAC) for the error paths.
// The encoder half is ported from VEATION (Immersive Studio Pro · app.js › snappyCompress, hapSection, hapFrame,
// movBuild, movFtyp, _stsdPCM, audioPCM16), same owner; the DXT compression, done there on the GPU, is a small CPU
// encoder here. TEST-ONLY: none of this ships in the app. Files are generated at test time; never commit media.
//
// Every frame carries, so later phases (F6 player) can check frame index and orientation:
//   - corner markers, 8×8 px: top-left RED, top-right GREEN, bottom-left BLUE, bottom-right WHITE
//   - a frame-number stripe: STRIPE_BITS cells across the middle rows, LSB first from the left, white = 1, black = 0
//     (layout(width, height) gives the geometry; readStripe(getPixel, width, height) reads it back)
// `makeHap` returns the file bytes AND the truth (texture of every frame, sample offsets/sizes/times, the expected
// audio samples) so the tests compare the parser against what was written, not against itself.

import fs from 'node:fs';

// ---------------------------------------------------------------------------------------------- bytes

export function u8cat(list) { let n = 0; for (const a of list) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of list) { o.set(a, p); p += a.length; } return o; }

// ---------------------------------------------------------------------------------------------- Snappy (compressor)

/* Raw block format (not the framed stream): varint uncompressed length, then literal/copy tags. Mirrors the reference
   CompressFragment — the input is walked in 64 KB fragments so a back-reference always fits the 2-byte copy form. */
export function snappyCompress(src) {
  const n = src.length, out = new Uint8Array(32 + n + Math.ceil(n / 6)); let op = 0, v = n;
  while (v >= 128) { out[op++] = (v & 127) | 128; v = Math.floor(v / 128); } out[op++] = v;
  for (let bs = 0; bs < n; bs += 65536) op = snapFrag(src, bs, Math.min(65536, n - bs), out, op);
  return out.subarray(0, op);
}
function snapFrag(src, base, len, out, op) {
  const end = base + len;
  const emitLit = (s, l) => {
    if (l <= 0) return; const m = l - 1;
    if (m < 60) out[op++] = m << 2;
    else { let nb = 0, x = m; while (x > 0) { nb++; x >>>= 8; } out[op++] = (59 + nb) << 2; x = m; for (let i = 0; i < nb; i++) { out[op++] = x & 255; x >>>= 8; } }
    out.set(src.subarray(s, s + l), op); op += l;
  };
  const emitCopy = (off, l) => { // long matches become several copies with the SAME offset: the decoder's run merging
    while (l >= 68) { out[op++] = (63 << 2) | 2; out[op++] = off & 255; out[op++] = (off >>> 8) & 255; l -= 64; }
    if (l > 64) { out[op++] = (59 << 2) | 2; out[op++] = off & 255; out[op++] = (off >>> 8) & 255; l -= 60; }
    if (l >= 4 && l <= 11 && off < 2048) { out[op++] = 1 | ((l - 4) << 2) | (((off >>> 8) & 7) << 5); out[op++] = off & 255; }
    else { out[op++] = 2 | ((l - 1) << 2); out[op++] = off & 255; out[op++] = (off >>> 8) & 255; }
  };
  if (len < 15) { emitLit(base, len); return op; }
  let tsz = 256, shift = 24; while (tsz < len && tsz < 16384) { tsz <<= 1; shift--; }
  const tab = new Int32Array(tsz).fill(base), mask = tsz - 1;
  const ld = (i) => (src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)) >>> 0;
  const hs = (x) => (Math.imul(x, 0x1e35a7bd) >>> shift) & mask;
  const limit = end - 15;
  let ip = base + 1, anchor = base, nextHash = hs(ld(ip)), done = false;
  while (!done) {
    let skip = 32, nextIp = ip, cand = base;
    for (;;) {
      ip = nextIp; const h = nextHash; nextIp = ip + (skip >>> 5); skip++;
      if (nextIp > limit) { done = true; break; }
      nextHash = hs(ld(nextIp)); cand = tab[h]; tab[h] = ip;
      if (cand < ip && ld(ip) === ld(cand)) break; // cand < ip: a zero offset would be an invalid copy tag
    }
    if (done) break;
    emitLit(anchor, ip - anchor);
    for (;;) {
      const bip = ip; let m = 4;
      while (ip + m < end && src[cand + m] === src[ip + m]) m++;
      ip += m; emitCopy(bip - cand, m); anchor = ip;
      if (ip > limit) { done = true; break; }
      tab[hs(ld(ip - 1))] = ip - 1;
      const h = hs(ld(ip)); cand = tab[h]; tab[h] = ip;
      if (cand >= ip || ld(ip) !== ld(cand)) break;
    }
    if (done) break;
    nextHash = hs(ld(ip + 1)); ip++;
  }
  emitLit(anchor, end - anchor);
  return op;
}

// ---------------------------------------------------------------------------------------------- HAP frames

/* Section type values are NOT sequential: 0xAB/0xBB/0xCB = DXT1, 0xAE/0xBE/0xCE = DXT5, 0xAF/0xBF/0xCF = scaled YCoCg. */
export const HAP_FMT = {
  hap: { fourcc: 'Hap1', tex: 'dxt1', depth: 24, bpb: 8, none: 0xab, snappy: 0xbb, chunked: 0xcb },
  hapa: { fourcc: 'Hap5', tex: 'dxt5', depth: 32, bpb: 16, none: 0xae, snappy: 0xbe, chunked: 0xce },
  hapq: { fourcc: 'HapY', tex: 'ycocg', depth: 24, bpb: 16, none: 0xaf, snappy: 0xbf, chunked: 0xcf },
};

/** Section header: 4 bytes (24-bit size + type), or 8 when the size needs more (or `long` asks for it). */
export function hapSection(type, payload, long = false) {
  const n = payload.length;
  if (n < 0x1000000 && !long) { const h = new Uint8Array(4); h[0] = n & 255; h[1] = (n >>> 8) & 255; h[2] = (n >>> 16) & 255; h[3] = type; return [h, payload]; }
  const h = new Uint8Array(8); h[3] = type; h[4] = n & 255; h[5] = (n >>> 8) & 255; h[6] = (n >>> 16) & 255; h[7] = (n >>> 24) & 255; return [h, payload];
}

/**
 * One HAP frame from a DXT texture.
 * @param {Uint8Array} tex @param {'hap'|'hapa'|'hapq'} fmt
 * @param {{chunks?:number, compress?:boolean, offsetTable?:boolean, reverse?:boolean, longHeader?:boolean}} [o]
 *   chunks: split into N chunks on block boundaries (Decode Instructions); compress: Snappy (else raw);
 *   offsetTable: write the 0x04 chunk-offset table; reverse: store the chunks backwards (only an offset table finds them)
 */
export function hapFrame(tex, fmt, o = {}) {
  const F = HAP_FMT[fmt], bpb = F.bpb, compress = o.compress !== false;
  const nb = Math.floor(tex.length / bpb); // split on BLOCK boundaries so every chunk is whole blocks
  const want = Math.max(1, Math.min(64, o.chunks | 0 || 1));
  const per = Math.max(1, Math.ceil(nb / want)), real = Math.ceil(nb / per);
  const comp = [];
  for (let i = 0; i < real; i++) {
    const raw = tex.subarray(i * per * bpb, Math.min(tex.length, (i + 1) * per * bpb));
    const c = compress ? snappyCompress(raw) : null;
    comp.push(c && c.length < raw.length ? { d: c, t: 0x0b } : { d: raw, t: 0x0a }); // incompressible → raw, like the reference encoder
  }
  if (real === 1 && !o.offsetTable) return u8cat(hapSection(comp[0].t === 0x0b ? F.snappy : F.none, comp[0].d, o.longHeader));
  const ct = Uint8Array.from(comp.map((c) => c.t)); // 0x02 compressor table
  const szb = new Uint8Array(real * 4), dv = new DataView(szb.buffer); // 0x03 size table (COMPRESSED sizes)
  comp.forEach((c, i) => dv.setUint32(i * 4, c.d.length, true));
  const order = comp.map((_, i) => i); if (o.reverse) order.reverse();
  const parts = [hapSection(0x02, ct), hapSection(0x03, szb)];
  if (o.offsetTable || o.reverse) {
    const offs = new Uint8Array(real * 4), ov = new DataView(offs.buffer); let p = 0;
    for (const i of order) { ov.setUint32(i * 4, p, true); p += comp[i].d.length; }
    parts.push(hapSection(0x04, offs));
  }
  const di = u8cat(parts.flat());
  const inner = u8cat([...hapSection(0x01, di), ...order.map((i) => comp[i].d)]); // instructions, then the chunk data
  return u8cat(hapSection(F.chunked, inner, o.longHeader));
}

// ---------------------------------------------------------------------------------------------- picture

export const STRIPE_BITS = 14;
export const MARKERS = { topLeft: [255, 0, 0], topRight: [0, 255, 0], bottomLeft: [0, 0, 255], bottomRight: [255, 255, 255] };

/** Geometry of the markers and the frame-number stripe for a W×H clip (W ≥ 128, H ≥ 24, multiples of 4). */
export function layout(width, height) {
  const cell = Math.floor((width - 32) / STRIPE_BITS / 4) * 4;
  const y0 = Math.floor((height * 3) / 8 / 4) * 4, y1 = Math.ceil((height * 5) / 8 / 4) * 4;
  return { marker: 8, stripe: { x0: 16, cell, y0, y1, bits: STRIPE_BITS } };
}

/** The source RGBA picture of frame f (before DXT). Background: a colour per 16×4 px band (4 equal DXT blocks, so Snappy
 *  finds copies, as in real material); alpha 128 on the right half. */
export function picture(f, width, height) {
  const px = new Uint8Array(width * height * 4), L = layout(width, height), S = L.stripe, M = L.marker;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bx = x >> 2, by = y >> 2, o = (y * width + x) * 4;
    let c = [40 + (((bx >> 2) * 7) % 120), 40 + ((by * 10) % 100), 60 + ((((bx >> 2) + f) % 8) * 8)], a = x >= width / 2 ? 128 : 255;
    if (y >= S.y0 && y < S.y1 && x >= S.x0 && x < S.x0 + S.cell * S.bits) {
      const bit = ((f >> Math.floor((x - S.x0) / S.cell)) & 1); c = bit ? [255, 255, 255] : [0, 0, 0]; a = 255;
    }
    const top = y < M, bottom = y >= height - M, left = x < M, right = x >= width - M;
    if (top && left) { c = MARKERS.topLeft; a = 255; } else if (top && right) { c = MARKERS.topRight; a = 255; }
    else if (bottom && left) { c = MARKERS.bottomLeft; a = 255; } else if (bottom && right) { c = MARKERS.bottomRight; a = 255; }
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a;
  }
  return px;
}

/** Reads the frame number back from any rendering of the picture: getPixel(x, y) → [r, g, b] in the clip's pixels. */
export function readStripe(getPixel, width, height) {
  const S = layout(width, height).stripe; let f = 0;
  for (let b = 0; b < S.bits; b++) {
    const [r, g, bl] = getPixel(S.x0 + b * S.cell + S.cell / 2, (S.y0 + S.y1) / 2);
    if (r + g + bl > 384) f |= 1 << b;
  }
  return f;
}

// ---------------------------------------------------------------------------------------------- DXT (CPU, test-grade)

const to565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const from565 = (v) => { const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31; return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]; };

/** A colour block (8 bytes) for 16 RGB texels: endpoints = extremes, c0 > c1 (4-colour mode in BC1 and BC3 alike). */
function colorBlock(t /* 16×[r,g,b] */, out, o) {
  let lo = 0, hi = 0; const lum = (p) => p[0] * 2 + p[1] * 4 + p[2];
  for (let i = 1; i < 16; i++) { if (lum(t[i]) < lum(t[lo])) lo = i; if (lum(t[i]) > lum(t[hi])) hi = i; }
  let c0 = to565(...t[hi]), c1 = to565(...t[lo]);
  if (c0 < c1) [c0, c1] = [c1, c0];
  let idx = 0;
  if (c0 !== c1) {
    const a = from565(c0), b = from565(c1);
    const pal = [a, b, a.map((v, i) => Math.round((2 * v + b[i]) / 3)), a.map((v, i) => Math.round((v + 2 * b[i]) / 3))];
    for (let i = 0; i < 16; i++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < 4; k++) { const d = (t[i][0] - pal[k][0]) ** 2 + (t[i][1] - pal[k][1]) ** 2 + (t[i][2] - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
      idx |= best << (2 * i);
    }
  }
  out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
  out[o + 4] = idx & 255; out[o + 5] = (idx >>> 8) & 255; out[o + 6] = (idx >>> 16) & 255; out[o + 7] = (idx >>> 24) & 255;
}

/** A BC3 alpha block (8 bytes) for 16 alpha values: a0 = max > a1 = min (8-value mode). */
function alphaBlock(a, out, o) {
  const a0 = Math.max(...a), a1 = Math.min(...a);
  let lo = 0, hi = 0;
  if (a0 !== a1) {
    const pal = [a0, a1]; for (let i = 1; i < 7; i++) pal.push(Math.round(((7 - i) * a0 + i * a1) / 7));
    for (let i = 0; i < 16; i++) {
      let best = 0; for (let k = 1; k < 8; k++) if (Math.abs(a[i] - pal[k]) < Math.abs(a[i] - pal[best])) best = k;
      if (i < 8) lo |= best << (3 * i); else hi |= best << (3 * (i - 8));
    }
  }
  out[o] = a0; out[o + 1] = a1;
  out[o + 2] = lo & 255; out[o + 3] = (lo >>> 8) & 255; out[o + 4] = (lo >>> 16) & 255;
  out[o + 5] = hi & 255; out[o + 6] = (hi >>> 8) & 255; out[o + 7] = (hi >>> 16) & 255;
}

/** RGB → scaled YCoCg texel for HAP Q: [Co·s + 128, Cg·s + 128, (s-1)·8, Y] (inverse of Vidvox ScaledCoCgYToRGBA). */
function ycocg(r, g, b, s) {
  const y = (r + 2 * g + b) / 4, co = (r - b) / 2, cg = (-r + 2 * g - b) / 4;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * s + 128)));
  return [c(co), c(cg), (s - 1) * 8, Math.round(y)];
}

/** The DXT texture of an RGBA picture (row 0 = top → block row 0 = top). */
export function encodeTexture(px, width, height, fmt) {
  const F = HAP_FMT[fmt], bw = Math.ceil(width / 4), bh = Math.ceil(height / 4), out = new Uint8Array(bw * bh * F.bpb);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const t = [], a = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = Math.min(width - 1, bx * 4 + i), y = Math.min(height - 1, by * 4 + j), o = (y * width + x) * 4;
      t.push([px[o], px[o + 1], px[o + 2]]); a.push(px[o + 3]);
    }
    const o = (by * bw + bx) * F.bpb;
    if (fmt === 'hap') colorBlock(t, out, o);
    else if (fmt === 'hapa') { alphaBlock(a, out, o); colorBlock(t, out, o + 8); }
    else { // the largest scale that keeps Co and Cg in range: 1, 2 or 4
      let m = 0; for (const [r, g, b] of t) m = Math.max(m, Math.abs((r - b) / 2), Math.abs((-r + 2 * g - b) / 4));
      const s = m < 31 ? 4 : m < 63 ? 2 : 1;
      const q = t.map(([r, g, b]) => ycocg(r, g, b, s));
      alphaBlock(q.map((v) => v[3]), out, o); colorBlock(q.map((v) => v.slice(0, 3)), out, o + 8);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- audio

/** The known ramp: integer k(i, c) in [-32768, 32767], so every byte of every format is exercised (sign included). */
export const rampK = (i, c) => ((i * 977 + c * 12011 + 5) % 65536) - 32768;

const AUDIO = { // bits, float, default little-endian, the sound description version FFmpeg would write
  sowt: { bits: 16, le: true, version: 0 }, twos: { bits: 16, le: false, version: 0 },
  in24: { bits: 24, le: false, version: 1 }, in32: { bits: 32, le: false, version: 1 },
  fl32: { bits: 32, float: true, le: false, version: 1 }, fl64: { bits: 64, float: true, le: false, version: 1 },
  lpcm: { bits: 16, le: true, version: 2 },
};

/** Encodes frames [from, to) of the ramp; returns the bytes and the floats a correct reader must give back. */
function audioBytes(a, from, to) {
  const bps = a.bits / 8, n = (to - from) * a.channels, out = new Uint8Array(n * bps), dv = new DataView(out.buffer), exp = new Float32Array(n);
  for (let i = from, p = 0, e = 0; i < to; i++) for (let c = 0; c < a.channels; c++, p += bps, e++) {
    const k = rampK(i, c);
    if (a.float) { const v = k / 32768; if (a.bits === 32) dv.setFloat32(p, v, a.le); else dv.setFloat64(p, v, a.le); exp[e] = v; }
    else if (a.bits === 8) { dv.setInt8(p, k >> 8); exp[e] = (k >> 8) / 128; }
    else if (a.bits === 16) { dv.setInt16(p, k, a.le); exp[e] = k / 32768; }
    else if (a.bits === 24) { const v = (k * 256) & 0xffffff; if (a.le) { out[p] = v & 255; out[p + 1] = (v >> 8) & 255; out[p + 2] = v >> 16; } else { out[p] = v >> 16; out[p + 1] = (v >> 8) & 255; out[p + 2] = v & 255; } exp[e] = (k * 256) / 8388608; }
    else { dv.setInt32(p, k * 65536, a.le); exp[e] = (k * 65536) / 2147483648; }
  }
  return { bytes: out, exp };
}

// ---------------------------------------------------------------------------------------------- QuickTime writer

/* Big-endian atoms. ftyp, a 64-bit mdat, then the moov LAST (as FFmpeg writes it) unless `moovFirst`. */
const fcc = (s) => { const u = new Uint8Array(4); for (let i = 0; i < 4; i++) u[i] = s.charCodeAt(i); return u; };
const atom = (type, parts) => { let n = 8; for (const p of parts) n += p.length; const h = new Uint8Array(8); new DataView(h.buffer).setUint32(0, n >>> 0); h.set(fcc(type), 4); return u8cat([h, ...parts]); };
const bytes = (n, fill) => { const b = new Uint8Array(n); const dv = new DataView(b.buffer); if (fill) fill(dv, b); return b; };
const MATRIX = bytes(36, (dv) => { dv.setUint32(0, 0x00010000); dv.setUint32(16, 0x00010000); dv.setUint32(32, 0x40000000); });
const hdlr = (ctype, subtype, name) => { const nm = new TextEncoder().encode(name); return atom('hdlr', [bytes(25 + nm.length, (dv, b) => { b.set(fcc(ctype), 4); b.set(fcc(subtype), 8); b[24] = nm.length; b.set(nm, 25); })]); };
const dinf = () => atom('dinf', [atom('dref', [bytes(8, (dv) => dv.setUint32(4, 1)), bytes(12, (dv, b) => { dv.setUint32(0, 12); b.set(fcc('url '), 4); dv.setUint32(8, 1); })])]);
const stts = (e) => atom('stts', [bytes(8 + e.length * 8, (dv) => { dv.setUint32(4, e.length); e.forEach((x, i) => { dv.setUint32(8 + i * 8, x[0]); dv.setUint32(12 + i * 8, x[1]); }); })]);
const stsc = (e) => atom('stsc', [bytes(8 + e.length * 12, (dv) => { dv.setUint32(4, e.length); e.forEach((x, i) => { dv.setUint32(8 + i * 12, x[0]); dv.setUint32(12 + i * 12, x[1]); dv.setUint32(16 + i * 12, x[2]); }); })]);
const stszTab = (s) => atom('stsz', [bytes(12 + s.length * 4, (dv) => { dv.setUint32(8, s.length); s.forEach((x, i) => dv.setUint32(12 + i * 4, x)); })]);
const stszFix = (sz, n) => atom('stsz', [bytes(12, (dv) => { dv.setUint32(4, sz); dv.setUint32(8, n); })]);
const co64 = (o) => atom('co64', [bytes(8 + o.length * 8, (dv) => { dv.setUint32(4, o.length); o.forEach((x, i) => { dv.setUint32(8 + i * 8, Math.floor(x / 4294967296)); dv.setUint32(12 + i * 8, x >>> 0); }); })]);
const stco = (o) => atom('stco', [bytes(8 + o.length * 4, (dv) => { dv.setUint32(4, o.length); o.forEach((x, i) => dv.setUint32(8 + i * 4, x)); })]);
const mvhd = (ts, dur, nextId) => atom('mvhd', [u8cat([bytes(20, (dv) => { dv.setUint32(12, ts); dv.setUint32(16, dur); }), bytes(4, (dv) => dv.setUint32(0, 0x00010000)), bytes(2, (dv) => dv.setUint16(0, 0x0100)), new Uint8Array(10), MATRIX, new Uint8Array(24), bytes(4, (dv) => dv.setUint32(0, nextId))])]);
const tkhd = (id, dur, w, h, vol) => atom('tkhd', [u8cat([bytes(24, (dv) => { dv.setUint32(0, 3); dv.setUint32(12, id); dv.setUint32(20, dur); }), new Uint8Array(8), bytes(8, (dv) => dv.setUint16(4, vol)), MATRIX, bytes(8, (dv) => { dv.setUint32(0, w * 65536); dv.setUint32(4, h * 65536); })])]);
const mdhd = (ts, dur) => atom('mdhd', [bytes(24, (dv) => { dv.setUint32(12, ts); dv.setUint32(16, dur); dv.setUint16(20, 0x55c4); })]);
const elst = (entries) => atom('edts', [atom('elst', [bytes(8 + entries.length * 12, (dv) => { dv.setUint32(4, entries.length); entries.forEach((e, i) => { dv.setUint32(8 + i * 12, e[0]); dv.setInt32(12 + i * 12, e[1]); dv.setUint32(16 + i * 12, 0x00010000); }); })])]);
const stsdVideo = (fourcc, w, h, depth) => {
  const cn = new TextEncoder().encode('Hap');
  const e = bytes(86, (dv, b) => { dv.setUint32(0, 86); b.set(fcc(fourcc), 4); dv.setUint16(14, 1); dv.setUint32(28, 0x200); dv.setUint16(32, w); dv.setUint16(34, h); dv.setUint32(36, 0x00480000); dv.setUint32(40, 0x00480000); dv.setUint16(48, 1); b[50] = cn.length; b.set(cn, 51); dv.setUint16(82, depth); dv.setInt16(84, -1); });
  return atom('stsd', [bytes(8, (dv) => dv.setUint32(4, 1)), e]);
};
/** Sound description v0 / v1 / v2 (+ `enda` inside `wave`, or directly, for little-endian in24/in32/fl32/fl64). */
function stsdSound(a) {
  const bps = a.bits / 8; let head, ext = [];
  if (a.version === 2) {
    const flags = (a.float ? 1 : 0) | (a.le ? 0 : 2) | (a.float ? 0 : 4) | 8; // float · big-endian · signed · packed
    head = bytes(72, (dv, b) => { b.set(fcc(a.codec), 4); dv.setUint16(14, 1); dv.setUint16(16, 2); dv.setUint16(24, 3); dv.setUint16(26, 16); dv.setUint16(28, 0xfffe); dv.setUint32(32, 65536); dv.setUint32(36, 72); dv.setFloat64(40, a.rate); dv.setUint32(48, a.channels); dv.setUint32(52, 0x7f000000); dv.setUint32(56, a.bits); dv.setUint32(60, flags); dv.setUint32(64, bps * a.channels); dv.setUint32(68, 1); });
  } else {
    // v0/v1 sample size: FFmpeg writes 16 for every PCM in v1, so the reader must not trust it for in24/in32/fl32/fl64
    head = bytes(a.version === 1 ? 52 : 36, (dv, b) => { b.set(fcc(a.codec), 4); dv.setUint16(14, 1); dv.setUint16(16, a.version); dv.setUint16(24, a.channels); dv.setUint16(26, a.bits === 8 ? 8 : 16); dv.setUint32(32, a.rate * 65536);
      if (a.version === 1) { dv.setUint32(36, 1); dv.setUint32(40, bps); dv.setUint32(44, bps * a.channels); dv.setUint32(48, 2); } });
    const enda = a.le && ['in24', 'in32', 'fl32', 'fl64'].includes(a.codec) ? atom('enda', [bytes(2, (dv) => dv.setUint16(0, 1))]) : null;
    if (a.version === 1) ext = a.endaDirect ? (enda ? [enda] : []) : [atom('wave', [atom('frma', [fcc(a.codec)]), ...(enda ? [enda] : []), new Uint8Array(8)])];
  }
  const entry = u8cat([head, ...ext]); new DataView(entry.buffer).setUint32(0, entry.length);
  return atom('stsd', [bytes(8, (dv) => dv.setUint32(4, 1)), entry]);
}
const rleStsc = (counts) => { const out = []; for (let i = 0; i < counts.length; i++) if (!out.length || out[out.length - 1][1] !== counts[i]) out.push([i + 1, counts[i], 1]); return out; };
const rleStts = (d) => { const out = []; for (const x of d) if (out.length && out[out.length - 1][1] === x) out[out.length - 1][0]++; else out.push([1, x]); return out; };

/**
 * Builds a HAP .mov in memory.
 * @param {object} [o]
 * @param {'hap'|'hapa'|'hapq'} [o.variant] @param {string} [o.fourcc] write another FourCC in stsd (fakes: HapM, Hap7, avc1)
 * @param {number} [o.width] 256 @param {number} [o.height] 32 @param {number} [o.frames] 12 @param {number} [o.fps] 30
 * @param {number[]} [o.durations] per-frame durations in `o.timescale` ticks (variable frame rate)
 * @param {number} [o.timescale] video media timescale
 * @param {object} [o.hap] hapFrame options (chunks, compress, offsetTable, reverse, longHeader)
 * @param {number} [o.perChunk] video samples per mov chunk (2 = the stsc case) @param {'co64'|'stco'} [o.offsets]
 * @param {number} [o.delay] seconds of empty edit before the video (elst)
 * @param {boolean} [o.moovFirst] "fast start": moov before mdat
 * @param {object} [o.audio] {codec, channels=2, rate=8000, le, version, bits, float, endaDirect}; codec 'mp4a' = AAC fake
 * @returns {{bytes:Uint8Array, truth:object}}
 */
export function makeHap(o = {}) {
  const variant = o.variant || 'hap', F = HAP_FMT[variant], W = o.width || 256, H = o.height || 32, N = o.frames ?? 12, fps = o.fps || 30;
  const ts = o.timescale || (o.durations ? 600 : fps), durs = o.durations || Array(N).fill(Math.round(ts / fps));
  const perChunk = o.perChunk || 1;
  const textures = [], samples = [];
  for (let f = 0; f < N; f++) { const t = encodeTexture(picture(f, W, H), W, H, variant); textures.push(t); samples.push(hapFrame(t, variant, o.hap)); }
  const pts = []; { let acc = 0; for (let f = 0; f < N; f++) { pts.push(acc / ts + (o.delay || 0)); acc += durs[f]; } }
  const videoDur = durs.reduce((s, d) => s + d, 0);

  let A = null;
  if (o.audio) {
    const d = AUDIO[o.audio.codec] || { bits: 16, le: false, version: 0 };
    A = { channels: 2, rate: 8000, ...d, ...o.audio };
    if (o.audio.le === undefined) A.le = d.le;
    if (o.audio.version === undefined) A.version = d.version;
  }
  // mdat payload: per mov chunk, its video samples, then the audio frames for that span (interleaved, like VEATION)
  const body = [], vChunkRel = [], aChunkRel = [], aCounts = [], expected = [];
  let pos = 0, aFrom = 0;
  for (let f0 = 0; f0 < N; f0 += perChunk) {
    vChunkRel.push(pos);
    for (let f = f0; f < Math.min(N, f0 + perChunk); f++) { body.push(samples[f]); pos += samples[f].length; }
    if (A) {
      const tEnd = durs.slice(0, Math.min(N, f0 + perChunk)).reduce((s, d) => s + d, 0) / ts;
      const aTo = Math.round(tEnd * A.rate);
      let chunk;
      if (A.codec === 'mp4a') chunk = { bytes: new Uint8Array((aTo - aFrom) * 4).fill(0x21), exp: new Float32Array(0) };
      else chunk = audioBytes(A, aFrom, aTo);
      aChunkRel.push(pos); aCounts.push(aTo - aFrom); body.push(chunk.bytes); pos += chunk.bytes.length; expected.push(chunk.exp); aFrom = aTo;
    }
  }
  const mdatPayload = u8cat(body);
  const ftyp = atom('ftyp', [u8cat([fcc('qt  '), bytes(4, (dv) => dv.setUint32(0, 0x20050300)), fcc('qt  ')])]);
  const mdatHead = bytes(16, (dv, b) => { dv.setUint32(0, 1); b.set(fcc('mdat'), 4); const n = 16 + mdatPayload.length; dv.setUint32(8, Math.floor(n / 4294967296)); dv.setUint32(12, n >>> 0); });

  const TS = 1000, movieDur = Math.round((videoDur / ts + (o.delay || 0)) * TS);
  const offTable = o.offsets === 'stco' ? stco : co64;
  const build = (base) => {
    const vOff = vChunkRel.map((r) => base + r);
    const vStsc = rleStsc(vChunkRel.map((_, c) => Math.min(perChunk, N - c * perChunk)));
    const vStbl = atom('stbl', [stsdVideo(o.fourcc || F.fourcc, W, H, F.depth), stts(rleStts(durs)), stsc(vStsc), stszTab(samples.map((s) => s.length)), offTable(vOff)]);
    const edts = o.delay ? [elst([[Math.round(o.delay * TS), -1], [Math.round((videoDur / ts) * TS), 0]])] : [];
    const vTrak = atom('trak', [tkhd(1, movieDur, W, H, 0), ...edts, atom('mdia', [mdhd(ts, videoDur), hdlr('mhlr', 'vide', 'VideoHandler'),
      atom('minf', [atom('vmhd', [bytes(12, (dv) => dv.setUint32(0, 1))]), hdlr('dhlr', 'alis', 'DataHandler'), dinf(), vStbl])])]);
    const parts = [mvhd(TS, movieDur, A ? 3 : 2), vTrak];
    if (A) {
      const nS = aCounts.reduce((s, x) => s + x, 0), bpf = A.codec === 'mp4a' ? 4 : (A.bits / 8) * A.channels;
      const aStbl = atom('stbl', [stsdSound(A), stts([[nS, 1]]), stsc(rleStsc(aCounts)), stszFix(bpf, nS), offTable(aChunkRel.map((r) => base + r))]);
      parts.push(atom('trak', [tkhd(2, Math.round((nS / A.rate) * TS), 0, 0, 0x0100), atom('mdia', [mdhd(A.rate, nS), hdlr('mhlr', 'soun', 'SoundHandler'),
        atom('minf', [atom('smhd', [new Uint8Array(8)]), hdlr('dhlr', 'alis', 'DataHandler'), dinf(), aStbl])])]));
    }
    return atom('moov', parts);
  };
  let file, base;
  if (o.moovFirst) { const size = build(0).length; base = ftyp.length + size + 16; file = u8cat([ftyp, build(base), mdatHead, mdatPayload]); }
  else { base = ftyp.length + 16; file = u8cat([ftyp, mdatHead, mdatPayload, build(base)]); }

  const offsets = [], sizes = samples.map((s) => s.length);
  vChunkRel.forEach((r, c) => { let p = base + r; for (let f = c * perChunk; f < Math.min(N, (c + 1) * perChunk); f++) { offsets.push(p); p += sizes[f]; } });
  const truth = {
    fourcc: o.fourcc || F.fourcc, tex: F.tex, width: W, height: H, frames: N, timescale: ts, pts, duration: videoDur / ts + (o.delay || 0),
    offsets, sizes, textures, samples, videoChunks: vChunkRel.length,
    audio: A && { ...A, frames: aCounts.reduce((s, x) => s + x, 0), chunks: aCounts.length, chunkFrames: aCounts, samples: u8catF32(expected) },
  };
  return { bytes: file, truth };
}
function u8catF32(list) { let n = 0; for (const a of list) n += a.length; const o = new Float32Array(n); let p = 0; for (const a of list) { o.set(a, p); p += a.length; } return o; }

/** makeHap written to `file`. @returns the truth */
export function writeHap(file, o) { const { bytes: b, truth } = makeHap(o); fs.writeFileSync(file, b); return truth; }
