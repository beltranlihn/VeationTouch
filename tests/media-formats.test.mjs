// Media formats in the engine (docs/research/media-formats.md, round 1: still images, sounds, H.264 in MP4): what a file IS
// from its bytes, the headers of every image format, the WAV reader, the MP4 demux (B-frame order, sync samples, variable
// rate, rotation, edit lists, AAC), the validation messages, the transport of a still image, the show's media kinds, the
// import into the library, the link to the media helper and its HTTP routes. Node only: what needs Chromium (decoding a
// picture, a video frame, AAC) is in tests/media-page.test.mjs. Every file is written by tests/fixtures/media/*.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { MediaEngine } from '../engine/media/index.js';
import { normalizeShow, STILL_SECONDS } from '../engine/media/show.js';
import { Transport, playhead, endsAt } from '../engine/media/transport.js';
import { clipSettings } from '../engine/media/show.js';
import { sniffKind, imageInfo, reducedSize } from '../engine/media/sniff.js';
import { parseWav } from '../engine/media/wav.js';
import { movIndex, describeVideo } from '../engine/media/mov.js';
import { HelperLink } from '../engine/media/helper.js';
import { makeHap } from './fixtures/media/make-hap.mjs';
import { makeMp4 } from './fixtures/media/make-mp4.mjs';
import { pngFile, pngHead, jpegHead, webpHead, gifFile, bmpFile, avifHead, wavFile, OTHER, markerPicture } from './fixtures/media/make-image.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'media', name));

async function until(fn, ms = 8000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}

/** A media engine on a temp data folder (as media-library.test.mjs builds it), for a room whose canvas is 256×32. */
function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-fmt-'));
  const usb = path.join(dir, 'usb'); fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  let profile = normalizeProfile({ name: 'Test room', canvas: { width: 256, height: 32 }, walls: [{ id: 'W1', width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 256, h: 32 } }] });
  let media;
  media = new MediaEngine({
    store, log: quiet, settings, profile: () => profile, checkMs: 3600000,
    setShowId: (id) => { profile = normalizeProfile({ ...profile, media: { ...profile.media, showId: id } }); media.profileChanged(profile); },
  });
  media.profileChanged(profile);
  media.start();
  return {
    dir, usb, store, media,
    close: async () => { await media.stop(); fs.rmSync(dir, { recursive: true, force: true }); },
    file: (name, bytes) => { const f = path.join(usb, name); fs.writeFileSync(f, bytes); return f; },
    import: (paths, target = null) => media.importFiles(paths, target, { __local: true }),
    show: () => media.show,
  };
}

/** A page for the engine's helper: takes jobs and answers them with `handler(job)` (the real one is ui/js/helper/helper.js). */
function fakeHelper(media, handler) {
  let on = true;
  const seen = [];
  (async () => {
    while (on) {
      const job = await media.helper.next();
      if (!job) continue;
      seen.push(job);
      Promise.resolve().then(() => handler(job)).then((r) => media.helper.done(job.id, r), (e) => media.helper.done(job.id, { error: e.message, code: e.code }));
    }
  })();
  return { seen, stop: () => { on = false; } };
}

// ---------------------------------------------------------------------------------------------- what a file is

// Fails if the kind is read from the extension or the wrong magic number is looked at, if any image header gives another
// size than the one written (a swapped IHDR field, a JPEG EXIF rotation ignored, a VP8L bit field off by one), or if the
// animation flags are not read.
test('sniff: every format by its bytes, and the size of every image header equals what the fixture wrote', () => {
  const k = (b) => { const s = sniffKind(b); return `${s.kind}/${s.format}`; };
  assert.equal(k(pngFile(8, 4)), 'image/png');
  assert.equal(k(jpegHead(10, 6)), 'image/jpeg');
  assert.equal(k(webpHead(10, 6)), 'image/webp');
  assert.equal(k(gifFile(5, 4)), 'image/gif');
  assert.equal(k(bmpFile(8, 8)), 'image/bmp');
  assert.equal(k(avifHead(10, 6)), 'image/avif');
  assert.equal(k(wavFile()), 'wav/wav');
  assert.equal(k(fixture('h264-markers.mp4')), 'mov/mov');
  for (const [name, want] of Object.entries({ heic: 'unsupported/heic', tiff: 'unsupported/tiff', psd: 'unsupported/psd', exr: 'unsupported/exr', svg: 'unsupported/svg',
    mp3: 'audio/mp3', flac: 'audio/flac', ogg: 'audio/ogg', adts: 'audio/aac', aiff: 'unsupported/aiff', avi: 'unsupported/avi', webm: 'webm/webm', text: 'unknown/null' })) {
    assert.equal(k(OTHER[name]), want, name);
  }
  const dims = (b) => { const s = sniffKind(b), i = imageInfo(b, s.format, s.brand); return i && [i.width, i.height]; };
  assert.deepEqual(dims(pngFile(37, 11)), [37, 11]);
  assert.deepEqual(dims(pngHead(20000, 912)), [20000, 912]);
  assert.deepEqual(dims(jpegHead(4000, 3000)), [4000, 3000]);
  assert.deepEqual(dims(jpegHead(4000, 3000, { progressive: true })), [4000, 3000]);
  assert.deepEqual(dims(jpegHead(4000, 3000, { orientation: 6 })), [3000, 4000], 'a phone photo stored sideways (EXIF 6) is 3000×4000 upright');
  assert.deepEqual(dims(webpHead(321, 123, 'lossy')), [321, 123]);
  assert.deepEqual(dims(webpHead(321, 123, 'lossless')), [321, 123]);
  assert.deepEqual(dims(webpHead(7196, 912, 'extended')), [7196, 912]);
  assert.deepEqual(dims(gifFile(30, 20)), [30, 20]);
  assert.deepEqual(dims(bmpFile(24, 16)), [24, 16]);
  assert.deepEqual(dims(avifHead(1920, 1080)), [1920, 1080]);
  assert.equal(imageInfo(gifFile(3, 3, 1), 'gif').animated, false);
  assert.equal(imageInfo(gifFile(3, 3, 3), 'gif').animated, true);
  assert.equal(imageInfo(webpHead(9, 9, 'extended', { animated: true }), 'webp').animated, true);
  assert.equal(imageInfo(pngHead(9, 9, { animated: true }), 'png').animated, true);
  assert.equal(imageInfo(pngHead(9, 9, { bitDepth: 16 }), 'png').bitDepth, 16);
  assert.equal(imageInfo(avifHead(9, 9, { sequence: true }), 'avif', 'avis').animated, true);
  assert.equal(imageInfo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'png'), null, 'a header that does not read is null');
});

