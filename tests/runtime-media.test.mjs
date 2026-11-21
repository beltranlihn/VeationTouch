// Experiences drive the media engine (MEDIA-SERVER.md §4.4, §4b.4; phase F10): vt.media (slots, play / stop / preload,
// the started / ended / error events with their playId, state), vt.walls in metres with their masks, what a preset
// does to the clips when it unloads or another one loads, the migration of the room's experience into a card, and the
// clip.preload command. Node for the engine and the runtime's pure parts; the fixture experience
// (tests/fixtures/experiences/media-probe) in a hidden Electron window (tests/ui/runner.cjs) for the page side: as the
// room's running instance (?run=1), as the app's viewer (?view=1) and on its own (?standalone=1).
// The output page's part (no black on a switch, the frozen frame) is in tests/output.test.mjs.
// Each test says what breaks it ("fails if …").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow } from '../engine/media/show.js';
import { migratePresets } from '../engine/media/presets.js';
import { scanCatalog, visualOnly } from '../engine/experiences.js';
import { PRELOAD_MAX } from '../engine/media/transport.js';
import { makeMedia, slotsOf, standInSlots, wallView, XLAYER } from '../experiences/runtime.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

// a room of two 4 × 2 m walls on an 800 × 200 canvas, rendered at half size; a door (mask) on the first wall
const PROFILE = {
  name: 'Media room', canvas: { width: 800, height: 200 }, output: { scale: 0.5 },
  walls: [
    { id: 'W1', name: 'North', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 }, masks: [{ id: 'M1', name: 'Door', type: 'rect', x0: 1, y0: 0, x1: 2, y1: 1.5 }] },
    { id: 'W2', name: 'East', width: 4, height: 2, pixelRect: { x: 400, y: 0, w: 400, h: 200 } },
  ],
};
const vid = (sec) => ({ fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: Math.round(sec * 30), duration: sec });
const MEDIA = [
  { id: 'm1', file: 'shw/short.mov', size: 900, fingerprint: 'a'.repeat(40), video: vid(1), audio: null },
  { id: 'm2', file: 'shw/long.mov', size: 800, fingerprint: 'b'.repeat(40), video: vid(20), audio: null },
  { id: 'm3', file: 'shw/gone.mov', size: 700, fingerprint: 'c'.repeat(40), video: vid(5), audio: null }, // never on disk
];
const SHOW = () => normalizeShow({
  id: 'shw', name: 'Shw', media: MEDIA,
  clips: [
    { id: 'c1', mediaId: 'm2', name: 'Grid loop', end: 'loop' },
    { id: 'c2', mediaId: 'm1', name: 'Reel' },
    { id: 'c3', mediaId: 'm2', name: 'Project A', trigger: 'toggle' }, // a Toggle clip: an experience's launches still start it
    { id: 'c4', mediaId: 'm3', name: 'Project gone' },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `k${i + 1}`, mediaId: 'm2', name: `Extra ${i + 1}` })),
  ],
  layers: [{ id: 'L1', end: 'loop' }],
  decks: [{ id: 'D1', cells: { 'L1:0': 'c1' } }],
  presets: [
    { id: 'p1', name: 'Probe', experienceId: 'media-probe', media: { reel: 'c2', projects: ['c3', 'c4', 'c1'] }, onLoad: 'keep' },
    { id: 'p2', name: 'Other keep', experienceId: 'touch-probe', onLoad: 'keep' },
    { id: 'p3', name: 'Other clear', experienceId: 'touch-probe', onLoad: 'clear' },
    { id: 'p4', name: 'Probe again', experienceId: 'media-probe', media: { reel: 'c3' }, onLoad: 'keep' },
  ],
});

