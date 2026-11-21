// Media format (MEDIA-SERVER.md F1): the .mov index (video + PCM audio), Snappy, HAP frames, PCM reading, PNG and the
// CPU thumbnails. Every file is generated at test time by tests/fixtures/media/make-hap.mjs into a temp folder; the
// generator returns what it wrote (offsets, times, textures, audio samples), so the parser is checked against the
// writer, not against itself. Each test says what breaks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { movIndex, movIndexAsync, describeMovie } from '../engine/media/mov.js';
import { snappyDecompress, hapDecode, decodeFrame, hapFormat } from '../engine/media/hap.js';
import { readPcm, pcmRanges } from '../engine/media/pcm.js';
import { encodePng } from '../engine/media/png.js';
import { blockImage, thumbnailImages, makeThumbnails, defaultThumbFrame } from '../engine/media/thumb.js';
import { probe } from '../engine/media/probe.js';
import { makeHap, writeHap, snappyCompress, hapFrame, hapSection, encodeTexture, picture, readStripe, MARKERS, u8cat } from './fixtures/media/make-hap.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-media-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let nFile = 0;
const file = (bytes) => { const f = path.join(tmp, `clip-${nFile++}.mov`); fs.writeFileSync(f, bytes); return f; };
const memRead = (b) => (off, len) => b.subarray(off, Math.min(b.length, off + len));
const index = (b) => movIndex(memRead(b), b.length);
const coded = (code) => (e) => { assert.equal(e.code, code, e.message); assert.match(e.message, new RegExp(`^${code}: `)); return true; };

/** Seeded PRNG (mulberry32), so a failure reproduces. */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------- index

// Fails if the stsc table is ignored or misread: with two (or three) samples per chunk, frame 1 would be read at
// chunk 1 (= frame 2) and every offset after frame 0 would be wrong; a short table also trips the count check.
test('index: frame count, per-sample times and offsets match what was written (stsc with 2 and 3 samples per chunk, stco, co64, fast start)', async () => {
  for (const o of [
    { perChunk: 2, frames: 13, offsets: 'stco' },
    { perChunk: 1, frames: 12, offsets: 'co64' },
    { perChunk: 3, frames: 10, moovFirst: true },
    { perChunk: 2, frames: 9, audio: { codec: 'sowt' } }, // audio chunks interleaved between the video chunks
  ]) {
    const { bytes, truth } = makeHap(o);
    if (o.perChunk > 1) assert.ok(truth.videoChunks < truth.frames, 'the fixture really packs several samples per chunk');
    for (const ix of [index(bytes), await movIndexAsync(async (a, b) => memRead(bytes)(a, b), bytes.length)]) {
      const v = ix.video;
      assert.equal(v.fourcc, 'Hap1');
      assert.equal(v.count, truth.frames, JSON.stringify(o));
      assert.deepEqual([v.width, v.height], [256, 32]);
      assert.deepEqual(Array.from(v.offsets), truth.offsets, `offsets ${JSON.stringify(o)}`);
      assert.deepEqual(Array.from(v.sizes), truth.sizes);
      assert.deepEqual(Array.from(v.pts), truth.pts);
      assert.equal(v.fps, 30);
      assert.ok(Math.abs(v.dur - truth.duration) < 1e-9);
      for (let f = 0; f < v.count; f++) assert.deepEqual(bytes.subarray(v.offsets[f], v.offsets[f] + v.sizes[f]), truth.samples[f], `frame ${f} bytes`);
    }
  }
});

// Fails if the time of a frame is computed as i/fps (frames 3 and 4 last twice as long here) or the empty edit of the
// edit list is ignored (every time would be 0.5 s early).
test('index: a variable frame rate and an edit-list delay give each frame its own time', () => {
  const durations = [20, 20, 20, 40, 40, 10, 10, 10, 30, 20]; // ticks of 1/600 s
  const { bytes, truth } = makeHap({ frames: durations.length, durations, timescale: 600, delay: 0.5 });
  const v = index(bytes).video;
  assert.deepEqual(Array.from(v.pts), truth.pts);
  assert.equal(v.pts[0], 0.5);
  assert.ok(Math.abs(v.pts[4] - (0.5 + 100 / 600)) < 1e-12, `frame 4 at ${v.pts[4]}`);
  assert.ok(Math.abs(v.dur - (0.5 + 220 / 600)) < 1e-12);
  assert.ok(Math.abs(v.shift - 0.5) < 1e-12);
});

