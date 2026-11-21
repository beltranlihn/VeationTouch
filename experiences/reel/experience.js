// Reel — Alma Digital Studio's interactive reel for the room (MEDIA-SERVER.md §6).
// A landing with the brand and two buttons on every wall — "Play Reel" plays the studio's reel, "See Projects" opens a
// menu of 3D blobs, one per project, each playing its project's video — and back. The videos are not in this folder: they
// are clips of the show, assigned to the preset's slots (manifest `media`: `reel`, `projects`) in Live, and the media
// engine plays them on the room's reserved layer through vt.media. This page is `transparent` (it goes above the clip
// layers): while a video plays it clears itself and the video shows through; only the hold-to-exit ring is drawn on it.
// Pure parts, tested in Node (tests/reel.test.mjs): states.js (the state machine), layout.js (metres on the walls),
// hit.js (what a hand touches; dwell and hold). Drawing: gfx.js (field, buttons, sprites) and blobs.js.
import { connectExperience } from '/experiences/runtime.js';
import { initial, step, usable, hasProjects } from './states.js';
import { makeDwell, makeHold } from './hit.js';
import { landingLayout, menuLayout, blobMotion, toTarget, toPx, ease, BUTTON, LABEL_W_M } from './layout.js';
import { makeQuad, makeField, makeUi, makeSprites, textureFrom, textTexture, pm, PALETTE } from './gfx.js';
import { makeBlobs } from './blobs.js';

const vt = await connectExperience();
const W = vt.size.width, H = vt.size.height;
const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
canvas.className = vt.fit === 'stretch' ? 'stretch' : 'fit';

const FADE_S = 0.6;            // scene transitions (§6.4: 0.6 s, the website's curve)
const PLAY_FADE_MS = 600;      // the video's own fade in (its layer transition)
const STOP_FADE_MS = 400;      // and out, when a hand leaves it
const REPORT_HOLD_MS = 10000;  // an error stays in the app's report this long
// quality: the background field's resolution (it is smooth: a fraction of the canvas is plenty) and the blobs' ray steps
const QUALITY = { low: { field: 0.125, steps: 24 }, medium: { field: 0.25, steps: 28 }, high: { field: 0.5, steps: 32 } };
// the logo (the studio's 1920 x 1080 artwork, two layers cropped in place — the same files as Alma liquid)
const LOGO = { blob: { x: 424, y: 63, w: 1003, h: 952 }, wordmark: { x: 648, y: 422, w: 675, h: 296 } };
// the website's hero breathing: each layer its amplitude, period and phase
const BREATH = { blob: { amp: 0.025, period: 7.2, phase: 0 }, wordmark: { amp: 0.016, period: 5.5, phase: Math.PI * 0.65 } };
const WHITE = [255, 255, 255];

const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
if (!gl) {
  document.body.textContent = 'WebGL2 is not available on this machine.';
  throw new Error('WebGL2 is not available');
}

const P = Object.assign({}, vt.params);
const geo = { width: W, closed: !!vt.closedLoop };
const wallsById = () => new Map((vt.walls || []).map((w) => [w.id, w]));
let walls = wallsById();
const kMax = () => Math.max(1, ...[...walls.values()].map((w) => w.pxPerM || 1));

// ---------------------------------------------------------------------------------------------- clips (vt.media)

const NO_MEDIA = { available: false, slot: () => null, on: () => () => {}, play: async () => { throw new Error('no clips here'); }, stop: async () => {}, preload: async () => {} };
const media = vt.media || NO_MEDIA;
const readSlots = () => {
  const reel = media.slot('reel'), projects = media.slot('projects');
  return { reel: reel && !Array.isArray(reel) ? reel : null, projects: Array.isArray(projects) ? projects : projects ? [projects] : [] };
};
let slots = readSlots();

// ---------------------------------------------------------------------------------------------- state

let S = initial(0);
let clock = 0;                  // ms of the page's own clock (the frames' dt): the state machine's time
let hands = [];
const dwell = makeDwell({ dwellMs: P.dwellMs });
const hold = makeHold();
let hot = new Map(), rings = [], launched = null;
const press = new Map();        // target id → smoothed press 0..1 (the visual answer to a hand)
const ringShown = new Map();    // target id → smoothed ring progress (empties quickly when the hand leaves)
const vis = { scene: 1, landing: 1, menu: 0 };
let reportTimer = 0;

