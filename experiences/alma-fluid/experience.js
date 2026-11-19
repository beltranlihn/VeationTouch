// Alma liquid — Alma Digital Studio's interactive liquid for the room.
// The website's fluid (fluid.js) across the whole projection strip; every touch stirs it; the logo sits on one wall.
// Input and output both come from the VEATION Touch runtime (/experiences/runtime.js): touches in, one canvas out.
import { connectExperience } from '/experiences/runtime.js';
import { createFluid, CONFIG, PALETTE, generateColor, buildEmitters, updateAutoEmitters } from './fluid.js';
import { createLogo } from './logo.js';

const vt = await connectExperience();

const W = vt.size.width, H = vt.size.height, ASPECT = W / H;
const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
canvas.className = vt.fit === 'stretch' ? 'stretch' : 'fit';

const QUALITY = { low: 384, medium: 512, high: 768 };
// the fixed touch colours (the website's palette entries)
const TOUCH_COLORS = {
  indigo: { r: 53, g: 48, b: 160 },
  purple: { r: 154, g: 62, b: 199 },
  periwinkle: { r: 130, g: 130, b: 255 },
  pink: { r: 222, g: 121, b: 255 },
};

// ---- tuning of how touches stir the liquid (units: canvas heights, simulation texels/s) ----
const BURST_SPEED = 90;        // tangential speed of a vortex burst at Turbulence 1
const BURST_DYE = 3;           // a burst splat's dye relative to the website's pointer colour
const SWIRL_PERIOD = 0.6;      // s between the swirls of a held-still touch
const STILL_AFTER = 0.15;      // s without movement before a touch counts as held still
const BREATH_PERIOD = 9;       // s

const P = Object.assign({}, vt.params);
let fluid = null, logo = null, alive = true;
let emitters = [];
let clock = 0, logoAlpha = 0;
let dirty = true, wantQuality = null;
let logoCx = W / 2, logoCy = H / 2, logoWallW = W, logoWallH = H;
const scratch = new Float32Array(3);
const active = [];            // touches currently down (objects, created on 'down')
const byId = new Map();

const hooks = (window.__almaFluid = { ready: false });

const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
if (!gl) {
  document.body.textContent = 'WebGL2 is not available on this machine.';
  throw new Error('WebGL2 is not available');
}

// 360°: the strip is a loop when the room's walls close it (Automatic), or when the operator says so (On)
const wrapOn = () => P.wrap === 'on' || (P.wrap !== 'off' && !!vt.closedLoop);
let builtWrap = false;

function build() {
  builtWrap = wrapOn();
  fluid = createFluid(gl, { width: W, height: H, wrapX: builtWrap, dyeShort: QUALITY[P.quality] || 512 });
  logo = createLogo(gl, new URL('./assets/', import.meta.url).href);
  logo.ready.then(() => { hooks.ready = true; }, (e) => { console.warn('Alma liquid: logo not loaded', e); hooks.ready = true; });
  const img = new Image();
  img.onload = () => { if (fluid && alive) fluid.setDither(img); };
  img.src = new URL('./assets/LDR_LLL1_0.png', import.meta.url).href;
  wantQuality = QUALITY[P.quality] || 512;
}

// one splat function for the emitters (the fluid can be rebuilt, so look it up at call time)
const emit = (x, y, dx, dy, r, g, b, sigma) => fluid.splat(x, y, dx, dy, r, g, b, sigma);

/* ---------------------------------------------------------------- parameters */

function wallRect() {
  const walls = vt.walls || [];
  const id = P.logoWall;
  let w = null;
  if (id != null) for (let i = 0; i < walls.length; i++) if (walls[i].id === id) { w = walls[i]; break; }
  if (!w) w = walls[0];
  return w ? w.rect : { x: 0, y: 0, w: W, h: H };
}

function applyParams() {
  dirty = false;
  if (fluid && wrapOn() !== builtWrap) { location.reload(); return; } // the textures' wrap mode is set when they are made
  const q = QUALITY[P.quality] || 512;
  if (fluid && q !== wantQuality) { wantQuality = q; fluid.setQuality(q); }
  emitters = buildEmitters(P.emitters, ASPECT, emitters);
  const r = wallRect();
  logoCx = r.x + r.w / 2; logoCy = r.y + r.h / 2; logoWallW = r.w; logoWallH = r.h;
}

vt.on('params', (p) => { Object.assign(P, p); dirty = true; });

/* ---------------------------------------------------------------- touches */

function touchColor(t) {
  t.base = TOUCH_COLORS[P.touchColor] || null; // null = the whole palette
}

function startTouch(e) {
  let t = byId.get(e.id);
  if (!t) {
    t = { id: e.id, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, size: 0, sigma: 0.06, dir: Math.random() < 0.5 ? -1 : 1,
      burst: false, moved: false, lastMove: 0, lastSwirl: 0, lastSplat: 0, base: null };
    byId.set(e.id, t);
    active.push(t);
  }
  t.x = t.px = e.x; t.y = t.py = e.y;
  t.vx = t.vy = 0;
  setSize(t, e.size);
  t.lastMove = t.lastSwirl = t.lastSplat = clock;
  touchColor(t);
  return t;
}
function setSize(t, size) {
  t.size = size || 0;
  t.sigma = Math.min(0.2, Math.max(0.04, 0.05 + 0.5 * t.size / H));
}

