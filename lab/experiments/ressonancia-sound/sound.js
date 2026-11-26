// Ressonància — the sound piece (contract: experiences/SOUND-API.md). The whole 10-minute work, as GUION.md writes it.
//
// It runs the work's SCORE (score.js: an identical copy of ressonancia/score.js — a piece may only import from its own folder;
// keep the two files identical) and LEADS: sound hears a hand land at once, and the pulse must be the music's.
//
//   LOCAL WORKAROUND, clearly marked: the runtime has no channel between a visual piece and its sound piece. Every window of the
//   app loads from the same origin, so this piece posts the score's state on a BroadcastChannel ('ressonancia') after every
//   step — { type: 'state', ts, pace, s: { ...state, events }, acta } — and the visual follows it. It also accepts
//   { type: 'ctl', pace?, jump?, times?, lang? } (rehearsal: run the score's clock faster, go to a block). Without the channel both pieces still
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
import { applyTimes } from './tuning.js';
import { createBrasaSound } from '../ressonancia/scenes3d/parts/brasa3d/brasa2-sound.js';   // 26-11: the correfoc v2's fire (Personaje's synthesis), fed by the visual piece   // T-052: the visual piece sends the room's thresholds (ctl.times)

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
// studio 26-11 (Beltrán's approved script): the TRAILER's intro — what castells are, welcome, what the work is, its stages, how far the
// trailer climbs, hands on the wall. EN / ES / CA recorded 26-11 (audio/voice-lines-trailer-intro2.json; Lily · Mía Evans · Gabriel,
// eleven_v4): 7.5 · 2.5 · 5.9 · 13.5 · 5.4 · 2.1 s (ES and CA within ±0.4 s, the same cues). The trailer asks for it (ctl intro: 'trailer').
const INTRO_TRAILER = [[1.5, 'v-intro-1'], [8.6, 'v-trl-2'], [17, 'v-trl-welcome'], [21, 'v-trl-what'], [28.5, 'v-trl-stages'], [43.5, 'v-trl-preview']];   // 26-11 (Beltrán approved): no «Put your hands on the wall» at 50.5 s — the correfoc asks for them, 5 s later
// studio 26-11 (Beltrán): the trailer's correfoc opens by teaching — a strip of light, a first correfoc lights every bonfire — while
// the voice says it: 4.3 · 2.7 · 4.3 s (ES / CA within 0.5 s); from the block's start (brasa v2's opening times: strip 0.5, boom 4.2, run 5–12)
const BRASA_TRAILER = [[0.5, 'v-brasa2-1'], [5.0, 'v-brasa2-2'], [9.0, 'v-brasa2-3']];
// the pinya (pinya3d2) and the tower (torre3d, block 'tronc') open the same way, 26-11: 4.4 · 3.3 · 1.9 s and 2.5 · 3.7 s (ES / CA ≤ 0.5 s
// shorter); the tower's «hold the golden light» (3.7 s) is said when the part is ready for it (the trailer sends ctl say)
// 26-11 (Beltrán approved, sonido-trailer): the closing after the tower (block 'acta', ~18 s): the work's last line, then the thanks
const TRAILER_CUES = { brasa: BRASA_TRAILER, pinya: [[0.5, 'v-pinya2-1'], [5.5, 'v-pinya2-2'], [11, 'v-pinya2-3']], tronc: [[0.5, 'v-torre-1'], [3.5, 'v-torre-2']], acta: [[3, 'v-cierre-final'], [10.5, 'v-thanks']] };
const TRAILER_SAY = ['v-torre-gold'];
// The trailer's own lines (audio/voice-lines-trailer-invites.json): the big moments (boom, full) and the INVITATIONS when nobody plays —
// one at most every INVITE_GAP s, never over another voice, after INVITE_IDLE s without hands (or a specific need: a wall left empty,
// a fire going out), at most INVITE_MAX in a block until a hand comes back. A wall's own invitation is said FROM that wall.
const TRAILER_LINES = ['v-inv-wait', 'v-inv-asleep', 'v-brasa-awake', 'v-inv-brasa', 'v-inv-fire', 'v-inv-missing', 'v-pinya-holds', 'v-inv-climb', 'v-inv-gold', 'v-thanks'];
const REPEATABLE = new Set(['v-inv-missing', 'v-inv-fire', 'v-inv-asleep', 'v-inv-wait']);   // (and the v-wait-* lines): a pass may say them again
const INVITE_IDLE = 12, INVITE_GAP = 20, INVITE_MAX = 3;
// THE KEY (Beltrán 26-11: «lo que suena en el mismo nivel, si tiene altura, en el mismo key»). Measured offline (chroma of every file,
// Krumhansl–Schmuckler, keys.py in the session notes): in the trailer every pitched sound of a block is snapped to its scale
// (root MIDI, degrees). Bridges between blocks: D and A are in every scale.
//   block   base music (trailer)   measured (see TRAILER_SETS)     scale
//   wait    — (the D/A drone)                                     D major pentatonic (D E F# A B)
//   intro   tm-intro               D, no third (D A B C G)         D G A B C
//   brasa   tm-brasa               D mixolydian (D A C F# E B)     D E A (the fire's drone: no third, no seventh)
//   pinya   st-tpinya-*            A major (A E C#)                A major pentatonic (A B C# E F#)
//   tronc   st-ttronc-*            D major (D A F# C#)             D major pentatonic
//   crown   tm-crown (+2 st)       C major → D major               D major pentatonic
//   acta    tm-acta                D major (D G A)                 D E G A B
const KEYS = {
  wait: [62, [0, 2, 4, 7, 9]], intro: [62, [0, 5, 7, 9, 10]], brasa: [62, [0, 2, 7]], pinya: [57, [0, 2, 4, 7, 9]],
  tronc: [62, [0, 2, 4, 7, 9]], crown: [62, [0, 2, 4, 7, 9]], acta: [62, [0, 2, 5, 7, 9]],
};
const KEYS_MT = {   // the mt set's keys (measured by its session): pinya in A MINOR, the tower on D E G A C, brasa on D with an F#
  wait: [62, [0, 2, 4, 7, 9]], intro: [62, [0, 2, 4, 7, 9]], brasa: [62, [0, 4, 7]], pinya: [57, [0, 3, 5, 7, 10]],
  tronc: [62, [0, 2, 5, 7, 10]], crown: [62, [0, 2, 4, 7, 9]], acta: [62, [0, 2, 4, 7, 9]],
};
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
// 26-11 (Beltrán: «que sea cool, moderno, una experiencia de new media; nada de trompetitas»): the TRAILER has its own music, made with
// ElevenLabs for it (audio/music-prompts.json › trailer): contemporary electronic, born in each block's key. When the trailer says so
// (ctl intro: 'trailer') these replace the sets of the same name; the whole work keeps SETS.
// Measured (offline: level per second, chroma, a comb over the onset flux):
//   tm-intro   56.0 s  D (D A B C G, no F#: D mixolydian-sus)  rises out of silence 0–6 s, ≈ −11 dB, gone by 55 s: plays through
//   tm-brasa   64.0 s  D (D A C F# E B: D mixolydian)           steady −8 dB rms: loops 4–60 s
//   tm-pinya   76.8 s  A MAJOR (A E C#; asked for A minor)       75 BPM, 24 bars of 3.2 s; stems bass / drums / other (the rest silent)
//   tm-tronc   76.8 s  D major (D A F# C#), 99.98 BPM, first beat 0.023 s; stems: drums all through, the bass only from 19 s,
//                      `other` loud 0–26 s and 67–77 s → it loops bars 8–31 (19.2–74.4 s), where all three play
//   tm-crown   22.0 s  C MAJOR (asked for D major): played 2 semitones UP (rate 1.1225 → D major); its release hits at 6.05 s
//   tm-acta    20.0 s  D major (D G A); peaks at 6 s, −45 dB by 15 s, silent by 19 s: plays through (the closing is 18 s)
const TBAR = 2.4, TGRID0 = 0.023;
const TRAILER_SETS = {
  intro: { db: -2, layers: { m: 'tm-intro' }, once: true, lift: 3 },
  brasa: { db: -1.5, layers: { bed: 'tm-brasa' }, a: 4, b: 60, xf: 3, first: 0, lift: 2 },
  pinya: { db: -2, layers: { bass: 'st-tpinya-bass', drums: 'st-tpinya-drums', other: 'st-tpinya-other' }, a: 3.2, b: 73.6, xf: 3, first: 0, lift: 3 },
  tronc: { db: 2.5, layers: { bass: 'st-ttronc-bass', drums: 'st-ttronc-drums', other: 'st-ttronc-other' }, a: TGRID0 + 8 * TBAR, b: TGRID0 + 31 * TBAR, first: TGRID0 + 8 * TBAR, xf: 0.25, grid: true, grid0: TGRID0, trim: 2 },
  crown: { db: 0, layers: { m: 'tm-crown' }, once: true, lift: 2, rate: 1.1225, impact: 6.05 },
  acta: { db: -2, layers: { m: 'tm-acta' }, once: true, lift: 3 },
};
// …and a second set to compare by ear (26-11, the session «Música del tráiler», audio/music-prompts-trailer.json; keys / tempo / loops
// measured there): param musicSet 'mt' (default 'tm', the one above). It adds music for the entrance (wait).
const SETS_MT = {
  wait: { db: -9, layers: { bed: 'mt-wait' }, a: 10.68, b: 75.56, xf: 4, first: 0, lift: 2 },                       // D pentatonic, no pulse
  intro: { db: 0.5, layers: { m: 'mt-intro' }, once: true, lift: 2 },                                                // D major; beat opens 16.1 s, quiets 48-58 s
  brasa: { db: -1, layers: { bed: 'mt-brasa' }, a: 6, b: 70, xf: 0.25, first: 0, grid: true, grid0: 0, lift: 4 },  // D centre (F# present), 120 BPM, 32 bars
  pinya: { db: -1, layers: { bed: 'mt-pinya' }, a: 5.06, b: 59.92, xf: 1, first: 0, lift: 4 },                     // A minor, 70 BPM, 16 bars
  tronc: { db: -1, layers: { bass: 'mt-tronc-bass', other: 'mt-tronc-other' }, a: 21.0, b: 69.0, xf: 0.25, first: 0, grid: true, grid0: 0, lift: 4 },   // D (D E G A C), 100 BPM, 20 bars; 'other' = arps, with the floors
  crown: { db: 7, layers: { m: 'mt-crown' }, once: true, impact: 4.0 },                                            // D open chord, the bloom at ~4.0 s
  acta: { db: -1, layers: { m: 'mt-acta' }, once: true },                                                           // D major, black by ~16.5 s
};
const CROWN_IMPACT = 4.0;                    // m-crown: the reverse swell ends and the release hits at 4.0 s (measured)
const AMBIENCE = ['s-embers-loop', 's-fire-loop', 's-breath-loop', 's-wind-loop', 's-rain-loop', 's-crowd-loop'];
const SHOTS = ['s-bells', 's-tabals', 's-ember-burst', 's-clay', 's-ceramic', 's-impact', 's-crack', 's-gralla', 's-timbal', 'sfx-crown', 'sfx-fall', 'sfx-tile'];
const VOICES = [...new Set([...(WAIT_VOICES ? ['v-wait-invite', 'v-wait-start'] : []), ...new Set([...INTRO_VOICE, ...INTRO_TRAILER, ...Object.values(TRAILER_CUES).flat()].map((c) => c[1])), ...TRAILER_SAY, ...TRAILER_LINES, ...Object.values(TITLE_LINE), 'v-brasa-2', 'v-brasa-3', 'v-pinya-3', 'v-tronc-2',
  'v-pom-2', 'v-pom-3', 'v-aleta-2', ...Object.values(OUTCOME_LINE), 'v-cierre-final', 'v-tronc-wobble', 'v-aleta-raise', 'v-aleta-yours', 'v-aleta-crowned', 'v-baixada-gently', 'v-pinya-closein', 'v-pinya-wait'])];
