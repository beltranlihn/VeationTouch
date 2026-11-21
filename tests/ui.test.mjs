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
import { normalizeProfile } from '../engine/profile.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: UI tests are skipped */ }

/**
 * Start a test engine (bundled profiles → the simulated XR Lab room), run `script` in the UI, return
 * {result, errors, engine}. `setup(engine)` may change the engine before the page loads. `preload`: the window gets that
 * preload (as the desktop app's main window does); `files`: real files put in a hidden <input type=file id=__vtFiles>.
 */
async function inUi(script, { setup, w = 1440, h = 900, mobile = false, server: serverOpts = {}, wait = 'state', page = '/', preload = null, files = null, shot = null } = {}) {
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
    if (preload) args.push(`--preload=${preload}`);
    if (files) args.push(`--files=${files.join('|')}`);
    if (shot) args.push(`--shot=${shot}`);
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

test('ui: + Add… opens every destination type at once without a page error (its walls were read before the engine filled them in)', opt, async () => {
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('outputs');
    await new Promise((r) => setTimeout(r, 200));
    const added = [];
    for (let k = 0; k < 7; k++) {
      [...document.querySelectorAll('#panel button')].find((b) => b.innerText === '+ Add…').click();
      const items = [...document.querySelectorAll('.modal .list .item')];
      const item = items[k];
      added.push(item.querySelector('.t').firstChild.textContent);
      item.click();
      await new Promise((r) => setTimeout(r, 30)); // the editor opens on the local copy, before the engine answers
      await new Promise((r) => setTimeout(r, 300));
    }
    const { store } = await import('/js/conn.js');
    return { added, n: store.state.profile.outputs.length };`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.added.length, 7, `added ${result.added.join(', ')}`);
  assert.ok(result.n >= 7);
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

test('ui: Status › Health offers the fix — grouped "4 sensors without background" with Capture all', opt, async () => {
  // (Health was the panel of the old Live tab; it is System & Calibration › Status now)
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt; v.go('status');
    await new Promise((r) => setTimeout(r, 900)); // first status
    const text = () => document.querySelector('#panel .health').innerText;
    const before = text();
    [...document.querySelectorAll('#panel .health button')].find((b) => b.innerText === 'Capture all').click();
    [...document.getElementById('overlay').querySelectorAll('button')].find((b) => b.innerText === 'Start now').click();
    for (let k = 0; k < 40 && Object.values(store.status.sensors).filter((x) => x.background).length < 4; k++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 700)); v.go('status');
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

// ---------------------------------------------------------------------------------------------------- navigation (sections · sub-tabs)

const SETUP_TABS = [['status', 'Status'], ['room', 'Room'], ['sensors', 'Sensors'], ['calibrate', 'Calibrate'], ['zones', 'Zones'], ['system', 'System']];
const OUTPUT_TABS = [['mapping', 'Screens'], ['audio', 'Audio'], ['outputs', 'Protocols']];

test('ui: three sections in the rail; every sub-tab belongs to one of them and every view is a sub-tab; clicking opens it', opt, async () => {
  // fails if a tab is left loose (a data-view button outside a section's group), if a view of the router has no tab or a
  // tab no view, if a section shows another one's tabs, or if a section's name does not fit the rail
  const { result, errors } = await inUi(`
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const sections = [...document.querySelectorAll('#nav button')].map((b) => { const s = b.querySelector('span'); return { id: b.dataset.section, label: b.innerText.replace(/\\s+/g, ' ').trim(), home: b.dataset.home, clipped: s.scrollWidth > s.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1 }; });
    const groups = [...document.querySelectorAll('#subnav .subtabs')].map((g) => ({ section: g.dataset.section, tabs: [...g.querySelectorAll('button[data-view]')].map((b) => [b.dataset.view, b.innerText.trim()]) }));
    const loose = [...document.querySelectorAll('button[data-view]')].filter((b) => !b.closest('#subnav .subtabs[data-section]')).map((b) => b.dataset.view);
    const seen = {};
    for (const s of sections) {
      document.querySelector('#nav button[data-section="' + s.id + '"]').click(); await wait(80);
      seen[s.id] = { view: v.view, section: v.section, bar: !document.getElementById('subnav').hidden, shown: [...document.querySelectorAll('#subnav .subtabs')].filter((g) => !g.hidden).map((g) => g.dataset.section),
        on: [...document.querySelectorAll('#nav button.on')].map((b) => b.dataset.section), current: document.querySelector('#nav [aria-current="page"]')?.dataset.section, app: document.getElementById('app').dataset.section };
    }
    const clicks = [];
    for (const b of document.querySelectorAll('#subnav button[data-view]')) {
      document.querySelector('#nav button[data-section="' + b.closest('.subtabs').dataset.section + '"]').click(); await wait(40);
      b.click(); await wait(80);
      const on = [...document.querySelectorAll('#subnav .subtabs:not([hidden]) button.on')];
      clicks.push([b.dataset.view, v.view, on.length, on[0]?.dataset.view, on[0]?.getAttribute('aria-selected'), document.getElementById('panel').children.length > 0]);
    }
    return { sections, groups, loose, seen, clicks, views: v.nav.views };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.sections.map((s) => [s.id, s.label, s.home]), [['live', 'Live', 'live'], ['output', 'Output', 'mapping'], ['setup', 'System & Calibration', 'status']], 'exactly three sections');
  for (const s of result.sections) assert.equal(s.clipped, false, `"${s.label}" fits the rail`);
  assert.deepEqual(result.groups, [{ section: 'output', tabs: OUTPUT_TABS }, { section: 'setup', tabs: SETUP_TABS }]);
  assert.deepEqual(result.loose, [], 'no tab outside a section');
  for (const g of result.groups) assert.ok(result.sections.some((s) => s.id === g.section), `${g.section} is a section`);
  const tabbed = [...result.groups.flatMap((g) => g.tabs.map(([v]) => v)), 'live'].sort();
  assert.deepEqual([...result.views].sort(), tabbed, 'every view is a sub-tab (or Live) and every sub-tab is a view');
  assert.deepEqual(result.seen.live, { view: 'live', section: 'live', bar: false, shown: [], on: ['live'], current: 'live', app: 'live' }, 'Live: one screen, no sub-tabs');
  assert.deepEqual(result.seen.output, { view: 'mapping', section: 'output', bar: true, shown: ['output'], on: ['output'], current: 'output', app: 'output' }, 'Output opens on Screens');
  assert.deepEqual(result.seen.setup, { view: 'status', section: 'setup', bar: true, shown: ['setup'], on: ['setup'], current: 'setup', app: 'setup' }, 'System & Calibration opens on Status');
  for (const [tab, view, n, on, sel, panel] of result.clicks) assert.deepEqual([view, n, on, sel, panel], [tab, 1, tab, 'true', true], `clicking ${tab}`);
});

