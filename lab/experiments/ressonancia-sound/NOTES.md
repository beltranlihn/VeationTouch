# Ressonància — sound

- **Status:** prototype
- **Kind:** sound
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
The sound of `ressonancia`: the whole ten-minute work of `ressonancia/GUION.md`, block by block, redesigned (v3) as a
**contemporary, cinematic, electronic-ambient** score in the spirit of `ressonancia/ARTE.md` ("real matter, broken by the
vibration"). Deep sub, granular and spectral textures, slow drones, precise transients, and silence as a dramatic tool. The
Catalan sources — gralla, timbal, tabals, the plaça's crowd, church bells, the correfoc's crackle — are **raw material**
(stretched, granulated, reversed, re-tuned, spread round the room), never a tune: there is no gralla melody anywhere any more.

Every chapter is **its own sound world**, and the music is **adaptive, not linear**: each world is a set of layers (a bed, a
middle, a top; for three chapters, the stems of one take, so they stay sample-locked) that the piece crossfades with the score's
state (`progress`, `floors`, `resonance`, `restless`, `phase`). Transitions are designed: reverse swells, sub drops, a crack, a
cut to silence, the crown's release.

This piece **runs the score** (`score.js`, an identical copy of `ressonancia/score.js`; keep the two files identical) and
**leads**: sound hears a hand land at once and owns the pulse. It steps the score every 25 ms on the wall clock
(`performance.now()`), so the work goes on even if the audio context is suspended (nothing is scheduled while it is not
running; a wanted bed starts late, where it would be, once the context runs or its file arrives).

**Local workaround (clearly marked in `sound.js`):** after every step it posts
`{ type: 'state', ts, pace, s: { ...state, events }, acta }` on `BroadcastChannel('ressonancia')`; the visual follows it. It accepts
`{ type: 'ctl', pace?, jump? }` (rehearsal: `pace` multiplies the score's clock, `jump` calls `score.jump`). Without the channel both
pieces still run, each with its own score from the same hands.

## Solo path / Group path
The score decides how much each goal asks (2–15 people). The sound scales with the crowd:
- two people: every hand is a clear, characterful attack with a long tail on its own wall; the music layers open slowly;
- fifteen: at most 12 hand voices (the oldest yields with a 20 ms fade); each landing hand is softer when many land together
  (1/√n over 0.4 s), a little softer still when the room is full (1 / (1 + 0.05·(hands − 3))), and **each wall carries a load**
  that decays in 0.35 s (1 / (1 + load)): a burst of hands on one wall on the same beat cannot pile up. The hands' thumps in the
  sub get lighter as the room fills (1/√(hands/3)).

## Controls
`voice`, `music` (all the music sets), `drums` (the tronc's pulse, drums and transition hits), `effects` (ambience loops and
one-shots), `touch` (hand sounds).

## Audio — the sound world of each block
| Block | World | What sounds (layers → what moves them) |
|---|---|---|
| wait | embers in the dark | `s-embers-loop` low, the synth drone (D, A, sub D1); a far timbal (`s-timbal` lowered, big reverb, a sub breath) under each hand; `v-wait` at most every 40 s, only when the room is empty and a hand was seen in the last 2 min |
| intro (70 s) | a night square holding its breath | `m-intro` (sub breath and dust → bells smeared into drones → a stretched reed); `s-bells` at 2.5 s from the far wall (re-tuned to D) and again at 46 s, lower; `s-breath-loop` faint 20–50 s; granular reed "memory" from 56 s; voice on the table at the top of `sound.js` (re-timed to `scenes/intro.js`: 8.5 / 17 / 29 / 41 / 53.3 / 66.3 s); hands leave a faint glass glint |
| brasa | fire | `m-brasa` bed (sub rumble, crackle, far processed tabals) → `progress`; `s-fire-loop` grows from 20 % to 100 % with `progress`; `s-embers-loop`; **hand**: `s-ember-burst` (rate 0.8–1.25) + a sub thump; **wave**: `s-tabals` once per wall, 0.16 s apart, from the busiest wall round the room, landing on a deep hit; **awake**: `s-impact` REVERSED (a 5 s swell) into a deep hit and four low stone tones; then the fire sinks into the pinya |
| pinya | bodies | stems of `m-pinya`: `bass` (pressure) 0.5→1 and `other` (warm vowel pads) 0.1→1 with `progress`; `s-breath-loop` 40→100 %; heartbeat (synth, sub + skin) quickening with `progress`; **hand**: `s-clay` + body thump; **wall:n**: a low formant voice and a clay thump on that wall; **close**: the gralla **granulated and turning round the room** (D4/A4/D5 grains on a fast rotor) + `v-pinya-3`; **reward**: a riser into `s-crack` (the clay cracks into trencadís) |
| tronc | stone and ceramic | stems of `m-tronc` (100 BPM, bars of 2.4 s = the score's pulse, started on the play's first instant so its next downbeat is the first `pulse`): `bass` from floor 0, `drums` from floor 1, `other` from floor 3, low-pass opening 1.8 kHz → full at floor 7; **pulse**: synth skin + `s-timbal` (tuned to D) **snapped to the take's downbeat** (±0.2 s); from floor 5 two granular reed drones (D and A) — **out of step the second one detunes by up to 45 cents and beats against the first**; from floor 7 ceramic eighths (D F A C D C A G) round the room on the take's grid; **floor**: `sfx-tile` + a ceramic chime on a downbeat; **hand**: `s-ceramic` re-pitched + a modal ceramic tone tuned to D minor pentatonic (position along the wall → degree, height → octave; low hands add a stone partial); the creak of a leaning tower + sub wobble from floor 3; **reward: everything musical cuts dry** (12 ms, reverb included) |
| pom | air and height | near silence: `m-pom` bed (glassy harmonics, very quiet) and `s-wind-loop` on a slow rotor, low-pass opening with `progress`; a thin sine thread rising D5→D6 with `progress`, flickering when `restless`; a faint heartbeat; **climber:n**: a gust and a riser; **arrived:n**: a glass chord on the light's wall; **hand**: glass tones, very soft, long; **reward**: `m-crown` starts so its reverse swell rises under the last light |
| crown (25 s) | the huge release | `m-crown`'s release lands on the crown (4.0 s into the take); a synth bloom (a D major chord of detuned saws opening to 6.5 kHz), bells round the walls, `sfx-crown` (the square roars) on the crowd rotor, `v-aleta-1` at 2.2 s; from 13.5 s the festa's stems rise from below (bass + other, low-passed) |
| festa | the square resonates | stems of `m-festa` (100 BPM, D major) by `resonance`: `bass` 0.6→0.85, `other` 0.45→1, `drums` in from r ≈ 0.1, full by r ≈ 0.45; low-pass 1.5 kHz → 17.5 kHz; `s-crowd-loop` on a rotor that speeds with `resonance`; above r 0.55 a soaring granular reed (D6/F#6/A6) on a fast rotor; **bloom**: everything open for 5 s, bells round the walls, a deep hit, the crowd swells; **hand**: a tuned FM resonant hit (D major pentatonic by position, octave by height) + a ceramic sparkle, with a **dotted-eighth echo (0.45 s) on its own wall**; low hands add a tuned sub |
| baixada | descent, rain of shards | the festa's drums go first (0.8 s), the rest under a low-pass over 8 s; `m-baixada` (falling glass arpeggios) and `s-rain-loop` on a rotor; **down**: `sfx-tile` + a falling glass note on the next wall round; **hand**: a shard tick + a low glass tone |
| fall | it falls | every set out in 0.4 s; `s-impact` + `sfx-fall` + a deep hit |
| acta (40 s) | tender resolution, embers | `m-acta`; embers; a faint granular reed memory 6–34 s; the outcome line at 4.5 s and `v-cierre-final` at 24.5 s (against `scenes/acta.js`); hands leave a glass glint |

`abandon` fades every set (3 s), stops the voice and the one-shots; the ambience loops stay and settle to the wait's levels.

**Spatial.** Stereo music is spread L → even walls (P4, P2), R → odd walls (P1, P3): the room is never four copies of one signal.
Things that travel use **rotors** (a cos² window round the walls, energy-constant): the wind, the rain of shards and the crowd
(slow; the crowd speeds up with `resonance`), the pinya's turning gralla and the festa's soaring reed (fast). The tabals of a wave
run wall by wall. Hand sounds go to the hand's own wall at its `u` position; tails go to a generated stereo hall (4.2 s).

**The sub, deliberately.** Walls and room are high-passed (4th order, 120 Hz) because the host sums them into the sub; the low end
reaches the sub only through explicit sends: the music's low end (0.22 of the music bus), drum bodies, heartbeat, the hands' thumps,
the creak's wobble. The generated takes are 80–99 % sub by energy, so the lower chapters use a **lift**: the set is louder by N dB
and a low shelf (160 Hz) takes the same N dB off the bottom (intro 6, brasa 4, pinya 4, crown 2, baixada 2); the 100 BPM takes
have a 3 dB **trim** of the shelf alone (their kicks).

**The voice** ducks all music (×0.42). One line at a time: a block's line cuts the previous one, a hint is dropped if someone is
speaking (hints come from the score at most every 25 s).

## Files (`audio/`, all ElevenLabs, made once, played offline; 61 files, 19 MB, mp3 44.1 kHz 128 kbps; largest 1.23 MB)
An exception to the lab's "no samples" rule, asked for by the author. Prompts and settings next to the files:
`audio/music-prompts.json`, `audio/sfx-prompts.json`, `audio/voice-lines-v3.json`. Every file is normalised to peak 1 at load
(the stems of one take share one factor, so their mix is kept); levels are in the `L` table and in each call in `sound.js`.
A file that fails to load logs a warning and the piece goes on without it (a missing stem: the other stems of the set play).

- **Music** (`/v1/music`, `music_v2_5`, prompt + `force_instrumental`): `m-intro` 72 s, `m-brasa` 64 s, `m-pom` 60 s,
  `m-crown` 25 s, `m-baixada` 48 s, `m-acta` 42 s; and three takes of 76.8 s (32 bars at 100 BPM for tronc and festa) that were
  **separated into stems** (`/v1/music/stem-separation`, `six_stems_v1`; only bass / drums / other came back non-silent):
  `st-tronc-{bass,drums,other}`, `st-festa-{bass,drums,other}`, `st-pinya-{bass,other}`. The full mixes are not kept (the stems sum to them).
  Measured: both 100 BPM takes are 100.00 BPM with their first downbeat at 0.045 s (onset grid fit; Chromium's `decodeAudioData`
  gives the same sample timing as ffmpeg); loops are whole bars (bar 1 → bar 31, 72 s) with a 0.25 s crossfade, so the grid survives.
  The crown was generated twice: a composition-plan take (three chunks) came back with 5 s of digital silence and a silent gap;
  the prompt take was kept (reverse swell 0–4 s, release at 4.0 s, sub drops at 9 and 14 s, quiet from 19 s).
- **Effects** (`/v1/sound-generation`, `eleven_text_to_sound_v2`): six seamless loops (`loop: true`: embers, fire, breath, wind,
  rain of shards, crowd) and nine one-shots (bells, tabals, ember burst, clay, ceramic, impact, crack, timbal, and **one sustained
  gralla note**: measured f0 415 Hz = G#4; every grain is re-tuned from it). Kept from v1: `sfx-crown`, `sfx-fall`, `sfx-tile`.
- **Voice** (`eleven_v4`, Lily `pFZP5JQG7iQjIQuC4Bku`, stability 0.5, similarity 0.8): the 26 lines of v2, same texts, with
  audio tags for a closer delivery (`[hushed]`, `[softly]`, `[whispers]` for the pom and "you are the pinya", `[warmly]`,
  `[awed, softly]`). Every line was checked with speech-to-text (`scribe_v1`): the words are right and no tag is spoken. Lily was
  kept: the account's candidates for a hushed narrator (Amaya Calm, Leigha, Serena, the generated "Voice Over Breath") were not
  auditioned because nobody could listen; Lily on v4 with tags is slower and closer than v2 (lines 20–70 % longer).
- Removed (no longer used): `music-intro`, `music-festa`, `music-cierre`, `sfx-embers`, `sfx-floor`, `sfx-shimmer`, `sfx-rain`,
  `voice-lines-v2.json`; the v2 voice lines were overwritten by v3 with the same names.

## Voice in Spanish
- Parameter `lang` ("Voice language": English / Spanish (Spain)); it can change live (the other language's lines are loaded).
- 26 lines in peninsular Spanish (vosotros: the public is in Barcelona), the casteller words kept in Catalan (castell, pinya, seny,
  descarregat, carregat, intent). Script, settings, lengths and speech-to-text checks: `audio/es/voice-lines-es.json`.
- Voice: **Mía Evans** (ElevenLabs voice library, peninsular, `Qvbf0AoA7UZSgJUp8Ba5`), `eleven_v4` with the same expressive tags
  as the English lines; chosen by Vicente from five auditioned voices on 2026-11-23. Used by id from the shared library (not added
  to the account).
- Checked with speech-to-text (scribe_v1): every line says the script, no tag is spoken. "Descarregat" and "Carregat" first came
  out as Spanish-sounding words; the TTS text spells them "Descarregát" / "Carregát" (stress on the last syllable) and they now
  transcribe right (`tts_text` in the JSON). pinya / seny are pronounced the Catalan way (ny = ñ).
- Lengths fit the same intro cues (`INTRO_VOICE_ES` in `sound.js`).
- In the lab: `?sound=ressonancia-sound&soundParams={"lang":"es"}` on a visual page. Tested on the review page: the 26 Spanish
  files load, none in English, no warnings. Nobody has listened to them yet.

## Status and tests
Lab harness only (hidden Electron window, `check.mjs`):
- `node lab/tools/check.mjs "/sound/ressonancia-sound" --delay 5000` → `errors: []`.
- Whole passes with a virtual audience, sound leading (`/experiences/res-obra/simulate.html?people=N&from=<block>&sound=ressonancia-sound`),
  sampling `__labRoom.audio.levels()` every 50 ms for 10 s: no console errors in any block, at pace 1, 4, 12 and 16.
- **Peak meters** (simulated room, P4 P1 P2 P3 / SUB; target walls ≤ ≈0.35, sub ≤ ≈0.6), pace 4, 6 people:
  wait 0.03 / 0.10 · intro 0.25 / 0.30 · brasa 0.24 / 0.47 · pinya 0.27 / 0.49 · tronc 0.29 / 0.61 · pom 0.27 / 0.18 ·
  crown 0.28 / 0.51 · festa 0.33 / 0.43 · baixada 0.26 / 0.11 · acta 0.27 / 0.13.
  15 people: brasa 0.23 / 0.60 · pinya 0.30 / 0.49 · tronc 0.25 / 0.60 · festa 0.31 / 0.44. 2 people: brasa 0.25 / 0.45 ·
  tronc 0.25 / 0.57 · festa 0.31 / 0.22. Runs vary by ±0.05 (random hands); the loudest wall moments are the voice over the
  music and the festa's hits; the sub's loudest are the tronc's pulse over its bass stem and the crown's drop.
- Loop crossfades exercised (brasa bed and the tronc's grid set started near their loop end): no errors, no level jump.
- Missing files (`st-tronc-drums`, `m-crown`, `s-gralla`, `s-impact`, `v-pom-1` moved away): no errors; the rest plays.
- Tronc reward: every channel drops within ~0.2 s of the last floor (meter smoothing included).
- Pace above 1 is rehearsal only: the takes do not speed up, so the pulse cannot snap to the take's downbeat and falls back to the
  score's own time; overlapping events read hotter (sub up to 1.1 at pace 16).

**Nobody has listened.** Not checked by ear: the balance, whether the generated takes are as good as their measurements, the
voice's new delivery against the picture (the intro table is re-timed on paper), the crown's sub-heavy take (it is mostly a drop;
the brightness comes from the synth bloom), the grains of the gralla (could sound synthetic or too nasal), the stem separation's
artefacts, whether the pulse and the take really coincide in the room (computed, not heard), the real app (does the
BroadcastChannel reach the output window? does a hidden audio window throttle the 25 ms timer?), a suspended context or a missing
BroadcastChannel in practice (handled in code only), and the real 4.1 routing (today's map shares channels and has no sub).

## Requests to the studio
See `ressonancia/NOTES.md`: audio samples (an exception to "no samples"), a channel between a visual piece and its sound piece.
