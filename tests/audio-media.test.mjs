// The clips' audio in the room (MEDIA-SERVER.md §4c, phase F7). Two halves:
//  - Node: the pure parts — the routing (mediaRouting, with XR Lab's map read from profiles/xrlab.json: the §4c.3 table),
//    the fold of playback into source frames against transport.js › playhead(), the player core (ClipReader: sample 0,
//    drift steering, jumps, 44.1 → 48 kHz), the transitions (clipFade, clipVoices on the REAL transport's state), the
//    ducking decision and the PCM decoder.
//  - Electron (one run of the cross-origin-isolated /audio page, shared by the tests below it): the app's room graph on an
//    OfflineAudioContext with ui/js/audio-media.js › ClipAudio and the real 'vt-media-player' worklet reading its
//    SharedArrayBuffer ring — no device is opened, nothing is played out loud.
// Every test says what breaks it ("Fails if …").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mediaRouting, effectiveRoute, wallAzimuths, streamSegments, clipFade, createClipRing, ClipRingWriter, ClipReader, CLIP_JUMP_MS } from '../ui/js/audio-core.js';
import { decodePcm, clipVoices, clipAudible } from '../ui/js/audio-media.js';
import { roomPlan } from '../engine/core/geometry.js';
import { normalizeProfile } from '../engine/profile.js';
import { Transport, playhead } from '../engine/media/transport.js';
import { normalizeShow, clipSettings } from '../engine/media/show.js';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';

const root = path.resolve(import.meta.dirname, '..');
const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
// (before any test(): a top-level await after the first tests would let --test-force-exit end the run before the rest)
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const XR = normalizeProfile(JSON.parse(fs.readFileSync(path.join(root, 'profiles', 'xrlab.json'), 'utf8')));
const SIM = normalizeProfile(JSON.parse(fs.readFileSync(path.join(root, 'profiles', 'xrlab-sim.json'), 'utf8')));
const r3 = (rows) => rows.map((row) => row.map((v) => Math.round(v * 1000) / 1000));
const routeIn = (P, o) => mediaRouting({
  channels: P.audio.channels, map: P.audio.map, sub: P.audio.sub, walls: P.walls, plan: roomPlan(P.walls, { close: true }),
  front: P.audio.media.front, width: P.audio.media.width, matrix: P.audio.media.matrix, ...o,
});

// ---------------------------------------------------------------------------------------------- routing

test('routing: XR Lab (map from profiles/xrlab.json) gives exactly the §4c.3 table at width 100 % and 0 % — a shared channel takes the max', () => {
  // the map as it is in the room: P4 → 1, P1 → 3, P2 and P3 → 2 (one Q-SYS feed for both), no sub; the front is P1
  assert.deepEqual(XR.audio.map, { P4: [1], P1: [3], P2: [2], P3: [2] });
  assert.equal(XR.audio.sub.channel, null);
  assert.equal(XR.audio.media.front, 'P1');
  const az = wallAzimuths(XR.walls, roomPlan(XR.walls, { close: true }), 'P1');
  const deg = (id) => (az.get(id) * 180) / Math.PI, near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 0.5; // ±180 is the same place
  for (const [id, want] of [['P4', -90], ['P1', 0], ['P2', 90], ['P3', 180]]) assert.ok(near(deg(id), want), `${id} at ${deg(id).toFixed(2)}° (want ${want}°): P4 left, P1 front, P2 right, P3 behind`);
  const full = routeIn(XR, { sources: 2, width: 1 }), mono = routeIn(XR, { sources: 2, width: 0 });
  assert.equal(full.route, 'spread', 'a stereo clip on auto is spread over the room');
  // gains[k][c]: k = L, R; c = logical channels 1..6 (4–6 unused)
  //   ch 1 = P4 (left): L × 1.00 · ch 2 = P2 (right) + P3 (behind): R × 1.00 + L × 0.707 · ch 3 = P1 (front): L, R × 0.707
  // Fails if a shared channel SUMS (ch 2 would get R × 1.707 and L × 0.707 + 0 at 100 %, (L+R) × 1.414 at 0 %).
  assert.deepEqual(r3(full.gains), [[1, 0.707, 0.707, 0, 0, 0], [0, 1, 0.707, 0, 0, 0]]);
  assert.deepEqual(r3(mono.gains), [[0.707, 0.707, 0.707, 0, 0, 0], [0.707, 0.707, 0.707, 0, 0, 0]]);
  // and every speaker of the room plays a stereo clip (what was asked): each wall channel gets something from L or R
  for (const c of [0, 1, 2]) assert.ok(full.gains[0][c] + full.gains[1][c] > 0.9, `channel ${c + 1} sounds`);
});

