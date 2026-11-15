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