test('ui: __vt.go() with every old view id opens its section and sub-tab; keys 1 · 2 · 3 switch section back to its last sub-tab; the place is remembered', opt, async () => {
  // fails if an old id lands in the wrong place, if `experiences` stops opening Live, if `live` still shows the old
  // health panel (now Status), or if a section forgets its last sub-tab
  const { result, errors } = await inUi(`
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const panel = document.getElementById('panel');
    const where = () => ({ view: v.view, section: v.section, rail: document.querySelector('#nav button.on')?.dataset.section ?? null,
      tab: document.querySelector('#subnav .subtabs:not([hidden]) button.on')?.innerText.trim() ?? null, bar: !document.getElementById('subnav').hidden });
    const go = {};
    for (const id of ['live', 'room', 'mapping', 'sensors', 'calibrate', 'zones', 'outputs', 'experiences', 'system', 'status', 'audio']) { v.go(id); await wait(60); go[id] = where(); }
    v.go('live'); await wait(80);
    const live = { health: !!panel.querySelector('.health'), experiences: [...panel.querySelectorAll('.sec h2')].map((x) => x.firstChild.textContent.trim().toLowerCase()).filter((t) => /experiences|sound/.test(t)) };
    v.go('status'); await wait(80);
    const status = { health: !!panel.querySelector('.health'), feed: !!panel.querySelector('#eventFeed') };
    // the keys: the section opens where it was left (Output: Audio was the last of the loop above; Setup: Status)
    v.go('zones'); await wait(50);
    const key = async (k) => { dispatchEvent(new KeyboardEvent('keydown', { key: k })); await wait(80); return v.view; };
    const keys = [await key('2'), await key('3'), await key('1'), await key('4'), await key('9')];
    v.go('outputs'); await wait(50); v.go('room'); await wait(50);
    const back = [await key('2'), await key('3')];
    // a digit typed in a field is text, not a section
    v.go('system'); await wait(80);
    const field = document.getElementById('profileSelect');
    field.focus(); field.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); await wait(60);
    const typed = v.view; field.blur();
    // unknown ids do nothing
    v.go('nowhere'); await wait(40);
    return { go, live, status, keys, back, typed, unknown: v.view, stored: localStorage.getItem('vt-view'), tabs: { output: localStorage.getItem('vt-tab-output'), setup: localStorage.getItem('vt-tab-setup') } };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const S = (view, section, tab) => ({ view, section, rail: section, tab, bar: tab !== null });
  assert.deepEqual(result.go, {
    live: S('live', 'live', null),
    room: S('room', 'setup', 'Room'),
    mapping: S('mapping', 'output', 'Screens'),
    sensors: S('sensors', 'setup', 'Sensors'),
    calibrate: S('calibrate', 'setup', 'Calibrate'),
    zones: S('zones', 'setup', 'Zones'),
    outputs: S('outputs', 'output', 'Protocols'),
    experiences: S('live', 'live', null),
    system: S('system', 'setup', 'System'),
    status: S('status', 'setup', 'Status'),
    audio: S('audio', 'output', 'Audio'),
  });
  assert.deepEqual(result.live, { health: false, experiences: ['experiences', 'sound'] }, 'Live: the experience panel, not the health list');
  assert.deepEqual(result.status, { health: true, feed: true }, 'the old Live panel (health, events) is Status');
  assert.deepEqual(result.keys, ['audio', 'zones', 'live', 'live', 'live'], 'keys 1–3: sections (each on its last sub-tab); 4–9 nothing');
  assert.deepEqual(result.back, ['outputs', 'room']);
  assert.equal(result.typed, 'system', 'a digit in a field is not a shortcut');
  assert.equal(result.unknown, 'system', 'an unknown id is ignored');
  assert.equal(result.stored, 'system', 'the last view, for the next start on this device');
  assert.deepEqual(result.tabs, { output: 'outputs', setup: 'system' }, 'and the last sub-tab of each section');
});

test('ui: Problems (n) in the top bar counts the Health items, opens Status, and is not there with nothing to report', opt, async () => {
  // fails if the count is not the Health list's, if the click does not open Status, or if an empty list leaves a chip
  const { result, errors } = await inUi(`
    const V = await import('/js/views.js');
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(900); // first status: the simulated sensors report (no background, not calibrated)
    v.go('live'); await wait(80);
    const chip = () => document.querySelector('#problems button');
    const out = { text: chip()?.innerText.replace(/\\s+/g, ' ').trim(), dot: chip()?.querySelector('.dot')?.className, title: chip()?.title };
    chip().click(); await wait(100);
    out.view = v.view;
    out.rows = document.querySelectorAll('#panel .health .hrow').length;
    // a later source (the media server's missing files…) adds to the same list
    V.problemSources.push(() => [['bad', 'Clip "Reel" is missing']]);
    v.renderProblems(); await wait(50);
    out.withSource = { text: chip()?.innerText.replace(/\\s+/g, ' ').trim(), dot: chip()?.querySelector('.dot')?.className };
    // nothing to report: nothing in the bar
    V.problemSources.length = 0;
    v.renderProblems(); await wait(50);
    out.empty = { children: document.getElementById('problems').children.length, shown: getComputedStyle(document.getElementById('problems')).display };
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const n = Number(/\((\d+)\)/.exec(result.text)?.[1]);
  assert.match(result.text, /^Problems \(\d+\)$/);
  assert.ok(n >= 2, `the simulated room has things to fix (${result.text} · ${result.title})`);
  assert.equal(result.rows, Math.min(n, 8), 'the same items as the Health list of Status');
  assert.match(result.title, /without background/);
  assert.match(result.dot, /\bwarn\b/, 'warnings: amber');
  assert.equal(result.view, 'status', 'the chip opens Status');
  assert.deepEqual(result.withSource, { text: `Problems (${n + 1})`, dot: 'dot bad' }, 'a source added later counts, and a fault turns it red');
  assert.deepEqual(result.empty, { children: 0, shown: 'none' });
});

test('ui: the desktop window gives the page the disk paths of dropped files (vtDesktop.pathsFor) and nothing else; a browser and the phone have none', opt, async () => {
  // fails if the preload is not registered on the main window, if pathsFor stops using webUtils.getPathForFile (no real
  // path), if the bridge exposes more than that one function, or if the app breaks without it
  const tmp = path.join(os.tmpdir(), `vt-drop-${process.pid}.txt`);
  fs.writeFileSync(tmp, 'dropped');
  try {
    const desk = await inUi(`
      const api = window.vtDesktop, files = document.getElementById('__vtFiles').files;
      const dt = new DataTransfer(); dt.items.add(new File(['x'], 'made-by-the-page.txt'));
      return { keys: api ? Object.keys(api) : null, list: api.pathsFor(files), arr: api.pathsFor([...files]), made: api.pathsFor(dt.files),
        none: api.pathsFor(null), junk: api.pathsFor([1, 'a', {}]), node: typeof window.require + typeof window.process, app: !!window.__vt };`,
    { preload: path.join(root, 'app', 'main-preload.cjs'), files: [tmp] });
    assert.deepEqual(desk.errors, [], desk.errors.join(' | '));
    assert.deepEqual(desk.result.keys, ['pathsFor'], 'one function, nothing else');
    assert.deepEqual(desk.result.list, [tmp], 'a FileList (what a drop gives) → the real path');
    assert.deepEqual(desk.result.arr, [tmp], 'a File[] too');
    assert.deepEqual(desk.result.made, [], 'a file the page made has no path');
    assert.deepEqual([desk.result.none, desk.result.junk], [[], []], 'anything else: harmless');
    assert.equal(desk.result.node, 'undefinedundefined', 'no Node in the page');
    assert.equal(desk.result.app, true);

    const browser = await inUi(`return { api: typeof window.vtDesktop, app: !!window.__vt, nav: document.querySelectorAll('#nav button').length };`);
    assert.deepEqual(browser.errors, []);
    assert.deepEqual(browser.result, { api: 'undefined', app: true, nav: 3 }, 'a browser: no vtDesktop, the app runs');
    const phone = await inUi(`return { api: typeof window.vtDesktop, remote: !!window.__vt.remote, app: !!document.getElementById('app'), subnav: !!document.getElementById('subnav') };`, { mobile: true, w: 390, h: 844 });
    assert.deepEqual(phone.errors, []);
    assert.deepEqual(phone.result, { api: 'undefined', remote: true, app: false, subnav: false }, 'a phone still opens the calibration remote, not the app');

    // the desktop app registers it on its main window, with the window kept isolated
    const src = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
    const from = src.indexOf('function createMainWindow'), body = src.slice(from, src.indexOf('\n}\n', from));
    assert.match(body, /preload: path\.join\(ROOT, 'app', 'main-preload\.cjs'\)/);
    for (const k of [/contextIsolation: true/, /nodeIntegration: false/, /sandbox: true/]) assert.match(body, k);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
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
    const R = (P.walls.find((w) => w.id === 'P2').pixelRect.h / 3.5) * 0.11;
    // the scale is read when the pixel is read: the page may still be settling its canvas size when the test starts
    const ringTop = (k) => { const sx = c.width / P.canvas.width, sy = c.height / P.canvas.height, [x, y] = m.points[k]; return [...g.getImageData(Math.round(x * sx), Math.round((y - R) * sy), 1, 1).data]; };
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

test('ui: pixel map — the Calibrate toggle sends projection.set grid; the Texture editor offers the overlay option', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    v.go('calibrate'); await wait(250);
    const row = () => [...document.querySelectorAll('#panel .row')].find((r) => r.querySelector('label')?.innerText === 'Grid on the walls');
    const before = { found: !!row(), grid: store.state.grid };
    row().querySelector('button.switch').click();
    for (let k = 0; k < 30 && !store.state.grid; k++) await wait(100);
    await wait(200);
    const after = { grid: store.state.grid, on: row().querySelector('button.switch').classList.contains('on') };
    v.go('outputs'); v.select('output', 'TX'); await wait(250);
    const sel = [...document.querySelectorAll('#panel .row')].find((r) => r.querySelector('label')?.innerText === 'Calibration overlay')?.querySelector('select');
    const opts = sel ? [...sel.options].map((o) => o.text) : null;
    if (sel) { sel.value = 'off'; sel.dispatchEvent(new Event('change')); }
    for (let k = 0; k < 30 && store.state.profile.outputs.find((o) => o.id === 'TX')?.overlay !== 'off'; k++) await wait(100);
    return { before, after, opts, overlay: store.state.profile.outputs.find((o) => o.id === 'TX')?.overlay };`, { setup: still });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.deepEqual(result.before, { found: true, grid: false });
  assert.deepEqual(result.after, { grid: true, on: true });
  assert.deepEqual(result.opts, ['Automatic', 'Off']);
  assert.equal(result.overlay, 'off');
});

test('ui: pixel map — the projection page and the full-screen texture page draw the metre grid when it is on', opt, async () => {
  const noWanderers = async (engine) => { const p = structuredClone(engine.profile); p.simulation.wanderers = 0; await engine.command('profile.update', { profile: p, rev: engine.rev }); };
  const proj = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    for (let k = 0; k < 50 && !store.state; k++) await new Promise((r) => setTimeout(r, 100));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const P = store.state.profile, W = P.walls.find((w) => w.id === 'P2');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const c = document.getElementById('c'), g = c.getContext('2d');
    const sx = c.width / P.canvas.width, sy = c.height / P.canvas.height;
    // the 1 m line (x = 1 m) at 1.2 m height, drawn through the wall's mapping
    const [lx, ly] = wallUvToCanvas(W, 1 / W.width, 1 - 1.2 / W.height);
    const lit = () => { let m = 0; for (let d = -3; d <= 3; d++) m = Math.max(m, g.getImageData(Math.round(lx * sx) + d, Math.round(ly * sy), 1, 1).data[0]); return m; };
    window.__proj.draw();
    const off = lit();
    await cmd('projection.set', { grid: true });
    await wait(500);
    window.__proj.draw();
    return { off, on: lit(), grid: store.state.grid, mode: store.state.projection.mode };`, { page: '/projection', wait: 'load', setup: noWanderers });
  assert.deepEqual(proj.errors, []);
  assert.equal(proj.result.mode, 'off', 'whatever the mode (here: off)');
  assert.equal(proj.result.off, 0);
  assert.equal(proj.result.grid, true);
  assert.ok(proj.result.on > 60, `the 1 m line is lit (${proj.result.on})`);

  const tex = await inUi(`
    const { store, cmd, editProfile } = await import('/js/conn.js');
    for (let k = 0; k < 50 && !store.state; k++) await new Promise((r) => setTimeout(r, 100));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = document.getElementById('c'), g = c.getContext('2d');
    const bright = () => { const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 100) n++; return n; };
    const settle = async () => { await wait(600); window.__tex.frame(); window.__tex.draw(); };
    await settle();
    const off = bright();
    await cmd('projection.set', { grid: true });
    await settle();
    const on = bright();
    await editProfile((p) => { p.outputs.find((o) => o.id === 'TX').overlay = 'off'; }, 'overlay off');
    await settle();
    return { off, on, withOverlayOff: bright() };`, {
    page: '/texture?o=TX', wait: 'load', w: 960, h: 600,
    setup: async (engine) => {
      const p = structuredClone(engine.profile); p.simulation.wanderers = 0;
      p.outputs.push({ id: 'TX', type: 'texture', name: 'Touch texture', radius: 0.08, softness: 0, trailMs: 0 });
      const o = p.outputs.at(-1); o.enabled = true; o.sink = 'window'; o.scale = 0.25;
      await engine.command('profile.update', { profile: p, rev: engine.rev });
    },
  });
  assert.deepEqual(tex.errors, []);
  assert.equal(tex.result.off, 0, 'no touches, no grid: black');
  assert.ok(tex.result.on > 300, `the grid is on the texture page (${tex.result.on} px)`);
  assert.equal(tex.result.withOverlayOff, 0, 'overlay Off: pure touches again');
});

test('ui: no knob-and-dot sliders anywhere — values use the VEATION fader (groove + fill + value box)', opt, async () => {
  // every view of the three sections, the new ones included (Live's Experience panel, Output › Screens with the room
  // output's layers, Output › Audio); a view that drew a native range input anywhere on the page fails it
  const { result, errors } = await inUi(`
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ranges = {}, panelFaders = {};
    const look = (name) => { ranges[name] = document.querySelectorAll('input[type=range]').length; panelFaders[name] = document.querySelectorAll('#panel .vfield[role=slider]').length; };
    for (const [view, kind, id] of [['live'], ['status'], ['room', 'wall', 'P2'], ['mapping', 'wall', 'P2'], ['audio'], ['sensors', 'sensor', 'S2'], ['calibrate'], ['zones', 'zone', 'Z1'], ['outputs', 'output', 'TX'], ['system']]) {
      v.go(view); if (kind) v.select(kind, id); await wait(150); look(view);
    }
    const seen = Object.keys(ranges);
    const faders = [...document.querySelectorAll('#panel .vfield[role=slider]')].map((f) => f.getAttribute('aria-label'));
    v.go('outputs'); v.select('output', 'TX'); await wait(150);
    // the value box is a field: tap, type, Enter
    const box = [...document.querySelectorAll('#panel .row.fader')].find((r) => r.querySelector('label').innerText === 'Trail').querySelector('.vbox');
    box.click();
    const inp = box.querySelector('input'); inp.value = '450'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(400);
    const { store } = await import('/js/conn.js');
    return { ranges, panelFaders, seen, views: v.nav.views, faders: [...document.querySelectorAll('#panel .vfield[role=slider]')].map((f) => f.getAttribute('aria-label')), trail: store.state.profile.outputs.find((o) => o.id === 'TX').trailMs };`, { setup: still });
  assert.deepEqual(errors, []);
  assert.deepEqual([...result.seen].sort(), [...result.views].sort(), 'every view of the app was looked at');
  assert.ok(Object.values(result.ranges).every((n) => n === 0), JSON.stringify(result.ranges));
  // the new containers really hold values (so the count above looked at them): the experience's parameters in Live,
  // the layers' opacity in Screens, master / crossover / high-pass / ceiling in Audio
  for (const v of ['live', 'mapping', 'audio']) assert.ok(result.panelFaders[v] > 0, `${v} shows VEATION faders (${JSON.stringify(result.panelFaders)})`);
  assert.deepEqual(result.faders, ['Radius', 'Soft edge', 'Trail']);
  assert.equal(result.trail, 450, 'typed in the value box');
});

test('ui: Texture — Send to NDI or Full screen (Spout is the room output, not the Texture); full screen offers the page when there is no desktop app', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    v.go('outputs'); v.select('output', 'TX');
    const pick = async (t) => { [...document.querySelectorAll('#panel .seg button')].find((b) => b.innerText === t).click(); await wait(300); };
    const r = { spoutNote: document.getElementById('panel').innerText.includes('Spout goes through the single room output (Output › Screens).'), start: store.state.profile.outputs.find((o) => o.id === 'TX').sink, options: [...[...document.querySelectorAll('#panel .row')].find((x) => x.innerText.startsWith('Send to')).querySelectorAll('button')].map((b) => b.innerText) };
    await pick('NDI');
    r.ndi = store.state.profile.outputs.find((o) => o.id === 'TX').sink; r.ndiText = document.getElementById('panel').innerText.includes('NDI® is a registered trademark of Vizrt NDI AB');
    await pick('Full screen');
    const o = store.state.profile.outputs.find((x) => x.id === 'TX');
    r.window = o.sink; r.page = document.querySelector('#panel a[href^="/texture"]')?.getAttribute('href');
    await pick('Stretch'); r.fit = store.state.profile.outputs.find((x) => x.id === 'TX').fit;
    r.summary = [...document.querySelectorAll('#panel .item')].find((i) => i.innerText.includes('Touch texture')).innerText;
    return r;`, { setup: still });
  assert.deepEqual(errors, []);
  assert.equal(result.start, 'ndi', 'a Texture output is not sent over Spout: NDI by default');
  assert.deepEqual(result.options, ['NDI', 'Full screen'], 'Spout goes through the single room output');
  assert.equal(result.spoutNote, true, 'and the editor says so');
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
  assert.match(result.busy, /Setting 192\.168\.11\.12… the sensor is restarting: \d+ s \(it can take a minute/, 'it counts the seconds (a real S2E takes up to ~1 min)');
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

test('ui: the QR link (with the access key) opens the remote on a phone that is not this computer — connected, key out of the URL', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    for (let k = 0; k < 50 && !store.connected; k++) await new Promise((r) => setTimeout(r, 100));
    return { remote: !!window.__vt?.remote, connected: !!store.connected, local: store.state?.local, url: location.pathname + location.search,
      room: document.querySelector('.r-room')?.innerText };`, {
    mobile: true, w: 390, h: 844,
    page: '/?k=qr-test-key',
    server: { trustLocal: false }, // act as a phone on the LAN: only the key lets it in
    setup: (engine) => { engine.settings.token = 'qr-test-key'; },
  });
  assert.deepEqual(errors, []);
  assert.equal(result.connected, true, 'the live channel is up');
  assert.equal(result.remote, true, 'the calibration remote, with its data');
  assert.match(result.room, /Barcelona XR Lab/);
  assert.equal(result.url, '/', 'the key is kept out of the address bar (screenshots)');
});

test('ui: in a simulated room the phone rehearses the whole calibration — a virtual hand holds each target', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    rc.setWall('P2'); rc.setStep('calibrate');
    rc.calibOpt.cols = 2; rc.calibOpt.rows = 2; rc.rerender();
    [...document.querySelectorAll('#rBody button')].find((b) => /^Start calibration/.test(b.innerText)).click();
    for (let k = 0; k < 30 && !store.status?.calib; k++) await wait(100);
    const labels = [];
    for (let n = 0; n < 4; n++) {
      let btn = null;
      for (let k = 0; k < 40 && !(btn = [...document.querySelectorAll('#rBody button')].find((b) => b.innerText === 'Simulated hand on target ' + (n + 1))); k++) await wait(100);
      if (!btn) break;
      labels.push(btn.innerText);
      btn.click();
      for (let k = 0; k < 60 && (store.status?.calib?.index ?? 0) === n && store.status?.calib?.phase !== 'done'; k++) await wait(100);
    }
    for (let k = 0; k < 30 && store.status?.calib?.phase !== 'done'; k++) await wait(100);
    const c = store.status?.calib;
    return { labels, phase: c?.phase, result: c?.result?.S2 ? { ok: c.result.S2.ok, points: c.result.S2.points, rmsMm: c.result.S2.rmsMm } : null,
      apply: [...document.querySelectorAll('#rBody button')].some((b) => b.innerText === 'Apply & save') };`, {
    mobile: true, w: 390, h: 844,
    setup: async (engine) => {
      await engine.command('bg.capture', { frames: 5 });
      await new Promise((r) => setTimeout(r, 1500));
    },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(result.labels, ['Simulated hand on target 1', 'Simulated hand on target 2', 'Simulated hand on target 3', 'Simulated hand on target 4']);
  assert.equal(result.phase, 'done');
  assert.deepEqual({ ok: result.result?.ok, points: result.result?.points }, { ok: true, points: 4 });
  assert.ok(result.result.rmsMm < 15, `${result.result.rmsMm} mm`);
  assert.equal(result.apply, true);
});

test('ui: remote clarity — every screen says "Step N of 5", one sentence with the wall and where, and exactly one primary action', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    const shot = () => {
      const q = (s) => document.querySelector(s);
      const prim = [...document.querySelectorAll('#rBody .r-primary')];
      return { title: q('#rBody .r-stepno')?.innerText, say: q('#rBody .r-do')?.innerText, see: q('#rBody .r-see')?.innerText,
        primary: prim.map((e) => e.innerText.trim()), tall: prim.every((e) => e.getBoundingClientRect().height >= 48 || !e.matches('button')),
        walls: q('#rBody .r-prog .lbl')?.innerText };
    };
    const r = {};
    rc.setWall('P2');
    for (const step of ['prepare', 'fit', 'verify', 'test']) { rc.setStep(step); await wait(150); r[step] = shot(); }
    await cmd('bg.capture', { frames: 5 }); await wait(2000);
    rc.setStep('prepare'); await wait(100); r.prepareBg = shot();
    rc.setStep('calibrate'); rc.calibOpt.cols = 2; rc.calibOpt.rows = 2; rc.rerender(); await wait(150);
    r.calibrate = shot();
    [...document.querySelectorAll('#rBody button')].find((b) => /^Start calibration/.test(b.innerText)).click();
    for (let k = 0; k < 30 && !store.status?.calib; k++) await wait(100);
    await wait(200);
    r.session = shot();
    r.shown = { guide: getComputedStyle(document.querySelector('.r-guide')).display, steps: getComputedStyle(document.querySelector('.r-steps')).display };
    for (let n = 0; n < 4; n++) {
      const btn = [...document.querySelectorAll('#rBody button')].find((b) => b.innerText === 'Simulated hand on target ' + (n + 1));
      btn.click();
      for (let k = 0; k < 60 && (store.status?.calib?.index ?? 0) === n && store.status?.calib?.phase !== 'done'; k++) await wait(100);
    }
    for (let k = 0; k < 30 && store.status?.calib?.phase !== 'done'; k++) await wait(100);
    await wait(200);
    r.result = shot();
    return r;`, {
    mobile: true, w: 390, h: 844, setup: still,
  });
  assert.deepEqual(errors, []);
  const r = result;
  const n = (k) => `Step ${k} of 5 · `;
  assert.match(r.prepare.title, new RegExp(`^${n(1)}Prepare P2$`));
  assert.match(r.fit.title, new RegExp(`^${n(3)}Fit P2$`));
  assert.match(r.verify.title, new RegExp(`^${n(4)}Verify P2$`));
  assert.match(r.test.title, new RegExp(`^${n(5)}Walk test$`));
  assert.match(r.calibrate.title, new RegExp(`^${n(2)}Calibrate P2$`));
  for (const k of ['prepare', 'fit', 'verify', 'test', 'calibrate', 'session', 'result']) {
    assert.equal(r[k].primary.length, 1, `${k}: exactly one primary action (${JSON.stringify(r[k].primary)})`);
    assert.ok(r[k].tall, `${k}: the primary button is at least 48 px tall`);
    assert.ok(r[k].title.startsWith('Step '), `${k}: a step counter`);
  }
  assert.deepEqual(r.prepare.primary, ['Capture background'], 'the first thing missing is the one action');
  assert.match(r.prepare.walls, /^walls 0 of 4 done$/i, 'progress is always visible');
  assert.deepEqual(r.prepareBg.primary, ['Waiting for the projection'], 'with the background captured, the next missing thing is the projection');
  assert.match(r.prepareBg.say, /^Open the projection on the projector, from the computer\.$/);
  assert.deepEqual(r.fit.primary.map((t) => t.replace(/\d+ × \d+/, 'N × M')), ['Make a N × M mesh']);
  assert.match(r.calibrate.say, /Stand facing the 3rd wall from the left — P2/, 'the wall by name and position');
  assert.match(r.calibrate.see, /Touch and hold · 1\/4/, 'what you should see');
  assert.deepEqual(r.calibrate.primary, ['Start calibration of P2']);
  assert.match(r.session.title, new RegExp(`^${n(2)}Calibrate P2$`));
  assert.match(r.session.say, /^Press the amber ring at the (top|bottom|middle) (left|centre|right) \(\d\.\d m up\) on the 3rd wall from the left — P2\. Use your open palm, flat\. Hold until the ring is full\.$/);
  assert.match(r.session.primary[0], /^Press the amber ring/, 'while a hand is held on the wall, the sentence is the action');
  assert.deepEqual(r.shown, { guide: 'none', steps: 'none' }, 'a session owns the screen: nothing else to read');
  assert.deepEqual(r.result.primary, ['Apply & save']);
  assert.match(r.result.say, /^Check the error, then tap Apply & save\.$/);
});

