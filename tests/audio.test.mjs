// Room audio, the parts that need no audio device: the ring buffer between contexts, the device layout, the spreading maths,
// the limiter, the sound mode of the runtime's hands, and the engine (profile, commands, Show mode, catalog, server headers).
// The routing graph itself (WebAudio) is checked in tests/audio-ui.test.mjs, in Electron's renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile, normAudio } from '../engine/profile.js';
import { createRing, RingWriter, RingReader, layoutDevices, matchDevice, speakerGains, foldMatrix, Limiter, dbToLin } from '../ui/js/audio-core.js';
import { makeHands } from '../experiences/runtime.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------------------------- ring buffer

/** The value of logical channel c at frame i: every sample says where it came from. */
const sig = (c, i) => c * 1000 + (i % 900);

test('ring: frames written for 3 devices come out in order on each device\'s channels, across the wrap-around', () => {
  const devs = [{ first: 0, count: 2 }, { first: 2, count: 2 }, { first: 4, count: 4 }]; // 8 logical channels over 3 devices
  const rings = devs.map((d) => createRing(d.count, 1024));
  const writers = rings.map((r) => new RingWriter(r.sab));
  const readers = rings.map((r) => new RingReader(r.sab, { target: 256, dead: 100 }));
  const B = 64, got = devs.map((d) => Array.from({ length: d.count }, () => []));
  let written = 0;
  const feed = () => {
    const block = Array.from({ length: 8 }, (_, c) => Float32Array.from({ length: B }, (_, i) => sig(c, written + i)));
    devs.forEach((d, k) => writers[k].write(block.slice(d.first, d.first + d.count), B));
    written += B;
  };
  for (let k = 0; k < 4; k++) feed(); // the target: the readers start
  for (let step = 0; step < 60; step++) { // 3840 frames: the 1024-frame ring wraps several times
    devs.forEach((d, k) => {
      const out = Array.from({ length: d.count }, () => new Float32Array(B));
      assert.equal(readers[k].read(out, B), 'play');
      out.forEach((o, c) => got[k][c].push(...o));
    });
    feed();
  }
  devs.forEach((d, k) => d.count && got[k].forEach((frames, c) => {
    assert.equal(frames.length, 60 * B);
    for (let i = 0; i < frames.length; i++) if (frames[i] !== sig(d.first + c, i)) assert.fail(`device ${k} channel ${c} frame ${i}: ${frames[i]} instead of ${sig(d.first + c, i)}`);
  }));
});

test('ring: before the target it is silent, and an underrun gives silence — never stale frames', () => {
  const r = createRing(1, 1024), w = new RingWriter(r.sab), rd = new RingReader(r.sab, { target: 256, dead: 100 });
  const out = [new Float32Array(64)];
  w.write([Float32Array.from({ length: 128 }, () => 0.7)], 128);
  assert.equal(rd.read(out, 64), 'prime');
  assert.ok(out[0].every((v) => v === 0), 'priming: silence');
  w.write([Float32Array.from({ length: 128 }, () => 0.7)], 128);
  assert.equal(rd.read(out, 64), 'play');
  assert.ok(out[0].every((v) => v === Math.fround(0.7)));
  // the writer stops: the reader drains what there is, and then every block is exactly zero (and it primes again)
  const states = [];
  for (let i = 0; i < 12; i++) { out[0].fill(9); states.push(rd.read(out, 64)); if (states.at(-1) !== 'play') assert.ok(out[0].every((v) => v === 0), `block ${i} (${states.at(-1)}) is silence`); }
  assert.ok(states.includes('underrun') && states.at(-1) === 'prime');
  assert.ok(rd.underruns >= 1);
  // it picks up again once the target is queued: only frames that were written
  w.write([Float32Array.from({ length: 300 }, () => 0.25)], 300);
  let plays = 0;
  for (let i = 0; i < 4; i++) { rd.read(out, 64); if (out[0].some((v) => v !== 0)) { plays++; assert.ok(out[0].every((v) => v >= 0 && v <= 0.7 + 1e-6), 'only what was written (or the step between two written values)'); } }
  assert.ok(plays >= 1);
  for (let i = 0; i < 20 && rd.frac !== 0; i++) { w.write([Float32Array.from({ length: 64 }, () => 0.25)], 64); rd.read(out, 64); }
  assert.equal(rd.frac, 0, 'a fraction left from steering is given back within a few blocks (otherwise it would stay a half-sample delay: a low-pass)');
  w.write([Float32Array.from({ length: 64 }, () => 0.25)], 64);
  rd.read(out, 64);
  assert.ok(out[0].every((v) => v === 0.25), 'and then exactly the written frames: plain copies');
});

