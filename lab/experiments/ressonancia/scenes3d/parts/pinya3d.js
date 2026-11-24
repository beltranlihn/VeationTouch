// Ressonància — part «pinya3d»: chapter II, Pinya · Força (contract: ../PARTS.md).  T-030 «trencadís digital»: a crowd of POINT CLOUDS
// and FIBRES, turquoise and coral (ARTE-2 §3, ref. 10: the tower of fibres, points and data cubes). Earlier clay crowd: pinya3d/*.bak.
//
// The pinya is the base: bodies pressed so close that they become one, and fibres that bind the crowd together and grow towards
// every hand. Three depths:
//   near (0.1–1.1 m beyond the walls): floating DATA CUBES (wire cubes and glazed tiles) that a hand knocks loose: they fall with
//     gravity, spin, bounce on the floor and the terraces, settle, and after a while float back up and lock into place.
//   the crowd (5.9–8 m from the eye): 458 bodies on rising terraces, each a dense POINT CLOUD sampled on the body kit (body.js:
//     skeleton, three poses asleep · awake · rotllana, shards) plus ~14 FIBRES along its bone chains; roots on the terraces tie each
//     body to its neighbours.
//   far (18–36 m): drifting clouds of points, turquoise with threads of coral, with a slower turn (parallax).
// Hands: at once a flash in the palm and a bundle of fibres sprouts from it into the crowd and anchors in the bodies and the earth
// behind; held, the bundle TIGHTENS (straightens, a pulse runs to the palm) and the hooked bodies lean their whole weight towards the
// hand and are lifted a little (a damped spring: let go and they sway back). Cubes near the hand fall.
// Room movement (the part's own group only): as the walls fill the crowd rises round the room (≤ 0.5 m); when the circle closes the
// whole pinya turns with the rotllana (≤ 3°/s, eased) and stops softly in the reward.
// input.state (score.js): fill[w] wakes wall w ring after ring; 'wall:<i>' = a pulse front to back and a shower of that wall's cubes;
// closed → rotllana pose, bands turn, a band of warmth goes round; 'close' = a wave of light. Reward (and later blocks): the points
// become square glazed tesserae (the trencadís).
// arrive/leave: points fly by shards (vertex stage), fibres grow/retract, cubes assemble/scatter.
// Study (no input.state): params fill, closed, dry, arrive, leave, glow, light, breath, fibres, cubes, density, move.
import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
import { bakeBodyGen, pose, rng, V } from './pinya3d/body.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------- builds and poses
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const ROTLLANA = { lean: 0.0, hunch: 0.0, head: -0.04, feet: [V(0.12, 0.07, 0.0), V(-0.12, 0.07, 0.0)], hands: [V(0.34, 1.42, 0.1), V(-0.34, 1.42, 0.1)],
  hf: [{ fd: [1, 0.5, 0], pn: [0, 0, 1] }, { fd: [-1, 0.5, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) };
const CROWD = [
  [{ lean: 0.26, hunch: 0.3, head: 0.6, feet: [V(0.11, 0.07, 0.1), V(-0.11, 0.07, -0.1)], hands: [V(0.16, 1.0, 0.42), V(-0.16, 1.04, 0.44)],
    hf: [{ fd: [0, -0.35, 1], pn: [0, 1, 0.35] }, { fd: [0, -0.3, 1], pn: [0, 1, 0.3] }], elbow: V(0, -1, -0.2) },
  { lean: 0.14, hunch: -0.04, head: -0.12, feet: [V(0.11, 0.07, 0.14), V(-0.11, 0.07, -0.12)], hands: [V(0.32, 1.86, 0.29), V(-0.29, 1.89, 0.31)],
    hf: [{ fd: [0.15, 1, 0.1], pn: [0, -0.1, 1] }, { fd: [-0.15, 1, 0.1], pn: [0, -0.1, 1] }], elbow: V(0, -1, -0.3) },
  ROTLLANA],
  [{ lean: 0.3, hunch: 0.38, head: 0.75, feet: [V(0.12, 0.07, -0.06), V(-0.1, 0.07, 0.12)], hands: [V(0.2, 0.78, 0.12), V(-0.15, 1.02, 0.44)],
    hf: [null, { fd: [0, -0.3, 1], pn: [0, 1, 0.3] }], elbow: V(0, -1, -0.2) },
  { lean: 0.1, hunch: 0.0, head: -0.25, feet: [V(0.12, 0.07, -0.08), V(-0.11, 0.07, 0.13)], hands: [V(0.27, 1.95, 0.21), V(-0.36, 1.66, 0.44)],
    hf: [{ fd: [0.1, 1, 0.1], pn: [0, -0.2, 1] }, { fd: [-0.2, 1, 0.4], pn: [0, -0.4, 1] }], elbow: V(0, -1, -0.3) },
  ROTLLANA],
];
// the awake pose of each body type is a different pinya posture (art direction 13:40: no cloned «arms up»)
const POSTURES = [
  // 0 · arms over the neighbours' shoulders (the ring that binds)
  { lean: 0.08, hunch: 0.06, head: 0.12, feet: [V(0.12, 0.07, 0.05), V(-0.12, 0.07, -0.04)], hands: [V(0.52, 1.36, -0.02), V(-0.5, 1.34, 0.03)],
    hf: [{ fd: [1, -0.25, 0], pn: [0, -1, 0] }, { fd: [-1, -0.25, 0], pn: [0, -1, 0] }], elbow: V(0, -1, -0.4) },
  // 1 · both hands flat on the back of the one in front, head down, pushing
  { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.12, 0.07, -0.1), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)],
    hf: [{ fd: [0, 0.5, 0.2], pn: [0, 0, 1] }, { fd: [0, 0.5, 0.2], pn: [0, 0, 1] }], elbow: V(0, -1, -0.2) },
  // 2 · arms raised, palms up, holding the floor above (the crossas)
  null,
  // 3 · one arm round the neighbour's shoulders, the other pushing forward at the chest
  { lean: 0.14, hunch: 0.12, head: 0.25, feet: [V(0.11, 0.07, 0.08), V(-0.12, 0.07, -0.08)], hands: [V(0.5, 1.33, 0.04), V(-0.12, 1.12, 0.45)],
    hf: [{ fd: [1, -0.25, 0], pn: [0, -1, 0] }, { fd: [0, 0.4, 0.3], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) },
];
for (const sp of POSTURES) if (sp) sp.hf = sp.hf.map((f) => f || undefined);
for (const set of CROWD) for (const sp of set) if (sp.hf) sp.hf = sp.hf.map((f) => f || undefined);

