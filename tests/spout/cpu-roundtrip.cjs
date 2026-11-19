// Electron main script for tests/spout.test.mjs: the CPU fallback of the room output (app/main.js › onCpuPaint). An
// off-screen window (plain `offscreen: true`, no shared texture) paints a known colour, its paint bitmap (BGRA,
// top-down: image.toBitmap()) goes to the studio's Spout addon as it is — send(..., bgra = true) — and the same addon's
// receiver reads it back. Prints one line: SPOUT-CPU {json}.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const addon = require(path.join(__dirname, '..', '..', 'native', 'spout-send', 'dsp_spout.node'));
const NAME = `VT CPU test ${process.pid}`;
const W = 320, H = 180;
const out = (r) => { process.stdout.write(`SPOUT-CPU ${JSON.stringify(r)}\n`); app.exit(0); };

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(30);
  let paints = 0, sent = 0, size = null;
  if (!addon.start(NAME)) return out({ error: 'the sender did not start' });
  win.webContents.on('paint', (_e, _dirty, image) => {
    paints++;
    const s = image.getSize();
    size = [s.width, s.height];
    if (addon.send(image.toBitmap(), s.width, s.height, false, true)) sent++;
  });
  // a solid #3366CC page; an off-screen window paints only when something changes: one corner pixel flickers
  const page = '<body style="margin:0;background:#3366CC"><div id="d" style="position:fixed;left:0;top:0;width:2px;height:2px;background:#000"></div>'
    + '<script>let k=0;(function f(){d.style.opacity=(k++%2)?"0.5":"1";requestAnimationFrame(f)})()</script></body>';
  win.loadURL(`data:text/html,${encodeURIComponent(page)}`);
  const tick = setInterval(() => { if (!win.isDestroyed()) win.webContents.invalidate(); }, 50);
  setTimeout(async () => {
    addon.inOpen(NAME);
    let f = null;
    for (let k = 0; k < 60 && !(f && f.data && f.data[0] > 0); k++) { await new Promise((r) => setTimeout(r, 20)); f = addon.inFrame(false); }
    clearInterval(tick);
    const px = f?.data ? [...f.data.subarray(((90 * f.w) + 160) * 4, ((90 * f.w) + 160) * 4 + 4)] : null;
    const format = addon.inFormat();
    addon.inClose(); addon.stop();
    out({ paints, sent, size, recv: f ? [f.w, f.h] : null, px, format });
  }, 2500);
});
