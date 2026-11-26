// Ressonància — brasa v2 · the fire's SOUND (26-11, Beltrán): own Web Audio synthesis, no samples. Fed every frame by the level's
// `part.sound()` view (brasa2.js); it speaks through the work's audio host (experiences/SOUND-API.md: wallInput / roomInput / subInput),
// so the director mounts it inside the work's sound piece; the brasa v2 study mounts it on a stereo stand-in.
//
//   · every correfoc BORN: a low «fum» (a thump, in the sub too), a whoosh of air catching, a crack, then a short string of petards
//   · the running correfocs: PETARDS (firecracker strings, the correfoc's own sound) at random, and the hiss of their carretilles —
//     both per wall, so a full room sounds fuller: more devils, more strings, more hiss
//   · each FIRE: a low roar and crackles, both growing with its level; a FEED (a correfoc passing) answers with a «whoomph» and a
//     burst of crackles
//   · a hand that DRAGS fire: a sizzle and crackles under it that follow it along the wall, as loud as it slides
//   · the BOOM: a deep blow and a burst; the STORM: a sea of crackles and air rising with it
// Levels: a single event peaks ≈ −20 dBFS, the beds stay low; every change ramps (no clicks); voices are capped (the oldest gives way).
// THE KEY (26-11, Beltrán: «lo que tiene altura, en el key de la base»): the noise and the crackles have no pitch and stay as they were;
// the pitched blows — the birth's «fum», the feed's whoomph, the boom, the petards' body, the roar's resonance — land on the tonic or
// the fifth of the correfoc's music (D: opt.tonic, default D1 = 36.71 Hz; the trailer's tm-brasa and the work's m-brasa are both on D).
//
//   const S = createBrasaSound(audio, { gain })        audio = the host's { ctx, walls, wallInput, roomInput, subInput }
//   S.update(dt, part.sound())    S.setGain(g)    S.stop(fadeMs) → Promise

