// Reel — the WebGL2 drawing that is not the blobs: the background field, the buttons / rings, textured sprites (the logo,
// the text labels). Everything is drawn PREMULTIPLIED into a transparent canvas (the manifest says `transparent`: the
// page goes above the clip layers, so a video shows through wherever the page is clear).
// Coordinates are render px with y down (as vt.walls); the shaders flip to GL's y up.

import { fitLabel } from './layout.js';

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

function compile(gl, vs, fs, name) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Reel ${name} shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Reel ${name} program: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

/** A unit quad (0..1) as a vertex array: every program here draws it as a TRIANGLE_STRIP placed by its uniforms. */
export function makeQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  return { vao, draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }, dispose() { gl.deleteBuffer(buf); gl.deleteVertexArray(vao); } };
}

// A quad over a px box of the canvas (uBox = x, y, w, h with y down; uView = canvas w, h)
export const BOX_VS = `#version 300 es
in vec2 aPos;
uniform vec4 uBox;
uniform vec2 uView;
out vec2 vUv;
void main() {
  vUv = aPos;
  vec2 px = uBox.xy + aPos * uBox.zw;
  gl_Position = vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, 0.0, 1.0);
}`;

// Gradient noise in 3D (Perlin's construction, own code): smooth, in about −0.7..0.7
export const NOISE_GLSL = `
vec3 nHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(nHash(i), f), b = dot(nHash(i + vec3(1, 0, 0)), f - vec3(1, 0, 0));
  float c = dot(nHash(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), d = dot(nHash(i + vec3(1, 1, 0)), f - vec3(1, 1, 0));
  float e = dot(nHash(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), g = dot(nHash(i + vec3(1, 0, 1)), f - vec3(1, 0, 1));
  float h = dot(nHash(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), k = dot(nHash(i + vec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}`;

// The website's palette (MEDIA-SERVER.md §6.4): indigo, lavender, pink, soft pink, violet, on the background's light blue
export const PALETTE = {
  back: [173, 200, 237], indigo: [53, 48, 160], lavender: [130, 130, 255], pink: [222, 121, 255], softPink: [251, 194, 255], violet: [154, 62, 199],
};
const glsl = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(', ')})`;

// ---------------------------------------------------------------------------------------------- the background field

// A slow colour field in the website's palette. PERIODIC in x with period = the strip's width: x is an angle round a
// cylinder (the noise is sampled on it), so the last column of the strip meets the first with no seam (closed rooms).
const FIELD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime, uW, uH, uFeature, uWrap;
out vec4 o;
${NOISE_GLSL}
float fbm(vec3 p) { return gnoise(p) + 0.5 * gnoise(p * 2.03 + 17.1); }
void main() {
  float x = vUv.x * uW, y = (1.0 - vUv.y) * uH;
  vec3 p;
  if (uWrap > 0.5) {
    float a = vUv.x * 6.28318530718, R = uW / 6.28318530718;
    p = vec3(R * cos(a), R * sin(a), y) / uFeature;
  } else {
    p = vec3(x, 0.0, y) / uFeature;
  }
  float t = uTime * 0.035;
  vec3 warp = vec3(gnoise(p * 0.7 + vec3(0.0, 0.0, t)), gnoise(p * 0.7 + vec3(5.2, 1.3, -t)), 0.0) * 0.9;
  vec3 q = p + warp + vec3(0.0, 0.0, t * 0.6);
  float a1 = fbm(q), a2 = fbm(q * 1.3 + 9.4 + t), a3 = fbm(q * 0.8 - 4.1 - t * 0.7), a4 = gnoise(q * 1.7 + 2.0);
  vec3 col = ${glsl(PALETTE.back)};
  col = mix(col, ${glsl(PALETTE.lavender)}, smoothstep(-0.05, 0.55, a1) * 0.62);
  col = mix(col, ${glsl(PALETTE.pink)}, smoothstep(0.05, 0.6, a2) * 0.5);
  col = mix(col, ${glsl(PALETTE.indigo)}, smoothstep(0.1, 0.65, a3) * 0.42);
  col = mix(col, ${glsl(PALETTE.softPink)}, smoothstep(0.2, 0.6, a4) * 0.28);
  col = mix(col, ${glsl(PALETTE.violet)}, smoothstep(0.25, 0.7, a1 * a2 * 3.0) * 0.35);
  o = vec4(col, 1.0);
}`;

