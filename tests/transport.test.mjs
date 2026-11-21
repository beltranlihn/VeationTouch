// The transport of the media server (MEDIA-SERVER.md §4.2–4.3, §2.1–2.2, phase F4): launching, columns, ejecting, the
// end modes, the autopilot with its transition compensation, toggle, in/out, crossfades (`from`), the experience's own
// layer, blackout, the preroll, the snapshot for restarts, the Show mode gates and the messages. Node only, a fake
// clock everywhere it matters: the transport is a function of the commands and the clock, nothing else. The clip
// files are empty placeholders (the transport never reads a frame); only their presence and size count.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Transport, playhead, endsAt, PREROLL_MS, XLAYER } from '../engine/media/transport.js';
import { normalizeShow, clipSettings } from '../engine/media/show.js';
import { MediaEngine } from '../engine/media/index.js';
import { normalizeProfile } from '../engine/profile.js';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(15); }
}
/** A seeded random (mulberry32): the 'random' autopilot is reproducible. */
const seeded = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const vid = (sec, fps = 30) => ({ fourcc: 'Hap1', width: 256, height: 32, fps, frames: Math.round(sec * fps), duration: sec });
const MEDIA = [
  { id: 'm10', file: 'shw/ten.mov', size: 1000, video: vid(10), audio: null },
  { id: 'm5', file: 'shw/five.mov', size: 1200, video: vid(5), audio: null },
  { id: 'm300', file: 'shw/reel.mov', size: 1400, video: vid(300), audio: { format: 's16le', codec: 'sowt', codecName: 'PCM', supported: true, channels: 2, rate: 48000, frames: 300 * 48000, duration: 300 } },
];
const CLIPS = [
  { id: 'loop', mediaId: 'm10', end: 'loop' },
  { id: 'hold', mediaId: 'm10', end: 'hold' },
  { id: 'clear', mediaId: 'm10', end: 'clear' },
  { id: 'bounce', mediaId: 'm10', end: 'bounce' },
  { id: 'seg', mediaId: 'm10', end: 'loop', in: 2, out: 4 },
  { id: 'a', mediaId: 'm10', end: 'next', loops: 2 },
  { id: 'b', mediaId: 'm5', end: 'next', loops: 1 },
  { id: 'c', mediaId: 'm5' },
  { id: 'tog', mediaId: 'm5', trigger: 'toggle' },
  { id: 'reel', mediaId: 'm300', end: 'clear' },
];
const LAYERS = [
  { id: 'L1', transitionMs: 500 },
  { id: 'L2', transitionMs: 1000 },
  { id: 'L3', transitionMs: 0, ignoreColumn: true },
];
// columns 0–2 have clips, 3 has only the background layer (ignored by columns), 4–7 are empty
const DECKS = [{ id: 'D1', columns: 8, cells: { 'L1:0': 'a', 'L1:1': 'b', 'L1:2': 'c', 'L2:1': 'loop', 'L3:1': 'seg', 'L3:3': 'loop' } }];
const SHOW = () => normalizeShow({ id: 'shw', name: 'Shw', media: MEDIA, clips: CLIPS, layers: LAYERS, decks: DECKS });

/** A transport on the test show with a fake clock that starts at 1000 ms. at(ms) moves the clock and does what is due. */
function rig({ playable = () => null, random = seeded(7) } = {}) {
  const clock = { t: 1000 };
  const tr = new Transport({ now: () => clock.t, settings: clipSettings, playable, random });
  tr.setShow(SHOW());
  const at = (ms) => { clock.t = ms; tr.advance(ms); return tr.state(); };
  const L = (id) => tr.state().layers[id];
  return { clock, tr, at, L };
}

// ---------------------------------------------------------------------------------------------- the formula and the ends

