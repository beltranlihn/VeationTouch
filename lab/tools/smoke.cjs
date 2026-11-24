// VEATION Touch lab — smoke check. Opens a URL in a HIDDEN Electron window (nothing shows on the desktop), lets it run, optionally
// runs a script in the page, saves a screenshot, prints one JSON line and exits. Hard limit 15 s (cfg.max ms raises it: shot.mjs).
//
//   (run it through lab/tools/check.mjs or lab/tools/shot.mjs, which set LAB_SMOKE = {"url", "shot", "delay", "size", "eval",
//    "evalFile", and optionally "max", "rows", "crop", "width", "stats"})
//   max    ms before giving up (default 15000)
//   rows   show the room in two rows (P4 · P1 above, P2 · P3 below) before the capture, as review.html does (canvas → 2 <video>)
//   crop   capture only the strip (the canvas's content box), not the black bands around it
//   width  resize the capture to this width (e.g. 1600 for the album)
//   stats  add { luma, p99, burnt } of the capture: mean / 99th percentile of Rec.709 luma of the 8-bit image (0–1) and the share
//          of burnt pixels (any channel ≥ 250), over the strip only
//
// Prints:  SMOKE {"url":…, "title":…, "errors":[…], "result":…, "stats":…}     (exit code 0; 1 when the page logged errors)
// The lab server must be running for http://localhost URLs (node lab/harness/serve.mjs).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// The options come in ONE environment variable (LAB_SMOKE, JSON): Electron treats extra command-line switches as its own and can quit
// on them (exit 127), so nothing but the script path is on the command line.
const cfg = JSON.parse(process.env.LAB_SMOKE || '{}');
const URL_ = cfg.url;
const ROWS = !!cfg.rows;
const [W, H] = String(cfg.size || (ROWS ? '1920x976' : '1600x400')).split('x').map(Number);
const WAIT = Number(cfg.delay ?? 2500);
const MAX = Math.max(5000, Number(cfg.max) || 15000);
const SHOT = cfg.shot || null;
const SCRIPT = cfg.evalFile ? fs.readFileSync(cfg.evalFile, 'utf8') : cfg.eval || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the result line, then quit once it is flushed (app.exit right after console.log can lose the line on a Windows pipe)
const say = (o, code) => { process.stdout.write('SMOKE ' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n', () => app.exit(code)); setTimeout(() => app.exit(code), 1500).unref(); };

app.setPath('userData', path.join(os.tmpdir(), `vt-lab-smoke-${process.pid}`));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
setTimeout(() => say({ error: `timeout (${Math.round(MAX / 1000)} s)` }, 2), MAX).unref();

// In the page: the room in two rows (the canvas into two <video>s via captureStream), filling the window's width.
const TWO_ROWS = `(() => {
  const c = document.querySelector('canvas:not([data-lk])'); if (!c) return null;
  const Wc = c.width, Hc = c.height, split = Wc * 3604 / 7196, k = innerWidth / split, rh = Math.round(Hc * k);
  const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', inset: '0', background: '#000', zIndex: 99999 });
  const st = c.captureStream(60);
  for (let r = 0; r < 2; r++) {
    const row = document.createElement('div'); Object.assign(row.style, { position: 'absolute', left: '0', top: (r * (rh + 4)) + 'px', width: '100%', height: rh + 'px', overflow: 'hidden' });
    const v = document.createElement('video'); v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = st;
    Object.assign(v.style, { position: 'absolute', top: '0', left: (r ? -split * k : 0) + 'px', width: (Wc * k) + 'px', height: rh + 'px' });
    row.appendChild(v); box.appendChild(row); v.play().catch(() => {});
  }
  document.body.appendChild(box);
  return { x: 0, y: 0, width: innerWidth, height: 2 * rh + 4 };
})()`;
// In the page: where the strip is (the canvas's content box with object-fit: contain), in CSS px.
const STRIP_RECT = `(() => {
  const c = document.querySelector('canvas:not([data-lk])'); if (!c) return null;
  const b = c.getBoundingClientRect(), a = c.width / c.height, ba = b.width / b.height;
  let r; if (ba > a) { const w = b.height * a; r = { x: b.left + (b.width - w) / 2, y: b.top, width: w, height: b.height }; } else { const h = b.width / a; r = { x: b.left, y: b.top + (b.height - h) / 2, width: b.width, height: h }; }
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
})()`;

function imageStats(img) {
  const { width, height } = img.getSize(), px = img.toBitmap();                  // BGRA
  const hist = new Uint32Array(256); let sum = 0, burnt = 0; const n = width * height;
  for (let i = 0; i < px.length; i += 4) {
    const b = px[i], g = px[i + 1], r = px[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; sum += y; hist[Math.min(255, Math.round(y))]++;
    if (r >= 250 || g >= 250 || b >= 250) burnt++;
  }
  let acc = 0, p99 = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.99) { p99 = v; break; } }
  return { luma: +(sum / n / 255).toFixed(3), p99: +(p99 / 255).toFixed(3), burnt: +((burnt / n) * 100).toFixed(2), px: [width, height] };
}

app.whenReady().then(async () => {
  if (!URL_) return say({ error: 'no url' }, 2);
  const errors = [];
  // offscreen: it paints while hidden (a plain hidden window gets no frames)
  const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: true, partition: `vt-lab-${process.pid}` } });
  // checks are silent: nobody listens to a hidden window, and it would play through the computer's speakers. The page's audio
  // graph still runs (meters, analysers); only the output is muted. LAB_AUDIBLE=1 lets it sound.
  if (process.env.LAB_AUDIBLE !== '1') win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', (e, level, message) => {
    const lv = e?.level ?? level, msg = e?.message ?? message;
    if (lv === 'error' || lv === 3) errors.push(String(msg).slice(0, 300));
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('render process gone: ' + d.reason));
  try {
    await win.loadURL(URL_);
    await sleep(WAIT);
    let result = null, stats = null;
    if (SCRIPT) result = await win.webContents.executeJavaScript(`(async () => { ${SCRIPT}\n})()`);
    let rect = null;
    if (SHOT || cfg.stats) {
      if (ROWS) { rect = await win.webContents.executeJavaScript(TWO_ROWS); await sleep(700); }
      else if (cfg.crop || cfg.stats) rect = await win.webContents.executeJavaScript(STRIP_RECT);
    }
    await sleep(200);
    if (SHOT || cfg.stats) {
      let img = await win.webContents.capturePage(rect && rect.width > 0 && rect.height > 0 ? rect : undefined);
      if (cfg.stats) stats = imageStats(img);
      if (cfg.width && img.getSize().width !== Number(cfg.width)) img = img.resize({ width: Number(cfg.width), quality: 'best' });
      if (SHOT) fs.writeFileSync(SHOT, img.toPNG());
    }
    say({ url: win.webContents.getURL(), title: win.getTitle(), errors, result, ...(stats ? { stats } : {}) }, errors.length ? 1 : 0);
  } catch (e) {
    say({ error: String(e.message || e), errors }, 2);
  }
});
app.on('window-all-closed', () => {});
