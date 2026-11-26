// Ressonància — the TRAILER's interaction sounds (studio 26-11, Beltrán: «la interactividad en la sala funciona cuando es sinestésica:
// escucho un efecto cada vez que toco o hago algo»). A module of the sound piece: sound.js mounts it and feeds it what the visual piece
// posts on BroadcastChannel('ressonancia') — { type: 'ev', part, block, ev } → onEvent, { type: 'st', part, block, p } → onState — and
// the hands of vt.on('touch') → onHand. Everything with pitch is in the block's key (KEYS, or the `key` option).
//
//   import { createTrailerSfx } from './sfx-trailer.js';
//   const sfx = createTrailerSfx(audio, { key: KEYS_OVERRIDE?, walls: vt.walls, gain: 1 });
//   sfx.onEvent(part, block, ev) · sfx.onState(part, block, p) · sfx.onHand(block, hand) · sfx.setBlock(block) · await sfx.stop(ms)
//
// Own synthesis only (FM bells, filtered noise, grains, one generated convolution per wall); no samples. Every sound is placed on the
// wall of its event with audio.wallInput(wallId, u) (event wall indexes = audio.walls order). Levels: one note ≈ −20 dBFS peak (0.1),
// chords spread their notes over walls and share that budget; every gain moves on a ramp; ≤ 24 routed voices, the oldest yields (a
// voice = one wallInput; a rain of grains on a wall is one voice). Walls high-passed (the host sums walls into the sub); the low end
// goes to the sub through explicit sends. Never ctx.destination.

// block → allowed pitch classes (C = 0) — the keys measured in the trailer's music. MIDI notes are accepted too (taken mod 12).
export const KEYS = {
  wait: [2, 4, 6, 9, 11],            // D major pentatonic
  intro: [2, 4, 6, 7, 9, 11, 1],     // D major
  brasa: [2, 4, 7, 9],               // D / A, no clear third
  pinya: [9, 0, 2, 4, 7],            // A minor pentatonic
  tronc: [2, 4, 7, 9, 0],            // D E G A C
  pom: [2, 4, 6, 7, 9, 11, 1],       // the aleta: D major
  crown: [2, 4, 6, 7, 9, 11, 1],
  festa: [2, 4, 6, 7, 9, 11, 1],
  baixada: [2, 4, 6, 7, 9, 11, 1],
  fall: [2, 4, 6, 7, 9, 11, 1],
  acta: [2, 4, 6, 7, 9, 11, 1],      // the closing: D major
};
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
const MAX_VOICES = 24;
const NOTE = 0.1;                     // ≈ −20 dBFS: the peak of one note

