import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../engine/drivers/s2e-protocol.js';
import { fitHomography, fitAffine, apply, poseMatrix, residuals } from '../engine/core/geometry.js';
import { SensorPipeline } from '../engine/core/pipeline.js';
import { WallTracker } from '../engine/core/tracker.js';
import { hungarian } from '../engine/core/filters.js';
import { CalibrationSession, defaultTargets } from '../engine/core/calibration.js';
import { ZoneEngine } from '../engine/core/zones.js';
import { SimWall } from '../engine/sim/world.js';
import { normalizeProfile } from '../engine/profile.js';
import { message, bundles, decode, i } from '../engine/outputs/osc.js';

const hex = (b) => Buffer.from(b).toString('hex').toUpperCase().match(/../g).join(' ');

test('protocol: requests and checksums match the documented examples', () => {
  assert.equal(hex(P.request(P.CMD.STOP)), 'A5 25');
  assert.equal(hex(P.getConf(P.CONF.SCAN_MODE_COUNT)), 'A5 84 04 70 00 00 00 55');
  assert.equal(hex(P.getConf(P.CONF.SCAN_MODE_US_PER_SAMPLE, 0)), 'A5 84 06 71 00 00 00 00 00 56');
  assert.equal(hex(P.getConf(P.CONF.SCAN_MODE_TYPICAL)), 'A5 84 04 7C 00 00 00 59');
  assert.equal(hex(P.motorSpeed(600)), 'A5 A8 02 58 02 55');
  assert.equal(hex(P.motorSpeed(0)), 'A5 A8 02 00 00 0F');
  assert.deepEqual([0, 1, 2, 3].map((m) => P.expressScan(m).at(-1)), [0x22, 0x23, 0x20, 0x21]);
  assert.equal(hex(P.setStaticIp('192.168.11.3', '255.255.255.0', '192.168.11.1')),
    'A5 85 10 C0 CC 01 00 C0 A8 0B 03 FF FF FF 00 C0 A8 0B 01 C0');
});

test('protocol: descriptor parsing', () => {
  const d = P.parseDescriptor(Buffer.from([0xa5, 0x5a, 0x54, 0, 0, 0x40, 0x85]));
  assert.deepEqual(d, { length: 84, mode: 1, type: 0x85 });
  const hq = P.parseDescriptor(Buffer.from([0xa5, 0x5a, 0x0d, 0x03, 0, 0x40, 0x83]));
  assert.deepEqual(hq, { length: 781, mode: 1, type: 0x83 });
});

test('protocol: dense capsule round trip + corruption is detected', () => {
  const dists = Array.from({ length: 40 }, (_, k) => 1000 + k * 7);
  const p = P.buildDense(123.5, true, dists);
  assert.ok(P.denseValid(p));
  assert.deepEqual(P.denseHeader(p), { start: 123.5, sync: true });
  assert.deepEqual(Array.from(P.denseDistances(p)), dists);
  p[40] ^= 0xff;
  assert.ok(!P.denseValid(p));
});

test('protocol: HQ capsule round trip with CRC', () => {
  const nodes = Array.from({ length: 96 }, (_, k) => ({ angle: k * 0.1125, dist: 2000 + k, quality: 100, sync: k === 0 }));
  const p = P.buildHq(123456789, nodes);
  assert.equal(p.length, 781);
  assert.ok(P.hqValid(p));
  const got = [];
  const ts = P.decodeHq(p, (a, d, q, s) => got.push([a, d, q, s]));
  assert.equal(ts, 123456789);
  assert.ok(Math.abs(got[10][0] - 1.125) < 0.01);
  assert.equal(got[10][1], 2010);
  assert.equal(got[0][3], true);
  p[100] ^= 1;
  assert.equal(P.hqValid(p), 0);
});

test('geometry: homography and affine recover known transforms', () => {
  const H = [1.2, 0.1, 3, -0.05, 0.9, 1, 0.01, 0.02, 1];
  const src = [[0, 0], [2, 0], [2, 1.5], [0, 1.5], [1, 0.7], [0.4, 1.1]];
  const dst = src.map(([x, y]) => apply(H, x, y));
  const fit = fitHomography(src, dst);
  assert.ok(residuals(fit, src, dst).rms < 1e-9);
  const A = [0.8, -0.6, 2, 0.6, 0.8, -1, 0, 0, 1];
  const fa = fitAffine(src, src.map(([x, y]) => apply(A, x, y)));
  fa.forEach((v, k) => assert.ok(Math.abs(v - A[k]) < 1e-9));
});

