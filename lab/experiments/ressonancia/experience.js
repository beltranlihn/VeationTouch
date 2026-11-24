// Ressonància — the visual piece: a castell of light on a living trencadís.
//
// One mosaic of broken glazed tiles round the four walls (a Voronoi field in the shader, periodic round the room: no seam).
// Every tile has a small state kept on the CPU (ember heat, how much it is "fixed" into the castell, its tone, gold) and
// uploaded as one tiny float texture per frame; the shader does the ceramic: relief, grout, glaze highlights, embers.
//   - a hand is a LANTERN: it rakes light over the glaze the instant it lands (the <100 ms answer) and warms the tiles under it;
//   - the DIRECTOR (director.js) walks the five movements from what the hands do; this file turns its state into tiles;
//   - the GUIDE: on every wall a hand target (a ring and a hand: "put your hand here") and one line of text above it that says
//     what to do now. The public is led; nothing needs explaining by a person.
// Sizes are in METRES (vt.walls), hands by STROKE, distances wrap round the room. No assets, no libraries.
import { connectExperience } from '/experiences/runtime.js';
import { createDirector } from './director.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) { document.body.textContent = 'WebGL2 is not available on this machine.'; throw new Error('WebGL2 is not available'); }
const HDR = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');

const P = Object.assign({}, vt.params);
const QUALITY = { low: 0.5, medium: 0.75, high: 1 };
const LOOKS = { ember: 0, glaze: 1, seams: 2 };
const MAXH = 16, MAXW = 8;
const HAND_Y = 1.25, TARGET_R = 0.3, FLOOR_Y0 = 2.05, PINYA_Y0 = 0.7;   // metres: where hands go, the target's radius, where the floors start
const CAP = { y: 1.88, w: 4.6, h: 0.56 };                               // the line of text above each target, metres
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));

// the room in metres: all the walls in a row, and the picture's height
const room = () => ({ perimeter: vt.walls.reduce((a, w) => a + w.width, 0) || 27.6, height: vt.walls.reduce((a, w) => Math.max(a, w.height), 0) || 3.5 });
let R = room();
const NW = Math.min(MAXW, Math.max(1, vt.walls.length));
const wallIndex = new Map(vt.walls.slice(0, NW).map((w, i) => [w.id, i]));
const director = createDirector(NW), D = director.state;
// The sound piece leads when it is there: it runs the same director, hears hands land at once and owns the pulse, and posts its
// state on a BroadcastChannel. LOCAL WORKAROUND, clearly marked (the runtime has no channel between a visual piece and its sound
// piece: see NOTES.md, Requests). With nothing arriving, this page runs its own director: the piece is whole either way.
const link = { at: -1e9, ts: 0, pace: 1, beat: 0, events: [], jumped: false, told: 0 };
const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null;
if (bc) bc.onmessage = (ev) => {
  const m = ev.data; if (m?.type !== 'state' || !m.s) return;
  const { events, ...s } = m.s; Object.assign(D, s);
  link.events.push(...(events || [])); link.at = performance.now(); link.ts = m.ts; link.pace = m.pace || 1; link.beat = s.beat;
};
const following = () => performance.now() - link.at < 700;
const tell = (o) => { try { bc?.postMessage({ type: 'ctl', ...o }); } catch { /* a closed channel: carry on alone */ } };

// ------------------------------------------------------------------------------------------------ shaders
const HEAD = '#version 300 es\nprecision highp float; precision highp int;\n';
const VS = HEAD + 'out vec2 vUv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';

