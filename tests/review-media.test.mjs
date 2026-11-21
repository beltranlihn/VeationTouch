// Code-review fixes in the media engine: the open-movie cache (LRU, one open per file, never closed under a read), the
// thumbnail queue (2 workers at most), show.update with an old copy of the show, a cancelled copy whose worker is stuck,
// 'ended' events when another show opens, no fs.stat on the launch path, and the state that does not resend the show.
// Node only. Every one of these fails without its fix (see the comment above each test).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Transport } from '../engine/media/transport.js';
import { normalizeShow, clipSettings } from '../engine/media/show.js';
import { MediaEngine } from '../engine/media/index.js';
import { normalizeProfile } from '../engine/profile.js';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { makeHap } from './fixtures/media/make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}
const vid = { fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: 300, duration: 10 };
const mkMedia = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, file: `shw/f${i}.mov`, size: 1000, video: vid, audio: null, ...extra(i) }));

// ----------------------------------------------------------------------------------------------- transport

// Fails if opening another show (same layer ids) drops the old plays silently: nobody gets their 'ended'.
test('transport: opening another show ends the plays of the old one (an ended event each)', () => {
  const mk = (id) => normalizeShow({ id, name: id, media: mkMedia(1, () => ({})), clips: [{ id: 'c', mediaId: 'm0', end: 'loop' }], layers: [{ id: 'L1', transitionMs: 0 }], decks: [{ id: 'D1', columns: 2, cells: { 'L1:0': 'c' } }] });
  const clock = { t: 1000 };
  const tr = new Transport({ now: () => clock.t, settings: clipSettings, playable: () => null });
  tr.setShow(mk('a'));
  tr.trigger({ clipId: 'c' });
  tr.takeEvents();
  tr.setShow(mk('b'));
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.clipId, e.reason]), [['ended', 'c', 'removed']]);
});

// ----------------------------------------------------------------------------------------------- media engine

