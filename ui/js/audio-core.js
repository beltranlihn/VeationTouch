// Room audio — the pure parts (no DOM, no WebAudio): they run in the audio window, inside the AudioWorklets and in Node tests.
//
//   RingWriter / RingReader  a lock-free single-writer single-reader ring of float frames in a SharedArrayBuffer: how the
//                            synthesis context hands its channels to the sink context of each output device
//   layoutDevices            the profile's device labels + the devices found → which logical channels go to which device
//   speakerGains / foldMatrix  how a wall's mono source is spread over its speakers; how N channels fold into stereo
//   Limiter                  the final stage: a linked-channel look-ahead limiter with a hard clip behind it
//   clips (MEDIA-SERVER.md §4c)  mediaRouting (a clip's channels → the logical channels), streamSegments (which source frames
//                            a stretch of playback reads: loops, bounce, the end), ClipRingWriter + ClipReader (the clip's PCM
//                            ring and the player that follows the engine's clock: cubic resampling, ±0.3 % speed, jumps)
//
// Contract: ARCHITECTURE.md › Room audio and experiences/SOUND-API.md. Nothing here is specific to a room.

export const SAMPLE_RATE = 48000;
export const dbToLin = (db) => 10 ** (db / 20);
export const linToDb = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);

// ---------------------------------------------------------------------------------------------- the ring

// Int32 header: [0] frames written (mod 2^32), [1] frames read (mod 2^32), [2] capacity, [3] channels. Data: Float32 planar
// (channel after channel), `capacity` frames each. Capacity is a power of two.
const H_WRITE = 0, H_READ = 1, H_CAP = 2, H_CH = 3, HEADER_INTS = 8;
export const RING_FRAMES = 16384;     // ~340 ms at 48 kHz: far more than the target latency, room for a stalled quantum
export const RING_TARGET = 1280;      // ~27 ms: what the reader keeps in the ring (the cost in latency of never running dry)

/** A new ring: { sab, channels, frames }. `frames` is rounded up to a power of two. */
export function createRing(channels, frames = RING_FRAMES) {
  const cap = 2 ** Math.ceil(Math.log2(Math.max(64, frames)));
  const sab = new SharedArrayBuffer(HEADER_INTS * 4 + channels * cap * 4);
  const h = new Int32Array(sab, 0, HEADER_INTS);
  h[H_CAP] = cap; h[H_CH] = channels;
  return { sab, channels, frames: cap };
}

function ringViews(sab) {
  const h = new Int32Array(sab, 0, HEADER_INTS);
  const cap = h[H_CAP], ch = h[H_CH];
  return { h, cap, ch, mask: cap - 1, data: new Float32Array(sab, HEADER_INTS * 4, ch * cap) };
}

export class RingWriter {
  constructor(sab) { Object.assign(this, ringViews(sab)); }
  /** Frames queued (written and not yet read). */
  get fill() { return (Atomics.load(this.h, H_WRITE) - Atomics.load(this.h, H_READ)) | 0; }
  /**
   * Append `n` frames. `chans[c]` is the block of ring channel c (a missing or short one counts as silence).
   * Only this writer moves the write counter; the data goes in before the counter does.
   */
  write(chans, n) {
    const w = Atomics.load(this.h, H_WRITE), { data, cap, mask } = this;
    for (let c = 0; c < this.ch; c++) {
      const src = chans[c], base = c * cap;
      for (let i = 0; i < n; i++) data[base + ((w + i) & mask)] = src && i < src.length ? src[i] : 0;
    }
    Atomics.store(this.h, H_WRITE, (w + n) | 0);
  }
}

/**
 * Reads one device's channels. The sink context runs on the device's clock, the synthesis context on another, so the two
 * drift: the reader keeps about `target` frames queued, and when it strays further than `dead` it plays a hair faster or
 * slower (±0.2 %, linear interpolation) until it is back. In the dead band it copies the frames exactly.
 * - Priming: silence until `target` frames are queued.
 * - Underrun (not enough frames for the block): the whole block is silence and it primes again. Never stale data.
 * - Overrun (more than `maxFill` queued: the sink was stalled): skip ahead to `target`.
 */
