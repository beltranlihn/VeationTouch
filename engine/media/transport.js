// The transport of the media server (MEDIA-SERVER.md §4.2, §2.1–2.2): which clip plays on each layer of the clip grid,
// since when, and what happens when it ends. The engine is the clock (D5): a play is "clip X, from engine time T"; every
// page (mixer, HAP player, audio) computes where it is with `playhead()` below and the engine's own clock (live.t). The
// engine never touches a frame or a sample; it only schedules the ends, the autopilot and the events.
//
// PURE: no timers, no files, no Node. The clock, the inheritance of settings (show.js › clipSettings), whether a clip can
// play (its file is there, not still copying) and the random numbers are injected; the facade (index.js) turns
// `nextDue()` into a timer and calls `advance()`. With a fake clock the whole sequence is reproducible.
// This file imports nothing so the pages can load it as /shared/transport.js: `playhead()` is THE formula.
//
//   trigger    clip.trigger: Normal (restart) or Toggle (a second launch ejects); crossfade from the clip that was there
//   column     column.trigger: every layer but the ignoreColumn ones; a layer with an empty cell in that column is cleared
//   step       column.next / column.prev: the next column that has clips (wraps)
//   clear      layer.clear / media.clearAll: an eject with the layer's transition
//   ends       loop · hold · clear · bounce · next / prev / random / first after `loops` passes, the next one started
//              early by its transition so the crossfade ENDS when the outgoing clip ends (Autopilot Transition
//              Compensation, Resolume 7.27)
//   xlayer     the reserved layer of the clips an experience launches (vt.media.play, MEDIA-SERVER.md §4.4)
//   preroll    a launch starts PREROLL_MS after the order (startAt = now + preroll): time for the first frame and PCM
//   preload    clip.preload (vt.media.preload): the clips the output page keeps ready to start (their first frame decoded),
//              PRELOAD_MAX at most, the oldest leaves; they belong to the live experience (cleared when it goes)

export const PREROLL_MS = 120;
export const PRELOAD_MAX = 8;
export const XLAYER = 'xlayer';
export const AUTOPILOT = ['next', 'prev', 'random', 'first'];
export const ENDS = ['loop', 'hold', 'clear', 'bounce', ...AUTOPILOT];
const BLENDS = ['normal', 'screen', 'add', 'multiply']; // = profile.js OUTPUT_BLENDS (not imported: pages load this file)
const MAX_TRANSITION_MS = 10000;
const MAX_STEPS = 10000; // events handled in one advance (a long catch-up after a restart)

/** The reserved layer's settings: what an experience launches plays once by default and is not part of any column. */
export const XLAYER_SETTINGS = Object.freeze({
  id: XLAYER, name: 'Experience clips', opacity: 1, blend: 'normal', bypass: false,
  transitionMs: 500, end: 'clear', trigger: 'restart', ignoreColumn: true, audio: Object.freeze({ volume: 1, mute: false, route: null }),
});

const r1 = (v) => Math.round(v * 10) / 10; // engine ms, to 0.1 ms

/** One pass of a play's segment, in seconds (never zero: a segment is at least one frame). */
export const passLength = (p) => Math.max(p.out - p.in, 1 / p.fps);

/**
 * Where a play is at engine time `now` (ms). THE formula — the engine schedules with it, the pages draw and sound with it.
 *   elapsed = (now − startAt) / 1000 + offset    seconds of playback since the first frame of the segment (≥ 0)
 *   len     = out − in                           one pass of the segment, seconds
 *   loop, next, prev, random, first   t = elapsed mod len        (autopilot: the engine replaces it after `loops` passes)
 *   hold, clear                       t = min(elapsed, len)      done once elapsed ≥ len: the last frame stays
 *   bounce                            q = elapsed mod 2·len      forward while q < len (t = q), then back (t = 2·len − q)
 *   time  = in + t                    seconds into the media file (the audio's position too: time × rate)
 *   frame = floor(time · fps), kept inside the segment's frames [floor(in·fps), ceil(out·fps) − 1] and [0, frames − 1]
 * Before startAt (the preroll) it is the segment's first frame, with started = false.
 * @param {{startAt:number, offset:number, in:number, out:number, fps:number, frames:number, end:string, loops:number}} p
 * @returns {{time:number, frame:number, pass:number, dir:1|-1, started:boolean, done:boolean}}
 */
