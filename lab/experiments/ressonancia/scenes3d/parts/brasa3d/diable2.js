// Ressonància — «brasa»: the CORREFOCS v2 — the fire creature in a hooded robe (ref: «Turnaround de criatura ígnea con túnica»),
// a MODELLED and RIGGED character. Drop-in for ./diables.js (same API). Owner: diable v2 (lab/diable-v2).
//
// What it is: one skinned mesh (./diable2/diable2.bin + .json, built by ./diable2/build_diable2.py in Blender, headless): 1.75 m to
// the crown, 1.875 m to the peak of a tall conical hood leaning back, two flame crests (cream → orange → red) and two shoulder tufts,
// a round snout, a collar of ember feathers, a bell robe to mid-shin with a burning hem, a hexagon medallion at the waist, long thin
// charcoal limbs with thorns, clawed hands and bird feet, and ember dashes all over. The forca (2.1 m, a V of two prongs) and the
// two carretilles (small wheels, 5 spokes turning 3.5×/s) are part of the same mesh, on their own bone.
//   Rig       36 bones: pelvis, spine, chest, neck, head, hood ×2, clavicle / upper arm / forearm / hand ×2, thigh / shin / foot /
//             toe ×2, 6 robe chains × 2, forca. GPU skinning, INSTANCED: one draw for every devil (bone matrices in a uniform array).
//   Motion    a procedural solver on the skeleton (inherits diables.js): correfoc skipping steps (2 hops/s at 1.4 m/s), the relay's
//             run (2.6–3.4 m/s), a full turn on the spot every 4–5 s with the forca up, the relay's leap (slot.hop), the idle dance;
//             feet PLANTED in the world (two-bone IK, each swing lands where the body will be at mid-stance), all eased. The robe
//             and the hood follow on springs (the hem lags, flares in the turn and is pushed out by the legs); the bell's shape is
//             kept rigid (silhouette first).
//   Light     charcoal lit by its own fire (the carretilles above, the bed below) and the cold rim; emission: ember dashes (a 3D
//             cell pattern on the REST pose, so they stick to the body), thorn tips, the hem's band, the hexagon, the flames —
//             all scaled by the heat (slot gain).
//   Motes     embers rising off the body + sparks spinning off each carretilla (analytic, velocity-compensated); the long umbrella
//             of sparks is BRA's GPU sparks, fed through `emit` (2 emitters per devil, every ~10 sparks).
//   Arrive / leave   ASSEMBLE from embers (the body appears from the feet up behind a burning, ragged front); DISSOLVE into
//             sparks (the top first: the front sinks from the hood's peak).
// Reflection: everything drawn again through `mirP` (the body as a transparent copy, opacity 0.6 · U.refl, tinted by CHROME).
//
// API (as ./diables.js, agreed with BRA through the director, 25-11)
//   import { createDiables } from './brasa3d/diable2.js';      (top-level await: the module loads its mesh before it resolves)
//   const D = createDiables({ THREE, TSL, room, world, U, mirP, CHROME, fireRamp, emit, MAXD, ringPoint, eye });
//   D.update(dt, time, slots)   slots = BRA's devils[] { on, s, d, h, k, dis, hop, gain, style, age, born } (read only)
//   D.root(i, out)  the pelvis of slot i      D.meshes      D.dispose()      D.info { bones, triangles, perDevil, drawCalls }
//
// Cost (14 devils): 4 draw calls per camera (body + motes, ×2 mirrored; diables.js: 8). Body 9.3k tris per devil, instanced
// (only the live devils are drawn); motes 360 quads per devil. Uniforms: 36 bones × 3 vec4 + 3 vec4 per devil (1 554 vec4 at 14).
// CPU: one solve per devil (~36 quaternions), nothing allocated per frame.
// Study page: ./diable2/study.html (?mode=close | dance | run | cycle | turn, ?gl=1).

const ASSET = await (async () => {
  const base = new URL('./diable2/', import.meta.url);
  const [meta, bin] = await Promise.all([
    fetch(new URL('diable2.json', base)).then((r) => r.json()),
    fetch(new URL('diable2.bin', base)).then((r) => r.arrayBuffer()),
  ]);
  return { meta, bin };
})();

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PER_EMBER = 160, PER_SPARK = 200, PER_MOTE = PER_EMBER + PER_SPARK;