const FS_SCENE = HEAD + `
uniform sampler2D uState;          // per tile: ember, fixed, tone, gold
uniform sampler2D uHandTex;        // the hand drawn in a target (alpha)
uniform ivec2 uGrid;               // tiles round the room, tiles up the wall
uniform vec2 uRoom;                // perimeter, height (m)
uniform float uTime, uPx, uAmb;    // uPx: metres per pixel of this target
uniform int uLook, uN, uNT;
uniform vec4 uHand[${MAXH}];       // x, y (strip uv, y up), strength, -
uniform vec4 uGlint[3];            // two slow, faint lights that wander round the room, and the enxaneta (gold)
uniform vec4 uTgt[${MAXW}];        // a hand target per wall: x, y (strip uv), radius (m), visibility
uniform vec4 uTgtS[${MAXW}];       // held 0..1, beat ring (radius factor, 0 = none), progress arc 0..1, hand icon 0..1
in vec2 vUv; out vec4 o;

vec2 hash2(ivec2 c){
  uvec2 q = uvec2(c) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return vec2(uvec2(n, n * 48271u) >> 8) / 16777216.0;
}
int wrapX(int x){ return ((x % uGrid.x) + uGrid.x) % uGrid.x; }
vec3 pal(float t){   // the castell's tone: stone -> bone -> terracotta -> fire red
  const vec3 a = vec3(0.26,0.235,0.21), b = vec3(0.74,0.66,0.54), c = vec3(0.78,0.30,0.12), d = vec3(0.90,0.085,0.035);
  t = clamp(t, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(a,b,t) : t < 2.0 ? mix(b,c,t-1.0) : mix(c,d,t-2.0);
}
vec3 ember(float e){ return vec3(0.95,0.085,0.012) * e * 0.9 + vec3(1.0,0.34,0.05) * pow(max(e - 0.3, 0.0), 2.0) * 1.6 + vec3(1.0,0.80,0.45) * pow(max(e - 0.85, 0.0), 2.0) * 3.0; }

void main(){
  vec2 S = uRoom / vec2(uGrid);                 // a tile's cell, metres
  vec2 g = vUv * vec2(uGrid); ivec2 ic = ivec2(floor(g)); vec2 f = fract(g);
  // nearest shard
  float md = 1e9; vec2 mr = vec2(0.0); ivec2 mc = ivec2(0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = ic + ivec2(i, j), cw = ivec2(wrapX(c.x), c.y);
    vec2 r = (vec2(i, j) + 0.5 + (hash2(cw) - 0.5) * 0.78 - f) * S;
    float d = dot(r, r); if (d < md) { md = d; mr = r; mc = cw; }
  }
  // distance to its edge (the grout), and which way the edge is
  float be = 1e9; vec2 bn = vec2(0.0, 1.0);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 c = ic + ivec2(i, j), cw = ivec2(wrapX(c.x), c.y);
    vec2 r = (vec2(i, j) + 0.5 + (hash2(cw) - 0.5) * 0.78 - f) * S, dr = r - mr;
    if (dot(dr, dr) > 1e-7) { vec2 n = normalize(dr); float d = dot(0.5 * (mr + r), n); if (d < be) { be = d; bn = n; } }
  }
  vec4 st = texelFetch(uState, ivec2(mc.x, clamp(mc.y, 0, uGrid.y - 1)), 0);
  float fix = st.g, tone = st.b, gold = st.a;
  vec2 rnd = hash2(mc), rnd2 = hash2(mc + ivec2(37, 91));
  float e = st.r * mix(0.25, 1.0, rnd2.y * rnd2.y);          // some shards take the fire, some barely
  vec2 p = vUv * uRoom;

  // the ceramic: each shard is tilted a little and rounded at its edge, glazed
  float aa = uPx * 1.25, gw = 0.0035;
  float tile = uLook == 2 ? 1.0 : smoothstep(gw, gw + aa, be);
  float speck = hash2(ivec2(gl_FragCoord.xy)).x;
  vec3 N = normalize(vec3((rnd - 0.5) * 0.26 + bn * smoothstep(0.022, 0.0, be) * 0.85 + (speck - 0.5) * 0.02, 1.0));
  vec3 tonec = mix(pal(tone), vec3(1.0, 0.74, 0.27), gold);
  vec3 albedo, emis; float gloss = 1.0;
  if (uLook == 0) {            // Ember: dark glaze, the light comes from inside the shards; the castell is banked coals
    albedo = mix(vec3(0.030,0.027,0.025), vec3(0.11,0.095,0.085), rnd.x);
    albedo = mix(albedo, tonec * (0.75 + 0.25 * rnd2.x), clamp(fix + gold, 0.0, 1.0) * 0.9);
    float inner = smoothstep(0.0, 0.045, be) * (0.7 + 0.3 * rnd.y);
    float coal = 0.035 + 0.075 * rnd2.y * rnd2.y + 0.02 * sin(uTime * (0.3 + rnd.x) + rnd.y * 6.2832);
    emis = ember(e) * inner + tonec * (fix * coal + gold * 1.5 * (0.65 + 0.35 * rnd2.y)) * smoothstep(0.0, 0.03, be);
  } else if (uLook == 1) {     // Glaze: bone and stone shards that only show under the lanterns
    albedo = mix(vec3(0.36,0.34,0.31), vec3(0.86,0.82,0.74), smoothstep(0.25, 0.75, rnd.x));
    if (rnd2.x > 0.93) albedo = vec3(0.70,0.30,0.15);
    albedo = mix(albedo, tonec, clamp(fix + gold, 0.0, 1.0) * 0.92);
    emis = albedo * (e * 0.6 + fix * (0.05 + 0.07 * rnd2.y) + gold * 1.2) + vec3(1.0,0.40,0.12) * e * 0.22;
    gloss = 1.3;
  } else {                     // Seams: matte black shards, the joints carry the light
    albedo = vec3(0.022);
    float seam = exp(-be / 0.011);
    emis = (ember(e) * 1.6 + tonec * (fix * 0.9 + gold * 2.2)) * seam + tonec * fix * 0.035;
    gloss = 0.7;
  }

  // the lanterns: every hand, the two wanderers, the enxaneta
  vec3 lit = albedo * 0.010 * uAmb;
  for (int i = 0; i < ${MAXH} + 3; i++) {
    vec4 h; vec3 tint;
    if (i < ${MAXH}) { if (i >= uN) continue; h = uHand[i]; tint = vec3(1.0, 0.93, 0.82); }
    else { h = uGlint[i - ${MAXH}]; tint = i == ${MAXH} + 2 ? vec3(1.0, 0.74, 0.30) : vec3(0.75, 0.86, 1.0); }
    vec3 d = vec3(h.xy * uRoom - p, 0.32);
    d.x -= uRoom.x * floor(d.x / uRoom.x + 0.5);           // the short way round the room
    float r2 = dot(d, d), att = h.z / (1.0 + r2 * 3.2) * smoothstep(4.0, 1.2, sqrt(r2));
    if (att < 1e-4) continue;
    vec3 l = d * inversesqrt(r2), hv = normalize(l + vec3(0.0, 0.0, 1.0));
    lit += tint * att * (albedo * max(dot(N, l), 0.0) * 1.1 + pow(max(dot(N, hv), 0.0), 90.0) * 1.6 * gloss);
  }
  vec3 col = (lit + emis) * tile + vec3(0.0015) * (1.0 - tile);

  // the guide: a ring to put a hand in, the pulse closing on it, how far the group is
  vec3 ui = vec3(0.0);
  for (int i = 0; i < ${MAXW}; i++) {
    if (i >= uNT) break;
    vec4 t = uTgt[i], s = uTgtS[i];
    if (t.w < 0.004) continue;
    vec2 d = p - t.xy * uRoom; d.x -= uRoom.x * floor(d.x / uRoom.x + 0.5);
    float r = length(d), Rt = t.z;
    if (r > Rt * 3.4) continue;
    float lw = 0.007 + uPx;
    float ring = smoothstep(lw, 0.0, abs(r - Rt)) * (0.5 + 0.5 * s.x);
    float fill = exp(-r * r / (0.6 * Rt * Rt)) * s.x * 0.20;
    float beat = s.y > 0.0 ? smoothstep(lw, 0.0, abs(r - Rt * s.y)) * (1.0 - smoothstep(1.0, 3.0, s.y)) * 0.85 : 0.0;
    float ang = fract(atan(d.x, d.y) / 6.2831853 + 1.0);                         // 0 at the top, clockwise
    float arc = smoothstep(lw * 1.8, 0.0, abs(r - Rt - 0.04)) * step(ang, s.z) * step(0.002, s.z);
    vec2 huv = d / (Rt * 1.5) * 0.5 + 0.5;
    float hand = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture(uHandTex, vec2(huv.x, 1.0 - huv.y)).a * s.w : 0.0;
    ui += vec3(1.0, 0.90, 0.74) * t.w * (ring * 0.9 + fill + beat + arc * 1.3 + hand * 0.42);
  }
  o = vec4(col + ui, 1.0);
}`;