export function playhead(p, now) {
  const len = passLength(p);
  const el = Math.max(0, (now - p.startAt) / 1000 + (p.offset || 0));
  let t, pass = 0, dir = 1, done = false;
  if (p.end === 'hold' || p.end === 'clear') {
    if (el >= len) { t = len; done = true; } else t = el;
  } else if (p.end === 'bounce') {
    const q = el % (2 * len);
    pass = Math.floor(el / len);
    if (q < len) t = q; else { t = 2 * len - q; dir = -1; }
  } else {
    pass = Math.floor(el / len);
    t = el - pass * len;
    if (AUTOPILOT.includes(p.end) && pass >= (p.loops || 1)) done = true;
  }
  const time = p.in + t;
  const top = Math.max(0, p.frames - 1);
  const first = Math.min(top, Math.max(0, Math.floor(p.in * p.fps + 1e-6)));
  const last = Math.max(first, Math.min(top, Math.ceil(p.out * p.fps - 1e-6) - 1));
  const frame = Math.max(first, Math.min(last, Math.floor(time * p.fps + 1e-6)));
  return { time, frame, pass, dir, started: now >= p.startAt, done };
}

/** When a play reaches its natural end (engine ms): hold / clear after one pass, autopilot after `loops`; loop and bounce never. */
export function endsAt(p) {
  const lenMs = passLength(p) * 1000, off = (p.offset || 0) * 1000;
  if (p.end === 'hold' || p.end === 'clear') return r1(p.startAt + lenMs - off);
  if (AUTOPILOT.includes(p.end)) return r1(p.startAt + (p.loops || 1) * lenMs - off);
  return null;
}

const mixOf = (l) => ({ opacity: l.opacity, blend: l.blend, bypass: l.bypass, volume: l.audio?.volume ?? 1, mute: !!l.audio?.mute });
const blankEntry = (id, layer) => ({ id, play: null, from: null, fadeAt: null, transitionMs: 0, held: false, mix: mixOf(layer) });

/** A play as clients see it (no bookkeeping). */
function pubPlay(p) {
  if (!p) return null;
  const { playId, clipId, mediaId, startAt, offset, in: inS, out, fps, frames, end, loops, endsAt: e, audio, gainDb, route, deckId, column } = p;
  return { playId, clipId, mediaId, startAt, offset, in: inS, out, fps, frames, end, loops, endsAt: e, audio, gainDb, route, deckId, column };
}
const pubEntry = (e) => ({
  state: e.play ? (e.held ? 'held' : 'playing') : 'empty',
  play: pubPlay(e.play), from: pubPlay(e.from), fadeAt: e.fadeAt, transitionMs: e.transitionMs, ...e.mix,
});
const clonePlay = (p) => { if (!p) return null; const { _next, ...rest } = p; return { ...rest }; };

function numIn(v, min, max, what) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!(n >= min && n <= max)) throw new Error(`${what}: a number from ${min} to ${max}`);
  return n;
}

export class Transport {
  /**
   * @param {object} o
   * @param {() => number} [o.now] the engine clock, ms (performance.now(): the clock of live.t)
   * @param {(clip:object, layer:object) => {end, trigger, transitionMs, loops, route}} o.settings show.js › clipSettings
   * @param {(clip:object) => string|null} [o.playable] why a clip cannot play right now (missing, still copying), or null
   * @param {() => number} [o.random] for the 'random' autopilot and the session part of the play ids
   * @param {number} [o.preroll] ms between an order and the first frame
   */
  constructor({ now = () => performance.now(), settings, playable = () => null, random = Math.random, preroll = PREROLL_MS } = {}) {
    if (typeof settings !== 'function') throw new Error('Transport needs settings(clip, layer) (engine/media/show.js › clipSettings)');
    Object.assign(this, { now, settingsOf: settings, playable, random, preroll });
    this.show = null;
    this.entries = new Map(); // layerId → { id, play, from, fadeAt, transitionMs, held, mix }, in the show's order
    this.x = blankEntry(XLAYER, XLAYER_SETTINGS);
    this.blackout = false;
    this.blackoutAt = null;
    this.master = 1;          // the room's video level (media.master): the output page dims the image by it
    this.solo = null;         // the layer soloed (layer.solo): the others reach the output as bypassed; never written in the show
    this.column = null;       // { deckId, index }: the column last launched (column.next / prev go on from it)
    this.rev = 0;             // moves on with every change clients must see
    this.seq = 0;
    this.sid = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0'); // play ids of this session never repeat an older one
    this.events = [];         // { event: 'started' | 'ended' | 'error', playId, clipId, layerId, … } for the facade to send
    this.preloads = [];       // clip ids kept ready by the output page (clip.preload), oldest first
  }

