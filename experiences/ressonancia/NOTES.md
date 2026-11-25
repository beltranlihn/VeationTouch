# Ressonància

- **Status:** prototype
- **Kind:** visual (the sound piece `ressonancia-sound` is not started yet)
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
A castell of light raised by many hands, for Barcelona XR Lab × Alma Digital Studio. The whole work is one living trencadís
(a mosaic of broken glazed tiles) round the four walls. The public is the pinya: it does not watch the castell, it holds it.
One hand lights a fragment; many hands together make the room rise. Source: `Ressonancia_Propuesta_y_Presupuesto_AlmaDigital.pdf`
(five movements); the older three-state narrative (Freqüència / Pulsió / Ressonància) stays as the emotional arc underneath.

**The work is narrative and guided.** The room is open in 30-minute blocks with free entry (up to 10–15 people at once), so nobody
explains it: every wall carries a hand target (a ring with a hand: "put your hand here") and one line of text above it that says
what to do now; a voice-over will say the same. Look: **Ember** (chosen by Vicente): dark glaze, light from inside the shards.

## The five movements (`director.js`, a pure state machine fed only with hands: how many, which walls, when they land, how still)
| Movement | What the public does | What the room does | Text on the walls |
|---|---|---|---|
| I. Brasa | touches anywhere | an ember line breathes at hand height; hands are lanterns and wake embers; hands landing together send a wave round the room | Touch the wall |
| II. Pinya | puts a hand in the target of as many walls as it can | each held wall lights its hearth and gathers a stone base; arcs of the rotllana grow from held walls and, joined, turn | Hold every wall · n of 4 walls held |
| III. Tronc | keeps hands down on the pulse (a fresh landing on the beat counts double) | a ring closes on each target with the pulse; floors are fixed one by one, stone → bone → terracotta → fire red; an unheld wall's top floors tremble | Press on the beat · Floor n |
| IV. Pom de dalt | stays still, hands on the wall | the enxaneta, a gold light, climbs the castell in one turn round the room; it flickers if hands move | Hold still |
| V. L'aleta | — | gold runs round the top of the four walls, each tower is crowned | Crowned · 4 de 7 |
| Baixada | keeps holding while it comes down | a floor dissolves every 1.7 s, its heat rains down | Keep holding |

Endings: **descarregat** (crowned and brought down), **carregat** (crowned, but everybody let go on the way down), **intent** (it fell
before the crown). Then the *acta* line ("4 de 7 · descarregat — 14 hands · 22 s of silence") and back to Brasa.
The structure follows the walls held when the pinya locks: 1 wall *pilar* (a slender tower), 2 *torre*, 3 *tres*, 4 *quatre*.
The room never stops: each movement has timeouts that carry a group forward (see `TIMES` in `director.js`).

## Solo path
One visitor wakes the embers, holds one wall (the pinya locks after ~14 s on the walls held), raises a *pilar* by keeping a hand on
the target through the pulses, stays still for 14 s and crowns it. Complete on its own, about 3 minutes.

## Group path
Four walls held at once close the rotllana and lock a *quatre* in 2.5 s. Landing hands together on the pulse raises floors 2.5×
faster than just holding (9 floors in ~45 s against ~2 min). Stillness needs every wall of the structure held and quiet.

## Controls
- Hands only. Targets: one per wall, centre of the wall at 1.25 m, 60 cm across; any hand on the wall counts (tolerant).
- `director`: The work / Study (manual `floors`, `structure`, `crown`). `jump`: go to a movement (rehearsal). `pace`: speeds the
  director's clock (rehearsal). `guide`: targets and text on/off. `look`, `tile`, `glow`, `fade`, `ambience`, `brightness`, `bloom`, `quality`.

## Audio
None yet. Planned as `ressonancia-sound`: timbal (the pulse), gralla (theme in layers, one per floor), a low drone; silence in Pom de
dalt; plus, at Vicente's request, **ElevenLabs sound effects and voice-over** as audio files in the folder (see Requests).

## Status and tests
- Lab harness, `check.mjs`, `?scale=1` (7196 × 912), no console errors: Brasa with no hands; the whole chain Brasa → Pinya → Tronc
  with four pinned hands (5 floors after 58 s of only holding); Pinya with two walls held; Pom de dalt → crown → L'aleta. Captures
  looked at. 60 fps measured in the hidden Electron window on the development Mac (not the room's GPU).
- Not done: baixada and the three endings by eye, the acta's layout, LiDAR feel (L), body scale (B), a hand pinned on the P3 → P4
  edge, the real engine (`lab-engine.mjs`), wall height 3.5 m, the solo path timed by hand.
- Known: text uses the system font stack (Geist if installed); the tower floors are one tile row each (0.16 m).
- Human base meshes: Quaternius Universal Base Characters (CC0), quaternius.com — `scenes3d/assets/models/human/` (geometry and
  skin only, `LICENSE-quaternius-CC0.txt`). The figures of the 3D work are particles sampled in volume from them (`scenes3d/bodykit.js`,
  `scenes3d/bodykit-gltf.js`).

## Requests to the studio
- **Audio samples.** Confirm an exception to "no samples" for this work (ElevenLabs sound effects and voice-over as audio files inside
  the sound piece's folder, decoded with `decodeAudioData`, no network at run time), or say how voice-over should reach the room
  instead (e.g. as the audio of a HAP clip).
- **A channel between a visual piece and its sound piece.** The movements need one shared state (movement, beat, floors). The runtime
  gives none. Planned local workaround, clearly marked: the sound piece runs `director.js`, leads and posts its state on a
  `BroadcastChannel` (all app windows load from the same origin); the visual follows, and runs its own director if nothing arrives.
  Untested in the room.
- **On-wall text and targets.** This work needs instructions on the walls (the director asked for a wordless house style; Vicente
  asks for clear guidance for a free-entry public). Text is English for now; Catalan or Spanish will follow.
- **A font.** A self-hosted typeface for the wall text (the lab has none; `reel` ships Raleway).
- **Persisting the "acta del castell".** An experience cannot write to disk: the acta can be shown on the walls, not archived.