// ---------------------------------------------------------------------------------------------- Snappy

/** The obvious decoder: one byte at a time. The reference the optimised one (run merging) must match. */
function naiveSnappy(src) {
  let p = 0, n = 0, mul = 1;
  for (;;) { const c = src[p++]; n += (c & 0x7f) * mul; if (!(c & 0x80)) break; mul *= 128; }
  const out = [];
  const copy = (off, len) => { for (let i = 0; i < len; i++) out.push(out[out.length - off]); };
  while (p < src.length) {
    const tag = src[p++];
    if ((tag & 3) === 0) {
      let len = tag >> 2;
      if (len >= 60) { const nb = len - 59; len = 0; for (let i = 0; i < nb; i++) len += src[p++] * 256 ** i; }
      for (let i = 0; i <= len; i++) out.push(src[p++]);
    } else if ((tag & 3) === 1) { const off = ((tag >> 5) << 8) | src[p++]; copy(off, ((tag >> 2) & 7) + 4); }
    else if ((tag & 3) === 2) { const off = src[p] + src[p + 1] * 256; p += 2; copy(off, (tag >> 2) + 1); }
    else { const off = src[p] + src[p + 1] * 256 + src[p + 2] * 65536 + src[p + 3] * 16777216; p += 4; copy(off, (tag >> 2) + 1); }
  }
  assert.equal(out.length, n);
  return Uint8Array.from(out);
}

/** A random but valid Snappy stream: literals (every length form), copies of every tag type, and long runs of copies
 *  with the same offset — small (1–8: the doubling path), period 16 (DXT blocks) and long ones (> 48 bytes). */
function randomStream(rnd, target) {
  const body = []; let o = 0, last = 0;
  const lit = (len) => {
    const m = len - 1, nb = m < 60 && rnd() < 0.8 ? 0 : Math.max(Math.ceil(Math.log2(m + 1) / 8), 1 + Math.floor(rnd() * 4)) ;
    if (!nb) body.push(m << 2); else { body.push((59 + Math.min(4, nb)) << 2); for (let i = 0; i < Math.min(4, nb); i++) body.push(Math.floor(m / 256 ** i) & 255); }
    const alpha = rnd() < 0.5 ? 4 : 256;
    for (let i = 0; i < len; i++) body.push(Math.floor(rnd() * alpha));
    o += len;
  };
  const cp = (off, len) => {
    if (len >= 4 && len <= 11 && off < 2048 && rnd() < 0.5) body.push(1 | ((len - 4) << 2) | ((off >> 8) << 5), off & 255);
    else if (off < 65536 && rnd() < 0.7) body.push(2 | ((len - 1) << 2), off & 255, off >> 8);
    else body.push(3 | ((len - 1) << 2), off & 255, (off >> 8) & 255, (off >> 16) & 255, off >>> 24);
    o += len;
  };
  while (o < target) {
    if (!o || rnd() < 0.2) { lit(rnd() < 0.1 ? 61 + Math.floor(rnd() * 3000) : 1 + Math.floor(rnd() * 40)); continue; }
    const r = rnd();
    let off = r < 0.3 && last ? last : r < 0.55 ? 1 + Math.floor(rnd() * 8) : r < 0.7 ? 16 : 1 + Math.floor(rnd() * Math.min(o, 100000));
    off = Math.min(off, o); last = off;
    const reps = rnd() < 0.3 ? 1 + Math.floor(rnd() * 300) : 1;
    for (let k = 0; k < reps; k++) cp(off, 1 + Math.floor(rnd() * 64));
  }
  const head = []; let v = o; while (v >= 128) { head.push((v & 127) | 128); v = Math.floor(v / 128); } head.push(v);
  return Uint8Array.from([...head, ...body]);
}

