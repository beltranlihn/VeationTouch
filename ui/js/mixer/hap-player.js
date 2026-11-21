// One HAP clip playing on the room output (MEDIA-SERVER.md §3.1, §4.5): which frames to ask the decode workers for, what
// to keep, what to show. Ported from VEATION (Immersive Studio Pro · app.js › hapPlayer, driveHAP, hapPedir, hapEntregar,
// hapSeek, hapAparcar, hapVuelta, hapSoltarVuelta), same owner, without the editor (nests, strides, the sentinel): here
// a clip goes forward, loops, bounces or holds, and its frame is the transport's (engine/media/transport.js › playhead).
// Pure: no DOM, no GL — `deliver(bitmap, idx)` puts a frame on the layer's texture (ui/js/mixer/media-layers.js), the
// pool (ui/js/mixer/hap-pool.js) carries the requests. tests/hap-player.test.mjs runs it in Node with fake bitmaps.
//
// The request WINDOW (driveHAP, literal): every output frame the player asks for K frames ahead starting at
//   playhead + L,   L = ⌈latency·fps⌉ (≤ 12) — the frames the playhead moves while one is decoded —,
//   K = max(2, min(8, ⌈fps·0.12⌉ + 1)),
// with `latency` the measured request → ImageBitmap time (moving average). What is before playhead + L would arrive
// late; what is in flight arrives by itself. NOT an optimisation: without it every free worker asked for the next frame
// and F0 measured 93–134 decodes a second, video memory from 2.4 to 6.9 GB in two seconds and the page at 12–20 fps
// (MEDIA-SERVER-MEDIDAS.md §4). Held bitmaps ≤ L + K + 1 + the workers + the loop prefetch.
//
// Rules carried over (each one closed a fault in VEATION):
// - LATE BUT NEWER is shown: a frame that arrives after the playhead passed it, but is newer than what is on screen, goes
//   on screen (throwing it away "for being old" delivered nothing with two layers: 2 frames a second).
// - …only if it belongs to THIS trajectory (`tray`, +1 at every jump): after a jump (a loop wrap, a restart) what was in
//   flight is not shown as "newer".
// - The LOOP WRAP is prepared: in the last frames before the wrap the first frames of the segment are asked for apart
//   (`wrap`), without touching what plays; the jump adopts them and shows the first frame in that very output frame
//   (otherwise the old last frame stayed on screen for L frames at every pass: R401 in VEATION). The same for the turn
//   of a bounce.
// - PARK: a player that is not drawn (calibration, bypass, the page's frames stopped) stops asking and closes every
//   ImageBitmap it holds; what is already on the texture stays (the last image seen). In-flight frames that come back
//   to a parked player are closed at once.

export const FAIL_LIMIT = 3;    // read / decode failures in a row before a clip is broken
export const STALL_MS = 3000;   // a frame asked for this long ago and not back: the file does not answer (a drive pulled out)
// errors that no retry can fix: the clip is broken at the first one
const FATAL = /^(no-moov|mov-bad|not-hap|hapm|not-supported|truncated|no-node|no-webgl2|no-s3tc|no-offscreen):/;

/** K and L of the request window (driveHAP): {K, L} for a clip at `fps` with `latMs` of measured latency. */
export function requestWindow(fps, latMs) {
  const K = Math.max(2, Math.min(8, Math.ceil(fps * 0.12) + 1));
  const L = Math.min(12, Math.ceil((latMs * fps) / 1000));
  return { K, L };
}

export class HapPlayer {
  /**
   * @param {object} o
   * @param {string} o.path the file
   * @param {(bm: ImageBitmap, idx: number) => void} o.deliver puts a frame on screen; it owns (and closes) the bitmap
   * @param {object} [o.pool] the HapPool (null in pure tests: requests are then taken by hand with next())
   * @param {() => number} [o.now] the page clock (ms)
   */
  constructor({ path, deliver, pool = null, now = () => performance.now(), ix = null }) {
    Object.assign(this, { path, deliver, pool, now });
    this.ix = ix;                 // the video index {fourcc, width, height, count, fps, …} (null until the worker read it)
    this.cache = new Map();       // idx → ImageBitmap, ahead of the playhead
    this.pend = new Set();        // idx in flight
    this.pendT = new Map();       // idx → when it was asked for
    this.need = [];               // what to ask for, most urgent first
    this.wrap = null;             // idx → ImageBitmap prefetched for the coming wrap / turn
    this.wrapNeed = null; this.wrapAt = -1;
    this.quiere = -1;             // the frame the clock wants now
    this.shown = -1;              // the frame on the texture (-1: none, or from elsewhere)
    this.dir = 1; this.ventana = 8; this.lat = 30; this.tray = 0;
    this.playing = false; this.parked = false; this.closed = false;
    this.broken = null; this.failures = 0; this.served = 0; this.lateIdx = -1;
    this.stats = { arrived: 0, delivered: 0, late: 0, lateShown: 0, dropped: 0, maxHeld: 0, wrapsAdopted: 0, lastLatency: 0 };
  }

