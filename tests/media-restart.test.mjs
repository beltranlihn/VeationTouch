// Robustness of the media server (MEDIA-SERVER.md §8 F13): the room starts on its own (show.start), an engine restart
// takes the transport back from <data>/run/transport.json, a missing file never stops the room, the health items
// (status.health: room output, clips, audio, library, the engine's loop) and the compact state of the internet relay
// (engine/media/wire.js). Node only. The output page's side of a restart (it keeps playing and picks the engine up again)
// is in tests/hap-player.test.mjs; app/main.js's window recovery is checked statically at the end.
// Each test says what breaks it ("fails if …").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow, newClip } from '../engine/media/show.js';
import { playhead } from '../engine/media/transport.js';
import { CLIP_DEFAULTS, compactState, expandState, compactClip, expandClip } from '../engine/media/wire.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = {
  name: 'Restart room', canvas: { width: 800, height: 200 },
  walls: [
    { id: 'W1', name: 'North', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } },
    { id: 'W2', name: 'East', width: 4, height: 2, pixelRect: { x: 400, y: 0, w: 400, h: 200 } },
  ],
};
const vid = (sec) => ({ fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: Math.round(sec * 30), duration: sec });
const MEDIA = [
  { id: 'm1', file: 'rst/long.mov', size: 900, fingerprint: 'a'.repeat(40), video: vid(300), audio: null },
  { id: 'm2', file: 'rst/other.mov', size: 800, fingerprint: 'b'.repeat(40), video: vid(60), audio: null },
  { id: 'm3', file: 'rst/third.mov', size: 700, fingerprint: 'c'.repeat(40), video: vid(60), audio: null },
];
const SHOW = (start = {}) => normalizeShow({
  id: 'rst', name: 'Restart show', media: MEDIA,
  clips: [
    { id: 'c1', mediaId: 'm1', name: 'Long loop', end: 'loop' },
    { id: 'c2', mediaId: 'm2', name: 'Other', end: 'loop' },
    { id: 'c3', mediaId: 'm3', name: 'Third', end: 'loop' },
    { id: 'c4', mediaId: 'm2', name: 'Column two', end: 'loop' },
  ],
  layers: [{ id: 'L1' }, { id: 'L2' }],
  decks: [{ id: 'D1', columns: 4, cells: { 'L1:0': 'c1', 'L2:0': 'c2', 'L1:1': 'c3', 'L2:1': 'c4' } }],
  presets: [{ id: 'p1', name: 'Probe card', experienceId: 'touch-probe', params: { gain: 1.5 }, onLoad: 'keep' }],
  start,
});

/**
 * A data folder with the room, the show (open) and its files in the library — but those named in `missing`.
 * `boot(opts)` makes an engine on it and starts it (opts.clock: the media clock of that "process").
 */
