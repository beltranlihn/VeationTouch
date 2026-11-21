// The link to the media helper (docs/research/media-formats.md §6): a hidden Chromium window of the desktop app
// (app/main.js › applyHelperWindow, page ui/helper.html) that does what Node cannot — decode an image, a frame of a
// video, a sound — and asks "can this computer decode it?". The engine (a utility process with no decoder) queues jobs;
// the page takes them with a long poll and answers:
//
//   GET  /api/helper/next            → 200 {id, kind, …} (a job) | 204 (nothing for 20 s: ask again)
//   POST /api/helper/done/<id>       body: JSON {…result}, or the bytes of a file the job asked for (X-VT-Meta: JSON)
//   POST /api/helper/part/<id>       a piece of a long job (convert: one HAP frame, a block of PCM): the answer says {cancel} when the engine gave up
//   GET  /api/helper/file/<token>    a file the job names (the page reads it by ranges: a 2 GB video is never loaded whole)
//
// All three are for THIS computer only (server.js). The helper "is online" while its poll keeps arriving; a job asked
// while it is not rejects at once with err.code = 'no-helper', so the import says so instead of waiting.
// Pure apart from timers: tests/media-helper.test.mjs drives it with a fake page.

import crypto from 'node:crypto';

export const POLL_MS = 20000;       // the page asks again after this long without a job
export const ONLINE_MS = POLL_MS + 8000;
export const JOB_TIMEOUT_MS = 120000;

export class HelperLink {
  /** @param {{now?:() => number, log?:object}} [o] */
  constructor({ now = () => Date.now(), log = null } = {}) {
    this.now = now; this.log = log;
    this.queue = [];            // jobs not taken yet
    this.waiters = [];          // long polls waiting for a job: {res, timer}
    this.jobs = new Map();      // id → {job, resolve, reject, timer, dest, files}
    this.files = new Map();     // token → absolute path (a file a job lets the page read)
    this.seen = 0;              // the last time the page asked
    this.seq = 0;
    this.stats = { jobs: 0, done: 0, failed: 0, timeouts: 0 };
  }

  /** The page is there (its last poll is recent). */
  get online() { return this.seen > 0 && this.now() - this.seen < ONLINE_MS; }

  /** A token the page can fetch `file` with (GET /api/helper/file/<token>) while the job it belongs to is open. */
  fileToken(file) {
    const t = crypto.randomBytes(12).toString('hex');
    this.files.set(t, file);
    return t;
  }

  /**
   * Asks the helper to do `job` ({kind, …}). `files`: {name: absolutePath} the page may read (they become tokens in the job);
   * `dest`: an absolute path the page's answer body is written to (the route does it; the result then carries `bytes`).
   * @returns {Promise<object>} the page's result (a rejected job: Error with .code)
   */
  request(job, { files = {}, dest = null, timeoutMs = JOB_TIMEOUT_MS, onPart = null } = {}) {
    if (!this.online) return Promise.reject(Object.assign(new Error('the media helper is not running (the desktop app has it)'), { code: 'no-helper' }));
    this.seq++;
    const id = `h${crypto.randomBytes(8).toString('hex')}`, tokens = []; // (unguessable: the routes of this page are keyed by it)
    const send = { ...job, id };
    for (const [k, f] of Object.entries(files)) { const t = this.fileToken(f); tokens.push(t); send[k] = `/api/helper/file/${t}`; }
    this.stats.jobs++;
    const p = new Promise((resolve, reject) => {
      const rec = { job: send, resolve, reject, dest, tokens, timer: null, onPart, timeoutMs, cancelled: false };
      this._arm(id, rec);
      this.jobs.set(id, rec);
      this.queue.push(send);
      this._deliver();
    });
    p.id = id; // (abort(id) needs it)
    return p;
  }

  /** (Re)starts the silence timer of a job: it fails when the page says nothing for timeoutMs (a part counts as something). */
  _arm(id, rec) {
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => { this._finish(id); this.stats.timeouts++; rec.reject(Object.assign(new Error(`the media helper did not answer (${rec.job.kind})`), { code: 'helper-timeout' })); }, rec.timeoutMs);
    rec.timer.unref?.();
  }

  /** A piece of a long job arrives: handed to the job's onPart (a promise: the page waits for it). {cancel:true} when the engine gave up. */
  async part(id, meta, body) {
    const rec = this.jobs.get(id);
    if (!rec || !rec.onPart) return null;
    if (rec.cancelled) return { cancel: true };
    this._arm(id, rec);
    await rec.onPart(meta, body);
    return rec.cancelled ? { cancel: true } : { ok: true };
  }

  /** The engine gives up a job (a cancelled conversion): it rejects at once, the page is told on its next part. */
  abort(id) {
    const rec = this.jobs.get(id);
    if (!rec) return false;
    rec.cancelled = true;
    this._finish(id);
    rec.reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    return true;
  }

  /** The long poll of the page: resolves with the next job, or null after POLL_MS (or when `abort` fires). */
  next(abort = null) {
    this.seen = this.now();
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve) => {
      const w = { resolve, timer: null };
      w.timer = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); resolve(null); }, POLL_MS);
      w.timer.unref?.();
      abort?.addEventListener?.('abort', () => { clearTimeout(w.timer); this.waiters = this.waiters.filter((x) => x !== w); resolve(null); }, { once: true });
      this.waiters.push(w);
    });
  }

  _deliver() {
    while (this.queue.length && this.waiters.length) {
      const w = this.waiters.shift();
      clearTimeout(w.timer);
      this.seen = this.now();
      w.resolve(this.queue.shift());
    }
  }

  /** The record of an open job (the route needs its `dest`). */
  open(id) { return this.jobs.get(id) || null; }

  /** The page answered: `result` (an object; {error, code} is a failure). */
  done(id, result) {
    const rec = this.jobs.get(id);
    if (!rec) return false;
    this._finish(id);
    if (result && result.error) { this.stats.failed++; rec.reject(Object.assign(new Error(result.error), { code: result.code || 'helper-error', detail: result })); } else { this.stats.done++; rec.resolve(result || {}); }
    return true;
  }

  _finish(id) {
    const rec = this.jobs.get(id);
    if (!rec) return;
    clearTimeout(rec.timer);
    this.jobs.delete(id);
    this.queue = this.queue.filter((j) => j.id !== id);
    for (const t of rec.tokens) this.files.delete(t);
  }

  /** The engine stops: every open job fails and every poll is released. */
  stop() {
    for (const id of [...this.jobs.keys()]) { const rec = this.jobs.get(id); this._finish(id); rec.reject(Object.assign(new Error('the engine is stopping'), { code: 'stopped' })); }
    for (const w of this.waiters) { clearTimeout(w.timer); w.resolve(null); }
    this.waiters = [];
  }
}
