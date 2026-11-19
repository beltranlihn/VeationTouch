// Electron main process — deliberately thin: it supervises the engine, owns the windows and
// the tray. All tracking work happens in the engine (utilityProcess), so a crash there never
// takes the UI down and vice versa. See ARCHITECTURE.md › Processes.

import { app, BrowserWindow, utilityProcess, screen, Tray, Menu, nativeImage, crashReporter, powerSaveBlocker, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ENGINE = path.join(ROOT, 'engine', 'main.js');
const ICON = path.join(ROOT, 'build', 'icon.png');
const HIDDEN = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const dataDir = app.getPath('userData');
crashReporter.start({ uploadToServer: false, compress: true });

let engine = null, enginePort = null, engineReady = false;
let mainWin = null, projWin = null, tray = null, quitting = false;
let restarts = 0, startedAt = 0, projection = { open: false, displayId: null };
let texWanted = [];            // Texture outputs shown full screen: [{id, displayId}] from the engine
const texWins = new Map();     // output id → its full-screen window
let outWanted = null;          // the room output to run, from the engine: {url, sink, displayId, fit, scale, fps, senderName, width, height} | null
let outWin = null, outKey = '';// its window (off screen for Spout, full screen for a display) and what it was made for
let previewTimer = null;       // once a second: a JPEG of the output for the Experiences tab
let previewWanted = true;      // the engine says whether anyone looks at that preview (no capture otherwise)

function log(msg) {
  const line = `${new Date().toISOString()} MAIN  ${msg}\n`;
  process.stdout.write(line);
  try { fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true }); fs.appendFileSync(path.join(dataDir, 'logs', 'main.log'), line); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ engine supervisor

function startEngine() {
  startedAt = Date.now();
  engineReady = false;
  // The engine's live heap is ~10 MB (measured with forced GC); without a cap V8 keeps growing its spaces
  // lazily for hours. The cap makes it collect instead of reserving more. A utilityProcess ignores bare
  // V8 flags in execArgv (measured: limit stays 4 GB); they only apply wrapped in --js-flags.
  engine = utilityProcess.fork(ENGINE, ['--data', dataDir], {
    serviceName: 'VEATION Touch Engine', stdio: 'inherit',
    execArgv: ['--js-flags=--max-old-space-size=256 --max-semi-space-size=8'],
  });
  engine.on('message', onEngineMessage);
  engine.on('exit', (code) => {
    engine = null; engineReady = false;
    closeOutputWindow(); // its page talks to the engine that just went away; ready opens a fresh one
    if (quitting) return;
    if (Date.now() - startedAt > 60000) restarts = 0; // it ran fine for a minute: reset the backoff
    const delay = Math.min(30000, 1000 * 2 ** restarts++);
    log(`engine exited (code ${code}); restarting in ${delay} ms`);
    setTimeout(startEngine, delay);
  });
}

function onEngineMessage(m) {
  if (m?.type === 'ready') {
    enginePort = m.port;
    engineReady = true;
    projection = m.projection || projection;
    log(`engine ready on :${m.port}`);
    sendDisplays();
    if (mainWin) mainWin.loadURL(uiUrl()); else if (!HIDDEN) createMainWindow();
    applyProjection();
    texWanted = m.textureWindows || [];
    applyTextureWindows();
    outWanted = m.outputWindow || null;
    applyOutputWindow();
    applyAutostart(m.autostart);
  } else if (m?.type === 'previewWanted') {
    previewWanted = !!m.on;
  } else if (m?.type === 'outputWindow') {
    outWanted = m.window || null;
    applyOutputWindow();
  } else if (m?.type === 'textureWindows') {
    texWanted = m.list;
    applyTextureWindows();
  } else if (m?.type === 'projection') {
    projection = m.projection;
    applyProjection();
  } else if (m?.type === 'autostart') {
    applyAutostart(m.enabled);
  }
}

const uiUrl = (p = '/') => `http://127.0.0.1:${enginePort}${p}`;

function sendDisplays() {
  if (!engine) return;
  const list = screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    primary: d.id === screen.getPrimaryDisplay().id,
  }));
  engine.postMessage({ type: 'displays', list });
}

// Safety net for 24/7 operation: if the engine ever holds > 1.5 GB for 3 minutes, restart it
// (the supervisor brings it back in ~1 s; the profile and calibration are on disk).
const MEM_LIMIT_KB = 1.5 * 1024 * 1024;
let memStrikes = 0;
setInterval(() => {
  if (!engine?.pid) return;
  const m = app.getAppMetrics().find((x) => x.pid === engine.pid);
  const kb = m?.memory?.workingSetSize || 0;
  memStrikes = kb > MEM_LIMIT_KB ? memStrikes + 1 : 0;
  if (memStrikes >= 3) { log(`engine using ${Math.round(kb / 1024)} MB for 3 minutes — restarting it`); memStrikes = 0; engine.kill(); }
}, 60000);

