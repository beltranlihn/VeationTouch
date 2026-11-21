// The Advanced Output (MEDIA-SERVER.md §5, phase F9): screens ▸ slices — the canvas cut into slices drawn onto the room's
// screens (the Datapath Fx4's 3840×2400 input split into four 1920×1200 outputs in XR Lab). Pure parts in Node: the
// schema and its migration, the templates, the geometry (rect, corner pin, grid, flips), nudging and snapping, which
// display is which. The engine: no window for a screen that is not there (Problems), the test card. In Electron: the
// REAL output page drawing the slices (read back with readPixels — in the tests only) and the REAL UI's arrows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile, normRoomOutput, normScreens } from '../engine/profile.js';
import { templateFx4, templateFromWalls, templatePerWall, canvasToScreen, sliceMesh, sliceInput, nudgeSlice, placeSlice, setOutputMode, snapRect, matchDisplay, screensLayout, outputBounds } from '../engine/media/screens.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const seed = (f) => JSON.parse(fs.readFileSync(path.join(root, 'profiles', `${f}.json`), 'utf8'));
const xr = () => normalizeProfile(seed('xrlab'));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const FX4_DISPLAY = { id: 77, label: 'Fx4', width: 3840, height: 2400, primary: false, bounds: { x: 1920, y: 0, width: 3840, height: 2400 }, scaleFactor: 1, hz: 60 };
const LAPTOP = { id: 1, label: 'Built-in', width: 1920, height: 1200, primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1200 }, scaleFactor: 1, hz: 60 };

// ------------------------------------------------------------------------------------------------ schema

// Fails if adding the screens changes anything else of a profile saved before them: the sink, the layers, Spout.
test('screens: a profile without screens gets screens: [] and nothing else changes — sink, layers, sender as before; the seeds keep Spout with the Fx4 ready', () => {
  assert.deepEqual(normalizeProfile({}).output.screens, []);
  for (const before of [{ output: { on: true, sink: 'window', displayId: 3, scale: 1, layers: [{ id: 'grid' }, { id: 'experience' }] } }, { output: { sink: 'spout', senderName: 'Room' } }]) {
    const { screens, ...rest } = normalizeProfile(before).output;
    assert.deepEqual(screens, []);
    assert.deepEqual(rest, normRoomOutput(before.output), 'everything but screens is what it was before F9');
  }
  // the bundled rooms, as they were saved before the screens (field removed): same output, nothing to migrate
  for (const f of ['xrlab', 'xrlab-sim']) {
    const raw = seed(f), old = structuredClone(raw);
    delete old.output.screens;
    const a = normalizeProfile(old).output, b = normalizeProfile(raw).output;
    assert.equal(b.sink, 'spout', `${f}: the seed stays on Spout until the operator switches in the room (§10)`);
    assert.deepEqual({ ...a, screens: null }, { ...b, screens: null }, `${f}: the Fx4 screen is the only difference`);
    assert.deepEqual(b.screens.map((s) => [s.name, s.width, s.height, s.slices.length]), [['Fx4', 3840, 2400, 4]]);
  }
  assert.equal(normalizeProfile({ output: { sink: 'screens' } }).output.sink, 'screens');
  assert.equal(normalizeProfile({ output: { sink: 'ndi' } }).output.sink, 'spout', 'an unknown sink falls back to Spout');
});

