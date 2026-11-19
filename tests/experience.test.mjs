// Experiences (engine + server): the catalog, play / stop and the window message for the desktop app, autostart,
// parameters, the preview, and the static serving of experience folders. The page side is in tests/ui.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FIX = path.join(root, 'tests', 'fixtures', 'experiences');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A test engine on a temp folder (bundled profiles → the simulated XR Lab room) that also lists `dirs`. */
function setup(dirs = [FIX], { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-exp-')), fresh = true } = {}) {
  const store = new Store(dir, path.join(root, 'profiles'), quiet);
  if (fresh) { // the bundled rooms may come with an experience chosen: start these tests from none
    const sim = store.listProfiles().find((q) => q.id.endsWith('-sim')).id, prof = store.loadProfile(sim);
    prof.experience = normalizeProfile({}).experience;
    prof.output = normalizeProfile({}).output;
    store.saveProfile(prof);
  }
  const engine = new Engine({ store, log: quiet, version: 'test', experienceDirs: dirs });
  const msgs = [];
  engine.on('outputWindow', (m) => msgs.push(m));
  return { dir, store, engine, msgs };
}

/** A raw HTTP request (no client-side URL clean-up, so odd paths reach the server as written). */
function raw(port, p, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('experiences: the catalog lists manifest folders, normalises them and skips what is unusable', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-expcat-'));
  const put = (folder, manifest) => { fs.mkdirSync(path.join(tmp, folder), { recursive: true }); fs.writeFileSync(path.join(tmp, folder, 'manifest.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest)); };
  put('good', { id: 'good', name: 'Good', entry: '../../etc/passwd', params: [
    { key: 'n', type: 'number', min: 0, max: 10, step: 1, default: 99 },     // default clamped into the range
    { key: 'bad key!', type: 'number' },                                       // unusable key
    { key: 'w', type: 'weird' },                                               // unknown type
    { key: 's', type: 'select', options: [] },                                 // a select needs options
    { key: 'n', type: 'bool' },                                                // duplicate key
    { key: 'b', type: 'bool', default: true }] });
  put('broken', '{ not json');
  put('no id', { name: 'x' });
  put('good-copy', { id: 'good', name: 'Duplicate id' });
  const { engine, dir } = setup([tmp]);
  engine.start();
  try {
    const mine = engine.catalog.filter((e) => e.dir.startsWith(tmp)); // (the app's own experiences/ is listed too)
    const ids = mine.map((e) => e.id);
    assert.ok(!ids.includes('touch-probe'), 'only the folders given are scanned');
    assert.deepEqual(ids, ['good'], 'one usable entry: broken JSON, a folder name that is not an id, and a repeated id are skipped');
    const g = mine[0];
    assert.equal(g.entry, 'index.html', 'an entry that climbs out of the folder falls back to index.html');
    assert.deepEqual(g.params.map((p) => [p.key, p.type]), [['n', 'number'], ['b', 'bool']]);
    assert.equal(g.params[0].default, 10);
    const pub = engine.state().experiences;
    assert.ok(pub.some((e) => e.id === 'good'));
    assert.ok(pub.every((e) => !('dir' in e)), 'no disk path reaches a client');
    assert.equal(JSON.stringify(engine.state()).includes(tmp.replace(/\\/g, '\\\\')), false);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('experiences: the fixture is in the catalog with its manifest', async () => {
  const { engine, dir } = setup();
  engine.start();
  try {
    const e = engine.state().experiences.find((x) => x.id === 'touch-probe');
    assert.ok(e, 'touch-probe listed');
    assert.deepEqual(e.params.map((p) => p.type), ['number', 'select', 'bool', 'wall']);
    const r = await engine.command('experience.list');
    assert.ok(r.experiences.some((x) => x.id === 'touch-probe'));
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('experiences: play and stop drive the experience layer of the room output; the window message is the output\'s (and nothing is sent when nothing changes)', async () => {
  const { engine, dir, msgs } = setup();
  engine.start();
  try {
    assert.equal(engine.state().experience.running, false);
    assert.equal(engine.state().output.running, false);
    await assert.rejects(engine.command('experience.play', { id: 'nope' }), /unknown experience/);
    assert.equal(msgs.length, 0);

    await engine.command('experience.play', { id: 'touch-probe' });
    const c = engine.profile.canvas; // the render size travels too: the Spout window paints at it, 1:1, on the GPU
    assert.deepEqual(msgs.at(-1), { url: '/output?run=1', sink: 'spout', displayId: null, fit: 'fit', scale: 0.5, fps: 60, senderName: 'VEATION Touch',
      width: Math.round(c.width * 0.5), height: Math.round(c.height * 0.5) });
    const st = engine.state().experience;
    assert.equal(st.running, true);
    assert.equal(st.url, '/experiences/touch-probe/index.html?run=1');
    assert.equal(engine.state().output.running, true, 'playing switches the output on: an experience that goes nowhere is no use');
    assert.equal(engine.state().profile.output.layers.find((l) => l.id === 'experience').on, true);
    assert.equal(engine.state().profile.experience.id, 'touch-probe', 'the choice is in the profile');

    const n = msgs.length;
    await engine.command('experience.play', { id: 'touch-probe' }); // already running: same window
    assert.equal(msgs.length, n);

    // where it goes: a change that matters sends a new message
    await engine.command('output.set', { sink: 'window', displayId: 3, fit: 'stretch', scale: 0.25, fps: 30, senderName: 'Wall A' });
    assert.deepEqual(msgs.at(-1), { url: '/output?run=1', sink: 'window', displayId: 3, fit: 'stretch', scale: 0.25, fps: 30, senderName: 'Wall A',
      width: Math.round(c.width * 0.25), height: Math.round(c.height * 0.25) });

    // Stop takes the experience off the output; the output itself stays (its other layers keep showing)
    const before = msgs.length;
    await engine.command('experience.stop');
    assert.equal(msgs.length, before, 'the window stays');
    assert.equal(engine.state().experience.running, false);
    assert.equal(engine.state().experience.url, null);
    assert.equal(engine.state().output.running, true);
    assert.equal(engine.state().profile.output.layers.find((l) => l.id === 'experience').on, false);
    assert.equal(engine.state().profile.experience.id, 'touch-probe', 'stopping keeps the choice');
    assert.notEqual(engine.outputWindow(), null);

    await engine.command('output.set', { on: false });
    assert.equal(msgs.at(-1), null, 'the output off: the window closes');
    assert.equal(engine.outputWindow(), null);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('experiences: output.set validates; experience.set only keeps autostart; a running page reports its fps and error', async () => {
  const { engine, dir } = setup();
  engine.start();
  try {
    await assert.rejects(engine.command('output.set', { scale: 0.3 }), /scale/);
    await assert.rejects(engine.command('output.set', { fps: 144 }), /fps/);
    await assert.rejects(engine.command('output.set', { sink: 'ndi' }), /sink/);
    await assert.rejects(engine.command('output.set', { fit: 'zoom' }), /fit/);
    await assert.rejects(engine.command('output.set', { senderName: '***' }), /sender name/);
    await assert.rejects(engine.command('output.set', { displayId: 'x' }), /displayId/);
    assert.equal(engine.profile.output.scale, 0.5, 'a refused set changes nothing');
    await engine.command('output.set', { senderName: 'My <Wall>' });
    assert.equal(engine.profile.output.senderName, 'My Wall', 'the name is cleaned like a Texture sender name');
    await assert.rejects(engine.command('experience.set', { scale: 1 }), /output\.set/, 'where it goes is the output\'s now');
    await engine.command('experience.set', { autostart: true });
    assert.equal(engine.profile.experience.autostart, true);

    await engine.command('experience.report', { fps: 59.4, error: 'x' }); // not running: ignored
    assert.equal(engine.state().experience.fps, 0);
    await engine.command('experience.play', { id: 'touch-probe' });
    await engine.command('experience.report', { fps: 58.26, error: 'WebGL context lost' });
    assert.equal(engine.state().experience.fps, 58.3);
    assert.equal(engine.state().experience.error, 'WebGL context lost');
    await engine.command('experience.report', { fps: 60, error: null });
    assert.equal(engine.state().experience.error, null);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('experiences: autostart runs the saved experience when the engine starts (and only then)', async () => {
  const a = setup();
  a.engine.start();
  await a.engine.command('experience.set', { autostart: true });
  await a.engine.command('output.set', { sink: 'window', displayId: 7 });
  await a.engine.command('experience.play', { id: 'touch-probe' });
  await a.engine.stop(); // writes the profile
  try {
    const b = setup([FIX], { dir: a.dir, fresh: false });
    b.engine.start();
    assert.equal(b.engine.state().experience.running, true, 'it runs without anyone pressing Play');
    assert.equal(b.msgs.length, 1);
    assert.equal(b.msgs[0].url, '/output?run=1');
    assert.equal(b.msgs[0].sink, 'window');
    assert.equal(b.msgs[0].displayId, 7);
    await b.engine.command('experience.set', { autostart: false });
    await b.engine.command('experience.stop');
    await b.engine.command('output.set', { on: false });
    await b.engine.stop();

    const c = setup([FIX], { dir: a.dir, fresh: false });
    c.engine.start();
    assert.equal(c.engine.state().experience.running, false, 'autostart off: the choice is remembered, nothing runs');
    assert.equal(c.engine.state().experience.id, 'touch-probe');
    assert.equal(c.engine.state().output.running, false, 'the output was left off');
    assert.equal(c.msgs.length, 0);
    await c.engine.stop();

    // autostart on an experience that is gone does not run (and does not crash)
    const d = setup([], { dir: a.dir, fresh: false });
    const prof = d.store.loadProfile(d.engine.settings.activeProfile);
    prof.experience.autostart = true;
    prof.output.on = false;
    d.store.saveProfile(prof);
    d.engine.start();
    assert.equal(d.engine.state().experience.running, false);
    assert.equal(d.engine.state().output.running, false, 'nothing to play: the output is not switched on either');
    await d.engine.stop();
  } finally { fs.rmSync(a.dir, { recursive: true, force: true }); }
});

test('experiences: parameters are checked against the manifest, saved in the profile and live (no new window)', async () => {
  const { engine, dir, store, msgs } = setup();
  let stopped = false;
  engine.start();
  try {
    await assert.rejects(engine.command('experience.param', { key: 'gain', value: 1 }), /no experience selected/);
    await engine.command('experience.play', { id: 'touch-probe' });
    const windows = msgs.length;
    let states = 0;
    engine.on('state', () => states++);

    assert.equal((await engine.command('experience.param', { key: 'gain', value: 1.5 })).value, 1.5);
    assert.equal((await engine.command('experience.param', { key: 'gain', value: 9 })).value, 2, 'a number is clamped into its range');
    assert.equal((await engine.command('experience.param', { key: 'gain', value: '0.25' })).value, 0.25);
    await assert.rejects(engine.command('experience.param', { key: 'gain', value: 'loud' }), /needs a number/);
    await assert.rejects(engine.command('experience.param', { key: 'nope', value: 1 }), /no parameter/);
    await engine.command('experience.param', { key: 'mode', value: 'hard' });
    await assert.rejects(engine.command('experience.param', { key: 'mode', value: 'medium' }), /one of/);
    await engine.command('experience.param', { key: 'trails', value: true });
    await assert.rejects(engine.command('experience.param', { key: 'trails', value: 'yes' }), /true or false/);
    const wall = engine.profile.walls[0].id;
    await engine.command('experience.param', { key: 'focus', value: wall });
    await assert.rejects(engine.command('experience.param', { key: 'focus', value: 'ghost' }), /wall of this room/);

    assert.equal(states, 6, 'every accepted change is broadcast (the page listens to the state); refused ones are not');
    assert.equal(msgs.length, windows, 'a parameter never reopens the window');
    assert.deepEqual(engine.state().profile.experience.params['touch-probe'], { gain: 0.25, mode: 'hard', trails: true, focus: wall });

    assert.equal(store.loadProfile(engine.profile.id).experience.params['touch-probe'], undefined, 'not written on every change…');
    await engine.stop(); // …but when things settle (here: on stop)
    stopped = true;
    assert.equal(store.loadProfile(engine.profile.id).experience.params['touch-probe'].gain, 0.25, 'written to the room profile');
  } finally { if (!stopped) await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('experiences: in Show mode play, stop, parameters, the layers and the output switch work; where it goes (output.set) is locked', async () => {
  const { engine, dir } = setup();
  engine.start();
  try {
    await engine.command('app.lock', { locked: true });
    await engine.command('experience.play', { id: 'touch-probe' });
    await engine.command('experience.param', { key: 'gain', value: 0.5 });
    await assert.rejects(engine.command('experience.set', { autostart: true }), /locked/);
    await assert.rejects(engine.command('output.set', { fps: 30 }), /locked/, 'where it goes is locked…');
    await assert.rejects(engine.command('output.set', { on: false, scale: 1 }), /locked/);
    assert.equal(engine.profile.output.fps, 60);
    await engine.command('output.layers', { layers: engine.profile.output.layers.map((l) => ({ ...l, opacity: 0.5 })) }); // …what is seen is not
    await engine.command('output.set', { on: false }); // …and neither is the switch
    assert.equal(engine.state().output.running, false);
    await engine.command('output.set', { on: true });
    await engine.command('experience.stop');
    await engine.command('app.lock', { locked: false });
    await engine.command('output.set', { fps: 30 });
    assert.equal(engine.profile.output.fps, 30);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('experiences: the profile field is normalised (it keeps the choice, autostart and the parameters; where it goes moved to the output)', () => {
  const p = normalizeProfile({ output: {}, experience: { id: '../x', autostart: 'yes', sink: 'ndi', senderName: '<>', displayId: 'a', fit: 'zoom', scale: 0.3, fps: 24,
    params: { 'ok-id': { a: 1, b: 'x', c: true, d: null, e: {}, 'bad key': 1 }, 'bad id!': { a: 1 }, str: 'nope' } } });
  assert.deepEqual(p.experience, { id: null, autostart: false, params: { 'ok-id': { a: 1, b: 'x', c: true } } });
  assert.deepEqual(normalizeProfile({}).experience.params, {});
  const q = normalizeProfile({ output: {}, experience: { id: 'fluid', autostart: true, sink: 'window', displayId: 2, fit: 'stretch', scale: 1, fps: 30 } });
  assert.deepEqual([q.experience.id, q.experience.autostart], ['fluid', true]);
  assert.equal('sink' in q.experience, false, 'the destination is not the experience\'s any more');
});

test('experiences: the server serves experience folders like the UI files, and nothing outside them', async () => {
  // a sibling folder whose name starts with the experience's: a prefix check would let it through
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-expsrv-'));
  fs.cpSync(path.join(FIX, 'touch-probe'), path.join(tmp, 'touch-probe'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'touch-probe-secret'));
  fs.writeFileSync(path.join(tmp, 'touch-probe-secret', 'secret.txt'), 'TOP-SECRET');
  fs.mkdirSync(path.join(tmp, 'touch-probe', 'sub'));
  fs.writeFileSync(path.join(tmp, 'touch-probe', 'sub', 'a.json'), '{"a":1}');
  const { engine, dir } = setup([tmp]);
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  try {
    const get = (p) => raw(server.port, p);
    const ok = await get('/experiences/touch-probe/index.html');
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /^text\/html/);
    assert.equal(ok.headers['cache-control'], 'no-cache', 'the same headers as the UI files');
    assert.match(ok.body.toString(), /connectExperience/);
    const man = await get('/experiences/touch-probe/manifest.json');
    assert.equal(man.status, 200);
    assert.equal(JSON.parse(man.body).id, 'touch-probe');
    assert.equal((await get('/experiences/touch-probe/sub/a.json')).status, 200, 'sub-folders are served');
    const rt = await get('/experiences/runtime.js');
    assert.equal(rt.status, 200);
    assert.match(rt.headers['content-type'], /javascript/);
    assert.match(rt.body.toString(), /export async function connectExperience/);

    const bad = [
      '/experiences/touch-probe/../../package.json', '/experiences/touch-probe/..%2F..%2Fpackage.json', '/experiences/touch-probe/%2e%2e/%2e%2e/package.json',
      '/experiences/touch-probe/..%5C..%5Cpackage.json', '/experiences/touch-probe/%2e%2e%5c%2e%2e%5cpackage.json',
      '/experiences/touch-probe/..%2Ftouch-probe-secret%2Fsecret.txt', '/experiences/touch-probe/..%2F..%2F..%2FREADME.md',
      '/experiences/..%2Fui%2Findex.html', '/experiences/..%2Fpackage.json', '/experiences/touch-probe/%2Fetc%2Fhosts',
      '/experiences/touch-probe/index.html%00.png', '/experiences/touch-probe/C:%5Cwindows%5Cwin.ini',
      '/experiences/touch-probe-secret/secret.txt', '/experiences/nope/index.html', '/experiences/', '/experiences', '/experiences/touch-probe/', '/experiences/touch-probe', '/experiences/touch-probe/sub', '/experiences//touch-probe/index.html',
    ];
    for (const p of bad) {
      const r = await get(p);
      assert.notEqual(r.status, 200, `${p} must not be served (got ${r.status})`);
      const text = r.body.toString();
      assert.ok(!text.includes('TOP-SECRET') && !text.includes('"veation-touch"') && !text.includes('VEATION Touch</title>'), `${p} leaked a file`);
    }
    // a malformed %-escape is a plain 400 (it used to throw inside the request handler), and the server carries on
    assert.equal((await get('/%E0%A4%A')).status, 400);
    assert.equal((await get('/experiences/touch-probe/index.html')).status, 200);
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('experiences: the preview is posted by the page on this computer only, and read with the same access as the UI', async () => {
  const { engine, dir } = setup();
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const post = (body, headers = {}, port = server.port) => raw(port, '/api/experience/preview', { method: 'POST', body, headers: { 'Content-Length': body.length, ...headers } });
  try {
    assert.equal((await post(jpeg)).status, 409, 'nothing runs: nothing to preview');
    await engine.command('experience.play', { id: 'touch-probe' });
    assert.equal((await raw(server.port, '/api/experience/preview.jpg')).status, 404, 'no frame yet');

    // from the internet relay (stamped tunnel traffic) it is refused: the page that renders runs here
    const tunnel = { 'x-vt-tunnel': engine.cloud.tunnelToken, 'x-vt-client-ip': '203.0.113.9' };
    assert.equal((await post(jpeg, tunnel)).status, 403);
    assert.equal(engine.outPreview, null);
    // …and from another machine on the network (this computer's LAN address is not loopback)
    const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
    if (lan) {
      const r = await new Promise((resolve, reject) => {
        const req = http.request({ host: lan.address, port: server.port, path: '/api/experience/preview', method: 'POST', headers: { 'Content-Length': jpeg.length }, timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode); });
        req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end(jpeg);
      });
      if (r !== null) assert.equal(r, 403, 'a LAN peer cannot post a preview');
    }
    assert.equal(engine.outPreview, null);

    assert.equal((await post(Buffer.from('<html>not a jpeg</html>'))).status, 400);
    assert.equal((await post(jpeg)).status, 204);
    assert.ok(engine.out.previewAt > 0);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(301 * 1024)]);
    const rBig = await post(big).catch((e) => ({ status: e.code }));
    assert.notEqual(rBig.status, 204, 'over 300 KB is refused');
    assert.equal(engine.outPreview.buf.length, jpeg.length, 'the refused frame did not replace the kept one');

    const got = await raw(server.port, '/api/experience/preview.jpg');
    assert.equal(got.status, 200);
    assert.equal(got.headers['content-type'], 'image/jpeg');
    assert.equal(got.headers['cache-control'], 'no-store');
    assert.deepEqual(got.body, jpeg);
    await engine.command('experience.report', { fps: 60 });
    assert.ok(engine.state().output.previewAt > 0, 'the state tells the UI a frame exists');

    await engine.command('experience.stop');
    assert.equal((await raw(server.port, '/api/experience/preview.jpg')).status, 200, 'the output goes on without the experience: its frame stays');
    // the desktop app sends the preview (and how the window is doing) through the engine's parent port
    assert.equal(engine.setOutputPreview(jpeg, { fps: 59.96, error: 'x' }), true);
    assert.equal(engine.state().output.fps, 60);
    assert.equal(engine.state().output.error, 'x');
    await engine.command('output.set', { on: false });
    assert.equal((await raw(server.port, '/api/experience/preview.jpg')).status, 404, 'the output off drops the frame');
    assert.equal(engine.setOutputPreview(jpeg), false, 'and nothing to preview');
  } finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }

  // a device that is not this computer needs the access key to see it (the same rule as the other APIs)
  const t = setup();
  t.engine.start();
  const s2 = await createServer(t.engine, { port: 0, root, log: quiet, trustLocal: false });
  try {
    await t.engine.command('experience.play', { id: 'touch-probe' });
    t.engine.setOutputPreview(jpeg);
    assert.equal((await raw(s2.port, '/api/experience/preview.jpg')).status, 401);
    assert.equal((await raw(s2.port, '/api/experience/preview.jpg?k=wrong')).status, 401);
    assert.equal((await raw(s2.port, `/api/experience/preview.jpg?k=${t.engine.settings.token}`)).status, 200);
    // a page on this computer still posts (loopback), even when the desktop is not trusted without a key
    assert.equal((await post(jpeg, {}, s2.port)).status, 204);
  } finally { s2.close(); await t.engine.stop(); fs.rmSync(t.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------- the runtime's hands (no browser)
// makeHands plays the tracker's REAL readings back ~HAND_DELAY_MS late on a smooth curve and joins the ids a hand splits into.

const { makeHands, HAND_DELAY_MS, STITCH_MS, STITCH_M } = await import('../experiences/runtime.js');
const PXM = 100; // px per metre on the made-up wall

/** A runtime handle with a fake page clock (the page runs 1000 ms ahead of the engine): `feed` is a live message, `run` 60 fps frames. */
function rig({ closed = false, width = 4000 } = {}) {
  const events = [], vt = { size: { width, height: 500 }, closedLoop: closed, emit: (n, e) => events.push(e) };
  let now = 5000;
  const hands = makeHands(vt, { now: () => now });
  return {
    events, hands,
    feed(reads, tEng = now - 1000) { hands.ingest(reads.map((r) => ({ wallId: 'W', size: 8, pxPerM: PXM, ...r })), tEng); },
    run(ms, each) { for (let end = now + ms; now < end;) { now += 1000 / 60; hands.tick(); each?.(hands.hands()); } },
    get now() { return now; },
  };
}
/**
 * One hand reading every 100 ms along x at 1 m/s (x = 0.5 + t / 1000 m), delivered in live messages every 33 ms from engine time
 * `from` to `to`. `ids(t)` is the tracker id carrying the reading of time t (null: none), `skip(t)` a revolution that is missed.
 */
function walk(R, { from = 0, to = 2000, ids = () => 1, skip = () => false } = {}) {
  const readings = [];
  for (let t = from; t <= to; t += 100) if (!skip(t)) readings.push(t);
  const seen = [];
  for (let t = from; t <= to + 400; t += 100 / 3) {
    const last = readings.filter((r) => r <= t).at(-1);
    if (last !== undefined && t <= to + 100) {
      const id = ids(last);
      R.feed(id == null ? [] : [{ id, x: (0.5 + last / 1000) * PXM, y: 150, t: last }], t);
    } else R.feed([], t);
    R.run(100 / 3, (h) => seen.push(h));
  }
  return seen;
}

test('hands: drawn behind the newest reading on a smooth curve through the real readings — interpolated, never extrapolated', () => {
  const R = rig();
  walk(R, { from: 1000, to: 2000 });
  R.run(1500);
  const downs = R.events.filter((e) => e.type === 'down'), ups = R.events.filter((e) => e.type === 'up'), moves = R.events.filter((e) => e.type === 'move');
  assert.equal(downs.length, 1);
  assert.ok(Math.abs(downs[0].x - 150) < 0.5, `it is drawn from its first reading on (${downs[0].x})`);
  assert.equal(ups.length, 1, 'and let go once');
  assert.ok(moves.every((e) => Math.abs(e.y - 150) < 1e-6), 'straight');
  assert.ok(moves.slice(8, -25).every((e) => Math.abs(e.vx - 100) < 25), `velocity from the curve, ~100 px/s: ${moves.slice(8, 12).map((e) => e.vx.toFixed(0))}`);
  // never beyond the newest reading: x = 0.5 + 2.0 m = 250 px; it ends there
  assert.ok(Math.max(...R.events.map((e) => e.x)) <= 250 + 1e-6, 'no extrapolation past the last reading');
  assert.ok(Math.abs(ups[0].x - 250) < 1, `it ends where the last reading was (${ups[0].x})`);
  assert.equal(R.hands.hands().length, 0);
});

test('hands: it lags the newest reading by about HAND_DELAY_MS, and a missed revolution is held, not extrapolated', () => {
  const R = rig();
  const trace = [];
  // readings every 100 ms, but none between 2000 and 2400 (a missed revolution, and then some)
  const reads = [];
  for (let t = 1000; t <= 3000; t += 100) if (t <= 2000 || t >= 2500) reads.push(t);
  for (let t = 1000; t <= 3600; t += 100 / 3) {
    const last = reads.filter((r) => r <= t).at(-1);
    if (last !== undefined) R.feed([{ id: 1, x: (0.5 + last / 1000) * PXM, y: 150, t: last }], t);
    R.run(100 / 3, (h) => { if (h[0]) trace.push({ t, x: h[0].x, last: (0.5 + last / 1000) * PXM }); });
  }
  assert.ok(trace.every((p) => p.x <= p.last + 1e-6), 'the hand is never ahead of the newest reading');
  const steady = trace.find((p) => p.t >= 1900), lagMs = ((steady.last - steady.x) / PXM) * 1000;
  assert.ok(lagMs > 60 && lagMs < HAND_DELAY_MS + 40, `lags ${lagMs.toFixed(0)} ms behind the newest reading (delay ${HAND_DELAY_MS})`);
  const held = trace.filter((p) => p.t > 2250 && p.t < 2450).map((p) => p.x);
  assert.ok(Math.max(...held) - Math.min(...held) < 12, 'it holds near the last reading during the gap');
  assert.ok(trace.every((p, i) => !i || p.x >= trace[i - 1].x - 1e-6), 'and never goes backwards');
  const after = trace.filter((p) => p.t > 2800).map((p) => p.x);
  assert.ok(after.at(-1) > after[0] + 20, 'then it follows the readings again');
});

test('hands: a new tracker id within 0.3 m and 300 ms is the same stroke — one down, one up, no jump', () => {
  // the first id's last reading is at 1500; the new one starts 200 ms later, 0.2 m further: the same hand
  const R = rig();
  walk(R, { from: 1000, to: 2500, skip: (t) => t === 1600 || t === 1700, ids: (t) => (t <= 1500 ? 1 : 2) });
  R.run(1500);
  const downs = R.events.filter((e) => e.type === 'down'), ups = R.events.filter((e) => e.type === 'up');
  assert.equal(downs.length, 1, 'one down');
  assert.equal(ups.length, 1, 'one up');
  assert.equal(new Set(R.events.map((e) => e.id)).size, 1, 'one stroke id throughout');
  assert.equal(downs[0].id, downs[0].stroke);
  const moves = R.events.filter((e) => e.type === 'move');
  assert.ok(moves.every((e, i) => !i || Math.abs(e.x - moves[i - 1].x) < 4), 'and the hand glides: no frame moves more than 4 px (a frame at 1 m/s is 1.7)');
  assert.deepEqual([...new Set(R.events.map((e) => e.trackerId))].filter((x) => x != null).sort(), [1, 2], 'the tracker\'s ids underneath are 1 and 2');
});

test('hands: an id that is still coasting is taken over by a new one, but a second hand that reads alongside is not', () => {
  // the old id is still listed (coasting, no new reading) when the new one appears 200 ms after its last reading
  const R = rig();
  for (let t = 1000; t <= 2400; t += 100 / 3) {
    const reads = [], last1 = Math.min(Math.floor(t / 100) * 100, 1500);
    if (t < 1850) reads.push({ id: 1, x: (0.5 + last1 / 1000) * PXM, y: 150, t: last1 });
    if (t >= 1700) { const l2 = Math.floor(t / 100) * 100; reads.push({ id: 2, x: (0.5 + l2 / 1000) * PXM, y: 150, t: l2 }); }
    R.feed(reads, t);
    R.run(100 / 3);
  }
  R.run(1200);
  assert.equal(R.events.filter((e) => e.type === 'down').length, 1, 'taken over: one stroke');
  // two hands read in the same revolutions, 0.1 m apart: two strokes
  const S = rig();
  for (let t = 1000; t <= 2000; t += 100 / 3) {
    const l = Math.floor(t / 100) * 100;
    S.feed([{ id: 1, x: (0.5 + l / 1000) * PXM, y: 150, t: l }, { id: 2, x: (0.6 + l / 1000) * PXM, y: 150, t: l }], t);
    S.run(100 / 3);
  }
  assert.equal(S.events.filter((e) => e.type === 'down').length, 2, 'two hands are two strokes');
});

test('hands: farther than 0.3 m, or later than 300 ms, is a new hand (and the first one is let go)', () => {
  assert.ok(STITCH_M === 0.3 && STITCH_MS === 300, 'the window is 0.3 m / 300 ms');
  const run = (dx, gapMs) => {
    const R = rig();
    for (let t = 1000; t <= 3200; t += 100 / 3) { // id 1 reads until 1500; id 2 from 1500 + gapMs on, dx metres off the line
      const l = Math.floor(t / 100) * 100;
      R.feed(l <= 1500 ? [{ id: 1, x: (0.5 + l / 1000) * PXM, y: 150, t: l }] : l >= 1500 + gapMs ? [{ id: 2, x: (0.5 + l / 1000 + dx) * PXM, y: 150, t: l }] : [], t);
      R.run(100 / 3);
    }
    R.run(1000);
    return R.events;
  };
  const ok = run(0.05, 200), far = run(0.5, 200), late = run(0.1, 500);
  assert.equal(ok.filter((e) => e.type === 'down').length, 1, 'close in space and time: one hand');
  assert.equal(far.filter((e) => e.type === 'down').length, 2, '0.5 m further: a new hand');
  assert.equal(late.filter((e) => e.type === 'down').length, 2, '500 ms later: a new hand');
  assert.equal(ok.filter((e) => e.type === 'up').length, 0, 'the one hand is still down');
  for (const ev of [far, late]) assert.equal(ev.filter((e) => e.type === 'up').length, 1, 'the first hand was let go when the second one came');
});

test('hands: the up comes after the stitch window (300 ms of reading time), not at once', () => {
  const R2 = rig();
  let upAt = null;
  for (let t = 1000; t <= 3000 && upAt == null; t += 100 / 3) {
    const last = Math.min(Math.floor(t / 100) * 100, 1500);
    R2.feed(t < 1550 ? [{ id: 1, x: (0.5 + last / 1000) * PXM, y: 150, t: last }] : [], t);
    R2.run(100 / 3);
    if (R2.events.some((e) => e.type === 'up')) upAt = t;
  }
  assert.ok(upAt != null, 'it ends');
  assert.ok(upAt - 1500 >= STITCH_MS, `not before the window has passed (${(upAt - 1500).toFixed(0)} ms after the last reading): a new id may still pick it up`);
  assert.ok(upAt - 1500 < STITCH_MS + 200, `but soon (${(upAt - 1500).toFixed(0)} ms)`);
});

test('hands: 360° — a hand going over the seam of a closed room is one smooth stroke, the short way round', () => {
  const R = rig({ closed: true, width: 1000 });
  const reads = [];
  for (let t = 1000; t <= 2000; t += 100) reads.push(t);
  for (let t = 1000; t <= 2500; t += 100 / 3) {
    const last = reads.filter((r) => r <= t).at(-1);
    R.feed(last !== undefined && t < 2100 ? [{ id: 1, x: ((9.5 + (last - 1000) / 1000) * PXM) % 1000, y: 150, t: last }] : [], t);
    R.run(100 / 3);
  }
  R.run(1200);
  const xs = R.events.filter((e) => e.type === 'move').map((e) => e.x);
  assert.ok(xs.some((x) => x > 950) && xs.some((x) => x < 80), 'it crossed the seam');
  let worst = 0;
  for (let i = 1; i < xs.length; i++) { let d = xs[i] - xs[i - 1]; d -= Math.round(d / 1000) * 1000; worst = Math.max(worst, Math.abs(d)); }
  assert.ok(worst < 4, `the short way round, a step of ${worst.toFixed(2)} px at most`);
  assert.equal(R.events.filter((e) => e.type === 'down').length, 1);
});

test('hands: pointer devices (direct) have no delay and no stitching — the hand is where the pointer is', () => {
  const events = [], vt = { size: { width: 1000, height: 500 }, closedLoop: false, emit: (n, e) => events.push(e) };
  let now = 100;
  const h = makeHands(vt, { direct: true, now: () => now });
  h.ingest([{ id: 7, wallId: 'W', x: 10, y: 20, size: 5, t: 100, pxPerM: 500 }], 100);
  assert.equal(events[0].type, 'down');
  assert.equal(events[0].id, 7);
  now = 116;
  h.ingest([{ id: 7, wallId: 'W', x: 30, y: 20, size: 5, t: 116, pxPerM: 500 }], 116);
  assert.equal(events.at(-1).type, 'move');
  assert.equal(events.at(-1).x, 30, 'at once');
  assert.ok(events.at(-1).vx > 500, 'with a speed');
  h.ingest([], 130);
  assert.equal(events.at(-1).type, 'up', 'and up at once');
  assert.deepEqual(h.hands(), []);
});