vt.on('touch', (e) => {
  if (e.type === 'down') {
    const t = startTouch(e);
    t.burst = true;
  } else if (e.type === 'move') {
    const t = byId.get(e.id) || startTouch(e);
    t.x = e.x; t.y = e.y; t.vx = e.vx || 0; t.vy = e.vy || 0;
    setSize(t, e.size);
    t.moved = true;
    t.lastMove = clock;
  } else if (e.type === 'up') {
    const t = byId.get(e.id);
    if (t) { byId.delete(e.id); active.splice(active.indexOf(t), 1); }
  }
});

// a ring of small splats around the touch with tangential velocity: a vortex
function ring(t, n, speed, dye, sigmaScale, radiusScale) {
  const turb = P.turbulence;
  const dyeGain = Math.min(1.5, 0.4 + 0.6 * turb) * dye;
  const cx = t.x / W, cy = 1 - t.y / H;
  const ringR = t.sigma * radiusScale;
  const phase = Math.random() * Math.PI * 2;
  const vel = speed * turb * t.dir;
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    generateColor(scratch, t.base);
    fluid.splat(cx + c * ringR / ASPECT, cy + s * ringR, -s * vel, c * vel,
      scratch[0] * dyeGain, scratch[1] * dyeGain, scratch[2] * dyeGain, t.sigma * sigmaScale);
  }
}

function stir(t, dt) {
  const turb = P.turbulence;
  if (t.burst) { t.burst = false; ring(t, 9, BURST_SPEED, BURST_DYE, 0.55, 1.0); t.lastSplat = clock; }
  if (t.moved) {
    t.moved = false;
    // 360°: crossing the seam (last wall → first) is a short step, not a stroke across the whole strip
    let ddx = t.x - t.px;
    if (builtWrap) { if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W; }
    const dist = Math.hypot(ddx, t.y - t.py) / H; // canvas heights
    const n = Math.max(1, Math.min(8, Math.ceil(dist / (t.sigma * 0.7))));
    const span = Math.min(0.05, Math.max(dt, clock - t.lastSplat));
    let vx = t.vx, vy = t.vy;
    if (vx === 0 && vy === 0) { vx = ddx / span; vy = (t.y - t.py) / span; }
    // the website: pointer delta (canvas heights per frame) x SPLAT_FORCE
    const k = (span * CONFIG.SPLAT_FORCE * turb) / (H * n);
    const dx = Math.max(-400, Math.min(400, vx * k)), dy = Math.max(-400, Math.min(400, -vy * k));
    const dyeGain = Math.min(1.5, 0.4 + 0.6 * turb) * CONFIG.POINTER_INTENSITY / n;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      let x = (t.px + ddx * f) / W;
      if (builtWrap) x -= Math.floor(x); // back into [0, 1) on the other side of the seam
      const y = 1 - (t.py + (t.y - t.py) * f) / H;
      generateColor(scratch, t.base);
      fluid.splat(x, y, dx, dy, scratch[0] * dyeGain, scratch[1] * dyeGain, scratch[2] * dyeGain, t.sigma);
    }
    t.px = t.x; t.py = t.y; t.lastSplat = clock;
  } else if (clock - t.lastMove > STILL_AFTER && clock - t.lastSwirl > SWIRL_PERIOD && turb > 0) {
    t.lastSwirl = clock;
    ring(t, 4, BURST_SPEED * 0.3, BURST_DYE * 0.5, 0.5, 0.6); // held still: a gentle swirl
  }
}

// the runtime is the truth about what is down: drop a touch whose 'up' got lost, pick up one whose 'down' did
let reconcileIn = 0;
function reconcile() {
  const list = vt.touches();
  for (let i = active.length - 1; i >= 0; i--) {
    let found = false;
    for (let j = 0; j < list.length; j++) if (list[j].id === active[i].id) { found = true; break; }
    if (!found) { byId.delete(active[i].id); active.splice(i, 1); }
  }
  for (let j = 0; j < list.length; j++) {
    if (!byId.has(list[j].id)) { const t = startTouch(list[j]); t.burst = true; }
  }
}

/* ---------------------------------------------------------------- the frame */

function frame(dtRaw) {
  if (!alive || !fluid) return;
  const dt = Math.min(Math.max(dtRaw, 0), 1 / 30);
  clock += dt;
  if (dirty) applyParams();

  updateAutoEmitters(emitters, dt, clock, P.emitterSpeed, ASPECT, builtWrap, emit);
  for (let i = 0; i < active.length; i++) stir(active[i], dt);
  if ((reconcileIn -= dt) <= 0) { reconcileIn = 0.5; reconcile(); }

  fluid.step(dt, P.fade, CONFIG.VELOCITY_DISSIPATION);
  fluid.render();

  // the logo: fades in (and out when switched off), optionally breathes
  const target = P.logo ? 1 : 0;
  logoAlpha += Math.max(-dt / 1.2, Math.min(dt / 3, target - logoAlpha));
  if (logoAlpha > 0.001) {
    const b = Math.max(0, Math.min(1, (P.breathing || 0) / 100));
    const phase = Math.sin((clock / BREATH_PERIOD) * Math.PI * 2);
    const targetH = logoWallH * Math.max(0.01, (P.logoSize || 38) / 100);
    logo.draw(W, H, logoCx, logoCy, targetH, logoWallW * 0.94, 1 + 0.02 * b * phase, logoAlpha * (1 - 0.18 * b * (0.5 - 0.5 * phase)), P.logoStyle === 'blob');
  }
}

/* ---------------------------------------------------------------- context loss */

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; fluid = null; logo = null; });
canvas.addEventListener('webglcontextrestored', () => {
  build();
  applyParams();
  logoAlpha = 0; // fades back in
  alive = true;
});

build();
applyParams();
vt.loop(frame, gl);