test('routing: 1 channel → every wall the same; 4 channels in a 4-wall room → one per wall; 5 → the fifth to the sub, or to every wall without one', () => {
  // the simulated XR Lab: P4 → 1, P1 → 2, P2 → 3, P3 → 4, sub on 5
  const one = routeIn(SIM, { sources: 1 });
  assert.equal(one.route, 'mono');
  assert.deepEqual(r3(one.gains), [[1, 1, 1, 1, 0]], 'mono: full on each wall, nothing on the sub channel (the sub gets its low end by the crossover)');
  const four = routeIn(SIM, { sources: 4 });
  assert.equal(four.route, 'walls');
  assert.deepEqual(r3(four.gains), [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0]], 'channel k → wall k in canvas order (P4, P1, P2, P3)');
  const five = routeIn(SIM, { sources: 5 });
  assert.equal(five.route, 'walls');
  assert.deepEqual(r3(five.gains)[4], [0, 0, 0, 0, 1], 'the fifth channel → the sub');
  const noSub = routeIn({ ...SIM, audio: { ...SIM.audio, sub: { channel: null, crossoverHz: 90 } } }, { sources: 5 });
  assert.deepEqual(r3(noSub.gains)[4], [1, 1, 1, 1, 0], 'no sub: the fifth is spread over every wall');
  // a wall with two speakers shares its gain with equal power; walls sharing a channel do not add up (XR Lab, mono)
  const two = mediaRouting({ sources: 1, channels: 3, map: { A: [1, 2], B: [3] }, walls: [{ id: 'A' }, { id: 'B' }] });
  assert.deepEqual(r3(two.gains), [[0.707, 0.707, 1]]);
  assert.deepEqual(r3(routeIn(XR, { sources: 1 }).gains), [[1, 1, 1, 0, 0, 0]], 'P2 + P3 on channel 2: once, not twice');
  // Direct and the matrix, and what auto picks
  assert.deepEqual(r3(routeIn(SIM, { sources: 3, route: 'direct' }).gains), [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0]]);
  assert.deepEqual(r3(routeIn(SIM, { sources: 2, route: 'matrix', matrix: [[0, null, -6], [null, -60]] }).gains), [[1, 0, 0.501, 0, 0], [0, 0.001, 0, 0, 0]]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => effectiveRoute('auto', n, 4)), ['mono', 'spread', 'mono', 'walls', 'walls', 'mono']);
  assert.equal(effectiveRoute('direct', 2, 4), 'direct', 'a route set on the clip / layer / room wins over auto');
});

// ---------------------------------------------------------------------------------------------- the fold (playhead)

test('playback → source frames follows transport.js › playhead() for loop, hold, clear and bounce (in / out, offset)', () => {
  const rate = 48000;
  const base = { startAt: 1000, offset: 0.25, in: 1.5, out: 3.0, fps: 30, frames: 300, loops: 1 };
  for (const end of ['loop', 'hold', 'clear', 'bounce', 'next']) {
    const p = { ...base, end };
    for (const el of [0, 0.4, 1.2, 1.49, 1.51, 2.9, 3.1, 4.4, 7.77]) {
      const k = Math.round(el * rate), E = p.startAt + (el - p.offset) * 1000;
      const ph = playhead(p, E), [s] = streamSegments(p, rate, k, 1);
      if (ph.done && (end === 'hold' || end === 'clear')) { assert.equal(s.src, null, `${end} at ${el} s: silent past the end`); continue; }
      // Fails if the fold differs from playhead() (the loop point, the bounce turn, the in point): the sound would leave the picture
      assert.ok(s.src !== null && Math.abs(s.src - ph.time * rate) <= 1.5, `${end} at ${el} s: frame ${s.src} vs playhead ${ph.time * rate}`);
      if (end === 'bounce') assert.equal(s.dir, ph.dir, `bounce at ${el} s: direction`);
    }
  }
  // a stretch over the loop point is two pieces, the second from the in point
  const segs = streamSegments({ ...base, end: 'loop' }, rate, Math.round(1.4 * rate), 0.2 * rate);
  assert.deepEqual(segs.map((x) => [x.at, x.src]), [[0, 1.5 * rate + 1.4 * rate], [0.1 * rate, 1.5 * rate]]);
});

// ---------------------------------------------------------------------------------------------- the player core

/** A ring fed like the page feeds it (content(k) at playback frame k), and a reader on it. */
function rig({ rate = 48000, startAt = 10100, off = 10000, content = (k) => Math.sin(k / 50) } = {}) {
  const ring = createClipRing(1, 1 << 18), w = new ClipRingWriter(ring.sab);
  const rd = new ClipReader(ring.sab, { rate, sampleRate: 48000, startAt, off });
  w.reset(0);
  const fillTo = (end) => {
    while (w.end < end) {
      const n = Math.min(8192, Math.floor(end - w.end), w.room);
      if (n <= 0) break;
      const k0 = w.end;
      w.write([Float32Array.from({ length: n }, (_, i) => content(k0 + i))], n);
    }
  };
  const out = [new Float32Array(128)];
  return { w, rd, fillTo, out, block(f) { fillTo((rd.pos ?? 0) + rate); rd.process(out, 128, f); return out[0]; } };
}

test('player: sample 0 lands on the output sample the clock gives (48 kHz and 44.1 kHz clips), mid-block', () => {
  for (const rate of [48000, 44100]) {
    // the clock: engine 10000 ms at context frame 0; the clip starts at 10100.4 ms → output sample 4819.2
    const R = rig({ rate, startAt: 10100.4, content: () => 0.5 });
    const want = 0.1004 * 48000;
    let first = null;
    for (let f = 0; f < 48000 && first === null; f += 128) {
      const b = R.block(f);
      const i = b.findIndex((v) => v !== 0);
      if (i >= 0) first = f + i;
    }
    // Fails if the start is rounded to a block (up to 2.7 ms off) or sample 0 is skipped
    assert.ok(Math.abs(first - want) <= 1, `${rate} Hz: first sample at ${first}, the clock says ${want}`);
  }
});

/**
 * Runs a reader for `seconds` with the page's map re-sent every 250 ms from `engAt(frame)` (the engine time at which a frame
 * is heard). → the worst and last error against the TRUE clock, the jumps, and the error over time.
 */
