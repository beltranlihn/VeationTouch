// Alma liquid — Alma Digital Studio's interactive liquid for the room.
// The website's fluid (fluid.js) across the whole projection strip; every touch stirs it; the logo sits on one wall.
// Input and output both come from the VEATION Touch runtime (/experiences/runtime.js): touches in, one canvas out.
import { connectExperience } from '/experiences/runtime.js';
import { createFluid as createFluidGL, CONFIG, generateColor, buildEmitters, updateAutoEmitters, emitterCount, EMITTER_SIGMA } from './fluid.js';
import { createLogo as createLogoGL } from './logo.js';
import { createFluid as createFluidGPU, hasWebGPU, requestGpu } from './fluid-webgpu.js';
import { createLogo as createLogoGPU } from './logo-webgpu.js';

const vt = await connectExperience();

const W = vt.size.width, H = vt.size.height, ASPECT = W / H;
const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
canvas.className = vt.fit === 'stretch' ? 'stretch' : 'fit';

// dye = the liquid's short side in px, sim = the velocity/pressure grid's; ultra simulates the liquid at the output's own resolution
const QUALITY = { low: { dye: 384 }, medium: { dye: 512 }, high: { dye: 768 }, ultra: { dye: H, sim: 256 } };
const qualityOf = (name) => { const q = QUALITY[name] || QUALITY.medium; return { dye: q.dye, sim: q.sim || CONFIG.SIM_RESOLUTION }; };
// the fixed touch colours (the website's palette entries)
const TOUCH_COLORS = {
  indigo: { r: 53, g: 48, b: 160 },
  purple: { r: 154, g: 62, b: 199 },
  periwinkle: { r: 130, g: 130, b: 255 },
  pink: { r: 222, g: 121, b: 255 },
};

// ---- a hand on a wall is the website's pointer (Fluid Lab: updatePointerMoveData + splatPointer), with its values ----
// The website splats once per pointer event (at most every 33 ms) at the pointer, with the move since the previous one
// in units of its screen's width x SPLAT_FORCE, in the pointer's own colour (picked when it goes down, kept for the whole
// stroke) x POINTER_INTENSITY, at the splat size it was tuned on. Here each wall is that screen: its height is the
// screen's height and its width the 16:9 width of that height, so a hand on a wall stirs as a finger on the website.
const POINTER_EVERY = 0.033;   // s between a pointer's splats (the website's mousemove cap)
const BREATH_PERIOD = 9;       // s

const P = Object.assign({}, vt.params);
let fluid = null, logo = null, alive = true;
let emitters = [];
let clock = 0, logoAlpha = 0;
let dirty = true, wantQuality = null, needWarm = true;
let logoCx = W / 2, logoCy = H / 2, logoWallW = W, logoWallH = H;
const scratch = new Float32Array(3);
const active = [];            // touches currently down (objects, created on 'down')
const byId = new Map();

// reload() is a hook so that a test can see the page asking for it
const hooks = (window.__almaFluid = {
  ready: false, renderer: 'webgl2', gpu: null, reload: () => location.reload(),
  get fluid() { return fluid; }, get emitterCount() { return emitters.length; },
});

// The renderer: WebGPU when asked for (or Automatic) and the machine has it, else WebGL2. A canvas keeps the kind of context it
// first gets, so this is decided once per page; a change of the parameter reloads the page (like `wrap`).
let gpu = null, gl = null;
let gpuAvailable = false;
if (P.renderer !== 'webgl2') {
  gpu = await requestGpu(canvas);
  gpuAvailable = !!gpu;
  if (!gpu && P.renderer === 'webgpu') console.warn('Alma liquid: WebGPU is not available here, using WebGL2');
} else {
  gpuAvailable = await hasWebGPU();
}
if (!gpu) {
  gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) {
    document.body.textContent = 'WebGL2 is not available on this machine.';
    throw new Error('WebGL2 is not available');
  }
}
const backend = gpu ? 'webgpu' : 'webgl2';
hooks.renderer = backend;
hooks.gpu = gpu;
const wantBackend = () => (P.renderer === 'webgl2' ? 'webgl2' : gpuAvailable ? 'webgpu' : 'webgl2');

// 360°: the strip is a loop when the room's walls close it (Automatic), or when the operator says so (On)
const wrapOn = () => P.wrap === 'on' || (P.wrap !== 'off' && !!vt.closedLoop);
let builtWrap = false;

function build() {
  builtWrap = wrapOn();
  const q = qualityOf(P.quality);
  const opts = { width: W, height: H, wrapX: builtWrap, dyeShort: q.dye, simShort: q.sim };
  fluid = gpu ? createFluidGPU(gpu, opts) : createFluidGL(gl, opts);
  logo = (gpu ? createLogoGPU : createLogoGL)(gpu || gl, new URL('./assets/', import.meta.url).href);
  logo.ready.then(() => { hooks.ready = true; }, (e) => { console.warn('Alma liquid: logo not loaded', e); hooks.ready = true; });
  const img = new Image();
  const mine = fluid;
  img.onload = () => { if (fluid === mine && alive) fluid.setDither(img); };
  img.src = new URL('./assets/LDR_LLL1_0.png', import.meta.url).href;
  wantQuality = `${q.dye}/${q.sim}`;
  needWarm = true;
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
  if (fluid && (wrapOn() !== builtWrap || wantBackend() !== backend)) { hooks.reload(); return; } // wrap mode and context kind are set when they are made
  const q = qualityOf(P.quality), key = `${q.dye}/${q.sim}`;
  if (fluid && key !== wantQuality) { wantQuality = key; fluid.setQuality(q.dye, q.sim); }
  // `emitters` is the count for one 16:9 screen (the website's density); a strip gets as many as its width holds
  emitters = buildEmitters(emitterCount(P.emitters, ASPECT), ASPECT, emitters);
  const r = wallRect();
  logoCx = r.x + r.w / 2; logoCy = r.y + r.h / 2; logoWallW = r.w; logoWallH = r.h;
}