// the field (rendered small) up to the canvas, premultiplied by the scene's alpha; REPEAT in x: the seam filters round
const BLIT_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uAlpha;
out vec4 o;
void main() { o = vec4(texture(uTex, vec2(vUv.x, 1.0 - vUv.y)).rgb * uAlpha, uAlpha); }`;

/** The background: a field rendered at `scale` of the canvas into a texture, then stretched over the canvas. */
export function makeField(gl, quad, W, H) {
  const field = compile(gl, BOX_VS, FIELD_FS, 'field');
  const blit = compile(gl, BOX_VS, BLIT_FS, 'blit');
  let tex = null, fbo = null, fw = 0, fh = 0, wrapped = true;
  const size = (scale) => {
    const w = Math.max(8, Math.round(W * scale)), h = Math.max(4, Math.round(H * scale));
    if (w === fw && h === fh) return;
    if (tex) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); }
    fw = w; fh = h; wrapped = true;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // the strip is a loop: filtering at x = 0 reads x = W − 1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  return {
    /** Render the field at time `t` (s) and draw it over the whole canvas at `alpha`. wrap: the strip is a loop. */
    draw(t, alpha, { scale = 0.25, wrap = true } = {}) {
      size(scale);
      if (wrap !== wrapped) { // a strip with two ends must not filter its last column into its first
        wrapped = wrap;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fw, fh);
      gl.useProgram(field.p);
      gl.uniform4f(field.u.uBox, 0, 0, W, H);
      gl.uniform2f(field.u.uView, W, H);
      gl.uniform1f(field.u.uTime, t);
      gl.uniform1f(field.u.uW, W);
      gl.uniform1f(field.u.uH, H);
      gl.uniform1f(field.u.uFeature, H * 0.62);
      gl.uniform1f(field.u.uWrap, wrap ? 1 : 0);
      quad.draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(blit.p);
      gl.uniform4f(blit.u.uBox, 0, 0, W, H);
      gl.uniform2f(blit.u.uView, W, H);
      gl.uniform1f(blit.u.uAlpha, alpha);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(blit.u.uTex, 0);
      quad.draw();
    },
  };
}

// ---------------------------------------------------------------------------------------------- buttons, rings, glows

// One capsule (a circle when uHx = 0): a soft glow round it, a fill, an outline, and a progress ring that runs clockwise
// from the top along a track just outside the outline. Colours are premultiplied; the result is composed "over".
const UI_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uBox;
uniform vec2 uView, uC;     // centre, px (y down)
uniform float uR, uHx, uLine, uGlowR, uTrackR, uTrackW, uProgress;
uniform vec4 uFill, uStroke, uGlow, uTrack, uProg;
out vec4 o;
const float PI = 3.14159265359;
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
float perim(vec2 p, float a, float r) {     // 0..1 clockwise from the top centre (y up)
  float P = 4.0 * a + 2.0 * PI * r, s;
  if (p.x >= -a && p.x <= a) s = p.y >= 0.0 ? (p.x >= 0.0 ? p.x : 3.0 * a + 2.0 * PI * r + (p.x + a)) : a + PI * r + (a - p.x);
  else if (p.x > a) s = a + atan(p.x - a, p.y) * r;
  else s = 3.0 * a + PI * r + atan(-(p.x + a), -p.y) * r;
  return s / max(P, 1e-3);
}
void main() {
  vec2 px = uBox.xy + vUv * uBox.zw;
  vec2 p = vec2(px.x - uC.x, uC.y - px.y);
  float d = length(vec2(max(abs(p.x) - uHx, 0.0), p.y)) - uR;
  vec4 c = vec4(0.0);
  if (uGlowR > 0.0) c = uGlow * exp(-max(d, 0.0) / uGlowR);
  c = over(uFill * clamp(0.5 - d, 0.0, 1.0), c);
  if (uLine > 0.0) c = over(uStroke * clamp(uLine * 0.5 + 0.5 - abs(d), 0.0, 1.0), c);
  if (uTrackW > 0.0) {
    float k = clamp(uTrackW * 0.5 + 0.5 - abs(d - uTrackR), 0.0, 1.0);
    float on = step(perim(p, uHx, uR + uTrackR), uProgress) * step(0.001, uProgress);
    c = over(mix(uTrack, uProg, on) * k, c);
  }
  o = c;
}`;