test('ui: remote feedback — an accepted touch buzzes, flashes the target and beeps; the sound toggle is remembered', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    const buzz = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p) => { buzz.push(p); return true; } });
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { hasBeenActive: true } });
    rc.setWall('P2'); rc.setStep('calibrate');
    rc.calibOpt.cols = 2; rc.calibOpt.rows = 2; rc.rerender();
    [...document.querySelectorAll('#rBody button')].find((b) => /^Start calibration/.test(b.innerText)).click();
    for (let k = 0; k < 30 && !store.status?.calib; k++) await wait(100);
    const hold = async (n) => {
      let flash = null;
      const btn = [...document.querySelectorAll('#rBody button')].find((b) => b.innerText === 'Simulated hand on target ' + (n + 1));
      const before = rc.fb.ok;
      btn.click();
      for (let k = 0; k < 150 && rc.fb.ok === before; k++) await wait(15);
      flash = document.querySelector('#rBody .r-target')?.classList.contains('flash') ?? null; // the instant it was accepted
      for (let k = 0; k < 60 && (store.status?.calib?.index ?? 0) === n; k++) await wait(100);
      return flash;
    };
    const r = { sound0: rc.sound };
    r.flash = await hold(0);
    r.afterFirst = { ...rc.fb, buzz: buzz.length, first: buzz[0] };
    const toggle = [...document.querySelectorAll('.r-foot button')].find((b) => /^Sound/.test(b.innerText));
    r.label0 = toggle.innerText;
    toggle.click(); await wait(100);
    const beepsBefore = rc.fb.beeps;
    r.label1 = [...document.querySelectorAll('.r-foot button')].find((b) => /^Sound/.test(b.innerText)).innerText;
    r.stored = localStorage.getItem('vt-remote-sound');
    await hold(1);
    r.afterSecond = { ...rc.fb, buzz: buzz.length, silent: rc.fb.beeps === beepsBefore };
    return r;`, { mobile: true, w: 390, h: 844, setup: async (engine) => { await still(engine); await engine.command('bg.capture', { frames: 5 }); await new Promise((r) => setTimeout(r, 1500)); } });
  assert.deepEqual(errors, []);
  assert.equal(result.sound0, true, 'sound is on by default');
  assert.equal(result.flash, true, 'the target flashes when the touch is accepted');
  assert.equal(result.afterFirst.ok, 1);
  assert.equal(result.afterFirst.buzz, 1, 'the phone buzzes once');
  assert.ok(result.afterFirst.beeps >= 1, 'and beeps');
  assert.equal(result.label0, 'Sound on');
  assert.equal(result.label1, 'Sound off');
  assert.equal(result.stored, 'off', 'remembered on this phone');
  assert.equal(result.afterSecond.ok, 2);
  assert.equal(result.afterSecond.buzz, 2, 'still buzzes with the sound off');
  assert.equal(result.afterSecond.silent, true, 'but no beep');
});

test('ui: remote grid — Verify and Test toggle the grid on the walls with projection.set {grid}, reading state.grid', opt, async () => {
  const sent = [];
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rc = window.__vt;
    const btn = () => [...document.querySelectorAll('#rBody .r-grid')];
    const r = {};
    rc.setWall('P2'); rc.setStep('verify'); await wait(150);
    r.verifyBtns = btn().length; r.verifyText = btn()[0].innerText;
    btn()[0].click(); await wait(300);
    store.state.grid = true; rc.rerender(); await wait(100); // the engine reports it on
    r.onText = btn()[0].innerText; r.pressed = btn()[0].getAttribute('aria-pressed');
    btn()[0].click(); await wait(300);
    store.state.grid = false;
    rc.setStep('test'); await wait(150);
    r.testBtns = btn().length;
    btn()[0].click(); await wait(300);
    return r;`, {
    mobile: true, w: 390, h: 844, setup: (engine) => {
      const orig = engine.command.bind(engine);
      engine.command = (op, a) => { if (op === 'projection.set' && 'grid' in a) { sent.push(a.grid); return Promise.resolve({}); } return orig(op, a); };
    },
  });
  assert.deepEqual(errors, []);
  assert.equal(result.verifyBtns, 1);
  assert.equal(result.testBtns, 1);
  assert.equal(result.verifyText, 'Show a grid on the walls');
  assert.match(result.onText, /^Grid on the walls: on/);
  assert.equal(result.pressed, 'true');
  assert.deepEqual(sent, [true, false, true], 'off → on, on → off (it reads state.grid), and from Test on again');
});