function room({ start = {}, missing = [], profile = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-f13-'));
  const prep = new Store(dir, null, quiet);
  const p = normalizeProfile({ ...PROFILE, ...profile });
  p.media = { ...p.media, showId: 'rst' };
  prep.saveProfile(p);
  prep.saveSettings({ ...prep.loadSettings(), activeProfile: p.id });
  prep.saveShow(SHOW(start));
  const lib = prep.mediaDir(prep.loadSettings());
  for (const m of MEDIA) {
    if (missing.includes(m.id)) continue;
    const f = path.join(lib, ...m.file.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.alloc(m.size));
  }
  const engines = [];
  return {
    dir, lib,
    file: (id) => path.join(lib, ...MEDIA.find((m) => m.id === id).file.split('/')),
    boot({ clock = null } = {}) {
      const store = new Store(dir, null, quiet);
      const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [FIX], media: clock ? { clock } : {} });
      engine.start();
      engines.push(engine);
      return engine;
    },
    async close() { for (const e of engines) await e.stop().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// ---------------------------------------------------------------------------------------------- restart

// Fails if the engine does not take the transport back from its snapshot (the room would go black after a restart),
// takes it back without moving the times to the new process's clock (the position would jump by the clock difference),
// or gives the play a new id (the output page would start it again from its first frame).
test('restart: an engine restarted mid-clip has the same play, on the same clip, where the time that went by puts it', async () => {
  const r = room();
  try {
    const a = r.boot();
    assert.equal(a.media.show?.id, 'rst');
    const { playId } = await a.command('clip.trigger', { clipId: 'c1' });
    const wall0 = Date.now(), now0 = performance.now(), p0 = a.state().media.layers.L1.play;
    await sleep(400);
    await a.stop();
    await sleep(300);
    // another process: its monotonic clock is somewhere else entirely (a fresh performance.now())
    const off = 123456.7;
    const b = r.boot({ clock: { now: () => performance.now() + off, wall: () => Date.now() } });
    const L1 = b.state().media.layers.L1;
    assert.equal(L1.state, 'playing', 'the clip plays on');
    assert.equal(L1.play.playId, playId, 'the same play (the output page does not start it again)');
    assert.equal(L1.play.clipId, 'c1');
    const want = ((Date.now() - wall0) + now0 - p0.startAt) / 1000; // seconds since its first frame (after the preroll)
    assert.ok(want > 0.5, `time went by (${want.toFixed(3)} s)`);
    const got = playhead(L1.play, performance.now() + off).time;
    assert.ok(Math.abs(got - want) < 0.1, `position ${got.toFixed(3)} s, the time that went by says ${want.toFixed(3)} s`);
    assert.ok(Math.abs(L1.play.startAt - (p0.startAt + off)) < 50, `startAt moved to the new clock (${L1.play.startAt} vs ${p0.startAt + off})`);
  } finally { await r.close(); }
});

// Fails if a play whose file went while the engine was down is taken back (its layer would show a broken clip, and the
// output page would hold its last image for a second, then fade it), or if it takes the others with it.
test('restart: a clip whose file went while the engine was down is left out; the others play on; Problems says which', async () => {
  const r = room();
  try {
    const a = r.boot();
    await a.command('column.trigger', { deckId: 'D1', column: 0 });
    assert.deepEqual([a.state().media.layers.L1.state, a.state().media.layers.L2.state], ['playing', 'playing']);
    await a.stop();
    fs.rmSync(r.file('m2'));
    const b = r.boot();
    await b.media.check();
    const M = b.state().media;
    assert.equal(M.layers.L1.state, 'playing', 'L1 carries on');
    assert.equal(M.layers.L1.play.clipId, 'c1');
    assert.equal(M.layers.L2.play, null, 'L2 is empty: its file is gone');
    assert.ok(M.problems.some((p) => p.kind === 'missing-media' && p.mediaId === 'm2'), `Problems: ${JSON.stringify(M.problems)}`);
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- the room starts on its own

// Fails if the engine does not load the start card and launch the start column when it starts, launches them again when
// a show is opened later or after a restart that took the transport back (the operator's column would be replaced), or
// ignores the switch that turns it off.
test('start: show.start loads its card and launches its column when the engine starts — and only then', async () => {
  const r = room({ start: { presetId: 'p1', deckId: 'D1', column: 1 }, profile: { experience: { id: 'touch-probe', autostart: true } } });
  try {
    const a = r.boot();
    let M = a.state().media;
    assert.equal(M.preset?.id, 'p1', 'the start card is live');
    assert.equal(a.state().experience.running, true, 'its experience runs');
    assert.equal(a.profile.experience.params['touch-probe']?.gain, 1.5, 'with the card\'s parameters');
    assert.deepEqual(M.column, { deckId: 'D1', index: 1 }, 'the start column was launched');
    assert.deepEqual([M.layers.L1.play?.clipId, M.layers.L2.play?.clipId], ['c3', 'c4']);
    assert.equal(a.media.autostart(), null, 'once per engine');
    // the operator moves on; the show is opened again: nothing is launched by itself
    await a.command('column.trigger', { deckId: 'D1', column: 0 });
    await a.command('layer.clear', { layerId: 'L2', transitionMs: 0 });
    await a.command('show.load', { id: 'rst' });
    M = a.state().media;
    assert.deepEqual([M.column?.index, M.layers.L1.play?.clipId, M.layers.L2.play], [0, 'c1', null], 'opening the show starts nothing');
    // a restart a moment later: what played comes back, not the start column
    await a.stop();
    const b = r.boot();
    M = b.state().media;
    assert.deepEqual([M.column?.index, M.layers.L1.play?.clipId, M.layers.L2.play], [0, 'c1', null], 'after a restart: where it was');
    assert.equal(M.preset?.id, 'p1');
    await b.stop();
  } finally { await r.close(); }
  // switched off: the room comes up with nothing launched
  const off = room({ start: { presetId: 'p1', deckId: 'D1', column: 1 }, profile: { experience: { id: 'touch-probe', autostart: true }, media: { autostart: false } } });
  try {
    const c = off.boot();
    const M = c.state().media;
    assert.deepEqual([M.column, M.layers.L1.play, M.preset?.id ?? null], [null, null, null], 'profile.media.autostart off: nothing');
  } finally { await off.close(); }
  // a card with the experience not set to start with the app: the column alone
  const col = room({ start: { presetId: 'p1', deckId: 'D1', column: 0 } });
  try {
    const d = col.boot();
    const M = d.state().media;
    assert.equal(M.preset, null, 'the card waits for "Start with the app"');
    assert.equal(M.layers.L1.play?.clipId, 'c1', 'the column starts');
  } finally { await col.close(); }
});

// Fails if a missing file stops the start (an exception before the other layers launch) or is launched anyway.
test('start: with a file missing the room starts anyway, without that clip, and Problems says which', async () => {
  const r = room({ start: { deckId: 'D1', column: 0 }, missing: ['m2'] });
  try {
    const a = r.boot();
    await a.media.check();
    const M = a.state().media;
    assert.equal(M.layers.L1.play?.clipId, 'c1', 'the clip that is there plays');
    assert.equal(M.layers.L2.play, null, 'the missing one is left out');
    assert.ok(M.problems.some((p) => p.kind === 'missing-media' && p.mediaId === 'm2' && /missing/.test(p.text)), JSON.stringify(M.problems));
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- health

// Fails if a blocked event loop (a stall the touches feel) is not measured as the gap between two ticks, or does not
// reach Problems (status.health) and /api/health's figures.
test('health: a stall of the 60 Hz loop shows as tickGapMs and an engine-stall item', async () => {
  const r = room();
  try {
    const e = r.boot();
    await sleep(1200);
    const idle = e.status().engine;
    assert.ok(idle.tickGapMs > 0, `idle gap ${idle.tickGapMs} ms`);
    assert.ok(!e.status().health.some((x) => x.code === 'engine-stall'));
    const t0 = performance.now(); while (performance.now() - t0 < 320) { /* the loop is blocked */ }
    await sleep(1150);
    const st = e.status();
    assert.ok(st.engine.tickGapMs >= 300 || e.tickStats.stallMs >= 300, `the gap after the block: ${st.engine.tickGapMs} ms (stall ${e.tickStats.stallMs})`);
    const item = st.health.find((x) => x.code === 'engine-stall');
    assert.ok(item && item.kind === 'warn' && /stalled for \d+ ms/.test(item.text), JSON.stringify(st.health));
    assert.ok(!e.healthItems(Date.now() + 31000).some((x) => x.code === 'engine-stall'), 'it leaves after 30 s');
  } finally { await r.close(); }
});

// Fails if the desktop app's output window can stop answering (or never open) without Problems saying so, if a
// headless engine (no windows at all) complains, or if late clip frames and a missing library never reach Problems.
test('health: room output down or in error, clip frames late, the library unreachable', async () => {
  const r = room();
  try {
    const e = r.boot();
    await e.command('output.set', { on: true });
    const codes = (now) => e.healthItems(now).map((x) => x.code);
    assert.deepEqual(codes(Date.now() + 60000).filter((c) => c.startsWith('output')), [], 'headless: no window to check');
    e.desktop = true;
    assert.ok(!codes(Date.now()).includes('output-down'), 'just asked for: give it time');
    assert.ok(codes(Date.now() + 16000).includes('output-down'), 'never reported: it did not open');
    e.setOutputPreview(null, { fps: 60 });
    assert.ok(!codes(Date.now() + 4000).some((c) => c.startsWith('output')), 'reporting: fine');
    const down = e.healthItems(Date.now() + 6000).find((x) => x.code === 'output-down');
    assert.ok(down && down.kind === 'bad' && /not answering/.test(down.text), 'silent for 6 s: not answering');
    e.setOutputPreview(null, { fps: 0, error: 'The Spout sender could not start (DirectX 11 unavailable?)' });
    assert.match(e.healthItems().find((x) => x.code === 'output-error')?.text || '', /Spout sender could not start/);
    // late clip frames, as the output page reports them every 5 s
    await e.command('media.report', { late: 40, frames: 260, seconds: 5, layers: { L1: 40 } });
    const lag = e.healthItems().find((x) => x.code === 'decode-lag');
    assert.ok(lag && /8 clip frames a second late \(L1\)/.test(lag.text), JSON.stringify(lag));
    assert.ok(!codes(Date.now() + 13000).includes('decode-lag'), 'old figures go');
    await e.command('media.report', { late: 2, frames: 290, seconds: 5, layers: { L1: 2 } });
    assert.ok(!codes(Date.now()).includes('decode-lag'), 'a frame now and then is not a problem');
    // the library's drive unplugged
    fs.rmSync(r.lib, { recursive: true, force: true });
    await e.media.check();
    assert.equal(e.healthItems().find((x) => x.code === 'library-missing')?.kind, 'bad');
  } finally { await r.close(); }
});

// Fails if a sound device that is not there, the audio window's error, or dropouts in the sound are not in Problems.
test('health: audio device missing, audio error, dropouts in the last minute', async () => {
  const r = room();
  try {
    const e = r.boot();
    e.desktop = true;
    await e.command('audio.set', { on: true });
    const sink = (o) => ({ label: 'DVS Transmit 1-8', first: 0, count: 8, state: 'running', underruns: 0, ...o });
    const rep = (sinks, error = null) => ({ devices: [], sinks, logical: 4, available: 8, fold: false, peakDb: -20, isolated: true, error });
    await e.command('audio.report', rep([sink({ missing: true })]));
    const dev = e.healthItems().find((x) => x.code === 'audio-device');
    assert.ok(dev && dev.kind === 'bad' && /DVS Transmit 1-8.*not connected/.test(dev.text), JSON.stringify(dev));
    await e.command('audio.report', rep([sink()], 'NotAllowedError: the device was refused'));
    assert.ok(e.healthItems().some((x) => x.code === 'audio-error' && /refused/.test(x.text)));
    await e.command('audio.report', rep([sink({ underruns: 3 })]));
    const drops = e.healthItems().find((x) => x.code === 'audio-dropouts');
    assert.ok(drops && /3 dropouts in the last minute \(DVS Transmit 1-8\)/.test(drops.text), JSON.stringify(drops));
    assert.ok(!e.healthItems(Date.now() + 61000).some((x) => x.code === 'audio-dropouts'), 'a minute later: gone');
    // the window stops reporting: the report goes after 6 s, Problems says the window does not answer
    e.aud.report = null; e.aud.since = Date.now() - 20000;
    assert.ok(e.healthItems().some((x) => x.code === 'audio-down'));
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- the relay's compact state

// Fails if the defaults left out of a clip are not exactly a new clip's (an expanded clip would differ from the engine's),
// if expanding does not give back the very show (but for mtimeMs, which no page reads), or if finished copies still travel.
test('wire: the compact state of the relay expands back to the engine\'s show; finished copies stay home', () => {
  const show = SHOW();
  const fresh = newClip(show, show.media[0], 'L1');
  for (const k of Object.keys(CLIP_DEFAULTS)) {
    if (k === 'end') continue; // (a new clip's end depends on its audio; 'layer' is the default of one without)
    assert.deepEqual(fresh[k], CLIP_DEFAULTS[k], `the default of ${k} is a new clip's`);
  }
  assert.equal(newClip(show, { ...show.media[0], audio: null }, 'L1').end, CLIP_DEFAULTS.end);
  const st = {
    type: 'state', rev: 3, profile: { id: 'x' },
    show: { ...structuredClone(show), media: show.media.map((m) => ({ ...m, mtimeMs: 1795268569634 })), rev: 7 },
    media: { rev: 1, layers: {}, import: [{ id: 'i1', state: 'done' }, { id: 'i2', state: 'copying' }, { id: 'i3', state: 'cancelled' }, { id: 'i4', state: 'interrupted' }] },
  };
  st.show.clips[0] = { ...st.show.clips[0], color: '#4FC3E8', place: { target: 'wall', wallId: 'W1', fit: 'fit' } };
  const wire = compactState(st);
  assert.equal(wire.compact, 1);
  assert.deepEqual(Object.keys(compactClip(show.clips[1])).sort(), ['end', 'id', 'mediaId', 'name'].sort(), 'only what differs from the defaults');
  assert.deepEqual(wire.media.import.map((j) => j.id), ['i2', 'i4'], 'the copies that are not over');
  assert.ok(JSON.stringify(wire).length < JSON.stringify(st).length * 0.75, 'smaller');
  const back = expandState(JSON.parse(JSON.stringify(wire)));
  assert.equal('compact' in back, false);
  assert.deepEqual(back.show.clips, st.show.clips, 'the clips are the engine\'s');
  assert.deepEqual(back.show.media.map((m) => m.id), st.show.media.map((m) => m.id));
  assert.ok(back.show.media.every((m, i) => m.fingerprint === st.show.media[i].fingerprint && m.file === st.show.media[i].file && m.video.duration === st.show.media[i].video.duration && !('size' in m) && !('mtimeMs' in m)), 'what the phone reads is there; the bookkeeping is not');
  assert.equal(back.show.rev, 7);
  assert.equal(expandState(st), st, 'a full message is left as it is');
  assert.deepEqual(expandClip(compactClip(st.show.clips[0])), st.show.clips[0]);
  // a 'media' message
  const mm = compactState({ type: 'media', rev: 2, import: st.media.import });
  assert.deepEqual([mm.type, mm.import.length, mm.compact], ['media', 2, 1]);
});

// ---------------------------------------------------------------------------------------------- the output window (app/main.js)

// Fails if the desktop app stops making a fresh output window when its renderer dies or hangs, or stops loading its page
// again when the load failed (the room would stay black until someone restarts the app). Static: it is Electron's main
// process; the page's own side (it keeps playing and takes the engine back) runs in tests/hap-player.test.mjs.
test('output window: the app makes it again when its renderer dies, hangs or its page does not load', () => {
  const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
  const fn = main.slice(main.indexOf('function applyOutputWindow'), main.indexOf('function closeAudioWindow'));
  assert.match(fn, /'render-process-gone'[\s\S]{0,200}closeOutputWindow\(\); applyOutputWindow\(\);/, 'renderer gone: a fresh window');
  assert.match(fn, /w\.on\('unresponsive'[\s\S]{0,120}recoverOutput\(w,/, 'Chromium says it hangs: a fresh window');
  assert.match(fn, /'did-fail-load'[\s\S]{0,400}w\.loadURL\(uiUrl\(want\.url\)\)/, 'a failed load is tried again');
  const pv = main.slice(main.indexOf('function startPreview'), main.indexOf('function unionBounds'));
  assert.match(pv, /if \(busy\) \{ if \(Date\.now\(\) - busySince > OUT_HANG_MS\) recoverOutput\(w,/, 'the heartbeat: a page that does not answer gets a fresh window');
  const rec = main.slice(main.indexOf('function recoverOutput'), main.indexOf('function startPreview'));
  assert.match(rec, /closeOutputWindow\(\);\s*applyOutputWindow\(\);/);
});
