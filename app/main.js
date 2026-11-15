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
    applyAutostart(m.autostart);
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
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => { sendDisplays(); applyProjection(); });
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); });
app.on('before-quit', () => {
  quitting = true;
  if (engine) engine.postMessage({ type: 'shutdown' });
});
