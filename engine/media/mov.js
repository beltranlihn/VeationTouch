// QuickTime (.mov) index: the video track (HAP) and the PCM audio track, read from the `moov` atom only.
// Ported from VEATION (Immersive Studio Pro · hap-worker.js › movIndex), same owner, and extended with the audio track.
// Environment-neutral ES module: no `node:` imports. The caller passes `read(offset, length)` → Uint8Array (a Node
// Buffer is fine), so the same code indexes a file in Node (fs.readSync) and inside the output page's workers
// (served as /shared/mov.js). `movIndexAsync` takes a read that returns a Promise.
//
// What the index holds:
//   video: the first track whose handler is 'vide': FourCC and size (stsd), sizes (stsz), file offsets (stco/co64 +
//          stsc) and the TIME of every sample (stts accumulated, shifted by the edit list). The time is per sample, not
//          i/fps: a variable-rate source gives a variable-rate HAP, and the right frame is the last one whose time ≤ t.
//   audio: the first 'soun' track (the first PCM one if there are several): format from the sound description
//          (versions 0, 1 and 2; `enda` gives the byte order of in24/in32/fl32/fl64), and its chunks (offset, first
//          frame, frame count) so engine/media/pcm.js can read any range of sample frames.
//
// Errors (code before the colon, also in err.code):
//   no-moov:   there is no `moov` atom (FFmpeg writes it LAST: a copy cut short has none) or it is cut short
//   mov-bad:   the index is there but does not parse (a table shorter than its count, no offset table…)
//   not-hap:   not a QuickTime file at all (Matroska, AVI…); describeMovie adds the codec checks of hap.js
//   truncated: (describeMovie) the index is complete but points past the end of the file (a "fast start" copy cut short)

import { codedError, codecName, hapFormat, HAP_FORMATS } from './hap.js';

const MAX_MOOV = 256 * 1024 * 1024;
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => u32(b, o) * 4294967296 + u32(b, o + 4);
const fcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const printable = (b, o) => { for (let i = 0; i < 4; i++) if (!(b[o + i] >= 0x20 && b[o + i] <= 0x7e)) return false; return true; };

// ---------------------------------------------------------------------------------------------- top-level atoms

/** The top-level atom header at `off` (h = its first ≤16 bytes) → {size, type}, or null when it cannot be one. */
function topAtom(h, off, fileSize) {
  if (h.length < 8) return null;
  let size = u32(h, 0); const type = fcc(h, 4);
  if (off === 0 && !printable(h, 4)) { // not an atom: say what the file is instead of "incomplete"
    const what = h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3 ? 'Matroska / WebM'
      : fcc(h, 0) === 'RIFF' ? 'AVI' : 'not a QuickTime movie';
    throw codedError('not-hap', `${what}, not a QuickTime movie`, { codec: null, codecName: what });
  }
  if (size === 1) { if (h.length < 16) return null; size = u64(h, 8); } else if (size === 0) size = fileSize - off;
  if (size < 8) return null;
  if (type === 'moov') {
    if (off + size > fileSize) throw codedError('no-moov', 'the index (moov) is cut short: the file is incomplete');
    if (size > MAX_MOOV) throw codedError('mov-bad', 'oversized moov');
  }
  return { size, type };
}

/**
 * Indexes a QuickTime movie. Reads only the atom headers up to the `moov`, and the `moov` itself.
 * @param {(offset:number, length:number) => Uint8Array} read @param {number} fileSize
 * @returns {MovIndex}
 */
export function movIndex(read, fileSize) {
  let off = 0;
  while (off + 8 <= fileSize) {
    const a = topAtom(read(off, Math.min(16, fileSize - off)), off, fileSize);
    if (!a) break;
    if (a.type === 'moov') return parseMoov(read(off, a.size));
    off += a.size;
  }
  throw codedError('no-moov', 'no index (moov atom): the file is incomplete');
}

