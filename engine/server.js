// HTTP + WebSocket server. The SAME web UI is served to the Electron window and to phones
// and tablets on the LAN, so the engine keeps working if the desktop window closes.
//   /                 operator UI          /projection   projection output page
//   /sdk/…            client SDK for apps  /api/qr.svg   QR code for pairing a device
//   /ws/ui            UI channel (state, commands, live view) — LAN clients need ?k=<token>
//   /ws/data          touch stream for apps (JSON frames), read-only, no token
//   /api/media/thumb/<mediaId>.png   clip thumbnails (UI rule)   /api/media/pcm   raw clip audio (this computer only)

import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import v8 from 'node:v8';
import { WebSocketServer } from 'ws';
import { compactState } from './media/wire.js';
import { wifiSsids, looksLikeGuestNetwork } from './net.js';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  // what an experience's folder may hold
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.glsl': 'text/plain; charset=utf-8', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** `rel` inside `dir`, or null when it climbs out (the check is on the resolved path, so ..\, %2F and absolute paths all fail). */
const within = (dir, rel) => {
  if (rel.includes('\0')) return null;
  const base = path.resolve(dir), p = path.resolve(base, rel);
  return p.startsWith(base + path.sep) ? p : null;
};

const isLocal = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

/**
 * Addresses a phone/tablet could use. Link-local (169.254.x) and virtual adapters are skipped;
 * Wi-Fi first, because a tablet joins over Wi-Fi when the server has one (in the room the server
 * is usually wired and the tablet reaches it through an access point on the same LAN).
 */
const ip4 = (s) => s.split('.').reduce((a, n) => ((a << 8) | (Number(n) & 255)) >>> 0, 0);

/**
 * …and the interface that reaches the LiDARs (same subnet as a sensor IP) is marked `sensors`
 * and listed last: a tablet should not be put on the sensor network.
 */
export function lanUrls(port, token, sensorHosts = [], ifaces = os.networkInterfaces(), ssids = {}) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|bluetooth/i.test(name)) continue;
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      // Windows "Mobile hotspot" (this PC as the access point) always uses 192.168.137.1: the most robust option
      const kind = a.address.startsWith('192.168.137.') ? 'hotspot' : /wi-?fi|wlan|wireless/i.test(name) ? 'wifi' : /ethernet|^eth|^en/i.test(name) ? 'ethernet' : 'other';
      const mask = ip4(a.netmask || '255.255.255.0');
      const sensors = sensorHosts.some((h) => /^(\d{1,3}\.){3}\d{1,3}$/.test(h) && (ip4(h) & mask) === (ip4(a.address) & mask));
      // ssid: the Wi-Fi the phone must join; guest: that Wi-Fi probably keeps devices apart (client isolation)
      const ssid = ssids[name] || null;
      out.push({ iface: name, kind, ip: a.address, sensors, url: `http://${a.address}:${port}/?k=${token}`, ssid, guest: looksLikeGuestNetwork(ssid) });
    }
  }
  const rank = { hotspot: -1, wifi: 0, ethernet: 1, other: 2 };
  return out.sort((a, b) => (a.sensors - b.sensors) || rank[a.kind] - rank[b.kind]);
}

/**
 * @param {import('./engine.js').Engine} engine
 * @param {{port:number, root:string, log:object}} opt
 */