export class RingReader {
  constructor(sab, { target = RING_TARGET, maxFill, dead } = {}) {
    Object.assign(this, ringViews(sab));
    this.target = target;
    this.maxFill = maxFill ?? Math.min(this.cap - 256, target * 4);
    this.dead = dead ?? Math.round(target * 0.15);
    this.r = Atomics.load(this.h, H_READ); // whole frames read
    this.frac = 0;                          // position between frame r and r + 1
    this.priming = true;
    this.underruns = 0;
  }
  /** Fill `outs[c]` (c < channels) with `n` frames. Returns 'play', 'prime' or 'underrun'. */
  read(outs, n) {
    const { h, data, cap, mask } = this, w = Atomics.load(h, H_WRITE);
    const zero = () => { for (let c = 0; c < this.ch; c++) if (outs[c]) outs[c].fill(0, 0, n); };
    let fill = (w - this.r) | 0;
    if (this.priming) {
      if (fill < this.target) { zero(); return 'prime'; }
      this.priming = false;
    }
    if (fill > this.maxFill) { this.r = (w - this.target) | 0; this.frac = 0; fill = this.target; }
    const off = fill - this.target;
    // Outside the dead band: a hair fast / slow. Inside it with a fraction left over from steering: a hair fast until the read
    // position crosses a whole frame, where the fraction is dropped — back to exact copies, not a permanent half-sample delay
    // (which would be a low-pass).
    const rate = off > this.dead ? 1.002 : off < -this.dead ? 0.998 : this.frac !== 0 ? 1.002 : 1;
    const settle = rate === 1.002 && off <= this.dead && off >= -this.dead;
    if (fill - this.frac < n * rate + 2) { zero(); this.priming = true; this.underruns++; this.frac = 0; return 'underrun'; }
    if (rate === 1 && this.frac === 0) {
      for (let c = 0; c < this.ch; c++) {
        const out = outs[c];
        if (!out) continue;
        const base = c * cap;
        for (let i = 0; i < n; i++) out[i] = data[base + ((this.r + i) & mask)];
      }
      this.r = (this.r + n) | 0;
    } else {
      let r = this.r, f = this.frac, step = rate;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < this.ch; c++) {
          const out = outs[c];
          if (!out) continue;
          const a = data[c * cap + (r & mask)], b = data[c * cap + ((r + 1) & mask)];
          out[i] = a + (b - a) * f;
        }
        f += step;
        const k = Math.floor(f);
        f -= k; r = (r + k) | 0;
        if (settle && k > 1) { f = 0; step = 1; } // on a whole frame again: plain copies for the rest of the block
      }
      this.r = r; this.frac = f;
    }
    Atomics.store(h, H_READ, this.r);
    return 'play';
  }
}

// ---------------------------------------------------------------------------------------------- devices

const norm = (s) => String(s || '').toLowerCase().replace(/^(default|communications)\s*-\s*/, '').replace(/\s+/g, ' ').trim();

/** The device that goes by this label: exact, then starting with it, then containing it (labels carry a driver suffix). */
export function matchDevice(label, devices, taken = new Set()) {
  const want = norm(label);
  if (!want) return null;
  const pool = devices.filter((d) => !taken.has(d) && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return pool.find((d) => norm(d.label) === want) || pool.find((d) => norm(d.label).startsWith(want)) || pool.find((d) => norm(d.label).includes(want)) || null;
}

export const MISSING_CHANNELS = 2; // a device that is not there still holds its slot (a pair), so the others keep their channels

/**
 * Which logical channels go to which output device.
 * `wanted`: the profile's device labels, in order. `devices`: [{ deviceId, label, channels }] found by the window.
 * No labels → one sink on the default device, stereo, `fold` (the graph folds every channel into L/R).
 * Otherwise the channels run on in order: device 1 has the first `channels` of them, device 2 the next, …
 * → { fold, sinks: [{ label, deviceId, first, count, missing }], total }  (total: channels that really have a device)
 */
export function layoutDevices(wanted, devices) {
  const labels = (Array.isArray(wanted) ? wanted : []).filter((l) => typeof l === 'string' && l.trim());
  if (!labels.length) return { fold: true, sinks: [{ label: 'Default device', deviceId: '', first: 0, count: 2, missing: false }], total: 2 };
  const taken = new Set(), sinks = [];
  let first = 0, total = 0;
  for (const label of labels) {
    const d = matchDevice(label, devices, taken);
    if (d) taken.add(d);
    const count = d ? Math.max(1, Math.min(64, d.channels || 2)) : MISSING_CHANNELS;
    sinks.push({ label: d ? d.label : label, wanted: label, deviceId: d ? d.deviceId : null, first, count, missing: !d });
    first += count;
    if (d) total += count;
  }
  return { fold: false, sinks, total: first };
}

// ---------------------------------------------------------------------------------------------- spreading

/**
 * Equal-power gains of a mono source over `n` speakers (left → right seen from inside the room) at position `u` (0..1).
 * The speakers sit at 0, 1/(n-1), … 1; the source is shared between the two that bracket `u`. n = 1 → [1].
 */
export function speakerGains(n, u = 0.5) {
  if (n <= 1) return [1];
  const x = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0.5)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x)), f = x - i, g = new Array(n).fill(0);
  g[i] = Math.cos((f * Math.PI) / 2); g[i + 1] = Math.sin((f * Math.PI) / 2);
  return g;
}

