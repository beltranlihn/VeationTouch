// VEATION Touch — experience runtime. The one thing an experience page imports to talk to the app:
//
//   import { connectExperience } from '/experiences/runtime.js';
//   const vt = await connectExperience();
//
// It gives the page the room (canvas, walls, where each wall lands in the render), the live touches mapped to render
// pixels, the parameters the operator sets in the Experiences tab, a frame loop, and — through vt.frame(gl) — takes
// every frame to its destination: Spout (the desktop app's hidden window bridges to the native sender as window.vtOut),
// the full-screen window (the canvas is shown as it is), a preview for the app, and a report of fps and errors.
// Opened as a file, or without an engine, the same page runs standalone (pointer touches, default parameters).
// Contract: ARCHITECTURE.md › Experiences. Nothing here is specific to any one experience or room.

const q = new URLSearchParams(location.search);
const KEY_PREVIEW_MS = 1000, REPORT_MS = 2000, PREVIEW_MAX_W = 640;
// Viewer mode (?run=1&view=1): the app's own window hosts the page in a hidden iframe to show the piece on the walls of its
// views. A second instance that is only looked at: no Spout, no preview, no report, a small render, frames posted to the parent.
const VIEW_SCALE_MAX = 0.25, VIEW_FPS = 30;

/** Wait for `ms`, or until `p` settles. */
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), ms))]);

async function engineReachable() {
  if (location.protocol === 'file:' || q.get('standalone') === '1') return false;
  try { const r = await within(fetch('/api/health', { cache: 'no-store' }), 2500); return !!r?.ok; } catch { return false; }
}

/** A fake Spout bridge for tests (`?fakeOut=1`): records what the runtime would send. */
function installFakeOut() {
  const calls = { start: [], send: [], stop: 0 };
  window.__vtOutCalls = calls;
  window.vtOut = {
    kind: 'spout', ok: true, error: null,
    start(name) { calls.start.push(name); return true; },
    send(u8, w, h, flipY) { calls.send.push({ bytes: u8.length, w, h, flipY }); return true; },
    stop() { calls.stop++; },
  };
}

