// The engine: owns the active room profile and runs sensors → pipelines → trackers →
// zones → outputs. Runs standalone (`node engine/main.js`) or inside Electron's
// utilityProcess. Everything the UI can do goes through `command()`.

import { EventEmitter } from 'node:events';
import { S2EDriver } from './drivers/s2e.js';
import { SimDriver } from './drivers/sim.js';
import { SensorPipeline, changedRuns } from './core/pipeline.js';
import { WallTracker } from './core/tracker.js';
import { ZoneEngine, BurstMeter } from './core/zones.js';
import { CornerLinker } from './core/corners.js';
import { CalibrationSession, defaultTargets, VerifySession, verifyTargets } from './core/calibration.js';
import { OutputManager } from './outputs/outputs.js';
import { normalizeProfile, blankProfile, wallToUv } from './profile.js';
import { firewallStatus, fixFirewall } from './net.js';
import { autoAlign, backgroundPoints } from './core/autoalign.js';
import { levelCheck } from './core/levelcheck.js';
import { Recorder, ReplaySource, ReplayDriver, listRecordings, readHeader } from './record.js';
import { discover, setStaticIp } from './discover.js';
import fs from 'node:fs';
import path from 'node:path';

const TICK_HZ = 60;

export class Engine extends EventEmitter {
  /**
   * @param {{store: import('./store.js').Store, log: object, version: string}} deps
   */
  constructor({ store, log, version }) {
    super();
    this.store = store;
    this.log = log;
    this.version = version;
    this.settings = store.loadSettings();
    this.sensors = new Map();   // id → { cfg, driver, pipeline, status, lastDetections, viz, rejected }
    this.trackers = new Map();  // wallId → WallTracker
    this.ids = { next: 1 };
    this.zones = new ZoneEngine();
    this.corners = new CornerLinker(); // one touch across joined corners
    this.burst = new BurstMeter(300);
    this.outputs = new OutputManager(log);
    this.calib = null;
    this.control = null;        // device driving the running calibration / verification {id, device, addr, since, gone}
    this.bgJobs = new Map();    // sensorId → {done, frames}
    this.seq = 0;
    this.startedAt = Date.now();
    this.displays = [];
    this.lastFrame = null;
    this.tickStats = { fps: 0, n: 0, t0: performance.now(), maxMs: 0 };
  }

  start() {
    let id = this.settings.activeProfile;
    const list = this.store.listProfiles();
    if (!id || !list.some((p) => p.id === id)) id = list.find((p) => p.id.endsWith('-sim'))?.id ?? list[0]?.id;
    let prof;
    try { prof = id ? this.store.loadProfile(id) : null; } catch (e) { this.log.error(`load ${id}: ${e.message}`); }
    if (!prof) prof = this.store.saveProfile(blankProfile('New room'));
    this._activate(prof);
    this._timer = setInterval(() => this._tick(), 1000 / TICK_HZ);
    this.log.info(`engine ${this.version} started with profile "${prof.name}"`);
  }

  async stop() {
    clearInterval(this._timer);
    if (this.recorder) await this.recorder.stop().catch(() => {});
    if (this.replay) this.replay.source.stop();
    await Promise.all([...this.sensors.values()].map((s) => s.driver.stop().catch(() => {})));
    this.outputs.close();
  }

  // ------------------------------------------------------------------ profile activation