const FILES = [...new Set([...Object.values(SETS).flatMap((s) => Object.values(s.layers)), ...AMBIENCE, ...SHOTS, ...VOICES])];
const filesOf = (sets) => [...new Set(Object.values(sets).flatMap((s) => Object.values(s.layers)))];   // a trailer set's files: loaded once the trailer asks for it
const VOICE_SET = new Set(VOICES);
// 25-11 (studio, for res-trailer): the Catalan voice (Gabriel - Clear Catalan, eleven_v4; audio/ca/voice-lines-ca.json) has only these lines
const VOICE_CA = new Set(['v-wait-invite', 'v-wait-start', 'v-intro-1', 'v-intro-2', 'v-intro-3', 'v-intro-4', 'v-intro-5', 'v-brasa-1', 'v-brasa-2', 'v-brasa-3', 'v-aleta-2', 'v-cierre-final', ...INTRO_TRAILER.map((c) => c[1]), ...Object.values(TRAILER_CUES).flat().map((c) => c[1]), ...TRAILER_SAY, ...TRAILER_LINES, 'v-aleta-crowned', 'v-pinya-wait']);
const GROUP = (name) => (name.startsWith('st-') ? name.split('-').slice(0, 2).join('-') : name.startsWith('mt-tronc-') ? 'mt-tronc' : name);   // stems share one normalisation
const GRALLA_HZ = 415;                       // s-gralla's pitch (G#4, measured): grains are tuned from it

