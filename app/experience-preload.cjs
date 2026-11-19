// Preload of the off-screen window that is the room output (app/main.js › applyOutputWindow, page ui/output.html).
// It loads NO native code. The app has ONE Spout sender, and it lives in the main process, which takes the window's own
// paints (GPU shared texture, or the CPU bitmap) to Spout. All this preload does is tell the page that it IS that
// output — `window.vtOut.kind === 'spout-gpu'` — so the page pins its layers 1:1 to the window's pixels, top-left, and
// never reads its own pixels back. (The kind keeps the name the experience runtime has always checked for.)

const { contextBridge } = require('electron');

if (process.argv.includes('--vt-spout=main')) {
  contextBridge.exposeInMainWorld('vtOut', {
    kind: 'spout-gpu', ok: true, error: null,
    start() { return true; },
    send() { return true; },
    stop() {},
  });
}