// Fails if the run merging or its doubling fill (flush) copies a wrong period or length: the random streams have
// thousands of same-offset runs of every period, and one wrong byte fails the comparison.
test('snappy: the run-merging decoder is byte-identical to a naive reference decoder', () => {
  const rnd = rng(12345);
  const inputs = [];
  for (let k = 0; k < 250; k++) inputs.push(randomStream(rnd, 200 + Math.floor(rnd() * 40000)));
  // what the HAP encoder writes: zeros (offset-1 runs), repeated 16-byte blocks, a texture, incompressible noise
  const noise = Uint8Array.from({ length: 70000 }, () => Math.floor(rnd() * 256));
  const blocks = new Uint8Array(100000); for (let i = 0; i < blocks.length; i++) blocks[i] = i % 16 < 2 ? 7 : i % 16;
  for (const raw of [new Uint8Array(100000), blocks, noise, encodeTexture(picture(3, 256, 32), 256, 32, 'hapq'), new Uint8Array(5)]) {
    const c = snappyCompress(raw);
    assert.deepEqual(naiveSnappy(c), raw, 'the fixture compressor round-trips');
    inputs.push(c);
  }
  for (const s of inputs) {
    const want = naiveSnappy(s);
    const got = new Uint8Array(want.length + 7).fill(0xee); // decoding at an offset, like the chunks of a frame
    assert.equal(snappyDecompress(s, 0, s.length, got, 7), want.length);
    assert.ok(Buffer.from(got.subarray(7)).equals(Buffer.from(want)), 'byte-identical');
    assert.ok(got.subarray(0, 7).every((x) => x === 0xee), 'nothing written before the offset');
  }
  const c = snappyCompress(noise);
  assert.throws(() => snappyDecompress(c, 0, c.length - 10, new Uint8Array(noise.length), 0), coded('snappy'));
  assert.throws(() => snappyDecompress(c, 0, c.length, new Uint8Array(100), 0), coded('snappy'));
});

// ---------------------------------------------------------------------------------------------- HAP

// Fails if a chunk is written at the wrong place in the texture, the chunk offset table (0x04) is ignored (the
// reversed frame stores its chunks backwards), raw chunks inside a chunked frame are mishandled, or the long header is
// misread.
test('HAP: a chunked frame decodes to the same texture as the unchunked one', () => {
  for (const fmt of ['hap', 'hapa', 'hapq']) {
    const tex = encodeTexture(picture(5, 256, 32), 256, 32, fmt);
    const variants = [{}, { compress: false }, { chunks: 4 }, { chunks: 3, compress: false }, { chunks: 5, offsetTable: true },
      { chunks: 4, reverse: true }, { chunks: 1, offsetTable: true }, { longHeader: true }, { chunks: 2, longHeader: true }];
    const frames = variants.map((v) => hapFrame(tex, fmt, v));
    assert.notDeepEqual(frames[2], frames[5], 'the reversed frame really stores its chunks in another order');
    frames.forEach((fr, i) => {
      const out = new Uint8Array(tex.length);
      const r = hapDecode(fr, 0, fr.length, out);
      assert.equal(r.fmt, { hap: 'dxt1', hapa: 'dxt5', hapq: 'ycocg' }[fmt]);
      assert.equal(r.len, tex.length, `${fmt} ${JSON.stringify(variants[i])}`);
      assert.ok(Buffer.from(out).equals(Buffer.from(tex)), `${fmt} ${JSON.stringify(variants[i])} decodes to the texture`);
    });
  }
});

// Fails if any variant (HAP, HAP Alpha, HAP Q; Snappy or raw; chunked or not; with audio interleaved) does not index
// and decode, frame by frame, to exactly the texture the generator encoded.
test('HAP movies: HAP, HAP Alpha and HAP Q, chunked and not, with and without audio, decode every frame in Node', () => {
  for (const variant of ['hap', 'hapa', 'hapq']) {
    for (const hap of [{}, { chunks: 4 }, { chunks: 3, compress: false }]) {
      for (const audio of [null, { codec: 'sowt' }]) {
        const { bytes, truth } = makeHap({ variant, hap, audio, frames: 8, perChunk: 2 });
        assert.ok(bytes.length < 200 * 1024, 'test files stay tiny');
        const v = index(bytes).video;
        assert.equal(v.fourcc, truth.fourcc);
        const out = new Uint8Array(1 << 14); // reused across frames, as the worker does
        for (let f = 0; f < v.count; f++) {
          const d = decodeFrame(bytes.subarray(v.offsets[f], v.offsets[f] + v.sizes[f]), v.fourcc, v.width, v.height, out);
          assert.equal(d.tex, truth.tex);
          assert.ok(Buffer.from(d.data).equals(Buffer.from(truth.textures[f])), `${variant} ${JSON.stringify(hap)} frame ${f}`);
        }
      }
    }
  }
  assert.deepEqual(hapFormat('HapY'), { name: 'HAP Q', tex: 'ycocg', blockBytes: 16, alpha: false });
});

