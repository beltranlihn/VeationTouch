// Review fixes in the engine (V2): an import that awaits the helper does not overwrite what is edited meanwhile, a cancel before
// the road starts launches nothing, the audio cache and the Disk-view thumbnails do not grow for ever, the local-only routes
// refuse a foreign Host / Origin (DNS rebinding), helper ids cannot be guessed, an aborted upload leaves nothing, FFmpeg is not
// removed under a running conversion, and the phone is not sent this computer's paths. Node only; every test says what it fails without.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { MediaEngine } from '../engine/media/index.js';
import { HelperLink } from '../engine/media/helper.js';
import { FfmpegTool } from '../engine/media/ffmpeg.js';
import { normalizeShow } from '../engine/media/show.js';
import { makeHap } from './fixtures/media/make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const here = import.meta.dirname, root = path.resolve(here, '..');
const FAKE = path.join(here, 'fixtures', 'media', 'fake-ffmpeg.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}
const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${what} did not finish in ${ms} ms`); })]);

function rig({ converter = {}, caps = {}, shows = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rve-'));
  const usb = path.join(dir, 'usb'); fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  for (const s of shows) store.saveShow(s);
  let profile = normalizeProfile({ name: 'Test room', canvas: { width: 256, height: 32 }, walls: [{ id: 'W1', width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 256, h: 32 } }] });
  let media;
  media = new MediaEngine({
    store, log: quiet, settings, profile: () => profile, checkMs: 3600000, cacheCaps: caps,
    setShowId: (id) => { profile = normalizeProfile({ ...profile, media: { ...profile.media, showId: id } }); media.profileChanged(profile); },
    converter: { toolDir: path.join(dir, 'tools'), platform: 'win32', ffmpeg: { cmd: process.execPath, args: [FAKE] }, ...converter },
  });
  media.profileChanged(profile);
  media.start();
  return { dir, usb, store, media, close: async () => { delete process.env.FAKE_FFMPEG; delete process.env.FAKE_FFMPEG_PID; await media.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// ---------------------------------------------------------------------------------------------- 1. import race

// Fails if importFiles clones the show BEFORE the slow helper checks and saves the clone after them: the rename made meanwhile is lost.
test('import: an edit made while the helper checks a video survives the import', async () => {
  const r = rig();
  try {
    const f = path.join(r.usb, 'clip.mp4'); fs.copyFileSync(path.join(here, 'fixtures', 'media', 'h264-markers.mp4'), f);
    const show = r.media._ensureShow();
    let gate, reached = false;
    r.media._checkVideo = (c, res) => { reached = true; return new Promise((ok) => { gate = () => ok(res.probe); }); }; // (the helper takes its time)
    const layerId = show.layers[0].id;
    const run = r.media.importFiles([f], { deckId: show.decks[0].id, layerId, column: 0 }, { __local: true });
    await until(() => reached, 5000, 'the import to wait for the helper');
    r.media._editShow(show.id, (s) => { s.name = 'Edited while importing'; return s; });
    gate();
    const out = await run;
    assert.equal(out.rejected.length, 0);
    assert.equal(r.media.show.name, 'Edited while importing', 'the edit is still there');
    assert.equal(r.media.show.media.length, 1, 'and the import too');
    assert.equal(r.store.loadShow(show.id).name, 'Edited while importing', 'on disk as well');
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- 2. cancel before the road

// Fails if a cancel that arrives before the conversion has launched anything still runs it (FFmpeg hangs here: cancel() never returns).
test('convert: a cancel before the road starts launches nothing and returns', async () => {
  const r = rig();
  process.env.FAKE_FFMPEG = 'hang'; process.env.FAKE_FFMPEG_PID = path.join(r.dir, 'pid');
  try {
    const a = path.join(r.usb, 'a.mov'); fs.writeFileSync(a, makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const { jobId } = await r.media.command('media.convert', { __local: true, path: a, codec: 'hap', via: 'ffmpeg' });
    await within(r.media.command('media.convertCancel', { jobId }), 4000, 'the cancel');
    await sleep(150);
    assert.equal(fs.existsSync(process.env.FAKE_FFMPEG_PID), false, 'FFmpeg never started');
    assert.deepEqual(r.media.mediaState().import.filter((j) => j.kind === 'convert'), []);
  } finally { await r.close(); }
});

// Fails if stopping the engine leaves a conversion that has not launched yet to launch afterwards.
test('convert: stopping the engine does not launch what was starting', async () => {
  const r = rig();
  process.env.FAKE_FFMPEG = 'hang'; process.env.FAKE_FFMPEG_PID = path.join(r.dir, 'pid');
  try {
    const a = path.join(r.usb, 'a.mov'); fs.writeFileSync(a, makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    await r.media.command('media.convert', { __local: true, path: a, codec: 'hap', via: 'ffmpeg' });
    await within(r.media.convert.stop(), 4000, 'stop');
    await sleep(150);
    assert.equal(fs.existsSync(process.env.FAKE_FFMPEG_PID), false);
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- 3. caches

const FP = (c) => c.repeat(40);
const showWith = (id, fps) => normalizeShow({
  id, name: id, media: fps.map((fp, i) => ({ id: `m${i}`, file: `${id}/s${i}.wav`, kind: 'audio', size: 10, fingerprint: fp, video: { fourcc: 'AUD ', width: 1, height: 1, fps: 30, frames: 30, duration: 1 }, audio: null })), clips: [], layers: [{ id: 'L1' }], decks: [{ id: 'D1', columns: 2, cells: {} }],
});
const pcmFile = (media, fp, bytes) => { fs.mkdirSync(media.audioCacheDir, { recursive: true }); const f = media._cacheFile(fp); fs.writeFileSync(f, Buffer.alloc(bytes)); fs.writeFileSync(`${f}.json`, '{}'); return f; };

// Fails if removing the last medium with a fingerprint leaves its decoded PCM in audio-cache for ever (or deletes one another show still uses).
test('audio cache: the PCM goes with the last medium that uses it, and stays while another show has it', async () => {
  const r = rig({ shows: [showWith('one', [FP('a'), FP('b')]), showWith('two', [FP('b')])] });
  try {
    await r.media.command('show.load', { id: 'one' });
    const a = pcmFile(r.media, FP('a'), 100), b = pcmFile(r.media, FP('b'), 100);
    await r.media.remove('m0');
    assert.equal(fs.existsSync(a), false); assert.equal(fs.existsSync(`${a}.json`), false, 'sidecar too');
    await r.media.remove('m1'); // 'two' still has it
    assert.equal(fs.existsSync(b), true);
  } finally { await r.close(); }
});

// Fails if the caches have no cap, or the purge takes a used sound before an unused one, or touches thumbnails that belong to a show.
test('caches: audio-cache and Disk thumbnails are kept under their caps, least recently used first, unused sounds first', async () => {
  const r = rig({ caps: { pcm: 1000, diskThumbs: 500 }, shows: [showWith('one', [FP('c')])] });
  try {
    await r.media.command('show.load', { id: 'one' });
    const day = 86400000, at = (f, daysAgo) => { const t = new Date(Date.now() - daysAgo * day); fs.utimesSync(f, t, t); };
    const A = pcmFile(r.media, FP('a'), 500), B = pcmFile(r.media, FP('b'), 500), C = pcmFile(r.media, FP('c'), 500); // c is used by the show
    at(A, 3); at(B, 1); at(C, 10);
    const dt = (h) => path.join(r.media.thumbsDir, `d${h.repeat(24)}-160.png`);
    fs.mkdirSync(r.media.thumbsDir, { recursive: true });
    const own = path.join(r.media.thumbsDir, `${FP('e')}-160.png`); fs.writeFileSync(own, Buffer.alloc(400));
    for (const [h, d] of [['1', 5], ['2', 2], ['3', 1]]) { fs.writeFileSync(dt(h), Buffer.alloc(300)); at(dt(h), d); }
    const out = r.media.purgeCaches();
    assert.deepEqual(out, { pcm: 2, thumbs: 2 });
    assert.deepEqual([fs.existsSync(A), fs.existsSync(B), fs.existsSync(C)], [false, false, true], 'the unused ones go first, the used one stays although it is the oldest');
    assert.deepEqual([fs.existsSync(dt('1')), fs.existsSync(dt('2')), fs.existsSync(dt('3'))], [false, false, true], 'the oldest thumbnails go');
    assert.equal(fs.existsSync(own), true, 'a show\'s thumbnail is not the Disk view\'s cache');
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- 4/5. local-only routes

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rvs-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  try { return await fn({ engine, port: server.port, dir }); } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const raw = (port, p, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.end();
});

// Fails if a page that reaches 127.0.0.1 under another name (DNS rebinding) or from another origin can use the helper, the PCM or the disk thumbnails.
test('local-only routes: a foreign Host or Origin is refused, this computer\'s own names pass', async () => {
  await withServer(async ({ port }) => {
    const good = `127.0.0.1:${port}`;
    for (const p of ['/api/helper/file/' + '0'.repeat(24), '/api/media/diskthumb?path=C%3A%5Cx.png', '/api/media/pcm?clip=c1&from=0&n=1', '/helper']) {
      assert.equal(await raw(port, p, { headers: { Host: `evil.example:${port}` } }), 403, `${p}: foreign Host`);
      assert.equal(await raw(port, p, { headers: { Host: good, Origin: 'http://evil.example' } }), 403, `${p}: foreign Origin`);
      assert.equal(await raw(port, p, { headers: { Host: 'localhost:9' } }), 403, `${p}: another port`);
      assert.notEqual(await raw(port, p, { headers: { Host: good } }), 403, `${p}: Host of this server`);
      assert.notEqual(await raw(port, p, { headers: { Host: `localhost:${port}` } }), 403, `${p}: localhost`);
    }
  });
});

// Fails with the sequential ids (h1, h2...): any page that can reach the route could answer another job.
test('helper: job ids are random tokens', () => {
  const link = new HelperLink({ log: quiet });
  link.seen = Date.now(); link.now = () => link.seen;
  const ids = [link.request({ kind: 'a' }), link.request({ kind: 'a' })].map((p) => { p.catch(() => {}); return p.id; });
  assert.match(ids[0], /^h[0-9a-f]{16}$/); assert.notEqual(ids[0], ids[1]);
  link.stop();
});

// Fails if an upload the page abandons halfway leaves the .tmp file and the job waiting for its timeout.
test('helper: a POST that is cut off fails its job at once and leaves no file', async () => {
  await withServer(async ({ engine, port, dir }) => {
    const media = engine.media, dest = path.join(dir, 'out', 'x.pcm');
    const poll = fetch(`http://127.0.0.1:${port}/api/helper/next`).then((r) => r.json());
    await until(() => media.helper.online, 3000, 'online');
    const job = media.helper.request({ kind: 'audioDecode' }, { dest });
    job.catch(() => {});
    const j = await poll;
    const req = http.request({ host: '127.0.0.1', port, path: `/api/helper/done/${j.id}`, method: 'POST', headers: { 'Content-Length': 100000 } });
    req.on('error', () => {});
    req.write(Buffer.alloc(1000));
    await sleep(100);
    req.destroy();
    await assert.rejects(within(job, 3000, 'the job'), (e) => e.code === 'helper-aborted');
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(fs.readdirSync(path.dirname(dest)), [], 'no half file');
  });
});

