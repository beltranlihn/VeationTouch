// Operator UI behaviour, checked in the real UI (hidden Electron window, tests/ui/runner.cjs) against a test engine
// with the bundled simulated room. Each test: set up the engine, run a script in the page, assert on what it returns.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: UI tests are skipped */ }

/**
 * Start a test engine (bundled profiles → the simulated XR Lab room), run `script` in the UI, return
 * {result, errors, engine}. `setup(engine)` may change the engine before the page loads.
 */
async function inUi(script, { setup, w = 1440, h = 900, mobile = false, server: serverOpts = {}, wait = 'state', page = '/' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-ui-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet, ...serverOpts });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, script);
  try {
    if (setup) await setup(engine);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}${page}`, `--script=${file}`, `--w=${w}`, `--h=${h}`, `--wait=${wait}`];
    if (mobile) args.push('--mobile');
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
    if (line.startsWith('UI-ERROR')) throw new Error(`UI script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, engine };
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const opt = { skip: !electronPath && 'electron is not installed' };

test('ui: the inspector of every output type opens (TUIO used to throw)', opt, async () => {
  const { result, errors } = await inUi(`
    const { editProfile, store } = await import('/js/conn.js');
    const types = ['osc', 'tuio', 'triggers', 'texture', 'webhook', 'artnet', 'sacn'];
    await editProfile((p) => { p.outputs = types.map((type, k) => ({ id: 'T' + k, type, enabled: type !== 'texture' })); }, 'outputs');
    await new Promise((r) => setTimeout(r, 400));
    const v = window.__vt; v.go('outputs');
    const seen = {};
    for (const [k, type] of types.entries()) {
      v.select('output', 'T' + k);
      const head = [...document.querySelectorAll('#panel .sec h2')].map((x) => x.innerText);
      seen[type] = head.some((t) => t.includes('· T' + k) || t.includes('T' + k));
    }
    seen.tuioToggle = (v.select('output', 'T1'), [...document.querySelectorAll('#panel .row label')].some((l) => l.innerText === 'One port per wall'));
    return seen;`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  for (const [type, ok] of Object.entries(result)) assert.ok(ok, `inspector of ${type}`);
});

test('ui: a device without the access key is told it is not paired (not an endless "Reconnecting…")', opt, async () => {
  const { result } = await inUi(`
    await new Promise((r) => setTimeout(r, 2500));
    const el = document.getElementById('connLost');
    return { shown: !el.hidden, title: document.getElementById('connLostTitle').textContent };`, { server: { trustLocal: false }, wait: 'load' });
  assert.equal(result.shown, true);
  assert.equal(result.title, 'This device is not paired');
});

test('ui: Sensor network says when this computer is not on the sensors\' factory network (and never prints "null")', opt, async () => {
  const fake = { found: [], running: [], network: { reachable: false, via: null, have: '10.0.0.5 (Ethernet)' } };
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('sensors');
    [...document.querySelectorAll('#panel button')].find((b) => /Sensor network/.test(b.innerText)).click();
    await new Promise((r) => setTimeout(r, 600));
    return document.querySelector('#overlay').innerText;`, {
    setup: (engine) => { const orig = engine.command.bind(engine); engine.command = (op, a) => (op === 'sensor.discover' ? Promise.resolve(fake) : orig(op, a)); },
  });
  assert.deepEqual(errors, []);
  assert.match(result, /has no address on 192\.168\.11\.x/);
  assert.match(result, /10\.0\.0\.5 \(Ethernet\)/);
  assert.doesNotMatch(result, /\bnull\b/);
});

test('ui: New room — the strip shows the canvas width it will really get, creates it and leads to Sensors', opt, async () => {
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('system');
    [...document.querySelectorAll('#panel button')].find((b) => b.innerText === '+ New').click();
    const ov = document.getElementById('overlay');
    const inputOf = (label) => {
      const f = [...ov.querySelectorAll('label.field')].find((l) => l.querySelector('span').innerText.startsWith(label));
      if (f) return f.querySelector('input, select');
      return [...ov.querySelectorAll('.row')].find((r) => r.querySelector('label')?.innerText.startsWith(label))?.querySelector('input, select');
    };
    const walls = inputOf('Walls'); walls.value = '3'; walls.dispatchEvent(new Event('change'));
    const cw = inputOf('Canvas width');
    const shown = { value: Number(cw.value), readonly: cw.readOnly };
    const name = inputOf('Room name'); name.value = 'Studio test'; name.dispatchEvent(new Event('change'));
    [...ov.querySelectorAll('button')].find((b) => b.innerText === 'Create room').click();
    await new Promise((r) => setTimeout(r, 800));
    const { store } = await import('/js/conn.js');
    return { shown, view: v.view, canvas: store.state.profile.canvas.width, name: store.state.profile.name, walls: store.state.profile.walls.length };`);
  assert.deepEqual(errors, []);
  assert.equal(result.shown.readonly, true);
  assert.equal(result.shown.value, 3 * Math.round((6 * 912) / 3), 'width = walls × px per wall');
  assert.equal(result.canvas, result.shown.value, 'the room gets the width the wizard showed');
  assert.deepEqual([result.name, result.walls, result.view], ['Studio test', 3, 'sensors']);
});