/** movIndex with a `read` that returns a Promise (fetch with a Range header, fs.promises…). */
export async function movIndexAsync(read, fileSize) {
  let off = 0;
  while (off + 8 <= fileSize) {
    const a = topAtom(await read(off, Math.min(16, fileSize - off)), off, fileSize);
    if (!a) break;
    if (a.type === 'moov') return parseMoov(await read(off, a.size));
    off += a.size;
  }
  throw codedError('no-moov', 'no index (moov atom): the file is incomplete');
}

/**
 * @typedef {object} MovVideo
 * @property {string} fourcc @property {number} width @property {number} height
 * @property {number} count samples (frames) @property {Float64Array} pts time of each frame (s, edit list applied)
 * @property {number} dur end of the last frame (s) @property {number} fps
 * @property {Float64Array} offsets file offset of each frame @property {Float64Array} sizes bytes of each frame
 * @property {number} timescale @property {number} shift seconds the edit list moves the track by
 *
 * @typedef {object} MovAudio
 * @property {string} codec stsd FourCC ('sowt', 'in24', 'lpcm', 'mp4a'…) @property {number} version sound description
 * @property {boolean} supported PCM we can read @property {string} reason why not, when not
 * @property {string|null} encoding 's16le', 's24be', 'f32le'… @property {number} channels @property {number} rate
 * @property {number} bits @property {boolean} float @property {boolean} signed @property {boolean} littleEndian
 * @property {number} bytesPerSample @property {number} bytesPerFrame all channels of one sample frame
 * @property {number} frames sample frames in the track @property {number} duration (s) @property {number} shift (s)
 * @property {Float64Array} chunkOffsets @property {Float64Array} chunkFirst first frame of each chunk
 * @property {Float64Array} chunkFrames frames in each chunk
 *
 * @typedef {{duration:number, timescale:number, video:MovVideo|null, audio:MovAudio|null, tracks:{handler:string, codec:string}[]}} MovIndex
 */

// ---------------------------------------------------------------------------------------------- moov

