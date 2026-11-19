// FOR TESTS ONLY (nothing in the app loads this file): a minimal fake of the host in experiences/SOUND-API.md, on an
// OfflineAudioContext, plus a few helpers to drive it and to measure what came out. The real host
// (ui/js/audio-host.js) replaces it in the app.
//
// Output channels: each wall has `speakers` channels (default 2), in wall order, then one sub channel. The fake spreads a
// wall input across its speakers by u (equal power), feeds the room input to every speaker, and low-passes the sum of
// everything into the sub. Voices are created through the context's factory methods (createOscillator…), which this
// file wraps to count sources: the piece must not use `new OscillatorNode(…)`.

const WALLS = ['P1', 'P2', 'P3', 'P4'];

export function trackTimers() {
  const live = new Set();
  const g = globalThis;
  const real = { st: g.setTimeout.bind(g), si: g.setInterval.bind(g), ct: g.clearTimeout.bind(g), ci: g.clearInterval.bind(g) };
  const orig = { st: g.setTimeout, si: g.setInterval, ct: g.clearTimeout, ci: g.clearInterval };
  globalThis.setTimeout = (fn, ms, ...a) => { const id = real.st((...x) => { live.delete(id); fn(...x); }, ms, ...a); live.add(id); return id; };
  globalThis.setInterval = (fn, ms, ...a) => { const id = real.si(fn, ms, ...a); live.add(id); return id; };
  globalThis.clearTimeout = (id) => { live.delete(id); real.ct(id); };
  globalThis.clearInterval = (id) => { live.delete(id); real.ci(id); };
  return {
    live: () => live.size,
    restore() { g.setTimeout = orig.st; g.setInterval = orig.si; g.clearTimeout = orig.ct; g.clearInterval = orig.ci; },
  };
}

export async function manifestDefaults() {
  const m = await (await fetch(new URL('./manifest.json', import.meta.url))).json();
  return Object.fromEntries(m.params.map((p) => [p.key, p.default]));
}

/** { audio, vt, params, ctx, … } — `params` are the manifest defaults plus `overrides`. */
export async function fakeHost({ seconds = 6, wallIds = WALLS, speakers = 2, sub = true, sampleRate = 48000, overrides = {} } = {}) {
  const params = { ...(await manifestDefaults()), ...overrides };
  const layout = wallIds.map((id) => ({ id, name: id, speakers }));
  const total = layout.reduce((a, w) => a + w.speakers, 0) + (sub ? 1 : 0);
  const ctx = new OfflineAudioContext({ numberOfChannels: total, length: Math.ceil(seconds * sampleRate), sampleRate });
  const merger = ctx.createChannelMerger(total);
  merger.connect(ctx.destination);

  // count sources: started / stopped (and when)
  const sources = [];
  for (const [factory, kind] of [['createOscillator', 'osc'], ['createBufferSource', 'buffer'], ['createConstantSource', 'constant']]) {
    const orig = ctx[factory].bind(ctx);
    ctx[factory] = (...a) => {
      const n = orig(...a), rec = { kind, startAt: null, stopAt: null };
      const start = n.start.bind(n), stop = n.stop.bind(n);
      n.start = (...x) => { rec.startAt = x[0] ?? 0; return start(...x); };
      n.stop = (when = 0) => { const r = stop(when); rec.stopAt = when; return r; };
      sources.push(rec);
      return n;
    };
  }

  // speaker buses → merger
  const channelsOf = {}, bus = {};
  let c = 0;
  for (const w of layout) {
    channelsOf[w.id] = [];
    bus[w.id] = [];
    for (let k = 0; k < w.speakers; k++) {
      const g = ctx.createGain(); g.connect(merger, 0, c);
      channelsOf[w.id].push(c++); bus[w.id].push(g);
    }
  }
  const subCh = sub ? c : null;
  const subSum = ctx.createGain();
  if (sub) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; subSum.connect(lp); lp.connect(merger, 0, subCh); }
  const room = ctx.createGain(); // heard on every speaker
  for (const id of Object.keys(bus)) for (const g of bus[id]) room.connect(g);
  room.connect(subSum);
  const subIn = ctx.createGain();
  if (sub) subIn.connect(subSum); else subIn.connect(room);

  const calls = { wallInput: [], positions: [], disconnects: 0 };
  const weights = (n, u) => {
    if (n === 1) return [1];
    const w = Array.from({ length: n }, (_, k) => Math.max(0, 1 - Math.abs(u - k / (n - 1)) * (n - 1)));
    const norm = Math.hypot(...w) || 1;
    return w.map((x) => x / norm);
  };
  const audio = {
    ctx,
    walls: layout,
    wallInput(wallId, u = 0.5) {
      calls.wallInput.push({ wallId, u });
      const node = ctx.createGain();
      const spk = bus[wallId];
      if (!spk) return { node, setPosition() {}, disconnect() {} }; // unknown wall: goes nowhere
      const gs = spk.map((b) => { const g = ctx.createGain(); node.connect(g); g.connect(b); return g; });
      const set = (x) => weights(spk.length, Math.min(1, Math.max(0, x))).forEach((w, k) => { gs[k].gain.value = w; });
      set(u);
      node.connect(subSum);
      return {
        node,
        setPosition(x) { calls.positions.push({ wallId, u: x }); set(x); },
        disconnect() { calls.disconnects++; try { node.disconnect(); } catch { /* already */ } },
      };
    },
    roomInput: () => room,
    subInput: () => subIn,
  };

  // the runtime in sound mode
  const listeners = {}, hands = new Map();
  const vt = {
    params,
    walls: layout.map(({ id, name }) => ({ id, name })),
    closedLoop: true,
    on(type, fn) { (listeners[type] ||= new Set()).add(fn); return () => listeners[type].delete(fn); },
    hands: () => [...hands.values()].map((h) => ({ stroke: h.stroke, wallId: h.wallId, u: h.u, v: h.v, size: h.size ?? 0.1 })),
    listenerCount: () => Object.values(listeners).reduce((a, s) => a + s.size, 0),
    emit(type, e) {
      if (type === 'touch') { if (e.type === 'up') hands.delete(e.stroke); else hands.set(e.stroke, e); }
      for (const fn of [...(listeners[type] || [])]) fn(e);
    },
  };

  // things to do at a time while rendering, then the render
  const plan = [];
  const host = {
    audio, vt, params, ctx, calls, sources, channelsOf, subCh, sampleRate, seconds,
    at(t, fn) { plan.push({ t, fn }); },
    /** touch events at a time: host.touch(1.0, 'down', { stroke: 1, wallId: 'P2', u: 0.5, v: 0.5 }) */
    touch(t, type, e) { host.at(t, () => vt.emit('touch', { type, size: 0.1, ...e })); },
    /** Render the whole length; returns one Float32Array per output channel. */
    async render() {
      const quantum = 128 / sampleRate, byQ = new Map();
      for (const p of plan) { const q = Math.max(1, Math.round(p.t / quantum)); (byQ.get(q) || byQ.set(q, []).get(q)).push(p.fn); }
      for (const [q, fns] of [...byQ].sort((a, b) => a[0] - b[0])) {
        ctx.suspend(q * quantum).then(async () => { for (const fn of fns) await fn(); ctx.resume(); });
      }
      const buf = await ctx.startRendering();
      return Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    },
    /** sources that are started and not stopped by `t` (or never given a stop time) */
    runningAt: (t) => sources.filter((s) => s.startAt !== null && (s.stopAt === null || s.stopAt > t)).length,
  };
  return host;
}