test('ui: switching rooms asks first (it stops sensors and outputs), and the old room\'s events go', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const sel = document.getElementById('profileSelect');
    const pick = async (id) => { sel.value = id; sel.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 300)); };
    store.events.unshift({ type: 'down', id: 1, wallId: 'P1', x: 1, y: 1, at: Date.now() });
    await pick('xrlab');
    const ov = document.getElementById('overlay');
    const text = ov.innerText;
    [...ov.querySelectorAll('button')].find((b) => b.innerText === 'Cancel').click();
    await new Promise((r) => setTimeout(r, 300));
    const afterCancel = { room: store.state.profile.id, select: sel.value };
    await pick('xrlab');
    [...document.getElementById('overlay').querySelectorAll('button')].find((b) => b.innerText === 'Load room').click();
    await new Promise((r) => setTimeout(r, 900));
    return { text, afterCancel, room: store.state.profile.id, events: store.events.length };`);
  assert.deepEqual(errors, []);
  assert.match(result.text, /stops the 4 sensors and \d+ outputs? of "Barcelona XR Lab \(simulated\)"/);
  assert.deepEqual(result.afterCancel, { room: 'xrlab-sim', select: 'xrlab-sim' });
  assert.equal(result.room, 'xrlab');
  assert.equal(result.events, 0);
});

test('ui: System › Room profiles shows every room name in full', opt, async () => {
  const { result } = await inUi(`
    window.__vt.go('system');
    return [...document.querySelectorAll('#panel .item.stack .t')].map((t) => ({ text: t.firstChild.textContent, clipped: t.scrollWidth > t.clientWidth + 1 }));`, { w: 1180, h: 820 });
  assert.ok(result.length >= 2, JSON.stringify(result));
  for (const r of result) assert.equal(r.clipped, false, `"${r.text}" is clipped`);
});

test('ui: Sensors — one button captures the background of every sensor; the inspector follows the order of use', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt; v.go('sensors'); v.select('sensor', 'S1');
    const titles = [...document.querySelectorAll('#panel .sec h2, #panel details.sec > summary')].map((x) => x.innerText.split(' · ')[0].replace(/^▸/, '').trim());
    const before = Object.values(store.status.sensors).filter((x) => x.background).length;
    [...document.querySelectorAll('#panel button')].find((b) => b.innerText === 'Capture background — all sensors').click();
    [...document.getElementById('overlay').querySelectorAll('button')].find((b) => b.innerText === 'Start now').click();
    for (let k = 0; k < 40 && Object.values(store.status.sensors).filter((x) => x.background).length < 4; k++) await new Promise((r) => setTimeout(r, 250));
    return { titles, before, after: Object.values(store.status.sensors).filter((x) => x.background).length };`);
  assert.deepEqual(errors, []);
  assert.equal(result.before, 0);
  assert.equal(result.after, 4, 'all four simulated sensors captured in one go');
  const order = ['Sensor S1', 'Background', 'Mounting (wall metres)', 'Calibration', 'Driver', 'Details']; // simulated: "Driver" (S2E: "Network & scan")
  assert.deepEqual(result.titles.filter((t) => order.some((o) => t.toUpperCase().startsWith(o.toUpperCase()))).map((t) => t.toUpperCase()), order.map((o) => o.toUpperCase()));
});

test('ui: Health offers the fix — grouped "4 sensors without background" with Capture all', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt; v.go('live');
    await new Promise((r) => setTimeout(r, 900)); // first status
    const text = () => document.querySelector('#panel .health').innerText;
    const before = text();
    [...document.querySelectorAll('#panel .health button')].find((b) => b.innerText === 'Capture all').click();
    [...document.getElementById('overlay').querySelectorAll('button')].find((b) => b.innerText === 'Start now').click();
    for (let k = 0; k < 40 && Object.values(store.status.sensors).filter((x) => x.background).length < 4; k++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 700)); v.go('live');
    return { before, after: text() };`);
  assert.deepEqual(errors, []);
  assert.match(result.before, /4 sensors without background/);
  assert.doesNotMatch(result.after, /without background/);
});

test('ui: Calibrate — the projection check passes only when a projection page is really connected', opt, async () => {
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('calibrate');
    await new Promise((r) => setTimeout(r, 700));
    const projRow = () => [...document.querySelectorAll('#panel .check')].find((c) => /[Pp]rojection/.test(c.innerText));
    const before = { done: projRow().classList.contains('done'), text: projRow().innerText };
    const page = new WebSocket('ws://' + location.host + '/ws/ui?role=projection');
    await new Promise((r) => setTimeout(r, 1300)); v.go('calibrate');
    const after = { done: projRow().classList.contains('done'), text: projRow().innerText };
    page.close();
    return { before, after };`);
  assert.deepEqual(errors, []);
  assert.equal(result.before.done, false, result.before.text);
  assert.equal(result.after.done, true, result.after.text);
});