  // ------------------------------------------------------------------ state

  /** What clients get as state.media (plus the facade's preset, import and problems). */
  state() {
    return {
      rev: this.rev, prerollMs: this.preroll, blackout: this.blackout, blackoutAt: this.blackoutAt, master: this.master,
      solo: this.solo && this.entries.has(this.solo) ? this.solo : null,
      column: this.column ? { ...this.column } : null, preload: [...this.preloads],
      // a soloed layer hides the others from the output page: `bypass` says so, `bypassSet` is the layer's own switch
      layers: Object.fromEntries([...this.entries].map(([id, e]) => {
        const p = pubEntry(e);
        return [id, this.solo && this.entries.has(this.solo) && id !== this.solo ? { ...p, bypassSet: p.bypass, bypass: true } : p];
      })),
      xlayer: pubEntry(this.x),
    };
  }

  /** Something is on a layer (playing, held, or still fading out). */
  busy() { return this._all().some((e) => e.play || e.from); }

  takeEvents() { const e = this.events; this.events = []; return e; }

  // ------------------------------------------------------------------ the show

  /**
   * The show opened or was edited. Another show stops everything (its clips belong to the old one); an edit keeps what
   * plays, stops at once the plays whose clip was removed, follows the layers that came or went and takes the layers'
   * mix from the show.
   */
  setShow(show) {
    const before = this._key();
    const same = !!(this.show && show && this.show.id === show.id);
    this.show = show || null;
    const next = new Map();
    for (const l of show?.layers || []) {
      const e = (same && this.entries.get(l.id)) || blankEntry(l.id, l);
      e.mix = mixOf(l);
      next.set(l.id, e);
    }
    // an entry that is not carried over (another show, a layer that went) ends its plays: 'ended' for each
    for (const [id, e] of this.entries) if (next.get(id) !== e) { this._end(e.play, 'removed'); this._end(e.from, 'removed'); }
    for (const e of [...next.values(), this.x]) {
      for (const k of ['play', 'from']) {
        const p = e[k];
        if (p && (!same || !show.clips.some((c) => c.id === p.clipId))) { this._end(p, 'removed'); e[k] = null; if (k === 'play') e.held = false; }
        if (e[k]) delete e[k]._next; // an edit may change the autopilot's neighbour
      }
    }
    this.entries = next;
    const keep = same ? this.preloads.filter((id) => show.clips.some((c) => c.id === id)) : [];
    if (keep.length !== this.preloads.length) { this.preloads = keep; this.rev++; }
    if (!same) this.column = null;
    else if (this.column && !show.decks.some((d) => d.id === this.column.deckId)) this.column = null;
    if (this._key() !== before) this.rev++;
  }

  // ------------------------------------------------------------------ commands

