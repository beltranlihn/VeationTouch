# La Torre — `parts/torre3d.js`

- **Status:** prototype (early screenshots sent for Beltrán's approval)
- **Kind:** visual (part of res-trailer, after the pinya; sound reads `progress()` and `events`)
- **Author:** Claude for Beltrán (brief through the Interactive Director, 2026-11-26)
- **Updated:** 2026-11-26

## Concept
The pinya is complete. Its beings let go and the formed RONDA stands right behind the front wall (P1), at real scale, as if we
were inside the pinya. Behind it is the square, made of sparse particles (the Plaza session's `plaza3d/points.bin`).

The people of the room build the tower:
- A hand held ~1.7 s on P4, P2 or P3 charges a ring under it, and a being of points forms there.
- The being lets go into a stream of points that flies round the room to the tower.
- It lands on the ronda's shoulders and climbs (reach ↔ bend) to its place on the shoulders of the tier below.

Every tier that closes lifts us one step: the world sinks and the square goes down behind. A fine ruler beside the column on P1
names each tier with its real height and reads our height at eye level.

The end:
1. With the enxaneta up, a small golden light rises up the column, shoulder to shoulder (the Pom carries her light to the top).
2. She raises her hand (l'aleta) and a golden wave runs round the room.
3. The tower and the square let go into rising particles.

## Solo path
Hold a hand on any wall but P1: one climber per hold. With nobody holding, a ring charges by itself on another wall every 3.5 s,
starting 5 s after the part arrives. A single visitor completes the tower in about 60–90 s. In the harness, a virtual walker that
rarely holds 1.7 s reached the top at ~92 s (LiDAR feel).

## Group path
Every held hand makes a climber, and several can be in the air or climbing at once. With 8 virtual hands (LiDAR) the tower reached
the top at ~64 s. With real holds it is faster: about 8–11 s per climber, in parallel.

## Controls
- **P4 / P2 / P3:** hold ~1.7 s (a ring charges under the hand; moving more than 35 cm starts it again).
  An invitation ring (Ø 72 cm, centre at 1.2 m) breathes at each wall's centre while there are places.
- **P1:** the hand stirs the beings' particles around the ray eye → hand. They part and swirl (≤ 22 cm) and come home in ~1.5 s.
- **Parameters** (`res-3d-study/parts/torre3d.json`):
  - tiers and timing: `tiers` ("4,3,3,2,1,1"), `hold`, `flyTime`, `climbStep`
  - help: `assist`, `assistDelay`
  - rise: `riseK`, `topRise`, `plazaSink`
  - end: `pomTime`, `waveSpeed`, `endTime`, `end`
  - look: `warm`, `faixa`, `light`, `glow`
  - square: `plazaDensity` (default 0.75 of `points.bin`), `plazaLight`, `plazaSize`
  - host: `arrive`, `leave`

## API for the host
- `part.progress()` → `{ tier, tiers, climbers, inFlight, needed, height, ending, done }`
- `part.events` (this frame only):
  - `joined:<tier>` (a climber took its place)
  - `tier:<n>` (n tiers closed)
  - `top` (the enxaneta is up)
  - `aleta`
  - `end` (everything starts to let go)
  - `done`
- `part.reset()` clears the tower for a new pass.
- With `params.end === false` the part stops at the top; `part.finish()` starts the end (the Pom's light, l'aleta, the wave, the dissolve).
- `part.setBackdrop(positions, rgba)` swaps the square: Float32 xyz in the room frame, with Uint8 rgba
  (a: 0 = surface, 160 = window, 255 = glass or lamp).
  - The part loads `plaza3d/points.bin` / `points.json` by itself and draws 75 % of its 400 k points by default (`plazaDensity`; 1 = all, to be measured when the GPU is free), fine and sharp,
    cold and dim, with the windows lit.
  - Until those files load, a stand-in square of particles is shown.
- The part sets a background only when it runs alone in the study (a blue-black). In the work the host owns it.

## Geometry
- The tower stands on P1's normal (`towerWall`, default P1), its centre 2.02 m behind the wall.
- The ronda is three rings: 0.82 m (8 beings), 1.32 m (12) and 1.82 m (16). The outer ring is 4 cm behind the wall plane.
  A crescent of 8 more beings spreads along the wall beyond the rings, 0.16–0.45 m behind it and leaning in. At real scale they fill
  the lower part of P1, so we are inside the pinya (Beltrán, 26-11: closer).
- Tiers stand on the shoulders of the tier below. Each tier is 1.4 m × the scale of its people:
  - baixos to terços: adults, scale 1.0–0.95;
  - dosos 0.85, acotxador 0.72 (bent over), enxaneta 0.62.
  - The enxaneta's head is at ~6.6 m.
- The rise follows a critically damped spring. While the tower builds, the newest tier's chest sits at eye level.
  At the top we rise to `topRise` (1.1 m) above her head, so she stays in the lower third of P1.
  The square sinks 35 % faster (`plazaSink`), so its 8.6 m cornice ends up below us.

## The climb (Beltrán, 26-11: «orgánica»)
Four baked poses per climber are blended by weight: step L, step R (a foot up on the thigh or hip below, one hand high, the other
forward), pull (the weight over the shoulders below) and stand.

The landing:
- The stream re-forms in the pull pose on the outer ring's shoulders, in front of us.
- The baixos come down straight to their place.

Each step (1.5 s, `climbStep`):
1. Reach (0–38 %): a foot goes up and a hand goes to a shoulder.
2. Push (32–84 %): the body rises with an ease-in-out cubic, and the step pose gives way to the pull. The torso leads: the lean
   comes before the body moves.
3. Land (84–100 %): a small give.

The way up runs by the back of the tower in a spiral, round the column as it climbs. The climber only moves while it pushes, so
nothing slides.

At its place:
- It rises from the pull to its stance in 1.15 s and turns to its facing. The acotxador and the enxaneta stay bent over.
- It settles: a damped dip (3.2/s) and a sway to find its balance, then it breathes.

## Status and tests
- Harness (res-3d-study): solo (1 virtual hand, LiDAR) top at ~92 s, done ~105 s; group of 8 + LiDAR top at ~64 s; no console errors.
- GPU at scale 1, uncapped, tower complete + the square (22 %): 3.0–3.8 ms (walls 2.5–3.1, post 0.44), 165–236 fps; update() ≈ 0.05 ms.
- Not yet: the real room; the host (score, sound, trailer jump).