test('ui: the tool bar never covers the view buttons (Undo stayed hidden in Zones)', opt, async () => {
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('zones'); v.ws.setFocus('P2'); v.select('zone', 'Z1');
    await new Promise((r) => setTimeout(r, 300));
    const bar = document.getElementById('wsBar').getBoundingClientRect();
    const undo = document.getElementById('undoBtn').getBoundingClientRect();
    const items = [...document.getElementById('wsBar').children].map((c) => c.getBoundingClientRect());
    const overlap = items.some((b) => b.right > undo.left && b.left < undo.right && b.bottom > undo.top && b.top < undo.bottom);
    return { overlap, content: !document.getElementById('contentBtn').hidden, barRight: bar.right, undoLeft: undo.left };`, {
    // a content image adds the "Content" view button: the case where the bar used to run under Undo
    setup: (engine) => { engine.store.saveUnderlay(engine.profile.id, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')); engine.emit('state'); },
  });
  assert.deepEqual(errors, []);
  assert.equal(result.content, true, 'the Content button is shown');
  assert.equal(result.overlap, false, JSON.stringify(result));
});

test('ui: Calibrate — Cancel asks before throwing the captured targets away; heights carry their unit', opt, async () => {
  const { result, errors } = await inUi(`
    const { cmd, store } = await import('/js/conn.js');
    const v = window.__vt; v.go('calibrate');
    const labels = [...document.querySelectorAll('#panel label.field span')].map((s) => s.innerText);
    await cmd('calib.start', { wallId: 'P1', force: true });
    await new Promise((r) => setTimeout(r, 900)); v.go('calibrate');
    const buttons = [...document.querySelectorAll('#panel button')].map((b) => b.innerText);
    [...document.querySelectorAll('#panel button')].find((b) => b.innerText === 'Cancel calibration…').click();
    const asked = !document.getElementById('overlay').hidden;
    [...document.getElementById('overlay').querySelectorAll('button')].find((b) => b.innerText === 'Cancel').click(); // keep going
    await new Promise((r) => setTimeout(r, 300));
    const stillRunning = !!store.status.calib;
    await cmd('calib.cancel');
    return { labels, buttons, asked, stillRunning };`);
  assert.deepEqual(errors, []);
  assert.ok(result.labels.includes('Lowest target (m)') && result.labels.includes('Highest target (m)'), result.labels.join(', '));
  assert.ok(!result.buttons.includes('Cancel'), 'no bare Cancel next to Skip target');
  assert.equal(result.asked, true);
  assert.equal(result.stillRunning, true, 'answering no keeps the session');
});

test('ui: Show mode keeps the view controls and the virtual hand; the projection pattern is called Pattern everywhere', opt, async () => {
  const { result, errors } = await inUi(`
    const { cmd } = await import('/js/conn.js');
    await cmd('app.lock', { locked: true });
    await new Promise((r) => setTimeout(r, 400));
    const v = window.__vt; v.go('live');
    const usable = (label) => { const b = [...document.querySelectorAll('#wsBar button')].find((x) => x.innerText.trim() === label); return b ? getComputedStyle(b).pointerEvents !== 'none' : null; };
    const r = { hand: usable('Virtual hand'), view: usable('View'), d3: usable('3D') };
    await cmd('app.lock', { locked: false });
    r.top = [...document.querySelectorAll('#projSeg button')].map((b) => b.innerText);
    v.go('mapping'); v.select('wall', 'P2');
    r.mapping = [...document.querySelectorAll('#wsBar button, #panel button')].map((b) => b.innerText).filter((t) => /pattern|identify/i.test(t));
    return r;`);
  assert.deepEqual(errors, []);
  assert.deepEqual([result.hand, result.view, result.d3], [true, true, true], JSON.stringify(result));
  assert.deepEqual(result.top, ['Off', 'Pattern', 'Debug']);
  assert.ok(result.mapping.length && result.mapping.every((t) => /^Pattern/.test(t) || t === 'Hide pattern'), result.mapping.join(', '));
});

/** No simulated wandering hands: the test's own virtual hand is the only touch. */
const still = async (engine) => {
  const p = structuredClone(engine.profile); p.simulation.wanderers = 0;
  p.outputs.push({ id: 'TX', type: 'texture', name: 'Touch texture', enabled: false, radius: 0.08, softness: 0, trailMs: 0 });
  await engine.command('profile.update', { profile: p, rev: engine.rev });
};

test('ui: Outputs › Texture shows the live mask; a blob fader previews while dragged and saves once on release', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd, history } = await import('/js/conn.js');
    const v = window.__vt; v.go('outputs'); v.select('output', 'TX');
    for (let k = 0; k < 12; k++) { await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: true }); await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 300));
    v.ws.draw(); // a hidden window paints no frames
    const pv = v.ws._tex, P = store.state.profile, w = P.walls.find((x) => x.id === 'P2');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const [cx, cy] = wallUvToCanvas(w, 2 / w.width, 1 - 1.5 / w.height);
    const sx = pv.w / P.canvas.width;
    const at = (x, y) => pv.g.getImageData(Math.round(x * sx), Math.round(y * sx), 1, 1).data[0];
    const lit = () => { const d = pv.g.getImageData(0, 0, pv.w, pv.h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 0) n++; return n; };
    const r = { space: v.ws.space, centre: at(cx, cy), far: at(cx + 600, cy), small: lit() };
    // drag the Radius fader to 60 % of its groove (0.01 … 0.5 m → 0.3 m), hold, then release
    const f = document.querySelector('#panel .vfield[aria-label="Radius"]'), tr = f.querySelector('.vtrack').getBoundingClientRect();
    const pt = (k) => ({ clientX: tr.left + tr.width * k, clientY: tr.top + 1, button: 0, pointerId: 1, bubbles: true });
    f.dispatchEvent(new PointerEvent('pointerdown', pt(0.1)));
    dispatchEvent(new PointerEvent('pointermove', pt(0.592)));
    await new Promise((r) => setTimeout(r, 400));
    v.ws.draw();
    r.big = lit(); r.savedWhileDragging = store.state.profile.outputs.find((o) => o.id === 'TX').radius; r.undoWhileDragging = history.undoLabel();
    dispatchEvent(new PointerEvent('pointerup', pt(0.592)));
    await new Promise((r) => setTimeout(r, 400));
    r.shown = document.querySelector('#panel .vfield[aria-label="Radius"]').closest('.row').querySelector('.vbox').textContent;
    r.saved = store.state.profile.outputs.find((o) => o.id === 'TX').radius; r.undo = history.undoLabel();
    return r;`, { setup: still });
  assert.deepEqual(errors, []);
  assert.equal(result.space, 'canvas', 'the stage shows the output canvas');
  assert.ok(result.centre > 200, `white under the touch (${result.centre})`);
  assert.equal(result.far, 0, 'black elsewhere');
  assert.ok(result.big > result.small * 4, `the disc grows while the slider moves (${result.small} → ${result.big} px)`);
  assert.equal(result.savedWhileDragging, 0.08, 'nothing saved while dragging');
  assert.notEqual(result.undoWhileDragging, 'blob radius');
  assert.equal(result.saved, 0.3);
  assert.equal(result.undo, 'blob radius', 'one undo step on release');
  assert.equal(result.shown, '30cm', 'the value box reads the new radius');
});

