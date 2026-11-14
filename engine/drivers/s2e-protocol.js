// Slamtec RPLIDAR S2E wire protocol — clean-room implementation from the published
// "RPLIDAR S2E Protocol v1.0" (see docs/research/notes/Documentacion oficial S2E/s2e_official_docs.md).
// Pure functions: no sockets here, so everything is unit-testable.

export const CMD = Object.freeze({
  STOP: 0x25,
  RESET: 0x40,
  SCAN: 0x20,
  EXPRESS_SCAN: 0x82,
  GET_INFO: 0x50,
  GET_HEALTH: 0x52,
  GET_SAMPLERATE: 0x59,
  GET_LIDAR_CONF: 0x84,
  SET_LIDAR_CONF: 0x85,
  MOTOR_SPEED_CTRL: 0xa8,
});

export const ANS = Object.freeze({
  DEVINFO: 0x04,
  HEALTH: 0x06,
  SAMPLERATE: 0x15,
  GET_CONF: 0x20,
  SET_CONF: 0x21,
  STANDARD: 0x81,
  CAPSULE: 0x82,
  HQ: 0x83,
  ULTRA_CAPSULE: 0x84,
  DENSE: 0x85,
  ULTRA_DENSE: 0x86,
});

export const CONF = Object.freeze({
  SCAN_MODE_COUNT: 0x70,
  SCAN_MODE_US_PER_SAMPLE: 0x71,
  SCAN_MODE_MAX_DISTANCE: 0x74,
  SCAN_MODE_ANS_TYPE: 0x75,
  SCAN_MODE_TYPICAL: 0x7c,
  SCAN_MODE_NAME: 0x7f,
  STATIC_IP: 0x0001ccc0,
});

export const PACKET_SIZE = Object.freeze({ [ANS.DENSE]: 84, [ANS.HQ]: 781, [ANS.STANDARD]: 5 });

/** Build a request. Commands without payload are 2 bytes (A5 cmd). */
export function request(cmd, payload) {
  if (!payload || payload.length === 0) return Buffer.from([0xa5, cmd]);
  if (payload.length > 255) throw new RangeError('payload too long');
  const buf = Buffer.alloc(4 + payload.length);
  buf[0] = 0xa5; buf[1] = cmd; buf[2] = payload.length;
  Buffer.from(payload).copy(buf, 3);
  let chk = 0;
  for (let i = 0; i < 3 + payload.length; i++) chk ^= buf[i];
  buf[3 + payload.length] = chk;
  return buf;
}

export const expressScan = (mode) => request(CMD.EXPRESS_SCAN, [mode & 0xff, 0, 0, 0, 0]);

export function motorSpeed(rpm) {
  const r = Math.max(0, Math.min(0xffff, Math.round(rpm)));
  return request(CMD.MOTOR_SPEED_CTRL, [r & 0xff, r >> 8]);
}

/** GET_LIDAR_CONF for `type` with an optional u16 argument (scan mode id). */
export function getConf(type, arg) {
  const p = Buffer.alloc(arg === undefined ? 4 : 6);
  p.writeUInt32LE(type >>> 0, 0);
  if (arg !== undefined) p.writeUInt16LE(arg, 4);
  return request(CMD.GET_LIDAR_CONF, p);
}

/** SET_LIDAR_CONF STATIC_IP: ip/mask/gw as dotted strings. Untested on hardware. */
export function setStaticIp(ip, mask, gw) {
  const parts = [ip, mask, gw].map((s) => s.split('.').map((n) => Number(n) & 0xff));
  if (parts.some((p) => p.length !== 4)) throw new Error('invalid IPv4');
  const p = Buffer.alloc(16);
  p.writeUInt32LE(CONF.STATIC_IP, 0);
  Buffer.from(parts.flat()).copy(p, 4);
  return request(CMD.SET_LIDAR_CONF, p);
}

/**
 * Try to read a 7-byte response descriptor at `buf[off]`.
 * @returns {{length:number, mode:number, type:number}|null}
 */
export function parseDescriptor(buf, off = 0) {
  if (buf.length - off < 7 || buf[off] !== 0xa5 || buf[off + 1] !== 0x5a) return null;
  const v = buf.readUInt32LE(off + 2);
  return { length: v & 0x3fffffff, mode: v >>> 30, type: buf[off + 6] };
}

/** Find the next descriptor in a buffer (returns its offset or -1). */
export function findDescriptor(buf, from = 0) {
  for (let i = from; i + 1 < buf.length; i++) if (buf[i] === 0xa5 && buf[i + 1] === 0x5a) return i;
  return -1;
}

export function parseInfo(d) {
  return {
    model: d[0],
    firmware: `${d[2]}.${String(d[1]).padStart(2, '0')}`,
    hardware: d[3],
    serial: Buffer.from(d.subarray(4, 20)).toString('hex').toUpperCase(),
  };
}

export function parseHealth(d) {
  return { status: d[0], errorCode: d.readUInt16LE(1) };
}

