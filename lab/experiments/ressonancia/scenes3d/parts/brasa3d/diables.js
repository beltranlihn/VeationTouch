// Ressonància — «brasa»: the CORREFOCS (diables), sculpted. Owner: DIA (T-064). Mounted by ../brasa3d.js (BRA, T-063).
//
// What it is (spec: lab/estudio/ARTE-BRASA.md §c): a readable fire devil of 1.75 m (1.85 m with the horns), drawn as a SCULPTED body,
// not a cloud. Per figure:
//   Body       26 tapered capsules on a procedural 30-joint skeleton (CPU): torso, hood with a peak, two 14 cm horns (two segments
//              each, curving out and up, warming to the tip), two slit ember eyes, arms, legs, feet; CLOTHES (T-064b): a deep
//              hood with volume and a coat skirt to mid-shin, in cloth folds, the hem trimmed with embers. Charcoal #23201E, lit
//              by the cold rim #9FB4C8 (true from every wall camera) and by its own fire (the carretilles above it, the ember ring
//              below), with sparse 1-px lava seams on the limbs and torso (none on the cloth).
//              The forca (2.1 m, held at 60–75° over the head, a V of two prongs) and the two carretilles (Ø 8 cm, #FFE9B0, five
//              spokes turning 3.5×/s, ≤ 1.5 HDR: a small wheel, not a bloom ball) are capsules of the same mesh.
//   Needles    1 800 oriented needles (ref 07/08) of 2–3 cm lying DOWN along the body (feathers, not fur), swept back a little
//              by the run, glowing #B3260E → #FF7A1A → #FFD27A with the heat (most on shoulders and arms, few on the cloth);
//              additive, never thinner than ~1.2 px, hidden behind the body (depth).
//   Tongues    7 cut-paper flame tongues (4 nested layers each: red, orange, amber, cream — the foguera's palette, 2.2 cm apart),
//              25–45 cm, on the shoulders, the hood and the coat; one peels off every ~0.6 s, rises 0.6 m turning and goes out to
//              garnet in 1.2 s, then a new one grows in its place. Matte, self-lit below the bloom threshold.
//   Motes      ~30 % of the light: 240 embers rising off the body + 2 × 100 near sparks spinning off each carretilla (analytic,
//              velocity-compensated so they stay in the world while the devil runs). The long umbrella of sparks (cone 120°
//              down, r 1.2–1.6 m, bounce on the water) is BRA's GPU sparks, fed through `emit` (2 emitters per devil per frame at
//              most, every other frame).
//   Motion     correfoc skipping steps: 2 hops/s at 1.4 m/s, feet PLANTED in the world (no sliding: each swing lands where the
//              body will be at mid-stance), two-bone IK legs and arms, torso 12° forward (more when running), knees bent, a full
//              turn on the spot every 4–5 s with the forca up; facing eased from the real velocity; the relay's leap (slot.hop)
//              tucks the legs. Everything eased; nothing jitters.
//   Arrive / leave   ASSEMBLE from embers (the needles fly in from the floor, the body builds from the feet up behind a burning
//              front 15 % of its height wide, the tongues grow); DISSOLVE into sparks (the top first: the front sinks from the
//              horns, every tongue peels off, the needles lift up and apart, a last flash of the carretilles).
// Reflection: everything is drawn a second time through `mirP` (BRA's liquid chrome): the solid parts as a transparent copy
// (opacity 0.6 · U.refl, tinted by CHROME) so they draw OVER the floor (which writes no depth), the light parts additive.
//
// API (agreed with BRA through the director, 25-11)
//   import { createDiables } from './brasa3d/diables.js';
//   const D = createDiables({ THREE, TSL, room, world, U, mirP, CHROME, fireRamp, emit, MAXD, ringPoint });
//     world      the group the meshes go in (BRA's `world`: local y = 0 is the water)   (D.meshes are already added to it)
//     U          { time, leave, devils, refl } TSL uniforms (BRA's; `devils` = gain × crowd, `refl` = mirror strength)
//     mirP       Fn(p) → the mirrored local point (BRA's); null = no reflection      CHROME  vec3 node, the metal's tint (or null)
//     fireRamp   unused (kept for the agreed signature: the palette here is ARTE-BRASA's)
//     emit       BRA's spark emitter (n, x,y,z, spread, dx,dy,dz, cone, vmin,vmax, lmin,lmax, heat, g, drag, ix,iy,iz) or null
//     MAXD       slots (≤ 14)      ringPoint(s, d, outVec3) → the floor point (local) at perimeter s, d m beyond the wall
//   D.update(dt, time, slots)   once per frame, AFTER BRA moved its slots (spawn, relay, age, k, dis): slots = BRA's devils[]
//       per slot { on, s, d, h, k (assemble 0..1), dis (dissolve 0..1), hop (m), gain, style (0 | 1), age, born } — DIA reads
//       them only; BRA keeps spawning, life, the relay, the heat it adds to the bed. DIA owns phase, gait, pose and the carretilles.
//   D.root(i, out)  the pelvis of slot i (Vector3, local) — BRA's window.__brasa.roots() hook
//   D.meshes        [body, needles, tongues, motes, + their mirrors]   D.dispose()   D.info { joints, perDevil: {...}, drawCalls }
//
// Mount snippet for brasa3d.js (behind a flag, replacing section «4. diables» and the devil loop in update()):
//   import { createDiables } from './brasa3d/diables.js';                        // top of the file
//   const DIA = (P.diables ?? 1) > 0 ? createDiables({ THREE, TSL, room, world, U, mirP, CHROME, fireRamp, emit, MAXD, ringPoint }) : null;
//   // (create it AFTER mirP, CHROME and emit exist; with DIA, do not build devilMesh / uJ / uDS)
//   // in update(), where the devils loop is: keep age / k / dis / s / on (and addHeat), drop pose(), JV, DS and the carretille emit:
//   //   for (const dv of devils) if (dv.on) { dv.age += dt; dv.k = Math.min(1, dv.k + dt / 0.9); if (dv.age > dv.life || leave > 0.3) dv.dis = Math.min(1, dv.dis + dt / 1.8);
//   //     if (dv.dis >= 1) { dv.on = false; continue; } if (!dv.res) dv.s += …; addHeat(dyn, dv.s, dt * 0.5, 0.7); }
//   //   DIA.update(dt, time, devils);
//   // window.__brasa.roots: devils.map((d, i) => (d.on && d.dis === 0 ? (DIA.root(i, _v), [i, _v.x, _v.z, d.wave ? 1 : 0]) : null)).filter(Boolean)
//   // dispose(): DIA.dispose();   (and drop ...devilMesh from the dispose list)
//
// Cost (14 devils): 8 draw calls per wall camera (4 + 4 mirrored). Per devil 26 capsules (~2.6k tris), 1 800 needle quads, 28 tongue
// layers (48 tris each), 440 mote quads — ~32k quads + 37k tris for 14 devils, ×2 with the mirror (today: 63k additive quads ×2).
// Uniforms: 30 joints + 3 vec4 per devil (462 vec4 at 14). CPU: one pose per devil (~200 vector ops), nothing allocated per frame.
// WebGPU and WebGL2 (no compute, no textures). Study page: ./diables/study.html (?mode=close | dance | run | cycle, ?gl=1).

