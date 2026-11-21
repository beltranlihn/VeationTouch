// Experience presets (MEDIA-SERVER.md §4b.4, D9, phase F4): loading and unloading, onLoad keep / clear, the parameters,
// the old experience API as an alias (docs/OSC.md: experience.play / stop / param stay), the migration from the room's
// experience, the 5 s start timeout, a restart, and the manifest's clip slots. Node only; the experiences are the test
// fixture (touch-probe) and the app's own (alma-fluid, ambient-notes) — no page is opened, the engine side is what is
// tested (the page reports its fps through experience.report, as the real one does).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow } from '../engine/media/show.js';
import { migratePresets, cleanParams, PRESET_START_MS } from '../engine/media/presets.js';
import { normManifest } from '../engine/experiences.js';
import { XLAYER } from '../engine/media/transport.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}

const vid = (sec) => ({ fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: sec * 30, duration: sec });
const MEDIA = [{ id: 'm1', file: 'shw/one.mov', size: 900, video: vid(10), audio: null }];
const PRESETS = [
  { id: 'p1', name: 'Probe soft', experienceId: 'touch-probe', params: { gain: 1.5, mode: 'soft', bogus: 3 }, sound: { id: 'ambient-notes', params: {} }, onLoad: 'keep' },
  { id: 'p2', name: 'Probe hard', experienceId: 'touch-probe', params: { gain: 0.5, mode: 'hard' }, sound: null, onLoad: 'clear' },
  { id: 'p3', name: 'Liquid', experienceId: 'alma-fluid', params: {}, onLoad: 'keep' },
  { id: 'p4', name: 'Clips only', experienceId: null, onLoad: 'keep' },
];
const SHOW = (presets = PRESETS) => normalizeShow({
  id: 'shw', name: 'Shw', media: MEDIA,
  clips: [{ id: 'c1', mediaId: 'm1', end: 'loop' }, { id: 'c2', mediaId: 'm1', end: 'loop' }],
  layers: [{ id: 'L1' }, { id: 'L2' }],
  decks: [{ id: 'D1', cells: { 'L1:0': 'c1', 'L2:0': 'c2' } }],
  presets,
});

