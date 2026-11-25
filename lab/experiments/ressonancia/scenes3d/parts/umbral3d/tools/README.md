# umbral3d — how the entrance mosaic is built (studio 25-11)

The entrance mosaic is **Beltrán's picture** («Prueba Mosaic/Finales/Mosaico.png», 7196 × 1094: the 912 rows shown on the walls plus 91
above and 91 below, so the vault never shows the sky; transparent = the openings).

1. `seg_stones.py <Prueba Mosaic dir> <scratch dir>` — finds the stones DRAWN in the picture (its light grout lines: ridge filter +
   watershed) → `lbl2.npy`.
2. `build_stones.py <Prueba Mosaic dir> <out dir> <preview.png>` — one polygon per drawn stone (crumbs joined; stones over 10 cm cut into
   ~7 cm along their own shape; across the corners and the P3 → P4 seam), its On / OFF colours (OFF = the «Prueba OFF» colour transform,
   `off_map.npy`, fitted on the first pair), the openings → `story-stones.json`, `mosaic-on.jpg`, `mosaic-off.jpg`. Copy those three here.
3. `stone_detail.py` — the tileable stone surface (`stone-detail.png`: R/G relief slopes, B mottling, A pores and veins); numpy fields,
   Blender for the PNG and a Cycles check render. `blender -b --factory-startup --python stone_detail.py -- all`.

`umbral3d.js` projects every stone from its wall into the shell as the eye sees it, builds it (flat face, worn shoulder, raw split side)
and, by default, prints his picture on it (`?mosaic=stone` in the lab: one colour per stone instead).
