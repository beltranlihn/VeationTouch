// Reel — the project blobs ("amoebas"): 3D-looking soft bodies in the colours of the Alma Digital logo's blob.
// Each blob is its own quad; in it the shader marches a short ray (BLOB_STEPS) into a sphere deformed by 3D noise, lights
// it (soft key light from the upper left, a gentle specular, a deep-purple rim) and colours it with an iridescent gradient
// of the website's palette that shifts with the view angle and time. Only the pixels near each blob pay, never the strip.
// Pressing one dents it toward the hand. Drawn premultiplied over the background ("over").
import { BOX_VS, NOISE_GLSL, PALETTE } from './gfx.js';

const c3 = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(', ')})`;

const BLOB_FS = (steps) => `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uBox;
uniform vec2 uC;          // centre, px (y down)
uniform float uR, uTime, uSeed, uPress, uAlpha, uDim, uScale;
uniform vec2 uHand;       // where the hand is, in units of the blob's radius (y up)
out vec4 o;
${NOISE_GLSL}
float sdf(vec3 p) {
  float r = uScale * (1.0 - 0.07 * uPress);
  // big soft lobes (the logo's blob), a little finer detail on top
  float n = gnoise(p * 0.95 + vec3(uSeed, uSeed * 1.7, uTime * 0.13)) * 0.46 + gnoise(p * 1.9 + vec3(uTime * 0.09, uSeed, 3.0)) * 0.07;
  vec2 dh = p.xy - uHand;
  float dent = uPress * 0.3 * exp(-3.5 * dot(dh, dh)) * smoothstep(-0.3, 0.8, p.z);
  return length(p) - r - n * r + dent;
}
vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.004;
  return normalize(k.xyy * sdf(p + k.xyy * h) + k.yyx * sdf(p + k.yyx * h) + k.yxy * sdf(p + k.yxy * h) + k.xxx * sdf(p + k.xxx * h));
}
vec3 palette(float h) {               // indigo → lavender → pink → soft pink → violet → back, a loop
  h = fract(h) * 5.0;
  vec3 a = ${c3(PALETTE.indigo)}, b = ${c3(PALETTE.lavender)}, c = ${c3(PALETTE.pink)}, d = ${c3(PALETTE.softPink)}, e = ${c3(PALETTE.violet)};
  if (h < 1.0) return mix(a, b, smoothstep(0.0, 1.0, h));
  if (h < 2.0) return mix(b, c, smoothstep(1.0, 2.0, h));
  if (h < 3.0) return mix(c, d, smoothstep(2.0, 3.0, h));
  if (h < 4.0) return mix(d, e, smoothstep(3.0, 4.0, h));
  return mix(e, a, smoothstep(4.0, 5.0, h));
}
void main() {
  vec2 px = uBox.xy + vUv * uBox.zw;
  vec2 q = vec2(px.x - uC.x, uC.y - px.y) / uR;
  if (dot(q, q) > 2.0) discard;
  vec3 ro = vec3(q, 1.8), rd = vec3(0.0, 0.0, -1.0);
  float t = 0.0, dmin = 1e3, tmin = 0.0, d = 1e3;
  bool hit = false;
  for (int i = 0; i < ${steps}; i++) {
    d = sdf(ro + rd * t);
    if (d < dmin) { dmin = d; tmin = t; }
    if (d < 0.003) { hit = true; break; }
    t += d * 0.62;
    if (t > 3.6) break;
  }
  float pxs = 1.0 / uR;                           // one pixel, in blob units
  float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.5 * pxs, dmin);
  if (cov <= 0.002) discard;
  vec3 p = ro + rd * (hit ? t : tmin);              // an edge pixel is lit where the ray came closest
  vec3 n = normalAt(p);
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float diff = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);
  float hue = 0.3 + 0.22 * n.y - 0.1 * n.x + 0.3 * fres + 0.28 * gnoise(n * 1.6 + uSeed + uTime * 0.05) + 0.05 * sin(uTime * 0.4 + uSeed);
  vec3 col = palette(hue);
  col *= 0.58 + 0.62 * diff;
  col += ${c3(PALETTE.softPink)} * 0.14 * pow(max(n.z, 0.0), 3.0) * diff;    // light through the front of the body
  col = mix(col, ${c3(PALETTE.indigo)} * 0.75, fres * 0.32);                 // the deep rim of the logo's blob
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += vec3(1.0, 0.93, 1.0) * pow(max(dot(n, H), 0.0), 28.0) * 0.38;      // a soft highlight
  col += ${c3(PALETTE.softPink)} * uPress * 0.22;                             // pressed: it glows
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grey) * 0.85 + 0.12, uDim * 0.85);                       // a clip that cannot play: switched off
  float a = cov * uAlpha * mix(1.0, 0.4, uDim);
  o = vec4(col * a, a);
}`;

export function makeBlobs(gl, quad, W, H, steps = 28) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Reel blob shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  let prog = null, u = null, built = 0;
  const build = (n) => {
    if (prog && built === n) return;
    if (prog) gl.deleteProgram(prog);
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, BOX_VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, BLOB_FS(n)));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Reel blob program: ${gl.getProgramInfoLog(prog)}`);
    u = {};
    for (const k of ['uBox', 'uView', 'uC', 'uR', 'uTime', 'uSeed', 'uPress', 'uAlpha', 'uDim', 'uScale', 'uHand']) u[k] = gl.getUniformLocation(prog, k);
    built = n;
  };
  build(steps);
  return {
    setSteps(n) { build(Math.max(12, Math.min(48, Math.round(n)))); },
    /**
     * One blob at (x, y) px, radius r px. o: { time, seed, press 0..1, hand [x, y] px | null, alpha, dim 0..1, scale 0..1 }
     * `copies`: the x offsets to draw it at too (a blob crossing the seam of a closed strip is drawn at x and x ± W).
     */
    draw(x, y, r, o, copies = [0]) {
      if (o.alpha <= 0.001 || o.scale <= 0.001) return;
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u.uView, W, H);
      gl.uniform1f(u.uR, r);
      gl.uniform1f(u.uTime, o.time);
      gl.uniform1f(u.uSeed, o.seed);
      gl.uniform1f(u.uPress, o.press || 0);
      gl.uniform1f(u.uAlpha, o.alpha);
      gl.uniform1f(u.uDim, o.dim || 0);
      gl.uniform1f(u.uScale, o.scale);
      const hx = o.hand ? (o.hand[0] - x) / r : 0, hy = o.hand ? (y - o.hand[1]) / r : 0;
      const hl = Math.hypot(hx, hy), k = hl > 0.9 ? 0.9 / hl : 1; // the dent stays on the blob's face
      gl.uniform2f(u.uHand, hx * k, hy * k);
      const e = r * 1.45;
      for (const dx of copies) {
        gl.uniform4f(u.uBox, x + dx - e, y - e, 2 * e, 2 * e);
        gl.uniform2f(u.uC, x + dx, y);
        quad.draw();
      }
    },
  };
}
