// Find RPLIDAR S2E units on the server's networks, and (experimental) change a unit's static IP.
// The S2E answers GET_HEALTH on UDP 8089 from anyone. Every new S2E ships as 192.168.11.2.
// IMPORTANT: any request interrupts a unit's data stream, so running sensors are never probed.

import dgram from 'node:dgram';
import os from 'node:os';
import * as P from './drivers/s2e-protocol.js';

const ip4 = (s) => s.split('.').reduce((a, n) => ((a << 8) | (Number(n) & 255)) >>> 0, 0);
const str4 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/** Candidate hosts: every address of each local /24 (or smaller) network, plus the factory default. */
export function candidateHosts() {
  const out = new Set(['192.168.11.2']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const mask = ip4(a.netmask || '255.255.255.0');
      if ((~mask >>> 0) > 1023) continue; // bigger than /22: do not sweep
      const net = ip4(a.address) & mask;
      for (let h = 1; h < (~mask >>> 0); h++) { const ip = str4((net | h) >>> 0); if (ip !== a.address) out.add(ip); }
    }
  }
  return [...out];
}

/**
 * @param {{hosts?:string[], port?:number, skip?:string[], timeoutMs?:number}} opt
 * @returns {Promise<{host:string, port:number, health:object, info:object|null}[]>}
 */
export function discover({ hosts = candidateHosts(), port = 8089, skip = [], timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const found = new Map(); // host → {health, info, buf}
    sock.on('error', () => {});
    sock.on('message', (msg, r) => {
      const e = found.get(r.address) || { host: r.address, port: r.port, health: null, info: null, buf: Buffer.alloc(0) };
      e.buf = Buffer.concat([e.buf, msg]);
      for (let off = P.findDescriptor(e.buf); off >= 0; off = P.findDescriptor(e.buf, off + 2)) {
        const d = P.parseDescriptor(e.buf, off);
        if (!d || e.buf.length - off - 7 < d.length) break;
        const data = e.buf.subarray(off + 7, off + 7 + d.length);
        if (d.type === P.ANS.HEALTH && !e.health) {
          e.health = P.parseHealth(data);
          sock.send(P.request(P.CMD.GET_INFO), port, r.address); // ask who it is
        } else if (d.type === P.ANS.DEVINFO) e.info = P.parseInfo(data);
      }
      found.set(r.address, e);
    });
    sock.bind(0, () => {
      const req = P.request(P.CMD.GET_HEALTH);
      const list = hosts.filter((h) => !skip.includes(h));
      let i = 0;
      const burst = () => { // pace the sweep: 32 packets per ms-tick
        for (let k = 0; k < 32 && i < list.length; k++, i++) sock.send(req, port, list[i]);
        if (i < list.length) setImmediate(burst);
      };
      burst();
      setTimeout(() => {
        try { sock.close(); } catch { /* closed */ }
        resolve([...found.values()].filter((e) => e.health).map(({ host, port: p, health, info }) => ({ host, port: p, health, info })));
      }, timeoutMs);
    });
  });
}

/**
 * EXPERIMENTAL (not yet verified on hardware): set a unit's static IP with SET_LIDAR_CONF
 * (type 0x0001CCC0) and reset it so it comes back on the new address.
 */
export function setStaticIp({ host, port = 8089, ip, mask = '255.255.255.0', gw }, timeoutMs = 2000) {
  const valid = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every((n) => Number(n) <= 255);
  if (![host, ip, mask].every(valid)) return Promise.reject(new Error('invalid IPv4 address'));
  const gateway = gw && valid(gw) ? gw : ip.replace(/\.\d+$/, '.1');
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let buf = Buffer.alloc(0);
    const done = (err, v) => { clearTimeout(t); try { sock.close(); } catch { /* closed */ } err ? reject(err) : resolve(v); };
    const t = setTimeout(() => done(new Error(`no answer from ${host} (the unit may not support this command — use RoboStudio)`)), timeoutMs);
    sock.on('message', (msg, r) => {
      if (r.address !== host) return;
      buf = Buffer.concat([buf, msg]);
      const off = P.findDescriptor(buf);
      const d = off >= 0 ? P.parseDescriptor(buf, off) : null;
      if (!d || d.type !== P.ANS.SET_CONF || buf.length - off - 7 < d.length) return;
      const data = buf.subarray(off + 7, off + 7 + d.length);
      const result = data.length >= 8 ? data.readUInt32LE(4) : 0;
      if (result !== 0) return done(new Error(`the unit refused the new address (code ${result})`));
      sock.send(P.request(P.CMD.RESET), port, host, () => done(null, { ip, mask, gw: gateway }));
    });
    sock.bind(0, () => sock.send(P.setStaticIp(ip, mask, gateway), port, host));
  });
}