for (const [name, eps] of [['faster', 0.001], ['slower', -0.001]]) {
  test(`ring: the writer's clock running ${name} than the reader's (0.1 %) never runs dry or overflows — it steers, with no jump`, () => {
    const r = createRing(1, 16384), w = new RingWriter(r.sab), rd = new RingReader(r.sab, { target: 1280 });
    const B = 128, out = [new Float32Array(B)];
    let acc = 0, n = 0, minSpan = 1e9, maxSpan = 0, minFill = 1e9, maxFill = 0, plays = 0;
    const put = (m) => { w.write([Float32Array.from({ length: m }, (_, i) => n + i)], m); n += m; }; // a ramp: sample value = frame number
    put(1280);
    for (let t = 0; t < 4000; t++) { // 4000 blocks: 10 s of drift at 0.1 % = 480 frames
      acc += B * (1 + eps);
      const m = Math.floor(acc); acc -= m; put(m);
      const st = rd.read(out, B);
      if (st !== 'play') continue;
      plays++;
      minFill = Math.min(minFill, w.fill); maxFill = Math.max(maxFill, w.fill);
      for (let i = 0; i + 64 < B; i += 16) { const span = out[0][i + 64] - out[0][i]; minSpan = Math.min(minSpan, span); maxSpan = Math.max(maxSpan, span); }
    }
    assert.equal(plays, 4000, 'played every block');
    assert.equal(rd.underruns, 0);
    assert.ok(minFill > 600 && maxFill < 2600, `queue stays near the target (${minFill}..${maxFill})`);
    assert.ok(minSpan > 63.5 && maxSpan < 64.5, `the ramp advances 1 frame per frame (± 0.2 %) — no gap, no skip (64 frames span ${minSpan}..${maxSpan})`);
  });
}

// ---------------------------------------------------------------------------------------------- devices

const DEVICES = [
  { deviceId: 'default', label: 'Default - Speakers (Realtek)', channels: 2 },
  { deviceId: 'speakers', label: 'Speakers (Realtek)', channels: 2 },
  { deviceId: 'd11', label: 'DVS Transmit 11-12 (Dante Virtual Soundcard (x64))', channels: 2 },
  { deviceId: 'd12', label: 'DVS Transmit 1-2 (Dante Virtual Soundcard (x64))', channels: 2 },
  { deviceId: 'd34', label: 'DVS Transmit 3-4 (Dante Virtual Soundcard (x64))', channels: 2 },
  { deviceId: 'd56', label: 'DVS Transmit 5-6 (Dante Virtual Soundcard (x64))', channels: 2 },
  { deviceId: 'multi', label: 'Interface 8 outputs', channels: 8 },
];

test('devices: labels map to logical channels in order — pairs, a mix of channel counts, a missing device keeps its slot', () => {
  const L = layoutDevices(['DVS Transmit 1-2', 'DVS Transmit 3-4', 'DVS Transmit 5-6'], DEVICES);
  assert.equal(L.fold, false);
  assert.deepEqual(L.sinks.map((s) => [s.deviceId, s.first, s.count]), [['d12', 0, 2], ['d34', 2, 2], ['d56', 4, 2]]);
  assert.equal(L.total, 6);
  const M = layoutDevices(['DVS Transmit 1-2', 'Interface 8 outputs', 'DVS Transmit 5-6'], DEVICES);
  assert.deepEqual(M.sinks.map((s) => [s.deviceId, s.first, s.count]), [['d12', 0, 2], ['multi', 2, 8], ['d56', 10, 2]], 'each device takes as many channels as it has');
  const G = layoutDevices(['DVS Transmit 1-2', 'DVS Transmit 9-10', 'DVS Transmit 5-6'], DEVICES);
  assert.deepEqual(G.sinks.map((s) => [s.missing, s.first, s.count]), [[false, 0, 2], [true, 2, 2], [false, 4, 2]], 'a device that is not there holds its pair, so the others keep their channels');
  assert.equal(G.total, 6);
  assert.equal(G.sinks[1].deviceId, null);
  // exact before prefix before substring; "1-2" is not "11-12"; the default entry is never a match; a device is used once
  assert.equal(matchDevice('DVS Transmit 1-2', DEVICES).deviceId, 'd12');
  assert.equal(matchDevice('dvs transmit 11-12', DEVICES).deviceId, 'd11');
  assert.equal(matchDevice('Speakers (Realtek)', DEVICES).deviceId, 'speakers', 'the real device, not the "Default - " entry');
  const twice = layoutDevices(['DVS Transmit 1-2', 'DVS Transmit 1-2'], DEVICES);
  assert.deepEqual(twice.sinks.map((s) => s.missing), [false, true], 'the same pair cannot be used for two outputs');
});