/** @returns {Promise<object>} the runtime handle (see the property list in ARCHITECTURE.md › Experiences) */
export async function connectExperience() {
  if (q.get('fakeOut') === '1' && !window.vtOut) installFakeOut();
  const run = q.get('run') === '1';
  const id = (location.pathname.match(/\/experiences\/([^/]+)\//) || [])[1] || null;
  let engine = await engineReachable();
  for (let k = 0; !engine && run && k < 30; k++) { await new Promise((r) => setTimeout(r, 500)); engine = await engineReachable(); } // the app is still starting
  return engine ? connectEngine(id, run, run && q.get('view') === '1') : connectStandalone(id);
}

// ---------------------------------------------------------------------------------------------- shared part

function makeHandle(base) {
  const listeners = { params: new Set(), touch: new Set(), resize: new Set() };
  const vt = {
    canvas: { width: 0, height: 0 }, scale: 1, size: { width: 0, height: 0 }, walls: [], closedLoop: false,
    params: {}, sink: 'browser', fit: 'fit', fps: 60, standalone: false, id: null,
    on(type, fn) { (listeners[type] ??= new Set()).add(fn); return () => listeners[type].delete(fn); },
    emit(type, e) { for (const fn of listeners[type] || []) { try { fn(e); } catch (err) { console.error(err); } } },
    toPx: () => [0, 0],
    touches: () => [],
    loop: (fn, gl) => runLoop(vt, fn, gl),
    frame: (gl) => frameOut(vt, gl),
    ...base,
  };
  vt._out = { frames: 0, last: performance.now(), lastPreview: 0, lastReport: 0, lastBitmap: 0, pixels: null, pixelsFor: '', started: false, error: null, pageError: null, pvBusy: false };
  addEventListener('error', (e) => { vt._out.pageError = `${e.message || 'error'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`; });
  addEventListener('unhandledrejection', (e) => { vt._out.pageError = String(e.reason?.message || e.reason || 'unhandled rejection').slice(0, 200); });
  addEventListener('pagehide', () => { try { window.vtOut?.stop?.(); } catch { /* going away */ } });
  return vt;
}

/** Calls fn(dt) every frame (rAF while the page is visible, a timer at vt.fps otherwise), then vt.frame(gl). */
function runLoop(vt, fn, gl) {
  let last = performance.now(), raf = 0, tm = 0, fb = 0, timerSteps = 0;
  const step = (fromRaf) => {
    cancelAnimationFrame(raf); clearTimeout(tm); clearTimeout(fb);
    const now = performance.now(), every = 1000 / (vt.fps || 60);
    if (fromRaf === true) timerSteps = 0; else if (document.visibilityState === 'visible') timerSteps++; // rAF that never fires (a window nobody sees)
    if (fromRaf === true && now - last < every - 2) { schedule(); return; } // a display faster than the target rate
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try { fn(dt); if (gl) vt.frame(gl); } catch (e) { vt._out.pageError = String(e?.message || e).slice(0, 200); console.error(e); }
    schedule();
  };
  const schedule = () => {
    const every = 1000 / (vt.fps || 60);
    if (document.visibilityState === 'visible') {
      raf = requestAnimationFrame(() => step(true));
      // a window that never paints must not freeze the piece: once rAF has proved dead the timer runs at the full rate
      fb = setTimeout(() => step(false), timerSteps >= 3 ? Math.max(1, every - 2) : Math.max(60, every * 3));
    } else tm = setTimeout(() => step(false), every);
  };
  schedule();
  return () => { cancelAnimationFrame(raf); clearTimeout(tm); clearTimeout(fb); };
}

/** The frame is drawn: take it to the Spout sender, the preview and the report. Must run in the same task as the draw. */
function frameOut(vt, gl) {
  const o = vt._out, now = performance.now();
  o.frames++;
  if (vt.sink === 'viewer') { viewerFrame(vt, gl, now); return; }
  const out = window.vtOut;
  if (vt.sink === 'spout' && out) {
    if (!out.ok) o.error = `Spout is not available (${out.error || 'unknown'})`;
    else {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!o.started) { o.started = !!out.start(vt._senderName?.() || 'VEATION Touch Experience'); o.error = o.started ? null : 'The Spout sender could not start (DirectX 11 unavailable?)'; }
      if (o.started) {
        const key = `${w}x${h}`;
        if (o.pixelsFor !== key) { o.pixels = new Uint8Array(w * h * 4); o.pixelsFor = key; }
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, o.pixels);
        out.send(o.pixels, w, h, true); // GL rows run bottom-up
      }
    }
  }
  if (!vt.standalone && now - o.lastPreview >= KEY_PREVIEW_MS) { o.lastPreview = now; preview(vt, gl); }
}

/** Viewer mode: the frame as an ImageBitmap for the app's views (taken in the draw's task: the canvas is cleared after). */
function viewerFrame(vt, gl, now) {
  const o = vt._out;
  if (window.parent === window || now - o.lastBitmap < 1000 / VIEW_FPS - 2) return;
  o.lastBitmap = now;
  createImageBitmap(gl.canvas).then((bitmap) => {
    try { window.parent.postMessage({ type: 'vt-experience-frame', id: vt.id, bitmap }, location.origin, [bitmap]); } catch { bitmap.close(); }
  }).catch(() => {});
}

/** A small JPEG of the canvas for the Experiences tab (drawn now, encoded and posted after). */
function preview(vt, gl) {
  const o = vt._out;
  if (o.pvBusy) return;
  const src = gl.canvas, w = src.width || gl.drawingBufferWidth, h = src.height || gl.drawingBufferHeight;
  if (!w || !h) return;
  const c = (o.pvCanvas ??= document.createElement('canvas'));
  c.width = Math.min(PREVIEW_MAX_W, w); c.height = Math.max(1, Math.round(h * c.width / w));
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0, c.width, c.height);
  o.pvBusy = true;
  c.toBlob((blob) => {
    if (!blob) { o.pvBusy = false; return; }
    fetch('/api/experience/preview', { method: 'POST', body: blob }).catch(() => {}).finally(() => { o.pvBusy = false; });
  }, 'image/jpeg', 0.6);
}

