# Pinya v2 — `parts/pinya3d2.js`

- **Status:** prototype (waiting for Beltrán's approval of the direction)
- **Kind:** visual (part of res-trailer / ressonancia; sound reads `fill()` and `events`)
- **Author:** Claude for Beltrán (brief through the Interactive Director, 2026-11-26)
- **Updated:** 2026-11-26

## Concept
The chapter opens in a dark of cold, almost colourless motes. Every hand that lands calls a being of points out of that dust,
right behind the wall where it touched. The being assembles in ~1.6 s, palm first, and pushes with its palm on the visitor's hand,
like a mirror. Rows behind push the backs of the ones in front.
Every being, once formed, stretches fine red threads (Vicente's ribbons) from its palms to the palms of its near neighbours:
beside it, and in front or behind when close. Each thread runs palm to palm and never hangs loose. Beltrán, 26-11: «los cables deben
ir uniendo las manos entre los personajes cercanos, y ése es el hilo». With few beings there are a few threads. As the room fills,
the net thickens, joins the groups and closes round the room. The light warms from blue-grey to a soft red. When the room is full, the beings let go into rising particles: that is the way out.

## The opening that teaches
While the voice explains (director 26-11, as the correfoc's), the guide beam (`pinya3d/guidebeam.js`, shared with the tower) runs
round the room at hand height and presses on a point of each wall: P4, P1, P2, P3 in turn.
- At each press a being is born there, pushing against the light as against a hand.
- 0.9 s later it calls a companion beside it, so the first red threads stretch.
- The public's hands work from the first second.
- Solo help waits until the opening is over.
- Times: `params.intro = { start, walls: [t0, t1, t2, t3], hold }`, in s from the block's start (`input.t`).
  - Default: `{ start: 0.5, walls: [3.0, 5.0, 7.0, 9.0], hold: 0.5 }`, cut to the recorded voice.
  - `intro: false` turns it off.
- Event: `intro:<i>` at each press.

## Solo path
One person touches along the walls. Each touch makes a being, and a held hand calls one more every 1.2 s (up to 8).
From 6 s after the first touch, beings also come by themselves next to the groups (0.35 per second). With the defaults
(96 beings fill the room), a single visitor fills it in about 90–120 s.

## Group path
Every hand calls its own being, and that being's threads hook into the net. With 4–10 people the room fills in 15–40 s. Several hands on one stretch build rows behind
the first one, the thread appears there first, and the groups link up as the fill grows.

## Controls
- **Hands:** handled per `stroke`. A dropped reading is held for 0.35 s.
- **Feedback:** a glow in the palm in under 100 ms. The being that answers then throws its red threads to its neighbours; dragging
  the hand drags its threads. While the hand stays, the being's palm follows its height (0.55–2.05 m).
- **Placement:** a touch within 0.42 m of a being in the first row goes behind it.
- **Parameters** (`res-3d-study/parts/pinya3d2.json`):
  - `fillCount`, `rows`, `fullAt` (share of the room), `minWall` (the least any wall needs)
  - `netReach` (the longest palm-to-palm thread, m)
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
- `part.fill()` → `{ total 0..1, walls[4] 0..1, full, threadCover 0..1 (the share of the perimeter the connected net spans), beings, ending 0..1, done }`
- `part.events` (this frame only):
  - `born:<wall>:<u>:<y m>:<row>`
  - `thread:join` (a new thread joins two groups of ≥ 3 beings)
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

## 26-11 room review fixes (Beltrán via the director)

- **Slower, needs work:** the beings that come by themselves (a held hand's, the help, the opening's companions) never run ahead of a ramp (`minTime`, 80 s from the first being to a full room); a new hand always calls its own being. A held hand calls one more after 2 s, then every ≥ `holdMin` 2.6 s, at most `holdCap` 4. The help is `assist × assistK` (0.25: about one every 11 s) and only while someone plays (`assistIdle` 8 s). Beings assemble × `bornK` 1.5 (≈ 2.4 s; the palm's glow stays at once); threads grow 1.5× slower.
- **Calm ending:** the dust is published at 90 % of the end and `done` comes `dustHang` (3.5 s) after the end, so the dust hangs calmly. When the tower takes it the pinya no longer vanishes: its dust and dark fade over `dustFade` (4.5 s) while the ronda gathers from the same points.
- **reset()** also clears held hands, pending calls, the opening's queued companions, the palm glows and the fade.

## 26-11 (room review of ad5c94c): ~30 % less work

- `minTime` default 80 → 55 s (the ramp the self-coming beings follow).
- A new hand calls a companion beside its own being 0.9 s later with probability `tapPair` (0.45), as the opening does; the companion respects the ramp. Study: 30 taps in 36 s → 49 beings, total 0.51.
