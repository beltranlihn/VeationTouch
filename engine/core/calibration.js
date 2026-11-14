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
    this.index++;
    this.cand = {};
    this.firstCaptureAt = 0;
    this.phase = this.index >= this.targets.length ? 'done' : 'waiting';
    if (this.phase === 'done') this.result = this.solve();
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
      const src = [], dst = [];
      for (const t of this.targets) if (t.captured[sid]) { src.push(t.captured[sid]); dst.push([t.x, t.y]); }
      let matrix = null, kind = null;
      if (src.length >= 4) { matrix = fitHomography(src, dst); kind = 'homography'; }
      if ((!matrix || !isWellConditioned(matrix)) && src.length >= 3) { matrix = fitAffine(src, dst); kind = 'affine'; }
      if (!matrix || !isWellConditioned(matrix)) { out[sid] = { ok: false, points: src.length, error: src.length < 3 ? 'needs at least 3 captured targets' : 'degenerate targets' }; continue; }
      const r = residuals(matrix, src, dst);
      out[sid] = {
        ok: true, kind, matrix, points: src.length,
        rmsMm: Math.round(r.rms * 10000) / 10, maxMm: Math.round(r.max * 10000) / 10,
        pairs: src.map((s, i) => ({ sensor: s, wall: dst[i], errMm: Math.round(r.errors[i] * 10000) / 10 })),
      };
    }
    return out;
  }

  snapshot(tMs) {
    return {
      wallId: this.wall.id, sensorIds: this.sensorIds, index: this.index, phase: this.phase,
      progress: this.progress(tMs),
      targets: this.targets.map((t) => ({ x: t.x, y: t.y, skipped: t.skipped, captured: Object.keys(t.captured) })),
      result: this.result,
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
