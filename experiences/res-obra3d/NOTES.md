# Ressonància — the whole work in 3D

- **Status:** prototype
- **Kind:** visual (pairs with `ressonancia-sound`)
- **Author:** Vicente (studio agents: INT)
- **Updated:** 2026-11-24 (T-052)

## Concept
The whole ~10-minute work (GUION.md) in 3D. The score (`../ressonancia/score.js`) walks the pass — wait, intro, Brasa, Pinya, Tronc,
Pom de dalt, the crown, the resonance, the way down (baixada), the fall, the acta — and every block shows its universe as a set of 3D
parts (`../ressonancia/scenes3d/parts/`, contract `PARTS.md`) in the CAVE of `room3d.js`. Universes arrive by assembling from fragments
and leave by breaking into fragments (the work's transition language): the host runs `input.leave` of the outgoing part and
`input.arrive` of the incoming one at the same time, over ~5 s, so they cross.

| Block | Parts | Stand-in while a chapter part is missing |
|---|---|---|
| wait | umbral3d alone (the threshold, ENT: its own floor, horizon and lights) | brasa3d embers + atmos, else atmos |
| intro | plaza + atmos + castell + introtext, on the intro's clock | — |
| brasa | brasa3d + atmos | atmos |
| pinya | pinya3d + atmos | castell: each wall's pinya condenses with its fill |
| tronc | tronc3d (the assemblage tower, 3D-FE; it carries its own bodies) + atmos | plaza (reassembles) + castell on the castell's walls, built floor by floor, leaning with `lean[w]`, trembling with `weak[w]` + atmos |
| pom | pom3d | plaza + castell (the pom de dalt climbs with progress) + atmos |
| crown, festa | festa3d | plaza + castell crowned + atmos |
| baixada | plaza + castell (comes down floor by floor) + atmos | — |
| fall | the castell dissolves (~6 s) and the square shatters (whatever of them was there) | — |
| acta | actatext + atmos | — |

Parts without arrive/leave are driven by their own means: plaza `shatter`, castell `buildPer`/`disPer`/`tilt` (per-wall options added
to `castell.js`, backward compatible), atmos its `dust`/`haze`/`line` amounts, introtext its own fade. Outside the intro atmos gets
`t = 69` (its held state). A part that is gone is hidden and no longer updated. Every material is precompiled at load
(`compileAsync`) so a universe arriving later does not stall the room.

The guide (`../ressonancia/scenes3d/guide3d.js`): hand targets (a 60 cm ring with a hand icon at 1.25 m on the wall plane, 2 cm behind
it; a soft dark disc under it; the pulse ring closing on it in Tronc; a progress arc; 1–3 per wall in Pinya by `state.buttons`; on the
castell's walls only from Tronc on; both sides once `state.balance`) and the words (chapter cards ~2.15 m, instruction line ~1.92 m;
the same wording as `res-obra`), drawn into canvas textures on a soft dark plate, cross-fading when the words change.

## Transitions, the global eye, the colour script (T-028, 2026-11-24)
- **Tile transition** (the work's signature; ARTE-2 §7, refs 13/14). On a block change where some part leaves, room3d renders the
  outgoing world into a second HDR strip and the incoming one into the usual strip (the host's `pass('out'|'in')` hook shows each
  world's parts; parts kept from one block to the next, e.g. atmos, are in both) and composes them through a quadtree field of tiles
  (~0.45 m, halves and quarters; integer count across the strip, so it wraps at P3|P4): each block lifts, shrinks and slides in its
  slot showing the old world, the new world shows dark behind it, it flips with an iridescent rim and locks back in as the new world.
  Pixel-sorting bands smear rows where blocks are in flight. 2.6–4.2 s per destination (`MOVES` in experience.js), from the centre of
  a random wall both ways round the room. Parts keep their own arrive/leave, now 4 s (was 5).
- **The guide is in `room.overlay`**: drawn after the tiles, so the words and targets never break.
- **Global eye**: every part hangs from a host rig; during a transition the outgoing world and the incoming one move with one gesture
  (rise for tronc/pom/crown, sink for brasa/baixada/fall, turn for pinya/festa, step back for the acta): ≤ 2.2 m and ≤ 7°, smootherstep
  over ~4.5 s (peak ~0.8 m/s, ≤ 2°/s). Shared parts do not move. All rigs are back at identity when the transition ends.
- **Guiding thread**: one small thing per wall in `room.overlay` (over the tiles), ~1.5 m right of each wall's centre on the wall plane
  (clear of the card and the target): it is born in the old world (~8.5 m), comes to ~4.2 m at the peak and goes deep into the new one,
  morphing old shape → a tile (the trencadís) → new shape (point / tile / line per block), old accent → new accent.
- **Colour script** (`PAL`): per block warm / cool / air for atmos (dust, line, haze) and a tint for castell (dawn pink in the baixada).
  The amber night is the intro's alone.
- Second pass (24-11): slabs carry the image (stretched into the cracks, bevel and drop shadow, iridescent leak only where there is
  light, vertical pixel-sort), one wave (half the room in ~1.6 s); the old world held whole under the slabs. The intro's square tears
  into the same slabs at 46.3–57.8 s (plaza `noBreak`), then hides; the square reflects its own captured environment. Horizon line:
  full in the intro only, elsewhere thin in the block's accent. baixada / fall keep tronc3d (3D-FE).
- Lab switches: `?tiles=0` (the old crossing), `?eye=0`, `?aa=taa` (temporal AA instead of MSAA; also params `tiles`, `eye`, `aa`).

## Solo path
(Corrected 2026-11-24, ENT, score batch T-045.) One person can play the whole pass. When the peak of hands is ≤ 2 the score is in
`solo`: the calls (brasa, final call) need 1 hand, the pinya needs 1 wall (the castell is a *pilar*), the echo front goes round and
comes back to the same wall (or the next one). A hand already resting on the wall counts half at a call's TOK if it moved > 10 cm or
landed < 2 s before. Pom: the light passes through any wall with still hands; only an empty room falls (20 s, warned at 10 s).
Bajada: every hand counts (walls without the tower at half), a 35 cm descent brings two floors down. Measured in node through a
LiDAR-like feed (10 Hz, 150 ms late, ±2 cm, 6 % dropped readings, 1 % new ids), one hand: wait revealed in 36 s and started at 43 s;
brasa 3/3 calls; pinya closes at 50 s; tronc 7 floors; pom crowns (aleta 0.96); festa 18 echoes, bloom 1.0; bajada descarregat in 33 s.

## Group path
As in res-obra: 2–15 people; Pinya asks for more walls and more circles, the castell stands on the walls the group held.

## Controls
Hands only. Parameters: `jump` (rehearsal: go to a block), `pace` (score speed, 0.5–8), `guide` (targets and words), `bloom`, `exposure`,
`quality` (low / medium / high: render scale 0.6 / 0.8 / 1, MSAA 0 / 0 / 4, castell particle density 0.4 / 0.6 / 1; default high =
the room's RTX 6000 Ada), `renderer` (auto / WebGL2).
Lab only: `?parts=a,b` loads only those parts; `?q3=low|medium|high` overrides the quality (review page).
**Room thresholds (T-052, live):** `tuning` (lab = the score's TIMES / sala = a tolerant start for the real S2E) and 37 `t.<block>.<field>`
params (`../ressonancia/tuning.js`): applied to the score at once, no reload, and sent to the sound piece as `ctl { times }` (needs the
small sound.js patch in `lab/estudio/notas/TUN.md`; until then they only rule while this page runs its own score). A param moved by
hand beats the preset. `mode` (auto / room / lab, read at load): in the room the lab URL switches (`?q3 ?tiles ?eye ?aa ?parts`) are
ignored; auto = room when the app opens the page (`?run=1`). Room test guide: `lab/PRUEBA-SALA.md`.

## Audio
None here: `ressonancia-sound` leads the score when it runs (BroadcastChannel `ressonancia`, a LOCAL WORKAROUND as in res-obra); without
it this page runs its own score.

## Status and tests
- `review.html`: the 3D work alone with the virtual audience (`../res-obra/autopilot.js`), two-row view from the canvas stream, timeline,
  the harness volume fader; `?people=`, `&from=`, `&q3=`, `&params={"pace":4}`.
- Smoke (2026-11-23, M1 Max, WebGPU, quality low, hidden Electron window): every block reached by jumps in two runs with no console
  errors; each block captured and looked at (see `lab/estudio/notas/INT.md`). No fps measured yet (GPU turn).
- Whole pass with the virtual audience in stretches (review.html, `&from=` each block, pace 8): wait → … → acta → wait, no console errors; pom3d vertex-buffer error fixed by 3D-PO (re-checked at quality high).

## Requests to the studio
- Same as res-obra: a channel between a visual piece and its sound piece (the BroadcastChannel is a lab workaround).
- **Two instances publish twice** (analysis §5 #26). In the app the page runs twice (the room instance and the viewer); both post
  `fx:impact` and `ctl` on the BroadcastChannel (8 parts and `experience.js`), so the sound hears every impact and every jump twice.
  Proposed lab patch, for the studio to decide: only the room instance publishes (`vt.sink !== 'viewer'`). In the medium term the
  official visual ↔ sound channel above removes the need.
- **A common stroke id for the visual and the sound piece** (§5 #27). `experiences/runtime.js` gives each piece its own stroke ids, so
  the two pieces cannot tell that they are hearing / seeing the same hand. Request: one `stroke` shared by both pieces (or the sound
  piece receives the same ids as the visual one).
- (§5 #28, folding duplicate hands: today only in the visual host; ENT is moving it into `score.step`, shared by both pieces. No
  studio action.)
- **D-10 · the visual hands arrive ~150 ms late, by design.** The runtime plays the hands of a visual piece back 150 ms late
  (`experiences/runtime.js`); with the frame and the projector the image answers a hand in ~200–250 ms. The sound piece gets `down`
  at once. So «an answer in < 100 ms» holds for the sound only; the image answers as fast as the runtime allows. For the studio:
  nothing to change unless the room's playback delay is meant to be tunable.
- **D-09 · exceptions to the lab contract, decided by Vicente — the studio's OK is needed.** All the work's visible text is in Spanish
  (castellers' words in Catalan), not English; and the sound piece uses ElevenLabs-generated samples and voices
  (`ressonancia-sound/audio/*.mp3`, ~19 MB) instead of synthesis only. Both are deliberate for this work (RESSONANCIA.md §9.6).
- room3d.js: nothing blocking. Nice to have: a per-object "skip in this wall's view" (the guide and texts are drawn by all four cameras;
  they are culled by each camera's frustum, so the cost is small).

### 2026-11-23 late
- Tronc/baixada: the castell stands at 6.5 m with `fit` off (big and close; its top leaves the walls as the floors rise), light ×1.75.
- Acta: larger, warmer words on darker plates; the square's lamps, sky and windows go out first as it leaves.
- `room3d.js`: the bloom now wraps horizontally (RepeatWrapping on BloomNode's bright and blur targets): a halo at the P3|P4 seam
  continues across it (edge luma 100 vs 8 before, 84 vs 79 after, light 8 cm from the seam).
