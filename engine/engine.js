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
import { verifyPassMm, poseMatrix, apply } from './core/geometry.js';
import { OutputManager } from './outputs/outputs.js';
import { overlayOf } from './core/mask.js';
import { normalizeProfile, blankProfile, wallToUv, OUTPUT_SCALES, OUTPUT_FPS, OUTPUT_BLENDS, OUTPUT_LAYERS, TOUCH_LAYER_SCALES, normRoomOutput, normAudio, AUDIO_MAX_CHANNELS } from './profile.js';
import { firewallStatus, fixFirewall, setInterfaceAddress, openHotspotSettings } from './net.js';
import { autoAlign, backgroundPoints } from './core/autoalign.js';
import { levelCheck } from './core/levelcheck.js';
import { Recorder, ReplaySource, ReplayDriver, listRecordings, readHeader } from './record.js';
import { discover, candidateHosts, factoryNetwork, readdress, unconfiguredInterfaces, suggestAddresses, onNetwork, SERVER_SENSOR_IP, FACTORY_IP, READDRESS_WAIT_MS } from './discover.js';
import { lanInterfaces } from './mdns.js';
import { CloudLink, normalizeRelayUrl } from './cloud.js';
import { cloudSettings } from './store.js';
import { scanCatalog, publicCatalog, checkParam, visualOnly, soundOnly } from './experiences.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TICK_HZ = 60;
const EXPERIENCES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'experiences');

export class Engine extends EventEmitter {
  /**
   * @param {{store: import('./store.js').Store, log: object, version: string, experienceDirs?: string[]}} deps
   *   experienceDirs: extra folders of experiences to list after the app's own `experiences/` (tests)
   */
  constructor({ store, log, version, experienceDirs = [] }) {
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
    this.fit = null;            // Fit from the calibration remote {wallId, node, client}: the projection highlights that mesh point
    this.bgJobs = new Map();    // sensorId → {done, frames}
    this.seq = 0;
    this.startedAt = Date.now();
    this.displays = [];
    // internet access: outbound link to the relay (off unless settings.cloud.enabled)
    this.cloud = new CloudLink({ cfg: this.settings.cloud, log, version, port: () => this.port || this.settings.httpPort, token: () => this.settings.token, name: () => this.profile?.name || '' });
    this.cloud.on('change', () => this.emit('state'));
    this.on('state', () => this.cloud.refreshName());
    this.experienceDirs = [EXPERIENCES_DIR, ...experienceDirs];
    this.catalog = [];          // experiences found on disk (engine/experiences.js)
    this.exp = { fps: 0, error: null };                  // how the experience layer's page is doing (transient, never saved)
    this.out = { fps: 0, error: null, previewAt: null }; // how the room output's window is doing, as the desktop app reports it
    this.outPreview = null;     // the last JPEG of the whole output: { buf, at } (from the desktop app, 1 per second)
    // room audio (transient, never saved): what the audio window last reported, the test tone asked for, whether the sound piece plays
    this.aud = { report: null, at: 0, test: null, testSeq: 0, playing: false, error: null };
    this._audKey = 'null';
    this._outKey = 'null';
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
    this.catalog = scanCatalog(this.experienceDirs, this.log);
    this._activate(prof);
    const x = this.profile.experience;
    if (x.autostart && x.id && this._visual().some((e) => e.id === x.id)) { this._experienceRun(); this.log.info(`experience "${x.id}" started with the app`); }
    else if (this.profile.output.on) this.log.info(`room output "${this.profile.output.senderName}" on`);
    this._soundAutostart();
    this._timer = setInterval(() => this._tick(), 1000 / TICK_HZ);
    this._audTimer = setInterval(() => this._audioWatch(), 1000);
    this._audTimer.unref?.();
    this.log.info(`engine ${this.version} started with profile "${prof.name}"`);
    if (this.settings.cloud.enabled) this.cloud.apply();
  }

  async stop() {
    clearInterval(this._timer);
    clearInterval(this._audTimer);
    this._flushExperience();
    this.cloud.stop();
    if (this.recorder) await this.recorder.stop().catch(() => {});
    if (this.replay) this.replay.source.stop();
    await Promise.all([...this.sensors.values()].map((s) => s.driver.stop().catch(() => {})));
    this.outputs.close();
  }

  // ------------------------------------------------------------------ profile activation

