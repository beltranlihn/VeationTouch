// End-to-end: the real S2E driver (UDP) against the software S2E emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S2EDriver } from '../engine/drivers/s2e.js';
import { S2EEmulator } from '../engine/sim/s2e-emulator.js';
import { SimWall } from '../engine/sim/world.js';
import { SensorPipeline } from '../engine/core/pipeline.js';

const quiet = { info() {}, warn() {}, error() {} };
const wall = { id: 'W', width: 6, height: 3.5, masks: [] };
const pose = { x: 3, y: 3.8, rotation: -90 };

function waitFor(pred, ms, what) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pred()) { clearInterval(iv); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error(`timeout: ${what}`)); }
    }, 20);
  });
}

for (const [label, scanMode] of [['Sensitivity (HQ)', 'sensitivity'], ['DenseBoost', 'dense']]) {
  test(`driver ↔ emulator: ${label} streams full revolutions and sees a hand`, async () => {
    const world = new SimWall(wall, pose, { noiseMm: 2, seed: 3 });
    const emu = new S2EEmulator(world);
    const port = await emu.start();
    const drv = new S2EDriver({ id: 'S', host: '127.0.0.1', port, scanMode }, quiet);
    const scans = [];
    drv.on('scan', (s) => scans.push(s));
    drv.start();
    try {
      await waitFor(() => scans.length >= 6, 6000, 'six revolutions');
      assert.equal(drv.status.state, 'scanning');
      assert.equal(drv.status.modeName, scanMode === 'dense' ? 'DenseBoost' : 'Sensitivity');
      const s = scans.at(-1);
      assert.ok(s.count > 3000 && s.count < 3300, `samples per revolution: ${s.count}`);
      // angles cover the circle and increase
      assert.ok(s.angle[0] < 1 && s.angle[s.count - 1] > 359, `angle span ${s.angle[0]}..${s.angle[s.count - 1]}`);

      const pipe = new SensorPipeline({ id: 'S', pose }, wall, {});
      let learned = false;
      pipe.learnBackground(5, () => { learned = true; });
      const n0 = scans.length;
      await waitFor(() => scans.length >= n0 + 6, 3000, 'background revolutions');
      for (const sc of scans.slice(n0, n0 + 5)) pipe.process(sc);
      assert.ok(learned);
      world.injected.set('h', { x: 2, y: 1.3 });
      const n1 = scans.length;
      await waitFor(() => scans.length >= n1 + 3, 3000, 'hand revolutions');
      const det = pipe.process(scans.at(-1)).detections;
      assert.equal(det.length, 1);
      const err = Math.hypot(det[0].x - 2, det[0].y - 1.3);
      assert.ok(err < 0.02, `hand error ${(err * 1000).toFixed(1)} mm`);
      assert.equal(drv.status.crcErrors, 0);
    } finally {
      await drv.stop();
      emu.stop();
    }
  });
}

test('discovery finds an S2E and reads its serial; static IP command is sent and acknowledged', async () => {
  const { discover, setStaticIp } = await import('../engine/discover.js');
  const world = new SimWall(wall, pose, { seed: 9 });
  const emu = new S2EEmulator(world);
  const port = await emu.start();
  try {
    const found = await discover({ hosts: ['127.0.0.1', '127.0.0.2'], port, timeoutMs: 600 });
    assert.equal(found.length, 1);
    assert.equal(found[0].host, '127.0.0.1');
    assert.equal(found[0].health.status, 0);
    assert.ok(found[0].info?.serial, 'serial read with GET_INFO');
    assert.equal((await discover({ hosts: ['127.0.0.1'], port, skip: ['127.0.0.1'], timeoutMs: 300 })).length, 0, 'running sensors are skipped');
    const r = await setStaticIp({ host: '127.0.0.1', port, ip: '192.168.11.13', mask: '255.255.255.0' });
    assert.equal(r.gw, '192.168.11.1');
    assert.deepEqual(emu.staticIp, { ip: '192.168.11.13', mask: '255.255.255.0', gw: '192.168.11.1' });
    await assert.rejects(setStaticIp({ host: '127.0.0.1', port, ip: '300.1.1.1' }), /invalid/);
  } finally {
    emu.stop();
  }
});

