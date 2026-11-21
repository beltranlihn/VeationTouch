// Convert to HAP (docs/research/media-formats.md P5), engine side: the HAP writer, the job (progress, one at a time, cancel,
// failure in Problems, clean-up), the clips that switch to the result in ONE show edit, both roads (the helper's parts, and a
// fake ffmpeg run as a separate process), the FFmpeg installer (pinned hash, GPL refused, the licence kept, never the network)
// and the hints on refused files. Node only: the real helper page (WebCodecs + the GPU encoder) is in tests/media-page.test.mjs.
// NOTHING here reaches the network: fetch is replaced for the whole file, and the last test checks it was never asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Store } from '../engine/store.js';
import { normalizeProfile } from '../engine/profile.js';
import { MediaEngine, MEDIA_LOCKED_OPS } from '../engine/media/index.js';
import { HapWriter, CODECS } from '../engine/media/convert.js';
import { FfmpegTool, PIN } from '../engine/media/ffmpeg.js';
import { listZip, extractEntry } from '../engine/media/zip.js';
import { hapFrame, HAP_FMT } from '../engine/media/hapenc.js';
import { decodeFrame } from '../engine/media/hap.js';
import { movIndex, describeMovie } from '../engine/media/mov.js';
import { makeHap, encodeTexture, picture } from './fixtures/media/make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const here = import.meta.dirname;
const FAKE = path.join(here, 'fixtures', 'media', 'fake-ffmpeg.mjs');
const fixture = (name) => fs.readFileSync(path.join(here, 'fixtures', 'media', name));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}

// no network, for the whole file: only this computer answers
const realFetch = globalThis.fetch, outbound = [];
globalThis.fetch = (u, ...rest) => {
  const url = String(u?.url || u);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) { outbound.push(url); return Promise.reject(new Error('no network in tests')); }
  return realFetch(u, ...rest);
};

/** A media engine as media-formats.test.mjs builds it, with the converter's seams: a fake ffmpeg (or none). */
function rig({ ffmpeg = true, converter = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cv-'));
  const usb = path.join(dir, 'usb'); fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  let profile = normalizeProfile({ name: 'Test room', canvas: { width: 256, height: 32 }, walls: [{ id: 'W1', width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 256, h: 32 } }] });
  let media;
  media = new MediaEngine({
    store, log: quiet, settings, profile: () => profile, checkMs: 3600000,
    setShowId: (id) => { profile = normalizeProfile({ ...profile, media: { ...profile.media, showId: id } }); media.profileChanged(profile); },
    converter: { toolDir: path.join(dir, 'tools'), platform: 'win32', ...(ffmpeg ? { ffmpeg: { cmd: process.execPath, args: [FAKE] } } : {}), ...converter },
  });
  media.profileChanged(profile);
  media.start();
  return {
    dir, usb, store, media,
    close: async () => { delete process.env.FAKE_FFMPEG; await media.stop(); fs.rmSync(dir, { recursive: true, force: true }); },
    file: (name, bytes) => { const f = path.join(usb, name); fs.writeFileSync(f, bytes); return f; },
    import: (paths, target = null) => media.importFiles(paths, target, { __local: true }),
    show: () => media.show,
    jobs: () => media.mediaState().import.filter((j) => j.kind === 'convert'),
    convert: (args) => media.command('media.convert', { __local: true, ...args }),
    convertDir: () => path.join(media.libraryDir, '.convert'),
  };
}

/** A page for the engine's helper (as media-formats.test.mjs): takes jobs and answers with `handler(job)`. */
function fakeHelper(media, handler) {
  let on = true;
  (async () => {
    while (on) {
      const job = await media.helper.next();
      if (!job) continue;
      Promise.resolve().then(() => handler(job)).then((r) => media.helper.done(job.id, r), (e) => media.helper.done(job.id, { error: e.message, code: e.code }));
    }
  })();
  return { stop: () => { on = false; } };
}