// ------------------------------------------------------------------ windows

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#111111', title: 'VEATION Touch', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.loadURL(uiUrl());
  // An installation runs unattended: closing the window keeps the engine running in the tray.
  mainWin.on('close', (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.on('closed', () => { mainWin = null; });
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWin.webContents.on('render-process-gone', (_e, d) => { log(`UI renderer gone (${d.reason}); reloading`); setTimeout(() => mainWin?.loadURL(uiUrl()), 1000); });
}

function showMain() {
  if (!mainWin) createMainWindow();
  else { mainWin.show(); mainWin.focus(); }
}

function applyProjection() {
  const display = screen.getAllDisplays().find((d) => d.id === projection.displayId);
  if (!projection.open || !display || !engineReady) {
    if (projWin) { projWin.destroy(); projWin = null; }
    return;
  }
  const b = display.bounds;
  if (!projWin) {
    projWin = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, frame: false, fullscreen: true, show: false,
      backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, title: 'VEATION Touch — Projection',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    projWin.once('ready-to-show', () => projWin?.showInactive());
    projWin.on('closed', () => { projWin = null; });
    projWin.webContents.on('render-process-gone', () => setTimeout(applyProjection, 1000));
  } else {
    projWin.setFullScreen(false);
    projWin.setBounds(b);
    projWin.setFullScreen(true);
  }
  projWin.loadURL(uiUrl('/projection'));
}

/** One full-screen window per Texture output sent to a display (the page draws the mask from the live touches). */
function applyTextureWindows() {
  const displays = screen.getAllDisplays();
  const want = new Map(engineReady ? texWanted.filter((t) => displays.some((d) => d.id === t.displayId)).map((t) => [t.id, t]) : []);
  for (const [id, w] of texWins) if (!want.has(id)) { w.destroy(); texWins.delete(id); }
  for (const [id, t] of want) {
    const b = displays.find((d) => d.id === t.displayId).bounds;
    let w = texWins.get(id);
    if (!w) {
      w = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height, frame: false, fullscreen: true, show: false,
        backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, title: `VEATION Touch — Texture ${id}`,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
      });
      w.once('ready-to-show', () => w.showInactive());
      w.on('closed', () => { if (texWins.get(id) === w) texWins.delete(id); });
      w.webContents.on('render-process-gone', () => setTimeout(() => w.isDestroyed() || w.loadURL(uiUrl(`/texture?o=${encodeURIComponent(id)}`)), 1000));
      texWins.set(id, w);
      w.loadURL(uiUrl(`/texture?o=${encodeURIComponent(id)}`));
    } else if (JSON.stringify(w.getBounds()) !== JSON.stringify(b)) {
      w.setFullScreen(false); w.setBounds(b); w.setFullScreen(true);
    }
  }
}

function closeOutputWindow() {
  const w = outWin;
  outWin = null; outKey = '';
  clearInterval(previewTimer); previewTimer = null;
  if (w && !w.isDestroyed()) w.destroy();
  if (spoutOut.running) { try { spoutOut.native.stop(); } catch { /* ignore */ } spoutOut.running = false; }
}

/**
 * THE Spout sender of the whole app: the room output. It lives in this (main) process — the engine and the pages never
 * load the addon, so there can only ever be one. The output window (ui/output.html: the layers composed by Chromium)
 * renders off screen at the render size, 1:1, and its frames reach Spout one of two ways:
 *  - GPU (default): every paint hands its NT shared-texture handle (Electron's `useSharedTexture`) to `sendShared`,
 *    which copies it GPU to GPU into the Spout texture — no readPixels, no CPU buffer, so the full 7196x912 canvas keeps
 *    its frame rate. If the texture cannot be shared (another GPU on a laptop with two, an old addon...) the window is
 *    made again on the CPU path and stays there until the app restarts.
 *  - CPU (fallback): the window's normal paint bitmap (BGRA, top-down) goes to `send(..., bgra)` as it is. Slower (a 26 MB
 *    copy per frame at full size), but it works anywhere.
 */