export const NJ = 30;
// joints: 0 pelvis · 1 chest · 2 neck · 3 head · 4/5 shoulder L/R · 6/7 elbow · 8/9 hand · 10/11 hip · 12/13 knee · 14/15 ankle ·
// 16/17 toe · 18 forca foot · 19 forca top · 20/21 prong tips (carretilles) · 22/23 horn tips · 24/25 horn bases · 26/27 horn mids ·
// 28 hood peak · 29 coat hem
// segments: [jointA, jointB, radiusA, radiusB, kind (0 body · 1 forca · 2 carretilla · 3 horn), needle weight, tongue anchors]
const SEG = [
  [0, 1, 0.135, 0.15, 0, 0.8], [1, 2, 0.155, 0.06, 0, 1.0], [4, 5, 0.07, 0.07, 0, 1.4], [3, 3, 0.098, 0.098, 0, 0.0],
  [2, 28, 0.155, 0.045, 0, 0.45], [4, 6, 0.058, 0.046, 0, 1.3], [5, 7, 0.058, 0.046, 0, 1.3], [6, 8, 0.046, 0.034, 0, 1.0],
  [7, 9, 0.046, 0.034, 0, 1.0], [10, 11, 0.1, 0.1, 0, 0.3], [10, 12, 0.085, 0.062, 0, 0.3], [11, 13, 0.085, 0.062, 0, 0.3],
  [12, 14, 0.058, 0.04, 0, 0.45], [13, 15, 0.058, 0.04, 0, 0.45], [14, 16, 0.043, 0.03, 0, 0.2], [15, 17, 0.043, 0.03, 0, 0.2],
  [0, 29, 0.15, 0.25, 0, 0.12],
  [18, 19, 0.017, 0.016, 1, 0], [19, 20, 0.013, 0.011, 1, 0], [19, 21, 0.013, 0.011, 1, 0], [20, 20, 0.04, 0.04, 2, 0], [21, 21, 0.04, 0.04, 2, 0],
  [24, 26, 0.04, 0.026, 3, 0], [26, 22, 0.026, 0.005, 3, 0], [25, 27, 0.04, 0.026, 3, 0], [27, 23, 0.026, 0.005, 3, 0],
];
// tongues: [segment index, t along it, angle round it (rad, 0 = the devil's front), cap (sphere: polar cos), length (m), width (m)]
const TONGUES = [
  [5, 0.1, -0.9, 0, 0.42, 0.1], [6, 0.1, 0.9, 0, 0.42, 0.1],            // shoulders (front-out)
  [4, 0.25, Math.PI, 0, 0.36, 0.1], [4, 0.35, Math.PI * 0.7, 0, 0.28, 0.08],  // hood: back, back-side
  [16, 0.7, -1.9, 0, 0.36, 0.1], [16, 0.72, 1.9, 0, 0.36, 0.1], [16, 0.65, Math.PI, 0, 0.45, 0.12],   // coat: sides and back
];
const NT = TONGUES.length, NLAYER = 4, PER_NEEDLE = 1800, PER_EMBER = 240, PER_SPARK = 200;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createDiables(ctx) {
  const { THREE, TSL, room, world, U, mirP = null, CHROME = null, emit = null, ringPoint } = ctx;
  const MAXD = Math.min(14, ctx.MAXD ?? 14);
  const {
    uniformArray, attribute, varying, positionGeometry, uv, vec2, vec3, vec4, float, int, sin, cos, exp, mix, clamp, smoothstep, max,
    min, abs, sqrt, fract, pow, dot, normalize, length, select, cross, modelViewMatrix, modelWorldMatrix, cameraProjectionMatrix,
    cameraPosition, mx_noise_float, atan, fwidth,
  } = TSL;
  const col = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };   // sRGB hex → linear
  const C = {
    char: col(0x23201E), rim: col(0x9FB4C8), garnet: col(0x6E1410), red: col(0xC8281A), orange: col(0xEE6A1F), amber: col(0xF2B23A),
    cream: col(0xF4E3C8), lavaEdge: col(0xB3260E), lavaMid: col(0xFF7A1A), lavaCore: col(0xFFD27A), sparkHot: col(0xFFE9B0), sparkEnd: col(0x8A1F0E), clothDark: col(0x4A1A12), ember: col(0x3A1A10),
  };
  const UP = vec3(0, 1, 0);
  const tint = CHROME || vec3(1, 0.93, 0.84);
  const flashN = (p) => (room && room.flash ? room.flash(p) : float(0));
  // the angular size of a pixel (for the needles' minimum width): wall height / its pixels / distance to the wall
  let pxA = 0.0016;
  if (room && room.walls && room.walls[0] && room.eye) {
    const w0 = room.walls[0], dW = Math.max(1, -new THREE.Vector3().subVectors(w0.pa, room.eye).dot(w0.normal));
    pxA = (w0.height / (w0.rect?.h || 456)) / dW;
  }

  // ------------------------------------------------------------------------------------------------ per-devil uniforms
  const JV = []; for (let i = 0; i < MAXD * NJ; i++) JV.push(new THREE.Vector4(0, -50, 0, 0));
  const DS = [], DV = [], DF = [];
  for (let i = 0; i < MAXD; i++) { DS.push(new THREE.Vector4()); DV.push(new THREE.Vector4(0, 0, 0, 1)); DF.push(new THREE.Vector4(1, 0, 0, 0)); }
  const uJ = uniformArray(JV, 'vec4');      // joints (local)
  const uDS = uniformArray(DS, 'vec4');     // k (assemble), dis (dissolve), gain, floor y (incl. the leap)
  const uDV = uniformArray(DV, 'vec4');     // velocity (local, m/s), h (scale)
  const uDF = uniformArray(DF, 'vec4');     // facing (horizontal unit), seed

  // ------------------------------------------------------------------------------------------------ shared node helpers
  // the frame of a segment: axis dn, length L, and a stable perpendicular pair (ref ≈ the devil's front, side)
  const segFrame = (A, B, Fv) => {
    const d = B.sub(A), L = length(d);
    const dn = select(L.greaterThan(1e-4), d.div(max(L, 1e-4)), UP);
    const r0 = Fv.sub(dn.mul(dot(Fv, dn))), r1 = UP.sub(dn.mul(dn.y));
    const ref = normalize(r0.add(r1.mul(0.3)).add(vec3(1e-4, 0, 2e-4)));
    return { dn, L, ref, side: cross(dn, ref) };
  };
  // the body's build / burn factor at a point (assemble from the feet up, dissolve from the top down) and its burning edge
  const bodyGrow = (py, ds, h) => {
    const yRel = clamp(py.sub(ds.w).div(h.mul(1.85)), 0, 1);
    const eA = clamp(ds.x.mul(1.35).sub(0.12).sub(yRel).div(0.15), 0, 1);          // a front rising from the feet (15 % of the height wide)
    const vD = clamp(yRel.sub(float(1.1).sub(ds.y.mul(1.35))).div(0.15), 0, 1);    // a front sinking from the horns
    const g = smoothstep(0, 1, eA).mul(float(1).sub(smoothstep(0, 1, vD)));
    return { g, edge: g.mul(float(1).sub(g)).mul(4.0), vD, yRel };                 // edge: the burning band at the front
  };
  // a surface point of a segment: t along, th round, c = polar cos on the caps / spheres
  const surface = (A, B, fr, t, th, c, rad) => {
    const ring = fr.ref.mul(cos(th)).add(fr.side.mul(sin(th)));
    const nrm = ring.mul(sqrt(max(float(1).sub(c.mul(c)), 0))).add(fr.dn.mul(c));
    return { nrm, p: A.add(fr.dn.mul(t.mul(fr.L))).add(nrm.mul(rad)) };
  };
  // a view-space streak from P0 to P1, `w` metres wide, never under ~1.2 px; returns { clip, k } (k: brightness kept for the width)
  const streak = (P0, P1, w) => {
    const va = modelViewMatrix.mul(vec4(P0, 1)), vb = modelViewMatrix.mul(vec4(P1, 1));
    const ax = vb.xy.sub(va.xy), al = max(length(ax), 1e-5);
    const perp = vec2(ax.y.negate(), ax.x).div(al), dir2 = ax.div(al);
    const gy = positionGeometry.y.add(0.5), mv = mix(va, vb, gy);
    const wpx = max(w, mv.z.negate().mul(pxA * 1.25));
    const ext = dir2.mul(positionGeometry.y.mul(wpx));                // round the ends by half a width
    const out = vec4(mv.xy.add(perp.mul(positionGeometry.x.mul(wpx))).add(ext), mv.z, 1);
    return { clip: cameraProjectionMatrix.mul(out), k: w.div(wpx) };
  };
  const HIDE = vec4(0, 0, 2, 1);
  const quadGeo = (n, attrs) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k], 4));
    g.instanceCount = n;
    return g;
  };
  const meshes = [];
  const addMesh = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; world.add(m); meshes.push(m); return m; };
  const mirrors = mirP ? [false, true] : [false];
  const ghost = (m) => { m.transparent = true; m.depthWrite = true; m.blending = THREE.NormalBlending; };   // solid parts in the mirror

  // ------------------------------------------------------------------------------------------------ 1. the body (capsules)
  const bodyGeo = (() => {
    const base = new THREE.CapsuleGeometry(1, 1, 4, 12, 1);           // y: −1.5..1.5, the cylinder −0.5..0.5
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
    const n = MAXD * SEG.length, aJ = new Float32Array(n * 4), aK = new Float32Array(n * 4);
    for (let s = 0; s < MAXD; s++) SEG.forEach(([a, b, ra, rb, kind], j) => {
      const i = s * SEG.length + j;
      aJ.set([s * NJ + a, s * NJ + b, ra, rb], i * 4); aK.set([s, kind, j, b === 29 ? 1 : 0], i * 4);   // w: an open hem (the coat)
    });
    g.setAttribute('aJ', new THREE.InstancedBufferAttribute(aJ, 4)); g.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4));
    g.instanceCount = n;
    return g;
  })();
  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ side: mirror ? THREE.BackSide : THREE.FrontSide });
    if (mirror) ghost(m);
    const J4 = attribute('aJ', 'vec4'), K4 = attribute('aK', 'vec4'), slot = int(K4.x);
    const A = uJ.element(int(J4.x)).xyz, B = uJ.element(int(J4.y)).xyz;
    const ds = uDS.element(slot), dv = uDV.element(slot), df = uDF.element(slot), h = dv.w;
    const fr = segFrame(A, B, df.xyz);
    const y = positionGeometry.y, yc = clamp(y, -0.5, 0.5), t = yc.add(0.5), cap = select(K4.w.greaterThan(0.5).and(y.greaterThan(0.5)), y.sub(yc).mul(0.18), y.sub(yc));
    const isBody = K4.y.lessThan(0.5);
    const gr = bodyGrow(mix(A.y, B.y, t), ds, h);
    // the forca, the prongs and the horns build with the figure too (a hair later), the carretilles light last
    const gk = select(isBody, gr.g, gr.g.mul(smoothstep(0.55, 1.0, ds.x)));
    const rad = mix(J4.z, J4.w, t).mul(h).mul(gk);
    const ring = fr.ref.mul(positionGeometry.x).sub(fr.side.mul(positionGeometry.z));   // (z negated: keeps the winding outward)
    const p = A.add(fr.dn.mul(t.mul(fr.L).add(cap.mul(rad)))).add(ring.mul(rad));
    const nL = normalize(ring.add(fr.dn.mul(cap)).add(vec3(0, 1e-4, 0)));
    const pf = mirror ? mirP(p) : p;
    m.positionNode = pf;
    const vN = varying(mirror ? vec3(nL.x, nL.y.negate(), nL.z) : nL), vW = varying(modelWorldMatrix.mul(vec4(pf, 1)).xyz);
    const vLoc = varying(vec3(positionGeometry.x.mul(rad), t.mul(fr.L).add(cap.mul(rad)), positionGeometry.z.mul(rad)).add(vec3(K4.z.mul(3.7), df.w.mul(11.0), 0)));
    const vGeo = varying(vec4(positionGeometry.x, cap, positionGeometry.z, K4.z));   // the head's own sphere (segment 3: the eyes)
    const vY = varying(y);                                                          // along the capsule (the coat's hem)
    const vTop = varying(uJ.element(int(K4.x.mul(NJ).add(19))).xyz.sub(p));   // to the forca's top (the carretilles' light)
    const vK = varying(vec4(K4.y, gr.edge, ds.z, select(J4.w.lessThan(0.01), t, t.mul(0.4))));   // w: along the horn (0 base … 1 tip)
    m.colorNode = (() => {
      const N = normalize(vN), V = normalize(cameraPosition.sub(vW)), kind = vK.x;
      const ndv = abs(dot(N, V));
      const rimT = pow(float(1).sub(ndv), 4.5);
      const dTop = length(vTop), Lt = vTop.div(max(dTop, 1e-3));
      const fireLight = max(dot(N, Lt), 0).mul(0.55).div(dTop.mul(dTop).mul(0.6).add(1.0));                     // the carretilles above
      const ringLight = max(N.y.negate(), 0).mul(0.25).add(0.08);                                               // the bed below
      const warm = vec3(1.0, 0.42, 0.13);
      // thin glowing seams (cracks in the charcoal), stuck to the bone
      // (T-064b: half as many, ~1 px wide whatever the distance; none on the cloth)
      const seg = vGeo.w, isCoat = select(abs(seg.sub(16)).lessThan(0.5), float(1), float(0)), isHood = select(abs(seg.sub(4)).lessThan(0.5), float(1), float(0));
      const cloth = max(isCoat, isHood);
      const nz = mx_noise_float(vLoc.mul(2.3)), seam = float(1).sub(smoothstep(0.0, fwidth(nz).mul(1.1).add(1e-4), abs(nz)));
      const pulse = sin(U.time.mul(2.3).add(vLoc.x.mul(30.0)).add(vLoc.y.mul(9.0))).mul(0.25).add(0.75);
      let c = C.ember.add(warm.mul(fireLight.mul(1.8).add(ringLight)).mul(0.36));   // T-064c: hot charcoal, saturated (not grey)
      c = c.add(mix(C.lavaEdge, C.lavaMid, pulse).mul(seam).mul(0.32).mul(select(kind.lessThan(0.5), float(1), float(0))).mul(float(1).sub(cloth)));
      // the cloth: a coat to mid-leg and a deep hood, in folds, the coat's hem trimmed with embers
      const ang = atan(vGeo.z, vGeo.x), fold = sin(ang.mul(isCoat.mul(4).add(5))).mul(0.5).add(0.5);
      const clothC = C.clothDark.mul(fold.mul(0.55).add(0.75)).add(warm.mul(fireLight.mul(1.8).add(ringLight)).mul(0.38));
      const hem = smoothstep(0.4, 0.47, vY).mul(float(1).sub(smoothstep(0.495, 0.5, vY))).mul(isCoat)   // the outside of the hem only (not the underside)
        .mul(pulse.mul(0.3).add(0.7));
      c = mix(c, clothC, cloth).add(mix(C.lavaEdge, C.lavaMid, hem).mul(hem).mul(0.5));
      c = c.add(C.rim.mul(rimT).mul(0.3));
      c = c.add(C.lavaMid.mul(flashN(vW)).mul(rimT).mul(0.5));
      const gd = normalize(vGeo.xyz.mul(vec3(1, 2.6, 1))), onHead = select(abs(vGeo.w.sub(3)).lessThan(0.5), float(1), float(0));   // two ember eyes under the hood
      const eyes = max(smoothstep(0.978, 0.992, dot(gd, normalize(vec3(0.9, 0.2, 0.4)))), smoothstep(0.978, 0.992, dot(gd, normalize(vec3(0.9, 0.2, -0.4)))));
      c = c.add(mix(C.lavaMid, C.lavaCore, eyes).mul(eyes.mul(onHead).mul(1.2)));
      const forca = vec3(0.035, 0.022, 0.016).add(C.rim.mul(rimT).mul(0.35)).add(warm.mul(fireLight).mul(0.2));
      const spokes = pow(sin(atan(vGeo.z, vGeo.x).mul(5.0).sub(U.time.mul(Math.PI * 2 * 3.5))).mul(0.5).add(0.5), 6.0);   // a wheel turning 3.5×/s
      const hot = C.sparkHot.mul(spokes.mul(1.05).add(0.42));
      const horn = C.char.mul(1.3).add(C.rim.mul(rimT).mul(0.7)).add(warm.mul(fireLight).mul(0.15)).add(mix(C.lavaEdge, C.lavaMid, vK.w).mul(0.35));
      c = select(kind.lessThan(0.5), c, select(kind.lessThan(1.5), forca, select(kind.lessThan(2.5), hot, horn)));
      c = c.add(mix(C.lavaMid, C.lavaCore, vK.y).mul(vK.y).mul(1.6));                                                                     // the burning edge (assemble / dissolve)
      c = c.mul(float(1).sub(U.leave.mul(0.6)));
      return mirror ? c.mul(tint) : c;
    })();
    if (mirror) m.opacityNode = U.refl.mul(0.6);
    m.fog = false;
    addMesh(bodyGeo, m, mirror ? -1 : 2);
  }

  // ------------------------------------------------------------------------------------------------ 2. the needles (the skin of fire)
  // sample a segment by its needle weight × area; [seg, t, th, c, len, heat, r1, r2]
  const sampleBody = (r, wKey) => {
    const w = SEG.map((s) => (s[4] === 0 ? s[5 + wKey] * (s[0] === s[1] ? 4 * s[2] * s[2] * 3.2 : 0.45 * (s[2] + s[3]) * 3.2) : 0));
    const tot = w.reduce((a, b) => a + b, 0), cum = []; let acc = 0; for (const x of w) { acc += x / tot; cum.push(acc); }
    return () => { const x = r(); let b = 0; while (b < cum.length - 1 && x > cum[b]) b++; return b; };
  };
  const needleGeo = (() => {
    const r = rng(331), pick = sampleBody(r, 0), n = MAXD * PER_NEEDLE;
    const aJ = new Float32Array(n * 4), aR = new Float32Array(n * 4), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i / PER_NEEDLE), b = pick(), [ja, jb, ra, rb, , wt] = SEG[b];
      const sphere = ja === jb, cylT = r();
      const c = sphere ? 2 * r() - 1 : (r() < 0.08 ? -(r() * 0.8) : 0);
      aJ.set([s * NJ + ja, s * NJ + jb, sphere ? 0 : cylT, r() * Math.PI * 2], i * 4);
      aR.set([ra, rb, 0.02 + 0.01 * r() + 0.008 * Math.max(0, wt - 1), Math.min(1.35, 0.7 + 0.4 * wt) * (0.8 + 0.2 * r())], i * 4);
      aS.set([s, r(), r(), c], i * 4);
    }
    return quadGeo(n, { aJ, aR, aS });
  })();
  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const J4 = attribute('aJ', 'vec4'), R4 = attribute('aR', 'vec4'), S4 = attribute('aS', 'vec4'), slot = int(S4.x);
    const A = uJ.element(int(J4.x)).xyz, B = uJ.element(int(J4.y)).xyz;
    const ds = uDS.element(slot), dv = uDV.element(slot), df = uDF.element(slot), h = dv.w, r1 = S4.y, r2 = S4.z, tm = U.time;
    const fr = segFrame(A, B, df.xyz);
    const gr = bodyGrow(mix(A.y, B.y, J4.z), ds, h);
    const rad = mix(R4.x, R4.y, J4.z).mul(h).mul(max(gr.g, 0.25));
    const sf = surface(A, B, fr, J4.z, J4.w, S4.w, rad.mul(1.04));
    // assemble: each needle flies in from the embers on the floor, spiralling up (staggered)
    const ka = clamp(ds.x.sub(r1.mul(0.45)).div(0.55), 0, 1), e = ka.mul(ka).mul(float(3).sub(ka.mul(2)));
    const src = vec3(sf.p.x.add(r2.sub(0.5).mul(1.3)), ds.w.add(0.02), sf.p.z.add(fract(r1.mul(17.3)).sub(0.5).mul(1.3)));
    let p = mix(src, sf.p, e);
    // dissolve: up and apart, the top first
    const v = clamp(ds.y.mul(1.7).sub(r1.mul(0.4)).sub(float(1).sub(gr.yRel).mul(0.3)), 0, 1);
    p = p.add(vec3(sin(r2.mul(6.283).add(v.mul(2.0))).mul(v).mul(0.6), v.mul(v).mul(r1.mul(2.5).add(1.2)), cos(fract(r1.mul(7.1)).mul(6.283).add(v.mul(2.0))).mul(v).mul(0.6)).mul(h));
    // combed DOWN along the body (feathers, not fur): the surface's downward tangent + the limb's downward axis, a hair off
    // the surface, swept back a little by the run; alive (each needle flickers in length)
    const sway = df.xyz.mul(sin(tm.mul(r2.mul(3.0).add(2.0)).add(r1.mul(40.0))).mul(0.06));
    const downT = UP.negate().add(sf.nrm.mul(sf.nrm.y)), axDown = fr.dn.mul(select(fr.dn.y.greaterThan(0.0), float(-1), float(1)));
    const dirN = normalize(downT.add(axDown.mul(0.35)).add(sf.nrm.mul(0.22)).add(sway).sub(dv.xyz.mul(0.05)).add(vec3(1e-4, 0, 0)));
    const flick = sin(tm.mul(r2.mul(5.0).add(4.0)).add(r1.mul(60.0))).mul(0.5).add(0.5);
    const len = R4.z.mul(h).mul(flick.mul(0.45).add(0.6)).mul(float(1).add(v.mul(2.5))).mul(e.mul(0.7).add(0.3));
    const tip = p.add(dirN.mul(len));
    const P0 = mirror ? mirP(p) : p, P1 = mirror ? mirP(tip) : tip;
    const S = streak(P0, P1, float(0.0045).mul(h));
    const heat = R4.w.mul(flick.mul(0.35).add(0.75)).mul(ds.z);
    const fade = float(1).sub(smoothstep(0.45, 1.0, v));
    m.vertexNode = select(ds.x.greaterThan(0.001).and(fade.greaterThan(0.01)), S.clip, HIDE);
    const vC = varying(vec4(heat, S.k.mul(fade).mul(e.mul(0.6).add(0.4)), 0, 0));
    m.colorNode = (() => {
      const q = uv(), g = q.y;                                                     // 0 at the root, 1 at the tip
      const hot = mix(C.lavaMid, C.lavaCore, smoothstep(0.75, 1.25, vC.x));
      const c = mix(C.lavaEdge.mul(0.5), hot, smoothstep(0.1, 0.9, g)).mul(vC.x);
      const across = exp(q.x.sub(0.5).mul(q.x.sub(0.5)).mul(-10.0));
      const ends = smoothstep(0.0, 0.15, g).mul(float(1).sub(smoothstep(0.85, 1.0, g)));
      const out = c.mul(across).mul(ends).mul(vC.y).mul(1.6).mul(U.devils).mul(float(1).sub(U.leave));
      return mirror ? out.mul(tint).mul(U.refl).mul(0.6) : out;
    })();
    m.fog = false;
    addMesh(needleGeo, m, mirror ? -1 : 3);
  }

  // ------------------------------------------------------------------------------------------------ 3. the cut-paper tongues
  const TSEG = 22;
  const tongueGeo = (() => {
    const pos = [], idx = [];
    for (let i = 0; i <= TSEG; i++) { const v = i / TSEG; pos.push(-1, v, 0, 1, v, 0); }
    for (let i = 0; i < TSEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const n = MAXD * NT * NLAYER, aJ = new Float32Array(n * 4), aT = new Float32Array(n * 4), aC = new Float32Array(n * 4), r = rng(97);
    let i = 0;
    for (let s = 0; s < MAXD; s++) {
      const per = 4.2 + r() * 0.8, order = [0, 4, 2, 6, 1, 5, 3];                  // one tongue peels off every ~0.6 s, round the body
      for (let k = 0; k < NT; k++) {
        const [sg, t, th, , len, wid] = TONGUES[k], [ja, jb, ra, rb] = SEG[sg], seed = r(), off = order.indexOf(k) / NT + (r() - 0.5) * 0.04;
        for (let l = 0; l < NLAYER; l++, i++) {
          aJ.set([s * NJ + ja, s * NJ + jb, t, th], i * 4);
          aT.set([len * (0.9 + 0.2 * seed), wid, l, ra + (rb - ra) * t], i * 4);   // w: the segment's radius there
          aC.set([per, off, seed, s], i * 4);
        }
      }
    }
    g.setAttribute('aJ', new THREE.InstancedBufferAttribute(aJ, 4)); g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    g.instanceCount = n;
    return g;
  })();
  const LAYER_COL = [C.red, C.orange, C.amber, C.cream];
  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    if (mirror) ghost(m);
    const J4 = attribute('aJ', 'vec4'), T4 = attribute('aT', 'vec4'), C4 = attribute('aC', 'vec4'), slot = int(C4.w);
    const A = uJ.element(int(J4.x)).xyz, B = uJ.element(int(J4.y)).xyz;
    const ds = uDS.element(slot), dv = uDV.element(slot), df = uDF.element(slot), h = dv.w, seed = C4.z, tm = U.time, layer = T4.z;
    const fr = segFrame(A, B, df.xyz);
    const gr = bodyGrow(mix(A.y, B.y, J4.z), ds, h);
    const sf = surface(A, B, fr, J4.z, J4.w, float(0), T4.w.mul(h).mul(gr.g));   // on the segment's surface
    // the cycle: grow (0..0.1) · attached · peel off for the last 1.2 s; dissolving: every tongue peels off
    const per = C4.x, cyc = fract(tm.div(per).add(C4.y)), det0 = float(1).sub(float(1.2).div(per));
    const aDc = clamp(cyc.sub(det0).mul(per).div(1.2), 0, 1);
    const aD = max(aDc, clamp(ds.y.mul(1.6), 0, 1)), isDet = aD.greaterThan(0.0);
    const grow = smoothstep(0.0, 0.1, cyc).mul(smoothstep(0.35, 0.9, ds.x)).mul(select(ds.y.greaterThan(0.0), float(1), gr.g.mul(0.5).add(0.5)));
    // the tongue's own frame: grows up (combed back by the run), faces out from the body
    const g = normalize(UP.mul(0.9).add(sf.nrm.mul(0.45)).sub(dv.xyz.mul(0.07)));
    const w = normalize(cross(sf.nrm, g).add(vec3(1e-4, 0, 0))), nOut = cross(g, w);
    const sc = float(1).sub(layer.mul(0.17));                                     // nested: the back layer biggest, cream in front
    const v = positionGeometry.y, u = positionGeometry.x;
    const L = T4.x.mul(h).mul(sc).mul(grow).mul(float(1).sub(aD.mul(0.35)));
    const lobes = sin(v.mul(13.0).add(seed.mul(9.0)).add(tm.mul(2.0))).mul(0.16).add(1.0);
    const wid = T4.y.mul(h).mul(sc).mul(grow).mul(pow(float(1).sub(v), 0.85)).mul(smoothstep(-0.08, 0.22, v)).mul(lobes);
    const sw = sin(v.mul(4.2).add(seed.mul(5.0)).add(tm.mul(2.6)).add(layer.mul(0.08))).mul(pow(v, 1.3)).mul(0.07).mul(h).mul(float(1).add(aD));
    const curl = v.mul(v).mul(0.07).mul(h).sub(u.mul(u).mul(wid).mul(0.35)).add(layer.mul(0.02).mul(h)).sub(0.015);
    let o = g.mul(v.mul(L)).add(w.mul(sw.add(u.mul(wid)))).add(nOut.mul(curl));
    // peeled off: it stays in the world (velocity-compensated), rises 0.6 m turning and shrinks
    const tD = aD.mul(1.2), ang = aD.mul(2.6).mul(select(seed.greaterThan(0.5), float(1), float(-1)));
    const ca = cos(ang), sa = sin(ang);
    const oR = vec3(o.x.mul(ca).sub(o.z.mul(sa)), o.y, o.x.mul(sa).add(o.z.mul(ca))).mul(float(1).sub(aD.mul(0.55)));
    o = select(isDet, oR, o);
    const baseP = sf.p.add(select(isDet, dv.xyz.mul(tD.negate()).add(UP.mul(float(0.6).mul(h).mul(float(1).sub(pow(float(1).sub(aD), 2.0))))), vec3(0, 0, 0)));
    const p = baseP.add(o);
    const pf = mirror ? mirP(p) : p;
    m.positionNode = pf;
    const vW = varying(modelWorldMatrix.mul(vec4(pf, 1)).xyz), vNo = varying(mirror ? vec3(nOut.x, nOut.y.negate(), nOut.z) : nOut);
    const vUV = varying(vec4(u, v, layer, aD));
    m.colorNode = (() => {
      const N = normalize(vNo), V = normalize(cameraPosition.sub(vW)), au = abs(vUV.x), lay = vUV.z, die = vUV.w;
      const key = abs(dot(N, normalize(vec3(-0.45, 0.8, 0.35)))).mul(0.45).add(0.55);
      let base = LAYER_COL[0];
      for (let k = 1; k < NLAYER; k++) base = select(lay.greaterThan(k - 0.5), LAYER_COL[k], base);
      const shade = smoothstep(0.45, 1.0, au).mul(0.38).add(0.62);                  // the layer above shades this one inside
      const edge = smoothstep(0.86, 0.98, au);                                       // the cut edge catches the cold rim
      const fresnel = pow(float(1).sub(abs(dot(N, V))), 2.0);
      let c = base.mul(key).mul(shade).mul(0.95);
      c = c.add(C.rim.mul(edge.mul(0.12).add(fresnel.mul(0.06))));
      c = c.add(C.lavaMid.mul(float(1).sub(smoothstep(0.0, 0.25, vUV.y))).mul(0.18).mul(float(1).sub(lay.div(4))));   // hot at the root
      c = c.add(C.amber.mul(flashN(vW)).mul(edge.add(0.2)).mul(0.35));
      c = mix(c, C.garnet.mul(0.5), smoothstep(0.15, 0.75, die)).mul(float(1).sub(smoothstep(0.7, 1.0, die).mul(0.8)));
      c = c.mul(ds.z.mul(0.25).add(0.75)).mul(float(1).sub(U.leave.mul(0.6)));
      return mirror ? c.mul(tint) : c;
    })();
    if (mirror) m.opacityNode = U.refl.mul(0.6);
    m.fog = false;
    addMesh(tongueGeo, m, mirror ? -1 : 2);
  }

  // ------------------------------------------------------------------------------------------------ 4. motes: embers off the body, sparks off the carretilles
  const PER_MOTE = PER_EMBER + PER_SPARK;
  const moteGeo = (() => {
    const r = rng(511), pick = sampleBody(r, 0), n = MAXD * PER_MOTE;
    const aJ = new Float32Array(n * 4), aR = new Float32Array(n * 4), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i / PER_MOTE), k = i % PER_MOTE;
      if (k < PER_EMBER) {
        const b = pick(), [ja, jb, ra, rb] = SEG[b];
        aJ.set([s * NJ + ja, s * NJ + jb, ja === jb ? 0 : r(), r() * Math.PI * 2], i * 4);
        aR.set([ra, rb, 0.8 + r() * 0.7, 0], i * 4);                                // life
        aS.set([s, r(), r(), ja === jb ? 2 * r() - 1 : 0], i * 4);
      } else {
        const e = k % 2;
        aJ.set([s * NJ + 20 + e, s * NJ + 20 + e, 0, r() * Math.PI * 2], i * 4);
        aR.set([0, 0, 0.32 + r() * 0.2, 1], i * 4);                                  // life, kind 1
        aS.set([s, r(), r(), e], i * 4);
      }
    }
    return quadGeo(n, { aJ, aR, aS });
  })();
  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const J4 = attribute('aJ', 'vec4'), R4 = attribute('aR', 'vec4'), S4 = attribute('aS', 'vec4'), slot = int(S4.x);
    const A = uJ.element(int(J4.x)).xyz, B = uJ.element(int(J4.y)).xyz;
    const ds = uDS.element(slot), dv = uDV.element(slot), df = uDF.element(slot), h = dv.w, r1 = S4.y, r2 = S4.z, tm = U.time;
    const isSpark = R4.w.greaterThan(0.5), life = R4.z;
    const age = fract(tm.div(life).add(r1)).mul(life), x = age.div(life);
    // embers: born on the body, rising and curling, left behind in the world as the devil moves
    const fr = segFrame(A, B, df.xyz);
    const gr = bodyGrow(mix(A.y, B.y, J4.z), ds, h);
    const sf = surface(A, B, fr, J4.z, J4.w, S4.w, mix(R4.x, R4.y, J4.z).mul(h).mul(1.05));
    const swirl = vec3(sin(tm.mul(1.7).add(r2.mul(30.0))), 0, cos(tm.mul(1.3).add(r1.mul(23.0)))).mul(x.mul(0.12));
    const rise = float(0.35).add(r2.mul(0.45)).add(ds.y.mul(1.6));
    const pE = sf.p.sub(dv.xyz.mul(age)).add(UP.mul(x.mul(rise).mul(h))).add(sf.nrm.mul(x.mul(0.12))).add(swirl);
    const vE = UP.mul(rise.div(life)).sub(dv.xyz).mul(0.04);
    // assemble: the embers come up from the floor round the feet
    const ka = clamp(ds.x.mul(1.3).sub(r2.mul(0.3)), 0, 1);
    const srcE = vec3(sf.p.x.add(cos(r1.mul(40.0)).mul(0.7)), ds.w.add(x.mul(0.5)), sf.p.z.add(sin(r1.mul(40.0)).mul(0.7)));
    const pEm = mix(srcE, pE, ka);
    // sparks: thrown off the spinning carretilla (3.5 turns/s) into an umbrella, falling; velocity-compensated
    const tB = tm.sub(age), aB = tB.mul(Math.PI * 2 * 3.5).add(r2.mul(6.283)).add(S4.w.mul(Math.PI));
    const spd = float(2.4).add(r2.mul(2.0)).mul(h);
    const v0 = vec3(cos(aB).mul(0.8), float(-0.25).sub(r1.mul(0.55)), sin(aB).mul(0.8)).mul(spd);
    const gV = vec3(0, -7.8, 0);
    const pS = A.sub(dv.xyz.mul(age)).add(v0.mul(age)).add(gV.mul(age.mul(age).mul(0.5)));
    const vS = v0.add(gV.mul(age));
    const P = select(isSpark, pS, pEm), Vv = select(isSpark, vS, vE);
    const tail = P.sub(Vv.mul(select(isSpark, float(0.028), float(1.0))));
    const P0 = mirror ? mirP(tail) : tail, P1 = mirror ? mirP(P) : P;
    const S = streak(P0, P1, select(isSpark, float(0.006), float(0.008)).mul(h));
    const live = ds.x.mul(float(1).sub(ds.y.mul(0.85)));
    const sparkOn = smoothstep(0.7, 1.0, ds.x).mul(float(1).sub(smoothstep(0.0, 0.25, ds.y)));
    const on = select(isSpark, sparkOn, live.mul(gr.g.mul(0.6).add(0.4)).add(ds.y.mul(0.8)));
    m.vertexNode = select(on.greaterThan(0.01).and(P.y.greaterThan(ds.w.sub(0.02))), S.clip, HIDE);
    const T = select(isSpark, float(1).sub(x).mul(1.8), float(1).sub(x).mul(1.2));
    const vC = varying(vec4(T, S.k.mul(on), select(isSpark, float(1), float(0)), 0));
    m.colorNode = (() => {
      const q = uv(), across = exp(q.x.sub(0.5).mul(q.x.sub(0.5)).mul(-10.0));
      const T2 = vC.x;
      const c = mix(mix(C.sparkEnd, C.lavaMid, smoothstep(0.1, 0.8, T2)), C.sparkHot, smoothstep(0.9, 1.6, T2)).mul(T2.mul(0.9).add(0.15));
      const g = mix(float(0.55), float(1.3), vC.z);
      const out = c.mul(across).mul(smoothstep(0.0, 0.5, q.y).add(0.2)).mul(vC.y).mul(g).mul(U.devils).mul(float(1).sub(U.leave));
      return mirror ? out.mul(tint).mul(U.refl).mul(0.6) : out;
    })();
    m.fog = false;
    addMesh(moteGeo, m, mirror ? -1 : 4);
  }

  // ------------------------------------------------------------------------------------------------ 5. the skeleton and the dance (CPU)
  const J = []; for (let i = 0; i < NJ; i++) J.push(new THREE.Vector3());
  const ST = [];
  for (let i = 0; i < MAXD; i++) ST.push({ on: false, age: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), F: new THREE.Vector3(1, 0, 0), ph: 0,
    foot: [new THREE.Vector3(), new THREE.Vector3()], from: [new THREE.Vector3(), new THREE.Vector3()], sw: [false, false], acc: 0, wasDis: false, seed: 0, root: new THREE.Vector3() });
  const UPV = new THREE.Vector3(0, 1, 0), R = new THREE.Vector3(), F = new THREE.Vector3(), Sd = new THREE.Vector3(), Sd0 = new THREE.Vector3();
  const spine = new THREE.Vector3(), poleD = new THREE.Vector3(), barD = new THREE.Vector3(), toEye = new THREE.Vector3(), fdes = new THREE.Vector3();
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tgt = new THREE.Vector3();
  const _d = new THREE.Vector3(), _b = new THREE.Vector3();
  const eye = room?.eye || new THREE.Vector3(0, 1.6, 0);
  // two-bone IK (from brasa3d): A root, T target, l1/l2 lengths, pole hint → outJ (middle joint), outE (end)
  function ik2(A, T, l1, l2, pole, outJ, outE) {
    _d.subVectors(T, A); const D = _d.length() || 1e-4; _d.multiplyScalar(1 / D);
    const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _b.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); _b.normalize();
    outJ.copy(A).addScaledVector(_d, a).addScaledVector(_b, hh);
    outE.copy(A).addScaledVector(_d, d);
  }
  let SW = 0.42;                                                                   // the share of a cycle each foot swings (0.42 dancing … 0.6 running)
  function init(st, sl) {
    ringPoint(sl.s, sl.d, R);
    st.on = true; st.prev.copy(R); st.vel.set(0, 0, 0); st.ph = Math.random(); st.acc = 0; st.wasDis = false;
    st.seed = ((sl.born ?? Math.random() * 100) * 0.618034) % 1;
    toEye.set(eye.x - R.x, 0, eye.z - R.z).normalize();
    st.F.copy(toEye); Sd.crossVectors(st.F, UPV).normalize();
    const h = sl.h || 1;
    for (let L = 0; L < 2; L++) { st.foot[L].copy(R).addScaledVector(Sd, (L ? 1 : -1) * 0.11 * h).setY(0.075 * h); st.from[L].copy(st.foot[L]); st.sw[L] = false; }
  }
  function pose(i, sl, st, time, dt) {
    const h = sl.h || 1, hop = Math.max(0, sl.hop || 0);
    ringPoint(sl.s, sl.d, R);
    // velocity from the real motion (BRA moves s; the relay leaps): smoothed, a teleport resets the feet
    tA.subVectors(R, st.prev).setY(0);
    const raw = tA.length() / Math.max(dt, 1e-3);
    let reset = false;
    if (raw > 12) { st.vel.set(0, 0, 0); reset = true; } else st.vel.lerp(tA.multiplyScalar(1 / Math.max(dt, 1e-3)), 1 - Math.exp(-dt / 0.2));
    st.prev.copy(R);
    const speed = Math.min(3.6, st.vel.length()), runK = clamp01((speed - 1.6) / 1.2), dance = 1 - runK;
    // facing: the way it goes; dancing, it turns now and then to the room; eased
    toEye.set(eye.x - R.x, 0, eye.z - R.z).normalize();
    if (speed > 0.25) fdes.copy(st.vel).setY(0).normalize(); else fdes.copy(st.F);
    const turn = 0.5 + 0.5 * Math.sin(time * 0.55 + st.seed * 19.0), wt = 0.7 * turn * turn * dance;
    fdes.multiplyScalar(1 - wt).addScaledVector(toEye, wt);
    if (fdes.lengthSq() < 1e-6) fdes.copy(st.F);
    st.F.lerp(fdes.normalize(), 1 - Math.exp(-dt * 3.2)).setY(0).normalize();
    Sd0.crossVectors(st.F, UPV).normalize();
    // a full turn on the spot every 4–5 s, the forca up
    const Ps = 4.2 + 0.8 * st.seed, sp = ((time + st.seed * 5.3) / Ps) % 1, SPW = 0.21;
    const spinA = sp < SPW ? smoother(sp / SPW) * Math.PI * 2 * dance : 0, spinUp = sp < SPW ? Math.sin(Math.PI * sp / SPW) * dance : 0;
    F.copy(st.F).applyAxisAngle(UPV, spinA); Sd.crossVectors(F, UPV).normalize();
    // the gait: skipping steps (2 hops/s at 1.4 m/s), feet planted in the world
    const f = 0.8 + 0.22 * speed;
    SW = 0.42 + 0.18 * runK;
    st.ph = (st.ph + f * dt) % 1;
    const Tst = (1 - SW) / f, lift = (0.13 + 0.06 * dance) * h;
    for (let L = 0; L < 2; L++) {
      const local = (st.ph - L * 0.5 + 1) % 1, sg = L ? 1 : -1, foot = st.foot[L];
      tgt.copy(R).addScaledVector(st.vel, Math.max(0, (SW - local) / f) + Tst * 0.5).addScaledVector(Sd0, sg * 0.11 * h);
      if (reset) { foot.copy(tgt).setY(0.075 * h); st.from[L].copy(foot); st.sw[L] = false; continue; }
      if (hop > 0.02) {                                                          // the relay's leap: legs tucked under it
        foot.copy(R).addScaledVector(F, 0.08 * h * sg).addScaledVector(Sd0, sg * 0.1 * h).setY(hop + 0.3 * h);
        st.from[L].copy(foot); st.sw[L] = false; continue;
      }
      if (local < SW) {
        if (!st.sw[L]) { st.sw[L] = true; st.from[L].copy(foot); }
        const u = local / SW, e = smoother(u);
        foot.lerpVectors(st.from[L], tgt, e);
        foot.y = st.from[L].y + (0.075 * h - st.from[L].y) * e + lift * Math.sin(Math.PI * u);
      } else {
        st.sw[L] = false;
        foot.y += (0.075 * h - foot.y) * Math.min(1, dt * 20);
        tA.subVectors(foot, R).setY(0);
        if (tA.length() > 0.9 * h) { foot.copy(tgt).setY(0.075 * h); }           // over-reached (a sharp turn of the ring): step now
      }
    }
    // the pelvis: the skip lifts it during each swing and it sinks a little on landing
    // lowest at each foot's mid-stance (a sharp bounce), highest in between (the skip)
    const midL = SW + (1 - SW) / 2, A0 = (0.04 + 0.02 * dance) * h;
    const bob = A0 * (1 - 2 * Math.abs(Math.cos(Math.PI * 2 * (st.ph - midL))));
    const floorY = hop;
    J[0].copy(R).addScaledVector(Sd0, 0.025 * h * Math.sin(st.ph * Math.PI * 2)).addScaledVector(F, 0.02 * h);
    J[0].y = floorY + (0.865 - 0.01 * runK) * h + bob;
    const lean = 0.21 + 0.14 * runK + 0.04 * Math.sin(st.ph * Math.PI * 4), roll = 0.05 * Math.sin(st.ph * Math.PI * 2);
    spine.copy(UPV).multiplyScalar(Math.cos(lean)).addScaledVector(F, Math.sin(lean)).addScaledVector(Sd, Math.sin(roll)).normalize();
    J[1].copy(J[0]).addScaledVector(spine, 0.42 * h);
    J[2].copy(J[0]).addScaledVector(spine, 0.585 * h);
    J[3].copy(J[2]).addScaledVector(UPV, 0.115 * h).addScaledVector(F, 0.035 * h);
    const tw = 0.05 * Math.sin(st.ph * Math.PI * 2);                             // shoulders turn against the steps
    J[4].copy(J[1]).addScaledVector(UPV, 0.05 * h).addScaledVector(Sd, -0.19 * h).addScaledVector(F, tw * h);
    J[5].copy(J[1]).addScaledVector(UPV, 0.05 * h).addScaledVector(Sd, 0.19 * h).addScaledVector(F, -tw * h);
    J[10].copy(J[0]).addScaledVector(Sd, -0.1 * h); J[11].copy(J[0]).addScaledVector(Sd, 0.1 * h);
    tB.copy(F).addScaledVector(UPV, 0.1);
    for (let L = 0; L < 2; L++) {
      ik2(J[10 + L], st.foot[L], 0.45 * h, 0.44 * h, tB, J[12 + L], J[14 + L]);
      const local = (st.ph - L * 0.5 + 1) % 1, u = local < SW && hop <= 0.02 ? Math.sin(Math.PI * local / SW) : 0;
      J[16 + L].copy(J[14 + L]).addScaledVector(F, (0.15 - 0.03 * u) * h).addScaledVector(UPV, (-0.06 - 0.05 * u) * h);
    }
    // the forca: 2.1 m, held at 60–75° over the head (higher in the turn); style 1 holds it overhead
    const st1 = (sl.style | 0) === 1;
    const el = THREE.MathUtils.degToRad(Math.min(84, (st1 ? 74 : 64) + 6 * Math.sin(st.ph * Math.PI * 2 + st.seed * 6) + 14 * spinUp + 4 * runK));
    poleD.copy(F).multiplyScalar(Math.cos(el)).addScaledVector(UPV, Math.sin(el)).addScaledVector(Sd, 0.16 + 0.1 * Math.sin(st.ph * Math.PI + st.seed * 4)).normalize();
    if (!st1) tA.copy(J[1]).addScaledVector(F, 0.24 * h).addScaledVector(UPV, -0.07 * h).addScaledVector(Sd, 0.17 * h);   // lower grip
    else tA.copy(J[2]).addScaledVector(F, 0.2 * h).addScaledVector(UPV, 0.02 * h).addScaledVector(Sd, -0.03 * h);
    tC.copy(tA).addScaledVector(poleD, (st1 ? 0.3 : 0.38) * h);                // upper grip
    J[18].copy(tA).addScaledVector(poleD, -0.5 * h);
    J[19].copy(J[18]).addScaledVector(poleD, 2.1 * h);
    tB.copy(UPV).multiplyScalar(-1).addScaledVector(F, -0.2).addScaledVector(Sd, 0.7);
    ik2(J[5], tC, 0.3 * h, 0.27 * h, tB, J[7], J[9]);
    tB.copy(UPV).multiplyScalar(-1).addScaledVector(F, -0.2).addScaledVector(Sd, -0.7);
    ik2(J[4], tA, 0.3 * h, 0.27 * h, tB, J[6], J[8]);
    barD.copy(Sd).addScaledVector(poleD, -Sd.dot(poleD)).normalize();
    J[20].copy(J[19]).addScaledVector(barD, -0.3 * h).addScaledVector(poleD, 0.12 * h);
    J[21].copy(J[19]).addScaledVector(barD, 0.3 * h).addScaledVector(poleD, 0.12 * h);
    // the hood and the horns (12 cm, out then up)
    J[28].copy(J[3]).addScaledVector(UPV, 0.2 * h).addScaledVector(F, -0.15 * h);
    for (let L = 0; L < 2; L++) {
      const sg = L ? 1 : -1;
      J[24 + L].copy(J[3]).addScaledVector(UPV, 0.075 * h).addScaledVector(Sd, sg * 0.072 * h).addScaledVector(F, 0.03 * h);
      tA.copy(UPV).multiplyScalar(0.55).addScaledVector(Sd, sg * 0.8).addScaledVector(F, 0.1).normalize();
      J[26 + L].copy(J[24 + L]).addScaledVector(tA, 0.06 * h);
      tA.copy(UPV).multiplyScalar(0.95).addScaledVector(Sd, sg * 0.12).addScaledVector(F, 0.3).normalize();
      J[22 + L].copy(J[26 + L]).addScaledVector(tA, 0.08 * h);
    }
    J[29].addVectors(J[12], J[13]).multiplyScalar(0.28).addScaledVector(J[14], 0.22).addScaledVector(J[15], 0.22).addScaledVector(F, -0.04 * h);   // mid-shin
    for (let j = 0; j < NJ; j++) JV[i * NJ + j].set(J[j].x, J[j].y, J[j].z, 0);
    st.root.copy(J[0]);
    return floorY;
  }

  function update(dt, time, slots) {
    dt = Math.min(Math.max(dt || 1 / 60, 1e-3), 1 / 20);
    for (let i = 0; i < MAXD; i++) {
      const sl = slots && slots[i], st = ST[i];
      if (!sl || !sl.on) { if (st.on) { st.on = false; DS[i].set(0, 0, 0, 0); for (let j = 0; j < NJ; j++) JV[i * NJ + j].set(0, -50, 0, 0); } continue; }
      if (!st.on || (sl.age ?? 0) < st.age - 1e-3) init(st, sl);
      st.age = sl.age ?? 0;
      const floorY = pose(i, sl, st, time, dt);
      const h = sl.h || 1, k = clamp01(sl.k ?? 1), dis = clamp01(sl.dis ?? 0);
      DS[i].set(k, dis, (0.92 + 0.08 * Math.sin(time * 7 + i)) * (sl.gain || 1), floorY);
      DV[i].set(st.vel.x, 0, st.vel.z, h);
      DF[i].set(st.F.x, 0, st.F.z, st.seed);
      // the carretilles: an umbrella of sparks into BRA's GPU sparks (2 emitters, every other frame), a last flash when it dissolves
      if (!emit) continue;
      const live = smoother((k - 0.7) / 0.3) * (1 - smoother(dis / 0.25));
      st.acc += dt * 380 * live;                                       // ~150–200 live sparks per carretilla
      if (st.acc >= 10) {
        const n = Math.floor(st.acc); st.acc -= n;
        for (let e = 0; e < 2; e++) {
          const end = JV[i * NJ + 20 + e], a = time * Math.PI * 2 * 3.5 + e * Math.PI + i;
          emit(n / 2, end.x, end.y, end.z, 0.04 * h, Math.cos(a) * 0.8, -0.55, Math.sin(a) * 0.8, 0.45, 2.2 * h, 4.2 * h, 0.55, 1.0, 2.1, 0.8, 1.0, st.vel.x, 0, st.vel.z);
        }
      }
      if (dis > 0 && !st.wasDis) {
        st.wasDis = true;
        for (let e = 0; e < 2; e++) { const end = JV[i * NJ + 20 + e]; emit(6, end.x, end.y, end.z, 0.02, 0, 1, 0, 1.2, 5, 7, 1.2, 1.6, 2.5, 0.6, 0.4); }
      }
    }
  }

  return {
    meshes,
    update,
    root(i, out) { const st = ST[i]; return out.copy(st ? st.root : R); },
    joint(i, j, out) { const v = JV[i * NJ + j]; return out.set(v.x, v.y, v.z); },        // (checks / debugging)
    count: () => ST.filter((s) => s.on).length,
    info: { joints: NJ, perDevil: { capsules: SEG.length, needles: PER_NEEDLE, tongues: NT, tongueLayers: NT * NLAYER, motes: PER_MOTE }, drawCalls: meshes.length },
    dispose() {
      for (const m of meshes) { m.parent?.remove(m); m.material.dispose(); }
      for (const g of [bodyGeo, needleGeo, tongueGeo, moteGeo]) g.dispose();
    },
  };
}
