// A still image on the room output (docs/research/media-formats.md §4.1): decoded ONCE by a worker (hap-worker.js ›
// still), put on a texture ONCE (with its mipmaps), and there is nothing more to ask for. It speaks the part of HapPlayer's
// interface that ui/js/mixer/media-layers.js uses — drive(), park(), close(), ix, shown, broken, pend, stats — so a still
// is a clip like any other: it fades, crossfades, is placed and parked, and a lost GPU context asks it again.
//
// `park()` keeps nothing in memory (the bitmap is closed once it is on the texture) and does not touch the texture: the
// last image seen stays, as with a HAP clip. After a lost context media-layers sets `shown = -1`: the next drive() decodes
// the file again (it is one request, not a stream).

export class StillPlayer {
  /**
   * @param {object} o
   * @param {string} o.path the file @param {(bm: ImageBitmap, idx: number) => void} o.deliver puts the picture on the texture (it closes the bitmap)
   * @param {{still: (path:string) => Promise<{bm:ImageBitmap, w:number, h:number, reduced:boolean}>}} o.pool the HAP pool's workers
   */
  constructor({ path, deliver, pool }) {
    Object.assign(this, { path, deliver, pool });
    this.ix = null;             // {count: 1, fps, width, height, kind: 'image'} once decoded
    this.pend = new Set();      // (no frames in flight: the media layers only read its size)
    this.shown = -1;            // 0 once the picture is on the texture
    this.quiere = -1; this.ventana = 0; this.lat = 0; this.tray = 0; this.served = 0;
    this.parked = false; this.closed = false; this.playing = false;
    this.broken = null; this.loading = false; this.reduced = false;
    this.stats = { arrived: 0, delivered: 0, late: 0, lateShown: 0, dropped: 0, maxHeld: 0, wrapsAdopted: 0, lastLatency: 0 };
  }

  get held() { return 0; }
  get active() { return false; } // (never asks the pool for frames)
  next() { return null; }
  hung() { return false; }

  /** Asks a worker for the picture (once, until it is on the texture). */
  load() {
    if (this.loading || this.closed || this.broken) return;
    this.loading = true;
    const t0 = performance.now();
    Promise.resolve().then(() => this.pool.still(this.path)).then((d) => {
      this.loading = false;
      this.stats.lastLatency = performance.now() - t0;
      if (this.closed || this.parked) { try { d.bm.close(); } catch { /* closed */ } this.stats.dropped++; return; }
      this.ix = { count: 1, fps: 30, width: d.w, height: d.h, kind: 'image' };
      this.reduced = !!d.reduced;
      this.stats.arrived++;
      this.bm = d.bm;
      if (this.shown < 0 && this.playing) this._deliver();
    }, (e) => { this.loading = false; this.broken = String(e?.message || e); });
  }

  /** One output frame. The picture is wanted from the first drive; it is delivered as soon as it is decoded. @returns {boolean} the texture holds it */
  drive() {
    if (this.closed) return false;
    if (this.broken) return false;
    this.parked = false; this.playing = true; this.quiere = 0;
    if (this.shown === 0) return true;
    if (this.bm) { this._deliver(); return true; }
    this.load();
    this.stats.late++;
    return false;
  }

  _deliver() {
    const bm = this.bm;
    this.bm = null;
    this.shown = 0; this.stats.delivered++;
    try { this.deliver(bm, 0); } catch (e) { try { bm.close(); } catch { /* closed */ } throw e; }
  }

  park() {
    if (this.closed) return;
    this.parked = true; this.playing = false;
    if (this.bm) { try { this.bm.close(); } catch { /* closed */ } this.bm = null; }
  }

  close() { this.park(); this.closed = true; }

  // (the pool's own protocol: a still is never asked for like a frame)
  setInfo() {}
  prepareWrap() {}
  dropWrap() {}
  arrive() {}
  fail() {}
}
