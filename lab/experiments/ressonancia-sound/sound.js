// Ressonància — the sound piece (contract: experiences/SOUND-API.md). The whole 10-minute work, as GUION.md writes it.
//
// It runs the work's SCORE (score.js: an identical copy of ressonancia/score.js — a piece may only import from its own folder;
// keep the two files identical) and LEADS: sound hears a hand land at once, and the pulse must be the music's.
//
//   LOCAL WORKAROUND, clearly marked: the runtime has no channel between a visual piece and its sound piece. Every window of the
//   app loads from the same origin, so this piece posts the score's state on a BroadcastChannel ('ressonancia') after every
//   step — { type: 'state', ts, pace, s: { ...state, events }, acta } — and the visual follows it. It also accepts
//   { type: 'ctl', pace?, jump?, times? } (rehearsal: run the score's clock faster, go to a block). Without the channel both pieces still
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
import { createScore, TIMES } from './score.js';
import { applyTimes } from './tuning.js';   // T-052: the visual piece sends the room's thresholds (ctl.times)
import { CUES, cueKey, resolve, cueWall, INTRO_AT, INTRO_AT_70, ACTA_AT as ACTA_CUES, CALL_LATE } from './cues.js';   // 25-11: THE script (voice + text)

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
  // [66.3, 'v-intro-6'],  «Put your hands on the wall.» — SILENCED 24-11: the score does not listen in the intro (the brasa asks)
];
// the same six cues for the Spanish voice (audio/es/, see audio/es/voice-lines-es.json): its own lengths, the same picture
//    Mía Evans (peninsular Spanish, eleven_v4): 6.4 · 9.5 · 9.1 · 5.4 · 5.1 · 2.2 s — they fit the same cues.
const INTRO_VOICE_ES = [[8.5, 'v-intro-1'], [17, 'v-intro-2'], [29, 'v-intro-3'], [41, 'v-intro-4'], [53.3, 'v-intro-5']];   // v-intro-6 silenced (24-11)
const ACTA_AT = { outcome: 4.5, final: 24.5 };   // acta.js: the castell appears at 4 s, the last sentence at 24 s
// 24-11 (plan de interacción): the voice invites (≤ 7 words where it can), never counts, never repeats a line in a pass. Silenced, kept:
// v-pinya-1 / v-pinya-2 (circles), v-tronc-1 / v-tronc-3 (the drum and the beat), v-aleta-1 (raise the hand AFTER the crown), v-baixada-1.
const TITLE_LINE = { brasa: 'v-brasa-1', pinya: 'v-pinya-wait', tronc: 'v-tronc-lift', pom: 'v-pom-1' };   // when a block's title phase starts
const HINT_LINE = { together: 'v-brasa-2', again: 'v-brasa-3', straight: 'v-tronc-2', still: 'v-pom-3' };   // more / hold / beat / lift / foot: silent (their moments have their own lines now)
const OUTCOME_LINE = { descarregat: 'v-cierre-descarregat', carregat: 'v-cierre-carregat', intent: 'v-cierre-intent' };
const WAIT_EVERY = 40, WAIT_RECENT = 120, WAIT_AFTER = 6;   // the wait's call: at most every 40 s, only if a hand was seen in the last 2 min (and gone 6 s)
// The wait's voice (2026-11-24): the old v-wait («put your hands on the wall to begin») no longer fits the reveal rule and is SILENT.
// Its replacements: v-wait-invite (before the button is revealed: an invitation to play) and v-wait-start (on 'reveal': hold the
// ring to begin). Recorded 2026-11-24 (audio/ and audio/es/, same voices and settings; speech-to-text checked).
const WAIT_VOICES = true;

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
// 25-11 (05-plan N4): every line the cue table can say, plus the old ones; the new lines exist only in Spanish (ES_ONLY: with the
// English selector they are not requested, the cues still write their text)
const CUE_VOICES = Object.values(CUES).flatMap((c) => [c.voice, c.colla].flatMap((v) => (v == null ? [] : typeof v === 'object' ? Object.values(v) : [v])));
const EN_VOICES = new Set(['v-aleta-1', 'v-aleta-2', 'v-aleta-crowned', 'v-aleta-raise', 'v-aleta-yours', 'v-baixada-1', 'v-baixada-gently', 'v-brasa-1', 'v-brasa-2', 'v-brasa-3',
  'v-cierre-carregat', 'v-cierre-descarregat', 'v-cierre-final', 'v-cierre-intent', 'v-intro-1', 'v-intro-2', 'v-intro-3', 'v-intro-4', 'v-intro-5', 'v-intro-6', 'v-pinya-1', 'v-pinya-2',
  'v-pinya-3', 'v-pinya-closein', 'v-pinya-wait', 'v-pom-1', 'v-pom-2', 'v-pom-3', 'v-tronc-1', 'v-tronc-2', 'v-tronc-3', 'v-tronc-lift', 'v-tronc-wobble', 'v-wait', 'v-wait-invite', 'v-wait-start']);
const VOICES = [...new Set([...(WAIT_VOICES ? ['v-wait-invite', 'v-wait-start'] : []), ...INTRO_VOICE.map((c) => c[1]), ...Object.values(TITLE_LINE), 'v-brasa-2', 'v-brasa-3', 'v-pinya-3', 'v-tronc-2',
  'v-pom-2', 'v-pom-3', 'v-aleta-2', ...Object.values(OUTCOME_LINE), 'v-cierre-final', 'v-tronc-wobble', 'v-aleta-raise', 'v-aleta-yours', 'v-aleta-crowned', 'v-baixada-gently', 'v-pinya-closein', ...CUE_VOICES])];
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
  touchMax: 8,                               // simultaneous hand voices; the oldest yields (S3, 25-11: 12 → 8)
  genDuck: 0.55,                             // the generative layer under the voice (−5 dB), as the music is ducked (×0.42)
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const MINOR_PENTA = [0, 3, 5, 7, 10];        // D F G A C: the stone
const MAJOR_PENTA = [0, 2, 4, 7, 9];         // D E F# A B: the light
// ---------------------------------------------------------------------------------------------------------------- ONE SOUND (D6b)
// S1 (25-11): the key of each chapter, from ANALYSING the files (ffmpeg + chroma of the whole take and of 9.6 s windows, onset
// autocorrelation for the pulse; NOTES.md › Key and tempo) — where the analysis contradicts the prompt, the analysis wins:
// festa B♭ major, crown C major, pom C# (open fifth), pinya A minor. root = the tonic's MIDI near D4 (62 ± 6); scale = the pitch
// classes (from root) the generative layer may sound; bpm / grid0 = the take's pulse (null: no pulse, on purpose).
// S2: the generative code stays WRITTEN in D; tune(m) SOUNDS it in the chapter's key — transposed by root − 62 and snapped to the
// nearest pitch of the scale. modal / fmHit / voiceNote / the gralla's grains / the tuned samples all pass through it.
const KEYS = {
  wait:    { root: 62, scale: [0, 2, 4, 7, 9], bpm: null },
  intro:   { root: 62, scale: [0, 2, 4, 7, 9], bpm: null },               // m-intro: D (D A E F#)
  brasa:   { root: 62, scale: [0, 3, 5, 7], bpm: null },                  // m-brasa: a drone on D coloured by C# / G#: no C, no clash
  pinya:   { root: 57, scale: [0, 3, 5, 7, 10], bpm: null },              // st-pinya: A minor (A E G C D) — the prompt said D minor
  tronc:   { root: 62, scale: [0, 3, 5, 7, 10], bpm: 100, grid0: 0.045 }, // st-tronc: D (D + A; third neutral) — prompt D minor
  pom:     { root: 61, scale: [0, 2, 4, 7, 9], bpm: null },               // m-pom: C# + G# — a semitone under D
  crown:   { root: 60, scale: [0, 2, 4, 7, 9], bpm: null },               // m-crown: C major (C G B D A) — the prompt said D major
  festa:   { root: 58, scale: [0, 2, 4, 7, 9], bpm: 100, grid0: 0.045 },  // st-festa: B♭ major (B♭ D F C G E♭) — the prompt said D major
  baixada: { root: 62, scale: [0, 2, 4, 7, 9], bpm: null },               // m-baixada: D major (D A E)
  fall:    { root: 62, scale: [0, 3, 5, 7], bpm: null },
  acta:    { root: 62, scale: [0, 2, 4, 7, 9], bpm: null },               // m-acta: D major (A D G F#)
};
const TIMBAL_HZ = 67.3;                      // s-timbal's measured f0 (C2 + 49 cents): its rate = the wanted pitch / this
const VOWELS = [[570, 840], [730, 1090], [440, 1020], [520, 920]];   // the pinya's murmur
const HANN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((Math.PI * i) / 63) ** 2);
const XIN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((Math.PI / 2) * (i / 63)));
const XOUT = Float32Array.from({ length: 64 }, (_, i) => Math.cos((Math.PI / 2) * (i / 63)));