// bloom: bright parts, 4x smaller (4 taps: no shimmer on the grout)
const FS_BRIGHT = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
void main(){
  vec3 c = (texture(uTex, vUv + uTexel * vec2(-1.0,-1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,-1.0)).rgb
          + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.18, 0.95, l), 1.0);
}`;
const FS_BLUR = HEAD + `
uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846154).rgb + texture(uTex, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2307692).rgb + texture(uTex, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  o = vec4(c, 1.0);
}`;
const FS_FINAL = HEAD + `
uniform sampler2D uScene, uB1, uB2, uCap;
uniform float uBright, uBloom, uTime, uCapA; uniform vec2 uRoom; uniform vec3 uCapBox;   // the caption: centre height, width, height (m)
uniform int uNC; uniform float uCapX[${MAXW}];
in vec2 vUv; out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c = texture(uScene, vUv).rgb + (texture(uB1, vUv).rgb * 0.40 + texture(uB2, vUv).rgb * 0.55) * uBloom;
  c = 1.0 - exp(-c * 1.15 * uBright);
  c = pow(c, vec3(1.0 / 2.2));
  if (uCapA > 0.003) {                                       // the line of text, the same on every wall, above its target
    vec2 p = vUv * uRoom;
    for (int i = 0; i < ${MAXW}; i++) {
      if (i >= uNC) break;
      float dx = p.x - uCapX[i]; dx -= uRoom.x * floor(dx / uRoom.x + 0.5);
      vec2 q = vec2(dx / uCapBox.y + 0.5, (uCapBox.x - p.y) / uCapBox.z + 0.5);
      if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) { vec4 t = texture(uCap, q); c = mix(c, t.rgb, t.a * uCapA); }
    }
  }
  c += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;      // a little grain: no banding in the dark
  o = vec4(c, 1.0);
}`;

function program(vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const full = gl.getActiveUniform(p, i).name;
    u[full.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, full);
  }
  return { p, u };
}
const sceneP = program(VS, FS_SCENE), brightP = program(VS, FS_BRIGHT), blurP = program(VS, FS_BLUR), finalP = program(VS, FS_FINAL);
const vao = gl.createVertexArray();

// ------------------------------------------------------------------------------------------------ render targets
function target(w, h) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // REPEAT in x: the seam is not a seam
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}
let T = null, quality = null;
function allocate() {
  if (T) for (const t of Object.values(T)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
  quality = P.quality;
  const k = QUALITY[quality] || 1, w = Math.max(64, Math.round(vt.size.width * k)), h = Math.max(16, Math.round(vt.size.height * k));
  const q = (d) => [Math.max(16, Math.round(w / d)), Math.max(4, Math.round(h / d))];
  T = { scene: target(w, h), b1a: target(...q(4)), b1b: target(...q(4)), b2a: target(...q(16)), b2b: target(...q(16)) };
}
allocate();

// ------------------------------------------------------------------------------------------------ the guide's two small pictures
function canvasTexture(cv) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const upload = () => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); };
  upload();
  return { tex, upload };
}
// a hand, drawn once: the sign for "put your hand here"
const handCv = document.createElement('canvas'); handCv.width = handCv.height = 256;
{
  const g = handCv.getContext('2d'), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  g.fillStyle = '#fff';
  rr(84, 118, 96, 96, 30);                                                       // palm
  [[84, 72, 62], [108, 52, 82], [132, 58, 76], [156, 78, 58]].forEach(([x, y, h]) => rr(x, y, 21, h + 20, 10.5));   // fingers
  g.save(); g.translate(86, 168); g.rotate(-0.95); rr(-10, -62, 22, 70, 11); g.restore();                             // thumb
}
const handTex = canvasTexture(handCv);
// the line of text: a title and a smaller line under it
const capPx = Math.max(150, vt.size.height / R.height);                          // px per metre of the caption (sharp even at a small render)
const capCv = document.createElement('canvas'); capCv.width = Math.round(CAP.w * capPx); capCv.height = Math.round(CAP.h * capPx);
const capG = capCv.getContext('2d');
const capTex = canvasTexture(capCv);
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
function drawCaption(title, sub) {
  const g = capG, w = capCv.width, h = capCv.height;
  g.clearRect(0, 0, w, h);
  const spaced = (str, y, size, weight, track, alpha) => {
    g.font = `${weight} ${size}px ${FONT}`; g.textBaseline = 'middle';
    let tw = 0; for (const ch of str) tw += g.measureText(ch).width + track * size; tw -= track * size;
    const k = Math.min(1, (w * 0.94) / tw);                                      // never wider than the plate
    if (k < 1) { size *= k; g.font = `${weight} ${size}px ${FONT}`; tw *= k; }
    let x = (w - tw) / 2;
    // a soft dark plate under the text: readable over embers
    const gr = g.createRadialGradient(w / 2, y, 0, w / 2, y, tw * 0.62); gr.addColorStop(0, 'rgba(0,0,0,0.50)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(0, y); g.scale(1, (size * 1.5) / (tw * 0.62)); g.translate(0, -y); g.fillStyle = gr; g.fillRect(0, y - tw, w, tw * 2); g.restore();
    g.fillStyle = `rgba(255,240,220,${alpha})`;
    for (const ch of str) { g.fillText(ch, x, y); x += g.measureText(ch).width + track * size; }
  };
  if (title) spaced(title.toUpperCase(), h * 0.33, 0.15 * capPx, 500, 0.16, 0.96);
  if (sub) spaced(sub, h * 0.76, 0.09 * capPx, 400, 0.05, 0.8);
  capTex.upload();
}
// what the walls say, by movement
function caption() {
  const held = D.held.reduce((n, v) => n + (v ? 1 : 0), 0), a = director.acta();
  switch (D.move) {
    case 'brasa': return ['Touch the wall', 'Wake the embers together'];
    case 'pinya': return ['Hold every wall', `${held} of ${NW} walls held`];
    case 'tronc': return ['Press on the beat', D.floors ? `Floor ${D.floors}` : 'Hands on the wall, all together'];
    case 'pom': return ['Hold still', 'Silence. Keep your hands on the wall'];
    case 'aleta': return ['Crowned', a.castell];
    case 'baixada': return ['Keep holding', 'Bring it down, floor by floor'];
    case 'fall': return ['It fell', 'The embers remain'];
    case 'acta': return [`${a.castell} · ${a.outcome || ''}`, `${a.hands} hands · ${a.stillS} s of silence`];
    default: return ['', ''];
  }
}
let capKey = '', capShown = '', capA = 0;

// ------------------------------------------------------------------------------------------------ the tiles (CPU state)
let G = null; // the grid and everything per tile
const stateTex = gl.createTexture();
// circular difference of two positions along the room, metres
const roundM = (d) => d - R.perimeter * Math.round(d / R.perimeter);
let centres = [];
function buildGrid() {
  R = room();
  centres = vt.walls.slice(0, NW).map((w) => ((w.rect.x + w.rect.w / 2) / vt.size.width) * R.perimeter);
  const cols = Math.max(16, Math.round(R.perimeter / P.tile)), rows = Math.max(6, Math.round(R.height / P.tile)), n = cols * rows;
  const rnd = (() => { let a = 0x9e3779b9; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const F = (m) => new Float32Array(m);
  G = {
    cols, rows, n, sx: R.perimeter / cols, sy: R.height / rows, tileSize: P.tile, fh: (R.height - 0.28 - FLOOR_Y0) / 9,
    heat: F(n), tmp: F(n), fix: F(n), fixT: F(n), tone: F(n), gold: F(n), goldT: F(n), goldHot: F(n),
    line: F(n), lineT: F(n), lineBrasa: F(n), hearth: F(n), band: F(n), phase: F(n), rate: F(n),
    wall: new Int8Array(n), dw: F(n), floor: new Int8Array(n), data: F(n * 4),
  };
  for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
    const i = iy * cols + ix, u = (ix + 0.5) / cols, x = (ix + 0.5) * G.sx, y = (iy + 0.5) * G.sy;
    // Brasa's line: a slow wave at hand height, periodic round the room
    const yl = HAND_Y + 0.13 * Math.sin(u * Math.PI * 2 * 3) + 0.06 * Math.sin(u * Math.PI * 2 * 7 + 1.3);
    const wl = Math.exp(-((y - yl) ** 2) / (2 * 0.085 ** 2));
    G.phase[i] = rnd() * Math.PI * 2; G.rate[i] = 0.25 + rnd() * 0.9;
    G.lineBrasa[i] = wl > 0.08 ? wl * (0.55 + 0.45 * rnd()) : 0;
    let w = 0, dw = 1e9; for (let k = 0; k < centres.length; k++) { const d = Math.abs(roundM(x - centres[k])); if (d < dw) { dw = d; w = k; } }
    G.wall[i] = w; G.dw[i] = dw;
    G.hearth[i] = Math.exp(-(dw * dw + (y - HAND_Y) ** 2) / (2 * 0.5 ** 2)) * (0.6 + 0.4 * rnd());   // the pinya's hearth, one per wall
    G.band[i] = Math.exp(-((y - HAND_Y) ** 2) / (2 * 0.075 ** 2));                                   // the rotllana's band
    G.floor[i] = y < FLOOR_Y0 ? (y >= PINYA_Y0 ? -1 : -2) : Math.min(10, Math.floor((y - FLOOR_Y0) / G.fh));
  }
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cols, rows, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  layoutKey = '';
}
// a tower narrows as it climbs: 5 m at the base, 1.5 m on top; a pilar is a slender one
const half = (k, slim) => (2.5 - 1.75 * (Math.min(8, k) / 8)) * (slim ? 0.45 : 1);

// The castell as targets per tile. `v`: { floors, walls[] (which walls carry a tower), pinya[] (0..1 per wall: its stone base),
// crown, ring (rings round the room instead of towers), line: 'brasa' | 'hearth' | 'none', hearths[] (0..1 per wall) }.
let layoutKey = '';
function layout(v) {
  const slim = v.walls.filter(Boolean).length === 1 && !v.ring;
  for (let i = 0; i < G.n; i++) {
    const w = G.wall[i], k = G.floor[i], dw = G.dw[i];
    let fix = 0, tone = 0, gold = 0;
    if (k === -1) { if (v.pinya[w] > 0 && (v.ring || dw < 3.0 * (slim ? 0.5 : 1))) fix = 0.45 * v.pinya[w]; }
    else if (k >= 0 && (v.ring || v.walls[w])) {
      if (k < v.floors && (v.ring || dw < half(k, slim))) { fix = 1; tone = 0.10 + 0.90 * (k / 8); }
      else if (v.crown && k === v.floors && (v.ring || dw < half(k, slim) * 0.6)) { gold = 1; tone = 1; }
    }
    G.fixT[i] = fix; G.goldT[i] = gold; if (fix > 0 || gold > 0) G.tone[i] = tone;
    G.lineT[i] = v.line === 'brasa' ? G.lineBrasa[i] * (v.lineAmt ?? 1) : v.line === 'hearth' ? G.hearth[i] * v.hearths[w] : 0;
  }
}
buildGrid();

let lastJump = 'none';
vt.on('params', (p) => {
  Object.assign(P, p);
  if (P.quality !== quality) allocate();
  if (Math.abs(P.tile - G.tileSize) > 1e-6) buildGrid();
  if (P.jump !== lastJump) { lastJump = P.jump; if (P.jump && P.jump !== 'none') { director.jump(P.jump); tell({ jump: P.jump }); } }
});

if (P.jump && P.jump !== 'none') { lastJump = P.jump; director.jump(P.jump); }   // a preset may start on a movement

// ------------------------------------------------------------------------------------------------ hands
const lights = new Map();   // stroke -> { x, y (strip uv, y up), s, on }
const waves = [];           // hands that land together send a wave along the line: { x (m), age }
let lastDown = null, time = 0;
vt.on('touch', (e) => {
  if (e.type !== 'down') return;
  const x = (e.x / vt.size.width) * R.perimeter;
  if (D.move === 'brasa' && lastDown && lastDown.stroke !== e.stroke && time - lastDown.t < 0.9 && waves.length < 6) { waves.push({ x, age: 0 }); waves.push({ x: lastDown.x, age: 0 }); }
  lastDown = { stroke: e.stroke, t: time, x };
});
const handU = new Float32Array(MAXH * 4), glintU = new Float32Array(12), tgtU = new Float32Array(MAXW * 4), tgtSU = new Float32Array(MAXW * 4), capXU = new Float32Array(MAXW);
const dirHands = [];
// eased per wall, for the guide and the tiles
const W8 = () => new Float32Array(MAXW);
const tgtVis = W8(), tgtHeld = W8(), arc = W8(), weakW = W8();
let bandAmp = 0, spin = 0, rain = 0, crownT = -1, pulseT = -10;
const enx = { x: 0, y: 0, s: 0 };

function addHeat(pred, amount) { for (let i = 0; i < G.n; i++) if (pred(i)) G.heat[i] = Math.min(1.3, G.heat[i] + amount * (0.6 + 0.4 * Math.sin(G.phase[i]) ** 2)); }

function step(dt) {
  time += dt;
  // lanterns: on at once, off slowly
  const hands = vt.hands();
  for (const l of lights.values()) l.on = false;
  dirHands.length = 0;
  for (const h of hands) {
    let l = lights.get(h.stroke);
    if (!l) { if (lights.size >= MAXH * 2) continue; l = { x: 0, y: 0, s: 0, on: true }; lights.set(h.stroke, l); }
    l.x = h.x / vt.size.width; l.y = 1 - h.y / vt.size.height; l.on = true;
    const wi = wallIndex.get(h.wallId), wall = vt.walls[wi ?? 0];
    dirHands.push({ stroke: h.stroke, wall: wi ?? -1, speed: Math.hypot(h.vx || 0, h.vy || 0) / (wall?.pxPerM || 261) });
  }
  let n = 0, present = 0;
  for (const [k, l] of lights) {
    l.s = ease(l.s, l.on ? 1 : 0, dt, l.on ? 14 : 2.2);
    if (!l.on && l.s < 0.01) { lights.delete(k); continue; }
    if (l.on) present++;
    if (n < MAXH) { handU[n * 4] = l.x; handU[n * 4 + 1] = l.y; handU[n * 4 + 2] = l.s; n++; }
  }

  // ---- the director, and what it asks of the tiles
  const study = P.director === 'study';
  let view;
  if (study) {
    const all = Array(NW).fill(true), fl = clamp(Math.round(P.floors || 0), 0, 9);
    view = { key: ['s', fl, P.structure, !!P.crown].join('|'), floors: fl, walls: all, pinya: Array(NW).fill(fl > 0 ? 1 : 0), crown: !!P.crown, ring: P.structure === 'ring', line: 'brasa' };
  } else {
    const led = following();
    if (led) {
      if (D.move === 'tronc') D.beat = (link.beat + (((Date.now() - link.ts) / 1000) * link.pace) / director.times.period) % 1;   // between two messages the pulse keeps moving
      if (time - link.told > 1) { link.told = time; tell({ pace: P.pace || 1 }); }
      if (!link.jumped && P.jump && P.jump !== 'none') { link.jumped = true; tell({ jump: P.jump }); }
    } else director.step(dt * (P.pace || 1), dirHands);
    for (const ev of led ? link.events.splice(0) : D.events) {
      if (ev === 'pulse') pulseT = time;
      else if (ev === 'floor') { const k = D.floors - 1, slim = D.structure === 1; addHeat((i) => G.floor[i] === k && D.walls[G.wall[i]] && G.dw[i] < half(k, slim), 0.95); }
      else if (ev === 'down') { const k = D.floors; addHeat((i) => G.floor[i] === k && D.walls[G.wall[i]] && G.fix[i] > 0.3, 0.8); }
      else if (ev === 'fall') addHeat((i) => G.fix[i] > 0.5 || G.gold[i] > 0.5, 1.1);
      else if (ev === 'crown') { crownT = time; addHeat((i) => G.fix[i] > 0.5, 0.45); }
      else if (ev === 'move:brasa') { crownT = -1; G.goldHot.fill(0); }
    }
    D.events.length = 0;
    const m = D.move, built = m === 'tronc' || m === 'pom' || m === 'aleta' || m === 'baixada';
    const none = Array(NW).fill(0);
    view = {
      key: [m, D.floors, D.walls.map((v) => +v).join(''), m === 'pinya' ? D.held.map((v) => +v).join('') : ''].join('|'),
      floors: built ? D.floors : 0, walls: D.walls,
      pinya: built ? D.walls.map((v) => +v) : m === 'pinya' ? D.held.map((v) => (v ? 0.7 : 0)) : none,
      crown: m === 'aleta' || (m === 'baixada' && D.floors > 0), ring: false,
      line: m === 'brasa' || m === 'acta' || m === 'fall' ? 'brasa' : 'hearth', lineAmt: m === 'fall' ? 0.6 : 1,
      hearths: m === 'pinya' ? D.held.map((v) => (v ? 1 : 0.45)) : D.walls.map((v) => (v ? (m === 'pom' ? 0.35 : 0.8) : 0)),
    };
  }
  if (view.key !== layoutKey) { layoutKey = view.key; layout(view); }
  const m = study ? 'study' : D.move;

  // ---- embers: spread a little, cool down; when the castell comes down the heat rains
  rain = ease(rain, m === 'baixada' || m === 'fall' ? 1 : 0, dt, 1.5);
  const { cols, rows, heat, tmp, sx, sy } = G;
  tmp.set(heat);
  const kd = Math.min(0.2, 1.1 * dt), cool = Math.exp(-dt / Math.max(0.5, P.fade)), adv = Math.min(0.45, (rain * dt * 0.9) / sy);
  for (let iy = 0; iy < rows; iy++) {
    const up = iy < rows - 1 ? cols : 0, dn = iy > 0 ? -cols : 0, row = iy * cols;
    for (let ix = 0; ix < cols; ix++) {
      const i = row + ix, l = row + (ix === 0 ? cols - 1 : ix - 1), r = row + (ix === cols - 1 ? 0 : ix + 1);
      heat[i] = (tmp[i] + kd * ((tmp[l] + tmp[r] + tmp[i + up] + tmp[i + dn]) * 0.25 - tmp[i]) + adv * (tmp[i + up] - tmp[i])) * cool;
    }
  }
  // a hand warms the shards under it; many hands reach a little further (together answers more). In the silence, hardly.
  const warm = m === 'pom' ? 0.25 : 1;
  const reach = P.glow * Math.min(1.8, 1 + 0.1 * Math.max(0, present - 1)), sig = reach * 0.5, rx = Math.ceil(reach / sx), ry = Math.ceil(reach / sy);
  for (const l of lights.values()) {
    if (!l.on) continue;
    const hx = l.x * R.perimeter, hy = l.y * R.height, cx = Math.floor(hx / sx), cy = Math.floor(hy / sy);
    for (let j = Math.max(0, cy - ry); j <= Math.min(rows - 1, cy + ry); j++) for (let a = cx - rx; a <= cx + rx; a++) {
      const ix = ((a % cols) + cols) % cols, dx = (a + 0.5) * sx - hx, dy = (j + 0.5) * sy - hy, i = j * cols + ix;
      heat[i] = Math.min(1.1, heat[i] + dt * 1.5 * warm * Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)));
    }
  }
  // waves along Brasa's line, both ways round the room, until they meet on the far side
  for (let w = waves.length - 1; w >= 0; w--) {
    const wv = waves[w]; wv.age += dt;
    const front = wv.age * 3.0, amp = 1 - front / (R.perimeter / 2);
    if (amp <= 0) { waves.splice(w, 1); continue; }
    for (let i = 0; i < G.n; i++) {
      if (G.lineBrasa[i] <= 0) continue;
      const d = Math.abs(Math.abs(roundM(((i % cols) + 0.5) * sx - wv.x)) - front);
      if (d < 0.45) heat[i] = Math.min(1.35, heat[i] + dt * 3.2 * amp * G.lineBrasa[i] * (1 - d / 0.45));
    }
  }

  // ---- per wall: the guide's targets, the rotllana's arcs, the trembling
  let closed = 0;
  for (let w = 0; w < NW; w++) {
    const inS = !study && D.walls[w], held = !study && D.count[w] > 0;
    const vis = study ? 0 : m === 'pinya' ? 1 : (m === 'tronc' || m === 'pom' || m === 'baixada') && inS ? 1 : 0;
    tgtVis[w] = ease(tgtVis[w], vis, dt, 3); tgtHeld[w] = ease(tgtHeld[w], held ? 1 : 0, dt, held ? 12 : 3);
    arc[w] = ease(arc[w], m === 'pinya' && D.held[w] ? 1 : 0, dt, 1.2);
    weakW[w] = ease(weakW[w], m === 'tronc' && inS ? Math.min(1, D.weak[w] / 2) : 0, dt, 2.5);
    closed += arc[w] / NW;
    const breathe = 0.82 + 0.18 * Math.sin(time * 1.6 + w);
    tgtU[w * 4] = centres[w] / R.perimeter; tgtU[w * 4 + 1] = HAND_Y / R.height; tgtU[w * 4 + 2] = TARGET_R; tgtU[w * 4 + 3] = tgtVis[w] * (P.guide === false ? 0 : 1);
    tgtSU[w * 4] = tgtHeld[w];
    tgtSU[w * 4 + 1] = m === 'tronc' ? 1 + (1 - D.beat) * 2.0 : 0;                                   // the pulse closes on the ring
    tgtSU[w * 4 + 2] = m === 'pom' ? D.climb : m === 'tronc' ? D.progress : 0;
    tgtSU[w * 4 + 3] = (1 - tgtHeld[w] * 0.75) * breathe;
    capXU[w] = centres[w];
  }
  bandAmp = ease(bandAmp, m === 'pinya' ? 1 : 0, dt, 1.2);
  spin += dt * (0.03 + 0.22 * closed * closed);

  // ---- the enxaneta: a gold light that climbs the castell in a turn round the room
  const enxOn = !study && (m === 'pom' || m === 'aleta');
  enx.s = ease(enx.s, enxOn ? 1 : 0, dt, enxOn ? 2 : 0.8);
  if (enxOn) {
    const lead = D.stats.lead >= 0 ? D.stats.lead : Math.max(0, D.walls.indexOf(true)), topY = FLOOR_Y0 + (D.floors + 0.5) * G.fh;
    const c = D.climb * D.climb * (3 - 2 * D.climb);
    enx.x = (((centres[lead] + c * R.perimeter) % R.perimeter) + R.perimeter) % R.perimeter; enx.y = 1.5 + c * (topY - 1.5);
  }
  if (enx.s > 0.02) {
    const cx = Math.floor(enx.x / sx), cy = Math.floor(enx.y / sy);
    for (let j = Math.max(0, cy - 2); j <= Math.min(rows - 1, cy + 2); j++) for (let a = cx - 2; a <= cx + 2; a++) {
      const ix = ((a % cols) + cols) % cols, dx = (a + 0.5) * sx - enx.x, dy = (j + 0.5) * sy - enx.y, i = j * cols + ix;
      G.goldHot[i] = Math.min(1, G.goldHot[i] + dt * 4 * enx.s * Math.exp(-(dx * dx + dy * dy) / (2 * 0.16 ** 2)));
    }
  }

  // ---- everything per tile
  const data = G.data, breath = 0.5 - 0.5 * Math.cos((time / 10) * Math.PI * 2);
  const ph = D.beat, beatEnv = m === 'tronc' ? (ph > 0.7 ? ((ph - 0.7) / 0.3) ** 2 * 0.20 : 0) + Math.exp(-(time - pulseT) / 0.4) * 0.55 : 0;
  const goldCool = Math.exp(-dt / 5), crownAge = m === 'aleta' && crownT >= 0 ? time - crownT : -1, topRow = R.height - 0.32, span = (R.perimeter / (2 * NW)) * 1.2;
  for (let i = 0; i < G.n; i++) {
    const w = G.wall[i], k = 1 - Math.exp(-dt * (0.6 + G.rate[i] * 1.6));
    G.fix[i] += (G.fixT[i] - G.fix[i]) * k; G.line[i] += (G.lineT[i] - G.line[i]) * k;
    G.goldHot[i] *= goldCool;
    let goldT = G.goldT[i];
    if (crownAge >= 0 && (Math.floor(i / cols) + 0.5) * sy >= topRow && crownAge * 9 > Math.abs(roundM(((i % cols) + 0.5) * sx - enx.x))) goldT = 1;   // l'aleta: gold runs round the top
    G.gold[i] += (goldT - G.gold[i]) * k;
    let base = G.line[i] > 0.001 ? P.ambience * G.line[i] * (0.10 + 0.09 * breath + 0.06 * Math.sin(time * G.rate[i] + G.phase[i]) + beatEnv) : 0;
    if (bandAmp > 0.01 && G.band[i] > 0.02) {       // the rotllana: arcs grow from the held walls and, joined, turn
      const a = clamp((arc[w] * span - G.dw[i]) / 0.6 + 0.5, 0, 1);
      if (a > 0) base += bandAmp * G.band[i] * a * (0.10 + 0.30 * closed) * (0.55 + 0.45 * Math.sin(Math.PI * 2 * ((((i % cols) + 0.5) / cols) * 24 - spin * 24)));
    }
    let fix = G.fix[i];
    if (weakW[w] > 0.02 && G.floor[i] >= 0 && G.floor[i] >= D.floors - 2) fix *= 1 - 0.55 * weakW[w] * (0.5 + 0.5 * Math.sin(time * 21 + G.phase[i] * 3));   // a floor nobody holds trembles
    data[i * 4] = heat[i] + base; data[i * 4 + 1] = fix; data[i * 4 + 2] = G.tone[i]; data[i * 4 + 3] = Math.max(G.gold[i], G.goldHot[i]);
  }
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, data);

  // the two wanderers: opposite sides of the room, a turn every two minutes, drifting up and down; and the enxaneta's light
  for (let g = 0; g < 2; g++) {
    glintU[g * 4] = (((time / 120 + g * 0.5) % 1) + 1) % 1;
    glintU[g * 4 + 1] = 0.42 + 0.2 * Math.sin(time * 0.05 + g * 2.1);
    glintU[g * 4 + 2] = 0.22 * P.ambience;
  }
  glintU[8] = enx.x / R.perimeter; glintU[9] = enx.y / R.height;
  glintU[10] = enx.s * (D.restless ? 0.45 + 0.35 * Math.sin(time * 17) : 0.9 + 0.1 * Math.sin(time * 2.3));

  // ---- the line of text: fades out, changes, fades in; a counter that changes inside a movement just redraws
  const [title, sub] = study || P.guide === false ? ['', ''] : caption(), key = (study ? 'study' : D.move) + '|' + title, text = title + '\n' + sub;
  if (key !== capKey) { capA = ease(capA, 0, dt, 6); if (capA < 0.03) { capKey = key; capShown = text; drawCaption(title, sub); } }
  else { if (text !== capShown) { capShown = text; drawCaption(title, sub); } capA = ease(capA, title ? 1 : 0, dt, 2.5); }
  return n;
}

function pass(prog, dst, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
  gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height);
  gl.useProgram(prog.p); setup(prog.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };

function frame(dt) {
  const n = step(dt);
  gl.bindVertexArray(vao);
  pass(sceneP, T.scene, (u) => {
    bind(1, handTex.tex); bind(0, stateTex); gl.uniform1i(u.uState, 0); gl.uniform1i(u.uHandTex, 1);
    gl.uniform2i(u.uGrid, G.cols, G.rows); gl.uniform2f(u.uRoom, R.perimeter, R.height);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uPx, R.height / T.scene.h); gl.uniform1f(u.uAmb, P.ambience);
    gl.uniform1i(u.uLook, LOOKS[P.look] ?? 0); gl.uniform1i(u.uN, n); gl.uniform1i(u.uNT, NW);
    gl.uniform4fv(u.uHand, handU); gl.uniform4fv(u.uGlint, glintU); gl.uniform4fv(u.uTgt, tgtU); gl.uniform4fv(u.uTgtS, tgtSU);
  });
  pass(brightP, T.b1a, (u) => { bind(0, T.scene.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / T.scene.w, 1 / T.scene.h); });
  const blur = (src, dst, dx, dy) => pass(blurP, dst, (u) => { bind(0, src.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, dx / src.w, dy / src.h); });
  blur(T.b1a, T.b1b, 1, 0); blur(T.b1b, T.b1a, 0, 1);
  blur(T.b1a, T.b2a, 2, 0); blur(T.b2a, T.b2b, 1, 0); blur(T.b2b, T.b2a, 0, 1);
  pass(finalP, null, (u) => {
    bind(0, T.scene.tex); bind(1, T.b1a.tex); bind(2, T.b2a.tex); bind(3, capTex.tex);
    gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uB1, 1); gl.uniform1i(u.uB2, 2); gl.uniform1i(u.uCap, 3);
    gl.uniform1f(u.uBright, P.brightness); gl.uniform1f(u.uBloom, P.bloom); gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uRoom, R.perimeter, R.height); gl.uniform3f(u.uCapBox, CAP.y, CAP.w, CAP.h); gl.uniform1f(u.uCapA, capA);
    gl.uniform1i(u.uNC, NW); gl.uniform1fv(u.uCapX, capXU);
  });
}

window.__ressonancia = { director };   // for the lab's checks only: nothing reads it
vt.loop(frame, gl);
