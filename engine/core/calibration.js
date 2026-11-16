// Touch calibration of one wall. The projection shows a target at a known wall position;
// the operator touches it; every sensor of the wall records where it saw the hand (sensor
// frame). With ≥4 targets we fit a homography sensor→wall per sensor (3 → affine).

import { fitHomography, fitAffine, residuals, isWellConditioned } from './geometry.js';

/** Reachable grid: people cannot touch the top of a 3.5 m wall. */
export function defaultTargets(wall, { cols = 3, rows = 3, top = 1.9, bottom = 0.45, inset = 0.12 } = {}) {
  const W = wall.width, H = wall.height;
  const yTop = Math.min(top, H - 0.1), yBot = Math.min(bottom, yTop);
  const xs = cols === 1 ? [W / 2] : Array.from({ length: cols }, (_, i) => W * (inset + ((1 - 2 * inset) * i) / (cols - 1)));
  const ys = rows === 1 ? [(yTop + yBot) / 2] : Array.from({ length: rows }, (_, i) => yTop - ((yTop - yBot) * i) / (rows - 1));
  const out = [];
  ys.forEach((y, r) => {
    const row = xs.map((x) => ({ x: round(x), y: round(y) }));
    out.push(...(r % 2 ? row.reverse() : row)); // snake order: shorter walks along the wall
  });
  return out;
}

const round = (v) => Math.round(v * 1000) / 1000;

export class CalibrationSession {
  /**
   * @param {{id:string,width:number,height:number}} wall
   * @param {string[]} sensorIds
   * @param {{x:number,y:number}[]} targets
   */
  constructor(wall, sensorIds, targets, { holdMs = 700, tolerance = 0.025, releaseMs = 500, settleMs = 1500 } = {}) {
    this.wall = wall;
    this.sensorIds = sensorIds;
    this.targets = targets.map((t) => ({ ...t, captured: {}, skipped: false }));
    this.opt = { holdMs, tolerance, releaseMs, settleMs };
    this.index = 0;
    this.phase = 'waiting';
    this.cand = {}; // sensorId → {t0, pts:[[x,y]]}
    this.lastDetection = 0;
    this.firstCaptureAt = 0;
    this.result = null;
    this.autoRedo = null;          // {index, errMm}: a capture that disagreed with the others is being asked again
    this.autoRedone = new Set();   // each target is asked again automatically at most once
  }

  get current() { return this.targets[this.index] || null; }

  /** Feed the raw (sensor-frame) detections of one sensor revolution. */
  feed(sensorId, dets, tMs) {
    if (this.phase === 'done' || !this.sensorIds.includes(sensorId)) return;
    if (dets.length) this.lastDetection = tMs;
    if (this.phase === 'release') {
      if (tMs - this.lastDetection >= this.opt.releaseMs) this._next();
      return;
    }
    const tgt = this.current;
    if (!tgt || tgt.captured[sensorId]) { this._maybeAdvance(tMs); return; }
    if (dets.length !== 1) { delete this.cand[sensorId]; this._maybeAdvance(tMs); return; }
    const p = [dets[0].sx, dets[0].sy];
    const c = this.cand[sensorId];
    if (c) {
      const m = mean(c.pts);
      if (Math.hypot(p[0] - m[0], p[1] - m[1]) <= this.opt.tolerance) c.pts.push(p);
      else this.cand[sensorId] = { t0: tMs, pts: [p] };
    } else this.cand[sensorId] = { t0: tMs, pts: [p] };
    const cc = this.cand[sensorId];
    this.phase = 'holding';
    if (tMs - cc.t0 >= this.opt.holdMs && cc.pts.length >= 3) {
      tgt.captured[sensorId] = median(cc.pts);
      delete this.cand[sensorId];
      if (!this.firstCaptureAt) this.firstCaptureAt = tMs;
    }
    this._maybeAdvance(tMs);
  }

  _maybeAdvance(tMs) {
    const tgt = this.current;
    if (!tgt) return;
    const n = Object.keys(tgt.captured).length;
    const all = n === this.sensorIds.length;
    // A sensor that cannot see this target (occlusion, out of range) must not block the wizard.
    const settled = n > 0 && this.firstCaptureAt && tMs - this.firstCaptureAt >= this.opt.settleMs;
    if (all || settled) { this.phase = 'release'; }
  }

  _next() {
    this.cand = {};
    this.firstCaptureAt = 0;
    if (this.returnToDone) { // a single target was redone: straight back to the result
      this.returnToDone = false;
      this.index = this.targets.length;
    } else this.index++;
    this.phase = this.index >= this.targets.length ? 'done' : 'waiting';
    if (this.phase === 'done') this._finish();
  }

