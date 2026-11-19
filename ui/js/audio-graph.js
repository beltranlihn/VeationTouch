// Room audio — the routing graph of the synthesis context (contract: experiences/SOUND-API.md).
//
//   piece ─ wallInput(wall, u) ─ speaker gains ─┐
//        ├─ roomInput() ──────── every wall ────┼─ bus[c] ─ wall high-pass ─┐
//        └─ subInput() ──────────────── (sub) ──┘                           │
//   wall inputs + room input ─ subSum ─ low-pass at the crossover ─ sub ────┼─ post[c] ─ (fold to L/R) ─ merger
//                                                                           │      (discrete, one channel per output)
//   test tones ─────────────────────────────────────────────────────────────┘             │
//                                                           master × mute ─ limiter ─ output
//
// Channels are the profile's logical channels (1-based in the profile, 0-based here). The output node carries
// `fold ? 2 : channels` channels; whoever owns the context connects it (a ring writer in the app, the destination in tests).
// A change of map / channels / sub needs a new graph: the live ones are master, mute, ceiling, crossover, wall high-pass.

import { speakerGains, foldMatrix, dbToLin } from './audio-core.js';

const SMOOTH_S = 0.03;
const TONE_WALL_HZ = 110, TONE_SUB_HZ = [55, 110];
const TONE_LEVEL = 0.07;        // the sub's tone: −23 dBFS before master and limiter, soft
const TONE_STRIKES = 3;         // a wall channel's test: three low strikes in the test's second
const TONE_STRIKE_LEVEL = 0.12; // each strike's peak (before master and limiter)

/** A mono GainNode (anything connected to it is summed down to one channel). */
function mono(ctx, gain = 1) {
  const g = ctx.createGain();
  g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers';
  g.gain.value = gain;
  return g;
}

/** Two biquads in series: a 4th-order (24 dB/oct) Butterworth-ish filter. */
function filter4(ctx, type, hz) {
  const stages = [0, 1].map(() => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = Math.SQRT1_2; return f; });
  stages[0].connect(stages[1]);
  return { input: stages[0], output: stages[1], set(v) { for (const f of stages) f.frequency.value = v; } };
}

/**
 * @param {BaseAudioContext} ctx  AudioContext (or OfflineAudioContext in tests), 48 kHz
 * @param {object} cfg  the profile's audio block (channels, map, sub, wallHighpassHz, master, mute, ceilingDb) + `walls`
 *   ([{ id, name }] of the room) + `fold` (true: fold into stereo instead of one output per channel)
 * @param {{ workletUrl?: string, fadeStart?: number }} opt  fadeStart: the pieces' level at the start (0 = silent until fade())
 */
