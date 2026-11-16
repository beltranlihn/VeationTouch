// A software RPLIDAR S2E: a UDP server that speaks the S2E protocol and streams capsules
// generated from a SimWall. Used by the driver tests and by `--emulate` for end-to-end
// runs without hardware. Not a reference for the real device's timing.

import dgram from 'node:dgram';
import * as P from '../drivers/s2e-protocol.js';

const MODES = [
  { name: 'Standard', ans: P.ANS.STANDARD, us: 62.5, max: 16 },
  { name: 'DenseBoost', ans: P.ANS.DENSE, us: 31.25, max: 30 },
  { name: 'Sensitivity', ans: P.ANS.HQ, us: 31.25, max: 30 },
];
const SAMPLES_PER_REV = 3200;

export class S2EEmulator {
  /** @param {import('./world.js').SimWall} world */
  /**
   * rebind: like the real unit, a RESET after a static-IP change brings it back on the new address (after rebootMs).
   * serial: the unit's 16-byte serial number as 32 hex digits (GET_INFO).
   */
  constructor(world, { port = 0, host = '127.0.0.1', typical = 1, splitDatagrams = true, rebind = false, rebootMs = 300, serial = Buffer.from('EMULATORS2E00001').toString('hex') } = {}) {
    this.world = world;
    this.port = port;
    this.host = host;
    this.rebind = rebind;
    this.rebootMs = rebootMs;
    this.serial = Buffer.from(serial.padEnd(32, '0').slice(0, 32), 'hex');
    this.typical = typical;
    this.split = splitDatagrams;
    this.client = null;
    this.mode = -1;
    this.idx = 0; // global sample index → angle
    this.health = { status: 0, errorCode: 0 };
    this.silent = false; // tests: simulate a cable cut
    this.log = [];
  }

  start() {
    return new Promise((resolve) => {
      this.sock = dgram.createSocket('udp4');
      this.sock.on('message', (m, r) => this._onRequest(m, r));
      this.sock.bind(this.port, this.host, () => {
        this.port = this.sock.address().port;
        resolve(this.port);
      });
    });
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    try { this.sock?.close(); } catch { /* closed */ }
  }

  _send(buf) {
    if (!this.client || this.silent) return;
    this.sock.send(buf, this.client.port, this.client.address);
  }

  _reply(type, data, mode = 0) {
    this._send(Buffer.concat([P.buildDescriptor(data.length, mode, type), data]));
  }

  _onRequest(m, rinfo) {
    this.client = { address: rinfo.address, port: rinfo.port };
    for (let i = 0; i < m.length;) {
      if (m[i] !== 0xa5) { i++; continue; }
      const cmd = m[i + 1];
      let payload = null, len = 2;
      if (cmd >= 0x80) { const n = m[i + 2]; payload = m.subarray(i + 3, i + 3 + n); len = 4 + n; }
      this.log.push(cmd);
      this._handle(cmd, payload);
      i += len;
    }
  }

  _handle(cmd, payload) {
    const C = P.CMD;
    switch (cmd) {
      case C.STOP: this._stopStream(); break;
      case C.RESET: {
        this._stopStream();
        if (this.rebind && this.staticIp && this.staticIp.ip !== this.host) this._reboot(this.staticIp.ip);
        break;
      }
      case C.GET_HEALTH: {
        const d = Buffer.alloc(3); d[0] = this.health.status; d.writeUInt16LE(this.health.errorCode, 1);
        this._reply(P.ANS.HEALTH, d); break;
      }
      case C.GET_INFO: {
        const d = Buffer.alloc(20); d[0] = 0x71; d[1] = 3; d[2] = 1; d[3] = 18;
        this.serial.copy(d, 4);
        this._reply(P.ANS.DEVINFO, d); break;
      }
      case C.GET_LIDAR_CONF: this._conf(payload); break;
      case C.SET_LIDAR_CONF: {
        const type = payload.readUInt32LE(0);
        const d = Buffer.alloc(8); d.writeUInt32LE(type, 0);
        if (type === P.CONF.STATIC_IP && payload.length >= 16) {
          const q = (o) => [...payload.subarray(o, o + 4)].join('.');
          this.staticIp = { ip: q(4), mask: q(8), gw: q(12) };
        } else d.writeUInt32LE(1, 4); // unsupported entry
        this._reply(P.ANS.SET_CONF, d);
        break;
      }
      case C.EXPRESS_SCAN: this._startStream(payload[0]); break;
      case C.SCAN: this._startStream(0); break;
      default: break; // MOTOR_SPEED_CTRL etc. are accepted silently
    }
  }

