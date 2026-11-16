// Multicast DNS responder (RFC 6762) for ONE name, so phones and tablets in the room can open
// http://<name>.local:<port>/ instead of an IP address. Own implementation from the RFC, no dependency:
//   · answers A (and ANY) questions for <name>.local with the address of the interface the query came from
//     (same subnet as the querier), on that interface; QU questions and legacy unicast queries get a unicast answer
//   · announces itself on start (twice, 1 s apart), says goodbye (TTL 0) on stop
//   · watches answers from other hosts: another device using the same name is reported, not fought over
// No probing/renaming: the name is the operator's choice (System › Network) and conflicts are shown there.

import dgram from 'node:dgram';
import os from 'node:os';

export const MDNS_ADDR = '224.0.0.251';
export const MDNS_PORT = 5353;
const TYPE_A = 1, TYPE_ANY = 255, CLASS_IN = 1;
const CACHE_FLUSH = 0x8000, QU = 0x8000;
export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// ---------------------------------------------------------------- wire format

/** DNS name at `off` (compression pointers followed). → [name, offset after the name] */
export function readName(buf, off) {
  const labels = [];
  let end = -1, hops = 0;
  for (;;) {
    if (off >= buf.length) throw new Error('truncated name');
    const len = buf[off];
    if (len === 0) { off++; break; }
    if ((len & 0xc0) === 0xc0) {
      if (off + 1 >= buf.length || ++hops > 16) throw new Error('bad pointer');
      if (end < 0) end = off + 2;
      off = ((len & 0x3f) << 8) | buf[off + 1];
      continue;
    }
    if (off + 1 + len > buf.length) throw new Error('truncated label');
    labels.push(buf.toString('utf8', off + 1, off + 1 + len));
    off += 1 + len;
  }
  return [labels.join('.'), end >= 0 ? end : off];
}

function encodeName(name) {
  const parts = [];
  for (const l of name.split('.').filter(Boolean)) { const b = Buffer.from(l, 'utf8'); parts.push(Buffer.from([b.length]), b); }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** @returns {{id:number, response:boolean, questions:{name,type,unicast}[], answers:{name,type,ttl,ip}[]}} */
export function parseMessage(buf) {
  if (buf.length < 12) throw new Error('short packet');
  const id = buf.readUInt16BE(0), flags = buf.readUInt16BE(2), qd = buf.readUInt16BE(4), an = buf.readUInt16BE(6);
  let off = 12;
  const questions = [], answers = [];
  for (let i = 0; i < qd; i++) {
    const [name, o] = readName(buf, off);
    const cls = buf.readUInt16BE(o + 2);
    questions.push({ name, type: buf.readUInt16BE(o), unicast: !!(cls & QU) });
    off = o + 4;
  }
  for (let i = 0; i < an; i++) {
    const [name, o] = readName(buf, off);
    const type = buf.readUInt16BE(o), ttl = buf.readUInt32BE(o + 4), len = buf.readUInt16BE(o + 8);
    answers.push({ name, type, ttl, ip: type === TYPE_A && len === 4 ? [...buf.subarray(o + 10, o + 14)].join('.') : null });
    off = o + 10 + len;
  }
  return { id, response: !!(flags & 0x8000), questions, answers };
}

/** A query (tests, diagnostics). */
export function buildQuery(name, { id = 0, unicast = false, type = TYPE_A } = {}) {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(id, 0); head.writeUInt16BE(1, 4);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0); tail.writeUInt16BE(CLASS_IN | (unicast ? QU : 0), 2);
  return Buffer.concat([head, encodeName(name), tail]);
}

/**
 * Authoritative answer with one A record per address. `legacy` = reply to a plain DNS client (source port ≠ 5353):
 * echo its id and question, no cache-flush bit, TTL ≤ 10 s (RFC 6762 §6.7).
 */
export function buildResponse(name, ips, { ttl = 120, legacy = null } = {}) {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(legacy ? legacy.id : 0, 0);
  head.writeUInt16BE(0x8400, 2); // QR + AA
  head.writeUInt16BE(legacy ? 1 : 0, 4);
  head.writeUInt16BE(ips.length, 6);
  const parts = [head];
  const nm = encodeName(name);
  if (legacy) { const q = Buffer.alloc(4); q.writeUInt16BE(TYPE_A, 0); q.writeUInt16BE(CLASS_IN, 2); parts.push(nm, q); }
  for (const ip of ips) {
    const rr = Buffer.alloc(14);
    rr.writeUInt16BE(TYPE_A, 0);
    rr.writeUInt16BE(CLASS_IN | (legacy ? 0 : CACHE_FLUSH), 2);
    rr.writeUInt32BE(legacy ? Math.min(ttl, 10) : ttl, 4);
    rr.writeUInt16BE(4, 8);
    ip.split('.').forEach((n, k) => { rr[10 + k] = Number(n) & 255; });
    parts.push(nm, rr);
  }
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- interfaces

const ip4 = (s) => s.split('.').reduce((a, n) => ((a << 8) | (Number(n) & 255)) >>> 0, 0);

/** IPv4 addresses a phone could reach (virtual adapters, loopback and link-local left out). */
export function lanInterfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|bluetooth/i.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push({ name, ip: a.address, mask: a.netmask || '255.255.255.0' });
  }
  return out;
}

