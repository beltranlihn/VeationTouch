// Per-sensor processing: one revolution in → touch candidates (wall metres) out.
//   1. validity / quality filter
//   2. background subtraction per angle bin (learned with the room empty)
//   3. sensor → wall transform (calibration homography, or the measured pose)
//   4. region of interest = wall rectangle minus masks
//   5. segmentation in scan order (angular + euclidean gap)
//   6. size gating + contact-point correction
// See ARCHITECTURE.md › Pipeline for the reasoning behind each default.

import { apply, poseMatrix, pointInRect } from './geometry.js';

/** Defaults; every value can be overridden per room profile (`processing`). */
export const PROCESSING_DEFAULTS = Object.freeze({
  minQuality: 10,          // 0..255, Sensitivity mode only
  minRangeMm: 80,          // ignore returns from the bracket / window
  binDeg: 0.25,            // background resolution
  bgThresholdMm: 40,       // closer than background by this much = foreground
  edgeMargin: 0.03,        // m, ignored band along the left/right wall edges
  floorMargin: 0.05,       // m, ignored band above the floor
  clusterGap: 0.05,        // m, max distance between neighbouring points of one object
  minPoints: 3,
  minSize: 0.015,          // m, smaller = noise
  maxSize: 0.30,           // m, larger = body/arm leaning on the wall (reported, not tracked)
  contactCorrection: 1,    // 0..1 — shift centroid of the visible arc to the disc centre
});

export class SensorPipeline {
  constructor(sensor, wall, processing) {
    this.bg = null;
    this.learning = null;
    this.configure(sensor, wall, processing);
  }

  configure(sensor, wall, processing) {
    this.sensor = sensor;
    this.wall = wall;
    this.p = { ...PROCESSING_DEFAULTS, ...(processing || {}) };
    this.matrix = sensor.calibration?.matrix?.length === 9 ? sensor.calibration.matrix : poseMatrix(sensor.pose);
    this.calibrated = !!(sensor.calibration?.matrix?.length === 9);
    this.origin = apply(this.matrix, 0, 0);
    this.masks = (wall.masks || []).filter((m) => m.type === 'rect');
    const nb = Math.ceil(360 / this.p.binDeg);
    if (!this.bg || this.bg.length !== nb) this.bg = sensor.background?.dist?.length === nb ? Float32Array.from(sensor.background.dist) : null;
  }

  setBackground(dist) { this.bg = dist ? Float32Array.from(dist) : null; }

  /** Begin learning the background over `frames` revolutions. */
  learnBackground(frames, onDone) {
    const nb = Math.ceil(360 / this.p.binDeg);
    this.learning = { frames, nb, samples: [], onDone };
  }

  _accumulateBackground(scan) {
    const L = this.learning;
    const mins = new Float32Array(L.nb);
    for (let i = 0; i < scan.count; i++) {
      const d = scan.dist[i];
      if (d <= this.p.minRangeMm) continue;
      if (scan.hasQuality && scan.quality[i] < this.p.minQuality) continue;
      const b = Math.floor(scan.angle[i] / this.p.binDeg) % L.nb;
      if (mins[b] === 0 || d < mins[b]) mins[b] = d;
    }
    L.samples.push(mins);
    if (L.samples.length < L.frames) return;
    const out = new Float32Array(L.nb);
    const col = [];
    for (let b = 0; b < L.nb; b++) {
      col.length = 0;
      for (const s of L.samples) if (s[b] > 0) col.push(s[b]);
      if (col.length >= L.samples.length / 2) {
        col.sort((a, c) => a - c);
        out[b] = col[Math.floor(col.length / 2)];
      }
    }
    this.learning = null;
    this.bg = out;
    L.onDone?.(Array.from(out, (v) => Math.round(v)));
  }

  _bgRef(b, nb) {
    const bg = this.bg;
    let m = Infinity;
    for (let k = -1; k <= 1; k++) {
      const v = bg[(b + k + nb) % nb];
      if (v > 0 && v < m) m = v;
    }
    return m === Infinity ? 0 : m;
  }

