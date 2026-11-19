# Spout sender (prebuilt)

`dsp_spout.node` is the Node-API Spout sender built for VEATION (Alma Digital Studio's own code). Its sources are
in `src/`, copied from `Projects/Immersive Studio Pro/native/spout-send` and extended here with the GPU entry point.
- Node-API is ABI-stable, so the same binary loads in Node and in Electron.
- Spout2 SDK: BSD-2-Clause (`licenses/Spout-BSD-2-Clause.txt`); node-addon-api, build-time headers only: MIT.
- Windows only. Elsewhere the outputs report "Spout not available".

## API
One sender per process, and the app uses exactly one: the room output's, in the main process (app/main.js).
- `start(name) → bool`
- `send(buffer, width, height, flipY, bgra) → bool`: CPU pixels, 4 bytes per pixel. `bgra = true` when the bytes are B,G,R,A (Electron's
  off-screen paint bitmap, `image.toBitmap()`): the sender is then BGRA and nothing is swizzled on the CPU. The format is part of the sender,
  so asking for the other one starts the sender again under the same name.
- `sendShared(ntHandleBuffer, x, y, width, height) → bool`: a frame that already lives on the GPU. It takes an NT
  shared-texture handle (Electron off-screen rendering with `useSharedTexture`) and a region of that texture. The
  texture is opened on the sender's D3D11 device and copied GPU→GPU, keeping its format (BGRA from Chromium). The
  experiences use it to send 7196×912 at 60 fps.
- `sharedError() → number`: the last `sendShared` HRESULT; 0 = fine.
- `stop()`
- Receiver: `inList()`, `inOpen(name)`, `inFrame(invert)`, `inFormat()` (the sender's DXGI format: 28 RGBA, 87 BGRA), `inClose()`. The tests use it
  to read a sender back; the bytes come back as the sender holds them.

## Rebuild (Windows, Visual Studio 2022 with C++, Python)
```
cd native/spout-send/src
npm install --no-save --no-package-lock --ignore-scripts node-addon-api@8
npx node-gyp@11 rebuild --msvs_version=2022
copy build\Release\dsp_spout.node ..\dsp_spout.node
```
Then run `node --test tests/spout.test.mjs`. Its GPU test sends a known colour through an Electron off-screen paint
and reads it back.