/** Parses a whole `moov` atom (header included). Exported for callers that already hold its bytes. */
export function parseMoov(m) {
  if (m.length < 8 || fcc(m, 4) !== 'moov') throw codedError('no-moov', 'no index (moov atom)');
  const kids = (s, e) => {
    const r = []; let p = s;
    while (p + 8 <= e) {
      let sz = u32(m, p); const ty = fcc(m, p + 4); let hl = 8;
      if (sz === 1) { if (p + 16 > e) break; sz = u64(m, p + 8); hl = 16; } else if (sz === 0) sz = e - p;
      if (sz < hl || p + sz > e) break;
      r.push({ ty, s: p + hl, e: p + sz }); p += sz;
    }
    return r;
  };
  const find = (a, ty) => a && kids(a.s, a.e).find((k) => k.ty === ty);
  const path = (a, ...tys) => { for (const ty of tys) a = find(a, ty); return a; };
  const need = (a, n, what) => { if (!a || a.s + n > a.e) throw codedError('mov-bad', `${what} is shorter than it says`); };
  const root = { s: 8, e: m.length };

  let movieTs = 600, movieDur = 0;
  const mvhd = find(root, 'mvhd');
  if (mvhd) { const v1 = m[mvhd.s] === 1; need(mvhd, v1 ? 32 : 20, 'mvhd'); movieTs = u32(m, mvhd.s + (v1 ? 20 : 12)) || 600; movieDur = (v1 ? u64(m, mvhd.s + 24) : u32(m, mvhd.s + 16)) / movieTs; }

  /** Edit list: an initial empty edit (media_time = -1) delays everything; the first edit with media_time ≥ 0 says
   *  where the media starts. FFmpeg writes none for a HAP without `-ss`, but a .mov from another tool can carry one. */
  const editShift = (trak, ts) => {
    const elst = path(trak, 'edts', 'elst'); if (!elst) return 0;
    const v1 = m[elst.s] === 1; need(elst, 8, 'elst'); const n = u32(m, elst.s + 4); need(elst, 8 + n * (v1 ? 20 : 12), 'elst');
    let p = elst.s + 8, delay = 0;
    for (let i = 0; i < n; i++) {
      const segD = v1 ? u64(m, p) : u32(m, p);
      const mt = v1 ? (u32(m, p + 8) | 0) * 4294967296 + u32(m, p + 12) : (u32(m, p + 4) | 0);
      p += v1 ? 20 : 12;
      if (mt < 0) { delay += segD / movieTs; continue; }
      return delay - mt / ts;
    }
    return delay;
  };

  /** Chunk offsets (stco or co64). */
  const chunkOffsets = (stbl) => {
    const stco = find(stbl, 'stco'), co64 = find(stbl, 'co64');
    if (stco) { need(stco, 8, 'stco'); const n = u32(m, stco.s + 4); need(stco, 8 + n * 4, 'stco'); const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = u32(m, stco.s + 8 + i * 4); return r; }
    if (co64) { need(co64, 8, 'co64'); const n = u32(m, co64.s + 4); need(co64, 8 + n * 8, 'co64'); const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = u64(m, co64.s + 8 + i * 8); return r; }
    throw codedError('mov-bad', 'no sample-offset table (stco/co64)');
  };
  /** Samples in each chunk, expanded from the run-length stsc table: [first_chunk (1-based), samples_per_chunk, desc]. */
  const samplesPerChunk = (stbl, nChunks) => {
    const stsc = find(stbl, 'stsc'); need(stsc, 8, 'stsc'); const n = u32(m, stsc.s + 4); need(stsc, 8 + n * 12, 'stsc');
    const r = new Float64Array(nChunks); let k = 0;
    for (let c = 0; c < nChunks; c++) {
      while (k + 1 < n && c + 1 >= u32(m, stsc.s + 8 + (k + 1) * 12)) k++;
      r[c] = n ? u32(m, stsc.s + 12 + k * 12) : 0;
    }
    return r;
  };

  const tracks = [], sounds = [];
  let video = null;
  for (const trak of kids(root.s, root.e).filter((k) => k.ty === 'trak')) {
    const mdia = find(trak, 'mdia'), hdlr = find(mdia, 'hdlr'), mdhd = find(mdia, 'mdhd');
    if (!hdlr || !mdhd) continue;
    need(hdlr, 12, 'hdlr'); const handler = fcc(m, hdlr.s + 8);
    const v1 = m[mdhd.s] === 1; need(mdhd, v1 ? 32 : 20, 'mdhd');
    const ts = u32(m, mdhd.s + (v1 ? 20 : 12)) || 1;
    const stbl = path(mdia, 'minf', 'stbl'), stsd = find(stbl, 'stsd');
    if (!stsd) continue;
    need(stsd, 16, 'stsd');
    const ent = stsd.s + 8, entEnd = Math.min(stsd.e, ent + u32(m, ent)), codec = fcc(m, ent + 4);
    tracks.push({ handler, codec });
    if (handler === 'vide' && !video) {
      // A sample table we cannot read only matters for HAP: anything else must still say "H.264, not HAP".
      try { video = parseVideo(trak, stbl, ts, ent, entEnd, codec); } catch (e) {
        if (HAP_FORMATS[codec]) throw e;
        const z = new Float64Array(0);
        video = { fourcc: codec, width: 0, height: 0, count: 0, pts: z, dur: 0, fps: 0, offsets: z, sizes: z, timescale: ts, shift: 0 };
      }
    } else if (handler === 'soun') sounds.push({ trak, stbl, ts, ent, entEnd, codec });
  }

  function parseVideo(trak, stbl, ts, ent, entEnd, codec) {
    if (entEnd < ent + 36) throw codedError('mov-bad', 'video sample description too short');
    const width = u16(m, ent + 32), height = u16(m, ent + 34);
    const stsz = find(stbl, 'stsz'); need(stsz, 12, 'stsz');
    const fixed = u32(m, stsz.s + 4), count = u32(m, stsz.s + 8);
    if (!fixed) need(stsz, 12 + count * 4, 'stsz');
    const sizes = new Float64Array(count); for (let i = 0; i < count; i++) sizes[i] = fixed || u32(m, stsz.s + 12 + i * 4);
    const cOff = chunkOffsets(stbl), spc = samplesPerChunk(stbl, cOff.length);
    const offsets = new Float64Array(count); let si = 0;
    for (let c = 0; c < cOff.length && si < count; c++) {
      let p = cOff[c];
      for (let j = 0; j < spc[c] && si < count; j++) { offsets[si] = p; p += sizes[si]; si++; }
    }
    if (si < count) throw codedError('mov-bad', 'sample-offset table too short');
    const stts = find(stbl, 'stts'); need(stts, 8, 'stts'); const ne = u32(m, stts.s + 4); need(stts, 8 + ne * 8, 'stts');
    const pts = new Float64Array(count); let acc = 0, idx = 0, lastD = 0;
    for (let e = 0; e < ne && idx < count; e++) {
      const n = u32(m, stts.s + 8 + e * 8), d = u32(m, stts.s + 12 + e * 8); lastD = d;
      for (let j = 0; j < n && idx < count; j++) { pts[idx++] = acc; acc += d; }
    }
    while (idx < count) { pts[idx++] = acc; acc += lastD; }
    // fps from the integer ticks (before the division), so 25 fps is 25 and not 24.999999999999996
    const fps = count > 1 && pts[count - 1] > pts[0] ? ((count - 1) * ts) / (pts[count - 1] - pts[0]) : ts / Math.max(1, lastD);
    const shift = editShift(trak, ts);
    for (let i = 0; i < count; i++) pts[i] = pts[i] / ts + shift;
    const dur = acc / ts + shift;
    return { fourcc: codec, width, height, count, pts, dur, fps, offsets, sizes, timescale: ts, shift };
  }

  const audios = sounds.map((s) => { // an unreadable audio track does not sink the clip: it plays silent, with a warning
    try { return parseSound(s); } catch { return unreadableSound(s.codec); }
  });
  const audio = audios.find((a) => a.supported) || audios[0] || null;

  function parseSound({ trak, stbl, ts, ent, entEnd, codec }) {
    if (entEnd < ent + 36) throw codedError('mov-bad', 'sound description too short');
    const version = u16(m, ent + 16);
    let channels, bits, rate, ext, flags = -1, bytesPerFrame = 0;
    if (version === 2) {
      if (entEnd < ent + 72) throw codedError('mov-bad', 'sound description v2 too short');
      rate = new DataView(m.buffer, m.byteOffset + ent + 40, 8).getFloat64(0);
      channels = u32(m, ent + 48); bits = u32(m, ent + 56); flags = u32(m, ent + 60); bytesPerFrame = u32(m, ent + 64);
      ext = ent + 72;
    } else {
      channels = u16(m, ent + 24); bits = u16(m, ent + 26); rate = u32(m, ent + 32) / 65536; ext = ent + 36;
      if (version === 1) { if (entEnd < ent + 52) throw codedError('mov-bad', 'sound description v1 too short'); bytesPerFrame = u32(m, ent + 44); ext = ent + 52; }
    }
    if (!(rate > 0)) rate = ts; // v0 cannot hold rates above 65535 Hz: the media timescale is the rate
    // `enda` (1 = little-endian) sits in the extensions, usually inside a `wave` atom (FFmpeg) and sometimes directly.
    const extA = { s: ext, e: entEnd };
    const enda = find(extA, 'enda') || path(extA, 'wave', 'enda');
    const endaLE = !!enda && enda.e - enda.s >= 2 && (u16(m, enda.s) & 0xff) === 1;

    // `bits` is the v0/v1 sample size or the v2 constBitsPerChannel. FFmpeg writes 16 there for every v1 PCM, so the
    // FourCC decides for in24/in32/fl32/fl64; only sowt/twos (8 or 16) and lpcm read it.
    let pcm = null, reason = '';
    switch (codec) {
      case 'sowt': pcm = { bits: bits === 8 ? 8 : 16, float: false, le: true, signed: true }; break;
      case 'twos': pcm = { bits: bits === 8 ? 8 : 16, float: false, le: false, signed: true }; break;
      case 'in24': pcm = { bits: 24, float: false, le: endaLE, signed: true }; break;
      case 'in32': pcm = { bits: 32, float: false, le: endaLE, signed: true }; break;
      case 'fl32': pcm = { bits: 32, float: true, le: endaLE, signed: true }; break;
      case 'fl64': pcm = { bits: 64, float: true, le: endaLE, signed: true }; break;
      case 'lpcm': // QuickTime v2: the CoreAudio format flags say what it is (1 float · 2 big-endian · 4 signed · 32 planar)
        if (flags < 0) { reason = 'lpcm without a version 2 description'; break; }
        if (flags & 32) { reason = 'non-interleaved PCM'; break; }
        pcm = { bits, float: !!(flags & 1), le: !(flags & 2), signed: !!(flags & 4) || bits > 8 };
        break;
      default: reason = audioCodecName(codec);
    }
    if (pcm && !(pcm.float ? pcm.bits === 32 || pcm.bits === 64 : [8, 16, 24, 32].includes(pcm.bits))) { reason = `${pcm.bits}-bit ${pcm.float ? 'float' : 'integer'} PCM`; pcm = null; }
    if (pcm && !(channels >= 1 && channels <= 16)) { reason = `${channels} channels`; pcm = null; }
    const bytesPerSample = pcm ? pcm.bits / 8 : 0;
    if (pcm && version === 2 && bytesPerFrame && bytesPerFrame !== channels * bytesPerSample) { reason = 'unpacked PCM'; pcm = null; }

    // Chunks: for PCM the stsc counts are sample frames, and a chunk is frames × bytesPerFrame contiguous bytes.
    const cOff = chunkOffsets(stbl), spc = samplesPerChunk(stbl, cOff.length);
    const chunkFirst = new Float64Array(cOff.length); let frames = 0;
    for (let c = 0; c < cOff.length; c++) { chunkFirst[c] = frames; frames += spc[c]; }
    const stsz = find(stbl, 'stsz');
    if (stsz && stsz.e - stsz.s >= 12) { const n = u32(m, stsz.s + 8); if (n && n < frames) frames = n; } // a shorter sample count wins
    if (!pcm) { // compressed (AAC…): the chunks count packets, not frames; the length comes from stts
      const stts = find(stbl, 'stts'); let ticks = 0;
      if (stts && stts.e - stts.s >= 8) { const ne = u32(m, stts.s + 4); need(stts, 8 + ne * 8, 'stts'); for (let e = 0; e < ne; e++) ticks += u32(m, stts.s + 8 + e * 8) * u32(m, stts.s + 12 + e * 8); }
      frames = Math.round((ticks / ts) * rate);
    }
    return {
      codec, version, supported: !!pcm, reason,
      encoding: pcm ? (pcm.float ? 'f' : pcm.signed ? 's' : 'u') + pcm.bits + (pcm.bits === 8 ? '' : pcm.le ? 'le' : 'be') : null,
      channels, rate, bits: pcm ? pcm.bits : bits, float: !!pcm?.float, signed: pcm ? pcm.signed : true,
      littleEndian: !!pcm?.le, bytesPerSample, bytesPerFrame: pcm ? channels * bytesPerSample : bytesPerFrame,
      frames, duration: frames / rate, shift: editShift(trak, ts), timescale: ts,
      chunkOffsets: cOff, chunkFirst, chunkFrames: spc,
    };
  }

  return { duration: movieDur, timescale: movieTs, video, audio, tracks };
}