  /**
   * Solve; a capture that disagrees with all the others (the wrong dot was touched, the hand was off the dot, someone
   * else walked through the plane) is asked again automatically — once per target — before the result is shown.
   */
  _finish() {
    this.result = this.solve();
    const s = this.suspectTarget();
    if (s && !this.autoRedone.has(s.index)) {
      this.autoRedone.add(s.index);
      this.redoTarget(s.index);
      this.autoRedo = s;
    }
  }

  /**
   * Leave-one-out: fit every sensor without each target in turn. Without the bad one, the others agree (their own
   * residual is small) and the bad one lands far from where they put it (> 4 cm and 5× their residual). A good target
   * left out does not look like that: the bad one, still in, spoils the fit of the rest.
   * @returns {{index:number, errMm:number, sensorId:string}|null}
   */
  suspectTarget() {
    let worst = null;
    for (const sid of this.sensorIds) {
      const r = this.result?.[sid];
      if (!r?.ok || r.pairs.length < 6) continue;
      r.pairs.forEach((p, i) => {
        const rest = r.pairs.filter((_, j) => j !== i);
        const src = rest.map((q) => q.sensor), dst = rest.map((q) => q.wall);
        // affine, not homography: 8 points nearly pin down a homography's 8 unknowns, so it would bend to fit a bad
        // point; the sensor-to-wall transform is close to rigid, which an affine fit holds with room to spare
        const m = fitAffine(src, dst);
        if (!m || !isWellConditioned(m)) return;
        const restRms = residuals(m, src, dst).rms;
        const err = residuals(m, [p.sensor], [p.wall]).errors[0];
        if (err > Math.max(0.04, 5 * restRms) && (!worst || err > worst.err)) worst = { index: p.index, err, sensorId: sid };
      });
    }
    return worst ? { index: worst.index, errMm: Math.round(worst.err * 1000), sensorId: worst.sensorId } : null;
  }

  /** Redo one target (e.g. the worst one) and come back to the result. */
  redoTarget(i) {
    if (i < 0 || i >= this.targets.length) return;
    this.autoRedo = null;
    this.targets[i].captured = {};
    this.targets[i].skipped = false;
    this.index = i;
    this.cand = {};
    this.firstCaptureAt = 0;
    this.result = null;
    this.returnToDone = true;
    this.phase = 'waiting';
  }

  /**
   * The target to redo: the one that disagrees with the others (leave-one-out) if there is one — a homography bends
   * towards a bad point and can put the largest residual on its neighbour — else the largest residual (or -1).
   */
  worstTarget() {
    const s = this.result ? this.suspectTarget() : null;
    if (s) return s.index;
    let worst = -1, err = -1;
    for (const r of Object.values(this.result || {})) {
      for (const p of r.pairs || []) if (p.errMm > err) { err = p.errMm; worst = p.index; }
    }
    return worst;
  }

  skip() {
    const t = this.current;
    if (!t) return;
    t.skipped = true;
    t.captured = {};
    this._next();
  }

  redoPrevious() {
    if (this.index === 0) return;
    if (this.phase === 'done') this.result = null;
    this.index--;
    this.targets[this.index].captured = {};
    this.targets[this.index].skipped = false;
    this.cand = {};
    this.firstCaptureAt = 0;
    this.phase = 'waiting';
  }

  progress(tMs) {
    const c = Object.values(this.cand)[0];
    return c ? Math.min(1, (tMs - c.t0) / this.opt.holdMs) : 0;
  }

  /** Fit one transform per sensor. */
  solve() {
    const out = {};
    for (const sid of this.sensorIds) {
      const src = [], dst = [], idx = [];
      this.targets.forEach((t, k) => { if (t.captured[sid]) { src.push(t.captured[sid]); dst.push([t.x, t.y]); idx.push(k); } });
      let matrix = null, kind = null;
      if (src.length >= 4) { matrix = fitHomography(src, dst); kind = 'homography'; }
      if ((!matrix || !isWellConditioned(matrix)) && src.length >= 3) { matrix = fitAffine(src, dst); kind = 'affine'; }
      if (!matrix || !isWellConditioned(matrix)) { out[sid] = { ok: false, points: src.length, error: src.length < 3 ? 'needs at least 3 captured targets' : 'degenerate targets' }; continue; }
      const r = residuals(matrix, src, dst);
      out[sid] = {
        ok: true, kind, matrix, points: src.length,
        rmsMm: Math.round(r.rms * 10000) / 10, maxMm: Math.round(r.max * 10000) / 10,
        pairs: src.map((s, i) => ({ index: idx[i], sensor: s, wall: dst[i], errMm: Math.round(r.errors[i] * 10000) / 10 })),
      };
    }
    return out;
  }

