// Ressonància — scene "festa": V. La ressonància. The four walls become one skin of light that resonates. See host.js for the contract.
//
//   - THE SKIN: a 2D wave equation solved on the GPU in two RGBA32F ping-pong textures (h, velocity, energy) at ~2 cm per cell
//     (≈ 1/5 of the render size), periodic in x (waves run round the room and come back: no seam), reflecting at the floor and
//     the top, with a soft sponge above a "ceiling" that climbs with the resonance. Several sub-steps per frame (CFL ≤ 0.5).
//     Damping, a touch of viscosity (grid-scale ripples die), a faint spring (the skin cannot drift as a whole), and limiters that
//     only act on loud skin: a soft clip above a knee, extra damping and softer drives where the local amplitude is high. So two
//     people get clean rings and 30 hands seethe without turning into white mush.
//   - LIGHT, NOT WATER: the field is drawn as gold filigree: fine lines of constant width on the levels of the local amplitude
//     (mostly the phase-free amplitude sqrt(h² + (v/ω)²), with a breath of the live phase), so a ring is a fine double line that
//     runs away, waves that add up crowd into nested figures and cancellations stay dark. At most ~6 nested lines anywhere.
//     When the room resonates, its still nodal lines are drawn too ("sand" on a Chladni plate). A deep castell red haze lives far
//     behind, where waves have been (a running average of h²).
//   - HANDS: a landing hand (downs) kicks the skin at once (the same frame: a ring that runs round the room), a burst of gold sparks
//     (GPU particles, instanced streaks) and a flash. A resting hand keeps a gentle periodic drive (each hand its own frequency, so
//     the figures drift); a dragged hand pushes a wake and trails sparks. Two hands closer than 1.6 m are joined by a thread of light
//     that vibrates like a string and brightens as they hold.
//   - THE HIDDEN RULE: hands that land within 0.5 s of each other add up; so do hands driving at once. `resonance` (0..1) rises with
//     them and decays slowly (τ ≈ 14 s). As it rises: hand frequencies lock onto a mode of the room, two near-degenerate standing
//     modes of the whole room are driven at their exact (grid) frequencies up to a target amplitude (Chladni-like figures, slowly
//     morphing into each other), the chatter is damped away, light climbs up the walls and the gold warms to white-gold.
//     At 1 the room BLOOMS once (~4.2 s: a total, ordered figure round the whole room), relaxes, and can build again.
// Sizes in metres; x wraps at the perimeter; no allocation per frame; no readPixels.
export function create(env) {
  const { gl, HEAD, VS, program, quad, room, roundM } = env;
  const PER = room.perimeter, RH = room.height;
  const MAXH = 32, MAXI = 24, MAXT = 24, MAXM = 4, MAXE = 96;
  const SW = 128, SH = 256, N = SW * SH;                         // sparks
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const P = env.params;
  const prm = (k, d) => (typeof P[k] === 'number' && isFinite(P[k]) ? P[k] : d);
  const F32 = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');

  // ---------------------------------------------------------------------------------------------------------------- the grid
  const ppm = clamp(env.pxPerM / 5, 18, 60);                     // cells per metre (≈ 48 at quality high)
  const GH = Math.round(RH * ppm), DX = RH / GH, GW = Math.round(PER / DX);

  // ---------------------------------------------------------------------------------------------------------------- GLSL
  const WRAP = `float wrapd(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }`;

  // the wave equation: state = (h, v, e, 0); symplectic Euler, 9-point isotropic Laplacian, wrap in x, clamp (reflect) in y
  const simP = program(VS, HEAD + `
uniform sampler2D uS; uniform ivec2 uSize; uniform vec2 uRoom;
uniform float uDt, uC2, uGam, uClip, uTau, uCeil, uKick, uEavg, uWake, uVisc, uModeCap;
uniform int uNH, uNI, uNM;
uniform vec4 uHA[${MAXH}];   // x, y, drive amplitude, phase at the start of the frame
uniform vec4 uHB[${MAXH}];   // vx, vy, omega, sigma
uniform vec4 uImp[${MAXI}];  // x, y, kick (units/s), sigma
uniform vec4 uMA[${MAXM}];   // kx, ky, forcing amplitude, omega
uniform vec4 uMB[${MAXM}];   // phase x, phase t
out vec4 o;
${WRAP}
ivec2 Wp(ivec2 p){ p.x = ((p.x % uSize.x) + uSize.x) % uSize.x; p.y = clamp(p.y, 0, uSize.y - 1); return p; }
float Hh(ivec2 p){ return texelFetch(uS, Wp(p), 0).r; }
float Vv(ivec2 p){ return texelFetch(uS, Wp(p), 0).g; }
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec2 p = (vec2(ij) + 0.5) / vec2(uSize) * uRoom;
  vec4 s = texelFetch(uS, ij, 0);
  float h0 = s.x;
  float l = Hh(ij + ivec2(-1, 0)), r = Hh(ij + ivec2(1, 0)), u = Hh(ij + ivec2(0, 1)), d = Hh(ij + ivec2(0, -1));
  float ul = Hh(ij + ivec2(-1, 1)), ur = Hh(ij + ivec2(1, 1)), dl = Hh(ij + ivec2(-1, -1)), dr = Hh(ij + ivec2(1, -1));
  float lap = (4.0 * (l + r + u + d) + (ul + ur + dl + dr) - 20.0 * h0) / 6.0;      // x c²/dx² in uC2
  float acc = uC2 * lap - 1.5 * h0;                                               // a faint spring: the skin cannot drift as a whole
  float aloc = sqrt(2.0 * s.z);                                                   // local amplitude (running rms x sqrt 2)
  float hush = 1.0 / (1.0 + aloc * aloc / 0.05);                                  // drives soften where the skin already rings
  // a touch of viscosity: grid-scale ripples die in a fraction of a second, metre waves hardly notice
  acc += uVisc * (Vv(ij + ivec2(-1, 0)) + Vv(ij + ivec2(1, 0)) + Vv(ij + ivec2(0, 1)) + Vv(ij + ivec2(0, -1)) - 4.0 * s.y);
  // resting hands: a gentle periodic drive (own frequency each); moving hands: a dipole push (bow ahead, trough behind)
  for (int i = 0; i < ${MAXH}; i++) { if (i >= uNH) break;
    vec4 A = uHA[i], B = uHB[i];
    vec2 q = vec2(wrapd(p.x - A.x), p.y - A.y); float r2 = dot(q, q);
    if (r2 > 16.0 * B.w * B.w) continue;
    float g = exp(-r2 / (B.w * B.w));
    acc += g * (A.z * hush * sin(A.w + B.z * uTau) + uWake * dot(q, B.xy) / B.w);
  }
  // the room's own modes (Chladni-like standing figures), driven by the resonance; the forcing stops at the target amplitude
  float reg = clamp(1.0 - aloc / uModeCap, 0.0, 1.0);
  for (int i = 0; i < ${MAXM}; i++) { if (i >= uNM) break;
    vec4 M = uMA[i]; vec4 Mb = uMB[i];
    acc += reg * M.z * cos(M.x * p.x + Mb.x) * cos(M.y * p.y) * sin(M.w * uTau + Mb.y);
  }
  float sponge = 7.0 * smoothstep(uCeil - 0.15, uCeil + 0.45, p.y);
  float v = s.y + uDt * (acc - (uGam + sponge + 4.0 * max(0.0, aloc - 0.4)) * s.y);
  // landing hands: a kick in velocity (first sub-step of the frame only)
  if (uKick > 0.5) for (int i = 0; i < ${MAXI}; i++) { if (i >= uNI) break;
    vec4 I = uImp[i]; vec2 q = vec2(wrapd(p.x - I.x), p.y - I.y); float r2 = dot(q, q);
    // a Mexican hat (zero net push): no drift of the whole skin, only a ring
    if (r2 < 36.0 * I.w * I.w) v += I.z * (exp(-r2 / (I.w * I.w)) - 0.25 * exp(-r2 / (4.0 * I.w * I.w)));
  }
  float h = h0 + uDt * v;
  // soft clip above a knee: linear (lossless) below 0.6·clip, a tanh shoulder above it, so energy stays bounded with 30 hands.
  // (A plain tanh every sub-step is dissipative even for small waves: h³ losses x 480 sub-steps per second.)
  float kn = 0.6 * uClip, ah = abs(h);
  if (ah > kn) h = sign(h) * (kn + (uClip - kn) * tanh((ah - kn) / (uClip - kn)));
  float e = mix(s.z, h * h, uEavg);
  o = vec4(h, v, e, 1.0);
}`);

  // derived field at sim size, filterable. A = sqrt(h² + (v/ω0)²) is the local amplitude (phase-free): a standing figure holds still
  // in A instead of blinking at 2ω. Drawn quantity q = mix(h, A, still): mostly the calm figure, with a breath of the live phase.
  // D0 = (q, dq/dx, dq/dy, A) · D1 = (energy, dA/dx, dA/dy, h)
  const derP = program(VS, HEAD + `
uniform sampler2D uS; uniform ivec2 uSize; uniform float uIdx, uIw, uStill;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
ivec2 Wp(ivec2 p){ p.x = ((p.x % uSize.x) + uSize.x) % uSize.x; p.y = clamp(p.y, 0, uSize.y - 1); return p; }
vec2 Q(ivec2 p){ vec4 s = texelFetch(uS, Wp(p), 0); float A = sqrt(s.x * s.x + s.y * s.y * uIw * uIw); return vec2(mix(s.x, A, uStill), A); }
vec2 Qs(ivec2 p){ return 0.5 * Q(p) + 0.125 * (Q(p + ivec2(1, 0)) + Q(p + ivec2(-1, 0)) + Q(p + ivec2(0, 1)) + Q(p + ivec2(0, -1))); }
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uS, ij, 0);
  vec2 c = Qs(ij), l = Qs(ij + ivec2(-1, 0)), r = Qs(ij + ivec2(1, 0)), u = Qs(ij + ivec2(0, 1)), d = Qs(ij + ivec2(0, -1));
  vec2 gx = (r - l) * 0.5 * uIdx, gy = (u - d) * 0.5 * uIdx;
  o0 = vec4(c.x, gx.x, gy.x, c.y); o1 = vec4(s.z, gx.y, gy.y, s.x);
}`);

  // the light: contour filigree of the field + nodal 'sand' + red haze + hands + threads
  const lightP = program(VS, HEAD + `
uniform sampler2D uD0, uD1; uniform vec2 uRoom, uTexel;
uniform float uTime, uGain, uVe, uCeil, uBloom, uHaze, uStep, uW, uClipR, uSand;
uniform int uNH, uNT;
uniform vec4 uHand[${MAXH}];   // x, y, presence, flash
uniform vec4 uThA[${MAXT}];    // ax, ay, bx (unwrapped), by
uniform vec4 uThB[${MAXT}];    // strength, amplitude, phase, harmonic
in vec2 vUv; out vec4 o;
${WRAP}
void main(){
  vec2 p = vUv * uRoom;
  vec4 D = texture(uD0, vUv), G = texture(uD1, vUv);
  float hb = D.x, Aa = D.w;
  float e = G.x;
  vec3 gold = mix(vec3(1.0, 0.56, 0.17), vec3(1.0, 0.66, 0.30), uVe);
  vec3 hot = mix(vec3(1.0, 0.82, 0.56), vec3(1.0, 0.90, 0.72), uVe);
  // contour filigree: fine lines on the levels (n + 1/2)·step of the field. Flat (cancelled) skin has no levels: dark.
  // Where waves add, the levels crowd and brighten. Distance to the level in metres = |Δh| / |∇h| -> lines of constant width.
  float gm = length(D.yz) + 1e-5;
  float f = hb / uStep, dl = abs(fract(f) - 0.5) * uStep / gm;
  float spacing = uStep / gm;                                                    // metres between two lines here
  float crowd = smoothstep(1.5 * uW, 6.0 * uW, spacing);                         // too crowded: the line melts into a soft band
  float lvl = min(abs(hb) / uClipR, 1.0);                                                  // 0..1: how high this line sits
  float line = exp(-dl * dl / (uW * uW)) * crowd ;
  float halo = exp(-dl * dl / (9.0 * uW * uW)) * crowd * 0.07;
  float lb = (line + halo) * (0.75 + 1.1 * lvl * lvl) * smoothstep(0.9, 1.45, abs(f)) * (0.65 + 0.35 * clamp(G.w / max(Aa, 1e-4), -1.0, 1.0));   // the live crest shimmers a little brighter
  lb *= 1.0 - smoothstep(5.0, 8.0, abs(f));                                     // at most ~6 nested lines: never white mush
  // Chladni sand: where the skin stands still (nodal lines of the standing figure), a fine white-gold line
  float ga = length(G.yz) + 1e-5, dz = Aa / ga, sand = exp(-dz * dz / (3.0 * uW * uW)) * smoothstep(1.5 * uW, 5.0 * uW, uStep / ga) * smoothstep(0.3, 1.2, ga * 0.5 / uStep) * uSand;
  vec3 col = mix(gold, hot, smoothstep(0.45, 0.95, lvl)) * lb * uGain * 3.4 + hot * sand * uGain * 4.0;
  col += gold * smoothstep(0.25, 1.0, lvl) * 0.09 * uBloom;                       // the bloom: the antinodes glow as a whole
  // the castell red, far behind: where the skin has been moving, and a low breath along the floor
  float haze = 1.0 - exp(-e * uHaze);
  col += vec3(0.16, 0.014, 0.009) * haze * (0.35 + 0.65 * uVe);
  col += vec3(0.06, 0.005, 0.003) * exp(-p.y / 0.6) * (0.6 + 0.4 * sin(uTime * 0.31 + 6.2831853 * 3.0 * p.x / uRoom.x)) * (0.4 + uVe);
  // light climbs with the resonance: a soft ceiling, and a soft floor
  float m = smoothstep(uCeil + 0.4, uCeil - 0.7, p.y) * smoothstep(0.0, 0.22, p.y);
  col *= m;
  // threads between close hands: a string of light that vibrates
  for (int i = 0; i < ${MAXT}; i++) { if (i >= uNT) break;
    vec4 A = uThA[i], B = uThB[i];
    vec2 a = A.xy, q = vec2(wrapd(p.x - a.x), p.y - a.y), ab = vec2(A.z - a.x, A.w - a.y);
    float L = length(ab); if (L < 1e-3) continue;
    vec2 t = ab / L, n = vec2(-t.y, t.x);
    float s = dot(q, t), w = dot(q, n);
    if (s < -0.2 || s > L + 0.2 || abs(w) > 0.4) continue;
    float k = clamp(s / L, 0.0, 1.0);
    float disp = B.y * sin(3.14159265 * B.w * k) * sin(B.z) + 0.03 * sin(3.14159265 * k) * sin(B.z * 0.37 + 1.0);
    float dist = length(vec2(s - k * L, w - disp));
    float core = exp(-dist * dist / 0.00006), glow = exp(-dist * dist / 0.003);
    col += (vec3(1.0, 0.86, 0.62) * core * 1.1 + vec3(1.0, 0.6, 0.22) * glow * 0.25) * B.x;
  }
  // hands: a warm light under each palm; a flash when it lands
  for (int i = 0; i < ${MAXH}; i++) { if (i >= uNH) break;
    vec4 h = uHand[i];
    vec2 q = vec2(wrapd(p.x - h.x), p.y - h.y); float r2 = dot(q, q);
    if (r2 > 1.0) continue;
    col += vec3(1.0, 0.78, 0.48) * h.z * (0.9 * exp(-r2 / 0.002) + 0.12 * exp(-r2 / 0.03));
    col += vec3(1.0, 0.9, 0.72) * h.w * (2.2 * exp(-r2 / 0.004) + 0.35 * exp(-r2 / 0.06));
  }
  o = vec4(col, 1.0);
}`);

  // sparks: update (MRT ping-pong), as in fire.js but gold and lighter
  const updP = program(VS, HEAD + `
uniform sampler2D uPos, uLife, uEm; uniform int uNE, uFrame; uniform float uDt, uTime; uniform vec2 uRoom;
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
    float a = r1 * 6.2831853, rr = sqrt(r2);
    vec2 p = A.zw + vec2(cos(a), sin(a)) * rr * C.xy;
    float ang = B.x + (r3 - 0.5) * 2.0 * B.y, sp = mix(B.z, B.w, pow(r4, 1.4));
    vec2 v = vec2(cos(ang), sin(ang)) * sp + D.xy * (0.6 + 0.4 * r5);
    float life = C.w * (0.5 + 0.5 * r6), h0 = C.z * (0.75 + 0.5 * r5);
    oPos = vec4(mod(p.x, uRoom.x), p.y, v); oLife = vec4(0.0, life, h0, D.z + r6 * 0.999);
    return;
  }
  if (L.x >= L.y) { oPos = P; oLife = L; return; }
  float kind = floor(L.w), sd = fract(L.w), age = L.x;
  vec2 v = P.zw;
  vec2 acc = kind < 0.5 ? vec2(0.0, -1.6) : vec2(0.0, 0.22);                                 // bursts fall a little, motes rise
  acc.x += 0.7 * sin(age * (5.0 + sd * 4.0) + sd * 40.0) + 0.4 * sin(P.y * 2.1 + uTime * 0.7 + sd * 6.28);
  acc.y += 0.4 * sin(age * (3.0 + sd * 3.0) + sd * 17.0);
  v += acc * uDt; v *= exp(-uDt * (kind < 0.5 ? 2.2 : 0.9));
  P.xy += v * uDt; P.x = mod(P.x, uRoom.x); P.zw = v;
  L.x += uDt;
  if (P.y < -0.05 || P.y > uRoom.y + 0.3) L.x = L.y + 1.0;
  oPos = P; oLife = L;
}`);
  const sparkP = program(HEAD + `
uniform sampler2D uPos, uLife; uniform vec2 uRoom; uniform float uTime, uMpp, uShutter, uGain, uVe;
out vec2 vQ; out vec3 vCol;
void main(){
  int id = gl_InstanceID, copy = id >= ${N} ? 1 : 0; id -= copy * ${N};
  ivec2 c = ivec2(id % ${SW}, id / ${SW});
  vec4 P = texelFetch(uPos, c, 0), L = texelFetch(uLife, c, 0);
  float shift = 0.0;
  if (copy == 1) { if (P.x < 0.6) shift = uRoom.x; else if (P.x > uRoom.x - 0.6) shift = -uRoom.x; else L.x = L.y + 1.0; }
  if (L.x >= L.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vQ = vec2(0.0); vCol = vec3(0.0); return; }
  float sd = fract(L.w), T = L.z * exp(-L.x * 1.4 / L.y);
  float fade = smoothstep(L.y, L.y * 0.5, L.x) * smoothstep(0.0, 0.03, L.x);
  float tw = 0.7 + 0.3 * sin(uTime * (13.0 + sd * 21.0) + sd * 60.0);
  float w = max(0.003 + 0.003 * sd * sd + 0.0015 * min(T, 1.5), 0.75 * uMpp);
  vec2 head = vec2(P.x + shift, P.y), v = P.zw, tail = head - v * uShutter;
  vec2 dv = head - tail; float len = length(dv);
  vec2 dir = len > 1e-5 ? dv / len : vec2(0.0, 1.0), nrm = vec2(-dir.y, dir.x);
  int vid = gl_VertexID; float a = float(vid & 1), sdn = float(vid >> 1) * 2.0 - 1.0;
  vec2 p = mix(tail - dir * w, head + dir * w, a) + nrm * sdn * w * 1.5;
  vQ = vec2(a, sdn);
  float energy = mix(1.0, clamp(3.0 * w / (len + 2.0 * w), 0.15, 1.0), 0.6);
  vec3 g = mix(vec3(1.0, 0.5, 0.14), mix(vec3(1.0, 0.82, 0.5), vec3(1.0, 0.95, 0.85), uVe), smoothstep(0.5, 1.4, T));
  vCol = g * T * fade * tw * energy * uGain;
  gl_Position = vec4(p / uRoom * 2.0 - 1.0, 0.0, 1.0);
}`, HEAD + `in vec2 vQ; in vec3 vCol; out vec4 o;
void main(){ float along = vQ.x * vQ.x * (0.35 + 0.65 * vQ.x); float across = exp(-vQ.y * vQ.y * 3.5); o = vec4(vCol * along * across, 1.0); }`);

  // ---------------------------------------------------------------------------------------------------------------- GPU state
  const tex = (w, h, ifmt, type, filter, data = null) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const fbo = (...ts) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); ts.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0)); return f; };
  const SIMF = F32 ? [gl.RGBA32F, gl.FLOAT] : [gl.RGBA16F, gl.HALF_FLOAT];
  const sim = [0, 1].map(() => { const t = tex(GW, GH, SIMF[0], SIMF[1], gl.NEAREST); return { t, f: fbo(t) }; });
  for (const s of sim) { gl.bindFramebuffer(gl.FRAMEBUFFER, s.f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  const d0 = tex(GW, GH, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR), d1 = tex(GW, GH, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR), dF = fbo(d0, d1);
  let sc = 0;

  const dead = new Float32Array(N * 4); for (let i = 0; i < N; i++) { dead[i * 4] = 1; dead[i * 4 + 1] = 0; }
  const zero = new Float32Array(N * 4);
  const SPK = F32 ? [0, 1].map(() => { const pos = tex(SW, SH, gl.RGBA32F, gl.FLOAT, gl.NEAREST, zero), life = tex(SW, SH, gl.RGBA32F, gl.FLOAT, gl.NEAREST, dead); return { pos, life, f: fbo(pos, life) }; }) : null;
  let spc = 0;
  const emData = new Float32Array(MAXE * 16), emTex = tex(4, MAXE, gl.RGBA32F, gl.FLOAT, gl.NEAREST);
  const vao = gl.createVertexArray();
  const MRT = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1], ONE = [gl.COLOR_ATTACHMENT0];

  // ---------------------------------------------------------------------------------------------------------------- the room's modes
  // Eigenvalue of the 9-point Laplacian for cos(kx x) cos(ky y): exact on the grid, so the forcing hits the discrete resonance.
  const lam = (kx, ky) => { const a = Math.cos(kx * DX), b = Math.cos(ky * DX); return -(8 * a + 8 * b + 4 * a * b - 20) / (6 * DX * DX); };
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Two near-degenerate modes (different vertical orders) around a wavelength: their sum is a Chladni-like figure, and as their
  // frequencies differ by a hair, the figure slowly morphs from one to the other.
  function pickPair(lambda) {
    const k0 = 2 * Math.PI / lambda, list = [];
    for (let m = 1; m <= 7; m++) for (let n = 2; n <= 90; n++) {
      const kx = 2 * Math.PI * n / PER, ky = m * Math.PI / RH, k = Math.sqrt(lam(kx, ky));
      if (Math.abs(k / k0 - 1) < 0.08) list.push({ n, m, kx, ky, k });
    }
    let best = null, bs = 1e9;
    for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
      const A = list[i], B = list[j]; if (A.m >= B.m) continue;
      const sc2 = Math.abs(A.k - B.k) / k0 + 0.25 * Math.abs((A.k + B.k) / 2 / k0 - 1) + (A.n % 4 === 0 ? 0 : 0.004) + (B.n % 4 === 0 ? 0 : 0.004);
      if (sc2 < bs) { bs = sc2; best = [A, B]; }
    }
    return (best || list.slice(0, 2)).map((M) => ({ ...M, px: rnd() * 6.2831853, pt: rnd() * 6.2831853 }));
  }
  const ORDER = pickPair(1.15), BLOOM = pickPair(0.72);
  const MODES = [...ORDER, ...BLOOM].slice(0, MAXM);
  const mA = new Float32Array(MAXM * 4), mB = new Float32Array(MAXM * 4);

  // ---------------------------------------------------------------------------------------------------------------- CPU state
  const hA = new Float32Array(MAXH * 4), hB = new Float32Array(MAXH * 4), hu = new Float32Array(MAXH * 4);
  const imp = new Float32Array(MAXI * 4), thA = new Float32Array(MAXT * 4), thB = new Float32Array(MAXT * 4);
  const phase = new Float32Array(MAXH), phStroke = new Int32Array(MAXH).fill(-1);
  const threads = Array.from({ length: MAXT }, () => ({ a: -1, b: -1, t: 0, s: 0, seen: false, ax: 0, ay: 0, bx: 0, by: 0, d: 0, ph: 0, n: 1 }));
  const RECENT = 64, recT = new Float64Array(RECENT).fill(-1e9), recS = new Int32Array(RECENT).fill(-1); let recI = 0;
  let nh = 0, nI = 0, nT = 0, nE = 0, cursor = 0, frameNo = 0, time = 0, stepDt = 1 / 60;
  let resC = 0, R = 0, Rs = 0, bloomT = -1, bloomEnv = 0, lastBloomEnd = -1e9, Ve = 0, autoWait = 0.6, modeT = 0;
  let c = 4.5, gam = 0.8, ceil = 2.6, sandK = 0, modeCap = 0.1;
  const hash = (i) => { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

  function emit(count, x, y, ang, spread, vmin, vmax, sx, sy, heat0, life, ivx, ivy, kind) {
    count = Math.min(Math.floor(count), N >> 2);
    if (!SPK || count <= 0 || nE >= MAXE) return;
    const o = nE * 16;
    emData[o] = cursor; emData[o + 1] = count; emData[o + 2] = x; emData[o + 3] = y;
    emData[o + 4] = ang; emData[o + 5] = spread; emData[o + 6] = vmin; emData[o + 7] = vmax;
    emData[o + 8] = sx; emData[o + 9] = sy; emData[o + 10] = heat0; emData[o + 11] = life;
    emData[o + 12] = ivx; emData[o + 13] = ivy; emData[o + 14] = kind; emData[o + 15] = 0;
    cursor = (cursor + count) % N; nE++;
  }
  const poisson = (rate, dt) => Math.floor(rate * dt + Math.random());
  const sigmaI = Math.max(0.11, 3.5 * DX);
  function impulse(x, y, amp, sigma = sigmaI) {
    if (nI >= MAXI) return;
    const o = nI * 4; imp[o] = ((x % PER) + PER) % PER; imp[o + 1] = y; imp[o + 2] = amp; imp[o + 3] = sigma; nI++;
  }

  const scene = {
    get resonance() { return R; },        // read-only, for the director and the sound: 0..1 (computed + the study's progress)
    get bloom() { return bloomEnv; },
    step(dt, input) {
      dt = Math.min(dt, 1 / 20); stepDt = dt; time = input.time; frameNo++; nE = 0; nI = 0;
      const sens = clamp(prm('sensitivity', 1), 0, 4), amount = clamp(prm('sparks', 1), 0, 3), auto = P.auto !== false;
      c = clamp(prm('speed', 4.5), 1.5, 9);

      // --- the hidden rule: landings within 0.5 s of each other add up
      let realOn = 0, driving = 0;
      for (const h of input.hands) if (h.on) { realOn++; if (h.age > 0.4 && Math.hypot(h.vx, h.vy) < 0.35) driving++; }
      const loud = 1 / Math.sqrt(Math.max(1, input.downs.length / 3));
      for (const d of input.downs) {
        let k = 0;
        for (let i = 0; i < RECENT; i++) { const a = time - recT[i]; if (a < 0.5 && recS[i] !== d.stroke) k += 1 - a / 0.5; }
        recT[recI] = time; recS[recI] = d.stroke; recI = (recI + 1) % RECENT;
        resC += Math.min(0.1, 0.03 * k + 0.004) * sens;
        const together = Math.min(k, 3);
        impulse(d.x, d.y, 1100 * (1 + 0.45 * together) * loud);                                        // the ring, at once
        emit(420 * amount * (1 + 0.4 * together) * loud, d.x, d.y, Math.PI / 2, Math.PI, 0.6, 3.6, 0.05, 0.05, 1.5, 1.8, 0, 0, 0);
        emit(120 * amount * loud, d.x, d.y, Math.PI / 2, 0.5, 0.3, 1.2, 0.08, 0.08, 1.1, 2.6, 0, 0, 1);
      }
      resC += dt * 0.011 * Math.pow(Math.max(0, driving - 1), 0.85) * sens;
      resC -= dt * resC / 14;
      resC = clamp(resC, 0, 1);
      R = clamp(resC + clamp(input.progress, 0, 1), 0, 1);
      Rs += (R - Rs) * (1 - Math.exp(-dt * (R > Rs ? 1.4 : 0.6)));

      // --- the bloom: once, when the resonance is full; then it relaxes and can build again
      if (bloomT < 0 && R >= 0.985 && time - lastBloomEnd > 6) bloomT = 0;
      if (bloomT >= 0) {
        bloomT += dt;
        bloomEnv = Math.min(1, bloomT / 1.3) ** 2 * (3 - 2 * Math.min(1, bloomT / 1.3)) * (bloomT < 3 ? 1 : Math.max(0, 1 - (bloomT - 3) / 1.2));
        if (bloomT < 3) emit(poisson(900 * amount * bloomEnv, dt), Math.random() * PER, 0.2 + Math.random() * (RH - 0.4), Math.PI / 2, 0.6, 0.05, 0.4, 0.3, 0.3, 1.2, 3.5, 0, 0, 1);
        if (bloomT > 4.2) { bloomT = -1; bloomEnv = 0; lastBloomEnd = time; resC *= 0.35; }
      }
      Ve = Math.max(Rs, bloomEnv);

      // --- the skin: speed, damping (a resonant skin rings longer), ceiling, modes
      const ring = clamp(prm('ring', 3), 0.5, 8);                       // amplitude decay time at rest (s)
      gam = 2 / ring * (1 + 0.9 * Rs);                                      // a resonating room clears the chatter: only the figure remains
      gam = gam + (2 / 1.4 - gam) * 0.6 * bloomEnv;                         // the bloom cleans the skin while it forces its figure
      ceil = 2.55 + (RH + 0.5 - 2.55) * (Ve * Ve * (3 - 2 * Ve));
      const order = clamp((Rs - 0.25) / 0.75, 0, 1); sandK = order * order;
      modeCap = 0.05 + 1.3 * (0.3 * order ** 1.2 + 0.34 * bloomEnv);
      for (let i = 0; i < MODES.length; i++) {
        const M = MODES[i], bloomMode = i >= ORDER.length;
        // forcing sized for a target standing amplitude (steady state of a driven damped mode: A = F / (gamma * omega))
        const target = bloomMode ? 0.12 * bloomEnv : 0.3 * order ** 1.2 + 0.34 * bloomEnv;
        const amp = target * Math.max(gam, 0.25) * c * M.k * (bloomMode ? 1 : 1.0);
        mA[i * 4] = M.kx; mA[i * 4 + 1] = M.ky; mA[i * 4 + 2] = amp; mA[i * 4 + 3] = c * M.k;
        mB[i * 4] = M.px; mB[i * 4 + 1] = (M.pt + c * M.k * modeT) % (2 * Math.PI * 1000);
      }
      modeT += dt;

      // --- hands: drive, wake, light; frequencies lock onto the room's mode as the resonance grows
      const wLock = c * ORDER[0].k, lock = clamp((Rs - 0.3) / 0.55, 0, 1);
      const quiet = 1 / Math.sqrt(Math.max(1, driving / 3));
      nh = 0;
      for (const h of input.hands) {
        if (nh >= MAXH) break;
        let slot = -1; for (let i = 0; i < MAXH; i++) if (phStroke[i] === h.stroke) { slot = i; break; }
        if (slot < 0) { slot = frameNo % MAXH; for (let i = 0; i < MAXH; i++) if (phStroke[i] < 0) { slot = i; break; } phStroke[slot] = h.stroke; phase[slot] = 0; }
        const own = 2 * Math.PI * (3.8 + 1.8 * hash(h.stroke + 11)), w = own + (wLock - own) * lock;
        phase[slot] = (phase[slot] + w * dt) % (2 * Math.PI * 64);
        const sp = Math.hypot(h.vx, h.vy), rest = h.on ? clamp((h.age - 0.25) / 0.6, 0, 1) * clamp(1 - sp / 0.5, 0, 1) : 0;
        const o = nh * 4;
        hA[o] = h.x; hA[o + 1] = h.y; hA[o + 2] = 700 * rest * h.s * quiet * (1 - 0.6 * lock); hA[o + 3] = phase[slot];
        hB[o] = h.on ? h.vx : 0; hB[o + 1] = h.on ? h.vy : 0; hB[o + 2] = w; hB[o + 3] = 0.085;
        hu[o] = h.x; hu[o + 1] = h.y; hu[o + 2] = h.s; hu[o + 3] = h.on ? Math.exp(-h.age * 5) : 0;
        if (h.on && sp > 0.15) emit(poisson(160 * Math.min(sp, 1.2) * amount, dt), h.x, h.y, Math.PI / 2, Math.PI, 0.2, 1.2, 0.04, 0.04, 1.2, 1.4, h.vx * 0.3, h.vy * 0.3, 0);
        else if (h.on) emit(poisson(10 * amount * h.s, dt), h.x, h.y + 0.03, Math.PI / 2, 0.6, 0.15, 0.6, 0.06, 0.04, 1.0, 2.6, 0, 0, 1);
        nh++;
      }
      for (let i = 0; i < MAXH; i++) if (phStroke[i] >= 0 && !input.hands.some((h) => h.stroke === phStroke[i])) phStroke[i] = -1;

      // --- threads: two hands closer than 1.6 m, a string of light that brightens as they hold
      for (const t of threads) t.seen = false;
      const H = input.hands;
      for (let i = 0; i < H.length; i++) {
        const a = H[i]; if (!a.on) continue;
        for (let j = i + 1; j < H.length; j++) {
          const b = H[j]; if (!b.on) continue;
          const dxm = roundM(b.x - a.x), dym = b.y - a.y, d = Math.hypot(dxm, dym);
          if (d > 1.6 || d < 0.08) continue;
          const s1 = Math.min(a.stroke, b.stroke), s2 = Math.max(a.stroke, b.stroke);
          let t = threads.find((q) => q.a === s1 && q.b === s2);
          if (!t) { t = threads.find((q) => q.a < 0); if (!t) continue; t.a = s1; t.b = s2; t.t = 0; t.s = 0; t.ph = 0; t.n = 1 + Math.floor(hash(s1 * 31 + s2) * 3); }
          t.seen = true; t.t += dt; t.ax = a.x; t.ay = a.y; t.bx = a.x + dxm; t.by = b.y; t.d = d;
        }
      }
      let pairs = 0; for (const t of threads) if (t.a >= 0 && t.seen) pairs++;
      const share = 1 / Math.sqrt(Math.max(1, pairs / 3));                 // many threads at once: each one a little fainter
      nT = 0;
      for (const t of threads) {
        if (t.a < 0) continue;
        t.s += ((t.seen ? 1 : 0) - t.s) * (1 - Math.exp(-dt * (t.seen ? 6 : 3)));
        if (!t.seen && t.s < 0.01) { t.a = -1; t.b = -1; continue; }
        t.ph += dt * 2 * Math.PI * (2.2 + 0.6 * t.n);
        if (nT >= MAXT) continue;
        const o = nT * 4, hold = 1 - Math.exp(-t.t / 1.3), near = clamp((1.6 - t.d) / 0.4, 0, 1);
        thA[o] = t.ax; thA[o + 1] = t.ay; thA[o + 2] = t.bx; thA[o + 3] = t.by;
        thB[o] = t.s * near * (0.25 + 1.1 * hold) * (1 + 0.5 * Ve) * share; thB[o + 1] = 0.05 * Math.exp(-t.t / 2.5) + 0.008; thB[o + 2] = t.ph; thB[o + 3] = t.n;
        nT++;
      }

      // --- auto: with fewer than two real hands the skin plays a few gentle impulses on its own (they do not feed the resonance)
      if (auto && realOn < 2) {
        autoWait -= dt;
        if (autoWait <= 0) {
          const x = Math.random() * PER, y = 0.85 + Math.random() * 1.1;
          impulse(x, y, 750); emit(160 * amount, x, y, Math.PI / 2, Math.PI, 0.4, 2.4, 0.04, 0.04, 1.2, 1.5, 0, 0, 0);
          if (Math.random() < 0.3) { const x2 = x + PER * (0.3 + Math.random() * 0.4), y2 = 0.85 + Math.random() * 1.1; impulse(x2, y2, 750); emit(160 * amount, x2 % PER, y2, Math.PI / 2, Math.PI, 0.4, 2.4, 0.04, 0.04, 1.2, 1.5, 0, 0, 0); }
          autoWait = 0.9 + Math.random() * 2.0 - 0.5 * Rs;
        }
      }
      // ambient: a few slow motes when the room resonates
      emit(poisson((1.5 + 60 * Ve * Ve) * amount, dt), Math.random() * PER, 0.1 + Math.random() * 0.8, Math.PI / 2, 0.4, 0.1, 0.5, 0.3, 0.2, 0.9, 4, 0, 0, 1);
    },

    draw(target) {
      gl.disable(gl.BLEND);
      // 1. sparks: update
      if (SPK) {
        const A = SPK[spc], B = SPK[1 - spc];
        gl.bindTexture(gl.TEXTURE_2D, emTex); if (nE > 0) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, nE, gl.RGBA, gl.FLOAT, emData);
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.f); gl.drawBuffers(MRT); gl.viewport(0, 0, SW, SH);
        gl.useProgram(updP.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.pos);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A.life);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, emTex);
        gl.uniform1i(updP.u.uPos, 0); gl.uniform1i(updP.u.uLife, 1); gl.uniform1i(updP.u.uEm, 2);
        gl.uniform1i(updP.u.uNE, nE); gl.uniform1i(updP.u.uFrame, frameNo); gl.uniform1f(updP.u.uDt, stepDt);
        gl.uniform2f(updP.u.uRoom, PER, RH); gl.uniform1f(updP.u.uTime, time);
        quad();
        spc = 1 - spc;
      }

      // 2. the skin: sub-steps under the CFL limit
      const sub = Math.max(1, Math.ceil(c * stepDt / (0.5 * DX))), dts = stepDt / sub;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim[0].f); gl.drawBuffers(ONE);
      gl.viewport(0, 0, GW, GH); gl.useProgram(simP.p);
      const u = simP.u;
      gl.uniform2i(u.uSize, GW, GH); gl.uniform2f(u.uRoom, PER, RH); gl.uniform1i(u.uS, 0);
      gl.uniform1f(u.uDt, dts); gl.uniform1f(u.uC2, c * c / (DX * DX)); gl.uniform1f(u.uGam, gam);
      gl.uniform1f(u.uClip, clamp(prm('clip', 0.6), 0.1, 2)); gl.uniform1f(u.uCeil, ceil); gl.uniform1f(u.uEavg, 1 - Math.exp(-dts / 0.9));
      gl.uniform1f(u.uWake, 260); gl.uniform1f(u.uVisc, 7); gl.uniform1f(u.uModeCap, modeCap);
      gl.uniform1i(u.uNH, nh); gl.uniform4fv(u.uHA, hA); gl.uniform4fv(u.uHB, hB);
      gl.uniform1i(u.uNI, nI); gl.uniform4fv(u.uImp, imp);
      gl.uniform1i(u.uNM, MODES.length); gl.uniform4fv(u.uMA, mA); gl.uniform4fv(u.uMB, mB);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < sub; i++) {
        gl.uniform1f(u.uTau, i * dts); gl.uniform1f(u.uKick, i === 0 ? 1 : 0);
        const src = sim[sc], dst = sim[1 - sc];
        gl.bindTexture(gl.TEXTURE_2D, src.t); gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); quad(); sc = 1 - sc;
      }

      // 3. derived field
      gl.bindFramebuffer(gl.FRAMEBUFFER, dF); gl.drawBuffers(MRT); gl.viewport(0, 0, GW, GH);
      gl.useProgram(derP.p); gl.bindTexture(gl.TEXTURE_2D, sim[sc].t);
      gl.uniform1i(derP.u.uS, 0); gl.uniform2i(derP.u.uSize, GW, GH); gl.uniform1f(derP.u.uIdx, 1 / DX);
      gl.uniform1f(derP.u.uIw, 1 / (c * ORDER[0].k)); gl.uniform1f(derP.u.uStill, clamp(prm('still', 0.7), 0, 1) * (1 - 0.55 * bloomEnv));
      quad();

      // 4. the light
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.drawBuffers(ONE); gl.viewport(0, 0, target.w, target.h);
      const L = lightP.u; gl.useProgram(lightP.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, d1);
      gl.uniform1i(L.uD0, 0); gl.uniform1i(L.uD1, 1);
      gl.uniform2f(L.uRoom, PER, RH); gl.uniform2f(L.uTexel, 1 / GW, 1 / GH); gl.uniform1f(L.uTime, time);
      gl.uniform1f(L.uGain, clamp(prm('glow', 1), 0, 4) * 0.16 * (1 + 0.25 * Ve + 0.7 * bloomEnv));
      gl.uniform1f(L.uVe, Ve); gl.uniform1f(L.uCeil, ceil); gl.uniform1f(L.uBloom, bloomEnv);
      gl.uniform1f(L.uHaze, 0.5); gl.uniform1f(L.uStep, (0.013 + 0.014 * Ve + 0.025 * bloomEnv) / clamp(prm('lines', 1), 0.3, 3)); gl.uniform1f(L.uW, 0.0045 * RH / 3.75 * Math.sqrt(Math.max(1, 243 / env.pxPerM))); gl.uniform1f(L.uClipR, 0.3); gl.uniform1f(L.uSand, 1.4 * bloomEnv + 0.5 * sandK);
      gl.uniform1i(L.uNH, nh); gl.uniform4fv(L.uHand, hu);
      gl.uniform1i(L.uNT, nT); gl.uniform4fv(L.uThA, thA); gl.uniform4fv(L.uThB, thB);
      quad();

      // 5. sparks: additive streaks (a second copy of the instances covers the seam)
      if (SPK) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(sparkP.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, SPK[spc].pos);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, SPK[spc].life);
        gl.uniform1i(sparkP.u.uPos, 0); gl.uniform1i(sparkP.u.uLife, 1);
        gl.uniform2f(sparkP.u.uRoom, PER, RH); gl.uniform1f(sparkP.u.uTime, time); gl.uniform1f(sparkP.u.uVe, Ve);
        gl.uniform1f(sparkP.u.uMpp, RH / target.h); gl.uniform1f(sparkP.u.uShutter, 0.035); gl.uniform1f(sparkP.u.uGain, 1.6);
        gl.bindVertexArray(vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N * 2);
        gl.disable(gl.BLEND);
      }
      gl.activeTexture(gl.TEXTURE0);
    },

    setParams() { /* parameters are read live from env.params every frame */ },
  };
  return scene;
}
