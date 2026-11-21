// Review fixes 2: restart vs the experience autostart, the state after a stale rejection, the origin check of /ws/ui,
// preset parameters kept by show.update, a live-only save not bumping the revision, show ids of a long name.
// Each test says what breaks it ("fails if ..."). Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow } from '../engine/media/show.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = [{ id: 'm1', file: 'rf2/a.mov', size: 900, fingerprint: 'a'.repeat(40), video: { fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: 9000, duration: 300 }, audio: null }];
const SHOW = () => normalizeShow({
  id: 'rf2', name: 'RF2', media: MEDIA, clips: [{ id: 'c1', mediaId: 'm1', name: 'A', end: 'loop' }],
  layers: [{ id: 'L1' }], decks: [{ id: 'D1', columns: 1, cells: { 'L1:0': 'c1' } }],
  presets: [{ id: 'p1', name: 'Probe', experienceId: 'touch-probe', params: { gain: 1.5 }, onLoad: 'keep' }], start: {},
});

function room(experience = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rf2-'));
  const prep = new Store(dir, null, quiet);
  const p = normalizeProfile({ name: 'RF2 room', canvas: { width: 400, height: 200 }, walls: [{ id: 'W1', name: 'N', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }] });
  p.media = { ...p.media, showId: 'rf2' };
  p.experience = { ...p.experience, ...experience };
  prep.saveProfile(p);
  prep.saveSettings({ ...prep.loadSettings(), activeProfile: p.id });
  prep.saveShow(SHOW());
  const f = path.join(prep.mediaDir(prep.loadSettings()), 'rf2', 'a.mov');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(900));
  const engines = [];
  return {
    dir,
    boot() {
      const engine = new Engine({ store: new Store(dir, null, quiet), log: quiet, version: 'test', experienceDirs: [FIX] });
      engine.start(); engines.push(engine); return engine;
    },
    async close() { for (const e of engines) await e.stop().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// Fails if the profile's experience autostart still runs after a restart that took the clips back (the experience would
// turn on over the restored clips while Live shows "None").
test('restart: the experience autostart does not run over a restored transport, but runs on a cold start', async () => {
  const r = room({ id: 'touch-probe', autostart: true });
  const calls = []; const orig = Engine.prototype._experienceRun;
  Engine.prototype._experienceRun = function (...a) { calls.push(1); return orig.apply(this, a); };
  try {
    const a = r.boot();
    assert.equal(calls.length, 1, 'cold start: the experience starts with the app');
    await a.command('clip.trigger', { clipId: 'c1' });
    await a.stop(); await sleep(200);
    calls.length = 0;
    r.boot();
    assert.equal(calls.length, 0, 'restored transport: the experience is not started on top');
  } finally { Engine.prototype._experienceRun = orig; await r.close(); }
});

const wsOpen = (url, opts) => new Promise((resolve) => {
  const ws = new WebSocket(url, opts); ws.msgs = [];
  ws.on('message', (raw, bin) => { if (!bin) ws.msgs.push(JSON.parse(raw)); });
  ws.on('open', () => resolve({ ok: true, ws })); ws.on('error', () => resolve({ ok: false })); ws.on('unexpected-response', () => resolve({ ok: false }));
});

// Fails if /ws/ui lets a web page from another origin in (127.0.0.1 needs no key), or refuses a page of this server, a
// client with no Origin (Electron, node, the relay connector), or if the state after a stale rejection lacks you/token/lan/local.
test('server: /ws/ui refuses a foreign Origin, accepts its own and none; the state after "stale" is complete', async () => {
  const r = room();
  const engine = r.boot();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  try {
    const bad = await wsOpen(`ws://127.0.0.1:${server.port}/ws/ui`, { headers: { origin: 'https://evil.example' } });
    assert.equal(bad.ok, false, 'foreign origin refused');
    const badPort = await wsOpen(`ws://127.0.0.1:${server.port}/ws/ui`, { headers: { origin: 'http://127.0.0.1:1' } });
    assert.equal(badPort.ok, false, 'same host, other port refused');
    const own = await wsOpen(`ws://127.0.0.1:${server.port}/ws/ui`, { headers: { origin: `http://localhost:${server.port}` } });
    assert.equal(own.ok, true, 'own origin accepted');
    const none = await wsOpen(`ws://127.0.0.1:${server.port}/ws/ui`);
    assert.equal(none.ok, true, 'no Origin accepted');
    await sleep(200);
    own.ws.msgs.length = 0;
    own.ws.send(JSON.stringify({ type: 'cmd', id: 1, op: 'show.update', args: { show: engine.media.show, rev: engine.media.showRev - 1 } }));
    await sleep(300);
    const st = own.ws.msgs.find((m) => m.type === 'state');
    assert.ok(st, 'a state follows the stale rejection');
    assert.ok(st.you && st.token && st.lan && st.local === true, `complete state (${Object.keys(st).join(',')})`);
    own.ws.close(); none.ws.close();
  } finally { await server.close?.(); await r.close(); }
});

// Fails if show.update puts back the preset parameters of an old copy (a knob turned in the room is lost), or if the
// deferred save of a live value bumps the revision (a concurrent edit with the rev it had would be rejected as stale).
test('show.update keeps the live preset params; a live-only save does not bump the revision', async () => {
  const r = room();
  const engine = r.boot();
  try {
    const old = structuredClone(engine.media.show);
    await engine.command('preset.param', { presetId: 'p1', key: 'gain', value: 2 });
    const rev = engine.media.showRev;
    engine.media._saveShow(engine.media.show, { backup: false, keepRev: true });
    assert.equal(engine.media.showRev, rev, 'no rev bump');
    await engine.command('show.update', { show: { ...old, name: 'Renamed' }, rev });
    assert.equal(engine.media.show.name, 'Renamed');
    assert.equal(engine.media.show.presets[0].params.gain, 2, 'live param kept');
  } finally { await r.close(); }
});

// Fails if a long show name gets an id longer than 40 characters with its suffix (an invalid id).
test('store: uniqueShowId trims a long base to fit its suffix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rf2s-'));
  try {
    const store = new Store(dir, null, quiet);
    const name = 'a'.repeat(60);
    const id1 = store.uniqueShowId(name);
    store.saveShow({ ...SHOW(), id: id1 });
    const id2 = store.uniqueShowId(name);
    assert.notEqual(id1, id2);
    assert.ok(id2.length <= 40, `${id2.length} chars`);
    store.saveShow({ ...SHOW(), id: id2 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
