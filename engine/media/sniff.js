// What a file IS, from its first bytes (docs/research/media-formats.md §4.1, §6) — never from its extension — and, for the
// still-image formats Chromium reads, the pixel size from the header alone, so the import can accept or refuse a file
// without Chromium (the engine runs in a utility process with no decoder).
// Environment-neutral ES module: no `node:` imports.
//
//   sniffKind(head) → {kind, format}
//     kind: 'mov' (QuickTime / MP4) · 'image' · 'wav' · 'audio' (MP3, AAC/ADTS, FLAC, Ogg, M4A is 'mov') · 'webm' ·
//           'unsupported' (a format we recognise and cannot read: TIFF, HEIC, PSD, EXR, SVG, AVI, AIFF… → `format` names it) · 'unknown'
//   imageInfo(head, format) → {width, height, animated, bitDepth, orientation} | null (a header that does not parse)

const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const ascii = (b, o, n) => { let s = ''; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; };
const has = (b, o, s) => ascii(b, o, s.length) === s;

/** Names of the formats we recognise and cannot read, for the message ("… is HEIC, which cannot be read"). */
export const UNSUPPORTED_NAMES = {
  tiff: 'TIFF', heic: 'HEIC', psd: 'a Photoshop file', exr: 'OpenEXR', svg: 'SVG', ico: 'an icon file', avi: 'AVI', aiff: 'AIFF', mkv: 'Matroska',
};

/** The image formats Chromium decodes with createImageBitmap. */
export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];

/**
 * @param {Uint8Array} h the first bytes of the file (a few KB are enough to tell; 1 MB lets imageInfo read any header)
 * @returns {{kind:string, format:string|null, brand?:string}}
 */
export function sniffKind(h) {
  if (!h || h.length < 4) return { kind: 'unknown', format: null };
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return { kind: 'image', format: 'png' };
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { kind: 'image', format: 'jpeg' };
  if (has(h, 0, 'GIF87a') || has(h, 0, 'GIF89a')) return { kind: 'image', format: 'gif' };
  if (h[0] === 0x42 && h[1] === 0x4d && h.length >= 26) return { kind: 'image', format: 'bmp' };
  if (has(h, 0, 'RIFF') && h.length >= 12) {
    const t = ascii(h, 8, 4);
    if (t === 'WEBP') return { kind: 'image', format: 'webp' };
    if (t === 'WAVE') return { kind: 'wav', format: 'wav' };
    if (t === 'AVI ') return { kind: 'unsupported', format: 'avi' };
  }
  if (has(h, 0, 'FORM') && (has(h, 8, 'AIFF') || has(h, 8, 'AIFC'))) return { kind: 'unsupported', format: 'aiff' };
  if ((has(h, 0, 'II') && h[2] === 0x2a && h[3] === 0) || (has(h, 0, 'MM') && h[2] === 0 && h[3] === 0x2a)) return { kind: 'unsupported', format: 'tiff' };
  if (has(h, 0, '8BPS')) return { kind: 'unsupported', format: 'psd' };
  if (h[0] === 0x76 && h[1] === 0x2f && h[2] === 0x31 && h[3] === 0x01) return { kind: 'unsupported', format: 'exr' };
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) {
    // EBML: WebM or Matroska (the DocType string says which; both are refused today)
    return { kind: ascii(h, 4, 64).includes('webm') ? 'webm' : 'unsupported', format: ascii(h, 4, 64).includes('webm') ? 'webm' : 'mkv' };
  }
  if (h.length >= 12 && has(h, 4, 'ftyp')) {
    const brand = ascii(h, 8, 4);
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', format: 'avif', brand };
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return { kind: 'unsupported', format: 'heic', brand };
    return { kind: 'mov', format: 'mov', brand };
  }
  if (h.length >= 8 && /^(moov|mdat|free|skip|wide|pnot)$/.test(ascii(h, 4, 4))) return { kind: 'mov', format: 'mov', brand: null };
  if (has(h, 0, 'ID3')) return { kind: 'audio', format: 'mp3' };
  if (has(h, 0, 'fLaC')) return { kind: 'audio', format: 'flac' };
  if (has(h, 0, 'OggS')) return { kind: 'audio', format: 'ogg' };
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) {
    const layer = (h[1] >> 1) & 3; // 0 = AAC in ADTS (layer bits 00); 1 = layer III
    return { kind: 'audio', format: layer === 0 ? 'aac' : 'mp3' };
  }
  // text: SVG (an XML prolog or an <svg> tag in the first 512 bytes)
  const text = ascii(h, 0, 512).toLowerCase();
  if (text.includes('<svg')) return { kind: 'unsupported', format: 'svg' };
  if (h[0] === 0 && h[1] === 0 && h[2] === 1 && h[3] === 0) return { kind: 'unsupported', format: 'ico' };
  return { kind: 'unknown', format: null };
}

// ---------------------------------------------------------------------------------------------- image headers

function pngInfo(h) {
  if (h.length < 33 || !has(h, 12, 'IHDR')) return null;
  const width = u32be(h, 16), height = u32be(h, 20), bitDepth = h[24];
  let animated = false;
  for (let p = 8; p + 8 <= h.length;) { // chunks up to the first IDAT: an animated PNG says so (acTL) before it
    const len = u32be(h, p), type = ascii(h, p + 4, 4);
    if (type === 'acTL') { animated = true; break; }
    if (type === 'IDAT' || type === 'IEND') break;
    p += 12 + len;
  }
  return { width, height, animated, bitDepth, orientation: 1 };
}