/** Touch bookkeeping shared by both modes: ids seen → down / move / up events with a smoothed velocity in px/s. */
function makeTracker(vt) {
  const live = new Map(); // id → { wallId, x, y, vx, vy, size, t }
  return {
    list: () => [...live.entries()].map(([id, p]) => ({ id, wallId: p.wallId, x: p.x, y: p.y, size: p.size })),
    /** `seen`: [{ id, wallId, x, y, size }] in render px, at time `t` (ms). */
    update(seen, t) {
      const now = new Set();
      for (const s of seen) {
        now.add(s.id);
        const p = live.get(s.id);
        if (!p) {
          live.set(s.id, { wallId: s.wallId, x: s.x, y: s.y, vx: 0, vy: 0, size: s.size, t });
          vt.emit('touch', { type: 'down', id: s.id, wallId: s.wallId, x: s.x, y: s.y, vx: 0, vy: 0, size: s.size });
          continue;
        }
        const dt = t - p.t;
        // a room that closes the loop: a hand going from the last wall to the first (one corner in the room) jumps
        // from one end of the strip to the other — the motion is the short way round, not across the whole strip
        let dx = s.x - p.x;
        const Wr = vt.size.width;
        if (vt.closedLoop && Wr > 0) { if (dx > Wr / 2) dx -= Wr; else if (dx < -Wr / 2) dx += Wr; }
        const moved = Math.hypot(dx, s.y - p.y) > 0.05 || s.wallId !== p.wallId;
        if (dt > 0 && moved) {
          p.vx = 0.4 * p.vx + 0.6 * (dx / dt) * 1000; p.vy = 0.4 * p.vy + 0.6 * ((s.y - p.y) / dt) * 1000;
        } else if (dt > 0) { p.vx *= 0.5; p.vy *= 0.5; }
        Object.assign(p, { wallId: s.wallId, x: s.x, y: s.y, size: s.size, t: dt > 0 ? t : p.t });
        if (moved) vt.emit('touch', { type: 'move', id: s.id, wallId: p.wallId, x: p.x, y: p.y, vx: p.vx, vy: p.vy, size: p.size });
      }
      for (const [id, p] of [...live]) {
        if (now.has(id)) continue;
        live.delete(id);
        vt.emit('touch', { type: 'up', id, wallId: p.wallId, x: p.x, y: p.y, vx: 0, vy: 0, size: p.size });
      }
    },
  };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function setParams(vt, next) {
  if (sameJson(vt.params, next)) return;
  for (const k of Object.keys(vt.params)) delete vt.params[k];
  Object.assign(vt.params, next);
  vt.emit('params', vt.params);
}

// ---------------------------------------------------------------------------------------------- with the engine

async function connectEngine(id, run, viewer = false) {
  const conn = await import('/js/conn.js');
  const geo = await import('/shared/geometry.js');
  const { store, on, connect, cmd } = conn;
  connect();
  if (!store.state) await new Promise((res) => { const off = on('state', () => { off(); res(); }); });

  const vt = makeHandle({});
  vt.id = id;
  const tracker = makeTracker(vt);
  const wallOf = (wallId) => store.state.profile.walls.find((w) => w.id === wallId);

  const scaleOf = (x) => (viewer ? Math.min(x.scale, VIEW_SCALE_MAX) : x.scale); // a viewer stays cheap next to the real instance
  const sizeOf = (P, x) => ({ width: Math.max(1, Math.round(P.canvas.width * scaleOf(x))), height: Math.max(1, Math.round(P.canvas.height * scaleOf(x))) });
  let P = store.state.profile, X = P.experience;
  vt.canvas = { ...P.canvas }; vt.scale = scaleOf(X); vt.size = sizeOf(P, X);

  const manifestParams = () => (store.state.experiences || []).find((e) => e.id === id)?.params || [];
  const paramValues = () => {
    const mine = store.state.profile.experience.params?.[id] || {};
    return Object.fromEntries(manifestParams().map((p) => [p.key, p.key in mine ? mine[p.key] : p.default]));
  };

  const refresh = () => {
    P = store.state.profile; X = P.experience;
    const s = vt.scale;
    vt.walls = P.walls.map((w) => ({ id: w.id, name: w.name, rect: { x: Math.round(w.pixelRect.x * s), y: Math.round(w.pixelRect.y * s), w: Math.round(w.pixelRect.w * s), h: Math.round(w.pixelRect.h * s) } }));
    vt.closedLoop = geo.planCloses(P.walls);
    vt.fit = X.fit; vt.fps = viewer ? Math.min(X.fps, VIEW_FPS) : X.fps;
    vt._sink();
    setParams(vt, paramValues());
    // the render size is fixed for a page's life: a new canvas or scale means a fresh page
    const want = sizeOf(P, X);
    if (run && (want.width !== vt.size.width || want.height !== vt.size.height)) location.reload();
  };

  // where a page is drawn: Spout needs the desktop app's bridge; otherwise the canvas is shown (window / browser)
  vt._sink = () => {
    if (viewer) { vt.sink = 'viewer'; return; } // never Spout, never the full-screen styling: the app's views show the frames
    const spout = X.sink === 'spout' && window.vtOut;
    vt.sink = spout ? 'spout' : X.sink === 'window' ? 'window' : 'browser';
    if (vt.sink !== 'spout') fillWindow(vt);
  };
  vt._senderName = () => X.senderName;

  vt.toPx = (wallId, xm, ym) => {
    const w = wallOf(wallId);
    if (!w) return [0, 0];
    const [x, y] = geo.wallUvToCanvas(w, xm / w.width, 1 - ym / w.height);
    return [x * vt.scale, y * vt.scale];
  };
  vt.touches = tracker.list;

  const onLive = (L) => {
    const seen = [];
    for (const [wallId, list] of Object.entries(L.walls || {})) {
      const w = wallOf(wallId);
      if (!w) continue;
      const pxPerM = (w.pixelRect.w * vt.scale) / w.width;
      for (const t of list) { const [x, y] = vt.toPx(wallId, t[1], t[2]); seen.push({ id: t[0], wallId, x, y, size: t[3] * pxPerM }); }
    }
    tracker.update(seen, L.t);
  };
  on('live', onLive);
  on('state', refresh);
  refresh();

  // every 2 s: how the page is doing (a viewer is not the running instance: it reports nothing)
  const o = vt._out;
  if (!viewer) setInterval(() => {
    const now = performance.now(), fps = (o.frames * 1000) / Math.max(1, now - o.lastReport);
    o.frames = 0; o.lastReport = now;
    cmd('experience.report', { fps: Math.round(fps * 10) / 10, error: o.pageError || o.error || null }).catch(() => {});
  }, REPORT_MS);
  o.lastReport = performance.now();
  window.__vtStarted?.();
  return vt;
}

/** The canvas fills the window (fit = keep its proportions, stretch = fill), on black. Only where the page IS the output. */
function fillWindow(vt) {
  if (vt.standalone) return;
  const apply = () => {
    const c = document.querySelector('canvas');
    if (!c) return;
    const de = document.documentElement.style, b = document.body.style;
    de.background = b.background = '#000'; b.margin = '0'; b.overflow = 'hidden'; b.cursor = 'none';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', display: 'block', objectFit: vt.fit === 'stretch' ? 'fill' : 'contain' });
  };
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply, { once: true });
}

