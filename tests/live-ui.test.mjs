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
import { rejectMessage } from '../engine/media/library.js';
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
  const drop = (target, list) => { const dt = new DataTransfer(); for (const f of list) dt.items.add(f); for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); };
  const dragTo = (from, to, o = {}) => { const dt = new DataTransfer(); from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    for (const type of ['dragenter', 'dragover', 'drop']) to.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...o })); from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); };
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
    out.ringShown = getComputedStyle($('.lv-ring', cell())).display;
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
  assert.deepEqual(result.report.items, [rejectMessage({ code: 'not-mov' }, 'clip.mp4'), '"fake.mov" is H.264, not HAP. Export it as HAP or HAP Q.'], 'the exact messages of §4d.3');
  assert.deepEqual(result.afterRefused, { cells: 0, clips: 0 }, 'no cell, no clip from refused files');
  assert.equal(result.copying, true, 'the cell shows the copy');
  assert.equal(result.copyingDot, 'dot', 'grey dot while copying');
  assert.match(result.copyingBand, /^(Copying \d+ %|Waiting)$/);
  assert.match(result.drawerLine, /^Copying 1 of 1 · [\d.]+ (KB|MB) \/ [\d.]+ MB( · \d+ (s|min) left)?$/, `the drawer: ${result.drawerLine}`);
  assert.equal(result.ready, true);
  assert.equal(result.readyDot, 'dot live', 'cyan dot once in the library');
  assert.equal(result.selected, true);
  assert.equal(result.live, true, 'the picture launched it');
  assert.deepEqual(result.liveCls, { ring: true, bar: false, onAir: true }, 'a looping clip shows the ring');
  assert.equal(result.ringShown, 'block');
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
    out.oneShot = { bar: c.classList.contains('ind-bar'), ring: c.classList.contains('ind-ring'), width: parseFloat($('.lv-bar i', c).style.width), left: $('.lv-left', c).textContent, ringShown: getComputedStyle($('.lv-ring', c)).display };
    // the indicator moves with the clock, and painting it sends nothing
    sent.length = 0;
    const w0 = parseFloat($('.lv-bar i', c).style.width);
    for (let k = 0; k < 6; k++) { await wait(120); L.paint(); }
    out.moves = parseFloat($('.lv-bar i', c).style.width) > w0;
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
  assert.equal(result.oneShot.ringShown, 'none');
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
    $('.lv-dtoggle').click(); await wait(100);
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
    $('.lv-row[data-layer="L1"] .ms').click();
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
    $('.lv-dtoggle').click(); await wait(100); $('.lv-tile').click(); await wait(150); look('media');
    out.headFaders = $$('.lv-row[data-layer="L1"] .lv-lh .vfield').map((f) => f.getAttribute('aria-label'));
    // opacity: one keyboard step down → layer.set, live
    const op = $('.lv-row[data-layer="L1"] .lv-lh .vfield[aria-label="Opacity"]');
    op.focus(); op.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    out.opacity = await until(() => store.state.media.layers.L1.opacity === 0.99 && 0.99, 3000);
    op.blur(); await wait(50);
    $$('.lv-row[data-layer="L1"] .ms')[1].click(); // B
    out.bypass = !!(await until(() => store.state.media.layers.L1.bypass === true, 3000));
    await wait(150);
    out.bOn = $$('.lv-row[data-layer="L1"] .ms')[1].classList.contains('on');
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
  // the deck: opacity + volume on each of the 3 layers, and the master; the inspectors that hold values hold faders
  for (const k of Object.keys(result.faders)) assert.equal(result.faders[k][0], 7, `${k}: the deck's faders (${JSON.stringify(result.faders)})`);
  // (a clip: in, out; a layer: opacity, volume, transition; the probe's card: its one number, Gain)
  for (const [k, n] of [['clip', 2], ['layer', 3], ['preset', 1]]) assert.ok(result.faders[k][1] >= n, `${k}: the inspector's values are faders (${JSON.stringify(result.faders)})`);
  assert.deepEqual(result.headFaders, ['Opacity', 'Volume']);
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

