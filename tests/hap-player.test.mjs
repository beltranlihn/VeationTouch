// The HAP clip player of the room output (MEDIA-SERVER.md §3.1, §4.5, phase F6): decode workers with Node
// (ui/js/mixer/hap-worker.js), their pool (hap-pool.js), one player per playing clip (hap-player.js) and the clip layers
// fed by the transport (media-layers.js), with the engine's side (media.report) and the output window's guard
// (app/output-window.cjs).
// Pure parts run in Node with fake workers, fake bitmaps and a simulated clock: the request window and its latency,
// "late but newer", the trajectories, parking, the loop prefetch, the frame clock (skips and repeats counted), the
// worker counts. The rest runs in the REAL output page in the output window as the app makes it (tests/ui/runner.cjs
// --output-window: Node in its workers, its navigation guard, rendered off screen so it gets frames), on tiny clips
// made by tests/fixtures/media/make-hap.mjs: a frame-number stripe and corner markers, read back from the mixer's image.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow } from '../engine/media/show.js';
import { playhead } from '../engine/media/transport.js';
import { writeHap, layout, picture, MARKERS } from './fixtures/media/make-hap.mjs';
import { HapPool, hapWorkers, workersFor, HUNG_MS } from '../ui/js/mixer/hap-pool.js';
import { HapPlayer, FrameLock, requestWindow, centre } from '../ui/js/mixer/hap-player.js';
import { placeRect, fadeOf, wrapTargets, segmentOf, libraryFile } from '../ui/js/mixer/media-layers.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = () => new Promise((r) => setImmediate(r));
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

// ------------------------------------------------------------------------------------------------ fakes (Node)

const IX = (o = {}) => ({ fourcc: 'Hap1', width: 7196, height: 912, count: 300, fps: 30, ...o });

/** Fake ImageBitmaps: every one made is in `live` until it is closed. */
function bitmaps() {
  const live = new Set();
  return { live, make: (idx) => { const bm = { idx, width: 4, height: 4, close() { live.delete(bm); } }; live.add(bm); return bm; } };
}

/**
 * A pool of fake workers on a simulated clock: a frame comes back `latency(idx)` ms after it was asked for; init and
 * info answer at once. step(t) delivers, in time order, everything due by t.
 */
async function fakePool({ workers = 4, latency = () => 12, ix = IX() } = {}) {
  const clock = { now: 0 }, queue = [], B = bitmaps();
  const spawnW = () => {
    const w = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(m) {
        if (m.t === 'frame') queue.push({ at: clock.now + latency(m.idx), w, m });
        else queueMicrotask(() => w.onmessage({ data: m.t === 'init' ? { t: 'init', req: m.req, ok: true } : m.t === 'info' ? { t: 'info', req: m.req, ix } : { t: m.t, req: m.req } }));
      },
    };
    return w;
  };
  const pool = new HapPool({ spawn: spawnW, size: workers, now: () => clock.now, timeoutMs: 0 });
  await pool.init();
  const step = async (t) => {
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const q = queue[0];
      if (!q || q.at > t) break;
      queue.shift(); clock.now = q.at;
      q.w.onmessage({ data: { t: 'frame', req: q.m.req, idx: q.m.idx, bm: B.make(q.m.idx) } });
      await flush();
    }
    clock.now = t;
  };
  return { pool, clock, queue, B, step };
}

/** A player on a fake pool, played for `seconds` at a 60 Hz output: what it showed, held and asked for. */
async function playFor({ seconds = 4, fps = 30, count = 300, workers = 4, latency = () => 12, wrap = true, end = 'loop', warm = 300 } = {}) {
  const ix = IX({ fps, count });
  const F = await fakePool({ workers, latency, ix });
  const shown = [];
  const pl = new HapPlayer({ path: 'clip.mov', pool: F.pool, now: () => F.clock.now, deliver: (bm, idx) => { bm.close(); shown.push({ t: F.clock.now, idx }); } });
  pl.setInfo(ix); F.pool.add(pl);
  const p = { startAt: 0, offset: 0, in: 0, out: count / fps, fps, frames: count, end, loops: 1 };
  const seg = segmentOf(p);
  let maxOpen = 0, late = 0, onTime = 0, frames = 0;
  const P = 1000 / 60;
  for (let n = 0; n * P <= seconds * 1000; n++) {
    const t = n * P;
    await F.step(t);
    const ph = playhead(p, t);
    const wrapTo = wrap ? wrapTargets(p, ph, pl.ventana, fps, pl.lat) : null;
    const ok = pl.drive(ph.frame, { dir: ph.dir, first: seg.first, last: seg.last, fps, wrapTo });
    await flush();
    frames++;
    if (t > warm) { if (ok) onTime++; else late++; }
    maxOpen = Math.max(maxOpen, F.B.live.size);
  }
  return { pl, F, shown, maxOpen, late, onTime, frames, ix };
}

// ------------------------------------------------------------------------------------------------ pure (Node)

test('hap pool: VEATION\'s worker count; workers per clip from the F0 measures — HAP Q at 60 fps needs two, and gets them', async () => {
  assert.deepEqual([hapWorkers(24), hapWorkers(8), hapWorkers(4), hapWorkers(64)], [4, 2, 2, 4]);
  // Fails if the cost model forgets that HAP Q costs ~20 ms per 7196×912 frame (two workers at 60 fps), or HAP ~11 ms
  assert.equal(workersFor(IX({ fourcc: 'HapY', fps: 60 })), 2, 'HAP Q 7196×912 at 60');
  assert.equal(workersFor(IX({ fourcc: 'Hap5', fps: 60 })), 2, 'HAP Alpha 7196×912 at 60');
  assert.equal(workersFor(IX({ fourcc: 'Hap1', fps: 60 })), 1, 'HAP 7196×912 at 60');
  assert.equal(workersFor(IX({ fourcc: 'HapY', fps: 30 })), 1, 'HAP Q at 30');
  assert.equal(workersFor(IX({ fourcc: 'Hap1', width: 256, height: 32, fps: 60 })), 1);
  // a HAP Q clip at 60 next to a HAP one at 30: the HAP Q one has two frames in flight at once
  const F = await fakePool({ workers: 4, latency: () => 20 });
  const mk = (ix) => { const pl = new HapPlayer({ path: ix.fourcc, pool: F.pool, now: () => F.clock.now, deliver: (bm) => bm.close() }); pl.setInfo(ix); F.pool.add(pl); return pl; };
  const q = mk(IX({ fourcc: 'HapY', fps: 60 })), h = mk(IX({ fourcc: 'Hap1', fps: 30 }));
  F.pool.batch(() => { q.drive(0, { fps: 60, last: 299 }); h.drive(0, { fps: 30, last: 299 }); }); // (as media-layers drives a frame)
  await flush();
  assert.ok(q.pend.size >= 2, `HAP Q at 60 has ${q.pend.size} frames in flight`);
  // Fails if the first player of a frame takes every free worker: the other one waits a whole latency for its frame
  assert.ok(h.pend.size >= 1, 'and the other clip got its frame asked for in the same frame');
  assert.ok(F.pool.inFlight <= 4, 'one frame in flight per worker');
  // three HAP Q clips at 60: the pool grows to what they need (6 at most)
  mk(IX({ fourcc: 'HapY', fps: 60 })); mk(IX({ fourcc: 'HapY', fps: 60 }));
  await flush();
  assert.equal(F.pool.workers.length, 6);
});

