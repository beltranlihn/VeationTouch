// "Reel" experience (experiences/reel, MEDIA-SERVER.md §6 / phase F12). The pure parts run in Node: the state machine
// (states.js), what a hand touches with dwell and hold (hit.js), where everything goes on the walls in metres (layout.js,
// with the XR Lab profile). The page itself runs in a hidden Electron window (tests/ui/runner.cjs, as
// tests/alma-fluid.test.mjs does) against a stand-in runtime (tests/fixtures/reel/dev-runtime.js) whose hands and clips
// the test drives: the background's 360° seam, and the real flows with virtual hands (play the reel and come back, the
// projects menu, hold to exit, a clip that never starts). Each test says what breaks it ("fails if …").
// REEL_SHOTS=<folder> also renders the landing and the projects menu across the full 7196 x 912 strip into that folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { normManifest } from '../engine/experiences.js';
import { wallView } from '../experiences/runtime.js';
import { initial, step, START_TIMEOUT_MS, usable } from '../experiences/reel/states.js';
import { makeDwell, makeHold, isHit, hitRadius, MIN_HIT_M, HOLD_MS } from '../experiences/reel/hit.js';
import { landingLayout, menuLayout, blobMotion, toTarget, fitLabel, CORNER_M, REACH, BUTTON_BAND, NAME_MIN_M, NAME_SIZE_M, BACK, DRIFT, ease } from '../experiences/reel/layout.js';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'experiences', 'reel');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

/* ------------------------------------------------------------------ the package */

test('reel: manifest (slots, transparent, the director\'s defaults), files, font and its OFL licence', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const m = normManifest(raw, 'reel', dir);
  assert.equal(m.id, 'reel');
  assert.equal(m.kind, 'visual');
  assert.equal(m.transparent, true, 'it goes above the clip layers: the video shows through');
  assert.deepEqual(m.media.map((s) => [s.key, s.type, s.max]), [['reel', 'clip', 1], ['projects', 'clips', 12]]);
  assert.deepEqual(m.params.map((p) => p.key), ['dwellMs', 'holdToExit', 'idleBackS', 'menuLayout', 'buttonHeight', 'blobSize', 'brandWall', 'quality']);
  assert.equal(raw.params.length, m.params.length, 'every parameter survives the engine\'s normalisation');
  const def = Object.fromEntries(m.params.map((p) => [p.key, p.default]));
  assert.deepEqual([def.dwellMs, def.holdToExit, def.idleBackS, def.menuLayout, def.brandWall], [500, true, 60, 'per-wall', null], 'dwell 500 ms, hold to exit on, menu per wall (§10)');
  const bh = m.params.find((p) => p.key === 'buttonHeight');
  assert.ok(bh.min >= 1 && bh.max <= 1.5, 'the buttons stay within reach whatever the operator sets');
  for (const p of m.params) assert.ok(/^[\x20-\x7e]+$/.test(p.label), `${p.key}: English label`);
  for (const f of ['index.html', 'experience.js', 'states.js', 'layout.js', 'hit.js', 'blobs.js', 'gfx.js', 'assets/fonts/Raleway-VariableFont_wght.ttf']) assert.ok(fs.existsSync(path.join(dir, f)), `${f} exists`);
  for (const f of ['logo-blob.png', 'logo-wordmark.png']) assert.ok(fs.existsSync(path.join(root, 'experiences', 'alma-fluid', 'assets', f)), `the logo layer ${f} it borrows is there`);
  assert.match(fs.readFileSync(path.join(root, 'licenses', 'Raleway-OFL.txt'), 'utf8'), /Raleway Project Authors[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/);
  // the pure modules touch no DOM; every file parses
  for (const f of ['states.js', 'layout.js', 'hit.js']) assert.ok(!/document\.|window\.|addEventListener|requestAnimationFrame/.test(fs.readFileSync(path.join(dir, f), 'utf8')), `${f} is pure`);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(dir, f)]);
  // offline: nothing fetched from the internet
  for (const f of fs.readdirSync(dir).filter((x) => /\.(js|html)$/.test(x))) assert.ok(!/https?:\/\/(?!openfontlicense)/.test(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '')), `${f} loads nothing from the internet`);
});

/* ------------------------------------------------------------------ the state machine (§6.1) */

const clip = (id, extra = {}) => ({ id, name: id, duration: 10, hasAudio: true, thumb: null, missing: false, ...extra });
const CTX = (o = {}) => ({ slots: { reel: clip('reel'), projects: [clip('a'), clip('b'), clip('c')], ...o.slots }, params: { holdToExit: true, idleBackS: 60, ...o.params } });

/** Runs events through the machine; returns the last state and every action. */
function run(events, ctx = CTX(), s0 = initial(0)) {
  let s = s0;
  const actions = [];
  for (const e of events) { const r = step(s, e, ctx); s = r.state; actions.push(...r.actions); }
  return { s, actions };
}
const hit = (kind, t, index = -1) => ({ type: 'hit', target: { kind, index }, t });

test('reel: states — Play Reel plays the reel and comes back to the landing when it ends', () => {
  const { s: a, actions } = run([hit('play', 100)]);
  assert.deepEqual([a.name, a.phase, a.from, a.clipId], ['reel', 'starting', 'landing', 'reel']);
  assert.deepEqual(actions, [{ do: 'play', req: 1, clipId: 'reel' }]);
  const { s: b } = run([{ type: 'played', req: 1, playId: 'p1', clipId: 'reel', t: 150 }, { type: 'started', playId: 'p1', clipId: 'reel', t: 200 }], CTX(), a);
  assert.deepEqual([b.name, b.phase, b.playId], ['reel', 'playing', 'p1']);
  const other = run([{ type: 'ended', playId: 'p0', clipId: 'reel', t: 300 }], CTX(), b).s;
  assert.equal(other.name, 'reel', 'the end of another play changes nothing');
  const { s: c, actions: back } = run([{ type: 'ended', playId: 'p1', clipId: 'reel', reason: 'end', t: 9000 }], CTX(), b);
  assert.equal(c.name, 'landing');
  assert.deepEqual(back, [{ do: 'preload', clipIds: ['reel'] }], 'back on the landing, the reel is made ready again');
});

