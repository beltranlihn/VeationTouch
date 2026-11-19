// The studio's Spout sender (native/spout-send): the CPU path (send) and the GPU path (sendShared, a shared D3D11
// texture from Electron's off-screen rendering — how experiences reach the room at full size), each checked by
// reading the sender back with the same addon's receiver. Windows only.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let addon = null, electronPath = null;
try { addon = require(path.join(root, 'native', 'spout-send', 'dsp_spout.node')); } catch { /* not Windows */ }
try { electronPath = (await import('electron')).default; } catch { /* not installed */ }
const opt = { skip: !addon && 'the Spout addon only loads on Windows' };

test('spout: the sender has the GPU entry point, and a bad handle is refused, not a crash', opt, () => {
  assert.equal(typeof addon.sendShared, 'function');
  assert.ok(addon.start(`VT bad handle ${process.pid}`));
  try {
    assert.equal(addon.sendShared(Buffer.alloc(8)), false, 'a null handle');
    assert.notEqual(addon.sharedError(), 0, 'and it says why');
    assert.equal(addon.sendShared('not a buffer'), false);
  } finally { addon.stop(); }
});

test('spout: CPU path — RGBA pixels sent come back from a receiver', opt, () => {
  const name = `VT cpu ${process.pid}`, w = 64, h = 32;
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([0x33, 0x66, 0xcc, 0xff], i * 4);
  assert.ok(addon.start(name));
  try {
    addon.send(px, w, h, false);
    addon.inOpen(name);
    // the receiver reads through staging textures, one frame late: the first frames it hands over can be empty
    let f = null;
    const lit = () => f && f.data && f.data[2] > 0;
    for (let k = 0; k < 60 && !lit(); k++) { addon.send(px, w, h, false); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); f = addon.inFrame(false); }
    assert.ok(lit(), 'a frame with the pixels was received');
    assert.deepEqual([f.w, f.h], [w, h]);
    assert.deepEqual([...f.data.subarray(0, 3)], [0x33, 0x66, 0xcc]);
    assert.equal(addon.inFormat(), 28, 'sent as RGBA (DXGI_FORMAT_R8G8B8A8_UNORM)');
  } finally { addon.inClose(); addon.stop(); }
});

test('spout: CPU path, BGRA — an Electron paint bitmap goes out as it is (no swizzle) in a BGRA sender, and the format follows the flag', opt, () => {
  const name = `VT bgra ${process.pid}`, w = 64, h = 32;
  // what Chromium's paint bitmap holds for the colour #3366CC: B, G, R, A
  const bgra = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) bgra.set([0xcc, 0x66, 0x33, 0xff], i * 4);
  const wait = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  // the receiver reads through staging textures, one frame late: keep sending until the frame we want comes out
  const read = (send, want) => {
    let f = null;
    for (let k = 0; k < 120 && !(f && f.data && f.data.subarray(0, 4).equals(Buffer.from(want))); k++) { send(); wait(); f = addon.inFrame(false); }
    return f;
  };
  assert.ok(addon.start(name));
  try {
    assert.equal(addon.send(bgra, w, h, false, true), true);
    addon.inOpen(name);
    const f = read(() => addon.send(bgra, w, h, false, true), [0xcc, 0x66, 0x33, 0xff]);
    assert.ok(f && f.data, 'a BGRA frame was received');
    assert.equal(addon.inFormat(), 87, 'the sender is BGRA (DXGI_FORMAT_B8G8R8A8_UNORM)');
    assert.deepEqual([f.w, f.h], [w, h]);
    assert.deepEqual([...f.data.subarray(0, 4)], [0xcc, 0x66, 0x33, 0xff], 'the bytes came back exactly as sent: B, G, R, A');
    // the same sender goes back to RGBA when the flag is off (the format is set before every send)
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([0x33, 0x66, 0xcc, 0xff], i * 4);
    const g = read(() => addon.send(rgba, w, h, false), [0x33, 0x66, 0xcc, 0xff]);
    assert.equal(addon.inFormat(), 28);
    assert.deepEqual([...g.data.subarray(0, 4)], [0x33, 0x66, 0xcc, 0xff]);
  } finally { addon.inClose(); addon.stop(); }
});

test('spout: CPU fallback of the room output — an off-screen Electron paint (image.toBitmap) is sent as BGRA and read back with the same colour and size', { skip: (!addon && 'Windows only') || (!electronPath && 'electron is not installed') }, async () => {
  const line = await new Promise((resolve, reject) => {
    const p = spawn(electronPath, [path.join(root, 'tests', 'spout', 'cpu-roundtrip.cjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.on('error', reject);
    p.on('exit', () => resolve(buf.split('\n').find((l) => l.startsWith('SPOUT-CPU ')) || buf.slice(0, 400)));
  });
  assert.ok(line.startsWith('SPOUT-CPU '), line);
  const r = JSON.parse(line.slice(10));
  assert.ok(r.paints > 3, `the window painted (${r.paints})`);
  assert.ok(r.sent > 3 && r.sent >= r.paints - 2, `the paints went out (${r.sent} of ${r.paints}; the first one can be an empty start-up paint)`);
  assert.deepEqual(r.size, [320, 180], 'the paint bitmap is the window size');
  assert.deepEqual(r.recv, [320, 180], 'the receiver sees the window size');
  assert.equal(r.format, 87, 'a BGRA sender: the bitmap was not converted on the CPU');
  const [b, g, rr] = r.px;
  assert.ok(Math.abs(rr - 0x33) <= 2 && Math.abs(g - 0x66) <= 2 && Math.abs(b - 0xcc) <= 2, `colour ${r.px} (BGRA) = #3366CC`);
});

test('spout: GPU path — an off-screen Electron paint goes to Spout as a shared texture, same size, same colour', { skip: (!addon && 'Windows only') || (!electronPath && 'electron is not installed') }, async () => {
  const line = await new Promise((resolve, reject) => {
    const p = spawn(electronPath, [path.join(root, 'tests', 'spout', 'gpu-roundtrip.cjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.on('error', reject);
    p.on('exit', () => resolve(buf.split('\n').find((l) => l.startsWith('SPOUT-GPU ')) || buf.slice(0, 400)));
  });
  assert.ok(line.startsWith('SPOUT-GPU '), line);
  const r = JSON.parse(line.slice(10));
  assert.ok(r.paints > 3, `the window painted (${r.paints})`);
  assert.equal(r.sent, r.paints, `every paint went out on the GPU (last error ${r.lastErr})`);
  assert.deepEqual(r.size, [320, 180], 'the receiver sees the window size');
  // the sender keeps the texture's own format (BGRA): the receiver hands those bytes over as they are
  const [b, g, rr] = r.px;
  assert.ok(Math.abs(rr - 0x33) <= 2 && Math.abs(g - 0x66) <= 2 && Math.abs(b - 0xcc) <= 2, `colour ${r.px} (BGRA) = #3366CC`);
});