/**
 * How N logical channels fold into stereo (a laptop, no multichannel device): [channel] → [left, right].
 * The speaker channels (all but the sub) are panned in order from left to right, equal power; the sub goes to both.
 * `sub`: the sub's channel (0-based) or -1. A single speaker channel sits in the middle.
 */
export function foldMatrix(channels, sub = -1) {
  const spk = [];
  for (let c = 0; c < channels; c++) if (c !== sub) spk.push(c);
  const m = Array.from({ length: channels }, () => [0, 0]);
  spk.forEach((c, k) => {
    const p = spk.length === 1 ? 0.5 : k / (spk.length - 1);
    m[c] = [Math.cos((p * Math.PI) / 2), Math.sin((p * Math.PI) / 2)];
  });
  if (sub >= 0 && sub < channels) m[sub] = [Math.SQRT1_2, Math.SQRT1_2];
  return m;
}

// ---------------------------------------------------------------------------------------------- limiter

/**
 * Look-ahead peak limiter, channels linked (one gain for all, so the image does not move), with a hard clip at the ceiling
 * behind it: nothing leaves above `ceilingDb`, ever.
 *   required gain r[t] = ceiling / peak(t) when the peak is over, else 1
 *   env: drops to r at once, comes back to 1 with `releaseMs`
 *   m = minimum of env over the last W samples; s = their mean; the audio is delayed W − 1 samples and multiplied by s —
 *   so the gain has come down smoothly (W samples) before the loud sample reaches the output.
 * Latency W − 1 samples (1.3 ms at 48 kHz).
 */
export const LIMITER_WINDOW = 64; // its look-ahead is LIMITER_WINDOW − 1 samples: part of the graph's latency (the clips add it)

export class Limiter {
  constructor({ channels, sampleRate = SAMPLE_RATE, ceilingDb = -2, window = LIMITER_WINDOW, releaseMs = 120 } = {}) {
    this.ch = channels; this.W = window;
    this.ceiling = dbToLin(Math.min(-1, ceilingDb));
    this.rel = 1 - Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
    this.delay = Array.from({ length: channels }, () => new Float32Array(window));
    this.env = new Float64Array(window).fill(1);   // env history (for the minimum)
    this.mins = new Float64Array(window).fill(1);  // m history (for the mean)
    this.pos = 0; this.e = 1; this.sum = window;
    this.peak = 0; this.minGain = 1;
  }
  setCeiling(db) { this.ceiling = dbToLin(Math.min(-1, Number.isFinite(db) ? db : -2)); }
  /** Process `n` frames: ins[c] → outs[c]. Missing input channels are silence. */
  process(ins, outs, n) {
    const { W, ch, delay, env, mins } = this;
    for (let i = 0; i < n; i++) {
      const p = this.pos;
      let peak = 0;
      for (let c = 0; c < ch; c++) { const x = ins[c] ? ins[c][i] : 0; const a = x < 0 ? -x : x; if (a > peak) peak = a; } // (NaN fails both tests: it counts as 0)
      const req = peak > this.ceiling ? this.ceiling / peak : 1;
      this.e = req < this.e ? req : this.e + (1 - this.e) * this.rel;
      env[p] = this.e;
      let m = 1;
      for (let k = 0; k < W; k++) if (env[k] < m) m = env[k];
      this.sum += m - mins[p]; mins[p] = m;
      const g = this.sum / W;
      if (g < this.minGain) this.minGain = g;
      // `delay[c][p]` is the sample from W frames ago (the slot is overwritten after reading); the look-ahead is W − 1 deep
      const q = (p + 1) % W; // the oldest slot: written W − 1 frames ago
      for (let c = 0; c < ch; c++) {
        const x = ins[c] ? ins[c][i] : 0;
        delay[c][p] = Number.isFinite(x) ? x : 0;
        let y = delay[c][q] * g;
        if (y > this.ceiling) y = this.ceiling; else if (y < -this.ceiling) y = -this.ceiling;
        if (outs[c]) outs[c][i] = y;
        const ay = y < 0 ? -y : y;
        if (ay > this.peak) this.peak = ay;
      }
      this.pos = q;
    }
  }
  /** The loudest output sample since the last call (linear) and the deepest gain reduction (linear gain); resets both. */
  take() { const r = { peak: this.peak, gain: this.minGain }; this.peak = 0; this.minGain = 1; return r; }
}

// ---------------------------------------------------------------------------------------------- clips (MEDIA-SERVER.md §4c)