test('ui: a page that cannot start says so on screen and its error reaches the computer\'s log', opt, async () => {
  // a copy of the UI whose entry module throws while loading — what a phone saw with the QR-key bug
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-broken-ui-'));
  fs.cpSync(path.join(root, 'ui'), path.join(tmp, 'ui'), { recursive: true });
  fs.cpSync(path.join(root, 'engine', 'core'), path.join(tmp, 'engine', 'core'), { recursive: true }); // /shared/*.js
  fs.writeFileSync(path.join(tmp, 'ui', 'js', 'main.js'), "import './conn.js';\nthrow new ReferenceError(\"Cannot access 'history' before initialization\");\n");
  const lines = [];
  const log = { ...quiet, warn: (m) => lines.push(m) };
  try {
    const { result, errors } = await inUi(`
      await new Promise((r) => setTimeout(r, 800));
      const d = document.getElementById('bootFail');
      return { shown: !!d, text: d ? d.innerText : '' };`, { page: '/', wait: 'load', mobile: true, w: 390, h: 844, server: { root: tmp, log } });
    assert.equal(result.shown, true, 'not a silent empty page');
    assert.match(result.text, /This page could not start/);
    assert.match(result.text, /Cannot access 'history' before initialization/);
    assert.ok(errors.length >= 1, 'the runner saw the error too');
    const line = lines.find((l) => /^page error on/.test(l));
    assert.ok(line, `in the log: ${JSON.stringify(lines)}`);
    assert.match(line, /the page did not start: .*Cannot access 'history' before initialization/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ui: a page that started keeps quiet on screen — a later error is only sent to the log', opt, async () => {
  const lines = [];
  const log = { ...quiet, warn: (m) => lines.push(m) };
  const { result } = await inUi(`
    window.dispatchEvent(new ErrorEvent('error', { message: 'late failure', filename: location.origin + '/js/app.js', lineno: 3, colno: 9 }));
    await new Promise((r) => setTimeout(r, 600));
    return { overlay: !!document.getElementById('bootFail') };`, { server: { log } });
  assert.equal(result.overlay, false, 'the working app is not covered');
  const line = lines.find((l) => /late failure/.test(l));
  assert.ok(line, JSON.stringify(lines));
  assert.match(line, /^page error on this computer, \/: late failure at \/js\/app\.js:3:9$/, 'started: no "did not start"');
});

test('ui: Connect device offers Same Wi-Fi and Over the internet; the internet side shows its state and, online, the public link', opt, async () => {
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const V = await import('/js/views.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try { localStorage.removeItem('vt-connect-mode'); } catch {}
    store.state.cloud = { ...store.state.cloud, relayUrl: '' }; // an operator who cleared the relay address
    const host = document.createElement('div'); document.body.append(host);
    host.append(V.connectContent());
    const tabs = () => [...host.querySelectorAll('.seg button')].map((b) => b.innerText);
    const out = { tabs: tabs(), wifiFirst: !!host.querySelector('.qr') };
    host.querySelectorAll('.seg button')[1].click();
    await wait(50);
    out.offText = host.innerText;
    out.offButton = [...host.querySelectorAll('button')].some((b) => b.innerText === 'Turn on internet access');
    // online: the public link is drawn as a QR
    store.state.cloud = { ...store.state.cloud, enabled: true, state: 'online', link: 'https://launcher.example/#r=abc&k=KEY&relay=x' };
    await wait(900);
    out.onText = host.innerText; out.qr = (host.querySelector('.qr img') || {}).src || '';
    store.state.cloud = { ...store.state.cloud, state: 'error', error: 'Cannot reach the relay (ENOTFOUND).' };
    await wait(900);
    out.errText = host.innerText;
    return out;`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.deepEqual(result.tabs, ['Same Wi-Fi', 'Over the internet']);
  assert.match(result.offText, /Enter the relay address first/, 'no relay address yet: says where to enter it');
  assert.equal(result.offButton, true);
  assert.match(result.onText, /Online/);
  assert.match(decodeURIComponent(result.qr), /launcher\.example\/#r=abc&k=KEY/);
  assert.match(result.errText, /Cannot reach the relay \(ENOTFOUND\)/);
});

// ---------------------------------------------------------------------------------------------------- experiences

const EXPERIENCES_FIXTURES = path.join(root, 'tests', 'fixtures', 'experiences');
/** An engine that lists the touch-probe fixture, with no wandering hands (their touches would join the ones under test). */
async function withProbe(engine, { play = false, scale } = {}) {
  engine.experienceDirs.push(EXPERIENCES_FIXTURES);
  await engine.command('experience.list');
  const p = structuredClone(engine.profile);
  p.simulation.wanderers = 0;
  p.experience = normalizeProfile({}).experience; // the bundled rooms may come with an experience chosen…
  p.output = normalizeProfile({}).output;         // …and an output
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  if (scale) await engine.command('output.set', { scale });
  if (play) await engine.command('experience.play', { id: 'touch-probe' });
}

test('ui: an experience page gets the room in render pixels, hears touches where they land, and vt.frame feeds the Spout bridge at the render size', opt, async () => {
  const { result, errors, engine } = await inUi(`
    const { cmd, store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 100 && !(window.__probe && store.state); k++) await wait(100);
    const pr = window.__probe, vt = pr.vt, P = store.state.profile, wall = P.walls[0], r = wall.pixelRect;
    const out = { gl: pr.gl, sink: vt.sink, fit: vt.fit, standalone: vt.standalone, size: vt.size, canvas: vt.canvas, scale: vt.scale, fps: vt.fps,
      walls: vt.walls, rects: P.walls.map((w) => w.pixelRect), modes: P.walls.map((w) => w.mapping.mode), closed: vt.closedLoop, joined: P.walls.every((w) => w.joinNext === true), params0: { ...vt.params } };
    // a hand on the first wall, then moved right, then lifted
    const x = wall.width * 0.4, y = wall.height * 0.5;
    out.expected = [(r.x + (x / wall.width) * r.w) * vt.scale, (r.y + (1 - y / wall.height) * r.h) * vt.scale];
    out.tol = 0.06 * (r.w * vt.scale) / wall.width; // 6 cm of the wall, in render px
    out.toPx = vt.toPx(wall.id, x, y);
    await cmd('sim.touch', { wallId: wall.id, x, y, id: 'probe', down: true });
    for (let k = 0; k < 60 && !pr.events.some((e) => e.type === 'down'); k++) await wait(100);
    out.down = pr.events.find((e) => e.type === 'down') || null;
    out.listed = vt.touches().map((t) => ({ id: t.id, wallId: t.wallId, size: t.size }));
    // the hand slides 0.35 m to the right as a hand does — about 0.6 m/s, read at 10 Hz — not in one jump: a still
    // hand that is suddenly 0.35 m away in one revolution (3.5 m/s) is, rightly, another hand for the tracker
    for (let s = 1; s <= 5; s++) { await cmd('sim.touch', { wallId: wall.id, x: x + 0.07 * s, y, id: 'probe', down: true }); await wait(120); }
    for (let k = 0; k < 40 && !pr.events.some((e) => e.type === 'move' && e.vx > 20); k++) await wait(100);
    // where the slide got to (the last move) and how fast it went (the fastest move: under load it can be an early one)
    const moves = pr.events.filter((e) => e.type === 'move');
    out.move = moves[moves.length - 1] || null;
    out.maxVx = moves.reduce((m, e) => Math.max(m, e.vx), -Infinity);
    await cmd('sim.touch', { wallId: wall.id, x, y, id: 'probe', down: false });
    for (let k = 0; k < 40 && !pr.events.some((e) => e.type === 'up'); k++) await wait(100);
    out.up = pr.events.find((e) => e.type === 'up') || null;
    out.touchesAfter = vt.touches().length;
    // a parameter changes live, without the page reloading
    const same = pr.vt;
    await cmd('experience.param', { key: 'gain', value: 0.5 });
    await wait(300);
    out.paramsAfter = { ...vt.params }; out.paramEvents = pr.params.length; out.sameHandle = window.__probe.vt === same;
    await wait(2300); // a preview (1 s) and a report (2 s) have gone out by now
    const c = window.__vtOutCalls;
    out.out = { start: c.start, n: c.send.length, first: c.send[0], bad: c.send.filter((s) => s.w !== vt.size.width || s.h !== vt.size.height || s.bytes !== s.w * s.h * 4 || s.flipY !== true).length };
    out.frames = pr.frames;
    return out;`, { page: '/experiences/touch-probe/index.html?run=1&fakeOut=1', wait: 'load', setup: (e) => withProbe(e, { play: true, scale: 0.25 }) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.gl, true, 'the fixture got a WebGL context');
  assert.equal(result.standalone, false);
  assert.equal(result.sink, 'spout', 'the bridge is there and the profile says Spout');
  assert.equal(result.fit, 'fit');
  assert.equal(result.scale, 0.25);
  assert.deepEqual(result.size, { width: Math.round(result.canvas.width * 0.25), height: Math.round(result.canvas.height * 0.25) }, 'render size = canvas x scale');
  assert.deepEqual(result.walls.map((w) => w.rect), result.rects.map((r) => ({ x: Math.round(r.x * 0.25), y: Math.round(r.y * 0.25), w: Math.round(r.w * 0.25), h: Math.round(r.h * 0.25) })), 'each wall\'s area in render px, in profile order');
  assert.equal(result.closed, true, 'the four screens close the room');
  assert.equal(result.closed, result.joined, 'vt.closedLoop is the profile\'s planCloses (its walls are joined at their corners)');
  assert.deepEqual(result.params0, { gain: 1, mode: 'soft', trails: false, focus: null }, 'the manifest defaults');
  assert.ok(result.modes.every((m) => m === 'rect'), 'the arithmetic below assumes rect mappings');
  assert.ok(Math.hypot(result.toPx[0] - result.expected[0], result.toPx[1] - result.expected[1]) < 0.01, `toPx ${result.toPx} vs ${result.expected}`);

  assert.ok(result.down, 'the runtime emitted a down');
  assert.ok(Math.hypot(result.down.x - result.expected[0], result.down.y - result.expected[1]) < result.tol, `down at ${result.down.x.toFixed(1)}, ${result.down.y.toFixed(1)} px, expected ${result.expected.map((v) => v.toFixed(1))} +-${result.tol.toFixed(1)}`);
  assert.equal(result.down.vx, 0);
  assert.ok(result.listed.some((t) => t.id === result.down.id && t.wallId === result.down.wallId && t.size > 0), 'vt.touches() lists it with a size in px');
  // (the hand slides ~0.6 m/s: 40–50 render px/s at scale 0.25 — the threshold only asks for a clear positive speed)
  assert.ok(result.move && result.maxVx > 20 && result.move.x > result.down.x + 10, `moved right with a positive speed: ${JSON.stringify(result.move)}, fastest vx ${result.maxVx}`);
  assert.equal(result.move.id, result.down.id, 'same touch id');
  assert.ok(result.up && result.up.id === result.down.id, 'and an up for the same id when the hand leaves');
  assert.equal(result.touchesAfter, 0);

  assert.equal(result.paramsAfter.gain, 0.5, 'vt.params follows the operator');
  assert.ok(result.paramEvents >= 1, 'a params event fired');
  assert.equal(result.sameHandle, true);
  assert.deepEqual(result.out.start, ['VEATION Touch'], 'the Spout sender is started once, with the sender name of the output');
  assert.ok(result.out.n >= 5, `frames reached the bridge (${result.out.n})`);
  assert.equal(result.out.first.w, result.size.width);
  assert.equal(result.out.first.h, result.size.height);
  assert.equal(result.out.bad, 0, 'every frame: render size, w x h x 4 bytes, flipY');
  assert.ok(engine.exp.fps > 5, `the page reported its fps (${engine.exp.fps})`);
  assert.equal(engine.exp.error, null);
  assert.ok(engine.outPreview?.buf?.[0] === 0xff && engine.outPreview.buf[1] === 0xd8, 'a JPEG preview reached the engine');
  assert.ok(engine.outPreview.buf.length < 300 * 1024);
});

test('ui: Spout on the GPU — the page never reads its pixels back and its canvas covers the window 1:1 from the top-left', opt, async () => {
  // the desktop app sends the window's own paints (a shared GPU texture of the render size) to Spout: a readPixels
  // per frame would only waste the 26 MB copy that the GPU path exists to avoid, and any offset or scaling of the
  // canvas would go out to the room as it is
  const { result, errors } = await inUi(`
    const { store } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 100 && !(window.__probe && store.state); k++) await wait(100);
    const vt = window.__probe.vt;
    await wait(1500);
    const c = document.querySelector('canvas'), b = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    return { sink: vt.sink, kind: window.vtOut.kind, sends: window.__vtOutCalls.send.length, frames: window.__probe.frames,
      size: vt.size, rect: { x: b.left, y: b.top, w: Math.round(b.width * dpr), h: Math.round(b.height * dpr) }, pos: getComputedStyle(c).position };`,
  { page: '/experiences/touch-probe/index.html?run=1&fakeOut=gpu', wait: 'load', setup: (e) => withProbe(e, { play: true, scale: 0.25 }) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.kind, 'spout-gpu');
  assert.equal(result.sink, 'spout');
  assert.ok(result.frames > 10, `the piece runs (${result.frames} frames)`);
  assert.equal(result.sends, 0, 'no pixels read back for the sender');
  assert.equal(result.pos, 'fixed');
  assert.deepEqual(result.rect, { x: 0, y: 0, w: result.size.width, h: result.size.height }, 'the canvas is the window, 1:1 device pixels, at the top-left');
});

test('ui: Live — the experience catalog, Play and Stop, the manifest controls; Output › Screens — the room output card (destination, scale, rate); no knob-and-dot sliders', opt, async () => {
  // (both were the Experiences tab; the media-server navigation split it: the experience in Live, where its image goes
  // under the Mapping in Output › Screens — the assertions are the old ones, each looked for in its new place)
  const { result, errors, engine } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const v = window.__vt;
    const panel = document.getElementById('panel');
    const card = () => panel.querySelector('.xp-card[data-id="touch-probe"]');
    const outCard = () => panel.querySelector('.xp-card[data-card="output"]');
    const btn = (root, t) => [...root.querySelectorAll('button')].find((b) => b.innerText.trim() === t);
    const live = async () => { v.go('live'); await wait(150); };
    const screens = async () => { v.go('mapping'); await wait(150); };
    // no tab of its own any more: the old id opens Live
    out.nav = !!document.querySelector('button[data-view="experiences"]');
    v.go('system'); await wait(50); v.go('experiences'); await wait(150);
    out.oldId = v.view;
    out.catalog = [...panel.querySelectorAll('.xp-card[data-id]')].map((c) => c.dataset.id);
    out.liveCards = { output: !!outCard(), audio: !!panel.querySelector('[data-card="audio"]') };
    out.idleHasPlay = !!btn(card(), 'Play'); out.idleHasStop = !!btn(card(), 'Stop');
    await screens();
    const last = panel.lastElementChild;
    out.outputUnderMapping = !!outCard() && last.contains(outCard()) && /output canvas/i.test(panel.firstElementChild.innerText) && /Output — VEATION Touch/.test(outCard().innerText);
    out.idlePreview = !!outCard().querySelector('img');
    out.idleOutputOn = outCard().querySelector('.row .switch').classList.contains('on');
    // Play
    await live();
    btn(card(), 'Play').click();
    for (let k = 0; k < 30 && !store.state.experience.running; k++) await wait(50);
    await wait(200);
    out.running = store.state.experience.running; out.outRunning = store.state.output.running; out.url = store.state.experience.url;
    out.on = card().classList.contains('on'); out.hasStop = !!btn(card(), 'Stop');
    out.faders = card().querySelectorAll('.vfield').length;
    out.labels = [...card().querySelectorAll('.row > label')].map((l) => l.innerText);
    out.switches = card().querySelectorAll('.switch').length;
    out.rangeInputs = document.querySelectorAll('input[type=range]').length;
    out.focusOptions = [...card().querySelectorAll('select')].map((s) => [...s.options].map((o) => o.value)).find((v) => v.includes('') && v.length > 2);
    out.cardHasDestination = !!btn(card(), 'Spout') || !!btn(card(), 'Full screen');
    // a fader (keyboard: one step), a toggle, a select
    card().querySelector('.vfield').focus();
    card().querySelector('.vfield').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await wait(250);
    out.gain = store.state.profile.experience.params['touch-probe']?.gain;
    document.activeElement.blur(); await wait(150);
    card().querySelector('.xp-params .switch').click(); await wait(250);
    out.trails = store.state.profile.experience.params['touch-probe']?.trails;
    const modeSel = [...card().querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'hard'));
    modeSel.value = 'hard'; modeSel.dispatchEvent(new Event('change')); await wait(250);
    out.mode = store.state.profile.experience.params['touch-probe']?.mode;
    // the output: the preview, the scale, the rate, the destination — in Output › Screens, not in the experience's card
    await screens();
    out.preview = !!outCard().querySelector('img.xp-preview');
    out.text = outCard().innerText;
    out.scaleOptions = [...outCard().querySelectorAll('select')].flatMap((s) => [...s.options].map((o) => o.textContent)).filter((t) => /px/.test(t));
    const scaleSel = [...outCard().querySelectorAll('select')].find((s) => [...s.options].some((o) => /^0\\.25 —/.test(o.textContent)));
    scaleSel.value = '1'; scaleSel.dispatchEvent(new Event('change')); await wait(250);
    out.scale = store.state.profile.output.scale;
    btn(outCard(), '30').click(); await wait(250);
    out.fps = store.state.profile.output.fps;
    btn(outCard(), 'Full screen').click(); await wait(250);
    out.sink = store.state.profile.output.sink;
    out.fullText = outCard().innerText;
    btn(outCard(), 'Spout').click(); await wait(250);
    out.spoutText = outCard().innerText;
    out.rangeInputsScreens = document.querySelectorAll('input[type=range]').length;
    // Show mode: where it goes is locked, running it and choosing what is seen are not
    await cmd('app.lock', { locked: true }); await wait(300);
    out.lockedControls = [...outCard().querySelectorAll('.xp-set button, .xp-set select, .xp-set input')].every((e) => e.disabled);
    out.lockedLayers = [...outCard().querySelectorAll('.xp-layer .switch, .xp-layer select')].every((e) => !e.disabled);
    out.lockedSet = await cmd('output.set', { fps: 60 }).then(() => 'accepted', (e) => e.message);
    await live();
    out.lockedStop = !btn(card(), 'Stop').disabled; out.lockedFader = !!card().querySelector('.vfield');
    await cmd('experience.param', { key: 'gain', value: 0.7 });
    await cmd('app.lock', { locked: false }); await wait(200);
    // Stop: the experience layer goes, the output stays
    btn(card(), 'Stop').click();
    for (let k = 0; k < 30 && store.state.experience.running; k++) await wait(50);
    out.stopped = !store.state.experience.running; out.stillOutput = store.state.output.running;
    out.rangeInputsEnd = document.querySelectorAll('input[type=range]').length;
    return out;`, { setup: (e) => withProbe(e) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.nav, false, 'no Experiences tab any more');
  assert.equal(result.oldId, 'live', 'the old id opens Live');
  assert.ok(result.catalog.includes('touch-probe'), 'the catalog is listed in Live');
  assert.deepEqual(result.liveCards, { output: false, audio: false }, 'Live holds the experience, not the output nor the audio setup');
  assert.equal(result.outputUnderMapping, true, 'the "Output — VEATION Touch" card is in Output › Screens, under the Mapping');
  assert.equal(result.idleHasPlay, true);
  assert.equal(result.idleHasStop, false);
  assert.equal(result.idlePreview, false, 'no preview while the output is off');
  assert.equal(result.idleOutputOn, false);
  assert.equal(result.running, true, 'Play sent experience.play');
  assert.equal(result.outRunning, true, 'and switched the output on');
  assert.equal(result.url, '/experiences/touch-probe/index.html?run=1');
  assert.equal(engine.profile.experience.id, 'touch-probe');
  assert.equal(result.on, true, 'the running card is highlighted');
  assert.equal(result.hasStop, true);
  assert.equal(result.preview, true, 'live preview image of the output');
  assert.match(result.text, /No desktop app/, 'without the desktop app it says to open the page in a browser');
  assert.match(result.text, /\/output\?run=1/);
  assert.equal(result.faders, 1, 'the number parameter is a VEATION fader');
  assert.deepEqual(result.labels.filter((l) => /Gain|Mode|Trails|Focus/.test(l)), ['Gain', 'Mode', 'Trails', 'Focus wall'], 'one control per manifest parameter, in order');
  assert.ok(result.scaleOptions.some((t) => /^0\.25 — \d+ × \d+ px$/.test(t)) && result.scaleOptions.some((t) => /^1 — \d+ × \d+ px$/.test(t)), `scale shows the pixel size: ${result.scaleOptions}`);
  assert.ok(result.focusOptions.length >= 3, `the wall select lists the room's walls: ${result.focusOptions}`);
  assert.ok(result.switches >= 2, 'start with the app + the bool');
  assert.equal(result.rangeInputs, 0, 'no native range inputs');
  assert.equal(result.rangeInputsScreens, 0);
  assert.equal(result.rangeInputsEnd, 0);
  assert.equal(result.gain, 1.05, 'a fader step is experience.param');
  assert.equal(result.trails, true);
  assert.equal(result.mode, 'hard');
  assert.equal(result.cardHasDestination, false, 'where it goes is the output\'s, not the experience\'s');
  assert.equal(result.scale, 1);
  assert.equal(result.fps, 30);
  assert.equal(result.sink, 'window');
  assert.match(result.fullText, /Proportions/);
  assert.match(result.spoutText, /only Spout sender/);
  assert.equal(result.lockedControls, true, 'Show mode locks the destination controls');
  assert.equal(result.lockedStop, true, '...but not Stop');
  assert.equal(result.lockedFader, true, '...nor the parameters');
  assert.equal(result.lockedLayers, true, '...nor the layers');
  assert.match(result.lockedSet, /locked/);
  assert.equal(engine.profile.experience.params['touch-probe'].gain, 0.7);
  assert.equal(result.stopped, true);
  assert.equal(result.stillOutput, true, 'Stop takes the experience off the output; the output stays on');
});

// ---------------------------------------------------------------------------------------------------- experience on the walls (viewer)

/** The room's experience is `touch-probe` (selected, and "running" as far as the engine's state goes), rendered at scale 1. */
async function withViewedProbe(engine, { play = true } = {}) {
  await withProbe(engine, { play: false, scale: 1 });
  const p = structuredClone(engine.profile);
  p.experience.id = 'touch-probe';
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  if (play) await engine.command('experience.play', { id: 'touch-probe' });
}

// pixels of the first wall's middle in the 2D workspace (the hidden window paints no frames: draw it by hand)
const WALL_PIXELS = `
  const ws = window.__vt.ws;
  const wallPixels = () => {
    ws.draw();
    const l = ws.walls()[0], s = ws.view.s, dpr = window.devicePixelRatio || 1;
    const x = Math.round((ws.sx(l.x0) + l.wall.width * s * 0.4) * dpr), y = Math.round((ws.sy(l.wall.height) + l.wall.height * s * 0.4) * dpr);
    const d = ws.ctx.getImageData(x, y, 8, 8).data;
    return [d[0], d[1], d[2]];
  };
`;

test('ui: the experience is simulated on the walls of the Live view, as a second hidden instance that leaves the real one alone', opt, async () => {
  const { result, errors, engine } = await inUi(`
    const { store } = await import('/js/conn.js');
    const xv = await import('/js/expview.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${WALL_PIXELS}
    window.__vt.go('live'); await wait(100);
    const out = {};
    let ifr = null;
    for (let k = 0; k < 150 && !(ifr = document.getElementById('xpViewer'))?.contentWindow?.__probe?.vt; k++) await wait(100);
    for (let k = 0; k < 100 && !xv.frame(); k++) await wait(100);
    const vt = ifr.contentWindow.__probe.vt, f = xv.frame();
    out.src = ifr.getAttribute('src'); out.style = ifr.getAttribute('style'); out.inDom = document.body.contains(ifr);
    out.sink = vt.sink; out.vtScale = vt.scale; out.vtSize = vt.size; out.canvas = vt.canvas; out.fps = vt.fps;
    out.frame = f && { w: f.bitmap.width, h: f.bitmap.height, seq: f.seq, id: f.id };
    // frames keep coming (a new sequence number), at a modest rate
    const s0 = f.seq; await wait(1000); out.framesPerSecond = xv.frame().seq - s0;
    out.btnHidden = document.getElementById('expBtn').hidden; out.btnOn = document.getElementById('expBtn').classList.contains('on');
    const cap = document.getElementById('xpCaption'); out.caption = cap.hidden ? null : cap.textContent;
    out.on = wallPixels();
    xv.setOn(false); out.off = wallPixels(); xv.setOn(true);
    for (let k = 0; k < 100 && !xv.frame(); k++) await wait(100);
    out.on2 = wallPixels();
    // the 3D room shows it too (when this window has WebGL 2)
    const r3 = window.__vt.r3d; out.gl3 = !!r3.ok;
    if (r3.ok) {
      r3.setActive(true); r3.draw();
      out.tex3 = r3.walls.get(store.state.profile.walls[0].id)?.ul || null;
      r3.setActive(false);
    }
    // the real instance's state is untouched by the viewer: a report would come every 2 s, a preview every second
    await wait(3500);
    out.exp = { ...store.state.experience }; out.output = { ...store.state.output, layersEffective: undefined };
    return out;`, { setup: (e) => withViewedProbe(e) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.src, '/experiences/touch-probe/index.html?run=1&view=1', 'the hidden iframe loads the page in viewer mode');
  assert.match(result.style, /opacity:\s*0/); assert.match(result.style, /width:\s*1px/); assert.match(result.style, /pointer-events:\s*none/);
  assert.doesNotMatch(result.style, /display/, 'kept rendering: never display:none');
  assert.equal(result.sink, 'viewer');
  assert.equal(result.vtScale, 0.5, 'a viewer renders at most at 0.5 even when the room renders at 1 (sharp enough for one wall in the app)');
  assert.deepEqual(result.vtSize, { width: Math.round(result.canvas.width * 0.5), height: Math.round(result.canvas.height * 0.5) });
  assert.ok(result.fps <= 30);
  assert.ok(result.frame && result.frame.w === result.vtSize.width && result.frame.h === result.vtSize.height && result.frame.id === 'touch-probe', `a frame arrived at the viewer's size: ${JSON.stringify(result.frame)}`);
  assert.ok(result.framesPerSecond >= 3 && result.framesPerSecond <= 36, `frames keep coming at <= ~30 Hz (${result.framesPerSecond}/s)`);
  assert.equal(result.btnHidden, false); assert.equal(result.btnOn, true, 'the toggle is on by default');
  assert.equal(result.caption, 'Touch probe — preview in this window');
  assert.ok(result.on[1] > 90 && result.on[1] < 160, `the wall shows the experience (green ${result.on[1]}, gain 1 -> ~127)`);
  assert.notDeepEqual(result.on, result.off, 'toggle off: the wall pixels are the plain wall again');
  assert.ok(result.off[1] < 50, `plain wall is dark (${result.off})`);
  assert.ok(result.on2[1] > 90, 'toggle on again: back');
  if (result.gl3) assert.match(result.tex3, /^xp\d+$/, 'the 3D wall texture is keyed by the experience frame');
  // the viewer is not the running instance
  assert.equal(result.exp.running, true);
  assert.equal(result.exp.fps, 0, 'no fps reported by the viewer');
  assert.equal(result.output.previewAt, null, 'no preview posted by the viewer');
  assert.equal(result.exp.error, null);
  assert.equal(engine.outPreview, null);
  assert.equal(engine.exp.fps, 0);
});

test('ui: the Experience toggle removes the hidden page and the frames, is remembered, and only exists with an experience', opt, async () => {
  const on = await inUi(`
    const xv = await import('/js/expview.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${WALL_PIXELS}
    window.__vt.go('live');
    for (let k = 0; k < 150 && !xv.frame(); k++) await wait(100);
    const out = { before: !!document.getElementById('xpViewer'), hadFrame: !!xv.frame() };
    const btn = document.getElementById('expBtn'), cap = document.getElementById('xpCaption');
    btn.click(); await wait(200);
    out.afterIframe = !!document.getElementById('xpViewer'); out.afterFrame = xv.frame(); out.btnOn = btn.classList.contains('on'); out.capHidden = cap.hidden;
    out.stored = localStorage.getItem('vt-exp-view'); out.plain = wallPixels();
    btn.click(); await wait(200);
    out.backIframe = !!document.getElementById('xpViewer'); out.capBack = cap.hidden ? null : cap.textContent;
    for (let k = 0; k < 150 && !xv.frame(); k++) await wait(100);
    out.backFrame = !!xv.frame(); out.stored2 = localStorage.getItem('vt-exp-view');
    return out;`, { setup: (e) => withViewedProbe(e, { play: false }) });
  assert.deepEqual(on.errors, [], `page errors: ${on.errors.join(' | ')}`);
  assert.deepEqual([on.result.before, on.result.hadFrame], [true, true], 'on by default, even before the experience is played');
  assert.equal(on.result.afterIframe, false, 'off: the hidden page is gone');
  assert.equal(on.result.afterFrame, null, 'off: no frame');
  assert.equal(on.result.btnOn, false); assert.equal(on.result.capHidden, true);
  assert.equal(on.result.stored, '0', 'remembered');
  assert.ok(on.result.plain[1] < 50, 'the wall is plain again');
  assert.equal(on.result.backIframe, true); assert.equal(on.result.backFrame, true); assert.match(on.result.capBack, /preview in this window/); assert.equal(on.result.stored2, '1');

  const none = await inUi(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(800);
    return { btn: document.getElementById('expBtn').hidden, iframe: !!document.getElementById('xpViewer'), cap: document.getElementById('xpCaption').hidden };`, { setup: (e) => withProbe(e) });
  assert.deepEqual(none.result, { btn: true, iframe: false, cap: true }, 'no experience in the profile: no toggle, no page, no caption');
});

// ---------------------------------------------------------------------------------------------------- the room output (one image, layers)

/** The experience is playing at scale 0.25 and the layers are as given (bottom → top). */
async function withLayers(engine, layers) {
  await withProbe(engine, { play: true, scale: 0.25 });
  await engine.command('output.layers', { layers });
}

test('ui: the output page composes its layers in the chosen order with the chosen blend and opacity; reordering never reloads the experience; a layer that is off is gone', opt, async () => {
  // (the layers are textures of the GPU mixer, ui/js/mixer: what it draws is __out.plan(); tests/mixer.test.mjs checks the pixels)
  const { result, errors, engine } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const { wallPattern } = await import('/shared/mask.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 150 && !(window.__out && store.state && window.__out.layers().length >= 3); k++) await wait(100);
    const stage = document.getElementById('stage');
    const info = () => window.__out.plan().map((l) => ({ ...l, tag: stage.querySelector('[data-layer=' + l.id + ']')?.tagName }));
    const topFirst = () => info().map((l) => l.id).reverse();
    const out = { first: info(), order: topFirst() };
    const ifr = stage.querySelector('iframe');
    for (let k = 0; k < 150 && !ifr.contentWindow.__probe?.vt; k++) await wait(100);
    const vt = ifr.contentWindow.__probe.vt;
    out.iframe = { src: ifr.getAttribute('src'), sink: vt.sink, canvasPos: getComputedStyle(ifr.contentDocument.querySelector('canvas')).position, size: vt.size, w: ifr.style.width };
    // not the Spout window of the app (no bridge here): the image is fitted to the window
    out.fitted = window.__out.view().fit;
    // reorder: the experience must stay alive (moving an iframe in the document would reload it)
    await cmd('output.layers', { layers: [{ id: 'touches' }, { id: 'grid' }, { id: 'experience' }] });
    await wait(300);
    out.reordered = topFirst(); out.sameFrame = stage.querySelector('iframe') === ifr && ifr.contentWindow.__probe?.vt === vt;
    // pinned 1:1 like the desktop app's Spout window (its preload exposes vtOut): the mixer's canvas is the render size,
    // CSS size x dpr = its pixels; the experience's page is the render size too
    window.vtOut = { kind: 'spout-gpu', ok: true }; window.__out.sync();
    const dpr = devicePixelRatio || 1, P = store.state.profile, want = { w: Math.round(P.canvas.width * P.output.scale), h: Math.round(P.canvas.height * P.output.scale) };
    const mix = document.getElementById('mix'), v = window.__out.view();
    out.pinned = { fit: v.fit, canvas: v.canvas, w: Math.round(parseFloat(mix.style.width) * dpr), h: Math.round(parseFloat(mix.style.height) * dpr), want,
      iframeW: Math.round(parseFloat(ifr.style.width) * dpr), gridPx: stage.querySelector('[data-layer=grid]').width, touchesPx: stage.querySelector('[data-layer=touches]').width };
    delete window.vtOut; window.__out.sync();
    // the touches layer draws the mask, the grid layer the pixel map
    const wall = P.walls.find((w) => w.id === 'P2');
    for (let k = 0; k < 15; k++) { await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: true }); await wait(40); }
    await wait(300);
    const [cx, cy] = wallUvToCanvas(wall, 2 / wall.width, 1 - 1.5 / wall.height);
    const tc = stage.querySelector('[data-layer=touches]'), ls = store.state.output.layersEffective.find((l) => l.id === 'touches').scale;
    out.touchesSize = [tc.width, tc.height, Math.round(P.canvas.width * ls), Math.round(P.canvas.height * ls)];
    out.touchPx = tc.getContext('2d').getImageData(Math.round(cx * ls), Math.round(cy * ls), 1, 1).data[0];
    out.touchFar = tc.getContext('2d').getImageData(Math.round(cx * ls) + 150, Math.round(cy * ls), 1, 1).data[0];
    await cmd('sim.touch', { wallId: 'P2', x: 2, y: 1.5, id: 't', down: false });
    window.__out.drawGrid(true);
    const gc = stage.querySelector('[data-layer=grid]'), s = P.output.scale, o0 = wallPattern(wall).outline[0];
    const near = (c, x, y) => { let a = 0; const d = c.getContext('2d').getImageData(Math.max(0, Math.round(x) - 2), Math.max(0, Math.round(y) - 2), 5, 5).data; for (let i = 3; i < d.length; i += 4) a = Math.max(a, d[i]); return a; };
    out.gridOnOutline = near(gc, o0[0] * s, o0[1] * s);
    { const d = gc.getContext('2d').getImageData(0, 0, gc.width, gc.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; out.gridCoverage = n / (gc.width * gc.height); }
    // layers off: gone from the page, not just hidden
    await cmd('output.layers', { layers: [{ id: 'touches', on: false }, { id: 'grid', on: false }, { id: 'experience' }] });
    await wait(300);
    out.afterOff = { ids: window.__out.layers(), dom: [...stage.querySelectorAll('.layer')].map((el) => el.dataset.layer) };
    await cmd('output.layers', { layers: [{ id: 'touches', on: false }, { id: 'grid', on: false }, { id: 'experience', on: false }] });
    await wait(300);
    out.allOff = { dom: [...stage.querySelectorAll('.layer')].length, frames: document.querySelectorAll('iframe').length };
    // the whole output off: nothing runs at all
    await cmd('output.layers', { layers: [{ id: 'experience', on: true }, { id: 'grid', on: true }, { id: 'touches', on: true }] });
    await wait(300);
    out.back = [...stage.querySelectorAll('.layer')].length;
    await cmd('output.set', { on: false }); await wait(300);
    out.outputOff = [...stage.querySelectorAll('.layer')].length;
    return out;`, {
    page: '/output?run=1', wait: 'load',
    setup: (e) => withLayers(e, [
      { id: 'grid', on: true, blend: 'add', opacity: 0.5 },
      { id: 'experience', on: true, blend: 'multiply', opacity: 0.9 },
      { id: 'touches', on: true, blend: 'screen', opacity: 0.7, scale: 0.125 },
    ]),
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const by = (id) => result.first.find((l) => l.id === id);
  assert.deepEqual(result.order, ['touches', 'experience', 'grid'], 'the profile\'s array order (bottom → top) is the order the mixer draws in');
  assert.deepEqual([by('touches').blend, by('experience').blend, by('grid').blend], ['screen', 'multiply', 'add']);
  assert.deepEqual([by('touches').opacity, by('experience').opacity, by('grid').opacity], [0.7, 0.9, 0.5]);
  assert.deepEqual([by('touches').tag, by('experience').tag, by('grid').tag], ['CANVAS', 'IFRAME', 'CANVAS'], 'the sources: 2D canvases and the experience\'s page');
  assert.match(result.iframe.src, /^\/experiences\/touch-probe\/index\.html\?run=1&layer=1$/, 'the experience runs in layer mode');
  assert.equal(result.iframe.sink, 'layer');
  assert.equal(result.iframe.canvasPos, 'fixed', 'its canvas is pinned 1:1 in its frame');
  assert.equal(result.fitted, 'fit', 'outside the desktop app\'s Spout window the image is fitted to the window');
  assert.deepEqual(result.reordered, ['experience', 'grid', 'touches'], 'reordered live');
  assert.equal(result.sameFrame, true, 'reordering does not reload the experience');
  assert.equal(result.pinned.fit, 'pinned', 'in the Spout window: no scaling');
  assert.deepEqual(result.pinned.canvas, [result.pinned.want.w, result.pinned.want.h], 'the mixer\'s canvas is the render size');
  assert.deepEqual([result.pinned.w, result.pinned.h], [result.pinned.want.w, result.pinned.want.h], 'shown 1:1');
  assert.equal(result.pinned.iframeW, result.pinned.want.w, 'the experience renders at the render size');
  assert.equal(result.pinned.gridPx, result.pinned.want.w, 'the grid is drawn at the FULL render size');
  assert.ok(result.pinned.touchesPx < result.pinned.want.w, 'the touches mask is a smaller canvas, stretched up');
  assert.deepEqual(result.touchesSize.slice(0, 2), result.touchesSize.slice(2), 'the mask has the layer\'s scale of the canvas');
  assert.ok(result.touchPx > 200, `white under the touch (${result.touchPx})`);
  assert.equal(result.touchFar, 0, 'black elsewhere');
  assert.ok(result.gridOnOutline > 120, `the grid draws the wall outline (${result.gridOnOutline})`);
  assert.ok(result.gridCoverage > 0 && result.gridCoverage < 0.5, `lines on a transparent layer (${result.gridCoverage})`);
  assert.deepEqual(result.afterOff.dom.sort(), ['experience'], 'layers that are off are removed from the page');
  assert.deepEqual(result.allOff, { dom: 0, frames: 0 }, 'all off: black, and no experience page running');
  assert.equal(result.back, 3);
  assert.equal(result.outputOff, 0, 'output off: nothing on the page');
  assert.ok(engine.exp.fps >= 0);
  assert.equal(engine.outPreview, null, 'an experience layer posts no preview of its own: the preview is the whole output\'s, taken by the desktop app');
});

test('ui: calibration mode — the output page shows only the grid on the touches (with the targets), then goes back to the operator\'s layers', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 150 && !(window.__out && store.state && window.__out.layers().length >= 1); k++) await wait(100);
    const stage = document.getElementById('stage');
    // what the mixer draws, top first (the calibration feedback, when it shows, is not a layer of the profile)
    const info = () => window.__out.plan().filter((l) => l.id !== 'feedback').reverse();
    const amber = () => {
      const c = stage.querySelector('[data-layer=grid]');
      if (!c) return -1;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && Math.abs(d[i] - 229) < 14 && Math.abs(d[i + 1] - 181) < 14 && Math.abs(d[i + 2] - 103) < 14) n++;
      return n;
    };
    const out = { normal: info().map((l) => l.id), calibratingBefore: store.state.output.calibrating };
    const wall = store.state.profile.walls[0].id;
    await cmd('calib.start', { wallId: wall, force: true });
    for (let k = 0; k < 50 && !(window.__out.layers().length === 2 && amber() > 0); k++) await wait(100);
    const frame0 = document.querySelector('iframe');
    out.calib = info(); out.calibratingDuring = store.state.output.calibrating; out.frames = document.querySelectorAll('iframe').length; out.amberDuring = amber();
    out.parked = !!frame0 && !window.__out.plan().some((l) => l.id === 'experience'); out.sameFrame = document.querySelector('iframe') === frame0;
    out.boots = frame0?.contentWindow?.__probe?.boots;
    await cmd('calib.cancel');
    for (let k = 0; k < 50 && !(window.__out.layers().join() === 'experience'); k++) await wait(100);
    out.after = info().map((l) => l.id); out.calibratingAfter = store.state.output.calibrating; out.framesAfter = document.querySelectorAll('iframe').length;
    out.bootsAfter = document.querySelector('iframe')?.contentWindow?.__probe?.boots;
    // the grid on its own (the Grid switch of Calibrate / the phone) is calibration mode too
    await cmd('projection.set', { grid: true });
    for (let k = 0; k < 50 && window.__out.layers().length !== 2; k++) await wait(100);
    out.grid = info().map((l) => l.id);
    await cmd('projection.set', { grid: false });
    for (let k = 0; k < 50 && window.__out.layers().join() !== 'experience'; k++) await wait(100);
    out.gridOff = info().map((l) => l.id);
    return out;`, {
    page: '/output?run=1', wait: 'load',
    setup: (e) => withLayers(e, [{ id: 'experience', on: true }, { id: 'touches', on: false }, { id: 'grid', on: false }]),
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.deepEqual(result.normal, ['experience'], 'normally: the operator\'s layers (only the experience is on)');
  assert.equal(result.calibratingBefore, false);
  assert.equal(result.calibratingDuring, true);
  assert.deepEqual(result.calib.map((l) => l.id), ['grid', 'touches'], 'calibration: the grid on top of the touches');
  assert.deepEqual(result.calib.map((l) => [l.blend, l.opacity]), [['screen', 1], ['screen', 1]]);
  // the piece is set aside, not torn down: it comes back as it was, without restarting (a new GPU device, its warm-up)
  assert.equal(result.frames, 1);
  assert.equal(result.parked, true, 'no experience shows while calibrating');
  assert.equal(result.sameFrame, true, 'the same experience page, kept running');
  assert.ok(result.boots >= 1 && result.bootsAfter === result.boots, `not restarted (boots ${result.boots} → ${result.bootsAfter})`);
  assert.ok(result.amberDuring > 0, `the grid draws the calibration target in amber (${result.amberDuring} px)`);
  assert.deepEqual(result.after, ['experience'], 'calibration cancelled: back to the operator\'s layers');
  assert.equal(result.calibratingAfter, false);
  assert.equal(result.framesAfter, 1);
  assert.deepEqual(result.grid, ['grid', 'touches'], 'the grid switch alone also shows grid + touches');
  assert.deepEqual(result.gridOff, ['experience']);
});

test('ui: Output › Screens › room output card — on/off, layer switches, reorder, opacity faders and blend; the calibration banner; no range inputs', opt, async () => {
  // (the card was in the Experiences tab; it is under the Mapping in Output › Screens now — view id 'mapping')
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const panel = document.getElementById('panel');
    window.__vt.go('mapping'); await wait(300);
    const card = () => panel.querySelector('.xp-card[data-card="output"]');
    const L = (id) => card().querySelector('.xp-layer[data-layer="' + id + '"]');
    const layersNow = () => store.state.profile.output.layers;
    const listed = () => [...card().querySelectorAll('.xp-layer')].map((e) => e.dataset.layer);
    const profileTop = () => layersNow().map((l) => l.id).reverse();
    const out = { title: card().querySelector('.head .t').firstChild.textContent, listed: listed(), profileTop: profileTop(), sink: store.state.profile.output.sink };
    out.sender = [...card().querySelectorAll('.row')].find((r) => r.querySelector('label')?.innerText === 'Sender name')?.querySelector('input').value;
    // the switch of the output
    const sw = card().querySelector(':scope > .row .switch');
    out.offAtStart = !sw.classList.contains('on'); sw.click(); await wait(300);
    out.onAfter = store.state.profile.output.on && card().querySelector(':scope > .row .switch').classList.contains('on');
    // a layer's switch
    L('grid').querySelector('.switch').click(); await wait(300);
    out.gridOn = layersNow().find((l) => l.id === 'grid').on;
    // reorder: the top row goes down, the bottom row goes up
    const up = (id) => L(id).querySelector('.xp-mv button[aria-label$="up"]'), down = (id) => L(id).querySelector('.xp-mv button[aria-label$="down"]');
    out.topUpDisabled = up(listed()[0]).disabled; out.bottomDownDisabled = down(listed().at(-1)).disabled;
    const before = profileTop();
    down(before[0]).click(); await wait(300);
    out.afterDown = { list: listed(), profile: profileTop() };
    up('experience').click(); await wait(300);
    out.afterUp = { list: listed(), profile: profileTop() };
    // opacity: a keyboard step, then a drag to the middle of the groove (one undo step on release)
    const op = () => L('touches').querySelector('.vfield[aria-label="Opacity"]');
    op().focus(); op().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await wait(300);
    out.opacityStep = layersNow().find((l) => l.id === 'touches').opacity;
    document.activeElement.blur(); await wait(200);
    const tr = op().querySelector('.vtrack').getBoundingClientRect();
    const pt = (k) => ({ clientX: tr.left + tr.width * k, clientY: tr.top + 1, button: 0, pointerId: 1, bubbles: true });
    op().dispatchEvent(new PointerEvent('pointerdown', pt(0.5))); dispatchEvent(new PointerEvent('pointerup', pt(0.5))); await wait(400);
    out.opacityDrag = layersNow().find((l) => l.id === 'touches').opacity;
    out.opacityShown = L('touches').querySelector('.vfield[aria-label="Opacity"]').closest('.row').querySelector('.vbox').textContent;
    // blend
    const bl = [...L('grid').querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'multiply'));
    out.blendOptions = [...bl.options].map((o) => o.textContent);
    bl.value = 'add'; bl.dispatchEvent(new Event('change')); await wait(300);
    out.blend = layersNow().find((l) => l.id === 'grid').blend;
    // the touch mask settings live in a fold, with faders
    const fold = L('touches').querySelector('details');
    out.fold = !!fold; out.foldOpenAtStart = fold.open;
    fold.open = true; await wait(100);
    out.foldFaders = [...L('touches').querySelectorAll('details .vfield')].map((f) => f.getAttribute('aria-label'));
    const rad = L('touches').querySelector('details .vfield[aria-label="Radius"]');
    rad.focus(); rad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(300);
    out.radius = layersNow().find((l) => l.id === 'touches').radius;
    out.rangeInputs = document.querySelectorAll('input[type=range]').length;
    document.activeElement.blur(); await wait(200); // (a panel with focus inside is not rebuilt under the operator's hands)
    // calibration mode: the banner, and it goes away with the grid
    out.bannerBefore = !!card().querySelector('.xp-calib');
    await cmd('projection.set', { grid: true }); await wait(400);
    out.banner = card().querySelector('.xp-calib')?.textContent || null; out.suspended = card().querySelector('.xp-layers').classList.contains('suspended');
    out.badge = card().querySelector('.head .badge')?.textContent;
    await cmd('projection.set', { grid: false }); await wait(400);
    out.bannerAfter = !!card().querySelector('.xp-calib');
    return out;`, { setup: (e) => withProbe(e) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.title, 'Output — VEATION Touch');
  assert.deepEqual(result.listed, result.profileTop, 'the list reads top to bottom: the first row is the top layer');
  assert.deepEqual(result.listed, ['grid', 'touches', 'media', 'experience'], 'by default the grid is on top, the clips (media) right above the experience at the bottom');
  assert.equal(result.sink, 'spout');
  assert.equal(result.sender, 'VEATION Touch');
  assert.equal(result.offAtStart, true); assert.equal(result.onAfter, true, 'the output switch sends output.set');
  assert.equal(result.gridOn, true, 'a layer\'s switch');
  assert.equal(result.topUpDisabled, true); assert.equal(result.bottomDownDisabled, true, 'nothing above the top, nothing below the bottom');
  assert.deepEqual(result.afterDown.list, ['touches', 'grid', 'media', 'experience'], '↓ on the top layer');
  assert.deepEqual(result.afterDown.profile, result.afterDown.list);
  assert.deepEqual(result.afterUp.list, ['touches', 'grid', 'experience', 'media'], '↑ on the bottom one (it swaps with the clips)');
  assert.deepEqual(result.afterUp.profile, result.afterUp.list);
  assert.equal(result.opacityStep, 0.99, 'a fader step');
  assert.equal(result.opacityDrag, 0.5, 'a drag to the middle of the groove');
  assert.equal(result.opacityShown, '50%');
  assert.deepEqual(result.blendOptions, ['Normal', 'Screen', 'Add', 'Multiply']);
  assert.equal(result.blend, 'add');
  assert.equal(result.fold, true); assert.equal(result.foldOpenAtStart, false, 'the mask settings are folded');
  assert.deepEqual(result.foldFaders, ['Radius', 'Soft edge', 'Trail']);
  assert.equal(result.radius, 0.085, 'a radius step (0.5 cm)');
  assert.equal(result.rangeInputs, 0, 'no native range inputs');
  assert.equal(result.bannerBefore, false);
  assert.match(result.banner, /Calibration mode — showing the grid and the touches/);
  assert.equal(result.suspended, true, 'the operator\'s layers are shown as set aside');
  assert.equal(result.badge, 'calibration');
  assert.equal(result.bannerAfter, false);
});

// ---------------------------------------------------------------------------------------------------- calibration feedback on the wall

/** Page helpers for reading pixels of a feedback canvas (output page: canvas.fb, projection page: #c) — as a script prefix. */
const FB_PROBE = `
  const px = (g, x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] }; };
  const isCyan = (q) => q.a > 140 && q.b > 170 && q.g > 140 && q.r < 140;
  const isAmber = (q) => q.a > 140 && q.r > 190 && q.g > 140 && q.g < 215 && q.b < 150;
  /** Fraction of the points of an arc (turns from 12 o'clock, clockwise) that are lit. Samples sit between the crosshair's axes. */
  const arcLit = (g, cx, cy, r, f0, f1, test, n = 36) => { let hit = 0, tot = 0; for (let i = 0; i < n; i++) { const f = f0 + (f1 - f0) * (i + 0.5) / n, a = -Math.PI / 2 + f * 2 * Math.PI; tot++; if (test(px(g, cx + r * Math.cos(a), cy + r * Math.sin(a)))) hit++; } return hit / tot; };
  const centroid = (g, w, h, test) => { const d = g.getImageData(0, 0, w, h).data; let n = 0, sx = 0, sy = 0; for (let i = 0; i < d.length; i += 4) if (test({ r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] })) { n++; sx += (i / 4) % w; sy += Math.floor(i / 4 / w); } return { n, x: n ? sx / n : null, y: n ? sy / n : null }; };
  const handFar = (wall, tgt) => ({ x: tgt.x + (tgt.x + 0.5 < wall.width - 0.15 ? 0.5 : -0.5), y: tgt.y });
`;

test('ui: output page — during a calibration the wall shows the hand, the filling ring, the capture radius, WAITING and the flash, on a layer of its own; the grid is not redrawn for them', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${FB_PROBE}
    for (let k = 0; k < 150 && !(window.__out && store.state && window.__out.layers().length >= 1); k++) await wait(100);
    const P = store.state.profile, s = P.output.scale, wall = P.walls[0], stage = document.getElementById('stage');
    const toPx = (x, y) => { const [cx, cy] = wallUvToCanvas(wall, x / wall.width, 1 - y / wall.height); return [cx * s, cy * s]; };
    await cmd('calib.start', { wallId: wall.id, force: true });
    for (let k = 0; k < 80 && !(store.status?.calib && window.__out.layers().length === 2); k++) await wait(100);
    const fb = stage.querySelector('canvas.fb'), g = fb.getContext('2d'), grid = stage.querySelector('[data-layer=grid]');
    const out = { size: [fb.width, fb.height], gridSize: [grid.width, grid.height] };
    const base = structuredClone(store.status.calib), tgt = base.targets[base.index];
    out.pm = wall.pixelRect.h / wall.height;
    const [tx, ty] = toPx(tgt.x, tgt.y), R = out.pm * 0.14 * s;

    // (1) the REAL path: a hand away from the target -> the engine sends its detections -> cyan on the feedback layer at its place
    const hand = handFar(wall, tgt), [hx, hy] = toPx(hand.x, hand.y);
    out.cyanBefore = centroid(g, fb.width, fb.height, isCyan).n;
    await cmd('sim.touch', { wallId: wall.id, x: hand.x, y: hand.y, id: 'h', down: true });
    for (let k = 0; k < 60 && !(store.live?.calibHands?.[wall.id]?.length); k++) await wait(50);
    await wait(350); // a few revolutions: the first one may catch the hand half-way in (a loaded machine shows it)
    await wait(150);
    out.liveHands = store.live?.calibHands?.[wall.id] || null;
    out.hand = centroid(g, fb.width, fb.height, isCyan); out.handAt = [hx, hy];
    out.plan = window.__out.plan().map((l) => l.id); // the mixer draws the feedback last: above every layer
    out.gridCyan = centroid(grid.getContext('2d'), grid.width, grid.height, isCyan).n;
    await cmd('sim.touch', { wallId: wall.id, x: 0, y: 0, id: 'h', down: false });
    for (let k = 0; k < 60 && store.live?.calibHands?.[wall.id]?.length; k++) await wait(50);
    await wait(150);
    out.cyanAfter = centroid(g, fb.width, fb.height, isCyan).n;

    // (2) synthetic snapshots, drawn synchronously (no live message can interleave): what each field of the session draws
    const draw = (patch) => { store.status = { ...store.status, calib: { ...base, captureRadiusM: 0.05, ...patch } }; store.live = { ...store.live, calibHands: undefined }; window.__out.drawFeedback(); };
    const lit = (p) => { draw({ progress: p, phase: 'holding' }); return arcLit(g, tx, ty, R * 1.35, 0, 1, isAmber); };
    out.ring = [0, 0.25, 0.5, 0.75, 1].map(lit);
    draw({ progress: 0.25, phase: 'holding' });
    out.quarter = { first: arcLit(g, tx, ty, R * 1.35, 0.02, 0.23, isAmber), rest: arcLit(g, tx, ty, R * 1.35, 0.27, 0.98, isAmber) };
    draw({ progress: 0, phase: 'release' }); out.release = arcLit(g, tx, ty, R * 1.35, 0, 1, isAmber);
    // capture radius
    const ringAt = (m) => { let m2 = 0; for (let dx = -1; dx <= 1; dx++) m2 = Math.max(m2, px(g, tx + m * out.pm * s + dx, ty).a); return m2; };
    draw({ progress: 0, captureRadiusM: 0.3 }); out.radiusOn = ringAt(0.3); draw({ progress: 0, captureRadiusM: 0.05 }); out.radiusMoved = ringAt(0.3);
    // WAITING
    const white = () => { const x0 = Math.round(tx - R * 3), y0 = Math.round(ty + R * 2.2); const d = g.getImageData(x0, y0, Math.round(R * 6), Math.round(R * 2.6)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 150 && d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n; };
    draw({ progress: 0, armed: false, phase: 'waiting' }); out.waiting = white();
    draw({ progress: 0, armed: true, phase: 'waiting' }); out.armed = white();
    // the flash: cyan when accepted, red-ish when it must be repeated, fading over 1.5 s
    const flashPx = (kind, ageMs) => { draw({ progress: 0, flash: { kind, index: base.index, ageMs } }); return px(g, tx + R * (1.1 + 1.8 * ageMs / 1500), ty); };
    out.flashAccept = flashPx('accept', 100); out.flashRetry = flashPx('retry', 100);
    out.flashLate = flashPx('accept', 1450);
    draw({ progress: 0 }); out.flashGone = px(g, tx + R * 1.2, ty).a;
    // a flash belongs to the target it was about, even after the session moved on to the next one
    draw({ progress: 0, index: base.targets.length > 1 ? 1 : 0, flash: { kind: 'accept', index: base.index, ageMs: 100 } }); out.flashOld = px(g, tx + R * (1.1 + 1.8 * 100 / 1500), ty);
    draw({ progress: 0 });

    // (3) the cost: dirty rectangles only, and the grid stays still while the feedback moves
    const calls = []; const orig = g.clearRect.bind(g); g.clearRect = (...a) => { calls.push(a); return orig(...a); };
    const nx = base.targets[base.index].x + 0.3, ny = base.targets[base.index].y;
    const step = (k) => {
      store.status = { ...store.status, calib: { ...base, progress: (k % 100) / 100, phase: 'holding', armed: true, captureRadiusM: 0.1, near: { x: nx, y: ny, distM: 0.3 - k / 1000 }, flash: k % 40 < 20 ? { kind: 'accept', index: base.index, ageMs: (k % 20) * 70 } : null } };
      store.live = { ...store.live, calibHands: { [wall.id]: [[nx, ny, 0.06]] } };
      window.__out.drawGrid(); window.__out.drawFeedback();
    };
    step(0); // (the first message of a phase may change what the grid shows)
    const stats0 = { ...window.__out.stats };
    const N = 120, t0 = performance.now();
    for (let k = 1; k <= N; k++) step(k);
    const ms = (performance.now() - t0) / N;
    g.clearRect = orig;
    const stats1 = window.__out.stats;
    out.redraws = { grid: stats1.gridDraws - stats0.gridDraws, feedback: stats1.feedback - stats0.feedback };
    out.perFrameMs = ms; out.clears = calls.length; out.biggestClear = Math.max(0, ...calls.map((c) => c[2] * c[3])); out.canvasArea = fb.width * fb.height;
    // a message with nothing new draws nothing
    const f0 = window.__out.stats.feedback; window.__out.drawFeedback(); window.__out.drawFeedback(); out.idleRedraws = window.__out.stats.feedback - f0;
    // the session ends: the operator's layers return (the grid is off here, so the feedback canvas goes with it)
    await cmd('calib.cancel');
    for (let k = 0; k < 60 && (store.status?.calib || window.__out.layers().length !== 1); k++) await wait(50);
    out.after = { inPage: document.contains(fb), canvases: stage.querySelectorAll('canvas').length };
    return out;`, {
    page: '/output?run=1', wait: 'load',
    setup: (e) => withLayers(e, [{ id: 'experience', on: true }, { id: 'touches', on: false }, { id: 'grid', on: false }]),
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.deepEqual(result.plan, ['touches', 'grid', 'feedback'], 'the feedback is drawn above every layer');
  assert.deepEqual(result.size, result.gridSize, 'and covers the same render size');
  assert.equal(result.cyanBefore, 0, 'no hand: nothing cyan');
  assert.ok(result.liveHands?.length >= 1, `the engine sends the hand (${JSON.stringify(result.liveHands)})`);
  assert.ok(result.hand.n >= 8, `a cyan disc is drawn for the hand (${result.hand.n} px)`);
  assert.ok(Math.hypot(result.hand.x - result.handAt[0], result.hand.y - result.handAt[1]) < 4, `at the hand's place: ${result.hand.x?.toFixed(1)}, ${result.hand.y?.toFixed(1)} vs ${result.handAt.map((v) => v.toFixed(1))}`);
  assert.equal(result.gridCyan, 0, 'the grid layer itself carries none of it');
  assert.equal(result.cyanAfter, 0, 'the hand leaves: its disc is cleared');
  assert.ok(result.ring[0] < 0.05 && result.ring[1] > 0.15 && result.ring[2] > result.ring[1] + 0.15 && result.ring[3] > result.ring[2] + 0.15 && result.ring[4] > 0.9, `the ring fills with progress: ${result.ring.map((v) => v.toFixed(2))}`);
  assert.ok(result.quarter.first > 0.8 && result.quarter.rest < 0.1, `from 12 o'clock, clockwise: ${JSON.stringify(result.quarter)}`);
  assert.ok(result.release > 0.9, `full while releasing (${result.release})`);
  assert.ok(result.radiusOn > 40 && result.radiusMoved < 10, `the capture radius is a faint ring at the radius given (${result.radiusOn} / ${result.radiusMoved})`);
  assert.ok(result.waiting > 20, `WAITING at the target when not armed (${result.waiting} px)`);
  assert.equal(result.armed, 0, 'and nothing once armed');
  assert.ok(result.flashAccept.b > result.flashAccept.r + 60 && result.flashAccept.a > 140, `accept flashes cyan ${JSON.stringify(result.flashAccept)}`);
  assert.ok(result.flashRetry.r > result.flashRetry.b + 50 && result.flashRetry.a > 140, `retry flashes another colour ${JSON.stringify(result.flashRetry)}`);
  assert.ok(result.flashLate.a < result.flashAccept.a * 0.5, 'the flash fades');
  assert.equal(result.flashGone, 0, 'and is cleared when the snapshot has none');
  assert.ok(result.flashOld.a > 20, 'a flash stays on the target it was about, after the session moved on');
  assert.deepEqual(result.redraws, { grid: 0, feedback: 120 }, 'the grid is NOT redrawn while the feedback moves; the feedback is, every time');
  assert.ok(result.clears >= 100 && result.biggestClear < result.canvasArea * 0.2, `only small rectangles are cleared (largest ${result.biggestClear} of ${result.canvasArea} px)`);
  assert.equal(result.idleRedraws, 0, 'a message that changes nothing redraws nothing');
  assert.ok(result.perFrameMs < 3, `cost per frame ${result.perFrameMs.toFixed(3)} ms`);
  assert.deepEqual(result.after, { inPage: false, canvases: 0 }, 'session over: the feedback canvas goes with the calibration layers');
  console.log(`  output feedback: ${result.perFrameMs.toFixed(3)} ms per frame (canvas ${result.size.join('x')})`);
});

test('ui: output page — verification: the ring fills and the flash answers on the check point', opt, async () => {
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const { wallUvToCanvas } = await import('/shared/geometry.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${FB_PROBE}
    for (let k = 0; k < 150 && !(window.__out && store.state && window.__out.layers().length >= 1); k++) await wait(100);
    const P = store.state.profile, s = P.output.scale, wall = P.walls[0], stage = document.getElementById('stage');
    await cmd('verify.start', { wallId: wall.id });
    for (let k = 0; k < 80 && !(store.status?.verify && window.__out.layers().length === 2); k++) await wait(100);
    const g = stage.querySelector('canvas.fb').getContext('2d');
    const base = structuredClone(store.status.verify), tgt = base.targets[base.index];
    const [cx, cy] = wallUvToCanvas(wall, tgt.x / wall.width, 1 - tgt.y / wall.height), tx = cx * s, ty = cy * s, R = (wall.pixelRect.h / wall.height) * 0.1 * s;
    const draw = (patch) => { store.status = { ...store.status, verify: { ...base, ...patch } }; window.__out.drawFeedback(); };
    const out = {};
    draw({ progress: 0.5, phase: 'holding' }); out.half = arcLit(g, tx, ty, R * 1.35, 0, 1, isAmber); out.firstHalf = arcLit(g, tx, ty, R * 1.35, 0.02, 0.48, isAmber);
    draw({ progress: 0.9 }); out.most = arcLit(g, tx, ty, R * 1.35, 0, 1, isAmber);
    draw({ progress: 0, flash: { kind: 'accept', index: base.index, ageMs: 0 } }); out.accept = px(g, tx + R * 1.1, ty);
    draw({ progress: 0, flash: { kind: 'retry', index: base.index, ageMs: 0 } }); out.retry = px(g, tx + R * 1.1, ty);
    await cmd('verify.cancel');
    return out;`, {
    page: '/output?run=1', wait: 'load',
    setup: (e) => withLayers(e, [{ id: 'experience', on: true }, { id: 'touches', on: false }, { id: 'grid', on: false }]),
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.ok(result.half > 0.35 && result.half < 0.65 && result.firstHalf > 0.8, `half ring at 50% (${result.half}, first half ${result.firstHalf})`);
  assert.ok(result.most > result.half + 0.25, 'and more at 90%');
  assert.ok(result.accept.b > result.accept.r + 60 && result.accept.a > 140, `accepted: cyan ${JSON.stringify(result.accept)}`);
  assert.ok(result.retry.r > result.retry.b + 50 && result.retry.a > 140, `repeat: red-ish ${JSON.stringify(result.retry)}`);
});

test('ui: projection page — the same feedback: the hand under calibration, the filling ring, the flash', opt, async () => {
  const noWanderers = async (engine) => { const p = structuredClone(engine.profile); p.simulation.wanderers = 0; await engine.command('profile.update', { profile: p, rev: engine.rev }); };
  const { result, errors } = await inUi(`
    const { store, cmd } = await import('/js/conn.js');
    const { uvToCanvas } = await import('/js/workspace.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${FB_PROBE}
    for (let k = 0; k < 50 && !store.state; k++) await wait(100);
    const P = store.state.profile, wall = P.walls[0], c = document.getElementById('c'), g = c.getContext('2d');
    const sx = () => c.width / P.canvas.width, sy = () => c.height / P.canvas.height;
    const toPx = (x, y) => { const [cx, cy] = uvToCanvas(wall, x / wall.width, 1 - y / wall.height); return [cx * sx(), cy * sy()]; };
    await cmd('calib.start', { wallId: wall.id, force: true });
    for (let k = 0; k < 80 && !store.status?.calib; k++) await wait(100);
    const base = structuredClone(store.status.calib), tgt = base.targets[base.index], out = {};
    window.__proj.draw();
    out.cyanBefore = centroid(g, c.width, c.height, isCyan).n;
    const hand = handFar(wall, tgt), [hx, hy] = toPx(hand.x, hand.y);
    await cmd('sim.touch', { wallId: wall.id, x: hand.x, y: hand.y, id: 'h', down: true });
    for (let k = 0; k < 60 && !(store.live?.calibHands?.[wall.id]?.length); k++) await wait(50);
    await wait(350); // a few revolutions: the first one may catch the hand half-way in (a loaded machine shows it)
    window.__proj.draw();
    out.hand = centroid(g, c.width, c.height, isCyan); out.handAt = [hx, hy];
    await cmd('sim.touch', { wallId: wall.id, x: 0, y: 0, id: 'h', down: false });
    for (let k = 0; k < 60 && store.live?.calibHands?.[wall.id]?.length; k++) await wait(50);
    // synthetic snapshots, drawn synchronously
    const [tx, ty] = toPx(tgt.x, tgt.y), R = (wall.pixelRect.h / wall.height) * 0.14 * sx();
    const draw = (patch) => { store.status = { ...store.status, calib: { ...base, captureRadiusM: 0.05, ...patch } }; store.live = { ...store.live, calibHands: undefined }; window.__proj.draw(); };
    out.ring = [0, 0.25, 0.5, 0.75].map((p) => { draw({ progress: p, phase: 'holding' }); return arcLit(g, tx, ty, R * 1.35, 0, 1, isAmber, 72); });
    draw({ progress: 0.25, phase: 'holding' }); out.quarter = { first: arcLit(g, tx, ty, R * 1.35, 0.02, 0.23, isAmber, 24), rest: arcLit(g, tx, ty, R * 1.35, 0.27, 0.98, isAmber, 24) };
    draw({ progress: 0, flash: { kind: 'accept', index: base.index, ageMs: 100 } }); out.accept = px(g, tx + R * (1.1 + 1.8 * 100 / 1500), ty);
    draw({ progress: 0, flash: { kind: 'retry', index: base.index, ageMs: 100 } }); out.retry = px(g, tx + R * (1.1 + 1.8 * 100 / 1500), ty);
    return out;`, { page: '/projection', wait: 'load', w: 2400, h: 304, setup: noWanderers }); // (the window keeps the canvas' aspect, so rings stay round)
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(result.cyanBefore, 0);
  assert.ok(result.hand.n >= 12, `the hand is a cyan disc (${result.hand.n} px)`);
  assert.ok(Math.hypot(result.hand.x - result.handAt[0], result.hand.y - result.handAt[1]) < 8, `at its place: ${result.hand.x?.toFixed(1)}, ${result.hand.y?.toFixed(1)} vs ${result.handAt.map((v) => v.toFixed(1))}`);
  assert.ok(result.ring[0] < 0.05 && result.ring[1] > 0.15 && result.ring[2] > result.ring[1] + 0.15 && result.ring[3] > result.ring[2] + 0.15, `the ring fills with progress: ${result.ring.map((v) => v.toFixed(2))}`);
  assert.ok(result.quarter.first > 0.7 && result.quarter.rest < 0.12, `clockwise from 12 o'clock: ${JSON.stringify(result.quarter)}`);
  assert.ok(result.accept.b > result.accept.r + 60 && result.accept.a > 140, `accepted: cyan ${JSON.stringify(result.accept)}`);
  assert.ok(result.retry.r > result.retry.b + 50 && result.retry.a > 140, `repeat: red-ish ${JSON.stringify(result.retry)}`);
});

// ---- calibration from a phone that does not drive the session: take control in the same tap, always a way out, a bad result is not the default

const OTHER_DEVICE = { id: 'other-device', device: 'the desktop' };
const fakeResult = (sid, rmsMm, maxMm, errs) => ({ [sid]: { ok: true, kind: 'homography', points: errs.length, rmsMm, maxMm, pairs: errs.map((errMm, index) => ({ index, sensor: [0, 0], wall: [0, 0], errMm })) } });

/** Engine setup: a calibration on P2 sitting at its result (a made-up one), driven by `owner` (null = nobody: this page is free to act). */
function resultSetup({ owner = OTHER_DEVICE, rms, max, errs }) {
  return async (engine) => {
    await engine.command('bg.capture', { frames: 5 });
    await new Promise((r) => setTimeout(r, 1500));
    engine.ops = [];
    const orig = engine.command.bind(engine);
    engine.command = (op, args) => { if (!/^(sim|projection|bg)\./.test(op)) engine.ops.push([op, { ...(args || {}), __client: undefined }]); return orig(op, args); };
    engine._applyCalibration = () => ({ applied: [] }); // the made-up result cannot be applied for real
    await orig('calib.start', { wallId: 'P2', cols: 2, rows: 2, force: true, __client: owner || undefined });
    const c = engine.calib, sid = c.sensorIds[0];
    c.feed = () => {};
    c.targets.forEach((t) => { t.captured = { [sid]: [0, 0] }; });
    c.phase = 'done'; c.index = c.targets.length;
    c.result = fakeResult(sid, rms, max, errs);
  };
}

const PAGE_HELPERS = `
  const { store } = await import('/js/conn.js');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const btns = () => [...document.querySelectorAll('#rBody button')];
  const find = (re) => btns().find((b) => re.test(b.innerText.trim()));
  const info = (b) => b ? { text: b.innerText.trim(), primary: b.classList.contains('r-primary'), h: b.getBoundingClientRect().height } : null;
  const until = async (f, n = 60) => { for (let k = 0; k < n && !f(); k++) await wait(100); };
  await until(() => document.querySelector('#rBody .r-primary'));
  const primaries = () => [...document.querySelectorAll('#rBody .r-primary')].map((e) => e.innerText.trim());
  const overlay = () => { const o = document.getElementById('overlay'); return o && !o.hidden ? o.innerText : null; };
  const overlayBtn = (re) => [...document.getElementById('overlay').querySelectorAll('button')].find((b) => re.test(b.innerText.trim()));
`;
const opNames = (engine) => engine.ops.map(([op]) => op);

test('ui: remote without control — a very bad result offers "Take control and start over": one tap does control.take, then the rest', opt, async () => {
  const { result, errors, engine } = await inUi(`${PAGE_HELPERS}
    const r = { primary: primaries(), apply: info(find(/apply & save/i)), exit: info(find(/^Exit calibration$/)) };
    find(/^Take control and start over$/).click();
    await until(() => store.status?.calib && store.status.calib.phase !== 'done' && store.status.control?.id === store.state.you);
    r.control = store.status?.control?.id === store.state?.you;
    r.restarted = !!store.status?.calib && store.status.calib.phase !== 'done';
    return r;`, { mobile: true, w: 390, h: 844, setup: resultSetup({ rms: 598, max: 818, errs: [818, 600, 400, 200] }) });
  assert.deepEqual(errors, []);
  assert.deepEqual(result.primary, ['Take control and start over'], 'a bad result is not saved by default; the button that is bound to fail is not shown as such');
  assert.equal(result.apply.primary, false, 'Apply & save is not the primary action');
  assert.match(result.apply.text, /^Take control and apply/i);
  assert.ok(result.exit && result.exit.h >= 48, `Exit calibration is there and finger-sized: ${JSON.stringify(result.exit)}`);
  assert.equal(result.control, true, 'this phone took control');
  assert.equal(result.restarted, true);
  const ops = opNames(engine);
  assert.ok(ops.indexOf('control.take') >= 0 && ops.indexOf('control.take') < ops.indexOf('calib.cancel') && ops.indexOf('calib.cancel') < ops.indexOf('calib.start'), `control first: ${ops}`);
  assert.equal(engine.ops.find(([op]) => op === 'calib.start')[1].armed, true, 'a phone starts armed: it is at the wall');
});

test('ui: remote without control — a few bad points: "Take control and redo worst point" is primary; Apply & save is secondary and asks first', opt, async () => {
  const { result, errors, engine } = await inUi(`${PAGE_HELPERS}
    const r = { primary: primaries(), apply: info(find(/apply & save/i)) };
    find(/apply & save/i).click();
    await until(() => overlay());
    r.asked = overlay();
    overlayBtn(/^Cancel$/).click();
    await wait(300);
    r.opsAfterDecline = true;
    find(/^Take control and redo worst point/).click();
    await until(() => store.status?.calib?.phase !== 'done');
    return r;`, { mobile: true, w: 390, h: 844, setup: resultSetup({ rms: 62, max: 130, errs: [130, 20, 20, 30] }) });
  assert.deepEqual(errors, []);
  assert.deepEqual(result.primary, ['Take control and redo worst point (#1)']);
  assert.equal(result.apply.primary, false);
  assert.match(result.asked, /off by 62 mm on average — hands will land 62 mm away\. Save it anyway\?/);
  const ops = opNames(engine);
  assert.ok(!ops.includes('calib.apply'), 'declining the question saves nothing');
  assert.equal(ops.filter((o) => o === 'control.take').length, 1, 'declining did not take control either; only the redo did');
  assert.ok(ops.indexOf('control.take') < ops.indexOf('calib.redo'), `control.take then calib.redo: ${ops}`);
  assert.equal(engine.ops.find(([op]) => op === 'calib.redo')[1].index, 0, 'the worst point');
});

test('ui: remote — with control, a bad result asks before saving; without control a good one is "Take control and apply & save"', opt, async () => {
  const bad = await inUi(`${PAGE_HELPERS}
    const r = { primary: primaries(), apply: info(find(/^Apply & save$/)) };
    find(/^Apply & save$/).click();
    await until(() => overlay());
    r.asked = overlay();
    overlayBtn(/^Save it anyway$/).click();
    await wait(500);
    return r;`, { mobile: true, w: 390, h: 844, setup: resultSetup({ owner: null, rms: 62, max: 130, errs: [130, 20, 20, 30] }) });
  assert.deepEqual(bad.errors, []);
  assert.deepEqual(bad.result.primary, ['Redo worst point (#1)']);
  assert.equal(bad.result.apply.primary, false);
  assert.match(bad.result.asked, /off by 62 mm/);
  assert.ok(opNames(bad.engine).includes('calib.apply'), 'saved once the operator insisted');
  assert.ok(!opNames(bad.engine).includes('control.take'), 'nothing to take: this phone is free to act');

  const good = await inUi(`${PAGE_HELPERS}
    const r = { primary: primaries() };
    find(/^Take control and apply & save$/).click();
    await until(() => store.status?.control?.id === store.state.you);
    await wait(300);
    r.overlay = overlay();
    return r;`, { mobile: true, w: 390, h: 844, setup: resultSetup({ rms: 6, max: 9, errs: [9, 5, 4, 3] }) });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.result.primary, ['Take control and apply & save']);
  assert.equal(good.result.overlay, null, 'a good result is saved without a question');
  const ops = opNames(good.engine);
  assert.ok(ops.indexOf('control.take') >= 0 && ops.indexOf('control.take') < ops.indexOf('calib.apply'), `control.take then calib.apply: ${ops}`);
});

test('ui: remote — "Exit calibration" is on every screen of a session (waiting, holding, release, result, verify) and cancels, with or without control', opt, async () => {
  const OTHER = OTHER_DEVICE;
  const { result, errors, engine } = await inUi(`${PAGE_HELPERS}
    const { cmd } = await import('/js/conn.js');
    const step = async () => { await cmd('sim.touch', { wallId: 'P2', x: 1, y: 1, id: '__step', down: false }); await wait(700); };
    const snap = () => ({ exit: info(find(/^Exit calibration$/)), primary: primaries(), near: document.querySelector('#rBody .r-near')?.innerText || '', nearShown: !document.querySelector('#rBody .r-near')?.hidden });
    const r = {};
    await until(() => document.querySelector('#rBody .r-primary'));
    r.waiting = snap();                                   // armed:false → "I'm at the wall — start"
    find(/^I.m at the wall/).click(); await wait(600);
    await step(); r.holding = snap();                     // the hand is 1.4 m from the target
    await step(); r.release = snap();
    find(/^Exit calibration$/).click(); await until(() => overlay());
    r.confirm = overlay();
    overlayBtn(/^Exit calibration$/).click();
    await until(() => !store.status?.calib);
    r.afterExit = { calib: !!store.status?.calib };
    await step(); r.result = snap();                      // a result the operator does not want
    await step(); r.verify = snap();
    await step(); r.verifyDone = snap();
    find(/^Exit calibration$/).click();
    await until(() => !store.status?.verify);
    r.afterVerifyExit = { verify: !!store.status?.verify };
    return r;`, {
    mobile: true, w: 390, h: 844,
    setup: async (engine) => {
      await engine.command('bg.capture', { frames: 5 });
      await new Promise((r) => setTimeout(r, 1500));
      engine.ops = [];
      const orig = engine.command.bind(engine);
      let n = 0;
      const steps = [
        () => { const c = engine.calib; c.feed = () => {}; c.phase = 'holding'; c.nearest = () => ({ x: 1, y: 1, distM: 1.4 }); },
        () => { const c = engine.calib, sid = c.sensorIds[0]; c.phase = 'release'; c.targets[0].captured = { [sid]: [0, 0] }; c.nearest = () => null; },
        async () => {
          await orig('calib.start', { wallId: 'P2', cols: 2, rows: 2, force: true, __client: OTHER });
          const c = engine.calib, sid = c.sensorIds[0];
          c.feed = () => {};
          c.targets.forEach((t) => { t.captured = { [sid]: [0, 0] }; });
          c.phase = 'done'; c.index = c.targets.length; c.result = fakeResult(sid, 598, 818, [818, 600, 400, 200]);
        },
        async () => { await orig('calib.cancel'); await orig('verify.start', { wallId: 'P2', __client: OTHER }); engine.verify.feed = () => {}; },
        () => { const v = engine.verify; v.targets.forEach((t, k) => { t.errMm = 10 + k; }); v.phase = 'done'; v.index = v.targets.length; },
      ];
      engine.command = async (op, args) => {
        if (op === 'sim.touch' && args?.id === '__step') { await steps[n++](); return {}; }
        if (!/^(sim|projection|bg)\./.test(op)) engine.ops.push([op, { ...(args || {}), __client: undefined }]);
        return orig(op, args);
      };
      await orig('calib.start', { wallId: 'P2', cols: 2, rows: 2, force: true, __client: OTHER }); // armed:false, like a session begun at the desktop
      engine.calib.feed = () => {};
    },
  });
  assert.deepEqual(errors, []);
  for (const k of ['waiting', 'holding', 'release', 'result', 'verify', 'verifyDone']) {
    assert.ok(result[k].exit, `${k}: "Exit calibration" is on the screen`);
    assert.ok(result[k].exit.h >= 48, `${k}: and at least 48 px tall (${result[k].exit.h})`);
    assert.equal(result[k].primary.length, 1, `${k}: still exactly one primary action (${JSON.stringify(result[k].primary)})`);
  }
  assert.deepEqual(result.waiting.primary, ['I’m at the wall — start']);
  assert.ok(opNames(engine).includes('calib.arm'), 'the button arms the session');
  assert.equal(result.holding.near, 'Your hand is 1.4 m from target 1 — move to the amber ring');
  assert.equal(result.release.near === '' || !result.release.nearShown, true, 'no hint once the hand is in place');
  assert.match(result.confirm, /Exit calibration of P2\? The 1 point captured so far is discarded/, 'asks first when points were captured');
  assert.equal(result.afterExit.calib, false, 'and cancels, although another device drives it');
  assert.deepEqual(result.result.primary, ['Take control and start over']);
  assert.equal(result.afterVerifyExit.verify, false);
  const ops = opNames(engine);
  assert.ok(!ops.includes('control.take'), 'leaving never needs control');
});

test('ui: desktop calibration result — a bad result makes Redo worst point / Start over the primary action; Apply & save asks first', opt, async () => {
  const run = (rms, max, errs) => inUi(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const v = window.__vt; v.go('calibrate');
    for (let k = 0; k < 40 && ![...document.querySelectorAll('#panel button')].some((b) => /Apply/.test(b.innerText)); k++) { await wait(100); v.go('calibrate'); }
    const panel = () => [...document.querySelectorAll('#panel button')];
    const r = { primary: panel().filter((b) => b.classList.contains('primary')).map((b) => b.innerText.trim()) };
    panel().find((b) => b.innerText.trim() === 'Apply & save' && !b.classList.contains('primary'))?.click();
    await wait(300);
    const o = document.getElementById('overlay');
    r.asked = o && !o.hidden ? o.innerText : null;
    if (r.asked) [...o.querySelectorAll('button')].find((b) => /^Cancel$/.test(b.innerText.trim())).click();
    return r;`, { setup: resultSetup({ owner: null, rms, max, errs }) });
  const few = await run(62, 130, [130, 20, 20, 30]);
  assert.deepEqual(few.errors, []);
  assert.deepEqual(few.result.primary, ['Redo worst point (#1)']);
  assert.match(few.result.asked, /off by 62 mm on average — hands will land 62 mm away\. Save it anyway\?/);
  assert.ok(!opNames(few.engine).includes('calib.apply'), 'declined: nothing saved');
  const many = await run(598, 818, [818, 600, 400, 200]);
  assert.deepEqual(many.errors, []);
  assert.deepEqual(many.result.primary, ['Start over']);
  assert.match(many.result.asked, /off by 598 mm/);
});

// ---------------------------------------------------------------------------------------------------- experience hands (live feed -> vt.hands)

test('ui: the live feed carries each touch\'s real reading (rx, ry, seenAt) and an experience gets the hand as a stroke from vt.hands()', opt, async () => {
  const { result, errors } = await inUi(`
    const { cmd, store, on } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 100 && !(window.__probe && store.state); k++) await wait(100);
    const pr = window.__probe, vt = pr.vt, wall = store.state.profile.walls[0];
    const tuples = [];
    on('live', (L) => { for (const list of Object.values(L.walls || {})) for (const t of list) tuples.push({ t: [...t], liveT: L.t }); });
    const x = wall.width * 0.4, y = wall.height * 0.5;
    for (let k = 0; k < 30; k++) { await cmd('sim.touch', { wallId: wall.id, x: x + k * 0.03, y, id: 'probe', down: true }); await wait(100); }
    const during = vt.hands();
    const out = { tuples: tuples.slice(-5), during, touches: vt.touches(), downs: pr.events.filter((e) => e.type === 'down'), strokes: [...new Set(pr.events.map((e) => e.stroke))] };
    await cmd('sim.touch', { wallId: wall.id, x, y, id: 'probe', down: false });
    for (let k = 0; k < 60 && vt.hands().length; k++) await wait(100);
    out.after = vt.hands(); out.ups = pr.events.filter((e) => e.type === 'up');
    return out;`, { page: '/experiences/touch-probe/index.html?run=1&fakeOut=1', wait: 'load', setup: (e) => withProbe(e, { play: true, scale: 0.25 }) });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.ok(result.tuples.length, 'live messages with a touch arrived');
  for (const { t, liveT } of result.tuples) {
    assert.equal(t.length, 8, `[id, x, y, size, coasting, rx, ry, seenAt]: ${JSON.stringify(t)}`);
    assert.ok(t.slice(5).every(Number.isFinite), 'the real reading is numbers');
    assert.ok(t[7] <= liveT, `seenAt is on the clock of live.t and not in its future (${t[7]} vs ${liveT})`);
    assert.ok(Math.abs(t[5] - t[1]) < 0.5 && Math.abs(t[6] - t[2]) < 0.5, 'rx, ry are the same hand as x, y');
  }
  assert.equal(result.during.length, 1, 'one hand in vt.hands()');
  const h = result.during[0];
  assert.equal(h.id, h.stroke, 'its stroke id is the id of the events');
  assert.ok(Number.isFinite(h.x) && Number.isFinite(h.vx) && h.size > 0 && h.wallId, 'with position, velocity (from the curve), size and wall');
  assert.equal(result.downs.length, 1, 'one down');
  assert.deepEqual(result.strokes, [result.downs[0].stroke], 'and the events all name the same stroke');
  assert.equal(result.touches.length, 1);
  assert.deepEqual(result.after, [], 'the hand is gone after the touch ends');
  assert.equal(result.ups.length, 1, 'with one up');
});
