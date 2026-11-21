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
// Hands: vt.hands() (every frame) gives the hands as strokes — played back HAND_DELAY_MS late on a smooth curve through the
// tracker's real readings, a hand the tracker splits staying one stroke — and the 'touch' events (down / move / up, `id` = the
// stroke) and vt.touches() follow the same playback. See makeHands below.
// Contract: ARCHITECTURE.md › Experiences. Nothing here is specific to any one experience or room.

const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search); // (also importable from Node: tests of makeHands)
const KEY_PREVIEW_MS = 1000, REPORT_MS = 2000, PREVIEW_MAX_W = 640;
// Viewer mode (?run=1&view=1): the app's own window hosts the page in a hidden iframe to show the piece on the walls of its
// views. A second instance that is only looked at: no Spout, no preview, no report, a small render, frames posted to the parent.
// 0.5: a wall shown alone in the app (focus view, ~1000 px wide) needs about that much to look like the room's output;
// at 0.25 the logo and the liquid's edges were visibly blurred there
const VIEW_SCALE_MAX = 0.5, VIEW_FPS = 30;

/** Wait for `ms`, or until `p` settles. */
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), ms))]);

async function engineReachable() {
  if (location.protocol === 'file:' || q.get('standalone') === '1') return false;
  try { const r = await within(fetch('/api/health', { cache: 'no-store' }), 2500); return !!r?.ok; } catch { return false; }
}

/** A fake Spout bridge for tests (`?fakeOut=1`, or `?fakeOut=gpu` for the GPU path): records what the runtime would send. */
function installFakeOut(kind = 'spout') {
  const calls = { start: [], send: [], stop: 0 };
  window.__vtOutCalls = calls;
  window.vtOut = {
    kind, ok: true, error: null,
    start(name) { calls.start.push(name); return true; },
    send(u8, w, h, flipY) { calls.send.push({ bytes: u8.length, w, h, flipY }); return true; },
    stop() { calls.stop++; },
  };
}

/**
 * @param {{ sound?: boolean, id?: string }} [opt]  sound: the runtime of a SOUND piece (experiences/SOUND-API.md): no canvas, no
 *   output — the hands as {stroke, wallId, u, v, size}, answered at once. `id`: the piece (it is not in the page's address).
 * @returns {Promise<object>} the runtime handle (see the property list in ARCHITECTURE.md › Experiences)
 */
