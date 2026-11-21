// Internet access: the relay (cloud/relay, run on Node here) + the engine's outbound link (engine/cloud.js) + the
// trust rules of the local server (engine/server.js › peerOf). Everything runs on loopback; no Electron needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { startRelay } from '../cloud/relay/node-relay.mjs';
import { route, RoomHub, LIMITS } from '../cloud/relay/core.mjs';
import { makeHap } from './fixtures/media/make-hap.mjs';
import { expandState } from '../engine/media/wire.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

/** A relay + an engine with its server, linked. */
async function rig({ link = true } = {}) {
  const relay = await startRelay({ port: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cloud-'));
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const base = `http://127.0.0.1:${relay.port}`;
  const c = engine.settings.cloud;
  const r = { relay, engine, server, dir, base, c, token: engine.settings.token };
  if (link) {
    await engine.command('cloud.set', { enabled: true, relayUrl: base, launcherUrl: '', __local: true });
    await until(() => engine.cloud.state === 'online', 8000, 'the link to come online');
  }
  r.cookie = () => `vt_room=${engine.settings.cloud.roomId}`;
  r.get = (p, { cookie = r.cookie(), headers = {}, ...o } = {}) => fetch(base + p, { redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...headers }, ...o });
  r.close = async () => {
    server.close(); await engine.stop(); await relay.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return r;
}

/** A WebSocket collecting what it receives; resolves once open or closed. */
function sock(url, { headers = {} } = {}) {
  const ws = new WebSocket(url, { headers });
  const s = { ws, msgs: [], closed: null, opened: false, status: null };
  ws.on('open', () => { s.opened = true; });
  ws.on('message', (d, bin) => { if (!bin) { try { s.msgs.push(JSON.parse(d.toString())); } catch { /* not JSON */ } } });
  ws.on('close', (code) => { s.closed = code; });
  ws.on('unexpected-response', (_q, res) => { s.status = res.statusCode; res.resume(); s.closed = s.closed ?? -1; });
  ws.on('error', () => {});
  s.cmd = (op, args) => {
    const id = `c${Math.random()}`;
    ws.send(JSON.stringify({ type: 'cmd', id, op, args }));
    return until(() => s.msgs.find((m) => m.type === 'ack' && m.id === id), 5000, `ack of ${op}`);
  };
  return s;
}

test('cloud: the page loads through the relay — /r/<room>/ sets the cookie and keeps ?k=', async () => {
  const t = await rig();
  try {
    const enter = await t.get(`/r/${t.c.roomId}/?k=${t.token}`, { cookie: null });
    assert.equal(enter.status, 302);
    assert.equal(enter.headers.get('location'), `/?k=${t.token}`);
    const setCookie = enter.headers.get('set-cookie');
    assert.match(setCookie, new RegExp(`vt_room=${t.c.roomId}; Path=/; HttpOnly; SameSite=Lax`));
    const page = await t.get(`/?k=${t.token}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);
    const js = await t.get('/js/dom.js'); // absolute asset paths work because the room is in the cookie
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    // a request body travels too, and the engine sees the real client address stamped by the relay
    const post = await t.get('/api/client-error', { method: 'POST', body: JSON.stringify({ page: 'x', message: 'boom' }) });
    assert.equal(post.status, 204);
    // no cookie: help page; unknown room: offline page
    assert.equal((await t.get('/', { cookie: null })).status, 200);
    const other = await t.get('/', { cookie: 'vt_room=zzzzzzzzzz' });
    assert.equal(other.status, 503);
    assert.match(await other.text(), /server is offline/);
  } finally { await t.close(); }
});

test('cloud: /ws/ui through the relay receives the state, as a remote device (never local)', async () => {
  const t = await rig();
  try {
    const s = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=${t.token}&role=ui`, { headers: { cookie: t.cookie() } });
    const st = await until(() => s.msgs.find((m) => m.type === 'state'), 8000, 'state through the tunnel');
    assert.equal(st.local, false, 'a tunnelled device is not the desktop');
    assert.equal(st.cloud.state, 'online');
    assert.equal(st.cloud.roomId, t.c.roomId);
    assert.ok(!JSON.stringify(st).includes(t.c.secret), 'the relay secret never reaches a device');
    // the engine knows where it came from
    await until(() => s.msgs.find((m) => m.type === 'status' && (m.clients || []).some((c) => /^internet \(/.test(c.addr))), 8000, 'the client list to show the internet device');
    s.ws.close();
  } finally { await t.close(); }
});

test('cloud: without the access key the tunnel is refused, although the engine sees loopback', async () => {
  const t = await rig();
  try {
    const s = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui`, { headers: { cookie: t.cookie() } });
    await until(() => s.closed !== null, 8000, 'the refusal');
    assert.equal(s.msgs.find((m) => m.type === 'state'), undefined, 'no state without the key');
    const bad = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=wrong`, { headers: { cookie: t.cookie() } });
    await until(() => bad.closed !== null, 8000, 'the refusal');
    assert.equal(bad.msgs.length, 0);
    // the touch stream is open on the LAN, but not on the internet
    const data = sock(`ws://127.0.0.1:${t.relay.port}/ws/data`, { headers: { cookie: t.cookie() } });
    await until(() => data.closed !== null, 8000, 'the refusal of /ws/data');
    assert.equal(data.msgs.length, 0);
    // pair-check: loopback is paired when it is the desktop, not when it came through the tunnel
    assert.equal((await (await t.get('/api/pair-check')).json()).paired, false);
    assert.equal((await (await t.get(`/api/pair-check?k=${t.token}`)).json()).paired, true);
    assert.equal((await (await fetch(`http://127.0.0.1:${t.server.port}/api/pair-check`)).json()).paired, true, 'the desktop needs no key');
    // a forged tunnel header from the browser side is dropped by the relay and does not turn a device into the desktop
    assert.equal((await (await t.get('/api/pair-check', { headers: { 'x-vt-tunnel': 'x'.repeat(48) } })).json()).paired, false);
    // loopback with a wrong token behaves as today: it is the desktop
    assert.equal((await (await fetch(`http://127.0.0.1:${t.server.port}/api/pair-check`, { headers: { 'x-vt-tunnel': 'nope' } })).json()).paired, true);
  } finally { await t.close(); }
});

test('cloud: local-only commands are refused through the tunnel and accepted at the desktop', async () => {
  const t = await rig();
  try {
    const remote = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=${t.token}`, { headers: { cookie: t.cookie() } });
    await until(() => remote.msgs.find((m) => m.type === 'state'), 8000, 'state');
    const roomBefore = t.c.roomId;
    for (const [op, args] of [['cloud.set', { enabled: false }], ['cloud.reset', {}], ['net.fixFirewall', {}], ['net.openHotspot', {}], ['net.setSensorNic', { iface: 'x' }]]) {
      const ack = await remote.cmd(op, args);
      assert.equal(ack.ok, false, `${op} must be refused through the tunnel`);
      assert.match(ack.error, /server itself|server|unknown or|not waiting/);
    }
    assert.equal(t.c.enabled, true);
    assert.equal(t.c.roomId, roomBefore, 'cloud.reset did not run');
    const status = await remote.cmd('cloud.status', {});
    assert.equal(status.ok, true);
    // …while the same command at the server itself works (loopback, no tunnel token)
    const desk = sock(`ws://127.0.0.1:${t.server.port}/ws/ui`);
    const st = await until(() => desk.msgs.find((m) => m.type === 'state'), 8000, 'desktop state');
    assert.equal(st.local, true);
    const ack = await desk.cmd('cloud.set', { launcherUrl: 'https://launcher.example' });
    assert.equal(ack.ok, true);
    assert.equal(t.c.launcherUrl, 'https://launcher.example');
    assert.equal(t.engine.cloud.state, 'online', 'changing only the launcher keeps the link');
    desk.ws.close(); remote.ws.close();
  } finally { await t.close(); }
});

test('cloud: the public link carries room, key and relay; New address replaces room and secret', async () => {
  const t = await rig();
  try {
    const before = { ...t.c };
    await t.engine.command('cloud.set', { launcherUrl: 'https://veation-touch.vercel.app', __local: true });
    const st = t.engine.cloud.status();
    assert.equal(st.link, `https://veation-touch.vercel.app/#r=${before.roomId}&k=${t.token}&relay=${encodeURIComponent(t.base)}`);
    await t.engine.command('cloud.set', { launcherUrl: '', __local: true });
    assert.equal(t.engine.cloud.status().link, `${t.base}/r/${before.roomId}/?k=${t.token}`);
    await t.engine.command('cloud.reset', { __local: true });
    assert.notEqual(t.c.roomId, before.roomId);
    assert.notEqual(t.c.secret, before.secret);
    assert.match(t.c.roomId, /^[a-z2-7]{10}$/);
    await until(() => t.engine.cloud.state === 'online', 8000, 'the link under the new address');
    assert.equal((await t.get('/api/health', { cookie: `vt_room=${before.roomId}` })).status, 503, 'the old address is dead');
    assert.equal((await t.get('/api/health')).status, 200, 'the new one works');
    // persisted
    assert.equal(new Store(t.dir, path.join(root, 'profiles'), quiet).loadSettings().cloud.roomId, t.c.roomId);
  } finally { await t.close(); }
});

test('cloud: a wrong secret gets 403 and cannot hijack a claimed room', async () => {
  const t = await rig();
  try {
    const url = `ws://127.0.0.1:${t.relay.port}/_relay/link?room=${t.c.roomId}`;
    const thief = sock(url, { headers: { authorization: 'Bearer ' + 'x'.repeat(43) } });
    await until(() => thief.closed !== null, 8000, 'refusal');
    assert.equal(thief.status, 403);
    assert.equal(thief.opened, false);
    const none = sock(url);
    await until(() => none.closed !== null, 8000, 'refusal without secret');
    assert.equal(none.status, 403);
    // the real server is still the one answering
    assert.equal(t.engine.cloud.state, 'online');
    assert.equal((await t.get('/api/health')).status, 200);
    // the same secret may re-link and replaces the old link
    const again = sock(url, { headers: { authorization: `Bearer ${t.c.secret}` } });
    await until(() => again.opened, 8000, 'a valid second link');
    const status = await (await t.get(`/_relay/status?room=${t.c.roomId}`, { cookie: null })).json();
    assert.equal(status.online, true);
    again.ws.close();
  } finally { await t.close(); }
});

test('cloud: /_relay/status tells the launcher whether a room is online, with CORS', async () => {
  const t = await rig({ link: false });
  try {
    const room = t.c.roomId;
    let r = await t.get(`/_relay/status?room=${room}`, { cookie: null });
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await r.json(), { online: false, name: '' });
    await t.engine.command('cloud.set', { enabled: true, relayUrl: t.base, __local: true });
    await until(() => t.engine.cloud.state === 'online', 8000, 'online');
    const j = await until(async () => { const x = await (await t.get(`/_relay/status?room=${room}`, { cookie: null })).json(); return x.name ? x : null; }, 5000, 'the room name');
    assert.deepEqual(j, { online: true, name: t.engine.profile.name });
    await t.engine.command('cloud.set', { enabled: false, __local: true });
    await until(async () => !(await (await t.get(`/_relay/status?room=${room}`, { cookie: null })).json()).online, 5000, 'offline after switching off');
    const off = await t.get('/');
    assert.equal(off.status, 503);
  } finally { await t.close(); }
});

test('cloud: the engine reconnects by itself after the relay restarts', async () => {
  const t = await rig();
  let relay2;
  try {
    const port = t.relay.port;
    const s = sock(`ws://127.0.0.1:${port}/ws/ui?k=${t.token}`, { headers: { cookie: t.cookie() } });
    await until(() => s.msgs.find((m) => m.type === 'state'), 8000, 'state');
    await t.relay.close();
    await until(() => s.closed !== null, 8000, 'the browser socket to drop with the link');
    await until(() => t.engine.cloud.state !== 'online', 8000, 'the engine to notice');
    for (let i = 0; i < 40 && !relay2; i++) { try { relay2 = await startRelay({ port }); } catch { await sleep(100); } }
    assert.ok(relay2, 'the relay is back');
    await until(() => t.engine.cloud.state === 'online', 15000, 'the engine to reconnect');
    assert.equal((await t.get('/api/health')).status, 200);
    t.relay = relay2;
  } finally { await relay2?.close(); await t.close().catch(() => {}); }
});

test('cloud: at most 8 browser sockets per room', async () => {
  const t = await rig();
  try {
    const socks = [];
    for (let i = 0; i < LIMITS.browserSockets; i++) {
      const s = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=${t.token}`, { headers: { cookie: t.cookie() } });
      socks.push(s);
      await until(() => s.msgs.find((m) => m.type === 'state'), 8000, `socket ${i}`);
    }
    const ninth = sock(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=${t.token}`, { headers: { cookie: t.cookie() } });
    await until(() => ninth.closed !== null, 8000, 'the 9th socket to be refused');
    assert.equal(ninth.status, 429);
    for (const s of socks) s.ws.close();
  } finally { await t.close(); }
});

// ---------------------------------------------------------------- the phone's Live over the relay (MEDIA-SERVER.md §7.3, F11)

/** A show of 60 clips (3 layers × 20 columns), each its own tiny HAP file copied into the library as the desktop does. */
async function sixtyClipShow(t) {
  const usb = path.join(t.dir, 'usb');
  fs.mkdirSync(usb, { recursive: true });
  for (const [k, layerId] of ['L1', 'L2', 'L3'].entries()) {
    const paths = Array.from({ length: 20 }, (_, i) => {
      const f = path.join(usb, `${layerId} scene ${String(i + 1).padStart(2, '0')} - immersive loop.mov`);
      fs.writeFileSync(f, makeHap({ frames: 2 + k * 20 + i }).bytes); // different bytes: 60 media, not one reused
      return f;
    });
    const r = await t.engine.command('media.import', { paths, target: { deckId: 'D1', layerId, column: 0 }, __local: true });
    assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected));
  }
  await until(() => [...t.engine.media.jobs.values()].every((j) => j.state === 'done'), 30000, 'the 60 copies');
  const show = t.engine.media.show;
  assert.equal(show.clips.length, 60);
  assert.equal(show.media.length, 60);
  return show;
}

