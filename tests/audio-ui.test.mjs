// Room audio in a real Chromium (Electron's renderer, tests/ui/runner.cjs): the routing graph on an OfflineAudioContext — which
// channel each source comes out on, the crossover, master / mute, the limiter, test tones, the fold — the worklet that writes the
// per-device ring buffers (on the cross-origin-isolated audio page), the sound mode of the runtime against a live engine, and the
// Audio card in the Experiences tab. The pure parts are in tests/audio.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

/** A test engine (the bundled simulated room) + a page in the UI runner; returns { result, errors, engine }. */
async function inUi(script, { setup, page = '/', wait = 'state', w = 1440, h = 900 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-audui-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, script);
  try {
    if (setup) await setup(engine);
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}${page}`, `--script=${file}`, `--w=${w}`, `--h=${h}`, `--wait=${wait}`];
    const out = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = out.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the UI runner: ${out.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`UI script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, engine };
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// A room of three walls (P3 has two speakers), a sub on channel 5. Rendered offline; rms / peak per output channel over [from, 1] of the render.
const PRE = `
const { buildRoomAudio } = await import('/js/audio-graph.js');
const BASE = { channels: 5, map: { P1: [1], P2: [2], P3: [3, 4] }, sub: { channel: 5, crossoverHz: 90 }, wallHighpassHz: 90, master: 1, mute: false, ceilingDb: -2,
  walls: [{ id: 'P1', name: 'P1' }, { id: 'P2', name: 'P2' }, { id: 'P3', name: 'P3' }], fold: false };
async function render(over, setup, { seconds = 1, from = 0.4, build = {} } = {}) {
  const cfg = { ...BASE, ...over }, outN = cfg.fold ? 2 : cfg.channels;
  const ctx = new OfflineAudioContext(outN, Math.round(48000 * seconds), 48000);
  const room = await buildRoomAudio(ctx, cfg, build);
  await setup(room, ctx);
  room.output.connect(ctx.destination);
  const buf = await ctx.startRendering();
  const rms = [], peak = [];
  for (let c = 0; c < outN; c++) {
    const d = buf.getChannelData(c), i0 = Math.floor(d.length * from);
    let s = 0, p = 0;
    for (let i = i0; i < d.length; i++) { s += d[i] * d[i]; p = Math.max(p, Math.abs(d[i])); }
    rms.push(Math.sqrt(s / (d.length - i0))); peak.push(p);
  }
  return { rms, peak };
}
function osc(ctx, hz, amp, target) { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = amp; o.connect(g); g.connect(target); o.start(); return o; }
const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
`;

test('audio graph: a source on wallInput(wall) comes out ONLY on that wall\'s channels; two speakers share it by u; unknown walls are silent', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const out = {};
    out.p2 = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P2').node))).rms;
    out.p1 = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P1').node))).rms;
    out.left = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P3', 0).node))).rms;
    out.right = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P3', 1).node))).rms;
    out.mid = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P3', 0.5).node))).rms;
    out.moved = (await render({}, async (r, c) => { const w = r.audio.wallInput('P3', 0); osc(c, 1000, 0.5, w.node); w.setPosition(1); }, { seconds: 1.5, from: 0.8 })).rms;
    out.unknown = (await render({}, (r, c) => { osc(c, 1000, 0.5, r.audio.wallInput('NOPE').node); })).rms;
    out.walls = await render({}, (r, c) => { out.listed = r.audio.walls; }).then(() => out.listed);
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const only = (rms, k, lvl = 0.35) => rms.forEach((v, c) => (c === k ? assert.ok(Math.abs(v - lvl) < 0.04, `channel ${c + 1} carries it (${v})`) : assert.ok(v < 1e-3, `channel ${c + 1} is silent (${v})`)));
  only(result.p2, 1); only(result.p1, 0);
  only(result.left, 2); only(result.right, 3);
  assert.ok(Math.abs(result.mid[2] - 0.25) < 0.03 && Math.abs(result.mid[3] - 0.25) < 0.03 && result.mid[0] < 1e-3 && result.mid[1] < 1e-3, `u = 0.5: equal power on both speakers (${result.mid})`);
  assert.ok(result.moved[3] > 0.3 && result.moved[2] < 0.02, `setPosition(1) moves it to the right speaker (${result.moved})`);
  assert.ok(result.unknown.every((v) => v < 1e-3), 'an unknown wall is silent, not an error');
  assert.deepEqual(result.walls, [{ id: 'P1', name: 'P1', speakers: 1 }, { id: 'P2', name: 'P2', speakers: 1 }, { id: 'P3', name: 'P3', speakers: 2 }]);
});