function follow(engAt, seconds, { rate = 48000, startAt = 10100 } = {}) {
  const R = rig({ rate, startAt, off: engAt(0) });
  const errs = [];
  let maxLate = 0;
  for (let f = 0; f < seconds * 48000; f += 128) {
    if (f % 12000 < 128) R.rd.setMap(engAt(f) - (f * 1000) / 48000); // what the page measures: the clock's estimate now
    R.block(f);
    if (R.rd.pos !== null && f % 4800 < 128) {
      const truth = ((engAt(f + 128) - startAt) / 1000) * rate; // pos is now at the end of the block
      const e = ((R.rd.pos - truth) / rate) * 1000;
      errs.push([f / 48000, e]);
      if (f / 48000 > 20) maxLate = Math.max(maxLate, Math.abs(e));
    }
  }
  return { errs, maxLate, last: Math.abs(errs[errs.length - 1][1]), jumps: R.rd.jumps, underruns: R.rd.underruns, speed: R.rd.speed };
}

test('player: a clock 0.1 % fast for 5 minutes — the error stays under 5 ms by steering (no jump); without steering it would drift 300 ms', () => {
  const r = follow((f) => 10000 + ((f * 1000) / 48000) * 1.001, 300);
  if (process.env.VT_VERBOSE) console.log(`drift 0.1 %: worst after 20 s ${r.maxLate.toFixed(3)} ms, last ${r.last.toFixed(3)} ms, speed ${r.speed}`);
  // Fails if the speed correction is off (CLIP_KP = 0 or the clamp at 0): the error grows 1 ms/s and jumps every 80 s
  assert.equal(r.jumps, 0, 'no jump: 0.1 % is within the ±0.3 % steering');
  assert.ok(r.maxLate < 5, `after settling, the error stays under 5 ms over the 5 minutes (worst ${r.maxLate.toFixed(2)} ms)`);
  assert.ok(r.last < 5, `and at the end (${r.last.toFixed(2)} ms)`);
  assert.ok(r.speed > 1.0005 && r.speed <= 1.003, `it plays a hair fast to keep up (${r.speed})`);
  assert.equal(r.underruns, 0, 'the ring never ran dry');
});

test('player: a 40 ms correction of the clock is steered back under 5 ms without a jump; 150 ms is one jump', () => {
  const step = (ms) => (f) => 10000 + (f * 1000) / 48000 + (f >= 5 * 48000 ? ms : 0);
  const glide = follow(step(40), 40);
  assert.equal(glide.jumps, 0, 'within 80 ms it does not jump (a jump is a cut in the sound)');
  const at = (t) => Math.abs(glide.errs.find(([s]) => s >= t)[1]);
  if (process.env.VT_VERBOSE) console.log(`40 ms step: ${[6, 10, 15, 20, 25, 30].map((t) => `${t} s ${at(t).toFixed(2)} ms`).join(', ')}`);
  assert.ok(at(6) > 30, `just after the change it is still ~40 ms off (${at(6)})`);
  assert.ok(at(30) < 5 && glide.last < 5, `and back under 5 ms by ~25 s (${at(30)}, ${glide.last})`);
  // Fails if the jump threshold is ignored: 150 ms at 0.3 % would take 50 s to steer back
  const jump = follow(step(150), 12);
  assert.equal(jump.jumps, 1, `beyond ${CLIP_JUMP_MS} ms: one jump`);
  assert.ok(jump.last < 2, `and it is where the clock says right after (${jump.last})`);
});

test('player: the same play restored on a new engine clock (startAt moved) is followed — one jump to where the clock says', () => {
  const R = rig({ startAt: 10100 });
  for (let f = 0; f < 48000; f += 128) R.block(f);
  // the engine restarted: the transport shifted the play by its new clock (−2000 ms here), same playId
  R.rd.setPlay(8100, 0);
  for (let f = 48000; f < 2 * 48000; f += 128) R.block(f);
  const truth = ((10000 + (2 * 48000 * 1000) / 48000 - 8100) / 1000) * 48000;
  // Fails if setPlay is ignored: the player would stay 2 s behind the picture (or steer for minutes)
  assert.equal(R.rd.jumps, 1);
  assert.ok(Math.abs(R.rd.pos - truth) < 2, `on the new position (${R.rd.pos} vs ${truth})`);
});

test('player: a 44.1 kHz clip is resampled — a 1 kHz tone comes out at 1 kHz, clean (cubic interpolation)', () => {
  const R = rig({ rate: 44100, startAt: 10000, content: (k) => 0.5 * Math.sin((2 * Math.PI * 1000 * k) / 44100) });
  const y = [];
  for (let f = 0; f < 48000; f += 128) y.push(...R.block(f));
  const x = y.slice(4800, 43200); // 0.8 s
  let cross = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) cross++;
  const hz = cross / (x.length / 48000);
  // Fails if the clip is read at one source frame per output sample: 1000 × 48000 / 44100 = 1088 Hz
  assert.ok(Math.abs(hz - 1000) < 2, `1 kHz in, ${hz.toFixed(1)} Hz out`);
  // a least-squares sine at 1 kHz: what is left over is the interpolation's error
  let ss = 0, sc = 0, cc = 0, xs = 0, xc = 0;
  x.forEach((v, i) => { const s = Math.sin((2 * Math.PI * 1000 * i) / 48000), c = Math.cos((2 * Math.PI * 1000 * i) / 48000); ss += s * s; cc += c * c; sc += s * c; xs += v * s; xc += v * c; });
  const det = ss * cc - sc * sc, a = (xs * cc - xc * sc) / det, b = (xc * ss - xs * sc) / det;
  let res = 0;
  x.forEach((v, i) => { const e = v - a * Math.sin((2 * Math.PI * 1000 * i) / 48000) - b * Math.cos((2 * Math.PI * 1000 * i) / 48000); res += e * e; });
  const db = 10 * Math.log10(res / x.length / (0.125));
  if (process.env.VT_VERBOSE) console.log(`44.1 kHz: ${hz.toFixed(2)} Hz, residual ${db.toFixed(1)} dB`);
  assert.ok(Math.abs(Math.hypot(a, b) - 0.5) < 0.005 && db < -60, `amplitude ${Math.hypot(a, b).toFixed(4)}, residual ${db.toFixed(1)} dB`);
});