// ---------------------------------------------------------------------------------------------- standalone

async function connectStandalone(id) {
  const dpr = devicePixelRatio || 1;
  const vt = makeHandle({ standalone: true });
  vt.id = id;
  const tracker = makeTracker(vt);
  const WALL = 'W1', PX_PER_M = 500; // one wall covering the whole canvas, 500 px per metre
  const fit = () => {
    const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    vt.canvas = { width: w, height: h }; vt.scale = 1; vt.size = { width: w, height: h };
    vt.walls = [{ id: WALL, name: 'Wall', rect: { x: 0, y: 0, w, h } }];
  };
  fit();
  vt.fps = 60; vt.fit = 'fit'; vt.sink = 'browser'; vt.closedLoop = false;
  // the defaults of the manifest sitting next to the page
  try {
    const m = await within(fetch(new URL('manifest.json', location.href)).then((r) => r.json()), 2500);
    for (const p of m?.params || []) if (p && p.key && 'default' in p) vt.params[p.key] = p.default;
  } catch { /* no manifest: no parameters */ }
  vt.toPx = (_wallId, xm, ym) => [xm * PX_PER_M, vt.canvas.height - ym * PX_PER_M];
  vt.touches = tracker.list;
  addEventListener('resize', () => { fit(); vt.emit('resize', vt.size); });

  const down = new Set();
  const at = (e) => ({ id: e.pointerId, wallId: WALL, x: e.clientX * dpr, y: e.clientY * dpr, size: 24 * dpr });
  const current = (e) => [...down].map((pid) => (pid === e.pointerId ? at(e) : { ...(tracker.list().find((t) => t.id === pid) || { id: pid, wallId: WALL, x: 0, y: 0, size: 24 * dpr }) }));
  addEventListener('pointerdown', (e) => { down.add(e.pointerId); tracker.update(current(e), e.timeStamp); });
  addEventListener('pointermove', (e) => { if (down.has(e.pointerId)) tracker.update(current(e), e.timeStamp); });
  const up = (e) => { if (!down.delete(e.pointerId)) return; tracker.update(current(e), e.timeStamp); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return vt;
}