/** An engine (fake clock) on a temp folder with the test show open. */
async function rig({ profile = null, presets = PRESETS, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-pre-')), keep = false } = {}) {
  const store = new Store(dir, null, quiet);
  if (profile) store.saveProfile(normalizeProfile(profile));
  const clk = { t: 1000 };
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [FIX], media: { clock: { now: () => clk.t, wall: () => 1.8e12 + clk.t } } });
  const windows = [];
  engine.on('outputWindow', (m) => windows.push(m));
  engine.start();
  if (!keep) {
    const f = path.join(engine.media.libraryDir, 'shw', 'one.mov');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(900));
    if (presets) { store.saveShow(SHOW(presets)); await engine.command('show.load', { id: 'shw' }); }
  }
  const media = () => engine.state().media;
  return { dir, store, engine, clk, windows, media, close: async (rm = true) => { await engine.stop(); if (rm) fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Fails if a preset does not load its experience the way experience.play does (layer, output, window), if its
// parameters are not the live ones (or invalid ones get through), or if the state never leaves 'loading'.
test('preset: load runs the experience as experience.play does, with the preset\'s parameters and sound; loading → live on its frames, error after 5 s', async () => {
  const r = await rig();
  try {
    const { engine, media, windows, clk } = r;
    const res = await engine.command('preset.load', { presetId: 'p1' });
    assert.deepEqual(res, { presetId: 'p1', state: 'loading' });
    const st = engine.state();
    assert.deepEqual([st.experience.running, st.experience.url, st.output.running], [true, '/experiences/touch-probe/index.html?run=1', true]);
    assert.equal(st.profile.output.layers.find((l) => l.id === 'experience').on, true);
    assert.equal(windows.at(-1).url, '/output?run=1', 'the same output window as experience.play');
    assert.deepEqual(st.profile.experience.params['touch-probe'], { gain: 1.5, mode: 'soft' }, 'the preset\'s parameters are the live ones; what the manifest does not know is left out');
    assert.deepEqual([st.profile.audio.on, st.profile.audio.sound.id, st.audio.sound.running], [true, 'ambient-notes', true], 'and its sound piece plays');
    assert.deepEqual([media().preset.id, media().preset.experienceId, media().preset.state], ['p1', 'touch-probe', 'loading']);
    await engine.command('experience.report', { fps: 59.8 });
    assert.equal(media().preset.state, 'live', 'its first frames: live');
    await engine.command('experience.report', { fps: 12, error: 'WebGPU lost' });
    assert.deepEqual([media().preset.state, media().preset.error], ['error', 'WebGPU lost']);
    // another experience that never sends a frame: error after 5 s
    await engine.command('preset.load', { presetId: 'p3' });
    assert.deepEqual([media().preset.id, media().preset.state], ['p3', 'loading']);
    clk.t += PRESET_START_MS - 1; engine.media.tick();
    assert.equal(media().preset.state, 'loading');
    clk.t += 1; engine.media.tick();
    assert.deepEqual([media().preset.state, media().preset.error], ['error', 'The experience did not start within 5 s.']);
    await engine.command('experience.report', { fps: 30 });
    assert.deepEqual([media().preset.state, media().preset.error], ['live', null], 'frames after all: live');
    await assert.rejects(engine.command('preset.load', { presetId: 'nope' }), /unknown preset/);
  } finally { await r.close(); }
});

// Fails if a switch between two presets of the same experience reloads its page (its URL or the window would change)
// or stops the clips it launched; if onLoad 'clear' leaves the grid or 'keep' clears it; if another experience keeps
// the clips of the one before.
test('preset: two presets of one experience switch live (no reload, its clips stay); onLoad clear / keep; another experience stops its clips', async () => {
  const r = await rig();
  try {
    const { engine, media, windows } = r;
    await engine.command('preset.load', { presetId: 'p1' });
    await engine.command('experience.report', { fps: 60 });
    const x = await engine.command('clip.trigger', { clipId: 'c1', layerId: XLAYER }); // what the experience launched
    const g1 = await engine.command('clip.trigger', { clipId: 'c1' });                  // the grid, L1
    await engine.command('preset.load', { presetId: 'p3' });                            // keep: the grid plays on…
    assert.equal(media().layers.L1.play.playId, g1.playId, 'onLoad keep: the grid plays on');
    assert.equal(media().xlayer.state, 'empty', 'another experience: what the one before launched stops…');
    assert.equal(media().xlayer.from.playId, x.playId, '…with its transition');
    await engine.command('preset.load', { presetId: 'p1' });
    await engine.command('experience.report', { fps: 60 });
    const x2 = await engine.command('clip.trigger', { clipId: 'c2', layerId: XLAYER });
    const url = engine.state().experience.url, n = windows.length;
    await engine.command('preset.load', { presetId: 'p2' }); // the same experience, onLoad clear, no sound
    assert.equal(engine.state().experience.url, url, 'the same page: not reloaded');
    assert.equal(windows.length, n, 'no new window');
    assert.equal(media().preset.state, 'live', 'it is live at once (the page is already running)');
    assert.deepEqual(engine.state().profile.experience.params['touch-probe'], { gain: 0.5, mode: 'hard' }, 'only the parameters change');
    assert.equal(media().xlayer.play.playId, x2.playId, 'the experience keeps the clip it launched');
    assert.equal(media().layers.L1.state, 'empty', 'onLoad clear: the grid is ejected');
    assert.equal(engine.state().audio.sound.running, false, 'p2 has no sound piece: the one p1 started stops');
  } finally { await r.close(); }
});

// Fails if the "None" card leaves the experience, its clips or its sound running, or stops the grid.
test('preset: unload — no experience, its clips and sound piece stop, the grid plays on; a clips-only preset stops the experience', async () => {
  const r = await rig();
  try {
    const { engine, media } = r;
    await engine.command('preset.load', { presetId: 'p1' });
    await engine.command('clip.trigger', { clipId: 'c1', layerId: XLAYER });
    const g = await engine.command('clip.trigger', { clipId: 'c2' }); // L2
    await engine.command('preset.unload', {});
    assert.deepEqual([engine.state().experience.running, media().preset, media().xlayer.state, engine.state().audio.sound.running], [false, null, 'empty', false]);
    assert.equal(media().layers.L2.play.playId, g.playId);
    assert.equal(engine.state().output.running, true, 'the output stays on: the clips are on it');
    await engine.command('preset.load', { presetId: 'p1' });
    await engine.command('preset.load', { presetId: 'p4' });
    assert.deepEqual([engine.state().experience.running, media().preset.id, media().preset.state], [false, 'p4', 'live']);
  } finally { await r.close(); }
});

// Fails if preset.param skips the manifest's checks, does not reach the live experience when its preset is live (or
// reaches it when it is not), or is not saved with the show; or if the old experience.param leaves the live preset behind.
test('preset: parameters — checked against the manifest, live when the preset is live, saved with the show; experience.param keeps the live preset', async () => {
  const r = await rig();
  try {
    const { engine, store } = r;
    await engine.command('preset.load', { presetId: 'p1' });
    assert.deepEqual(await engine.command('preset.param', { presetId: 'p1', key: 'gain', value: 1.8 }), { value: 1.8 });
    assert.equal(engine.state().profile.experience.params['touch-probe'].gain, 1.8, 'live');
    await engine.command('preset.param', { presetId: 'p2', key: 'gain', value: 9 });
    assert.equal(engine.state().profile.experience.params['touch-probe'].gain, 1.8, 'another preset: not live');
    await engine.command('experience.param', { key: 'mode', value: 'hard' }); // the old API, on the live preset
    await engine.command('preset.param', { presetId: 'p1', key: 'key', value: 'F', sound: true });
    await engine.command('app.lock', { locked: true });
    await engine.command('preset.param', { presetId: 'p1', key: 'trails', value: true }); // allowed in Show mode
    await until(() => store.loadShow('shw').presets[0].params.trails === true, 3000, 'the show written');
    const saved = store.loadShow('shw').presets;
    assert.deepEqual(saved[0].params, { gain: 1.8, mode: 'hard', bogus: 3, trails: true });
    assert.deepEqual(saved[0].sound.params, { key: 'F' });
    assert.equal(saved[1].params.gain, 2, 'clamped into the manifest\'s range');
    for (const [args, why] of [
      [{ presetId: 'p1', key: 'mode', value: 'medium' }, /one of/], [{ presetId: 'p1', key: 'nope', value: 1 }, /no parameter/],
      [{ presetId: 'zz', key: 'gain', value: 1 }, /unknown preset/], [{ presetId: 'p4', key: 'gain', value: 1 }, /has no experience/],
      [{ presetId: 'p2', key: 'key', value: 'F', sound: true }, /has no sound piece/],
    ]) await assert.rejects(engine.command('preset.param', args), why);
  } finally { await r.close(); }
});

// Fails if the old API stops loading what the operator built (the preset of that experience, with its parameters and
// sound), or if without a preset it does not work exactly as before.
test('preset: experience.play {id} (old API) loads the show\'s preset of that experience; without one it works as before; experience.stop', async () => {
  const r = await rig();
  try {
    const { engine, media } = r;
    engine.profile.experience.params['touch-probe'] = { gain: 0.1 };
    await engine.command('experience.play', { id: 'touch-probe' });
    assert.deepEqual([media().preset.id, engine.state().profile.experience.params['touch-probe'].gain, engine.state().audio.sound.running], ['p1', 1.5, true], 'the first preset of touch-probe, with its parameters and sound');
    await engine.command('experience.stop', {});
    assert.deepEqual([engine.state().experience.running, media().preset, engine.state().audio.sound.running], [false, null, true], 'stop: as before (the sound is left alone)');
  } finally { await r.close(); }
  const r2 = await rig({ presets: [] }); // a show with no preset of it
  try {
    const { engine, media } = r2;
    engine.profile.experience.params['touch-probe'] = { gain: 0.3 };
    await engine.command('experience.play', { id: 'touch-probe' });
    assert.deepEqual([engine.state().experience.running, engine.state().profile.experience.params['touch-probe'].gain], [true, 0.3], 'its parameters as they were');
    assert.deepEqual([media().preset.id, media().preset.experienceId, media().preset.state], [null, 'touch-probe', 'loading'], 'no card, but the state says what is live');
  } finally { await r2.close(); }
});

// Fails if a show made in a room that played an experience does not get it as its first card (with its parameters and
// sound piece, and as the start preset when the room started it with the app), or if a show with presets is changed.
test('preset: migration — a show without presets gets the room\'s experience and sound piece as its first card', async () => {
  const profile = {
    name: 'Old room', experience: { id: 'touch-probe', autostart: true, params: { 'touch-probe': { gain: 0.75 }, other: { x: 1 } } },
    audio: { on: true, sound: { id: 'ambient-notes', params: { 'ambient-notes': { key: 'A' } } } },
  };
  const r = await rig({ profile, presets: null });
  try {
    const { engine, store } = r;
    await engine.command('show.create', { name: 'Gallery' });
    const s = engine.state().show;
    assert.deepEqual(s.presets, [{ id: 'p1', name: 'Touch probe', experienceId: 'touch-probe', params: { gain: 0.75 }, sound: { id: 'ambient-notes', params: { key: 'A' } }, media: {}, onLoad: 'keep' }]);
    assert.equal(s.start.presetId, 'p1', 'the room started it with the app: so does the show');
    assert.deepEqual(store.loadShow(s.id).presets.map((p) => p.id), ['p1'], 'saved');
    // a show that has its presets is left alone
    store.saveShow(SHOW([{ id: 'own', name: 'Own card', experienceId: 'alma-fluid' }]));
    await engine.command('show.load', { id: 'shw' });
    assert.deepEqual(engine.state().show.presets.map((p) => p.id), ['own']);
  } finally { await r.close(); }
  const visual = [{ id: 'touch-probe', name: 'Touch probe', params: [] }];
  assert.equal(migratePresets(normalizeShow({}), normalizeProfile({ experience: { id: 'gone' } }), visual, []), null, 'an experience that is not installed: no card');
  assert.equal(migratePresets(normalizeShow({}), normalizeProfile({}), visual, []), null, 'a room that played nothing: no card');
  assert.deepEqual(cleanParams({ params: [{ key: 'n', type: 'number', min: 0, max: 1 }] }, { n: 7, x: 1 }), { n: 1 });
});

// Fails if a restarted engine forgets which preset was live, or leaves its experience off.
test('preset: after an engine restart the live preset comes back with its experience running', async () => {
  const r = await rig();
  let b = null;
  try {
    await r.engine.command('preset.load', { presetId: 'p1' });
    await r.engine.command('experience.report', { fps: 60 });
    // the engine dies (its snapshot is on disk); a new one starts on the same data, 3 s later on the wall clock
    b = await rig({ dir: r.dir, keep: true });
    b.clk.t = 4000;
    assert.equal(b.engine.state().media.preset?.id, 'p1');
    assert.equal(b.engine.state().experience.running, true);
  } finally { await b?.close(false); await r.close(); }
});

// Fails if the manifest's clip slots or its transparency are lost or let through malformed.
test('experiences: a manifest declares clip slots (clip / clips with max) and whether it is transparent', () => {
  const e = normManifest({ id: 'reel', media: [
    { key: 'reel', label: 'Reel clip', type: 'clip' }, { key: 'projects', label: 'Projects', type: 'clips', max: 12 },
    { key: 'many', type: 'clips', max: 500 }, { key: 'reel', type: 'clips' }, { key: 'bad key', type: 'clip' }, null,
  ], transparent: true }, 'reel', '/x');
  assert.deepEqual(e.media, [
    { key: 'reel', label: 'Reel clip', type: 'clip', max: 1 }, { key: 'projects', label: 'Projects', type: 'clips', max: 12 },
    { key: 'many', label: 'many', type: 'clips', max: 64 },
  ]);
  assert.equal(e.transparent, true);
  assert.deepEqual([normManifest({ id: 'x' }, 'x', '/x').media, normManifest({ id: 'x', transparent: 'yes' }, 'x', '/x').transparent], [[], false]);
});