  /**
   * Launches a clip: `{clipId, layerId?, deckId?}` (the layer of its cell when no layer is given) or a cell
   * `{deckId, layerId, column}`. Optional `end`, `transitionMs`, `loops` override the clip's settings for this play
   * (what vt.media.play passes); `layerId: 'xlayer'` is the experience's own layer.
   * @returns {{playId:string|null, layerId:string, startAt?:number, toggled?:true}}
   */
  trigger(args = {}, { fromColumn = false } = {}) {
    if (!this.show) throw new Error('no show is open');
    const { clip, layerId, deckId, column } = this._target(args);
    const e = this._entry(layerId), layer = this._layer(layerId);
    if (!e || !layer) throw new Error(`unknown layer "${layerId}"`);
    const why = this.playable(clip);
    if (why) throw new Error(why);
    const s = { ...this.settingsOf(clip, layer) };
    if (layerId === XLAYER) s.trigger = 'restart'; // what an experience launches always starts (a clip's own Toggle is the grid's)
    if (args.end !== undefined) { if (!ENDS.includes(args.end)) throw new Error(`end: one of ${ENDS.join(', ')}`); s.end = args.end; }
    if (args.transitionMs !== undefined && args.transitionMs !== null) s.transitionMs = Math.round(numIn(args.transitionMs, 0, MAX_TRANSITION_MS, 'transitionMs'));
    if (args.loops !== undefined) s.loops = Math.round(numIn(args.loops, 1, 99, 'loops'));
    const now = this.now(), cur = e.play;
    // Toggle: the clip that is on this layer, launched again, goes (a column never toggles: it is a scene change)
    if (!fromColumn && args.offset === undefined && s.trigger === 'toggle' && cur && cur.clipId === clip.id) {
      this._eject(e, layer.transitionMs, now, 'toggled');
      this.rev++;
      return { playId: null, layerId, toggled: true };
    }
    const p = this._play(clip, layerId, s, r1(now + this.preroll), deckId, column);
    // `offset` (seconds into one pass of the segment): a launch that starts there — the clip panel's scrub
    if (args.offset !== undefined) { p.offset = Math.max(0, Math.min(passLength(p) - 0.001, numIn(args.offset, 0, 1e6, 'offset'))); p.endsAt = endsAt(p); }
    if (cur && cur.clipId === clip.id) {
      // Normal on the clip that is already there: back to its start, no crossfade with itself
      this._end(cur, 'restarted');
      e.play = p;
    } else {
      if (cur) { this._end(cur, 'replaced'); if (e.from && e.from !== cur) this._end(e.from, 'replaced'); e.from = cur; }
      e.play = p;
      // the outgoing clip (or the one still fading out) stays at full until startAt, then fades over the transition
      e.fadeAt = p.startAt;
      e.transitionMs = s.transitionMs;
    }
    e.held = false;
    this.rev++;
    return { playId: p.playId, layerId, startAt: p.startAt };
  }

  /**
   * clip.preload (vt.media.preload): the output page decodes the first frame of this clip and keeps it, so a launch of
   * it starts without a wait. PRELOAD_MAX at most: the oldest leaves; asking again for one makes it the newest.
   * @returns {{preload: string[]}}
   */
  preload(clipId) {
    if (!this.show) throw new Error('no show is open');
    const clip = this.show.clips.find((c) => c.id === clipId);
    if (!clip) throw new Error(`unknown clip "${clipId}"`);
    const why = this.playable(clip);
    if (why) throw new Error(why);
    const next = [...this.preloads.filter((id) => id !== clip.id), clip.id].slice(-PRELOAD_MAX);
    if (next.join() !== this.preloads.join()) { this.preloads = next; this.rev++; }
    return { preload: [...this.preloads] };
  }

  /** The live experience went: the clips it asked to keep ready are let go. */
  clearPreload() { if (this.preloads.length) { this.preloads = []; this.rev++; } }

  /** column.trigger: the scene change. → { deckId, column, plays, errors } (a clip that cannot play is reported, the others go). */
  columnTrigger(args = {}) {
    if (!this.show) throw new Error('no show is open');
    const deck = this._deck(args.deckId);
    const col = Number(args.column);
    if (!Number.isInteger(col) || col < 0 || col >= deck.columns) throw new Error(`column: a whole number from 0 to ${deck.columns - 1}`);
    const plays = [], errors = [];
    for (const layer of this.show.layers) {
      if (layer.ignoreColumn) continue; // a background that survives the scene changes
      const e = this.entries.get(layer.id);
      if (deck.cells[`${layer.id}:${col}`]) {
        try { plays.push(this.trigger({ deckId: deck.id, layerId: layer.id, column: col }, { fromColumn: true })); }
        catch (err) { errors.push({ layerId: layer.id, error: err.message }); }
      } else if (e.play) this._eject(e, layer.transitionMs, this.now(), 'column');
    }
    this.column = { deckId: deck.id, index: col };
    this.rev++;
    return { deckId: deck.id, column: col, plays, errors };
  }