// ---------------------------------------------------------------------------------------------- transitions, ducking

test('transitions: the incoming clip fades in and the outgoing one out over the same transition, equal power; a 0 ms transition is a cut', () => {
  const fin = { at: 1000, ms: 400 }, fout = { at: 1000, ms: 400 };
  assert.equal(clipFade(999, fin, null), 0);
  assert.equal(clipFade(999, null, fout), 1, 'the outgoing clip stays at full until the new one starts');
  const mid = [clipFade(1200, fin, null), clipFade(1200, null, fout)];
  assert.ok(Math.abs(mid[0] - Math.SQRT1_2) < 1e-9 && Math.abs(mid[1] - Math.SQRT1_2) < 1e-9, `half way: both at −3 dB (${mid})`);
  assert.ok(Math.abs(mid[0] ** 2 + mid[1] ** 2 - 1) < 1e-9, 'equal power');
  assert.deepEqual([clipFade(1400, fin, null), clipFade(1400, null, fout)], [1, 0]);
  assert.deepEqual([clipFade(999.9, null, { at: 1000, ms: 0 }), clipFade(1000, null, { at: 1000, ms: 0 })], [1, 0]);

  // the REAL transport's state: a reel on L1, then another clip with audio launched on it — one fades in, the other out
  const MEDIA = [
    { id: 'mA', file: 's/a.mov', size: 10, video: { fourcc: 'Hap1', width: 64, height: 32, fps: 30, frames: 300, duration: 10 }, audio: { format: 's16le', codec: 'sowt', codecName: 'PCM', supported: true, channels: 2, rate: 48000, frames: 480000, duration: 10 } },
    { id: 'mB', file: 's/b.mov', size: 10, video: { fourcc: 'Hap1', width: 64, height: 32, fps: 30, frames: 300, duration: 10 }, audio: { format: null, codec: 'mp4a', codecName: 'AAC', supported: false, channels: 2, rate: 48000, frames: 0, duration: 10 } },
  ];
  const show = normalizeShow({ id: 's', name: 'S', media: MEDIA, clips: [{ id: 'a', mediaId: 'mA' }, { id: 'a2', mediaId: 'mA' }, { id: 'b', mediaId: 'mB' }],
    layers: [{ id: 'L1', transitionMs: 600 }], decks: [{ id: 'D1', columns: 4, cells: { 'L1:0': 'a', 'L1:1': 'a2', 'L1:2': 'b' } }] });
  const clock = { t: 1000 };
  const tr = new Transport({ now: () => clock.t, settings: clipSettings });
  tr.setShow(show);
  const p1 = tr.trigger({ clipId: 'a' });
  clock.t = 5000; tr.advance();
  const p2 = tr.trigger({ clipId: 'a2' });
  const v = clipVoices({ media: tr.state() });
  // Fails if the outgoing clip is dropped at once (a cut instead of the layer's 600 ms) or the incoming one starts at full
  assert.deepEqual(v.map((x) => [x.playId, x.role, x.fadeIn, x.fadeOut]), [
    [p2.playId, 'play', { at: p2.startAt, ms: 600 }, null],
    [p1.playId, 'from', null, { at: p2.startAt, ms: 600 }],
  ]);
  // a clip whose audio this app cannot play (AAC) has no voice; an eject fades the clip out over the layer's transition
  tr.trigger({ clipId: 'b' });
  assert.ok(clipVoices({ media: tr.state() }).every((x) => x.playId !== tr.state().layers.L1.play.playId), 'AAC: no voice');
  clock.t = 9000; tr.advance(); tr.trigger({ clipId: 'a' }); clock.t = 9500; tr.advance(); tr.clear('L1');
  const ej = clipVoices({ media: tr.state() });
  assert.deepEqual(ej.map((x) => [x.role, x.fadeOut]), [['from', { at: 9500, ms: 600 }]]);
});

test('ducking: the sound pieces duck while a clip with audio plays on an unmuted layer — not a held clip, not in calibration mode', () => {
  const play = { playId: 'p', audio: true };
  const S = (e, extra = {}) => ({ profile: { audio: { media: { level: 1 } } }, output: { calibrating: false }, media: { layers: { L1: { state: 'playing', play, volume: 1, mute: false, ...e } }, xlayer: null }, ...extra });
  assert.equal(clipAudible(S({})), true);
  // Fails if any of these still ducks the pieces (the ambient pad would stay silent with nothing else sounding)
  assert.equal(clipAudible(S({ state: 'held' })), false, 'a held clip (its end reached) is silent');
  assert.equal(clipAudible(S({ mute: true })), false, 'a muted layer');
  assert.equal(clipAudible(S({ volume: 0 })), false, 'a layer at 0');
  assert.equal(clipAudible(S({ play: { ...play, audio: false } })), false, 'a clip without audio');
  assert.equal(clipAudible(S({}, { output: { calibrating: true } })), false, 'calibration mode (the clips are muted)');
  assert.equal(clipAudible(S({ state: 'empty', play: null })), false);
});