  _conf(p) {
    const type = p.readUInt32LE(0);
    const id = p.length >= 6 ? p.readUInt16LE(4) : 0;
    const out = (val) => {
      const d = Buffer.alloc(4 + val.length); d.writeUInt32LE(type, 0); val.copy(d, 4);
      this._reply(P.ANS.GET_CONF, d);
    };
    const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
    const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
    const m = MODES[id] || MODES[0];
    switch (type) {
      case P.CONF.SCAN_MODE_COUNT: out(u16(MODES.length)); break;
      case P.CONF.SCAN_MODE_TYPICAL: out(u16(this.typical)); break;
      case P.CONF.SCAN_MODE_NAME: out(Buffer.from(m.name + '\0', 'utf8')); break;
      case P.CONF.SCAN_MODE_ANS_TYPE: out(Buffer.from([m.ans])); break;
      case P.CONF.SCAN_MODE_US_PER_SAMPLE: out(u32(Math.round(m.us * 256))); break;
      case P.CONF.SCAN_MODE_MAX_DISTANCE: out(u32(m.max * 256)); break;
      case P.CONF.STATIC_IP: {
        const cur = this.staticIp || { ip: this.host, mask: '255.255.255.0', gw: this.host.replace(/\.\d+$/, '.1') };
        out(Buffer.from([cur.ip, cur.mask, cur.gw].flatMap((s) => s.split('.').map(Number))));
        break;
      }
      default: break; // unknown entries: no answer (driver times out), like old firmware
    }
  }

  /** The unit restarts on a new address: silent while it boots, then it answers there (same port). */
  _reboot(ip) {
    try { this.sock.close(); } catch { /* closed */ }
    this.client = null;
    this.host = ip;
    setTimeout(() => {
      this.sock = dgram.createSocket('udp4');
      this.sock.on('message', (m, r) => this._onRequest(m, r));
      this.sock.on('error', () => {});
      this.sock.bind(this.port, this.host);
    }, this.rebootMs);
  }

  _stopStream() {
    clearInterval(this.timer);
    this.timer = null;
    this.mode = -1;
  }

  _startStream(mode) {
    this._stopStream();
    this.mode = mode;
    const m = MODES[mode] || MODES[0];
    const size = P.PACKET_SIZE[m.ans];
    // Multi-response descriptor: its length field is the size of each data packet.
    this._send(P.buildDescriptor(size, 1, m.ans));
    let last = performance.now();
    let carry = 0;
    this.timer = setInterval(() => {
      const t = performance.now();
      const samplesPerSec = (SAMPLES_PER_REV * 10);
      carry += ((t - last) / 1000) * samplesPerSec;
      last = t;
      this.world.step(0.01);
      const hands = this.world.hands();
      const out = [];
      const perPkt = m.ans === P.ANS.HQ ? 96 : m.ans === P.ANS.DENSE ? 40 : 1;
      while (carry >= perPkt) {
        carry -= perPkt;
        out.push(this._packet(m.ans, perPkt, hands, t));
      }
      if (!out.length) return;
      if (this.split) {
        // deliberately misalign datagrams to exercise the reassembler
        const all = Buffer.concat(out);
        for (let i = 0; i < all.length; i += 1000) this._send(all.subarray(i, i + 1000));
      } else this._send(Buffer.concat(out));
    }, 10);
  }

  _angleOf(i) { return ((i % SAMPLES_PER_REV) * 360) / SAMPLES_PER_REV; }

  _packet(ans, n, hands, t) {
    const i0 = this.idx;
    this.idx += n;
    if (ans === P.ANS.HQ) {
      const nodes = [];
      for (let k = 0; k < n; k++) {
        const i = i0 + k;
        const a = this._angleOf(i);
        const d = this.world.raycast(a, hands);
        nodes.push({ angle: a, dist: d, quality: d ? 180 : 0, sync: i % SAMPLES_PER_REV === 0 });
      }
      return P.buildHq(t * 1000, nodes);
    }
    if (ans === P.ANS.DENSE) {
      const dists = [];
      for (let k = 0; k < n; k++) dists.push(this.world.raycast(this._angleOf(i0 + k), hands));
      // 40 divides 3200, so packets align with revolutions: the S flag goes on the first one.
      return P.buildDense(this._angleOf(i0), i0 % SAMPLES_PER_REV === 0, dists);
    }
    const a = this._angleOf(i0);
    const d = this.world.raycast(a, hands);
    const sync = i0 % SAMPLES_PER_REV === 0;
    const b = Buffer.alloc(5);
    b[0] = (45 << 2) | ((sync ? 0 : 1) << 1) | (sync ? 1 : 0);
    b.writeUInt16LE((Math.round(a * 64) << 1) | 1, 1);
    b.writeUInt16LE(Math.round(d * 4) & 0xffff, 3);
    return b;
  }
}