// Fails if a launch starts at the order instead of PREROLL_MS later (the first frame and the PCM would not be there),
// if the position of a loop is not folded (it would stick on the last frame), or before startAt it is not the first frame.
test('transport: a launch starts PREROLL_MS after the order; a loop folds its position', () => {
  const { tr, L } = rig();
  assert.equal(PREROLL_MS, 120);
  const r = tr.trigger({ clipId: 'loop' }); // its cell is L2:1
  assert.deepEqual([r.layerId, r.startAt], ['L2', 1000 + PREROLL_MS]);
  const p = L('L2').play;
  assert.deepEqual([L('L2').state, p.clipId, p.mediaId, p.startAt, p.offset, p.in, p.out, p.fps, p.frames, p.end, p.endsAt], ['playing', 'loop', 'm10', 1120, 0, 0, 10, 30, 300, 'loop', null]);
  assert.deepEqual([p.deckId, p.column], ['D1', 1], 'the cell it came from (the autopilot\'s row)');
  const before = playhead(p, 1100);
  assert.deepEqual([before.started, before.frame, before.time], [false, 0, 0], 'during the preroll: the first frame, not started');
  const h = playhead(p, 1120 + 25000); // 25 s into a 10 s loop: third pass, 5 s in
  assert.deepEqual([h.pass, h.time, h.frame, h.dir, h.done], [2, 5, 150, 1, false]);
  assert.equal(playhead(p, 1120 + 10000).frame, 0, 'the wrap shows frame 0, not the last one');
  assert.equal(playhead(p, 1120 + 9999).frame, 299);
});

// Fails if hold does not stay on the last frame (or keeps scheduling), or if it does not say it ended.
test('transport: hold stays on the last frame', () => {
  const { tr, at, L } = rig();
  tr.trigger({ clipId: 'hold', layerId: 'L1' }); // not in the grid: the layer is given
  const p = L('L1').play;
  assert.equal(p.endsAt, 1120 + 10000);
  assert.equal(at(11119).layers.L1.state, 'playing');
  tr.takeEvents();
  assert.equal(at(11120).layers.L1.state, 'held');
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.reason]), [['ended', 'end']]);
  const h = playhead(L('L1').play, 11120 + 60000);
  assert.deepEqual([h.frame, h.time, h.done], [299, 10, true], 'a minute later: still the last frame');
  assert.equal(tr.nextDue(), null, 'nothing more to do');
  assert.equal(at(500000).layers.L1.state, 'held');
});

// Fails if clear empties the layer without its transition (no `from` to fade out) or leaves it on afterwards.
test('transport: clear — at the end the layer fades out over its transition and is empty after it', () => {
  const { tr, at, L } = rig();
  tr.trigger({ clipId: 'clear', layerId: 'L1' }); // L1's transition: 500 ms
  const id = L('L1').play.playId;
  at(11119);
  tr.takeEvents();
  const s = at(11120).layers.L1;
  assert.deepEqual([s.state, s.play, s.from?.playId, s.fadeAt, s.transitionMs], ['empty', null, id, 11120, 500], 'the eject starts at the end of the clip');
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.playId, e.reason]), [['ended', id, 'end']]);
  assert.equal(playhead(s.from, 11300).frame, 299, 'what fades out is the last frame');
  assert.equal(at(11370).layers.L1.from?.playId, id, 'halfway through the fade it is still there');
  const after = at(11620).layers.L1;
  assert.deepEqual([after.state, after.play, after.from], ['empty', null, null], 'after the transition: empty');
});

// Fails if bounce does not come back (it would loop or hold).
test('transport: bounce goes and comes back', () => {
  const { tr, L } = rig();
  tr.trigger({ clipId: 'bounce', layerId: 'L1' });
  const p = L('L1').play, at = (s) => playhead(p, p.startAt + s * 1000);
  assert.deepEqual([at(4).time, at(4).dir], [4, 1]);
  assert.deepEqual([at(12).time, at(12).dir, at(12).frame], [8, -1, 240], '2 s after the end: 2 s back from it');
  assert.deepEqual([at(19.5).time, at(19.5).dir], [0.5, -1]);
  assert.deepEqual([at(24).time, at(24).dir], [4, 1], 'and forward again');
  assert.equal(p.endsAt, null, 'it never ends by itself');
});

// Fails if `in`/`out` are ignored (the segment would be the whole file) or the frames leave the segment.
test('transport: in / out — the segment plays, its frames stay inside it', () => {
  const { tr, L } = rig();
  tr.trigger({ clipId: 'seg', layerId: 'L1' }); // 2 s → 4 s of a 10 s file, looping
  const p = L('L1').play;
  assert.deepEqual([p.in, p.out], [2, 4]);
  assert.deepEqual([playhead(p, p.startAt).time, playhead(p, p.startAt).frame], [2, 60]);
  assert.deepEqual([playhead(p, p.startAt + 3000).time, playhead(p, p.startAt + 3000).frame], [3, 90], 'one pass is 2 s: 3 s in = 1 s into the second pass');
  assert.equal(playhead(p, p.startAt + 1999).frame, 119, 'the last frame of the segment');
  assert.equal(endsAt({ ...p, end: 'clear' }), p.startAt + 2000, 'a clear segment ends after one pass of the segment');
  // a frame boundary that floating point lands just under (0.3 · 30 = 8.999…) is still that frame
  assert.equal(playhead({ startAt: 0, offset: 0, in: 0, out: 10, fps: 30, frames: 300, end: 'loop', loops: 1 }, 300).frame, 9);
});

