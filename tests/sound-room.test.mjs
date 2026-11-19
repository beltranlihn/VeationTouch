// The room's sound end to end, with the REAL parts together (no fakes in the chain): the routing graph of the app
// (ui/js/audio-graph.js, with XR Lab's audio map read from profiles/xrlab.json), the real sound piece
// (experiences/ambient-notes) and the runtime's hands in sound mode (experiences/runtime.js › makeHands). Rendered with an
// OfflineAudioContext in Electron's renderer (tests/ui/runner.cjs) on the cross-origin-isolated audio page of a test engine.
// The parts have their own tests (tests/audio*.test.mjs, tests/ambient-notes.test.mjs); these check that they fit.
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
try { electronPath = (await import('electron')).default; } catch { /* not installed: skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

// XR Lab as its profile has it: the walls in order and the audio block (P4, P1, P2, P3 → 1–4, sub on 5 at 90 Hz)
const XR = normalizeProfile(JSON.parse(fs.readFileSync(path.join(root, 'profiles', 'xrlab.json'), 'utf8')));
const ROOM = { ...XR.audio, master: 1, mute: false, walls: XR.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: w.height })), fold: false };

async function inAudioPage(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-soundroom-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, PRE + script);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/audio`, `--script=${file}`, '--wait=load'];
    const out = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = out.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${out.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    assert.deepEqual(data.errors, [], `page errors: ${data.errors.join(' | ')}`);
    if (process.env.VT_VERBOSE) console.log(JSON.stringify(data.result));
    return data.result;
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

const PRE = `
const { buildRoomAudio } = await import('/js/audio-graph.js');
const { makeHands } = await import('/experiences/runtime.js');
const piece = (await import('/experiences/ambient-notes/sound.js')).default;
const T = await import('/experiences/ambient-notes/test-host.js');
const SR = 48000, ROOM = ${JSON.stringify(ROOM)}, DEF = await T.manifestDefaults();
const WALLS = ROOM.walls, CH = ROOM.channels, SUB = ROOM.sub.channel ? ROOM.sub.channel - 1 : -1;
const USED = [...new Set(Object.values(ROOM.map).flat())].map((c) => c - 1);
const chOf = (wallId) => ROOM.map[wallId].map((c) => c - 1);

// the runtime's side of the contract, without an engine: params, walls, on / emit (makeHands emits into it)
function hub(params) {
  const L = {}, log = [];
  return { params, walls: WALLS.map(({ id, name, width, height }) => ({ id, name, width, height })), closedLoop: false, size: { width: 4000, height: 500 }, log,
    on(t, fn) { (L[t] ||= new Set()).add(fn); return () => L[t].delete(fn); },
    emit(t, e) { if (t === 'touch') log.push(e.type); for (const fn of [...(L[t] || [])]) fn(e); },
    hands: () => [] };
}
// a piece much louder than it should be: everything it sends is multiplied by k on the way into the host
function heat(audio, ctx, k) {
  const hot = (into) => { const g = ctx.createGain(); g.gain.value = k; g.connect(into); return g; };
  return { ...audio,
    wallInput(id, u) { const h = audio.wallInput(id, u); return { node: hot(h.node), setPosition: h.setPosition, disconnect: h.disconnect }; },
    roomInput: () => hot(audio.roomInput()), subInput: () => hot(audio.subInput()) };
}
// things to do at a time while rendering (grouped by render quantum: one suspend per quantum)
function schedule(ctx, steps) {
  const q = 128 / SR, byQ = new Map();
  for (const s of steps) { const k = Math.max(1, Math.round(s.t / q)); (byQ.get(k) || byQ.set(k, []).get(k)).push(s.fn); }
  for (const [k, fns] of byQ) ctx.suspend(k * q).then(async () => { for (const fn of fns) await fn(); ctx.resume(); });
}
/** The app's room graph + the real piece on an OfflineAudioContext; plan({ vt, inst, ctx, at }) → one Float32Array per channel. */
async function roomRender({ seconds = 4, params = {}, hot = 1 } = {}, plan) {
  const ctx = new OfflineAudioContext(CH, Math.round(SR * seconds), SR);
  const room = await buildRoomAudio(ctx, ROOM, {});
  room.output.connect(ctx.destination);
  const vt = hub({ ...DEF, ...params });
  const inst = await piece({ audio: hot === 1 ? room.audio : heat(room.audio, ctx, hot), vt, params: vt.params });
  const steps = [];
  if (plan) await plan({ vt, inst, ctx, at: (t, fn) => steps.push({ t, fn }) });
  schedule(ctx, steps);
  const buf = await ctx.startRendering();
  await inst.stop(0);
  return { ch: Array.from({ length: CH }, (_, c) => buf.getChannelData(c)), vt, inst };
}
const peakOf = (chs) => chs.reduce((m, d) => { for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } return m; }, 0);
const rmsAll = (chs, t0, t1) => chs.map((d) => T.rms(d, SR, t0, t1));
`;

test('room sound: a touch on P2 sounds only on P2\'s channels (XR Lab map, real graph, real piece); one on P4 only on P4\'s', opt, async () => {
  const r = await inAudioPage(`
    const touch = (wallId) => roomRender({ seconds: 3.5, params: { padVolume: 0 } }, ({ vt, at }) => {
      at(0.5, () => vt.emit('touch', { type: 'down', stroke: 1, wallId, u: 0.5, v: 0.5, size: 0.1 }));
      at(2.0, () => vt.emit('touch', { type: 'up', stroke: 1, wallId, u: 0.5, v: 0.5, size: 0.1 }));
    }).then((x) => rmsAll(x.ch, 0.6, 3.4));
    return { p2: await touch('P2'), p4: await touch('P4'), chP2: chOf('P2'), chP4: chOf('P4'), sub: SUB };`);
  for (const [name, rms, own] of [['P2', r.p2, r.chP2], ['P4', r.p4, r.chP4]]) {
    const mine = Math.max(...own.map((c) => rms[c]));
    assert.ok(mine > 2e-3, `${name}'s channel ${own.map((c) => c + 1)} carries the note (rms ${mine})`);
    rms.forEach((v, c) => {
      if (own.includes(c) || c === r.sub) return;
      assert.ok(v < mine * 0.003, `${name}: channel ${c + 1} (another wall) stays silent: ${v} vs ${mine} (below −50 dB)`);
    });
    if (r.sub >= 0) assert.ok(rms[r.sub] < mine * 0.1, `${name}: the sub only gets the note's low end (${rms[r.sub]})`);
  }
});

