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
  targets.forEach((tg, k) => touchTarget(tg.x + (k === 4 ? 0.06 : 0), tg.y)); // target 5 touched 6 cm off
  assert.equal(cal.phase, 'done');
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
  assert.deepEqual(bodies[0].zone, { id: 'Z1', name: 'Big Door', wallId: 'W', address: '/big-door' });
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