  snapshot(tMs) {
    return {
      wallId: this.wall.id, sensorIds: this.sensorIds, index: this.index, phase: this.phase,
      progress: this.progress(tMs), redoing: !!this.returnToDone, autoRedo: this.autoRedo,
      targets: this.targets.map((t) => ({ x: t.x, y: t.y, skipped: t.skipped, captured: Object.keys(t.captured) })),
      result: this.result,
      worst: this.phase === 'done' ? this.worstTarget() : -1,
    };
  }
}

/**
 * Verification after calibration: targets the calibration did NOT use (between the grid points)
 * are touched and the TRACKED touch (full pipeline + tracker, i.e. what the outputs send) is
 * compared with the target. This measures the real end-to-end error, not the fit residual.
 */
export function verifyTargets(wall, { top = 1.9, bottom = 0.45, inset = 0.12 } = {}) {
  const W = wall.width, H = wall.height;
  const yTop = Math.min(top, H - 0.1), yBot = Math.min(bottom, yTop);
  const xs = [W * (inset + (1 - 2 * inset) * 0.25), W * 0.5, W * (inset + (1 - 2 * inset) * 0.75)];
  const ys = [yTop - (yTop - yBot) * 0.25, yBot + (yTop - yBot) * 0.25];
  return [
    { x: round(xs[0]), y: round(ys[0]) }, { x: round(xs[2]), y: round(ys[0]) }, { x: round(xs[1]), y: round((yTop + yBot) / 2) },
    { x: round(xs[2]), y: round(ys[1]) }, { x: round(xs[0]), y: round(ys[1]) },
  ];
}

export class VerifySession {
  constructor(wall, targets, { holdMs = 600, radius = 0.3, releaseMs = 400 } = {}) {
    this.wall = wall;
    this.targets = targets.map((t) => ({ ...t, measured: null, errMm: null }));
    this.opt = { holdMs, radius, releaseMs };
    this.index = 0;
    this.phase = 'waiting';
    this.cand = null;
    this.lastSeen = 0;
  }

  /** Feed the wall's tracked touches every tick. */
  feed(touches, tMs) {
    if (this.phase === 'done') return;
    if (touches.length) this.lastSeen = tMs;
    if (this.phase === 'release') {
      if (tMs - this.lastSeen >= this.opt.releaseMs) {
        this.index++;
        this.phase = this.index >= this.targets.length ? 'done' : 'waiting';
      }
      return;
    }
    const t = this.targets[this.index];
    const near = touches.filter((q) => Math.hypot(q.x - t.x, q.y - t.y) <= this.opt.radius);
    if (near.length !== 1) { this.cand = null; this.phase = 'waiting'; return; }
    const q = near[0];
    if (!this.cand || this.cand.id !== q.id) this.cand = { id: q.id, t0: tMs, xs: [], ys: [] };
    this.cand.xs.push(q.x); this.cand.ys.push(q.y);
    this.phase = 'holding';
    if (tMs - this.cand.t0 >= this.opt.holdMs) {
      const mx = median(this.cand.xs.map((x) => [x, 0]))[0], my = median(this.cand.ys.map((y) => [y, 0]))[0];
      t.measured = [round(mx), round(my)];
      t.errMm = Math.round(Math.hypot(mx - t.x, my - t.y) * 10000) / 10;
      this.cand = null;
      this.phase = 'release';
    }
  }

  progress(tMs) { return this.cand ? Math.min(1, (tMs - this.cand.t0) / this.opt.holdMs) : 0; }

  summary() {
    const e = this.targets.filter((t) => t.errMm !== null).map((t) => t.errMm);
    if (!e.length) return null;
    return { n: e.length, meanMm: Math.round((e.reduce((a, b) => a + b, 0) / e.length) * 10) / 10, maxMm: Math.max(...e) };
  }

  snapshot(tMs) {
    return {
      kind: 'verify', wallId: this.wall.id, index: this.index, phase: this.phase, progress: this.progress(tMs),
      targets: this.targets.map((t) => ({ x: t.x, y: t.y, measured: t.measured, errMm: t.errMm })),
      summary: this.phase === 'done' ? this.summary() : null,
    };
  }
}

function mean(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function median(pts) {
  const xs = pts.map((p) => p[0]).sort((a, b) => a - b);
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  const m = Math.floor(pts.length / 2);
  return [xs[m], ys[m]];
}
