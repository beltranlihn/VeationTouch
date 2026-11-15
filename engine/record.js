// Recording and replay of RAW sensor revolutions (before any processing), so a session recorded in
// the room can be replayed anywhere to tune background, filters, tracking and calibration.
//
// File: gzip stream of
//   "VTREC1\n" + JSON header line + "\n"
//   frames: u32 byteLength | u8 sensorIndex | f64 tMs (from start) | u32 n |
//           n × u16 angle (deg·64) | n × u16 dist (mm, clamped) | n × u8 quality
// ≈ 5 bytes/sample → ~16 kB per revolution before gzip.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';

const MAGIC = 'VTREC1\n';
const MAX_MS = 10 * 60 * 1000;

export class Recorder {
  /** @param {string} dir recordings folder @param {object} profile @param {object} log */
  constructor(dir, profile, log, name) {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = String(name || profile.id).replace(/[^\w.-]+/g, '-').slice(0, 40);
    this.file = path.join(dir, `${stamp}-${safe}.vtrec.gz`);
    this.log = log;
    this.sensorIds = profile.sensors.map((s) => s.id);
    this.t0 = performance.now();
    this.frames = 0;
    this.bytes = 0;
    this.gz = zlib.createGzip({ level: 4 });
    this.out = fs.createWriteStream(this.file);
    this.gz.pipe(this.out);
    const header = { version: 1, profileId: profile.id, profileName: profile.name, sensors: this.sensorIds, startedAt: new Date().toISOString(), profile };
    this.gz.write(MAGIC + JSON.stringify(header) + '\n');
  }

  get elapsed() { return performance.now() - this.t0; }

  /** @param {import('./drivers/scan.js').Scan} scan */
  write(scan) {
    const si = this.sensorIds.indexOf(scan.sensorId);
    if (si < 0 || this.closed) return;
    if (this.elapsed > MAX_MS) { this.stop(); return; }
    const n = scan.count;
    const buf = Buffer.alloc(4 + 1 + 8 + 4 + n * 5);
    let o = 0;
    buf.writeUInt32LE(buf.length - 4, o); o += 4;
    buf.writeUInt8(si, o); o += 1;
    buf.writeDoubleLE(scan.t - this.t0, o); o += 8;
    buf.writeUInt32LE(n, o); o += 4;
    for (let i = 0; i < n; i++) { buf.writeUInt16LE(Math.round(((scan.angle[i] % 360) + 360) % 360 * 64) & 0xffff, o); o += 2; }
    for (let i = 0; i < n; i++) { buf.writeUInt16LE(Math.min(65535, Math.max(0, Math.round(scan.dist[i]))), o); o += 2; }
    for (let i = 0; i < n; i++) buf[o++] = scan.quality[i];
    this.gz.write(buf);
    this.frames++;
    this.bytes += buf.length;
  }

  stop() {
    if (this.closed) return Promise.resolve(this.file);
    this.closed = true;
    return new Promise((resolve) => {
      this.out.on('finish', () => resolve(this.file));
      this.gz.end();
    }).then((f) => { this.log.info(`recording saved: ${path.basename(f)} (${this.frames} revolutions, ${Math.round(this.elapsed / 1000)} s)`); return f; });
  }
}

/** Read a recording header without decompressing the whole file. */
export async function readHeader(file) {
  const stream = fs.createReadStream(file).pipe(zlib.createGunzip());
  let acc = Buffer.alloc(0);
  for await (const chunk of stream) {
    acc = Buffer.concat([acc, chunk]);
    const nl = acc.indexOf('\n', MAGIC.length);
    if (nl > 0) { stream.destroy(); return JSON.parse(acc.subarray(MAGIC.length, nl).toString('utf8')); }
    if (acc.length > 4 * 1024 * 1024) break;
  }
  throw new Error('not a VEATION Touch recording');
}

export function listRecordings(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.vtrec.gz')).sort().reverse().map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return { file: f, bytes: st.size, at: st.mtime.toISOString() };
  });
}