test('audio graph: subInput only reaches the sub channel; with no sub it is folded into the walls; roomInput is equal on every wall and feeds the sub', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const out = {};
    out.sub = (await render({}, (r, c) => osc(c, 60, 0.5, r.audio.subInput()))).rms;
    out.noSub = (await render({ channels: 4, sub: { channel: null, crossoverHz: 90 } }, (r, c) => osc(c, 60, 0.5, r.audio.subInput()))).rms;
    out.room = (await render({}, (r, c) => osc(c, 1000, 0.5, r.audio.roomInput()))).rms;
    out.roomLow = (await render({}, (r, c) => osc(c, 60, 0.5, r.audio.roomInput()))).rms;
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.ok(Math.abs(result.sub[4] - 0.35) < 0.04, `the sub channel has it (${result.sub[4]})`);
  assert.ok(result.sub.slice(0, 4).every((v) => v < 1e-3), `and no wall does (${result.sub})`);
  assert.equal(result.noSub.length, 4);
  assert.ok(result.noSub.every((v) => v > 0.05), `without a sub the low end is heard on every wall speaker (${result.noSub})`);
  assert.ok(Math.abs(result.room[0] - 0.35) < 0.04 && Math.abs(result.room[1] - 0.35) < 0.04, `the room input on a one-speaker wall (${result.room})`);
  assert.ok(Math.abs(result.room[2] - 0.25) < 0.03 && Math.abs(result.room[3] - 0.25) < 0.03, `a two-speaker wall shares it, equal power (${result.room})`);
  assert.ok(result.room[4] < 0.01, 'a 1 kHz room signal is not in the sub');
  assert.ok(result.roomLow[4] > 0.25, `a 60 Hz room signal is (${result.roomLow[4]})`);
});

test('audio graph: the crossover — low content reaches the sub and is cut from the walls, high content the other way round', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const run = (hz) => render({}, (r, c) => osc(c, hz, 0.5, r.audio.roomInput())).then((x) => x.rms);
    return { low: await run(40), high: await run(2000), off: (await render({ wallHighpassHz: 0 }, (r, c) => osc(c, 40, 0.5, r.audio.roomInput()))).rms };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.ok(result.low[4] > 0.25, `40 Hz in the sub (${result.low[4]})`);
  assert.ok(result.low[0] < 0.03 && result.low[1] < 0.03, `40 Hz cut from the walls (${result.low[0]}, ${result.low[1]})`);
  assert.ok(result.low[4] / result.low[0] > 8, 'by at least 18 dB');
  assert.ok(result.high[0] > 0.3 && result.high[4] < 0.005, `2 kHz on the walls and not in the sub (${result.high[0]}, ${result.high[4]})`);
  assert.ok(result.off[0] > 0.3, `with the wall high-pass at 0 the walls get the low end too (${result.off[0]})`);
});

