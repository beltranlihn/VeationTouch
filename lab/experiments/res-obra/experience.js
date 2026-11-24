// Ressonància — the whole work, assembled. The score (../ressonancia/score.js) walks the pass; every block shows its own universe
// (a scene module of ../ressonancia/scenes behind the contract in host.js), cross-fading from one to the next; over them, the
// guide: hand targets (rings to put a hand in, with the pulse and the progress) and the text that says what to do now.
//
// The sound piece leads when it is there: it runs the same score, hears hands land at once and owns the pulse, and posts its
// state on a BroadcastChannel. LOCAL WORKAROUND, clearly marked (the runtime has no channel between a visual piece and its sound
// piece: see ../ressonancia/NOTES.md, Requests). With nothing arriving this page runs its own score: the piece is whole either way.
import { connectExperience } from '/experiences/runtime.js';
import { createScore, FLOOR_NAMES, CLIMBERS } from '../ressonancia/score.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) { document.body.textContent = 'WebGL2 is not available on this machine.'; throw new Error('WebGL2 is not available'); }
const HDR = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('OES_texture_float_linear');
const P = Object.assign({ jump: 'none', pace: 1, guide: true, brightness: 1, bloom: 1, quality: 'high' }, vt.params);
const QUALITY = { low: 0.5, medium: 0.75, high: 1 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------------------------------------ GL plumbing (as scenes/host.js)
const HEAD = '#version 300 es\nprecision highp float; precision highp int;\n';
const VS = HEAD + 'out vec2 vUv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';
function program(vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const full = gl.getActiveUniform(p, i).name; u[full.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, full); }
  return { p, u };
}
function target(w, h, o = {}) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  const f32 = o.float32 && HDR;
  gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? (f32 ? gl.RGBA32F : gl.RGBA16F) : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? (f32 ? gl.FLOAT : gl.HALF_FLOAT) : gl.UNSIGNED_BYTE, null);
  const filter = o.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo, w, h };
}
const vao = gl.createVertexArray();
const quad = () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); };
const room = { perimeter: vt.walls.reduce((a, w) => a + w.width, 0) || 27.6, height: vt.walls.reduce((a, w) => Math.max(a, w.height), 0) || 3.5 };
const walls = vt.walls.map((w, index) => { const x0 = (w.rect.x / vt.size.width) * room.perimeter, width = (w.rect.w / vt.size.width) * room.perimeter; return { id: w.id, index, x0, width, centre: x0 + width / 2 }; });
const NW = walls.length, wallIndex = new Map(vt.walls.map((w, i) => [w.id, i]));
const roundM = (d) => d - room.perimeter * Math.round(d / room.perimeter);
const k = QUALITY[P.quality] || 1, sw = Math.max(64, Math.round(vt.size.width * k)), sh = Math.max(16, Math.round(vt.size.height * k));
const q4 = (d) => [Math.max(16, Math.round(sw / d)), Math.max(4, Math.round(sh / d))];
const T = { a: target(sw, sh), b: target(sw, sh), mix: target(sw, sh), b1a: target(...q4(4)), b1b: target(...q4(4)), b2a: target(...q4(16)), b2b: target(...q4(16)) };

// ------------------------------------------------------------------------------------------------ the scenes
const DEFAULTS = await fetch(new URL('./defaults.json', import.meta.url)).then((r) => r.json()).catch(() => ({}));
const black = () => ({ step() {}, draw(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } });
const scenes = {};
for (const name of ['fire', 'earth', 'stone', 'night', 'festa', 'intro', 'acta']) {
  const params = { ...(DEFAULTS[name] || {}), progress: 0 };
  const env = { gl, vt, HDR, room, walls, size: { w: sw, h: sh }, pxPerM: sh / room.height, VS, HEAD, program, target, quad, roundM, params };
  let scene = null;
  try { scene = (await import(`../ressonancia/scenes/${name}.js`)).create(env); scene.setParams?.(params); }
  catch (e) { console.warn(`res-obra: scene "${name}" is not ready (${e.message}); black in its place`); scene = black(); }
  scenes[name] = { scene, params, name };
}
const SCENE_OF = { wait: 'fire', intro: 'intro', brasa: 'fire', pinya: 'earth', tronc: 'stone', pom: 'night', crown: 'stone', festa: 'festa', baixada: 'stone', fall: 'stone', acta: 'acta' };
const textLayer = await import('../ressonancia/scenes/text.js').then((m) => m.createTextLayer({ gl, vt, HDR, room, walls, size: { w: sw, h: sh }, pxPerM: sh / room.height, VS, HEAD, program, target, quad, roundM, params: P }, {})).catch(() => null);