test('hap pool: a file whose reads hang holds at most its own share of workers, and gets no new requests while a healthy clip has work; it breaks after STALL_MS', async () => {
  const F = await fakePool({ workers: 4, latency: (idx) => (idx >= 1000 ? 1e9 : 10) }); // frames ≥ 1000: a file that hangs
  const mk = (path) => { const pl = new HapPlayer({ path, pool: F.pool, now: () => F.clock.now, deliver: (bm) => bm.close() }); pl.setInfo(IX({ count: 5000 })); F.pool.add(pl); return pl; };
  const hung = mk('usb.mov'), ok = mk('ssd.mov');
  F.pool.batch(() => { hung.drive(1000, { fps: 30 }); ok.drive(0, { fps: 30 }); });
  await flush();
  await F.step(HUNG_MS + 50);
  const before = hung.served;
  // Fails if one clip may fill every worker: the stuck reads would take all four and the healthy clip would stop
  assert.ok(hung.pend.size <= hung.maxInFlight && hung.pend.size < 4, `the hung file holds ${hung.pend.size} workers`);
  for (let t = HUNG_MS + 50; t < 1500; t += 16.7) { await F.step(t); F.pool.batch(() => { ok.drive(Math.floor((t / 1000) * 30), { fps: 30 }); hung.drive(1000 + Math.floor((t / 1000) * 30), { fps: 30 }); }); await flush(); }
  // Fails if the scheduler keeps feeding the hung player once it is hung
  assert.equal(hung.served, before, 'the hung player got no new request');
  assert.ok(ok.stats.delivered > 30, `the healthy one kept playing (${ok.stats.delivered} frames)`);
  assert.equal(hung.broken, null);
  await F.step(3600); hung.drive(1100, { fps: 30 });
  assert.match(String(hung.broken), /^read: no frame from the file for 3 s/, 'a file silent for 3 s breaks its clip (it is then reported and ejected)');
});

test('hap player: the request window starts at playhead + latency and is bounded — held bitmaps ≤ L + K + 1 + workers + the loop prefetch; every frame on time', async () => {
  const r = await playFor({ seconds: 4, fps: 30, workers: 4, latency: () => 12 });
  const { K, L } = requestWindow(30, r.pl.lat);
  const bound = L + K + 1 + 4 + 6;
  // Fails without the window (every free worker asking for the next frame ahead — F0 measured 93–134 decodes a second
  // and 6.9 GB of video memory in 2 s): with the window's end removed this test saw 665 requests for 120 frames shown
  assert.ok(r.maxOpen <= bound, `at most ${r.maxOpen} bitmaps open (bound ${bound})`);
  assert.equal(r.late, 0, 'no late frame after the start');
  assert.ok(r.F.pool.stats.requested <= r.frames * 0.55 + 20, `about one request per clip frame (${r.F.pool.stats.requested} for ${r.shown.length} shown)`);
  assert.deepEqual(r.shown.slice(0, 3).map((s) => s.idx), [0, 1, 2]);
  // HAP Q at 60 fps with 20 ms of latency on 2 workers: the window keeps it on time too
  const q = await playFor({ seconds: 3, fps: 60, workers: 2, latency: () => 20 });
  assert.equal(q.late, 0, `HAP Q at 60 on two workers: ${q.late} late`);
  const kq = requestWindow(60, q.pl.lat);
  assert.ok(q.maxOpen <= kq.L + kq.K + 1 + 2 + 6, `bounded (${q.maxOpen})`);
});

test('hap player: with 100 ms of latency the window asks L frames ahead and stays on time; the latency is measured', async () => {
  const r = await playFor({ seconds: 4, fps: 30, workers: 4, latency: () => 100, warm: 1000 }); // (the latency is learnt in the first second)
  assert.ok(Math.abs(r.pl.lat - 100) < 1, `measured latency ${r.pl.lat}`);
  const { L, K } = requestWindow(30, r.pl.lat);
  assert.equal(L, 3, 'L = ⌈100 ms · 30 fps⌉');
  assert.equal(r.pl.need[0], r.pl.quiere + L, 'the first frame asked for is playhead + L');
  assert.equal(r.pl.need.length, K + 1);
  // Fails if the window starts at the playhead: every frame would arrive 100 ms (3 frames) after it was wanted
  assert.equal(r.late, 0, `${r.late} late frames`);
  assert.deepEqual([requestWindow(30, 30), requestWindow(60, 2000)], [{ K: 5, L: 1 }, { K: 8, L: 12 }], 'K = max(2, min(8, ⌈fps·0.12⌉ + 1)), L ≤ 12');
});

test('hap player: a frame that comes late but is newer than the one on screen is shown; one of an earlier trajectory is not', () => {
  const B = bitmaps(), shown = [];
  const pl = new HapPlayer({ path: 'c.mov', deliver: (bm, idx) => { bm.close(); shown.push(idx); } });
  pl.setInfo(IX({ count: 100 }));
  const ask = () => { const r = pl.next(); pl.pend.add(r.idx); pl.pendT.set(r.idx, 0); return r.idx; };
  pl.drive(10, { fps: 30 });
  assert.equal(ask(), 10, 'the first drive asks for the wanted frame first');
  pl.drive(11, { fps: 30 }); pl.drive(12, { fps: 30 });
  // frame 10 arrives with the playhead at 12 and nothing on screen: late, but newer → shown
  pl.arrive(10, B.make(10), pl.tray, 40);
  // Fails if a late frame is thrown away "for being old" (VEATION's first version: 2 frames a second with two layers)
  assert.deepEqual(shown, [10]);
  pl.arrive(9, B.make(9), pl.tray, 40);
  assert.deepEqual(shown, [10], 'older than what is on screen: not shown');
  // a jump (seek / wrap) while frame 13 of the old trajectory is in flight
  pl.pend.add(13);
  const oldTray = pl.tray;
  pl.drive(40, { fps: 30 });
  assert.equal(pl.tray, oldTray + 1, 'a jump is a new trajectory');
  pl.arrive(13, B.make(13), oldTray, 40);
  // Fails without the trajectory rule: frame 13 would be shown with the clock at 40
  assert.deepEqual(shown, [10], 'the old trajectory\'s frame is not shown');
  assert.equal(B.live.size, 0, 'and every bitmap that was not kept is closed');
});

test('hap player: parking closes every ImageBitmap it holds (cache and loop prefetch); frames that come back to a parked player are closed at once', async () => {
  const r = await playFor({ seconds: 0.95, fps: 30, count: 30, workers: 4, latency: () => 200 }); // near the wrap (the prefetch is out), frames in flight
  const { pl, F } = r;
  assert.ok(pl.held > 0, `it held ${pl.held} bitmaps`);
  assert.ok(pl.wrap && pl.wrapNeed, 'the loop prefetch was prepared');
  const inFlight = pl.pend.size;
  pl.park();
  // Fails if parking keeps the cache or the prefetch (VEATION R400: ~3 GB of VRAM that never came back)
  assert.equal(pl.held, 0);
  await F.step(F.clock.now + 200); // what was in flight comes back
  assert.ok(inFlight > 0 && pl.stats.dropped >= inFlight, `the ${inFlight} frames in flight were closed when they came back`);
  assert.equal(F.B.live.size, 0, 'no bitmap open at all');
  assert.equal(pl.next(), null, 'a parked player asks for nothing');
  pl.drive(5, { fps: 30, last: 29 }); // drawn again: it asks from where the clock is
  assert.equal(Math.min(...pl.pend), 5);
  pl.close();
  await F.step(F.clock.now + 200);
  assert.equal(F.B.live.size, 0);
});