// Levels in one place (files are normalised to peak 1 at load). Measured in the lab's simulated room: see NOTES.md.
const L = {
  voice: 0.34, duck: 0.5,                  // duck: the music under a voice (−6 dB, soft: Beltrán 26-11)
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
  const { audio } = host;
  // 26-11: the trailer's simulated visitors (its param sim.visitors) reach the sound too, over the shared channel: their hands join
  // vt.hands() and their landings call the 'touch' listeners as 'down' events (a test tool; nothing changes without them)
  const vt = Object.create(host.vt), simTouch = []; let simH = [], simAt = -1e9, simBc = null;
  try { simBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { simBc = null; }
  if (simBc) simBc.onmessage = (ev) => { const m = ev.data; if (m?.type !== 'sim' || !Array.isArray(m.h)) return; simH = m.h; simAt = performance.now();
    for (const d of m.d || []) for (const fn of simTouch) { try { fn({ type: 'down', id: d.stroke, trackerId: d.stroke, ...d }); } catch (e) { console.error('ressonancia-sound: sim', e); } } };
  vt.hands = () => { const r = host.vt.hands(); return simH.length && performance.now() - simAt < 1000 ? r.concat(simH) : r; };
  vt.on = (type, fn) => { if (type !== 'touch') return host.vt.on(type, fn); simTouch.push(fn); const off = host.vt.on(type, fn); return () => { const i = simTouch.indexOf(fn); if (i >= 0) simTouch.splice(i, 1); off?.(); }; };
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
  // the trailer (ctl intro: 'trailer'): its cues, its music, its key
  let block = S.block, introSet = null;
  const trailer = () => introSet === 'trailer';
  // THE KEY (see KEYS): in the trailer a pitched sound snaps to the nearest note of its block's scale
  const keyOf = () => (introSet === 'trailer' ? (P.musicSet === 'mt' ? KEYS_MT : KEYS)[block] || null : null);
  function snapM(m) {
    const k = keyOf(); if (!k) return m;
    const r = Math.round(m), pc = (((r - k[0]) % 12) + 12) % 12; let best = 0, bd = 99;
    for (const d of k[1]) for (const x of [d - 12, d, d + 12]) { const dd = Math.abs(x - pc); if (dd < bd || (dd === bd && x - pc < best)) { bd = dd; best = x - pc; } }
    return r + best;
  }
  const snapHz = (hz) => (keyOf() && hz > 0 ? midiHz(snapM(69 + 12 * Math.log2(hz / 440))) : hz);
  const keyNote = (deg, oct = 0) => { const k = keyOf() || [62, MINOR_PENTA]; const n = k[1].length, i = ((deg % n) + n) % n; return k[0] + k[1][i] + 12 * (oct + Math.floor(deg / n)); };   // a degree of the block's scale

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
  const voiceWall = walls.map((_, w) => G(P.voice, toWall(w)));   // 26-11: a wall's own invitation is said from that wall («en ESTE muro…»)
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
      const file = !VOICE_SET.has(name) || P.lang === 'en' ? name : P.lang === 'ca' && VOICE_CA.has(name) ? `ca/${name}` : `es/${name}`;   // the voice in the chosen language (25-11: Catalan for the trailer's lines; the rest falls back to Spanish)
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
  const saidThisPass = new Set();   // a line never repeats in a pass (the wait's calls are between passes)
  function say(name, { delay = 0.4, polite = false, wall = null } = {}) {
    if (!name) return false;
    if (saidThisPass.has(name)) return false;
    const b = buffers.get(name); if (!b || !running()) return false;
    const t = now();
    if (vo && t < vo.end) { if (polite) return false; vo.h.stop(0.15); }
    let dest = voiceBus;
    if (wall != null && voiceWall.length) { dest = G(1, voiceWall[((wall % NW) + NW) % NW]); dest.connect(G(0.3, voiceBus)); }   // mostly that wall, a little of the room
    const at = t + delay, h = play(name, { gain: L.voice, dest, at }); if (!h) return false;
    vo = { h, end: h.end, name }; if (!name.startsWith('v-wait') && !REPEATABLE.has(name)) saidThisPass.add(name);
    try { bc?.postMessage({ type: 'sub', name, in: Math.max(0, at - t), dur: Math.max(0.5, h.end - at) }); } catch { /* no channel (yet) */ }   // studio 26-11: the visual shows its subtitle
    duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(L.duck, Math.max(t, at - 0.35), 0.15); duck.gain.setTargetAtTime(1, h.end + 0.3, 0.7);
    return true;
  }
  const hush = (fade = 0.5) => { if (vo) { vo.h.stop(fade); vo = null; try { bc?.postMessage({ type: 'sub', name: null }); } catch { /* no channel */ } } ramp(duck.gain, 1, 0.3); };

  // ---------------------------------------------------------------- the music sets (layers, loops, the bar grid)
  const sets = {};
  function defineSet(name, def) {   // (26-11: the trailer swaps a set for its own; the old one, silent then, is let go)
    const old = sets[name];
    if (old) { for (const c of old.cycles) for (const x of c.srcs) { try { x.stop(); } catch { /* done */ } } const o = old.out; o.gain.setTargetAtTime(0, now(), 0.05); setTimeout(() => { try { o.disconnect(); } catch { /* gone */ } }, 500); }
    const out = G(0), lp = F('lowpass', 20000, 0.6), shelf = F('lowshelf', 160); shelf.gain.value = -((def.lift || 0) + (def.trim || 0)); series(out, shelf, lp, musicBus);
    const lg = {}; for (const k of Object.keys(def.layers)) lg[k] = G(1, out);   // a layer sounds unless its world says otherwise
    sets[name] = { name, def, out, lp, lg, cycles: [], want: false, wantAt: 0, from: 0, nextB: 0, gridT0: null, startedAt: 0 };
  }
  for (const [name, def] of Object.entries(SETS)) defineSet(name, def);
  let trlSets = null;
  function useTrailerSets() {   // the trailer's own music (TRAILER_SETS, or SETS_MT with musicSet 'mt'), loaded the first time it is asked for
    const which = P.musicSet === 'mt' ? 'mt' : 'tm'; if (trlSets === which) return; trlSets = which;
    const TS = which === 'mt' ? SETS_MT : TRAILER_SETS;
    for (const name of Object.keys(sets)) if (!TS[name] && sets[name].def !== SETS[name]) { if (SETS[name]) defineSet(name, SETS[name]); else { musicOff(name, 2); delete sets[name]; } }   // (a set only the other one had)
    for (const [name, def] of Object.entries(TS)) { const was = sets[name]?.want; defineSet(name, def); if (was || (name === 'wait' && block === 'wait')) musicOn(name, { fade: 3 }); }
    Promise.all(filesOf(TS).map(load)).then(() => { if (running()) musicKeep(); });
  }
  function cycle(s, at, offset, fadeIn) {   // start every layer of a set at `at` from `offset` (sample-locked)
    const c = { srcs: [], g: [] };
    for (const [k, file] of Object.entries(s.def.layers)) {
      const b = buffers.get(file); if (!b) continue;
      const src = ctx.createBufferSource(), g = G(fadeIn ? 0 : b.norm, s.lg[k]); src.buffer = b.buf; src.playbackRate.value = s.def.rate || 1; src.connect(g);   // rate: a take played in another key (tm-crown)
      if (fadeIn) { const xin = XIN.map((v) => v * b.norm); g.gain.setValueCurveAtTime(xin, at, fadeIn); }
      src.start(at, offset); c.srcs.push(src); c.g.push(g);
      src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
    }
    s.cycles.push(c); return c;
  }
  const loaded = (s) => Object.values(s.def.layers).every((f) => buffers.has(f) || failed.has(f)) && Object.values(s.def.layers).some((f) => buffers.has(f));   // a missing stem: the others play
  function musicOn(name, { at = now() + 0.03, offset, fade = 2, level = 1 } = {}) {
    const s = sets[name]; if (!s) return;
    const t = now(); hold(s.out.gain, t); s.out.gain.linearRampToValueAtTime(L.music * level * Math.pow(10, ((s.def.lift || 0) + (s.def.db || 0)) / 20), t + fade);   // db: the set's level (26-11, «Música moderna» measured BS.1770 after the peak normalisation: tm vs mt within ±1 dB, the crown on top)
    if (s.want && s.cycles.length) return;
    s.want = true; s.wantAt = at; s.from = offset ?? (s.def.once ? 0 : s.def.first ?? s.def.a);
    if (running() && loaded(s)) begin(s, at, s.from);
  }
  function begin(s, at, offset) {
    for (const c of s.cycles) for (const x of c.srcs) { try { x.stop(); } catch { /* done */ } }
    s.cycles = []; s.startedAt = at;
    cycle(s, at, offset, 0);
    if (!s.def.once) s.nextB = at + (s.def.b - offset);
    if (s.def.grid) s.gridT0 = at - offset + (s.def.grid0 ?? GRID0);        // the audio time of the take's first downbeat (bars every 2.4 s from it)
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
    f0 = snapHz(f0); f1 = snapHz(f1);                                                                                   // (the trailer's key)
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
    hz = snapHz(hz);                                         // (the trailer's key: the fundamental; the partials keep their matter)
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
  let dragAt = -9, dragOn = false; const NOCHIME = () => {};   // studio 25-11: the last time a hand dragged (s, wall clock)
  function impact(m) {
    if (!running() || !(m.wall >= 0 && m.wall < NW)) return;
    const wt = performance.now() / 1000; if (wt - impactWin > 1) { impactWin = wt; impactN = 0; } if (++impactN > 20) return;
    impactRate = impactRate * Math.exp(-(wt - impactLast) / 1.0) + 1; impactLast = wt;          // impacts in about the last second
    const crowd = 1 / Math.sqrt(1 + impactRate / 4);                                               // 1 alone … ~0.45 at 16/s
    const wallId = walls[m.wall].id, u = clamp(+m.u || 0.5, 0, 1), k = clamp(+m.strength || 0.3, 0, 1), t = now() + 0.004;
    const mat = IMPACT_MAT[m.mat] ? m.mat : 'ceramic', parts = IMPACT_MAT[mat], deg = clamp(Math.floor(u * 5), 0, 4);
    // studio 25-11 (Beltrán): in the entrance the chimes ring only while someone touches and drags; untouched, only the bed and the clicks
    const md = S.block !== 'wait' || wt - dragAt < 0.25 ? modal : NOCHIME;
    const scale = STONE_BLOCKS.has(S.block) ? MINOR_PENTA : MAJOR_PENTA;
    const size = +m.size > 0 ? +m.size : rand(0.1, 0.35), sizeOct = size > 0.3 ? -12 : size < 0.15 ? 12 : 0;      // big pieces lower, small ones higher
    const mm = IMPACT_BASE[mat] + scale[(deg + Math.floor(Math.random() * 3)) % 5] + (m.kind === 'floor' || m.kind === 'hit' ? sizeOct : 0);
    // a cluster: this wall rang < 90 ms ago — add a tick to that voice, nothing more
    const cl = cluster[m.wall];
    if ((m.kind === 'floor' || m.kind === 'hit' || m.kind === 'hook') && cl.g && wt - cl.t < 0.09 && cl.n < 8) {
      cl.n++; md(t + rand(0, 0.03), midiHz(mm + 12), (0.004 + 0.008 * k) * P.effects * crowd, cl.g, mat === 'chrome' ? CHROME : mat === 'glass' ? GLASS : CERAMIC);
      return;
    }
    // a burst on one wall cannot pile up: each wall carries a load that decays in ~0.35 s (as the hands do)
    const wl = wallLoad[m.wall]; wl.v *= Math.exp(-(wt - wl.t) / 0.35); wl.t = wt;
    const lvl = P.effects / (1 + 0.04 * Math.max(0, (S.hands || 0) - 3)) / (1 + wl.v) * (S.block === 'fall' ? 0.3 : 1) * crowd; wl.v += 0.7;   // the fall has its own big hits: its debris sits under them
    switch (m.kind) {
      case 'hit': {                  // struck by a hand: a chime of its matter
        const g = handVoice(wallId, u, 3, 0.6);
        md(t, midiHz(mm), (0.012 + 0.03 * k) * lvl, g, parts); cl.t = wt; cl.g = g; cl.n = 0;
        if (mat === 'fire') play('s-ember-burst', { gain: 0.04 * k * lvl, dest: g, at: t, rate: rand(1.1, 1.4) });
        break;
      }
      case 'floor': {                // it lands
        if (mat === 'glass') { const g = handVoice(wallId, u, 3, 0.9); md(t, midiHz(mm + 12), (0.005 + 0.012 * k) * lvl, g, GLASS); cl.t = wt; cl.g = g; cl.n = 0; break; }   // a glass shard lands (the dawn's rain)
        if (mat === 'line' || mat === 'petal') { const g = handVoice(wallId, u, 4, 1.4); md(t, midiHz(mm), (0.004 + 0.01 * k) * lvl, g, GLASS); break; }   // far below, in the canyon
        const g = handVoice(wallId, u, 2.2, 0.35), low = mm - 12;
        if (mat === 'stone') { play('s-ceramic', { gain: (0.02 + 0.05 * k) * lvl, dest: g, at: t, rate: rand(0.45, 0.65) }); md(t, midiHz(low), (0.015 + 0.035 * k) * lvl, g, STONE); }
        else if (mat === 'wire') { md(t, midiHz(mm), (0.01 + 0.025 * k) * lvl, g, WIRE); md(t + 0.004, midiHz(low - 12), 0.015 * k * lvl, g, STONE); }
        else {
          if (k > 0.3 && Math.random() < crowd * 1.4) play('sfx-tile', { gain: (0.02 + 0.06 * k) * lvl, dest: g, at: t, rate: rand(1.0, 1.6) * (size > 0.3 ? 0.8 : 1.15) });   // the clack thins out in a rain
          md(t, midiHz(low), (0.012 + 0.03 * k) * lvl, g, parts);
        }
        cl.t = wt; cl.g = g; cl.n = 0;
        if (k > 0.4 && crowd > 0.6) drum(t, g, { f0: 140, f1: 70, dur: 0.18, gain: 0.05 * k * lvl, noise: 0.25, sub: 0.15 * k, subDest: touchSub });
        break;
      }
      case 'break': {                // a crack, and the chips scatter
        const g = handVoice(wallId, u, 3, 0.5);
        play('s-crack', { gain: 0.06 * k * lvl, dest: g, at: t, rate: rand(1.3, 1.7) });
        play('sfx-tile', { gain: 0.1 * k * lvl, dest: g, at: t, rate: rand(0.9, 1.2) });
        for (let j = 0; j < 6; j++) md(t + 0.05 + j * rand(0.04, 0.09), midiHz(86 + scale[Math.floor(Math.random() * 5)]), 0.008 * lvl, g, CERAMIC);
        drum(t, g, { f0: 110, f1: 50, dur: 0.35, gain: 0.06 * k * lvl, noise: 0.3, sub: 0.25 * k, subDest: touchSub });
        break;
      }
      case 'hook': {                 // back on its thread: a tiny glass tick
        md(t, midiHz(93 + scale[deg]), 0.006 * lvl, handVoice(wallId, u, 2.5, 0.9), GLASS);
        break;
      }
      case 'lock': {                 // a piece locks into place (a floor, a cube going home): a clack in tune
        const g = handVoice(wallId, u, 2, 0.5);
        play('sfx-tile', { gain: (0.02 + 0.05 * k) * lvl, dest: g, at: t, rate: rand(1.3, 1.7) });
        md(t, midiHz(mm - (mat === 'stone' ? 0 : 12)), (0.01 + 0.025 * k) * lvl, g, mat === 'wire' ? WIRE : mat === 'stone' ? STONE : CERAMIC);
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
        for (let j = 0; j < 3; j++) md(t + j * 0.09, midiHz(86 + MAJOR_PENTA[(deg + j * 2) % 5]), (0.004 + 0.008 * k) * lvl, g, GLASS);
        break;
      }
      default: break;
    }
  }
  function fmHit(at, hz, gain, dest) {   // the festa's resonant hit: FM bell (bright attack, inharmonic shimmer) on a round body
    hz = snapHz(hz);
    const c = osc('sine', hz), m = osc('sine', hz * 1.41), mg = G(hz * 2.2), g = G(0, dest);
    m.connect(mg); mg.connect(c.frequency); c.connect(g);
    mg.gain.setValueAtTime(hz * 2.2, at); mg.gain.exponentialRampToValueAtTime(hz * 0.05, at + 0.6);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0004, at + 2.4);
    const b = osc('triangle', hz / 2), bg = G(0, dest); b.connect(bg);
    bg.gain.setValueAtTime(0, at); bg.gain.linearRampToValueAtTime(gain * 0.5, at + 0.006); bg.gain.exponentialRampToValueAtTime(0.0004, at + 1.2);
    for (const o of [c, m]) { o.start(at); o.stop(at + 2.5); } b.start(at); b.stop(at + 1.3);
  }
  function voiceNote(at, midi, dur, gain, dest) {   // a low wordless voice: two saws through two formants
    const hz = midiHz(snapM(midi)), env = G(0, dest), [v1, v2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
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
      const h0 = snapHz(62), h1 = snapHz(40), s0 = snapHz(150), s1 = snapHz(95);
      const o = osc('sine', h0), g = G(0, outSub); o.frequency.setValueAtTime(h0, at + dt); o.frequency.exponentialRampToValueAtTime(h1, at + dt + 0.16); o.connect(g);
      g.gain.setValueAtTime(0, at + dt); g.gain.linearRampToValueAtTime(level * k, at + dt + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, at + dt + 0.26);
      const s = osc('sine', s0), sg = G(0, drumBus); s.frequency.setValueAtTime(s0, at + dt); s.frequency.exponentialRampToValueAtTime(s1, at + dt + 0.1); s.connect(sg);
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
        const m = snapM(c.notes[Math.floor(Math.random() * c.notes.length)]), rate = (midiHz(m) / GRALLA_HZ) * Math.pow(2, (c.cents + rand(-6, 6)) / 1200);
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
  // the threshold's start ring: a glass tone that rises D4 → D5 (and a fifth above, faint) as the start ring fills
  const startTone = osc('sine', midiHz(62)), startFifth = osc('sine', midiHz(69)), startG = G(0, outRoom), startF = G(0.35, startG);
  startTone.connect(startG); startFifth.connect(startF); startG.connect(G(0.7, verbIn)); startTone.start(); startFifth.start(); persistent.push(startTone, startFifth);
  // ---- the ROOM MOVEMENTS (the parts move their worlds; the sound follows the score's state that drives them)
  const noiseSrc = () => { const n = ctx.createBufferSource(); n.buffer = NOISE; n.loop = true; n.start(0, Math.random() * 1.5); persistent.push(n); return n; };
  // brasa: the room sinks into the liquid chrome as the ring wakes — a viscous churn (band-passed, breathing) and its body in the sub
  const liqN = noiseSrc(), liqBp = F('bandpass', 420, 2.2), liqG = G(0, outRoom), liqLp = F('lowpass', 120, 3), liqSubG = G(0, outSub);
  series(liqN, liqBp, liqG); liqN.connect(liqLp); liqLp.connect(liqSubG);
  // T-055 brasa, the relay: the running fire — a crackling band of noise on the walls round the devil, louder and brighter the faster it runs
  const runN = noiseSrc(), runBp = F('bandpass', 900, 1.1), runMix = G(1); series(runN, runBp, runMix);
  const runG = walls.map((_, w) => { const g = G(0, toWall(w)); runMix.connect(g); return g; });
  let runCrackle = 0;
  // pinya: the whole pinya turns with the rotllana — a soft rush of bodies that goes round the walls
  const rotTurn = rotor(0, 0.2), turnN = noiseSrc(), turnBp = F('bandpass', 700, 0.8), turnG = G(0, rotTurn.inp); series(turnN, turnBp, turnG);
  // tronc: the elevator beside the tower — a deep stone grind and a low fifth while the room climbs
  const liftN = noiseSrc(), liftBp = F('bandpass', 190, 3), liftG = G(0, outRoom); series(liftN, liftBp, liftG); liftG.connect(G(0.6, outSub));
  const liftO = [osc('sawtooth', midiHz(38)), osc('sawtooth', midiHz(45))], liftLp = F('lowpass', 260, 1.2), liftOG = G(0, outRoom); for (const o of liftO) { o.connect(liftLp); o.start(); persistent.push(o); } series(liftLp, liftOG); liftOG.connect(G(0.8, outSub));
  // pom: 1.6 → 90 m — the city's hum falls away below, the thin air of altitude opens above
  const cityN = noiseSrc(), cityLp = F('lowpass', 260, 0.7), cityG = G(0, outSub), cityBp = F('bandpass', 180, 1.2), cityRoomG = G(0, outRoom); series(cityN, cityLp, cityG); cityN.connect(cityBp); cityBp.connect(cityRoomG);
  const cityO = [osc('sine', midiHz(38)), osc('sine', midiHz(50)), osc('triangle', midiHz(57))], cityOG = G(0, outRoom); cityO.forEach((o, i) => { o.detune.value = (i - 1) * 7; o.connect(G([0.5, 0.35, 0.15][i], cityOG)); o.start(); persistent.push(o); });
  const airN = noiseSrc(), airBp = F('bandpass', 2500, 1.4), airG = G(0, ambDest['s-wind-loop'].inp); series(airN, airBp, airG);
  let mvLiftH = 0, mvLiftV = 0, mvPomP = 0, lastPhrase = '', lastStage = '';
  const structWalls = () => { const a = []; for (let w = 0; w < NW; w++) if (S.walls && S.walls[w]) a.push(w); return a.length ? a : [0, 1]; };
  // the intro's TEAR (INT, T-034): from 46.3 to 57.8 s the host tears the square into slabs of image that turn over and fly
  // (one wave round the room, half of it in ~0.42 of the time). A rip of band-passed noise that wanders, slab clacks and glass
  // glints running round the walls from P4 both ways, a crack and a sub drop at the start; it thins under the motto (53.3 s).
  const TEAR = [46.3, 57.8];
  const tearN = noiseSrc(), tearBp = F('bandpass', 1400, 1.6), tearG = G(0, outRoom); series(tearN, tearBp, tearG); tearG.connect(G(0.5, verbIn));
  let tearCue = 0;
  // ---- colours of the re-made chapters (wave 2): pads that the state opens; silent until their block
  const padOf = (notes, type, lpHz, dest) => { const lp = F('lowpass', lpHz, 0.6), g = G(0, dest); lp.connect(g); notes.forEach((m, i) => { const o = osc(type, midiHz(m)); o.detune.value = (i % 2 ? 1 : -1) * rand(3, 7); o.connect(G(1 / notes.length, lp)); o.start(); persistent.push(o); }); return { g, lp }; };
  // festa (a plate of chrome and glass): a glass-harmonica shimmer in D major that grows with the resonance
  const glassPad = padOf([74, 78, 81, 86], 'sine', 9000, rotSoar.inp);
  // the baixada at dawn: lighter, major, airy — an open D (add9) and the air of the morning
  const dawnPad = padOf([62, 69, 76, 78, 81], 'triangle', 1800, outRoom); dawnPad.g.connect(G(0.6, verbIn));
  const dawnN = noiseSrc(), dawnBp = F('bandpass', 5200, 0.9), dawnAir = G(0, ambDest['s-rain-loop'].inp); series(dawnN, dawnBp, dawnAir);
  // the pom's golden haze (p ≈ 0.55–0.65): a high golden chord and a bright breath as the room passes through it
  const hazePad = padOf([86, 90, 93, 98], 'sine', 12000, ambDest['s-wind-loop'].inp); hazePad.g.connect(G(0.8, verbIn));
  const hazeN = noiseSrc(), hazeBp = F('bandpass', 4200, 1.1), hazeG = G(0, ambDest['s-wind-loop'].inp); series(hazeN, hazeBp, hazeG);
  // the fall (the assemblage tower collapses): a rumble that dies in ~6 s; the debris itself comes from the part's impacts
  const fallN = noiseSrc(), fallLp = F('lowpass', 90, 0.8), fallSubG = G(0, outSub), fallBp = F('bandpass', 260, 1.4), fallRoomG = G(0, outRoom);
  series(fallN, fallLp, fallSubG); fallN.connect(fallBp); fallBp.connect(fallRoomG);
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
  const voices = [], handAt = walls.map(() => -1e9), downsAt = [], lastDownOf = new Map(), wallLoad = walls.map(() => ({ v: 0, t: 0 }));
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
    const far = (k) => { const g = handVoice(e.wallId, u, 2.6, 0.3); play('s-timbal', { gain: 0.12 * k * dense, dest: g, at: t, rate: trailer() ? 0.841 : rand(0.78, 0.86) }); drum(t, G(0, g), { sub: 0.35 * k * dense, gain: 0.1, subDest: touchSub }); };   // (s-timbal is a C: × 0.841 = the A of the key)
    if (b === 'wait') far(0.55);                           // softer now: the threshold's tiles answer the hand too (impacts)
    else if (b === 'intro' || b === 'acta') { const g = handVoice(e.wallId, u, 4, 1.2); modal(t, midiHz(74 + MAJOR_PENTA[deg] + 12 * (oct > 1 ? 1 : 0)), 0.012 * dense, g, GLASS); }   // dust: a faint glint
    else if (b === 'brasa') {   // an ember burst; a low thump in the sub — T-055: its pitch by the hand's height (low hands = low notes: the children's)
      const g = handVoice(e.wallId, u, 2.2, 0.5), hk = clamp((metres - 0.5) / 1.4, 0, 1), step = Math.round(hk * 9), m = 38 + 12 * Math.floor(step / 5) + MINOR_PENTA[step % 5];
      play('s-ember-burst', { gain: 0.11 * dense, dest: g, at: t, rate: (0.7 + 0.65 * hk) * rand(0.95, 1.05) });
      if (!trailer()) drum(t, g, { f0: midiHz(m + 12), f1: midiHz(m), dur: 0.7, gain: 0.06 * dense, noise: 0, sub: 0.9 * (1 - 0.5 * hk), subDest: touchSub });   // (the trailer: the correfoc's birth has its own «fum»)
      modal(t + 0.01, midiHz(m + 24), 0.022 * dense, g, STONE, 0.3);   // the tone: D minor pentatonic, two octaves from 0.5 to 1.9 m
    } else if (b === 'pinya') {   // clay and body
      const g = handVoice(e.wallId, u, 1.6, 0.35);
      play('s-clay', { gain: 0.13 * dense, dest: g, at: t, rate: rand(0.85, 1.1) });
      handAt[w] = t; drum(t, g, { f0: 85, f1: 55, dur: 0.6, gain: 0.07 * dense, noise: 0.02, sub: 0.8, subDest: touchSub });
    } else if (b === 'tronc' && ph !== 'reward') {   // ceramic and stone, tuned to the stone's mode (D minor pentatonic)
      const g = handVoice(e.wallId, u, 1.6, 0.3), m = snapM(62 + 12 * oct + MINOR_PENTA[deg]);
      play('s-ceramic', { gain: 0.063 * dense, dest: g, at: t, rate: midiHz(m + 12) / 1605 });   // (−4 dB, 26-11 listening review)
      modal(t, midiHz(m), 0.038 * dense, g, CERAMIC);
      if (oct === 0) modal(t, midiHz(m - 12), 0.032 * dense, g, STONE);
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
    } else {   // 26-11 (Beltrán: «la sala siempre debe ser interactiva»): no block is ever deaf — a soft grain in its key, on the hand's wall
      const g = handVoice(e.wallId, u, 3, 1.0); modal(t, midiHz(keyNote(deg + 5 * Math.min(oct, 1), 1)), 0.014 * dense, g, GLASS);
    }
  });

  // ---------------------------------------------------------------- THE TRAILER: a sound for every interaction (26-11, Beltrán: «sinestesia»)
  // res-trailer posts every part's events of a frame ({ type: 'ev', part, block, ev }) and its progress ~4× a second ({ type: 'st', part,
  // block, p }). Everything pitched is in the block's key (KEYS, keyNote); everything is on the wall where it happens.
  const partSt = {};
  let outroOut = false, quietUntil = 0;
  const INV = { block: '', at: -1e9, n: 0, solo: 0, gold: 0, goldK: 0, empty: new Map() };
  const STRING = [[1, 1, 2.4], [2, 0.45, 1.6], [3, 0.25, 1.0], [4, 0.12, 0.6], [5, 0.06, 0.4]];   // a tense string (the red net)
  const wid = (w) => walls[((w % NW) + NW) % NW]?.id;
  const evAt = walls.map(() => -1);   // per wall, the last event sound (a burst of births stays soft)
  const towerW = () => { const i = wallIdx.get(partSt.torre3d?.wall ?? 'P1'); return i ?? Math.min(1, NW - 1); };   // torre3d's tower stands on P1 unless told
  function breath(at, w, u, k, up = true) {                     // a short breath of air on a wall: band-passed noise that swells
    const id = wid(w); if (id == null) return; const g = handVoice(id, u, 1.4, 0.5), n = ctx.createBufferSource(), f = F('bandpass', up ? 500 : 1600, 1.1), e = G(0, g);
    n.buffer = NOISE; series(n, f, e); f.frequency.setValueAtTime(up ? 500 : 1600, at); f.frequency.exponentialRampToValueAtTime(up ? 1500 : 450, at + 0.6);
    e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(k, at + 0.18); e.gain.exponentialRampToValueAtTime(0.0004, at + 0.9); n.start(at, Math.random() * 1.5, 1);
  }
  function flight(at, w, dur = 2.8) {                           // a climber flies round the room: a whoosh that runs wall to wall
    for (let j = 0; j < NW; j++) {
      const a = at + (j / NW) * dur, n = ctx.createBufferSource(), f = F('bandpass', 700 + 300 * j, 1.4), g = G(0, toWall(w + j)); n.buffer = NOISE; series(n, f, g); g.connect(G(0.4, verbIn));
      f.frequency.setValueAtTime(600 + 250 * j, a); f.frequency.exponentialRampToValueAtTime(2400 + 400 * j, a + dur / NW + 0.3);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.012 * P.effects, a + 0.25); g.gain.exponentialRampToValueAtTime(0.0004, a + dur / NW + 0.6); n.start(a, Math.random() * 1.5, dur / NW + 0.7);
    }
  }
  function chordOn(at, degs, oct, gain, w0 = 0, parts = GLASS) { degs.forEach((d, j) => modal(at + j * 0.07, midiHz(keyNote(d, oct)), gain, toWall(w0 + j), parts, 0.8)); }
  // the tones that follow a held hand: one per wall (a ring charging: the mosaic's buttons, the tower's climbers) and the golden charge;
  // they rise THROUGH THE SCALE (a glide from note to note of the block's key) and resolve on a note of it when they end
  const ringTone = walls.map((_, w) => {
    const o = osc('sine', 293.7), o2 = osc('triangle', 587.3), g = G(0, toWall(w)), g2 = G(0.18, g); o.connect(g); o2.connect(g2); g.connect(G(0.6, verbIn));
    o.start(); o2.start(); persistent.push(o, o2); return { o, o2, g, k: -1 };
  });
  const goldT = (() => { const o = osc('sine', 440), o2 = osc('sine', 660), g = G(0, spread()), g2 = G(0.3, g); o.connect(g); o2.connect(g2); g.connect(G(0.8, verbIn)); o.start(); o2.start(); persistent.push(o, o2); return { o, o2, g }; })();
  function toneTo(T, midi, gain, tc = 0.06) { const t = now(); T.o.frequency.setTargetAtTime(midiHz(midi), t, tc); T.o2.frequency.setTargetAtTime(midiHz(midi + 12), t, tc); T.g.gain.setTargetAtTime(gain, t, gain > 0 ? 0.08 : 0.25); }
  const charges = new Map();                                    // key → { w, u, t0, dur, ev }: a ring charging on a wall
  const trlTone = { reset() { charges.clear(); for (const r of ringTone) toneTo(r, 62, 0); toneTo(goldT, 69, 0); INV.goldK = 0; } };
  let torreEv = false, joins = 0, goldBeat = 0;
  let tapN = 0, tapAt = -1e9;
  function ghostSound(w, u) {                                   // a being that cannot climb (the tower is full): the form sound at −6 dB, rising, no flight
    const id = wid(w); if (id == null) return; const t = now() + 0.01, g = handVoice(id, u, 3, 1.0);
    [5, 7, 9].forEach((d, j) => modal(t + j * 0.07, midiHz(keyNote(d + j, 0)), 0.01, g, GLASS)); modal(t + 0.3, midiHz(keyNote(12, 0)), 0.008, g, GLASS);
    breath(t, w, u, 0.015, true);
  }
  function formSound(w, u) {                                    // a character forms at the hand: a glass chord and a breath, then it flies
    const id = wid(w); if (id == null) return; const t = now() + 0.01, g = handVoice(id, u, 3, 0.9);
    [5, 7, 9].forEach((d, j) => modal(t + j * 0.05, midiHz(keyNote(d, 0)), 0.02, g, GLASS)); drum(t, g, { f0: 110, f1: 73, dur: 0.5, gain: 0.04, noise: 0.05, sub: 0.3, subDest: touchSub });
    breath(t, w, u, 0.03); flight(t + 1.15, w);
  }
  function chargeStep() {                                       // every step: the rings' tones
    const t = now(), per = walls.map(() => null);
    for (const [key, c] of charges) {
      const k = clamp((performance.now() / 1000 - c.t0) / c.dur, 0, 1);
      if (k >= 1 && !c.ev) { charges.delete(key); if (block === 'tronc') formSound(c.w, c.u); else modal(t, midiHz(keyNote(5, 0)), 0.02, toWall(c.w), GLASS, 0.8); continue; }
      if (!per[c.w] || k > per[c.w]) per[c.w] = k;
    }
    ringTone.forEach((r, w) => { const k = per[w]; if (k == null) { if (r.k >= 0) { toneTo(r, keyNote(Math.floor(r.k * 5), 0) - 0, 0, 0.3); r.k = -1; } return; } r.k = k; toneTo(r, keyNote(Math.floor(k * 5.99), 0), (0.02 + 0.04 * k) * P.effects); });
  }
  function partEvents(m) {
    if (!running() || !trailer()) return;
    const t = now() + 0.01, wt = performance.now() / 1000;
    const landNow = m.part === 'torre3d' && (m.ev || []).some((e) => typeof e === 'string' && e.startsWith('land:'));
    for (const ev of m.ev || []) {
      if (typeof ev !== 'string') continue;
      const a = ev.split(':'), k = a[0];
      if (m.part === 'umbral3d') {
        if (k === 'charge') { const w = +a[1] || 0; charges.set('u' + w, { w, u: 0.5, t0: wt, dur: 4, ev: true }); modal(t, midiHz(keyNote(0, 0)), 0.02, toWall(w), GLASS, 0.9); drum(t, toWall(w), { f0: 120, f1: 73, dur: 0.4, gain: 0.025, noise: 0, sub: 0.2, subDest: touchSub }); }
        else if (k === 'uncharge') { const w = +a[1] || 0; charges.delete('u' + w); modal(t, midiHz(keyNote(-2, 0)), 0.02, toWall(w), GLASS, 0.9); }
        else if (k === 'cleared') {   // THE MOSAIC FALLS: a deep blow, the stones crash round the room, a descending shower of glass
          charges.clear(); drum(t, drumBus, { f0: 80, f1: 36.7, dur: 2.4, gain: 0.16, noise: 0.06, sub: 0.9 }); play('s-impact', { gain: 0.2, at: t + 0.02 }); play('s-crack', { gain: 0.12, at: t + 0.03, rate: 0.6 });
          for (let w = 0; w < NW; w++) for (let j = 0; j < 5; j++) { play('sfx-tile', { gain: 0.05, dest: toWall(w), at: t + 0.05 + w * 0.08 + j * rand(0.08, 0.2), rate: rand(0.7, 1.2) }); modal(t + 0.1 + w * 0.08 + j * 0.16, midiHz(keyNote(9 - j, 0)), 0.012, toWall(w), GLASS, 0.9); }
        }
      } else if (m.part === 'castells3d') {
        if (k === 'stage') { const i = ['correfoc', 'pinya', 'tronc', 'pom', 'aleta'].indexOf(a[1]); if (i >= 0) { modal(t, midiHz(keyNote(5 + i, 0)), 0.032, toWall(i), BELL, 1); modal(t + 0.02, midiHz(keyNote(i, -1)), 0.016, toWall(i), WARM, 0.6); } }
        else if (k === 'built') chordOn(t, [0, 2, 4], -1, 0.024, 0, WARM);
      } else if (m.part === 'brasa3d') {
        const st = partSt.brasa3d || {};
        if (k === 'intro' && a[1] === 'strip') { for (let w = 0; w < NW; w++) { const at = t + 0.2 + w * 0.8; modal(at, midiHz(keyNote(2 + w, 0)), 0.01, toWall(w + 2), GLASS, 0.9); breath(at, w + 2, 0.5, 0.012); } }   // the line of light runs round the room to P1
        else if (k === 'intro' && a[1] === 'boom') { drum(t, toWall(1), { f0: 90, f1: 36.7, dur: 1.4, gain: 0.14, noise: 0.12, sub: 0.7 }); play('s-crack', { gain: 0.09, dest: toWall(1), at: t + 0.005, rate: 1.15 }); }   // the first correfoc's «pum!»: a blow with a bite
        else if (k === 'feed') {   // every fire a correfoc passes: a tuned stone, higher the more the room burns
          const w = +a[1] || 0; if (t - evAt[w] < 0.15) continue; evAt[w] = t;
          modal(t, midiHz(keyNote(Math.floor(clamp(st.total || 0, 0, 1) * 5), -1)), 0.04, toWall(w), STONE, 0.5);
        } else if (k === 'boom') {   // the four fires flare: a deep blow, a salvo of tuned drums round the room, the voice
          play('s-impact', { gain: 0.18, at: t + 0.02 }); drum(t, drumBus, { f0: 80, f1: 36.7, dur: 2.2, gain: 0.15, noise: 0.05, sub: 0.9 });
          for (let w = 0; w < NW; w++) for (let j = 0; j < 3; j++) drum(t + 0.3 + w * 0.22 + j * 0.11, toWall(w), { f0: 160, f1: midiHz(keyNote(j, -2)), dur: 0.5, gain: 0.05, noise: 0.15, sub: 0.15, subDest: touchSub });
          chordOn(t + 0.4, [0, 1, 2, 3], 0, 0.016, 0, CHROME);
          say('v-brasa-awake', { delay: 1.8 });
        } else if (k === 'storm') riser(t, 4, 0.04, fxBus);
      } else if (m.part === 'pinya3d2') {
        if (k === 'born' || k === 'intro') {   // a being is born behind the wall: a warm breath and a low touch in the key (its row: its depth)
          const w = k === 'born' ? +a[1] || 0 : (+a[1] || 0) % NW, u = k === 'born' ? clamp(+a[2] || 0.5, 0, 1) : 0.5, row = +a[4] || 0, close = t - evAt[w] < 0.12; evAt[w] = t;
          const id = wid(w); if (id == null) continue; const g = handVoice(id, u, 2, 0.4), lvl = close ? 0.5 : 1;
          breath(t, w, u, 0.022 * lvl); modal(t + 0.02, midiHz(keyNote(Math.floor(u * 5) - row, -1)), 0.03 * lvl, g, WARM, 0.4);
          if (!close && t - handAt[w] > 0.4) drum(t, g, { f0: 110, f1: 55, dur: 0.6, gain: 0.04, noise: 0, sub: 0.5, subDest: touchSub });
        } else if (k === 'thread') {   // a red thread joins two groups: a tense string, higher as the net closes
          joins++; const st = partSt.pinya3d2 || {}, w = evAt.indexOf(Math.max(...evAt)), d = 2 + Math.min(10, Math.floor(joins / 2) + Math.floor((st.threadCover || 0) * 4));
          modal(t, midiHz(keyNote(d, 0)), 0.018, toWall(w < 0 ? 0 : w), STRING, 0.6); modal(t + 0.004, midiHz(keyNote(d, 0)) * 1.003, 0.008, toWall((w < 0 ? 0 : w) + 1), STRING, 0.6);
        } else if (k === 'full') {   // the room is full: a deep blow and the whole chord of the pinya on every wall; the voice
          drum(t, drumBus, { f0: 90, f1: 55, dur: 2, gain: 0.14, noise: 0.04, sub: 0.9 }); play('s-impact', { gain: 0.12, at: t + 0.02 });
          for (let w = 0; w < NW; w++) voiceNote(t + 0.05 + w * 0.06, keyNote([0, 2, 4, 5][w % 4], -1), 3.2, 0.03, toWall(w));
          chordOn(t + 0.1, [5, 7, 9, 10], 0, 0.016);
          say('v-pinya-holds', { delay: 1.4 });
        } else if (k === 'end') { for (let w = 0; w < NW; w++) { breath(t + w * 0.15, w, 0.5, 0.02, false); modal(t + 0.2 + w * 0.2, midiHz(keyNote(9 - w, 0)), 0.012, toWall(w), GLASS, 0.9); } }
      } else if (m.part === 'torre3d') {
        if (k === 'charge') { torreEv = true; const w = +a[1] || 0, key = 't' + w + ':'; if (!charges.has(key)) charges.set(key, { w, u: clamp(+a[2] || 0.5, 0, 1), t0: wt, dur: 1.7, ev: true }); }   // (a hand sliding re-sends it: the ring keeps its charge)
        else if (k === 'uncharge') { const w = +a[1] || 0; for (const key of [...charges.keys()]) if (key.startsWith('t' + w + ':')) charges.delete(key); modal(t, midiHz(keyNote(-1, 0)), 0.01, toWall(w), GLASS, 0.8); }
        else if (k === 'form') { torreEv = true; const w = +a[1] || 0; for (const key of [...charges.keys()]) if (key.startsWith('t' + w + ':')) charges.delete(key); formSound(w, clamp(+a[2] || 0.5, 0, 1)); }
        else if (k === 'ghost') { torreEv = true; ghostSound(+a[1] || 0, clamp(+a[2] || 0.5, 0, 1)); }   // 26-11 (a tap, not a hold): the tower is full, the being dissolves
        else if (k === 'touch') {   // a tap on a golden point, or when nothing can be made: the gold point's tone, one step up the scale per tap
          torreEv = true; const w = +a[1] || 0, id = wid(w); if (id == null) continue; if (wt - tapAt > 6) tapN = 0; tapAt = wt;
          const g = handVoice(id, clamp(+a[2] || 0.5, 0, 1), 3, 0.9); modal(t, midiHz(keyNote(7 + (tapN++ % 8), 0)), 0.024, g, GLASS);
        }
        else if (k === 'land') { modal(t, midiHz(keyNote(+a[1] || 0, 0)), 0.024, toWall(towerW()), CERAMIC, 0.5); }   // (on the tower's wall, where the climber lands)
        else if (k === 'joined') {   // a climber takes its place: a soft thump and a ceramic note of its tier
          if (landNow) continue; const tier = a[1] === 'pinya' ? -1 : +a[1] || 0, w = towerW();   // (a land in this frame already spoke for it)
          play('s-clay', { gain: 0.06, dest: toWall(w), at: t, rate: 0.8 }); modal(t + 0.01, midiHz(keyNote(2 + tier, 0)), 0.018, toWall(w), CERAMIC, 0.5);
        } else if (k === 'tier') {   // a floor is complete: a blow and a chord that climbs with the height
          const n = +a[1] || 1; drum(t, drumBus, { f0: 100, f1: midiHz(keyNote(0, -2)), dur: 1.2, gain: 0.08 + 0.015 * n, noise: 0.05, sub: 0.6 });
          play('sfx-tile', { gain: 0.08, at: t + 0.01, rate: 0.9 + 0.05 * n }); chordOn(t + 0.05, [n, n + 2, n + 4], 0, 0.014 + 0.003 * n, n);
        } else if (k === 'top') {   // the castell is up: a deep blow and a rising cascade on every wall
          drum(t, drumBus, { f0: 90, f1: 36.7, dur: 2, gain: 0.14, noise: 0.04, sub: 0.9 }); play('s-impact', { gain: 0.12, at: t + 0.02 });
          for (let j = 0; j < 8; j++) modal(t + 0.1 + j * 0.12, midiHz(keyNote(5 + j, 0)), 0.014, toWall(j), GLASS, 0.9);
        } else if (k === 'gold') { if (a[1] === 'on') { const w = +a[2] || 0; modal(t, midiHz(keyNote(7, 0)), 0.014, toWall(w), GLASS, 0.9); } }
        else if (k === 'aleta' && a[1] === 'ready') { INV.gold = wt; INV.goldHeld = S.clock; goldBeat = 0; }
        else if (k === 'aleta' && a[1] === 'charged') { riser(t, 0.35, 0.04, fxBus); }
        else if (k === 'aleta' && !a[1]) { toneTo(goldT, keyNote(10, 0), 0, 0.2); INV.gold = 0; crown(); }   // l'aleta: the release (the crown's music lands on it)
      }
    }
  }
  // the tower without its own charge events (until torre3d sends them): a still hand on a wall other than the title's charges a ring
  function torreHands(hands, wt) {
    return;   // 26-11: torre3d answers a tap now (form / ghost / touch), no hold: no rings from still hands
    if (torreEv || block !== 'tronc' || !trailer()) return;
    const P0 = partSt.torre3d || {}; if (P0.ready) return;
    const live = new Set();
    for (const o of hands) {
      if (o.wall === 1) continue;   // P1 (the title's wall) has no climbers
      const key = 'h' + o.stroke; live.add(key);
      const c = charges.get(key);
      if (!c && o.speed < 0.25) charges.set(key, { w: o.wall, u: clamp(0.5 + o.dx / (walls[o.wall].width || 4), 0, 1), t0: wt, dur: 1.7, ev: false });
      else if (c && o.speed > 0.5) charges.delete(key);
    }
    for (const key of [...charges.keys()]) if (key[0] === 'h' && !live.has(key)) charges.delete(key);
  }
  // the golden charge (torre3d's progress().charge): a tone that climbs the scale while hands hold the light; her light beats while she waits
  let goldPrev = 0, goldRise = 0;
  function goldStep(dt) {
    const g = partSt.torre3d; if (!trailer() || block !== 'tronc' || !g || !g.ready || INV.gold === 0) { if (INV.goldK) { toneTo(goldT, 69, 0); INV.goldK = 0; } return; }
    const c = clamp(g.charge || 0, 0, 1), rising = c > goldPrev + 1e-4; goldPrev = c; if (rising || INV.goldHeld == null) INV.goldHeld = S.clock; goldRise = rising ? 1 : Math.max(0, goldRise - dt * 2);
    INV.goldK = 1; toneTo(goldT, keyNote(4 + Math.floor(c * 6.99), 0), (0.02 + 0.06 * c) * goldRise * P.effects, 0.08);
    goldBeat -= dt; if (goldBeat <= 0) { goldBeat = 1.1 - 0.6 * c; modal(now() + 0.01, midiHz(keyNote(10, 0)), 0.006 + 0.01 * c, toWall(Math.floor(Math.random() * NW)), GLASS, 1); }
  }
  // INVITATIONS: when nobody plays (or one need is plain), a short line — never over another voice, ≥ INVITE_GAP s apart, ≤ INVITE_MAX a
  // block until a hand comes back; never before the block's own opening lines are done
  function invites(TC) {
    const b = block, c = S.clock, t = now();
    if (INV.block !== b) { INV.block = b; INV.at = c - INVITE_GAP + 8; INV.n = 0; INV.solo = 0; INV.empty.clear(); }
    if (S.hands > 0) INV.n = Math.min(INV.n, INVITE_MAX - 1);
    const opening = TC ? (brasaCue < TC.length || S.t < TC[TC.length - 1][0] + 8) : false;
    if (opening || (vo && t < vo.end + 1.2) || c - INV.at < INVITE_GAP || INV.n >= INVITE_MAX) return;
    const idle = c - lastHandClock, seen = c - lastHandClock < 180 || c - passAt < 120;   // someone has been here lately (the sensor sees only hands)
    let line = null, wall = null;
    if (b === 'wait') {
      const u = partSt.umbral3d || {}, pw = u.paint?.walls || [], open = (S.reveal || 0) >= 1;
      if (!open) {
        const mx = Math.max(0, ...pw), lo = pw.indexOf(Math.min(...pw));
        if (S.hands > 0 && mx > 0.15 && lo >= 0 && pw[lo] < 0.03) { line = 'v-inv-asleep'; wall = lo; }
        else if (idle >= INVITE_IDLE && seen) line = 'v-inv-wait';
      } else if (!u.holding && (u.cover || 0) < 0.02 && idle >= INVITE_IDLE && seen) line = 'v-wait-start';
    } else if (b === 'brasa') {
      const f = partSt.brasa3d?.fires || [], mx = Math.max(0, ...f), lo = f.indexOf(Math.min(...f));
      INV.solo = S.hands > 0 && S.hands <= 2 ? INV.solo + 1 : 0;
      if (idle >= INVITE_IDLE) line = 'v-inv-brasa';
      else if (mx > 0.35 && lo >= 0 && f[lo] < 0.45 * mx) { line = 'v-inv-fire'; wall = lo; }
      else if (INV.solo > 25 * 40) line = 'v-brasa-2';   // (steps of 25 ms: one or two hands for ~25 s) «Now, all together.»
    } else if (b === 'pinya') {
      const fw = partSt.pinya3d2?.walls || [], mx = Math.max(0, ...fw), lo = fw.indexOf(Math.min(...fw));
      if (idle >= INVITE_IDLE) line = 'v-pinya-wait';
      else if (mx > 0.35 && lo >= 0 && fw[lo] < 0.08) { line = 'v-inv-missing'; wall = lo; }
    } else if (b === 'tronc') {
      const g = partSt.torre3d || {};
      if (g.ready && INV.gold && c - (INV.goldHeld ?? c) > 10) line = 'v-inv-gold';
      else if (!g.ready && idle >= INVITE_IDLE) line = 'v-inv-climb';
    }
    if (line && say(line, { polite: true, delay: 0.2, wall })) { INV.at = c; INV.n++; }
  }
  let passAt = -1e9;

  // ---------------------------------------------------------------- the score's events
  let brasaCue = 0, brasaS = null, brasaLast = 0;   // 'trailer': the trailer's intro (INTRO_TRAILER), set by the visual piece
  let introCue = 0, bellsCue = 0, crownAt = -1, crownMusic = false, bloomUntil = -1, actaCue = 0;
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
      modal(pk + w * 0.035, midiHz(trailer() ? [86, 81, 93, 74][w % 4] : 86 + MAJOR_PENTA[(w * 2) % 5]), 0.011 * k, toWall(w), GLASS, 0.8);   // the trailer's bridge: D and A, in every block's scale
    }
    drum(pk, drumBus, { f0: 90, f1: 40, dur: 0.9, gain: 0.045 * k, noise: 0.05, sub: 0.28 * k });
    return pk;
  }
  function enterBlock(b) {
    const prev = block; block = b; const t = now(); brasaCue = 0; outroOut = false; INV.block = ''; trlTone.reset();
    // the trailer: a change of key (correfoc D → pinya A minor → tower D) never lets two keys sound together for more than an instant —
    // the outgoing music goes in 1.5 s and the new one comes in on the transition's hit; the acta → entrance change is a short silence
    const T0 = trailer(), keyCut = T0 && KEYS[prev] && KEYS[b] && KEYS[prev][0] !== KEYS[b][0], hushIn = T0 && b === 'wait';
    if (prev === 'brasa' && brasaS) { const g = brasaS; brasaS = null; g.stop(2500).catch?.(() => {}); }   // the fire's sound leaves with its block   // (the trailer's opening cues: every block starts them again)
    if (b === 'intro' || b === 'wait') saidThisPass.clear();
    if (b === 'wait') passAt = S.clock;
    musicBus.gain.setTargetAtTime(P.music, t, 0.3);   // a tronc's wobble may have left the music down
    const pk = prev !== b && !hushIn ? tileSweep(b) : t;   // (into the entrance after the closing: no hit, a silence — see quietUntil)
    if (hushIn) quietUntil = t + 2.5;
    if (b === 'wait' && sets.wait) musicOn('wait', { at: Math.max(t + 0.05, quietUntil), fade: 4 });   // (the mt set has music for the entrance)
    // what leaves: each set as its world closes (the festa lets its drums go first, the rest under the baixada)
    for (const name of Object.keys(sets)) {
      if (!sets[name].want) continue;
      const keep = (name === b) || (b === 'crown' && name === 'crown') || (b === 'festa' && (name === 'festa' || name === 'crown')) || (b === 'baixada' && name === 'festa');
      if (!keep) musicOff(name, keyCut ? 1.5 : name === 'intro' ? 6 : name === 'brasa' ? 6 : name === 'pinya' ? 5 : name === 'pom' ? 1.5 : name === 'crown' ? 6 : 3);
    }
    for (const c of Object.values(clouds)) c.on = false;
    if (prev === 'tronc' || b === 'tronc') uncut();
    if (b === 'intro') { introCue = 0; bellsCue = 0; tearCue = 0; musicOn('intro', { offset: 0, fade: 0.5 }); drum(t + 0.05, drumBus, { f0: 70, f1: 34, dur: 2, gain: 0.1, noise: 0, sub: 1 }); }
    else if (b === 'brasa') musicOn('brasa', { fade: 6 });
    else if (b === 'pinya') { musicOn('pinya', keyCut ? { at: pk, fade: 3 } : { fade: 6 }); layer('pinya', 'bass', 0.5, 0.1); layer('pinya', 'other', 0.1, 0.1); layer('pinya', 'drums', 0.2, 0.1); }
    else if (b === 'tronc') {
      arpN = 0;
      if (T0) {   // the trailer's tower has no title wait: its music comes in on the transition's hit, the bass first (the layers follow its climbers)
        musicOn('tronc', { at: pk, offset: sets.tronc.def.a, fade: keyCut ? 1.5 : 3 });
        layer('tronc', 'bass', 0.65, 0.05); layer('tronc', 'drums', 0, 0.05); layer('tronc', 'other', 0, 0.05); setNow(sets.tronc.lp.frequency, 1800);
      }
    }
    else if (b === 'pom') { musicOn('pom', { fade: 10 }); }
    else if (b === 'crown') crown();
    else if (b === 'festa') { say('v-aleta-2', { delay: 0.3 }); if (!sets.festa.want) festaStart(); }
    else if (b === 'baixada') {
      say('v-baixada-gently', { delay: 1.2 });
      layer('festa', 'drums', 0, 0.8); layer('festa', 'bass', 0.3, 2); sets.festa.lp.frequency.setTargetAtTime(900, t, 2.5);
      setTimeout(() => { if (block === 'baixada') musicOff('festa', 8); }, 2500);
      musicOn('baixada', { fade: 5 });
    } else if (b === 'fall') {
      for (const name of Object.keys(sets)) musicOff(name, 0.4);
      play('s-impact', { gain: 0.3, at: t + 0.02 }); play('sfx-fall', { gain: 0.3, at: t + 0.1 });
      drum(t + 0.03, drumBus, { f0: 70, f1: 30, dur: 1.8, gain: 0.2, noise: 0.05, sub: 0.7 });   // sub 0.9 → 0.7 (24-11): the collapse's rumble and debris now sit under it
    } else if (b === 'acta') { actaCue = 0; musicOn('acta', { offset: 0, fade: T0 ? 0.6 : 2 }); }
    if (b !== 'crown') { crownAt = -1; crownMusic = false; }
    if (b !== 'festa' && b !== 'crown' && b !== 'baixada') festaIn = false;
  }
  function festaStart() { festaIn = true; musicOn('festa', { fade: 6 }); layer('festa', 'bass', 0.6, 0.1); layer('festa', 'other', 0.45, 0.1); layer('festa', 'drums', 0, 0.1); setNow(sets.festa.lp.frequency, 700); }
  function crownMusicStart(offset) { if (crownMusic) return; crownMusic = true; musicOn('crown', { offset, fade: 0.05, level: 0.75 }); }   // (offset: its impact − 0.05 s)
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
    if (crownAt >= 0 || !running()) return; const t = now(); crownAt = t;
    swell?.stop(t); swell = null;
    crownMusicStart((sets.crown.def.impact ?? CROWN_IMPACT) - 0.05);      // the release of m-crown lands on the trigger (the group's, or the window's end)
    bloom(t + 0.02);
    const wide = clamp(S.aletaWidth || 0.5, 0.15, 1);   // wider (more glints, louder) the more hands rose and the sooner
    for (let w = 0; w < NW; w++) modal(t + 0.05 + w * 0.09, midiHz(86 + MAJOR_PENTA[w % 5]), 0.03 + 0.03 * wide, toWall(w), GLASS, 0.8);
    if (wide > 0.5) for (let w = 0; w < NW; w++) modal(t + 0.12 + w * 0.07, midiHz(93 + MAJOR_PENTA[(w + 2) % 5]), 0.02 * wide, toWall(w + 2), GLASS, 0.9);
    if (play('sfx-crown', { gain: 0.24, dest: fxIn['s-crowd-loop'] || fxBus, at: t + 0.4 })) rotCrowd.speed = 0.12;
    if (aletaYoursT) { clearTimeout(aletaYoursT); aletaYoursT = 0; }   // crowned before the second line: it is not needed
    say('v-aleta-crowned', { delay: 1.6 });   // v-aleta-1 without its first sentence (trimmed 24-11): «El castell está coronado.»
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
    if (p === 'title' && !(introSet === 'trailer' && TRAILER_CUES[block])) say(TITLE_LINE[block]);   // (the trailer's correfoc speaks BRASA_TRAILER)
    if (block === 'tronc' && p === 'play') {   // the take starts on the play's first instant: its next downbeat is the score's first pulse
      musicOn('tronc', { at: t + 0.03, offset: GRID_A, fade: 0.05 });
      layer('tronc', 'bass', 0.65, 0.05); layer('tronc', 'drums', 0, 0.05); layer('tronc', 'other', 0, 0.05); setNow(sets.tronc.lp.frequency, 1800);
    } else if (block === 'tronc' && p === 'reward') cutDry();
    else if (block === 'pom' && p === 'play') say('v-pom-2', { delay: 0.3 });
    else if (block === 'pom' && p === 'aleta') {
      aletaSwell((T.aleta?.window || 8) / pace);
      if (say('v-aleta-raise', { delay: 0.1 })) { const d = (buffers.get('v-aleta-raise')?.buf.duration || 1.5) + 1.5; aletaYoursT = setTimeout(() => { aletaYoursT = 0; if (block === 'pom') say('v-aleta-yours', { delay: 0 }); }, d * 1000); }   // «She raises her hand.» … 1.5 s … «Raise yours.»
    }   // l'aleta (24-11): the group decides when; a swell rises under the window, the crown lands on the trigger
    else if (block === 'pinya' && p === 'reward') { play('s-crack', { gain: 0.26, at: t + 4.5 }); riser(t + 2.5, 2, 0.03); }
  }
  function onEvent(ev) {
    const i = ev.indexOf(':'), k = i < 0 ? ev : ev.slice(0, i), arg = i < 0 ? '' : ev.slice(i + 1), t = now();
    if (k === 'block') return enterBlock(arg);
    if (k === 'phase') return enterPhase(arg);
    if (k === 'hint') return say(HINT_LINE[arg], { polite: true, delay: 0.2 });
    if (k === 'abandon') { hush(1); for (const name of Object.keys(sets)) musicOff(name, 3); for (const c of Object.values(clouds)) c.on = false; for (const h of [...live]) if (!h.name.endsWith('-loop')) h.stop(2); return; }
    if (!running()) return;
    if (k === 'reveal') {   // the start button is whole: a glass chord goes round the walls over a soft low breath
      if (WAIT_VOICES) say('v-wait-start', { delay: 1.4 });
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
      say('v-tronc-wobble', { delay: 0.5 });
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
      for (let j = 0; j < 2; j++) { play('s-timbal', { gain: 0.09, dest: toWall(from), at: t + 0.01 + j * g, rate: 0.92 }); drum(t + 0.01 + j * g, toWall(from), { f0: 110, f1: 70, dur: 0.25, gain: 0.03, noise: 0.05 }); }
      const tokAt = t + 0.01 + 2 * g, tw = to < 0 ? [...Array(NW).keys()] : [to];
      for (const w of tw) play('s-timbal', { gain: 0.16 / Math.sqrt(tw.length), dest: toWall(w), at: tokAt, rate: 0.84 });
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

  // ---------------------------------------------------------------- what follows the state, every step
  function follow(dt) {
    const t = now(), b = block, ph = S.phase, prog = S.progress || 0, on = running();
    if (S.hands > 0) lastHandClock = S.clock;
    // the voice by the clock: the intro's lines, the waiting call, the acta's lines
    const IV = introSet === 'trailer' ? INTRO_TRAILER : P.lang === 'en' ? INTRO_VOICE : INTRO_VOICE_ES;   // 25-11: the Catalan lines (audio/ca/) fit the Spanish cues: 5.5 · 10.0 · 8.3 · 5.3 · 4.6 s
    if (b === 'intro') while (introCue < IV.length && S.t >= IV[introCue][0]) { const nm = IV[introCue++][1]; if (say(nm, { delay: 0.05 }) && nm === 'v-trl-welcome' && running()) { const t0 = now() + 0.1; chordOn(t0, [0, 2, 4, 5], 0, 0.014, 0, BELL); drum(t0, drumBus, { f0: 70, f1: 36.7, dur: 2.4, gain: 0.06, noise: 0, sub: 0.6 }); } }   // «Welcome»: a soft open chord round the room
    const TC = introSet === 'trailer' ? TRAILER_CUES[b] : null;
    if (TC) while (brasaCue < TC.length && S.t >= TC[brasaCue][0]) { const c = TC[brasaCue++]; if (S.t - c[0] < 2) say(c[1], { delay: 0.05 }); }   // (a line already 2 s late is skipped, never two at once)
    if (b === 'wait' && S.hands === 0) { const gone = S.clock - lastHandClock; if (gone >= WAIT_AFTER && gone <= WAIT_RECENT && S.clock - waitSaid >= WAIT_EVERY) { waitSaid = S.clock; if (WAIT_VOICES && (S.reveal || 0) < 1) say('v-wait-invite', { polite: true, delay: 0.2 }); } }
    if (b === 'acta' && !trailer()) {
      if (actaCue === 0 && S.t >= ACTA_AT.outcome) { actaCue = 1; say(OUTCOME_LINE[S.outcome] || OUTCOME_LINE.descarregat, { delay: 0.05 }); }
      if (actaCue === 1 && S.t >= ACTA_AT.final) { actaCue = 2; say('v-cierre-final', { delay: 0.05 }); }
    }
    if (!on) return;
    musicKeep(); ambKeep();
    if (trailer()) {
      chargeStep(); goldStep(dt); invites(TC);
      if (b === 'acta' && S.t >= 14.5 && !outroOut) { outroOut = true; for (const name of Object.keys(sets)) musicOff(name, 2.5); }   // the closing goes to black (~17 s): then a short silence
    }
    // the threshold: as play reveals the button, glass motes gather (more and brighter); the start ring raises a glass tone
    if (b === 'wait') {
      const rv = S.reveal || 0;
      if (rv > 0.04 && rv < 1 && performance.now() / 1000 - dragAt < 0.25 && Math.random() < dt * (0.4 + 5 * rv)) {   /* studio 25-11: the reveal's glints only while a hand drags (they rang on until the reveal faded) */ const w = Math.floor(Math.random() * NW); modal(t + 0.01, midiHz(86 + MAJOR_PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0)), (0.004 + 0.012 * rv) * P.effects, toWall(w), GLASS, 1); }
      const st = S.start || 0;
      startTone.frequency.setTargetAtTime(snapHz(midiHz(62) * Math.pow(2, st)), t, 0.15); startFifth.frequency.setTargetAtTime(snapHz(midiHz(69) * Math.pow(2, st)), t, 0.15);   // (the trailer: from note to note of the key)
      startG.gain.setTargetAtTime(st > 0.01 && st < 0.999 ? (0.006 + 0.03 * st) * P.effects : 0, t, st >= 0.999 ? 0.08 : 0.2);   // studio 26-11 (Beltrán): once the room breaks (the trailer holds start at 0.999 while the mosaic falls) the charge tone stops
    } else if (startG.gain.value > 0) startG.gain.setTargetAtTime(0, t, 0.3);
    // the intro's bells: far away (the far wall) at the start, again lower as the tower dissolves
    if (b === 'intro' && !trailer()) {
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

    const tw = trailer() && b === 'tronc' ? partSt.torre3d : null, twFl = tw && tw.needed ? 9 * clamp((tw.climbers || 0) / tw.needed, 0, 1) : 0;   // the trailer's tower: its climbers are the floors
    const tronc = b === 'tronc' && ph !== 'reward', pom = b === 'pom', fl = tw ? Math.floor(twFl) : S.floors || 0, res = clamp(S.resonance || 0, 0, 1), bl = t < bloomUntil;
    // ---- the layers of each world
    if (b === 'brasa') layer('brasa', 'bed', ph === 'reward' ? 0.5 : 0.7 + 0.3 * prog, 1.5);
    if (b === 'pinya') { layer('pinya', 'bass', ph === 'reward' ? 1 : 0.5 + 0.5 * prog, 1); layer('pinya', 'other', ph === 'reward' ? 1 : 0.1 + 0.9 * Math.pow(prog, 1.2), 1); layer('pinya', 'drums', 0.2 + 0.8 * clamp(prog * 1.3, 0, 1), 1.2); }
    if (tronc && sets.tronc.want) {
      layer('tronc', 'bass', 0.65 + 0.03 * fl, 1);
      layer('tronc', 'drums', clamp(fl * 0.45, 0, 1), 1.2);
      layer('tronc', 'other', clamp((fl - 2) * 0.4, 0, 1), 1.5);
      sets.tronc.lp.frequency.setTargetAtTime(fl >= 7 ? 18000 : 1800 + fl * 1500, t, 1.5);
      // from the fifth floor, two reed drones (D and A); out of step the second detunes and beats against the first
      const weak = Math.min(1, S.weak.reduce((a, v) => a + v, 0) / Math.max(1, S.structure) / 2);
      clouds.reedA.on = clouds.reedB.on = fl >= 5 && !trailer();   // (the trailer: no gralla — Beltrán 26-11, the music is new media) clouds.reedA.level = clouds.reedB.level = L.grains * (0.6 + 0.08 * (fl - 5));
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
    if (b === 'intro' && !trailer()) { clouds.memory.on = S.t > 56; clouds.memory.level = L.grains * 0.5 * clamp((S.t - 56) / 10, 0, 1); }
    if (b === 'acta' && !trailer()) { clouds.memory.on = S.t > 6 && S.t < 34; clouds.memory.level = L.grains * 0.35; }
    if (b === 'pinya') { clouds.circle.level = L.grains * (ph === 'reward' ? 1.2 : 1); }

    // ---- ambience by block
    const A = {
      's-embers-loop': b === 'wait' ? L.embers * (t < quietUntil ? 0 : 1) : b === 'brasa' ? L.embers * 1.3 : b === 'intro' ? L.embers * 0.3 : b === 'acta' ? L.embers * 0.8 * (outroOut ? 0 : 1) : 0,
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
    if (b === 'pinya' && ph === 'play' && !trailer() && S.pinyaStage === 'pack' && lastStage === 'palm' && !(S.learned && S.learned.pinya)) say('v-pinya-closein', { polite: true, delay: 0.2 });
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
      const h = tw ? twFl : (S.floors || 0) + (S.floorProgress || 0), climbing = b === 'tronc' && (ph === 'play' || !!tw);
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
      const dawn = b === 'baixada' ? clamp(0.3 + 0.7 * prog, 0, 1) : b === 'acta' && !trailer() ? clamp(1 - S.t / 8, 0, 1) * 0.5 : 0;
      dawnPad.g.gain.setTargetAtTime(0.012 * dawn * P.music, t, 2.5); dawnPad.lp.frequency.setTargetAtTime(1200 + 2400 * dawn, t, 2);
      dawnAir.gain.setTargetAtTime(0.006 * dawn * P.effects, t, 2.5);
      const haze = pom ? Math.exp(-(((prog - 0.6) / 0.06) ** 2)) : 0;
      hazePad.g.gain.setTargetAtTime(0.014 * haze * P.music, t, 0.6); hazeG.gain.setTargetAtTime(0.01 * haze * P.effects, t, 0.6);
      const fk = b === 'fall' ? Math.exp(-S.t / 2.2) * clamp(S.t / 0.15, 0, 1) : 0;
      fallSubG.gain.setTargetAtTime(0.08 * fk * P.effects, t, 0.15); fallRoomG.gain.setTargetAtTime(0.02 * fk * P.effects, t, 0.15);
    }
    // ---- the drone
    const quiet = t < quietUntil ? 0 : 1;   // after the trailer's closing: a short silence before the entrance sounds again
    const drone = b === 'wait' ? 0.03 * quiet : b === 'brasa' ? 0.015 : b === 'tronc' && ph === 'title' ? 0.035 : b === 'baixada' ? 0.012 : b === 'fall' ? 0.02 : 0;
    if (!(b === 'tronc' && ph === 'reward')) { droneG.gain.setTargetAtTime(drone * 0.9, t, 1.2); droneSubG.gain.setTargetAtTime(drone * 1.3, t, 1.2); }
    // ---- the pom: the thread rises D5 → D6 with the three climbers and flickers when hands move
    thread.frequency.setTargetAtTime(midiHz(74) * Math.pow(2, prog), t, 0.4);
    threadG.gain.setTargetAtTime(sil === 2 ? 0 : sil ? 0.012 : pom && ph === 'play' ? 0.01 + 0.025 * prog : 0, t, sil === 2 ? 0.08 : 0.3);   // T-050: in the silence the thread is a held tone
    const flk = pom && S.restless && !sil && (S.pomStage !== 'relay' || (S.pomFalter || 0) > 0);
    flickG.gain.setTargetAtTime(flk ? 0.7 : 0, t, 0.08); flickD.gain.setTargetAtTime(flk ? 25 : 0, t, 0.08);
    // ---- the creak of a leaning tower (from the third floor on): each structure wall by its own lean, the sub by the mean
    let leanSum = 0, leanN = 0;
    for (let w = 0; w < walls.length; w++) { const l = S.balance && tronc && S.walls[w] ? Math.min(1, Math.abs(S.lean[w] || 0)) : 0; creakG[w].gain.setTargetAtTime(l * 0.1, t, 0.3); if (S.walls[w]) { leanSum += l; leanN++; } }
    const lean = leanN ? leanSum / leanN : 0;
    creakSrc.frequency.setTargetAtTime(22 + 22 * lean, t, 0.5); wobG.gain.setTargetAtTime(lean * 0.2, t, 0.4);
    // ---- the heartbeat: slow under the pinya (quickening as it fills), faint under the pom
    const hp = b === 'pinya' && ph !== 'reward' && !trailer() ? (1.3 - 0.3 * prog) / Math.sqrt(pace) : pom && ph !== 'reward' ? 1.0 / Math.sqrt(pace) : 0;
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
  // 25-11 (studio): ctl.lang — a visual piece may set the voice's language (res-trailer: Catalan by default)
  if (bc) bc.onmessage = (ev) => { const m = ev.data; if (m?.type === 'ev') { try { partEvents(m); } catch (e) { console.error('ressonancia-sound: ev', e); } return; } if (m?.type === 'st') { if (m.part && m.p && typeof m.p === 'object') partSt[m.part] = m.p; return; } if (m?.type === 'brasa') { if (block === 'brasa' && m.s) { try { if (!brasaS) { brasaS = createBrasaSound(audio, { gain: 1 }); brasaLast = ctx.currentTime; } const tn = ctx.currentTime, d = Math.min(0.1, Math.max(0.001, tn - brasaLast)); brasaLast = tn; brasaS.update(d, m.s); } catch (e) { console.error('ressonancia-sound: brasa', e); } } return; } if (m?.type === 'fx') { if (m.fx === 'impact') { try { impact(m); } catch (e) { console.error('ressonancia-sound: fx', e); } } return; } if (m?.type !== 'ctl') return; if (m.pace > 0) pace = Math.min(32, m.pace); if (['es', 'en', 'ca'].includes(m.lang) && m.lang !== P.lang) { P.lang = m.lang; for (const n of VOICE_SET) { buffers.delete(n); peaks.delete(n); failed.delete(n); } Promise.all([...VOICE_SET].map(load)); } if (m.button && typeof m.button === 'object') score.setButton?.(m.button); if ('reveal' in m) score.setReveal?.(m.reveal); if ('start' in m) score.setStart?.(m.start); if ('fill' in m) score.setFill?.(m.fill); if (m.intro) { introSet = m.intro; if (introSet === 'trailer') useTrailerSets(); } if (typeof m.say === 'string' && TRAILER_SAY.includes(m.say)) say(m.say, { delay: 0.05 }); if (m.jump) score.jump(m.jump); if (m.times && typeof m.times === 'object') { try { applyTimes(T, m.times, TIMES); } catch (e) { console.error('ressonancia-sound: times', e); } } };
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
      if (p.speed > 0.12) dragAt = wt;                                   // studio 25-11: someone is touching and dragging
      // the score's hand (plan de interacción, step 0): height from the floor, velocity, size and place on the perimeter, in metres
      const o = handPool[hands.length] || (handPool[hands.length] = {});
      o.stroke = h.stroke; o.wall = w; o.dx = (h.u - 0.5) * (W.width || 4); o.y = y; o.vx = p.vx; o.vy = p.vy; o.speed = p.speed;
      o.size = h.size > 0 ? h.size : 0.12; o.s = wallS0[w] + h.u * (W.width || 4);
      seen.add(h.stroke); hands.push(o);
    }
    for (const k of lastPos.keys()) if (!seen.has(k)) lastPos.delete(k);
    // studio 25-11 (Beltrán): in the entrance a DRAGGING hand brushes many tiles at once — a rain of small chimes along its way, as
    // many as its speed (≈ 13 a second at 0.5 m/s), each a short ceramic / glass strike where the hand is; when no hand drags any more
    // (≈ 0.2 s), every chime still ringing is let go in ~0.2 s (only the reverb's tail remains)
    if (S.block === 'wait' && running()) {
      let any = false;
      for (const o of hands) {
        if (o.speed < 0.12) continue;
        any = true; const p = lastPos.get(o.stroke); if (!p) continue;
        p.ph = (p.ph || 0) + dt * Math.min(1.6, o.speed) * 26;
        let n = 0;
        while (p.ph >= 1 && n < 4) {
          p.ph -= 1; n++;
          const W = walls[o.wall], u = clamp(0.5 + o.dx / (W.width || 4), 0, 1), t = now() + Math.random() * 0.03;
          const m = 79 + MAJOR_PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.35 ? 12 : 0);
          modal(t, midiHz(m), (0.005 + 0.009 * Math.random()) * P.effects, handVoice(W.id, u, 0.9, 0.35), Math.random() < 0.6 ? CERAMIC : GLASS);
        }
      }
      if (any) dragOn = true;
      else if (dragOn && wt - dragAt > 0.2) {
        dragOn = false; const t = now();
        for (const v of voices) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.06); }
        voices.length = 0;
      }
    }
    if (introSet === 'trailer') { T.abandon = 1e9; torreHands(hands, wt); }   // the trailer holds its blocks itself: an empty room never sends the score back to the entrance
    score.step(dt * pace, hands);
    const events = S.events.splice(0);
    for (const ev of events) { try { onEvent(ev); } catch (e) { console.error('ressonancia-sound:', ev, e); } }
    try { follow(dt * pace); } catch (e) { console.error('ressonancia-sound:', e); }
    if (bc) { try { bc.postMessage({ type: 'state', ts: Date.now(), pace, s: { ...S, events }, acta: score.acta() }); } catch { /* a closed channel: play on */ } }
  }, 25);

  loading.then(() => { if (running()) { ambKeep(); musicKeep(); } });
  // lab: what is sounding (sets wanted and their gain, the voice, the trailer's state); read-only, nothing the room relies on
  try { globalThis.__resSound = { sets: () => Object.fromEntries(Object.entries(sets).filter(([, s]) => s.want).map(([n, s]) => [n, { gain: +s.out.gain.value.toFixed(3), cycles: s.cycles.length, files: Object.values(s.def.layers) }])), voice: () => (vo && now() < vo.end ? vo.name : null), said: () => [...saidThisPass], block: () => block, trailer, partSt, INV, charges }; } catch { /* no global */ }

  return {
    setParams(p) {
      const lang = P.lang, ms = P.musicSet; Object.assign(P, p); const t = now();
      if (P.musicSet !== ms && trlSets) useTrailerSets();   // compare the trailer's two music sets live
      if (P.lang !== lang) { for (const n of VOICE_SET) { buffers.delete(n); peaks.delete(n); failed.delete(n); } Promise.all([...VOICE_SET].map(load)); }   // the other language's voice
      musicBus.gain.setTargetAtTime(P.music, t, 0.1); drumBus.gain.setTargetAtTime(P.drums, t, 0.1); fxBus.gain.setTargetAtTime(P.effects, t, 0.1); for (const g of fxGains) g.gain.setTargetAtTime(P.effects, t, 0.1); voiceBus.gain.setTargetAtTime(P.voice, t, 0.1); for (const g of voiceWall) g.gain.setTargetAtTime(P.voice, t, 0.1);
    },
    async stop() {
      try { simBc?.close(); } catch { /* gone */ }
      clearInterval(timer); off?.(); try { bc?.close(); } catch { /* closed */ }
      const t = now();
      for (const h of [...live]) h.stop(0.3);
      for (const name of Object.keys(sets)) musicOff(name, 0.3);
      for (const c of Object.values(clouds)) c.on = false;
      for (const g of [glassPad.g, dawnPad.g, dawnAir, hazePad.g, hazeG, fallSubG, fallRoomG, droneG, droneSubG, threadG, wobG, startG, liqG, liqSubG, turnG, liftG, liftOG, cityG, cityRoomG, cityOG, airG, ...creakG]) ramp(g.gain, 0, 0.1, t);
      for (const o of persistent) { try { o.stop(t + 1); } catch { /* done */ } }
      setTimeout(() => { for (const wi of wallIn) wi.disconnect(); }, 1500);
    },
  };
}