// ---------------------------------------------------------------------------------------------- autopilot

// Fails if the next clip starts when the current one ends (startAt = end): there would be a gap or a jump — the
// crossfade must END at the end of the outgoing clip (Autopilot Transition Compensation).
test('transport: next with loops 2 — the next clip after two passes, started early by its transition', () => {
  const { tr, at, L } = rig();
  tr.trigger({ clipId: 'a' }); // L1:0, 10 s, next after 2 loops; L1's transition 500 ms
  const a = L('L1').play, S = a.startAt;
  assert.equal(a.endsAt, S + 20000);
  assert.equal(tr.nextDue(), S, 'first its start (the started event)');
  at(S);
  assert.equal(tr.nextDue(), S + 20000 - 500 - PREROLL_MS, 'then the switch, ordered a preroll before the next clip starts');
  assert.equal(at(S + 20000 - 500 - PREROLL_MS - 1).layers.L1.play.clipId, 'a');
  tr.takeEvents();
  const s = at(S + 20000 - 500 - PREROLL_MS).layers.L1;
  assert.equal(s.play.clipId, 'b', 'the next one in the row');
  assert.equal(s.play.startAt, S + 20000 - 500, 'it starts 500 ms (the transition) before the end');
  assert.deepEqual([s.from.playId, s.fadeAt, s.transitionMs], [a.playId, S + 19500, 500], 'the outgoing clip fades out until its end');
  assert.equal(playhead(s.from, S + 19900).frame, 297, 'during the crossfade the outgoing clip plays on, it does not wrap to its start');
  assert.deepEqual(tr.takeEvents(), [], 'nothing has started or ended yet');
  at(S + 19500);
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.clipId]), [['started', 'b']]);
  const end = at(S + 20000);
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.clipId, e.reason]), [['ended', 'a', 'end']], 'the outgoing one ends at its own end');
  assert.equal(end.layers.L1.from, null, 'and the crossfade is over');
  // b (5 s, next after 1) → c, also early by L1's transition
  const b = end.layers.L1.play;
  const s2 = at(b.endsAt - 500 - PREROLL_MS).layers.L1;
  assert.deepEqual([s2.play.clipId, s2.play.startAt], ['c', b.endsAt - 500]);
});

// Fails if prev / first / random pick the wrong neighbour, if random picks itself while others exist, or if random is
// not reproducible with the same seed.
test('transport: prev, first and random pick their neighbour in the row; a clip that cannot play is skipped', () => {
  const pick = (cell, end, opts) => {
    const { tr, at, L } = rig(opts);
    tr.trigger({ deckId: 'D1', layerId: 'L1', column: cell, end });
    const p = L('L1').play;
    return at(p.endsAt - 1).layers.L1.play.clipId;
  };
  assert.equal(pick(1, 'prev'), 'a', 'prev of column 1');
  assert.equal(pick(0, 'prev'), 'c', 'prev of the first wraps to the last');
  assert.equal(pick(2, 'first'), 'a');
  const r1 = pick(0, 'random', { random: seeded(3) }), r2 = pick(0, 'random', { random: seeded(3) });
  assert.ok(['b', 'c'].includes(r1), `random picks another clip of the row (${r1})`);
  assert.equal(r1, r2, 'the same seed, the same pick');
  assert.equal(pick(0, 'next', { playable: (c) => (c.id === 'b' ? 'b is missing' : null) }), 'c', 'a neighbour that cannot play is skipped');
  // alone in its row (no cell): it goes round again, with no crossfade with itself
  const { tr, at, L } = rig();
  tr.trigger({ clipId: 'c', layerId: 'L2', end: 'next' });
  const p = L('L2').play;
  const s = at(p.endsAt - PREROLL_MS).layers.L2;
  assert.deepEqual([s.play.clipId, s.play.startAt, s.transitionMs], ['c', p.endsAt, 0]);
});

// ---------------------------------------------------------------------------------------------- columns, toggle, restart, crossfade

