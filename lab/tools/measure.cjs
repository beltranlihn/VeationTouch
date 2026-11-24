// VEATION Touch lab — the Electron side of measure.mjs (run through it: it holds the GPU lock). Two hidden windows on the same GPU:
// the ROOM instance (the URL as given, e.g. ?scale=1) and, optionally, the app's VIEWER instance (?view=1: 0.5×, 30 fps). Both jump
// to the block once the light-set warm-up is done; then the room measures its frames for `secs` seconds.
// LAB_MEASURE = {"room", "viewer", "block", "secs", "settle", "uncapped", "max"}
// Prints:  MEASURE {"block", "frames", "fps", "p50", "p95", "p99", "worst", "over20", "over33", "obraFps", "cpu", "viewer": {...}, "errors"}
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const os = require('node:os');

const cfg = JSON.parse(process.env.LAB_MEASURE || '{}');
const MAX = Math.max(30000, Number(cfg.max) || 120000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', path.join(os.tmpdir(), `vt-lab-measure-${process.pid}`));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (cfg.uncapped) app.commandLine.appendSwitch('disable-frame-rate-limit');   // --uncapped: rAF is not held to 60 (the headroom)
setTimeout(() => { console.log('MEASURE ' + JSON.stringify({ error: `timeout (${Math.round(MAX / 1000)} s)` })); app.exit(2); }, MAX).unref();

const READY = `(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 600 && !window.__obra; i++) await w(100); if (!window.__obra) return 'no __obra'; await window.__obra.warm?.done; return 'ok'; })()`;
const JUMP = (b) => `(async () => { const o = window.__obra; o.score.jump(${JSON.stringify(b)}); await new Promise((r) => setTimeout(r, 300)); if (o.tr) o.tr.t = 99; return o.score.state.block; })()`;
const MEASURE = (secs) => `(async () => {
  const o = window.__obra, dts = []; let prev = performance.now(), on = true;
  o.prof?.reset?.();
  const f0 = performance.now();
  const tick = () => { const t = performance.now(); dts.push(t - prev); prev = t; if (on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const fpsS = []; for (let i = 0; i < ${secs}; i++) { await new Promise((r) => setTimeout(r, 1000)); fpsS.push(Math.round(o.fps())); }
  on = false; const dur = (performance.now() - f0) / 1000;
  const s = dts.slice(1).sort((a, b) => a - b), q = (p) => +(s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0).toFixed(1);
  const fs = fpsS.slice().sort((a, b) => a - b);
  return { block: o.score.state.block, frames: dts.length, fps: +(dts.length / dur).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: +(s[s.length - 1] || 0).toFixed(0),
    over20: dts.filter((d) => d > 20).length, over33: dts.filter((d) => d > 33.4).length, obraFps: { min: fs[0], med: fs[fs.length >> 1], max: fs[fs.length - 1] },
    cpu: Object.fromEntries(Object.entries(o.prof?.m || {}).map(([k, v]) => [k, +(+v).toFixed(1)])), size: [document.querySelector('canvas').width, document.querySelector('canvas').height] };
})()`;

app.whenReady().then(async () => {
  const errors = [];
  const mk = (w, h, fps) => {
    const win = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: true, partition: `vt-lab-m-${process.pid}` } });
    win.webContents.setAudioMuted(true);
    win.webContents.setFrameRate(fps);
    win.webContents.on('console-message', (e, level, message) => { const lv = e?.level ?? level, msg = e?.message ?? message; if (lv === 'error' || lv === 3) errors.push(String(msg).slice(0, 240)); });
    win.webContents.on('render-process-gone', (_e, d) => errors.push('render process gone: ' + d.reason));
    return win;
  };
  try {
    const room = mk(1920, 260, cfg.uncapped ? 240 : 60);
    const viewer = cfg.viewer ? mk(960, 140, 30) : null;
    await Promise.all([room.loadURL(cfg.room), viewer?.loadURL(cfg.viewer)]);
    const ready = await Promise.all([room.webContents.executeJavaScript(READY), viewer?.webContents.executeJavaScript(READY)]);
    if (ready[0] !== 'ok') throw new Error('room: ' + ready[0]);
    await Promise.all([room.webContents.executeJavaScript(JUMP(cfg.block)), viewer?.webContents.executeJavaScript(JUMP(cfg.block))]);
    await sleep(Number(cfg.settle ?? 3000));                          // the block's first frames and its transition are not the steady state
    const [r, v] = await Promise.all([room.webContents.executeJavaScript(MEASURE(Number(cfg.secs) || 20)), viewer ? viewer.webContents.executeJavaScript(MEASURE(Number(cfg.secs) || 20)) : null]);
    console.log('MEASURE ' + JSON.stringify({ ...r, viewer: v ? { fps: v.obraFps.med, rafFps: v.fps, worst: v.worst, size: v.size } : null, errors }));
    app.exit(errors.length ? 1 : 0);
  } catch (e) {
    console.log('MEASURE ' + JSON.stringify({ error: String(e.message || e), errors }));
    app.exit(2);
  }
});
app.on('window-all-closed', () => {});
