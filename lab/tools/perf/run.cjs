// Electron: a real (shown) window placed off-screen, so it paints at full rate; injects the album routine, waits until it is done.
//   electron vic-cap.cjs  (env VIC_URL, VIC_SCRIPT = path of the routine, VIC_DIR, VIC_TAG)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const URL_ = process.env.VIC_URL, SCRIPT = fs.readFileSync(process.env.VIC_SCRIPT, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, x: -6000, y: 0, width: 1800, height: 600, skipTaskbar: true, focusable: false, frame: false,
    webPreferences: { backgroundThrottling: false, partition: `vic-${process.pid}` } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('render-process-gone', (_e, d) => { console.log('GONE ' + d.reason); app.exit(2); });
  win.webContents.on('console-message', (e, level, message) => { const lv = e?.level ?? level; if (lv === 'error' || lv === 3) console.log('ERR ' + String(e?.message ?? message).slice(0, 200)); });
  await win.loadURL(URL_);
  await win.webContents.executeJavaScript(SCRIPT + `\nwindow.__runAlbum(${JSON.stringify(process.env.VIC_DIR)}, ${JSON.stringify(process.env.VIC_TAG)}); 1`);
  let last = '';
  for (let i = 0; i < 900; i++) {
    await sleep(2000);
    const p = await win.webContents.executeJavaScript('JSON.stringify({ s: window.__prog && window.__prog.state, n: window.__prog && window.__prog.done.length, e: window.__prog && window.__prog.err, fps: Math.round(window.__obra && window.__obra.fps ? window.__obra.fps() : 0) })');
    const o = JSON.parse(p);
    if (o.s !== last) { console.log(new Date().toISOString().slice(11, 19), p); last = o.s; }
    if (o.s === 'done' || o.s === 'error') {
      console.log('DONE ' + await win.webContents.executeJavaScript('JSON.stringify(window.__prog.done)'));
      app.exit(o.s === 'done' ? 0 : 1);
      return;
    }
  }
  console.log('TIMEOUT'); app.exit(3);
});