test('PCM decoding: 16 / 24-bit integer, both byte orders, 8-bit unsigned and 32-bit float, interleaved → planar', () => {
  const s16 = new Uint8Array([0x00, 0x40, 0x00, 0xc0, 0xff, 0x7f, 0x00, 0x80]); // L 0.5, R −0.5, L ≈1, R −1
  assert.deepEqual(decodePcm(s16, 's16le', 2).map((c) => [...c].map((v) => Math.round(v * 1000) / 1000)), [[0.5, 1], [-0.5, -1]]);
  const s24be = new Uint8Array([0x40, 0x00, 0x00, 0xc0, 0x00, 0x00]); // 0.5, −0.5 (mono)
  assert.deepEqual([...decodePcm(s24be, 's24be', 1)[0]], [0.5, -0.5]);
  assert.deepEqual([...decodePcm(new Uint8Array([128, 192, 64]), 'u8', 1)[0]], [0, 0.5, -0.5]);
  const f = new Float32Array([0.25, -0.75]);
  assert.deepEqual([...decodePcm(new Uint8Array(f.buffer), 'f32le', 2).flatMap((c) => [...c])], [0.25, -0.75]);
  assert.throws(() => decodePcm(new Uint8Array(4), 'aac', 2), (e) => e.status === 415);
});

// ---------------------------------------------------------------------------------------------- Electron: the real graph

/** One run of the audio page (a test engine, audio OFF: no device is opened) with the script below. */
let pageRun = null;
function inAudioPage() {
  pageRun ||= (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-clipaudio-'));
    const store = new Store(dir, path.join(root, 'profiles'), quiet);
    const engine = new Engine({ store, log: quiet, version: 'test' });
    engine.start();
    const server = await createServer(engine, { port: 0, root, log: quiet });
    engine.port = server.port;
    const file = path.join(dir, 'script.js');
    fs.writeFileSync(file, PAGE);
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
      if (process.env.VT_VERBOSE) console.log(JSON.stringify(data.result));
      return data;
    } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  })();
  return pageRun;
}

