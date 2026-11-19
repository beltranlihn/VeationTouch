// The room output (/output): ONE image made of stacked layers, on black. The desktop app opens this page in an
// off-screen window of the render size (canvas × the output's scale) and sends what Chromium paints — 1:1 — to the
// single Spout sender (app/main.js); the same page can fill a display instead (sink "window") or open in a browser.
//
// Layers (engine: profile.output.layers, bottom → top; state.output.layersEffective is what to draw right now):
//   experience — an <iframe> of the experience page in layer mode (?run=1&layer=1): the piece, at the render size
//   touches    — the black-and-white mask of the touches, drawn by the engine's own rasteriser (/shared/mask.js, the
//                same code as the Texture output) at the layer's scale and stretched to the render size
//   grid       — the pixel map (wall outlines, metre grid, wall ids) and the calibration targets, drawn with Canvas 2D
//                at the FULL render size (crisp lines and text), redrawn only when something it shows changes
//   (feedback) — not a layer of the profile: a transparent canvas above everything, with what MOVES during a calibration or
//                verification (the hand, the filling ring, the capture radius, the flash). Only the small rectangles around
//                those are cleared and redrawn, 30 times a second; the grid under it stays still.
// Each layer has an opacity and a CSS blend mode; z-index follows the array order. While a calibration runs the engine
// hands over [touches, grid] only (state.output.calibrating) and this page simply follows.

import { store, on, connect } from './conn.js';
import { TouchMask, wallPattern, overlayOf } from '/shared/mask.js';
import { wallUvToCanvas } from '/shared/geometry.js';
import { drawHands, drawSessionFeedback } from './feedback.js';

const BLEND = { normal: 'normal', screen: 'screen', add: 'plus-lighter', multiply: 'multiply' };
const AMBER = '#E5B567', CYAN = '#4FC3E8';
const stage = document.getElementById('stage');
const stats = { grid: 0, feedback: 0, feedbackSkipped: 0 }; // redraw counters (UI tests)
const layers = new Map(); // id → { id, el, ... } for the layers on screen
let size = null;          // the render size { w, h } of this page's life (a new one means a fresh page)
let css = { w: 0, h: 0 }; // the stage in CSS pixels

const P = () => store.state?.profile;
/** The desktop app's Spout window: pinned 1:1 to its own pixels. Anywhere else the stage is fitted to the window. */
const pinned = () => P()?.output?.sink === 'spout' && !!window.vtOut;

// ---------------------------------------------------------------------------------------------- layout

function layout() {
  if (!size) return;
  const dpr = devicePixelRatio || 1;
  css = { w: size.w / dpr, h: size.h / dpr };
  const st = stage.style;
  st.width = `${css.w}px`; st.height = `${css.h}px`;
  if (pinned()) { st.transform = 'none'; document.body.style.background = '#000'; return; }
  const kx = innerWidth / css.w, ky = innerHeight / css.h;
  if (P().output.fit === 'stretch') st.transform = `scale(${kx}, ${ky})`;
  else { const k = Math.min(kx, ky); st.transform = `translate(${(innerWidth - css.w * k) / 2}px, ${(innerHeight - css.h * k) / 2}px) scale(${k})`; }
}

function place(el) {
  el.style.width = `${css.w}px`; el.style.height = `${css.h}px`;
}

// ---------------------------------------------------------------------------------------------- layers

function experienceSrc() {
  const S = store.state, id = S.profile.experience.id, e = id && (S.experiences || []).find((c) => c.id === id);
  return e ? `/experiences/${e.id}/${e.entry}?run=1&layer=1` : '';
}

