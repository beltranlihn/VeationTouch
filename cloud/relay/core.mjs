// VEATION Touch relay — portable protocol logic. No platform imports: the same file runs inside a Cloudflare
// Durable Object (worker.mjs) and on Node (node-relay.mjs). See docs in ARCHITECTURE.md › Internet access.
//
// Wire protocol on the room server's link (one WebSocket, JSON text frames):
//   server → relay   {t:'hello', name, version}            room name for /_relay/status
//                    {t:'res', id, status, headers:[[k,v]…], body}   body = base64
//                    {t:'opened', id} | {t:'close', id, code}        answer to 'open' / the local socket ended
//                    {t:'msg', id, d} (text) | {t:'msg', id, b} (binary, base64)
//                    {t:'ping'}                              every 25 s
//   relay → server   {t:'req', id, method, path, headers:{k:v}, body}
//                    {t:'open', id, path, headers}           a browser opened a WebSocket
//                    {t:'msg', id, d|b} | {t:'close', id}    browser data / browser closed
//                    {t:'pong'}

export const LIMITS = {
  body: 4 * 1024 * 1024,   // HTTP bodies, both directions
  timeoutMs: 30000,        // HTTP round trip over the link
  browserSockets: 8,       // browser WebSockets per room
  pingMs: 25000,           // link heartbeat (the server sends {t:'ping'})
};

export const ROOM_RE = /^[a-z0-9]{4,32}$/;
export const COOKIE = 'vt_room';

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'proxy-connection']);