// Fails if a layer with ignoreColumn is relaunched or cleared by a column, or if a layer with an empty cell keeps its clip.
test('transport: a column launches every layer but the ignoreColumn ones; a layer with nothing in that column is cleared', () => {
  const { tr, L } = rig();
  tr.trigger({ deckId: 'D1', layerId: 'L3', column: 1 }); // the background
  tr.trigger({ clipId: 'loop' });                          // L2
  const bg = L('L3').play.playId;
  const r = tr.columnTrigger({ deckId: 'D1', column: 2 });
  assert.deepEqual(r.plays.map((p) => p.layerId), ['L1']);
  assert.equal(L('L1').play.clipId, 'c');
  assert.deepEqual([L('L2').state, L('L2').from?.clipId, L('L2').transitionMs], ['empty', 'loop', 1000], 'no cell in column 2: L2 fades out with its transition');
  assert.equal(L('L3').play.playId, bg, 'ignoreColumn: the background goes on, not even restarted');
  assert.deepEqual(tr.state().column, { deckId: 'D1', index: 2 });
  assert.throws(() => tr.columnTrigger({ deckId: 'D1', column: 8 }), /column: a whole number from 0 to 7/);
});

// Fails if next / prev land on a column with no clips, or do not wrap.
test('transport: column.next / prev go to the next column that has clips, wrapping', () => {
  const { tr } = rig();
  const go = (dir) => tr.step(dir).column;
  assert.deepEqual([go(1), go(1), go(1), go(1)], [0, 1, 2, 0], 'column 3 only has an ignoreColumn layer; 4–7 are empty');
  assert.deepEqual([go(-1), go(-1)], [2, 1]);
});

// Fails if the second launch of a toggle clip restarts it instead of ejecting it.
test('transport: toggle — the second launch ejects, the third plays again; a column never toggles', () => {
  const { tr, L } = rig();
  const first = tr.trigger({ clipId: 'tog', layerId: 'L1' });
  assert.ok(first.playId);
  const second = tr.trigger({ clipId: 'tog', layerId: 'L1' });
  assert.deepEqual([second.toggled, second.playId, L('L1').state, L('L1').from?.playId], [true, null, 'empty', first.playId]);
  const third = tr.trigger({ clipId: 'tog', layerId: 'L1' });
  assert.notEqual(third.playId, first.playId);
  assert.equal(L('L1').state, 'playing');
  // the same toggle clip launched twice by its column: a scene change restarts it, it never ejects it
  const t2 = new Transport({ now: () => 1000, settings: clipSettings });
  t2.setShow(normalizeShow({ id: 'x', media: MEDIA, clips: CLIPS, layers: LAYERS, decks: [{ id: 'D1', cells: { 'L1:0': 'tog' } }] }));
  t2.columnTrigger({ column: 0 });
  const one = t2.state().layers.L1.play.playId;
  t2.columnTrigger({ column: 0 });
  assert.equal(t2.state().layers.L1.state, 'playing');
  assert.notEqual(t2.state().layers.L1.play.playId, one);
});

// Fails if Normal (restart) on the clip that is already there crossfades it with itself instead of jumping to its start.
test('transport: Normal on the playing clip restarts it from its start (no crossfade with itself)', () => {
  const { tr, clock, L } = rig();
  const one = tr.trigger({ clipId: 'loop' });
  clock.t = 5000;
  const two = tr.trigger({ clipId: 'loop' });
  assert.notEqual(two.playId, one.playId);
  assert.equal(L('L2').play.startAt, 5000 + PREROLL_MS);
  assert.equal(L('L2').from, null);
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.playId, e.reason]), [['ended', one.playId, 'restarted']]);
});

// Fails if the outgoing clip is dropped at the order (a black gap during the preroll) or its playhead jumps.
test('transport: a crossfade — `from` is the outgoing play, full until the new one starts, then fading over the transition', () => {
  const { tr, at, clock, L } = rig();
  tr.trigger({ clipId: 'loop', layerId: 'L2' });
  const old = L('L2').play;
  clock.t = 4000;
  const r = tr.trigger({ clipId: 'c', layerId: 'L2' }); // L2's transition: 1000 ms
  const s = L('L2');
  assert.deepEqual([s.play.clipId, s.from.playId, s.from.startAt, s.fadeAt, s.transitionMs], ['c', old.playId, old.startAt, r.startAt, 1000], 'the outgoing play keeps its own timeline');
  assert.equal(at(r.startAt + 999).layers.L2.from.playId, old.playId);
  assert.equal(at(r.startAt + 1000).layers.L2.from, null);
  assert.ok(tr.takeEvents().some((e) => e.event === 'ended' && e.playId === old.playId && e.reason === 'replaced'));
});

