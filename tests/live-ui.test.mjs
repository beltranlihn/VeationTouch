// Live in the desktop app (MEDIA-SERVER.md §4b.3, §4b.4, §4d.3; phase F8): the clip grid, the layer strip, the shelf,
// the inspector, the library drawer, drag and drop, Problems and the keyboard — checked in the REAL operator UI
// (hidden Electron window, tests/ui/runner.cjs) against a test engine with the bundled simulated room. The movies are
// generated tiny HAP files (tests/fixtures/media/make-hap.mjs, 256×32); nothing is committed. A slow "USB stick"
// (tests/fixtures/media/fake-source.mjs) makes a copy last long enough to be seen.
// Each test says what breaks it ("fails if …").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import * as place from '../ui/js/live/place.js';
import { makeHap } from './fixtures/media/make-hap.mjs';
import { demoHap } from './fixtures/media/make-demo.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const PRELOAD = path.join(root, 'app', 'main-preload.cjs');
const FAKE = pathToFileURL(path.join(root, 'tests', 'fixtures', 'media', 'fake-source.mjs')).href;
const EXPERIENCE_FIXTURES = path.join(root, 'tests', 'fixtures', 'experiences');
const MB = 1024 * 1024;
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: these tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms, what) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(40); }
}

/** A 15 s movie (30 frames at 2 fps): long enough for a play indicator to be read. */
const longHap = () => makeHap({ frames: 30, fps: 2 }).bytes;

// what every script starts with: the page's helpers, Live open
const PRELUDE = `const L = window.__vtLive, v = window.__vt, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { store, cmd } = await import('/js/conn.js');
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const x = fn(); if (x) return x; if (Date.now() - t0 > ms) return null; await wait(30); } };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cellEl = (layerId, col) => $('.lv-cell[data-layer="' + layerId + '"][data-col="' + col + '"]');
  const mid = (el, at = 0.5) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width * at, clientY: r.top + r.height / 2 }; };
  const drop = (target, list, o = {}) => { const dt = new DataTransfer(); for (const f of list) dt.items.add(f); for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...mid(target), ...o })); };
  const dragTo = (from, to, o = {}) => { const dt = new DataTransfer(); from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    for (const type of ['dragenter', 'dragover', 'drop']) to.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...mid(to), ...o })); from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); };
  const key = (k, o = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  v.go('live'); await wait(200);
`;

/**
 * A test engine (bundled profiles → the simulated XR Lab room; no wandering hands; the light touch-probe experience
 * installed and no experience chosen, so no heavy page runs) and a "USB stick" folder; `setup(ctx)` prepares it;
 * `script` (or script(ctx)) runs in the UI → {result, errors, engine, ctx}.
 * `media`: the media server's test seams (sourceOptions: a slow source, copies that can be watched).
 */
async function inLive(script, { setup, media = {}, preload = true, files = null, shot = null, w = 1440, h = 900 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-live-'));
  const usb = path.join(dir, 'usb');
  fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [EXPERIENCE_FIXTURES], media: { sourceOpener: FAKE, ...media } });
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
    const ctx = { engine, usb, file, dir };
    if (setup) await setup(ctx);
    const scriptFile = path.join(dir, 'script.js');
    fs.writeFileSync(scriptFile, PRELUDE + (typeof script === 'function' ? script(ctx) : script));
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/`, `--script=${scriptFile}`, `--w=${w}`, `--h=${h}`];
    if (preload) args.push(`--preload=${PRELOAD}`);
    if (files) args.push(`--files=${files(ctx).join('|')}`);
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
    return { ...data, engine, ctx };
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Imports [file, target] pairs into the room's show (made on the first one) and waits for every copy to finish. */
async function imported(engine, list) {
  for (const [f, target] of list) {
    const r = await engine.command('media.import', { paths: [f], target, __local: true });
    assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected));
  }
  await until(() => [...engine.media.jobs.values()].every((j) => j.state === 'done'), 20000, 'the copies');
  return engine.media.show;
}

/** Edits the open show from the test (as another device would). */
async function editShow(engine, fn) {
  const s = structuredClone(engine.media.show);
  fn(s);
  await engine.command('show.update', { show: s, rev: engine.media.showRev });
}

// ---------------------------------------------------------------------------------------------- end to end

test('live: drop a HAP on a cell → copying (grey) → ready (cyan) → launch (live, ring) → eject; a non-HAP drop lists the exact messages once and makes no cell', opt, async () => {
  // fails if: the drop does not send media.import with the cell (no clip in L1:1), the refused files are not listed
  // with the table's exact words (or a cell is made of them), the cell does not go through copying → ready, the
  // thumbnail does not launch, the live cell has no live class / no ring, or the X does not eject.
  const { result, errors, engine } = await inLive(`
    const files = $('#__vtFiles').files; // Reel.mov, clip.mp4, fake.mov
    const out = {};
    // the refused ones: ONE panel with the exact messages; no cell, no clip
    drop(cellEl('L2', 0), [files[1], files[2]]);
    await until(() => $('.lv-report'));
    out.report = { n: $$('.lv-report').length, title: $('.lv-report header b')?.textContent, items: $$('.lv-report .lv-rejected li').map((li) => li.innerText) };
    await wait(200);
    out.afterRefused = { cells: $$('.lv-cell[data-clip]').length, clips: store.state.show?.clips.length ?? null };
    // the movie, on the second column of the bottom layer
    drop(cellEl('L1', 1), [files[0]]);
    await until(() => cellEl('L1', 1)?.dataset.clip);
    const cell = () => cellEl('L1', 1);
    out.copying = !!(await until(() => cell().classList.contains('st-copying'), 6000));
    out.copyingDot = $('.lv-name .dot', cell()).className;
    out.copyingBand = $('.lv-copy em', cell()).textContent;
    out.drawerLine = $('.lv-copyline .txt').textContent;
    out.ready = !!(await until(() => cell().classList.contains('st-ready'), 20000));
    out.readyDot = $('.lv-name .dot', cell()).className;
    out.selected = cell().classList.contains('sel'); // the first clip of a drop is selected: its settings are at hand
    // launch: the picture
    $('.lv-thumb', cell()).click();
    out.live = !!(await until(() => cell().classList.contains('live'), 4000));
    L.paint();
    out.liveCls = { ring: cell().classList.contains('ind-ring'), bar: cell().classList.contains('ind-bar'), onAir: $('.lv-row[data-layer="L1"]').classList.contains('on-air') };
    out.phShown = getComputedStyle($('.lv-ph', cell())).display;
    out.border = getComputedStyle(cell()).borderTopColor;
    // eject: the layer's X
    $('.lv-row[data-layer="L1"] .lv-x').click();
    out.ejected = !!(await until(() => !cell().classList.contains('live') && !store.state.media.layers.L1.play, 4000));
    return out;`, {
    media: { sourceOptions: { tail: { 'Reel.mov': 40 * MB }, delayMs: 220 } },
    files: ({ file }) => [file('Reel.mov', longHap()), file('clip.mp4', new Uint8Array(4096).fill(7)), file('fake.mov', makeHap({ fourcc: 'avc1' }).bytes)],
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.report.n, 1, 'one panel, not one per file');
  assert.equal(result.report.title, '2 files were not imported');
  assert.equal(result.report.items.length, 2, 'one line per refused file');
  assert.ok(result.report.items[0].includes('clip.mp4') && result.report.items[1].includes('fake.mov'), `the engine's own words, one per file: ${JSON.stringify(result.report.items)}`);
  assert.deepEqual(result.afterRefused, { cells: 0, clips: 0 }, 'no cell, no clip from refused files');
  assert.equal(result.copying, true, 'the cell shows the copy');
  assert.equal(result.copyingDot, 'dot', 'grey dot while copying');
  assert.match(result.copyingBand, /^(Copying \d+ %|Waiting)$/);
  assert.match(result.drawerLine, /^Copying 1 of 1 · [\d.]+ (KB|MB) \/ [\d.]+ MB( · \d+ (s|min) left)?$/, `the drawer: ${result.drawerLine}`);
  assert.equal(result.ready, true);
  assert.equal(result.readyDot, 'dot live', 'cyan dot once in the library');
  assert.equal(result.selected, true);
  assert.equal(result.live, true, 'the picture launched it');
  assert.deepEqual(result.liveCls, { ring: true, bar: false, onAir: true }, 'a looping clip: a loop (the playhead goes back to the start)');
  assert.equal(result.phShown, 'block', 'the playhead line crosses the live cell');
  assert.equal(result.border, 'rgb(79, 195, 232)', 'cyan = live');
  assert.equal(result.ejected, true, 'the X ejected the layer');
  const show = engine.media.show;
  assert.equal(show.decks[0].cells['L1:1'], show.clips[0].id, 'the clip went where it was dropped');
});

// ---------------------------------------------------------------------------------------------- the grid