const NPTS = 1600;           // points per body
// T-044 · the figure that lays its palm on the visitor's (approach · press low · press high); body-local z of the wall at the palms
const ZW_L = 0.5, ZW_H = 0.4;
const PRESS = [
  { lean: 0.06, hunch: 0.02, head: 0.1, feet: [V(0.11, 0.07, 0.12), V(-0.11, 0.07, -0.12)], hands: [V(0.22, 0.95, 0.22), V(-0.2, 1.2, 0.34)],
    hf: [{ fd: [0, 0.3, 1], pn: [0, 1, -0.3] }, { fd: [0, 0.8, 0.6], pn: [0, -0.6, 0.8] }], elbow: V(0, -1, -0.3) },
  { lean: 0.28, hunch: 0.1, head: 0.3, feet: [V(0.12, 0.07, 0.12), V(-0.11, 0.07, -0.14)], hands: [V(0.27, 0.95, ZW_L - 0.06), V(-0.14, 1.02, ZW_L - 0.02)],
    hf: [{ fd: [0.25, 1, 0], pn: [0, 0, 1] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.5) },
  { lean: 0.12, hunch: 0.04, head: 0.05, feet: [V(0.12, 0.07, 0.1), V(-0.11, 0.07, -0.12)], hands: [V(0.32, 1.38, ZW_H - 0.02), V(-0.1, 1.72, ZW_H - 0.02)],
    hf: [{ fd: [0.2, 1, 0], pn: [0, 0, 1] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.6) },
];
const NPR = 18;   // T-047 (#16): 18 (was 12) so hand nº 13+ has a palm too · palm figures: one waiting at each wall centre (the target), the rest come out of the crowd to a hand
const NFIB = 14, NSEG = 16;  // fibres per body, samples per fibre
const CHAINS = [['aL', 'kL', 'hL', 'waist', 'neck', 'headC'], ['aR', 'kR', 'hR', 'waist', 'neck', 'headC'], ['tipL', 'wL', 'eL', 'shL', 'neck', 'headC'],
  ['tipR', 'wR', 'eR', 'shR', 'neck', 'headC'], ['tipL', 'wL', 'eL', 'shL', 'waist', 'hR', 'kR', 'aR'], ['tipR', 'wR', 'eR', 'shR', 'waist', 'hL', 'kL', 'aL'], ['pelvis', 'waist', 'neck', 'headC']];
const NH = 8, NHF = 30, NHS = 20;   // hand bundles: slots, fibres per bundle, samples per fibre
const TQ = [0.027, 0.65, 0.565], CO = [1.0, 0.16, 0.1], TEAL = [0.0044, 0.11, 0.133], BONE = [0.87, 0.69, 0.55], RED = [0.76, 0.044, 0.027];   // #2ED3C6 #FF6F59 #0E5F66 #F0D9C4 #E23B2E

// Catmull-Rom through points → n samples with tangents
function sampleChain(pts, n) {
  const out = [], tg = [], m = pts.length - 1;
  const at = (i) => pts[Math.max(0, Math.min(m, i))];
  const cr = (t) => {
    const s = Math.min(m - 1e-6, Math.max(0, t * m)), i = Math.floor(s), f = s - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), r = [0, 0, 0];
    for (let k = 0; k < 3; k++) r[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
    return r;
  };
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1), a = cr(Math.max(0, t - 0.01)), b = cr(Math.min(1, t + 0.01));
    out.push(cr(t)); const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1; tg.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  return { out, tg };
}

// ---------------------------------------------------------------------------------------------------------------- the part
export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, uniformArray, vec2, vec3, vec4, float, int, clamp, mix, smoothstep, sin, cos, max, min, abs, normalize, select, varying, fract,
    cameraPosition, cameraProjectionMatrix, modelViewMatrix, modelWorldMatrix, dot, exp, pow, cross, reflect, length } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'pinya3d';
  const uStep = uniform(0), uTime = uniform(0), uLeave = uniform(0), uArrive = uniform(1), uDry = uniform(0), uGain = uniform(1), uLight = uniform(1), uBreath = uniform(1);
  const H = room.strip?.height || 912;
  const uMinPt = uniform(1.0 * 2 / H), uMinFb = uniform(0.9 * 2 / H);   // the smallest point / fibre, in NDC (≈ 1 px)
  // the guide's text band (1.75–2.5 m at each wall centre): in a wall's own view the wall IS the NDC square, so the band is fixed
  const WH = room.walls[0]?.height || 3.75;
  // art bible §4 (14:00): two quiet zones per wall centre — the words ±1.6 m × 1.75–2.2 m and the hand target ±0.9 m × 0.9–1.6 m
  const uBand = uniform(new THREE.Vector4(2 * 1.72 / WH - 1, 2 * 2.3 / WH - 1, 0.48, 0.72));    // y0, y1, half width x, depth of the calm
  const uBand2 = uniform(new THREE.Vector4(2 * 0.88 / WH - 1, 2 * 1.62 / WH - 1, 0.27, 0.85));
  const zone = (ndc, B) => smoothstep(B.x.sub(0.08), B.x, ndc.y).mul(float(1).sub(smoothstep(B.y, B.y.add(0.08), ndc.y)))   // full inside, soft outside
    .mul(float(1).sub(smoothstep(B.z, B.z.add(0.09), abs(ndc.x)))).mul(B.w);
  const calmOf = (ndc) => max(zone(ndc, uBand), zone(ndc, uBand2));

  // a quad / ribbon in clip space: c0 = the centre, d = NDC per unit of `size` in x and y (so a point keeps a world size, but never < 1 px)
  const clipOf = (pv) => cameraProjectionMatrix.mul(pv);
  const ndcScale = (pv, c0, size) => { const c1 = clipOf(vec4(pv.xy.add(vec2(size, size)), pv.z, 1)); return abs(c1.xy.div(c1.w).sub(c0.xy.div(c0.w))).add(1e-7); };
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
  const tc = (c) => vec3(c[0], c[1], c[2]);

  // per-instance (body) layout, 16 floats: i0 = (x, y, z, height); i1 = (wake, glow, lean, rotllana); i2 = (seed, phase, step, yaw); i3 = (head turn, width, lift, -)
  const instBuf = (count) => { const b = new THREE.InstancedInterleavedBuffer(new Float32Array(count * 16), 16, 1); b.setUsage(THREE.DynamicDrawUsage); return b; };
  function instanceXform(i0, i2, i3, p, n) {
    const yaw = i2.w, cy = cos(yaw), sy = sin(yaw), hs = i0.w, ws = i3.y;
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const ps = vec3(p.x.mul(ws), p.y, p.z.mul(ws)).mul(hs);
    const local = X.mul(ps.x).add(vec3(0, ps.y, 0)).add(F.mul(ps.z)).add(i0.xyz);
    return { local, nl: n ? X.mul(n.x).add(vec3(0, n.y, 0)).add(F.mul(n.z)) : null, X, F };
  }
  // fragmentation of a shard (centre L, seed sd), for points: shared by leave and arrive
  function shardMotion(p, n, L, sd, seed) {
    const r1 = fract(sd.mul(17.23)), r2 = fract(sd.mul(41.71)), r3 = fract(sd.mul(73.13)), r4 = fract(sd.mul(131.3));
    const hgt = clamp(p.y.div(1.8), 0, 1);
    const u = clamp(uLeave.mul(1.9).sub(r1.mul(0.3).add(float(1).sub(hgt).mul(0.3)).add(fract(seed.mul(7.7)).mul(0.25))).div(0.95), 0, 1);
    const va = clamp(float(1).sub(uArrive.mul(1.9).sub(r2.mul(0.3).add(hgt.mul(0.3)).add(fract(seed.mul(5.3)).mul(0.25))).div(0.95)), 0, 1);
    const axis = normalize(vec3(r1.sub(0.5), r2.sub(0.5), r3.sub(0.5)).add(vec3(0, 0.001, 0)));
    const ang = u.mul(r3.mul(3).add(1.5)).add(va.mul(r4.mul(3).add(2)));
    const sc = float(1).sub(smoothstep(0.55, 1.0, u)).mul(float(1).sub(smoothstep(0.45, 1.0, va)));
    const dLeave = vec3(r3.sub(0.5).mul(1.4), u.mul(u).mul(r1.mul(2.6).add(1.4)).add(u.mul(0.3)), r2.add(0.3).negate()).mul(u);
    const dArrive = normalize(vec3(r1.sub(0.5), r2.mul(0.5).sub(0.55), r3.sub(0.85))).mul(r4.mul(2.2).add(0.8)).mul(pow(va, 1.3));
    return { p: p.sub(L).add(rotA(L.mul(sc), axis, ang)).add(dLeave).add(dArrive), n: rotA(n, axis, ang), u, va, hgt, sc };
  }

  // ================================================================================================== the crowd: POINT CLOUDS
  // one interleaved vertex buffer per body type (34 floats per corner), quads of 4 corners
  function pointType(body, seed, n = NPTS) {
    const r = rng(seed), F = 34, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) {
      const v = Math.floor(r() * body.n), rnd = r(), rnd2 = r();
      for (let c = 0; c < 4; c++) {
        const o = (k * 4 + c) * F;
        for (let q = 0; q < 3; q++) { A.set(body.P[q].subarray(v * 3, v * 3 + 3), o + q * 3); A.set(body.N[q].subarray(v * 3, v * 3 + 3), o + 9 + q * 3); }
        A.set(body.aSh.subarray(v * 4, v * 4 + 4), o + 18); A.set(body.aAux.subarray(v * 4, v * 4 + 4), o + 22); A.set(body.aAux2.subarray(v * 4, v * 4 + 4), o + 26);
        A[o + 30] = C[c][0]; A[o + 31] = C[c][1]; A[o + 32] = rnd; A[o + 33] = rnd2;
      }
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), at = {};
    for (const [name, size, off] of [['position', 3, 0], ['pB', 3, 3], ['pC', 3, 6], ['nA', 3, 9], ['nB', 3, 12], ['nC', 3, 15], ['aSh', 4, 18], ['aAux', 4, 22], ['aAux2', 4, 26], ['aCo', 4, 30]]) at[name] = new THREE.InterleavedBufferAttribute(ib, size, off);
    return { at, index: new THREE.BufferAttribute(idx, 1), count: n * 6, n };
  }
  // fibres of a body type along its bone chains, in the three poses (22 floats per vertex, 2 vertices per sample)
  function fibreType(build, specs, seed) {
    const r = rng(seed), ks = specs.map((sp) => pose(sp, build));
    for (const k of ks) for (const sd of ['L', 'R']) { const w = k['w' + sd], f = k['hf' + sd].fd; k['tip' + sd] = [w[0] + f[0] * 0.13 * k.s, w[1] + f[1] * 0.13 * k.s, w[2] + f[2] * 0.13 * k.s]; }
    const F = 22, nv = NFIB * NSEG * 2, A = new Float32Array(nv * F), idx = [];
    for (let fi = 0; fi < NFIB; fi++) {
      const chain = CHAINS[fi % CHAINS.length], rnd = r();
      const offs = chain.map((j) => { const rad = j === 'waist' || j === 'pelvis' || j === 'neck' ? 0.085 : j === 'headC' ? 0.05 : 0.035; return [(r() - 0.5) * 2 * rad, (r() - 0.5) * rad, (r() - 0.5) * 2 * rad]; });
      const S = ks.map((k) => sampleChain(chain.map((j, q) => [k[j][0] + offs[q][0], k[j][1] + offs[q][1], k[j][2] + offs[q][2]]), NSEG));
      for (let j = 0; j < NSEG; j++) for (let sd = 0; sd < 2; sd++) {
        const o = ((fi * NSEG + j) * 2 + sd) * F;
        for (let q = 0; q < 3; q++) { A.set(S[q].out[j], o + q * 3); A.set(S[q].tg[j], o + 9 + q * 3); }
        A[o + 18] = j / (NSEG - 1); A[o + 19] = sd ? 1 : -1; A[o + 20] = rnd; A[o + 21] = fi;
      }
      for (let j = 0; j < NSEG - 1; j++) { const a = (fi * NSEG + j) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const ib = new THREE.InterleavedBuffer(A, F), at = {};
    for (const [name, size, off] of [['position', 3, 0], ['fB', 3, 3], ['fC', 3, 6], ['tA', 3, 9], ['tB', 3, 12], ['tC', 3, 15], ['aF', 4, 18]]) at[name] = new THREE.InterleavedBufferAttribute(ib, size, off);
    return { at, index: new THREE.BufferAttribute(new Uint32Array(idx), 1) };
  }
  function makeGeo(va, inst, count, sphere) {
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(va.at)) g.setAttribute(k, a);
    g.setIndex(va.index);
    for (let i = 0; i < 4; i++) g.setAttribute('i' + i, new THREE.InterleavedBufferAttribute(inst, 4, i * 4));
    g.instanceCount = count;
    g.boundingSphere = sphere || new THREE.Sphere(new THREE.Vector3(0, 2, 0), 40);
    return g;
  }

  function pointMaterial() {
    const pA = attribute('position', 'vec3'), pB = attribute('pB', 'vec3'), pC = attribute('pC', 'vec3'), nA = attribute('nA', 'vec3'), nB = attribute('nB', 'vec3'), nC = attribute('nC', 'vec3');
    const sh = attribute('aSh', 'vec4'), aux = attribute('aAux', 'vec4'), aux2 = attribute('aAux2', 'vec4'), co = attribute('aCo', 'vec4');
    const i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4');
    const seed = i2.x, phase = i2.y, w = i1.x, rl = i1.w;
    let p = mix(mix(pA, pB, w), pC, rl), n = normalize(mix(mix(nA, nB, w), nC, rl));
    const zN = mix(mix(float(0.2), float(0.06), w), float(0.0), rl);
    const ht = i3.x.mul(aux2.w), ch = cos(ht), shh = sin(ht), hx = p.x, hz = p.z.sub(zN);
    p = vec3(hx.mul(ch).add(hz.mul(shh)), p.y, hx.mul(shh).negate().add(hz.mul(ch)).add(zN));
    const bt = fract(uTime.add(phase).div(10));
    const br = select(bt.lessThan(0.4), smoothstep(0.0, 0.4, bt), float(1).sub(smoothstep(0.4, 1.0, bt))).mul(uBreath);
    p = p.add(n.mul(aux.y.mul(br).mul(0.014))).add(vec3(0, aux.y.mul(br).mul(0.008), 0));
    const lift = aux.z.mul(rl), st = uStep.add(i3.w.mul(8.5));
    p = p.add(vec3(lift.abs().mul(sin(st).mul(0.03)), max(lift.mul(sin(st)), 0).mul(0.07), 0));
    p = p.add(vec3(0, p.y.mul(i1.z).mul(i1.z).mul(-0.03), p.y.mul(i1.z).mul(0.24)));   // lean: the whole weight, pivoting on the feet
    // let go: the body runs down like sand, bounces on the grid and climbs back (i3.z = 0..1 over 3.2 s)
    {
      const sT = i3.z, tt = max(sT.mul(3.2).sub(co.w.mul(0.45)), 0), d0 = max(p.y, 0.002), g = 6.0;
      const tf = TSL.sqrt(d0.mul(2 / g)), tb = max(tt.sub(tf), 0);
      const ySand = select(tt.lessThan(tf), d0.sub(tt.mul(tt).mul(g * 0.5)), max(tf.mul(g * 0.3).mul(tb).sub(tb.mul(tb).mul(g * 0.5)), 0));
      const spread = min(tt.div(tf.add(0.01)), 1).mul(0.3);
      const pS = vec3(p.x.add(co.z.sub(0.5).mul(spread)), ySand.add(0.01), p.z.add(fract(co.w.mul(7.3)).sub(0.5).mul(spread)));
      p = select(sT.greaterThan(0.0001), mix(pS, p, smoothstep(0.7, 1.0, sT)), p);
    }
    const fm = shardMotion(p, n, sh.xyz, sh.w.add(seed.mul(0.37)), seed);
    const X = instanceXform(i0, i2, i3, fm.p, fm.n);
    const pv = modelViewMatrix.mul(vec4(X.local, 1)), c0 = clipOf(pv);
    const size = float(0.0042).add(co.z.mul(0.0042)).mul(uDry.mul(0.5).add(1)).mul(fm.sc.mul(0.7).add(0.3)).mul(float(1).sub(fm.u.mul(0.5)));
    const d = ndcScale(pv, c0, size), k = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w);
    const vN = varying(modelWorldMatrix.mul(vec4(X.nl, 0)).xyz), vP = varying(modelWorldMatrix.mul(vec4(X.local, 1)).xyz);
    // varyings packed (WebGPU allows 16 fragment inputs): A = wake, glow, 1/k², fade · B = ash, u, height, seed · C = ao, thin, ring, - · ndc
    const vCo = varying(co), vNdc = varying(c0.xy.div(c0.w));
    const vA4 = varying(vec4(max(w, rl), i1.y.mul(br.mul(0.3).add(0.8)), float(1).div(k.mul(k)), float(1).sub(smoothstep(0.1, 0.75, fm.u)).mul(float(1).sub(smoothstep(0.5, 1.0, fm.va)))));
    const vB4 = varying(vec4(fm.va, fm.u, fm.hgt, sh.w.add(seed.mul(0.37)))), vC4 = varying(vec4(aux2.x, aux2.y, i3.w, i2.z));
    const vWake = vA4.x, vGlow = vA4.y, vK = vA4.z, vFade = vA4.w, vAsh = vB4.x, vU = vB4.y, vH = vB4.z, vSeed = vB4.w, vAo = vC4.x, vThin = vC4.y, vRing = vC4.z;
    // shape: a round point; dry → a square tessera
    const q = vCo.xy, disc = float(1).sub(step01(dot(q, q).sub(1))), sq = float(1).sub(step01(max(abs(q.x), abs(q.y)).sub(0.86)));
    m.opacityNode = mix(disc, sq, smoothstep(0.3, 0.6, uDry)); m.alphaTest = 0.5;
    // colour: turquoise matter, brighter on the silhouette; coral specks; coral heat where hands, pulses and the rotllana are
    const N = normalize(vN), Vd = normalize(cameraPosition.sub(vP));
    const ndv = abs(dot(N, Vd)), rim = pow(float(1).sub(ndv), 2.2);
    const ao = vAo.mul(0.6).add(0.4), low = smoothstep(0.04, 0.8, vH).mul(0.8).add(0.2);
    const speck = smoothstep(0.88, 0.9, vCo.w);
    const base = mix(tc(TQ), mix(tc(CO), vec3(1.0, 0.86, 0.78), 0.2), speck).mul(mix(float(0.7), float(1.15), vCo.z));
    const lum = mix(float(0.072), float(0.16), vWake).mul(rim.mul(1.6).add(0.3)).mul(ao).mul(low).mul(uLight).mul(vC4.w.mul(2.4).add(1));   // the calm light (a breath round the crowd) — T-053 (ARTE r5): the calm at 45 % of the awake (was 28 %: P2/P3 read black)
    let col = base.mul(lum);
    const twk = pow(sin(uTime.mul(vCo.z.mul(2.5).add(0.6)).add(vCo.w.mul(60))).mul(0.5).add(0.5), 30);
    col = col.mul(twk.mul(2.5).mul(vWake.mul(0.7).add(0.3)).add(1));
    const heat = clamp(vGlow, 0, 2.5);
    const gcol = mix(tc(CO), vec3(1.0, 0.72, 0.5), clamp(vThin.mul(0.6).add(rim.mul(0.4)), 0, 1));
    col = col.add(gcol.mul(heat).mul(rim.mul(0.9).add(vThin.mul(0.4)).add(0.18)).mul(uGain).mul(float(1).sub(uDry.mul(0.5))).mul(float(1).sub(vAsh)));
    // the trencadís of the reward: glazed tesserae (cobalt, turquoise, coral, gold, bone) per shard
    const g1 = fract(vSeed.mul(11.1)), g2 = fract(vSeed.mul(23.7));
    const glaze = mix(mix(vec3(0.1, 0.25, 0.9), tc(TQ), smoothstep(0.3, 0.32, g1)), mix(tc(CO), vec3(1.0, 0.72, 0.25), smoothstep(0.5, 0.52, g2)), smoothstep(0.6, 0.62, g1));
    col = mix(col, glaze.mul(mix(float(0.1), float(0.22), vWake)).mul(rim.add(0.45)).mul(uLight), uDry.mul(0.85));
    // flying shards catch the light; arriving ash has ember edges
    col = col.mul(float(1).sub(smoothstep(0.05, 0.5, vU).mul(0.5))).add(vec3(0.85, 1.0, 1.0).mul(smoothstep(0.02, 0.2, vU)).mul(twk.mul(0.9).add(0.008)));
    col = col.mul(float(1).sub(vAsh.mul(0.6))).add(tc(CO).mul(vAsh.mul(float(1).sub(vAsh)).mul(4)).mul(0.07).mul(twk.mul(3).add(0.3)));
    // depth haze between the rows (the back rows and the legs sink into a deep teal), and the calm behind the guide's words
    const haze = clamp(vRing.mul(0.75).add(float(1).sub(vH).mul(0.25)), 0, 0.82);
    col = mix(col, tc(TEAL).mul(0.07), haze);
    col = col.mul(float(1).sub(calmOf(vNdc)));
    m.colorNode = col.mul(vFade).mul(vK.mul(0.5).add(0.5));
    m.fog = false;
    return m;
  }
  function step01(x) { return smoothstep(-0.0001, 0.0001, x); }

  // ribbons in clip space: centre c0 from pv, direction from the view-space tangent tv, half width `wid` (world), side ±1
  function ribbon(pv, tv, wid, side, minNdc) {
    const c0 = clipOf(pv), ct = clipOf(vec4(pv.xyz.add(tv.mul(0.05)), 1));
    const d = ndcScale(pv, c0, wid), dir = ct.xy.div(ct.w).sub(c0.xy.div(c0.w)).div(d);
    const dn = dir.div(length(dir).add(1e-6)), perp = vec2(dn.y.negate(), dn.x);
    const k = max(float(1), minNdc.div(d.y));
    return { pos: vec4(c0.xy.add(perp.mul(d).mul(k).mul(side).mul(c0.w)), c0.z, c0.w), k };
  }
  function bodyFibreMaterial() {
    const fA = attribute('position', 'vec3'), fB = attribute('fB', 'vec3'), fC = attribute('fC', 'vec3'), tA = attribute('tA', 'vec3'), tB = attribute('tB', 'vec3'), tCc = attribute('tC', 'vec3');
    const aF = attribute('aF', 'vec4'), i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4');
    const w = i1.x, rl = i1.w, t = aF.x, side = aF.y, rnd = aF.z, seed = i2.x;
    let p = mix(mix(fA, fB, w), fC, rl);
    const tg = normalize(mix(mix(tA, tB, w), tCc, rl).add(vec3(0, 1e-4, 0)));
    const bt = fract(uTime.add(i2.y).div(10)), br = select(bt.lessThan(0.4), smoothstep(0.0, 0.4, bt), float(1).sub(smoothstep(0.4, 1.0, bt))).mul(uBreath);
    p = p.add(vec3(sin(uTime.mul(0.7).add(rnd.mul(30)).add(t.mul(4))).mul(0.006), br.mul(0.008), 0));
    p = p.add(vec3(0, p.y.mul(i1.z).mul(i1.z).mul(-0.03), p.y.mul(i1.z).mul(0.24)));
    // leave: the fibre lets go from its root up and drifts; arrive: it grows from the root
    const r1 = fract(rnd.mul(17.3).add(seed.mul(0.31))), r2 = fract(rnd.mul(41.7).add(seed.mul(0.17)));
    const u = clamp(uLeave.mul(1.7).sub(r1.mul(0.5)), 0, 1), grow = clamp(uArrive.mul(1.6).sub(r2.mul(0.5)), 0, 1);
    p = p.add(vec3(r1.sub(0.5).mul(1.2), u.mul(u).mul(r2.mul(2).add(1.2)), r2.add(0.3).negate()).mul(u));
    const X = instanceXform(i0, i2, i3, p, null);
    const tl = X.X.mul(tg.x).add(vec3(0, tg.y, 0)).add(X.F.mul(tg.z));
    const pv = modelViewMatrix.mul(vec4(X.local, 1)), tv = modelViewMatrix.mul(vec4(tl, 0)).xyz;
    const rb = ribbon(pv, tv, float(0.003), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = rb.pos;
    const vis = smoothstep(t.sub(0.04), t, grow).mul(float(1).sub(smoothstep(float(1).sub(u).sub(0.05), float(1).sub(u), t)));
    const vNdc = varying(rb.pos.xy.div(rb.pos.w)), vRing = varying(i3.w);
    const vSide = varying(side), vA = varying(vis.div(rb.k)), vWake = varying(max(w, rl)), vGlow = varying(i1.y), vT = varying(t), vR = varying(rnd);
    const across = float(1).sub(vSide.mul(vSide));
    const bone = mix(tc(TQ).mul(0.8), tc(BONE), smoothstep(0.8, 0.82, vR));   // the body's own fibres: turquoise, a few bone (bone is the grip's colour)
    const flow = pow(sin(vT.mul(9).sub(uTime.mul(1.3)).add(vR.mul(40))).mul(0.5).add(0.5), 6);
    let col = bone.mul(mix(float(0.015), float(0.05), vWake).mul(flow.mul(1.5).add(0.6))).mul(uLight);
    col = col.add(tc(CO).mul(clamp(vGlow, 0, 2.5)).mul(0.22).mul(uGain));
    m.colorNode = col.mul(across).mul(vA).mul(float(1).sub(uDry.mul(0.6))).mul(float(1).sub(vRing.mul(0.5))).mul(float(1).sub(calmOf(vNdc)));
    m.fog = false;
    return m;
  }

  // ---- the crowd: five rings, pressed together, rows staggered
  const RINGS = [0, 1, 2, 3, 4].map((i) => ({ r: 5.85 + 0.5 * i, y: 0.3 * i, band: i < 2 ? 0 : 1 })), SPACING = 0.47, NSEC = 8;
  const crowd = [];
  const rr = rng(4242);
  // the FIRST ROW (art direction 13:10): along each wall, 1.25–1.9 m behind it, at real size, twice the points; it does not turn
  room.walls.forEach((w, wi) => {
    const n = Math.floor((w.width - 0.9) / 0.56);
    for (let j = 0; j <= n; j++) {
      const x = -w.width / 2 + 0.45 + j * 0.56 + (rr() - 0.5) * 0.14, d = 1.25 + rr() * 0.6;
      const px = w.centre.x + w.right.x * x - w.normal.x * d, pz = w.centre.z + w.right.z * x - w.normal.z * d;
      crowd.push({ ring: 0, band: 2, front: wi, a0: Math.atan2(pz, px), r: Math.hypot(px, pz), y: 0, seed: rr(), phase: rr() * 3, type: Math.floor(rr() * 4), h: 0.94 + rr() * 0.09, w: 0.95 + rr() * 0.1,
        turn: (rr() - 0.5) * 0.9, lit: 0, wake: 0, glow: 0, lean: 0, lv: 0, lift: 0, hook: 0, sand: 0, rl: 0, wall: 0, u: 0.5, mesh: null, slot: 0, idx: crowd.length, fx: x });
    }
  });
  RINGS.forEach((R, ri) => {
    const nn = Math.round((2 * Math.PI * R.r) / SPACING), off = ri * 0.5 * (2 * Math.PI) / nn;
    for (let j = 0; j < nn; j++) {
      const a0 = off + ((j + (rr() - 0.5) * 0.5) * 2 * Math.PI) / nn, h = 0.84 + rr() * 0.26;
      if (ri > 0 && rr() < 0.07) continue;   // gaps: the rows are not a wall
      crowd.push({ ring: ri + 1, band: R.band, sand: 0, a0, r: R.r + (rr() - 0.5) * 0.32 + (ri === 0 ? 0.08 : 0), y: R.y, seed: rr(), phase: rr() * 3, type: Math.floor(rr() * 4), h, w: 0.93 + rr() * 0.14,
        turn: (rr() - 0.5) * 0.9, lit: 0, wake: 0, glow: 0, lean: 0, lv: 0, lift: 0, hook: 0, rl: 0, wall: 0, u: 0.5, mesh: null, slot: 0, idx: crowd.length });
    }
  });
  const frontRow = crowd.filter((c) => c.band === 2);
  const tCreate = performance.now();
  const ptTypes = [], ptTypesF = [], fbTypes = [], jobs = [];
  const ptMat = pointMaterial(), fbMat = bodyFibreMaterial();
  const bandGroups = [new THREE.Group(), new THREE.Group(), new THREE.Group()]; for (const g of bandGroups) object.add(g);   // 2 = the first row (counter-turned: it stays by its wall)
  const meshes = [];
  let density = 1, flying = false;
  function buildType(t) {
    for (let b = 0; b < 3; b++) for (let s = 0; s < NSEC; s++) {
      const list = crowd.filter((c) => c.band === b && c.type === t && Math.floor((((c.a0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / NSEC)) === s);
      if (!list.length) continue;
      const buf = instBuf(list.length), A = buf.array, cen = new THREE.Vector3();
      list.forEach((c, k) => {
        c.slot = k; const x = Math.cos(c.a0) * c.r, z = Math.sin(c.a0) * c.r; c.x = x; c.z = z; cen.x += x; cen.z += z;
        const o = k * 16; A[o] = x; A[o + 1] = c.y; A[o + 2] = z; A[o + 3] = c.h; A[o + 8] = c.seed * 97; A[o + 11] = Math.atan2(-x, -z); A[o + 12] = c.turn; A[o + 13] = c.w; A[o + 15] = c.ring / RINGS.length;
      });
      cen.multiplyScalar(1 / list.length); cen.y = 1.5;
      let rad = 0; for (const c of list) rad = Math.max(rad, Math.hypot(c.x - cen.x, c.z - cen.z));
      const sphere = new THREE.Sphere(cen, rad + 2.6);
      const pt = b === 2 ? ptTypesF[t] : ptTypes[t];
      const pm = new THREE.Mesh(makeGeo(pt, buf, list.length, sphere), ptMat);
      pm.geometry.setDrawRange(0, Math.round(pt.n * density) * 6);
      const fm = new THREE.Mesh(makeGeo(fbTypes[t], buf, list.length, sphere), fbMat); fm.renderOrder = 3;
      for (const mm of [pm, fm]) { mm.frustumCulled = !flying; bandGroups[b].add(mm); }
      const M = { list, buf, mesh: pm, fmesh: fm, n: pt.n }; meshes.push(M); for (const c of list) c.mesh = M;
    }
  }
  for (let bi = 0; bi < 2; bi++) for (let vi = 0; vi < 2; vi++) {
    const t = bi * 2 + vi;
    const base = bi === 0 ? CROWD[vi] : CROWD[vi].map((sp, k) => (k !== 1 ? sp : { ...sp, hands: sp.hands.map((h) => V(h[0] * 1.1, h[1] - 0.14, h[2] - 0.02)) }));
    const set = POSTURES[t] ? [base[0], POSTURES[t], base[2]] : base;
    jobs.push({ gen: bakeBodyGen(BUILDS[bi], REST, set, { grid: 0.028, detail: false, seed: 11 + bi * 7 + vi, shards: 26 }), done: (body) => {
      ptTypes[t] = pointType(body, 300 + t); ptTypesF[t] = pointType(body, 700 + t, NPTS * 2); fbTypes[t] = fibreType(BUILDS[bi], set, 500 + t); buildType(t);
    } });
  }
  // ---- the palm figures (T-044): a point-cloud body with fingers, baked in the three press poses
  const prBuf = instBuf(NPR); let pbody = null;
  jobs.push({ gen: bakeBodyGen(BUILDS[0], REST, PRESS, { grid: 0.02, detail: true, seed: 99, shards: 34 }), done: (body) => {
    pbody = body; const pt = pointType(body, 911, 2600);
    const pm = new THREE.Mesh(makeGeo(pt, prBuf, NPR), ptMat); pm.frustumCulled = false; bandGroups[2].add(pm);
  } });
  const createMs = Math.round(performance.now() - tCreate); let readyMs = 0;

  // ---- which wall a body is seen through, and where along it
  const walls = room.walls, NW = walls.length, eye = room.eye;
  function wallOf(x, z, c) {
    let best = -1, bt = 1e9;
    for (let i = 0; i < NW; i++) {
      const w = walls[i], den = x * w.normal.x + z * w.normal.z;
      if (den >= -1e-6) continue;
      const t = ((w.centre.x - eye.x) * w.normal.x + (w.centre.z - eye.z) * w.normal.z) / den;
      if (t > 0 && t < bt) { bt = t; best = i; }
    }
    c.wall = best < 0 ? 0 : best;
    const w = walls[c.wall];
    c.u = clamp01(((x * bt - w.pa.x) * w.right.x + (z * bt - w.pa.z) * w.right.z) / w.width);
  }

  // ---- the terraces (object space): height of the ground at radius r
  const R0 = RINGS.map((R) => R.r - 0.28), LAST = RINGS[RINGS.length - 1];
  const groundY = (r) => { if (r > LAST.r + 0.5) return 3.0; let y = 0; for (let i = 1; i < RINGS.length; i++) if (r >= R0[i]) y = RINGS[i].y; return y; };

  // ================================================================================================== hands: the bundles of fibres
  const HA = [], HB = [], HC = [], HK = [], HW = [];
  for (let i = 0; i < NH; i++) HW.push(new THREE.Vector4(0, -50, 0, 0));
  const uHW = uniformArray(HW, 'vec4'), uClosed = uniform(0);   // hands in WORLD space (xyz, reach) for the grip fibres
  for (let i = 0; i < NH * 5; i++) HK.push(new THREE.Vector4(0, -50, 0, 0));
  const uHK = uniformArray(HK, 'vec4');   // the 5 hooked bodies per bundle: chest xyz, ground y
  for (let i = 0; i < NH; i++) { HA.push(new THREE.Vector4(0, -50, 0, 0)); HB.push(new THREE.Vector4(0, 0, 0, 0)); HC.push(new THREE.Vector4(0, 0, 1, 0)); }
  const uHA = uniformArray(HA, 'vec4'), uHB = uniformArray(HB, 'vec4'), uHC = uniformArray(HC, 'vec4');   // A: palm xyz, grow · B: root xyz, taut · C: normal xyz, presence
  {
    const F = 8, nv = NH * NHF * NHS * 2, A = new Float32Array(nv * F), idx = [], r = rng(77);
    for (let s = 0; s < NH; s++) for (let f = 0; f < NHF; f++) {
      const rs = [r(), r(), r(), r(), r()];
      for (let j = 0; j < NHS; j++) for (let sd = 0; sd < 2; sd++) {
        const o = (((s * NHF + f) * NHS + j) * 2 + sd) * F;
        A.set([s, j / (NHS - 1), sd ? 1 : -1, rs[0], rs[1], rs[2], rs[3], rs[4]], o);
      }
      for (let j = 0; j < NHS - 1; j++) { const a = ((s * NHF + f) * NHS + j) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aH2', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    const aH = attribute('position', 'vec4'), a2 = attribute('aH2', 'vec4');
    const si = int(aH.x), t = aH.y, side = aH.z, r1 = aH.w, r2 = a2.x, r3 = a2.y, r4 = a2.z, r5 = a2.w;
    const qA = uHA.element(si), qB = uHB.element(si), qC = uHC.element(si);
    const nrm = qC.xyz, right = vec3(nrm.z, 0, nrm.x.negate()), up = vec3(0, 1, 0), grow = qA.w, taut = qB.w;
    const hk = uHK.element(si.mul(5).add(int(r4.mul(4.999))));
    const P0chest = hk.xyz.add(right.mul(r1.sub(0.5).mul(0.3))).add(up.mul(r2.sub(0.5).mul(0.55)));
    const P0root = vec3(hk.x, hk.w.add(0.02), hk.z).add(right.mul(r1.sub(0.5).mul(0.7))).add(nrm.mul(0.15));
    const P0 = select(r2.lessThan(0.22), P0root, P0chest);
    const P3 = qA.xyz.add(right.mul(r1.sub(0.5).mul(0.08))).add(up.mul(r2.sub(0.5).mul(0.08))).sub(nrm.mul(0.012));
    const sag = r3.mul(0.6).add(0.45).mul(float(1).sub(taut)).add(0.02);
    const trem = sin(uTime.mul(9).add(r1.mul(40))).mul(0.012).mul(taut);
    const P1 = P0.add(nrm.mul(r3.mul(0.4).add(0.65))).add(up.mul(select(r2.lessThan(0.22), float(0.05), r5.sub(0.5).mul(0.3))));   // out of the body, towards the room first
    const P2 = P3.sub(nrm.mul(r5.mul(0.5).add(0.45))).sub(up.mul(sag)).add(right.mul(trem.add(r1.sub(0.5).mul(0.25).mul(float(1).sub(taut)))));
    const s = float(1).sub(t);
    const B = P0.mul(s.mul(s).mul(s)).add(P1.mul(s.mul(s).mul(t).mul(3))).add(P2.mul(s.mul(t).mul(t).mul(3))).add(P3.mul(t.mul(t).mul(t)));
    const dB = P1.sub(P0).mul(s.mul(s).mul(3)).add(P2.sub(P1).mul(s.mul(t).mul(6))).add(P3.sub(P2).mul(t.mul(t).mul(3)));
    const pv = modelViewMatrix.mul(vec4(B, 1)), tv = modelViewMatrix.mul(vec4(normalize(dB.add(vec3(0, 1e-4, 0))), 0)).xyz;
    const rb = ribbon(pv, tv, float(0.0028).add(t.mul(0.002)), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = select(qC.w.greaterThan(0.001), rb.pos, vec4(0, 0, 2, 1));
    const reach = float(1).sub(t), vis = float(1).sub(smoothstep(grow.mul(r4.mul(0.3).add(0.7)).sub(0.05), grow.mul(r4.mul(0.3).add(0.7)), reach));
    const vT = varying(t), vS = varying(side), vA = varying(vis.mul(qC.w).div(rb.k)), vTaut = varying(taut), vR = varying(r1), vGrow = varying(grow);
    const pulse = pow(sin(vT.mul(16).sub(uTime.mul(6)).add(vR.mul(6))).mul(0.5).add(0.5), 10).mul(vTaut);
    const tip = pow(vT, 3);
    const col = mix(tc(TQ).mul(0.35), tc(CO).mul(1.1), smoothstep(0.35, 1.0, vT)).mul(tip.mul(1.4).add(0.25).add(pulse.mul(1.6))).mul(vGrow.mul(0.6).add(0.4));
    m.colorNode = col.mul(float(1).sub(vS.mul(vS))).mul(vA).mul(uGain).mul(float(1).sub(uLeave)).mul(0.6);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; object.add(mesh);
  }
  const slots = []; for (let i = 0; i < NH; i++) slots.push({ stroke: null, pos: new THREE.Vector3(), nrm: new THREE.Vector3(0, 0, 1), wall: 0, grow: 0, taut: 0, pres: 0, held: 0, hooks: [], root: new THREE.Vector3(), aw: 0, t0: -99, shakeT: -99, world: new THREE.Vector3() });

  // ---- the flash in the palm (immediate): view-facing soft discs just behind the wall plane
  const NG = NH;
  const gA = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4); gA.setUsage(THREE.DynamicDrawUsage);
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  gGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  gGeo.setIndex([0, 1, 2, 0, 2, 3]); gGeo.setAttribute('g0', gA); gGeo.instanceCount = NG;
  {
    const g0 = attribute('g0', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(g0.xyz, 1));
    m.vertexNode = select(g0.w.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(TSL.positionGeometry.xy.mul(0.22)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const d = TSL.uv().sub(0.5).mul(2), r2 = dot(d, d);
    m.colorNode = mix(tc(CO), vec3(1, 0.85, 0.75), exp(r2.mul(-60))).mul(exp(r2.mul(-9)).mul(0.25).add(exp(r2.mul(-40)).mul(0.5))).mul(g0.w).mul(uGain);
    m.fog = false;
    const gm = new THREE.Mesh(gGeo, m); gm.frustumCulled = false; gm.renderOrder = 5; object.add(gm);
  }

  // ================================================================================================== the earth: terraces with a fine grid, roots
  {
    const pts = [new THREE.Vector2(3.0, 0)];
    RINGS.forEach((R, i) => { const r0 = R.r - 0.28; if (i > 0) pts.push(new THREE.Vector2(r0, RINGS[i - 1].y), new THREE.Vector2(r0 + 0.02, R.y)); });
    pts.push(new THREE.Vector2(LAST.r + 0.5, LAST.y), new THREE.Vector2(LAST.r + 0.55, 3.0), new THREE.Vector2(30, 3.0));
    const geo = new THREE.LatheGeometry(pts, 192);
    // additive, no depth: the earth is only its grid of light — it never occludes (INT 14:10: an opaque dark earth hid the outgoing world
    // on the first arriving frames)
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pw = varying(TSL.positionLocal), rad = length(pw.xz);
    const warm = uniform(0); m.userData.warm = warm;
    // a polar grid of fine lines (rings and rays), fading with distance
    const ang = TSL.atan(pw.z, pw.x).mul(192 / (2 * Math.PI)), gr = rad.mul(4);
    const line = (x, wd) => float(1).sub(smoothstep(0, wd, abs(fract(x).sub(0.5)).mul(-1).add(0.5)));
    const grid = max(line(gr, 0.06), line(ang, 0.07).mul(smoothstep(3.2, 4.5, rad)));
    const pool = TSL.Fn(() => {
      const acc = float(0).toVar();
      TSL.Loop(NH, ({ i }) => { const q = uHA.element(i), c = uHC.element(i), dd = length(pw.xz.sub(q.xz)); acc.addAssign(exp(dd.mul(dd).mul(-1.4)).mul(q.w).mul(c.w)); });
      return acc;
    })();
    const fadeR = smoothstep(9.0, 5.0, rad);
    const base = tc(TQ).mul(grid.mul(0.05).add(0.006)).mul(uLight).mul(float(0.5).add(warm.mul(1.2))).mul(fadeR);
    m.colorNode = base.add(tc(CO).mul(pool).mul(grid.mul(0.5).add(0.08)).mul(0.5).mul(uGain)).mul(uArrive).mul(float(1).sub(uLeave));
    m.fog = false;
    const ground = new THREE.Mesh(geo, m); ground.frustumCulled = false; object.add(ground);
    object.userData.ground = m;
  }
  // roots: static fibres in each band group, foot to foot (neighbours in the ring and the next ring), sagging into the earth
  function staticRibbonMaterial(widthW, minNdc, colA, colB, k) {
    const pos = attribute('position', 'vec3'), tg = attribute('aT', 'vec3'), aF = attribute('aF', 'vec4');
    const t = aF.x, side = aF.y, rnd = aF.z;
    const u = clamp(uLeave.mul(1.6).sub(rnd.mul(0.5)), 0, 1), grow = clamp(uArrive.mul(1.6).sub(rnd.mul(0.5)), 0, 1);
    const p = pos.add(vec3(0, u.mul(u).mul(rnd.add(1)).mul(1.5), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), tv = modelViewMatrix.mul(vec4(tg, 0)).xyz;
    const rb = ribbon(pv, tv, float(widthW), side, minNdc);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = rb.pos;
    const vis = smoothstep(t.sub(0.05), t, grow).mul(float(1).sub(u));
    const vS = varying(side), vA = varying(vis.div(rb.k)), vT = varying(t), vR = varying(rnd);
    const flow = pow(sin(vT.mul(7).sub(uTime.mul(0.8)).add(vR.mul(30))).mul(0.5).add(0.5), 5);
    m.colorNode = mix(tc(colA), tc(colB), vR).mul(flow.mul(1.6).add(0.4)).mul(k).mul(float(1).sub(vS.mul(vS))).mul(vA).mul(uLight);
    m.fog = false;
    return m;
  }
  function ribbonGeo(curves) {   // curves: [{ pts: [[x,y,z]...], tg, rnd }]
    let nv = 0; for (const c of curves) nv += c.pts.length * 2;
    const F = 10, A = new Float32Array(nv * F), idx = []; let v = 0;
    for (const c of curves) {
      const n = c.pts.length;
      for (let j = 0; j < n; j++) for (let sd = 0; sd < 2; sd++) { A.set([...c.pts[j], ...c.tg[j], j / (n - 1), sd ? 1 : -1, c.rnd, c.flag || 0], (v + j * 2 + sd) * F); }
      for (let j = 0; j < n - 1; j++) { const a = v + j * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      v += n * 2;
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aT', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('aF', new THREE.InterleavedBufferAttribute(ib, 4, 6));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return g;
  }
  {
    const rootMat = staticRibbonMaterial(0.006, uMinFb, [0.75, 0.68, 0.6], TQ, 0.045);
    const r = rng(909);
    for (let b = 0; b < 2; b++) {
      const curves = [];
      const mine = crowd.filter((c) => c.band === b);
      for (const c of mine) {
        const x0 = Math.cos(c.a0) * c.r, z0 = Math.sin(c.a0) * c.r;
        const nb = mine.filter((d) => d !== c && Math.abs(d.ring - c.ring) <= 1).map((d) => [d, Math.hypot(Math.cos(d.a0) * d.r - x0, Math.sin(d.a0) * d.r - z0)]).sort((a, q) => a[1] - q[1]).slice(0, 3);
        for (const [d] of nb.slice(0, 2)) {
          const x1 = Math.cos(d.a0) * d.r, z1 = Math.sin(d.a0) * d.r, y0 = c.y + 0.01, y1 = d.y + 0.01;
          const ctl = [[x0, y0 + 0.05, z0], [x0 * 0.66 + x1 * 0.34 + (r() - 0.5) * 0.2, Math.max(y0, y1) + 0.02 + r() * 0.06, z0 * 0.66 + z1 * 0.34 + (r() - 0.5) * 0.2],
            [x0 * 0.34 + x1 * 0.66 + (r() - 0.5) * 0.2, Math.max(y0, y1) + 0.02 + r() * 0.06, z0 * 0.34 + z1 * 0.66 + (r() - 0.5) * 0.2], [x1, y1 + 0.05, z1]];
          const sc = sampleChain(ctl, 10); curves.push({ pts: sc.out, tg: sc.tg, rnd: r() });
        }
        if (c.ring === 0 && r() < 0.7) {          // a root reaching forward, towards the room
          const a = c.a0 + (r() - 0.5) * 0.08, rr0 = c.r - 0.9 - r() * 1.2;
          const ctl = [[x0, 0.04, z0], [Math.cos(a) * (c.r - 0.4), 0.02, Math.sin(a) * (c.r - 0.4)], [Math.cos(a) * rr0, 0.015, Math.sin(a) * rr0]];
          const sc = sampleChain(ctl, 10); curves.push({ pts: sc.out, tg: sc.tg, rnd: r() });
        }
      }
      const mesh = new THREE.Mesh(ribbonGeo(curves), rootMat); mesh.frustumCulled = false; mesh.renderOrder = 2; bandGroups[b].add(mesh);
    }
  }

  // ================================================================================================== grip fibres (bone, shoulder to shoulder)
  // How a pinya holds: arms over the shoulders and across the backs of the neighbours. Thick bone fibres #F0D9C4 tie each body of the
  // first row and of the first ring to the next; near a hand they thicken and turn coral (the colour travels from the palm as the grip
  // tightens); red knots at the shoulders; when the circle closes, a braid of light goes round the room on the ring's chain.
  {
    const pos = attribute('position', 'vec3'), tg = attribute('aT', 'vec3'), aF = attribute('aF', 'vec4');
    const t = aF.x, side = aF.y, rnd = aF.z, isRing = aF.w;
    const pw = modelWorldMatrix.mul(vec4(pos, 1)).xyz;
    const reach = TSL.Fn(() => {
      const acc = float(0).toVar();
      TSL.Loop(NH, ({ i }) => { const q = uHW.element(i), R = uHB.element(i).w.mul(2.4).add(0.55), d = length(pw.xz.sub(q.xz)); acc.addAssign(q.w.mul(exp(d.mul(d).div(R.mul(R)).negate()))); });
      return acc;
    })();
    const braid = isRing.mul(uClosed).mul(pow(sin(TSL.atan(pw.z, pw.x).mul(3).sub(uTime.mul(1.1))).mul(0.5).add(0.5), 6));
    const e = clamp(reach.add(braid), 0, 1.4);
    const u = clamp(uLeave.mul(1.6).sub(rnd.mul(0.5)), 0, 1), grow = clamp(uArrive.mul(1.6).sub(rnd.mul(0.5)), 0, 1);
    const sway = sin(uTime.mul(0.9).add(aF.w.mul(0).add(rnd.mul(20)))).mul(0.012).mul(float(1).sub(e.mul(0.6)));
    const sag = sin(t.mul(Math.PI)).mul(0.07).mul(float(1).sub(min(e, 1)));   // a rope hangs; held, it straightens
    const p = pos.add(vec3(0, sway.sub(sag).add(u.mul(u).mul(rnd.add(1)).mul(1.5)), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), tv = modelViewMatrix.mul(vec4(tg, 0)).xyz;
    const rb = ribbon(pv, tv, float(0.004).add(e.mul(0.002)), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = rb.pos;
    const vis = smoothstep(t.sub(0.05), t, grow).mul(float(1).sub(u));
    const vA = varying(vec4(side, t, e, vis.div(rb.k))), vNdc = varying(rb.pos.xy.div(rb.pos.w)), vR = varying(rnd);
    const knot = float(1).sub(smoothstep(0.0, 0.08, min(vA.y, float(1).sub(vA.y))));
    const flow = pow(sin(vA.y.mul(8).sub(uTime.mul(0.9)).add(vR.mul(30))).mul(0.5).add(0.5), 5);
    let col = tc(BONE).mul(flow.mul(0.022).add(0.018)).mul(uLight);
    col = col.add(mix(tc(BONE), tc(CO), smoothstep(0.15, 0.8, vA.z)).mul(vA.z).mul(1.8).mul(uGain));
    col = col.add(tc(RED).mul(knot).mul(vA.z.mul(1.2).add(0.12)));
    m.colorNode = col.mul(float(1).sub(vA.x.mul(vA.x))).mul(vA.w).mul(float(1).sub(calmOf(vNdc))).mul(float(1).sub(uDry.mul(0.5)));
    m.fog = false;
    const gripMat = m, rr2 = rng(5151);
    const shoulder = (c, toward, h) => { const x = Math.cos(c.a0) * c.r, z = Math.sin(c.a0) * c.r; return [x + toward[0] * 0.17, c.y + h * c.h, z + toward[2] * 0.17]; };
    const pairCurves = (A, B, ring) => {
      const ax = Math.cos(A.a0) * A.r, az = Math.sin(A.a0) * A.r, bx = Math.cos(B.a0) * B.r, bz = Math.sin(B.a0) * B.r;
      const L = Math.hypot(bx - ax, bz - az) || 1, dir = [(bx - ax) / L, 0, (bz - az) / L], out = [ax / A.r, 0, az / A.r];
      const list = [];
      const rope = (ctl, ns, n) => {   // a rope: ns strands twisted round the centre curve (radius 9 mm, 2.5 turns a metre)
        const c = sampleChain(ctl, n), rs = rr2();
        let len = 0; const L0 = [0]; for (let j = 1; j < n; j++) { len += Math.hypot(c.out[j][0] - c.out[j - 1][0], c.out[j][1] - c.out[j - 1][1], c.out[j][2] - c.out[j - 1][2]); L0.push(len); }
        for (let k = 0; k < ns; k++) {
          const pts = [], tg = [];
          for (let j = 0; j < n; j++) {
            const T = c.tg[j], up = Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
            let bx2 = T[1] * up[2] - T[2] * up[1], by2 = T[2] * up[0] - T[0] * up[2], bz2 = T[0] * up[1] - T[1] * up[0]; const bl = Math.hypot(bx2, by2, bz2) || 1; bx2 /= bl; by2 /= bl; bz2 /= bl;
            const nx = by2 * T[2] - bz2 * T[1], ny = bz2 * T[0] - bx2 * T[2], nz = bx2 * T[1] - by2 * T[0];
            const ang = (k / ns) * Math.PI * 2 + L0[j] * 2.5 * Math.PI * 2, rad = 0.009;
            pts.push([c.out[j][0] + (bx2 * Math.cos(ang) + nx * Math.sin(ang)) * rad, c.out[j][1] + (by2 * Math.cos(ang) + ny * Math.sin(ang)) * rad, c.out[j][2] + (bz2 * Math.cos(ang) + nz * Math.sin(ang)) * rad]);
            tg.push(T);
          }
          list.push({ pts, tg, rnd: rs, flag: ring });
        }
      };
      const a = shoulder(A, dir, 1.43), b = shoulder(B, [-dir[0], 0, -dir[2]], 1.43);
      rope([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], 6, 14);                       // shoulder to shoulder
      const a2 = shoulder(A, dir, 1.38), back = [bx + out[0] * 0.17, B.y + 1.18 * B.h, bz + out[2] * 0.17], far = shoulder(B, dir, 1.4);
      rope([a2, [(a2[0] + back[0]) / 2 + out[0] * 0.08, (a2[1] + back[1]) / 2, (a2[2] + back[2]) / 2 + out[2] * 0.08], back, far], 5, 16);   // the arm across the back
      return list;
    };
    // the first row, wall by wall (in its own counter-turned group) · the first ring, closed round the room (it turns with its band)
    const fr = [];
    for (let wi = 0; wi < room.walls.length; wi++) { const row = crowd.filter((c) => c.front === wi).sort((a, b) => a.fx - b.fx); for (let k = 0; k + 1 < row.length; k++) fr.push(...pairCurves(row[k], row[k + 1], 0)); }
    const ring1 = crowd.filter((c) => c.ring === 1).sort((a, b) => a.a0 - b.a0), rc = [];
    for (let k = 0; k < ring1.length; k++) rc.push(...pairCurves(ring1[k], ring1[(k + 1) % ring1.length], 1));
    for (const [list, g] of [[fr, bandGroups[2]], [rc, bandGroups[0]]]) { const mesh = new THREE.Mesh(ribbonGeo(list), gripMat); mesh.frustumCulled = false; mesh.renderOrder = 3; g.add(mesh); }
  }

  // ================================================================================================== far: clouds of points and threads
  const far = new THREE.Group(); object.add(far);
  function pointCloud(n, seed, gen, size, bright) {   // gen(r, out) fills out = [x, y, z, coral]
    const r = rng(seed), F = 8, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), C = [[-1, -1], [1, -1], [1, 1], [-1, 1]], q4 = [0, 0, 0, 0];
    for (let k = 0; k < n; k++) {
      gen(r, q4); const rnd = r();
      for (let q = 0; q < 4; q++) A.set([q4[0], q4[1], q4[2], C[q][0], C[q][1], rnd, q4[3], 0], (k * 4 + q) * F);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const pos = attribute('position', 'vec3'), co = attribute('aC', 'vec4');
    const drift = vec3(sin(uTime.mul(0.11).add(co.z.mul(40))), cos(uTime.mul(0.09).add(co.z.mul(23))), sin(uTime.mul(0.07).add(co.z.mul(71)))).mul(size * 6);
    const p = pos.add(drift).add(vec3(0, uLeave.mul(uLeave).mul(co.z.add(0.5)).mul(8), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), c0 = clipOf(pv);
    const d = ndcScale(pv, c0, float(size).add(co.z.mul(size))), k = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w);
    const vC = varying(co), vK = varying(float(1).div(k.mul(k)));
    const r2 = dot(vC.xy, vC.xy), twk = pow(sin(uTime.mul(vC.z.add(0.3)).add(vC.z.mul(90))).mul(0.5).add(0.5), 16);
    m.colorNode = mix(tc(TQ), tc(CO), vC.w).mul(float(1).sub(smoothstep(0.3, 1.0, r2))).mul(twk.mul(2).add(0.35)).mul(bright).mul(vK.mul(0.7).add(0.3))
      .mul(uArrive).mul(float(1).sub(uLeave)).mul(uLight);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1;
    return mesh;
  }
  { // far (28–45 m): drifting clouds, faint (30 % contrast), teal-turquoise with a few coral threads
    const r0 = rng(1313), clumps = []; for (let i = 0; i < 22; i++) clumps.push({ a: r0() * Math.PI * 2, rad: 28 + r0() * 17, y: -2 + r0() * 16, len: 6 + r0() * 12, tw: 0.6 + r0() * 2.2, ph: r0() * 6, coral: r0() < 0.25 });
    let k = 0;
    far.add(pointCloud(30000, 1314, (r, o) => {
      const c = clumps[k++ % clumps.length], s = r() - 0.5, sp = 0.6 + r() * 1.6 * (1 - Math.abs(s));
      const tw = c.ph + s * c.tw * 3, a = c.a + (s * c.len) / c.rad, g = () => (r() + r() + r() - 1.5) * sp;
      const rad = c.rad + Math.cos(tw) * 2 + g();
      o[0] = Math.cos(a) * rad; o[1] = c.y + s * c.len * 0.35 + Math.sin(tw) * 2 + g(); o[2] = Math.sin(a) * rad; o[3] = (c.coral ? 0.5 : 0.06) > r() ? 1 : 0;
    }, 0.05, 0.1));
  }
  // the ONE big form of the sky (ref. 10): a galaxy ARM of points that circles the whole room (every wall sees it), 14–19 m out,
  // 6–10 m high, five strands twisting round it, turning with the room at 3°/s; dim (never brighter than a hand's knot)
  const torus = new THREE.Group(); object.add(torus);
  torus.add(pointCloud(70000, 4040, (r, o) => {
    const th = r() * Math.PI * 2, strand = Math.floor(r() * 5), ph = (strand * 2 * Math.PI) / 5 + 7 * th, rm = 1.0 + 0.45 * Math.sin(2 * th + strand);
    const jit = r() < 0.3 ? 0.55 : 0.1, g = () => (r() + r() + r() - 1.5) * jit, Rr = 16 + 2.2 * Math.sin(2 * th + 0.7), yc = 7.8 + 1.4 * Math.sin(3 * th + 1.1);
    o[0] = Math.cos(th) * (Rr + Math.cos(ph) * rm) + g(); o[1] = yc + Math.sin(ph) * rm + g(); o[2] = Math.sin(th) * (Rr + Math.cos(ph) * rm) + g(); o[3] = strand % 3 === 0 ? 1 : 0;
  }, 0.03, 0.028));   // T-053 (ARTE r5): the galaxy arm at 70 % (the people are the hero)

  // ================================================================================================== the data cubes (physical)
  const NNEAR_W = 0;   // art 14:30: no floating floor tiles any more; the mass is the pieces a touch shakes out of the bodies   // art bible §4: few near pieces (≤ 8 a wall, 8–30 cm); the wire cubes only in an ordered grid far behind
  const cubes = [];
  // T-053 (ARTE r5): no coloured blocks on the floor by the hand — the pieces a grip shook out of the bodies are off (the fibres, the
  // lean, the flash and the lift still answer at once). true brings them back.
  const CUBES_ON = false;
  {
    const r = rng(2024);
    walls.forEach((w, wi) => {
      for (let k = 0; k < NNEAR_W; k++) {
        // half of them round the hand target (so the hand that holds the circle knocks them), the rest along the wall
        const nearBtn = k < 4, side = k % 2 ? 1 : -1;
        const u = nearBtn ? 0.5 + side * (0.97 + r() * 0.35) / w.width : 0.5 + side * (0.22 + r() * 0.24), v = nearBtn ? 0.85 + r() * 0.85 : 0.45 + r() * 1.25;   // beside the quiet zones (biblia §4), within a hand's reach
        const depth = 0.2 + r() * 0.75, home = room.wallPoint(wi, u, 0).clone(); home.y = v; home.addScaledVector(w.normal, -depth);
        cubes.push({ near: true, home, size: 0.08 + Math.pow(r(), 2.2) * 0.22, kind: 1, col: r(), wn: w.normal.clone(), wc: w.centre.clone() });
      }
    });
    for (let ci = 0; ci < 0; ci++) for (let row = 0; row < 3; row++) {   // (art 14:30: the far wire cubes are gone)
      const a = (ci / 48) * Math.PI * 2, rad = 17;
      cubes.push({ near: false, home: new THREE.Vector3(Math.cos(a) * rad, 3.6 + row * 1.7, Math.sin(a) * rad), size: 0.55, kind: 0, col: r(), fixed: true });
    }
    // LOOSE pieces (QA 14:20: touching must give MASS): chrome and glazed plates of 15–40 cm that a touch shakes loose from the
    // bodies it hooks — they fly out towards the room, fall, bounce on the ground and the terraces, tumble and roll, rest, and melt back
    for (let k = 0; k < 96; k++) cubes.push({ near: false, loose: true, home: new THREE.Vector3(0, -50, 0), size: 0.15 + Math.pow(r(), 1.6) * 0.25, kind: 1, col: r(), wn: new THREE.Vector3(), wc: new THREE.Vector3() });
    for (const c of cubes) {
      Object.assign(c, { pos: c.home.clone(), vel: new THREE.Vector3(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), w: new THREE.Vector3((r() - 0.5) * 0.4, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4),
        state: 0, t: 0, ph: r() * 6, seed: r(), back: 0, delay: 0 });   // state 0 floating · 1 falling · 2 resting · 3 returning
      c.q0 = c.q.clone(); c.from = new THREE.Vector3(); c.qFrom = new THREE.Quaternion();
    }
  }
  const nWire = cubes.filter((c) => c.kind === 0).length, nTile = cubes.length - nWire;
  const cubeSpace = bandGroups[2];   // the cubes live by the walls, with the first row (they do not turn with the rotllana)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), tileGeo = (() => {   // a broken plate: irregular, 12 % thick, a bevel that catches the light
    const rq = rng(808), n = 5, sh = new THREE.Shape();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (rq() - 0.5) * 0.8, rad = 0.42 + rq() * 0.14; const x = Math.cos(a) * rad, y = Math.sin(a) * rad; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }); g.translate(0, 0, -0.04); g.computeVertexNormals(); return g;
  })();
  const edge = (wd) => { const e = min(min(TSL.uv().x, float(1).sub(TSL.uv().x)), min(TSL.uv().y, float(1).sub(TSL.uv().y))); return float(1).sub(smoothstep(wd, wd.add(0.01), e)); };
  const wireMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  wireMat.colorNode = vec3(1.0); wireMat.opacityNode = edge(float(0.05)); wireMat.alphaTest = 0.5; wireMat.fog = false;
  // the tiles: glazed chrome with a thin iridescent film when the room has an environment (T-028), else flat glaze
  let tileMat;
  if (room.envMap) {
    tileMat = new THREE.MeshPhysicalNodeMaterial({ metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMap: room.envMap, envMapIntensity: 1.4 });   // glazed, saturated (no pastel film)
    tileMat.emissiveNode = vec3(0.16, 0.18, 0.18).mul(pow(float(1).sub(abs(TSL.normalView.z)), 3)).add(vec3(0.01, 0.025, 0.028));   // the bevel catches the light
  } else {
    tileMat = new THREE.MeshBasicNodeMaterial();
    const nv = TSL.normalView, e = pow(float(1).sub(abs(nv.z)), 3); tileMat.colorNode = vec3(mix(float(0.32), float(0.9), abs(nv.z)).add(e.mul(0.8)));
  }
  tileMat.fog = false;
  const wireMesh = new THREE.InstancedMesh(boxGeo, wireMat, nWire), tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, nTile);
  const dotMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicNodeMaterial(), nWire);
  for (const im of [wireMesh, tileMesh, dotMesh]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cubeSpace.add(im); }
  { let a = 0, b = 0; for (const c of cubes) { c.mesh = c.kind ? tileMesh : wireMesh; c.i = c.kind ? b++ : a++; } }
  const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const PAL = [TQ, CO, [0.85, 0.92, 0.95], [0.1, 0.3, 0.85]];
  for (const c of cubes) {
    const p = c.loose ? (c.col < 0.55 ? TQ : c.col < 0.85 ? CO : RED) : c.near ? (c.col < 0.45 ? TQ : c.col < 0.75 ? [0.95, 0.95, 0.97] : c.col < 0.93 ? CO : RED) : (c.col < 0.7 ? TEAL.map((x) => x * 3) : TQ);
    c.rgb = p; c.mesh.setColorAt(c.i, tmpC.setRGB(p[0], p[1], p[2]));
    if (c.kind === 0) { const d = c.col < 0.5 ? CO : BONE; dotMesh.setColorAt(c.i, tmpC.setRGB(d[0] * 0.6, d[1] * 0.6, d[2] * 0.6)); }
  }
  const impacts = [];   // [{ wall, u, force }] this frame (sound, ola 2: 'fx:impact')
  function knock(c, nrm, f) {
    if (c.state === 1) return;
    c.state = 1; c.t = 0; c.delay = 0;
    const r = (Math.sin(c.seed * 999 + c.ph * 37) + 1) / 2;
    c.vel.copy(nrm).multiplyScalar(-(0.5 + r * 1.1) * f).add(tmpV.set((c.seed - 0.5) * 1.2, 0.6 + r * 1.4, (r - 0.5) * 1.2).multiplyScalar(f));
    c.w.set((c.seed - 0.5) * 14, (r - 0.5) * 12, (c.ph / 6 - 0.5) * 14).multiplyScalar(f);
  }
  const GRAV = 7.8;
  let nextLoose = 0;
  const loose = () => { const L = cubes.filter((c) => c.loose); return L; };
  const LOOSE = loose();
  function shake(body, wall, f) {   // one piece out of a body (cube space = world-aligned, with the first row)
    for (let n = 0; n < LOOSE.length; n++) {
      const c = LOOSE[(nextLoose + n) % LOOSE.length]; if (c.state !== 0) continue;
      nextLoose = (nextLoose + n + 1) % LOOSE.length;
      const w = walls[wall], a = objA(body) - theta, R2 = Math.sin(c.seed * 999 + time0 * 7.1) * 0.5 + 0.5;
      c.wn.copy(w.normal); c.wc.copy(w.centre);
      c.pos.set(Math.cos(a) * body.r, body.y + (1.05 + R2 * 0.6) * body.h, Math.sin(a) * body.r).addScaledVector(w.normal, 0.3);
      c.vel.copy(w.normal).multiplyScalar((1.0 + R2 * 1.8) * f).add(tmpV.copy(w.right).multiplyScalar((c.seed - 0.5) * 1.6 * f)); c.vel.y = (0.9 + (1 - R2) * 1.6) * f;
      c.w.set((c.seed - 0.5) * 12, (R2 - 0.5) * 10, (c.ph / 6 - 0.5) * 12);
      c.state = 1; c.t = 0;
      return c;
    }
    return null;
  }
  let time0 = 0;
  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }
  function fxAt(p, strength, mat, kind) {
    const W = room.walls, e = room.eye, dx = p.x - e.x, dz = p.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
  }
  const fxW = new THREE.Vector3(), wu = [0, 0.5];
  const wallU = (c) => { fxW.copy(c.pos).applyMatrix4(cubeSpace.matrixWorld); const W = room.walls, e = room.eye, dx = fxW.x - e.x, dz = fxW.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    wu[0] = wi; wu[1] = 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width; return wu; };
  const planeDist = (p, h, n) => { const dx = p.x - h.x, dy = p.y - h.y, dz = p.z - h.z, dn = dx * n.x + dy * n.y + dz * n.z; return Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - dn * dn)); };

  // ================================================================================================== state
  const fills = new Float32Array(NW), pulseT = new Float32Array(NW).fill(-99), prevFill = new Float32Array(NW), shower = new Float32Array(NW).fill(-99);
  const rot = new Float32Array(3);
  const objA = (c) => c.a0 - (c.band < 2 ? rot[c.band] : -theta);   // a body's angle in the part's space (world = objA − theta)
  let cascadeT = -1, closeT = -99, closedS = 0, prevClosed = 0, dryS = 0, theta = 0, thetaV = 0, rise = 0;
  const NR = RINGS.length + 1;
  const inv = new THREE.Matrix4(), invF = new THREE.Matrix4(), hf = new THREE.Vector3(), hl = new THREE.Vector3(), hn = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  function update(dt, input) {
    dt = Math.min(0.1, dt || 0.016);
    if (jobs.length) {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) { const r = jobs[0].gen.next(); if (r.done) { jobs[0].done(r.value); jobs.shift(); } }
      if (!jobs.length) readyMs = Math.round(performance.now() - tCreate);
    }
    const prm = input.params || P, time = input.time ?? 0, st = input.state;
    const st0 = !!(st && st.fill);
    uTime.value = time;
    uGain.value = prm.glow ?? 1; uLight.value = prm.light ?? 1; uBreath.value = prm.breath ?? 1;
    const dn = clamp01(prm.density ?? 1) * 0.7 + 0.3;
    if (Math.abs(dn - density) > 0.01) { density = dn; for (const M of meshes) M.mesh.geometry.setDrawRange(0, Math.round(M.n * density) * 6); }
    const leave = input.leave ?? (prm.leave ?? 0), arrive = input.arrive ?? (prm.arrive ?? 1);
    uLeave.value = clamp01(leave); uArrive.value = clamp01(arrive);
    const fly = uLeave.value > 0 || uArrive.value < 1;
    if (fly !== flying) { flying = fly; for (const M of meshes) { M.mesh.frustumCulled = !fly; M.fmesh.frustumCulled = !fly; } }
    let closed, dryT, block = 'pinya';
    if (st && st.fill) {
      block = st.block;
      for (let i = 0; i < NW; i++) fills[i] = st.fill[i] ?? 0;
      closed = st.closed ?? 0;
      const after = ['tronc', 'pom', 'crown', 'festa', 'baixada', 'fall', 'acta'].includes(st.block);
      dryT = after ? 1 : st.block === 'pinya' && st.phase === 'reward' ? clamp01((st.tp ?? 0) / 6) : 0;
      if (st.block === 'pinya' && st.phase === 'reward') closed = 1;
      for (const e of input.events || []) {
        if (e.startsWith('wall:')) { const w = +e.slice(5) % NW; pulseT[w] = time; shower[w] = time; }
        else if (e === 'close') { closeT = time; cascadeT = time; }
      }
    } else {
      const f = clamp01(prm.fill ?? 0);
      for (let i = 0; i < NW; i++) fills[i] = f;
      closed = clamp01(prm.closed ?? 0); dryT = clamp01(prm.dry ?? 0);
      for (let i = 0; i < NW; i++) { if (prevFill[i] < 1 && fills[i] >= 1) { pulseT[i] = time; shower[i] = time; } prevFill[i] = fills[i]; }
      if (prevClosed < 1 && closed >= 1) { closeT = time; cascadeT = time; } prevClosed = closed;
    }
    dryS += (dryT - dryS) * Math.min(1, dt * 1.5); uDry.value = dryS;
    closedS += (closed - closedS) * Math.min(1, dt * 1.2); uClosed.value = closedS * (1 - dryS);

    // ---- room movement: the crowd rises with the fill; the whole pinya turns with the rotllana (≤ 3°/s, eased)
    const mv = prm.move ?? 1;
    let fm = 0; for (let i = 0; i < NW; i++) fm += fills[i]; fm /= NW;
    const riseT = mv * 0.3 * Math.min(1, fm * 1.15) * (1 - dryS * 0.5);
    rise += Math.max(-0.05 * dt, Math.min(0.05 * dt, (riseT - rise) * Math.min(1, dt * 0.8)));
    const wT = mv * 0.052 * clamp01((closedS - 0.4) / 0.5) * (1 - dryS);
    thetaV += (wT - thetaV) * Math.min(1, dt * 0.35); theta += thetaV * dt;
    object.position.y = rise; object.rotation.y = theta;
    far.rotation.y = -theta * 0.6 - time * 0.004; far.position.y = -rise * 0.7;
    const spin = 0.03 * clamp01((closedS - 0.5) * 2) * (1 - dryS);
    for (let b = 0; b < 2; b++) { rot[b] += dt * spin * (b ? -1 : 1); bandGroups[b].rotation.y = rot[b]; }
    uStep.value = spin > 0 ? time * 2.2 : 0;
    bandGroups[2].rotation.y = -theta;
    object.updateMatrixWorld(); inv.copy(object.matrixWorld).invert(); invF.copy(cubeSpace.matrixWorld).invert();
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    torus.children[0].rotation.y += dt * 0.052;
    const hands = input.hands || [];
    const useFib = prm.fibres !== false && prm.press !== false;

    // ---- hands → slots (object space)
    for (const s of slots) s.on = false;
    for (const h of hands) {
      let s = slots.find((q) => q.stroke === h.stroke);
      if (!s) {
        s = slots.find((q) => q.stroke === null && q.pres < 0.02) || slots.find((q) => q.stroke === null) || null;
        if (!s) continue;
        s.stroke = h.stroke; s.t0 = time; s.grow = 0.08; s.taut = 0; s.hooks.length = 0; s.pres = 1; s.pos.copy(h.pos).applyMatrix4(inv); s.aw = Math.atan2(h.pos.z, h.pos.x);
        // the bodies it hooks: the nearest in the first rings
        const list = [];
        for (const c of crowd) { if (c.ring > 1) continue; let d = (objA(c) - theta) - s.aw; d = Math.atan2(Math.sin(d), Math.cos(d)); const lat = Math.abs(d) * c.r + c.ring * 0.9; list.push([lat, c]); }
        list.sort((a, b) => a[0] - b[0]); for (let i = 0; i < 5; i++) s.hooks.push(list[i][1]);
        // the touch shakes the bodies: they lurch towards the hand, and pieces of them fly out and fall (mass, at once)
        for (const c of s.hooks) c.lv += 1.6;
        if (CUBES_ON && prm.cubes !== false) for (let i = 0; i < 6; i++) shake(s.hooks[i % s.hooks.length], h.wall, 1);
        s.shakeT = time;
        // cubes near the hand fall at once
        hf.copy(h.pos).applyMatrix4(invF); hn.copy(h.normal).transformDirection(invF);
        for (const c of cubes) if (c.near && c.state !== 1 && planeDist(c.pos, hf, hn) < 1.15) knock(c, hn, 1);
      }
      s.on = true; s.held = 0.35; s.wall = h.wall; s.world.copy(h.pos);
      if (time - s.shakeT > 1.3 && s.hooks.length && prm.cubes !== false) { s.shakeT = time; if (CUBES_ON) for (let i = 0; i < 2; i++) shake(s.hooks[(i + Math.floor(time)) % s.hooks.length], h.wall, 0.75); for (const c of s.hooks) c.lv += 0.5 * Math.sin(time * 3.1 + c.seed * 9); }   // held: the grip keeps pulling, the bodies stagger, a piece falls now and then
      hl.copy(h.pos).applyMatrix4(inv); s.pos.lerp(hl, Math.min(1, dt * 10)); s.nrm.copy(h.normal).transformDirection(inv); s.aw = Math.atan2(h.pos.z, h.pos.x);
      hf.copy(h.pos).applyMatrix4(invF); hn.copy(h.normal).transformDirection(invF);
      for (const c of cubes) if (c.near && c.state === 0 && planeDist(c.pos, hf, hn) < 0.45) knock(c, hn, 0.7);    // a moving hand sweeps
    }
    const ga = gA.array;
    slots.forEach((s, i) => {
      if (s.stroke !== null && !s.on) { s.held -= dt; if (s.held <= 0) { s.stroke = null; for (const c of s.hooks) if (c.hook > 0.35 && !c.sand) c.sand = 0.001; } }
      const on = s.stroke !== null && useFib;
      s.grow = on ? Math.min(1, s.grow + dt / 0.8) : Math.max(0, s.grow - dt / 1.4);
      s.taut = on && s.grow > 0.7 ? Math.min(1, s.taut + dt / 2.4) : Math.max(0, s.taut - dt * 1.5);
      s.pres = s.stroke !== null ? 1 : Math.max(0, s.pres - dt / 1.4);
      if (s.hooks.length) {
        s.root.set(0, 0, 0); for (const c of s.hooks) { const a = objA(c); s.root.x += Math.cos(a) * (c.r - 0.2); s.root.z += Math.sin(a) * (c.r - 0.2); s.root.y += c.y + c.lift; }
        s.root.multiplyScalar(1 / s.hooks.length);
      }
      for (let k = 0; k < 5; k++) {
        const c = s.hooks[k]; if (!c) { HK[i * 5 + k].set(s.pos.x, -50, s.pos.z, 0); continue; }
        const a = objA(c), ca = Math.cos(a), sa = Math.sin(a), ch = 1.25 * c.h, fwd = c.lean * 0.24 * ch;
        HK[i * 5 + k].set(ca * (c.r - fwd - 0.1), c.y + c.lift + ch, sa * (c.r - fwd - 0.1), c.y);
      }
      HW[i].set(s.world.x, s.world.y, s.world.z, useFib ? s.grow * s.pres : 0);
      HA[i].set(s.pos.x, s.pos.y, s.pos.z, s.grow); HB[i].set(s.root.x, s.root.y, s.root.z, s.taut); HC[i].set(s.nrm.x, s.nrm.y, s.nrm.z, useFib ? s.pres : 0);
      const flash = s.stroke !== null ? Math.min(1, s.pres) * (0.6 + 0.4 * s.taut) : s.pres * 0.5;
      ga[i * 4] = s.pos.x + s.nrm.x * -0.01; ga[i * 4 + 1] = s.pos.y; ga[i * 4 + 2] = s.pos.z + s.nrm.z * -0.01; ga[i * 4 + 3] = flash * (1 - uLeave.value);
    });
    gA.needsUpdate = true;

    // ---- T-044 · PALM → FOLLOW → PACK (score: state.span[w] / events 'palm', 'pack:w' when ENT's step 0 lands; until then a stand-in)
    stepPalms(dt, time, hands, prm, st, input.events);
    // ---- the crowd, per body (world angle = band-local angle − band rotation − world turn)
    const kUpG = 1 - Math.exp(-dt * 28), kDnG = 1 - Math.exp(-dt * 1.4), kW = 1 - Math.exp(-dt * 1.1);
    const a0w = Math.atan2(walls[0].centre.z, walls[0].centre.x);
    for (const c of crowd) c.hook = 0;
    for (const s of slots) { if (!useFib) break; for (let k = 0; k < s.hooks.length; k++) { const c = s.hooks[k]; c.hook = Math.max(c.hook, s.taut * (k < 3 ? 1 : 0.6) + s.grow * 0.25); } }
    let warmSum = 0;
    for (const M of meshes) {
      const A = M.buf.array;
      for (const c of M.list) {
        const a = objA(c) - theta, x = Math.cos(a) * c.r, z = Math.sin(a) * c.r;
        wallOf(x, z, c);
        const f = fills[c.wall];
        const order = 0.6 * (c.ring / (NR - 1)) + 0.3 * Math.abs(c.u - 0.5) * 2 + 0.1 * c.seed;
        const alive = clamp01((f * 1.12 - order + 0.04) / 0.12) * clamp01(f * 20);
        let wave = 0;   // the squeeze runs through the crowd from each hand at 0.8 m/s
        for (const s of slots) { if (s.stroke === null) continue; const tt = time - s.t0; if (tt > 7) continue; let d = a - s.aw; d = Math.atan2(Math.sin(d), Math.cos(d)); const q = Math.abs(d) * c.r - 0.8 * tt; wave += Math.exp(-(q * q) / 0.06) * Math.exp(-tt * 0.35); }
        let infl = 0;
        for (const h of hands) {
          let d = a - Math.atan2(h.pos.z, h.pos.x); d = Math.atan2(Math.sin(d), Math.cos(d));
          const lat = d * c.r; infl += Math.exp(-(lat * lat) / 0.5) * Math.exp(-c.ring * 0.7);
        }
        infl = Math.min(1, infl);
        const tp = time - pulseT[c.wall] - c.ring * 0.22, pulse = tp > 0 ? Math.exp(-tp * 2.2) * Math.min(1, tp * 12) * 1.2 : 0;
        let ca = a - a0w; ca = Math.abs(Math.atan2(Math.sin(ca), Math.cos(ca))) / Math.PI;
        const tcw = time - closeT - ca * 2.2, cw = tcw > 0 ? Math.exp(-tcw * 1.8) * Math.min(1, tcw * 10) : 0;
        const rlT = clamp01(closedS * 1.4 - ca * 0.4);
        c.wake += (Math.max(alive, infl * 0.9, rlT, c.hook) - c.wake) * kW;
        const band = 0.5 + 0.5 * Math.sin(a - time * 0.55 + c.ring * 0.35);
        const em = 0.5 + 0.5 * Math.sin(time * (0.12 + c.seed * 0.18) + c.seed * 40), ember = em * em * em * em * em * em;
        const b8 = band * band * band * band, b16 = b8 * b8;
        const gT = alive * (0.02 + 0.16 * ember) * (1 - rlT * 0.5) + infl * 0.8 + c.hook * 0.9 + pulse + cw + rlT * b16 * 0.9 + wave * 0.7;
        c.glow += (gT - c.glow) * (gT > c.glow ? kUpG : kDnG);
        // lean: a damped spring towards its target (the whole weight when hooked by a hand's fibres); let go → it sways back
        const lT = Math.min(0.45, infl * 0.12 + c.hook * 0.4 + wave * 0.25) + swayAmp * Math.sin(time * 0.85 + a * 2 + c.ring * 0.4);   // + the sway of a packed pinya
        c.lv += ((lT - c.lean) * 16 - c.lv * 3.2) * dt; c.lean += c.lv * dt;
        c.lift += ((c.hook * 0.06 + (c.baix >= 0 ? Math.max(baixK, st0 ? 0 : packK[c.baix]) * 0.45 : 0)) - c.lift) * Math.min(1, dt * (c.baix >= 0 ? 0.9 : 3));   // the baixos climb onto the pinya
        c.rl += (rlT - c.rl) * kW;
        // the calm: a walls-without-hands crowd is not black — the first row at ~60 %, full turquoise, and a breath that goes round
        // the whole room in 12 s (the crowd breathes together, from wall to wall)
        const bw = 0.5 + 0.5 * Math.cos(a - time * (Math.PI * 2 / 12)), bw4 = bw * bw * bw * bw;
        c.lit = (c.ring === 0 ? 1 : c.ring === 1 ? 0.6 : c.ring === 2 ? 0.35 : 0.18) * (0.6 + 0.4 * bw4) * (0.55 + 0.45 * Math.max(c.wake, 0.3)) * (1 - dryS * 0.6);
        // behind every palm the first rows light up; between visitors far apart, dark holes; packed, the lights merge
        if (c.ring <= 1 && wallHands[c.wall] > 0) {
          const bx = (c.u - 0.5) * walls[c.wall].width; let near = 0;
          for (const q of palms) if (q.on && q.stroke !== null && q.wall === c.wall) { const d = bx - q.x; near = Math.max(near, Math.exp(-(d * d) / 0.3) * (0.4 + 0.6 * q.contact)); }
          c.lit *= 0.25 + 0.75 * Math.max(near, assistK); c.glow += near * packK[c.wall] * 0.25 * dt * 10;
        }
        warmSum += c.glow;
        const s = c.slot * 16;
        const cm = Math.exp(-(((c.u - 0.5) / 0.16) ** 2)) * (c.ring ? 1 : 0.5);   // heads lower behind the guide's words
        if (c.sand > 0) { c.sand += dt / 3.2; if (c.sand >= 1) c.sand = 0; }
        A[s + 1] = c.y + c.lift; A[s + 3] = c.h * (1 - 0.1 * cm); A[s + 14] = c.sand;
        A[s + 4] = c.wake * (1 - c.rl); A[s + 5] = c.glow; A[s + 6] = c.lean; A[s + 7] = c.rl;
        A[s + 9] = c.phase * (1 - closedS * 0.8); A[s + 10] = c.lit; A[s + 12] = c.turn * (1 - c.rl * 0.8);
      }
      M.buf.needsUpdate = true;
    }
    object.userData.ground.userData.warm.value = (warmSum / crowd.length) * 0.6;

    // ---- the cubes: float, fall, bounce, rest, return
    impacts.length = 0;
    const useCubes = CUBES_ON && prm.cubes !== false;
    for (let w = 0; w < NW; w++) {   // a wall that fills: its cubes rain down, staggered along the wall
      const ts = time - shower[w];
      if (ts >= 0 && ts < 2.2 && useCubes) for (const c of cubes) if (c.near && c.state === 0 && c.wallI === w && ts > c.seed * 2) knock(c, hn.copy(walls[w].normal).transformDirection(invF), 0.6);
    }
    time0 = time;
    if (useCubes && cascadeT >= 0 && time - cascadeT < 2.5) {   // the circle closes: a cascade of pieces round the whole room
      const k0 = Math.floor((time - cascadeT - dt) / 2.5 * frontRow.length), k1 = Math.floor((time - cascadeT) / 2.5 * frontRow.length);
      for (let k = Math.max(0, k0 + 1); k <= Math.min(frontRow.length - 1, k1); k++) if (k % 2 === 0) shake(frontRow[k], frontRow[k].front, 0.8);
    }
    for (let w = 0; w < NW; w++) { const ts = time - shower[w]; if (useCubes && ts >= 0 && ts < dt * 1.5) { const row = frontRow.filter((c) => c.front === w); for (let k = 0; k < 6 && row.length; k++) shake(row[Math.floor((k + 0.5) / 6 * row.length)], w, 0.9); } }
    const lv = uLeave.value, av = uArrive.value;
    for (const c of cubes) {
      c.t += dt;
      if (c.state === 0 && c.loose) { /* hidden until shaken loose */ }
      else if (c.state === 0) {
        const b = Math.sin(time * 0.5 + c.ph) * 0.05;
        c.pos.set(c.home.x, c.home.y + b, c.home.z);
        tmpQ.setFromAxisAngle(tmpV.copy(c.w).normalize(), dt * 0.4); c.q.multiply(tmpQ);
      } else if (c.state === 1 || c.state === 2) {
        c.vel.y -= GRAV * dt;
        c.pos.addScaledVector(c.vel, dt);
        const r0 = Math.hypot(c.pos.x, c.pos.z), hs = c.size * 0.5, gy = groundY(r0);
        // the riser of a terrace: bounce back towards the room
        if (c.pos.y - hs < gy - 0.02 && gy > 0) {
          const prevR = Math.hypot(c.pos.x - c.vel.x * dt, c.pos.z - c.vel.z * dt);
          if (groundY(prevR) < gy - 0.01) { const nx = c.pos.x / r0, nz = c.pos.z / r0, vr = c.vel.x * nx + c.vel.z * nz; c.pos.x -= c.vel.x * dt; c.pos.z -= c.vel.z * dt; c.vel.x -= 1.5 * vr * nx; c.vel.z -= 1.5 * vr * nz; }
        }
        { // the first row stands 1.25 m behind the wall: a cube does not go into the bodies, it bounces off their legs
          const n = c.wn, depth = -((c.pos.x - c.wc.x) * n.x + (c.pos.z - c.wc.z) * n.z), lim = 1.18 - hs;
          if (depth > lim && c.pos.y < 1.9) { const vn = -(c.vel.x * n.x + c.vel.z * n.z); c.pos.x += n.x * (depth - lim); c.pos.z += n.z * (depth - lim); if (vn > 0) { c.vel.x += 1.35 * vn * n.x; c.vel.z += 1.35 * vn * n.z; c.w.y += vn * 3; } }
          if (depth < 0.02) { c.pos.x -= n.x * (0.02 - depth); c.pos.z -= n.z * (0.02 - depth); const vn = c.vel.x * n.x + c.vel.z * n.z; if (vn > 0) { c.vel.x -= 1.4 * vn * n.x; c.vel.z -= 1.4 * vn * n.z; } }   // nor out through the wall
        }
        const g2 = groundY(Math.hypot(c.pos.x, c.pos.z));
        if (c.pos.y - hs < g2) {
          c.pos.y = g2 + hs;
          if (c.vel.y < -0.35) {
            const force = -c.vel.y;
            if (force > 1.2 && impacts.length < 16) { impacts.push({ cube: c, force }); wallU(c); fxImpact(wu[0], wu[1], Math.min(1, (force - 1.2) / 4), c.kind ? 'ceramic' : 'wire', 'floor'); }
            c.vel.y = -c.vel.y * 0.42; c.vel.x *= 0.72; c.vel.z *= 0.72; c.w.multiplyScalar(0.62);
            c.w.x += (c.seed - 0.5) * force * 2; c.w.z += (c.ph / 6 - 0.5) * force * 2;
          } else {
            c.vel.y = 0; const fr = c.loose ? 1.6 : 5; c.vel.x *= Math.max(0, 1 - dt * fr); c.vel.z *= Math.max(0, 1 - dt * fr);
            if (c.loose) c.w.set(c.vel.z, 0, -c.vel.x).multiplyScalar(1 / (c.size * 0.45)); else c.w.multiplyScalar(Math.max(0, 1 - dt * 6));   // it rolls
            if (c.state === 1) { c.state = 2; c.t = 0; }
          }
        }
        const wl = c.w.length(); if (wl > 1e-4) { tmpQ.setFromAxisAngle(tmpV.copy(c.w).multiplyScalar(1 / wl), wl * dt); c.q.premultiply(tmpQ); }
        if (c.state === 2 && c.t > (c.loose ? 2.2 + c.seed * 1.4 : 5 + c.seed * 3)) { c.state = 3; c.t = 0; c.from.copy(c.pos); c.qFrom.copy(c.q); }
        if (c.pos.y < -3) { c.state = 3; c.t = 0; c.from.copy(c.pos); c.qFrom.copy(c.q); }
      } else if (c.state === 3 && c.loose) { if (c.t > 1.4) c.state = 0; }   // melts back into the crowd
      else if (c.state === 3) {             // float back up and lock into place
        const k = clamp01(c.t / 2.6), e = k * k * (3 - 2 * k);
        c.pos.lerpVectors(c.from, c.home, e); c.pos.y += Math.sin(k * Math.PI) * 0.35;
        c.q.slerpQuaternions(c.qFrom, c.q0, e);
        if (k >= 1) { fxW.copy(c.home).applyMatrix4(cubeSpace.matrixWorld); fxAt(fxW, 0.4, c.kind ? 'ceramic' : 'wire', 'lock'); c.state = 0; c.w.set((c.seed - 0.5) * 0.4, 0.2, (c.ph / 6 - 0.5) * 0.4); }
      }
      // arrive / leave: cubes assemble and scatter
      const dl = clamp01(lv * 1.6 - c.seed * 0.5), da = clamp01((1 - av) * 1.6 - c.seed * 0.5);
      let sc = c.size * (1 - dl) * (1 - da) * (useCubes || !c.near ? 1 : 0) * (c.loose ? (c.state === 0 ? 0 : c.state === 3 ? 1 - smooth01(c.t / 1.4) : smooth01(c.t / 0.12)) : c.state === 3 ? 0.6 + 0.4 * clamp01(c.t / 2.6) : 1);
      tmpP.copy(c.pos); if (dl > 0) tmpP.addScaledVector(tmpV.set(c.pos.x, 0, c.pos.z).normalize(), dl * 3).y += dl * dl * 4;
      if (da > 0) tmpP.y -= da * 2;
      if (sc < 1e-4) sc = 1e-4;
      tmpM.compose(tmpP, c.q, tmpS.set(sc, sc, sc)); c.mesh.setMatrixAt(c.i, tmpM);
      if (c.kind === 0) { tmpM.compose(tmpP, c.q, tmpS.set(sc * 0.16, sc * 0.16, sc * 0.16)); dotMesh.setMatrixAt(c.i, tmpM); }
      const glow = (c.state === 1 ? 1.3 : c.state === 2 ? 1.0 : c.state === 3 ? 1.0 : 0.75) * (c.near || c.loose ? 1 : 0.3) * (prm.light ?? 1);
      c.mesh.setColorAt(c.i, tmpC.setRGB(c.rgb[0] * glow * 0.5, c.rgb[1] * glow * 0.5, c.rgb[2] * glow * 0.5));
    }
    for (const im of [wireMesh, tileMesh, dotMesh]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999;
  }
  // which wall a near cube belongs to (for the shower)
  { let k = 0; walls.forEach((w, wi) => { for (let j = 0; j < NNEAR_W; j++) cubes[k++].wallI = wi; }); }

  // ================================================================================================== T-044 · palms
  const palms = []; for (let i = 0; i < NPR; i++) palms.push({ on: false, idle: i < NW, wall: i < NW ? i : 0, stroke: null, x: 0, y: 1.25, app: 0, contact: 0, held: 0, glow: 0 });
  const wallHands = new Float32Array(NW), packK = new Float32Array(NW), packEv = new Float32Array(NW).fill(-99), spanW = new Float32Array(NW);
  const handX = [], palmW = new THREE.Vector3(), tmpH = new THREE.Vector3();
  let swayAmp = 0, assistK = 0, baixK = 0;
  // the baixos: the three bodies of each wall's first row nearest its centre
  for (const c of crowd) c.baix = -1;
  for (let w = 0; w < NW; w++) crowd.filter((c) => c.front === w).sort((a, b) => Math.abs(a.fx) - Math.abs(b.fx)).slice(0, 3).forEach((c) => { c.baix = w; });
  function stepPalms(dt, time, hands, prm, st, events) {
    const slide = prm.slide ?? 0.3, packN = Math.max(1, Math.round(prm.packN ?? 2));
    const usePalm = prm.palm !== false;
    assistK = st && st.block === 'pinya' ? (st.assist || 0) : 0;
    for (const e of events || []) if (e.startsWith('pack:')) packEv[+e.slice(5) % NW] = time;
    // hands → wall coordinates (x along the wall from its centre, y height), in the first row's frame (world-aligned)
    wallHands.fill(0); handX.length = 0;
    for (const h of hands) {
      tmpH.copy(h.pos).applyMatrix4(invF); const w = walls[h.wall];
      const x = (tmpH.x - w.centre.x) * w.right.x + (tmpH.z - w.centre.z) * w.right.z;
      handX.push({ stroke: h.stroke, wall: h.wall, x, y: tmpH.y }); wallHands[h.wall]++;
    }
    // claim: a new hand takes its wall's waiting figure if it lands within 0.9 m of it, else a figure comes out of the crowd
    for (const hx of handX) {
      if (palms.some((q) => q.stroke === hx.stroke)) continue;
      let q = palms.find((p) => p.idle && p.wall === hx.wall && p.stroke === null && Math.abs(p.x - hx.x) < 0.9);
      if (!q) { q = palms.find((p) => !p.idle && !p.on) || null; if (q) { q.app = 0; q.x = hx.x; q.y = hx.y; q.wall = hx.wall; } }
      if (!q) continue;
      q.on = true; q.stroke = hx.stroke; q.held = 1.2;
    }
    // per wall: the palms with a hand, ordered along the wall, packed shoulder to shoulder round the centre
    for (let w = 0; w < NW; w++) {
      const list = palms.filter((q) => q.on && q.stroke !== null && q.wall === w).sort((a, b) => a.x - b.x);
      list.forEach((q, k) => { q.target = (k - (list.length - 1) / 2) * 0.5; });
      // span: the score's, or the stand-in (the spread of this wall's hands)
      // the score (ENT T-042): pack[w] 0..1, packed[w], event 'pack:w'; alone (study) a stand-in from the spread of this wall's hands
      let pk;
      if (st && Array.isArray(st.pack)) pk = Math.max(st.pack[w] || 0, st.packed?.[w] ? 1 : 0);
      else { let span = 99; const xs = handX.filter((h) => h.wall === w).map((h) => h.x); if (xs.length >= packN) span = Math.max(...xs) - Math.min(...xs); spanW[w] = span; pk = span <= 1.5 && wallHands[w] >= packN ? 1 : 0; }
      if (time - packEv[w] < 4) pk = Math.max(pk, 1);
      packK[w] += (pk - packK[w]) * Math.min(1, dt / (pk > packK[w] ? 1.5 : 1.2));
    }
    // follow: in contact, the figure slides towards the tower's foot at ≤ slide m/s and the palm with it; left behind, it waits and comes back
    for (const q of palms) {
      const hx = q.stroke !== null ? handX.find((h) => h.stroke === q.stroke) : null;
      if (q.stroke !== null && !hx) { q.held -= dt; if (q.held <= 0) q.stroke = null; }
      if (q.idle) q.on = usePalm;
      const on = q.on && usePalm;
      if (!on) { q.app = Math.max(0, q.app - dt / 1.2); q.contact = Math.max(0, q.contact - dt * 2); continue; }
      if (hx) {
        const d = Math.hypot(hx.x - q.x, hx.y - q.y);
        if (q.app < 0.98) { q.app = Math.min(1, q.app + dt / 0.9); q.x += (hx.x - q.x) * Math.min(1, dt * 8); q.y += (hx.y - q.y) * Math.min(1, dt * 8); }
        else if (d < 0.35 && !q.back && !(st && st.pinyaStage === 'palm'))   // T-047 (#16): 0.35 m (was 0.20) — a LiDAR hand keeps its palm
          { const dx = (q.target ?? 0) - q.x; q.x += Math.sign(dx) * Math.min(Math.abs(dx), slide * dt); q.y += (Math.min(1.75, Math.max(0.85, hx.y)) - q.y) * Math.min(1, dt * 3); q.wait = 0; }
        else if (d < 0.6 && !q.back) { q.wait = (q.wait || 0) + dt; if (q.wait > 1.6) q.back = true; }   // it waits for the hand that stays behind…
        else { q.back = true; const k = Math.min(1, (0.6 * dt) / Math.max(1e-3, d)); q.x += (hx.x - q.x) * k; q.y += (hx.y - q.y) * k; if (d < 0.05) { q.back = false; q.wait = 0; } }   // …then comes back to it and tugs again
        q.contact = d < 0.3 ? Math.min(1, q.contact + dt * 4) : Math.max(0, q.contact - dt * 2);
      } else if (q.idle) {   // the waiting figure: its palm open on the wall at the centre, breathing — the target
        q.app = Math.min(1, q.app + dt / 1.5); q.x += (0 - q.x) * Math.min(1, dt * 0.6); q.y += (1.25 + Math.sin(time * 0.63 + q.wall) * 0.015 - q.y) * Math.min(1, dt * 0.8);
        q.contact = Math.max(0, q.contact - dt * 1.5);
      } else { q.app = Math.max(0, q.app - dt / 1.2); q.contact = Math.max(0, q.contact - dt * 2); if (q.app <= 0) q.on = false; }
    }
    // the sway: packed walls rock the crowd, the whole room when the needed walls are packed
    let nPacked = 0, sumK = 0; for (let w = 0; w < NW; w++) { sumK += packK[w]; if (packK[w] > 0.5) nPacked++; }
    const need = st?.needWalls ?? Math.max(1, Math.round(prm.need ?? 1));
    baixK = st && st.fill ? closedS : 0;   // with the score: the baixos climb when the circle closes
    swayAmp += (((nPacked >= need ? 0.32 : 0.12 * sumK / NW)) - swayAmp) * Math.min(1, dt * 0.5);
    // instances
    const B = prBuf.array;
    palms.forEach((q, i) => {
      const o = i * 16;
      if (!pbody || q.app <= 0.001) { B[o] = 0; B[o + 1] = -50; B[o + 2] = 0; B[o + 3] = 1; B[o + 13] = 1; return; }
      const w = walls[q.wall], F = w.normal, yaw = Math.atan2(F.x, F.z);
      palmW.set(w.centre.x + w.right.x * q.x, q.y, w.centre.z + w.right.z * q.x);
      const h = clamp01((q.y - 1.0) / 0.72), pl = pbody.palm[1], ph = pbody.palm[2];
      const px = pl[0] + (ph[0] - pl[0]) * h, py = pl[1] + (ph[1] - pl[1]) * h, pz = pl[2] + (ph[2] - pl[2]) * h;
      const Xx = Math.cos(yaw), Xz = -Math.sin(yaw), e = q.app * q.app * (3 - 2 * q.app), back = (1 - e) * 1.2 + 0.006;
      const oy = Math.max(-0.2, Math.min(0.25, q.y - py));
      B[o] = palmW.x - Xx * px - F.x * (pz + back); B[o + 1] = oy * e; B[o + 2] = palmW.z - Xz * px - F.z * (pz + back); B[o + 3] = 1;
      B[o + 4] = e; B[o + 5] = 0.1 + q.contact * (0.9 + packK[q.wall] * 0.6); B[o + 6] = 0; B[o + 7] = h * e;
      B[o + 8] = 13 + i * 7; B[o + 9] = i * 0.7; B[o + 10] = 1.1 + q.contact * 0.6; B[o + 11] = yaw; B[o + 12] = 0; B[o + 13] = 1; B[o + 14] = 0; B[o + 15] = 0;
    });
    prBuf.needsUpdate = true;
  }

  function dispose() {
    for (const M of meshes) { M.mesh.geometry.dispose(); M.fmesh.geometry.dispose(); }
    try { fxBc?.close(); } catch { /* closed */ } ptMat.dispose(); fbMat.dispose(); gGeo.dispose(); boxGeo.dispose(); tileGeo.dispose(); wireMat.dispose(); tileMat.dispose(); jobs.length = 0;
  }
  if (typeof window !== "undefined") window.__pinya3d = { crowd, bodies: crowd.length, get meshes() { return meshes.length; }, createMs, get readyMs() { return readyMs; }, slots, cubes, impacts,
    get room() { return { rise, theta, thetaV }; }, uBand, uBand2, palms, packK, spanW, get sway() { return swayAmp; } };
  return { object, update, setParams() {}, dispose, impacts };
}
