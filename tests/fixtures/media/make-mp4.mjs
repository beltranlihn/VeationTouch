// A hand-written MP4 for the demux tests (engine/media/mov.js): the sample tables the real files have, with values the
// test chooses — composition offsets (ctts: B-frames), sync samples (stss), a variable frame rate (stts), the rotation of
// the track (tkhd matrix), an edit list, an AAC track (esds) — around sample bytes that are NOT decodable video. The test
// compares what the parser reads against `truth`, the numbers written here. TEST-ONLY.

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const s32 = (n) => u32(n >>> 0);
const txt = (s) => [...Buffer.from(s, 'latin1')];
const box = (type, ...parts) => { const data = parts.flat(); return [...u32(8 + data.length), ...txt(type), ...data]; };
const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const fixed = (v) => u32(Math.round(v * 65536) >>> 0);

const MATRIX = {
  0: [1, 0, 0, 0, 1, 0],
  90: [0, 1, 0, -1, 0, 0],
  180: [-1, 0, 0, 0, -1, 0],
  270: [0, -1, 0, 1, 0, 0],
};
const matrix = (rot) => { const [a, b, , c, d] = MATRIX[rot]; return [...fixed(a), ...fixed(b), ...u32(0), ...fixed(c), ...fixed(d), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)]; };

/**
 * @param {object} o
 * @param {number} [o.width] @param {number} [o.height]
 * @param {number[]} [o.durations] ticks of each sample's duration (decode order); default 12 × 1000 at a timescale of 30000 (30 fps)
 * @param {number[]} [o.cts] composition offset (ticks) of each sample; default all 0 (no ctts box)
 * @param {number[]} [o.sync] 0-based sync samples; default none = no stss (every sample is sync)
 * @param {number} [o.timescale] @param {0|90|180|270} [o.rotation]
 * @param {{mediaTime:number, segment:number}|null} [o.edit] an edit list entry (ticks)
 * @param {boolean} [o.fragmented] adds an mvex (the movie says its samples are in fragments) and no samples
 * @param {boolean} [o.audio] an AAC-LC track of `audioPackets` packets of 1024 samples, mono 48 kHz, with its esds
 * @param {string} [o.codec] sample entry FourCC: 'avc1' (with an avcC), 'hvc1', 'apcn'…
 * @param {{profile:number, level:number, chroma?:number, depth?:number}} [o.avc]
 */