test('audio graph: 20 loud sources at once never get above the limiter ceiling; master scales and mute silences', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const loud = (r, c) => { const t = r.audio.roomInput(); for (let k = 0; k < 20; k++) osc(c, 150 + 137 * k, 0.8, t); };
    const a = await render({}, loud, { from: 0.1 });
    const b = await render({ ceilingDb: -6 }, loud, { from: 0.1 });
    const one = (cfg) => render(cfg, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P2').node)).then((x) => x.rms[1]);
    return { a: a.peak, b: b.peak, full: await one({}), half: await one({ master: 0.5 }), muted: await one({ mute: true }), live: await render({}, (r, c) => { osc(c, 1000, 0.5, r.audio.wallInput('P2').node); r.set({ master: 0.25 }); }, { seconds: 1.5, from: 0.8 }).then((x) => x.rms[1]) };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const ceil = (db) => 10 ** (db / 20);
  assert.ok(Math.max(...result.a) <= ceil(-2) + 1e-4, `peak ${Math.max(...result.a)} <= −2 dBFS`);
  assert.ok(Math.max(...result.a) > 0.5, 'and the signal is there');
  assert.ok(Math.max(...result.b) <= ceil(-6) + 1e-4, `a lower ceiling holds too (${Math.max(...result.b)})`);
  assert.ok(Math.abs(result.half / result.full - 0.5) < 0.03, `master 0.5 halves the level (${result.half / result.full})`);
  assert.ok(result.muted < 1e-6, 'mute silences');
  assert.ok(Math.abs(result.live / result.full - 0.25) < 0.03, `master changes live (${result.live / result.full})`);
});

test('audio graph: a test tone sounds on ONE logical channel — the sub too — and not through the pieces\' fade', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const tone = (ch, over = {}) => render(over, (r) => r.tone(ch), { from: 0.25 }).then((x) => ({ rms: r3(x.rms), peak: Math.max(...x.peak) }));
    const faded = await render({}, (r) => { r.fade(0, 0); r.tone(3); }, { from: 0.25 }).then((x) => r3(x.rms));
    const none = await render({}, (r) => r.tone(99), { from: 0.25 }).then((x) => r3(x.rms));
    return { t2: await tone(2), t4: await tone(4), sub: await tone(5), nosub: await tone(2, { channels: 4, sub: { channel: null, crossoverHz: 90 } }), faded, none };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  for (const [name, k] of [['t2', 1], ['t4', 3], ['sub', 4]]) {
    result[name].rms.forEach((v, c) => (c === k ? assert.ok(v > 0.01, `${name}: channel ${c + 1} sounds (${v})`) : assert.ok(v < 1e-3, `${name}: channel ${c + 1} is silent (${v})`)));
  }
  assert.ok(result.t2.peak < 0.2, 'soft');
  assert.equal(result.nosub.rms.length, 4);
  assert.ok(result.faded[2] > 0.01, 'the pieces\' fade does not mute a test tone');
  assert.ok(result.none.every((v) => v === 0), 'a channel that does not exist plays nothing');
});

test('audio graph: a wall\'s test signal is a LOW STRIKE with harmonics (placed at once in a room), not a steady high sine; the sub keeps its low tone', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const one = async (ch) => {
      const ctx = new OfflineAudioContext(5, 48000, 48000);
      const room = await buildRoomAudio(ctx, BASE, {});
      room.tone(ch, { at: 0 });
      room.output.connect(ctx.destination);
      return (await ctx.startRendering()).getChannelData(ch - 1);
    };
    const goertzel = (d, f, a = 0, b = d.length) => { const w = 2 * Math.PI * f / 48000, cw = 2 * Math.cos(w); let s1 = 0, s2 = 0;
      for (let i = a; i < b; i++) { const s = d[i] + cw * s1 - s2; s2 = s1; s1 = s; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cw * s1 * s2)) / (b - a); };
    const peakIn = (d, t0, t1) => { let m = 0; for (let i = Math.floor(t0 * 48000); i < Math.floor(t1 * 48000); i++) m = Math.max(m, Math.abs(d[i])); return m; };
    const wall = await one(2), sub = await one(5);
    const bins = (d) => Object.fromEntries([55, 110, 220, 330, 880].map((f) => [f, goertzel(d, f)]));
    return { wall: bins(wall), sub: bins(sub), first: peakIn(wall, 0, 0.012), all: peakIn(wall, 0, 1), before2nd: peakIn(wall, 0.29, 0.33), second: peakIn(wall, 0.334, 0.36),
             subSteady: peakIn(sub, 0.45, 0.55) / peakIn(sub, 0.1, 0.2) };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const w = result.wall;
  assert.ok(w[110] > w[880] * 4 && w[110] > w[55] * 4, `the fundamental is 110 Hz (${JSON.stringify(w)})`);
  assert.ok(w[220] > w[110] * 0.25 && w[330] > w[110] * 0.15, `with its harmonics (${JSON.stringify(w)})`);
  assert.ok(result.first > result.all * 0.6, `struck: loud within the first 12 ms (${result.first} of ${result.all})`);
  assert.ok(result.before2nd < result.all * 0.15 && result.second > result.all * 0.6, `it rings down and is struck again (${result.before2nd} → ${result.second})`);
  assert.ok(result.sub[55] > result.sub[880] * 10 && result.subSteady > 0.8, `the sub keeps a steady low tone (${JSON.stringify(result.sub)})`);
});