export const CLIP_ROUTES = ['auto', 'spread', 'mono', 'walls', 'direct', 'matrix']; // = engine/profile.js › AUDIO_ROUTES

/** The speakers of each wall: its channels (0-based) in order, never the sub's, never beyond `channels` (the graph's rule). */
export function wallSpeakers(walls, map, channels, sub = -1) {
  const out = new Map();
  for (const w of walls || []) {
    const list = (map?.[w.id] || []).map((c) => c - 1).filter((c, k, a) => Number.isInteger(c) && c >= 0 && c < channels && c !== sub && a.indexOf(c) === k);
    if (list.length) out.set(w.id, list);
  }
  return out;
}

/**
 * Where each wall is around the listener, seen from the middle of the room: radians, 0 = the `front` wall, positive to the
 * right, in (−π, π]. From the floor plan (engine/core/geometry.js › roomPlan, closed: every corner meets) when there is
 * one: the angle of the wall's midpoint from the centre. Without a plan the walls go round evenly in their order.
 * @param {{id:string}[]} walls  @param {{id:string, p0:number[], dir:number[], width:number}[]|null} plan  @param {string} front
 * @returns {Map<string, number>}
 */
export function wallAzimuths(walls, plan, front) {
  const out = new Map(), ids = (walls || []).map((w) => w.id);
  const fi = Math.max(0, ids.indexOf(front));
  const wrap = (a) => { const x = Math.atan2(Math.sin(a), Math.cos(a)); return x <= -Math.PI + 1e-9 ? Math.PI : x === 0 ? 0 : x; }; // (−π, π], no −0
  const mids = new Map((plan || []).map((o) => [o.id, [o.p0[0] + (o.dir[0] * o.width) / 2, o.p0[1] + (o.dir[1] * o.width) / 2]]));
  if (ids.length && ids.every((id) => mids.has(id))) {
    const f = mids.get(ids[fi]), a0 = Math.atan2(f[1], f[0]);
    // the plan has north up (y grows up): turning to the right is clockwise, a negative angle — hence the minus
    for (const id of ids) { const m = mids.get(id); out.set(id, Math.abs(m[0]) + Math.abs(m[1]) < 1e-9 ? 0 : wrap(-(Math.atan2(m[1], m[0]) - a0))); }
  } else ids.forEach((id, i) => out.set(id, wrap((2 * Math.PI * (i - fi)) / ids.length)));
  return out;
}

/** The route a clip plays with: 'auto' picks by its channel count (1 → mono, 2 → spread, one per wall (+1) → walls). */
export function effectiveRoute(route, sources, wallCount) {
  if (route && route !== 'auto' && CLIP_ROUTES.includes(route)) return route;
  if (sources <= 1) return 'mono';
  if (sources === 2) return 'spread';
  if (wallCount > 0 && (sources === wallCount || sources === wallCount + 1)) return 'walls';
  return 'mono';
}

/**
 * How a clip's channels reach the room's logical channels (MEDIA-SERVER.md §4c.3). PURE.
 *   spread  stereo over the whole room by the floor plan: a wall at azimuth θ gets p = (1 + sin θ) / 2, gL = cos(p·π/2),
 *           gR = sin(p·π/2) (the front wall and the one behind L+R, the left walls L, the right ones R), each mixed with
 *           the mono 0.707 by `width` (0 = mono everywhere, 1 = the full spread). Channels past the second: mono, −6 dB.
 *   mono    summed to mono (1/√sources each), equal on every wall
 *   walls   channel k → wall k (walls with speakers, in canvas order); one more → the sub (or every wall without one)
 *   direct  channel k → logical channel k
 *   matrix  `matrix[k][c]` dB (null = no cross)
 * On a wall with several speakers the wall's gain is shared with equal power (1/√n each). Walls that SHARE a logical
 * channel do not add up on it: the channel takes, for each source channel, the MAXIMUM of the walls' gains (roomInput's
 * rule) — XR Lab's channel 2 feeds P2 and P3.
 * @param {object} o
 * @param {string} o.route  the clip's, else its layer's, else the room's (profile.audio.media.route)
 * @param {number} o.sources  the clip's channel count
 * @param {number} o.channels  the room's logical channels
 * @param {object} o.map  profile.audio.map ({ wallId: [channel…] }, 1-based)
 * @param {{channel:number|null}} [o.sub]
 * @param {{id:string}[]} o.walls  the room's walls, in canvas order
 * @param {object[]|null} [o.plan]  roomPlan(walls, { close: true })
 * @param {string} [o.front]  the wall at 0°
 * @param {number} [o.width]  0..1
 * @param {(number|null)[][]|null} [o.matrix]
 * @returns {{route:string, gains:number[][]}}  gains[k][c]: source channel k → logical channel c (0-based), linear
 */
