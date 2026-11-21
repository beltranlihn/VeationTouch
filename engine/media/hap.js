// HAP frames (Vidvox/hap · documentation/HapVideoDRAFT.md): Snappy, HAP sections, the A/B/C compressors (C = chunked
// frames with Decode Instructions) and the FourCC → texture format table.
// Ported from VEATION (Immersive Studio Pro · hap-worker.js), same owner. Environment-neutral ES module: no `node:`
// imports, so the output page serves it as /shared/hap.js to its decode workers.
//
// Errors carry a code before the colon (and in `err.code`) that the interface translates (MEDIA-SERVER.md §4d.3):
//   hapm:          HAP Q Alpha (HapM), not supported in v1
//   not-supported: HAP R / HAP HDR / HAP Alpha-Only (Hap7 / HapH / HapA)
//   not-hap:       another codec (err.codec = FourCC, err.codecName = 'H.264', 'ProRes 422'…)
//   hap-bad:       a HAP frame that does not parse (corrupt or truncated sample)
//   snappy:        a Snappy stream that does not parse
// (mov.js adds no-moov / mov-bad / truncated; pcm.js adds audio-unsupported.)

/** An Error whose message starts with `code:`; extra fields (codec, codecName…) are copied onto it. */
export function codedError(code, detail, extra) {
  const e = new Error(`${code}: ${detail}`);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

// ---------------------------------------------------------------------------------------------- Snappy ("raw" format)

/*
 * Consecutive copies with the SAME offset are MERGED and filled by doubling. In dome material 70 % of the bytes are
 * repeated black DXT blocks (180,000 copies of 16 bytes per 4096² frame): copied one by one they cost 20 ms per HAP Q
 * frame; merged, 7.9 ms. Byte-identical (verified on 180 frames in VEATION; here, tests/media-format.test.mjs).
 */
/**
 * Decompresses the Snappy block in src[p, end) into dst at dOff.
 * @param {Uint8Array} src @param {number} p @param {number} end @param {Uint8Array} dst @param {number} dOff
 * @returns {number} the uncompressed length
 */
export function snappyDecompress(src, p, end, dst, dOff) {
  let n = 0, sh = 0;
  for (;;) {
    if (p >= end) throw codedError('snappy', 'bad length varint');
    const c = src[p++]; n |= (c & 0x7f) << sh; if (!(c & 0x80)) break;
    sh += 7; if (sh > 28) throw codedError('snappy', 'bad length varint');
  }
  n >>>= 0;
  const oEnd = dOff + n; if (oEnd > dst.length) throw codedError('snappy', 'destination too short');
  let o = dOff, rO = 0, rOff = 0, rL = 0; // pending run of copies
  while (p < end) {
    const tag = src[p++], t = tag & 3;
    if (t === 0) {
      if (rL) { flush(dst, rO, rOff, rL); rL = 0; }
      let len = tag >>> 2;
      if (len >= 60) { const nb = len - 59; len = 0; for (let i = 0; i < nb; i++) len |= src[p + i] << (8 * i); len >>>= 0; p += nb; }
      len += 1;
      if (p + len > end || o + len > oEnd) throw codedError('snappy', 'literal out of range');
      if (len < 32) { for (let i = 0; i < len; i++) dst[o + i] = src[p + i]; } else dst.set(src.subarray(p, p + len), o);
      p += len; o += len; continue;
    }
    let len, off;
    if (t === 1) { len = ((tag >>> 2) & 7) + 4; off = ((tag >>> 5) << 8) | src[p++]; }
    else if (t === 2) { len = (tag >>> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
    else { len = (tag >>> 2) + 1; off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; p += 4; }
    if (p > end || off === 0 || off > o - dOff || o + len > oEnd) throw codedError('snappy', 'copy out of range');
    if (rL && off === rOff && rO + rL === o) { rL += len; o += len; continue; } // the same periodic run goes on
    if (rL) flush(dst, rO, rOff, rL);
    rO = o; rOff = off; rL = len; o += len;
  }
  if (rL) flush(dst, rO, rOff, rL);
  if (o !== oEnd) throw codedError('snappy', `length ${o - dOff} != ${n}`);
  return n;
}

/*
 * Fills [o, o+L) with the periodic pattern of period `off` that starts at o-off. Each `copyWithin` doubles what is
 * already written, so a 16 KB run is ~10 calls instead of 16,000 loop turns.
 */
function flush(dst, o, off, L) {
  const s = o - off;
  if (L <= 48) { for (let i = 0; i < L; i++) dst[o + i] = dst[s + i]; return; }
  if (off >= L) { dst.copyWithin(o, s, s + L); return; }
  if (off < 8) {
    const k0 = Math.min(L, off * 8); for (let i = 0; i < k0; i++) dst[o + i] = dst[s + i];
    let d = k0; while (d < L) { const k = Math.min(L - d, d); dst.copyWithin(o + d, o, o + k); d += k; } return;
  }
  let d = 0; while (d < L) { const k = Math.min(L - d, off + d); dst.copyWithin(o + d, s, s + k); d += k; }
}

// ---------------------------------------------------------------------------------------------- FourCC table

/** The three variants FFmpeg, the Adobe exporter (disguise) and VEATION write. `blockBytes` = bytes per 4×4 block. */
export const HAP_FORMATS = Object.freeze({
  Hap1: Object.freeze({ name: 'HAP', tex: 'dxt1', blockBytes: 8, alpha: false }),
  Hap5: Object.freeze({ name: 'HAP Alpha', tex: 'dxt5', blockBytes: 16, alpha: true }),
  HapY: Object.freeze({ name: 'HAP Q', tex: 'ycocg', blockBytes: 16, alpha: false }),
});

const UNSUPPORTED_HAP = { Hap7: 'HAP R', HapH: 'HAP HDR', HapA: 'HAP Alpha-Only' };

/** Video codec names for the messages ("clip.mov" is H.264, not HAP). Unknown FourCCs are shown as they are. */
const CODEC_NAMES = {
  Hap1: 'HAP', Hap5: 'HAP Alpha', HapY: 'HAP Q', HapM: 'HAP Q Alpha', Hap7: 'HAP R', HapH: 'HAP HDR', HapA: 'HAP Alpha-Only',
  avc1: 'H.264', avc3: 'H.264', h264: 'H.264', H264: 'H.264', x264: 'H.264',
  hvc1: 'HEVC', hev1: 'HEVC', dvh1: 'HEVC (Dolby Vision)', dvhe: 'HEVC (Dolby Vision)',
  apco: 'ProRes 422 Proxy', apcs: 'ProRes 422 LT', apcn: 'ProRes 422', apch: 'ProRes 422 HQ', ap4h: 'ProRes 4444', ap4x: 'ProRes 4444 XQ',
  aprn: 'ProRes RAW', aprh: 'ProRes RAW HQ',
  DXD3: 'DXV', DXDI: 'DXV', DXV3: 'DXV', DXV4: 'DXV', DXT1: 'DXV', DXT5: 'DXV',
  AVdn: 'DNxHD', AVdh: 'DNxHR', AVd1: 'DNxHD',
  mp4v: 'MPEG-4', mp2v: 'MPEG-2', xd5c: 'XDCAM', av01: 'AV1', vp08: 'VP8', vp09: 'VP9',
  jpeg: 'Motion JPEG', mjpa: 'Motion JPEG', mjpb: 'Motion JPEG', 'png ': 'PNG', 'rle ': 'Animation', cvid: 'Cinepak',
  'raw ': 'uncompressed video', '2vuy': 'uncompressed video', v210: 'uncompressed video', r210: 'uncompressed video', 'b64a': 'uncompressed video',
  'dvc ': 'DV', dvcp: 'DV', dv5p: 'DV', dvh5: 'DVCPRO HD', cfhd: 'GoPro CineForm', tscc: 'TechSmith',
};

/** A human name for a video FourCC: 'avc1' → 'H.264'. */
export function codecName(fourcc) { return CODEC_NAMES[fourcc] || String(fourcc).trim() || 'unknown'; }

/**
 * The texture format of a supported HAP FourCC, or a coded error for everything else.
 * @param {string} fourcc @returns {{name:string, tex:'dxt1'|'dxt5'|'ycocg', blockBytes:number, alpha:boolean}}
 */
export function hapFormat(fourcc) {
  const f = HAP_FORMATS[fourcc];
  if (f) return f;
  const extra = { codec: fourcc, codecName: codecName(fourcc) };
  if (fourcc === 'HapM') throw codedError('hapm', 'HAP Q Alpha (HapM) is not supported', extra);
  if (UNSUPPORTED_HAP[fourcc]) throw codedError('not-supported', `${UNSUPPORTED_HAP[fourcc]} (${fourcc}) is not supported`, extra);
  throw codedError('not-hap', `${extra.codecName} (${fourcc}), not HAP`, extra);
}

/** Bytes of the DXT texture of a W×H frame: the coded size is rounded up to whole 4×4 blocks. */
export function textureBytes(width, height, blockBytes) {
  return Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes;
}

// ---------------------------------------------------------------------------------------------- HAP sections

/*
 * Header: 3 bytes of size LE + 1 of type; if the size is 0, 4 more bytes of size follow (8-byte header). An
 * uncompressed 4096² HAP Q frame is 16,777,216 bytes, one more than 24 bits hold: there the long header is mandatory.
 * Type = high nibble (A uncompressed · B Snappy · C "see Decode Instructions") + low nibble (texture format).
 */
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** One section header at b[o]: {size, type, hl (header length)}; throws if it does not fit in [o, end). */
export function hapSection(b, o, end) {
  if (o + 4 > end) throw codedError('hap-bad', 'section header beyond the sample');
  let size = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); const type = b[o + 3]; let hl = 4;
  if (size === 0) { if (o + 8 > end) throw codedError('hap-bad', 'long header beyond the sample'); size = u32le(b, o + 4); hl = 8; }
  if (o + hl + size > end) throw codedError('hap-bad', 'section longer than the sample');
  return { size, type, hl };
}

/** Low nibble of a frame section type → texture. The three FFmpeg encodes (Hap1, Hap5, HapY). */
export const TEX = Object.freeze({ 0xB: 'dxt1', 0xE: 'dxt5', 0xF: 'ycocg' });
const UNSUPPORTED_TEX = { 0xC: 'HAP R (BC7)', 0x1: 'HAP Alpha-Only (BC4)', 0x2: 'HAP HDR (BC6H)', 0x3: 'HAP HDR (BC6H)' };

/**
 * Decodes the HAP frame in b[o, end) into `out` (the DXT texture, blocks in row-major order, block row 0 = TOP of the
 * image). `out` must hold the whole texture.
 * @param {Uint8Array} b @param {number} o @param {number} end @param {Uint8Array} out
 * @returns {{fmt:'dxt1'|'dxt5'|'ycocg', len:number}} len = texture bytes written
 */
export function hapDecode(b, o, end, out) {
  const s = hapSection(b, o, end), data = o + s.hl, dEnd = data + s.size;
  if (s.type === 0x0D) throw codedError('hapm', 'HAP Q Alpha (HapM) is not supported');
  const comp = s.type >> 4, fmt = TEX[s.type & 15];
  if (!fmt) {
    const u = UNSUPPORTED_TEX[s.type & 15];
    if (u) throw codedError('not-supported', `${u} is not supported`);
    throw codedError('hap-bad', `section type 0x${s.type.toString(16)}`);
  }
  if (comp === 0xA) {
    if (s.size > out.length) throw codedError('hap-bad', 'texture larger than expected');
    out.set(b.subarray(data, dEnd), 0); return { fmt, len: s.size };
  }
  if (comp === 0xB) return { fmt, len: snappyDecompress(b, data, dEnd, out, 0) };
  if (comp === 0xC) {
    const di = hapSection(b, data, dEnd); if (di.type !== 0x01) throw codedError('hap-bad', 'the Decode Instructions container is missing');
    let q = data + di.hl; const qEnd = q + di.size; let comps = null, sizes = null, offs = null;
    while (q < qEnd) {
      const ss = hapSection(b, q, qEnd), sd = q + ss.hl;
      if (ss.type === 0x02) comps = b.subarray(sd, sd + ss.size);
      else if (ss.type === 0x03) { sizes = []; for (let i = 0; i + 4 <= ss.size; i += 4) sizes.push(u32le(b, sd + i)); }
      else if (ss.type === 0x04) { offs = []; for (let i = 0; i + 4 <= ss.size; i += 4) offs.push(u32le(b, sd + i)); }
      q = sd + ss.size;
    }
    if (!comps || !sizes || comps.length !== sizes.length || (offs && offs.length !== sizes.length)) throw codedError('hap-bad', 'inconsistent chunk tables');
    const base = qEnd; let pos = base, w = 0; // chunk offsets count from the end of the Decode Instructions
    for (let i = 0; i < sizes.length; i++) {
      const cs = offs ? base + offs[i] : pos, ce = cs + sizes[i];
      if (ce > dEnd) throw codedError('hap-bad', 'chunk outside the section');
      if (comps[i] === 0x0A) {
        if (w + sizes[i] > out.length) throw codedError('hap-bad', 'texture larger than expected');
        out.set(b.subarray(cs, ce), w); w += sizes[i];
      } else if (comps[i] === 0x0B) w += snappyDecompress(b, cs, ce, out, w);
      else throw codedError('hap-bad', `chunk compressor 0x${comps[i].toString(16)}`);
      pos = ce;
    }
    return { fmt, len: w };
  }
  throw codedError('hap-bad', `compressor 0x${comp.toString(16)}`);
}

/**
 * Decodes one sample of a W×H HAP movie and checks its size against the FourCC.
 * @param {Uint8Array} sample the sample bytes (from the index offsets/sizes) @param {string} fourcc
 * @param {number} width @param {number} height @param {Uint8Array} [out] reused between frames when large enough
 * @returns {{tex:'dxt1'|'dxt5'|'ycocg', data:Uint8Array, width:number, height:number, blocksX:number, blocksY:number}}
 */
export function decodeFrame(sample, fourcc, width, height, out) {
  const f = hapFormat(fourcc);
  const need = textureBytes(width, height, f.blockBytes);
  if (!out || out.length < need) out = new Uint8Array(need);
  const r = hapDecode(sample, 0, sample.length, out);
  if (r.fmt !== f.tex) throw codedError('hap-bad', `a ${fourcc} movie holds a ${r.fmt} frame`);
  if (r.len !== need) throw codedError('hap-bad', `texture of ${r.len} bytes; expected ${need}`);
  return { tex: f.tex, data: out.subarray(0, need), width, height, blocksX: Math.ceil(width / 4), blocksY: Math.ceil(height / 4) };
}