// Fails if the normaliser lets through what the output page cannot draw (bad corners, a slice of a wall that is not
// there, a rect larger than the canvas, two slices with the same id: the UI selects by id).
test('screens: normScreens clamps and repairs — unknown wall, bad corners, inputs inside the canvas, unique ids, a valid grid kept', () => {
  const p = xr();
  const L = normScreens([
    { id: 'A', name: '', width: 99999, height: 5, slices: [
      { id: 'X', wallId: 'NOPE', output: { mode: 'corners', corners: [[0, 0], [1, 2]] }, input: { x: -50, y: 10, w: 99999, h: 99999 } },
      { id: 'X', wallId: 'P1', output: { mode: 'grid', us: [0, 1], vs: [0, 1], points: [[0, 0], [10, 0], [0, 10], [10, 10]] } },
    ] },
    { id: 'A', slices: [{}] }, null,
  ], p.canvas, p.walls);
  assert.equal(L.length, 2);
  assert.deepEqual(L.map((s) => s.id), ['A', 'SC2'], 'screen ids unique');
  assert.deepEqual([L[0].width, L[0].height, L[0].name], [16384, 16, 'Screen 1']);
  const [a, b] = L[0].slices;
  assert.deepEqual([a.wallId, a.output.mode, a.input], [null, 'rect', { x: 0, y: 10, w: 7196, h: 902 }], 'no such wall; corners that are not 4 points fall back to a rect; the input stays in the canvas');
  const sids = L.flatMap((s) => s.slices.map((x) => x.id));
  assert.deepEqual([sids[0], new Set(sids).size], ['X', 3], 'slice ids unique across screens (the UI selects by id)');
  assert.deepEqual([b.wallId, b.output.mode, b.output.points.length], ['P1', 'grid', 4]);
  assert.deepEqual(L[1].slices[0].output, { mode: 'rect', rect: { x: 0, y: 0, w: 1920, h: 1080 } }, 'default: the whole screen');
});

// ------------------------------------------------------------------------------------------------ templates

// The director's decision (§10): walls in canvas order P4, P1, P2, P3 → TL, TR, BL, BR, each 1:1 and centred in its
// 1920×1200 quadrant. Fails if the order, the centring or the scale changes.
test('screens: the Datapath Fx4 template on XR Lab — four slices 1912 / 1692 / 1920 / 1672 × 912, unscaled, centred in TL, TR, BL, BR', () => {
  const p = xr();
  const [sc] = templateFx4(p);
  assert.deepEqual([sc.name, sc.width, sc.height, sc.display], ['Fx4', 3840, 2400, null]);
  assert.deepEqual(sc.slices.map((s) => s.wallId), ['P4', 'P1', 'P2', 'P3']);
  assert.deepEqual(sc.slices.map((s) => s.output.rect.w), [1912, 1692, 1920, 1672]);
  assert.ok(sc.slices.every((s) => s.output.rect.h === 912 && s.input === null && !s.flipH && !s.flipV), 'unscaled, following its wall');
  const quad = [[0, 0], [1920, 0], [0, 1200], [1920, 1200]];
  sc.slices.forEach((s, i) => {
    const r = s.output.rect, [qx, qy] = quad[i];
    assert.ok(r.x >= qx && r.x + r.w <= qx + 1920 && r.y >= qy && r.y + r.h <= qy + 1200, `${s.name} inside its quadrant`);
    assert.ok(Math.abs((r.x - qx) - (qx + 1920 - r.x - r.w)) <= 1 && r.y - qy === 144, `${s.name} centred`);
  });
  // Fit: each as large as its quadrant allows, proportions kept
  const [fit] = templateFx4(p, { fit: true });
  fit.slices.forEach((s, i) => {
    const r = s.output.rect, w = p.walls.find((x) => x.id === s.wallId).pixelRect;
    assert.ok(r.w === 1920 || r.h === 1200, `${s.name} fills its quadrant in one direction`);
    assert.ok(Math.abs(r.w / r.h - w.w / w.h) < 0.01, `${s.name} keeps its proportions`);
    assert.ok(r.x >= quad[i][0] && r.x + r.w <= quad[i][0] + 1920);
  });
  // the seed IS the template (what the room gets tomorrow)
  assert.deepEqual(normalizeProfile(seed('xrlab')).output.screens, normScreens(templateFx4(p), p.canvas, p.walls));
  // the other two
  const all = templateFromWalls(p);
  assert.deepEqual([all.width, all.height, all.slices.map((s) => s.output.rect.x)], [7196, 912, [0, 1912, 3604, 5524]], 'slices from walls: where each wall is on the canvas');
  const per = templatePerWall(p, [LAPTOP, { ...FX4_DISPLAY, id: 5, width: 1920, height: 1200, bounds: { x: 1920, y: 0, width: 1920, height: 1200 } }]);
  assert.deepEqual(per.map((s) => [s.name, s.display?.id ?? null, s.width]), [['P4', 5, 1920], ['P1', null, 1920], ['P2', null, 1920], ['P3', null, 1920]], 'a screen per wall; the secondary displays in order');
});

