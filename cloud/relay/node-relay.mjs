// The relay protocol on Node (http + ws): for tests and self-hosting. Same logic as the Cloudflare Worker (core.mjs);
// rooms live in memory (a restart forgets claims — use the Worker where the claim must persist).
//   node cloud/relay/node-relay.mjs [port]     (PORT env also works)
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  route, RoomHub, LIMITS, CORS, roomCookie, bearer, sha256hex, safeEqual,
  helpPage, offlinePage, badPage, errorPage,
} from './core.mjs';

export async function startRelay({ port = 0, host = '127.0.0.1' } = {}) {
  const rooms = new Map(); // id → {hub, secretHash}
  const room = (id) => { let r = rooms.get(id); if (!r) { r = { hub: new RoomHub(), secretHash: null }; rooms.set(id, r); } return r; };
  const ipOf = (req) => String(req.socket.remoteAddress || '').replace('::ffff:', '');

  const send = (res, r, headOnly = false) => {
    res.writeHead(r.status, r.headers);
    res.end(headOnly || [204, 304].includes(r.status) ? undefined : r.body instanceof Uint8Array ? Buffer.from(r.body) : r.body);
  };

  const wssLink = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  const wssBrowser = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

  const server = http.createServer(async (req, res) => {
    const r = route(req.method, req.url, req.headers.cookie);
    if (r.type === 'bad') return send(res, badPage());
    if (r.type === 'help') return send(res, helpPage());
    if (r.type === 'enter') { res.writeHead(302, { location: r.location, 'set-cookie': roomCookie(r.room).replace('; Secure', ''), 'cache-control': 'no-store' }); return res.end(); }
    if (r.type === 'link') { res.writeHead(426); return res.end('expected a WebSocket'); }
    if (r.type === 'status') {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      const { hub } = room(r.room);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS });
      return res.end(JSON.stringify({ online: hub.online, name: hub.name }));
    }
    const { hub } = room(r.room);
    if (!hub.online) return send(res, offlinePage());
    if (Number(req.headers['content-length'] || 0) > LIMITS.body) return send(res, errorPage(413, 'Request too large'));
    const chunks = []; let size = 0, tooBig = false;
    for await (const c of req) { size += c.length; if (size > LIMITS.body) { tooBig = true; break; } chunks.push(c); }
    if (tooBig) return send(res, errorPage(413, 'Request too large'));
    const out = await hub.proxyHttp({ method: req.method, path: r.path, headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)), clientIp: ipOf(req) });
    if (out.offline) return send(res, offlinePage());
    send(res, { status: out.status, headers: out.headers, body: out.body }, req.method === 'HEAD');
  });

  server.on('upgrade', async (req, socket, head) => {
    const refuse = (code, text) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    const r = route(req.method, req.url, req.headers.cookie);
    if (r.type === 'link') {
      const secret = bearer(req.headers.authorization);
      if (!secret) return refuse(403, 'Forbidden');
      const entry = room(r.room);
      const hash = await sha256hex(secret);
      if (!entry.secretHash) entry.secretHash = hash; // the first link claims the room
      else if (!safeEqual(entry.secretHash, hash)) return refuse(403, 'Forbidden');
      wssLink.handleUpgrade(req, socket, head, (ws) => {
        entry.hub.attachLink(ws);
        ws.on('message', (data, isBinary) => entry.hub.onLinkMessage(ws, isBinary ? data : data.toString()));
        ws.on('close', () => entry.hub.onLinkClose(ws));
        ws.on('error', () => {});
      });
    } else if (r.type === 'proxy') {
      const { hub } = room(r.room);
      if (!hub.online) return refuse(503, 'Service Unavailable');
      if (hub.browsers.size >= LIMITS.browserSockets) return refuse(429, 'Too Many Requests');
      wssBrowser.handleUpgrade(req, socket, head, (ws) => {
        const id = hub.openBrowser(ws, { path: r.path, headers: req.headers, clientIp: ipOf(req) });
        if (!id) { ws.close(1013, 'room unavailable'); return; }
        ws.on('message', (data, isBinary) => hub.onBrowserMessage(id, isBinary ? new Uint8Array(data) : data.toString()));
        ws.on('close', () => hub.onBrowserClose(id));
        ws.on('error', () => {});
      });
    } else refuse(404, 'Not Found');
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return {
    port: server.address().port,
    rooms,
    close: () => new Promise((resolve) => {
      for (const c of [...wssLink.clients, ...wssBrowser.clients]) c.terminate();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const relay = await startRelay({ port: Number(process.argv[2] || process.env.PORT || 8780), host: process.env.HOST || '0.0.0.0' });
  console.log(`VEATION Touch relay listening on :${relay.port}`);
}
