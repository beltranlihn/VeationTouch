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
import { normalizeProfile, wallToCanvas } from '../engine/profile.js';
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

test('calibration: redo the worst point, then verification measures the real tracked error', async () => {
  const { VerifySession, verifyTargets } = await import('../engine/core/calibration.js');
  const { wall, world, sensor, pipe, scanOf } = wallSetup({ x: 0.03, y: 0.02, rotation: -1.5 });
  const targets = defaultTargets(wall);
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  let t = 1000;
  const touchTarget = (x, y) => {
    world.injected.set('h', { x, y });
    for (let k = 0; k < 6; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
    world.injected.clear();
    for (let k = 0; k < 8; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
  };
  targets.forEach((tg, k) => touchTarget(tg.x + (k === 4 ? 0.025 : 0), tg.y)); // target 5 touched 2.5 cm off: not caught by itself
  assert.equal(cal.phase, 'done');
  assert.equal(cal.autoRedo, null);
  const before = cal.result.S.maxMm;
  assert.equal(cal.worstTarget(), 4, 'the sloppy touch is the worst point');
  cal.redoTarget(4);
  assert.equal(cal.phase, 'waiting');
  touchTarget(targets[4].x, targets[4].y);
  assert.equal(cal.phase, 'done', 'back to the result after a single redo');
  assert.ok(cal.result.S.maxMm < before, `worst ${before} → ${cal.result.S.maxMm} mm`);

  pipe.configure({ ...sensor, calibration: { matrix: cal.result.S.matrix } }, wall, {});
  const tr = new WallTracker(wall, {}, { next: 1 });
  const vs = new VerifySession(wall, verifyTargets(wall), { holdMs: 500 });
  for (const v of vs.targets.slice()) {
    world.injected.set('h', { x: v.x, y: v.y });
    for (let k = 0; k < 12; k++) { tr.ingest(pipe.process(scanOf(t)).detections, t); for (let s = 0; s < 6; s++) { vs.feed(tr.tick(t + s * 16).touches, t + s * 16); } t += 100; }
    world.injected.clear();
    for (let k = 0; k < 10; k++) { tr.ingest(pipe.process(scanOf(t)).detections, t); for (let s = 0; s < 6; s++) { vs.feed(tr.tick(t + s * 16).touches, t + s * 16); } t += 100; }
  }
  assert.equal(vs.phase, 'done');
  const sum = vs.summary();
  assert.equal(sum.n, 5);
  assert.ok(sum.maxMm < 15, `verified error mean ${sum.meanMm} / max ${sum.maxMm} mm`);
});

test('calibration: a touch that disagrees with the others is asked again by itself — once — before the result', async () => {
  const { wall, world, pipe, scanOf } = wallSetup({ x: 0.03, y: 0.02, rotation: -1.5 });
  const targets = defaultTargets(wall);
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  let t = 1000;
  const touchTarget = (x, y) => {
    world.injected.set('h', { x, y });
    for (let k = 0; k < 6; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
    world.injected.clear();
    for (let k = 0; k < 8; k++) { cal.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
  };
  // target 1 (a corner) touched 15 cm off — the operator hit the wrong spot
  targets.forEach((tg, k) => touchTarget(tg.x + (k === 0 ? 0.15 : 0), tg.y));
  assert.equal(cal.phase, 'waiting', 'no result yet: that target is asked again');
  assert.equal(cal.index, 0);
  assert.equal(cal.autoRedo?.index, 0);
  assert.ok(cal.autoRedo.errMm > 80, `it was ${cal.autoRedo.errMm} mm away from where the others put it`);
  assert.equal(cal.snapshot(t).autoRedo.index, 0, 'the remote can say why');
  touchTarget(targets[0].x, targets[0].y);
  assert.equal(cal.phase, 'done');
  assert.ok(cal.result.S.maxMm < 10, `after the redo the worst point is ${cal.result.S.maxMm} mm`);

  // the same target wrong again: asked only once, then the result is shown (Redo worst point is still there)
  const cal2 = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  const touch2 = (x, y) => {
    world.injected.set('h', { x, y });
    for (let k = 0; k < 6; k++) { cal2.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
    world.injected.clear();
    for (let k = 0; k < 8; k++) { cal2.feed('S', pipe.process(scanOf(t), { raw: true }).detections, t); t += 100; }
  };
  targets.forEach((tg, k) => touch2(tg.x + (k === 0 ? 0.15 : 0), tg.y));
  touch2(targets[0].x + 0.15, targets[0].y);
  assert.equal(cal2.phase, 'done', 'never a loop');
  assert.equal(cal2.worstTarget(), 0);
});

test('auto-align: recovers the sensor pose from floor + side walls and measures the wall width', async () => {
  const { autoAlign, backgroundPoints } = await import('../engine/core/autoalign.js');
  for (const [err, mirror] of [[{ x: 0.12, y: -0.06, rotation: 6 }, false], [{ x: -0.2, y: 0.04, rotation: -9 }, true]]) {
    const wall = { id: 'W', width: 6.4, height: 3.5, masks: [] };
    const configured = { x: 3.2, y: 3.8, rotation: -90, mirror };
    const truth = { x: configured.x + err.x, y: configured.y + err.y, rotation: configured.rotation + err.rotation, mirror };
    const world = new SimWall(wall, truth, { noiseMm: 4, seed: 11 });
    const pipe = new SensorPipeline({ id: 'S', pose: configured }, wall, {});
    let bg = null;
    pipe.learnBackground(10, (d) => { bg = d; });
    for (let k = 0; k < 10; k++) pipe.process({ sensorId: 'S', t: k, count: 3200, ...world.scan(3200, 0.02), hasQuality: true });
    const r = autoAlign(backgroundPoints(bg, 0.25), configured, wall);
    assert.ok(r.ok, r.error);
    assert.ok(Math.abs(r.pose.x - truth.x) < 0.015, `x ${r.pose.x} vs ${truth.x}`);
    assert.ok(Math.abs(r.pose.y - truth.y) < 0.015, `y ${r.pose.y} vs ${truth.y}`);
    const dr = ((r.pose.rotation - truth.rotation + 540) % 360) - 180;
    assert.ok(Math.abs(dr) < 0.4, `rotation ${r.pose.rotation} vs ${truth.rotation}`);
    assert.equal(r.pose.mirror, mirror);
    assert.ok(r.seen.left && r.seen.right);
    assert.ok(Math.abs(r.measuredWidth - wall.width) < 0.02, `width ${r.measuredWidth}`);
  }
});

test('auto-align: an object standing in the plane near one corner is not taken for that wall (XR Lab P1)', async () => {
  const { autoAlign, backgroundPoints } = await import('../engine/core/autoalign.js');
  const wall = { id: 'W', width: 6.483, height: 3.75, masks: [] };
  const truth = { x: 2.661, y: 3.817, rotation: -90.6, mirror: true };
  const configured = { x: 2.79, y: 3.75, rotation: -90, mirror: true };
  const world = new SimWall(wall, truth, { noiseMm: 4, seed: 9 });
  // a tall vertical thing 1.70 m from the left corner (a truss leg…): it hides most of the left wall from the sensor
  for (let y = 0.05; y <= 3.4; y += 0.04) world.obstacles.push({ x: 1.7, y, r: 0.03 });
  const pipe = new SensorPipeline({ id: 'S', pose: configured }, wall, {});
  let bg = null;
  pipe.learnBackground(10, (d) => { bg = d; });
  for (let k = 0; k < 10; k++) pipe.process({ sensorId: 'S', t: k, count: 3200, ...world.scan(3200, 0.02), hasQuality: true });
  const r = autoAlign(backgroundPoints(bg, 0.25), configured, wall);
  assert.ok(r.ok, r.error);
  assert.equal(r.widthTrusted, false, `the "width" between the object and the right wall (${r.measuredWidth} m) is not offered as the wall width`);
  assert.equal(r.xFrom, 'right wall');
  assert.ok(Math.abs(r.pose.x - truth.x) < 0.03, `x ${r.pose.x} vs ${truth.x} (taken from the object it would be ~0.96)`);
  assert.match(r.xWarn, /not the corner/);
  assert.equal(r.sideFrom, 'approximate pose', 'and it says where left/right came from');
});

test('level check: a parallel plane passes; a plane leaning into the wall is located; masks excuse known objects', async () => {
  const { levelCheck } = await import('../engine/core/levelcheck.js');
  const { backgroundPoints } = await import('../engine/core/autoalign.js');
  const pose = { x: 3.2, y: 3.8, rotation: -90, mirror: false };
  const run = (wall, opts, setup) => {
    const world = new SimWall(wall, pose, { noiseMm: 4, seed: 5, ...opts });
    setup?.(world);
    const pipe = new SensorPipeline({ id: 'S', pose }, wall, {});
    let bg = null;
    pipe.learnBackground(8, (d) => { bg = d; });
    for (let k = 0; k < 8; k++) pipe.process({ sensorId: 'S', t: k, count: 3200, ...world.scan(3200, 0.02), hasQuality: true });
    return levelCheck(backgroundPoints(bg, 0.25), poseMatrix(pose), wall);
  };
  const wall = { id: 'W', width: 6.4, height: 3.5, masks: [] };

  const flat = run(wall, {});
  assert.ok(flat.ok, flat.advice.join(' '));
  assert.equal(flat.grazing.length, 0);
  assert.ok(flat.floorCoverage >= 0.95, `floor ${flat.floorCoverage}`);

  // 0.5° towards the lower left, 2 cm gap at the sensor → the plane meets the wall ≈ 2.3 m away
  const tilted = run(wall, { plane: { gapMm: 20, tiltDeg: 0.5, towardsDeg: -135 } });
  assert.equal(tilted.ok, false);
  assert.ok(tilted.grazing.length > 20, `grazing ${tilted.grazing.length}`);
  assert.match(tilted.grazingRegion.where, /left/);
  assert.ok(Math.abs(tilted.nearestM - 2.29) < 0.15, `nearest ${tilted.nearestM}`);
  assert.ok(tilted.floorCoverage < 0.9 && tilted.floorGaps[0][0] === 0, `floor ${tilted.floorCoverage} gaps ${JSON.stringify(tilted.floorGaps)}`);
  assert.match(tilted.advice[0], /touches the wall on the .*left/);

  // a lamp crossing the plane inside the wall is grazing until it is masked
  const lamp = (w) => { w.obstacles.push({ x: 5.0, y: 2.9, r: 0.08 }); };
  assert.equal(run(wall, {}, lamp).ok, false);
  const masked = run({ ...wall, masks: [{ type: 'rect', x0: 4.8, y0: 2.7, x1: 5.2, y1: 3.1 }] }, {}, lamp);
  assert.ok(masked.ok, masked.advice.join(' '));
  assert.ok(masked.counts.masked > 0);
});

test('pipeline: activity identifies the sensor that sees a waving hand; a still room reads 0', () => {
  const wall = { id: 'W', width: 6, height: 3.5, masks: [] };
  const pose = { x: 3, y: 3.8, rotation: -90 };
  const world = new SimWall(wall, pose, { noiseMm: 4, seed: 3 });
  const pipe = new SensorPipeline({ id: 'S', pose }, wall, {});
  const rev = (k) => pipe.process({ sensorId: 'S', t: k * 100, count: 3200, ...world.scan(3200, 0.02), hasQuality: true });
  for (let k = 0; k < 8; k++) rev(k);
  assert.equal(pipe.activity, 0, 'empty room');
  for (let k = 8; k < 16; k++) { world.injected.set('h', { x: 1.5 + (k % 2) * 0.25, y: 1.4 }); rev(k); } // waving 25 cm
  assert.ok(pipe.activity >= 8, `waving: ${pipe.activity}`);
  for (let k = 16; k < 24; k++) rev(k); // the hand stays still
  assert.equal(pipe.activity, 0, 'a still hand is not activity');
});

test('background: movement during the capture is reported (and where); a clear wall is not', async () => {
  const wall = { id: 'W', width: 6, height: 3.5, masks: [] };
  const pose = { x: 3, y: 3.8, rotation: -90 };
  const capture = (moving) => {
    const world = new SimWall(wall, pose, { noiseMm: 4, seed: 9 });
    const pipe = new SensorPipeline({ id: 'S', pose }, wall, {});
    let res = null;
    pipe.learnBackground(20, (dist, motion) => { res = { dist, motion }; });
    for (let k = 0; k < 20; k++) {
      if (moving) world.injected.set('p', { x: 4.0 + k * 0.03, y: 1.2, r: 0.12 }); // someone drifting along the wall
      pipe.process({ sensorId: 'S', t: k * 100, count: 3200, ...world.scan(3200, 0.02), hasQuality: true });
    }
    return res;
  };
  assert.equal(capture(false).motion, null);
  const m = capture(true).motion;
  assert.ok(m && m.bins >= 4, JSON.stringify(m));
  assert.ok(m.where.some((w) => Math.abs(w.x - 4.3) < 0.6 && Math.abs(w.y - 1.2) < 0.6), `where ${JSON.stringify(m.where)}`);
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

test('zones: polygon and circle shapes, min hands', () => {
  const z = new ZoneEngine();
  z.configure([
    // an L-shaped polygon: the notch (1.5, 1.5) is outside
    { id: 'L', wallId: 'W', shape: 'polygon', points: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], holdMs: 0, releaseMs: 0 },
    { id: 'C', wallId: 'W', shape: 'circle', circle: { x: 4, y: 1, r: 0.5 }, holdMs: 0, releaseMs: 0 },
    { id: 'TWO', wallId: 'W', rect: { x0: 6, y0: 0, x1: 8, y1: 2 }, holdMs: 0, releaseMs: 0, minHands: 2 },
  ]);
  const at = (pts, t) => z.update({ W: pts.map(([x, y], k) => ({ id: k + 1, x, y })) }, t);
  let r = at([[0.5, 1.5], [1.5, 1.5], [4.3, 1.3], [4.45, 1.45], [7, 1]], 0);
  assert.equal(r.counts.L.count, 1, 'notch of the L is outside');
  assert.equal(r.counts.C.count, 1, '(4.45, 1.45) is outside the circle (corner of its box)');
  assert.equal(r.counts.TWO.active, false, 'one hand is not enough');
  assert.deepEqual(r.events.map((e) => e.zoneId).sort(), ['C', 'L']);
  r = at([[7, 1], [7.5, 1.5]], 16);
  assert.deepEqual(r.events.filter((e) => e.zoneId === 'TWO').map((e) => [e.type, e.count]), [['enter', 2]]);
  r = at([[7, 1]], 32);
  assert.deepEqual(r.events.filter((e) => e.zoneId === 'TWO').map((e) => e.type), ['exit'], 'below min hands = exit');
});

test('zones: a canvas zone spans two walls through their mapping', () => {
  const prof = normalizeProfile({
    canvas: { width: 2000, height: 500 },
    walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 1000, h: 500 } },
      { id: 'B', width: 4, height: 2, pixelRect: { x: 1000, y: 0, w: 1000, h: 500 } }],
    zones: [{ id: 'Z', space: 'canvas', wallId: 'A', rect: { x0: 900, y0: 0, x1: 1100, y1: 500 }, holdMs: 0, releaseMs: 0 }],
  });
  const zone = prof.zones[0];
  assert.equal(zone.wallId, null);
  assert.deepEqual(zone.walls, ['A', 'B'], 'covers both walls');
  const z = new ZoneEngine();
  z.configure(prof.zones, prof.walls);
  // A x = 3.8 m → 950 px (inside) · B x = 0.2 m → 1050 px (inside) · A x = 3 m → 750 px (outside)
  const r = z.update({ A: [{ id: 1, x: 3.8, y: 1 }, { id: 3, x: 3, y: 1 }], B: [{ id: 2, x: 0.2, y: 1 }] }, 0);
  assert.deepEqual(r.counts.Z.ids.sort(), [1, 2]);
  assert.equal(r.events[0].wallId, null);
  // without the canvas mapping the same touches would not be inside a wall-metre zone
  const corner = normalizeProfile({ ...prof, walls: prof.walls.map((w) => (w.id === 'B' ? { ...w, mapping: { mode: 'corners', corners: [[1200, 0], [2000, 0], [2000, 500], [1200, 500]] } } : w)) });
  assert.deepEqual(corner.zones[0].walls, ['A'], 'B moved away on the canvas: no longer covered');
});

test('zones: Fire forces enter … exit once, marked as a test', () => {
  const z = new ZoneEngine();
  z.configure([{ id: 'Z', wallId: 'W', rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, holdMs: 0, releaseMs: 100, minHands: 3 }]);
  z.fire('Z', 0, 300);
  const types = [];
  for (let t = 0; t <= 600; t += 50) for (const e of z.update({ W: [] }, t).events) types.push([e.type, e.test === true]);
  assert.deepEqual(types, [['enter', true], ['exit', false]]);
  assert.throws(() => z.fire('nope', 0), /unknown zone/);
});

test('profile: zone and mask shapes are normalised (bounds kept, bad polygons fall back)', () => {
  const p = normalizeProfile({
    walls: [{ id: 'W', width: 6, height: 3, masks: [{ type: 'polygon', points: [[1, 1], [2, 1], [1.5, 2]] }, { type: 'polygon', points: [[0, 0], [1, 1]] }] }],
    zones: [
      { id: 'P', wallId: 'W', shape: 'polygon', points: [[1, 1], [3, 1], [2, 2.5]] },
      { id: 'D', wallId: 'W', shape: 'polygon', points: [[0, 0], [1, 1], [2, 2]] }, // zero area
      { id: 'C', wallId: 'W', shape: 'circle', circle: { x: 2, y: 1, r: 0.25 } },
      { id: 'N', wallId: 'W', minHands: 99 },
    ],
  });
  const [P, D, C, N] = p.zones;
  assert.equal(P.shape, 'polygon');
  assert.deepEqual(P.rect, { x0: 1, y0: 1, x1: 3, y1: 2.5 });
  assert.equal(D.shape, 'rect');
  assert.deepEqual(C.rect, { x0: 1.75, y0: 0.75, x1: 2.25, y1: 1.25 });
  assert.equal(N.minHands, 20);
  assert.equal(N.space, 'wall');
  const [m0, m1] = p.walls[0].masks;
  assert.equal(m0.type, 'polygon');
  assert.equal(m0.x1, 2);
  assert.equal(m1.type, 'rect', 'two points are not a polygon');
});

test('pipeline: a polygon mask drops hands inside it, and only those', () => {
  const { world, pipe, wall } = wallSetup();
  // triangle over the right half: (3, 0) – (6, 0) – (6, 3); (5, 1) is inside, (4, 2.5) and (1, 1) are not
  wall.masks = normalizeProfile({ walls: [{ id: 'W', width: 6, height: 3.5, masks: [{ type: 'polygon', points: [[3, 0], [6, 0], [6, 3]] }] }] }).walls[0].masks;
  pipe.configure(pipe.sensor, wall, {});
  const scanOf = (t) => { const s = world.scan(3200, 0.03); return { sensorId: 'S', t, deviceTs: 0, count: 3200, ...s, hasQuality: true }; };
  const seen = (x, y) => { world.injected.set('h', { x, y }); const n = pipe.process(scanOf(2100)).detections.length; world.injected.clear(); return n; };
  assert.equal(seen(5, 1), 0, 'inside the triangle → masked');
  assert.equal(seen(4, 2.5), 1, 'inside the bounding box but outside the triangle → kept');
  assert.equal(seen(1, 1), 1);
});

test('room plan: walls in strip order wrap clockwise around the room, facing inwards', async () => {
  const { roomPlan } = await import('../engine/core/geometry.js');
  const end = (o) => [o.p0[0] + o.dir[0] * o.width, o.p0[1] + o.dir[1] * o.width];
  const near = (a, b, tol = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  // XR Lab: P4 · P1 · P2 · P3, ordinary 90° corners → a closed rectangle (opposite walls differ by a few cm)
  const prof = normalizeProfile({ walls: [{ id: 'P4', width: 7.33 }, { id: 'P1', width: 6.483 }, { id: 'P2', width: 7.353 }, { id: 'P3', width: 6.411 }] });
  assert.equal(prof.walls[0].turn, 90);
  const plan = roomPlan(prof.walls);
  for (let i = 0; i < 3; i++) assert.ok(near(end(plan[i]), plan[i + 1].p0), `wall ${i + 1} starts where wall ${i} ends`);
  assert.ok(Math.hypot(...end(plan[3]).map((v, k) => v - plan[0].p0[k])) < 0.1, 'the loop closes within a few cm');
  // clockwise seen from above: east, south, west, north
  assert.deepEqual(plan.map((o) => o.dir.map((v) => Math.round(v) + 0)), [[1, 0], [0, -1], [-1, 0], [0, 1]]);
  // every inward normal points at the room centre (the plan is centred on its bounds)
  for (const o of plan) { const mid = [o.p0[0] + o.dir[0] * o.width / 2, o.p0[1] + o.dir[1] * o.width / 2]; assert.ok(-(mid[0] * o.normal[0] + mid[1] * o.normal[1]) > 0, o.id); }
  // drawn closed: the 7 cm mismatch of the measured widths is spread over the walls, every corner meets
  const closed = roomPlan(prof.walls, { close: true });
  for (let i = 0; i < 4; i++) assert.ok(near(end(closed[i]), closed[(i + 1) % 4].p0, 1e-9), `corner ${closed[i].id}→${closed[(i + 1) % 4].id} meets`);
  for (let i = 0; i < 4; i++) assert.ok(Math.hypot(closed[i].p0[0] - plan[i].p0[0], closed[i].p0[1] - plan[i].p0[1]) < 0.08, 'nothing moves more than the mismatch');
  assert.ok(closed.every((o) => Math.abs(Math.hypot(...o.dir) - 1) < 0.01), 'lengths change by less than 1 %');
  const u = roomPlan([{ id: 'A', width: 4 }, { id: 'B', width: 4 }, { id: 'C', width: 4 }], { close: true });
  assert.ok(Math.hypot(...end(u[2]).map((v, k) => v - u[0].p0[k])) > 1, 'a U-shaped set of walls is not forced shut');
  // a 0° corner continues the wall straight on; a 45° corner turns half as much
  const straight = roomPlan([{ id: 'A', width: 2, turn: 0 }, { id: 'B', width: 3 }]);
  assert.deepEqual(straight[1].dir.map((v) => Math.round(v * 1000) / 1000 + 0), [1, 0]);
  const bent = roomPlan([{ id: 'A', width: 2, turn: 45 }, { id: 'B', width: 3 }]);
  assert.ok(near(bent[1].dir, [Math.SQRT1_2, -Math.SQRT1_2], 1e-12));
});

// A hand sliding along wall A, through the corner, along wall B (strip position s, metres), seen by one sensor
// per wall at 10 Hz (unsynchronised); returns everything the room reported, tick by tick (60 Hz).
async function slideAcrossCorner({ walls, speed = 1, y = 1.2, yB = y, useLinker = true, from = 3, to = 7, blind = 0.12 }) {
  const { CornerLinker } = await import('../engine/core/corners.js');
  const prof = normalizeProfile({ walls });
  const [A, B] = prof.walls;
  const ids = { next: 1 };
  const trA = new WallTracker(A, prof.tracking, ids), trB = new WallTracker(B, prof.tracking, ids);
  const linker = new CornerLinker();
  linker.configure(prof.walls);
  if (useLinker) for (const tr of [trA, trB]) tr.confirmNow = (w, t) => linker.shouldConfirm(w, t);
  const W = A.width, seen = { down: [], up: [], cross: [], frames: [] };
  const sAt = (t) => from + speed * (t / 1000);
  const end = ((to - from) / speed) * 1000 + 600;
  for (let t = 0; t <= end; t += 1000 / 60) {
    const s = sAt(t), moving = s <= to;
    // sensor A every 100 ms, sensor B every 100 ms shifted by 37 ms; each sees the part of the hand on its wall
    // `blind` m each side of the corner neither sensor sees the hand (edge margins, the two scan planes)
    if (Math.floor(t / 100) !== Math.floor((t - 1000 / 60) / 100)) trA.ingest(moving && s <= W - blind ? [{ x: s, y, size: 0.08, n: 6 }] : [], t);
    if (Math.floor((t - 37) / 100) !== Math.floor((t - 37 - 1000 / 60) / 100)) trB.ingest(moving && s >= W + blind ? [{ x: s - W, y: yB, size: 0.08, n: 6 }] : [], t);
    const ra = trA.tick(t), rb = trB.tick(t);
    const raw = [...ra.touches, ...rb.touches], ev = [...ra.events, ...rb.events];
    const r = useLinker ? linker.update(raw, ev, t) : { touches: raw, events: ev };
    for (const e of r.events) seen[e.type].push(e);
    seen.frames.push(r.touches.map((q) => ({ id: q.id, wallId: q.wallId, s: q.wallId === A.id ? q.x : W + q.x, truth: moving ? s : null })));
  }
  return seen;
}

for (const [speed, blind] of [[1, 0.12], [0.5, 0.12], [1.5, 0.12], [1, 0]]) test(`corners: a hand sliding across a joined corner stays ONE touch (${speed} m/s, ${blind * 200} cm blind)`, async () => {
  const walls = [{ id: 'A', width: 6, height: 3, joinNext: true }, { id: 'B', width: 6, height: 3 }];
  const r = await slideAcrossCorner({ walls, speed, blind });
  assert.equal(r.down.length, 1, `downs: ${r.down.length}`);
  assert.equal(r.up.length, 1, `ups: ${r.up.length}`);
  assert.deepEqual(r.cross.map((e) => [e.from, e.to, e.fromX]), [['A', 'B', 6]], JSON.stringify(r.cross));
  const ids = new Set(r.frames.flat().map((q) => q.id));
  assert.deepEqual([...ids], [r.down[0].id], 'one id from start to end');
  assert.ok(r.frames.every((f) => f.length <= 1), 'never two touches for one hand');
  // at the corner it must behave like anywhere else on a wall: same lag (± 3 cm), steps no bigger than twice the
  // normal 10 Hz steps, never a frame without the touch
  const m = { stepFar: 0, stepCorner: 0, lagFar: 0, lagCorner: 0, holes: 0 };
  for (let k = 1; k < r.frames.length; k++) {
    const a = r.frames[k - 1][0], b = r.frames[k][0];
    const truth = b?.truth ?? null;
    if (!b) { if (a?.truth != null) m.holes++; continue; }
    if (truth == null || !a) continue;
    const near = Math.abs(truth - 6) < 0.4, far = truth > 4 && truth < 5.5;
    const step = Math.abs(b.s - a.s), lag = Math.abs(truth - b.s);
    if (near) { m.stepCorner = Math.max(m.stepCorner, step); m.lagCorner = Math.max(m.lagCorner, lag); }
    if (far) { m.stepFar = Math.max(m.stepFar, step); m.lagFar = Math.max(m.lagFar, lag); }
  }
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  assert.equal(m.holes, 0, 'no frame without the touch while the hand moves');
  assert.ok(m.lagCorner <= m.lagFar + 0.03, `lag at the corner ${cm(m.lagCorner)} vs ${cm(m.lagFar)} on the wall`);
  assert.ok(m.stepCorner <= Math.max(0.09, 2 * m.stepFar), `step at the corner ${cm(m.stepCorner)} vs ${cm(m.stepFar)} on the wall`);
  // the linker is what makes it continuous: without it the same slide is two touches
  const plain = await slideAcrossCorner({ walls, speed, blind, useLinker: false });
  assert.equal(plain.down.length, 2);
});

test('corners: a hand lifted near a corner (still) ends at once; one heading into it ends after the bridge', async () => {
  const { CornerLinker } = await import('../engine/core/corners.js');
  const L = new CornerLinker();
  L.configure(normalizeProfile({ walls: [{ id: 'A', width: 6, joinNext: true }, { id: 'B', width: 6 }] }).walls);
  const touch = (vx, seenMs) => ({ id: 1, wallId: 'A', x: 5.9, y: 1, vx, vy: 0, size: 0.08, seenMs, coasting: seenMs > 150 });
  // still hand near the corner: up the tick its track ends
  L.update([touch(0, 0)], [{ type: 'down', id: 1, wallId: 'A', x: 5.9, y: 1, t: 0 }], 0);
  let r = L.update([], [{ type: 'up', id: 1 }], 300);
  assert.deepEqual(r.events.map((e) => e.type), ['up']);
  // moving into the corner at 1 m/s: carried across (a cross), then up when the bridge runs out
  L.update([{ ...touch(1, 0), id: 2 }], [{ type: 'down', id: 2, wallId: 'A', x: 5.9, y: 1, t: 1000 }], 1000);
  const types = [];
  for (let t = 1100; t <= 1700; t += 50) for (const e of L.update(t < 1250 ? [{ ...touch(1, t - 1000), id: 2 }] : [], [], t).events) types.push(e.type);
  assert.deepEqual(types, ['cross', 'up']);
});

test('corners: review fixes — same-wall hands, no flicker at the corner, no outward phantom, prediction, renamed walls', async () => {
  const { CornerLinker } = await import('../engine/core/corners.js');
  const walls = [{ id: 'A', width: 6, joinNext: true }, { id: 'B', width: 6, joinNext: true }];
  const T = (id, wallId, x, o = {}) => ({ id, wallId, x, y: 1.2, vx: 0, vy: 0, size: 0.08, seenMs: 0, coasting: false, ...o });
  const down = (id, wallId, x, t) => ({ type: 'down', id, wallId, x, y: 1.2, t });
  // 1. a second hand on the SAME wall near the corner is its own touch (no instant confirm, no merge)
  let L = new CornerLinker(); L.configure(walls);
  L.update([T(1, 'A', 5.85)], [down(1, 'A', 5.85, 0)], 0);
  L.update([T(1, 'A', 5.85)], [], 16);
  assert.equal(L.shouldConfirm('A', { x: 5.95, y: 1.3, vx: 0, vy: 0 }), false);
  let r = L.update([T(1, 'A', 5.85), T(2, 'A', 5.95)], [down(2, 'A', 5.95, 33)], 33);
  assert.deepEqual(r.touches.map((t) => t.id).sort(), [1, 2]);
  assert.deepEqual(r.events.map((e) => [e.type, e.id]), [['down', 2]]);
  // 2. a hand resting IN the corner, seen alternately by both sensors: it stays on one wall, no cross flicker
  L = new CornerLinker(); L.configure(walls);
  L.update([T(1, 'A', 5.97)], [down(1, 'A', 5.97, 0)], 0);
  L.update([T(1, 'A', 5.97), T(2, 'B', 0.03, { seenMs: 50 })], [down(2, 'B', 0.03, 16)], 16);
  let crosses = 0;
  for (let t = 33; t < 2000; t += 16.7) {
    const k = Math.floor(t / 50) % 2; // the two sensors take turns being the freshest
    crosses += L.update([T(1, 'A', 5.97, { seenMs: k ? 45 : 0 }), T(2, 'B', 0.03, { seenMs: k ? 0 : 45 })], [], t).events.filter((e) => e.type === 'cross').length;
  }
  assert.equal(crosses, 0, `${crosses} cross events for a hand that did not move`);
  // 3. a hand lifted while moving AWAY from the corner ends with its track (no phantom carried outwards)
  L = new CornerLinker(); L.configure(walls);
  L.update([T(1, 'B', 0.1, { vx: 0.5 })], [down(1, 'B', 0.1, 0)], 0);
  L.update([T(1, 'B', 0.11, { vx: 0.5 })], [], 20);
  r = L.update([], [{ type: 'up', id: 1 }], 260);
  assert.deepEqual(r.events.map((e) => e.type), ['up']);
  // 8. while the other wall still sees the hand, a single detection near the corner is not confirmed at once
  L = new CornerLinker(); L.configure(walls);
  L.update([T(1, 'A', 5.9, { vx: 1 })], [down(1, 'A', 5.9, 0)], 0);
  assert.equal(L.shouldConfirm('B', { x: 0.05, y: 1.2, vx: 0, vy: 0 }), false, 'A is fresh');
  L.update([T(1, 'A', 5.9, { vx: 1, seenMs: 150, coasting: true })], [], 150);
  assert.equal(L.shouldConfirm('B', { x: 0.05, y: 1.2, vx: 0, vy: 0 }), true, 'nobody sees it: bridge the gap');
  // 4. the trackers' prediction is not counted twice: with predictMs 0 a stale reading is carried from 0 ms
  const carried = (predictMs) => {
    const C = new CornerLinker(); C.configure(walls); C.setTracking({ cornerZone: 0.25, predictMs });
    C.update([T(1, 'A', 5.8, { vx: 1 })], [down(1, 'A', 5.8, 0)], 0);
    let o; for (let t = 10; t <= 400; t += 10) o = C.update([T(1, 'A', 5.8, { vx: 1, seenMs: Math.min(t, 100) })], [], t).touches[0];
    return o.x;
  };
  assert.ok(carried(0) - carried(60) > 0.05, `predictMs 0 carries ${carried(0).toFixed(3)} vs ${carried(60).toFixed(3)}`);
  // 7. a corner that stops existing (wall renamed) never yields NaN
  L = new CornerLinker(); L.configure(walls);
  L.update([T(1, 'A', 5.9, { vx: 1 })], [down(1, 'A', 5.9, 0)], 0);
  L.update([T(1, 'A', 5.92, { vx: 1 })], [], 16);
  L.configure([{ id: 'A2', width: 6, joinNext: true }, { id: 'B', width: 6, joinNext: true }]);
  r = L.update([], [{ type: 'up', id: 1 }], 33); // its track is gone with the old wall: nothing left to carry
  assert.ok([...r.touches, ...r.events].every((t) => Number.isFinite(t.x) && Number.isFinite(t.y)), JSON.stringify(r));
});

test('corners: not linked when the walls are not joined, or the hands are at different heights', async () => {
  const sep = await slideAcrossCorner({ walls: [{ id: 'A', width: 6, height: 3, joinNext: false }, { id: 'B', width: 6, height: 3 }] });
  assert.equal(sep.down.length, 2);
  assert.equal(sep.cross.length, 0);
  const other = await slideAcrossCorner({ walls: [{ id: 'A', width: 6, height: 3, joinNext: true }, { id: 'B', width: 6, height: 3 }], y: 0.8, yB: 1.9 });
  assert.equal(other.down.length, 2, 'two people at different heights are two touches');
  const { CornerLinker } = await import('../engine/core/corners.js');
  const L = new CornerLinker();
  L.configure(normalizeProfile({ walls: [{ id: 'P4', width: 7.33 }, { id: 'P1', width: 6.483 }, { id: 'P2', width: 7.353 }, { id: 'P3', width: 6.411 }] }).walls);
  assert.deepEqual(L.joins(), [['P4', 'P1'], ['P1', 'P2'], ['P2', 'P3'], ['P3', 'P4']], 'a closed room also joins the last corner');
  L.configure(normalizeProfile({ walls: [{ id: 'A', width: 4, joinNext: true }, { id: 'B', width: 4, joinNext: true }, { id: 'C', width: 4, joinNext: true }] }).walls);
  assert.deepEqual(L.joins(), [['A', 'B'], ['B', 'C']], 'a U-shaped set of walls does not close');
  // by default only a closed room is joined: walls that just follow each other in the list stay independent
  const def = (walls) => normalizeProfile({ walls }).walls.map((w) => w.joinNext);
  assert.deepEqual(def([{ id: 'P4', width: 7.33 }, { id: 'P1', width: 6.483 }, { id: 'P2', width: 7.353 }, { id: 'P3', width: 6.411 }]), [true, true, true, true]);
  assert.deepEqual(def([{ id: 'A', width: 4 }, { id: 'B', width: 4 }]), [false, false]);
  assert.deepEqual(def([{ id: 'A', width: 4, joinNext: true }, { id: 'B', width: 4 }]), [true, false], 'an explicit choice is kept');
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

test('mapping: rect mode is unchanged; corner pin hits the corners and stays projective', () => {
  const base = { canvas: { width: 3840, height: 2400 }, walls: [{ id: 'A', width: 6, height: 3, pixelRect: { x: 100, y: 200, w: 1600, h: 800 } }] };
  const rect = normalizeProfile(base).walls[0];
  assert.equal(rect.mapping.mode, 'rect');
  assert.deepEqual(wallToCanvas(rect, 0, 3), [100, 200]);
  assert.deepEqual(wallToCanvas(rect, 3, 1.5), [900, 600]);
  const corners = [[120, 210], [1690, 190], [1720, 1010], [90, 990]];
  const cw = normalizeProfile({ ...base, walls: [{ ...base.walls[0], mapping: { mode: 'corners', corners } }] }).walls[0];
  const near = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${a} vs ${b}`);
  near(wallToCanvas(cw, 0, 3), corners[0]);   // top-left of the wall
  near(wallToCanvas(cw, 6, 3), corners[1]);
  near(wallToCanvas(cw, 6, 0), corners[2]);
  near(wallToCanvas(cw, 0, 0), corners[3]);
  assert.deepEqual(cw.pixelRect, { x: 90, y: 190, w: 1630, h: 820 }); // bounding box for old clients
  // a straight line on the wall stays straight in the canvas (homography, not bilinear)
  const [a, b, c] = [wallToCanvas(cw, 0, 1), wallToCanvas(cw, 3, 1), wallToCanvas(cw, 6, 1)];
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  assert.ok(Math.abs(cross) < 1e-6);
});

test('mapping: grid warp — built from a rect it is identical; inserting rows/columns keeps the map; nodes move it', async () => {
  const { gridFrom, gridInsert, gridMap } = await import('../engine/core/geometry.js');
  const base = { canvas: { width: 3840, height: 2400 }, walls: [{ id: 'A', width: 6, height: 3, pixelRect: { x: 100, y: 200, w: 1600, h: 800 } }] };
  const rect = normalizeProfile(base).walls[0];
  let g = gridFrom((u, v) => wallToCanvas(rect, u * 6, (1 - v) * 3), 3, 3);
  const gw = normalizeProfile({ ...base, walls: [{ ...base.walls[0], mapping: { mode: 'grid', ...g } }] }).walls[0];
  assert.equal(gw.mapping.mode, 'grid');
  for (const [x, y] of [[0, 0], [1.3, 2.2], [6, 3], [4.9, 0.4]]) {
    const a = wallToCanvas(rect, x, y), b = wallToCanvas(gw, x, y);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2, `grid ≠ rect at ${x},${y}`);
  }
  const g2 = gridInsert(g, 'u', 0.3);
  assert.equal(g2.us.length, 4);
  for (const [u, v] of [[0.1, 0.2], [0.31, 0.9], [0.77, 0.5]]) {
    const a = gridMap(g, u, v), b = gridMap(g2, u, v);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2);
  }
  g = { ...g, points: g.points.map((p) => p.slice()) };
  g.points[4] = [g.points[4][0] + 40, g.points[4][1]]; // move the centre node 40 px right
  const c = gridMap(g, 0.5, 0.5);
  assert.ok(Math.abs(c[0] - (100 + 800 + 40)) < 0.2, `centre follows the node: ${c}`);
  // invalid grids fall back to rect instead of breaking the room
  const bad = normalizeProfile({ ...base, walls: [{ ...base.walls[0], mapping: { mode: 'grid', us: [0, 1], vs: [0, 1], points: [[0, 0]] } }] }).walls[0];
  assert.equal(bad.mapping.mode, 'rect');
});

test('texture: touches become discs at their canvas pixel; the trail fades', async () => {
  const { TextureRenderer } = await import('../engine/outputs/texture.js');
  const prof = normalizeProfile({ canvas: { width: 400, height: 200 }, walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }] });
  const wall = prof.walls[0];
  const r = new TextureRenderer();
  r.configure({ scale: 1, radius: 0.1, softness: 0, trailMs: 0 }, prof);
  r.render([{ wall, touches: [{ x: 1, y: 1.5 }] }], 16);    // → pixel (100, 50), radius 10 px
  const at = (x, y) => r.mask[y * r.w + x];
  assert.equal(at(100, 50), 255);
  assert.equal(at(108, 50), 255);
  assert.equal(at(115, 50), 0);
  assert.equal(at(300, 150), 0);
  assert.equal(r.rgba[(50 * r.w + 100) * 4 + 3], 255);
  r.configure({ scale: 1, radius: 0.1, softness: 0, trailMs: 200 }, prof);
  r.render([{ wall, touches: [] }], 200);                     // one time constant later
  assert.ok(at(100, 50) > 80 && at(100, 50) < 110, `trail ≈ 255/e, got ${at(100, 50)}`);
});

test('outputs: Triggers send 1 on enter, 0 on exit, hold and count changes', async () => {
  const dgram = await import('node:dgram');
  const { OutputManager } = await import('../engine/outputs/outputs.js');
  const rx = dgram.createSocket('udp4');
  await new Promise((r) => rx.bind(0, '127.0.0.1', r));
  const got = [];
  rx.on('message', (m) => got.push(...decode(m).map((x) => `${x.address} ${x.args.join(' ')}`)));
  const prof = normalizeProfile({
    walls: [{ id: 'W', width: 4, height: 3 }],
    zones: [{ id: 'Z1', name: 'Big Door', wallId: 'W', rect: { x0: 0, y0: 0, x1: 1, y1: 1 } }, { id: 'Z2', name: 'x', address: '/layer1/clip3', wallId: 'W' }],
    outputs: [{ id: 'T', type: 'triggers', port: rx.address().port }],
  });
  const om = new OutputManager({ warn() {} });
  om.configure(prof);
  const frame = (zoneEvents, zoneCounts) => ({ seq: 1, t: 0, walls: [], events: [], zoneEvents, zoneCounts, roomCount: 0, burst: 0 });
  om.send(frame([{ type: 'enter', zoneId: 'Z1', wallId: 'W', count: 1 }], { Z1: { count: 1 }, Z2: { count: 0 } }), 1000);
  om.send(frame([{ type: 'hold', zoneId: 'Z1', wallId: 'W', count: 1 }, { type: 'enter', zoneId: 'Z2', wallId: 'W', count: 2 }], { Z1: { count: 1 }, Z2: { count: 2 } }), 2000);
  om.send(frame([{ type: 'exit', zoneId: 'Z1', wallId: 'W', count: 0 }], { Z1: { count: 0 }, Z2: { count: 2 } }), 3000);
  await new Promise((r) => setTimeout(r, 150));
  om.close(); rx.close();
  for (const want of ['/big-door 1', '/big-door/count 1', '/big-door/hold 1', '/layer1/clip3 1', '/layer1/clip3/count 2', '/big-door 0', '/big-door/count 0']) {
    assert.ok(got.includes(want), `missing "${want}" in ${JSON.stringify(got)}`);
  }
  assert.equal(got.filter((g) => g === '/layer1/clip3/count 2').length, 1, 'count only on change');
});

test('outputs: Art-Net puts each zone on its DMX channel (255 while active), on change + 1 s keep-alive', async () => {
  const dgram = await import('node:dgram');
  const { OutputManager } = await import('../engine/outputs/outputs.js');
  const { parseArtDmx } = await import('../engine/outputs/artnet.js');
  const rx = dgram.createSocket('udp4');
  await new Promise((r) => rx.bind(0, '127.0.0.1', r));
  const got = [];
  rx.on('message', (m) => got.push(parseArtDmx(m)));
  const prof = normalizeProfile({
    walls: [{ id: 'W', width: 4, height: 3 }, { id: 'V', width: 4, height: 3 }],
    zones: [{ id: 'Z1', wallId: 'W' }, { id: 'Z2', wallId: 'V' }, { id: 'Z3', wallId: 'W' }],
    outputs: [{ id: 'A', type: 'artnet', host: '127.0.0.1', port: rx.address().port, universe: 0x123, channel: 10, walls: ['W'] }],
  });
  assert.equal(prof.outputs[0].rateHz, 30);
  const om = new OutputManager({ warn() {} });
  om.configure(prof);
  const frame = (counts) => ({ seq: 1, t: 0, walls: [], events: [], zoneEvents: [], zoneCounts: counts, roomCount: 0, burst: 0 });
  const off = { Z1: { count: 0, active: false }, Z2: { count: 0, active: false }, Z3: { count: 0, active: false } };
  om.send(frame(off), 1000);                                              // first state
  om.send(frame(off), 1040);                                              // unchanged → nothing
  om.send(frame({ ...off, Z3: { count: 1, active: true } }), 1080);      // Z3 on → channel 11
  om.send(frame({ ...off, Z2: { count: 2, active: true } }), 1120);      // Z2 is on wall V: out of scope → Z3 off again
  om.send(frame(off), 2200);                                              // keep-alive after 1 s
  await new Promise((r) => setTimeout(r, 150));
  om.close(); rx.close();
  assert.equal(got.length, 4, `packets ${got.length}`);
  assert.ok(got.every((p) => p && p.version === 14 && p.portAddress === 0x123 && p.data.length === 12));
  assert.deepEqual(got.map((p) => [p.data[9], p.data[10]]), [[0, 0], [0, 255], [0, 0], [0, 0]]);
  assert.deepEqual(got.map((p) => p.sequence), [1, 2, 3, 4]);
});

test('outputs: a corner crossing is /vt/cross where both walls are carried, up / down where only one is', async () => {
  const dgram = await import('node:dgram');
  const { OutputManager } = await import('../engine/outputs/outputs.js');
  const rx = dgram.createSocket('udp4');
  await new Promise((r) => rx.bind(0, '127.0.0.1', r));
  const got = [];
  rx.on('message', (m) => { for (const d of decode(m)) got.push(d); });
  const port = rx.address().port;
  const prof = normalizeProfile({
    walls: [{ id: 'A', width: 4, height: 2, joinNext: true }, { id: 'B', width: 4, height: 2 }],
    outputs: [{ id: 'all', type: 'osc', host: '127.0.0.1', port }, { id: 'onlyA', type: 'osc', host: '127.0.0.1', port, prefix: '/a', walls: ['A'] }, { id: 'onlyB', type: 'osc', host: '127.0.0.1', port, prefix: '/b', walls: ['B'] }],
  });
  const om = new OutputManager({ warn() {} });
  om.configure(prof);
  const [A, B] = prof.walls;
  om.send({ seq: 1, t: 0, walls: [{ wall: A, touches: [] }, { wall: B, touches: [] }], zoneEvents: [], zoneCounts: {}, roomCount: 1, burst: 0,
    events: [{ type: 'cross', id: 7, from: 'A', to: 'B', wallId: 'B', x: 0.05, y: 1, fromX: 4, duration: 2.5, t: 0 }] }, 5000);
  await new Promise((r) => setTimeout(r, 120));
  om.close(); rx.close();
  const find = (a) => got.find((d) => d.address === a);
  assert.deepEqual(find('/vt/cross')?.args, [7, 'A', 'B']);
  const up = find('/a/wall/A/up'), down = find('/b/wall/B/down');
  assert.ok(up && down, got.map((d) => d.address).join(' '));
  assert.equal(up.args[0], 7); assert.ok(Math.abs(up.args[1] - 1) < 1e-6, 'left at the right edge of A (u = 1)'); assert.ok(Math.abs(up.args[3] - 2.5) < 1e-6);
  assert.equal(down.args[0], 7); assert.ok(Math.abs(down.args[1] - 0.0125) < 1e-6);
  assert.equal(got.filter((d) => /\/(up|down)$/.test(d.address) && d.address.startsWith('/vt/')).length, 0, 'the room-wide output sees no up / down');
});

test('outputs: sACN (E1.31) sends the zone channels with valid layer lengths, a stable CID and a wrapping sequence', async () => {
  const dgram = await import('node:dgram');
  const { OutputManager } = await import('../engine/outputs/outputs.js');
  const { parseSacn, sacnPacket, sacnGroup } = await import('../engine/outputs/sacn.js');
  // the packet layout itself: 126-byte header, flags 0x7 + lengths that count to the end of the packet
  const raw = sacnPacket({ universe: 7, sequence: 255, cid: Buffer.alloc(16, 0xab), priority: 150 }, new Uint8Array([1, 2, 3, 4]));
  assert.equal(raw.length, 130);
  assert.equal(raw.readUInt16BE(16) >> 12, 0x7);
  const p0 = parseSacn(raw);
  assert.deepEqual([p0.rootLength, p0.framingLength, p0.dmpLength], [130 - 16, 130 - 38, 130 - 115]);
  assert.deepEqual([p0.universe, p0.priority, p0.sequence, p0.startCode, [...p0.data]], [7, 150, 255, 0, [1, 2, 3, 4]]);
  assert.equal(p0.source, 'VEATION Touch');
  assert.equal(sacnGroup(0x1234), '239.255.18.52');
  // through the output manager, unicast to a local receiver
  const rx = dgram.createSocket('udp4');
  await new Promise((r) => rx.bind(0, '127.0.0.1', r));
  const got = [];
  rx.on('message', (m) => got.push(parseSacn(m)));
  const prof = normalizeProfile({
    walls: [{ id: 'W', width: 4, height: 3 }],
    zones: [{ id: 'Z1', wallId: 'W' }, { id: 'Z2', wallId: 'W' }],
    outputs: [{ id: 'S', type: 'sacn', host: '127.0.0.1', port: rx.address().port, universe: 9, channel: 3 }],
  });
  assert.equal(normalizeProfile({ outputs: [{ type: 'sacn', universe: 0 }] }).outputs[0].universe, 1, 'universe 0 is not valid in sACN');
  assert.equal(normalizeProfile({ outputs: [{ type: 'sacn' }] }).outputs[0].host, 'multicast');
  const om = new OutputManager({ warn() {} });
  om.configure(prof);
  const frame = (z2) => ({ seq: 1, t: 0, walls: [], events: [], zoneEvents: [], zoneCounts: { Z1: { active: false }, Z2: { active: z2 } }, roomCount: 0, burst: 0 });
  om.send(frame(false), 1000);
  om.send(frame(true), 1040);
  await new Promise((r) => setTimeout(r, 120));
  om.close(); rx.close();
  assert.equal(got.length, 2);
  assert.ok(got.every((q) => q && q.universe === 9 && q.priority === 100 && q.cid.equals(got[0].cid)));
  assert.deepEqual(got.map((q) => [q.data[2], q.data[3]]), [[0, 0], [0, 255]], 'Z1 → ch 3, Z2 → ch 4');
  assert.deepEqual(got.map((q) => q.sequence), [0, 1]);
});

test('outputs: Webhook POSTs zone events as JSON, in order; a dead endpoint is an error, not a stall', async () => {
  const http = await import('node:http');
  const { OutputManager } = await import('../engine/outputs/outputs.js');
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => { bodies.push(JSON.parse(b)); setTimeout(() => { res.writeHead(204); res.end(); }, bodies.length === 1 ? 60 : 0); }); // first reply slow
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const prof = normalizeProfile({
    walls: [{ id: 'W', width: 4, height: 3 }],
    zones: [{ id: 'Z1', name: 'Big Door', wallId: 'W' }],
    outputs: [{ id: 'H', type: 'webhook', url: `http://127.0.0.1:${srv.address().port}/hook` }, { id: 'D', type: 'webhook', url: 'http://127.0.0.1:9/dead' }, { id: 'X', type: 'webhook', url: 'file:///etc/passwd' }],
  });
  assert.equal(prof.outputs[2].url, '', 'only http(s) URLs');
  const om = new OutputManager({ warn() {} });
  om.configure(prof);
  const frame = (zoneEvents) => ({ seq: 1, t: 0, walls: [], events: [], zoneEvents, zoneCounts: {}, roomCount: 1, burst: 0 });
  om.send(frame([{ type: 'enter', zoneId: 'Z1', wallId: 'W', count: 1 }]), 1000);
  om.send(frame([{ type: 'exit', zoneId: 'Z1', wallId: 'W', count: 0, duration: 1.5 }]), 1016);
  for (let k = 0; k < 40 && bodies.length < 2; k++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 200));
  const snap = om.snapshot();
  om.close(); srv.close();
  assert.deepEqual(bodies.map((b) => b.event), ['enter', 'exit'], 'in order despite the slow first reply');
  assert.deepEqual(bodies[0].zone, { id: 'Z1', name: 'Big Door', wallId: 'W', walls: ['W'], address: '/big-door' });
  assert.equal(bodies[1].duration, 1.5);
  assert.equal(snap.H.sent, 2);
  assert.ok(snap.D.errors >= 1, `dead endpoint: ${JSON.stringify(snap.D)}`);
  assert.match(snap.D.lastError, /port blocked/); // port 9 is on fetch's blocked list: say so, not "fetch failed"
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

test('texture: the UI preview and the NDI output are the same rasteriser; "follows the touch" grows the disc', async () => {
  const { TextureRenderer } = await import('../engine/outputs/texture.js');
  const { TouchMask, discRadiusM } = await import('../engine/core/mask.js');
  const prof = normalizeProfile({ canvas: { width: 400, height: 200 }, walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }] });
  const wall = prof.walls[0];
  const touches = [{ x: 1, y: 1.5, size: 0.06 }, { x: 3, y: 0.5, size: 0.5 }];
  const o = { scale: 0.5, radius: 0.1, softness: 0.4, trailMs: 0, sizeMode: 'fixed' };
  const r = new TextureRenderer();
  r.configure(o, prof);
  r.render([{ wall, touches }], 16);
  const m = new TouchMask();
  m.resize(200, 100);
  m.render([{ wall, touches }], o, 0.5, 16);
  assert.deepEqual(Buffer.from(m.mask), Buffer.from(r.mask), 'the preview mask is the output mask, pixel for pixel');
  // follows the touch: never below the radius, half the measured width above it
  assert.equal(discRadiusM({ radius: 0.1, sizeMode: 'touch' }, { size: 0.06 }), 0.1);
  assert.equal(discRadiusM({ radius: 0.1, sizeMode: 'touch' }, { size: 0.5 }), 0.25);
  assert.equal(discRadiusM({ radius: 0.1, sizeMode: 'fixed' }, { size: 0.5 }), 0.1);
  const lit = (sizeMode) => {
    const t = new TouchMask(); t.resize(400, 200);
    t.render([{ wall, touches: [{ x: 3, y: 0.5, size: 0.5 }] }], { ...o, softness: 0, sizeMode }, 1, 16);
    return t.mask.reduce((n, v) => n + (v > 0), 0);
  };
  assert.ok(lit('touch') > lit('fixed') * 5, `a 50 cm body makes a bigger disc (${lit('touch')} vs ${lit('fixed')} px)`);
  assert.equal(normalizeProfile({ output: {}, outputs: [{ type: 'texture', sizeMode: 'touch' }] }).outputs[0].sizeMode, 'touch');
  assert.equal(normalizeProfile({ output: {}, outputs: [{ type: 'texture', sizeMode: 'huge' }] }).outputs[0].sizeMode, 'fixed');
});

test('fit: moving one mesh point puts the hand\'s wall position on the point\'s pixel; nearest point; far hands refused', async () => {
  const { gridFrom, gridMap, gridSolveNode, gridNearestNode } = await import('../engine/core/geometry.js');
  const g = gridFrom((u, v) => [100 + u * 600, 50 + v * 300], 4, 3); // 4 × 3 points over a 600 × 300 px region
  const k = 1 * 4 + 2;                                                // row 1, column 2 → uv (2/3, 1/2)
  // the hand is on that point's projected dot, but the sensor reads it 4 cm right and 2 cm up (wall of 6 × 3 m)
  const u = 2 / 3 + 0.04 / 6, v = 0.5 - 0.02 / 3;
  assert.equal(gridNearestNode(g, u, v, 6, 3), k);
  const target = g.points[k].slice();
  const np = gridSolveNode(g, k, u, v, target);
  const g2 = { ...g, points: g.points.map((p, q) => (q === k ? np : p)) };
  const [x, y] = gridMap(g2, u, v);
  assert.ok(Math.hypot(x - target[0], y - target[1]) < 1e-6, `the hand now lands on the point's pixel (${x}, ${y})`);
  assert.ok(Math.hypot(np[0] - target[0], np[1] - target[1]) > 3, 'the point itself moved');
  assert.deepEqual(g2.points.filter((_, q) => q !== k), g.points.filter((_, q) => q !== k), 'no other point moved');
  assert.equal(gridSolveNode(g, k, 0.05, 0.05, target), null, 'a hand far from the point cannot move it');
});

test('texture: destination NDI or full screen (NDI by default — Spout is the room output, not the Texture); display and proportions for the window', () => {
  const out = (o) => normalizeProfile({ output: {}, outputs: [{ type: 'texture', ...o }] }).outputs[0];
  assert.deepEqual([out({}).sink, out({}).displayId, out({}).fit], ['ndi', null, 'fit']);
  assert.equal(out({ sink: 'ndi' }).sink, 'ndi');
  assert.deepEqual([out({ sink: 'window', displayId: 2779098405, fit: 'stretch' }).sink, out({ sink: 'window', displayId: 2779098405 }).displayId, out({ fit: 'stretch' }).fit], ['window', 2779098405, 'stretch']);
  assert.equal(out({ sink: 'hdmi' }).sink, 'ndi');
  assert.equal(out({ sink: 'spout' }).sink, 'ndi', 'a Texture output cannot send over Spout any more');
});

test('pixel map: the 1 m line lands on the right canvas column through the wall mapping; the current target is a ring; touches stay untouched', async () => {
  const { TouchMask, overlayOf, wallPattern } = await import('../engine/core/mask.js');
  // a 4 × 2 m wall on a 200 × 100 px region of a 400 × 200 canvas, offset (50 px per metre)
  const prof = normalizeProfile({ canvas: { width: 400, height: 200 }, walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 100, y: 20, w: 200, h: 100 } }] });
  const wall = prof.walls[0];
  const o = { radius: 0.1, softness: 0, trailMs: 0, sizeMode: 'fixed' };
  const render = (overlay, touches = []) => { const m = new TouchMask(); m.resize(400, 200); m.render([{ wall, touches }], o, 1, 16, overlay); return m; };
  const at = (m, x, y) => m.frame[y * m.w + x];
  const near = (m, x, y, r = 1) => { let v = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) v = Math.max(v, at(m, x + i, y + j)); return v; };

  const none = render(null);
  assert.equal(none.frame, none.mask, 'no overlay: the frame is the touch mask itself');
  assert.ok(none.frame.every((v) => v === 0));

  const grid = render(overlayOf({ grid: true }));
  // x = 2 m → canvas 100 + 2·50 = 200 (a 1 m line: bright); x = 1 m → 150; the 1.5 m line is thinner; between lines it is black. Row 40 = y 1.6 m.
  assert.ok(near(grid, 200, 40) >= 200, `the 2 m line is on column 200 (${near(grid, 200, 40)})`);
  assert.ok(near(grid, 150, 40) >= 200, `the 1 m line is on column 150 (${near(grid, 150, 40)})`);
  const half = near(grid, 175, 40);
  assert.ok(half > 0 && half < 200, `the 0.5 m line is fainter (${half})`);
  assert.equal(near(grid, 162, 40, 2), 0, 'black between the lines');
  assert.equal(near(grid, 80, 40), 0, 'nothing outside the wall');
  assert.ok(near(grid, 100, 70) === 255 && near(grid, 300, 70) === 255, 'the wall outline sits on the mapped edges (x 100 and 300)');
  assert.ok(near(grid, 200, 70, 0) === 255 || near(grid, 201, 70, 1) === 255, 'centre cross');
  // wallPattern is the same geometry the projection strokes
  const pat = wallPattern(wall);
  assert.deepEqual(pat.lines.find((l) => l.axis === 'x' && l.metres === 2).pts[0], [200, 120], 'x = 2 m, y = 0 → canvas (200, 120)');
  assert.equal(pat.lines.find((l) => l.axis === 'x' && l.metres === 2).label.text, '2m');

  // a calibration session: the current target is a ring (+ crosshair), the others dots; absent without the session
  const calib = { wallId: 'A', index: 1, phase: 'touch', progress: 0.3, targets: [{ x: 1, y: 1, skipped: false, captured: [] }, { x: 3, y: 1, skipped: false, captured: [] }] };
  const ring = render(overlayOf({ grid: true, calib }));
  // target 1 = (3 m, 1 m) → canvas (250, 70); its ring (R = 7 px) passes at 45° through (255, 65), where the grid is black
  assert.equal(near(grid, 255, 65), 0);
  assert.equal(near(ring, 255, 65), 255, 'the current target is ringed');
  assert.ok(near(ring, 150, 70, 1) >= 200, 'the other target is a dot (on (150, 70))');
  assert.equal(near(render(overlayOf({ grid: true, calib: { ...calib, phase: 'done' } })), 255, 65), 0, 'a finished session has no current target');
  // verification and Fit draw their own marks
  const ver = render(overlayOf({ verify: { wallId: 'A', index: 0, phase: 'touch', targets: [{ x: 3, y: 1, measured: null, errMm: null }] } }));
  assert.equal(near(ver, 255, 65), 255, 'a verification check point is ringed');

  // touches are never disturbed: a disc on top, the same pixels as without the pattern, and the pattern comes back on its own
  const touch = [{ x: 1, y: 1.6, size: 0.05 }];
  const withT = render(overlayOf({ grid: true }), touch), plain = render(null, touch);
  assert.deepEqual(Buffer.from(plain.mask), Buffer.from(withT.mask), 'the touch layer is the same with or without the pattern');
  assert.equal(at(withT, 150, 40), 255, 'the touch shows over the line');
  const m = new TouchMask(); m.resize(400, 200);
  const rend = (ov) => m.render([{ wall, touches: [] }], o, 1, 16, ov);
  assert.equal(rend(overlayOf({ grid: true })), true);
  assert.equal(rend(overlayOf({ grid: true })), false, 'nothing changed: no new frame');
  assert.ok(near(m, 200, 40) >= 200);
  assert.equal(rend(null), true, 'turning the pattern off redraws once');
  assert.ok(m.frame.every((v) => v === 0), 'and the output is black again');
  assert.equal(overlayOf({}), null);
  // the option: Automatic by default, Off kept, junk falls back
  const ov = (v) => normalizeProfile({ output: {}, outputs: [{ type: 'texture', overlay: v }] }).outputs[0].overlay;
  assert.deepEqual([ov(undefined), ov('off'), ov('on'), ov('auto')], ['auto', 'off', 'auto', 'auto']);
});

