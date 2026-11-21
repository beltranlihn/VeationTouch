// The room output (/output): ONE image made of stacked layers, on black, composed on the GPU (ui/js/mixer, MEDIA-SERVER.md
// §4.5). The desktop app opens this page in an off-screen window of the render size (canvas × the output's scale) and
// sends what Chromium paints — 1:1 — to the single Spout sender (app/main.js); the same page can fill a display instead
// (sink "window") or open in a browser, where the image is fitted to the window.
//
// Layers (engine: profile.output.layers, bottom → top; state.output.layersEffective is what to draw right now). Each is
// a texture of the mixer, with an opacity and a blend (normal / screen / add / multiply, premultiplied: gl.js):
//   experience — an <iframe> of the experience page in layer mode (?run=1&layer=1), at the render size, under the mixer's
//                canvas (covered, never hidden: it must keep rendering). In the task in which it draws, its runtime calls
//                __vtLayerFrame(canvas, t) here and the mixer copies the canvas (a canvas is empty once presented) and
//                composes the frame right then: the experience's frames drive the output.
//   media      — the clip layers (a group, ui/js/mixer/layers.js), filled by the HAP clip player (ui/js/mixer/media-layers.js)
//                from state.media: one player per playing clip, decoded in workers, on the frame the engine's clock says.
//   touches    — the black-and-white mask of the touches, drawn by the engine's own rasteriser (/shared/mask.js, the same
//                code as the Texture output) at the layer's scale and stretched to the render size; uploaded when it changes
//   grid       — the pixel map (wall outlines, metre grid, wall ids) and the calibration targets, drawn with Canvas 2D at
//                the FULL render size (crisp lines and text), redrawn and uploaded only when something it shows changes
//   (feedback) — not a layer of the profile: what MOVES during a calibration or verification (the hand, the filling ring,
//                the capture radius, the flash), on its own canvas above everything, with the grid. Only the small
//                rectangles around those are cleared and redrawn, 30 times a second; the grid under it stays still.
// The 2D canvases are never displayed: they are the sources of the textures. While a calibration runs the engine hands
// over [touches, grid] only (state.output.calibrating); the experience is then neither copied nor drawn, but keeps running.
// Without an experience (or when it stops calling) this page's own frame loop composes, only when something changed.
// Blackout (state.media.blackout): the image fades to black in 0.5 s, and back.
// Another experience (MEDIA-SERVER.md §4.5, §4b.4): the outgoing one's last image stays, frozen, while the incoming page
// loads — however long that takes (an experience that never starts leaves it there; its card shows the error) — and
// fades to the incoming one over SWITCH_MS from its first frame. Never two experiences alive, never black in between.
// A TRANSPARENT experience (its manifest says "transparent": true) is drawn just above the clips (the media group) when
// the profile has it below them, and not opaque: its premultiplied canvas lets the video show through.
// Screens (the Advanced Output, MEDIA-SERVER.md §5; sink "screens", or ?screens=preview): the image is not presented as
// it is but cut into SLICES drawn onto the screens (ui/js/mixer/screens.js), each screen with its test card on top when
// state.output.testCard. ?screens=window is the desktop app's window over the screens' displays (each screen where its
// display is: state.output.screens); anywhere else (the Preview window, a browser) the screens are laid side by side, at
// scale, on grey.

import { store, on, connect, cmd } from './conn.js';
import { TouchMask, wallPattern, overlayOf } from '/shared/mask.js';
import { wallUvToCanvas } from '/shared/geometry.js';
import { playhead } from '/shared/transport.js';
import { drawHands, drawSessionFeedback } from './feedback.js';
import { createMixer } from './mixer/gl.js';
import { createRegistry, buildDraws, LAYER_IDS } from './mixer/layers.js';
import { createMediaLayers } from './mixer/media-layers.js';
import { makeClock } from './clock.js';
import { createScreensPresenter, drawTestCard, snapshot } from './mixer/screens.js';
import { sliceInput, sliceMesh, outputCorners } from '/shared/media/screens.js';