export function mediaRouting({ route = 'auto', sources, channels, map, sub = null, walls = [], plan = null, front = null, width = 0.6, matrix = null }) {
  const S = Math.max(1, sources | 0), N = Math.max(1, channels | 0);
  const subC = sub?.channel ? sub.channel - 1 : -1, hasSub = subC >= 0 && subC < N;
  const spk = wallSpeakers(walls, map, N, subC);
  const ids = walls.map((w) => w.id).filter((id) => spk.has(id));
  const r = effectiveRoute(route, S, ids.length);
  const gains = Array.from({ length: S }, () => new Array(N).fill(0));
  // a wall's gain for source k, shared over its speakers; a shared channel keeps the largest
  const toWall = (k, id, g) => { const ch = spk.get(id); for (const c of ch) gains[k][c] = Math.max(gains[k][c], g / Math.sqrt(ch.length)); };
  const w = Math.min(1, Math.max(0, Number.isFinite(width) ? width : 0.6));
  if (r === 'spread' && S >= 2) {
    const az = wallAzimuths(walls, plan, front ?? walls[0]?.id);
    for (const id of ids) {
      const p = (1 + Math.sin(az.get(id) ?? 0)) / 2;
      const gL = Math.cos((p * Math.PI) / 2), gR = Math.sin((p * Math.PI) / 2);
      toWall(0, id, Math.SQRT1_2 + (gL - Math.SQRT1_2) * w);
      toWall(1, id, Math.SQRT1_2 + (gR - Math.SQRT1_2) * w);
      for (let k = 2; k < S; k++) toWall(k, id, 0.5);
    }
  } else if (r === 'mono' || r === 'spread') {
    for (let k = 0; k < S; k++) for (const id of ids) toWall(k, id, 1 / Math.sqrt(S));
  } else if (r === 'walls') {
    ids.forEach((id, k) => { if (k < S) toWall(k, id, 1); });
    const extra = ids.length;
    if (extra < S) { if (hasSub) gains[extra][subC] = 1; else for (const id of ids) toWall(extra, id, 1); }
  } else if (r === 'direct') {
    for (let k = 0; k < Math.min(S, N); k++) gains[k][k] = 1;
  } else if (r === 'matrix') {
    for (let k = 0; k < S; k++) {
      const row = Array.isArray(matrix?.[k]) ? matrix[k] : [];
      for (let c = 0; c < N; c++) { const db = row[c]; if (db !== null && db !== undefined && Number.isFinite(Number(db))) gains[k][c] = dbToLin(Math.min(6, Math.max(-60, Number(db)))); }
    }
  }
  return { route: r, gains };
}

/**
 * The source frames a stretch of playback reads (the fold of transport.js › playhead(), in frames). PURE.
 * Playback frame k = elapsed · rate, elapsed = (engine − startAt) / 1000 + offset, as in playhead(). The segment is
 * [in, out) (at least one video frame long); loop and the autopilot ends go round it, hold and clear are silent past its
 * end, bounce plays it forward then backward.
 * @param {{in:number, out:number, fps:number, end:string}} p  @param {number} rate  @param {number} k0  @param {number} n
 * @returns {{at:number, n:number, src:number|null, dir:1|-1}[]}  `at`: where it starts in the stretch; src null = silence
 */
export function streamSegments(p, rate, k0, n) {
  const inF = Math.round(p.in * rate), lenF = Math.max(1, Math.round(Math.max(p.out - p.in, 1 / (p.fps || 30)) * rate));
  const out = [];
  let at = 0, k = Math.floor(k0);
  const push = (m, src, dir) => {
    const last = out[out.length - 1];
    if (last && src === null && last.src === null) last.n += m; else out.push({ at, n: m, src, dir });
    at += m; k += m;
  };
  while (at < n) {
    const left = n - at;
    if (k < 0) { push(Math.min(left, -k), null, 1); continue; }
    if (p.end === 'hold' || p.end === 'clear') {
      if (k >= lenF) { push(left, null, 1); break; }
      push(Math.min(left, lenF - k), inF + k, 1);
    } else if (p.end === 'bounce') {
      const q = k % (2 * lenF);
      if (q < lenF) push(Math.min(left, lenF - q), inF + q, 1);
      else { const r = q - lenF; push(Math.min(left, lenF - r), inF + lenF - 1 - r, -1); }
    } else {
      const q = k % lenF;
      push(Math.min(left, lenF - q), inF + q, 1);
    }
  }
  return out;
}

/**
 * A clip's gain at engine time `E` (ms) from its transition: fading in (the clip coming in on a crossfade) and fading out
 * (the clip going: replaced, ejected, at the end) over the transition, equal power (sin / cos). ms 0 = a cut at `at`.
 */