export function makeUi(gl, quad, W, H) {
  const ui = compile(gl, BOX_VS, UI_FS, 'ui');
  const v4 = (u, c) => gl.uniform4f(u, c[0], c[1], c[2], c[3]);
  const Z = [0, 0, 0, 0];
  return {
    /**
     * A capsule at (x, y) px. o: { r, hx, line, fill, stroke, glow, glowR, track, prog, trackR, trackW, progress }
     * Colours: premultiplied [r, g, b, a] (0..1).
     */
    draw(x, y, o) {
      const r = o.r, hx = o.hx || 0, reach = r + Math.max(o.glowR ? o.glowR * 4 : 0, (o.trackR || 0) + (o.trackW || 0)) + 2;
      gl.useProgram(ui.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform4f(ui.u.uBox, x - hx - reach, y - reach, 2 * (hx + reach), 2 * reach);
      gl.uniform2f(ui.u.uView, W, H);
      gl.uniform2f(ui.u.uC, x, y);
      gl.uniform1f(ui.u.uR, r);
      gl.uniform1f(ui.u.uHx, hx);
      gl.uniform1f(ui.u.uLine, o.line || 0);
      gl.uniform1f(ui.u.uGlowR, o.glowR || 0);
      gl.uniform1f(ui.u.uTrackR, o.trackR || 0);
      gl.uniform1f(ui.u.uTrackW, o.trackW || 0);
      gl.uniform1f(ui.u.uProgress, o.progress || 0);
      v4(ui.u.uFill, o.fill || Z); v4(ui.u.uStroke, o.stroke || Z); v4(ui.u.uGlow, o.glow || Z);
      v4(ui.u.uTrack, o.track || Z); v4(ui.u.uProg, o.prog || Z);
      quad.draw();
    },
  };
}

/** [r, g, b] 0..255 at alpha a → premultiplied [r, g, b, a] 0..1. */
export const pm = (rgb, a) => [(rgb[0] / 255) * a, (rgb[1] / 255) * a, (rgb[2] / 255) * a, a];

// ---------------------------------------------------------------------------------------------- textured sprites

const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uAlpha;
out vec4 o;
void main() { o = texture(uTex, vUv) * uAlpha; }`;

export function makeSprites(gl, quad, W, H) {
  const sp = compile(gl, BOX_VS, SPRITE_FS, 'sprite');
  return {
    /** Texture `tex` (premultiplied) over the px box x, y, w, h (y down) at `alpha`. */
    draw(tex, x, y, w, h, alpha) {
      if (!tex || alpha <= 0.001) return;
      gl.useProgram(sp.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform4f(sp.u.uBox, x, y, w, h);
      gl.uniform2f(sp.u.uView, W, H);
      gl.uniform1f(sp.u.uAlpha, alpha);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(sp.u.uTex, 0);
      quad.draw();
    },
  };
}

/** An image or canvas → a premultiplied, mipmapped texture. */
export function textureFrom(gl, src, mip = true) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * Text as a texture: Raleway, upper case, letters spaced `tracking` em (the website's buttons: 0.18 em), white with a soft
 * indigo shadow (white over the light field needs it). `px`: the font size. Wider than `maxW` px → it wraps onto up to
 * `maxLines` rows first (fitLabel), scaled down only when that is not enough, never under `minPx`; a name that still does
 * not fit is cut with an ellipsis. → { tex, w, h, th, lines } (px at the size asked: draw it at that size for crisp
 * letters; th = the text block's own height, without the margins).
 */
export function textTexture(gl, text, px, { weight = 300, tracking = 0.18, maxW = Infinity, minPx = 6, maxLines = 1, shadow = true, family = 'Raleway' } = {}) {
  const s = String(text || '').toUpperCase();
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = (size) => `${weight} ${size}px ${family}, "Segoe UI", system-ui, sans-serif`;
  const measure = (str, size) => { g.font = font(size); let w = 0; for (const ch of str) w += g.measureText(ch).width + tracking * size; return Math.max(1, w - tracking * size); };
  const { lines, size } = fitLabel(s, measure, { size: px, minSize: Math.min(px, minPx), maxW, maxLines });
  const w = Math.max(...lines.map((l) => measure(l, size))), lh = size * 1.25, th = lines.length * lh;
  const pad = Math.ceil(size * 0.5);
  c.width = Math.ceil(w + 2 * pad); c.height = Math.ceil(th + size * 0.25 + 2 * pad);
  g.font = font(size);
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  if (shadow) { g.shadowColor = 'rgba(53, 48, 160, 0.55)'; g.shadowBlur = size * 0.35; }
  lines.forEach((line, i) => {
    let x = pad + (w - measure(line, size)) / 2; // rows centred on each other
    const y = c.height / 2 + (i - (lines.length - 1) / 2) * lh;
    for (const ch of line) { g.fillText(ch, x, y); x += g.measureText(ch).width + tracking * size; }
  });
  return { tex: textureFrom(gl, c, false), w: c.width, h: c.height, th, text: s, lines };
}
