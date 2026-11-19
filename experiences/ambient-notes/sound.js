// Ambient notes — a sound experience (contract: experiences/SOUND-API.md). Own Web Audio synthesis only: no sample is loaded.
//
//  * The PAD plays all the time: a chord of detuned saws and triangles through a slow low-pass, a long generated reverb,
//    heard on every wall (audio.roomInput()); its bass note goes to the sub (audio.subInput()). Every `padChange`
//    seconds the next chord of the scale fades in over the old one.
//  * Each TOUCH plays one note on ITS wall (audio.wallInput): a soft bell (sines + a faint FM ping + a tap of noise)
//    whose pitch is the hand's height on the scale. It is STRUCK the moment the hand lands (up in a few ms: the touch is
//    felt), rings down, and while the hand stays it swells and brightens (bounded); on lift it fades in a long tail.
//    The position along the wall pans it between the wall's speakers and opens its filter.
//  * Notes belong to a STROKE (never to a tracker id), a repeated `down` never starts a second note, and the oldest note
//    yields (with a quick fade) at the per-wall and total caps.
//  * Headroom: one note peaks around −21 dBFS, the pad around −20 dBFS; every gain change is a ramp.

import { KEYS, SCALES, scaleLadder, noteForHeight, midiToHz, chordFor } from './theory.js';
import { VoiceBook } from './voices.js';
import { impulseBuffer, noiseBuffer } from './ir.js';

export const DEFAULTS = {
  key: 'D', scale: 'minor-pentatonic', lowOctave: 3, octaves: 3,
  attack: 5, swell: 3, release: 5, reverbMix: 45, padVolume: 20, notesVolume: 85, padChange: 45, positionFilter: 50,
  maxPerWall: 4, maxNotes: 12,
};

const NOTE_PEAK = 0.06;       // one note at full swell, before "Notes volume" (the sum of its partials is ~1.6x this)
const PAD_PEAK = 0.9;         // pad level before "Pad volume"
const BASS_PEAK = 0.2;        // pad bass (sub channel) before "Pad volume"
const WET = 0.9;              // reverb send at "Reverb mix" 100 %
const FAST_RELEASE = 0.45;    // seconds: a note that yields (to −60 dB)
const STRIKE_SETTLE = 0.6;    // seconds after the strike: it has rung down and the held note starts to swell
const MAX_HOLD = 180;         // seconds: a hand that never lifts is released after this
const TICK_MS = 200;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? clamp(Number(v), lo, hi) : d);

/** Merge raw parameter values into clean settings (units: seconds, octaves, 0..1 for percentages). */
export function settings(p = {}) {
  const q = { ...DEFAULTS, ...p };
  return {
    key: KEYS.includes(q.key) ? q.key : DEFAULTS.key,
    scale: SCALES[q.scale] ? q.scale : DEFAULTS.scale,
    lowOctave: Math.round(num(q.lowOctave, DEFAULTS.lowOctave, 1, 6)),
    octaves: Math.round(num(q.octaves, DEFAULTS.octaves, 1, 4)),
    // the strike is always quick (a touch must be felt the moment it lands): "Attack" is in ms and stays short
    attack: num(q.attack, DEFAULTS.attack, 2, 80) / 1000,
    swell: num(q.swell, DEFAULTS.swell, 0.5, 15),
    release: num(q.release, DEFAULTS.release, 0.3, 30),
    reverb: num(q.reverbMix, DEFAULTS.reverbMix, 0, 100) / 100,
    padVol: num(q.padVolume, DEFAULTS.padVolume, 0, 100) / 100,
    notesVol: num(q.notesVolume, DEFAULTS.notesVolume, 0, 100) / 100,
    padChange: num(q.padChange, DEFAULTS.padChange, 4, 600),
    posFilter: num(q.positionFilter, DEFAULTS.positionFilter, 0, 100) / 100,
    maxPerWall: Math.round(num(q.maxPerWall, DEFAULTS.maxPerWall, 1, 8)),
    maxNotes: Math.round(num(q.maxNotes, DEFAULTS.maxNotes, 1, 32)),
  };
}

// a note's filter: brighter for higher notes, and (by "Position opens filter") brighter to the right of the wall
export const cutoffFor = (hz, u, amount) => clamp(hz * 3 + 500, 600, 7000) * 2 ** (amount * (clamp(u, 0, 1) * 2 - 1) * 1.3);

/* ------------------------------------------------------------------ small helpers over the context */