  _activate(profile) {
    const prev = this.profile;
    // a pending save of the experience's settings: the new profile already carries them (same room), or they are
    // written to the room being left
    if (this._expSave) { if (prev && prev.id !== profile.id) this._flushExperience(prev); else this._cancelExperienceSave(); }
    this.profile = profile;
    this.rev = (this.rev || 0) + 1;
    if (this.settings.activeProfile !== profile.id) { this.settings.activeProfile = profile.id; this.store.saveSettings(this.settings); }

    // trackers (a different room starts from scratch)
    if (prev && prev.id !== profile.id) { this.trackers.clear(); this.corners.reset(); this.fit = null; }
    if (this.fit && !profile.walls.some((w) => w.id === this.fit.wallId)) this.fit = null;
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
        if (rt.driver instanceof SimDriver) rt.driver.setPlane(profile.simulation.planes[s.id]);
      }
    }
    this._syncWanderers();
    this.zones.configure(profile.zones, profile.walls);
    this._syncTextureWindows();
    if (prev && prev.id !== profile.id) { // another room: its own experience (it runs only if that room starts it with the app)
      this.exp = { fps: 0, error: null }; this.out = { fps: 0, error: null, previewAt: null }; this.outPreview = null;
      if (profile.experience.autostart && this._visual().some((e) => e.id === profile.experience.id)) this._experienceRun();
      this.aud = { report: null, at: 0, test: null, testSeq: this.aud.testSeq, playing: false, error: null }; // another room: its own sound
      this._soundAutostart();
    }
    this._syncOutputWindow();
    this._syncAudioWindow();
    this.outputs.configure(profile);
    if (this.calib && !profile.walls.some((w) => w.id === this.calib.wall.id)) this.calib = null;
    if (this.verify && !profile.walls.some((w) => w.id === this.verify.wall.id)) this.verify = null;
    this.emit('state');
  }

  // ------------------------------------------------------------------ data path

  _onScan(rt, scan) {
    const wallId = rt.cfg.wallId;
    const calibrating = this.calib && this.calib.wall.id === wallId && this.calib.sensorIds.includes(rt.cfg.id);
    // raw (no ROI/masks) while calibrating or checking the side: the pose being checked may still be wrong
    const res = rt.pipeline.process(scan, { raw: calibrating || !!rt.sideCheck, viz: this.listenerCount('viz') > 0 });
    rt.lastScan = scan;
    if (this.recorder && !this.replay) this.recorder.write(scan);
    rt.viz = res.viz;
    rt.rejected = res.rejected;
    rt.lastDetections = res.detections;
    rt.scans = (rt.scans || 0) + 1;
    if (calibrating) {
      this.calib.feed(rt.cfg.id, res.detections, scan.t);
      // where the hand IS on this wall, for the wall's own feedback (live.calibHands): the raw detections, in wall metres
      (this.calibHands ??= new Map()).set(rt.cfg.id, { wallId, at: performance.now(), dets: res.detections.map((d) => [d.x, d.y, d.size]) });
      return;
    }
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
    if (this.verify) {
      this.verify.feed(byWall[this.verify.wall.id] || [], t0);
      if (this.verify.phase === 'done' && !this.verify.saved) { const v = this.verify; v.saved = true; setImmediate(() => this._saveVerification(v)); } // not mid-frame
    }
    const z = this.zones.update(byWall, t0);
    this.burst.add(events);
    const frame = {
      seq: ++this.seq, t: t0, walls, events, zoneEvents: z.events, zoneCounts: z.counts,
      roomCount: walls.reduce((a, w) => a + w.touches.length, 0), burst: this.burst.value(t0),
      // the calibration pattern the Texture outputs draw on top (grid on, or a calibration / verification / Fit running)
      overlay: overlayOf({
        grid: !!this.grid, calib: this.calib ? this.calib.snapshot(t0) : null,
        verify: this.verify ? this.verify.snapshot(t0) : null, fit: this.fit ? { wallId: this.fit.wallId, node: this.fit.node } : null,
      }),
    };
    this.outputs.send(frame, t0);
    this.lastFrame = frame;
    this.emit('frame', frame);
    const s = this.tickStats;
    s.n++; s.maxMs = Math.max(s.maxMs, performance.now() - t0);
    if (t0 - s.t0 >= 1000) { s.fps = Math.round((s.n * 1000) / (t0 - s.t0)); s.n = 0; s.t0 = t0; s.lastMax = s.maxMs; s.maxMs = 0; }
  }

  /**
   * The raw detections of the sensors of the wall being calibrated — what the tracker does NOT get meanwhile — as
   * `{ [wallId]: [[x, y, size], …] }` in wall metres, 3 decimals; null when no calibration runs. A sensor that stopped
   * reporting (its last revolution is older than 400 ms) contributes nothing. Sent in the live message as `calibHands`.
   */
  calibHandsSnapshot(now = performance.now()) {
    if (!this.calib) { this.calibHands?.clear(); return null; }
    const out = {};
    for (const h of this.calibHands?.values() || []) {
      if (now - h.at > 400 || !h.dets.length) continue;
      (out[h.wallId] ??= []).push(...h.dets.map(([x, y, sz]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(sz * 1000) / 1000]));
    }
    return out;
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
      notice: this.notice && Date.now() - this.notice.at < 20000 ? this.notice : null, // "your session was cancelled from another device"
      recording: this.recorder ? { file: path.basename(this.recorder.file), seconds: Math.round(this.recorder.elapsed / 1000), frames: this.recorder.frames, mb: Math.round(this.recorder.bytes / 1e5) / 10 } : null,
      replay: this.replay ? { file: this.replay.file, pos: Math.round(this.replay.source.pos / 1000), duration: Math.round(this.replay.source.duration / 1000), from: this.replay.source.header?.profileName || null } : null,
    };
  }

  state() {
    return {
      type: 'state', rev: this.rev, version: this.version, profile: this.profile, profiles: this.store.listProfiles(),
      // fit: the mesh point the calibration remote is moving, highlighted by the projection (never saved)
      // walk: the remote's walk test is open — the projection shows what the outputs send, on every wall (never saved)
      projection: { ...this.settings.projection, fit: this.fit ? { wallId: this.fit.wallId, node: this.fit.node } : null, walk: !!this.walk },
      // grid: the metre grid (pixel map) is on the walls — projection page and Texture outputs (never saved)
      grid: !!this.grid,
      experience: this.experienceState(),
      output: this.outputState(),
      experiences: publicCatalog(this._visual()),   // pieces that draw …
      sounds: publicCatalog(this._sounds()),        // … and pieces that make sound, apart
      audio: this.audioState(),
      displays: this.displays, autostart: this.settings.autostart,
      locked: !!this.settings.locked,
      cloud: this.cloud.status(), // never the secret
      localName: this.mdns ? { ...this.mdns.info(), port: this.port || null } : null,
      underlay: (() => { const u = this.store.underlayInfo(this.profile.id); return u ? { url: `/api/underlay?p=${encodeURIComponent(this.profile.id)}&v=${u.v}` } : null; })(),
    };
  }

  setDisplays(list) { this.displays = list || []; this.emit('state'); }

  // ------------------------------------------------------------------ commands

  async command(op, args = {}) {
    const P = this.profile;
    // SHOW mode: the room is locked against edits; operation commands keep working.
    if (this.settings.locked && LOCKED_OPS.has(op)) this._refuse(args.__client, op, 'the room is locked (Show mode) — unlock it first');
    // While a calibration / verification runs, ONE device drives it and the others are view-only (they can take over).
    // `__client` is set by the server, never by the client; commands without it (tests, the engine itself) pass.
    const who = args.__client;
    const owner = this._owner();
    if (who && owner && CONTROL_OPS.has(op) && owner.id !== who.id) {
      if (owner.gone) this._takeControl(who, 'the device that was calibrating disconnected');
      else this._refuse(who, op, `calibration in progress on ${owner.device} — take control on this device to make changes`);
    }
    // Discarding / leaving a session is allowed from ANY paired device (the way out must never be blocked);
    // the device that was driving it is told (status.notice).
    if (who && owner && !owner.gone && owner.id !== who.id && (op === 'calib.cancel' || op === 'verify.cancel') && (this.calib || this.verify)) {
      const what = this.calib ? 'calibration' : 'verification';
      this.log.info(`${what} cancelled from ${who.device || 'a device'} (it was driven by ${owner.device})`);
      this.notice = { to: owner.id, text: `The ${what} was cancelled from ${who.device || 'another device'}.`, at: Date.now() };
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
        if (this.settings.locked) { this._cancelCalibration(); this.verify = null; this._syncWanderers(); }
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
        // a verification measured one mapping and one calibration: when either changes, it no longer holds
        for (const w of next.walls) {
          const was = P.walls.find((x) => x.id === w.id);
          const cal = (p, id) => JSON.stringify(p.sensors.filter((s) => s.wallId === id).map((s) => s.calibration));
          if (!was || JSON.stringify(was.mapping) !== JSON.stringify(w.mapping) || cal(P, w.id) !== cal(next, w.id)) w.verified = null;
        }
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
      case 'calib.arm': { // any paired device: "I am at the wall" (not a control command)
        if (!this.calib) throw new Error('no calibration running');
        this.calib.arm(`armed from ${who?.device || 'the engine'}`);
        return { armed: true };
      }
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
        this.verify = new VerifySession(wall, verifyTargets(wall, args), { log: this.log });
        this._setOwner(who);
        this._syncWanderers();
        this.log.info(`verification started on ${wall.id}${who ? ` from ${who.device}` : ''}`);
        this.emit('state');
        return { targets: this.verify.targets.length };
      }
      case 'verify.cancel': {
        if (this.verify) this.log.info(`verification on ${this.verify.wall.id} closed${this.verify.summary() ? ` — mean ${this.verify.summary().meanMm} mm, max ${this.verify.summary().maxMm} mm` : ''}`);
        this.verify = null;
        this._syncWanderers();
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
        const s2e = this.profile.sensors.filter((s) => s.driver === 's2e');
        // only the networks where the sensors are (factory address + the profile's S2E hosts), unless asked for every one
        const everywhere = args?.everywhere === true;
        const hosts = candidateHosts({ sensorHosts: s2e.map((s) => s.host), everywhere });
        const found = await discover({ skip: running, hosts });
        const byHost = new Map(s2e.map((s) => [s.host, s.id]));
        this.log.info(`discovery: ${found.length} unit(s) answered${running.length ? `, ${running.length} running sensor(s) not probed` : ''}`);
        const network = factoryNetwork(lanInterfaces()); // can this PC reach a factory-new unit at all?
        // the address each wall's unit should get: the one its sensor in the profile is waiting on (nothing answers
        // there yet), otherwise the next free one (.11, .12…) on the sensor network
        const answering = new Set([...found.map((f) => f.host), ...running]);
        const waiting = new Map(this.profile.walls.map((w) => [w.id, s2e.find((s) => s.wallId === w.id && s.host !== FACTORY_IP && !answering.has(s.host)
          && (!network.via || onNetwork(network.via, s.host)))]).filter(([, s]) => s));
        const auto = suggestAddresses(this.profile.walls.filter((w) => !waiting.has(w.id)).map((w) => w.id), network.via, [...answering, ...s2e.map((s) => s.host)]);
        const suggest = Object.fromEntries(this.profile.walls.map((w) => [w.id, waiting.has(w.id) ? { ip: waiting.get(w.id).host, sensorId: waiting.get(w.id).id } : { ip: auto[w.id], sensorId: null }]));
        return {
          found: found.map((f) => ({ ...f, usedBy: byHost.get(f.host) || null, factoryDefault: f.host === FACTORY_IP })),
          running: running.map((h) => ({ host: h, usedBy: byHost.get(h) })),
          network: { ...network, unconfigured: unconfiguredInterfaces(), serverIp: SERVER_SENSOR_IP },
          suggest,
          scope: everywhere ? 'every network' : 'sensor network', searched: hosts.length,
        };
      }
      case 'sensor.readdress': {
        // give a unit a new address and CONFIRM it (it answers there with the same serial); the profile follows it
        const ip = String(args.ip || '').trim(), port = Number(args.port) || 8089;
        if (!/^127\./.test(ip) && !lanInterfaces().some((i) => onNetwork(i, ip))) {
          throw new Error(`this computer has no address on the network of ${ip}: it could not reach the sensor there. Set up its network card first.`);
        }
        // a real S2E takes 10–65 s to come back; one still silent at the end is assigned anyway (`pending`): the sensor
        // runtime keeps trying its new address and starts as soon as it answers
        const r = await readdress({ host: args.host, port, ip, mask: args.mask, gw: args.gw, waitMs: Number(args.waitMs) || READDRESS_WAIT_MS });
        if (r.pending) this.log.warn(`S2E ${r.serial || ''} sent to ${r.ip} (from ${args.host}): not answering yet after ${Math.round(r.ms / 1000)} s — assigned, it connects when it answers`.replace('  ', ' '));
        else this.log.info(`S2E ${r.serial || ''} moved from ${args.host} to ${r.ip} in ${(r.ms / 1000).toFixed(1)} s`.replace('  ', ' '));
        const next = structuredClone(this.profile);
        const a = args.assign || {};
        let s = (a.sensorId && next.sensors.find((x) => x.id === a.sensorId)) || next.sensors.find((x) => x.driver === 's2e' && x.host === args.host);
        const wall = next.walls.find((w) => w.id === (a.wallId || s?.wallId));
        if (!s && wall) {
          let n = 1;
          while (next.sensors.some((x) => x.id === `S${n}`)) n++;
          s = { id: `S${n}`, name: `LiDAR ${wall.id}`, wallId: wall.id, driver: 's2e', pose: { x: wall.width / 2, y: wall.height + 0.3, rotation: -90 } };
          next.sensors.push(s);
        }
        if (s) {
          Object.assign(s, { driver: 's2e', host: r.ip, port, enabled: true, ...(wall ? { wallId: wall.id } : {}) });
          this._activate(this.store.saveProfile(normalizeProfile(next)));
        }
        return { ...r, sensorId: s?.id || null, wallId: s ? (wall?.id || s.wallId) : null };
      }

      case 'sensor.autoAlign': {
        const rt = this.sensors.get(args.id);
        if (!rt) throw new Error('unknown or disabled sensor');
        const wall = this.profile.walls.find((w) => w.id === rt.cfg.wallId);
        const pts = this._staticPoints(rt);
        // `mirror` overrides the approximate pose's side: the empty room looks the same mirrored, so left/right comes
        // from the approximate pose — after a failed Side check the operator aligns again with the other side
        const approx = typeof args.mirror === 'boolean' ? { ...rt.cfg.pose, mirror: args.mirror } : rt.cfg.pose;
        const r = autoAlign(pts, approx, wall);
        if (r.ok) this.log.info(`auto-align ${rt.cfg.id}: x ${r.pose.x} y ${r.pose.y} rot ${r.pose.rotation}°${r.pose.mirror ? ' mirrored' : ''} (${r.xFrom})${r.measuredWidth ? `, wall measures ${r.measuredWidth} m` : ''}`);
        return { ...r, usedBackground: !!rt.pipeline.bg };
      }

      case 'sensor.sideCheck': {
        // Which side is left? A hand held near the LEFT end of the wall, mapped with the pose being checked
        // (args.pose, else the sensor's): it must come out on the left half. Only that sensor's own data is used.
        const rt = this.sensors.get(args.id);
        if (!rt) throw new Error('unknown or disabled sensor');
        if (rt.status.state !== 'scanning') throw new Error(`${rt.cfg.id} is not scanning`);
        const wall = this.profile.walls.find((w) => w.id === rt.cfg.wallId);
        const pose = args.pose && Number.isFinite(args.pose.x) ? args.pose : rt.cfg.pose;
        const M = poseMatrix(pose);
        const xs = [];
        let seen = rt.scans || 0;
        const until = Date.now() + Math.min(Number(args.timeoutMs) || 20000, 30000);
        rt.sideCheck = true;
        try {
          while (Date.now() < until && xs.length < 6) {
            await new Promise((r) => setTimeout(r, 40));
            if ((rt.scans || 0) === seen) continue;
            seen = rt.scans;
            const d = rt.lastDetections || [];
            if (d.length === 1) xs.push(apply(M, d[0].sx, d[0].sy)[0]); else xs.length = 0; // one hand, held still
          }
        } finally { rt.sideCheck = false; }
        if (xs.length < 6) throw new Error(`no hand seen on ${wall.id} — hold ONE hand flat on the wall near its left end (seen from the room) and press again`);
        xs.sort((a, b) => a - b);
        const x = Math.round(xs[3] * 100) / 100;
        const side = x < wall.width / 3 ? 'left' : x > (2 * wall.width) / 3 ? 'right' : 'middle';
        this.log.info(`side check ${rt.cfg.id}: hand at x ${x} m of ${wall.width} m → ${side}${side === 'right' ? ' (mirrored)' : ''}`);
        return { x, side, width: wall.width, mirror: !!pose.mirror };
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
        const only = () => !('fit' in args) && !args.mode && !('displayId' in args) && !('open' in args);
        if ('grid' in args) {
          this.grid = args.grid ? { client: args.__client?.id ?? null } : null;
          if (only() && !('walk' in args)) { this.emit('state'); return {}; }
        }
        if ('walk' in args) {
          this.walk = args.walk ? { client: args.__client?.id ?? null } : null;
          if (only()) { this.emit('state'); return {}; }
        }
        if ('fit' in args) {
          // Fit, from the calibration remote: the projection draws that wall's mesh and highlights one point
          const f = args.fit;
          this.fit = f && this.profile.walls.some((w) => w.id === f.wallId)
            ? { wallId: f.wallId, node: Number.isInteger(f.node) && f.node >= 0 ? f.node : null, client: args.__client?.id ?? null } : null;
          this._syncWanderers();
          if (!args.mode && !('displayId' in args) && !('open' in args)) { this.emit('state'); return {}; }
        }
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
      case 'cloud.status': return this.cloud.status();
      case 'cloud.set': {
        if (!args.__local) throw new Error('internet access is switched on or off at the server itself');
        const c = this.settings.cloud;
        const relayUrl = args.relayUrl !== undefined ? normalizeRelayUrl(args.relayUrl) : c.relayUrl;
        const launcherUrl = args.launcherUrl !== undefined ? (String(args.launcherUrl).trim() ? normalizeRelayUrl(args.launcherUrl) : '') : c.launcherUrl;
        const enabled = args.enabled !== undefined ? !!args.enabled : c.enabled;
        if (enabled && !relayUrl) throw new Error('enter the relay address first');
        const relink = enabled !== c.enabled || relayUrl !== c.relayUrl; // a new public-link base alone keeps the connection
        Object.assign(c, { relayUrl, launcherUrl, enabled });
        this.store.saveSettings(this.settings);
        if (relink) { this.log.info(c.enabled ? `internet access on (${c.relayUrl})` : 'internet access off'); this.cloud.apply(); }
        this.emit('state');
        return this.cloud.status();
      }
      case 'cloud.reset': {
        if (!args.__local) throw new Error('the address is renewed at the server itself');
        const c = this.settings.cloud;
        const fresh = cloudSettings({ enabled: c.enabled, relayUrl: c.relayUrl, launcherUrl: c.launcherUrl }); // new roomId + secret
        Object.assign(c, fresh);
        this.store.saveSettings(this.settings);
        this.log.info('internet access: new address — the old links stop working');
        this.cloud.apply();
        this.emit('state');
        return this.cloud.status();
      }
      case 'experience.list': {
        this.catalog = scanCatalog(this.experienceDirs, this.log);
        this.emit('state');
        return { experiences: publicCatalog(this._visual()), sounds: publicCatalog(this._sounds()) };
      }
      case 'experience.play': {
        const e = this._visual().find((x) => x.id === args.id);
        if (!e) throw new Error(`unknown experience "${args.id}"`);
        P.experience.id = e.id;
        this._experienceRun();
        const O = P.output;
        this.log.info(`experience "${e.id}" started (${O.sink === 'spout' ? `Spout "${O.senderName}"` : 'full screen'})`);
        return {};
      }
      case 'experience.stop': {
        // the experience layer goes off; the room output itself stays as it is (the other layers keep showing)
        if (this.experienceState().running) this.log.info('experience stopped');
        this._layer('experience').on = false;
        this.exp = { fps: 0, error: null };
        this._saveExperience(true);
        this._syncOutputWindow();
        this.emit('state');
        return {};
      }
      case 'experience.set': {
        // what is left of the experience's own settings; where it goes lives in output.set
        const moved = ['sink', 'senderName', 'displayId', 'fit', 'scale', 'fps'].filter((k) => k in args);
        if (moved.length) throw new Error(`${moved.join(', ')}: set on the room output (output.set)`);
        if ('autostart' in args) P.experience.autostart = !!args.autostart;
        this._saveExperience(true);
        this.emit('state');
        return {};
      }
      case 'output.set': {
        // the room output: on / off, where it goes and how big. Show mode locks everything but the switch.
        if (this.settings.locked && Object.keys(args).some((k) => k !== 'on' && !k.startsWith('__'))) throw new Error('the room is locked (Show mode) — unlock it first');
        const o = P.output, next = {};
        if ('on' in args) next.on = !!args.on;
        if ('sink' in args) { if (!['spout', 'window'].includes(args.sink)) throw new Error('sink: spout or window'); next.sink = args.sink; }
        if ('senderName' in args) {
          next.senderName = String(args.senderName ?? '').replace(/[^\w .-]/g, '').trim().slice(0, 60);
          if (!next.senderName) throw new Error('the sender name cannot be empty (letters, digits, spaces, . - _)');
        }
        if ('displayId' in args) {
          if (args.displayId !== null && !Number.isFinite(args.displayId)) throw new Error('displayId: a display or null');
          next.displayId = args.displayId;
        }
        if ('fit' in args) { if (!['fit', 'stretch'].includes(args.fit)) throw new Error('fit: fit or stretch'); next.fit = args.fit; }
        if ('scale' in args) { if (!OUTPUT_SCALES.includes(Number(args.scale))) throw new Error(`scale: one of ${OUTPUT_SCALES.join(', ')}`); next.scale = Number(args.scale); }
        if ('fps' in args) { if (!OUTPUT_FPS.includes(Number(args.fps))) throw new Error(`fps: one of ${OUTPUT_FPS.join(', ')}`); next.fps = Number(args.fps); }
        const was = o.on;
        Object.assign(o, next);
        if (was && !o.on) { this.exp = { fps: 0, error: null }; this.out = { fps: 0, error: null, previewAt: null }; this.outPreview = null; }
        if (next.on !== undefined && next.on !== was) this.log.info(`room output ${o.on ? `on (${o.sink === 'spout' ? `Spout "${o.senderName}"` : 'full screen'})` : 'off'}`);
        this._saveExperience(true);
        this._syncOutputWindow();
        this.emit('state');
        return {};
      }
      case 'output.layers': {
        // the layers, bottom to top: each one its switch, opacity, blend; the touches layer also its mask settings
        if (!Array.isArray(args.layers)) throw new Error('layers: a list');
        const seen = new Set();
        for (const l of args.layers) {
          if (!l || !OUTPUT_LAYERS.includes(l.id)) throw new Error(`layer: one of ${OUTPUT_LAYERS.join(', ')}`);
          if (seen.has(l.id)) throw new Error(`layer "${l.id}" appears twice`);
          seen.add(l.id);
          if ('on' in l && typeof l.on !== 'boolean') throw new Error(`${l.id}: on is true or false`);
          if ('opacity' in l && !(Number.isFinite(l.opacity) && l.opacity >= 0 && l.opacity <= 1)) throw new Error(`${l.id}: opacity is a number from 0 to 1`);
          if ('blend' in l && !OUTPUT_BLENDS.includes(l.blend)) throw new Error(`${l.id}: blend is one of ${OUTPUT_BLENDS.join(', ')}`);
          if (l.id === 'touches') {
            if ('radius' in l && !(Number.isFinite(l.radius) && l.radius >= 0.01 && l.radius <= 1)) throw new Error('touches: radius is 0.01 to 1 m');
            if ('sizeMode' in l && !['fixed', 'touch'].includes(l.sizeMode)) throw new Error('touches: sizeMode is fixed or touch');
            if ('softness' in l && !(Number.isFinite(l.softness) && l.softness >= 0 && l.softness <= 1)) throw new Error('touches: softness is 0 to 1');
            if ('trailMs' in l && !(Number.isFinite(l.trailMs) && l.trailMs >= 0 && l.trailMs <= 10000)) throw new Error('touches: trailMs is 0 to 10000');
            if ('scale' in l && !TOUCH_LAYER_SCALES.includes(l.scale)) throw new Error(`touches: scale is one of ${TOUCH_LAYER_SCALES.join(', ')}`);
            if ('walls' in l && !(Array.isArray(l.walls) && l.walls.every((w) => P.walls.some((x) => x.id === w)))) throw new Error('touches: walls are walls of this room ([] = all)');
          }
        }
        if (seen.size !== OUTPUT_LAYERS.length) throw new Error(`layers: all of ${OUTPUT_LAYERS.join(', ')}, once each`);
        // each layer keeps what the command leaves out; the normaliser fills in and clamps the rest
        const old = new Map(P.output.layers.map((l) => [l.id, l]));
        P.output.layers = normRoomOutput({ layers: args.layers.map((l) => ({ ...old.get(l.id), ...l })) }).layers;
        this._saveExperience();
        this._syncOutputWindow();
        this.emit('state');
        return {};
      }
      case 'experience.param': {
        const x = P.experience, e = this._visual().find((c) => c.id === x.id);
        if (!e) throw new Error('no experience selected');
        const param = e.params.find((q) => q.key === args.key);
        if (!param) throw new Error(`"${e.id}" has no parameter "${args.key}"`);
        const value = checkParam(param, args.value, P.walls.map((w) => w.id));
        (x.params[e.id] ??= {})[param.key] = value;
        this._saveExperience();
        this.emit('state'); // the page listens to the state: no reload
        return { value };
      }
      case 'experience.report': {
        // sent by the experience layer's page every 2 s
        if (!this.experienceState().running) return {};
        const fps = Number(args.fps);
        this.exp.fps = Number.isFinite(fps) ? Math.max(0, Math.min(1000, Math.round(fps * 10) / 10)) : 0;
        const err = typeof args.error === 'string' && args.error.trim() ? args.error.replace(/[\u0000-\u001f]+/g, ' ').slice(0, 300) : null;
        if (err && err !== this.exp.error) this.log.warn(`experience "${this.profile.experience.id}": ${err}`);
        this.exp.error = err;
        this.emit('state');
        return {};
      }
      case 'audio.set': {
        // the room's sound: on / off, devices, channels, sub, filters, levels. Show mode locks everything but the switch, master and mute.
        if (this.settings.locked && Object.keys(args).some((k) => !['on', 'master', 'mute'].includes(k) && !k.startsWith('__'))) throw new Error('the room is locked (Show mode) — unlock it first');
        const A = P.audio, next = {};
        if ('on' in args) { if (typeof args.on !== 'boolean') throw new Error('on: true or false'); next.on = args.on; }
        if ('devices' in args) {
          if (!Array.isArray(args.devices) || args.devices.length > 16 || !args.devices.every((d) => typeof d === 'string')) throw new Error('devices: a list of device names (at most 16)');
          next.devices = args.devices;
        }
        if ('channels' in args) { const n = Number(args.channels); if (!Number.isInteger(n) || n < 1 || n > AUDIO_MAX_CHANNELS) throw new Error(`channels: a whole number from 1 to ${AUDIO_MAX_CHANNELS}`); next.channels = n; }
        if ('master' in args) { const n = Number(args.master); if (!(n >= 0 && n <= 1)) throw new Error('master: from 0 to 1'); next.master = n; }
        if ('mute' in args) { if (typeof args.mute !== 'boolean') throw new Error('mute: true or false'); next.mute = args.mute; }
        if ('ceilingDb' in args) { const n = Number(args.ceilingDb); if (!(n >= -12 && n <= -1)) throw new Error('ceilingDb: from -12 to -1 (the limiter never lets more than -1 dBFS through)'); next.ceilingDb = n; }
        if ('wallHighpassHz' in args) { const n = Number(args.wallHighpassHz); if (!(n >= 0 && n <= 500)) throw new Error('wallHighpassHz: from 0 (off) to 500'); next.wallHighpassHz = n; }
        if ('sub' in args) {
          const sb = args.sub;
          if (!sb || typeof sb !== 'object') throw new Error('sub: { channel, crossoverHz }');
          const ch = sb.channel === undefined ? A.sub.channel : sb.channel, hz = sb.crossoverHz ?? A.sub.crossoverHz;
          if (ch !== null && !(Number.isInteger(ch) && ch >= 1)) throw new Error('sub.channel: a channel number or null (no sub)');
          if (!(Number(hz) >= 40 && Number(hz) <= 250)) throw new Error('sub.crossoverHz: from 40 to 250');
          next.sub = { channel: ch, crossoverHz: Number(hz) };
        }
        const was = A.on;
        P.audio = normAudio({ ...A, ...next }, P.walls);
        if (was && !P.audio.on) { this.aud.playing = false; this.aud.report = null; this.aud.error = null; }
        if (next.on !== undefined && next.on !== was) this.log.info(`room audio ${P.audio.on ? 'on' : 'off'}`);
        this._saveExperience(true);
        this._syncAudioWindow();
        this.emit('state');
        return { audio: P.audio };
      }
      case 'audio.map': {
        // which logical channels each wall's speakers are ({ wallId: [channel, …] }, left → right inside the room), and the sub
        if (!args.map || typeof args.map !== 'object' || Array.isArray(args.map)) throw new Error('map: { wallId: [channel, …] }');
        const A = P.audio, n = args.channels === undefined ? A.channels : Number(args.channels);
        if (!Number.isInteger(n) || n < 1 || n > AUDIO_MAX_CHANNELS) throw new Error(`channels: a whole number from 1 to ${AUDIO_MAX_CHANNELS}`);
        for (const [wid, list] of Object.entries(args.map)) {
          if (!P.walls.some((w) => w.id === wid)) throw new Error(`"${wid}" is not a wall of this room`);
          if (!Array.isArray(list) || !list.every((c) => Number.isInteger(c) && c >= 1 && c <= n)) throw new Error(`${wid}: channels are whole numbers from 1 to ${n}`);
        }
        let sub = A.sub;
        if ('sub' in args) {
          const sb = args.sub;
          if (!sb || typeof sb !== 'object') throw new Error('sub: { channel, crossoverHz }');
          const ch = sb.channel === undefined ? A.sub.channel : sb.channel;
          if (ch !== null && !(Number.isInteger(ch) && ch >= 1 && ch <= n)) throw new Error(`sub.channel: null or a channel from 1 to ${n}`);
          sub = { channel: ch, crossoverHz: sb.crossoverHz ?? A.sub.crossoverHz };
        }
        P.audio = normAudio({ ...A, channels: n, map: args.map, sub }, P.walls);
        this._saveExperience(true);
        this.emit('state');
        return { map: P.audio.map, sub: P.audio.sub, channels: P.audio.channels };
      }
      case 'audio.mute': {
        const mute = 'mute' in args ? !!args.mute : !P.audio.mute;
        P.audio.mute = mute;
        this.log.info(mute ? 'room audio muted' : 'room audio unmuted');
        this._saveExperience(true);
        this.emit('state');
        return { mute };
      }
      case 'audio.test': {
        // a soft ~1 s tone on ONE logical channel (the sub included), to find out which speaker is which. The audio window plays it.
        const n = Number(args.channel);
        if (!Number.isInteger(n) || n < 1 || n > P.audio.channels) throw new Error(`channel: a whole number from 1 to ${P.audio.channels}`);
        if (!P.audio.on) throw new Error('room audio is off');
        this.aud.test = { seq: ++this.aud.testSeq, channel: n, at: Date.now() };
        this.emit('state');
        return { channel: n };
      }
      case 'audio.report': {
        // sent by the audio window about twice a second: the devices it found, the sinks it opened, the level, errors
        if (!P.audio.on) return {};
        this._audioReport(args);
        return {};
      }
      case 'sound.play': {
        const e = this._sounds().find((x) => x.id === args.id);
        if (!e) throw new Error(`unknown sound "${args.id}"`);
        P.audio.sound.id = e.id;
        P.audio.on = true;
        this.aud.playing = true; this.aud.error = null;
        this.log.info(`sound "${e.id}" started`);
        this._saveExperience(true);
        this._syncAudioWindow();
        this.emit('state');
        return {};
      }
      case 'sound.stop': {
        if (this.aud.playing) this.log.info('sound stopped');
        this.aud.playing = false; this.aud.error = null;
        this.emit('state');
        return {};
      }
      case 'sound.set': {
        if ('autostart' in args) P.audio.sound.autostart = !!args.autostart;
        this._saveExperience(true);
        this.emit('state');
        return {};
      }
      case 'sound.param': {
        const s = P.audio.sound, e = this._sounds().find((c) => c.id === s.id);
        if (!e) throw new Error('no sound selected');
        const param = e.params.find((q) => q.key === args.key);
        if (!param) throw new Error(`"${e.id}" has no parameter "${args.key}"`);
        const value = checkParam(param, args.value, P.walls.map((w) => w.id));
        (s.params[e.id] ??= {})[param.key] = value;
        this._saveExperience();
        this.emit('state'); // the piece listens to the state: no restart
        return { value };
      }
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
      case 'net.setSensorNic': {
        // the network card on the sensors' switch (no DHCP: it only has a 169.254 address) gets 192.168.11.5
        if (!args.__local) throw new Error('run this from the server itself (Windows asks for administrator rights there)');
        const nic = unconfiguredInterfaces().find((i) => i.name === args.iface);
        if (!nic) throw new Error('that network card is not waiting for an address (only a card on a network without DHCP is set up from here)');
        await setInterfaceAddress(nic.name, SERVER_SENSOR_IP);
        this.log.info(`network card "${nic.name}" set to ${SERVER_SENSOR_IP} for the sensors`);
        return { iface: nic.name, ip: SERVER_SENSOR_IP };
      }
      case 'net.openHotspot': {
        if (!args.__local) throw new Error('open it on the server itself');
        await openHotspotSettings();
        return {};
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
      this.bgJobs.set(id, { frames, done: () => (rt.pipeline.learning ? rt.pipeline.learning.samples.length : frames) });
    }
    this._syncWanderers(); // simulated hands leave those walls first: the room must be empty for its background
    for (const id of ids) {
      const rt = this.sensors.get(id);
      rt.bgMotion = null;
      rt.pipeline.learnBackground(frames, (dist, motion) => {
        this.bgJobs.delete(id);
        this._syncWanderers();
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
    this.calib = new CalibrationSession(wall, ids, targets, {
      holdMs: args.holdMs ?? 700, log: this.log,
      captureRadiusM: args.captureRadiusM ?? this.profile.processing?.calibCaptureM ?? 0.75,
      armed: args.armed === true, // the phone remote starts at the wall; from the desktop the operator is not there yet
    });
    this._setOwner(args.__client);
    this._syncWanderers();
    this.trackers.get(wall.id)?.clear();
    this.log.info(`calibration started on ${wall.id} with ${targets.length} targets (${ids.join(', ')})${args.__client ? ` from ${args.__client.device}` : ''}`);
    this.emit('state');
    return { targets: targets.length };
  }

  // ------------------------------------------------------------------ experiences

  /** The layer of the room output with this id (the profile's own object). */
  _layer(id) { return this.profile.output.layers.find((l) => l.id === id); }

  /** Play: the experience layer on and the room output on (an experience that goes nowhere is no use). */
  _experienceRun() {
    this._layer('experience').on = true;
    this.profile.output.on = true;
    this.exp = { fps: 0, error: null };
    this._saveExperience(true);
    this._syncOutputWindow();
    this.emit('state');
  }

  /** What the UI is told about the experience: the selected one, whether it runs (output on + its layer on) and how it is doing. */
  experienceState() {
    const x = this.profile.experience, e = this._visual().find((c) => c.id === x.id);
    const running = this.profile.output.on && this._layer('experience').on && !!e;
    return {
      running, id: x.id, fps: running ? this.exp.fps : 0, error: running ? this.exp.error : null,
      url: running ? `/experiences/${e.id}/${e.entry}?run=1` : null,
    };
  }

  /**
   * The room output as the UI and the output page see it. `calibrating`: a calibration, verification, Fit or walk test
   * runs, or the grid is on. The output then shows only what calibration needs (the touches, with the grid and its
   * targets on top, on black) whatever the operator's layers are. `layersEffective` is what the page draws, bottom to top.
   */
  outputState() {
    const O = this.profile.output, calibrating = this.calibrating();
    const touches = this._layer('touches');
    const layersEffective = calibrating
      ? [{ ...touches, on: true, opacity: 1, blend: 'screen' }, { id: 'grid', on: true, opacity: 1, blend: 'screen' }]
      : O.layers;
    return {
      running: O.on, calibrating, layersEffective, url: O.on ? '/output?run=1' : null,
      fps: O.on ? this.out.fps : 0, error: O.on ? this.out.error : null, previewAt: O.on ? this.out.previewAt : null,
    };
  }

  /** Calibration mode of the room output (see outputState). */
  calibrating() { return !!(this.calib || this.verify || this.fit || this.walk || this.grid); }

  /** The window the desktop app opens for the room output (null = none): relative URL, the app adds the origin. */
  outputWindow() {
    const O = this.profile.output;
    if (!O.on) return null;
    // width x height: the render size, which the Spout window paints at 1:1 (its frames go to Spout on the GPU)
    const c = this.profile.canvas;
    return { url: '/output?run=1', sink: O.sink, displayId: O.displayId, fit: O.fit, scale: O.scale, fps: O.fps, senderName: O.senderName,
      width: Math.round(c.width * O.scale), height: Math.round(c.height * O.scale) };
  }

  _syncOutputWindow() {
    const m = this.outputWindow(), key = JSON.stringify(m);
    if (key === this._outKey) return;
    this._outKey = key;
    this.emit('outputWindow', m);
  }

  /** The desktop app sends a JPEG of the whole output once a second, with how the window is doing (engine/main.js). */
  setOutputPreview(buf, { fps, error } = {}) {
    if (!this.profile.output.on) return false;
    const was = `${this.out.fps}|${this.out.error}|${this.out.previewAt !== null}`;
    if (buf) { this.outPreview = { buf, at: Date.now() }; this.out.previewAt = this.outPreview.at; } // (no image = only how it is doing)
    if (Number.isFinite(fps)) this.out.fps = Math.max(0, Math.min(1000, Math.round(fps * 10) / 10));
    this.out.error = typeof error === 'string' && error.trim() ? error.replace(/[\u0000-\u001f]+/g, ' ').slice(0, 300) : null;
    if (was !== `${this.out.fps}|${this.out.error}|${this.out.previewAt !== null}`) this.emit('state'); // (a fresh frame alone does not: the page refreshes the image by itself)
    return true;
  }

  /** Someone is looking at the output's preview (GET preview.jpg): the desktop app captures it only while that lasts. */
  notePreviewAsked() { this.out.previewAskedAt = Date.now(); }
  previewWanted() { return Date.now() - (this.out.previewAskedAt || 0) < 5000; }

  // Settings change often while an operator plays with faders: the profile is written once things settle (700 ms).
  // Switches (play, stop, the output's on / destination, autostart) are written at once — an app quit right after
  // must not lose them. Either way the profile's revision moves on, so an edit another device computed from the
  // profile as it was before is refused as stale instead of silently putting the old output / layers back.
  _saveExperience(now = false) {
    this.rev = (this.rev || 0) + 1;
    clearTimeout(this._expSave);
    this._expSave = setTimeout(() => this._flushExperience(), now ? 0 : 700);
    this._expSave.unref?.();
    if (now) this._flushExperience();
  }

  _cancelExperienceSave() { clearTimeout(this._expSave); this._expSave = null; }

  _flushExperience(profile = this.profile) {
    if (!this._expSave) return;
    this._cancelExperienceSave();
    try { this.store.saveProfile(profile); } catch (e) { this.log.error(`save ${profile?.id}: ${e.message}`); }
  }

  // ------------------------------------------------------------------ room audio

  _visual() { return visualOnly(this.catalog); }
  _sounds() { return soundOnly(this.catalog); }

  /** The sound piece plays when the room starts, if the room says so (and audio is on). */
  _soundAutostart() {
    const A = this.profile.audio;
    if (A.on && A.sound.autostart && A.sound.id && this._sounds().some((e) => e.id === A.sound.id)) { this.aud.playing = true; this.log.info(`sound "${A.sound.id}" started with the app`); }
  }

  /** The last report is fresh for 6 s: a window that stops reporting is no longer "running". */
  _audioWatch() {
    if (this.aud.report && Date.now() - this.aud.at > 6000) { this.aud.report = null; this.emit('state'); }
  }

  /** What the audio window says, cleaned up; a change the UI would show (not every peak) is announced. */
  _audioReport(r) {
    const txt = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').slice(0, n) : '');
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000000, Math.round(Number(v)))) : d);
    const list = (a, f) => (Array.isArray(a) ? a.slice(0, 64).map(f) : []);
    const peak = Number(r.peakDb);
    const rep = {
      devices: list(r.devices, (d) => ({ label: txt(d?.label), channels: num(d?.channels), default: !!d?.default })),
      sinks: list(r.sinks, (k) => ({ label: txt(k?.label), first: num(k?.first), count: num(k?.count), missing: !!k?.missing, error: txt(k?.error) || null, state: txt(k?.state, 20) })),
      logical: num(r.logical), available: num(r.available), fold: !!r.fold,
      peakDb: Number.isFinite(peak) ? Math.max(-120, Math.min(6, Math.round(peak / 3) * 3)) : null, // 3 dB steps: a number that changes with every beat would rebuild the UI
      rate: num(r.rate), isolated: r.isolated !== false,
      error: txt(r.error, 300) || null,
      sound: { active: !!r.sound?.active, id: txt(r.sound?.id, 40) || null, error: txt(r.sound?.error, 300) || null },
    };
    const before = JSON.stringify(this.aud.report);
    this.aud.report = rep; this.aud.at = Date.now();
    if (rep.error && rep.error !== this.aud.lastError) this.log.warn(`room audio: ${rep.error}`);
    if (rep.sound.error && rep.sound.error !== this.aud.lastSoundError) this.log.warn(`sound "${rep.sound.id}": ${rep.sound.error}`);
    this.aud.lastError = rep.error; this.aud.lastSoundError = rep.sound.error;
    if (JSON.stringify(rep) !== before) this.emit('state');
  }

  /** What the UI is told about the room's sound. */
  audioState() {
    const A = this.profile.audio, rep = A.on ? this.aud.report : null;
    const entry = this._sounds().find((e) => e.id === A.sound.id);
    const running = A.on && this.aud.playing && !!entry;
    return {
      on: A.on, running: !!rep, url: A.on ? '/audio?run=1' : null,
      devices: rep?.devices || [], sinks: rep?.sinks || [],
      logical: A.channels, available: rep?.available ?? 0, fold: rep ? rep.fold : A.devices.length === 0,
      peakDb: rep?.peakDb ?? null, rate: rep?.rate ?? 0, isolated: rep ? rep.isolated : true, error: rep?.error || null,
      test: this.aud.test,
      sound: { running, id: A.sound.id, active: running && !!rep?.sound.active, error: running ? (rep?.sound.error || null) : null },
    };
  }

  /** The window the desktop app opens (hidden) for the room's sound; null = none. */
  audioWindow() { return this.profile.audio.on ? { url: '/audio?run=1' } : null; }

  _syncAudioWindow() {
    const m = this.audioWindow(), key = JSON.stringify(m);
    if (key === this._audKey) return;
    this._audKey = key;
    this.emit('audioWindow', m);
  }

  /** Texture outputs shown full screen (enabled, sink 'window', a display chosen): one window each, opened by the desktop app. */
  textureWindows() {
    return this.profile.outputs.filter((o) => o.type === 'texture' && o.enabled && o.sink === 'window' && o.displayId != null)
      .map((o) => ({ id: o.id, displayId: o.displayId }));
  }

  _syncTextureWindows() {
    const list = this.textureWindows(), key = JSON.stringify(list);
    if (key === this._texKey) return;
    this._texKey = key;
    this.emit('textureWindows', list);
  }

  /**
   * Simulated wandering hands, except on the wall being calibrated, verified or fitted (they would hit its targets)
   * and on walls whose background is being captured (the room must be empty).
   */
  _syncWanderers() {
    const busy = new Set([this.calib?.wall.id, this.verify?.wall.id, this.fit?.wallId].filter(Boolean));
    for (const id of this.bgJobs?.keys() || []) { const w = this.sensors.get(id)?.cfg.wallId; if (w) busy.add(w); }
    for (const rt of this.sensors.values()) {
      if (rt.driver instanceof SimDriver) rt.driver.setWanderers(busy.has(rt.cfg.wallId) ? 0 : this.profile.simulation.wanderers);
    }
  }

  // ------------------------------------------------------------------ control of a calibration session

  /** The device driving the running session (null when none runs or it was started without a device). */
  /** A command refused by a gate: logged (device, op, reason; the same line at most once per 10 s), then thrown back to the caller. */
  _refuse(who, op, reason) {
    const device = who?.device || (who ? 'a device' : 'the engine'), key = `${device}|${op}|${reason}`, now = Date.now();
    this._refusals ||= new Map();
    if (!(now - (this._refusals.get(key) || 0) < 10000)) {
      this._refusals.set(key, now);
      this.log.warn(`command refused: ${op} from ${device} — ${reason}`);
      if (this._refusals.size > 200) for (const [k, t] of this._refusals) if (now - t > 10000) this._refusals.delete(k);
    }
    throw new Error(reason);
  }

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
    // the device that was fitting a mesh went away: the projection stops highlighting its point
    if (this.fit && this.fit.client === id) { this.fit = null; this._syncWanderers(); this.emit('state'); }
    if (this.walk && this.walk.client === id) { this.walk = null; this.emit('state'); }
    if (this.grid && this.grid.client === id) { this.grid = null; this.emit('state'); }
    if (this.control?.id !== id || this.control.gone) return;
    this.control.gone = true;
    if (this._owner()) this.log.warn(`${this.control.device} disconnected during the calibration — any device can continue it`);
  }

  _cancelCalibration() {
    if (!this.calib) return;
    this.log.info(`calibration on ${this.calib.wall.id} cancelled`);
    this.calib = null;
    this._syncWanderers();
    this.emit('state');
  }

  /** The last verification of a wall, kept with the wall (the room setup guide and the remote read it). */
  _saveVerification(v) {
    const s = v.summary();
    if (!s) return;
    const prof = structuredClone(this.profile);
    const w = prof.walls.find((x) => x.id === v.wall.id);
    if (!w) return;
    const worst = v.targets.reduce((b, t, k) => (t.errMm !== null && (b < 0 || t.errMm > v.targets[b].errMm) ? k : b), -1);
    const passMm = verifyPassMm(w);
    w.verified = { at: new Date().toISOString(), meanMm: s.meanMm, maxMm: s.maxMm, n: s.n, passMm, pass: s.maxMm <= passMm,
      worst: worst >= 0 ? { x: v.targets[worst].x, y: v.targets[worst].y, errMm: v.targets[worst].errMm } : null };
    this._activate(this.store.saveProfile(prof));
    this.log.info(`verification of ${w.id}: mean ${s.meanMm} mm, worst ${s.maxMm} mm — ${w.verified.pass ? 'pass' : 'not good enough for hands'}`);
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
    const cw = prof.walls.find((w) => w.id === c.wall.id);
    if (cw) cw.verified = null; // a new calibration has not been verified yet
    this.calib = null;
    this._activate(this.store.saveProfile(prof));
    this.log.info(`calibration applied to ${applied.join(', ') || 'no sensor'}`);
    return { applied };
  }
}

