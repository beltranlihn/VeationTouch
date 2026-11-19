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
      // …and found out as soon as it answers on its old address again, without waiting the whole time
      const t0 = Date.now();
      await assert.rejects(readdress({ host: '127.0.0.5', port, ip: '127.0.0.6', mask: '255.0.0.0', pollMs: 100, waitMs: 15000, oldCheckAfterMs: 300 }), /kept 127\.0\.0\.5/);
      assert.ok(Date.now() - t0 < 7000, `stopped after ${Date.now() - t0} ms, not after the whole 15 s`);
    } finally { stubborn.stop(); }
  } finally {
    emu.stop(); other.stop();
  }
});

test('re-address: a unit that restarts slowly (a real S2E: 11–61 s) is waited for, and one still silent is "not answering yet", not a failure', async () => {
  const { readdress, discover, READDRESS_WAIT_MS } = await import('../engine/discover.js');
  assert.ok(READDRESS_WAIT_MS >= 75000, `the default wait (${READDRESS_WAIT_MS} ms) covers the 61 s measured on a real unit, with margin`);
  const world = new SimWall(wall, pose, { seed: 5 });
  const slow = new S2EEmulator(world, { host: '127.0.0.12', rebind: true, rebootMs: 1500, serial: 'EE'.repeat(16) });
  const port = await slow.start();
  try {
    // waits as long as it takes (within the limit): confirmed by serial after the restart
    const r = await readdress({ host: '127.0.0.12', port, ip: '127.0.0.13', mask: '255.0.0.0', pollMs: 100, waitMs: 4000 });
    assert.equal(r.pending, undefined);
    assert.ok(r.ms >= 1400, `confirmed after the restart (${r.ms} ms)`);
    // the limit runs out while it is still restarting: reported as pending (the change most likely worked)
    const p = await readdress({ host: '127.0.0.13', port, ip: '127.0.0.14', mask: '255.0.0.0', pollMs: 100, waitMs: 700 });
    assert.equal(p.pending, true, 'not an error that sends the operator to power-cycle a healthy sensor');
    assert.equal(p.ip, '127.0.0.14');
    await new Promise((q) => setTimeout(q, 1300));
    const back = await discover({ hosts: ['127.0.0.14'], port, timeoutMs: 400 });
    assert.equal(back[0]?.info?.serial, 'EE'.repeat(16), 'and it does come back there');
  } finally {
    slow.stop();
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

test('driver: a sensor that is scanning again no longer shows the old error', async () => {
  const world = new SimWall(wall, pose, { seed: 6 });
  const emu = new S2EEmulator(world);
  const port = await emu.start();
  const drv = new S2EDriver({ id: 'S', host: '127.0.0.1', port }, quiet);
  let scans = 0;
  drv.on('scan', () => scans++);
  drv.start();
  try {
    await waitFor(() => scans >= 3, 6000, 'streaming');
    emu.silent = true;
    await waitFor(() => drv.status.state === 'offline', 4000, 'offline detection');
    assert.ok(drv.status.lastError, 'the outage is explained while it lasts');
    emu.silent = false;
    const before = scans;
    await waitFor(() => drv.status.state === 'scanning' && scans > before + 2, 15000, 'recovery');
    assert.equal(drv.status.lastError, null, 'the error is gone once it scans');
  } finally {
    await drv.stop();
    emu.stop();
  }
});

test('localAddressFor / bindAddressFor: the local address on the sensor network, nothing special for loopback', async () => {
  const { localAddressFor, bindAddressFor } = await import('../engine/discover.js');
  // XR Lab: audio network card plus the card that also got 192.168.11.5
  const two = [{ name: 'Dante', ip: '172.16.1.220', mask: '255.255.255.0' }, { name: 'Dante', ip: '192.168.11.5', mask: '255.255.255.0' }];
  assert.equal(localAddressFor('192.168.11.12', two), '192.168.11.5');
  assert.equal(localAddressFor('172.16.1.9', two), '172.16.1.220');
  assert.equal(localAddressFor('10.0.0.4', two), null, 'no card on that network');
  assert.equal(localAddressFor('192.168.11.12', []), null, 'no cards at all');
  assert.equal(localAddressFor('127.0.0.1', [{ ip: '127.0.0.1', mask: '255.0.0.0' }]), null, 'loopback emulators: no special bind');
  assert.equal(localAddressFor('garbage', two), null);
  const wide = [{ name: 'A', ip: '192.168.0.7', mask: '255.255.0.0' }, { name: 'B', ip: '192.168.11.5', mask: '255.255.255.0' }];
  assert.equal(localAddressFor('192.168.11.12', wide), '192.168.0.7', 'first matching card wins');
  // a sweep over one network binds to it; the factory address alone does not stop that; two networks mean 0.0.0.0
  assert.equal(bindAddressFor(['192.168.11.2', '192.168.11.11', '192.168.11.12'], two), '192.168.11.5');
  assert.equal(bindAddressFor(['192.168.11.2', '192.168.11.11', '172.16.1.9'], two), null);
  assert.equal(bindAddressFor(['192.168.11.2', '10.0.0.4'], [{ ip: '10.0.0.9', mask: '255.255.255.0' }]), '10.0.0.9', 'factory address not on any card is ignored');
  assert.equal(bindAddressFor(['127.0.0.1', '127.0.0.2'], two), null);
  // the driver recomputes it on every (re)connect, so a card added while the app runs is picked up
  let cards = [];
  const drv = new S2EDriver({ id: 'S', host: '192.168.11.12', interfaces: () => cards }, quiet);
  assert.equal(drv._bindAddress(), null);
  cards = two;
  assert.equal(drv._bindAddress(), '192.168.11.5');
});

test('candidateHosts: by default only the networks where the sensors are', async () => {
  const { candidateHosts } = await import('../engine/discover.js');
  const nic = (address, netmask = '255.255.255.0') => [{ family: 'IPv4', address, netmask, internal: false }];
  const interfaces = { Dante: [...nic('172.16.1.220'), ...nic('192.168.11.5')], Office: nic('10.1.2.3') };
  const only = candidateHosts({ interfaces });
  assert.ok(only.includes('192.168.11.11') && only.includes('192.168.11.2'));
  assert.ok(!only.some((h) => h.startsWith('172.16.1.') || h.startsWith('10.1.2.')), 'audio and office networks are not swept');
  const withHost = candidateHosts({ interfaces, sensorHosts: ['10.1.2.77', '127.0.0.1'] });
  assert.ok(withHost.includes('10.1.2.77') && !withHost.some((h) => h.startsWith('172.16.1.')), 'a sensor host pulls in its own network');
  const all = candidateHosts({ interfaces, everywhere: true });
  assert.ok(all.includes('172.16.1.9') && all.includes('10.1.2.9') && all.includes('192.168.11.11'));
  assert.ok(!all.includes('192.168.11.5') && !all.includes('10.1.2.3'), 'own addresses are never probed');
});
