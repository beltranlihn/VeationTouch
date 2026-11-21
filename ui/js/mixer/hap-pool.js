// The HAP decode workers of the room output (MEDIA-SERVER.md §3.1), shared by every clip that plays. Ported from VEATION
// (Immersive Studio Pro · app.js › HAPX, hapInit, hapNW, hapCall, hapMsg, hapPump, hapSiguiente, hapColgada), same owner.
//
// - ONE frame in flight per worker: Chromium's GPU process serialises the texture uploads of every context, so more in
//   flight only makes each one wait longer. Info / close messages are not frames and do not count.
// - Who gets a free worker: the most URGENT wanted frame of all the players — rank 0 is the frame each player needs
//   first, rank 1 the next… — so no layer goes without its current frame while another fills its look-ahead. On a tie,
//   the player with fewer frames in flight, then the one served least. The players say what they want (HapPlayer.next).
// - A player with a frame asked for more than HUNG_MS ago (a file that does not answer: a dying USB drive) gets no NEW
//   requests while a healthy one has work; if it is the only one with work it keeps every worker (a merely slow disk is
//   not punished). VEATION measured why there is no "rescue" by another worker: they read with a SYNCHRONOUS fs.readSync,
//   so the helper hangs on the same disk.
// - Size: hapWorkers() = VEATION's hapNW() (2–4 by CPU threads), grown when the clips that play need more: workersFor()
//   is the worker time per second of a clip from the F0 measures (MEDIA-SERVER-MEDIDAS.md §4: ~11 ms per 7196×912 HAP
//   frame, ~20 ms per HAP Q / HAP Alpha one, scaled by pixels) — HAP Q at 60 fps needs TWO workers. No size affinity
//   (VEATION's hapReparto): the clips of a room are all the room's size.
// Pure: the workers come from `spawn()`, the clock from `now()` — tests/hap-player.test.mjs drives it with fake ones.

export const HUNG_MS = 250;
export const MAX_WORKERS = 6;
// a frame not back in this time: its worker is stuck in a read (a drive that stopped answering) — a fresh worker takes
// its place (the clip itself breaks at hap-player.js › STALL_MS, earlier)
export const FRAME_TIMEOUT_MS = 4000;
const REF_PX = 7196 * 912; // the F0 measures were made at XR Lab's size

/** VEATION's hapNW(): max(2, min(4, threads / 4)). */
export function hapWorkers(threads = globalThis.navigator?.hardwareConcurrency) {
  return Math.max(2, Math.min(4, ((threads | 0) || 8) >> 2));
}

/** Workers one clip keeps busy: worker ms per frame (F0) × its fps, at most 75 % of each worker. */
export function workersFor(ix) {
  if (!ix) return 1;
  const ms = (ix.fourcc === 'Hap1' ? 11 : 20) * Math.max(0.05, (ix.width * ix.height) / REF_PX);
  return Math.max(1, Math.ceil((ms * (ix.fps || 30)) / 1000 / 0.75));
}

export class HapPool {
  /**
   * @param {object} o
   * @param {(i:number) => {postMessage:Function, terminate:Function, onmessage:any, onerror:any}} o.spawn a worker
   * @param {number} [o.size] workers to start with (hapWorkers())
   * @param {() => number} [o.now] the page clock (ms)
   * @param {number} [o.max] at most this many workers
   */
  constructor({ spawn, size = hapWorkers(), now = () => performance.now(), max = MAX_WORKERS, timeoutMs = FRAME_TIMEOUT_MS } = {}) {
    Object.assign(this, { spawn, now, max, timeoutMs });
    this.workers = [];
    this.players = new Set();
    this.calls = new Map(); // req → { W, res, rej, frame, timer }
    this.infos = new Map(); // path → Promise<ix>
    this.seq = 1;
    this.ok = null; this.err = '';
    this.stats = { requested: 0, arrived: 0, failed: 0, timeouts: 0, respawned: 0, maxInFlight: 0 };
    this._initP = null;
    this.grow(size);
  }

  /** Workers that answered init (null until they did). */
  init() {
    if (!this._initP) {
      this._initP = Promise.all(this.workers.map((W) => W.ready)).then((rs) => {
        this.ok = rs.some(Boolean);
        if (!this.ok) this.err = this.workers.map((W) => W.err).find(Boolean) || 'the HAP workers did not start';
        return this.ok;
      });
    }
    return this._initP;
  }

  /** Start workers until there are n (at most `max`). */
  grow(n) {
    while (this.workers.length < Math.min(this.max, n)) this._start(this.workers.length);
  }

  _start(i) {
    const W = { i, w: null, busy: 0, dead: false, err: '', ok: false, ready: null };
    try {
      W.w = this.spawn(i);
      W.w.onmessage = (e) => this._message(W, e.data);
      W.w.onerror = (e) => { W.err = String(e?.message || e || 'worker error'); };
    } catch (e) { W.dead = true; W.err = String(e?.message || e); }
    W.ready = W.dead ? Promise.resolve(false) : this._call(W, { t: 'init' }, 20000).then((r) => { W.ok = !!r.ok; if (!r.ok) W.err = r.err || 'init failed'; return W.ok; }, (e) => { W.err = String(e.message); return false; });
    this.workers[i] = W;
    return W;
  }

  _call(W, msg, ms, frame = false) {
    const req = this.seq++;
    msg.req = req;
    return new Promise((res, rej) => {
      const c = { W, res, rej, frame, timer: null };
      if (ms) c.timer = setTimeout(() => { if (this.calls.delete(req)) this._timeout(W, c, ms); }, ms);
      this.calls.set(req, c);
      if (frame) W.busy++;
      try { W.w.postMessage(msg); } catch (e) { this.calls.delete(req); clearTimeout(c.timer); if (frame) W.busy--; rej(e); }
    });
  }

