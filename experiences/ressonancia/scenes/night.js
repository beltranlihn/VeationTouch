// Ressonància — scene "night": IV. Pom de dalt — Valor — the universe of AIR AND NIGHT. See host.js for the contract.
//
// The square holds its breath while the smallest climb. Cold, vast, silent; the only warm thing is gold.
//   - the SKY: deep blue-black, stars in three depth layers (parallax drift, gentle twinkle), a band of milky dust and slow wind
//     veils. All noise is sampled on a CYLINDER the size of the room, so the last wall runs into the first with no seam.
//   - the CASTELL below: one tower of banked embers at each wall's centre, ~2 m high, like a city seen from far above.
//   - THREE LIGHTS climb in turn (dosos, acotxador, enxaneta), each one turn of a helix round the room, leaving a thin gold thread.
//     input.progress drives them: 0-1/3 the first, 1/3-2/3 the second, 2/3-1 the third. At 1 the last rests at the top and glows.
//   - HANDS ARE STILLNESS: a still hand grows a calm halo (~2 s) and gathers the stars round it; still hands < 2 m apart are joined
//     by a constellation line. A moving hand (> 0.3 m/s) disturbs the air: a ripple, its halo collapses, the climbing light
//     flickers and hesitates (it slows and slips back a little).
// One full-screen pass. Sizes in metres; every distance wraps round the room; no allocation per frame.
export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls, roundM } = env;
  const MAXH = 32, MAXR = 24, MAXS = 32, MAXT = 8, TAU = Math.PI * 2;
  const P = room.perimeter, H = room.height;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeIO = (t) => t * t * t * (t * (t * 6 - 15) + 10);           // smootherstep: a climb that sets off and arrives gently

  // ------------------------------------------------------------------------------------------- the climbs (metres)
  const START = walls.length ? walls[1 % walls.length].centre : P * 0.25;      // the lights leave the castell from one tower
  const Y0 = 1.5, TOPS = [0.6 * H, 0.8 * H, H - 0.35];
  const pathY = (i, s) => Y0 + (TOPS[i] - Y0) * s + 0.035 * Math.sin(TAU * s * 4 + i * 1.7) * Math.sin(Math.PI * s);

  // ------------------------------------------------------------------------------------------- uniforms (reused every frame)
  const uHand = new Float32Array(MAXH * 4), uRip = new Float32Array(MAXR * 4), uSeg = new Float32Array(MAXS * 4), uSegW = new Float32Array(MAXS);
  const uHead = new Float32Array(3 * 4), uThr = new Float32Array(3 * 4), uTow = new Float32Array(MAXT);
  const NT = Math.min(MAXT, walls.length);
  for (let i = 0; i < NT; i++) uTow[i] = walls[i].centre;

  const FS = HEAD + `
#define TAU 6.28318531
uniform vec2 uRoom; uniform float uTime, uPx, uAgit, uTowers, uStars, uWind, uGold, uCrown;
uniform int uNH, uNR, uNS, uNT;
uniform vec4 uHand[${MAXH}];   // x, y (m), presence s, stillness 0..1
uniform vec4 uRip[${MAXR}];    // x, y, age (s), amplitude
uniform vec4 uSeg[${MAXS}];    // x1, y1, x2 (unwrapped next to x1), y2
uniform float uSegW[${MAXS}];
uniform vec4 uHead[3];         // x, y, brightness, halo
uniform vec4 uThr[3];          // start x, y0, y1, how far the thread has come (0..1 of one turn)
uniform float uTow[${MAXT}];
in vec2 vUv; out vec4 o;

float wrapd(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), u.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), u.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), u.x), u.y), u.z);
}
const mat3 RM = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); p = RM * p * 2.03 + 7.1; a *= 0.5; } return s; }
// a point of the wall on the cylinder of the room (metres), turned by an angle
vec3 cyl(float x, float y, float turn){ float R = uRoom.x / TAU, a = x / R + turn; return vec3(R * cos(a), R * sin(a), y); }

// one layer of stars: cells of 'cell' metres, an integer number of them round the room (periodic), drifting by 'drift'
vec3 stars(vec2 p, float cell, float drift, float dens, float seed, float big, float gather){
  float N = floor(uRoom.x / cell + 0.5), cw = uRoom.x / N;
  vec2 g = vec2((p.x - drift) / cw, p.y / cw); vec2 c = floor(g), f = g - c;
  c.x = mod(c.x, N);
  vec3 r = h33(vec3(c, seed));
  float pres = step(r.x, dens);
  vec2 sp = 0.25 + 0.5 * h33(vec3(c, seed + 17.0)).xy;
  float d = length((f - sp) * cw);
  float mag = pow(r.y, 5.0);                                           // a few bright, many faint
  float tw = 0.72 + 0.28 * sin(uTime * (0.4 + 1.6 * r.z) + r.y * 40.0);
  float rad = uPx * (0.75 + 0.9 * mag + big);
  float b = (0.10 + 2.8 * mag) * tw * (1.0 + 2.2 * gather);
  float core = exp(-d * d / (rad * rad)) * smoothstep(0.25 * cw, 0.15 * cw, d);
  float halo = exp(-d / (uPx * (3.0 + 5.0 * mag))) * 0.06 * mag * smoothstep(0.24 * cw, 0.06 * cw, d);   // stays inside its cell: no square edges
  vec3 col = mix(vec3(0.70, 0.80, 1.0), vec3(1.0, 0.97, 0.93), r.z * r.z);
  return col * pres * b * (core + halo);
}

void main(){
  vec2 p = vUv * uRoom; float x = p.x, y = p.y, H = uRoom.y;
  float t = uTime;

  // ---------------------------------------------------------------- hands: stillness gathers, movement ripples
  float gather = 0.0, halo = 0.0, gold = 0.0;
  for (int i = 0; i < ${MAXH}; i++) {
    if (i >= uNH) break;
    vec4 h = uHand[i]; vec2 d = vec2(wrapd(x - h.x), y - h.y); float d2 = dot(d, d);
    float st = h.w * h.w * (3.0 - 2.0 * h.w);
    gather += h.z * st * exp(-d2 / 1.1);
    float r = 0.18 + 0.30 * st;                                         // the halo grows as the hand rests
    halo += h.z * (0.35 + 0.65 * st) * exp(-d2 / (r * r)) * (0.5 + 0.5 * st);
    gold += h.z * st * exp(-d2 / 0.0012);                               // a tiny gold heart when it is truly still
  }
  gather = gather / (1.0 + 0.5 * gather); halo = halo / (1.0 + 0.8 * halo);   // many hands: a calm sky, not a fog
  float rip = 0.0, stir = 0.0;
  for (int i = 0; i < ${MAXR}; i++) {
    if (i >= uNR) break;
    vec4 r = uRip[i]; vec2 d = vec2(wrapd(x - r.x), y - r.y); float dist = length(d);
    float rad = 0.12 + 0.75 * r.z, life = exp(-r.z * 1.3) * r.w;
    float ring = exp(-pow((dist - rad) / (0.018 + 0.03 * r.z), 2.0));
    rip += ring * life; stir += exp(-pow((dist - rad) / 0.35, 2.0)) * life;
  }

  // ---------------------------------------------------------------- the night sky
  float v = y / H;
  vec3 sky = mix(vec3(0.0014, 0.0034, 0.0120), vec3(0.0003, 0.0006, 0.0024), smoothstep(0.0, 1.0, v));
  vec3 q = cyl(x, y, 0.0);
  sky *= 0.8 + 0.4 * fbm(q * 0.22 + vec3(0.0, 0.0, 3.0), 3);
  // the milky band: one slow undulation round the room
  float a = TAU * x / uRoom.x;
  float bandY = H * (0.62 + 0.14 * sin(a + 0.8) + 0.05 * sin(2.0 * a + 2.1));
  float band = exp(-pow((y - bandY) / (0.55 + 0.15 * sin(a * 3.0)), 2.0));
  vec3 qd = cyl(x, y, uTime * 0.0012);
  float dust = fbm(qd * vec3(0.9, 0.9, 1.4) + 11.0, 5);
  float dustD = smoothstep(0.35, 0.85, dust) * band;
  sky += vec3(0.0065, 0.0075, 0.013) * dustD * uStars + vec3(0.0022, 0.0028, 0.0055) * band * uStars;
  float dark = smoothstep(0.55, 0.75, fbm(qd * 1.6 + 3.0, 3)) * band;  // dark lanes of the dust
  // the wind: veils drifting round the room, stirred by the ripples
  vec3 qw = cyl(x, y, uTime * 0.011 * uWind);
  float veil = fbm(vec3(qw.xy * 0.32, y * 1.35) + vec3(stir * 0.4, 0.0, uTime * 0.015), 4);
  veil = smoothstep(0.48, 0.82, veil + stir * 0.08) * (0.4 + 0.6 * smoothstep(0.3, 2.4, y));
  sky += vec3(0.0030, 0.0060, 0.0150) * veil * uWind;

  // stars in three depths: far (slow), middle, near (sparse, brighter, drifting faster)
  float sd = 0.55 + 1.0 * band;
  vec3 st = stars(p, 0.075, uTime * 0.0035, 0.22 * sd, 1.0, 0.0, gather * 0.6)
          + stars(p, 0.16,  uTime * 0.0080, 0.20 * sd, 2.0, 0.15, gather)
          + stars(p, 0.36,  uTime * 0.0170, 0.30, 3.0, 0.4, gather);
  st *= (1.0 - 0.75 * dark) * (1.0 - 0.6 * veil) * uStars * smoothstep(0.35, 1.2, y);
  vec3 c = sky + st;

  // ---------------------------------------------------------------- the castell below: banked embers
  float tow = 0.0;
  for (int i = 0; i < ${MAXT}; i++) {
    if (i >= uNT) break;
    float dx = abs(wrapd(x - uTow[i]));
    float k = floor(y / 0.27), fy = fract(y / 0.27);
    float hw = k < 7.0 ? 0.46 - 0.04 * k : 0.12 * smoothstep(2.05, 1.89, y);   // storeys narrowing, a small pom at the top
    float storey = smoothstep(0.0, 0.08, fy) * (k < 7.0 ? 1.0 : smoothstep(2.05, 1.95, y));
    float body = smoothstep(hw + 0.03, hw - 0.03, dx) * mix(0.55, 1.0, storey) * step(0.0, y) * step(y, 2.06);
    float pinya = smoothstep(0.02, -0.06, dx - 1.25 * (1.0 - y / 0.5)) * step(y, 0.5);
    tow = max(tow, max(body, pinya * 0.8));
  }
  vec2 ec = floor(vec2(x, y) / 0.028); ec.x = mod(ec.x, floor(uRoom.x / 0.028));
  vec3 er = h33(vec3(ec, 9.0));
  float speck = step(0.70, er.x) * (0.35 + 0.65 * er.y) * (0.65 + 0.35 * sin(uTime * (0.2 + 0.5 * er.z) + er.y * 30.0));
  float floorBand = exp(-y / 0.18) * 0.55;
  float emb = max(tow, floorBand);
  vec3 ember = vec3(0.010, 0.0016, 0.0005) * emb + vec3(0.075, 0.012, 0.003) * speck * emb * emb;
  c = mix(c, c * 0.25, tow * uTowers);                                // the towers hide the low stars
  c += ember * uTowers + vec3(0.006, 0.0012, 0.0004) * exp(-y / 0.6) * uTowers;   // a faint red breath over the ground

  // ---------------------------------------------------------------- the gold threads
  vec3 G = vec3(1.0, 0.70, 0.30);
  for (int i = 0; i < 3; i++) {
    vec4 th = uThr[i]; if (th.w <= 0.0) continue;
    float s = fract((x - th.x) / uRoom.x);
    float py = th.y + (th.z - th.y) * s + 0.035 * sin(TAU * s * 4.0 + float(i) * 1.7) * sin(3.14159265 * s);
    float d = abs(y - py);
    float on = smoothstep(th.w + 0.0015, th.w - 0.0015, s);
    float w = max(0.0035, uPx * 0.85);
    float shimmer = 0.68 + 0.22 * sin(s * uRoom.x * 2.3 - t * 0.9 + float(i)) + 0.10 * sin(s * uRoom.x * 7.1 + t * 0.5);
    vec2 sc = vec2(floor(s * uRoom.x / 0.06), float(i)); vec3 sr = h33(vec3(sc, 5.0));
    float spark = step(0.86, sr.x) * pow(0.5 + 0.5 * sin(t * (0.6 + sr.y) + sr.z * 30.0), 6.0);
    float fresh = 1.0 + 1.6 * exp(-(th.w - s) * uRoom.x / 1.6);
    float line = exp(-d * d / (w * w)) * (1.1 + 1.4 * spark) * shimmer * fresh + exp(-d / 0.05) * 0.045 * fresh;
    c += G * line * on * uGold;
  }

  // ---------------------------------------------------------------- the climbing lights
  for (int i = 0; i < 3; i++) {
    vec4 hd = uHead[i]; if (hd.z <= 0.0) continue;
    vec2 d = vec2(wrapd(x - hd.x), y - hd.y); float d2 = dot(d, d);
    float core = exp(-d2 / (0.0007 + uPx * uPx));
    float glow = exp(-d2 / (0.03 * hd.w)) * 0.45 + exp(-sqrt(d2) / (0.35 * hd.w)) * 0.06;
    float spikes = (exp(-abs(d.y) / 0.003) * exp(-abs(d.x) / (0.16 * hd.w)) + exp(-abs(d.x) / 0.003) * exp(-abs(d.y) / (0.06 * hd.w))) * 0.25;
    c += mix(G, vec3(1.0, 0.88, 0.66), core) * hd.z * (core * 6.0 + glow + spikes) * uGold;
  }
  // the crown: the top of the room warms a little when the last light rests
  c += G * vec3(0.012, 0.008, 0.004) * uCrown * exp(-pow((y - (H - 0.35)) / 0.6, 2.0)) * exp(-pow(wrapd(x - uHead[2].x) / 4.0, 2.0)) * uGold;

  // ---------------------------------------------------------------- hands on top: halo, ripple, constellation lines
  c += vec3(0.30, 0.40, 0.62) * halo * 0.14 + vec3(0.55, 0.65, 0.85) * rip * 0.10 + G * gold * 1.6;
  float lines = 0.0;
  for (int i = 0; i < ${MAXS}; i++) {
    if (i >= uNS) break;
    vec4 sg = uSeg[i]; vec2 a = sg.xy, b = sg.zw;
    vec2 pp = vec2(sg.x + wrapd(x - sg.x), y);
    vec2 ab = b - a; float h = clamp(dot(pp - a, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(pp - a - ab * h);
    float w = max(0.0025, uPx * 0.7);
    lines += uSegW[i] * (exp(-d * d / (w * w)) * 0.9 + exp(-d / 0.03) * 0.05) * (0.75 + 0.25 * sin(h * 30.0 - t * 0.8));
  }
  c += vec3(0.78, 0.84, 1.0) * lines;
  o = vec4(c, 1.0);
}`;
  const prog = program(VS, FS);

  // ------------------------------------------------------------------------------------------- state
  const hs = new Map();               // stroke -> { still, emit, seen }
  const rip = [];                     // pool of ripples (allocated once)
  for (let i = 0; i < MAXR; i++) rip.push({ x: 0, y: 0, age: 99, amp: 0 });
  let frame = 0, nH = 0, nR = 0, nS = 0, agit = 0, pd = -1, time = 0, crown = 0;
  const S = { towers: 0.75, stars: 1, wind: 1, gold: 1, calm: 'auto' };
  function setParams(p) {
    if (p.towers != null) S.towers = +p.towers; if (p.stars != null) S.stars = +p.stars; if (p.wind != null) S.wind = +p.wind;
    if (p.gold != null) S.gold = +p.gold; if (p.calm != null) S.calm = String(p.calm);
  }
  setParams(env.params);
  const addRipple = (x, y, amp) => {
    let best = rip[0];
    for (const r of rip) if (r.age > best.age) best = r;
    best.x = x; best.y = y; best.age = 0; best.amp = amp;
  };

  function step(dt, input) {
    dt = Math.min(dt, 0.1); time = input.time; frame++;
    const forceStill = S.calm === 'still', forceRest = S.calm === 'restless';
    // hands: stillness grows over ~2 s and collapses in ~0.25 s when the hand moves
    let move = 0; nH = 0;
    for (const h of input.hands) {
      let st = hs.get(h.stroke);
      if (!st) { st = { still: 0, emit: 0, seen: 0 }; hs.set(h.stroke, st); }
      st.seen = frame;
      const sp = Math.hypot(h.vx, h.vy);
      const moving = forceRest || (!forceStill && h.on && sp > 0.3);
      if (moving) {
        st.still = Math.max(0, st.still - dt * 4);
        const amt = forceRest ? 0.6 : clamp((sp - 0.3) / 0.5, 0.2, 1);
        move += h.s * amt;
        st.emit -= dt; if (st.emit <= 0) { addRipple(h.x, h.y, 0.4 + 0.6 * amt); st.emit = 0.6; }
      } else { st.still = Math.min(1, st.still + dt / 2.0); st.emit = Math.min(st.emit, 0.1); }
      if (nH < MAXH) { const k = nH * 4; uHand[k] = h.x; uHand[k + 1] = h.y; uHand[k + 2] = h.s; uHand[k + 3] = st.still; nH++; }
    }
    for (const h of input.downs) addRipple(h.x, h.y, 0.25);           // a soft answer the instant a hand lands
    for (const [k, st] of hs) if (st.seen !== frame) hs.delete(k);
    // constellation lines between still hands closer than 2 m
    nS = 0;
    for (let i = 0; i < nH && nS < MAXS; i++) {
      const si = uHand[i * 4 + 3] * uHand[i * 4 + 2]; if (si < 0.25) continue;
      for (let j = i + 1; j < nH && nS < MAXS; j++) {
        const sj = uHand[j * 4 + 3] * uHand[j * 4 + 2]; if (sj < 0.25) continue;
        const dx = roundM(uHand[j * 4] - uHand[i * 4]), dy = uHand[j * 4 + 1] - uHand[i * 4 + 1], d = Math.hypot(dx, dy);
        if (d >= 2) continue;
        const k = nS * 4; uSeg[k] = uHand[i * 4]; uSeg[k + 1] = uHand[i * 4 + 1]; uSeg[k + 2] = uHand[i * 4] + dx; uSeg[k + 3] = uHand[j * 4 + 1];
        const f = (Math.min(si, sj) - 0.25) / 0.75;
        uSegW[nS] = f * f * (1 - Math.pow(d / 2, 3)) * 0.5; nS++;
      }
    }
    // ripples age
    nR = 0;
    for (const r of rip) { r.age += dt; if (r.age < 4) { const k = nR * 4; uRip[k] = r.x; uRip[k + 1] = r.y; uRip[k + 2] = r.age; uRip[k + 3] = r.amp; nR++; } }
    // agitation: up fast, settles slowly
    const target = forceStill ? 0 : clamp(move, 0, 1);
    agit += (target - agit) * (1 - Math.exp(-dt * (target > agit ? 8 : 1.1)));
    // progress: the shown climb follows input.progress, slows while the air is disturbed and slips back a little
    const p = input.progress;
    if (pd < 0) pd = p;
    else { pd += (p - pd) * (1 - Math.exp(-dt * 0.9 * (1 - 0.92 * agit))); pd = Math.max(0, pd - agit * 0.006 * dt); }
    crown += ((pd > 0.985 ? 1 : 0) - crown) * (1 - Math.exp(-dt * 0.5));
    const flick = 1 - agit * 0.6 * (0.5 + 0.5 * Math.sin(time * 21 + 3 * Math.sin(time * 6.3))) * (0.6 + 0.4 * Math.sin(time * 4.1));
    const tremble = agit * 0.012 * Math.sin(time * 17.0);
    for (let i = 0; i < 3; i++) {
      const loc = clamp(pd * 3 - i, 0, 1), s = easeIO(loc), k = i * 4;
      const appear = clamp((pd * 3 - i + 0.12) / 0.12, 0, 1);          // fades in just before its turn (the first is there at 0)
      const active = pd * 3 >= i - 0.12 && (pd * 3 < i + 1 || i === 2);
      uThr[k] = START; uThr[k + 1] = Y0; uThr[k + 2] = TOPS[i]; uThr[k + 3] = s > 0 ? s : 0;
      const breath = 0.85 + 0.15 * Math.sin(time * 1.3 + i * 2);
      let b = appear * breath, hal = 1;
      if (!active) { b *= 0.32; hal = 0.6; }                             // a light that has arrived rests, quieter
      else { b *= flick; }
      if (i === 2) { b *= 1 + 0.5 * crown; hal = 1 + 0.5 * crown; }
      uHead[k] = START + s * P; uHead[k + 1] = pathY(i, s) + (active ? tremble : 0); uHead[k + 2] = b; uHead[k + 3] = hal;
    }
  }

  function draw(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h);
    const u = prog.u; gl.useProgram(prog.p);
    gl.uniform2f(u.uRoom, P, H); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uPx, H / target.h); gl.uniform1f(u.uAgit, agit);
    gl.uniform1f(u.uTowers, S.towers); gl.uniform1f(u.uStars, S.stars); gl.uniform1f(u.uWind, S.wind); gl.uniform1f(u.uGold, S.gold); gl.uniform1f(u.uCrown, crown);
    gl.uniform1i(u.uNH, nH); gl.uniform1i(u.uNR, nR); gl.uniform1i(u.uNS, nS); gl.uniform1i(u.uNT, NT);
    gl.uniform4fv(u.uHand, uHand); gl.uniform4fv(u.uRip, uRip); gl.uniform4fv(u.uSeg, uSeg); gl.uniform1fv(u.uSegW, uSegW);
    gl.uniform4fv(u.uHead, uHead); gl.uniform4fv(u.uThr, uThr); gl.uniform1fv(u.uTow, uTow);
    quad();
  }
  return { step, draw, setParams };
}