// ------------------------------------------------------------------------------------------------ geometry

// Fails if a mode maps the canvas somewhere else than its own formula says, or if the mesh the GPU draws disagrees
// with canvasToScreen (the image would not land where the inspector says).
test('screens: geometry — a canvas point lands on the expected screen pixel through a rect, a corner pin and a grid, with flips', () => {
  const p = xr(), [sc] = templateFx4(p), s = sc.slices[1]; // P1 → top-right, at (2034, 144)
  const inp = sliceInput(s, p);
  assert.deepEqual(inp, p.walls.find((w) => w.id === 'P1').pixelRect, 'a linked slice follows its wall');
  assert.deepEqual(canvasToScreen(s, inp, 2000, 0), [2034 + 88, 144], 'canvas x=2000 is P1 x=88 → its quadrant');
  assert.equal(canvasToScreen(s, inp, 1000, 0), null, 'a point of another wall is not in this slice');
  assert.deepEqual(canvasToScreen({ ...s, flipH: true }, inp, 1912, 0), [2034 + 1692, 144], 'flip H: the left edge goes right');
  assert.deepEqual(canvasToScreen({ ...s, flipV: true }, inp, 1912, 0), [2034, 144 + 912], 'flip V');
  // corner pin: a trapezoid — its corners exactly, the centre on the diagonals' crossing (a homography, not bilinear)
  const cp = { ...s, output: { mode: 'corners', corners: [[2000, 100], [3800, 200], [3700, 1100], [2100, 1000]] } };
  assert.deepEqual(canvasToScreen(cp, inp, inp.x, inp.y).map(Math.round), [2000, 100]);
  assert.deepEqual(canvasToScreen(cp, inp, inp.x + inp.w, inp.y + inp.h).map(Math.round), [3700, 1100]);
  const [cx, cy] = canvasToScreen(cp, inp, inp.x + inp.w / 2, inp.y + inp.h / 2);
  const cross = (() => { const [a, b, c, d] = cp.output.corners; const t = ((d[0] - a[0]) * (d[1] - b[1]) - (d[1] - a[1]) * (d[0] - b[0])) / ((c[0] - a[0]) * (d[1] - b[1]) - (c[1] - a[1]) * (d[0] - b[0])); return [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])]; })();
  assert.ok(close(cx, cross[0], 1e-6) && close(cy, cross[1], 1e-6), 'the centre maps to where the diagonals cross');
  // grid: made from the rect, it maps like the rect; moving the middle node moves the middle point with it
  const g = setOutputMode(s, 'grid');
  assert.deepEqual(canvasToScreen(g, inp, 2000, 456).map((v) => Math.round(v * 10) / 10), canvasToScreen(s, inp, 2000, 456));
  g.output.points[4] = [g.output.points[4][0] + 40, g.output.points[4][1] - 30];
  const mid = canvasToScreen(g, inp, inp.x + inp.w / 2, inp.y + inp.h / 2), was = canvasToScreen(s, inp, inp.x + inp.w / 2, inp.y + inp.h / 2);
  assert.deepEqual([Math.round(mid[0] - was[0]), Math.round(mid[1] - was[1])], [40, -30]);
  // the mesh the GPU draws says the same: every vertex is canvasToScreen of its texture coordinate
  for (const sl of [s, cp, g, { ...cp, flipH: true }]) {
    const m = sliceMesh(sl, inp, p.canvas);
    for (let k = 0; k < m.count; k += 7) {
      const [x, y] = canvasToScreen(sl, inp, m.uv[k * 2] * p.canvas.width, m.uv[k * 2 + 1] * p.canvas.height);
      assert.ok(close(x, m.pos[k * 2], 0.05) && close(y, m.pos[k * 2 + 1], 0.05), `${sl.output.mode} vertex ${k}`);
    }
  }
});