export function clipFade(E, fadeIn, fadeOut) {
  let g = 1;
  if (fadeIn) { const k = fadeIn.ms > 0 ? (E - fadeIn.at) / fadeIn.ms : E >= fadeIn.at ? 1 : 0; g *= k <= 0 ? 0 : k >= 1 ? 1 : Math.sin((k * Math.PI) / 2); }
  if (fadeOut) { const k = fadeOut.ms > 0 ? (E - fadeOut.at) / fadeOut.ms : E >= fadeOut.at ? 1 : 0; g *= k <= 0 ? 1 : k >= 1 ? 0 : Math.cos((k * Math.PI) / 2); }
  return g;
}

// The clip's PCM ring: the audio page writes playback frames (source rate, planar), the player's worklet reads them.
// Int32 header: [0] generation (the writer restarted the window), [1] frames written since the origin, [2] capacity,
// [3] channels, [4] the generation the reader is on, [5] its frame (relative to the origin), [6] reading (1) or not (0),
// [7] underruns, [8] origin mod capacity. Float64 at byte 64: the origin (the window's first playback frame). Data at
// byte 80: Float32 planar, `capacity` frames per channel; playback frame f is at index (f mod capacity).
const CR_GEN = 0, CR_WRITTEN = 1, CR_CAP = 2, CR_CH = 3, CR_RGEN = 4, CR_RREL = 5, CR_READING = 6, CR_UNDER = 7, CR_OMOD = 8;
const CR_ORIGIN = 64, CR_DATA = 80;
export const CLIP_RING_FRAMES = 1 << 18;  // ~5.5 s at 48 kHz: the page keeps about 1.5 s queued
export const CLIP_JUMP_MS = 80;           // beyond this error the player jumps; below it, it steers with speed
export const CLIP_SPEED = 0.003;          // ±0.3 %: the steering (about 5 cents, inaudible)
export const CLIP_CHECK_MS = 250;         // how often the player compares its position with the clock
const CLIP_KP = 0.5;                      // speed per second of error: 1 ms behind → +0.05 %; the ceiling at 6 ms
const CLIP_DEAD_MS = 0.25;                // inside this error the speed is exactly 1
const CLIP_RAMP = 64;                     // samples of the fade-in after a gap (late start, a jump, a dry ring)

export function createClipRing(channels, frames = CLIP_RING_FRAMES) {
  const cap = 2 ** Math.ceil(Math.log2(Math.max(1024, frames)));
  const sab = new SharedArrayBuffer(CR_DATA + channels * cap * 4);
  const h = new Int32Array(sab, 0, 16);
  h[CR_CAP] = cap; h[CR_CH] = channels;
  return { sab, channels, frames: cap };
}

function clipViews(sab) {
  const h = new Int32Array(sab, 0, 16), cap = h[CR_CAP], ch = h[CR_CH];
  return { h, cap, ch, mask: cap - 1, originF: new Float64Array(sab, CR_ORIGIN, 1), data: new Float32Array(sab, CR_DATA, ch * cap) };
}

/** The page's side of a clip ring (single writer). Playback frames go in in order from the window's origin. */
export class ClipRingWriter {
  constructor(sab) { Object.assign(this, clipViews(sab)); this.empty = true; }
  get gen() { return Atomics.load(this.h, CR_GEN); }
  get origin() { return this.originF[0]; }
  get written() { return Atomics.load(this.h, CR_WRITTEN); }
  /** The playback frame after the last one written (null before the first reset). */
  get end() { return this.empty ? null : this.originF[0] + this.written; }
  get underruns() { return Atomics.load(this.h, CR_UNDER); }
  /** Starts the window again at playback frame `at` (what was in it is dropped). */
  reset(at) {
    const o = Math.max(0, Math.floor(at));
    this.originF[0] = o;
    Atomics.store(this.h, CR_OMOD, o % this.cap);
    Atomics.store(this.h, CR_WRITTEN, 0);
    Atomics.add(this.h, CR_GEN, 1);
    this.empty = false;
  }
  /** Moves the origin up to `at` keeping the data where it is (the frame counter stays far from 2^31 in an 8-hour loop). */
  rebase(at) {
    const o = this.originF[0], w = this.written, d = Math.max(0, Math.min(w, Math.floor(at) - o));
    if (!d) return;
    this.originF[0] = o + d;
    Atomics.store(this.h, CR_OMOD, (o + d) % this.cap);
    Atomics.store(this.h, CR_WRITTEN, w - d);
    Atomics.add(this.h, CR_GEN, 1);
  }
  /** Where the reader is: { reading, at } — `at`, the playback frame, only when it reads this window. */
  reader() {
    const g = Atomics.load(this.h, CR_RGEN), rel = Atomics.load(this.h, CR_RREL), on = Atomics.load(this.h, CR_READING) === 1 && g === this.gen;
    return { reading: on, at: on ? this.originF[0] + rel : null };
  }
  /** Frames that can go in without overwriting what the reader still needs. */
  get room() {
    const r = this.reader(), w = this.written;
    const keep = r.reading ? Math.max(0, w - (r.at - this.originF[0]) + 8) : 0;
    return Math.max(0, this.cap - 16 - keep);
  }
  /** Appends `n` frames: `chans[c]` planar from index `from` (a missing channel is silence; chans null = all silence). */
  write(chans, n, from = 0) {
    const { h, data, cap, mask } = this, w = Atomics.load(h, CR_WRITTEN), om = Atomics.load(h, CR_OMOD);
    for (let c = 0; c < this.ch; c++) {
      const src = chans?.[c], base = c * cap;
      for (let i = 0; i < n; i++) data[base + ((om + w + i) & mask)] = src ? src[from + i] || 0 : 0;
    }
    Atomics.store(h, CR_WRITTEN, w + n);
  }
}