  _activate(profile) {
    const prev = this.profile;
    this.profile = profile;
    this.rev = (this.rev || 0) + 1;
    if (this.settings.activeProfile !== profile.id) { this.settings.activeProfile = profile.id; this.store.saveSettings(this.settings); }

    // trackers (a different room starts from scratch)
    if (prev && prev.id !== profile.id) this.trackers.clear();
    for (const w of profile.walls) {
      let t = this.trackers.get(w.id);
      if (t) { t.wall = w; t.configure(profile.tracking); } else { t = new WallTracker(w, profile.tracking, this.ids); this.trackers.set(w.id, t); }
      t.confirmNow = (wallId, tr) => this.corners.shouldConfirm(wallId, tr);
    }
    this.corners.configure(profile.walls);
    this.corners.setTracking(profile.tracking); // corner zone + the trackers' own prediction (not counted twice)
    for (const id of [...this.trackers.keys()]) if (!profile.walls.some((w) => w.id === id)) this.trackers.delete(id);

    // sensors: restart a driver only if its connection settings changed
    const driverKey = (s) => JSON.stringify([s.driver, s.host, s.port, s.scanMode, s.motorRpm, s.enabled, s.wallId, s.driver === 'sim' ? s.pose : 0, this.replay?.file || null]);
    const wanted = new Map(profile.sensors.map((s) => [s.id, s]));
    const switched = prev && prev.id !== profile.id;
    for (const [id, rt] of this.sensors) {
      const s = wanted.get(id);
      if (switched || !s || driverKey(s) !== rt.key) { rt.driver.stop().catch(() => {}); this.sensors.delete(id); }
    }
    for (const s of profile.sensors) {
      const wall = profile.walls.find((w) => w.id === s.wallId);
      if (!wall) continue;
      let rt = this.sensors.get(s.id);
      if (!rt) {
        if (!s.enabled) continue;
        // While a recording is replayed, every sensor takes its revolutions from the file.
        const driver = this.replay ? new ReplayDriver(s.id, this.replay.source)
          : s.driver === 'sim'
            ? new SimDriver({ id: s.id, wall, pose: s.pose, wanderers: profile.simulation.wanderers, plane: profile.simulation.planes[s.id] }, this.log)
            : new S2EDriver({ id: s.id, host: s.host, port: s.port, scanMode: s.scanMode, motorRpm: s.motorRpm }, this.log);
        const pipeline = new SensorPipeline(s, wall, profile.processing);
        const bg = this.store.loadBackground(profile.id, s.id);
        if (bg?.dist && bg.binDeg === profile.processing.binDeg) pipeline.setBackground(bg.dist);
        rt = { cfg: s, key: driverKey(s), driver, pipeline, status: driver.status, lastDetections: [], viz: null, rejected: [] };
        driver.on('scan', (scan) => this._onScan(rt, scan));
        driver.on('status', (st) => { rt.status = st; });
        this.sensors.set(s.id, rt);
        driver.start();
      } else {
        rt.cfg = s;
        rt.pipeline.configure(s, wall, profile.processing);
        if (rt.driver instanceof SimDriver) { rt.driver.setWanderers(profile.simulation.wanderers); rt.driver.setPlane(profile.simulation.planes[s.id]); }
      }
    }
    this.zones.configure(profile.zones, profile.walls);
    this.outputs.configure(profile);
    if (this.calib && !profile.walls.some((w) => w.id === this.calib.wall.id)) this.calib = null;
    if (this.verify && !profile.walls.some((w) => w.id === this.verify.wall.id)) this.verify = null;
    this.emit('state');
  }

  // ------------------------------------------------------------------ data path

  _onScan(rt, scan) {
    const wallId = rt.cfg.wallId;
    const calibrating = this.calib && this.calib.wall.id === wallId && this.calib.sensorIds.includes(rt.cfg.id);
    const res = rt.pipeline.process(scan, { raw: calibrating, viz: this.listenerCount('viz') > 0 });
    rt.lastScan = scan;
    if (this.recorder && !this.replay) this.recorder.write(scan);
    rt.viz = res.viz;
    rt.rejected = res.rejected;
    rt.lastDetections = res.detections;
    rt.scans = (rt.scans || 0) + 1;
    if (calibrating) { this.calib.feed(rt.cfg.id, res.detections, scan.t); return; }
    const tr = this.trackers.get(wallId);
    if (tr) tr.ingest(res.detections, scan.t);
  }