function ensure(cfg) {
  let L = layers.get(cfg.id);
  if (cfg.id === 'experience') {
    const src = experienceSrc();
    if (!src) return null;
    if (L && L.src !== src) { L.el.remove(); layers.delete('experience'); L = null; } // another piece: a fresh page
    if (!L) {
      const el = document.createElement('iframe');
      el.className = 'layer'; el.dataset.layer = 'experience'; el.title = 'Experience'; el.setAttribute('scrolling', 'no');
      el.src = src;
      stage.append(el);
      L = { id: 'experience', el, src };
      layers.set('experience', L);
    }
    return L;
  }
  if (!L) {
    const el = document.createElement('canvas');
    el.className = 'layer'; el.dataset.layer = cfg.id;
    stage.append(el);
    L = cfg.id === 'touches' ? { id: 'touches', el, g: el.getContext('2d'), mask: new TouchMask(), img: null, lastT: null } : { id: 'grid', el, g: el.getContext('2d'), key: '', fb: newFeedback() };
    layers.set(cfg.id, L);
  }
  if (cfg.id === 'touches') {
    const c = P().canvas, w = Math.max(16, Math.round(c.width * cfg.scale)), h = Math.max(16, Math.round(c.height * cfg.scale));
    if (L.mask.resize(w, h)) { // (a canvas that changes size is cleared)
      L.el.width = w; L.el.height = h; L.img = new ImageData(w, h); L.lastT = null;
      for (let i = 3; i < L.img.data.length; i += 4) L.img.data[i] = 255;
    }
  } else {
    if (L.el.width !== size.w || L.el.height !== size.h) { L.el.width = size.w; L.el.height = size.h; L.key = ''; }
    if (L.fb.el.width !== size.w || L.fb.el.height !== size.h) { L.fb.el.width = size.w; L.fb.el.height = size.h; L.fb.key = ''; L.fb.rects = []; }
  }
  return L;
}

/** Follow state.output: which layers, in which order, with which opacity and blend. */
function sync() {
  const S = store.state;
  if (!S) return;
  const O = S.profile.output, c = S.profile.canvas;
  const sz = { w: Math.max(1, Math.round(c.width * O.scale)), h: Math.max(1, Math.round(c.height * O.scale)) };
  if (size && (sz.w !== size.w || sz.h !== size.h)) { location.reload(); return; } // the render size is fixed for a page's life
  size = sz;
  layout();
  const want = O.on ? (S.output?.layersEffective || O.layers).filter((l) => l.on) : [];
  const keep = new Set();
  want.forEach((cfg, i) => {
    const L = ensure(cfg);
    if (!L) return;
    keep.add(cfg.id);
    L.cfg = cfg;
    // order = z-index (the DOM order never changes: moving an iframe in the document would reload it)
    Object.assign(L.el.style, { zIndex: String(i + 1), opacity: String(cfg.opacity), mixBlendMode: BLEND[cfg.blend] || 'normal', visibility: 'visible' });
    place(L.el);
    if (L.fb) { place(L.fb.el); L.fb.el.style.zIndex = '1000'; } // above every layer
  });
  // calibration mode only HIDES the piece the operator has on: removing its iframe would restart it (a new GPU device,
  // its warm-up) every time the grid or a calibration comes and goes
  const parked = O.on && S.output?.calibrating && O.layers.some((l) => l.id === 'experience' && l.on) && layers.get('experience');
  if (parked && !keep.has('experience')) { keep.add('experience'); parked.el.style.visibility = 'hidden'; }
  for (const [id, L] of [...layers]) if (!keep.has(id)) { L.el.remove(); L.fb?.el.remove(); layers.delete(id); }
  drawGrid();
  drawFeedback();
}

// ---------------------------------------------------------------------------------------------- touches

/** A new frame of the mask for each live message (about 30 Hz). */
function touchFrame() {
  const L = layers.get('touches'), prof = P(), live = store.live;
  if (!L || !L.cfg || !prof || !live || !L.img) return;
  const c = L.cfg;
  const dt = L.lastT === null || live.t < L.lastT ? 33 : Math.min(1000, live.t - L.lastT);
  L.lastT = live.t;
  const walls = prof.walls.filter((w) => !c.walls?.length || c.walls.includes(w.id))
    .map((wall) => ({ wall, touches: (live.walls?.[wall.id] || []).map(([, x, y, sz]) => ({ x, y, size: sz })) }));
  if (!L.mask.render(walls, c, c.scale, dt)) return; // nothing changed: the canvas keeps its (black) frame
  const m = L.mask.frame, d = L.img.data;
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { const v = m[i]; d[j] = v; d[j + 1] = v; d[j + 2] = v; }
  L.g.putImageData(L.img, 0, 0);
}

// ---------------------------------------------------------------------------------------------- grid

/** What the grid layer shows besides the wall patterns: the running session's targets (null = none). */
function sessionOverlay() {
  const S = store.state;
  return overlayOf({ grid: S.grid, calib: store.status?.calib, verify: store.status?.verify, fit: S.projection?.fit });
}