// ---------------------------------------------------------------------------------------------- screenshots (on request)

// VT_LIVE_SHOTS=<folder> node --test tests/live-ui.test.mjs — PNGs of Live with a show of several clips (two on air,
// one missing, one copying, a card live) for a design review. Not a check: skipped unless asked for.
const SHOTS = process.env.VT_LIVE_SHOTS || '';
test('live: screenshots for review', { skip: (!electronPath && 'electron is not installed') || (!SHOTS && 'set VT_LIVE_SHOTS=<folder> to take them') }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const NAMES = ['Ocean drift', 'Ember', 'Aurora', 'Dunes', 'Night city', 'Forest canopy', 'Coral reef'];
  const setup = async ({ engine, file }) => {
    const f = (k) => file(`${NAMES[k]}.mov`, demoHap({ palette: k }));
    await imported(engine, [[f(0), { layerId: 'L1', column: 0 }], [f(1), { layerId: 'L1', column: 1 }], [f(3), { layerId: 'L1', column: 2 }],
      [f(2), { layerId: 'L2', column: 0 }], [f(4), { layerId: 'L2', column: 1 }], [f(5), { layerId: 'L2', column: 3 }], [f(6), { layerId: 'L3', column: 2 }]]);
    await editShow(engine, (s) => {
      s.name = 'Barcelona XR Lab — Tonight';
      s.clips.find((c) => c.name === 'Night city').end = 'hold';
      s.presets = [{ id: 'p1', name: 'Probe calm', experienceId: 'touch-probe', params: { gain: 0.5 }, sound: { id: 'ambient-notes', params: {} } }, { id: 'p2', name: 'Probe hard', experienceId: 'touch-probe', params: { mode: 'hard' } }];
    });
    const show = engine.media.show;
    fs.rmSync(path.join(engine.media.libraryDir, ...show.media.find((m) => m.file.endsWith('Coral reef.mov')).file.split('/')));
    await engine.media.check();
    await engine.command('media.import', { paths: [file('Copying.mov', demoHap({ palette: 1, frames: 2 }))], target: { layerId: 'L3', column: 4 }, __local: true });
    await engine.command('column.trigger', { deckId: 'D1', column: 0 });
    await engine.command('clip.trigger', { deckId: 'D1', layerId: 'L2', column: 1 });
    await engine.command('layer.set', { layerId: 'L2', opacity: 0.8 });
    await engine.command('layer.set', { layerId: 'L3', mute: true });
  };
  const media = { sourceOptions: { tail: { 'Copying.mov': 600 * MB }, delayMs: 300 } };
  const live = `await cmd('preset.load', { presetId: 'p1' }); await cmd('experience.report', { fps: 30 }); await wait(500);`;
  const shots = [];
  // 1. the room running: a clip selected
  shots.push(await inLive(`${live}
    $('.lv-name', cellEl('L2', 1)).click(); await wait(1200);
    return 'ok';`, { setup, media, shot: path.join(SHOTS, 'live-1440x900.png') }));
  // 2. the library open, a drop refused, the missing clip selected (Locate…)
  shots.push(await inLive(`${live}
    $('.lv-dtoggle').click(); await wait(100);
    drop(cellEl('L3', 6), [...$('#__vtFiles').files]);
    await until(() => $('.lv-report'));
    $('.lv-name', cellEl('L3', 2)).click(); await wait(1200);
    return 'ok';`, { setup, media, shot: path.join(SHOTS, 'live-library-1440x900.png'), files: ({ file }) => [file('teaser.mp4', new Uint8Array(4096).fill(3)), file('intro.mov', makeHap({ fourcc: 'avc1' }).bytes)] }));
  // 3. a large monitor: blackout on
  shots.push(await inLive(`${live}
    await cmd('media.blackout', { on: true }); await wait(1200);
    return 'ok';`, { setup, media, w: 1920, h: 1080, shot: path.join(SHOTS, 'live-blackout-1920x1080.png') }));
  for (const s of shots) assert.deepEqual(s.errors, [], s.errors.join(' | '));
});