test('sniff: an image larger than the GPU texture or 64 Mpx is reduced to fit, keeping its aspect; smaller ones are left alone', () => {
  assert.equal(reducedSize(7196, 912), null);
  assert.deepEqual(reducedSize(20000, 1000), { width: 16384, height: 819 });
  const r = reducedSize(12000, 12000); // 144 Mpx: the pixel budget decides
  assert.ok(r.width * r.height <= 64 * 1024 * 1024 && r.width <= 16384 && Math.abs(r.width / r.height - 1) < 0.001, JSON.stringify(r));
});

// ---------------------------------------------------------------------------------------------- WAV

// Fails if the endianness, the 8-bit offset or the 24-bit sign extension are crossed, if the chunk before `data` is not
// skipped, or if the byte ranges the PCM route reads are not the data chunk's.
test('wav: 8 / 16 / 24 / 32-bit integer and 32 / 64-bit float read back to the values written, a chunk before the data is skipped, extensible headers work', async () => {
  const { pcmRanges, decodePcm } = await import('../engine/media/pcm.js');
  const sample = (i, c) => Math.sin(i * 0.37 + c * 1.1) * 0.8;
  for (const o of [{ bits: 8 }, { bits: 16 }, { bits: 24 }, { bits: 32 }, { bits: 32, float: true }, { bits: 64, float: true }, { bits: 16, extensible: true }, { bits: 24, extensible: true }]) {
    const bytes = wavFile({ frames: 200, channels: 2, rate: 44100, sample, ...o });
    const a = parseWav((off, len) => bytes.subarray(off, off + len), bytes.length);
    assert.equal(a.frames, 200, JSON.stringify(o)); assert.equal(a.channels, 2); assert.equal(a.rate, 44100);
    const out = new Float32Array(50 * 2), [g] = pcmRanges(a, 120, 50);
    decodePcm(bytes.subarray(g.offset, g.offset + g.length), a, out, 0, 50);
    const tol = { 8: 1 / 64, 16: 1 / 16384, 24: 1e-6, 32: 1e-6, 64: 1e-6 }[o.bits];
    for (let i = 0; i < 50; i++) for (let c = 0; c < 2; c++) assert.ok(Math.abs(out[i * 2 + c] - sample(120 + i, c)) <= tol, `${JSON.stringify(o)} frame ${120 + i} ch ${c}: ${out[i * 2 + c]} vs ${sample(120 + i, c)}`);
  }
  assert.throws(() => parseWav(() => Buffer.from('nope'), 4), /not a WAVE/);
  const bad = wavFile(); bad[20] = 6; // A-law
  assert.throws(() => parseWav((o, l) => bad.subarray(o, o + l), bad.length), /A-law/);
});

// ---------------------------------------------------------------------------------------------- MP4 demux