// ------------------------------------------------------------------------------------------------ compositing: two scenes cross-fade, the guide's targets on top
const MAXT = 16;
const mixP = program(VS, HEAD + `
uniform sampler2D uA, uB, uHandTex; uniform float uFade, uPx; uniform vec2 uRoom; uniform int uNT;
uniform vec4 uTgt[${MAXT}];        // x, y (m), radius (m), visibility
uniform vec4 uTgtS[${MAXT}];       // held 0..1, beat ring (radius factor, 0 = none), progress arc 0..1, hand icon 0..1
in vec2 vUv; out vec4 o;
void main(){
  vec3 col = mix(texture(uB, vUv).rgb, texture(uA, vUv).rgb, uFade);
  vec2 p = vUv * uRoom; vec3 ui = vec3(0.0); float shade = 0.0;
  for (int i = 0; i < ${MAXT}; i++) {
    if (i >= uNT) break;
    vec4 t = uTgt[i], s = uTgtS[i];
    if (t.w < 0.004) continue;
    vec2 d = p - t.xy; d.x -= uRoom.x * floor(d.x / uRoom.x + 0.5);
    float r = length(d), Rt = t.z;
    if (r > Rt * 3.4) continue;
    float lw = 0.007 + uPx;
    float ring = smoothstep(lw, 0.0, abs(r - Rt)) * (0.5 + 0.5 * s.x);
    float fill = exp(-r * r / (0.6 * Rt * Rt)) * s.x * 0.18;
    float beat = s.y > 0.0 ? smoothstep(lw, 0.0, abs(r - Rt * s.y)) * (1.0 - smoothstep(1.0, 3.0, s.y)) * 0.85 : 0.0;
    float ang = fract(atan(d.x, d.y) / 6.2831853 + 1.0);
    float arc = smoothstep(lw * 1.8, 0.0, abs(r - Rt - 0.04)) * step(ang, s.z) * step(0.002, s.z);
    vec2 huv = d / (Rt * 1.5) * 0.5 + 0.5;
    float hand = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture(uHandTex, vec2(huv.x, 1.0 - huv.y)).a * s.w : 0.0;
    ui += vec3(1.0, 0.90, 0.74) * t.w * (ring * 0.9 + fill + beat + arc * 1.3 + hand * 0.42);
    shade = max(shade, t.w * (1.0 - smoothstep(Rt * 0.9, Rt * 1.7, r)) * 0.45);    // a target stays readable over a bright universe
  }
  o = vec4(col * (1.0 - shade) + ui, 1.0);
}`);
const brightP = program(VS, HEAD + `uniform sampler2D uTex; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
void main(){ vec3 c = (texture(uTex, vUv + uTexel * vec2(-1.0,-1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,-1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0,1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(0.18, 0.95, l), 1.0); }`);
const blurP = program(VS, HEAD + `uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846154).rgb + texture(uTex, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2307692).rgb + texture(uTex, vUv - uDir * 3.2307692).rgb) * 0.0702703; o = vec4(c, 1.0); }`);
const finalP = program(VS, HEAD + `uniform sampler2D uScene, uB1, uB2; uniform float uBright, uBloom, uTime; in vec2 vUv; out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){ vec3 c = texture(uScene, vUv).rgb + (texture(uB1, vUv).rgb * 0.40 + texture(uB2, vUv).rgb * 0.55) * uBloom;
  c = 1.0 - exp(-max(c, 0.0) * 1.15 * uBright); c = pow(c, vec3(1.0 / 2.2)); c += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0; o = vec4(c, 1.0); }`);
// a hand, drawn once: the sign for "put your hand here"
const handCv = document.createElement('canvas'); handCv.width = handCv.height = 256;
{
  const g = handCv.getContext('2d'), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  g.fillStyle = '#fff'; rr(84, 118, 96, 96, 30);
  [[84, 72, 62], [108, 52, 82], [132, 58, 76], [156, 78, 58]].forEach(([x, y, h]) => rr(x, y, 21, h + 20, 10.5));
  g.save(); g.translate(86, 168); g.rotate(-0.95); rr(-10, -62, 22, 70, 11); g.restore();
}
const handTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, handTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, handCv);

