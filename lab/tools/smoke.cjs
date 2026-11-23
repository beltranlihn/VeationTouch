// VEATION Touch lab — smoke check. Opens a URL in a HIDDEN Electron window (nothing shows on the desktop), lets it run, optionally
// runs a script in the page, saves a screenshot, prints one JSON line and exits. Hard limit 15 s.
//
//   (run it through lab/tools/check.mjs, which sets LAB_SMOKE = {"url", "shot", "delay", "size", "eval", "evalFile"})
//
// Prints:  SMOKE {"url":…, "title":…, "errors":[…], "result":…}     (exit code 0; 1 when the page logged errors)
// The lab server must be running for http://localhost URLs (node lab/harness/serve.mjs).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// The options come in ONE environment variable (LAB_SMOKE, JSON): Electron treats extra command-line switches as its own and can quit
// on them (exit 127), so nothing but the script path is on the command line.
const cfg = JSON.parse(process.env.LAB_SMOKE || '{}');
const URL_ = cfg.url;
const [W, H] = String(cfg.size || '1600x400').split('x').map(Number);
const WAIT = Number(cfg.delay ?? 2500);
const SHOT = cfg.shot || null;
const SCRIPT = cfg.evalFile ? fs.readFileSync(cfg.evalFile, 'utf8') : cfg.eval || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.setPath('userData', path.join(os.tmpdir(), `vt-lab-smoke-${process.pid}`));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
setTimeout(() => { console.log('SMOKE ' + JSON.stringify({ error: 'timeout (15 s)' })); app.exit(2); }, 15000).unref();

app.whenReady().then(async () => {
  if (!URL_) { console.log('SMOKE {"error":"no url"}'); return app.exit(2); }
  const errors = [];
  // offscreen: it paints while hidden (a plain hidden window gets no frames)
  const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: true, partition: `vt-lab-${process.pid}` } });
  win.webContents.on('console-message', (e, level, message) => {
    const lv = e?.level ?? level, msg = e?.message ?? message;
    if (lv === 'error' || lv === 3) errors.push(String(msg).slice(0, 300));
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('render process gone: ' + d.reason));
  try {
    await win.loadURL(URL_);
    await sleep(WAIT);
    let result = null;
    if (SCRIPT) result = await win.webContents.executeJavaScript(`(async () => { ${SCRIPT}\n})()`);
    await sleep(200);
    if (SHOT) fs.writeFileSync(SHOT, (await win.webContents.capturePage()).toPNG());
    console.log('SMOKE ' + JSON.stringify({ url: win.webContents.getURL(), title: win.getTitle(), errors, result }));
    app.exit(errors.length ? 1 : 0);
  } catch (e) {
    console.log('SMOKE ' + JSON.stringify({ error: String(e.message || e), errors }));
    app.exit(2);
  }
});
app.on('window-all-closed', () => {});