// XR Lab's room as the graph gets it (master at 1 so the numbers read directly), on an OfflineAudioContext of 6 channels.
const ROOM = { ...XR.audio, master: 1, mute: false, walls: XR.walls.map((w) => ({ id: w.id, name: w.name })), fold: false };
const PAGE = `
const { buildRoomAudio } = await import('/js/audio-graph.js');
const { ClipAudio } = await import('/js/audio-media.js');
const { roomPlan } = await import('/shared/geometry.js');
const SR = 48000, ENG0 = 50000, ROOM = ${JSON.stringify(ROOM)}, PROFILE = ${JSON.stringify(XR)}, CH = ROOM.channels;
const TAU = 2 * Math.PI;
// a clip's PCM made up on the spot: gen(channel, sourceFrame) for every clip id
const pcm = (gens, calls) => async ({ clipId, from, n }) => {
  calls && calls.push([clipId, from, n]);
  const g = gens[clipId];
  if (typeof g === 'number') throw Object.assign(new Error('status ' + g), { status: g });
  return { from, planar: [0, 1].map((c) => Float32Array.from({ length: n }, (_, j) => g(c, from + j))) };
};
const MEDIA = [{ id: 'M48', audio: { supported: true, channels: 2, rate: 48000 } }, { id: 'M44', audio: { supported: true, channels: 2, rate: 44100 } }, { id: 'MAAC', audio: { supported: false, channels: 2, rate: 48000 } }];
const play = (o) => ({ playId: 'p1', clipId: 'C1', mediaId: 'M48', startAt: ENG0 + 100, offset: 0, in: 0, out: 60, fps: 30, frames: 1800, end: 'loop', loops: 1, audio: true, gainDb: 0, route: null, ...o });
const entry = (o) => ({ state: 'playing', play: null, from: null, fadeAt: null, transitionMs: 0, volume: 1, mute: false, ...o });
const stateOf = ({ layers = {}, blackout = false, blackoutAt = null, calibrating = false, media = {} } = {}) => ({
  profile: { ...PROFILE, audio: { ...PROFILE.audio, media: { ...PROFILE.audio.media, width: 1, ...media } } },
  output: { calibrating }, show: { media: MEDIA },
  media: { blackout, blackoutAt, layers, xlayer: entry({ state: 'empty' }) } });
/** The room graph + ClipAudio on an offline context. plan({ ctx, room, ca, at }); at(t, fn) runs fn (awaited) at t s. */
async function render(seconds, plan, { gens, calls, lat = 0, cfg = ROOM } = {}) {
  const ctx = new OfflineAudioContext(CH, Math.round(SR * seconds), SR);
  const room = await buildRoomAudio(ctx, cfg, {});
  room.output.connect(ctx.destination);
  const ca = new ClipAudio({ ctx, room, timing: () => ({ ctxT: ctx.currentTime, engMs: ENG0 + ctx.currentTime * 1000 }), latencyMs: () => lat, roomPlan, fetchPcm: pcm(gens, calls) });
  const steps = [];
  await plan({ ctx, room, ca, at: (t, fn) => steps.push([t, fn]) });
  for (let t = 1; t < seconds; t += 1) steps.push([t, () => ca.fill()]); // the PCM ahead, as the window's tick does
  const q = 128 / SR, byQ = new Map();
  for (const [t, fn] of steps) { const k = Math.max(1, Math.round(t / q)); (byQ.get(k) || byQ.set(k, []).get(k)).push(fn); }
  for (const [k, fns] of byQ) ctx.suspend(k * q).then(async () => { for (const fn of fns) await fn(); ctx.resume(); });
  await ca.fill();
  const buf = await ctx.startRendering();
  const stats = ca.stats();
  ca.dispose();
  return { ch: Array.from({ length: CH }, (_, c) => buf.getChannelData(c)), stats };
}
const seg = (d, t0, t1) => d.subarray(Math.round(t0 * SR), Math.round(t1 * SR));
const rms = (d, t0, t1) => { const x = seg(d, t0, t1); let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / x.length); };
const peak = (chs) => chs.reduce((m, d) => { for (const v of d) m = Math.max(m, Math.abs(v)); return m; }, 0);
const goertzel = (x, hz) => { const w = TAU * hz / SR, k = 2 * Math.cos(w); let a = 0, b = 0; for (const v of x) { const c = v + k * a - b; b = a; a = c; } return Math.sqrt(a * a + b * b - k * a * b) / x.length * 2; };
const tone = (hz, amp, rate = 48000, chans = [0, 1]) => (c, k) => (chans.includes(c) ? amp * Math.sin(TAU * hz * k / rate) : 0);
const out = { isolated: crossOriginIsolated };

// A. a tone only in L, XR Lab, width 100 %: channels 1, 2, 3 with the table's gains
{
  const r = await render(1, ({ ca }) => { ca.update(stateOf({ layers: { L1: entry({ play: play({ startAt: ENG0 + 50 }) }) } })); }, { gens: { C1: tone(1000, 0.25, 48000, [0]) } });
  out.left = { rms: r.ch.map((d) => rms(d, 0.3, 1)), route: r.stats[0].route, src: 0.25 / Math.SQRT2 };
}
// B. a clip 10x too loud (+20 dB clip gain on a full-scale tone): the limiter holds the ceiling
{
  const r = await render(1, ({ ca }) => { ca.update(stateOf({ layers: { L1: entry({ play: play({ gainDb: 20 }) }) } })); }, { gens: { C1: tone(500, 0.9) } });
  const g = r.stats[0].gains, raw = Math.max(...Array.from({ length: CH }, (_, c) => (g[0][c] + g[1][c]) * 0.9 * 10));
  out.loud = { peak: peak(r.ch), raw, ceiling: 10 ** (ROOM.ceilingDb / 20) };
}
// C. sample 0 and 44.1 kHz: the clip starts at engine ENG0+300; output latency 30 ms and A/V offset +15 ms → heard at 0.300 s,
//    rendered (advanced) at 0.255 s; a 1 kHz tone at 44.1 kHz
{
  const r = await render(1, ({ ca }) => { ca.update(stateOf({ media: { avOffsetMs: 15 }, layers: { L1: entry({ play: play({ mediaId: 'M44', startAt: ENG0 + 300 }) }) } })); }, { gens: { C1: tone(1000, 0.3, 44100) }, lat: 30 });
  const d = r.ch[0];
  const first = d.findIndex((v) => Math.abs(v) > 0.005);
  const x = seg(d, 0.4, 0.95); let cross = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) cross++;
  out.start = { first: first / SR, want: 0.255, hz: cross / (x.length / SR), before: rms(d, 0, 0.25) };
}
// D. layer volume (1 → 0.25 at 0.4 s) and mute (at 0.7 s) are ramps: no step between samples
{
  const st = (o) => stateOf({ layers: { L1: entry({ play: play(), ...o }) } });
  const r = await render(1.1, ({ ca, at }) => { ca.update(st({})); at(0.4, () => ca.update(st({ volume: 0.25 }))); at(0.7, () => ca.update(st({ volume: 0.25, mute: true }))); }, { gens: { C1: () => 0.2 } });
  const d = seg(r.ch[0], 0.3, 1.05); let step = 0;
  for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
  out.ramps = { step, full: rms(r.ch[0], 0.3, 0.39), quarter: rms(r.ch[0], 0.5, 0.69), muted: rms(r.ch[0], 0.8, 1.05) };
}
// E. ducking: a pad on roomInput; a (silent) clip plays from 0.5 s to 1.5 s → the pad ducks and comes back
async function ducked(duckDb) {
  const st = (playing) => stateOf({ media: { duckDb }, layers: { L1: entry(playing ? { play: play({ startAt: ENG0 + 500 }) } : { state: 'empty' }) } });
  const r = await render(2.6, ({ ctx, room, ca, at }) => {
    const o = ctx.createOscillator(); o.frequency.value = 300; const g = ctx.createGain(); g.gain.value = 0.2; o.connect(g); g.connect(room.audio.roomInput()); o.start();
    room.fade(1, 0);
    ca.update(st(false)); at(0.5, () => ca.update(st(true))); at(1.5, () => ca.update(st(false)));
  }, { gens: { C1: () => 0 } });
  return { before: rms(r.ch[0], 0.2, 0.5), during: rms(r.ch[0], 1.1, 1.5), after: rms(r.ch[0], 2.1, 2.6) };
}
out.duck = { silent: await ducked(-60), minus12: await ducked(-12) };
// F. a clip still copying (409) and one with AAC audio: silent, no error, the copying one asked again later
{
  const calls = [];
  const r = await render(0.6, ({ ca }) => { ca.update(stateOf({ layers: { L1: entry({ play: play() }), L2: entry({ play: play({ playId: 'p2', clipId: 'C2', mediaId: 'MAAC' }) }) } })); }, { gens: { C1: 409, C2: tone(500, 0.5) }, calls });
  out.copying = { peak: peak(r.ch), players: r.stats.map((s) => [s.playId, s.state]), calls: calls.length };
}
// F2. a 404 (the file is not there yet) is retried with backoff; only 415 / 422 (audio this app cannot play) are given up
{
  const calls = [];
  const r = await render(0.6, ({ ca }) => { ca.update(stateOf({ layers: { L1: entry({ play: play({ playId: 'p404', clipId: 'C404', mediaId: 'M48' }) }), L2: entry({ play: play({ playId: 'p422', clipId: 'C422', mediaId: 'M48' }) }) } })); }, { gens: { C404: 404, C422: 422 }, calls });
  out.missing = { players: r.stats.map((s) => [s.playId, s.state]).sort() };
}
// G. calibration mode mutes the clips (0.5 → 1.0 s) and they come back where the clock is; blackout fades them out over 0.5 s
{
  const st = (o) => stateOf({ layers: { L1: entry({ play: play() }) }, ...o });
  const r = await render(3.2, ({ ca, at }) => {
    ca.update(st({}));
    at(0.5, () => ca.update(st({ calibrating: true }))); at(1.0, () => ca.update(st({})));
    at(1.6, () => ca.update(st({ blackout: true, blackoutAt: ENG0 + 1600 }))); at(2.4, () => ca.update(st({ blackout: false, blackoutAt: ENG0 + 2400 })));
  }, { gens: { C1: tone(440, 0.2, 48000, [0]) } });
  const d = r.ch[0];
  // the clip as the clock has it: started at 0.1 s, never paused
  const corr = (t0, t1) => { let xy = 0, xx = 0, yy = 0; for (let i = Math.round(t0 * SR); i < t1 * SR; i++) { const y = 0.2 * Math.sin(TAU * 440 * (i - 0.1 * SR) / SR); xy += d[i] * y; xx += d[i] * d[i]; yy += y * y; } return xy / Math.sqrt(xx * yy); };
  out.calib = { full: rms(d, 0.2, 0.5), muted: rms(d, 0.7, 0.98), back: rms(d, 1.2, 1.55), corrBack: corr(1.2, 1.55), midFade: rms(d, 1.84, 1.86), dark: rms(d, 2.15, 2.39), again: rms(d, 2.95, 3.2), corrAgain: corr(2.95, 3.2) };
}
// H. a crossfade on one layer: A (400 Hz) goes, B (900 Hz) comes, over 400 ms from 0.5 s — at half way both at −3 dB
{
  const L1 = entry({ play: play({ playId: 'pB', clipId: 'CB', startAt: ENG0 + 500 }), from: play({ playId: 'pA', clipId: 'CA', startAt: ENG0 }), fadeAt: ENG0 + 500, transitionMs: 400 });
  const r = await render(1.2, ({ ca }) => { ca.update(stateOf({ layers: { L1 } })); }, { gens: { CA: tone(400, 0.2), CB: tone(900, 0.2) } });
  const d = r.ch[2], m = (t0, t1, hz) => goertzel(seg(d, t0, t1), hz);
  out.xfade = { a0: m(0.2, 0.5, 400), b0: m(0.2, 0.5, 900), aMid: m(0.69, 0.71, 400), bMid: m(0.69, 0.71, 900), a1: m(0.95, 1.2, 400), b1: m(0.95, 1.2, 900) };
}
// I. no sub + the walls' high-pass (200 Hz): a clip's bass is not lost — the same tone heard with and without the high-pass
//    at 80 Hz is about the same, and at 1 kHz (above the high-pass) it is not doubled by the fold
{
  const run = async (hz, cfg) => { const r = await render(1, ({ ca }) => { ca.update(stateOf({ layers: { L1: entry({ play: play({ startAt: ENG0 + 50 }) }) } })); }, { gens: { C1: tone(hz, 0.25) }, cfg }); return rms(r.ch[0], 0.4, 1); };
  const HP = { ...ROOM, wallHighpassHz: 200 };
  out.fold = { low: await run(80, HP), lowFlat: await run(80, ROOM), high: await run(1000, HP), highFlat: await run(1000, ROOM) };
}
return out;`;