const AMBER = '#E5B567', CYAN = '#4FC3E8';
const BLACKOUT_MS = 500;
const SWITCH_MS = 800; // the frozen frame of the outgoing experience → the incoming one
const SCREENS_Q = new URLSearchParams(location.search).get('screens'); // 'window' | 'preview' | null
/**
 * Only the app's own output window is the room's live instance: its experience launches the clips and reports, its HAP
 * player reports a broken clip (which ejects it). The Screens preview (?screens=preview) and any browser tab showing /output
 * are viewers: they look, they never report.
 */
export const IS_LIVE = SCREENS_Q !== 'preview' && /Electron\//.test(navigator.userAgent);
const reportingCmd = (type, args) => (!IS_LIVE && (type === 'media.report' || type === 'experience.report') ? Promise.resolve(null) : cmd(type, args));
const stage = document.getElementById('stage'); // the layers' sources
const view = document.getElementById('mix');    // the mixer's canvas: what this page shows
// counters (UI and mixer tests): grid / touches / feedbackUploads = texture uploads; gridDraws / feedback = canvas redraws
const stats = { cards: 0, grid: 0, gridDraws: 0, touches: 0, feedback: 0, feedbackSkipped: 0, feedbackUploads: 0, composed: 0, expCalls: 0, expFrames: 0, expLoads: 0, lost: 0, error: null, timing: null };
const layers = new Map();          // id → { id, el, ... } the sources of the layers in use
const registry = createRegistry(); // groups of layers registered from outside (media)
const clock = makeClock();         // the engine's clock (live messages carry its time)
let size = null;                   // the render size { w, h } of this page's life (a new one means a fresh page)
let mixer = null;
// the clip layers: HAP players driven by state.media, in the media group (they run their hook before the group draws)
const media = createMediaLayers({ registry, mixer: () => mixer, store, on, cmd: reportingCmd, clock, playhead });
let want = [];                     // the layers drawn now, bottom → top ({id, opacity, blend, …})
let dirty = true;                  // something to compose
let fade = null;                   // blackout: 0 = image … 1 = black (null until the first state)
let lastCompose = 0, lastExp = -Infinity, frameNo = 0, timingAt = 0;
let frozen = null;                 // the outgoing experience's last image { tex, texW, texH, gen, opaque } (until the switch is over)
const rec = { t: [], cpu: [] };    // the last compositions: instants and CPU ms (stats.timing)

const P = () => store.state?.profile;
/** The image goes through the screens' slices (and not to the window as it is). */
const screensMode = () => SCREENS_Q === 'preview' || P()?.output?.sink === 'screens';
let presenter = null;
const scr = { key: '', plan: null, cards: new Map() }; // the slices' meshes per screen, and the test cards (2D canvas + texture)
/** The desktop app's Spout window: pinned 1:1 to its own pixels. Anywhere else the image is fitted to the window. */
const pinned = () => P()?.output?.sink === 'spout' && !!window.vtOut && !SCREENS_Q;
const viewFit = () => (pinned() ? 'pinned' : P()?.output?.fit === 'stretch' ? 'stretch' : 'fit');
const drawn = (id) => want.some((l) => l.id === id);

// ---------------------------------------------------------------------------------------------- layout

function layout() {
  if (!size) return;
  const dpr = devicePixelRatio || 1, cw = size.w / dpr, ch = size.h / dpr;
  Object.assign(stage.style, { width: `${cw}px`, height: `${ch}px` });
  const [w, h, css] = pinned() ? [size.w, size.h, [`${cw}px`, `${ch}px`]] : [Math.max(1, Math.round(innerWidth * dpr)), Math.max(1, Math.round(innerHeight * dpr)), ['100vw', '100vh']];
  Object.assign(view.style, { width: css[0], height: css[1] });
  if (view.width !== w) view.width = w; // (a canvas that changes size is cleared: only when it does)
  if (view.height !== h) view.height = h;
  dirty = true;
}

function place(el) {
  const dpr = devicePixelRatio || 1;
  el.style.width = `${size.w / dpr}px`; el.style.height = `${size.h / dpr}px`;
}

// ---------------------------------------------------------------------------------------------- textures

/** The texture of a source (w × h), made again when its size changes or the GL context came back. */
function texOf(holder, w, h) {
  if (holder.tex && holder.texW === w && holder.texH === h && holder.gen === mixer.generation) return holder.tex;
  if (holder.gen === mixer.generation) mixer.deleteTexture(holder.tex);
  holder.tex = mixer.texture(w, h); holder.texW = w; holder.texH = h; holder.gen = mixer.generation;
  return holder.tex;
}

