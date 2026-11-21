// The room output's GPU mixer (ui/js/mixer, MEDIA-SERVER.md §4.5, phase F5): blends, layer order, the experience copied in
// the task that drew it (not empty, not flipped), calibration mode (the piece is set aside, never restarted), the grid
// uploaded only when it changes, the blackout, the clip-layer registry F6 fills, and the engine clock of the page.
// Pure parts run in Node; the rest in the REAL output page (/output) in Electron, reading the mixer's image with
// readPixels — in the tests only (mixer.readFbo): the product never reads pixels back.
// Two kinds of window (tests/ui/runner.cjs): a hidden one gets no frames (requestAnimationFrame does not run), so its
// script composes by hand (__out.compose / the mixer directly); the experience run uses the runner's off-screen window
// (--shot), which paints frames while hidden like the app's Spout window — a WebGL canvas is then really presented and
// emptied after each frame, which is what makes "the copy happens in the draw's task" testable.
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
import { makeClock } from '../ui/js/clock.js';
import { makeHands } from '../experiences/runtime.js';
import { createRegistry, buildDraws } from '../ui/js/mixer/layers.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const FIXTURES = path.join(root, 'tests', 'fixtures', 'experiences');

/** A test engine (bundled profiles: the simulated XR Lab), `script` run in a page; {result, errors, engine}. */
async function inPage(script, { setup, page = '/output?run=1', offscreen = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-mixer-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, script);
  try {
    if (setup) await setup(engine);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}${page}`, `--script=${file}`, '--wait=load'];
    if (offscreen) args.push(`--shot=${path.join(dir, 'shot.png')}`); // (the runner's off-screen window: it paints frames)
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

/** The touch-probe fixture playing in the room output at scale 0.25 (1799×228), no wandering hands. */
async function withProbe(engine, layers) {
  engine.experienceDirs.push(FIXTURES);
  await engine.command('experience.list');
  const p = structuredClone(engine.profile);
  p.simulation.wanderers = 0;
  p.experience = normalizeProfile({}).experience;
  p.output = normalizeProfile({}).output;
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  await engine.command('output.set', { scale: 0.25 });
  await engine.command('experience.play', { id: 'touch-probe' });
  if (layers) await engine.command('output.layers', { layers });
}

/** The output on, with no experience (the bundled simulated room has Alma liquid chosen: not wanted here). */
async function noExperience(engine) {
  const p = structuredClone(engine.profile);
  p.simulation.wanderers = 0;
  p.experience = normalizeProfile({}).experience;
  p.output = { ...normalizeProfile({}).output, on: true };
  await engine.command('profile.update', { profile: p, rev: engine.rev });
}

// ------------------------------------------------------------------------------------------------ pure (Node)

test('mixer clock: the page follows the engine clock as the hands always did — the quickest message at once, a slow drift up, a new clock taken as it is', () => {
  let now = 1000;
  const c = makeClock(() => now);
  assert.equal(c.engineNow(), null, 'no clock before the first message');
  c.sample(400); // engine 400 at page 1000: offset 600
  assert.equal(c.offset, 600);
  now = 1050; c.sample(455); // 5 ms quicker than the offset says: followed at once (≤ 3 ms per message)
  assert.equal(c.offset, 597);
  now = 1100; c.sample(400); // 103 ms late (a slow message): it creeps up, ≤ 0.5 ms
  assert.equal(c.offset, 597.5);
  assert.equal(c.engineNow(1100), 502.5);
  assert.equal(c.toPage(502.5), 1100);
  now = 99999; c.sample(10); // another engine (restarted): taken as it is
  assert.equal(c.offset, 99989);
  // Fails if clock.js and the runtime's hands drift apart: the same messages give the same offset in both
  const seq = [[1000, 400], [1033, 431], [1070, 470], [1100, 480], [1133, 530], [1166, 520], [1200, 597], [9000, 600]];
  let t = 0;
  const k = makeClock(() => t), hands = makeHands({ size: { width: 100, height: 10 }, closedLoop: false, emit() {} }, { now: () => t });
  for (const [page, eng] of seq) { t = page; k.sample(eng); hands.ingest([], eng); assert.equal(k.offset, hands.offset, `same offset at page ${page}`); }
});

test('mixer layers: the draws follow the layers bottom → top; the experience only once it has a frame, shown opaque; the feedback on top; the media group is pass-through', () => {
  const reg = createRegistry(), T = (n) => ({ n });
  const src = { experience: { tex: T('exp'), ready: true }, touches: { tex: T('touches') }, grid: { tex: T('grid') }, feedback: { tex: T('fb'), on: true } };
  const layers = [{ id: 'grid', opacity: 0.5, blend: 'add' }, { id: 'experience', opacity: 1, blend: 'multiply' }, { id: 'media', opacity: 0.5, blend: 'screen' }, { id: 'touches', opacity: 0.7, blend: 'screen' }];
  assert.deepEqual(buildDraws(layers, src, reg).map((d) => d.id), ['grid', 'experience', 'touches', 'feedback'], 'an empty media group draws nothing');
  const exp = buildDraws(layers, src, reg).find((d) => d.id === 'experience');
  assert.equal(exp.opaque, true, 'the experience was its page on black: shown opaque');
  assert.equal(exp.blend, 'multiply');
  assert.deepEqual(buildDraws(layers, { ...src, experience: { tex: T('exp'), ready: false } }, reg).map((d) => d.id), ['grid', 'touches', 'feedback'], 'no frame yet: not drawn (black, as its page was)');
  assert.deepEqual(buildDraws(layers, { ...src, feedback: { tex: T('fb'), on: false } }, reg).map((d) => d.id).at(-1), 'touches', 'nothing moving: no feedback draw');
  // F6's clip layers: order by `order`, each its own blend or the group's, opacity × the group's
  const media = reg.group('media');
  const top = media.add('L2', { order: 2, blend: 'add', opacity: 0.5 }).show(T('b'));
  media.add('L1', { order: 1 }).show(T('a')).crossfade(T('a2'), 0.25);
  media.add('L3', { order: 3 }).show(null); // nothing to show: not drawn
  const d = buildDraws(layers, src, reg);
  assert.deepEqual(d.map((x) => x.id), ['grid', 'experience', 'media:L1', 'media:L2', 'touches', 'feedback'], 'the group sits where the media layer is');
  const [l1, l2] = d.filter((x) => x.id.startsWith('media:'));
  assert.deepEqual([l1.blend, l1.opacity, l1.mix, l1.texB.n], ['screen', 0.5, 0.25, 'a2'], 'inherits the group blend; group opacity; the crossfade');
  assert.deepEqual([l2.blend, l2.opacity], ['add', 0.25], 'its own blend; opacity × group opacity');
  top.set({ place: { x: 10, y: 20, w: 30, h: 40 } });
  assert.deepEqual(buildDraws(layers, src, reg).find((x) => x.id === 'media:L2').dst, [10, 20, 30, 40], 'a placed clip covers its rect');
  assert.equal(reg.active, true);
  media.remove('L1'); media.remove('L2');
  assert.equal(reg.active, false, 'nothing visible left');
});

// ------------------------------------------------------------------------------------------------ in the output page

/** The CSS compositing of the DOM output (W3C Compositing 1, opaque backdrop), per channel 0..255 — the reference. */
function cssBlend(blend, cb, cs, as, op) {
  const b = cb / 255, s = cs / 255, a = as * op;
  const B = { normal: s, screen: b + s - b * s, multiply: b * s }[blend];
  const v = blend === 'add' ? Math.min(1, b + s * a) : (1 - a) * b + a * B; // add = plus-lighter
  return v * 255;
}

test('mixer: each blend gives the DOM output\'s pixel (±2 levels), opacity and transparency included; the order of the layers changes the result; the clip registry draws, crossfades, places and removes', opt, async () => {
  const { result, errors } = await inPage(`
    const { store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 150 && !(window.__out && window.__out.mixer()); k++) await wait(100);
    const O = window.__out, m = O.mixer(), W = m.width, H = m.height;
    const solid = (r, g, b, a = 1) => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; x.fillRect(0, 0, 4, 4); const t = m.texture(4, 4); m.upload(t, c); return t; };
    const px = (x, y) => [...m.readFbo(Math.round(x), Math.round(y), 1, 1)].slice(0, 3);
    const mid = () => px(W / 2, H / 2);
    const A = solid(128, 64, 200), B = solid(100, 200, 50), C = solid(200, 40, 90, 0.6);
    const out = { size: [W, H], cases: [] };
    // (everything below is synchronous: no frame of the page can come in between a compose and its read)
    for (const blend of ['normal', 'screen', 'add', 'multiply']) for (const [tex, src] of [[B, [100, 200, 50, 1]], [C, [200, 40, 90, 0.6]]]) for (const op of [1, 0.5]) {
      m.compose([{ tex: A, blend: 'normal' }, { tex, blend, opacity: op }]);
      out.cases.push({ blend, src, op, got: mid() });
    }
    m.compose([{ tex: A, blend: 'normal' }, { tex: B, blend: 'normal', opacity: 0.75 }]); out.ab = mid();
    m.compose([{ tex: B, blend: 'normal' }, { tex: A, blend: 'normal', opacity: 0.75 }]); out.ba = mid();
    m.compose([{ tex: A, blend: 'normal' }], { fade: 0.5 }); out.halfBlack = mid();
    // the media group: the engine sends the media layer when a show plays; here it goes in the page's copy of the state
    store.state.profile.output.on = true;
    store.state.output = { ...store.state.output, calibrating: false, layersEffective: [{ id: 'media', on: true, opacity: 1, blend: 'normal' }] };
    O.sync();
    out.layers = O.layers();
    const media = O.registry.group('media');
    let hook = null; const off = media.onFrame((f) => { hook = { t: f.t, hasGl: !!f.gl, same: f.mixer === m }; });
    const L1 = media.add('L1', { order: 1 }).show(B);
    O.compose(); out.clip = mid(); out.hook = hook;
    L1.crossfade(A, 0.5); O.compose(); out.crossfade = mid();
    L1.crossfade(null).set({ place: { x: 0, y: 0, w: Math.round(W / 2), h: H } }); O.compose(); out.left = px(W / 4, H / 2); out.right = px(3 * W / 4, H / 2);
    media.add('L0', { order: 0 }).show(A); L1.set({ place: null, opacity: 0.5 }); O.compose(); out.stacked = mid();
    media.remove('L1'); media.remove('L0'); O.compose(); out.empty = mid();
    off();
    return out;`, { setup: noExperience });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const near = (got, want, tol = 2) => got.every((v, i) => Math.abs(v - want[i]) <= tol);
  const A = [128, 64, 200];
  // Fails if a blend's factors are wrong — e.g. screen made ONE, ONE (add): 64 + 200 clamps, not 64 + 200·(1 − 64/255)
  for (const c of result.cases) {
    const want = A.map((cb, i) => cssBlend(c.blend, cb, c.src[i], c.src[3], c.op));
    assert.ok(near(c.got, want), `${c.blend} of rgba(${c.src}) at ${c.op} on rgb(${A}): ${c.got} vs DOM ${want.map((v) => v.toFixed(1))}`);
  }
  const screen = result.cases.find((c) => c.blend === 'screen' && c.op === 1 && c.src[3] === 1).got, add = result.cases.find((c) => c.blend === 'add' && c.op === 1 && c.src[3] === 1).got;
  assert.notDeepEqual(screen, add, 'screen is not add');
  // Fails if the draws are not done in the order given
  assert.ok(near(result.ab, A.map((a, i) => 0.25 * a + 0.75 * [100, 200, 50][i])) && near(result.ba, A.map((a, i) => 0.75 * a + 0.25 * [100, 200, 50][i])), `bottom → top as given: ${result.ab} / ${result.ba}`);
  assert.ok(!near(result.ab, result.ba, 5), `the order changes the image: ${result.ab} vs ${result.ba}`);
  assert.ok(near(result.halfBlack, A.map((v) => v / 2)), `blackout half way: ${result.halfBlack}`);
  // the clip-layer registry (F6)
  assert.deepEqual(result.layers, ['media']);
  assert.ok(near(result.clip, [100, 200, 50]), `a registered clip layer is drawn: ${result.clip}`);
  assert.ok(result.hook && Number.isFinite(result.hook.t) && result.hook.hasGl && result.hook.same, `onFrame runs before the group draws, with the frame time: ${JSON.stringify(result.hook)}`);
  assert.ok(near(result.crossfade, [114, 132, 125]), `crossfade at 0.5 = the mean of the two clips: ${result.crossfade}`);
  assert.ok(near(result.left, [100, 200, 50]) && near(result.right, [0, 0, 0]), `a placed clip covers only its rect: ${result.left} / ${result.right}`);
  assert.ok(near(result.stacked, [114, 132, 125]), `two clip layers: the upper one at 0.5 over the lower one: ${result.stacked}`);
  assert.ok(near(result.empty, [0, 0, 0]), 'removed: black');
});

test('mixer: the experience reaches the mixer not empty and not flipped, copied in the task that drew it; presented 1:1 top-left in the Spout window; calibration sets it aside without restarting it; the grid is uploaded only when it changes; blackout fades; a lost GPU context comes back', opt, async () => {
  const { result, errors } = await inPage(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(50); return !!f(); };
    await until(() => window.__out && store.state && window.__out.layers().includes('experience'));
    const O = window.__out, ifr = document.querySelector('#stage iframe');
    await until(() => ifr.contentWindow.__probe?.mark && O.stats.expFrames > 30);
    const m = O.mixer(), W = m.width, H = m.height, pr = ifr.contentWindow.__probe;
    const px = (x, y) => [...m.readFbo(Math.round(x), Math.round(y), 1, 1)].slice(0, 3);
    // pixels that have the probe's colour (green = gain / 2, blue = 0.4; red moves with time), along a row of the image
    const probeLike = (y = Math.round(H * 0.6)) => { const d = m.readFbo(0, y, W, 1); let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i + 1] - 127.5) <= 3 && Math.abs(d[i + 2] - 102) <= 3) n++; return n; };
    const out = { size: [W, H], probeSize: [pr.vt.size.width, pr.vt.size.height], mark: pr.mark, boots0: pr.boots, loads0: O.stats.expLoads };
    // (1) the experience in the room's image: the mark at the TOP-left, the probe's colour elsewhere
    out.markPx = px(pr.mark.w / 2, pr.mark.h / 2); out.belowMark = px(pr.mark.w / 2, H - pr.mark.h / 2); out.middle = px(W / 2, H / 2);
    out.rowProbe = probeLike();
    await wait(1200);
    out.timing = O.stats.timing; out.frames = { exp: O.stats.expFrames, calls: O.stats.expCalls, composed: O.stats.composed };
    // (2) the Spout window (its preload exposes vtOut): the canvas is the render size and shows the image 1:1 from the top-left
    window.vtOut = { kind: 'spout-gpu', ok: true }; O.sync();
    const gl = m.gl, cv = new Uint8Array(4), cvb = new Uint8Array(4);
    O.compose(); // (same task: the canvas is read before it is presented)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(Math.round(pr.mark.w / 2), gl.drawingBufferHeight - 1 - Math.round(pr.mark.h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.readPixels(Math.round(pr.mark.w / 2), Math.round(pr.mark.h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, cvb);
    out.pinned = { view: O.view(), canvasTop: [...cv].slice(0, 3), canvasBottom: [...cvb].slice(0, 3), dpr: devicePixelRatio };
    delete window.vtOut; O.sync();
    out.fitted = O.view();
    // (3) the grid: uploaded once, then only when what it shows changes — while the experience composes every frame
    await cmd('output.layers', { layers: [{ id: 'experience' }, { id: 'touches', on: false }, { id: 'grid', on: true, blend: 'screen' }] });
    await until(() => O.layers().includes('grid'));
    await wait(400);
    const g0 = O.stats.grid, c0 = O.stats.composed;
    await wait(1000);
    out.gridIdle = { uploads: O.stats.grid - g0, composed: O.stats.composed - c0, everUploaded: g0 };
    O.drawGrid(true); await wait(300);
    out.gridChanged = O.stats.grid - g0;
    // (4) calibration mode: only touches + grid; the piece keeps running, neither copied nor drawn, and is not restarted
    await cmd('calib.start', { wallId: store.state.profile.walls[0].id, force: true });
    await until(() => O.layers().join() === 'touches,grid');
    await wait(400);
    const f0 = O.stats.expFrames, k0 = O.stats.expCalls;
    await wait(600);
    out.calib = { layers: O.layers(), plan: O.plan().map((l) => l.id), copied: O.stats.expFrames - f0, calls: O.stats.expCalls - k0, rowProbe: probeLike(), sameFrame: document.querySelector('#stage iframe') === ifr, frames: document.querySelectorAll('iframe').length };
    await cmd('calib.cancel');
    await until(() => O.layers().includes('experience') && probeLike() > 0);
    const ifr2 = document.querySelector('#stage iframe');
    await until(() => ifr2?.contentWindow?.__probe);
    out.back = { layers: O.layers(), rowProbe: probeLike(), boots: ifr2?.contentWindow?.__probe?.boots ?? null, sameProbe: ifr2?.contentWindow?.__probe === pr, loads: O.stats.expLoads };
    // (5) blackout (state.media.blackout): half way after ~0.25 s, black after 0.5 s, back after
    await cmd('output.layers', { layers: [{ id: 'experience' }, { id: 'touches', on: false }, { id: 'grid', on: false }] });
    await until(() => O.layers().join() === 'experience');
    await wait(200);
    const lit = px(W / 2, H / 2);
    await cmd('media.blackout', { on: true });
    await wait(250); out.bHalf = px(W / 2, H / 2); out.bHalfFade = [O.fade(), store.state.media?.blackout, store.state.media?.blackoutAt, O.clock.engineNow()];
    await wait(600); out.bDark = px(W / 2, H / 2); const e0 = O.stats.expFrames; await wait(300); out.bCopies = O.stats.expFrames - e0;
    await cmd('media.blackout', { on: false });
    await wait(800); out.bBack = px(W / 2, H / 2); out.bLit = lit;
    // an engine without state.media: never black, no error
    const keep = store.state.media; delete store.state.media; O.sync(); O.compose(); out.noMedia = { fade: O.fade(), px: px(W / 2, H / 2) }; store.state.media = keep;
    // (6) the GPU context is lost and comes back: the textures are made again and the image returns
    const lose = m.gl.getExtension('WEBGL_lose_context');
    if (lose) {
      lose.loseContext(); await wait(200); lose.restoreContext();
      await until(() => !m.lost && probeLike() > 0, 5000);
      out.restored = { lost: O.stats.lost, generation: m.generation, rowProbe: probeLike(), mark: px(pr.mark.w / 2, pr.mark.h / 2) };
    }
    return out;`, { offscreen: true, setup: (e) => withProbe(e, [{ id: 'experience' }, { id: 'touches', on: false }, { id: 'grid', on: false }]) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const near = (got, want, tol = 3) => got.every((v, i) => Math.abs(v - want[i]) <= tol);
  const isProbe = (p) => Math.abs(p[1] - 127.5) <= 3 && Math.abs(p[2] - 102) <= 3;
  assert.deepEqual(result.size, result.probeSize, 'the room\'s image is the experience\'s size (the render size)');
  // Fails if the copy is made outside the task that drew (e.g. in the page's requestAnimationFrame): the presented canvas
  // is empty by then and the image is black — and if the copy or the composition flips rows, the mark is at the bottom
  assert.ok(near(result.markPx, [0, 255, 255]), `the probe's top-left mark is at the top-left of the image: ${result.markPx}`);
  assert.ok(isProbe(result.belowMark) && isProbe(result.middle), `the probe's colour below the mark and in the middle: ${result.belowMark} / ${result.middle}`);
  assert.ok(result.rowProbe > result.size[0] * 0.95, `a whole row of the probe's colour (${result.rowProbe} of ${result.size[0]})`);
  assert.equal(result.timing.driver, 'experience', 'the experience\'s frames drive the output');
  assert.ok(result.timing.fps >= 20, `it composes at the experience's rate (${result.timing.fps} fps)`);
  assert.ok(result.frames.exp > 30 && result.frames.calls >= result.frames.exp, JSON.stringify(result.frames));
  // the Spout window: canvas = render size, 1:1, image top row at the canvas' top (Spout gets it the right way up)
  assert.equal(result.pinned.view.fit, 'pinned');
  assert.deepEqual(result.pinned.view.canvas, result.size, 'the canvas is the render size');
  assert.deepEqual(result.pinned.view.css.map((v) => Math.round(parseFloat(v) * result.pinned.dpr)), result.size, '1:1 device pixels');
  assert.ok(near(result.pinned.canvasTop, [0, 255, 255]) && isProbe(result.pinned.canvasBottom), `presented the right way up: top ${result.pinned.canvasTop}, bottom ${result.pinned.canvasBottom}`);
  assert.equal(result.fitted.fit, 'fit', 'elsewhere: fitted to the window');
  // Fails if the grid is uploaded every frame: it is still while ~60 frames are composed
  assert.ok(result.gridIdle.everUploaded >= 1, 'the grid was uploaded');
  assert.ok(result.gridIdle.composed >= 20, `frames were composed meanwhile (${result.gridIdle.composed})`);
  assert.equal(result.gridIdle.uploads, 0, 'no upload while nothing changes');
  assert.equal(result.gridChanged, 1, 'one upload after a redraw');
  // calibration mode
  assert.deepEqual(result.calib.layers, ['touches', 'grid']);
  assert.deepEqual(result.calib.plan.filter((id) => id !== 'feedback'), ['touches', 'grid'], 'the experience is not in the image (the feedback of the session may be)');
  assert.equal(result.calib.rowProbe, 0, 'none of its pixels show');
  assert.equal(result.calib.copied, 0, 'and it is not even copied');
  // Fails if calibration mode removes or reloads the iframe: the probe counts its starts, the page its loads
  assert.equal(result.back.boots, result.boots0, 'the piece was not restarted (its boot counter did not change)');
  assert.ok(result.calib.calls > 5, `but it keeps running (${result.calib.calls} frames)`);
  assert.equal(result.calib.sameFrame, true); assert.equal(result.calib.frames, 1);
  assert.equal(result.back.loads, result.loads0, 'its page was not loaded again');
  assert.equal(result.back.sameProbe, true);
  assert.ok(result.back.rowProbe > result.size[0] * 0.5, 'and it is back in the image');
  // blackout
  const g = result.bLit[1];
  assert.ok(isProbe(result.bLit), `lit before (${result.bLit})`);
  assert.ok(result.bHalf[1] > 5 && result.bHalf[1] < g - 5, `half way to black after ~0.25 s (${result.bHalf} from ${result.bLit}; ${JSON.stringify(result.bHalfFade)})`);
  assert.ok(near(result.bDark, [0, 0, 0], 1), `black (${result.bDark})`);
  assert.equal(result.bCopies, 0, 'nothing is copied while black');
  assert.ok(isProbe(result.bBack), `back (${result.bBack})`);
  assert.equal(result.noMedia.fade, 0); assert.ok(isProbe(result.noMedia.px), 'no state.media: no blackout');
  assert.ok(result.restored, 'WEBGL_lose_context is there (Chromium)');
  assert.equal(result.restored.lost, 1);
  assert.ok(result.restored.generation >= 1 && result.restored.rowProbe > result.size[0] * 0.5 && near(result.restored.mark, [0, 255, 255]), `after a lost context the image comes back: ${JSON.stringify(result.restored)}`);
  console.log(`  mixer: ${result.timing.fps} fps, CPU ${JSON.stringify(result.timing.cpuMs)} ms, GPU ${JSON.stringify(result.timing.gpuMs)}`);
});