/**
 * Plays a recording back in real time, emitting `scan` events with the ORIGINAL sensor ids and
 * fresh host timestamps (the trackers need "now"). Loops by default.
 */
export class ReplaySource extends EventEmitter {
  constructor(file, { loop = true, speed = 1 } = {}) {
    super();
    this.file = file; this.loop = loop; this.speed = speed;
    this.playing = false; this.pos = 0; this.duration = 0; this.header = null;
  }

  async start() {
    this.playing = true;
    while (this.playing) {
      await this._playOnce();
      if (!this.loop) break;
    }
    this.playing = false;
    this.emit('end');
  }

  stop() { this.playing = false; this.stream?.destroy(); }

  async _playOnce() {
    this.stream = fs.createReadStream(this.file).pipe(zlib.createGunzip());
    let acc = Buffer.alloc(0), headerDone = false;
    const t0 = performance.now();
    for await (const chunk of this.stream) {
      if (!this.playing) return;
      acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
      if (!headerDone) {
        const nl = acc.indexOf('\n', MAGIC.length);
        if (nl < 0) continue;
        if (acc.subarray(0, MAGIC.length).toString() !== MAGIC) throw new Error('not a VEATION Touch recording');
        this.header = JSON.parse(acc.subarray(MAGIC.length, nl).toString('utf8'));
        acc = acc.subarray(nl + 1);
        headerDone = true;
        this.emit('header', this.header);
      }
      let o = 0;
      while (acc.length - o >= 4) {
        const len = acc.readUInt32LE(o);
        if (acc.length - o - 4 < len) break;
        const f = acc.subarray(o + 4, o + 4 + len);
        o += 4 + len;
        const si = f[0], tRel = f.readDoubleLE(1), n = f.readUInt32LE(9);
        const wait = t0 + tRel / this.speed - performance.now();
        if (wait > 1) await new Promise((r) => setTimeout(r, wait));
        if (!this.playing) return;
        const angle = new Float32Array(n), dist = new Float32Array(n), quality = new Uint8Array(n);
        let p = 13;
        for (let i = 0; i < n; i++, p += 2) angle[i] = f.readUInt16LE(p) / 64;
        for (let i = 0; i < n; i++, p += 2) dist[i] = f.readUInt16LE(p);
        for (let i = 0; i < n; i++) quality[i] = f[p + i];
        this.pos = tRel;
        this.duration = Math.max(this.duration, tRel);
        const sensorId = this.header.sensors[si];
        this.emit('scan', { sensorId, t: performance.now(), deviceTs: 0, count: n, angle, dist, quality, hasQuality: true });
      }
      acc = acc.subarray(o);
    }
  }
}

/** A driver that takes its scans from a ReplaySource (one per sensor id). */
export class ReplayDriver extends EventEmitter {
  constructor(id, source) {
    super();
    this.idv = id;
    this.source = source;
    this.status = { state: 'stopped', info: { model: 0, firmware: 'replay', hardware: 0, serial: `REPLAY-${id}` }, health: { status: 0, errorCode: 0 }, modes: [], mode: null, modeName: 'Replay', ansType: 0, hz: 0, pps: 0, crcErrors: 0, lastError: null, lastPacketAt: 0, restarts: 0 };
    this._on = (scan) => {
      if (scan.sensorId !== this.idv) return;
      this._n = (this._n || 0) + 1;
      const now = performance.now();
      if (!this._t || now - this._t >= 1000) { this.status.hz = this._t ? Math.round((this._n * 1000) / (now - this._t)) : 0; this._n = 0; this._t = now; }
      this.status.lastPacketAt = now;
      this.status.state = 'scanning';
      this.emit('scan', scan);
    };
  }

  get id() { return this.idv; }
  start() { this.source.on('scan', this._on); this.status.state = 'starting'; this.emit('status', this.status); }
  async stop() { this.source.off('scan', this._on); this.status.state = 'stopped'; this.status.hz = 0; this.emit('status', this.status); }
}