test('pixel map: the Texture output draws the pattern on its NDI frame, unless its overlay is Off', async () => {
  const { TextureRenderer } = await import('../engine/outputs/texture.js');
  const { overlayOf } = await import('../engine/core/mask.js');
  const prof = normalizeProfile({ canvas: { width: 400, height: 200 }, walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }] });
  const walls = [{ wall: prof.walls[0], touches: [] }];
  const lit = (overlay, mode) => {
    const r = new TextureRenderer();
    r.configure({ scale: 0.5, radius: 0.1, softness: 0, trailMs: 0, sizeMode: 'fixed', overlay: mode }, prof);
    r.render(walls, 16, overlay);
    return r.mask.reduce((n, v) => n + (v > 0), 0) + (r.rgba[0] === r.mask[0] ? 0 : 1);
  };
  assert.equal(lit(null, 'auto'), 0, 'no grid, no session: pure touches');
  assert.ok(lit(overlayOf({ grid: true }), 'auto') > 500, 'grid on: the lines are in the texture');
  assert.equal(lit(overlayOf({ grid: true }), 'off'), 0, 'overlay Off: never');
});

// ---- calibration: capture only near the target, ignore the rest, armed session ----
const calibRun = (cal, pipe, scanOf, world, x, y, tRef, { steps = 6, down = 8 } = {}) => {
  world.injected.set('h', { x, y });
  for (let k = 0; k < steps; k++) { cal.feed('S', pipe.process(scanOf(tRef.t), { raw: true }).detections, tRef.t); tRef.t += 100; }
  world.injected.delete('h');
  for (let k = 0; k < down; k++) { cal.feed('S', pipe.process(scanOf(tRef.t), { raw: true }).detections, tRef.t); tRef.t += 100; }
};