export function createBrasaSound(audio, opt = {}) {
  const { ctx } = audio;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(audio.roomInput());
  const master = ctx.createGain(); master.gain.value = 1;
  let gainK = opt.gain ?? 1;
  out.gain.setTargetAtTime(gainK, ctx.currentTime, 0.4);
  const sub = audio.subInput ? audio.subInput() : null;
  const D1 = opt.tonic ?? 36.708, A1 = D1 * 1.5;               // the key's tonic and fifth (Hz; ×2 per octave up)
  // one input per wall (the centre of the wall; one-shots get their own positioned input)
  const wallIds = audio.walls.map((w) => w.id);
  const bus = new Map();
  for (const id of wallIds) { const io = audio.wallInput(id, 0.5); const g = ctx.createGain(); g.gain.value = 0; g.connect(io.node); g.gain.setTargetAtTime(gainK, ctx.currentTime, 0.4); bus.set(id, { io, g }); }

  // ---- noise (2 s, white), shared
  const NB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const noiseSrc = (loop = false) => { const s = ctx.createBufferSource(); s.buffer = NB; s.loop = loop; return s; };
  const now = () => ctx.currentTime;

  // ---- one-shot voices: a positioned input on a wall (released when the sound is over), capped
  const live = [];
  const MAXV = 40;
  function voiceAt(wall, u, dur) {
    while (live.length >= MAXV) { const v = live.shift(); try { v.g.gain.setTargetAtTime(0, now(), 0.01); setTimeout(() => v.io.disconnect(), 80); } catch { /* gone */ } }
    const io = audio.wallInput(wall, Math.min(1, Math.max(0, u)));
    const g = ctx.createGain(); g.gain.value = gainK; g.connect(io.node);
    const v = { io, g }; live.push(v);
    setTimeout(() => { const k = live.indexOf(v); if (k >= 0) live.splice(k, 1); try { g.disconnect(); io.disconnect(); } catch { /* gone */ } }, (dur + 0.3) * 1000);
    return g;
  }
  // a short noise burst through a filter, with an exponential-ish decay (a crack, a pop, a tick)
  function burst(dest, t, { hp = 0, bp = 0, q = 1, lp = 0, peak = 0.2, dec = 0.03, att = 0.001 }) {
    const s = noiseSrc(), g = ctx.createGain();
    let node = s;
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; node.connect(f); node = f; }
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(0, t + att, dec / 3);
    s.start(t, Math.random() * 1.5); s.stop(t + att + dec * 3 + 0.02);
  }
  function thump(dest, t, f0, f1, peak, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.setTargetAtTime(0, t + 0.01, dur / 4);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function whoosh(dest, t, f0, f1, peak, dur) {
    const s = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.3); g.gain.setTargetAtTime(0, t + dur * 0.35, dur / 4);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.2);
  }
  // a firecracker: a sharp pop (bright noise) with a little body
  function petard(dest, t, k = 1) {
    burst(dest, t, { hp: 1100, bp: 2600 + Math.random() * 1800, q: 0.9, peak: 0.32 * k, dec: 0.018 + Math.random() * 0.02 });
    thump(dest, t, A1 * 4, A1 * 2, 0.07 * k, 0.06);          // A3 → A2 (was 220 → 90 Hz)
  }
  function petardString(wall, u, t0, n, k = 1) {
    const dest = voiceAt(wall, u, n * 0.12 + 0.3);
    let t = t0;
    for (let i = 0; i < n; i++) { petard(dest, t, k * (0.75 + 0.35 * Math.random())); t += 0.045 + Math.random() * 0.08; }
  }

  // ---- beds: per wall the carretilles' hiss and the fire's roar (continuous, gains follow the level)
  const beds = new Map();
  for (const id of wallIds) {
    const b = bus.get(id).g;
    const hissS = noiseSrc(true), hissF = ctx.createBiquadFilter(), hissG = ctx.createGain();
    hissF.type = 'bandpass'; hissF.frequency.value = 5200; hissF.Q.value = 0.7; hissG.gain.value = 0;
    hissS.connect(hissF); hissF.connect(hissG); hissG.connect(b); hissS.start(now(), Math.random());
    const roarS = noiseSrc(true), roarF = ctx.createBiquadFilter(), roarF2 = ctx.createBiquadFilter(), roarG = ctx.createGain();
    roarF.type = 'lowpass'; roarF.frequency.value = 420; roarF2.type = 'peaking'; roarF2.frequency.value = D1 * 4; roarF2.gain.value = 6; roarG.gain.value = 0;   // its resonance on D3 (was 160 Hz)
    roarS.connect(roarF); roarF.connect(roarF2); roarF2.connect(roarG); roarG.connect(b); roarS.start(now(), Math.random());
    beds.set(id, { hissG, roarG, roarF, tickAcc: 0, petAcc: 0, nDev: 0 });
  }
  // the storm's air (room-wide)
  const airS = noiseSrc(true), airF = ctx.createBiquadFilter(), airG = ctx.createGain();
  airF.type = 'bandpass'; airF.frequency.value = 2600; airF.Q.value = 0.5; airG.gain.value = 0;
  airS.connect(airF); airF.connect(airG); airG.connect(out); airS.start();
  // hands that drag fire: a sizzle that follows each one
  const handV = new Map();
  function handVoice(id, wall, u) {
    const io = audio.wallInput(wall, u), g = ctx.createGain(), s = noiseSrc(true), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 1.4; f2.type = 'highpass'; f2.frequency.value = 1800;
    g.gain.value = 0; s.connect(f); f.connect(f2); f2.connect(g); g.connect(io.node); s.start(now(), Math.random());
    return { io, g, s, f, wall, acc: 0, seen: 0 };
  }

  let t0 = 0;
  function update(dt, snap) {
    if (!snap) return;
    const t = now() + 0.02;
    t0 += dt;
    // births: the «fum», the whoosh, the crack, a short string of petards
    for (const b of snap.births) {
      const dest = voiceAt(b.wall, b.u, 1.6);
      thump(dest, t, A1 * 2, D1, 0.32, 0.55);                 // A2 → D1 (was 95 → 38 Hz)
      if (sub) thump(sub, t, D1 * 2, D1, 0.25, 0.6);          // D2 → D1 (was 70 → 34)
      whoosh(dest, t, 280, 2400, 0.14, 0.7);
      burst(dest, t + 0.06, { hp: 2400, peak: 0.24, dec: 0.035 });
      petardString(b.wall, b.u, t + 0.35 + Math.random() * 0.2, 3 + Math.floor(Math.random() * 4), 0.8);
    }
    // per wall: how many devils run there, how much fire
    for (const bd of beds.values()) bd.nDev = 0;
    for (const d of snap.devils) { const bd = beds.get(d.wall); if (bd) bd.nDev += d.held ? 0.4 : 1; }
    const fire = new Map(snap.fires.map((f) => [f.wall, f]));
    for (const [id, bd] of beds) {
      const f = fire.get(id), lv = f ? f.level : 0, fl = f ? f.flash : 0;
      const crowd = Math.min(1, bd.nDev / 4);
      bd.hissG.gain.setTargetAtTime(0.018 * Math.sqrt(bd.nDev), t, 0.25);
      bd.roarG.gain.setTargetAtTime(0.012 + 0.09 * Math.pow(lv, 1.3) + 0.06 * fl, t, 0.4);
      bd.roarF.frequency.setTargetAtTime(300 + 500 * lv + 600 * fl, t, 0.3);
      // crackles: the fire's own, more with its level and on a feed
      bd.tickAcc += dt * (1 + 14 * lv + 40 * fl + 10 * snap.storm);
      while (bd.tickAcc >= 1) {
        bd.tickAcc -= 1;
        burst(bus.get(id).g, t + Math.random() * dt, { bp: 1400 + Math.random() * 3600, q: 1.2, peak: 0.04 + 0.12 * Math.random() * (0.4 + lv), dec: 0.006 + Math.random() * 0.012 });
      }
      // petards: strings now and then from the devils running here (a full room: many)
      bd.petAcc += dt * (0.25 + 0.2 * crowd) * bd.nDev;
      if (bd.petAcc >= 1) { bd.petAcc -= 1; petardString(id, Math.random(), t + Math.random() * 0.1, 2 + Math.floor(Math.random() * 7), 0.9); }
    }
    // feeds: the fire answers with a whoomph
    for (const id of snap.feeds) {
      const dest = voiceAt(id, 0.5, 1.2);
      whoosh(dest, t, 180, 900, 0.2, 0.6);
      thump(dest, t, D1 * 4, D1 * 2, 0.12, 0.35);             // D3 → D2 (was 120 → 60)
    }
    // hands dragging fire
    for (const v of handV.values()) v.seen = 0;
    for (const h of snap.hands) {
      let v = handV.get(h.id);
      if (!v) { if (handV.size >= 8) continue; v = handVoice(h.id, h.wall, h.u); handV.set(h.id, v); }
      if (v.wall !== h.wall) { v.g.gain.setTargetAtTime(0, t, 0.05); const old = v; setTimeout(() => { try { old.s.stop(); old.io.disconnect(); } catch { /* gone */ } }, 300); v = handVoice(h.id, h.wall, h.u); handV.set(h.id, v); }
      v.seen = 1;
      v.io.setPosition?.(h.u);
      v.g.gain.setTargetAtTime((0.004 + 0.09 * h.slide) * gainK, t, 0.06);
      v.f.frequency.setTargetAtTime(3000 + 3500 * h.slide, t, 0.1);
      v.acc += dt * (2 + 30 * h.slide);
      while (v.acc >= 1) { v.acc -= 1; burst(v.g, t + Math.random() * dt, { bp: 2000 + Math.random() * 4000, q: 1.5, peak: 0.25 + 0.5 * Math.random(), dec: 0.008 }); }
    }
    for (const [id, v] of handV) if (!v.seen) {
      v.g.gain.setTargetAtTime(0, t, 0.12); handV.delete(id);
      setTimeout(() => { try { v.s.stop(); v.io.disconnect(); } catch { /* gone */ } }, 700);
    }
    // the boom, the storm
    if (snap.boom) {
      thump(out, t, D1 * 2, D1, 0.2, 1.6); if (sub) thump(sub, t, A1, A1 / 2, 0.2, 1.8);   // D2 → D1 and A1 → A0 (were 70 → 28, 55 → 25)
      whoosh(out, t, 2200, 160, 0.12, 2.2);
      // (the walls' strings staggered, not all at once: a rolling salvo round the room, ≈ −10 dBFS at its peak)
      wallIds.forEach((id, k) => petardString(id, Math.random(), t + 0.35 + k * 0.28 + Math.random() * 0.15, 5 + Math.floor(Math.random() * 6), 0.42));
    }
    airG.gain.setTargetAtTime(0.16 * snap.storm * snap.storm, t, 0.5);
  }
  return {
    update,
    setGain(g) { gainK = g; out.gain.setTargetAtTime(g, now(), 0.3); for (const b of bus.values()) b.g.gain.setTargetAtTime(g, now(), 0.3); },
    async stop(fadeMs = 800) {
      out.gain.setTargetAtTime(0, now(), fadeMs / 3000); gainK = 0;
      for (const b of bus.values()) b.g.gain.setTargetAtTime(0, now(), fadeMs / 3000);
      await new Promise((r) => setTimeout(r, fadeMs + 50));
      for (const v of handV.values()) { try { v.s.stop(); v.io.disconnect(); } catch { /* gone */ } }
      for (const b of bus.values()) { try { b.io.disconnect(); } catch { /* gone */ } }
      try { airS.stop(); out.disconnect(); } catch { /* gone */ }
    },
  };
}
