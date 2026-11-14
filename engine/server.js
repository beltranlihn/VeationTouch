// HTTP + WebSocket server. The SAME web UI is served to the Electron window and to phones
// and tablets on the LAN, so the engine keeps working if the desktop window closes.
//   /                 operator UI          /projection   projection output page
//   /sdk/…            client SDK for apps  /api/qr.svg   QR code for pairing a device
//   /ws/ui            UI channel (state, commands, live view) — LAN clients need ?k=<token>
//   /ws/data          touch stream for apps (JSON frames), read-only, no token

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const isLocal = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

export function lanUrls(port, token) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, url: `http://${a.address}:${port}/?k=${token}` });
    }
  }
  return out;
}

/**
 * @param {import('./engine.js').Engine} engine
 * @param {{port:number, root:string, log:object}} opt
 */
export function createServer(engine, { port, root, log }) {
  const uiDir = path.join(root, 'ui');
  const sdkDir = path.join(root, 'sdk');

  const serveFile = (res, file) => {
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  };

  const safeJoin = (dir, rel) => {
    const p = path.normalize(path.join(dir, rel));
    return p.startsWith(dir) ? p : null;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(uiDir, 'index.html'));
    if (p === '/projection') return serveFile(res, path.join(uiDir, 'projection.html'));
    if (p === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, version: engine.version, profile: engine.profile?.id }));
    }
    if (p === '/api/qr.svg') {
      const text = url.searchParams.get('t') || '';
      const qr = qrcode(0, 'M');
      qr.addData(text.slice(0, 500));
      qr.make();
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      return res.end(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
    }
    if (p.startsWith('/sdk/')) { const f = safeJoin(sdkDir, p.slice(5)); return f ? serveFile(res, f) : (res.writeHead(400), res.end()); }
    const f = safeJoin(uiDir, p.slice(1));
    if (f) return serveFile(res, f);
    res.writeHead(400); res.end();
  });

  const wssUi = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  const wssData = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const addr = req.socket.remoteAddress;
    if (url.pathname === '/ws/ui') {
      if (!isLocal(addr) && url.searchParams.get('k') !== engine.settings.token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
        log.warn(`UI connection refused from ${addr} (missing/wrong access key)`);
        return;
      }
      wssUi.handleUpgrade(req, socket, head, (ws) => onUi(ws, addr, url));
    } else if (url.pathname === '/ws/data') {
      wssData.handleUpgrade(req, socket, head, (ws) => onData(ws));
    } else socket.destroy();
  });

  // ------------------------------------------------------------------ UI clients

  const uiClients = new Set();
  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  function onUi(ws, addr, url) {
    const client = { ws, addr, role: url.searchParams.get('role') || 'ui', viz: false, vizEvery: 1, vizN: 0, local: isLocal(addr) };
    uiClients.add(client);
    updateVizListener();
    send(ws, { ...engine.state(), lan: lanUrls(port, engine.settings.token), token: engine.settings.token, local: client.local });
    send(ws, engine.status());
    ws.on('message', async (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'hello') {
        client.role = m.role || client.role;
        client.viz = !!m.viz;
        client.vizEvery = Math.max(1, Math.round(10 / Math.max(1, Math.min(10, m.vizHz || 10))));
        updateVizListener();
      } else if (m.type === 'cmd') {
        try {
          const result = await engine.command(m.op, m.args || {});
          send(ws, { type: 'ack', id: m.id, ok: true, result });
        } catch (e) {
          send(ws, { type: 'ack', id: m.id, ok: false, error: e.message });
          if (/^stale/.test(e.message)) send(ws, engine.state());
        }
      }
    });
    ws.on('close', () => { uiClients.delete(client); updateVizListener(); });
    ws.on('error', () => {});
  }

  // The engine only builds point clouds while somebody looks at them.
  const vizListener = () => {};
  function updateVizListener() {
    const want = [...uiClients].some((c) => c.viz);
    const has = engine.listenerCount('viz') > 0;
    if (want && !has) engine.on('viz', vizListener);
    if (!want && has) engine.off('viz', vizListener);
  }

  const broadcast = (obj, filter = () => true) => {
    const s = JSON.stringify(obj);
    for (const c of uiClients) if (filter(c) && c.ws.readyState === 1) c.ws.send(s);
  };

  engine.on('state', () => {
    const st = { ...engine.state(), lan: lanUrls(port, engine.settings.token), token: engine.settings.token };
    for (const c of uiClients) send(c.ws, { ...st, local: c.local });
  });
  const unsubLog = log.onEntry?.((entry) => broadcast({ type: 'log', entry }, (c) => c.role === 'ui'));

  // live touches at 30 Hz, status at 2 Hz, point clouds at ≤10 Hz (binary)
  let liveN = 0;
  engine.on('frame', (frame) => {
    if (!uiClients.size) return;
    liveN++;
    if (liveN % 2 === 0) {
      const live = {
        type: 'live', t: Math.round(frame.t), roomCount: frame.roomCount, burst: frame.burst,
        walls: Object.fromEntries(frame.walls.map((w) => [w.wall.id, w.touches.map((t) => [t.id, r3(t.x), r3(t.y), r3(t.size), t.coasting ? 1 : 0])])),
        zones: frame.zoneCounts,
        events: frame.events.length ? frame.events.map((e) => ({ type: e.type, id: e.id, wallId: e.wallId, x: r3(e.x), y: r3(e.y) })) : undefined,
        calib: engine.calib ? engine.calib.snapshot(frame.t) : null, // smooth progress ring on the tablet
      };
      broadcast(live);
    }
    if (liveN % 30 === 0) broadcast(engine.status());
    if (liveN % 6 === 0) sendViz();
  });

  function sendViz() {
    const targets = [...uiClients].filter((c) => c.viz);
    if (!targets.length) return;
    const parts = [], head = [];
    let offset = 0;
    for (const [id, rt] of engine.sensors) {
      const v = rt.viz;
      if (!v) continue;
      head.push({ id, wallId: rt.cfg.wallId, offset, count: v.length / 3, rejected: rt.rejected.map((r) => [r3(r.x), r3(r.y), r3(r.size)]), det: rt.lastDetections.map((d) => [r3(d.x), r3(d.y), r3(d.size)]) });
      parts.push(v);
      offset += v.length;
    }
    const hjson = Buffer.from(JSON.stringify({ type: 'viz', sensors: head }));
    const padded = (hjson.length + 4 + 3) & ~3;
    const buf = Buffer.alloc(padded + offset * 4);
    buf.writeUInt32LE(hjson.length, 0);
    hjson.copy(buf, 4);
    let o = padded;
    for (const v of parts) { Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf, o); o += v.byteLength; }
    for (const c of targets) {
      c.vizN++;
      if (c.vizN % c.vizEvery === 0 && c.ws.readyState === 1 && c.ws.bufferedAmount < 2e6) c.ws.send(buf);
    }
  }

  // ------------------------------------------------------------------ data clients (apps)

  const dataClients = new Set();
  function onData(ws) {
    const c = { ws, every: 1, n: 0 };
    dataClients.add(c);
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw);
        if (m.type === 'subscribe') c.every = Math.max(1, Math.round(60 / Math.max(1, Math.min(60, m.rateHz || 60))));
      } catch { /* ignore */ }
    });
    ws.on('close', () => dataClients.delete(c));
    ws.on('error', () => {});
    send(ws, { type: 'hello', version: engine.version, profile: { id: engine.profile.id, name: engine.profile.name, canvas: engine.profile.canvas, walls: engine.profile.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: w.height, pixelRect: w.pixelRect })) } });
  }
  engine.on('frame', (frame) => {
    if (!dataClients.size) return;
    let json = null;
    for (const c of dataClients) {
      c.n++;
      const hasEvents = frame.events.length || frame.zoneEvents.length;
      if (c.n % c.every !== 0 && !hasEvents) continue;
      if (c.ws.readyState !== 1 || c.ws.bufferedAmount > 1e6) continue;
      json ??= JSON.stringify(engine.publicFrame(frame));
      c.ws.send(json);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      log.info(`server listening on :${port}`);
      resolve({
        port,
        close: () => { unsubLog?.(); for (const c of uiClients) c.ws.terminate(); for (const c of dataClients) c.ws.terminate(); server.close(); },
      });
    });
  });
}

const r3 = (v) => Math.round(v * 1000) / 1000;