const spoutOut = { native: null, error: null, running: false, failed: false, bad: 0, sent: 0, frames: 0, fpsT: 0, fps: 0, err: null };
function spoutSender(needGpu) {
  if (!spoutOut.native && !spoutOut.error) {
    try { spoutOut.native = require(path.join(ROOT, 'native', 'spout-send', 'dsp_spout.node').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)); }
    catch (e) { spoutOut.error = String(e?.message || e); log(`Spout unavailable: ${spoutOut.error}`); }
  }
  if (needGpu && spoutOut.native && typeof spoutOut.native.sendShared !== 'function') return null; // an old addon: CPU path
  return spoutOut.native;
}

/** Counts a frame sent (the output's real frame rate, reported once a second with the preview). */
function countFrame() {
  const now = Date.now();
  spoutOut.frames++;
  if (now - spoutOut.fpsT >= 1000) { spoutOut.fps = Math.round((spoutOut.frames * 10000) / (now - spoutOut.fpsT)) / 10; spoutOut.frames = 0; spoutOut.fpsT = now; }
}

function startSpout(want) {
  if (spoutOut.running) return true;
  // a sender that would not start is tried again every 5 s, not on every paint (each try opens a D3D11 device)
  if (Date.now() < (spoutOut.retryAt || 0)) return false;
  spoutOut.running = !!spoutOut.native.start(want.senderName || 'VEATION Touch');
  spoutOut.bad = 0; spoutOut.sent = 0; spoutOut.frames = 0; spoutOut.fpsT = Date.now(); spoutOut.fps = 0;
  spoutOut.err = spoutOut.running ? null : 'The Spout sender could not start (DirectX 11 unavailable?)';
  spoutOut.retryAt = spoutOut.running ? 0 : Date.now() + 5000;
  if (!spoutOut.running) log(spoutOut.err);
  return spoutOut.running;
}

function onGpuPaint(w, want, e) {
  const tex = e?.texture;
  if (!tex) return;
  try {
    if (outWin !== w || spoutOut.failed) return;
    const ti = tex.textureInfo || {};
    const handle = ti.handle?.ntHandle || ti.sharedTextureHandle;
    const r = ti.contentRect || ti.visibleRect || { x: 0, y: 0, width: ti.codedSize?.width || want.width, height: ti.codedSize?.height || want.height };
    if (!startSpout(want)) return; // the sender itself is down (reported, retried): not a fault of the GPU path
    const ok = handle && spoutOut.native.sendShared(handle, r.x | 0, r.y | 0, r.width | 0, r.height | 0);
    if (ok) {
      spoutOut.bad = 0; countFrame();
      if (++spoutOut.sent === 1) log(`room output -> Spout on the GPU: ${r.width}x${r.height} (${ti.pixelFormat || 'bgra'})`);
    } else if (++spoutOut.bad >= 30) { // a second of failures: fall back to the CPU path for this run of the app
      spoutOut.failed = true;
      log(`Spout GPU path failed (error ${spoutOut.native.sharedError?.() ?? '?'}, handle ${handle ? 'yes' : 'none'}); using the CPU path`);
      setTimeout(() => { closeOutputWindow(); applyOutputWindow(); }, 0);
    }
  } catch (err) {
    spoutOut.failed = true;
    log(`Spout GPU path error: ${err?.message || err}; using the CPU path`);
    setTimeout(() => { closeOutputWindow(); applyOutputWindow(); }, 0);
  } finally {
    try { tex.release(); } catch { /* released */ }
  }
}

function onCpuPaint(w, want, image) {
  if (outWin !== w || !image) return;
  try {
    const { width, height } = image.getSize();
    if (!width || !height) return;
    startSpout(want);
    if (spoutOut.running && spoutOut.native.send(image.toBitmap(), width, height, false, true)) { // BGRA, top-down: as Chromium painted it
      countFrame();
      if (++spoutOut.sent === 1) log(`room output -> Spout from the CPU: ${width}x${height} (BGRA)`);
    }
  } catch (err) { spoutOut.err = String(err?.message || err).slice(0, 200); }
}

/** Once a second: the whole output as a small JPEG (what Chromium composes, so it is the room's image) for the Experiences tab. */
function startPreview(w) {
  clearInterval(previewTimer);
  let busy = false;
  previewTimer = setInterval(async () => {
    if (busy || outWin !== w || w.isDestroyed() || !engine) return;
    busy = true;
    try {
      // the image only while someone looks at it (the engine says so): a full-size capture is a GPU readback + encode in
      // this process, the one that forwards every paint to Spout. How it is doing goes every second regardless.
      let jpeg = null;
      if (previewWanted) {
        let img = await w.webContents.capturePage();
        const { width } = img.getSize();
        if (width > 640) img = img.resize({ width: 640 });
        jpeg = img.toJPEG(60);
      }
      engine?.postMessage({ type: 'outputPreview', jpeg: jpeg?.length ? jpeg : null, fps: spoutOut.fps, error: spoutOut.error || spoutOut.err || null });
    } catch { /* the window is going away */ } finally { busy = false; }
  }, 1000);
}

