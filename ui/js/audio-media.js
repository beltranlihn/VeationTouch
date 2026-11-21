// The clips' audio in the room (MEDIA-SERVER.md §4c) — the audio window's side. For every clip with audio on a layer of the
// transport (state.media: the grid's layers and the experience's own), one player:
//
//   /api/media/pcm (the file's own PCM, this computer only) → decoded here, ahead of the clock, into the clip's ring
//   (SharedArrayBuffer, playback order: loops unrolled, bounce reversed — audio-core.js › streamSegments)
//   → 'vt-media-player' worklet in the SYNTHESIS context (audio-core.js › ClipReader: where the engine's clock says,
//     cubic resampling to 48 kHz, ±0.3 % steering, a jump beyond 80 ms; the crossfade / eject fades to the sample)
//   → clip gain (dB) → layer volume × mute (ramped) → routing matrix (audio-core.js › mediaRouting)
//   → the graph's clips bus (audio-graph.js › clipInput: before the wall high-pass, outside the pieces' fade, the common
//     "Clips" level) → master, mute, limiter, the devices: what the sound pieces go through too
//
// Sync (§4c.2): the engine owns the clock. A clip's position is playhead()'s elapsed = (E − startAt) / 1000 + offset, E the
// engine time at which a sample is HEARD — the synthesis context's time turned into engine time (getOutputTimestamp ↔
// performance.now ↔ ui/js/clock.js) plus the output latency (the device rings' target + the sink's latency) plus the room's
// audio.media.avOffsetMs (positive: the sound leaves earlier — the speakers' chain is slower than the projectors').
// Blackout fades the clips to silence over 0.5 s from state.media.blackoutAt; calibration mode mutes them (the players keep
// following the clock, so they come back where the picture is); the sound pieces duck by audio.media.duckDb under a clip.
// A clip still copying (409) or with audio this app cannot play stays silent, quietly retried / left alone.
//
// No DOM at load: the pure parts (decodePcm, clipVoices, clipAudible) run in Node tests (tests/audio-media.test.mjs).

import { createClipRing, ClipRingWriter, CLIP_RING_FRAMES, mediaRouting, streamSegments, dbToLin } from './audio-core.js';
import { rampTo } from './audio-graph.js';

export const BLACKOUT_MS = 500;   // = ui/js/output.js: the picture and the sound go dark together
const LEAD_S = 1.5;               // seconds of PCM kept ahead of the player
const CHUNK_S = 0.5, FIRST_CHUNK_S = 0.25; // one request (the first one small: it has the preroll to arrive)
const LAYER_RAMP_MS = 40, CLIPS_RAMP_MS = 60, CALIB_RAMP_MS = 120, DUCK_MS = 500, RETIRE_MS = 25;
const RETRY_COPY_MS = 1000, RETRY_ERROR_MS = 3000;
const MEDIA_DEFAULTS = { level: 1, avOffsetMs: 0, route: 'auto', width: 0.6, front: null, matrix: null, duckDb: -60 };

// ---------------------------------------------------------------------------------------------- pure parts

/**
 * Raw PCM in the file's encoding (the route's X-VT-Encoding: 's16le', 's24be', 'f32le', 'u8'…), interleaved → planar Float32.
 * @param {ArrayBuffer|Uint8Array} buf @param {string} encoding @param {number} channels @returns {Float32Array[]}
 */
export function decodePcm(buf, encoding, channels) {
  const m = /^([fsu])(8|16|24|32|64)(le|be)?$/.exec(String(encoding || ''));
  if (!m || !(channels >= 1)) throw Object.assign(new Error(`unknown PCM encoding "${encoding}"`), { status: 415 });
  const kind = m[1], bits = Number(m[2]), le = m[3] !== 'be', bps = bits / 8;
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / (bps * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0, p = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++, p += bps) {
      let v;
      if (kind === 'f') v = bits === 64 ? dv.getFloat64(p, le) : dv.getFloat32(p, le);
      else if (bits === 8) v = kind === 's' ? dv.getInt8(p) / 128 : (bytes[p] - 128) / 128;
      else if (bits === 16) v = dv.getInt16(p, le) / 32768;
      else if (bits === 24) { const x = le ? bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) : (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2]; v = ((x << 8) >> 8) / 8388608; }
      else v = dv.getInt32(p, le) / 2147483648;
      out[c][i] = Number.isFinite(v) ? v : 0;
    }
  }
  return out;
}