export function createTrailerSfx(audio, { key = {}, walls: vtWalls = null, gain = 1 } = {}) {
  const ctx = audio.ctx;
  const walls = audio.walls;
  const NW = walls.length;
  const now = () => ctx.currentTime + 0.005;   // a hair ahead: nothing is scheduled in the past
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const K = { ...KEYS, ...key };
  let gainK = gain, stopped = false, block = 'wait';

  // ------------------------------------------------------------------------------------------------ the key
  const pcs = (b) => new Set((K[b] || D_MAJOR).map((n) => ((Math.round(n) % 12) + 12) % 12));
  function scale(b, lo, hi) { const s = pcs(b), out = []; for (let m = Math.ceil(lo); m <= hi; m++) if (s.has(m % 12)) out.push(m); return out; }
  function degree(b, base, n) { const s = scale(b, base, base + 60); return s[Math.max(0, Math.min(s.length - 1, n))]; }   // n-th note of the key at or above base
  function pick(b, lo, hi, k) { const s = scale(b, lo, hi); return s[Math.max(0, Math.min(s.length - 1, Math.round(k * (s.length - 1))))]; }

  // ------------------------------------------------------------------------------------------------ walls
  const wallIdx = (w) => { const i = typeof w === 'number' ? w : walls.findIndex((x) => x.id === w); return i >= 0 && i < NW ? i : 0; };
  const P1 = Math.max(0, walls.findIndex((w) => /P1/i.test(w.id) || /P1/i.test(w.name || '')));
  const P1i = P1 >= 0 ? P1 : Math.min(1, NW - 1);
  const wallH = (i) => { const id = walls[i]?.id; const vw = vtWalls?.find?.((w) => w.id === id); return vw?.height || 3.75; };

  // ------------------------------------------------------------------------------------------------ shared material
  const noiseBuf = (() => { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const irBuf = (() => {   // a generated hall: 2.6 s of decaying noise, darker as it fades (one mono IR, shared)
    const len = Math.floor(ctx.sampleRate * 2.6), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let lp = 0;
    let e = 0;
    for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate, k = 0.2 + 0.75 * Math.exp(-t * 1.4); lp += k * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.exp(-t * 2.4); e += d[i] * d[i]; }
    const nk = 0.7 / Math.sqrt(e); for (let i = 0; i < len; i++) d[i] *= nk;   // an RMS gain of ≈ −3 dB: the send level is the reverb level
    return b;
  })();
  const sub = ctx.createGain(); sub.gain.value = gainK;
  { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; sub.connect(lp); lp.connect(audio.subInput()); }
  // per wall: a reverb (send → convolver → the wall's centre), high-passed
  const wet = walls.map((w) => {
    const send = ctx.createGain(); send.gain.value = gainK;
    const cv = ctx.createConvolver(); cv.normalize = false; cv.buffer = irBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    const wi = audio.wallInput(w.id, 0.5);
    send.connect(cv); cv.connect(hp); hp.connect(wi.node);
    return { send, wi };
  });

  // ------------------------------------------------------------------------------------------------ voices
  const voices = [];
  // a voice: one placed input on wall i at u; returns the node to play into. ttl: seconds until it is torn down.
  function voice(i, u, ttl, verb = 0.3) {
    const t = now();
    while (voices.length >= MAX_VOICES) yieldVoice(voices[0], 0.025);
    i = wallIdx(i);
    const wi = audio.wallInput(walls[i].id, clamp01(u ?? 0.5));
    const g = ctx.createGain(); g.gain.value = gainK;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.6;
    const vs = ctx.createGain(); vs.gain.value = verb;
    g.connect(hp); hp.connect(wi.node); g.connect(vs); vs.connect(wet[i].send);
    const v = { g, wi, nodes: [hp, vs], end: t + ttl, timer: 0 };
    v.timer = setTimeout(() => drop(v), (ttl + 0.3) * 1000);
    voices.push(v);
    return g;
  }
  function yieldVoice(v, tc = 0.03) {
    const k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1);
    const t = now(); v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, tc);
    clearTimeout(v.timer); v.timer = setTimeout(() => drop(v), tc * 8000 + 60);
  }
  function drop(v) {
    const k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1);
    try { v.g.disconnect(); for (const n of v.nodes) n.disconnect(); v.wi.disconnect(); } catch { /* gone */ }
  }
  const lastAt = new Float64Array(NW).fill(-9);   // the last event sound on each wall (a hand there does not add its grain)
  const mark = (i) => { lastAt[wallIdx(i)] = now(); };

  // ------------------------------------------------------------------------------------------------ instruments
  function envAD(p, t, peak, a, d) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a); p.setTargetAtTime(0, t + a, d / 4); }
  function osc(type, f, t, dur, dest, detune = 0) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.connect(dest); o.start(t); o.stop(t + dur); return o; }
  function noise(t, dur, dest, rate = 1) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate; s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur); return s; }
  function gainAt(dest, v = 0) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }

  // an FM bell: bright attack, the index falls; ratio 1.4 / 3.5 give glass / bronze
  function bell(dest, t, f, amp, dur, ratio = 1.4, index = 2.5) {
    const g = gainAt(dest); envAD(g.gain, t, amp, 0.004, dur);
    const c = osc('sine', f, t, dur + 0.2, g);
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * index, t); mg.gain.setTargetAtTime(f * 0.15, t, dur * 0.12); mg.connect(c.frequency);
    osc('sine', f * ratio, t, dur + 0.2, mg);
  }
  // a soft tone: sine + a quiet octave, rounded attack
  function tone(dest, t, f, amp, a, dur) {
    const g = gainAt(dest); envAD(g.gain, t, amp, a, dur);
    osc('sine', f, t, a + dur + 0.2, g); const g2 = gainAt(g, 0.18); osc('triangle', f * 2, t, a + dur + 0.2, g2, rand(-4, 4));
  }
  // a pad note: two detuned triangles through a low-pass that opens
  function padNote(dest, t, f, amp, a, dur, bright = 1800) {
    const g = gainAt(dest); envAD(g.gain, t, amp, a, dur);
    const lp = filt('lowpass', 300, 0.5, g); lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(bright, t + a);
    lp.frequency.setTargetAtTime(500, t + a, dur / 3);
    osc('triangle', f, t, a + dur + 0.3, lp, -6); osc('triangle', f, t, a + dur + 0.3, lp, 6);
  }
  // a skin / a soft low hit: a falling sine, a little body noise, a sub send
  function thump(dest, t, f0, f1, amp, dur, subAmt = 0.5, knock = 0.3) {
    const g = gainAt(dest); envAD(g.gain, t, amp, 0.003, dur);
    const o = osc('sine', f0, t, dur + 0.2, g); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5);
    if (subAmt > 0) { const s = gainAt(sub); envAD(s.gain, t, amp * subAmt, 0.003, dur); const so = osc('sine', f0, t, dur + 0.2, s); so.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5); }
    if (knock > 0) { const ng = gainAt(dest); envAD(ng.gain, t, amp * knock, 0.002, 0.08); noise(t, 0.2, filt('bandpass', f0 * 6, 1.2, ng)); }
  }
  // a band of breath / wind: noise through a moving band-pass
  function breath(dest, t, f0, f1, amp, a, d, q = 0.9) {
    const g = gainAt(dest); envAD(g.gain, t, amp, a, d);
    const bp = filt('bandpass', f0, q, g); bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + a + d * 0.5);
    noise(t, a + d + 0.2, bp, rand(0.9, 1.1));
  }
  // a crystal grain: a short glass partial pair
  function glint(dest, t, f, amp, dur = 0.5) {
    const g = gainAt(dest); envAD(g.gain, t, amp, 0.002, dur);
    osc('sine', f, t, dur + 0.1, g); const g2 = gainAt(g, 0.35); osc('sine', f * 2.76, t, dur * 0.5, g2);
  }

  // ------------------------------------------------------------------------------------------------ held tones (charges, gold)
  const held = new Map();   // key → { g, os: [], steps, t0, block }
  function holdStop(k, tc = 0.02) {
    const h = held.get(k); if (!h) return; held.delete(k);
    const t = now(); h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, tc);
    for (const o of h.os) try { o.stop(t + tc * 8 + 0.05); } catch { /* stopped */ }
    clearInterval(h.timer); h.v && yieldVoice(h.v, tc);
  }
  // a rising charge tone, quantized to the key: one step every `step` s from `base`, `steps` steps at most, a tiny pluck on each step
  function charge(k, i, u, b, base, { step = 0.42, steps = 7, amp = 0.055, ttl = 12 } = {}) {
    holdStop(k, 0.02);
    const t = now(), sc = scale(b, base, base + 36); if (!sc.length) return;
    const dest = voice(i, u, ttl, 0.35), v = voices[voices.length - 1];
    const g = gainAt(dest); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.08);
    const lp = filt('lowpass', 1400, 0.7, g);
    const o1 = osc('sine', hz(sc[0]), t, ttl, lp), o2 = osc('triangle', hz(sc[0]) * 2, t, ttl, gainAt(lp, 0.12), 3);
    const trem = ctx.createGain(); trem.gain.value = amp * 0.15; const lfo = osc('sine', 4.2, t, ttl, trem); trem.connect(g.gain);
    const h = { g, os: [o1, o2, lfo], lp, n: 0, sc, v, block: b, steps, dest };
    const advance = () => {
      if (!held.has(k) || h.n >= Math.min(steps, sc.length - 1)) return;
      h.n++; const tt = now(), f = hz(sc[h.n]);
      o1.frequency.setTargetAtTime(f, tt, 0.018); o2.frequency.setTargetAtTime(f * 2, tt, 0.018);
      bell(dest, tt, f * 2, 0.022, 0.35, 3.5, 1.2);
    };
    h.timer = setInterval(advance, step * 1000);
    bell(dest, t, hz(sc[0]) * 2, 0.03, 0.4, 3.5, 1.2);
    held.set(k, h); mark(i);
    setTimeout(() => { if (held.get(k) === h) holdStop(k, 0.25); }, ttl * 1000 - 400);
  }
  // the golden light of the tower: a shimmer that grows with st.p.charge
  function goldOn(i, b) {
    const k = 'gold:' + i; if (held.has(k)) return;
    const t = now(), dest = voice(i, 0.5, 40, 0.5), v = voices[voices.length - 1];
    const g = gainAt(dest); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.6);
    const lp = filt('lowpass', 1200, 0.5, g);
    const notes = [degree(b, 74, 0), degree(b, 74, 2), degree(b, 86, 0)];   // D5 · the 2nd step · D6 (the octave fades in with the charge)
    const os = [], og = [];
    notes.forEach((m, n) => { const gg = gainAt(lp, n < 2 ? 0.5 : 0); og.push(gg); os.push(osc('sine', hz(m), t, 40, gg, rand(-5, 5)), osc('sine', hz(m), t, 40, gg, rand(4, 9))); });
    const h = { g, os, lp, og, v, block: b, gold: true };
    h.timer = setTimeout(() => { if (held.get(k) === h) holdStop(k, 0.5); }, 39000);
    held.set(k, h); mark(i);
  }
  function goldLevel(c) {
    const t = now(), k = clamp01(c);
    for (const [key, h] of held) if (h.gold) {
      h.g.gain.setTargetAtTime(0.025 + 0.06 * k, t, 0.25);
      h.lp.frequency.setTargetAtTime(1200 + 4800 * k, t, 0.25);
      h.og[2].gain.setTargetAtTime(0.5 * k, t, 0.3);
    }
  }

  // ------------------------------------------------------------------------------------------------ the sounds
  const S = {
    // the entrance: the buttons appear — a soft chord that opens, one note per wall
    open(b) {
      const t = now(), ch = [degree(b, 62, 0), degree(b, 62, 3), degree(b, 74, 1), degree(b, 74, 3)];
      for (let i = 0; i < NW; i++) { padNote(voice(i, 0.5, 5, 0.5), t + i * 0.11, hz(ch[i % ch.length]), 0.05, 0.6, 3.2, 2200); mark(i); }
    },
    // the mosaic falls: a deep hit everywhere, then a rain of crystal grains in the key round the room
    cleared(b) {
      for (const k of [...held.keys()]) if (k.startsWith('u:')) holdStop(k, 0.08);
      const t = now();
      for (let i = 0; i < NW; i++) {
        const d = voice(i, 0.5, 5, 0.6); mark(i);
        thump(d, t, 62, 34, 0.09, 1.5, i === 0 ? 0.9 : 0, 0.25);
        breath(d, t, 300, 90, 0.035, 0.01, 1.2, 0.7);
        const notes = scale(b, 81, 100), n = 12;
        for (let j = 0; j < n; j++) { const tt = t + 0.25 + Math.pow(Math.random(), 1.6) * 2.6; glint(d, tt, hz(notes[(Math.random() * notes.length) | 0]), rand(0.018, 0.04) * (1 - (tt - t) / 3.4), rand(0.4, 0.9)); }
      }
    },
    // the pinya: a being is born — a warm breath and a low note of the key, its height by the row
    born(b, i, u, y, row) {
      const t = now(), d = voice(i, u, 3, 0.35); mark(i);
      breath(d, t, rand(500, 800), rand(300, 400), 0.035, 0.18, 0.7, 0.8);
      const m = degree(b, 45, Math.max(0, row | 0) + (Math.random() < 0.3 ? 1 : 0));
      tone(d, t + 0.04, hz(m), 0.08, 0.03, 2.2);
      const s = gainAt(sub); envAD(s.gain, t, 0.04, 0.03, 1.2); osc('sine', hz(m), t, 1.6, s);
    },
    // a thread joins two groups: a tense note, higher the more the net covers
    join(b, i, cover) {
      const t = now(), d = voice(i, rand(0.2, 0.8), 2.4, 0.45); mark(i);
      const m = pick(b, 64, 83, clamp01(cover)), f = hz(m);
      const g = gainAt(d); envAD(g.gain, t, 0.05, 0.09, 1.3);
      const bp = filt('bandpass', f * 2, 2.5, g);
      const o = osc('sawtooth', f * 0.985, t, 1.8, bp); o.frequency.setTargetAtTime(f, t, 0.12);   // bowed in from just under the note
      const o2 = osc('sine', f, t, 1.8, gainAt(g, 0.6)); o2.frequency.setValueAtTime(f * 0.985, t); o2.frequency.setTargetAtTime(f, t, 0.12);
    },
    // the pinya is full: a suspended chord that resolves (sus4 → minor), spread round the room
    full(b) {
      const t = now(), r = degree(b, 57, 0);   // A3
      const sus = [r - 12, r, r + 5, r + 7], res = [r - 12, r, r + 3, r + 7, r + 12];
      for (let i = 0; i < NW; i++) {
        const d = voice(i, 0.5, 7, 0.55); mark(i);
        padNote(d, t, hz(sus[i % sus.length]), 0.04, 0.5, 1.4, 1600);
        padNote(d, t + 1.5, hz(res[i % res.length]), 0.045, 0.25, 4.5, 2400);
        if (i === P1i) padNote(d, t + 1.5, hz(res[4]), 0.03, 0.3, 4.5, 2600);
        bell(d, t + 1.5 + i * 0.07, hz(res[(i + 2) % res.length] + 12), 0.025, 2.2, 3.5, 1.5);
      }
    },
    // the tower: a ring charges under a hand — its tone, from the height of the hand
    towerCharge(b, i, u, y) { charge('t:' + i, i, u, b, pick(b, 50, 62, clamp01((y - 0.8) / 1.2)), { step: 0.5, steps: 6, amp: 0.05 }); },
    // the casteller forms: a flash at the hand, and a whoosh that travels wall to wall to P1 (the tower's wall)
    form(b, i, u, y) {
      const t = now(), d = voice(i, u, 2, 0.5); mark(i);
      bell(d, t, hz(pick(b, 81, 93, clamp01((y - 0.8) / 1.2))), 0.05, 0.9, 1.4, 3);
      breath(d, t, 2500, 5000, 0.02, 0.003, 0.25, 3);
      // the path the short way round to P1 (on P1 itself: across the wall, towards its centre)
      let fw = (P1i - i + NW) % NW, bw = (i - P1i + NW) % NW;
      const dir = fw <= bw ? 1 : -1, hops = Math.min(fw, bw);
      const pts = [[i, u]];
      if (hops === 0) pts.push([i, 0.5]);
      else { pts.push([i, dir > 0 ? 0.95 : 0.05]); for (let h = 1; h <= hops; h++) { const w = (i + dir * h + NW) % NW; pts.push([w, h === hops ? 0.5 : (dir > 0 ? 0.95 : 0.05)]); } }
      const seg = 0.32;
      pts.forEach(([w, uu], n) => {
        const tt = t + 0.05 + n * seg * 0.75, dv = voice(w, uu, 1.6, 0.5);
        const g = gainAt(dv); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.045, tt + seg * 0.6); g.gain.setTargetAtTime(0, tt + seg * 0.6, seg * 0.5);
        const bp = filt('bandpass', 700 + 500 * n, 1.4, g); bp.frequency.linearRampToValueAtTime(1600 + 600 * n, tt + seg * 1.5);
        noise(tt, seg * 2.5, bp);
      });
    },
    // a casteller lands on the tower: a soft hit on P1
    land(b, tier) { const t = now(), d = voice(P1i, rand(0.4, 0.6), 1.5, 0.3); mark(P1i); thump(d, t, 120, 70, 0.06, 0.4, 0.4, 0.45); },
    // a floor is complete: a hit and a chord one degree higher with every floor (P1 leads, the others answer)
    tier(b, n) {
      const t = now(), base = 50;   // D3
      const ch = [degree(b, base, n), degree(b, base, n + 2), degree(b, base, n + 4)];
      for (let i = 0; i < NW; i++) {
        const lead = i === P1i, d = voice(i, 0.5, 5, 0.45); mark(i);
        if (lead) thump(d, t, 90, 45, 0.06, 0.7, 0.8, 0.3);
        ch.forEach((m, k) => padNote(d, t + 0.03 + k * 0.04, hz(m + (k === 2 && !lead ? 12 : 0)), lead ? 0.032 : 0.02, 0.06, 2.6, 2200));
        if (lead) bell(d, t, hz(ch[0] + 24), 0.03, 1.5, 3.5, 1.4);
      }
    },
    // the top of the tower: a bronze cluster above, a swell below
    top(b) {
      const t = now(), hi = [degree(b, 74, 0), degree(b, 74, 3), degree(b, 86, 0)];
      for (let i = 0; i < NW; i++) {
        const d = voice(i, 0.5, 6, 0.6); mark(i);
        bell(d, t + i * 0.09, hz(hi[i % 3]), 0.04, 3, 3.5, 2);
        padNote(d, t, hz(degree(b, 38, 0) + (i % 2 ? 12 : 0)), 0.04, 0.8, 3.5, 900);
      }
      const s = gainAt(sub); envAD(s.gain, t, 0.06, 0.8, 3); osc('sine', hz(38), t, 5, s);
    },
    // the aleta charged: an inhalation (the release follows ≈ 0.35 s later)
    inhale() {
      const t = now();
      for (let i = 0; i < NW; i++) { const d = voice(i, 0.5, 1.2, 0.2); mark(i); const g = gainAt(d); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.36); g.gain.setTargetAtTime(0, t + 0.38, 0.03);
        const bp = filt('bandpass', 400, 1.1, g); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.38); noise(t, 0.6, bp); }
    },
    // the aleta: the bright release — a D major bloom of bells and grains round the room, the low D under it
    aleta(b) {
      for (const k of [...held.keys()]) if (k.startsWith('gold:') || k.startsWith('t:')) holdStop(k, 0.15);
      const t = now(), kb = K.pom ? 'pom' : b, ch = [degree(kb, 74, 0), degree(kb, 74, 2), degree(kb, 74, 4), degree(kb, 86, 0)];
      for (let i = 0; i < NW; i++) {
        const d = voice(i, 0.5, 6, 0.65); mark(i);
        bell(d, t + i * 0.05, hz(ch[i % 4]), 0.05, 3.2, 1.4, 2.5);
        padNote(d, t, hz(ch[(i + 1) % 4] - 12), 0.035, 0.05, 4, 3200);
        const hiN = scale(kb, 86, 100);
        for (let j = 0; j < 7; j++) glint(d, t + 0.1 + Math.random() * 1.8, hz(hiN[(Math.random() * hiN.length) | 0]), rand(0.012, 0.03), rand(0.5, 1));
        if (i === P1i) thump(d, t, 75, 38, 0.08, 1.4, 1, 0.2);
      }
    },
    // the closing (castells3d): all the towers built — a far chord, mostly reverb
    built() {
      const t = now(), ch = [50, 57, 66, 74];   // D3 A3 F#4 D5
      for (let i = 0; i < NW; i++) { const d = voice(i, 0.5, 8, 1.6); mark(i); const g = gainAt(d, 0.55); padNote(filt('lowpass', 1100, 0.5, g), t + i * 0.2, hz(ch[i]), 0.05, 1.4, 5, 1400); }
    },
    // a stage of the closing: a soft bell of its own, all in D major, each on its own wall round the room
    stage(name) {
      const ST = { correfoc: [74, 3.5], pinya: [78, 1.4], tronc: [81, 2.0], pom: [86, 3.5], aleta: [90, 1.4] };
      const names = Object.keys(ST), k = Math.max(0, names.indexOf(name)), [m, ratio] = ST[name] || [74, 3.5];
      const t = now(), i = k % NW, d = voice(i, 0.5, 4, 0.8); mark(i);
      bell(d, t, hz(m), 0.045, 2.8, ratio, 1.6);
      if (name === 'aleta') bell(d, t + 0.12, hz(86), 0.03, 3, 3.5, 1.2);
      tone(d, t, hz(m - 24), 0.03, 0.2, 2);
    },
    // the brasa's first correfoc: «¡pum!» — a deep blow round the room, a crack on top
    pum() {
      const t = now();
      for (let i = 0; i < NW; i++) {
        const d = voice(i, 0.5, 3, 0.5); mark(i);
        thump(d, t + i * 0.015, 70, 30, 0.1, 1.3, i === 0 ? 1 : 0, 0.4);
        const g = gainAt(d); envAD(g.gain, t, 0.05, 0.001, 0.12); noise(t, 0.25, filt('bandpass', rand(2200, 3600), 1.5, g));
        breath(d, t + 0.02, 1800, 200, 0.03, 0.02, 1.4, 0.6);
      }
    },
    // a hand with no other event: a soft grain in the key, at its height
    grain(b, i, u, ym) {
      const t = now(), d = voice(i, u, 1.4, 0.4);
      const m = pick(b, 69, 88, clamp01((ym - 0.6) / 1.6));
      glint(d, t, hz(m), 0.04, 0.7); tone(d, t, hz(m - 12), 0.018, 0.005, 0.5);
    },
  };

  // ------------------------------------------------------------------------------------------------ the API
  const handAt = new Float64Array(NW).fill(-9);
  const strokes = new Map();
  let bornAt = -9, joinAt = -9, cover = 0, lastBornWall = 0;
  function safe(fn) { try { if (!stopped && ctx.state === 'running') fn(); } catch (e) { console.error('sfx-trailer', e); } }

  function onEvent(part, b, evs) {
    if (!Array.isArray(evs)) evs = [evs];
    b = b || block;
    let landed = false;
    for (const ev of evs) {
      if (typeof ev !== 'string') continue;
      const a = ev.split(':'), name = a[0], w = a.length > 1 && a[1] !== '' && !isNaN(+a[1]) ? +a[1] : -1;
      safe(() => {
        if (part === 'umbral3d') {
          if (ev === 'open') S.open(b);
          else if (name === 'charge' && w >= 0) charge('u:' + w, w, 0.5, b, 62, { step: 0.42, steps: 7, amp: 0.05 });
          else if (name === 'uncharge' && w >= 0) holdStop('u:' + w, 0.015);
          else if (ev === 'cleared') S.cleared(b);
        } else if (part === 'pinya3d2') {
          if (name === 'born' && w >= 0) { const t = now(); if (t - bornAt < 0.09) return; bornAt = t; lastBornWall = w; S.born(b, w, +a[2] || 0.5, +a[3] || 1.2, +a[4] || 0); }
          else if (ev === 'thread:join') { const t = now(); if (t - joinAt < 0.14) return; joinAt = t; S.join(b, lastBornWall, cover); }
          else if (ev === 'full') S.full(b);
        } else if (part === 'torre3d') {
          if (name === 'charge' && w >= 0) S.towerCharge(b, w, +a[2] || 0.5, +a[3] || 1.3);
          else if (name === 'uncharge' && w >= 0) holdStop('t:' + w, 0.015);
          else if (name === 'form' && w >= 0) { holdStop('t:' + w, 0.04); S.form(b, w, +a[2] || 0.5, +a[3] || 1.3); }
          else if (name === 'land') { if (!landed) { landed = true; S.land(b, +a[1] || 0); } }
          else if (name === 'joined') { if (!landed && !evs.some((e) => typeof e === 'string' && e.startsWith('land'))) { landed = true; S.land(b, 0); } }
          else if (name === 'tier') S.tier(b, Math.max(0, (+a[1] || 1) - 1));
          else if (ev === 'top') S.top(b);
          else if (name === 'gold' && a[1] === 'on') goldOn(wallIdx(+a[2] || 0), b);
          else if (name === 'gold' && a[1] === 'off') holdStop('gold:' + wallIdx(+a[2] || 0), 0.15);
          else if (ev === 'aleta:charged') S.inhale();
          else if (ev === 'aleta') S.aleta(b);
          else if (ev === 'end') for (const k of [...held.keys()]) holdStop(k, 0.4);
        } else if (part === 'castells3d') {
          if (ev === 'built') S.built();
          else if (name === 'stage') S.stage(a[1]);
        } else if (part === 'brasa3d' || part === 'brasa2' || part === 'brasa') {
          if (ev === 'intro:boom') S.pum();   // brasa2-sound plays only the main 'boom'; the first correfoc's «¡pum!» is ours
        }
      });
    }
  }

  function onState(part, b, p) {
    if (!p || stopped) return;
    if (part === 'pinya3d2' && typeof p.threadCover === 'number') cover = p.threadCover;
    if (part === 'torre3d' && typeof p.charge === 'number') goldLevel(p.charge);
    if (part === 'umbral3d' && typeof p.cover === 'number') { const t = now(); for (const [k, h] of held) if (k.startsWith('u:')) h.lp.frequency.setTargetAtTime(1400 + 2600 * clamp01(p.cover), t, 0.3); }
  }

  // hand: { type?, wallId | wall, u, v (0..1 from the floor) | y (m), stroke } — a 'down' (or a hand without type) on its wall
  function onHand(b, hand) {
    if (!hand || stopped) return;
    if (hand.type && hand.type !== 'down') return;
    if (hand.stroke != null) { const t0 = strokes.get(hand.stroke); strokes.set(hand.stroke, now()); if (strokes.size > 64) strokes.delete(strokes.keys().next().value); if (t0 !== undefined && now() - t0 < 30) return; }   // a repeated down of one stroke adds no voice
    const i = wallIdx(hand.wallId ?? hand.wall ?? 0), t = now();
    if (t - handAt[i] < 0.3 || t - lastAt[i] < 0.3) return;
    handAt[i] = t;
    const ym = typeof hand.y === 'number' && hand.y <= 4 && !('v' in hand) ? hand.y : (hand.v ?? 0.35) * wallH(i);
    safe(() => S.grain(b || block, i, hand.u ?? 0.5, ym));
  }

  function setBlock(b) {
    if (b === block) return;
    block = b;
    for (const [k, h] of held) if (h.block !== b) holdStop(k, 0.12);
  }

  async function stop(ms = 600) {
    stopped = true;
    const t = now(), tc = Math.max(0.01, ms / 3000);
    for (const k of [...held.keys()]) holdStop(k, tc);
    for (const v of [...voices]) yieldVoice(v, tc);
    sub.gain.setTargetAtTime(0, t, tc); for (const w of wet) w.send.gain.setTargetAtTime(0, t, tc);
    await new Promise((r) => setTimeout(r, ms + 200));
    try { sub.disconnect(); for (const w of wet) { w.send.disconnect(); w.wi.disconnect(); } } catch { /* gone */ }
  }

  function setGain(g) { gainK = g; const t = now(); sub.gain.setTargetAtTime(g, t, 0.2); for (const w of wet) w.send.gain.setTargetAtTime(g, t, 0.2); for (const v of voices) v.g.gain.setTargetAtTime(g, t, 0.2); }

  return { onEvent, onState, onHand, setBlock, setGain, stop, voices: () => voices.length, keys: K };
}
