// Ressonància — brasa3d / foguera2 (brasa v2, 26-11): FOUR BONFIRES, one per wall, each its own — fed by the correfocs.
//
//   What each wall gets (a TYPE: shape, character, rhythm), drawn at `D_FIRE` m beyond the wall, behind the devils' lanes (the
//   runners pass in FRONT of the flames, in silhouette):
//     0 «pira»      a tall square tower of crossed logs; one tall, narrow, steady flame that breathes slowly
//     1 «Sant Joan» a long low pile of leaning logs (2.6 m); a wide row of lively tongues that flicker fast
//     2 «brasero»   an iron bowl on three legs; flames that roll and swirl round, a slow churning rhythm
//     3 «corona»    a ring of embers on the ground (Ø 2 m); a crown of small flames that light up round it in waves
//   Every fire goes from a bed of embers with a flicker (level 0) to a high flare (level 1, up to ~3.4 m tall); a FEED (a correfoc
//   passing) gives it a flash and a burst of sparks; the BOOM (all four alight) is a joint flare and a ring of light running out
//   over the floor.
//
//   Flames  camera-facing (cylindrical) cards in a few depth layers, a procedural flame in the fragment (two layers of value-noise
//           fbm: the sway and the licks, scrolled up; a temperature ramp deep red → orange → amber → cream; additive). ONE draw for
//           all the flames of the four fires (17 instances); per fire: level, flash, boom in a uniform array.
//   Base    the logs / bowl / stones of each fire, charcoal lit by its own flame, ember cracks glowing with the level (one mesh per
//           fire, frustum-culled per wall camera).
//   Light   the light each fire casts on the floor: a warm pool growing with the level (radius 1.5 → 7 m), flickering; and the boom's
//           ring. Additive decals on the water (one draw, 5 instances). The level of each fire (0..1) is also what the host
//           uses to light the plaza (fons / the baked plaza's light layers).
//   Sparks  BRA's GPU sparks through `emit` (the rate grows with the level; a burst on a feed; a fountain on the boom).
//
// API
//   const F = createFogueres({ THREE, TSL, world, U, emit, sites, room })
//     sites   [{ x, z, s, type, face }] per wall (local; face = unit xz towards the eye)   U   BRA's uniforms (time, leave …)
//   F.update(dt, time, state)   state = { level: [4], flash: [4], boom: 0..1 (time since the boom, normalised; 0 = none) }
//   F.meshes   F.light(i) → the light of fire i on the floor (for others: 0..1)   F.dispose()
//   F.info   { drawCalls, flameInstances, baseTris }
// Cost (theory, for the director's measurement): draw calls per wall camera ≈ 1 flame + 1–2 bases + 1 floor light (+ the sparks
// BRA already draws); flame fill: ≤ 1/5 of a wall at full level, 3 fbm (12 value-noise taps) per pixel per layer, 3 layers;
// bases ~1.5k tris each; no textures, no render targets, no lights.
// Switches (lab only): ?f2noflame, ?f2nobase, ?f2nolight.

import { createVolumeFire, makeFireTexture } from './fire3/fire3.js';

export const D_FIRE = 5.0;                  // metres beyond the wall (behind the devils' lanes, 1.4–4.2 m)