test('ui: a phone opens the calibration remote, not the full app; ?ui=full gives it the full app', opt, async () => {
  const phone = await inUi(`
    return { remote: !!window.__vt.remote, app: !!document.getElementById('app'), nav: !!document.getElementById('nav'),
      steps: [...document.querySelectorAll('.r-steps button')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim()),
      walls: [...document.querySelectorAll('.r-walls button')].map((b) => b.firstChild.textContent),
      foot: document.querySelector('.r-foot').innerText };`, { mobile: true, w: 390, h: 844 });
  assert.deepEqual(phone.errors, []);
  assert.equal(phone.result.remote, true);
  assert.equal(phone.result.app, false, 'no full app on the phone');
  assert.deepEqual(phone.result.steps, ['1 Prepare', '2 Calibrate', '3 Fit', '4 Verify', '5 Test']);
  assert.deepEqual(phone.result.walls, ['P4', 'P1', 'P2', 'P3']);
  assert.match(phone.result.foot, /Full app/);
  const full = await inUi(`return { remote: !!window.__vt.remote, nav: !!document.getElementById('nav') };`, { mobile: true, w: 390, h: 844, page: '/?ui=full' });
  assert.deepEqual(full.errors, []);
  assert.deepEqual(full.result, { remote: false, nav: true });
  const desk = await inUi(`return { remote: !!window.__vt.remote, nav: !!document.getElementById('nav') };`);
  assert.deepEqual(desk.result, { remote: false, nav: true }, 'the computer keeps the full app');
});

test('ui: remote Fit — make the mesh, the point follows the hand, Match puts the hand on the point, the arrows move it', opt, async () => {
  const { result, errors, engine } = await inUi(`
    const { store, cmd, history } = await import('/js/conn.js');
    const { gridMap } = await import('/shared/geometry.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt; rc.setWall('P2'); rc.setStep('fit');
    const make = [...document.querySelectorAll('#rBody button')].find((b) => /^Make a/.test(b.innerText));
    const label = make.innerText; make.click();
    await wait(500);
    const m0 = store.state.profile.walls.find((w) => w.id === 'P2').mapping;
    const W = store.state.profile.walls.find((w) => w.id === 'P2');
    // the hand on point 9 (column 2, row 1 of 6 × 4), read 6 cm right and 3 cm low by the sensor
    const k = 1 * 6 + 2, u0 = m0.us[2], v0 = m0.vs[1];
    const x = u0 * W.width + 0.06, y = (1 - v0) * W.height - 0.03;
    for (let n = 0; n < 20; n++) { await cmd('sim.touch', { wallId: 'P2', x, y, id: 'fit', down: true }); await wait(40); }
    await wait(300);
    const r = { label, mode: m0.mode, n: [m0.us.length, m0.vs.length], node: rc.node, status: document.querySelector('.r-fit-status').innerText,
      matchOn: !document.querySelector('#rBody .btn.primary.big').disabled, fit: store.state.projection.fit };
    const hand = [rc.samples.reduce((s, q) => s + q.x, 0) / rc.samples.length, rc.samples.reduce((s, q) => s + q.y, 0) / rc.samples.length];
    const before = m0.points[k].slice();
    rc.matchNode();
    await wait(500);
    const m1 = store.state.profile.walls.find((w) => w.id === 'P2').mapping;
    const lands = gridMap(m1, hand[0] / W.width, 1 - hand[1] / W.height);
    r.err = Math.hypot(lands[0] - before[0], lands[1] - before[1]);
    r.moved = Math.hypot(m1.points[k][0] - before[0], m1.points[k][1] - before[1]);
    r.undo = history.undoLabel();
    document.querySelector('.dpad button[aria-label="Move the point up"]').click();
    await wait(400);
    const m2 = store.state.profile.walls.find((w) => w.id === 'P2').mapping;
    r.up = Math.round((m1.points[k][1] - m2.points[k][1]) * 10) / 10;
    await cmd('sim.touch', { wallId: 'P2', x, y, id: 'fit', down: false });
    return r;`, { mobile: true, w: 390, h: 844, setup: still });
  assert.deepEqual(errors, []);
  assert.equal(result.mode, 'grid');
  assert.deepEqual(result.n, [6, 4], result.label);
  assert.equal(result.node, 8, 'the point under the hand is chosen');
  assert.match(result.status, /on point 9/);
  assert.equal(result.matchOn, true);
  assert.deepEqual(result.fit, { wallId: 'P2', node: 8 }, 'the projection highlights it');
  assert.ok(result.moved > 3, `the point moved (${result.moved} px)`);
  assert.ok(result.err < 1.5, `the hand now maps onto the point's old pixel (${result.err} px off)`);
  assert.equal(result.undo, 'fit point 9');
  assert.equal(result.up, 5, 'the arrow moved it 5 px up');
});