  _tick() {
    const t0 = performance.now();
    const raw = [], rawEvents = [];
    for (const w of this.profile.walls) {
      const tr = this.trackers.get(w.id);
      if (!tr) continue;
      const r = tr.tick(t0);
      raw.push(...r.touches);
      rawEvents.push(...r.events);
    }
    // continuous corners: tracks of one hand on both sides of a joined corner become ONE public touch
    const linked = this.corners.update(raw, rawEvents, t0);
    const events = linked.events;
    const byWall = {};
    for (const t of linked.touches) (byWall[t.wallId] ??= []).push(t);
    const walls = [];
    for (const w of this.profile.walls) if (this.trackers.has(w.id)) walls.push({ wall: w, touches: byWall[w.id] ??= [] });
    if (this.verify) this.verify.feed(byWall[this.verify.wall.id] || [], t0);
    const z = this.zones.update(byWall, t0);
    this.burst.add(events);
    const frame = {
      seq: ++this.seq, t: t0, walls, events, zoneEvents: z.events, zoneCounts: z.counts,
      roomCount: walls.reduce((a, w) => a + w.touches.length, 0), burst: this.burst.value(t0),
    };
    this.outputs.send(frame, t0);
    this.lastFrame = frame;
    this.emit('frame', frame);
    const s = this.tickStats;
    s.n++; s.maxMs = Math.max(s.maxMs, performance.now() - t0);
    if (t0 - s.t0 >= 1000) { s.fps = Math.round((s.n * 1000) / (t0 - s.t0)); s.n = 0; s.t0 = t0; s.lastMax = s.maxMs; s.maxMs = 0; }
  }

  /** Frame in the public JSON shape used by the WebSocket output and the UI. */
  publicFrame(frame = this.lastFrame) {
    if (!frame) return null;
    return {
      type: 'frame', seq: frame.seq, t: Math.round(frame.t),
      walls: frame.walls.map(({ wall, touches }) => ({
        id: wall.id,
        touches: touches.map((t) => {
          const [u, v] = wallToUv(wall, t.x, t.y);
          return { id: t.id, u: r4(u), v: r4(v), x: r4(t.x), y: r4(t.y), vx: r4(t.vx), vy: r4(t.vy), size: r4(t.size), age: r4(t.age) };
        }),
      })),
      events: frame.events.map((e) => ({ ...e, t: Math.round(e.t), x: r4(e.x), y: r4(e.y), ...(e.fromX !== undefined ? { fromX: r4(e.fromX) } : {}) })),
      zones: frame.zoneCounts, zoneEvents: frame.zoneEvents.map((e) => ({ ...e, t: Math.round(e.t) })),
      room: { count: frame.roomCount, burst: frame.burst },
    };
  }

  // ------------------------------------------------------------------ snapshots for the UI

  /** Static returns of a sensor in its own frame: the learned background (steady), else the last revolution. */
  _staticPoints(rt) {
    if (rt.pipeline.bg) return backgroundPoints(rt.pipeline.bg, rt.pipeline.p.binDeg);
    if (!rt.lastScan) throw new Error('no data from this sensor yet');
    const s = rt.lastScan, pts = [];
    for (let i = 0; i < s.count; i++) if (s.dist[i] > 80) { const a = (s.angle[i] * Math.PI) / 180; pts.push([(s.dist[i] / 1000) * Math.cos(a), (s.dist[i] / 1000) * Math.sin(a)]); }
    return pts;
  }

  status() {
    const now = performance.now();
    const sensors = {};
    for (const [id, rt] of this.sensors) {
      const st = rt.status;
      const job = this.bgJobs.get(id);
      sensors[id] = {
        state: st.state, hz: st.hz, pps: st.pps, crcErrors: st.crcErrors, restarts: st.restarts,
        lastError: st.lastError, info: st.info, health: st.health, modeName: st.modeName, modes: st.modes,
        sinceData: st.lastPacketAt ? Math.round(now - st.lastPacketAt) : null,
        detections: rt.lastDetections.length, rejected: rt.rejected.length,
        background: !!rt.pipeline.bg, learning: job ? { done: job.done(), frames: job.frames } : null,
        calibrated: rt.pipeline.calibrated, activity: rt.pipeline.activity || 0, bgMotion: rt.bgMotion || null,
      };
    }
    return {
      type: 'status', sensors, outputs: this.outputs.snapshot(),
      engine: { fps: this.tickStats.fps, tickMaxMs: Math.round((this.tickStats.lastMax || 0) * 100) / 100, uptime: Math.round((Date.now() - this.startedAt) / 1000), rss: Math.round(process.memoryUsage().rss / 1048576) },
      calib: this.calib ? this.calib.snapshot(now) : null,
      verify: this.verify ? this.verify.snapshot(now) : null,
      control: this._owner() ? { ...this.control } : null,
      recording: this.recorder ? { file: path.basename(this.recorder.file), seconds: Math.round(this.recorder.elapsed / 1000), frames: this.recorder.frames, mb: Math.round(this.recorder.bytes / 1e5) / 10 } : null,
      replay: this.replay ? { file: this.replay.file, pos: Math.round(this.replay.source.pos / 1000), duration: Math.round(this.replay.source.duration / 1000), from: this.replay.source.header?.profileName || null } : null,
    };
  }

