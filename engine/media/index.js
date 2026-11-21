// MediaEngine: the media server inside the engine (MEDIA-SERVER.md §4.1). engine/engine.js hands it every `media.*` and
// `show.*` command (by prefix) and puts what it says into the state; everything else about media lives here.
//
//   library   where the files are (settings.mediaDir), free space, thumbnails, missing files and "Locate…" (§4d)
//   show      the active show (shows/<id>.json, profile.media.showId), its edits and versions (engine/media/show.js)
//   import    validation, fingerprint and copy into the library, in a worker_thread (engine/media/import-worker.js)
//   http      the thumbnails and the raw PCM the server routes ask for (engine/server.js)
//   transport who plays on each layer, since when, and what happens at the end (engine/media/transport.js); its state
//             is written to <data>/run/transport.json on every change so a restarted engine carries on (§4.2)
//   presets   the experience cards of Live: one live experience, its parameters, its sound piece (engine/media/presets.js)
//
// The engine decides, the pages execute: nothing here touches a video frame. Bytes of movies are read in the worker,
// apart from the PCM route (small positional reads, asynchronous) — never in the engine's 60 Hz loop.

import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeShow, blankShow, newClip, withoutMedia, fileName, nextId, clipSettings, MAX_COLUMNS } from './show.js';
import { Transport, XLAYER } from './transport.js';
import { Presets, migratePresets, presetForExperience } from './presets.js';
import {
  rejectMessage, audioWarning, sizeWarning, ALREADY, INTERRUPTED, isMovName, diskSpace, driveOf, insideLibrary, absoluteIn,
  freeName, safeName, findByName, thumbName, THUMB_WIDTHS, formatBytes,
} from './library.js';
import { movIndexAsync } from './mov.js';
import { pcmRanges } from './pcm.js';
import { writeJsonAtomic } from '../store.js';

const WORKER_URL = new URL('./import-worker.js', import.meta.url);
const CHECK_MS = 10000;      // missing files, drives that came back, free space (§4d.5)
const MEDIA_EMIT_MS = 250;   // at most 4 'media' messages a second while copying
const DONE_KEEP_MS = 10000;  // a finished copy stays in the list this long once nothing is copying
const PCM_MAX_FRAMES = 1 << 20;
const MOVIES_OPEN = 4;       // movies the PCM route keeps open (index + handle)
const SHOW_SAVE_MS = 700;    // a layer's mix or a preset's parameter, moved live, is written once it settles
const SNAP_LAZY_MS = 250;    // a mix moved live (a fader) rewrites the transport snapshot at most this often; launches write at once
const RESTORE_MAX_MS = 10 * 60000; // a transport snapshot older than this is not taken back (the room starts as show.start says)

/** What the presets drive in the engine (engine.js › _mediaHost); a media server on its own (tests) has no experiences. */
const NO_HOST = {
  visual: () => [], sounds: () => [], walls: () => [], running: () => null, soundPlaying: () => null,
  run() { throw new Error('no experiences here'); }, stop() {}, playSound() {}, stopSound() {}, setParam() {},
};

/** Commands refused in Show mode (merged into the engine's LOCKED_OPS). */
export const MEDIA_LOCKED_OPS = new Set([
  'show.update', 'show.load', 'show.create', 'show.delete', 'show.export', 'show.import', 'show.restore',
  'media.import', 'media.importCancel', 'media.relink', 'media.remove', 'media.setDir',
]);

const ACTIVE = new Set(['queued', 'copying']);
const PENDING = new Set(['queued', 'copying', 'interrupted']);
const httpError = (status, message) => Object.assign(new Error(message), { status });