export async function connectExperience(opt = {}) {
  if (opt.sound) return connectSound(opt.id || null);
  if (q.get('fakeOut') === '1' && !window.vtOut) installFakeOut();
  if (q.get('fakeOut') === 'gpu' && !window.vtOut) installFakeOut('spout-gpu');
  const run = q.get('run') === '1';
  const id = (location.pathname.match(/\/experiences\/([^/]+)\//) || [])[1] || null;
  let engine = await engineReachable();
  for (let k = 0; !engine && run && k < 30; k++) { await new Promise((r) => setTimeout(r, 500)); engine = await engineReachable(); } // the app is still starting
  return engine ? connectEngine(id, run, run && q.get('view') === '1', run && q.get('layer') === '1') : connectStandalone(id);
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
    hands: () => [],
    loop: (fn, src) => runLoop(vt, fn, src),
    frame: (src) => frameOut(vt, src),
    ...base,
  };
  vt._out = { frames: 0, last: performance.now(), lastPreview: 0, lastReport: 0, lastBitmap: 0, pixels: null, pixelsFor: '', started: false, error: null, pageError: null, pvBusy: false };
  addEventListener('error', (e) => { vt._out.pageError = `${e.message || 'error'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`; });
  addEventListener('unhandledrejection', (e) => { vt._out.pageError = String(e.reason?.message || e.reason || 'unhandled rejection').slice(0, 200); });
  addEventListener('pagehide', () => { try { window.vtOut?.stop?.(); } catch { /* going away */ } });
  return vt;
}

/**
 * Calls fn(dt) every frame (rAF while the page is visible, a timer at vt.fps otherwise), then vt.frame(src).
 * `src`, here and in vt.frame: what the page drew with — a WebGL context, or the canvas element itself (WebGPU).
 */
function runLoop(vt, fn, gl) {
  let last = performance.now(), raf = 0, tm = 0, fb = 0, timerSteps = 0;
  const step = (fromRaf, tRaf) => {
    cancelAnimationFrame(raf); clearTimeout(tm); clearTimeout(fb);
    const now = performance.now(), every = 1000 / (vt.fps || 60);
    vt._out.frameT = fromRaf === true && Number.isFinite(tRaf) ? tRaf : now; // the instant of this frame (frameOut passes it on in layer mode)
    if (fromRaf === true) timerSteps = 0; else if (document.visibilityState === 'visible') timerSteps++; // rAF that never fires (a window nobody sees)
    if (fromRaf === true && now - last < every - 2) { schedule(); return; } // a display faster than the target rate
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now; // (vt._tick below: the hands move on and their events go out even if the page never asks for them)
    try { vt._tick?.(); fn(dt); if (gl) vt.frame(gl); } catch (e) { vt._out.pageError = String(e?.message || e).slice(0, 200); console.error(e); }
    schedule();
  };
  const schedule = () => {
    const every = 1000 / (vt.fps || 60);
    if (document.visibilityState === 'visible') {
      raf = requestAnimationFrame((t) => step(true, t));
      // a window that never paints must not freeze the piece: once rAF has proved dead the timer runs at the full rate
      fb = setTimeout(() => step(false), timerSteps >= 3 ? Math.max(1, every - 2) : Math.max(60, every * 3));
    } else tm = setTimeout(() => step(false), every);
  };
  schedule();
  return () => { cancelAnimationFrame(raf); clearTimeout(tm); clearTimeout(fb); };
}

const isGl = (src) => typeof src.drawingBufferWidth === 'number';
/** The canvas element behind a WebGL context or a WebGPU canvas. */
const canvasOf = (src) => (isGl(src) ? src.canvas : src);

/**
 * The frame of a canvas that cannot be read back directly (WebGPU) as RGBA bytes, top row first: drawn into a 2D canvas in the
 * same task as the draw. Slow at room size: it is only the CPU Spout fallback.
 */
function canvasPixels(o, canvas) {
  const w = canvas.width, h = canvas.height;
  const c = (o.rbCanvas ??= document.createElement('canvas'));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; o.rbCtx = null; }
  const g = (o.rbCtx ??= c.getContext('2d', { willReadFrequently: true }));
  g.drawImage(canvas, 0, 0);
  const data = g.getImageData(0, 0, w, h).data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** The frame is drawn: take it to the Spout sender, the preview and the report. Must run in the same task as the draw. */
function frameOut(vt, gl) {
  const o = vt._out, now = performance.now();
  o.frames++;
  if (vt.sink === 'viewer') { viewerFrame(vt, gl, now); return; }
  if (vt.sink === 'layer') {
    // a layer of the room output: its mixer copies this canvas NOW, in the task that drew it (a canvas is empty once
    // presented), and composes the frame — MEDIA-SERVER.md §4.5. `frameT`: this frame's requestAnimationFrame time.
    try { window.parent.__vtLayerFrame?.(canvasOf(gl), o.frameT ?? now); } catch (e) { o.error = `output: ${String(e?.message || e).slice(0, 160)}`; }
    return;
  }
  const out = window.vtOut;
  if (vt.sink === 'spout' && out && out.kind === 'spout-gpu') {
    // the desktop app takes the window's paints to Spout on the GPU: no pixels to read here
  } else if (vt.sink === 'spout' && out) {
    if (!out.ok) o.error = `Spout is not available (${out.error || 'unknown'})`;
    else {
      const gl2 = isGl(gl), cv = canvasOf(gl);
      const w = gl2 ? gl.drawingBufferWidth : cv.width, h = gl2 ? gl.drawingBufferHeight : cv.height;
      if (!o.started) { o.started = !!out.start(vt._senderName?.() || 'VEATION Touch Experience'); o.error = o.started ? null : 'The Spout sender could not start (DirectX 11 unavailable?)'; }
      if (o.started) {
        if (gl2) {
          const key = `${w}x${h}`;
          if (o.pixelsFor !== key) { o.pixels = new Uint8Array(w * h * 4); o.pixelsFor = key; }
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, o.pixels);
          out.send(o.pixels, w, h, true); // GL rows run bottom-up
        } else {
          out.send(canvasPixels(o, cv), w, h, false); // a 2D canvas reads top row first
        }
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
  createImageBitmap(canvasOf(gl)).then((bitmap) => {
    try { window.parent.postMessage({ type: 'vt-experience-frame', id: vt.id, bitmap }, location.origin, [bitmap]); } catch { bitmap.close(); }
  }).catch(() => {});
}

/** A small JPEG of the canvas for the Experiences tab (drawn now, encoded and posted after). */
function preview(vt, gl) {
  const o = vt._out;
  if (o.pvBusy) return;
  const src = canvasOf(gl), w = src.width || gl.drawingBufferWidth, h = src.height || gl.drawingBufferHeight;
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

// ---------------------------------------------------------------------------------------------- hands
// The sensors read a hand ~10 times a second, and the tracker may open a new id for the same hand when a revolution is
// missed. A page that drew the raw readings (or extrapolated them) would jerk at the sensor's rhythm and treat every new id as
// a landing. So the runtime plays the hands BACK, a little late, on a smooth curve through the REAL readings:
//   - HAND_DELAY_MS: a hand is drawn this far behind its newest reading, so the next reading is (nearly always) already
//     here when it is needed — the curve is interpolated, never extrapolated;
//   - a new tracker id that appears where a hand just ended is the same STROKE (a stable id the page keys on).
export const HAND_DELAY_MS = 150;   // ~1 sensor revolution (100 ms, up to 120) + the 30 Hz batching of the live feed (≤ 33 ms): the next reading is in by then
export const STITCH_MS = 300;       // a hand that reappears within this much (readings' time)…
export const STITCH_M = 0.3;        // …and this far (metres on the wall) of where one ended is the same stroke
const STITCH_GRACE_MS = 60;         // a stroke ends this long after the stitch window, so that a reading in the window has arrived
const MIN_STALE_MS = 40;            // an id still alive (coasting) is only taken over by a new one if its last reading is this much older
const HOLD_MS = 20;                 // the playback slows down over this much before the newest reading: it holds there, smoothly
const CATCHUP_MS = 500, RATE_MIN = 0.5, RATE_MAX = 1.4; // playback speed steers back to the delay: 1 + lag / CATCHUP_MS
const RESYNC_MS = 600;              // behind by more than this (a stalled page): jump instead of racing
const MOVE_EPS = 0.05;              // px: under this a hand has not moved

/**
 * Hands = strokes played back from the tracker's readings.
 * - ingest(seen, t): the tracker's touches at engine time t (ms). seen: [{ id, wallId, x, y, size, t, pxPerM }] — the REAL
 *   reading of each (render px) and the engine time `t` it was taken; pxPerM sizes the stitch distance.
 * - tick(): moves the playback to now, emits the down / move / up events of the strokes.
 * - hands() / touches(): the strokes as they are drawn now.
 * `direct`: pointer devices (standalone) — no delay, no stitching: the hand is where the pointer is.
 */
export function makeHands(vt, opt = {}) {
  // sound: the hands of a sound piece (SOUND-API.md): no playback delay and no curve — the newest real reading is where the
  // hand is, a `down` the moment it lands — but the same stitching; events and hands() carry {stroke, wallId, u, v, size}
  const sound = !!opt.sound, hold = sound;
  const direct = !!opt.direct, delay = direct || sound ? 0 : (opt.delay ?? HAND_DELAY_MS);
  const clock = opt.now || (() => performance.now());
  const strokes = [];            // in order of appearance
  const byTracker = new Map();   // tracker id → stroke
  let nextId = 1, off = direct ? 0 : null, lastNow = null;

  const width = () => vt.size.width;
  const wraps = () => !!vt.closedLoop && width() > 0;
  /** The short way round a closed room: a difference of x in (−W/2, W/2]. */
  const near = (d) => (wraps() ? d - Math.round(d / width()) * width() : d);
  const wrapX = (x) => (wraps() ? x - Math.floor(x / width()) * width() : x);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function push(S, r) {
    const last = S.pts[S.pts.length - 1];
    if (last && !(r.t > last.t)) {
      if (!direct) return false;
      last.x = r.x; last.y = r.y; last.size = r.size; last.wallId = r.wallId; last.u = r.u; last.v = r.v; // pointers: two events in one ms, the later one wins
      return true;
    }
    if (direct && last) { // the speed between the two readings, lightly smoothed
      const dts = (r.t - last.t) / 1000;
      S.dvx = 0.4 * S.dvx + 0.6 * (near(r.x - last.x) / dts); S.dvy = 0.4 * S.dvy + 0.6 * ((r.y - last.y) / dts); S.fresh = true;
    }
    S.pts.push({ t: r.t, x: last ? last.x + near(r.x - last.x) : r.x, y: r.y, wallId: r.wallId, size: r.size, u: r.u, v: r.v });
    return true;
  }

  /** The stroke a new tracker id continues, if it does: one that just ended (or an id gone stale) within STITCH_MS and STITCH_M. */
  function candidate(r) {
    let best = null, bestD = Infinity;
    for (const S of strokes) {
      const last = S.pts[S.pts.length - 1], gap = r.t - last.t;
      if (gap > STITCH_MS || gap < (S.trackers.size ? MIN_STALE_MS : -30)) continue;
      const d = Math.hypot(near(r.x - last.x), r.y - last.y), lim = STITCH_M * (r.pxPerM || 0);
      if (d <= lim && d < bestD) { best = S; bestD = d; }
    }
    return best;
  }

  function ingest(seen, tEng) {
    const pageNow = clock();
    if (!direct) {
      const sample = pageNow - tEng;
      if (off == null || Math.abs(sample - off) > 5000) off = sample; // the first message (or another engine clock)
      else { const d = sample - off; off += d < 0 ? Math.max(d, -3) : Math.min(d * 0.02, 0.5); } // follows the quickest messages, drifts up slowly
    }
    const here = new Set();
    for (const s of seen) here.add(s.id);
    for (const S of strokes) for (const id of [...S.trackers]) if (!here.has(id)) { S.trackers.delete(id); byTracker.delete(id); }
    for (const s of seen) {
      let S = byTracker.get(s.id);
      if (!S && !direct) { S = candidate(s); if (S) { S.trackers.add(s.id); byTracker.set(s.id, S); S.stitched++; } }
      if (!S) {
        S = { id: direct ? s.id : nextId++, pts: [], trackers: new Set([s.id]), started: false, tr: 0, rate: 1, stitched: 0, dvx: 0, dvy: 0, fresh: false, wallId: s.wallId, x: s.x, y: s.y, vx: 0, vy: 0, size: s.size, ex: 0, ey: 0, ewall: null };
        strokes.push(S); byTracker.set(s.id, S);
      }
      push(S, s);
      S.size = s.size;
    }
    tick();
  }

  /** The curve at engine time `tr`: cubic Hermite through the readings, tangents from the neighbours (C1). x, y in px, v in px / ms. */
  function pose(S, tr) {
    const P = S.pts, n = P.length, last = P[n - 1];
    if (n === 1 || tr <= P[0].t) return { x: P[0].x, y: P[0].y, vx: 0, vy: 0, size: P[0].size, wallId: P[0].wallId, u: P[0].u, v: P[0].v };
    if (tr >= last.t) return { x: last.x, y: last.y, vx: 0, vy: 0, size: last.size, wallId: last.wallId, u: last.u, v: last.v };
    let i = 0;
    while (P[i + 1].t < tr) i++;
    const a = P[i], b = P[i + 1], h = b.t - a.t, s = (tr - a.t) / h;
    const tan = (k, axis) => {
      const lo = P[Math.max(0, k - 1)], hi = P[Math.min(n - 1, k + 1)];
      return (hi[axis] - lo[axis]) / (hi.t - lo.t);
    };
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
    const out = { size: a.size + (b.size - a.size) * s, wallId: s < 0.5 ? a.wallId : b.wallId };
    for (const axis of ['x', 'y']) {
      const m0 = tan(i, axis), m1 = tan(i + 1, axis);
      out[axis] = h00 * a[axis] + h10 * h * m0 + h01 * b[axis] + h11 * h * m1;
      out[`v${axis}`] = (d00 * a[axis] + d10 * h * m0 + d01 * b[axis] + d11 * h * m1) / h;
    }
    return out;
  }

  function emit(type, S) {
    if (sound) { vt.emit('touch', { type, stroke: S.id, wallId: S.wallId, u: S.u, v: S.v, size: S.size }); return; }
    vt.emit('touch', { type, id: S.id, stroke: S.id, trackerId: [...S.trackers][0] ?? null, wallId: S.wallId, x: S.x, y: S.y, vx: type === 'move' ? S.vx : 0, vy: type === 'move' ? S.vy : 0, size: S.size });
  }

  function tick() {
    const pageNow = clock();
    if (off == null) return;
    const dt = lastNow == null ? 0 : clamp(pageNow - lastNow, 0, 100);
    if (lastNow == null || pageNow > lastNow) lastNow = pageNow;
    const engNow = pageNow - off, ideal = engNow - delay;
    for (const S of strokes) {
      const cap = S.pts[S.pts.length - 1].t;
      if (!S.started) {
        if (!direct && !hold && ideal < S.pts[0].t) continue; // still on its way: it is drawn from its first reading on
        S.started = true; S.tr = S.pts[0].t;
        const p0 = pose(S, S.tr);
        Object.assign(S, { x: wrapX(p0.x), y: p0.y, size: p0.size, wallId: p0.wallId, u: p0.u, v: p0.v, vx: 0, vy: 0, ex: wrapX(p0.x), ey: p0.y, ewall: p0.wallId });
        emit('down', S); // where its first reading was; the playback goes on from there
      }
      if (direct || hold) { S.tr = cap; S.rate = 1; }
      else {
        const lag = ideal - S.tr;
        if (lag > RESYNC_MS) { S.tr = Math.min(cap, ideal); S.rate = 1; }
        else {
          const rate = clamp(1 + lag / CATCHUP_MS, RATE_MIN, RATE_MAX), room = cap - S.tr;
          S.rate = rate * Math.min(1, room / HOLD_MS); // slows down towards the newest reading: it holds there, no extrapolation
          S.tr = Math.min(cap, S.tr + dt * S.rate);
        }
      }
      const p = pose(S, S.tr);
      S.x = wrapX(p.x); S.y = p.y; S.size = p.size; S.wallId = p.wallId; S.u = p.u; S.v = p.v;
      if (direct) { if (S.fresh) S.fresh = false; else { S.dvx *= 0.5; S.dvy *= 0.5; } S.vx = S.dvx; S.vy = S.dvy; }
      else { S.vx = p.vx * 1000 * S.rate; S.vy = p.vy * 1000 * S.rate; } // px / s of page time, from the curve
      if (Math.hypot(near(S.x - S.ex), S.y - S.ey) > MOVE_EPS || S.wallId !== S.ewall) { S.ex = S.x; S.ey = S.y; S.ewall = S.wallId; emit('move', S); }
      // trim the readings the playback has passed (one before the current segment stays: it gives the tangent)
      while (S.pts.length > 3 && S.pts[2].t <= S.tr) S.pts.shift();
    }
    for (let k = strokes.length - 1; k >= 0; k--) {
      const S = strokes[k];
      if (S.trackers.size) continue;
      const last = S.pts[S.pts.length - 1];
      if (!direct && engNow < last.t + STITCH_MS + STITCH_GRACE_MS) continue; // it may yet come back under another id
      if (!S.started) { strokes.splice(k, 1); continue; }
      const p = pose(S, last.t);
      S.x = wrapX(p.x); S.y = p.y; S.u = p.u; S.v = p.v; S.vx = S.vy = 0;
      if (Math.hypot(near(S.x - S.ex), S.y - S.ey) > MOVE_EPS) emit('move', S);
      emit('up', S);
      strokes.splice(k, 1);
    }
  }

  const view = (S) => sound ? ({ stroke: S.id, wallId: S.wallId, u: S.u, v: S.v, size: S.size }) : ({ id: S.id, stroke: S.id, trackerId: [...S.trackers][0] ?? null, wallId: S.wallId, x: S.x, y: S.y, vx: S.vx, vy: S.vy, size: S.size, ended: S.trackers.size === 0 });
  return {
    ingest, tick,
    hands: () => { tick(); return strokes.filter((S) => S.started).map(view); },
    touches: () => { tick(); return strokes.filter((S) => S.started).map((S) => ({ id: S.id, stroke: S.id, wallId: S.wallId, x: S.x, y: S.y, size: S.size })); },
    /** Engine time → page time offset (test and debugging). */
    get offset() { return off; },
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

// layer (?run=1&layer=1): this page is one layer of the room output (ui/output.html composes it with the others in an iframe)
async function connectEngine(id, run, viewer = false, layer = false) {
  const conn = await import('/js/conn.js');
  const geo = await import('/shared/geometry.js');
  const { store, on, connect, cmd } = conn;
  connect();
  if (!store.state) await new Promise((res) => { const off = on('state', () => { off(); res(); }); });

  const vt = makeHandle({});
  vt.id = id;
  const hands = makeHands(vt);
  const wallOf = (wallId) => store.state.profile.walls.find((w) => w.id === wallId);

  const scaleOf = (x) => (viewer ? Math.min(x.scale, VIEW_SCALE_MAX) : x.scale); // a viewer stays cheap next to the real instance
  const sizeOf = (P, x) => ({ width: Math.max(1, Math.round(P.canvas.width * scaleOf(x))), height: Math.max(1, Math.round(P.canvas.height * scaleOf(x))) });
  let P = store.state.profile, X = P.output; // where it goes (scale, rate, destination) is the room output's: the experience only has its parameters
  vt.canvas = { ...P.canvas }; vt.scale = scaleOf(X); vt.size = sizeOf(P, X);

  const manifestParams = () => (store.state.experiences || []).find((e) => e.id === id)?.params || [];
  const paramValues = () => {
    const mine = store.state.profile.experience.params?.[id] || {};
    return Object.fromEntries(manifestParams().map((p) => [p.key, p.key in mine ? mine[p.key] : p.default]));
  };

  const refresh = () => {
    P = store.state.profile; X = P.output;
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
    // a layer of the room output: no Spout, no bridge (the output window sends the composed image), the canvas 1:1 in the layer's
    // render-size frame, and no preview of its own (the output's preview is taken by the desktop app, of the whole image)
    if (layer) { vt.sink = 'layer'; vt._out.lastPreview = Infinity; pinCanvas(vt); return; }
    const spout = X.sink === 'spout' && window.vtOut;
    vt.sink = spout ? 'spout' : X.sink === 'window' ? 'window' : 'browser';
    if (vt.sink !== 'spout') fillWindow(vt);
    else if (window.vtOut.kind === 'spout-gpu') pinCanvas(vt);
  };
  vt._senderName = () => X.senderName;

  vt.toPx = (wallId, xm, ym) => {
    const w = wallOf(wallId);
    if (!w) return [0, 0];
    const [x, y] = geo.wallUvToCanvas(w, xm / w.width, 1 - ym / w.height);
    return [x * vt.scale, y * vt.scale];
  };
  vt.touches = hands.touches; vt.hands = hands.hands; vt._tick = hands.tick;

  // A touch in the live feed: [id, x, y, size, coasting, rx, ry, seenAt] — x, y are the tracker's (extrapolated up to 60 ms),
  // rx, ry the filtered position at its last REAL reading and seenAt the engine time (ms, the clock of L.t) of that reading.
  // The hands are played back from the real readings; an engine without the last three gives every message as a reading.
  const onLive = (L) => {
    const seen = [];
    for (const [wallId, list] of Object.entries(L.walls || {})) {
      const w = wallOf(wallId);
      if (!w) continue;
      const pxPerM = (w.pixelRect.w * vt.scale) / w.width;
      for (const t of list) {
        const real = t.length >= 8 && Number.isFinite(t[5]) && Number.isFinite(t[6]) && Number.isFinite(t[7]);
        const [x, y] = vt.toPx(wallId, real ? t[5] : t[1], real ? t[6] : t[2]);
        seen.push({ id: t[0], wallId, x, y, size: t[3] * pxPerM, t: real ? t[7] : L.t, pxPerM });
      }
    }
    hands.ingest(seen, L.t);
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
  // ...and once as soon as the first frames are out, so the card in Live turns LIVE at once instead of after up to 2 s
  if (!viewer) {
    const t0 = performance.now();
    const first = () => {
      if (o.frames > 0) cmd('experience.report', { fps: Math.round((o.frames * 10000) / Math.max(1, performance.now() - t0)) / 10, error: o.pageError || o.error || null }).catch(() => {});
      else if (performance.now() - t0 < REPORT_MS) setTimeout(first, 50);
    };
    setTimeout(first, 50);
  }
  window.__vtStarted?.();
  return vt;
}

/** The canvas fills the window (fit = keep its proportions, stretch = fill), on black. Only where the page IS the output. */
/**
 * Spout on the GPU: the desktop app sends this window's own paints (a shared texture, render size) to Spout, so the
 * canvas must cover it exactly, 1:1 device pixels at the top-left — nothing scaled, nothing else drawn.
 */
function pinCanvas(vt) {
  const apply = () => {
    const c = document.querySelector('canvas');
    if (!c) return;
    const de = document.documentElement.style, b = document.body.style;
    de.background = b.background = '#000'; b.margin = '0'; b.overflow = 'hidden';
    const dpr = devicePixelRatio || 1;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: `${vt.size.width / dpr}px`, height: `${vt.size.height / dpr}px`, display: 'block', objectFit: 'fill' });
  };
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply, { once: true });
}

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

// ---------------------------------------------------------------------------------------------- sound

/**
 * The runtime of a SOUND piece, in the audio window (ui/js/audio-host.js) — experiences/SOUND-API.md. No canvas, no output:
 * vt.params / vt.on('params'), vt.walls / vt.closedLoop, vt.hands() and the 'touch' events {type, stroke, wallId, u, v, size}.
 * The hands are the visual ones minus the playback: a `down` the moment a hand lands, the newest real reading as its place,
 * the same stitching of a hand the tracker splits (one stroke, an `up` once the stitch window has passed). `dispose()` lets go.
 */
async function connectSound(id) {
  const vt = makeHandle({});
  vt.id = id; vt.sink = 'sound';
  let conn = null;
  try { conn = await within(engineReachable().then((ok) => (ok ? import('/js/conn.js') : null)), 4000) || null; } catch { conn = null; }
  if (!conn) { // no engine (a piece opened on its own): defaults of its manifest, no hands
    try {
      const m = await within(fetch(new URL('manifest.json', location.href)).then((r) => r.json()), 2500);
      for (const p of m?.params || []) if (p && p.key && 'default' in p) vt.params[p.key] = p.default;
    } catch { /* no manifest: no parameters */ }
    vt.standalone = true; vt.dispose = () => {};
    return vt;
  }
  const geo = await import('/shared/geometry.js');
  const { store, on, connect } = conn;
  connect();
  if (!store.state) await new Promise((res) => { const off = on('state', () => { off(); res(); }); });
  const hands = makeHands(vt, { sound: true });
  const wallOf = (wallId) => store.state.profile.walls.find((w) => w.id === wallId);
  const paramValues = () => {
    const mine = store.state.profile.audio?.sound?.params?.[id] || {};
    const list = (store.state.sounds || []).find((e) => e.id === id)?.params || [];
    return Object.fromEntries(list.map((p) => [p.key, p.key in mine ? mine[p.key] : p.default]));
  };
  const refresh = () => {
    const P = store.state.profile;
    // hands are tracked in a canvas-pixel space (it makes a hand crossing the seam of a closed room one stroke); only u / v leave
    vt.canvas = { ...P.canvas }; vt.scale = 1; vt.size = { width: P.canvas.width, height: P.canvas.height };
    vt.walls = P.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: w.height })); // metres: a piece maps heights in metres (a hand reaches ~2.1 m, whatever the wall)
    vt.closedLoop = geo.planCloses(P.walls);
    setParams(vt, paramValues());
  };
  // A touch in the live feed: [id, x, y, size, coasting, rx, ry, seenAt] (see connectEngine): the REAL reading is the hand
  const onLive = (L) => {
    const seen = [];
    for (const [wallId, list] of Object.entries(L.walls || {})) {
      const w = wallOf(wallId);
      if (!w) continue;
      const pxPerM = w.pixelRect.w / w.width;
      for (const t of list) {
        const real = t.length >= 8 && Number.isFinite(t[5]) && Number.isFinite(t[6]) && Number.isFinite(t[7]);
        const xm = real ? t[5] : t[1], ym = real ? t[6] : t[2];
        const [x, y] = geo.wallUvToCanvas(w, xm / w.width, 1 - ym / w.height);
        seen.push({ id: t[0], wallId, x, y, size: t[3], t: real ? t[7] : L.t, pxPerM,
          u: Math.min(1, Math.max(0, xm / w.width)), v: Math.min(1, Math.max(0, ym / w.height)) });
      }
    }
    hands.ingest(seen, L.t);
  };
  const offs = [on('live', onLive), on('state', refresh)];
  refresh();
  vt.hands = hands.hands; vt._tick = hands.tick;
  const timer = setInterval(hands.tick, 25); // the `up` of a hand that left comes after the stitch window, with or without a reading
  vt.dispose = () => { clearInterval(timer); for (const off of offs) off(); };
  return vt;
}

// ---------------------------------------------------------------------------------------------- standalone

async function connectStandalone(id) {
  const dpr = devicePixelRatio || 1;
  const vt = makeHandle({ standalone: true });
  vt.id = id;
  const hands = makeHands(vt, { direct: true }); // a pointer is where it is: no delay, no stitching
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
  vt.touches = hands.touches; vt.hands = hands.hands; vt._tick = hands.tick;
  addEventListener('resize', () => { fit(); vt.emit('resize', vt.size); });

  const down = new Set();
  const at = (e) => ({ id: e.pointerId, wallId: WALL, x: e.clientX * dpr, y: e.clientY * dpr, size: 24 * dpr, t: e.timeStamp, pxPerM: PX_PER_M });
  const current = (e) => [...down].map((pid) => (pid === e.pointerId ? at(e) : { ...(hands.touches().find((t) => t.id === pid) || { id: pid, wallId: WALL, x: 0, y: 0, size: 24 * dpr }), t: e.timeStamp, pxPerM: PX_PER_M }));
  addEventListener('pointerdown', (e) => { down.add(e.pointerId); hands.ingest(current(e), e.timeStamp); });
  addEventListener('pointermove', (e) => { if (down.has(e.pointerId)) hands.ingest(current(e), e.timeStamp); });
  const up = (e) => { if (!down.delete(e.pointerId)) return; hands.ingest(current(e), e.timeStamp); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return vt;
}