/** The first layer of the show and an imported MP4 clip on it, with settings that must survive the conversion. */
async function mp4WithClip(r) {
  const layerId = r.media._ensureShow().layers[0].id;
  const res = await r.import([r.file('markers.mp4', fixture('h264-markers.mp4'))], { deckId: r.show().decks[0].id, layerId, column: 2 });
  assert.equal(res.rejected.length, 0);
  const { mediaId, clipId } = res.accepted[0];
  await until(() => !r.media.mediaState().import.some((j) => j.kind !== 'convert' && j.state !== 'done'), 8000, 'the copy into the library');
  const show = structuredClone(r.show());
  Object.assign(show.clips.find((c) => c.id === clipId), { name: 'My clip', color: '#aabbcc', in: 0.1, out: 0.3, loops: 3, end: 'hold', trigger: 'toggle', transitionMs: 500, place: { target: 'canvas', wallId: null, fit: 'fill' }, audio: { gainDb: -6, route: null } });
  await r.media.command('show.update', { show, rev: r.media.showRev });
  return { mediaId, clipId, layerId };
}

// ---------------------------------------------------------------------------------------------- the writer

// Fails if a frame is not what the helper sent (the HAP encoder and the decoder of the library disagree), if a fractional rate
// is cut to an integer timescale (29.97 would read as 29), if PCM does not arrive where the index says, or if a repeated
// frame is stored more than once.
test('hap writer: the movie it writes reads back with its frames, its rate (29.97 too), its PCM, and a repeated frame stored once', async () => {
  const W = 64, H = 16, N = 5;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cvw-'));
  try {
    for (const [fps, codec, fourcc, tex] of [[30, 'hap', 'Hap1', 'dxt1'], [29.97, 'hapq', 'HapY', 'ycocg'], [24, 'hapa', 'Hap5', 'dxt5']]) {
      const file = path.join(dir, `${codec}.mov`), w = new HapWriter(file, { width: W, height: H, fps, codec, audio: { rate: 8000, channels: 2 } });
      await w.open();
      const pcm = new Int16Array(8000 * 2); for (let i = 0; i < pcm.length; i++) pcm[i] = (i * 7) % 2000 - 1000;
      await w.addAudio(new Uint8Array(pcm.buffer, 0, pcm.byteLength / 2)); await w.addAudio(new Uint8Array(pcm.buffer, pcm.byteLength / 2));
      const textures = [];
      for (let f = 0; f < N; f++) {
        const t = encodeTexture(picture(f, W, H), W, H, codec === 'hapa' ? 'hapa' : codec === 'hapq' ? 'hapq' : 'hap'); textures.push(t);
        await w.addFrame(hapFrame(t, codec, f === 0 ? 1 : 2));
      }
      await w.finish();
      const bytes = fs.readFileSync(file), read = (o, l) => bytes.subarray(o, o + l);
      const ix = movIndex(read, bytes.length), d = describeMovie(ix, bytes.length);
      assert.equal(d.video.fourcc, fourcc);
      assert.deepEqual([d.video.width, d.video.height, d.video.frames], [W, H, N]);
      assert.ok(Math.abs(d.video.fps - fps) < 0.01, `${fps} fps reads as ${d.video.fps}`);
      for (let f = 0; f < N; f++) {
        const sample = bytes.subarray(ix.video.offsets[f], ix.video.offsets[f] + ix.video.sizes[f]);
        assert.deepEqual(decodeFrame(sample, fourcc, W, H).data, textures[f], `${codec} frame ${f}`);
      }
      assert.equal(d.audio.supported, true); assert.equal(d.audio.rate, 8000); assert.equal(d.audio.channels, 2); assert.equal(d.audio.frames, 8000);
      const a = ix.audio, first = bytes.subarray(a.chunkOffsets[0], a.chunkOffsets[0] + 8);
      assert.equal(first.readInt16LE(2), pcm[1], 'the PCM is at the chunk offset');
    }
    // a still picture: 30 samples, one stored frame
    const file = path.join(dir, 'still.mov'), w = new HapWriter(file, { width: W, height: H, fps: 30, codec: 'hap' });
    await w.open();
    const t = encodeTexture(picture(0, W, H), W, H, 'hap'), frame = hapFrame(t, 'hap', 1);
    await w.addFrame(frame, 30);
    await w.finish();
    const bytes = fs.readFileSync(file), ix = movIndex((o, l) => bytes.subarray(o, o + l), bytes.length);
    assert.equal(ix.video.count, 30);
    assert.ok(bytes.length < frame.length * 10, `one copy of the frame on disk: ${bytes.length} bytes for a ${frame.length} byte frame`);
    assert.deepEqual(new Set(ix.video.offsets).size, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------- hints on import

// Fails if a file the import refuses (ProRes) carries no `convert: true` and no path to convert (the UI would have nothing to
// offer), if a plain refusal (a TIFF) offers it, or if a software-decoded clip is accepted without the hint.
test('import hints: a refused ProRes carries convert: true and its path, the message says Convert to HAP; a TIFF does not; a CPU-decoded H.264 is accepted with convert: true', async () => {
  const r = rig();
  const h = fakeHelper(r.media, () => ({ ok: true, hardware: false }));
  try {
    const prores = r.file('take.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const tiff = r.file('scan.tif', Buffer.from('II*\0\x08\0\0\0\0\0\0\0\0\0', 'latin1'));
    const res = await r.import([prores, tiff]);
    const p = res.rejected.find((x) => x.name === 'take.mov');
    assert.equal(p.convert, true); assert.equal(p.path, prores);
    assert.match(p.message, /ProRes 422.*Or use Convert to HAP\.$/);
    assert.equal(res.rejected.find((x) => x.name === 'scan.tif')?.convert, undefined, 'a TIFF is not something Convert to HAP takes');
    await until(() => r.media.helper.online, 2000);
    const ok = await r.import([r.file('v.mp4', fixture('h264-markers.mp4'))]);
    assert.equal(ok.accepted[0].convert, true);
    assert.ok(ok.accepted[0].warnings.some((w) => /decoded by the CPU.*Convert to HAP/.test(w)));
    assert.ok(r.show().media.find((m) => m.file.endsWith('v.mp4')).notes.some((n) => /Convert to HAP/.test(n)), 'the note stays with the medium');
  } finally { h.stop(); await r.close(); }
});

// ---------------------------------------------------------------------------------------------- road B: FFmpeg as a process

// Fails if the clips do not switch to the new medium, if a setting of a clip is lost (name, colour, in/out, loops, end, trigger,
// transition, place, audio, its cell), if the original disappears, if the show is edited more than once, or if the job
// does not report progress.
test('convert (FFmpeg road): the result is a new medium, every clip of the source switches to it keeping its settings, in ONE show edit; the original stays; the job shows progress', async () => {
  const r = rig();
  try {
    const { mediaId, clipId } = await mp4WithClip(r);
    const before = structuredClone(r.show()), rev = r.media.showRev;
    const { jobId } = await r.convert({ mediaId, codec: 'hapq', fps: 24, via: 'ffmpeg' });
    let sawProgress = false;
    const job = await until(() => { const j = r.jobs().find((x) => x.id === jobId); if (j && j.state === 'converting' && j.done > 0) sawProgress = true; return j && j.state === 'done' ? j : null; }, 8000, 'the conversion');
    assert.ok(sawProgress || job.done > 0, 'progress was reported');
    assert.equal(job.via, 'ffmpeg'); assert.equal(job.kind, 'convert'); assert.equal(job.mediaId, mediaId);
    assert.equal(r.media.showRev, rev + 1, 'one edit of the show, one revision');
    const show = r.show(), clip = show.clips.find((c) => c.id === clipId), old = before.clips.find((c) => c.id === clipId);
    assert.equal(job.resultMediaId, clip.mediaId); assert.notEqual(clip.mediaId, mediaId);
    const { mediaId: _a, ...keepNow } = clip, { mediaId: _b, ...keepBefore } = old;
    assert.deepEqual(keepNow, keepBefore, 'every setting of the clip is what it was');
    assert.deepEqual(show.decks, before.decks, 'the grid cell still points at the same clip');
    const neu = show.media.find((m) => m.id === clip.mediaId);
    assert.equal(neu.kind, 'hap'); assert.equal(neu.video.fourcc, 'HapY'); assert.match(neu.file, /markers HAPQ\.mov$/);
    assert.ok(show.media.find((m) => m.id === mediaId), 'the original stays in the library');
    assert.ok(fs.existsSync(path.join(r.media.libraryDir, neu.file)));
    assert.deepEqual(fs.readdirSync(r.convertDir()), [], 'no part file is left');
    // the command line: HAP Q, PCM audio, the rate, progress on a pipe
    // (the fake writes it only when asked: this run did not, so check on a second one below)
  } finally { await r.close(); }
});

// Fails if the FFmpeg command line is not the contract (codec, format per HAP variant, PCM audio, rate, progress on stdout).
test('convert (FFmpeg road): the command line — -c:v hap -format hap|hap_q|hap_alpha, -c:a pcm_s16le, -vf fps, -progress pipe:1', async () => {
  for (const [codec, fmt, fps] of [['hap', 'hap', null], ['hapq', 'hap_q', 24], ['hapa', 'hap_alpha', null]]) {
    const r = rig(), log = path.join(r.dir, 'argv.json');
    process.env.FAKE_FFMPEG_LOG = log;
    try {
      const src = r.file('take.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
      const { jobId } = await r.convert({ path: src, codec, fps, via: 'ffmpeg' });
      await until(() => r.jobs().find((x) => x.id === jobId)?.state === 'done', 8000, codec);
      const a = JSON.parse(fs.readFileSync(log, 'utf8'));
      const at = (k) => a[a.indexOf(k) + 1];
      assert.equal(at('-c:v'), 'hap'); assert.equal(at('-format'), fmt); assert.equal(at('-c:a'), 'pcm_s16le'); assert.equal(at('-progress'), 'pipe:1'); assert.equal(at('-i'), src);
      assert.equal(a.includes('-vf'), fps !== null); if (fps) assert.equal(at('-vf'), `fps=${fps}`);
      assert.ok(a.includes('-nostdin') && a.includes('-y'));
      // a file that import refused: the result only joins the library, no clip changes
      assert.equal(r.show().clips.length, 0);
      assert.equal(r.show().media.filter((m) => m.kind === 'hap').length, 1);
    } finally { delete process.env.FAKE_FFMPEG_LOG; await r.close(); }
  }
});

// Fails if cancelling leaves the process running, a .part, a medium in the show, an edit of the show, or the job in the list.
test('convert: cancel stops FFmpeg, removes the part, adds nothing and does not touch the show', async () => {
  const r = rig();
  process.env.FAKE_FFMPEG = 'hang'; process.env.FAKE_FFMPEG_PID = path.join(r.dir, 'pid');
  try {
    const { mediaId } = await mp4WithClip(r);
    const rev = r.media.showRev, media = r.show().media.length;
    const { jobId } = await r.convert({ mediaId, codec: 'hap', via: 'ffmpeg' });
    await until(() => r.jobs().find((x) => x.id === jobId)?.done > 0, 8000, 'progress');
    assert.ok(fs.readdirSync(r.convertDir()).length >= 1, 'a part file exists while it runs');
    const pid = Number(fs.readFileSync(process.env.FAKE_FFMPEG_PID, 'utf8'));
    await r.media.command('media.convertCancel', { jobId });
    assert.deepEqual(r.jobs(), []);
    await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } }, 4000, 'the process to be gone');
    assert.deepEqual(fs.readdirSync(r.convertDir()), []);
    assert.equal(r.media.showRev, rev); assert.equal(r.show().media.length, media);
    assert.deepEqual(r.media.mediaState().problems, [], 'a cancel is not a problem');
    // the next job runs: the queue is not stuck on the cancelled one
    process.env.FAKE_FFMPEG = 'ok';
    const next = await r.convert({ mediaId, codec: 'hap', via: 'ffmpeg' });
    await until(() => r.jobs().find((x) => x.id === next.jobId)?.state === 'done', 8000, 'the next job');
  } finally { delete process.env.FAKE_FFMPEG_PID; await r.close(); }
});

// Fails if two jobs run at once (Unreal shares the PC), or if a queued job is lost.
test('convert: one job at a time — the second waits, and both finish', async () => {
  const r = rig();
  try {
    const a = r.file('a.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes), b = r.file('b.mov', makeHap({ fourcc: 'apcn', frames: 4, width: 128 }).bytes);
    const one = await r.convert({ path: a, codec: 'hap', via: 'ffmpeg' }), two = await r.convert({ path: b, codec: 'hap', via: 'ffmpeg' });
    assert.notEqual(one.jobId, two.jobId);
    const states = r.jobs().map((j) => j.state).sort();
    assert.deepEqual(states, ['converting', 'waiting'], 'the second one waits');
    await until(() => r.jobs().filter((x) => x.state === 'done').length === 2, 8000, 'both jobs');
    // asking again for what is being converted is the same job
    const c = r.file('c.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const x = await r.convert({ path: c, codec: 'hap', via: 'ffmpeg' }), y = await r.convert({ path: c, codec: 'hap', via: 'ffmpeg' });
    assert.equal(x.jobId, y.jobId);
    await until(() => r.jobs().every((j) => j.state === 'done'), 8000);
  } finally { await r.close(); }
});

// Fails if a failed conversion is silent (it must say why, in Problems), leaves a part behind, or cannot be dismissed.
test('convert: a failure is a clear error in Problems, leaves nothing behind, and is dismissed with media.convertCancel', async () => {
  const r = rig();
  process.env.FAKE_FFMPEG = 'fail';
  try {
    const src = r.file('bad.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const { jobId } = await r.convert({ path: src, codec: 'hap', via: 'ffmpeg' });
    const job = await until(() => r.jobs().find((x) => x.id === jobId && x.state === 'failed'), 8000, 'the failure');
    assert.match(job.error, /FFmpeg could not convert it: .*Invalid data found/);
    const p = r.media.mediaState().problems.find((x) => x.kind === 'convert');
    assert.ok(p && p.jobId === jobId && /Conversion of "bad.mov" to HAP failed: FFmpeg could not convert it/.test(p.text), JSON.stringify(p));
    assert.deepEqual(fs.readdirSync(r.convertDir()), []);
    assert.equal(r.show().media.length, 0);
    await r.media.command('media.convertCancel', { jobId });
    assert.deepEqual(r.jobs(), []); assert.equal(r.media.mediaState().problems.length, 0);
  } finally { await r.close(); }
});

// Fails if a file Chromium cannot read is "converted" with nothing to convert it, or with a message that does not say what to do.
test('convert: a ProRes with no FFmpeg installed fails and says to install the converter; bad requests are refused', async () => {
  const r = rig({ ffmpeg: false });
  try {
    const src = r.file('take.mov', makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const { jobId } = await r.convert({ path: src, codec: 'hap' });
    const job = await until(() => r.jobs().find((x) => x.id === jobId && x.state === 'failed'), 4000);
    assert.match(job.error, /install the converter in System › Converter/);
    await assert.rejects(r.convert({ path: src, codec: 'divx' }), /codec must be one of hap, hapq, hapa/);
    await assert.rejects(r.convert({ path: src, codec: 'hap', fps: 0 }), /fps must be/);
    await assert.rejects(r.convert({ codec: 'hap' }), /mediaId or an absolute path/);
    await assert.rejects(r.media.command('media.convert', { path: src, codec: 'hap' }), /on this computer/, 'a phone cannot start it');
    const hap = r.file('already.mov', makeHap({ frames: 4 }).bytes);
    const imp = await r.import([hap]);
    await assert.rejects(r.convert({ mediaId: imp.accepted[0].mediaId, codec: 'hapq' }), /already HAP/);
    assert.ok(MEDIA_LOCKED_OPS.has('media.convert') && MEDIA_LOCKED_OPS.has('media.ffmpeg.install') && !MEDIA_LOCKED_OPS.has('media.convertCancel'), 'Show mode: no new conversions, but one can always be stopped');
    assert.deepEqual(CODECS, ['hap', 'hapq', 'hapa']);
  } finally { await r.close(); }
});

// Fails if what an interrupted conversion leaves behind (a crash) stays in the library.
test('convert: a part file left by a crash is swept when the engine starts', async () => {
  const r = rig();
  try {
    fs.mkdirSync(r.convertDir(), { recursive: true });
    fs.writeFileSync(path.join(r.convertDir(), 'v9-123.part'), 'half a movie');
    r.media.convert.sweep();
    assert.equal(fs.existsSync(r.convertDir()), false);
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- road A: the helper's parts

/** What the real page does: begin, the PCM, the frames — through the engine's own link (HelperLink.part). */
function pagePlays(media, { frames = 6, w = 64, h = 16, fps = 30, audio = true, pause = 0, onFrame = null, log = [] } = {}) {
  return async (job) => {
    if (job.kind === 'canDecode') return { ok: true, hardware: true };
    if (job.kind !== 'convert') throw new Error(`unexpected job ${job.kind}`);
    log.push(job);
    const part = async (meta, body) => { const r = await media.helper.part(job.id, meta, body); if (!r || r.cancel) throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); };
    await part({ t: 'begin', width: w, height: h, fps, frames, audio: audio ? { rate: 8000, channels: 1 } : null });
    if (audio) await part({ t: 'a' }, new Uint8Array(8000 * 2 * 1)); // one second of silence
    const variant = job.codec;
    for (let f = 0; f < frames; f++) {
      await part({ t: 'v', i: f }, hapFrame(encodeTexture(picture(f, w, h), w, h, variant), job.codec, 1));
      onFrame?.(f);
      if (pause) await sleep(pause);
    }
    return { frames, width: w, height: h, fps, audio };
  };
}

// Fails if the helper's parts do not become a movie the library reads, if the clips do not switch, if the sound is lost, or if the
// helper is not asked for the right job (codec, fps, source as a token).
test('convert (helper road): the page\'s frames and PCM become a HAP movie in the library; the clip switches to it with its settings', async () => {
  const r = rig({ ffmpeg: false });
  const seen = [];
  const h = fakeHelper(r.media, pagePlays(r.media, { log: seen }));
  try {
    await until(() => r.media.helper.online, 2000);
    const { mediaId, clipId } = await mp4WithClip(r);
    const before = structuredClone(r.show().clips.find((c) => c.id === clipId)), rev = r.media.showRev;
    const { jobId } = await r.convert({ mediaId, codec: 'hap', fps: 30 });
    const job = await until(() => r.jobs().find((x) => x.id === jobId && x.state === 'done'), 8000, 'the conversion');
    assert.equal(job.via, 'chromium'); assert.equal(seen.length, 1);
    assert.deepEqual([seen[0].codec, seen[0].fps], ['hap', 30]); assert.match(seen[0].src, /^\/api\/helper\/file\/[0-9a-f]{24}$/);
    assert.equal(r.media.showRev, rev + 1);
    const clip = r.show().clips.find((c) => c.id === clipId), m = r.show().media.find((x) => x.id === clip.mediaId);
    assert.deepEqual({ ...clip, mediaId: null, out: null, in: null }, { ...before, mediaId: null, out: null, in: null }, 'settings kept (in/out are limited to the shorter movie)');
    assert.equal(m.video.frames, 6); assert.deepEqual([m.video.width, m.video.height], [64, 16]);
    assert.equal(m.audio.supported, true); assert.equal(m.audio.rate, 8000); assert.ok(Math.abs(m.audio.duration - 1) < 0.01);
    assert.equal(job.done, 6); assert.equal(job.total, 6);
  } finally { h.stop(); await r.close(); }
});

// Fails if cancelling during the frames leaves a part, if the page keeps being served, or if the show changes.
test('convert (helper road): cancelling in the middle tells the page, removes the part, adds nothing', async () => {
  const r = rig({ ffmpeg: false });
  let sent = 0;
  const h = fakeHelper(r.media, pagePlays(r.media, { frames: 200, pause: 5, onFrame: () => { sent++; } }));
  try {
    await until(() => r.media.helper.online, 2000);
    const { mediaId } = await mp4WithClip(r);
    const rev = r.media.showRev, count = r.show().media.length;
    const { jobId } = await r.convert({ mediaId, codec: 'hap' });
    await until(() => r.jobs().find((x) => x.id === jobId)?.done >= 3, 8000, 'frames');
    await r.media.command('media.convertCancel', { jobId });
    const at = sent;
    await sleep(100);
    assert.ok(sent <= at + 1, `the page stopped (${at} → ${sent})`);
    assert.deepEqual(r.jobs(), []);
    assert.deepEqual(fs.readdirSync(r.convertDir()), []);
    assert.equal(r.media.showRev, rev); assert.equal(r.show().media.length, count);
  } finally { h.stop(); await r.close(); }
});

// Fails if the page erroring out leaves a half movie or no reason.
test('convert (helper road): an error of the page is the job\'s error; nothing is left', async () => {
  const r = rig({ ffmpeg: false });
  const h = fakeHelper(r.media, async (job) => {
    if (job.kind === 'canDecode') return { ok: true, hardware: true };
    await r.media.helper.part(job.id, { t: 'begin', width: 64, height: 16, fps: 30, frames: 3, audio: null }, new Uint8Array(0));
    const e = new Error('this computer has no WebGL 2 for the HAP encoder'); e.code = 'no-webgl'; throw e;
  });
  try {
    await until(() => r.media.helper.online, 2000);
    const { mediaId } = await mp4WithClip(r);
    const { jobId } = await r.convert({ mediaId, codec: 'hap' });
    const job = await until(() => r.jobs().find((x) => x.id === jobId && x.state === 'failed'), 8000);
    assert.match(job.error, /no WebGL 2/);
    assert.deepEqual(fs.readdirSync(r.convertDir()), []);
  } finally { h.stop(); await r.close(); }
});

// ---------------------------------------------------------------------------------------------- the FFmpeg installer

/** A zip with stored/deflated entries (the shape of BtbN's: <folder>/bin/ffmpeg.exe, <folder>/LICENSE.txt). */
function zipOf(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, data, deflate] of entries) {
    const raw = Buffer.from(data), comp = deflate ? zlib.deflateRawSync(raw) : raw, nb = Buffer.from(name);
    const crc = zlib.crc32 ? zlib.crc32(raw) : 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); central.push(ch, nb);
    off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/** A fetch that serves `bytes` from a ReadableStream, and counts how many times it was asked. */
const serving = (bytes) => { const f = async () => { f.calls++; return new Response(new Blob([bytes]).stream(), { status: 200 }); }; f.calls = 0; return f; };

test('zip reader: lists and extracts stored and deflated entries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-zip-'));
  try {
    const big = Buffer.alloc(300000, 'abc');
    fs.writeFileSync(path.join(dir, 'a.zip'), zipOf([['ff/bin/ffmpeg.exe', big, true], ['ff/LICENSE.txt', 'LGPL text', false]]));
    const list = await listZip(path.join(dir, 'a.zip'));
    assert.deepEqual(list.map((e) => e.name), ['ff/bin/ffmpeg.exe', 'ff/LICENSE.txt']);
    await extractEntry(path.join(dir, 'a.zip'), list[0], path.join(dir, 'out', 'ffmpeg.exe'));
    await extractEntry(path.join(dir, 'a.zip'), list[1], path.join(dir, 'out', 'LICENSE.txt'));
    assert.ok(fs.readFileSync(path.join(dir, 'out', 'ffmpeg.exe')).equals(big));
    assert.equal(fs.readFileSync(path.join(dir, 'out', 'LICENSE.txt'), 'utf8'), 'LGPL text');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Fails if a download whose hash is not the pin is kept or run, if the error does not say so, or if anything stays in the folder.
test('ffmpeg install: a download that does not match the pinned SHA-256 is refused and wiped — nothing is installed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-ff-'));
  try {
    const good = zipOf([['ffmpeg-x-win64-lgpl/bin/ffmpeg.exe', 'MZ fake', true], ['ffmpeg-x-win64-lgpl/LICENSE.txt', 'lic', false]]);
    const evil = zipOf([['ffmpeg-x-win64-lgpl/bin/ffmpeg.exe', 'MZ evil', true]]);
    let ran = 0;
    const tool = new FfmpegTool({ dir: path.join(dir, 'ffmpeg'), platform: 'win32', pin: { ...PIN, sha256: sha(good), size: good.length }, fetchImpl: serving(evil), versionOf: async () => { ran++; return { version: '1', config: '' }; } });
    await assert.rejects(tool.install(), /does not match the pinned SHA-256/);
    assert.equal(ran, 0, 'the file was never run');
    assert.equal(tool.status().installed, false); assert.match(tool.status().error, /SHA-256/);
    assert.equal(fs.existsSync(path.join(dir, 'ffmpeg')), false, 'nothing is left');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ffmpeg install: a good download is unpacked with its licence and the address of its source; status, remove; a GPL build is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-ff-'));
  try {
    const zip = zipOf([['ffmpeg-x-win64-lgpl/bin/ffmpeg.exe', 'MZ fake ffmpeg', true], ['ffmpeg-x-win64-lgpl/LICENSE.txt', 'GNU LESSER GENERAL PUBLIC LICENSE', false]]);
    const pin = { ...PIN, sha256: sha(zip), size: zip.length };
    const f = serving(zip), tool = new FfmpegTool({ dir: path.join(dir, 'ffmpeg'), platform: 'win32', pin, fetchImpl: f, versionOf: async () => ({ version: '9.9-test', config: '--disable-gpl --enable-version3' }) });
    assert.equal(tool.status().installed, false);
    assert.equal(f.calls, 0, 'nothing is downloaded until install()');
    const st = await tool.install();
    assert.equal(f.calls, 1);
    assert.deepEqual([st.installed, st.version, st.license, st.source], [true, '9.9-test', pin.license, pin.source]);
    const files = fs.readdirSync(path.join(dir, 'ffmpeg')).sort();
    assert.deepEqual(files, ['LICENSE.txt', 'SOURCE.txt', 'ffmpeg.exe', 'install.json']);
    assert.equal(fs.readFileSync(path.join(dir, 'ffmpeg', 'LICENSE.txt'), 'utf8'), 'GNU LESSER GENERAL PUBLIC LICENSE');
    const src = fs.readFileSync(path.join(dir, 'ffmpeg', 'SOURCE.txt'), 'utf8');
    assert.ok(src.includes(pin.url) && src.includes(pin.sha256) && src.includes(pin.source), 'the source and the hash are written down');
    await assert.rejects(tool.install(), /already installed/);
    assert.equal(tool.remove().installed, false); assert.equal(fs.existsSync(path.join(dir, 'ffmpeg')), false);
    // a build that enables GPL code is not ours to run
    const gpl = new FfmpegTool({ dir: path.join(dir, 'g'), platform: 'win32', pin, fetchImpl: serving(zip), versionOf: async () => ({ version: '1', config: '--enable-gpl --enable-libx264' }) });
    await assert.rejects(gpl.install(), /not LGPL/);
    assert.equal(gpl.status().installed, false); assert.equal(fs.existsSync(path.join(dir, 'g')), false);
    // not Windows: no
    await assert.rejects(new FfmpegTool({ dir: path.join(dir, 'l'), platform: 'linux', fetchImpl: serving(zip) }).install(), /Windows only/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ffmpeg pin: one exact LGPL build — https, a 64-hex SHA-256, "lgpl" and not "gpl" in the asset, licence and source named', () => {
  assert.match(PIN.url, /^https:\/\/github\.com\/.+\/releases\/download\/.+\.zip$/);
  assert.match(PIN.sha256, /^[0-9a-f]{64}$/);
  assert.match(PIN.url, /win64-lgpl-/); assert.doesNotMatch(PIN.url, /win64-gpl|-shared/);
  assert.ok(PIN.size > 1e7 && PIN.license.includes('LGPL') && PIN.licenseUrl.startsWith('https://') && PIN.source.startsWith('https://'));
  assert.ok(Object.isFrozen(PIN));
});

// Fails if the install can be started from a phone, from the relay, or from a test that did not ask for it; or if a remove removes
// the executable while a conversion runs from it. The op is the only way the app ever downloads.
test('ffmpeg ops: status is open, install and remove are for this computer only and locked in Show mode; the installer in a test engine never fetches', async () => {
  const f = serving(Buffer.from('x'));
  const r = rig({ ffmpeg: false, converter: { fetchImpl: f } });
  try {
    const st = await r.media.command('media.ffmpeg.status', {});
    assert.deepEqual([st.installed, st.supported], [false, true]);
    await assert.rejects(r.media.command('media.ffmpeg.install', {}), /at the server itself/);
    await assert.rejects(r.media.command('media.ffmpeg.remove', {}), /at the server itself/);
    assert.equal(f.calls, 0);
    assert.ok(r.media.mediaState().converter.ffmpeg, 'state.media.converter carries the converter status');
  } finally { await r.close(); }
});

test('no test in this file reached the network', () => {
  assert.deepEqual(outbound, []);
  globalThis.fetch = realFetch;
});
