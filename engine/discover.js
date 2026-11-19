// Find RPLIDAR S2E units on the server's networks, and give a unit a new static IP — confirmed: the unit must answer
// on the new address with the same serial number, or the change is reported as failed (never left ambiguous).
// The S2E answers GET_HEALTH on UDP 8089 from anyone. Every new S2E ships as 192.168.11.2.
// IMPORTANT: any request interrupts a unit's data stream, so running sensors are never probed by Search.

import dgram from 'node:dgram';
import os from 'node:os';
import * as P from './drivers/s2e-protocol.js';
import { lanInterfaces } from './mdns.js';

const ip4 = (s) => s.split('.').reduce((a, n) => ((a << 8) | (Number(n) & 255)) >>> 0, 0);
/** Is `ip` on the network of this interface ({ip, mask})? */
export const onNetwork = (iface, ip) => (ip4(iface.ip) & ip4(iface.mask)) === (ip4(ip) & ip4(iface.mask));
const str4 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

export const FACTORY_IP = '192.168.11.2';
/** The address this computer takes on the sensor network when the operator lets the app set it up. */
export const SERVER_SENSOR_IP = '192.168.11.5';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const valid4 = (s) => typeof s === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every((n) => Number(n) <= 255);

/**
 * Can this computer reach a factory-new S2E (192.168.11.2)? `ifaces` = [{name, ip, mask}] (lanInterfaces()).
 * @returns {{reachable:boolean, via:object|null, have:string}} have = "172.17.1.51 (Ethernet), …" for the message
 */
export function factoryNetwork(ifaces) {
  const via = ifaces.find((i) => (ip4(i.ip) & ip4(i.mask)) === (ip4(FACTORY_IP) & ip4(i.mask))) || null;
  return { reachable: !!via, via, have: ifaces.map((i) => `${i.ip} (${i.name})`).join(', ') };
}

/**
 * The local IPv4 address of this computer that sits on the same network as `host`, or null (loopback hosts, no card
 * on that network). Binding the socket to it makes the packets leave through the card the sensor is plugged into,
 * even when the OS would route them through another card. `ifaces` = [{ip, mask}] (lanInterfaces()).
 */
export function localAddressFor(host, ifaces = lanInterfaces()) {
  if (!valid4(host) || host.startsWith('127.')) return null;
  return ifaces.find((i) => onNetwork(i, host))?.ip || null;
}

/** Address to bind a socket that talks to all of `hosts`: their common local address, else null (= 0.0.0.0). */
export function bindAddressFor(hosts, ifaces = lanInterfaces()) {
  const addrs = new Set(hosts.map((h) => localAddressFor(h, ifaces)));
  if (addrs.size === 1) return [...addrs][0]; // null when none of them matches
  // the factory address is always probed, even when no card is on its network: it must not make the others unbindable
  const rest = new Set(hosts.filter((h) => h !== FACTORY_IP).map((h) => localAddressFor(h, ifaces)));
  return rest.size === 1 ? [...rest][0] : null;
}

/**
 * Candidate hosts: every address of each local network of /22 or smaller, plus the factory default. By default only
 * the networks where the sensors are: the one holding the factory address or the host of a known sensor
 * (`sensorHosts`); `everywhere` sweeps every local network (an audio or office network gets probed too).
 */
export function candidateHosts({ sensorHosts = [], everywhere = false, interfaces = os.networkInterfaces() } = {}) {
  const out = new Set(['192.168.11.2']);
  const targets = [FACTORY_IP, ...sensorHosts.filter((h) => valid4(h) && !h.startsWith('127.'))];
  for (const list of Object.values(interfaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const mask = ip4(a.netmask || '255.255.255.0');
      if ((~mask >>> 0) > 1023) continue; // bigger than /22: do not sweep
      if (!everywhere && !targets.some((t) => onNetwork({ ip: a.address, mask: a.netmask || '255.255.255.0' }, t))) continue;
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
    const list = hosts.filter((h) => !skip.includes(h));
    sock.bind(0, bindAddressFor(list) || undefined, () => {
      const req = P.request(P.CMD.GET_HEALTH);
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
 * Set a unit's static IP with SET_LIDAR_CONF (type 0x0001CCC0, from Slamtec's SDK) and reset it so it comes back on
 * the new address. Low level: use readdress(), which also confirms the unit came back.
 */
export function setStaticIp({ host, port = 8089, ip, mask = '255.255.255.0', gw }, timeoutMs = 2000) {
  if (![host, ip, mask].every(valid4)) return Promise.reject(new Error('invalid IPv4 address'));
  const gateway = gw && valid4(gw) ? gw : ip.replace(/\.\d+$/, '.1');
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
    sock.bind(0, localAddressFor(host) || undefined, () => sock.send(P.setStaticIp(ip, mask, gateway), port, host));
  });
}

/**
 * Read a unit's network configuration (GET_LIDAR_CONF 0x0001CCC0; the SDK sends 2 reserved bytes). Changes nothing.
 * @returns {Promise<{ip:string, mask:string, gw:string}|null>} null = the unit does not answer this entry
 */
export function readStaticIp({ host, port = 8089 }, timeoutMs = 1200) {
  if (!valid4(host)) return Promise.reject(new Error('invalid IPv4 address'));
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let buf = Buffer.alloc(0);
    const done = (v) => { clearTimeout(t); try { sock.close(); } catch { /* closed */ } resolve(v); };
    const t = setTimeout(() => done(null), timeoutMs);
    sock.on('error', () => done(null));
    sock.on('message', (msg, r) => {
      if (r.address !== host) return;
      buf = Buffer.concat([buf, msg]);
      for (let off = P.findDescriptor(buf); off >= 0; off = P.findDescriptor(buf, off + 2)) {
        const d = P.parseDescriptor(buf, off);
        if (!d || buf.length - off - 7 < d.length) return;
        if (d.type !== P.ANS.GET_CONF) continue;
        const c = P.parseConf(buf.subarray(off + 7, off + 7 + d.length));
        if (c.type !== P.CONF.STATIC_IP || c.value.length < 12) continue;
        const q = (o) => [...c.value.subarray(o, o + 4)].join('.');
        done({ ip: q(0), mask: q(4), gw: q(8) });
        return;
      }
    });
    sock.bind(0, localAddressFor(host) || undefined, () => sock.send(P.getConf(P.CONF.STATIC_IP, 0), port, host));
  });
}