// Fails if ctts is ignored (frames in the wrong order: the presentation order of an I-P-B stream is not the decode
// order), if stss is ignored (every sample would be a keyframe: a seek would start decoding mid-GOP), if the variable
// frame rate is not seen, if the rotation of the tkhd matrix is not read, or if the edit list does not move the times.
test('mp4 demux: composition offsets give the presentation order, stss the keyframes, stts the variable rate, tkhd the rotation, elst the start', () => {
  // I P B B P B B: decoded in the order I0 P3 B1 B2 P6 B4 B5 (the numbers are the presentation positions); offsets of one frame
  // (1000 ticks) keep the first one at or after 0, and the edit list (mediaTime 1000) takes that frame off the start again
  const cts = [1000, 3000, 0, 0, 3000, 0, 0], dur = Array(7).fill(1000);
  const { bytes, truth } = makeMp4({ durations: dur, cts, sync: [0, 4], rotation: 90, edit: { mediaTime: 1000, segment: 6000 }, avc: { profile: 100, level: 40, chroma: 2, depth: 10 } });
  const ix = movIndex((o, l) => bytes.subarray(o, o + l), bytes.length), v = ix.video;
  assert.equal(v.fourcc, 'avc1'); assert.equal(v.count, 7); assert.equal(v.width, 64);
  assert.deepEqual([...v.offsets], truth.offsets); assert.deepEqual([...v.sizes], truth.sizes);
  assert.deepEqual([...v.native.order], [0, 2, 3, 1, 5, 6, 4], 'presentation order from dts + ctts: the samples sorted by when they are SHOWN');
  assert.ok(v.present.every((t, i) => Math.abs(t - truth.pts[i]) < 1e-9), `present ${[...v.present]} vs ${truth.pts}`);
  assert.deepEqual([...v.native.sync], [0, 4]);
  assert.equal(v.native.rotation, 90);
  assert.ok(Math.abs(v.shift - truth.shift) < 1e-9, `the edit list moves the track by ${v.shift}`);
  assert.equal(v.native.codecString, 'avc1.640028');
  assert.equal(v.native.bitDepth, 10); assert.equal(v.native.chroma, '4:2:2');
  // rotations
  for (const rot of [0, 90, 180, 270]) { const m = makeMp4({ rotation: rot }); assert.equal(movIndex((o, l) => m.bytes.subarray(o, o + l), m.bytes.length).video.native.rotation, rot, `rotation ${rot}`); }
  // a variable frame rate: durations of 1000 and 2000 ticks
  const vf = makeMp4({ durations: [1000, 1000, 2000, 1000, 2000, 1000], cts: null });
  const d = describeVideo(movIndex((o, l) => vf.bytes.subarray(o, o + l), vf.bytes.length), vf.bytes.length);
  assert.equal(d.video.vfr, true); assert.ok(Math.abs(d.video.fps - 5 / (7000 / 30000)) < 0.05, `average rate ${d.video.fps}`);
  const cf = makeMp4({});
  const dc = describeVideo(movIndex((o, l) => cf.bytes.subarray(o, o + l), cf.bytes.length), cf.bytes.length);
  assert.equal(dc.video.vfr, false); assert.equal(dc.video.fps, 30); assert.equal(dc.video.frames, 12); assert.equal(dc.video.gop, 1, 'no stss: every sample is a keyframe');
});

test('mp4 demux: the AAC track gives its AudioSpecificConfig, its packets and the priming of the edit list; the codes of describeVideo for what cannot play', () => {
  const m = makeMp4({ audio: true, audioPackets: 10, audioPriming: 1024 });
  const ix = movIndex((o, l) => m.bytes.subarray(o, o + l), m.bytes.length), a = ix.audio;
  assert.equal(a.codec, 'mp4a'); assert.equal(a.aac.codecString, 'mp4a.40.2'); assert.deepEqual([...a.aac.config], [0x11, 0x88]);
  assert.equal(a.aac.count, 10); assert.deepEqual([...a.aac.offsets], m.truth.audioOffsets); assert.deepEqual([...a.aac.sizes], m.truth.audioSizes);
  assert.ok(Math.abs(a.shift - (-1024 / 48000)) < 1e-9, `the priming (1024 samples) is the edit list's start: shift ${a.shift}`);
  const d = describeVideo(ix, m.bytes.length);
  assert.equal(d.audio.decodable, true); assert.equal(d.audio.codecName, 'AAC');
  const code = (b) => { try { describeVideo(movIndex((o, l) => b.subarray(o, o + l), b.length), b.length); return 'ok'; } catch (e) { return e.code; } };
  assert.equal(code(makeMp4({ codec: 'hvc1' }).bytes), 'codec-later');
  assert.equal(code(makeMp4({ codec: 'apcn' }).bytes), 'no-video-codec');
  assert.equal(code(makeMp4({ fragmented: true }).bytes), 'fragmented');
  const cut = makeMp4({}).bytes; // the index points past the end: a copy cut short
  const cutV = movIndex((o, l) => cut.subarray(o, o + l), cut.length);
  assert.throws(() => describeVideo(cutV, 100), (e) => e.code === 'truncated');
});

// ---------------------------------------------------------------------------------------------- the transport of a still