const hooks = (window.__reel = {
  ready: false, vt, reports: [], plays: [], hits: [],
  get state() { return { ...S }; },
  get slots() { return slots; },
  get landing() { return land; },
  get menu() { return menu; },
  targets: () => currentTargets(clock / 1000),
  get vis() { return { ...vis }; },
});

const ctx = () => ({ slots, params: P });

function dispatch(ev) {
  const prev = S;
  const r = step(S, { ...ev, t: clock }, ctx());
  S = r.state;
  for (const a of r.actions) act(a);
  if (S.name !== prev.name || S.phase !== prev.phase) {
    // a new scene: the hands on the wall now must lift before they count (the hand that left a video lands on the menu)
    dwell.reset(hands); hold.reset(hands);
    if (S.name !== prev.name && S.phase !== 'starting') launched = null;
  }
}

function act(a) {
  if (a.do === 'play') {
    hooks.plays.push(a.clipId);
    Promise.resolve().then(() => media.play(a.clipId, { end: 'clear', transitionMs: PLAY_FADE_MS })).then(
      (r) => dispatch({ type: 'played', req: a.req, playId: r?.playId ?? null, clipId: a.clipId }),
      (e) => dispatch({ type: 'playFailed', req: a.req, clipId: a.clipId, error: String(e?.message || e).slice(0, 160) }),
    );
  } else if (a.do === 'stop') {
    Promise.resolve().then(() => media.stop({ transitionMs: STOP_FADE_MS })).catch(() => {});
  } else if (a.do === 'preload') {
    for (const id of a.clipIds) Promise.resolve().then(() => media.preload(id)).catch(() => {});
  } else if (a.do === 'report') report(a.error);
}

/** Tell the app (its Live card shows the experience's error) — for a while, then clear it. */
function report(msg) {
  hooks.reports.push(msg);
  console.warn(`Reel: ${msg}`);
  if (typeof vt.report === 'function') { vt.report(msg); return; }
  const o = vt._out; // the runtime's report of this page (experience.report, every 2 s)
  if (!o) return;
  o.error = msg;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => { if (o.error === msg) o.error = null; }, REPORT_HOLD_MS);
}

for (const type of ['started', 'ended', 'error']) media.on(type, (e) => dispatch({ ...e, type }));
media.on('slots', () => { slots = readSlots(); dirty = true; labelsDirty = true; });

// ---------------------------------------------------------------------------------------------- layout

let land = { brands: [], items: [] }, menu = { blobs: [], items: [], labelW: 0 }, landTargets = [];
let dirty = true, labelsDirty = true;

let laidOut = null;              // the vt.walls the layout was made for (the runtime replaces them when the room changes)
function apply() {
  dirty = false;
  if (laidOut !== vt.walls) labelsDirty = true; // the walls' px per metre size the labels
  laidOut = vt.walls;
  walls = wallsById();
  geo.closed = !!vt.closedLoop;
  dwell.dwellMs = P.dwellMs;
  land = landingLayout(vt.walls, { buttonHeight: P.buttonHeight, brandWall: P.brandWall || null });
  const was = menu.labelW;
  menu = menuLayout(vt.walls, slots.projects.length, { menuLayout: P.menuLayout, blobSize: P.blobSize });
  if (menu.labelW !== was) labelsDirty = true;
  landTargets = land.items.map((it) => ({ ...toTarget(it, walls.get(it.wallId)), label: it.kind }));
  const q = QUALITY[P.quality] || QUALITY.medium;
  gfx?.blobs.setSteps(q.steps);
}

const landingTargets = () => landTargets.map((x) => ({ ...x, enabled: x.kind === 'play' ? usable(slots.reel) : hasProjects(ctx()) }));
/** The menu at time t: the blobs where they float now, and the "Back" buttons. */
function menuTargets(t) {
  const moved = blobMotion(menu.blobs, t, vt.walls);
  return [
    ...moved.map((b) => ({ ...toTarget(b, walls.get(b.wallId)), row: b.row, enabled: usable(slots.projects[b.index]) })),
    ...menu.items.filter((i) => i.kind === 'back').map((b) => ({ ...toTarget(b, walls.get(b.wallId)), enabled: true })),
  ];
}
/** The targets a hand can touch now, render px; `enabled` false = drawn off, does not respond. */
const currentTargets = (t) => (S.name === 'landing' ? landingTargets() : S.name === 'menu' ? menuTargets(t) : []);