// Fails if the arrows' step, the actions or the snapping change (1 px, Shift 10 px; edges, halves, quarters, neighbours).
test('screens: nudging, the inspector actions and snapping', () => {
  const p = xr(), [sc] = templateFx4(p), s = sc.slices[0];
  assert.deepEqual(nudgeSlice(s, 'output', 1, 0, p).output.rect, { ...s.output.rect, x: 5 }, 'arrow: 1 px');
  assert.deepEqual(nudgeSlice(s, 'output', 0, 10, p).output.rect, { ...s.output.rect, y: 154 }, 'Shift + arrow: 10 px');
  assert.deepEqual(nudgeSlice(s, 'input', 10, 0, p).input, { x: 10, y: 0, w: 1912, h: 912 }, 'in the Input stage the slice gets its own input');
  assert.deepEqual(nudgeSlice(s, 'input', -10, 0, p).input.x, 0, 'never out of the canvas');
  const cp = setOutputMode(s, 'corners');
  assert.deepEqual(nudgeSlice(cp, 'output', 1, 1, p).output.corners[0], [5, 145], 'a corner pin moves as a whole');
  assert.deepEqual(placeSlice(s, 'fit', sc, p).output.rect, { x: 0, y: 284, w: 3840, h: 1832 }, 'fit to screen');
  assert.deepEqual(placeSlice({ ...s, output: { mode: 'rect', rect: { x: 0, y: 0, w: 100, h: 100 } } }, '1:1', sc, p).output.rect, { x: -906, y: -406, w: 1912, h: 912 }, '1:1 keeps the centre');
  assert.deepEqual(outputBounds(placeSlice(cp, 'center', sc, p).output), { x: 964, y: 744, w: 1912, h: 912 }, 'center');
  assert.equal(placeSlice({ ...s, input: { x: 1, y: 1, w: 5, h: 5 } }, 'match', sc, p).input, null, 'match input to wall');
  assert.deepEqual(snapRect({ x: 1925, y: 5, w: 100, h: 100 }, sc, [], 8), { x: 1920, y: 0, w: 100, h: 100 }, 'snaps to the half');
  assert.deepEqual(snapRect({ x: 3735, y: 600, w: 100, h: 100 }, sc, [], 8), { x: 3740, y: 600, w: 100, h: 100 }, 'the right edge snaps to the screen edge');
  assert.deepEqual(snapRect({ x: 500, y: 300, w: 10, h: 10 }, sc, [{ x: 0, y: 0, w: 497, h: 50 }], 8).x, 497, 'to a neighbour\'s edge');
  assert.deepEqual(snapRect({ x: 500, y: 300, w: 10, h: 10 }, sc, [], 8), { x: 500, y: 300, w: 10, h: 10 }, 'nothing near: unchanged');
});

// ------------------------------------------------------------------------------------------------ displays + engine