// Fails if a still with no `out` ends (a held image must stay until something replaces it), if its frame moves, or if an
// autopilot still does not move on after its default length.
test('transport: a still image with no out is always there (never done, frame 0); with an out or on the autopilot it runs its segment', () => {
  const show = normalizeShow({
    id: 's', name: 'S', canvas: { width: 256, height: 32 },
    media: [
      { id: 'mi', kind: 'image', file: 's/a.png', size: 10, video: { fourcc: 'IMG ', width: 64, height: 32, fps: 30, frames: 1, duration: STILL_SECONDS }, image: { format: 'png', width: 64, height: 32 } },
      { id: 'mh', file: 's/h.mov', size: 10, video: { fourcc: 'Hap1', width: 64, height: 32, fps: 30, frames: 30, duration: 1 } },
    ],
    clips: [{ id: 'still', mediaId: 'mi', end: 'hold' }, { id: 'timed', mediaId: 'mi', end: 'hold', out: 3 }, { id: 'auto', mediaId: 'mi', end: 'next' }, { id: 'hap', mediaId: 'mh', end: 'hold' }],
    layers: [{ id: 'L1' }],
  });
  let t = 0;
  const tr = new Transport({ now: () => t, settings: clipSettings, preroll: 0 });
  tr.setShow(show);
  const play = (clipId) => { t += 10; tr.trigger({ clipId, layerId: 'L1', transitionMs: 0 }); return tr.state().layers.L1.play; };
  const p = play('still');
  assert.equal(p.kind, 'image'); assert.equal(p.still, true); assert.equal(p.endless, true); assert.equal(p.endsAt, null);
  for (const dt of [0, 2000, 60000, 3600000]) { const h = playhead(p, p.startAt + dt); assert.deepEqual([h.frame, h.done, h.time], [0, false, 0], `after ${dt} ms`); }
  const q = play('timed');
  assert.equal(q.endless, false); assert.ok(q.endsAt > q.startAt && Math.abs(q.endsAt - q.startAt - 3000) < 1);
  assert.equal(playhead(q, q.startAt + 2000).done, false); assert.equal(playhead(q, q.startAt + 3500).done, true, 'a still with an out ends at it, like any clip');
  const a = play('auto');
  assert.equal(a.endless, false); assert.ok(Math.abs(endsAt(a) - a.startAt - STILL_SECONDS * 1000) < 1, 'an autopilot still moves on after its default length');
  const h = play('hap');
  assert.equal(h.kind, 'hap'); assert.equal(h.still, undefined);
  assert.ok(Math.abs(endsAt(h) - h.startAt - 1000) < 1, 'a HAP clip with hold ends after its pass, as before');
});

test('show: media kinds — a schema-1 show is all HAP; image, video and audio media are kept with what the player needs; a HAP medium that is not HAP is dropped', () => {
  const s = normalizeShow({
    id: 'k', name: 'K',
    media: [
      { id: 'a', file: 'k/a.mov', video: { fourcc: 'Hap1', width: 64, height: 32, fps: 30, frames: 30, duration: 1 } },
      { id: 'b', kind: 'image', file: 'k/b.png', video: { fourcc: 'IMG ', width: 64, height: 32, fps: 30, frames: 1, duration: 10 }, image: { format: 'png', width: 20000, height: 32, animated: true, reduced: { width: 16384, height: 26 } }, notes: ['x'] },
      { id: 'c', kind: 'video', file: 'k/c.mp4', video: { fourcc: 'avc1', codec: 'avc1.64000a', width: 64, height: 32, fps: 30, frames: 60, duration: 2, rotation: 90, gop: 15, vfr: true } },
      { id: 'd', kind: 'audio', file: 'k/d.wav', audio: { format: 's16le', supported: true, channels: 2, rate: 48000, frames: 96000, duration: 2 } },
      { id: 'e', file: 'k/e.mov', video: { fourcc: 'avc1', width: 64, height: 32 } },
    ],
    clips: [{ id: 'cd', mediaId: 'd' }],
  });
  assert.deepEqual(s.media.map((m) => [m.id, m.kind]), [['a', 'hap'], ['b', 'image'], ['c', 'video'], ['d', 'audio']], 'a HAP-kind medium that is not HAP (e) is dropped, the others keep their kind');
  assert.equal(s.schema, 2);
  assert.deepEqual(s.media[1].image, { format: 'png', width: 20000, height: 32, animated: true, reduced: { width: 16384, height: 26 } });
  assert.deepEqual([s.media[2].video.codec, s.media[2].video.rotation, s.media[2].video.gop, s.media[2].video.vfr], ['avc1.64000a', 90, 15, true]);
  assert.equal(s.media[3].video.duration, 2, 'a sound is given a synthetic video track: its length in the transport');
  assert.equal(s.media[3].video.frames, 60);
  assert.deepEqual(s.media[1].notes, ['x']);
  assert.equal(s.clips.length, 1, 'a clip of a sound is a clip');
  assert.deepEqual(normalizeShow(s), s, 'normalising twice changes nothing');
});

// ---------------------------------------------------------------------------------------------- import