test('audio graph: walls that SHARE a channel (one feed for two walls, no sub, no high-pass) — each wall sounds there, the pad is not doubled on it', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    // the map set at XR Lab: P4 → 1, P1 → 3, P2 and P3 both → 2, no sub, wall high-pass off
    const shared = { channels: 4, map: { P4: [1], P1: [3], P2: [2], P3: [2] }, sub: { channel: null, crossoverHz: 90 }, wallHighpassHz: 0,
      walls: [{ id: 'P4', name: 'P4' }, { id: 'P1', name: 'P1' }, { id: 'P2', name: 'P2' }, { id: 'P3', name: 'P3' }] };
    const out = {};
    out.p3 = (await render(shared, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P3').node))).rms;
    out.p1 = (await render(shared, (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P1').node))).rms;
    out.room = (await render(shared, (r, c) => osc(c, 1000, 0.5, r.audio.roomInput()))).rms;
    out.low = (await render(shared, (r, c) => osc(c, 60, 0.5, r.audio.subInput()))).rms;
    out.walls = await render(shared, (r) => { out.listed = r.audio.walls; }).then(() => out.listed);
    return out;`);
  assert.deepEqual(errors, [], errors.join(' | '));
  const only = (rms, k) => rms.forEach((v, c) => (c === k ? assert.ok(Math.abs(v - 0.35) < 0.04, `channel ${c + 1} carries it (${v})`) : assert.ok(v < 1e-3, `channel ${c + 1} is silent (${v})`)));
  only(result.p3, 1); only(result.p1, 2);
  [0, 1, 2].forEach((c) => assert.ok(Math.abs(result.room[c] - 0.35) < 0.04, `the pad is at the same level on channel ${c + 1} (${result.room.map((v) => v.toFixed(3))}) — not doubled where two walls share`));
  assert.ok(result.room[3] < 1e-3, 'a channel no wall uses stays silent');
  assert.ok([0, 1, 2].every((c) => result.low[c] > 0.05) && result.low[3] < 1e-3, `no sub: the low end is heard on the walls' channels (${result.low})`);
  assert.deepEqual(result.walls.map((w) => w.id), ['P4', 'P1', 'P2', 'P3'], 'every wall is there for the pieces');
});

test('audio graph: with no multichannel device the channels fold into left and right — walls in order from left to right, the sub in both', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const f = (fn) => render({ fold: true }, fn).then((x) => r3(x.rms));
    return { first: await f((r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P1').node)), last: await f((r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P3', 1).node)),
             sub: await f((r, c) => osc(c, 60, 0.5, r.audio.subInput())), test: await render({ fold: true }, (r) => r.tone(5), { from: 0.25 }).then((x) => r3(x.rms)) };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.first.length, 2);
  assert.ok(result.first[0] > 0.3 && result.first[1] < 0.02, `the first wall is on the left (${result.first})`);
  assert.ok(result.last[1] > 0.3 && result.last[0] < 0.02, `the last speaker on the right (${result.last})`);
  assert.ok(Math.abs(result.sub[0] - result.sub[1]) < 1e-3 && result.sub[0] > 0.2, `the sub in both (${result.sub})`);
  assert.ok(result.test[0] > 0.02 && Math.abs(result.test[0] - result.test[1]) < 1e-3, 'the sub\'s test tone too');
});

test('audio graph: the pieces start silent and fade in when the host says so', opt, async () => {
  const { result, errors } = await inUi(`${PRE}
    const src = (r, c) => osc(c, 1000, 0.5, r.audio.wallInput('P2').node);
    return { silent: (await render({}, src, { build: { fadeStart: 0 } })).rms[1],
             faded: (await render({}, (r, c) => { src(r, c); r.fade(1, 100); }, { build: { fadeStart: 0 } })).rms[1] };`);
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.ok(result.silent < 1e-6 && result.faded > 0.3, JSON.stringify(result));
});

test('audio chain: the ring writer worklet puts each logical channel on its own device\'s ring, in order (cross-origin isolated page)', opt, async () => {
  const { result, errors } = await inUi(`
    const { createRing, RingReader } = await import('/js/audio-core.js');
    const { buildRoomAudio } = await import('/js/audio-graph.js');
    const cfg = { channels: 5, map: { P1: [1], P2: [2], P3: [3, 4] }, sub: { channel: 5, crossoverHz: 90 }, wallHighpassHz: 90, master: 1, mute: false, ceilingDb: -2,
      walls: [{ id: 'P1' }, { id: 'P2' }, { id: 'P3' }], fold: false };
    const SEC = 0.25, ctx = new OfflineAudioContext(1, Math.round(48000 * SEC), 48000);
    const room = await buildRoomAudio(ctx, cfg);
    const devs = [{ first: 0, count: 2 }, { first: 2, count: 2 }, { first: 4, count: 2 }]; // three stereo "devices": 6 channels for 5 logical
    const rings = devs.map((d) => createRing(d.count));
    const writer = new AudioWorkletNode(ctx, 'vt-ring-writer', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 5, channelCountMode: 'explicit', channelInterpretation: 'discrete',
      processorOptions: { rings: rings.map((r, k) => ({ sab: r.sab, first: devs[k].first, count: devs[k].count })) } });
    room.output.connect(writer); writer.connect(ctx.destination);
    const o = (hz, target) => { const s = ctx.createOscillator(); s.frequency.value = hz; const g = ctx.createGain(); g.gain.value = 0.3; s.connect(g); g.connect(target); s.start(); };
    o(500, room.audio.wallInput('P1').node); o(1000, room.audio.wallInput('P2').node);
    o(2000, room.audio.wallInput('P3', 0).node); o(3000, room.audio.wallInput('P3', 1).node); o(60, room.audio.subInput());
    await ctx.startRendering();
    const goertzel = (x, hz) => { const w = 2 * Math.PI * hz / 48000, k = 2 * Math.cos(w); let a = 0, b = 0; for (const v of x) { const c = v + k * a - b; b = a; a = c; } return Math.sqrt(a * a + b * b - k * a * b) / x.length * 2; };
    const FREQS = [500, 1000, 2000, 3000, 60], out = { isolated: crossOriginIsolated, chans: [] };
    rings.forEach((r, k) => {
      const rd = new RingReader(r.sab, { target: 128, maxFill: 1e9, dead: 1e9 }), blocks = Array.from({ length: devs[k].count }, () => []);
      const buf = Array.from({ length: devs[k].count }, () => new Float32Array(128));
      for (let i = 0; i < 80; i++) { if (rd.read(buf, 128) !== 'play') break; buf.forEach((b, c) => blocks[c].push(...b)); }
      blocks.forEach((x, c) => { const tail = x.slice(4000); out.chans.push({ device: k, ch: c, n: x.length, mags: FREQS.map((f) => goertzel(tail, f)), max: Math.max(...tail.map(Math.abs)) }); });
    });
    return out;`, { page: '/audio', wait: 'load' });
  assert.ok(result.isolated, 'the audio page is cross-origin isolated: SharedArrayBuffer works');
  assert.equal(result.chans.length, 6);
  const want = [0, 1, 2, 3, 4, null]; // logical channel k carries FREQS[k]; the 6th (no logical channel) is silent
  result.chans.forEach((c, k) => {
    assert.ok(c.n > 5000, `device ${c.device} channel ${c.ch}: frames came out (${c.n})`);
    if (want[k] === null) { assert.ok(c.max < 1e-6, 'an unused device channel is silent'); return; }
    const mag = c.mags[want[k]];
    assert.ok(mag > 0.05, `logical channel ${k + 1} carries its own tone (${mag})`);
    c.mags.forEach((m, f) => { if (f !== want[k]) assert.ok(m < mag / 10, `logical channel ${k + 1}: tone ${f} does not leak (${m} vs ${mag})`); });
  });
  assert.deepEqual(errors, [], errors.join(' | '));
});

test('sound mode of the runtime, against a live engine: a hand lands as a down with wall, u, v and size; params follow the profile', opt, async () => {
  const { result, errors, engine } = await inUi(`
    const { connectExperience } = await import('/experiences/runtime.js');
    const vt = await connectExperience({ sound: true, id: 'tone' });
    const events = [];
    vt.on('touch', (e) => events.push(e));
    const paramEvents = [];
    vt.on('params', (p) => paramEvents.push({ ...p }));
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !events.some((e) => e.type === 'up')) await new Promise((r) => setTimeout(r, 100));
    const out = { walls: vt.walls, closed: vt.closedLoop, params: { ...vt.params }, sink: vt.sink, events: events.slice(0, 40), hands: vt.hands(), keys: [...new Set(events.map((e) => Object.keys(e).sort().join()))] };
    const { cmd } = await import('/js/conn.js');
    await cmd('sound.param', { key: 'depth', value: 7 }).catch((e) => { out.err = e.message; });
    await new Promise((r) => setTimeout(r, 400));
    out.after = { ...vt.params }; out.paramEvents = paramEvents.length;
    vt.dispose();
    return out;`, { setup: async (engine) => { engine.catalog.push({ id: 'tone', name: 'Tone', description: '', kind: 'sound', entry: 'sound.js', dir: os.tmpdir(), params: [{ key: 'depth', label: 'Depth', type: 'number', min: 0, max: 10, step: 1, default: 3, unit: '' }] }); await engine.command('sound.play', { id: 'tone' }); } });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.sink, 'sound');
  assert.deepEqual(result.walls.map((w) => w.id), ['P4', 'P1', 'P2', 'P3']);
  const prof = engine.profile.walls;
  assert.deepEqual(result.walls.map((w) => [w.width, w.height]), prof.map((w) => [w.width, w.height]), 'each wall\'s size in metres, from the profile (a piece maps heights in metres)');
  assert.equal(result.closed, true);
  assert.deepEqual(result.keys.filter((k) => !['size,stroke,type,u,v,wallId'].includes(k)), [], 'every event has the contract\'s shape and nothing else');
  const downs = result.events.filter((e) => e.type === 'down');
  assert.ok(downs.length >= 1, 'the simulated hands land');
  for (const e of result.events) { assert.ok(e.u >= 0 && e.u <= 1 && e.v >= 0 && e.v <= 1, `u, v in 0..1 (${e.u}, ${e.v})`); assert.ok(result.walls.some((w) => w.id === e.wallId)); assert.ok(e.size > 0 && e.size < 1, `size in metres (${e.size})`); }
  assert.equal(result.params.depth, 3, 'the manifest\'s default');
  assert.equal(result.after.depth, 7, 'and the operator\'s value, live');
  assert.ok(result.paramEvents >= 1);
});

