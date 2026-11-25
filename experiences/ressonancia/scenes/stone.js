// Ressonància — scene "stone": III. Tronc — Equilibri — the universe of STONE AND CERAMIC (also the crown in V and La bajada).
// See host.js for the contract. Ported from ../experience.js (the trencadís, "Ember" look), without the director, guide or caption.
//
// One mosaic of broken glazed tiles round the four walls: a Voronoi field in the shader, periodic round the room (no seam).
// Every tile keeps a small state on the CPU (ember heat, how much it is fixed into the castell, its tone, gold), uploaded each
// frame as one tiny float texture; the shader does the ceramic: relief, grout, glaze highlights, embers, the light inside.
//   - THE GRID: rows of shards below 2.05 m (the hands zone and the pinya band 0.70–2.05 m); above, nine COURSES, one per floor
//     (2.05 m .. room height − 0.28 m), each with its own shard width and a wobbly mortar joint, so a floor reads as a floor;
//     a top band of rows where the crown's gold runs.
//   - ARRIVE (0..1): dark dry clay with hairline cracks glowing faintly (the end of chapter II) -> the cracks open and burn,
//     the shards separate, tilt, glaze over and darken into the trencadís, spreading out from hand height.
//   - FLOORS: one tower per structure wall, centred on the wall, narrowing as it climbs (5 m wide at the base, 1.5 m on top), with a
//     ragged, hand-made edge. A new floor lands hot and settles; floors go stone -> bone -> terracotta -> fire red. The floor
//     being built (floorProgress) shows as a faint ghost course.
//   - LEAN: the tower's frame is sheared sideways with height (smoothstep, up to lean × 0.5 m at its top) inside a soft window
//     round the tower; the upper floors tremble when |lean| > 0.45 or the wall is weak.
//   - THE PULSE: the pinya band of the structure walls breathes brighter on each pulse, with a swell over the last 30 % of the beat.
//   - CROWN (0..1): gold runs round the top band from one tower both ways (two gold lanterns ride the fronts), every tower gets a
//     gold top; from 0.45 the whole mosaic lights from inside.
//   - COMING DOWN: a floor that goes dissolves: its heat rains down the wall and its shards fall as glowing fragments (CPU particles,
//     instanced). FALL: all floors let go, top first, ~6 s.
//   - hands are LANTERNS (≤ 32): raking light over the glaze at once, and they warm the shards under them.
// input.state (the score's state, see ../score.js) drives it in the piece; in a study page the same shape is built from params.
// Sizes in metres; x wraps at the perimeter; no allocation per frame; no readPixels.
export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls, roundM } = env;
  const PER = room.perimeter, RH = room.height, NW = Math.min(8, walls.length);
  const MAXH = 32, MAXR = 64, MAXP = 3072;
  const FLOOR_Y0 = 2.05, PINYA_Y0 = 0.7, HAND_Y = 1.25, TOP_Y = RH - 0.28, FH = (TOP_Y - FLOOR_Y0) / 9;
  const PERIOD = 2.4, FADE = 8, REACH = 0.45;
  const COURSE = [1.0, 0.86, 1.14, 0.93, 1.22, 0.9, 1.08, 0.97, 1.18];        // shard width per floor: each course has its own hand
  const P = env.params;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (c, t, dt, r) => c + (t - c) * (1 - Math.exp(-dt * r));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const num = (k, d) => (typeof P[k] === 'number' && isFinite(P[k]) ? P[k] : d);
  const centres = walls.slice(0, NW).map((w) => w.centre);
  const half = (k) => 2.5 - 1.75 * (Math.min(8, k) / 8);                        // a tower's half width at floor k (m)

  // ---------------------------------------------------------------------------------------------------------------- GLSL shared
  const COMMON = `
vec3 pal(float t){   // the castell's tone: stone -> bone -> terracotta -> fire red
  const vec3 a = vec3(0.26,0.235,0.21), b = vec3(0.74,0.66,0.54), c = vec3(0.78,0.30,0.12), d = vec3(0.90,0.085,0.035);
  t = clamp(t, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(a,b,t) : t < 2.0 ? mix(b,c,t-1.0) : mix(c,d,t-2.0);
}
vec3 ember(float e){ return vec3(0.95,0.085,0.012) * e * 0.9 + vec3(1.0,0.34,0.05) * pow(max(e - 0.3, 0.0), 2.0) * 1.6 + vec3(1.0,0.80,0.45) * pow(max(e - 0.85, 0.0), 2.0) * 3.0; }
`;

  // ---------------------------------------------------------------------------------------------------------------- the mosaic
  const sceneP = program(VS, HEAD + COMMON + `
uniform sampler2D uState;                 // per tile: ember, fixed, tone, gold
uniform vec2 uRoom; uniform float uTime, uPx, uAmb;
uniform float uFY0, uYT, uHB, uHF, uHT, uTopH; uniform int uNB, uNF, uRows, uRPF;
uniform vec4 uRow[${MAXR}];               // per row: bottom y (m), height (m), shards round the room, 1 = a floor course
uniform int uN; uniform vec4 uHand[${MAXH}]; uniform vec4 uGlint[4];   // x, y (m), strength, -   | 2 wanderers, 2 crown fronts
uniform int uNTw; uniform vec4 uTw[8];    // towers: centre x (m), shear at the top (m), tremble 0..1, -
uniform int uNWall; uniform float uWallX[8];
uniform float uArrive, uPulse, uCrownGlow;
in vec2 vUv; out vec4 o;
const float TAU = 6.2831853;

vec2 hash2(ivec2 c){
  uvec2 q = uvec2(c) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return vec2(uvec2(n, n * 48271u) >> 8) / 16777216.0;
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), u.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), u.x), u.y); }
float noiseP(vec2 p, float f){ float per = max(1.0, floor(uRoom.x * f + 0.5)); return vn(vec2(p.x * per / uRoom.x, p.y * f), per); }   // periodic round the room
float wrapd(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }
float rowCoord(float y){ return y < uFY0 ? y / uHB : y < uYT ? float(uNB) + (y - uFY0) / uHF : float(uNB + uNF) + (y - uYT) / uHT; }
// a shard's seed (metres; x continuous across the seam, its id wrapped). Courses (floor rows) keep their seeds near the middle.
vec2 seedAt(vec4 R, int r, int c, float jyC, out ivec2 id){
  int ni = int(R.z);
  id = ivec2(((c % ni) + ni) % ni, r);
  vec2 h = hash2(id);
  float jy = R.w > 0.5 ? jyC : 0.39;
  return vec2((float(c) + 0.5 + (h.x - 0.5) * 0.78) * uRoom.x / R.z, R.x + R.y * (0.5 + (h.y - 0.5) * 2.0 * jy));
}

// a lantern: raking light over the glaze (diffuse + a tight glaze highlight)
vec3 lantern(vec4 h, vec3 tint, vec2 p, vec3 N, vec3 albedo, float a){
  vec3 d = vec3(wrapd(h.x - p.x), h.y - p.y, 0.32);
  if (abs(d.x) > 2.8 || abs(d.y) > 2.8 || h.z < 1e-3) return vec3(0.0);
  float r2 = dot(d, d), att = h.z / (1.0 + r2 * 3.2) * smoothstep(2.8, 1.0, sqrt(r2));
  vec3 l = d * inversesqrt(r2), hv = normalize(l + vec3(0.0, 0.0, 1.0));
  return tint * att * (albedo * max(dot(N, l), 0.0) * 1.1 + pow(max(dot(N, hv), 0.0), 90.0) * 1.6 * a);
}
void main(){
  vec2 p = vUv * uRoom;
  // the nearest tower: its lean shears its frame sideways with height, inside a soft window (slope < 0.4: nothing folds)
  float tdx = 1e3; int tw = -1;
  for (int i = 0; i < 8; i++) { if (i >= uNTw) break; float d = wrapd(p.x - uTw[i].x); if (abs(d) < abs(tdx)) { tdx = d; tw = i; } }
  float towerK = tw >= 0 ? smoothstep(3.3, 2.0, abs(tdx)) : 0.0;
  float fhF = uHF * float(uRPF), shift = 0.0;
  if (tw >= 0 && p.y > uFY0) {
    vec4 T = uTw[tw]; float h = clamp((p.y - uFY0) / uTopH, 0.0, 1.0), hs = h * h * (3.0 - 2.0 * h);
    float fl = floor((p.y - uFY0) / fhF);
    shift = (T.y * hs + T.z * 0.032 * h * h * sin(uTime * 16.0 + fl * 2.1 + float(tw) * 1.7)) * towerK;
  }
  vec2 q = vec2(mod(p.x - shift, uRoom.x), p.y);
  float jyC = mix(0.34, 0.12, towerK);

  // the nearest shard (3 x 3), then the distance to its edge, the grout (3 rows x 5 shards)
  int r0 = int(floor(rowCoord(q.y)));
  float md = 1e9; vec2 mr = vec2(0.0); ivec2 mid = ivec2(0);
  for (int j = -1; j <= 1; j++) {
    int r = r0 + j; if (r < 0 || r >= uRows) continue;
    vec4 R = uRow[r]; int c0 = int(floor(q.x * R.z / uRoom.x));
    for (int i = -1; i <= 1; i++) { ivec2 id; vec2 d = seedAt(R, r, c0 + i, jyC, id) - q; float dd = dot(d, d); if (dd < md) { md = dd; mr = d; mid = id; } }
  }
  float be = 1e9; vec2 bn = vec2(0.0, 1.0);
  for (int j = -1; j <= 1; j++) {
    int r = r0 + j; if (r < 0 || r >= uRows) continue;
    vec4 R = uRow[r]; int c0 = int(floor(q.x * R.z / uRoom.x));
    for (int i = -2; i <= 2; i++) {
      ivec2 id; vec2 rr = seedAt(R, r, c0 + i, jyC, id) - q, dr = rr - mr;
      if (dot(dr, dr) > 1e-9) { vec2 n = normalize(dr); float d = dot(0.5 * (mr + rr), n); if (d < be) { be = d; bn = n; } }
    }
  }
  vec4 st = texelFetch(uState, mid, 0);
  float fix = st.g, tone = st.b, gold = st.a;
  vec2 rnd = hash2(mid), rnd2 = hash2(mid + ivec2(37, 91));
  float e = st.r * mix(0.25, 1.0, rnd2.y * rnd2.y);           // some shards take the fire, some barely
  vec2 sc = q + mr;                                              // the shard's centre (tower frame)

  // arrive: each shard breaks free of the clay at its own moment, first near hand height
  float a = 1.0;
  if (uArrive < 0.999) {
    float th = 0.45 * clamp(abs(sc.y - 1.35) / 2.3, 0.0, 1.0) + 0.37 * noiseP(sc, 0.9) + 0.18 * rnd2.x;
    a = smoothstep(th * 0.72, th * 0.72 + 0.28, uArrive);
  }
  float open = pow(sin(3.14159 * a), 3.0);

  // the joint between two floors: a wobbly mortar line where the tower stands
  float dj = 1e3, jointK = 0.0;
  if (q.y > uFY0 - 0.05 && q.y < uYT + 0.05) {
    float kk = floor((q.y - uFY0) / fhF + 0.5);
    float yj = uFY0 + kk * fhF + 0.0045 * sin(TAU * 53.0 * q.x / uRoom.x + kk * 1.3) + 0.0025 * sin(TAU * 131.0 * q.x / uRoom.x + kk * 4.1);
    dj = abs(q.y - yj); jointK = towerK * smoothstep(0.2, 0.7, fix + gold) * a;
  }

  // the ceramic
  float aa = uPx * 1.25, gw = mix(0.0008, 0.0035, a) + 0.003 * open, jw = 0.0085 * jointK;
  float tile = smoothstep(gw, gw + aa, be) * (jw > 0.0 ? smoothstep(jw, jw + aa, dj) : 1.0);
  float speck = hash2(ivec2(gl_FragCoord.xy)).x;
  vec3 N = normalize(vec3((rnd - 0.5) * (0.04 + 0.22 * a) + bn * smoothstep(0.022, 0.0, be) * 0.85 * a + (speck - 0.5) * 0.02, 1.0));
  vec3 tonec = mix(pal(tone), vec3(1.0, 0.74, 0.27), gold);
  // dry clay (chapter II's last image): terracotta, ochre, a little bone
  float cn = a < 0.999 ? 0.65 * noiseP(p, 0.8) + 0.35 * noiseP(p + 7.0, 3.1) : 0.5;
  vec3 clay = mix(mix(vec3(0.42, 0.15, 0.065), vec3(0.58, 0.31, 0.11), smoothstep(0.3, 0.7, cn)), vec3(0.62, 0.52, 0.40), smoothstep(0.72, 0.9, cn) * 0.4);
  clay *= 0.93 + 0.1 * rnd2.y;
  // Ember glaze: dark, the light comes from inside the shards; the castell is banked coals
  vec3 glaze = mix(vec3(0.030,0.027,0.025), vec3(0.11,0.095,0.085), rnd.x);
  glaze = mix(glaze, tonec * (0.75 + 0.25 * rnd2.x), clamp(fix + gold, 0.0, 1.0) * 0.9);
  vec3 albedo = mix(clay, glaze, a);
  float inner = smoothstep(0.0, 0.045, be) * (0.7 + 0.3 * rnd.y);
  float coal = 0.035 + 0.075 * rnd2.y * rnd2.y + 0.02 * sin(uTime * (0.3 + rnd.x) + rnd.y * 6.2832);
  vec3 emis = ember(e) * inner + tonec * (fix * coal + gold * (sc.y > uYT ? 0.55 : 1.5) * (0.65 + 0.35 * rnd2.y)) * smoothstep(0.0, 0.03, be);
  // the pulse: the pinya band of the structure walls breathes
  float band = smoothstep(PINYA_Y0_ - 0.08, PINYA_Y0_ + 0.06, sc.y) * smoothstep(uFY0 + 0.06, uFY0 - 0.08, sc.y) * smoothstep(3.4, 2.3, abs(tdx));
  emis += vec3(1.0, 0.60, 0.30) * uPulse * band * inner * (0.05 + 0.05 * rnd2.x) * (0.5 + fix);
  // the crown: the whole mosaic lit from inside, the tower most of all
  emis += mix(vec3(1.0, 0.52, 0.20), tonec, 0.6 * clamp(fix + gold, 0.0, 1.0)) * uCrownGlow * inner * (0.002 + 0.012 * rnd2.y * rnd2.y * rnd2.y + 0.55 * fix * fix * fix + (sc.y > uYT ? 0.05 : 0.3) * gold);
  // a faint warm lip along the joints of the tower
  if (jw > 0.0) emis += tonec * 0.22 * jointK * exp(-max(dj - jw, 0.0) / 0.004) * (0.6 + 0.4 * rnd.y);
  emis *= a;
  // a shard settling into place glints once
  emis += tonec * 0.25 * exp(-pow((a - 0.82) / 0.09, 2.0)) * inner;

  // light: the low raking key and pools of chapter II on the clay (gone as the glaze arrives), every hand, the wanderers, the crown
  vec3 lit = albedo * 0.010 * uAmb;
  if (a < 0.999) {
    float dc = 1e3; for (int i = 0; i < 8; i++) { if (i >= uNWall) break; dc = min(dc, abs(wrapd(p.x - uWallX[i]))); }
    float pool = (0.16 + 0.84 * exp(-pow(dc / 2.1, 2.0))) * exp(-pow((p.y - 1.3) / 1.15, 2.0));
    lit += (1.0 - a) * vec3(1.0, 0.80, 0.60) * albedo * max(dot(N, normalize(vec3(-0.82, 0.40, 0.30))), 0.0) * pool * 0.75;
  }
  for (int i = 0; i < ${MAXH}; i++) { if (i >= uN) break; lit += lantern(uHand[i], vec3(1.0, 0.93, 0.82), p, N, albedo, a); }
  for (int i = 0; i < 4; i++) { if (uGlint[i].z > 1e-3) lit += lantern(uGlint[i], i >= 2 ? vec3(1.0, 0.74, 0.30) : vec3(0.75, 0.86, 1.0), p, N, albedo, a); }
  vec3 col = (lit + emis) * tile + vec3(0.0015) * (1.0 - tile);
  // the cracks: hairlines glowing faintly in the clay; they open and burn while the shards break free, then go dark
  float crack = exp(-be / mix(0.0014, 0.0045, open)) * ((1.0 - a) * 0.22 * (0.35 + 0.65 * rnd2.y) + 0.6 * open) * (0.75 + 0.25 * sin(uTime * 0.6 + rnd.y * 6.0));
  col += vec3(1.0, 0.55, 0.22) * crack;
  o = vec4(col, 1.0);
}`.replace(/PINYA_Y0_/g, PINYA_Y0.toFixed(3)));

  // ---------------------------------------------------------------------------------------------------------------- falling shards
  const shardP = program(HEAD + COMMON + `
layout(location = 0) in vec4 aP;          // x, y (m), heat, floor(tone * 255) + seed
uniform vec2 uRoom; uniform float uShift, uTime;
out vec2 vQ; out vec3 vCol; flat out vec3 vA;
void main(){
  float sd = fract(aP.w), tone = floor(aP.w) / 255.0;
  int vid = gl_VertexID; vec2 c = vec2(float(vid & 1), float(vid >> 1)) * 2.0 - 1.0;
  float size = 0.016 + 0.026 * fract(sd * 7.31), rot = sd * 6.2832 + uTime * (sd - 0.5) * 3.0;
  vec2 cs = vec2(cos(rot), sin(rot));
  vec2 pos = aP.xy + vec2(c.x * cs.x - c.y * cs.y, c.x * cs.y + c.y * cs.x) * size + vec2(uShift, 0.0);
  vQ = c; vA = vec3(sd * 6.2832, 2.0 + fract(sd * 13.7) * 0.6, 2.0 + fract(sd * 29.3) * 0.6);
  vCol = ember(aP.z) * 1.4 + pal(tone) * aP.z * 0.35;
  gl_Position = vec4(pos / uRoom * 2.0 - 1.0, 0.0, 1.0);
}`, HEAD + `in vec2 vQ; in vec3 vCol; flat in vec3 vA; out vec4 o;
void main(){   // a broken triangle: three half-planes
  float a0 = vA.x, a1 = a0 + vA.y, a2 = a1 + vA.z;
  float m = max(max(dot(vQ, vec2(cos(a0), sin(a0))), dot(vQ, vec2(cos(a1), sin(a1)))), dot(vQ, vec2(cos(a2), sin(a2))));
  float k = smoothstep(0.62, 0.42, m);
  o = vec4(vCol * k, 1.0);
}`);
  const SHIFTS = [0, PER, -PER];
  const pBuf = gl.createBuffer(), pVao = gl.createVertexArray();
  gl.bindVertexArray(pVao); gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
  gl.bufferData(gl.ARRAY_BUFFER, MAXP * 16, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1);
  gl.bindVertexArray(null);
  const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PVX = new Float32Array(MAXP), PVY = new Float32Array(MAXP);
  const PH = new Float32Array(MAXP), PW = new Float32Array(MAXP), pData = new Float32Array(MAXP * 4);
  let np = 0;
  function spawn(x, y, heat0, tone) {
    if (np >= MAXP) return;
    const i = np++;
    PX[i] = ((x % PER) + PER) % PER; PY[i] = y; PVX[i] = (Math.random() - 0.5) * 0.3; PVY[i] = 0.05 + Math.random() * 0.35;
    PH[i] = heat0 * (0.75 + 0.5 * Math.random()); PW[i] = Math.floor(clamp(tone, 0, 1) * 255) + Math.random() * 0.999;
  }

  // ---------------------------------------------------------------------------------------------------------------- the tiles
  const stateTex = gl.createTexture();
  let G = null;
  function build(tile) {
    tile = clamp(tile, 0.08, 0.4);
    const nB = Math.max(4, Math.round(FLOOR_Y0 / tile)), hB = FLOOR_Y0 / nB;
    const rpf = Math.max(1, Math.round(FH / tile)), hF = FH / rpf, nF = 9 * rpf;
    const nT = Math.max(1, Math.round((RH - TOP_Y) / tile)), hT = (RH - TOP_Y) / nT;
    const rows = Math.min(MAXR, nB + nF + nT);
    const cols = new Float32Array(MAXR), y0 = new Float32Array(rows), rh = new Float32Array(rows), fl = new Int8Array(rows);
    for (let r = 0; r < rows; r++) {
      if (r < nB) { y0[r] = r * hB; rh[r] = hB; } else if (r < nB + nF) { y0[r] = FLOOR_Y0 + (r - nB) * hF; rh[r] = hF; } else { y0[r] = TOP_Y + (r - nB - nF) * hT; rh[r] = hT; }
      const yc = y0[r] + rh[r] / 2;
      fl[r] = yc < PINYA_Y0 ? -2 : yc < FLOOR_Y0 ? -1 : yc < TOP_Y ? Math.min(8, Math.floor((yc - FLOOR_Y0) / FH)) : 9;
      cols[r] = Math.max(16, Math.round(PER / (tile * (fl[r] >= 0 && fl[r] < 9 ? COURSE[fl[r]] : 1))));
    }
    let MC = 0; for (let r = 0; r < rows; r++) MC = Math.max(MC, cols[r]);
    const rowU = new Float32Array(MAXR * 4);
    for (let r = 0; r < rows; r++) { rowU[r * 4] = y0[r]; rowU[r * 4 + 1] = rh[r]; rowU[r * 4 + 2] = cols[r]; rowU[r * 4 + 3] = r >= nB && r < nB + nF ? 1 : 0; }
    const n = rows * MC, F = (m) => new Float32Array(m);
    const rnd = (() => { let a = 0x9e3779b9; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    G = { tile, rowU, rows, MC, n, nB, nF, nT, hB, hF, hT, rpf, cols, y0, rh, fl, avgH: RH / rows,
      x: F(n), y: F(n), dw: F(n), jag: F(n), hearth: F(n), phase: F(n), rate: F(n), top: new Uint8Array(n),
      wall: new Int8Array(n), floor: new Int8Array(n), up: new Int32Array(n), dn: new Int32Array(n),
      heat: F(n), tmp: F(n), fix: F(n), tone: F(n), gold: F(n), data: F(n * 4) };
    for (let r = 0; r < rows; r++) {
      const nc = cols[r], yc = y0[r] + rh[r] / 2;
      for (let c = 0; c < nc; c++) {
        const i = r * MC + c, x = ((c + 0.5) / nc) * PER;
        G.x[i] = x; G.y[i] = yc; G.floor[i] = fl[r]; G.top[i] = yc >= RH - 0.17 ? 1 : 0;
        let w = 0, dw = 1e9; for (let k = 0; k < NW; k++) { const d = roundM(x - centres[k]); if (Math.abs(d) < Math.abs(dw)) { dw = d; w = k; } }
        G.wall[i] = w; G.dw[i] = dw; G.jag[i] = (rnd() - 0.5) * 0.32;
        G.phase[i] = rnd() * Math.PI * 2; G.rate[i] = 0.25 + rnd() * 0.9;
        G.hearth[i] = Math.exp(-(dw * dw + (yc - HAND_Y) ** 2) / (2 * 0.5 ** 2)) * (0.6 + 0.4 * rnd());   // a hearth at each wall's centre
        G.up[i] = r + 1 < rows ? (r + 1) * MC + Math.min(cols[r + 1] - 1, Math.floor(((c + 0.5) * cols[r + 1]) / nc)) : i;
        G.dn[i] = r > 0 ? (r - 1) * MC + Math.min(cols[r - 1] - 1, Math.floor(((c + 0.5) * cols[r - 1]) / nc)) : i;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, stateTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MC, rows, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    shown = 0; floorTimer = 0;   // the towers rise again
  }
  // visit the tiles of floor k on a structure wall that are (or were) part of the tower
  function eachTowerTile(k, fn) {
    for (let r = 0; r < G.rows; r++) {
      if (G.fl[r] !== k) continue;
      for (let c = 0; c < G.cols[r]; c++) { const i = r * G.MC + c; if (on[G.wall[i]]) fn(i); }
    }
  }
  // the tower frame -> the room (the same shear as the shader, for the falling shards)
  function sheared(i) {
    const w = G.wall[i], dx = G.dw[i], y = G.y[i];
    if (y <= FLOOR_Y0) return G.x[i];
    const h = clamp((y - FLOOR_Y0) / topH, 0, 1), hs = h * h * (3 - 2 * h);
    return G.x[i] + leanS[w] * 0.5 * hs * sstep(3.3, 2.0, Math.abs(dx));
  }
  function arriveFloor(k) { eachTowerTile(k, (i) => { if (Math.abs(G.dw[i]) < half(k) + G.jag[i]) G.heat[i] = Math.min(1.3, G.heat[i] + 0.95 * (0.6 + 0.4 * Math.sin(G.phase[i]) ** 2)); }); }
  function dissolve(k, hard) {     // a floor lets go: its heat rains, its shards fall
    const visit = (i) => {
      if (G.fix[i] < 0.3 && G.gold[i] < 0.3) return;
      G.heat[i] = Math.min(1.3, G.heat[i] + (hard ? 1.1 : 0.85));
      const nS = Math.random() < (hard ? 0.8 : 0.55) ? 2 : 1;
      for (let s = 0; s < nS; s++) spawn(sheared(i) + (Math.random() - 0.5) * G.tile, G.y[i] + (Math.random() - 0.5) * G.rh[0] * 0.6, hard ? 1.25 : 1.0, G.gold[i] > 0.5 ? 1 : G.tone[i]);
    };
    eachTowerTile(k, visit);
    rainT = time;
  }

  // ---------------------------------------------------------------------------------------------------------------- live state
  const on = new Uint8Array(8), pin = new Float32Array(8), leanS = new Float32Array(8), tremS = new Float32Array(8);
  const handU = new Float32Array(MAXH * 4), glintU = new Float32Array(16), twU = new Float32Array(32), wallXU = new Float32Array(8);
  for (let i = 0; i < NW; i++) wallXU[i] = centres[i];
  // the study's stand-in for input.state (the score's shape)
  const S = { block: 'tronc', phase: 'play', walls: Array(NW).fill(false), structure: 0, floors: 0, floorProgress: 0, beat: 0,
    lean: Array(NW).fill(0), weak: Array(NW).fill(0), balance: false, outcome: null, progress: 0 };
  const studyEvents = [];
  const PICK = [null, null, [0, 2], [0, 1, 2], [0, 1, 2, 3]];   // which walls carry a tower in the study (a torre: two opposite walls)
  let time = 0, nh = 0, ntw = 0, shown = 0, floorTimer = 0, fpS = 0, topH = 2 * FH, arriveS = -1, arriveClock = 0, lastBlock = '';
  let crownS = 0, crownX = centres[0] || 0, pulseT = -10, pulseEnv = 0, beatClock = 0, rainT = -10, rain = 0;
  let falling = false, fallen = false, fallT = 0, relN = 0, released = 0, relGap = 0.5, lastFallP = !!P.fall;

  build(num('tile', 0.15));

  function studyState(dt, input) {
    const nW = clamp(Math.round(Number(P.walls) || 4), 2, Math.max(2, Math.min(4, NW))), pick = PICK[nW];
    for (let w = 0; w < NW; w++) S.walls[w] = pick.includes(w);
    S.structure = nW;
    let fl = clamp(Math.round(num('floors', 0)), 0, 9), fp = 0;
    if (fl === 0) { const v = clamp(input.progress, 0, 1) * 9; fl = Math.floor(v); fp = v - fl; }
    S.floors = fl; S.floorProgress = fp;
    const ln = clamp(num('lean', 0), -1, 1); for (let w = 0; w < NW; w++) { S.lean[w] = ln; S.weak[w] = 0; }
    studyEvents.length = 0;
    if (P.pulse !== false) { beatClock += dt; if (beatClock >= PERIOD) { beatClock -= PERIOD; studyEvents.push('pulse'); } S.beat = beatClock / PERIOD; S.block = 'tronc'; }
    else S.block = 'study';
    const f = !!P.fall; if (f && !lastFallP) studyEvents.push('fall'); lastFallP = f;
    return S;
  }

  return {
    step(dt, input) {
      dt = Math.min(dt, 0.05); time = input.time;
      if (Math.abs(num('tile', 0.15) - G.tile) > 1e-6 && num('tile', 0.15) >= 0.08) build(num('tile', 0.15));
      const study = !input.state;
      const st = study ? studyState(dt, input) : input.state;
      const events = study ? studyEvents : (input.events || []);
      const block = st.block || 'tronc';
      if (block !== lastBlock) { lastBlock = block; if (block === 'tronc') arriveClock = 0; }
      arriveClock += dt;

      // what the state asks
      let arriveT, crownT, pinT;
      if (study) { arriveT = clamp(num('arrive', 1), 0, 1); crownT = clamp(num('crown', 0), 0, 1); pinT = 1; }
      else {
        arriveT = typeof st.arrive === 'number' ? clamp(st.arrive, 0, 1) : block === 'tronc' ? clamp(arriveClock / 7, 0, 1) : 1;
        crownT = block === 'crown' ? clamp((st.progress || 0) / 0.4, 0, 1) : block === 'festa' ? 1 : block === 'baixada' ? 0.55 : 0;
        pinT = block === 'tronc' || block === 'pom' || block === 'crown' || block === 'festa' || block === 'baixada' || block === 'fall' ? 1 : 0;
      }
      if (falling || fallen) crownT = 0;                  // a castell that fell is not crowned
      if (arriveS < 0) arriveS = arriveT;                 // the first frame starts where it is asked: no fade-in from nothing
      arriveS = ease(arriveS, arriveT, dt, study ? 2.5 : 8);
      crownS = ease(crownS, crownT, dt, study ? 2.5 : 6);
      if (crownS < 0.01) { const w0 = st.walls ? st.walls.indexOf(true) : -1; crownX = centres[Math.max(0, w0)] || 0; }
      for (let w = 0; w < NW; w++) on[w] = st.walls && st.walls[w] ? 1 : 0;

      // events
      for (const ev of events) {
        if (ev === 'pulse') pulseT = time;
        else if (ev === 'fall' && !falling && !fallen) { falling = true; fallT = 0; relN = shown; released = 0; relGap = relN ? Math.min(0.55, 4.2 / relN) : 0.5; floorTimer = 0; }
      }
      if (fallen && (study ? !P.fall : block !== 'fall' && block !== 'acta')) fallen = false;

      // floors: rise one at a time, come down one at a time, or all let go
      const target = fallen ? 0 : clamp(Math.round(st.floors || 0), 0, 9);
      if (falling) {
        if (released === 0 && fallT === 0) eachGoldTop();
        fallT += dt;
        while (released < relN && fallT >= released * relGap) { dissolve(shown - 1, true); shown--; released++; }
        if (fallT > relN * relGap + 2.2) { falling = false; fallen = true; }
      } else {
        floorTimer -= dt;
        if (floorTimer <= 0) {
          if (shown < target) { arriveFloor(shown); shown++; floorTimer = 0.35; }
          else if (shown > target) { dissolve(shown - 1, false); shown--; floorTimer = 0.6; }
        }
      }
      fpS = ease(fpS, shown === target && !falling && !fallen ? clamp(st.floorProgress || 0, 0, 1) : 0, dt, 3);
      topH = ease(topH, Math.max(2, shown) * FH, dt, 2);
      const goldTop = crownS > 0.12 && !falling && !fallen;
      const pinEnd = falling ? 1 - sstep(relN * relGap, relN * relGap + 1.5, fallT) : fallen ? 0 : 1;
      for (let w = 0; w < NW; w++) {
        pin[w] = ease(pin[w], on[w] ? pinT * (fallen ? 0.15 : 0.15 + 0.85 * pinEnd) : 0, dt, 1.5);
        leanS[w] = ease(leanS[w], on[w] && !fallen ? clamp((st.lean && st.lean[w]) || 0, -1, 1) : 0, dt, 2.2);
        const wk = Math.min(1, ((st.weak && st.weak[w]) || 0) / 2);
        tremS[w] = ease(tremS[w], on[w] && !fallen ? Math.max(sstep(0.45, 0.75, Math.abs(leanS[w])), wk) : 0, dt, 3);
      }

      // the pulse: a breath on the pulse, a swell over the last 30 % of the beat
      const pulsing = study ? P.pulse !== false : block === 'tronc';
      const beat = clamp(st.beat || 0, 0, 1);
      pulseEnv = pulsing ? Math.exp(-(time - pulseT) / 0.45) + (beat > 0.7 ? ((beat - 0.7) / 0.3) ** 2 * 0.35 : 0) : ease(pulseEnv, 0, dt, 2);

      // embers: spread a little, cool; while the castell comes down the heat rains
      rain = ease(rain, time - rainT < (falling ? 6 : 3.5) ? 1 : 0, dt, 1.5);
      const { rows, MC, cols, heat, tmp } = G;
      tmp.set(heat);
      const kd = Math.min(0.2, 1.1 * dt), cool = Math.exp(-dt / FADE), adv = Math.min(0.45, (rain * dt * 0.9) / G.avgH);
      for (let r = 0; r < rows; r++) {
        const nc = cols[r], base = r * MC;
        for (let c = 0; c < nc; c++) {
          const i = base + c, l = base + (c === 0 ? nc - 1 : c - 1), rr = base + (c === nc - 1 ? 0 : c + 1), u = G.up[i];
          heat[i] = (tmp[i] + kd * ((tmp[l] + tmp[rr] + tmp[u] + tmp[G.dn[i]]) * 0.25 - tmp[i]) + adv * (tmp[u] - tmp[i])) * cool;
        }
      }
      // hands: lanterns, and they warm the shards under them; many hands reach a little further
      nh = 0; let present = 0;
      for (const h of input.hands) { if (h.on) present++; }
      const reach = REACH * Math.min(1.8, 1 + 0.1 * Math.max(0, present - 1)), sig = reach * 0.5;
      for (const h of input.hands) {
        if (nh >= MAXH) break;
        handU[nh * 4] = h.x; handU[nh * 4 + 1] = h.y; handU[nh * 4 + 2] = h.s; nh++;
        if (!h.on) continue;
        for (let r = 0; r < rows; r++) {
          const dy = G.y0[r] + G.rh[r] / 2 - h.y; if (Math.abs(dy) > reach) continue;
          const nc = cols[r], cw = PER / nc, c0 = Math.floor((h.x - reach) / cw), c1 = Math.ceil((h.x + reach) / cw);
          for (let a = c0; a <= c1; a++) {
            const c = ((a % nc) + nc) % nc, dx = (a + 0.5) * cw - h.x, i = r * MC + c;
            heat[i] = Math.min(1.1, heat[i] + dt * 1.5 * Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)));
          }
        }
      }

      // everything per tile: what the castell asks of it, eased
      const data = G.data, breath = 0.5 - 0.5 * Math.cos((time / 10) * Math.PI * 2), amb = 0.6;
      const reachC = sstep(0, 0.6, crownS) * (PER / 2 + 0.5), goldK = 1 - Math.exp(-dt * 5);
      for (let r = 0; r < rows; r++) {
        const nc = cols[r], k = G.fl[r];
        for (let c = 0; c < nc; c++) {
          const i = r * MC + c, w = G.wall[i], dwa = Math.abs(G.dw[i]);
          let fT = 0, gT = 0, tn = -1;
          if (k === -1) { if (pin[w] > 0.001 && dwa < 3.0 + G.jag[i]) fT = 0.45 * pin[w]; }
          else if (k >= 0 && on[w]) {
            const hk = half(k) + G.jag[i];
            if (k < shown && dwa < hk) { fT = 1; tn = 0.10 + 0.90 * (Math.min(k, 8) / 8); }
            else if (k === shown && dwa < hk) {
              if (goldTop && dwa < hk * 0.6) { gT = 1; tn = 1; }
              else if (fpS > 0.01) { fT = 0.3 * fpS; tn = 0.10 + 0.90 * (Math.min(k, 8) / 8); }
            }
          }
          if (G.top[i] && reachC > 0 && Math.abs(roundM(G.x[i] - crownX)) < reachC) gT = 1;
          if (tn >= 0) G.tone[i] = tn;
          const kk = 1 - Math.exp(-dt * (0.6 + G.rate[i] * 1.6));
          G.fix[i] += (fT - G.fix[i]) * kk;
          G.gold[i] += (gT - G.gold[i]) * (gT > G.gold[i] ? goldK : kk);
          let fix = G.fix[i];
          if (tremS[w] > 0.02 && k >= 0 && k >= shown - 3) fix *= 1 - 0.5 * tremS[w] * (0.5 + 0.5 * Math.sin(time * 21 + G.phase[i] * 3));   // the top trembles
          const base = on[w] ? amb * G.hearth[i] * 0.8 * pin[w] * (0.10 + 0.09 * breath + 0.06 * Math.sin(time * G.rate[i] + G.phase[i]) + 0.15 * pulseEnv) : 0;
          data[i * 4] = heat[i] + base; data[i * 4 + 1] = fix; data[i * 4 + 2] = G.tone[i]; data[i * 4 + 3] = G.gold[i];
        }
      }

      // falling shards: slow, swaying, cooling
      let j = 0;
      for (let i = 0; i < np; i++) {
        PVY[i] += -1.6 * dt; const drag = Math.exp(-dt * 1.8); PVX[i] *= drag; PVY[i] *= drag;
        PVX[i] += Math.sin(time * 1.3 + PW[i] * 20) * 0.35 * dt;
        PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt; PH[i] *= Math.exp(-dt / 2.6);
        if (PY[i] < -0.05 || PH[i] < 0.03) continue;
        if (j !== i) { PX[j] = PX[i]; PY[j] = PY[i]; PVX[j] = PVX[i]; PVY[j] = PVY[i]; PH[j] = PH[i]; PW[j] = PW[i]; }
        PX[j] = ((PX[j] % PER) + PER) % PER;
        pData[j * 4] = PX[j]; pData[j * 4 + 1] = PY[j]; pData[j * 4 + 2] = PH[j]; pData[j * 4 + 3] = PW[j]; j++;
      }
      np = j;

      // towers for the shader
      ntw = 0;
      for (let w = 0; w < NW; w++) if (on[w] || Math.abs(leanS[w]) > 0.01) { twU[ntw * 4] = centres[w]; twU[ntw * 4 + 1] = leanS[w] * 0.5; twU[ntw * 4 + 2] = tremS[w]; twU[ntw * 4 + 3] = 1; ntw++; }
      // two wanderers; two gold lanterns riding the crown's fronts
      for (let g = 0; g < 2; g++) {
        glintU[g * 4] = ((((time / 120 + g * 0.5) % 1) + 1) % 1) * PER;
        glintU[g * 4 + 1] = (0.42 + 0.2 * Math.sin(time * 0.05 + g * 2.1)) * RH;
        glintU[g * 4 + 2] = 0.22 * amb;
      }
      const front = sstep(0, 0.04, crownS) * (1 - sstep(0.5, 0.64, crownS)) * 1.4;
      for (let g = 0; g < 2; g++) { glintU[8 + g * 4] = (((crownX + (g ? 1 : -1) * reachC) % PER) + PER) % PER; glintU[9 + g * 4] = RH - 0.2; glintU[10 + g * 4] = front; }
    },

    draw(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stateTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, G.MC, G.rows, gl.RGBA, gl.FLOAT, G.data);
      const u = sceneP.u;
      gl.useProgram(sceneP.p);
      gl.uniform1i(u.uState, 0);
      gl.uniform2f(u.uRoom, PER, RH); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uPx, RH / target.h); gl.uniform1f(u.uAmb, 0.6);
      gl.uniform1f(u.uFY0, FLOOR_Y0); gl.uniform1f(u.uYT, TOP_Y); gl.uniform1f(u.uHB, G.hB); gl.uniform1f(u.uHF, G.hF); gl.uniform1f(u.uHT, G.hT); gl.uniform1f(u.uTopH, topH);
      gl.uniform1i(u.uNB, G.nB); gl.uniform1i(u.uNF, G.nF); gl.uniform1i(u.uRows, G.rows); gl.uniform1i(u.uRPF, G.rpf);
      gl.uniform4fv(u.uRow, G.rowU);
      gl.uniform1i(u.uN, nh); gl.uniform4fv(u.uHand, handU); gl.uniform4fv(u.uGlint, glintU);
      gl.uniform1i(u.uNTw, ntw); gl.uniform4fv(u.uTw, twU); gl.uniform1i(u.uNWall, NW); gl.uniform1fv(u.uWallX, wallXU);
      gl.uniform1f(u.uArrive, clamp(arriveS, 0, 1)); gl.uniform1f(u.uPulse, pulseEnv); gl.uniform1f(u.uCrownGlow, sstep(0.45, 1, crownS));
      quad();
      if (np > 0) {   // falling shards, additive; drawn three times (shifted by ±one perimeter) so the seam cuts nothing
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pData, 0, np * 4);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(shardP.p); gl.uniform2f(shardP.u.uRoom, PER, RH); gl.uniform1f(shardP.u.uTime, time);
        gl.bindVertexArray(pVao);
        for (const s of SHIFTS) { gl.uniform1f(shardP.u.uShift, s); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, np); }
        gl.bindVertexArray(null); gl.disable(gl.BLEND);
      }
    },

    setParams() { /* parameters are read live from env.params every frame */ },
  };

  // the gold tops let go first when the castell falls
  function eachGoldTop() {
    for (let i = 0; i < G.n; i++) if (G.gold[i] > 0.5 && !G.top[i]) { G.heat[i] = Math.min(1.3, G.heat[i] + 1.0); spawn(sheared(i), G.y[i], 1.3, 1); }
  }
}
