// The phone's Live (MEDIA-SERVER.md §7; phase F11): the room remote's Live mode, checked in the REAL page on a phone-sized
// touch screen (hidden Electron window with touch emulation, tests/ui/runner.cjs --mobile) against a test engine with the
// bundled simulated room. The movies are generated tiny HAP files (tests/fixtures/media/make-hap.mjs); nothing is
// committed. The relay side (thumbnails pass, PCM never does, the size of the first state) is in tests/cloud.test.mjs.
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
import { makeHap } from './fixtures/media/make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const EXPERIENCE_FIXTURES = path.join(root, 'tests', 'fixtures', 'experiences');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: these tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(40); }
}

// what every script starts with: the page's helpers and a spy on the commands the page sends
const PRELUDE = `const v = window.__vt, RL = window.__vtLiveRemote, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { store, cmd } = await import('/js/conn.js');
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const x = fn(); if (x) return x; if (Date.now() - t0 > ms) return null; await wait(30); } };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sent = []; const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.type === 'cmd') sent.push(m.op); } catch {} return origSend.call(this, d); };
  const LIVE_OPS = /^(clip|column|layer|preset|experience|media|audio)\\./;
  const liveSent = () => sent.filter((op) => LIVE_OPS.test(op));
  const cellEl = (layerId, col) => $('#rLive [data-clip][data-layer="' + layerId + '"][data-col="' + col + '"]');
  const ptr = (el, type, x, y, target = el) => { const r = el.getBoundingClientRect(); target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: 'touch', button: 0, clientX: x ?? r.left + r.width / 2, clientY: y ?? r.top + r.height / 2 })); };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]');
`;

/**
 * A test engine (the simulated XR Lab room, no wandering hands, the light touch-probe experience installed and none
 * chosen) on a 390 × 844 touch screen; `setup(ctx)` prepares it (ctx.file makes a HAP on the "USB stick").
 * → {result, errors, engine}
 */