function freeTex(holder) {
  if (holder?.tex && mixer && holder.gen === mixer.generation) mixer.deleteTexture(holder.tex);
  if (holder) holder.tex = null;
}

/** The 2D layers that changed since the last composition go to their textures. */
function uploadChanged() {
  const T = layers.get('touches'), G = layers.get('grid');
  if (T?.dirty && drawn('touches')) { mixer.upload(texOf(T, T.el.width, T.el.height), T.el); T.dirty = false; stats.touches++; }
  if (G?.dirty && drawn('grid')) { mixer.upload(texOf(G, G.el.width, G.el.height), G.el); G.dirty = false; stats.grid++; }
  const fb = G?.fb;
  if (fb?.on && fb.dirty && drawn('grid')) { mixer.upload(texOf(fb, fb.el.width, fb.el.height), fb.el); fb.dirty = false; stats.feedbackUploads++; }
}

// ---------------------------------------------------------------------------------------------- layers

/** The catalog entry of the room's experience, or null. */
function experienceEntry() {
  const S = store.state, id = S?.profile?.experience?.id;
  return (id && (S.experiences || []).find((c) => c.id === id)) || null;
}

function experienceSrc() {
  const e = experienceEntry();
  return e ? `/experiences/${e.id}/${e.entry}?run=1&layer=1${IS_LIVE ? '' : '&view=1'}` : '';
}

/** The outgoing experience's last image is kept (its texture leaves the layer), if it ever showed one. */
function freeze(L) {
  if (!mixer || !L.ready || !L.tex || L.gen !== mixer.generation) return; // nothing shown yet: an older frozen frame stays
  freeTex(frozen);
  frozen = { tex: L.tex, texW: L.texW, texH: L.texH, gen: L.gen, opaque: L.opaque !== false };
  L.tex = null;
}

function unfreeze() { freeTex(frozen); frozen = null; }

/** What the experience layer shows now: its own frames, the frozen frame of the one before, or the fade between them. */
function experienceSource(E, now) {
  const opaque = E.opaque !== false;
  if (frozen && (!mixer || frozen.gen !== mixer.generation)) frozen = null; // a lost context took it
  if (!frozen) return { tex: E.tex, ready: E.ready, opaque };
  if (!E.ready || E.firstAt == null) return { tex: frozen.tex, ready: true, opaque: frozen.opaque };
  const k = (now - E.firstAt) / SWITCH_MS;
  if (k >= 1) { unfreeze(); return { tex: E.tex, ready: true, opaque }; }
  return { tex: frozen.tex, texB: E.tex, mix: Math.max(0, k), ready: true, opaque: opaque && frozen.opaque };
}

function drop(L) {
  L.el.remove(); L.fb?.el.remove();
  freeTex(L); freeTex(L.fb);
  layers.delete(L.id);
}

