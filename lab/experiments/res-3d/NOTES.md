# Ressonància — 3D base

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
The technical base of Ressonància's 3D universes (`../ressonancia/ARTE.md`): **three.js r187** (vendored in
`../ressonancia/vendor/three-r187`, MIT, loaded through an import map: no CDN) and `../ressonancia/scenes3d/room3d.js`, a CAVE:
an eye at the centre of the room (1.6 m) and one off-axis camera per wall (Kooima's generalized perspective projection through the
wall's corners), so each wall is an exact window onto a world behind it and the four windows join at the corners, P3 → P4 too.
Hands come back in world coordinates ON the wall planes. The four views render into one HDR strip target (viewport + scissor per
wall), then one post pass: bloom, ACES tone mapping, a little grain. This page is a test world: a floor grid (it must run on
without a break at every corner), a ring of columns 11 m away, four towers, a warm light on every hand.

## Solo path / Group path
Test page: a hand is a warm light on the wall, exactly where it touches.

## Controls
`renderer` (Automatic = WebGPU when available / WebGL2), `eye` (height), `bloom`, `exposure`, `grid`.

## Audio
None.

## Status and tests
- Lab harness, `?scale=1` (7196 × 912), five pinned hands (one on the P3 → P4 seam), no console errors, **60 fps on WebGPU and on
  WebGL2** (dev Mac, M1 Max; 60 is the display cap). Captures looked at on both backends: identical.
- Projection checked numerically: a hand at u 0.489, 1.25 m projects to NDC (−0.021, −0.333) as expected; the floor grid bends
  exactly at the corners (as it must on a flat strip) and does not break.
- Bugs met and fixed: a colour `scene.background` clears the whole target in WebGPU on every render (it wiped the other walls):
  the strip is cleared once per frame and skies are geometry; the wall normals had the wrong sign (mirrored views).
- Not done: the real engine (`lab-engine.mjs`), the app's output windows (Spout on the GPU with a WebGPU canvas — `alma-fluid`
  already does it), the room's RTX 6000 Ada with the GPU shared, a visitor away from the centre (only judged in the room).
- Bloom does not wrap across the P3 → P4 seam (a faint step in the glow is possible there).

## Requests to the studio
- **three.js in the lab and in the app**: a vendored library (8 MB, MIT) shared by the Ressonància pieces through a relative
  import map (`../ressonancia/vendor/three-r187/`). When integrating, keep the folders side by side or move the vendor folder to a
  shared place.
- **WebGPU as a production path**: three.js falls back to WebGL2 by itself, and the app's GPU Spout path takes the window's paints
  whatever the context; confirm it in the room.
- **Large assets**: captured places (Gaussian splats, 50–300 MB) would break the lab's 20 MB rule; none are used yet.