/**
 * How long a unit may take to answer again after the RESET that applies a new address. Measured on four real S2E
 * (XR Lab, firmware 1.02): 11, 34, 60 and 61 s — it varies a lot between units — so 90 s leaves a margin.
 */
export const READDRESS_WAIT_MS = 90000;

/**
 * Give the unit at `host` the address `ip` and CONFIRM it: the unit must answer on `ip` with the serial it had before.
 * Resolves {ip, serial, ms} when confirmed, or {ip, serial, ms, pending:true} when after `waitMs` it answers on
 * neither address yet (still restarting — not reported as a failure: the change most likely worked).
 * Rejects when the address is taken, or when the unit kept its old address (it answers there again after restarting).
 */
export async function readdress({ host, port = 8089, ip, mask = '255.255.255.0', gw, waitMs = READDRESS_WAIT_MS, pollMs = 1000, oldCheckAfterMs = 8000 }) {
  if (![host, ip, mask].every(valid4)) throw new Error('invalid IPv4 address');
  if (ip === host) throw new Error(`the unit is already on ${ip}`);
  const busy = (await discover({ hosts: [ip], port, timeoutMs: 600 }))[0];
  if (busy) throw new Error(`${ip} is already used by another unit${busy.info ? ` (serial ${busy.info.serial})` : ''} — pick another address`);
  const before = (await discover({ hosts: [host], port, timeoutMs: 800 }))[0];
  if (!before) throw new Error(`no unit answers on ${host}`);
  const serial = before.info?.serial || null;
  await setStaticIp({ host, port, ip, mask, gw });
  const t0 = Date.now();
  const kept = () => new Error(`the unit kept ${host}: it did not accept the new address`);
  const onOld = async () => { const u = (await discover({ hosts: [host], port, timeoutMs: 500 }))[0]; return !!u && (!serial || u.info?.serial === serial); };
  for (let k = 0; Date.now() - t0 < waitMs; k++) {
    await sleep(pollMs);
    const back = (await discover({ hosts: [ip], port, timeoutMs: 500 }))[0];
    if (back && (!serial || back.info?.serial === serial)) return { ip, serial: back.info?.serial || serial, ms: Date.now() - t0 };
    // a unit that refused the change answers on its old address again once it has restarted: stop waiting then
    // (not right after the command: it may still answer there for a moment before it resets)
    if (Date.now() - t0 >= oldCheckAfterMs && k % 3 === 2 && await onOld()) throw kept();
  }
  if (await onOld()) throw kept();
  return { ip, serial, ms: Date.now() - t0, pending: true };
}

/**
 * Network cards plugged into a network without DHCP (they only got a 169.254.x self-assigned address): that is what
 * the card on the sensors' PoE switch looks like before it is set up.
 * @returns {{name:string, ip:string}[]}
 */
export function unconfiguredInterfaces(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|bluetooth/i.test(name)) continue;
    const v4 = (list || []).filter((a) => a.family === 'IPv4' && !a.internal);
    if (v4.length && v4.every((a) => a.address.startsWith('169.254.'))) out.push({ name, ip: v4[0].address });
  }
  return out;
}

/**
 * Addresses for each wall's sensor on the network of `via` (the card on the sensor network): .11, .12… in wall
 * order, skipping addresses in use (this computer, other units, the factory address).
 * @returns {Object<string,string>} wallId → address
 */
export function suggestAddresses(wallIds, via, taken = []) {
  const base = (via?.ip || FACTORY_IP).replace(/\.\d+$/, '.');
  const used = new Set([...taken, via?.ip, FACTORY_IP].filter(Boolean));
  const out = {};
  let n = 11;
  for (const id of wallIds) {
    while (used.has(base + n) && n < 250) n++;
    out[id] = base + n;
    used.add(base + n);
    n++;
  }
  return out;
}