test('calibration: a person standing far from the target (at the door) does not reset or spoil the capture', () => {
  const { wall, world, pipe, scanOf } = wallSetup({ x: 0.03, y: 0.02, rotation: -1.5 });
  const targets = defaultTargets(wall);
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  const tRef = { t: 1000 };
  world.injected.set('door', { x: 0.15, y: 3.0 }); // steady, in the scan plane, > 1 m from every target
  targets.forEach((tg) => calibRun(cal, pipe, scanOf, world, tg.x, tg.y, tRef));
  assert.equal(cal.phase, 'done');
  const r = cal.result.S;
  assert.ok(r.ok, r.error);
  assert.ok(r.points === targets.length, `all ${targets.length} targets captured, got ${r.points}`);
  assert.ok(r.rmsMm < 15, `rms ${r.rmsMm} mm`);
});

test('calibration: two detections near the target (palm + finger) still capture, on the nearest', () => {
  const wall = { id: 'W', width: 6, height: 3.5 };
  const targets = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  let t = 0;
  for (let k = 0; k < 6; k++) {
    cal.feed('S', [
      { x: 1.05, y: 1.0, sx: 1.05, sy: 1.0 }, // finger, 5 cm further
      { x: 1.0, y: 1.0, sx: 1.0, sy: 1.0 },   // palm
    ], t); t += 100;
  }
  assert.deepEqual(cal.targets[0].captured.S, [1.0, 1.0], 'the nearest one was taken');
});

