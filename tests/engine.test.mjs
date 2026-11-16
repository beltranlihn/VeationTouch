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