test('cloud: the phone Live through the relay — a 160 px thumbnail arrives, cacheable for good; PCM is refused (403); the initial state of a 60-clip show weighs under 64 kB', async () => {
  // fails if: the thumbnail route stops passing the relay with the key (or loses its immutable cache: the phone would
  // fetch every picture again), the PCM route trusts tunnelled traffic (it arrives on loopback), or the state a phone
  // gets when it connects grows past 64 kB with a 60-clip show (too slow over a guest network and the relay)
  const t = await rig();
  try {
    const show = await sixtyClipShow(t);
    const m = show.media[0], clip = show.clips[0];
    const thumb = await t.get(`/api/media/thumb/${m.id}.png?s=160&v=${m.fingerprint}&k=${t.token}`);
    assert.equal(thumb.status, 200);
    assert.match(thumb.headers.get('content-type'), /image\/png/);
    assert.match(thumb.headers.get('cache-control') || '', /immutable/, 'cached by fingerprint for good');
    const png = new Uint8Array(await thumb.arrayBuffer());
    assert.deepEqual([...png.slice(1, 4)], [0x50, 0x4e, 0x47], 'a PNG');
    assert.ok(png.length < 64 * 1024, `a thumbnail is small (${png.length} B)`);
    assert.equal((await t.get(`/api/media/thumb/${m.id}.png?s=160&v=${m.fingerprint}`)).status, 401, 'not without the key');
    // raw PCM: never through the relay (it would be the clip's audio), even with the key; the desktop itself is not refused
    const pcm = `/api/media/pcm?clip=${clip.id}&from=0&n=256&k=${t.token}`;
    assert.equal((await t.get(pcm)).status, 403, 'no audio crosses the relay');
    assert.notEqual((await fetch(`http://127.0.0.1:${t.server.port}${pcm}`)).status, 403, 'the rule is the tunnel, not the route');
    // what a phone receives when it connects: the first state, measured as it travels (text frame)
    const ws = new WebSocket(`ws://127.0.0.1:${t.relay.port}/ws/ui?k=${t.token}&role=ui`, { headers: { cookie: t.cookie() } });
    const frames = [];
    ws.on('message', (d, bin) => { if (!bin) frames.push(d.toString()); });
    ws.on('error', () => {});
    const isState = (f) => { try { return JSON.parse(f).type === 'state'; } catch { return false; } };
    const first = await until(() => frames.find(isState), 8000, 'the state through the relay');
    const st = JSON.parse(first);
    assert.equal(st.show.clips.length, 60, 'the state carries the whole show');
    const kB = Buffer.byteLength(first) / 1024;
    assert.ok(kB < 64, `the initial state is ${kB.toFixed(1)} kB (limit 64 kB)`);
    // F13: it travels compact (engine/media/wire.js) — ~60 kB → ~36 kB here, right after the 60 copies — and conn.js
    // expands it to the very show the engine has. Fails without the compaction (the full one is ~59 kB) or if the
    // expansion differs from the engine's show
    assert.equal(st.compact, 1, 'compact through the relay');
    assert.ok(kB < 42, `the compact initial state is ${kB.toFixed(1)} kB (budget 42 kB)`);
    const back = expandState(st);
    assert.deepEqual(back.show.clips, show.clips, 'expanded, the clips are the engine\'s');
    // the media travel WITHOUT the detail the phone never reads (notes, size, codec details); what it reads is the engine's
    assert.deepEqual(back.show.media.map((x) => [x.id, x.file, x.fingerprint, x.kind, x.video.duration, x.video.width, x.video.fps]),
      t.engine.media.show.media.map((x) => [x.id, x.file, x.fingerprint, x.kind, x.video.duration, x.video.width, x.video.fps]));
    assert.ok(back.show.media.every((x) => x.notes.length === 0 && !('size' in x) && !('fourcc' in x.video)), 'no notes, no size, no codec details on the wire');
    assert.ok(!JSON.stringify(st.media.converter).includes('folder') && !JSON.stringify(st.media.converter).includes('licenseFile'), 'no paths of the computer on the relay');
    assert.ok(!(back.media.import || []).some((j) => j.state === 'done'), 'finished copies stay at home');
    // a device on the LAN (or this computer) still gets the full state
    const local = new WebSocket(`ws://127.0.0.1:${t.server.port}/ws/ui?k=${t.token}&role=ui`);
    const lf = [];
    local.on('message', (d, bin) => { if (!bin) lf.push(d.toString()); });
    local.on('error', () => {});
    const lst = JSON.parse(await until(() => lf.find(isState), 8000, 'the local state'));
    assert.equal(lst.compact, undefined, 'not compact on the LAN');
    assert.deepEqual(lst.show.clips, t.engine.media.show.clips);
    local.close();
    ws.close();
  } finally { await t.close(); }
});

