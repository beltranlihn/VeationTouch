// WAV (RIFF/WAVE) reader: the audio track of a .wav as the same object engine/media/mov.js gives for the PCM of a movie
// (MovAudio), so engine/media/pcm.js (pcmRanges / decodePcm) and the PCM route serve it as they serve a .mov's audio —
// the data chunk is a single chunk of interleaved sample frames. Environment-neutral ES module.
// Formats: PCM 8-bit (unsigned), 16 / 24 / 32-bit integer, 32 / 64-bit float, also inside WAVE_FORMAT_EXTENSIBLE; 1–16 channels.
//
// Errors (err.code): wav-bad (not a WAV, no fmt/data chunk, truncated header), wav-unsupported (A-law, ADPCM, MP3-in-WAV… — err.reason)

import { codedError } from './hap.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

const FORMATS = { 1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'µ-law', 2: 'ADPCM', 0x55: 'MP3', 0xff: 'AAC' };

/**
 * @param {(offset:number, length:number) => Uint8Array} read synchronous read @param {number} fileSize
 * @returns {import('./mov.js').MovAudio} (the chunk fields hold the data chunk)
 */
export function parseWav(read, fileSize) {
  const h = read(0, 12);
  if (h.length < 12 || tag(h, 0) !== 'RIFF' || tag(h, 8) !== 'WAVE') throw codedError('wav-bad', 'not a WAVE file');
  let fmt = null, data = null;
  for (let p = 12; p + 8 <= fileSize && !(fmt && data);) {
    const c = read(p, 8);
    if (c.length < 8) break;
    const id = tag(c, 0); let len = u32(c, 4);
    if (id === 'fmt ') {
      const b = read(p + 8, Math.min(len, 40));
      if (b.length < 16) throw codedError('wav-bad', 'the fmt chunk is cut short');
      let format = u16(b, 0);
      const channels = u16(b, 2), rate = u32(b, 4), bits = u16(b, 14);
      if (format === 0xfffe && b.length >= 26) format = u16(b, 24); // WAVE_FORMAT_EXTENSIBLE: the sub-format's first two bytes
      fmt = { format, channels, rate, bits };
    } else if (id === 'data') {
      const start = p + 8;
      if (len === 0 || len === 0xffffffff || start + len > fileSize) len = Math.max(0, fileSize - start); // streamed or cut short: what is there
      data = { start, len };
    }
    p += 8 + len + (len & 1); // chunks are padded to an even size
    if (id === 'data') break;
  }
  if (!fmt) throw codedError('wav-bad', 'no fmt chunk');
  if (!data) throw codedError('wav-bad', 'no data chunk');
  const { format, channels, rate, bits } = fmt;
  const float = format === 3;
  if (format !== 1 && format !== 3) throw codedError('wav-unsupported', `${FORMATS[format] || `format ${format}`} WAV`, { reason: `${FORMATS[format] || `format ${format}`} WAV` });
  if (!(float ? bits === 32 || bits === 64 : [8, 16, 24, 32].includes(bits))) throw codedError('wav-unsupported', `${bits}-bit ${float ? 'float' : 'integer'} WAV`, { reason: `${bits}-bit WAV` });
  if (!(channels >= 1 && channels <= 16) || !(rate >= 1000 && rate <= 768000)) throw codedError('wav-bad', `${channels} channels at ${rate} Hz`);
  const bytesPerSample = bits / 8, bytesPerFrame = channels * bytesPerSample;
  const frames = Math.floor(data.len / bytesPerFrame);
  return {
    codec: 'wav ', version: 0, supported: true, reason: '',
    encoding: (float ? 'f' : bits === 8 ? 'u' : 's') + bits + (bits === 8 ? '' : 'le'),
    channels, rate, bits, float, signed: bits !== 8, littleEndian: true, bytesPerSample, bytesPerFrame,
    frames, duration: frames / rate, shift: 0, timescale: rate,
    chunkOffsets: Float64Array.of(data.start), chunkFirst: Float64Array.of(0), chunkFrames: Float64Array.of(frames),
  };
}

/** The same object for a PCM cache file (s16le, `rate`, `channels`, `frames`; engine/media/audio-cache.js). */
export function cacheAudio({ rate, channels, frames }) {
  return {
    codec: 'cach', version: 0, supported: true, reason: '', encoding: 's16le', channels, rate, bits: 16, float: false, signed: true,
    littleEndian: true, bytesPerSample: 2, bytesPerFrame: 2 * channels, frames, duration: frames / rate, shift: 0, timescale: rate,
    chunkOffsets: Float64Array.of(0), chunkFirst: Float64Array.of(0), chunkFrames: Float64Array.of(frames),
  };
}