test('calibration: an unarmed session captures nothing until armed or a hold near target 1', () => {
  const wall = { id: 'W', width: 6, height: 3.5 };
  const targets = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const far = { x: 4, y: 3, sx: 4, sy: 3 };
  const feed = (cal, dets, n, t0) => { for (let k = 0; k < n; k++) cal.feed('S', dets, t0 + k * 100); return t0 + n * 100; };

  const a = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  assert.equal(a.armed, false);
  feed(a, [far], 30, 0); // someone steady far from target 1
  assert.equal(a.armed, false, 'a steady person far away does not arm it');
  assert.deepEqual(a.targets[0].captured, {});
  // a person walking through the radius of target 1 does not hold still
  for (let k = 0; k < 10; k++) a.feed('S', [{ x: 0.5 + k * 0.1, y: 1, sx: 0.5 + k * 0.1, sy: 1 }], 4000 + k * 100);
  assert.equal(a.armed, false, 'a passer-by does not arm it');
  // a steady hand within the radius of target 1 arms it and counts
  feed(a, [{ x: 1.3, y: 1.1, sx: 1.3, sy: 1.1 }], 6, 6000);
  assert.equal(a.armed, true);
  assert.deepEqual(a.targets[0].captured.S, [1.3, 1.1]);

  // explicit arm()
  const b = new CalibrationSession(wall, ['S'], targets, { holdMs: 300 });
  b.arm();
  feed(b, [{ x: 1.2, y: 1.0, sx: 1.2, sy: 1.0 }], 6, 0);
  assert.ok(b.targets[0].captured.S);
  // armed, but the hand is beyond the radius: not captured
  const c = new CalibrationSession(wall, ['S'], targets, { holdMs: 300, captureRadiusM: 0.5, armed: true });
  feed(c, [{ x: 1.6, y: 1.0, sx: 1.6, sy: 1.0 }], 10, 0);
  assert.deepEqual(c.targets[0].captured, {});
});