test('reel: states — See Projects, a blob plays its project and comes back to the menu; Back and 60 s idle go to the landing', () => {
  const m = run([hit('projects', 0)]);
  assert.equal(m.s.name, 'menu');
  assert.deepEqual(m.actions, [{ do: 'preload', clipIds: ['a', 'b', 'c'] }]);
  const p = run([hit('project', 1000, 2), { type: 'started', playId: 'q1', clipId: 'c', t: 1100 }], CTX(), m.s);
  assert.deepEqual([p.s.name, p.s.index, p.s.phase, p.s.from], ['project', 2, 'playing', 'menu'], 'the started event can come before the play\'s answer');
  assert.deepEqual(p.actions[0], { do: 'play', req: 1, clipId: 'c' });
  const e = run([{ type: 'played', req: 1, playId: 'q1', clipId: 'c', t: 1150 }, { type: 'ended', playId: 'q1', clipId: 'c', t: 8000 }], CTX(), p.s);
  assert.equal(e.s.name, 'menu', 'the project ended: back to the menu');
  assert.equal(run([hit('back', 9000)], CTX(), e.s).s.name, 'landing', 'Back');
  // idle: 60 s without a hand on the walls; a hand at 50 s starts the count again
  assert.equal(run([{ type: 'tick', t: 8000 + 59_999 }], CTX(), e.s).s.name, 'menu');
  assert.equal(run([{ type: 'tick', t: 8000 + 60_000 }], CTX(), e.s).s.name, 'landing', '60 s idle: the landing');
  assert.equal(run([{ type: 'touch', t: 58_000 }, { type: 'tick', t: 8000 + 60_000 }], CTX(), e.s).s.name, 'menu', 'a hand keeps the menu');
  assert.equal(run([{ type: 'tick', t: 8000 + 20_000 }], CTX({ params: { idleBackS: 20 } }), e.s).s.name, 'landing', 'idleBackS is the operator\'s');
});

test('reel: states — hold to exit leaves a playing video (and stops it); off, or before the video has started, it does nothing', () => {
  const playing = run([hit('play', 0), { type: 'started', playId: 'p1', clipId: 'reel', t: 100 }]).s;
  const out = run([{ type: 'hold', t: 2000 }], CTX(), playing);
  assert.equal(out.s.name, 'landing');
  assert.deepEqual(out.actions[0], { do: 'stop' });
  assert.equal(run([{ type: 'hold', t: 2000 }], CTX({ params: { holdToExit: false } }), playing).s.name, 'reel', 'holdToExit off: it plays to the end');
  assert.equal(run([hit('play', 0), { type: 'hold', t: 100 }]).s.phase, 'starting', 'not before it started');
  // the late 'ended' of the play a hand left must not end the next play of the same clip
  const again = run([hit('play', 2100)], CTX(), out.s).s;
  assert.equal(run([{ type: 'ended', playId: 'p1', clipId: 'reel', reason: 'cleared', t: 2200 }], CTX(), again).s.name, 'reel', 'a dead play\'s event is ignored');
  // the answer of a play the page already gave up on: stopped, unless another video is showing
  const gaveUp = run([hit('play', 0), { type: 'tick', t: START_TIMEOUT_MS }]).s;
  assert.deepEqual(run([{ type: 'played', req: 1, playId: 'late', clipId: 'reel', t: 3100 }], CTX(), gaveUp).actions, [{ do: 'stop' }]);
});

test('reel: states — a clip that is missing or not assigned: its target does nothing, the others work', () => {
  const ctx = CTX({ slots: { projects: [clip('a'), clip('b', { missing: true }), null, clip('d')] } });
  const menu = run([hit('projects', 0)], ctx).s;
  for (const i of [1, 2, 7]) assert.deepEqual(run([hit('project', 10, i)], ctx, menu), { s: menu, actions: [] }, `project ${i}: nothing`);
  assert.equal(run([hit('project', 10, 3)], ctx, menu).s.name, 'project', 'the next one plays');
  assert.equal(usable(null) || usable(clip('x', { missing: true })), false);
  const noReel = CTX({ slots: { reel: null } });
  assert.equal(run([hit('play', 0)], noReel).s.name, 'landing', 'no reel: Play Reel is off');
  assert.equal(run([hit('projects', 0)], noReel).s.name, 'menu', '…and See Projects still works');
  assert.equal(run([hit('projects', 0)], CTX({ slots: { projects: [clip('a', { missing: true })] } })).s.name, 'landing', 'no project that can play: See Projects is off');
});

test('reel: states — a play that does not start in 3 s, is refused or errors: back where it came from, and the app is told', () => {
  const menu = run([hit('projects', 0)]).s;
  const p = run([hit('project', 1000, 0)], CTX(), menu).s;
  assert.equal(run([{ type: 'tick', t: 1000 + START_TIMEOUT_MS - 1 }], CTX(), p).s.name, 'project', 'still waiting at 2.999 s');
  const late = run([{ type: 'tick', t: 1000 + START_TIMEOUT_MS }], CTX(), p);
  assert.equal(late.s.name, 'menu', 'not started in 3 s: back to the menu');
  assert.ok(late.actions.some((a) => a.do === 'stop'), 'whatever might still come is stopped');
  assert.match(late.actions.find((a) => a.do === 'report').error, /did not start within 3 s/);
  const refused = run([{ type: 'playFailed', req: 1, clipId: 'a', error: 'the file is missing', t: 1100 }], CTX(), p);
  assert.equal(refused.s.name, 'menu');
  assert.match(refused.actions.find((a) => a.do === 'report').error, /could not play: the file is missing/);
  const playing = run([{ type: 'started', playId: 'z', clipId: 'a', t: 1100 }], CTX(), p).s;
  const err = run([{ type: 'error', playId: 'z', clipId: 'a', error: 'decode failed', t: 2000 }], CTX(), playing);
  assert.equal(err.s.name, 'menu');
  assert.ok(err.actions.some((a) => a.do === 'report' && /decode failed/.test(a.error)));
});