  state() {
    return {
      type: 'state', rev: this.rev, version: this.version, profile: this.profile, profiles: this.store.listProfiles(),
      projection: this.settings.projection, displays: this.displays, autostart: this.settings.autostart,
      locked: !!this.settings.locked,
      localName: this.mdns ? { ...this.mdns.info(), port: this.port || null } : null,
      underlay: (() => { const u = this.store.underlayInfo(this.profile.id); return u ? { url: `/api/underlay?p=${encodeURIComponent(this.profile.id)}&v=${u.v}` } : null; })(),
    };
  }

  setDisplays(list) { this.displays = list || []; this.emit('state'); }

  // ------------------------------------------------------------------ commands

  async command(op, args = {}) {
    const P = this.profile;
    // SHOW mode: the room is locked against edits; operation commands keep working.
    if (this.settings.locked && LOCKED_OPS.has(op)) throw new Error('the room is locked (Show mode) — unlock it first');
    // While a calibration / verification runs, ONE device drives it and the others are view-only (they can take over).
    // `__client` is set by the server, never by the client; commands without it (tests, the engine itself) pass.
    const who = args.__client;
    const owner = this._owner();
    if (who && owner && CONTROL_OPS.has(op) && owner.id !== who.id) {
      if (owner.gone) this._takeControl(who, 'the device that was calibrating disconnected');
      else throw new Error(`calibration in progress on ${owner.device} — take control on this device to make changes`);
    }
    switch (op) {
      case 'control.take': {
        if (!this.calib && !this.verify) throw new Error('no calibration or verification is running');
        if (!who) throw new Error('only a connected device can take control');
        this._takeControl(who);
        return { control: { ...this.control } };
      }
      case 'app.lock': {
        this.settings.locked = !!args.locked;
        this.store.saveSettings(this.settings);
        this.log.info(this.settings.locked ? 'room locked (Show mode)' : 'room unlocked');
        if (this.settings.locked) { this._cancelCalibration(); this.verify = null; }
        this.emit('state');
        return { locked: this.settings.locked };
      }
      case 'profile.versions': return { versions: this.store.listVersions(args.id || P.id) };
      case 'profile.restore': {
        const id = args.id || P.id;
        const p = this.store.restoreVersion(id, args.version);
        if (id === P.id) this._activate(p); else this.emit('state');
        this.log.info(`profile ${id} restored to ${args.version}`);
        return { id };
      }
      case 'profile.update': {
        if (args.rev !== undefined && args.rev !== this.rev) throw new Error('stale: the profile changed on another device — reloaded');
        const next = normalizeProfile({ ...args.profile, id: P.id });
        this._activate(this.store.saveProfile(next));
        return { rev: this.rev };
      }
      case 'profile.load': {
        const p = this.store.loadProfile(args.id);
        this._cancelCalibration();
        this._activate(p);
        return { id: p.id };
      }
      case 'profile.create': {
        // from: an existing profile id, 'blank', or a full profile spec built by the New room wizard
        const base = args.profile ? normalizeProfile(args.profile)
          : args.from && args.from !== 'blank' ? this.store.loadProfile(args.from) : blankProfile(args.name);
        const id = this.store.uniqueId(args.name || 'room');
        const p = this.store.saveProfile({ ...base, id, name: args.name || base.name, sensors: base.sensors.map((s) => ({ ...s, calibration: args.keepCalibration ? s.calibration : null })) });
        this._cancelCalibration();
        this._activate(p);
        return { id };
      }
      case 'profile.import': {
        const src = typeof args.json === 'string' ? JSON.parse(args.json) : args.json;
        const n = normalizeProfile(src);
        n.id = this.store.uniqueId(n.name);
        const p = this.store.saveProfile(n);
        return { id: p.id };
      }
      case 'profile.export': return { json: this.store.loadProfile(args.id || P.id) };
      case 'profile.delete': {
        if (args.id === P.id) throw new Error('cannot delete the active profile');
        this.store.deleteProfile(args.id);
        this.emit('state');
        return {};
      }

      case 'bg.capture': return this._captureBackground(args);
      case 'bg.clear': {
        for (const id of this._sensorIds(args)) {
          const rt = this.sensors.get(id);
          rt?.pipeline.setBackground(null);
          if (rt) rt.bgMotion = null;
          this.store.deleteBackground(P.id, id);
        }
        this._saveSensorFlags();
        return {};
      }

      case 'calib.start': return this._startCalibration(args);
      case 'calib.skip': this.calib?.skip(); return {};
      case 'calib.back': this.calib?.redoPrevious(); return {};
      case 'calib.cancel': this._cancelCalibration(); return {};
      case 'calib.redo': {
        if (!this.calib) throw new Error('no calibration running');
        const i = Number.isInteger(args.index) ? args.index : this.calib.worstTarget();
        if (i < 0) throw new Error('nothing to redo');
        this.calib.redoTarget(i);
        return { index: i };
      }
      case 'verify.start': {
        const wall = this.profile.walls.find((w) => w.id === args.wallId);
        if (!wall) throw new Error('unknown wall');
        if (this.calib) throw new Error('finish or cancel the calibration first');
        this.verify = new VerifySession(wall, verifyTargets(wall, args));
        this._setOwner(who);
        this.log.info(`verification started on ${wall.id}${who ? ` from ${who.device}` : ''}`);
        this.emit('state');
        return { targets: this.verify.targets.length };
      }
      case 'verify.cancel': {
        if (this.verify) this.log.info(`verification on ${this.verify.wall.id} closed${this.verify.summary() ? ` — mean ${this.verify.summary().meanMm} mm, max ${this.verify.summary().maxMm} mm` : ''}`);
        this.verify = null;
        this.emit('state');
        return {};
      }
      case 'calib.apply': return this._applyCalibration();
      case 'calib.clear': {
        const prof = structuredClone(P);
        for (const s of prof.sensors) if (this._sensorIds(args).includes(s.id)) s.calibration = null;
        this._activate(this.store.saveProfile(prof));
        return {};
      }

      case 'sim.touch': {
        for (const rt of this.sensors.values()) {
          if (rt.cfg.wallId === args.wallId && rt.driver instanceof SimDriver) rt.driver.touch(String(args.id ?? 'ui'), Number(args.x), Number(args.y), !!args.down);
        }
        return {};
      }

      case 'zone.fire': {
        // test a receiver without touching the wall: the zone goes active for a moment (enter … exit)
        this.zones.fire(String(args.id), performance.now());
        this.log.info(`zone ${args.id} fired (test)`);
        return {};
      }

      case 'output.test': {
        const o = P.outputs.find((x) => x.id === args.id);
        if (!o) throw new Error('unknown output');
        this.outputs.test(o);
        return {};
      }

      case 'sensor.discover': {
        // never probe a unit we are streaming from: any request would interrupt its data
        const running = [...this.sensors.values()].filter((rt) => rt.cfg.driver === 's2e' && rt.status.state === 'scanning').map((rt) => rt.cfg.host);
        const found = await discover({ skip: running });
        const byHost = new Map(this.profile.sensors.filter((s) => s.driver === 's2e').map((s) => [s.host, s.id]));
        this.log.info(`discovery: ${found.length} unit(s) answered${running.length ? `, ${running.length} running sensor(s) not probed` : ''}`);
        return {
          found: found.map((f) => ({ ...f, usedBy: byHost.get(f.host) || null, factoryDefault: f.host === '192.168.11.2' })),
          running: running.map((h) => ({ host: h, usedBy: byHost.get(h) })),
        };
      }
      case 'sensor.setIp': {
        const r = await setStaticIp({ host: args.host, ip: args.ip, mask: args.mask, gw: args.gw });
        this.log.warn(`static IP of ${args.host} set to ${r.ip} (experimental command) — the unit resets`);
        return r;
      }

      case 'sensor.autoAlign': {
        const rt = this.sensors.get(args.id);
        if (!rt) throw new Error('unknown or disabled sensor');
        const wall = this.profile.walls.find((w) => w.id === rt.cfg.wallId);
        const pts = this._staticPoints(rt);
        const r = autoAlign(pts, rt.cfg.pose, wall);
        if (r.ok) this.log.info(`auto-align ${rt.cfg.id}: x ${r.pose.x} y ${r.pose.y} rot ${r.pose.rotation}° (${r.xFrom})${r.measuredWidth ? `, wall measures ${r.measuredWidth} m` : ''}`);
        return { ...r, usedBackground: !!rt.pipeline.bg };
      }

      case 'sensor.levelCheck': {
        const rt = this.sensors.get(args.id);
        if (!rt) throw new Error('unknown or disabled sensor');
        const wall = this.profile.walls.find((w) => w.id === rt.cfg.wallId);
        // Live data (last ≈ 0.5 s), not the stored background: the operator re-checks right after adjusting the
        // bracket, when the background is already stale.
        const live = rt.pipeline.recentStatic();
        if (!live) throw new Error('no data from this sensor yet');
        const binDeg = rt.pipeline.p.binDeg;
        const r = levelCheck(backgroundPoints(live, binDeg), rt.pipeline.matrix, wall);
        let bgStaleBins = 0;
        const bg = rt.pipeline.bg;
        if (bg?.length === live.length) {
          const flags = new Uint8Array(live.length);
          for (let b = 0; b < live.length; b++) if (bg[b] > 0 && live[b] > 0 && Math.abs(bg[b] - live[b]) > Math.max(100, 0.03 * bg[b])) flags[b] = 1;
          bgStaleBins = changedRuns(flags).bins;
        }
        const bgStale = bgStaleBins >= 8; // ≥ 2° of the scan no longer matches the stored background
        if (bgStale) r.advice.push('The stored background no longer matches what the sensor sees (sensor moved, or something on the wall): capture the background again with the wall clear.');
        this.log.info(`level check ${rt.cfg.id}: ${r.ok ? 'ok' : r.advice.join(' ')}`);
        return { ...r, sensorId: rt.cfg.id, wallId: wall.id, source: 'live', bgStale, calibrated: rt.pipeline.calibrated };
      }

      case 'sensor.restart': {
        const rt = this.sensors.get(args.id);
        if (!rt) throw new Error('unknown or disabled sensor');
        await rt.driver.stop();
        rt.driver.start();
        return {};
      }

      case 'projection.set': {
        const pr = this.settings.projection;
        if (args.mode && ['off', 'identify', 'debug'].includes(args.mode)) pr.mode = args.mode;
        if ('displayId' in args) pr.displayId = args.displayId;
        if ('open' in args) pr.open = !!args.open;
        this.store.saveSettings(this.settings);
        this.emit('projection', pr);
        this.emit('state');
        return {};
      }

      case 'app.autostart': {
        this.settings.autostart = !!args.enabled;
        this.store.saveSettings(this.settings);
        this.emit('autostart', this.settings.autostart);
        this.emit('state');
        return {};
      }

      case 'rec.start': {
        if (this.replay) throw new Error('stop the replay first');
        if (this.recorder) throw new Error('already recording');
        this.recorder = new Recorder(this.recDir, this.profile, this.log, args.name);
        this.log.info(`recording raw sensor data → ${path.basename(this.recorder.file)}`);
        return { file: path.basename(this.recorder.file) };
      }
      case 'rec.stop': {
        if (!this.recorder) return {};
        const f = await this.recorder.stop();
        this.recorder = null;
        return { file: path.basename(f) };
      }
      case 'rec.list': {
        const list = listRecordings(this.recDir);
        for (const r of list.slice(0, 30)) { try { const hd = await readHeader(path.join(this.recDir, r.file)); r.profile = hd.profileName; r.sensors = hd.sensors; } catch { r.error = 'unreadable'; } }
        return { recordings: list };
      }
      case 'rec.delete': {
        const f = this._recFile(args.file);
        if (this.replay?.file === args.file) throw new Error('stop the replay first');
        fs.rmSync(f);
        return {};
      }
      case 'replay.start': {
        if (this.recorder) throw new Error('stop the recording first');
        const f = this._recFile(args.file);
        const hd = await readHeader(f);
        const missing = this.profile.sensors.filter((s) => !hd.sensors.includes(s.id)).map((s) => s.id);
        this._stopReplay(false);
        const source = new ReplaySource(f, { loop: args.loop !== false });
        this.replay = { file: args.file, source };
        source.on('end', () => { if (this.replay?.source === source) { this.log.info('replay finished'); this._stopReplay(); } });
        source.start().catch((e) => { this.log.error(`replay: ${e.message}`); this._stopReplay(); });
        this._activate(this.profile);
        this.log.info(`replaying ${args.file}${missing.length ? ` (no data for ${missing.join(', ')})` : ''}`);
        return { sensors: hd.sensors, missing };
      }
      case 'replay.stop': this._stopReplay(); return {};

      case 'logs.get': return { entries: this.log.recent() };
      case 'net.firewall': return firewallStatus(this.port || this.settings.httpPort);
      case 'net.localName': {
        const name = String(args.name || '').trim().toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw new Error('local name: letters, digits and hyphens only (1–63), no dots');
        if (this.mdns) await this.mdns.rename(name);
        this.settings.localName = name;
        this.store.saveSettings(this.settings);
        this.emit('state');
        return { host: `${name}.local` };
      }
      case 'net.fixFirewall': {
        if (!args.__local) throw new Error('run this from the server itself (Windows asks for administrator rights there)');
        await fixFirewall(this.port || this.settings.httpPort);
        this.log.info('firewall rule added for the UI port');
        return firewallStatus(this.port || this.settings.httpPort);
      }
      default: throw new Error(`unknown command ${op}`);
    }
  }