/**
 * The player of one clip (the logic of the 'vt-media-player' worklet; Node tests drive it directly). It reads the ring at
 * the position the ENGINE's clock says — the formula of playhead(): elapsed = (E − startAt) / 1000 + offset, E the engine
 * time at which the sample will be HEARD (`off` = that engine time, ms, at context frame 0: the page puts the output
 * latency and the room's A/V offset in it) — resampling from the clip's rate with cubic interpolation (Catmull-Rom).
 * Every CLIP_CHECK_MS it compares where it is with where the clock says: within CLIP_JUMP_MS it steers with speed (±0.3 %,
 * proportional), beyond it it jumps (fading the old place out over a block and the new one in). Sample 0 is placed to the
 * sample (inside the block). Frames missing from the ring are silence, never stale data; after a gap it fades in.
 */
export class ClipReader {
  /**
   * @param {SharedArrayBuffer} sab  from createClipRing(channels)
   * @param {{rate:number, sampleRate?:number, startAt:number, offset?:number, off:number, fadeIn?:object, fadeOut?:object}} o
   */
  constructor(sab, o) {
    Object.assign(this, clipViews(sab));
    this.rate = o.rate; this.sr = o.sampleRate || SAMPLE_RATE;
    this.startAt = o.startAt; this.offset = o.offset || 0;
    this.off = o.off; this.fadeIn = o.fadeIn || null; this.fadeOut = o.fadeOut || null;
    this.gen = -1; this.origin = 0; this.om = 0; this.written = 0;
    this.pos = null;          // playback frame being read (fractional); null until the clip starts
    this.speed = 1; this.errAvg = 0; this.errMs = 0;
    this.avail = 1;           // the fade-in after a gap
    this.nextCheck = 0; this.checkFrames = Math.round((CLIP_CHECK_MS * this.sr) / 1000);
    this.jump = 0;            // 1: this block fades out, the next one starts at the clock's place
    this.seekNext = false;
    this.jumps = 0; this.seeks = 0; this.underruns = 0;
    this.state = 'waiting';
  }
  /** A new estimate of the clock (`off`, engine ms at context frame 0). `seek`: go there now (the A/V offset changed). */
  setMap(off, seek = false) { if (Number.isFinite(off)) this.off = off; if (seek) this.seekNext = true; }
  setFades(fadeIn, fadeOut) { this.fadeIn = fadeIn || null; this.fadeOut = fadeOut || null; }
  /** The play's instant moved (the engine restarted and restored it on its new clock): the next check jumps if it must. */
  setPlay(startAt, offset = 0) { if (Number.isFinite(startAt)) { this.startAt = startAt; this.offset = offset || 0; this.nextCheck = 0; } }
  /** The playback frame the clock says at context frame `f`. */
  target(f) { return ((this.off + (f * 1000) / this.sr - this.startAt) / 1000 + this.offset) * this.rate; }
  _sync() {
    const h = this.h;
    for (let k = 0; k < 3; k++) {
      const g = Atomics.load(h, CR_GEN);
      if (g === this.gen) break;
      const o = this.originF[0], om = Atomics.load(h, CR_OMOD);
      if (Atomics.load(h, CR_GEN) !== g) continue; // the writer moved meanwhile: read again
      this.gen = g; this.origin = o; this.om = om;
    }
    this.written = Atomics.load(h, CR_WRITTEN);
  }
  /** Fills outs[c] with `n` samples, the first at context frame `frame0`. Returns the state. */
  process(outs, n, frame0) {
    for (let c = 0; c < outs.length; c++) if (outs[c]) outs[c].fill(0, 0, n);
    this._sync();
    const step0 = this.rate / this.sr, T0 = this.target(frame0);
    const same = this.rate === this.sr;
    let i0 = 0;
    if (this.pos === null) {
      if (T0 + step0 * n <= 0) { this.state = 'waiting'; return this.state; }
      if (T0 >= 0) { this.pos = same ? Math.round(T0) : T0; this.avail = T0 > 2 * step0 ? 0 : 1; } // joined late: fade in
      else if (same) { i0 = Math.min(n - 1, Math.round(-T0)); this.pos = 0; this.avail = 1; } // sample 0 on the nearest output sample
      else { i0 = Math.min(n - 1, Math.ceil(-T0 / step0 - 1e-9)); this.pos = Math.max(0, T0 + i0 * step0); this.avail = 1; }
      this.nextCheck = frame0 + this.checkFrames;
      this.state = 'playing';
    } else if (this.jump === 1) {
      this.jump = 0; this.pos = same ? Math.round(T0) : T0; this.avail = 0; this.errAvg = 0; this.speed = 1;
    } else if (this.seekNext || frame0 >= this.nextCheck) {
      this.nextCheck = frame0 + this.checkFrames;
      this.errMs = ((this.pos - T0) / this.rate) * 1000;
      if (this.seekNext || Math.abs(this.errMs) > CLIP_JUMP_MS) {
        if (this.seekNext) this.seeks++; else this.jumps++;
        this.seekNext = false;
        this.jump = 1; // this block fades out where it is; the next starts where the clock says
      } else {
        this.errAvg += 0.5 * (this.errMs - this.errAvg);
        const e = this.errAvg;
        this.speed = Math.abs(e) < CLIP_DEAD_MS ? 1 : 1 + Math.max(-CLIP_SPEED, Math.min(CLIP_SPEED, (-e / 1000) * CLIP_KP));
      }
    }
    const { data, cap, mask, ch } = this, lo = Math.max(0, this.written - cap + 8), hi = this.written;
    const msPer = 1000 / this.sr, E0 = this.off + frame0 * msPer;
    let pos = this.pos, avail = this.avail, dry = false;
    // a source at the context's rate, back at speed 1 with a fraction left from steering: a hair fast until the fraction
    // wraps, then exact copies again (a permanent fractional delay would be a gentle low-pass)
    let step = step0 * this.speed;
    if (same && this.speed === 1 && pos !== Math.floor(pos)) step = 1.001;
    for (let i = i0; i < n; i++) {
      const fl = Math.floor(pos), rel = fl - this.origin;
      let g = clipFade(E0 + i * msPer, this.fadeIn, this.fadeOut);
      if (this.jump === 1) g *= 1 - (i - i0 + 1) / (n - i0);
      if (rel < lo || rel + 1 >= hi) { dry = true; avail = 0; } // not in the ring (yet): silence
      else {
        if (avail < 1) avail = Math.min(1, avail + 1 / CLIP_RAMP);
        const f = pos - fl, gg = g * avail;
        if (gg !== 0) {
          const im1 = (this.om + (rel > lo ? rel - 1 : rel)) & mask, i1 = (this.om + rel) & mask, ip1 = (this.om + rel + 1) & mask, ip2 = (this.om + (rel + 2 < hi ? rel + 2 : rel + 1)) & mask;
          for (let c = 0; c < ch; c++) {
            const out = outs[c];
            if (!out) continue;
            const b = c * cap, xm1 = data[b + im1], x0 = data[b + i1], x1 = data[b + ip1], x2 = data[b + ip2];
            out[i] = f === 0 ? x0 * gg
              : ((((0.5 * (x2 - xm1) + 1.5 * (x0 - x1)) * f + (xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2)) * f + 0.5 * (x1 - xm1)) * f + x0) * gg;
          }
        }
      }
      const next = pos + step;
      if (step === 1.001 && Math.floor(next) - fl > 1) { pos = Math.floor(next); step = 1; } else pos = next; // the fraction wrapped: drop it
    }
    this.pos = pos; this.avail = avail;
    if (dry) { this.underruns++; Atomics.add(this.h, CR_UNDER, 1); }
    Atomics.store(this.h, CR_RREL, Math.floor(pos) - this.origin);
    Atomics.store(this.h, CR_RGEN, this.gen);
    Atomics.store(this.h, CR_READING, 1);
    return this.state;
  }
  stats() { return { state: this.state, pos: this.pos, errMs: this.errMs, speed: this.speed, jumps: this.jumps, seeks: this.seeks, underruns: this.underruns }; }
}