  /** column.next / column.prev: the next (dir 1) or previous (dir −1) column of the deck that has clips, wrapping. */
  step(dir = 1, args = {}) {
    if (!this.show) throw new Error('no show is open');
    const deck = this.column && !args.deckId ? this.show.decks.find((d) => d.id === this.column.deckId) || this._deck() : this._deck(args.deckId);
    const cols = [];
    for (let c = 0; c < deck.columns; c++) if (this.show.layers.some((l) => !l.ignoreColumn && deck.cells[`${l.id}:${c}`])) cols.push(c);
    if (!cols.length) throw new Error('no column of this deck has clips');
    const cur = this.column && this.column.deckId === deck.id ? this.column.index : null;
    let col;
    if (cur === null) col = dir < 0 ? cols[cols.length - 1] : cols[0];
    else if (dir < 0) col = [...cols].reverse().find((c) => c < cur) ?? cols[cols.length - 1];
    else col = cols.find((c) => c > cur) ?? cols[0];
    return this.columnTrigger({ deckId: deck.id, column: col });
  }

  /** layer.clear: ejects with the layer's transition (or `transitionMs`). */
  clear(layerId, args = {}) {
    const e = this._entry(layerId), layer = this._layer(layerId);
    if (!e || !layer) throw new Error(`unknown layer "${layerId}"`);
    const T = args.transitionMs !== undefined && args.transitionMs !== null ? Math.round(numIn(args.transitionMs, 0, MAX_TRANSITION_MS, 'transitionMs')) : layer.transitionMs;
    if (!e.play) return { cleared: false };
    this._eject(e, T, this.now(), args.reason || 'cleared');
    this.rev++;
    return { cleared: true };
  }

  /** media.clearAll (grid and experience layer), or only the grid (a preset with onLoad 'clear'), or only the experience's. */
  clearAll({ grid = true, x = true, reason = 'cleared' } = {}) {
    const now = this.now();
    let n = 0;
    for (const e of [...(grid ? this.entries.values() : []), ...(x ? [this.x] : [])]) {
      if (!e.play) continue;
      this._eject(e, this._layer(e.id).transitionMs, now, reason);
      n++;
    }
    if (n) this.rev++;
    return { cleared: n };
  }

  /** layer.set: the live mix of a layer. Validated here; the facade saves it in the show. */
  setMix(layerId, args = {}) {
    const e = this._entry(layerId);
    if (!e) throw new Error(`unknown layer "${layerId}"`);
    const m = { ...e.mix };
    if ('opacity' in args) m.opacity = Math.round(numIn(args.opacity, 0, 1, 'opacity') * 1000) / 1000;
    if ('volume' in args) m.volume = Math.round(numIn(args.volume, 0, 1, 'volume') * 1000) / 1000;
    if ('blend' in args) { if (!BLENDS.includes(args.blend)) throw new Error(`blend: one of ${BLENDS.join(', ')}`); m.blend = args.blend; }
    for (const k of ['bypass', 'mute']) if (k in args) { if (typeof args[k] !== 'boolean') throw new Error(`${k}: true or false`); m[k] = args[k]; }
    if (JSON.stringify(m) !== JSON.stringify(e.mix)) { e.mix = m; this.rev++; }
    return { ...m };
  }

  /** media.master: the room's video level 0…1 (the output page dims the image by it; 1 = untouched). */
  setMaster(v) {
    const n = Math.round(numIn(v, 0, 1, 'value') * 1000) / 1000;
    if (n !== this.master) { this.master = n; this.rev++; }
    return { master: this.master };
  }

  /** layer.solo: only that layer is shown (null: all again). Not an edit of the show: it goes with the session. */
  setSolo(layerId) {
    if (layerId !== null && !this.entries.has(layerId)) throw new Error(`unknown layer "${layerId}"`);
    if (layerId !== this.solo) { this.solo = layerId; this.rev++; }
    return { solo: this.solo };
  }

  /** media.blackout: a flag with the instant it changed; the output and audio pages fade on it. The plays go on underneath. */
  setBlackout(on) {
    if (typeof on !== 'boolean') throw new Error('on: true or false');
    if (on !== this.blackout) { this.blackout = on; this.blackoutAt = r1(this.now()); this.rev++; }
    return { blackout: this.blackout };
  }

