# Measuring a lab piece's GPU cost (studio 26-11, OPTIMIZAR-60FPS)

Tools to measure `res-trailer` (or any piece built on `room3d.js`) at room size, the same way every time.

```
node lab/harness/serve.mjs --port 8795                                  # the lab server
node lab/tools/perf/save-server.mjs "<folder for captures>" 8797 8795   # same-origin proxy: lets a routine save PNGs (POST /__save)
```

Then, with `ELECTRON_RUN_AS_NODE` unset and `E` = `node_modules/electron/dist/electron.exe`:

```
VIC_URL="http://127.0.0.1:8797/experiences/res-trailer/index.html?capture&demo=0&scale=1&perf&params=%7B%22jump%22%3A%22wait%22%7D" \
VIC_SCRIPT=lab/tools/perf/perf-routine.js VIC_DIR=perf VIC_TAG=base  "$E" lab/tools/perf/run-uncapped.cjs
```

- `run-uncapped.cjs`: no vsync, no frame-rate limit — the GPU runs flat out, so **uncapped fps** is the honest number
  (a laptop GPU capped at 60 fps lowers its clock and the timestamp milliseconds lie). `run.cjs`: the same, capped (for captures).
- `perf-routine.js`: waits for the piece, 14 s warm-up, 10 s of samples → `DONE [{ fps, gpu, calls, tris, passes }]`
  (`passes.wall0..3`, `taa`, `post`, `mask`: GPU ms per pass from `window.__roomPerf`; ignore `pre` / `other`, they accumulate).
- **Compare variants with the ratio `walls ÷ (taa + post)` of the same run**: clock changes move every pass alike, so the ratio
  is stable where the raw ms are not. Run each variant twice, back to back.
- `mesh-routine.js`: the 12 heaviest visible meshes of the block (vertices × instances, culling, reactive, material).
- `capture-p4.js`, `capture-corner.js`: wall P4 at rest / hand arriving / hand held, a close-up, and the P4|P1 corner, as PNGs
  through the proxy — to prove an optimisation left the image as it was (compare at 1:1).

URL switches (lab only, nothing changes without them): `perf` (measure), `pnobloom`, `pwalls=N` (room3d);
`pflat`, `pnohero`, `pnoidle`, `pnosect`, `pnoise3d` (umbral3d, the entrance). Blocks for `jump`: `wait` (entrance), `intro`,
`brasa`, `festa`.
