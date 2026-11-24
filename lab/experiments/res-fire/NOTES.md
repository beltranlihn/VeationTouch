# Ressonància study — Fire

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

The universe of chapter I, *Brasa*: darkness, and a line of embers breathing at hand height (≈1.25 m, a slow wavy band that
closes round the room). Coals with glowing cracks, grey ash on the crust, a rare crackle, slow swells of heat travelling round.
Every touch throws a **correfoc** fountain of sparks that rise, arc, fall and cool from yellow-white to orange to red. Two
people touching together launch a **wave of fire** that runs along the line both ways round the room until the fronts meet on
the far side. Black, deep red, orange; yellow-white only at the hottest.

Scene module: `lab/experiments/ressonancia/scenes/fire.js` (host contract in `scenes/host.js`).

- **Solo path:** one hand lands → a fountain at once (same frame) and a flash of warm light under the palm; resting, the hand
  keeps a small glow, warms the coals near it and lets a trickle of sparks rise; dragging leaves a trail of sparks.
- **Group path:** two hands landing within 0.9 s of each other → a wave from their midpoint (short way round), 3 m/s, both
  directions, leaving the coals hotter behind it; the fronts meet on the opposite side (~4.6 s) with a burst of sparks. Crosses
  the P3→P4 seam with no cut.

## Controls

- `progress` (0..1, the director drives it in the piece): 0 = a few faint embers scattered along an ashy line, rare sparks;
  1 = the whole line is a ring of live fire with low flames and a steady breath of rising sparks.
- `gather` (0..1): the transition out. The fire slides toward the four wall centres (a smooth warp per segment between centres),
  the rest of the line goes out, and four hearths remain at 1.25 m; heat drops, colour settles to ash and warm earth, only a
  few slow sparks rise from each hearth. Eased internally (~0.3 s), so a step change is not a jump.
- `embers` — heat of the ember line (0..2). `sparks` — amount of sparks for all emitters (0..2). `waveSpeed` — m/s (default 3).
  `streak` — motion-streak shutter of the sparks (s). Plus host's `brightness`, `bloom`, `quality`.

## How it works

- Ember line: one fullscreen pass, noise periodic in x (lattice period = the perimeter), domain-warped lumps + ridged cracks.
  Heat memory is 512 cells round the room on the CPU (hands and wave fronts warm them, they cool with τ ≈ 4.5 s), uploaded as a
  512×1 float texture. Wave fronts and hand lights are analytic (uniform arrays, distances wrapped).
- Sparks: 65 536 particles, state in two RGBA32F textures updated by one MRT pass (ping-pong). Spawning is a ring buffer:
  each frame the CPU writes ≤128 emitter records (slot range + launch description) into a 4×128 float texture. Drawn as
  instanced streaks (additive, HDR); a second instance copy draws sparks within 0.6 m of the seam shifted by one perimeter.
- No per-frame allocation, no readPixels.

## Status and tests

- `check.mjs` clean (no console errors) at `scale=1` with 0 hands, demo group 4 and 8, 30 pinned hands, `quality=low`.
- fps at `scale=1` (7196×912), progress 1: **61 fps with 0 hands, 61 fps with 30 pinned hands** (hidden offscreen Electron
  window on the development Mac; vsync-capped, so this says "≥60", not the GPU headroom).
- Looked at: progress 0, 0.3, 0.6, 1; a fountain; a wave (fronts running, sparks at the fronts); a wave whose fronts meet at
  the seam and a fountain at the seam (continuous across both edges); gather 0.5 and 1.
- NOT verified: GPU time per frame (no timer query used) and behaviour on the room's RTX / with the shared GPU; the real
  engine (`lab-engine.mjs`) and the LiDAR feel (**L**); the motion of the gather transition over time (only still frames);
  sound (none here).

## Requests to the studio

None. (The host passes no timing for `draw`; the scene keeps the last `step` dt itself.)
