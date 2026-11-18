// Engine-level behaviour: Show lock and profile versions (real Store on a temp folder).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };

test('engine: record raw scans, then replay them — the same hand appears from the file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-rec-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    await wait(300);
    await engine.command('sim.touch', { wallId: 'W1', x: 1.2, y: 1.1, id: 'h', down: true });
    await engine.command('rec.start', { name: 'unit' });
    await wait(1500);
    const { file } = await engine.command('rec.stop');
    await engine.command('sim.touch', { wallId: 'W1', x: 0, y: 0, id: 'h', down: false });
    const { recordings } = await engine.command('rec.list');
    assert.equal(recordings[0].file, file);
    assert.deepEqual(recordings[0].sensors, ['S1']);

    await wait(600); // the live hand is gone
    assert.equal(engine.lastFrame.roomCount, 0);
    await engine.command('replay.start', { file });
    let seen = null;
    for (let k = 0; k < 40 && !seen; k++) { await wait(100); seen = engine.lastFrame.walls[0].touches[0]; }
    assert.ok(seen, 'the recorded hand is replayed');
    assert.ok(Math.hypot(seen.x - 1.2, seen.y - 1.1) < 0.03, `replayed at ${seen.x.toFixed(3)}, ${seen.y.toFixed(3)}`);
    assert.equal(engine.status().sensors.S1.modeName, 'Replay');
    await assert.rejects(engine.command('replay.start', { file: '../escape.vtrec.gz' }), /invalid/);
    await engine.command('replay.stop');
    assert.equal(engine.replay, null);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: Show lock refuses edits; versions can be listed and restored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-engine-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  try {
    const id = engine.profile.id;
    const edit = (name) => engine.command('profile.update', { profile: { ...engine.profile, name }, rev: engine.rev });
    await edit('Room A');
    await new Promise((r) => setTimeout(r, 10)); // distinct backup timestamps
    await edit('Room B');

    await engine.command('app.lock', { locked: true });
    await assert.rejects(edit('Room C'), /locked/);
    await assert.rejects(engine.command('bg.clear', {}), /locked/);
    await engine.command('projection.set', { mode: 'debug' }); // operation still allowed
    assert.equal(engine.profile.name, 'Room B');
    await engine.command('app.lock', { locked: false });

    const { versions } = await engine.command('profile.versions', { id });
    assert.ok(versions.length >= 2, `versions: ${versions.length}`);
    const roomA = versions.find((v) => v.name === 'Room A');
    assert.ok(roomA, JSON.stringify(versions.map((v) => v.name)));
    await engine.command('profile.restore', { id, version: roomA.version });
    assert.equal(engine.profile.name, 'Room A');
    await assert.rejects(engine.command('profile.restore', { id, version: '../../evil.json' }), /invalid/);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('server: /api/health reports the profile, uptime and the engine memory (heap limit included)', async () => {
  const { createServer } = await import('../engine/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-health-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet });
  try {
    assert.ok(server.port > 0, 'bound to a real port');
    const h = await (await fetch(`http://127.0.0.1:${server.port}/api/health`)).json();
    assert.equal(h.ok, true);
    assert.equal(h.profile, engine.profile.id);
    assert.ok(Number.isInteger(h.uptimeS));
    for (const k of ['rssMb', 'heapUsedMb', 'heapLimitMb']) assert.ok(h.memory[k] > 0, `${k} = ${h.memory[k]}`);
    assert.ok(h.memory.heapUsedMb < h.memory.heapLimitMb);
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: sensor.levelCheck flags a simulated sensor whose plane leans into the wall', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-level-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setPlanes = async (planes) => {
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0; p.simulation.planes = planes;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    await wait(650); // the live check takes the median of the last 5 revolutions
  };
  try {
    const id = engine.profile.sensors[0].id;
    await setPlanes({ [id]: { gapMm: 20, tiltDeg: 0.6, towardsDeg: -45 } });
    await setPlanes({});
    await engine.command('bg.capture', { sensorId: id, frames: 5 });     // background of the well-levelled sensor
    await wait(800);
    const good = await engine.command('sensor.levelCheck', { id });
    assert.ok(good.ok, good.advice.join(' '));
    assert.equal(good.bgStale, false);
    // the bracket is knocked: the check must use live data, not the (now stale) background
    await setPlanes({ [id]: { gapMm: 20, tiltDeg: 0.6, towardsDeg: -45 } });
    const bad = await engine.command('sensor.levelCheck', { id });
    assert.equal(bad.ok, false);
    assert.equal(bad.source, 'live');
    assert.match(bad.grazingRegion.where, /right/);
    assert.equal(bad.bgStale, true);
    assert.match(bad.advice.at(-1), /capture the background again/);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: one device drives a calibration; the others are view-only until they take control', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-ctl-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const A = { id: 'dA', device: 'iPad (10.0.0.5)' }, B = { id: 'dB', device: 'the desktop' };
  try {
    await engine.command('calib.start', { wallId: 'W1', force: true, __client: A });
    assert.equal(engine.status().control.id, 'dA');
    await assert.rejects(engine.command('calib.skip', { __client: B }), /in progress on iPad/);
    await assert.rejects(engine.command('profile.update', { profile: engine.profile, rev: engine.rev, __client: B }), /in progress on iPad/);
    await engine.command('calib.skip', { __client: A }); // the driver may
    await engine.command('sim.touch', { wallId: 'W1', x: 1, y: 1, id: 'h', down: false, __client: B }); // not a control command
    await engine.command('control.take', { __client: B });
    await assert.rejects(engine.command('calib.back', { __client: A }), /in progress on the desktop/);
    engine.clientGone('dB'); // the driver left: whoever acts next takes over
    await engine.command('calib.back', { __client: A });
    assert.equal(engine.status().control.id, 'dA');
    await engine.command('calib.cancel', { __client: A });
    assert.equal(engine.status().control, null, 'released with the session');
    await engine.command('profile.update', { profile: { ...engine.profile, name: 'Free again' }, rev: engine.rev, __client: B });
    await assert.rejects(engine.command('control.take', { __client: B }), /no calibration/);
    // no device (tests, the engine itself) = never restricted
    await engine.command('calib.start', { wallId: 'W1', force: true });
    await engine.command('calib.skip', { __client: B });
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('server: control goes with the WebSocket client; closing it frees the session', async () => {
  const { createServer } = await import('../engine/server.js');
  const { WebSocket } = await import('ws');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-ctlws-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet });
  const open = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
    const c = { ws, you: null, n: 0, acks: new Map() };
    ws.on('message', (raw, bin) => {
      if (bin) return;
      const m = JSON.parse(raw);
      if (m.type === 'state' && m.you) { c.you = m.you; resolve(c); }
      if (m.type === 'ack') c.acks.get(m.id)?.(m);
    });
    ws.on('error', reject);
  });
  const cmd = (c, op, args = {}) => new Promise((resolve) => { const id = ++c.n; c.acks.set(id, resolve); c.ws.send(JSON.stringify({ type: 'cmd', id, op, args })); });
  try {
    const a = await open(), b = await open();
    assert.ok(a.you && b.you && a.you !== b.you, 'each device has its own id');
    assert.equal((await cmd(a, 'calib.start', { wallId: 'W1', force: true })).ok, true);
    const refused = await cmd(b, 'calib.skip');
    assert.equal(refused.ok, false);
    assert.match(refused.error, /calibration in progress on the desktop/);
    // a client cannot pretend to be the driver
    assert.equal((await cmd(b, 'calib.skip', { __client: { id: a.you } })).ok, false);
    a.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(engine.status().control.gone, true);
    assert.equal((await cmd(b, 'calib.skip')).ok, true, 'the driver left: B continues');
    assert.equal(engine.status().control.id, b.you);
    b.ws.close();
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mdns: wire format round trip, compression pointers, interface choice', async () => {
  const { buildQuery, buildResponse, parseMessage, readName, MdnsResponder } = await import('../engine/mdns.js');
  const q = parseMessage(buildQuery('veation-touch.local', { id: 7, unicast: true }));
  assert.deepEqual(q.questions, [{ name: 'veation-touch.local', type: 1, unicast: true }]);
  const r = parseMessage(buildResponse('veation-touch.local', ['192.168.1.10', '10.0.0.5']));
  assert.equal(r.response, true);
  assert.deepEqual(r.answers.map((a) => [a.name, a.ip, a.ttl]), [['veation-touch.local', '192.168.1.10', 120], ['veation-touch.local', '10.0.0.5', 120]]);
  // "local" stored once, then a pointer to it (offset 12 + 1 + 1 = 14 is where "local" starts)
  const buf = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 97, 5, 108, 111, 99, 97, 108, 0, 1, 98, 0xc0, 14]);
  assert.deepEqual(readName(buf, 21), ['b.local', 25]);
  assert.throws(() => readName(Buffer.from([0xc0, 0]), 0), /bad pointer|truncated/); // a pointer loop is refused
  const m = new MdnsResponder({ name: 'Room-A', log: quiet, interfaces: () => [{ ip: '192.168.1.10', mask: '255.255.255.0' }, { ip: '10.0.0.5', mask: '255.0.0.0' }] });
  assert.equal(m.host, 'room-a.local');
  assert.deepEqual(m.addressesFor('192.168.1.77'), ['192.168.1.10'], 'the address on the querier subnet');
  assert.deepEqual(m.addressesFor('10.9.9.9'), ['10.0.0.5']);
  assert.deepEqual(m.addressesFor('172.16.0.2'), ['192.168.1.10', '10.0.0.5'], 'unknown subnet: every address');
  assert.throws(() => m.setName('bad.name'), /letters, digits/);
});

test('mdns: a plain DNS client asking <name>.local gets an answer echoing its id (legacy unicast)', async () => {
  const dgram = await import('node:dgram');
  const { buildQuery, parseMessage, buildResponse, MdnsResponder } = await import('../engine/mdns.js');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const warns = [];
  const log = { ...quiet, warn: (s) => warns.push(s) };
  const m = new MdnsResponder({ name: 'veation-touch', log, port, interfaces: () => [{ ip: '192.168.1.10', mask: '255.255.255.0' }] });
  assert.equal(await m.start(), true);
  const sock = dgram.createSocket('udp4');
  await new Promise((r) => sock.bind(0, '127.0.0.1', r));
  const ask = (name) => new Promise((resolve) => {
    const t = setTimeout(() => { sock.removeAllListeners('message'); resolve(null); }, 400);
    sock.once('message', (b) => { clearTimeout(t); resolve(parseMessage(b)); });
    sock.send(buildQuery(name, { id: 4242 }), port, '127.0.0.1');
  });
  try {
    const a = await ask('VEATION-touch.local');
    assert.ok(a, 'answered');
    assert.equal(a.id, 4242);
    assert.equal(a.questions[0].name, 'veation-touch.local');
    assert.deepEqual(a.answers.map((x) => [x.ip, x.ttl]), [['192.168.1.10', 10]], 'legacy answers: TTL ≤ 10 s');
    assert.equal(await ask('other.local'), null, 'other names are not ours');
    // another host claims the name: reported once, not fought over
    sock.send(buildResponse('veation-touch.local', ['192.168.1.99']), port, '127.0.0.1');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(m.info().conflict, '192.168.1.99');
    assert.equal(warns.filter((w) => /also answers/.test(w)).length, 1);
  } finally {
    sock.close();
    await m.stop();
  }
});

test('server: pairing links rank this PC hotspot first and the LiDAR network last', async () => {
  const { lanUrls } = await import('../engine/server.js');
  const v4 = (address, netmask = '255.255.255.0') => ({ family: 'IPv4', internal: false, address, netmask });
  const list = lanUrls(8770, 'k', ['192.168.11.11'], {
    Ethernet: [v4('192.168.11.5')],                       // same subnet as a sensor
    'Wi-Fi': [v4('172.16.2.42')],
    'Local Area Connection* 10': [v4('192.168.137.1')],    // Windows Mobile hotspot
    'vEthernet (WSL)': [v4('172.30.0.1')],                 // virtual: left out
    Ethernet2: [v4('169.254.3.3', '255.255.0.0')],         // link-local: left out
  });
  assert.deepEqual(list.map((l) => [l.kind, l.ip, l.sensors]), [['hotspot', '192.168.137.1', false], ['wifi', '172.16.2.42', false], ['ethernet', '192.168.11.5', true]]);
  assert.equal(list[0].url, 'http://192.168.137.1:8770/?k=k');
});

test('mdns: responses about other names never look at the network interfaces', async () => {
  const { MdnsResponder, buildResponse } = await import('../engine/mdns.js');
  let calls = 0;
  const m = new MdnsResponder({ name: 'veation-touch', log: quiet, interfaces: () => { calls++; return [{ ip: '192.168.1.10', mask: '255.255.255.0' }]; } });
  for (let k = 0; k < 50; k++) m._onMessage(buildResponse(`quest-${k}.local`, ['192.168.1.50']), { address: '192.168.1.50', port: 5353 });
  assert.equal(calls, 0, 'busy LAN: no adapter enumeration per packet');
  m._onMessage(buildResponse('veation-touch.local', ['192.168.1.99']), { address: '192.168.1.99', port: 5353 });
  assert.equal(m.info().conflict, '192.168.1.99');
});

test('sdk: toCanvas follows a grid mapping (the same maths as the engine)', async () => {
  const { createServer } = await import('../engine/server.js');
  const { gridFrom, gridMap } = await import('../engine/core/geometry.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-sdk-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet });
  let vt = null;
  try {
    // the SDK as an app loads it: /sdk/veation-touch.js next to /shared/geometry.js
    const base = `http://127.0.0.1:${server.port}`;
    for (const f of ['sdk/veation-touch.js', 'shared/geometry.js']) {
      fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), await (await fetch(`${base}/${f}`)).text());
    }
    const { pathToFileURL } = await import('node:url');
    const { VeationTouch } = await import(pathToFileURL(path.join(dir, 'sdk', 'veation-touch.js')).href);
    vt = new VeationTouch(`ws://127.0.0.1:${server.port}/ws/data`);
    const grid = gridFrom((u, v) => [100 + 800 * u + 40 * Math.sin(u * 3) * v, 50 + 400 * v + 30 * u * u], 4, 3);
    vt.profile = { walls: [{ id: 'W', pixelRect: { x: 0, y: 0, w: 10, h: 10 }, mapping: { mode: 'grid', ...grid } }] };
    for (const [u, v] of [[0.2, 0.3], [0.77, 0.9], [0.5, 0.5]]) {
      const [x, y] = vt.toCanvas('W', u, v), [ex, ey] = gridMap(grid, u, v);
      assert.ok(Math.hypot(x - ex, y - ey) < 1e-9, `(${u}, ${v}) → ${x}, ${y} vs ${ex}, ${ey}`);
    }
  } finally {
    vt?.close(); // it reconnects forever otherwise
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('server: the UI live feed carries every event, also those of frames between two live messages', async () => {
  const { createServer } = await import('../engine/server.js');
  const { WebSocket } = await import('ws');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-feed-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
  const ids = new Set();
  ws.on('message', (raw, bin) => { if (bin) return; const m = JSON.parse(raw); if (m.type === 'live') for (const e of m.events || []) ids.add(e.id); });
  try {
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 200));
    const frame = (id) => ({ seq: 0, t: performance.now(), walls: [], roomCount: 0, burst: 0, zoneCounts: {}, zoneEvents: [],
      events: [{ type: 'down', id, wallId: 'W1', x: 1, y: 1, t: 0 }] });
    // two frames back to back: one of them falls between two live messages (they go out every other frame)
    engine.emit('frame', frame(9001)); engine.emit('frame', frame(9002));
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(ids.has(9001) && ids.has(9002), `events seen: ${[...ids].join(', ')}`);
  } finally {
    ws.close();
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discover: knows whether this computer can reach a factory-new S2E (192.168.11.2)', async () => {
  const { factoryNetwork } = await import('../engine/discover.js');
  const off = factoryNetwork([{ name: 'Ethernet', ip: '172.17.1.51', mask: '255.255.0.0' }, { name: 'Wi-Fi', ip: '192.168.1.20', mask: '255.255.255.0' }]);
  assert.equal(off.reachable, false);
  assert.equal(off.have, '172.17.1.51 (Ethernet), 192.168.1.20 (Wi-Fi)');
  const on = factoryNetwork([{ name: 'LiDAR', ip: '192.168.11.10', mask: '255.255.255.0' }]);
  assert.equal(on.reachable, true);
  assert.equal(on.via.name, 'LiDAR');
});

test('server: /api/pair-check tells a paired device from one without the key (and never leaks it)', async () => {
  const { createServer } = await import('../engine/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-pair-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet, trustLocal: false });
  try {
    const get = async (q = '') => (await fetch(`http://127.0.0.1:${server.port}/api/pair-check${q}`)).text();
    assert.deepEqual(JSON.parse(await get()), { paired: false });
    assert.deepEqual(JSON.parse(await get('?k=wrong')), { paired: false });
    const ok = await get(`?k=${engine.settings.token}`);
    assert.deepEqual(JSON.parse(ok), { paired: true });
    assert.ok(!(await get()).includes(engine.settings.token));
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: simulated wandering hands leave the wall being calibrated or verified, and come back after', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-wander-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const count = () => engine.sensors.get('S1').driver.world.wanderers.length;
  try {
    const p = structuredClone(engine.profile); p.simulation.wanderers = 3;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    assert.equal(count(), 3);
    await engine.command('calib.start', { wallId: 'W1', force: true });
    assert.equal(count(), 0, 'none while calibrating W1');
    await engine.command('calib.cancel');
    assert.equal(count(), 3);
    await engine.command('verify.start', { wallId: 'W1' });
    assert.equal(count(), 0, 'none while verifying W1');
    await engine.command('verify.cancel');
    assert.equal(count(), 3);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: Fit — the projection is told which mesh point to highlight; the wandering hands leave that wall; it ends with its device', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-fit-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const count = () => engine.sensors.get('S1').driver.world.wanderers.length;
  try {
    const p = structuredClone(engine.profile); p.simulation.wanderers = 2;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    assert.equal(engine.state().projection.fit, null);
    await engine.command('projection.set', { fit: { wallId: 'W1', node: 4 }, __client: { id: 7, device: 'phone' } });
    assert.deepEqual(engine.state().projection.fit, { wallId: 'W1', node: 4 });
    assert.equal(count(), 0, 'no simulated hands on the wall being fitted');
    assert.equal(store.loadSettings?.().projection?.fit, undefined, 'never saved');
    await engine.command('projection.set', { fit: { wallId: 'nope', node: 1 } });
    assert.equal(engine.state().projection.fit, null, 'unknown wall');
    await engine.command('projection.set', { fit: { wallId: 'W1', node: 2 }, __client: { id: 7, device: 'phone' } });
    engine.clientGone(8);
    assert.ok(engine.state().projection.fit, 'another device leaving changes nothing');
    engine.clientGone(7);
    assert.equal(engine.state().projection.fit, null, 'the phone that was fitting went away');
    assert.equal(count(), 2, 'the hands come back');
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: a Texture output sent full screen asks the desktop app for a window on its display — only while enabled', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-texwin-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  const seen = [];
  engine.on('textureWindows', (list) => seen.push(list));
  engine.start();
  const edit = async (fn) => { const p = structuredClone(engine.profile); fn(p); await engine.command('profile.update', { profile: p, rev: engine.rev }); };
  try {
    await edit((p) => { p.outputs.push({ id: 'TX', type: 'texture', sink: 'window', enabled: true }); });
    assert.deepEqual(engine.textureWindows(), [], 'no display chosen yet: no window');
    await edit((p) => { p.outputs.find((o) => o.id === 'TX').displayId = 7; });
    assert.deepEqual(seen.at(-1), [{ id: 'TX', displayId: 7 }]);
    await edit((p) => { p.outputs.find((o) => o.id === 'TX').enabled = false; });
    assert.deepEqual(seen.at(-1), [], 'off: the window closes');
    await edit((p) => { const o = p.outputs.find((x) => x.id === 'TX'); o.enabled = true; o.sink = 'ndi'; });
    assert.deepEqual(engine.textureWindows(), [], 'another destination: no window');
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: a new sensor gets its address from the app — confirmed, put on its wall, and streaming', async () => {
  const { S2EEmulator } = await import('../engine/sim/s2e-emulator.js');
  const { SimWall } = await import('../engine/sim/world.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-readdr-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const wallDef = engine.profile.walls[0];
  const emu = new S2EEmulator(new SimWall({ width: wallDef.width, height: wallDef.height }, { x: wallDef.width / 2, y: wallDef.height + 0.3, rotation: -90 }, { seed: 2 }),
    { host: '127.0.0.7', rebind: true, rebootMs: 200, serial: 'DD'.repeat(16) });
  const port = await emu.start();
  try {
    await assert.rejects(engine.command('sensor.readdress', { host: '127.0.0.7', port, ip: '10.99.99.11', assign: { wallId: wallDef.id } }),
      /no address on the network of 10\.99\.99\.11/, 'an address this computer could not reach afterwards is refused before anything is sent');
    assert.equal(emu.host, '127.0.0.7');
    const r = await engine.command('sensor.readdress', { host: '127.0.0.7', port, ip: '127.0.0.8', assign: { wallId: wallDef.id }, waitMs: 4000 });
    assert.equal(r.serial, 'DD'.repeat(16));
    const s = engine.profile.sensors.find((x) => x.id === r.sensorId);
    assert.deepEqual([s.driver, s.host, s.port, s.wallId], ['s2e', '127.0.0.8', port, wallDef.id], 'the profile follows the unit');
    let state = null;
    for (let k = 0; k < 40 && state !== 'scanning'; k++) { await new Promise((q) => setTimeout(q, 100)); state = engine.status().sensors[s.id]?.state; }
    assert.equal(state, 'scanning', 'and it streams from its new address');
    await engine.command('app.lock', { locked: true });
    await assert.rejects(engine.command('sensor.readdress', { host: '127.0.0.8', port, ip: '127.0.0.9' }), /locked/);
  } finally {
    emu.stop();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('net: the Wi-Fi name of each card is read from netsh (localised labels) and guest networks are recognised', async () => {
  const { parseWlanInterfaces, looksLikeGuestNetwork } = await import('../engine/net.js');
  const es = 'Hay 1 interfaz en el sistema:\r\n\r\n    Nombre                 : Wi-Fi\r\n    Descripción            : Intel(R) Wi-Fi 6E\r\n    Estado                 : conectado\r\n    SSID                   : BCN_XRLab_Guest\r\n    AP BSSID               : e2:5d:54:9f:24:c9\r\n\r\n';
  assert.deepEqual(parseWlanInterfaces(es), { 'Wi-Fi': 'BCN_XRLab_Guest' }, 'SSID, not AP BSSID');
  assert.deepEqual(parseWlanInterfaces('There is 1 interface on the system:\n\n    Name                   : Wi-Fi 2\n    State                  : disconnected\n'), {}, 'not connected: no network');
  assert.equal(looksLikeGuestNetwork('BCN_XRLab_Guest'), true);
  assert.equal(looksLikeGuestNetwork('XRLab-Install'), false);
});

test('engine: the last verification stays with its wall — and is dropped when the mapping or the calibration changes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-verif-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    const wallId = engine.profile.walls[0].id;
    await wait(400);
    await engine.command('verify.start', { wallId });
    for (const tg of engine.verify.targets.slice()) {
      await engine.command('sim.touch', { wallId, x: tg.x + 0.004, y: tg.y, id: 'h', down: true });
      await wait(900);
      await engine.command('sim.touch', { wallId, x: 0, y: 0, id: 'h', down: false });
      await wait(600);
    }
    for (let k = 0; k < 20 && !engine.profile.walls[0].verified; k++) await wait(50);
    const v = engine.profile.walls[0].verified;
    assert.ok(v, 'saved when the last check point is measured');
    assert.equal(v.n, 5);
    assert.equal(v.pass, true, `worst ${v.maxMm} mm`);
    assert.ok(v.worst && Number.isFinite(v.worst.x), 'with where the worst point was (the remote fits there)');
    // an unrelated edit keeps it
    const q = structuredClone(engine.profile); q.name = 'Renamed';
    await engine.command('profile.update', { profile: q, rev: engine.rev });
    assert.ok(engine.profile.walls[0].verified, 'renaming the room does not undo a verification');
    // moving the wall in the content invalidates it
    const m = structuredClone(engine.profile); m.walls[0].pixelRect.x += 20;
    await engine.command('profile.update', { profile: m, rev: engine.rev });
    assert.equal(engine.profile.walls[0].verified, null, 'the mapping changed: verify again');
  } finally {
    await engine.command('verify.cancel').catch(() => {});
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('server: a device that opened the page is reported even when it never connects (and this computer is not)', async () => {
  const lanIp = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address;
  if (!lanIp) return; // no network card: nothing to reach this computer through
  const { createServer } = await import('../engine/server.js');
  const { default: WebSocket } = await import('ws');
  const http = await import('node:http');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-reached-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: quiet });
  const get = (host) => new Promise((resolve, reject) => http.get(`http://${host}:${server.port}/`, (res) => { res.resume(); res.on('end', resolve); }).on('error', reject));
  try {
    await get('127.0.0.1');     // the desktop window: not a device
    await get(lanIp);           // as a phone on the LAN would (another address than loopback)
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
    const reached = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no status with reached')), 5000);
      ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.reached) { clearTimeout(t); resolve(m.reached); } });
    });
    ws.close();
    assert.deepEqual(reached.map((r) => r.addr), [lanIp], 'the page load from the LAN address, not the local one');
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: simulated wandering hands leave the walls while their background is captured, and come back after', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-bgwander-'));
  const store = new Store(dir, path.resolve(import.meta.dirname, '..', 'profiles'), quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  const warnings = [];
  engine.log = { ...quiet, warn: (m) => warnings.push(m) };
  engine.start();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const count = () => [...engine.sensors.values()].reduce((n, rt) => n + (rt.driver.world?.wanderers?.length || 0), 0);
  try {
    assert.ok(engine.profile.simulation.wanderers > 0, 'the simulated room has wandering hands');
    await wait(800);
    const before = count();
    assert.ok(before > 0);
    await engine.command('bg.capture', { frames: 10 });
    assert.equal(count(), 0, 'the room is empty while it is learned');
    for (let k = 0; k < 40 && engine.bgJobs.size; k++) await wait(100);
    assert.equal(engine.bgJobs.size, 0);
    assert.deepEqual(warnings.filter((w) => /movement during the capture/.test(w)), [], 'no "something moved" warning in an empty simulated room');
    assert.equal(count(), before, 'the hands come back');
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('server: page errors from devices go to the log — one clean line each, a limited number per device', async () => {
  const { createServer } = await import('../engine/server.js');
  const http = await import('node:http');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-clienterr-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const lines = [];
  const server = await createServer(engine, { port: 0, root: path.resolve(import.meta.dirname, '..'), log: { ...quiet, warn: (m) => lines.push(m) } });
  const post = (body) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: server.port, path: '/api/client-error', method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end(body);
  });
  try {
    assert.equal(await post(JSON.stringify({ message: 'boom\nINFO  fake line', where: '/js/conn.js:30:3', page: '/', started: false })), 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(lines, ['page error on this computer, / — the page did not start: boom INFO  fake line at /js/conn.js:30:3'], 'one line: a message cannot forge log lines');
    for (let k = 0; k < 30; k++) await post(JSON.stringify({ message: `again ${k}`, page: '/', started: true }));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(lines.length, 20, 'at most 20 per device every 10 minutes');
  } finally {
    server.close();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('engine: a wall whose scan plane stands 12 cm out passes verification with the larger error it reads', async () => {
  const { verifyPassMm } = await import('../engine/core/geometry.js');
  assert.equal(verifyPassMm({ planeOffset: 0.02 }), 25, 'the usual 2–3 cm plane: a hand radius');
  assert.equal(verifyPassMm({ planeOffset: 0.03 }), 25);
  assert.equal(verifyPassMm({ planeOffset: 0.12 }), 70, 'in front of a light bar: half the extra distance on top');
  assert.equal(verifyPassMm({}), 25);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-plane-'));
  const store = new Store(dir, null, quiet);
  const engine = new Engine({ store, log: quiet, version: 'test' });
  engine.start();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const p = structuredClone(engine.profile);
    p.simulation.wanderers = 0;
    p.walls[0].planeOffset = 0.12;
    await engine.command('profile.update', { profile: p, rev: engine.rev });
    const wallId = engine.profile.walls[0].id;
    await wait(400);
    await engine.command('verify.start', { wallId });
    for (const tg of engine.verify.targets.slice()) { // every reading 5 cm off, as an arm crossing the plane at an angle
      await engine.command('sim.touch', { wallId, x: tg.x + 0.05, y: tg.y, id: 'h', down: true });
      await wait(900);
      await engine.command('sim.touch', { wallId, x: 0, y: 0, id: 'h', down: false });
      await wait(600);
    }
    for (let k = 0; k < 20 && !engine.profile.walls[0].verified; k++) await wait(50);
    const v = engine.profile.walls[0].verified;
    assert.ok(v.maxMm > 25 && v.maxMm < 70, `worst ${v.maxMm} mm`);
    assert.equal(v.passMm, 70);
    assert.equal(v.pass, true, 'it would fail the 25 mm of a wall touched at 2 cm');
  } finally {
    await engine.command('verify.cancel').catch(() => {});
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
