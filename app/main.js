// Electron main process — deliberately thin: it supervises the engine, owns the windows and
// the tray. All tracking work happens in the engine (utilityProcess), so a crash there never
// takes the UI down and vice versa. See ARCHITECTURE.md › Processes.

import { app, BrowserWindow, utilityProcess, screen, Tray, Menu, nativeImage, crashReporter, powerSaveBlocker, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { outputWebPreferences, guardOutputWindow } = require('./output-window.cjs');
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
let audioWanted = null;        // the room's sound window, from the engine: {url} | null
let audioWin = null, audioKey = ''; // its (hidden) window and what it was opened for
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
    // the room output stays: its clips keep playing on its own clock and files (its workers read the disk), and its page
    // reconnects when the engine is back (on the same port the window is kept; on another one, ready makes a fresh one)
    closeAudioWindow();
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
    audioWanted = m.audioWindow || null;
    applyAudioWindow();
    applyAutostart(m.autostart);
  } else if (m?.type === 'previewWanted') {
    previewWanted = !!m.on;
  } else if (m?.type === 'outputWindow') {
    outWanted = m.window || null;
    applyOutputWindow();
  } else if (m?.type === 'audioWindow') {
    audioWanted = m.window || null;
    applyAudioWindow();
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
    // where it is (DIP) and how it runs: the Advanced Output finds its screens by id, then by geometry, and covers them
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    scaleFactor: d.scaleFactor, hz: Math.round(d.displayFrequency || 0) || null,
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
    // the preload only gives the page the disk paths of files dropped on it (window.vtDesktop.pathsFor)
    webPreferences: { preload: path.join(ROOT, 'app', 'main-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.loadURL(uiUrl());
  // An installation runs unattended: closing the window keeps the engine running in the tray.
  mainWin.on('close', (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.on('closed', () => { mainWin = null; });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    // Output › Screens › Preview window: the room output page with the screens' composition at scale, in a normal window
    // of this app (the same preferences and the same navigation guard as the output window: its HAP workers read files)
    if (isScreensPreview(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 820, autoHideMenuBar: true, backgroundColor: '#111111', title: 'VEATION Touch — Screens preview', icon: ICON, webPreferences: outputWebPreferences({ spout: false }) } };
    }
    shell.openExternal(url); return { action: 'deny' };
  });
  mainWin.webContents.on('did-create-window', (w, { url }) => {
    if (!isScreensPreview(url)) { w.destroy(); return; }
    guardOutputWindow(w.webContents, uiUrl('/').replace(/\/$/, ''), (u) => log(`screens preview: navigation to ${String(u).slice(0, 120)} refused`));
  });
  mainWin.webContents.on('render-process-gone', (_e, d) => { log(`UI renderer gone (${d.reason}); reloading`); setTimeout(() => mainWin?.loadURL(uiUrl()), 1000); });
}

/** Only our own output page in preview mode opens in a window of the app (anything else goes to the browser). */
function isScreensPreview(url) {
  try { const u = new URL(url); return u.origin === new URL(uiUrl('/')).origin && u.pathname === '/output' && u.searchParams.get('screens') === 'preview'; } catch { return false; }
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

/**
 * The output window does not answer (its renderer hangs: a GPU reset, a page in an endless loop): a fresh one. Its page
 * finds the clips where the engine's clock says (MEDIA-SERVER.md F13: back in place in under 2 s once it loads).
 */
const OUT_HANG_MS = 8000;
function recoverOutput(w, why) {
  if (outWin !== w) return;
  log(`room output ${why}; opening it again`);
  closeOutputWindow();
  applyOutputWindow();
}

/**
 * Once a second: how the output window is doing, and the whole output as a small JPEG (what Chromium composes, so it is
 * the room's image) while someone looks at it. It is also the window's heartbeat: a page that does not answer a tiny
 * script for OUT_HANG_MS is a hung renderer, and the window is made again (the engine shows "not answering" meanwhile:
 * nothing is reported while it hangs).
 */
function startPreview(w, want = null) {
  clearInterval(previewTimer);
  let busy = false, busySince = 0;
  const visible = want?.sink === 'screens' || want?.sink === 'window';
  previewTimer = setInterval(async () => {
    if (outWin !== w || w.isDestroyed() || !engine) return;
    if (busy) { if (Date.now() - busySince > OUT_HANG_MS) recoverOutput(w, `not answering for ${Math.round((Date.now() - busySince) / 1000)} s`); return; }
    busy = true; busySince = Date.now();
    try {
      // the page's own composition rate: a visible window has no Spout frames to count (the off-screen one does, below)
      const pageFps = await w.webContents.executeJavaScript('window.__out?.stats?.timing?.fps ?? null');
      // the image only while someone looks at it (the engine says so): a full-size capture is a GPU readback + encode in
      // this process, the one that forwards every paint to Spout. How it is doing goes every second regardless.
      let jpeg = null;
      if (previewWanted) {
        if (want?.sink === 'screens') {
          // the window shows the screens' slices (the Fx4's layout): the monitor wants the canvas, which the page gives
          const url = await w.webContents.executeJavaScript('window.__out?.previewJpeg?.() || null');
          jpeg = typeof url === 'string' && url.startsWith('data:image/jpeg;base64,') ? Buffer.from(url.slice(23), 'base64') : null;
        } else {
          let img = await w.webContents.capturePage();
          const { width } = img.getSize();
          if (width > 640) img = img.resize({ width: 640 });
          jpeg = img.toJPEG(60);
        }
      }
      const fps = visible ? (Number.isFinite(pageFps) ? pageFps : 0) : spoutOut.fps;
      engine?.postMessage({ type: 'outputPreview', jpeg: jpeg?.length ? jpeg : null, fps, error: visible ? null : spoutOut.error || spoutOut.err || null });
    } catch { /* the window is going away */ } finally { busy = false; }
  }, 1000);
}

/**
 * The room output (Experiences tab). Spout: an off-screen-rendered window (no visible window) the size of the render.
 * Window: a frameless full-screen window on the chosen display. The page is the same one (/output): it composes the
 * layers. Any change that matters (destination, display, size, rate, sender name) makes a fresh window; `fit` and the
 * layers are applied live by the page.
 */
/** The rectangle (DIP) that covers several displays' bounds. */
function unionBounds(list) {
  const x = Math.min(...list.map((b) => b.x)), y = Math.min(...list.map((b) => b.y));
  return { x, y, width: Math.max(...list.map((b) => b.x + b.width)) - x, height: Math.max(...list.map((b) => b.y + b.height)) - y };
}

function applyOutputWindow() {
  if (!engineReady && !quitting) return; // the engine is restarting: the output window keeps playing as it is
  const want = engineReady ? outWanted : null;
  const all = screen.getAllDisplays();
  // screens (Advanced Output): the displays the engine found for them must still be here; one of them = full screen on
  // it, several = one frameless window over their bounding rectangle (one GPU context: they share the mixer's image)
  const scr = want?.sink === 'screens' ? (want.screens?.displays || []).map((id) => all.find((d) => d.id === id)) : null;
  if (scr && (!scr.length || scr.some((d) => !d))) { closeOutputWindow(); return; }
  const span = scr && scr.length > 1 ? unionBounds(scr.map((d) => d.bounds)) : null;
  const display = want?.sink === 'window' ? all.find((d) => d.id === want.displayId) : scr?.length === 1 ? scr[0] : null;
  if (!want || (want.sink === 'window' && !display)) { closeOutputWindow(); return; }
  const { fit, ...rest } = want;
  const key = JSON.stringify({ ...rest, bounds: span || display?.bounds || null, port: enginePort });
  if (outWin && !outWin.isDestroyed() && key === outKey) return;
  closeOutputWindow();
  const common = { frame: false, backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, title: 'VEATION Touch — Output' };
  // Spout on the GPU when the addon supports it and it has not failed in this run (see spoutOut)
  const visible = !!(display || span); // a display (full screen) or the span of several: not the off-screen Spout window
  const gpu = !visible && !spoutOut.failed && want.width > 0 && want.height > 0 && !!spoutSender(true);
  if (!visible && !gpu) spoutSender(false);
  // The preload only tells the page that this window IS a Spout output (it is pinned 1:1 to the render size, not fitted).
  // Both kinds have Node in their WORKERS (the HAP decoders read the clips with fs: app/output-window.cjs), so both are
  // guarded below: they never leave this app's server.
  // Spout: OFF-SCREEN rendering. A merely hidden window gets no requestAnimationFrame and its timers tick at Windows'
  // 15.6 ms granularity — measured about 26 fps for a 60 fps piece. Off-screen, Chromium drives frames at setFrameRate().
  // The window is the render size either way and paints, 1:1, what the page composes.
  const w = span
    ? new BrowserWindow({ // several displays: frameless over all of them, above the taskbar (vsync'd requestAnimationFrame)
      ...common, x: span.x, y: span.y, width: span.width, height: span.height, show: false, enableLargerThanScreen: true, resizable: false, movable: false,
      webPreferences: outputWebPreferences({ spout: false }),
    })
    : display
    ? new BrowserWindow({
      ...common, x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, show: false,
      webPreferences: outputWebPreferences({ spout: false }),
    })
    : new BrowserWindow({
      ...common, width: Math.max(16, want.width), height: Math.max(16, want.height), useContentSize: true, show: false, enableLargerThanScreen: true,
      webPreferences: outputWebPreferences({ spout: true, preload: path.join(ROOT, 'app', 'experience-preload.cjs'), gpu }),
    });
  if (span) { w.setAlwaysOnTop(true, 'screen-saver'); w.setBounds(span); }
  if (!visible) {
    w.webContents.setFrameRate(Math.max(1, Math.min(240, Number(want.fps) || 60)));
    w.setContentSize(Math.max(16, want.width), Math.max(16, want.height)); // larger than the screen is fine off screen
    if (spoutOut.native) w.webContents.on('paint', (e, _dirty, image) => (gpu ? onGpuPaint(w, want, e) : onCpuPaint(w, want, image)));
    else spoutOut.err = `Spout is not available (${spoutOut.error || 'unknown'})`;
  }
  outWin = w; outKey = key;
  if (visible) w.once('ready-to-show', () => { w.showInactive(); if (span) w.setBounds(span); });
  w.on('closed', () => { if (outWin === w) { outWin = null; outKey = ''; } });
  // the preload can load native code and the workers have Node: this window never leaves the app's own server
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(uiUrl('/'))) e.preventDefault(); });
  guardOutputWindow(w.webContents, uiUrl('/').replace(/\/$/, ''), (url) => log(`room output: navigation to ${String(url).slice(0, 120)} refused`));
  // RECOVERY (MEDIA-SERVER.md F13). The renderer died: a fresh window a second later. It hangs: Chromium's own hang
  // monitor ('unresponsive', visible windows) or the heartbeat of startPreview (every kind) make a fresh one. The page
  // did not load (the engine was restarting): loaded again. Either way the page takes the transport from the engine and
  // puts the clips where its clock says; nothing else is restarted.
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`output renderer gone (${d.reason}); restarting it`);
    setTimeout(() => { if (outWin === w) { closeOutputWindow(); applyOutputWindow(); } }, 1000);
  });
  let hang = null;
  w.on('unresponsive', () => { clearTimeout(hang); hang = setTimeout(() => recoverOutput(w, 'unresponsive'), 5000); });
  w.on('responsive', () => { clearTimeout(hang); hang = null; });
  w.on('closed', () => clearTimeout(hang));
  w.webContents.on('did-fail-load', (_e, code, desc, url, mainFrame) => {
    if (!mainFrame || code === -3) return; // -3: a navigation aborted (the guard, a reload): not a failed load
    log(`room output page did not load (${desc || code}); trying again in 2 s`);
    const retry = () => { if (outWin !== w || w.isDestroyed()) return; if (!engineReady) { setTimeout(retry, 2000); return; } w.loadURL(uiUrl(want.url)); };
    setTimeout(retry, 2000);
  });
  w.loadURL(uiUrl(want.url));
  startPreview(w, want);
  log(`room output opened (${span ? `screens over ${scr.length} displays` : scr ? 'screens, full screen' : display ? 'full screen' : `Spout "${want.senderName}", ${gpu ? 'GPU' : 'CPU'} path`}, ${want.width}x${want.height})`);
}