test('calibration: snapshot carries armed, captureRadiusM, near and flash (accept, retry)', () => {
  const wall = { id: 'W', width: 6, height: 3.5 };
  const targets = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const cal = new CalibrationSession(wall, ['S'], targets, { holdMs: 300, captureRadiusM: 0.6 });
  let s = cal.snapshot(0);
  assert.equal(s.armed, false);
  assert.equal(s.captureRadiusM, 0.6);
  assert.equal(s.near, null);
  assert.equal(s.flash, null);
  cal.feed('S', [{ x: 1, y: 2, sx: 1, sy: 2 }, { x: 4, y: 1, sx: 4, sy: 1 }], 0);
  s = cal.snapshot(10);
  assert.ok(Math.abs(s.near.distM - 1) < 1e-9 && s.near.x === 1 && s.near.y === 2, 'nearest to target 1, in wall metres');
  let t = 100;
  for (let k = 0; k < 6; k++) { cal.feed('S', [{ x: 1, y: 1, sx: 1, sy: 1 }], t); t += 100; }
  s = cal.snapshot(t);
  assert.equal(s.armed, true);
  assert.equal(s.flash.kind, 'accept');
  assert.equal(s.flash.index, 0);
  assert.ok(s.flash.ageMs >= 0 && s.flash.ageMs < 1000);
  assert.equal(cal.snapshot(t + 2000).flash, null, 'the flash lasts 1.5 s');
  cal.redoTarget(0);
  s = cal.snapshot(t + 50);
  assert.equal(s.flash.kind, 'retry');
  assert.equal(s.flash.index, 0);
});