  get recDir() { return path.join(this.store.dir, 'recordings'); }

  _recFile(name) {
    if (typeof name !== 'string' || !/^[\w.-]+\.vtrec\.gz$/.test(name)) throw new Error('invalid recording name');
    const f = path.join(this.recDir, name);
    if (!fs.existsSync(f)) throw new Error('recording not found');
    return f;
  }

  _stopReplay(reactivate = true) {
    if (!this.replay) return;
    this.replay.source.stop();
    this.replay = null;
    if (reactivate) { this._activate(this.profile); this.log.info('replay stopped — live sensors again'); }
  }

  _sensorIds(args) {
    if (args.sensorId) return [args.sensorId];
    if (args.sensorIds) return args.sensorIds;
    if (args.wallId) return this.profile.sensors.filter((s) => s.wallId === args.wallId).map((s) => s.id);
    return this.profile.sensors.map((s) => s.id);
  }

  _captureBackground(args) {
    const frames = Math.max(5, Math.min(100, Number(args.frames) || 20));
    const ids = this._sensorIds(args).filter((id) => this.sensors.has(id));
    if (!ids.length) throw new Error('no running sensor to capture');
    for (const id of ids) {
      const rt = this.sensors.get(id);
      const job = { frames, done: () => (rt.pipeline.learning ? rt.pipeline.learning.samples.length : frames) };
      this.bgJobs.set(id, job);
      rt.bgMotion = null;
      rt.pipeline.learnBackground(frames, (dist, motion) => {
        this.bgJobs.delete(id);
        rt.bgMotion = motion;
        this.store.saveBackground(this.profile.id, id, { binDeg: this.profile.processing.binDeg, dist, at: new Date().toISOString() });
        if (motion) this.log.warn(`background ${id}: movement during the capture near ${motion.where.map((w) => `(${w.x}, ${w.y}) m`).join(', ')} — repeat it with the wall clear`);
        else this.log.info(`background captured for ${id} (${frames} revolutions)`);
        this._saveSensorFlags();
      });
    }
    return { sensors: ids, frames };
  }