async function inRemote(script, { setup, shot = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rl-'));
  const usb = path.join(dir, 'usb');
  fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [EXPERIENCE_FIXTURES] });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = (name, bytes = makeHap({ frames: 12 }).bytes) => { const f = path.join(usb, name); fs.writeFileSync(f, bytes); return f; };
  try {
    await engine.command('experience.list');
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0;
    p.experience = normalizeProfile({}).experience;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    if (setup) await setup({ engine, file });
    const scriptFile = path.join(dir, 'script.js');
    fs.writeFileSync(scriptFile, PRELUDE + script);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/`, `--script=${scriptFile}`, '--w=390', '--h=844', '--mobile'];
    if (shot) args.push(`--shot=${shot}`);
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
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

/** A show: [file, layerId, column] imported as the desktop does, every copy finished. */
async function withShow(engine, file, list) {
  for (const [name, layerId, column, bytes] of list) {
    const r = await engine.command('media.import', { paths: [file(name, bytes)], target: { deckId: 'D1', layerId, column }, __local: true });
    assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected));
  }
  await until(() => [...engine.media.jobs.values()].every((j) => j.state === 'done'), 20000, 'the copies');
}
/** Edits the open show from the test (as another device would). */
async function editShow(engine, fn) {
  const s = structuredClone(engine.media.show);
  fn(s);
  await engine.command('show.update', { show: s, rev: engine.media.showRev });
}
/** Every wall calibrated and verified (the room is ready). */
async function readyRoom(engine) {
  const at = new Date().toISOString();
  let p = structuredClone(engine.profile);
  for (const s of p.sensors) s.calibration = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], kind: 'homography', rmsMm: 4, maxMm: 7, points: 9, at };
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  p = structuredClone(engine.profile); // (a new calibration clears the walls' verification: verify after it)
  for (const w of p.walls) w.verified = { at, meanMm: 6, maxMm: 9, n: 5, pass: true, worst: { x: 1, y: 1 } };
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  assert.ok(engine.profile.walls.every((w) => w.verified?.pass) && engine.profile.sensors.every((s) => s.calibration), 'the room is ready');
}
/** A 15 s movie (30 frames at 2 fps): its time left can be read. */
const longHap = (frames = 30) => makeHap({ frames, fps: 2 }).bytes;
const SHOW = (extra = []) => [['Reel.mov', 'L1', 0, longHap()], ['Loop A.mov', 'L2', 0, longHap(24)], ['Outro.mov', 'L1', 1, longHap(20)], ...extra];

const MODE_SCRIPT = `
  const out = { mode: v.mode, on: $('.r-modes button.on')?.innerText.trim(), live: shown($('#rLive')), calib: shown($('#rBody')), steps: shown($('.r-steps')),
    title: $('.r-title b').textContent, lockBtn: shown($('.rl-lockbtn')), stored: localStorage.getItem('vt-remote-mode') };
  // the operator switches: remembered on this device, and the next opening follows it
  const other = v.mode === 'live' ? 'calibrate' : 'live';
  $('.r-modes button[data-mode="' + other + '"]').click(); await wait(300);
  out.after = { mode: v.mode, live: shown($('#rLive')), calib: shown($('#rBody')), stored: localStorage.getItem('vt-remote-mode'), opening: v.openingMode() };
  return out;`;

test('remote: opens in Live in Show mode or with every wall calibrated and verified, in Calibrate in an uncalibrated room; a switch is remembered on the device', opt, async () => {
  // fails if: the opening mode ignores Show mode or the room's calibration (or always opens in one mode), the mode bar
  // does not switch what is drawn, or the choice is not remembered (the next opening must follow it)
  const fresh = await inRemote(MODE_SCRIPT);
  assert.deepEqual(fresh.errors, [], fresh.errors.join(' | '));
  assert.deepEqual({ ...fresh.result, after: undefined }, { mode: 'calibrate', on: 'Calibrate', live: false, calib: true, steps: true, title: 'Calibration', lockBtn: false, stored: null, after: undefined },
    'an uncalibrated room opens in Calibrate, as the remote always did');
  assert.deepEqual(fresh.result.after, { mode: 'live', live: true, calib: false, stored: 'live', opening: 'live' }, 'the switch is remembered');
  const show = await inRemote(MODE_SCRIPT, { setup: ({ engine }) => engine.command('app.lock', { locked: true }) });
  assert.deepEqual(show.errors, []);
  assert.deepEqual({ ...show.result, after: undefined }, { mode: 'live', on: 'Live', live: true, calib: false, steps: false, title: 'Live', lockBtn: true, stored: null, after: undefined }, 'Show mode opens in Live');
  assert.deepEqual(show.result.after, { mode: 'calibrate', live: false, calib: true, stored: 'calibrate', opening: 'calibrate' });
  const ready = await inRemote('return { mode: v.mode, opening: v.openingMode() };', { setup: ({ engine }) => readyRoom(engine) });
  assert.deepEqual(ready.errors, []);
  assert.deepEqual(ready.result, { mode: 'live', opening: 'live' }, 'a room that is ready opens in Live');
});

test('remote Live: a tap on a cell sends clip.trigger and NOW shows the clip with its time left — the same buttons, never rebuilt; the X ejects; a long press shows the details and launches nothing; the list view is remembered', opt, async () => {
  // fails if: a tap does not send clip.trigger, NOW does not show the clip and a "−m:ss" time left, the cell or the X is
  // a new DOM node after the launch (a rebuild under the finger), the X does not send layer.clear, a long press
  // launches or shows no details (name, duration, end), or the list view is not remembered
  const { result, errors } = await inRemote(`
    v.setMode('live'); await wait(300);
    const out = {};
    const cell = cellEl('L1', 0), row = $('.rl-nrow[data-layer="L1"]'), x = row.querySelector('.rl-nx');
    out.before = { rowHidden: row.hidden, idle: shown($('.rl-nidle')), cellH: cell.getBoundingClientRect().height, cols: $$('#rLive .rl-group').map((g) => g.dataset.col) };
    cell.click();
    await until(() => !row.hidden && cell.classList.contains('live'), 4000);
    await wait(700);
    out.after = { sent: liveSent(), rowName: row.querySelector('.rl-nc').textContent, left: row.querySelector('.rl-nleft').textContent, live: cell.classList.contains('live'),
      cellLeft: cell.querySelector('.rl-cleft').textContent, sameCell: cell === cellEl('L1', 0) && cell.isConnected, sameX: x === $('.rl-nrow[data-layer="L1"] .rl-nx') && x.isConnected,
      sameRow: row === $('.rl-nrow[data-layer="L1"]'), idle: shown($('.rl-nidle')) };
    x.click();
    await until(() => row.hidden, 4000);
    out.eject = { sent: liveSent().slice(-1)[0], rowHidden: row.hidden, live: cell.classList.contains('live'), engine: !!store.state.media.layers.L1.play };
    // a long press: the details, read-only — and no launch
    const n0 = liveSent().length, other = cellEl('L2', 0);
    ptr(other, 'pointerdown'); await wait(700); ptr(other, 'pointerup'); other.click(); await wait(300);
    const ov = $('#overlay');
    out.long = { overlay: !ov.hidden, text: ov.innerText, sent: liveSent().slice(n0), live: !!store.state.media.layers.L2.play };
    ov.querySelector('header button').click();
    // the list view (Mitti): one clip per row, remembered on this phone
    $('#rLive .rl-views button[data-view="list"]').click(); await wait(200);
    out.list = { rows: $$('#rLive .rl-lrow').length, cells: $$('#rLive .rl-cell').length, stored: localStorage.getItem('vt-remote-live-view'), sub: $('#rLive .rl-lrow small').textContent };
    return out;`, {
    setup: async ({ engine, file }) => {
      await withShow(engine, file, SHOW());
      await editShow(engine, (s) => { s.layers.find((l) => l.id === 'L1').end = 'clear'; }); // L1 plays once: a bar and the time left
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.before.rowHidden, true);
  assert.equal(result.before.idle, true, 'NOW says nothing plays');
  assert.ok(result.before.cellH >= 64, `cells are at least 64 px (${result.before.cellH})`);
  assert.deepEqual(result.before.cols, ['0', '1'], 'grouped by the show\'s columns');
  assert.deepEqual(result.after.sent, ['clip.trigger']);
  assert.equal(result.after.rowName, 'Reel');
  assert.match(result.after.left, /^−0:1\d$/, `the time left of a 15 s clip (${result.after.left})`);
  assert.match(result.after.cellLeft, /^−0:1\d$/);
  assert.equal(result.after.live, true);
  assert.equal(result.after.idle, false);
  assert.equal(result.after.sameCell, true, 'the cell under the finger is the same node');
  assert.equal(result.after.sameX, true, 'the X in NOW is the same node');
  assert.equal(result.after.sameRow, true);
  assert.deepEqual(result.eject, { sent: 'layer.clear', rowHidden: true, live: false, engine: false });
  assert.equal(result.long.overlay, true, 'a long press opens the details');
  assert.match(result.long.text, /Loop A/);
  assert.match(result.long.text, /Duration\s+0:12/);
  assert.match(result.long.text, /End\s+Loop \(layer default\)/);
  assert.match(result.long.text, /Edit the clip on the computer/);
  assert.deepEqual(result.long.sent, [], 'a long press launches nothing');
  assert.equal(result.long.live, false);
  assert.deepEqual({ ...result.list, sub: undefined }, { rows: 3, cells: 0, stored: 'list', sub: undefined });
  assert.match(result.list.sub, /^Layer 2 · 0:12 · loops$/);
});

test('remote Live: BLACKOUT needs a 0.6 s hold — a short tap does nothing; while on it is amber and a tap lifts it', opt, async () => {
  // fails if: a short tap (or a release under 0.6 s) blacks the room out, the hold does not, the release of the hold
  // lifts it again at once, the button is not amber while on, or a tap does not lift it
  const { result, errors } = await inRemote(`
    v.setMode('live'); await wait(300);
    const bo = $('#rLive .rl-blackout'), out = {};
    ptr(bo, 'pointerdown'); await wait(250); ptr(bo, 'pointerup'); bo.click(); await wait(400);
    out.short = { sent: liveSent(), on: !!store.state.media.blackout };
    ptr(bo, 'pointerdown'); await wait(350);
    out.filling = bo.classList.contains('holding');
    await wait(450);
    ptr(bo, 'pointerup'); bo.click(); // the release of the hold is a click too: it must not lift it
    await until(() => store.state.media.blackout, 3000); await wait(300);
    out.held = { sent: liveSent(), on: !!store.state.media.blackout, text: bo.innerText.trim(), bg: getComputedStyle(bo).backgroundColor, nowLine: shown($('.rl-bo-line')) };
    await wait(1600);
    bo.click();
    await until(() => !store.state.media.blackout, 3000);
    out.lifted = { sent: liveSent().slice(-1)[0], on: !!store.state.media.blackout, text: bo.innerText.trim() };
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.short, { sent: [], on: false }, 'a short tap does nothing');
  assert.equal(result.filling, true, 'the fill shows the hold');
  assert.deepEqual(result.held, { sent: ['media.blackout'], on: true, text: 'BLACKOUT ON · tap to lift', bg: 'rgb(229, 181, 103)', nowLine: true });
  assert.deepEqual(result.lifted, { sent: 'media.blackout', on: false, text: 'Hold for BLACKOUT' });
});