// Fails if a screen is ever opened "blindly" on another display, or if the id / geometry / resolution search breaks.
test('screens: which display is which — by id, then by geometry, the only one of its resolution when none was chosen; never another', () => {
  const sc = { width: 3840, height: 2400, display: null };
  assert.equal(matchDisplay(sc, [LAPTOP, FX4_DISPLAY]), FX4_DISPLAY, 'no display chosen: the only one at 3840×2400');
  assert.equal(matchDisplay(sc, [LAPTOP]), null, 'not there: nothing');
  assert.equal(matchDisplay(sc, [FX4_DISPLAY, { ...FX4_DISPLAY, id: 78 }]), null, 'two of that resolution: not guessed');
  const chosen = { ...sc, display: { id: 77, x: 1920, y: 0, width: 3840, height: 2400 } };
  assert.equal(matchDisplay(chosen, [{ ...FX4_DISPLAY, id: 999 }])?.id, 999, 'a new id after a restart: found by its geometry');
  assert.equal(matchDisplay(chosen, [{ ...FX4_DISPLAY, id: 999, bounds: { ...FX4_DISPLAY.bounds, x: -3840 } }]), null, 'elsewhere with another id: not it');
  assert.equal(matchDisplay({ ...chosen, display: { ...chosen.display, x: null } }, [LAPTOP, { ...FX4_DISPLAY, id: 5 }]), null, 'chosen by id only and gone: not connected');
  const L = screensLayout({ sink: 'screens', scale: 1, screens: [{ id: 'A', name: 'Left', enabled: true, width: 1920, height: 1200, display: null }, { id: 'B', name: 'Right', enabled: true, width: 1920, height: 1200, display: { id: 9 } }] },
    [{ ...LAPTOP, id: 8, primary: false, bounds: { x: 0, y: 0, width: 1920, height: 1200 } }, { ...LAPTOP, id: 9, primary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1200 } }]);
  assert.equal(L.list[0].displayId, null, 'two displays of its resolution: the screen with no choice is not guessed');
  assert.deepEqual(L.window, { bounds: { x: 1920, y: 0, width: 1920, height: 1200 }, displays: [9] });
});