test('verification: the nearest touch counts, a second one elsewhere is ignored; near and flash in the snapshot', async () => {
  const { VerifySession } = await import('../engine/core/calibration.js');
  const wall = { id: 'W', width: 6, height: 3.5 };
  const vs = new VerifySession(wall, [{ x: 1, y: 1 }, { x: 2, y: 1 }], { holdMs: 300 });
  let t = 0;
  for (let k = 0; k < 8; k++) {
    vs.feed([{ id: 1, x: 4, y: 3 }, { id: 2, x: 1.01, y: 1.0 }], t); t += 100;
    if (k === 1) assert.ok(vs.snapshot(t).near.distM < 0.02);
  }
  assert.ok(vs.targets[0].measured, 'measured despite the second touch');
  assert.equal(vs.snapshot(t).flash.kind, 'accept');
  assert.equal(vs.snapshot(t).flash.index, 0);
});

// ── tracker: realistic hands (S2E at ~10 Hz, jitter, noise, missed revolutions) ─────────────────────────────────────
// The tracking values of the real room (profile xrlab) — what produced 46 ids in 2 minutes of one person.
const XRLAB_TRACKING = { coastMs: 220, predictMs: 60, gateBase: 0.15, maxSpeed: 4, confirmFrames: 2, oneEuro: { minCutoff: 1.2, beta: 0.6 } };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * Hands crossing a wall, read like the S2E does: a revolution every 80–120 ms, 10–15 mm of noise, a size that wobbles,
 * some revolutions with no detection at all. The tracker ticks at 60 Hz in between. Returns the events and the touches.
 * hands: [{ x0, y0, vx, vy?, ax?, size?, from?, to? (ms) }]; miss: set of revolution indexes with no detection.
 */
