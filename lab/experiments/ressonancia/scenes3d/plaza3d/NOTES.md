# Plaza 3D — the intro's night square, modelled in Blender and baked

- **Status:** prototype
- **Kind:** visual (a part for `ressonancia/scenes3d`, replaces `parts/plaza.js` behind a parameter)
- **Author:** Beltrán (direction) · Claude (3D)
- **Updated:** 2026-11-26

## Concept
The square of the intro, where the castell is explained, rebuilt as a professional night set: an old square of Barcelona's
old town (no cafés, chairs, umbrellas or planters), wet worn flagstones, arcades lit from inside, iron lanterns, a Gothic
church with a lit rose window (P2) and a chapel with tall stained-glass lancets (P3). Nothing tall in front of the four
castells (one at the centre of every wall, 8.5 m beyond it); the building behind each castell is low, so the top of the
tower stands against the night sky. Streets leave the square at the room's corners (depth where the image folds).

## How it is built
- `blender/plaza_gen.py` builds everything headless (`blender -b --factory-startup --python plaza_gen.py -- ...`), in the room's
  exact geometry (room3d.js: eye at the centre at 1.6 m, one off-axis view per wall). `--look 1` = look-dev (CC0 models,
  Cycles materials, night light, ground haze); `--render s --cams 0,1,2,3` renders what each wall shows (s = scale of 261 px/m).
- `blender/fetch_assets.py` fetches the CC0 sources (Poly Haven) into `blender/assets_src/` (git-ignored: they are offline
  sources only, nothing of them ships).
- `viewer.html` — WebGPU viewer of the blockout mesh (room view, strip, orbit, plan).
- Plan for the room: render ONE 360° panorama from the eye (equirectangular band −30°…+40°) with per-light layers (each lamp,
  the windows by id), depth and a floor mask; the runtime composes them in one full-screen pass (target ≪ 5 ms) and reveals
  the square as particles reconstructed from the depth panorama.

## Solo path / Group path
Not interactive by itself; the intro's lamp event (T-056) will light one lamp layer.

## Controls
To come with the runtime part: lamps (per lamp), windows, haze, wetness, sky tint, reveal, silhouette.

## Audio
None (the intro's sound is `ressonancia-sound`).

## Status and tests
- 2026-11-26: grey blockout + WebGPU viewer → Beltrán: too simple («perkin»), wants the detail and textures of the refs.
- 2026-11-26: look-dev v1 in Cycles (detail kit: voussoirs, pilasters, cornices with modillions, balusters, window carpentry,
  shutters, corbelled balconies; Poly Haven street lamps, wall lanterns, castle doors, arcade lanterns; textured stone, wet
  flagstones, stained glass, haze). ~45 s per wall at full size on the RTX 4060 laptop.
- 2026-11-26: v2 with Megascans Gothic pieces (church portal, chapel two-light windows, bell-tower three-light window) and
  leak streaks; v3 with organic ground fog (banks, clearings, undulating top) and a dimmer sky in reflections.
- 2026-11-26: POINT CLOUD for LA TORRE (camera rises by a wall, so the panorama does not apply there):
  `blender/plaza_points.py` → `../parts/plaza3d/points.bin` + `points.json` (≈400 k points, 6.4 MB; format, frame, facades and
  heights in the JSON). Beltrán: «Me gusta». The tower session draws it with its own particle material.

## Assets and licences
- Poly Haven (CC0): monastery_stone_floor, sandstone_blocks_08, old_sandstone_02, yellow_plaster, worn_shutter (2k);
  street_lamp_01, street_lamp_02, large_castle_door, lantern_chandelier_01 (1k glTF); qwantani_night_puresky (2k HDR);
  clay_roof_tiles_02 (already in `../assets/cc0`).
- Fab (Quixel Megascans, free, Fab Standard / Quixel content licence; added from Beltrán's Fab account on 2026-11-26 with
  his OK «Agrega lo que necesitas mientras no sea de pago»). Sources stay out of git (only the bake ships); to rebuild,
  download them again from Fab (FBX, Medium quality; decal: texture set 2K) and unzip into `blender/assets_src/fab/<key>/`
  with the files renamed `mesh.fbx`, `2K_<Map>.jpg` (Windows path limit):
  - `door01` — Historic Medieval Church Ruin Door Stone Modular 01 (church portal ×1.9, chapel door ×1.05)
  - `win02` — Historic Medieval Church Ruin Window Stone Modular 02 (three-light window, bell tower)
  - `win08` — Historic Medieval Church Ruin Window Stone Modular 08 (two-light lancet ×2.3, chapel)
  - `leak01` — Leakage (decal, tculfhnc): rain streaks under balconies, sills and cornices

## Requests to the studio
None yet. Integration: a new part `plaza3d` beside `plaza` with a parameter to choose (the trailer's director integrates it).