test('devices: the real DVS names at XR Lab (16×16, a DOUBLE space before the pair, Windows defaulting to 15-16) map 1-2 / 3-4 / 5-6 in order', () => {
  const pairs = ['1-2', '3-4', '5-6', '7-8', '9-10', '11-12', '13-14', '15-16'];
  const found = [
    { deviceId: 'default', label: 'Default - DVS Transmit 15-16 (Dante Virtual Soundcard)', channels: 2 },
    ...pairs.map((p, k) => ({ deviceId: `dvs${k}`, label: `DVS Transmit ${parseInt(p, 10) < 10 ? ' ' : ''}${p} (Dante Virtual Soundcard)`, channels: 2 })),
    { deviceId: 'spk', label: 'Speakers (Realtek(R) Audio)', channels: 2 },
  ];
  assert.ok(found[1].label.includes('Transmit  1-2'), 'the fixture has the double space the room showed');
  for (const wanted of [
    ['DVS Transmit  1-2 (Dante Virtual Soundcard)', 'DVS Transmit  3-4 (Dante Virtual Soundcard)', 'DVS Transmit  5-6 (Dante Virtual Soundcard)'], // as picked in the card
    ['DVS Transmit 1-2', 'DVS Transmit 3-4', 'DVS Transmit 5-6'],                                                                         // as typed with one space
  ]) {
    const L = layoutDevices(wanted, found);
    assert.equal(L.fold, false);
    assert.deepEqual(L.sinks.map((s) => [s.deviceId, s.first, s.count, s.missing]), [['dvs0', 0, 2, false], ['dvs1', 2, 2, false], ['dvs2', 4, 2, false]], `${wanted[0]}: the pairs in order, never the default (15-16)`);
  }
  assert.equal(matchDevice('DVS Transmit 1-2', found).deviceId, 'dvs0', '"1-2" is not "11-12"');
  assert.equal(matchDevice('DVS Transmit 11-12', found).deviceId, 'dvs5');
});

test('devices: no device chosen → the default device in stereo, folded', () => {
  for (const none of [[], undefined, ['', '  ']]) {
    const L = layoutDevices(none, DEVICES);
    assert.equal(L.fold, true);
    assert.deepEqual(L.sinks.map((s) => [s.deviceId, s.first, s.count]), [['', 0, 2]]);
  }
});

// ---------------------------------------------------------------------------------------------- spreading and folding

test('speakers: equal-power spread over a wall\'s speakers by u (left end seen from inside = 0)', () => {
  const near = (a, b, t = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < t);
  assert.deepEqual(speakerGains(1, 0.2), [1]);
  assert.ok(near(speakerGains(2, 0), [1, 0]) && near(speakerGains(2, 1), [0, 1]));
  assert.ok(near(speakerGains(2, 0.5), [Math.SQRT1_2, Math.SQRT1_2]));
  assert.ok(near(speakerGains(3, 0.5), [0, 1, 0]) && near(speakerGains(3, 0.25), [Math.SQRT1_2, Math.SQRT1_2, 0]));
  for (const n of [2, 3, 5]) for (let u = 0; u <= 1; u += 0.07) assert.ok(Math.abs(speakerGains(n, u).reduce((a, g) => a + g * g, 0) - 1) < 1e-9, `constant power (n=${n}, u=${u})`);
  assert.ok(near(speakerGains(2, -5), [1, 0]) && near(speakerGains(2, NaN), [Math.SQRT1_2, Math.SQRT1_2]), 'out of range / not a number are safe');
});

test('fold: the speaker channels pan from left to right in order, the sub goes to both ears', () => {
  const m = foldMatrix(5, 4);
  assert.deepEqual(m[0].map((v) => Math.round(v * 1000)), [1000, 0], 'first speaker hard left');
  assert.deepEqual(m[3].map((v) => Math.round(v * 1000)), [0, 1000], 'last speaker hard right');
  assert.ok(m[1][0] > m[1][1] && m[2][0] < m[2][1], 'in between, in order');
  assert.ok(Math.abs(m[4][0] - Math.SQRT1_2) < 1e-9 && m[4][0] === m[4][1], 'sub in the middle');
  assert.deepEqual(foldMatrix(1).map((r) => r.map((v) => +v.toFixed(3))), [[0.707, 0.707]], 'one speaker alone sits in the middle');
});

// ---------------------------------------------------------------------------------------------- limiter

const sine = (hz, amp, n, phase = 0) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / 48000 + phase));

