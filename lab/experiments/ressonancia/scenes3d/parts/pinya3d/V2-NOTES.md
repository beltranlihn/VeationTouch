# Pinya v2 — `parts/pinya3d2.js`

- **Status:** prototype (waiting for Beltrán's approval of the direction)
- **Kind:** visual (part of res-trailer / ressonancia; sound reads `fill()` and `events`)
- **Author:** Claude for Beltrán (brief through the Interactive Director, 2026-11-26)
- **Updated:** 2026-11-26

## Concept
The chapter opens in a dark of cold, almost colourless motes. Every hand that lands calls a being of points out of that dust,
right behind the wall where it touched. The being assembles in ~1.6 s, palm first, and pushes with its palm on the visitor's hand,
like a mirror. Neighbours in the first row are joined palm to palm by a pale strip. Rows behind push the backs of the ones in front.
Every hand also sprouts a bundle of fine red fibres from its palm (Vicente's bundles), which hook into the beings round it, tighten
when held and follow a drag. Where the crowd is dense, a held or dragged hand braids those fibres into the thread. The thread is the
same red matter. It forms where the crowd is dense enough, joins the groups and, as the room fills, closes round it. The light warms
from blue-grey to a soft red. When the room is full, the beings let go into rising particles: that is the way out.

## Solo path
One person touches along the walls. Each touch makes a being, and a held hand calls one more every 1.2 s (up to 8).
From 6 s after the first touch, beings also come by themselves next to the groups (0.35 per second). With the defaults
(96 beings fill the room), a single visitor fills it in about 90–120 s.

## Group path
Every hand calls its own being and its own red fibres. With 4–10 people the room fills in 15–40 s. Several hands on one stretch build rows behind
the first one, the thread appears there first, and the groups link up as the fill grows.

## Controls
- **Hands:** handled per `stroke`. A dropped reading is held for 0.35 s.
- **Feedback:** a glow in the palm in under 100 ms. While the hand stays, the being's palm follows its height (0.55–2.05 m).
- **Placement:** a touch within 0.42 m of a being in the first row goes behind it.
- **Parameters** (`res-3d-study/parts/pinya3d2.json`):
  - `fillCount`, `rows`, `fullAt` (share of the room), `minWall` (the least any wall needs)
  - `threadAt`, `threadSpeed`
  - `assist`, `assistDelay`
  - `holdEvery`, `holdMax`
  - `bornTime`
  - `warm`
  - `endHold`, `endTime`, `end`
  - `light`, `glow`, `breath`
  - `arrive`, `leave`

## Bodies
There are four baked types (two builds), all with open hands (fingers spread).
- First row: either both palms on the wall, or the right palm on the wall and the left arm over the neighbour's shoulder
  (only when there is a neighbour on that side).
- Rows behind: hands on the back in front, arms over the shoulders, one arm round a neighbour, or the head turned.

The bake takes about 3 s, spread over frames. A hand that lands earlier waits in a queue.

## API for the host
- `part.fill()` → `{ total 0..1, walls[4] 0..1, full, threadCover 0..1, beings, ending 0..1, done }`
- `part.events` (this frame only):
  - `born:<wall>:<u>:<y m>:<row>`
  - `thread:join` (the first time the thread bridges two groups)
  - `full`
  - `end` (the beings start to let go)
  - `done` (the end has finished)
- `part.reset()` clears the room for a new pass.
- `end: false` lets the host decide when the end starts. `leave` also dissolves the beings.
- Background: the part sets one only when it runs alone in the study, as a blue-black that warms with the fill.
  In the work the host owns the background. Suggested: the same blue-black, warming with `fill().total`
  (the room palette `pinya` is still teal).

## Status and tests
See the director's report (branch `lab/pinya-v2`).