function mediaRig(show, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rv-'));
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  const profile = normalizeProfile({ name: 'Room', media: { showId: show?.id || null } });
  if (show) {
    for (const m of show.media) { const f = path.join(store.mediaDir(settings), ...m.file.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size)); }
    store.saveShow(show);
  }
  const media = new MediaEngine({ store, log: quiet, settings, profile: () => profile, setShowId() {}, checkMs: 3600000, ...opts });
  media.profileChanged(profile);
  return { dir, store, media, close: async () => { await media.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Fails with the unbounded one-worker-per-thumbnail code: six requests would run six workers at once.
test('thumbnails: at most two workers run at a time, and every request is still served', async () => {
  const show = normalizeShow({ id: 'shw', name: 'Shw', media: mkMedia(6, (i) => ({ fingerprint: String(i).repeat(40).slice(0, 40) })), clips: [], layers: [{ id: 'L1' }], decks: [] });
  const r = mediaRig(show);
  try {
    let active = 0, max = 0, spawned = 0;
    r.media._spawn = () => { active++; spawned++; max = Math.max(max, active); return { worker: null, ctrl: null, done: sleep(40).then(() => { active--; }) }; };
    const out = await Promise.all(show.media.map((m) => r.media.thumbFile(m.id, 160)));
    assert.equal(spawned, 6, 'each thumbnail got its turn');
    assert.ok(max <= 2, `${max} thumbnail workers at once`);
    assert.ok(max === 2, 'and they do run two by two');
    // (the stub makes no file: the clip gets the generic card of its kind — never cached under its fingerprint — instead of a hole)
    assert.ok(out.every((t) => t && t.fingerprint === null && t.file.endsWith('icon-hap-160.png')), JSON.stringify(out));
  } finally { await r.close(); }
});

// Fails if a copy whose worker never answers (a dead USB in a blocked read) keeps cancelImport waiting forever.
test('cancelImport: a worker that does not stop is terminated after the wait and the copy ends cancelled', async () => {
  const r = mediaRig(null, { cancelMs: 60 });
  try {
    let killed = false;
    const job = { id: 'i1', kind: 'export', state: 'copying', done: 0, total: 10, dst: path.join(r.dir, 'out.mov'), ctrl: new Int32Array(new SharedArrayBuffer(4)), name: 'out.mov' };
    job.worker = { terminate: async () => { killed = true; job._ended?.(); } }; // (a stuck worker only ends when it is killed)
    r.media.jobs.set('i1', job);
    const res = await Promise.race([r.media.cancelImport('i1'), sleep(4000).then(() => 'hung')]);
    assert.notEqual(res, 'hung', 'cancelImport did not hang');
    assert.ok(killed, 'the worker was terminated');
    assert.equal(job.state, 'cancelled');
    assert.equal(r.media.jobs.has('i1'), false);
  } finally { await r.close(); }
});

// ----------------------------------------------------------------------------------------------- the movie cache

/** fs.promises.open counted: how many handles were opened and which are closed. */
function spyOpen() {
  const real = fs.promises.open, log = { opens: 0, closed: new Set(), handles: [] };
  fs.promises.open = async (...a) => {
    const fh = await real(...a);
    const id = log.opens++;
    const close = fh.close.bind(fh);
    fh.close = async () => { log.closed.add(id); return close(); };
    log.handles.push(fh);
    return fh;
  };
  return { log, restore: () => { fs.promises.open = real; } };
}

function movieFiles(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-mv-'));
  const { bytes } = makeHap({ frames: 6, audio: { codec: 'sowt' } });
  const files = Array.from({ length: n }, (_, i) => { const f = path.join(dir, `m${i}.mov`); fs.writeFileSync(f, bytes); return f; });
  return { dir, files };
}

// Fails if two concurrent requests for the same file open it twice (one handle leaks: the second set() replaces the first).
test('movie cache: two requests at once for the same file open it once', async () => {
  const r = mediaRig(null), { dir, files } = movieFiles(1), spy = spyOpen();
  try {
    const [a, b] = await Promise.all([r.media._withMovie(files[0], (mv) => mv), r.media._withMovie(files[0], (mv) => mv)]);
    assert.equal(spy.log.opens, 1);
    assert.equal(a, b, 'the same open movie');
    await r.media.stop();
    assert.equal(spy.log.closed.size, 1, 'and it is closed on stop');
  } finally { spy.restore(); await r.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// Fails if the cache keeps 4, evicts in insertion order (a movie used all the time goes out) or closes a handle that a
// read is still using.
test('movie cache: 16 are kept, the least recently USED goes out, and a handle in use is closed only when its read ends', async () => {
  const r = mediaRig(null), { dir, files } = movieFiles(20), spy = spyOpen();
  try {
    for (let i = 0; i < 16; i++) await r.media._withMovie(files[i], () => {});
    assert.equal(spy.log.opens, 16);
    assert.equal(spy.log.closed.size, 0, '16 fit');
    await r.media._withMovie(files[0], () => {}); // used again: no longer the oldest
    assert.equal(spy.log.opens, 16, 'a hit does not open');
    await r.media._withMovie(files[16], () => {});
    assert.ok(r.media.movies.has(files[0]), 'the one used last stays');
    assert.ok(!r.media.movies.has(files[1]), 'the least recently used went out');
    assert.deepEqual([...spy.log.closed], [1], 'and only its handle was closed');
    // a read in flight on the oldest one: more movies push it out, but its handle stays open until the read is over
    let release; const held = new Promise((res) => { release = res; });
    const oldest = [...r.media.movies.keys()][0], oldestId = spy.log.handles.findIndex((h, i) => !spy.log.closed.has(i) && r.media.movies.get(oldest).mv.fh === h);
    const reading = r.media._withMovie(oldest, async (mv) => { await held; return mv.fh.read(Buffer.alloc(8), 0, 8, 0); });
    await sleep(10);
    // (the read made it the newest: 16 other movies push it out)
    for (const f of files.filter((x) => x !== oldest).slice(0, 16)) await r.media._withMovie(f, () => {});
    assert.ok(!r.media.movies.has(oldest), 'it was evicted');
    assert.ok(!spy.log.closed.has(oldestId), 'but not closed: a read uses it');
    release();
    const { bytesRead } = await reading;
    assert.equal(bytesRead, 8, 'the read finished on an open handle');
    await until(() => spy.log.closed.has(oldestId), 2000, 'the handle closed after the read');
  } finally { spy.restore(); await r.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ----------------------------------------------------------------------------------------------- engine

const SHOW = () => normalizeShow({
  id: 'shw', name: 'Shw', media: mkMedia(2, () => ({})),
  clips: [{ id: 'a', mediaId: 'm0', end: 'loop' }, { id: 'b', mediaId: 'm1', end: 'loop' }],
  layers: [{ id: 'L1', transitionMs: 0 }, { id: 'L2', transitionMs: 0 }],
  decks: [{ id: 'D1', columns: 4, cells: { 'L1:0': 'a', 'L2:0': 'b' } }],
});

async function engineRig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rve-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  for (const m of SHOW().media) { const f = path.join(engine.media.libraryDir, ...m.file.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size)); }
  store.saveShow(SHOW());
  await engine.command('show.load', { id: 'shw' });
  return { dir, store, engine, close: async () => { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Fails if show.update from a client with an old copy puts the layers' mix back (layer.set does not bump the revision,
// and the transport takes the mix from the show).
test('show.update with an old copy of the show keeps the live mix of the layers', async () => {
  const r = await engineRig();
  try {
    const { engine } = r;
    const old = structuredClone(engine.state().show);
    await engine.command('layer.set', { layerId: 'L1', opacity: 0.25, volume: 0.4, mute: true });
    await engine.command('show.update', { show: { ...old, name: 'Renamed' } }); // (no rev: the client did not send one)
    const l = engine.state().media.layers.L1;
    assert.deepEqual([l.opacity, l.volume, l.mute], [0.25, 0.4, true], 'the mix the layer has now');
    assert.equal(engine.state().show.name, 'Renamed', 'and the edit was applied');
    const saved = engine.media.show.layers.find((x) => x.id === 'L1');
    assert.deepEqual([saved.opacity, saved.audio.volume, saved.audio.mute], [0.25, 0.4, true]);
  } finally { await r.close(); }
});

// Fails if a launch stats the file (a sync fs call on the hot path, blocking on a slow drive) instead of using what the
// last library check found.
test('a launch does not stat the library file', async () => {
  const r = await engineRig();
  try {
    await r.engine.media.check(); // (the show's first check is what a launch relies on)
    const real = fs.statSync; let calls = 0;
    fs.statSync = (...a) => { calls++; return real(...a); };
    try { await r.engine.command('clip.trigger', { clipId: 'a' }); } finally { fs.statSync = real; }
    assert.equal(calls, 0);
    assert.equal(r.engine.state().media.layers.L1.play.clipId, 'a');
  } finally { await r.close(); }
});

// Fails if every state message carries the whole show: a client that said showDelta gets it on connect and after each
// change (an edit, a live mix written into the layers), and `showSame` in between; one that did not say so always gets it.
test('server: state omits the show for a client that already has this version of it (showDelta), and sends it again after a change', async () => {
  const r = await engineRig();
  const server = await createServer(r.engine, { port: 0, root, log: quiet });
  const conn = (hello) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
    const states = [];
    ws.on('message', (d, bin) => { if (bin) return; const m = JSON.parse(d.toString()); if (m.type === 'state') states.push(m); });
    ws.on('open', () => { if (hello) ws.send(JSON.stringify({ type: 'hello', role: 'ui', ...hello })); resolve({ ws, states }); });
  });
  try {
    const delta = await conn({ showDelta: true }), plain = await conn({});
    await until(() => delta.states.length && plain.states.length, 3000, 'the first states');
    assert.ok(delta.states[0].show?.rev, 'the show comes on connect');
    await sleep(100); // (the hello is read)
    delta.states.length = 0; plain.states.length = 0;
    r.engine.emit('state');
    await until(() => delta.states.length && plain.states.length, 3000, 'a state');
    assert.equal(delta.states[0].show, undefined, 'no show again');
    assert.equal(delta.states[0].showSame, true);
    assert.ok(delta.states[0].profile && delta.states[0].media, 'the rest of the state is there');
    assert.ok(plain.states[0].show?.rev, 'a client that did not ask gets it every time');
    // an edit
    delta.states.length = 0;
    await r.engine.command('show.update', { show: { ...structuredClone(r.engine.state().show), name: 'Edited' } });
    await until(() => delta.states.some((m) => m.show), 3000, 'the show after the edit');
    assert.equal(delta.states.find((m) => m.show).show.name, 'Edited');
    // a live mix written into the layers also makes the client's copy old
    await sleep(50);
    delta.states.length = 0;
    await r.engine.command('layer.set', { layerId: 'L1', opacity: 0.5 });
    r.engine.emit('state');
    await until(() => delta.states.length, 3000, 'a state');
    assert.equal(delta.states[0].show.layers.find((l) => l.id === 'L1').opacity, 0.5, 'the show with the mix, once');
    delta.states.length = 0;
    r.engine.emit('state');
    await until(() => delta.states.length, 3000, 'a state');
    assert.equal(delta.states[0].showSame, true);
    delta.ws.close(); plain.ws.close();
  } finally { await server.close?.(); await r.close(); }
});