export function createDiables(ctx) {
  const { THREE, TSL, room, world, U, mirP = null, CHROME = null, emit = null, ringPoint } = ctx;
  const MAXD = Math.min(14, ctx.MAXD ?? 14);
  const {
    uniformArray, attribute, varying, positionGeometry, uv, vec2, vec3, vec4, float, int, sin, cos, exp, mix, clamp, smoothstep, max,
    abs, fract, floor, pow, dot, normalize, length, select, modelViewMatrix, modelWorldMatrix, cameraProjectionMatrix, cameraPosition,
    mx_noise_float, atan, fwidth, instanceIndex, Fn, Discard,
  } = TSL;
  const { meta, bin } = ASSET;
  const NB = meta.bones.length;
  const BI = Object.fromEntries(meta.bones.map((b, i) => [b.name, i]));
  const col = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const C = {
    char: col(0x3A1D12), cloth: col(0x4A2214), claw: col(0x24130C), medal: col(0x1E100A), forca: col(0x120B08),
    rim: col(0x9FB4C8), garnet: col(0x6E1410), red: col(0xC8281A), deep: col(0xB3170E), orange: col(0xEE6A1F), amber: col(0xF2B23A), cream: col(0xF4E3C8),
    lavaEdge: col(0xB3260E), lavaMid: col(0xFF7A1A), lavaCore: col(0xFFD27A), hem: col(0xF05A14), sparkHot: col(0xFFE9B0), sparkEnd: col(0x8A1F0E),
  };
  const tint = CHROME || vec3(1, 0.93, 0.84);
  const flashN = (p) => (room && room.flash ? room.flash(p) : float(0));
  let pxA = 0.0016;                                                       // the angular size of a pixel (motes' minimum width)
  if (room && room.walls && room.walls[0] && room.eye) {
    const w0 = room.walls[0], dW = Math.max(1, -new THREE.Vector3().subVectors(w0.pa, room.eye).dot(w0.normal));
    pxA = (w0.height / (w0.rect?.h || 456)) / dW;
  }

  // ------------------------------------------------------------------------------------------------ rest skeleton (from the asset)
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const RH = meta.bones.map((b) => V3(b.head)), RT = meta.bones.map((b) => V3(b.tail)), PAR = meta.bones.map((b) => b.parent);
  const RD = RH.map((h, i) => RT[i].clone().sub(h).normalize());                 // rest direction
  const ROFF = RH.map((h, i) => (PAR[i] >= 0 ? h.clone().sub(RH[PAR[i]]) : new THREE.Vector3()));
  const RLEN = RH.map((h, i) => RT[i].distanceTo(h));
  const b = BI;
  const L_THIGH = RLEN[b.thighL], L_SHIN = RLEN[b.shinL], L_UARM = RLEN[b.uarmL], L_FARM = RLEN[b.farmL];
  const ANKLE_H = RH[b.footL].y, HIP_DY = RH[b.pelvis].y - RH[b.thighL].y;
  const ROBE = []; for (let k = 0; k < 6; k++) ROBE.push({ a: BI[`robe${k}a`], b: BI[`robe${k}b`] });
  const PRONG = meta.forca.prongs.map(V3);

  // ------------------------------------------------------------------------------------------------ per-devil uniforms (packed: live devils 0..n-1)
  const BV = []; for (let i = 0; i < MAXD * NB * 3; i++) BV.push(new THREE.Vector4(0, 0, 0, 0));
  const DS = [], DV = [], DF = [];
  for (let i = 0; i < MAXD; i++) { DS.push(new THREE.Vector4()); DV.push(new THREE.Vector4(0, 0, 0, 1)); DF.push(new THREE.Vector4(1, 0, 0, 0)); }
  const uB = uniformArray(BV, 'vec4');      // bone matrices, 3 rows (affine 3×4) per bone
  const uDS = uniformArray(DS, 'vec4');     // k (assemble), dis (dissolve), gain (heat), floor y (incl. the leap)
  const uDV = uniformArray(DV, 'vec4');     // velocity (local, m/s), h (scale)
  const uDF = uniformArray(DF, 'vec4');     // facing (horizontal unit), seed

  // ------------------------------------------------------------------------------------------------ the mesh
  const L = meta.layout;
  const f32 = (k) => new Float32Array(bin, L[k][0], meta.vertexCount * L[k][1]);
  const skI = new Uint8Array(bin, L.aSkI[0], meta.vertexCount * 4);
  const bodyGeo = new THREE.InstancedBufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(f32('position'), 3));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(f32('normal'), 3));
  bodyGeo.setAttribute('aAttr', new THREE.BufferAttribute(f32('aAttr'), 4));
  bodyGeo.setAttribute('aSkI', new THREE.BufferAttribute(Float32Array.from(skI), 4));
  bodyGeo.setAttribute('aSkW', new THREE.BufferAttribute(f32('aSkW'), 4));
  bodyGeo.setIndex(new THREE.BufferAttribute(L.index[2] === 'u32' ? new Uint32Array(bin, L.index[0], meta.indexCount) : new Uint16Array(bin, L.index[0], meta.indexCount), 1));
  bodyGeo.instanceCount = 0;
  bodyGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  // skinning: p (rest, vec3) by 4 bones of the packed devil `pk` (int); w = 1 for points, 0 for directions
  const skin = (pk, I, W, p, w) => {
    const p4 = vec4(p, w);
    let acc = vec3(0, 0, 0);
    for (const c of ['x', 'y', 'z', 'w']) {
      const base = pk.mul(NB * 3).add(int(I[c]).mul(3));
      acc = acc.add(vec3(dot(uB.element(base), p4), dot(uB.element(base.add(1)), p4), dot(uB.element(base.add(2)), p4)).mul(W[c]));
    }
    return acc;
  };
  // the ember-dash pattern on the rest pose: a 3D cell lattice stretched along y, one dash per live cell (teardrop: wide below)
  const hash3 = (c) => fract(sin(dot(c, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  const dashes = (r, tm) => {
    const q = r.mul(vec3(42, 6, 42)), cell = floor(q), f = fract(q);
    const h1 = hash3(cell), h2 = hash3(cell.add(17.3)), h3 = hash3(cell.add(41.7));
    const o = vec3(h2, h3, fract(h1.mul(7.1))).mul(0.4).add(0.3);
    const d = f.sub(o), wide = clamp(d.y.mul(-1.6).add(0.6), 0.25, 1.0);          // wider at the bottom of the dash
    const dd = length(vec3(d.x.div(wide), d.y, d.z.div(wide)));
    const on = select(h1.greaterThan(0.72), float(1), float(0));
    const fl = sin(tm.mul(h2.mul(3).add(1.5)).add(h1.mul(40))).mul(0.3).add(0.7);
    return float(1).sub(smoothstep(0.12, 0.24, dd)).mul(on).mul(fl);
  };
  // the build / burn factor: assemble from the feet up, dissolve from the top down; a ragged burning front
  const grow = (py, ds, h, rag) => {
    const yRel = clamp(py.sub(ds.w).div(h.mul(1.9)), 0, 1.2).add(rag.mul(0.05));
    const eA = clamp(ds.x.mul(1.35).sub(0.12).sub(yRel).div(0.1), 0, 1);
    const vD = clamp(yRel.sub(float(1.15).sub(ds.y.mul(1.4))).div(0.1), 0, 1);
    return { g: eA.mul(float(1).sub(vD)), yRel };
  };

  const meshes = [];
  const addMesh = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; world.add(m); meshes.push(m); return m; };
  const mirrors = mirP ? [false, true] : [false];

  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    if (mirror) { m.transparent = true; m.depthWrite = true; m.blending = THREE.NormalBlending; }
    const pk = int(instanceIndex);
    const I = attribute('aSkI', 'vec4'), W = attribute('aSkW', 'vec4'), A = attribute('aAttr', 'vec4');
    const ds = uDS.element(pk), dv = uDV.element(pk), df = uDF.element(pk), h = dv.w, tm = U.time;
    const mat = A.x, tip = A.z, seed = A.w;
    const isFlame = abs(mat.sub(4)).lessThan(0.5);
    // the flames lick (rest space, before the skin): sway grows to the tip, each tongue its own phase
    const ph = tm.mul(seed.mul(2.0).add(3.0)).add(seed.mul(40.0));
    const lick = vec3(sin(ph), sin(ph.mul(1.3).add(1.7)).mul(0.6), cos(ph.mul(0.9))).mul(pow(tip, 1.6).mul(0.025));
    const pR = positionGeometry.add(select(isFlame, lick, vec3(0, 0, 0)));
    let p = skin(pk, I, W, pR, 1.0);
    // the run combs the flames back
    p = p.sub(dv.xyz.mul(select(isFlame, pow(tip, 1.5).mul(0.05), float(0))));
    const n = normalize(skin(pk, I, W, attribute('normal', 'vec3'), 0.0).add(vec3(0, 1e-5, 0)));
    const pf = mirror ? mirP(p) : p;
    m.positionNode = pf;
    const vN = varying(mirror ? vec3(n.x, n.y.negate(), n.z) : n), vW = varying(modelWorldMatrix.mul(vec4(pf, 1)).xyz);
    const vR = varying(positionGeometry);                                              // rest position (dashes, seams, the ragged front)
    const vA = varying(A);
    const vP = varying(vec4(p.y, 0, 0, 0)), vDS = varying(ds), vH = varying(h);
    const ft = uB.element(pk.mul(NB * 3).add(BI.forca * 3));                           // (rows of the forca's matrix: its top is the light)
    const fr1 = uB.element(pk.mul(NB * 3).add(BI.forca * 3 + 1)), fr2 = uB.element(pk.mul(NB * 3).add(BI.forca * 3 + 2));
    const topR = vec4(RH[BI.forca].x, RH[BI.forca].y + meta.forca.length + 0.1, RH[BI.forca].z, 1);
    const top = vec3(dot(ft, topR), dot(fr1, topR), dot(fr2, topR));
    const vTop = varying(top.sub(p));
    m.colorNode = Fn(() => {
      const N = normalize(vN), Vv = normalize(cameraPosition.sub(vW)), mt = vA.x, glow = vA.y, tp = vA.z, sd = vA.w;
      const isM = (k) => select(abs(mt.sub(k)).lessThan(0.5), float(1), float(0));
      const rag = mx_noise_float(vR.mul(9.0));
      const gr = grow(vP.x, vDS, vH, rag);
      Discard(gr.g.lessThan(0.5));
      const edge = float(1).sub(smoothstep(0.5, 0.95, gr.g));                            // the burning band at the front
      const ndv = abs(dot(N, Vv)), rimT = pow(float(1).sub(ndv), 4.0);
      const dTop = length(vTop), Lt = vTop.div(max(dTop, 1e-3));
      const fireLight = max(dot(N, Lt), 0).mul(0.55).div(dTop.mul(dTop).mul(0.6).add(1.0));       // the carretilles above
      const ringLight = max(N.y.negate(), 0).mul(0.3).add(0.1);                                     // the bed below
      const warm = vec3(1.0, 0.42, 0.13);
      const lit = fireLight.mul(1.8).add(ringLight);
      const heat = vDS.z;
      // albedo by part
      let alb = C.char;
      alb = mix(alb, C.cloth, max(isM(1), isM(2)));
      alb = mix(alb, C.claw, isM(9)); alb = mix(alb, C.medal, isM(5)); alb = mix(alb, C.forca, isM(6));
      let c = alb.mul(0.8).add(alb.mul(warm).mul(lit).mul(2.4)).add(C.rim.mul(rimT).mul(0.22));
      // emission: ember dashes, lava seams on the limbs, thorn tips, the hem, the hexagon
      const solid = float(1).sub(max(isM(4), max(isM(5), max(isM(6), max(isM(7), isM(9))))));
      const dsh = dashes(vR, U.time).mul(solid);
      const nz = mx_noise_float(vR.mul(vec3(3.0, 1.2, 3.0)));
      const seam = float(1).sub(smoothstep(0.0, fwidth(nz).mul(0.8).add(1e-4), abs(nz))).mul(isM(0)).mul(smoothstep(0.55, 0.75, mx_noise_float(vR.mul(2.0)).add(0.5))).mul(0.35);
      const pulse = sin(U.time.mul(2.3).add(vR.x.mul(30.0)).add(vR.y.mul(9.0))).mul(0.25).add(0.75);
      const tipG = pow(tp, 2.5).mul(max(isM(3), isM(9))).mul(0.9);
      let em = mix(C.lavaMid, C.lavaCore, pulse.mul(dsh)).mul(dsh.mul(1.25));
      em = em.add(mix(C.lavaEdge, C.lavaMid, pulse).mul(seam.add(tipG)));
      em = em.add(C.hem.mul(glow).mul(pulse.mul(0.35).add(0.85)).mul(1.15));
      c = c.add(em.mul(heat));
      // the flames: cream at the root, orange, red at the tip; matte, self-lit (below the bloom threshold)
      const fc = mix(mix(C.cream, C.amber, smoothstep(0.0, 0.25, tp)), mix(C.orange, C.red, smoothstep(0.45, 0.7, tp)), smoothstep(0.2, 0.5, tp));
      const flame = mix(fc, C.deep, smoothstep(0.7, 0.95, tp)).mul(sin(U.time.mul(9.0).add(sd.mul(30.0))).mul(0.08).add(0.92)).mul(heat.mul(0.25).add(0.75));
      c = mix(c, flame, isM(4));
      // the carretilles: a small hot wheel, five spokes turning 3.5×/s
      const spokes = pow(sin(atan(vR.z, vR.y.sub(PRONG[0].y)).mul(5.0).sub(U.time.mul(Math.PI * 2 * 3.5))).mul(0.5).add(0.5), 6.0);
      c = mix(c, C.sparkHot.mul(spokes.mul(1.05).add(0.42)), isM(7));
      c = c.add(C.lavaMid.mul(flashN(vW)).mul(rimT).mul(0.5));
      c = c.add(mix(C.lavaMid, C.lavaCore, edge).mul(edge).mul(1.6));                    // the burning edge (assemble / dissolve)
      c = c.mul(float(1).sub(U.leave.mul(0.6)));
      return mirror ? c.mul(tint) : c;
    })();
    if (mirror) m.opacityNode = U.refl.mul(0.6);
    m.fog = false;
    addMesh(bodyGeo, m, mirror ? -1 : 2);
  }

  // ------------------------------------------------------------------------------------------------ motes: embers off the body, sparks off the carretilles
  const moteGeo = (() => {
    const r = rng(511), n = MAXD * PER_MOTE;
    const pos = f32('position'), at = f32('aAttr'), sw = f32('aSkW');
    // anchors: vertices of the body, the robe, the hood, the collar
    const anchors = []; for (let v = 0; v < meta.vertexCount; v++) { const m = at[v * 4]; if (m === 0 || m === 1 || m === 2 || m === 3) anchors.push(v); }
    const aRP = new Float32Array(n * 4), aSI = new Float32Array(n * 4), aSW = new Float32Array(n * 4), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i / PER_MOTE), k = i % PER_MOTE;
      if (k < PER_EMBER) {
        const v = anchors[Math.floor(r() * anchors.length)];
        aRP.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], 0.8 + r() * 0.7], i * 4);          // w: life
        aSI.set([skI[v * 4], skI[v * 4 + 1], skI[v * 4 + 2], skI[v * 4 + 3]], i * 4);
        aSW.set([sw[v * 4], sw[v * 4 + 1], sw[v * 4 + 2], sw[v * 4 + 3]], i * 4);
        aS.set([s, r(), r(), 0], i * 4);
      } else {
        const e = k % 2, P = PRONG[e];
        aRP.set([P.x, P.y, P.z, 0.32 + r() * 0.2], i * 4);
        aSI.set([BI.forca, 0, 0, 0], i * 4); aSW.set([1, 0, 0, 0], i * 4);
        aS.set([s, r(), r(), 1 + e], i * 4);
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [k, a] of Object.entries({ aRP, aSI, aSW, aS })) g.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  })();
  const UPn = vec3(0, 1, 0), HIDE = vec4(0, 0, 2, 1);
  const streak = (P0, P1, w) => {
    const va = modelViewMatrix.mul(vec4(P0, 1)), vb = modelViewMatrix.mul(vec4(P1, 1));
    const ax = vb.xy.sub(va.xy), al = max(length(ax), 1e-5);
    const perp = vec2(ax.y.negate(), ax.x).div(al), dir2 = ax.div(al);
    const gy = positionGeometry.y.add(0.5), mv = mix(va, vb, gy);
    const wpx = max(w, mv.z.negate().mul(pxA * 1.25));
    const out = vec4(mv.xy.add(perp.mul(positionGeometry.x.mul(wpx))).add(dir2.mul(positionGeometry.y.mul(wpx))), mv.z, 1);
    return { clip: cameraProjectionMatrix.mul(out), k: w.div(wpx) };
  };
  for (const mirror of mirrors) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const RP = attribute('aRP', 'vec4'), SI = attribute('aSI', 'vec4'), SW = attribute('aSW', 'vec4'), S4 = attribute('aS', 'vec4');
    const pk = int(S4.x), ds = uDS.element(pk), dv = uDV.element(pk), h = dv.w, r1 = S4.y, r2 = S4.z, tm = U.time;
    const isSpark = S4.w.greaterThan(0.5), life = RP.w;
    const age = fract(tm.div(life).add(r1)).mul(life), x = age.div(life);
    const base = skin(pk, SI, SW, RP.xyz, 1.0);
    const gr = grow(base.y, ds, h, float(0));
    // embers: born on the body, rising and curling, left behind in the world as the devil moves
    const swirl = vec3(sin(tm.mul(1.7).add(r2.mul(30.0))), 0, cos(tm.mul(1.3).add(r1.mul(23.0)))).mul(x.mul(0.12));
    const rise = float(0.35).add(r2.mul(0.45)).add(ds.y.mul(1.6));
    const pE = base.sub(dv.xyz.mul(age)).add(UPn.mul(x.mul(rise).mul(h))).add(swirl);
    const vE = UPn.mul(rise.div(life)).sub(dv.xyz).mul(0.04);
    const ka = clamp(ds.x.mul(1.3).sub(r2.mul(0.3)), 0, 1);                              // assemble: they come up from the floor
    const srcE = vec3(base.x.add(cos(r1.mul(40.0)).mul(0.7)), ds.w.add(x.mul(0.5)), base.z.add(sin(r1.mul(40.0)).mul(0.7)));
    const pEm = mix(srcE, pE, ka);
    // sparks: thrown off the spinning carretilla (3.5 turns/s) into an umbrella, falling; velocity-compensated
    const tB = tm.sub(age), aB = tB.mul(Math.PI * 2 * 3.5).add(r2.mul(6.283)).add(S4.w.mul(Math.PI));
    const spd = float(2.4).add(r2.mul(2.0)).mul(h);
    const v0 = vec3(cos(aB).mul(0.8), float(-0.25).sub(r1.mul(0.55)), sin(aB).mul(0.8)).mul(spd);
    const gV = vec3(0, -7.8, 0);
    const pS = base.sub(dv.xyz.mul(age)).add(v0.mul(age)).add(gV.mul(age.mul(age).mul(0.5)));
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
      const q = uv(), across = exp(q.x.sub(0.5).mul(q.x.sub(0.5)).mul(-10.0)), T2 = vC.x;
      const c = mix(mix(C.sparkEnd, C.lavaMid, smoothstep(0.1, 0.8, T2)), C.sparkHot, smoothstep(0.9, 1.6, T2)).mul(T2.mul(0.9).add(0.15));
      const out = c.mul(across).mul(smoothstep(0.0, 0.5, q.y).add(0.2)).mul(vC.y).mul(mix(float(0.55), float(1.3), vC.z)).mul(U.devils).mul(float(1).sub(U.leave));
      return mirror ? out.mul(tint).mul(U.refl).mul(0.6) : out;
    })();
    m.fog = false;
    addMesh(moteGeo, m, mirror ? -1 : 4);
  }

  // ------------------------------------------------------------------------------------------------ the solver (CPU)
  const V = () => new THREE.Vector3(), Qn = () => new THREE.Quaternion();
  const QB = []; const HB = []; for (let i = 0; i < NB; i++) { QB.push(Qn()); HB.push(V()); }
  const ST = [];
  for (let i = 0; i < MAXD; i++) ST.push({
    on: false, age: 0, prev: V(), vel: V(), F: new THREE.Vector3(0, 0, 1), ph: 0, foot: [V(), V()], from: [V(), V()], sw: [false, false],
    acc: 0, wasDis: false, seed: 0, root: V(), hem: [], hemV: [], hood: new THREE.Vector2(), hoodV: new THREE.Vector2(), headV: V(), spinPrev: 0, spinRate: 0,
  });
  for (const st of ST) for (let k = 0; k < 6; k++) { st.hem.push(V()); st.hemV.push(V()); }
  const UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0), ZV = new THREE.Vector3(0, 0, 1);
  const R = V(), F = V(), Sd = V(), Sd0 = V(), toEye = V(), fdes = V(), tgt = V(), tA = V(), tB = V(), tC = V(), tD = V();
  const poleD = V(), barD = V(), fFoot = V(), fTop = V(), kne = V(), ank = V(), elb = V(), wri = V(), pel = V(), dk = V(), legP = V();
  const qY = Qn(), qT = Qn(), qA = Qn(), qS = Qn(), m3 = new THREE.Matrix4(), _d = V(), _b = V();
  const eye = ctx.eye || room?.eye || new THREE.Vector3(0, 1.6, 0);
  function ik2(A, T, l1, l2, pole, outJ, outE) {
    _d.subVectors(T, A); const D = _d.length() || 1e-4; _d.multiplyScalar(1 / D);
    const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _b.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); _b.normalize();
    outJ.copy(A).addScaledVector(_d, a).addScaledVector(_b, hh);
    outE.copy(A).addScaledVector(_d, d);
  }
  // FK helpers: the head of bone i from its parent (rigid offset), a world point of bone i's rest frame
  let H = 1;
  const place = (i) => { if (PAR[i] >= 0) HB[i].copy(ROFF[i]).applyQuaternion(QB[PAR[i]]).multiplyScalar(H).add(HB[PAR[i]]); };
  const pointOf = (i, restP, out) => out.copy(restP).sub(RH[i]).applyQuaternion(QB[i]).multiplyScalar(H).add(HB[i]);
  // bone i aims at `dir` (world), swinging from its parent's rotation (no twist)
  const aim = (i, dir, restVec = RD[i]) => {
    tD.copy(restVec).applyQuaternion(QB[PAR[i]]).normalize();
    qS.setFromUnitVectors(tD, _d.copy(dir).normalize());
    QB[i].copy(qS).multiply(QB[PAR[i]]);
  };
  const local = (i, q) => QB[i].copy(QB[PAR[i]]).multiply(q);           // a local rotation on top of the parent's
  const ax = (axis, a) => qA.setFromAxisAngle(axis, a);

  function init(st, sl) {
    ringPoint(sl.s, sl.d, R);
    st.on = true; st.prev.copy(R); st.vel.set(0, 0, 0); st.ph = Math.random(); st.acc = 0; st.wasDis = false;
    st.seed = ((sl.born ?? Math.random() * 100) * 0.618034) % 1;
    toEye.set(eye.x - R.x, 0, eye.z - R.z).normalize();
    st.F.copy(toEye); Sd.crossVectors(st.F, UPV).normalize();
    const h = sl.h || 1;
    for (let k = 0; k < 2; k++) { st.foot[k].copy(R).addScaledVector(Sd, (k ? -1 : 1) * 0.13 * h).setY(ANKLE_H * h); st.from[k].copy(st.foot[k]); st.sw[k] = false; }
    st.hood.set(0, 0); st.hoodV.set(0, 0); st.headV.set(0, 0, 0); st.spinRate = 0;
    for (let k = 0; k < 6; k++) { st.hem[k].set(NaN, 0, 0); st.hemV[k].set(0, 0, 0); }
  }

  function pose(sl, st, time, dt) {
    const h = sl.h || 1, hop = Math.max(0, sl.hop || 0); H = h;
    ringPoint(sl.s, sl.d, R);
    if (sl.rest) {                                                            // (study only: the rest pose, facing sl.face)
      qY.setFromAxisAngle(UPV, sl.face || 0);
      for (let i = 0; i < NB; i++) { QB[i].copy(qY); HB[i].copy(RH[i]).applyQuaternion(qY).multiplyScalar(h).add(R); }
      st.vel.set(0, 0, 0); st.root.copy(HB[b.pelvis]); return 0;
    }
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
    Sd0.crossVectors(st.F, UPV).normalize();                                   // (the devil's right)
    // a full turn on the spot every 4–5 s, the forca up
    const Ps = 4.2 + 0.8 * st.seed, sp = ((time + st.seed * 5.3) / Ps) % 1, SPW = 0.21;
    const spinA = sp < SPW ? smoother(sp / SPW) * Math.PI * 2 * dance : 0, spinUp = sp < SPW ? Math.sin(Math.PI * sp / SPW) * dance : 0;
    let dA = spinA - st.spinPrev; if (dA < -Math.PI) dA += Math.PI * 2; st.spinPrev = spinA;
    st.spinRate += (Math.abs(dA) / Math.max(dt, 1e-3) - st.spinRate) * (1 - Math.exp(-dt / 0.15));
    if (sl.face != null) st.F.set(Math.sin(sl.face), 0, Math.cos(sl.face));   // (study only: a fixed facing, no turn)
    F.copy(st.F).applyAxisAngle(UPV, sl.face != null ? 0 : spinA); Sd.crossVectors(F, UPV).normalize();
    const yaw = Math.atan2(F.x, F.z);
    qY.setFromAxisAngle(UPV, yaw);
    // the gait: skipping steps (2 hops/s at 1.4 m/s), feet planted in the world
    const f = 0.8 + 0.22 * speed + 0.15 * Math.max(0, speed - 1.6);
    const SW = 0.42 + 0.18 * runK;
    st.ph = (st.ph + f * dt) % 1;
    const Tst = (1 - SW) / f, lift = (0.12 + 0.05 * dance) * h, footY = ANKLE_H * h, stance = 0.13 - 0.02 * runK;
    for (let k = 0; k < 2; k++) {                                              // k 0 = left (+side), 1 = right
      const lc = (st.ph - k * 0.5 + 1) % 1, sg = k ? 1 : -1, foot = st.foot[k];
      tgt.copy(R).addScaledVector(st.vel, Math.max(0, (SW - lc) / f) + Tst * 0.5).addScaledVector(Sd0, sg * stance * h);
      if (reset) { foot.copy(tgt).setY(footY); st.from[k].copy(foot); st.sw[k] = false; continue; }
      if (hop > 0.02) {                                                        // the relay's leap: legs tucked under it
        foot.copy(R).addScaledVector(F, 0.1 * h * sg).addScaledVector(Sd0, sg * 0.1 * h).setY(hop + 0.32 * h);
        st.from[k].copy(foot); st.sw[k] = false; continue;
      }
      if (lc < SW) {
        if (!st.sw[k]) { st.sw[k] = true; st.from[k].copy(foot); }
        const u = lc / SW, e = smoother(u);
        foot.lerpVectors(st.from[k], tgt, e);
        foot.y = st.from[k].y + (footY - st.from[k].y) * e + lift * Math.sin(Math.PI * u);
      } else {
        st.sw[k] = false;
        foot.y += (footY - foot.y) * Math.min(1, dt * 20);
        tA.subVectors(foot, R).setY(0);
        if (tA.length() > 0.85 * h) foot.copy(tgt).setY(footY);               // over-reached (a sharp turn of the ring): step now
      }
    }
    // the pelvis: lowest at each mid-stance, the skip lifts it in between
    const midL = SW + (1 - SW) / 2, A0 = (0.035 + 0.02 * dance) * h;
    const bob = A0 * (1 - 2 * Math.abs(Math.cos(Math.PI * 2 * (st.ph - midL))));
    const floorY = hop;
    const lean = 0.1 + 0.2 * runK + 0.035 * Math.sin(st.ph * Math.PI * 4), roll = 0.05 * Math.sin(st.ph * Math.PI * 2), tw = 0.09 * Math.sin(st.ph * Math.PI * 2);
    pel.copy(R).addScaledVector(Sd0, 0.022 * h * Math.sin(st.ph * Math.PI * 2)).addScaledVector(F, 0.02 * h);
    pel.y = floorY + (RH[b.pelvis].y - 0.02 - 0.03 * runK) * h + bob;
    // spine (FK): yaw · lean · roll
    const spineQ = (i, kLean, kRoll, kTw) => { QB[i].copy(qY).multiply(ax(UPV, tw * kTw)).multiply(qT.setFromAxisAngle(XV, lean * kLean)).multiply(ax(ZV, roll * kRoll)); place(i); };
    HB[b.pelvis].copy(pel); QB[b.pelvis].copy(qY).multiply(qT.setFromAxisAngle(XV, lean * 0.3)).multiply(ax(ZV, roll * 0.5));
    spineQ(b.spine, 0.8, 1.0, 0.4); spineQ(b.chest, 1.0, 0.6, 1.0); spineQ(b.neck, 0.5, 0.3, 0.5);
    QB[b.head].copy(qY).multiply(qT.setFromAxisAngle(XV, lean * 0.15 + 0.04 * Math.sin(st.ph * Math.PI * 4 + 0.6))); place(b.head);
    // the hood: a spring on the head's motion (lags back with the speed, swings with the steps); small, the cone stays a cone
    pointOf(b.head, RT[b.head], tA);
    tB.copy(tA).sub(st.headV); st.headV.copy(tA);
    const ax_ = reset ? 0 : (tB.dot(F) / Math.max(dt, 1e-3)), as_ = reset ? 0 : (tB.dot(Sd) / Math.max(dt, 1e-3));
    const hk = 70, hd = 2 * Math.sqrt(hk) * 0.35;
    st.hoodV.x += (-(st.hood.x - (0.06 * runK + ax_ * 0.035)) * hk - st.hoodV.x * hd) * dt;
    st.hoodV.y += (-(st.hood.y - as_ * 0.035) * hk - st.hoodV.y * hd) * dt;
    st.hood.addScaledVector(st.hoodV, dt).clampScalar(-0.2, 0.2);
    local(b.hood1, qT.setFromAxisAngle(XV, -st.hood.x * 0.5).multiply(ax(ZV, st.hood.y * 0.5))); place(b.hood1);
    local(b.hood2, qT.setFromAxisAngle(XV, -st.hood.x * 0.5).multiply(ax(ZV, st.hood.y * 0.5))); place(b.hood2);
    // legs: two-bone IK to the planted feet; the foot flat, facing the way it goes; the toe bends in the swing
    tB.copy(F).addScaledVector(UPV, 0.1);
    for (let k = 0; k < 2; k++) {
      const th = k ? b.thighR : b.thighL, sh = k ? b.shinR : b.shinL, ft = k ? b.footR : b.footL, to = k ? b.toeR : b.toeL;
      place(th); QB[th].copy(QB[b.pelvis]);
      ik2(HB[th], st.foot[k], L_THIGH * h, L_SHIN * h, tB, kne, ank);
      aim(th, tA.subVectors(kne, HB[th])); place(sh);
      aim(sh, tA.subVectors(ank, HB[sh])); place(ft);
      const lc = (st.ph - k * 0.5 + 1) % 1, u = lc < SW && hop <= 0.02 ? Math.sin(Math.PI * lc / SW) : (hop > 0.02 ? 1 : 0);
      QB[ft].copy(qY).multiply(qT.setFromAxisAngle(XV, 0.35 * u)); place(to);
      local(to, qT.setFromAxisAngle(XV, -0.3 * u));
    }
    // the forca: 2.1 m, held at 60–75° over the head (higher in the turn); style 1 holds it overhead
    const st1 = (sl.style | 0) === 1;
    const el = THREE.MathUtils.degToRad(Math.min(84, (st1 ? 74 : 64) + 6 * Math.sin(st.ph * Math.PI * 2 + st.seed * 6) + 14 * spinUp + 4 * runK));
    poleD.copy(F).multiplyScalar(Math.cos(el)).addScaledVector(UPV, Math.sin(el)).addScaledVector(Sd, 0.16 + 0.1 * Math.sin(st.ph * Math.PI + st.seed * 4)).normalize();
    pointOf(b.chest, RT[b.chest], tC);                                        // (the base of the neck)
    if (!st1) tA.copy(tC).addScaledVector(F, 0.24 * h).addScaledVector(UPV, -0.17 * h).addScaledVector(Sd, 0.15 * h);   // lower grip
    else tA.copy(tC).addScaledVector(F, 0.2 * h).addScaledVector(UPV, 0.08 * h).addScaledVector(Sd, -0.03 * h);
    tC.copy(tA).addScaledVector(poleD, (st1 ? 0.3 : 0.36) * h);               // upper grip
    fFoot.copy(tA).addScaledVector(poleD, -0.5 * h);
    barD.copy(Sd).addScaledVector(poleD, -Sd.dot(poleD)).normalize();
    tB.crossVectors(barD, poleD);
    m3.makeBasis(barD, poleD, tB); QB[b.forca].setFromRotationMatrix(m3);
    HB[b.forca].copy(fFoot);
    // arms: the right hand on the upper grip, the left on the lower; elbows out and down
    for (let k = 0; k < 2; k++) {
      const cl = k ? b.clavR : b.clavL, ua = k ? b.uarmR : b.uarmL, fa = k ? b.farmR : b.farmL, hd_ = k ? b.handR : b.handL;
      const grip = k ? tC : tA, sg = k ? 1 : -1;
      local(cl, qT.set(0, 0, 0, 1)); place(cl);
      place(ua); QB[ua].copy(QB[cl]);
      tB.copy(UPV).multiplyScalar(-1).addScaledVector(F, -0.2).addScaledVector(Sd, 0.7 * sg);
      ik2(HB[ua], grip, L_UARM * h, L_FARM * h, tB, elb, wri);
      aim(ua, _b.subVectors(elb, HB[ua])); place(fa);
      aim(fa, _b.subVectors(wri, HB[fa])); place(hd_);
      local(hd_, qT.setFromAxisAngle(XV, -0.5));
    }
    // the robe: each chain's hem on a spring toward where the pelvis carries it, pushed out by the legs, flared by the turn;
    // the chain turns rigidly about its waist point (the bell keeps its shape)
    const kS = 75, dS = 2 * Math.sqrt(kS) * 0.42;
    for (let k = 0; k < 6; k++) {
      const ra = ROBE[k].a, rb = ROBE[k].b;
      place(ra);
      pointOf(b.pelvis, RT[rb], tA);                                          // the rest hem, carried by the pelvis
      dk.subVectors(tA, pel).setY(0).normalize();
      // the legs push it out: the knee and the shin at the hem's height must stay inside (the chain is a line from its waist
      // point A to the hem: a point sticking out by e at height y moves the hem by e · (A.y − hem.y) / (A.y − y))
      const Ay = HB[ra].y, rA = tD.subVectors(HB[ra], pel).setY(0).dot(dk);
      for (let l = 0; l < 2; l++) {
        const sh = l ? b.shinR : b.shinL;
        pointOf(sh, RH[sh], kne); pointOf(sh, RT[sh], ank);
        const u = clamp01((kne.y - tA.y) / Math.max(1e-3, kne.y - ank.y));
        for (let q = 0; q < 2; q++) {
          if (q) legP.lerpVectors(kne, ank, u); else legP.copy(kne);
          const span = Ay - tA.y, at = clamp01((Ay - legP.y) / Math.max(1e-3, span));
          if (at < 0.15) continue;
          const rH = tD.subVectors(tA, pel).setY(0).dot(dk), rY = rA + (rH - rA) * at;
          const e = tD.subVectors(legP, pel).setY(0).dot(dk) + 0.045 * h - rY;
          if (e > 0) tA.addScaledVector(dk, e / at);
        }
      }
      tA.addScaledVector(dk, Math.min(0.12, st.spinRate * 0.02) * h);         // the turn flares it
      const hm = st.hem[k], hv = st.hemV[k];
      if (reset || Number.isNaN(hm.x)) { hm.copy(tA); hv.set(0, 0, 0); }
      else {
        tB.subVectors(tA, hm).multiplyScalar(kS).addScaledVector(hv, -dS);
        hv.addScaledVector(tB, dt); hm.addScaledVector(hv, dt);
        tB.subVectors(hm, tA); if (tB.length() > 0.14 * h) hm.copy(tA).addScaledVector(tB.normalize(), 0.14 * h);
      }
      if (hm.y < floorY + 0.03) hm.y = floorY + 0.03;
      tD.subVectors(RT[rb], RH[ra]);                                          // rest waist → hem
      tC.copy(tD).applyQuaternion(QB[b.pelvis]).normalize();
      qS.setFromUnitVectors(tC, tB.subVectors(hm, HB[ra]).normalize());
      QB[ra].copy(qS).multiply(QB[b.pelvis]);
      place(rb); QB[rb].copy(QB[ra]);
    }
    st.root.copy(pel);
    return floorY;
  }

  // the packed bone rows of one devil: M = T(head) · Q · h · T(−restHead)
  const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _t = V();
  function writeBones(pk, h) {
    _s.set(h, h, h);
    for (let i = 0; i < NB; i++) {
      _m.compose(_t.set(0, 0, 0), QB[i], _s);
      const e = _m.elements;                                                  // column-major
      const hx = RH[i].x, hy = RH[i].y, hz = RH[i].z;
      const tx = HB[i].x - (e[0] * hx + e[4] * hy + e[8] * hz), ty = HB[i].y - (e[1] * hx + e[5] * hy + e[9] * hz), tz = HB[i].z - (e[2] * hx + e[6] * hy + e[10] * hz);
      const o = (pk * NB + i) * 3;
      BV[o].set(e[0], e[4], e[8], tx); BV[o + 1].set(e[1], e[5], e[9], ty); BV[o + 2].set(e[2], e[6], e[10], tz);
    }
  }
  const tipW = [V(), V()];
  function update(dt, time, slots) {
    dt = Math.min(Math.max(dt || 1 / 60, 1e-3), 1 / 20);
    let n = 0;
    for (let i = 0; i < MAXD; i++) {
      const sl = slots && slots[i], st = ST[i];
      if (!sl || !sl.on) { st.on = false; continue; }
      if (!st.on || (sl.age ?? 0) < st.age - 1e-3) init(st, sl);
      st.age = sl.age ?? 0;
      const floorY = pose(sl, st, time, dt);
      const h = sl.h || 1, k = clamp01(sl.k ?? 1), dis = clamp01(sl.dis ?? 0);
      writeBones(n, h);
      DS[n].set(k, dis, (0.92 + 0.08 * Math.sin(time * 7 + i)) * (sl.gain || 1), floorY);
      DV[n].set(st.vel.x, 0, st.vel.z, h);
      DF[n].set(st.F.x, 0, st.F.z, st.seed);
      n++;
      // the carretilles: an umbrella of sparks into BRA's GPU sparks (2 emitters), a last flash when it dissolves
      if (!emit) continue;
      for (let e = 0; e < 2; e++) pointOf(BI.forca, PRONG[e], tipW[e]);
      const live = smoother((k - 0.7) / 0.3) * (1 - smoother(dis / 0.25));
      st.acc += dt * 380 * live;
      if (st.acc >= 10) {
        const m = Math.floor(st.acc); st.acc -= m;
        for (let e = 0; e < 2; e++) {
          const end = tipW[e], a = time * Math.PI * 2 * 3.5 + e * Math.PI + i;
          emit(m / 2, end.x, end.y, end.z, 0.04 * h, Math.cos(a) * 0.8, -0.55, Math.sin(a) * 0.8, 0.45, 2.2 * h, 4.2 * h, 0.55, 1.0, 2.1, 0.8, 1.0, st.vel.x, 0, st.vel.z);
        }
      }
      if (dis > 0 && !st.wasDis) {
        st.wasDis = true;
        for (let e = 0; e < 2; e++) { const end = tipW[e]; emit(6, end.x, end.y, end.z, 0.02, 0, 1, 0, 1.2, 5, 7, 1.2, 1.6, 2.5, 0.6, 0.4); }
      }
    }
    bodyGeo.instanceCount = n; moteGeo.instanceCount = n * PER_MOTE;
    for (const m of meshes) m.visible = n > 0;
    live = n;
  }
  let live = 0;

  return {
    meshes,
    update,
    root(i, out) { const st = ST[i]; return out.copy(st ? st.root : R); },
    count: () => live,
    info: { bones: NB, triangles: meta.triangles, perDevil: { triangles: meta.triangles, motes: PER_MOTE }, drawCalls: meshes.length },
    dispose() {
      for (const m of meshes) { m.parent?.remove(m); m.material.dispose(); }
      bodyGeo.dispose(); moteGeo.dispose();
    },
  };
}
