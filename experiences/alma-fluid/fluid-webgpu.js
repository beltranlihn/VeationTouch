/* ------------------------------------------------------------
   Alma liquid on WebGPU — the same fluid as fluid.js (the website's fork of PavelDoGreat/WebGL-Fluid-Simulation, MIT,
   see LICENSE-fluid.txt), ported to WGSL render passes.

   Same API and behaviour as createFluid in fluid.js: splat (additive, the distance wraps across the seam when wrapX),
   step (curl/vorticity only when CONFIG.CURL > 0, divergence, pressure with Jacobi iterations, gradient subtract,
   advection of velocity and dye), render (the website's background colour + dye + dither), setQuality, setDither, clear,
   dispose. CONFIG, PALETTE, emitters and generateColor are fluid.js's: nothing is duplicated here.

   Differences that come with the API (none is visible in the picture):
   - Textures are rgba16float / rg16float / r16float; linear filtering where the WebGL2 version is linear, nearest where it
     is nearest; the u axis REPEATs when wrapX (clamp otherwise), v always clamps.
   - Splats are not drawn one by one: they are queued and drawn together, as instanced quads with additive blending, at the
     start of the next step() / render(). The result is the same sum, with two render passes per frame instead of two per splat.
   - Row 0 of every texture is simulation y = 0 (WebGL's bottom row). Only the display flips it, so the picture is upright.
   - Every public call that touches the GPU submits once: a frame is step() + render(). The canvas is presented once, when
     the frame's task ends.
   ------------------------------------------------------------ */

import { CONFIG } from './fluid.js';

const USAGE_RT = 0x10 | 0x04 | 0x02; // RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_DST (GPUTextureUsage values)