test('room sound: 20 hands at once with every volume up stay below the ceiling — and so does a piece 10x too loud (the host\'s limiter)', opt, async () => {
  const r = await inAudioPage(`
    const loud = { padVolume: 100, notesVolume: 100, reverbMix: 100, attack: 0.02, maxNotes: 24, maxPerWall: 6 };
    const twenty = (emit) => { for (let k = 0; k < 20; k++) {
      const wallId = WALLS[k % WALLS.length].id, e = { stroke: k + 1, wallId, u: (k % 5) / 4, v: ((k * 7) % 20) / 19, size: 0.1 };
      emit(0.5, { type: 'down', ...e }); emit(2.6, { type: 'up', ...e });
    } };
    const inRoom = (hot) => roomRender({ seconds: 3.2, params: loud, hot }, ({ vt, at, inst }) => twenty((t, e) => at(t, () => vt.emit('touch', e))));
    const plain = await inRoom(1), hot = await inRoom(10);
    // the same hot piece with NO limiter (the fake host's plain sums): what the limiter had to hold
    const fake = await T.fakeHost({ seconds: 3.2, wallIds: WALLS.map((w) => w.id), speakers: 1, sub: true, overrides: loud });
    const inst = await piece({ ...fake, audio: heat(fake.audio, fake.ctx, 10) });
    twenty((t, e) => fake.touch(t, e.type, e));
    const raw = await fake.render(); await inst.stop(0);
    return { plain: peakOf(plain.ch), hot: peakOf(hot.ch), unlimited: peakOf(raw), notes: rmsAll(plain.ch, 1, 2.5), used: USED, ceiling: 10 ** (ROOM.ceilingDb / 20) };`);
  assert.ok(r.unlimited > 1.2, `without a limiter the hot piece goes far over full scale (${r.unlimited}) — so the check below means something`);
  for (const k of ['plain', 'hot']) {
    assert.ok(r[k] < 1, `${k}: the peak stays below 0 dBFS (${r[k]})`);
    assert.ok(r[k] <= r.ceiling + 1e-4, `${k}: and below the profile's ceiling (${r[k]} ≤ ${r.ceiling})`);
  }
  r.used.forEach((c) => assert.ok(r.notes[c] > 1e-3, `every channel of the map plays (${c + 1}: ${r.notes})`));
});