test('limiter: 20 loud sources at once come out below the ceiling; quiet material passes unchanged (just later)', () => {
  const N = 48000, lim = new Limiter({ channels: 2, ceilingDb: -2 });
  const sum = new Float32Array(N);
  for (let k = 0; k < 20; k++) { const s = sine(110 * (k + 1) + 3 * k, 0.8, N, k); for (let i = 0; i < N; i++) sum[i] += s[i]; }
  const raw = sum.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(raw > 4, `the raw sum is far over full scale (${raw.toFixed(1)})`);
  const out = [new Float32Array(N), new Float32Array(N)];
  lim.process([sum, sum], out, N);
  const ceiling = dbToLin(-2), peak = Math.max(...out.map((o) => o.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  assert.ok(peak <= ceiling + 1e-6, `peak ${peak} <= ${ceiling}`);
  assert.ok(peak > ceiling * 0.9, 'and it is not just muted: it holds the level near the ceiling');
  // quiet: transparent
  const q = new Limiter({ channels: 1, ceilingDb: -2 }), x = sine(440, 0.3, 4800), y = new Float32Array(4800);
  q.process([x], [y], 4800);
  const d = q.W - 1;
  for (let i = d; i < 4800; i++) if (Math.abs(y[i] - x[i - d]) > 1e-6) assert.fail(`quiet sample ${i} changed`);
  const t = new Limiter({ channels: 1 }), bad = Float32Array.from([NaN, Infinity, -Infinity, 0.5]), o = new Float32Array(4);
  t.process([bad], [o], 4);
  assert.ok(o.every(Number.isFinite), 'NaN and infinities never come out');
});

test('limiter: the ceiling never goes above −1 dBFS, and a sudden full-scale hit is held below it from its first sample', () => {
  const lim = new Limiter({ channels: 1, ceilingDb: 6 });
  assert.ok(lim.ceiling <= dbToLin(-1) + 1e-12);
  const x = new Float32Array(2000); x.fill(0.001); for (let i = 1000; i < 1200; i++) x[i] = 1;
  const y = new Float32Array(2000);
  lim.process([x], [y], 2000);
  assert.ok(y.every((v) => Math.abs(v) <= dbToLin(-1) + 1e-9));
});

// ---------------------------------------------------------------------------------------------- the runtime's hands in sound mode

const PXM = 100;
/** Hands in sound mode with a fake page clock running 1000 ms ahead of the engine's: `feed` is a live message of "now", `run` advances time. */
function soundRig({ closed = false } = {}) {
  const events = [], vt = { size: { width: 4000, height: 500 }, closedLoop: closed, emit: (n, e) => events.push(e) };
  let now = 5000;
  const hands = makeHands(vt, { sound: true, now: () => now });
  const eng = () => now - 1000;
  return {
    events, hands, eng,
    /** readings of the hands at x metres (and height) that were taken just now: [id, xm, ym?] */
    feed(...reads) {
      hands.ingest(reads.map(([id, xm, ym = 1.5]) => ({ id, wallId: 'W', size: 0.1, pxPerM: PXM, t: eng(), x: xm * PXM, y: (3 - ym) * PXM, u: xm / 5, v: ym / 3 })), eng());
    },
    run(ms) { for (let end = now + ms; now < end;) { now += 1000 / 60; hands.tick(); } },
  };
}
const close = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('sound hands: a hand that lands is a down at once (no playback delay), with its wall, u, v and size', () => {
  const R = soundRig();
  R.feed([1, 2.5, 1.2]);
  assert.equal(R.events.length, 1, 'the down is there before any frame has run');
  const e = R.events[0];
  assert.deepEqual([e.type, e.wallId, e.size, close(e.u, 0.5), close(e.v, 0.4), Object.keys(e).sort().join()], ['down', 'W', 0.1, true, true, 'size,stroke,type,u,v,wallId'], 'the contract\'s shape and nothing else');
  const hs = R.hands.hands();
  assert.equal(hs.length, 1);
  assert.deepEqual(Object.keys(hs[0]).sort(), ['size', 'stroke', 'u', 'v', 'wallId']);
  // a visual-mode hand is NOT there yet at this moment: it waits HAND_DELAY_MS behind the reading
  const events = [], vt = { size: { width: 4000, height: 500 }, closedLoop: false, emit: (n, ev) => events.push(ev) };
  const visual = makeHands(vt, { now: () => 5000 });
  visual.ingest([{ id: 1, wallId: 'W', size: 8, pxPerM: PXM, t: 4000, x: 250, y: 150 }], 4000);
  assert.equal(events.length, 0, 'the visual playback is late by design');
});

test('sound hands: u and v follow the newest reading at once (no curve behind it)', () => {
  const R = soundRig();
  R.feed([1, 1, 1]); R.run(100);
  R.feed([1, 2, 2]);
  const h = R.hands.hands()[0];
  assert.ok(close(h.u, 0.4) && close(h.v, 2 / 3), `at the newest reading (${h.u}, ${h.v})`);
  assert.ok(R.events.some((e) => e.type === 'move' && close(e.u, 0.4)));
});

test('sound hands: 3 ids in quick succession near each other are ONE stroke — one down, one up, after the stitch window', () => {
  const R = soundRig();
  R.feed([1, 1.0]); R.run(100);
  R.feed([1, 1.1]); R.run(50);
  R.feed(); R.run(50);                 // the tracker lost it …
  R.feed([2, 1.2]); R.run(100);        // … and gave the hand a new id 150 ms and 0.1 m later
  R.feed(); R.run(50);
  R.feed([3, 1.3]); R.run(100);        // … and again
  R.feed();
  assert.equal(R.events.filter((e) => e.type === 'down').length, 1);
  assert.equal(R.events.filter((e) => e.type === 'up').length, 0, 'no up while the stitch window is open');
  assert.equal(new Set(R.events.map((e) => e.stroke)).size, 1, 'one stroke id throughout');
  assert.equal(R.hands.hands().length, 1, 'still down');
  for (let k = 0; k < 10; k++) { R.run(50); R.feed(); }
  const ups = R.events.filter((e) => e.type === 'up');
  assert.equal(ups.length, 1, 'one up once the window has passed');
  assert.equal(R.hands.hands().length, 0);
  assert.ok(close(ups[0].u, 1.3 / 5), 'where the last reading was');
});

test('sound hands: a hand farther than 0.3 m is another stroke; two hands side by side are two', () => {
  const R = soundRig();
  R.feed([1, 1.0]); R.run(100); R.feed(); R.run(60);
  R.feed([2, 2.0]); // a metre away
  assert.equal(R.events.filter((e) => e.type === 'down').length, 2);
  const two = soundRig();
  two.feed([1, 1.0], [2, 3.0]);
  assert.equal(two.hands.hands().length, 2);
});

// ---------------------------------------------------------------------------------------------- profile

test('audio profile: defaults, migration of a profile saved before audio, clamping', () => {
  const walls = [{ id: 'A', width: 4, height: 3 }, { id: 'B', width: 4, height: 3 }, { id: 'C', width: 4, height: 3 }];
  const old = normalizeProfile({ name: 'old room', walls }); // no audio block at all
  assert.equal(old.audio.on, false, 'audio is off in a room that never had it');
  assert.deepEqual(old.audio.devices, []);
  assert.equal(old.audio.channels, 3);
  assert.deepEqual(old.audio.map, { A: [1], B: [2], C: [3] }, 'the walls take channels 1, 2, … in profile order');
  assert.deepEqual(old.audio.sub, { channel: null, crossoverHz: 90 });
  assert.deepEqual(old.audio.sound, { id: null, autostart: false, params: {} });
  const w = normalizeProfile({ name: 'x', walls: [walls[0]], audio: {
    on: true, devices: ['  DVS 1-2 ', '', 5, 'DVS 3-4'], channels: 99, ceilingDb: 3, master: 7, wallHighpassHz: -4,
    map: { A: [1, 1, 3, 40, 'x', 2], ZZ: [1], B: [1] }, sub: { channel: 2, crossoverHz: 5 }, sound: { id: 'bad id!', autostart: 1, params: { 'p-1': { a: 1, b: 'x', c: {}, 'bad key': 2 } } } } });
  const a = w.audio;
  assert.deepEqual(a.devices, ['DVS 1-2', 'DVS 3-4']);
  assert.equal(a.channels, 32);
  assert.equal(a.ceilingDb, -1, 'the ceiling cannot go above −1 dBFS');
  assert.equal(a.master, 1); assert.equal(a.wallHighpassHz, 0);
  assert.deepEqual(a.map, { A: [1, 3] }, 'a wall of the room only, channels 1..N, no repeats, the sub\'s channel is not a wall\'s');
  assert.equal(a.sub.crossoverHz, 40);
  assert.equal(a.sound.id, null); assert.equal(a.sound.autostart, false);
  assert.deepEqual(a.sound.params, { 'p-1': { a: 1, b: 'x' } });
  assert.deepEqual(normAudio(normalizeProfile({ name: 'y', walls }).audio, normalizeProfile({ walls }).walls), normalizeProfile({ name: 'y', walls }).audio, 'normalising twice changes nothing');
  assert.deepEqual(normAudio({ channels: 3, map: {} }, normalizeProfile({ walls }).walls).map, {}, 'an explicit empty map means no wall has a speaker');
});

test('audio profile: XR Lab has the map found in the room as data (Q-SYS feeds: P4 → 1, P1 → 3, P2 and P3 share 2, no sub, no high-pass); the simulated room has audio off', () => {
  const load = (f) => normalizeProfile(JSON.parse(fs.readFileSync(path.join(root, 'profiles', f), 'utf8')));
  const xr = load('xrlab.json'), sim = load('xrlab-sim.json');
  assert.deepEqual(xr.walls.map((w) => w.id), ['P4', 'P1', 'P2', 'P3']);
  assert.deepEqual(xr.audio.map, { P4: [1], P1: [3], P2: [2], P3: [2] }, 'two walls on one channel is kept, not deduplicated');
  assert.deepEqual(xr.audio.sub, { channel: null, crossoverHz: 90 }, 'the room has no sub');
  assert.equal(xr.audio.wallHighpassHz, 0);
  assert.deepEqual(xr.audio.devices, ['DVS Transmit  1-2 (Dante Virtual Soundcard)', 'DVS Transmit  3-4 (Dante Virtual Soundcard)', 'DVS Transmit  5-6 (Dante Virtual Soundcard)'], 'the DVS pairs by their exact names (double space)');
  assert.equal(xr.audio.channels, 6);
  assert.equal(xr.audio.master, 0.3, 'the level tested in the room');
  assert.deepEqual([xr.audio.on, xr.audio.sound.id, xr.audio.sound.autostart], [true, 'ambient-notes', true], 'Ambient notes starts with the app, with Alma liquid');
  assert.equal(sim.audio.on, false);
});

// ---------------------------------------------------------------------------------------------- engine

function sound(dir, id, extra = {}) {
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify({
    id, name: id, kind: 'sound', description: 'a test piece',
    params: [{ key: 'depth', label: 'Depth', type: 'number', min: 0, max: 10, step: 1, default: 3 }, { key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], default: 'a' }], ...extra }));
}
function visual(dir, id) {
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify({ id, name: id }));
  fs.writeFileSync(path.join(dir, id, 'index.html'), '<!doctype html><title>x</title>');
}
function setup({ audio = null, autostart = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-aud-')), pieces = path.join(dir, 'pieces');
  sound(pieces, 'tone'); visual(pieces, 'canvas');
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const simId = store.listProfiles().find((q) => q.id.endsWith('-sim')).id, prof = store.loadProfile(simId);
  prof.experience = normalizeProfile({}).experience; prof.output = normalizeProfile({}).output;
  prof.audio = normalizeProfile({ walls: prof.walls, audio: { ...prof.audio, ...(audio || {}), sound: { ...prof.audio.sound, ...(autostart ? { id: 'tone', autostart: true } : {}) } } }).audio;
  store.saveProfile(prof);
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: [pieces] });
  const msgs = [];
  engine.on('audioWindow', (m) => msgs.push(m));
  return { dir, engine, msgs, store };
}
const done = async (t) => { await t.engine.stop(); fs.rmSync(t.dir, { recursive: true, force: true }); };