/** EXIF orientation (1–8) from a JPEG APP1 segment, 1 when there is none. */
function exifOrientation(h, s, e) {
  if (!has(h, s, 'Exif\0\0')) return 1;
  const t = s + 6, le = has(h, t, 'II');
  if (!le && !has(h, t, 'MM')) return 1;
  const r16 = (o) => (le ? u16le(h, o) : u16be(h, o)), r32 = (o) => (le ? u32le(h, o) : u32be(h, o));
  const ifd = t + r32(t + 4);
  if (ifd + 2 > e) return 1;
  const n = r16(ifd);
  for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= e; i++) {
    const o = ifd + 2 + i * 12;
    if (r16(o) === 0x0112) { const v = r16(o + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

function jpegInfo(h) {
  let orientation = 1;
  for (let p = 2; p + 4 <= h.length;) {
    if (h[p] !== 0xff) { p++; continue; }
    const m = h[p + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { p += m === 0xff ? 1 : 2; continue; }
    const len = u16be(h, p + 2);
    if (m === 0xe1) orientation = exifOrientation(h, p + 4, p + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (p + 9 > h.length) return null;
      let width = u16be(h, p + 7), height = u16be(h, p + 5);
      if (orientation >= 5) [width, height] = [height, width]; // shown upright: a phone photo is stored sideways
      return { width, height, animated: false, bitDepth: h[p + 4], orientation };
    }
    if (m === 0xda) return null; // image data reached without a frame header
    p += 2 + len;
  }
  return null;
}

function webpInfo(h) {
  if (h.length < 21) return null;
  const t = ascii(h, 12, 4);
  if (t === 'VP8X') return h.length < 30 ? null : { width: 1 + (h[24] | (h[25] << 8) | (h[26] << 16)), height: 1 + (h[27] | (h[28] << 8) | (h[29] << 16)), animated: !!(h[20] & 2), bitDepth: 8, orientation: 1 };
  if (t === 'VP8L') { if (h[20] !== 0x2f || h.length < 25) return null; const b = u32le(h, 21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), animated: false, bitDepth: 8, orientation: 1 }; }
  if (t === 'VP8 ') { if (h.length < 30 || h[23] !== 0x9d || h[24] !== 0x01 || h[25] !== 0x2a) return null; return { width: u16le(h, 26) & 0x3fff, height: u16le(h, 28) & 0x3fff, animated: false, bitDepth: 8, orientation: 1 }; }
  return null;
}

function gifInfo(h) {
  if (h.length < 13) return null;
  let frames = 0;
  for (let p = 13 + ((h[10] & 0x80) ? 3 * (1 << ((h[10] & 7) + 1)) : 0); p < h.length;) { // blocks: count the image descriptors
    const b = h[p];
    if (b === 0x2c) {
      frames++; if (frames > 1) break;
      const packed = h[p + 9]; p += 10 + ((packed & 0x80) ? 3 * (1 << ((packed & 7) + 1)) : 0) + 1;
      while (p < h.length && h[p]) p += 1 + h[p]; p++;
    } else if (b === 0x21) { p += 2; while (p < h.length && h[p]) p += 1 + h[p]; p++; } else break; // 0x3b trailer or garbage
  }
  return { width: u16le(h, 6), height: u16le(h, 8), animated: frames > 1, bitDepth: 8, orientation: 1 };
}

function bmpInfo(h) {
  const size = u32le(h, 14);
  if (size === 12) return { width: u16le(h, 18), height: u16le(h, 20), animated: false, bitDepth: 8, orientation: 1 };
  const w = u32le(h, 18) | 0, hh = u32le(h, 22) | 0;
  return { width: Math.abs(w), height: Math.abs(hh), animated: false, bitDepth: 8, orientation: 1 };
}

function avifInfo(h, brand) {
  for (let p = 8; p + 16 <= h.length; p++) if (h[p] === 0x69 && h[p + 1] === 0x73 && h[p + 2] === 0x70 && h[p + 3] === 0x65) { // 'ispe'
    return { width: u32be(h, p + 8), height: u32be(h, p + 12), animated: brand === 'avis', bitDepth: 8, orientation: 1 };
  }
  return null;
}

/**
 * The size and flags of a still image from its header.
 * @param {Uint8Array} h the head of the file @param {string} format a name from IMAGE_FORMATS
 * @param {string} [brand] the ftyp brand of an AVIF
 */
export function imageInfo(h, format, brand) {
  let r = null;
  try {
    switch (format) {
      case 'png': r = pngInfo(h); break;
      case 'jpeg': r = jpegInfo(h); break;
      case 'webp': r = webpInfo(h); break;
      case 'gif': r = gifInfo(h); break;
      case 'bmp': r = bmpInfo(h); break;
      case 'avif': r = avifInfo(h, brand); break;
      default: r = null;
    }
  } catch { r = null; }
  return r && r.width > 0 && r.height > 0 ? r : null;
}

/** The pixel size an image may reach in the mixer: the GPU's texture limit (ANGLE/D3D11 → 16384) and 64 Mpx (256 MB of RGBA). */
export const IMAGE_MAX_SIDE = 16384;
export const IMAGE_MAX_PIXELS = 64 * 1024 * 1024;

/** The size an image is reduced to when it is larger than the limits (same aspect, whole pixels); null when it fits. */
export function reducedSize(width, height, maxSide = IMAGE_MAX_SIDE, maxPixels = IMAGE_MAX_PIXELS) {
  const k = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  if (k >= 1) return null;
  return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)) };
}