vt.on('params', (p) => { Object.assign(P, p); dirty = true; });

/* ---------------------------------------------------------------- touches */

function touchColor(t) {
  t.base = TOUCH_COLORS[P.touchColor] || null; // null = the whole palette
}

/** A hand goes down: the website's updatePointerDownData — no splat yet, and one colour for the whole stroke. */
function startTouch(e) {
  let t = byId.get(e.id);
  if (!t) {
    t = { id: e.id, x: 0, y: 0, px: 0, py: 0, lastSplat: 0, base: null, color: [0, 0, 0] };
    byId.set(e.id, t);
    active.push(t);
  }
  t.x = t.px = e.x; t.y = t.py = e.y;
  t.lastSplat = clock;
  touchColor(t);
  generateColor(t.color, t.base);
  return t;
}

vt.on('touch', (e) => {
  if (e.type === 'down') startTouch(e);
  else if (e.type === 'move') {
    const t = byId.get(e.id) || startTouch(e);
    t.x = e.x; t.y = e.y;
  } else if (e.type === 'up') {
    const t = byId.get(e.id);
    if (t) { byId.delete(e.id); active.splice(active.indexOf(t), 1); }
  }
});

/** The website's splatPointer, at most every 33 ms per hand: the move since its last splat, at the hand. */
function stir(t) {
  if (clock - t.lastSplat < POINTER_EVERY) return;
  // 360°: crossing the seam (last wall → first) is a short step, not a stroke across the whole strip
  let ddx = t.x - t.px;
  if (builtWrap) { if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W; }
  const ddy = t.y - t.py;
  if (ddx === 0 && ddy === 0) return; // the website only splats when the pointer moved
  const screenW = H * CONFIG.REF_ASPECT; // the wall as the website's screen
  const k = (CONFIG.SPLAT_FORCE * (P.turbulence == null ? 1 : P.turbulence)) / screenW;
  let x = t.x / W;
  if (builtWrap) x -= Math.floor(x);
  const c = CONFIG.POINTER_INTENSITY;
  fluid.splat(x, 1 - t.y / H, ddx * k, -ddy * k, t.color[0] * c, t.color[1] * c, t.color[2] * c, EMITTER_SIGMA);
  t.px = t.x; t.py = t.y; t.lastSplat = clock;
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
    if (!byId.has(list[j].id)) startTouch(list[j]);
  }
}

/* ---------------------------------------------------------------- the frame */

// the ambient wash the emitters keep up, as set by the operator
const look = { ambience: 1, size: 1 };

// The piece must never open on an empty room: run a few seconds of the emitters before the first picture
function warmUp() {
  needWarm = false;
  if (!emitters.length || P.ambience <= 0) return;
  const step = 1 / 20;
  for (let i = 0; i < 60; i++) { // 3 s
    clock += step;
    updateAutoEmitters(emitters, step, clock, P.emitterSpeed, ASPECT, builtWrap, emit, look);
    fluid.step(step, P.fade, CONFIG.VELOCITY_DISSIPATION);
  }
}

function frame(dtRaw) {
  if (!alive || !fluid) return;
  const dt = Math.min(Math.max(dtRaw, 0), 1 / 30);
  clock += dt;
  if (dirty) applyParams();
  look.ambience = P.ambience == null ? 1 : P.ambience;
  look.size = P.emitterSize == null ? 1 : P.emitterSize;
  if (needWarm) warmUp();

  updateAutoEmitters(emitters, dt, clock, P.emitterSpeed, ASPECT, builtWrap, emit, look);
  for (let i = 0; i < active.length; i++) stir(active[i]);
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

// A lost WebGPU device (driver reset, GPU removed): ask for a new one and rebuild; if none comes, reload the page
function watchDevice() {
  const device = gpu.device;
  device.lost.then(async () => {
    if (device !== gpu.device) return;
    alive = false; fluid = null; logo = null;
    for (let k = 0; k < 5; k++) {
      const next = await requestGpu(canvas);
      if (next) {
        gpu = next; hooks.gpu = next;
        build();
        applyParams();
        logoAlpha = 0;
        alive = true;
        watchDevice();
        return;
      }
      await new Promise((r) => setTimeout(r, 500 * (k + 1)));
    }
    hooks.reload();
  });
}
if (gpu) watchDevice();

build();
applyParams();
vt.loop(frame, gpu ? canvas : gl); // the runtime takes either: a WebGL context or the (WebGPU) canvas
