// PCM audio of a .mov: reads any range of sample frames of the audio track (engine/media/mov.js › audio) into
// interleaved Float32 in [-1, 1). Formats: 8/16/24/32-bit integer and 32/64-bit float, either byte order, 1–16 channels.
// Environment-neutral ES module (no `node:` imports): the clip-audio worker can use it as it is.
//
// Two layers, so a caller with an asynchronous read can use the same code:
//   pcmRanges(audio, start, count) → the byte ranges to read (one per chunk touched)
//   decodePcm(bytes, audio, out, outFrame, frames) → converts one range
//   readPcm(read, audio, start, count) = both, with a synchronous read(offset, length) → Uint8Array

import { codedError } from './hap.js';

/**
 * The byte ranges of the file that hold frames [start, start+count) of the track. Frames outside the track are not in
 * any range (they read as silence).
 * @param {import('./mov.js').MovAudio} audio @param {number} start @param {number} count
 * @returns {{offset:number, length:number, frames:number, outFrame:number}[]} outFrame = where they go in the output
 */
export function pcmRanges(audio, start, count) {
  const r = [];
  if (!audio || !audio.supported || count <= 0) return r;
  const from = Math.max(0, start), to = Math.min(audio.frames, start + count);
  if (to <= from) return r;
  const first = audio.chunkFirst, n = first.length;
  // The last chunk whose first frame ≤ from (binary search: an hour of audio interleaved per video frame is ~200k chunks).
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (first[mid] <= from) lo = mid; else hi = mid - 1; }
  for (let c = lo, f = from; c < n && f < to; c++) {
    const cEnd = first[c] + audio.chunkFrames[c];
    if (cEnd <= f) continue; // an empty chunk
    const k = Math.min(cEnd, to) - f;
    r.push({ offset: audio.chunkOffsets[c] + (f - first[c]) * audio.bytesPerFrame, length: k * audio.bytesPerFrame, frames: k, outFrame: f - start });
    f += k;
  }
  return r;
}

/**
 * Converts `frames` interleaved sample frames from `bytes` into out[outFrame * channels …].
 * @param {Uint8Array} bytes @param {import('./mov.js').MovAudio} audio @param {Float32Array} out
 * @param {number} outFrame @param {number} frames
 */
export function decodePcm(bytes, audio, out, outFrame, frames) {
  const ch = audio.channels, n = Math.min(frames * ch, Math.floor(bytes.length / audio.bytesPerSample));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); // a Node Buffer may be a slice of a pool
  const le = audio.littleEndian, o0 = outFrame * ch;
  if (audio.float) {
    if (audio.bits === 32) for (let i = 0; i < n; i++) out[o0 + i] = dv.getFloat32(i * 4, le);
    else for (let i = 0; i < n; i++) out[o0 + i] = dv.getFloat64(i * 8, le);
    return;
  }
  switch (audio.bits) {
    case 8:
      if (audio.signed) for (let i = 0; i < n; i++) out[o0 + i] = dv.getInt8(i) / 128;
      else for (let i = 0; i < n; i++) out[o0 + i] = (bytes[i] - 128) / 128;
      return;
    case 16: for (let i = 0; i < n; i++) out[o0 + i] = dv.getInt16(i * 2, le) / 32768; return;
    case 24:
      for (let i = 0, p = 0; i < n; i++, p += 3) {
        const v = le ? bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) : (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
        out[o0 + i] = ((v << 8) >> 8) / 8388608; // sign-extend 24 → 32 bits
      }
      return;
    case 32: for (let i = 0; i < n; i++) out[o0 + i] = dv.getInt32(i * 4, le) / 2147483648; return;
    default: throw codedError('audio-unsupported', `${audio.bits}-bit PCM`);
  }
}

/**
 * Frames [start, start+count) of the audio track as interleaved Float32 (count × channels). Frames before 0 or past
 * the end are silence, so a player can ask across the loop point or the end of the clip.
 * @param {(offset:number, length:number) => Uint8Array} read @param {import('./mov.js').MovAudio} audio
 * @param {number} start @param {number} count @param {Float32Array} [out] reused when large enough
 * @returns {Float32Array}
 */
export function readPcm(read, audio, start, count, out) {
  if (!audio || !audio.supported) throw codedError('audio-unsupported', audio ? audio.reason : 'no audio track');
  const need = count * audio.channels;
  if (!out || out.length < need) out = new Float32Array(need); else { out = out.subarray(0, need); out.fill(0); }
  for (const g of pcmRanges(audio, start, count)) {
    const b = read(g.offset, g.length);
    if (b.length < g.length) throw codedError('truncated', `the audio data ends early (short read at ${g.offset})`);
    decodePcm(b, audio, out, g.outFrame, g.frames);
  }
  return out;
}