test('ui: the projection draws the point being fitted (whatever its mode)', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    for (let k = 0; k < 50 && !store.state; k++) await new Promise((r) => setTimeout(r, 100));
    const P = store.state.profile, m = P.walls.find((w) => w.id === 'P2').mapping;
    const c = document.getElementById('c'), g = c.getContext('2d');
    const sx = c.width / P.canvas.width, sy = c.height / P.canvas.height;
    const R = (P.walls.find((w) => w.id === 'P2').pixelRect.h / 3.5) * 0.11;
    const ringTop = (k) => { const [x, y] = m.points[k]; return [...g.getImageData(Math.round(x * sx), Math.round((y - R) * sy), 1, 1).data]; };
    window.__proj.draw(); // a hidden window paints no frames
    const before = ringTop(8);
    await cmd('projection.set', { fit: { wallId: 'P2', node: 8 } });
    await new Promise((r) => setTimeout(r, 500));
    window.__proj.draw();
    return { mode: store.state.projection.mode, before, on: ringTop(8), other: ringTop(9) };`, {
    page: '/projection', wait: 'load',
    setup: async (engine) => {
      const { gridFrom, wallUvToCanvas } = await import('../engine/core/geometry.js');
      const p = structuredClone(engine.profile);
      const w = p.walls.find((x) => x.id === 'P2');
      w.mapping = { mode: 'grid', ...gridFrom((u, v) => wallUvToCanvas(w, u, v), 6, 4) };
      await engine.command('profile.update', { profile: p, rev: engine.rev });
    },
  });
  assert.deepEqual(errors, []);
  assert.equal(result.mode, 'off');
  assert.ok(result.before[2] < 60, `nothing there before (${result.before})`);
  assert.ok(result.on.every((c) => c > 180), `a white ring around the chosen point (${result.on})`);
  assert.ok(result.other[2] < 120, `not around the others (${result.other})`);
});

test('ui: no knob-and-dot sliders anywhere — values use the VEATION fader (groove + fill + value box)', opt, async () => {
  const { result, errors } = await inUi(`
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ranges = {};
    const look = (name) => { ranges[name] = document.querySelectorAll('input[type=range]').length; };
    for (const [view, kind, id] of [['live'], ['room', 'wall', 'P2'], ['mapping', 'wall', 'P2'], ['sensors', 'sensor', 'S2'], ['calibrate'], ['zones', 'zone', 'Z1'], ['outputs', 'output', 'TX'], ['system']]) {
      v.go(view); if (kind) v.select(kind, id); await wait(150); look(view);
    }
    const faders = [...document.querySelectorAll('#panel .vfield[role=slider]')].map((f) => f.getAttribute('aria-label'));
    v.go('outputs'); v.select('output', 'TX'); await wait(150);
    // the value box is a field: tap, type, Enter
    const box = [...document.querySelectorAll('#panel .row.fader')].find((r) => r.querySelector('label').innerText === 'Trail').querySelector('.vbox');
    box.click();
    const inp = box.querySelector('input'); inp.value = '450'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(400);
    const { store } = await import('/js/conn.js');
    return { ranges, faders: [...document.querySelectorAll('#panel .vfield[role=slider]')].map((f) => f.getAttribute('aria-label')), trail: store.state.profile.outputs.find((o) => o.id === 'TX').trailMs };`, { setup: still });
  assert.deepEqual(errors, []);
  assert.ok(Object.values(result.ranges).every((n) => n === 0), JSON.stringify(result.ranges));
  assert.deepEqual(result.faders, ['Radius', 'Soft edge', 'Trail']);
  assert.equal(result.trail, 450, 'typed in the value box');
});

test('ui: Texture — Send to Spout, NDI or Full screen; full screen offers the page when there is no desktop app', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    v.go('outputs'); v.select('output', 'TX');
    const pick = async (t) => { [...document.querySelectorAll('#panel .seg button')].find((b) => b.innerText === t).click(); await wait(300); };
    const r = { start: store.state.profile.outputs.find((o) => o.id === 'TX').sink, options: [...[...document.querySelectorAll('#panel .row')].find((x) => x.innerText.startsWith('Send to')).querySelectorAll('button')].map((b) => b.innerText) };
    await pick('NDI');
    r.ndi = store.state.profile.outputs.find((o) => o.id === 'TX').sink; r.ndiText = document.getElementById('panel').innerText.includes('NDI® is a registered trademark of Vizrt NDI AB');
    await pick('Full screen');
    const o = store.state.profile.outputs.find((x) => x.id === 'TX');
    r.window = o.sink; r.page = document.querySelector('#panel a[href^="/texture"]')?.getAttribute('href');
    await pick('Stretch'); r.fit = store.state.profile.outputs.find((x) => x.id === 'TX').fit;
    r.summary = [...document.querySelectorAll('#panel .item')].find((i) => i.innerText.includes('Touch texture')).innerText;
    return r;`, { setup: still });
  assert.deepEqual(errors, []);
  assert.equal(result.start, 'spout');
  assert.deepEqual(result.options, ['Spout', 'NDI', 'Full screen']);
  assert.equal(result.ndi, 'ndi');
  assert.equal(result.ndiText, true, 'the NDI trademark notice is shown with it');
  assert.equal(result.window, 'window');
  assert.equal(result.page, '/texture?o=TX');
  assert.equal(result.fit, 'stretch');
  assert.match(result.summary, /full screen/);
});