  /**
   * media.report: a page could not play a play (its file is unreadable: a drive pulled out, a file cut short). The output
   * page has already held its last image for a second (MEDIA-SERVER.md §4d.3, step 6); the layer is ejected now with
   * its transition (the image fades out as with any eject), with an 'error' event.
   */
  fail(playId, error) {
    const e = this._all().find((x) => x.play?.playId === playId);
    if (!e) return { ejected: false };
    const p = e.play;
    this.events.push({ event: 'error', playId, clipId: p.clipId, layerId: e.id, error: String(error || 'the clip could not be played').slice(0, 300) });
    this._eject(e, this._layer(e.id)?.transitionMs ?? 0, this.now(), 'error');
    this.rev++;
    return { ejected: true };
  }

  // ------------------------------------------------------------------ the clock

  /** The engine time of the next thing to do (a start, an end, an autopilot switch, a fade that finishes), or null. */
  nextDue() {
    let at = null;
    for (const it of this._items()) if (at === null || it.at < at) at = it.at;
    return at;
  }

  /**
   * Does everything due by `now`, in time order. `silent`: no events (catching up after a restart: what happened while
   * the engine was down is not news). → the number of steps done.
   */
  advance(now = this.now(), { silent = false } = {}) {
    let n = 0;
    for (; n < MAX_STEPS; n++) {
      const due = this._items().filter((i) => i.at <= now).sort((a, b) => a.at - b.at || a.k - b.k);
      if (!due.length) break;
      const keep = this.events.length;
      this._do(due[0]);
      if (silent) this.events.length = keep;
    }
    return n;
  }

  _items() {
    const out = [];
    for (const e of this._all()) {
      const p = e.play, f = e.from;
      if (f) {
        if (!f._ended && f.endsAt !== null) out.push({ at: f.endsAt, k: 0, kind: 'fromEnded', e });
        out.push({ at: e.fadeAt + e.transitionMs, k: 1, kind: 'drop', e });
      }
      if (!p) continue;
      if (!p._started) out.push({ at: p.startAt, k: 2, kind: 'started', e });
      if (p.endsAt === null || e.held) continue;
      if (p.end === 'clear') out.push({ at: p.endsAt, k: 3, kind: 'eject', e });
      else if (p.end === 'hold') out.push({ at: p.endsAt, k: 3, kind: 'hold', e });
      else { const n = this._next(e); out.push({ at: n.at, k: 3, kind: 'auto', e, n }); }
    }
    return out;
  }

  _do(it) {
    const { e } = it;
    switch (it.kind) {
      case 'started':
        e.play._started = true;
        this.events.push({ event: 'started', playId: e.play.playId, clipId: e.play.clipId, layerId: e.id, startAt: e.play.startAt });
        return;
      case 'fromEnded': this._end(e.from, 'end'); return;
      case 'drop': this._end(e.from, 'end'); e.from = null; this.rev++; return;
      case 'hold': e.held = true; this._end(e.play, 'end'); this.rev++; return;
      case 'eject': this._eject(e, this._layer(e.id).transitionMs, e.play.endsAt, 'end'); this.rev++; return;
      case 'auto': this._autopilot(e, it.n); return;
      default:
    }
  }

  /** The switch of an autopilot: the next clip starts at n.start (its crossfade ends when the current one ends). */
  _autopilot(e, n) {
    const p = e.play, layer = this._layer(e.id);
    let q = null;
    if (!n.same) {
      try {
        const clip = this.show.clips.find((c) => c.id === n.clipId);
        if (!clip || this.playable(clip)) throw new Error('gone');
        q = this._play(clip, e.id, this.settingsOf(clip, layer), n.start, p.deckId, n.column);
      } catch { p._next = { same: true, at: p.endsAt - this.preroll, start: p.endsAt }; return; } // it went meanwhile: go round again
    } else {
      const clip = this.show.clips.find((c) => c.id === p.clipId);
      q = this._play(clip, e.id, { end: p.end, loops: p.loops, route: p.route }, p.endsAt, p.deckId, p.column);
      q.in = p.in; q.out = p.out; q.endsAt = endsAt(q);
    }
    if (e.from && e.from !== p) this._end(e.from, 'replaced');
    e.from = p;            // its 'ended' comes at its own end (fromEnded), when the crossfade finishes
    e.play = q;
    e.fadeAt = q.startAt;
    e.transitionMs = n.same ? 0 : n.T;
    e.held = false;
    this.rev++;
  }

