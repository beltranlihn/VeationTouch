// Ressonància — the sound piece (contract: experiences/SOUND-API.md). The whole 10-minute work, as GUION.md writes it.
//
// It runs the work's SCORE (score.js: an identical copy of ressonancia/score.js — a piece may only import from its own folder;
// keep the two files identical) and LEADS: sound hears a hand land at once, and the pulse must be the music's.
//
//   LOCAL WORKAROUND, clearly marked: the runtime has no channel between a visual piece and its sound piece. Every window of the
//   app loads from the same origin, so this piece posts the score's state on a BroadcastChannel ('ressonancia') after every
//   step — { type: 'state', ts, pace, s: { ...state, events }, acta } — and the visual follows it. It also accepts
//   { type: 'ctl', pace?, jump? } (rehearsal: run the score's clock faster, go to a block). Without the channel both pieces still
//   run: each one walks its own score from the same hands. Remove this when the runtime gives the two pieces a link.
//
// The sound (NOTES.md has the whole design): contemporary, cinematic, electronic-ambient. Every chapter is its own sound world,
// made of LAYERS that the piece crossfades with the score's state (progress, floors, resonance), never a linear tape:
//   - music made once with ElevenLabs, in ./audio (an exception to the lab's "no samples" rule, asked for by the author):
//     one-shot pieces (m-intro, m-crown, m-acta), loopable beds (m-brasa, m-pom, m-baixada) and STEMS of three pieces
//     (st-pinya-*, st-tronc-*, st-festa-*: bass / drums / other of one take, so they stay in time with each other; the tronc and
//     festa takes are 100 BPM, bars of 2.4 s = the score's pulse, and their loops are whole bars);
//   - effects made with ElevenLabs (s-*): ambience loops (embers, fire, breath, wind, rain of shards, the plaça's crowd), the raw
//     material of the hands (ember bursts, clay, ceramic, a timbal), transitions (impact, crack, bells, tabals) and ONE sustained
//     gralla note that is never played as a tune: it is granulated, stretched and tuned (G#4 → D/A) into textures that travel
//     round the four walls;
//   - synthesis for what must follow the public: the tronc's pulse, the tuned ceramic / glass / resonant hits of the hands, the
//     heartbeat, the rising thread of the pom, the creak of a leaning tower, risers, the crown's bloom.
// Routing: walls and room high-passed (4th order at 120 Hz) because the host sums them into the sub; the low end reaches the sub
// through explicit sends only. Stereo music is spread L → even walls, R → odd walls (the room is never four copies of one
// signal). Never connects to ctx.destination: the host owns the master, the limiter, the sub crossover and the fades.
// The score runs on the wall clock (performance.now()): it goes on even if the audio context is suspended; no sound is
// scheduled while the context is not running (so nothing piles up to burst out when it resumes); a wanted bed starts late,
// where it would be, once the context runs or its file arrives.
import { createScore } from './score.js';

// ---------------------------------------------------------------------------------------------------------------- the voice
// The intro's six lines, in seconds from the start of the 70 s intro, against the picture of ressonancia/scenes/intro.js
// (8–22 the horizon, 22–46 the tower of light, 53–63 the motto, 63–70 the title). RE-TIME THESE AGAINST THE PICTURE IN THE ROOM.
//    at     line          length  text (eleven_v4, Lily, see audio/voice-lines-v3.json)
const INTRO_VOICE = [
  [8.5, 'v-intro-1'],   //  6.3 s  "For more than two hundred years, in the squares of Catalonia, people have built towers."
  [17, 'v-intro-2'],    //  9.6 s  "No stone. No rope. Only bodies … They call them castells."
  [29, 'v-intro-3'],    //  9.8 s  "A castell is not built by the ones who climb. …"
  [41, 'v-intro-4'],    //  4.8 s  "Tonight, these walls are the square. And you are the pinya."  (whispered)
  [53.3, 'v-intro-5'],  //  5.4 s  "Strength. Balance. Courage. Good sense."  (the motto, one word per wall)
  [66.3, 'v-intro-6'],  //  2.0 s  "Put your hands on the wall."
];
// the same six cues for the Spanish voice (audio/es/, see audio/es/voice-lines-es.json): its own lengths, the same picture
//    Mía Evans (peninsular Spanish, eleven_v4): 6.4 · 9.5 · 9.1 · 5.4 · 5.1 · 2.2 s — they fit the same cues.
const INTRO_VOICE_ES = [[8.5, 'v-intro-1'], [17, 'v-intro-2'], [29, 'v-intro-3'], [41, 'v-intro-4'], [53.3, 'v-intro-5'], [66.3, 'v-intro-6']];
const ACTA_AT = { outcome: 4.5, final: 24.5 };   // acta.js: the castell appears at 4 s, the last sentence at 24 s
const TITLE_LINE = { brasa: 'v-brasa-1', pinya: 'v-pinya-1', tronc: 'v-tronc-1', pom: 'v-pom-1' };   // when a block's title phase starts
const HINT_LINE = { together: 'v-brasa-2', again: 'v-brasa-3', more: 'v-pinya-2', hold: 'v-pinya-2', beat: 'v-tronc-3', straight: 'v-tronc-2', still: 'v-pom-3' };
const OUTCOME_LINE = { descarregat: 'v-cierre-descarregat', carregat: 'v-cierre-carregat', intent: 'v-cierre-intent' };
const WAIT_EVERY = 40, WAIT_RECENT = 120, WAIT_AFTER = 6;   // v-wait: at most every 40 s, only if a hand was seen in the last 2 min (and gone 6 s)

// ---------------------------------------------------------------------------------------------------------------- the music
// A set = the layers of one chapter, started together (sample-locked). once: plays through; else it loops [a, b] with an
// equal-power crossfade of xf seconds centred on b (a grid set loops whole bars: its downbeat grid survives the loop).
// lift (dB): the takes are mostly sub; a lifted set is louder on the walls by `lift` while a low shelf keeps its sub where it was;
// trim (dB): a low shelf alone (the festa's kick)
const BAR = 2.4, GRID0 = 0.045;              // the 100 BPM takes: bar length, and where their first downbeat is (measured)
const GRID_A = GRID0 + BAR, GRID_B = GRID0 + 31 * BAR;
const SETS = {
  intro: { layers: { m: 'm-intro' }, once: true, lift: 6 },
  brasa: { layers: { bed: 'm-brasa' }, a: 9, b: 62, xf: 3, first: 0, lift: 4 },
  pinya: { layers: { bass: 'st-pinya-bass', other: 'st-pinya-other' }, a: 6, b: 74, xf: 3, first: 2, lift: 4 },
  tronc: { layers: { bass: 'st-tronc-bass', drums: 'st-tronc-drums', other: 'st-tronc-other' }, a: GRID_A, b: GRID_B, xf: 0.25, grid: true, trim: 3 },
  pom: { layers: { bed: 'm-pom' }, a: 5, b: 55, xf: 4, first: 0 },
  crown: { layers: { m: 'm-crown' }, once: true, lift: 2 },
  festa: { layers: { bass: 'st-festa-bass', drums: 'st-festa-drums', other: 'st-festa-other' }, a: GRID_A, b: GRID_B, xf: 0.25, grid: true, trim: 3 },
  baixada: { layers: { bed: 'm-baixada' }, a: 16, b: 46, xf: 3, first: 0, lift: 2 },
  acta: { layers: { m: 'm-acta' }, once: true },
};
const CROWN_IMPACT = 4.0;                    // m-crown: the reverse swell ends and the release hits at 4.0 s (measured)
const AMBIENCE = ['s-embers-loop', 's-fire-loop', 's-breath-loop', 's-wind-loop', 's-rain-loop', 's-crowd-loop'];
const SHOTS = ['s-bells', 's-tabals', 's-ember-burst', 's-clay', 's-ceramic', 's-impact', 's-crack', 's-gralla', 's-timbal', 'sfx-crown', 'sfx-fall', 'sfx-tile'];
const VOICES = ['v-wait', ...INTRO_VOICE.map((c) => c[1]), ...Object.values(TITLE_LINE), 'v-brasa-2', 'v-brasa-3', 'v-pinya-2', 'v-pinya-3', 'v-tronc-2', 'v-tronc-3',
  'v-pom-2', 'v-pom-3', 'v-aleta-1', 'v-aleta-2', 'v-baixada-1', ...Object.values(OUTCOME_LINE), 'v-cierre-final'];
