// Ressonància — part «festa3d»: V. L'aleta (the crown, 25 s) and la ressonància (free, ~65 s). Contract: ../PARTS.md.
//
// What it draws
//   The plate   a luminous surface standing `depth` m behind the four walls (a radial copy of the wall planes from the eye, so at rest
//               every point sits exactly behind the wall point it is seen through, and the four planes meet at the corners). Its
//               relief and its light come from a WAVE FIELD: a 2D wave equation over perimeter × height (periodic round the room,
//               reflecting at floor and top), solved on the GPU in two float render targets (ping-pong, a few sub-steps a frame,
//               CFL ≤ 0.5), as in the 2D festa.js: damping, viscosity, a faint spring, soft clip above a knee and drives that hush
//               where the plate already rings (2 people: clear rings; 15: it seethes but stays bounded).
//               Light: gold contour filigree on the levels of the local amplitude (constant line width, ≤ 6 nested lines), relief
//               glints from the slope (pearl, a touch of thin-film iridescence), a deep castell-red haze where waves have been,
//               the nodal lines when the room orders itself.
//   The sand    ~600 000 GPU particles (compute; WebGPU and WebGL2) lying on the plate: they hop where it vibrates and slide down
//               the amplitude towards the nodes, so standing figures gather the sand into Chladni lines, seen in depth (they ride
//               the relief and hop off it towards the room).
//   Shards      night fragments (dark mirror) that burst into gold on arrival; gold shards that fall on leaving.
// Hands (input.downs / input.hands, ON the wall planes → field coordinates): a landing hand kicks the field the same frame (a ring
//   of gold that runs round the room, crosses the others and interferes), a resting hand drives gently (its own frequency, locking
//   onto the room's mode as the resonance grows), a dragged hand pushes a wake.
// The hidden rule: R = input.state.resonance (the score; in the study a stand-in with the score's own rule) + params.resonance.
//   As R rises: two near-degenerate modes of the room are driven (ordered Chladni-like figures), the sand gathers on the nodes,
//   light climbs the walls, gold goes white-gold, and the image breaks into ORDERED BANDS (pixel-sorted runs, slit-scan streaks:
//   gold, pearl, rare iridescent). 'bloom' (event, or params.bloomNow: the study host already owns «bloom») → ~4.2 s of a total ordered figure, then it relaxes.
// The crown (state.block 'crown', state.t 0–25; params.crown overrides): 0–1.2 the enxaneta's point at the top of wall 0 · 1.2–5 a
//   flash of gold runs round the top of the four walls both ways and meets opposite · 4.5–13 the night breaks open into light, cell
//   by cell from the top (cracks of gold, warm white behind) · 6–19 a slow rain of gold in depth · 16–20 the held breath (the rain
//   hangs, the light holds) · 20 released: a wavefront falls from the top round the whole room, the rain settles into sand, the
//   light exhales into the resonance.
// arrive: night shards drift in from the dark, burst into gold, their particles fly onto the plate; the plate opens cell by cell.
// leave: the field freezes (0–0.15), then the sand and gold shards fall slowly like rain; the plate goes dark cell by cell.
// Read-only: part.resonance (what is shown, 0..1), part.bloom (0..1).
import { lin as palLin } from '../palette.js';
import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
const MAXH = 16, MAXI = 16, MAXM = 4, MAXS = 32;
const NP_GPU = 600000, NP_GL = 300000, NSH = 2400;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function create({ THREE, TSL, room, params, parts }) {
  const P = params || {};
  const num = (k, d) => { const v = Number(P[k]); return Number.isFinite(v) ? v : d; };
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionWorld, positionLocal, uv, texture,
    vec2, vec3, vec4, float, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, floor, fract, pow, dot, cross,
    normalize, length, select, sign, tanh, step, cameraWorldMatrix, Discard, vertexIndex, atan, cameraPosition, reflect, pmremTexture,
  } = TSL;
  const envMap = room.envMap || null;   // INT's night environment (T-028): what the chrome and the glass reflect
  // FES-F: what the metal reflects is the square in FIESTA — a verbena: garlands of warm bulbs (#FFD9A0, a few coral and lilac) hung round
  // the room in catenaries, a pale-gold sky above, lilac below, a bright horizon with a darker seam under it (the bite of chrome). It
  // turns slowly with the room's movement (U.turn) and lights up as the room rings (U.Ve). Procedural: the same on every wall, WebGPU and WebGL2.
  const LKEY = new THREE.Vector3(0.15, 1.0, 0.25).normalize();
  const GARL = [[0.30, 8, 0.07, 13, 0.0], [0.41, 6, 0.10, 17, 0.37], [0.62, 10, 0.08, 9, 0.71]];   // height (sin el), spans, sag, bulbs a span, phase
  const envT = (R0, rough) => {
    const { vec3: v3, float: fl, sin: sn, cos: cs, atan: at, exp: ex, fract: fc, floor: flr, smoothstep: sst, mix: mi, max: mx, pow: pw, dot: dt_, step: stp } = TSL;
    const ca = cs(U.turn), sa = sn(U.turn);
    const R = v3(R0.x.mul(ca).sub(R0.z.mul(sa)), R0.y, R0.x.mul(sa).add(R0.z.mul(ca)));
    const az = at(R.z, R.x).div(6.2832).add(0.5), el = R.y.add(U.envLift);
    const up = sst(0.0, 0.9, el), dn = sst(0.0, -0.8, el);
    const sect = sn(az.mul(6.2832 * 5).add(1.0)).mul(sn(az.mul(6.2832 * 2).add(0.4))).mul(0.3).add(0.7);      // lighter and deeper sectors: never a flat wash
    const cloud = ex(el.sub(0.52).mul(el.sub(0.52)).negate().div(0.012)).mul(sn(az.mul(6.2832 * 3).add(2.0)).mul(0.5).add(0.5)).mul(0.28);
    const sky = mi(v3(1.0, 0.66, 0.3), v3(1.0, 0.88, 0.66), up).mul(up.mul(up).mul(0.3).add(0.13)).mul(sect).add(v3(1.0, 0.93, 0.8).mul(cloud)).mul(sst(-0.04, 0.03, el));
    const low = mi(mi(v3(0.579, 0.544, 0.693), v3(0.332, 0.302, 0.464), dn), v3(0.95, 0.7, 0.5), U.cw).mul(dn.mul(0.16).add(0.2)).mul(sect).mul(sst(0.03, -0.04, el));   // T-053: warmer below while the crown opens
    const hz = ex(el.mul(el).negate().div(0.008)).mul(0.34);
    const seam = fl(1).sub(ex(el.add(0.1).mul(el.add(0.1)).negate().div(0.003)).mul(0.5));
    let c = sky.add(low).add(v3(1.0, 0.9, 0.74).mul(hz)).mul(seam).mul(U.Ve.mul(0.3).add(0.7));
    const w = fl(0.011 + rough * 0.05), w2 = w.mul(w);
    for (const [e, n, sag, nb, ph] of GARL) {
      const x = az.mul(n).add(ph), f = fc(x), cat = fl(e).sub(f.mul(fl(1).sub(f)).mul(4 * sag));
      const de = el.sub(cat), bi = flr(f.mul(nb)), b = fc(f.mul(nb)).sub(0.5).mul(6.2832 / (nb * n));
      const hsh = fc(sn(bi.add(flr(x).mul(17.0)).mul(12.9898 + e)).mul(43758.5453));
      const r2 = de.mul(de).add(b.mul(b));
      const tw = sn(U.time.mul(hsh.mul(2.0).add(1.0)).add(hsh.mul(40.0))).mul(0.2).add(0.8);
      const bulb = ex(r2.negate().div(w2)).mul(5.0).add(ex(r2.negate().div(w2.mul(30.0))).mul(0.12));
      const bc = mi(v3(1.0, 0.85, 0.63), mi(v3(1.0, 0.62, 0.55), v3(0.78, 0.7, 1.0), stp(0.5, fc(hsh.mul(7.0)))), stp(0.78, hsh));
      c = c.add(bc.mul(bulb).mul(tw).mul(U.Ve.mul(0.3).add(0.8)).mul(fl(1).sub(U.cw.mul(1.2)).max(0.1))).add(v3(1.0, 0.8, 0.5).mul(ex(de.mul(de).negate().div(0.00003)).mul(0.04)));
    }
    return c.add(v3(1.0, 0.95, 0.85).mul(pw(mx(dt_(R0, v3(LKEY.x, LKEY.y, LKEY.z)), 0), 30.0).mul(fl(0.8).sub(U.cw.mul(0.57)))));   // T-053 r5: the white glint ×0.5 in the crown
  };
  const object = new THREE.Group(); object.name = 'festa3d';
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const GL = room.backend === 'webgl2', NP = GL ? NP_GL : NP_GPU;      // WebGL2 (the fallback) carries half the sand, a little brighter

  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0, growT = 0;
  function fxImpact(wall, u, strength, mat, kind) {                // wall: room.walls index · u: 0..1 along it · strength: 0..1
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }

  // ------------------------------------------------------------------ the room → the field (perimeter s × height y)
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const HG = Math.max(...walls.map((w) => w.height));
  const X0 = walls[0].width / 2;
  const CPM = 30, GH = Math.round(HG * CPM), DX = HG / GH, GW = Math.round(PER / DX);
  const TX = 1 / GW, TY = 1 / GH;
  const dW = walls.map((w) => Math.max(1, -new THREE.Vector3().subVectors(w.pa, eye).dot(w.normal)));
  const pxM = walls[0].height / walls[0].rect.h;
  let depth = num('depth', 1.35);
  const K = dW.map((d) => (d + depth) / d);                         // radial scale wall → plate (fixed at creation)

  // ------------------------------------------------------------------ uniforms
  const U = {
    time: uniform(0), dt: uniform(0), frame: uniform(0), c2: uniform(1), gam: uniform(0.7), clip: uniform(0.6), tau: uniform(0),
    ceil: uniform(2.6), kick: uniform(0), eavg: uniform(0.02), wake: uniform(260), visc: uniform(7), modeCap: uniform(0.1),
    nH: uniform(0, 'int'), nI: uniform(0, 'int'), nM: uniform(0, 'int'), lineY: uniform(3), lineK: uniform(0), iw: uniform(0.03), still: uniform(0.7), derA: uniform(1), rmsK: uniform(0),
    // look
    gain: uniform(1), Ve: uniform(0), bloom: uniform(0), stepL: uniform(0.02), lineW: uniform(0.0065), sand: uniform(0), bandK: uniform(0),
    relief: uniform(0.35), haze: uniform(0.5), contours: uniform(0), mandA: uniform(0), mand: uniform(0), mph: uniform(0), mw: uniform(1), nHU: uniform(0, 'int'), chrome: uniform(0.9), glass: uniform(1.8), bend: uniform(0.35),
    // crown
    front: uniform(0), head: uniform(0), flash: uniform(0), ring: uniform(0), open: uniform(0), swell: uniform(0), crownOn: uniform(0), cells: uniform(1), solo: uniform(1),
    peakS0: uniform(0), peakFront: uniform(0), peakEnv: uniform(0), peakOpen: uniform(0), duck: uniform(1), washY: uniform(-1), washK: uniform(0), fill: uniform(0),
    rain: uniform(0), hold: uniform(0), respawn: uniform(0), nFr: uniform(0, 'int'), callT: uniform(-99), callGap: uniform(0.8), callOn: uniform(0), bSize: uniform(1), turn: uniform(0), rise: uniform(0), farK: uniform(1), quiet: uniform(0.3),
    cw: uniform(0), mr: uniform(0.5), frieze: uniform(0), swellA: uniform(1), envLift: uniform(0), lvl: uniform(1), qmax: uniform(0.1), veil: uniform(0.15),
    // arrive / leave
    grow: uniform(30), arrive: uniform(1), leave: uniform(0), freeze: uniform(0), sandAmt: uniform(1), sandGlow: uniform(1),
  };
  const FR = []; for (let i = 0; i < 12; i++) FR.push(new THREE.Vector4());   // echo fronts: (s0 from-wall centre, distance run (m), gen, alpha)
  const uFR = uniformArray(FR, 'vec4');
  const HA = [], HB = [], IMP = [], MA = [], MB = [], HU = [], HV = [];
  for (let i = 0; i < MAXH; i++) { HA.push(new THREE.Vector4()); HB.push(new THREE.Vector4()); HU.push(new THREE.Vector4()); HV.push(new THREE.Vector4()); }
  for (let i = 0; i < MAXI; i++) IMP.push(new THREE.Vector4());
  for (let i = 0; i < MAXM; i++) { MA.push(new THREE.Vector4()); MB.push(new THREE.Vector4()); }
  const uHA = uniformArray(HA, 'vec4'), uHB = uniformArray(HB, 'vec4'), uImp = uniformArray(IMP, 'vec4');
  const uMA = uniformArray(MA, 'vec4'), uMB = uniformArray(MB, 'vec4'), uHU = uniformArray(HU, 'vec4'), uHV = uniformArray(HV, 'vec4');

  const wrapd = (d) => d.sub(floor(d.div(PER).add(0.5)).mul(PER));
  const wrapS = (s) => s.sub(floor(s.div(PER)).mul(PER));
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const ROSE = vec3(1.0, 0.8, 0.82), ICE = vec3(0.8, 0.9, 1.0);
  const GOLD = vec3(1.0, 0.56, 0.17), GOLD2 = vec3(1.0, 0.68, 0.32), HOT = vec3(1.0, 0.84, 0.6), WHITE = vec3(1.0, 0.93, 0.8), PEARL = vec3(0.86, 0.9, 1.0);

  // ------------------------------------------------------------------ the field: two float targets, ping-pong
  const mkRT = (type, filter) => {
    const rt = new THREE.RenderTarget(GW, GH, { type, depthBuffer: false, minFilter: filter, magFilter: filter, generateMipmaps: false });
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.minFilter = filter; rt.texture.magFilter = filter; rt.texture.generateMipmaps = false;
    return rt;
  };
  const sim = [mkRT(THREE.FloatType, THREE.NearestFilter), mkRT(THREE.FloatType, THREE.NearestFilter)];
  const der = mkRT(THREE.HalfFloatType, THREE.LinearFilter), derB = mkRT(THREE.HalfFloatType, THREE.NearestFilter);
  let sc = 0, cleared = false;

  // ---- the figures (analytic: the plate's own, exact and calm). ONE MANDALA PER WALL, each its own mode (petals, ring spacing), that
  // GROWS with the group's order (U.mr: Ø 1 m → 3 m); at the maximum a Chladni frieze (two crossed modes of the room, periodic round it)
  // fills the plate between them: the four join into one continuous figure. The sand slides to the nodes (P = 0); the metal shows it in relief.
  const MCY = 1.5, MCX = walls.map((w, i) => cum[i] + w.width * 0.5), WCX = walls.map((w, i) => cum[i] + w.width * 0.5);
  const MKW = [0.62, 0.5, 0.74, 0.56].map((l) => 2 * Math.PI / l), PETW = [6, 8, 5, 12], PHW = [0, 0.7, 1.4, 2.1];
  const FKA = 2 * Math.PI * Math.round(PER / 1.2) / PER, FKB = 2 * Math.PI * Math.round(PER / 0.62) / PER, FQA = 2 * Math.PI / 1.2, FQB = 2 * Math.PI / 0.62;
  const wallPick = (s, arr) => { let v = float(arr[0]); for (let w = 1; w < NW; w++) v = select(s.greaterThanEqual(cum[w]), float(arr[w % arr.length]), v); return v; };
  const frE = (y) => smoothstep(0.2, 0.7, y).mul(smoothstep(HG - 0.1, HG - 0.6, y));
  const mandR = (s, y) => { const dx = s.sub(wallPick(s, MCX)), dy = y.sub(MCY); return vec3(dx, dy, sqrt(dx.mul(dx).add(dy.mul(dy)).add(1e-6))); };
  const mandP = (s, y) => {
    const d = mandR(s, y), env = smoothstep(U.mr, U.mr.sub(0.4), d.z);
    const m = env.mul(cos(d.z.mul(wallPick(s, MKW)))).mul(cos(atan(d.y, d.x).mul(wallPick(s, PETW)).add(wallPick(s, PHW))));
    const fz = cos(s.mul(FKA)).mul(cos(y.mul(FQB))).sub(cos(s.mul(FKB)).mul(cos(y.mul(FQA)))).mul(0.5);
    return m.add(fz.mul(frE(y)).mul(U.frieze).mul(float(1).sub(env)));
  };
  const mandE = (s, y) => max(smoothstep(U.mr, U.mr.sub(0.4), mandR(s, y).z), frE(y).mul(U.frieze));
  // the guide's quiet zones, as a mask (dx = metres from the wall's centre): text ±1.6 m × 1.75–2.2 m, button ±0.9 m × 0.9–1.6 m
  // … as ONE calm pool per wall: a rounded form (superellipse 3.6 × 1.7 m round (0, 1.55 m)) that holds both, fading out over ~1 m
  // T-053 (ARTE r5): a soft radial ellipse (the superellipse read as a 4 × 2 m rectangle); text-box corners still ≈ 0.57 (luminance cap ≈ 0.15)
  const qzone = (dx, y) => { const ax = dx.div(2.0), ay = y.sub(1.8).div(1.2); return smoothstep(1.6, 0.8, sqrt(ax.mul(ax).add(ay.mul(ay)))); };
  // the metal's own slow swell (metres): five crossing waves 0.6–3 m long, periodic round the room, gently warped
  const AMB = [[1.9, 2.6, 0.5, 1.0, 0.0, 1.0], [1.2, -1.7, 0.8, 0.6, 1.7, -0.7], [0.8, 1.1, -1.1, 0.35, 3.1, 1.0], [3.1, 0.9, 0.35, 0.5, 4.4, -0.7], [0.55, -0.7, 1.6, 0.16, 5.2, 0.5]];
  const ambH = (s, y) => {
    const warp = sin(y.mul(1.3).add(s.mul(2 * Math.PI * 3 / PER)).add(U.time.mul(0.2))).mul(0.6);
    let h = float(0);
    for (const [ls, ly, w, a, ph, wk] of AMB) h = h.add(sin(s.mul(2 * Math.PI * Math.round(PER / ls) / PER).add(y.mul(2 * Math.PI / ly)).add(U.time.mul(w)).add(warp.mul(wk)).add(ph)).mul(a));
    return h.mul(0.011);
  };
  const NBIG = NW * 3, NPC = NW * 13;
  const SPV = [], SFV = []; for (let i = 0; i < NBIG; i++) { SPV.push(new THREE.Vector4(0, -9, 0, 0.1)); SFV.push(new THREE.Vector4()); }
  const uSP = uniformArray(SPV, 'vec4'), uSF = uniformArray(SFV, 'vec4');     // big spheres on the plate: (s, y, height off it, radius) · (flying 0..1, shown 0..1)
  const simTex = texture(sim[0].texture);
  const simFrag = Fn(() => {
    const q = uv();
    const at = (i, j) => simTex.sample(q.add(vec2(i * TX, j * TY)));
    const s = simTex.sample(q);
    const L = at(-1, 0), R = at(1, 0), Uu = at(0, 1), D = at(0, -1);
    const ul = at(-1, 1), ur = at(1, 1), dl = at(-1, -1), dr = at(1, -1);
    const h0 = s.x;
    const lap = L.x.add(R.x).add(Uu.x).add(D.x).mul(4).add(ul.x.add(ur.x).add(dl.x).add(dr.x)).sub(h0.mul(20)).div(6);
    const acc = U.c2.mul(lap).sub(h0.mul(1.5)).toVar();
    const aloc = sqrt(max(s.z.mul(2), 0));
    const hush = float(1).div(aloc.mul(aloc).div(0.05).add(1));
    acc.addAssign(U.visc.mul(L.y.add(R.y).add(Uu.y).add(D.y).sub(s.y.mul(4))));
    const p = q.mul(vec2(PER, HG));
    Loop(U.nH, ({ i }) => {
      const A = uHA.element(i), B = uHB.element(i);
      const qq = vec2(wrapd(p.x.sub(A.x)), p.y.sub(A.y)), r2 = dot(qq, qq);
      If(r2.lessThan(B.w.mul(B.w).mul(16)), () => {
      const g = exp(r2.negate().div(B.w.mul(B.w)));
      acc.addAssign(g.mul(A.z.mul(hush).mul(sin(A.w.add(B.z.mul(U.tau)))).add(U.wake.mul(dot(qq, B.xy)).div(B.w))));
      });
    });
    const reg = clamp(float(1).sub(aloc.div(U.modeCap)), 0, 1);
    Loop(U.nM, ({ i }) => {
      const M = uMA.element(i), Mb = uMB.element(i);
      acc.addAssign(reg.mul(M.z).mul(cos(M.x.mul(p.x).add(Mb.x))).mul(cos(M.y.mul(p.y))).mul(sin(M.w.mul(U.tau).add(Mb.y))));
    });

    const sponge = smoothstep(U.ceil.sub(0.15), U.ceil.add(0.45), p.y).mul(7);
    const v = s.y.add(U.dt.mul(acc.sub(U.gam.add(sponge).add(max(aloc.sub(0.4), 0).mul(4)).mul(s.y)))).toVar();
    If(U.kick.greaterThan(0.5), () => {
      Loop(U.nI, ({ i }) => {
        const I = uImp.element(i), qq = vec2(wrapd(p.x.sub(I.x)), p.y.sub(I.y)), r2 = dot(qq, qq), w2 = I.w.mul(I.w);
        v.addAssign(I.z.mul(exp(r2.negate().div(w2)).sub(exp(r2.negate().div(w2.mul(4))).mul(0.25))));
      });
      const dyl = p.y.sub(U.lineY), d2 = dyl.mul(dyl);
      v.addAssign(U.lineK.mul(exp(d2.negate().div(0.04)).sub(exp(d2.negate().div(0.16)).mul(0.5))));
    });
    const h = h0.add(U.dt.mul(v)).toVar();
    const kn = U.clip.mul(0.6), ah = abs(h);
    If(ah.greaterThan(kn), () => { h.assign(sign(h).mul(kn.add(U.clip.sub(kn).mul(tanh(ah.sub(kn).div(U.clip.sub(kn))))))); });
    return vec4(h, v, mix(s.z, h.mul(h), U.eavg), 1);
  });
  const simMat = new THREE.NodeMaterial(); simMat.fragmentNode = simFrag(); simMat.depthTest = false; simMat.depthWrite = false;
  const simQuad = new THREE.QuadMesh(simMat);

  // derived: (q, A, e, h), smoothed, filterable. A = sqrt(h² + (v/ω)²) the phase-free amplitude; q = mix(h, A, still)
  const derTex = texture(sim[0].texture);
  // A: the phase-free amplitude; when several frequencies ring at once (high resonance, bloom) the running rms, which cannot beat
  const derPrev = texture(der.texture), derCopyTex = texture(derB.texture);
  const derFrag = Fn(() => {
    const q = uv();
    const Q = (i, j) => { const s = derTex.sample(q.add(vec2(i * TX, j * TY))); const A = mix(sqrt(s.x.mul(s.x).add(s.y.mul(s.y).mul(U.iw.mul(U.iw)))), sqrt(max(s.z.mul(2), 0)), U.rmsK); const Ac = min(A, 0.75), qc = clamp(mix(s.x, Ac, U.still), -0.75, 0.75); return vec4(qc, Ac, s.z, qc); };
    const now = Q(0, 0).mul(0.5).add(Q(1, 0).add(Q(-1, 0)).add(Q(0, 1)).add(Q(0, -1)).mul(0.125));
    return mix(derPrev.sample(q), now, U.derA);          // a short temporal average when the room resonates: no per-frame shimmer
  });
  const derMat = new THREE.NodeMaterial(); derMat.fragmentNode = derFrag(); derMat.depthTest = false; derMat.depthWrite = false;
  const derQuad = new THREE.QuadMesh(derMat);
  const copyMat = new THREE.NodeMaterial(); copyMat.fragmentNode = derCopyTex.sample(uv()); copyMat.depthTest = false; copyMat.depthWrite = false;
  const copyQuad = new THREE.QuadMesh(copyMat);
  const field = texture(der.texture);
  const fieldUV = (s, y) => vec2(s.div(PER), clamp(y.div(HG), 0.002, 0.998));

  // ------------------------------------------------------------------ band function (ordered pixel-sorted runs)
  const NB = Math.round(PER / 0.045), BW = PER / NB, NBL = Math.round(PER / 0.85), BL = PER / NBL;
  const bandOf = (s) => {
    const c = floor(s.div(BW)), blk = floor(s.div(BL));
    const hb = hash12(vec2(c.sub(floor(c.div(NB)).mul(NB)), 7.0)), hk = hash12(vec2(blk.sub(floor(blk.div(NBL)).mul(NBL)), 3.0));
    const hk1 = hk.mul(0.94).add(0.06);                                 // threshold never below 0.06: at bandK 0 no block is active
    const act = smoothstep(hk1.sub(0.06), hk1, U.bandK.mul(0.32)).mul(step(0.3, hb));
    return vec3(act, hb, hk);
  };

  // ------------------------------------------------------------------ cells (the crown's opening, arrival and leaving)
  const NCX = Math.round(PER / 0.62), CS = PER / NCX;
  const voro = (s, y) => {
    const wx = sin(y.mul(1.9).add(s.mul(6.2832 * 11 / PER))).mul(0.32).add(sin(y.mul(4.3).sub(s.mul(6.2832 * 29 / PER))).mul(0.12));
    const wy = sin(s.mul(6.2832 * 17 / PER).add(y.mul(1.1))).mul(0.3).add(sin(s.mul(6.2832 * 41 / PER).sub(y.mul(2.7))).mul(0.1));
    const p = vec2(s.div(CS).add(wx), y.div(CS).add(wy)), ip = floor(p), fp = fract(p);
    const d1 = float(8).toVar(), d2 = float(8).toVar(), id = float(0).toVar(), cy = float(0).toVar();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = ip.add(vec2(i, j)), cx = c.x.sub(floor(c.x.div(NCX)).mul(NCX));
      const hx = hash12(vec2(cx, c.y)), hy = hash12(vec2(c.y.add(17.0), cx.add(5.0)));
      const o = vec2(i, j).add(vec2(hx, hy).mul(0.8).add(0.1)).sub(fp), dd = dot(o, o);
      If(dd.lessThan(d1), () => { d2.assign(d1); d1.assign(dd); id.assign(hash12(vec2(cx.add(31.0), c.y.mul(1.7)))); cy.assign(c.y.add(hy)); })
        .ElseIf(dd.lessThan(d2), () => { d2.assign(dd); });
    }
    return vec3(sqrt(d2).sub(sqrt(d1)).mul(CS), id, cy.mul(CS));
  };

  // ------------------------------------------------------------------ the plate (one grid mesh per wall)
  const plateMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const aF = attribute('aF', 'vec4'), aN = attribute('aN', 'vec3');
  plateMat.positionNode = Fn(() => {
    const d = field.sample(fieldUV(wrapS(aF.x), aF.y)).level(0);
    const fall = U.leave.sub(0.15).max(0).mul(1.6);
    const edge = smoothstep(0.0, 0.4, attribute('aE', 'float'));          // no relief at the corners: the two walls' planes displace differently
    return positionLocal.add(aN.mul(clamp(d.w, -0.6, 0.6).mul(U.relief).mul(float(1).sub(U.leave)).mul(edge))).sub(vec3(0, fall.mul(fall).mul(0.0), 0));
  })();
  const vF = varying(aF), vN = varying(aN);
  plateMat.colorNode = Fn(() => {
    If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
    const s = wrapS(vF.x), y = vF.y, dc = vF.z;
    // ordered bands: inside an active band the field is read at the top of a run (a pixel-sorted streak) and graded down
    const bd = bandOf(s), act = bd.x, hb = bd.y, hk = bd.z;
    const Lr = hb.mul(0.8).add(0.4).mul(U.bandK.mul(0.5).add(0.5)), off = fract(hb.mul(7.3));
    const yT = floor(y.div(Lr).add(off)).add(1).sub(off).mul(Lr), tr = clamp(yT.sub(y).div(Lr), 0, 1);
    const yS = y;
    const sS = s;
    const q0 = fieldUV(sS, yS);
    const D = field.sample(q0), Dr = field.sample(q0.add(vec2(TX, 0))), Dl = field.sample(q0.sub(vec2(TX, 0)));
    const Du = field.sample(q0.add(vec2(0, TY))), Dd = field.sample(q0.sub(vec2(0, TY)));
    const gq = vec2(Dr.x.sub(Dl.x), Du.x.sub(Dd.x)).div(2 * DX), gA = vec2(Dr.y.sub(Dl.y), Du.y.sub(Dd.y)).div(2 * DX);
    const ghF = vec2(Dr.w.sub(Dl.w), Du.w.sub(Dd.w)).div(2 * DX);
    const mE = 0.03, mP0 = mandP(s, y), mBr = cos(U.time.mul(1.7)).mul(0.25).add(0.75).mul(U.mandA).mul(0.5);
    const aE = 0.04, a0 = ambH(s, y);
    const gAmb = vec2(ambH(s.add(aE), y).sub(a0), ambH(s, y.add(aE)).sub(a0)).div(aE);
    const gh = ghF.add(vec2(mandP(s.add(mE), y).sub(mP0), mandP(s, y.add(mE)).sub(mP0)).div(mE).mul(mBr)).add(gAmb.mul(U.swellA));
    const hb0 = D.x, Aa = D.y;
    const gold = mix(GOLD, GOLD2, U.Ve), hot = mix(HOT, WHITE, U.Ve);
    const lvl = min(abs(hb0).div(0.3), 1);
    const col = vec3(0).toVar();
    // FES-F — LIQUID METAL IN FIESTA: a clean mirror of white gold that reflects the square's verbena (garlands of warm bulbs under a
    // pale-gold sky, lilac below: envT). Its relief — the group's waves over a slow swell of its own — bends the reflection: the bulbs
    // stretch into dancing rosaries of light; crests take gold, troughs lilac; the relief is read by the light sliding on it.
    {
      // a RADIAL normal (towards the eye's axis), not the wall's: the mirror is continuous round the corners
      const Nw = normalize(vec3(eye.x, 0, eye.z).sub(vec3(positionWorld.x, 0, positionWorld.z))), Tw = normalize(cross(vec3(0, 1, 0), Nw)), Bw = vec3(0, 1, 0);
      const Np = normalize(Nw.sub(Tw.mul(gh.x.mul(U.bend))).sub(Bw.mul(gh.y.mul(U.bend))));
      const Vv = normalize(cameraPosition.sub(positionWorld)), ndv2 = abs(dot(Np, Vv)), Rr = reflect(Vv.negate(), Np);
      const envC = envT(Rr, 0.1);
      const fr = pow(float(1).sub(ndv2), 4).mul(0.45).add(0.55);
      const hgt = hb0.add(a0.mul(U.swellA).mul(2.5)).add(mP0.mul(mBr).mul(0.2));
      const crest = smoothstep(0.02, 0.3, hgt), trough = smoothstep(-0.02, -0.3, hgt);
      const metal = mix(vec3(0.95, 0.96, 1.0), vec3(1.0, 0.84, 0.56), U.Ve.mul(0.6).add(0.25));
      const chromeC = envC.mul(metal).mul(fr).mul(mix(vec3(1), vec3(1.0, 0.76, 0.4), crest.mul(0.7))).mul(mix(vec3(1), vec3(0.628, 0.61, 0.736), trough.mul(0.7))).mul(float(1).sub(trough.mul(0.3))).toVar();
      chromeC.addAssign(vec3(1.0, 0.84, 0.58).mul(clamp(gh.y.mul(0.5).add(gh.x.mul(0.15)), 0, 1.5)).mul(U.Ve.mul(0.1).add(0.05)));   // slopes that face the sky catch it
      // where the figure stands the metal is deeper, redder gold: the sand's lines of light read on it
      chromeC.assign(mix(chromeC, chromeC.mul(vec3(1.0, 0.6, 0.26)).mul(0.75), mandE(s, y).mul(U.mandA).mul(0.6)));
      // the spheres stand on it: a soft contact shadow under each (it lets go as the sphere flies)
      const shade = float(0).toVar();
      Loop(NBIG, ({ i }) => {
        const sp = uSP.element(i), qq = vec2(wrapd(s.sub(sp.x)), y.sub(sp.y).add(sp.w.mul(0.35)));
        shade.assign(max(shade, exp(dot(qq, qq).negate().div(sp.w.mul(sp.w).mul(1.5))).div(sp.z.mul(5.0).add(1)).mul(uSF.element(i).y)));
      });
      col.addAssign(chromeC.mul(float(1).sub(shade.mul(0.6))).mul(U.chrome).mul(U.lvl).mul(U.gain));
    }
    col.addAssign(gold.mul(smoothstep(0.25, 1.0, lvl)).mul(0.07).mul(U.bloom));
    // AD 25-11: the golden veins GROW FROM THE TOWER — from the foot of each wall's castell (its centre, at the floor) outwards and up,
    // a gold edge on the growing front; beyond it the plate is still night
    {
      const rr = length(vec2(dc, y.mul(1.15)));
      const grownM = smoothstep(U.grow, U.grow.sub(1.4), rr);
      col.mulAssign(grownM.mul(0.94).add(0.06));
      const edgeF = exp(rr.sub(U.grow).div(0.3).pow(2).negate()).mul(smoothstep(0.0, 1.0, U.grow)).mul(float(1).sub(smoothstep(9.0, 12.0, U.grow)));
      col.addAssign(GOLD2.mul(edgeF).mul(lvl.mul(0.6).add(0.12)).mul(0.5));
    }
    // light climbs with the resonance
    col.mulAssign(smoothstep(U.ceil.add(1.3), U.ceil.sub(0.9), y).mul(0.88).add(0.12).mul(smoothstep(0.0, 0.2, y)));
    // bands: graded runs, gold / pearl / a rare iridescent hue
    const kb = fract(hk.mul(13.7));                                       // one colour per block: white-gold, pearl, rarely rose or ice
    const pal = select(kb.lessThan(0.55), vec3(1.0, 0.72, 0.38), select(kb.lessThan(0.85), vec3(1.0, 0.84, 0.62), select(kb.lessThan(0.93), ROSE, vec3(0.9, 0.82, 0.7))));   // warm golds, rarely rose: never grey
    const runG = mix(float(1.1), float(0.55), pow(tr, 0.8));
    col.assign(mix(col, col.mul(pal).mul(runG).mul(1.2), act));   // a band tints and grades the local lines: never a flat slab   // a band carries the smooth amplitude, not the thin lines: no strobing runs
    // hands: a warm light under each palm, a flash when it lands
    Loop(U.nHU, ({ i }) => {
      const h = uHU.element(i), qq = vec2(wrapd(s.sub(h.x)), y.sub(h.y)), r2 = dot(qq, qq);
      col.addAssign(vec3(1.0, 0.78, 0.48).mul(h.z).mul(exp(r2.negate().div(0.003)).mul(0.5).add(exp(r2.negate().div(0.04)).mul(0.05))));
      col.addAssign(vec3(1.0, 0.9, 0.72).mul(h.w).mul(exp(r2.negate().div(0.005)).mul(1.0).add(exp(r2.negate().div(0.08)).mul(0.14))));
      // the solo bloom: a resting hand slowly opens a rosette of fine gold round itself (six petals, turning very slowly)
      const hv = uHV.element(i), age = hv.x, k = hv.y.mul(U.solo);
      If(k.greaterThan(0.001).and(r2.lessThan(1.2)), () => {
        const rr = sqrt(r2.add(1e-6)), th = atan(qq.y, qq.x);
        const R0 = float(0.1).add(float(0.62).mul(float(1).sub(exp(age.mul(-0.35)))));
        const pet = cos(th.mul(6).add(age.mul(0.12))).mul(0.5).add(0.5), pet2 = cos(th.mul(12).sub(age.mul(0.07))).mul(0.5).add(0.5);
        const Rp = R0.mul(pet.mul(0.18).add(0.82)), Rq = R0.mul(0.58).mul(pet2.mul(0.12).add(0.88));
        const w2 = U.lineW.mul(U.lineW).mul(1.2);
        const l1 = exp(rr.sub(Rp).mul(rr.sub(Rp)).negate().div(w2)), l2 = exp(rr.sub(Rq).mul(rr.sub(Rq)).negate().div(w2)).mul(0.55);
        const veil = exp(rr.sub(Rp).mul(rr.sub(Rp)).negate().div(0.006)).mul(0.035);
        const grow = smoothstep(0.25, 1.6, age);
        col.addAssign(mix(GOLD2, HOT, pet).mul(l1.add(l2).add(veil)).mul(k).mul(grow).mul(0.9));
      });
    });
    // the peak owns its moment: the field, its bands and the hands' light step back to ~30 % while it lasts
    col.mulAssign(U.duck);
    // the crown: the line of gold round the top, its heads and their meeting, and the night opening cell by cell into light
    const cell = vec3(1, 0.5, 0).toVar();
    If(U.cells.greaterThan(0.5), () => { cell.assign(voro(s, y)); });
    const cOn = U.crownOn;
    If(cOn.greaterThan(0.001), () => {
      const dy = y.sub(HG - 0.16), dx = abs(wrapd(s.sub(X0)));
      const vis = float(1).sub(smoothstep(U.front.sub(0.3), U.front.add(0.04), dx));
      col.addAssign(GOLD2.mul(exp(dy.mul(dy).negate().div(2 * 0.008 * 0.008)).mul(2.0).add(exp(dy.mul(dy).negate().div(2 * 0.15 * 0.15)).mul(0.12)).mul(vis).mul(U.ring)));
      const hd = dx.sub(U.front), r2 = hd.mul(hd).add(dy.mul(dy));
      col.addAssign(WHITE.mul(U.head.mul(exp(r2.negate().div(2 * 0.03 * 0.03)).mul(8).add(exp(r2.negate().div(2 * 0.3 * 0.3)).mul(0.3)))));
      const fx = wrapd(s.sub(X0 + PER / 2)), f2 = fx.mul(fx).add(dy.mul(dy));
      col.addAssign(WHITE.mul(U.flash.mul(exp(f2.negate().div(2 * 0.06 * 0.06)).mul(6).add(exp(f2.negate().div(2 * 0.9 * 0.9)).mul(0.5)))));
      const delay = clamp(float(HG).sub(cell.z).div(HG), 0, 1).mul(0.72).add(cell.y.mul(0.22));
      const op = clamp(U.open.sub(delay).div(0.1), 0, 1);
      const cw = cell.y.mul(cell.y).mul(0.022).add(0.006), keep = step(0.72, cell.y);       // a few cracks stay as fine threads
      const crack = exp(cell.x.mul(cell.x).negate().div(cw.mul(cw))).mul(smoothstep(0.0, 0.25, op)).mul(float(1.3).sub(op.mul(float(1.25).sub(keep.mul(0.35)))))
        .mul(fract(cell.y.mul(7.1)).mul(0.8).add(0.4));
      const band = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.45));
      const leak = exp(cell.x.negate().div(cell.y.mul(0.05).add(0.012)));                    // light leaking in from the cracks
      const inner = mix(vec3(0.9, 0.42, 0.1), WHITE, smoothstep(0.7, 1.0, y.div(HG))).mul(leak.mul(0.3).add(pow(y.div(HG), 3.0).mul(0.08)).add(0.004))
        .mul(op).mul(U.swell).mul(band).mul(cell.y.mul(0.7).add(0.3));
      col.addAssign(GOLD2.mul(crack).mul(1.3).mul(U.swell.mul(0.6).add(0.4)).add(inner).mul(cOn));
      // (the crown icons are gone: T-033 r2)
      // ... and for the first time the whole room fills with light: a warm wash, brighter high up, the guide band spared
      const bandF = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.5));
      // gold with depth: castell red at the base, gold in the middle, warm white high up; the cells' edges catch the light, the plate's relief too
      const yh = y.div(HG);
      const fillC = mix(mix(vec3(0.42, 0.06, 0.03), vec3(1.0, 0.52, 0.16), smoothstep(0.05, 0.45, yh)), vec3(1.0, 0.76, 0.44), smoothstep(0.55, 1.0, yh));   // gold, not beige
      const facet = leak.mul(1.1).add(0.35).mul(smoothstep(0.02, 0.3, Aa).mul(0.5).add(0.75));
      col.addAssign(fillC.mul(pow(yh, 1.5).mul(0.34).add(0.03)).mul(facet).mul(U.fill).mul(bandF).mul(cOn));
    });
    // the group's peak: a crack of light runs both ways round the room from where the hands are, meets opposite, and the plate
    // opens from it like the crown (cells, light leaking from the cracks), then closes again
    If(U.peakEnv.greaterThan(0.001), () => {
      const yC = float(2.15).add(sin(s.mul(6.2832 * 5 / PER).add(0.7)).mul(0.16)).add(sin(s.mul(6.2832 * 23 / PER).add(2.1)).mul(0.05)).add(sin(s.mul(6.2832 * 61 / PER)).mul(0.018));
      const dyc = y.sub(yC), dx = abs(wrapd(s.sub(U.peakS0)));
      const reached = float(1).sub(smoothstep(U.peakFront.sub(0.4), U.peakFront.add(0.02), dx));
      const headD = dx.sub(U.peakFront), hr2 = headD.mul(headD).add(dyc.mul(dyc));
      const crackL = exp(dyc.mul(dyc).negate().div(2 * 0.007 * 0.007)).mul(1.6).add(exp(dyc.mul(dyc).negate().div(2 * 0.09 * 0.09)).mul(0.06));
      col.addAssign(HOT.mul(crackL.mul(reached).add(exp(hr2.negate().div(2 * 0.05 * 0.05)).mul(2.5).mul(step(dx, U.peakFront.add(0.1))).mul(step(U.peakFront, PER / 2)))).mul(U.peakEnv));
      const delay = abs(dyc).mul(0.75).add(cell.y.mul(0.3)).add(dx.div(PER).mul(0.6));   // cells open only near the crack (≤ ~0,6 m above and below)
      const op = clamp(U.peakOpen.sub(delay).div(0.12), 0, 1);
      const cw = cell.y.mul(cell.y).mul(0.02).add(0.005);
      const crk = exp(cell.x.mul(cell.x).negate().div(cw.mul(cw))).mul(smoothstep(0.0, 0.3, op)).mul(float(1.1).sub(op.mul(0.85))).mul(fract(cell.y.mul(7.1)).mul(0.8).add(0.4));
      const leak = exp(cell.x.negate().div(cell.y.mul(0.04).add(0.01))).mul(0.12).mul(op);
      const band = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.5));
      col.addAssign(GOLD2.mul(crk.mul(0.6)).add(mix(vec3(0.9, 0.42, 0.1), WHITE, smoothstep(1.6, 2.6, y)).mul(leak)).mul(U.peakEnv).mul(band));
    });
    // the room blooms once: a warm wash rises from the floor up all four walls (a bright rim at its front), holds, settles
    If(U.washK.greaterThan(0.001), () => {
      const below = smoothstep(U.washY.add(0.05), U.washY.sub(0.6), y);
      const dyw = y.sub(U.washY);
      const bandW = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.45));
      const yh = y.div(HG);
      const warm = mix(mix(vec3(0.42, 0.06, 0.03), vec3(1.0, 0.52, 0.16), smoothstep(0.05, 0.45, yh)), vec3(1.0, 0.76, 0.44), smoothstep(0.55, 1.0, yh));   // gold, not beige
      const figure = smoothstep(0.02, 0.3, Aa).mul(0.7).add(0.6);                 // the organised figure catches the light
      col.addAssign(warm.mul(below.mul(pow(yh, 1.3).mul(0.34).add(0.05)).mul(figure).add(exp(dyw.mul(dyw).negate().div(0.012)).mul(0.5).mul(step(U.washY, HG + 0.2)))).mul(U.washK).mul(bandW));
    });
    // arrival: the plate opens cell by cell; leaving: it goes dark cell by cell (a last glint on the cracks)
    // arrival: cells light from the top down as the gold fragments land; leaving: every cell goes at once (a little scatter), all gone
    // by leave 0.6, and the whole plate fades with them
    // STEP 7 (T-044) — the ECHO FRONTS: each wave leaves its wall as a front of gold that runs both ways round the room and meets on the
    // opposite wall after 3 s (seen coming); a returned one (gen ≥ 1) is wider and brighter; the room's own return (ghost) dimmer
    Loop(U.nFr, ({ i }) => {
      const F4 = uFR.element(i), dsx = abs(wrapd(s.sub(F4.x))), dd = dsx.sub(F4.y);
      const wdt = F4.z.mul(0.1).add(0.12), core = exp(dd.mul(dd).negate().div(wdt.mul(wdt)));
      const wake = exp(min(dd, 0.0).div(F4.z.mul(0.3).add(0.5))).mul(step(dd, 0.0)).mul(0.25);   // a trail behind the front
      const vert = smoothstep(0.1, 0.5, y).mul(smoothstep(HG - 0.05, HG - 0.6, y));
      // T-047 (#21): readable over the gold plate at any resonance — a dark TROUGH round the crest (the plate dips to ~35 %), then a crest
      // that goes to white-hot at its heart
      const tw = wdt.mul(3.2), trough = exp(dd.mul(dd).negate().div(tw.mul(tw))).mul(vert).mul(F4.w).mul(0.65);
      col.mulAssign(float(1).sub(trough));
      col.addAssign(mix(GOLD2, HOT, min(F4.z.mul(0.3).add(0.35), 1)).mul(core.mul(1.6).add(wake)).mul(vert).mul(F4.z.mul(0.7).add(1.0)).mul(F4.w));
      col.addAssign(vec3(1.0, 0.97, 0.9).mul(pow(core, 4.0)).mul(vert).mul(F4.w).mul(1.2));
    });
    // the CALL (as Brasa's, in gold): on the four walls a ring contracts onto the button's heart (1.25 m) and arrives on the TOK; tok, tok pulse it
    const callC = vec3(0).toVar();   // (added after the quiet pool's compressor: a thin line of gold through the pool, the guide still readable)
    If(U.callOn.greaterThan(0.001), () => {
      const ct = U.callT, gp = U.callGap, k = clamp(ct.negate().div(gp.mul(2)), 0, 1), live = step(gp.mul(-2), ct).mul(step(ct, 0.0));
      const rx = k.mul(2.4).add(0.3), ry = k.mul(1.0).add(0.3), dyc = y.sub(1.25);
      const ex_ = dc.div(rx), ey_ = dyc.div(ry), e = sqrt(ex_.mul(ex_).add(ey_.mul(ey_))), rd = e.sub(1).mul(rx).div(0.05), ring = exp(rd.mul(rd).negate());
      const p1 = ct.add(gp.mul(2)).div(0.09), p2 = ct.add(gp).div(0.09), tok = exp(p1.mul(p1).negate()).add(exp(p2.mul(p2).negate()));
      callC.addAssign(GOLD2.mul(ring).mul(float(0.25).add(float(1).sub(k).mul(0.4)).add(tok.mul(0.6))).mul(live).mul(U.callOn));
      const tk = max(ct, 0.0), land = exp(tk.mul(-3.0)).mul(step(0.0, ct)).mul(step(ct, 1.0)), rr = sqrt(dc.mul(dc).add(dyc.mul(dyc))), rl = rr.sub(tk.mul(3.0)).div(0.06);
      callC.addAssign(HOT.mul(exp(rl.mul(rl).negate())).mul(land).mul(0.6).mul(U.callOn));   // the TOK: a ring of gold opens from the heart
    });
    // the guide's quiet zones (text, button): the light is SHAPED round them — inside, the metal keeps its relief in a low key (≤ 35 %)
    const qz = qzone(dc, y).mul(U.quiet), lumQ = dot(col, vec3(0.2126, 0.7152, 0.0722));
    const lmQ = U.qmax.div(pow(qz.max(0.02), 3.0));                       // the ceiling falls smoothly towards the zone: a pool of calm, not a box
    col.assign(col.mul(min(float(1), lmQ.div(lumQ.add(1e-4)))).mul(mix(vec3(1), vec3(1.0, 0.8, 0.62), qz.mul(qz))));   // … of deep warm metal (T-053 r5: was lilac)
    col.addAssign(callC);
    const app = clamp(U.arrive.sub(float(HG).sub(y).div(HG).mul(0.45)).sub(cell.y.mul(0.15)).sub(0.25).div(0.18), 0, 1);
    const gone = clamp(U.leave.sub(cell.y.mul(0.3).add(0.06)).div(0.16), 0, 1).max(smoothstep(0.3, 0.6, U.leave));
    const edgeG = exp(cell.x.mul(cell.x).negate().div(0.0002)).mul(app.mul(float(1).sub(app)).add(gone.mul(float(1).sub(gone))).mul(4)).mul(GOLD2).mul(0.25);
    return vec4(col.mul(app).mul(float(1).sub(gone)).add(edgeG), 1);
  })();

  const _v = new THREE.Vector3();
  walls.forEach((w, wi) => {
    const nx = Math.max(40, Math.round(w.width / 0.03)), ny = Math.max(20, Math.round(w.height / 0.035));
    const m = 0.03, pos = [], af = [], an = [], ae = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = -m + (1 + 2 * m) * (i / nx), v = -0.03 + 1.06 * (j / ny);
      room.wallPoint(wi, u, v, _v); _v.sub(eye).multiplyScalar(K[wi]).add(eye);
      pos.push(_v.x, _v.y, _v.z);
      af.push(cum[wi] + u * w.width, v * w.height, (u - 0.5) * w.width, wi);
      an.push(w.normal.x, w.normal.y, w.normal.z);
      ae.push(Math.max(0, Math.min(u, 1 - u)) * w.width);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(af, 4));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(an, 3));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(ae, 1));
    g.setIndex(idx); g.computeBoundingSphere(); g.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(g, plateMat); mesh.renderOrder = 1;
    object.add(mesh);
  });


  // ------------------------------------------------------------------ the guide's quiet zones (director's rule, 24-11)
  // At each wall's centre, text ±1.6 m × 1.75–2.2 m and button ±0.9 m × 0.9–1.6 m: whatever the world shows behind them is veiled
  // (a black layer on the wall plane, soft edges 0.2 m) by U.quiet (0..1), so nothing there reads above ~35 % luminance.
  const _vq = new THREE.Vector3();
  const quietMesh = (() => {
    const pos = [], at = [], idx = [];
    walls.forEach((w, i) => {
      const o = pos.length / 3;
      for (const [uu, vv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        room.wallPoint(i, uu, vv, _vq).addScaledVector(w.normal, -0.003);
        pos.push(_vq.x, _vq.y, _vq.z); at.push((uu - 0.5) * w.width, vv * w.height);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aQ', new THREE.Float32BufferAttribute(at, 2)); g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide });
    const q = varying(attribute('aQ', 'vec2'));
    m.colorNode = vec3(0.006, 0.0037, 0.0018);   // T-053 r5: #120C06, warm dark
    m.opacityNode = qzone(q.x, q.y).mul(U.veil).mul(0.6);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4;
    return mesh;
  })();
  object.add(quietMesh);

  // ------------------------------------------------------------------ plate point in the world (TSL)
  const platePoint = (s, y, off) => {
    const base = vec3(0).toVar(), nrm = vec3(0).toVar(), kk = float(1).toVar(), dd = float(1).toVar();
    for (let w = 0; w < NW; w++) {
      const W = walls[w];
      If(s.greaterThanEqual(cum[w] - 1e-4), () => {
        const t = s.sub(cum[w]);
        base.assign(vec3(t.mul(W.right.x).add(W.pa.x), y, t.mul(W.right.z).add(W.pa.z)));
        nrm.assign(vec3(W.normal.x, W.normal.y, W.normal.z)); kk.assign(K[w]); dd.assign(dW[w]);
      });
    }
    const E = vec3(eye.x, eye.y, eye.z);
    return { p: E.add(base.sub(E).mul(kk)).add(nrm.mul(off)), n: nrm, d: dd };
  };
  // where a night fragment floats (arrival), analytic so the shards and their particles agree
  const scatterPos = (j, t) => {
    const a = hash12(vec2(j, 1.3)).mul(6.2832).add(t.mul(0.02)), R = hash12(vec2(j, 2.7)).mul(6).add(5.5), y = hash12(vec2(j, 4.1)).mul(4.4).add(0.3);
    return vec3(cos(a).mul(R), y.add(sin(t.mul(0.3).add(j)).mul(0.15)), sin(a).mul(R));
  };

  // ------------------------------------------------------------------ the sand (GPU compute)
  const SEED = new Float32Array(NP * 4), S0 = new Float32Array(NP * 4);
  { const r = rng(23); for (let i = 0; i < NP; i++) { for (let k = 0; k < 4; k++) SEED[i * 4 + k] = r(); S0[i * 4] = r() * PER; S0[i * 4 + 1] = 0.03 + r() * (HG - 0.06); } }
  const bSeed = instancedArray(SEED, 'vec4').setPBO(true).toReadOnly();
  const bS = instancedArray(S0, 'vec4');               // s, y, vs, vy
  const bX = instancedArray(NP, 'vec4');               // offset along the normal (- = deeper), its velocity, heat, -
  const bP = instancedArray(NP, 'vec4');               // world position, size
  const bC = instancedArray(NP, 'vec4');               // radiance, stretch
  const sandStep = Fn(() => {
    const sd = bSeed.element(instanceIndex), st = bS.element(instanceIndex).toVar(), x = bX.element(instanceIndex).toVar();
    const dt = U.dt.mul(float(1).sub(U.freeze));
    const s = st.x, y = st.y;
    const q = fieldUV(s, y);
    const D = field.sample(q).level(0), Dx = field.sample(q.add(vec2(TX, 0))).level(0), Dy = field.sample(q.add(vec2(0, TY))).level(0);
    const mP = mandP(s, y), mAx = abs(mandP(s.add(0.02), y)), mAy = abs(mandP(s, y.add(0.02))), mA = abs(mP);
    const A = D.y.add(mA.mul(U.mandA).mul(0.3)), gA = vec2(Dx.y.sub(D.y), Dy.y.sub(D.y)).div(DX).add(vec2(mAx.sub(mA), mAy.sub(mA)).div(0.02).mul(U.mandA).mul(0.3));
    const r1 = hash13(vec3(sd.x.mul(997), sd.y.mul(613), U.frame)), r2 = hash13(vec3(sd.z.mul(911), U.frame.add(17), sd.w.mul(577)));
    const jit = vec2(r1.sub(0.5), r2.sub(0.5));
    const rainP = U.rain.mul(step(sd.w, 0.09));                  // only ~9 % of the grains become the rain of gold: drops, not noise
    const sandW = float(1).sub(rainP);
    // sand: hop where it vibrates, slide down the amplitude towards the nodes
    const acc = gA.div(length(gA).add(1.5)).mul(-4.5).mul(U.sand.mul(1.5).add(0.6)).add(jit.mul(A.mul(25).add(0.9))).sub(st.zw.mul(4.0)).mul(sandW);   // a bounded drift to the nodes and a steady diffusion: lines of sand, never a solid bar
    // rain: fall slowly, drift, hang while the breath is held
    const fallV = sd.x.mul(0.25).add(0.18).mul(float(1).sub(U.hold));
    const rainA = vec2(sin(U.time.mul(0.4).add(sd.y.mul(40))).mul(0.05), fallV.negate()).sub(st.zw).mul(2.0);
    const vel = st.zw.add(acc.add(rainA.mul(rainP)).mul(dt)).toVar();
    const ns = wrapS(s.add(vel.x.mul(dt))), ny = y.add(vel.y.mul(dt)).toVar();
    If(ny.lessThan(0.02), () => {
      If(U.respawn.greaterThan(0.5).and(rainP.greaterThan(0.5)), () => { ny.assign(float(HG + 0.15).add(sd.z.mul(0.6))); }).Else(() => { ny.assign(0.02); vel.y.assign(abs(vel.y).mul(0.3)); });
    });
    If(ny.greaterThan(HG - 0.02).and(rainP.lessThan(0.5)), () => { ny.assign(float(HG - 0.08).sub(sd.z.mul(0.5))); vel.y.assign(abs(vel.y).negate().mul(0.3)); });
    // depth: rain lives in a deep volume behind the plate; sand lies on it
    // the trail: grains under a flying sphere are swept up to it, glow, and settle back slowly
    const trail = float(0).toVar(), lift = float(0).toVar();
    Loop(NBIG, ({ i }) => {
      const sp = uSP.element(i), qq = vec2(wrapd(s.sub(sp.x)), y.sub(sp.y)), g = exp(dot(qq, qq).negate().div(sp.w.mul(sp.w).mul(1.6))).mul(uSF.element(i).x);
      trail.addAssign(g); lift.assign(max(lift, g.mul(sp.z.add(sp.w.mul(sd.x)))));
    });
    const tz = mix(lift, sd.z.mul(2.6).add(0.15).negate(), rainP);
    const nz = x.x.add(tz.sub(x.x).mul(min(dt.mul(select(tz.greaterThan(x.x), float(14.0), float(1.1))), 1)));
    const heat = x.z.mul(exp(dt.mul(-1.2))).add(A.mul(dt).mul(3)).toVar();
    // hands warm the sand near them
    heat.assign(min(heat, 2));
    bS.element(instanceIndex).assign(vec4(ns, ny, vel));
    bX.element(instanceIndex).assign(vec4(nz, 0, heat, 0));

    // ---- where it is seen
    const hop = A.mul(0.05).mul(sin(U.time.mul(sd.y.mul(1.5).add(1.5)).add(sd.x.mul(40))).mul(0.5).add(0.5)).mul(sandW);   // a slow, small lift (was a fast hop: per-frame speckle)
    const pp = platePoint(ns, ny, D.w.mul(U.relief).mul(sandW).add(hop).add(nz));
    const pos = pp.p.toVar();
    // arrival: from the night fragments
    const j = floor(sd.w.mul(NSH));
    const b = hash12(vec2(j, 9.1)).mul(0.45).add(0.1);
    const k = smoothstep(b, b.add(0.35), U.arrive);
    const fromTop = pp.p.add(vec3(sd.x.sub(0.5).mul(0.6), sd.y.mul(3.0).add(2.6), sd.z.sub(0.5).mul(0.6))).sub(pp.n.mul(sd.z.mul(1.5).add(0.5)));
    pos.assign(mix(fromTop, pos, k.mul(k).mul(float(3).sub(k.mul(2)))));
    const burst = smoothstep(b.sub(0.03), b, U.arrive).mul(float(1).sub(k));
    // leaving: a held moment, then a slow fall of gold
    const tau = max(U.leave.sub(0.06).sub(sd.x.mul(0.3)), 0).mul(5.0);
    pos.subAssign(vec3(0, tau.mul(tau).mul(sd.y.mul(0.5).add(0.12)).add(tau.mul(sd.z.mul(0.3))), 0));   // each grain its own start and fall: no sheet
    pos.subAssign(pp.n.mul(tau.mul(0.15)));
    const fadeL = float(1).sub(smoothstep(0.3, 0.7, U.leave));
    // light
    const bd = bandOf(ns), str = bd.x.mul(U.bandK).mul(sd.y.mul(8).add(4));
    const qzs = qzone(s.sub(wallPick(s, WCX)), ny).mul(U.quiet);
    const glow = float(0.05).add(smoothstep(0.22, 0.0, mA).mul(mandE(s, y)).mul(U.mandA).mul(float(4.5).sub(U.frieze.mul(2.6)))).add(A.mul(0.6)).add(heat.mul(0.14)).add(trail.mul(float(3.0).mul(float(1).sub(U.crownOn)))).mul(U.sandGlow).mul(smoothstep(U.ceil.add(1.0), U.ceil.sub(0.6), ny)).mul(float(1).sub(U.fill.mul(U.crownOn).mul(0.75))).mul(float(1).sub(qzs.mul(qzs).mul(0.9)));
    const c = mix(mix(vec3(1.0, 0.58, 0.18), vec3(1.0, 0.7, 0.34), U.Ve), vec3(1.0, 0.88, 0.7), sd.z.mul(0.2)).mul(glow).mul(sandW)
      .add(mix(GOLD2, WHITE, sd.y).mul(rainP).mul(sd.x.mul(2.5).add(1.0)).mul(0.5))   // T-053 r5: the crown's rain at half
      .add(GOLD2.mul(burst.mul(3))).mul(fadeL).mul(step(sd.y, U.sandAmt)).mul(float(1).sub(qzs.mul(qzs).mul(rainP).mul(0.85)));
    const toP = pos.sub(vec3(eye.x, eye.y, eye.z)), dperp = dot(toP, pp.n.negate()).max(0.5);
    const pix = dperp.mul(pxM).div(pp.d);
    const Dm = max(pix.mul(1.6), float(0.004).add(sd.x.mul(0.004)));
    const spx = Dm.div(pix);
    const E = c.div(spx.mul(spx)).mul(float(1).add(rainP.mul(1.5)));
    const inside = abs(pos.x).lessThan(Math.abs(walls[1 % NW].centre.x) - 0.02).and(abs(pos.z).lessThan(Math.abs(walls[0].centre.z) - 0.02));
    bP.element(instanceIndex).assign(vec4(pos, select(inside, float(0), Dm)));
    bC.element(instanceIndex).assign(vec4(E, str));   // T-053 r5: round grains (the rain's vertical streak read as noise)
  });
  const sandCompute = sandStep().compute(NP);
  const sm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pA = bP.toAttribute(), cA = bC.toAttribute();
  sm.positionNode = pA.xyz;
  sm.scaleNode = vec2(pA.w, pA.w.mul(cA.w.add(1)));
  const vCol = varying(cA.xyz.div(cA.w.add(1)));
  sm.colorNode = Fn(() => { const r = length(uv().sub(0.5)).mul(2.0); return vec4(vCol.mul(exp(r.mul(r).mul(-4.5))), 1); })();
  const sand = new THREE.Sprite(sm); sand.count = NP; sand.frustumCulled = false; sand.renderOrder = 2;
  object.add(sand);
  // ---- AD#8: FESTA IN THE SQUARE — when the host shows the plaza with this part, the plate world goes and the same wave field draws
  // GOLD RIPPLES ON THE WET PAVING: each wall's field (perimeter s × height y) is laid on the floor behind that wall (distance back ×
  // 0.5 → field height), contour lines of the wave in gold with a soft glow, fading with distance; additive over the plaza's floor.
  const floorLayer = new THREE.Group(); floorLayer.name = 'festa:floor'; object.add(floorLayer); floorLayer.visible = false;
  {
    const P_OR = vec3(...palLin('or')), P_ORC = vec3(...palLin('or-clar'));
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const vSD = varying(attribute('aSD', 'vec2'));
    fm.colorNode = Fn(() => {
      const s = wrapS(vSD.x), d = vSD.y, q = fieldUV(s, clamp(d.mul(0.5).add(0.15), 0.0, HG));
      const D = field.sample(q), h = D.x;
      const lines = exp(fract(h.mul(7.0)).sub(0.5).mul(fract(h.mul(7.0)).sub(0.5)).div(-0.012)).mul(smoothstep(0.015, 0.12, abs(h)));
      const glow = smoothstep(0.02, 0.5, abs(h)).mul(0.35);
      const fade = smoothstep(0.0, 0.4, d).mul(float(1).sub(smoothstep(6.0, 11.0, d)));
      return vec4(mix(P_OR, P_ORC, lines).mul(lines.mul(0.9).add(glow)).mul(fade).mul(U.arrive).mul(float(1).sub(U.leave)), 1);
    })();
    const _p = new THREE.Vector3();
    walls.forEach((w, wi) => {
      const nu = Math.max(30, Math.round(w.width / 0.12)), nd = 60, pos = [], sd = [], idx = [];
      for (let j = 0; j <= nd; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, d = 11 * (j / nd) ** 1.3; room.wallPoint(wi, u, 0, _p).addScaledVector(w.normal, -d); pos.push(_p.x, 0.012, _p.z); sd.push(cum[wi] + u * w.width, d); }
      for (let j = 0; j < nd; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSD', new THREE.Float32BufferAttribute(sd, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, fm); m.frustumCulled = false; m.renderOrder = 3; floorLayer.add(m);
    });
  }
  let inPlazaF = null;
  function setInPlazaF(on) {
    if (on === inPlazaF) return; inPlazaF = on; floorLayer.visible = on;
    object.traverse((o) => { if (o === object || o === floorLayer || o.parent === floorLayer) return; if (o.isMesh || o.isSprite || o.isPoints) o.visible = !on; });
  }

  // ------------------------------------------------------------------ shards: night mirrors (arrival), gold (leaving)
  const shardG = new THREE.BufferGeometry();
  shardG.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.87, -0.5, 0, 0.87, -0.5, 0], 3));
  const shG = new THREE.InstancedBufferGeometry().copy(shardG); shG.instanceCount = NSH;
  const shM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
  const vShC = varying(vec3(0));
  shM.positionNode = Fn(() => {
    const j = float(instanceIndex);
    const h1 = hash12(vec2(j, 9.1)), h2 = hash12(vec2(j, 3.3)), h3 = hash12(vec2(j, 5.7));
    const axis = normalize(vec3(h1.sub(0.5), h2.sub(0.5), h3.sub(0.5)).add(vec3(0, 0.001, 0)));
    const size = h2.mul(0.12).add(0.05);
    // arrival
    const b = h1.mul(0.45).add(0.1);
    const aVis = float(1).sub(smoothstep(b.sub(0.01), b.add(0.04), U.arrive)).mul(step(0.001, float(1).sub(U.arrive)));
    const ang = U.time.mul(h3.mul(0.5).add(0.15)).add(j);
    const local = rotA(positionLocal.mul(size), axis, ang);
    const s = h3.mul(PER), y = h2.mul(HG);
    const pp = platePoint(s, y, float(0));
    const ka = smoothstep(b.sub(0.3), b, U.arrive), ke = ka.mul(ka).mul(float(3).sub(ka.mul(2)));
    const start = pp.p.add(vec3(0, h1.mul(3.0).add(2.8), 0)).sub(pp.n.mul(h3.mul(1.8).add(0.6)));
    const angA = float(1).sub(ke).mul(h3.mul(4).add(2)).add(ang.mul(0.2));
    const pa = mix(start, pp.p, ke).add(rotA(positionLocal.mul(size), axis, angA));
    const n = rotA(vec3(0, 0, 1), axis, angA);
    // leaving
    const tau = max(U.leave.sub(0.08).sub(h1.mul(0.12)), 0).mul(5.0);
    const lVis = step(0.001, tau).mul(float(1).sub(smoothstep(0.55, 0.8, U.leave)));
    const ang2 = tau.mul(h3.mul(1.5).add(0.4));
    const pl = pp.p.add(rotA(positionLocal.mul(size.mul(0.8)), axis, ang2)).sub(vec3(0, tau.mul(tau).mul(0.2).add(tau.mul(0.06)), 0)).sub(pp.n.mul(tau.mul(0.12)));
    const n2 = rotA(vec3(0, 0, 1), axis, ang2);
    const useL = step(0.001, U.leave);
    const P = mix(pa, pl, useL), N = mix(n, n2, useL);
    const V = normalize(P.sub(vec3(eye.x, eye.y, eye.z)));
    const R = V.sub(N.mul(dot(V, N).mul(2)));
    const glint = pow(max(dot(R, normalize(vec3(0.3, 1, 0.2))), 0), 24).mul(3).add(pow(max(abs(dot(R, normalize(vec3(-0.5, 0.2, 0.8)))), 0), 60).mul(1.5));
    const night = GOLD2.mul(glint.mul(1.2).add(0.05)).add(GOLD2.mul(smoothstep(b.sub(0.05), b, U.arrive).mul(2.5)));   // gold fragments that catch the light, a soft flash as each lands
    const goldS = GOLD2.mul(glint.add(0.06)).mul(1.4);
    vShC.assign(mix(night.mul(aVis), goldS.mul(lVis), useL));
    return P.add(vec3(0, -1000, 0).mul(float(1).sub(max(aVis.mul(float(1).sub(useL)), lVis.mul(useL)))));
  })();
  shM.colorNode = vec4(vShC, 1);
  const shards = new THREE.Mesh(shG, shM); shards.frustumCulled = false; shards.renderOrder = 3;
  object.add(shards);

  // ------------------------------------------------------------------ T-033 (3D-BR): glass and chrome pieces ON the plate (physical)
  // The walls are the plate seen from above (as the pinya): ~80 pieces of glass (thin film: rose, gold, teal) and chrome lie on it, held
  // by its "gravity" (along the plate's normal, towards it). The plate's resonance makes them rattle (small hops, more as it rings); a hand
  // that lands throws the pieces round it off the plate towards the room, spinning; they fall back, bounce (glass 0.45, chrome 0.6),
  // slide a little and settle — and where one lands, it rings the plate (an impulse in the field: a ring of gold runs from it). The bloom
  // and the crown's flash throw them all. CPU bodies in plate coordinates (s, y, n = height off the plate), drawn as one instanced slab.
  const PG = 7.0, PGY = 3.2;                          // the plate's pull (m/s²) · a little real gravity
  const pcA = new Float32Array(NPC * 4), pcQ = new Float32Array(NPC * 4), pcS = new Float32Array(NPC * 4);
  const WQ = walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const pcGeo = (() => {                              // CHROME SPHERES (T-033 r2): one icosphere, instanced (centre, radius)
    const src = new THREE.IcosahedronGeometry(1, 4), geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', src.getAttribute('position')); geo.setAttribute('normal', src.getAttribute('normal'));
    for (const [k, arr] of [['aPA', pcA], ['aPS', pcS]]) { const b = new THREE.InstancedBufferAttribute(arr, 4); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, b); }
    geo.instanceCount = NPC; return geo;
  })();
  const CHROME_T = vec3(1.0, 0.92, 0.78);
  // T-053: the shared system — the chapter's accent (hands' light) and the recipe's cool rim (ARTE.md §3: lila contraluz in the crown)
  const ACC = vec3(...(room.PALETTE?.festa?.accent || [0.92, 0.56, 0.1])), RIMC = vec3(0.62, 0.55, 0.95);
  const FLASH = (p) => (room.flash ? room.flash(p) : float(0));
  const iridP = (x) => mix(mix(ROSE, vec3(1.0, 0.84, 0.55), smoothstep(-0.8, 0.4, sin(x))), vec3(0.74, 0.68, 1.0), smoothstep(0.35, 1.0, sin(x.mul(0.71).add(1.3))));   // rose · gold · lilac
  const pcMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true, depthTest: true, blending: THREE.NormalBlending, side: THREE.FrontSide });
  {
    const A4 = attribute('aPA', 'vec4'), S4 = attribute('aPS', 'vec4'), nrm = attribute('normal', 'vec3');
    pcMat.positionNode = A4.xyz.add(positionLocal.mul(A4.w));
    const vN = varying(nrm), vS = varying(S4);
    pcMat.colorNode = Fn(() => {
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld)), R = reflect(V.negate(), N), ndv = max(dot(N, V), 0);
      const env0 = envT(R, 0.04), env = mix(vec3(dot(env0, vec3(0.2126, 0.7152, 0.0722))), env0, 0.25);   // T-053 r5: chrome only (no indigo cap)
      // the membrane below it: a sphere also reflects the plate it sits on (gold crests, lilac troughs), seen towards the plate
      const tint = mix(vec3(0.93, 0.95, 1.0), vec3(1.0, 0.92, 0.74), U.Ve);
      const glint = pow(max(dot(R, vec3(LKEY.x, LKEY.y, LKEY.z)), 0), 400.0).mul(6.0);
      const rimP = pow(float(1).sub(ndv), 3.0);
      const c = env.mul(tint).mul(float(0.75).add(rimP.mul(0.25))).add(WHITE.mul(glint)).add(GOLD2.mul(vS.z).mul(0.5))
        .add(RIMC.mul(rimP).mul(0.35)).add(ACC.mul(FLASH(positionWorld)).mul(rimP.mul(0.8).add(0.1)).mul(0.6));   // T-053: the recipe's cool rim; the hands' light on the edge
      return vec4(c.mul(vS.w), 1);
    })();
  }
  const pcMesh = new THREE.Mesh(pcGeo, pcMat); pcMesh.frustumCulled = false; pcMesh.renderOrder = 5;
  object.add(pcMesh); pcMesh.visible = false;   // AD#5: the grey floating beads go
  // the hoop of each wall's big sphere (Tronc's): a thin ring of gold that turns with it
  const hpA = new Float32Array(NW * 4), hpQ = new Float32Array(NW * 4);
  const hoopGeo = (() => {
    const src = new THREE.TorusGeometry(1.22, 0.028, 8, 64), geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', src.getAttribute('position')); geo.setAttribute('normal', src.getAttribute('normal')); geo.setIndex(src.getIndex());
    for (const [k, arr] of [['aHA', hpA], ['aHQ', hpQ]]) { const b = new THREE.InstancedBufferAttribute(arr, 4); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, b); }
    geo.instanceCount = NW; return geo;
  })();
  const hoopMat = new THREE.MeshBasicNodeMaterial({ transparent: false, depthWrite: true, depthTest: true, side: THREE.FrontSide });
  {
    const A4 = attribute('aHA', 'vec4'), Q4 = attribute('aHQ', 'vec4'), nrm = attribute('normal', 'vec3');
    const qrot = (v) => v.add(cross(Q4.xyz, cross(Q4.xyz, v).add(v.mul(Q4.w))).mul(2));
    hoopMat.positionNode = A4.xyz.add(qrot(positionLocal).mul(A4.w));
    const vN = varying(qrot(nrm));
    hoopMat.colorNode = Fn(() => {
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld)), R = reflect(V.negate(), N);
      return vec4(envT(R, 0.06).mul(vec3(1.0, 0.72, 0.34)).mul(1.5).add(vec3(1.0, 0.6, 0.2).mul(0.06)).add(ACC.mul(FLASH(positionWorld)).mul(0.5)), 1);
    })();
  }
  const hoopMesh = new THREE.Mesh(hoopGeo, hoopMat); hoopMesh.frustumCulled = false; hoopMesh.renderOrder = 5;
  object.add(hoopMesh); hoopMesh.visible = false;
  const pcs = new Array(NPC);
  {
    // the hierarchy (ARTE, 24-11): per wall ONE sphere Ø 0.6 m (with its hoop), two of Ø 0.3 m and ten beads; homes clear of the quiet zones
    const r = rng(404), HOME = [[0.745, 1.0, 0.30], [0.885, 2.05, 0.15], [0.435, 0.42, 0.15]];
    for (let w = 0; w < NW; w++) for (let k = 0; k < 13; k++) {
      const W = walls[w]; let s0 = 0, y0 = 1, size;
      if (k < 3) { s0 = cum[w] + HOME[k][0] * W.width; y0 = HOME[k][1]; size = HOME[k][2]; r(); }
      else {
        for (let t = 0; t < 16; t++) {
          s0 = cum[w] + (0.04 + 0.92 * r()) * W.width; y0 = 0.3 + 2.4 * r(); const du = Math.abs(s0 - cum[w] - W.width / 2);
          if ((du < 1.75 && y0 > 1.6 && y0 < 2.35) || (du < 1.05 && y0 > 0.75 && y0 < 1.75)) continue;
          break;
        }
        size = 0.025 + 0.03 * r();
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r() * 6.28);
      const tiltAx = new THREE.Vector3(r() - 0.5, r() - 0.5, 0).normalize(), flatZ = new THREE.Vector3(0, 0, 1).applyAxisAngle(tiltAx, 0.18 + 0.35 * r());
      pcs[k < 3 ? w * 3 + k : NBIG + w * 10 + (k - 3)] = { flatZ, w, s: s0, y: y0, n: 0, s0, y0, vs: 0, vy: 0, vn: 0, q, ql: q.clone(), wv: new THREE.Vector3(), size, chrome: 1, seed: r(), glow: 0, rest: 1, hopT: r() * 3 };
    }
  }
  const _pq3 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pa = new THREE.Vector3(), _pp = new THREE.Vector3();
  // T-053 (ARTE-3 «one hero per wall, with air»): per wall the Ø 0.6 m sphere with its hoop and ONE Ø 0.3 m companion high up; the low
  // sphere and the ten beads are no longer drawn (they stay in the arrays so nothing else moves)
  const SHOWN = (i) => i < NBIG && i % 3 !== 2;
  const halos = (room.makeHalo && room.placeHalo) ? walls.map(() => { const h = room.makeHalo({ color: [1, 0.8, 0.5], radius: 1.25, intensity: 0 }); object.add(h.mesh); return h; }) : [];
  const _hp = new THREE.Vector3();
  function plateWorld(pc, out) {                    // CPU twin of platePoint: the plate point (s, y) lifted n off it, in the part's space
    const W = walls[pc.w], t = Math.min(W.width, Math.max(0, pc.s - cum[pc.w]));
    out.copy(W.pa).addScaledVector(W.right, t); out.y = pc.y;
    out.sub(eye).multiplyScalar(K[pc.w]).add(eye).addScaledVector(W.normal, pc.n + pc.size);
    return out;
  }
  let _bds = 0, _bdy = 0;
  function throwPiece(pc, k, ds, dy) {              // off the plate, towards the room and away from the hand, spinning
    const r = Math.hypot(ds, dy) + 1e-3, away = Math.min(1, r / 0.3);
    pc.vn = (1.5 + 1.3 * Math.random()) * k; pc.vs += ((Math.random() - 0.5) * 0.8 + 0.9 * away * ds / r) * k; pc.vy += (1.3 + Math.random() * 1.2 + 0.5 * away * dy / r) * k;   // up and off: an arc you can follow on the wall
    pc.wv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((5 + 7 * Math.random()) * k);
    pc.rest = 0; pc.glow = Math.max(pc.glow, 0.5 * k);
  }
  function stepPieces(dt, downs, Vres, burst, arrive, leave) {
    for (const d of downs) {                        // a hand: the pieces round it jump at once — and always the nearest big sphere of that wall
      const [fs, fy] = fieldOf(d);
      let best = null, bd = 3.0;
      for (let i = 0; i < NPC; i++) {
        const pc = pcs[i];
        const ds = ((pc.s - fs + PER / 2) % PER + PER) % PER - PER / 2, dy = pc.y - fy, r = Math.hypot(ds, dy);
        if (!SHOWN(i)) continue;
        if (r < 0.75) throwPiece(pc, 1.15 - 0.6 * r, ds, dy);
        else if (i < NBIG && r < bd && pc.n < 0.02) { bd = r; best = pc; _bds = ds; _bdy = dy; }
      }
      if (best) throwPiece(best, Math.max(0.55, 1.1 - 0.22 * bd), _bds, _bdy);
    }
    if (burst > 0) for (let i = 0; i < NPC; i++) { const pc = pcs[i]; if (SHOWN(i) && pc.n < 0.05) throwPiece(pc, burst * (0.6 + 0.5 * Math.random()), 0, 0); }
    for (let i = 0; i < NPC; i++) {
      const pc = pcs[i];
      if (!SHOWN(i)) { const j = i * 4; pcA[j + 3] = 0; pcS[j + 3] = 0; continue; }   // T-053: not drawn, not simulated (no rings from nothing)
      // the plate rattles them: small hops, more often and higher as it rings
      pc.hopT -= dt;
      if (pc.n < 0.003 && pc.hopT <= 0) { pc.hopT = 0.3 + Math.random() * (2.5 - 2.0 * Vres); if (Vres > 0.15 && leave < 0.05) { pc.vn = Math.max(pc.vn, 0.15 + 0.6 * Vres * Math.random()); pc.wv.set(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 3).multiplyScalar(1.5 * Vres); } }
      if (leave > 0.05) {                            // leaving: they let go of the plate and fall like the gold rain
        pc.vy -= 2.5 * dt; pc.vn += 0.3 * dt;
      } else {
        pc.vn -= PG * dt; pc.vy -= (pc.n > 0.003 ? PGY : 0) * dt;
        if (pc.n < 0.003) { pc.vs *= Math.exp(-dt * 6); pc.vy *= Math.exp(-dt * 6); pc.vs += (pc.s0 - pc.s) * dt * 0.6; pc.vy += (pc.y0 - pc.y) * dt * 0.6; }   // it settles back towards its place
      }
      pc.s += pc.vs * dt; pc.y += pc.vy * dt; pc.n += pc.vn * dt;
      const W = walls[pc.w]; pc.s = Math.min(cum[pc.w] + W.width - 0.05, Math.max(cum[pc.w] + 0.05, pc.s));
      pc.y = Math.min(HG - 0.1, Math.max(leave > 0.05 ? -5 : 0.15, pc.y));
      if (pc.n <= 0 && leave <= 0.05) {
        if (pc.vn < -0.6) {                          // it lands: a bounce, a ring of gold from where it hit, a sound
          const e = 0.6, sp = -pc.vn;
          impulse(pc.s, pc.y, Math.min(1400, 160 * sp * (0.6 + pc.size * 4)) * (1 - 0.4 * Vres), Math.max(0.11, pc.size * 0.9));   // a ring opens where it lands: the sand jumps
          fxImpact(pc.w, (pc.s - cum[pc.w]) / W.width, Math.min(1, sp / 4 * (0.5 + pc.size * 3)), 'chrome', 'hit');
          pc.vn = sp * e; pc.wv.multiplyScalar(0.6); pc.glow = Math.max(pc.glow, Math.min(1, sp / 3));
          if (i < NBIG && sp > 1.3) for (let j = NBIG; j < NPC; j++) {   // a splash: the beads round it jump away
            const b = pcs[j]; if (b.w !== pc.w || b.n > 0.02) continue;
            const ds = b.s - pc.s, dy = b.y - pc.y, r = Math.hypot(ds, dy);
            if (r < 1.1) throwPiece(b, Math.min(0.9, sp / 3) * (1.1 - 0.7 * r), ds, dy);
          }
        } else { pc.vn = 0; pc.wv.multiplyScalar(Math.exp(-dt * 8)); pc.rest = 1; }
        pc.n = 0;
      }
      // spin; resting pieces lie flat (their local z on the plate's normal)
      const wl = pc.wv.length();
      if (wl > 1e-4) { _pa.copy(pc.wv).multiplyScalar(1 / wl); _pq.setFromAxisAngle(_pa, wl * dt); pc.ql.premultiply(_pq); pc.wv.multiplyScalar(Math.exp(-dt * 0.4)); }
      if (pc.n === 0) { _pa.set(0, 0, 1).applyQuaternion(pc.ql); _pq.setFromUnitVectors(_pa, pc.flatZ); _pq3.identity().slerp(_pq, Math.min(1, dt * 10)); pc.ql.premultiply(_pq3); }
      pc.ql.normalize();
      pc.q.copy(WQ[pc.w]).multiply(pc.ql);
      pc.glow *= Math.exp(-dt / 0.5);
      plateWorld(pc, _pp);
      const vis = smoother((arrive - 0.35 - 0.3 * pc.seed) / 0.25) * (1 - smoother((leave - 0.3) / 0.4));
      const j = i * 4;
      pcA[j] = _pp.x; pcA[j + 1] = _pp.y; pcA[j + 2] = _pp.z; pcA[j + 3] = pc.size * (0.3 + 0.7 * vis);   // (plateWorld lifts it by its radius)
      pcQ[j] = pc.q.x; pcQ[j + 1] = pc.q.y; pcQ[j + 2] = pc.q.z; pcQ[j + 3] = pc.q.w;
      pcS[j] = pc.chrome; pcS[j + 1] = pc.seed; pcS[j + 2] = pc.glow; pcS[j + 3] = vis;
    }
    for (let i = 0; i < NBIG; i++) {                 // the big ones, for the plate (contact shadow) and the sand (the trail)
      const pc = pcs[i], sp = Math.hypot(pc.vs, pc.vy, pc.vn);
      SPV[i].set(pc.s, pc.y, pc.n, pc.size); SFV[i].set(pc.n > 0.01 ? Math.min(1, sp / 1.2) : 0, pcS[i * 4 + 3], 0, 0);
    }
    for (let w = 0; w < NW; w++) { const j = w * 3 * 4, o = w * 4; hpA[o] = pcA[j]; hpA[o + 1] = pcA[j + 1]; hpA[o + 2] = pcA[j + 2]; hpA[o + 3] = pcA[j + 3] * (pcS[j + 3] > 0.02 ? 1 : 0); hpQ[o] = pcQ[j]; hpQ[o + 1] = pcQ[j + 1]; hpQ[o + 2] = pcQ[j + 2]; hpQ[o + 3] = pcQ[j + 3]; }
    for (let w = 0; w < halos.length; w++) {         // T-053: the soft halo behind each wall's hero sphere (≤ 0.16: it sits beside the button's zone)
      const j = w * 3 * 4; _hp.set(pcA[j], pcA[j + 1], pcA[j + 2]); room.placeHalo(halos[w], _hp, 1.1);
      halos[w].set({ intensity: 0.16 * pcS[j + 3] * (1 - smoother(leave / 0.5)) }); halos[w].mesh.visible = !inPlazaF && pcS[j + 3] > 0.01;
    }
    hoopGeo.getAttribute('aHA').needsUpdate = true; hoopGeo.getAttribute('aHQ').needsUpdate = true;
    for (const k of ['aPA', 'aPS']) pcGeo.getAttribute(k).needsUpdate = true;
  }

  // ------------------------------------------------------------------ T-033 (3D-BR): the far layer and the room's movement
  // ~900 shards of glass and chrome float 9–34 m out all round, catching the studio light (glints, thin film). As the resonance grows the
  // room FLOATS: the cloud sinks past the walls (the room seems to rise, ≤ 0.12 m/s) and turns slowly round (≤ 2°/s); in the bloom, more.
  const NFS = 900;
  const farMesh = (() => {
    const r = rng(505), aF = new Float32Array(NFS * 4), aG = new Float32Array(NFS * 4);
    for (let i = 0; i < NFS; i++) { aF[i * 4] = r() * 6.2832; aF[i * 4 + 1] = 9 + 25 * r(); aF[i * 4 + 2] = r() * 14 - 4; aF[i * 4 + 3] = 0.08 + 0.5 * r() * r(); for (let k = 0; k < 4; k++) aG[i * 4 + k] = r(); }
    const g = new THREE.InstancedBufferGeometry().copy(shardG); g.instanceCount = Math.round(NFS * 0.45);   // T-053: fewer far shards (busy)
    g.setAttribute('aFS', new THREE.InstancedBufferAttribute(aF, 4)); g.setAttribute('aFG', new THREE.InstancedBufferAttribute(aG, 4));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const F4 = attribute('aFS', 'vec4'), G4 = attribute('aFG', 'vec4');
    const ang = F4.x.add(U.turn), rad = F4.y;
    const yy = fract(F4.z.add(4).sub(U.rise).div(14)).mul(14).sub(4);                 // wraps: the cloud keeps sinking past
    const ax = normalize(vec3(G4.x.sub(0.5), G4.y.sub(0.5), G4.z.sub(0.5)).add(vec3(0, 0.001, 0)));
    const a2 = U.time.mul(G4.w.mul(0.4).add(0.1)).add(G4.x.mul(20.0));
    const rotA2 = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
    const ctr = vec3(cos(ang).mul(rad), yy, sin(ang).mul(rad));
    m.positionNode = ctr.add(rotA2(positionLocal.mul(F4.w), ax, a2));
    const nW = rotA2(vec3(0, 0, 1), ax, a2);
    const vC = varying(vec3(0));
    m.colorNode = Fn(() => {
      const V = normalize(cameraPosition.sub(positionWorld)), N0 = normalize(nW), N = select(dot(N0, V).lessThan(0), N0.negate(), N0), R = reflect(V.negate(), N);
      const env = envT(R, 0.05), ndv = max(dot(N, V), 0);
      const film = iridP(ndv.mul(6.0).add(G4.y.mul(6.28)));
      const fog = exp(rad.div(-30.0)).mul(smoothstep(-4.0, -2.0, yy)).mul(float(1).sub(smoothstep(8.0, 10.0, yy)));
      return mix(env.mul(mix(vec3(1), film, 0.6)), env.mul(CHROME_T), step(0.7, G4.z)).mul(0.4).mul(fog).mul(U.farK);
    })();
    void vC;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 0;
    object.add(mesh); return mesh;
  })();
  let turn = 0, rise = 0, turnV = 0, riseV = 0;

  // ------------------------------------------------------------------ the room's modes (exact grid eigenvalues)
  const lam = (kx, ky) => { const a = Math.cos(kx * DX), b = Math.cos(ky * DX); return -(8 * a + 8 * b + 4 * a * b - 20) / (6 * DX * DX); };
  const mr = rng(7);
  function pickPair(lambda) {
    const k0 = 2 * Math.PI / lambda, list = [];
    for (let m = 1; m <= 7; m++) for (let n = 2; n <= 90; n++) {
      const kx = 2 * Math.PI * n / PER, ky = m * Math.PI / HG, k = Math.sqrt(lam(kx, ky));
      if (Math.abs(k / k0 - 1) < 0.08) list.push({ n, m, kx, ky, k });
    }
    let best = null, bs = 1e9;
    for (const A of list) for (const B of list) {
      if (A.m >= B.m) continue;
      const s2 = Math.abs(A.k - B.k) / k0 + 0.25 * Math.abs((A.k + B.k) / 2 / k0 - 1) + (A.n % 4 ? 0.004 : 0) + (B.n % 4 ? 0.004 : 0);
      if (s2 < bs) { bs = s2; best = [A, B]; }
    }
    return (best || list.slice(0, 2)).map((M) => ({ ...M, px: mr() * 6.2832, pt: mr() * 6.2832 }));
  }
  const ORDER = pickPair(1.15), BLOOMM = pickPair(0.72);
  const MODES = [...ORDER, ...BLOOMM].slice(0, MAXM);

  // ------------------------------------------------------------------ CPU state (preallocated)
  const sStroke = new Array(MAXS).fill(null), sT0 = new Float64Array(MAXS), sPh = new Float64Array(MAXS), sSeen = new Int32Array(MAXS), sOwn = new Float64Array(MAXS);
  const RECENT = 64, recT = new Float64Array(RECENT).fill(-1e9); let recI = 0;
  let callOnK = 0, time = 0, frame = 0, Rown = 0, Rs = 0, bloomT = -1, bloomEnv = 0, Ve = 0, modeT = 0, autoWait = 0.8, lastCT = -1, lastBloomP = !!P.bloomNow;
  let nI = 0, cluster = 0, clusterAt = -1e9, gam = 0.7, c = 3.6;
  const impulse = (s, y, amp, sigma = Math.max(0.11, 3.5 * DX)) => { if (nI >= MAXI) return; IMP[nI].set(((s % PER) + PER) % PER, y, amp, sigma); nI++; };
  // T-047: where each echo front leaves from (perimeter s), by front id — fixed at its first sight
  const frontAt = new Map(), lastDown = Array.from({ length: 8 }, () => ({ wall: -1, u: 0.5, t: -9 })); let lastDownI = 0;
  function noteDowns(downs, time) { for (const d of downs) { const o = lastDown[lastDownI++ % 8]; o.wall = d.wall; o.u = d.u ?? 0.5; o.t = time; } }
  function frontS0(f, input, time) {
    let s0 = frontAt.get(f.id);
    if (s0 !== undefined) return s0;
    const wf = f.from % NW;
    if (!f.ghost) {                                   // the latest landing on its wall (≤ 0.6 s: the score's state comes a little later), else the hand there
      let bt = -9, bu = -1, bd = 1e9;
      for (const o of lastDown) if (o.wall === wf && time - o.t <= 0.6 && o.t > bt) { bt = o.t; bu = o.u; }
      if (bu < 0) for (const h of input.hands || []) if (h.wall === wf) { const dd = Math.abs(h.u - 0.5); if (dd < bd) { bd = dd; bu = h.u; } }
      if (bu >= 0) s0 = cum[wf] + bu * walls[wf].width;
    }
    if (s0 === undefined) s0 = cum[wf] + walls[wf].width / 2;
    frontAt.set(f.id, s0);
    return s0;
  }
  const fieldOf = (h) => { const w = walls[h.wall]; return [cum[h.wall] + h.u * w.width, h.v * w.height]; };
  let peakT = -1, peakS0 = X0;
  const swellM = (t) => (Math.pow(1.5, Math.min(5.5, Math.max(0, t))) - 1) / (Math.pow(1.5, 5.5) - 1);   // 0 → 1 in 5.5 s, ×1.5 a second
  let washDone = false, washOn = false;                // the room blooms in full only once per pass; later blooms are the crack alone
  function triggerBloom() { if (bloomT < 0) bloomT = 0; if (peakT < 0) { peakT = 0; peakS0 = handCentre(); washOn = !washDone; washDone = true; } }
  function handCentre() {                     // circular mean of the hands' perimeter positions (wall 0's centre if none)
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < U.nHU.value; i++) { const a = HU[i].x / PER * 2 * Math.PI; cx += Math.cos(a); cy += Math.sin(a); n++; }
    if (!n || Math.hypot(cx, cy) < 1e-3) return X0;
    return ((Math.atan2(cy, cx) / (2 * Math.PI)) * PER + PER) % PER;
  }

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20);
    time += dt; frame++; nI = 0;
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    const st = input.state, ev = input.events;
    // ---- which moment: the crown's clock, or the resonance
    let cT;
    if (st) cT = st.block === 'crown' ? st.t : 99;
    else if (P.mode === 'crown') cT = num('crown', 0) > 0 ? num('crown', 0) * 25 : (input.t ?? 0);
    else cT = 99;
    if (!st || st.block === 'crown' || (input.arrive ?? 1) < 0.5) washDone = false;   // a new pass (the study: every trigger)
    if (ev) for (let i = 0; i < ev.length; i++) { if (ev[i] === 'bloom') triggerBloom(); else if (ev[i] === 'crown') lastCT = -1; }
    if (P.bloomNow === true && !lastBloomP) triggerBloom();
    lastBloomP = !!P.bloomNow;
    const arrive = st ? (input.arrive ?? 1) : num('arrive', 1), leave = st ? (input.leave ?? 0) : num('leave', 0);
    const freeze = ss(0.0, 0.15, leave);

    // ---- hands → field
    const hands = input.hands || [];
    for (let i = 0; i < MAXS; i++) sSeen[i] = 0;
    let nh = 0, driving = 0;
    const lockW = c * ORDER[0].k, lock = clamp01((Rs - 0.3) / 0.55);
    for (const h of hands) {
      let k = -1; for (let i = 0; i < MAXS; i++) if (sStroke[i] === h.stroke) { k = i; break; }
      if (k < 0) { for (let i = 0; i < MAXS; i++) if (sStroke[i] == null) { k = i; break; } if (k < 0) continue; sStroke[k] = h.stroke; sT0[k] = time; sPh[k] = 0; sOwn[k] = 2 * Math.PI * (2.6 + 1.4 * ((k * 0.6180339) % 1)); }
      sSeen[k] = 1;
      const age = time - sT0[k], sp = Math.hypot(h.vx || 0, h.vy || 0);
      const w = sOwn[k] + (lockW - sOwn[k]) * lock;
      sPh[k] = (sPh[k] + w * dt) % (2 * Math.PI * 64);
      const rest = clamp01((age - 0.25) / 0.6) * clamp01(1 - sp / 0.5);
      if (rest > 0.5) driving++;
      if (nh < MAXH) {
        const [fs, fy] = fieldOf(h);
        HA[nh].set(fs, fy, 600 * rest * (1 - 0.6 * lock), sPh[k]);
        { const vx = h.vx || 0, vy = h.vy || 0, sp = Math.hypot(vx, vy), k = sp > 1 ? 1 / sp : 1; HB[nh].set(vx * k, vy * k, w, 0.09); }
        HU[nh].set(fs, fy, 1, Math.exp(-age * 2.2) * Math.min(1, age * 30 + 0.35));   // the landing glow: at once, then a soft decay (no strobe) HV[nh].set(age, rest, 0, 0);
        nh++;
      }
    }
    for (let i = 0; i < MAXS; i++) if (!sSeen[i]) sStroke[i] = null;
    const quiet = 1 / Math.sqrt(Math.max(1, driving / 3));
    for (let i = 0; i < nh; i++) HA[i].z *= quiet;
    const downs = input.downs || [];
    noteDowns(downs, time);                                 // T-047: for the echo fronts' origin
    const loud = 1 / Math.sqrt(Math.max(1, downs.length / 3));
    for (const d of downs) {
      let together = 0; for (let i = 0; i < RECENT; i++) { const a = time - recT[i]; if (a < 0.5) together += 1 - a / 0.5; }
      recT[recI] = time; recI = (recI + 1) % RECENT;
      const [fs, fy] = fieldOf(d);
      impulse(fs, fy, 1000 * (1 + 0.4 * Math.min(3, together)) * loud * (1 - freeze));
    }
    // ---- the hidden rule: the score's resonance, or (study) a stand-in with the score's own rule
    let Rin;
    if (st) Rin = st.resonance || 0;
    else {
      if (downs.length) { if (time - clusterAt <= 0.5) cluster += downs.length; else { clusterAt = time; cluster = downs.length; } const people = Math.max(2, Math.ceil(hands.length / 1.6)); Rown += cluster >= 2 ? (0.2 * downs.length) / people * num('sensitivity', 1) : 0.01; }
      Rown = Math.min(1.2, Math.max(0, Rown + dt * (0.004 * Math.min(12, hands.length) - 0.05)));
      if (Rown >= 1 && bloomT < 0) { triggerBloom(); Rown = 0.3; }
      Rin = Rown;
    }
    const crownK = cT < 25 ? 0 : 1;
    const R = clamp01((Rin + num('resonance', 0)) * crownK);
    Rs += (R - Rs) * (1 - Math.exp(-dt * (R > Rs ? 1.4 : 0.6)));
    if (bloomT >= 0) {
      bloomT += dt;
      // STEP 7: the bloom's size and length from the score (bloomSize 0..1, bloomDur s): the same geometric swell (≤ ×2/s), capped by the
      // size, released by bloomDur (DECISIONES 24-11 00:00: ≤ ×2 a second, ≤ 2 % at 255, once a pass, calm in ≤ 8 s)
      const bS = st && st.block === 'festa' && st.bloomSize > 0 ? st.bloomSize : num('bloomSize', 1), bD = st && st.bloomDur > 0 ? st.bloomDur : 7;
      bloomEnv = Math.min(swellM(bloomT), 0.3 + 0.7 * bS) * (1 - ss(bD - 1.5, bD, bloomT));
      U.bSize.value = 0.3 + 0.7 * bS;
      if (bloomT > Math.max(bD, 7.2)) { bloomT = -1; bloomEnv = 0; }
    }
    Ve = Math.max(Rs, bloomEnv);
    // ---- STEP 7: echo fronts and the call, from the score (study: params.echo makes a front every 2 s from P1; params.call loops a call)
    {
      let n = 0;
      if (st && st.block === 'festa' && st.fronts) {
        // T-047 (#21): at most 4 fronts (the newest), each leaving from the HAND that sent it: the score's front has no position, so at its
        // first sight the part takes the hand that landed on its wall this frame (or the nearest hand on that wall; the centre if none)
        const fr = st.fronts;
        for (let k = fr.length - 1; k >= 0 && n < 4; k--) { const f = fr[k], u = ((st.clock ?? 0) - f.at) / Math.max(0.1, f.arrive - f.at);
          const s0 = frontS0(f, input, time), D = f.to === f.from ? PER : PER / 2, run = Math.max(0, u) * D;   // solo: it runs round and comes back
          FR[n].set(s0, run <= PER / 2 ? run : PER - run, f.gen || 0, (f.ghost ? 0.55 : 1) * smoother(u / 0.08) * (1 - smoother((u - 1.05) / 0.2))); n++; }
      } else if (!st && num('echo', 0) > 0) {
        for (let k = 0; k < 2; k++) { const u = ((time + k * 2) % 4) / 3; FR[n].set(cum[1 % NW] + walls[1 % NW].width / 2, u * PER / 2, k, smoother(u / 0.08) * (1 - smoother((u - 1.05) / 0.2))); n++; }
      }
      U.nFr.value = n;
      if (frontAt.size > 24 && st && st.fronts) { let lo = Infinity; for (const f of st.fronts) lo = Math.min(lo, f.id); for (const k of frontAt.keys()) if (!(k >= lo)) frontAt.delete(k); }
      let on = 0, ct = -99, gap = 0.8;
      if (st && st.block === 'festa' && st.festaStage === 'call' && st.call && st.call.n > 0) { ct = (st.clock ?? 0) - st.call.at; gap = st.call.gap || 0.8; on = 1; }
      else if (!st && num('call', 0) > 0) { ct = (time % 4) - 2.4; on = 1; }
      callOnK += ((on ? 1 : 0) - callOnK) * (1 - Math.exp(-dt / 0.3));
      U.callT.value = ct; U.callGap.value = gap; U.callOn.value = callOnK * (1 - leave);
    }

    // ---- auto (study only): gentle self-impulses when fewer than two hands
    if (!st && P.auto !== false && hands.length < 2 && leave < 0.1) {
      autoWait -= dt;
      if (autoWait <= 0) { impulse(Math.random() * PER, 0.85 + Math.random() * 1.6, 800 * (1 - 0.4 * Rs)); autoWait = 1.0 + Math.random() * 1.8 - 0.5 * Rs; }
    }

    // ---- T-033: the pieces on the plate; the room floats (the far cloud sinks and turns) as the resonance grows
    {
      const burst = (bloomT >= 0 && bloomT < dt * 1.5 ? 1 : 0) + (lastCT < 5.2 && cT >= 5.2 ? 0.8 : 0);
      stepPieces(dt, downs, Ve, Math.min(1.2, burst), arrive, leave);
      const wT = (1.0 + 2.5 * Ve) * Math.PI / 180 * (1 - freeze), rT = (0.02 + 0.1 * Ve) * (1 - freeze);   // ≤ 2°/s, ≤ 0.12 m/s
      turnV += (wT - turnV) * (1 - Math.exp(-dt / 1.5)); riseV += (rT - riseV) * (1 - Math.exp(-dt / 1.5));
      turn = (turn + turnV * dt) % (Math.PI * 2000); rise = (rise + riseV * dt) % 1400;
      U.turn.value = turn; U.rise.value = rise; object.position.y = 0.07 * Math.sin(time * 0.19) * (0.3 + 0.7 * Ve) * (1 - freeze);   // the room floats (≤ 0.013 m/s)
       U.farK.value = smoother((arrive - 0.2) / 0.5) * (1 - smoother(leave / 0.6));
    }
    // ---- the crown
    const cross = (x) => lastCT < x && cT >= x;
    if (cross(1.2)) impulse(X0, HG - 0.35, 1400, 0.16);
    if (cross(5.2)) impulse(X0 + PER / 2, HG - 0.35, 1400, 0.16);
    U.lineK.value = cross(20.1) ? 140 : 0; U.lineY.value = HG - 0.35;
    lastCT = cT;
    const inCrown = cT < 26;
    U.crownOn.value = inCrown ? 1 - ss(23, 26, cT) : 0;
    // the group's peak (with the bloom): the crack runs at 5.5 m/s both ways, the plate opens from it, holds, closes
    let pEnv = 0, pOpen = 0, pFront = 0, wY = -1, wK = 0;
    if (peakT >= 0) {
      peakT += dt;
      pFront = Math.min(PER / 2 + 0.6, peakT * 5.5);                       // ~2.5 s round the room
      pEnv = ss(0, 1.0, peakT) * (1 - ss(5.6, 7.4, peakT));
      if (washOn) { wY = -0.3 + (HG + 0.9) * smoother((peakT - 0.3) / 4.5); wK = 0.55 * Math.min(swellM(peakT - 0.3), U.bSize.value) * (1 - ss(5.6, 7.2, peakT)); }   // the wash: the same geometric swell, calm by ~7.5 s
      pOpen = 0.95 * swellM(peakT - 0.3);              // the plate opens round the crack, not everywhere
      if (peakT > 7.6) peakT = -1;
      if (peakT >= 0 && peakT < dt * 1.5) { U.lineK.value = 40; U.lineY.value = 2.15; }
    }
    // duck: the field and the hands' light fall to ~30 % (~22 % in a crowd) under the peak; the bands wait
    const crowd = clamp01((nh - 4) / 11);
    const crackOnly = peakT >= 0 ? 1 - swellM(peakT) : 0;              // the crack owns the first moment; then the organised figure returns
    U.duck.value = 1 - pEnv * crackOnly * (0.7 + 0.08 * crowd);
    U.washY.value = wY; U.washK.value = wK;
    if (leave > 0) { const lk = 1 - ss(0, 0.25, leave); pEnv *= lk; wK *= lk; U.washK.value = wK; }   // leaving: no peak, no wash
    U.peakEnv.value = pEnv; U.peakOpen.value = pOpen; U.peakFront.value = pFront; U.peakS0.value = peakS0;
    U.solo.value = 1 / (1 + 0.35 * Math.max(0, nh - 1));                     // the rosettes stay a solo gift: fainter in a crowd
    U.cells.value = (inCrown || arrive < 1 || leave > 0 || pEnv > 0) ? 1 : 0;
    U.front.value = (PER / 2 + 0.4) * smoother((cT - 1.2) / 3.8);
    U.head.value = ss(0.0, 1.0, cT) * (1 - ss(4.8, 5.6, cT));
    U.flash.value = ss(4.8, 5.2, cT) * (1 - ss(5.2, 8.5, cT));
    U.ring.value = 0.7 * ss(1.0, 1.4, cT) * (1 - ss(5.6, 9, cT));
    U.open.value = 1.1 * smoother((cT - 4.5) / 8.5);
    U.swell.value = ss(4.5, 16, cT) * (1 - 0.9 * ss(20.2, 24.5, cT));
    U.fill.value = ss(9, 15, cT) * (1 - 0.85 * ss(20.2, 24.5, cT));               // the first time the room fills with light
    U.rain.value = inCrown ? ss(6, 9, cT) * (1 - ss(20.2, 23.5, cT)) : 0;
    U.hold.value = ss(16.5, 18.5, cT) * (1 - ss(20.0, 20.6, cT));
    U.respawn.value = cT < 17 ? 1 : 0;

    // ---- the plate's physics
    c = Math.min(8, Math.max(1.5, num('speed', 3.6)));
    const ring = Math.min(8, Math.max(0.5, num('ring', 3)));
    gam = 2 / ring * (1 + 0.9 * Rs); gam += (2 / 1.4 - gam) * 0.6 * bloomEnv;
    const ceil = 2.5 + (HG + 0.5 - 2.5) * (Ve * Ve * (3 - 2 * Ve));
    const ceilC = inCrown ? HG + 0.6 : ceil;
    const order = clamp01((Rs - 0.25) / 0.75);
    const modeCap = 0.05 + 1.3 * (0.3 * order ** 1.2 + 0.34 * bloomEnv);
    for (let i = 0; i < MODES.length; i++) {
      const M = MODES[i], bm = i >= ORDER.length;
      const target = bm ? 0.06 * bloomEnv : 0.05 * order ** 1.2 + 0.12 * bloomEnv;
      MA[i].set(M.kx, M.ky, target * Math.max(gam, 0.25) * c * M.k, c * M.k);
      MB[i].set(M.px, (M.pt + c * M.k * modeT) % (2 * Math.PI * 1000), 0, 0);
    }
    modeT += dt * (1 - freeze);
    { U.mandA.value = clamp01(0.22 + 1.0 * order ** 1.1 + 0.6 * bloomEnv) * (inCrown ? 0.3 * (1 - U.crownOn.value) : 1) * num('mandala', 1);
      U.mr.value = 0.6 + 1.0 * Math.max(smoother(order), bloomEnv);                        // Ø 1 m → 3 m with the group's order
      U.frieze.value = Math.max(ss(0.7, 1.0, order), ss(0.3, 0.9, bloomEnv)) * (inCrown ? 0 : 1); }
    U.c2.value = c * c / (DX * DX); U.gam.value = gam; U.clip.value = Math.min(2, Math.max(0.1, num('clip', 0.6)));
    U.ceil.value = ceilC; U.modeCap.value = modeCap; U.nH.value = nh; U.nI.value = nI; U.nM.value = MODES.length;
    U.iw.value = 1 / lockW;
    // the resonating room stands still in its figure: the live phase fades out and the field is averaged over ~0.12 s (rings stay crisp
    // at low resonance, where nothing oscillates in place)
    U.still.value = Math.min(1, 0.7 + 0.3 * Ve);
    U.rmsK.value = clamp01(Math.max(bloomEnv * 1.5, (Ve - 0.5) * 2));
    U.derA.value = 1 - Math.exp(-dt / Math.max(0.004, num('smooth', 0.12) * Ve));
    const sub = Math.max(1, Math.ceil(c * dt / (0.5 * DX))), dts = dt / sub * (1 - freeze);
    U.dt.value = dts; U.eavg.value = 1 - Math.exp(-dts / 0.35);
    const r = room.renderer;
    if (!cleared) { cleared = true; }
    for (let i = 0; i < sub; i++) {
      U.tau.value = i * dts; U.kick.value = i === 0 ? 1 : 0;
      simTex.value = sim[sc].texture; r.setRenderTarget(sim[1 - sc]); simQuad.render(r); sc = 1 - sc;
    }
    U.kick.value = 0; U.lineK.value = 0;
    derTex.value = sim[sc].texture; r.setRenderTarget(derB); derQuad.render(r);
    r.setRenderTarget(der); copyQuad.render(r);
    r.setRenderTarget(null);

    // ---- look
    U.time.value = time % 3000; U.frame.value = frame % 997; U.Ve.value = Ve; U.bloom.value = bloomEnv;
    U.gain.value = Math.max(0, num('glow', 1)) * (1 + 0.25 * Ve + 0.4 * bloomEnv) * (inCrown ? 1 + 0.5 * U.swell.value : 1);
    U.stepL.value = (0.026 + 0.012 * Ve + 0.025 * bloomEnv) / Math.min(3, Math.max(0.3, num('lines', 1)));
    U.lineW.value = 0.0045 * K[0] * Math.sqrt(Math.max(1, 0.0041 / pxM) * 1) * 1.15;
    U.sand.value = 1.4 * bloomEnv + 1.4 * order * order;
    U.bandK.value = 0;   // T-053 (ARTE-3 §3): no pixel-sorted runs outside the tile transition (was up to 1 at high resonance / bloom)
    U.relief.value = Math.max(0, num('relief', 0.6));
    U.chrome.value = Math.max(0, num('chrome', 0.9)); U.glass.value = Math.max(0, num('glass', 0)); U.contours.value = Math.max(0, num('contours', 0)); U.bend.value = Math.max(0, num('bend', 1.0)) * (inCrown ? 1 - 0.7 * U.crownOn.value : 1);   // T-053: a calm mirror while the crown opens
    U.nHU.value = nh;
    U.cw.value = inCrown ? 0.7 * U.crownOn.value : 0;   // T-053: the crown's env — warm below, the garlands softer: luminous and clean
    U.arrive.value = arrive; U.leave.value = leave; U.freeze.value = freeze;
    setInPlazaF(!!parts?.plaza?.object?.visible && P.inPlaza !== false);   // AD#8: festa in the square (the floor of gold ripples)
    // the growth from the tower: restarts when the part comes in, ~16 s to fill the walls (faster with the resonance)
    if (arrive < 0.05) growT = 0; else growT += dt * (1 + 1.5 * Math.min(1, U.Ve.value + (U.bloom.value || 0)));
    U.grow.value = (P.growFrom ?? true) === false ? 30 : 0.5 + 12.5 * smoother(growT / 16);
    U.sandAmt.value = Math.min(1, Math.max(0, num('sand', 1)));
    U.sandGlow.value = Math.max(0, num('sandGlow', 1)) * 1.8 * (1 + 0.5 * bloomEnv) * (GL ? 1.4 : 1) * U.duck.value * (inCrown ? 0.2 + 0.8 * U.rain.value : 0.75);   // T-053: the resting sand is dust, not a speckle over everything
    { const qk = Math.max(0, num('quiet', 1));
      U.quiet.value = Math.min(1, qk); U.qmax.value = 0.028 / Math.max(1, qk); U.veil.value = Math.min(0.6, 0.12 * qk);
      U.swellA.value = Math.max(0, num('swell', 1)) * (0.85 + 0.35 * Ve) * (inCrown ? 1 - 0.75 * U.crownOn.value : 1);   // T-053: the crown's mirror is calm (no murky blotches)
      U.envLift.value = 0.035 * Math.sin(time * 0.21) * (0.4 + 0.6 * Ve);                 // the room floats: the reflected fiesta bobs slowly
      U.lvl.value = (0.8 + 0.2 * Ve) * (inCrown ? 1 - U.crownOn.value * (0.42 - 0.3 * U.fill.value) : 1); }   // T-053: the crown opens luminous (was 0.2 of the metal at its start)
    r.compute(sandCompute);
  }

  // textObstacles() (director 25-11): what stands in the text's band, for the host's text placer: [{ wall, x, half, y0, y1 }]
  // (wall index, metres from the wall's centre along it, half-width m, heights m from the floor). Allocation-light (a few per call).
  const _to = [], _tp = new THREE.Vector3();
  function wallOf(p) {
    const ex = p.x - room.eye.x, ez = p.z - room.eye.z; let best = -1, bt = Infinity, bx = 0;
    room.walls.forEach((w, i) => { const den = -(ex * w.normal.x + ez * w.normal.z); if (den <= 1e-4) return; const d = -((w.pa.x - room.eye.x) * w.normal.x + (w.pa.z - room.eye.z) * w.normal.z); const t = d / den;
      const hx = room.eye.x + ex * t - w.centre.x, hz = room.eye.z + ez * t - w.centre.z, x = hx * w.right.x + hz * w.right.z;
      if (t > 0 && t < bt && Math.abs(x) <= w.width / 2 + 0.01) { bt = t; best = i; bx = x; } });
    return best < 0 ? null : { wall: best, x: bx };
  }
  function textObstacles() {   // the echo fronts (full height: they cross 1.4–2.1 m), where they are on the walls
    _to.length = 0;
    for (const v of FR) { if (v.w < 0.05) continue; for (const sg of [-1, 1]) { let s = (v.x + sg * v.y) % PER; if (s < 0) s += PER; let wi = 0; while (wi < NW - 1 && s >= cum[wi + 1]) wi++; _to.push({ wall: wi, x: s - cum[wi] - walls[wi].width / 2, half: 0.5, y0: 0, y1: walls[wi].height, kind: 'front' }); } }
    return _to;
  }
  return {
    object, textObstacles,
    update,
    get resonance() { return Rs; },
    get bloom() { return bloomEnv; },
    get fronts() { return FR.slice(0, U.nFr.value).map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), v.z, +v.w.toFixed(2)]); },   // T-047: for the lab's checks (s0, run, gen, alpha)
    setParams() { /* read live */ },
    dispose() {
      for (const t of [...sim, der, derB]) t.dispose();
      plateMat.dispose(); pcMat.dispose(); pcGeo.dispose(); hoopMat.dispose(); hoopGeo.dispose(); farMesh.geometry.dispose(); farMesh.material.dispose(); try { fxBc?.close(); } catch { /* closed */ }
      sm.dispose(); shM.dispose(); shG.dispose(); simMat.dispose(); derMat.dispose();
      for (const h of halos) h.mesh.material.dispose();
      object.traverse((o) => { if (o.isMesh && o.geometry !== shG && o.name !== 'room:halo') o.geometry.dispose(); });   // the halo's plane is the room's, shared
      for (const b of [bSeed, bS, bX, bP, bC]) b.value?.dispose?.();
    },
  };
}