  /** Bitmaps this player holds (cache + loop prefetch): 0 once parked. */
  get held() { return this.cache.size + (this.wrap ? this.wrap.size : 0); }
  /** It may ask for frames. */
  get active() { return !!this.ix && !this.closed && !this.parked && !this.broken; }

  /** The worker read the index. */
  setInfo(ix) { this.ix = ix; this.pool?.pump(); }

  /**
   * One output frame: the clock wants frame `idx`, moving in direction `dir` inside the play's segment [first, last].
   * `wrapTo`: the frames that come right after the next wrap or turn (asked for apart), or null.
   * @returns {boolean} the texture holds the wanted frame
   */
  drive(idx, { dir = 1, first = 0, last = Infinity, fps = 30, wrapTo = null } = {}) {
    if (this.closed || !this.ix) { this.quiere = idx; return false; }
    if (this.broken) return false;
    const n = this.ix.count | 0;
    first = Math.max(0, first); last = Math.min(n - 1, last);
    this.parked = false;
    const firstDrive = !this.playing;
    this.playing = true;
    this._checkStall();
    // a discontinuity (the wrap of a loop, a jump back or far): the cache is of another place, and what is on screen
    // must not be compared with what comes now ("late but newer" would reject everything after the wrap)
    if (this.quiere >= 0 && (dir * (idx - this.quiere) < 0 || Math.abs(idx - this.quiere) > this.ventana + 2)) {
      this.shown = -1; this.tray++;
      this._closeAll(this.cache);
      if (this.wrap?.has(idx)) { for (const [k, bm] of this.wrap) this.cache.set(k, bm); this.wrap.clear(); this.stats.wrapsAdopted++; }
      this.dropWrap();
    }
    const { K, L } = requestWindow(fps, this.lat);
    const need = [];
    for (let k = 0; k <= K; k++) { const j = idx + dir * (L + k); if (j < first || j > last) break; need.push(j); }
    if (firstDrive) {
      // the first time after a start or a park: also what goes from the playhead to the latency (it would be late, but
      // it is better than the old image), the wanted frame first
      const gap = [];
      for (let j = idx; dir * (j - (idx + dir * L)) < 0 && j >= first && j <= last; j += dir) if (!this.cache.has(j) && !this.pend.has(j) && j !== this.shown) gap.push(j);
      need.unshift(...gap);
    }
    this.need = need; this.quiere = idx; this.dir = dir; this.ventana = L + K;
    // prefetched wrap frames that now fall inside the window go to the cache (a play that comes round with a step forward)
    if (this.wrap?.size) for (const [k, bm] of this.wrap) { const d = dir * (k - idx); if (d >= 0 && d <= this.ventana && !this.cache.has(k)) { this.cache.set(k, bm); this.wrap.delete(k); } }
    // what is behind the playhead or beyond the window goes
    for (const [k, bm] of this.cache) { const d = dir * (k - idx); if (d < 0 || d > this.ventana) { this._close(bm); this.cache.delete(k); } }
    if (wrapTo?.length) this.prepareWrap(wrapTo);
    let ok = idx === this.shown;
    if (!ok) {
      if (this.cache.has(idx)) { this._deliver(idx); ok = true; }
      else if (this.lateIdx !== idx) { this.lateIdx = idx; this.stats.late++; }
    }
    this.stats.maxHeld = Math.max(this.stats.maxHeld, this.held);
    this.pool?.pump();
    return ok;
  }

  /** The frames right after the coming wrap / turn, asked for apart (one prefetch per approach). */
  prepareWrap(list) {
    if (!this.active || !list.length) return;
    if (this.wrapNeed && this.wrapAt === list[0]) return;
    // a short loop: right after the wrap the playback itself is asking for those frames
    if (this.playing && this.quiere >= 0 && Math.abs(this.quiere - list[0]) <= this.ventana) return;
    this.dropWrap();
    this.wrap = new Map(); this.wrapNeed = list.slice(); this.wrapAt = list[0];
    this.pool?.pump();
  }

  dropWrap() {
    if (this.wrap) this._closeAll(this.wrap);
    this.wrap = null; this.wrapNeed = null; this.wrapAt = -1;
  }

  /**
   * Frames in flight this player may have at once: what its rate and measured latency need (+1), at least two. A file
   * whose reads hang (a dying drive) can then hold at most that many workers, not all of them, before it is noticed.
   */
  get maxInFlight() { return Math.max(2, Math.ceil(((this.lat * (this.ix?.fps || 30)) / 1000) * 1.25) + 1); }