  /** The autopilot's next clip, picked once per play (a 'random' must not change its mind): {clipId, column, T, start, at} or {same}. */
  _next(e) {
    const p = e.play;
    if (p._next) return p._next;
    const layer = this._layer(e.id);
    let pick = null;
    for (const c of this._neighbours(p)) {
      const clip = this.show.clips.find((x) => x.id === c.clipId);
      if (clip && !this.playable(clip)) { pick = { ...c, clip }; break; }
    }
    if (!pick || (pick.clipId === p.clipId && pick.column === p.column)) {
      p._next = { same: true, at: p.endsAt - this.preroll, start: p.endsAt };
    } else {
      const T = this.settingsOf(pick.clip, layer).transitionMs;
      const start = r1(Math.max(p.startAt, p.endsAt - T)); // a clip shorter than the transition: the crossfade starts with it
      p._next = { same: false, clipId: pick.clipId, column: pick.column, T: r1(p.endsAt - start), start, at: start - this.preroll };
    }
    return p._next;
  }

  /** The other clips of a play's row (its layer in its deck), in the order its end mode tries them. */
  _neighbours(p) {
    const deck = this.show.decks.find((d) => d.id === p.deckId);
    if (!deck || p.column === null) return [];
    const row = [];
    for (let c = 0; c < deck.columns; c++) { const id = deck.cells[`${p.layerId}:${c}`]; if (id) row.push({ clipId: id, column: c }); }
    const at = p.column;
    switch (p.end) {
      case 'next': return [...row.filter((r) => r.column > at), ...row.filter((r) => r.column <= at)];
      case 'prev': return [...row.filter((r) => r.column < at).reverse(), ...row.filter((r) => r.column >= at).reverse()];
      case 'first': return row;
      case 'random': {
        const others = row.filter((r) => r.column !== at);
        for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
        return [...others, ...row.filter((r) => r.column === at)];
      }
      default: return [];
    }
  }

  // ------------------------------------------------------------------ restarts (index.js writes <data>/run/transport.json)

  /** Everything needed to continue after a restart. */
  dump() {
    return {
      sid: this.sid, seq: this.seq, rev: this.rev, blackout: this.blackout, blackoutAt: this.blackoutAt, column: this.column, preload: [...this.preloads],
      entries: this._all().map((e) => ({ id: e.id, play: clonePlay(e.play), from: clonePlay(e.from), fadeAt: e.fadeAt, transitionMs: e.transitionMs, held: e.held, mix: e.id === XLAYER ? { ...e.mix } : null })),
    };
  }