function closeAudioWindow() {
  const w = audioWin;
  audioWin = null; audioKey = '';
  if (w && !w.isDestroyed()) w.destroy();
}

/**
 * The room's sound: a hidden window (no content to show, no off-screen rendering) running /audio, which owns the audio
 * contexts and the output devices (ui/js/audio-host.js). It must not be throttled or wait for a click to make sound, and it
 * needs the microphone permission once (Chromium gives device NAMES only after it) — see the permission handlers below.
 */
function applyAudioWindow() {
  const want = engineReady ? audioWanted : null;
  if (!want) { closeAudioWindow(); return; }
  const key = `${enginePort}${want.url}`;
  if (audioWin && !audioWin.isDestroyed() && key === audioKey) return;
  closeAudioWindow();
  const w = new BrowserWindow({
    show: false, width: 480, height: 240, skipTaskbar: true, autoHideMenuBar: true, title: 'VEATION Touch — Audio',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  audioWin = w; audioKey = key;
  w.on('closed', () => { if (audioWin === w) { audioWin = null; audioKey = ''; } });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(uiUrl('/'))) e.preventDefault(); });
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`audio renderer gone (${d.reason}); restarting it`);
    setTimeout(() => { if (audioWin === w) { closeAudioWindow(); applyAudioWindow(); } }, 1000);
  });
  w.loadURL(uiUrl(want.url));
  log('room audio window opened (hidden)');
}

/** Only this app's audio window may use the microphone permission (to read device names) and speaker selection; no video, nothing else. */
function installAudioPermissions() {
  const isAudio = (wc) => !!audioWin && !audioWin.isDestroyed() && wc === audioWin.webContents;
  const ok = (permission, details) => (permission === 'speaker-selection' || permission === 'media') && !(details?.mediaTypes || []).includes('video');
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    // (Electron's default is to grant everything; the other windows keep that — only the audio window is narrowed)
    callback(isAudio(wc) ? ok(permission, details) && String(details?.requestingUrl || '').startsWith(uiUrl('/')) : true);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (!isAudio(wc)) return true;
    return ok(permission, details) && String(requestingOrigin || '').startsWith(uiUrl('/').replace(/\/$/, ''));
  });
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
  installAudioPermissions();
  createTray();
  startEngine();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => { sendDisplays(); applyProjection(); applyTextureWindows(); applyOutputWindow(); });
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); });
app.on('before-quit', () => {
  quitting = true;
  if (engine) engine.postMessage({ type: 'shutdown' });
});