function gridKey(ov) {
  const prof = P();
  // what moves with the hand (progress, flash, armed, near) is the feedback layer's, not the grid's
  return JSON.stringify([prof.canvas, size, prof.walls.map((w) => [w.id, w.width, w.height, w.mapping, w.pixelRect]), ov], (k, v) => (k === 'progress' || k === 'flash' || k === 'armed' || k === 'near' ? undefined : v));
}

function poly(g, pts, closed = false) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (closed) g.closePath();
  g.stroke();
}

function ring(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
function dot(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function cross(g, x, y, r0, r1) {
  g.beginPath();
  g.moveTo(x - r1, y); g.lineTo(x - r0, y); g.moveTo(x + r0, y); g.lineTo(x + r1, y);
  g.moveTo(x, y - r1); g.lineTo(x, y - r0); g.moveTo(x, y + r0); g.lineTo(x, y + r1);
  g.stroke();
}

/** Redraws the grid layer — only when the profile, the session or a target changed since the last time. */
function drawGrid(force = false) {
  const L = layers.get('grid'), prof = P();
  if (!L || !prof || !size) return;
  const ov = sessionOverlay(), key = gridKey(ov);
  if (!force && key === L.key) return;
  L.key = key;
  stats.grid++;
  const g = L.g, s = prof.output.scale; // canvas px → render px
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, L.el.width, L.el.height);
  g.setTransform(s, 0, 0, s, 0, 0);
  const lw = (px) => Math.max(1.5 / s, px); // never thinner than 1.5 render px
  g.lineJoin = 'round'; g.lineCap = 'butt'; g.textBaseline = 'alphabetic';
  for (const wall of prof.walls) {
    const pat = wallPattern(wall), pm = pat.pxPerM;
    for (const l of pat.lines) { g.strokeStyle = l.major ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'; g.lineWidth = lw(l.major ? 4 : 1.5); poly(g, l.pts); }
    g.strokeStyle = '#fff'; g.lineWidth = lw(5); poly(g, pat.outline, true);
    g.lineWidth = lw(8); for (const k of pat.corners) poly(g, k);
    g.lineWidth = lw(4); for (const k of pat.cross) poly(g, k);
    g.fillStyle = '#fff'; g.textAlign = 'left';
    g.font = `600 ${Math.round(pat.textPx)}px Geist, system-ui, sans-serif`;
    for (const l of pat.lines) if (l.label) g.fillText(l.label.text, l.label.at[0], l.label.at[1]);
    g.font = `600 ${Math.round(pat.textPx * 2)}px Geist, system-ui, sans-serif`; g.textAlign = 'center';
    g.fillText(wall.id, pat.id.at[0], pat.id.at[1]);
    g.textAlign = 'left';
    const Pt = (x, y) => wallPoint(wall, x, y);
    // the running calibration: every target a dot, the current one ringed with its crosshair and number
    const cal = ov?.calib;
    if (cal && cal.wallId === wall.id) {
      cal.targets.forEach((t, i) => {
        const [x, y] = Pt(t.x, t.y);
        if (i === cal.index && cal.phase !== 'done') {
          const R = pm * 0.14;
          g.strokeStyle = g.fillStyle = AMBER; g.lineWidth = lw(6);
          ring(g, x, y, R); g.lineWidth = lw(3); cross(g, x, y, R * 0.4, R * 1.8);
          if (cal.phase === 'release') dot(g, x, y, R * 0.3);
          g.font = `600 ${Math.round(pat.textPx * 2)}px Geist, system-ui, sans-serif`;
          g.fillText(String(i + 1), x + R * 1.1, y - R * 1.1);
        } else { g.fillStyle = t.skipped ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)'; dot(g, x, y, Math.max(2 / s, pm * 0.03)); }
      });
    }
    // verification: its check points (the one being measured larger), and where the touch really landed
    const ver = ov?.verify;
    if (ver && ver.wallId === wall.id) {
      ver.targets.forEach((t, i) => {
        const [x, y] = Pt(t.x, t.y), cur = i === ver.index && ver.phase !== 'done';
        g.strokeStyle = cur ? AMBER : 'rgba(255,255,255,0.8)'; g.lineWidth = lw(cur ? 6 : 3);
        ring(g, x, y, pm * (cur ? 0.1 : 0.04));
        if (cur) { g.fillStyle = AMBER; g.font = `600 ${Math.round(pat.textPx * 2)}px Geist, system-ui, sans-serif`; g.fillText(String(i + 1), x + pm * 0.14, y - pm * 0.14); }
        if (t.measured) { const [mx, my] = Pt(t.measured[0], t.measured[1]); g.fillStyle = CYAN; dot(g, mx, my, Math.max(2 / s, pm * 0.02)); }
      });
    }
    // Fit: the mesh node being moved
    const fit = ov?.fit;
    if (fit && fit.wallId === wall.id && fit.node != null && wall.mapping?.mode === 'grid' && wall.mapping.points[fit.node]) {
      const [x, y] = wall.mapping.points[fit.node], R = pm * 0.11;
      g.strokeStyle = '#fff'; g.lineWidth = lw(5); ring(g, x, y, R); g.lineWidth = lw(3); cross(g, x, y, R * 0.45, R * 1.7);
    }
  }
}

/** A wall point (metres) in canvas pixels, through the wall's mapping. */
const wallPoint = (wall, x, y) => wallUvToCanvas(wall, x / wall.width, 1 - y / wall.height);

// ---------------------------------------------------------------------------------------------- feedback

/** The canvas above the layers for what moves during a calibration. `rects` = what was drawn last time (render px). */
function newFeedback() {
  const el = document.createElement('canvas');
  el.className = 'fb'; el.dataset.layer = 'feedback';
  stage.append(el);
  return { el, g: el.getContext('2d'), rects: [], key: '' };
}

/**
 * The hand, the filling ring, the capture radius, the flash — on the feedback canvas, at every live message. Clears only
 * the rectangles drawn last time and draws only around the targets and hands; nothing at all when nothing moved.
 */
function drawFeedback() {
  const L = layers.get('grid'), prof = P();
  if (!L?.fb || !prof || !size) return;
  const fb = L.fb, st = store.status, calib = st?.calib || null, ver = st?.verify || null;
  const hands = calib ? store.live?.calibHands?.[calib.wallId] || [] : [];
  const sig = (q) => q && [q.wallId, q.index, q.phase, q.progress, q.armed, q.captureRadiusM, q.near, q.flash, q.targets.length];
  const key = JSON.stringify([sig(calib), sig(ver), hands]);
  if (key === fb.key) { stats.feedbackSkipped++; return; }
  fb.key = key;
  stats.feedback++;
  const g = fb.g, s = prof.output.scale; // canvas px → render px
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const r of fb.rects) g.clearRect(r[0], r[1], r[2], r[3]);
  fb.rects = [];
  g.setTransform(s, 0, 0, s, 0, 0);
  const lw = (px) => Math.max(1.5 / s, px);
  const mark = (x, y, r) => fb.rects.push([Math.floor((x - r) * s) - 2, Math.floor((y - r) * s) - 2, Math.ceil(2 * r * s) + 5, Math.ceil(2 * r * s) + 5]);
  g.lineJoin = 'round'; g.lineCap = 'butt';
  for (const [sess, kind] of [[calib, 'calib'], [ver, 'verify']]) {
    const wall = sess && prof.walls.find((w) => w.id === sess.wallId);
    if (!wall) continue;
    const pm = wall.pixelRect.h / wall.height, o = { pt: (x, y) => wallPoint(wall, x, y), pm, lw, mark, textPx: pm * 0.12 };
    if (kind === 'calib') drawHands(g, hands, o);
    drawSessionFeedback(g, sess, kind, o);
  }
  fb.el.style.display = fb.rects.length ? 'block' : 'none';
}

// ---------------------------------------------------------------------------------------------- go

addEventListener('resize', layout);
on('state', sync);
on('status', () => drawGrid());
on('calib', () => drawGrid());
on('live', () => { touchFrame(); drawFeedback(); });
document.fonts?.load?.('600 20px Geist').then(() => drawGrid(true)).catch(() => {});
// UI tests: a hidden window paints no frames. layers() = the ones that show (a piece parked by calibration mode does not)
window.__out = { sync, touchFrame, drawGrid, drawFeedback, stats, layers: () => [...layers.values()].filter((L) => L.el.style.visibility !== 'hidden').map((L) => L.id) };
connect();
if (store.state) sync();
const offStarted = on('state', () => { offStarted(); window.__vtStarted?.(); }); // the startup guard (boot-guard.js) stands down once the engine has answered
