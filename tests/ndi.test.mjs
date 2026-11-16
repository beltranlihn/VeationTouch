// The Texture output over NDI, received back through the NDI runtime of this computer (skipped where it is not
// installed: NDI is never bundled, see engine/outputs/ndi.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile } from '../engine/profile.js';
import { OutputManager } from '../engine/outputs/outputs.js';
import { ndiRuntimeFile } from '../engine/outputs/ndi.js';
import { captureNdi } from './ndi-probe.mjs';

const quiet = { info() {}, warn() {}, error() {} };
const skip = process.platform !== 'win32' || !ndiRuntimeFile() ? 'no NDI runtime on this computer' : false;

test('texture over NDI: only the chosen destination runs; a receiver on the network sees the touch, white on black', { skip }, async () => {
  const name = `VT test ${process.pid}`;
  const profile = (sink) => normalizeProfile({
    canvas: { width: 400, height: 200 },
    walls: [{ id: 'A', width: 4, height: 2, pixelRect: { x: 0, y: 0, w: 400, h: 200 } }],
    outputs: [{ id: 'T', type: 'texture', sink, senderName: name, scale: 1, radius: 0.2, softness: 0, rateHz: 30 }],
  });
  const om = new OutputManager(quiet);
  try {
    const prof = profile('ndi');
    om.configure(prof);
    const t = om.textures.get('T');
    assert.equal(t.error, null);
    assert.ok(t.ndi && t.started, 'an NDI source, and nothing else');
    const wall = prof.walls[0];
    let n = 0;
    const frame = () => ({ seq: n, t: n++ * 33, walls: [{ wall, touches: [{ id: 1, x: 1, y: 1.5, size: 0.1, vx: 0, vy: 0, age: 1 }] }], events: [], zoneEvents: [], zoneCounts: {}, roomCount: 1, burst: 0 });
    const timer = setInterval(() => om.send(frame(), Date.now()), 33);
    const got = await captureNdi(name).finally(() => clearInterval(timer));
    assert.ok(got, `the source "${name}" was found and sent a frame`);
    assert.deepEqual([got.xres, got.yres], [400, 200]);
    assert.ok(got.at(100, 50) > 200, `white under the touch (${got.at(100, 50)})`);  // wall (1, 1.5) m → pixel (100, 50)
    assert.ok(got.at(300, 150) < 30, `black elsewhere (${got.at(300, 150)})`);
    assert.ok(om.snapshot().T.sent > 0);
    // the same output sent to a full-screen window: the NDI source stops and the engine renders nothing for it
    om.configure(profile('window'));
    assert.equal(t.ndi, null);
    assert.equal(t.started, false);
    assert.equal(t.send([], Date.now()), false);
  } finally {
    om.close();
  }
});