// Fails if an error code changes: the interface translates hapm / not-supported / not-hap / no-moov / truncated
// into the messages of MEDIA-SERVER.md §4d.3 (and names the codec from err.codecName).
test('errors: HapM, Hap7/HapH/HapA, avc1 and friends, truncated and non-QuickTime files come back with their codes', async () => {
  await assert.rejects(probe(file(makeHap({ fourcc: 'HapM', frames: 2 }).bytes)), coded('hapm'));
  for (const f of ['Hap7', 'HapH', 'HapA']) await assert.rejects(probe(file(makeHap({ fourcc: f, frames: 2 }).bytes)), coded('not-supported'));
  for (const [f, name] of [['avc1', 'H.264'], ['apcn', 'ProRes 422'], ['hvc1', 'HEVC'], ['DXV3', 'DXV'], ['zzzz', 'zzzz']]) {
    await assert.rejects(probe(file(makeHap({ fourcc: f, frames: 2 }).bytes)), (e) => coded('not-hap')(e) && e.codec === f && e.codecName === name);
  }
  const { bytes } = makeHap({ frames: 6 }); // the moov is LAST, as FFmpeg writes it
  const moovAt = findAtom(bytes, 'moov');
  await assert.rejects(probe(file(bytes.subarray(0, moovAt - 100))), coded('no-moov')); // cut inside mdat: no index
  await assert.rejects(probe(file(bytes.subarray(0, bytes.length - 40))), coded('no-moov')); // cut inside the moov
  await assert.rejects(probe(file(new Uint8Array(0))), coded('no-moov'));
  const fast = makeHap({ frames: 6, moovFirst: true }).bytes; // "fast start": the index is complete, the data is not
  await assert.rejects(probe(file(fast.subarray(0, fast.length - 300))), (e) => coded('truncated')(e) && e.completeFrames < 6);
  const mkv = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0, 0, 0]);
  await assert.rejects(probe(file(mkv)), (e) => coded('not-hap')(e) && e.codecName === 'Matroska / WebM');
  // frame level: the section types of the unsupported variants
  const tex = new Uint8Array(512 * 16);
  assert.throws(() => hapDecode(u8cat(hapSection(0x0d, tex)), 0, tex.length + 4, new Uint8Array(tex.length)), coded('hapm'));
  assert.throws(() => hapDecode(u8cat(hapSection(0xac, tex)), 0, tex.length + 4, new Uint8Array(tex.length)), coded('not-supported'));
  const good = hapFrame(encodeTexture(picture(0, 256, 32), 256, 32, 'hap'), 'hap', { chunks: 4 });
  assert.throws(() => hapDecode(good, 0, good.length - 9, new Uint8Array(4096)), coded('hap-bad'));
  assert.throws(() => decodeFrame(good, 'Hap1', 256, 64), coded('hap-bad')); // the texture is half the expected size
});

/** A copy of b with the n-th occurrence of FourCC `from` renamed to `to` (to break one table of the index). */
function renameAtom(b, from, to, n = 0) {
  const c = Uint8Array.from(b), key = Buffer.from(from, 'latin1');
  let p = -1; for (let k = 0; k <= n; k++) p = Buffer.from(c.buffer).indexOf(key, p + 1);
  assert.ok(p > 0, `${from} #${n} found`);
  c.set(Buffer.from(to, 'latin1'), p);
  return c;
}

// Fails if an unreadable sample table hides the codec (an H.264 file must still say "H.264, not HAP", not "corrupt"),
// or if a broken audio track sinks a good HAP clip instead of playing it silent with a warning.
test('errors: a broken table still names a foreign codec; a broken audio track only warns', async () => {
  const avc = makeHap({ fourcc: 'avc1', frames: 3 }).bytes;
  await assert.rejects(probe(file(renameAtom(avc, 'stsz', 'xxxx'))), (e) => coded('not-hap')(e) && e.codecName === 'H.264');
  const hap = makeHap({ frames: 3 }).bytes;
  await assert.rejects(probe(file(renameAtom(hap, 'stsz', 'xxxx'))), coded('mov-bad'));
  const withAudio = makeHap({ frames: 3, audio: { codec: 'sowt' } }).bytes;
  const p = await probe(file(renameAtom(withAudio, 'stsc', 'xxxx', 1))); // the audio track's stsc
  assert.equal(p.video.frames, 3);
  assert.equal(p.audio.supported, false);
  assert.deepEqual(p.warnings.map((w) => w.code), ['audio-unsupported']);
});

