// Ambient notes — which notes are sounding (pure bookkeeping: no Web Audio, runs in Node for the tests).
// A note belongs to a STROKE (one hand from landing to lift, as the runtime stitches it), never to a tracker id.
// A cap per wall and a cap in total: when one is reached the OLDEST sounding note yields.

export class VoiceBook {
  constructor({ maxPerWall = 4, maxTotal = 12 } = {}) {
    this.maxPerWall = maxPerWall;
    this.maxTotal = maxTotal;
    this.voices = []; // sounding notes in the order they started: held (a hand is on them) or tail (released, dying away)
    this.byStroke = new Map(); // strokes with a HELD note
    this.seq = 0;
  }

  setLimits({ maxPerWall, maxTotal }) {
    if (Number.isFinite(maxPerWall)) this.maxPerWall = Math.max(1, Math.floor(maxPerWall));
    if (Number.isFinite(maxTotal)) this.maxTotal = Math.max(1, Math.floor(maxTotal));
  }

  has(stroke) { return this.byStroke.has(stroke); }
  get(stroke) { return this.byStroke.get(stroke) || null; }
  list() { return this.voices.slice(); }
  count(wallId) { return wallId == null ? this.voices.length : this.voices.filter((v) => v.wallId === wallId).length; }
  held() { return this.voices.filter((v) => v.state === 'held'); }

  // the oldest of the candidates; notes already dying away go first (their tail is the least audible)
  _victim(cands) {
    const tails = cands.filter((v) => v.state === 'tail');
    const pool = tails.length ? tails : cands;
    return pool.reduce((a, b) => (b.id < a.id ? b : a));
  }

  _drop(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    if (this.byStroke.get(v.stroke) === v) this.byStroke.delete(v.stroke);
  }

  /** Notes that must yield to respect the caps (all notes, or those of one wall). Marks them 'stolen' and forgets them. */
  enforce(wallId = null) {
    const out = [];
    const over = (list, cap) => { while (list().length > cap) { const v = this._victim(list()); v.state = 'stolen'; this._drop(v); out.push(v); } };
    if (wallId != null) over(() => this.voices.filter((v) => v.wallId === wallId), this.maxPerWall);
    else for (const id of new Set(this.voices.map((v) => v.wallId))) over(() => this.voices.filter((v) => v.wallId === id), this.maxPerWall);
    over(() => this.voices, this.maxTotal);
    return out;
  }

  /**
   * A hand lands. `{ voice, evict }`: the new note and the ones that yield to it. A `down` for a stroke that already has
   * a held note does not start another one: `{ voice: null, duplicate: true, evict: [] }`.
   */
  add({ stroke, wallId, t = 0 }) {
    if (this.byStroke.has(stroke)) return { voice: null, duplicate: true, evict: [] };
    const evict = [];
    const make = (list, cap) => { while (list().length >= cap) { const v = this._victim(list()); v.state = 'stolen'; this._drop(v); evict.push(v); } };
    make(() => this.voices.filter((v) => v.wallId === wallId), this.maxPerWall);
    make(() => this.voices, this.maxTotal);
    const voice = { id: ++this.seq, stroke, wallId, t0: t, state: 'held' };
    this.voices.push(voice);
    this.byStroke.set(stroke, voice);
    return { voice, evict, duplicate: false };
  }

  /** The hand lifts: the note goes on as a tail. Returns the note, or null (no held note for this stroke: it yielded already). */
  release(stroke) {
    const v = this.byStroke.get(stroke);
    if (!v) return null;
    this.byStroke.delete(stroke);
    v.state = 'tail';
    return v;
  }

  /** The tail has died away. */
  finish(v) { this._drop(v); }
}