// ---------------------------------------------------------------------------------------------- xlayer, clears, blackout, edits

// Fails if the experience's clips are touched by the grid's columns or by a preset's grid clear, or if clearAll leaves them.
test('transport: the experience layer (xlayer) — plays once by default, overrides apply, columns and grid clears leave it alone', () => {
  const { tr, L } = rig();
  const r = tr.trigger({ clipId: 'c', layerId: XLAYER });
  const x = () => tr.state().xlayer;
  assert.deepEqual([r.layerId, x().play.end, x().play.endsAt], [XLAYER, 'clear', r.startAt + 5000], 'what an experience launches plays once');
  tr.columnTrigger({ deckId: 'D1', column: 0 });
  assert.equal(x().play.playId, r.playId);
  tr.clearAll({ grid: true, x: false });
  assert.equal(x().play.playId, r.playId);
  assert.equal(L('L1').state, 'empty');
  const r2 = tr.trigger({ clipId: 'c', layerId: XLAYER, end: 'loop', transitionMs: 0 });
  assert.deepEqual([x().play.end, x().play.playId, x().from], ['loop', r2.playId, null], 'vt.media.play({end, transitionMs}): the same clip restarts with the new end');
  tr.clearAll();
  assert.equal(x().state, 'empty');
  assert.throws(() => tr.trigger({ clipId: 'c', layerId: XLAYER, end: 'sideways' }), /end: one of/);
  assert.throws(() => tr.trigger({ clipId: 'c', layerId: XLAYER, transitionMs: 99999 }), /transitionMs/);
});

// Fails if layer.clear ignores the layer's transition (or an explicit one), or if blackout stops the plays.
test('transport: layer.clear uses the layer\'s transition; blackout is a flag with its instant, the plays go on under it', () => {
  const { tr, clock, L } = rig();
  tr.trigger({ clipId: 'loop' });
  const id = L('L2').play.playId;
  clock.t = 3000;
  tr.clear('L2');
  assert.deepEqual([L('L2').state, L('L2').from.playId, L('L2').fadeAt, L('L2').transitionMs], ['empty', id, 3000, 1000]);
  tr.trigger({ clipId: 'c', layerId: 'L1' });
  tr.clear('L1', { transitionMs: 0 });
  assert.equal(L('L1').transitionMs, 0);
  tr.trigger({ clipId: 'loop' });
  clock.t = 4000;
  assert.deepEqual(tr.setBlackout(true), { blackout: true });
  assert.deepEqual([tr.state().blackout, tr.state().blackoutAt, L('L2').state], [true, 4000, 'playing']);
  assert.throws(() => tr.setBlackout('yes'), /true or false/);
  assert.throws(() => tr.clear('L9'), /unknown layer/);
});

// Fails if a clip that cannot play changes anything (a half-done launch), or if an edit leaves a deleted clip playing.
test('transport: a clip that cannot play changes nothing; an edit that deletes a playing clip stops it', () => {
  const { tr, L } = rig({ playable: (c) => (c.id === 'c' ? '"five.mov" is missing from the media library.' : null) });
  tr.trigger({ clipId: 'loop' });
  const before = JSON.stringify(tr.state()), rev = tr.rev;
  tr.takeEvents();
  assert.throws(() => tr.trigger({ clipId: 'c', layerId: 'L2' }), /missing from the media library/);
  assert.equal(JSON.stringify(tr.state()), before);
  assert.equal(tr.rev, rev);
  assert.deepEqual(tr.takeEvents(), []);
  // an edit: the playing clip "loop" leaves the show
  const s = SHOW();
  tr.setShow({ ...s, clips: s.clips.filter((c) => c.id !== 'loop'), decks: [{ ...s.decks[0], cells: { 'L1:0': 'a', 'L1:2': 'c' } }] });
  assert.deepEqual([L('L2').state, L('L2').from], ['empty', null], 'stopped at once (its media may be gone too)');
  assert.deepEqual(tr.takeEvents().map((e) => [e.event, e.clipId, e.reason]), [['ended', 'loop', 'removed']]);
  const r = tr.columnTrigger({ deckId: 'D1', column: 2 });
  assert.deepEqual(r.errors, [{ layerId: 'L1', error: '"five.mov" is missing from the media library.' }], 'a column says which layer could not play');
});

