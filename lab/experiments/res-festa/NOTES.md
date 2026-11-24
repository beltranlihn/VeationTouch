# Ressonància study — Resonance

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

The universe of *La ressonància*, the free part of chapter V (L'aleta): the castell is crowned and the square erupts. The four
walls become **one skin of light that resonates**. Underneath is a real 2D wave equation on the GPU, periodic round the room, so
every wave runs round the walls, comes back, crosses the others and interferes. It is drawn as **gold filigree, not water**: fine
lines of constant width trace the levels of the local wave amplitude. A ring is a fine double line running away. Where waves add
up, nested figures crowd together; where they cancel, the wall stays dark. Far behind sits a deep castell red, which glows only
where the skin has been moving.

Scene module: `lab/experiments/ressonancia/scenes/festa.js` (host contract in `scenes/host.js`).

- **Solo path:** a hand lands and, in the same frame, a ring of gold leaves it, gold sparks burst and the palm flashes. A resting
  hand keeps beating gently (each hand has its own frequency, so its rings drift against the others). A dragged hand pushes a wake
  and trails sparks. With 1–2 people the waves are few and clear and chase each other round the room.
- **Group path:** two hands closer than 1.6 m are joined by a **thread of light** that vibrates like a string and brightens as they
  hold. Hands that **land together** add up (the hidden rule). The room then grows ordered: the figures lock into standing patterns,
  light climbs the walls and the gold warms to white-gold. At full resonance the room **blooms once** (about 4 s of one ordered
  figure round the whole room), relaxes, and can build again. With 30 hands the room seethes but stays readable: lines, not mush.

## Controls

- **How resonance is computed** (`scene.resonance`, a read-only getter 0..1 for the director and the sound; `scene.bloom` 0..1
  while the room blooms):
  - every landing looks at the other strokes that landed in the last 0.5 s, weighted by how close in time they were (1 at the
    same instant, 0 at 0.5 s). It adds `min(0.1, 0.03·k + 0.004) × sensitivity`, so a lone tap adds almost nothing and a
    six-person slap adds about 0.4;
  - hands resting (driving) at once add `0.011 × (n − 1)^0.85` per second;
  - it decays with τ ≈ 14 s. Bloom fires at ≥ 0.985 (at most once every 6 s after the previous one ends); afterwards the computed
    value drops to 35 %.
  - Measured: 6 hands tapping together every 1.2 s reach the bloom on the 3rd tap.
- `progress` (study): a manual override **added** to the computed resonance, so the whole range can be reviewed without a crowd.
  At `progress = 1` the room blooms at once and then again every ~10 s (bloom 4.2 s + 6 s rest).
- `auto` (default on): with fewer than 2 real hands the skin plays a gentle impulse every 0.4–2.9 s (sometimes two at once on
  far walls). These impulses do **not** feed the resonance.
- `sensitivity` (resonance gain), `speed` (wave speed, 4.5 m/s: once round the room in ~6 s), `ring` (amplitude decay time
  at rest, 3 s), `lines` (line density), `glow` (line brightness), `still` (0 = draw the live phase, which vibrates;
  1 = the phase-free amplitude, which holds still; default 0.7), `clip` (energy limit), `sparks`. Plus the host's `brightness`,
  `bloom` and `quality`.
- What resonance does, step by step: hand frequencies slide onto the frequency of a room mode. Two near-degenerate standing modes
  of the whole room (picked at start-up: different vertical orders, about 1.15 m wavelength) are driven at their exact grid
  frequencies, with a regulator that stops at a target amplitude. Chatter is damped harder, so the figure remains. The "ceiling"
  of the light rises from 2.55 m to the top of the wall. The nodal lines of the figure appear ("sand"). The palette warms. The
  bloom drives the same modes harder, plus a finer pair, and brightens everything for ~4 s.

## How it works

- Simulation: 2 × RGBA32F textures (h, v, energy) at `pxPerM/5` cells per metre (≈ 1341 × 182 at quality high, 2.06 cm cells),
  symplectic Euler with a 9-point isotropic Laplacian, x wraps, y reflects (clamped). 8 sub-steps per frame at 60 fps
  (CFL 0.5). Extras: viscosity on v (grid-scale ripples die), a faint spring (no drift of the whole skin), and Mexican-hat kicks
  (zero net push). Limiters act only on loud skin: a soft clip above a knee (0.6 × clip), extra damping where the local rms
  amplitude is above 0.4, and resting-hand drives that soften where the skin already rings.
- Rendering: a derived pass at sim size (amplitude, its gradient, nodal gradient, filterable half-float). The full-size pass
  draws contour lines at constant pixel width (|Δq| / |∇q|), fades crowded lines, caps nesting at ~6 lines, and adds the nodal
  "sand", the red haze, hands, threads and a soft ceiling. Sparks: 32 768 GPU particles (MRT ping-pong, ring-buffer emitters as
  in `fire.js`) drawn as additive streaks, with a second instance copy across the seam.
- Uniform arrays: 32 hands, 24 impulses per frame, 24 threads, 4 modes. No allocation per frame in the hot path (fixed pools);
  no readPixels.

## Status and tests

Verified with `lab/tools/check.mjs` at `scale=1`, no console errors in any run:
- 0 hands with `auto`; 1 tap; `group=2`; `group=4` with `progress` 0.6/0.75; `progress=1` (bloom); 6 simultaneous taps (the
  hidden rule reaches the bloom with no `progress`); `group=8` plus 24 pinned hands (27–32 hands: busy, still lines, no white
  mush); `quality=low`; `lidar` (10 Hz, dropouts) with `group=4`: no errors, looks the same.
- Seam: two pinned hands across P3→P4. Rings, lines and the thread cross with no cut (full-resolution capture, both edges
  stitched).
- fps (hidden Electron window, requestAnimationFrame count over 3 s, 7196 × 912): **60 fps** with 0 hands and with 27–32
  hands. This is vsync-capped on the development Mac, so it shows no headroom and is not a GPU-time measurement.
- **Not verified:** GPU time per frame (no timer query); the room's RTX machine or the RTX 4060 laptop budget (≤ 6 ms); the real
  runtime/engine (`lab-engine.mjs`); whether LiDAR stroke splits inflate the hidden rule over a whole minute (a split stroke
  counts as a new, "simultaneous" landing; re-landings of the same stroke are ignored); the 3.5 m profile height
  (everything reads `room.height`); how it feels in motion over a full minute (only stills were reviewed).
- Weak points: a resting hand's centre saturates into a soft white disc (~0.25 m) once its drive is at the limit. The wake behind a single ring is a little busy at low resonance. The bloom figure is ordered and repeats round the
  room, but it is islands rather than a crisp Chladni plate. The standing figures morph slowly between the two modes, by design.

## Requests to the studio

None. The host gives everything needed: `env.size`, `pxPerM`, float targets, `input.downs`. The scene exposes `resonance` and
`bloom` as getters for the director and the sound. The future piece needs a way for the sound piece to read them, the same open
request as in `ressonancia/NOTES.md`; nothing new is needed here.
