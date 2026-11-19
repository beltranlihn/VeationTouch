// Ambient notes — generated sound material (no file is loaded; nothing here needs Web Audio, so Node can test it).

/** Small seeded generator: the same seed always gives the same impulse response and noise. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A reverb impulse response made of decaying noise: `channels` independent noises (so left and right are decorrelated),
 * a short pre-delay and soft onset, an exponential decay of −60 dB at `seconds`, and a high end that darkens as it
 * decays (a one-pole low-pass whose cutoff falls from ~8 kHz to ~0.9 kHz). Returns one Float32Array per channel.
 */
export function makeImpulse({ sampleRate = 48000, seconds = 3.5, seed = 1, channels = 2, predelay = 0.018 } = {}) {
  const len = Math.max(16, Math.floor(sampleRate * (seconds + predelay)));
  const pre = Math.floor(sampleRate * predelay), onset = Math.floor(sampleRate * 0.012);
  const out = [];
  for (let c = 0; c < channels; c++) {
    const rand = rng(seed * 7919 + c * 104729 + 13);
    const d = new Float32Array(len);
    let y = 0;
    for (let n = pre; n < len; n++) {
      const t = (n - pre) / sampleRate;
      const env = 10 ** ((-3 * t) / seconds) * Math.min(1, (n - pre) / onset);
      const cutoff = Math.max(900, 8000 * Math.exp(-t * 1.3));
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      y += a * (rand() * 2 - 1 - y);
      d[n] = y * env;
    }
    out.push(d);
  }
  return out;
}

/** The impulse response as an AudioBuffer of this context. */
export function impulseBuffer(ctx, opts = {}) {
  const ch = makeImpulse({ sampleRate: ctx.sampleRate, ...opts });
  const buf = ctx.createBuffer(ch.length, ch[0].length, ctx.sampleRate);
  ch.forEach((d, i) => buf.copyToChannel(d, i));
  return buf;
}

/** A loop of soft white noise (the breath at the start of each note). */
export function noiseBuffer(ctx, seconds = 2, seed = 5) {
  const rand = rng(seed);
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return buf;
}