test('room sound: a pass the tracker splits into 3 ids is ONE note — the runtime stitches it, the piece plays it once', opt, async () => {
  const r = await inAudioPage(`
    // readings of one hand sliding along P2 (4 m wide, 2.5 m tall) every 100 ms; the tracker loses it twice and gives it a new id
    const W = 4, H = 2.5, PXM = 100;
    const reads = [];
    [['a', 0.30, 1.0], ['a', 0.40, 1.1], ['a', 0.50, 1.2], ['a', 0.60, 1.3], [null, 0.70],
     ['b', 0.80, 1.5], ['b', 0.90, 1.6], ['b', 1.00, 1.7], [null, 1.10],
     ['c', 1.20, 1.9], ['c', 1.30, 2.0], ['c', 1.40, 2.1]].forEach(([id, t, xm]) => reads.push({ id, t, xm }));
    const reading = (id, xm, eng) => ({ id, wallId: 'P2', size: 0.1, pxPerM: PXM, t: eng, x: xm * PXM, y: (H - 1.4) * PXM, u: xm / W, v: 1.4 / H });
    const drive = (plan) => async ({ vt, inst, ctx, at }) => {
      const voices = [];
      plan({ vt, at, voices });
      for (let t = 0.025; t < 3.9; t += 0.025) at(t, () => voices.push(inst._debug.counts().total));
      return voices;
    };
    let voicesStitched = [], voicesRaw = [];
    // 1) through the runtime's hands in sound mode (what the app does): page clock = engine clock + 1 s
    const stitched = await roomRender({ seconds: 4, params: { padVolume: 0 } }, async (o) => {
      let now = 0;
      const hands = makeHands(o.vt, { sound: true, now: () => now });
      const clock = () => { now = 1000 + o.ctx.currentTime * 1000; return now - 1000; };
      for (const rd of reads) o.at(rd.t, () => { const eng = clock(); hands.ingest(rd.id ? [reading(rd.id, rd.xm, eng)] : [], eng); });
      for (let t = 1.5; t < 3.9; t += 0.1) o.at(t, () => { const eng = clock(); hands.ingest([], eng); }); // the hand has gone
      for (let t = 0.025; t < 3.9; t += 0.025) o.at(t + 0.001, () => { clock(); hands.tick(); });
      voicesStitched = await drive(() => {})(o);
    });
    // 2) the same readings straight to the piece, the tracker's id as the stroke (no runtime): three notes
    const raw = await roomRender({ seconds: 4, params: { padVolume: 0 } }, async (o) => {
      const seen = new Set(), last = {};
      for (const rd of reads) o.at(rd.t, () => {
        for (const id of Object.keys(last)) if (id !== rd.id) { o.vt.emit('touch', { type: 'up', stroke: id, wallId: 'P2', u: last[id] / W, v: 1.4 / H, size: 0.1 }); delete last[id]; }
        if (!rd.id) return;
        o.vt.emit('touch', { type: seen.has(rd.id) ? 'move' : 'down', stroke: rd.id, wallId: 'P2', u: rd.xm / W, v: 1.4 / H, size: 0.1 });
        seen.add(rd.id); last[rd.id] = rd.xm;
      });
      o.at(1.5, () => { for (const id of Object.keys(last)) o.vt.emit('touch', { type: 'up', stroke: id, wallId: 'P2', u: last[id] / W, v: 1.4 / H, size: 0.1 }); });
      voicesRaw = await drive(() => {})(o);
    });
    const p2 = chOf('P2')[0];
    return {
      log: stitched.vt.log, rawLog: raw.vt.log,
      maxVoices: Math.max(...voicesStitched), maxRaw: Math.max(...voicesRaw), heldAt: voicesStitched[Math.round(1.3 / 0.025) - 1],
      during: T.rms(stitched.ch[p2], SR, 0.9, 1.4), tail: T.rms(stitched.ch[p2], SR, 3.5, 3.9),
    };`);
  const count = (log, t) => log.filter((x) => x === t).length;
  assert.equal(count(r.log, 'down'), 1, `one down for the whole pass (${r.log.join(' ')})`);
  assert.equal(count(r.log, 'up'), 1, 'one up, once the stitch window has passed');
  assert.equal(r.maxVoices, 1, 'never more than one voice for the pass');
  assert.equal(r.heldAt, 1, 'still one note in the middle of the third id');
  assert.ok(r.during > 2e-3 && r.tail < r.during, `the note sounds through the splits and fades after the up (${r.during} → ${r.tail})`);
  // the control: without the runtime's stitching the same pass would be three notes
  assert.equal(count(r.rawLog, 'down'), 3);
  assert.ok(r.maxRaw >= 2, `tracker ids as strokes overlap into several voices (${r.maxRaw})`);
});

test('room sound: on XR Lab\'s walls (3.5 m tall, from the profile) a hand at 2.1 m plays the TOP note and one at 0.3 m the lowest', opt, async () => {
  const r = await inAudioPage(`
    const { scaleLadder } = await import('/experiences/ambient-notes/theory.js');
    const p2 = WALLS.find((w) => w.id === 'P2');
    let notes = null;
    await roomRender({ seconds: 1, params: { padVolume: 0, key: 'D', scale: 'minor-pentatonic', lowOctave: 3, octaves: 4 } }, ({ vt, inst, at }) => {
      at(0.1, () => vt.emit('touch', { type: 'down', stroke: 1, wallId: 'P2', u: 0.5, v: 2.1 / p2.height, size: 0.1 }));
      at(0.1, () => vt.emit('touch', { type: 'down', stroke: 2, wallId: 'P4', u: 0.5, v: 0.3 / WALLS.find((w) => w.id === 'P4').height, size: 0.1 }));
      at(0.3, () => { notes = [inst._debug.midiOf(1), inst._debug.midiOf(2)]; });
    });
    const ladder = scaleLadder('D', 'minor-pentatonic', 3, 4);
    return { height: p2.height, notes, top: ladder[ladder.length - 1], bottom: ladder[0] };`);
  assert.equal(r.height, 3.5, 'the wall\'s height comes from the profile');
  assert.deepEqual(r.notes, [r.top, r.bottom], `2.1 m → the top note, 0.3 m → the lowest (${r.notes} vs ${r.top}, ${r.bottom})`);
});