/**
 * The room output (Experiences tab). Spout: an off-screen-rendered window (no visible window) the size of the render.
 * Window: a frameless full-screen window on the chosen display. The page is the same one (/output): it composes the
 * layers. Any change that matters (destination, display, size, rate, sender name) makes a fresh window; `fit` and the
 * layers are applied live by the page.
 */
function applyOutputWindow() {
  const want = engineReady ? outWanted : null;
  const display = want?.sink === 'window' ? screen.getAllDisplays().find((d) => d.id === want.displayId) : null;
  if (!want || (want.sink === 'window' && !display)) { closeOutputWindow(); return; }
  const { fit, ...rest } = want;
  const key = JSON.stringify({ ...rest, bounds: display?.bounds || null, port: enginePort });
  if (outWin && !outWin.isDestroyed() && key === outKey) return;
  closeOutputWindow();
  const common = { frame: false, backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, title: 'VEATION Touch — Output' };
  // Spout on the GPU when the addon supports it and it has not failed in this run (see spoutOut)
  const gpu = !display && !spoutOut.failed && want.width > 0 && want.height > 0 && !!spoutSender(true);
  if (!display && !gpu) spoutSender(false);
  // the preload only tells the page that this window IS a Spout output (it is pinned 1:1 to the render size, not fitted)
  const spoutWeb = { preload: path.join(ROOT, 'app', 'experience-preload.cjs'), additionalArguments: ['--vt-spout=main'], zoomFactor: 1, contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false };
  // Spout: OFF-SCREEN rendering. A merely hidden window gets no requestAnimationFrame and its timers tick at Windows'
  // 15.6 ms granularity — measured about 26 fps for a 60 fps piece. Off-screen, Chromium drives frames at setFrameRate().
  // The window is the render size either way and paints, 1:1, what the page composes.
  const w = display
    ? new BrowserWindow({
      ...common, x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    : new BrowserWindow({
      ...common, width: Math.max(16, want.width), height: Math.max(16, want.height), useContentSize: true, show: false, enableLargerThanScreen: true,
      webPreferences: { ...spoutWeb, offscreen: gpu ? { useSharedTexture: true } : true },
    });
  if (!display) {
    w.webContents.setFrameRate(Math.max(1, Math.min(240, Number(want.fps) || 60)));
    w.setContentSize(Math.max(16, want.width), Math.max(16, want.height)); // larger than the screen is fine off screen
    if (spoutOut.native) w.webContents.on('paint', (e, _dirty, image) => (gpu ? onGpuPaint(w, want, e) : onCpuPaint(w, want, image)));
    else spoutOut.err = `Spout is not available (${spoutOut.error || 'unknown'})`;
  }
  outWin = w; outKey = key;
  if (display) w.once('ready-to-show', () => w.showInactive());
  w.on('closed', () => { if (outWin === w) { outWin = null; outKey = ''; } });
  // the preload can load native code: this window never leaves the app's own server
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(uiUrl('/'))) e.preventDefault(); });
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`output renderer gone (${d.reason}); restarting it`);
    setTimeout(() => { if (outWin === w) { closeOutputWindow(); applyOutputWindow(); } }, 1000);
  });
  w.loadURL(uiUrl(want.url));
  startPreview(w);
  log(`room output opened (${display ? 'full screen' : `Spout "${want.senderName}", ${gpu ? 'GPU' : 'CPU'} path`}, ${want.width}x${want.height})`);
}

function applyAutostart(enabled) {
  if (!app.isPackaged) return; // dev runs must not register electron.exe at login
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--hidden'] });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('VEATION Touch');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open VEATION Touch', click: showMain },
    { label: 'Open in browser', click: () => enginePort && shell.openExternal(uiUrl()) },
    { type: 'separator' },
    { label: 'Restart engine', click: () => engine?.kill() },
    { label: 'Data folder', click: () => shell.openPath(dataDir) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showMain);
}

// ------------------------------------------------------------------ lifecycle

app.on('second-instance', showMain);
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  powerSaveBlocker.start('prevent-display-sleep'); // projection + sensors must not sleep mid-show
  createTray();
  startEngine();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => { sendDisplays(); applyProjection(); applyTextureWindows(); applyOutputWindow(); });
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); });
app.on('before-quit', () => {
  quitting = true;
  if (engine) engine.postMessage({ type: 'shutdown' });
});