/** A test engine on a temp folder with the bundled simulated XR Lab (its Fx4 screen), output on, going to `sink`. */
function engineWith({ sink = 'screens', displays = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-scr-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const sim = store.listProfiles().find((q) => q.id.endsWith('-sim')).id, prof = store.loadProfile(sim);
  prof.experience = normalizeProfile({}).experience;
  prof.output = { ...prof.output, on: true, sink, scale: 1 };
  store.saveProfile(prof);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  const msgs = [];
  engine.on('outputWindow', (m) => msgs.push(m));
  engine.setDisplays(displays);
  return { dir, engine, msgs, store };
}

// Fails if a missing screen opens a window anyway (on another display) or does not reach Problems.
test('screens: a screen that is not connected opens no window and is a Problem; plugged in, the window covers its display', async () => {
  const { engine, msgs, dir } = engineWith({ sink: 'screens', displays: [LAPTOP] });
  engine.start();
  try {
    assert.equal(engine.outputWindow(), null, 'no Fx4: no window');
    const S = engine.outputState().screens;
    assert.deepEqual(S.problems, [['bad', 'Screen "Fx4" (3840×2400) is not connected']]);
    assert.equal(S.list[0].connected, false);
    engine.setDisplays([LAPTOP, FX4_DISPLAY]); // the Fx4 is plugged in (display-added)
    const w = msgs.at(-1);
    assert.deepEqual([w.sink, w.url, w.screens], ['screens', '/output?run=1&screens=window', { bounds: FX4_DISPLAY.bounds, displays: [77] }]);
    assert.deepEqual(engine.outputState().screens.problems, []);
    engine.setDisplays([LAPTOP]); // unplugged
    assert.equal(msgs.at(-1), null, 'unplugged: the window closes');
    // Spout / single window are as they were (no screens fields in their message)
    await engine.command('output.set', { sink: 'spout' });
    assert.equal('screens' in msgs.at(-1), false);
    assert.deepEqual(engine.outputState().screens.problems, [], 'not going to the screens: no problem about them');
    await assert.rejects(engine.command('output.set', { sink: 'ndi' }), /spout, window or screens/);
    // output.screens: a template, then a list; refused in Show mode
    await engine.command('output.screens', { template: 'fx4', fit: true });
    assert.equal(engine.profile.output.screens[0].slices[2].output.rect.w, 1920);
    await engine.command('output.screens', { screens: [] });
    assert.deepEqual(engine.profile.output.screens, []);
    await assert.rejects(engine.command('output.screens', { template: 'nope' }), /template: one of/);
    await engine.command('app.lock', { locked: true });
    await assert.rejects(engine.command('output.screens', { template: 'fx4' }), /locked/);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// Fails if the test card is saved in the profile (it is a check of the cable, not a setting of the room).
test('screens: the test card is state, never the profile', async () => {
  const { engine, dir, store } = engineWith();
  engine.start();
  try {
    const before = JSON.stringify(store.loadProfile(engine.profile.id)), rev = engine.rev;
    assert.equal(engine.outputState().testCard, false);
    await engine.command('output.testCard', { on: true });
    assert.equal(engine.outputState().testCard, true);
    assert.equal(engine.rev, rev, 'no profile revision');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(JSON.stringify(store.loadProfile(engine.profile.id)), before, 'the file on disk is unchanged');
    await engine.command('output.testCard', { on: false });
    assert.equal(engine.outputState().testCard, false);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------------------------------------ Electron

/** `script` in a page of a test engine (the simulated XR Lab); {result, errors, engine}. */
async function inPage(script, { setup, page = '/output?run=1&screens=preview', w = 1440, h = 900, outputWindow = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-scr-ui-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, script);
  try {
    if (setup) await setup(engine);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}${page}`, `--script=${file}`, `--w=${w}`, `--h=${h}`];
    if (page.startsWith('/output')) args.push('--wait=load');
    if (outputWindow) args.push('--output-window'); // the output window's preferences, off screen: real frames, any size, 1:1
    const outText = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the UI runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, engine };
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The room output on at scale 1, no experience, no wandering hands, going to the screens (the seed's Fx4). */
async function screensOn(engine, extra = {}) {
  const p = structuredClone(engine.profile);
  p.simulation.wanderers = 0;
  p.experience = normalizeProfile({}).experience;
  p.output = { ...p.output, on: true, sink: 'screens', scale: 1, ...extra };
  await engine.command('profile.update', { profile: p, rev: engine.rev });
}

// In the page: a colour painted into the mixer's image (the FBO = the canvas at scale 1) where the test says, then the
// slices presented and the whole 3840×2400 canvas read back. Reports the bounding box of that colour and where it fell.
const PAINT = `
  for (let k = 0; k < 150 && !(window.__out?.mixer() && __out.screens().on); k++) await new Promise((r) => setTimeout(r, 50));
  const { cmd } = await import('/js/conn.js');
  const m = __out.mixer();
  const tex = m.texture(1, 1);
  m.upload(tex, new Uint8Array([255, 0, 255, 255]), 1, 1);
  const paint = (draws) => { m.compose(draws.map((d) => ({ tex, opacity: 1, blend: 'normal', ...d }))); __out.present(); };
  const scan = () => {
    const v = __out.screens(), [W, H] = v.canvas, px = __out.read(0, 0, W, H);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    return { n, box: n ? [x0, y0, x1, y1] : null, canvas: [W, H], screens: v.screens };
  };
`;

// THE criterion of F9: with the XR Lab profile on the Fx4, a colour at canvas x = 2000 (wall P1) lands in P1's
// quadrant (top-right) and nowhere else. Fails if the slices cross (another quadrant shows it), if the order of the
// walls changes, or if the image is scaled (1:1 is the decision).
test('screens: the output page draws P1 (canvas x = 2000) in the Fx4\'s top-right quadrant, 1:1, and nowhere else', { ...opt, timeout: 120000 }, async () => {
  const { result, errors } = await inPage(`${PAINT}
    const out = {};
    paint([{ dst: [1990, 0, 20, 912] }]);           // a stripe of wall P1, the canvas' whole height
    out.p1 = scan();
    // the room's monitor meanwhile: the canvas itself (not the Fx4's layout), 640 px wide
    const url = __out.previewJpeg();
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
    out.monitor = { size: [img.width, img.height], stripe: px(Math.round(2000 / 7196 * 640), 40), p4: px(100, 40) };
    paint([{ dst: [0, 0, 7196, 912], opacity: 0 }]); // nothing
    out.none = scan();
    return out;`, { setup: (e) => screensOn(e), w: 3840, h: 2400, outputWindow: true });
  assert.deepEqual(errors, []);
  const { p1, none } = result;
  assert.deepEqual(p1.canvas, [3840, 2400], 'the Preview at 1:1 (the runner window is the Fx4\'s size)');
  assert.deepEqual(p1.screens.map((s) => [s.id, s.view, s.sx]), [['SC1', [0, 0, 3840, 2400], 1]]);
  // P1's slice is at (2034, 144) 1692×912 in the Fx4: canvas x 1990..2010 = P1 x 78..98 → screen x 2112..2132
  assert.deepEqual(p1.box, [2112, 144, 2131, 1055], 'exactly where P1\'s slice puts it, unscaled');
  assert.ok(p1.box[0] >= 1920 && p1.box[2] < 3840 && p1.box[3] < 1200, 'inside the top-right quadrant, nowhere else');
  assert.equal(p1.n, 20 * 912, 'every pixel of the stripe, once');
  assert.equal(none.n, 0);
  // Fails if the monitor gets a capture of the window (the screens' layout) instead of the canvas, or upside down
  const { monitor } = result;
  assert.deepEqual(monitor.size, [640, 81], 'the canvas proportions');
  assert.ok(monitor.stripe[0] > 150 && monitor.stripe[1] < 100 && monitor.stripe[2] > 150, `the stripe where it is on the canvas: ${monitor.stripe}`);
  assert.ok(monitor.p4[0] < 40 && monitor.p4[2] < 40, `nothing on P4: ${monitor.p4}`);
});

// Fails if the test card is drawn under the slices, misses the screen's border, or if the calibration grid layer does
// not go through the slices (it would not land on the wall where the content does).
test('screens: the test card is drawn above the slices, on the screen\'s edge; the grid layer goes through the slices', { ...opt, timeout: 120000 }, async () => {
  const { result, errors } = await inPage(`${PAINT}
    const out = {};
    const at = (x, y) => Array.from(__out.read(x, y, 1, 1));
    paint([{ dst: [0, 0, 7196, 912] }]);            // the whole canvas magenta
    out.noCard = { slice: at(2034 + 800, 144 + 400), gap: at(10, 10), edge: at(0, 1000) };
    await cmd('output.testCard', { on: true });
    for (let k = 0; k < 60 && !__out.screens().screens?.[0]?.card; k++) { paint([{ dst: [0, 0, 7196, 912] }]); await new Promise((r) => setTimeout(r, 50)); }
    paint([{ dst: [0, 0, 7196, 912] }]);
    // the border's pixels (x = 0, the last row), the diagonal through P4's slice (it starts at (4, 144))
    out.card = { edge: at(0, 1000), last: at(2000, 2399), diag: at(500, 312), slice: at(2034 + 800, 144 + 400), cards: __out.stats.cards };
    // the grid layer (the calibration pattern) in the mixer: it reaches the screen through P1's slice
    await cmd('output.testCard', { on: false });
    for (let k = 0; k < 60 && __out.screens().screens?.[0]?.card; k++) { paint([]); await new Promise((r) => setTimeout(r, 50)); }
    out.grid = await (async () => {
      await cmd('projection.set', { grid: true }).catch((e) => ({ error: e.message }));
      for (let k = 0; k < 60 && !__out.layers().includes('grid'); k++) await new Promise((r) => setTimeout(r, 50));
      __out.drawGrid(true); __out.compose();
      const s = (() => { const v = __out.screens(), [W, H] = v.canvas, px = __out.read(0, 0, W, H); let lit = 0, outside = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (px[i] > 80) { lit++; const inSlices = (y >= 144 && y < 1056) || (y >= 1344 && y < 2256); if (!inSlices) outside++; } } return { lit, outside }; })();
      return { layers: __out.layers(), ...s };
    })();
    return out;`, { setup: async (e) => { await screensOn(e); }, w: 3840, h: 2400, outputWindow: true });
  assert.deepEqual(errors, []);
  const { noCard, card, grid } = result;
  assert.deepEqual(noCard.slice.slice(0, 3), [255, 0, 255], 'the content in its slice');
  assert.deepEqual(noCard.gap.slice(0, 3), [0, 0, 0], 'black between the slices (the quadrant\'s margin)');
  assert.deepEqual(card.edge.slice(0, 3), [255, 255, 255], 'the 1 px border on the screen\'s left edge');
  assert.deepEqual(card.last.slice(0, 3), [255, 255, 255], 'and on its last row');
  assert.ok(card.diag[1] > 120, `the diagonal is drawn over P4's slice (green > 120: ${card.diag})`);
  assert.deepEqual(card.slice.slice(0, 3), [255, 0, 255], 'transparent where it draws nothing: the content shows');
  assert.ok(card.cards >= 1);
  assert.ok(grid.layers.includes('grid'), `the grid layer is on (${grid.layers})`);
  assert.ok(grid.lit > 200, `the grid shows on the screen (${grid.lit})`);
  assert.equal(grid.outside, 0, 'and only inside the slices: it goes through them');
});

// Fails if the arrows do not reach the selected slice (app.js → outputview), or if their step changes; and if the
// Problems indicator misses a screen that is not connected.
test('screens: in the real UI, Output › Screens shows the Fx4 ▸ 4 slices; arrows move the selected slice 1 px, Shift 10 px; Problems names the missing screen', { ...opt, timeout: 120000 }, async () => {
  const { result, errors, engine } = await inPage(`
    __vt.go('mapping');
    await new Promise((r) => setTimeout(r, 300));
    const deck = document.getElementById('aoDeck');
    const out = { visible: !!deck && getComputedStyle(deck).display !== 'none' };
    out.tree = [...deck.querySelectorAll('.ao-row')].map((b) => b.querySelector('.t').textContent);
    out.dest = [...deck.querySelectorAll('[data-ao="dest"] button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : ''));
    out.problems = document.getElementById('problems').textContent + ' | ' + (document.querySelector('#problems .chip')?.title || '');
    deck.querySelector('[data-slice="SL2"]').click();
    const press = (key, shiftKey = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    const rect = () => __vt && (window.__ao.A.slice()?.output.rect);
    const was = { ...rect() };
    press('ArrowRight');
    for (let k = 0; k < 40 && rect().x === was.x; k++) await new Promise((r) => setTimeout(r, 50));
    press('ArrowDown', true);
    for (let k = 0; k < 40 && rect().y === was.y; k++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    out.was = was; out.now = rect();
    out.inspector = [...deck.querySelectorAll('.ao-nums input')].map((i) => Number(i.value));
    return out;`, { page: '/', setup: (e) => screensOn(e, { on: false }) });
  assert.deepEqual(errors, []);
  assert.equal(result.visible, true);
  assert.deepEqual(result.tree, ['Fx4', 'P4', 'P1', 'P2', 'P3']);
  assert.deepEqual(result.dest, ['Screens*', 'Spout', 'Single window']);
  assert.match(result.problems, /Screen "Fx4" \(3840×2400\) is not connected/);
  assert.deepEqual([result.now.x - result.was.x, result.now.y - result.was.y], [1, 10], 'arrow: 1 px; Shift + arrow: 10 px');
  assert.deepEqual(engine.profile.output.screens[0].slices[1].output.rect, { x: 2035, y: 154, w: 1692, h: 912 }, 'saved in the profile');
  assert.deepEqual(result.inspector, [2035, 154, 1692, 912], 'the inspector shows the new numbers');
});