/** True when the browser has a WebGPU adapter (nothing is allocated). */
export async function hasWebGPU() {
  try { return !!(typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

/**
 * Adapter, device and the canvas's context (configured opaque, in the preferred format), or null when WebGPU is not
 * available. Errors the device reports are logged, so a broken shader is not silent.
 */
export async function requestGpu(canvas) {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const maxTex = Math.min(adapter.limits.maxTextureDimension2D, 16384);
    const device = await adapter.requestDevice({ requiredLimits: { maxTextureDimension2D: maxTex } });
    const context = canvas.getContext('webgpu');
    if (!context) { device.destroy(); return null; }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    device.onuncapturederror = (e) => console.error(`WebGPU: ${e.error?.message || e.error}`);
    return { adapter, device, context, format };
  } catch (e) {
    console.warn('WebGPU could not start:', e);
    return null;
  }
}

/* ------------------------------------------------------------ shaders (the website's maths, in WGSL) */

// One uniform struct for every pass. invSize: 1 / size of the target; texel: 1 / size of the simulation grid.
const HEAD = `
struct U { invSize: vec2f, texel: vec2f, a: f32, b: f32, c: f32, d: f32, color: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
const BIND2 = `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var t: texture_2d<f32>;
`;
const UV = 'let uv = fp.xy * u.invSize;';

// copy / clear: value * texture
const COPY = HEAD + BIND2 + `
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  return textureSampleLevel(t, s, uv, 0.0) * u.a;
}`;

// advection: u.a = dt, u.b = dissipation, u.texel = the velocity grid's texel
const ADVECTION = HEAD + `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var src: texture_2d<f32>;
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let coord = uv - u.a * textureSampleLevel(vel, s, uv, 0.0).xy * u.texel;
  let result = textureSampleLevel(src, s, coord, 0.0);
  return result / (1.0 + u.b * u.a);
}`;

const divergenceSource = (wrapX) => HEAD + BIND2 + `
const WRAP_X: bool = ${wrapX};
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let uL = uv - vec2f(u.texel.x, 0.0);
  let uR = uv + vec2f(u.texel.x, 0.0);
  let uT = uv + vec2f(0.0, u.texel.y);
  let uB = uv - vec2f(0.0, u.texel.y);
  var L = textureSampleLevel(t, s, uL, 0.0).x;
  var R = textureSampleLevel(t, s, uR, 0.0).x;
  var T = textureSampleLevel(t, s, uT, 0.0).y;
  var B = textureSampleLevel(t, s, uB, 0.0).y;
  let C = textureSampleLevel(t, s, uv, 0.0).xy;
  if (!WRAP_X) {
    if (uL.x < 0.0) { L = -C.x; }
    if (uR.x > 1.0) { R = -C.x; }
  }
  if (uT.y > 1.0) { T = -C.y; }
  if (uB.y < 0.0) { B = -C.y; }
  return vec4f(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL = HEAD + BIND2 + `
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let L = textureSampleLevel(t, s, uv - vec2f(u.texel.x, 0.0), 0.0).y;
  let R = textureSampleLevel(t, s, uv + vec2f(u.texel.x, 0.0), 0.0).y;
  let T = textureSampleLevel(t, s, uv + vec2f(0.0, u.texel.y), 0.0).x;
  let B = textureSampleLevel(t, s, uv - vec2f(0.0, u.texel.y), 0.0).x;
  return vec4f(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

// u.a = curl strength, u.b = dt
const VORTICITY = HEAD + `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var crl: texture_2d<f32>;
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let L = textureSampleLevel(crl, s, uv - vec2f(u.texel.x, 0.0), 0.0).x;
  let R = textureSampleLevel(crl, s, uv + vec2f(u.texel.x, 0.0), 0.0).x;
  let T = textureSampleLevel(crl, s, uv + vec2f(0.0, u.texel.y), 0.0).x;
  let B = textureSampleLevel(crl, s, uv - vec2f(0.0, u.texel.y), 0.0).x;
  let C = textureSampleLevel(crl, s, uv, 0.0).x;
  var force = 0.5 * vec2f(abs(T) - abs(B), abs(R) - abs(L));
  force = force / (length(force) + 0.0001);
  force = force * (u.a * C);
  force.y = -force.y;
  var velocity = textureSampleLevel(vel, s, uv, 0.0).xy + force * u.b;
  velocity = min(max(velocity, vec2f(-1000.0)), vec2f(1000.0));
  return vec4f(velocity, 0.0, 1.0);
}`;

const PRESSURE = HEAD + `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var pres: texture_2d<f32>;
@group(0) @binding(3) var div: texture_2d<f32>;
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let L = textureSampleLevel(pres, s, uv - vec2f(u.texel.x, 0.0), 0.0).x;
  let R = textureSampleLevel(pres, s, uv + vec2f(u.texel.x, 0.0), 0.0).x;
  let T = textureSampleLevel(pres, s, uv + vec2f(0.0, u.texel.y), 0.0).x;
  let B = textureSampleLevel(pres, s, uv - vec2f(0.0, u.texel.y), 0.0).x;
  let divergence = textureSampleLevel(div, s, uv, 0.0).x;
  return vec4f((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = HEAD + `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var pres: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  ${UV}
  let L = textureSampleLevel(pres, s, uv - vec2f(u.texel.x, 0.0), 0.0).x;
  let R = textureSampleLevel(pres, s, uv + vec2f(u.texel.x, 0.0), 0.0).x;
  let T = textureSampleLevel(pres, s, uv + vec2f(0.0, u.texel.y), 0.0).x;
  let B = textureSampleLevel(pres, s, uv - vec2f(0.0, u.texel.y), 0.0).x;
  let velocity = textureSampleLevel(vel, s, uv, 0.0).xy - vec2f(R - L, T - B);
  return vec4f(velocity, 0.0, 1.0);
}`;

// display: u.color.rgb = the background, u.texel = the dithering texture's tiling. The picture is flipped upright here.
const DISPLAY = HEAD + `
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var sd: sampler;
@group(0) @binding(4) var dith: texture_2d<f32>;
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let uv = vec2f(fp.x * u.invSize.x, 1.0 - fp.y * u.invSize.y);
  let c = textureSampleLevel(dye, s, uv, 0.0).rgb;
  let a = max(c.r, max(c.g, c.b));
  let noise = textureSampleLevel(dith, sd, uv * u.texel, 0.0).r * 2.0 - 1.0;
  return vec4f(c + u.color.rgb * (1.0 - a) + noise / 255.0, 1.0);
}`;

// splats: one record of four vec4 per splat — [point.xy, radius, _], [quad centre.xy, quad half size.xy], [velocity xyz, _],
// [dye rgb, _]. With wrapX every splat is drawn three times (shifted by -1, 0, +1 in u) and the fragment measures the
// distance the short way round the seam; copies outside the target are clipped away.
const splatSource = (wrapX, channel) => `
struct U { invSize: vec2f, texel: vec2f, a: f32, b: f32, c: f32, d: f32, color: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> S: array<vec4f>;
const WRAP_X: bool = ${wrapX};
const COPIES: u32 = ${wrapX ? 3 : 1}u;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) pr: vec4f,
  @location(1) @interpolate(flat) col: vec3f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let si = ii / COPIES;
  let copy = ii % COPIES;
  let a = S[si * 4u];
  let b = S[si * 4u + 1u];
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  var shift = 0.0;
  if (COPIES == 3u) { shift = f32(copy) - 1.0; }
  let uv = vec2f(b.x + shift + corner.x * b.z, b.y + corner.y * b.w);
  var o: VOut;
  o.pos = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  o.pr = a;
  o.col = S[si * 4u + ${channel}u].xyz;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let uv = v.pos.xy * u.invSize;
  var p = uv - v.pr.xy;
  if (WRAP_X) { p.x = p.x - floor(p.x + 0.5); }
  p.x = p.x * u.a;
  return vec4f(exp(-dot(p, p) / v.pr.z) * v.col, 0.0);
}`;

/* ------------------------------------------------------------ the fluid */

const SLOT = { DIV: 0, CLEARP: 1, PRESSURE: 2, GRADIENT: 3, ADV_V: 4, ADV_D: 5, CURL: 6, VORT: 7, DISPLAY: 8, COPY: 9, SPLAT_V: 10, SPLAT_D: 11, COUNT: 12 };
const SPLAT_CAP = 1024; // splats per batch; more are drawn in a batch of their own

/**
 * @param gpu   { device, context, format } from requestGpu (the canvas is exactly the render size)
 * @param opts  { width, height (canvas px), wrapX (bool), dyeShort (dye short side, px), simShort (simulation short side, default CONFIG.SIM_RESOLUTION) }
 */
export function createFluid(gpu, opts) {
  const { device, context } = gpu;
  const queue = device.queue;
  const wrapX = !!opts.wrapX;
  const W = opts.width, H = opts.height;
  const aspect = W / H;

  // ---- samplers (the u axis repeats when the strip is a loop) ----
  const addrU = wrapX ? 'repeat' : 'clamp-to-edge';
  const sLinear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: addrU, addressModeV: 'clamp-to-edge' });
  const sNearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest', addressModeU: addrU, addressModeV: 'clamp-to-edge' });
  const sDither = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });

  // ---- uniforms: one buffer, one 256-aligned slot per pass kind, written whole once per step ----
  const UB = device.limits.minUniformBufferOffsetAlignment || 256;
  const SF = UB / 4; // floats per slot
  const ublock = new Float32Array(SF * SLOT.COUNT);
  const ubuf = device.createBuffer({ size: UB * SLOT.COUNT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const setU = (slot, iw, ih, tx, ty, a = 0, b = 0, c = 0, d = 0, r = 0, g = 0, bl = 0) => {
    ublock.set([iw, ih, tx, ty, a, b, c, d, r, g, bl, 0], slot * SF);
  };
  const uEntry = (slot) => ({ binding: 0, resource: { buffer: ubuf, offset: slot * UB, size: 48 } });

  // ---- pipelines ----
  const mod = (code) => device.createShaderModule({ code });
  const RGBA = 'rgba16float', RG = 'rg16float', R = 'r16float';
  const fullscreen = (code, format) => device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: code, entryPoint: 'vs' },
    fragment: { module: code, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const mCopy = mod(COPY), mAdv = mod(ADVECTION), mCurl = mod(CURL), mVort = mod(VORTICITY);
  const PL = {
    copyRGBA: fullscreen(mCopy, RGBA), copyRG: fullscreen(mCopy, RG), copyR: fullscreen(mCopy, R),
    advRG: fullscreen(mAdv, RG), advRGBA: fullscreen(mAdv, RGBA),
    divergence: fullscreen(mod(divergenceSource(wrapX)), R),
    curl: fullscreen(mCurl, R), vorticity: fullscreen(mVort, RG),
    pressure: fullscreen(mod(PRESSURE), R), gradient: fullscreen(mod(GRADIENT), RG),
    display: fullscreen(mod(DISPLAY), gpu.format),
  };
  const additive = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  const splatPipeline = (channel, format) => {
    const m = mod(splatSource(wrapX, channel));
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format, blend: additive }] },
      primitive: { topology: 'triangle-strip' },
    });
  };
  PL.splatV = splatPipeline(2, RG);
  PL.splatD = splatPipeline(3, RGBA);

  // ---- textures ----
  let uid = 0;
  function createTex(w, h, format) {
    const texture = device.createTexture({ size: [w, h], format, usage: USAGE_RT });
    return { id: ++uid, texture, view: texture.createView(), width: w, height: h };
  }
  function createDouble(w, h, format) {
    let a = createTex(w, h, format), b = createTex(w, h, format);
    return {
      width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h, format,
      get read() { return a; }, set read(v) { a = v; },
      get write() { return b; }, set write(v) { b = v; },
      swap() { const t = a; a = b; b = t; },
      dispose() { a.texture.destroy(); b.texture.destroy(); },
    };
  }

  // bind groups are cached by what they bind (a double buffer only has two orientations)
  const groups = new Map();
  function bind(pipeline, key, entries) {
    let g = groups.get(key);
    if (!g) { g = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }); groups.set(key, g); }
    return g;
  }
  const tex = (binding, t) => ({ binding, resource: t.view });
  const smp = (binding, s) => ({ binding, resource: s });

  function runPass(enc, target, pipeline, group, load = false) {
    const p = enc.beginRenderPass({ colorAttachments: [{ view: target.view, loadOp: load ? 'load' : 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
    p.setPipeline(pipeline);
    p.setBindGroup(0, group);
    p.draw(3);
    p.end();
  }
  const submit = (enc) => queue.submit([enc.finish()]);

  // ---- resolutions: the textures follow the canvas aspect (a strip is ~8:1) ----
  const maxTex = device.limits.maxTextureDimension2D;
  function resolution(short, cap) {
    let s = Math.max(16, Math.round(short));
    if (cap) s = Math.min(s, Math.round(Math.min(W, H)));
    let w, h;
    if (W >= H) { h = s; w = Math.round(s * aspect); } else { w = s; h = Math.round(s / aspect); }
    const over = Math.max(w, h) / maxTex;
    if (over > 1) { w = Math.floor(w / over); h = Math.floor(h / over); }
    return { width: Math.max(2, w), height: Math.max(2, h) };
  }

  let dye = null, velocity = null, divergence = null, curl = null, pressure = null;
  let simShort = opts.simShort || CONFIG.SIM_RESOLUTION;
  let simRes = resolution(simShort, false);

  // a new size keeps what is in the old texture (stretched); `gain` rescales the values
  function resizeDouble(target, w, h, format, gain, pipeline) {
    if (target.width === w && target.height === h) return target;
    const next = createDouble(w, h, format);
    setU(SLOT.COPY, 1 / w, 1 / h, 0, 0, gain);
    queue.writeBuffer(ubuf, SLOT.COPY * UB, ublock, SLOT.COPY * SF, 12);
    const enc = device.createCommandEncoder();
    runPass(enc, next.read, pipeline, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [uEntry(SLOT.COPY), smp(1, sLinear), tex(2, target.read)] }));
    submit(enc);
    target.dispose();
    return next;
  }

  function init(dyeShort, nextSimShort = simShort) {
    flush(null); // splats queued for the old textures
    groups.clear();
    const dyeRes = resolution(dyeShort, true); // never finer than the canvas itself
    dye = dye ? resizeDouble(dye, dyeRes.width, dyeRes.height, RGBA, 1, PL.copyRGBA) : createDouble(dyeRes.width, dyeRes.height, RGBA);
    const nextSim = resolution(nextSimShort, false);
    if (!velocity) velocity = createDouble(nextSim.width, nextSim.height, RG);
    else if (nextSim.width !== simRes.width || nextSim.height !== simRes.height) {
      velocity = resizeDouble(velocity, nextSim.width, nextSim.height, RG, nextSim.height / simRes.height, PL.copyRG);
      divergence.texture.destroy(); curl.texture.destroy(); pressure.dispose();
      divergence = null;
    }
    simShort = nextSimShort;
    simRes = nextSim;
    if (!divergence) {
      divergence = createTex(simRes.width, simRes.height, R);
      curl = createTex(simRes.width, simRes.height, R);
      pressure = createDouble(simRes.width, simRes.height, R);
    }
    fillStatic();
  }

  // ---- the dithering texture (the website's), loaded later; neutral grey until then ----
  let dither = null;
  function setDitherTexture(w, h, fill) {
    const next = createDitherTex(w, h);
    fill(next.texture);
    if (dither) dither.texture.destroy();
    dither = next;
    groups.clear();
    if (dye) fillStatic(); // (the first call comes before the dye exists: init() does it then)
  }
  function createDitherTex(w, h) {
    const texture = device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: USAGE_RT });
    return { id: ++uid, texture, view: texture.createView(), width: w, height: h };
  }
  setDitherTexture(1, 1, (t) => queue.writeTexture({ texture: t }, new Uint8Array([128, 128, 128, 255]), { bytesPerRow: 4 }, [1, 1]));

  // the uniforms that only change with the textures
  function fillStatic() {
    const sx = 1 / simRes.width, sy = 1 / simRes.height;
    setU(SLOT.DIV, sx, sy, sx, sy);
    setU(SLOT.CLEARP, sx, sy, sx, sy, CONFIG.PRESSURE);
    setU(SLOT.PRESSURE, sx, sy, sx, sy);
    setU(SLOT.GRADIENT, sx, sy, sx, sy);
    setU(SLOT.CURL, sx, sy, sx, sy);
    setU(SLOT.VORT, sx, sy, sx, sy, CONFIG.CURL, 0);
    setU(SLOT.ADV_V, sx, sy, sx, sy, 0, 0);
    setU(SLOT.ADV_D, 1 / dye.width, 1 / dye.height, sx, sy, 0, 0);
    setU(SLOT.SPLAT_V, sx, sy, 0, 0, aspect);
    setU(SLOT.SPLAT_D, 1 / dye.width, 1 / dye.height, 0, 0, aspect);
    fillDisplay();
    queue.writeBuffer(ubuf, 0, ublock);
  }
  function fillDisplay() {
    const bc = CONFIG.BACK_COLOR;
    setU(SLOT.DISPLAY, 1 / W, 1 / H, W / dither.width, H / dither.height, 0, 0, 0, 0, bc.r / 255, bc.g / 255, bc.b / 255);
  }

  // ---- splats: queued, drawn together ----
  const sbuf = device.createBuffer({ size: SPLAT_CAP * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const sdata = new Float32Array(SPLAT_CAP * 16);
  let splats = 0;
  const velGain = () => simRes.height / resolution(CONFIG.SIM_RESOLUTION, false).height;

  /** Draw the queued splats into the velocity and dye (into `enc`, or into a submission of their own when null). */
  function flush(enc) {
    if (!splats || !dye) { splats = 0; return; }
    const own = !enc;
    if (own) enc = device.createCommandEncoder();
    queue.writeBuffer(sbuf, 0, sdata, 0, splats * 16);
    const n = splats * (wrapX ? 3 : 1);
    splats = 0;
    const draw = (target, pipeline, slot, key) => {
      const g = bind(pipeline, `${key}`, [uEntry(slot), { binding: 1, resource: { buffer: sbuf } }]);
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target.view, loadOp: 'load', storeOp: 'store' }] });
      p.setPipeline(pipeline);
      p.setBindGroup(0, g);
      p.draw(4, n);
      p.end();
    };
    draw(velocity.read, PL.splatV, SLOT.SPLAT_V, 'splatV');
    draw(dye.read, PL.splatD, SLOT.SPLAT_D, 'splatD');
    if (own) submit(enc);
  }

  init(opts.dyeShort || 512);

  const api = {
    width: W, height: H, aspect,
    get simWidth() { return simRes.width; }, get simHeight() { return simRes.height; },
    get dyeWidth() { return dye.width; }, get dyeHeight() { return dye.height; },
    wrapX,

    /** Change the dye resolution (short side, px) and optionally the simulation's; the content is kept. */
    setQuality(dyeShort, simShortNext) { init(dyeShort, simShortNext || simShort); },

    /** The dithering image arrived. */
    setDither(image) {
      const w = image.naturalWidth || image.width || 1, h = image.naturalHeight || image.height || 1;
      setDitherTexture(w, h, (t) => queue.copyExternalImageToTexture({ source: image }, { texture: t }, [w, h]));
    },

    /**
     * Add a splat. x, y: uv (0..1, y up). dx, dy: velocity in simulation texels/s. r, g, b: dye.
     * sigma: gaussian width in canvas heights.
     */
    splat(x, y, dx, dy, r, g, b, sigma) {
      if (wrapX) x -= Math.floor(x);
      else if (x < -0.5 || x > 1.5) return;
      if (splats === SPLAT_CAP) flush(null);
      const radius = 2 * sigma * sigma;
      const d = Math.sqrt(8 * radius); // e^-8 at the box edge
      const m = 2 * Math.max(1 / simRes.width, 1 / dye.width); // a margin of two texels of the coarser grid
      const hx = d / aspect + m, hy = d + m;
      const vg = velGain();
      const o = splats++ * 16;
      const full = wrapX && 2 * hx >= 1; // wider than the strip: one quad over all of it
      sdata[o] = x; sdata[o + 1] = y; sdata[o + 2] = radius; sdata[o + 3] = 0;
      sdata[o + 4] = full ? 0.5 : x; sdata[o + 5] = y; sdata[o + 6] = full ? 0.5 : hx; sdata[o + 7] = hy;
      sdata[o + 8] = dx * vg; sdata[o + 9] = dy * vg; sdata[o + 10] = 0; sdata[o + 11] = 0;
      sdata[o + 12] = r; sdata[o + 13] = g; sdata[o + 14] = b; sdata[o + 15] = 0;
    },

    /** Advance the simulation by dt seconds. */
    step(dt, dyeDissipation = CONFIG.DENSITY_DISSIPATION, velocityDissipation = CONFIG.VELOCITY_DISSIPATION) {
      const enc = device.createCommandEncoder();
      flush(enc);
      const sx = 1 / simRes.width, sy = 1 / simRes.height;
      setU(SLOT.CLEARP, sx, sy, sx, sy, CONFIG.PRESSURE);
      setU(SLOT.VORT, sx, sy, sx, sy, CONFIG.CURL, dt);
      setU(SLOT.ADV_V, sx, sy, sx, sy, dt, velocityDissipation);
      setU(SLOT.ADV_D, 1 / dye.width, 1 / dye.height, sx, sy, dt, dyeDissipation);
      queue.writeBuffer(ubuf, 0, ublock, 0, SLOT.SPLAT_V * SF);

      if (CONFIG.CURL > 0) {
        runPass(enc, curl, PL.curl, bind(PL.curl, `curl:${velocity.read.id}`, [uEntry(SLOT.CURL), smp(1, sLinear), tex(2, velocity.read)]));
        runPass(enc, velocity.write, PL.vorticity, bind(PL.vorticity, `vort:${velocity.read.id}`, [uEntry(SLOT.VORT), smp(1, sLinear), tex(2, velocity.read), tex(3, curl)]));
        velocity.swap();
      }

      runPass(enc, divergence, PL.divergence, bind(PL.divergence, `div:${velocity.read.id}`, [uEntry(SLOT.DIV), smp(1, sLinear), tex(2, velocity.read)]));

      runPass(enc, pressure.write, PL.copyR, bind(PL.copyR, `clearP:${pressure.read.id}`, [uEntry(SLOT.CLEARP), smp(1, sNearest), tex(2, pressure.read)]));
      pressure.swap();

      for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
        runPass(enc, pressure.write, PL.pressure, bind(PL.pressure, `p:${pressure.read.id}`, [uEntry(SLOT.PRESSURE), smp(1, sNearest), tex(2, pressure.read), tex(3, divergence)]));
        pressure.swap();
      }

      runPass(enc, velocity.write, PL.gradient, bind(PL.gradient, `g:${pressure.read.id}:${velocity.read.id}`, [uEntry(SLOT.GRADIENT), smp(1, sNearest), tex(2, pressure.read), tex(3, velocity.read)]));
      velocity.swap();

      runPass(enc, velocity.write, PL.advRG, bind(PL.advRG, `av:${velocity.read.id}`, [uEntry(SLOT.ADV_V), smp(1, sLinear), tex(2, velocity.read), tex(3, velocity.read)]));
      velocity.swap();

      runPass(enc, dye.write, PL.advRGBA, bind(PL.advRGBA, `ad:${velocity.read.id}:${dye.read.id}`, [uEntry(SLOT.ADV_D), smp(1, sLinear), tex(2, velocity.read), tex(3, dye.read)]));
      dye.swap();
      submit(enc);
    },

    /** Draw the liquid over the website's background colour into the canvas (presented when the frame's task ends). */
    render() {
      const enc = device.createCommandEncoder();
      flush(enc);
      fillDisplay();
      queue.writeBuffer(ubuf, SLOT.DISPLAY * UB, ublock, SLOT.DISPLAY * SF, 12);
      const target = { view: context.getCurrentTexture().createView() };
      runPass(enc, target, PL.display, bind(PL.display, `disp:${dye.read.id}:${dither.id}`, [uEntry(SLOT.DISPLAY), smp(1, sLinear), tex(2, dye.read), smp(3, sDither), tex(4, dither)]));
      submit(enc);
    },

    /** Zero everything (a fresh liquid). */
    clear() {
      splats = 0;
      const enc = device.createCommandEncoder();
      for (const t of [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write]) {
        enc.beginRenderPass({ colorAttachments: [{ view: t.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] }).end();
      }
      submit(enc);
    },

    /** Free the GPU resources (the device is kept). */
    dispose() {
      dye.dispose(); velocity.dispose(); pressure.dispose();
      divergence.texture.destroy(); curl.texture.destroy(); dither.texture.destroy();
      sbuf.destroy(); ubuf.destroy();
      groups.clear();
    },
  };
  return api;
}