/* ------------------------------------------------------------------ measuring */

export const rms = (d, sr, t0, t1) => {
  const a = Math.floor(t0 * sr), b = Math.min(d.length, Math.floor(t1 * sr));
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
export const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
export const peak = (d, sr = 1, t0 = 0, t1 = Infinity) => {
  let m = 0;
  for (let i = Math.floor(t0 * sr); i < Math.min(d.length, Math.floor(t1 * sr)); i++) m = Math.max(m, Math.abs(d[i]));
  return m;
};
/** largest sample-to-sample step in a time range (a click is a large step) */
export const maxStep = (d, sr, t0, t1) => {
  let m = 0;
  for (let i = Math.floor(t0 * sr) + 1; i < Math.min(d.length, Math.floor(t1 * sr)); i++) m = Math.max(m, Math.abs(d[i] - d[i - 1]));
  return m;
};
export const sum = (chs, idx) => { const out = new Float32Array(chs[0].length); for (const i of idx) for (let n = 0; n < out.length; n++) out[n] += chs[i][n]; return out; };

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** Magnitude spectrum (Hann window) of 2^15 samples starting at t0: { mag, hzPerBin }. */
export function spectrum(d, sr, t0, size = 32768) {
  const re = new Float64Array(size), im = new Float64Array(size), a = Math.floor(t0 * sr);
  for (let i = 0; i < size; i++) re[i] = (d[a + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, hzPerBin: sr / size };
}
/** The strongest frequency between lo and hi Hz (parabolic interpolation). */
export function dominantHz(d, sr, t0, lo = 40, hi = 4000) {
  const { mag, hzPerBin } = spectrum(d, sr, t0);
  let best = Math.floor(lo / hzPerBin);
  for (let i = best; i < Math.min(mag.length - 1, Math.floor(hi / hzPerBin)); i++) if (mag[i] > mag[best]) best = i;
  const l = Math.log(mag[best - 1] + 1e-12), m = Math.log(mag[best] + 1e-12), r = Math.log(mag[best + 1] + 1e-12);
  const off = (0.5 * (l - r)) / (l - 2 * m + r || 1);
  return (best + off) * hzPerBin;
}