function simHands({ params, hands, seed = 7, ms = 1500, miss = new Set(), noise = 0.012 }) {
  const rand = rng(seed);
  const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rand(); return (u - 3) / 0.7071; };
  const tr = new WallTracker({ id: 'W' }, params, { next: 1 });
  const downs = [], ups = [], frames = [];
  let nextRev = 0, rev = 0;
  for (let t = 0; t <= ms; t += 1000 / 60) {
    while (nextRev <= t) {
      if (!miss.has(rev)) {
        const dets = [];
        for (const h of hands) {
          if (nextRev < (h.from ?? 0) || nextRev > (h.to ?? Infinity)) continue;
          const s = (nextRev - (h.from ?? 0)) / 1000;
          dets.push({
            x: h.x0 + (h.vx ?? 0) * s + 0.5 * (h.ax ?? 0) * s * s + gauss() * noise,
            y: h.y0 + (h.vy ?? 0) * s + gauss() * noise,
            size: (h.size ?? 0.09) * (1 + 0.15 * (rand() - 0.5)), n: 10,
          });
        }
        tr.ingest(dets, nextRev);
      }
      rev++;
      nextRev += 80 + rand() * 40;
    }
    const r = tr.tick(t);
    for (const e of r.events) (e.type === 'down' ? downs : ups).push(e);
    frames.push({ t, touches: r.touches });
  }
  return { tr, downs, ups, frames };
}

