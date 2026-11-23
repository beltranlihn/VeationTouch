// Lab template — Soft bells. A runtime-ready SOUND piece (contract: experiences/SOUND-API.md) in ~130 lines.
//
// What it shows (copy and change):
//   - export default async function start({ audio, vt, params }) -> { setParams, stop }
//   - audio.wallInput(wallId, u) for a sound that belongs to ONE wall; audio.roomInput() for what every wall plays; audio.subInput() for the low end.
//   - the HEIGHT of a hand in METRES (v x the wall's height), never as a share of the wall: a hand reaches ~2 m whatever the wall.
//   - notes keyed by STROKE (never by tracker id), a quick strike on `down`, a swell while the hand stays, a long tail on `up`.
//   - only Web Audio synthesis, nothing loaded; never connect to ctx.destination (the host owns the master and the limiter).
//   - headroom: one note peaks around -22 dBFS; the host's limiter does the rest.
const SCALE = [0, 3, 5, 7, 10];         // minor pentatonic, in semitones
const ROOT = 50;                        // D3 (MIDI)
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export default async function start(host) {
  const { audio, vt } = host;
  const ctx = audio.ctx;
  const P = { ...host.params };

  // a generated reverb: stereo noise with an exponential tail, softened over time. No file.
  const ir = (() => {
    const len = Math.floor(ctx.sampleRate * 4.5), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let y = 0; for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate, cut = Math.max(0.02, 0.35 * Math.exp(-t * 0.9)); y += cut * (Math.random() * 2 - 1 - y); d[i] = y * Math.pow(10, -3 * t / 4.5) * Math.min(1, t * 40); } }
    return buf;
  })();
  const room = audio.roomInput();                                       // heard on every wall
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(room);

  // a very quiet pad on every wall, its root on the sub
  const pad = ctx.createGain(); pad.gain.value = 0; pad.connect(room);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.connect(pad);
  const oscs = [0, 7, 12].map((semi, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = midiHz(ROOT - 12 + semi); o.detune.value = (i - 1) * 4; const g = ctx.createGain(); g.gain.value = 0.35 / (i + 1); o.connect(g); g.connect(lp); o.start(); return o; });
  const bass = ctx.createOscillator(); bass.frequency.value = midiHz(ROOT - 24); const bg = ctx.createGain(); bg.gain.value = 0.05; bass.connect(bg); bg.connect(audio.subInput()); bass.start();
  pad.gain.setTargetAtTime(0.04 * (P.pad ?? 1), ctx.currentTime, 2);

  const voices = new Map(); // stroke -> voice
  const pitchOf = (wall, v) => {                                          // height in METRES -> a note of the scale, floor 0.3 m .. reach 2.0 m
    const h = v * (wall?.height || 3.5), k = Math.min(1, Math.max(0, (h - 0.3) / 1.7));
    const steps = Math.round(k * (SCALE.length * 2 - 1)), oct = Math.floor(steps / SCALE.length);
    return ROOT + oct * 12 + SCALE[steps % SCALE.length];
  };
  function strike(e) {
    const wall = vt.walls.find((w) => w.id === e.wallId), t = ctx.currentTime, hz = midiHz(pitchOf(wall, e.v));
    const input = audio.wallInput(e.wallId, e.u);
    const env = ctx.createGain(); env.gain.value = 0; env.connect(input.node);
    const send = ctx.createGain(); send.gain.value = 0.55; env.connect(send); send.connect(verb);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1200 + 3000 * e.v; tone.connect(env);
    const parts = [[1, 'sine', 1], [2, 'sine', 0.35], [3.01, 'sine', 0.12]].map(([m, type, a]) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz * m; const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(tone); o.start(t); return o; });
    const peak = 0.045 * (P.volume ?? 0.85);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(peak, t + 0.006); env.gain.setTargetAtTime(peak * 0.45, t + 0.006, 0.35); // struck, then it rings down
    return { env, parts, input, peak, t0: t, stopped: false };
  }
  function release(v, tail) {
    if (v.stopped) return; v.stopped = true; const t = ctx.currentTime;
    v.env.gain.cancelScheduledValues(t); v.env.gain.setValueAtTime(v.env.gain.value, t); v.env.gain.setTargetAtTime(0, t, tail / 4);
    setTimeout(() => { for (const o of v.parts) { try { o.stop(); } catch { /* done */ } } v.input.disconnect(); }, (tail + 0.5) * 1000);
  }
  const off = vt.on('touch', (e) => {
    if (e.type === 'down' && !voices.has(e.stroke)) {
      if (voices.size >= 10) { const [k, old] = voices.entries().next().value; release(old, 0.5); voices.delete(k); } // the oldest yields
      voices.set(e.stroke, strike(e));
    } else if (e.type === 'move') voices.get(e.stroke)?.input.setPosition(e.u);
    else if (e.type === 'up') { const v = voices.get(e.stroke); if (v) { release(v, P.tail ?? 5); voices.delete(e.stroke); } }
  });
  // a hand held for a while swells a little: bounded, slow
  const swell = setInterval(() => { const t = ctx.currentTime; for (const v of voices.values()) { if (v.stopped || t - v.t0 < 0.7) continue; v.env.gain.setTargetAtTime(v.peak * 0.8, t, 1.5); } }, 250);

  return {
    setParams(p) { Object.assign(P, p); pad.gain.setTargetAtTime(0.04 * (P.pad ?? 1), ctx.currentTime, 0.5); },
    async stop() { off(); clearInterval(swell); for (const v of voices.values()) release(v, 0.4); voices.clear(); pad.gain.setTargetAtTime(0, ctx.currentTime, 0.3); for (const o of [...oscs, bass]) { try { o.stop(ctx.currentTime + 1.5); } catch { /* done */ } } },
  };
}