/** Offset of the first top-level atom of that type. */
function findAtom(b, type) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let p = 0; p + 8 <= b.length;) {
    let size = dv.getUint32(p); const t = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (size === 1) size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12);
    if (t === type) return p;
    p += size;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------- audio

// Fails if the byte order is confused (twos read as little-endian, or `enda` ignored so in24/fl32 LE come out as
// garbage), if the 24-bit sign extension is lost (the ramp goes negative), if the sound description version is
// misread (v1/v2 offsets), or if the chunk mapping is wrong (8000 Hz at 30 fps = chunks of 266/267 frames).
test('audio: 16-bit LE and BE, 24-bit, 32-bit and float (v0, v1 with enda, v2 lpcm) return the known ramp', () => {
  const cases = [
    [{ codec: 'sowt' }, 's16le'], [{ codec: 'twos' }, 's16be'], [{ codec: 'twos', bits: 8, channels: 1 }, 's8'],
    [{ codec: 'in24', le: true }, 's24le'], [{ codec: 'in24' }, 's24be'], [{ codec: 'in24', le: true, endaDirect: true }, 's24le'],
    [{ codec: 'in32' }, 's32be'], [{ codec: 'in32', le: true }, 's32le'],
    [{ codec: 'fl32' }, 'f32be'], [{ codec: 'fl32', le: true }, 'f32le'], [{ codec: 'fl64', le: true }, 'f64le'], [{ codec: 'fl64' }, 'f64be'],
    [{ codec: 'lpcm' }, 's16le'], [{ codec: 'lpcm', bits: 24, le: false }, 's24be'], [{ codec: 'lpcm', bits: 32, float: true }, 'f32le'],
    [{ codec: 'lpcm', bits: 32, channels: 6, rate: 11025 }, 's32le'], [{ codec: 'sowt', channels: 1 }, 's16le'], [{ codec: 'sowt', channels: 16 }, 's16le'],
  ];
  for (const [audio, encoding] of cases) {
    const { bytes, truth } = makeHap({ frames: 9, perChunk: (audio.channels || 2) === 1 ? 2 : 1, audio });
    const a = index(bytes).audio, A = truth.audio, label = JSON.stringify(audio);
    assert.ok(a && a.supported, `${label}: ${a && a.reason}`);
    assert.equal(a.encoding, encoding, label);
    assert.equal(a.version, A.version, label);
    assert.deepEqual([a.channels, a.rate, a.frames], [A.channels, A.rate, A.frames], label);
    assert.ok(A.chunkFrames.some((n) => n !== A.chunkFrames[0]), 'the fixture has chunks of different sizes (several stsc entries)');
    const read = memRead(bytes), ch = A.channels;
    assert.deepEqual(readPcm(read, a, 0, a.frames), A.samples, `${label}: the whole ramp`);
    const s = 300, n = 700; // a range that starts and ends inside chunks
    assert.deepEqual(readPcm(read, a, s, n), A.samples.subarray(s * ch, (s + n) * ch), `${label}: a range across chunks`);
    const tail = readPcm(read, a, a.frames - 10, 30); // past the end: silence
    assert.deepEqual(tail.subarray(0, 10 * ch), A.samples.subarray((a.frames - 10) * ch));
    assert.ok(tail.subarray(10 * ch).every((x) => x === 0));
    const head = readPcm(read, a, -5, 10); // before the start: silence
    assert.ok(head.subarray(0, 5 * ch).every((x) => x === 0));
    assert.deepEqual(head.subarray(5 * ch), A.samples.subarray(0, 5 * ch));
  }
});