function unreadableSound(codec) {
  const z = new Float64Array(0);
  return { codec, version: 0, supported: false, reason: `an unreadable audio track (${codec.trim()})`, encoding: null, channels: 0, rate: 0, bits: 0,
    float: false, signed: true, littleEndian: false, bytesPerSample: 0, bytesPerFrame: 0, frames: 0, duration: 0, shift: 0, timescale: 1,
    chunkOffsets: z, chunkFirst: z, chunkFrames: z };
}

// ---------------------------------------------------------------------------------------------- validation

const AUDIO_NAMES = {
  mp4a: 'AAC', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3', alac: 'Apple Lossless', '.mp3': 'MP3', ms_U: 'MP3', Opus: 'Opus', fLaC: 'FLAC',
  ima4: 'IMA ADPCM', ulaw: 'µ-law', alaw: 'A-law', samr: 'AMR', 'raw ': '8-bit unsigned PCM',
};
/** A human name for an audio FourCC: 'mp4a' → 'AAC'. */
export function audioCodecName(codec) { return AUDIO_NAMES[codec] || `compressed audio (${String(codec).trim()})`; }

/**
 * What the import needs to know about an indexed movie (MEDIA-SERVER.md §4d.3), or a coded error when it is not a
 * HAP movie we can play: not-hap / hapm / not-supported (hap.js › hapFormat), mov-bad (no frames, no size) and
 * truncated (the index points past the end of the file: a copy of a "fast start" movie cut short).
 * @param {MovIndex} ix @param {number} fileSize
 * @returns {{video:{fourcc:string, codecName:string, width:number, height:number, fps:number, frames:number, duration:number},
 *   audio:{format:string, codecName:string, encoding:string|null, supported:boolean, channels:number, rate:number, frames:number, duration:number}|null,
 *   warnings:{code:string, message:string}[]}}
 */