/** Request headers worth forwarding to the room server: no hop-by-hop, no platform (cf-*, x-forwarded-*), no x-vt-* (those are ours). */
export function cleanRequestHeaders(headers, { ws = false } = {}) {
  const out = {};
  const each = typeof headers.entries === 'function' && !Array.isArray(headers) ? headers.entries() : Object.entries(headers);
  for (const [k0, v] of each) {
    const k = k0.toLowerCase();
    if (HOP.has(k) || k.startsWith('cf-') || k.startsWith('x-vt-') || k.startsWith('x-forwarded-') || k === 'x-real-ip' || k === 'cdn-loop') continue;
    if (ws && (k.startsWith('sec-websocket-') || k === 'accept-encoding')) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

/** Response headers from the room server back to the browser (pairs, so Set-Cookie can repeat). */
export function cleanResponseHeaders(pairs) {
  const out = [];
  for (const p of pairs || []) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const k = String(p[0]).toLowerCase();
    if (HOP.has(k)) continue;
    out.push([k, String(p[1])]);
  }
  return out;
}

// ---------------------------------------------------------------- base64 without Buffer (Workers have none)
export function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64decode(str) {
  const s = atob(str || '');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export const bearer = (header) => /^Bearer\s+(\S{8,200})$/.exec(header || '')?.[1] || null;

export function randomId(n = 10) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz234567'[b & 31]).join('');
}

// ---------------------------------------------------------------- routing

const readCookie = (cookie, name) => {
  for (const part of String(cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

/**
 * Decide what a request is. `url` is the request URL (path + query is enough), `cookie` its Cookie header.
 *  link    GET /_relay/link?room=  (the room server)      status  GET /_relay/status?room=  (launcher polling)
 *  enter   /r/<room>/<rest>  → cookie + 302 to /<rest>     proxy   anything else, the room from the cookie
 *  help    no room known                                    bad     malformed room id
 */
export function route(method, url, cookie) {
  const u = new URL(url, 'http://relay');
  const p = u.pathname;
  if (p === '/_relay/link' || p === '/_relay/status') {
    const room = u.searchParams.get('room') || '';
    if (!ROOM_RE.test(room)) return { type: 'bad' };
    return { type: p === '/_relay/link' ? 'link' : 'status', room };
  }
  if (p.startsWith('/_relay/')) return { type: 'bad' };
  const m = /^\/r\/([^/]+)(\/.*)?$/.exec(p);
  if (m) {
    if (!ROOM_RE.test(m[1])) return { type: 'bad' };
    return { type: 'enter', room: m[1], location: (m[2] || '/') + u.search };
  }
  const room = readCookie(cookie, COOKIE);
  if (!room) return { type: 'help' };
  if (!ROOM_RE.test(room)) return { type: 'bad' };
  return { type: 'proxy', room, path: p + u.search };
}

export const roomCookie = (room) => `${COOKIE}=${room}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`;

export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*', 'access-control-max-age': '600' };

// ---------------------------------------------------------------- pages (VEATION tokens)

const page = (status, title, body) => ({
  status,
  headers: [['content-type', 'text/html; charset=utf-8'], ['cache-control', 'no-store']],
  body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#E0E0E0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;margin:16px;padding:24px;background:#1B1B1B;border:1px solid #262626;border-radius:8px}
h1{margin:0 0 8px;font-size:17px;font-weight:600}p{margin:8px 0;color:#B8B8B8}.mark{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}
.on{background:#4FC3E8}.attn{background:#E5B567}</style></head><body><main>${body}</main></body></html>`,
});
export const helpPage = () => page(200, 'VEATION Touch relay', '<h1><span class="mark on"></span>VEATION Touch relay</h1><p>This address forwards a room\'s interface over the internet.</p><p>Open the link from the room\'s Connect device panel (Over the internet) — it carries the room and its access key.</p>');
export const offlinePage = () => page(503, 'Room offline', '<h1><span class="mark attn"></span>This room\'s server is offline</h1><p>This room\'s server is offline — it must be on and connected to the internet.</p><p>Check that the VEATION Touch server is running and that Internet access is on, then reload.</p>');
export const badPage = () => page(404, 'Not found', '<h1><span class="mark attn"></span>Not found</h1><p>This address is not valid.</p>');
export const errorPage = (status, text) => page(status, 'Relay', `<h1><span class="mark attn"></span>${text}</h1>`);

// ---------------------------------------------------------------- the hub: one per room

/**
 * Sockets are anything with send(string|Uint8Array) and close(code, reason).
 * The hub keeps no durable state: the Durable Object rebuilds link/browsers from the sockets it still holds after hibernation.
 */
export class RoomHub {
  constructor() {
    this.link = null;
    this.name = '';
    this.version = '';
    this.browsers = new Map(); // id → socket
    this.pending = new Map();  // http id → {resolve, timer}
  }

  get online() { return !!this.link; }

  /** A new valid link replaces the previous one. */
  attachLink(ws) {
    const old = this.link;
    this.link = ws;
    if (old && old !== ws) { this._dropAll('link replaced'); try { old.close(4000, 'replaced'); } catch { /* gone */ } }
  }

  onLinkClose(ws) {
    if (this.link !== ws) return;
    this.link = null;
    this._dropAll('link closed');
  }

  _dropAll(why) {
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ status: 503, headers: [], body: new Uint8Array(0), offline: true }); this.pending.delete(id); }
    for (const [id, ws] of this.browsers) { this.browsers.delete(id); try { ws.close(1001, why); } catch { /* gone */ } }
  }

  _send(obj) { try { this.link.send(JSON.stringify(obj)); return true; } catch { return false; } }

  onLinkMessage(ws, raw) {
    if (this.link !== ws) return;
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'ping': this._send({ t: 'pong' }); break;
      case 'hello': this.name = String(m.name ?? '').slice(0, 120); this.version = String(m.version ?? '').slice(0, 40); break;
      case 'res': {
        const p = this.pending.get(m.id);
        if (!p) break;
        this.pending.delete(m.id); clearTimeout(p.timer);
        const body = b64decode(m.body);
        if (body.length > LIMITS.body) p.resolve({ status: 502, headers: [], body: new TextEncoder().encode('response too large for the relay') });
        else p.resolve({ status: Number(m.status) || 502, headers: cleanResponseHeaders(m.headers), body });
        break;
      }
      case 'opened': break; // the browser socket is already open; data may flow
      case 'close': {
        const b = this.browsers.get(m.id);
        if (!b) break;
        this.browsers.delete(m.id);
        const code = Number.isInteger(m.code) && m.code >= 3000 && m.code <= 4999 ? m.code : 1000;
        try { b.close(code, 'closed by the room server'); } catch { /* gone */ }
        break;
      }
      case 'msg': {
        const b = this.browsers.get(m.id);
        if (!b) break;
        try { b.send(m.b !== undefined ? b64decode(m.b) : String(m.d ?? '')); } catch { /* gone */ }
        break;
      }
      default: break;
    }
  }

  /** @returns {Promise<{status:number, headers:[string,string][], body:Uint8Array, offline?:boolean}>} */
  proxyHttp({ method, path, headers, body, clientIp }) {
    if (!this.link) return Promise.resolve({ status: 503, headers: [], body: new Uint8Array(0), offline: true });
    if (body && body.length > LIMITS.body) return Promise.resolve({ status: 413, headers: [], body: new TextEncoder().encode('request too large') });
    const id = randomId(12);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ status: 504, headers: [], body: new TextEncoder().encode('the room server did not answer in time') }); }, LIMITS.timeoutMs);
      this.pending.set(id, { resolve, timer });
      const h = cleanRequestHeaders(headers);
      if (clientIp) h['x-vt-client-ip'] = clientIp;
      if (!this._send({ t: 'req', id, method, path, headers: h, body: b64encode(body || new Uint8Array(0)) })) {
        this.pending.delete(id); clearTimeout(timer); resolve({ status: 503, headers: [], body: new Uint8Array(0), offline: true });
      }
    });
  }

  /** Register a browser socket and tell the room server. Returns its id, or null when over the limit / offline. */
  openBrowser(ws, { path, headers, clientIp, id = randomId(12) }) {
    if (!this.link || this.browsers.size >= LIMITS.browserSockets) return null;
    this.browsers.set(id, ws);
    const h = cleanRequestHeaders(headers, { ws: true });
    if (clientIp) h['x-vt-client-ip'] = clientIp;
    if (!this._send({ t: 'open', id, path, headers: h })) { this.browsers.delete(id); return null; }
    return id;
  }

  /** Re-register a browser socket after hibernation (the room server already knows it). */
  restoreBrowser(id, ws) { this.browsers.set(id, ws); }

  onBrowserMessage(id, data) {
    if (!this.browsers.has(id) || !this.link) return;
    if (typeof data === 'string') this._send({ t: 'msg', id, d: data });
    else this._send({ t: 'msg', id, b: b64encode(data instanceof Uint8Array ? data : new Uint8Array(data)) });
  }

  onBrowserClose(id) {
    if (!this.browsers.delete(id)) return;
    if (this.link) this._send({ t: 'close', id });
  }
}