test('audio engine: sound pieces and visual pieces are kept apart in the catalog and the commands', async () => {
  const t = setup(); t.engine.start();
  try {
    const st = t.engine.state();
    assert.ok(st.experiences.some((e) => e.id === 'canvas') && !st.experiences.some((e) => e.id === 'tone'), 'the Experiences list has no sound piece');
    assert.deepEqual(st.sounds.filter((e) => e.id === 'tone').map((e) => [e.id, e.kind, e.entry]), [['tone', 'sound', 'sound.js']], 'a sound piece\'s entry is sound.js by default');
    assert.ok(st.sounds.every((e) => e.kind === 'sound') && st.experiences.every((e) => e.kind === 'visual'));
    assert.ok(!st.sounds.some((e) => 'dir' in e));
    await assert.rejects(t.engine.command('experience.play', { id: 'tone' }), /unknown experience/);
    await assert.rejects(t.engine.command('sound.play', { id: 'canvas' }), /unknown sound/);
    assert.equal(t.engine.state().experience.running, false, 'a sound piece never becomes the Experience layer');
  } finally { await done(t); }
});

test('audio engine: audio.set validates, saves in the profile and opens / closes the audio window (nothing sent when nothing changes)', async () => {
  const t = setup(); t.engine.start();
  try {
    const E = t.engine;
    assert.equal(E.state().audio.on, false); assert.equal(E.state().audio.url, null); assert.equal(E.audioWindow(), null);
    await E.command('audio.set', { on: true });
    assert.deepEqual(t.msgs.at(-1), { url: '/audio?run=1' });
    assert.equal(E.state().audio.url, '/audio?run=1');
    const n = t.msgs.length;
    await E.command('audio.set', { master: 0.4 });
    assert.equal(t.msgs.length, n, 'a level does not reopen the window');
    for (const [args, re] of [[{ on: 'yes' }, /on:/], [{ channels: 0 }, /channels/], [{ channels: 99 }, /channels/], [{ master: 2 }, /master/], [{ mute: 1 }, /mute/],
      [{ ceilingDb: 0 }, /ceilingDb/], [{ wallHighpassHz: 900 }, /wallHighpassHz/], [{ devices: 'x' }, /devices/], [{ sub: { crossoverHz: 5 } }, /crossoverHz/], [{ sub: { channel: 0 } }, /sub\.channel/]]) {
      await assert.rejects(E.command('audio.set', args), re, JSON.stringify(args));
    }
    await E.command('audio.set', { devices: ['DVS Transmit 1-2', 'DVS Transmit 3-4'], channels: 4, ceilingDb: -3, wallHighpassHz: 120, sub: { channel: 4, crossoverHz: 100 } });
    const A = E.profile.audio;
    assert.deepEqual(A.devices, ['DVS Transmit 1-2', 'DVS Transmit 3-4']);
    assert.deepEqual([A.channels, A.ceilingDb, A.wallHighpassHz, A.sub], [4, -3, 120, { channel: 4, crossoverHz: 100 }]);
    E._flushExperience();
    assert.deepEqual(t.store.loadProfile(E.profile.id).audio.devices, ['DVS Transmit 1-2', 'DVS Transmit 3-4'], 'on disk');
    await E.command('audio.set', { on: false });
    assert.equal(t.msgs.at(-1), null, 'audio off closes the window');
  } finally { await done(t); }
});

