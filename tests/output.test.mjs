// The room output (engine side): ONE image for the whole app — the experience, the touches mask and the pixel map as
// layers the operator orders — sent by the ONE Spout sender (app/main.js). Profile migration, the layers command,
// the calibration mode that overrides them, the window message, and "there is only ever one Spout sender".
// The page that composes the layers is tested in tests/ui.test.mjs; the native sender in tests/spout.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { normalizeProfile } from '../engine/profile.js';
import { TextureOutput } from '../engine/outputs/texture.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');

/** A test engine on a temp folder with the bundled simulated XR Lab room, its output off and its layers at the defaults. */
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-out-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const sim = store.listProfiles().find((q) => q.id.endsWith('-sim')).id, prof = store.loadProfile(sim);
  prof.experience = normalizeProfile({}).experience;
  prof.output = normalizeProfile({ output: {} }).output;
  store.saveProfile(prof);
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [FIX] });
  const msgs = [];
  engine.on('outputWindow', (m) => msgs.push(m));
  return { dir, engine, msgs };
}
const ids = (layers) => layers.map((l) => l.id);
const layer = (engine, id) => engine.profile.output.layers.find((l) => l.id === id);

test('output: a profile saved before the room output keeps its experience destination and its Spout texture becomes the touches layer', () => {
  const old = {
    canvas: { width: 1000, height: 400 },
    experience: { id: 'alma-fluid', autostart: true, sink: 'window', senderName: 'VEATION Touch Experience', displayId: 5, fit: 'stretch', scale: 1, fps: 30, params: { 'alma-fluid': { logoWall: 'P1' } } },
    outputs: [
      { id: 'O1', type: 'osc' },
      { id: 'T1', type: 'texture', enabled: true, sink: 'spout', senderName: 'Resolume mask', radius: 0.2, sizeMode: 'touch', softness: 0.3, trailMs: 400, walls: ['W1'], scale: 0.5 },
      { id: 'T2', type: 'texture', enabled: true, sink: 'ndi', senderName: 'NDI mask' },
      { id: 'T3', type: 'texture', enabled: true }, // no sink = Spout, as it always was
    ],
  };
  const p = normalizeProfile(old);
  const o = p.output;
  assert.deepEqual([o.sink, o.displayId, o.fit, o.scale, o.fps], ['window', 5, 'stretch', 1, 30], 'where the experience went is where the output goes');
  assert.equal(o.senderName, 'Resolume mask', 'a customised Spout name is kept');
  assert.equal(o.on, true, 'it was starting with the app: the output is on');
  const t = o.layers.find((l) => l.id === 'touches');
  assert.deepEqual([t.on, t.radius, t.sizeMode, t.softness, t.trailMs, t.walls, t.scale], [true, 0.2, 'touch', 0.3, 400, ['W1'], 0.5], 'the Texture\'s settings');
  assert.equal(o.layers.find((l) => l.id === 'experience').on, true);
  assert.equal(o.layers.find((l) => l.id === 'grid').on, false);
  assert.deepEqual(p.outputs.map((x) => x.id), ['O1', 'T2', 'T3'], 'the texture that became the touches layer leaves the list; OSC and NDI stay');
  const t3 = p.outputs.find((x) => x.id === 'T3');
  assert.deepEqual([t3.sink, t3.enabled], ['ndi', false], 'another Spout texture is kept, switched off, on NDI — not deleted (one Spout sender)');
  assert.deepEqual(p.experience, { id: 'alma-fluid', autostart: true, params: { 'alma-fluid': { logoWall: 'P1' } } });
  // it runs once: a profile that has its output is not migrated again
  assert.deepEqual(normalizeProfile(p).output, o);
  assert.deepEqual(normalizeProfile(JSON.parse(JSON.stringify(p))).outputs.map((x) => x.id), ['O1', 'T2', 'T3']);

  // the experience's own sender name when the Texture had none of its own; the default otherwise
  assert.equal(normalizeProfile({ experience: { senderName: 'Wall show' } }).output.senderName, 'Wall show');
  assert.equal(normalizeProfile({ experience: { senderName: 'VEATION Touch Experience' } }).output.senderName, 'VEATION Touch');
  // not playing, no texture: the output is off and stays quiet
  const quietRoom = normalizeProfile({ experience: { id: 'x', autostart: false } }).output;
  assert.deepEqual([quietRoom.on, quietRoom.layers.find((l) => l.id === 'experience').on], [false, false]);
  // a disabled Texture over Spout becomes a touches layer that is off
  assert.equal(normalizeProfile({ outputs: [{ type: 'texture', enabled: false }] }).output.layers.find((l) => l.id === 'touches').on, false);
});