test('hungarian: optimal assignment, rectangular', () => {
  assert.deepEqual(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);
  assert.deepEqual(hungarian([[1, 9], [9, 1], [5, 5]]).slice(0, 2), [0, 1]);
});

function wallSetup(poseErr = { x: 0, y: 0, rotation: 0 }) {
  const wall = { id: 'W', width: 6, height: 3.5, masks: [] };
  const pose = { x: 3, y: 3.8, rotation: -90 };
  const truth = { x: pose.x + poseErr.x, y: pose.y + poseErr.y, rotation: pose.rotation + poseErr.rotation };
  const world = new SimWall(wall, truth, { noiseMm: 3, seed: 7 });
  const sensor = { id: 'S', wallId: 'W', pose, calibration: null };
  const pipe = new SensorPipeline(sensor, wall, {});
  const scanOf = (t) => { const s = world.scan(3200, 0.03); return { sensorId: 'S', t, deviceTs: 0, count: 3200, ...s, hasQuality: true }; };
  // learn the empty room
  let done = false;
  pipe.learnBackground(10, () => { done = true; });
  for (let k = 0; k < 10; k++) pipe.process(scanOf(k * 100));
  assert.ok(done && pipe.bg);
  return { wall, world, sensor, pipe, scanOf };
}

test('pipeline: empty room → no detections; a hand → one detection at the right place', () => {
  const { world, pipe, scanOf } = wallSetup();
  assert.equal(pipe.process(scanOf(2000)).detections.length, 0);
  for (const [x, y] of [[1.0, 0.8], [3.0, 1.5], [5.5, 2.2], [0.4, 0.3]]) {
    world.injected.set('h', { x, y });
    const r = pipe.process(scanOf(2100));
    assert.equal(r.detections.length, 1, `one detection at ${x},${y}`);
    const d = r.detections[0];
    const err = Math.hypot(d.x - x, d.y - y);
    assert.ok(err < 0.015, `error ${(err * 1000).toFixed(1)} mm at ${x},${y}`);
  }
  world.injected.clear();
});

test('pipeline: two hands far apart → two detections; a body-sized object is rejected', () => {
  const { world, pipe, scanOf } = wallSetup();
  world.injected.set('a', { x: 1.5, y: 1.2 });
  world.injected.set('b', { x: 4.5, y: 1.0 });
  assert.equal(pipe.process(scanOf(0)).detections.length, 2);
  world.injected.clear();
  world.injected.set('body', { x: 3, y: 1.2, r: 0.25 });
  const r = pipe.process(scanOf(100));
  assert.equal(r.detections.length, 0);
  assert.equal(r.rejected.length, 1);
});

test('tracker: confirm → down, stable id while moving, up after coast', () => {
  const tr = new WallTracker({ id: 'W' }, {}, { next: 1 });
  const evs = [];
  let t = 0;
  for (let k = 0; k < 10; k++) {
    tr.ingest([{ x: 1 + k * 0.03, y: 1, size: 0.08, n: 10 }], t);
    for (let s = 0; s < 6; s++) { const r = tr.tick(t + s * 16.7); evs.push(...r.events); }
    t += 100;
  }
  const downs = evs.filter((e) => e.type === 'down');
  assert.equal(downs.length, 1);
  const { touches } = tr.tick(t);
  assert.equal(touches.length, 1);
  assert.equal(touches[0].id, downs[0].id);
  assert.ok(touches[0].vx > 0.1, 'moves right');
  const r = tr.tick(t + 500);
  assert.equal(r.events.filter((e) => e.type === 'up').length, 1);
  assert.equal(r.touches.length, 0);
});

test('tracker: a single-revolution blip never becomes a touch', () => {
  const tr = new WallTracker({ id: 'W' }, {}, { next: 1 });
  tr.ingest([{ x: 1, y: 1, size: 0.05, n: 4 }], 0);
  let ev = [];
  for (let t = 0; t < 600; t += 16) ev.push(...tr.tick(t).events);
  assert.equal(ev.length, 0);
});