test('clips graph (offline, real worklet): a tone only in L reaches channels 1, 2 and 3 of XR Lab with the table\'s gains, nothing else', opt, async () => {
  const { result: r, errors } = await inAudioPage();
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.ok(r.isolated, 'the audio page is cross-origin isolated (SharedArrayBuffer for the clip rings)');
  assert.equal(r.left.route, 'spread');
  // Fails if the clips bus is not wired to the walls (silence), or the routing sums the shared channel / ignores the plan
  const want = [1, Math.SQRT1_2, Math.SQRT1_2, 0, 0, 0].map((g) => g * r.left.src);
  r.left.rms.forEach((v, c) => assert.ok(Math.abs(v - want[c]) < 0.004, `channel ${c + 1}: ${v.toFixed(4)} (want ${want[c].toFixed(4)})`));
});

test('clips graph: a clip 10x too loud stays under the limiter ceiling (the clips go through master and limiter)', opt, async () => {
  const { result: r } = await inAudioPage();
  assert.ok(r.loud.raw > 5, `without the limiter it would peak at ${r.loud.raw.toFixed(1)} — so this check means something`);
  // Fails if the clips bus bypasses the limiter (e.g. straight to the output merger after it)
  assert.ok(r.loud.peak <= r.loud.ceiling + 1e-4 && r.loud.peak > r.loud.ceiling * 0.8, `peak ${r.loud.peak} vs ceiling ${r.loud.ceiling}`);
});

test('clips sync (real worklet + ring): sample 0 within ±2 ms of the instant asked for, advanced by the output latency and the A/V offset; 44.1 kHz at pitch', opt, async () => {
  const { result: r } = await inAudioPage();
  // Fails if the advance (latency 30 ms + A/V offset 15 ms) is not applied, or the start is rounded to a block / a chunk
  assert.ok(Math.abs(r.start.first - r.start.want) <= 0.002, `first sample at ${(r.start.first * 1000).toFixed(2)} ms, asked ${r.start.want * 1000} ms`);
  assert.ok(r.start.before < 1e-6, 'silence before it');
  // Fails if the 44.1 kHz clip is not resampled (1088 Hz)
  assert.ok(Math.abs(r.start.hz - 1000) < 3, `44.1 kHz, 1 kHz tone → ${r.start.hz.toFixed(1)} Hz`);
});