  _timeout(W, c, ms) {
    if (c.frame) { W.busy = Math.max(0, W.busy - 1); this.stats.timeouts++; }
    const e = new Error(`read: no answer in ${Math.round(ms / 1000)} s`); e.timeout = true;
    c.rej(e);
    // a worker that does not answer for so long is stuck in a read: a fresh one takes its place
    if (c.frame && !W.dead) {
      W.dead = true;
      // ask it to close its descriptors first (a worker stuck in a read will not answer: it is terminated anyway)
      const w = W.w;
      try { w.postMessage({ t: 'closeall', req: -1 }); } catch { /* gone */ }
      setTimeout(() => { try { w.terminate(); } catch { /* gone */ } }, 300);
      this.stats.respawned++;
      this._start(W.i);
      this._initP = null;
    }
    this.pump();
  }

  _message(W, d) {
    const c = d && this.calls.get(d.req);
    if (!c) { try { d?.bm?.close(); } catch { /* closed */ } return; } // a late answer to something given up
    this.calls.delete(d.req);
    clearTimeout(c.timer);
    if (c.frame) W.busy = Math.max(0, W.busy - 1);
    if (d.t === 'err') c.rej(new Error(d.msg || 'hap: error')); else c.res(d);
  }

  /** The index of a file (asked once per path; any worker opens and caches it). */
  info(path) {
    let p = this.infos.get(path);
    if (!p) {
      p = this.init().then(() => {
        const W = this._live().sort((a, b) => a.busy - b.busy)[0];
        if (!W) throw new Error(this.err || 'no-webgl2: no HAP worker');
        return this._call(W, { t: 'info', path }, 15000).then((d) => d.ix);
      });
      p.catch(() => this.infos.delete(path)); // a file that comes back can be tried again
      this.infos.set(path, p);
    }
    return p;
  }

  /** Every worker closes its descriptor of `path` (Windows cannot rename over an open file). */
  closeFile(path) {
    this.infos.delete(path);
    for (const W of this._live()) this._call(W, { t: 'close', path }, 5000).catch(() => {});
  }

  _live() { return this.workers.filter((W) => W && !W.dead && W.ok); }

  add(pl) {
    this.players.add(pl);
    let need = 0;
    for (const p of this.players) need += workersFor(p.ix);
    if (need > this.workers.length && this.workers.length < this.max) { this.grow(need); this._initP = null; this.init().then(() => this.pump()); }
  }

  remove(pl) { this.players.delete(pl); }

  /** In flight now (frames). */
  get inFlight() { let n = 0; for (const W of this.workers) n += W?.busy || 0; return n; }

  /** The most urgent wanted frame of all the players ({pl, idx, rank}), or null. */
  pick(now = this.now()) {
    let healthy = false;
    for (const pl of this.players) if (pl.active && !pl.hung(now) && pl.next()) { healthy = true; break; }
    let best = null;
    for (const pl of this.players) {
      if (!pl.active || (healthy && pl.hung(now))) continue;
      const c = pl.next();
      if (!c) continue;
      if (!best || c.rank < best.rank
        || (c.rank === best.rank && (pl.pend.size < best.pl.pend.size || (pl.pend.size === best.pl.pend.size && pl.served < best.pl.served)))) best = { pl, ...c };
    }
    return best;
  }

  /** Runs fn() with the pumps it causes held back, then pumps once: every player of a frame says what it wants first,
   *  so the free workers go to the most urgent frames of ALL of them (not all to the first one that asked). */
  batch(fn) {
    if (this._held) return fn();
    this._held = true;
    try { return fn(); } finally { this._held = false; this.pump(); }
  }

  /** Gives every free worker the most urgent frame. Players call it when what they want changes; arrivals call it too. */
  pump() {
    if (this._held) return;
    if (this.ok !== true) { if (this.ok === null && !this._waiting) { this._waiting = true; this.init().then((ok) => { this._waiting = false; if (ok) this.pump(); }); } return; }
    for (const W of this.workers) {
      if (!W || W.dead || !W.ok || W.busy >= 1) continue;
      const job = this.pick();
      if (!job) break;
      this._request(W, job.pl, job.idx);
    }
    this.stats.maxInFlight = Math.max(this.stats.maxInFlight, this.inFlight);
  }

  _request(W, pl, idx) {
    const t0 = this.now(), tray = pl.tray;
    pl.pend.add(idx); pl.pendT.set(idx, t0); pl.served++;
    this.stats.requested++;
    this._call(W, { t: 'frame', path: pl.path, idx }, this.timeoutMs, true).then((d) => {
      this.stats.arrived++;
      if (this.players.has(pl)) pl.arrive(idx, d.bm, tray, this.now() - t0, d); else { try { d.bm?.close(); } catch { /* closed */ } }
      this.pump();
    }, (e) => {
      this.stats.failed++;
      if (this.players.has(pl)) pl.fail(idx, String(e?.message || e)); else { pl.pend.delete(idx); pl.pendT.delete(idx); }
      setTimeout(() => this.pump(), 30); // (a short pause: a failing disk is not hammered)
    });
  }

  terminate() {
    for (const c of this.calls.values()) clearTimeout(c.timer);
    this.calls.clear();
    for (const W of this.workers) { try { W?.w?.terminate(); } catch { /* gone */ } }
    this.workers = []; this.players.clear(); this.infos.clear();
  }
}