// ---------------------------------------------------------------------------------------------- the engine

const FIX = path.join(root, 'tests', 'fixtures', 'experiences');

/** An engine on a temp folder with the test show open; its clip files are placeholders of the right size in the library. */
async function engineRig(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-tr-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [FIX], ...opts });
  engine.start();
  const lib = engine.media.libraryDir;
  for (const m of MEDIA) { const f = path.join(lib, ...m.file.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size)); }
  store.saveShow(SHOW());
  await engine.command('show.load', { id: 'shw' });
  return { dir, store, engine, lib, close: async () => { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Fails if Show mode blocks what runs a show (launching, columns, clearing, the mix, blackout, presets) or lets show
// edits and imports through.
test('engine: in Show mode the transport works (launch, column, clear, mix, blackout, presets); show.update and media.import are refused', async () => {
  const r = await engineRig();
  try {
    const { engine } = r;
    await engine.command('app.lock', { locked: true });
    const out = await engine.command('clip.trigger', { clipId: 'loop', __client: { id: 'd2', device: 'a phone' } });
    assert.equal(out.layerId, 'L2');
    await engine.command('column.trigger', { deckId: 'D1', column: 0 });
    await engine.command('column.next', {});
    await engine.command('column.prev', {});
    await engine.command('layer.clear', { layerId: 'L1' });
    await engine.command('layer.set', { layerId: 'L2', opacity: 0.5, volume: 0.8, mute: true, blend: 'add', bypass: false });
    await engine.command('media.blackout', { on: true });
    await engine.command('media.clearAll', {});
    await engine.command('preset.unload', {});
    const m = engine.state().media;
    assert.deepEqual([m.blackout, m.layers.L2.opacity, m.layers.L2.volume, m.layers.L2.mute, m.layers.L2.blend], [true, 0.5, 0.8, true, 'add']);
    await assert.rejects(engine.command('show.update', { show: engine.state().show, rev: engine.state().show.rev }), /locked \(Show mode\)/);
    await assert.rejects(engine.command('media.import', { paths: [path.join(r.dir, 'x.mov')], __local: true }), /locked \(Show mode\)/);
    await assert.rejects(engine.command('layer.set', { layerId: 'L2', opacity: 2 }), /opacity: a number from 0 to 1/);
    await assert.rejects(engine.command('layer.set', { layerId: 'L9', opacity: 1 }), /unknown layer/);
  } finally { await r.close(); }
});

// Fails if a live mix change (allowed in Show mode) bumps the show's revision when it is written (a concurrent edit made
// with the revision it had would be refused as stale for no reason), or if an edit made from a copy of the show from
// before the mix puts the old mix back.
test('engine: a live layer.set written into the show does not bump its revision, and a show edit keeps the mix', async () => {
  const r = await engineRig();
  try {
    const { engine } = r;
    const old = engine.state().show;
    const stamp0 = engine.media.showStamp;
    await engine.command('layer.set', { layerId: 'L1', opacity: 0.25 });
    assert.equal(engine.state().media.layers.L1.opacity, 0.25, 'live at once in the transport');
    await until(() => r.store.loadShow('shw').layers[0].opacity === 0.25, 3000, 'the mix written into the show (700 ms after it settles)');
    assert.equal(engine.state().show.rev, old.rev, 'the revision did not move');
    assert.notEqual(engine.media.showStamp, stamp0, 'but clients are told the show changed');
    await engine.command('show.update', { show: { ...old, name: 'Edited' }, rev: old.rev });
    assert.equal(engine.state().show.name, 'Edited');
    assert.equal(engine.state().media.layers.L1.opacity, 0.25, 'the edit kept the mix');
    await assert.rejects(engine.command('show.update', { show: { ...old, name: 'Stale' }, rev: old.rev }), /^Error: stale/);
  } finally { await r.close(); }
});

// Fails if the engine launches a clip whose file is missing or still being copied (the output page would get a play it
// cannot draw), changes the transport for it, or does not tell the caller why.
test('engine: a clip whose file is missing (or still copying) does not change the transport and the caller gets the error', async () => {
  const r = await engineRig();
  try {
    const { engine, lib } = r;
    await engine.command('clip.trigger', { clipId: 'loop' });
    const noProblems = (m) => JSON.stringify({ ...m, problems: null });
    const before = noProblems(engine.state().media);
    const msgs = [];
    engine.on('media', (m) => msgs.push(m));
    // a launch does not stat the file: it uses what the library check found (every 10 s, and after a change)
    fs.rmSync(path.join(lib, 'shw', 'five.mov'));
    await engine.media.check();
    await assert.rejects(engine.command('clip.trigger', { clipId: 'c', layerId: 'L2' }), /"five\.mov" is missing from the media library\./);
    fs.writeFileSync(path.join(lib, 'shw', 'five.mov'), Buffer.alloc(10)); // the wrong size: not the file the show knows
    await engine.media.check();
    await assert.rejects(engine.command('clip.trigger', { clipId: 'c', layerId: 'L2' }), /missing from the media library/);
    engine.media.jobs.set('i9', { id: 'i9', kind: 'import', showId: 'shw', mediaId: 'm300', name: 'reel.mov', state: 'copying', done: 0, total: 1400, dst: path.join(lib, 'shw', 'reel.mov') });
    await assert.rejects(engine.command('clip.trigger', { clipId: 'reel', layerId: 'L1' }), /"reel\.mov" is still being copied into the library\./);
    engine.media.jobs.delete('i9');
    assert.equal(noProblems(engine.state().media), before, 'the transport is as it was');
    assert.equal(msgs.filter((m) => m.rev !== engine.state().media.rev).length, 0, 'and no transport change was announced');
    await assert.rejects(engine.command('clip.trigger', { clipId: 'nope' }), /unknown clip/);
    await assert.rejects(engine.command('clip.trigger', { deckId: 'D1', layerId: 'L1', column: 5 }), /that cell is empty/);
  } finally { await r.close(); }
});

// Fails if the restored times are not moved from the old process's clock to the new one's (each engine process has its
// own performance.now(): the position would be off by the difference, here ~105 s), if what would have ended during
// the restart is still there, or if a snapshot of another show is taken back.
test('engine: snapshot — after a restart in the middle of a 300 s clip the position carries on within 100 ms', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-snap-'));
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  for (const m of MEDIA) { const f = path.join(store.mediaDir(settings), ...m.file.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(m.size)); }
  store.saveShow(SHOW());
  const profile = normalizeProfile({ name: 'Room', media: { showId: 'shw' } });
  const W0 = 1.8e12;
  const make = (clock) => {
    const m = new MediaEngine({ store, log: quiet, settings, profile: () => profile, setShowId() {}, clock, checkMs: 3600000 });
    m.profileChanged(profile);
    m.start();
    return m;
  };
  let ta = 5000, tb = 300;
  const A = make({ now: () => ta, wall: () => W0 + ta });
  let B = null;
  try {
    const reel = await A.command('clip.trigger', { clipId: 'reel', layerId: 'L1' }); // 300 s, plays once
    await A.command('clip.trigger', { clipId: 'loop', layerId: 'L2' });
    await A.command('clip.trigger', { clipId: 'clear', layerId: 'L3' });              // 10 s: over before the restart
    await A.command('media.blackout', { on: true });
    assert.ok(fs.existsSync(path.join(store.dir, 'run', 'transport.json')), 'written on each change');
    const startWall = W0 + reel.startAt; // when its first frame was shown, on the wall clock
    ta = 105120;                         // 100 s into the reel the engine dies (no stop: a crash)…
    // …and a new process starts 2 s later: its own clock starts near zero
    B = make({ now: () => tb, wall: () => W0 + 105120 + 2000 + (tb - 300) });
    const s = B.mediaState();
    assert.equal(s.layers.L1.play.playId, reel.playId, 'the same play');
    const pos = playhead(s.layers.L1.play, tb).time, want = (W0 + 107120 - startWall) / 1000;
    assert.ok(Math.abs(pos - want) < 0.1, `position ${pos} s, expected ${want} s`);
    assert.ok(Math.abs(playhead(s.layers.L2.play, tb).time - (want % 10)) < 0.1, 'a loop is where it would be');
    assert.equal(s.layers.L3.state, 'empty', 'the 10 s clip ended while the engine was down');
    assert.equal(s.blackout, true);
    assert.equal(B.transport.nextDue(), s.layers.L1.play.endsAt, 'the end of the reel is scheduled on the new clock');
    assert.ok(Math.abs(s.layers.L1.play.endsAt - (tb + (300 - want) * 1000)) < 100);
    // a snapshot of another show is not taken back
    await B.stop();
    const other = { ...profile, media: { showId: 'other' } };
    store.saveShow({ ...SHOW(), id: 'other', name: 'Other' });
    const C = new MediaEngine({ store, log: quiet, settings, profile: () => other, setShowId() {}, clock: { now: () => 50, wall: () => W0 + 108000 }, checkMs: 3600000 });
    C.profileChanged(other); C.start();
    assert.equal(C.mediaState().layers.L1.state, 'empty');
    await C.stop();
  } finally { await A.stop(); await B?.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// Fails if a transport change waits for the copy-progress throttle (the pages schedule on it), or if the events do not
// reach the clients with the play's id.
test('server: a launch reaches the UI at once as a `media` message with the transport, then `mediaEvent` started with its playId', async () => {
  const r = await engineRig();
  const server = await createServer(r.engine, { port: 0, root, log: quiet });
  r.engine.port = server.port;
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
  const msgs = [];
  ws.on('message', (d, bin) => { if (!bin) msgs.push(JSON.parse(d.toString())); });
  try {
    await until(() => ws.readyState === 1 && msgs.some((m) => m.type === 'state'), 5000, 'the UI socket');
    const first = msgs.find((m) => m.type === 'state');
    assert.deepEqual(Object.keys(first.media.layers), ['L1', 'L2', 'L3'], 'the initial state carries the transport');
    const t0 = Date.now();
    const res = await r.engine.command('clip.trigger', { clipId: 'c', layerId: 'L1' });
    const media = await until(() => msgs.find((m) => m.type === 'media' && m.layers?.L1?.play?.playId === res.playId), 2000, 'the media message');
    assert.ok(Date.now() - t0 < 200, 'at once, not throttled');
    assert.deepEqual([media.layers.L1.state, media.layers.L1.play.startAt, media.prerollMs], ['playing', res.startAt, PREROLL_MS]);
    assert.ok(Array.isArray(media.import) && Array.isArray(media.problems), 'the same message as the copies');
    const ev = await until(() => msgs.find((m) => m.type === 'mediaEvent' && m.event === 'started'), 2000, 'the started event');
    assert.deepEqual([ev.playId, ev.clipId, ev.layerId], [res.playId, 'c', 'L1']);
    await r.engine.command('layer.clear', { layerId: 'L1', transitionMs: 0 });
    const ended = await until(() => msgs.find((m) => m.type === 'mediaEvent' && m.event === 'ended'), 2000, 'the ended event');
    assert.deepEqual([ended.playId, ended.reason], [res.playId, 'cleared']);
    // the pages load THE formula from the engine
    const js = await fetch(`http://127.0.0.1:${server.port}/shared/transport.js`).then((x) => x.text());
    assert.match(js, /export function playhead/);
    assert.equal(/^\s*import\s/m.test(js), false, 'it imports nothing (a page can load it as it is)');
  } finally { ws.close(); server.close(); await r.close(); }
});

// Fails if the clips' audio settings of the room can be routed in Show mode, or bad values get through.
test('engine: audio.media sets the clips\' audio of the room; Show mode lets only the level through', async () => {
  const r = await engineRig();
  try {
    const { engine } = r;
    const res = await engine.command('audio.media', { level: 0.7, avOffsetMs: -40, route: 'mono', width: 0.3, duckDb: -12, matrix: [[0, null], [null, -6]] });
    assert.deepEqual([res.media.level, res.media.avOffsetMs, res.media.route, res.media.width, res.media.duckDb, res.media.matrix], [0.7, -40, 'mono', 0.3, -12, [[0, null], [null, -6]]]);
    assert.equal(engine.state().profile.audio.media.route, 'mono');
    for (const [args, why] of [[{}, /one of level/], [{ level: 2 }, /level: from 0 to 1/], [{ route: 'surround' }, /route: one of/], [{ front: 'nowhere' }, /front: a wall/], [{ matrix: [[99]] }, /matrix/]]) {
      await assert.rejects(engine.command('audio.media', args), why);
    }
    await engine.command('app.lock', { locked: true });
    await engine.command('audio.media', { level: 0.4 });
    assert.equal(engine.state().profile.audio.media.level, 0.4);
    await assert.rejects(engine.command('audio.media', { route: 'spread' }), /locked \(Show mode\)/);
  } finally { await r.close(); }
});