function ensure(cfg) {
  let L = layers.get(cfg.id);
  if (cfg.id === 'experience') {
    const src = experienceSrc();
    if (!src) return null;
    if (L && L.src !== src) { freeze(L); drop(L); L = null; } // another piece: a fresh page, the old one's image frozen until it draws
    if (!L) {
      const el = document.createElement('iframe');
      el.className = 'layer'; el.dataset.layer = 'experience'; el.title = 'Experience'; el.setAttribute('scrolling', 'no');
      L = { id: 'experience', el, src, ready: false, tex: null, firstAt: null };
      el.addEventListener('load', () => { stats.expLoads++; L.ready = false; dirty = true; }); // every load = a (re)start of the piece
      el.src = src;
      stage.append(el);
      layers.set('experience', L);
    }
    L.opaque = !experienceEntry()?.transparent;
    place(L.el);
    return L;
  }
  if (!L) {
    const el = document.createElement('canvas');
    el.className = 'layer'; el.dataset.layer = cfg.id;
    stage.append(el);
    L = cfg.id === 'touches' ? { id: 'touches', el, g: el.getContext('2d'), mask: new TouchMask(), img: null, lastT: null, dirty: true, tex: null }
      : { id: 'grid', el, g: el.getContext('2d'), key: '', fb: newFeedback(), dirty: true, tex: null };
    layers.set(cfg.id, L);
  }
  if (cfg.id === 'touches') {
    const c = P().canvas, w = Math.max(16, Math.round(c.width * cfg.scale)), h = Math.max(16, Math.round(c.height * cfg.scale));
    if (L.mask.resize(w, h)) { // (a canvas that changes size is cleared)
      L.el.width = w; L.el.height = h; L.img = new ImageData(w, h); L.lastT = null; L.dirty = true;
      for (let i = 3; i < L.img.data.length; i += 4) L.img.data[i] = 255;
    }
  } else {
    if (L.el.width !== size.w || L.el.height !== size.h) { L.el.width = size.w; L.el.height = size.h; L.key = ''; L.dirty = true; }
    if (L.fb.el.width !== size.w || L.fb.el.height !== size.h) { L.fb.el.width = size.w; L.fb.el.height = size.h; L.fb.key = ''; L.fb.rects = []; L.fb.on = false; }
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
  if (!size) { size = sz; start(); }
  layout();
  const list = [], keep = new Set();
  for (const cfg of O.on ? (S.output?.layersEffective || O.layers).filter((l) => l.on) : []) {
    if (!LAYER_IDS.includes(cfg.id) || keep.has(cfg.id)) continue;
    if (cfg.id !== 'media' && !ensure(cfg)) continue; // (media: a group, its layers are registered by the clip player)
    keep.add(cfg.id);
    const L = layers.get(cfg.id);
    if (L) L.cfg = cfg;
    list.push(cfg);
  }
  // calibration mode only sets aside the piece the operator has on: removing its iframe would restart it (a new GPU device,
  // its warm-up) every time the grid or a calibration comes and goes. It keeps running, neither copied nor drawn.
  const parked = O.on && S.output?.calibrating && O.layers.some((l) => l.id === 'experience' && l.on) && layers.get('experience');
  if (parked) keep.add('experience');
  for (const [id, L] of [...layers]) if (!keep.has(id)) drop(L);
  if (!keep.has('experience')) unfreeze(); // no experience any more (None, or its layer off): nothing to fade from
  // a transparent experience goes just above the clips (when the profile has it below them): the video shows through it
  const xi = list.findIndex((l) => l.id === 'experience'), mi = list.findIndex((l) => l.id === 'media');
  if (xi >= 0 && mi > xi && experienceEntry()?.transparent) list.splice(mi, 0, list.splice(xi, 1)[0]);
  want = list;
  if (fade == null) fade = blackoutTarget(); // a page that opens during a blackout starts black
  dirty = true;
  drawGrid();
  drawFeedback();
}

/**
 * How dark the image should be now (0 … 1): state.media.blackout, faded over BLACKOUT_MS from the engine instant it changed
 * (state.media.blackoutAt, engine clock = the live feed's) — so a page that opens late, or reloads, is where the fade is.
 * Before the first live message (no clock yet) or without the instant: the flag alone (the fade then runs from now).
 * An engine without state.media never blacks out.
 */
function blackoutTarget() {
  const m = store.state?.media;
  const on = m?.blackout === true;
  const at = m?.blackoutAt, eng = clock.engineNow();
  if (!Number.isFinite(at) || eng == null) return on ? 1 : 0;
  const k = Math.max(0, Math.min(1, (eng - at) / BLACKOUT_MS));
  return on ? k : 1 - k;
}

// ---------------------------------------------------------------------------------------------- composing

/**
 * One frame of the room's image: the experience's canvas (when it is the caller: in the task it drew in) and the 2D layers
 * that changed go to their textures, the media group's hooks run, then the draws, the blackout and the presentation.
 * `t`: the instant of the frame (page clock) — the experience's requestAnimationFrame time when it drives the output.
 */
function compose(t, expCanvas = null) {
  if (!mixer || mixer.lost) return;
  const a = performance.now();
  const dt = lastCompose ? Math.min(100, a - lastCompose) : 0;
  lastCompose = a;
  const timed = frameNo++ % 4 === 0; // GPU timer queries on one frame in four
  mixer.pollTimers();
  // the blackout: towards where the engine's instant says it is, never faster than the fade itself (no jumps)
  const target = blackoutTarget(), goal = store.state?.media?.blackout === true ? 1 : 0;
  if (fade == null) fade = target;
  else if (fade !== target) fade = target > fade ? Math.min(target, fade + dt / BLACKOUT_MS) : Math.max(target, fade - dt / BLACKOUT_MS);
  const dark = fade >= 1;
  const E = layers.get('experience');
  if (expCanvas && E && !dark) {
    const tex = texOf(E, expCanvas.width, expCanvas.height);
    mixer.time('copy', timed, () => mixer.upload(tex, expCanvas));
    E.ready = true; stats.expFrames++;
    if (E.firstAt == null) E.firstAt = a; // (the fade from a frozen frame starts here)
  }
  let draws = [];
  if (!dark) {
    uploadChanged();
    if (drawn('media')) registry.group('media').frame({ t, now: a, dt, gl: mixer.gl, mixer });
    draws = buildDraws(want, sources(), registry);
  }
  mixer.time('compose', timed, () => { mixer.compose(draws, { fade }); if (screensMode()) presenter.present(screensPlan()); else mixer.present(viewFit()); });
  stats.composed++;
  dirty = fade !== goal; // keep composing until the fade has arrived
  rec.t.push(a); rec.cpu.push(performance.now() - a);
  if (rec.t.length > 240) { rec.t.splice(0, 120); rec.cpu.splice(0, 120); }
}

// ---------------------------------------------------------------------------------------------- screens

/**
 * Where each screen goes on this page's canvas and the meshes of its slices — made again only when the screens, the walls,
 * the canvas or the window change. In the app's screens window every screen sits where its display is (state.output.
 * screens: `rel`, DIP from the window's corner); elsewhere they are laid side by side at their resolution and fitted.
 */
function screensPlan() {
  const prof = P(), S = store.state, O = prof.output;
  const real = SCREENS_Q === 'window', live = S.output?.screens?.list || [];
  const relOf = (s) => live.find((l) => l.id === s.id)?.rel;
  const list = (O.screens || []).filter((s) => s.enabled && (!real || relOf(s)));
  const cw = view.width, ch = view.height, dpr = devicePixelRatio || 1;
  let boxes;
  if (real) boxes = list.map((s) => { const r = relOf(s); return [r.x * dpr, r.y * dpr, r.width * dpr, r.height * dpr]; });
  else {
    const gap = list.length > 1 ? Math.max(...list.map((s) => s.width)) * 0.04 : 0;
    const W = list.reduce((n, s) => n + s.width, 0) + gap * Math.max(0, list.length - 1), H = Math.max(1, ...list.map((s) => s.height));
    const k = W ? Math.min(cw / W, ch / H) : 1;
    let x = (cw - W * k) / 2;
    boxes = list.map((s) => { const b = [x, (ch - s.height * k) / 2, s.width * k, s.height * k]; x += (s.width + gap) * k; return b; });
  }
  const key = JSON.stringify([cw, ch, boxes, list, prof.canvas, prof.walls.map((w) => [w.id, w.pixelRect])]);
  if (key !== scr.key) {
    scr.key = key;
    scr.plan = {
      bg: real ? 0 : 0x11 / 255,
      screens: list.map((s, i) => ({
        id: s.id, screen: s, view: boxes[i], sx: boxes[i][2] / s.width, sy: boxes[i][3] / s.height, card: null,
        slices: s.slices.filter((x) => x.enabled).map((x) => ({ id: x.id, mesh: sliceMesh(x, sliceInput(x, prof), prof.canvas) })),
      })),
    };
  }
  // the test cards: drawn once per screen and what it shows (its size, name, slices), uploaded, kept while it is on
  const on = !!S.output?.testCard;
  for (const s of scr.plan.screens) s.card = on ? cardOf(s.screen) : null;
  if (!on && scr.cards.size) { for (const c of scr.cards.values()) freeTex(c); scr.cards.clear(); }
  return scr.plan;
}

function cardOf(screen) {
  let c = scr.cards.get(screen.id);
  const key = JSON.stringify([screen.name, screen.width, screen.height, screen.slices.filter((x) => x.enabled).map((x) => [x.name, x.output])]);
  if (!c) { c = { el: document.createElement('canvas'), key: '', tex: null }; scr.cards.set(screen.id, c); }
  const fresh = c.gen !== mixer.generation;
  if (c.key !== key || fresh) {
    c.key = key;
    if (c.el.width !== screen.width || c.el.height !== screen.height) { c.el.width = screen.width; c.el.height = screen.height; }
    drawTestCard(c.el.getContext('2d'), screen, screen.slices.filter((x) => x.enabled).map((x) => ({ name: x.name, corners: outputCorners(x.output) })));
    mixer.upload(texOf(c, screen.width, screen.height), c.el);
    stats.cards++;
  }
  return c.tex;
}

function sources() {
  const E = layers.get('experience'), T = layers.get('touches'), G = layers.get('grid');
  return {
    experience: E && experienceSource(E, performance.now()),
    touches: T && { tex: T.tex },
    grid: G && { tex: G.tex },
    feedback: G?.fb && drawn('grid') && { tex: G.fb.tex, on: G.fb.on },
  };
}

// The experience's runtime (layer mode) calls this in the task in which it drew: copy now, compose now (MEDIA-SERVER-
// MEDIDAS.md §8.2: this page's requestAnimationFrame runs BEFORE the iframe's, so composing there would always show the
// previous frame of the piece). `t`: its requestAnimationFrame time, in its own clock.
window.__vtLayerFrame = (canvas, t) => {
  stats.expCalls++;
  const E = layers.get('experience');
  if (!mixer || !E || !canvas || canvas.ownerDocument !== E.el.contentDocument) return;
  if (!drawn('experience')) return; // parked (calibration mode) or off: not copied; this page's loop composes the rest
  lastExp = performance.now();
  let tp = lastExp;
  try { if (Number.isFinite(t)) tp = t + (E.el.contentWindow.performance.timeOrigin - performance.timeOrigin); } catch { /* going away */ }
  compose(tp, canvas);
};

/** This page's own frames: they compose only when the experience is not driving (none, parked, or > 2 frames late). */
function pageFrame(t) {
  if (!mixer) return;
  const now = performance.now();
  if (now - timingAt >= 1000) { timingAt = now; stats.timing = timing(now); }
  const every = 1000 / (P()?.output?.fps || 60);
  if (drawn('experience') && now - lastExp < every * 2.5) return;
  // (a clip that is playing keeps the frames coming even before its first image: its player is driven by them)
  if (dirty || (drawn('media') && (registry.active || media.busy))) compose(t ?? now, null);
}

/** requestAnimationFrame, and a timer when it does not come (a window nobody sees: the tests' hidden windows). */
function runLoop() {
  let raf = 0, tm = 0, timerSteps = 0;
  const step = (fromRaf, t) => {
    cancelAnimationFrame(raf); clearTimeout(tm);
    if (fromRaf) timerSteps = 0; else timerSteps++;
    try { pageFrame(fromRaf ? t : performance.now()); } catch (e) { stats.error = String(e?.message || e).slice(0, 200); console.error(e); }
    const every = 1000 / (P()?.output?.fps || 60);
    raf = requestAnimationFrame((ts) => step(true, ts));
    tm = setTimeout(() => step(false), timerSteps >= 3 ? Math.max(1, every - 2) : Math.max(60, every * 3));
  };
  step(false);
}

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(2); };
const sum = (arr) => (arr.length ? { p50: pct(arr, 50), p95: pct(arr, 95), max: +Math.max(...arr).toFixed(2) } : null);

