// The H.264 decode workers of the room output (docs/research/media-formats.md §2.4). The HAP pool (hap-pool.js) hands single
// frames to whichever worker is free, ONE in flight per worker: a HAP frame stands alone. A video frame depends on the ones
// before it, so its decoder has STATE (ui/js/mixer/video-worker.js) and this pool works the other way:
//   - AFFINITY: a clip has one worker for as long as it plays (the least loaded when it is added), so its decoder never moves;
//   - DEPTH: a worker takes several requests of a clip at once (the player's own limit, HapPlayer.maxInFlight), in rising
//     order, and answers them in order;
//   - LANES: the player says whether a frame is of the playback ('main') or of the first frames of the loop ('wrap'): two
//     decoders of the same clip in the same worker, so preparing the loop never disturbs what plays;
//   - `stale`: a request of a trajectory the clip has left (a jump) is dropped by the worker without an error.
// Everything else — init, the index, close, the timeout that replaces a worker that does not answer — is the HAP pool's own.

import { HapPool } from './hap-pool.js';

export const VIDEO_WORKERS = 2;
const PER_WORKER = 12; // requests in flight to one worker, all its clips together

/** Decoder workers to start: one or two (a decoder is a thread of its own inside Chromium; the worker only feeds it). */
export const videoWorkers = (threads = globalThis.navigator?.hardwareConcurrency) => Math.max(1, Math.min(VIDEO_WORKERS, ((threads | 0) || 8) >> 2));

export class VideoPool extends HapPool {
  constructor(o = {}) { super({ ...o, size: o.size ?? videoWorkers() }); }

  /** A clip joins: it gets the least loaded worker, for good. */
  add(pl) {
    this.players.add(pl);
    if (pl.workerIdx === undefined || !this.workers[pl.workerIdx]) {
      const load = this.workers.map((W, i) => ({ i, n: [...this.players].filter((p) => p.workerIdx === i).length })).sort((a, b) => a.n - b.n)[0];
      pl.workerIdx = load ? load.i : 0;
    }
    this.init().then(() => this.pump());
  }

  /** A clip is gone: its worker lets its decoders go (the file stays open for the clips that still play it). */
  remove(pl) {
    super.remove(pl);
    const W = this.workers[pl.workerIdx];
    try { if (W && !W.dead) W.w.postMessage({ t: 'release', uid: pl.uid }); } catch { /* gone */ }
  }

  pump() {
    if (this._held) return;
    if (this.ok !== true) { if (this.ok === null && !this._waiting) { this._waiting = true; this.init().then((ok) => { this._waiting = false; if (ok) this.pump(); }); } return; }
    for (const pl of this.players) {
      if (!pl.active) continue;
      const W = this.workers[pl.workerIdx];
      if (!W || W.dead || !W.ok) continue;
      for (let guard = 0; guard < 16 && W.busy < PER_WORKER; guard++) {
        const c = pl.next();
        if (!c) break;
        this._request(W, pl, c.idx, c.lane);
      }
    }
    this.stats.maxInFlight = Math.max(this.stats.maxInFlight, this.inFlight);
  }

  _request(W, pl, idx, lane = 'main') {
    const t0 = this.now(), tray = pl.tray;
    pl.pend.add(idx); pl.pendT.set(idx, t0); pl.served++;
    this.stats.requested++;
    this._call(W, { t: 'frame', path: pl.path, idx, lane, tray, uid: pl.uid }, this.timeoutMs, true).then((d) => {
      if (d.t === 'stale') { pl.pend.delete(idx); pl.pendT.delete(idx); this.stats.stale = (this.stats.stale || 0) + 1; this.pump(); return; }
      this.stats.arrived++;
      if (this.players.has(pl)) pl.arrive(idx, d.bm, tray, this.now() - t0, d); else { try { d.bm?.close(); } catch { /* closed */ } }
      this.pump();
    }, (e) => {
      this.stats.failed++;
      if (this.players.has(pl)) pl.fail(idx, String(e?.message || e)); else { pl.pend.delete(idx); pl.pendT.delete(idx); }
      setTimeout(() => this.pump(), 30);
    });
  }
}
