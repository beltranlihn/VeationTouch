# Ressonància study — Closing

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

The closing of Ressonància, *l'acta*. It is a 40-second pre-designed sequence of black and typography. The room gives the group
its castell back the way the colles write it ("3 de 7 · descarregat"), then the four values of the motto as four bars, one per
wall. Then one sentence, then the credits. The intro's dust and its thin horizon at 1.25 m come back dim, so the work ends where
it began. The scene is `../ressonancia/scenes/acta.js` (it exports `create` and `DURATION = 40`). It draws all of its text
through the shared text layer `../ressonancia/scenes/text.js`, which the piece's host will also use for chapter cards,
instruction lines and floor names. This page runs the scene through the study host.

The public cannot change anything. As in the intro, a hand stirs the dust round it and glows faintly.

**Solo / group path:** the same for any group. The content (castell, outcome, hands, seconds of silence, the four values) comes
from the score's `acta()`.

## Controls

**Timeline (seconds).** Everything is eased; nothing pops.

| s | What happens |
|---|---|
| 0–4 | Black. About 22,000 dust motes (the intro's look, at ~60 % level) fade in, and the horizon at 1.25 m returns at ~30 % of the intro's brightness. |
| 4–14 | On every wall's centre: the castell, "3 de 7" (0.30 m cap, light weight, centre 2.47 m), fades in from 4.4 s. Under it, from 6.2 s, the outcome in Catalan, letter-spaced (DESCARREGAT / CARREGAT / INTENT, 0.066 m cap). Under that, from 7.8 s, a small English gloss ("raised, crowned and brought down" / "crowned, and then it fell" / "it fell before the crown"), which leaves again at 11.6–13.2 s to make room. |
| 12–26 | The four values, one per wall in strip order (P4 Força, P1 Equilibri, P2 Valor, P3 Seny; wall i shows value i mod 4), 2 s apart. The Catalan word sits at 1.72 m with the English word small and letter-spaced under the bar (STRENGTH / BALANCE / COURAGE / GOOD SENSE). A 2.2 m hairline gold track draws itself left to right, with two small end ticks. Then deep red fills it to the value over 2.5 s: fast at first, settling slowly, with a small warm glow at the moving front. The last bar finishes at about 21.7 s. From 21.6 s a small line appears under the castell: "14 hands · 22 s of silence" (or "14 hands" alone when the silence is 0). |
| 24–33 | The castell, the outcome, the stats line and the bars dim away (24–26.2 s). One sentence on every wall, 0.15 m cap, in two lines: "When bodies resonate together, / culture is born." (26.4–28.8 s in, 31.4–33 s out). |
| 33–40 | Credits, small and wide: RESSONÀNCIA (0.085 m cap, very wide tracking), "Barcelona XR Lab × Alma Digital Studio", "With the support of the Generalitat de Catalunya" (33.6–35.6 s in, 38–39.8 s out). By 40 s only the dim line and the dust remain. |
| 44–48 | Study loop only: the line and dust fade to black by 47.5 s, and the sequence restarts at 48 s. In the piece the score returns to `wait` at 40 s. |

All text comes into focus as it fades in (a mip blur that clears). It is warm white, at 0.9 linear for the small lines and
0.74–0.76 for the large castell and sentence, so the bloom does not halo them.

**Time source:** in the piece, `input.state.t` while `input.state.block === 'acta'`. The content comes from `input.acta`
(`score.acta()`: `castell`, `outcome`, `hands`, `stillS`, `values`). In the study, the scene keeps its own clock and builds the
content from parameters.

**Parameters** (manifest):

| key | default | what it does |
|---|---|---|
| `progress` | 0 | 0 = the clock runs and loops every 48 s; > 0 = scrubbing: time = progress × 40 s |
| `start` | 0 s | the clock starts (or restarts, when changed) at this second; for captures |
| `outcome` | descarregat | descarregat / carregat / intent: the Catalan word and its English gloss |
| `structure`, `floors` | 3, 7 | "3 de 7" (`structure` 2–4; 1 would read "pilar de N") |
| `forca`, `equilibri`, `valor`, `seny` | 0.82, 0.64, 0.91, 0.73 | the four bars, 0..1 |
| `hands`, `stillS` | 14, 22 s | the stats line |
| `brightness`, `bloom`, `quality` | 1, 1, high | the host's tone map, bloom and render scale |
| `dust`, `handStir`, `lineHeight` | 1, 1, 1.25 m | dust level, how far a hand pushes it, height of the horizon |

### The text layer (`scenes/text.js`)

`createTextLayer(env, opt)` returns `{ set, clear, clearAll, opacity, has, step, draw, dispose }`. The full API is in the file's
header comment. In short:

- Named items, each with lines whose sizes are cap heights in metres, hand letter-spacing in em, and a `dy` per line.
- Placement: `x: 'walls'` (every wall centre, or `walls: [i…]`), a metre position round the room, or a list of positions.
  `y` is the first line's centre. `width` is a fit-to-width limit.
- An optional soft dark `plate` behind the text, `fadeIn` / `fadeOut`, and a cross-fade when the text changes.
- Rasterised on a 2D canvas at 2× the scene's px/m (capped at 4096×2048 per item) into a mipmapped texture, only when the text
  changes. Drawn premultiplied over the target. Periodic: an item across the P3→P4 seam is drawn on both sides.
- No per-frame allocation. `set()` with unchanged text does not re-rasterise.

## Status and tests

- `lab/tools/check.mjs` at `scale=1`: no console errors at any tested point. I looked at full-resolution crops (7196×912) at
  t≈5, 9.8, 21.6, 23.4, 30.4, 36.9 and 42.9. I also checked a strip view with `outcome=carregat, structure=4, floors=9`.
- Seam: a test item placed at x = 0.3 m (with a plate) reads continuously across P3→P4. Each half is drawn on its side of the strip.
- fps at `scale=1` (7196×912): **60** with virtual hands during the bars (t≈15–18). That is the display's vsync cap on the
  development Mac, so the real headroom was not measured. Per frame the scene draws one full-screen pass, 22k + 1.8k dust points
  and about 10–20 small text quads, with no texture uploads.
- Hands: a faint warm glow under each hand was visible in the capture, and the dust stir is the intro's code.
- NOT verified:
  - the piece path (`input.state` / `input.acta`): it is written against `score.js › acta()` but not run inside the piece's
    host, because no such host exists yet;
  - the real engine with 3.5 m walls (the castell's top sits at about 2.62 m, so it fits);
  - Geist (the captures used the system fallback; every item is re-rasterised when `document.fonts.ready` resolves);
  - the plate over a bright picture (it was only seen on black);
  - the projectors' rendering of the deep red, and the timing against the closing voice-over and music.
- Weak points:
  - The castell's 200 weight renders as a regular weight in the fallback font.
  - The stats line and the gloss share a position (the gloss leaves at 13 s and the stats line arrives at 21.6 s). The gap
    between them is deliberate, but it leaves the castell alone for a while.

## Requests to the studio

- The piece's host should pass `input.state` (the score's state, with `t` = seconds into the block) and `input.acta`
  (`score.acta()`) to scenes. The study host (`host.js`) passes neither today. The scene falls back to its own clock and to
  parameters.
- A house-font decision for the room machine: Geist installed system-wide, or a self-hosted `@font-face`. The text layer only
  names the stack.