export function createServer(engine, { port, root, log, trustLocal = true }) {
  // trustLocal: this computer needs no access key (the desktop window). Tests turn it off to act as a tablet.
  const isTrusted = (addr) => trustLocal && isLocal(addr);

  /**
   * THE place that decides who is asking (HTTP and WebSocket alike). Traffic the relay forwards (engine/cloud.js)
   * also arrives from 127.0.0.1, stamped with this process's secret x-vt-tunnel token: that is a REMOTE device,
   * never local, never trusted, always needs the access key. Loopback with a wrong or missing token is the desktop.
   * → { addr, local, trusted, tunnel }
   */
  const peerOf = (req) => {
    const raw = req.socket.remoteAddress;
    const have = req.headers['x-vt-tunnel'], want = engine.cloud?.tunnelToken;
    if (isLocal(raw) && want && typeof have === 'string' && have.length === want.length && crypto.timingSafeEqual(Buffer.from(have), Buffer.from(want))) {
      const ip = oneLine(req.headers['x-vt-client-ip'], 64).trim() || 'unknown';
      return { addr: `internet (${ip})`, local: false, trusted: false, tunnel: true };
    }
    return { addr: raw, local: isLocal(raw), trusted: isTrusted(raw), tunnel: false };
  };
  const uiDir = path.join(root, 'ui');
  const sdkDir = path.join(root, 'sdk');

  const serveFile = (res, file, extra = null) => {
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extra });
      res.end(data);
    });
  };
  // The audio window shares memory between its audio contexts (SharedArrayBuffer), which the browser only allows on a
  // cross-origin-isolated page. The page asks for isolation (COOP + COEP); everything it loads is ours and says so (CORP).
  // /sdk/ is left out: other apps load it from their own origin.
  const ISOLATED = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const OWN = { 'Cross-Origin-Resource-Policy': 'same-origin' };

  const safeJoin = (dir, rel) => {
    const p = path.normalize(path.join(dir, rel));
    return p.startsWith(dir) ? p : null;
  };

  // Wi-Fi names, refreshed in the background (netsh takes ~100 ms): the pairing panel names the network to join
  let ssids = {};
  const refreshSsids = () => wifiSsids().then((s) => { ssids = s; }).catch(() => {});
  refreshSsids();
  const ssidTimer = setInterval(refreshSsids, 20000);
  ssidTimer.unref?.();
  const lan = () => lanUrls(port, engine.settings.token, engine.profile.sensors.filter((s) => s.driver === 's2e').map((s) => s.host), os.networkInterfaces(), ssids);

  // Devices that opened the page from another address, even if they never connected: tells "the phone reached this
  // computer but could not connect" apart from "nothing reached it" (another network, or a Wi-Fi that isolates devices)
  const reached = new Map();
  const noteReached = (req) => {
    const peer = peerOf(req);
    const addr = String(peer.addr || '').replace('::ffff:', '');
    if (!addr || peer.local) return;
    const device = deviceName(String(req.headers['user-agent'] || ''));
    const prev = reached.get(addr);
    if (!prev || Date.now() - prev.at > 600000) log.info(`page opened from ${addr} (${device})`);
    reached.set(addr, { addr, device, at: Date.now() });
    if (reached.size > 50) reached.delete(reached.keys().next().value);
  };
  const reachedList = () => [...reached.values()].filter((r) => Date.now() - r.at < 15 * 60000);

  // A page that fails on a device (boot-guard.js) sends its error here: it lands in the log, so a phone's problem can
  // be read on the computer. Open to any device (a page that did not start has no key yet), so: small bodies, one
  // line per error, at most 20 per address every 10 minutes.
  const errorBudget = new Map();
  const oneLine = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n);
  const clientError = (req, res) => {
    const peer = peerOf(req);
    const addr = String(peer.addr || '').replace('::ffff:', '');
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 4096) { req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      res.writeHead(204); res.end();
      const b = errorBudget.get(addr);
      const now = Date.now();
      const budget = b && now - b.since < 600000 ? b : { since: now, n: 0 };
      if (++budget.n > 20) return;
      errorBudget.set(addr, budget);
      let j = {};
      try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON: still worth a line */ }
      const who = peer.local ? 'this computer' : `${deviceName(String(req.headers['user-agent'] || ''))} (${addr})`;
      log.warn(`page error on ${who}, ${oneLine(j.page, 40) || '?'}${j.started ? '' : ' — the page did not start'}: ${oneLine(j.message, 300)}${j.where ? ` at ${oneLine(j.where, 200)}` : ''}`);
    });
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); } // a malformed %-escape must not reach the engine's crash handler
    if (p === '/' || p === '/index.html') noteReached(req);
    if (p === '/api/client-error' && req.method === 'POST') return clientError(req, res);
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(uiDir, 'index.html'));
    if (p === '/projection') return serveFile(res, path.join(uiDir, 'projection.html'));
    if (p === '/texture') return serveFile(res, path.join(uiDir, 'texture.html')); // a Texture output shown full screen
    if (p === '/audio') return serveFile(res, path.join(uiDir, 'audio.html'), ISOLATED);        // the room's sound: a hidden window of the desktop app (or a browser tab)
    if (p === '/output') return serveFile(res, path.join(uiDir, 'output.html'));   // the room output: the layers composed (the desktop app's window sends it to Spout)
    // the browser uses the very same geometry code as the engine (one implementation of the mapping)
    if (p === '/shared/geometry.js' || p === '/shared/core/geometry.js') return serveFile(res, path.join(root, 'engine', 'core', 'geometry.js'), OWN);
    // the Advanced Output's geometry and templates (screens ▸ slices): the engine, the output page and the UI share it
    // (it imports ../core/geometry.js, hence the alias above)
    if (p === '/shared/media/screens.js') return serveFile(res, path.join(root, 'engine', 'media', 'screens.js'), OWN);
    // the compact state of the relay's clients, expanded back by conn.js (engine/media/wire.js)
    if (p === '/shared/media/wire.js') return serveFile(res, path.join(root, 'engine', 'media', 'wire.js'), OWN);
    if (p === '/shared/mask.js') return serveFile(res, path.join(root, 'engine', 'core', 'mask.js')); // the Texture output's rasteriser (live preview)
    // the transport's playhead() — THE formula of a clip's position — for the mixer, the HAP player and the audio page
    if (p === '/shared/transport.js') return serveFile(res, path.join(root, 'engine', 'media', 'transport.js'), OWN);
    // the HAP decoders of the output page's workers read the movies with the engine's own code (mov.js imports ./hap.js)
    if (p === '/shared/mov.js') return serveFile(res, path.join(root, 'engine', 'media', 'mov.js'), OWN);
    if (p === '/shared/hap.js') return serveFile(res, path.join(root, 'engine', 'media', 'hap.js'), OWN);
    if (p === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const mem = process.memoryUsage(), mb = (b) => Math.round(b / 1048576);
      return res.end(JSON.stringify({
        ok: true, version: engine.version, profile: engine.profile?.id, uptimeS: Math.round(process.uptime()),
        memory: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed), heapLimitMb: mb(v8.getHeapStatistics().heap_size_limit) },
        // the 60 Hz loop (fps, tickMaxMs, tickGapMs) and what needs attention, as codes only (no file names: no key here)
        engine: (({ fps, tickMaxMs, tickGapMs }) => ({ fps, tickMaxMs, tickGapMs }))(engine.engineStats()),
        problems: engine.healthItems().map((x) => `${x.kind}:${x.code}`),
      }));
    }
    if (p === '/api/pair-check') {
      // does this device hold a valid access key? (the UI tells "not paired" apart from "engine down"; never leaks it)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ paired: peerOf(req).trusted || url.searchParams.get('k') === engine.settings.token }));
    }
    if (p === '/api/qr.svg') {
      const text = url.searchParams.get('t') || '';
      const qr = qrcode(0, 'M');
      qr.addData(text.slice(0, 500));
      qr.make();
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      return res.end(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
    }
    if (p === '/api/underlay') {
      const pid = url.searchParams.get('p') || engine.profile.id;
      if (req.method === 'GET') {
        const u = /^[A-Za-z0-9_-]{1,40}$/.test(pid) ? engine.store.underlayInfo(pid) : null;
        if (!u) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[u.ext], 'Cache-Control': 'max-age=31536000' });
        return fs.createReadStream(u.file).pipe(res);
      }
      if (req.method === 'POST') {
        // same rule as the UI channel: localhost, or the access key
        if (!peerOf(req).trusted && url.searchParams.get('k') !== engine.settings.token) { res.writeHead(401); return res.end(); }
        if (engine.settings.locked) { res.writeHead(423, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'the room is locked (Show mode)' })); }
        const chunks = []; let size = 0;
        req.on('data', (c) => { size += c.length; if (size > 25 * 1048576) { req.destroy(); return; } chunks.push(c); });
        req.on('end', () => {
          try {
            if (url.searchParams.get('remove')) engine.store.deleteUnderlay(engine.profile.id);
            else engine.store.saveUnderlay(engine.profile.id, Buffer.concat(chunks));
            engine.emit('state');
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
          } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
        });
        return undefined;
      }
    }
    if (p === '/experiences/runtime.js') return serveFile(res, path.join(root, 'experiences', 'runtime.js'), OWN);
    if (p.startsWith('/experiences/')) {
      // /experiences/<id>/<file>: the folder of a catalog entry, nothing else (no listing: a folder is a 404)
      const rest = p.slice('/experiences/'.length), cut = rest.indexOf('/');
      const e = cut > 0 ? engine.catalog.find((c) => c.id === rest.slice(0, cut)) : null;
      const f = e ? within(e.dir, rest.slice(cut + 1)) : null;
      if (!f) { res.writeHead(404); return res.end('not found'); }
      return serveFile(res, f, OWN);
    }
    if (p === '/api/experience/preview.jpg' && req.method === 'GET') {
      // the running page's last frame, for the Experiences tab: same rule as the UI channel (this computer, or the key)
      if (!peerOf(req).trusted && url.searchParams.get('k') !== engine.settings.token) { res.writeHead(401); return res.end(); }
      engine.notePreviewAsked?.(); // the desktop app captures the output only while someone looks at it
      const pv = engine.outPreview;
      if (!pv) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
      return res.end(pv.buf);
    }
    if (p === '/api/experience/preview' && req.method === 'POST') {
      // only the page running on THIS computer posts it (a LAN device or the internet relay never does)
      if (!peerOf(req).local) { res.writeHead(403); return res.end(); }
      const chunks = []; let size = 0, over = false;
      req.on('data', (c) => { size += c.length; if (over) return; if (size > 300 * 1024) { over = true; chunks.length = 0; res.writeHead(413, { Connection: 'close' }); res.end(); res.on('finish', () => req.destroy()); return; } chunks.push(c); });
      req.on('end', () => {
        if (over) return;
        const buf = Buffer.concat(chunks);
        if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) { res.writeHead(400); return res.end(); } // a JPEG, nothing else
        res.writeHead(engine.setOutputPreview(buf) ? 204 : 409); res.end();
      });
      return undefined;
    }
    if (p.startsWith('/api/media/thumb/') && req.method === 'GET') {
      // a clip's thumbnail (MEDIA-SERVER.md §4d.4): same rule as the UI channel (this computer, or the key). The URL
      // carries the file's fingerprint (?v=), so a phone keeps it for good; it also travels through the relay.
      if (!peerOf(req).trusted && url.searchParams.get('k') !== engine.settings.token) { res.writeHead(401); return res.end(); }
      const m = /^\/api\/media\/thumb\/([A-Za-z0-9_-]{1,40})\.png$/.exec(p);
      if (!m) { res.writeHead(404); return res.end(); }
      engine.media.thumbFile(m[1], url.searchParams.get('s')).then((t) => {
        if (!t) { res.writeHead(404); return res.end(); }
        const immutable = url.searchParams.get('v') === t.fingerprint;
        serveFile(res, t.file, { ...OWN, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
      }, (e) => { log.warn(`thumbnail ${m[1]}: ${e.message}`); res.writeHead(500); res.end(); });
      return undefined;
    }
    if (p === '/api/media/pcm' && req.method === 'GET') {
      // raw PCM of a clip for the audio window (§4c.1): THIS computer only — refused from the LAN and through the relay
      // (peerOf: tunnel traffic arrives on loopback but is never local)
      if (!peerOf(req).local) { res.writeHead(403); return res.end(); }
      engine.media.pcm({ clip: url.searchParams.get('clip'), media: url.searchParams.get('media'), from: url.searchParams.get('from') ?? 0, n: url.searchParams.get('n') }).then((r) => {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream', 'Content-Length': r.body.length, 'Cache-Control': 'no-store', ...OWN,
          'X-VT-Encoding': r.encoding, 'X-VT-Channels': r.channels, 'X-VT-Rate': r.rate, 'X-VT-From': r.from, 'X-VT-Frames': r.frames, 'X-VT-Total': r.total,
        });
        res.end(r.body);
      }, (e) => { res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
      return undefined;
    }
    if (p.startsWith('/sdk/')) { const f = safeJoin(sdkDir, p.slice(5)); return f ? serveFile(res, f) : (res.writeHead(400), res.end()); }
    const f = safeJoin(uiDir, p.slice(1));
    if (f) return serveFile(res, f, OWN);
    res.writeHead(400); res.end();
  });

  const wssUi = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  const wssData = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const peer = peerOf(req);
    const addr = peer.addr;
    if (url.pathname === '/ws/ui') {
      if (!peer.trusted && url.searchParams.get('k') !== engine.settings.token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
        log.warn(`UI connection refused from ${addr} (missing/wrong access key)`);
        return;
      }
      wssUi.handleUpgrade(req, socket, head, (ws) => onUi(ws, peer, url, String(req.headers['user-agent'] || '')));
    } else if (url.pathname === '/ws/data') {
      // apps on the LAN read touches without a key; from the internet the key is required
      if (peer.tunnel && url.searchParams.get('k') !== engine.settings.token) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      wssData.handleUpgrade(req, socket, head, (ws) => onData(ws));
    } else socket.destroy();
  });

  // ------------------------------------------------------------------ UI clients

  const uiClients = new Set();
  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  /** A device that comes through the internet relay gets the state compact (engine/media/wire.js; conn.js expands it). */
  const forClient = (c, obj) => (c.tunnel ? compactState(obj) : obj);

  let clientSeq = 0;
  function onUi(ws, peer, url, ua = '') {
    const addr = peer.addr;
    const client = { ws, addr, id: `d${++clientSeq}`, role: url.searchParams.get('role') || 'ui', viz: false, vizEvery: 1, vizN: 0, local: peer.local, tunnel: !!peer.tunnel, ua, since: Date.now() };
    if (!client.local) log.info(`device connected from ${addr.replace('::ffff:', '')} (${deviceName(ua)})`);
    uiClients.add(client);
    updateVizListener();
    send(ws, forClient(client, { ...engine.state(), lan: lan(), token: engine.settings.token, local: client.local, you: client.id }));
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
          // __local / __client are set here, never trusted from the client: some commands only make sense at the
          // server, and while a calibration runs only the device driving it may change things
          const who = { id: client.id, device: client.local ? 'the desktop' : `${deviceName(client.ua)} (${client.addr.replace('::ffff:', '')})`, addr: client.addr.replace('::ffff:', '') };
          const result = await engine.command(m.op, { ...(m.args || {}), __local: client.local, __client: who });
          send(ws, { type: 'ack', id: m.id, ok: true, result });
        } catch (e) {
          send(ws, { type: 'ack', id: m.id, ok: false, error: e.message });
          if (/^stale/.test(e.message)) send(ws, forClient(client, engine.state()));
        }
      }
    });
    ws.on('close', () => { uiClients.delete(client); updateVizListener(); engine.clientGone?.(client.id); });
    ws.on('error', () => {});
  }

  /** Devices currently connected to the UI (for the live "device reached" confirmation). */
  function clientList() {
    return [...uiClients].filter((c) => c.role === 'ui').map((c) => ({ addr: c.addr.replace('::ffff:', ''), local: c.local, device: deviceName(c.ua), since: c.since }));
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

  let liveRoom = null, pendingEvents = []; // UI live feed: events of the frames between two live messages
  engine.on('state', () => {
    // another room: events still waiting for the next live message belong to the old one
    if (liveRoom !== engine.profile.id) { liveRoom = engine.profile.id; pendingEvents = []; }
    const st = { ...engine.state(), lan: lan(), token: engine.settings.token };
    const small = [...uiClients].some((c) => c.tunnel) ? compactState(st) : null;
    for (const c of uiClients) send(c.ws, { ...(c.tunnel ? small : st), local: c.local, you: c.id });
  });
  const unsubLog = log.onEntry?.((entry) => broadcast({ type: 'log', entry }, (c) => c.role === 'ui'));
  // the media server's own changes (copies in progress, problems): small, so the whole state is not sent each time
  const onMedia = (m) => { // copies, problems AND the transport (engine/media/transport.js); compact through the relay
    const msg = { type: 'media', ...m };
    broadcast(msg, (c) => !c.tunnel);
    if ([...uiClients].some((c) => c.tunnel)) broadcast(compactState(msg), (c) => c.tunnel);
  };
  engine.on('media', onMedia);
  // a play started, ended (with why) or failed: { event, playId, clipId, layerId, … } — for the experience runtime (vt.media.on)
  const onMediaEvent = (e) => broadcast({ type: 'mediaEvent', ...e });
  engine.on('mediaEvent', onMediaEvent);

  // The UI's live feed (internal; not /ws/data or OSC) sends each touch as [id, x, y, size, coasting, rx, ry, seenAt]. x, y are the
  // tracker's (up to predictMs of extrapolation); rx, ry (m) are the filtered position at the touch's last REAL reading and
  // seenAt (ms) its engine time — the clock of live.t. The experience runtime plays hands back from those, never from x, y.
  // Appended at the end so older readers keep working; a tracker without them gives x, y and the frame's time.
  const realReading = (t, now) => [r3(t.rx ?? t.x), r3(t.ry ?? t.y), Math.round(Number.isFinite(t.seenAt) ? t.seenAt : now)];

  // live touches at 30 Hz, status at 2 Hz, point clouds at ≤10 Hz (binary)
  let liveN = 0;
  engine.on('frame', (frame) => {
    if (!uiClients.size) return;
    liveN++;
    // touches go out at 30 Hz, but no event may be lost in the frames between
    if (frame.events.length) pendingEvents.push(...frame.events);
    if (liveN % 2 === 0) {
      const evs = pendingEvents; pendingEvents = [];
      const live = {
        type: 'live', t: Math.round(frame.t), roomCount: frame.roomCount, burst: frame.burst,
        walls: Object.fromEntries(frame.walls.map((w) => [w.wall.id, w.touches.map((t) => [t.id, r3(t.x), r3(t.y), r3(t.size), t.coasting ? 1 : 0, ...realReading(t, frame.t)])])),
        zones: frame.zoneCounts,
        events: evs.length ? evs.slice(-50).map((e) => ({ type: e.type, id: e.id, wallId: e.wallId, x: r3(e.x), y: r3(e.y), ...(e.from ? { from: e.from } : {}) })) : undefined,
        calib: engine.calib ? engine.calib.snapshot(frame.t) : null, // smooth progress ring on the tablet
        verify: engine.verify ? engine.verify.snapshot(frame.t) : null,
        calibHands: engine.calib ? engine.calibHandsSnapshot() : undefined, // the hands the wall shows while it is calibrated: raw detections [x, y, size] per wall
      };
      broadcast(live);
    }
    if (liveN % 30 === 0) broadcast({ ...engine.status(), clients: clientList(), reached: reachedList(), projections: [...uiClients].filter((c) => c.role === 'projection').length, textureWindows: [...uiClients].filter((c) => c.role === 'texture').length });
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
    send(ws, { type: 'hello', version: engine.version, profile: { id: engine.profile.id, name: engine.profile.name, canvas: engine.profile.canvas, walls: engine.profile.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: w.height, pixelRect: w.pixelRect, mapping: w.mapping })) } });
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
      const bound = server.address().port; // port 0 = any free port (tests)
      log.info(`server listening on :${bound}`);
      resolve({
        port: bound,
        close: () => { clearInterval(ssidTimer); unsubLog?.(); engine.off('media', onMedia); engine.off('mediaEvent', onMediaEvent); for (const c of uiClients) c.ws.terminate(); for (const c of dataClients) c.ws.terminate(); server.close(); },
      });
    });
  });
}

const r3 = (v) => Math.round(v * 1000) / 1000;

function deviceName(ua) {
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Electron/.test(ua)) return 'desktop app';
  if (/Windows/.test(ua)) return 'Windows browser';
  if (/Macintosh/.test(ua)) return 'Mac browser';
  return 'browser';
}