test('ui: the full-screen texture page draws the touch white on black, in the canvas proportions (Fit) or filling the screen (Stretch)', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd, editProfile } = await import('/js/conn.js');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 50 && !store.state; k++) await wait(100);
    for (let k = 0; k < 15; k++) { await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: true }); await wait(40); }
    await wait(300);
    const c = document.getElementById('c'), g = c.getContext('2d'), P = store.state.profile, w = P.walls.find((x) => x.id === 'P2');
    const [px, py] = wallUvToCanvas(w, 2 / w.width, 1 - 1.5 / w.height);
    const grey = (x, y) => g.getImageData(Math.round(x), Math.round(y), 1, 1).data[0];
    const k = Math.min(c.width / P.canvas.width, c.height / P.canvas.height), oy = (c.height - P.canvas.height * k) / 2;
    const r = { fitTouch: grey(px * k, oy + py * k), fitBar: grey(c.width / 2, 5) };
    await editProfile((p) => { p.outputs.find((o) => o.id === 'TX').fit = 'stretch'; }, 'stretch');
    for (let k = 0; k < 10; k++) { await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: true }); await wait(40); }
    await wait(300);
    r.stretchTouch = grey(px * c.width / P.canvas.width, py * c.height / P.canvas.height);
    await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: false });
    return r;`, {
    page: '/texture?o=TX', wait: 'load',
    setup: async (engine) => {
      await still(engine);
      const p = structuredClone(engine.profile);
      Object.assign(p.outputs.find((o) => o.id === 'TX'), { sink: 'window', enabled: true, radius: 0.25 });
      await engine.command('profile.update', { profile: p, rev: engine.rev });
    },
  });
  assert.deepEqual(errors, []);
  assert.ok(result.fitTouch > 200, `white under the touch (${result.fitTouch})`);
  assert.equal(result.fitBar, 0, 'black bars around the canvas proportions');
  assert.ok(result.stretchTouch > 200, `stretched: still under the touch (${result.stretchTouch})`);
});

test('ui: Sensor network — sets up the computer’s card with one button, then puts a new unit on its wall with its address', opt, async () => {
  const calls = [];
  const fakeNoNet = { found: [], running: [], suggest: {},
    network: { reachable: false, via: null, have: '172.16.2.42 (Wi-Fi)', unconfigured: [{ name: 'Ethernet 2', ip: '169.254.7.9' }], serverIp: '192.168.11.5' } };
  const fakeOk = {
    found: [{ host: '192.168.11.2', port: 8089, health: { status: 0, errorCode: 0 }, info: { serial: 'AB12', firmware: '1.03' }, usedBy: null, factoryDefault: true }],
    running: [],
    network: { reachable: true, via: { name: 'Ethernet 2', ip: '192.168.11.5', mask: '255.255.255.0' }, have: '192.168.11.5 (Ethernet 2)', unconfigured: [], serverIp: '192.168.11.5' },
    suggest: { P4: { ip: '192.168.11.11', sensorId: null }, P1: { ip: '192.168.11.12', sensorId: 'S1' }, P2: { ip: '192.168.11.13', sensorId: null }, P3: { ip: '192.168.11.14', sensorId: null } },
  };
  let searches = 0;
  const { result, errors } = await inUi(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const v = window.__vt; v.go('sensors');
    [...document.querySelectorAll('#panel button')].find((b) => /Sensor network/.test(b.innerText)).click();
    await wait(500);
    const ov = document.getElementById('overlay');
    const noNet = ov.innerText;
    [...ov.querySelectorAll('button')].find((b) => /Use it for the sensors/.test(b.innerText)).click();
    await wait(3300); // the card is set up, then it searches again
    const withNet = ov.innerText;
    const put = [...ov.querySelectorAll('button')].find((b) => /^Put on/.test(b.innerText));
    const label = put.innerText;
    put.click();
    await wait(150);
    const busy = ov.innerText;
    await wait(900);
    return { noNet, withNet, label, busy };`, {
    setup: (engine) => {
      const orig = engine.command.bind(engine);
      engine.command = (op, a) => {
        if (op === 'sensor.discover') return Promise.resolve(searches++ === 0 ? fakeNoNet : fakeOk);
        if (op === 'net.setSensorNic') { calls.push([op, a.iface]); return Promise.resolve({ iface: a.iface, ip: '192.168.11.5' }); } // never the real one in a test
        if (op === 'sensor.readdress') { calls.push([op, a.host, a.ip, a.assign]); return new Promise((r) => setTimeout(() => r({ ip: a.ip, serial: 'AB12', sensorId: 'S1', wallId: 'P1' }), 400)); }
        return orig(op, a);
      };
    },
  });
  assert.deepEqual(errors, []);
  assert.match(result.noNet, /no address on 192\.168\.11\.x/);
  assert.match(result.noNet, /“Ethernet 2” is plugged into a network without DHCP/);
  assert.doesNotMatch(result.noNet, /\bnull\b/);
  assert.match(result.withNet, /This computer is on the sensor network: 192\.168\.11\.5 \(Ethernet 2\)/);
  assert.match(result.withNet, /192\.168\.11\.2 \(factory address\)/);
  assert.match(result.withNet, /→ 192\.168\.11\.12/, 'P1 waits for its sensor on .12');
  assert.equal(result.label, 'Put on P1', 'the wall whose sensor is waiting comes first');
  assert.match(result.busy, /Setting 192\.168\.11\.12… the sensor restarts/);
  assert.deepEqual(calls, [['net.setSensorNic', 'Ethernet 2'], ['sensor.readdress', '192.168.11.2', '192.168.11.12', { sensorId: 'S1', wallId: 'P1' }]]);
});