test('tracker: one hand crossing a wall at 1 and 2 m/s with a missed revolution stays ONE id', () => {
  for (const [vx, ax] of [[1, 0], [2, 0], [1, 0.8], [2, -1], [0.5, 0]]) {
    for (let seed = 1; seed <= 60; seed++) for (const miss of [[6], [4, 5], [3, 7]]) {
      const { downs, ups, tr } = simHands({ params: XRLAB_TRACKING, hands: [{ x0: 0.5, y0: 1.2, vx, ax }], seed, ms: 1400, miss: new Set(miss) });
      const live = tr.tick(1400).touches.length;
      assert.equal(downs.length, 1, `v ${vx} a ${ax} seed ${seed} miss ${miss}: ${downs.length} ids`);
      assert.equal(ups.length + live, 1, `v ${vx} a ${ax} seed ${seed}: one up (or still alive)`);
    }
  }
});

test('tracker: two hands 35 cm apart moving in parallel keep two ids; crossing hands keep theirs', () => {
  const par = simHands({ params: XRLAB_TRACKING, hands: [{ x0: 0.5, y0: 1.2, vx: 1.5 }, { x0: 0.85, y0: 1.2, vx: 1.5 }], seed: 3, ms: 1200, miss: new Set([5]) });
  assert.equal(par.downs.length, 2, `${par.downs.length} ids for two parallel hands`);
  assert.equal(par.frames.filter((f) => f.t > 400).every((f) => f.touches.length === 2), true, 'two touches throughout');
  // distinct hands keep distinct ids even after the missed revolution
  const ids = new Set(par.frames.flatMap((f) => f.touches.map((t) => t.id)));
  assert.equal(ids.size, 2);
  // crossing: one goes right, one goes left, 40 cm apart in height — never swap
  const cross = simHands({ params: XRLAB_TRACKING, hands: [{ x0: 0.5, y0: 1.0, vx: 1 }, { x0: 2.0, y0: 1.4, vx: -1 }], seed: 5, ms: 1400 });
  assert.equal(cross.downs.length, 2);
  const last = cross.frames.at(-1).touches;
  const a = last.find((t) => t.y < 1.2), b = last.find((t) => t.y >= 1.2);
  assert.ok(a && b && a.id !== b.id && a.vx > 0 && b.vx < 0, 'each id keeps its own hand');
});

test('tracker: rx, ry hold the last reading while x, y extrapolate; seenAt is the reading time', () => {
  const tr = new WallTracker({ id: 'W' }, { predictMs: 60 }, { next: 1 });
  for (let k = 0; k < 5; k++) { tr.ingest([{ x: 1 + k * 0.1, y: 1, size: 0.08, n: 10 }], 1000 + k * 100); tr.tick(1000 + k * 100); }
  const a = tr.tick(1400 + 1).touches[0];
  const b = tr.tick(1400 + 40).touches[0];
  assert.equal(a.seenAt, 1400);
  assert.equal(b.seenAt, 1400);
  assert.equal(a.rx, b.rx); assert.equal(a.ry, b.ry);
  assert.ok(b.x > a.x + 0.005, 'x, y extrapolate');
  assert.ok(Math.abs(b.rx - (b.x - b.vx * 0.040)) < 1e-9, 'x = rx + v · lead');
  const c = tr.tick(1400 + 150).touches[0];
  assert.ok(Math.abs(c.x - (c.rx + c.vx * 0.060)) < 1e-9, 'lead capped at predictMs');
  assert.equal(c.rx, a.rx);
  tr.ingest([{ x: 1.5, y: 1, size: 0.08, n: 10 }], 1500);
  const d = tr.tick(1500).touches[0];
  assert.equal(d.seenAt, 1500);
  assert.ok(d.rx > a.rx);
});

test('tracker: a lifted hand still ends quickly, and a coasting track does not grab a hand a metre away', () => {
  const rest = simHands({ params: XRLAB_TRACKING, hands: [{ x0: 2, y0: 1, vx: 0, to: 600 }], seed: 2, ms: 1400 });
  assert.equal(rest.ups.length, 1);
  assert.ok(rest.ups[0].t - 600 < 700, 'a resting touch ends within its coast time of the lift');
  const far = simHands({ params: XRLAB_TRACKING, hands: [{ x0: 0.5, y0: 1, vx: 1, to: 700 }, { x0: 3.5, y0: 1, vx: 0, from: 800 }], seed: 4, ms: 1800 });
  assert.equal(far.downs.length, 2, 'the hand that appears 2 m away is another touch');
});