test('cloud relay core: routing, framing and timeouts', async () => {
  assert.deepEqual(route('GET', '/r/abcde12345/js/app.js?k=1', ''), { type: 'enter', room: 'abcde12345', location: '/js/app.js?k=1' });
  assert.deepEqual(route('GET', '/r/abcde12345', ''), { type: 'enter', room: 'abcde12345', location: '/' });
  assert.equal(route('GET', '/ws/ui?k=a', 'a=1; vt_room=abcde12345').room, 'abcde12345');
  assert.equal(route('GET', '/', '').type, 'help');
  assert.equal(route('GET', '/_relay/link?room=../x', '').type, 'bad');
  assert.equal(route('GET', '/r/BAD!/x', '').type, 'bad');
  // a hub with no link answers 'offline'; a link that never answers times out with 504
  const hub = new RoomHub();
  assert.equal((await hub.proxyHttp({ method: 'GET', path: '/', headers: {} })).offline, true);
  const sent = [];
  hub.attachLink({ send: (m) => sent.push(JSON.parse(m)), close() {} });
  const realTimeout = LIMITS.timeoutMs;
  LIMITS.timeoutMs = 50;
  try {
    const res = await hub.proxyHttp({ method: 'GET', path: '/x', headers: { host: 'a', 'x-vt-tunnel': 'forged', cookie: 'c=1', 'cf-ray': '1' }, clientIp: '9.9.9.9' });
    assert.equal(res.status, 504);
  } finally { LIMITS.timeoutMs = realTimeout; }
  assert.equal(sent[0].t, 'req');
  assert.deepEqual(sent[0].headers, { cookie: 'c=1', 'x-vt-client-ip': '9.9.9.9' }, 'hop-by-hop, cf-* and forged x-vt-* headers are dropped');
  // oversized request bodies are refused before they are sent
  assert.equal((await hub.proxyHttp({ method: 'POST', path: '/', headers: {}, body: new Uint8Array(LIMITS.body + 1) })).status, 413);
});