  _saveSensorFlags() {
    const prof = structuredClone(this.profile);
    let changed = false;
    for (const s of prof.sensors) {
      const has = !!this.sensors.get(s.id)?.pipeline.bg;
      if (s.hasBackground !== has) { s.hasBackground = has; changed = true; }
    }
    if (changed) this._activate(this.store.saveProfile(prof));
    else this.emit('state');
  }

  _startCalibration(args) {
    const wall = this.profile.walls.find((w) => w.id === args.wallId);
    if (!wall) throw new Error('unknown wall');
    const ids = this.profile.sensors.filter((s) => s.wallId === wall.id && this.sensors.has(s.id)).map((s) => s.id);
    if (!ids.length) throw new Error('this wall has no running sensor');
    this.verify = null;
    const missingBg = ids.filter((id) => !this.sensors.get(id).pipeline.bg);
    if (missingBg.length && !args.force) throw new Error(`capture the background first (${missingBg.join(', ')})`);
    const targets = Array.isArray(args.targets) && args.targets.length >= 3 ? args.targets : defaultTargets(wall, args);
    this.calib = new CalibrationSession(wall, ids, targets, { holdMs: args.holdMs ?? 700 });
    this._setOwner(args.__client);
    this.trackers.get(wall.id)?.clear();
    this.log.info(`calibration started on ${wall.id} with ${targets.length} targets (${ids.join(', ')})${args.__client ? ` from ${args.__client.device}` : ''}`);
    this.emit('state');
    return { targets: targets.length };
  }

