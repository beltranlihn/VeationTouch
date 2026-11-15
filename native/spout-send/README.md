# Spout sender (prebuilt)

`dsp_spout.node` is the Node-API Spout sender built for VEATION (Alma Digital Studio's own code,
`Projects/Immersive Studio Pro/native/spout-send`, sources there). Node-API is ABI-stable, so the same
binary loads in Node and in Electron. Spout2 SDK: BSD-2-Clause (`licenses/Spout-BSD-2-Clause.txt`).

API: `start(name) → bool`, `send(rgbaBuffer, width, height, flipY) → bool`, `stop()`.
One sender per process. Windows only — elsewhere the texture output reports "Spout not available".
To rebuild, use the sources in the VEATION repository (node-gyp, see its CLAUDE.md).