export class MediaEngine extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('../store.js').Store} deps.store @param {object} deps.log
   * @param {object} deps.settings the engine's settings object (mediaDir is read and written here)
   * @param {() => object} deps.profile the active room profile
   * @param {(showId:string|null) => void} deps.setShowId makes a show the room's (the engine saves the profile)
   * @param {object} [deps.host] the experience and the sound piece, for the presets (engine.js › _mediaHost; see presets.js)
   * Test seams (never reachable from a command):
   * @param {(dir:string) => Promise<{free:number|null, total:number|null}>} [deps.freeSpace] instead of statfs
   * @param {string} [deps.sourceOpener] module URL whose `open(file, options)` the worker reads sources with
   * @param {object} [deps.sourceOptions] passed to that `open`
   * @param {number} [deps.blockSize] copy block (8 MB)
   * @param {number} [deps.checkMs] period of the library check (10 s)
   * @param {{now: () => number, wall: () => number}} [deps.clock] the engine clock (performance.now, the clock of live.t) and the wall clock
   * @param {() => number} [deps.random] for the 'random' autopilot
   */
  constructor({ store, log, settings, profile, setShowId, host = null, freeSpace = null, sourceOpener = null, sourceOptions = null, blockSize = null, checkMs = CHECK_MS, clock = null, random = Math.random }) {
    super();
    this.store = store;
    this.log = log;
    this.settings = settings;
    this.profile = profile;
    this.setShowId = setShowId;
    this.opts = { freeSpace, sourceOpener, sourceOptions, blockSize, checkMs };
    this.show = null;
    this.showRev = 0;
    this.jobs = new Map();       // id → copy job (state.media.import)
    this.problems = [];          // missing-media, from the last check
    this.space = { free: null, total: null };
    this.workers = new Set();
    this.movies = new Map();     // absolute path → { fh, size, mtimeMs, index, at } for the PCM route
    this.thumbing = new Map();   // thumbnail being regenerated → Promise
    this._seq = 0;
    this._loaded = undefined;
    this.clock = clock || { now: () => performance.now(), wall: () => Date.now() };
    this.host = { ...NO_HOST, ...(host || {}) };
    this.transport = new Transport({ now: () => this.clock.now(), settings: clipSettings, random, playable: (clip) => this._playable(clip) });
    this.presets = new Presets({
      now: () => this.clock.now(), log,
      host: { ...this.host, clearGrid: () => this.transport.clearAll({ grid: true, x: false }), clearX: () => this.transport.clearAll({ grid: false, x: true, reason: 'stopped' }) },
    });
  }

  /** The command prefixes this facade takes. */
  static PREFIXES = ['media.', 'show.', 'clip.', 'column.', 'layer.', 'preset.'];
  handles(op) { return MediaEngine.PREFIXES.some((p) => op.startsWith(p)); }

  get libraryDir() { return this.store.mediaDir(this.settings); }
  get thumbsDir() { return this.store.thumbsDir; }

  // ------------------------------------------------------------------ life cycle

  start() {
    this._started = true;
    this._restoreJobs();
    this._run(() => this._restoreTransport());
    this.check();
    this._timer = setInterval(() => this.check(), this.opts.checkMs);
    this._timer.unref?.();
  }

  /** Stops the timers and the workers. A copy cut here keeps its .part: it resumes when the file is imported again. */
  async stop() {
    this._stopped = true;
    clearInterval(this._timer);
    clearTimeout(this._mediaTimer);
    clearTimeout(this._tTimer);
    if (this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null; this._snapNow(); } // a fader moved just before
    if (this._showSaveTimer) { // a mix or a parameter moved just before: written now
      clearTimeout(this._showSaveTimer); this._showSaveTimer = null;
      if (this.show) { try { this.store.saveShow(this.show, { backup: false }); } catch (e) { this.log.warn(`show ${this.show.id}: ${e.message}`); } }
    }
    await Promise.all([...this.workers].map((w) => w.terminate().catch(() => {})));
    await Promise.all([...this.movies.values()].map((m) => m.fh.close().catch(() => {})));
    this.movies.clear();
    await this._checking?.catch(() => {});
  }

  /** The room changed, or its show did: load the show it names. Called by the engine's _activate. */
  profileChanged(profile) {
    const id = profile?.media?.showId || null;
    if (id === this._loaded) return;
    this._loaded = id;
    let show = null;
    if (id) { try { show = this.store.loadShow(id); } catch (e) { this.log.warn(`show ${id}: ${e.message}`); } }
    // a show without presets: the room's experience (and sound piece) becomes its first card
    const first = migratePresets(show, profile, this.host.visual(), this.host.sounds());
    if (first) {
      try { show = this.store.saveShow(first, { backup: false }); this.log.info(`show "${show.name}": preset "${show.presets[0].name}" made from the room's experience`); }
      catch (e) { this.log.warn(`show ${id}: ${e.message}`); }
    }
    this.show = show;
    this.showRev++;
    this.problems = [];
    this._showSet();
    if (this._started) { this._restoreJobs(); this.check(); }
  }

  // ------------------------------------------------------------------ state

  /** The three state fields: show (with its revision), media (copies and problems), library (folder, free space). */
  state() { return { show: this.show ? { ...this.show, rev: this.showRev } : null, media: this.mediaState(), library: this.libraryState() }; }

  /** state.media: the transport (rev, blackout, column, layers, xlayer), the live preset, the copies and the problems. */
  mediaState() {
    const copy = [];
    for (const j of this.jobs.values()) {
      if (j.state === 'interrupted') copy.push({ kind: 'copy', importId: j.id, mediaId: j.mediaId, text: `Copy of "${j.name}" interrupted — plug the drive back in.`, fix: null });
      else if (j.state === 'failed') copy.push({ kind: 'copy', importId: j.id, mediaId: j.mediaId, text: `Copy of "${j.name}" failed: ${j.error}`, fix: null });
    }
    return { ...this.transport.state(), preset: this.presets.state(), import: [...this.jobs.values()].map(publicJob), problems: [...this.problems, ...copy] };
  }

  libraryState() {
    const dir = this.libraryDir;
    return { dir, isDefault: !this.settings.mediaDir, drive: driveOf(dir), free: this.space.free, total: this.space.total };
  }

  _emitMedia() {
    if (this._mediaTimer || this._stopped) return;
    const wait = Math.max(0, MEDIA_EMIT_MS - (Date.now() - (this._mediaAt || 0)));
    this._mediaTimer = setTimeout(() => { this._mediaTimer = null; this._mediaAt = Date.now(); this.emit('media', this.mediaState()); }, wait);
  }

  /** A transport change goes out at once (it is rare, and the pages schedule on it); copies in progress wait for the throttle. */
  _emitNow() {
    if (this._stopped) return;
    clearTimeout(this._mediaTimer);
    this._mediaTimer = null;
    this._mediaAt = Date.now();
    this.emit('media', this.mediaState());
  }

  _jobEvent(job) { this.emit('job', publicJob(job)); this._emitMedia(); }

  // ------------------------------------------------------------------ commands

  async command(op, args = {}) {
    switch (op) {
      case 'show.list': return { shows: this.store.listShows() };
      case 'show.update': {
        if (!this.show) throw new Error('no show is open');
        if (!args.show || typeof args.show !== 'object' || Array.isArray(args.show)) throw new Error('no show to save');
        if (args.rev !== undefined && args.rev !== this.showRev) throw new Error('stale: the show changed on another device — reloaded');
        // the media list is the library's to change (import, relink, remove): an edit cannot point a show at a file
        this._saveShow({ ...args.show, id: this.show.id, media: this.show.media });
        return { rev: this.showRev };
      }
      case 'show.load': {
        this.store.loadShow(args.id); // throws when there is none
        this.setShowId(args.id);
        return { id: args.id };
      }
      case 'show.create': {
        const base = args.from ? this.store.loadShow(args.from) : blankShow(args.name, { canvas: this.profile().canvas });
        const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : base.name;
        const saved = this.store.saveShow({ ...base, id: this.store.uniqueShowId(name), name });
        this.setShowId(saved.id);
        return { id: saved.id };
      }
      case 'show.delete': {
        if (this.show && args.id === this.show.id) throw new Error('cannot delete the open show');
        this.store.deleteShow(args.id);
        return {};
      }
      case 'show.versions': return { versions: this.store.listShowVersions(args.id || this.show?.id) };
      case 'show.restore': {
        const id = args.id || this.show?.id;
        const s = this.store.restoreShowVersion(id, args.version);
        if (this.show && id === this.show.id) { this.show = s; this.showRev++; this._showSet(); this.emit('state'); this.check(); }
        return { id };
      }
      case 'show.export': return this._exportShow(args);
      case 'show.import': return this._importShow(args);
      case 'media.import': return this.importFiles(args.paths, args.target, args);
      case 'media.importCancel': return this.cancelImport(args.id);
      case 'media.relink': return this.relink(args.dir, args);
      case 'media.remove': return this.remove(args.mediaId, args);
      case 'media.setDir': return this.setDir(args.dir, args);
      // the transport (Show mode allows all of these: they are how a show is run)
      case 'clip.trigger': return this._run(() => this.transport.trigger(args));
      case 'column.trigger': return this._run(() => this.transport.columnTrigger(args));
      case 'column.next': return this._run(() => this.transport.step(Number(args.dir) < 0 ? -1 : 1, args));
      case 'column.prev': return this._run(() => this.transport.step(-1, args));
      case 'layer.clear': return this._run(() => this.transport.clear(args.layerId, { transitionMs: args.transitionMs }));
      case 'layer.set': return this._layerSet(args);
      case 'media.clearAll': return this._run(() => this.transport.clearAll());
      case 'media.blackout': return this._run(() => this.transport.setBlackout('on' in args ? args.on : !this.transport.blackout));
      case 'media.report': return this._report(args);
      // the experience presets
      case 'preset.load': return this._run(() => this.presets.load(this.show, args.presetId));
      case 'preset.unload': return this._run(() => this.presets.unload());
      case 'preset.param': return this._presetParam(args);
      default: throw new Error(`unknown command ${op}`);
    }
  }

  /** Saves the active show (or another one by id) and tells the clients. */
  _saveShow(show, opts) {
    const saved = this.store.saveShow(show, opts);
    if (this.show && saved.id === this.show.id) {
      clearTimeout(this._showSaveTimer); this._showSaveTimer = null; // (what was waiting to be written is in this save)
      this.show = saved; this.showRev++; this._showSet(); this.emit('state');
    }
    return saved;
  }

  /** Edits a show by id, open or not: fn(copy) → the new show. */
  _editShow(showId, fn, opts) {
    const cur = this.show && this.show.id === showId ? this.show : (this.store.hasShow(showId) ? this.store.loadShow(showId) : null);
    if (!cur) return null;
    return this._saveShow(fn(structuredClone(cur)), opts);
  }

  /** The open show; one is made for the room (named after it) when it has none. */
  _ensureShow() {
    if (this.show) return this.show;
    const p = this.profile();
    const saved = this.store.saveShow(blankShow(p.name, { canvas: p.canvas, id: this.store.uniqueShowId(p.name) }));
    this.setShowId(saved.id);
    if (!this.show) throw new Error('the show could not be opened');
    this.log.info(`show "${saved.name}" created for the room`);
    return this.show;
  }

  // ------------------------------------------------------------------ transport and presets (§4.2, §4.3, §4b.4)

  /**
   * Runs a transport / preset change and then, if anything changed: the snapshot for restarts, the 'media' message (at
   * once), the events ('started' / 'ended' / 'error'), and the timer of the next thing due.
   */
  _run(fn, { lazy = false } = {}) {
    const t = this.transport.rev, p = this.presets.rev;
    try { return fn(); } finally { this._settle(t, p, lazy); }
  }

  _settle(t, p, lazy = false) {
    const events = this.transport.takeEvents();
    if (this.transport.rev !== t || this.presets.rev !== p) { this._writeSnapshot(lazy); this._emitNow(); }
    for (const e of events) this.emit('event', e);
    this._schedule();
  }

  /** One timer for whatever the transport or the presets have due next (an end, an autopilot switch, a start timeout). */
  _schedule() {
    clearTimeout(this._tTimer);
    this._tTimer = null;
    if (this._stopped || !this._started) return;
    const a = this.transport.nextDue(), b = this.presets.nextDue();
    const due = a === null ? b : b === null ? a : Math.min(a, b);
    if (due === null) return;
    this._tTimer = setTimeout(() => { this._tTimer = null; this.tick(); }, Math.min(60000, Math.max(0, Math.ceil(due - this.clock.now()))));
    this._tTimer.unref?.();
  }

  /** Does what is due now (the timer calls it; tests with a fake clock too). */
  tick() { this._run(() => { const now = this.clock.now(); this.transport.advance(now); this.presets.advance(now); }); }

  /** The show changed (opened, edited, restored): the transport and the presets follow it. */
  _showSet() { this._run(() => { this.transport.setShow(this.show); this.presets.showChanged(this.show); }); }

  /** Why a clip cannot play right now (a launch is refused with this), or null. */
  _playable(clip) {
    const show = this.show, m = show?.media.find((x) => x.id === clip.mediaId);
    if (!m) return 'the clip has no media';
    const name = fileName(m.file);
    if (this._jobFor(show.id, m.id)) return `"${name}" is still being copied into the library.`;
    let st = null;
    try { st = fs.statSync(absoluteIn(this.libraryDir, m.file)); } catch { /* missing */ }
    if (!st || !st.isFile() || (m.size && st.size !== m.size)) return `"${name}" is missing from the media library.`;
    return null;
  }

  /** layer.set: the live mix of a layer, at once on the transport; written into the show once the fader settles. */
  _layerSet(args) {
    const id = args.layerId;
    if (id !== XLAYER && !this.show?.layers.some((l) => l.id === id)) throw new Error(`unknown layer "${id}"`);
    if (!['opacity', 'blend', 'bypass', 'volume', 'mute'].some((k) => k in args)) throw new Error('layer.set: opacity, blend, bypass, volume or mute');
    const mix = this._run(() => this.transport.setMix(id, args), { lazy: true });
    if (id !== XLAYER) {
      const l = this.show.layers.find((x) => x.id === id);
      Object.assign(l, { opacity: mix.opacity, blend: mix.blend, bypass: mix.bypass, audio: { ...l.audio, volume: mix.volume, mute: mix.mute } });
      this._deferShowSave();
    }
    return mix;
  }

  /** preset.param: a parameter of a preset's experience ({sound: true}: of its sound piece); live too when it is the live one. */
  _presetParam(args) {
    const sound = args.sound === true;
    const r = this.presets.param(this.show, args.presetId, args.key, args.value, { sound });
    if (sound) r.preset.sound.params = { ...r.preset.sound.params, [r.key]: r.value };
    else r.preset.params = { ...r.preset.params, [r.key]: r.value };
    this._deferShowSave();
    if (r.live) this.host.setParam(sound ? 'sound' : 'experience', r.entry.id, r.key, r.value);
    return { value: r.value };
  }

  _deferShowSave() {
    clearTimeout(this._showSaveTimer);
    this._showSaveTimer = setTimeout(() => { this._showSaveTimer = null; if (this.show && !this._stopped) this._saveShow(this.show, { backup: false }); }, SHOW_SAVE_MS);
    this._showSaveTimer.unref?.();
  }

  /** media.report: the output page could not play a play (unreadable file): the layer is ejected and an 'error' event goes out. */
  _report(args) {
    if (typeof args.playId !== 'string' || !args.error) return { ejected: false }; // (health figures without a failed play: F6/F13)
    const r = this._run(() => this.transport.fail(args.playId, args.error));
    if (r.ejected) this.log.warn(`clip ${args.playId} could not be played: ${String(args.error || '').slice(0, 200)}`);
    return r;
  }

  // the old experience API (experience.play / stop / param, sound.param — docs/OSC.md), through the presets

  /** experience.play {id}: the show's preset of that experience, if it has one; otherwise the experience as it always was. */
  playExperience(id) {
    const p = presetForExperience(this.show, id);
    return this._run(() => (p ? this.presets.load(this.show, p.id) : this.presets.adhoc(id)));
  }

  /** experience.stop happened: nothing is live, the experience's own clips stop. */
  experienceStopped() { this._run(() => this.presets.stopped()); }

  /** experience.report: how the experience page is doing (makes a loading preset live, or shows its error). */
  experienceReport(fps, error) { this._run(() => this.presets.report(fps, error)); }

  /** experience.param / sound.param changed a live value: the live preset of that piece keeps it too. */
  liveParam(kind, id, key, value) {
    const pid = this.presets.liveFor(kind, id), p = pid && this.show?.presets.find((x) => x.id === pid);
    if (!p) return;
    if (kind === 'sound') { if (p.sound?.id === id) p.sound.params = { ...p.sound.params, [key]: value }; else return; }
    else p.params = { ...p.params, [key]: value };
    this._deferShowSave();
  }

  // the snapshot (<data>/run/transport.json): plain write + rename, no fsync — it is run state, not a document

  _snapFile() { return path.join(this.store.dir, 'run', 'transport.json'); }

  /** On every change; `lazy` (a fader): at most every SNAP_LAZY_MS, the last one always written. */
  _writeSnapshot(lazy = false) {
    if (!this._started || this._stopped) return;
    if (this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null; }
    const wait = SNAP_LAZY_MS - (Date.now() - (this._snapAt || 0));
    if (lazy && wait > 0) { this._snapTimer = setTimeout(() => { this._snapTimer = null; this._snapNow(); }, wait); this._snapTimer.unref?.(); return; }
    this._snapNow();
  }

  _snapNow() {
    this._snapAt = Date.now();
    const file = this._snapFile();
    const data = { schema: 1, showId: this.show?.id ?? null, wall: this.clock.wall(), now: this.clock.now(), transport: this.transport.dump(), presets: this.presets.dump() };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    } catch (e) { this.log.warn(`transport snapshot: ${e.message}`); }
  }

  /**
   * On start: what played when the engine went down, if it was this show and not long ago. Times are moved from the old
   * process's clock to this one's through the wall clock; what ended meanwhile is done silently (loops are where they
   * would be, a clip that would have ended is gone, an autopilot has moved on).
   */
  _restoreTransport() {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(this._snapFile(), 'utf8')); } catch { return; }
    if (!snap || snap.schema !== 1 || !this.show || snap.showId !== this.show.id) return;
    const wall = this.clock.wall(), now = this.clock.now(), age = wall - snap.wall;
    if (!(age >= -5000 && age <= RESTORE_MAX_MS)) return;
    const shift = (snap.wall - snap.now) - (wall - now);
    this.transport.restore(snap.transport, shift);
    this.transport.advance(now, { silent: true });
    this.transport.takeEvents();
    try { this.presets.restore(snap.presets, shift); } catch (e) { this.log.warn(`preset after restart: ${e.message}`); }
    if (this.transport.busy() || this.presets.live) this.log.info(`transport restored (${Math.round(age / 100) / 10} s after it was saved)`);
  }

  // ------------------------------------------------------------------ import (§4d.3)

  /**
   * Validates the files (index only: works with the file still on the USB stick), puts the accepted ones in the show —
   * and, with a target, a clip each in the grid, at once — and queues their copies. The refused ones come back in ONE list.
   * @param {string[]} paths absolute paths (the desktop app has them; a browser or a phone does not)
   * @param {{deckId?:string, layerId:string, column?:number}|null} target a cell or a layer (null = the library only)
   * @returns {Promise<{showId:string, accepted:{name, mediaId, clipId, reused, copying, warnings:string[]}[], rejected:{name, message}[]}>}
   */
  async importFiles(paths, target, args = {}) {
    if (!args.__local) throw new Error('files are imported in the desktop app, on this computer');
    const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && p.length < 1024).slice(0, 500);
    if (!list.length) throw new Error('no files to import');
    const showId = this._ensureShow().id;
    const lib = this.libraryDir;
    const accepted = [], rejected = [], cand = [];
    for (const p of list) {
      const name = path.basename(p);
      if (!path.isAbsolute(p)) { rejected.push({ name, message: rejectMessage({ code: 'ENOENT' }, name) }); continue; }
      if (!isMovName(name)) { rejected.push({ name, message: rejectMessage({ code: 'not-mov' }, name) }); continue; }
      const st = await fs.promises.stat(p).catch((e) => e);
      if (st instanceof Error) { rejected.push({ name, message: rejectMessage(st, name) }); continue; }
      if (st.isDirectory()) { rejected.push({ name, message: rejectMessage({ code: 'EISDIR' }, name) }); continue; }
      cand.push({ path: path.resolve(p), name, mtimeMs: Math.round(st.mtimeMs) });
    }
    const results = cand.length ? await this._inspect(cand.map((c) => c.path)) : [];
    const space = await this._space(lib);
    let free = space.free === null ? Infinity : space.free - this._pendingBytes(lib);
    const drive = driveOf(lib);
    const canvas = this.profile().canvas;

    const edit = structuredClone(this.show && this.show.id === showId ? this.show : this.store.loadShow(showId));
    const t = target && typeof target === 'object' ? target : null;
    const deck = t ? edit.decks.find((d) => d.id === t.deckId) || edit.decks[0] : null;
    const layer = t ? edit.layers.find((l) => l.id === t.layerId) || null : null;
    let col = layer ? (Number.isInteger(t.column) && t.column >= 0 ? t.column : firstFreeColumn(deck, layer.id)) : 0;
    const queued = [];
    let index = null; // the other shows' files, by fingerprint: built once per batch, when first needed
    const taken = (file) => edit.media.some((m) => m.file.toLowerCase() === file.toLowerCase())
      || [...this.jobs.values()].some((j) => j.dst.toLowerCase() === absoluteIn(lib, file).toLowerCase())
      || fs.existsSync(absoluteIn(lib, file)) || fs.existsSync(`${absoluteIn(lib, file)}.part`);

    for (let i = 0; i < cand.length; i++) {
      const c = cand[i], r = results[i];
      if (!r || r.error) { rejected.push({ name: c.name, message: rejectMessage(r?.error || { code: 'worker' }, c.name) }); continue; }
      const v = r.probe.video, warnings = [];
      if (r.probe.audio && !r.probe.audio.supported) warnings.push(audioWarning(c.name, r.probe.audio.codecName));
      if (v.width !== canvas.width || v.height !== canvas.height) warnings.push(sizeWarning(v, canvas));
      let media = edit.media.find((m) => m.fingerprint === r.fingerprint && m.size === r.size);
      let reused = !!media, job = null;
      if (!media) {
        index ??= this._libraryIndex(showId);
        const known = this._inLibrary(index, r.fingerprint, r.size);
        if (known) { media = { ...known, id: nextId(edit.media, 'm'), thumbFrame: null }; edit.media.push(media); reused = true; }
      }
      if (reused) {
        warnings.unshift(ALREADY);
        const stopped = [...this.jobs.values()].find((j) => j.fingerprint === r.fingerprint && j.state === 'interrupted');
        if (stopped) { stopped.src = c.path; stopped.state = 'queued'; stopped.error = null; this._jobEvent(stopped); } // the drive is back
      } else {
        const inLib = insideLibrary(lib, c.path);
        let file = inLib;
        if (!inLib) {
          if (r.size > free) { rejected.push({ name: c.name, message: rejectMessage({ code: 'no-space', needed: r.size, free: Math.max(0, free), drive }, c.name) }); continue; }
          free -= r.size;
          file = `${showId}/${freeName(safeName(c.name), (n) => taken(`${showId}/${n}`))}`;
        }
        media = {
          id: nextId(edit.media, 'm'), file, size: r.size, mtimeMs: inLib ? c.mtimeMs : 0, fingerprint: r.fingerprint,
          video: { ...v }, audio: audioEntry(r.probe.audio), thumbFrame: null,
        };
        edit.media.push(media);
        if (!inLib) {
          job = this._newJob({ kind: 'import', showId, mediaId: media.id, name: c.name, src: c.path, dst: absoluteIn(lib, file), size: r.size, fingerprint: r.fingerprint });
          queued.push(job);
        }
      }
      let clipId = null;
      if (layer && col < MAX_COLUMNS) {
        const clip = newClip(edit, media, layer.id);
        edit.clips.push(clip);
        deck.cells[`${layer.id}:${col++}`] = clip.id;
        clipId = clip.id;
      }
      accepted.push({ name: c.name, mediaId: media.id, clipId, reused, copying: !!job, warnings });
    }
    if (accepted.length) this._saveShow(edit);
    for (const j of queued) { this.jobs.set(j.id, j); this._jobEvent(j); }
    if (accepted.length || rejected.length) this.log.info(`import into "${edit.name}": ${accepted.length} accepted (${queued.length} to copy), ${rejected.length} refused`);
    this._pump();
    return { showId, accepted, rejected };
  }

  /** fingerprint → [media] of every show but `exceptShowId`. */
  _libraryIndex(exceptShowId) {
    const index = new Map();
    for (const s of this.store.listShows()) {
      if (s.id === exceptShowId) continue;
      let show; try { show = this.store.loadShow(s.id); } catch { continue; }
      for (const m of show.media) if (m.fingerprint) { if (!index.has(m.fingerprint)) index.set(m.fingerprint, []); index.get(m.fingerprint).push(m); }
    }
    return index;
  }

  /** A medium already in the library — being copied, or another show's whose file is there — by fingerprint: never copied twice. */
  _inLibrary(index, fp, size) {
    for (const j of this.jobs.values()) {
      if (j.kind !== 'export' && j.fingerprint === fp && PENDING.has(j.state)) { const m = this._mediaOf(j.showId, j.mediaId); if (m) return strip(m); }
    }
    const lib = this.libraryDir;
    for (const m of index.get(fp) || []) {
      if (m.size !== size) continue;
      try { if (fs.statSync(absoluteIn(lib, m.file)).size === size) return strip(m); } catch { /* not there */ }
    }
    return null;
  }

  _mediaOf(showId, mediaId) {
    const show = this.show && this.show.id === showId ? this.show : (this.store.hasShow(showId) ? this.store.loadShow(showId) : null);
    return show?.media.find((m) => m.id === mediaId) || null;
  }

  /** Bytes still to be written by the copies to the drive of `dir`. */
  _pendingBytes(dir) {
    const drive = driveOf(dir).toLowerCase();
    let n = 0;
    for (const j of this.jobs.values()) if (PENDING.has(j.state) && driveOf(j.dst).toLowerCase() === drive) n += Math.max(0, j.size - j.done);
    return n;
  }

  _newJob(o) {
    return { id: `i${++this._seq}`, state: 'queued', done: 0, total: o.size, mbps: 0, etaS: null, error: null, resumedFrom: 0, ...o };
  }

  /** Starts the next queued copy (one at a time: a USB stick read in parallel is slower, not faster). */
  _pump() {
    if (this._copying || this._stopped) return;
    const job = [...this.jobs.values()].find((j) => j.state === 'queued');
    if (!job) return;
    this._copying = job;
    job.state = 'copying'; job.error = null; job.mbps = 0; job.etaS = null; job._last = null;
    const { ctrl, done } = this._spawn({ kind: 'copy', src: job.src, dst: job.dst, size: job.size, fingerprint: job.fingerprint, block: this.opts.blockSize || undefined }, (m) => this._onCopy(job, m));
    job.ctrl = ctrl;
    this._jobEvent(job);
    done.then(() => {
      job.ctrl = null;
      if (job.state === 'copying') { job.state = 'failed'; job.error = 'the copy stopped unexpectedly'; this._jobEvent(job); }
      this._copying = null;
      job._ended?.();
      this._pump();
    });
  }

  _onCopy(job, m) {
    const now = performance.now();
    switch (m.type) {
      case 'progress': {
        if (job._last && m.done > job._last.done) {
          const rate = ((m.done - job._last.done) * 1000) / Math.max(1, now - job._last.t); // bytes/s
          job._rate = job._rate ? job._rate * 0.7 + rate * 0.3 : rate;
          job.mbps = Math.round((job._rate / 1048576) * 10) / 10;
          job.etaS = Math.round((m.total - m.done) / job._rate);
        }
        job._last = { done: m.done, t: now };
        job.done = m.done; job.total = m.total; job.resumedFrom = m.resumedFrom;
        this._emitMedia();
        return;
      }
      case 'done': {
        Object.assign(job, { state: 'done', done: job.size, etaS: 0, resumedFrom: m.resumedFrom, finishedAt: Date.now() });
        if (job.kind !== 'export') {
          this._editShow(job.showId, (s) => { const x = s.media.find((y) => y.id === job.mediaId); if (x) { x.mtimeMs = m.mtimeMs; x.size = m.size; } return s; }, { backup: false });
          this.problems = this.problems.filter((p) => p.mediaId !== job.mediaId);
        }
        this.log.info(`copied "${job.name}" to the ${job.kind === 'export' ? 'export folder' : 'library'}${job.resumedFrom ? ` (resumed at ${formatBytes(job.resumedFrom)})` : ''}`);
        this._jobEvent(job);
        return;
      }
      case 'interrupted':
        Object.assign(job, { state: 'interrupted', done: m.done, mbps: 0, etaS: null, error: INTERRUPTED });
        this.log.warn(`copy of "${job.name}" interrupted at ${formatBytes(m.done)}: ${m.message}`);
        this._jobEvent(job);
        return;
      case 'failed':
        Object.assign(job, { state: 'failed', mbps: 0, etaS: null, error: m.code === 'ENOSPC' ? `not enough space on ${driveOf(job.dst)}` : m.message });
        this.log.warn(`copy of "${job.name}" failed: ${m.message}`);
        this._jobEvent(job);
        return;
      case 'cancelled':
        job.state = 'cancelled';
        this._jobEvent(job);
        return;
      default:
    }
  }

  /**
   * Cancels a copy (or dismisses a finished / failed one). An import that is cancelled leaves nothing: no .part, no
   * entry in the show, no clip.
   */
  async cancelImport(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('no such import');
    if (job.state === 'copying' && job.ctrl) {
      const ended = new Promise((r) => { job._ended = r; });
      Atomics.store(job.ctrl, 0, 1);
      await ended;
    }
    const finished = job.state === 'done';
    if (!finished) { fs.rmSync(`${job.dst}.part`, { force: true }); fs.rmSync(`${job.dst}.part.json`, { force: true }); }
    this.jobs.delete(id);
    if (!finished && job.kind === 'import') {
      this._editShow(job.showId, (s) => withoutMedia(s, [job.mediaId]));
      if (!this.show?.media.some((m) => m.fingerprint === job.fingerprint)) {
        for (const w of THUMB_WIDTHS) fs.rmSync(path.join(this.thumbsDir, thumbName(job.fingerprint, w)), { force: true });
      }
      this.log.info(`import of "${job.name}" cancelled`);
    }
    this._emitMedia();
    this._pump();
    return {};
  }

  // ------------------------------------------------------------------ library check (§4d.5)

  /**
   * Every file of the open show is there (fs.stat), interrupted copies whose drive came back resume, free space.
   * Runs when a show is opened and every 10 s; returns when done. Asked while one runs, it runs once more after it
   * (the running one may have looked before the change that prompted the call).
   */
  check() {
    if (this._stopped) return Promise.resolve();
    if (this._checking) return (this._checkAgain ??= this._checking.then(() => { this._checkAgain = null; return this.check(); }));
    this._checking = this._check().catch((e) => this.log.warn(`media check: ${e.message}`)).finally(() => { this._checking = null; });
    return this._checking;
  }

  async _check() {
    const show = this.show, lib = this.libraryDir;
    const missing = [];
    for (const m of show?.media || []) {
      if (this._jobFor(show.id, m.id)) continue; // being copied: its job says how it goes
      const st = await fs.promises.stat(absoluteIn(lib, m.file)).catch(() => null);
      if (!st || !st.isFile() || (m.size && st.size !== m.size)) {
        missing.push({ kind: 'missing-media', mediaId: m.id, file: m.file, text: `"${fileName(m.file)}" is missing from the media library.`, fix: 'relink' });
      }
    }
    // copies whose source is reachable again (same size and fingerprint): they continue from their .part
    const waiting = [];
    for (const j of this.jobs.values()) {
      if (j.state !== 'interrupted') continue;
      const st = await fs.promises.stat(j.src).catch(() => null);
      if (st && st.isFile() && st.size === j.size) waiting.push(j);
    }
    if (waiting.length) {
      const fps = await this._fingerprints(waiting.map((j) => j.src));
      waiting.forEach((j, i) => { if (j.state === 'interrupted' && fps[i]?.fingerprint === j.fingerprint) { j.state = 'queued'; j.error = null; this._jobEvent(j); } });
    }
    // a finished copy leaves the list a while after the last one
    if (![...this.jobs.values()].some((j) => PENDING.has(j.state))) {
      for (const [id, j] of this.jobs) if (j.state === 'done' && Date.now() - j.finishedAt > DONE_KEEP_MS) { this.jobs.delete(id); this._emitMedia(); }
    }
    for (const [file, mv] of this.movies) if (Date.now() - mv.at > 60000) { this.movies.delete(file); mv.fh.close().catch(() => {}); }
    const before = this.space;
    this.space = await this._space(lib);
    if (show && show.id === this.show?.id) { // (an edit during the awaits: drop what no longer holds)
      const now = missing.filter((p) => this.show.media.some((m) => m.id === p.mediaId && m.file === p.file && !this._jobFor(show.id, m.id)));
      if (JSON.stringify(now) !== JSON.stringify(this.problems)) { this.problems = now; this._emitMedia(); }
    } else if (!this.show && this.problems.length) { this.problems = []; this._emitMedia(); }
    const moved = (a, b) => (a === null) !== (b === null) || Math.abs((a || 0) - (b || 0)) > Math.max(1e9, 0.01 * (this.space.total || 0));
    if (moved(before.free, this.space.free)) this.emit('state');
    this._pump();
  }

  _jobFor(showId, mediaId) {
    for (const j of this.jobs.values()) if (j.kind !== 'export' && j.showId === showId && j.mediaId === mediaId && j.state !== 'done' && j.state !== 'cancelled') return j;
    return null;
  }

  /** Copies cut by an engine restart: a missing file with a .part sidecar becomes an interrupted copy again. */
  _restoreJobs() {
    const show = this.show;
    if (!show) return;
    for (const m of show.media) {
      if (this._jobFor(show.id, m.id)) continue;
      const dst = absoluteIn(this.libraryDir, m.file);
      if (fs.existsSync(dst)) continue;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(`${dst}.part.json`, 'utf8')); } catch { continue; }
      if (meta.fingerprint !== m.fingerprint || typeof meta.src !== 'string') continue;
      let done = 0; try { done = fs.statSync(`${dst}.part`).size; } catch { /* none yet */ }
      const j = this._newJob({ kind: 'import', showId: show.id, mediaId: m.id, name: fileName(m.file), src: meta.src, dst, size: m.size, fingerprint: m.fingerprint });
      Object.assign(j, { state: 'interrupted', done, error: INTERRUPTED });
      this.jobs.set(j.id, j);
    }
  }

  async _space(dir) {
    try { const s = this.opts.freeSpace ? await this.opts.freeSpace(dir) : await diskSpace(dir); return { free: s?.free ?? null, total: s?.total ?? null }; } catch { return { free: null, total: null }; }
  }

  // ------------------------------------------------------------------ Locate… / remove / library folder

  /**
   * "Locate…" (§4d.5): searches `dir` for every missing file of the open show by name + size + fingerprint and fixes
   * all the matches at once. A match inside the library is pointed at; one outside is copied in (a clip plays from the
   * library only).
   */
  async relink(dir, args = {}) {
    if (!args.__local) throw new Error('folders are chosen in the desktop app, on this computer');
    if (!this.show) throw new Error('no show is open');
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('choose a folder on this computer');
    await this.check();
    const show = this.show, lib = this.libraryDir;
    const missing = this.problems.filter((p) => p.kind === 'missing-media').map((p) => show.media.find((m) => m.id === p.mediaId)).filter(Boolean);
    if (!missing.length) return { fixed: 0, copying: 0, notFound: [], rejected: [] };
    const byName = await findByName(dir, new Set(missing.map((m) => fileName(m.file).toLowerCase())));
    const cand = [];
    for (const m of missing) {
      for (const p of byName.get(fileName(m.file).toLowerCase()) || []) {
        const st = await fs.promises.stat(p).catch(() => null);
        if (st && st.size === m.size) cand.push({ m, p });
      }
    }
    const fps = cand.length ? await this._fingerprints(cand.map((c) => c.p)) : [];
    const found = new Map();
    cand.forEach((c, i) => { if (!found.has(c.m.id) && (!c.m.fingerprint || fps[i]?.fingerprint === c.m.fingerprint)) found.set(c.m.id, c.p); });
    const edit = structuredClone(show), rejected = [], drive = driveOf(lib);
    let fixed = 0, copying = 0, free = (await this._space(lib)).free ?? Infinity;
    free -= this._pendingBytes(lib);
    for (const [id, p] of found) {
      const m = edit.media.find((x) => x.id === id), inLib = insideLibrary(lib, p);
      if (inLib) { m.file = inLib; fixed++; continue; }
      if (m.size > free) { rejected.push({ name: fileName(m.file), message: rejectMessage({ code: 'no-space', needed: m.size, free: Math.max(0, free), drive }, fileName(m.file)) }); continue; }
      free -= m.size;
      const j = this._newJob({ kind: 'relink', showId: show.id, mediaId: id, name: fileName(m.file), src: p, dst: absoluteIn(lib, m.file), size: m.size, fingerprint: m.fingerprint });
      this.jobs.set(j.id, j); this._jobEvent(j); copying++;
    }
    if (fixed) this._saveShow(edit);
    this.log.info(`locate in ${dir}: ${fixed} relinked, ${copying} to copy, ${missing.length - found.size} not found`);
    this._pump();
    await this.check();
    return { fixed, copying, notFound: missing.filter((m) => !found.has(m.id)).map((m) => fileName(m.file)), rejected };
  }

  /**
   * Takes a medium out of the open show, with its clips. The library file stays unless `deleteFile` is set and no
   * show uses it any more.
   */
  async remove(mediaId, args = {}) {
    if (!this.show) throw new Error('no show is open');
    const m = this.show.media.find((x) => x.id === mediaId);
    if (!m) throw new Error('no such media');
    const job = this._jobFor(this.show.id, mediaId);
    if (job) { await this.cancelImport(job.id); if (job.kind === 'import') return { removed: mediaId, deleted: false }; }
    this._saveShow(withoutMedia(this.show, [mediaId]));
    let deleted = false;
    if (args.deleteFile) {
      const used = this.store.listShows().some((s) => { try { return this.store.loadShow(s.id).media.some((x) => x.file === m.file); } catch { return false; } });
      if (!used) { await fs.promises.rm(absoluteIn(this.libraryDir, m.file), { force: true }); deleted = true; }
    }
    this.problems = this.problems.filter((p) => p.mediaId !== mediaId);
    this._emitMedia();
    return { removed: mediaId, deleted };
  }

  /** Points the library at another folder (this computer only). Files are not moved: "Locate…" finds them. */
  async setDir(dir, args = {}) {
    if (!args.__local) throw new Error('the library folder is chosen on this computer');
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('choose a folder on this computer');
    if ([...this.jobs.values()].some((j) => ACTIVE.has(j.state))) throw new Error('wait for the copies to finish (or cancel them) before changing the library folder');
    const abs = path.resolve(dir);
    await fs.promises.mkdir(abs, { recursive: true });
    const probe = path.join(abs, `.vt-write-${process.pid}`);
    try { await fs.promises.writeFile(probe, 'ok'); } catch (e) { throw new Error(`cannot write to ${abs} (${e.code || e.message})`); } finally { await fs.promises.rm(probe, { force: true }); }
    this.settings.mediaDir = path.resolve(this.store.mediaDir({})) === abs ? null : abs;
    this.store.saveSettings(this.settings);
    this.log.info(`media library: ${abs}`);
    this.space = await this._space(abs);
    await this.check();
    this.emit('state');
    return { dir: abs };
  }

  // ------------------------------------------------------------------ export / import of a whole show (§4d.1)

  /** A show as JSON, or (with `dir`, on this computer) a folder with show.json and its media, to take to another machine. */
  async _exportShow(args) {
    const show = this.store.loadShow(args.id || this.show?.id);
    if (!args.dir) return { json: show };
    if (!args.__local) throw new Error('folders are chosen in the desktop app, on this computer');
    if (!path.isAbsolute(args.dir)) throw new Error('choose a folder on this computer');
    const folder = path.join(args.dir, freeName(safeName(show.name), (n) => fs.existsSync(path.join(args.dir, n))));
    const names = new Set(), lib = this.libraryDir, copies = [], missing = [];
    const media = show.media.map((m) => {
      const n = freeName(fileName(m.file), (x) => names.has(x.toLowerCase()));
      names.add(n.toLowerCase());
      const src = absoluteIn(lib, m.file);
      if (fs.existsSync(src)) copies.push({ m, src, dst: path.join(folder, 'media', n) }); else missing.push(fileName(m.file));
      return { ...m, file: `media/${n}` };
    });
    const need = copies.reduce((a, c) => a + c.m.size, 0), space = await this._space(args.dir);
    if (space.free !== null && need > space.free - this._pendingBytes(args.dir)) {
      throw new Error(rejectMessage({ code: 'no-space', needed: need, free: Math.max(0, space.free - this._pendingBytes(args.dir)), drive: driveOf(args.dir) }, show.name));
    }
    fs.mkdirSync(path.join(folder, 'media'), { recursive: true });
    writeJsonAtomic(path.join(folder, 'show.json'), { ...show, media });
    for (const c of copies) { const j = this._newJob({ kind: 'export', showId: show.id, mediaId: c.m.id, name: fileName(c.m.file), src: c.src, dst: c.dst, size: c.m.size, fingerprint: c.m.fingerprint }); this.jobs.set(j.id, j); this._jobEvent(j); }
    this._pump();
    return { dir: folder, copying: copies.length, missing };
  }

  /** A show from JSON, or from an exported folder (its media are copied into the library). It is saved, not opened. */
  async _importShow(args) {
    if (args.json) {
      const src = typeof args.json === 'string' ? JSON.parse(args.json) : args.json;
      const n = normalizeShow(src, { canvas: this.profile().canvas });
      const saved = this.store.saveShow({ ...n, id: this.store.uniqueShowId(n.name) });
      return { id: saved.id, copying: 0 };
    }
    if (!args.__local) throw new Error('folders are chosen in the desktop app, on this computer');
    if (typeof args.dir !== 'string' || !path.isAbsolute(args.dir)) throw new Error('choose a folder on this computer');
    const n = normalizeShow(JSON.parse(await fs.promises.readFile(path.join(args.dir, 'show.json'), 'utf8')), { canvas: this.profile().canvas });
    const id = this.store.uniqueShowId(n.name), lib = this.libraryDir, copies = [];
    const media = n.media.map((m) => {
      const file = `${id}/${fileName(m.file)}`;
      copies.push({ m, src: path.join(args.dir, ...m.file.split('/')), dst: absoluteIn(lib, file) });
      return { ...m, file, mtimeMs: 0 };
    });
    const need = copies.reduce((a, c) => a + c.m.size, 0), space = await this._space(lib);
    const free = space.free === null ? Infinity : space.free - this._pendingBytes(lib);
    if (need > free) throw new Error(rejectMessage({ code: 'no-space', needed: need, free: Math.max(0, free), drive: driveOf(lib) }, n.name));
    const saved = this.store.saveShow({ ...n, id, media });
    for (const c of copies) { const j = this._newJob({ kind: 'import', showId: id, mediaId: c.m.id, name: fileName(c.m.file), src: c.src, dst: c.dst, size: c.m.size, fingerprint: c.m.fingerprint }); this.jobs.set(j.id, j); this._jobEvent(j); }
    this._pump();
    return { id: saved.id, copying: copies.length };
  }

  // ------------------------------------------------------------------ workers

  _spawn(task, onMessage) {
    const sab = new SharedArrayBuffer(4);
    const w = new Worker(WORKER_URL, {
      workerData: { task, ctrl: sab, opener: this.opts.sourceOpener, openerOptions: this.opts.sourceOptions },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    this.workers.add(w);
    let ended = false;
    const done = new Promise((resolve) => {
      w.on('message', (m) => { if (!ended) onMessage(m); });
      w.on('error', (e) => { this.log.warn(`media worker (${task.kind}): ${e.message}`); onMessage({ type: 'failed', code: 'worker', message: e.message }); });
      w.on('exit', () => { ended = true; this.workers.delete(w); resolve(); });
    });
    return { worker: w, ctrl: new Int32Array(sab), done };
  }

  async _task(task) {
    const msgs = [];
    await this._spawn(task, (m) => msgs.push(m)).done;
    return msgs;
  }

  async _inspect(files) {
    const out = [];
    for (const m of await this._task({ kind: 'inspect', files, thumbsDir: this.thumbsDir })) if (m.type === 'inspected') out[m.i] = m.result;
    return out;
  }

  async _fingerprints(files) {
    const out = [];
    for (const m of await this._task({ kind: 'fingerprint', files })) if (m.type === 'fingerprint') out[m.i] = m.result;
    return out;
  }

  // ------------------------------------------------------------------ for the HTTP routes (engine/server.js)

  /**
   * The thumbnail of a medium of the open show (§4d.4): <data>/thumbs/<fingerprint>-<w>.png, made again from the file
   * when it is not there. → {file, fingerprint} or null.
   */
  async thumbFile(mediaId, width) {
    const show = this.show, m = show?.media.find((x) => x.id === mediaId);
    if (!m?.fingerprint) return null;
    const w = Number(width) === 480 ? 480 : 160;
    const file = path.join(this.thumbsDir, thumbName(m.fingerprint, w, m.thumbFrame));
    if (fs.existsSync(file)) return { file, fingerprint: m.fingerprint };
    const lib = absoluteIn(this.libraryDir, m.file), job = this._jobFor(show.id, m.id);
    const src = fs.existsSync(lib) ? lib : job?.src;
    if (!src) return null;
    const key = `${m.fingerprint}|${m.thumbFrame}`;
    if (!this.thumbing.has(key)) {
      this.thumbing.set(key, this._task({ kind: 'thumb', file: src, fingerprint: m.fingerprint, frame: m.thumbFrame, thumbsDir: this.thumbsDir }).finally(() => this.thumbing.delete(key)));
    }
    await this.thumbing.get(key);
    return fs.existsSync(file) ? { file, fingerprint: m.fingerprint } : null;
  }

  /**
   * Raw PCM of a clip (or a medium) of the open show: sample frames [from, from+n) clipped to the track, in the file's
   * own encoding (§4c.1: the audio page converts). Throws with err.status for the route.
   * @returns {Promise<{body:Buffer, encoding:string, channels:number, rate:number, from:number, frames:number, total:number}>}
   */
  async pcm({ clip, media, from, n }) {
    const show = this.show;
    if (!show) throw httpError(404, 'no show is open');
    const c = clip ? show.clips.find((x) => x.id === clip) : null;
    const m = show.media.find((x) => x.id === (c ? c.mediaId : media));
    if (!m) throw httpError(404, 'no such clip');
    if (this._jobFor(show.id, m.id)) throw httpError(409, 'the file is still being copied into the library');
    const start = Math.trunc(Number(from)), count = Math.trunc(Number(n));
    if (!Number.isFinite(start) || !(count >= 1 && count <= PCM_MAX_FRAMES)) throw httpError(400, `from and n (1–${PCM_MAX_FRAMES}) are sample frames`);
    const mv = await this._movie(absoluteIn(this.libraryDir, m.file));
    const a = mv.index.audio;
    if (!a || !a.supported) throw httpError(415, a ? `the audio is ${a.reason}` : 'the clip has no audio');
    const ranges = pcmRanges(a, start, count);
    const body = Buffer.allocUnsafe(ranges.reduce((s, g) => s + g.length, 0));
    let o = 0;
    for (const g of ranges) {
      const { bytesRead } = await mv.fh.read(body, o, g.length, g.offset);
      if (bytesRead < g.length) throw httpError(500, 'the audio data ends early');
      o += g.length;
    }
    const frames = ranges.reduce((s, g) => s + g.frames, 0);
    return { body, encoding: a.encoding, channels: a.channels, rate: a.rate, from: ranges.length ? start + ranges[0].outFrame : Math.max(0, Math.min(a.frames, start)), frames, total: a.frames };
  }

  /** An open movie with its index, kept for the next requests (the PCM route asks every half second). */
  async _movie(file) {
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st) throw httpError(404, 'the file is missing from the library');
    let mv = this.movies.get(file);
    if (mv && (mv.size !== st.size || mv.mtimeMs !== st.mtimeMs)) { this.movies.delete(file); mv.fh.close().catch(() => {}); mv = null; }
    if (!mv) {
      const fh = await fs.promises.open(file, 'r');
      try {
        const read = async (off, len) => { const b = Buffer.allocUnsafe(Math.max(0, Math.min(len, st.size - off))); const { bytesRead } = await fh.read(b, 0, b.length, off); return b.subarray(0, bytesRead); };
        mv = { fh, size: st.size, mtimeMs: st.mtimeMs, index: await movIndexAsync(read, st.size), at: 0 };
      } catch (e) { await fh.close().catch(() => {}); throw httpError(422, e.message); }
      this.movies.set(file, mv);
      while (this.movies.size > MOVIES_OPEN) { const [k, old] = this.movies.entries().next().value; this.movies.delete(k); old.fh.close().catch(() => {}); }
    }
    mv.at = Date.now();
    return mv;
  }
}

const publicJob = (j) => ({ id: j.id, kind: j.kind, showId: j.showId, mediaId: j.mediaId, name: j.name, state: j.state, done: j.done, total: j.total, mbps: j.mbps, etaS: j.etaS, error: j.error });
const strip = (m) => ({ file: m.file, size: m.size, mtimeMs: m.mtimeMs, fingerprint: m.fingerprint, video: m.video, audio: m.audio });

/** The show's audio entry from probe's: format = the PCM encoding (null when it will not play). */
const audioEntry = (a) => (a ? { format: a.supported ? a.encoding : null, codec: a.format, codecName: a.codecName, supported: a.supported, channels: a.channels, rate: a.rate, frames: a.frames, duration: a.duration } : null);

/** The first column of `layerId` with no clip in `deck`. */
function firstFreeColumn(deck, layerId) {
  let c = 0; while (c < MAX_COLUMNS && deck.cells[`${layerId}:${c}`]) c++;
  return c;
}