export function describeMovie(ix, fileSize) {
  const v = ix.video;
  if (!v) throw codedError('not-hap', 'the movie has no video track', { codec: null, codecName: 'no video' });
  hapFormat(v.fourcc);
  if (!v.count) throw codedError('mov-bad', 'the video track has no frames');
  if (!v.width || !v.height) throw codedError('mov-bad', 'the video track has no size');
  for (let i = 0; i < v.count; i++) {
    if (v.offsets[i] + v.sizes[i] > fileSize) throw codedError('truncated', `the file ends inside frame ${i} of ${v.count}`, { completeFrames: i });
  }
  const warnings = [];
  let audio = null;
  const a = ix.audio;
  if (a) {
    audio = { format: a.codec, codecName: a.supported ? `PCM ${a.encoding}` : a.reason, encoding: a.encoding, supported: a.supported,
      channels: a.channels, rate: a.rate, frames: a.frames, duration: a.duration };
    if (!a.supported) warnings.push({ code: 'audio-unsupported', codecName: a.reason, message: `the audio is ${a.reason} and will not play` });
    else {
      const n = a.chunkOffsets.length;
      for (let c = 0; c < n; c++) {
        if (a.chunkOffsets[c] + a.chunkFrames[c] * a.bytesPerFrame > fileSize) throw codedError('truncated', `the file ends inside audio chunk ${c} of ${n}`);
      }
    }
  }
  if (ix.tracks.filter((t) => t.handler === 'vide').length > 1) warnings.push({ code: 'extra-video', message: 'the movie has several video tracks; the first one plays' });
  return {
    video: { fourcc: v.fourcc, codecName: codecName(v.fourcc), width: v.width, height: v.height, fps: v.fps, frames: v.count, duration: v.dur },
    audio, warnings,
  };
}
