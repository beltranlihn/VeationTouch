// Ressonància — scene "earth": II. Pinya — Força — the universe of BODY AND EARTH. See host.js for the contract.
//
// A warm, soft matter round the four walls — wet clay, earth, skin — in a dark room under low raking light. It breathes
// (≈4 s in, 6 s out). It yields under the hand and keeps the print:
//   - a HEIGHT FIELD (ping-pong simulation at a quarter of the size): a hand presses a dent with a soft raised rim at once,
//     the clay keeps it and relaxes slowly; where it was pressed it stays wet and glows warm from inside for a while;
//   - HANDPRINTS: a landing hand stamps a procedural hand (palm, five fingers, ≈20 cm) that glows from inside and fades (~20 s);
//   - THE PINYA: round each wall's centre three rings of handprint slots, fingers pointing inward (6, 10, 14), the base of a castell
//     seen from the bell tower. `progress` fills them ring by ring; a hand resting near a slot lights it at once;
//   - THE CIRCLE CLOSES near progress = 1: a band of linked hands at hand height joins the walls and turns round the room
//     (a rotllana), periodic in x so the seam between the last wall and the first is not a seam;
//   - `crack` (0..1): the clay dries and cracks into polygonal shards with light in the cracks — the mosaic to come.
// Passes: bake (once: the clay's own relief and tone) -> sim (quarter size) -> compose (full size, MRT: height, glow, crack light,
// wetness | shard tone, dryness) -> shade (normals from the composed height, raking lights, hands as lights). All in metres.
export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls } = env;
  const P_ = room.perimeter, MAXH = 32, MAXP = 40, MAXW = 8, NW = Math.min(MAXW, walls.length);
  const PINYA_Y = 1.25, ASP = 0.58, RINGS = [[0.45, 6, 0.0], [0.8, 10, 0.5], [1.15, 14, 0.25]], NS = 30;   // radius (m), slots, angular offset
  const HAND_LEN = 0.19;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (c, t, dt, r) => c + (t - c) * (1 - Math.exp(-dt * r));
  const wrap = (d) => d - P_ * Math.round(d / P_);
  const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // ------------------------------------------------------------------ shared GLSL
  const COMMON = `
const float PI = 3.14159265;
uniform vec2 uRoom;
float wrapX(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }
float h21(ivec2 c){ uvec2 q = uvec2(c) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; return float(n >> 8) / 16777216.0; }
vec2 h22(ivec2 c){ uvec2 q = uvec2(c) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; return vec2(uvec2(n, n * 48271u) >> 8) / 16777216.0; }
int wrapI(int i, int n){ return ((i % n) + n) % n; }
float sdCap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdRBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// a hand, palm centre at the origin, fingers towards +y, ≈0.17 m before scaling. sp: how much the fingers fan out
float sdHand(vec2 p, float sp){
  float d = sdRBox(p - vec2(0.0, -0.034), vec2(0.040, 0.041), 0.026);
  d = smin(d, length((p - vec2(0.010, -0.064)) * vec2(1.0, 1.25)) - 0.034, 0.012);          // the heel of the hand
  vec2 b0 = vec2(-0.028, -0.006), b1 = vec2(-0.0095, 0.0), b2 = vec2(0.0095, -0.002), b3 = vec2(0.027, -0.012);
  d = smin(d, sdCap(p, b0, b0 + normalize(vec2(-0.22 * sp - 0.05, 1.0)) * 0.066, 0.0102), 0.007);
  d = smin(d, sdCap(p, b1, b1 + normalize(vec2(-0.07 * sp - 0.01, 1.0)) * 0.078, 0.0108), 0.007);
  d = smin(d, sdCap(p, b2, b2 + normalize(vec2(0.08 * sp + 0.02, 1.0)) * 0.071, 0.0104), 0.007);
  d = smin(d, sdCap(p, b3, b3 + normalize(vec2(0.25 * sp + 0.10, 1.0)) * 0.053, 0.0090), 0.007);
  vec2 t0 = vec2(0.030, -0.050);
  d = smin(d, sdCap(p, t0, t0 + normalize(vec2(0.80 + 0.35 * sp, 0.75)) * 0.062, 0.0125), 0.016);   // the thumb, webbed
  return d;
}
`;

  // ------------------------------------------------------------------ bake: the clay's own relief (m) and tone, periodic in x
  const bakeP = program(VS, HEAD + COMMON + `
in vec2 vUv; layout(location = 0) out vec4 o;
float vn(vec2 p, int per){ ivec2 i = ivec2(floor(p)); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  int x0 = wrapI(i.x, per), x1 = wrapI(i.x + 1, per);
  return mix(mix(h21(ivec2(x0, i.y)), h21(ivec2(x1, i.y)), f.x), mix(h21(ivec2(x0, i.y + 1)), h21(ivec2(x1, i.y + 1)), f.x), f.y); }
// fbm at f cells per metre, periodic round the room
float fbm(vec2 p, float f, int oct){ float a = 0.5, s = 0.0, n = 0.0; int per = int(floor(uRoom.x * f + 0.5)); vec2 q = vec2(p.x / uRoom.x * float(per), p.y * f);
  for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a * vn(q + vec2(0.0, float(i) * 17.31), per); n += a; a *= 0.5; q *= 2.0; per *= 2; q.y += 3.7; }
  return s / n; }
// the mass: soft rounded mounds, bodies pressed so close they become one (a sum of soft domes, periodic)
float mounds(vec2 p, float cs){
  int nx = int(floor(uRoom.x / cs + 0.5)); float cx = uRoom.x / float(nx);
  vec2 q = vec2(p.x / cx, p.y / cs); ivec2 ic = ivec2(floor(q)); vec2 f = q - vec2(ic); float s = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    ivec2 c = ic + ivec2(i, j), cw = ivec2(wrapI(c.x, nx), c.y);
    vec2 o = h22(cw), rr = h22(cw + 101);
    vec2 r = (vec2(i, j) + o - f) * vec2(cx, cs);
    float rad = cs * (0.55 + 0.45 * rr.x);
    s += (0.55 + 0.45 * rr.y) * exp(-dot(r, r) / (rad * rad));
  }
  return s;
}
void main(){
  vec2 p = vUv * uRoom;
  vec2 w = vec2(fbm(p, 1.6, 4), fbm(p + vec2(0.0, 9.1), 1.6, 4)) - 0.5;
  vec2 pw = p + w * vec2(0.0, 0.5);
  float big = fbm(pw, 0.9, 4);                                     // the mass: slow swells
  float mid = fbm(pw + w.yx * 0.3, 3.5, 4);                        // kneaded lumps
  float str = fbm(vec2(p.x, p.y * 0.35) + w * 0.6, 7.0, 3);         // smears, stretched sideways (palms passing)
  float grain = fbm(p, 45.0, 2);                                   // pores and grit
  float crease = 1.0 - abs(fbm(pw * vec2(1.0, 1.3), 2.6, 4) * 2.0 - 1.0); crease = pow(crease, 7.0);   // folds
  float mass = mounds(pw + w * 0.15, 0.46);
  float h = (mass - 1.2) * 0.065 + (big - 0.5) * 0.014 + (mid - 0.5) * 0.007 + (str - 0.5) * 0.0035 + (grain - 0.5) * 0.0009 - crease * 0.0022;
  float tone = fbm(p + vec2(4.3, 1.1), 1.2, 5), tone2 = fbm(p + vec2(13.0, 7.0), 4.0, 4);
  o = vec4(h, tone, tone2, grain);
}`);

  // ------------------------------------------------------------------ sim: dents (r) and warmth (g), quarter size, ping-pong
  const simP = program(VS, HEAD + COMMON + `
uniform sampler2D uPrev; uniform vec2 uTexel; uniform float uDt, uRelax; uniform int uN; uniform vec4 uHand[${MAXH}];
in vec2 vUv; out vec4 o;
void main(){
  vec4 c = texture(uPrev, vUv);
  float l = texture(uPrev, vUv - vec2(uTexel.x, 0.0)).r, r = texture(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture(uPrev, vUv - vec2(0.0, uTexel.y)).r, u = texture(uPrev, vUv + vec2(0.0, uTexel.y)).r;
  float h = c.r, g = c.g, wet = c.b;
  h += ((l + r + d + u) * 0.25 - h) * min(1.0, uDt * 2.0);           // the clay creeps a little
  h *= exp(-uDt / uRelax);                                            // and slowly forgets
  g *= exp(-uDt / 4.5); wet *= exp(-uDt / (uRelax * 1.6));
  vec2 p = vUv * uRoom;
  for (int i = 0; i < ${MAXH}; i++){
    if (i >= uN) break;
    vec4 H = uHand[i]; if (H.z < 0.01) continue;
    vec2 dd = vec2(wrapX(H.x - p.x), H.y - p.y);
    float rr = length(dd) / 0.12; if (rr > 3.5) continue;
    float prof = -exp(-rr * rr) + 0.38 * exp(-pow((rr - 1.75) / 0.5, 2.0));   // a dent, its soft raised rim
    float k = 1.0 - exp(-uDt * 32.0 * H.z);                                      // immediate: ~60 % in 30 ms
    float t = prof < 0.0 ? min(h, prof) : max(h, prof);
    h = mix(h, t, k * H.w);
    g = max(g, H.z * H.w * exp(-rr * rr * 0.7));
    wet = max(wet, H.z * H.w * exp(-rr * rr * 0.35));
  }
  o = vec4(h, g, wet, 1.0);
}`);

  // ------------------------------------------------------------------ compose: everything that has a shape, at full size
  const compP = program(VS, HEAD + COMMON + `
uniform sampler2D uBase, uSim, uSlots;
uniform float uTime, uBreath, uCrack, uBandR, uBandOn, uRot, uGlow, uDentM;
uniform int uNW; uniform vec4 uWall[${MAXW}];      // centre x, half width
uniform vec4 uPrint[${MAXP}];                       // x, y, angle, age
uniform vec4 uPrintB[${MAXP}];                      // mirror, scale, strength, spread
in vec2 vUv; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;

// a print's relief and light from its distance field (m)
void stamp(float d, float depth, float light, inout float h, inout float glow){
  float inside = smoothstep(0.003, -0.004, d);
  h += -inside * depth * (0.65 + 0.35 * smoothstep(0.0, -0.02, d)) + exp(-pow((d - 0.007) / 0.0045, 2.0)) * depth * 0.28;
  glow += light * (smoothstep(0.002, -0.024, d) * 0.42 + smoothstep(0.003, -0.004, d) * 0.07 + exp(-max(d, 0.0) / 0.03) * 0.07);
}

// one handprint slot of the pinya: ring radius R (m, before the vertical squash), N slots, slot j
void slot(vec2 d, float R, float N, float off, float j, int ri, int k0, int wi, inout float h, inout float glow, inout float wet){
  float th = (j + off) / N * 2.0 * PI;
  int k = wrapI(int(j), int(N));
  vec2 c = vec2(cos(th) * R, sin(th) * R * ${ASP.toFixed(3)});
  vec2 dir = normalize(-c), side = vec2(dir.y, -dir.x);
  vec2 lp = vec2(dot(d - c, side), dot(d - c, dir)) / 1.08;
  if (dot(lp, lp) > 0.16) return;
  float mir = (k & 1) == 0 ? 1.0 : -1.0; lp.x *= mir;
  vec4 sl = texelFetch(uSlots, ivec2(k0 + k, wi), 0);   // fill, pulse, hold
  float f = sl.r;
  float hd = sdHand(lp, 0.4 + 0.5 * h21(ivec2(k, ri))) * 1.08;
  float arm = sdCap(lp, vec2(0.004, -0.09), vec2(0.012 * mir, -0.30), 0.036);            // the arm reaching in, behind the hand
  h += -0.0018 * smoothstep(0.012, -0.025, arm) * smoothstep(-0.34, -0.12, lp.y) * (0.35 + 0.65 * f);
  stamp(hd, mix(0.0018, 0.0058, f), (f * (0.85 + 0.25 * uBreath) + sl.g * 0.7) * uGlow, h, glow);
  glow += exp(-pow(hd / 0.0022, 2.0)) * 0.05 * (1.0 - f) * uGlow;                // empty: a faint outline
  wet = max(wet, f * 0.8 * smoothstep(0.02, -0.01, hd));
}

// voronoi, periodic round the room: nearest site's cell and the distance to the nearest edge
vec3 voro(vec2 p, float cs, out ivec2 id1, out ivec2 id2, out vec2 site){
  int nx = int(floor(uRoom.x / cs + 0.5)); float cx = uRoom.x / float(nx);
  vec2 q = vec2(p.x / cx, p.y / cs); ivec2 ic = ivec2(floor(q)); vec2 f = q - vec2(ic);
  float md = 1e9; vec2 mr = vec2(0.0); ivec2 mc = ic;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    ivec2 c = ic + ivec2(i, j); vec2 o = 0.2 + 0.6 * h22(ivec2(wrapI(c.x, nx), c.y));
    vec2 r = (vec2(i, j) + o - f) * vec2(cx, cs); float dd = dot(r, r);
    if (dd < md){ md = dd; mr = r; mc = c; }
  }
  float ed = 1e9; ivec2 sc = mc;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    ivec2 c = mc + ivec2(i, j); if (c == mc) continue; vec2 o = 0.2 + 0.6 * h22(ivec2(wrapI(c.x, nx), c.y));
    vec2 r = (vec2(c - ic) + o - f) * vec2(cx, cs);
    float e = dot(0.5 * (mr + r), normalize(r - mr));
    if (e < ed){ ed = e; sc = c; }
  }
  id1 = ivec2(wrapI(mc.x, nx), mc.y); id2 = ivec2(wrapI(sc.x, nx), sc.y); site = p + mr;
  return vec3(ed, sqrt(md), float(nx));
}
float pairHash(ivec2 a, ivec2 b){ int ka = a.x * 1031 + a.y, kb = b.x * 1031 + b.y; return h21(ivec2(min(ka, kb), max(ka, kb))); }

void main(){
  vec2 p = vUv * uRoom;
  vec4 B = texture(uBase, vUv);
  vec4 S = texture(uSim, vUv);
  float h = B.r, glow = 0.0, clight = 0.0, wet = 0.4 + S.b * 0.6, dry = 0.0, shard = B.b;
  // the breath: the whole mass rises and settles
  h += (B.g - 0.5) * 0.010 * uBreath;
  // the hands' dents (sim) and their warmth
  h += S.r * uDentM;
  glow += S.g * 0.22;

  // ---- the pinya: rings of handprint slots round the nearest wall's centre
  for (int wi = 0; wi < ${MAXW}; wi++){
    if (wi >= uNW) break;
    float dx = wrapX(p.x - uWall[wi].x), dy = p.y - ${PINYA_Y.toFixed(3)};
    if (abs(dx) > 1.55 || abs(dy) > 1.1) continue;
    vec2 d = vec2(dx, dy), q = vec2(dx, dy / ${ASP.toFixed(3)});
    float r = length(q), a = atan(q.y, q.x);
    // the button at the centre, where the trunk will rise
    float cb = length(d);
    h += -0.0045 * exp(-pow(cb / 0.11, 2.0)) + 0.0016 * exp(-pow((cb - 0.17) / 0.035, 2.0));
    glow += exp(-pow((cb - 0.17) / 0.02, 2.0)) * (0.05 + 0.12 * uBreath) * uGlow;
    ${RINGS.map(([R, n, off], ri) => `
    if (abs(r - ${R.toFixed(3)}) < 0.42){
      float jf = a / (2.0 * PI) * ${n.toFixed(1)} - ${off.toFixed(3)};
      float j = floor(jf + 0.5), j2 = j + (jf > j ? 1.0 : -1.0);
      slot(d, ${R.toFixed(3)}, ${n.toFixed(1)}, ${off.toFixed(3)}, j, ${ri}, ${[0, 6, 16][ri]}, wi, h, glow, wet);
      slot(d, ${R.toFixed(3)}, ${n.toFixed(1)}, ${off.toFixed(3)}, j2, ${ri}, ${[0, 6, 16][ri]}, wi, h, glow, wet);
    }`).join('')}
  }

  // ---- free handprints, where hands landed
  for (int i = 0; i < ${MAXP}; i++){
    vec4 A = uPrint[i], Bp = uPrintB[i];
    if (Bp.z < 0.002) continue;
    vec2 d = vec2(wrapX(p.x - A.x), p.y - A.y);
    if (dot(d, d) > 0.04) continue;
    float ca = cos(A.z), sa = sin(A.z);
    vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y) / Bp.y; lp.x *= Bp.x;
    float hd = sdHand(lp, Bp.w) * Bp.y;
    float life = exp(-A.w / 7.0);                             // light fades over ~20 s
    float keep = 1.0 - smoothstep(14.0, 34.0, A.w);          // the print itself lasts longer
    stamp(hd, 0.0055 * keep * Bp.z, life * Bp.z * 1.25 * uGlow, h, glow);
    wet = max(wet, keep * 0.9 * smoothstep(0.02, -0.01, hd));
  }

  // ---- the circle closes: a rotllana of linked hands at hand height, turning round the room
  if (uBandOn > 0.001){
    float dc = 1e9;
    for (int wi = 0; wi < ${MAXW}; wi++){ if (wi >= uNW) break; dc = min(dc, abs(wrapX(p.x - uWall[wi].x))); }
    float reveal = smoothstep(uBandR, uBandR - 0.8, dc) * uBandOn;
    float outside = smoothstep(1.2, 1.5, dc);                  // the hands pass round each pinya, the line runs through it
    float by = p.y - ${PINYA_Y.toFixed(3)};
    float NM = 2.0 * floor(uRoom.x / 0.62 + 0.5);              // an even number of hands round the room: periodic, no seam
    float cw = uRoom.x / NM;
    float fi = p.x / uRoom.x * NM - uRot * NM;
    float ph = fract(fi);
    int idx = int(floor(fi));
    float mi = (idx & 1) == 1 ? -1.0 : 1.0;
    vec2 lp = vec2(-(by - 0.028 * mi), (ph - 0.5) * cw) / 1.1;  // fingers point the way the ring turns; alternate hands a little up, down
    lp.x *= mi;
    float hd = sdHand(lp - vec2(0.0, -0.01), 0.2) * 1.1;
    float u = p.x / uRoom.x - uRot;
    float crest = pow(0.5 + 0.5 * cos(2.0 * PI * u * 4.0), 6.0);      // four slow crests of light going round
    float band = exp(-pow(by / 0.11, 2.0));
    float hidden = 0.3 + 0.7 * outside;
    h += reveal * 0.006 * band * hidden;
    stamp(hd, 0.0055 * reveal * outside, reveal * outside * (0.45 + 0.8 * crest) * uGlow, h, glow);
    glow += reveal * (band * 0.10 + exp(-pow(by / 0.03, 2.0)) * 0.10) * (0.35 + 1.0 * crest) * hidden * uGlow;
    wet = max(wet, reveal * band * 0.6);
  }

  // ---- crack: it dries, it splits into shards, light shows in the cracks
  if (uCrack > 0.001){
    ivec2 a1, a2, b1, b2; vec2 sa, sb;
    vec3 vc = voro(p + (B.gb - 0.5) * 0.10, 0.62, a1, a2, sa);   // the first great cracks
    vec3 vf = voro(p + (B.bg - 0.5) * 0.05, 0.21, b1, b2, sb);   // then the shards
    float gc = smoothstep(0.03 + pairHash(a1, a2) * 0.22, 0.25 + pairHash(a1, a2) * 0.22, uCrack);
    float of = min(h21(b1 * 13 + 7), h21(b2 * 13 + 7));        // a shard breaks free whole: its whole outline opens at once
    float gf = smoothstep(0.30 + of * 0.62, 0.42 + of * 0.62, uCrack);
    float wc = gc * mix(0.0015, 0.0055, uCrack), wf = gf * mix(0.0008, 0.0030, uCrack);
    float ec = vc.x - wc, ef = vf.x - wf;
    float ic = gc * (1.0 - smoothstep(-0.001, 0.001, ec)), iff = gf * (1.0 - smoothstep(-0.001, 0.001, ef));
    float inCrack = max(ic, iff);
    float near = max(gc * exp(-max(ec, 0.0) / 0.012), gf * exp(-max(ef, 0.0) / 0.010));
    float rimL = max(gc * exp(-max(ec, 0.0) / 0.004), gf * exp(-max(ef, 0.0) / 0.003));
    dry = smoothstep(0.0, 0.8, uCrack);
    // shards: a little tilted, their edges curling up as mud does
    vec2 tl = (h22(b1 * 7 + a1) - 0.5) * 0.05 * gf + (h22(a1 * 5) - 0.5) * 0.03 * gc;
    h += dot(p - sb, tl) * uCrack;
    h += 0.0035 * near * smoothstep(0.0, 0.5, uCrack) * (1.0 - inCrack);
    h -= inCrack * 0.010;
    clight = (inCrack + rimL * 0.25) * (0.6 + 0.4 * uBreath) * smoothstep(0.0, 0.25, uCrack);
    shard = mix(shard, h21(b1 * 3 + a1), smoothstep(0.35, 1.0, uCrack));
    wet *= 1.0 - dry * 0.9;
  }
  o0 = vec4(h, glow, clight, wet);
  o1 = vec4(shard, dry, B.g, B.a);
}`);

  // ------------------------------------------------------------------ shade: normals, low raking light, hands as lights
  const shadeP = program(VS, HEAD + COMMON + `
uniform sampler2D uM0, uM1; uniform vec2 uTexel;
uniform float uTime, uBreath, uCrack, uRelief, uGlowGain, uProg;
uniform int uN, uNW; uniform vec4 uHand[${MAXH}]; uniform vec4 uWall[${MAXW}]; uniform vec4 uLamp[2];
in vec2 vUv; out vec4 o;
vec3 pointLight(vec3 pos, vec3 n, vec3 p, float rad, out float spec){
  vec3 L = pos - p; float d2 = dot(L, L); L *= inversesqrt(d2);
  float att = 1.0 / (1.0 + d2 / (rad * rad));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0)); spec = pow(max(dot(n, H), 0.0), 60.0) * att;
  return vec3(max(dot(n, L), 0.0) * att);
}
void main(){
  vec2 p = vUv * uRoom;
  vec4 M = texture(uM0, vUv), M1 = texture(uM1, vUv);
  float mx = uRoom.x * uTexel.x, my = uRoom.y * uTexel.y;
  float hl = texture(uM0, vUv - vec2(uTexel.x, 0.0)).r, hr = texture(uM0, vUv + vec2(uTexel.x, 0.0)).r;
  float hd = texture(uM0, vUv - vec2(0.0, uTexel.y)).r, hu = texture(uM0, vUv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3(-(hr - hl) / (2.0 * mx) * uRelief, -(hu - hd) / (2.0 * my) * uRelief, 1.0));
  float h = M.r, glow = M.g, clight = M.b, wet = M.a, shard = M1.r, dry = M1.g;

  // albedo: umber, terracotta, ochre, a little bone on the high places
  vec3 umber = vec3(0.12, 0.050, 0.024), terra = vec3(0.42, 0.150, 0.065), ochre = vec3(0.52, 0.28, 0.10), bone = vec3(0.62, 0.52, 0.40);
  float t1 = smoothstep(0.25, 0.75, M1.b), t2 = smoothstep(0.35, 0.95, shard);
  vec3 alb = mix(umber, terra, 0.35 + 0.65 * t1);
  alb = mix(alb, ochre, t2 * 0.45);
  alb = mix(alb, bone, smoothstep(0.6, 0.95, M1.b) * 0.16);
  alb *= 0.94 + 0.12 * M1.a;
  // drying: paler, matte; the shards each take a tone (the mosaic to come)
  vec3 dryC = mix(mix(terra * 1.15, ochre * 1.2, smoothstep(0.2, 0.6, shard)), bone, smoothstep(0.68, 0.95, shard));
  alb = mix(alb, dryC, dry * 0.75);
  alb *= 1.0 - wet * 0.35;                       // damp clay is darker

  // light: one low raking key from the upper left, pools round the pinyes, two slow lamps wandering round the room
  float dc = 1e9; for (int wi = 0; wi < ${MAXW}; wi++){ if (wi >= uNW) break; dc = min(dc, abs(wrapX(p.x - uWall[wi].x))); }
  float vert = exp(-pow((p.y - 1.3) / 1.15, 2.0));
  float pool = (0.16 + 0.84 * exp(-pow(dc / 2.1, 2.0))) * vert * (0.86 + 0.14 * uBreath);
  vec3 L = normalize(vec3(-0.82, 0.40, 0.30)); vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float key = max(dot(n, L), 0.0);
  float spK = pow(max(dot(n, Hh), 0.0), 22.0);
  vec3 P3 = vec3(p, h);
  vec3 lit = vec3(1.0, 0.80, 0.60) * key * pool * 1.15;
  float spec = spK * pool * 0.7;
  for (int i = 0; i < 2; i++){
    vec4 Lm = uLamp[i]; float sp;
    vec3 lp = vec3(p.x + wrapX(Lm.x - p.x), Lm.y, 0.55);
    lit += vec3(1.0, 0.72, 0.48) * pointLight(lp, n, P3, 1.6, sp) * Lm.z * 1.3;
    spec += sp * Lm.z * 0.6;
  }
  // hands: a warm light held close to the clay, raking across the print
  for (int i = 0; i < ${MAXH}; i++){
    if (i >= uN) break;
    vec4 Hd = uHand[i]; if (Hd.z < 0.01) continue;
    float dx = wrapX(Hd.x - p.x); if (abs(dx) > 1.6) continue;
    float sp; vec3 lp = vec3(p.x + dx - 0.10, Hd.y + 0.12, 0.07);
    lit += vec3(1.0, 0.66, 0.40) * pointLight(lp, n, P3, 0.30, sp) * Hd.z * 1.0;
    spec += sp * Hd.z * 0.15;
  }
  float specGain = mix(0.08, 0.55, wet) * (1.0 - dry * 0.85);
  vec3 c = alb * (lit + vec3(0.010, 0.007, 0.005)) + vec3(1.0, 0.86, 0.70) * spec * specGain;
  // light from inside: warm subsurface in the pressed places, gold in the cracks
  vec3 inner = vec3(1.0, 0.36, 0.11) * glow * 1.3 * uGlowGain + vec3(1.0, 0.55, 0.22) * glow * glow * 0.4 * uGlowGain;
  c += inner * (1.0 - dry * 0.45);
  c += vec3(1.0, 0.62, 0.30) * clight * 0.9 * uGlowGain * (0.18 + 0.82 * pool / (0.86 + 0.14 * uBreath));   // the cracks glow where the light is; the room stays dark
  o = vec4(c, 1.0);
}`);

  // ------------------------------------------------------------------ targets
  const W = env.size.w, H = env.size.h;
  const base = env.target(W, H);
  const m0 = env.target(W, H), m1 = env.target(W, H);
  gl.bindFramebuffer(gl.FRAMEBUFFER, m0.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, m1.tex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  const sw = Math.max(64, Math.round(W / 4)), sh = Math.max(16, Math.round(H / 4));
  const sim = [env.target(sw, sh), env.target(sw, sh)]; let cur = 0;
  // the slots' state: 32 x 8 float texture (fill, pulse, hold, -)
  const slotData = new Float32Array(32 * MAXW * 4);
  const slotTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, slotTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 32, MAXW, 0, gl.RGBA, gl.FLOAT, slotData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const setRoom = (pr) => gl.uniform2f(pr.u.uRoom, room.perimeter, room.height);
  const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
  // bake once
  gl.bindFramebuffer(gl.FRAMEBUFFER, base.fbo); gl.viewport(0, 0, W, H); gl.useProgram(bakeP.p); setRoom(bakeP); quad();

  // ------------------------------------------------------------------ the slots: positions in metres, fill order
  const slots = [];   // per wall, per slot: { x, y, ang, order, fill, hold, pulse }
  for (let wi = 0; wi < NW; wi++) {
    const cx = walls[wi].centre; let k0 = 0;
    for (let ri = 0; ri < RINGS.length; ri++) {
      const [R, n, off] = RINGS[ri];
      const ranks = [...Array(n).keys()].sort((a, b) => hash1(wi * 97 + ri * 13 + a) - hash1(wi * 97 + ri * 13 + b));
      for (let k = 0; k < n; k++) {
        const th = (k + off) / n * 2 * Math.PI, cx_ = Math.cos(th) * R, cy_ = Math.sin(th) * R * ASP;
        // fingers point inward: the hand's +y axis is -c
        const ang = Math.atan2(cx_, -cy_);   // rotation such that (0,1) maps to normalize(-c)
        slots.push({ wall: wi, idx: k0 + k, x: cx + cx_, y: PINYA_Y + cy_, ang, mir: (k & 1) ? -1 : 1, order: k0 + ranks.indexOf(k), fill: 0, hold: 0, pulse: 0, near: 0 });
      }
      k0 += n;
    }
  }
  const nearestSlot = (x, y, maxD) => {
    let best = null, bd = maxD * maxD;
    for (const s of slots) { const dx = wrap(x - s.x), dy = y - s.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } }
    return best;
  };

  // ------------------------------------------------------------------ state
  const hu = new Float32Array(MAXH * 4), wallU = new Float32Array(MAXW * 4), lampU = new Float32Array(8);
  const pu = new Float32Array(MAXP * 4), pbu = new Float32Array(MAXP * 4);
  for (let wi = 0; wi < NW; wi++) { wallU[wi * 4] = walls[wi].centre; wallU[wi * 4 + 1] = walls[wi].width / 2; }
  let nH = 0, pHead = 0, nPrints = 0, time = 0, dt = 1 / 60, breath = 0, rot = 0, bandR = 0, bandOn = 0, crack = 0, crackShown = 0;
  let P = env.params;
  const num = (k, d) => (Number.isFinite(+P[k]) && P[k] !== '' && P[k] != null ? +P[k] : d);

  function stampPrint(x, y) {
    const s = nearestSlot(x, y, 0.2);
    const i = pHead; pHead = (pHead + 1) % MAXP; nPrints++;
    const r = hash1(nPrints * 3.7 + x);
    if (s) { pu[i * 4] = s.x; pu[i * 4 + 1] = s.y; pu[i * 4 + 2] = s.ang; pbu[i * 4] = s.mir; s.hold = 1; s.pulse = 1; }
    else { pu[i * 4] = x; pu[i * 4 + 1] = y; pu[i * 4 + 2] = (r - 0.5) * 0.5; pbu[i * 4] = r < 0.5 ? 1 : -1; }
    pu[i * 4 + 3] = 0; pbu[i * 4 + 1] = (HAND_LEN / 0.17) * (0.94 + 0.12 * hash1(nPrints * 1.3)); pbu[i * 4 + 2] = s ? 0.6 : 1; pbu[i * 4 + 3] = 0.5 + 0.5 * hash1(nPrints * 5.1);
  }

  return {
    setParams(p) { P = p; },
    step(dt_, input) {
      dt = Math.min(0.1, dt_); time = input.time; P = input.params || P;
      // breath: 4 s in, 6 s out
      const bt = time % 10, depth = clamp(num('breath', 1), 0, 1);
      const raw = bt < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * bt / 4) : 0.5 + 0.5 * Math.cos(Math.PI * (bt - 4) / 6);
      breath = raw * depth;
      // hands
      nH = 0;
      for (const h of input.hands) { if (nH >= MAXH) break; hu[nH * 4] = h.x; hu[nH * 4 + 1] = h.y; hu[nH * 4 + 2] = h.s; hu[nH * 4 + 3] = h.on ? 1 : 0; nH++; }
      for (const d of input.downs) stampPrint(d.x, d.y);
      for (let i = 0; i < MAXP; i++) if (pbu[i * 4 + 2] > 0) { pu[i * 4 + 3] += dt; if (pu[i * 4 + 3] > 36) pbu[i * 4 + 2] = 0; }
      // slots: progress fills them ring by ring; a hand resting near one lights it at once
      const prog = input.progress, filled = clamp(prog / 0.84, 0, 1) * NS;
      for (const s of slots) {
        let near = 0;
        for (let i = 0; i < nH; i++) { if (!hu[i * 4 + 3]) continue; const dx = wrap(hu[i * 4] - s.x), dy = hu[i * 4 + 1] - s.y; if (dx * dx + dy * dy < 0.07) near = Math.max(near, hu[i * 4 + 2]); }
        if (near > 0.5 && s.near <= 0.5) s.pulse = 1;
        s.near = near;
        s.hold = Math.max(near, s.hold - dt / 9);
        const target = Math.max(clamp(filled - s.order, 0, 1), s.hold);
        s.fill = ease(s.fill, target, dt, target > s.fill ? (near > 0 ? 22 : 2.2) : 0.6);
        s.pulse *= Math.exp(-dt / 0.9);
        const o = (s.wall * 32 + s.idx) * 4; slotData[o] = s.fill; slotData[o + 1] = s.pulse; slotData[o + 2] = s.hold;
      }
      // the circle closes
      const k = clamp((prog - 0.84) / 0.13, 0, 1), kk = k * k * (3 - 2 * k);
      bandOn = kk > 0 ? Math.min(1, kk * 3) : 0; bandR = 1.2 + kk * 3.4;
      rot = (rot + dt * clamp((prog - 0.9) / 0.1, 0, 1) / 75) % 1;
      crack = clamp(num('crack', 0), 0, 1); crackShown = ease(crackShown, crack, dt, 4);
      // two slow lamps wandering round the room
      for (let i = 0; i < 2; i++) {
        lampU[i * 4] = ((time / 140 + i * 0.5 + 0.08 * Math.sin(time / 23 + i)) % 1) * P_;
        lampU[i * 4 + 1] = 1.35 + 0.35 * Math.sin(time / 17 + i * 2.1);
        lampU[i * 4 + 2] = 0.55 + 0.2 * Math.sin(time / 11 + i * 4);
      }
    },
    draw(target) {
      gl.disable(gl.BLEND);
      // sim
      const src = sim[cur], dst = sim[1 - cur]; cur = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, sw, sh); gl.useProgram(simP.p); setRoom(simP);
      bind(0, src.tex); gl.uniform1i(simP.u.uPrev, 0); gl.uniform2f(simP.u.uTexel, 1 / sw, 1 / sh);
      gl.uniform1f(simP.u.uDt, dt); gl.uniform1f(simP.u.uRelax, clamp(num('memory', 10), 2, 60));
      gl.uniform1i(simP.u.uN, nH); gl.uniform4fv(simP.u.uHand, hu); quad();
      // compose
      gl.bindTexture(gl.TEXTURE_2D, slotTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, MAXW, gl.RGBA, gl.FLOAT, slotData);
      gl.bindFramebuffer(gl.FRAMEBUFFER, m0.fbo); gl.viewport(0, 0, W, H); gl.useProgram(compP.p); setRoom(compP);
      bind(0, base.tex); bind(1, dst.tex); bind(2, slotTex);
      const u = compP.u;
      gl.uniform1i(u.uBase, 0); gl.uniform1i(u.uSim, 1); gl.uniform1i(u.uSlots, 2);
      gl.uniform1f(u.uTime, time); gl.uniform1f(u.uBreath, breath); gl.uniform1f(u.uCrack, crackShown);
      gl.uniform1f(u.uBandR, bandR); gl.uniform1f(u.uBandOn, bandOn); gl.uniform1f(u.uRot, rot);
      gl.uniform1f(u.uGlow, clamp(num('glow', 1), 0, 3)); gl.uniform1f(u.uDentM, 0.016 * clamp(num('depth', 1), 0, 3));
      gl.uniform1i(u.uNW, NW); gl.uniform4fv(u.uWall, wallU); gl.uniform4fv(u.uPrint, pu); gl.uniform4fv(u.uPrintB, pbu);
      quad();
      // shade
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h); gl.useProgram(shadeP.p); setRoom(shadeP);
      bind(0, m0.tex); bind(1, m1.tex);
      const v = shadeP.u;
      gl.uniform1i(v.uM0, 0); gl.uniform1i(v.uM1, 1); gl.uniform2f(v.uTexel, 1 / W, 1 / H);
      gl.uniform1f(v.uTime, time); gl.uniform1f(v.uBreath, breath); gl.uniform1f(v.uCrack, crackShown);
      gl.uniform1f(v.uRelief, clamp(num('relief', 1), 0, 3)); gl.uniform1f(v.uGlowGain, 1); gl.uniform1f(v.uProg, 0);
      gl.uniform1i(v.uN, nH); gl.uniform4fv(v.uHand, hu); gl.uniform1i(v.uNW, NW); gl.uniform4fv(v.uWall, wallU); gl.uniform4fv(v.uLamp, lampU);
      quad();
    },
    dispose() {
      for (const t of [base, m0, m1, ...sim]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      gl.deleteTexture(slotTex);
    },
  };
}