test('audio: the byte ranges of a read cover exactly the frames asked for', () => {
  const { bytes } = makeHap({ frames: 9, audio: { codec: 'in24', le: true } });
  const a = index(bytes).audio;
  const r = pcmRanges(a, 250, 600);
  assert.ok(r.length >= 3, 'the range spans several chunks');
  assert.equal(r.reduce((s, g) => s + g.frames, 0), 600);
  assert.equal(r[0].outFrame, 0);
  r.forEach((g, i) => { assert.equal(g.length, g.frames * 6); if (i) assert.equal(g.outFrame, r[i - 1].outFrame + r[i - 1].frames); });
});

// Fails if a non-PCM track is handed to the PCM reader, or if probe stops warning about it (§4d.3: the clip is
// accepted with "audio will not play (AAC)").
test('audio: AAC is indexed but flagged, probe warns and the reader refuses it', async () => {
  const { bytes } = makeHap({ frames: 6, audio: { codec: 'mp4a' } });
  const a = index(bytes).audio;
  assert.equal(a.supported, false);
  assert.equal(a.reason, 'AAC');
  assert.throws(() => readPcm(memRead(bytes), a, 0, 10), coded('audio-unsupported'));
  const p = await probe(file(bytes));
  assert.equal(p.audio.supported, false);
  assert.ok(Math.abs(p.audio.duration - 0.2) < 1e-9, `the length of a compressed track comes from stts (${p.audio.duration})`);
  assert.deepEqual(p.warnings.map((w) => w.code), ['audio-unsupported']);
  assert.match(p.warnings[0].message, /AAC/);
});

// ---------------------------------------------------------------------------------------------- probe

test('probe: video, audio and no warnings for a HAP Q movie with 24-bit audio', async () => {
  const f = file(makeHap({ variant: 'hapq', frames: 15, fps: 25, audio: { codec: 'in24', le: true, rate: 12000 } }).bytes);
  const p = await probe(f);
  assert.deepEqual(p.video, { fourcc: 'HapY', codecName: 'HAP Q', width: 256, height: 32, fps: 25, frames: 15, duration: 0.6 });
  assert.deepEqual(p.audio, { format: 'in24', codecName: 'PCM s24le', encoding: 's24le', supported: true, channels: 2, rate: 12000, frames: 7200, duration: 0.6 });
  assert.deepEqual(p.warnings, []);
  const silent = await probe(file(makeHap({ variant: 'hapa', frames: 3 }).bytes));
  assert.equal(silent.audio, null);
  assert.equal(silent.video.codecName, 'HAP Alpha');
  assert.throws(() => describeMovie({ video: null, audio: null, tracks: [] }, 100), coded('not-hap'));
});

// ---------------------------------------------------------------------------------------------- PNG and thumbnails

/** A reference PNG reader (8-bit RGB/RGBA, every filter type), written from the specification. */
function decodePng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let p = 8, w = 0, h = 0, ch = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    assert.equal(buf.readUInt32BE(p + 8 + len), zlib.crc32(buf.subarray(p + 4, p + 8 + len)), `${type} CRC`);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8); ch = data[9] === 6 ? 4 : 3; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i], a = i >= ch ? px[y * stride + i - ch] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = i >= ch && y ? px[(y - 1) * stride + i - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + i] = (x + pred) & 255;
    }
  }
  return { width: w, height: h, channels: ch, px, at: (x, y) => Array.from(px.subarray((y * w + x) * ch, (y * w + x) * ch + 3)) };
}

// Fails if a row filter is applied wrongly (the noise and the gradient choose different filters per row) or a CRC is off.
test('png: a reference reader gets back exactly the pixels written (RGB and RGBA)', () => {
  const rnd = rng(7);
  for (const ch of [3, 4]) {
    const w = 37, h = 23, px = new Uint8Array(w * h * ch);
    for (let y = 0; y < h; y++) for (let x = 0; x < w * ch; x++) px[y * w * ch + x] = y < 8 ? Math.floor(rnd() * 256) : (x * 7 + y * 3) & 255;
    const d = decodePng(encodePng(w, h, px, ch));
    assert.deepEqual([d.width, d.height, d.channels], [w, h, ch]);
    assert.deepEqual(d.px, px);
  }
});

const near = (got, want, tol, what) => assert.ok(got.every((v, i) => Math.abs(v - want[i]) <= tol), `${what}: ${got} instead of ${want}`);