test('live: picture = launch, name = select only; a column head launches the column; a one-shot shows a bar and the time left; ← / → step columns, Delete ejects; progress never asks the engine', opt, async () => {
  // fails if: selecting launches (the name click changes the transport), the column head does not send column.trigger,
  // a clip that ends shows a ring instead of the bar + time, the arrows do not step columns, Delete does not eject the
  // selected layer, or painting the indicators sends anything to the engine (it must use the clock and the play).
  const { result, errors } = await inLive(`
    const out = {};
    // a spy on what the page sends
    const sent = []; const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.type === 'cmd') sent.push(m.op); } catch {} return orig.call(this, d); };
    const rev0 = store.state.media.rev;
    $('.lv-name', cellEl('L1', 0)).click(); await wait(300);
    out.name = { sel: cellEl('L1', 0).classList.contains('sel'), live: cellEl('L1', 0).classList.contains('live'), sameRev: store.state.media.rev === rev0, sent: [...sent],
      inspector: $('#panel .lv-ititle')?.textContent, launchBtn: !![...$$('#panel button')].find((b) => b.innerText === 'Launch') };
    $('.lv-thumb', cellEl('L1', 0)).click();
    out.picture = !!(await until(() => cellEl('L1', 0).classList.contains('live'), 3000));
    // the second column: its head
    $$('.lv-col')[1].click();
    out.column = !!(await until(() => cellEl('L1', 1).classList.contains('live') && !store.state.media.layers.L2.play, 3000));
    out.colHead = $$('.lv-col')[1].classList.contains('live');
    await wait(400); L.paint();
    const c = cellEl('L1', 1);
    out.oneShot = { bar: c.classList.contains('ind-bar'), ring: c.classList.contains('ind-ring'), width: parseFloat($('.lv-ph', c).style.left), left: $('.lv-left', c).textContent, phShown: getComputedStyle($('.lv-ph', c)).display };
    // the indicator moves with the clock, and painting it sends nothing
    sent.length = 0;
    const w0 = parseFloat($('.lv-ph', c).style.left);
    for (let k = 0; k < 6; k++) { await wait(120); L.paint(); }
    out.moves = parseFloat($('.lv-ph', c).style.left) > w0;
    out.paintSent = [...sent];
    // ← back to the first column (both layers), → again
    key('ArrowLeft');
    out.left = !!(await until(() => cellEl('L1', 0).classList.contains('live') && cellEl('L2', 0).classList.contains('live'), 3000));
    key('ArrowRight');
    out.right = !!(await until(() => cellEl('L1', 1).classList.contains('live'), 3000));
    key('ArrowLeft');
    await until(() => cellEl('L2', 0).classList.contains('live'), 3000);
    // Delete ejects the layer of the selected clip, only that one
    $('.lv-name', cellEl('L2', 0)).click(); await wait(100);
    key('Delete');
    out.deleted = !!(await until(() => !store.state.media.layers.L2.play, 3000));
    out.l1Still = !!store.state.media.layers.L1.play;
    out.ranges = document.querySelectorAll('input[type=range]').length;
    return out;`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov', longHap()), { layerId: 'L1', column: 0 }], [file('B.mov', makeHap({ frames: 20, fps: 4 }).bytes), { layerId: 'L2', column: 0 }], [file('C.mov', makeHap({ frames: 40, fps: 2 }).bytes), { layerId: 'L1', column: 1 }]]);
      await editShow(engine, (s) => { s.clips.find((c) => c.name === 'C').end = 'hold'; });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.name, { sel: true, live: false, sameRev: true, sent: [], inspector: 'A', launchBtn: true }, 'the name selects (the inspector shows the clip) and launches nothing');
  assert.equal(result.picture, true, 'the picture launches');
  assert.equal(result.column, true, 'the column head launched column 2 (L2 has nothing there: ejected)');
  assert.equal(result.colHead, true, 'the launched column is lit');
  assert.equal(result.oneShot.bar, true, 'a clip that ends: the bar');
  assert.equal(result.oneShot.ring, false);
  assert.equal(result.oneShot.phShown, 'block', 'the playhead line is on the live cell');
  assert.ok(result.oneShot.width > 0 && result.oneShot.width < 20, `bar ${result.oneShot.width} %`);
  assert.match(result.oneShot.left, /^−0:(19|20)$/, `time left of a 20 s clip: ${result.oneShot.left}`);
  assert.equal(result.moves, true, 'the bar follows the clock');
  assert.deepEqual(result.paintSent, [], 'the indicators never ask the engine');
  assert.equal(result.left, true, '← = previous column');
  assert.equal(result.right, true, '→ = next column');
  assert.equal(result.deleted, true, 'Delete ejected the selected layer');
  assert.equal(result.l1Still, true, '...and only that one');
  assert.equal(result.ranges, 0);
});

