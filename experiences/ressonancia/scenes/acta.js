// Ressonància — scene "acta": the closing, l'acta. A 40-second pre-designed sequence (see host.js for the contract, GUION.md › Cierre).
// Black and typography, a little of the intro's dust and its horizon: the work ends where it began.
//
//   0–4     whatever was there is gone: black; the dust comes back, and the thin horizon at 1.25 m, dim
//   4–14    the group's castell as the colles write it, on every wall: "3 de 7" (0.30 m cap), under it the outcome in Catalan,
//           letter-spaced (DESCARREGAT / CARREGAT / INTENT), and a small English gloss under that (it leaves at ~12)
//   12–26   the four values, one per wall (Força, Equilibri, Valor, Seny, with Strength / Balance / Courage / Good sense small):
//           a thin gold track draws itself, then deep red fills it to the value over 2.5 s; walls 2 s apart. Then, under the
//           castell, a small line: "14 hands · 22 s of silence"
//   24–33   the castell and the bars dim away; one sentence on every wall, large and calm:
//           "When bodies resonate together, / culture is born."
//   33–40   credits, small and wide: RESSONÀNCIA · Barcelona XR Lab × Alma Digital Studio · With the support of the Generalitat
//           de Catalunya. Everything fades to the dim line alone by 40.
//   (study loop only: 44–47.5 the line and the dust fade to black; at 48 it begins again)
// A hand changes nothing: it stirs the dust round it and glows faintly, as in the intro.
// Time: in the piece, input.state.t while input.state.block === 'acta' (and the content from input.acta, see score.js › acta());
// in a study, a clock kept here (the "progress" and "start" parameters) and the content from parameters.
// Metres everywhere; x wraps round the room; no allocation per frame (text is set only when the content changes).
import { createTextLayer } from './text.js';