// ------------------------------------------------------------------------------------------------ the score: led by the sound piece, or its own
const score = createScore(NW), S = score.state;
const link = { at: -1e9, ts: 0, pace: 1, beat: 0, events: [], acta: null, told: 0 };
const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null;
if (bc) bc.onmessage = (ev) => {
  const m = ev.data; if (m?.type !== 'state' || !m.s || !('block' in m.s)) return;
  const { events, ...s } = m.s; Object.assign(S, s);
  link.events.push(...(events || [])); link.at = performance.now(); link.ts = m.ts; link.pace = m.pace || 1; link.beat = s.beat; link.acta = m.acta;
};
const following = () => performance.now() - link.at < 700;
const tell = (o) => { try { bc?.postMessage({ type: 'ctl', ...o }); } catch { /* a closed channel: carry on alone */ } };
let lastJump = 'none';
const doJump = () => { if (P.jump !== lastJump) { lastJump = P.jump; if (P.jump && P.jump !== 'none') { score.jump(P.jump); tell({ jump: P.jump }); } } };
vt.on('params', (p) => { Object.assign(P, p); doJump(); });
doJump();

// ------------------------------------------------------------------------------------------------ hands (as scenes/host.js)
const MAXH = 32, known = new Map(), hands = [], downs = [], ups = [], scoreHands = [];
function readHands(dt) {
  downs.length = 0; ups.length = 0; hands.length = 0; scoreHands.length = 0;
  for (const h of known.values()) h.live = false;
  for (const r of vt.hands()) {
    const u = r.x / vt.size.width, v = 1 - r.y / vt.size.height, x = u * room.perimeter, y = v * room.height;
    let h = known.get(r.stroke);
    if (!h) { if (known.size >= MAXH) continue; h = { stroke: r.stroke, wall: 0, x, y, u, v, vx: 0, vy: 0, s: 0, on: true, age: 0, live: true }; known.set(r.stroke, h); downs.push(h); }
    const wi = wallIndex.get(r.wallId) ?? 0, ppm = vt.walls[wi]?.pxPerM || 261;
    h.wall = wi; h.x = x; h.y = y; h.u = u; h.v = v; h.vx = (r.vx || 0) / ppm; h.vy = -(r.vy || 0) / ppm; h.live = true; h.on = true;
    scoreHands.push({ stroke: h.stroke, wall: wi, dx: roundM(x - walls[wi].centre), speed: Math.hypot(h.vx, h.vy) });
  }
  for (const [key, h] of known) {
    if (!h.live && h.on) { h.on = false; h.vx = 0; h.vy = 0; ups.push(h); }
    h.age += dt; h.s = ease(h.s, h.on ? 1 : 0, dt, h.on ? 14 : 2.2);
    if (!h.on && h.s < 0.01) { known.delete(key); continue; }
    hands.push(h);
  }
}