/** The last two seconds of compositions: rate, gaps, CPU ms; GPU ms of the copy and the composition (timer queries). */
function timing(now) {
  const i0 = rec.t.findIndex((x) => x >= now - 2000), ts = i0 < 0 ? [] : rec.t.slice(i0), cpu = i0 < 0 ? [] : rec.cpu.slice(i0);
  const gaps = ts.slice(1).map((x, i) => x - ts[i]);
  const g = mixer?.gpu, last = (k) => (g?.[k] ? g[k].slice(-60) : []);
  return {
    fps: ts.length > 1 ? +((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)).toFixed(1) : 0,
    driver: drawn('experience') && now - lastExp < 100 ? 'experience' : 'page',
    gapMs: sum(gaps), cpuMs: sum(cpu),
    gpuMs: g ? { copy: sum(last('copy')), compose: sum(last('compose')) } : null,
  };
}

function start() {
  mixer = createMixer(view, { width: size.w, height: size.h });
  if (!mixer) { // no WebGL 2 here: the experience's own page shows (no other layer) rather than nothing
    stats.error = 'WebGL 2 is not available: the output shows the experience alone';
    console.warn(stats.error);
    view.hidden = true;
    return;
  }
  presenter = createScreensPresenter(mixer);
  mixer.gl.canvas.addEventListener('webglcontextlost', () => { stats.lost++; });
  mixer.onRestored(() => {
    for (const L of layers.values()) { L.dirty = true; L.ready = false; if (L.fb) L.fb.dirty = true; }
    scr.key = ''; for (const c of scr.cards.values()) c.key = ''; // (meshes and cards again on the new context)
    dirty = true;
  });
  runLoop();
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
  if (!L.mask.render(walls, c, c.scale, dt)) return; // nothing changed: the texture keeps its (black) frame
  const m = L.mask.frame, d = L.img.data;
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { const v = m[i]; d[j] = v; d[j + 1] = v; d[j + 2] = v; }
  L.g.putImageData(L.img, 0, 0);
  L.dirty = true; dirty = true;
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
  stats.gridDraws++;
  L.dirty = true; dirty = true;
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

/** The canvas for what moves during a calibration. `rects` = what was drawn last time (render px); `on` = something shows. */
function newFeedback() {
  const el = document.createElement('canvas');
  el.className = 'fb'; el.dataset.layer = 'feedback';
  stage.append(el);
  return { el, g: el.getContext('2d'), rects: [], key: '', on: false, dirty: false, tex: null };
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
  const was = fb.on;
  fb.on = fb.rects.length > 0;
  if (fb.on || was) { fb.dirty = true; dirty = true; }
}

// ---------------------------------------------------------------------------------------------- go

addEventListener('resize', layout);
on('state', sync);
on('media', () => { if (fade == null && store.state) fade = blackoutTarget(); dirty = true; }); // the transport (blackout…) comes on its own
on('status', () => drawGrid());
on('calib', () => drawGrid());
on('live', (L) => { clock.sample(L?.t); touchFrame(); drawFeedback(); });
document.fonts?.load?.('600 20px Geist').then(() => drawGrid(true)).catch(() => {});
// Tests and the clip player (F6). layers(): the layers drawn, bottom → top (a piece parked by calibration mode is not);
// plan(): with their blend and opacity, and the feedback when it shows; compose(): a frame now (a hidden window has none).
window.__out = {
  sync, touchFrame, drawGrid, drawFeedback, stats, registry, clock, media,
  layers: () => want.map((l) => l.id),
  frozen: () => !!frozen, // the outgoing experience's frame is still shown (or fading out)
  plan: () => [...want.map((l) => ({ id: l.id, blend: l.blend || 'normal', opacity: l.opacity ?? 1 })), ...(sources().feedback?.on ? [{ id: 'feedback', blend: 'normal', opacity: 1 }] : [])],
  compose: () => compose(performance.now(), null),
  mixer: () => mixer,
  fade: () => fade,
  view: () => ({ fit: viewFit(), canvas: [view.width, view.height], css: [view.style.width, view.style.height], rect: mixer?.view?.rect || null, size }),
  // the Advanced Output: whether the image goes through the slices, where each screen went (canvas px) and its slices;
  // read(): RGBA of the presented canvas (TESTS ONLY)
  screens: () => ({ on: screensMode(), q: SCREENS_Q, ...(presenter?.view || {}) }),
  read: (x, y, w, h) => presenter.read(x, y, w, h),
  present: () => presenter.present(screensPlan()), // (after a mixer.compose of the test's own draws)
  // the room's monitor while this page shows the screens: the canvas itself, 640 px wide, as a JPEG data URL (app/main.js)
  previewJpeg: (w = 640) => {
    if (!mixer || mixer.lost) return null;
    const h = Math.max(1, Math.round((w * mixer.height) / mixer.width)), px = snapshot(mixer, w, h);
    const c = (scr.snapCanvas ||= document.createElement('canvas'));
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), w, h), 0, 0);
    return c.toDataURL('image/jpeg', 0.6);
  },
};
connect();
if (store.state) sync();
const offStarted = on('state', () => { offStarted(); window.__vtStarted?.(); }); // the startup guard (boot-guard.js) stands down once the engine has answered
