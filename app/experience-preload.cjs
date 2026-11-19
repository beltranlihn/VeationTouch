// Preload of the hidden window that runs an experience for Spout (app/main.js › applyExperienceWindow).
// It is the ONLY place a page touches native code: it loads the studio's Spout sender (native/spout-send/dsp_spout.node,
// Node-API) in THIS renderer process — one sender per process, separate from the Texture output's in the engine — and
// hands the page a small bridge, window.vtOut, which experiences/runtime.js uses from vt.frame(). Not sandboxed (it must
// require a native module), but it only ever loads pages of the app's own server.

const { contextBridge } = require('electron');
const path = require('node:path');

let native = null, error = null, running = false;
try {
  // packaged, the addon lives outside the asar archive
  const file = path.join(__dirname, '..', 'native', 'spout-send', 'dsp_spout.node').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  native = require(file);
} catch (e) {
  error = String((e && e.message) || e).slice(0, 200);
}

contextBridge.exposeInMainWorld('vtOut', {
  kind: 'spout',
  ok: !!native,
  error,
  start(name) {
    if (!native) return false;
    try { running = !!native.start(String(name || 'VEATION Touch Experience')); } catch (e) { running = false; }
    return running;
  },
  /** rgba: Uint8Array of w × h × 4, rows bottom-up when flipY is true (what gl.readPixels gives). */
  send(rgba, width, height, flipY) {
    if (!native || !running) return false;
    try { return !!native.send(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width | 0, height | 0, !!flipY); } catch (e) { return false; }
  },
  stop() {
    if (!native || !running) return;
    running = false;
    try { native.stop(); } catch (e) { /* ignore */ }
  },
});