test('clips levels: the layer\'s volume and mute act with ramps (no step between samples)', opt, async () => {
  const { result: r } = await inAudioPage();
  // a step of the gain would move a 0.2 DC by 0.15 in one sample; the 40 ms ramp moves it ~0.0001
  // Fails if the layer gain is set (setValueAtTime / .value) instead of ramped
  assert.ok(r.ramps.step < 0.002, `largest sample-to-sample change ${r.ramps.step}`);
  assert.ok(Math.abs(r.ramps.quarter / r.ramps.full - 0.25) < 0.01, `volume 0.25 reached (${r.ramps.quarter / r.ramps.full})`);
  assert.ok(r.ramps.muted < 1e-4, `mute silences (${r.ramps.muted})`);
});

test('clips ducking: the sound piece drops by duckDb while a clip with audio plays and comes back after', opt, async () => {
  const { result: { duck } } = await inAudioPage();
  for (const [k, d] of Object.entries(duck)) assert.ok(d.before > 0.05, `${k}: the pad sounds before (${d.before})`);
  // Fails if the ducking is not wired (the pad stays) or never released (the pad does not come back)
  assert.ok(duck.silent.during < duck.silent.before * 1e-3, `−60 dB: silent under the clip (${duck.silent.during})`);
  assert.ok(Math.abs(duck.minus12.during / duck.minus12.before - 10 ** (-12 / 20)) < 0.02, `−12 dB: ${duck.minus12.during / duck.minus12.before}`);
  for (const [k, d] of Object.entries(duck)) assert.ok(Math.abs(d.after / d.before - 1) < 0.02, `${k}: back to its level after the clip (${d.after / d.before})`);
});

test('clips that cannot sound yet or at all: still copying (409) and AAC play silently, without errors', opt, async () => {
  const { result: r, errors } = await inAudioPage();
  assert.ok(r.copying.peak < 1e-6, `silent (${r.copying.peak})`);
  // Fails if a 409 is treated as fatal (no retry later) or retried in a loop (one request per block)
  assert.deepEqual(r.copying.players, [['p1', 'copying']], 'the copying clip waits to be asked again; the AAC one has no player at all');
  assert.ok(r.copying.calls <= 2, `no request storm (${r.copying.calls} requests)`);
  assert.deepEqual(errors, []);
});

test('a 404 is retried, a 422 is given up: only audio this app cannot play stays silent for good', opt, async () => {
  const { result: r } = await inAudioPage();
  // Fails if a 404 marks the play 'unsupported' for good (a file still being copied in would never sound)
  assert.deepEqual(r.missing.players, [['p404', 'retry'], ['p422', 'unsupported']]);
});

test('clips: calibration mode mutes them and they come back where the clock is; blackout fades them over 0.5 s', opt, async () => {
  const { result: { calib: c } } = await inAudioPage();
  assert.ok(c.full > 0.1, `playing (${c.full})`);
  assert.ok(c.muted < 1e-4, `muted in calibration mode (${c.muted})`);
  // Fails if calibration PAUSES the player (it would come back late: the phase of the tone would be off)
  assert.ok(Math.abs(c.back / c.full - 1) < 0.02 && c.corrBack > 0.999, `back at full, on the clock's position (level ${c.back / c.full}, correlation ${c.corrBack})`);
  // Fails if the blackout cuts at once or does not fade at all
  assert.ok(c.midFade / c.full > 0.3 && c.midFade / c.full < 0.7, `half way through the 0.5 s blackout fade (${c.midFade / c.full})`);
  assert.ok(c.dark < 1e-4, `silent in blackout (${c.dark})`);
  assert.ok(Math.abs(c.again / c.full - 1) < 0.02 && c.corrAgain > 0.999, `and back after it (${c.again / c.full}, ${c.corrAgain})`);
});

test('clips crossfade: the outgoing clip\'s sound fades over the layer\'s transition while the new one comes in (equal power)', opt, async () => {
  const { result: { xfade: x } } = await inAudioPage();
  assert.ok(x.a0 > 0.05 && x.b0 < x.a0 * 0.01, `before: only A (${x.a0}, ${x.b0})`);
  // Fails if the outgoing clip is cut at the start of the transition, or the incoming one starts at full
  assert.ok(Math.abs(x.aMid / x.a0 - Math.SQRT1_2) < 0.05 && Math.abs(x.bMid / x.a0 - Math.SQRT1_2) < 0.05, `half way both at −3 dB (${x.aMid / x.a0}, ${x.bMid / x.a0})`);
  assert.ok(x.a1 < x.a0 * 0.01 && Math.abs(x.b1 / x.a0 - 1) < 0.03, `after: only B (${x.a1}, ${x.b1})`);
});

test('clips with no sub and a wall high-pass keep their bass (folded to the walls), without doubling what the high-pass lets through', opt, async () => {
  const { result: { fold: f } } = await inAudioPage();
  // Fails if the clips only go through the high-pass when there is no sub: at 80 Hz ~ 200 Hz 4th order leaves ~2 % of the level
  assert.ok(f.lowFlat > 0.05, `the reference sounds (${f.lowFlat})`);
  assert.ok(f.low / f.lowFlat > 0.85 && f.low / f.lowFlat < 1.2, `80 Hz keeps its level with the high-pass on (${f.low / f.lowFlat})`);
  // Fails if the fold is not filtered (the whole band added twice: +6 dB at 1 kHz)
  assert.ok(Math.abs(f.high / f.highFlat - 1) < 0.05, `1 kHz is not doubled (${f.high / f.highFlat})`);
});