/** The PCM route of the engine (engine/server.js › /api/media/pcm): frames [from, from+n) of a clip, decoded. */
export async function fetchPcmHttp({ clipId, mediaId, from, n }) {
  const q = new URLSearchParams(clipId ? { clip: clipId } : { media: mediaId });
  q.set('from', String(Math.max(0, Math.floor(from)))); q.set('n', String(Math.max(1, Math.floor(n))));
  const r = await fetch(`/api/media/pcm?${q}`, { cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error(`PCM ${r.status}`), { status: r.status });
  const channels = Number(r.headers.get('X-VT-Channels'));
  return { from: Number(r.headers.get('X-VT-From')) || 0, channels, rate: Number(r.headers.get('X-VT-Rate')), planar: decodePcm(await r.arrayBuffer(), r.headers.get('X-VT-Encoding'), channels) };
}

/**
 * The voices state.media asks for: every play with audio on a layer, the incoming one of a crossfade fading in, the
 * outgoing one (`from`: replaced, ejected, at its end) fading out over the transition. PURE.
 * @returns {{playId:string, play:object, layerId:string, role:'play'|'from', volume:number, mute:boolean, fadeIn:object|null, fadeOut:object|null}[]}
 */
export function clipVoices(S) {
  const M = S?.media, out = [];
  if (!M) return out;
  const entries = [...Object.entries(M.layers || {}), ...(M.xlayer ? [['xlayer', M.xlayer]] : [])];
  for (const [layerId, e] of entries) {
    if (!e) continue;
    const volume = Number.isFinite(e.volume) ? Math.min(1, Math.max(0, e.volume)) : 1, mute = !!e.mute, T = Math.max(0, e.transitionMs || 0);
    if (e.play?.audio && e.play.playId) {
      const fadeIn = e.from && Number.isFinite(e.fadeAt) && T > 0 ? { at: e.fadeAt, ms: T } : null;
      out.push({ playId: e.play.playId, play: e.play, layerId, role: 'play', volume, mute, fadeIn, fadeOut: null });
    }
    if (e.from?.audio && e.from.playId) out.push({ playId: e.from.playId, play: e.from, layerId, role: 'from', volume, mute, fadeIn: null, fadeOut: { at: Number.isFinite(e.fadeAt) ? e.fadeAt : 0, ms: T } });
  }
  return out;
}

/** Is a clip with audio sounding (the sound pieces duck under it)? Not a held clip, a muted or silent layer, calibration mode. PURE. */
export function clipAudible(S) {
  const M = S?.media;
  if (!M || S.output?.calibrating) return false;
  if (!((S.profile?.audio?.media?.level ?? 1) > 0)) return false;
  const entries = [...Object.values(M.layers || {}), M.xlayer].filter(Boolean);
  return entries.some((e) => e.play?.audio && e.state === 'playing' && !e.mute && (e.volume ?? 1) > 0);
}

// ---------------------------------------------------------------------------------------------- the players

/**
 * The clips' audio of one synthesis context (its graph from audio-graph.js). The host calls update(state) on every state /
 * media message and tick() about every 100 ms (the clock to the players, the PCM ahead).
 */
export class ClipAudio {
  /**
   * @param {object} o
   * @param {BaseAudioContext} o.ctx  the synthesis context (an OfflineAudioContext in tests)
   * @param {object} o.room  buildRoomAudio()'s result (clipInput, setClips, duck)
   * @param {() => ({ctxT:number, engMs:number}|null)} o.timing  a context time and the engine time (ms) it is output at
   * @param {() => number} [o.latencyMs]  from the synthesis context's output to the speakers (device rings + sink)
   * @param {(walls:object[], opt:object) => object[]} [o.roomPlan]  engine/core/geometry.js › roomPlan (for 'spread')
   * @param {(q:{clipId:string, mediaId:string, from:number, n:number}) => Promise<{from:number, planar:Float32Array[]}>} [o.fetchPcm]
   */
  constructor({ ctx, room, timing, latencyMs = () => 0, roomPlan = null, fetchPcm = fetchPcmHttp, now = () => performance.now() }) {
    Object.assign(this, { ctx, room, timing, latencyMs, roomPlan, fetchPcm, now });
    this.players = new Map();   // playId → player
    this.S = null;
    this.offMeas = null;        // engine ms at context time 0, measured (smoothed)
    this.lat = null;            // output latency, ms (smoothed)
    this.av = 0; this.sentAv = null;
    this.off = null;            // what the players get: offMeas + latency + avOffsetMs
    this.clipsKey = null; this.ducked = null; this.planKey = null; this.plan = null;
    this.blackout = null;
    this.disposed = false;
  }

  /** The engine time (ms) at which what the context renders at time 0 is HEARD; null until the engine's clock is known. */
  _measure() {
    const t = this.timing();
    if (!t || !Number.isFinite(t.engMs) || !Number.isFinite(t.ctxT)) return this.off;
    const meas = t.engMs - t.ctxT * 1000;
    // the pair jitters by a render quantum or so: smoothed; a jump (a new engine) taken at once
    if (this.offMeas === null || Math.abs(meas - this.offMeas) > 30) this.offMeas = meas; else this.offMeas += 0.1 * (meas - this.offMeas);
    const L = Math.max(0, Number(this.latencyMs()) || 0) + (this.room.latencyMs || 0); // the devices' + the graph's own (limiter)
    this.lat = this.lat === null || Math.abs(L - this.lat) > 30 ? L : this.lat + 0.1 * (L - this.lat);
    this.off = this.offMeas + this.lat + this.av;
    return this.off;
  }

  /** The state changed (state or media message): players come and go, fades, layer levels, routes, Clips level, ducking. */
  update(S) {
    if (this.disposed || !S?.profile) return;
    this.S = S;
    const P = S.profile, A = { ...MEDIA_DEFAULTS, ...(P.audio?.media || {}) };
    const av = Number.isFinite(A.avOffsetMs) ? A.avOffsetMs : 0;
    if (av !== this.av) { this.av = av; if (this.off !== null) this._measure(); }
    if (this.off === null) this._measure();
    const voices = clipVoices(S), seen = new Set();
    const wallsKey = JSON.stringify(P.walls.map((w) => [w.id, w.width, w.turn]));
    if (wallsKey !== this.planKey) { this.planKey = wallsKey; this.plan = this.roomPlan ? this.roomPlan(P.walls, { close: true }) : null; }
    this.pending = false;
    for (const v of voices) {
      let pl = this.players.get(v.playId);
      if (!pl) {
        pl = this._create(v, S);
        if (!pl) continue;
      }
      seen.add(v.playId);
      this._apply(pl, v, P, A);
    }
    for (const [id, pl] of this.players) if (!seen.has(id)) this._retire(pl);
    this._levels(S, A);
  }

  _create(v, S) {
    const m = (S.show?.media || []).find((x) => x.id === v.play.mediaId), a = m?.audio;
    if (!a?.supported || !(a.channels >= 1) || !(a.rate > 0)) return null; // no audio this app plays (AAC…): silent
    if (this.off === null) { this.pending = true; return null; }      // the engine's clock is not known yet: next tick
    const ch = Math.min(16, a.channels | 0), ring = createClipRing(ch, CLIP_RING_FRAMES);
    const p = v.play;
    const node = new AudioWorkletNode(this.ctx, 'vt-media-player', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [ch], channelCount: ch, channelCountMode: 'explicit', channelInterpretation: 'discrete',
      processorOptions: { sab: ring.sab, rate: a.rate, startAt: p.startAt, offset: p.offset || 0, off: this.off, fadeIn: v.fadeIn, fadeOut: v.fadeOut },
    });
    const multi = (gain) => { const g = this.ctx.createGain(); g.channelCount = ch; g.channelCountMode = 'explicit'; g.channelInterpretation = 'discrete'; g.gain.value = gain; return g; };
    const gClip = multi(dbToLin(Number.isFinite(p.gainDb) ? p.gainDb : 0));
    const gLayer = multi(v.mute ? 0 : v.volume);
    const input = this.room.clipInput(null, ch);
    node.connect(gClip); gClip.connect(gLayer); gLayer.connect(input.node);
    const pl = {
      playId: v.playId, play: p, layerId: v.layerId, channels: ch, rate: a.rate, ring, writer: new ClipRingWriter(ring.sab),
      node, gClip, gLayer, input, routeKey: null, fadeKey: JSON.stringify([v.fadeIn, v.fadeOut]), level: v.mute ? 0 : v.volume,
      fetching: null, state: 'ok', retryAt: 0, error: null, stats: null, dead: false,
    };
    node.port.onmessage = (e) => { pl.stats = e.data; };
    this.players.set(v.playId, pl);
    this._pump(pl);
    return pl;
  }

  _apply(pl, v, P, A) {
    // the same play on a new engine clock (a restart restores it with startAt moved): the player follows, jumping if it must
    if (v.play.startAt !== pl.play.startAt || (v.play.offset || 0) !== (pl.play.offset || 0)) pl.node.port.postMessage({ startAt: v.play.startAt, offset: v.play.offset || 0 });
    pl.play = v.play;
    const fk = JSON.stringify([v.fadeIn, v.fadeOut]);
    if (fk !== pl.fadeKey) { pl.fadeKey = fk; pl.node.port.postMessage({ fadeIn: v.fadeIn, fadeOut: v.fadeOut }); }
    const level = v.mute ? 0 : v.volume;
    if (level !== pl.level) { pl.level = level; rampTo(this.ctx, pl.gLayer.gain, level, LAYER_RAMP_MS); }
    const q = {
      route: v.play.route ?? A.route, sources: pl.channels, channels: P.audio.channels, map: P.audio.map, sub: P.audio.sub,
      walls: P.walls, plan: this.plan, front: A.front, width: A.width, matrix: A.matrix,
    };
    const rk = JSON.stringify([q.route, q.channels, q.map, q.sub, this.planKey, q.front, q.width, q.matrix]);
    if (rk !== pl.routeKey) { pl.routeKey = rk; const r = mediaRouting(q); pl.route = r.route; pl.gains = r.gains; pl.input.setGains(r.gains); }
  }

  /** A play that is gone. It has normally faded out already; one that vanished (the show changed) gets a short fade. */
  _retire(pl) {
    if (pl.dead) return;
    pl.dead = true;
    this.players.delete(pl.playId);
    try { rampTo(this.ctx, pl.gLayer.gain, 0, RETIRE_MS); } catch { /* gone */ }
    const done = () => { try { pl.node.port.postMessage({ stop: true }); pl.node.disconnect(); pl.gClip.disconnect(); pl.gLayer.disconnect(); pl.input.disconnect(); } catch { /* gone */ } };
    if (this.disposed) done(); else setTimeout(done, RETIRE_MS * 3);
  }

  /** The common Clips level (room level × blackout × calibration mode) and the pieces' ducking. */
  _levels(S, A) {
    const M = S.media || {}, calib = !!S.output?.calibrating;
    const black = !!M.blackout;
    let ms = CLIPS_RAMP_MS;
    if (this.blackout !== null && black !== this.blackout.on) {
      // the fade runs from the engine instant it changed (as the picture's): what is left of it from now
      const at = Number.isFinite(M.blackoutAt) ? M.blackoutAt : null, E = this.off === null ? null : this.off + this.ctx.currentTime * 1000;
      const k = at === null || E === null ? 0 : Math.min(1, Math.max(0, (E - at) / BLACKOUT_MS));
      ms = Math.max(5, (1 - k) * BLACKOUT_MS);
    }
    if (this.calib !== undefined && calib !== this.calib) ms = Math.max(ms, CALIB_RAMP_MS);
    this.blackout = { on: black }; this.calib = calib;
    const level = Math.min(1, Math.max(0, A.level)) * (black ? 0 : 1) * (calib ? 0 : 1);
    if (level !== this.clipsKey) { this.clipsKey = level; this.room.setClips(level, ms); }
    const duck = clipAudible(S) ? Math.min(0, Math.max(-60, A.duckDb)) : 0;
    if (duck !== this.ducked) { this.ducked = duck; this.room.duck(duck, DUCK_MS); }
  }

  /** The playback frame a player's clock says now (heard). */
  _target(pl) { return ((this.off + this.ctx.currentTime * 1000 - pl.play.startAt) / 1000 + (pl.play.offset || 0)) * pl.rate; }

  /** Keeps LEAD_S of PCM ahead of the player (one request at a time per player). → a promise, done when it is filled. */
  _pump(pl) {
    if (pl.fetching) return pl.fetching;
    if (pl.dead || pl.state === 'unsupported' || this.off === null) return Promise.resolve();
    if (pl.retryAt && this.now() < pl.retryAt) return Promise.resolve();
    pl.fetching = this._fill(pl).finally(() => { pl.fetching = null; });
    return pl.fetching;
  }

  async _fill(pl) {
    try {
      for (let guard = 0; guard < 12; guard++) {
        const w = pl.writer, rd = w.reader(), T = this._target(pl);
        const at = rd.reading ? rd.at : Math.max(0, Math.floor(T));
        // the window holds nothing yet, or not where the player is (it jumped): start it there
        if (w.end === null || at < w.origin || at > w.end + pl.rate * 0.1) w.reset(Math.max(0, at - 2));
        else if (w.written > 2 ** 30) w.rebase(at - pl.rate);
        const want = Math.floor(at + LEAD_S * pl.rate) - w.end;
        const n = Math.min(want, Math.round((w.written ? CHUNK_S : FIRST_CHUNK_S) * pl.rate), w.room);
        if (n <= 0) break;
        const k0 = w.end, gen = w.gen;
        const chunk = await this._read(pl, k0, n);
        if (pl.dead) return;
        if (w.gen !== gen || w.end !== k0) continue; // the window moved meanwhile
        w.write(chunk, n);
      }
      pl.state = 'ok'; pl.retryAt = 0; pl.error = null;
    } catch (e) {
      const s = e?.status;
      // still being copied into the library (409): silent, asked again; audio this app cannot play (415/422): silent, left alone; anything else, 404 included (a file not yet there), is retried
      if (s === 409) { pl.state = 'copying'; pl.retryAt = this.now() + RETRY_COPY_MS; }
      else if (s === 415 || s === 422) { pl.state = 'unsupported'; pl.error = String(e.message || s); }
      else { pl.state = 'retry'; pl.retryAt = this.now() + RETRY_ERROR_MS; pl.error = String(e?.message || e); }
    }
  }

  /** Waits until every player has its PCM ahead (tests; in the window tick() does it on a timer). */
  async fill() { await Promise.all([...this.players.values()].map((pl) => this._pump(pl))); }

  /** Playback frames [k0, k0+n) of a player, planar (silence where the play reads nothing). */
  async _read(pl, k0, n) {
    const out = Array.from({ length: pl.channels }, () => new Float32Array(n));
    for (const s of streamSegments(pl.play, pl.rate, k0, n)) {
      if (s.src === null) continue;
      const first = s.dir === 1 ? s.src : s.src - s.n + 1;
      if (first + s.n <= 0) continue;
      const r = await this.fetchPcm({ clipId: pl.play.clipId, mediaId: pl.play.mediaId, from: Math.max(0, first), n: s.n - Math.max(0, -first) });
      const src = r.planar || [], len = src[0]?.length || 0;
      for (let c = 0; c < pl.channels; c++) {
        const x = src[c] || src[0], o = out[c];
        if (!x) continue;
        for (let j = 0; j < s.n; j++) {
          const f = (s.dir === 1 ? s.src + j : s.src - j) - r.from;
          if (f >= 0 && f < len) o[s.at + j] = x[f];
        }
      }
    }
    return out;
  }

  /** About every 100 ms: the clock to the players (an A/V offset change is a seek), the PCM ahead, players still to create. */
  tick() {
    if (this.disposed) return;
    const off = this._measure();
    if (off === null) return;
    const seek = this.sentAv !== null && this.av !== this.sentAv;
    this.sentAv = this.av;
    for (const pl of this.players.values()) { pl.node.port.postMessage({ off, seek }); this._pump(pl); }
    if (this.pending && this.S) this.update(this.S);
  }

  /** What the players are doing (the window's debugging handle and the tests). */
  stats() {
    return [...this.players.values()].map((pl) => {
      const rd = pl.writer.reader();
      return { playId: pl.playId, layerId: pl.layerId, route: pl.route, gains: pl.gains, state: pl.state, error: pl.error,
        ahead: rd.reading && pl.writer.end !== null ? (pl.writer.end - rd.at) / pl.rate : null, player: pl.stats };
    });
  }

  dispose() {
    this.disposed = true;
    for (const pl of [...this.players.values()]) this._retire(pl);
    this.players.clear();
  }
}