test('output: the bundled rooms — XR Lab sends the experience over "VEATION Touch", the simulated one starts with the output off', () => {
  for (const [file, on, scale] of [['xrlab', true, 1], ['xrlab-sim', false, 0.5]]) {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'profiles', `${file}.json`), 'utf8'));
    assert.ok(raw.output, `${file} carries its own output`);
    const p = normalizeProfile(raw);
    assert.deepEqual([p.output.on, p.output.sink, p.output.senderName, p.output.scale], [on, 'spout', 'VEATION Touch', scale]);
    const e = p.output.layers.find((l) => l.id === 'experience');
    assert.equal(e.on, true);
    assert.equal(p.experience.id, 'alma-fluid');
    assert.equal(p.experience.params['alma-fluid'].logoWall, 'P1');
    assert.equal('sink' in raw.experience, false, 'the destination left the experience');
  }
});

test('output: layers are normalised — the three of them once each, in the order given, with their blend and opacity', () => {
  const o = (layers) => normalizeProfile({ output: { layers } }).output.layers;
  assert.deepEqual(ids(o(undefined)), ['experience', 'touches', 'grid'], 'default: bottom → top');
  assert.deepEqual(ids(o([{ id: 'grid' }, { id: 'experience' }, { id: 'touches' }])), ['grid', 'experience', 'touches'], 'the array order is the stacking order');
  assert.deepEqual(ids(o([{ id: 'touches' }, { id: 'touches' }, { id: 'bogus' }, null, { id: 'grid' }])), ['experience', 'touches', 'grid'], 'duplicates and unknown ids go; a missing experience goes to the bottom');
  assert.deepEqual(ids(o([{ id: 'grid' }])), ['experience', 'grid', 'touches'], 'what is missing is added: the experience below, the others on top');
  const l = o([{ id: 'experience', opacity: 3, blend: 'burn' }, { id: 'touches', opacity: -1, blend: 'add', radius: 9, softness: 'x', scale: 0.3, walls: ['A', 4] }, { id: 'grid', opacity: 0.456 }]);
  assert.deepEqual([l[0].opacity, l[0].blend], [1, 'normal'], 'opacity clamped to 0..1, an unknown blend falls back');
  assert.deepEqual([l[1].opacity, l[1].blend, l[1].radius, l[1].softness, l[1].scale, l[1].walls], [0, 'add', 1, 0.5, 0.25, ['A']]);
  assert.equal(l[2].opacity, 0.46);
  assert.deepEqual([l[0].on, l[1].on, l[2].on], [true, false, false], 'defaults: the experience on, the touches and the grid off');
  assert.deepEqual([l[1].blend, l[2].blend].concat(o(undefined)[0].blend), ['add', 'screen', 'normal']);
  assert.equal('radius' in l[0] || 'radius' in l[2], false, 'only the touches layer carries mask settings');
});