/** Value of a GET_LIDAR_CONF answer (after the u32 type echo). */
export function parseConf(d) {
  return { type: d.readUInt32LE(0), value: d.subarray(4) };
}

// ---------------------------------------------------------------- CRC32 (HQ capsule)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf, start = 0, end = buf.length, padTo4 = false) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  if (padTo4) {
    const pad = (4 - ((end - start) % 4)) % 4;
    for (let i = 0; i < pad; i++) c = CRC_TABLE[c & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- capsule decoders

/** Validate a dense capsule (84 B). */
export function denseValid(p) {
  if (p.length < 84 || p[0] >> 4 !== 0xa || p[1] >> 4 !== 0x5) return false;
  const expected = (p[0] & 0x0f) | ((p[1] & 0x0f) << 4);
  let x = 0;
  for (let i = 2; i < 84; i++) x ^= p[i];
  return x === expected;
}

/** Header of a dense capsule. */
export function denseHeader(p) {
  const raw = p.readUInt16LE(2);
  return { start: (raw & 0x7fff) / 64, sync: (raw & 0x8000) !== 0 };
}

/** Distances (mm) of a dense capsule, 40 cabins. */
export function denseDistances(p) {
  const out = new Uint16Array(40);
  for (let k = 0; k < 40; k++) out[k] = p.readUInt16LE(4 + k * 2);
  return out;
}

/** HQ capsule validity: sync byte + CRC (both padding variants accepted). */
export function hqValid(p) {
  if (p.length < 781 || p[0] !== 0xa5) return 0;
  const want = p.readUInt32LE(777);
  if (crc32(p, 0, 777, false) === want) return 1;
  if (crc32(p, 0, 777, true) === want) return 2;
  return 0;
}

/**
 * Decode an HQ capsule into the provided sink.
 * @param {Buffer} p
 * @param {(angleDeg:number, distMm:number, quality:number, sync:boolean)=>void} emit
 * @returns {number} device timestamp (µs, as Number — precision fine for ~285 years)
 */
export function decodeHq(p, emit) {
  const ts = Number(p.readBigUInt64LE(1));
  for (let k = 0; k < 96; k++) {
    const o = 9 + k * 8;
    const ang = (p.readUInt16LE(o) * 90) / 16384;
    const dist = p.readUInt32LE(o + 2) / 4;
    emit(ang, dist, p[o + 6], (p[o + 7] & 1) === 1);
  }
  return ts;
}

/** Standard 5-byte node. Returns null if the check bits fail. */
export function decodeStandard(p) {
  const s = p[0] & 1, ns = (p[0] >> 1) & 1, c = p[1] & 1;
  if (s === ns || c !== 1) return null;
  return {
    quality: p[0] >> 2,
    angle: (p.readUInt16LE(1) >> 1) / 64,
    dist: p.readUInt16LE(3) / 4,
    sync: s === 1,
  };
}

// ---------------------------------------------------------------- builders (simulator/tests)

/** Build a valid dense capsule (inverse of the decoder). */
export function buildDense(startDeg, sync, distances) {
  const p = Buffer.alloc(84);
  let raw = Math.round(((startDeg % 360) + 360) % 360 * 64) & 0x7fff;
  if (sync) raw |= 0x8000;
  p.writeUInt16LE(raw, 2);
  for (let k = 0; k < 40; k++) p.writeUInt16LE(Math.max(0, Math.min(0xffff, Math.round(distances[k] || 0))), 4 + k * 2);
  let x = 0;
  for (let i = 2; i < 84; i++) x ^= p[i];
  p[0] = 0xa0 | (x & 0x0f);
  p[1] = 0x50 | (x >> 4);
  return p;
}

/** Build a valid HQ capsule. nodes: [{angle, dist, quality, sync}] × 96 */
export function buildHq(timestampUs, nodes) {
  const p = Buffer.alloc(781);
  p[0] = 0xa5;
  p.writeBigUInt64LE(BigInt(Math.max(0, Math.round(timestampUs))), 1);
  for (let k = 0; k < 96; k++) {
    const n = nodes[k] || { angle: 0, dist: 0, quality: 0, sync: false };
    const o = 9 + k * 8;
    p.writeUInt16LE(Math.round((((n.angle % 360) + 360) % 360) * 16384 / 90) & 0xffff, o);
    p.writeUInt32LE(Math.max(0, Math.round(n.dist * 4)) >>> 0, o + 2);
    p[o + 6] = n.quality & 0xff;
    p[o + 7] = n.sync ? 1 : 0;
  }
  p.writeUInt32LE(crc32(p, 0, 777, false), 777);
  return p;
}

export function buildDescriptor(length, mode, type) {
  const b = Buffer.alloc(7);
  b[0] = 0xa5; b[1] = 0x5a;
  b.writeUInt32LE(((mode & 3) << 30) | (length & 0x3fffffff), 2);
  b[6] = type;
  return b;
}