test('hap player: at the wrap of a loop the first frame shown is frame 0 — in that very output frame, never the old last one', async () => {
  const r = await playFor({ seconds: 3.4, fps: 30, count: 30, workers: 4, latency: () => 12 });
  const wraps = []; for (let i = 1; i < r.shown.length; i++) if (r.shown[i].idx < r.shown[i - 1].idx) wraps.push({ first: r.shown[i].idx, at: r.shown[i].t });
  assert.equal(wraps.length, 3, 'three wraps in 3.4 s of a 1 s loop');
  assert.ok(wraps.every((w) => w.first === 0), `the first frame after each wrap: ${wraps.map((w) => w.first)}`);
  // Fails without the prefetch (wrapTo): frame 0 is asked for only at the wrap, so it is late and the old last frame
  // stays on screen for at least one output frame (the fault that closed R401 in VEATION)
  assert.equal(r.late, 0, `${r.late} late output frames`);
  assert.ok(r.pl.stats.wrapsAdopted >= 3, 'the prefetched frames were adopted at the wrap');
  const no = await playFor({ seconds: 3.4, fps: 30, count: 30, workers: 4, latency: () => 12, wrap: false });
  assert.ok(no.late >= 3, `the control: without the prefetch every wrap is late (${no.late})`);
});

test('frame clock: a 60 fps clip on a 60 Hz output with ±4 ms of jitter on the frame times — no repeats, no skips; the clock read at compose time has both', () => {
  // seeded jitter
  let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const P = 1000 / 60, fps = 60;
  const run = (locked, clipFps = fps) => {
    const lock = new FrameLock(P);
    let prev = null, repeats = 0, skips = 0, news = 0;
    for (let n = 0; n < 600; n++) {
      const tTrue = 1000 + n * P, tSeen = tTrue + (rnd() - 0.5) * 8; // what a compose-time clock reads: the vsync ± 4 ms
      const target = tSeen / 1000;                                   // the boundaries fall exactly on the vsyncs (the worst case)
      const el = locked ? lock.step(tTrue, target, clipFps) : target;
      const f = Math.floor(el * clipFps + 1e-9);
      if (prev !== null) { const d = f - prev; if (d === 0) repeats++; else if (d > 1) skips += d - 1; else if (d === 1) news++; }
      prev = f;
    }
    return { repeats, skips, news };
  };
  const naive = run(false), lock = run(true);
  // Fails if the playhead is taken from a clock that trembles at compose time (MEDIA-SERVER-MEDIDAS.md §8.3: 58.5/s with
  // skips and repeats): the locked clock advances one clip frame per output frame
  assert.ok(naive.repeats > 50 && naive.skips > 50, `the control (no lock): ${JSON.stringify(naive)}`);
  assert.deepEqual([lock.repeats, lock.skips], [0, 0], `locked: ${JSON.stringify(lock)}`);
  // 30 fps on 60: a new frame every second output frame, exactly
  const half = run(true, 30);
  assert.equal(half.skips, 0); assert.ok(half.news >= 298 && half.news <= 300, `${half.news} new frames in 600 output frames`);
  // the bias puts the boundaries half way between output frames
  assert.equal(centre(10, 1), 0.5); assert.equal(centre(10.5, 1), 0); assert.equal(centre(3, 0.5), 0.25); assert.equal(centre(3.25, 0.5), 0); assert.equal(centre(1, 0.4167), 0);
  // the page's estimate of the engine clock converging after the page opened: 90 ms of catch-up in its first second
  // (clock.js follows the quickest message at up to 3 ms per message). Fails if the lock creeps too slowly: with a cap of
  // 0.5 ms per frame the picture fell 100 ms behind the clock before it jumped (measured in the page test below)
  const L3 = new FrameLock(P); let worst = 0;
  for (let n = 0; n < 180; n++) { const t = n * P, target = t / 1000 + Math.min(t, 1000) * 0.00009, el = L3.step(t, target, 30) - L3.bias / 30; if (n > 10) worst = Math.max(worst, Math.abs(target - el)); }
  assert.ok(worst < 0.012 && L3.jumps === 1, `the lock follows a converging clock within ${Math.round(worst * 1000)} ms, without jumping (${L3.jumps})`);
  // the first step OFF the output's grid (a preroll compose 10 ms early), then regular frames at 0.34 / 0.84 of a clip
  // frame and a clock estimate that trembles by ±1 ms: after the first frames the frame shown is always the clock's.
  // Fails without the re-centring of the bias: taken off the grid (+0.21), it put the composes at 0.05 of a frame past a
  // boundary — every other frame one ahead of the clock (the page test saw it: 32 of 68 frames, clock at 0.84)
  const L4 = new FrameLock(P), pos = (t) => (t / 1000) * 30 + 0.34; let flips = 0;
  L4.step(990, pos(990) / 30, 30);
  for (let n = 1; n < 300; n++) {
    const t = 1000 + n * P, el = L4.step(t, pos(t) / 30 + (rnd() - 0.5) * 0.002, 30);
    if (n > 20 && Math.floor(el * 30 + 1e-9) !== Math.floor(pos(t))) flips++;
  }
  assert.equal(flips, 0, `frames one off the clock after an off-grid start: ${flips} (re-centred ${L4.recentred})`);
  // a jump (a restart, a new engine clock) is taken as it is
  const L2 = new FrameLock(P); L2.step(0, 1, 60); const back = L2.step(P, 5, 60);
  assert.ok(Math.abs(back - 5) < 0.01 && L2.jumps === 2, 'a target 4 s away is taken at once');
});