export async function buildRoomAudio(ctx, cfg, { workletUrl = '/js/audio-worklets.js', fadeStart = 1 } = {}) {
  await ctx.audioWorklet.addModule(workletUrl);
  const N = Math.max(1, cfg.channels | 0), fold = !!cfg.fold, outN = fold ? 2 : N;
  const sub = cfg.sub?.channel ? cfg.sub.channel - 1 : -1;
  const hasSub = sub >= 0 && sub < N;
  const roomWalls = Array.isArray(cfg.walls) ? cfg.walls : [];
  // the speakers of each wall: its channels in order (left → right), never the sub's, never beyond the channel count
  const speakers = new Map();
  for (const w of roomWalls) {
    const list = (cfg.map?.[w.id] || []).map((c) => c - 1).filter((c, k, a) => Number.isInteger(c) && c >= 0 && c < N && c !== sub && a.indexOf(c) === k);
    if (list.length) speakers.set(w.id, list);
  }
  const wallChannels = [...new Set([...speakers.values()].flat())];

  // ---- per channel: the bus the pieces feed (it also carries the fade), the filter, and `post` (what leaves the channel)
  const bus = Array.from({ length: N }, () => mono(ctx, fadeStart));
  const post = Array.from({ length: N }, () => mono(ctx));
  const hp = cfg.wallHighpassHz > 0 ? cfg.wallHighpassHz : 0;
  const hpFilters = new Map();
  for (const c of wallChannels) {
    if (hp) { const f = filter4(ctx, 'highpass', hp); bus[c].connect(f.input); f.output.connect(post[c]); hpFilters.set(c, f); } else bus[c].connect(post[c]);
  }
  // the sub: every wall input and the room input also go to subSum; it is low-passed at the crossover; subInput() joins after
  const subSum = mono(ctx, fadeStart), subDirect = mono(ctx, fadeStart), subFold = mono(ctx, fadeStart);
  let lp = null;
  if (hasSub) {
    lp = filter4(ctx, 'lowpass', cfg.sub.crossoverHz || 90);
    subSum.connect(lp.input); lp.output.connect(post[sub]); subDirect.connect(post[sub]);
  } else for (const c of wallChannels) subFold.connect(post[c]); // no sub in the map: the low end is heard on the walls
  const fadeNodes = [...bus, subSum, subDirect, subFold];

  // ---- output: one merger input per output channel (discrete), or the fold to stereo
  const merger = ctx.createChannelMerger(outN);
  if (fold) {
    const m = foldMatrix(N, hasSub ? sub : -1);
    for (let c = 0; c < N; c++) for (let k = 0; k < 2; k++) if (m[c][k] > 1e-6) { const g = mono(ctx, m[c][k]); post[c].connect(g); g.connect(merger, 0, k); }
  } else for (let c = 0; c < N; c++) post[c].connect(merger, 0, c);

  const master = ctx.createGain();
  master.channelCount = outN; master.channelCountMode = 'explicit'; master.channelInterpretation = 'discrete';
  const level = (cfg) => (cfg.mute ? 0 : Math.min(1, Math.max(0, cfg.master ?? 0.5)));
  master.gain.value = level(cfg);
  merger.connect(master);
  const limiter = new AudioWorkletNode(ctx, 'vt-limiter', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [outN], channelCount: outN, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    processorOptions: { channels: outN, ceilingDb: cfg.ceilingDb ?? -2 },
  });
  master.connect(limiter);

  let meterCb = null;
  limiter.port.onmessage = (e) => { if (e.data && typeof e.data.peak === 'number') meterCb?.(e.data); };

  // ---- what the pieces get
  const silent = () => ({ node: mono(ctx, 0), setPosition() {}, disconnect() {} });
  const wallsApi = roomWalls.filter((w) => speakers.has(w.id)).map((w) => ({ id: w.id, name: w.name, speakers: speakers.get(w.id).length }));
  const track = new Set();
  const audio = {
    ctx,
    walls: wallsApi,
    wallInput(wallId, u = 0.5) {
      const chans = speakers.get(wallId);
      if (!chans) return silent();
      const node = mono(ctx), gains = chans.map(() => mono(ctx, 0));
      chans.forEach((c, k) => { node.connect(gains[k]); gains[k].connect(bus[c]); });
      if (hasSub) node.connect(subSum);
      // (no cancelScheduledValues on a move: cancelling a glide still under way snaps the gain back to its old value — a click
      // on every step of a moving hand; a new setTarget simply starts from wherever the last one has got to)
      const place = (pos, now) => speakerGains(chans.length, pos).forEach((g, k) => { if (now) gains[k].gain.value = g; else gains[k].gain.setTargetAtTime(g, ctx.currentTime, 0.02); });
      place(u, true);
      const h = { node, setPosition: (pos) => place(pos, false), disconnect() { node.disconnect(); gains.forEach((g) => g.disconnect()); track.delete(h); } };
      track.add(h);
      return h;
    },
    roomInput() {
      // equal power per wall, ONCE per channel: walls that share a channel (one Q-SYS feed for two walls) do not add up on it
      const node = mono(ctx), level = new Map();
      for (const chans of speakers.values()) for (const c of chans) level.set(c, Math.max(level.get(c) || 0, 1 / Math.sqrt(chans.length)));
      for (const [c, v] of level) { const g = mono(ctx, v); node.connect(g); g.connect(bus[c]); }
      if (hasSub) node.connect(subSum);
      return node;
    },
    subInput() {
      const node = mono(ctx);
      node.connect(hasSub ? subDirect : subFold);
      return node;
    },
  };

  // ---- host controls
  const smooth = (param, v) => param.setTargetAtTime(v, ctx.currentTime, SMOOTH_S);
  return {
    audio, output: limiter, channels: N, outputChannels: outN, fold, hasSub,
    /**
     * A test signal on ONE logical channel (1-based), after the filters so a wall test is not cut by its high-pass.
     * A wall channel gets low STRIKES (110 Hz with its harmonics, quick attack, ringing down): in a room a strike is placed
     * at once, a steady high sine is not. The sub keeps its soft low tone.
     */
    tone(channel, { seconds = 1, at = ctx.currentTime } = {}) {
      const c = channel - 1;
      if (!(c >= 0 && c < N)) return false;
      const env = mono(ctx, 0), parts = [];
      if (c === sub) {
        for (const [k, f] of TONE_SUB_HZ.entries()) { const o = ctx.createOscillator(); o.frequency.value = f; const g = mono(ctx, k ? 0.5 : 1); o.connect(g); g.connect(env); parts.push(o); }
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(TONE_LEVEL, at + 0.04);
        env.gain.setValueAtTime(TONE_LEVEL, at + seconds - 0.12);
        env.gain.linearRampToValueAtTime(0, at + seconds);
      } else {
        // a struck string-like tone: harmonics 1..12 at 1/n, through a gentle low-pass, struck STRIKES times
        const real = new Float32Array(13), imag = new Float32Array(13);
        for (let n = 1; n <= 12; n++) imag[n] = 1 / n;
        const o = ctx.createOscillator(); o.setPeriodicWave(ctx.createPeriodicWave(real, imag)); o.frequency.value = TONE_WALL_HZ;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.5;
        o.connect(lp); lp.connect(env); parts.push(o);
        const every = seconds / TONE_STRIKES;
        env.gain.setValueAtTime(0, at);
        for (let k = 0; k < TONE_STRIKES; k++) {
          const t = at + k * every;
          env.gain.linearRampToValueAtTime(TONE_STRIKE_LEVEL, t + 0.004);
          env.gain.setTargetAtTime(0, t + 0.004, every / 5);
          if (k + 1 < TONE_STRIKES) env.gain.setValueAtTime(TONE_STRIKE_LEVEL * Math.exp(-5 * (every - 0.006) / every), t + every - 0.002);
        }
        env.gain.setTargetAtTime(0, at + seconds, 0.01);
      }
      env.connect(post[c]);
      for (const o of parts) { o.start(at); o.stop(at + seconds + 0.08); }
      parts[0].onended = () => { env.disconnect(); };
      return true;
    },
    /** The pieces' level to `to` (0..1) over `ms` (start / stop fades). */
    fade(to, ms) {
      const now = ctx.currentTime;
      for (const g of fadeNodes) {
        const p = g.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        if (ms > 0) p.linearRampToValueAtTime(to, now + ms / 1000); else p.setValueAtTime(to, now);
      }
    },
    /** Live settings: master, mute, ceilingDb, wallHighpassHz, sub.crossoverHz. */
    set(next) {
      if ('master' in next || 'mute' in next) { cfg = { ...cfg, ...('master' in next ? { master: next.master } : {}), ...('mute' in next ? { mute: next.mute } : {}) }; smooth(master.gain, level(cfg)); }
      if (Number.isFinite(next.ceilingDb)) limiter.port.postMessage({ ceilingDb: next.ceilingDb });
      if (Number.isFinite(next.wallHighpassHz) && next.wallHighpassHz > 0) for (const f of hpFilters.values()) f.set(next.wallHighpassHz);
      if (Number.isFinite(next.crossoverHz) && lp) lp.set(next.crossoverHz);
    },
    /** Called with { peak, gain } (linear) about every 53 ms. */
    onMeter(fn) { meterCb = fn; },
    dispose() { meterCb = null; for (const h of [...track]) h.disconnect(); try { limiter.disconnect(); master.disconnect(); } catch { /* gone */ } },
  };
}

export { dbToLin };