test('live: right-click on a column head makes it the room\'s start column (show.start, START on its head) without launching it; again: not any more; Show mode locks it', opt, async () => {
  // fails if: the column menu does not write show.start {deckId, column} (the room would not start by itself — the engine
  // reads it at boot: tests/media-restart.test.mjs), the head is not marked, the right-click launches the column, the
  // start cannot be taken back, or Show mode lets the start be changed.
  const { result, errors } = await inLive(`
    const out = {};
    const head = (c) => $$('.lv-col')[c];
    const menuOn = async (c) => { head(c).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return until(() => $('.lv-menu')); };
    await menuOn(1);
    out.items = $$('.lv-menu button').map((b) => b.innerText);
    $$('.lv-menu button').find((b) => /Start the room with column 2/.test(b.innerText)).click();
    await until(() => store.state.show.start.column === 1 && head(1)?.classList.contains('start'));
    out.start = { deckId: store.state.show.start.deckId, column: store.state.show.start.column, label: head(1).querySelector('.st')?.textContent, marks: $$('.lv-col.start').length, launched: !!store.state.media.layers.L1.play };
    await menuOn(1);
    $$('.lv-menu button').find((b) => /Do not start the room/.test(b.innerText)).click();
    await until(() => store.state.show.start.column === null);
    await wait(150);
    out.cleared = { column: store.state.show.start.column, marks: $$('.lv-col.start').length };
    await cmd('app.lock', { locked: true });
    await until(() => store.state.locked);
    await wait(200);
    await menuOn(0);
    out.locked = $$('.lv-menu button').find((b) => /Start the room/.test(b.innerText))?.disabled;
    return out;`, {
    setup: async ({ engine, file }) => { await imported(engine, [[file('A.mov'), { layerId: 'L1', column: 0 }], [file('B.mov', makeHap({ frames: 8 }).bytes), { layerId: 'L1', column: 1 }]]); },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.items, ['Launch column 2', 'Start the room with column 2']);
  assert.deepEqual(result.start, { deckId: 'D1', column: 1, label: 'START', marks: 1, launched: false });
  assert.deepEqual(result.cleared, { column: null, marks: 0 });
  assert.equal(result.locked, true, 'Show mode: the start is locked');
});

test('live: a clip moved within the grid goes there with the show\'s revision; onto another clip they swap; Ctrl+Z puts it back; a library file dropped on a cell is a new clip', opt, async () => {
  // fails if: an internal drop does not send show.update (or sends it without the revision), the swap loses a clip,
  // Ctrl+Z does not restore the show as it was (or undoes through the profile instead), or a library tile makes no clip.
  const { result, errors, engine } = await inLive(`
    const out = {}, cells = () => ({ ...store.state.show.decks[0].cells });
    const A = cellEl('L1', 0).dataset.clip, B = cellEl('L1', 1).dataset.clip;
    const rev0 = store.state.show.rev;
    dragTo(cellEl('L1', 0), cellEl('L2', 3));
    await until(() => store.state.show.rev > rev0);
    out.moved = cells();
    out.selMoved = cellEl('L2', 3).classList.contains('sel');
    dragTo(cellEl('L2', 3), cellEl('L1', 1));
    await until(() => store.state.show.decks[0].cells['L1:1'] === A);
    out.swapped = cells();
    key('z', { ctrlKey: true });
    await until(() => store.state.show.decks[0].cells['L2:3'] === A);
    out.undone = cells();
    key('z', { ctrlKey: true });
    await until(() => store.state.show.decks[0].cells['L1:0'] === A);
    out.undone2 = cells();
    // the library: open the drawer, drag the first file onto an empty cell
    await wait(100);
    const tiles = $$('.lv-tile').length;
    const n = store.state.show.clips.length;
    dragTo($('.lv-tile'), cellEl('L3', 5));
    await until(() => store.state.show.clips.length === n + 1);
    out.fromLibrary = { tiles, cell: !!store.state.show.decks[0].cells['L3:5'], clips: store.state.show.clips.length - n };
    return { ...out, A, B };`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov'), { layerId: 'L1', column: 0 }], [file('B.mov', makeHap({ frames: 8 }).bytes), { layerId: 'L1', column: 1 }]]);
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  const { A, B } = result;
  assert.deepEqual(result.moved, { 'L2:3': A, 'L1:1': B }, 'moved: the old cell is empty');
  assert.equal(result.selMoved, true, 'the moved clip is selected where it landed');
  assert.deepEqual(result.swapped, { 'L1:1': A, 'L2:3': B }, 'dropped on a clip: they swap');
  assert.deepEqual(result.undone, { 'L2:3': A, 'L1:1': B }, 'Ctrl+Z: the swap is undone');
  assert.deepEqual(result.undone2, { 'L1:0': A, 'L1:1': B }, 'and again: the move');
  assert.deepEqual(result.fromLibrary, { tiles: 2, cell: true, clips: 1 }, 'a library file onto a cell: a new clip there');
  assert.equal(engine.media.show.decks[0].cells['L3:5'], engine.media.show.clips.at(-1).id);
});

test('live: a card\'s clip slots take a grid clip or a library file dropped on them, or one picked from their menu (show.update with the revision); × takes one out', opt, async () => {
  // fails if: the card's inspector shows no drop zone per slot of the manifest, a grid clip or a library file dropped on
  // a slot is not saved in the preset (a file: as a new clip), the menu does not add, a 'clips' slot takes the same clip
  // twice, the × does not take it out (and drop the clip nothing else uses), or an edit goes without the revision.
  const { result, errors, engine } = await inLive((ctx) => `
    const out = {}, P = () => store.state.show.presets.find((p) => p.id === 'p1').media;
    const slot = (k) => $('#panel .lv-slot[data-slot="' + k + '"]');
    L.select({ kind: 'preset', id: 'p1' }); await wait(150);
    out.zones = $$('#panel .lv-slot').map((z) => z.dataset.slot);
    const A = cellEl('L1', 0).dataset.clip, B = cellEl('L1', 1).dataset.clip;
    let rev = store.state.show.rev;
    dragTo(cellEl('L1', 0), slot('reel'));
    await until(() => P().reel === A);
    out.revs = [store.state.show.rev > rev]; rev = store.state.show.rev;
    out.reel = P().reel === A && store.state.show.decks[0].cells['L1:0'] === A; // the grid keeps its clip
    await wait(100);
    const n = store.state.show.clips.length;
    await until(() => slot('projects'));
    dragTo($('.lv-tile[data-media="${ctx.mC}"]'), slot('projects'));
    await until(() => (P().projects || []).length === 1);
    out.revs.push(store.state.show.rev > rev); rev = store.state.show.rev;
    const fresh = P().projects[0];
    out.fromFile = { clips: store.state.show.clips.length - n, media: store.state.show.clips.find((c) => c.id === fresh)?.mediaId };
    await wait(100);
    const sel = slot('projects').querySelector('select');
    out.menu = [...sel.options].map((o) => o.value);
    sel.value = 'clip:' + B; sel.dispatchEvent(new Event('change')); sel.blur();
    await until(() => (P().projects || []).length === 2);
    await wait(100);
    dragTo(cellEl('L1', 1), slot('projects')); await wait(300); // B again: refused
    out.projects = [...P().projects];
    out.chips = $$('#panel .lv-slot[data-slot="projects"] .lv-slotclip').map((c) => c.dataset.clip);
    slot('projects').querySelector('.lv-slotclip[data-clip="' + fresh + '"] button').click();
    await until(() => P().projects.length === 1);
    out.removed = { projects: [...P().projects], clipGone: !store.state.show.clips.some((c) => c.id === fresh) };
    return { ...out, A, B, fresh };`, {
    setup: async (ctx) => {
      const { engine, file } = ctx;
      await imported(engine, [[file('A.mov'), { layerId: 'L1', column: 0 }], [file('B.mov', makeHap({ frames: 8 }).bytes), { layerId: 'L1', column: 1 }], [file('C.mov', makeHap({ frames: 6 }).bytes), null]]);
      ctx.mC = engine.media.show.media.find((m) => m.file.endsWith('C.mov')).id;
      await editShow(engine, (s) => { s.presets = [{ id: 'p1', name: 'Probe', experienceId: 'media-probe', params: {}, sound: null, media: {}, onLoad: 'keep' }]; });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  const { A, B, fresh } = result;
  assert.deepEqual(result.zones, ['reel', 'projects'], 'one drop zone per slot the manifest declares');
  assert.equal(result.reel, true, 'a grid clip dropped on the reel slot');
  assert.deepEqual(result.revs, [true, true], 'each edit is a show.update with the revision');
  assert.deepEqual(result.fromFile, { clips: 1, media: engine.media.show.media.find((m) => m.file.endsWith('C.mov')).id }, 'a library file: a new clip of it');
  assert.ok(result.menu.includes(`clip:${A}`) && result.menu.includes(`clip:${B}`), JSON.stringify(result.menu));
  assert.deepEqual(result.projects, [fresh, B], 'picked from the menu; the same clip is not taken twice');
  assert.deepEqual(result.chips, [fresh, B]);
  assert.deepEqual(result.removed, { projects: [B], clipGone: true }, '× takes it out; a clip nothing uses goes');
  assert.deepEqual(engine.media.show.presets[0].media, { reel: A, projects: [B] });
});

// ---------------------------------------------------------------------------------------------- problems, Show mode

test('live: a missing file marks its cell amber and adds to Problems; Locate… finds it in a folder and the cell is ready again', opt, async () => {
  // fails if: the cell of a missing file is not marked (class, amber dot, "Missing"), Problems does not count it (or
  // offers no Locate…), or Locate… does not send media.relink with the folder (the cell would stay missing).
  const { result, errors } = await inLive(({ usb }) => `
    const out = {}, cell = () => cellEl('L1', 0);
    await until(() => (store.state.media.problems || []).some((p) => p.kind === 'missing-media'), 5000);
    out.cell = { missing: cell().classList.contains('st-missing'), dot: $('.lv-name .dot', cell()).className, flag: $('.lv-flag', cell()).textContent, why: $('.lv-name .dot', cell()).title };
    const V = await import('/js/views.js');
    out.items = V.problems(v).map((p) => p[1]);
    out.locateInProblems = V.problems(v).some((p) => p[2]?.innerText === 'Locate…');
    out.chip = $('#problems button')?.innerText.replace(/\\s+/g, ' ').trim();
    // launching it says why, and does nothing
    $('.lv-thumb', cell()).click(); await wait(300);
    out.toast = [...$$('.toast')].map((t) => t.innerText).join(' | ');
    out.played = !!store.state.media.layers.L1.play;
    // Locate… from the inspector
    $('.lv-name', cell()).click(); await wait(150);
    [...$$('#panel button')].find((b) => b.innerText === 'Locate…').click(); await wait(100);
    $('.modal .lv-locate input').value = ${JSON.stringify(usb)};
    $('.modal .lv-locate .btn.primary').click();
    out.fixed = !!(await until(() => cell().classList.contains('st-ready'), 15000));
    out.after = V.problems(v).some((p) => /missing/.test(p[1]));
    return out;`, {
    setup: async ({ engine, file }) => {
      const show = await imported(engine, [[file('Reel.mov'), { layerId: 'L1', column: 0 }]]);
      fs.rmSync(path.join(engine.media.libraryDir, ...show.media[0].file.split('/')));
      await engine.media.check();
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual({ ...result.cell, why: undefined }, { missing: true, dot: 'dot warn', flag: 'Missing', why: undefined }, 'amber, and says Missing');
  assert.equal(result.cell.why, '"Reel.mov" is missing from the media library.', 'the reason on hover');
  assert.ok(result.items.includes('"Reel.mov" is missing from the media library.'), result.items.join(' / '));
  assert.equal(result.locateInProblems, true, 'Problems offers Locate…');
  assert.match(result.chip, /^Problems \(\d+\)$/);
  assert.match(result.toast, /missing from the media library/, 'launching a missing clip tells why');
  assert.equal(result.played, false);
  assert.equal(result.fixed, true, 'Locate… fixed it');
  assert.equal(result.after, false, 'and Problems no longer has it');
});

test('live: Show mode — cells still launch, nothing drags or drops, the settings are locked and the grid says so quietly', opt, async () => {
  // fails if: Show mode stops launches, leaves cells draggable, lets a drag start or a file drop import, or leaves the
  // clip's settings editable without saying why.
  const { result, errors, engine } = await inLive(`
    const out = {}, cell = () => cellEl('L1', 0);
    out.note = $('.lv-locknote')?.textContent;
    out.draggable = cell().getAttribute('draggable');
    $('.lv-thumb', cell()).click();
    out.launched = !!(await until(() => cell().classList.contains('live'), 3000));
    const ds = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    cell().dispatchEvent(ds);
    out.dragRefused = ds.defaultPrevented;
    const rev = store.state.show.rev;
    dragTo(cell(), cellEl('L2', 2));
    drop(cellEl('L1', 3), [$('#__vtFiles').files[0]]);
    await wait(600);
    out.unchanged = store.state.show.rev === rev && store.state.show.clips.length === 1;
    out.toast = [...$$('.toast')].map((t) => t.innerText).join(' | ');
    $('.lv-name', cell()).click(); await wait(150);
    out.locked = { selects: $$('#panel select').length && $$('#panel select').every((s) => s.disabled), text: /Show mode: locked/.test($('#panel').innerText) };
    // the mix is how a show is run: still live
    $('.lv-row[data-layer="L1"] .ms[data-ms="M"]').click();
    out.mute = !!(await until(() => store.state.media.layers.L1.mute === true, 3000));
    return out;`, {
    files: ({ file }) => [file('New.mov')],
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('Reel.mov'), { layerId: 'L1', column: 0 }]]);
      await engine.command('app.lock', { locked: true });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.note, 'Show mode · launching only');
  assert.equal(result.draggable, 'false');
  assert.equal(result.launched, true, 'cells still launch');
  assert.equal(result.dragRefused, true, 'a drag does not start');
  assert.equal(result.unchanged, true, 'nothing moved, nothing imported');
  assert.match(result.toast, /Show mode: unlock the room to import/);
  assert.deepEqual(result.locked, { selects: true, text: true });
  assert.equal(result.mute, true, 'M still works');
  assert.equal(engine.media.show.clips.length, 1);
});

// ---------------------------------------------------------------------------------------------- the strip, the shelf, the top bar

test('live: every value is a VEATION fader (no range inputs) — layer opacity / volume live, M and B, master; Blackout toggles amber on a click', opt, async () => {
  // fails if: a native range input appears anywhere in Live (grid, drawer, every kind of inspector), a layer fader does
  // not send layer.set, M / B do not toggle mute / bypass, or Blackout is not media.blackout with an amber "on" state.
  const { result, errors } = await inLive(`
    const out = { ranges: {}, faders: {} };
    const look = (k) => { out.ranges[k] = document.querySelectorAll('input[type=range]').length; out.faders[k] = [$$('#liveDeck .vfield[role=slider]').length, $$('#panel .vfield[role=slider]').length]; };
    look('start');
    $('.lv-name', cellEl('L1', 0)).click(); await wait(150); look('clip');
    $('.lv-row[data-layer="L1"] .lv-lname').click(); await wait(150); look('layer');
    $('.lv-card[data-kind="experience"] .lv-cname').click(); await wait(150); look('experience');
    $('.lv-card[data-kind="preset"] .lv-cname').click(); await wait(150); look('preset');
    await wait(100); $('.lv-tile').click(); await wait(150); look('media');
    out.headFaders = $$('.lv-row[data-layer="L1"] .lv-lh .vfield').map((f) => f.getAttribute('aria-label'));
    // opacity: one keyboard step down → layer.set, live
    const op = $('.lv-row[data-layer="L1"] .lv-lh .vfield[aria-label="Opacity"]');
    op.focus(); op.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    out.opacity = await until(() => store.state.media.layers.L1.opacity === 0.99 && 0.99, 3000);
    op.blur(); await wait(50);
    $('.lv-row[data-layer="L1"] .ms[data-ms="B"]').click(); // B
    out.bypass = !!(await until(() => store.state.media.layers.L1.bypass === true, 3000));
    await wait(150);
    out.bOn = $('.lv-row[data-layer="L1"] .ms[data-ms="B"]').classList.contains('on');
    // Blackout: a click, amber while on, a click again
    const bo = $('#blackoutBtn');
    out.boPlace = bo.nextElementSibling?.id;
    bo.click();
    out.boOn = !!(await until(() => store.state.media.blackout === true && bo.classList.contains('on'), 3000));
    out.boLook = { bg: getComputedStyle(bo).backgroundColor, pressed: bo.getAttribute('aria-pressed'), text: bo.textContent, caption: !$('.lv-bo-caption').hidden };
    key(' '); key('b'); await wait(200);
    out.noKey = store.state.media.blackout === true; // no single key turns it off (or on)
    bo.click();
    out.boOff = !!(await until(() => store.state.media.blackout === false && !bo.classList.contains('on'), 3000));
    return out;`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('Reel.mov'), { layerId: 'L1', column: 0 }]]);
      await editShow(engine, (s) => { s.presets.push({ id: 'p1', name: 'Probe calm', experienceId: 'touch-probe', params: { gain: 0.5 } }); });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  for (const [k, n] of Object.entries(result.ranges)) assert.equal(n, 0, `no range input (${k})`);
  // the deck: the opacity of each of the 3 layers, the video master and the audio master; the inspectors that hold values hold faders
  for (const k of Object.keys(result.faders)) assert.equal(result.faders[k][0], 5, `${k}: the deck's faders (${JSON.stringify(result.faders)})`);
  // (a clip: in, out; a layer: opacity, volume, transition; the probe's card: its one number, Gain)
  for (const [k, n] of [['clip', 2], ['layer', 3], ['preset', 1]]) assert.ok(result.faders[k][1] >= n, `${k}: the inspector's values are faders (${JSON.stringify(result.faders)})`);
  assert.deepEqual(result.headFaders, ['Opacity'], 'the layer volume moved to the layer inspector');
  assert.equal(result.opacity, 0.99, 'the opacity fader is layer.set, live');
  assert.equal(result.bypass, true);
  assert.equal(result.bOn, true);
  assert.equal(result.boPlace, 'lockBtn', 'Blackout sits in the top bar, before Show');
  assert.equal(result.boOn, true);
  assert.deepEqual(result.boLook, { bg: 'rgb(229, 181, 103)', pressed: 'true', text: 'Blackout · on', caption: true }, 'amber while on');
  assert.equal(result.noKey, true, 'no single-key blackout');
  assert.equal(result.boOff, true);
});

test('live: the shelf — with no show it lists the experiences and loads one (never a dead end); a card\'s picture loads it, its name selects it (parameters in the inspector); None unloads', opt, async () => {
  // fails if: without a show the shelf is empty or its card does not load the experience, the LIVE mark is not on the
  // live card, the name click loads instead of selecting, the card's parameters are not preset.param, or None does not
  // unload.
  const { result, errors } = await inLive(`
    const out = {};
    out.noShow = { show: store.state.show, cards: $$('.lv-card').map((c) => c.dataset.kind + ':' + c.dataset.id) };
    $('.lv-card[data-id="touch-probe"] .lv-cthumb').click();
    await until(() => store.state.experience.running);
    await cmd('experience.report', { fps: 30 }); // (the experience page would say it draws)
    out.adhoc = !!(await until(() => $('.lv-card[data-id="touch-probe"]').classList.contains('live'), 3000));
    out.badge = $('.lv-card[data-id="touch-probe"] .lv-badge').textContent;
    // a show with a card for it (another device made it)
    await cmd('show.create', { name: 'Tonight' });
    await until(() => store.state.show?.name === 'Tonight');
    await cmd('show.update', { show: { ...store.state.show, presets: [{ id: 'p1', name: 'Probe calm', experienceId: 'touch-probe', params: { gain: 0.5 } }] }, rev: store.state.show.rev });
    await until(() => $('.lv-card[data-kind="preset"]'));
    out.cards = $$('.lv-card').map((c) => c.dataset.kind + ':' + c.dataset.id);
    out.showName = $('.lv-showbtn .t').textContent;
    // the name: selects, loads nothing
    const before = JSON.stringify(store.state.media.preset);
    $('.lv-card[data-id="p1"] .lv-cname').click(); await wait(250);
    out.nameSel = { sel: $('.lv-card[data-id="p1"]').classList.contains('sel'), same: JSON.stringify(store.state.media.preset) === before, title: $('#panel .lv-ititle')?.textContent,
      gain: $$('#panel .row.fader').find((r) => r.querySelector('label').innerText === 'Gain')?.querySelector('.vbox').innerText };
    // the picture: loads it
    $('.lv-card[data-id="p1"] .lv-cthumb').click();
    await until(() => store.state.media.preset?.id === 'p1');
    await cmd('experience.report', { fps: 30 });
    out.loaded = !!(await until(() => $('.lv-card[data-id="p1"]').classList.contains('live'), 3000));
    out.gainLive = store.state.profile.experience.params['touch-probe']?.gain;
    // a parameter: one fader step = preset.param (live, and kept in the card)
    await wait(200);
    const f = $$('#panel .row.fader').find((r) => r.querySelector('label').innerText === 'Gain').querySelector('.vfield');
    f.focus(); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    out.param = await until(() => store.state.profile.experience.params['touch-probe']?.gain > 0.5 && store.state.profile.experience.params['touch-probe'].gain, 3000);
    f.blur();
    // None
    $('.lv-card[data-kind="none"] .lv-cthumb').click();
    out.none = !!(await until(() => !store.state.media.preset && $('.lv-card[data-kind="none"]').classList.contains('live'), 3000));
    out.running = store.state.experience.running;
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.noShow.show, null);
  assert.ok(result.noShow.cards.includes('experience:touch-probe') && result.noShow.cards.at(-1) === 'none:none', `no show: the experiences, then None (${result.noShow.cards})`);
  assert.equal(result.adhoc, true, 'its picture loaded it, and it is the live card');
  assert.equal(result.badge, 'LIVE');
  assert.ok(result.cards[0] === 'preset:p1' && !result.cards.includes('experience:touch-probe'), `with a card, the card replaces the plain experience (${result.cards})`);
  assert.equal(result.showName, 'Tonight');
  assert.equal(result.nameSel.sel, true);
  assert.equal(result.nameSel.same, true, 'selecting loads nothing');
  assert.equal(result.nameSel.title, 'Probe calm');
  assert.match(result.nameSel.gain, /^0\.5/, 'the card\'s own value');
  assert.equal(result.loaded, true);
  assert.equal(result.gainLive, 0.5, 'loading the card sets its parameters');
  assert.ok(result.param > 0.5, 'a fader step is preset.param, live');
  assert.equal(result.none, true, 'None unloads');
  assert.equal(result.running, false);
});

// ---------------------------------------------------------------------------------------------- round 1 of the redesign
// (docs/research/resolume-ux.md §C): where drops land, the browser, sizes, the clip panel, selection, the strip, the keys

/** A HAP of a length of its own (so the files of a test differ: the library keeps one copy of identical ones). */
const hapOf = (k, frames = 8 + k) => makeHap({ frames }).bytes;

// Fails if the placement rules are wrong anywhere: a drop landing on a taken cell, a column drop not going top layer
// down, an insert that would push a clip off the deck, a replaced file losing the clip's settings, or a paste on a taken cell.
test('live place: free cells in order, taken ones skipped; column = one per layer from the top; insert needs room; replacing keeps the settings; paste never takes a cell', () => {
  const show = { layers: [{ id: 'L1', name: 'Layer 1' }, { id: 'L2', name: 'Layer 2' }, { id: 'L3', name: 'Layer 3' }] };
  const deck = { id: 'D1', name: 'Main', columns: 6, cells: { 'L1:2': 'c1' } };
  let r = place.freeRun(deck, 'L1', 1, 3);
  assert.deepEqual(r.slots.map((s) => s.column), [1, 3, 4], 'the taken cell 2 is skipped, not overwritten');
  assert.deepEqual(r.skipped.map((s) => s.column), [2]);
  assert.equal(r.unplaced, 0);
  r = place.freeRun(deck, 'L1', 4, 3);
  assert.deepEqual([r.slots.length, r.unplaced], [2, 1], 'what does not fit is counted');
  deck.cells['L3:0'] = 'c9';
  r = place.planDrop(show, deck, { kind: 'column', column: 0 }, 3);
  assert.deepEqual(r.slots.map((s) => s.layerId), ['L2', 'L1'], 'from the top layer down; the taken layer is skipped');
  assert.deepEqual([r.skipped.map((s) => s.layerId), r.unplaced], [['L3'], 1]);
  assert.match(place.describePlan(place.planDrop(show, deck, { kind: 'cell', layerId: 'L1', column: 1 }, 3), 3), /^3 files → Layer 1 · columns 2–5 \(column 3 is taken: skipped\)$/);
  const crowded = { id: 'D', columns: 4, cells: { 'L1:2': 'a', 'L1:3': 'b' } };
  assert.equal(place.planInsert(crowded, 'L1', 2, 1).ok, false, 'no room: the last clip would leave the deck');
  const roomy = { id: 'D', columns: 6, cells: { 'L1:1': 'a', 'L1:2': 'b' } };
  const ins = place.planInsert(roomy, 'L1', 1, 1);
  assert.deepEqual(ins.moves, [[2, 3], [1, 2]], 'right to left, so nothing is overwritten on the way');
  place.applyInsert(roomy, 'L1', ins.moves);
  assert.deepEqual(roomy.cells, { 'L1:2': 'a', 'L1:3': 'b' });
  const clip = { id: 'c1', mediaId: 'm1', name: 'Old', end: 'hold', in: 1, out: 9, loops: 3 };
  const rep = place.replaceFile(clip, { id: 'm1', file: 's/Old.mov' }, { id: 'm2', file: 's/New.mov', video: { duration: 5 } });
  assert.deepEqual([clip.mediaId, clip.name, clip.end, clip.in, clip.out, clip.loops], ['m2', 'New', 'hold', 1, null, 3], 'file and name follow; In, end and loops stay; an Out past the new end is reset');
  assert.equal(rep.notes.length, 1);
  const c2 = { id: 'c2', mediaId: 'm1', name: 'My name', in: 7, out: null };
  place.replaceFile(c2, { id: 'm1', file: 's/Old.mov' }, { id: 'm2', file: 's/New.mov', video: { duration: 5 } });
  assert.deepEqual([c2.name, c2.in], ['My name', 0], 'a name the operator chose stays; an In past the end starts over');
  const d2 = { id: 'D', columns: 5, cells: { 'L2:3': 'x' } };
  const p = place.planPaste(show, d2, [{ layerId: 'L1', column: 0 }, { layerId: 'L2', column: 1 }], { layerId: 'L1', column: 2 });
  assert.deepEqual(p.out.map((o) => `${o.to.layerId}:${o.to.column}`), ['L1:2'], 'the clip that would land on the taken L2:3 is refused');
  assert.equal(p.refused.length, 1);
});

test('live: dropping N files — the drag draws the range and the taken cells and says so; the drop fills the free cells in order and overwrites nothing', opt, async () => {
  // fails if: the drag marks nothing (no range / no struck cell / no words), a taken cell is skipped silently or
  // overwritten, the files do not go to the free cells in order, or they are not selected together afterwards.
  const { result, errors, engine } = await inLive(`
    const out = {};
    const files = [...$('#__vtFiles').files];
    const dt = () => { const d = new DataTransfer(); for (const f of files) d.items.add(f); return d; };
    const target = cellEl('L1', 1);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt(), ...mid(target) }));
    out.range = $$('.lv-cell.range').map((c) => c.dataset.layer + ':' + c.dataset.col);
    out.skip = $$('.lv-cell.skip').map((c) => c.dataset.layer + ':' + c.dataset.col);
    out.tag = { shown: !$('.lv-droptag').hidden, text: $('.lv-droptag').textContent };
    target.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body }));
    out.afterLeave = $$('.lv-cell.range, .lv-cell.skip').length;
    drop(target, files);
    await until(() => store.state.show.clips.length === 5);
    await wait(200);
    out.cells = { ...store.state.show.decks[0].cells };
    out.names = Object.fromEntries(Object.entries(out.cells).map(([k, id]) => [k, store.state.show.clips.find((c) => c.id === id).name]));
    out.multi = L.multi.length;
    out.selected = L.sel;
    return out;`, {
    files: ({ file }) => [file('N1.mov', hapOf(1)), file('N2.mov', hapOf(2)), file('N3.mov', hapOf(3))],
    setup: async ({ engine, file }) => { await imported(engine, [[file('A.mov', hapOf(4)), { layerId: 'L1', column: 0 }], [file('B.mov', hapOf(5)), { layerId: 'L1', column: 2 }]]); },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.range, ['L1:1', 'L1:3', 'L1:4'], 'the range is the free cells');
  assert.deepEqual(result.skip, ['L1:2'], 'the taken one is struck, not part of the range');
  assert.equal(result.tag.shown, true);
  assert.equal(result.tag.text, '3 files → Layer 1 · columns 2–5 (column 3 is taken: skipped)');
  assert.equal(result.afterLeave, 0, 'the marks go with the drag');
  const A = engine.media.show.decks[0].cells['L1:0'], B = engine.media.show.decks[0].cells['L1:2'];
  assert.deepEqual(result.names, { 'L1:0': 'A', 'L1:1': 'N1', 'L1:2': 'B', 'L1:3': 'N2', 'L1:4': 'N3' }, 'A and B stayed where they were');
  assert.ok(result.cells['L1:0'] === A && result.cells['L1:2'] === B);
  assert.equal(result.multi, 3, 'the new clips are selected together');
});

test('live: dropping on a column head fills one layer each from the top; on a layer head its first free cells; on a deck tab that deck\'s first layer — never over a taken cell', opt, async () => {
  // fails if a column drop does not go top layer down (or lands on the taken layer), a layer head ignores taken cells, a
  // deck tab drop goes to the deck in view instead of the one named, or the show's revision is not respected (one edit each).
  const { result, errors } = await inLive(`
    const out = {};
    const names = () => Object.fromEntries(Object.entries(store.state.show.decks[0].cells).map(([k, id]) => [k, store.state.show.clips.find((c) => c.id === id).name]));
    const files = [...$('#__vtFiles').files];
    drop($('.lv-col[data-col="5"]'), [files[0], files[1], files[2]]);
    await until(() => store.state.show.clips.length === 4);
    await wait(150);
    out.column = names();
    drop($('.lv-row[data-layer="L2"] .lv-lh'), [files[3]]);
    await until(() => store.state.show.clips.length === 5);
    await wait(150);
    out.layer = names();
    drop($('.lv-decks button[data-deck="D2"]'), [files[4]]);
    await until(() => store.state.show.clips.length === 6);
    await wait(150);
    out.deck2 = Object.fromEntries(Object.entries(store.state.show.decks[1].cells).map(([k, id]) => [k, store.state.show.clips.find((c) => c.id === id).name]));
    out.deckInView = L.deck().id;
    return out;`, {
    files: ({ file }) => [1, 2, 3, 4, 5].map((k) => file('F' + k + '.mov', hapOf(k + 10))),
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov', hapOf(4)), { layerId: 'L3', column: 5 }], [file('B.mov', hapOf(5)), { layerId: 'L2', column: 0 }]]);
      await editShow(engine, (s) => { s.decks.push({ id: 'D2', name: 'Second', columns: 8, cells: {} }); });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.column, { 'L3:5': 'A', 'L2:0': 'B', 'L2:5': 'F1', 'L1:5': 'F2' }, 'column 6: the top layer is taken, so the first two files go to the layers below it; the third has no room');
  assert.deepEqual(result.layer, { 'L3:5': 'A', 'L2:0': 'B', 'L2:5': 'F1', 'L1:5': 'F2', 'L2:1': 'F4' }, 'the layer head: its first free cell (column 1; column 0 is taken)');
  assert.deepEqual(result.deck2, { 'L1:0': 'F5' }, 'the deck tab: the first layer of THAT deck');
  assert.equal(result.deckInView, 'D1', 'the deck in view did not change');
});

test('live: a file dropped on a clip replaces its file and keeps its settings (Ctrl: a new clip beside it); "Replace file…" does the same from the browser', opt, async () => {
  // fails if a drop on a taken cell makes a second clip (or overwrites the cell), the clip loses its end / In / name
  // choices, Ctrl does not make a new clip in the next free cell, or the armed Replace is not done by a double-click.
  const { result, errors } = await inLive(`
    const out = {}, cells = () => ({ ...store.state.show.decks[0].cells }), clip = (id) => store.state.show.clips.find((c) => c.id === id);
    const files = [...$('#__vtFiles').files];
    const id = cellEl('L1', 0).dataset.clip, media0 = clip(id).mediaId;
    const tag = (el) => { el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: (() => { const d = new DataTransfer(); d.items.add(files[0]); return d; })(), ...mid(el) })); return $('.lv-droptag').textContent; };
    out.dragWords = tag(cellEl('L1', 0));
    drop(cellEl('L1', 0), [files[0]]);
    await until(() => clip(id).mediaId !== media0);
    out.replaced = { cells: cells(), clips: store.state.show.clips.length, name: clip(id).name, end: clip(id).end, in: clip(id).in, loops: clip(id).loops, audioGain: clip(id).audio.gainDb };
    const media1 = clip(id).mediaId;
    // Ctrl: a new clip in the next free cell
    drop(cellEl('L1', 0), [files[1]], { ctrlKey: true });
    await until(() => store.state.show.clips.length === 2);
    await wait(150);
    out.ctrl = { cells: Object.keys(cells()).sort(), same: clip(id).mediaId === media1 };
    // Replace file… from the cell's menu, then a double-click on a file of the show
    cellEl('L1', 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 300 }));
    const item = [...$$('.lv-menu button')].find((b) => /^Replace file/.test(b.textContent));
    item.click();
    await wait(100);
    out.banner = $('.lv-replace')?.textContent;
    const tile = [...$$('.lv-tile')].find((t) => t.textContent.includes('Spare'));
    tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => clip(id).mediaId !== media1);
    out.afterReplace = { name: clip(id).name, end: clip(id).end, banner: !!$('.lv-replace'), armed: L.replace };
    return out;`, {
    files: ({ file }) => [file('Fresh.mov', hapOf(20)), file('Beside.mov', hapOf(21))],
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('Old.mov', hapOf(40)), { layerId: 'L1', column: 0 }], [file('Spare.mov', hapOf(30)), null]]);
      await editShow(engine, (s) => { Object.assign(s.clips[0], { end: 'hold', in: 0.5, loops: 3, audio: { gainDb: -6, route: null } }); });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.dragWords, 'Replace this clip\'s file (it keeps its settings) — Ctrl: a new clip next to it');
  assert.deepEqual(result.replaced, { cells: { 'L1:0': result.replaced.cells['L1:0'] }, clips: 1, name: 'Fresh', end: 'hold', in: 0.5, loops: 3, audioGain: -6 }, 'one clip, its settings kept, named after the new file');
  assert.deepEqual(result.ctrl, { cells: ['L1:0', 'L1:1'], same: true }, 'Ctrl: a new clip beside; the first is not touched');
  assert.match(result.banner, /Replacing the file of .*double-click the new file/);
  assert.deepEqual(result.afterReplace, { name: 'Spare', end: 'hold', banner: false, armed: null }, 'the double-click replaced it (settings kept) and disarmed');
});

test('live: the browser — Disk lists the drives and a typed folder (folders first, thumbnails for files it can read, the rest dimmed); a folder dragged on "+" makes a deck named after it; a file dragged on a cell is imported there', opt, async () => {
  // fails if the Disk tab lists nothing / no roots, a folder is not first, a thumbnail never loads, an unknown file is not
  // dimmed, the folder drop does not name the deck after the folder (or not one clip per column), or the file is not placed.
  const { result, errors } = await inLive((c) => `
    const out = {};
    $$('.lv-btabs button')[1].click();
    await until(() => $$('.lv-root').length);
    out.roots = $$('.lv-root').map((b) => b.textContent);
    const input = $('.lv-pathin');
    input.value = ${JSON.stringify(c.usb)};
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => $('.lv-folder'));
    out.order = $$('.lv-tiles.disk > *').map((e) => (e.classList.contains('lv-folder') ? 'dir:' : 'file:') + (e.querySelector('.t')?.textContent));
    out.dim = $$('.lv-file.dim').map((e) => e.querySelector('.t').textContent);
    const img = $('.lv-file[data-path$="a.mov"] img');
    out.src = img.getAttribute('src').startsWith('/api/media/diskthumb?') ;
    out.loaded = !!(await until(() => img.naturalWidth > 0, 15000));
    out.noThumbForText = !$('.lv-file[data-path$="notes.txt"] img');
    // a click shows it in the panel
    $('.lv-file[data-path$="a.mov"]').click(); await wait(200);
    out.panel = { title: $('#panel .lv-ititle')?.textContent, add: !![...$$('#panel button')].find((b) => b.textContent === 'Add to the show') };
    // a folder onto the + of the decks
    dragTo($('.lv-folder[data-path$="Reels"]'), $('.lv-adddeck'));
    await until(() => store.state.show?.decks.length === 2);
    await until(() => Object.keys(store.state.show.decks[1].cells).length === 2);
    out.deck = { name: store.state.show.decks[1].name, cells: Object.keys(store.state.show.decks[1].cells).sort(), inView: L.deck().id === store.state.show.decks[1].id };
    // a single file onto a cell
    L.setDeck(store.state.show.decks[0].id); await wait(100);
    dragTo($('.lv-file[data-path$="a.mov"]'), cellEl('L2', 2));
    await until(() => store.state.show.decks[0].cells['L2:2']);
    out.fileDrop = store.state.show.clips.find((c) => c.id === store.state.show.decks[0].cells['L2:2']).name;
    return out;`, {
    setup: async ({ engine, usb, file }) => {
      file('a.mov', hapOf(1)); file('b.mov', hapOf(2)); file('notes.txt', new Uint8Array(10));
      fs.mkdirSync(path.join(usb, 'Reels'));
      fs.writeFileSync(path.join(usb, 'Reels', '1 first.mov'), hapOf(3)); fs.writeFileSync(path.join(usb, 'Reels', '2 second.mov'), hapOf(4));
      // the listing is this computer's, local only: another device is refused (the engine does not trust the page)
      await assert.rejects(engine.command('media.fsList', { dir: usb }), /computer of the room/);
      await assert.rejects(engine.command('media.fsRoots', {}), /computer of the room/);
      const list = await engine.command('media.fsList', { dir: usb, __local: true });
      assert.deepEqual(list.entries.map((e) => e.name), ['Reels', 'a.mov', 'b.mov', 'notes.txt']);
      await assert.rejects(engine.command('media.fsList', { dir: 'relative/path', __local: true }), /full path/);
      await assert.rejects(engine.command('media.fsList', { dir: path.join(usb, 'missing'), __local: true }), /not there/);
      const exp = await engine.command('media.fsExpand', { paths: [path.join(usb, 'Reels'), path.join(usb, 'a.mov')], __local: true });
      assert.deepEqual([exp.files.map((f) => path.basename(f)), exp.folder.name], [['1 first.mov', '2 second.mov', 'a.mov'], 'Reels']);
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.ok(result.roots.includes('Library'), `the library is a root: ${result.roots}`);
  assert.ok(result.roots.length >= 3, `the drives and the user's folders: ${result.roots}`);
  assert.deepEqual(result.order, ['dir:Reels', 'file:a.mov', 'file:b.mov', 'file:notes.txt'], 'folders first, then files by name');
  assert.deepEqual(result.dim, ['notes.txt'], 'what Live does not read is dimmed (and has no picture)');
  assert.equal(result.src, true);
  assert.equal(result.loaded, true, 'the engine made a thumbnail of a file that is not in any show');
  assert.equal(result.noThumbForText, true);
  assert.deepEqual(result.panel, { title: 'a.mov', add: true });
  assert.deepEqual(result.deck, { name: 'Reels', cells: ['L1:0', 'L1:1'], inView: true }, 'a new deck named after the folder, one file per column in its first layer');
  assert.equal(result.fileDrop, 'a', 'a file of the disk onto a cell: imported and placed');
});

