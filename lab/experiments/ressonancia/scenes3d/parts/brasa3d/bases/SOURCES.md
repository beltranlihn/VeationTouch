# bases — sources

The four bonfire bases of brasa v2, modelled and baked by the Plaza 3D session (26-11) with
`lab/experiments/ressonancia/scenes3d/plaza3d/blender/fire_bases.py` (branch lab/plaza-3d;
`blender -b --factory-startup --python fire_bases.py -- --out <dir>`, ~20 s).

| file | tris | size (m) | what |
|---|---|---|---|
| base_P4_pira.glb | 3 180 | 1.11 × 1.10 × 0.87 | a tower of logs, open inside, splinters and an ember bed (flame root y ≈ 0.2) |
| base_P1_santjoan.glb | 7 876 | 2.64 × 0.71 × 0.58 | logs piled along X, dry branches on top, embers along the foot |
| base_P2_brasero.glb | 2 984 | Ø 1.15, rim 0.86 | a wrought-iron bowl on three legs with a ring, full of embers (flame root y ≈ 0.7) |
| base_P3_anella.glb | 4 987 | Ø 2.1 | a stone fire pit blackened inside, embers and charred stumps in the middle |

glTF binary, uncompressed, metres, Y up, origin at the base's centre on the floor, front +Z. One material each, 1k JPG maps:
charcoal albedo, roughness (metallicRoughness), normal, emissive = the ember mask (scaled in the shader with the fire's level).

Sources — **CC0 1.0** (Poly Haven, https://polyhaven.com/license): `pine_bark`, `burned_ground_01`, `stone_fire_pit`,
`dry_branches_medium_01`; `rusty_metal_02` (scenes3d/assets/cc0, CC0). Everything else: own modelling (Alma Digital Studio).