vt.on('params', (p) => { Object.assign(P, p); dirty = true; });

// ---------------------------------------------------------------------------------------------- graphics

let gfx = null, alive = true;
const labels = new Map();       // key → { tex, w, h } at kMax px per metre
const logo = { blob: null, wordmark: null, imgs: null };

async function loadFonts() {
  try {
    const url = new URL('./assets/fonts/Raleway-VariableFont_wght.ttf', import.meta.url).href;
    const face = new FontFace('Raleway', `url("${url}")`, { weight: '100 900', style: 'normal' });
    await face.load();
    document.fonts.add(face);
  } catch (e) { console.warn('Reel: the Raleway font did not load', e); }
}
async function loadLogo() {
  const load = (f) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL(`../alma-fluid/assets/${f}`, import.meta.url).href; });
  const [blob, wordmark] = await Promise.all([load('logo-blob.png'), load('logo-wordmark.png')]);
  logo.imgs = { blob, wordmark };
}
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
await within(Promise.all([loadFonts(), loadLogo()]), 4000);

function build() {
  const quad = makeQuad(gl);
  const q = QUALITY[P.quality] || QUALITY.medium;
  gfx = { quad, field: makeField(gl, quad, W, H), ui: makeUi(gl, quad, W, H), sprites: makeSprites(gl, quad, W, H), blobs: makeBlobs(gl, quad, W, H, q.steps) };
  logo.blob = logo.imgs?.blob ? textureFrom(gl, logo.imgs.blob) : null;
  logo.wordmark = logo.imgs?.wordmark ? textureFrom(gl, logo.imgs.wordmark) : null;
  labels.clear();
  labelsDirty = true;
}

const FONT_M = 0.1, NAME_M = 0.075, SMALL_M = 0.055; // label sizes, metres
function relabel() {
  labelsDirty = false;
  for (const l of labels.values()) gl.deleteTexture(l.tex);
  labels.clear();
  const k = kMax();
  const make = (key, text, m, maxM, weight = 300) => labels.set(key, textTexture(gl, text, Math.round(m * k), { weight, maxW: maxM * k }));
  make('play', 'Play Reel', FONT_M, BUTTON.w - 0.25);
  make('projects', 'See Projects', FONT_M, BUTTON.w - 0.25);
  make('back', 'Back', SMALL_M + 0.01, 0.5);
  make('hold', 'Hold to exit', SMALL_M, 1.2);
  slots.projects.forEach((c, i) => make(`name${i}`, c?.name || `Project ${i + 1}`, NAME_M, menu.labelW || LABEL_W_M - 0.05, 300));
}

/** A label centred on (x, y) px of a wall of `k` px per metre. */
function label(key, x, y, k, alpha) {
  const l = labels.get(key);
  if (!l || alpha <= 0.001) return;
  const s = k / kMax();
  gfx.sprites.draw(l.tex, x - (l.w * s) / 2, y - (l.h * s) / 2, l.w * s, l.h * s, alpha);
}

/** The logo on a wall: the blob layer and the wordmark over it, each breathing on its own (the website's hero). */
function drawBrand(b, t, alpha) {
  const w = walls.get(b.wallId);
  if (!w || alpha <= 0.001) return;
  const [cx, cy] = toPx(w, b.xm, b.ym);
  const hp = b.hm * (w.rect.h / w.height), s = hp / LOGO.blob.h;
  const ox = LOGO.blob.x + LOGO.blob.w / 2, oy = LOGO.blob.y + LOGO.blob.h / 2;
  // the glow behind the blob (the website's radial purple)
  gfx.ui.draw(cx, cy + hp * 0.02, { r: hp * 0.16, fill: pm([110, 85, 230], 0.32 * alpha), glowR: hp * 0.11, glow: pm([180, 100, 255], 0.3 * alpha) });
  for (const name of ['blob', 'wordmark']) {
    const L = LOGO[name], B = BREATH[name], tex = logo[name];
    const k = s * (1 + B.amp * Math.sin((2 * Math.PI * t) / B.period + B.phase));
    gfx.sprites.draw(tex, cx + (L.x - ox) * k, cy + (L.y - oy) * k, L.w * k, L.h * k, alpha);
  }
}