test('re-address: the unit comes back on its new IP with the same serial, or the change is reported as failed', async () => {
  const { readdress, readStaticIp, discover } = await import('../engine/discover.js');
  const world = new SimWall(wall, pose, { seed: 4 });
  // a factory-new unit on one loopback address, another unit already on the address we will try first
  const emu = new S2EEmulator(world, { host: '127.0.0.2', rebind: true, rebootMs: 200, serial: 'AA'.repeat(16) });
  const port = await emu.start();
  const other = new S2EEmulator(world, { host: '127.0.0.4', port, serial: 'BB'.repeat(16) });
  await other.start();
  try {
    assert.deepEqual(await readStaticIp({ host: '127.0.0.2', port }), { ip: '127.0.0.2', mask: '255.255.255.0', gw: '127.0.0.1' }, 'its configuration can be read back without changing it');
    await assert.rejects(readdress({ host: '127.0.0.2', port, ip: '127.0.0.4', mask: '255.0.0.0', pollMs: 100, waitMs: 2000 }), /already used by another unit \(serial BBBB/);
    assert.equal(emu.host, '127.0.0.2', 'nothing was sent to a unit whose new address is taken');
    const r = await readdress({ host: '127.0.0.2', port, ip: '127.0.0.3', mask: '255.0.0.0', pollMs: 100, waitMs: 3000 });
    assert.equal(r.ip, '127.0.0.3');
    assert.equal(r.serial, 'AA'.repeat(16), 'confirmed by the serial number, not just by "something answered"');
    assert.equal((await discover({ hosts: ['127.0.0.2'], port, timeoutMs: 300 })).length, 0, 'the old address is free');
    // a unit that ignores the command: reported as "kept its address", never as success
    const stubborn = new S2EEmulator(world, { host: '127.0.0.5', port, rebind: false, serial: 'CC'.repeat(16) });
    await stubborn.start();
    try {
      await assert.rejects(readdress({ host: '127.0.0.5', port, ip: '127.0.0.6', mask: '255.0.0.0', pollMs: 100, waitMs: 800 }), /kept 127\.0\.0\.5/);
    } finally { stubborn.stop(); }
  } finally {
    emu.stop(); other.stop();
  }
});

test('sensor network helpers: unconfigured cards and suggested addresses per wall', async () => {
  const { unconfiguredInterfaces, suggestAddresses } = await import('../engine/discover.js');
  const ifaces = {
    'Wi-Fi': [{ family: 'IPv4', address: '172.16.2.42', internal: false }],
    'Ethernet 2': [{ family: 'IPv4', address: '169.254.10.20', internal: false }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '169.254.1.1', internal: false }],
  };
  assert.deepEqual(unconfiguredInterfaces(ifaces), [{ name: 'Ethernet 2', ip: '169.254.10.20' }], 'only a real card without DHCP');
  assert.deepEqual(suggestAddresses(['P1', 'P2', 'P3'], { ip: '192.168.11.5' }, ['192.168.11.12']),
    { P1: '192.168.11.11', P2: '192.168.11.13', P3: '192.168.11.14' }, 'skips addresses in use');
});

test('driver: watchdog notices a cut cable and recovers when it comes back', async () => {
  const world = new SimWall(wall, pose, { seed: 5 });
  const emu = new S2EEmulator(world);
  const port = await emu.start();
  const drv = new S2EDriver({ id: 'S', host: '127.0.0.1', port }, quiet);
  let scans = 0;
  drv.on('scan', () => scans++);
  drv.start();
  try {
    await waitFor(() => scans >= 3, 6000, 'streaming');
    emu.silent = true;                       // cable cut
    await waitFor(() => drv.status.state === 'offline', 4000, 'offline detection');
    emu.silent = false;                      // cable back
    const before = scans;
    await waitFor(() => drv.status.state === 'scanning' && scans > before + 2, 15000, 'recovery');
    assert.ok(drv.status.restarts >= 1);
  } finally {
    await drv.stop();
    emu.stop();
  }
});
