// Ressonància — scene "intro": La plaça. A 70-second pre-designed opening, timed by a clock kept here (see host.js for the contract).
//
//   0–8    black, then dust: tens of thousands of motes in three depth layers, lit by one distant lamp (the far side of the room)
//   8–22   the horizon: a thin warm line at hand height, lit at the centre of the first wall, drawn both ways round the room until
//          the two ends meet on the far side (distances wrap: it crosses the seam with no cut); the dust near it catches the light
//   22–46  the tower of light: on every wall a human tower SUGGESTED by points — a wide pinya, then tiers of fewer and fewer people
//          climbing from the line, tier by tier, towards 3.2 m; they breathe. The walls are staggered by a few seconds
//   46–53  it dissolves upward into the dust before it is complete (the top goes first); the line dims
//   53–63  the motto, one word per wall in turn: STRENGTH / Força · BALANCE / Equilibri · COURAGE / Valor · GOOD SENSE / Seny
//   63–70  the title, RESSONÀNCIA on every wall, then "Put your hands on the wall". It holds.
//   (study loop only: 75–79.5 everything fades to black, and at 80 it begins again)
// A hand cannot change the sequence; it stirs the dust round it at once (motes pushed away, a faint warm glow).
// Metres everywhere; x wraps round the room; no allocation per frame; points are drawn as sub-pixel Gaussians (no crawling pixels).
export const DURATION = 70;
const LOOP = 80, MAXH = 16, MAXW = 8, N_DUST = 40000, NEAR = 0.08;
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const MOTTO = [['STRENGTH', 'Força'], ['BALANCE', 'Equilibri'], ['COURAGE', 'Valor'], ['GOOD SENSE', 'Seny']];
const TITLE = 'RESSONÀNCIA', SUB = 'Put your hands on the wall';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { const u = Math.max(1e-6, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };

export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls } = env;
  const P = env.params;
  const NW = Math.min(MAXW, Math.max(1, walls.length));
  const PER = room.perimeter, H = room.height;
  const X0 = walls[0]?.centre ?? 0;                      // where the horizon is lit
  const LAMP = X0 + PER / 2;                             // the distant lamp: where the two ends of the line meet

  // ------------------------------------------------------------------------------------------ shaders
  const ROUND = `float rm(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }`;
  const FS_PT = HEAD + `in vec2 vC; in float vS; in vec3 vCol; out vec4 o;
void main(){ vec2 d = gl_FragCoord.xy - vC; o = vec4(vCol * exp(-dot(d, d) / (2.0 * vS * vS)), 1.0); }`;

  const dustP = program(HEAD + `
in vec4 aA; in vec4 aB;                   // x0, y0 (m), depth 0..1, seed | four randoms
uniform vec2 uRoom, uSize; uniform float uT, uPxS, uShift, uLvl, uLampX, uX0, uFront, uLineY, uLine, uHead, uStir;
uniform int uN; uniform vec4 uHand[${MAXH}];
out vec2 vC; out float vS; out vec3 vCol;
${ROUND}
void main(){
  float z = aA.z, sd = aA.w, par = mix(0.35, 1.7, z);
  float x = aA.x + uT * (0.011 * par + (aB.x - 0.5) * 0.012) + sin(uT * (0.05 + 0.12 * aB.y) + sd * 6.2832) * 0.05 * par;
  float y = aA.y + uT * ((aB.z - 0.5) * 0.010 - 0.0016) + sin(uT * (0.04 + 0.10 * aB.w) + sd * 17.0) * 0.035 * par;
  x = mod(x, uRoom.x); y = mod(y + 0.25, uRoom.y + 0.5) - 0.25;
  float edge = smoothstep(-0.25, 0.0, y) * smoothstep(uRoom.y + 0.25, uRoom.y, y);
  vec2 p = vec2(x, y); float stir = 0.0;
  for (int i = 0; i < ${MAXH}; i++) {                 // a hand pushes the motes away and turns them a little round it
    if (i >= uN) break;
    vec4 h = uHand[i]; vec2 d = p - h.xy; d.x = rm(d.x);
    float r2 = dot(d, d), k = h.z * exp(-r2 / (2.0 * 0.26 * 0.26));
    if (k < 1e-3) continue;
    vec2 n = d * inversesqrt(r2 + 1e-5);
    p += (n * 0.19 + vec2(-n.y, n.x) * 0.06 * sin(uT * 0.7 + sd * 9.0)) * k * uStir * mix(0.6, 1.3, z);
    stir += k;
  }
  p.x = mod(p.x, uRoom.x);
  // the lamp: far away, one side of the room a little brighter, the upper air a little more
  float lamp = (0.5 + 0.5 * pow(0.5 + 0.5 * cos(6.2832 * rm(p.x - uLampX) / uRoom.x), 1.6)) * (0.75 + 0.35 * p.y / uRoom.y);
  float tw = 0.55 + 0.45 * sin(uT * (0.4 + aB.y * 1.1) + sd * 31.0);
  float glint = aB.w > 0.85 ? pow(max(0.0, sin(uT * (0.22 + aB.x * 0.5) + sd * 53.0)), 24.0) * 3.5 : 0.0;
  float layer = z < 0.35 ? 0.5 : (z < 0.75 ? 0.85 : 1.3);
  float E = (0.3 + 0.7 * aB.x) * layer * (tw + glint) * lamp;
  // the horizon lights the air round it
  float dx = abs(rm(p.x - uX0)), dy = p.y - uLineY, hd = dx - min(uFront, uRoom.x * 0.5);
  float vis = 1.0 - smoothstep(uFront - 0.3, uFront + 0.05, dx);
  float warm = uLine * vis * (exp(-dy * dy / (2.0 * 0.13 * 0.13)) * 3.5 + exp(-dy * dy / (2.0 * 0.5 * 0.5)) * 0.6)
             + uHead * exp(-(hd * hd + dy * dy) / (2.0 * 0.35 * 0.35)) * 9.0 + stir * 1.6;
  E *= (1.0 + warm) * edge * uLvl;
  vec3 col = mix(vec3(0.66, 0.75, 0.95), vec3(1.0, 0.68, 0.38), clamp(warm / (1.0 + warm), 0.0, 1.0));
  float sig = max(0.6, mix(0.55, 2.9, z * z * z) * uPxS);
  if (uShift > 0.5) p.x += p.x < uRoom.x * 0.5 ? uRoom.x : -uRoom.x;   // the seam copy of the near layer
  vec2 ndc = vec2(p.x / uRoom.x, p.y / uRoom.y) * 2.0 - 1.0;
  vC = (ndc * 0.5 + 0.5) * uSize; vS = sig;
  vCol = col * E * 0.13 / (6.2832 * sig * sig);
  gl_Position = E > 1e-4 ? vec4(ndc, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = ceil(sig * 6.0) + 1.0;
}`, FS_PT);

  const towerP = program(HEAD + `
in vec4 aA; in vec4 aB; in vec4 aC; in vec2 aD;  // xoff, y (m), tier, wall | randoms | start, rise (s), phase, energy | sigma (px), -
uniform vec2 uRoom, uSize; uniform float uT, uPxS, uLineY, uDis, uLvl; uniform float uCx[${MAXW}], uW0[${MAXW}];
out vec2 vC; out float vS; out vec3 vCol;
void main(){
  int w = int(aA.w + 0.5);
  float cx = uCx[w], u = clamp((uT - uW0[w] - aC.x) / aC.y, 0.0, 1.0);
  float e = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
  float x = mix(cx + aA.x * 0.5 + (aB.x - 0.5) * 0.3, cx + aA.x, smoothstep(0.0, 0.75, u));
  float y = mix(uLineY, aA.y, e);
  float br = sin(uT * 6.2832 / (3.6 + aB.y * 1.8) + aC.z);           // every person breathes on their own
  x += 0.004 * sin(uT * 0.8 + aB.z * 20.0); y += 0.007 * br * e;
  float E = aC.w * smoothstep(0.0, 0.3, u) * (0.78 + 0.22 * br) * (0.9 + 0.1 * sin(uT * 4.3 + aB.w * 40.0));
  // the dissolve: upward, the top first, into dust
  float v = clamp((uT - (uDis + (3.25 - aA.y) * 0.9 + aB.y * 1.4)) / 4.2, 0.0, 1.0);
  y += v * v * (0.45 + aB.z * 0.9);
  x += sin(v * 2.5 + aB.w * 6.2832) * 0.10 * v;
  E *= (1.0 + 0.45 * sin(3.1416 * min(v * 2.0, 1.0))) * (1.0 - smoothstep(0.1, 1.0, v)) * uLvl;
  float sig = max(0.6, aD.x * uPxS * mix(1.0, 0.6, v));
  vec3 col = mix(mix(vec3(1.0, 0.66, 0.38), vec3(1.0, 0.86, 0.68), clamp((aA.y - 1.3) / 1.8, 0.0, 1.0)), vec3(0.75, 0.78, 0.9), v * 0.7);
  vec2 ndc = vec2(x / uRoom.x, y / uRoom.y) * 2.0 - 1.0;
  vC = (ndc * 0.5 + 0.5) * uSize; vS = sig;
  vCol = col * E * 0.16 / (6.2832 * sig * sig);
  gl_Position = E > 1e-4 ? vec4(ndc, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = ceil(sig * 6.0) + 1.0;
}`, FS_PT);

  const bgP = program(VS, HEAD + `
uniform vec2 uRoom; uniform float uPxPerM, uT, uX0, uFront, uLineY, uLine, uHead, uHaze, uLampX;
uniform int uN; uniform vec4 uHand[${MAXH}];
uniform sampler2D uText; uniform vec3 uPlate;        // plate width, row height (m), rows
uniform vec4 uTY; uniform int uNW; uniform float uCx[${MAXW}]; uniform vec4 uTA[${MAXW}];   // heights / per wall alphas: word, catalan, title, line
in vec2 vUv; out vec4 o;
${ROUND}
float plate(float row, float dx, float dy, float a){
  if (a < 0.002) return 0.0;
  vec2 q = vec2(dx / uPlate.x + 0.5, 0.5 - dy / uPlate.y);
  if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0) return 0.0;
  return textureLod(uText, vec2(q.x, (row + q.y) / uPlate.z), (1.0 - a) * 3.0).a * a;   // it comes into focus as it appears
}
void main(){
  vec2 p = vUv * uRoom; vec3 c = vec3(0.0);
  // the horizon
  float dy = p.y - uLineY, dx = abs(rm(p.x - uX0));
  if (uLine > 0.0005) {
    float sc = max(0.0022, 0.55 / uPxPerM);
    float vis = 1.0 - smoothstep(uFront - 0.28, uFront + 0.03, dx);
    float along = 0.86 + 0.14 * sin(6.2832 * 7.0 * p.x / uRoom.x + uT * 0.35) * sin(6.2832 * 3.0 * p.x / uRoom.x - uT * 0.21);
    float L = 2.6 * (0.0022 / sc) * exp(-dy * dy / (2.0 * sc * sc)) + 0.07 * exp(-dy * dy / (2.0 * 0.016 * 0.016)) + 0.008 * exp(-dy * dy / (2.0 * 0.25 * 0.25));
    c += vec3(1.0, 0.64, 0.34) * L * vis * along * uLine;
  }
  if (uHead > 0.0005) {                                  // the drawing points, and where they meet
    float hd = dx - min(uFront, uRoom.x * 0.5), r2 = hd * hd + dy * dy;
    c += vec3(1.0, 0.80, 0.56) * uHead * (2.5 * exp(-r2 / (2.0 * 0.010 * 0.010)) + 0.18 * exp(-r2 / (2.0 * 0.07 * 0.07)) + 0.02 * exp(-r2 / (2.0 * 0.45 * 0.45)));
  }
  // the air of the far lamp: barely there
  c += vec3(0.55, 0.6, 0.75) * uHaze * (0.5 + 0.5 * cos(6.2832 * rm(p.x - uLampX) / uRoom.x)) * (0.3 + 0.7 * p.y / uRoom.y);
  // a hand: a faint warm glow
  for (int i = 0; i < ${MAXH}; i++) {
    if (i >= uN) break;
    vec2 d = p - uHand[i].xy; d.x = rm(d.x);
    c += vec3(1.0, 0.70, 0.42) * uHand[i].z * 0.03 * exp(-dot(d, d) / (2.0 * 0.2 * 0.2));
  }
  // the words
  float t = 0.0;
  for (int i = 0; i < ${MAXW}; i++) {
    if (i >= uNW) break;
    vec4 a = uTA[i];
    if (a.x + a.y + a.z + a.w < 0.002) continue;
    float tx = rm(p.x - uCx[i]);
    if (abs(tx) > uPlate.x * 0.5) continue;
    float m = float(i % 4);
    t += plate(m, tx, p.y - uTY.x, a.x) + 0.82 * plate(4.0 + m, tx, p.y - uTY.y, a.y) + plate(8.0, tx, p.y - uTY.z, a.z) + 0.78 * plate(9.0, tx, p.y - uTY.w, a.w);
  }
  c += vec3(1.0, 0.87, 0.72) * 0.9 * t;
  o = vec4(c, 1.0);
}`);

  // ------------------------------------------------------------------------------------------ dust (static attributes)
  const dust = new Float32Array(N_DUST * 8), nNear = Math.round(N_DUST * NEAR);
  {
    const r = rng(7);
    for (let i = 0; i < N_DUST; i++) {
      const near = i >= N_DUST - nNear, z = near ? 0.75 + 0.25 * r() : r() < 0.62 ? 0.35 * r() : 0.35 + 0.4 * r();
      dust.set([r() * PER, -0.25 + r() * (H + 0.5), z, r(), r(), r(), r(), r()], i * 8);
    }
  }
  const mkVao = (data, layout) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = layout.reduce((a, l) => a + l[1], 0) * 4; let off = 0;
    for (const [loc, n] of layout) { if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); } off += n * 4; }
    gl.bindVertexArray(null);
    return { vao, buf };
  };
  const dustV = mkVao(dust, [[gl.getAttribLocation(dustP.p, 'aA'), 4], [gl.getAttribLocation(dustP.p, 'aB'), 4]]);

  // ------------------------------------------------------------------------------------------ the towers (static attributes)
  // A person is a small cloud of points, denser at the shoulders: never a figure. Pinya rows rise first, then the tiers of the
  // trunk — fewer people, smaller, each tier later — climbing from the line through the ones below.
  const tw = [];
  for (let w = 0; w < NW; w++) {
    const r = rng(101 + w * 31);
    const person = (xo, y, tier, start, rise, sc, energy) => {
      const ph = r() * 6.2832, jit = r() * 0.7, n = tier === 0 ? 13 : 11;
      // the body's warmth: one wide, faint point under the cloud
      tw.push(xo, y + 0.02 * sc, tier, w, r(), r(), r(), r(), start + jit, rise, ph, energy * (tier === 0 ? 2.2 : 2.6), (tier === 0 ? 7.5 : 6.0) * sc, 0);
      for (let k = 0; k < n; k++) {
        const crown = k === 0, dx = crown ? gauss(r) * 0.008 : gauss(r) * 0.034 * sc, dy = crown ? 0.105 * sc : Math.abs(gauss(r)) * -0.09 * sc + 0.055 * sc;
        tw.push(xo + dx, y + dy, tier, w, r(), r(), r(), r(), start + jit + r() * 0.25, rise, ph, energy * (crown ? 1.7 : 0.6 + 0.6 * r()), crown ? 1.25 : 0.75 + 0.45 * r(), 0);
      }
    };
    [[1.36, 17, 1.5], [1.50, 14, 1.25], [1.63, 11, 1.0]].forEach(([y, n, hw], row) => {
      for (let k = 0; k < n; k++) person(-hw + (2 * hw * (k + 0.5)) / n + (r() - 0.5) * 0.08, y + (r() - 0.5) * 0.03, 0, row * 0.9, 4.6, 1, 9.0);
    });
    for (let k = 0; k < 260; k++) {                      // the crowd round the pinya, scattered and faint
      const xo = gauss(r) * 0.9, y = 1.28 + Math.abs(gauss(r)) * 0.2;
      tw.push(xo, y, 0, w, r(), r(), r(), r(), r() * 2.5, 4.6, r() * 6.2832, 1.6 + 1.2 * r(), 0.7 + 0.5 * r(), 0);
    }
    [[1.86, 3], [2.07, 3], [2.27, 3], [2.47, 3], [2.67, 2], [2.88, 1], [3.10, 1]].forEach(([y, n], k) => {   // a tres: a column of three, the dosos, the acotxador, the enxaneta
      const sc = 1 - k * 0.05;
      for (let j = 0; j < n; j++) person((j - (n - 1) / 2) * 0.24 * sc + (k > 4 ? (k === 5 ? 0.03 : -0.02) : 0), y, k + 1, 2.0 + k * 2.7, 4.0 + k * 0.55, sc, 10 + k * 1.0 + (k === 6 ? 6 : 0));
    });
  }
  const tower = new Float32Array(tw), nTower = tower.length / 14;
  const L = (n) => gl.getAttribLocation(towerP.p, n);
  const towerV = mkVao(tower, [[L('aA'), 4], [L('aB'), 4], [L('aC'), 4], [L('aD'), 2]]);

  // ------------------------------------------------------------------------------------------ the words (one atlas, drawn once)
  const PLATE_W = 6.0, ROW_H = 0.38, ROWS = 10;
  const cpx = Math.min(2 * env.pxPerM, 4096 / PLATE_W);   // px per metre in the atlas: 2x the render, mipmapped (sharp, no shimmer)
  const atlas = document.createElement('canvas'); atlas.width = Math.round(PLATE_W * cpx); atlas.height = Math.round(ROW_H * cpx) * ROWS;
  const textTex = gl.createTexture();
  function drawAtlas() {
    const g = atlas.getContext('2d'), rh = atlas.height / ROWS;
    g.clearRect(0, 0, atlas.width, atlas.height); g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    const line = (row, str, capM, weight, track) => {
      g.font = `${weight} 100px ${FONT}`;
      const capR = (g.measureText('H').actualBoundingBoxAscent || 72) / 100, size = (capM * cpx) / capR;
      g.font = `${weight} ${size}px ${FONT}`;
      let w = 0; for (const ch of str) w += g.measureText(ch).width + track * size; w -= track * size;
      let x = (atlas.width - w) / 2; const y = (row + 0.5) * rh + (capM * cpx) / 2;
      for (const ch of str) { g.fillText(ch, x, y); x += g.measureText(ch).width + track * size; }
    };
    MOTTO.forEach(([en, ca], i) => { line(i, en, 0.22, 300, 0.34); line(4 + i, ca, 0.072, 300, 0.14); });
    line(8, TITLE, 0.22, 300, 0.52);
    line(9, SUB, 0.062, 400, 0.16);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  drawAtlas();
  document.fonts?.ready?.then(() => drawAtlas()).catch(() => {});   // the house font, if it arrives late

  // ------------------------------------------------------------------------------------------ state
  const hands = new Float32Array(MAXH * 4), TA = new Float32Array(MAXW * 4), CX = new Float32Array(MAXW), W0 = new Float32Array(MAXW);
  for (let i = 0; i < NW; i++) { CX[i] = walls[i].centre; W0[i] = 22.5 + i * 2.4; }
  let t = Math.min(DURATION, Math.max(0, Number(P.start) || 0)), lastStart = P.start, nH = 0;
  const S = { dust: 0, line: 0, head: 0, front: 0, tower: 0, haze: 0 };

  function timeline() {
    const end = t > DURATION ? 1 - ss(75, 79.5, t) : 1;
    S.dust = ss(1.0, 8.0, t) * end * Number(P.dust ?? 1);
    S.front = (PER / 2 + 0.4) * smoother((t - 8.6) / 13.4);   // a little past half way: the ends overlap, no gap where they meet
    S.line = ss(8.0, 9.2, t) * (1 - 0.2 * ss(24, 34, t)) * (1 - 0.78 * ss(46, 53, t)) * end;
    S.head = ss(8.0, 9.0, t) * (1 - ss(22.2, 25.5, t)) * end;
    S.haze = 0.0008 * S.dust;
    S.tower = t > 21 && t < 54 ? 1 : 0;
    TA.fill(0);
    for (let i = 0; i < NW; i++) {
      const m = i % 4, t0 = 53 + m * 2.0, out = 1 - ss(t0 + 3.4, t0 + 5.0, t);
      TA[i * 4] = ss(t0, t0 + 1.5, t) * out;
      TA[i * 4 + 1] = ss(t0 + 0.6, t0 + 2.0, t) * out;
      TA[i * 4 + 2] = ss(63.8, 66.4, t) * end;
      TA[i * 4 + 3] = ss(66.2, 68.0, t) * end;
    }
  }

  return {
    get time() { return t; },
    step(dt, input) {
      if (P.start !== lastStart) { lastStart = P.start; t = Math.min(DURATION, Math.max(0, Number(P.start) || 0)); }
      if (input.progress > 0) t = input.progress * DURATION;
      else { t += dt; if (t >= LOOP) t -= LOOP; }
      nH = 0;
      for (const h of input.hands) { if (nH >= MAXH) break; hands[nH * 4] = h.x; hands[nH * 4 + 1] = h.y; hands[nH * 4 + 2] = h.s; hands[nH * 4 + 3] = 0; nH++; }
      timeline();
    },
    draw(target) {
      const lineY = Number(P.lineHeight) || 1.25, textY = Number(P.textHeight) || 2.0, stir = P.handStir ?? 1;
      const pxS = (target.h / H) / 243;                  // point sizes are tuned at the room's ~243 px/m
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h);
      gl.disable(gl.BLEND);
      // the line, the air, the hands' glow, the words
      gl.useProgram(bgP.p); let u = bgP.u;
      gl.uniform2f(u.uRoom, PER, H); gl.uniform1f(u.uPxPerM, target.h / H); gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uX0, X0); gl.uniform1f(u.uFront, S.front); gl.uniform1f(u.uLineY, lineY); gl.uniform1f(u.uLine, S.line); gl.uniform1f(u.uHead, S.head);
      gl.uniform1f(u.uHaze, S.haze); gl.uniform1f(u.uLampX, LAMP);
      gl.uniform1i(u.uN, nH); gl.uniform4fv(u.uHand, hands);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textTex); gl.uniform1i(u.uText, 0);
      gl.uniform3f(u.uPlate, PLATE_W, ROW_H, ROWS); gl.uniform4f(u.uTY, textY + 0.08, textY - 0.19, textY + 0.08, textY - 0.21);
      gl.uniform1i(u.uNW, NW); gl.uniform1fv(u.uCx, CX); gl.uniform4fv(u.uTA, TA);
      quad();
      // the points, added
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
      if (S.dust > 0.0005) {
        gl.useProgram(dustP.p); u = dustP.u;
        gl.uniform2f(u.uRoom, PER, H); gl.uniform2f(u.uSize, target.w, target.h); gl.uniform1f(u.uT, t); gl.uniform1f(u.uPxS, pxS);
        gl.uniform1f(u.uLvl, S.dust); gl.uniform1f(u.uLampX, LAMP); gl.uniform1f(u.uX0, X0); gl.uniform1f(u.uFront, S.front);
        gl.uniform1f(u.uLineY, lineY); gl.uniform1f(u.uLine, S.line); gl.uniform1f(u.uHead, S.head); gl.uniform1f(u.uStir, stir);
        gl.uniform1i(u.uN, nH); gl.uniform4fv(u.uHand, hands);
        gl.bindVertexArray(dustV.vao);
        gl.uniform1f(u.uShift, 0); gl.drawArrays(gl.POINTS, 0, N_DUST);
        gl.uniform1f(u.uShift, 1); gl.drawArrays(gl.POINTS, N_DUST - nNear, nNear);   // soft near motes: their other half across the seam
      }
      if (S.tower) {
        gl.useProgram(towerP.p); u = towerP.u;
        gl.uniform2f(u.uRoom, PER, H); gl.uniform2f(u.uSize, target.w, target.h); gl.uniform1f(u.uT, t); gl.uniform1f(u.uPxS, pxS);
        gl.uniform1f(u.uLineY, lineY); gl.uniform1f(u.uDis, 46); gl.uniform1f(u.uLvl, 1);
        gl.uniform1fv(u.uCx, CX); gl.uniform1fv(u.uW0, W0);
        gl.bindVertexArray(towerV.vao); gl.drawArrays(gl.POINTS, 0, nTower);
      }
      gl.bindVertexArray(null); gl.disable(gl.BLEND);
    },
    setParams() { /* read live from env.params; "start" restarts the clock in step */ },
    dispose() { gl.deleteProgram(dustP.p); gl.deleteProgram(towerP.p); gl.deleteProgram(bgP.p); gl.deleteBuffer(dustV.buf); gl.deleteBuffer(towerV.buf); gl.deleteVertexArray(dustV.vao); gl.deleteVertexArray(towerV.vao); gl.deleteTexture(textTex); },
  };
}
