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

The end is played by the room (Beltrán 26-11, «me gusta todo dorado»):
1. With the enxaneta up she raises her hand, and a golden point of light rises up the column, shoulder to shoulder, to her hand.
   It waits there, beating (`aleta:ready`).
2. On the other three walls a golden point (Ø 40 cm at 1.2 m) invites.
3. A hand held on one sends a beam of golden particles round the room to her hand and charges it. The point grows and brightens.
   Several hands charge faster; let go and the beam cuts and the charge sinks slowly.
   - One hand alone charges it in `chargeTime` (4.5 s).
   - With nobody touching for `chargeAssist` (10 s), a point charges by itself.
4. Charged (`aleta:charged`): l'aleta flares, a golden wave runs round the room, and the tower and the square let go into rising particles.

## The opening that teaches
While the voice explains (director 26-11), the guide beam (`pinya3d/guidebeam.js`, shared with the pinya) goes to P4, P2 and P3.
On each it presses and holds: the charge ring fills, a climber forms there, flies to the tower and climbs. The first three up are the
beam's.
- The public's hands work from the first second. Solo help waits until the opening is over.
- Times: `params.intro = { start, walls: [t0, t1, t2], hold }`, in s from the block's start (`input.t`).
  - Default: `{ start: 0.5, walls: [3.5, 6.0, 8.5], hold: 1.7 }`, cut to the recorded voice.
  - `intro: false` turns it off.
- Event: `intro:<i>`.

## Every gesture makes someone (Beltrán 26-11)
Until her light appears, every held hand makes its climber: the ring, the being at the hand, the stream.
- Once the tower's places are all taken, the extra ones fly to the pinya round the ronda and join it, with their hands on the backs
  there (30 extra places beyond the outer ring, on the sides and the far side).
- Climbers waiting for their tier hover as streams near the tower.
- From the light on, the walls send golden beams instead and nobody else climbs.
- `progress().pinya` = the climbers that joined the pinya.

## The light in her hand
It grows 1× → 2.5× in size and light with the charge. A halo widens round it (≤ 0.28 m) and the beat quickens. Above 82 % it
trembles, and at 100 % it bursts into l'aleta.

## The ruler on every wall (Beltrán 26-11)
The metres ruler stands on all four walls:
- on P1, beside the column;
- on P4 and P2, ~0.75 m from their corner with P1, with the labels reaching into the wall (on P4 they are mirrored, to the left of the line);
- on P3, by its left edge.

They are all on P1's scale (an altimeter of the room). They light together, the marks slide down as we rise, and each carries the
live reading at eye level. They appear with the first tier and go out with the end.

## P1: a fluid stir (Beltrán 26-11: «como optical flow, un poco más nomás»)
Every 70 ms a moving hand leaves a stamp of its velocity. Points near the ray eye → stamp are dragged along it, with a curl.
- The field widens as it ages: it diffuses.
- The points come home on a soft spring with a little overshoot in ~1.8 s.
- The drag is at most 20 cm. A still hand stirs a little.

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
  - end: `pomTime`, `chargeTime`, `chargeAssist`, `goldReach`, `waveSpeed`, `endTime`, `end`
  - look: `warm`, `faixa`, `light`, `glow`
  - square: `plazaDensity` (default 0.75 of `points.bin`), `plazaLight`, `plazaSize`
  - host: `arrive`, `leave`

## API for the host
- `part.progress()` → `{ tier, tiers, climbers, inFlight, needed, height, ending, done, charge 0..1, ready }`
- `part.events` (this frame only):
  - `joined:<tier>` (a climber took its place)
  - `tier:<n>` (n tiers closed)
  - `top` (the enxaneta is up)
  - `aleta:ready` (her light waits in her hand), `aleta:charged`, `aleta` (the flare and the wave)
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

The landing (Beltrán 26-11: nobody lands and then slides or jumps to its place):
- The stream lands where the climber climbs from: at its place's back, a little round the column, about 1 m below its place,
  on the tier below. It re-forms there in the pull pose.
- It follows its destination in flight (the world's frame, so it rises with us).
- If the tier below is not up yet, the stream hovers near the tower until it is.
- The baixos land on their place on the ground.
- From there, two short steps.

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