// Fails if an image is refused for its extension or its size, if its pixel size is not the header's, if an animated or
// oversized image is accepted without its warning, or if a format we cannot read does not say which it is.
test('import: images are accepted by their bytes (any extension), with their size, flags and warnings; the formats we cannot read say which they are, all refusals in one list', async () => {
  const r = rig();
  try {
    const files = [
      r.file('photo.png', pngFile(64, 32)), r.file('no-extension', jpegHead(4000, 3000)), r.file('banner.dat', webpHead(7196, 912, 'extended')),
      r.file('anim.gif', gifFile(30, 20, 3)), r.file('huge.png', pngHead(20000, 912)), r.file('deep.png', pngHead(64, 32, { bitDepth: 16 })),
      r.file('scan.bmp', bmpFile(8, 8)),
      r.file('photo.heic', OTHER.heic), r.file('scan.tif', OTHER.tiff), r.file('logo.svg', OTHER.svg), r.file('notes.txt', OTHER.text), r.file('broken.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])),
      r.file('clip.webm', OTHER.webm), r.file('old.avi', OTHER.avi), r.file('song.mp3', OTHER.mp3),
    ];
    const res = await r.import(files, { layerId: 'L1', column: 0 });
    const ok = Object.fromEntries(res.accepted.map((x) => [x.name, x.warnings]));
    assert.deepEqual(Object.keys(ok).sort(), ['anim.gif', 'banner.dat', 'deep.png', 'huge.png', 'no-extension', 'photo.png', 'scan.bmp']);
    assert.deepEqual(ok['photo.png'], ['This clip is 64×32; the room canvas is 256×32. It will be stretched (change Fit).']);
    assert.ok(ok['anim.gif'].includes('Animated image: only the first frame plays. Export it as a video.'));
    assert.ok(ok['huge.png'].some((w) => w === 'Image larger than 16384 px or 64 Mpx: reduced from 20000×912 to 16384×747.'), JSON.stringify(ok['huge.png']));
    assert.ok(ok['deep.png'].includes('16-bit image: shown as 8-bit.'));
    assert.deepEqual(ok['banner.dat'], ['This clip is 7196×912; the room canvas is 256×32. It will be stretched (change Fit).'], 'a strip is accepted whatever its name');
    const why = Object.fromEntries(res.rejected.map((x) => [x.name, x.message]));
    assert.deepEqual(why, {
      'photo.heic': '"photo.heic" is HEIC, which cannot be read. Export it as PNG or JPEG.',
      'scan.tif': '"scan.tif" is TIFF, which cannot be read. Export it as PNG or JPEG.',
      'logo.svg': '"logo.svg" is SVG, which cannot be read. Export it as PNG or JPEG.',
      'notes.txt': '"notes.txt" is not a file VEATION Touch can read. It takes HAP or H.264 video, PNG / JPEG / WebP images and WAV / MP3 / AAC audio.',
      'broken.png': '"broken.png" is a damaged PNG: its header does not read. Export it again as PNG or JPEG.',
      'clip.webm': '"clip.webm" is WebM, which cannot be read. Export it as H.264 (MP4) or HAP. Or use Convert to HAP.',
      'old.avi': '"old.avi" is AVI, which cannot be read. Export it as H.264 (MP4) or HAP. Or use Convert to HAP.',
      'song.mp3': '"song.mp3" can only be read by the desktop app, which has the decoders. Import it there.',
    });
    // the show: kind, the pixel size the mixer will have (a reduced image is the reduced size), the image block, a clip each in the grid
    const show = r.show(), by = (f) => show.media.find((m) => m.file.endsWith(f));
    assert.equal(by('photo.png').kind, 'image'); assert.equal(by('photo.png').video.width, 64);
    assert.deepEqual([by('no-extension').video.width, by('no-extension').video.height], [4000, 3000]);
    assert.deepEqual([by('huge.png').video.width, by('huge.png').video.height], [16384, 747]);
    assert.deepEqual(by('huge.png').image, { format: 'png', width: 20000, height: 912, animated: false, reduced: { width: 16384, height: 747 } });
    assert.equal(by('anim.gif').image.animated, true);
    assert.equal(show.clips.length, 7);
    assert.ok(by('anim.gif').notes.includes('Animated image: only the first frame plays. Export it as a video.'), 'the warnings stay with the medium');
    assert.ok(res.accepted.every((x) => x.copying), 'they are copied into the library like any clip');
    await until(() => [...r.media.jobs.values()].every((j) => j.state === 'done'));
    for (const m of show.media) assert.ok(fs.existsSync(path.join(r.media.libraryDir, ...m.file.split('/'))), m.file);
  } finally { await r.close(); }
});

// Fails if a WAV is not accepted or its PCM is not the file's, sample for sample, through the PCM route the audio page uses.
test('import: a WAV is a sound clip (kind audio, length from its samples) and the PCM route serves its samples exactly', async () => {
  const r = rig();
  try {
    const sample = (i, c) => Math.sin(i * 0.011 + c) * 0.7;
    const wav = wavFile({ frames: 48000 * 2, channels: 2, rate: 48000, bits: 16, sample });
    const res = await r.import([r.file('tone.wav', wav)], { layerId: 'L1', column: 0 });
    assert.deepEqual(res.rejected, []);
    const m = r.show().media[0];
    assert.equal(m.kind, 'audio'); assert.equal(m.audio.supported, true); assert.equal(m.audio.format, 's16le');
    assert.deepEqual([m.audio.channels, m.audio.rate, m.audio.frames, m.audio.duration], [2, 48000, 96000, 2]);
    assert.equal(m.video.duration, 2); assert.equal(m.video.frames, 60);
    await until(() => [...r.media.jobs.values()].every((j) => j.state === 'done'));
    const pcm = await r.media.pcm({ media: m.id, from: 1000, n: 500 });
    assert.deepEqual([pcm.encoding, pcm.channels, pcm.rate, pcm.frames, pcm.total], ['s16le', 2, 48000, 500, 96000]);
    for (let i = 0; i < 500; i += 37) for (let c = 0; c < 2; c++) assert.equal(pcm.body.readInt16LE((i * 2 + c) * 2), Math.round(sample(1000 + i, c) * 32767), `frame ${1000 + i} channel ${c}`);
    // it plays: the clip launches, as an audio-only play (no picture for the mixer)
    const clip = r.show().clips[0];
    assert.equal(clip.end, 'clear', 'a sound on a looping layer ends after one pass (it is audible)');
    await r.media.command('clip.trigger', { clipId: clip.id, layerId: 'L1', transitionMs: 0 });
    const play = r.media.transport.state().layers.L1.play;
    assert.equal(play.kind, 'audio'); assert.equal(play.audio, true); assert.ok(Math.abs(play.out - play.in - 2) < 0.01, 'the play lasts the sound');
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- H.264 import

// Fails if a real H.264 MP4 is refused, if its codec string, size, B-frame-aware frame count or GOP are not what the file
// has, if the audio track is not offered for decoding, or if, with a helper that says this computer cannot decode it, it is accepted.
test('import: an H.264 MP4 is a video clip; the helper decides whether this computer can decode it (a real decode, hardware or software); without a helper it is accepted with a note', async () => {
  const r = rig();
  try {
    const mp4 = r.file('markers.mp4', fixture('h264-markers.mp4')), click = r.file('click.mp4', fixture('h264-click.mp4'));
    // no helper (the engine alone): accepted, with the note that nothing checked the decoder; the AAC audio will be silent here
    let res = await r.import([mp4, click]);
    assert.deepEqual(res.rejected, []);
    const w = Object.fromEntries(res.accepted.map((x) => [x.name, x.warnings]));
    assert.ok(w['markers.mp4'].includes('Cannot check that this computer can decode "markers.mp4" (no desktop app).'), JSON.stringify(w));
    assert.ok(w['click.mp4'].includes('The audio of "click.mp4" can only be decoded in the desktop app: it will be silent here.'), JSON.stringify(w['click.mp4']));
    const m = r.show().media.find((x) => x.file.endsWith('markers.mp4'));
    assert.equal(m.kind, 'video');
    assert.deepEqual([m.video.fourcc, m.video.codec, m.video.width, m.video.height, m.video.fps, m.video.frames, m.video.duration, m.video.gop, m.video.vfr, m.video.rotation], ['avc1', 'avc1.64000a', 256, 32, 30, 60, 2, 15, false, 0]);
    assert.equal(m.audio, null);
    assert.equal(r.show().media.find((x) => x.file.endsWith('click.mp4')).audio.supported, false);
    await r.close();
  } finally { /* closed above */ }
  // with a helper
  for (const [name, answer, expect] of [
    ['gpu', { ok: true, hardware: true }, { rejected: 0, notes: [] }],
    ['cpu', { ok: true, hardware: false }, { rejected: 0, notes: ['"v.mp4" is decoded by the CPU on this computer, not the GPU: it may drop frames. Use Convert to HAP.'] }],
    ['none', { ok: false, reason: 'no-decoder' }, { rejected: 1, message: '"v.mp4" is H.264 and this computer has no decoder for it. Export it as H.264 or HAP. Or use Convert to HAP.' }],
    ['big', { ok: false, reason: 'too-big', limit: '4096×4096' }, { rejected: 1, message: '"v.mp4" is 256×32 H.264, larger than this GPU decodes (4096×4096). Export it smaller, as HEVC, or as HAP. Or use Convert to HAP.' }],
  ]) {
    const q = rig();
    const h = fakeHelper(q.media, (job) => { assert.equal(job.kind, 'canDecode'); assert.equal(job.codec, 'avc1.64000a'); assert.ok(job.src.startsWith('/api/helper/file/')); return answer; });
    try {
      await until(() => q.media.helper.online, 2000, 'helper online');
      const res = await q.import([q.file('v.mp4', fixture('h264-markers.mp4'))]);
      assert.equal(res.rejected.length, expect.rejected, name);
      if (expect.message) assert.equal(res.rejected[0].message, expect.message, name);
      if (!expect.rejected) assert.deepEqual(res.accepted[0].warnings, expect.notes, name);
      assert.equal(h.seen.length, 1, 'one decode question per video');
    } finally { h.stop(); await q.close(); }
  }
  // a clip wider than the GPU decodes plays by CPU while its pixels a second are within what the room's PC managed (measured: 7196×912 at 30 fps
  // clean, at 45 fps not): the same size at 60 fps is refused, with the rate that would work
  for (const [fps, ticks, expect] of [[30, 1000, { ok: ['"w.mp4" is decoded by the CPU on this computer (38 fps at best), not the GPU: it may drop frames. Use Convert to HAP.', 'This clip is 7196×912; the room canvas is 256×32. It will be stretched (change Fit).'] }], [60, 500, { no: '"w.mp4" is 7196×912 H.264 at 60 fps, and this computer decodes that at about 38 fps. Export it at 30 fps, as HEVC, or as HAP. Or use Convert to HAP.' }]]) {
    const q = rig();
    const h = fakeHelper(q.media, () => ({ ok: true, hardware: false }));
    try {
      await until(() => q.media.helper.online, 2000);
      const res = await q.import([q.file('w.mp4', makeMp4({ width: 7196, height: 912, durations: Array(12).fill(ticks), sync: [0] }).bytes)]);
      if (expect.no) assert.equal(res.rejected[0]?.message, expect.no, `${fps} fps`); else assert.deepEqual(res.accepted[0]?.warnings, expect.ok, `${fps} fps`);
    } finally { h.stop(); await q.close(); }
  }
  // a profile with no decoder here (4:2:2 10-bit) is refused before anyone asks the helper
  const q = rig();
  try {
    const bad = makeMp4({ avc: { profile: 122, level: 40, chroma: 2, depth: 10 }, sync: [0] }).bytes;
    const res = await q.import([q.file('hq.mp4', bad)]);
    assert.equal(res.rejected[0]?.message, '"hq.mp4" is H.264 4:2:2 10-bit, which cannot be decoded here. Export it as 8-bit 4:2:0 (High profile) or HAP. Or use Convert to HAP.');
    const frag = await q.import([q.file('frag.mp4', makeMp4({ fragmented: true }).bytes)]);
    assert.equal(frag.rejected[0]?.message, '"frag.mp4" is a fragmented MP4. Export it with the index at the start (fast start) or as HAP. Or use Convert to HAP.');
  } finally { await q.close(); }
});

// ---------------------------------------------------------------------------------------------- the helper

// Fails if a job is lost or answered twice, if a job is accepted while no page is polling (the import would wait for ever),
// or if a page that answers an error does not reject the job with its code.
test('helper link: a job goes to the polling page and comes back with its answer; with no page it is refused at once; an error answer rejects; stop frees everyone', async () => {
  let t = 1000;
  const link = new HelperLink({ now: () => t });
  await assert.rejects(link.request({ kind: 'x' }), (e) => e.code === 'no-helper');
  const poll = link.next(); // the page's long poll: now it is online
  assert.equal(link.online, true);
  const p = link.request({ kind: 'canDecode', codec: 'avc1' }, { files: { src: '/tmp/a.mp4' } });
  const job = await poll;
  assert.equal(job.kind, 'canDecode'); assert.match(job.src, /^\/api\/helper\/file\/[0-9a-f]{24}$/);
  const token = job.src.split('/').pop();
  assert.equal(link.files.get(token), '/tmp/a.mp4', 'the page may read that file while the job is open');
  assert.equal(link.done(job.id, { ok: true }), true); assert.deepEqual(await p, { ok: true });
  assert.equal(link.files.has(token), false, 'the file is closed again with the job'); assert.equal(link.done(job.id, { ok: false }), false, 'answered once');
  const p2 = link.request({ kind: 'thumb' }); const job2 = await link.next();
  link.done(job2.id, { error: 'cannot decode', code: 'no-decoder' });
  await assert.rejects(p2, (e) => e.code === 'no-decoder' && /cannot decode/.test(e.message));
  t += 60000; assert.equal(link.online, false, 'a page that stopped polling is offline after a while');
  link.next(); const p3 = link.request({ kind: 'x' }); link.stop(); await assert.rejects(p3, (e) => e.code === 'stopped');
});

// ---------------------------------------------------------------------------------------------- the helper's HTTP routes + audio cache

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-hlp-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const base = `http://127.0.0.1:${server.port}`;
  try { return await fn({ engine, base, dir }); } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// Fails if the routes are open to another computer's address (they are not wired to the local check), if ranges of a
// file are wrong (a video is read by pieces), if an answer's body is not written to the job's file, or if the engine
// serves PCM of a sound it is still decoding instead of waiting.
test('helper routes: the page polls, reads a file by ranges, answers with a file; the audio cache it makes is what the PCM route serves — silent (409) until it exists', async () => {
  await withServer(async ({ engine, base, dir }) => {
    const media = engine.media, file = path.join(dir, 'ranged.bin');
    fs.writeFileSync(file, Buffer.from(Array.from({ length: 1000 }, (_, i) => i & 255)));
    // the page
    const poll = fetch(`${base}/api/helper/next`).then(async (r) => (r.status === 200 ? r.json() : null));
    await until(() => media.helper.online, 2000, 'online');
    const req = media.helper.request({ kind: 'probe' }, { files: { src: file } });
    const job = await poll;
    assert.equal(job.kind, 'probe');
    let r = await fetch(base + job.src, { headers: { Range: 'bytes=10-19' } });
    assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 10-19/1000');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    r = await fetch(base + job.src, { headers: { Range: 'bytes=-4' } });
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [(996) & 255, (997) & 255, (998) & 255, (999) & 255].map((x) => x & 255));
    r = await fetch(base + job.src, { headers: { Range: 'bytes=5000-' } }); assert.equal(r.status, 416); await r.arrayBuffer();
    r = await fetch(`${base}/api/helper/done/${job.id}`, { method: 'POST', body: JSON.stringify({ answer: 42 }) });
    assert.equal(r.status, 204); assert.deepEqual(await req, { answer: 42 });
    assert.equal((await fetch(base + job.src)).status, 404, 'the token died with the job');
    // a sound: a medium of the open show whose PCM is in the audio cache
    const sr = 48000, N = sr * 2, pcm = Buffer.alloc(N * 2);
    for (let i = 0; i < N; i++) pcm.writeInt16LE(i < 100 ? 0 : (i % 2000) - 1000, i * 2);
    engine.media.show ?? await engine.command('show.create', { name: 'Cache' }).catch(() => {});
    const show = engine.media.show;
    assert.ok(show, 'a show is open');
    const fp = 'ab'.repeat(20);
    show.media.push({ id: 'ms', file: `${show.id}/song.mp3`, kind: 'audio', size: 100, fingerprint: fp, video: { fourcc: 'AUD ', width: 1, height: 1, fps: 30, frames: 60, duration: 2 }, audio: { format: 's16le', supported: true, cache: true, channels: 1, rate: sr, frames: N, duration: 2 } });
    fs.mkdirSync(path.join(media.libraryDir, show.id), { recursive: true });
    fs.writeFileSync(path.join(media.libraryDir, show.id, 'song.mp3'), 'x');
    await assert.rejects(media.pcm({ media: 'ms', from: 0, n: 100 }), (e) => e.status === 409, 'not decoded yet: quietly silent, asked again');
    // the page decodes (the engine asked: a job came), and answers with the PCM as the body
    const j2 = await fetch(`${base}/api/helper/next`).then((x) => x.json());
    assert.equal(j2.kind, 'audioDecode');
    r = await fetch(`${base}/api/helper/done/${j2.id}`, { method: 'POST', headers: { 'X-VT-Meta': encodeURIComponent(JSON.stringify({ rate: sr, channels: 1, frames: N, startSample: 0 })) }, body: pcm });
    assert.equal(r.status, 204);
    await until(() => fs.existsSync(path.join(media.audioCacheDir, `${fp}.pcm.json`)), 3000, 'the cache sidecar');
    const out = await media.pcm({ media: 'ms', from: 90, n: 20 });
    assert.deepEqual([out.encoding, out.channels, out.rate, out.total], ['s16le', 1, sr, N]);
    assert.deepEqual([out.body.readInt16LE(0), out.body.readInt16LE(2 * 9), out.body.readInt16LE(2 * 10), out.body.readInt16LE(2 * 11)], [0, 0, (100 % 2000) - 1000, (101 % 2000) - 1000], 'sample 100 is the first non-zero one: the cache is the helper\'s PCM as it sent it');
  });
});

// Fails if the helper's routes answer a device that is not this computer.
test('helper routes: a device on the LAN or through the relay gets nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-hlp2-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet, trustLocal: false }); // acts as a tablet: not trusted… but loopback is still "local"
  try {
    const base = `http://127.0.0.1:${server.port}`;
    // (loopback IS this computer: what we check here is that the tunnel stamp — traffic of the relay — is refused)
    engine.cloud = { tunnelToken: 'secret-token', stop() {} };
    for (const p of ['/api/helper/next', '/helper', '/api/helper/file/' + '0'.repeat(24)]) {
      const r = await fetch(base + p, { headers: { 'x-vt-tunnel': 'secret-token', 'x-vt-client-ip': '8.8.8.8' } });
      assert.equal(r.status, 403, p); await r.arrayBuffer();
    }
    const post = await fetch(`${base}/api/helper/done/h1`, { method: 'POST', headers: { 'x-vt-tunnel': 'secret-token' }, body: '{}' });
    assert.equal(post.status, 403);
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------- thumbnails

// Fails if a file that is not HAP has no thumbnail at all (the grid would show a hole), if the helper's PNGs are not what
// is served, or if a generic card is cached for good (the desktop app's helper would never get to replace it).
test('thumbnails: an image gets the helper\'s picture when there is one, a generic card of its kind when there is not (and that card is not cached under the fingerprint)', async () => {
  const r = rig();
  try {
    const res = await r.import([r.file('p.png', pngFile(64, 32))], { layerId: 'L1', column: 0 });
    await until(() => [...r.media.jobs.values()].every((j) => j.state === 'done'));
    const m = r.show().media[0];
    // no helper: a card, never written as the real thumbnail
    let t = await r.media.thumbFile(m.id, 160);
    assert.ok(t.file.endsWith('icon-image-160.png') && t.fingerprint === null, JSON.stringify(t));
    assert.equal(fs.readFileSync(t.file).subarray(1, 4).toString(), 'PNG');
    assert.equal(fs.existsSync(path.join(r.media.thumbsDir, `${m.fingerprint}-160.png`)), false);
    // with a helper that draws
    const png = Buffer.from(pngFile(16, 9)).toString('base64');
    const h = fakeHelper(r.media, (job) => { assert.equal(job.kind, 'thumb'); return { png160: png, png480: png }; });
    await until(() => r.media.helper.online, 2000);
    t = await r.media.thumbFile(m.id, 160);
    assert.equal(t.fingerprint, m.fingerprint); assert.equal(fs.readFileSync(t.file).toString('base64'), png);
    h.stop();
    void res;
  } finally { await r.close(); }
});

// A no-op use of imports kept for the page test of this phase.
void markerPicture; void makeHap;
