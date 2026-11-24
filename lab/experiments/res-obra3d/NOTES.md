# Ressonància — the whole work in 3D

- **Status:** prototype
- **Kind:** visual (pairs with `ressonancia-sound`)
- **Author:** Vicente (studio agents: INT)
- **Updated:** 2026-11-23

## Concept
The whole ~10-minute work (GUION.md) in 3D. The score (`../ressonancia/score.js`) walks the pass — wait, intro, Brasa, Pinya, Tronc,
Pom de dalt, the crown, the resonance, the way down (baixada), the fall, the acta — and every block shows its universe as a set of 3D
parts (`../ressonancia/scenes3d/parts/`, contract `PARTS.md`) in the CAVE of `room3d.js`. Universes arrive by assembling from fragments
and leave by breaking into fragments (the work's transition language): the host runs `input.leave` of the outgoing part and
`input.arrive` of the incoming one at the same time, over ~5 s, so they cross.

| Block | Parts | Stand-in while a chapter part is missing |
|---|---|---|
| wait | brasa3d (embers) + atmos | atmos |
| intro | plaza + atmos + castell + introtext, on the intro's clock | — |
| brasa | brasa3d + atmos | atmos |
| pinya | pinya3d + atmos | castell: each wall's pinya condenses with its fill |
| tronc | plaza (reassembles: shatter 1 → 0) + castell on the castell's walls only, built floor by floor, leaning with `lean[w]` (±7° about the wall's normal), trembling with `weak[w]`, a warm flash on each floor + atmos | — |
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

## Solo path
As in res-obra: the score sets every goal by the group it estimates (2 people minimum); one or two visitors can play the whole pass.

## Group path
As in res-obra: 2–15 people; Pinya asks for more walls and more circles, the castell stands on the walls the group held.

## Controls
Hands only. Parameters: `jump` (rehearsal: go to a block), `pace` (score speed, 0.5–8), `guide` (targets and words), `bloom`, `exposure`,
`quality` (low / medium / high: render scale 0.6 / 0.8 / 1, MSAA 0 / 0 / 4, castell particle density 0.4 / 0.6 / 1; default high =
the room's RTX 6000 Ada), `renderer` (auto / WebGL2).
Lab only: `?parts=a,b` loads only those parts; `?q3=low|medium|high` overrides the quality (review page).

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
- room3d.js: nothing blocking. Nice to have: a per-object "skip in this wall's view" (the guide and texts are drawn by all four cameras;
  they are culled by each camera's frustum, so the cost is small).

### 2026-11-23 late
- Tronc/baixada: the castell stands at 6.5 m with `fit` off (big and close; its top leaves the walls as the floors rise), light ×1.75.
- Acta: larger, warmer words on darker plates; the square's lamps, sky and windows go out first as it leaves.
- `room3d.js`: the bloom now wraps horizontally (RepeatWrapping on BloomNode's bright and blur targets): a halo at the P3|P4 seam
  continues across it (edge luma 100 vs 8 before, 84 vs 79 after, light 8 cm from the seam).
