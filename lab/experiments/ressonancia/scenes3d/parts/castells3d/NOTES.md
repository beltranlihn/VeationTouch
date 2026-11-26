# The intro's castells — `parts/castells3d.js`

- **Status:** prototype (early screenshots sent for Beltrán's approval)
- **Kind:** visual (the trailer's intro; the square behind is the Plaza session's `plaza3d`, not drawn here)
- **Author:** Claude for Beltrán (brief through the Interactive Director, 2026-11-26)
- **Updated:** 2026-11-26

## Concept
We stand in the middle of a square full of castells, some far away, some right on top of us. They are human towers of points
(the pinya/tower beings: `pinya3d/body.js`, cream and pale gold with sparkles) at real scale and real depth, 1 to 7 m beyond the
walls (as the art places them), so the four walls see true parallax.
- Near castells are big, sharp and warm.
- Far ones are smaller, cooler and dimmer, sinking into a night haze (by distance).

## Sequence (`input.t`, the intro block's clock)
1. 1.5–16 s: the castells build from the dust, bottom up: the pinya ring by ring, then tier by tier. Far ones start first.
   Each body forms in 1.2 s, its points rising into place from the feet up.
2. 17 s: the composition breathes.
3. 28.5–42 s: the castell on P1 (its base a band of embers) explains, on `params.stages = [29.4, 32.2, 34.8, 37.0, 39.4]`:
   - correfoc: the fire lights;
   - pinya: the base of bodies;
   - tronc: the middle tiers;
   - pom de dalt: dosos and acotxador;
   - l'aleta: the enxaneta raises her hand.

   Each part grows in light (×3) with a slight pulse, and some of its points let go and rise. Then it settles back to a soft glow.
4. 43.5 s (`dimAt`): pom de dalt and l'aleta sink to a faint outline (what the trailer does not climb).
5. 50.5 s (`endAt`): everything lets go upward over 4.5 s (`endTime`), from the top down, the far ones a little later.

## Hands
Torre3d's velocity field, on every wall: the hand's motion drags the near castells' points with a curl, and they come home in ~1.8 s.
It fades out for castells beyond ~12 m along the ray.

## API
- `part.highlight(stage, k)`:
  - `stage` is 0..4 or 'correfoc' | 'pinya' | 'tronc' | 'pom' | 'aleta';
  - `k` is 0..1, or `null` to give the stage back to the clock.
- `part.progress()` → `{ built 0..1, stage, dimmed, ending, done }`.
- `part.events`:
  - `built`;
  - `stage:<name>`;
  - `dim`;
  - `end`;
  - `done`.
- `params.castells` = a list of `{ wall, x, depth, scale, tiers, rings, fire, explain, start }`:
  - `x` = where the castell is SEEN on its wall (m from its centre, from the eye);
  - `depth` = m behind the wall to its centre (at least its pinya's radius);
  - `tiers`, e.g. "3,3,3,3,2,1,1" (the last 1 = enxaneta, the 1 before = acotxador, a 2 near the top = dosos);
  - `rings` = pinya rings, 0–4;
  - `fire` = the ember band;
  - `explain` = the castell that does the stages;
  - `start` overrides its build time.
- The default list (`CASTELLS`) is measured from Beltrán's art (26-11): each castell's place on the wall, the height of its base on the
  wall (which gives its depth from the eye at 1.6 m) and its pinya's width (which gives its scale). It covers:
  - P4: enormous near (cut left and top), small far, medium;
  - P1: the explaining castell with fire;
  - P2: giant near (a column of huge bodies, cut, no pinya), small far, large with a wide pinya;
  - P3: none.

## Cost (designed, not measured — no measurements while the machine is shared)
- Points per body are chosen by how big the castell is seen on its wall: 3200 · 1900 · 900, so the near giants are dense, as in the art.
  In all, about 230 bodies ≈ 450 k points.
- Each castell is a mesh culled per wall by its sphere.
- The bake takes ~1.5 s, spread over frames.

## Outro, density, every castell reactive, dust (2026-11-26)

- `mode: 'outro'` (`outroDur` 18, `input.t` from 0): 0.3–3.4 s they form out of gold motes; still with a soft gold (`outroGold`),
  no stages or dim; from outroDur − 5 over 3.5 s they let go upward into a dust that stays faint (`outroDust` 0.14). The explaining
  castell (P1) is hidden unless `outroExplain`.
- The hand's field reaches every castell near the eye→hand ray, with radius and amplitude growing with depth (same apparent stir).
- `density` (default 1; `quality: 'medium'` → 0.5, `'low'` → 0.35): points per body × density and the far castells (≥ 4 m behind
  their wall) kept by density. At 0.5: 6 castells, 141,900 points (`progress().points`).
- `leaveTo: 'dust'` (default): the end leaves hanging dust (handoff key `castells`); `dustTime` keeps it past the leave (`lingering`).