test('audio engine: audio.map checks walls and channels, keeps the sub out of the walls, and mute toggles', async () => {
  const t = setup({ audio: { on: true } }); t.engine.start();
  try {
    const E = t.engine, ids = E.profile.walls.map((w) => w.id);
    await assert.rejects(E.command('audio.map', {}), /map/);
    await assert.rejects(E.command('audio.map', { map: { NOPE: [1] } }), /not a wall/);
    await assert.rejects(E.command('audio.map', { map: { [ids[0]]: [9] } }), /whole numbers from 1 to/);
    await assert.rejects(E.command('audio.map', { map: { [ids[0]]: [1] }, sub: { channel: 99 } }), /sub\.channel/);
    const r = await E.command('audio.map', { map: { [ids[0]]: [1, 2], [ids[1]]: [3] }, channels: 6, sub: { channel: 2 } });
    assert.deepEqual(r.map, { [ids[0]]: [1], [ids[1]]: [3] }, 'channel 2 is the sub: no wall speaker');
    assert.equal(r.channels, 6);
    assert.equal((await E.command('audio.mute', {})).mute, true);
    assert.equal(E.profile.audio.mute, true);
    assert.equal((await E.command('audio.mute', {})).mute, false);
    assert.equal((await E.command('audio.mute', { mute: true })).mute, true);
  } finally { await done(t); }
});