  /**
   * @param {import('../drivers/scan.js').Scan} scan
   * @param {{raw?:boolean, viz?:boolean}} opt  raw: skip ROI/masks (calibration); viz: return points for the UI
   */
  process(scan, opt = {}) {
    if (this.learning) this._accumulateBackground(scan);
    const p = this.p, W = this.wall.width, H = this.wall.height, M = this.matrix;
    const nb = Math.ceil(360 / p.binDeg);
    const useBg = !!this.bg && !this.learning;
    const fgX = [], fgY = [], fgA = [], fgSx = [], fgSy = [];
    const viz = opt.viz ? [] : null;
    const vizStep = opt.viz ? Math.max(1, Math.floor(scan.count / 1200)) : 0;
    const DEG = Math.PI / 180;

    for (let i = 0; i < scan.count; i++) {
      const d = scan.dist[i];
      if (d <= p.minRangeMm) continue;
      if (scan.hasQuality && scan.quality[i] < p.minQuality) continue;
      const a = scan.angle[i];
      const dm = d / 1000;
      const sx = dm * Math.cos(a * DEG), sy = dm * Math.sin(a * DEG);
      const [x, y] = apply(M, sx, sy);
      let cls = 0; // 0 background, 1 foreground, 2 outside ROI
      const b = Math.floor(a / p.binDeg) % nb;
      const isBg = useBg && (() => { const r = this._bgRef(b, nb); return r > 0 && d >= r - p.bgThresholdMm; })();
      if (!isBg) {
        const inRoi = opt.raw || (x >= p.edgeMargin && x <= W - p.edgeMargin && y >= p.floorMargin && y <= H &&
          !this.masks.some((m) => pointInRect(x, y, m)));
        cls = inRoi ? 1 : 2;
        if (inRoi) { fgX.push(x); fgY.push(y); fgA.push(a); fgSx.push(sx); fgSy.push(sy); }
      }
      if (viz && (cls === 1 || i % vizStep === 0)) viz.push(x, y, cls);
    }

    const { detections, rejected } = this._segment(fgX, fgY, fgA, fgSx, fgSy);
    return {
      sensorId: scan.sensorId, wallId: this.wall.id, t: scan.t, detections, rejected,
      fgCount: fgX.length, viz: viz ? Float32Array.from(viz) : null,
    };
  }

  // Segmentation, sizes and the contact correction happen in the SENSOR frame (metric and
  // rigid); only the final point is mapped to the wall. Calibration therefore fits the
  // homography on corrected sensor-frame points, the same ones used at runtime.
  _segment(X, Y, A, SX, SY) {
    const p = this.p;
    const n = SX.length;
    const clusters = [];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      const brk = i === n || Math.hypot(SX[i] - SX[i - 1], SY[i] - SY[i - 1]) > p.clusterGap || Math.abs(A[i] - A[i - 1]) > 2;
      if (brk) { clusters.push([start, i]); start = i; }
    }
    // Wrap-around: the revolution may cut an object at 0°/360°.
    if (clusters.length > 1) {
      const f = clusters[0], l = clusters[clusters.length - 1];
      if (A[f[0]] < 2 && A[l[1] - 1] > 358 && Math.hypot(SX[f[0]] - SX[l[1] - 1], SY[f[0]] - SY[l[1] - 1]) <= p.clusterGap) {
        clusters.pop();
        clusters[0] = [l[0], f[1] + n]; // indices ≥ n wrap below
      }
    }
    const detections = [], rejected = [];
    for (const [s, e] of clusters) {
      const cnt = e - s;
      if (cnt < p.minPoints) continue;
      let csx = 0, csy = 0;
      for (let k = s; k < e; k++) { const j = k % n; csx += SX[j]; csy += SY[j]; }
      csx /= cnt; csy /= cnt;
      const a = s % n, b = (e - 1) % n;
      const size = Math.hypot(SX[a] - SX[b], SY[a] - SY[b]);
      if (size < p.minSize) continue;
      if (size > p.maxSize) {
        const [x, y] = apply(this.matrix, csx, csy);
        rejected.push({ x, y, size, n: cnt });
        continue;
      }
      // Contact point: the sensor sees the near half of the hand; the centroid of that arc sits
      // ~2r/π in front of the centre along the ray. Push it back (sensor at the origin).
      if (p.contactCorrection > 0) {
        const L = Math.hypot(csx, csy) || 1;
        const shift = p.contactCorrection * (2 / Math.PI) * (size / 2);
        csx += (csx / L) * shift; csy += (csy / L) * shift;
      }
      const [x, y] = apply(this.matrix, csx, csy);
      detections.push({ x, y, size, n: cnt, sx: csx, sy: csy, sensorId: this.sensor.id });
    }
    return { detections, rejected };
  }
}
