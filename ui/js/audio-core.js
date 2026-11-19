// Room audio — the pure parts (no DOM, no WebAudio): they run in the audio window, inside the AudioWorklets and in Node tests.
//
//   RingWriter / RingReader  a lock-free single-writer single-reader ring of float frames in a SharedArrayBuffer: how the
//                            synthesis context hands its channels to the sink context of each output device
//   layoutDevices            the profile's device labels + the devices found → which logical channels go to which device
//   speakerGains / foldMatrix  how a wall's mono source is spread over its speakers; how N channels fold into stereo
//   Limiter                  the final stage: a linked-channel look-ahead limiter with a hard clip behind it
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
export class Limiter {
  constructor({ channels, sampleRate = SAMPLE_RATE, ceilingDb = -2, window = 64, releaseMs = 120 } = {}) {
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