test('media layers: place (canvas / wall / walls; stretch / fit / fill), the crossfade weights, the loop prefetch targets, library paths', () => {
  const prof = { canvas: { width: 7196, height: 912 }, walls: [{ id: 'P4', pixelRect: { x: 0, y: 0, w: 1912, h: 912 } }, { id: 'P1', pixelRect: { x: 1912, y: 0, w: 1692, h: 912 } }, { id: 'P2', pixelRect: { x: 3604, y: 100, w: 1920, h: 712 } }] };
  const size = { w: 1799, h: 228 }, clip = { width: 7196, height: 912 };
  assert.deepEqual(placeRect(null, clip, prof, size), { dst: null, src: null }, 'default: the whole image, stretched');
  assert.deepEqual(placeRect({ target: 'wall', wallId: 'P1', fit: 'stretch' }, clip, prof, size).dst, { x: 478, y: 0, w: 423, h: 228 });
  assert.deepEqual(placeRect({ target: 'wall', wallId: 'nope' }, clip, prof, size).dst, null, 'an unknown wall: the canvas');
  assert.deepEqual(placeRect({ target: 'walls' }, clip, prof, { w: 7196, h: 912 }).dst, { x: 0, y: 0, w: 5524, h: 912 }, 'walls: the box around every wall');
  assert.deepEqual(placeRect({ target: 'walls' }, clip, { ...prof, walls: [...prof.walls, { id: 'P3', pixelRect: { x: 5524, y: 0, w: 1672, h: 912 } }] }, size).dst, null, 'walls that cover the canvas: the whole image');
  const fit = placeRect({ target: 'wall', wallId: 'P1', fit: 'fit' }, { width: 256, height: 32 }, prof, { w: 7196, h: 912 }).dst;
  assert.deepEqual([fit.x, fit.w, Math.round(fit.h), Math.round(fit.y)], [1912, 1692, 212, 350], 'fit: the whole clip, centred, black above and below');
  const fill = placeRect({ target: 'wall', wallId: 'P1', fit: 'fill' }, { width: 256, height: 32 }, prof, { w: 7196, h: 912 });
  assert.deepEqual(fill.dst, { x: 1912, y: 0, w: 1692, h: 912 }, 'fill covers the wall');
  assert.ok(Math.abs(fill.src[0] - (1 - (1692 / (256 * (912 / 32)))) / 2) < 1e-9 && fill.src[1] === 0 && fill.src[3] === 1, `and crops the clip's sides: ${fill.src}`);
  // the weights: crossfade, a launch on an empty layer, an eject
  assert.deepEqual(fadeOf({ play: {}, from: {}, fadeAt: 1000, transitionMs: 2000 }, 2000), { play: 0.5, from: 0.5, k: 0.5 });
  assert.deepEqual(fadeOf({ play: {}, from: null, fadeAt: 1000, transitionMs: 500 }, 1250).play, 0.5, 'fades in');
  assert.deepEqual(fadeOf({ play: null, from: {}, fadeAt: 1000, transitionMs: 500 }, 1500).from, 0, 'faded out');
  assert.deepEqual(fadeOf({ play: {}, from: {}, fadeAt: 1000, transitionMs: 0 }, 999), { play: 0, from: 1, k: 0 }, 'a cut: the old one until fadeAt');
  // the prefetch: the segment's first frames near the end of a loop; the turn of a bounce; nothing for hold / clear / an autopilot's last pass
  const p = { in: 1, out: 3, fps: 30, frames: 300, end: 'loop', loops: 1 };
  assert.deepEqual(segmentOf(p), { first: 30, last: 89 });
  assert.equal(wrapTargets(p, { frame: 60, dir: 1, pass: 0 }, 6, 30, 12), null, 'far from the wrap');
  assert.deepEqual(wrapTargets(p, { frame: 85, dir: 1, pass: 0 }, 6, 30, 12), [30, 31, 32]);
  assert.deepEqual(wrapTargets({ ...p, end: 'bounce' }, { frame: 86, dir: 1, pass: 0 }, 6, 30, 12), [88, 87]);
  assert.deepEqual(wrapTargets({ ...p, end: 'bounce' }, { frame: 32, dir: -1, pass: 1 }, 6, 30, 12), [31, 32]);
  assert.equal(wrapTargets({ ...p, end: 'hold' }, { frame: 88, dir: 1, pass: 0 }, 6, 30, 12), null);
  assert.equal(wrapTargets({ ...p, end: 'next', loops: 2 }, { frame: 88, dir: 1, pass: 1 }, 6, 30, 12), null, 'last pass of an autopilot: the next clip is its own play');
  assert.deepEqual(wrapTargets({ ...p, end: 'next', loops: 2 }, { frame: 88, dir: 1, pass: 0 }, 6, 30, 12), [30, 31, 32]);
  assert.equal(libraryFile('C:\\Media\\', 'shw/a b.mov'), 'C:\\Media\\shw\\a b.mov');
  assert.equal(libraryFile('/srv/media', 'shw/a.mov'), '/srv/media/shw/a.mov');
});

// ------------------------------------------------------------------------------------------------ the engine

const vid = (fourcc, frames, fps = 30, w = 256, h = 32) => ({ fourcc, width: w, height: h, fps, frames, duration: frames / fps });

/** A show of tiny HAP files written into the engine's library: [{id, file, opts, clip}] → media + clips. */
function writeShow(engine, store, { files, layers, decks }) {
  const lib = engine.media.libraryDir, media = [], clips = [], truth = {};
  for (const f of files) {
    const abs = path.join(lib, 'f6', f.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    truth[f.id] = writeHap(abs, { width: 256, height: 32, fps: 30, ...f.opts });
    const t = truth[f.id];
    media.push({ id: `m-${f.id}`, file: `f6/${f.file}`, size: fs.statSync(abs).size, video: vid(t.fourcc, t.frames, f.opts.fps || 30, t.width, t.height), audio: null });
    clips.push({ id: f.id, mediaId: `m-${f.id}`, end: 'loop', ...f.clip });
  }
  store.saveShow(normalizeShow({ id: 'f6', name: 'F6', media, clips, layers, decks: decks || [{ id: 'D1', columns: 8, cells: Object.fromEntries(files.map((f, i) => [`${f.clip?.layer || 'L1'}:${i}`, f.id])) }] }));
  return { lib, truth, abs: (id) => path.join(lib, 'f6', files.find((f) => f.id === id).file) };
}

// Fails if the engine ejects a clip a page could not play at once (the plan: it holds 1 s on the page, then goes with
// its layer's transition), if no 'error' event goes out, or if the late-frame figures are lost.
test('engine: media.report {playId, error} ejects the clip with its layer\'s transition and sends mediaEvent error; late frames are logged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-f6-'));
  const warns = [];
  const log = { ...quiet, warn: (m) => warns.push(m) };
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log, version: 'test' });
  engine.start();
  try {
    writeShow(engine, store, { files: [{ id: 'cA', file: 'a.mov', opts: { frames: 6 } }], layers: [{ id: 'L1', transitionMs: 700 }] });
    await engine.command('show.load', { id: 'f6' });
    const events = [];
    engine.on('mediaEvent', (e) => events.push(e));
    const { playId } = await engine.command('clip.trigger', { clipId: 'cA' });
    const r = await engine.command('media.report', { playId, error: 'read: short read (the file was cut short or its drive removed)' });
    assert.deepEqual(r, { ejected: true });
    const L1 = engine.state().media.layers.L1;
    assert.deepEqual([L1.state, L1.play, L1.from?.playId, L1.transitionMs], ['empty', null, playId, 700], 'ejected through the layer\'s transition');
    assert.ok(events.some((e) => e.event === 'error' && e.playId === playId && /short read/.test(e.error)), `mediaEvent error: ${JSON.stringify(events)}`);
    assert.deepEqual(await engine.command('media.report', { playId, error: 'again' }), { ejected: false }, 'a play already gone: nothing');
    await engine.command('media.report', { late: 12, frames: 290, seconds: 5, layers: { L1: 12 } });
    await engine.command('media.report', { late: 3, frames: 290, seconds: 5, layers: { L1: 3 } });
    assert.equal(warns.filter((w) => /clip frame\(s\) late/.test(w)).length, 1, `one log line, throttled: ${warns.join(' | ')}`);
    assert.match(warns.find((w) => /late/.test(w)), /12 clip frame\(s\) late in 5 s \(L1 12\)/);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('server: /shared/mov.js and /shared/hap.js are the engine\'s own modules (mov.js imports ./hap.js)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-f6-'));
  const engine = new Engine({ store: new Store(dir, null, quiet), log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  try {
    const get = (p) => new Promise((res, rej) => http.get(`http://127.0.0.1:${server.port}${p}`, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => res({ status: r.statusCode, type: r.headers['content-type'], body: b })); }).on('error', rej));
    for (const [p, f] of [['/shared/mov.js', 'mov.js'], ['/shared/hap.js', 'hap.js']]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.type, /javascript/);
      assert.equal(r.body, fs.readFileSync(path.join(root, 'engine', 'media', f), 'utf8'));
    }
    assert.match((await get('/shared/mov.js')).body, /from '\.\/hap\.js'/, 'its import resolves to /shared/hap.js');
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------------------------------------ in the output window