test('output: output.layers validates, keeps what it leaves out, and saves in the profile', async () => {
  const { engine, dir } = setup();
  engine.start();
  try {
    const base = engine.profile.output.layers;
    for (const [bad, why] of [
      [[{ id: 'experience' }, { id: 'touches' }], /all of/],
      [[...base, { id: 'grid' }], /twice/],
      [[{ id: 'experience' }, { id: 'touches' }, { id: 'wallpaper' }], /layer: one of/],
      [base.map((l) => (l.id === 'grid' ? { ...l, blend: 'burn' } : l)), /blend is one of/],
      [base.map((l) => (l.id === 'grid' ? { ...l, opacity: 2 } : l)), /opacity/],
      [base.map((l) => (l.id === 'grid' ? { ...l, on: 1 } : l)), /on is true or false/],
      [base.map((l) => (l.id === 'touches' ? { ...l, radius: 0 } : l)), /radius/],
      [base.map((l) => (l.id === 'touches' ? { ...l, scale: 0.3 } : l)), /scale/],
      [base.map((l) => (l.id === 'touches' ? { ...l, walls: ['nowhere'] } : l)), /walls/],
    ]) await assert.rejects(engine.command('output.layers', { layers: bad }), why);
    await assert.rejects(engine.command('output.layers', {}), /list/);
    assert.deepEqual(engine.profile.output.layers, base, 'a refused command changes nothing');

    const wall = engine.profile.walls[0].id;
    await engine.command('output.layers', { layers: [{ id: 'grid', on: true, blend: 'add' }, { id: 'experience', opacity: 0.4 }, { id: 'touches', on: true, radius: 0.15, walls: [wall] }] });
    const L = engine.profile.output.layers;
    assert.deepEqual(ids(L), ['grid', 'experience', 'touches'], 'reordered');
    assert.deepEqual([L[0].on, L[0].blend, L[1].opacity, L[1].blend, L[2].on, L[2].radius, L[2].walls, L[2].softness], [true, 'add', 0.4, 'normal', true, 0.15, [wall], 0.5], 'the rest is kept or defaulted');
    assert.deepEqual(engine.state().profile.output.layers, L, 'the UI is told');
    assert.deepEqual(engine.state().output.layersEffective, L, 'and the output page follows the same order');
    await engine.stop(); // writes the profile
    const again = new Store(dir, path.join(root, 'profiles'), quiet).loadProfile(engine.profile.id);
    assert.deepEqual(ids(again.output.layers), ['grid', 'experience', 'touches'], 'the order is saved with the room');
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('output: calibration mode — while a calibration, verification, Fit, walk test or the grid runs the output shows the grid on the touches only, and comes back', async () => {
  const { engine, dir } = setup();
  engine.start();
  try {
    await engine.command('output.layers', { layers: [{ id: 'touches', on: false, radius: 0.12 }, { id: 'experience', on: true, opacity: 0.5 }, { id: 'grid', on: false }] });
    await engine.command('output.set', { on: true });
    const mine = structuredClone(engine.profile.output.layers);
    const out = () => engine.state().output;
    const wall = engine.profile.walls[0].id;
    assert.deepEqual([out().calibrating, out().running], [false, true]);
    assert.deepEqual(out().layersEffective, mine, 'normally: the operator\'s layers, as they are');

    const effective = () => out().layersEffective;
    const expectCalibration = (what) => {
      assert.equal(out().calibrating, true, `${what}: calibration mode`);
      assert.deepEqual(ids(effective()), ['touches', 'grid'], `${what}: touches, then the grid on top — no experience`);
      assert.deepEqual(effective().map((l) => [l.on, l.opacity, l.blend]), [[true, 1, 'screen'], [true, 1, 'screen']], `${what}: both on, full, screen`);
      assert.equal(effective()[0].radius, 0.12, `${what}: the touches keep the operator's mask settings`);
      assert.deepEqual(engine.profile.output.layers, mine, `${what}: the operator's layers are not touched`);
    };
    const expectBack = (what) => {
      assert.equal(out().calibrating, false, `${what}: back`);
      assert.deepEqual(effective(), mine, `${what}: the operator's layers again`);
    };

    // the grid (pixel map)
    await engine.command('projection.set', { grid: true });
    expectCalibration('grid');
    await engine.command('projection.set', { grid: false });
    expectBack('grid off');

    // a calibration
    await engine.command('calib.start', { wallId: wall, force: true });
    expectCalibration('calibration');
    await engine.command('calib.cancel');
    expectBack('calibration cancelled');

    // a verification
    await engine.command('verify.start', { wallId: wall });
    expectCalibration('verification');
    await engine.command('verify.cancel');
    expectBack('verification closed');

    // Fit and the walk test (from the phone)
    await engine.command('projection.set', { fit: { wallId: wall, node: 0 } });
    expectCalibration('fit');
    await engine.command('projection.set', { fit: null });
    expectBack('fit closed');
    await engine.command('projection.set', { walk: true });
    expectCalibration('walk test');
    await engine.command('projection.set', { walk: false });
    expectBack('walk test closed');

    // two at once: it stays in calibration mode until the last one ends
    await engine.command('projection.set', { grid: true });
    await engine.command('calib.start', { wallId: wall, force: true });
    await engine.command('projection.set', { grid: false });
    expectCalibration('calibration after the grid went off');
    await engine.command('calib.cancel');
    expectBack('everything closed');

    // the output page is told on every change (it follows the state)
    let states = 0;
    engine.on('state', () => states++);
    await engine.command('projection.set', { grid: true });
    assert.ok(states >= 1);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('output: the window message exists while the output is on — with or without an experience — and follows where it goes', async () => {
  const { engine, dir, msgs } = setup();
  engine.start();
  try {
    assert.equal(engine.outputWindow(), null);
    assert.equal(msgs.length, 0);
    const c = engine.profile.canvas;
    await engine.command('output.set', { on: true }); // no experience at all
    assert.deepEqual(msgs.at(-1), { url: '/output?run=1', sink: 'spout', displayId: null, fit: 'fit', scale: 0.5, fps: 60, senderName: 'VEATION Touch',
      width: Math.round(c.width * 0.5), height: Math.round(c.height * 0.5) });
    assert.equal(engine.state().output.url, '/output?run=1');
    assert.equal(engine.state().experience.running, false, 'the output runs, the experience does not');
    const n = msgs.length;
    await engine.command('output.layers', { layers: engine.profile.output.layers.map((l) => ({ ...l, opacity: 0.5 })) });
    await engine.command('experience.play', { id: 'touch-probe' });
    await engine.command('projection.set', { grid: true });
    assert.equal(msgs.length, n, 'layers, play and calibration mode never reopen the window: the page follows the state');
    await engine.command('output.set', { scale: 1 });
    assert.equal(msgs.at(-1).width, c.width, 'a new render size is a new window');
    await engine.command('output.set', { on: false });
    assert.equal(msgs.at(-1), null);
    assert.equal(engine.state().output.running, false);
    assert.equal(engine.state().output.url, null);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('output: there is only ever one Spout sender — the main process\'s; a Texture output cannot send over Spout', async () => {
  // profiles: the destination of a Texture output is NDI or full screen, whatever an old file says
  const sink = (o) => normalizeProfile({ output: {}, outputs: [{ type: 'texture', ...o }] }).outputs[0].sink;
  assert.deepEqual([sink({ sink: 'spout' }), sink({}), sink({ sink: 'hdmi' }), sink({ sink: 'ndi' }), sink({ sink: 'window' })], ['ndi', 'ndi', 'ndi', 'ndi', 'window']);
  // the output: Spout or a full-screen window
  const dest = (o) => normalizeProfile({ output: o }).output.sink;
  assert.deepEqual([dest({}), dest({ sink: 'window' }), dest({ sink: 'ndi' })], ['spout', 'window', 'spout']);

  // a Texture output starts nothing but its NDI source: the engine never loads the Spout addon
  const t = new TextureOutput(quiet);
  const prof = normalizeProfile({ canvas: { width: 400, height: 200 }, walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }] });
  t.configure({ ...prof.outputs[0], type: 'texture', sink: 'spout', scale: 0.25, senderName: 'X', radius: 0.1, softness: 0, trailMs: 0 }, prof);
  assert.equal(t.started, false, 'sink "spout" is not a destination of a Texture output any more');
  assert.equal(t.send([{ wall: prof.walls[0], touches: [] }], 16), false);
  t.close();

  // and no code but the main process's loads the addon
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const loaders = ['app', 'engine', 'ui', 'experiences'].flatMap((d) => walk(path.join(root, d)))
    .filter((f) => /\.(js|cjs|mjs|html)$/.test(f) && /dsp_spout/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'));
  assert.deepEqual(loaders, ['app/main.js'], 'the only Spout sender is app/main.js\'s');
  assert.equal(/require\(/.test(fs.readFileSync(path.join(root, 'app', 'experience-preload.cjs'), 'utf8').replace(/require\('electron'\)/g, '')), false, 'the output window\'s preload loads nothing native');
});

test('output: output and layer changes move the profile revision on (a stale edit is refused, not silently undoing them), and switches are on disk at once', async () => {
  const { dir, engine } = setup();
  engine.start();
  try {
    const old = structuredClone(engine.profile), rev0 = engine.rev;
    await engine.command('output.layers', { layers: engine.profile.output.layers.map((l) => (l.id === 'grid' ? { ...l, on: true } : l)) });
    assert.ok(engine.rev > rev0, 'the revision moved on');
    // another device sends an edit made from the profile as it was before: refused, the grid layer stays on
    await assert.rejects(engine.command('profile.update', { profile: old, rev: rev0 }), /stale/);
    assert.equal(layer(engine, 'grid').on, true);
    // a switch is written immediately (an app quit right after must not lose it); a fader waits for things to settle
    await engine.command('output.set', { on: true });
    const disk = () => engine.store.loadProfile(engine.profile.id).output;
    assert.equal(disk().on, true, 'output.set is on disk at once');
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('output: the preview image is only asked of the desktop app while someone looks at it; its fps and errors arrive anyway', async () => {
  const { dir, engine } = setup();
  engine.start();
  try {
    await engine.command('output.set', { on: true });
    assert.equal(engine.previewWanted(), false, 'nobody asked: no capture');
    engine.setOutputPreview(null, { fps: 58.7, error: null }); // a report without an image
    assert.equal(engine.out.fps, 58.7);
    assert.equal(engine.outPreview, null);
    engine.notePreviewAsked();
    assert.equal(engine.previewWanted(), true, 'the Experiences tab asked for it');
    engine.setOutputPreview(Buffer.from([0xff, 0xd8, 0xff]), { fps: 60 });
    assert.ok(engine.outPreview?.buf?.length === 3);
    engine.out.previewAskedAt = Date.now() - 6000;
    assert.equal(engine.previewWanted(), false, 'nobody for 5 s: it stops');
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
