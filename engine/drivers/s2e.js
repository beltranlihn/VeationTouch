// UDP driver for the Slamtec RPLIDAR S2E. One instance = one sensor = one socket.
// The LiDAR is a UDP server (default 192.168.11.2:8089) and never talks first.
// Recovery is host-side (the protocol has no keep-alive): watchdog → STOP/restart →
// RESET → reopen socket, with backoff. See ARCHITECTURE.md › Drivers.

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import * as P from './s2e-protocol.js';
import { ScanBuilder } from './scan.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

const WATCHDOG_MS = 2000;
const QUERY_TIMEOUT_MS = 2000;
const FIRST_PACKET_TIMEOUT_MS = 8000; // spin-up: data only flows once the motor is stable
const MAX_RX = 64 * 1024;

export class S2EDriver extends EventEmitter {
  /**
   * @param {{id:string, host:string, port?:number, scanMode?:string|number, motorRpm?:number}} cfg
   * @param {{info:Function, warn:Function, error:Function}} log
   */
  constructor(cfg, log) {
    super();
    this.cfg = { port: 8089, scanMode: 'auto', motorRpm: 0, ...cfg };
    this.log = log;
    this.running = false;
    this.sock = null;
    this.rx = Buffer.alloc(0);
    this.pending = null;
    this.stream = null; // { type, size, prevDense }
    this.failures = 0;
    this.modes = null;
    this.status = {
      state: 'stopped', info: null, health: null, modes: null, mode: null, modeName: null,
      ansType: null, hz: 0, pps: 0, crcErrors: 0, lastError: null, lastPacketAt: 0, restarts: 0,
    };
    this._revCount = 0; this._pktCount = 0; this._rateT = now();
    this.builder = new ScanBuilder(this.cfg.id, (scan) => { this._revCount++; this.emit('scan', scan); });
  }

  get id() { return this.cfg.id; }

  setState(state, extra = {}) {
    Object.assign(this.status, { state }, extra);
    this.emit('status', this.status);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
    this._wd = setInterval(() => this._watch(), 500);
  }

  async stop() {
    this.running = false;
    clearInterval(this._wd);
    const brk = this._breakStream; this._breakStream = null;
    brk?.();
    try { this._send(P.request(P.CMD.STOP)); } catch { /* socket may be gone */ }
    await sleep(50);
    this._close();
    this.setState('stopped');
  }

  // ------------------------------------------------------------------ session loop

  async _loop() {
    while (this.running) {
      try {
        if (!this.sock) await this._open();
        await this._session();
        // _session returns once streaming started; wait until the watchdog breaks it.
        await new Promise((resolve) => { this._breakStream = resolve; });
      } catch (e) {
        if (!this.running) break;
        this.failures++;
        this.status.restarts++;
        const msg = e?.message || String(e);
        this.log.warn(`[${this.id}] ${msg} (attempt ${this.failures})`);
        this.setState(e?.fatal ? 'error' : 'offline', { lastError: msg });
        if (this.failures % 4 === 0) this._close(); // ladder: reopen the socket every 4th failure
        if (e?.fatal) await sleep(10000);
        else await sleep(Math.min(10000, 500 * 2 ** Math.min(this.failures, 5)));
      }
    }
  }