// ---------------------------------------------------------------- responder

export class MdnsResponder {
  /**
   * @param {{name:string, log:object, port?:number, interfaces?:()=>{ip:string,mask:string}[]}} opt
   *        port and interfaces are injectable for tests
   */
  constructor({ name, log, port = MDNS_PORT, interfaces = lanInterfaces }) {
    this.log = log;
    this.port = port;
    this.interfaces = interfaces;
    this.setName(name);
    this.sock = null;
    this.error = null;
    this.conflict = null;
    this.answered = 0;
    this.joined = new Set();
    this._chain = Promise.resolve();
  }

  setName(name) {
    const n = String(name || '').toLowerCase();
    if (!NAME_RE.test(n)) throw new Error('local name: letters, digits and hyphens only (1–63)');
    this.name = n;
    this.conflict = null;
  }

  get host() { return `${this.name}.local`; }

  info() { return { host: this.host, running: !!this.sock && !this.error, error: this.error, conflict: this.conflict, answered: this.answered }; }

  start() {
    return new Promise((resolve) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock = s;
      s.on('error', (e) => { this.error = e.code === 'EADDRINUSE' ? `UDP ${this.port} is busy` : e.message; this.log.warn(`mDNS: ${this.error}`); resolve(false); });
      s.on('message', (buf, rinfo) => this._onMessage(buf, rinfo));
      s.bind(this.port, () => {
        try { s.setMulticastTTL(255); s.setMulticastLoopback(true); } catch { /* best effort */ }
        this._join();
        this._timer = setInterval(() => this._join(), 30000); // Wi-Fi joined later, cable plugged in…
        this.announce();
        setTimeout(() => this.announce(), 1000);
        this.log.info(`mDNS: answering for ${this.host}`);
        resolve(true);
      });
    });
  }

  /** Join the mDNS group on every LAN interface (new ones too). */
  _join() {
    for (const { ip } of this.interfaces()) {
      if (this.joined.has(ip)) continue;
      try { this.sock.addMembership(MDNS_ADDR, ip); this.joined.add(ip); } catch { /* interface without multicast */ }
    }
  }

  /** Addresses to answer with for a querier: the interface on its subnet; else every LAN address. */
  addressesFor(src) {
    const list = this.interfaces();
    const own = list.find((i) => i.ip === src);
    if (own) return [own.ip];
    const same = list.filter((i) => (ip4(i.ip) & ip4(i.mask)) === (ip4(src) & ip4(i.mask)));
    return (same.length ? same : list).map((i) => i.ip);
  }

  _send(buf, port, host, iface) {
    // one send at a time: the outgoing multicast interface is a socket option
    this._chain = this._chain.then(() => new Promise((resolve) => {
      try { if (iface) this.sock.setMulticastInterface(iface); } catch { /* keep the default route */ }
      this.sock.send(buf, port, host, () => resolve());
    })).catch(() => {});
    return this._chain;
  }

  _onMessage(buf, rinfo) {
    let m;
    try { m = parseMessage(buf); } catch { return; }
    const me = this.host;
    if (m.response) {
      // somebody else answering for our name with an address that is not ours
      const mine = new Set(this.interfaces().map((i) => i.ip));
      const other = m.answers.find((a) => a.name.toLowerCase() === me && a.ip && !mine.has(a.ip) && a.ttl > 0);
      if (other && !mine.has(rinfo.address) && this.conflict !== other.ip) {
        this.conflict = other.ip;
        this.log.warn(`mDNS: ${other.ip} also answers for ${me} — give this server another local name (System › Network)`);
      }
      return;
    }
    const q = m.questions.find((x) => x.name.toLowerCase() === me && (x.type === TYPE_A || x.type === TYPE_ANY));
    if (!q) return;
    const ips = this.addressesFor(rinfo.address);
    if (!ips.length) return;
    this.answered++;
    if (rinfo.port !== MDNS_PORT) { this._send(buildResponse(me, ips, { legacy: m }), rinfo.port, rinfo.address); return; }
    const res = buildResponse(me, ips);
    if (q.unicast) this._send(res, rinfo.port, rinfo.address);
    else this._send(res, this.port, MDNS_ADDR, ips.length === 1 ? ips[0] : undefined);
  }

  /** Unsolicited announcement on every interface (or a goodbye with ttl 0). */
  announce(ttl = 120) {
    if (!this.sock || this.error) return Promise.resolve();
    const jobs = this.interfaces().map(({ ip }) => this._send(buildResponse(this.host, [ip], { ttl }), this.port, MDNS_ADDR, ip));
    return Promise.all(jobs);
  }

  async rename(name) {
    await this.announce(0);
    this.setName(name);
    await this.announce();
    this.log.info(`mDNS: answering for ${this.host}`);
  }

  async stop() {
    clearInterval(this._timer);
    if (!this.sock) return;
    await Promise.race([this.announce(0), new Promise((r) => setTimeout(r, 300))]);
    try { this.sock.close(); } catch { /* closed */ }
    this.sock = null;
  }
}
