# Ressonància study — Stone

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

The universe of chapter III, *Tronc — Equilibri* (and the material of the crown in V and of *La bajada*): the **trencadís**.
A mosaic of broken glazed tiles closes round the room; dark Ember glaze, the light comes from inside the shards. Over the
structure walls a castell rises floor by floor: each floor lands hot and settles, stone → bone → terracotta → fire red, narrowing
as it climbs. It leans when it is not held, its top trembles, the pinya breathes on the pulse, it is crowned in gold, and it
comes down in a slow rain of heat.

Scene module: `lab/experiments/ressonancia/scenes/stone.js` (host contract in `scenes/host.js`), ported from the approved
Ember look of `ressonancia/experience.js` (other looks, director coupling, guide rings and caption removed; bloom and tone map
are the host's).

- **Arrive:** at 0 the walls are dark dry clay (terracotta / ochre, low raking light, pools at the wall centres — chapter II's
  last image) with faint glowing hairline cracks. As `arrive` rises the cracks open and burn, the shards separate (the grout
  widens), tilt, glaze over and darken, spreading out from hand height with a noisy front; each shard glints once as it settles.
- **Floors with character:** above 2.05 m the mosaic is laid in nine **courses**, one per floor (2.05 m .. height − 0.28 m),
  each with its own shard width (×0.86–1.22) and a wobbly mortar joint with a faint warm lip where the tower stands. Ragged,
  per-shard tower edges. The floor being built (`floorProgress`) shows as a faint ghost course.
- **Lean:** the tower's frame is sheared sideways with height (smoothstep from 2.05 m to the current top, `lean × 0.5 m` at the
  top) inside a soft window round the tower; |lean| > 0.45 or `weak` makes the top three floors tremble (shear jitter + flicker).
- **Pulse:** the pinya band (0.70–2.05 m) of the structure walls breathes brighter on each pulse, with a swell over the last
  30 % of the beat.
- **Crown:** gold runs round the top band from one tower both ways (two gold lanterns ride the fronts, they meet on the far
  side at crown ≈ 0.6); every tower gets a gold top; from 0.45 the whole mosaic lights from inside, the towers most.
- **Coming down:** when `floors` drops, the top floor dissolves: its heat rains down the wall and its shards fall as small
  glowing triangles (CPU particles, ≤ 3072, slow terminal speed ≈ 0.9 m/s, swaying, cooling). **Fall:** all floors let go top
  first (gold tops first), ≈ 0.5 s apart, then the pinya dims: ≈ 6 s.
- **Solo path:** one hand is a lantern: raking light over the glaze at once, and it warms the shards under it.
- **Group path:** many hands reach a little further; with 30 hands the base becomes a field of embers.

## How `input.state` is read (in the piece)

`walls[]` (towers only there), `floors` (rise one at a time every 0.35 s, come down one at a time every 0.6 s with a dissolve),
`floorProgress` (ghost course), `beat` (swell), `lean[]`, `weak[]` (÷2, clamped), `block` (`tronc`: arrive 0→1 over the first
7 s of the block unless `state.arrive` is given, pulse on; `crown`: crown = progress / 0.4; `festa`: crown 1; `baixada`: crown
0.55; pinya on in tronc/pom/crown/festa/baixada/fall). Events: `'pulse'`, `'fall'`. `'floor'` / `'down'` are not needed: the
scene follows the change of `floors`. After a fall the towers stay down until the block is neither `fall` nor `acta`.

## Controls (study parameters)

- `arrive` (0..1, default 1) — clay → shards. `floors` (0–9, default 6; **0 = driven by `progress`**, whose fraction is the ghost
  course). `walls` (2 / 3 / 4: towers on walls [0, 2], [0, 1, 2] or all). `lean` (−1..1, all towers; + = to the right).
  `crown` (0..1). `fall` (bool: flipping it to true triggers the fall; back to false rebuilds the towers). `pulse` (bool: a
  free-running 2.4 s pulse). `tile` (shard size, 0.08–0.3 m; rebuilds the grid). Plus `progress`, `brightness`, `bloom`, `quality`.

## Status and tests

- `check.mjs` clean (no console errors) at `scale=1` with 0 hands, group 4, 30 pinned hands; arrive 0 / 0.45 / 1; floors 0–9;
  walls 2 / 3 / 4; lean ±0.7–0.8; crown 0.3 / 1; a down (7 → 4); a fall from 8 floors and from 9 floors crowned with 30
  hands; `tile` 0.1; `quality=low`.
- fps at `scale=1` (7196×912), hidden Electron window on the development Mac (vsync-capped: "≥ 60"): **60 fps with 0 hands,
  60 with 30 pinned hands, 60 at arrive 0.4 with 30 hands, 60 during a fall with 30 hands and crown 1.** (A first version with
  one 36-iteration light loop measured 36–47 fps; split into a hands loop + 4 glints it holds 60.)
- Seam: hands pinned 0.33 m and 27.25 m round the room: lanterns, heat and courses continue across P3→P4; the crown's gold
  crosses it; falling shards are drawn at ±one perimeter.
- Looked at: every state above (still frames).
- NOT verified: motion over time (the tremble, the pulse breath and its swell, the arrive transition as an animation, the rain
  over 6 s) — only stills; GPU time per frame (no timer query) and the room's RTX with a shared GPU; the real engine
  (`lab-engine.mjs`), the LiDAR feel (**L**); driving it from the real `score.js` state (only the study stand-in);
  that `arrive = 0` matches the last frame of `earth.js` (`crack = 1`) closely — same palette and light, not the same crack
  pattern (earth's cracks are its own Voronoi; here the cracks are the mosaic's own grout).

## Requests to the studio

- The host passes no `state` / `events` yet (`runStudy` builds `{ time, dt, hands, downs, ups, progress, params }`): the scene
  reads `input.state` and `input.events` when present and otherwise builds the same shape from its parameters.
- An `arrive` (or chapter-local time) field in the state would let the piece's host time the clay → shards transition with
  chapter II's reward; today the scene derives it from the time since `block` became `tronc`.
- The host passes no timing to `draw`; the scene keeps the last `step` time itself.