// every node/source a part creates is remembered in `reg`, so the part can be stopped and disconnected as a whole
function kit(ctx, reg) {
  const keep = (n) => { reg.nodes.push(n); return n; };
  return {
    gain: (v = 1) => { const n = keep(ctx.createGain()); n.gain.value = v; return n; },
    osc: (type, f, detune = 0) => { const o = keep(ctx.createOscillator()); o.type = type; o.frequency.value = f; o.detune.value = detune; reg.srcs.push(o); return o; },
    filter: (type, f, q = 0.7) => { const n = keep(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n; },
    noise: (buffer) => { const n = keep(ctx.createBufferSource()); n.buffer = buffer; n.loop = true; reg.srcs.push(n); return n; },
    constant: (v) => { const n = keep(ctx.createConstantSource()); n.offset.value = v; reg.srcs.push(n); return n; },
    // a mono node (whatever is connected to it is summed to one channel)
    mono: () => { const n = keep(ctx.createGain()); n.channelCount = 1; n.channelCountMode = 'explicit'; n.channelInterpretation = 'speakers'; return n; },
  };
}
const newReg = () => ({ nodes: [], srcs: [] });
const wipe = (reg) => { for (const n of reg.nodes) { try { n.disconnect(); } catch { /* already disconnected */ } } reg.nodes.length = 0; reg.srcs.length = 0; };
// stop a source at `when`, never later than it is already stopped at
function stopAt(s, when) {
  if (s.__stop !== undefined && s.__stop <= when) return;
  try { s.stop(when); s.__stop = when; } catch { /* never started, or already stopped */ }
}

/* ------------------------------------------------------------------ the piece */

export default async function start(host) {
  const { audio, vt } = host;
  const ctx = audio.ctx;
  let P = settings(host.params);
  const wallIds = new Set(audio.walls.map((w) => w.id));
  const book = new VoiceBook({ maxPerWall: P.maxPerWall, maxTotal: P.maxNotes });
  let ladder = scaleLadder(P.key, P.scale, P.lowOctave, P.octaves);
  let stopped = false;

  const G = newReg(), k = kit(ctx, G); // parts that live as long as the piece
  const t0 = ctx.currentTime;
  const ramp = (param, v, tau = 0.08) => { try { param.setTargetAtTime(v, ctx.currentTime, tau); } catch { /* closed context */ } };

  // sound material, generated (nothing is loaded)
  const noiseBuf = noiseBuffer(ctx, 2, 5);
  const irPad = impulseBuffer(ctx, { seconds: 5, seed: 11 });
  const irWall = impulseBuffer(ctx, { seconds: 4, seed: 23 });

  // notes volume: one constant source that every note's volume gain listens to, so the slider moves held notes too
  const notesVolSrc = k.constant(P.notesVol);
  notesVolSrc.start(t0);

  /* ---- the pad ---- */
  const padFilter = k.filter('lowpass', 1100, 0.5);
  const padHP = k.filter('highpass', 120, 0.6); // the low end goes through the sub instead
  const padOut = k.gain(0);
  const padSend = k.gain(P.reverb * WET);
  const padConv = ctx.createConvolver(); G.nodes.push(padConv); padConv.buffer = irPad;
  const padWet = k.mono();
  const padBass = k.gain(0);
  padFilter.connect(padHP); padHP.connect(padOut);
  padOut.connect(audio.roomInput());
  padOut.connect(padSend); padSend.connect(padConv); padConv.connect(padWet); padWet.connect(audio.roomInput());
  padBass.connect(audio.subInput());
  // slow movement: the pad's cutoff drifts, and its saws detune against each other
  const lfoCut = k.osc('sine', 0.037), lfoCutAmt = k.gain(450);
  lfoCut.connect(lfoCutAmt); lfoCutAmt.connect(padFilter.frequency);
  const lfoDet = k.osc('sine', 0.083), detUp = k.gain(7), detDown = k.gain(-7);
  lfoDet.connect(detUp); lfoDet.connect(detDown);
  lfoCut.start(t0); lfoDet.start(t0);
  padOut.gain.setValueAtTime(0, t0);
  padOut.gain.setTargetAtTime(P.padVol * PAD_PEAK, t0, 1.8); // the pad comes in over a few seconds
  padBass.gain.setValueAtTime(0, t0);
  padBass.gain.setTargetAtTime(P.padVol * BASS_PEAK, t0, 1.8);

  const layers = [];
  let padStep = 0, lastChange = t0, nextChange = t0 + P.padChange;

  function addLayer(fadeTau) {
    const t = ctx.currentTime;
    const reg = newReg(), kk = kit(ctx, reg);
    const ch = chordFor(P.key, P.scale, padStep);
    const sum = kk.gain(0), bass = kk.gain(0);
    sum.connect(padFilter); bass.connect(padBass);
    sum.gain.setValueAtTime(0, t); sum.gain.setTargetAtTime(1, t, fadeTau);
    bass.gain.setValueAtTime(0, t); bass.gain.setTargetAtTime(1, t, fadeTau);
    ch.notes.forEach((m, i) => {
      const f = midiToHz(m), spread = 4 + i * 1.3;
      const saw = kk.osc('sawtooth', f, spread), tri = kk.osc('triangle', f, -spread);
      const gs = kk.gain(0.02), gt = kk.gain(0.035);
      saw.connect(gs); gs.connect(sum); tri.connect(gt); gt.connect(sum);
      (i % 2 ? detUp : detDown).connect(saw.detune); (i % 2 ? detDown : detUp).connect(tri.detune);
      saw.start(t); tri.start(t);
    });
    const b = kk.osc('sine', midiToHz(ch.bass)), gb = kk.gain(1);
    b.connect(gb); gb.connect(bass); b.start(t);
    const layer = { reg, sum, bass, endsAt: Infinity, chord: ch };
    layers.push(layer);
    return layer;
  }
  function retireLayer(layer, tau) {
    const t = ctx.currentTime;
    ramp(layer.sum.gain, 0, tau); ramp(layer.bass.gain, 0, tau);
    layer.endsAt = t + tau * 9;
    for (const s of layer.reg.srcs) stopAt(s, layer.endsAt);
  }
  function disposeLayer(layer) {
    for (const s of layer.reg.srcs) { for (const d of [detUp, detDown]) { try { d.disconnect(s.detune); } catch { /* not connected */ } } }
    wipe(layer.reg);
    layers.splice(layers.indexOf(layer), 1);
  }
  const crossfade = () => clamp(P.padChange / 8, 2, 6); // seconds to the new chord
  function changeChord() {
    if (stopped) return;
    const tau = crossfade() / 4;
    for (const l of layers) if (l.endsAt === Infinity) retireLayer(l, tau);
    padStep++;
    addLayer(tau);
    lastChange = ctx.currentTime;
    nextChange = lastChange + P.padChange;
  }
  addLayer(1.2);

  /* ---- the notes ---- */

  // per wall, once it is first used: the reverb of its notes, heard on that wall only
  const walls = new Map();
  function wallFx(wallId) {
    let w = walls.get(wallId);
    if (w) return w;
    const reg = newReg(), kk = kit(ctx, reg);
    const wi = audio.wallInput(wallId, 0.5);
    const wetIn = kk.gain(P.reverb * WET);
    const conv = ctx.createConvolver(); reg.nodes.push(conv); conv.buffer = irWall;
    const mono = kk.mono();
    wetIn.connect(conv); conv.connect(mono); mono.connect(wi.node);
    w = { reg, wi, wetIn };
    walls.set(wallId, w);
    return w;
  }

  const live = new Set(); // notes whose nodes still exist (sounding, or fading out)

  function buildVoice(stroke, wallId, midi, u, id) {
    const t = ctx.currentTime;
    const reg = newReg(), kk = kit(ctx, reg);
    const f = midiToHz(midi);
    const attack = P.attack, swell = P.swell;
    const settle = t + attack + STRIKE_SETTLE; // the strike has rung down by now; the held note grows from here
    const fx = wallFx(wallId);
    const wi = audio.wallInput(wallId, clamp(u, 0, 1));

    const mix = kk.gain(1);
    // the body: two sines a hair apart and unequal (a slow, shallow beat), plus their octave
    const a = kk.osc('sine', f, -1.2), b = kk.osc('sine', f, 1.2), o2 = kk.osc('sine', f * 2, 3);
    const ga = kk.gain(0.78), gb = kk.gain(0.22), g2 = kk.gain(0.16);
    a.connect(ga); ga.connect(mix); b.connect(gb); gb.connect(mix); o2.connect(g2); g2.connect(mix);
    // the bell: a faint FM pair (inharmonic) STRUCK as the hand lands (bright, quick), then a soft ring that brightens slowly
    // while the hand stays
    const car = kk.osc('sine', f * 2), mod = kk.osc('sine', f * 2 * 1.414), modDepth = kk.gain(0), ping = kk.gain(0);
    mod.connect(modDepth); modDepth.connect(car.frequency); car.connect(ping); ping.connect(mix);
    const idx = f * 2 * 1.414; // Hz of frequency deviation per unit of modulation index
    modDepth.gain.setValueAtTime(idx * 1.2, t);
    modDepth.gain.setTargetAtTime(idx * 0.3, t + attack, 0.18);
    modDepth.gain.setTargetAtTime(idx * 1.0, settle + swell * 0.5, swell);   // bounded brightening
    ping.gain.setValueAtTime(0, t);
    ping.gain.linearRampToValueAtTime(0.5, t + attack);
    ping.gain.setTargetAtTime(0.08, t + attack, 0.35);
    // the contact: a short tap of filtered noise, gone in a few tens of ms
    const nz = kk.noise(noiseBuf), nbp = kk.filter('bandpass', Math.min(f * 6, 9000), 1.5), ng = kk.gain(0);
    nz.connect(nbp); nbp.connect(ng); ng.connect(mix);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.09, t + attack);
    ng.gain.setTargetAtTime(0, t + attack, 0.04);
    nz.start(t, (id * 0.37) % 1.5);
    stopAt(nz, t + attack + 1);

    // the note's filter: bright at the strike, darker as it rings down, then it opens slowly while the hand stays (bounded);
    // the position along the wall opens it too
    const base = clamp(f * 3 + 500, 600, 7000);
    const flt = kk.filter('lowpass', cutoffFor(f, u, P.posFilter), 0.5);
    flt.detune.setValueAtTime(200, t);
    flt.detune.setTargetAtTime(-400, t + attack, 0.25);
    flt.detune.setTargetAtTime(350, settle, swell * 0.8);
    // the envelope: the STRIKE (up in `attack`, a few ms: the touch is felt at once), it rings down to a soft level, then the
    // held note swells toward its peak over "Swell"
    const sw = kk.gain(0);
    sw.gain.setValueAtTime(0, t);
    sw.gain.linearRampToValueAtTime(NOTE_PEAK * 0.8, t + attack);
    sw.gain.setTargetAtTime(NOTE_PEAK * 0.45, t + attack, 0.25);
    sw.gain.setTargetAtTime(NOTE_PEAK, settle, swell / 3);
    // the release gain stays at 1 while the hand is on the note; lifting fades it
    const rel = kk.gain(1);
    // volume (listens to "Notes volume") → the wall, and into that wall's reverb
    const vol = kk.gain(0);
    notesVolSrc.connect(vol.gain);
    mix.connect(flt); flt.connect(sw); sw.connect(rel); rel.connect(vol);
    vol.connect(wi.node); vol.connect(fx.wetIn);

    for (const s of [a, b, o2, car, mod]) s.start(t);
    const v = { id, stroke, wallId, midi, u, base, wi, flt, rel, reg, endsAt: Infinity, disposed: false, volGain: vol.gain };
    a.onended = () => disposeVoice(v);
    live.add(v);
    return v;
  }

  function disposeVoice(v) {
    if (v.disposed) return;
    v.disposed = true;
    try { notesVolSrc.disconnect(v.volGain); } catch { /* gone */ }
    try { v.wi.disconnect(); } catch { /* gone */ }
    wipe(v.reg);
    live.delete(v);
  }

  // the note fades out: tail of `seconds` (−60 dB at the end), then its sources stop
  function releaseVoice(v, seconds) {
    const t = ctx.currentTime;
    try { v.rel.gain.setTargetAtTime(0, t, seconds / 6.9); } catch { /* closed context */ }
    const end = t + seconds * 1.25 + 0.05;
    v.endsAt = Math.min(v.endsAt, end);
    for (const s of v.reg.srcs) stopAt(s, v.endsAt);
  }

  function down(e) {
    if (stopped || !wallIds.has(e.wallId)) return;
    const t = ctx.currentTime;
    const r = book.add({ stroke: e.stroke, wallId: e.wallId, t });
    if (r.duplicate) return; // this hand already has its note
    for (const y of r.evict) releaseNote(y, FAST_RELEASE);
    const midi = noteForHeight(e.v, ladder);
    const v = buildVoice(e.stroke, e.wallId, midi, Number.isFinite(e.u) ? e.u : 0.5, r.voice.id);
    r.voice.audio = v;
    v.book = r.voice;
  }
  function releaseNote(bookVoice, seconds) {
    if (bookVoice.audio) releaseVoice(bookVoice.audio, seconds);
  }
  function move(e) {
    const bv = book.get(e.stroke);
    if (!bv || !bv.audio || !Number.isFinite(e.u)) return;
    const v = bv.audio, u = clamp(e.u, 0, 1);
    if (Math.abs(u - v.u) < 0.004) return;
    v.u = u;
    v.wi.setPosition(u);
    ramp(v.flt.frequency, cutoffFor(v.midi ? midiToHz(v.midi) : 440, u, P.posFilter), 0.12);
  }
  function up(e) {
    const bv = book.release(e.stroke);
    if (bv) releaseNote(bv, P.release);
  }
  const onTouch = (e) => {
    if (!e || stopped) return;
    try {
      if (e.type === 'down') down(e);
      else if (e.type === 'move') move(e);
      else if (e.type === 'up') up(e);
    } catch (err) { console.error('ambient-notes:', err); }
    tick();
  };

  function tick() {
    if (stopped) return;
    const now = ctx.currentTime;
    for (const bv of book.list()) {
      if (bv.state === 'tail' && bv.audio && now >= bv.audio.endsAt) book.finish(bv);
      else if (bv.state === 'held' && now - bv.t0 > MAX_HOLD) { book.release(bv.stroke); releaseNote(bv, P.release); }
    }
    for (const v of [...live]) if (now >= v.endsAt + 0.05) disposeVoice(v);
    for (const l of [...layers]) if (now >= l.endsAt + 0.05) disposeLayer(l);
    if (now >= nextChange) changeChord();
  }

  const offTouch = vt.on('touch', onTouch);
  const timer = setInterval(tick, TICK_MS);
  // hands already down when the piece starts play their note too
  try { for (const h of vt.hands() || []) down({ type: 'down', ...h }); } catch { /* no hands() */ }

  return {
    setParams(p) {
      if (stopped) return;
      const prev = P;
      P = settings({ ...host.params, ...p });
      book.setLimits({ maxPerWall: P.maxPerWall, maxTotal: P.maxNotes });
      for (const y of book.enforce()) releaseNote(y, FAST_RELEASE);
      ladder = scaleLadder(P.key, P.scale, P.lowOctave, P.octaves);
      ramp(notesVolSrc.offset, P.notesVol, 0.05);
      ramp(padOut.gain, P.padVol * PAD_PEAK, 0.1);
      ramp(padBass.gain, P.padVol * BASS_PEAK, 0.1);
      ramp(padSend.gain, P.reverb * WET, 0.1);
      for (const w of walls.values()) ramp(w.wetIn.gain, P.reverb * WET, 0.1);
      nextChange = lastChange + P.padChange;
      if (prev.key !== P.key || prev.scale !== P.scale) changeChord(); // the pad follows the new key at once
    },

    async stop(fadeMs = 800) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try { offTouch && offTouch(); } catch { /* nothing to remove */ }
      const fade = Math.max(0.05, (Number(fadeMs) || 0) / 1000), tau = fade / 5, t = ctx.currentTime;
      const end = t + fade * 1.3 + 0.05;
      for (const v of live) { ramp(v.rel.gain, 0, tau); for (const s of v.reg.srcs) stopAt(s, end); }
      for (const l of layers) { ramp(l.sum.gain, 0, tau); ramp(l.bass.gain, 0, tau); for (const s of l.reg.srcs) stopAt(s, end); }
      for (const g of [padOut.gain, padBass.gain, padSend.gain, ...[...walls.values()].map((w) => w.wetIn.gain)]) ramp(g, 0, tau);
      for (const s of G.srcs) stopAt(s, end);
      // let the fade play out, then take everything apart
      await new Promise((resolve) => setTimeout(resolve, fade * 1300 + 60));
      for (const v of [...live]) disposeVoice(v);
      for (const l of [...layers]) disposeLayer(l);
      for (const w of walls.values()) { try { w.wi.disconnect(); } catch { /* gone */ } wipe(w.reg); }
      walls.clear();
      wipe(G);
    },

    // for the tests: what the piece holds right now, and a way to move the pad on without waiting
    _debug: {
      counts: () => ({ total: book.count(), held: book.held().length, perWall: Object.fromEntries([...wallIds].map((id) => [id, book.count(id)])), live: live.size, layers: layers.length }),
      strokes: () => book.list().map((v) => v.stroke),
      midiOf: (stroke) => { const v = book.get(stroke); return v && v.audio ? v.audio.midi : null; },
      nextChord: changeChord,
      chord: () => layers.filter((l) => l.endsAt === Infinity).map((l) => l.chord)[0] || null,
      tick,
    },
  };
}
