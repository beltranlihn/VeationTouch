// A "scan" is one full revolution of a 2D LiDAR, as flat typed arrays.
// Drivers push samples into a ScanBuilder; it emits a scan every time the revolution
// marker (S flag) arrives.

/**
 * @typedef {object} Scan
 * @property {string} sensorId
 * @property {number} t          host time (ms, performance.now based) when the revolution closed
 * @property {number} deviceTs   device timestamp in µs (0 if the mode has none)
 * @property {number} count
 * @property {Float32Array} angle  degrees
 * @property {Float32Array} dist   millimetres (0 = invalid)
 * @property {Uint8Array} quality  0..255 (255 when the mode carries no quality)
 * @property {boolean} hasQuality
 */

const MAX_POINTS = 8192; // S2E at 32 ksps / 10 Hz = 3200 per revolution; margin for slow motor

export class ScanBuilder {
  /** @param {string} sensorId @param {(scan: Scan) => void} onScan */
  constructor(sensorId, onScan, { hasQuality = true, minPoints = 50 } = {}) {
    this.sensorId = sensorId;
    this.onScan = onScan;
    this.hasQuality = hasQuality;
    this.minPoints = minPoints;
    this.reset();
  }

  reset() {
    this.angle = new Float32Array(MAX_POINTS);
    this.dist = new Float32Array(MAX_POINTS);
    this.quality = new Uint8Array(MAX_POINTS);
    this.n = 0;
    this.deviceTs = 0;
    this.started = false; // drop the partial first revolution
    this.overflow = 0;
  }

  /** Called when a new revolution starts (S flag) BEFORE pushing that sample. */
  sync(nowMs) {
    if (this.started && this.n >= this.minPoints) {
      const n = this.n;
      this.onScan({
        sensorId: this.sensorId,
        t: nowMs,
        deviceTs: this.deviceTs,
        count: n,
        angle: this.angle.slice(0, n),
        dist: this.dist.slice(0, n),
        quality: this.quality.slice(0, n),
        hasQuality: this.hasQuality,
      });
    }
    this.started = true;
    this.n = 0;
  }

  push(angle, dist, quality, sync, nowMs) {
    if (sync) this.sync(nowMs);
    if (!this.started) return;
    if (this.n >= MAX_POINTS) { this.overflow++; return; }
    const i = this.n++;
    this.angle[i] = angle;
    this.dist[i] = dist;
    this.quality[i] = quality;
  }
}