const smooth = (map, id, target, dt, up, down) => {
  const v = map.get(id) || 0, r = target > v ? up : down;
  const n = v + Math.max(-r * dt, Math.min(r * dt, target - v));
  if (n <= 0.0005 && target <= 0) map.delete(id); else map.set(id, n);
  return n;
};

/** A button (pill): indigo glass, a white outline, its label; a hand on it lights it and runs the ring round it. */
function drawButton(tg, key, t, alpha, dt) {
  const on = tg.enabled !== false, h = hot.get(tg.id);
  const pr = smooth(press, tg.id, h && on ? 1 : 0, dt, 9, 4);
  const isLaunch = launched?.id === tg.id;
  const ring = isLaunch ? 1 : smooth(ringShown, tg.id, h && on ? h.progress : 0, dt, 1e3, 6);
  const k = tg.pxPerM, grow = 1 + 0.035 * pr;
  const pulse = isLaunch ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
  gfx.ui.draw(tg.x, tg.y, {
    r: tg.r * grow, hx: tg.hx * grow,
    fill: on ? pm(pr > 0 ? mixRgb(PALETTE.indigo, PALETTE.violet, pr) : PALETTE.indigo, (0.5 + 0.15 * pr) * alpha) : pm(PALETTE.indigo, 0.16 * alpha),
    line: Math.max(1.5, 0.008 * k), stroke: pm(WHITE, (on ? 0.85 : 0.25) * alpha),
    glowR: 0.06 * k, glow: pm(PALETTE.pink, (on ? 0.12 + 0.35 * pr + 0.2 * pulse : 0) * alpha),
    trackR: 0.03 * k, trackW: Math.max(2, 0.012 * k), track: pm(WHITE, 0.22 * alpha * Math.min(1, pr * 2)), prog: pm(WHITE, alpha), progress: ring,
  });
  label(key, tg.x, tg.y, k, (on ? 1 : 0.35) * alpha);
}

const mixRgb = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

function drawBlob(tg, t, alpha, appear, dt) {
  const on = tg.enabled !== false, h = hot.get(tg.id);
  const pr = smooth(press, tg.id, h && on ? 1 : 0, dt, 7, 3);
  const isLaunch = launched?.id === tg.id;
  const ring = isLaunch ? 1 : smooth(ringShown, tg.id, h && on ? h.progress : 0, dt, 1e3, 6);
  const k = tg.pxPerM, r = tg.r * appear;
  if (r < 0.5) return;
  const copies = [0];
  if (geo.closed) { if (tg.x - r * 1.5 < 0) copies.push(W); if (tg.x + r * 1.5 > W) copies.push(-W); } // across the seam: twice
  for (const dx of copies) gfx.ui.draw(tg.x + dx, tg.y + r * 0.08, { r: r * 0.55, glowR: r * 0.32, glow: pm(PALETTE.violet, (on ? 0.32 : 0.1) * alpha) });
  gfx.blobs.draw(tg.x, tg.y, r, { time: t, seed: 1.7 + tg.index * 7.31, press: pr, hand: h ? [h.x, h.y] : null, alpha, dim: on ? 0 : 1, scale: 1 }, copies);
  if (ring > 0.001 || pr > 0.01) {
    for (const dx of copies) gfx.ui.draw(tg.x + dx, tg.y, { r: r * 1.22, trackR: 0, trackW: Math.max(2, 0.012 * k), track: pm(WHITE, 0.25 * alpha * Math.min(1, pr * 2)), prog: pm(WHITE, alpha), progress: ring, glowR: isLaunch ? 0.05 * k : 0, glow: pm(PALETTE.pink, 0.3 * alpha) });
  }
  const above = tg.row === 1, gap = 0.06 * k, l = labels.get(`name${tg.index}`), lh = l ? (l.h * k) / kMax() : 0;
  const ly = above ? tg.y - tg.r * 1.25 - gap - lh * 0.25 : tg.y + tg.r * 1.25 + gap + lh * 0.25;
  for (const dx of copies) label(`name${tg.index}`, tg.x + dx, ly, k, (on ? 1 : 0.4) * alpha * appear);
}

/** The hands on the walls, softly (the room sees you): a small glow under each. */
function drawHands(alpha) {
  if (alpha <= 0.001) return;
  for (const hd of hands) {
    if (hd.ended) continue;
    const k = walls.get(hd.wallId)?.pxPerM || kMax();
    gfx.ui.draw(hd.x, hd.y, { r: 0.035 * k, fill: pm(WHITE, 0.4 * alpha), glowR: 0.05 * k, glow: pm(WHITE, 0.25 * alpha) });
  }
}

