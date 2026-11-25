// Ressonància — the shared text layer: chapter cards, the instruction line over each hand target, floor names, the acta.
// Text is set out once on a 2D canvas (hand-spaced letters, the house font stack), uploaded as a mipmapped texture ONLY when it
// changes, and drawn as quads in metres round the room, periodic (an item across the P3 -> P4 seam is drawn on both sides).
//
//   import { createTextLayer } from './text.js';
//   const text = createTextLayer(env, opt);           // env: the scene env of host.js (gl, room, walls, pxPerM, program, HEAD)
//
// opt (all optional)
//   color      [r, g, b]  linear colour of the ink                         default [1.0, 0.94, 0.86] (warm white)
//   intensity  number     multiplies the colour (linear HDR)               default 0.9  (reads well through the host's tone map + bloom)
//   density    px/m       canvas resolution of the text                     default 2 x env.pxPerM, capped so a texture is <= 4096 x 2048
//   font       string     CSS font-family stack                             default 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif'
//
// text.set(id, spec)      create or update the named item. Returns the layer.
//   spec.lines   [{ text, size, weight?, tracking?, alpha?, dy? }]  one entry per line, drawn centred
//                  text      string
//                  size      CAP HEIGHT in metres (the height of an 'H')
//                  weight    CSS font weight                                   default 300
//                  tracking  letter-spacing in em (x font size), added by hand after every character   default 0
//                  alpha     0..1, the line's ink                               default 1
//                  dy        metres BELOW the first line's centre to this line's centre   default: previous dy + (previous size + size)
//   spec.x       'walls' (centred on every wall's centre) | number (metres round the room) | [numbers]     default 'walls'
//   spec.walls   [wall indices]: with x = 'walls', only these walls                                       default all walls
//   spec.y       metres from the floor of the FIRST line's centre                                         default 1.8
//   spec.width   max width in metres: a wider block is scaled down as a whole to fit                     default 5.6
//   spec.plate   0..1 a soft dark plate behind the block, for legibility over bright pictures            default 0
//   spec.fadeIn, spec.fadeOut   seconds                                                                    default 1.2, 1.0
//   spec.focus   true: the text comes into focus as it fades in (mip blur)                               default true
//   spec.color, spec.intensity  override the layer's for this item
//   Setting an id whose TEXT changed (any line's text, size, weight, tracking, alpha, dy, or width) cross-fades: the old text fades
//   out (fadeOut) while the new fades in (fadeIn). Setting the same text does nothing to the text (it is cheap: no string building,
//   no allocation); position, walls, plate, fades and colour are simply updated in place. Setting an id that is fading out after
//   clear() fades it back in.
// text.clear(id)          fades the item out (fadeOut); it then costs nothing (its textures are kept for when the id is set again).
// text.clearAll()         clears every item.
// text.opacity(id, a)     a 0..1 multiplier you may drive every frame (a timeline), on top of the fades. Default 1. No allocation.
// text.has(id)            true while the item is set (not cleared).
// text.step(dt)           advances the fades (seconds).
// text.draw(target, opacity = 1)   draws every visible item OVER what is in target ({ fbo, w, h }): premultiplied
//                         (ONE, ONE_MINUS_SRC_ALPHA), linear HDR. It binds target.fbo and its viewport and leaves blending disabled.
// text.dispose()          frees the GL objects.
// Notes: one draw call per placement (per wall, per seam copy) of each visible item; nothing is uploaded or allocated per frame.
// The font is re-rasterised once when document.fonts.ready resolves (Geist may arrive after the first frame).
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const MAX_TEX_W = 4096, MAX_TEX_H = 2048, MAXP = 16;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };

export function createTextLayer(env, opt = {}) {
  const { gl, room, walls, HEAD, program } = env;
  const PER = room.perimeter;
  const FONTS = opt.font || FONT;
  const COLOR = opt.color || [1.0, 0.94, 0.86], INTENSITY = opt.intensity ?? 0.9;
  const DENSITY = opt.density || 2 * (env.pxPerM || 243);

  const prog = program(HEAD + `
uniform vec4 uRect; uniform vec2 uRoom; out vec2 vUv;
void main(){ vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)); vUv = c;
  vec2 p = uRect.xy + c * uRect.zw; gl_Position = vec4(p / uRoom * 2.0 - 1.0, 0.0, 1.0); }`, HEAD + `
uniform sampler2D uTex; uniform vec3 uCol; uniform float uA, uBlur, uPlate, uSoft; uniform vec4 uInner; uniform vec2 uSizeM;
in vec2 vUv; out vec4 o;
void main(){
  float ta = texture(uTex, vec2(vUv.x, 1.0 - vUv.y), uBlur).a * uA;
  float pa = 0.0;
  if (uPlate > 0.0) {
    vec2 m = vUv * uSizeM, d = max(max(uInner.xy - m, m - uInner.zw), 0.0);
    pa = uPlate * 0.72 * uA * exp(-dot(d, d) / (2.0 * uSoft * uSoft));
  }
  o = vec4(uCol * ta, ta + pa * (1.0 - ta));
}`);
  const vao = gl.createVertexArray();
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const capCache = new Map();                          // "weight" -> cap height / font size
  function capRatio(weight) {
    let r = capCache.get(weight);
    if (r === undefined) { g.font = `${weight} 100px ${FONTS}`; r = (g.measureText('H').actualBoundingBoxAscent || 71) / 100; capCache.set(weight, r); }
    return r;
  }

  const items = new Map(), list = [];   // list: the same items, iterated per frame without an iterator
  const newSlot = () => ({ tex: null, fade: 0, dir: 0, wM: 0, hM: 0, oy: 0, inner: [0, 0, 0, 0], soft: 0.1, lines: [], width: 0 });

  // ------------------------------------------------------------------------------------------ rasterise one block into a slot
  function raster(slot, lines, width) {
    // copy what the text is (for the "same text?" test) — only here, when the text changed
    slot.lines.length = 0; slot.width = width;
    let dyPrev = 0, sPrev = 0;
    const L = [];
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i], size = Math.max(0.005, Number(s.size) || 0.1);
      const dy = s.dy != null ? Number(s.dy) : i === 0 ? 0 : dyPrev + sPrev + size;
      const l = { text: String(s.text ?? ''), size: Number(s.size) || 0.1, weight: s.weight ?? 300, tracking: Number(s.tracking) || 0, alpha: s.alpha ?? 1, dy: s.dy };
      slot.lines.push(l);
      L.push({ text: l.text, cap: size, weight: l.weight, tr: l.tracking, alpha: clamp01(l.alpha), dy, font: size / capRatio(l.weight), w: 0 });
      dyPrev = dy; sPrev = size;
    }
    // measure (metres, at scale 1)
    let maxW = 0, maxCap = 0;
    for (const l of L) {
      g.font = `${l.weight} 100px ${FONTS}`;
      let w = 0, n = 0; for (const ch of l.text) { w += g.measureText(ch).width; n++; }
      l.w = (w / 100) * l.font + l.tr * l.font * Math.max(0, n - 1);
      maxW = Math.max(maxW, l.w); maxCap = Math.max(maxCap, l.cap);
    }
    const k = maxW > width && maxW > 0 ? width / maxW : 1;   // scale the whole block down to fit
    let top = -1e9, bot = 1e9;
    for (const l of L) { l.cap *= k; l.font *= k; l.w *= k; l.dy *= k; top = Math.max(top, -l.dy + l.cap * 0.95); bot = Math.min(bot, -l.dy - l.cap * 0.95); }
    maxW *= k; maxCap *= k;
    const pad = 0.06 + 0.6 * maxCap;
    const wM = maxW + 2 * pad, hM = top - bot + 2 * pad;
    const cpx = Math.max(16, Math.min(DENSITY, MAX_TEX_W / wM, MAX_TEX_H / hM));
    cv.width = Math.max(4, Math.ceil(wM * cpx)); cv.height = Math.max(4, Math.ceil(hM * cpx));
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    const yTop = top + pad;                               // metres (relative to the first line's centre) at canvas row 0
    for (const l of L) {
      const size = l.font * cpx, track = l.tr * size;
      g.font = `${l.weight} ${size}px ${FONTS}`; g.globalAlpha = l.alpha;
      let x = (cv.width - l.w * cpx) / 2;
      const y = (yTop - (-l.dy - l.cap / 2)) * cpx;       // baseline: centre - cap/2
      for (const ch of l.text) { g.fillText(ch, x, y); x += g.measureText(ch).width + track; }
    }
    g.globalAlpha = 1;
    if (!slot.tex) slot.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    slot.wM = cv.width / cpx; slot.hM = cv.height / cpx;   // the exact metres the texture covers
    slot.oy = bot - pad;                                   // quad bottom, relative to the first line's centre
    const ix = (slot.wM - maxW) / 2, m = 0.35 * maxCap;
    slot.inner[0] = ix - m; slot.inner[1] = pad - m * 0.6; slot.inner[2] = ix + maxW + m; slot.inner[3] = slot.hM - pad + m * 0.6;
    slot.soft = Math.max(0.03, pad * 0.45);
  }

  function sameText(slot, lines, width) {
    if (!slot.tex || slot.width !== width || slot.lines.length !== lines.length) return false;
    for (let i = 0; i < lines.length; i++) {
      const a = slot.lines[i], b = lines[i];
      if (a.text !== String(b.text ?? '') || a.size !== (Number(b.size) || 0.1) || a.weight !== (b.weight ?? 300) || a.tracking !== (Number(b.tracking) || 0) || a.alpha !== (b.alpha ?? 1) || a.dy !== b.dy) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------------------------ API
  function set(id, spec) {
    let it = items.get(id);
    if (!it) { it = { cur: newSlot(), old: newSlot(), spec: null, live: true, op: 1, xs: new Float32Array(MAXP), nx: 0, y: 1.8, plate: 0, fin: 1.2, fout: 1.0, focus: true, col: [0, 0, 0], dirty: false }; items.set(id, it); list.push(it); }
    const lines = spec.lines || [], width = Number(spec.width) || 5.6;
    it.y = spec.y != null ? Number(spec.y) : 1.8; it.plate = clamp01(Number(spec.plate) || 0);
    it.fin = Math.max(0.001, spec.fadeIn ?? 1.2); it.fout = Math.max(0.001, spec.fadeOut ?? 1.0); it.focus = spec.focus !== false;
    const c = spec.color || COLOR, k = spec.intensity ?? INTENSITY; it.col[0] = c[0] * k; it.col[1] = c[1] * k; it.col[2] = c[2] * k;
    // placements (metres round the room, centres)
    it.nx = 0;
    const x = spec.x ?? 'walls';
    if (x === 'walls') {
      if (spec.walls) { for (const w of spec.walls) if (walls[w] && it.nx < MAXP) it.xs[it.nx++] = walls[w].centre; }
      else for (let w = 0; w < walls.length && it.nx < MAXP; w++) it.xs[it.nx++] = walls[w].centre;
    } else if (typeof x === 'number') it.xs[it.nx++] = x;
    else if (Array.isArray(x)) for (const v of x) if (it.nx < MAXP) it.xs[it.nx++] = Number(v);
    for (let i = 0; i < it.nx; i++) it.xs[i] = ((it.xs[i] % PER) + PER) % PER;
    it.live = true;
    if (sameText(it.cur, lines, width)) { it.cur.dir = 1; return api; }
    // the text changed: the current slot becomes the old one (fading out), the new text fades in
    const o = it.old; it.old = it.cur; it.cur = o;
    it.old.dir = -1;
    raster(it.cur, lines, width); it.cur.fade = 0; it.cur.dir = 1;
    it.spec = spec;
    return api;
  }
  function clear(id) { const it = items.get(id); if (it) { it.live = false; it.cur.dir = -1; it.old.dir = -1; } return api; }
  function clearAll() { for (const id of items.keys()) clear(id); return api; }
  function opacity(id, a) { const it = items.get(id); if (it) it.op = clamp01(a); return api; }
  function has(id) { const it = items.get(id); return !!(it && it.live); }

  function step(dt) {
    for (let i = 0; i < list.length; i++) { const it = list[i]; fadeSlot(it.cur, it, dt); fadeSlot(it.old, it, dt); }
  }
  function fadeSlot(s, it, dt) {
    if (s.dir > 0) s.fade = Math.min(1, s.fade + dt / it.fin);
    else if (s.dir < 0) s.fade = Math.max(0, s.fade - dt / it.fout);
  }

  function drawSlot(it, s, op) {
    const a = smoother(s.fade) * it.op * op;
    if (a < 0.002 || !s.tex) return;
    const u = prog.u;
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.uniform3f(u.uCol, it.col[0], it.col[1], it.col[2]); gl.uniform1f(u.uA, a);
    gl.uniform1f(u.uBlur, it.focus ? (1 - a) * 2.6 : 0); gl.uniform1f(u.uPlate, it.plate); gl.uniform1f(u.uSoft, s.soft);
    gl.uniform4f(u.uInner, s.inner[0], s.inner[1], s.inner[2], s.inner[3]); gl.uniform2f(u.uSizeM, s.wM, s.hM);
    const y0 = it.y + s.oy;
    for (let i = 0; i < it.nx; i++) {
      const x0 = it.xs[i] - s.wM / 2;
      gl.uniform4f(u.uRect, x0, y0, s.wM, s.hM); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (x0 < 0) { gl.uniform4f(u.uRect, x0 + PER, y0, s.wM, s.hM); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }        // the seam: its other half
      if (x0 + s.wM > PER) { gl.uniform4f(u.uRect, x0 - PER, y0, s.wM, s.hM); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    }
  }
  function draw(target, op = 1) {
    if (op < 0.002) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog.p); gl.bindVertexArray(vao);
    gl.uniform2f(prog.u.uRoom, PER, room.height);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(prog.u.uTex, 0);
    for (let i = 0; i < list.length; i++) { const it = list[i]; drawSlot(it, it.old, op); drawSlot(it, it.cur, op); }   // a cleared item simply stays at fade 0 (its textures kept for reuse)
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
  }

  // the house font may arrive late: set every item out again once
  document.fonts?.ready?.then(() => {
    capCache.clear();
    for (const it of items.values()) if (it.cur.tex) { const s = it.cur, keep = s.fade, d = s.dir; raster(s, s.lines.map((l) => ({ ...l })), s.width); s.fade = keep; s.dir = d; }
  }).catch(() => {});

  function dispose() { for (const it of items.values()) { if (it.cur.tex) gl.deleteTexture(it.cur.tex); if (it.old.tex) gl.deleteTexture(it.old.tex); } items.clear(); list.length = 0; gl.deleteProgram(prog.p); gl.deleteVertexArray(vao); }

  const api = { set, clear, clearAll, opacity, has, step, draw, dispose };
  return api;
}