// ------------------------------------------------------------------------------------------------ the guide: where the hands go, what the walls say
const HAND_Y = 1.25, TARGET_R = 0.3;
const tgtU = new Float32Array(MAXT * 4), tgtSU = new Float32Array(MAXT * 4), heldE = new Float32Array(MAXT);
let nT = 0, guideA = 0, guideBlock = '';
const near = (x) => { for (const h of hands) if (h.on && Math.abs(roundM(h.x - x)) < 0.55 && Math.abs(h.y - HAND_Y) < 0.75) return true; return false; };
function targets(dt) {
  const b = S.block, playing = S.phase !== 'title';
  const key = b + '|' + (b === 'tronc' ? +S.balance : 0) + '|' + S.buttons;
  const want = P.guide !== false && playing && (b === 'wait' || b === 'pinya' || b === 'tronc' || b === 'pom' || b === 'baixada') && !(b === 'tronc' && S.phase === 'reward');
  if (key !== guideBlock) { guideA = ease(guideA, 0, dt, 8); if (guideA < 0.03) { guideBlock = key; heldE.fill(0); } } else guideA = ease(guideA, want ? 1 : 0, dt, 3);
  const [gb] = guideBlock.split('|');
  nT = 0;
  const put = (x, vis, held, beat, arc) => {
    if (nT >= MAXT) return; const i = nT++;
    heldE[i] = ease(heldE[i], held ? 1 : 0, dt, held ? 12 : 3);
    tgtU[i * 4] = ((x % room.perimeter) + room.perimeter) % room.perimeter; tgtU[i * 4 + 1] = HAND_Y; tgtU[i * 4 + 2] = TARGET_R; tgtU[i * 4 + 3] = vis * guideA;
    tgtSU[i * 4] = heldE[i]; tgtSU[i * 4 + 1] = beat; tgtSU[i * 4 + 2] = arc; tgtSU[i * 4 + 3] = (1 - heldE[i] * 0.75) * (0.82 + 0.18 * Math.sin(time * 1.6 + i));
  };
  for (let w = 0; w < NW; w++) {
    const c = walls[w].centre, inS = S.walls[w];
    if (gb === 'wait') put(c, 1, S.count[w] > 0, 0, S.start);
    else if (gb === 'pinya') { const offs = S.buttons >= 3 ? [-1.1, 0, 1.1] : S.buttons === 2 ? [-0.7, 0.7] : [0]; for (const o of offs) put(c + o, 1, near(c + o), 0, S.fill[w]); }
    else if (gb === 'tronc' && inS) { const beat = 1 + (1 - S.beat) * 2; if (S.balance) { put(c - 0.65, 1, S.left[w] && near(c - 0.65), beat, S.floorProgress); put(c + 0.65, 1, S.right[w] && near(c + 0.65), beat, S.floorProgress); } else put(c, 1, S.count[w] > 0, beat, S.floorProgress); }
    else if (gb === 'pom' && inS) put(c, w === S.lightWall ? 1 : w === S.nextWall ? 0.8 : 0.4, S.count[w] > 0, 0, w === S.lightWall ? S.climb : 0);
    else if (gb === 'baixada' && inS) put(c, 1, S.count[w] > 0, 0, 0);
  }
}
const CARDS = { brasa: ['I · Brasa', 'Awakening'], pinya: ['II · Pinya', 'Strength · Força'], tronc: ['III · Tronc', 'Balance · Equilibri'], pom: ['IV · Pom de dalt', 'Courage · Valor'] };
function lines() {      // [title, small line] over the targets, or a chapter card
  const b = S.block;
  if (S.phase === 'title' && CARDS[b]) return { card: CARDS[b] };
  if (b === 'wait') return { line: ['Place your hands on the wall', 'to begin'] };
  if (b === 'brasa') return S.phase === 'reward' ? {} : { line: S.touched < Math.min(8, S.people) && S.waves === 0 ? ['Touch the wall', ''] : ['Now, all together', `${Math.min(3, S.waves)} of 3`] };
  if (b === 'pinya') { const full = S.fill.filter((f) => f >= 1).length; return S.phase === 'reward' ? { line: ['The circle is closed', ''] } : { line: ['Hold the circles', `${Math.min(full, S.needWalls)} of ${S.needWalls} walls`] }; }
  if (b === 'tronc') return S.phase === 'reward' ? {} : { line: [S.balance ? 'Keep it straight: hold both sides' : 'Press on the beat', S.floors ? `${FLOOR_NAMES[S.floors - 1]} · floor ${S.floors}` : ''] };
  if (b === 'pom') return { line: ['Hold still', CLIMBERS[S.climber] || ''] };
  if (b === 'crown') return S.t > 3 && S.t < 14 ? { card: ['Crowned', (link.acta || score.acta()).castell] } : {};
  if (b === 'festa') return S.t < 7 ? { card: ['The square is yours', ''] } : {};
  if (b === 'baixada') return { line: ['Stay. Bring it down', 'floor by floor'] };
  if (b === 'fall') return S.t > 2 ? { card: ['It fell', 'The embers remain'] } : {};
  return {};
}
const structureWalls = [];
function guideText() {
  if (!textLayer) return;
  const g = P.guide === false ? {} : lines();
  // from the tronc on, the instructions belong to the walls that carry the castell
  const onStructure = (S.block === 'tronc' || S.block === 'pom' || S.block === 'baixada') && S.structure > 0 && S.structure < NW;
  if (onStructure) { structureWalls.length = 0; for (let w = 0; w < NW; w++) if (S.walls[w]) structureWalls.push(w); }
  if (g.card) textLayer.set('card', { lines: [{ text: g.card[0].toUpperCase(), size: 0.24, tracking: 0.2 }, ...(g.card[1] ? [{ text: g.card[1], size: 0.1, tracking: 0.08, alpha: 0.75, dy: 0.36 }] : [])], x: 'walls', y: 2.15, width: 5.6, plate: 0.5, fadeIn: 1.2, fadeOut: 0.8 }); else textLayer.clear('card');
  if (g.line) textLayer.set('line', { lines: [{ text: g.line[0].toUpperCase(), size: 0.15, tracking: 0.16 }, ...(g.line[1] ? [{ text: g.line[1], size: 0.09, tracking: 0.05, alpha: 0.8, dy: 0.24 }] : [])], x: 'walls', walls: onStructure ? structureWalls : undefined, y: 1.92, width: 5.0, plate: 0.55, fadeIn: 0.6, fadeOut: 0.4 }); else textLayer.clear('line');
}