  /** The most urgent frame to ask for: {idx, rank} or null (the pool calls it). */
  next() {
    if (!this.active || this.pend.size >= this.maxInFlight) return null;
    let best = null;
    for (let r = 0; r < this.need.length; r++) {
      const i = this.need[r];
      if (this.cache.has(i) || this.pend.has(i) || i === this.shown) continue;
      best = { idx: i, rank: r }; break;
    }
    if (this.wrapNeed) {
      for (let r = 0; r < this.wrapNeed.length; r++) {
        const i = this.wrapNeed[r];
        if (this.wrap?.has(i) || this.pend.has(i) || this.cache.has(i)) continue;
        const rank = r === 0 ? 0.5 : 100 + r; // its first frame right after what is on screen; the rest with what is spare
        if (!best || rank < best.rank) best = { idx: i, rank };
        break;
      }
    }
    return best;
  }

  /** A frame asked for more than `ms` ago is still out (the pool holds back a hung player). */
  hung(now = this.now(), ms = 250) { for (const t of this.pendT.values()) if (now - t > ms) return true; return false; }

  /** A frame came back (`tray`: the trajectory it was asked for in; `ms`: request → bitmap). */
  arrive(idx, bm, tray, ms) {
    this.pend.delete(idx); this.pendT.delete(idx);
    this.stats.arrived++;
    if (this.closed || this.parked || this.broken) { this._close(bm); this.stats.dropped++; return; }
    this.failures = 0;
    if (Number.isFinite(ms)) { this.lat = this.lat * 0.8 + ms * 0.2; this.stats.lastLatency = ms; }
    const keep = () => { const old = this.cache.get(idx); if (old && old !== bm) this._close(old); this.cache.set(idx, bm); };
    // what the clock waits for goes on screen at once
    if (idx === this.quiere) { if (idx !== this.shown) { keep(); this._deliver(idx); } else { this._close(bm); this.stats.dropped++; } return; }
    const ahead = this.dir * (idx - this.quiere);
    if (ahead > 0 && ahead <= this.ventana && this.playing) { keep(); return; } // ahead, inside the window: to the cache
    if (this.wrapNeed && this.wrap && this.wrapNeed.includes(idx)) { const o = this.wrap.get(idx); if (o && o !== bm) this._close(o); this.wrap.set(idx, bm); return; }
    // LATE but newer than what is on screen, of this trajectory: shown
    if (this.playing && tray === this.tray && ahead < 0 && (this.shown < 0 || this.dir * (idx - this.shown) > 0)) { keep(); this._deliver(idx); this.stats.lateShown++; return; }
    this._close(bm); this.stats.dropped++;
  }

  /** A request failed (`msg` starts with its code). */
  fail(idx, msg) {
    this.pend.delete(idx); this.pendT.delete(idx);
    if (this.closed || this.broken) return;
    if (FATAL.test(msg) || ++this.failures >= FAIL_LIMIT) this.broken = msg;
  }

  /** No frame for STALL_MS: a drive that does not answer any more (its reads hang) breaks the clip like an error. */
  _checkStall(now = this.now()) {
    if (!this.broken && this.hung(now, STALL_MS)) this.broken = `read: no frame from the file for ${STALL_MS / 1000} s (was its drive removed?)`;
  }

  /** Stops asking and closes every bitmap held; the texture keeps the last image. Drive() wakes it up again. */
  park() {
    if (this.closed) return;
    this.parked = true; this.playing = false; this.need = [];
    this._closeAll(this.cache);
    this.dropWrap();
  }

  close() {
    if (this.closed) return;
    this.park();
    this.closed = true;
    this.pool?.remove(this);
  }

  _deliver(idx) {
    const bm = this.cache.get(idx);
    if (!bm) return;
    this.cache.delete(idx);
    this.shown = idx; this.stats.delivered++;
    try { this.deliver(bm, idx); } catch (e) { this._close(bm); throw e; }
  }

  _close(bm) { try { bm?.close(); } catch { /* closed */ } }
  _closeAll(map) { for (const bm of map.values()) this._close(bm); map.clear(); }
}

// ---------------------------------------------------------------------------------------------- the clip's clock