const TYPES = [
  { name: 'pira', H0: 0.22, H1: 3.3, W0: 0.34, W1: 1.05, speed: 0.9, tongues: 2, swirl: 0.0, beat: 0.25, sparks: 1.0 },
  { name: 'santjoan', H0: 0.18, H1: 2.4, W0: 0.9, W1: 1.55, speed: 1.6, tongues: 6, swirl: 0.0, beat: 1.4, sparks: 1.3 },
  { name: 'brasero', H0: 0.18, H1: 2.8, W0: 0.4, W1: 1.05, speed: 1.1, tongues: 2, swirl: 1.0, beat: 0.5, sparks: 0.9 },
  { name: 'corona', H0: 0.1, H1: 1.5, W0: 0.13, W1: 0.26, speed: 1.3, tongues: 1, swirl: 0.2, beat: 0.8, sparks: 0.8 },
];

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createFogueres(ctx) {
  const { THREE, TSL, world, U, emit = null, sites } = ctx;
  const {
    uniformArray, attribute, varying, positionGeometry, uv, vec2, vec3, vec4, float, int, sin, cos, exp, mix, clamp, smoothstep, max,
    abs, fract, floor, pow, dot, normalize, length, select, cameraPosition, instanceIndex, positionWorld, normalWorld,
  } = TSL;
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const NF = sites.length;
  const col = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const C = {
    deep: col(0x4A0A04), red: col(0xC8281A), orange: col(0xEE6A1F), amber: col(0xF2B23A), cream: col(0xFFE6C0),
    char: col(0x1C120D), iron: col(0x14100E), ember: col(0xFF5A14), emberHot: col(0xFFB050),
  };

  // per fire: level, flash, boom, seed  ·  centre x, z, type, scale
  const FS = [], FP = [];
  for (let i = 0; i < NF; i++) { FS.push(new THREE.Vector4(0, 0, 0, i * 1.37 + 0.5)); FP.push(new THREE.Vector4(sites[i].x, sites[i].z, sites[i].type, 1)); }
  const uFS = uniformArray(FS, 'vec4'), uFP = uniformArray(FP, 'vec4');
  const meshes = [];
  const add = (m, order = 3) => { m.renderOrder = order; world.add(m); meshes.push(m); return m; };

  // ------------------------------------------------------------------------------------------------ noise
  const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
  const vnoise = (p) => {
    const i = floor(p), f = fract(p), u = f.mul(f).mul(float(3).sub(f.mul(2)));
    const a = hash2(i), b = hash2(i.add(vec2(1, 0))), c = hash2(i.add(vec2(0, 1))), d = hash2(i.add(vec2(1, 1)));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  };
  const fbm = (p) => vnoise(p).mul(0.6).add(vnoise(p.mul(2.03).add(7.1)).mul(0.3)).add(vnoise(p.mul(4.1).add(3.3)).mul(0.1));

  // ------------------------------------------------------------------------------------------------ 1. the flames (one instanced draw)
  // instance: [fire, offset x, offset z, depth layer] · [width k, height k, tongues, seed]
  const inst = [];
  const r = rng(91);
  for (let f = 0; f < NF; f++) {
    const T = sites[f].type;
    if (T === 3) {                                                // the crown: 8 small flames round a ring of 1 m
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; inst.push([f, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0, 1 + 0.25 * r(), 0.8 + 0.4 * r(), 1, r() * 10 + k]); }
      inst.push([f, 0, 0, 0.0, 2.4, 0.55, 3, r() * 10]);           // and a low glow across it
    } else {
      for (let l = 0; l < 3; l++) inst.push([f, 0, 0, (l - 1) * 0.22, l === 1 ? 1 : 0.8, l === 1 ? 1 : 0.86, TYPES[T].tongues, r() * 10 + l * 3.1]);
    }
  }
  const NI = inst.length;
  const flameGeo = (() => {
    const g = new THREE.InstancedBufferGeometry();
    const pos = [], idx = [], NX = 2, NY = 6;
    for (let y = 0; y <= NY; y++) for (let x = 0; x <= NX; x++) pos.push(x / NX * 2 - 1, y / NY, 0);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const a = y * (NX + 1) + x; idx.push(a, a + 1, a + NX + 2, a, a + NX + 2, a + NX + 1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const a0 = new Float32Array(NI * 4), a1 = new Float32Array(NI * 4);
    inst.forEach((v, i) => { a0.set(v.slice(0, 4), i * 4); a1.set(v.slice(4, 8), i * 4); });
    g.setAttribute('aI0', new THREE.InstancedBufferAttribute(a0, 4)); g.setAttribute('aI1', new THREE.InstancedBufferAttribute(a1, 4));
    g.instanceCount = NI; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  })();
  // per-type constants as small arrays (indexed by the fire's type in the shader)
  const TV0 = TYPES.map((t) => new THREE.Vector4(t.H0, t.H1, t.W0, t.W1)), TV1 = TYPES.map((t) => new THREE.Vector4(t.speed, t.tongues, t.swirl, t.beat));
  const uT0 = uniformArray(TV0, 'vec4'), uT1 = uniformArray(TV1, 'vec4');
  // (Beltrán 26-11: the flames are VOLUMETRIC now — fire3, ray-marched boxes, @wolffo/three-fire MIT —; ?f2cards brings back the cards)
  const LOOK = QS.has('f2cards') || ctx.look === 'cards' ? 'cards' : 'volume';
  if (!QS.has('f2noflame') && LOOK === 'cards') {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const I0 = attribute('aI0', 'vec4'), I1 = attribute('aI1', 'vec4');
    const fi = int(I0.x), fs = uFS.element(fi), fp = uFP.element(fi), ty = int(fp.z), t0 = uT0.element(ty), t1 = uT1.element(ty);
    const lvl = fs.x, flash = fs.y, boom = fs.z, seed = I1.w;
    const isCrown = ty.equal(3);
    // height and width with the level (the crown's flames rise one after another in waves round the ring)
    const wave = select(isCrown, sin(U.time.mul(1.6).sub(seed.mul(0.78))).mul(0.35).add(0.75), float(1));
    const breath = sin(U.time.mul(t1.w.mul(6.283).mul(0.25)).add(seed)).mul(0.06).add(1);
    const L = pow(lvl, 0.8).add(flash.mul(0.25)).add(boom.mul(0.8));
    const Hh = mix(t0.x, t0.y, L).mul(I1.y).mul(wave).mul(breath);
    const Ww = mix(t0.z, t0.w, clamp(L, 0, 1.2)).mul(I1.x);
    // the card faces the camera round the vertical axis, at its depth layer
    const ctr = vec3(fp.x.add(I0.y), 0, fp.y.add(I0.z));
    const toCam = normalize(vec3(cameraPosition.x.sub(ctr.x), 0, cameraPosition.z.sub(ctr.z)).add(vec3(1e-4, 0, 0)));
    const right = vec3(toCam.z, 0, toCam.x.negate());
    // the flame's root: in the brazier's bowl (0.84 m), inside the tower (0.25 m), on the ground for the others
    const y0 = select(ty.equal(2), float(0.8), select(ty.equal(0), float(0.22), float(-0.03)));
    m.positionNode = ctr.add(right.mul(positionGeometry.x.mul(Ww))).add(vec3(0, positionGeometry.y.mul(Hh).add(y0), 0)).add(toCam.mul(I0.w));
    const vA = varying(vec4(lvl, flash, boom, seed)), vT = varying(t1), vH = varying(Hh), vQ = varying(vec2(positionGeometry.x.mul(0.5).add(0.5), positionGeometry.y));
    m.colorNode = (() => {
      const q = vQ, x = q.x.mul(2).sub(1), y = q.y, sp = vT.x, tg = vT.y, sw = vT.z;
      const t = U.time.mul(sp).add(vA.w.mul(10.0));
      // several tongues across the card (the wide fire): each its own height
      const cellF = x.add(1).mul(tg).mul(0.5), cell = floor(cellF);
      const lx = select(tg.greaterThan(1.5), fract(cellF).mul(2).sub(1), x);
      const hk = select(tg.greaterThan(1.5), hash2(vec2(cell, vA.w)).mul(0.6).add(0.4).add(sin(t.mul(1.7).add(cell.mul(2.3))).mul(0.12)), float(1));
      const yy = y.div(hk);
      // the sway (big, slow) and the swirl (the brazier's flames roll round)
      const n1 = fbm(vec2(lx.mul(1.3).add(vA.w.mul(3.0)).add(cell.mul(1.7)), yy.mul(2.0).sub(t.mul(1.4))));
      const xw = lx.add(n1.sub(0.5).mul(0.6).mul(yy)).add(sin(yy.mul(7.0).sub(t.mul(3.0))).mul(0.18).mul(sw).mul(yy));
      const prof = pow(max(float(1).sub(yy), 0), 0.6).mul(smoothstep(0.0, 0.12, yy).mul(0.6).add(0.4));
      const body = float(1).sub(smoothstep(prof.mul(0.45), prof.add(0.02), abs(xw)));
      // the licks: detail scrolled up faster, tearing the flame apart higher up
      const n2 = fbm(vec2(xw.mul(3.2).add(vA.w), yy.mul(4.2).sub(t.mul(3.0))));
      const n3 = fbm(vec2(xw.mul(7.0).sub(vA.w), yy.mul(8.5).sub(t.mul(4.6))));       // the torn edges, the small licks
      const d = clamp(body.mul(n2.mul(0.8).add(n3.mul(0.45)).add(0.25)).sub(yy.mul(0.62)).mul(1.7), 0, 1);
      // mostly orange; amber in the heart, cream only at the very root of a strong fire
      const temp = pow(d, 0.85).mul(float(1).sub(yy.mul(0.55))).add(vA.y.mul(0.18)).add(vA.z.mul(0.2));
      let c = mix(C.deep, C.red, smoothstep(0.02, 0.2, temp));
      c = mix(c, C.orange, smoothstep(0.2, 0.45, temp));
      c = mix(c, C.amber, smoothstep(0.5, 0.78, temp));
      c = mix(c, C.cream, smoothstep(0.88, 1.05, temp));
      const a = smoothstep(0.0, 0.45, d).mul(smoothstep(1.0, 0.7, y));
      const k = mix(float(0.35), float(0.62), smoothstep(0.0, 0.4, vA.x)).mul(vA.y.mul(0.6).add(1));
      return c.mul(a).mul(k).mul(float(1).sub(U.leave.mul(0.7)));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(flameGeo, m); mesh.frustumCulled = false; add(mesh, 4);
  }

  // ------------------------------------------------------------------------------------------------ 1b. the volumetric flames (fire3)
  // per fire a few boxes: their own shape, speed and turbulence (the character); the level scales them, the feed and the boom brighten
  const VOL = [];                                              // { f, F, ox, oz, wk, hk, ph }
  const VSTY = [
    { noise: [1.0, 2.0, 1.0, 0.32], mag: 1.25, boxes: [[0, 0, 1, 1]] },                                       // pira: one tall steady tongue
    { noise: [1.4, 2.6, 1.4, 0.6], mag: 1.55, boxes: [[-0.95, 0, 0.62, 0.85], [-0.32, 0.05, 0.7, 1.0], [0.32, -0.05, 0.7, 0.95], [0.95, 0, 0.62, 0.8]] },   // Sant Joan: a lively row
    { noise: [1.0, 1.6, 1.0, 0.42], mag: 1.9, boxes: [[0, 0, 1, 1]] },                                         // brasero: rolling, churning
    { noise: [1.7, 2.4, 1.7, 0.62], mag: 1.2, boxes: Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2) * 0.95, Math.sin(k / 8 * Math.PI * 2) * 0.95, 1, 1, k]) },   // corona
  ];
  const fireTex = LOOK === 'volume' ? makeFireTexture(THREE) : null;
  if (!QS.has('f2noflame') && LOOK === 'volume') {
    const it = Math.max(6, Math.min(32, Number(QS.get('f2iter')) || 16));
    for (let f = 0; f < NF; f++) {
      const T = sites[f].type, sty = VSTY[T], st = sites[f];
      const right = { x: st.face.z, z: -st.face.x };
      for (const b of sty.boxes) {
        const F = createVolumeFire({ THREE, TSL, fireTex, iterations: it, octaves: 3, time: U.time, noiseScale: sty.noise, magnitude: sty.mag, seed: f * 3.7 + VOL.length * 1.3, rootFade: T === 2 ? 0.2 : 0.12 });
        F.mesh.renderOrder = 4; add(F.mesh, 4);
        const ox = T === 3 ? b[0] : right.x * b[0] - st.face.x * b[1], oz = T === 3 ? b[1] : right.z * b[0] - st.face.z * b[1];
        VOL.push({ f, F, ox, oz, wk: b[2], hk: b[3], ph: (b[4] ?? 0) * 0.78 });
      }
    }
  }
  const Y0 = [0.2, -0.04, 0.7, -0.04];                          // the flame's root per type: in the tower, on the ground, in the bowl

  // ------------------------------------------------------------------------------------------------ 2. the bases (logs, bowl, stones)
  const baseGeos = [];
  if (!QS.has('f2nobase')) {
    import_utils();
  }
  function cyl(rad, len, seg = 7) { return new THREE.CylinderGeometry(rad, rad * 0.92, len, seg, 1); }
  function withEmber(g, e) { const n = g.attributes.position.count; g.setAttribute('aE', new THREE.Float32BufferAttribute(new Float32Array(n).fill(e), 1)); return g; }
  function merge(list) {
    // (a small merge: positions, normals, aE, index)
    let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), Ee = new Float32Array(nv), I = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      P.set(g.attributes.position.array, ov * 3); Nn.set(g.attributes.normal.array, ov * 3); Ee.set(g.attributes.aE.array, ov);
      if (g.index) { for (let k = 0; k < g.index.count; k++) I[oi + k] = g.index.array[k] + ov; oi += g.index.count; }
      else { for (let k = 0; k < n; k++) I[oi + k] = ov + k; oi += n; }
      ov += n; g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); m.setAttribute('aE', new THREE.BufferAttribute(Ee, 1));
    m.setIndex(new THREE.BufferAttribute(I, 1)); m.computeBoundingSphere();
    return m;
  }
  function import_utils() {
    const r2 = rng(7);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), Pv = new THREE.Vector3();
    const place = (g, x, y, z, rx, ry, rz) => { E.set(rx, ry, rz); Q.setFromEuler(E); M4.compose(Pv.set(x, y, z), Q, S); g.applyMatrix4(M4); return g; };
    const bed = (rad, e) => withEmber(place(new THREE.CylinderGeometry(rad, rad * 1.08, 0.08, 20, 1), 0, 0.02, 0, 0, 0, 0), e);
    for (let f = 0; f < NF; f++) {
      const T = sites[f].type, parts = [];
      if (T === 0) {                                              // the tower of crossed logs
        for (let lv = 0; lv < 5; lv++) for (let k = 0; k < 2; k++) {
          const o = (k ? 1 : -1) * 0.34, y = 0.08 + lv * 0.15, rot = lv % 2 ? Math.PI / 2 : 0;
          const x = lv % 2 ? o : 0, z = lv % 2 ? 0 : o;
          parts.push(withEmber(place(cyl(0.075, 0.98), x, y, z, Math.PI / 2, rot, 0.04 * (r2() - 0.5)), 0.35 + lv * 0.08));
        }
        parts.push(bed(0.55, 1));
      } else if (T === 1) {                                       // the long pile of leaning logs
        for (let k = 0; k < 11; k++) {
          const x = -1.15 + k * 0.23 + (r2() - 0.5) * 0.08, s = k % 2 ? 1 : -1;          // leaning left / right: crossing in X
          parts.push(withEmber(place(cyl(0.06, 0.95 + r2() * 0.3), x, 0.36, (r2() - 0.5) * 0.3, (r2() - 0.5) * 0.25, 0, s * (0.6 + r2() * 0.2)), 0.4));
        }
        for (let k = 0; k < 3; k++) parts.push(withEmber(place(cyl(0.07, 2.6), 0, 0.07, (k - 1) * 0.22, 0, 0, Math.PI / 2), 0.55));
        parts.push(withEmber(place(new THREE.CylinderGeometry(1.0, 1.1, 0.06, 24, 1).scale(1.45, 1, 0.5), 0, 0.02, 0, 0, 0, 0), 1));
      } else if (T === 2) {                                       // the iron bowl on three legs
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector2(0.15 + 0.5 * Math.sin(t * Math.PI * 0.5), 0.55 + 0.32 * (1 - Math.cos(t * Math.PI * 0.5)))); }
        parts.push(withEmber(new THREE.LatheGeometry(pts, 20), 0.0));
        parts.push(withEmber(place(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 20, 1), 0, 0.84, 0, 0, 0, 0), 1));
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; parts.push(withEmber(place(cyl(0.025, 0.75, 5), Math.cos(a) * 0.38, 0.33, Math.sin(a) * 0.38, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), 0.0)); }
      } else {                                                    // the ring of stones and embers
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; parts.push(withEmber(place(new THREE.DodecahedronGeometry(0.11 + r2() * 0.05, 0), Math.cos(a) * 1.0, 0.06, Math.sin(a) * 1.0, r2() * 3, r2() * 3, 0), 0.2)); }
        parts.push(withEmber(place(new THREE.TorusGeometry(0.95, 0.14, 6, 40), 0, 0.03, 0, Math.PI / 2, 0, 0), 1));
      }
      const g = merge(parts);
      const fp = sites[f];
      // face the eye: rotate so its long side is across the view
      const yaw = Math.atan2(fp.face.x, fp.face.z);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(fp.x, 0, fp.z); g.computeBoundingSphere();
      baseGeos.push(g);
      const m = new THREE.MeshBasicNodeMaterial();
      const fs = uFS.element(int(f)), lvl = fs.x;
      const e = attribute('aE', 'float');
      const top = vec3(fp.x, 0.6 + TYPES[T].H1 * 0.25, fp.z);
      m.colorNode = (() => {
        const N = normalize(normalWorld), Pw = positionWorld, Lv = top.sub(Pw), dl = length(Lv);
        const lit = max(dot(N, Lv.div(max(dl, 1e-3))), 0).mul(float(1.2).div(dl.mul(dl).add(0.6))).mul(lvl.mul(0.9).add(0.1));
        const isIron = select(e.lessThan(0.05), float(1), float(0));
        const alb = mix(C.char, C.iron, isIron);
        const cracks = smoothstep(0.62, 0.8, fbm(vec2(Pw.x.add(Pw.z).mul(9.0), Pw.y.mul(14.0)).add(U.time.mul(0.15))));
        const glow = e.mul(cracks.mul(0.7).add(e.mul(0.35))).mul(lvl.mul(0.8).add(0.2)).mul(sin(U.time.mul(2.3).add(Pw.x.mul(5))).mul(0.15).add(0.85));
        const c = alb.mul(0.5).add(vec3(1.0, 0.45, 0.15).mul(lit).mul(mix(float(0.45), float(0.12), isIron))).add(mix(C.ember, C.emberHot, cracks).mul(glow).mul(0.7).mul(fs.y.mul(0.6).add(1)));
        return c.mul(float(1).sub(U.leave.mul(0.7)));
      })();
      m.fog = false;
      add(new THREE.Mesh(g, m), 2);
    }
  }

  // ------------------------------------------------------------------------------------------------ 3. the light on the floor (pools + the boom's ring)
  const lightGeo = new THREE.InstancedBufferGeometry();
  lightGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3)); lightGeo.setIndex([0, 2, 1, 0, 3, 2]);
  lightGeo.instanceCount = NF + 1; lightGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const uBoom = TSL.uniform(0), uRing = TSL.uniform(new THREE.Vector3(0, 0, 0));
  if (!QS.has('f2nolight')) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ii = int(instanceIndex), isRing = ii.equal(NF), fs = uFS.element(min_(ii, NF - 1)), fp = uFP.element(min_(ii, NF - 1));
    function min_(a, b) { return select(a.greaterThan(b), int(b), a); }
    const lvl = fs.x;
    const R = select(isRing, float(16), float(1.5).add(pow(lvl, 0.9).mul(5.5)).add(fs.z.mul(3)));
    const c0 = select(isRing, vec3(uRing.x, 0, uRing.z), vec3(fp.x, 0, fp.y));
    m.positionNode = c0.add(vec3(positionGeometry.x.mul(R), 0.014, positionGeometry.z.mul(R)));
    const vq = varying(vec2(positionGeometry.x, positionGeometry.z)), vS = varying(vec4(lvl, fs.y, fs.w, select(isRing, float(1), float(0))));
    m.colorNode = (() => {
      const r2 = dot(vq, vq), rr = TSL.sqrt(r2);
      const fl = sin(U.time.mul(9.0).add(vS.z.mul(17.0))).mul(0.07).add(sin(U.time.mul(3.1).add(vS.z.mul(5.0))).mul(0.08)).add(0.85);
      const pool = exp(r2.mul(-3.2)).mul(0.16).add(exp(r2.mul(-22.0)).mul(0.22)).mul(smoothstep(0.0, 0.25, vS.x).mul(0.85).add(0.15)).mul(vS.x.mul(0.8).add(0.2)).mul(fl).mul(vS.y.mul(1.8).add(1));
      // the boom: a ring of light running out over the floor (radius uBoom · 16 m), fading
      const ring = exp(rr.sub(uBoom).mul(rr.sub(uBoom)).mul(-180.0)).mul(float(1).sub(uBoom)).mul(select(uBoom.greaterThan(0.001), float(0.5), float(0)));
      const out = select(vS.w.greaterThan(0.5), C.amber.mul(ring), C.orange.mul(pool));
      return out.mul(float(1).sub(U.leave.mul(0.7)));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(lightGeo, m); mesh.frustumCulled = false; add(mesh, 1);
  }

  // ------------------------------------------------------------------------------------------------ update
  const acc = new Float32Array(NF);
  const lightOf = new Float32Array(NF);
  function update(dt, time, state) {
    const boom = state.boom || 0;
    for (let i = 0; i < NF; i++) {
      const lv = Math.max(0, Math.min(1, state.level[i] || 0)), fl = Math.max(0, state.flash?.[i] || 0);
      FS[i].set(lv, fl, boom > 0 ? Math.sin(Math.PI * Math.min(1, boom * 1.4)) : 0, FS[i].w);
      lightOf[i] = Math.min(1, lv * 0.9 + fl * 0.3 + (boom > 0 ? 0.3 * (1 - boom) : 0));
      // sparks: a steady rise with the level, a burst on a feed, a fountain on the boom
      if (!emit) continue;
      const T = TYPES[sites[i].type], H = T.H0 + (T.H1 - T.H0) * Math.pow(lv, 0.8);
      acc[i] += dt * T.sparks * (12 + 260 * lv * lv + 900 * fl + (boom > 0 && boom < 0.4 ? 1600 : 0));
      if (acc[i] >= 6) {
        const n = Math.floor(acc[i]); acc[i] -= n;
        const s = sites[i], w = (T.W0 + (T.W1 - T.W0) * lv) * (sites[i].type === 1 ? 1.2 : sites[i].type === 3 ? 4 : 1);
        emit(n, s.x, H * 0.55, s.z, w, 0, 1, 0, 0.55, 1.2 + 2.5 * lv + 3 * fl, 2.6 + 4 * lv + 5 * fl, 0.7, 1.6 + lv, 1.6 + 0.6 * lv, 0.25, 0.9);
      }
    }
    uBoom.value = boom > 0 ? Math.min(1, boom) : 0;
    // the volumetric flames: size with the level (+ the feed's flash, the boom), brightness, the crown's wave
    for (const v of VOL) {
      const i = v.f, T = TYPES[sites[i].type], lv = FS[i].x, fl = FS[i].y, bm = FS[i].z;
      const fk = fl * fl * (3 - 2 * fl);                       // (the feed's flare: a quick swell, a soft fall)
      const L = Math.pow(lv, 0.8) + fk * 0.34 + bm * 0.7;
      const wave = sites[i].type === 3 ? 0.72 + 0.32 * Math.sin(time * 1.6 - v.ph) : 1;
      const breath = 1 + 0.05 * Math.sin(time * T.beat * 1.57 + v.ph + i);
      const H = (T.H0 + (T.H1 - T.H0) * Math.min(1.25, L)) * v.hk * wave * breath, Wd = (T.W0 + (T.W1 - T.W0) * Math.min(1.2, L)) * 2.2 * v.wk;
      const m = v.F.mesh;
      m.scale.set(Wd, H * 1.25, Wd);
      m.position.set(sites[i].x + v.ox, Y0[sites[i].type] + H * 1.25 * 0.5, sites[i].z + v.oz);
      v.F.u.bright.value = (0.5 + 0.7 * Math.min(1, lv) + fk * 1.1 + bm * 0.6) * (1 - 0.7 * Number(U.leave.value || 0));
      v.F.u.magnitude.value = VSTY[sites[i].type].mag + fk * 0.7;
      v.F.update();
    }
  }
  return {
    meshes, update, vol: VOL,
    setRingCentre(x, z) { uRing.value.set(x, 0, z); },
    light: (i) => lightOf[i],
    info: { look: LOOK, volumeBoxes: VOL.length, drawCalls: meshes.length, flameInstances: NI, baseTris: baseGeos.reduce((a, g) => a + g.index.count / 3, 0) },
    dispose() { for (const m of meshes) { m.parent?.remove(m); m.material.dispose(); } flameGeo.dispose(); lightGeo.dispose(); for (const g of baseGeos) g.dispose(); for (const v of VOL) v.F.dispose(); fireTex?.dispose(); },
  };
}