/**
 * A test engine with the simulated room (no experience, output on at scale 0.25: 1799×228), the show of `files`, and
 * a control server the page can call (`ctl(path)` → handlers[path]() in this process), then `script` in the output page
 * in the app's output window (tests/ui/runner.cjs --output-window). → {result, errors, refused, url, rig}
 */
async function inOutput(script, { files, layers, handlers = {}, setup } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-f6-'));
  const rig = { dir, events: [], hits: [] };
  const boot = async (port = 0) => {
    rig.store = new Store(dir, path.join(root, 'profiles'), quiet);
    rig.engine = new Engine({ store: rig.store, log: quiet, version: 'test' });
    rig.engine.start();
    rig.engine.on('mediaEvent', (e) => rig.events.push(e));
    rig.server = await createServer(rig.engine, { port, root, log: quiet });
    rig.engine.port = rig.server.port;
  };
  const down = async () => { rig.server?.close(); await rig.engine?.stop(); rig.server = null; rig.engine = null; };
  rig.boot = boot; rig.down = down;
  await boot();
  const ctl = http.createServer(async (req, res) => {
    const key = req.url.slice(1).split('?')[0];
    rig.hits.push(key);
    let out = {};
    try { out = (await handlers[key]?.(rig)) ?? {}; } catch (e) { out = { error: e.message }; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out));
  });
  await new Promise((r) => ctl.listen(0, '127.0.0.1', r));
  rig.ctlPort = ctl.address().port;
  try {
    const { engine, store } = rig;
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0;
    p.experience = normalizeProfile({}).experience;
    p.output = { ...normalizeProfile({}).output, on: true, scale: 0.25 };
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    if (files) Object.assign(rig, writeShow(engine, store, { files, layers }));
    if (files) await engine.command('show.load', { id: 'f6' });
    if (setup) await setup(rig);
    const file = path.join(dir, 'script.js');
    const G = layout(256, 32).stripe;
    fs.writeFileSync(file, `const CTL = ${rig.ctlPort}, NEED_SHOW = ${!!files}, G = ${JSON.stringify({ ...G, cw: 256, ch: 32 })};\n${PAGE_LIB}\n${script}`);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${rig.server.port}/output?run=1`, `--script=${file}`, '--wait=load', '--output-window', '--w=640', '--h=200'];
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the UI runner: ${outText.slice(0, 800)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, rig };
  } finally {
    ctl.close();
    await down();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Helpers for the page scripts: the mixer's image, the clip's stripe and markers read back from it. */
const PAGE_LIB = `
const { store, cmd } = await import('/js/conn.js');
const { playhead } = await import('/shared/transport.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(15); return !!f(); };
const ctl = (k) => fetch('http://127.0.0.1:' + CTL + '/' + k).then((r) => r.json());
await until(() => window.__out && window.__out.mixer() && store.state && (store.state.show || !NEED_SHOW) && window.__out.clock.ready, 12000);
const O = window.__out, M = O.media, m = O.mixer(), W = m.width, H = m.height;
const px = (x, y) => [...m.readFbo(Math.round(x), Math.round(y), 1, 1)].slice(0, 3);
/** the frame number of a 256×32 clip drawn over rect r (FBO px, y from the top), from its stripe */
const stripeAt = (r = { x: 0, y: 0, w: W, h: H }) => {
  const sx = r.w / G.cw, sy = r.h / G.ch, row = m.readFbo(0, Math.round(r.y + ((G.y0 + G.y1) / 2) * sy), W, 1); let f = 0;
  for (let b = 0; b < G.bits; b++) { const i = Math.round(r.x + (G.x0 + b * G.cell + G.cell / 2) * sx) * 4; if (row[i] + row[i + 1] + row[i + 2] > 384) f |= 1 << b; }
  return f;
};
/** the stripe's cells as grey levels (crossfades) */
const cellsAt = (r = { x: 0, y: 0, w: W, h: H }) => {
  const sx = r.w / G.cw, sy = r.h / G.ch, row = m.readFbo(0, Math.round(r.y + ((G.y0 + G.y1) / 2) * sy), W, 1), out = [];
  for (let b = 0; b < G.bits; b++) { const i = Math.round(r.x + (G.x0 + b * G.cell + G.cell / 2) * sx) * 4; out.push(Math.round((row[i] + row[i + 1] + row[i + 2]) / 3)); }
  return out;
};
const corners = (r = { x: 0, y: 0, w: W, h: H }) => { const sx = r.w / G.cw, sy = r.h / G.ch; return { tl: px(r.x + 4 * sx, r.y + 4 * sy), tr: px(r.x + (G.cw - 4) * sx, r.y + 4 * sy), bl: px(r.x + 4 * sx, r.y + (G.ch - 4) * sy), br: px(r.x + (G.cw - 4) * sx, r.y + (G.ch - 4) * sy) }; };
const P = (layer) => M.info().players.find((p) => p.layerId === layer && (!store.state.media.layers[layer]?.play || p.playId === store.state.media.layers[layer].play.playId));
`;

const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('output page: a launched clip shows the frame the clock says, the right way up, without skips; the loop wraps to frame 0 at once; calibration parks it and it comes back to the clock; a crossfade is the mean of the two clips; an eject frees it', opt, async () => {
  const { result: r, errors } = await inOutput(`
    const out = {};
    // the page's estimate of the engine clock settles first (in the room the output page is up long before a launch;
    // right after it opens the estimate still moves by a few ms per message and the clip follows it ~5 ms behind)
    await until(() => O.clock.samples >= 60, 6000);
    await cmd('clip.trigger', { clipId: 'cA', transitionMs: 0 });          // a 1 s loop of 30 frames, the whole image
    await until(() => P('L1')?.ready && P('L1').seq.newFrames > 8, 8000);
    // (1) the frame at the clock's instant, read from the image (sampled ~27 times a second for 2.6 s)
    const s0 = P('L1').seq, e0 = M.last.L1.tEng, samples = [], t0 = performance.now();
    while (performance.now() - t0 < 2600) {
      const L = M.last.L1, pl = store.state.media.layers.L1.play;
      if (L && L.play && pl) { const e = ((L.tEng - pl.startAt) / 1000 + (pl.offset || 0)) * pl.fps; samples.push({ want: L.play.frame, shown: L.play.shown, stripe: stripeAt(), clock: playhead(pl, L.tEng).frame, frac: e - Math.floor(e), lag: Math.round((L.play.target - L.play.el) * 1000) }); }
      await wait(37);
    }
    const s1 = P('L1').seq, e1 = M.last.L1.tEng;
    out.seq = { clockFrames: ((e1 - e0) / 1000) * 30, frames: s1.frames - s0.frames, newFrames: s1.newFrames - s0.newFrames, skipped: s1.skipped - s0.skipped, late: s1.late - s0.late, wrapLog: s1.wrapLog };
    out.samples = samples; out.corners = corners(); out.timing = O.stats.timing;
    // (2) calibration mode: the players park (no decoding, no bitmaps); back, they are where the clock is
    await cmd('calib.start', { wallId: 'P1', force: true });
    await until(() => !O.layers().includes('media'));
    await wait(300);
    const q0 = M.info();
    await wait(500);
    const q1 = M.info();
    out.calib = { parked: q1.players.map((p) => p.parked), held: q1.players.map((p) => p.held), requested: q1.pool.requested - q0.pool.requested };
    await cmd('calib.cancel');
    await until(() => O.layers().includes('media'));
    await wait(700);
    { const L = M.last.L1, pl = store.state.media.layers.L1.play; out.back = { want: L.play.frame, shown: L.play.shown, stripe: stripeAt(), clock: playhead(pl, L.tEng).frame, parked: P('L1').parked }; }
    // (3) a crossfade to another clip over 2 s: half way, the stripe is the mean of both
    await cmd('clip.trigger', { clipId: 'cB', layerId: 'L1', transitionMs: 2000 });
    await until(() => { const L = M.last.L1; return L && L.from && L.play && L.wB > 0 && Math.abs(L.k - 0.5) < 0.08; }, 6000);
    { const L = M.last.L1; out.fade = { k: L.k, a: L.from.shown, b: L.play.shown, cells: cellsAt(), players: M.info().players.length }; }
    // (4) an eject: once its transition is over, nothing is left (players, bitmaps) and the image is black
    await until(() => !M.last.L1?.from, 4000);
    await cmd('layer.clear', { layerId: 'L1', transitionMs: 200 });
    await until(() => !store.state.media.layers.L1.play && !store.state.media.layers.L1.from, 3000);
    await wait(300);
    out.cleared = { players: M.info().players.length, centre: px(W / 2, H / 2), busy: M.busy };
    out.info = M.info();
    return out;`, {
    files: [{ id: 'cA', file: 'a.mov', opts: { frames: 30 } }, { id: 'cB', file: 'b.mov', opts: { frames: 60 }, clip: { layer: 'L1' } }],
    layers: [{ id: 'L1', transitionMs: 0 }],
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const S = r.samples;
  assert.ok(S.length > 40, `${S.length} samples`);
  // the image IS the frame the player says it shows (the stripe read back from the mixer's image)
  const mism = S.filter((s) => s.stripe !== s.shown);
  assert.ok(mism.length === 0, `stripe vs shown: ${JSON.stringify(mism.slice(0, 5))}`);
  // Fails if the frame index is off by one (e.g. floor(time·fps) − 1, or pts read one sample late): the frame shown is
  // the one of the engine's clock at the frame's instant. (The lock's half-step bias only moves WHERE inside a clip frame
  // the output frames fall — 30 on 60: at its ¼ and ¾ —, never which clip frame; only a lock error over ¼ of a clip
  // frame, 8 ms, could show the neighbour. A sampling window by phase would alias: the composes hit two phases a run.)
  const off = S.filter((s) => s.shown !== s.clock && Math.abs(s.shown - s.clock) < 28);
  assert.ok(off.length <= S.length * 0.05, `frame vs clock: ${off.length} of ${S.length} off ${JSON.stringify(off.slice(0, 5))} lags ${S.map((s) => s.lag).join(' ')} timing ${JSON.stringify(r.timing)}`);
  assert.ok(S.every((s) => Math.abs(s.shown - s.clock) <= 1 || Math.abs(s.shown - s.clock) >= 28), 'never more than one frame from the clock (± the wrap)');
  // 30 fps on a 60 Hz output for 2.6 s: a new frame every other output frame, none skipped
  assert.equal(r.seq.skipped, 0, `skipped ${JSON.stringify(r.seq)}`);
  assert.ok(Math.abs(r.seq.newFrames - r.seq.clockFrames) <= 2, `new frames ${r.seq.newFrames} for ${r.seq.clockFrames.toFixed(1)} frames of the engine clock (${r.seq.frames} output frames)`);
  assert.ok(r.seq.newFrames <= r.seq.frames / 2 + 6, 'never more than one new frame per two output frames, but for the clock catching up');
  assert.ok(r.seq.late <= 2, `late output frames: ${r.seq.late}`);
  // orientation: the clip's corner markers in the image's corners. Fails if the worker draws without its flip (as
  // VEATION does: its textures are bottom-row-first) — measured: blue top-left, red bottom-left
  // (the stripe alone cannot tell: it is in the middle rows)
  assert.ok(near(r.corners.tl, MARKERS.topLeft, 40) && near(r.corners.tr, MARKERS.topRight, 40) && near(r.corners.bl, MARKERS.bottomLeft, 40) && near(r.corners.br, MARKERS.bottomRight, 40), `corners ${JSON.stringify(r.corners)}`);
  // Fails without the loop prefetch: at each wrap the old last frame stays for an output frame or more (late > 0)
  assert.ok(r.seq.wrapLog.length >= 2, `wraps seen: ${JSON.stringify(r.seq.wrapLog)}`);
  assert.ok(r.seq.wrapLog.every((w) => w.first === 0 && w.late === 0), `after each wrap: ${JSON.stringify(r.seq.wrapLog)}`);
  // calibration
  assert.ok(r.calib.parked.length && r.calib.parked.every(Boolean), `parked: ${JSON.stringify(r.calib)}`);
  assert.ok(r.calib.held.every((h) => h === 0), 'no bitmap held while parked');
  assert.equal(r.calib.requested, 0, 'nothing decoded in calibration mode');
  assert.ok(!r.back.parked && r.back.shown === r.back.stripe && Math.abs(r.back.shown - r.back.clock) <= 1, `back at the clock: ${JSON.stringify(r.back)}`);
  // the crossfade: each stripe cell = 255 · (bitA · (1 − k) + bitB · k)
  const bit = (f, b) => (f >> b) & 1;
  const want = r.fade.cells.map((_, b) => 255 * (bit(r.fade.a, b) * (1 - r.fade.k) + bit(r.fade.b, b) * r.fade.k));
  assert.ok(r.fade.a !== r.fade.b, 'two different frames');
  assert.ok(near(r.fade.cells, want, 10), `mid-crossfade (k ${r.fade.k}, frames ${r.fade.a} / ${r.fade.b}): ${r.fade.cells} vs ${want.map(Math.round)}`);
  assert.equal(r.fade.players, 2, 'two players during the crossfade');
  // the eject
  assert.equal(r.cleared.players, 0, 'no player left');
  assert.ok(near(r.cleared.centre, [0, 0, 0], 1), `black (${r.cleared.centre})`);
  assert.equal(r.cleared.busy, false);
  console.log(`  clip player: ${r.timing?.fps} fps composed, latency ${JSON.stringify(r.info.pool)}`);
});

/** The colour a correct decoder gives at clip pixel (x, y) of frame f: the picture through DXT's 5:6:5 endpoints (the
 *  test clips' 4×4 blocks are single colours), premultiplied when the clip has alpha (the mixer composes on black). */
function expectedPx(f, x, y, alpha) {
  const p = picture(f, 256, 32), o = (y * 256 + x) * 4;
  const q = (v, bits) => { const k = v >> (8 - bits); return bits === 5 ? (k << 3) | (k >> 2) : (k << 2) | (k >> 4); };
  const rgb = [q(p[o], 5), q(p[o + 1], 6), q(p[o + 2], 5)];
  return alpha ? rgb.map((v) => (v * p[o + 3]) / 255) : rgb;
}

test('output page: HAP, HAP Alpha (premultiplied) and HAP Q decode right, each placed on its wall (stretch, and fit with black bands); the right way up', opt, async () => {
  const PTS = [[40, 2], [200, 2], [56, 26], [184, 26]]; // band centres, off the markers and the stripe (x ≥ 128: alpha 128 in the clips)
  const { result: r, errors } = await inOutput(`
    for (const [clipId, layerId] of [['cH', 'L1'], ['cQ', 'L2'], ['cAl', 'L3']]) await cmd('clip.trigger', { clipId, layerId, transitionMs: 0 });
    await until(() => ['L1', 'L2', 'L3'].every((l) => P(l)?.ready && P(l).shown === 3), 8000);
    await wait(200);
    const prof = store.state.profile, k = W / prof.canvas.width;
    const wall = (id) => { const r = prof.walls.find((w) => w.id === id).pixelRect; return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }; };
    const at = (rc, cx, cy) => px(rc.x + (cx + 0.5) * rc.w / G.cw, rc.y + (cy + 0.5) * rc.h / G.ch);
    const out = { fourcc: Object.fromEntries(['L1', 'L2', 'L3'].map((l) => [l, P(l).fourcc])), shown: Object.fromEntries(['L1', 'L2', 'L3'].map((l) => [l, P(l).shown])) };
    const P1 = wall('P1'), fitH = P1.w * G.ch / G.cw, fitted = { x: P1.x, y: P1.y + (P1.h - fitH) / 2, w: P1.w, h: fitH };
    out.q = { corners: corners(wall('P2')), pts: ${JSON.stringify(PTS)}.map(([x, y]) => at(wall('P2'), x, y)), frame: stripeAt(wall('P2')) };
    out.al = { corners: corners(wall('P3')), pts: ${JSON.stringify(PTS)}.map(([x, y]) => at(wall('P3'), x, y)), frame: stripeAt(wall('P3')) };
    out.h = { corners: corners(fitted), pts: ${JSON.stringify(PTS)}.map(([x, y]) => at(fitted, x, y)), frame: stripeAt(fitted), above: px(P1.x + P1.w / 2, P1.y + 4), below: px(P1.x + P1.w / 2, P1.y + P1.h - 4) };
    out.p4 = px(wall('P4').x + wall('P4').w / 2, H / 2);
    return out;`, {
    files: [
      { id: 'cH', file: 'h.mov', opts: { variant: 'hap', frames: 4 }, clip: { end: 'hold', layer: 'L1', place: { target: 'wall', wallId: 'P1', fit: 'fit' } } },
      { id: 'cQ', file: 'q.mov', opts: { variant: 'hapq', frames: 4, hap: { chunks: 3 } }, clip: { end: 'hold', layer: 'L2', place: { target: 'wall', wallId: 'P2' } } },
      { id: 'cAl', file: 'al.mov', opts: { variant: 'hapa', frames: 4 }, clip: { end: 'hold', layer: 'L3', place: { target: 'wall', wallId: 'P3' } } },
    ],
    layers: [{ id: 'L1', transitionMs: 0 }, { id: 'L2', transitionMs: 0 }, { id: 'L3', transitionMs: 0 }],
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.deepEqual(r.fourcc, { L1: 'Hap1', L2: 'HapY', L3: 'Hap5' });
  assert.deepEqual(r.shown, { L1: 3, L2: 3, L3: 3 }, 'held on the last frame');
  for (const [k, v] of Object.entries({ h: r.h, q: r.q, al: r.al })) {
    assert.equal(v.frame, 3, `${k}: the stripe says frame 3`);
    // Fails if a variant is drawn upside down or mirrored
    assert.ok(near(v.corners.tl, MARKERS.topLeft, 48) && near(v.corners.tr, MARKERS.topRight, 48) && near(v.corners.bl, MARKERS.bottomLeft, 48) && near(v.corners.br, MARKERS.bottomRight, 48), `${k} corners ${JSON.stringify(v.corners)}`);
  }
  PTS.forEach(([x, y], i) => {
    assert.ok(near(r.h.pts[i], expectedPx(3, x, y, false), 6), `HAP at (${x}, ${y}): ${r.h.pts[i]} vs ${expectedPx(3, x, y, false).map(Math.round)}`);
    // Fails if HAP Q's scaled YCoCg is not turned back into RGB (or with the wrong scale)
    assert.ok(near(r.q.pts[i], expectedPx(3, x, y, false), 12), `HAP Q at (${x}, ${y}): ${r.q.pts[i]} vs ${expectedPx(3, x, y, false).map(Math.round)}`);
    // Fails if HAP Alpha is not premultiplied once — twice (the VEATION Mac fault) gives a quarter where alpha is 128
    assert.ok(near(r.al.pts[i], expectedPx(3, x, y, true), 6), `HAP Alpha at (${x}, ${y}): ${r.al.pts[i]} vs ${expectedPx(3, x, y, true).map(Math.round)}`);
  });
  // place: fit leaves black bands above and below on its wall; nothing on the wall without a clip
  assert.ok(near(r.h.above, [0, 0, 0], 2) && near(r.h.below, [0, 0, 0], 2), `fit: black above and below (${r.h.above} / ${r.h.below})`);
  assert.ok(near(r.p4, [0, 0, 0], 2), `P4 has no clip: black (${r.p4})`);
});

test('output page: a file cut short while it plays — its last image holds 1 s, then it goes with its layer\'s transition and mediaEvent error arrives; the engine dies — the clips play on, and pick up the restarted engine', opt, async () => {
  let port = null;
  const { result: r, errors, rig } = await inOutput(`
    const out = {};
    const prof = store.state.profile, k = W / prof.canvas.width;
    const wall = (id) => { const r = prof.walls.find((w) => w.id === id).pixelRect; return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }; };
    const rD = wall('P4'), rE = wall('P2');
    await cmd('clip.trigger', { clipId: 'cD', transitionMs: 0 });
    await cmd('clip.trigger', { clipId: 'cE', transitionMs: 0 });
    await until(() => P('L1')?.ready && P('L2')?.ready && P('L1').seq.newFrames > 10, 8000);
    const idD = P('L1').playId;
    // (1) the file of cD is cut short (as a pulled USB drive: every read fails)
    await ctl('truncate');
    await until(() => M.info().players.find((p) => p.playId === idD)?.broken, 5000);
    const t0 = performance.now(), dPlayer = () => M.info().players.find((p) => p.playId === idD);
    out.broken = dPlayer().broken;
    await wait(500);
    out.held = { frame: stripeAt(rD), corner: corners(rD).tl, state: store.state.media.layers.L1.state, reported: dPlayer()?.reported };
    await until(() => !store.state.media.layers.L1.play, 4000);
    out.ejectedAfter = Math.round(performance.now() - t0);
    out.ejected = { from: store.state.media.layers.L1.from?.playId === idD, transitionMs: store.state.media.layers.L1.transitionMs };
    await wait(150);
    out.fading = corners(rD).tl;
    await until(() => !store.state.media.layers.L1.from, 3000);
    await wait(200);
    out.gone = { corner: corners(rD).tl, player: !!dPlayer() };
    out.otherPlays = P('L2').seq.newFrames;
    // (2) the engine dies: the page keeps composing, the clip keeps advancing on the page's clock
    const idE = P('L2').playId, c0 = O.stats.composed, n0 = P('L2').seq.newFrames;
    await ctl('kill');
    await until(() => !store.connected, 4000);
    await wait(1500);
    const pE = store.state.media.layers.L2.play, L = M.last.L2;
    out.down = { connected: store.connected, composed: O.stats.composed - c0, newFrames: P('L2').seq.newFrames - n0, same: P('L2')?.playId === idE, stripe: stripeAt(rE), shown: L.play.shown, clock: playhead(pE, L.tEng).frame };
    // (3) it comes back on the same port: the page reconnects, the play goes on (same play, on the clock)
    await ctl('revive');
    await until(() => store.connected, 8000);
    await wait(800);
    { const pE2 = store.state.media.layers.L2.play, L2 = M.last.L2; out.back = { connected: store.connected, same: pE2?.playId === idE, stripe: stripeAt(rE), shown: L2.play.shown, clock: playhead(pE2, L2.tEng).frame, players: M.info().players.length }; }
    return out;`, {
    files: [
      { id: 'cD', file: 'd.mov', opts: { frames: 60 }, clip: { layer: 'L1', place: { target: 'wall', wallId: 'P4' } } },
      { id: 'cE', file: 'e.mov', opts: { frames: 60 }, clip: { layer: 'L2', place: { target: 'wall', wallId: 'P2' } } },
    ],
    layers: [{ id: 'L1', transitionMs: 400 }, { id: 'L2', transitionMs: 0 }],
    handlers: {
      truncate: (g) => { fs.truncateSync(g.abs('cD'), 0); return {}; },
      kill: async (g) => { port = g.server.port; setTimeout(() => g.down(), 10); return {}; },
      revive: async (g) => { await g.boot(port); return { port: g.server.port }; },
    },
  });
  // (the reconnecting page logs its refused connections while the engine is down)
  assert.deepEqual(errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)), [], `page errors: ${errors.join(' | ')}`);
  // (the first read fails; the worker then opens the file again and finds it empty: no index)
  assert.match(r.broken, /^(read|no-moov):/, `the player broke on the read error: ${r.broken}`);
  // Fails if a broken clip vanishes at once (or freezes the page): its last image stays for the hold
  assert.ok(r.held.frame > 0 && near(r.held.corner, MARKERS.topLeft, 48), `held on its last image: ${JSON.stringify(r.held)}`);
  assert.equal(r.held.state, 'playing', 'still on the layer during the hold');
  assert.ok(r.ejectedAfter >= 900 && r.ejectedAfter < 2500, `ejected ~1 s after it broke (${r.ejectedAfter} ms)`);
  // Fails if the engine ejects without the layer's transition (the image would cut to black)
  assert.deepEqual(r.ejected, { from: true, transitionMs: 400 }, 'through the layer\'s transition');
  assert.ok(r.fading[0] > 20 && r.fading[0] < 250, `fading out: ${r.fading}`);
  assert.ok(near(r.gone.corner, [0, 0, 0], 2) && r.gone.player === false, `gone: ${JSON.stringify(r.gone)}`);
  const err = rig.events.find((e) => e.event === 'error');
  assert.ok(err && err.clipId === 'cD' && /^(read|no-moov):/.test(err.error), `mediaEvent error: ${JSON.stringify(rig.events.filter((e) => e.event === 'error'))}`);
  // Fails if the page stops (or the players stop) when the engine goes: the room output must keep playing
  assert.equal(r.down.connected, false, 'the engine was down');
  assert.ok(r.down.composed > 60, `it kept composing (${r.down.composed} frames in 1.5 s)`);
  assert.ok(r.down.newFrames >= 40, `the clip kept advancing (${r.down.newFrames} new frames in 1.5 s at 30 fps)`);
  assert.ok(r.down.same && r.down.stripe === r.down.shown && Math.abs(r.down.shown - r.down.clock) <= 1, `on its clock: ${JSON.stringify(r.down)}`);
  assert.ok(r.back.connected && r.back.same && r.back.stripe === r.back.shown && Math.abs(r.back.shown - r.back.clock) <= 1, `back with the engine, the same play on the clock: ${JSON.stringify(r.back)}`);
  assert.equal(r.back.players, 1);
});

test('output window: only its workers have Node, and it cannot be taken off our server — the page, a frame, a new window; our own pages still load', opt, async () => {
  const { result: r, errors, refused, url, rig } = await inOutput(`
    const other = (p) => 'http://127.0.0.1:' + CTL + '/' + p;
    const out = { nodeInPage: typeof require !== 'undefined' || typeof process !== 'undefined' };
    // Node in a worker of this window (what the HAP decoders use)
    out.nodeInWorker = await new Promise((res) => { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(typeof require === "function" && typeof require("fs").readSync)'], { type: 'text/javascript' }))); w.onmessage = (e) => res(e.data); w.onerror = (e) => res('error: ' + e.message); setTimeout(() => res('timeout'), 3000); });
    // (1) the page itself to another server
    window.__mark = 'still here';
    location.href = other('elsewhere');
    await wait(1200);
    out.page = { mark: window.__mark, url: location.href };
    // (2) a frame (the experience's iframe could try): stays where it was; our own server's pages load in it
    const f = document.createElement('iframe'); document.body.append(f);
    f.src = other('frame');
    await wait(1200);
    out.frame = (() => { try { return f.contentDocument ? f.contentDocument.URL : 'cross-origin'; } catch { return 'cross-origin'; } })();
    f.src = '/api/health';
    await until(() => { try { return f.contentDocument?.URL?.endsWith('/api/health'); } catch { return false; } }, 3000);
    out.frameOwn = (() => { try { return f.contentDocument.URL; } catch { return 'cross-origin'; } })();
    // (3) a new window
    out.popup = window.open(other('popup')) === null;
    await wait(300);
    // (4) the control: a navigation to our own server goes through (the runner reports where the page ends up)
    setTimeout(() => { location.href = location.origin + '/output?run=1&nav=own'; }, 30);
    return out;`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(r.nodeInPage, false, 'the page has no Node');
  assert.equal(r.nodeInWorker, 'function', 'its workers do (the HAP decoders read the disk)');
  // Fails if the guard is removed: the page leaves (this script would not even finish), the frame loads the other
  // server, the other server sees the requests
  assert.deepEqual(r.page, { mark: 'still here', url: r.page.url }, 'the page did not leave');
  assert.ok(!/elsewhere/.test(r.page.url));
  assert.equal(r.frame, 'about:blank', `the frame stayed empty (${r.frame})`);
  assert.match(r.frameOwn, /\/api\/health$/, 'our own pages load in a frame');
  assert.equal(r.popup, true, 'no new window');
  assert.deepEqual(rig.hits.filter((h) => ['elsewhere', 'frame', 'popup'].includes(h)), [], 'the other server was never reached');
  for (const p of ['elsewhere', 'frame', 'popup']) assert.ok(refused.some((u) => u.endsWith(`/${p}`)), `${p} refused: ${JSON.stringify(refused)}`);
  assert.match(url, /\/output\?run=1&nav=own$/, `the control: our own page loads (${url})`);
  // and the app wires both into its output window (the runner above uses the same module)
  const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
  const fn = main.slice(main.indexOf('function applyOutputWindow'), main.indexOf('function closeAudioWindow'));
  assert.match(fn, /guardOutputWindow\(w\.webContents,/, 'applyOutputWindow guards its window');
  assert.equal((fn.match(/outputWebPreferences\(/g) || []).length, 2, 'both kinds of output window get the output preferences');
  assert.ok(!/nodeIntegrationInWorker/.test(main.replace(fn, '')), 'no other window of the app has Node in its workers');
});