test('ui: Connect device names the Wi-Fi to join, warns about guest Wi-Fi, and tells "reached but not connected" apart', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const V = await import('/js/views.js');
    store.state.lan = [{ iface: 'Wi-Fi', kind: 'wifi', ip: '172.16.2.42', sensors: false, url: 'http://172.16.2.42:8770/?k=x', ssid: 'BCN_XRLab_Guest', guest: true }];
    let st = store.status; // a phone opened the page a moment ago but never connected
    Object.defineProperty(store, 'status', { configurable: true, get: () => st && { ...st, reached: [{ addr: '172.16.2.70', device: 'iPhone', at: Date.now() }] }, set: (x) => { st = x; } });
    V.openConnectModal();
    await new Promise((r) => setTimeout(r, 1300));
    const ov = document.getElementById('overlay');
    return { text: ov.innerText, hotspot: [...ov.querySelectorAll('button')].some((b) => /Open Mobile hotspot settings/.test(b.innerText)) };`);
  assert.deepEqual(errors, []);
  assert.match(result.text, /It must be on the Wi-Fi “BCN_XRLab_Guest”/);
  assert.match(result.text, /“BCN_XRLab_Guest” looks like a guest network/);
  assert.equal(result.hotspot, true, 'the way out is one click away');
  assert.match(result.text, /iPhone \(172\.16\.2\.70\) reached this computer but is not connected/);
});

test('ui: remote guide — one next thing at a time, in order; a failed verification goes to Fit at its worst point', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd, editProfile } = await import('/js/conn.js');
    const { gridNearestNode } = await import('/shared/geometry.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    const guide = () => document.querySelector('.r-guide').innerText.replace(/\\s+/g, ' ').trim();
    const until = async (re) => { for (let k = 0; k < 60 && !re.test(guide()); k++) await wait(100); return guide(); };
    const seen = [];
    seen.push(await until(/projection/));                       // backgrounds are there: the projection is next
    const page = new WebSocket('ws://' + location.host + '/ws/ui?role=projection');
    seen.push(await until(/Calibrate P4/));                     // the first wall, in room order
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    await editProfile((p) => { for (const s of p.sensors) s.calibration = { matrix: I, kind: 'homography', rmsMm: 4, maxMm: 7, points: 9, at: new Date().toISOString() }; }, 't');
    seen.push(await until(/Verify P4/));
    const pass = { at: new Date().toISOString(), meanMm: 6, maxMm: 9, n: 5, pass: true, worst: { x: 1, y: 1 } };
    await editProfile((p) => { for (const w of p.walls) w.verified = w.id === 'P2' ? { ...pass, maxMm: 41, pass: false, worst: { x: 3.6, y: 1.2 } } : pass; }, 't');
    seen.push(await until(/P2 is 41 mm off/));
    [...document.querySelectorAll('.r-guide button')][0].click(); // Fix P2
    await wait(300);
    const atFit = { wall: rc.wall, step: rc.step };
    [...document.querySelectorAll('#rBody button')].find((b) => /^Make a/.test(b.innerText)).click();
    for (let k = 0; k < 30 && rc.node == null; k++) await wait(100);
    const W = store.state.profile.walls.find((w) => w.id === 'P2');
    const expect = gridNearestNode(W.mapping, 3.6 / W.width, 1 - 1.2 / W.height, W.width, W.height);
    const node = rc.node;
    await editProfile((p) => { const w = p.walls.find((x) => x.id === 'P2'); w.verified = { ...pass }; }, 't'); // fixed and verified again
    seen.push(await until(/Walk test/));
    localStorage.setItem('vt-walk:' + store.state.profile.id, new Date().toISOString());
    rc.rerender();
    seen.push(await until(/Lock/));
    [...document.querySelectorAll('.r-guide button')][0].click();
    seen.push(await until(/ready and locked/));
    page.close();
    return { seen, atFit, node, expect };`, {
    mobile: true, w: 390, h: 844,
    setup: async (engine) => {
      const p = structuredClone(engine.profile);
      p.simulation.wanderers = 0;
      for (const s of p.sensors) s.calibration = null;
      for (const w of p.walls) w.verified = null;
      await engine.command('profile.update', { profile: p, rev: engine.rev });
      await new Promise((r) => setTimeout(r, 600));
      await engine.command('bg.capture', { frames: 5 });
      await new Promise((r) => setTimeout(r, 1500));
    },
  });
  assert.deepEqual(errors, []);
  const [proj, cal, ver, fix, walk, lock, done] = result.seen;
  assert.match(proj, /Open the projection on the projector/);
  assert.match(cal, /Calibrate P4/);
  assert.match(ver, /Verify P4/);
  assert.match(fix, /Fix P2/);
  assert.deepEqual(result.atFit, { wall: 'P2', step: 'fit' });
  assert.equal(result.node, result.expect, 'Fit opens on the mesh point nearest to the failed check point');
  assert.match(walk, /Walk test/);
  assert.match(lock, /Lock \(Show\)/);
  assert.match(done, /ready and locked/);
});