export const DURATION = 40;
const LOOP = 48, MAXH = 16, MAXW = 8, N_DUST = 22000, NEAR = 0.08;
const VALUES = [['forca', 'Força', 'STRENGTH'], ['equilibri', 'Equilibri', 'BALANCE'], ['valor', 'Valor', 'COURAGE'], ['seny', 'Seny', 'GOOD SENSE']];
const OUTCOME = {
  descarregat: ['DESCARREGAT', 'raised, crowned and brought down'],
  carregat: ['CARREGAT', 'crowned, and then it fell'],
  intent: ['INTENT', 'it fell before the crown'],
};
const SENTENCE = ['When bodies resonate together,', 'culture is born.'];
const CREDITS = ['RESSONÀNCIA', 'Barcelona XR Lab × Alma Digital Studio', 'With the support of the Generalitat de Catalunya'];
// heights (m from the floor; the horizon is at 1.25)
const Y = { castell: 2.47, outcome: 2.12, gloss: 1.965, label: 1.72, bar: 1.56, en: 1.455, sentence: 2.2, credits: 2.12 };
const BAR_W = 2.2, BAR_HH = 0.016;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function create(env) {
  const { gl, HEAD, VS, program, quad, room, walls } = env;
  const P = env.params;
  const NW = Math.min(MAXW, Math.max(1, walls.length));
  const PER = room.perimeter, H = room.height;
  const X0 = walls[0]?.centre ?? 0, LAMP = X0 + PER / 2;
  const text = createTextLayer(env);

  // ------------------------------------------------------------------------------------------ shaders
  const ROUND = `float rm(float d){ return d - uRoom.x * floor(d / uRoom.x + 0.5); }`;
  const dustP = program(HEAD + `
in vec4 aA; in vec4 aB;                   // x0, y0 (m), depth 0..1, seed | four randoms
uniform vec2 uRoom, uSize; uniform float uT, uPxS, uShift, uLvl, uLampX, uLineY, uLine, uStir;
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
  for (int i = 0; i < ${MAXH}; i++) {
    if (i >= uN) break;
    vec4 h = uHand[i]; vec2 d = p - h.xy; d.x = rm(d.x);
    float r2 = dot(d, d), k = h.z * exp(-r2 / (2.0 * 0.26 * 0.26));
    if (k < 1e-3) continue;
    vec2 n = d * inversesqrt(r2 + 1e-5);
    p += (n * 0.19 + vec2(-n.y, n.x) * 0.06 * sin(uT * 0.7 + sd * 9.0)) * k * uStir * mix(0.6, 1.3, z);
    stir += k;
  }
  p.x = mod(p.x, uRoom.x);
  float lamp = (0.5 + 0.5 * pow(0.5 + 0.5 * cos(6.2832 * rm(p.x - uLampX) / uRoom.x), 1.6)) * (0.75 + 0.35 * p.y / uRoom.y);
  float tw = 0.55 + 0.45 * sin(uT * (0.4 + aB.y * 1.1) + sd * 31.0);
  float glint = aB.w > 0.85 ? pow(max(0.0, sin(uT * (0.22 + aB.x * 0.5) + sd * 53.0)), 24.0) * 3.5 : 0.0;
  float layer = z < 0.35 ? 0.5 : (z < 0.75 ? 0.85 : 1.3);
  float E = (0.3 + 0.7 * aB.x) * layer * (tw + glint) * lamp;
  float dy = p.y - uLineY;
  float warm = uLine * (exp(-dy * dy / (2.0 * 0.13 * 0.13)) * 3.5 + exp(-dy * dy / (2.0 * 0.5 * 0.5)) * 0.6) + stir * 1.6;
  E *= (1.0 + warm) * edge * uLvl;
  vec3 col = mix(vec3(0.66, 0.75, 0.95), vec3(1.0, 0.68, 0.38), clamp(warm / (1.0 + warm), 0.0, 1.0));
  float sig = max(0.6, mix(0.55, 2.9, z * z * z) * uPxS);
  if (uShift > 0.5) p.x += p.x < uRoom.x * 0.5 ? uRoom.x : -uRoom.x;   // the seam copy of the near layer
  vec2 ndc = vec2(p.x / uRoom.x, p.y / uRoom.y) * 2.0 - 1.0;
  vC = (ndc * 0.5 + 0.5) * uSize; vS = sig;
  vCol = col * E * 0.13 / (6.2832 * sig * sig);
  gl_Position = E > 1e-4 ? vec4(ndc, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = ceil(sig * 6.0) + 1.0;
}`, HEAD + `in vec2 vC; in float vS; in vec3 vCol; out vec4 o;
void main(){ vec2 d = gl_FragCoord.xy - vC; o = vec4(vCol * exp(-dot(d, d) / (2.0 * vS * vS)), 1.0); }`);

  const bgP = program(VS, HEAD + `
uniform vec2 uRoom; uniform float uPxPerM, uT, uLineY, uLine, uHaze, uLampX, uBarY, uBarW, uBarHH;
uniform int uN; uniform vec4 uHand[${MAXH}];
uniform int uNW; uniform float uCx[${MAXW}]; uniform vec4 uBar[${MAXW}];   // track drawn 0..1, fill (0..value), alpha, head glow
in vec2 vUv; out vec4 o;
${ROUND}
void main(){
  vec2 p = vUv * uRoom; vec3 c = vec3(0.0);
  float sc = max(0.0022, 0.55 / uPxPerM), aa = 0.75 / uPxPerM;
  // the horizon, whole now, and dim
  float dy = p.y - uLineY;
  if (uLine > 0.0005) {
    float along = 0.86 + 0.14 * sin(6.2832 * 7.0 * p.x / uRoom.x + uT * 0.35) * sin(6.2832 * 3.0 * p.x / uRoom.x - uT * 0.21);
    float L = 2.6 * (0.0022 / sc) * exp(-dy * dy / (2.0 * sc * sc)) + 0.07 * exp(-dy * dy / (2.0 * 0.016 * 0.016)) + 0.008 * exp(-dy * dy / (2.0 * 0.25 * 0.25));
    c += vec3(1.0, 0.64, 0.34) * L * along * uLine;
  }
  c += vec3(0.55, 0.6, 0.75) * uHaze * (0.5 + 0.5 * cos(6.2832 * rm(p.x - uLampX) / uRoom.x)) * (0.3 + 0.7 * p.y / uRoom.y);
  for (int i = 0; i < ${MAXH}; i++) {                    // a hand: a faint warm glow
    if (i >= uN) break;
    vec2 d = p - uHand[i].xy; d.x = rm(d.x);
    c += vec3(1.0, 0.70, 0.42) * uHand[i].z * 0.03 * exp(-dot(d, d) / (2.0 * 0.2 * 0.2));
  }
  // the four bars: a thin gold track, deep red filling over it
  float by = p.y - uBarY;
  if (abs(by) < 0.2) for (int i = 0; i < ${MAXW}; i++) {
    if (i >= uNW) break;
    vec4 b = uBar[i];
    if (b.z < 0.002) continue;
    float xm = rm(p.x - uCx[i]) + uBarW * 0.5;           // metres from the bar's left end
    if (xm < -0.15 || xm > uBarW + 0.15) continue;
    float drawn = b.x * uBarW;
    float inT = smoothstep(-aa, aa, xm) * (1.0 - smoothstep(drawn - 0.04, drawn, xm)) * (1.0 - smoothstep(uBarW - aa, uBarW + aa, xm));
    float hair = (0.0022 / sc) * exp(-by * by / (2.0 * sc * sc));
    vec3 gold = vec3(1.0, 0.70, 0.36);
    vec3 track = gold * (1.1 * hair + 0.05 * exp(-by * by / (2.0 * 0.01 * 0.01))) * inT;
    // the ends: two short gold ticks
    float tk = 0.0;
    for (int e = 0; e < 2; e++) {
      float ex = xm - float(e) * uBarW;
      tk += (0.0022 / sc) * exp(-ex * ex / (2.0 * sc * sc)) * (1.0 - smoothstep(0.03 - aa, 0.03 + aa, abs(by))) * smoothstep(float(e) * 0.97, float(e) * 0.97 + 0.03, b.x);
    }
    track += gold * tk * 0.9;
    // the fill
    float f = b.y * uBarW;
    float fx = smoothstep(-aa, aa, xm) * (1.0 - smoothstep(f - aa, f + aa, xm)) * step(0.0005, b.y);
    float fy = 1.0 - smoothstep(uBarHH - aa, uBarHH + aa, abs(by));
    float fill = fx * fy;
    vec3 red = vec3(0.44, 0.024, 0.018) * (0.78 + 0.22 * (by / uBarHH * 0.5 + 0.5)) * (0.85 + 0.15 * xm / uBarW);
    vec3 col = mix(track, red, fill);
    // the head while it fills: a small warm glow at the front
    float hx = xm - f;
    col += vec3(1.0, 0.42, 0.18) * b.w * 0.5 * exp(-(hx * hx + by * by) / (2.0 * 0.035 * 0.035));
    c += col * b.z;
  }
  o = vec4(c, 1.0);
}`);

  // ------------------------------------------------------------------------------------------ dust (static attributes)
  const dust = new Float32Array(N_DUST * 8), nNear = Math.round(N_DUST * NEAR);
  {
    const r = rng(11);
    for (let i = 0; i < N_DUST; i++) {
      const near = i >= N_DUST - nNear, z = near ? 0.75 + 0.25 * r() : r() < 0.62 ? 0.35 * r() : 0.35 + 0.4 * r();
      dust.set([r() * PER, -0.25 + r() * (H + 0.5), z, r(), r(), r(), r(), r()], i * 8);
    }
  }
  const dustVao = gl.createVertexArray(); gl.bindVertexArray(dustVao);
  const dustBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf); gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
  { const a = gl.getAttribLocation(dustP.p, 'aA'), b = gl.getAttribLocation(dustP.p, 'aB');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b, 4, gl.FLOAT, false, 32, 16); }
  gl.bindVertexArray(null);

  // ------------------------------------------------------------------------------------------ the text (set once; again only when the content changes)
  const C = { castell: null, outcome: null, hands: -1, stillS: -1 };
  const V = new Float32Array(4);                         // the four values, 0..1
  const wallsOf = [[], [], [], []];                      // walls showing each value (wall i shows value i % 4)
  for (let i = 0; i < NW; i++) wallsOf[i % 4].push(i);
  const base = { x: 'walls', fadeIn: 0.9, fadeOut: 0.9 };
  text.set('sentence', { ...base, y: Y.sentence, width: 5.4, intensity: 0.76, lines: [{ text: SENTENCE[0], size: 0.15, weight: 300, tracking: 0.015 }, { text: SENTENCE[1], size: 0.15, weight: 300, tracking: 0.015, dy: 0.34 }] });
  text.set('credits', { ...base, y: Y.credits, width: 5.4, lines: [
    { text: CREDITS[0], size: 0.085, weight: 300, tracking: 0.62 },
    { text: CREDITS[1], size: 0.046, weight: 300, tracking: 0.2, dy: 0.29 },
    { text: CREDITS[2], size: 0.034, weight: 300, tracking: 0.2, alpha: 0.72, dy: 0.43 }] });
  for (let k = 0; k < 4; k++) {
    if (!wallsOf[k].length) continue;
    text.set('value' + k, { ...base, walls: wallsOf[k], y: Y.label, width: 3, lines: [
      { text: VALUES[k][1], size: 0.085, weight: 300, tracking: 0.05 },
      { text: VALUES[k][2], size: 0.034, weight: 400, tracking: 0.5, alpha: 0.72, dy: Y.label - Y.en }] });
  }
  for (const id of ['sentence', 'credits', 'value0', 'value1', 'value2', 'value3']) text.opacity(id, 0);

  function content(input) {
    const a = input.acta;
    let castell, outcome, hands, stillS;
    if (a) {
      castell = String(a.castell || ''); outcome = OUTCOME[a.outcome] ? a.outcome : 'descarregat'; hands = a.hands | 0; stillS = Math.round(a.stillS || 0);
      for (let k = 0; k < 4; k++) V[k] = clamp01(Number(a.values?.[VALUES[k][0]]) || 0);
    } else {
      const s = Math.round(Number(P.structure) || 3), f = Math.round(Number(P.floors) || 7);
      castell = C.castell !== null && C.s === s && C.f === f ? C.castell : `${s === 1 ? 'pilar' : s} de ${f}`; C.s = s; C.f = f;
      outcome = OUTCOME[P.outcome] ? P.outcome : 'descarregat'; hands = Math.round(Number(P.hands ?? 14)); stillS = Math.round(Number(P.stillS ?? 22));
      for (let k = 0; k < 4; k++) V[k] = clamp01(Number(P[VALUES[k][0]] ?? 0.7));
    }
    if (castell !== C.castell) { C.castell = castell; text.set('castell', { ...base, y: Y.castell, width: 4.8, intensity: 0.74, lines: [{ text: castell, size: 0.30, weight: 200, tracking: 0.03 }] }); }
    if (outcome !== C.outcome) {
      C.outcome = outcome;
      text.set('outcome', { ...base, y: Y.outcome, width: 4.8, lines: [{ text: OUTCOME[outcome][0], size: 0.066, weight: 400, tracking: 0.62 }] });
      text.set('gloss', { ...base, y: Y.gloss, width: 4.8, lines: [{ text: OUTCOME[outcome][1], size: 0.048, weight: 300, tracking: 0.05, alpha: 0.85 }] });
    }
    if (hands !== C.hands || stillS !== C.stillS) {
      C.hands = hands; C.stillS = stillS;
      const h = `${hands} ${hands === 1 ? 'hand' : 'hands'}`, line = stillS > 0 ? `${h}  ·  ${stillS} s of silence` : h;
      text.set('stats', { ...base, y: Y.gloss, width: 4.8, lines: [{ text: line, size: 0.048, weight: 300, tracking: 0.05, alpha: 0.85 }] });
    }
  }

  // ------------------------------------------------------------------------------------------ state
  const hands = new Float32Array(MAXH * 4), CX = new Float32Array(MAXW), BAR = new Float32Array(MAXW * 4);
  for (let i = 0; i < NW; i++) CX[i] = walls[i].centre;
  let t = Math.min(DURATION, Math.max(0, Number(P.start) || 0)), lastStart = P.start, nH = 0;
  const S = { dust: 0, line: 0, haze: 0 };

  function timeline() {
    const end = t > DURATION ? 1 - ss(44, 47.5, t) : 1;
    S.dust = (0.25 + 0.75 * ss(0.3, 3.6, t)) * ss(0.0, 0.8, t) * 0.62 * end * Number(P.dust ?? 1);
    S.line = ss(0.8, 3.8, t) * (0.3 + 0.06 * ss(4, 8, t) - 0.06 * ss(30, 38, t)) * end;
    S.haze = 0.0006 * S.dust;
    const block = 1 - ss(24, 26.2, t);                                   // the castell and the bars dim away
    text.opacity('castell', ss(4.4, 6.8, t) * block);
    text.opacity('outcome', ss(6.2, 8.0, t) * block);
    text.opacity('gloss', ss(7.8, 9.6, t) * (1 - ss(11.6, 13.2, t)));
    text.opacity('stats', ss(21.6, 23.2, t) * block);
    text.opacity('sentence', ss(26.4, 28.8, t) * (1 - ss(31.4, 33.0, t)));
    text.opacity('credits', ss(33.6, 35.6, t) * (1 - ss(38.0, 39.8, t)));
    for (let k = 0; k < 4; k++) text.opacity('value' + k, ss(12 + 2 * k, 13.4 + 2 * k, t) * block);
    for (let i = 0; i < NW; i++) {
      const k = i % 4, t0 = 12.2 + 2 * k, u = clamp01((t - (t0 + 1.0)) / 2.5);
      const fill = smoother(u) * 0.35 + (1 - Math.pow(1 - u, 3)) * 0.65;   // fills fast, settles slowly
      BAR[i * 4] = ss(t0 + 0.2, t0 + 1.4, t);                            // the track draws itself
      BAR[i * 4 + 1] = V[k] * fill;
      BAR[i * 4 + 2] = ss(t0, t0 + 0.6, t) * block;
      BAR[i * 4 + 3] = Math.sin(Math.PI * Math.min(1, u)) * (u > 0 && u < 1 ? 1 : 0) * V[k];
    }
  }

  return {
    get time() { return t; },
    text,                                                 // the scene's text layer (for the lab's checks)
    step(dt, input) {
      if (P.start !== lastStart) { lastStart = P.start; t = Math.min(DURATION, Math.max(0, Number(P.start) || 0)); }
      if (input.state && input.state.block === 'acta') t = input.state.t;
      else if (input.progress > 0) t = input.progress * DURATION;
      else { t += dt; if (t >= LOOP) t -= LOOP; }
      nH = 0;
      for (const h of input.hands) { if (nH >= MAXH) break; hands[nH * 4] = h.x; hands[nH * 4 + 1] = h.y; hands[nH * 4 + 2] = h.s; hands[nH * 4 + 3] = 0; nH++; }
      content(input);
      timeline();
      text.step(dt);
    },
    draw(target) {
      const lineY = Number(P.lineHeight) || 1.25, stir = P.handStir ?? 1;
      const pxS = (target.h / H) / 243;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.w, target.h);
      gl.disable(gl.BLEND);
      gl.useProgram(bgP.p); let u = bgP.u;
      gl.uniform2f(u.uRoom, PER, H); gl.uniform1f(u.uPxPerM, target.h / H); gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uLineY, lineY); gl.uniform1f(u.uLine, S.line); gl.uniform1f(u.uHaze, S.haze); gl.uniform1f(u.uLampX, LAMP);
      gl.uniform1f(u.uBarY, Y.bar); gl.uniform1f(u.uBarW, BAR_W); gl.uniform1f(u.uBarHH, BAR_HH);
      gl.uniform1i(u.uN, nH); gl.uniform4fv(u.uHand, hands);
      gl.uniform1i(u.uNW, NW); gl.uniform1fv(u.uCx, CX); gl.uniform4fv(u.uBar, BAR);
      quad();
      if (S.dust > 0.0005) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
        gl.useProgram(dustP.p); u = dustP.u;
        gl.uniform2f(u.uRoom, PER, H); gl.uniform2f(u.uSize, target.w, target.h); gl.uniform1f(u.uT, t + 90); gl.uniform1f(u.uPxS, pxS);
        gl.uniform1f(u.uLvl, S.dust); gl.uniform1f(u.uLampX, LAMP); gl.uniform1f(u.uLineY, lineY); gl.uniform1f(u.uLine, S.line); gl.uniform1f(u.uStir, stir);
        gl.uniform1i(u.uN, nH); gl.uniform4fv(u.uHand, hands);
        gl.bindVertexArray(dustVao);
        gl.uniform1f(u.uShift, 0); gl.drawArrays(gl.POINTS, 0, N_DUST);
        gl.uniform1f(u.uShift, 1); gl.drawArrays(gl.POINTS, N_DUST - nNear, nNear);
        gl.bindVertexArray(null); gl.disable(gl.BLEND);
      }
      text.draw(target);
    },
    setParams() { /* read live from env.params; "start" restarts the clock in step; content params are compared in step */ },
    dispose() { gl.deleteProgram(dustP.p); gl.deleteProgram(bgP.p); gl.deleteBuffer(dustBuf); gl.deleteVertexArray(dustVao); text.dispose(); },
  };
}