  _open() {
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket({ type: 'udp4' });
      s.on('error', (e) => { this.log.warn(`[${this.id}] socket: ${e.message}`); });
      s.on('message', (msg, rinfo) => {
        if (rinfo.address !== this.cfg.host) return;
        this._onData(msg);
      });
      s.once('listening', () => {
        try { s.setRecvBufferSize(1 << 20); } catch { /* best effort */ }
        resolve();
      });
      s.once('error', reject);
      s.bind(0);
      this.sock = s;
    });
  }

  _close() {
    if (this.sock) { try { this.sock.close(); } catch { /* already closed */ } }
    this.sock = null;
    this.stream = null;
    this.rx = Buffer.alloc(0);
  }

  _send(buf) {
    if (!this.sock) throw new Error('socket closed');
    this.sock.send(buf, this.cfg.port, this.cfg.host);
  }

  async _session() {
    this.stream = null;
    // After a loss we stay "offline" (reconnecting) until data flows again.
    const recovering = this.status.state === 'offline' || this.status.state === 'error';
    if (!recovering) this.setState('connecting');
    this._send(P.request(P.CMD.STOP));
    await sleep(100);
    this.rx = Buffer.alloc(0);

    let health = await this._query(P.request(P.CMD.GET_HEALTH), P.ANS.HEALTH).then(P.parseHealth);
    if (health.status === 2) {
      this.log.warn(`[${this.id}] protection stop (error 0x${health.errorCode.toString(16)}), resetting`);
      this._send(P.request(P.CMD.RESET));
      await sleep(1200);
      this.rx = Buffer.alloc(0);
      health = await this._query(P.request(P.CMD.GET_HEALTH), P.ANS.HEALTH).then(P.parseHealth);
      if (health.status === 2) {
        const e = new Error(`hardware protection stop (error 0x${health.errorCode.toString(16)})`);
        e.fatal = true;
        throw e;
      }
    }
    const info = await this._query(P.request(P.CMD.GET_INFO), P.ANS.DEVINFO).then(P.parseInfo);
    this.status.health = health;
    this.status.info = info;

    if (!this.modes) this.modes = await this._enumerateModes();
    this.status.modes = this.modes.list;
    const mode = this._chooseMode();

    let desc;
    if (mode === null) {
      this._send(P.request(P.CMD.SCAN));
      desc = await this._awaitDescriptor([P.ANS.STANDARD], QUERY_TIMEOUT_MS);
    } else {
      this._send(P.expressScan(mode.id));
      desc = await this._awaitDescriptor([P.ANS.DENSE, P.ANS.HQ, P.ANS.STANDARD], QUERY_TIMEOUT_MS);
    }
    const size = P.PACKET_SIZE[desc.type];
    if (!size) throw new Error(`unsupported answer type 0x${desc.type.toString(16)}`);
    this.builder.hasQuality = desc.type !== P.ANS.DENSE;
    this.builder.reset();
    this.stream = { type: desc.type, size, prevDense: null, startedAt: now() };
    this.status.lastPacketAt = 0;
    if (this.cfg.motorRpm > 0) {
      await sleep(10);
      this._send(P.motorSpeed(this.cfg.motorRpm));
    }
    this.setState(recovering ? 'offline' : 'starting', { mode: mode?.id ?? null, modeName: mode?.name ?? 'Standard', ansType: desc.type });
    this.log.info(`[${this.id}] ${info.serial} fw ${info.firmware} → scanning in ${mode?.name ?? 'Standard'} (0x${desc.type.toString(16)})`);
  }

  async _enumerateModes() {
    const list = [];
    let typical = null;
    const conf = (type, arg) => this._query(P.getConf(type, arg), P.ANS.GET_CONF).then((d) => {
      const c = P.parseConf(d);
      if (c.type !== type) throw new Error(`conf answer for 0x${c.type.toString(16)}, expected 0x${type.toString(16)}`);
      return c.value;
    });
    try {
      const count = (await conf(P.CONF.SCAN_MODE_COUNT)).readUInt16LE(0);
      for (let id = 0; id < count && id < 16; id++) {
        const name = (await conf(P.CONF.SCAN_MODE_NAME, id)).toString('utf8').replace(/\0.*$/s, '');
        const ans = (await conf(P.CONF.SCAN_MODE_ANS_TYPE, id))[0];
        const us = (await conf(P.CONF.SCAN_MODE_US_PER_SAMPLE, id)).readUInt32LE(0) / 256;
        const maxD = (await conf(P.CONF.SCAN_MODE_MAX_DISTANCE, id)).readUInt32LE(0) / 256;
        list.push({ id, name, ansType: ans, usPerSample: us, maxDistance: maxD });
      }
      typical = (await conf(P.CONF.SCAN_MODE_TYPICAL)).readUInt16LE(0);
    } catch (e) {
      this.log.warn(`[${this.id}] scan-mode query failed (${e.message}); falling back to Standard`);
    }
    return { list, typical };
  }

  _chooseMode() {
    const { list, typical } = this.modes;
    if (!list.length) return null;
    const want = this.cfg.scanMode;
    if (typeof want === 'number') return list.find((m) => m.id === want) ?? list[0];
    const byAns = (a) => list.find((m) => m.ansType === a && P.PACKET_SIZE[a]);
    if (want === 'sensitivity') return byAns(P.ANS.HQ) ?? list[0];
    if (want === 'dense') return byAns(P.ANS.DENSE) ?? list[0];
    const typ = list.find((m) => m.id === typical);
    if (want === 'typical' && typ) return typ;
    // auto: Sensitivity gives true per-sample angles, quality and a CRC → preferred for touch.
    return byAns(P.ANS.HQ) ?? (typ && P.PACKET_SIZE[typ.ansType] ? typ : null) ?? byAns(P.ANS.DENSE) ?? null;
  }

  // ------------------------------------------------------------------ request/response

  _query(req, type) {
    this._send(req);
    return this._awaitDescriptor([type], QUERY_TIMEOUT_MS, true);
  }

  /** Wait for a descriptor of one of `types`; with `withData` also wait for its payload. */
  _awaitDescriptor(types, timeoutMs, withData = false) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`no answer (0x${types[0].toString(16)}) from ${this.cfg.host}:${this.cfg.port}`));
      }, timeoutMs);
      this.pending = { types, withData, resolve: (v) => { clearTimeout(timer); this.pending = null; resolve(v); } };
      this._parse();
    });
  }

  // ------------------------------------------------------------------ receive path

  _onData(msg) {
    this.rx = this.rx.length ? Buffer.concat([this.rx, msg]) : msg;
    if (this.rx.length > MAX_RX) this.rx = this.rx.subarray(this.rx.length - MAX_RX);
    this._parse();
  }

  _parse() {
    if (this.pending) {
      const off = P.findDescriptor(this.rx);
      if (off < 0) { if (this.rx.length > 1) this.rx = this.rx.subarray(this.rx.length - 1); return; }
      const d = P.parseDescriptor(this.rx, off);
      if (!d) { this.rx = this.rx.subarray(off); return; }
      if (!this.pending.types.includes(d.type)) { this.rx = this.rx.subarray(off + 2); this._parse(); return; }
      if (this.pending.withData) {
        if (this.rx.length - off - 7 < d.length) { this.rx = this.rx.subarray(off); return; }
        const data = Buffer.from(this.rx.subarray(off + 7, off + 7 + d.length));
        this.rx = this.rx.subarray(off + 7 + d.length);
        this.pending.resolve(data);
      } else {
        this.rx = this.rx.subarray(off + 7);
        this.pending.resolve(d);
        this._parse();
      }
      return;
    }
    if (this.stream) this._parseStream();
  }

  _parseStream() {
    const s = this.stream;
    let buf = this.rx, i = 0;
    const t = now();
    while (buf.length - i >= s.size) {
      if (s.type === P.ANS.DENSE) {
        if (buf[i] >> 4 !== 0xa || buf[i + 1] >> 4 !== 0x5) { i++; continue; }
        const pkt = buf.subarray(i, i + 84);
        if (!P.denseValid(pkt)) { this.status.crcErrors++; i++; continue; }
        this._onDense(pkt, t);
        i += 84;
      } else if (s.type === P.ANS.HQ) {
        if (buf[i] !== 0xa5) { i++; continue; }
        const pkt = buf.subarray(i, i + 781);
        if (!P.hqValid(pkt)) { this.status.crcErrors++; i++; continue; }
        const ts = P.decodeHq(pkt, (a, d, q, sync) => this.builder.push(a, d, q, sync, t));
        this.builder.deviceTs = ts;
        this._packet(t);
        i += 781;
      } else {
        const n = P.decodeStandard(buf.subarray(i, i + 5));
        if (!n) { i++; continue; }
        this.builder.push(n.angle, n.dist, Math.min(255, n.quality * 4), n.sync, t);
        this._packet(t);
        i += 5;
      }
    }
    this.rx = buf.subarray(i);
  }

  _onDense(pkt, t) {
    const s = this.stream;
    const cur = { ...P.denseHeader(pkt), dist: P.denseDistances(pkt) };
    const prev = s.prevDense;
    s.prevDense = cur;
    this._packet(t);
    if (!prev) return;
    let delta = cur.start - prev.start;
    if (delta < 0) delta += 360;
    if (delta <= 0 || delta > 45) return; // implausible gap: drop the cached packet
    for (let k = 0; k < 40; k++) {
      let a = prev.start + (k * delta) / 40;
      if (a >= 360) a -= 360;
      this.builder.push(a, prev.dist[k], 255, k === 0 && prev.sync, t);
    }
  }

  _packet(t) {
    this._pktCount++;
    this.status.lastPacketAt = t;
    if (this.status.state !== 'scanning') { this.failures = 0; this.setState('scanning'); }
  }

  _watch() {
    const t = now();
    const dt = (t - this._rateT) / 1000;
    if (dt >= 1) {
      this.status.hz = Math.round((this._revCount / dt) * 10) / 10;
      this.status.pps = Math.round(this._pktCount / dt);
      this._revCount = 0; this._pktCount = 0; this._rateT = t;
    }
    if (!this.stream || !this._breakStream) return;
    const since = this.status.lastPacketAt ? t - this.status.lastPacketAt : t - this.stream.startedAt;
    const limit = this.status.lastPacketAt ? WATCHDOG_MS : FIRST_PACKET_TIMEOUT_MS;
    if (since > limit) {
      const msg = this.status.lastPacketAt ? 'data stopped' : 'no data after scan start';
      this.log.warn(`[${this.id}] watchdog: ${msg}`);
      this.stream = null;
      this.failures++;
      this.status.restarts++;
      this.setState('offline', { lastError: msg, hz: 0 });
      const brk = this._breakStream; this._breakStream = null;
      if (this.failures >= 2) {
        try { this._send(P.request(P.CMD.RESET)); } catch { /* ignore */ }
        setTimeout(brk, 1200);
      } else brk();
    }
  }
}
