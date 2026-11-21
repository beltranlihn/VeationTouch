// Minimal PNG writer (8-bit RGB or RGBA, no interlace) for the clip thumbnails. Node-only: deflate via node:zlib.
// Each row takes the filter (None, Sub, Up, Average, Paeth) with the smallest sum of absolute values, the usual
// heuristic: thumbnails of video come out 3–4 times smaller than with no filter.

import zlib from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b, c = 0xffffffff) { for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c; }

function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE((crc32(data, crc32(head.subarray(4))) ^ 0xffffffff) >>> 0, 0);
  return [head, data, crc];
}

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/**
 * @param {number} width @param {number} height
 * @param {Uint8Array} pixels row-major, row 0 = top, `channels` bytes per pixel
 * @param {3|4} [channels] 3 = RGB, 4 = RGBA
 * @returns {Buffer} the PNG file
 */
export function encodePng(width, height, pixels, channels = 4) {
  if (channels !== 3 && channels !== 4) throw new Error('png: channels must be 3 or 4');
  if (pixels.length < width * height * channels) throw new Error('png: not enough pixels');
  const bpp = channels, stride = width * bpp, raw = Buffer.alloc((stride + 1) * height);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride), up = y ? pixels.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f]; let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0, b = up[i], c = i >= bpp ? up[i - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (row[i] - pred) & 0xff; o[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best; raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2; // 8-bit, RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunk('IHDR', ihdr), ...chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), ...chunk('IEND', Buffer.alloc(0)),
  ]);
}