const r4 = (v) => Math.round(v * 10000) / 10000;

/** Commands only the device driving a calibration / verification may send while it runs. */
const CONTROL_OPS = new Set([
  'calib.start', 'calib.skip', 'calib.back', 'calib.redo', 'calib.apply', 'calib.clear', 'verify.start', // (calib.cancel / verify.cancel: open to every paired device)
  'profile.update', 'profile.load', 'profile.create', 'profile.import', 'profile.delete', 'profile.restore',
  'bg.capture', 'bg.clear', 'sensor.autoAlign', 'sensor.sideCheck', 'sensor.readdress', 'sensor.restart', 'replay.start', 'replay.stop', 'app.lock',
]);

/** Commands refused while the room is locked (Show mode). */
const LOCKED_OPS = new Set([
  'profile.update', 'profile.load', 'profile.create', 'profile.import', 'profile.delete', 'profile.restore',
  'bg.capture', 'bg.clear', 'calib.start', 'calib.apply', 'calib.clear', 'verify.start', 'sensor.autoAlign',
  'replay.start', 'rec.delete', 'sensor.discover', 'sensor.readdress', 'net.setSensorNic',
  'experience.set', // play / stop / param stay available in Show mode: they are how a show is run
  // the room's sound: where it goes (devices, map, test) is locked; play / stop / parameters / master / mute / the switch are how a show
  // is run (audio.set checks its own keys)
  'audio.map', 'audio.test', 'sound.set',
]);
