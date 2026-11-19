// Electron main script for tests/spout.test.mjs: an off-screen window paints a known colour into a shared GPU texture
// (useSharedTexture, as the experience window does), the studio's Spout addon sends it with sendShared(), and the same
// addon's receiver reads it back. Prints one line: SPOUT-GPU {json}.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const addon = require(path.join(__dirname, '..', '..', 'native', 'spout-send', 'dsp_spout.node'));
const NAME = `VT GPU test ${process.pid}`;
const W = 320, H = 180;
const out = (r) => { process.stdout.write(`SPOUT-GPU ${JSON.stringify(r)}\n`); app.exit(0); };

app.disableDomainBlockingFor3DAPIs?.();
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: { useSharedTexture: true } } });
  win.webContents.setFrameRate(30);
  let paints = 0, sent = 0, lastErr = 0, info = null;
  if (!addon.start(NAME)) return out({ error: 'the sender did not start' });
  win.webContents.on('paint', (e) => {
    const t = e.texture;
    if (!t) return;
    try {
      const ti = t.textureInfo; info = { fmt: ti.pixelFormat, coded: ti.codedSize, rect: ti.contentRect || ti.visibleRect };
      const r = info.rect || { x: 0, y: 0, width: W, height: H };
      paints++;
      if (addon.sendShared(ti.handle?.ntHandle || ti.sharedTextureHandle, r.x, r.y, r.width, r.height)) sent++; else lastErr = addon.sharedError();
    } finally { t.release(); }
  });
  // a solid #3366CC page: what goes out must be exactly that colour, at exactly that size
  // an off-screen window paints only when something changes: one corner pixel flickers, as an animation would
  const page = '<body style="margin:0;background:#3366CC"><div id="d" style="position:fixed;left:0;top:0;width:2px;height:2px;background:#000"></div>'
    + '<script>let k=0;(function f(){d.style.opacity=(k++%2)?"0.5":"1";requestAnimationFrame(f)})()</script></body>';
  win.loadURL(`data:text/html,${encodeURIComponent(page)}`);
  const tick = setInterval(() => { if (!win.isDestroyed()) win.webContents.invalidate(); }, 50);
  setTimeout(async () => {
    addon.inOpen(NAME);
    // the receiver reads one frame late through staging textures: wait for one with the colour in it
    let f = null;
    for (let k = 0; k < 60 && !(f && f.data && f.data[0] > 0); k++) { await new Promise((r) => setTimeout(r, 20)); f = addon.inFrame(false); }
    clearInterval(tick);
    const px = f?.data ? [...f.data.subarray(((90 * f.w) + 160) * 4, ((90 * f.w) + 160) * 4 + 4)] : null;
    addon.inClose(); addon.stop();
    out({ paints, sent, lastErr, info, size: f ? [f.w, f.h] : null, px });
  }, 2500);
});