test('audio card: faders (no range inputs), Test per channel sends audio.test, the device readout, sound pieces play and stop, Show mode locks the setup', opt, async () => {
  const fakeSound = { id: 'tone', name: 'Tone', description: 'a test piece', kind: 'sound', entry: 'sound.js', dir: os.tmpdir(), params: [{ key: 'depth', label: 'Depth', type: 'number', min: 0, max: 10, step: 1, default: 3, unit: '' }, { key: 'mode', label: 'Mode', type: 'select', options: [['a', 'A'], ['b', 'B']], default: 'a' }] };
  const { result, errors, engine } = await inUi(`
    const v = window.__vt; v.go('experiences');
    await new Promise((r) => setTimeout(r, 500));
    const q = (s) => [...document.querySelectorAll(s)];
    const card = () => document.querySelector('[data-card="audio"]');
    const out = {};
    out.ranges = document.querySelectorAll('input[type=range]').length;
    out.card = !!card();
    out.faders = q('[data-card="audio"] .vfield').map((f) => f.getAttribute('aria-label'));
    out.tests = q('[data-card="audio"] [data-test]').map((b) => [b.dataset.test, b.disabled]);
    out.roles = q('[data-card="audio"] .au-ch .who').map((e) => e.firstChild.textContent);
    out.devices = q('[data-card="audio"] .au-dev').map((e) => e.innerText.replace(/\\s+/g, ' '));
    out.wallRows = q('[data-card="audio"] .au-wall').map((e) => e.dataset.wall);
    card().querySelector('[data-test="2"]').click();
    await new Promise((r) => setTimeout(r, 300));
    out.soundCard = !!document.querySelector('[data-sound="tone"]');
    document.querySelector('[data-sound="tone"] .btn.primary').click();
    await new Promise((r) => setTimeout(r, 500));
    out.params = q('[data-sound="tone"] .vfield').map((f) => f.getAttribute('aria-label'));
    out.selects = q('[data-sound="tone"] select').length;
    out.ranges2 = document.querySelectorAll('input[type=range]').length;
    out.stopLabel = document.querySelector('[data-sound="tone"] .head .btn').innerText;
    return out;`, { setup: async (engine) => {
    engine.catalog.push(fakeSound);
    await engine.command('audio.set', { on: true });
    await engine.command('audio.report', { devices: [{ label: 'DVS Transmit 1-2', channels: 2 }, { label: 'Interface 8 outputs', channels: 8 }, { label: 'Speakers', channels: 2, default: true }], sinks: [], logical: 5, available: 0, fold: true, peakDb: -12, isolated: true });
  } });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.card, true);
  assert.equal(result.ranges, 0, 'no native sliders');
  assert.equal(result.ranges2, 0);
  for (const f of ['Master', 'Crossover', 'Wall high-pass', 'Limiter ceiling']) assert.ok(result.faders.includes(f), `${f} is a VEATION fader (${result.faders})`);
  assert.deepEqual(result.tests.map((t) => t[0]), ['1', '2', '3', '4', '5'], 'a Test per logical channel, the sub\'s included');
  assert.ok(result.tests.every((t) => t[1] === false));
  assert.deepEqual(result.roles, ['Pantalla 4', 'Pantalla 1', 'Pantalla 2', 'Pantalla 3', 'Sub']);
  assert.deepEqual(result.wallRows, ['P4', 'P1', 'P2', 'P3']);
  assert.ok(result.devices.some((d) => /DVS Transmit 1-2.*2 ch/.test(d)) && result.devices.some((d) => /Interface 8 outputs.*8 ch/.test(d)), `the readout lists every device with its channels (${result.devices})`);
  assert.equal(engine.aud.test?.channel, 2, 'Test sent audio.test for that channel');
  assert.equal(result.soundCard, true);
  assert.deepEqual(result.params, ['Depth'], 'the piece\'s parameters are faders');
  assert.equal(result.selects, 1);
  assert.equal(result.stopLabel, 'Stop');
  assert.equal(engine.aud.playing, true);
  assert.equal(engine.profile.audio.sound.id, 'tone');

  const locked = await inUi(`
    const v = window.__vt; v.go('experiences');
    await new Promise((r) => setTimeout(r, 500));
    const card = document.querySelector('[data-card="audio"]');
    return { tests: [...card.querySelectorAll('[data-test]')].map((b) => b.disabled), selects: [...card.querySelectorAll('.au-setup select')].map((s) => s.disabled), chips: [...card.querySelectorAll('.au-chips button')].every((b) => b.disabled),
      master: !card.querySelector('[aria-label="Master"]').closest('.au-setup'), note: card.innerText.includes('Locked in Show mode') };`, { setup: async (e) => { e.catalog.push(fakeSound); await e.command('audio.set', { on: true }); await e.command('app.lock', { locked: true }); } });
  assert.deepEqual(locked.errors, [], locked.errors.join(' | '));
  assert.ok(locked.result.tests.every(Boolean), 'Test is locked in Show mode');
  assert.ok(locked.result.selects.length && locked.result.selects.every(Boolean) && locked.result.chips, 'the setup is locked');
  assert.ok(locked.result.master, 'master is outside the locked setup');
  assert.ok(locked.result.note);
});