export function makeMp4(o = {}) {
  const W = o.width ?? 64, H = o.height ?? 32, ts = o.timescale ?? 30000;
  const dur = o.durations ?? Array.from({ length: 12 }, () => 1000), n = o.fragmented ? 0 : dur.length;
  const cts = o.cts ?? null, sync = o.sync ?? null, codec = o.codec ?? 'avc1';
  const sizes = Array.from({ length: n }, (_, i) => 20 + (i % 5) * 3);
  const apackets = o.audio ? (o.audioPackets ?? 10) : 0, asizes = Array.from({ length: apackets }, (_, i) => 30 + (i % 3));
  // layout: ftyp, mdat (video samples then audio packets), moov
  const ftyp = box('ftyp', txt('isom'), u32(512), txt('isomiso2avc1mp41'));
  const mdatStart = ftyp.length + 8;
  let p = mdatStart; const voff = sizes.map((s) => { const x = p; p += s; return x; });
  const aoff = asizes.map((s) => { const x = p; p += s; return x; });
  const mdat = box('mdat', new Array(p - mdatStart).fill(0).map((_, i) => (i * 7) & 255));

  const avcC = box('avcC', [1, o.avc?.profile ?? 100, 0, o.avc?.level ?? 40, 0xff, 0xe1, ...u16(4), 0x67, 0x64, 0, 40, 1, ...u16(2), 0x68, 0xee,
    ...(o.avc && o.avc.profile >= 100 ? [0xfc | (o.avc.chroma ?? 1), 0xf8 | ((o.avc.depth ?? 8) - 8), 0xf8 | ((o.avc.depth ?? 8) - 8), 0] : [])]);
  const visual = [...new Array(6).fill(0), ...u16(1), ...new Array(16).fill(0), ...u16(W), ...u16(H), ...u32(0x480000), ...u32(0x480000), ...u32(0), ...u16(1), ...new Array(32).fill(0), ...u16(24), ...u16(0xffff)];
  const stsdV = full('stsd', 0, 0, u32(1), box(codec, visual, codec === 'avc1' ? avcC : []));
  const stts = full('stts', 0, 0, u32(rle(dur).length), ...rle(dur).map(([c, d]) => [...u32(c), ...u32(d)]));
  const ctts = cts ? full('ctts', 1, 0, u32(rle(cts).length), ...rle(cts).map(([c, d]) => [...u32(c), ...s32(d)])) : [];
  const stss = sync ? full('stss', 0, 0, u32(sync.length), ...sync.map((i) => u32(i + 1))) : [];
  const stsc = full('stsc', 0, 0, u32(n ? 1 : 0), n ? [...u32(1), ...u32(n), ...u32(1)] : []);
  const stsz = full('stsz', 0, 0, u32(0), u32(n), ...sizes.map((s) => u32(s)));
  const stco = full('stco', 0, 0, u32(n ? 1 : 0), n ? u32(voff[0]) : []);
  const stblV = box('stbl', stsdV, stts, ctts, stss, stsc, stsz, stco);
  const mdhdV = full('mdhd', 0, 0, u32(0), u32(0), u32(ts), u32(dur.reduce((a, b) => a + b, 0)), u16(0x55c4), u16(0));
  const hdlrV = full('hdlr', 0, 0, u32(0), txt('vide'), u32(0), u32(0), u32(0), [0]);
  const edts = o.edit ? box('edts', full('elst', 0, 0, u32(1), u32(o.edit.segment), s32(o.edit.mediaTime), u32(0x10000))) : [];
  const tkhd = (id, rot, w, h) => full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(0), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), matrix(rot), fixed(w), fixed(h));
  const trakV = box('trak', tkhd(1, o.rotation ?? 0, W, H), edts, box('mdia', mdhdV, hdlrV, box('minf', full('vmhd', 0, 1, u32(0), u32(0)), stblV)));

  let trakA = [];
  if (o.audio) {
    const asc = [0x11, 0x88]; // AAC-LC, 48 kHz, mono
    const esds = full('esds', 0, 0, [0x03, 25, 0, 2, 0], [0x04, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0x05, asc.length, ...asc], [0x06, 1, 2]);
    const mp4a = box('mp4a', [...new Array(6).fill(0), ...u16(1), ...u16(0), ...u16(0), ...u32(0), ...u16(1), ...u16(16), ...u16(0), ...u16(0), ...u32(48000 << 16 >>> 0)], esds);
    const stblA = box('stbl', full('stsd', 0, 0, u32(1), mp4a), full('stts', 0, 0, u32(1), u32(apackets), u32(1024)), full('stsc', 0, 0, u32(1), u32(1), u32(apackets), u32(1)),
      full('stsz', 0, 0, u32(0), u32(apackets), ...asizes.map((s) => u32(s))), full('stco', 0, 0, u32(1), u32(aoff[0])));
    const eltsA = box('edts', full('elst', 0, 0, u32(1), u32(Math.round(apackets * 1024 * 30000 / 48000)), s32(o.audioPriming ?? 1024), u32(0x10000)));
    trakA = box('trak', tkhd(2, 0, 0, 0), eltsA, box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(48000), u32(apackets * 1024), u16(0x55c4), u16(0)),
      full('hdlr', 0, 0, u32(0), txt('soun'), u32(0), u32(0), u32(0), [0]), box('minf', full('smhd', 0, 0, u32(0)), stblA)));
  }
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(30000), u32(dur.reduce((a, b) => a + b, 0)), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0), matrix(0), new Array(24).fill(0), u32(3));
  const mvex = o.fragmented ? box('mvex', full('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0))) : [];
  const moov = box('moov', mvhd, trakV, trakA, mvex);

  // truth: what a correct parser reads back
  const dts = []; let acc = 0; for (const d of dur) { dts.push(acc); acc += d; }
  const shift = o.edit ? -o.edit.mediaTime / ts : 0;
  const pts = dts.map((t, i) => (t + (cts ? cts[i] : 0)) / ts + shift);
  return { bytes: Uint8Array.from([...ftyp, ...mdat, ...moov]), truth: { n, sizes, offsets: voff, dts: dts.map((t) => t / ts + shift), pts, shift, ts, W, H, audioOffsets: aoff, audioSizes: asizes } };
}

/** [[count, value]…] runs of equal consecutive values. */
function rle(a) { const r = []; for (const v of a) { if (r.length && r[r.length - 1][1] === v) r[r.length - 1][0]++; else r.push([1, v]); } return r; }