test('ui: walk test — the projection shows what the outputs send under every hand; the remote ticks walls and corners', opt, async () => {
  const noWanderers = async (engine) => { const p = structuredClone(engine.profile); p.simulation.wanderers = 0; await engine.command('profile.update', { profile: p, rev: engine.rev }); };
  const proj = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    for (let k = 0; k < 50 && !store.state; k++) await new Promise((r) => setTimeout(r, 100));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const P = store.state.profile, W = P.walls.find((w) => w.id === 'P2');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const c = document.getElementById('c'), g = c.getContext('2d');
    const px = (x, y) => { const [X, Y] = wallUvToCanvas(W, x / W.width, 1 - y / W.height); return g.getImageData(Math.round(X * c.width / P.canvas.width), Math.round(Y * c.height / P.canvas.height), 1, 1).data[0]; };
    await cmd('sim.touch', { wallId: 'P2', x: 3.6, y: 1.2, id: 'h', down: true });
    await wait(700);
    window.__proj.draw();
    const off = px(3.6, 1.2);
    await cmd('projection.set', { walk: true });
    await wait(400);
    for (let k = 0; k < 5; k++) { window.__proj.draw(); await wait(60); }
    return { off, under: px(3.6, 1.2), away: px(1.0, 2.6), walk: store.state.projection.walk };`, {
    page: '/projection', wait: 'load', setup: noWanderers,
  });
  assert.deepEqual(proj.errors, []);
  assert.equal(proj.result.off, 0, 'projection off: black');
  assert.equal(proj.result.walk, true);
  assert.ok(proj.result.under > 200, `white under the hand (${proj.result.under})`);
  assert.equal(proj.result.away, 0, 'black where nobody touches');

  const remote = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    rc.setStep('test');
    await wait(600);
    const walkOn = store.state.projection.walk;
    const list = () => [...document.querySelectorAll('#rBody .check')].map((c) => (c.classList.contains('done') ? '✓ ' : '· ') + c.querySelector('.t').innerText.trim());
    const finish = () => [...document.querySelectorAll('#rBody button')].find((b) => /passes the walk test/.test(b.innerText));
    const fixBtn = () => [...document.querySelectorAll('#rBody button')].find((b) => /^Fix here/.test(b.innerText));
    const before = list();
    await cmd('sim.touch', { wallId: 'P1', x: 3, y: 1.2, id: 'a', down: true });
    await wait(700);
    const fixOne = { disabled: fixBtn().disabled, text: fixBtn().innerText };
    for (const id of ['P4', 'P2', 'P3']) { await cmd('sim.touch', { wallId: id, x: 3, y: 1.2, id: 'b' + id, down: true }); await wait(500); }
    const fixMany = fixBtn().disabled;
    for (const id of ['P1', 'P4', 'P2', 'P3']) await cmd('sim.touch', { wallId: id, x: 0, y: 0, id: id === 'P1' ? 'a' : 'b' + id, down: false });
    await wait(300);
    const walls = list();
    const blockedBeforeCorners = finish().disabled;
    for (const k of ['P1|P4', 'P1|P2', 'P2|P3', 'P3|P4']) rc.walk.corners.add(k); // the engine's corner linker sends the crossings (core tests)
    await wait(300); rc.rerender(); await wait(100);
    return { walkOn, before, fixOne, fixMany, walls, blockedBeforeCorners, ready: !finish().disabled };`, {
    mobile: true, w: 390, h: 844, setup: noWanderers,
  });
  assert.deepEqual(remote.errors, []);
  const r = remote.result;
  assert.equal(r.walkOn, true, 'opening Test turns the projection into the walk-test view');
  assert.deepEqual(r.before, ['· Touched P4', '· Touched P1', '· Touched P2', '· Touched P3', '· Crossed the corner P4 → P1', '· Crossed the corner P1 → P2', '· Crossed the corner P2 → P3', '· Crossed the corner P3 → P4']);
  assert.deepEqual(r.fixOne, { disabled: false, text: 'Fix here (P1)' }, 'one hand alone on a wall: it can be fixed there');
  assert.equal(r.fixMany, true, 'several hands: no Fix here');
  assert.deepEqual(r.walls.slice(0, 4), ['✓ Touched P4', '✓ Touched P1', '✓ Touched P2', '✓ Touched P3']);
  assert.equal(r.blockedBeforeCorners, true, 'every corner must be crossed too');
  assert.equal(r.ready, true);
});