  /**
   * Takes a dump back. `shift` (ms) turns the old engine's times into this one's (each process has its own clock).
   * Plays on layers or of clips that no longer exist are left out. Call advance(now, {silent: true}) after.
   */
  restore(d, shift = 0) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return;
    const mv = (t) => (typeof t === 'number' ? r1(t + shift) : null);
    const ok = (p) => p && typeof p === 'object' && this.show?.clips.some((c) => c.id === p.clipId) && Number.isFinite(p.startAt) && p.fps > 0;
    const back = (p) => (ok(p) ? { ...p, startAt: mv(p.startAt), endsAt: mv(p.endsAt) } : null);
    for (const s of d.entries) {
      const e = s.id === XLAYER ? this.x : this.entries.get(s.id);
      if (!e) continue;
      e.play = back(s.play); e.from = back(s.from);
      e.fadeAt = mv(s.fadeAt); e.transitionMs = Number(s.transitionMs) || 0; e.held = !!s.held && !!e.play;
      if (!e.from) e.fadeAt = e.play ? e.fadeAt : null;
      if (s.id === XLAYER && s.mix) e.mix = { ...e.mix, ...s.mix };
    }
    this.blackout = !!d.blackout; this.blackoutAt = mv(d.blackoutAt);
    this.column = d.column && this.show?.decks.some((x) => x.id === d.column.deckId) ? { deckId: d.column.deckId, index: d.column.index } : null;
    this.preloads = (Array.isArray(d.preload) ? d.preload : []).filter((id) => this.show?.clips.some((c) => c.id === id)).slice(-PRELOAD_MAX);
    this.seq = Math.max(this.seq, Number(d.seq) || 0);
    this.rev = Math.max(this.rev, Number(d.rev) || 0) + 1;
  }

  // ------------------------------------------------------------------ helpers

  _all() { return [...this.entries.values(), this.x]; }
  _entry(id) { return id === XLAYER ? this.x : this.entries.get(id) || null; }
  _layer(id) { return id === XLAYER ? XLAYER_SETTINGS : this.show?.layers.find((l) => l.id === id) || null; }
  _deck(id) {
    const d = id === undefined || id === null ? this.show.decks[0] : this.show.decks.find((x) => x.id === id);
    if (!d) throw new Error(`unknown deck "${id}"`);
    return d;
  }
  _key() { return JSON.stringify([this.column, [...this.entries, [XLAYER, this.x]].map(([id, e]) => [id, e.play?.playId, e.from?.playId, e.held, e.mix])]); }

  /** The clip of a trigger and the cell it was launched from (the autopilot's row). */
  _target(args) {
    const S = this.show;
    if (typeof args.clipId === 'string') {
      const clip = S.clips.find((c) => c.id === args.clipId);
      if (!clip) throw new Error(`unknown clip "${args.clipId}"`);
      let layerId = typeof args.layerId === 'string' ? args.layerId : null, deckId = null, column = null;
      if (layerId !== XLAYER) {
        for (const d of args.deckId ? S.decks.filter((x) => x.id === args.deckId) : S.decks) {
          for (const [k, v] of Object.entries(d.cells)) {
            if (v !== clip.id) continue;
            const [L, c] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
            if (layerId && L !== layerId) continue;
            if (deckId === null || (d.id === deckId && c < column)) { layerId = L; deckId = d.id; column = c; }
          }
          if (deckId !== null) break;
        }
      }
      if (!layerId) throw new Error(`"${clip.name}" is not in the grid: say which layer`);
      return { clip, layerId, deckId, column };
    }
    const deck = this._deck(args.deckId);
    const col = Number(args.column);
    if (typeof args.layerId !== 'string' || !Number.isInteger(col) || col < 0) throw new Error('clip.trigger: {clipId} or a cell {deckId, layerId, column}');
    const clipId = deck.cells[`${args.layerId}:${col}`];
    if (!clipId) throw new Error('that cell is empty');
    return { clip: S.clips.find((c) => c.id === clipId), layerId: args.layerId, deckId: deck.id, column: col };
  }

  _play(clip, layerId, s, startAt, deckId, column) {
    const m = this.show.media.find((x) => x.id === clip.mediaId);
    const v = m?.video || {};
    const fps = v.fps > 0 ? v.fps : 30, frames = Math.max(1, v.frames || 1);
    const dur = v.duration > 0 ? v.duration : frames / fps;
    const inS = Math.min(Math.max(0, clip.in || 0), dur);
    const out = clip.out !== null && clip.out !== undefined && clip.out > inS ? Math.min(clip.out, dur) : dur;
    const p = {
      playId: `${this.sid}-${++this.seq}`, clipId: clip.id, mediaId: m?.id ?? null, layerId, startAt, offset: 0,
      in: inS, out, fps, frames, end: s.end, loops: s.loops || 1, endsAt: null,
      audio: !!m?.audio?.supported, gainDb: clip.audio?.gainDb ?? 0, route: s.route ?? null,
      deckId: deckId ?? null, column: column ?? null,
    };
    p.endsAt = endsAt(p);
    return p;
  }

  /** The layer's clip goes, fading out over T ms from `at`; the layer is empty once the fade is over. */
  _eject(e, T, at, reason) {
    const p = e.play;
    this._end(p, reason);
    if (e.from && e.from !== p) this._end(e.from, reason);
    e.from = p; e.play = null; e.fadeAt = r1(at); e.transitionMs = T; e.held = false;
  }

  /** A play stops being news: 'ended' once, with why ('end', 'replaced', 'restarted', 'toggled', 'cleared', 'column', 'removed', 'error', …). */
  _end(p, reason) {
    if (!p || p._ended) return;
    p._ended = true;
    this.events.push({ event: 'ended', playId: p.playId, clipId: p.clipId, layerId: p.layerId, reason });
  }
}