// ---------------------------------------------------------------------------------------------- 6/8. ffmpeg

// Fails if the converter can be deleted while FFmpeg is running a conversion.
test('ffmpeg: remove() is refused while a conversion runs with it', async () => {
  const r = rig();
  process.env.FAKE_FFMPEG = 'hang';
  try {
    const a = path.join(r.usb, 'a.mov'); fs.writeFileSync(a, makeHap({ fourcc: 'apcn', frames: 4 }).bytes);
    const { jobId } = await r.media.command('media.convert', { __local: true, path: a, codec: 'hap', via: 'ffmpeg' });
    await until(() => r.media.mediaState().import.find((j) => j.id === jobId)?.done > 0, 8000, 'FFmpeg running');
    await assert.rejects(r.media.command('media.ffmpeg.remove', { __local: true }), /conversion is running/);
    await r.media.command('media.convertCancel', { jobId });
  } finally { await r.close(); }
  assert.throws(() => new FfmpegTool({ dir: path.join(os.tmpdir(), 'vt-none'), busy: () => true }).remove(), /conversion is running/);
});

// Fails if the phone (a client that is not this computer) is told where this computer keeps the converter.
test('ffmpeg.status: the paths of this computer go only to this computer', async () => {
  const r = rig();
  try {
    const local = await r.media.command('media.ffmpeg.status', { __local: true });
    const remote = await r.media.command('media.ffmpeg.status', {});
    assert.ok(local.folder, 'the desktop sees the folder');
    assert.ok(!('folder' in remote) && !('licenseFile' in remote), 'the phone does not');
    assert.equal(remote.installed, local.installed);
  } finally { await r.close(); }
});