test('remote Live: with the screen locked no tap sends a command — cells, NOW, cards, master, blackout — until the bar is slid to its end', opt, async () => {
  // fails if: any Live control sends a command while the screen is locked (the guard is in the code, not only the
  // shield over the screen), a half slide unlocks, or the full slide does not
  const { result, errors } = await inRemote(`
    v.setMode('live'); await wait(300);
    const out = {};
    cellEl('L2', 0).click(); await until(() => !$('.rl-nrow[data-layer="L2"]').hidden, 4000);
    const n0 = liveSent().length;
    $('.rl-lockbtn').click(); await wait(100);
    out.locked = { api: RL.locked, shield: shown($('.rl-shield')), stored: localStorage.getItem('vt-remote-lock') };
    cellEl('L1', 0).click();
    $('.rl-nrow[data-layer="L2"] .rl-nx').click();
    $$('#rLive .rl-card').forEach((c) => c.click());
    $('#rLive .rl-colgo').click();
    $$('#rLive .rl-step').forEach((b) => b.click());
    $('#rLive .rl-mute').click();
    const bo = $('#rLive .rl-blackout'); ptr(bo, 'pointerdown'); await wait(800); ptr(bo, 'pointerup');
    const tr = $('#rLive .rl-master .vtrack'), r = tr.getBoundingClientRect(), f = $('#rLive .rl-master .vfield');
    ptr(f, 'pointerdown', r.left + r.width * 0.2); ptr(f, 'pointermove', r.left + r.width * 0.25, undefined, window); ptr(f, 'pointerup', undefined, undefined, window);
    await wait(500);
    out.whileLocked = { sent: liveSent().slice(n0), blackout: !!store.state.media.blackout, L2: !!store.state.media.layers.L2.play, mute: store.state.profile.audio.mute };
    // half a slide: still locked; the whole slide: unlocked
    const s = $('.rl-slide'), sr = s.getBoundingClientRect();
    ptr(s, 'pointerdown', sr.left + 10); ptr(s, 'pointermove', sr.left + sr.width * 0.5, undefined, window); ptr(s, 'pointerup', sr.left + sr.width * 0.5, undefined, window);
    out.half = RL.locked;
    ptr(s, 'pointerdown', sr.left + 10); ptr(s, 'pointermove', sr.left + sr.width * 0.97, undefined, window); ptr(s, 'pointerup', sr.left + sr.width * 0.97, undefined, window);
    await wait(100);
    out.unlocked = { api: RL.locked, shield: shown($('.rl-shield')), stored: localStorage.getItem('vt-remote-lock') };
    cellEl('L1', 0).click(); await wait(300);
    out.afterUnlock = liveSent().slice(n0);
    return out;`, { setup: ({ engine, file }) => withShow(engine, file, SHOW()) });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.locked, { api: true, shield: true, stored: '1' });
  assert.deepEqual(result.whileLocked, { sent: [], blackout: false, L2: true, mute: false }, 'locked: nothing reaches the engine');
  assert.equal(result.half, true, 'half a slide keeps it locked');
  assert.deepEqual(result.unlocked, { api: false, shield: false, stored: '0' });
  assert.deepEqual(result.afterUnlock, ['clip.trigger'], 'unlocked, a tap launches again');
});