const FILES = [...new Set([...Object.values(SETS).flatMap((s) => Object.values(s.layers)), ...AMBIENCE, ...SHOTS, ...VOICES])];
const VOICE_SET = new Set(VOICES);
const GROUP = (name) => (name.startsWith('st-') ? name.split('-').slice(0, 2).join('-') : name);   // stems share one normalisation
const GRALLA_HZ = 415;                       // s-gralla's pitch (G#4, measured): grains are tuned from it

// Levels in one place (files are normalised to peak 1 at load). Measured in the lab's simulated room: see NOTES.md.
const L = {
  voice: 0.34, duck: 0.42,
  music: 0.3,                                // every set's master, into the music bus
  embers: 0.07, fire: 0.12, breath: 0.1, wind: 0.13, rain: 0.08, crowd: 0.1,
  grains: 0.05, verb: 0.35,
  touchMax: 12,                              // simultaneous hand voices; the oldest yields
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const MINOR_PENTA = [0, 3, 5, 7, 10];        // D F G A C: the stone
const MAJOR_PENTA = [0, 2, 4, 7, 9];         // D E F# A B: the light (always consonant over the festa, D major)
const VOWELS = [[570, 840], [730, 1090], [440, 1020], [520, 920]];   // the pinya's murmur
const HANN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((Math.PI * i) / 63) ** 2);
const XIN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((Math.PI / 2) * (i / 63)));
const XOUT = Float32Array.from({ length: 64 }, (_, i) => Math.cos((Math.PI / 2) * (i / 63)));