test('audio engine: audio.test asks for ONE channel (the sub included), only while audio is on, and shows in the state', async () => {
  const t = setup(); t.engine.start();
  try {
    const E = t.engine;
    await assert.rejects(E.command('audio.test', { channel: 1 }), /off/);
    await E.command('audio.set', { on: true });
    await assert.rejects(E.command('audio.test', { channel: 0 }), /channel/);
    await assert.rejects(E.command('audio.test', { channel: E.profile.audio.channels + 1 }), /channel/);
    const before = E.state().audio.test;
    await E.command('audio.test', { channel: E.profile.audio.sub.channel || 2 });
    const a = E.state().audio.test;
    assert.equal(a.channel, E.profile.audio.sub.channel || 2);
    await E.command('audio.test', { channel: 1 });
    const b = E.state().audio.test;
    assert.ok(b.seq === a.seq + 1 && b.channel === 1 && !before, 'every request is a new one the window plays once');
  } finally { await done(t); }
});

test('audio engine: sound.play / stop / param / set — a piece plays with audio on, its parameters are checked against its manifest and saved', async () => {
  const t = setup(); t.engine.start();
  try {
    const E = t.engine;
    await assert.rejects(E.command('sound.play', { id: 'nope' }), /unknown sound/);
    await assert.rejects(E.command('sound.param', { key: 'depth', value: 1 }), /no sound selected/);
    await E.command('sound.play', { id: 'tone' });
    assert.equal(E.profile.audio.on, true, 'playing turns audio on');
    assert.deepEqual(t.msgs.at(-1), { url: '/audio?run=1' });
    assert.equal(E.state().audio.sound.running, true);
    assert.equal(E.state().audio.sound.active, false, 'running = asked for; active = the window says it plays');
    await assert.rejects(E.command('sound.param', { key: 'nope', value: 1 }), /no parameter/);
    await assert.rejects(E.command('sound.param', { key: 'mode', value: 'z' }), /one of/);
    assert.equal((await E.command('sound.param', { key: 'depth', value: 99 })).value, 10, 'clamped into the range');
    await E.command('sound.param', { key: 'mode', value: 'b' });
    assert.deepEqual(E.profile.audio.sound.params.tone, { depth: 10, mode: 'b' });
    await E.command('sound.set', { autostart: true });
    assert.equal(E.profile.audio.sound.autostart, true);
    await E.command('sound.stop');
    assert.equal(E.state().audio.sound.running, false);
    assert.equal(E.profile.audio.on, true, 'stopping the piece leaves the room audio on');
    assert.equal(t.msgs.at(-1)?.url, '/audio?run=1');
    // turning audio off stops the piece too
    await E.command('sound.play', { id: 'tone' });
    await E.command('audio.set', { on: false });
    assert.equal(E.state().audio.sound.running, false);
  } finally { await done(t); }
});

test('audio engine: a piece with "Start with the app" plays when the engine starts — and only then', async () => {
  const t = setup({ audio: { on: true }, autostart: true }); t.engine.start();
  try {
    assert.equal(t.engine.state().audio.sound.running, true);
    await t.engine.command('sound.stop');
    assert.equal(t.engine.state().audio.sound.running, false);
  } finally { await done(t); }
  const u = setup({ audio: { on: true } }); u.engine.start();
  try { assert.equal(u.engine.state().audio.sound.running, false); } finally { await done(u); }
  const v = setup({ audio: { on: false }, autostart: true }); v.engine.start();
  try { assert.equal(v.engine.state().audio.sound.running, false, 'audio off: nothing plays'); } finally { await done(v); }
});

test('audio engine: the audio window\'s report is cleaned up, announced when something changes (not every peak), and expires', async () => {
  const t = setup({ audio: { on: true } }); t.engine.start();
  try {
    const E = t.engine;
    let states = 0;
    E.on('state', () => states++);
    assert.equal(E.state().audio.running, false);
    const rep = { devices: [{ label: 'DVS Transmit 1-2', channels: 2 }, { label: 'Speakers', channels: 2, default: true }], sinks: [{ label: 'DVS Transmit 1-2', first: 0, count: 2 }], logical: 5, available: 2, peakDb: -20.4, isolated: true, sound: { active: true, id: 'tone' } };
    await E.command('audio.report', rep);
    let a = E.state().audio;
    assert.equal(a.running, true);
    assert.deepEqual(a.devices.map((d) => [d.label, d.channels]), [['DVS Transmit 1-2', 2], ['Speakers', 2]], 'the readout of every output device with its channel count');
    assert.equal(a.peakDb, -21, 'peak in 3 dB steps');
    const n = states;
    await E.command('audio.report', { ...rep, peakDb: -19.9 });
    assert.equal(states, n, 'a peak inside the same 3 dB step is not a new state');
    await E.command('audio.report', { ...rep, peakDb: -3 });
    assert.ok(states > n);
    await E.command('audio.report', { ...rep, error: 'x\n'.repeat(400) });
    assert.ok(E.state().audio.error.length <= 300 && !/\n/.test(E.state().audio.error));
    E.aud.at -= 7000; E._audioWatch();
    assert.equal(E.state().audio.running, false, 'a window that stops reporting is not running');
    assert.deepEqual(E.state().audio.devices, []);
    await E.command('audio.set', { on: false });
    assert.deepEqual(await E.command('audio.report', rep), {}, 'a report while audio is off is ignored');
    assert.equal(E.state().audio.running, false);
  } finally { await done(t); }
});