test('calibration: recovers a 4 cm / 2° mounting error to < 1 cm', () => {
  const { wall, world, sensor, pipe, scanOf } = wallSetup({ x: 0.04, y: -0.03, rotation: 2 });
  // before calibration the measured pose is off
  world.injected.set('h', { x: 1, y: 1 });
  const before = pipe.process(scanOf(0)).detections[0];
  const errBefore = Math.hypot(before.x - 1, before.y - 1);
  assert.ok(errBefore > 0.03, `pose error visible (${(errBefore * 1000).toFixed(0)} mm)`);

  const targets = defaultTargets(wall);
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  let t = 1000;
  for (const tg of targets) {
    world.injected.set('h', { x: tg.x, y: tg.y });
    for (let k = 0; k < 6; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
    world.injected.clear();
    for (let k = 0; k < 8; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
  }
  assert.equal(cal.phase, 'done');
  const r = cal.result.S;
  assert.ok(r.ok, r.error);
  assert.ok(r.rmsMm < 8, `rms ${r.rmsMm} mm`);

  pipe.configure({ ...sensor, calibration: { matrix: r.matrix } }, wall, {});
  for (const [x, y] of [[0.8, 0.6], [3.3, 1.7], [5.2, 1.1]]) {
    world.injected.set('h', { x, y });
    const d = pipe.process(scanOf(t)).detections[0];
    const err = Math.hypot(d.x - x, d.y - y);
    assert.ok(err < 0.01, `after calibration ${(err * 1000).toFixed(1)} mm at ${x},${y}`);
  }
});

test('zones: enter / hold / debounced exit', () => {
  const z = new ZoneEngine();
  z.configure([{ id: 'Z', wallId: 'W', rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, holdMs: 500, releaseMs: 150, enabled: true }]);
  const ev = (touches, t) => z.update({ W: touches }, t).events.map((e) => e.type);
  assert.deepEqual(ev([{ id: 1, x: 0.5, y: 0.5 }], 0), ['enter']);
  assert.deepEqual(ev([{ id: 1, x: 0.5, y: 0.5 }], 600), ['hold']);
  assert.deepEqual(ev([], 650), []);
  assert.deepEqual(ev([{ id: 1, x: 0.5, y: 0.5 }], 700), []); // dropout shorter than releaseMs
  assert.deepEqual(ev([], 800), []);
  assert.deepEqual(ev([], 1000), ['exit']);
});

test('osc: encode/decode round trip, bundles stay below the MTU', () => {
  const m = message('/vt/wall/P1/touch', [i(7), 0.25, 0.5, -0.1, 0, 0.08, 1.5]);
  const [d] = decode(m);
  assert.equal(d.address, '/vt/wall/P1/touch');
  assert.equal(d.args[0], 7);
  assert.ok(Math.abs(d.args[1] - 0.25) < 1e-6);
  const many = Array.from({ length: 80 }, (_, k) => message('/vt/wall/P1/touch', [i(k), 0.1, 0.2, 0, 0, 0.05, 1]));
  const bs = bundles(many);
  assert.ok(bs.length > 1);
  for (const b of bs) assert.ok(b.length <= 1400);
  assert.equal(bs.flatMap((b) => decode(b)).length, 80);
});

test('profile: the XR Lab profile is valid; garbage is clamped, not trusted', () => {
  const x = normalizeProfile(JSON.parse(fs.readFileSync(new URL('../profiles/xrlab.json', import.meta.url))));
  assert.equal(x.walls.length, 4);
  assert.equal(x.sensors.length, 4);
  assert.equal(x.walls.find((w) => w.id === 'P2').pixelRect.w, 1920);
  const g = normalizeProfile({ canvas: { width: -5 }, walls: [{ id: 'bad id!', width: 'x' }], sensors: [{ host: 'evil;rm', port: 99999 }], outputs: [{ prefix: 'nope' }] });
  assert.equal(g.canvas.width, 16);
  assert.equal(g.walls[0].id, 'W1');
  assert.equal(g.walls[0].width, 6);
  assert.equal(g.sensors[0].host, '192.168.11.2');
  assert.equal(g.sensors[0].port, 65535);
  assert.equal(g.outputs[0].prefix, '/vt');
  assert.ok(poseMatrix(x.sensors[0].pose).every(Number.isFinite));
});