  // ------------------------------------------------------------------ control of a calibration session

  /** The device driving the running session (null when none runs or it was started without a device). */
  _owner() {
    if (!this.calib && !this.verify) this.control = null;
    return this.control;
  }

  _setOwner(who) {
    this.control = who ? { id: who.id, device: who.device || 'a device', addr: who.addr || '', since: Date.now(), gone: false } : null;
  }

  _takeControl(who, why = '') {
    const prev = this.control;
    this._setOwner(who);
    this.log.info(`control of the calibration taken by ${this.control.device}${prev && prev.id !== who.id ? ` from ${prev.device}` : ''}${why ? ` (${why})` : ''}`);
    this.emit('state');
  }

  /** The server tells us a UI device went away: if it was driving, anyone may take over (the session keeps running). */
  clientGone(id) {
    if (this.control?.id !== id || this.control.gone) return;
    this.control.gone = true;
    if (this._owner()) this.log.warn(`${this.control.device} disconnected during the calibration — any device can continue it`);
  }

  _cancelCalibration() {
    if (!this.calib) return;
    this.log.info(`calibration on ${this.calib.wall.id} cancelled`);
    this.calib = null;
    this.emit('state');
  }

  _applyCalibration() {
    const c = this.calib;
    if (!c || c.phase !== 'done' || !c.result) throw new Error('calibration not finished');
    const prof = structuredClone(this.profile);
    const at = new Date().toISOString();
    const applied = [];
    for (const s of prof.sensors) {
      const r = c.result[s.id];
      if (r?.ok) { s.calibration = { matrix: r.matrix, kind: r.kind, rmsMm: r.rmsMm, maxMm: r.maxMm, points: r.points, at }; applied.push(s.id); }
    }
    this.calib = null;
    this._activate(this.store.saveProfile(prof));
    this.log.info(`calibration applied to ${applied.join(', ') || 'no sensor'}`);
    return { applied };
  }
}

const r4 = (v) => Math.round(v * 10000) / 10000;

/** Commands only the device driving a calibration / verification may send while it runs. */
const CONTROL_OPS = new Set([
  'calib.start', 'calib.skip', 'calib.back', 'calib.cancel', 'calib.redo', 'calib.apply', 'calib.clear', 'verify.start', 'verify.cancel',
  'profile.update', 'profile.load', 'profile.create', 'profile.import', 'profile.delete', 'profile.restore',
  'bg.capture', 'bg.clear', 'sensor.autoAlign', 'sensor.setIp', 'sensor.restart', 'replay.start', 'replay.stop', 'app.lock',
]);

/** Commands refused while the room is locked (Show mode). */
const LOCKED_OPS = new Set([
  'profile.update', 'profile.load', 'profile.create', 'profile.import', 'profile.delete', 'profile.restore',
  'bg.capture', 'bg.clear', 'calib.start', 'calib.apply', 'calib.clear', 'verify.start', 'sensor.autoAlign',
  'replay.start', 'rec.delete', 'sensor.discover', 'sensor.setIp',
]);