/** Hold-to-exit: a ring fills under a hand held still; "Hold to exit" under it once it has started. */
function drawRings() {
  for (const rg of rings) {
    if (rg.progress < 0.06) continue;
    const hd = hands.find((x) => (x.stroke ?? x.id) === rg.stroke);
    const k = walls.get(hd?.wallId)?.pxPerM || kMax();
    const a = Math.min(1, (rg.progress - 0.06) * 8);
    gfx.ui.draw(rg.x, rg.y, { r: 0.12 * k, fill: pm([0, 0, 0], 0.22 * a), trackR: 0, trackW: Math.max(3, 0.016 * k), track: pm(WHITE, 0.3 * a), prog: pm(WHITE, a), progress: rg.progress });
    label('hold', rg.x, rg.y + 0.21 * k, k, a);
  }
}

// ---------------------------------------------------------------------------------------------- the frame

const playingNow = () => (S.name === 'reel' || S.name === 'project') && S.phase === 'playing';
const approach = (v, target, dt) => v + Math.max(-dt / FADE_S, Math.min(dt / FADE_S, target - v));

function frame(dtRaw) {
  if (!alive || !gfx) return;
  const dt = Math.min(Math.max(dtRaw, 0), 0.1);
  clock += dt * 1000;
  const t = clock / 1000;
  if (dirty || laidOut !== vt.walls) apply();
  if (labelsDirty) relabel();
  hands = vt.hands();
  if (hands.length) dispatch({ type: 'touch' });
  dispatch({ type: 'tick' });

  // what a hand does now: dwell on the landing / menu targets; hold-to-exit during a video
  const lt = landingTargets(), mt = menuTargets(t);
  const targets = S.name === 'landing' ? lt : S.name === 'menu' ? mt : [];
  if (S.name === 'landing' || S.name === 'menu') {
    const r = dwell.step(targets, hands, dt * 1000, geo);
    hot = r.hot;
    if (r.fired) {
      const before = S;
      hooks.hits.push(r.fired.id);
      dispatch({ type: 'hit', target: { kind: r.fired.kind, index: r.fired.index } });
      launched = S !== before && S.phase === 'starting' ? { id: r.fired.id, at: t } : null; // the button / blob that launched a video
    }
  } else hot = new Map();
  if (playingNow() && P.holdToExit !== false) {
    const r = hold.step(hands, dt * 1000, (id) => walls.get(id)?.pxPerM || kMax(), geo);
    rings = r.rings;
    if (r.fired) dispatch({ type: 'hold' });
  } else rings = [];

  // scene fades
  vis.scene = approach(vis.scene, playingNow() ? 0 : 1, dt);
  vis.landing = approach(vis.landing, S.name === 'landing' || (S.name === 'reel' && S.phase === 'starting') ? 1 : 0, dt);
  vis.menu = approach(vis.menu, S.name === 'menu' || (S.name === 'project' && S.phase === 'starting') ? 1 : 0, dt);
  const sa = ease(vis.scene), la = ease(vis.landing) * sa, ma = ease(vis.menu) * sa;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const q = QUALITY[P.quality] || QUALITY.medium;
  if (sa > 0.001) gfx.field.draw(t, sa, { scale: q.field, wrap: geo.closed });
  if (la > 0.001) {
    for (const b of land.brands) drawBrand(b, t, la);
    for (const tg of lt) drawButton(tg, tg.kind, t, la, dt);
  }
  if (ma > 0.001) {
    const n = Math.max(1, slots.projects.length);
    for (const tg of mt) {
      if (tg.kind === 'back') drawButton(tg, 'back', t, ma, dt);
      else drawBlob(tg, t, ma, ease(Math.min(1, Math.max(0, vis.menu * 1.35 - 0.35 * (tg.index / n)))), dt);
    }
  }
  drawHands(Math.max(la, ma) * 0.9);
  drawRings();
  if (!hooks.ready && labels.size) hooks.ready = true;
}

// ---------------------------------------------------------------------------------------------- context loss

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; gfx = null; });
canvas.addEventListener('webglcontextrestored', () => { build(); dirty = true; alive = true; });

build();
apply();
if (usable(slots.reel)) act({ do: 'preload', clipIds: [slots.reel.id] });
vt.loop(frame, gl);
