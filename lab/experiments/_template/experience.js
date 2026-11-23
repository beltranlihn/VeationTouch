// Lab template — Halo. A runtime-ready visual experience in ~150 lines: every hand leaves a soft light that slowly dissolves.
//
// What it shows (copy and change):
//   - connectExperience() and vt.loop(fn, gl): the page draws, the runtime takes the frame to the room.
//   - hands by STROKE (vt.hands()), never by tracker id; positions in render px -> strip fractions; sizes in METRES (vt.walls).
//   - SEAMLESS 360: the texture repeats in x and the distance wraps, so a light crossing P3 -> P4 is one light.
//   - vt.params + vt.on('params'): the knobs the operator gets in the Experiences tab (see manifest.json).
//   - a feedback texture (the trail) at a fraction of the render size: smooth things need no more.
//   - no assets, no libraries: all procedural.
import { connectExperience } from '/experiences/runtime.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) { document.body.textContent = 'WebGL2 is not available on this machine.'; throw new Error('WebGL2 is not available'); }
const HALF = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');

// the room in metres: the perimeter (all walls in a row) and the picture's height. (The walls differ by 1 % in px per metre: ignored here.)
const room = () => ({ perimeter: vt.walls.reduce((a, w) => a + w.width, 0), height: vt.walls[0]?.height || 3.5 });
let R = room();
const P = Object.assign({}, vt.params);
let quality = P.quality;
const SCALE = { low: 0.2, medium: 0.35, high: 0.6 };
vt.on('params', (p) => { Object.assign(P, p); if (P.quality !== quality) { quality = P.quality; allocate(); } });

// ------------------------------------------------------------------------------------------------ shaders
const HEAD = '#version 300 es\nprecision highp float;\n';
const VS = HEAD + 'out vec2 vUv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';
const MAXH = 16;
// the trail: last frame x decay + a soft light along each hand's last step (distances in METRES, wrapping round the room)
const FS_TRAIL = HEAD + `
uniform sampler2D uPrev; uniform float uDecay, uPerim, uHeight, uSigma, uGain; uniform int uN;
uniform vec4 uCur[${MAXH}]; uniform vec4 uOld[${MAXH}]; uniform vec4 uInfo[${MAXH}]; // x,y strip uv; info: size, rate, hue
in vec2 vUv; out vec4 o;
vec2 wrapD(vec2 d){ d.x -= floor(d.x + 0.5); return d * vec2(uPerim, uHeight); }
void main(){
  vec3 acc = texture(uPrev, vUv).rgb * uDecay;
  for (int i = 0; i < ${MAXH}; i++) {
    if (i >= uN) break;
    vec2 pa = wrapD(vUv - uOld[i].xy), ba = wrapD(uCur[i].xy - uOld[i].xy);
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    float d = length(pa - ba * h), s = uSigma * uInfo[i].x;
    vec3 warm = vec3(1.0, 0.84, 0.60), cool = vec3(0.58, 0.82, 1.0);
    acc += mix(warm, cool, uInfo[i].z) * exp(-d * d / (2.0 * s * s)) * uInfo[i].y * uGain;
  }
  o = vec4(acc, 1.0);
}`;
const FS_SHOW = HEAD + `
uniform sampler2D uTrail; uniform float uTime, uBright, uAmb, uPerim;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
// noise on the room's circle: periodic in x with period 1, so the mist has no seam
float mist(vec2 uv, float t){
  float a = uv.x * 6.2831853, R = uPerim / 6.2831853 * 0.35;
  vec2 q = vec2(R*cos(a), R*sin(a)) + vec2(t*0.02, uv.y*2.0);
  return vnoise(q*1.7 + vec2(0.0, t*0.015)) * 0.6 + vnoise(q*3.9 - vec2(t*0.01, 0.0)) * 0.3 + vnoise(q*8.1) * 0.1;
}
void main(){
  vec3 t = texture(uTrail, vUv).rgb * uBright;
  vec3 col = vec3(0.012, 0.018, 0.030) + vec3(0.015, 0.03, 0.05) * mist(vUv, uTime) * uAmb + (1.0 - exp(-t * 1.6));
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0; // a little grain: no banding in the dark
  o = vec4(col, 1.0);
}`;

function program(vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const full = gl.getActiveUniform(p, i).name, name = full.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, full);
  }
  return { p, u };
}
const trailP = program(VS, FS_TRAIL), showP = program(VS, FS_SHOW);
const vao = gl.createVertexArray();

// ------------------------------------------------------------------------------------------------ the trail (ping-pong)
let ping = null;
function target(w, h) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, HALF ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HALF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // REPEAT in x: the seam is not a seam
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo, w, h };
}
function allocate() {
  if (ping) for (const t of ping) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
  const k = SCALE[quality] || SCALE.medium, w = Math.max(64, Math.round(vt.size.width * k)), h = Math.max(16, Math.round(vt.size.height * k));
  ping = [target(w, h), target(w, h)];
}
allocate();

// ------------------------------------------------------------------------------------------------ hands -> lights
const seen = new Map(); // stroke -> { x, y (strip uv), hue }
let hueSeq = 0, time = 0;
const cur = new Float32Array(MAXH * 4), old = new Float32Array(MAXH * 4), info = new Float32Array(MAXH * 4);

function frame(dt) {
  time += dt;
  if (vt.walls.length) R = room();
  const alive = new Set();
  let n = 0;
  for (const h of vt.hands()) {
    if (n >= MAXH) break;
    alive.add(h.stroke);
    const x = h.x / vt.size.width, y = 1 - h.y / vt.size.height;       // strip uv; y up (0 = the floor)
    let s = seen.get(h.stroke);
    if (!s) { s = { x, y, hue: (hueSeq++ * 0.382) % 1 }; seen.set(h.stroke, s); } // a new stroke starts where it lands: no line from nowhere
    cur.set([x, y, 0, 0], n * 4); old.set([s.x, s.y, 0, 0], n * 4);
    info.set([1, 1, s.hue, 0], n * 4);
    s.x = x; s.y = y; n++;
  }
  for (const k of [...seen.keys()]) if (!alive.has(k)) seen.delete(k);

  const [a, b] = ping, decay = Math.exp((-dt * 4.6) / Math.max(0.5, P.fade));
  gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo); gl.viewport(0, 0, b.w, b.h); gl.useProgram(trailP.p); gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
  const U = trailP.u;
  gl.uniform1i(U.uPrev, 0); gl.uniform1f(U.uDecay, decay); gl.uniform1f(U.uPerim, R.perimeter); gl.uniform1f(U.uHeight, R.height);
  gl.uniform1f(U.uSigma, P.glow); gl.uniform1f(U.uGain, dt * 2.2); gl.uniform1i(U.uN, n);
  gl.uniform4fv(U.uCur, cur); gl.uniform4fv(U.uOld, old); gl.uniform4fv(U.uInfo, info);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(showP.p);
  gl.bindTexture(gl.TEXTURE_2D, b.tex);
  gl.uniform1i(showP.u.uTrail, 0); gl.uniform1f(showP.u.uTime, time); gl.uniform1f(showP.u.uBright, P.brightness); gl.uniform1f(showP.u.uAmb, P.ambience); gl.uniform1f(showP.u.uPerim, R.perimeter);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ping = [b, a];
}

vt.loop(frame, gl);