/* ------------------------------------------------------------------ touching (§6.2) */

const target = (id, x, y, extra = {}) => ({ id, kind: 'project', index: 0, x, y, r: 40, hx: 0, pxPerM: 260, ...extra });
const hand = (stroke, x, y, extra = {}) => ({ id: stroke, stroke, wallId: 'P1', x, y, ...extra });

test('reel: dwell — 400 ms on a target does not launch, 500 ms does; leaving half way empties the ring', () => {
  const d = makeDwell({ dwellMs: 500 }), T = [target('a', 500, 300)];
  let r;
  for (let ms = 0; ms <= 400; ms += 100) r = d.step(T, [hand(1, 505, 300)], ms === 0 ? 16 : 100);
  assert.equal(r.fired, null, '400 ms: not yet');
  assert.ok(r.hot.get('a').progress > 0.75 && r.hot.get('a').progress < 1, `the ring is filling (${r.hot.get('a').progress})`);
  r = d.step(T, [hand(1, 505, 300)], 100);
  assert.equal(r.fired?.id, 'a', '500 ms: launched');
  // half way, then out: the ring empties, and coming back starts from zero
  const e = makeDwell({ dwellMs: 500 });
  for (let k = 0; k < 4; k++) e.step(T, [hand(1, 505, 300)], 80);
  assert.ok(e.progress('a') > 0.4);
  r = e.step(T, [hand(1, 900, 300)], 80);
  assert.equal(r.hot.size, 0);
  assert.equal(e.progress('a'), 0, 'left: empty');
  for (let k = 0; k < 6; k++) r = e.step(T, [hand(1, 505, 300)], 80);
  assert.equal(r.fired, null, 'back in: 400 ms again from zero, not 720 ms');
  // dwellMs 0: on touch
  assert.equal(makeDwell({ dwellMs: 0 }).step(T, [hand(1, 505, 300)], 16).fired?.id, 'a');
});

test('reel: dwell — two hands on two targets: the first to complete wins; switched-off targets and left-over hands do nothing', () => {
  const d = makeDwell({ dwellMs: 500 }), T = [target('a', 300, 300), target('b', 900, 300)];
  d.step(T, [hand(1, 300, 300)], 100);                    // a: from now
  d.step(T, [hand(1, 300, 300), hand(2, 900, 300)], 100); // b: 100 ms later
  let r;
  for (let k = 0; k < 4; k++) { r = d.step(T, [hand(1, 300, 300), hand(2, 900, 300)], 100); if (r.fired) break; }
  assert.equal(r.fired?.id, 'a', 'a was first');
  const off = makeDwell({ dwellMs: 0 });
  assert.equal(off.step([target('a', 300, 300, { enabled: false }), target('b', 900, 300)], [hand(1, 300, 300)], 16).fired, null, 'a target switched off does not respond');
  assert.equal(off.step([target('a', 300, 300, { enabled: false }), target('b', 900, 300)], [hand(1, 900, 300)], 16).fired?.id, 'b', '…the others do');
  // a hand already on the wall when the scene changed counts only once it has lifted
  const s = makeDwell({ dwellMs: 0 });
  s.reset([hand(7, 300, 300)]);
  assert.equal(s.step(T, [hand(7, 300, 300)], 16).fired, null, 'the hand that was there: ignored');
  assert.equal(s.step(T, [hand(8, 300, 300)], 16).fired?.id, 'a', 'a new hand: counts');
  s.step(T, [], 16);
  assert.equal(s.step(T, [hand(7, 300, 300)], 16).fired?.id, 'a', 'the old one, after it lifted: counts');
  assert.equal(makeDwell({ dwellMs: 0 }).step(T, [hand(1, 300, 300, { ended: true })], 16).fired, null, 'a hand the tracker lost does not press');
});

test('reel: hit — the hit radius is the visible one x 1.15 and never under 0.25 m; across the seam of a closed room x wraps', () => {
  const small = target('s', 100, 100, { r: 10, pxPerM: 200 });
  assert.equal(hitRadius(small), MIN_HIT_M * 200, 'a small drawing still takes a hand');
  assert.ok(Math.abs(hitRadius(target('b', 0, 0, { r: 100 })) - 115) < 1e-9);
  const W = 7196, seam = target('z', 10, 456, { r: 30, pxPerM: 260 });
  assert.ok(isHit(seam, W - 5, 456, W, true), 'a hand at x = W - 5 px touches a target at x = 10 px');
  assert.ok(!isHit(seam, W - 5, 456, W, false), '…not on a strip with two ends');
  const pill = target('p', 500, 300, { r: 44, hx: 150, pxPerM: 100 });
  assert.ok(isHit(pill, 500 + 150 + 40, 300) && !isHit(pill, 500 + 150 + 44 * 1.15 + 6, 300), 'a pill is hit along its whole length');
});

test('reel: hold to exit — a hand held still 1.5 s exits; a 300 ms touch does not; moving starts it again', () => {
  const pxPerM = () => 260;
  const h = makeHold();
  let r;
  for (let ms = 0; ms < 300; ms += 50) r = h.step([hand(1, 400, 400)], 50, pxPerM);
  r = h.step([], 50, pxPerM);
  assert.equal(r.fired, false, 'a 300 ms touch');
  let fired = false, t = 0;
  for (; t <= 2000 && !fired; t += 50) fired = h.step([hand(2, 400 + (t % 100 ? 3 : 0), 400)], 50, pxPerM).fired;
  assert.ok(fired && t >= HOLD_MS && t <= HOLD_MS + 100, `held still (a few px of noise): out at ${t} ms`);
  const m = makeHold();
  for (t = 0; t < 1400; t += 50) m.step([hand(3, 400, 400)], 50, pxPerM);
  r = m.step([hand(3, 400 + 0.3 * 260, 400)], 50, pxPerM); // moved 30 cm at 1.4 s
  assert.equal(r.fired, false);
  assert.ok(r.rings[0].progress < 0.05, 'moving starts the ring again');
});

/* ------------------------------------------------------------------ layout on the walls (§6.3) */