test('remote Live: experience cards load with a tap, None unloads; the master fader sets the room level and Mute mutes; grid editing, import, Advanced Output and routing say "Edit on the computer"; no native range input', opt, async () => {
  // fails if: a card does not send experience.play / preset.unload, the fader does not reach audio.set master, Mute
  // does not send audio.mute, the read-only list is missing, a card is under 64 px, or a native range input appears
  const { result, errors } = await inRemote(`
    v.setMode('live'); await wait(300);
    const out = {};
    const card = (kind, id) => $('#rLive .rl-card[data-kind="' + kind + '"][data-id="' + id + '"]');
    out.cards = $$('#rLive .rl-card').map((c) => [c.dataset.kind, c.dataset.id, Math.round(c.getBoundingClientRect().height)]);
    card('experience', 'touch-probe').click();
    await until(() => card('experience', 'touch-probe').classList.contains('live') || store.state.experience?.running, 5000); await wait(300);
    out.play = { sent: liveSent(), xname: $('.rl-xname').textContent, live: card('experience', 'touch-probe').classList.contains('live') };
    card('none', 'none').click(); await wait(500);
    out.none = liveSent().slice(-1)[0];
    const tr = $('#rLive .rl-master .vtrack'), r = tr.getBoundingClientRect(), f = $('#rLive .rl-master .vfield');
    ptr(f, 'pointerdown', r.left + r.width * 0.3); ptr(f, 'pointermove', r.left + r.width * 0.3, undefined, window); ptr(f, 'pointerup', undefined, undefined, window);
    await until(() => Math.abs(store.state.profile.audio.master - 0.3) < 0.02, 3000); await wait(200);
    out.master = { value: store.state.profile.audio.master, box: $('#rLive .rl-master .vbox').innerText.replace(/\\s+/g, '') };
    $('#rLive .rl-mute').click();
    await until(() => store.state.profile.audio.mute, 3000); await wait(200);
    out.mute = { on: store.state.profile.audio.mute, text: $('#rLive .rl-mute').innerText };
    out.ro = $$('#rLive .rl-roitem').map((e) => e.innerText.replace(/\\s+/g, ' ').trim());
    out.range = $$('input[type=range]').length;
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.ok(result.cards.some(([k, id]) => k === 'experience' && id === 'touch-probe'), 'without a show, the installed experiences are cards');
  assert.deepEqual(result.cards.at(-1).slice(0, 2), ['none', 'none'], '…then None');
  assert.ok(result.cards.every(([, , hpx]) => hpx >= 64), `cards are big: ${JSON.stringify(result.cards)}`);
  assert.deepEqual(result.play.sent, ['experience.play']);
  assert.equal(result.play.xname, 'Touch probe', 'NOW names the live experience');
  assert.equal(result.none, 'preset.unload');
  assert.ok(Math.abs(result.master.value - 0.3) < 0.02, `master ${result.master.value}`);
  assert.equal(result.master.box, '30%');
  assert.deepEqual(result.mute, { on: true, text: 'Muted' });
  assert.deepEqual(result.ro, ['Import media Edit on the computer', 'Edit the grid Edit on the computer', 'Advanced Output Edit on the computer', 'Audio routing Edit on the computer']);
  assert.equal(result.range, 0, 'no knob-and-dot sliders');
});
