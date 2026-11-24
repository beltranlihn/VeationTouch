# Ressonància — Intro 3D (La plaça)

- **Status:** prototype
- **Kind:** visual (pair with `ressonancia-sound`)
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
The 70-second opening of Ressonància in 3D (`../ressonancia/GUION.md`, `ARTE.md`): the room becomes a night square of Barcelona
seen from its middle; a line of light is drawn round the walls and the lamps light one after another; four castells of light rise,
one beyond each wall, and dissolve upward before they are complete; the square breaks into floating mirrors; the motto, one word
per wall; the title. Assembled from parts (`../ressonancia/scenes3d/parts/`): `plaza`, `atmos`, `castell`, `introtext`.

## Solo path / Group path
Not interactive: a hand stirs the dust and warms the light near it.

## Controls
`t` (start at), `loop` (every 80 s in the lab), `renderer`, `bloom`, `exposure`.

## Audio
The intro's music and voice come from `ressonancia-sound` (being redesigned).

## Status and tests
- All four parts in (`plaza`, `atmos`, `castell`, `introtext`), no console errors. Captures looked at across the sequence (lamps
  lighting with the line, castells risen, the square breaking with the motto, the title over the fragments).
- fps, dev Mac (M1 Max), everything on, t ≈ 38 s (the heaviest moment, castells standing): at 7196 × 912 quality high 28,
  medium 42 → 51 with the castells at 60 % density, low 48 (castells at 40 %: 58); at the lab's default half scale ~51. Each part alone
  holds 60. The room's RTX 6000 Ada is several times faster: expected above 60, **not measured**. The cost at that moment is
  mostly geometry drawn four times (plaza 836k vertices + castell particles), not pixels.
- `quality` (low / medium / high) = 60 / 80 / 100 % render scale (high adds 4× MSAA) and 40 / 60 / 100 % castell particles. Default **high**: the room's server (RTX 6000 Ada); medium or low to watch it on a laptop. Lab-only query options: `?parts=plaza,atmos`
  (load only those parts), `?partParams={"castell":{"density":0.4}}`.
- Not done: the real engine; the room; sound (the intro's music and voice come from `ressonancia-sound`, being redesigned).

## Requests to the studio
See `res-3d`.