const XRLAB = JSON.parse(fs.readFileSync(path.join(root, 'profiles', 'xrlab.json'), 'utf8'));
// the XR Lab walls with a door on P1 right where its buttons would go, and a lamp on P3 (masks, metres from the floor)
const MASKED = XRLAB.walls.map((w) => ({
  ...w,
  masks: w.id === 'P1' ? [{ id: 'D', name: 'Door', type: 'rect', x0: 2.7, y0: 0, x1: 3.7, y1: 2.1 }]
    : w.id === 'P3' ? [{ id: 'L', name: 'Lamp', type: 'rect', x0: 1.6, y0: 1.2, x1: 2.0, y1: 1.6 }] : [],
}));
const viewsOf = (walls, s = 1) => walls.map((w) => wallView(w, s));

/** Every target placed in metres: band, corners, masks, no overlaps (visible shapes). */
function checkPlaced(items, walls, band, label) {
  const byId = new Map(walls.map((w) => [w.id, w]));
  for (const it of items) {
    const w = byId.get(it.wallId), ex = it.rm + (it.hxm || 0);
    assert.ok(it.ym >= band[0] - 1e-6 && it.ym <= band[1] + 1e-6, `${label} ${it.id}: centre at ${it.ym.toFixed(2)} m, within ${band}`);
    assert.ok(it.xm - ex >= CORNER_M - 1e-6 && it.xm + ex <= w.width - CORNER_M + 1e-6, `${label} ${it.id}: ${CORNER_M} m clear of the corners`);
    for (const m of w.masks || []) {
      const clear = it.xm + ex <= m.x0 || it.xm - ex >= m.x1 || it.ym + it.rm <= m.y0 || it.ym - it.rm >= m.y1;
      assert.ok(clear, `${label} ${it.id} is on mask ${m.name}`);
    }
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.wallId !== b.wallId) continue;
    const dx = Math.max(0, Math.abs(a.xm - b.xm) - (a.hxm || 0) - (b.hxm || 0)), d = Math.hypot(dx, a.ym - b.ym);
    assert.ok(d > a.rm + b.rm, `${label}: ${a.id} and ${b.id} overlap`);
  }
}

test('reel: layout with the XR Lab profile — every target within reach (0.9–1.7 m), off the masks, 0.3 m from the corners, none overlapping', () => {
  const views = viewsOf(MASKED);
  const L = landingLayout(views, {});
  assert.equal(L.items.length, 8, 'the two buttons on each of the 4 walls');
  checkPlaced(L.items, MASKED, BUTTON_BAND, 'landing');
  const p1 = L.items.filter((i) => i.wallId === 'P1'), p2 = L.items.filter((i) => i.wallId === 'P2');
  assert.ok(Math.abs((p2[0].xm + p2[1].xm) / 2 - 7.353 / 2) < 1e-6, 'centred on a wall with no mask');
  assert.ok(p1.every((i) => i.xm + i.rm + i.hxm <= 2.7 || i.xm - i.rm - i.hxm >= 3.7), 'moved off the door on P1');
  assert.equal(L.brands.length, 4, 'the brand on every wall');
  assert.deepEqual(landingLayout(views, { brandWall: 'P2' }).brands.map((b) => b.wallId), ['P2'], '…or on the chosen one');
  for (const n of [1, 6, 12]) {
    const M = menuLayout(views, n, {});
    for (const w of MASKED) assert.equal(M.blobs.filter((b) => b.wallId === w.id).length, n, `per-wall: every project on ${w.id} (${n})`);
    for (const t of [0, 3.3, 7.7, 12.1]) checkPlaced([...blobMotion(M.blobs, t, views), ...M.items.filter((i) => i.kind === 'back')], MASKED, REACH, `menu ${n} at ${t} s`);
  }
  const A = menuLayout(views, 6, { menuLayout: 'around' });
  assert.deepEqual(A.blobs.map((b) => b.index).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], 'around: one set round the room');
  assert.ok(new Set(A.blobs.map((b) => b.wallId)).size >= 3, '…spread over the walls');
  checkPlaced([...blobMotion(A.blobs, 5, views), ...A.items.filter((i) => i.kind === 'back')], MASKED, REACH, 'around');
});

test('reel: layout is in metres, not fractions of the wall — a 2.4 m wall puts its buttons and blobs at the same height as a 3.5 m one', () => {
  const tall = viewsOf(XRLAB.walls), low = viewsOf(XRLAB.walls.map((w) => ({ ...w, height: 2.4 })));
  const a = landingLayout(tall, {}).items, b = landingLayout(low, {}).items;
  assert.deepEqual(a.map((i) => +i.ym.toFixed(6)), b.map((i) => +i.ym.toFixed(6)), 'same height from the floor');
  const ta = toTarget(a[0], tall[0]), tb = toTarget(b[0], low[0]);
  assert.ok(Math.abs(ta.y - tb.y) > 50, `…which is a different place in px on walls of different height (${ta.y.toFixed(0)} vs ${tb.y.toFixed(0)})`);
  // in px on the 3.5 m XR Lab wall (912 px tall), 1.25 m from the floor is 586 px from the top, not the middle (456)
  assert.ok(Math.abs(ta.y - (912 - 1.25 * 912 / 3.5)) < 1, `button centre at ${ta.y.toFixed(1)} px`);
  checkPlaced(menuLayout(low, 6, {}).blobs, XRLAB.walls.map((w) => ({ ...w, height: 2.4 })), REACH, 'low walls');
  assert.ok(ease(0) === 0 && ease(1) === 1 && ease(0.5) > 0.85, 'the website\'s curve: fast out, soft landing');
});

