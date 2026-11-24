// Ressonància — scene "fire": I. Brasa. A line of embers breathing at hand height in the dark; every touch throws correfoc sparks.
// See host.js for the contract.
//
//   - THE LINE: a slow wavy band of coals at ~1.25 m, periodic round the room. Drawn in one fullscreen pass: domain-warped noise for
//     lumps, ridged noise for the glowing cracks, grey ash on the crust, a rare crackle, a slow travelling swell of heat. Its heat
//     lives on the CPU as 512 cells round the room (hands and waves warm it; it cools slowly) plus the progress of the chapter.
//   - THE SPARKS: 65 536 particles on the GPU, state in two RGBA32F textures (pos.xy vel.xy | age life heat0 gscale+seed) updated
//     in one MRT pass. Spawning is a ring buffer: each frame the CPU writes up to 128 emitter records (a range of slots + how to
//     launch them) into a tiny float texture; slots in a range are reborn that frame. Drawn as instanced streaks (head bright, tail
//     dim, length = velocity x a short shutter), additive, HDR; colour from a cooling blackbody ramp (yellow-white -> orange -> red).
//     A second instance copy draws the sparks near the seam shifted by one perimeter: nothing is cut between the last wall and the first.
//   - A LANDING HAND: a fountain at once (same frame) + a flash of glow; a resting hand: a small glow and a trickle; a dragged hand:
//     a trail. TWO HANDS within 0.9 s: a wave of fire from their midpoint, both ways round the line at waveSpeed, until the fronts meet.
//   - progress: few faint embers (0) -> a whole ring of live fire with low flames and rising sparks (1).
//   - gather: the ring contracts into four hearths (one per wall centre, 1.25 m) and dims to ash and warm earth.
// Sizes in metres; x wraps at the perimeter; no allocation per frame; no readPixels.
export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls, roundM } = env;
  const PER = room.perimeter, RH = room.height;
  const MAXH = 32, MAXW = 8, MAXE = 128, MAXC = 8, NCELL = 512;
  const SW = 256, SH = 256, N = SW * SH;                      // sparks
  const LINE_Y = 1.25;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------------------------------------------------------------------------------------------------------------- GLSL shared
  const COMMON = `
uniform vec2 uRoom; uniform float uTime, uGather;
float lineY(float x){                       // the ember line: periodic (integer harmonics of the perimeter)
  float a = 6.2831853 / uRoom.x;
  float y = 1.25 + 0.075 * sin(a * 3.0 * x + uTime * 0.071) + 0.045 * sin(a * 7.0 * x - uTime * 0.113 + 1.3) + 0.02 * sin(a * 13.0 * x + uTime * 0.05 + 4.0);
  return mix(y, 1.25, uGather);
}
vec3 fire(float T){                         // a cooling ember / spark: dark red -> orange -> yellow-white
  T = max(T, 0.0);
  float r = smoothstep(0.02, 0.55, T), g = smoothstep(0.45, 1.35, T) * 0.62 * r, b = smoothstep(0.95, 1.9, T) * 0.95 * g;
  return vec3(r, g, b) * T * 1.4;
}`;

  // ---------------------------------------------------------------------------------------------------------------- sparks: update
  const updP = program(VS, HEAD + COMMON + `
uniform sampler2D uPos, uLife, uEm; uniform int uNE, uFrame; uniform float uDt;
layout(location = 0) out vec4 oPos; layout(location = 1) out vec4 oLife;
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(inout uint s){ s = pcg(s); return float(s) * (1.0 / 4294967296.0); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy); int idx = c.y * ${SW} + c.x;
  vec4 P = texelFetch(uPos, c, 0), L = texelFetch(uLife, c, 0);
  for (int e = 0; e < ${MAXE}; e++) {
    if (e >= uNE) break;
    vec4 A = texelFetch(uEm, ivec2(0, e), 0);
    int d = ((idx - int(A.x)) % ${N} + ${N}) % ${N};
    if (d >= int(A.y)) continue;
    vec4 B = texelFetch(uEm, ivec2(1, e), 0), C = texelFetch(uEm, ivec2(2, e), 0), D = texelFetch(uEm, ivec2(3, e), 0);
    uint s = uint(idx) * 1664525u ^ (uint(uFrame) * 2654435769u);
    float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s), r4 = rnd(s), r5 = rnd(s), r6 = rnd(s);
    vec2 p;
    if (D.z > 0.5) { p.x = A.z + r1 * C.x; p.y = lineY(p.x) + (r2 - 0.5) * C.y; }           // along the ember line
    else { float a = r1 * 6.2831853, rr = sqrt(r2); p = A.zw + vec2(cos(a), sin(a)) * rr * C.xy; }   // in a small disc
    float ang = B.x + (r3 - 0.5) * 2.0 * B.y, sp = mix(B.z, B.w, pow(r4, 1.6));
    vec2 v = vec2(cos(ang), sin(ang)) * sp + D.xy * (0.6 + 0.4 * r5);
    float life = C.w * (0.55 + 0.45 * r6), h0 = C.z * (0.8 + 0.4 * r5);
    oPos = vec4(mod(p.x, uRoom.x), p.y, v); oLife = vec4(0.0, life, h0, floor(D.w * 64.0 + 0.5) + r6 * 0.999);
    return;
  }
  if (L.x >= L.y) { oPos = P; oLife = L; return; }
  float age = L.x, T = L.z * exp(-age * 1.6 / L.y), gs = floor(L.w) / 64.0, sd = fract(L.w);
  vec2 v = P.zw;
  vec2 acc = vec2(0.0, -4.2 * gs + 1.1 * min(T, 1.6) + (1.0 - gs) * 0.35);              // gravity, buoyancy while hot
  acc.x += 0.9 * sin(P.y * 2.3 + uTime * 0.8 + sd * 6.2831) + 1.3 * sin(age * (6.0 + sd * 5.0) + sd * 40.0) * (0.4 + 0.6 * (1.0 - gs));
  acc.y += 0.6 * sin(age * (4.0 + sd * 3.0) + sd * 17.0);
  v += acc * uDt; v *= exp(-uDt * mix(2.4, 1.1, gs));                                         // drag: sparks are light
  P.xy += v * uDt; P.x = mod(P.x, uRoom.x); P.zw = v;
  L.x += uDt;
  if (P.y < -0.05 || P.y > uRoom.y + 0.4) L.x = L.y + 1.0;
  oPos = P; oLife = L;
}`);

  // ---------------------------------------------------------------------------------------------------------------- sparks: draw
  const SPARK_VS = HEAD + COMMON + `
uniform sampler2D uPos, uLife; uniform float uMpp, uShutter, uGain;
out vec2 vQ; out vec3 vCol;
void main(){
  int id = gl_InstanceID, copy = id >= ${N} ? 1 : 0; id -= copy * ${N};
  ivec2 c = ivec2(id % ${SW}, id / ${SW});
  vec4 P = texelFetch(uPos, c, 0), L = texelFetch(uLife, c, 0);
  float shift = 0.0;
  if (copy == 1) { if (P.x < 0.6) shift = uRoom.x; else if (P.x > uRoom.x - 0.6) shift = -uRoom.x; else L.x = L.y + 1.0; }
  if (L.x >= L.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vQ = vec2(0.0); vCol = vec3(0.0); return; }
  float sd = fract(L.w), T = L.z * exp(-L.x * 2.0 / L.y);
  float fade = smoothstep(L.y, L.y * 0.6, L.x) * smoothstep(0.0, 0.04, L.x);
  float tw = 0.75 + 0.25 * sin(uTime * (17.0 + sd * 23.0) + sd * 60.0);                   // a spark twinkles
  float w = max(0.0035 + 0.004 * sd * sd + 0.002 * min(T, 1.5), 0.75 * uMpp);
  vec2 head = vec2(P.x + shift, P.y), v = P.zw, tail = head - v * uShutter;
  vec2 dv = head - tail; float len = length(dv);
  vec2 dir = len > 1e-5 ? dv / len : vec2(0.0, 1.0), nrm = vec2(-dir.y, dir.x);
  int vid = gl_VertexID; float a = float(vid & 1), sdn = float(vid >> 1) * 2.0 - 1.0;
  vec2 p = mix(tail - dir * w, head + dir * w, a) + nrm * sdn * w * 1.5;
  vQ = vec2(a, sdn);
  float energy = mix(1.0, clamp(3.0 * w / (len + 2.0 * w), 0.15, 1.0), 0.6);
  vCol = fire(T) * fade * tw * energy * uGain;
  gl_Position = vec4(p / uRoom * 2.0 - 1.0, 0.0, 1.0);
}`;
  const sparkP = program(SPARK_VS, HEAD + `in vec2 vQ; in vec3 vCol; out vec4 o;
void main(){ float along = vQ.x * vQ.x * (0.35 + 0.65 * vQ.x); float across = exp(-vQ.y * vQ.y * 3.5); o = vec4(vCol * along * across, 1.0); }`);

  // ---------------------------------------------------------------------------------------------------------------- the ember line
  const lineP = program(VS, HEAD + COMMON + `
uniform sampler2D uHeat; uniform float uProg, uHeatK, uMpp;
uniform int uN, uNW, uNC; uniform vec4 uHand[${MAXH}]; uniform vec4 uWave[${MAXW}]; uniform float uCen[${MAXC}];
in vec2 vUv; out vec4 o;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), u.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), u.x), u.y); }
// fbm periodic in x: f = base frequency (1/m); the lattice period is the whole room
float fbm(float x, float y, float f, int oct){
  float per = max(1.0, floor(uRoom.x * f + 0.5)); vec2 p = vec2(x * per / uRoom.x, y * f);
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * vn(p, per); n += a; p = p * 2.0 + vec2(0.0, 17.3); per *= 2.0; a *= 0.5; }
  return s / n; }
float heatAt(float x){ float u = mod(x / uRoom.x, 1.0) * ${NCELL}.0 - 0.5; float i0 = floor(u), f = u - i0;
  int a = int(mod(i0, ${NCELL}.0)), b = int(mod(i0 + 1.0, ${NCELL}.0));
  return mix(texelFetch(uHeat, ivec2(a, 0), 0).r, texelFetch(uHeat, ivec2(b, 0), 0).r, f); }
float wrapd(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }
void main(){
  vec2 p = vUv * uRoom; float x = p.x, y = p.y, t = uTime, g = uGather, PR = uRoom.x;
  // gather: the fire slides toward the wall centres (a smooth, monotone warp per segment between two centres) and a window keeps only the hearths
  float xs = x, dc = 1e3;
  if (g > 0.0 && uNC > 0) {
    for (int i = 0; i < ${MAXC}; i++) { if (i >= uNC) break;
      float c0 = uCen[i], c1 = i + 1 < uNC ? uCen[i + 1] : uCen[0] + PR;
      float Ls = mod(c1 - c0, PR); if (Ls < 1e-3) Ls = PR;
      float d = mod(x - c0, PR);
      if (d < Ls) { float k = d / Ls; xs = c0 + Ls * (k + 0.85 * g * sin(6.2831853 * k) / 6.2831853); dc = min(d, Ls - d); break; } }
  }
  float win = mix(1.0, exp(-pow(dc / mix(3.0, 0.75, g), 2.0)), smoothstep(0.0, 0.3, g));
  float yl = lineY(xs), dy = y - yl;
  vec3 col = vec3(0.0);

  // fronts of the waves of fire (real x: they run round the room) and their meeting flash
  float front = 0.0;
  for (int i = 0; i < ${MAXW}; i++) { if (i >= uNW) break; vec4 W = uWave[i];
    float d = abs(wrapd(x - W.x));
    front += W.z * exp(-pow((d - W.y) / 0.42, 2.0)) + W.w * exp(-pow((d - 0.5 * PR) / 0.9, 2.0)); }

  float hc = heatAt(xs);
  float hot = hc + front;
  float cl = fbm(xs, t * 0.025, 0.55, 3);
  float thr = mix(0.57, 0.0, uProg) - 0.55 * min(hot, 1.2);
  float cluster = smoothstep(thr, thr + 0.13, cl);
  float breath = 0.78 + 0.22 * sin(t * 0.55 + cl * 11.0);
  float swell = 0.82 + 0.18 * sin(6.2831853 * 2.0 * xs / PR - t * 0.32);
  float H = cluster * mix(0.7, 1.0, uProg) * breath * swell + hc * 0.9 + front;
  H *= uHeatK * mix(1.0, 0.42, g) * win;

  if (abs(dy) < 0.75) {
    // coals: warped lumps, glowing cracks, ash on the crust
    float wx = fbm(xs, y * 1.0 + 3.1, 2.2, 3) - 0.5;
    float lumps = fbm(xs + wx * 0.25, y + wx * 0.2, 6.5, 4);
    float rid = 1.0 - abs(2.0 * fbm(xs + wx * 0.18, y - wx * 0.15 + 9.0, 9.0, 4) - 1.0);
    float veins = pow(rid, 5.0);
    float th = (mix(0.045, 0.11, uProg) + 0.05 * min(hot, 1.5)) * (0.6 + 0.8 * lumps) + g * 0.24 * exp(-pow(dc / 0.75, 2.0));
    float edge = abs(dy) + (fbm(xs, y, 18.0, 2) - 0.5) * 0.06;
    float band = smoothstep(th, th * 0.3, edge);
    float core = 1.0 - 0.45 * clamp(abs(dy) / max(th, 1e-3), 0.0, 1.0);
    float coal = band * (0.16 + 1.0 * veins + 0.4 * pow(lumps, 3.0)) * core;
    // crackle: rare tiny cells flare for a moment
    float cper = floor(PR * 40.0 + 0.5); vec2 cc = floor(vec2(xs * cper / PR, y * 40.0));
    float ph = h12(cc + 7.0); vec2 cf = fract(vec2(xs * cper / PR, y * 40.0)) - 0.5 - (vec2(h12(cc + 3.0), h12(cc + 5.0)) - 0.5) * 0.5;
    float fl = step(0.993, h12(cc + floor(t * 5.0 + ph * 5.0))) * exp(-dot(cf, cf) * 60.0);
    float T = H * coal * 0.82 + fl * band * min(H, 1.0) * 0.9;
    col += fire(T);
    // ash: dust grey on the crust, barely lit by the fire round it
    float ash = band * (1.0 - smoothstep(0.1, 0.5, veins)) * smoothstep(0.35, 0.75, fbm(xs, y + 40.0, 26.0, 3));
    col += vec3(0.05, 0.036, 0.026) * ash * (0.02 + 0.3 * min(H, 1.2) + 0.5 * g * win);
    // low flames above the coals: only when the ring is awake or where a wave runs
    float fa = (smoothstep(0.35, 1.0, uProg) * 0.65 + min(front, 1.5) * 0.9 + min(hc, 1.0) * 0.35) * win * (1.0 - 0.85 * g) * uHeatK;
    if (fa > 0.01 && dy > -0.1) {
      float fx = fbm(xs, dy * 2.6 - t * 1.35, 4.5, 4), tall = 0.16 + 0.32 * fa;
      float fsh = fx - smoothstep(-0.02, tall, dy) * 0.75 - 0.22 + 0.15 * fbm(xs, -t * 0.5, 0.8, 2);
      float flame = fa * smoothstep(0.0, 0.16, fsh) * smoothstep(-0.1, 0.0, dy);
      col += fire(0.4 + flame * 0.35 + fsh * 0.25) * flame * 0.45;
    }
    // heat glow round the line (low frequency only: no texture in the air)
    // gather: the colour settles to warm earth
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    col = mix(col, vec3(0.62, 0.3, 0.13) * lum * 1.6 + col * 0.25, 0.55 * g);
    col += vec3(0.32, 0.14, 0.06) * g * exp(-dc * dc / 0.35 - dy * dy / 0.03) * 0.09 * uHeatK;   // the hearth: a low warm-earth glow
  }
  // hands: a warm light under the palm; a flash when it lands
  for (int i = 0; i < ${MAXH}; i++) { if (i >= uN) break; vec4 h = uHand[i];
    vec2 d = vec2(wrapd(x - h.x), y - h.y); float r2 = dot(d, d);
    float k = h.z * (0.22 + 1.6 * h.w);
    col += vec3(1.0, 0.42, 0.12) * k * exp(-r2 / 0.012) + vec3(0.7, 0.16, 0.04) * h.z * (0.06 + 0.25 * h.w) * exp(-r2 / 0.2);
    col += vec3(1.0, 0.8, 0.55) * h.w * h.z * 1.5 * exp(-r2 / 0.002); }
  o = vec4(col, 1.0);
}`);

  // ---------------------------------------------------------------------------------------------------------------- GPU state
  const fl = (w, h, data) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const dead = new Float32Array(N * 4); for (let i = 0; i < N; i++) { dead[i * 4] = 1; dead[i * 4 + 1] = 0; }   // age 1 > life 0: dead
  const zero = new Float32Array(N * 4);
  const S = [0, 1].map(() => {
    const pos = fl(SW, SH, zero), life = fl(SW, SH, dead), fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, life, 0);
    return { pos, life, fbo };
  });
  let cur = 0;
  const emData = new Float32Array(MAXE * 16), emTex = fl(4, MAXE, null);
  const heat = new Float32Array(NCELL), heatData = new Float32Array(NCELL * 4), heatTex = fl(NCELL, 1, null);
  const vao = gl.createVertexArray();
  const DRAWS = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];

  // ---------------------------------------------------------------------------------------------------------------- CPU state
  const hu = new Float32Array(MAXH * 4), wu = new Float32Array(MAXW * 4), cen = new Float32Array(MAXC);
  const NC = Math.min(MAXC, walls.length);
  walls.slice(0, NC).map((w) => w.centre).sort((a, b) => a - b).forEach((c, i) => { cen[i] = c; });
  const waves = Array.from({ length: MAXW }, () => ({ on: false, x: 0, t: 0, met: false, mt: 0 }));
  let stepDt = 1 / 60, nh = 0, nw = 0, nE = 0, cursor = 0, frameNo = 0, time = 0, gatherS = 0;
  let lastDownT = -1e9, lastDownX = 0, lastDownStroke = -1, lastWaveT = -1e9;
  const P = env.params;
  const prm = (k, d) => (typeof P[k] === 'number' && isFinite(P[k]) ? P[k] : d);

  // one emitter record: `count` slots from the ring, launched as described
  function emit(count, x, y, ang, spread, vmin, vmax, sx, sy, heat0, life, ivx, ivy, line, gscale) {
    count = Math.min(Math.floor(count), N >> 2);
    if (count <= 0 || nE >= MAXE) return;
    const o = nE * 16;
    emData[o] = cursor; emData[o + 1] = count; emData[o + 2] = x; emData[o + 3] = y;
    emData[o + 4] = ang; emData[o + 5] = spread; emData[o + 6] = vmin; emData[o + 7] = vmax;
    emData[o + 8] = sx; emData[o + 9] = sy; emData[o + 10] = heat0; emData[o + 11] = life;
    emData[o + 12] = ivx; emData[o + 13] = ivy; emData[o + 14] = line ? 1 : 0; emData[o + 15] = gscale;
    cursor = (cursor + count) % N; nE++;
  }
  const poisson = (rate, dt) => { const m = rate * dt; return Math.floor(m + Math.random()); };
  const warm = (x, amount, radius) => {           // add heat to the cells round x (wrapping)
    const cw = PER / NCELL, n = Math.ceil(radius * 2 / cw), c0 = Math.round(x / cw);
    for (let k = -n; k <= n; k++) { const i = ((c0 + k) % NCELL + NCELL) % NCELL, d = (k * cw) / radius; heat[i] += amount * Math.exp(-d * d); }
  };
  function launchWave(x) {
    let w = waves.find((v) => !v.on);
    if (!w) { w = waves[0]; for (const v of waves) if (v.t > w.t) w = v; }
    w.on = true; w.x = ((x % PER) + PER) % PER; w.t = 0; w.met = false; w.mt = 0; lastWaveT = time;
  }

  return {
    step(dt, input) {
      dt = Math.min(dt, 0.05); stepDt = dt; time = input.time; frameNo++; nE = 0;
      const prog = clamp(input.progress, 0, 1), gather = clamp(prm('gather', 0), 0, 1);
      gatherS += (gather - gatherS) * (1 - Math.exp(-dt * 3));
      const amount = clamp(prm('sparks', 1), 0, 3), vWave = clamp(prm('waveSpeed', 3), 0.5, 10);
      const live = 1 - 0.85 * gatherS;

      // a landing hand: a fountain now; two within 0.9 s: a wave
      for (const d of input.downs) {
        const vert = Math.exp(-(((d.y - LINE_Y) / 1.1) ** 2));
        emit(1100 * amount * live, d.x, d.y, Math.PI / 2, 0.62, 1.4, 5.6, 0.07, 0.07, 1.9, 2.4, 0, 0, false, 1);
        emit(260 * amount * live, d.x, d.y, Math.PI / 2, Math.PI, 0.3, 1.6, 0.1, 0.1, 1.4, 1.2, 0, 0, false, 0.7);   // a low burst round the palm
        warm(d.x, 0.9 * vert, 0.5);
        if (time - lastDownT < 0.9 && d.stroke !== lastDownStroke && time - lastWaveT > 0.45) {
          launchWave(lastDownX + roundM(d.x - lastDownX) / 2); lastDownT = -1e9;
        } else { lastDownT = time; lastDownX = d.x; lastDownStroke = d.stroke; }
      }

      // hands: glow uniforms, heat, trickle and trails
      nh = 0;
      for (const h of input.hands) {
        if (nh >= MAXH) break;
        const flash = h.on ? Math.exp(-h.age * 4.5) : 0;
        hu[nh * 4] = h.x; hu[nh * 4 + 1] = h.y; hu[nh * 4 + 2] = h.s; hu[nh * 4 + 3] = flash; nh++;
        if (!h.on) continue;
        const vert = Math.exp(-(((h.y - LINE_Y) / 1.1) ** 2)), sp = Math.hypot(h.vx, h.vy);
        warm(h.x, dt * 0.9 * vert * h.s, 0.55);
        if (sp > 0.12) {        // a dragged hand: a trail of sparks that inherit a little of the hand's motion
          emit(poisson(650 * Math.min(sp, 1.2) * amount * live, dt), h.x, h.y, Math.PI / 2, 1.3, 0.4, 2.4, 0.06, 0.06, 1.7, 1.7, h.vx * 0.35, h.vy * 0.35, false, 1);
        } else {                // a resting hand: a trickle
          emit(poisson(45 * amount * live * h.s, dt), h.x, h.y + 0.03, Math.PI / 2, 0.45, 0.6, 2.2, 0.06, 0.04, 1.6, 1.8, 0, 0, false, 0.9);
        }
      }

      // waves of fire: fronts both ways at vWave until they meet on the far side, then a flash there
      nw = 0;
      for (const w of waves) {
        if (!w.on) continue;
        w.t += dt;
        let r = w.t * vWave, strength = Math.min(1, w.t * 6) * 1.25, meet = 0;
        if (r >= PER / 2) {
          r = PER / 2;
          if (!w.met) { w.met = true; w.mt = 0; emit(900 * amount * live, w.x + PER / 2, LINE_Y, Math.PI / 2, 0.75, 1.5, 5.8, 0.2, 0.08, 1.9, 2.5, 0, 0, false, 1); }
          w.mt += dt; strength *= Math.exp(-w.mt * 2.2); meet = 1.6 * Math.exp(-w.mt * 1.4);
          if (w.mt > 3) { w.on = false; continue; }
        } else {
          for (const sgn of [-1, 1]) {   // the fronts burn and throw sparks as they pass
            const fx = w.x + sgn * r;
            warm(fx, dt * 2.2, 0.35);
            emit(poisson(420 * amount * live, dt), fx, 0, Math.PI / 2 + sgn * 0.25, 0.55, 0.8, 3.4, 0.25, 0.05, 1.7, 1.9, sgn * vWave * 0.25, 0, true, 0.9);
          }
        }
        if (nw < MAXW) { wu[nw * 4] = w.x; wu[nw * 4 + 1] = r; wu[nw * 4 + 2] = strength * (1 - 0.7 * gatherS); wu[nw * 4 + 3] = meet * (1 - 0.7 * gatherS); nw++; }
      }

      // ambient: rare sparks at rest, a rising breath of them when the ring is awake; with gather, only from the hearths
      const amb = (2.5 + 360 * prog ** 1.6) * amount;
      emit(poisson(amb * (1 - gatherS), dt), Math.random() * PER, 0, Math.PI / 2, 0.5, 0.25, 1.1, PER, 0.06, 1.05, 4.2, 0, 0, true, 0.05);
      if (gatherS > 0.01) for (let i = 0; i < NC; i++) emit(poisson((10 + 40 * prog) * gatherS * amount, dt), cen[i], LINE_Y + 0.05, Math.PI / 2, 0.5, 0.2, 0.9, 0.35, 0.08, 0.95, 4.0, 0, 0, false, 0.05);

      // heat cells cool
      const decay = Math.exp(-dt / 4.5);
      for (let i = 0; i < NCELL; i++) { heat[i] = Math.min(heat[i] * decay, 2.0); heatData[i * 4] = heat[i]; }
    },

    draw(target) {
      const mpp = RH / target.h;
      // 1. sparks: update (MRT, ping-pong)
      const A = S[cur], B = S[1 - cur];
      gl.bindTexture(gl.TEXTURE_2D, emTex); if (nE > 0) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, nE, gl.RGBA, gl.FLOAT, emData);
      gl.bindTexture(gl.TEXTURE_2D, heatTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NCELL, 1, gl.RGBA, gl.FLOAT, heatData);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo); gl.drawBuffers(DRAWS); gl.viewport(0, 0, SW, SH);
      gl.useProgram(updP.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.pos);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A.life);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, emTex);
      gl.uniform1i(updP.u.uPos, 0); gl.uniform1i(updP.u.uLife, 1); gl.uniform1i(updP.u.uEm, 2);
      gl.uniform1i(updP.u.uNE, nE); gl.uniform1i(updP.u.uFrame, frameNo); gl.uniform1f(updP.u.uDt, stepDt);
      gl.uniform2f(updP.u.uRoom, PER, RH); gl.uniform1f(updP.u.uTime, time); gl.uniform1f(updP.u.uGather, gatherS);
      quad();
      cur = 1 - cur;

      // 2. the ember line (writes every pixel)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.viewport(0, 0, target.w, target.h);
      gl.useProgram(lineP.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, heatTex); gl.uniform1i(lineP.u.uHeat, 0);
      gl.uniform2f(lineP.u.uRoom, PER, RH); gl.uniform1f(lineP.u.uTime, time); gl.uniform1f(lineP.u.uGather, gatherS);
      gl.uniform1f(lineP.u.uProg, clamp(P.progress || 0, 0, 1)); gl.uniform1f(lineP.u.uHeatK, clamp(prm('embers', 1), 0, 3)); gl.uniform1f(lineP.u.uMpp, mpp);
      gl.uniform1i(lineP.u.uN, nh); gl.uniform4fv(lineP.u.uHand, hu);
      gl.uniform1i(lineP.u.uNW, nw); gl.uniform4fv(lineP.u.uWave, wu);
      gl.uniform1i(lineP.u.uNC, NC); gl.uniform1fv(lineP.u.uCen, cen);
      quad();

      // 3. sparks: additive streaks (a second copy of the instances covers the seam)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(sparkP.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S[cur].pos);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S[cur].life);
      gl.uniform1i(sparkP.u.uPos, 0); gl.uniform1i(sparkP.u.uLife, 1);
      gl.uniform2f(sparkP.u.uRoom, PER, RH); gl.uniform1f(sparkP.u.uTime, time); gl.uniform1f(sparkP.u.uGather, gatherS);
      gl.uniform1f(sparkP.u.uMpp, mpp); gl.uniform1f(sparkP.u.uShutter, clamp(prm('streak', 0.045), 0, 0.15)); gl.uniform1f(sparkP.u.uGain, 2.2 * (1 - 0.5 * gatherS));
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N * 2);
      gl.disable(gl.BLEND);
    },

    setParams() { /* parameters are read live from env.params every frame */ },
  };
}
