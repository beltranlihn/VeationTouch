// Electron main process — deliberately thin: it supervises the engine, owns the windows and
// the tray. All tracking work happens in the engine (utilityProcess), so a crash there never
// takes the UI down and vice versa. See ARCHITECTURE.md › Processes.

import { app, BrowserWindow, utilityProcess, screen, Tray, Menu, nativeImage, crashReporter, powerSaveBlocker, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
let expWanted = null;          // the experience to run, from the engine: {id, url, sink, displayId, fit, scale, fps, senderName} | null
let expWin = null, expKey = '';// its window (hidden for Spout, full screen for a display) and what it was made for

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
    closeExperienceWindow(); // its page talks to the engine that just went away; ready opens a fresh one
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
    expWanted = m.experienceWindow || null;
    applyExperienceWindow();
    applyAutostart(m.autostart);
  } else if (m?.type === 'experienceWindow') {
    expWanted = m.window || null;
    applyExperienceWindow();
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

function closeExperienceWindow() {
  const w = expWin;
  expWin = null; expKey = '';
  if (w && !w.isDestroyed()) w.destroy();
}

/**
 * The running experience (Experiences tab). Spout: an off-screen-rendered window (no visible window) whose preload
 * bridges the page to the native Spout sender. Window: a frameless full-screen window on the chosen display. Any change
 * that matters (destination, display, size, rate, sender name) makes a fresh window; `fit` is applied live by the page.
 */
function applyExperienceWindow() {
  const want = engineReady ? expWanted : null;
  const display = want?.sink === 'window' ? screen.getAllDisplays().find((d) => d.id === want.displayId) : null;
  if (!want || (want.sink === 'window' && !display)) { closeExperienceWindow(); return; }
  const { fit, ...rest } = want;
  const key = JSON.stringify({ ...rest, bounds: display?.bounds || null, port: enginePort });
  if (expWin && !expWin.isDestroyed() && key === expKey) return;
  closeExperienceWindow();
  const common = { frame: false, backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, title: `VEATION Touch — ${want.id}` };
  const w = display
    ? new BrowserWindow({
      ...common, x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    // Spout: OFF-SCREEN rendering (GPU). A merely hidden window gets no requestAnimationFrame and its timers tick at
    // Windows' 15.6 ms granularity — measured ≈ 26 fps for a 60 fps piece. Off-screen, Chromium drives frames at
    // setFrameRate(). The window itself is tiny (its paint bitmap is never used); the WebGL canvas keeps its own size.
    : new BrowserWindow({
      ...common, width: 64, height: 64, show: false,
      webPreferences: { offscreen: true, preload: path.join(ROOT, 'app', 'experience-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
    });
  if (!display) w.webContents.setFrameRate(Math.max(1, Math.min(240, Number(want.fps) || 60)));
  expWin = w; expKey = key;
  if (display) w.once('ready-to-show', () => w.showInactive());
  w.on('closed', () => { if (expWin === w) { expWin = null; expKey = ''; } });
  // the preload can load native code: this window never leaves the app's own server
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(uiUrl('/'))) e.preventDefault(); });
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`experience renderer gone (${d.reason}); restarting it`);
    setTimeout(() => { if (expWin === w) { closeExperienceWindow(); applyExperienceWindow(); } }, 1000);
  });
  w.loadURL(uiUrl(want.url));
  log(`experience "${want.id}" opened (${display ? 'full screen' : `Spout "${want.senderName}"`})`);
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
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => { sendDisplays(); applyProjection(); applyTextureWindows(); applyExperienceWindow(); });
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); });
app.on('before-quit', () => {
  quitting = true;
  if (engine) engine.postMessage({ type: 'shutdown' });
});
