# Ressonància study — Intro

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

The opening of Ressonància, *La plaça*: a dark room becomes a square at night just before something begins. A 70-second
sequence, pre-designed and the same every time: dust in the air, one warm horizon round the room, a human tower suggested by
points of light that rises and dissolves before it is finished, the motto (one word per wall) and the title. Slow and precise,
almost nothing on the walls. The scene is `../ressonancia/scenes/intro.js` (it exports `create` and `DURATION = 70`). This page
runs it through the study host.

The public cannot change the sequence. A hand on the wall stirs the dust right away: nearby motes are pushed back and turn a
little round it, and a faint warm glow appears under the hand. So the room already responds to touch before the piece asks for it.

## Controls

**Timeline (seconds).** Every entrance and exit is eased; nothing pops.

| s | What happens |
|---|---|
| 0–8 | Black. From 1 s, about 40,000 dust motes fade in (three depth layers with parallax drift, a few slow glints). They are lit by one distant lamp, a little brighter on the far side of the room. |
| 8–22 | A spark lights at 1.25 m at the centre of the first wall (8–9 s). It draws a thin warm line both ways round the room. The two ends meet on the far side at about 22 s and a soft glow fades there (22–25.5 s). The line crosses the P3→P4 seam without a cut. Dust near the line and near the drawing points turns warm. |
| 22–46 | On each wall's centre, a tower made of points: three rows of pinya (a wide, dense crowd), then a *tres* (four tiers of three, the dosos, the acotxador, the enxaneta). Each tier climbs up from the line through the tiers below it. Each person is a small cloud of points that breathes. The walls start 2.4 s apart (22.5 / 24.9 / 27.3 / 29.7 s). The line dims slightly (24–34 s). |
| 46–53 | The towers dissolve upward into the dust, top first, before any is finished. On the first wall the enxaneta is still climbing; on the last, the upper tiers have not started. The line dims to about 22%. |
| 53–64 | The motto, one wall at a time, 2 s apart: STRENGTH / Força, BALANCE / Equilibri, COURAGE / Valor, GOOD SENSE / Seny. Each word comes into focus as it fades in (≈1.5 s), holds about 2 s and fades out (1.6 s). The Catalan word follows 0.6 s later. |
| 63.8–70 | RESSONÀNCIA on every wall (63.8–66.4 s), then "Put your hands on the wall" (66.2–68 s). It holds. |
| 75–80 | Study loop only: everything fades to black by 79.5 s and the sequence starts again at 80 s. In the piece the director takes over at 70 s. |

Text uses the house font stack (`Geist, "Segoe UI", system-ui…`), warm white, centred on each wall. The motto word and the
title have a 0.22 m cap height, centred at about 2.08 m. The small lines sit at about 1.8 m. The text is drawn once into a
mipmapped atlas at twice the render density, so it stays sharp at scale 1.

**Parameters** (manifest):

| key | default | what it does |
|---|---|---|
| `progress` | 0 | 0 = the clock runs and loops every 80 s; > 0 = scrubbing: time = progress × 70 s |
| `start` | 0 s | the clock starts (or restarts, when changed) at this second; for captures |
| `brightness`, `bloom`, `quality` | 1, 1, high | the host's tone map, bloom and render scale |
| `dust` | 1 | brightness of the dust (0 removes it) |
| `handStir` | 1 | how far a hand pushes the dust |
| `lineHeight` | 1.25 m | height of the horizon (the towers rise from it) |
| `textHeight` | 2.0 m | centre height of the words |

## Status and tests

- Tested with `lab/tools/check.mjs` at `scale=1`: no console errors at any point of the timeline. I looked at full-resolution
  captures (7196×912, cropped) at 6, 14, 35, 42, 45, 48, 50, 56 and 68 s, and with `group=4` (hand glow and dust stir).
- Seam: at 14 s the drawing point has already crossed from P4 into P3, and the line runs across the seam without a cut. The
  meeting point on the far side has no gap (the reveal goes slightly past halfway, so the two ends overlap).
- fps at `scale=1` (7196×912): **60** with 4 virtual hands during the tower (t≈43), and **60** during the title (t≈66). That
  is the display's vsync cap on the development Mac, so the real headroom was not measured. Per frame the scene draws one
  full-screen pass, 40k + 3.2k dust points and about 4.4k tower points, with no allocation.
- NOT verified: the real engine (`lab-engine.mjs`) with the profile's 3.5 m walls (everything is in metres and reads
  `room.height`, but the tower top at about 3.2–3.3 m is close to a 3.5 m image top); how it looks on the projectors (the dust
  level and the 0.25 m warm haze round the line may need `dust` / `brightness` tuning in the room); Geist (the captures used the
  system fallback, and the atlas is redrawn once `document.fonts.ready` resolves); the LiDAR feel (`L`); timing against the voice-over.
- Weak points: the hand's dust push is subtle at room scale (the glow is what reads); the soft "body" glow of each person
  is a little bokeh-like up close.

## Requests to the studio

None. The host gives everything the scene needs.