test('live: the size of the cells (S · M · L) is a choice that is remembered; resting on a cell shows it large', opt, async () => {
  // fails if the size buttons do not change the cell's width (104 / 144 / 208), the choice is not kept for next time, the
  // large picture asks for the small thumbnail, or the hover card does not show (or does not go on a press).
  const { result, errors } = await inLive(`
    const out = {};
    const w = () => Math.round(cellEl('L1', 0).getBoundingClientRect().width);
    out.m = w();
    $('.lv-sizes [data-size="L"]').click(); await wait(100);
    out.l = w(); out.lImg = $('img', cellEl('L1', 0)).getAttribute('src').includes('s=480'); out.stored = localStorage.getItem('vt-live-size');
    $('.lv-sizes [data-size="S"]').click(); await wait(100);
    out.s = w();
    $('.lv-sizes [data-size="M"]').click(); await wait(100);
    const cell = cellEl('L1', 0);
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    out.early = !$('.lv-hover').hidden;
    await wait(700);
    out.hover = { shown: !$('.lv-hover').hidden, title: $('.lv-hover b')?.textContent, big: $('.lv-hover img')?.getAttribute('src').includes('s=480'), lines: [...$$('.lv-hover .m')].map((e) => e.textContent) };
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    out.gone = $('.lv-hover').hidden;
    return out;`, {
    setup: async ({ engine, file }) => { await imported(engine, [[file('Ocean drift.mov', hapOf(4)), { layerId: 'L1', column: 0 }]]); },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual([result.s, result.m, result.l], [104, 144, 208]);
  assert.equal(result.lImg, true, 'L reads the large thumbnail');
  assert.equal(result.stored, 'L');
  assert.equal(result.early, false, 'not at once: crossing the grid does not flicker');
  assert.equal(result.hover.shown, true);
  assert.equal(result.hover.title, 'Ocean drift');
  assert.equal(result.hover.big, true);
  assert.match(result.hover.lines.join(' | '), /Layer 1 · column 1/);
  assert.equal(result.gone, true, 'a press takes it away');
});

test('live: several clips — Ctrl / Shift select, the panel edits them all in one edit, Ctrl+C / V paste in free cells only, Ctrl+D duplicates, Ctrl+A selects the deck', opt, async () => {
  // fails if Ctrl-click does not add, the bulk field changes one clip or sends one edit per clip, a paste goes onto a
  // taken cell (or does not keep the layout), a second paste on the same place is not refused, or Ctrl+D / Ctrl+A fail.
  const { result, errors } = await inLive(`
    const out = {}, cells = () => ({ ...store.state.show.decks[0].cells }), clipOf = (k) => store.state.show.clips.find((c) => c.id === store.state.show.decks[0].cells[k]);
    const click = (el, o = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...o }));
    click($('.lv-name', cellEl('L1', 0)));
    click($('.lv-name', cellEl('L1', 1)), { ctrlKey: true });
    await wait(150);
    out.ctrl = { multi: L.multi.length, marked: $$('.lv-cell.multi').length, title: $('#panel .lv-ititle')?.textContent };
    click($('.lv-name', cellEl('L1', 3)), { shiftKey: true });
    await wait(100);
    out.shift = L.multi.map((c) => c.layerId + ':' + c.column);
    click($('.lv-name', cellEl('L1', 3)), { ctrlKey: true }); // takes it away again
    await wait(100);
    out.taken = L.multi.length;
    click($('.lv-name', cellEl('L1', 0)));
    click($('.lv-name', cellEl('L1', 1)), { ctrlKey: true });
    await wait(150);
    // one field, all of them, ONE show.update
    const rev0 = store.state.show.rev;
    const sel = [...$$('#panel select')].find((s) => s.closest('.row')?.textContent.startsWith('End'));
    sel.value = 'hold'; sel.dispatchEvent(new Event('change'));
    await until(() => clipOf('L1:0').end === 'hold' && clipOf('L1:1').end === 'hold');
    out.bulk = { ends: ['L1:0', 'L1:1', 'L1:3'].map((k) => clipOf(k).end), revSteps: store.state.show.rev - rev0 };
    // copy, select an empty cell, paste: the layout is kept
    key('c', { ctrlKey: true });
    click(cellEl('L2', 0));
    await wait(100);
    key('v', { ctrlKey: true });
    await until(() => cells()['L2:1']);
    out.paste = Object.keys(cells()).sort();
    out.pasteKept = clipOf('L2:0').end;
    // again on the same place: refused, nothing changes
    const n = store.state.show.clips.length;
    click(cellEl('L2', 0));
    key('v', { ctrlKey: true });
    await wait(500);
    out.second = { clips: store.state.show.clips.length - n, toast: [...$$('.toast')].map((t) => t.innerText).join('|') };
    // duplicate the two pasted ones
    click($('.lv-name', cellEl('L2', 0))); click($('.lv-name', cellEl('L2', 1)), { ctrlKey: true });
    key('d', { ctrlKey: true });
    await until(() => cells()['L2:3']);
    out.dup = Object.keys(cells()).filter((k) => k.startsWith('L2:')).sort();
    key('a', { ctrlKey: true });
    await wait(100);
    out.all = L.multi.length;
    return out;`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov', hapOf(1)), { layerId: 'L1', column: 0 }], [file('B.mov', hapOf(2)), { layerId: 'L1', column: 1 }], [file('C.mov', hapOf(3)), { layerId: 'L1', column: 3 }]]);
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.ctrl, { multi: 2, marked: 2, title: '2 clips' }, 'Ctrl-click adds; the panel is about both');
  assert.deepEqual(result.shift, ['L1:1', 'L1:3'], 'Shift: the rectangle from the last one clicked (the empty cell between is not a clip)');
  assert.equal(result.taken, 0, 'Ctrl-click on a selected clip takes it away: one clip left is not a set');
  assert.deepEqual(result.bulk, { ends: ['hold', 'hold', 'layer'], revSteps: 1 }, 'both clips changed in a single edit; the third was not selected');
  assert.deepEqual(result.paste, ['L1:0', 'L1:1', 'L1:3', 'L2:0', 'L2:1'], 'pasted at the selected cell, keeping the layout');
  assert.equal(result.pasteKept, 'hold', 'the settings travelled with the copy');
  assert.equal(result.second.clips, 0, 'the second paste would land on taken cells: nothing');
  assert.match(result.second.toast, /not pasted/);
  assert.deepEqual(result.dup, ['L2:0', 'L2:1', 'L2:2', 'L2:3'], 'duplicated: next free cell to the right of each');
  assert.equal(result.all, 7, 'Ctrl+A: every clip of the deck');
});

test('live: the clip panel — a timeline with In / Out handles you drag, a playhead while it plays, a click on it jumps the live clip; tabs; the end as buttons', opt, async () => {
  // fails if dragging a handle does not set In / Out (to the frame, one edit), the readout does not follow, the playhead
  // is not drawn from the engine's clock, a click on the timeline does not launch the live clip at that point (offset), a
  // click while it is NOT live launches something, or the tabs / end buttons do not edit the clip.
  const { result, errors, engine } = await inLive(`
    const out = {}, clip = () => store.state.show.clips[0];
    $('.lv-name', cellEl('L1', 0)).click(); await wait(200);
    const r = $('.lv-tl-strip').getBoundingClientRect();
    const at = (f) => r.left + r.width * f;
    const drag = async (handle, f) => {
      const hr = handle.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: hr.left + hr.width / 2 }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: at(f) }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: at(f) }));
    };
    const rev0 = store.state.show.rev;
    await drag($('.lv-tl-h.in'), 0.2);
    await until(() => clip().in === 3);
    out.in = clip().in; out.revSteps = store.state.show.rev - rev0;
    await wait(200);
    await drag($('.lv-tl-h.out'), 0.8);
    await until(() => clip().out === 12);
    out.out = clip().out;
    await wait(250);
    out.readout = $('.lv-tl-read').textContent;
    // a click on the timeline while it is not live: nothing starts
    $('.lv-tl-strip').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at(0.5) }));
    await wait(300);
    out.idle = !store.state.media.layers.L1.play;
    // launch, then click the middle
    $('.lv-thumb', cellEl('L1', 0)).click();
    await until(() => store.state.media.layers.L1.play);
    await wait(250);
    L.paint();
    out.ph = { shown: getComputedStyle($('.lv-tl-ph')).display, left: parseFloat($('.lv-tl-ph').style.left) };
    const strip2 = $('.lv-tl-strip'), r2 = strip2.getBoundingClientRect();
    strip2.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r2.left + r2.width * 0.5 }));
    await until(() => (store.state.media.layers.L1.play?.offset || 0) > 1);
    out.offset = store.state.media.layers.L1.play.offset;
    // the end as buttons, and the tabs
    $('.lv-endseg [data-v="bounce"]').click();
    await until(() => clip().end === 'bounce');
    out.end = clip().end;
    $('.lv-chip').click();
    await until(() => clip().end === 'layer');
    out.chipEnd = clip().end;
    const tabs = {};
    for (const t of ['place', 'audio', 'file', 'clip']) { $('.lv-tabs [data-tab="' + t + '"]').click(); await wait(150); tabs[t] = { on: $('.lv-tabs .on').dataset.tab, text: $('#panel').innerText }; }
    out.tabs = tabs;
    $('.lv-tabs [data-tab="file"]').click(); await wait(150);
    out.fileButtons = [...$$('#panel .actions button')].map((b) => b.textContent);
    return out;`, {
    setup: async ({ engine, file }) => { await imported(engine, [[file('Long.mov', longHap()), { layerId: 'L1', column: 0 }]]); },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.in, 3, 'the In handle at 20 % of a 15 s file is 3 s (to the frame)');
  assert.equal(result.revSteps, 1, 'one gesture, one edit (one Ctrl+Z)');
  assert.equal(result.out, 12);
  assert.match(result.readout, /In 0:03\.0.*Out 0:12\.0.*9\.0 s/, 'the readout follows');
  assert.equal(result.idle, true, 'a click on the timeline of a clip that is not playing launches nothing');
  assert.equal(result.ph.shown, 'block', 'the playhead while it plays');
  assert.ok(result.ph.left >= 0 && result.ph.left < 100);
  assert.ok(Math.abs(result.offset - 4.5) < 0.2, `the click at the middle of 3–12 s jumps to 7.5 s: 4.5 s into the segment (${result.offset})`);
  assert.equal(result.end, 'bounce');
  assert.equal(result.chipEnd, 'layer', 'the chip hands the clip back to its layer');
  assert.deepEqual(Object.entries(result.tabs).map(([k, v]) => [k, v.on]), [['place', 'place'], ['audio', 'audio'], ['file', 'file'], ['clip', 'clip']]);
  assert.match(result.tabs.place.text, /Fit[\s\S]*Where/);
  assert.match(result.tabs.audio.text, /no audio|Route/);
  assert.match(result.tabs.file.text, /Cell[\s\S]*File[\s\S]*Video/);
  assert.deepEqual(result.fileButtons, ['Replace file…', 'Show in browser', 'Remove from the grid', 'Remove the file…']);
  assert.equal(engine.media.show.clips[0].end, 'layer');
});

test('live: the layer strip — S solos (the others go dark, their own B is kept), the blend and the opacity are live, the clip playing is named; the video master is amber off 100 %', opt, async () => {
  // fails if Solo does not send layer.solo or the other layers do not read bypass, B shows solo-hidden as the layer's own
  // choice, the blend select does not send layer.set, the name of what plays is missing, or the video master is not
  // media.master with an amber state.
  const { result, errors } = await inLive(`
    const out = {};
    const head = (id) => $('.lv-row[data-layer="' + id + '"] .lv-lh');
    $('.lv-row[data-layer="L2"] .ms[data-ms="S"]').click();
    await until(() => store.state.media.solo === 'L2');
    await wait(200);
    out.solo = { id: store.state.media.solo, bypass: ['L1', 'L2', 'L3'].map((id) => store.state.media.layers[id].bypass), own: ['L1', 'L2', 'L3'].map((id) => store.state.media.layers[id].bypassSet),
      dim: ['L1', 'L2', 'L3'].map((id) => head(id).classList.contains('dimmed')), sOn: head('L2').querySelector('[data-ms="S"]').classList.contains('on'), bOn: head('L1').querySelector('[data-ms="B"]').classList.contains('on') };
    $('.lv-row[data-layer="L2"] .ms[data-ms="S"]').click();
    await until(() => store.state.media.solo === null);
    out.unsolo = ['L1', 'L2', 'L3'].map((id) => store.state.media.layers[id].bypass);
    const blend = head('L1').querySelector('.lv-blend');
    blend.value = 'screen'; blend.dispatchEvent(new Event('change'));
    await until(() => store.state.media.layers.L1.blend === 'screen');
    out.blend = store.state.media.layers.L1.blend;
    $('.lv-thumb', cellEl('L1', 0)).click();
    await until(() => store.state.media.layers.L1.play);
    await wait(200);
    out.np = { text: head('L1').querySelector('.lv-np .t').textContent, on: head('L1').querySelector('.lv-np').classList.contains('on'), idle: head('L2').querySelector('.lv-np .t').textContent };
    const vm = $('.lv-vmaster .vfield');
    out.master0 = [store.state.media.master, $('.lv-vmaster').classList.contains('off')];
    vm.focus(); vm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await until(() => store.state.media.master === 0.99);
    vm.blur(); await wait(300);
    out.master1 = [store.state.media.master, $('.lv-vmaster').classList.contains('off'), getComputedStyle($('.lv-vmaster .vbox')).color];
    return out;`, {
    setup: async ({ engine, file }) => { await imported(engine, [[file('Ocean drift.mov', hapOf(4)), { layerId: 'L1', column: 0 }]]); },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.solo, { id: 'L2', bypass: [true, false, true], own: [false, null, false], dim: [true, false, true], sOn: true, bOn: false }, 'the others are hidden but their own B stays off');
  assert.deepEqual(result.unsolo, [false, false, false]);
  assert.equal(result.blend, 'screen');
  assert.deepEqual(result.np, { text: 'Ocean drift', on: true, idle: '—' });
  assert.deepEqual(result.master0, [1, false]);
  assert.deepEqual(result.master1.slice(0, 2), [0.99, true], 'media.master, amber off 100 %');
  assert.equal(result.master1[2], 'rgb(229, 181, 103)');
});

test('live: the keyboard — arrows, Enter, B, Ctrl+Z / Ctrl+Y, Ctrl+Shift+arrows; Keys armed: numbers launch columns, the QWERTY rows launch clips; nothing launches without Keys', opt, async () => {
  // fails if ↑ / ↓ do not move the selection between layers, Enter does not launch, B does not fold the browser, redo
  // is missing, a deck is not changed by Ctrl+Shift+→, a letter or number launches while Keys is not armed, or armed
  // keys launch the wrong cell.
  const { result, errors } = await inLive(`
    const out = {};
    $('.lv-name', cellEl('L1', 0)).click(); await wait(100);
    key('ArrowUp'); await wait(100);
    out.up = L.sel.layerId; // the layer above L1 is L2
    key('ArrowDown'); await wait(100);
    out.down = L.sel.layerId;
    key('Enter');
    out.enter = !!(await until(() => store.state.media.layers.L1.play, 3000));
    await cmd('layer.clear', { layerId: 'L1', transitionMs: 0 }); await wait(300);
    // not armed: letters and numbers launch nothing
    key('z'); key('x'); await wait(300);
    out.unarmed = !store.state.media.layers.L1.play;
    // armed
    $('.lv-keysbtn').click(); await wait(100);
    out.armed = { on: L.keys, label: $('.lv-keylbl', cellEl('L1', 0)).textContent, third: $('.lv-keylbl', cellEl('L1', 1)).textContent };
    key('x');
    out.x = !!(await until(() => cellEl('L1', 1).classList.contains('live'), 3000));
    key('2');
    out.two = !!(await until(() => store.state.media.column?.index === 1, 3000));
    key('z');
    out.z = !!(await until(() => cellEl('L1', 0).classList.contains('live'), 3000));
    $('.lv-keysbtn').click(); await wait(100);
    out.disarmed = !L.keys;
    // B folds the browser
    key('b'); out.folded = $('.lv-main').classList.contains('nobrowser');
    key('b'); out.opened = !$('.lv-main').classList.contains('nobrowser');
    // undo / redo
    await L.editShow((s) => { s.clips[0].name = 'Zed'; }, 'rename');
    key('z', { ctrlKey: true });
    out.undone = !!(await until(() => store.state.show.clips[0].name !== 'Zed', 3000));
    key('y', { ctrlKey: true });
    out.redone = !!(await until(() => store.state.show.clips[0].name === 'Zed', 3000));
    // decks
    key('ArrowRight', { ctrlKey: true, shiftKey: true }); await wait(150);
    out.deck = L.deck().id;
    key('ArrowLeft', { ctrlKey: true, shiftKey: true }); await wait(150);
    out.deckBack = L.deck().id;
    return out;`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov', longHap()), { layerId: 'L1', column: 0 }], [file('B.mov', hapOf(2)), { layerId: 'L1', column: 1 }]]);
      await editShow(engine, (s) => { s.decks.push({ id: 'D2', name: 'Second', columns: 8, cells: {} }); });
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.up, 'L2');
  assert.equal(result.down, 'L1');
  assert.equal(result.enter, true, 'Enter launches the selected clip');
  assert.equal(result.unarmed, true, 'without Keys nothing launches from a letter or a number');
  assert.deepEqual(result.armed, { on: true, label: 'Z', third: 'X' }, 'the key labels are on the cells');
  assert.equal(result.x, true, 'X = third row, column 2');
  assert.equal(result.two, true, '2 = column 2');
  assert.equal(result.z, true);
  assert.equal(result.disarmed, true);
  assert.deepEqual([result.folded, result.opened], [true, true], 'B folds and opens the browser');
  assert.equal(result.undone, true);
  assert.equal(result.redone, true, 'Ctrl+Y brings the edit back');
  assert.equal(result.deck, 'D2');
  assert.equal(result.deckBack, 'D1');
});

test('live: a clip dragged to the left edge of another is INSERTED before it (the rest of the layer moves right); with no room it is refused and nothing moves', opt, async () => {
  // fails if the edge does not show the insertion bar, the clips do not shift (or one is lost), or a full layer is changed.
  const { result, errors } = await inLive(`
    const out = {}, row = () => Object.fromEntries(Object.entries(store.state.show.decks[0].cells).filter(([k]) => k.startsWith('L1:')).map(([k, id]) => [k, store.state.show.clips.find((c) => c.id === id).name]));
    const edge = { clientX: cellEl('L1', 0).getBoundingClientRect().left + 4, clientY: cellEl('L1', 0).getBoundingClientRect().top + 40 };
    const from = cellEl('L1', 2), to = cellEl('L1', 0);
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...edge }));
    out.bar = to.classList.contains('ins');
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...edge }));
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await until(() => row()['L1:0'] === 'C');
    out.row = row();
    return out;`, {
    setup: async ({ engine, file }) => {
      await imported(engine, [[file('A.mov', hapOf(1)), { layerId: 'L1', column: 0 }], [file('B.mov', hapOf(2)), { layerId: 'L1', column: 1 }], [file('C.mov', hapOf(3)), { layerId: 'L1', column: 2 }]]);
    },
  });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.bar, true, 'the insertion bar is shown at the edge');
  assert.deepEqual(result.row, { 'L1:0': 'C', 'L1:1': 'A', 'L1:2': 'B' }, 'C before A; A and B moved one cell right');
});

// ---------------------------------------------------------------------------------------------- screenshots (on request)

// VT_LIVE_SHOTS=<folder> node --test tests/live-ui.test.mjs — PNGs of Live for a design review: a show of several clips (two
// on air, one missing, one copying, a card live), large cells with Keys armed, the browser on a USB stick, a drag in
// flight, several clips selected. Not a check: skipped unless asked for.
const SHOTS = process.env.VT_LIVE_SHOTS || '';
test('live: screenshots for review', { skip: (!electronPath && 'electron is not installed') || (!SHOTS && 'set VT_LIVE_SHOTS=<folder> to take them') }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const NAMES = ['Ocean drift', 'Ember', 'Aurora', 'Dunes', 'Night city', 'Forest canopy', 'Coral reef'];
  const demo = (k, frames = 4, sps = 5) => demoHap({ palette: k, frames, secondsPerFrame: sps });
  const setup = async ({ engine, file }) => {
    const f = (k) => file(`${NAMES[k]}.mov`, demo(k));
    await imported(engine, [[f(0), { layerId: 'L1', column: 0 }], [f(1), { layerId: 'L1', column: 1 }], [f(3), { layerId: 'L1', column: 2 }],
      [f(2), { layerId: 'L2', column: 0 }], [f(4), { layerId: 'L2', column: 1 }], [f(5), { layerId: 'L2', column: 3 }], [f(6), { layerId: 'L3', column: 2 }]]);
    await editShow(engine, (s) => {
      s.name = 'Barcelona XR Lab — Tonight';
      s.clips.find((c) => c.name === 'Night city').end = 'hold';
      s.clips.find((c) => c.name === 'Ocean drift').in = 2;
      s.layers[0].name = 'Floor'; s.layers[1].name = 'Walls'; s.layers[2].name = 'Overlay';
      s.presets = [{ id: 'p1', name: 'Probe calm', experienceId: 'touch-probe', params: { gain: 0.5 }, sound: { id: 'ambient-notes', params: {} } }, { id: 'p2', name: 'Probe hard', experienceId: 'touch-probe', params: { mode: 'hard' } }];
    });
    const show = engine.media.show;
    fs.rmSync(path.join(engine.media.libraryDir, ...show.media.find((m) => m.file.endsWith('Coral reef.mov')).file.split('/')));
    await engine.media.check();
    await engine.command('media.import', { paths: [file('Copying.mov', demo(1, 2))], target: { layerId: 'L3', column: 4 }, __local: true });
    await engine.command('media.import', { paths: [file('Spare reel.mov', demo(3, 6, 4))], target: null, __local: true });
    await engine.command('column.trigger', { deckId: 'D1', column: 0 });
    await engine.command('clip.trigger', { deckId: 'D1', layerId: 'L2', column: 1 });
    await engine.command('layer.set', { layerId: 'L2', opacity: 0.8 });
    await engine.command('layer.set', { layerId: 'L3', mute: true });
    await engine.command('media.master', { value: 0.85 });
  };
  const media = { sourceOptions: { tail: { 'Copying.mov': 600 * MB }, delayMs: 300 } };
  const live = `await cmd('preset.load', { presetId: 'p1' }); await cmd('experience.report', { fps: 30 }); await wait(500);`;
  const shots = [];
  // 1. the room running: a clip selected, its transport in the panel
  shots.push(await inLive(`${live}
    $('.lv-name', cellEl('L2', 1)).click(); await wait(1500);
    return 'ok';`, { setup, media, shot: path.join(SHOTS, '1-live-1440x900.png') }));
  // 2. large cells on a big monitor, Keys armed, a layer soloed
  shots.push(await inLive(`${live}
    $('.lv-sizes [data-size="L"]').click(); await wait(100);
    $('.lv-keysbtn').click();
    $('.lv-name', cellEl('L1', 0)).click(); await wait(1500);
    return 'ok';`, { setup, media, w: 1920, h: 1080, shot: path.join(SHOTS, '2-live-large-keys-1920x1080.png') }));
  // 3. the browser on the disk: a USB stick with folders and files (one the engine does not read)
  shots.push(await inLive((c) => `${live}
    $$('.lv-btabs button')[1].click();
    await until(() => $$('.lv-root').length);
    const input = $('.lv-pathin'); input.value = ${JSON.stringify(c.usb)}; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => $('.lv-folder'));
    await until(() => [...$$('.lv-file img')].filter((i) => i.naturalWidth > 0).length >= 3, 15000);
    $('.lv-bview button[aria-label="Large pictures"]').click(); await wait(300);
    $('.lv-file[data-path$="Ember.mov"]').click(); await wait(1200);
    return 'ok';`, {
    setup: async (ctx) => {
      await setup(ctx);
      const { usb } = ctx;
      for (const [k, n] of [[0, 'Intro loop'], [1, 'Embers'], [2, 'Aurora wide'], [4, 'City night'], [5, 'Forest']]) fs.writeFileSync(path.join(usb, `${n}.mov`), demo(k));
      fs.writeFileSync(path.join(usb, 'Cue sheet.pdf'), new Uint8Array(2048));
      fs.mkdirSync(path.join(usb, 'Reels')); fs.mkdirSync(path.join(usb, 'Stills'));
      fs.writeFileSync(path.join(usb, 'Reels', 'Day.mov'), demo(3));
    },
    media, shot: path.join(SHOTS, '3-browser-disk-1440x900.png') }));
  // 4. a drag in flight: three files over a layer with a taken cell (the range in ink, the taken cell struck in amber)
  shots.push(await inLive(`${live}
    const files = [...$('#__vtFiles').files];
    const dt = new DataTransfer(); for (const f of files) dt.items.add(f);
    const target = cellEl('L2', 2);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...mid(target) }));
    await wait(1200);
    return 'ok';`, { setup, media, files: ({ file }) => [file('New 1.mov', demo(0)), file('New 2.mov', demo(1)), file('New 3.mov', demo(2))], shot: path.join(SHOTS, '4-drop-range-1440x900.png') }));
  // 5. several clips selected: the bulk panel; the hover card on one of them; blackout is not on
  shots.push(await inLive(`${live}
    const click = (el, o = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...o }));
    click($('.lv-name', cellEl('L1', 0)));
    click($('.lv-name', cellEl('L2', 1)), { ctrlKey: true });
    click($('.lv-name', cellEl('L1', 2)), { ctrlKey: true });
    await wait(300);
    cellEl('L2', 0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await wait(1600);
    return 'ok';`, { setup, media, shot: path.join(SHOTS, '5-multi-select-1440x900.png') }));
  for (const s of shots) assert.deepEqual(s.errors, [], s.errors.join(' | '));
});
