// Internet access: the room server dials OUT to a relay (cloud/relay) and answers the HTTP requests and WebSockets
// the relay forwards, by calling its own local server. Nothing listens for the internet — works behind NAT and
// firewalls. Protocol: cloud/relay/core.mjs.
//
// Everything that arrives through the link is stamped with `x-vt-tunnel: <random per-process token>` so the local
// server can tell it from the desktop window (also 127.0.0.1): see peerOf() in server.js.

import crypto from 'node:crypto';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

const MAX_BODY = 4 * 1024 * 1024;
const PING_MS = 25000;
const STALE_MS = 70000;       // no pong for this long → the link is dead
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

/** ws(s) URL of the link endpoint for a relay address typed as http(s)/ws(s), or null when it is not a URL. */
export function linkUrl(relayUrl, roomId) {
  try {
    const u = new URL(relayUrl);
    if (!/^(https?|wss?):$/.test(u.protocol)) return null;
    u.protocol = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss:' : 'ws:';
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/_relay/link`;
    u.search = `?room=${encodeURIComponent(roomId)}`;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

/** Relay address as stored: https://host (no trailing slash). '' when empty; throws on junk. */
export function normalizeRelayUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new Error('the relay address is not a valid URL'); }
  if (!/^(https?|wss?):$/.test(u.protocol)) throw new Error('the relay address must start with https://');
  u.protocol = u.protocol === 'ws:' || u.protocol === 'http:' ? 'http:' : 'https:';
  u.search = ''; u.hash = '';
  return u.toString().replace(/\/+$/, '');
}

export class CloudLink extends EventEmitter {
  /**
   * @param {{cfg: object, log: object, port: () => number, token: () => string, name: () => string, version?: string}} o
   *   cfg is the live settings.cloud object (enabled, relayUrl, launcherUrl, roomId, secret).
   */
  constructor({ cfg, log, port, token, name, version = '' }) {
    super();
    this.cfg = cfg; this.log = log; this.port = port; this.token = token; this.name = name; this.version = version;
    this.tunnelToken = crypto.randomBytes(24).toString('hex');
    this.state = 'off'; this.error = null;
    this.ws = null; this.attempt = 0; this.timer = null; this.beat = null; this.lastPong = 0; this.sentName = null;
    this.reqs = new Map();   // id → http.ClientRequest
    this.socks = new Map();  // id → {ws, queue}
  }

  /** Connect (or reconnect after a settings change) according to cfg. */
  apply() {
    this._teardown();
    clearTimeout(this.timer); this.timer = null;
    this.attempt = 0;
    if (!this.cfg.enabled) return this._set('off', null);
    if (!this.cfg.relayUrl) return this._set('error', 'Enter the relay address first.');
    if (!linkUrl(this.cfg.relayUrl, this.cfg.roomId)) return this._set('error', 'The relay address is not a valid URL.');
    this._connect();
  }

  stop() {
    clearTimeout(this.timer); this.timer = null;
    this._teardown();
    this._set('off', null);
  }

  /** The room name changed: tell the relay (it shows it in the launcher). */
  refreshName() {
    if (this.state === 'online' && this.name() !== this.sentName) this._hello();
  }

  status() {
    const tok = this.token();
    const base = (this.cfg.relayUrl || '').replace(/\/+$/, '');
    const launcher = (this.cfg.launcherUrl || '').replace(/\/+$/, '');
    const link = !this.cfg.enabled || !this.cfg.roomId ? null
      : launcher ? `${launcher}/#r=${this.cfg.roomId}&k=${tok}&relay=${encodeURIComponent(base)}`
        : base ? `${base}/r/${this.cfg.roomId}/?k=${tok}` : null;
    return { enabled: !!this.cfg.enabled, state: this.state, error: this.error, roomId: this.cfg.roomId, relayUrl: this.cfg.relayUrl || '', launcherUrl: this.cfg.launcherUrl || '', link };
  }

  _set(state, error) {
    if (this.state === state && this.error === error) return;
    this.state = state; this.error = error;
    this.emit('change');
  }

  _connect() {
    if (this.state !== 'error') this._set('connecting', null); // an error stays visible while retrying
    const url = linkUrl(this.cfg.relayUrl, this.cfg.roomId);
    let ws;
    try { ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.cfg.secret}` }, handshakeTimeout: 10000, perMessageDeflate: false }); }
    catch (e) { this._set('error', e.message); return this._retry(); }
    this.ws = ws;
    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.attempt = 0; this.lastPong = Date.now();
      this._hello();
      this.beat = setInterval(() => {
        if (Date.now() - this.lastPong > STALE_MS) { this.log.warn('internet access: the relay stopped answering'); ws.terminate(); return; }
        this._send({ t: 'ping' });
      }, PING_MS);
      this.beat.unref?.();
      this._set('online', null);
      this.log.info(`internet access: connected to ${this.cfg.relayUrl}`);
    });
    ws.on('message', (data, isBinary) => { if (this.ws === ws && !isBinary) this._onMessage(data.toString()); });
    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      const why = res.statusCode === 403 ? 'The relay refuses this room: its address belongs to another secret. Use "New address".'
        : `The relay answered ${res.statusCode}.`;
      if (this.ws === ws) { this._set('error', why); ws.terminate(); }
    });
    ws.on('error', (e) => { if (this.ws === ws && this.state !== 'error') this._set('error', `Cannot reach the relay (${e.code || e.message}).`); });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this._teardown();
      if (this.cfg.enabled) { if (this.state === 'online') this.log.warn('internet access: link lost, reconnecting'); this._retry(); }
    });
  }

  _retry() {
    clearTimeout(this.timer);
    const wait = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)];
    this.timer = setTimeout(() => { this.timer = null; if (this.cfg.enabled) this._connect(); }, wait);
    this.timer.unref?.();
  }

  /** Close everything that depends on the current link. */
  _teardown() {
    clearInterval(this.beat); this.beat = null;
    const ws = this.ws; this.ws = null;
    if (ws) { try { ws.removeAllListeners('message'); ws.terminate(); } catch { /* gone */ } }
    for (const r of this.reqs.values()) r.destroy();
    this.reqs.clear();
    for (const s of this.socks.values()) { try { s.ws.terminate(); } catch { /* gone */ } }
    this.socks.clear();
    this.sentName = null;
  }

  _send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  _hello() { this.sentName = this.name(); this._send({ t: 'hello', name: this.sentName, version: this.version }); }

  _headers(h, extra = {}) {
    const out = {};
    for (const [k, v] of Object.entries(h || {})) {
      const key = k.toLowerCase();
      if (HOP.has(key) || key.startsWith('x-vt-') || key.startsWith('sec-websocket-')) continue;
      out[key] = String(v);
    }
    // stamped last: whatever the browser claimed in x-vt-* was dropped above
    out['x-vt-tunnel'] = this.tunnelToken;
    out['x-vt-client-ip'] = String(h?.['x-vt-client-ip'] ?? 'unknown').replace(/[^\x20-\x7e]/g, '').slice(0, 64);
    return { ...out, ...extra };
  }

  _onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    switch (m?.t) {
      case 'pong': this.lastPong = Date.now(); break;
      case 'req': this._request(m); break;
      case 'open': this._open(m); break;
      case 'msg': {
        const s = this.socks.get(m.id);
        if (!s) break;
        const data = m.b !== undefined ? Buffer.from(m.b, 'base64') : String(m.d ?? '');
        if (s.ws.readyState === 1) s.ws.send(data); else s.queue.push(data);
        break;
      }
      case 'close': {
        const s = this.socks.get(m.id);
        if (s) { this.socks.delete(m.id); try { s.ws.close(); } catch { /* gone */ } }
        break;
      }
      default: break;
    }
  }

  _request(m) {
    const id = m.id;
    const answer = (status, headers, body) => this._send({ t: 'res', id, status, headers, body: Buffer.from(body).toString('base64') });
    if (typeof m.path !== 'string' || !m.path.startsWith('/')) return answer(400, [], 'bad path');
    const body = Buffer.from(m.body || '', 'base64');
    const req = http.request({
      host: '127.0.0.1', port: this.port(), method: String(m.method || 'GET'), path: m.path,
      headers: this._headers(m.headers, { host: `127.0.0.1:${this.port()}`, ...(body.length ? { 'content-length': String(body.length) } : {}) }),
      timeout: 25000,
    }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        this.reqs.delete(id);
        const pairs = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) pairs.push([res.rawHeaders[i], res.rawHeaders[i + 1]]);
        answer(res.statusCode, pairs, Buffer.concat(chunks));
      });
    });
    this.reqs.set(id, req);
    req.on('timeout', () => req.destroy());
    req.on('error', () => { if (this.reqs.delete(id)) answer(502, [], 'the room server did not answer'); });
    req.end(body);
  }

  _open(m) {
    const id = m.id;
    if (typeof m.path !== 'string' || !m.path.startsWith('/') || this.socks.size >= 16) return this._send({ t: 'close', id, code: 4400 });
    const ws = new WebSocket(`ws://127.0.0.1:${this.port()}${m.path}`, { headers: this._headers(m.headers, { host: `127.0.0.1:${this.port()}` }), perMessageDeflate: false });
    const sock = { ws, queue: [] };
    this.socks.set(id, sock);
    ws.on('open', () => {
      this._send({ t: 'opened', id });
      for (const q of sock.queue.splice(0)) ws.send(q);
    });
    ws.on('message', (data, isBinary) => {
      if (this.socks.get(id) !== sock) return;
      if (isBinary) {
        if (this.ws && this.ws.bufferedAmount > 2e6) return; // point clouds are disposable; never let them back up the link
        this._send({ t: 'msg', id, b: Buffer.from(data).toString('base64') });
      } else this._send({ t: 'msg', id, d: data.toString() });
    });
    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      if (this.socks.delete(id)) this._send({ t: 'close', id, code: res.statusCode === 401 ? 4401 : 4400 });
    });
    ws.on('close', () => { if (this.socks.get(id) === sock) { this.socks.delete(id); this._send({ t: 'close', id }); } });
    ws.on('error', () => {});
  }
}
