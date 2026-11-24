# Ressonància study — Air and night

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

Chapter IV, *Pom de dalt — Valor*. The smallest children climb to the top of the castell and the square holds its breath. After
fire, clay and red ceramic, the room turns cold, vast and silent: a deep blue-black night sky round all four walls, stars in three
depth layers that drift at different speeds (parallax) and twinkle gently, a band of milky dust that undulates once round the
room, and slow wind veils. Below, the castell remains as a dim silhouette of banked embers, one tower at each wall's centre, ~2 m
high, like a city seen from far above. The only warm thing is gold.

Three lights climb in turn: the *dosos*, the *acotxador*, the *enxaneta*. Each is a small gold star with a soft halo and faint
cross spikes that leaves the castell (the tower at wall index 1) at 1.5 m and climbs one full turn of a helix round the room,
leaving a thin gold thread behind it (fine core, soft glow, a slow travelling shimmer and a few sparkles; it stays). The three
threads fan out from the same tower and end stacked above it.

All noise is sampled on a cylinder the size of the room and star cells are an integer number round the perimeter, so nothing
shows a seam between P3 and P4. One full-screen pass; sizes in metres.

**Solo path:** one hand rests still: a cool halo grows round it over ~2 s, a tiny gold heart appears and the nearby stars gather
brightness. If it moves, the halo collapses, a ripple spreads and the climbing light flickers and slips back.
**Group path:** still hands closer than 2 m are joined by constellation lines; the whole room of still hands draws a constellation
along the walls while the light climbs. One restless hand is enough to make the light hesitate.

## Controls

- **Hands.** Landing: an immediate soft answer (the halo starts with the hand's presence, plus a faint landing ripple). Still
  (< 0.3 m/s): halo grows over 2 s, stars gather within ~1 m, gold heart, constellation lines to still hands < 2 m away.
  Moving (> 0.3 m/s): halo collapses in ~0.25 s, a ripple every 0.6 s, and the room's *agitation* rises (fast up, slow down).
  Agitation makes the climbing light flicker and tremble, slows its climb toward `progress` almost to a stop, and lets it slip
  back slowly.
- **`progress`** (0..1, in the piece the director): 0–1/3 the first light climbs from 1.5 m to 60 % of the height; 1/3–2/3 the
  second to 80 %; 2/3–1 the third to height − 0.35 m. Each climb is one turn round the room, eased (smootherstep). The next light
  fades in at its start just before its turn (the first is already there, breathing, at 0). Lights that have arrived rest at the top
  of their thread, quieter. At progress ≈ 1 the last light brightens softly and the top of the room warms faintly (no explosion).
  The shown climb follows `progress` with a short lag (rate ~0.9/s) so the hesitation can be seen.
- **Parameters:** `progress`; `calm` (auto = from the hands, still = force stillness/no flicker, restless = every hand counts as
  moving: flicker, ripples); `towers` (0..1, presence of the ember castell); `stars` (stars and milky dust); `wind` (veils, and their
  drift speed); `gold` (lights and threads); plus the host's `brightness`, `bloom`, `quality`.

## Status and tests

- `check.mjs` with no console errors at progress 0, 0.45, 0.5, 0.8, 0.84, 1; with `group=4` (moving virtual hands), 0 hands
  (`demo=0`), 7 pinned still hands, 30 pinned hands, and `calm=restless`.
- **fps at `scale=1` (7196×912), on the dev Mac in the hidden Electron window: 60 with 7 hands, 60 with 30 hands** (rAF count over
  2.5 s; that is the vsync cap, so the real GPU headroom was not measured).
- Seam: a hand pinned at u = 0.995 shows its halo continuously across P3→P4; the sky, stars and threads use wrapped coordinates.
- Not verified: the real runtime / lab-engine (`lab-engine.mjs`), the LiDAR feel (**L**), GPU time in ms on the RTX 4060 laptop or the
  room's server, the 3.5 m profile height (the climb heights are relative to `room.height`, so they adapt), the flicker and ripple
  timing watched live (only stills were looked at), and audio (none: a visual study).
- Weak points: the towers are simple stepped silhouettes with ember specks, readable but not yet beautiful at close range; the
  hand halo is cool blue-white rather than gold (by intent: gold is reserved for the climbers), worth a director's eye.

## Requests to the studio

None. (The host gives no per-hand stillness or a "the light passes only through walls with still hands" rule from GUION.md; this
study keeps its own per-stroke stillness state and only slows/slips the climb globally. In the piece, the director should own which
walls hold the light.)