// ------------------------------------------------------------------------------------------------ the frame
let time = 0, shown = null, prev = null, fade = 1;
const frameEvents = [];
const input = { time: 0, dt: 0, hands, downs, ups, progress: 0, params: null, state: S, events: frameEvents, acta: null };
function sceneParams(name, b) {      // what each universe is asked for, block by block
  const p = scenes[name].params, B = score.times[b], reward = S.phase === 'reward' && B?.reward ? smooth(S.tp / B.reward) : 0;
  if (name === 'fire') { p.progress = b === 'wait' ? 0.04 + 0.2 * S.start : S.progress; p.gather = b === 'brasa' ? reward : 0; }
  else if (name === 'earth') { p.progress = S.phase === 'reward' ? 1 : S.progress * 0.84 + S.closed * 0.16; p.crack = reward; }
  else if (name === 'night') p.progress = S.progress;
  else if (name === 'intro') p.progress = clamp(S.t / score.times.intro, 0.0005, 1);
  else if (name === 'festa') p.progress = 0;
  else p.progress = S.progress;
  return p;
}
function run(entry, tgt, dt, b) {
  const p = sceneParams(entry.name, b); entry.scene.setParams?.(p);
  input.progress = p.progress; input.params = p;
  gl.disable(gl.BLEND);
  entry.scene.step(dt, input); entry.scene.draw(tgt);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
}
const pass = (prog, dst, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null); gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height); gl.useProgram(prog.p); setup(prog.u); quad(); };
const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
let prevBlock = 'wait', lastBlock = 'wait';

function frame(dt) {
  time += dt; readHands(dt);
  frameEvents.length = 0;
  if (following()) {
    if (S.block === 'tronc') S.beat = (link.beat + (((Date.now() - link.ts) / 1000) * link.pace) / score.times.tronc.period) % 1;   // between two messages the pulse keeps moving
    if (time - link.told > 1) { link.told = time; tell({ pace: P.pace || 1 }); }
    frameEvents.push(...link.events.splice(0));
  } else { score.step(dt * (P.pace || 1), scoreHands); frameEvents.push(...S.events); S.events.length = 0; }
  input.time = time; input.dt = dt; input.acta = link.acta && following() ? link.acta : score.acta();

  const want = scenes[SCENE_OF[S.block] || 'fire'];
  if (want !== shown) { prev = shown; prevBlock = lastBlock; shown = want; fade = prev ? 0 : 1; }
  fade = Math.min(1, fade + dt / 2.5);
  run(shown, T.a, dt, S.block);
  if (fade < 1 && prev) run(prev, T.b, dt, prevBlock); else prev = null;
  lastBlock = S.block;

  targets(dt);
  pass(mixP, T.mix, (u) => {
    bind(0, T.a.tex); bind(1, T.b.tex); bind(2, handTex);
    gl.uniform1i(u.uA, 0); gl.uniform1i(u.uB, 1); gl.uniform1i(u.uHandTex, 2);
    gl.uniform1f(u.uFade, prev ? smooth(fade) : 1); gl.uniform1f(u.uPx, room.height / sh); gl.uniform2f(u.uRoom, room.perimeter, room.height);
    gl.uniform1i(u.uNT, nT); gl.uniform4fv(u.uTgt, tgtU); gl.uniform4fv(u.uTgtS, tgtSU);
  });
  if (textLayer) { guideText(); textLayer.step(dt); textLayer.draw(T.mix, 1); gl.disable(gl.BLEND); }
  pass(brightP, T.b1a, (u) => { bind(0, T.mix.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / T.mix.w, 1 / T.mix.h); });
  const blur = (src, dst, dx, dy) => pass(blurP, dst, (u) => { bind(0, src.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, dx / src.w, dy / src.h); });
  blur(T.b1a, T.b1b, 1, 0); blur(T.b1b, T.b1a, 0, 1); blur(T.b1a, T.b2a, 2, 0); blur(T.b2a, T.b2b, 1, 0); blur(T.b2b, T.b2a, 0, 1);
  pass(finalP, null, (u) => { bind(0, T.mix.tex); bind(1, T.b1a.tex); bind(2, T.b2a.tex); gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uB1, 1); gl.uniform1i(u.uB2, 2); gl.uniform1f(u.uBright, P.brightness); gl.uniform1f(u.uBloom, P.bloom); gl.uniform1f(u.uTime, time); });
}

window.__obra = { score, scenes, following };   // for the lab's checks only
vt.loop(frame, gl);