export default async function start(host) {
  const { audio, vt } = host;
  const ctx = audio.ctx, P = { voice: 1, music: 1, drums: 1, effects: 1, touch: 1, lang: 'es', ...host.params };   // Spanish by default (Vicente, 24-11); English stays in the selector
  const walls = vt.walls || [], NW = Math.max(1, walls.length), wallIdx = new Map(walls.map((w, i) => [w.id, i]));
  const score = createScore(NW, { lengths: walls.map((w) => w.width || 4) }), S = score.state, T = score.times;   // T-055: the walls' lengths (the relay runs along the perimeter)
  const now = () => ctx.currentTime;
  const running = () => ctx.state === 'running';
  const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const F = (type, hz, q = 0.707) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; };
  const series = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
  const osc = (type, hz) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; return o; };
  const ramp = (param, v, tc, t = now()) => { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); };
  const hold = (param, t = now()) => { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); };
  const setNow = (param, v, t = now()) => { param.cancelScheduledValues(t); param.setValueAtTime(v, t); };
  // ---- D6b: the chapter's key (KEYS). keyBlock overrides the block for a moment (the crown sounds in the crown's key from the pom)
  let keyBlock = null;
  const keyNow = () => keyBlock || (block === 'crown' && festaIn ? 'festa' : block);
  function tune(m, b) {   // a pitch written in D → the same degree in the chapter's key, snapped to its scale
    const K = KEYS[b || keyNow()] || KEYS.wait, x = m + (K.root - 62), pc = (((x - K.root) % 12) + 12) % 12;
    let best = 0, bd = 99; for (const d of K.scale) for (const o of [-12, 0, 12]) { const dd = Math.abs(d + o - pc); if (dd < bd) { bd = dd; best = d + o - pc; } }
    return x + best;
  }
  const tuneHz = (hz, b) => midiHz(tune(69 + 12 * Math.log2(hz / 440), b));
  const timbalRate = (m, b) => midiHz(tune(m, b)) / TIMBAL_HZ;
  // the take's grid (tronc, festa): the next 16th (0.15 s at 100 BPM) after t; without a pulse, t itself
  function nextTick(t) {
    const K = KEYS[keyNow()] || {}, s = K.bpm ? sets[keyNow() === 'crown' ? 'festa' : keyNow()] : null;
    if (!s || s.gridT0 == null) return t;
    const step = BAR / 16; return s.gridT0 + Math.ceil((t - s.gridT0 - 0.004) / step) * step;
  }

  // ---------------------------------------------------------------- outputs
  const HP = () => [F('highpass', 120, 0.54), F('highpass', 120, 1.31)];   // 4th-order Butterworth: the host sums the walls into the sub
  const outRoom = series(...HP(), audio.roomInput());
  const outSub = series(F('lowpass', 110), F('lowpass', 110), audio.subInput());
  // S3 (25-11): the generative layer (hands, effects, pads, everything on the walls and the room but the music and the voice) is
  // ducked under the voice: every one of its paths has a gain whose value is driven by ONE constant source (genDuck.offset)
  const genDuck = ctx.createConstantSource(); genDuck.offset.value = 1; genDuck.start();
  const ducked = () => { const g = ctx.createGain(); g.gain.value = 0; genDuck.connect(g.gain); return g; };
  const genRoom = ducked(); series(genRoom, outRoom);
  const wallIn = walls.map((w) => audio.wallInput(w.id, 0.5));
  const wallOut = wallIn.map((wi) => series(ducked(), ...HP(), wi.node));
  const toWall = (w) => wallOut[((w % NW) + NW) % NW] || genRoom;
  // the music has its own wall paths (it is ducked by `duck`, never twice)
  const musicWallIn = walls.map((w) => audio.wallInput(w.id, 0.5));
  const musicWallOut = musicWallIn.map((wi) => series(...HP(), wi.node));
  const toMusicWall = (w) => musicWallOut[((w % NW) + NW) % NW] || outRoom;
  // N3 (25-11): the voice — the room's own path, and one path per wall for the lines that point at a place (100 % there + 25 % room)
  const voiceRoom = series(...HP(), audio.roomInput());
  const voiceWallIn = walls.map((w) => audio.wallInput(w.id, 0.5));
  const voiceWall = voiceWallIn.map((wi) => series(G(P.voice), ...HP(), wi.node));
  // a stereo (or mono) signal spread over the room: L → even walls, R → odd walls, its low end to the sub
  function spread(subAmt = 0, to = toWall) {
    const inp = G(1), up = G(1); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; inp.connect(up);
    const sp = ctx.createChannelSplitter(2); up.connect(sp);
    const l = G(0.8), r = G(0.8); sp.connect(l, 0); sp.connect(r, 1);
    if (!walls.length) { l.connect(to === toWall ? genRoom : outRoom); r.connect(to === toWall ? genRoom : outRoom); } else for (let w = 0; w < NW; w++) (NW === 1 || w % 2 === 0 ? l : r).connect(to(w));
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
  const voiceBus = G(P.voice, voiceRoom);
  const musicBus = G(P.music), duck = G(1); musicBus.connect(duck); duck.connect(spread(0.22, toMusicWall));   // the voice ducks all music
  const drumBus = G(P.drums, genRoom); drumBus.connect(G(0.25, verbIn));
  // S3: the effects without pitch (fire, shots, crowd) step out of the voice's band: −6 dB round 2.2 kHz (1–4 kHz)
  const fxDip = F('peaking', 2200, 0.6); fxDip.gain.value = -6;
  const fxBus = G(P.effects); series(fxBus, fxDip, spread(0.25));
  // per-wall echo for the festa's hits: a dotted eighth at 100 BPM (0.45 s), on the hand's own wall
  const echoIn = walls.map((_, w) => { const d = ctx.createDelay(1), fb = G(0.34), lp = F('lowpass', 2600), out = G(0.5, toWall(w)), inp = G(1); d.delayTime.value = 0.45; series(inp, d, lp, out); lp.connect(fb); fb.connect(d); return inp; });
  // the tronc's music gate: on the last floor THE MUSIC CUTS DRY
  const tocDrum = G(1, drumBus), tocSub = G(1, outSub);
  const touchSub = G(1, outSub);

  // ---------------------------------------------------------------- files, loaded in the background, normalised to peak 1
  const buffers = new Map(), peaks = new Map(), failed = new Set();
  const load = async (name) => {
    try {
      if (P.lang !== 'es' && VOICE_SET.has(name) && !EN_VOICES.has(name)) { failed.add(name); return; }   // ES_ONLY: no English take (no 404)
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

  // the voice: one line at a time. N3/N4 (25-11, cues.js): a TASK or a CARD cuts the line before; an ACHIEVEMENT waits its turn if
  // the line speaking ends within 1.5 s (else it stays text only); a HINT is dropped if someone speaks. A line that points at a place
  // sounds on that wall (100 %) and softly in the room (25 %). Music ×0.42 and the generative layer ×0.55 while the voice speaks.
  let vo = null;
  const saidThisPass = new Set();   // a line never repeats in a pass (the wait's calls are between passes), unless its cue repeats
  function say(name, { delay = 0.4, polite = false, wall = -1, kind = 'task', once = true } = {}) {
    if (!name) return false;
    if (once && saidThisPass.has(name)) return false;
    const b = buffers.get(name); if (!b || !running()) return false;
    const t = now(); let at = t + delay;
    if (vo && t < vo.end) {
      if (polite || kind === 'hint') return false;
      if (kind === 'ach') { if (vo.end - t > 1.5) return false; at = Math.max(at, vo.end + 0.15); }
      else vo.h.stop(0.15);
    }
    let dest = voiceBus;
    if (wall >= 0 && voiceWall[wall % NW]) { dest = G(1, voiceWall[wall % NW]); dest.connect(G(0.25, voiceBus)); }
    const h = play(name, { gain: L.voice, dest, at }); if (!h) return false;
    vo = { h, end: h.end, name, wall }; if (once && !name.startsWith('v-wait')) saidThisPass.add(name);
    const from = Math.max(t, at - 0.35);
    duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(L.duck, from, 0.15); duck.gain.setTargetAtTime(1, h.end + 0.3, 0.7);
    genDuck.offset.cancelScheduledValues(t); genDuck.offset.setTargetAtTime(L.genDuck, from, 0.15); genDuck.offset.setTargetAtTime(1, h.end + 0.3, 0.7);
    return true;
  }
  const hush = (fade = 0.5) => { if (vo) { vo.h.stop(fade); vo = null; } ramp(duck.gain, 1, 0.3); ramp(genDuck.offset, 1, 0.3); };
  // a cue of the table: once a pass unless it repeats (then its cooldown); its follow-up (`then`) after the line ends
  const cueAt = new Map(); let cueTimers = [];
  // lab only (?cuelog in the page's URL): every cue the script reached, said or not, in window.__cueLog (QA's ×8 pass)
  const CUELOG = typeof location !== 'undefined' && /[?&]cuelog/.test(location.search) ? (globalThis.__cueLog = []) : null;
  function cue(key, evArg = '') {
    const r = resolve(key, S); if (!r) return false;
    const c = r.cue, t = performance.now() / 1000, last = cueAt.get(r.key);
    if (last != null && (!c.repeat || (c.cooldown && t - last < c.cooldown / pace))) return false;
    const wall = cueWall(c, S, evArg);
    let ok = !r.voice;
    if (r.key === 'ach:awake' && r.by === 'colla' && c.colla) say(c.colla, { delay: 0.2, kind: 'ach', once: false });   // «La colla os ayuda.» first
    if (r.voice) ok = say(r.voice, { delay: c.delay ?? 0.3, wall, kind: c.kind || 'task', polite: c.kind === 'hint', once: !c.repeat });
    if (CUELOG) CUELOG.push({ t: Math.round(S.clock * 10) / 10, block: S.block, key: r.key, voice: r.voice, said: ok, wall, text: r.text });
    if (ok) cueAt.set(r.key, t);
    if (ok && c.then) {
      const d = ((buffers.get(r.voice)?.buf.duration ?? 1.5) + (c.delay ?? 0.3) + c.then.after) * 1000;
      cueTimers.push(setTimeout(() => { if (c.then.key === 'aleta:yours' && (crownAt >= 0 || block !== 'pom')) return; cue(c.then.key); }, d));
    }
    return ok;
  }

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
    hz = tuneHz(hz);                                            // D6b: in the chapter's key
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
  const CHROME = [[1, 1, 2.2], [2.41, 0.55, 1.4], [3.87, 0.35, 0.9], [5.93, 0.22, 0.5], [8.12, 0.1, 0.3]];   // a struck metal plate: inharmonic, long

  // ---------------------------------------------------------------- impacts from the visual piece (wave 2 channel)
  // The visual parts post { type: 'fx', fx: 'impact', wall, u (0..1 along the wall), strength 0..1, mat, kind } on
  // BroadcastChannel('ressonancia') when their physical objects are struck, land, break, splash, slide, lock or bloom. Each chapter's
  // matter has its timbre, tuned to the chapter's mode (the stone chapters — brasa, pinya, tronc, fall — D minor pentatonic; the
  // others D major pentatonic); position along the wall → degree; strength → level and brightness. ≤ 14 a second in all, through the
  // hand voices (they share the 12-voice cap); slides ≤ 1 per wall every 0.15 s. Unknown mat → ceramic; unknown kind → silent.
  //   mat:  ceramic (umbral, tronc tiles) · chrome (umbral backs, brasa's liquid) · glass (umbral) · fire (brasa's burning tiles) ·
  //         wire (pinya's wire cubes) · stone (tronc's pieces) · line (pom's line tiles) · petal (pom's gardens)
  //   kind: hit · floor (lands) · break · hook / lock (back in place) · splash (into liquid) · sink · ignite · slide · bloom
  const WIRE = [[1, 1, 0.45], [2.93, 0.55, 0.3], [5.21, 0.35, 0.18], [8.66, 0.2, 0.1], [12.1, 0.1, 0.06]];   // a wire cube: thin, bright, short
  const IMPACT_MAT = { ceramic: CERAMIC, chrome: CHROME, glass: GLASS, wire: WIRE, stone: STONE, line: GLASS, fire: CHROME, petal: GLASS };
  const IMPACT_BASE = { ceramic: 79, chrome: 74, glass: 86, wire: 84, stone: 57, line: 88, fire: 67, petal: 86 };   // MIDI of a strike
  const STONE_BLOCKS = new Set(['brasa', 'pinya', 'tronc', 'fall']);
  const slideAt = walls.map(() => -1);
  let impactWin = 0, impactN = 0, impactRate = 0, impactLast = 0;
  // density: a rain of pieces (the entrance drops ~9 per touch; a group keeps the channel at its cap) must sound like a glass-tile
  // rain, not a machine gun: near-simultaneous impacts on one wall (< 90 ms) join ONE cluster — they add a small tick to its voice
  // instead of a new voice and a new clack; the louder layers (tile clack, body) thin out as the rate rises; pitch and timbre vary
  // with the piece's size (`size` in metres if the part sends it, else a random spread).
  const cluster = walls.map(() => ({ t: -1, g: null, n: 0 }));
  function liquid(at, hz, k, dest) {   // a drop into liquid chrome: a pitch that falls fast, a metal shimmer under it
    const o = osc('sine', hz * 2.2), g = G(0, dest); o.connect(g);
    o.frequency.setValueAtTime(hz * 2.2, at); o.frequency.exponentialRampToValueAtTime(hz * 0.6, at + 0.12);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(k, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0004, at + 0.26);
    o.start(at); o.stop(at + 0.3);
    modal(at + 0.01, hz, k * 0.45, dest, CHROME);
  }
  function scrape(at, dur, k, dest) {  // a slide: band-passed noise, a little gritty
    const n = ctx.createBufferSource(), f = F('bandpass', rand(900, 1700), 2.5), g = G(0, dest); n.buffer = NOISE; series(n, f, g);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(k, at + 0.04); g.gain.linearRampToValueAtTime(0, at + dur);
    n.start(at, Math.random() * 1.5, dur + 0.05);
  }
  function impact(m) {
    if (!running() || !(m.wall >= 0 && m.wall < NW)) return;
    const wt = performance.now() / 1000; if (wt - impactWin > 1) { impactWin = wt; impactN = 0; } if (++impactN > 20) return;
    impactRate = impactRate * Math.exp(-(wt - impactLast) / 1.0) + 1; impactLast = wt;          // impacts in about the last second
    const crowd = 1 / Math.sqrt(1 + impactRate / 4);                                               // 1 alone … ~0.45 at 16/s
    const wallId = walls[m.wall].id, u = clamp(+m.u || 0.5, 0, 1), k = clamp(+m.strength || 0.3, 0, 1), t = now() + 0.004;
    const mat = IMPACT_MAT[m.mat] ? m.mat : 'ceramic', parts = IMPACT_MAT[mat], deg = clamp(Math.floor(u * 5), 0, 4);
    const scale = STONE_BLOCKS.has(S.block) ? MINOR_PENTA : MAJOR_PENTA;
    const size = +m.size > 0 ? +m.size : rand(0.1, 0.35), sizeOct = size > 0.3 ? -12 : size < 0.15 ? 12 : 0;      // big pieces lower, small ones higher
    const mm = IMPACT_BASE[mat] + scale[(deg + Math.floor(Math.random() * 3)) % 5] + (m.kind === 'floor' || m.kind === 'hit' ? sizeOct : 0);
    // a cluster: this wall rang < 90 ms ago — add a tick to that voice, nothing more
    const cl = cluster[m.wall];
    if ((m.kind === 'floor' || m.kind === 'hit' || m.kind === 'hook') && cl.g && wt - cl.t < 0.09 && cl.n < 8) {
      cl.n++; modal(t + rand(0, 0.03), midiHz(mm + 12), (0.004 + 0.008 * k) * P.effects * crowd, cl.g, mat === 'chrome' ? CHROME : mat === 'glass' ? GLASS : CERAMIC);
      return;
    }
    // a burst on one wall cannot pile up: each wall carries a load that decays in ~0.35 s (as the hands do)
    const wl = wallLoad[m.wall]; wl.v *= Math.exp(-(wt - wl.t) / 0.35); wl.t = wt;
    const lvl = P.effects / (1 + 0.04 * Math.max(0, (S.hands || 0) - 3)) / (1 + wl.v) * (S.block === 'fall' ? 0.3 : 1) * crowd; wl.v += 0.7;   // the fall has its own big hits: its debris sits under them
    switch (m.kind) {
      case 'hit': {                  // struck by a hand: a chime of its matter
        const g = handVoice(wallId, u, 3, 0.6);
        modal(t, midiHz(mm), (0.012 + 0.03 * k) * lvl, g, parts); cl.t = wt; cl.g = g; cl.n = 0;
        if (mat === 'fire') play('s-ember-burst', { gain: 0.04 * k * lvl, dest: g, at: t, rate: rand(1.1, 1.4) });
        break;
      }
      case 'floor': {                // it lands
        if (mat === 'glass') { const g = handVoice(wallId, u, 3, 0.9); modal(t, midiHz(mm + 12), (0.005 + 0.012 * k) * lvl, g, GLASS); cl.t = wt; cl.g = g; cl.n = 0; break; }   // a glass shard lands (the dawn's rain)
        if (mat === 'line' || mat === 'petal') { const g = handVoice(wallId, u, 4, 1.4); modal(t, midiHz(mm), (0.004 + 0.01 * k) * lvl, g, GLASS); break; }   // far below, in the canyon
        const g = handVoice(wallId, u, 2.2, 0.35), low = mm - 12;
        if (mat === 'stone') { play('s-ceramic', { gain: (0.02 + 0.05 * k) * lvl, dest: g, at: t, rate: rand(0.45, 0.65) }); modal(t, midiHz(low), (0.015 + 0.035 * k) * lvl, g, STONE); }
        else if (mat === 'wire') { modal(t, midiHz(mm), (0.01 + 0.025 * k) * lvl, g, WIRE); modal(t + 0.004, midiHz(low - 12), 0.015 * k * lvl, g, STONE); }
        else {
          if (k > 0.3 && Math.random() < crowd * 1.4) play('sfx-tile', { gain: (0.02 + 0.06 * k) * lvl, dest: g, at: t, rate: rand(1.0, 1.6) * (size > 0.3 ? 0.8 : 1.15) });   // the clack thins out in a rain
          modal(t, midiHz(low), (0.012 + 0.03 * k) * lvl, g, parts);
        }
        cl.t = wt; cl.g = g; cl.n = 0;
        if (k > 0.4 && crowd > 0.6) drum(t, g, { f0: 140, f1: 70, dur: 0.18, gain: 0.05 * k * lvl, noise: 0.25, sub: 0.15 * k, subDest: touchSub });
        break;
      }
      case 'break': {                // a crack, and the chips scatter
        const g = handVoice(wallId, u, 3, 0.5);
        play('s-crack', { gain: 0.06 * k * lvl, dest: g, at: t, rate: rand(1.3, 1.7) });
        play('sfx-tile', { gain: 0.1 * k * lvl, dest: g, at: t, rate: rand(0.9, 1.2) });
        for (let j = 0; j < 6; j++) modal(t + 0.05 + j * rand(0.04, 0.09), midiHz(86 + scale[Math.floor(Math.random() * 5)]), 0.008 * lvl, g, CERAMIC);
        drum(t, g, { f0: 110, f1: 50, dur: 0.35, gain: 0.06 * k * lvl, noise: 0.3, sub: 0.25 * k, subDest: touchSub });
        break;
      }
      case 'hook': {                 // back on its thread: a tiny glass tick
        modal(t, midiHz(93 + scale[deg]), 0.006 * lvl, handVoice(wallId, u, 2.5, 0.9), GLASS);
        break;
      }
      case 'lock': {                 // a piece locks into place (a floor, a cube going home): a clack in tune
        const g = handVoice(wallId, u, 2, 0.5);
        play('sfx-tile', { gain: (0.02 + 0.05 * k) * lvl, dest: g, at: t, rate: rand(1.3, 1.7) });
        modal(t, midiHz(mm - (mat === 'stone' ? 0 : 12)), (0.01 + 0.025 * k) * lvl, g, mat === 'wire' ? WIRE : mat === 'stone' ? STONE : CERAMIC);
        break;
      }
      case 'splash': {               // into the liquid chrome (brasa): a falling metal drop; a burning one hisses
        const g = handVoice(wallId, u, 2.4, 0.7);
        liquid(t, midiHz(mm - 12), (0.015 + 0.04 * k) * lvl, g);
        if (mat === 'fire') play('s-ember-burst', { gain: (0.03 + 0.05 * k) * lvl, dest: g, at: t + 0.02, rate: rand(0.55, 0.75) });
        break;
      }
      case 'sink': {                 // it goes under: a low glide into the sub
        const g = handVoice(wallId, u, 1.8, 0.3), o = osc('sine', 110), og = G(0, g), os = G(0, touchSub); o.connect(og); o.connect(os);
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 1.2);
        for (const [x, v] of [[og, 0.02], [os, 0.08]]) { x.gain.setValueAtTime(0, t); x.gain.linearRampToValueAtTime(v * k * lvl, t + 0.08); x.gain.exponentialRampToValueAtTime(0.0004, t + 1.3); }
        o.start(t); o.stop(t + 1.4);
        break;
      }
      case 'ignite': {               // it catches fire: an ember burst and a soft low breath
        const g = handVoice(wallId, u, 2.2, 0.5);
        play('s-ember-burst', { gain: (0.04 + 0.08 * k) * lvl, dest: g, at: t, rate: rand(0.7, 0.9) });
        drum(t, g, { f0: 70, f1: 40, dur: 0.6, gain: 0.03 * k * lvl, noise: 0, sub: 0.3 * k, subDest: touchSub });
        break;
      }
      case 'slide': {                // sliding along a deck: a short scrape (strength = speed)
        if (wt - slideAt[m.wall] < 0.15) break; slideAt[m.wall] = wt;
        scrape(t, 0.2 + 0.4 * k, (0.006 + 0.018 * k) * lvl, handVoice(wallId, u, 1, 0.2));
        break;
      }
      case 'bloom': {                // a garden opens (pom): a soft rising glass arpeggio
        const g = handVoice(wallId, u, 4, 1.2);
        for (let j = 0; j < 3; j++) modal(t + j * 0.09, midiHz(86 + MAJOR_PENTA[(deg + j * 2) % 5]), (0.004 + 0.008 * k) * lvl, g, GLASS);
        break;
      }
      default: break;
    }
  }
  function fmHit(at, hz, gain, dest) {   // the festa's resonant hit: FM bell (bright attack, inharmonic shimmer) on a round body
    hz = tuneHz(hz);
    const c = osc('sine', hz), m = osc('sine', hz * 1.41), mg = G(hz * 2.2), g = G(0, dest);
    m.connect(mg); mg.connect(c.frequency); c.connect(g);
    mg.gain.setValueAtTime(hz * 2.2, at); mg.gain.exponentialRampToValueAtTime(hz * 0.05, at + 0.6);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0004, at + 2.4);
    const b = osc('triangle', hz / 2), bg = G(0, dest); b.connect(bg);
    bg.gain.setValueAtTime(0, at); bg.gain.linearRampToValueAtTime(gain * 0.5, at + 0.006); bg.gain.exponentialRampToValueAtTime(0.0004, at + 1.2);
    for (const o of [c, m]) { o.start(at); o.stop(at + 2.5); } b.start(at); b.stop(at + 1.3);
  }
  function voiceNote(at, midi, dur, gain, dest) {   // a low wordless voice: two saws through two formants
    const hz = midiHz(tune(midi)), env = G(0, dest), [v1, v2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const fa = F('bandpass', v1, 5), fb = F('bandpass', v2, 6), mix = G(1); mix.connect(fa); mix.connect(fb); fa.connect(env); fb.connect(G(0.6, env));
    const os = [-6, 6].map((c) => { const o = osc('sawtooth', hz); o.detune.value = c; o.connect(mix); return o; });
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + dur * 0.35); env.gain.setTargetAtTime(0, at + dur * 0.5, dur * 0.18);
    for (const o of os) { o.start(at); o.stop(at + dur * 1.5); }
  }
  // T-050 the pom's three climbs and the acta's handprints
  const WARM = [[1, 1, 1.8], [2.0, 0.22, 0.9], [3.01, 0.07, 0.45]];   // a warm low touch: round, short upper partials
  function gustBurst(at, w) {   // the breath's gust: a band of wind that swells over the wall where the hand moved and falls away
    const n = ctx.createBufferSource(), f = F('bandpass', 500, 0.9), g = G(0, toWall(w)), g2 = G(0, toWall(w + 1)); n.buffer = NOISE; series(n, f, g); f.connect(g2); g.connect(G(0.5, verbIn));
    f.frequency.setValueAtTime(500, at); f.frequency.exponentialRampToValueAtTime(2600, at + 0.35); f.frequency.exponentialRampToValueAtTime(900, at + 1.1);
    for (const [x, k] of [[g, 1], [g2, 0.45]]) { x.gain.setValueAtTime(0, at); x.gain.linearRampToValueAtTime(0.03 * k * P.effects, at + 0.25); x.gain.exponentialRampToValueAtTime(0.0004, at + 1.2); }
    n.start(at, Math.random() * 1.5, 1.3);
  }
  function ah(at, w) {          // the silence broken: a soft contained «ah» of the square, round the wall where it moved
    [57, 62, 66].forEach((m, j) => voiceNote(at + j * 0.05, m, 1.2, 0.007, toWall(w + j - 1)));
  }
  const printAt = walls.map(() => -1);
  function printTouch(at, w, n) {   // a handprint: a soft warm low touch on its wall (a burst of prints on one wall stays soft)
    const close = at - printAt[w] < 0.15; printAt[w] = at;
    modal(at, midiHz(50 + MAJOR_PENTA[n % 5] + (n % 10 >= 5 ? 12 : 0)), close ? 0.012 : 0.024, toWall(w), WARM, 0.6);
    if (!close) drum(at, toWall(w), { f0: 64, f1: 46, dur: 0.7, gain: 0.018, noise: 0, sub: 0.25, subDest: touchSub });
  }
  // T-055 the intro's lamps and the brasa's relay
  const BELL = [[1, 1, 3.2], [2.0, 0.3, 2.2], [2.76, 0.16, 1.4], [5.4, 0.06, 0.6]];   // a small soft bell (a lamp)
  function whoosh(at, from, to, gain, n) {   // a jump: a short fiery breath from one wall to the next, an ember where it lands
    const src = ctx.createBufferSource(), f = F('bandpass', 600, 1.2), ga = G(0, toWall(from)), gb = G(0, toWall(to)); src.buffer = NOISE; series(src, f, ga); f.connect(gb); gb.connect(G(0.3, verbIn));
    f.frequency.setValueAtTime(500, at); f.frequency.exponentialRampToValueAtTime(2400, at + 0.22); f.frequency.exponentialRampToValueAtTime(900, at + 0.4);
    const k = gain * P.effects; ga.gain.setValueAtTime(0, at); ga.gain.linearRampToValueAtTime(k, at + 0.06); ga.gain.linearRampToValueAtTime(0, at + 0.25);
    gb.gain.setValueAtTime(0, at); gb.gain.linearRampToValueAtTime(k, at + 0.18); gb.gain.exponentialRampToValueAtTime(0.0004, at + 0.45);
    src.start(at, Math.random() * 1.5, 0.5);
    play('s-ember-burst', { gain: 0.05, dest: toWall(to), at: at + 0.18, rate: 1.0 + 0.06 * (n % 5) });
  }
  function flare(at, w, n) {   // a corner: the fire flares up — a burst, a rising rush over both walls of the corner, a tuned low stone
    play('s-ember-burst', { gain: 0.15, dest: toWall(w), at, rate: 0.7 }); play('s-ember-burst', { gain: 0.08, dest: toWall(w - 1), at: at + 0.04, rate: 0.8 });
    const src = ctx.createBufferSource(), f = F('bandpass', 300, 0.9), g = G(0, toWall(w)), g2 = G(0, toWall(w - 1)); src.buffer = NOISE; series(src, f, g); f.connect(g2); g.connect(G(0.5, verbIn));
    f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(3200, at + 0.5); f.frequency.exponentialRampToValueAtTime(800, at + 1.3);
    for (const [x, k] of [[g, 1], [g2, 0.5]]) { x.gain.setValueAtTime(0, at); x.gain.linearRampToValueAtTime(0.035 * k * P.effects, at + 0.3); x.gain.exponentialRampToValueAtTime(0.0004, at + 1.4); }
    src.start(at, Math.random() * 0.5, 1.5);
    modal(at + 0.02, midiHz(50 + MINOR_PENTA[n % 5]), 0.04, toWall(w), STONE, 0.5);
    drum(at + 0.02, toWall(w), { f0: 72, f1: 40, dur: 0.9, gain: 0.05, noise: 0.05, sub: 0.4 });
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
    const o = osc('sine', midiHz(tune(62))), og = G(0, dest); o.connect(og); o.frequency.setValueAtTime(midiHz(tune(62)), at); o.frequency.exponentialRampToValueAtTime(midiHz(tune(86)), at + dur);
    og.gain.setValueAtTime(0, at); og.gain.linearRampToValueAtTime(gain * 0.35, at + dur * 0.9); og.gain.linearRampToValueAtTime(0, at + dur + 0.02); o.start(at); o.stop(at + dur + 0.1);
  }
  function bloom(at) {   // the crown: a vast D major chord that opens (detuned saws through a rising low-pass), spread round the room
    const out = spread(0.15), g = G(0, out); g.connect(G(0.8, verbIn)); const lp = F('lowpass', 300, 0.8); lp.connect(g);
    for (const m0 of [38, 50, 57, 62, 66, 69, 74, 78, 81]) for (const c of [-9, 7]) { const m = tune(m0, 'crown'), o = osc('sawtooth', midiHz(m)); o.detune.value = c + rand(-3, 3); o.connect(G(m < 50 ? 0.5 : 0.22, lp)); o.start(at); o.stop(at + 14); }   // in C (m-crown, analysed)
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
        const m = tune(c.notes[Math.floor(Math.random() * c.notes.length)]), rate = (midiHz(m) / GRALLA_HZ) * Math.pow(2, (c.cents + rand(-6, 6)) / 1200);
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
  const droneG = G(0, genRoom), droneSubG = G(0, outSub), dlp = F('lowpass', 480); dlp.connect(droneG);
  const persistent = [];
  for (const [m, type, a] of [[50, 'triangle', 0.5], [57, 'sine', 0.3], [62, 'sine', 0.12]]) { const o = osc(type, midiHz(m)); o.detune.value = (Math.random() - 0.5) * 6; o.connect(G(a, dlp)); o.start(); persistent.push(o); }
  { const o = osc('sine', midiHz(38)); o.connect(droneSubG); o.start(); persistent.push(o); }
  // the pom: a thin thread that rises with the light and flickers when hands move
  const thread = osc('sine', midiHz(tune(74, 'pom'))), threadG = G(0), threadAm = G(1, genRoom); series(thread, threadG, threadAm); threadAm.connect(G(0.8, verbIn)); thread.start(); persistent.push(thread);
  const flick = osc('square', 9), flickG = G(0); series(flick, flickG, threadAm.gain); const flickD = G(0); flick.connect(flickD); flickD.connect(thread.detune); flick.start(); persistent.push(flick);
  // the threshold's start ring: a glass tone that rises D4 → D5 (and a fifth above, faint) as the start ring fills
  const startTone = osc('sine', midiHz(62)), startFifth = osc('sine', midiHz(69)), startG = G(0, genRoom), startF = G(0.35, startG);
  startTone.connect(startG); startFifth.connect(startF); startG.connect(G(0.7, verbIn)); startTone.start(); startFifth.start(); persistent.push(startTone, startFifth);
  // ---- the ROOM MOVEMENTS (the parts move their worlds; the sound follows the score's state that drives them)
  const noiseSrc = () => { const n = ctx.createBufferSource(); n.buffer = NOISE; n.loop = true; n.start(0, Math.random() * 1.5); persistent.push(n); return n; };
  // brasa: the room sinks into the liquid chrome as the ring wakes — a viscous churn (band-passed, breathing) and its body in the sub
  const liqN = noiseSrc(), liqBp = F('bandpass', 420, 2.2), liqG = G(0, genRoom), liqLp = F('lowpass', 120, 3), liqSubG = G(0, outSub);
  series(liqN, liqBp, liqG); liqN.connect(liqLp); liqLp.connect(liqSubG);
  // T-055 brasa, the relay: the running fire — a crackling band of noise on the walls round the devil, louder and brighter the faster it runs
  const runN = noiseSrc(), runBp = F('bandpass', 900, 1.1), runMix = G(1); series(runN, runBp, runMix);
  const runG = walls.map((_, w) => { const g = G(0, toWall(w)); runMix.connect(g); return g; });
  let runCrackle = 0;
  // pinya: the whole pinya turns with the rotllana — a soft rush of bodies that goes round the walls
  const rotTurn = rotor(0, 0.2), turnN = noiseSrc(), turnBp = F('bandpass', 700, 0.8), turnG = G(0, rotTurn.inp); series(turnN, turnBp, turnG);
  // tronc: the elevator beside the tower — a deep stone grind and a low fifth while the room climbs
  const liftN = noiseSrc(), liftBp = F('bandpass', 190, 3), liftG = G(0, genRoom); series(liftN, liftBp, liftG); liftG.connect(G(0.6, outSub));
  const liftO = [osc('sawtooth', midiHz(38)), osc('sawtooth', midiHz(45))], liftLp = F('lowpass', 260, 1.2), liftOG = G(0, genRoom); for (const o of liftO) { o.connect(liftLp); o.start(); persistent.push(o); } series(liftLp, liftOG); liftOG.connect(G(0.8, outSub));
  // pom: 1.6 → 90 m — the city's hum falls away below, the thin air of altitude opens above
  const cityN = noiseSrc(), cityLp = F('lowpass', 260, 0.7), cityG = G(0, outSub), cityBp = F('bandpass', 180, 1.2), cityRoomG = G(0, genRoom); series(cityN, cityLp, cityG); cityN.connect(cityBp); cityBp.connect(cityRoomG);
  const cityO = [osc('sine', midiHz(tune(38, 'pom'))), osc('sine', midiHz(tune(50, 'pom'))), osc('triangle', midiHz(tune(57, 'pom')))], cityOG = G(0, genRoom); cityO.forEach((o, i) => { o.detune.value = (i - 1) * 7; o.connect(G([0.5, 0.35, 0.15][i], cityOG)); o.start(); persistent.push(o); });
  const airN = noiseSrc(), airBp = F('bandpass', 2500, 1.4), airG = G(0, ambDest['s-wind-loop'].inp); series(airN, airBp, airG);
  let mvLiftH = 0, mvLiftV = 0, mvPomP = 0, lastPhrase = '', lastStage = '';
  const structWalls = () => { const a = []; for (let w = 0; w < NW; w++) if (S.walls && S.walls[w]) a.push(w); return a.length ? a : [0, 1]; };
  // the intro's TEAR (INT, T-034): from 46.3 to 57.8 s the host tears the square into slabs of image that turn over and fly
  // (one wave round the room, half of it in ~0.42 of the time). A rip of band-passed noise that wanders, slab clacks and glass
  // glints running round the walls from P4 both ways, a crack and a sub drop at the start; it thins under the motto (53.3 s).
  const TEAR = [46.3, 57.8];
  const tearN = noiseSrc(), tearBp = F('bandpass', 1400, 1.6), tearG = G(0, genRoom); series(tearN, tearBp, tearG); tearG.connect(G(0.5, verbIn));
  let tearCue = 0;
  // ---- colours of the re-made chapters (wave 2): pads that the state opens; silent until their block
  const padOf = (notes, type, lpHz, dest) => { const lp = F('lowpass', lpHz, 0.6), g = G(0, dest); lp.connect(g); notes.forEach((m, i) => { const o = osc(type, midiHz(m)); o.detune.value = (i % 2 ? 1 : -1) * rand(3, 7); o.connect(G(1 / notes.length, lp)); o.start(); persistent.push(o); }); return { g, lp }; };
  // festa (a plate of chrome and glass): a glass-harmonica shimmer in D major that grows with the resonance
  const glassPad = padOf([74, 78, 81, 86].map((m) => tune(m, 'festa')), 'sine', 9000, rotSoar.inp);   // B♭ (st-festa, analysed)
  // the baixada at dawn: lighter, major, airy — an open D (add9) and the air of the morning
  const dawnPad = padOf([62, 69, 76, 78, 81], 'triangle', 1800, genRoom); dawnPad.g.connect(G(0.6, verbIn));
  const dawnN = noiseSrc(), dawnBp = F('bandpass', 5200, 0.9), dawnAir = G(0, ambDest['s-rain-loop'].inp); series(dawnN, dawnBp, dawnAir);
  // the pom's golden haze (p ≈ 0.55–0.65): a high golden chord and a bright breath as the room passes through it
  const hazePad = padOf([86, 90, 93, 98].map((m) => tune(m, 'pom')), 'sine', 12000, ambDest['s-wind-loop'].inp);   // C# (m-pom) hazePad.g.connect(G(0.8, verbIn));
  const hazeN = noiseSrc(), hazeBp = F('bandpass', 4200, 1.1), hazeG = G(0, ambDest['s-wind-loop'].inp); series(hazeN, hazeBp, hazeG);
  // the fall (the assemblage tower collapses): a rumble that dies in ~6 s; the debris itself comes from the part's impacts
  const fallN = noiseSrc(), fallLp = F('lowpass', 90, 0.8), fallSubG = G(0, outSub), fallBp = F('bandpass', 260, 1.4), fallRoomG = G(0, genRoom);
  series(fallN, fallLp, fallSubG); fallN.connect(fallBp); fallBp.connect(fallRoomG);
  // the tronc's creak: a slow click-train through a resonance, one level per wall (its lean), and a low wobble in the sub
  const creakSrc = osc('sawtooth', 26), creakBp = F('bandpass', 420, 5), creakMix = G(1); series(creakSrc, creakBp, creakMix); creakSrc.start(); persistent.push(creakSrc);
  const creakG = walls.map((_, w) => { const g = G(0, toWall(w)); creakMix.connect(g); return g; });
  const wob = osc('sine', 46), wobAm = G(0.5), wobG = G(0, tocSub); series(wob, wobAm, wobG); const wobLfo = osc('sine', 2.3), wobLg = G(0.5); series(wobLfo, wobLg, wobAm.gain); wob.start(); wobLfo.start(); persistent.push(wob, wobLfo);

  // ---------------------------------------------------------------- the tronc's pulse: the score's beat, on the take's downbeat
  function pulse(t0) {
    const at = onGrid('tronc', t0) ?? t0 + 0.03;
    drum(at, tocDrum, { f0: 92, f1: 44, dur: 0.9, gain: 0.18, noise: 0.06, sub: 0.6, subDest: tocSub });
    play('s-timbal', { gain: 0.16, dest: tocDrum, at, rate: timbalRate(38) });   // the timbal's skin, tuned to the tonic (D2; was 50 cents flat)
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
    series(g, ducked(), ...HP(), wi.node); if (verbAmt) g.connect(G(verbAmt, verbIn));   // S3: under the voice like the rest
    voices.push({ g, end: t + ttl });
    setTimeout(() => { try { g.disconnect(); wi.disconnect(); } catch { /* gone */ } }, ttl * 1000 + 300);
    return g;
  }
  // S3: 15 hands = one chord. A new hand takes the degree its place asks for (u → degree, height → octave) unless that degree is
  // already ringing (last 1.2 s): then the free degree farthest from the ringing ones, in the same two octaves.
  const ringing = [];
  function freeDeg(deg, oct) {
    const t = now(); while (ringing.length && t - ringing[0][1] > 1.2) ringing.shift();
    let k = deg + 5 * oct; const used = new Set(ringing.map((r) => r[0]));
    if (used.has(k)) { let best = k, bs = -1e9; for (let c = 0; c < 15; c++) { if (used.has(c)) continue; let md = 99; for (const x of used) md = Math.min(md, Math.abs(x - c)); const sc = md * 10 - Math.abs(c - k); if (sc > bs) { bs = sc; best = c; } } k = best; }
    ringing.push([k, t]); if (ringing.length > 16) ringing.shift();
    return [k % 5, Math.floor(k / 5)];
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
    const [deg, oct] = freeDeg(clamp(Math.floor(u * 5), 0, 4), metres < 0.9 ? 0 : metres < 1.5 ? 1 : 2);
    const far = (k) => { const g = handVoice(e.wallId, u, 2.6, 0.9); play('s-timbal', { gain: 0.12 * k * dense, dest: g, at: t, rate: timbalRate(33) * rand(0.995, 1.005) }); drum(t, G(0, g), { sub: 0.35 * k * dense, gain: 0.1, subDest: touchSub }); };
    if (b === 'wait') far(0.4);                           // softer now: the threshold's tiles answer the hand too (impacts)
    else if (b === 'intro' || b === 'acta') { const g = handVoice(e.wallId, u, 4, 1.2); modal(t, midiHz(74 + MAJOR_PENTA[deg] + 12 * (oct > 1 ? 1 : 0)), 0.012 * dense, g, GLASS); }   // dust: a faint glint
    else if (b === 'brasa') {   // an ember burst; a low thump in the sub — T-055: its pitch by the hand's height (low hands = low notes: the children's)
      const g = handVoice(e.wallId, u, 2.2, 0.5), hk = clamp((metres - 0.5) / 1.4, 0, 1), step = Math.round(hk * 9), m = 38 + 12 * Math.floor(step / 5) + MINOR_PENTA[step % 5];
      play('s-ember-burst', { gain: 0.17 * dense, dest: g, at: t, rate: (0.7 + 0.65 * hk) * rand(0.95, 1.05) });
      drum(t, g, { f0: midiHz(tune(m + 12)), f1: midiHz(tune(m)), dur: 0.7, gain: 0.06 * dense, noise: 0, sub: 0.9 * (1 - 0.5 * hk), subDest: touchSub });
      modal(t + 0.01, midiHz(m + 24), 0.022 * dense, g, STONE, 0.3);   // the tone: D minor pentatonic, two octaves from 0.5 to 1.9 m
    } else if (b === 'pinya') {   // clay and body
      const g = handVoice(e.wallId, u, 1.6, 0.35);
      play('s-clay', { gain: 0.2 * dense, dest: g, at: t, rate: rand(0.85, 1.1) });
      drum(t, g, { f0: 85, f1: midiHz(KEYS.pinya.root - 24), dur: 0.6, gain: 0.07 * dense, noise: 0.02, sub: 0.8, subDest: touchSub });   // lands on A1 (A minor)
    } else if (b === 'tronc' && ph !== 'reward') {   // ceramic and stone, tuned to the stone's mode (D minor pentatonic)
      const g = handVoice(e.wallId, u, 1.6, 0.3), m = 62 + 12 * oct + MINOR_PENTA[deg];
      play('s-ceramic', { gain: 0.1 * dense, dest: g, at: t, rate: midiHz(tune(m + 12)) / 1605 });
      modal(t, midiHz(m), 0.06 * dense, g, CERAMIC);
      if (oct === 0) modal(t, midiHz(m - 12), 0.05 * dense, g, STONE);
    } else if (b === 'pom') {   // glass: very soft, high, long
      const g = handVoice(e.wallId, u, 4.5, 1.1);
      modal(t, midiHz(81 + MAJOR_PENTA[deg] + 12 * (oct > 1 ? 1 : 0)), 0.025 * dense, g, GLASS);
    } else if (b === 'festa' || b === 'crown') {   // a tuned resonant hit, and its echo on the beat's dotted eighth
      const g = handVoice(e.wallId, u, 3, 0.45), m = 62 + 12 * oct + MAJOR_PENTA[deg];
      fmHit(t, midiHz(m), 0.05 * dense * (oct === 2 ? 0.7 : 1), g);
      play('s-ceramic', { gain: 0.05 * dense, dest: g, at: t, rate: midiHz(tune(m + 24)) / 1605 });
      g.connect(G(0.6, echoIn[w] || outRoom));
      if (oct === 0) drum(t, G(0, g), { sub: 0.3 * dense, gain: 0.12, f0: midiHz(tune(m - 12)), f1: midiHz(tune(m - 12)) * 0.9, dur: 0.8, subDest: touchSub });
    } else if (b === 'baixada') {   // a shard falls into the hand
      const g = handVoice(e.wallId, u, 2.5, 0.6);
      play('s-ceramic', { gain: 0.08 * dense, dest: g, at: t, rate: rand(0.6, 1.3) });
      modal(t, midiHz(74 + MAJOR_PENTA[deg] - 12 * (oct === 0 ? 1 : 0)), 0.03 * dense, g, GLASS);
    }
  });

  // ---------------------------------------------------------------- the score's events
  let block = S.block, introCue = 0, bellsCue = 0, crownAt = -1, crownMusic = false, bloomUntil = -1, actaCue = 0;
  let nextHeart = 0, lastHandClock = -1e9, waitSaid = -1e9, pace = 1, festaIn = false, gustUntil = 0;
  // the visual's tile transition (INT, T-028: res-obra3d/experience.js › MOVES): on every block change the whole room breaks into tiles
  // and locks into the next world; its peak lands at 0.15 s + half the move's duration. A band-passed swell rises round the walls into
  // that peak, where the tiles lock in (a tile clack and a glass glint per wall, a soft deep hit). Quieter where the music already hits.
  const TILE_DUR = { intro: 4.2, brasa: 3.8, pinya: 3.8, tronc: 3.8, pom: 4.0, crown: 3.6, festa: 3.4, baixada: 4.2, fall: 2.6, acta: 4.0, wait: 4.0 };
  const TILE_GAIN = { intro: 1, brasa: 0.8, pinya: 0.8, tronc: 0.8, pom: 1, crown: 0.45, festa: 0.6, baixada: 0.9, fall: 0.3, acta: 1, wait: 0.9 };
  function tileSweep(b) {
    if (!running()) return;
    const t = now(), pk = t + (0.15 + (TILE_DUR[b] || 3.8) / 2) / pace, k = (TILE_GAIN[b] ?? 0.8) * P.effects;
    for (let w = 0; w < NW; w++) {
      const a = t + 0.08 + w * 0.05, n = ctx.createBufferSource(), f = F('bandpass', 300, 1.3), g = G(0, toWall(w));
      n.buffer = NOISE; n.loop = true; series(n, f, g); g.connect(G(0.5, verbIn));
      f.frequency.setValueAtTime(260, a); f.frequency.exponentialRampToValueAtTime(5200, pk); f.frequency.exponentialRampToValueAtTime(900, pk + 1.4);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.016 * k, pk - 0.04); g.gain.exponentialRampToValueAtTime(0.0005, pk + 1.5);
      n.start(a, Math.random() * 1.5); n.stop(pk + 1.6);
      play('sfx-tile', { gain: 0.055 * k, dest: toWall(w), at: pk + w * 0.035, rate: rand(0.9, 1.3) });
      modal(pk + w * 0.035, midiHz(86 + MAJOR_PENTA[(w * 2) % 5]), 0.011 * k, toWall(w), GLASS, 0.8);
    }
    drum(pk, drumBus, { f0: 90, f1: 40, dur: 0.9, gain: 0.045 * k, noise: 0.05, sub: 0.28 * k });
  }
  function enterBlock(b) {
    const prev = block; block = b; const t = now();
    if (b === 'intro' || b === 'wait') { saidThisPass.clear(); cueAt.clear(); callAt = -1; nearSaid = false; }
    for (const k of [...cueAt.keys()]) if (k.startsWith('assist:') || k === 'relay:assist') cueAt.delete(k);   // «La colla os ayuda»: once per block
    musicBus.gain.setTargetAtTime(P.music, t, 0.3);   // a tronc's wobble may have left the music down
    if (prev !== b) { for (const v of voices) v.g.gain.setTargetAtTime(0, t, 0.12); voices.length = 0; ringing.length = 0; }   // D6b: the old key's notes let go before the new key's
    if (prev !== b) tileSweep(b);
    // what leaves: each set as its world closes (the festa lets its drums go first, the rest under the baixada)
    for (const name of Object.keys(sets)) {
      if (!sets[name].want) continue;
      const keep = (name === b) || (b === 'crown' && name === 'crown') || (b === 'festa' && (name === 'festa' || name === 'crown')) || (b === 'baixada' && name === 'festa');
      if (!keep) musicOff(name, name === 'intro' ? 6 : name === 'brasa' ? 6 : name === 'pinya' ? 5 : name === 'pom' ? 1.5 : name === 'crown' ? 6 : 3);
    }
    for (const c of Object.values(clouds)) c.on = false;
    if (prev === 'tronc' || b === 'tronc') uncut();
    if (b === 'intro') { introCue = 0; bellsCue = 0; tearCue = 0; musicOn('intro', { offset: 0, fade: 0.5 }); drum(t + 0.05, drumBus, { f0: 70, f1: 34, dur: 2, gain: 0.1, noise: 0, sub: 1 }); }
    else if (b === 'brasa') musicOn('brasa', { fade: 6 });
    else if (b === 'pinya') { musicOn('pinya', { fade: 6 }); layer('pinya', 'bass', 0.5, 0.1); layer('pinya', 'other', 0.1, 0.1); }
    else if (b === 'tronc') { arpN = 0; }
    else if (b === 'pom') { musicOn('pom', { fade: 10 }); }
    else if (b === 'crown') crown();
    else if (b === 'festa') { if (!sets.festa.want) festaStart(); }   // the voice: cue block:festa
    else if (b === 'baixada') {                                        // the voice: cue block:baixada (v-baixada-1, back since 25-11)
      layer('festa', 'drums', 0, 0.8); layer('festa', 'bass', 0.3, 2); sets.festa.lp.frequency.setTargetAtTime(900, t, 2.5);
      setTimeout(() => { if (block === 'baixada') musicOff('festa', 8); }, 2500);
      musicOn('baixada', { fade: 5 });
    } else if (b === 'fall') {
      for (const name of Object.keys(sets)) musicOff(name, 0.4);
      play('s-impact', { gain: 0.3, at: t + 0.02 }); play('sfx-fall', { gain: 0.3, at: t + 0.1 });
      drum(t + 0.03, drumBus, { f0: 70, f1: 30, dur: 1.8, gain: 0.2, noise: 0.05, sub: 0.7 });   // sub 0.9 → 0.7 (24-11): the collapse's rumble and debris now sit under it
    } else if (b === 'acta') { actaCue = 0; musicOn('acta', { offset: 0, fade: 2 }); }
    if (b !== 'crown') { crownAt = -1; crownMusic = false; }
    if (b !== 'festa' && b !== 'crown' && b !== 'baixada') festaIn = false;
  }
  function festaStart() { festaIn = true; musicOn('festa', { fade: 6 }); layer('festa', 'bass', 0.6, 0.1); layer('festa', 'other', 0.45, 0.1); layer('festa', 'drums', 0, 0.1); setNow(sets.festa.lp.frequency, 700); }
  function crownMusicStart(offset) { if (crownMusic) return; crownMusic = true; musicOn('crown', { offset, fade: 0.05, level: 0.75 }); }
  // l'aleta's swell: band-passed noise opening 0.3 → 4 kHz and a low saw rising D3 → D4 through an opening low-pass, over the window;
  // cut in 30 ms when the group crowns (the crown's release lands on that instant)
  let swell = null, aletaYoursT = 0;
  function aletaSwell(dur) {
    if (!running()) return; swell?.stop(now());
    const t = now(), n = ctx.createBufferSource(), f = F('bandpass', 300, 1.2), g = G(0, spread(0.1)), o = osc('sawtooth', midiHz(50)), lp = F('lowpass', 400, 0.8), og = G(0, spread(0.2));
    n.buffer = NOISE; n.loop = true; series(n, f, g); series(o, lp, og); g.connect(G(0.5, verbIn));
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + dur);
    o.frequency.setValueAtTime(midiHz(50), t); o.frequency.exponentialRampToValueAtTime(midiHz(62), t + dur); lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * P.effects, t + dur); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.02 * P.music, t + dur);
    n.start(t); o.start(t);
    let done = false;
    const stop = (at) => { if (done) return; done = true; for (const x of [g.gain, og.gain]) { x.cancelScheduledValues(at); x.setValueAtTime(x.value, at); x.linearRampToValueAtTime(0, at + 0.03); } try { n.stop(at + 0.1); o.stop(at + 0.1); } catch { /* stopped */ } };
    swell = { stop }; setTimeout(() => stop(now()), (dur + 2) * 1000);   // never longer than the window (+2 s)
  }
  function crown() {   // l'aleta: the release, the bloom, the square roars, the voice; the festa's music comes in from below
    if (crownAt >= 0 || !running()) return; const t = now(); crownAt = t; keyBlock = 'crown';   // the crown sounds in C (m-crown)
    swell?.stop(t); swell = null;
    crownMusicStart(CROWN_IMPACT - 0.05);      // the release of m-crown lands on the trigger (the group's, or the window's end)
    bloom(t + 0.02);
    const wide = clamp(S.aletaWidth || 0.5, 0.15, 1);   // wider (more glints, louder) the more hands rose and the sooner
    for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.09, midiHz(86 + MAJOR_PENTA[w % 5]), 0.03 + 0.03 * wide, toWall(w), GLASS, 0.8);
    if (wide > 0.5) for (let w = 0; w < NW; w++) modal(t + 0.12 + w * 0.07, midiHz(93 + MAJOR_PENTA[(w + 2) % 5]), 0.02 * wide, toWall(w + 2), GLASS, 0.9);
    if (play('sfx-crown', { gain: 0.24, dest: fxIn['s-crowd-loop'] || fxBus, at: t + 0.4 })) rotCrowd.speed = 0.12;
    if (aletaYoursT) { clearTimeout(aletaYoursT); aletaYoursT = 0; }   // crowned before the second line: it is not needed
    keyBlock = null;   // the voice: cue ach:crown («¡Coronado!») and its follow-up «El castell está coronado.»
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
    // the title's line: cue title:<block>
    if (block === 'tronc' && p === 'play') {   // the take starts on the play's first instant: its next downbeat is the score's first pulse
      musicOn('tronc', { at: t + 0.03, offset: GRID_A, fade: 0.05 });
      layer('tronc', 'bass', 0.65, 0.05); layer('tronc', 'drums', 0, 0.05); layer('tronc', 'other', 0, 0.05); setNow(sets.tronc.lp.frequency, 1800);
    } else if (block === 'tronc' && p === 'reward') cutDry();
    else if (block === 'pom' && p === 'aleta') aletaSwell((T.aleta?.window || 8) / pace);   // the voice: cue aleta (+0.6 s «Levantad la vuestra»)   // l'aleta (24-11): the group decides when; a swell rises under the window, the crown lands on the trigger
    else if (block === 'pinya' && p === 'reward') { play('s-crack', { gain: 0.26, at: t + 4.5 }); riser(t + 2.5, 2, 0.03); }
  }
  let callAt = -1, nearSaid = false;
  function onEvent(ev) {
    const i = ev.indexOf(':'), k = i < 0 ? ev : ev.slice(0, i), arg = i < 0 ? '' : ev.slice(i + 1), t = now();
    if (k === 'block') enterBlock(arg);
    if (k === 'phase') enterPhase(arg);
    // N4: the script (cues.js) — after the block / phase has been entered, so a line sees its world
    const ck = cueKey(ev, S); if (ck) { try { cue(ck, arg); } catch (e) { console.error('ressonancia-sound: cue', ev, e); } }
    if (ev === 'stage:brasa:call') callAt = S.clock; else if (k === 'ach' && arg === 'wave') callAt = -1;
    if (k === 'block' || k === 'phase' || k === 'hint' || k === 'stage' || k === 'assist' || k === 'focus') return;
    if (k === 'tg') return targetSound(arg, t);
    if (k === 'abandon') { hush(1); for (const name of Object.keys(sets)) musicOff(name, 3); for (const c of Object.values(clouds)) c.on = false; for (const h of [...live]) if (!h.name.endsWith('-loop')) h.stop(2); return; }
    if (!running()) return;
    if (k === 'reveal') {   // the start button is whole: a glass chord goes round the walls over a soft low breath (the voice: cue reveal)
      for (let w = 0; w < NW; w++) for (const [j, d] of [[0, 0], [1, 7], [2, 16]]) modal(t + 0.05 + w * 0.18 + j * 0.06, midiHz(74 + d), 0.03, toWall(w), GLASS, 0.9);
      drum(t + 0.05, drumBus, { f0: 62, f1: 36, dur: 2.2, gain: 0.05, noise: 0, sub: 0.35 });
      return;
    }
    if (k === 'start') {    // the ring blows apart: a burst of glass round the room (the intro's deep hit follows at once)
      for (let w = 0; w < NW; w++) { play('sfx-tile', { gain: 0.08, dest: toWall(w), at: t + 0.02 + w * 0.03, rate: rand(1.2, 1.6) }); for (let j = 0; j < 4; j++) modal(t + 0.03 + w * 0.03 + j * rand(0.05, 0.12), midiHz(86 + MAJOR_PENTA[(w + j) % 5]), 0.018, toWall(w), GLASS, 0.9); }
      setNow(startG.gain, 0, t + 0.2);
      return;
    }
    // ---- II. Pinya, gather (24-11): a wall packs — the crowd closes in there (a low wordless voice, a soft clay thump)
    if (k === 'pack') { const w = +arg; voiceNote(t + 0.02, [45, 50, 52, 57][w % 4], 2.6, 0.03, toWall(w)); play('s-clay', { gain: 0.07, dest: toWall(w), at: t, rate: 0.6 }); return; }
    // ---- III. Tronc, lift and level (24-11)
    if (k === 'lift') { for (const w of structWalls()) modal(t + 0.02, midiHz(62 + MINOR_PENTA[(S.floors + 2) % 5]), 0.02, toWall(w), CERAMIC, 0.5); return; }
    if (k === 'level') { for (const w of structWalls()) modal(t + 0.15, midiHz(81), 0.012, toWall(w), GLASS, 0.8); return; }
    if (k === 'wobble') {   // it trembles: the music goes, the trencadís cracks, a low rumble (the creak follows the lean)
      musicBus.gain.setTargetAtTime(0.12 * P.music, t, 0.12); play('s-crack', { gain: 0.14, dest: toWall(S.wobbleWall >= 0 ? S.wobbleWall : 0), at: t + 0.02, rate: 0.7 });
      drum(t + 0.03, drumBus, { f0: 48, f1: 30, dur: 3, gain: 0.06, noise: 0.03, sub: 0.45 }); return;
    }
    if (k === 'steady') { musicBus.gain.setTargetAtTime(P.music, t, 0.6); drum(t + 0.02, drumBus, { f0: 70, f1: 36, dur: 1.4, gain: 0.14, noise: 0.03, sub: 0.6 }); return; }   // relief
    if (k === 'slip') {   // it loses a floor: a crack and the tiles slide down
      musicBus.gain.setTargetAtTime(P.music, t + 0.6, 0.8); play('s-crack', { gain: 0.18, at: t + 0.01, rate: 0.6 });
      for (let j = 0; j < 5; j++) play('sfx-tile', { gain: 0.06, dest: toWall((S.wobbleWall >= 0 ? S.wobbleWall : 0) + (j % 2)), at: t + 0.1 + j * 0.13, rate: 1.2 - j * 0.1 });
      return;
    }
    // ---- la bajada, bring it down (24-11)
    if (k === 'lower') { for (let j = 0; j < 3; j++) modal(t + 0.05 + j * 0.16, midiHz(86 - [0, 5, 10][j]), 0.02, toWall(S.descents + j), GLASS, 0.9); drum(t + 0.05, drumBus, { f0: 60, f1: 40, dur: 1.2, gain: 0.04, noise: 0, sub: 0.25 }); return; }
    if (k === 'crack') {  // abrupt, or let go: it cracks and shards spill
      play('s-crack', { gain: 0.12, at: t + 0.01, rate: rand(0.8, 1.1) });
      for (let j = 0; j < 6; j++) modal(t + 0.06 + j * rand(0.04, 0.1), midiHz(86 + MAJOR_PENTA[Math.floor(Math.random() * 5)]), 0.01, toWall(j), CERAMIC, 0.6);
      drum(t + 0.02, drumBus, { f0: 90, f1: 40, dur: 0.6, gain: 0.06, noise: 0.2, sub: 0.3 }); return;
    }
    // ---- IV. Pom (T-050): the relay's glass bell on the wall that receives her (when she lands); the breath's gust; the silence's «ah»
    if (k === 'handoff') {
      const H = S.pomHandoff || {}, w = +arg, fly = H.from ? (T.pom.relay?.fly || 1.5) / pace : 0, n = S.pomHandoffs || 0;
      modal(t + 0.02 + fly, midiHz(H.back ? 79 : 86 + MAJOR_PENTA[n % 5]), H.back ? 0.012 : 0.024, toWall(w), GLASS, 0.9);
      if (H.from && !H.back) modal(t + 0.02, midiHz(74 + MAJOR_PENTA[n % 5]), 0.006, toWall(H.from.wall), GLASS, 0.7);   // she leaves: a faint note under the old hand
      return;
    }
    if (k === 'falter') { modal(t + 0.02, midiHz(80), 0.007, toWall(S.lightWall >= 0 ? S.lightWall : 0), GLASS, 0.5); return; }   // unsure
    if (k === 'gust') { gustUntil = t + 1.6; gustBurst(t + 0.01, +arg || 0); return; }
    if (k === 'hush') { ah(t + 0.02, +(arg.split(':')[1]) || 0); return; }   // 'hush:break:w'
    if (k === 'print') { printTouch(t + 0.01, +arg || 0, (S.prints || []).length); return; }
    // ---- T-055 intro: a hand lights the nearest lamp — a soft bell on that wall, in the intro's key (D major pentatonic)
    if (k === 'lamp') {
      const L0 = S.lamp || {}, w = +arg || 0, n = L0.n || 0, many = Math.sqrt(Math.max(1, (S.lamps || []).length)), hi = (L0.y || 1) > 1.5 ? 12 : 0;
      modal(t + 0.02, midiHz(62 + hi + MAJOR_PENTA[n % 5]), 0.02 / many, toWall(w), BELL, 1.0);
      modal(t + 0.03, midiHz(50 + MAJOR_PENTA[n % 5]), 0.008 / many, toWall(w), WARM, 0.6);
      return;
    }
    // ---- T-055 Brasa, the relay: a whoosh per jump, a flare per corner, the devils that come to fetch it, the whole lap
    if (k === 'relay') {
      const R = S.relay || {};
      if (arg === 'jump') { const J = R.jump || {}; whoosh(t + 0.01, J.from ?? R.holderWall ?? 0, J.to ?? R.holderWall ?? 0, 0.022, R.jumps || 0); }
      else if (arg === 'start') { play('s-ember-burst', { gain: 0.12, dest: toWall(R.holderWall >= 0 ? R.holderWall : 0), at: t + 0.01, rate: 0.85 }); }
      else if (arg === 'assist') { const w = R.holderWall >= 0 ? R.holderWall : 0; for (let j = 0; j < 3; j++) play('s-ember-burst', { gain: 0.05, dest: toWall(w + j - 1), at: t + 0.05 + j * 0.18, rate: rand(1.2, 1.5) }); play('s-tabals', { gain: 0.035, dest: toWall(w), at: t + 0.1, rate: 1.25 }); }
      else if (arg === 'lap') {   // the trail goes all the way round: a flare on every wall and a deep landing
        for (let w = 0; w < NW; w++) { play('s-ember-burst', { gain: 0.14, dest: toWall(w), at: t + 0.02 + w * 0.12, rate: 0.75 }); modal(t + 0.04 + w * 0.12, midiHz(50 + MINOR_PENTA[w % 5]), 0.03, toWall(w), STONE, 0.5); }
        drum(t + 0.02 + NW * 0.12, drumBus, { f0: 76, f1: 36, dur: 1.5, gain: 0.12, noise: 0.04, sub: 0.5 });
      }
      return;
    }
    if (k === 'corner') { const C = (S.relay && S.relay.corner) || {}; flare(t + 0.01, C.wall ?? 0, (S.relay && S.relay.corners) || 0); return; }
    if (k === 'call') {   // the brasa's call (24-11): timbal tok… tok… TOK, gap s apart; the TOK on the answering wall (or all four)
      const C = S.call || {}, g = (C.gap || 0.8) / pace, from = C.from || 0, to = C.to ?? from;
      for (let j = 0; j < 2; j++) { play('s-timbal', { gain: 0.09, dest: toWall(from), at: t + 0.01 + j * g, rate: timbalRate(38) }); drum(t + 0.01 + j * g, toWall(from), { f0: 110, f1: 70, dur: 0.25, gain: 0.03, noise: 0.05 }); }
      const tokAt = t + 0.01 + 2 * g, tw = to < 0 ? [...Array(NW).keys()] : [to];
      for (const w of tw) play('s-timbal', { gain: 0.16 / Math.sqrt(tw.length), dest: toWall(w), at: tokAt, rate: timbalRate(33) });
      drum(tokAt, drumBus, { f0: 82, f1: 44, dur: 0.6, gain: 0.08, noise: 0.06, sub: 0.3 });
      return;
    }
    // ---- V. la ressonància (24-11): fronts that cross the room, echoes returned an octave up, the room's ghost return
    if (k === 'front' || k === 'echo' || k === 'ghost') {
      const f = (S.fronts || [])[S.fronts.length - 1]; if (!f) return;
      const travel = Math.max(0.3, (f.arrive - S.clock) / pace), m = 62 + 12 * Math.min(2, f.gen) + MAJOR_PENTA[(f.from + f.gen) % 5];
      if (k !== 'front') fmHit(t + 0.01, midiHz(m), (k === 'ghost' ? 0.018 : 0.028), toWall(f.from));                 // the return, an octave up per rebound
      // the front crossing: a soft band of noise that leaves one wall and arrives at the other, and a glint on arrival
      const n = ctx.createBufferSource(), bp = F('bandpass', 900 + 500 * f.gen, 1.5), ga = G(0, toWall(f.from)), gb = G(0, toWall(f.to)); n.buffer = NOISE; n.loop = true; n.connect(bp); bp.connect(ga); bp.connect(gb);
      const k0 = (0.006 + 0.004 * Math.min(3, f.gen)) * P.effects;
      ga.gain.setValueAtTime(k0, t); ga.gain.linearRampToValueAtTime(0, t + travel); gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(k0 * 1.3, t + travel); gb.gain.linearRampToValueAtTime(0, t + travel + 0.4);
      n.start(t, Math.random()); n.stop(t + travel + 0.5);
      modal(t + travel, midiHz(m + 12), 0.012, toWall(f.to), GLASS, 0.8);
      return;
    }
    if (k === 'wave' && (S.block === 'brasa' || S.block === 'festa') && S.waveBig === false) {   // a missed call: a small wave, one tabal, and the room will call again
      play('s-tabals', { gain: 0.06, dest: toWall((S.call && S.call.from) || 0), at: t + 0.03, rate: 0.9 });
      return;
    }
    if (k === 'wave') {   // the correfoc's tabals run round the room from the busiest wall, and land deep
      let from = 0, best = -1; S.count.forEach((c, w) => { if (c > best) { best = c; from = w; } });
      const t0 = nextTick(t + 0.03);   // D6b: in the festa the wave leaves on the take's next 16th (the music is quantised, never the people)
      for (let j = 0; j < NW; j++) play('s-tabals', { gain: 0.13 * (0.55 + 0.45 * (j / Math.max(1, NW - 1))), dest: toWall(from + j), at: t0 + j * 0.16, rate: 1 - j * 0.03 });
      drum(t + 0.03 + NW * 0.16 + 0.35, drumBus, { f0: 80, f1: 36, dur: 1.4, gain: 0.12, noise: 0.05, sub: 0.45 });
    } else if (k === 'awake') {   // the ring wakes: a reverse swell into a deep hit; the fire then sinks into earth
      const r = play('s-impact', { gain: 0.14, reverse: true, at: t + 0.05 });
      const land = r ? r.end : t + 5;
      drum(land, drumBus, { f0: 78, f1: 34, dur: 1.8, gain: 0.18, noise: 0.04, sub: 0.6 });
      for (let w = 0; w < NW; w++) modal(land + w * 0.04, midiHz([50, 57, 62, 45][w % 4]), 0.05, toWall(w), STONE, 0.6);
    } else if (k === 'wall') { const w = +arg; voiceNote(t + 0.02, [50, 57, 53, 45][w % 4], 3.4, 0.045, toWall(w)); play('s-clay', { gain: 0.12, dest: toWall(w), at: t, rate: 0.7 }); }
    else if (k === 'close') { clouds.circle.on = true; rotCircle.speed = 0.35; }   // the voice: cue ach:close (+ the structure's name)
    else if (k === 'pulse') pulse(t);
    else if (k === 'floor') {
      play('sfx-tile', { gain: 0.16, dest: toWall(S.floors), at: t + 0.02 });
      const at = onGrid('tronc', t + 0.3, 1.3) ?? t + 0.05;       // the floor rings on a downbeat
      modal(at, midiHz(62 + MINOR_PENTA[S.floors % 5] + 12 * Math.floor(S.floors / 5)), 0.06, toWall(S.floors + 1), CERAMIC, 0.5);
    } else if (k === 'climber') { if (+arg < 2) { riser(t, 2.2, 0.025, fxIn['s-wind-loop'] || fxBus); gustUntil = t + 2.6; } }   // T-050: the silence comes in without a riser
    else if (k === 'arrived' && +arg === 2) modal(t + 0.02, midiHz(98), 0.008, toWall(S.lightWall >= 0 ? S.lightWall : 0), GLASS, 1);   // the enxaneta at the top: one glint, then 1.5 s of silence
    else if (k === 'arrived') {   // a glass chord on the wall where she arrived
      const w = S.lightWall >= 0 ? S.lightWall : 0, base = [81, 86, 93][clamp(+arg, 0, 2)];
      for (const [j, d] of [[0, 0], [1, 7], [2, 12]]) modal(t + 0.02 + j * 0.07, midiHz(base + d), 0.035, toWall(w), GLASS, 0.9);
      heart(t + 0.05, 0.1);
    } else if (k === 'crown') crown();
    else if (k === 'bloom') {   // the room flowers: everything opens for 5 s, bells round the walls, the crowd swells
      const size = S.bloomSize > 0 ? S.bloomSize : 0.6;            // 24-11: the final bloom, always; its size by how together they were
      bloomUntil = t + (S.bloomDur > 0 ? S.bloomDur / pace : 5);
      for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.12, midiHz(86 + MAJOR_PENTA[w % 5]), 0.02 + 0.03 * size, toWall(w), GLASS, 0.8);
      if (size > 0.6) for (let w = 0; w < NW; w++) modal(t + 0.3 + w * 0.1, midiHz(93 + MAJOR_PENTA[(w + 2) % 5]), 0.025 * size, toWall(w + 1), GLASS, 0.9);
      drum(t + 0.02, drumBus, { f0: 70, f1: 36, dur: 1.6, gain: 0.05 + 0.06 * size, noise: 0, sub: 0.2 + 0.3 * size });
      ambLevel('s-crowd-loop', L.crowd * 1.8, 0.3);
    } else if (k === 'down') {   // a floor comes down: a tile, and a falling note on the next wall round
      play('sfx-tile', { gain: 0.14, dest: toWall(S.floors), at: t + 0.02 });
      const m = 74 + MAJOR_PENTA[S.floors % 5] - 12 * (S.floors < 3 ? 1 : 0);
      modal(t + 0.03, midiHz(m), 0.05, toWall(S.floors + 1), GLASS, 0.7);
    }
  }

  // ---- the targets (05-plan §2.6, D3b): the charge's first hand → a click without pitch AT ONCE on its wall; active → a note of the
  // chapter's scale on the take's next 16th (tronc, festa) or at once; done → a soft low settle. Pitch by the target's link in its chain.
  const tgClickAt = new Map();
  function targetSound(arg, t) {
    const j = arg.indexOf(':'), what = j < 0 ? arg : arg.slice(0, j), id = j < 0 ? '' : arg.slice(j + 1);
    if (what !== 'charge' && what !== 'active' && what !== 'done') return;
    const T0 = (S.targets || []).find((x) => String(x.id) === id); if (!T0 || !(T0.wall >= 0 && T0.wall < NW)) return;
    const W = walls[T0.wall], u = clamp(typeof T0.dx === 'number' ? 0.5 + T0.dx / (W.width || 4) : (T0.s - (wallS0[T0.wall] || 0)) / (W.width || 4), 0, 1), wid = W.id;
    const n = (T0.link || 0) + (T0.chain || 0) * 2, hi = (T0.y || 1.2) > 1.4 ? 12 : 0;
    if (what === 'charge') {
      const wt = performance.now() / 1000; if (wt - (tgClickAt.get(id) ?? -9) < 0.6) return; tgClickAt.set(id, wt);
      if (tgClickAt.size > 64) tgClickAt.clear();
      const g = handVoice(wid, u, 0.6, 0.2), src = ctx.createBufferSource(), f = F('bandpass', 4200, 2.2), e = G(0, g); src.buffer = NOISE; series(src, f, e);
      e.gain.setValueAtTime(0, t + 0.002); e.gain.linearRampToValueAtTime(0.05 * P.effects, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0004, t + 0.05);
      src.start(t + 0.002, Math.random() * 1.5, 0.06);
      return;
    }
    const stone = STONE_BLOCKS.has(S.block), sc = stone ? MINOR_PENTA : MAJOR_PENTA;
    if (what === 'active') {
      const at = nextTick(t + 0.01), m = 74 + hi + sc[n % 5] + 12 * (Math.floor(n / 5) % 2);
      const g = handVoice(wid, u, 3.5, 0.9);
      modal(at, midiHz(m), 0.03, g, stone ? CERAMIC : GLASS, 0.6);
      modal(at + 0.004, midiHz(m - 12), 0.012, g, WARM);
    } else modal(t + 0.02, midiHz(62 + sc[(n + 2) % 5]), 0.012, handVoice(wid, u, 2, 0.6), WARM, 0.4);
  }
  // ---------------------------------------------------------------- what follows the state, every step
  function follow(dt) {
    const t = now(), b = block, ph = S.phase, prog = S.progress || 0, on = running();
    if (S.hands > 0) lastHandClock = S.clock;
    // the voice by the clock: the intro's lines, the waiting call, the acta's lines
    const IV = (T.intro || TIMES.intro || 70) <= 50 ? INTRO_AT : INTRO_AT_70;   // N9: the 45 s intro's clock once the score's intro is 45 s
    if (b === 'intro') while (introCue < IV.length && S.t >= IV[introCue][0]) cue(IV[introCue++][1]);
    if (b === 'wait' && S.hands === 0) { const gone = S.clock - lastHandClock; if (gone >= WAIT_AFTER && gone <= WAIT_RECENT && S.clock - waitSaid >= WAIT_EVERY) { waitSaid = S.clock; if (WAIT_VOICES && (S.reveal || 0) < 1) say('v-wait-invite', { polite: true, delay: 0.2 }); } }
    if (b === 'acta') while (actaCue < ACTA_CUES.length && S.t >= ACTA_CUES[actaCue][0]) cue(ACTA_CUES[actaCue++][1]);   // print · outcome · final
    if (b === 'brasa' && callAt >= 0 && S.stage === 'brasa:call' && S.clock - callAt > CALL_LATE) { callAt = -1; cue('call:late'); }
    if (b === 'pom' && !nearSaid && S.pomStage === 'silence' && (S.climb || 0) > 0.7) { nearSaid = true; cue('pom:near'); }
    if (!on) return;
    musicKeep(); ambKeep();
    // the threshold: as play reveals the button, glass motes gather (more and brighter); the start ring raises a glass tone
    if (b === 'wait') {
      const rv = S.reveal || 0;
      if (rv > 0.04 && rv < 1 && Math.random() < dt * (0.4 + 5 * rv)) { const w = Math.floor(Math.random() * NW); modal(t + 0.01, midiHz(86 + MAJOR_PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0)), (0.004 + 0.012 * rv) * P.effects, toWall(w), GLASS, 1); }
      const st = S.start || 0;
      startTone.frequency.setTargetAtTime(midiHz(62) * Math.pow(2, st), t, 0.15); startFifth.frequency.setTargetAtTime(midiHz(69) * Math.pow(2, st), t, 0.15);
      startG.gain.setTargetAtTime(st > 0.01 ? (0.006 + 0.03 * st) * P.effects : 0, t, 0.2);
    } else if (startG.gain.value > 0) startG.gain.setTargetAtTime(0, t, 0.3);
    // the intro's bells: far away (the far wall) at the start, again lower as the tower dissolves
    if (b === 'intro') {
      if (bellsCue === 0 && S.t >= 2.5) { bellsCue = 1; const h = play('s-bells', { gain: 0.13, dest: toWall(Math.floor(NW / 2)), rate: 0.947 }); h?.g.connect(G(0.9, verbIn)); }
      if (tearCue === 0 && S.t >= TEAR[0] && S.t < TEAR[1]) {
        tearCue = 1;
        play('s-crack', { gain: 0.11, dest: fxBus, at: t + 0.01, rate: 0.8 });
        drum(t + 0.02, drumBus, { f0: 62, f1: 30, dur: 2.2, gain: 0.08, noise: 0.08, sub: 0.55 });
        const g = tearG.gain, e = P.effects; g.cancelScheduledValues(t); g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(0.03 * e, t + 1.2); g.linearRampToValueAtTime(0.024 * e, t + 5.5);
        g.linearRampToValueAtTime(0.008 * e, t + 7.0); g.linearRampToValueAtTime(0.006 * e, t + 10.5); g.linearRampToValueAtTime(0, t + 11.8);
      }
      if (tearCue === 1 && S.t >= TEAR[0] && S.t < TEAR[1]) {
        const x = S.t - TEAR[0], span = TEAR[1] - TEAR[0];
        tearBp.frequency.setTargetAtTime(rand(500, 3200), t, 0.05);
        const rate = 9 * Math.exp(-(((x - 2.2) / 2.2) ** 2)) + 1.5 * (x < 7 ? 1 : 0.3);
        if (Math.random() < dt * rate) {
          const front = Math.min(1, x / (0.42 * span)), w = Math.round((Math.random() < 0.5 ? 1 : -1) * front * (NW / 2)) % NW;
          if (Math.random() < 0.6) play('sfx-tile', { gain: rand(0.015, 0.04) * (x > 7 ? 0.5 : 1), dest: toWall(w), at: t + 0.01, rate: rand(0.75, 1.4) });
          else modal(t + 0.01, midiHz(rand(79, 91)), 0.01 * (x > 7 ? 0.5 : 1), toWall(w), GLASS, 0.8);
        }
      }
      if (tearCue === 1 && S.t >= TEAR[1]) { tearCue = 2; for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.1, midiHz(74 + MAJOR_PENTA[(w * 2) % 5]), 0.014, toWall(w), GLASS, 1); }   // the last slab settles: the title
      if (bellsCue === 1 && S.t >= TEAR[0]) { bellsCue = 2; const h = play('s-bells', { gain: 0.09, dest: toWall(0), rate: 0.71 }); h?.g.connect(G(1, verbIn)); }
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
    // T-050: the silence is near nothing (the bed almost gone, a held tone, the heart); she arrives → 1.5 s of silence → l'aleta
    const sil = pom && S.pomStage === 'silence' && ph !== 'aleta' ? (ph === 'reward' ? 2 : 1) : 0, br = pom && S.pomStage === 'breath' ? clamp(S.pomBreath || 0, 0, 1.25) : 0;
    if (pom) layer('pom', 'bed', sil === 2 ? 0 : sil ? 0.06 : ph === 'aleta' ? 0.7 : 0.6 + 0.4 * prog, sil === 2 ? 0.12 : sil ? 1.2 : 1.5);
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
      's-wind-loop': pom ? L.wind * (sil === 2 ? 0 : sil ? 0.15 : ph === 'reward' ? 0.3 : (0.5 + 0.5 * prog) * (br ? 0.6 + 0.4 * br : 1)) * (t < gustUntil ? 1.7 : 1) : 0,
      's-rain-loop': b === 'baixada' ? L.rain * (0.6 + 0.4 * prog) : 0,
      's-crowd-loop': b === 'festa' ? L.crowd * (bl ? 1.8 : 0.35 + 0.9 * res) : b === 'crown' ? L.crowd * 0.8 : 0,
    };
    for (const [name, v] of Object.entries(A)) ambLevel(name, v, name === 's-fire-loop' && ph === 'reward' ? 0.8 : name === 's-wind-loop' && t < gustUntil ? 0.4 : 1.4);
    if (amb['s-wind-loop'].lp) amb['s-wind-loop'].lp.frequency.setTargetAtTime(1500 + 9000 * prog, t, 1);

    // ---- a crowd of hands shares the sub: their thumps get lighter as the room fills (the walls keep their attacks)
    touchSub.gain.setTargetAtTime(1 / Math.sqrt(Math.max(1, (S.hands || 0) / 3)), t, 0.3);
    // ---- the tronc's phrase (24-11): when the hands start to lift, a soft ceramic line rises round the tower's walls (D minor pentatonic)
    if (b === 'tronc' && ph === 'play' && S.phrase === 'rise' && lastPhrase !== 'rise' && !(S.wobble > 0)) {
      const sw = structWalls();
      for (let j = 0; j < 4; j++) modal(t + 0.05 + j * 0.55, midiHz(62 + MINOR_PENTA[(j + (S.floors || 0)) % 5] + (j >= 3 ? 12 : 0)), 0.01 + 0.003 * j, toWall(sw[j % Math.max(1, sw.length)] ?? j), CERAMIC, 0.4);
      riser(t + 0.1, 2.3, 0.012, fxBus);
    }
    lastPhrase = S.phrase;
    // the pinya's call: when the figures start to lead the hands to the centre (and the group has not packed yet)
    lastStage = S.pinyaStage;
    // ---- the room movements
    {
      const brasa = b === 'brasa', sink = brasa && ph !== 'title' ? clamp(prog * 1.15, 0, 1) : 0;
      liqG.gain.setTargetAtTime(0.02 * sink * P.effects, t, 1.5); liqSubG.gain.setTargetAtTime(0.12 * sink * P.effects, t, 1.5);
      liqBp.frequency.setTargetAtTime(300 + 260 * (0.5 + 0.5 * Math.sin(t * 0.4)), t, 0.8);
      if (sink > 0.1 && Math.random() < dt * (0.3 + 1.2 * sink)) { const w = Math.floor(Math.random() * NW); liquid(t + 0.01, midiHz(rand(38, 50)), 0.012 * sink * P.effects, toWall(w)); }   // a slow bubble
      // T-055 the relay's running fire, on the devil's wall (and the next one near a corner)
      const R = S.relay, relayOn = brasa && S.brasaStage === 'relay' && R && !R.done && ph !== 'reward';
      const sp = relayOn ? clamp((R.speed || 0) / 1.2, 0, 1.5) : 0, lvl = relayOn ? (0.004 + 0.02 * Math.min(1, sp)) * P.effects : 0;
      if (relayOn && R.perimeter > 0 && R.holderWall >= 0) {
        const L0 = walls.map((x) => x.width || 4), s0 = L0.reduce((a, l, w) => { a.push(w ? a[w - 1] + L0[w - 1] : 0); return a; }, []);
        const into = (R.s - s0[R.holderWall]) / L0[R.holderWall], nx = into > 0.85 ? (into - 0.85) / 0.3 : 0, pv = into < 0.15 ? (0.15 - into) / 0.3 : 0;
        for (let w = 0; w < NW; w++) runG[w].gain.setTargetAtTime(lvl * (w === R.holderWall ? 1 - nx - pv : w === (R.holderWall + 1) % NW ? nx : w === (R.holderWall + NW - 1) % NW ? pv : 0), t, 0.12);
        runBp.frequency.setTargetAtTime(700 + 900 * Math.min(1, sp) + (R.assist ? 500 : 0), t, 0.2);
        runCrackle += dt * (1 + 6 * Math.min(1, sp));
        if (runCrackle > 1) { runCrackle = rand(0, 0.5); play('s-ember-burst', { gain: 0.025 + 0.03 * Math.min(1, sp), dest: toWall(R.holderWall), at: t + 0.01, rate: rand(1.1, 1.5) }); }
      } else for (const g of runG) g.gain.setTargetAtTime(0, t, 0.3);
      const turning = b === 'pinya' && (S.closed || 0) >= 1 ? (ph === 'reward' ? clamp(1 - S.tp / 7, 0, 1) : 1) : 0;
      turnG.gain.setTargetAtTime(0.018 * turning * P.effects, t, 1.2); rotTurn.speed = 0.04 + 0.04 * turning;
      const h = (S.floors || 0) + (S.floorProgress || 0), climbing = b === 'tronc' && ph === 'play';
      mvLiftV += ((climbing ? Math.max(0, (h - mvLiftH) / Math.max(dt, 1e-3)) : 0) - mvLiftV) * (1 - Math.exp(-dt / 1.2)); mvLiftH = h;
      const lk = climbing ? clamp(0.25 + mvLiftV * 2.5, 0, 1) : 0;
      liftG.gain.setTargetAtTime(0.03 * lk * P.effects, t, climbing ? 0.8 : 0.012); liftOG.gain.setTargetAtTime(0.012 * lk * P.effects, t, climbing ? 0.8 : 0.012);   // the reward's dry cut takes it too
      liftLp.frequency.setTargetAtTime(180 + 30 * h, t, 1); liftBp.frequency.setTargetAtTime(150 + 12 * h, t, 1);
      const pomOn = (b === 'pom' && ph !== 'reward' ? 1 : b === 'pom' ? 0.4 : 0) * (sil === 2 ? 0 : sil ? 0.3 : 1), ht = pom ? prog : 0;
      const below = pomOn * Math.pow(1 - ht, 1.6);
      cityG.gain.setTargetAtTime(0.1 * below * P.effects, t, 1.5); cityRoomG.gain.setTargetAtTime(0.03 * below * P.effects, t, 1.5); cityOG.gain.setTargetAtTime(0.01 * below * P.effects, t, 1.5);
      cityLp.frequency.setTargetAtTime(120 + 200 * (1 - ht), t, 1.5);
      airG.gain.setTargetAtTime((0.003 + 0.022 * ht) * pomOn * (S.pomStage === 'breath' ? 0.5 + 0.7 * br : 1) * P.effects, t, S.pomStage === 'breath' ? 0.6 : 1.5);   // T-050: the breath's air rises with the stillness airBp.frequency.setTargetAtTime(2200 + 5000 * ht, t, 1.5);
      if (pom) { ambDest['s-wind-loop'].phase -= (prog - mvPomP) * (45 / 360); }   // the wind field turns with the world's 45°
      mvPomP = pom ? prog : 0;
      // the re-made chapters' colours
      const fe = (b === 'festa' ? clamp(S.resonance || 0, 0, 1) : 0) * P.music;
      glassPad.g.gain.setTargetAtTime(0.004 * (fe > 0 ? 1 : 0) + 0.016 * fe, t, 0.8); glassPad.lp.frequency.setTargetAtTime(3000 + 9000 * fe, t, 0.8);
      const dawn = b === 'baixada' ? clamp(0.3 + 0.7 * prog, 0, 1) : b === 'acta' ? clamp(1 - S.t / 8, 0, 1) * 0.5 : 0;
      dawnPad.g.gain.setTargetAtTime(0.012 * dawn * P.music, t, 2.5); dawnPad.lp.frequency.setTargetAtTime(1200 + 2400 * dawn, t, 2);
      dawnAir.gain.setTargetAtTime(0.006 * dawn * P.effects, t, 2.5);
      const haze = pom ? Math.exp(-(((prog - 0.6) / 0.06) ** 2)) : 0;
      hazePad.g.gain.setTargetAtTime(0.014 * haze * P.music, t, 0.6); hazeG.gain.setTargetAtTime(0.01 * haze * P.effects, t, 0.6);
      const fk = b === 'fall' ? Math.exp(-S.t / 2.2) * clamp(S.t / 0.15, 0, 1) : 0;
      fallSubG.gain.setTargetAtTime(0.08 * fk * P.effects, t, 0.15); fallRoomG.gain.setTargetAtTime(0.02 * fk * P.effects, t, 0.15);
    }
    // ---- the drone
    const drone = b === 'wait' ? 0.03 : b === 'brasa' ? 0.015 : b === 'tronc' && ph === 'title' ? 0.035 : b === 'baixada' ? 0.012 : b === 'fall' ? 0.02 : 0;
    if (!(b === 'tronc' && ph === 'reward')) { droneG.gain.setTargetAtTime(drone * 0.9, t, 1.2); droneSubG.gain.setTargetAtTime(drone * 1.3, t, 1.2); }
    // ---- the pom: the thread rises D5 → D6 with the three climbers and flickers when hands move
    thread.frequency.setTargetAtTime(midiHz(tune(74, 'pom')) * Math.pow(2, prog), t, 0.4);
    threadG.gain.setTargetAtTime(sil === 2 ? 0 : sil ? 0.012 : pom && ph === 'play' ? 0.01 + 0.025 * prog : 0, t, sil === 2 ? 0.08 : 0.3);   // T-050: in the silence the thread is a held tone
    const flk = pom && S.restless && !sil && (S.pomStage !== 'relay' || (S.pomFalter || 0) > 0);
    flickG.gain.setTargetAtTime(flk ? 0.7 : 0, t, 0.08); flickD.gain.setTargetAtTime(flk ? 25 : 0, t, 0.08);
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
  if (bc) bc.onmessage = (ev) => { const m = ev.data; if (m?.type === 'fx') { if (m.fx === 'impact') { try { impact(m); } catch (e) { console.error('ressonancia-sound: fx', e); } } return; } if (m?.type !== 'ctl') return; if (m.pace > 0) pace = Math.min(32, m.pace);
    // rehearsal / QA (25-11): { say: '<cue key>', wall } speaks a cue's line now on that wall (-1 = room), outside the once-a-pass rule
    if (m.say) { const r = resolve(m.say, S); if (r && r.voice) say(r.voice, { delay: 0.05, wall: m.wall ?? cueWall(r.cue, S, ''), kind: 'task', once: false }); } if (m.jump) score.jump(m.jump); if (m.times && typeof m.times === 'object') { try { applyTimes(T, m.times, TIMES); } catch (e) { console.error('ressonancia-sound: times', e); } } };
  const lastPos = new Map(), hands = [], handPool = [];
  const wallS0 = walls.reduce((a, w, i) => { a.push(i ? a[i - 1] + (walls[i - 1].width || 4) : 0); return a; }, []);   // where each wall starts along the perimeter (m)
  let last = performance.now();
  const timer = setInterval(() => {
    const wallNow = performance.now(), dt = clamp((wallNow - last) / 1000, 0, 0.25), wt = wallNow / 1000; last = wallNow;
    // the hands as the score wants them: wall index, metres from the wall's centre, a speed from each stroke's own movement
    hands.length = 0; const seen = new Set();
    for (const h of vt.hands()) {
      const w = wallIdx.get(h.wallId); if (w == null) continue;
      const W = walls[w], x = h.u * (W.width || 4), y = h.v * (W.height || 3);
      let p = lastPos.get(h.stroke);
      if (!p) { p = { x, y, t: wt, speed: 0, vx: 0, vy: 0 }; lastPos.set(h.stroke, p); }
      else if (wt - p.t >= 0.09) { const d = wt - p.t; p.vx = (x - p.x) / d; p.vy = (y - p.y) / d; p.speed = Math.hypot(p.vx, p.vy); p.x = x; p.y = y; p.t = wt; }
      // the score's hand (plan de interacción, step 0): height from the floor, velocity, size and place on the perimeter, in metres
      const o = handPool[hands.length] || (handPool[hands.length] = {});
      o.stroke = h.stroke; o.wall = w; o.dx = (h.u - 0.5) * (W.width || 4); o.y = y; o.vx = p.vx; o.vy = p.vy; o.speed = p.speed;
      o.size = h.size > 0 ? h.size : 0.12; o.s = wallS0[w] + h.u * (W.width || 4);
      seen.add(h.stroke); hands.push(o);
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
      for (const v of voiceWall) v.gain.setTargetAtTime(P.voice, t, 0.1);
    },
    async stop() {
      clearInterval(timer); off?.(); try { bc?.close(); } catch { /* closed */ }
      for (const x of cueTimers) clearTimeout(x); cueTimers = [];
      const t = now();
      for (const h of [...live]) h.stop(0.3);
      for (const name of Object.keys(sets)) musicOff(name, 0.3);
      for (const c of Object.values(clouds)) c.on = false;
      for (const g of [glassPad.g, dawnPad.g, dawnAir, hazePad.g, hazeG, fallSubG, fallRoomG, droneG, droneSubG, threadG, wobG, startG, liqG, liqSubG, turnG, liftG, liftOG, cityG, cityRoomG, cityOG, airG, ...creakG]) ramp(g.gain, 0, 0.1, t);
      for (const o of persistent) { try { o.stop(t + 1); } catch { /* done */ } }
      try { genDuck.stop(t + 1.2); } catch { /* stopped */ }
      setTimeout(() => { for (const wi of [...wallIn, ...musicWallIn, ...voiceWallIn]) wi.disconnect(); }, 1500);
    },
  };
}
