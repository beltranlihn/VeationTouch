# Ressonància — sound

- **Status:** prototype
- **Kind:** sound
- **Author:** Vicente
- **Updated:** 2026-11-24

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
The score decides how much each goal asks (1–15 people; since 2026-11-24 a single visitor — peak of hands ≤ 2 — is `solo`: the calls
need 1 hand, the pinya 1 wall, the echo returns to its own wall; see res-obra3d/NOTES.md › Solo path). The sound scales with the crowd:
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
| wait | the threshold (umbral3d) | `s-embers-loop` low, the synth drone (D, A, sub D1); a far timbal (`s-timbal` lowered, big reverb, a sub breath) under each hand, softer; **the tiles' impacts** from the visual (`fx:impact`, below); glass motes that gather, more and brighter, with `reveal`; **reveal**: a glass chord round the walls over a low breath; while the start ring fills, a glass tone rising D4 → D5 (with its fifth); **start**: a burst of tiles and glass round the room; `v-wait` at most every 40 s, only when the room is empty and a hand was seen in the last 2 min |
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
- 2026-11-24: `v-intro-6` («Poned las manos sobre el muro» at 66.3 s) is silenced in both languages: the score does not listen in
  the intro; the brasa asks.
- 2026-11-24, interaction plan (approved by Vicente): 7 new lines × ES/EN, same voices/settings/tags, checked with scribe_v1:
  `v-pinya-wait` (pinya title: «Alguien espera vuestra mano.»), `v-pinya-closein` (when the figures start to lead the hands, unless
  packed: «Juntaos. Hombro con hombro.»), `v-tronc-lift` (tronc title: «Ahora, levantad. Cada piso sube con vuestras manos.»),
  `v-tronc-wobble` (on 'wobble': «Tiembla. Sujetad la base.»), `v-aleta-raise` + 1.5 s + `v-aleta-yours` (when l'aleta's window
  opens: «Ella levanta la mano.» … «Levantad la vuestra.»; the second is dropped if the group already crowned), `v-baixada-gently`
  (baixada entry: «Despacio. Piso a piso.»). Silenced (kept on disk): v-pinya-1, v-pinya-2, v-tronc-1, v-tronc-3, v-aleta-1,
  v-baixada-1; hints more/hold/beat/lift/foot are silent. `v-aleta-crowned` = v-aleta-1 trimmed after its first sentence
  (ffmpeg at the pause: EN from 2.23 s, ES from 1.86 s, fades 30/120 ms; originals kept; scribe_v1: «The castell is crowned» / «El castell
  está coronado»), said 1.6 s after the crown. A line never repeats in a pass (the wait's calls are between passes).
- 2026-11-24: `v-wait` is no longer used (the start button is revealed by play). New lines, both languages, same voices/settings/tag,
  checked with scribe_v1: `v-wait-invite` («Tocad. Jugad con la sala.» / «Touch. Play with the room.»: the empty room's call before
  the reveal) and `v-wait-start` («Mantened la mano en el círculo.» / «Keep your hand in the circle.», re-recorded 2026-11-25: 1.4 s after 'reveal').
- **Spanish is the default** since 2026-11-24 (Vicente: all the work in Spanish). Parameter `lang` ("Voice language": Spanish (Spain) /
  English); it can change live (the other language's lines are loaded).
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

## Physical impacts from the visual (`fx:impact`)
The visual parts post their physical events on the same `BroadcastChannel('ressonancia')`:
`{ type: 'fx', fx: 'impact', wall, u (0..1 along the wall), strength (0..1), mat, kind }`. `impact()` gives each matter its timbre,
tuned to the chapter's mode (brasa, pinya, tronc, fall: D minor pentatonic; the rest D major pentatonic; position → degree):
- mat: `ceramic` `chrome` `glass` (umbral), `fire` (brasa's burning tiles), `wire` (pinya's wire cubes), `stone` (tronc's pieces),
  `line` (pom's line tiles), `petal` (pom's gardens); unknown → ceramic.
- kind: `hit` (a chime of the matter), `floor` (lands: tile clack / low stone / thin wire tick; pom's: far below, a reverberant tick),
  `break` (crack + chips), `hook`/`lock` (back in place: a clack in tune), `splash` (a metal drop falling in pitch; fire hisses),
  `sink` (a glide into the sub), `ignite` (ember burst + low breath), `slide` (a band-passed scrape; ≤ 1 per wall per 0.15 s),
  `bloom` (a soft rising glass arpeggio); unknown → silent.
- Density (2026-11-24): impacts on one wall < 90 ms after the last one that rang there join its cluster (a small tick an octave up into
  that voice, ≤ 8, no new voice or clack); each impact's level falls with the rate of the last second (1/√(1 + rate/4)); the tile clack
  thins and the low body drops out in a rain; pitch varies with the piece's `size` (m, optional in the message). Cap 20 a second.
- Before that: at most 14 a second in all, through the hand voices (12-voice cap); each wall carries a load that decays in 0.35 s, shared with the
  hands, so a burst on one wall cannot pile up. Silent test: bursts of 9–12 full-strength impacts on one wall per chapter → walls
  ≤ 0.25, sub ≤ 0.21. The sending snippet for parts is in `lab/estudio/notas/ENT.md`.

## Room movements (wave 2)
The parts move their worlds; the sound follows the score state that drives them (`follow()` › "the room movements"):
- brasa (the room sinks into liquid chrome, ∝ progress): a breathing band-passed viscous churn + its body in the sub, slow low bubbles;
- pinya (the pinya turns with the rotllana once `closed = 1`): a soft rush of bodies on a rotor round the walls, out within ~7 s of the reward;
- tronc (the elevator beside the tower): a low stone grind + a low fifth (D1/A1) ∝ the smoothed rise speed of floors + floorProgress,
  brighter higher up; it goes with the reward's dry cut;
- pom (1.6 → 90 m, 45° turn): the city's hum falls away (low noise + low D/A, (1 − progress)^1.6, closing low-pass) and the thin air of
  altitude opens (band-passed noise 2.2 → 7.2 kHz ∝ progress) on the wind's rotor; the wind field turns 45° with the world over the rise.

## Colours of the re-made chapters (wave 2)
- festa (a plate of chrome and glass): a glass-harmonica shimmer in D major (D5 F#5 A5 D6) on the fast rotor, opening with `resonance`;
- baixada at dawn (lighter, major, airy): an open D add9 pad (D4 A4 E5 F#5 A5, triangles, low-pass 1.2 → 3.6 kHz) that comes in with
  the descent and lingers 8 s into the acta, and the morning air (noise at 5.2 kHz on the rain's rotor); `glass` landings are high glass ticks;
- pom's golden haze (progress ≈ 0.55–0.65): a high golden chord (D6 F#6 A6 D7) and a bright breath on the wind's rotor, a gaussian
  bell centred on 0.60;
- fall (the assemblage tower collapses): a rumble that dies in ~6 s under the fall's hits; the part's `stone` impacts at 0.3 within
  `fall`; the fall's deep hit's sub 0.9 → 0.7 and its tile-transition gain 0.6 → 0.3 (measured: walls 0.34, sub 0.64 with 12 impacts).

## The intro's tear (INT, T-034)
From 46.3 to 57.8 s the host tears the square into slabs of image (it no longer breaks into floating panels). `follow()` marks it:
a crack (`s-crack` at 0.8) and a sub drop at 46.3 s; a wandering band-passed rip (0.5–3.2 kHz) that rises in 1.2 s, holds to ~51.8 s
and thins under the motto (voice at 53.3 s); slab clacks (`sfx-tile`) and glass glints running round the walls from P4 both ways
(densest at ~48.5 s); a glass glint per wall when the last slab settles at 57.8 s. The low bells moved from 46 to 46.3 s.

## The score's new inputs and l'aleta (2026-11-24, interaction plan steps 0–1)
- The piece builds each hand for the score as `{ stroke, wall, dx, y (v × wall height), vx, vy, size, s (m along the perimeter), speed }`.
- L'aleta: the score's `pom` block has a phase `'aleta'` (an 8 s window after the reward) in which the group crowns the castell by
  raising its hands. A swell (band-passed noise 0.3 → 4 kHz and a saw D3 → D4 through an opening low-pass) rises under the window; on
  the trigger it is cut in 30 ms and `m-crown` starts at its release (4.0 s into the take), so the crown lands on the group's gesture;
  the crown's glass glints grow with `aletaWidth`. `m-crown` no longer starts at the pom's reward.

## Tronc = lift and level, baixada = bring it down (2026-11-24, plan steps 2–3)
The tronc's pulse stays (the take's grid, the timbal); the score now judges 4.8 s phrases (gather → rise → lock). Sound: when a rise
begins, a soft ceramic line climbs round the tower's walls (D minor pentatonic) with a breath; `lift` a ceramic chord; `level` a glass
note; `wobble` (the tower trembles: 5 s to bring hands to its foot) drops the music to 0.12 with a crack and a low rumble (the creak
follows the lean); `steady` a deep hit of relief and the music back; `slip` a crack and tiles sliding down. Baixada: `lower` a falling
glass triad and a soft low; `crack` a crack and spilt shards. Silent harness test: tronc walls ≤ 0.30, sub 0.58; baixada ≤ 0.32, sub 0.12.

## Pinya = gather (2026-11-24, plan step 4)
A wall fills by how packed its hands are, not by time. `pack:w` (a wall has packed) sounds as a low wordless voice and a soft clay
thump on that wall; `wall:w` (full) as before.

## Brasa: the call (2026-11-24, plan step 6)
`call`: two timbal toks on the calling wall and the TOK (lower, louder) on the answering wall or on all four, `call.gap` apart (0.8 s,
slower after a miss); the big wave as before (tabals round the walls, a deep hit); a missed call's small wave = one soft tabal.

## La ressonància: free → echo → call → bloom (2026-11-24, plan step 7)
`front`: a soft noise band that leaves one wall and reaches the opposite one over the 3 s travel, a glint on arrival; `echo`: a resonant
FM hit an octave up per rebound on the returning wall (`ghost`, the room's return, softer); the call as in the brasa on all four walls;
the final `bloom` grows with `bloomSize` and lasts `bloomDur`. Silent harness test (pace 6): walls ≤ 0.33, sub 0.50.

## Tile transitions (INT, T-028)
On every block change the visual breaks the whole room into tiles; their peak lands at 0.15 s + half the move's duration
(`res-obra3d/experience.js › MOVES`, copied into `TILE_DUR`). `tileSweep()` marks it: a band-passed noise swell rising round the
walls into the peak, then per wall a tile clack (`sfx-tile`) and a glass glint, and a soft deep hit (`TILE_GAIN`: quieter where the
music already hits — crown, festa, fall).

## Status and tests
- 2026-11-24 (ENT): `check.mjs /sound/ressonancia-sound` → `errors: []`; the 3D study `?part=umbral3d&group=4&sound=ressonancia-sound` →
  no errors; 12 impacts at once on P2: P2's meter 0.022 → 0.134, the other walls unchanged. Silent checks only; nobody has listened.
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