test('audio window: a real dropout (the synthesis stalls, the device runs dry) reaches the engine\'s state and its log', opt, async () => {
  const warns = [];
  const { result, errors, engine } = await inUi(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 80 && !(window.__vtAudio?.room?.sinks?.[0]?.state === 'play'); k++) await wait(100);
    const room = window.__vtAudio.room, before = room.sinks[0].underruns;
    await room.synth.suspend(); await wait(400); await room.synth.resume(); // the writer stops: the device's ring runs dry
    await wait(1600);                                                        // a report or two (every 500 ms)
    return { state: room.sinks[0].state, before, after: room.sinks[0].underruns };`,
  { page: '/audio', wait: 'load', setup: async (e) => { e.log = { ...e.log, warn: (m) => warns.push(m) }; await e.command('audio.set', { on: true }); } });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(result.before, 0);
  assert.ok(result.after >= 1, `the device counted the cut (${result.after})`);
  const sinks = engine.aud.report?.sinks || [];
  assert.ok(sinks[0]?.underruns >= 1, `the engine has it, per output (${JSON.stringify(sinks)})`);
  assert.ok(warns.some((m) => /underrun.* on "Default device"/.test(m)), `and it is in the log (${warns.join(' | ')})`);
});

test('audio card: dropouts (underruns) show on the output that had them and in the status line', opt, async () => {
  const D1 = 'DVS Transmit  1-2 (Dante Virtual Soundcard)', D2 = 'DVS Transmit  3-4 (Dante Virtual Soundcard)';
  const report = (a, b) => ({ devices: [{ label: D1, channels: 2 }, { label: D2, channels: 2 }], logical: 4, available: 4, fold: false, peakDb: -18, isolated: true,
    sinks: [{ label: D1, first: 0, count: 2, state: 'play', underruns: a }, { label: D2, first: 2, count: 2, state: 'play', underruns: b }] });
  const { result, errors } = await inUi(`
    const v = window.__vt; v.go('experiences');
    await new Promise((r) => setTimeout(r, 500));
    const card = document.querySelector('[data-card="audio"]');
    return { drops: [...card.querySelectorAll('[data-drop]')].map((e) => [e.dataset.drop, e.textContent.trim(), getComputedStyle(e).color]) };`,
  { setup: async (e) => { await e.command('audio.set', { on: true, devices: [D1, D2] }); await e.command('audio.report', report(0, 3)); } });
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.deepEqual(result.drops.map((d) => d.slice(0, 2)).sort(), [['2', '3 dropouts'], ['total', '· 3 dropouts']], `only the output that had them, and the total (${JSON.stringify(result.drops)})`);
  assert.ok(result.drops.every((d) => d[2] === 'rgb(229, 181, 103)'), 'in amber: it needs attention');
});