/** An engine on a temp folder: the media room, the test show open, its files in the library (but m3). */
async function rig({ clock = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rtm-'));
  const store = new Store(dir, null, quiet);
  store.saveProfile(normalizeProfile(PROFILE));
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [FIX], media: clock ? { clock } : {} });
  engine.start();
  for (const m of MEDIA.slice(0, 2)) {
    const f = path.join(engine.media.libraryDir, ...m.file.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size));
  }
  store.saveShow(SHOW());
  await engine.command('show.load', { id: 'shw' });
  await engine.media.check();
  const media = () => engine.state().media;
  return { dir, store, engine, media, close: async () => { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// ---------------------------------------------------------------------------------------------- the engine

// Fails if clip.preload does not keep the clips in state.media.preload, keeps more than 8 (or drops the newest instead
// of the oldest), lets a missing file or an unknown clip in, or if what the experience kept ready survives its going.
test('engine: clip.preload keeps 8 clips at most (the oldest leaves), refuses what cannot play, and goes with the experience', async () => {
  const r = await rig();
  try {
    const { engine, media } = r;
    await engine.command('preset.load', { presetId: 'p1' });
    for (let i = 1; i <= 9; i++) await engine.command('clip.preload', { clipId: `k${i}` });
    assert.equal(PRELOAD_MAX, 8);
    assert.deepEqual(media().preload, ['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'], 'the oldest left');
    await engine.command('clip.preload', { clipId: 'k2' });
    assert.deepEqual(media().preload.at(-1), 'k2', 'asked again: the newest');
    await assert.rejects(engine.command('clip.preload', { clipId: 'c4' }), /missing from the media library/);
    await assert.rejects(engine.command('clip.preload', { clipId: 'nope' }), /unknown clip/);
    await engine.command('preset.load', { presetId: 'p4' }); // the same experience: the page stays, so does what it asked for
    assert.equal(media().preload.length, 8);
    await engine.command('preset.load', { presetId: 'p2' }); // another experience
    assert.deepEqual(media().preload, [], 'another experience: let go');
    await engine.command('preset.load', { presetId: 'p1' });
    await engine.command('clip.preload', { clipId: 'c2' });
    await engine.command('preset.unload', {});
    assert.deepEqual(media().preload, [], 'unloaded: let go');
  } finally { await r.close(); }
});

// Fails if an experience's launch of a clip set to Toggle ejects it the second time (the grid's launch style must not
// reach the reserved layer: the experience asked for a play and waits for its 'started').
test('engine: what an experience launches always starts, whatever the clip\'s own launch style', async () => {
  const r = await rig();
  try {
    const { engine, media } = r;
    const a = await engine.command('clip.trigger', { clipId: 'c3', layerId: XLAYER, end: 'clear' });
    const b = await engine.command('clip.trigger', { clipId: 'c3', layerId: XLAYER, end: 'clear' });
    assert.ok(a.playId && b.playId && a.playId !== b.playId, JSON.stringify([a, b]));
    assert.equal(b.toggled, undefined);
    assert.equal(media().xlayer.play.playId, b.playId);
    // the grid keeps its Toggle
    const ed = structuredClone(engine.media.show); ed.decks[0].cells['L1:1'] = 'c3';
    await engine.command('show.update', { show: ed, rev: engine.media.showRev });
    await engine.command('clip.trigger', { deckId: 'D1', layerId: 'L1', column: 1 });
    assert.equal((await engine.command('clip.trigger', { deckId: 'D1', layerId: 'L1', column: 1 })).toggled, true);
  } finally { await r.close(); }
});

// Fails if a room that played Alma liquid before presets existed does not get it as its first card with ITS parameters
// (and those as the live ones when the card loads) — F10 › Migration.
test('migration: a profile with experience { id: alma-fluid, params } gives a card with those parameters', async () => {
  const catalog = visualOnly(scanCatalog([path.join(root, 'experiences')], quiet));
  const params = { turbulence: 1.6, quality: 'high', logo: false };
  const profile = normalizeProfile({ ...PROFILE, experience: { id: 'alma-fluid', autostart: true, params: { 'alma-fluid': params } } });
  const s = migratePresets(normalizeShow({ id: 'shw', name: 'Shw' }), profile, catalog, []);
  assert.equal(s.presets.length, 1);
  assert.deepEqual([s.presets[0].experienceId, s.presets[0].params, s.presets[0].onLoad], ['alma-fluid', params, 'keep']);
  assert.equal(s.start.presetId, s.presets[0].id, 'it started with the app: so does its card');
  // through the engine: the show without presets is given the card, and loading it makes those parameters live
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rtm-mig-'));
  const store = new Store(dir, null, quiet);
  store.saveProfile({ ...profile, experience: { ...profile.experience, autostart: false } });
  store.saveShow(normalizeShow({ id: 'old', name: 'Old show' }));
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  try {
    await engine.command('show.load', { id: 'old' });
    const p = engine.media.show.presets;
    assert.deepEqual(p.map((x) => [x.experienceId, x.params]), [['alma-fluid', params]]);
    await engine.command('preset.load', { presetId: p[0].id });
    for (const [k, v] of Object.entries(params)) assert.equal(engine.state().profile.experience.params['alma-fluid'][k], v, k);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------- the runtime's parts (Node)

// Fails if a wall loses its metres, if pxPerM is not render px per metre, or if a mask (metres, y from the floor) is
// not turned into the render-px box it covers.
test('runtime: vt.walls gains width, height (m), pxPerM and masks (render px); the rest is as it was', () => {
  const P = normalizeProfile(PROFILE);
  const w = wallView(P.walls[0], 0.5);
  assert.deepEqual(w.rect, { x: 0, y: 0, w: 200, h: 100 }, 'the rect as before');
  assert.deepEqual([w.id, w.name, w.width, w.height, w.pxPerM], ['W1', 'North', 4, 2, 50]);
  assert.deepEqual(w.masks, [{ id: 'M1', name: 'Door', x: 50, y: 25, w: 50, h: 75 }], 'x 1–2 m, 0–1.5 m from the floor');
  assert.deepEqual(wallView(P.walls[1], 1).masks, []);
  assert.deepEqual(wallView(P.walls[1], 1).rect, { x: 400, y: 0, w: 400, h: 200 });
});

// Fails if the slots are not the live card's (another card's, or a card of another experience), if a clip slot is not
// a clip and a clips slot not a list, if an undeclared key answers, or if a missing file is not marked.
test('runtime: slots are the live card\'s, as the manifest declares them; a missing file is marked', () => {
  const show = SHOW();
  const experiences = [{ id: 'media-probe', media: [{ key: 'reel', label: 'Reel', type: 'clip', max: 1 }, { key: 'projects', label: 'Projects', type: 'clips', max: 2 }] }];
  const state = (preset) => ({ local: true, experiences, show, media: { preset, problems: [{ kind: 'missing-media', mediaId: 'm3' }], import: [] } });
  const s = slotsOf(state({ id: 'p1', experienceId: 'media-probe' }), 'media-probe');
  assert.deepEqual(Object.keys(s), ['reel', 'projects']);
  assert.deepEqual(s.reel, { id: 'c2', name: 'Reel', duration: 1, hasAudio: false, thumb: `/api/media/thumb/m1.png?s=480&v=${'a'.repeat(40)}`, missing: false });
  assert.deepEqual(s.projects.map((c) => [c.id, c.missing]), [['c3', false], ['c4', true]], 'max 2; the file that is not there is missing');
  assert.equal(slotsOf(state({ id: 'p4', experienceId: 'media-probe' }), 'media-probe').reel.id, 'c3', 'the other card of the piece');
  assert.deepEqual(slotsOf(state({ id: 'p2', experienceId: 'touch-probe' }), 'media-probe'), { reel: null, projects: [] }, 'another piece is live');
  assert.deepEqual(slotsOf(state(null), 'media-probe'), { reel: null, projects: [] });
  const stand = standInSlots([{ key: 'reel', type: 'clip' }, { key: 'projects', label: 'Projects', type: 'clips', max: 12 }]);
  assert.equal(stand.reel.id, 'sim-reel');
  assert.deepEqual(stand.projects.map((c) => c.name), ['Projects 1', 'Projects 2', 'Projects 3']);
});

// Fails if the simulation sends anything (it must never reach the room), if its events do not come in the engine's
// order (play resolves, then started, then ended with the same playId) or a replaced / stopped play gives no ended.
test('runtime: vt.media without the room is a simulation — same calls and events, nothing sent', async () => {
  const sent = [];
  const slots = { reel: { id: 'c2', name: 'Reel', duration: 0.06 }, projects: [{ id: 'c3', name: 'A', duration: 0.06 }] };
  const m = makeMedia({ real: false, slots: () => slots, cmd: (...a) => { sent.push(a); return Promise.resolve({}); } });
  const ev = [];
  for (const t of ['started', 'ended']) m.on(t, (e) => ev.push([t, e.playId, e.clipId, e.reason ?? null]));
  assert.equal(m.available, false);
  const a = await m.play(m.slot('reel'));
  ev.push(['resolved', a.playId]);
  await sleep(150);
  assert.deepEqual(ev, [['resolved', a.playId], ['started', a.playId, 'c2', null], ['ended', a.playId, 'c2', 'end']]);
  assert.equal(m.state().playing, false);
  const b = await m.play('c3', { end: 'loop' });
  await sleep(10);
  assert.deepEqual(m.state().clipId, 'c3');
  const c = await m.play('c2', { end: 'loop' });
  await m.stop();
  assert.deepEqual(ev.slice(3), [['started', b.playId, 'c3', null], ['ended', b.playId, 'c3', 'replaced'], ['ended', c.playId, 'c2', 'cleared']]);
  await assert.rejects(m.play('c9'), /not a clip of this experience's slots/);
  await assert.rejects(m.play('c2', { end: 'forever' }), /end: one of/);
  assert.deepEqual(await m.preload('c3'), { preload: ['c3'], simulated: true });
  assert.deepEqual(sent, [], 'nothing reached the engine');
});

// Fails if the real vt.media does not launch on the reserved layer with 'clear' as its default end, does not pass the
// engine's events on, or reads its state from anything but state.media.xlayer and the engine's clock.
test('runtime: the real vt.media launches on the reserved layer and reads its state from the transport', async () => {
  const sent = [];
  let x = null;
  const m = makeMedia({
    real: true, slots: () => ({ reel: { id: 'c2', name: 'Reel', duration: 1 } }),
    cmd: (op, args) => { sent.push([op, args]); return Promise.resolve(op === 'clip.trigger' ? { playId: 'ab-1', layerId: XLAYER, startAt: 1120 } : {}); },
    xlayer: () => x, engineNow: () => 1620,
    playhead: (p, now) => ({ time: p.in + (now - p.startAt) / 1000 }),
  });
  assert.deepEqual(await m.play('c2', { transitionMs: 600 }), { playId: 'ab-1', startAt: 1120 });
  await m.stop({ transitionMs: 300 });
  await m.preload('c2');
  assert.deepEqual(sent, [
    ['clip.trigger', { clipId: 'c2', layerId: XLAYER, end: 'clear', transitionMs: 600 }],
    ['layer.clear', { layerId: XLAYER, transitionMs: 300 }],
    ['clip.preload', { clipId: 'c2' }],
  ]);
  x = { state: 'playing', play: { playId: 'ab-1', clipId: 'c2', startAt: 1120, in: 0, out: 1 } };
  assert.deepEqual(m.state(), { playing: true, held: false, playId: 'ab-1', clipId: 'c2', position: 0.5, duration: 1 });
  const got = [];
  m.on('error', (e) => got.push(e));
  m._event({ event: 'error', playId: 'ab-1', clipId: 'c2', layerId: XLAYER, error: 'unreadable' });
  assert.deepEqual(got, [{ playId: 'ab-1', clipId: 'c2', error: 'unreadable' }]);
});

// ---------------------------------------------------------------------------------------------- the page (Electron)

/** The engine + server of the media room; `prep(engine)` before the page opens; `script` runs in the page. */
async function inPage(url, script, { prep = null } = {}) {
  const r = await rig();
  const server = await createServer(r.engine, { port: 0, root, log: quiet });
  r.engine.port = server.port;
  try {
    if (prep) await prep(r.engine);
    const file = path.join(r.dir, 'script.js');
    fs.writeFileSync(file, `const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const x = fn(); if (x) return x; if (Date.now() - t0 > ms) return null; await wait(25); } };
      ${script}`);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}${url}`, `--script=${file}`, '--wait=load', '--w=800', '--h=400'];
    const out = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = out.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${out.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, after: r.engine.state().media };
  } finally { server.close(); await r.close(); }
}

// the room's running instance: one run, read by the tests below
let real = null;
const realRun = () => (real ??= inPage('/experiences/media-probe/index.html?run=1', `
  const P = await until(() => window.__probe?.vt?.media);
  if (!P) throw new Error('the probe did not start');
  const probe = window.__probe, vt = probe.vt, M = vt.media;
  const { store, cmd } = await import('/js/conn.js');
  const out = { available: M.available, walls: vt.walls };
  const evOf = (playId, type) => probe.events.find((e) => e.playId === playId && e.type === type);
  await cmd('preset.load', { presetId: 'p1' });
  await until(() => M.slot('reel'));
  out.slots = M.slots(); out.nope = M.slot('nope');
  // play the reel (1 s): started, then ended, with its playId
  const p = await M.play(M.slot('reel'));
  out.play = p;
  await until(() => evOf(p.playId, 'started'), 3000);
  await wait(200);
  out.during = M.state();
  out.started = evOf(p.playId, 'started');
  await until(() => evOf(p.playId, 'ended'), 4000);
  out.ended = evOf(p.playId, 'ended');
  out.missing = await M.play('c4').then(() => 'played', (e) => e.message);
  out.notMine = await M.play('k1').then(() => 'played', (e) => e.message);
  out.preload = await M.preload('c3');
  // another card of another experience (onLoad keep): the clip it launched stops, the grid plays on
  const live = async (id) => { const q = await M.play(id, { end: 'loop' }); await until(() => evOf(q.playId, 'started'), 3000); return q; };
  await cmd('clip.trigger', { deckId: 'D1', layerId: 'L1', column: 0 });
  let q = await live('c3');
  await cmd('preset.load', { presetId: 'p2' });
  await until(() => evOf(q.playId, 'ended'), 3000);
  out.keep = { ended: evOf(q.playId, 'ended'), grid: store.state.media.layers.L1.state, preload: store.state.media.preload };
  // back, then a card with onLoad clear: its clip stops and the grid is ejected
  await cmd('preset.load', { presetId: 'p1' });
  await until(() => M.slot('reel'));
  q = await live('c3');
  await cmd('preset.load', { presetId: 'p3' });
  await until(() => evOf(q.playId, 'ended'), 3000);
  out.clear = { ended: evOf(q.playId, 'ended'), grid: store.state.media.layers.L1.play };
  // unload (None): its clip stops, the grid plays on
  await cmd('preset.load', { presetId: 'p1' });
  await until(() => M.slot('reel'));
  await cmd('clip.trigger', { deckId: 'D1', layerId: 'L1', column: 0 });
  q = await live('c3');
  await cmd('preset.unload', {});
  await until(() => evOf(q.playId, 'ended'), 3000);
  out.unload = { ended: evOf(q.playId, 'ended'), grid: store.state.media.layers.L1.state, x: store.state.media.xlayer.play };
  // the operator gives the live card another reel: the page hears it, no reload
  await cmd('preset.load', { presetId: 'p1' });
  await until(() => M.slot('reel'));
  const n = probe.slots.length;
  const show = structuredClone(store.state.show); const rev = show.rev; delete show.rev;
  show.presets.find((x) => x.id === 'p1').media.reel = 'k1';
  await cmd('show.update', { show, rev });
  await until(() => probe.slots.length > n);
  out.slotsEvent = probe.slots.at(-1).reel?.id; out.reelNow = M.slot('reel')?.id; out.boots = probe.boots;
  return out;
`));

// Fails if the fixture's play does not reach the engine, or its 'started' / 'ended' do not carry the playId play gave.
test('page: the fixture plays a clip and receives started and ended with the right playId', opt, async () => {
  const { result: o, errors } = await realRun();
  assert.deepEqual(errors, []);
  assert.equal(o.available, true);
  assert.match(o.play.playId, /^[a-z0-9]{4}-\d+$/);
  assert.deepEqual(o.started, { type: 'started', playId: o.play.playId, clipId: 'c2' });
  assert.deepEqual(o.ended, { type: 'ended', playId: o.play.playId, clipId: 'c2', reason: 'end' });
  assert.equal(o.during.playId, o.play.playId);
  assert.equal(o.during.playing, true);
  assert.ok(o.during.position >= 0 && o.during.position <= 1, JSON.stringify(o.during));
  assert.equal(o.during.duration, 1);
  assert.match(o.missing, /missing from the media library/, 'a file that is not there: the play is refused with why');
  assert.match(o.notMine, /not a clip of this experience's slots/);
  assert.deepEqual(o.preload.preload, ['c3']);
});

// Fails if the page does not see its card's slots (or sees an undeclared key), or does not hear the operator change one.
test('page: vt.media.slot gives the live card\'s clips, and a slot edited in the show reaches the live page', opt, async () => {
  const { result: o } = await realRun();
  assert.equal(o.slots.reel.id, 'c2');
  assert.equal(o.slots.reel.name, 'Reel');
  assert.deepEqual(o.slots.projects.map((c) => [c.id, c.missing]), [['c3', false], ['c4', true], ['c1', false]]);
  assert.equal(o.nope, null);
  assert.deepEqual([o.slotsEvent, o.reelNow, o.boots], ['k1', 'k1', 1], 'a "slots" event, the new clip, the same page');
});

// Fails if the clips an experience launched survive its card being replaced or unloaded, or if the grid does not
// follow the incoming card's onLoad (keep: plays on; clear: ejected).
test('page: unloading a card stops what its experience launched; the grid stays (keep) or is ejected (clear)', opt, async () => {
  const { result: o, after } = await realRun();
  assert.equal(o.keep.ended.reason, 'stopped');
  assert.equal(o.keep.grid, 'playing', 'onLoad keep: the grid plays on');
  assert.deepEqual(o.keep.preload, [], 'what it kept ready is let go');
  assert.equal(o.clear.ended.reason, 'stopped');
  assert.equal(o.clear.grid, null, 'onLoad clear: the grid is ejected');
  assert.equal(o.unload.ended.reason, 'stopped');
  assert.equal(o.unload.grid, 'playing', 'None: the grid plays on');
  assert.equal(o.unload.x, null);
  assert.equal(after.xlayer.play, null);
  assert.deepEqual(o.walls.map((w) => [w.id, w.width, w.height, w.pxPerM]), [['W1', 4, 2, 50], ['W2', 4, 2, 50]]);
  assert.deepEqual(o.walls[0].masks, [{ id: 'M1', name: 'Door', x: 50, y: 25, w: 50, h: 75 }]);
});

// Fails if the app's viewer or a page opened on its own launches or preloads anything real, or if the viewer does not
// see the live card's slots (it draws the same piece as the room).
test('page: vt.media in the viewer and standalone is a simulation — nothing reaches the room', opt, async () => {
  const { result: o, errors, after } = await inPage('/experiences/media-probe/index.html?standalone=1', `
    const P = await until(() => window.__probe?.vt?.media);
    if (!P) throw new Error('the probe did not start');
    const S = window.__probe.vt.media, out = {};
    const run = async (M, probe) => {
      const r = { available: M.available, reel: M.slot('reel'), projects: (M.slot('projects') || []).map((c) => c.id) };
      const p = await M.play(M.slot('reel'), { end: 'loop' });
      await until(() => probe.events.some((e) => e.type === 'started' && e.playId === p.playId), 2000);
      r.play = p; r.state = M.state(); r.preload = await M.preload(M.slot('reel'));
      await M.stop();
      r.events = probe.events.map((e) => [e.type, e.playId === p.playId, e.reason ?? null]);
      return r;
    };
    out.standalone = await run(S, window.__probe);
    out.standalone.walls = window.__probe.vt.walls;
    const f = document.createElement('iframe');
    f.src = '/experiences/media-probe/index.html?run=1&view=1';
    document.body.append(f);
    const V = await until(() => f.contentWindow.__probe?.vt?.media?.slot('reel'), 15000);
    if (!V) throw new Error('the viewer did not start');
    out.viewer = await run(f.contentWindow.__probe.vt.media, f.contentWindow.__probe);
    await wait(300);
    return out;
  `, { prep: (engine) => engine.command('preset.load', { presetId: 'p1' }) });
  assert.deepEqual(errors, []);
  for (const k of ['standalone', 'viewer']) {
    const r = o[k];
    assert.equal(r.available, false, k);
    assert.match(r.play.playId, /^sim-\d+$/, k);
    assert.equal(r.play.simulated, true, k);
    assert.equal(r.state.playing, true, k);
    assert.equal(r.preload.simulated, true, k);
    assert.deepEqual(r.events, [['started', true, null], ['ended', true, 'cleared']], k);
  }
  assert.deepEqual([o.standalone.reel.id, o.standalone.projects], ['sim-reel', ['sim-projects-1', 'sim-projects-2', 'sim-projects-3']], 'stand-in clips on its own');
  const w = o.standalone.walls[0];
  assert.deepEqual([w.pxPerM, w.masks], [500, []]);
  assert.ok(Math.abs(w.width * w.pxPerM - w.rect.w) < 1e-6 && Math.abs(w.height * w.pxPerM - w.rect.h) < 1e-6, 'metres × pxPerM = the rect');
  assert.deepEqual([o.viewer.reel.id, o.viewer.projects], ['c2', ['c3', 'c4', 'c1']], 'the viewer sees the live card\'s clips');
  assert.equal(after.xlayer.play, null, 'nothing was launched in the room');
  assert.equal(after.xlayer.from, null);
  assert.deepEqual(after.preload, [], 'nothing was preloaded');
});