/**
 * Which instant of a play an output frame shows (MEDIA-SERVER-MEDIDAS.md §8.3). The target is the engine clock at the
 * frame's time (`t` = the requestAnimationFrame time of the frame being composed — the experience's when it drives —,
 * never performance.now() at compose time: that trembles with the compose and F0 measured skips and repeats with it).
 * On top of that, the position is LOCKED to the output's frames: it advances by exactly n output periods per frame
 * (n = the frames that went by: 1, or 2 after a dropped one) and moves towards the engine clock by 30 % of the
 * difference, at most CORRECT_MS per frame (the jitter of the target is averaged away; a ramp is followed ~5 ms behind); a clip at the output's rate then advances exactly one frame per output
 * frame (30 on 60: one every two), whatever the jitter of `t`. And its frame boundaries are put half an output frame
 * away from the output's frames (`bias`, |bias| ≤ half a step), where a few ms of jitter can never flip a frame. A
 * target more than JUMP_S away (a restart, a clock taken again after the engine restarted) is taken as it is.
 * CORRECT_MS is not smaller on purpose: the page's estimate of the engine clock (clock.js) follows the quickest message
 * at up to 3 ms per message (~90 ms/s right after the page opens, measured in tests/hap-player.test.mjs); a smaller
 * cap left the picture 100 ms behind before it jumped.
 * So the picture follows the engine's clock within ± half an output frame, without skips or repeats of its own.
 */
export const JUMP_S = 0.1;
export const CORRECT_MS = 2;

export class FrameLock {
  /** @param {number} periodMs the output's nominal frame period (refined from the frames seen) */
  constructor(periodMs = 1000 / 60) { this.P = periodMs; this.t = null; this.el = 0; this.bias = 0; this.jumps = 0; this.recentred = 0; this.errAvg = 0; this.edge = 0; }

  /**
   * @param {number} t the frame's instant (page ms) @param {number} target the play's elapsed seconds the engine clock gives
   * @param {number} fps the clip's rate @returns {number} the elapsed seconds to show (bias included)
   */
  step(t, target, fps) {
    if (this.t === null || !Number.isFinite(this.el)) return this._take(t, target, fps);
    const dt = t - this.t;
    if (dt < 0 || dt > 1000) return this._take(t, target, fps); // another clock, or the page stopped for a while
    if (dt < this.P * 0.5) return this.el + this.bias / fps;     // the same frame composed again
    const n = Math.max(1, Math.round(dt / this.P));
    if (n === 1 && Math.abs(dt - this.P) < this.P * 0.25) this.P += Math.max(-0.05, Math.min(0.05, (dt - this.P) * 0.02)); // the real rate
    this.el += (n * this.P) / 1000;
    this.t = t;
    const err = target - this.el;
    if (Math.abs(err) > JUMP_S) return this._take(t, target, fps);
    const c = (CORRECT_MS * n) / 1000;
    this.el += Math.max(-c, Math.min(c, err * 0.3));
    // the bias was taken at the first step, which may have been off the output's grid (a preroll compose, a late
    // frame): if the composes fall within 20 % of a step from a clip frame boundary OF THE ENGINE CLOCK for 3 frames in a
    // row, centre them again (one shift, early). The clock's phase is the lock's position plus its averaged error — not
    // the lock alone, which may not have caught up yet (the frame shown must stay the clock's: the page test measured 32
    // of 68 frames one off), nor the raw target, whose jitter would keep moving it
    this.errAvg += (target - this.el - this.errAvg) * 0.1;
    const s = unitOf((fps * this.P) / 1000), clock = (this.el + this.errAvg) * fps;
    if (s) {
      const q = ((((clock + this.bias) % s) + s) % s) / s;
      this.edge = q < 0.2 || q > 0.8 ? this.edge + 1 : 0;
      if (this.edge >= 3) { this.bias = centre(clock, (fps * this.P) / 1000); this.recentred++; this.edge = 0; }
    }
    return this.el + this.bias / fps;
  }

  _take(t, target, fps) {
    this.t = t; this.el = target; this.jumps++; this.errAvg = 0; this.edge = 0;
    this.bias = centre(target * fps, (fps * this.P) / 1000);
    return this.el + this.bias / fps;
  }
}

/** The repeat unit of the clip positions seen by the output frames (clip frames): 1 for step ≥ 1, 1/k for step = 1/k, else 0. */
function unitOf(step) {
  if (!(step > 0)) return 0;
  if (step >= 1 - 1e-3) return 1;
  const k = Math.round(1 / step);
  return Math.abs(1 / step - k) > 0.02 ? 0 : 1 / k;
}

/**
 * The bias (in clip frames) that puts the clip's frame boundaries half way between output frames. `pos` = the clip
 * position in frames, `step` = clip frames per output frame. With a whole ratio (1, ½, ⅓…: 60 or 30 on 60) the
 * positions repeat every output frame by `step` (or every 1/step frames for step ≥ 1); the bias centres them
 * (step ≥ 1: fraction ½; step = 1/k: fractions 1/2k, 3/2k…). Any other ratio (25 on 60) has no stable phase: 0.
 */
export function centre(pos, step) {
  const s = unitOf(step);
  if (!s || !Number.isFinite(pos)) return 0;
  const ph = ((pos % s) + s) % s;           // where the positions fall inside one step
  let b = s / 2 - ph;
  if (b > s / 2) b -= s; if (b <= -s / 2) b += s;
  return b;
}
