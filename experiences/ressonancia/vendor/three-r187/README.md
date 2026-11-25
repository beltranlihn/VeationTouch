# three.js r187 (vendored for the lab)

- Source: npm `three@0.187.0` (2026-10-30), MIT — see `LICENSE`. Only `build/three.core.js`, `build/three.webgpu.js`,
  `build/three.tsl.js` and part of `examples/jsm` (as `jsm/`) are copied; nothing is modified.
- Pages load it through an import map (no CDN, works offline):
  `"three": ".../build/three.webgpu.js", "three/webgpu": same, "three/tsl": ".../build/three.tsl.js", "three/addons/": ".../jsm/"`.
- Used by Ressonància's 3D scenes (`../../scenes3d/`). Pin the version: WebGPURenderer and TSL change between releases.
