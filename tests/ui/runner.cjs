// UI test runner: loads the REAL operator UI in a hidden Electron window against a test engine, runs a script in the
// page and prints its result. Used by tests/ui.test.mjs (npm test). Not shipped (tests/ is not in the installer).
//   electron tests/ui/runner.cjs --url=http://127.0.0.1:<port>/ --script=<file> [--w=1440 --h=900 --mobile]
// The script file is the body of an async function run in the page; whatever it returns is printed as
// "UI-RESULT <json>". Page errors (uncaught exceptions, console.error) are collected and printed too.
// A hidden window paints no frames (requestAnimationFrame does not run): scripts that read a canvas draw it first.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const URL_ = arg('url'), SCRIPT = fs.readFileSync(arg('script'), 'utf8');
const W = Number(arg('w', 1440)), H = Number(arg('h', 900)), mobile = process.argv.includes('--mobile');
const waitState = arg('wait', 'state') === 'state'; // 'load': do not wait for the engine's state (unpaired pages)
const out = (tag, obj) => process.stdout.write(`${tag} ${JSON.stringify(obj)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => { out('UI-ERROR', { message: 'runner timeout (40 s)' }); app.exit(2); }, 40000);

app.whenReady().then(async () => {
  const errors = [];
  // an in-memory session per run: nothing a test leaves in localStorage (last view, Full app…) reaches the next one
  const win = new BrowserWindow({ show: false, width: W, height: H, webPreferences: { backgroundThrottling: false, partition: `vt-ui-test-${process.pid}` } });
  win.webContents.on('console-message', (e, level, message) => {
    const lv = e?.level ?? level, msg = e?.message ?? message;
    // the UI retries its WebSocket while the engine is not up yet: not a page error
    if ((lv === 'error' || lv === 3) && !/WebSocket connection/.test(String(msg))) errors.push(String(msg));
  });
  await win.loadURL(URL_);
  if (mobile) {
    // a phone: touch as the main pointer (the page then opens the calibration remote) — the debugger can only be
    // attached to a loaded page, so emulate and load again
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await win.loadURL(URL_);
  }
  // ready = the engine's first state has arrived and the views are rendered
  for (let k = 0; k < 150 && waitState; k++) {
    const ok = await win.webContents.executeJavaScript('import("/js/conn.js").then((m) => !!m.store.state && !!window.__vt)').catch(() => false);
    if (ok) break;
    await sleep(100);
  }
  await sleep(300);
  try {
    const result = await win.webContents.executeJavaScript(`(async () => { ${SCRIPT}\n})()`);
    await sleep(200); // late errors from what the script triggered
    out('UI-RESULT', { result, errors });
  } catch (e) {
    out('UI-ERROR', { message: e.message, errors });
  }
  app.exit(0);
});