test('reel: 6 projects on a wall 6.4 m wide get blobs of at least 0.7 m, 0.8 m when the wall is 7.4 m, and never touch the Back button', () => {
  const wall = (width) => [{ id: 'P1', width, height: 3.5, masks: [], pixelRect: { x: 0, y: 0, w: Math.round(width * 260), h: 912 } }];
  for (const [width, min] of [[6.4, 0.7], [7.4, 0.8]]) {
    const views = viewsOf(wall(width)), M = menuLayout(views, 6, {});
    assert.equal(M.blobs.length, 6);
    const size = M.blobs[0].rm * 2;
    // Fails with the old 0.5 m default (or a layout that shrinks blobs to leave room for names): they came out ~0.5 m
    assert.ok(size >= min - 1e-6 && size <= 0.8 + 1e-6, `${width} m wall: blobs ${size.toFixed(2)} m`);
    const back = M.items.find((i) => i.kind === 'back');
    for (const t of [0, 2.2, 5.1, 9.7]) {
      const moved = blobMotion(M.blobs, t, views);
      checkPlaced(moved, wall(width), REACH, `${width} m at ${t} s`);
      for (const b of moved) {
        const dx = Math.max(0, Math.abs(b.xm - back.xm) - (BACK.w / 2)), dy = Math.max(0, Math.abs(b.ym - back.ym) - BACK.h / 2);
        assert.ok(Math.hypot(dx, dy) > b.rm, `${width} m at ${t} s: ${b.id} overlaps Back`);
      }
    }
  }
  assert.equal(menuLayout(viewsOf(wall(7.4)), 3, {}).blobs[0].rm * 2, 0.8, 'a few projects: the full 0.8 m');
});

test('reel: a project name wraps onto two rows before it shrinks, and is never set under ~9 cm', () => {
  const measure = (t, sz) => t.length * sz * 0.62 + (t.length - 1) * 0.18 * sz; // a stand-in for the font, metres
  const W = 1.3;
  const one = fitLabel('Fashion', measure, { size: NAME_SIZE_M, minSize: NAME_MIN_M, maxW: W, maxLines: 2 });
  assert.deepEqual([one.lines, one.size], [['Fashion'], NAME_SIZE_M], 'a short name: one row, full size');
  // Fails if long names shrink instead of wrapping: "FASHION SHOW MICUIR" is 1.5 m on one row at 0.1 m
  const long = fitLabel('Fashion Show Micuir', measure, { size: NAME_SIZE_M, minSize: NAME_MIN_M, maxW: W, maxLines: 2 });
  assert.equal(long.lines.length, 2, `wrapped: ${long.lines}`);
  assert.equal(long.size, NAME_SIZE_M, 'at the full size');
  assert.ok(long.lines.every((l) => measure(l, long.size) <= W));
  for (const name of ['Photogrammetry of the Old Harbour at Dawn', 'Supercalifragilisticexpialidocious Installation Lab', 'x'.repeat(60)]) {
    const f = fitLabel(name, measure, { size: NAME_SIZE_M, minSize: NAME_MIN_M, maxW: 0.9, maxLines: 2 });
    assert.ok(f.size >= NAME_MIN_M - 1e-9, `never under 9 cm (${f.size})`);
    assert.ok(f.lines.length <= 2 && f.lines.every((l) => measure(l, f.size) <= 0.9 + 1e-9), `fits: ${f.lines}`);
  }
});

/* ------------------------------------------------------------------ the page (hidden Electron window) */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };

/** experiences/ over HTTP, the stand-in runtime in place of /experiences/runtime.js. */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (file === '/experiences/runtime.js') file = '/tests/fixtures/reel/dev-runtime.js';
      const abs = path.join(root, file);
      const ok = (file.startsWith('/experiences/') && abs.startsWith(path.join(root, 'experiences'))) || file === '/tests/fixtures/reel/dev-runtime.js';
      if (!ok || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// every page script starts with this: wait for the page, then helpers (frames, hands, pixels)
const PRELUDE = `
  const vt = await (async () => { for (let k = 0; k < 200; k++) { if (window.__vtDev && window.__vtDev.ready && window.__reel && window.__reel.ready !== undefined) return window.__vtDev; await new Promise((r) => setTimeout(r, 50)); } throw new Error('the experience did not start'); })();
  const R = window.__reel, gl = vt.gl, W = vt.size.width, H = vt.size.height;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const frames = async (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { vt.frame(dt); if (i % 5 === 4) await tick(); } await tick(); };
  vt.frame(1 / 30); for (let k = 0; k < 40 && !R.ready; k++) { await tick(); vt.frame(1 / 30); }
  // pixels must be read in the task that drew them (a presented canvas is cleared): read() draws a frame first, then reads
  const read = (x, y, w, h, fresh = true) => { if (fresh) vt.frame(1 / 30); const a = new Uint8Array(w * h * 4); gl.readPixels(x, H - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
  const meanAlpha = () => { const a = read(0, 0, W, H); let s = 0; for (let i = 3; i < a.length; i += 4) s += a[i]; return s / (a.length / 4); };
  const touch = (type, id, x, y, wallId) => vt.emit('touch', { type, id, wallId, x, y });
  const press = async (tg, id = 1, ms = 700) => { touch('down', id, tg.x, tg.y, tg.wallId); await frames(Math.ceil(ms / 33)); touch('up', id, tg.x, tg.y, tg.wallId); await frames(1); };
  const find = (kind, wallId, index) => R.targets().find((t) => t.kind === kind && (!wallId || t.wallId === wallId) && (index === undefined || t.index === index));
`;

async function inPage(script, query) {
  const { server, port } = await serve();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const file = path.join(tmp, 'script.js');
  fs.writeFileSync(file, PRELUDE + script);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${port}/experiences/reel/index.html?${query}`, `--script=${file}`, '--wait=load'];
    const outText = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    assert.deepEqual(data.errors, [], `page errors: ${data.errors.join(' | ')}`);
    return data.result;
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** The XR Lab strip at `s` of its size (small for the tests: WebGL may run on the CPU). */
const roomQuery = (s, walls = XRLAB.walls) => {
  const room = { canvas: { width: Math.round(XRLAB.canvas.width * s), height: Math.round(XRLAB.canvas.height * s) }, walls: viewsOf(walls, s) };
  return `room=${encodeURIComponent(JSON.stringify(room))}`;
};
const SLOTS = { reel: clip('reel', { name: 'Reel 2026' }), projects: ['Soul Charger', 'Ressonància', 'Adidas Terrex', 'Fashion Show Micsur', 'Breathwork', 'Registro'].map((n, i) => clip(`c${i + 1}`, { name: n })) };
const q = (o = {}) => [roomQuery(o.scale ?? 0.125, o.walls), `closed=${o.closed ?? 1}`, `slots=${encodeURIComponent(JSON.stringify(o.slots ?? SLOTS))}`, `params=${encodeURIComponent(JSON.stringify(o.params ?? {}))}`, `play=${o.play ?? 'ok'}`].join('&');

test('reel page: the landing draws the brand and the buttons on an opaque field, and the field has no seam on a closed room', opt, async () => {
  const script = `
    await frames(30);
    vt.frame(1 / 30);
    const col = (x) => read(x, 0, 1, H, false);
    const step = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) s += Math.abs(a[i] - b[i]); return s / (H * 3); };
    // inner columns where nothing but the field is drawn: inside each wall's corner margin
    const inner = vt.walls.flatMap((w) => [w.rect.x + 2, w.rect.x + w.rect.w - 3]).map((x) => step(col(x), col(x + 1)));
    const seam = step(col(W - 1), col(0));
    const t = R.targets();
    return { seam, inner, alpha: meanAlpha(), state: R.state.name, kinds: t.map((x) => x.kind + '@' + x.wallId), font: document.fonts.check('300 20px Raleway'), labels: R.ready };`;
  const loop = await inPage(script, q({ closed: 1 }));
  const open = await inPage(script, q({ closed: 0 }));
  assert.equal(loop.state, 'landing');
  assert.equal(loop.font, true, 'Raleway is loaded from the experience folder (offline)');
  assert.ok(loop.alpha > 254, `the landing is opaque (${loop.alpha})`);
  assert.deepEqual(loop.kinds.sort(), ['play@P1', 'play@P2', 'play@P3', 'play@P4', 'projects@P1', 'projects@P2', 'projects@P3', 'projects@P4']);
  const innerMax = Math.max(...loop.inner);
  assert.ok(loop.seam <= innerMax * 2 + 1, `the seam steps no more than the field does elsewhere (seam ${loop.seam.toFixed(2)}, inside up to ${innerMax.toFixed(2)})`);
  // fails if the field is not periodic: a strip with two ends shows the jump
  assert.ok(open.seam > Math.max(...open.inner) * 2 + 1, `an open strip is not periodic: its ends differ (${open.seam.toFixed(2)})`);
});

test('reel page: a hand on "Play Reel" plays the reel; the page clears for the video and comes back when it ends', opt, async () => {
  const r = await inPage(`
    await frames(10);
    const btn = find('play', 'P2');
    await press(btn, 1, 300);                                  // a passing touch: nothing
    const early = vt.media.calls.filter((c) => c[0] === 'play').length;
    await press(btn, 2, 700);
    const plays = vt.media.calls.filter((c) => c[0] === 'play');
    const starting = R.state;
    vt.media.fire('started', { playId: vt.media.lastPlayId, clipId: 'reel' });
    await frames(30);                                          // 1 s: the page has faded out
    const during = { state: R.state, alpha: meanAlpha() };
    vt.media.fire('ended', { playId: vt.media.lastPlayId, clipId: 'reel', reason: 'end' });
    await frames(30);
    return { early, plays, starting, during, after: { state: R.state, alpha: meanAlpha() } };`, q());
  assert.equal(r.early, 0, 'a 300 ms touch does not launch (dwell 500 ms)');
  assert.deepEqual(r.plays.map((c) => [c[1], c[2].end]), [['reel', 'clear']], 'the reel, once, on the reserved layer');
  assert.deepEqual([r.starting.name, r.starting.phase], ['reel', 'starting']);
  assert.deepEqual([r.during.state.name, r.during.state.phase], ['reel', 'playing']);
  assert.ok(r.during.alpha < 1, `while the video plays the page is clear (${r.during.alpha})`);
  assert.equal(r.after.state.name, 'landing');
  assert.ok(r.after.alpha > 254, `the landing is back (${r.after.alpha})`);
});

test('reel page: See Projects shows a blob per project on every wall; one plays its project; a hand held 1.5 s goes back to the menu, a 300 ms touch does not', opt, async () => {
  const r = await inPage(`
    await frames(10);
    await press(find('projects', 'P4'));
    await frames(30);
    const blobs = R.targets().filter((t) => t.kind === 'project');
    const perWall = {}; for (const b of blobs) perWall[b.wallId] = (perWall[b.wallId] || 0) + 1;
    const backs = R.targets().filter((t) => t.kind === 'back').length;
    const first = find('project', 'P1', 0), third = find('project', 'P3', 2);
    await press(third);
    const play = vt.media.calls.filter((c) => c[0] === 'play').pop();
    vt.media.fire('started', { playId: vt.media.lastPlayId, clipId: play[1] });
    await frames(25);
    const where = vt.walls.find((w) => w.id === 'P1').rect;
    touch('down', 5, where.x + 50, where.y + 60, 'P1'); await frames(9); touch('up', 5, where.x + 50, where.y + 60, 'P1'); await frames(3);
    const afterTap = { state: R.state.name, stops: vt.media.calls.filter((c) => c[0] === 'stop').length };
    touch('down', 6, first.x, first.y, 'P1'); await frames(30);             // held where the first blob of P1 floats: 1 s, not yet
    const at1s = R.state.name;
    await frames(20);                                                      // 1.67 s
    const afterHold = { state: R.state.name, stops: vt.media.calls.filter((c) => c[0] === 'stop').length };
    await frames(25);                                                      // still there, on the blob, past the dwell
    const plays = vt.media.calls.filter((c) => c[0] === 'play').length;   // the held hand lands on the menu: it must lift first
    return { perWall, backs, state: R.state.name, play, afterTap, at1s, afterHold, plays };`, q());
  assert.deepEqual(r.perWall, { P4: 6, P1: 6, P2: 6, P3: 6 }, 'per-wall (default): every wall carries every project');
  assert.equal(r.backs, 4, 'a Back on every wall');
  assert.equal(r.play[1], 'c3', 'the third blob plays the third project');
  assert.deepEqual(r.afterTap, { state: 'project', stops: 0 }, 'a 300 ms touch does not cut the video');
  assert.equal(r.at1s, 'project');
  assert.deepEqual(r.afterHold, { state: 'menu', stops: 1 }, 'held 1.5 s: stopped, back to the menu');
  assert.equal(r.plays, 1, 'the hand that held is not a new touch on the menu');
});

test('reel page: a missing clip\'s blob does not respond; a play that never starts goes back in 3 s and is reported', opt, async () => {
  const slots = { reel: clip('reel'), projects: [clip('c1'), clip('c2', { missing: true }), clip('c3')] };
  const r = await inPage(`
    await frames(10);
    await press(find('projects', 'P2'));
    await frames(20);
    await press(find('project', 'P2', 1));
    const afterMissing = { state: R.state.name, plays: vt.media.calls.filter((c) => c[0] === 'play').length };
    await press(find('project', 'P2', 0));
    const starting = R.state.phase;
    await frames(95);                                         // 3.2 s, and no 'started'
    return { afterMissing, starting, state: R.state.name, reports: R.reports, stops: vt.media.calls.filter((c) => c[0] === 'stop').length };`, q({ slots }));
  assert.deepEqual(r.afterMissing, { state: 'menu', plays: 0 }, 'the missing project is off');
  assert.equal(r.starting, 'starting');
  assert.equal(r.state, 'menu', 'not started in 3 s: back to the menu');
  assert.equal(r.stops, 1);
  assert.equal(r.reports.length, 1);
  assert.match(r.reports[0], /did not start within 3 s/);
});

/* ------------------------------------------------------------------ with the real engine and vt.media */

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const vid = (sec) => ({ fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: Math.round(sec * 30), duration: sec });

// Fails if the page does not drive the real runtime's vt.media: the reel must reach the engine's reserved layer
// (clip.trigger, end 'clear'), and the engine's own 'started' / 'ended' must take the page into the video and back.
test('reel page, real engine: the room instance plays the reel on the reserved layer and comes back when the engine says it ended', opt, async () => {
  const { Store } = await import('../engine/store.js');
  const { Engine } = await import('../engine/engine.js');
  const { createServer } = await import('../engine/server.js');
  const { normalizeProfile } = await import('../engine/profile.js');
  const { normalizeShow } = await import('../engine/media/show.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-reel-'));
  const store = new Store(dir, null, quiet);
  store.saveProfile(normalizeProfile({ name: 'Reel room', canvas: { ...XRLAB.canvas }, walls: XRLAB.walls, output: { scale: 0.125 } }));
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [path.join(root, 'experiences')] });
  engine.start();
  const MEDIA = [
    { id: 'm1', file: 'reel/reel.mov', size: 900, fingerprint: 'a'.repeat(40), video: vid(1.2), audio: null },
    { id: 'm2', file: 'reel/one.mov', size: 800, fingerprint: 'b'.repeat(40), video: vid(1), audio: null },
  ];
  for (const m of MEDIA) { const f = path.join(engine.media.libraryDir, ...m.file.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size)); }
  store.saveShow(normalizeShow({
    id: 'reel', name: 'Reel', media: MEDIA,
    clips: [{ id: 'c1', mediaId: 'm1', name: 'Reel 2026' }, { id: 'c2', mediaId: 'm2', name: 'Project one' }],
    layers: [{ id: 'L1' }], decks: [{ id: 'D1', cells: {} }],
    presets: [{ id: 'p1', name: 'Reel', experienceId: 'reel', params: { dwellMs: 300 }, media: { reel: 'c1', projects: ['c2'] }, onLoad: 'clear' }],
  }));
  await engine.command('show.load', { id: 'reel' });
  await engine.media.check();
  await engine.command('preset.load', { presetId: 'p1' });
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, `
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const x = fn(); if (x) return x; if (Date.now() - t0 > ms) return null; await wait(25); } };
    const R = await until(() => window.__reel && window.__reel.ready && window.__reel);
    if (!R) throw new Error('the experience did not start');
    const { store } = await import('/js/conn.js');
    const out = { available: R.vt.media.available, slots: { reel: R.slots.reel?.name, projects: R.slots.projects.map((c) => c.name) } };
    // a virtual hand on "Play Reel" of the second wall, held past the dwell
    const btn = R.targets().find((t) => t.kind === 'play' && t.wallId === R.vt.walls[1].id);
    let hands = [{ id: 1, stroke: 1, wallId: btn.wallId, x: btn.x, y: btn.y, size: 10 }];
    R.vt.hands = () => hands.map((h) => ({ ...h }));
    await until(() => R.state.name === 'reel', 3000);
    hands = [];
    out.starting = R.state.name;
    await until(() => R.state.phase === 'playing', 3000);
    out.playing = { phase: R.state.phase, x: store.state.media.xlayer?.play?.clipId || null };
    await until(() => R.state.name === 'landing', 5000);
    out.back = R.state.name;
    out.reports = R.reports;
    return out;`);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/experiences/reel/index.html?run=1`, `--script=${file}`, '--wait=load', '--w=900', '--h=200'];
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    const o = data.result;
    assert.equal(o.available, true, 'the room\'s running instance plays for real');
    assert.deepEqual(o.slots, { reel: 'Reel 2026', projects: ['Project one'] }, 'the clips the operator gave the card');
    assert.equal(o.starting, 'reel');
    assert.deepEqual(o.playing, { phase: 'playing', x: 'c1' }, 'the reel is on the reserved layer and the engine said it started');
    assert.equal(o.back, 'landing', 'the engine\'s end of the clip brings the landing back');
    assert.deepEqual(o.reports, []);
    assert.deepEqual(data.errors, [], `page errors: ${data.errors.join(' | ')}`);
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Fails if the page is not transparent where it should be, or the room output does not put it above the clips: in the
// app's output window (tests/ui/runner.cjs --output-window) with real HAP clips, the reel's own picture must show while
// it plays, and Reel's field must come back over it when it ends.
test('reel in the room output: above a real HAP clip — the reel shows through while it plays, the landing comes back when it ends', opt, async () => {
  const { Store } = await import('../engine/store.js');
  const { Engine } = await import('../engine/engine.js');
  const { createServer } = await import('../engine/server.js');
  const { normalizeProfile } = await import('../engine/profile.js');
  const { normalizeShow } = await import('../engine/media/show.js');
  const { probe } = await import('../engine/media/probe.js');
  const { demoHap } = await import('./fixtures/media/make-demo.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-reel-out-'));
  const store = new Store(dir, null, quiet);
  store.saveProfile(normalizeProfile({ name: 'Reel room', canvas: { ...XRLAB.canvas }, walls: XRLAB.walls, output: { on: true, scale: 0.125 } }));
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [path.join(root, 'experiences')] });
  engine.start();
  const files = [['m1', 'reel/Reel.mov', 1], ['m2', 'reel/Forest.mov', 5]]; // demo palettes: ember (red), forest (green)
  const MEDIA = [];
  for (const [id, rel, palette] of files) {
    const abs = path.join(engine.media.libraryDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, demoHap({ width: 320, height: 40, frames: 4, secondsPerFrame: 0.6, palette }));
    MEDIA.push({ id, file: rel, size: fs.statSync(abs).size, fingerprint: id.repeat(20), video: (await probe(abs)).video, audio: null });
  }
  store.saveShow(normalizeShow({
    id: 'reel', name: 'Reel', media: MEDIA,
    clips: [{ id: 'c1', mediaId: 'm1', name: 'Reel 2026' }, { id: 'c2', mediaId: 'm2', name: 'Forest' }],
    layers: [{ id: 'L1' }], decks: [{ id: 'D1', cells: {} }],
    presets: [{ id: 'p1', name: 'Reel', experienceId: 'reel', params: { dwellMs: 300 }, media: { reel: 'c1', projects: ['c2'] }, onLoad: 'clear' }],
  }));
  await engine.command('show.load', { id: 'reel' });
  await engine.media.check();
  await engine.command('preset.load', { presetId: 'p1' });
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, `
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const until = async (fn, ms = 12000) => { const t0 = Date.now(); for (;;) { const x = fn(); if (x) return x; if (Date.now() - t0 > ms) return null; await wait(25); } };
    const { store } = await import('/js/conn.js');
    const O = await until(() => window.__out && window.__out.mixer() && store.state && window.__out);
    const R = await until(() => { const f = document.querySelector('iframe'); return f && f.contentWindow && f.contentWindow.__reel && f.contentWindow.__reel.ready && f.contentWindow.__reel; });
    if (!O || !R) throw new Error('the output or the experience did not start');
    await wait(800);
    const m = O.mixer();
    // the mean colour near the top of the first wall, inside its corner margin: only the field (or the video) is there
    const sample = () => { O.compose(); const w = R.vt.walls[0].rect, px = m.readFbo(Math.round(w.x + w.w * 0.04), 3, 8, 8), c = [0, 0, 0]; for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) c[k] += px[i + k] / (px.length / 4); return c.map(Math.round); };
    const shot = () => (${!!process.env.REEL_SHOTS} ? O.previewJpeg(900) : null);
    const out = { layers: O.layers(), landing: sample(), shots: {} };
    out.shots.landing = shot();
    const btn = R.targets().find((t) => t.kind === 'play' && t.wallId === R.vt.walls[1].id);
    let hands = [{ id: 1, stroke: 1, wallId: btn.wallId, x: btn.x, y: btn.y, size: 4 }];
    R.vt.hands = () => hands.map((h) => ({ ...h }));
    await until(() => R.state.name === 'reel', 4000);
    hands = [];
    out.phase = await until(() => R.state.phase === 'playing' && 'playing', 4000);
    await wait(1000);
    out.video = sample();
    out.shots.video = shot();
    out.back = await until(() => R.state.name === 'landing' && 'landing', 5000);
    await wait(1000);
    out.after = sample();
    out.shots.after = shot();
    return out;`);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/output?run=1`, `--script=${file}`, '--wait=load', '--output-window', '--w=900', '--h=114'];
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    const o = data.result;
    if (process.env.REEL_SHOTS) for (const [k, v] of Object.entries(o.shots)) if (v) fs.writeFileSync(path.join(process.env.REEL_SHOTS, `reel-output-${k}.jpg`), Buffer.from(v.split(',')[1], 'base64'));
    assert.ok(o.layers.indexOf('experience') > o.layers.indexOf('media'), `a transparent experience goes above the clips (${o.layers})`);
    const bluish = (c) => c[2] > c[0] + 20, reddish = (c) => c[0] > c[2] + 20;
    assert.ok(bluish(o.landing), `the landing: Reel's field (${o.landing})`);
    assert.equal(o.phase, 'playing');
    assert.ok(reddish(o.video), `while it plays: the reel's own picture shows through (${o.video})`);
    assert.equal(o.back, 'landing');
    assert.ok(bluish(o.after), `ended: the field is back over it (${o.after})`);
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ renders (REEL_SHOTS=<folder>) */

test('reel page: renders of the landing and the projects menu across the full 7196 x 912 strip', { skip: !electronPath ? 'electron is not installed' : !process.env.REEL_SHOTS && 'set REEL_SHOTS=<folder> to render' }, async () => {
  const shot = `
    const png = () => { vt.frame(1 / 30); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(document.getElementById('c'), 0, 0); return c.toDataURL('image/png'); };`;
  const landing = await inPage(`${shot} await frames(60); return png();`, q({ scale: 1, params: { quality: 'high' } }));
  const menu = await inPage(`${shot} await frames(10); await press(find('projects', 'P1')); await frames(45);
    const b = find('project', 'P2', 1); touch('down', 9, b.x + 6, b.y - 4, 'P2'); await frames(8); return png();`, q({ scale: 1, params: { quality: 'high' } }));
  fs.mkdirSync(process.env.REEL_SHOTS, { recursive: true });
  for (const [name, data] of [['reel-landing.png', landing], ['reel-projects.png', menu]]) fs.writeFileSync(path.join(process.env.REEL_SHOTS, name), Buffer.from(data.split(',')[1], 'base64'));
});