test('audio engine: underruns (short cuts in the sound) are counted per output in the state and every new one goes to the log', async () => {
  const t = setup({ audio: { on: true } });
  const warns = [];
  t.engine.log = { ...quiet, warn: (m) => warns.push(m) };
  t.engine.start();
  try {
    const E = t.engine;
    const sinks = (a, b) => [{ label: 'DVS Transmit  1-2 (Dante Virtual Soundcard)', first: 0, count: 2, state: 'play', underruns: a },
      { label: 'DVS Transmit  3-4 (Dante Virtual Soundcard)', first: 2, count: 2, state: 'play', underruns: b }];
    const rep = (a, b) => ({ devices: [], sinks: sinks(a, b), logical: 4, available: 4, peakDb: -20, isolated: true, sound: { active: true, id: 'tone' } });
    await E.command('audio.report', rep(0, 0));
    assert.deepEqual(warns, [], 'nothing to say while nothing is cut');
    let states = 0; E.on('state', () => states++);
    await E.command('audio.report', rep(0, 3));
    assert.deepEqual(E.state().audio.sinks.map((k) => k.underruns), [0, 3], 'per output, in the state (the card shows it)');
    assert.ok(states >= 1, 'a new underrun is a new state');
    assert.equal(warns.length, 1);
    assert.match(warns[0], /3 underruns on "DVS Transmit {2}3-4 \(Dante Virtual Soundcard\)"/);
    await E.command('audio.report', rep(0, 3));
    assert.equal(warns.length, 1, 'the same count is not logged again');
    await E.command('audio.report', rep(1, 5));
    assert.equal(warns.length, 3);
    assert.match(warns[1], /1 underrun on "DVS Transmit {2}1-2/);
    assert.match(warns[2], /2 underruns on "DVS Transmit {2}3-4.*5 since it opened/);
    await E.command('audio.report', rep(0, 0)); // the outputs were reopened (a new map): their counts start again
    await E.command('audio.report', rep(0, 1));
    assert.equal(warns.length, 4, 'after a reopen a new underrun is logged again');
  } finally { await done(t); }
});

test('audio engine: Show mode locks devices, map, channels and test — not play, stop, parameters, master, mute or the switch', async () => {
  const t = setup({ audio: { on: true } }); t.engine.start();
  try {
    const E = t.engine;
    await E.command('sound.play', { id: 'tone' });
    await E.command('app.lock', { locked: true });
    for (const [op, args, re] of [
      ['audio.set', { devices: ['x'] }, /locked/], ['audio.set', { channels: 3 }, /locked/], ['audio.set', { sub: { channel: 2 } }, /locked/],
      ['audio.set', { wallHighpassHz: 50 }, /locked/], ['audio.set', { ceilingDb: -5 }, /locked/], ['audio.set', { master: 0.2, devices: [] }, /locked/],
      ['audio.map', { map: {} }, /locked/], ['audio.test', { channel: 1 }, /locked/], ['sound.set', { autostart: true }, /locked/]]) {
      await assert.rejects(E.command(op, args), re, `${op} ${JSON.stringify(args)}`);
    }
    await E.command('audio.set', { master: 0.2 }); await E.command('audio.set', { mute: true }); await E.command('audio.mute', { mute: false });
    await E.command('sound.param', { key: 'depth', value: 5 });
    await E.command('sound.stop'); await E.command('sound.play', { id: 'tone' });
    await E.command('audio.set', { on: false }); await E.command('audio.set', { on: true });
    assert.equal(E.profile.audio.master, 0.2);
  } finally { await done(t); }
});

// ---------------------------------------------------------------------------------------------- server

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers })); }).on('error', reject);
  });
}

test('audio server: the audio page is cross-origin isolated (SharedArrayBuffer) and what it loads says it is ours; the SDK is left alone', async () => {
  const t = setup(); t.engine.start();
  const server = await createServer(t.engine, { port: 0, root, log: quiet });
  try {
    const page = await get(server.port, '/audio?run=1');
    assert.equal(page.status, 200);
    assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(page.headers['cross-origin-embedder-policy'], 'require-corp');
    for (const f of ['/js/audio-core.js', '/js/audio-worklets.js', '/js/audio-graph.js', '/js/audio-host.js', '/js/conn.js', '/experiences/runtime.js', '/shared/geometry.js', '/experiences/canvas/index.html']) {
      const r = await get(server.port, f);
      assert.equal(r.status, 200, f);
      assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin', `${f} carries CORP`);
    }
    const other = await get(server.port, '/');
    assert.equal(other.headers['cross-origin-embedder-policy'], undefined, 'the operator UI is not made isolated');
    const sdk = fs.readdirSync(path.join(root, 'sdk')).find((f) => f.endsWith('.js'));
    if (sdk) assert.equal((await get(server.port, `/sdk/${sdk}`)).headers['cross-origin-resource-policy'], undefined, 'the SDK is loaded by other apps from their own origin');
  } finally { server.close(); await done(t); }
});