export default async function start(host) {
  const { audio, vt } = host;
  const ctx = audio.ctx, P = { voice: 1, music: 1, drums: 1, effects: 1, touch: 1, lang: 'en', ...host.params };
  const walls = vt.walls || [], NW = Math.max(1, walls.length), wallIdx = new Map(walls.map((w, i) => [w.id, i]));
  const score = createScore(NW), S = score.state, T = score.times;
  const now = () => ctx.currentTime;
  const running = () => ctx.state === 'running';
  const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const F = (type, hz, q = 0.707) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; };
  const series = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
  const osc = (type, hz) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; return o; };
  const ramp = (param, v, tc, t = now()) => { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); };
  const hold = (param, t = now()) => { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); };
  const setNow = (param, v, t = now()) => { param.cancelScheduledValues(t); param.setValueAtTime(v, t); };

  // ---------------------------------------------------------------- outputs
  const HP = () => [F('highpass', 120, 0.54), F('highpass', 120, 1.31)];   // 4th-order Butterworth: the host sums the walls into the sub
  const outRoom = series(...HP(), audio.roomInput());
  const outSub = series(F('lowpass', 110), F('lowpass', 110), audio.subInput());
  const wallIn = walls.map((w) => audio.wallInput(w.id, 0.5));
  const wallOut = wallIn.map((wi) => series(...HP(), wi.node));
  const toWall = (w) => wallOut[((w % NW) + NW) % NW] || outRoom;
  // a stereo (or mono) signal spread over the room: L → even walls, R → odd walls, its low end to the sub
  function spread(subAmt = 0) {
    const inp = G(1), up = G(1); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; inp.connect(up);
    const sp = ctx.createChannelSplitter(2); up.connect(sp);
    const l = G(0.8), r = G(0.8); sp.connect(l, 0); sp.connect(r, 1);
    if (!walls.length) { l.connect(outRoom); r.connect(outRoom); } else for (let w = 0; w < NW; w++) (NW === 1 || w % 2 === 0 ? l : r).connect(toWall(w));
    if (subAmt) inp.connect(G(subAmt, outSub));
    return inp;
  }
  // a rotor: a mono input that turns round the walls (a cos² window per wall); its speed and width move in follow()
  const rotors = [];
  function rotor(speed = 0.05, phase = 0) {
    const inp = G(1), g = walls.map((_, w) => G(0, toWall(w)));
    for (const x of g) inp.connect(x);
    if (!walls.length) inp.connect(outRoom);
    const r = { inp, g, speed, phase, wall: () => Math.round(((r.phase % 1) + 1) % 1 * NW) % NW };
    rotors.push(r); return r;
  }
  const NOISE = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const verb = ctx.createConvolver();
  verb.buffer = (() => {   // a generated hall: noise with an exponential tail, darker as it dies (stereo, decorrelated)
    const len = Math.floor(ctx.sampleRate * 4.2), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let y = 0; for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate, cut = Math.max(0.025, 0.45 * Math.exp(-t * 1.0)); y += cut * (Math.random() * 2 - 1 - y); d[i] = y * Math.pow(10, (-3 * t) / 4.2) * Math.min(1, t * 40); } }
    return buf;
  })();
  const wet = G(L.verb, spread()); verb.connect(wet);
  const verbIn = G(1, verb);
  // buses (the manifest's volumes)
  const voiceBus = G(P.voice, outRoom);
  const musicBus = G(P.music), duck = G(1); musicBus.connect(duck); duck.connect(spread(0.22));   // the voice ducks all music
  const drumBus = G(P.drums, outRoom); drumBus.connect(G(0.25, verbIn));
  const fxBus = G(P.effects, spread(0.25));
  // per-wall echo for the festa's hits: a dotted eighth at 100 BPM (0.45 s), on the hand's own wall
  const echoIn = walls.map((_, w) => { const d = ctx.createDelay(1), fb = G(0.34), lp = F('lowpass', 2600), out = G(0.5, toWall(w)), inp = G(1); d.delayTime.value = 0.45; series(inp, d, lp, out); lp.connect(fb); fb.connect(d); return inp; });
  // the tronc's music gate: on the last floor THE MUSIC CUTS DRY
  const tocDrum = G(1, drumBus), tocSub = G(1, outSub);
  const touchSub = G(1, outSub);

  // ---------------------------------------------------------------- files, loaded in the background, normalised to peak 1
  const buffers = new Map(), peaks = new Map(), failed = new Set();
  const load = async (name) => {
    try {
      const file = P.lang === 'es' && VOICE_SET.has(name) ? `es/${name}` : name;          // the voice in the chosen language
      const r = await fetch(new URL(`./audio/${file}.mp3`, import.meta.url)); if (!r.ok) throw new Error(String(r.status));
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 2) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      peaks.set(name, pk); buffers.set(name, { buf, norm: 1 });
      const grp = GROUP(name), gp = Math.max(...[...peaks].filter(([n]) => GROUP(n) === grp).map(([, p]) => p));   // a stem set keeps its mix
      for (const [n, b] of buffers) if (GROUP(n) === grp) b.norm = gp > 0.005 ? Math.min(30, 1 / gp) : 1;
    } catch (e) { failed.add(name); console.warn(`ressonancia-sound: ${name} did not load (${e.message}); the piece goes on without it`); }
  };
  const loading = typeof fetch === 'function' ? Promise.all(FILES.map(load)) : Promise.resolve();
  const reversed = new Map();
  function rev(name) {   // a reversed copy (reverse swells), made once
    if (reversed.has(name)) return reversed.get(name);
    const b = buffers.get(name); if (!b) return null;
    const r = ctx.createBuffer(b.buf.numberOfChannels, b.buf.length, b.buf.sampleRate);
    for (let c = 0; c < r.numberOfChannels; c++) { const s = b.buf.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
    const x = { buf: r, norm: b.norm }; reversed.set(name, x); return x;
  }
  const live = new Set();
  function play(name, { gain = 0.3, dest = fxBus, at = now(), loop = false, offset = 0, rate = 1, reverse = false, fadeIn = 0 } = {}) {
    const b = reverse ? rev(name) : buffers.get(name); if (!b || !running()) return null;
    const src = ctx.createBufferSource(); src.buffer = b.buf; src.loop = loop; src.playbackRate.value = rate;
    const g = G(fadeIn ? 0 : gain * b.norm, dest); src.connect(g);
    if (fadeIn) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain * b.norm, at + fadeIn); }
    src.start(Math.max(at, now()), offset);
    const h = { src, g, name, end: at + (b.buf.duration - offset) / rate,
      stop(fade = 0.4) { const t = now(); hold(g.gain, t); g.gain.linearRampToValueAtTime(0, t + fade); try { src.stop(t + fade + 0.05); } catch { /* done */ } live.delete(h); } };
    live.add(h); src.onended = () => { live.delete(h); try { g.disconnect(); } catch { /* gone */ } };
    return h;
  }

  // the voice: one line at a time; a block's line cuts the one before, a hint waits its turn (it is dropped if someone speaks)
  let vo = null;
  function say(name, { delay = 0.4, polite = false } = {}) {
    if (!name) return false;
    const b = buffers.get(name); if (!b || !running()) return false;
    const t = now();
    if (vo && t < vo.end) { if (polite) return false; vo.h.stop(0.15); }
    const at = t + delay, h = play(name, { gain: L.voice, dest: voiceBus, at }); if (!h) return false;
    vo = { h, end: h.end, name };
    duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(L.duck, Math.max(t, at - 0.35), 0.15); duck.gain.setTargetAtTime(1, h.end + 0.3, 0.7);
    return true;
  }
  const hush = (fade = 0.5) => { if (vo) { vo.h.stop(fade); vo = null; } ramp(duck.gain, 1, 0.3); };

  // ---------------------------------------------------------------- the music sets (layers, loops, the bar grid)
  const sets = {};
  for (const [name, def] of Object.entries(SETS)) {
    const out = G(0), lp = F('lowpass', 20000, 0.6), shelf = F('lowshelf', 160); shelf.gain.value = -((def.lift || 0) + (def.trim || 0)); series(out, shelf, lp, musicBus);
    const lg = {}; for (const k of Object.keys(def.layers)) lg[k] = G(1, out);   // a layer sounds unless its world says otherwise
    sets[name] = { name, def, out, lp, lg, cycles: [], want: false, wantAt: 0, from: 0, nextB: 0, gridT0: null, startedAt: 0 };
  }
  function cycle(s, at, offset, fadeIn) {   // start every layer of a set at `at` from `offset` (sample-locked)
    const c = { srcs: [], g: [] };
    for (const [k, file] of Object.entries(s.def.layers)) {
      const b = buffers.get(file); if (!b) continue;
      const src = ctx.createBufferSource(), g = G(fadeIn ? 0 : b.norm, s.lg[k]); src.buffer = b.buf; src.connect(g);
      if (fadeIn) { const xin = XIN.map((v) => v * b.norm); g.gain.setValueCurveAtTime(xin, at, fadeIn); }
      src.start(at, offset); c.srcs.push(src); c.g.push(g);
      src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
    }
    s.cycles.push(c); return c;
  }
  const loaded = (s) => Object.values(s.def.layers).every((f) => buffers.has(f) || failed.has(f)) && Object.values(s.def.layers).some((f) => buffers.has(f));   // a missing stem: the others play
  function musicOn(name, { at = now() + 0.03, offset, fade = 2, level = 1 } = {}) {
    const s = sets[name]; if (!s) return;
    const t = now(); hold(s.out.gain, t); s.out.gain.linearRampToValueAtTime(L.music * level * Math.pow(10, (s.def.lift || 0) / 20), t + fade);
    if (s.want && s.cycles.length) return;
    s.want = true; s.wantAt = at; s.from = offset ?? (s.def.once ? 0 : s.def.first ?? s.def.a);
    if (running() && loaded(s)) begin(s, at, s.from);
  }
  function begin(s, at, offset) {
    for (const c of s.cycles) for (const x of c.srcs) { try { x.stop(); } catch { /* done */ } }
    s.cycles = []; s.startedAt = at;
    cycle(s, at, offset, 0);
    if (!s.def.once) s.nextB = at + (s.def.b - offset);
    if (s.def.grid) s.gridT0 = at - offset + GRID0;        // the audio time of the take's first downbeat (bars every 2.4 s from it)
  }
  function musicOff(name, fade = 3) {
    const s = sets[name]; if (!s || !s.want) return;
    s.want = false; const t = now();
    hold(s.out.gain, t); s.out.gain.linearRampToValueAtTime(0, t + fade);
    for (const c of s.cycles) for (const x of c.srcs) { try { x.stop(t + fade + 0.1); } catch { /* done */ } }
    s.cycles = []; s.gridT0 = null;
  }
  function musicCut(name) {   // dry: 12 ms
    const s = sets[name]; if (!s) return; const t = now();
    hold(s.out.gain, t); s.out.gain.linearRampToValueAtTime(0, t + 0.012);
    for (const c of s.cycles) for (const x of c.srcs) { try { x.stop(t + 0.05); } catch { /* done */ } }
    s.cycles = []; s.want = false; s.gridT0 = null;
  }
  function musicKeep() {
    const t = now();
    for (const s of Object.values(sets)) {
      if (!s.want || !running() || !loaded(s)) continue;
      if (!s.cycles.length) {   // wanted before it could start (files late, context suspended): start where it would be
        const late = Math.max(0, t + 0.05 - s.wantAt), d = buffers.get(Object.values(s.def.layers).find((f) => buffers.has(f))).buf.duration;
        if (s.def.once) { if (s.from + late < d - 3) begin(s, t + 0.05, s.from + late); else s.want = false; }
        else { const L2 = s.def.b - s.def.a, o = s.from + late; begin(s, t + 0.05, o < s.def.b - 0.5 ? o : s.def.a + ((o - s.def.a) % L2)); }
        continue;
      }
      if (!s.def.once && t > s.nextB - s.def.xf / 2 - 0.4) {   // schedule the next pass of the loop, crossfaded round b
        const xf = s.def.xf, at = s.nextB - xf / 2, old = s.cycles[s.cycles.length - 1];
        for (const g of old.g) { const v = g.gain.value || 1; g.gain.setValueCurveAtTime(XOUT.map((k) => k * v), at, xf); }
        for (const x of old.srcs) { try { x.stop(at + xf + 0.05); } catch { /* done */ } }
        cycle(s, at, s.def.a - xf / 2, xf);
        s.nextB += s.def.b - s.def.a;
        if (s.cycles.length > 3) s.cycles.splice(0, s.cycles.length - 3);
      }
    }
  }
  const layer = (set, key, v, tc = 0.8) => { const g = sets[set]?.lg[key]; if (g) g.gain.setTargetAtTime(v, now(), tc); };
  function onGrid(set, t, tol = 0.2) {   // the take's nearest downbeat to t, if it is near enough (null otherwise)
    const s = sets[set]; if (!s?.gridT0 && s?.gridT0 !== 0) return null;
    const bt = s.gridT0 + Math.round((t - s.gridT0) / BAR) * BAR;
    return Math.abs(bt - t) <= tol ? Math.max(bt, now() + 0.004) : null;
  }

  // ambience loops (seamless files): started once they are there, then only their level moves
  // (the wind, the rain of shards and the crowd travel round the room: each one on its own rotor, behind the effects volume)
  const amb = {}, fxGains = [];
  const ambDest = { 's-wind-loop': rotor(0.012, 0.1), 's-rain-loop': rotor(0.02, 0.6), 's-crowd-loop': rotor(0.03, 0.3) };
  const fxIn = {};
  for (const name of AMBIENCE) {
    const g = G(0); amb[name] = { g, h: null, lp: null };
    if (!ambDest[name]) { g.connect(fxBus); continue; }
    const lp = F('lowpass', 12000, 0.5), eg = G(P.effects, ambDest[name].inp); series(g, lp, eg); amb[name].lp = lp; fxIn[name] = eg; fxGains.push(eg);
  }
  const ambKeep = () => { for (const [name, a] of Object.entries(amb)) if (!a.h && buffers.has(name) && running()) a.h = play(name, { gain: 1, dest: a.g, loop: true, offset: Math.random() * 5 }); };
  const ambLevel = (name, v, tc = 1.2) => amb[name].g.gain.setTargetAtTime(v, now(), tc);

  // ---------------------------------------------------------------- synthesis
  function drum(at, dest, { f0 = 96, f1 = 46, dur = 0.55, gain = 0.3, noise = 0.12, sub = 0, subDest = outSub } = {}) {   // a deep skin
    const o = osc('sine', f0), g = G(0, dest);
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + 0.13);
    const o2 = osc('triangle', f0 * 2.3), g2 = G(0.35); o2.frequency.setValueAtTime(f0 * 2.3, at); o2.frequency.exponentialRampToValueAtTime(f1 * 2.6, at + 0.1); o2.connect(g2); g2.connect(g);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g); if (sub) g.connect(G(sub, subDest));
    for (const x of [o, o2]) { x.start(at); x.stop(at + dur + 0.05); }
    if (noise > 0) {
      const n = ctx.createBufferSource(), f = F('bandpass', 1100, 0.7), ng = G(0, dest); n.buffer = NOISE; n.connect(f); f.connect(ng);
      ng.gain.setValueAtTime(noise * gain * 2.2, at); ng.gain.exponentialRampToValueAtTime(0.0005, at + 0.08);
      n.start(at, Math.random() * 1.8, 0.1);
    }
  }
  function modal(at, hz, gain, dest, parts, verbAmt = 0) {   // struck matter: a few partials [ratio, amp, decay]
    const out = G(gain, dest); if (verbAmt) out.connect(G(verbAmt, verbIn));
    for (const [r, a, d] of parts) {
      const f = hz * r; if (f > 16000) continue;
      const o = osc('sine', f), g = G(0, out); o.connect(g);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(a, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0004, at + d);
      o.start(at); o.stop(at + d + 0.05);
    }
    return out;
  }
  const CERAMIC = [[1, 1, 0.9], [2.32, 0.5, 0.45], [4.25, 0.3, 0.22], [6.63, 0.15, 0.1]];          // tile: bright, short
  const GLASS = [[1, 1, 3.5], [2.76, 0.4, 1.8], [5.4, 0.18, 0.9], [8.93, 0.08, 0.4]];              // glass / small bell: long
  const STONE = [[1, 1, 1.4], [1.51, 0.45, 0.6], [2.47, 0.25, 0.3]];                               // a low resonant stone
  function fmHit(at, hz, gain, dest) {   // the festa's resonant hit: FM bell (bright attack, inharmonic shimmer) on a round body
    const c = osc('sine', hz), m = osc('sine', hz * 1.41), mg = G(hz * 2.2), g = G(0, dest);
    m.connect(mg); mg.connect(c.frequency); c.connect(g);
    mg.gain.setValueAtTime(hz * 2.2, at); mg.gain.exponentialRampToValueAtTime(hz * 0.05, at + 0.6);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0004, at + 2.4);
    const b = osc('triangle', hz / 2), bg = G(0, dest); b.connect(bg);
    bg.gain.setValueAtTime(0, at); bg.gain.linearRampToValueAtTime(gain * 0.5, at + 0.006); bg.gain.exponentialRampToValueAtTime(0.0004, at + 1.2);
    for (const o of [c, m]) { o.start(at); o.stop(at + 2.5); } b.start(at); b.stop(at + 1.3);
  }
  function voiceNote(at, midi, dur, gain, dest) {   // a low wordless voice: two saws through two formants
    const hz = midiHz(midi), env = G(0, dest), [v1, v2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const fa = F('bandpass', v1, 5), fb = F('bandpass', v2, 6), mix = G(1); mix.connect(fa); mix.connect(fb); fa.connect(env); fb.connect(G(0.6, env));
    const os = [-6, 6].map((c) => { const o = osc('sawtooth', hz); o.detune.value = c; o.connect(mix); return o; });
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + dur * 0.35); env.gain.setTargetAtTime(0, at + dur * 0.5, dur * 0.18);
    for (const o of os) { o.start(at); o.stop(at + dur * 1.5); }
  }
  function heart(at, level) {   // lub-dub: felt in the sub, a little skin on the walls
    for (const [dt, k] of [[0, 1], [0.28, 0.7]]) {
      const o = osc('sine', 62), g = G(0, outSub); o.frequency.setValueAtTime(62, at + dt); o.frequency.exponentialRampToValueAtTime(40, at + dt + 0.16); o.connect(g);
      g.gain.setValueAtTime(0, at + dt); g.gain.linearRampToValueAtTime(level * k, at + dt + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, at + dt + 0.26);
      const s = osc('sine', 150), sg = G(0, drumBus); s.frequency.setValueAtTime(150, at + dt); s.frequency.exponentialRampToValueAtTime(95, at + dt + 0.1); s.connect(sg);
      sg.gain.setValueAtTime(0, at + dt); sg.gain.linearRampToValueAtTime(level * k * 0.16, at + dt + 0.01); sg.gain.exponentialRampToValueAtTime(0.0005, at + dt + 0.18);
      for (const x of [o, s]) { x.start(at + dt); x.stop(at + dt + 0.3); }
    }
  }
  function riser(at, dur, gain = 0.06, dest = fxBus) {   // filtered noise and a rising sine, into a cut
    const n = ctx.createBufferSource(), lp = F('bandpass', 300, 1.4), g = G(0, dest); n.buffer = NOISE; n.loop = true; series(n, lp, g); g.connect(G(0.6, verbIn));
    lp.frequency.setValueAtTime(250, at); lp.frequency.exponentialRampToValueAtTime(7000, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + dur * 0.95); g.gain.linearRampToValueAtTime(0, at + dur + 0.03);
    n.start(at); n.stop(at + dur + 0.1);
    const o = osc('sine', midiHz(62)), og = G(0, dest); o.connect(og); o.frequency.setValueAtTime(midiHz(62), at); o.frequency.exponentialRampToValueAtTime(midiHz(86), at + dur);
    og.gain.setValueAtTime(0, at); og.gain.linearRampToValueAtTime(gain * 0.35, at + dur * 0.9); og.gain.linearRampToValueAtTime(0, at + dur + 0.02); o.start(at); o.stop(at + dur + 0.1);
  }
  function bloom(at) {   // the crown: a vast D major chord that opens (detuned saws through a rising low-pass), spread round the room
    const out = spread(0.15), g = G(0, out); g.connect(G(0.8, verbIn)); const lp = F('lowpass', 300, 0.8); lp.connect(g);
    for (const m of [38, 50, 57, 62, 66, 69, 74, 78, 81]) for (const c of [-9, 7]) { const o = osc('sawtooth', midiHz(m)); o.detune.value = c + rand(-3, 3); o.connect(G(m < 50 ? 0.5 : 0.22, lp)); o.start(at); o.stop(at + 14); }
    lp.frequency.setValueAtTime(300, at); lp.frequency.exponentialRampToValueAtTime(6500, at + 2.5); lp.frequency.exponentialRampToValueAtTime(1800, at + 12);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.05, at + 0.4); g.gain.setTargetAtTime(0.035, at + 3, 2); g.gain.setTargetAtTime(0, at + 9, 1.4);
  }

  // granular clouds from the gralla's one note: stretched, tuned, scattered; to a fixed wall, a rotor, or the whole room
  const clouds = {};
  function cloud(name, o) { clouds[name] = { on: false, level: 0, density: 8, notes: [62], cents: 0, dur: [0.18, 0.5], next: 0, dest: null, ...o, g: G(0, o.dest) }; return clouds[name]; }
  function grain(at, rate, dur, dest) {
    const b = buffers.get('s-gralla'); if (!b) return;
    const src = ctx.createBufferSource(), env = G(0), amp = G(b.norm * 0.6, dest); src.buffer = b.buf; src.playbackRate.value = rate; series(src, env, amp);
    env.gain.setValueCurveAtTime(HANN, at, dur);
    const off = rand(0.8, Math.max(1, b.buf.duration - 0.6 - dur * rate));
    src.start(at, off); src.stop(at + dur + 0.02);
    src.onended = () => { try { amp.disconnect(); } catch { /* gone */ } };
  }
  function cloudsKeep() {
    const t = now();
    for (const c of Object.values(clouds)) {
      c.g.gain.setTargetAtTime(c.on ? c.level : 0, t, 0.6);
      if (!c.on || c.level <= 0.0005) { c.next = 0; continue; }
      if (c.next < t) c.next = t + 0.02;
      let n = 0;
      while (c.next < t + 0.15 && n++ < 8) {
        const m = c.notes[Math.floor(Math.random() * c.notes.length)], rate = (midiHz(m) / GRALLA_HZ) * Math.pow(2, (c.cents + rand(-6, 6)) / 1200);
        grain(c.next, rate, rand(c.dur[0], c.dur[1]), c.g);
        c.next += (1 / c.density) * rand(0.5, 1.5);
      }
    }
  }
  // the pinya's circle: the gralla turning round the room (fast); the tronc's two reed drones (the second one detunes when the
  // group loses the pulse); the festa's soaring reed (fast, high); the intro's and the acta's distant reed memory (still)
  const rotCircle = rotor(0, 0), rotSoar = rotor(0, 0.5);
  series(rotCircle.inp, G(0.3, verbIn)); series(rotSoar.inp, G(0.4, verbIn));
  const reedRoom = spread(); const reedVerb = G(0.8, verbIn);
  cloud('circle', { dest: rotCircle.inp, notes: [62, 69, 74], density: 14, dur: [0.25, 0.7] });
  cloud('reedA', { dest: reedRoom, notes: [50, 62], density: 9, dur: [0.4, 0.9] });
  cloud('reedB', { dest: reedRoom, notes: [57, 69], density: 9, dur: [0.4, 0.9] });
  cloud('soar', { dest: rotSoar.inp, notes: [74, 78, 81, 86], density: 12, dur: [0.15, 0.45] });
  cloud('memory', { dest: reedRoom, notes: [62, 74], density: 3, dur: [0.6, 1.2] });
  for (const c of Object.values(clouds)) if (c.dest === reedRoom) c.g.connect(reedVerb);

  // the drone: a low D and its fifth (wait, brasa, the tronc's title, baixada); the sub part apart
  const droneG = G(0, outRoom), droneSubG = G(0, outSub), dlp = F('lowpass', 480); dlp.connect(droneG);
  const persistent = [];
  for (const [m, type, a] of [[50, 'triangle', 0.5], [57, 'sine', 0.3], [62, 'sine', 0.12]]) { const o = osc(type, midiHz(m)); o.detune.value = (Math.random() - 0.5) * 6; o.connect(G(a, dlp)); o.start(); persistent.push(o); }
  { const o = osc('sine', midiHz(38)); o.connect(droneSubG); o.start(); persistent.push(o); }
  // the pom: a thin thread that rises with the light and flickers when hands move
  const thread = osc('sine', midiHz(74)), threadG = G(0), threadAm = G(1, outRoom); series(thread, threadG, threadAm); threadAm.connect(G(0.8, verbIn)); thread.start(); persistent.push(thread);
  const flick = osc('square', 9), flickG = G(0); series(flick, flickG, threadAm.gain); const flickD = G(0); flick.connect(flickD); flickD.connect(thread.detune); flick.start(); persistent.push(flick);
  // the tronc's creak: a slow click-train through a resonance, one level per wall (its lean), and a low wobble in the sub
  const creakSrc = osc('sawtooth', 26), creakBp = F('bandpass', 420, 5), creakMix = G(1); series(creakSrc, creakBp, creakMix); creakSrc.start(); persistent.push(creakSrc);
  const creakG = walls.map((_, w) => { const g = G(0, toWall(w)); creakMix.connect(g); return g; });
  const wob = osc('sine', 46), wobAm = G(0.5), wobG = G(0, tocSub); series(wob, wobAm, wobG); const wobLfo = osc('sine', 2.3), wobLg = G(0.5); series(wobLfo, wobLg, wobAm.gain); wob.start(); wobLfo.start(); persistent.push(wob, wobLfo);

  // ---------------------------------------------------------------- the tronc's pulse: the score's beat, on the take's downbeat
  function pulse(t0) {
    const at = onGrid('tronc', t0) ?? t0 + 0.03;
    drum(at, tocDrum, { f0: 92, f1: 44, dur: 0.9, gain: 0.18, noise: 0.06, sub: 0.6, subDest: tocSub });
    play('s-timbal', { gain: 0.16, dest: tocDrum, at, rate: 1.06 });   // the timbal's skin, tuned to D
    return at;
  }
  let arpAt = 0, arpN = 0;
  const ARP = [62, 65, 69, 72, 74, 72, 69, 67];   // D F A C D C A G: ceramic eighths, round the room, from the seventh floor

  // ---------------------------------------------------------------- hands: an answer at once, on the hand's own wall
  const voices = [], downsAt = [], lastDownOf = new Map(), wallLoad = walls.map(() => ({ v: 0, t: 0 }));
  function handVoice(wallId, u, ttl, verbAmt = 0.3) {
    const t = now();
    while (voices.length && voices[0].end < t) voices.shift();
    while (voices.length >= L.touchMax) { const v = voices.shift(); v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.02); }   // the oldest yields
    const wi = audio.wallInput(wallId, u), g = G(P.touch);
    series(g, ...HP(), wi.node); if (verbAmt) g.connect(G(verbAmt, verbIn));
    voices.push({ g, end: t + ttl });
    setTimeout(() => { try { g.disconnect(); wi.disconnect(); } catch { /* gone */ } }, ttl * 1000 + 300);
    return g;
  }
  const off = vt.on('touch', (e) => {
    if (e.type !== 'down' || !running()) return;
    const w = wallIdx.get(e.wallId); if (w == null) return;
    const wt = performance.now() / 1000;
    if (wt - (lastDownOf.get(e.stroke) ?? -1e9) < 0.5) return; lastDownOf.set(e.stroke, wt);   // a repeated down of one stroke adds no voice
    if (lastDownOf.size > 200) for (const [k, v] of lastDownOf) if (wt - v > 5) lastDownOf.delete(k);
    downsAt.push(wt); while (downsAt.length && wt - downsAt[0] > 0.4) downsAt.shift();
    // a crowd stays beautiful: hands landing together each get softer (1/√n), and a full room a little softer still
    // and each wall carries a load that decays in ~0.35 s: a burst of hands on one wall (all at once on the beat) cannot pile up
    const wl = wallLoad[w]; wl.v *= Math.exp(-(wt - wl.t) / 0.35); wl.t = wt;
    const dense = (1 / Math.sqrt(downsAt.length)) / (1 + 0.05 * Math.max(0, (S.hands || 0) - 3)) / (1 + wl.v); wl.v += 1;
    const b = S.block, ph = S.phase, t = now() + 0.005, metres = e.v * (walls[w].height || 3), u = e.u ?? 0.5;
    const oct = metres < 0.9 ? 0 : metres < 1.5 ? 1 : 2, deg = clamp(Math.floor(u * 5), 0, 4);
    const far = (k) => { const g = handVoice(e.wallId, u, 2.6, 0.9); play('s-timbal', { gain: 0.12 * k * dense, dest: g, at: t, rate: rand(0.78, 0.86) }); drum(t, G(0, g), { sub: 0.35 * k * dense, gain: 0.1, subDest: touchSub }); };
    if (b === 'wait') far(0.6);
    else if (b === 'intro' || b === 'acta') { const g = handVoice(e.wallId, u, 4, 1.2); modal(t, midiHz(74 + MAJOR_PENTA[deg] + 12 * (oct > 1 ? 1 : 0)), 0.012 * dense, g, GLASS); }   // dust: a faint glint
    else if (b === 'brasa') {   // an ember burst; a low thump in the sub
      const g = handVoice(e.wallId, u, 2.2, 0.5);
      play('s-ember-burst', { gain: 0.17 * dense, dest: g, at: t, rate: rand(0.8, 1.25) });
      drum(t, g, { f0: 70, f1: 38, dur: 0.7, gain: 0.06 * dense, noise: 0, sub: 0.9, subDest: touchSub });
    } else if (b === 'pinya') {   // clay and body
      const g = handVoice(e.wallId, u, 1.6, 0.35);
      play('s-clay', { gain: 0.2 * dense, dest: g, at: t, rate: rand(0.85, 1.1) });
      drum(t, g, { f0: 85, f1: 52, dur: 0.6, gain: 0.07 * dense, noise: 0.02, sub: 0.8, subDest: touchSub });
    } else if (b === 'tronc' && ph !== 'reward') {   // ceramic and stone, tuned to the stone's mode (D minor pentatonic)
      const g = handVoice(e.wallId, u, 1.6, 0.3), m = 62 + 12 * oct + MINOR_PENTA[deg];
      play('s-ceramic', { gain: 0.1 * dense, dest: g, at: t, rate: midiHz(m + 12) / 1605 });
      modal(t, midiHz(m), 0.06 * dense, g, CERAMIC);
      if (oct === 0) modal(t, midiHz(m - 12), 0.05 * dense, g, STONE);
    } else if (b === 'pom') {   // glass: very soft, high, long
      const g = handVoice(e.wallId, u, 4.5, 1.1);
      modal(t, midiHz(81 + MAJOR_PENTA[deg] + 12 * (oct > 1 ? 1 : 0)), 0.025 * dense, g, GLASS);
    } else if (b === 'festa' || b === 'crown') {   // a tuned resonant hit, and its echo on the beat's dotted eighth
      const g = handVoice(e.wallId, u, 3, 0.45), m = 62 + 12 * oct + MAJOR_PENTA[deg];
      fmHit(t, midiHz(m), 0.05 * dense * (oct === 2 ? 0.7 : 1), g);
      play('s-ceramic', { gain: 0.05 * dense, dest: g, at: t, rate: midiHz(m + 24) / 1605 });
      g.connect(G(0.6, echoIn[w] || outRoom));
      if (oct === 0) drum(t, G(0, g), { sub: 0.3 * dense, gain: 0.12, f0: midiHz(m - 12), f1: midiHz(m - 12) * 0.9, dur: 0.8, subDest: touchSub });
    } else if (b === 'baixada') {   // a shard falls into the hand
      const g = handVoice(e.wallId, u, 2.5, 0.6);
      play('s-ceramic', { gain: 0.08 * dense, dest: g, at: t, rate: rand(0.6, 1.3) });
      modal(t, midiHz(74 + MAJOR_PENTA[deg] - 12 * (oct === 0 ? 1 : 0)), 0.03 * dense, g, GLASS);
    }
  });

  // ---------------------------------------------------------------- the score's events
  let block = S.block, introCue = 0, bellsCue = 0, crownAt = -1, crownMusic = false, bloomUntil = -1, actaCue = 0;
  let nextHeart = 0, lastHandClock = -1e9, waitSaid = -1e9, pace = 1, festaIn = false, gustUntil = 0;
  function enterBlock(b) {
    const prev = block; block = b; const t = now();
    // what leaves: each set as its world closes (the festa lets its drums go first, the rest under the baixada)
    for (const name of Object.keys(sets)) {
      if (!sets[name].want) continue;
      const keep = (name === b) || (b === 'crown' && name === 'crown') || (b === 'festa' && (name === 'festa' || name === 'crown')) || (b === 'baixada' && name === 'festa');
      if (!keep) musicOff(name, name === 'intro' ? 6 : name === 'brasa' ? 6 : name === 'pinya' ? 5 : name === 'pom' ? 1.5 : name === 'crown' ? 6 : 3);
    }
    for (const c of Object.values(clouds)) c.on = false;
    if (prev === 'tronc' || b === 'tronc') uncut();
    if (b === 'intro') { introCue = 0; bellsCue = 0; musicOn('intro', { offset: 0, fade: 0.5 }); drum(t + 0.05, drumBus, { f0: 70, f1: 34, dur: 2, gain: 0.1, noise: 0, sub: 1 }); }
    else if (b === 'brasa') musicOn('brasa', { fade: 6 });
    else if (b === 'pinya') { musicOn('pinya', { fade: 6 }); layer('pinya', 'bass', 0.5, 0.1); layer('pinya', 'other', 0.1, 0.1); }
    else if (b === 'tronc') { arpN = 0; }
    else if (b === 'pom') { musicOn('pom', { fade: 10 }); }
    else if (b === 'crown') crown();
    else if (b === 'festa') { say('v-aleta-2', { delay: 0.3 }); if (!sets.festa.want) festaStart(); }
    else if (b === 'baixada') {
      say('v-baixada-1', { delay: 1.2 });
      layer('festa', 'drums', 0, 0.8); layer('festa', 'bass', 0.3, 2); sets.festa.lp.frequency.setTargetAtTime(900, t, 2.5);
      setTimeout(() => { if (block === 'baixada') musicOff('festa', 8); }, 2500);
      musicOn('baixada', { fade: 5 });
    } else if (b === 'fall') {
      for (const name of Object.keys(sets)) musicOff(name, 0.4);
      play('s-impact', { gain: 0.3, at: t + 0.02 }); play('sfx-fall', { gain: 0.3, at: t + 0.1 });
      drum(t + 0.03, drumBus, { f0: 70, f1: 30, dur: 1.8, gain: 0.2, noise: 0.05, sub: 0.9 });
    } else if (b === 'acta') { actaCue = 0; musicOn('acta', { offset: 0, fade: 2 }); }
    if (b !== 'crown') { crownAt = -1; crownMusic = false; }
    if (b !== 'festa' && b !== 'crown' && b !== 'baixada') festaIn = false;
  }
  function festaStart() { festaIn = true; musicOn('festa', { fade: 6 }); layer('festa', 'bass', 0.6, 0.1); layer('festa', 'other', 0.45, 0.1); layer('festa', 'drums', 0, 0.1); setNow(sets.festa.lp.frequency, 700); }
  function crownMusicStart(offset) { if (crownMusic) return; crownMusic = true; musicOn('crown', { offset, fade: 0.05, level: 0.75 }); }
  function crown() {   // l'aleta: the release, the bloom, the square roars, the voice; the festa's music comes in from below
    if (crownAt >= 0 || !running()) return; const t = now(); crownAt = t;
    crownMusicStart(CROWN_IMPACT - 0.35);      // jumped here (no pom reward to start the swell): straight to the release
    bloom(t + 0.02);
    for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.09, midiHz(86 + MAJOR_PENTA[w % 5]), 0.05, toWall(w), GLASS, 0.8);
    if (play('sfx-crown', { gain: 0.24, dest: fxIn['s-crowd-loop'] || fxBus, at: t + 0.4 })) rotCrowd.speed = 0.12;
    say('v-aleta-1', { delay: 2.2 });
  }
  const rotCrowd = ambDest['s-crowd-loop'];
  function cutDry() {   // the tronc's last floor: everything that is music stops at once (a 12 ms ramp: dry, without a click)
    const t = now();
    musicCut('tronc');
    for (const p of [tocDrum.gain, tocSub.gain, wet.gain, droneG.gain, droneSubG.gain]) { hold(p, t); p.linearRampToValueAtTime(0, t + 0.012); }
    clouds.reedA.on = clouds.reedB.on = false; for (const n of ['reedA', 'reedB']) { hold(clouds[n].g.gain, t); clouds[n].g.gain.linearRampToValueAtTime(0, t + 0.012); }
  }
  function uncut() { const t = now(); for (const p of [tocDrum.gain, tocSub.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(1, t, 0.02); } ramp(wet.gain, L.verb, 0.4); }
  function enterPhase(p) {
    const t = now();
    if (p === 'title') say(TITLE_LINE[block]);
    if (block === 'tronc' && p === 'play') {   // the take starts on the play's first instant: its next downbeat is the score's first pulse
      musicOn('tronc', { at: t + 0.03, offset: GRID_A, fade: 0.05 });
      layer('tronc', 'bass', 0.65, 0.05); layer('tronc', 'drums', 0, 0.05); layer('tronc', 'other', 0, 0.05); setNow(sets.tronc.lp.frequency, 1800);
    } else if (block === 'tronc' && p === 'reward') cutDry();
    else if (block === 'pom' && p === 'play') say('v-pom-2', { delay: 0.3 });
    else if (block === 'pom' && p === 'reward') crownMusicStart(Math.max(0, CROWN_IMPACT - T.pom.reward / pace));   // the swell rises under the last light; it lands on the crown
    else if (block === 'pinya' && p === 'reward') { play('s-crack', { gain: 0.26, at: t + 4.5 }); riser(t + 2.5, 2, 0.03); }
  }
  function onEvent(ev) {
    const i = ev.indexOf(':'), k = i < 0 ? ev : ev.slice(0, i), arg = i < 0 ? '' : ev.slice(i + 1), t = now();
    if (k === 'block') return enterBlock(arg);
    if (k === 'phase') return enterPhase(arg);
    if (k === 'hint') return say(HINT_LINE[arg], { polite: true, delay: 0.2 });
    if (k === 'abandon') { hush(1); for (const name of Object.keys(sets)) musicOff(name, 3); for (const c of Object.values(clouds)) c.on = false; for (const h of [...live]) if (!h.name.endsWith('-loop')) h.stop(2); return; }
    if (!running()) return;
    if (k === 'wave') {   // the correfoc's tabals run round the room from the busiest wall, and land deep
      let from = 0, best = -1; S.count.forEach((c, w) => { if (c > best) { best = c; from = w; } });
      for (let j = 0; j < NW; j++) play('s-tabals', { gain: 0.13 * (0.55 + 0.45 * (j / Math.max(1, NW - 1))), dest: toWall(from + j), at: t + 0.03 + j * 0.16, rate: 1 - j * 0.03 });
      drum(t + 0.03 + NW * 0.16 + 0.35, drumBus, { f0: 80, f1: 36, dur: 1.4, gain: 0.12, noise: 0.05, sub: 0.45 });
    } else if (k === 'awake') {   // the ring wakes: a reverse swell into a deep hit; the fire then sinks into earth
      const r = play('s-impact', { gain: 0.14, reverse: true, at: t + 0.05 });
      const land = r ? r.end : t + 5;
      drum(land, drumBus, { f0: 78, f1: 34, dur: 1.8, gain: 0.18, noise: 0.04, sub: 0.6 });
      for (let w = 0; w < NW; w++) modal(land + w * 0.04, midiHz([50, 57, 62, 45][w % 4]), 0.05, toWall(w), STONE, 0.6);
    } else if (k === 'wall') { const w = +arg; voiceNote(t + 0.02, [50, 57, 53, 45][w % 4], 3.4, 0.045, toWall(w)); play('s-clay', { gain: 0.12, dest: toWall(w), at: t, rate: 0.7 }); }
    else if (k === 'close') { say('v-pinya-3', { delay: 0.2 }); clouds.circle.on = true; rotCircle.speed = 0.35; }
    else if (k === 'pulse') pulse(t);
    else if (k === 'floor') {
      play('sfx-tile', { gain: 0.16, dest: toWall(S.floors), at: t + 0.02 });
      const at = onGrid('tronc', t + 0.3, 1.3) ?? t + 0.05;       // the floor rings on a downbeat
      modal(at, midiHz(62 + MINOR_PENTA[S.floors % 5] + 12 * Math.floor(S.floors / 5)), 0.06, toWall(S.floors + 1), CERAMIC, 0.5);
    } else if (k === 'climber') { riser(t, 2.2, 0.025, fxIn['s-wind-loop'] || fxBus); gustUntil = t + 2.6; }
    else if (k === 'arrived') {   // a glass chord on the wall where she arrived
      const w = S.lightWall >= 0 ? S.lightWall : 0, base = [81, 86, 93][clamp(+arg, 0, 2)];
      for (const [j, d] of [[0, 0], [1, 7], [2, 12]]) modal(t + 0.02 + j * 0.07, midiHz(base + d), 0.035, toWall(w), GLASS, 0.9);
      heart(t + 0.05, 0.1);
    } else if (k === 'crown') crown();
    else if (k === 'bloom') {   // the room flowers: everything opens for 5 s, bells round the walls, the crowd swells
      bloomUntil = t + 5;
      for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.12, midiHz(86 + MAJOR_PENTA[w % 5]), 0.04, toWall(w), GLASS, 0.8);
      drum(t + 0.02, drumBus, { f0: 70, f1: 36, dur: 1.6, gain: 0.1, noise: 0, sub: 0.45 });
      ambLevel('s-crowd-loop', L.crowd * 1.8, 0.3);
    } else if (k === 'down') {   // a floor comes down: a tile, and a falling note on the next wall round
      play('sfx-tile', { gain: 0.14, dest: toWall(S.floors), at: t + 0.02 });
      const m = 74 + MAJOR_PENTA[S.floors % 5] - 12 * (S.floors < 3 ? 1 : 0);
      modal(t + 0.03, midiHz(m), 0.05, toWall(S.floors + 1), GLASS, 0.7);
    }
  }

  // ---------------------------------------------------------------- what follows the state, every step
  function follow(dt) {
    const t = now(), b = block, ph = S.phase, prog = S.progress || 0, on = running();
    if (S.hands > 0) lastHandClock = S.clock;
    // the voice by the clock: the intro's lines, the waiting call, the acta's lines
    const IV = P.lang === 'es' ? INTRO_VOICE_ES : INTRO_VOICE;
    if (b === 'intro') while (introCue < IV.length && S.t >= IV[introCue][0]) say(IV[introCue++][1], { delay: 0.05 });
    if (b === 'wait' && S.hands === 0) { const gone = S.clock - lastHandClock; if (gone >= WAIT_AFTER && gone <= WAIT_RECENT && S.clock - waitSaid >= WAIT_EVERY) { waitSaid = S.clock; say('v-wait', { polite: true, delay: 0.2 }); } }
    if (b === 'acta') {
      if (actaCue === 0 && S.t >= ACTA_AT.outcome) { actaCue = 1; say(OUTCOME_LINE[S.outcome] || OUTCOME_LINE.descarregat, { delay: 0.05 }); }
      if (actaCue === 1 && S.t >= ACTA_AT.final) { actaCue = 2; say('v-cierre-final', { delay: 0.05 }); }
    }
    if (!on) return;
    musicKeep(); ambKeep();
    // the intro's bells: far away (the far wall) at the start, again lower as the tower dissolves
    if (b === 'intro') {
      if (bellsCue === 0 && S.t >= 2.5) { bellsCue = 1; const h = play('s-bells', { gain: 0.13, dest: toWall(Math.floor(NW / 2)), rate: 0.947 }); h?.g.connect(G(0.9, verbIn)); }
      if (bellsCue === 1 && S.t >= 46) { bellsCue = 2; const h = play('s-bells', { gain: 0.09, dest: toWall(0), rate: 0.71 }); h?.g.connect(G(1, verbIn)); }
    }
    if (b === 'crown' && !festaIn && S.t >= 13.5) festaStart();   // the festa grows out of the crown's last bars

    const tronc = b === 'tronc' && ph !== 'reward', pom = b === 'pom', fl = S.floors || 0, res = clamp(S.resonance || 0, 0, 1), bl = t < bloomUntil;
    // ---- the layers of each world
    if (b === 'brasa') layer('brasa', 'bed', ph === 'reward' ? 0.5 : 0.7 + 0.3 * prog, 1.5);
    if (b === 'pinya') { layer('pinya', 'bass', ph === 'reward' ? 1 : 0.5 + 0.5 * prog, 1); layer('pinya', 'other', ph === 'reward' ? 1 : 0.1 + 0.9 * Math.pow(prog, 1.2), 1); }
    if (tronc && sets.tronc.want) {
      layer('tronc', 'bass', 0.65 + 0.03 * fl, 1);
      layer('tronc', 'drums', clamp(fl * 0.45, 0, 1), 1.2);
      layer('tronc', 'other', clamp((fl - 2) * 0.4, 0, 1), 1.5);
      sets.tronc.lp.frequency.setTargetAtTime(fl >= 7 ? 18000 : 1800 + fl * 1500, t, 1.5);
      // from the fifth floor, two reed drones (D and A); out of step the second detunes and beats against the first
      const weak = Math.min(1, S.weak.reduce((a, v) => a + v, 0) / Math.max(1, S.structure) / 2);
      clouds.reedA.on = clouds.reedB.on = fl >= 5; clouds.reedA.level = clouds.reedB.level = L.grains * (0.6 + 0.08 * (fl - 5));
      clouds.reedB.cents = weak * 45;
      // from the seventh floor, ceramic eighths round the room on the take's grid
      if (fl >= 7 && sets.tronc.gridT0 != null) {
        if (arpAt < t) arpAt = (onGrid('tronc', t, 2) ?? t) + BAR / 8;
        while (arpAt < t + 0.2) { modal(arpAt, midiHz(ARP[arpN % ARP.length] + 12), 0.022, toWall(arpN % NW), CERAMIC, 0.4); arpN++; arpAt += BAR / 8; }
      }
    }
    if (pom) layer('pom', 'bed', 0.6 + 0.4 * prog, 1.5);
    if (b === 'festa' || b === 'crown') {
      const r = b === 'crown' ? 0 : res;
      layer('festa', 'bass', bl ? 0.85 : 0.6 + 0.25 * r, bl ? 0.15 : 0.8);
      layer('festa', 'other', bl ? 1 : 0.45 + 0.55 * r, bl ? 0.15 : 0.8);
      layer('festa', 'drums', bl ? 0.9 : b === 'crown' ? 0 : 0.85 * clamp((r - 0.08) / 0.35, 0, 1), bl ? 0.15 : 1);
      sets.festa.lp.frequency.setTargetAtTime(bl ? 18000 : b === 'crown' ? 700 + 120 * Math.max(0, S.t - 13.5) : 1500 + 16000 * Math.pow(r, 1.4), t, bl ? 0.2 : 0.8);
      clouds.soar.on = b === 'festa' && (r > 0.55 || bl); clouds.soar.level = L.grains * (bl ? 1.4 : 0.5 + (r - 0.55) * 1.5);
      rotSoar.speed = 0.25 + 0.3 * r;
      if (b === 'festa') rotCrowd.speed = 0.04 + 0.2 * r;
    }
    if (b === 'intro') { clouds.memory.on = S.t > 56; clouds.memory.level = L.grains * 0.5 * clamp((S.t - 56) / 10, 0, 1); }
    if (b === 'acta') { clouds.memory.on = S.t > 6 && S.t < 34; clouds.memory.level = L.grains * 0.35; }
    if (b === 'pinya') { clouds.circle.level = L.grains * (ph === 'reward' ? 1.2 : 1); }

    // ---- ambience by block
    const A = {
      's-embers-loop': b === 'wait' ? L.embers : b === 'brasa' ? L.embers * 1.3 : b === 'intro' ? L.embers * 0.3 : b === 'acta' ? L.embers * 0.8 : 0,
      's-fire-loop': b === 'brasa' ? (ph === 'reward' ? 0 : L.fire * (0.2 + 0.8 * prog)) : 0,
      's-breath-loop': b === 'pinya' ? L.breath * (ph === 'title' ? 0.4 : 0.4 + 0.6 * prog) : b === 'intro' && S.t > 20 && S.t < 50 ? L.breath * 0.35 : 0,
      's-wind-loop': pom ? L.wind * (ph === 'reward' ? 0.3 : 0.5 + 0.5 * prog) * (t < gustUntil ? 1.7 : 1) : 0,
      's-rain-loop': b === 'baixada' ? L.rain * (0.6 + 0.4 * prog) : 0,
      's-crowd-loop': b === 'festa' ? L.crowd * (bl ? 1.8 : 0.35 + 0.9 * res) : b === 'crown' ? L.crowd * 0.8 : 0,
    };
    for (const [name, v] of Object.entries(A)) ambLevel(name, v, name === 's-fire-loop' && ph === 'reward' ? 0.8 : name === 's-wind-loop' && t < gustUntil ? 0.4 : 1.4);
    if (amb['s-wind-loop'].lp) amb['s-wind-loop'].lp.frequency.setTargetAtTime(1500 + 9000 * prog, t, 1);

    // ---- a crowd of hands shares the sub: their thumps get lighter as the room fills (the walls keep their attacks)
    touchSub.gain.setTargetAtTime(1 / Math.sqrt(Math.max(1, (S.hands || 0) / 3)), t, 0.3);
    // ---- the drone
    const drone = b === 'wait' ? 0.03 : b === 'brasa' ? 0.015 : b === 'tronc' && ph === 'title' ? 0.035 : b === 'baixada' ? 0.012 : b === 'fall' ? 0.02 : 0;
    if (!(b === 'tronc' && ph === 'reward')) { droneG.gain.setTargetAtTime(drone * 0.9, t, 1.2); droneSubG.gain.setTargetAtTime(drone * 1.3, t, 1.2); }
    // ---- the pom: the thread rises D5 → D6 with the three climbers and flickers when hands move
    thread.frequency.setTargetAtTime(midiHz(74) * Math.pow(2, prog), t, 0.4);
    threadG.gain.setTargetAtTime(pom && ph === 'play' ? 0.01 + 0.025 * prog : 0, t, 0.3);
    flickG.gain.setTargetAtTime(pom && S.restless ? 0.7 : 0, t, 0.08); flickD.gain.setTargetAtTime(pom && S.restless ? 25 : 0, t, 0.08);
    // ---- the creak of a leaning tower (from the third floor on): each structure wall by its own lean, the sub by the mean
    let leanSum = 0, leanN = 0;
    for (let w = 0; w < walls.length; w++) { const l = S.balance && tronc && S.walls[w] ? Math.min(1, Math.abs(S.lean[w] || 0)) : 0; creakG[w].gain.setTargetAtTime(l * 0.1, t, 0.3); if (S.walls[w]) { leanSum += l; leanN++; } }
    const lean = leanN ? leanSum / leanN : 0;
    creakSrc.frequency.setTargetAtTime(22 + 22 * lean, t, 0.5); wobG.gain.setTargetAtTime(lean * 0.2, t, 0.4);
    // ---- the heartbeat: slow under the pinya (quickening as it fills), faint under the pom
    const hp = b === 'pinya' && ph !== 'reward' ? (1.3 - 0.3 * prog) / Math.sqrt(pace) : pom && ph !== 'reward' ? 1.0 / Math.sqrt(pace) : 0;
    if (hp) { if (nextHeart < t) nextHeart = t + 0.05; if (nextHeart - t < 0.1) { heart(nextHeart, b === 'pinya' ? 0.14 + 0.1 * prog : 0.07); nextHeart += hp; } } else nextHeart = 0;
    // ---- rotors and grains
    for (const r of rotors) {
      r.phase += dt * r.speed;
      for (let w = 0; w < r.g.length; w++) r.g[w].gain.setTargetAtTime(Math.max(0, Math.cos(r.phase * Math.PI * 2 - (w / NW) * Math.PI * 2)) ** 2, t, 0.06);
    }
    if (b !== 'crown' && b !== 'festa') rotCrowd.speed = 0.03;
    cloudsKeep();
  }

  // ---------------------------------------------------------------- the score leads, on the wall clock
  // LOCAL WORKAROUND (see the top of the file): the BroadcastChannel to the visual piece.
  let bc = null;
  try { bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { bc = null; }
  if (bc) bc.onmessage = (ev) => { const m = ev.data; if (m?.type !== 'ctl') return; if (m.pace > 0) pace = Math.min(32, m.pace); if (m.jump) score.jump(m.jump); };
  const lastPos = new Map(), hands = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const wallNow = performance.now(), dt = clamp((wallNow - last) / 1000, 0, 0.25), wt = wallNow / 1000; last = wallNow;
    // the hands as the score wants them: wall index, metres from the wall's centre, a speed from each stroke's own movement
    hands.length = 0; const seen = new Set();
    for (const h of vt.hands()) {
      const w = wallIdx.get(h.wallId); if (w == null) continue;
      const W = walls[w], x = h.u * (W.width || 4), y = h.v * (W.height || 3);
      let p = lastPos.get(h.stroke);
      if (!p) { p = { x, y, t: wt, speed: 0 }; lastPos.set(h.stroke, p); }
      else if (wt - p.t >= 0.09) { p.speed = Math.hypot(x - p.x, y - p.y) / (wt - p.t); p.x = x; p.y = y; p.t = wt; }
      seen.add(h.stroke); hands.push({ stroke: h.stroke, wall: w, dx: (h.u - 0.5) * (W.width || 4), speed: p.speed });
    }
    for (const k of lastPos.keys()) if (!seen.has(k)) lastPos.delete(k);
    score.step(dt * pace, hands);
    const events = S.events.splice(0);
    for (const ev of events) { try { onEvent(ev); } catch (e) { console.error('ressonancia-sound:', ev, e); } }
    try { follow(dt * pace); } catch (e) { console.error('ressonancia-sound:', e); }
    if (bc) { try { bc.postMessage({ type: 'state', ts: Date.now(), pace, s: { ...S, events }, acta: score.acta() }); } catch { /* a closed channel: play on */ } }
  }, 25);

  loading.then(() => { if (running()) { ambKeep(); musicKeep(); } });

  return {
    setParams(p) {
      const lang = P.lang; Object.assign(P, p); const t = now();
      if (P.lang !== lang) { for (const n of VOICE_SET) { buffers.delete(n); peaks.delete(n); failed.delete(n); } Promise.all([...VOICE_SET].map(load)); }   // the other language's voice
      musicBus.gain.setTargetAtTime(P.music, t, 0.1); drumBus.gain.setTargetAtTime(P.drums, t, 0.1); fxBus.gain.setTargetAtTime(P.effects, t, 0.1); for (const g of fxGains) g.gain.setTargetAtTime(P.effects, t, 0.1); voiceBus.gain.setTargetAtTime(P.voice, t, 0.1);
    },
    async stop() {
      clearInterval(timer); off?.(); try { bc?.close(); } catch { /* closed */ }
      const t = now();
      for (const h of [...live]) h.stop(0.3);
      for (const name of Object.keys(sets)) musicOff(name, 0.3);
      for (const c of Object.values(clouds)) c.on = false;
      for (const g of [droneG, droneSubG, threadG, wobG, ...creakG]) ramp(g.gain, 0, 0.1, t);
      for (const o of persistent) { try { o.stop(t + 1); } catch { /* done */ } }
      setTimeout(() => { for (const wi of wallIn) wi.disconnect(); }, 1500);
    },
  };
}
