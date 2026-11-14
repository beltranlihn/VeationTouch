// The engine: owns the active room profile and runs sensors → pipelines → trackers →
// zones → outputs. Runs standalone (`node engine/main.js`) or inside Electron's
// utilityProcess. Everything the UI can do goes through `command()`.

import { EventEmitter } from 'node:events';
import { S2EDriver } from './drivers/s2e.js';
import { SimDriver } from './drivers/sim.js';
import { SensorPipeline } from './core/pipeline.js';
import { WallTracker } from './core/tracker.js';
import { ZoneEngine, BurstMeter } from './core/zones.js';
import { CalibrationSession, defaultTargets } from './core/calibration.js';
import { OutputManager } from './outputs/outputs.js';
import { normalizeProfile, blankProfile, wallToUv } from './profile.js';

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
    this.burst = new BurstMeter(300);
    this.outputs = new OutputManager(log);
    this.calib = null;
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
      const t = this.trackers.get(w.id);
      if (t) { t.wall = w; t.configure(profile.tracking); } else this.trackers.set(w.id, new WallTracker(w, profile.tracking, this.ids));
    }
    for (const id of [...this.trackers.keys()]) if (!profile.walls.some((w) => w.id === id)) this.trackers.delete(id);

    // sensors: restart a driver only if its connection settings changed
    const driverKey = (s) => JSON.stringify([s.driver, s.host, s.port, s.scanMode, s.motorRpm, s.enabled, s.wallId, s.driver === 'sim' ? s.pose : 0]);
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
        const driver = s.driver === 'sim'
          ? new SimDriver({ id: s.id, wall, pose: s.pose, wanderers: profile.simulation.wanderers }, this.log)
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
        if (rt.driver instanceof SimDriver) rt.driver.setWanderers(profile.simulation.wanderers);
      }
    }
    this.zones.configure(profile.zones);
    this.outputs.configure(profile);
    if (this.calib && !profile.walls.some((w) => w.id === this.calib.wall.id)) this.calib = null;
    this.emit('state');
  }

  // ------------------------------------------------------------------ data path

  _onScan(rt, scan) {
    const wallId = rt.cfg.wallId;
    const calibrating = this.calib && this.calib.wall.id === wallId && this.calib.sensorIds.includes(rt.cfg.id);
    const res = rt.pipeline.process(scan, { raw: calibrating, viz: this.listenerCount('viz') > 0 });
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
    const walls = [], events = [];
    const byWall = {};
    for (const w of this.profile.walls) {
      const tr = this.trackers.get(w.id);
      if (!tr) continue;
      const r = tr.tick(t0);
      walls.push({ wall: w, touches: r.touches });
      byWall[w.id] = r.touches;
      events.push(...r.events);
    }
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
      events: frame.events.map((e) => ({ ...e, t: Math.round(e.t), x: r4(e.x), y: r4(e.y) })),
      zones: frame.zoneCounts, zoneEvents: frame.zoneEvents.map((e) => ({ ...e, t: Math.round(e.t) })),
      room: { count: frame.roomCount, burst: frame.burst },
    };
  }

  // ------------------------------------------------------------------ snapshots for the UI

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
        calibrated: rt.pipeline.calibrated,
      };
    }
    return {
      type: 'status', sensors, outputs: this.outputs.snapshot(),
      engine: { fps: this.tickStats.fps, tickMaxMs: Math.round((this.tickStats.lastMax || 0) * 100) / 100, uptime: Math.round((Date.now() - this.startedAt) / 1000), rss: Math.round(process.memoryUsage().rss / 1048576) },
      calib: this.calib ? this.calib.snapshot(now) : null,
    };
  }

  state() {
    return {
      type: 'state', rev: this.rev, version: this.version, profile: this.profile, profiles: this.store.listProfiles(),
      projection: this.settings.projection, displays: this.displays, autostart: this.settings.autostart,
    };
  }

  setDisplays(list) { this.displays = list || []; this.emit('state'); }

  // ------------------------------------------------------------------ commands

  async command(op, args = {}) {
    const P = this.profile;
    switch (op) {
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
        const base = args.from && args.from !== 'blank' ? this.store.loadProfile(args.from) : blankProfile(args.name);
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
          this.store.deleteBackground(P.id, id);
        }
        this._saveSensorFlags();
        return {};
      }

      case 'calib.start': return this._startCalibration(args);
      case 'calib.skip': this.calib?.skip(); return {};
      case 'calib.back': this.calib?.redoPrevious(); return {};
      case 'calib.cancel': this._cancelCalibration(); return {};
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

      case 'output.test': {
        const o = P.outputs.find((x) => x.id === args.id);
        if (!o) throw new Error('unknown output');
        this.outputs.test(o);
        return {};
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

      case 'logs.get': return { entries: this.log.recent() };
      default: throw new Error(`unknown command ${op}`);
    }
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
      rt.pipeline.learnBackground(frames, (dist) => {
        this.bgJobs.delete(id);
        this.store.saveBackground(this.profile.id, id, { binDeg: this.profile.processing.binDeg, dist, at: new Date().toISOString() });
        this.log.info(`background captured for ${id} (${frames} revolutions)`);
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
    const missingBg = ids.filter((id) => !this.sensors.get(id).pipeline.bg);
    if (missingBg.length && !args.force) throw new Error(`capture the background first (${missingBg.join(', ')})`);
    const targets = Array.isArray(args.targets) && args.targets.length >= 3 ? args.targets : defaultTargets(wall, args);
    this.calib = new CalibrationSession(wall, ids, targets, { holdMs: args.holdMs ?? 700 });
    this.trackers.get(wall.id)?.clear();
    this.log.info(`calibration started on ${wall.id} with ${targets.length} targets (${ids.join(', ')})`);
    this.emit('state');
    return { targets: targets.length };
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