// Fails if the thumbnail is flipped (red would land bottom-left), mirrored, or if HAP Q is not converted from YCoCg
// (its "red" would come out as another colour); also if the frame-number stripe is not where the generator put it.
test('thumbnail: the red marker top-left stays top-left (HAP, HAP Alpha, HAP Q), and the stripe reads the frame number', async () => {
  for (const variant of ['hap', 'hapa', 'hapq']) {
    const { bytes, truth } = makeHap({ variant, frames: 30, hap: { chunks: 2 } });
    const f = file(bytes), v = index(bytes).video;
    // the block image: one pixel per 4×4 block, row 0 = top
    for (const fr of [0, 7, 29]) {
      const img = blockImage(decodeFrame(bytes.subarray(v.offsets[fr], v.offsets[fr] + v.sizes[fr]), v.fourcc, 256, 32));
      assert.deepEqual([img.width, img.height], [64, 8]);
      const at = (x, y) => Array.from(img.rgb.subarray(((y >> 2) * 64 + (x >> 2)) * 3, ((y >> 2) * 64 + (x >> 2)) * 3 + 3));
      near(at(0, 0), MARKERS.topLeft, 12, `${variant} block top-left`);
      near(at(255, 0), MARKERS.topRight, 12, `${variant} block top-right`);
      near(at(0, 31), MARKERS.bottomLeft, 12, `${variant} block bottom-left`);
      assert.equal(readStripe(at, 256, 32), fr, `${variant} stripe of frame ${fr}`);
    }
    // the PNGs, at the default frame (10 % of 1 s = frame 3)
    const t = await makeThumbnails(f);
    assert.equal(t.frame, 3);
    assert.equal(t.frame, defaultThumbFrame(v));
    const wide = decodePng(t.wide.png), cell = decodePng(t.cell.png);
    assert.deepEqual([wide.width, wide.height, t.wide.width, t.wide.height], [480, 60, 480, 60]);
    assert.deepEqual([cell.width, cell.height], [160, 90]);
    near(wide.at(2, 2), MARKERS.topLeft, 12, `${variant} wide top-left`);
    near(wide.at(477, 2), MARKERS.topRight, 12, `${variant} wide top-right`);
    near(wide.at(2, 57), MARKERS.bottomLeft, 12, `${variant} wide bottom-left`);
    near(wide.at(477, 57), MARKERS.bottomRight, 12, `${variant} wide bottom-right`);
    assert.equal(readStripe((x, y) => wide.at(Math.floor((x * 480) / 256), Math.floor((y * 60) / 32)), 256, 32), 3, `${variant} wide stripe`);
    // the cell: a centred crop on top, the whole strip as the bottom band (20 px for 8:1)
    near(cell.at(1, 71), MARKERS.topLeft, 12, `${variant} band top-left`);
    near(cell.at(1, 88), MARKERS.bottomLeft, 12, `${variant} band bottom-left`);
    near(cell.at(158, 88), MARKERS.bottomRight, 12, `${variant} band bottom-right`);
    assert.ok(t.cell.png.length < 8 * 1024, `the cell PNG is small (${t.cell.png.length} B)`);
    assert.equal(truth.frames, 30);
  }
  const t = await makeThumbnails(file(makeHap({ frames: 12 }).bytes), { frame: 11 });
  assert.equal(t.frame, 11);
});

test('thumbnail: a 16:9 clip fills the cell with no band', () => {
  const img = { width: 4, height: 3, rgb: new Uint8Array(4 * 3 * 3).fill(200) };
  img.rgb.set([255, 0, 0], 0);
  const { wide, cell } = thumbnailImages(img, 16, 9);
  assert.deepEqual([wide.width, wide.height], [480, 270]);
  assert.deepEqual(Array.from(cell.rgb.subarray(0, 3)), [255, 0, 0]);
  assert.deepEqual(Array.from(cell.rgb.subarray((89 * 160 + 159) * 3, (89 * 160 + 159) * 3 + 3)), [200, 200, 200]);
});

test('fixtures: generated files are written to a temp folder and stay under 200 kB', () => {
  const f = path.join(tmp, 'big.mov');
  const truth = writeHap(f, { variant: 'hapq', frames: 30, audio: { codec: 'fl32', le: true } });
  assert.equal(truth.frames, 30);
  assert.ok(fs.statSync(f).size < 200 * 1024, `${fs.statSync(f).size} B`);
});
