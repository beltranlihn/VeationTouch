// Ressonància — part «castells3d»: the intro's castells of particles, on Beltrán's art (contract: ../PARTS.md). Brief: the director, 26-11.
//
// A square full of castells, some far away, some right on top of us: human towers of points (the beings of the pinya and the tower:
// pinya3d/body.js, pale gold and cream with sparkles) at real scale and real depth, 3 m to 25 m beyond the walls, so the four walls see
// true parallax. The near ones big, sharp and warm; the far ones small, dim, cold, in a little haze. The square itself is the Plaza
// session's (plaza3d): this part does not draw it.
//
// The sequence (input.t = the intro block's clock, s; the voice is recorded):
//   1.5–16   the castells BUILD from the dust, bottom up: the pinya ring by ring, then tier by tier, staggered — the far ones first
//   17       «Welcome to Ressonància»: the composition stands still and breathes
//   28.5–42  the castell on P1 (its base is FIRE, a band of embers) EXPLAINS the stages as the voice names them (params.stages):
//            correfoc = the fire lights · pinya = the base of bodies · tronc = the middle tiers · pom de dalt = the top ones ·
//            l'aleta = the enxaneta raises her hand. Each part grows in light, with a slight pulse and particles that let go.
//   43.5     («Tonight, in this trailer…») what the trailer does not climb (pom de dalt, l'aleta) sinks to a faint outline
//   50.5–55  everything lets go into particles (and the correfoc comes in)
// Hands on any wall stir the near castells' particles like optical flow (torre3d's velocity field): dragged, curled, home in ~1.8 s.
//
// API: part.highlight(stage, k) (stage 0..4 or a name; k 0..1, or null to give it back to the clock) · part.progress() →
// { built 0..1, stage, dimmed, ending, done } · part.events (this frame): 'built', 'stage:<name>', 'dim', 'end', 'done'.
// params.castells = [{ wall, x, depth, scale, tiers, rings, fire, explain, start }] (the art's layout; see CASTELLS below).
import { bakeBodyGen, pose, rng, V } from './pinya3d/body.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------- bodies
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const SHOULDER_L = { fd: [1, -0.25, 0], pn: [0, -1, 0] }, SHOULDER_R = { fd: [-1, -0.25, 0], pn: [0, -1, 0] };
const FLAT = { fd: [0, 0.5, 0.2], pn: [0, 0, 1] };
// four poses: the pinya (hands flat on the back in front) · the tronc (arms over the neighbours' shoulders) · bent over (acotxador,
// enxaneta) · l'aleta (bent, the left hand up)
const POSES = [
  { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.12, 0.07, -0.1), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)], hf: [FLAT, FLAT], elbow: V(0, -1, -0.2) },
  { lean: 0.08, hunch: 0.06, head: 0.12, feet: [V(0.12, 0.07, 0.05), V(-0.12, 0.07, -0.04)], hands: [V(0.52, 1.36, -0.02), V(-0.5, 1.34, 0.03)], hf: [SHOULDER_L, SHOULDER_R], elbow: V(0, -1, -0.4) },
  { lean: 0.42, hunch: 0.42, head: 0.35, feet: [V(0.13, 0.07, -0.16), V(-0.12, 0.07, 0.06)], hands: [V(0.22, 0.98, 0.42), V(-0.2, 1.02, 0.4)],
    hf: [{ fd: [0, 0.2, 1], pn: [0, -1, 0.2] }, { fd: [0, 0.2, 1], pn: [0, -1, 0.2] }], elbow: V(0, -1, -0.1) },
  { lean: 0.38, hunch: 0.3, head: -0.1, feet: [V(0.13, 0.07, -0.16), V(-0.12, 0.07, 0.06)], hands: [V(0.16, 2.02, 0.1), V(-0.2, 1.02, 0.4)],
    hf: [{ fd: [0, 1, 0], pn: [0, 0, 1] }, { fd: [0, 0.2, 1], pn: [0, -1, 0.2] }], elbow: V(0, -1, -0.2) }];
const LODS = [1900, 800, 320];   // points per body: near (< 5 m) · mid (< 14 m) · far
const SPREAD = 2.1, SH = 1.4;
const RINGS_R = [0.82, 1.32, 1.82, 2.32], RINGS_N = [8, 12, 16, 20];
// the art (P4 | P1 | P2 | P3): x = where it is seen on the wall, m from its centre (+ = the wall's right seen from the room), depth = m behind the wall to the
// castell's centre (at least its pinya's radius), scale = real size × it
const CASTELLS = [
  { wall: 'P4', x: -3.05, depth: 2.2, scale: 1.12, tiers: '4,4,4,3,2,1,1', rings: 2 },          // enormous, very near, cut by the left edge and the top
  { wall: 'P4', x: 2.2, depth: 24, scale: 1.0, tiers: '3,3,3,2,1,1', rings: 1 },               // small, far
  { wall: 'P4', x: 0.6, depth: 10.5, scale: 1.0, tiers: '4,4,3,2,1,1', rings: 2 },             // medium, half way
  { wall: 'P1', x: 0.0, depth: 9.0, scale: 1.0, tiers: '3,3,3,3,2,1,1', rings: 2, fire: true, explain: true },   // standing, its base fire: it explains
  { wall: 'P2', x: 1.1, depth: 1.75, scale: 1.25, tiers: '4,4,4,4,2,1,1', rings: 1 },          // giant, very near, cut above and below: huge bodies
  { wall: 'P2', x: -2.5, depth: 25, scale: 1.0, tiers: '3,3,3,2,1,1', rings: 1 },              // small, far
  { wall: 'P2', x: -0.6, depth: 6.5, scale: 1.08, tiers: '4,4,3,2,1,1', rings: 3 },            // large, a wide pinya
];
const STAGES = ['correfoc', 'pinya', 'tronc', 'pom', 'aleta'];

export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, uniformArray, vec2, vec3, vec4, float, clamp, mix, smoothstep, sin, cos, max, min, abs, normalize, varying, fract,
    cameraPosition, cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix, dot, exp, pow, length, cross } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'castells3d';
  const walls = room.walls, H = room.strip?.height || 912;
  const uTime = uniform(0), uLeave = uniform(0), uArrive = uniform(1), uLight = uniform(1), uMinPt = uniform(1.0 * 2 / H);
  const clipOf = (pv) => cameraProjectionMatrix.mul(pv);
  const ndcScale = (pv, c0, size) => { const c1 = clipOf(vec4(pv.xy.add(vec2(size, size)), pv.z, 1)); return abs(c1.xy.div(c1.w).sub(c0.xy.div(c0.w))).add(1e-7); };
  const tc = (c) => vec3(c[0], c[1], c[2]);
  const CREAM = [1.0, 0.86, 0.62], COOL = [0.5, 0.58, 0.76], NIGHT = [0.03, 0.045, 0.085], GOLD = [1.0, 0.7, 0.3], FIRE = [1.0, 0.42, 0.12];

  // ================================================================================================== points (4 poses per body)
  function pointType(body, seed, n) {
    const r = rng(seed), F = 40, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) {
      let v = Math.floor(r() * body.n);
      for (let t = 0; t < 6 && body.aAux2[v * 4 + 1] === 1 && body.aAux2[v * 4] > 0.89 && r() > 0.45; t++) v = Math.floor(r() * body.n);
      const rnd = r(), rnd2 = r();
      for (let c = 0; c < 4; c++) {
        const o = (k * 4 + c) * F;
        for (let q = 0; q < 4; q++) { A.set(body.P[q].subarray(v * 3, v * 3 + 3), o + q * 3); A.set(body.N[q].subarray(v * 3, v * 3 + 3), o + 12 + q * 3); }
        A.set(body.aAux.subarray(v * 4, v * 4 + 4), o + 24); A.set(body.aAux2.subarray(v * 4, v * 4 + 4), o + 28);
        A[o + 32] = Cc[c][0]; A[o + 33] = Cc[c][1]; A[o + 34] = rnd; A[o + 35] = rnd2;
      }
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), at = {};
    for (const [name, size, off] of [['position', 3, 0], ['pB', 3, 3], ['pC', 3, 6], ['pD', 3, 9], ['nA', 3, 12], ['nB', 3, 15], ['nC', 3, 18], ['nD', 3, 21], ['aAux', 4, 24], ['aAux2', 4, 28], ['aCo', 4, 32]]) at[name] = new THREE.InterleavedBufferAttribute(ib, size, off);
    return { at, index: new THREE.BufferAttribute(idx, 1), n };
  }

  // ================================================================================================== the hands: a velocity field (torre3d's)
  const NSTAMP = 16, STAMPS = [], SVEL = []; for (let i = 0; i < NSTAMP; i++) { STAMPS.push(new THREE.Vector4(0, -50, 0, 0)); SVEL.push(new THREE.Vector4(0, 0, 0, -99)); }
  const uStamp = uniformArray(STAMPS, 'vec4'), uSVel = uniformArray(SVEL, 'vec4');
  const brush = (pw, rnd) => TSL.Fn(() => {
    const acc = vec3(0, 0, 0).toVar();
    TSL.Loop(NSTAMP, ({ i }) => {
      const s = uStamp.element(i), sv = uSVel.element(i), age = uTime.sub(sv.w);
      TSL.If(s.w.greaterThan(0.001).and(age.lessThan(2.6)), () => {
        const toS = s.xyz.sub(cameraPosition), ls = length(toS), dir = toS.div(ls);
        const v = pw.sub(cameraPosition), along = dot(v, dir), perp = v.sub(dir.mul(along));
        const d = length(perp), depth = along.div(ls), rad = depth.mul(age.mul(0.14).add(0.2));
        // near castells only: the field fades beyond ~12 m (a far castell is a landscape, not under the hand)
        const f = s.w.mul(exp(d.mul(d).div(rad.mul(rad)).negate())).mul(depth.mul(0.6).add(0.4)).mul(float(1).sub(smoothstep(8, 14, along)));
        const env = float(1).sub(exp(age.mul(-9))).mul(exp(age.mul(-1.25))).mul(cos(age.mul(1.9)));
        const vel = sv.xyz, sp = length(vel), vn = vel.div(sp.add(1e-4));
        const curl = normalize(cross(dir, vn).add(vec3(0, 1e-4, 0))).mul(sin(d.div(rad).mul(3.2).sub(age.mul(2.4)).add(rnd.mul(2))));
        acc.addAssign(vn.mul(0.34).add(curl.mul(0.16)).mul(min(sp, float(1.2))).mul(env).mul(f).mul(min(depth, float(2.5))));
      });
    });
    const la = length(acc);
    return acc.mul(min(float(1), float(0.3).div(la.add(1e-5))));
  })();

  // ================================================================================================== the bodies' material
  // per instance (16): i0 = (x, y, z, height) · i1 = (yaw, seed, born, gone) · i2 = (w1, w2, w3, lean) · i3 = (glow, dim, haze 0 near..1 far, release)
  function bodyMaterial() {
    const pA = attribute('position', 'vec3'), pB = attribute('pB', 'vec3'), pC = attribute('pC', 'vec3'), pD = attribute('pD', 'vec3'), nA = attribute('nA', 'vec3'), nB = attribute('nB', 'vec3'), nC = attribute('nC', 'vec3'), nD = attribute('nD', 'vec3');
    const aux = attribute('aAux', 'vec4'), aux2 = attribute('aAux2', 'vec4'), co = attribute('aCo', 'vec4');
    const i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4');
    const seed = i1.y, born = i1.z, gone = i1.w, haze = i3.z, wA = float(1).sub(i2.x).sub(i2.y).sub(i2.z);
    let p = pA.mul(wA).add(pB.mul(i2.x)).add(pC.mul(i2.y)).add(pD.mul(i2.z));
    const n = normalize(nA.mul(wA).add(nB.mul(i2.x)).add(nC.mul(i2.y)).add(nD.mul(i2.z)).add(vec3(0, 1e-4, 0)));
    const bt = fract(uTime.add(seed.mul(3.1)).div(9)), br = smoothstep(0.0, 0.45, bt).mul(float(1).sub(smoothstep(0.45, 1.0, bt)));
    p = p.add(n.mul(aux.y.mul(br).mul(0.012))).add(vec3(0, aux.y.mul(br).mul(0.007), 0));
    p = p.add(vec3(0, p.y.mul(i2.w).mul(i2.w).mul(-0.03), p.y.mul(i2.w).mul(0.24)));
    const r1 = fract(co.z.mul(17.23).add(seed)), r2 = fract(co.w.mul(41.71).add(seed.mul(0.7))), r3 = fract(co.z.mul(73.13).add(co.w.mul(5.1)));
    // it builds out of the dust (from below: the feet first, the points rise into place) · it lets go upward
    const order = clamp(float(1).sub(p.y.div(1.8)), 0, 1).mul(-0.35).add(0.35).add(r1.mul(0.3));
    const e0 = clamp(born.mul(1.65).sub(order).div(0.7), 0, 1), e = e0.mul(e0).mul(float(3).sub(e0.mul(2)));
    const scat = vec3(r1.sub(0.5).mul(1.2), r2.mul(-1.4).sub(0.2), r3.sub(0.5).mul(1.2)).add(vec3(sin(uTime.mul(0.5).add(r1.mul(30))), 0, cos(uTime.mul(0.43).add(r2.mul(20)))).mul(0.15));
    p = p.add(scat.mul(float(1).sub(e)));
    const g0 = clamp(max(gone, uLeave).mul(1.6).sub(r3.mul(0.35)).sub(clamp(float(1).sub(p.y.div(1.8)), 0, 1).mul(0.25)), 0, 1);
    p = p.add(vec3(r1.sub(0.5).mul(1.3), g0.mul(g0).mul(r2.mul(2.6).add(1.4)).add(g0.mul(0.3)), r3.sub(0.5).mul(1.2)).mul(g0));
    // the parts that explain let particles go: a few points rise off and come back, while lit
    const rel = i3.w, lift = fract(uTime.mul(0.42).add(r2.mul(9))), loose = smoothstep(0.86, 0.9, r1).mul(rel);
    p = p.add(vec3(sin(lift.mul(6).add(r3.mul(20))).mul(0.05), lift.mul(0.55), cos(lift.mul(5).add(r1.mul(20))).mul(0.05)).mul(loose));
    const hs = i0.w, yw = i1.x, rot = (q) => vec3(q.x.mul(cos(yw)).add(q.z.mul(sin(yw))), q.y, q.x.mul(sin(yw).negate()).add(q.z.mul(cos(yw))));
    const local = i0.xyz.add(rot(p.mul(hs)));
    const pw0 = modelWorldMatrix.mul(vec4(local, 1)).xyz, pw = pw0.add(brush(pw0, r2));
    const pv = cameraViewMatrix.mul(vec4(pw, 1)), c0 = clipOf(pv);
    const size = float(0.0045).add(co.z.mul(0.0045)).mul(float(1).sub(e).mul(0.8).add(1)).mul(float(1).sub(g0.mul(0.5))).mul(haze.mul(0.6).add(1)).mul(hs);
    const d = ndcScale(pv, c0, size), kq = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w);
    const nw = normalize(modelWorldMatrix.mul(vec4(rot(n), 0)).xyz);
    const vN = varying(nw), vP = varying(pw), vCo = varying(co);
    const vA = varying(vec4(e, g0, float(1).div(kq.mul(kq)), clamp(p.y.div(1.7), 0, 1)));
    const vB = varying(i3), vC = varying(vec4(aux2.x, loose, 0, 0));
    // a point not yet formed (or gone) is not drawn at all: an opaque dark point would cut the square behind it
    m.opacityNode = float(1).sub(smoothstep(0.999, 1.001, dot(vCo.xy, vCo.xy))).mul(step01(vA.x.sub(0.12))).mul(step01(float(0.9).sub(vA.y))); m.alphaTest = 0.5;
    const N = normalize(vN), Vd = normalize(cameraPosition.sub(vP));
    const rim = pow(float(1).sub(abs(dot(N, Vd))), 2.2);
    const ao = vC.x.mul(0.6).add(0.4), low = smoothstep(0.02, 0.75, vA.w).mul(0.8).add(0.2);
    // depth: near = warm cream and sharp; far = cool, dimmer, sinking into the night's haze
    const hz = vB.z;
    const base = mix(tc(CREAM), tc(COOL), smoothstep(0.15, 0.85, hz)).mul(mix(float(0.78), float(1.15), vCo.z));
    let col = base.mul(float(0.42).mul(rim.mul(1.9).add(0.34)).mul(ao).mul(low).mul(uLight));
    const twk = pow(sin(uTime.mul(vCo.z.mul(2.2).add(0.5)).add(vCo.w.mul(60))).mul(0.5).add(0.5), 26);
    col = col.mul(twk.mul(2.4).mul(float(1).sub(hz.mul(0.6))).add(1));
    // a part that explains: it grows in light with a slight pulse (glow), its loose points shine
    const glow = vB.x, pulse = sin(uTime.mul(5.5).sub(vA.w.mul(4))).mul(0.15).add(0.85);
    col = col.mul(glow.mul(2.2).mul(pulse).add(1)).add(tc(GOLD).mul(glow).mul(rim.mul(1.1).add(0.3)).mul(0.5).mul(pulse)).add(tc(GOLD).mul(vC.y).mul(0.9));
    // what the trailer does not climb: a faint outline (the silhouette stays, the body empties)
    col = col.mul(mix(float(1), rim.mul(0.9).add(0.05), vB.y.mul(0.9))).mul(float(1).sub(vB.y.mul(0.35)));
    col = mix(col, tc(NIGHT), hz.mul(0.42)).mul(float(1).sub(hz.mul(0.22)));
    const mote = float(1).sub(vA.x).add(vA.y.mul(0.8));
    col = col.add(tc(CREAM).mul(mote.mul(twk.mul(0.6).add(0.05)).mul(0.3)).mul(float(1).sub(hz.mul(0.5))));
    const fade = smoothstep(0.0, 0.25, vA.x).mul(float(1).sub(smoothstep(0.5, 1.0, vA.y)));
    m.colorNode = col.mul(fade).mul(vA.z.mul(0.5).add(0.5)).mul(uArrive);
    m.fog = false;
    return m;
  }
  function step01(x) { return smoothstep(-0.0001, 0.0001, x); }
  const bodyMat = bodyMaterial();

  // ================================================================================================== the castells (from the layout list)
  const wallOf = (id) => { let i = walls.findIndex((w) => w.id === id); if (i < 0) i = Math.max(0, Math.min(walls.length - 1, Number(String(id).replace(/\D/g, '')) - 1 || 0)); return i; };
  const castells = [];
  function buildCastell(spec, ci) {
    const wi = wallOf(spec.wall), W = walls[wi], sc = spec.scale ?? 1, rings = Math.max(0, Math.min(4, spec.rings ?? 2));
    const Rout = rings ? RINGS_R[rings - 1] * sc : 0.5;
    const back = Math.max(spec.depth ?? 6, Rout + 0.1);
    // x is where the castell is SEEN on its wall (m from the wall's centre, from the eye): its place in the square is that ray, `back` deep
    const dW = Math.max(0.5, -((W.centre.x - room.eye.x) * W.normal.x + (W.centre.z - room.eye.z) * W.normal.z));
    const C = new THREE.Vector3().copy(W.centre).addScaledVector(W.right, (spec.x ?? 0) * (dW + back) / dW).addScaledVector(W.normal, -back); C.y = 0;
    const dist = Math.hypot(C.x - room.eye.x, C.z - room.eye.z);
    const lod = dist < 5 ? 0 : dist < 14 ? 1 : 2;
    const haze = clamp01((dist - 7) / 20);   // warm and sharp to ~7 m, then cooler, dimmer, hazier to 27 m
    const r = rng(1000 + ci * 77), bodies = [];
    const aN = Math.atan2(W.normal.z, W.normal.x);
    // the pinya: rings facing the centre, hands on the backs of the ring inside
    for (let k = 0; k < rings; k++) for (let j = 0; j < RINGS_N[k]; j++) {
      const a = ((j + (k % 2) * 0.5) / RINGS_N[k]) * Math.PI * 2 + (r() - 0.5) * 0.1, R = RINGS_R[k] * sc + (r() - 0.5) * 0.05;
      const pos = new THREE.Vector3(C.x + Math.cos(a) * R, 0, C.z + Math.sin(a) * R);
      bodies.push({ group: 1, ring: k, tier: -1, pos, yaw: Math.atan2(C.x - pos.x, C.z - pos.z), hs: (0.95 + r() * 0.1) * sc, pose: k === 0 && r() < 0.3 ? 1 : 0, seed: r() });
    }
    // the tronc and the pom de dalt: tiers on the shoulders of the tier below, facing the centre (one alone faces the eye)
    const spec2 = String(spec.tiers ?? '3,3,3,2,1,1').split(/[ ,]+/).map((x) => Math.max(1, Math.min(6, Math.round(+x) || 1)));
    let y = 0; const nT = spec2.length;
    spec2.forEach((n, k) => {
      const last = k === nT - 1, acotx = n === 1 && k === nT - 2, dosos = n === 2 && k >= nT - 3;
      const hs = (last ? 0.62 : acotx ? 0.72 : dosos ? 0.85 : k >= 2 ? 0.95 : 1.0) * sc;
      const rr0 = (n >= 4 ? 0.42 : n === 3 ? 0.36 : n === 2 ? 0.23 : 0) * sc;
      const group = last ? 4 : (acotx || dosos) ? 3 : 2;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + (k % 2) * Math.PI / n + aN + Math.PI / 4;
        const pos = new THREE.Vector3(C.x + Math.cos(a) * rr0, y, C.z + Math.sin(a) * rr0);
        const yaw = n >= 2 ? Math.atan2(C.x - pos.x, C.z - pos.z) : Math.atan2(W.normal.x, W.normal.z);
        bodies.push({ group, ring: -1, tier: k, pos, yaw, hs, pose: last || acotx ? 2 : 1, seed: r() });
      }
      y += acotx ? 0.92 * hs : SH * hs;
    });
    const top = y + 0.8 * sc;
    // the build: far ones first; the pinya ring by ring (inner first), then tier by tier; each body forms in ~1.2 s
    const t0 = spec.start ?? (1.5 + (1 - clamp01((dist - 2) / 24)) * 4.2 + ci * 0.25);
    for (const b of bodies) {
      b.t = b.ring >= 0 ? t0 + b.ring * 0.75 + b.seed * 0.5 : t0 + rings * 0.75 + 0.6 + b.tier * 0.85 + b.seed * 0.25;
      b.w = [0, 0, 0, 0]; b.w[b.pose] = 1; b.born = 0; b.gone = 0; b.glow = 0; b.dim = 0; b.rel = 0; b.lean = 0;
    }
    const cs = { spec, wi, C, dist, lod, haze, bodies, rings, Rout, top, t0, built: Math.max(...bodies.map((b) => b.t)) + 1.3, explain: !!spec.explain, fire: !!spec.fire, meshes: [] };
    castells.push(cs);
    return cs;
  }
  for (const [i, s] of (Array.isArray(P.castells) ? P.castells : CASTELLS).entries()) buildCastell(s, i);

  // ---- meshes: one per castell and build (LOD by distance), culled per wall by the castell's sphere
  const types = [], jobs = [];
  const tCreate = performance.now(); let readyMs = 0;
  for (let bi = 0; bi < 2; bi++) jobs.push({ gen: bakeBodyGen(BUILDS[bi], REST, POSES, { grid: 0.022, detail: true, seed: 71 + bi * 9, shards: 24, spread: SPREAD }), done: (body) => {
    types[bi] = LODS.map((n, l) => pointType(body, 3000 + bi * 10 + l, n));
    for (const cs of castells) {
      const list = cs.bodies.filter((b, k) => (k + (b.seed < 0.5 ? 0 : 1)) % 2 === bi);
      if (!list.length) continue;
      const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(list.length * 16), 16, 1); buf.setUsage(THREE.DynamicDrawUsage);
      const g = new THREE.InstancedBufferGeometry(), pt = types[bi][cs.lod];
      for (const [k, a] of Object.entries(pt.at)) g.setAttribute(k, a);
      g.setIndex(pt.index); for (let i = 0; i < 4; i++) g.setAttribute('i' + i, new THREE.InterleavedBufferAttribute(buf, 4, i * 4));
      g.instanceCount = list.length;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cs.C.x, cs.top / 2, cs.C.z), Math.hypot(cs.top / 2, cs.Rout) + 1.5);
      const mesh = new THREE.Mesh(g, bodyMat); mesh.renderOrder = 2; object.add(mesh);
      list.forEach((b, k) => { b.buf = buf; b.k = k; });
      cs.meshes.push({ mesh, buf, list });
    }
  } });
  const palmL = (() => { const k = pose(POSES[3], BUILDS[1]); return [k.wL[0], k.wL[1] + 0.06, k.wL[2]]; })();
  void palmL;

  // ---- the fire at the base of the explaining castell: a band of embers round its pinya, breathing, rising
  const fireCs = castells.find((c) => c.fire);
  const uFire = uniform(0.35), uFireOn = uniform(0);
  if (fireCs) {
    const n = 2600, F = 8, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]], r = rng(4040);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, R = fireCs.Rout + 0.15 + Math.pow(r(), 1.4) * 0.9 * fireCs.spec.scale, rnd = r(), h = r();
      for (let c = 0; c < 4; c++) A.set([fireCs.C.x + Math.cos(a) * R, 0, fireCs.C.z + Math.sin(a) * R, Cc[c][0], Cc[c][1], rnd, h, 0], (k * 4 + c) * F);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aE', new THREE.InterleavedBufferAttribute(ib, 4, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const p0 = attribute('position', 'vec3'), ae = attribute('aE', 'vec4');
    const life = fract(uTime.mul(ae.z.mul(0.35).add(0.18)).add(ae.z.mul(13.7)));
    const p = p0.add(vec3(sin(uTime.mul(1.3).add(ae.z.mul(40))).mul(0.06), life.mul(ae.w.mul(0.9).add(0.25)).mul(uFire.mul(0.6).add(0.6)), cos(uTime.mul(1.1).add(ae.z.mul(30))).mul(0.06)));
    const pw = modelWorldMatrix.mul(vec4(p, 1)).xyz, pv = cameraViewMatrix.mul(vec4(pw, 1)), c0 = clipOf(pv);
    const d = ndcScale(pv, c0, float(0.012).add(ae.z.mul(0.018)).mul(float(1).sub(life.mul(0.6)))), kq = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = TSL.select(uFireOn.greaterThan(0.001), vec4(c0.xy.add(ae.xy.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w), vec4(0, 0, 2, 1));
    const vE = varying(ae), vL = varying(life), vK = varying(float(1).div(kq.mul(kq)));
    const r2 = dot(vE.xy, vE.xy), flick = pow(sin(uTime.mul(vE.z.mul(9).add(3)).add(vE.z.mul(70))).mul(0.5).add(0.5), 3);
    m.colorNode = mix(tc(FIRE), vec3(1.0, 0.8, 0.45), vL.oneMinus().mul(0.5)).mul(float(1).sub(smoothstep(0.3, 1.0, r2))).mul(float(1).sub(vL).mul(flick.mul(0.8).add(0.4)))
      .mul(uFire).mul(uFireOn).mul(vK.mul(0.6).add(0.4)).mul(float(1).sub(uLeave)).mul(1.1);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; mesh.frustumCulled = false; object.add(mesh);
  }

  // ================================================================================================== state
  const events = [], manual = new Array(STAGES.length).fill(null), stageK = new Float32Array(STAGES.length);
  let time = 0, builtSent = false, dimSent = false, endSent = false, doneSent = false, lastT = -1, stageNow = -1, dimK = 0;
  const fired = new Set();
  const lastStamp = new Map(), stampT = new Float32Array(NSTAMP).fill(-99); let stampI = 0;
  const tmpV = new THREE.Vector3();
  const env = (t, t0, hold) => (t < t0 ? 0 : t < t0 + 0.55 ? smooth01((t - t0) / 0.55) : t < t0 + 0.55 + hold ? 1 : 0.2 + 0.8 * Math.exp(-(t - t0 - 0.55 - hold) / 1.4));

  function update(dt, input) {
    dt = Math.min(0.1, dt || 0.016);
    if (jobs.length) {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) { const r = jobs[0].gen.next(); if (r.done) { jobs[0].done(r.value); jobs.shift(); } }
      if (!jobs.length) readyMs = Math.round(performance.now() - tCreate);
    }
    events.length = 0;
    const p = input.params || P;
    time = input.time ?? time + dt;
    const t = input.t ?? time;
    if (lastT > t + 0.5) { fired.clear(); builtSent = dimSent = endSent = doneSent = false; }   // the clock went back: a new pass
    lastT = t;
    uTime.value = time; uLight.value = p.light ?? 1;
    uLeave.value = clamp01(input.leave ?? p.leave ?? 0); uArrive.value = clamp01(input.arrive ?? p.arrive ?? 1);
    if (!input.state && room.setBackground) room.setBackground({ bottom: [0.006, 0.008, 0.02], top: [0.012, 0.018, 0.04], gain: 1 });   // alone in the study: the night blue (the square is Plaza's)

    // ---- the stages (the explaining castell): the clock's moments, or the host's highlight()
    const st = p.stages ?? [29.4, 32.2, 34.8, 37.0, 39.4];
    stageNow = -1;
    for (let i = 0; i < STAGES.length; i++) {
      const k = manual[i] != null ? manual[i] : env(t, st[i], i < STAGES.length - 1 ? Math.max(0.6, st[i + 1] - st[i] - 0.8) : 2.6);
      stageK[i] += (k - stageK[i]) * Math.min(1, dt * 6);
      if (t >= st[i] && !fired.has('s' + i)) { fired.add('s' + i); events.push(`stage:${STAGES[i]}`); }
      if (t >= st[i]) stageNow = i;
    }
    const dimAt = p.dimAt ?? 43.5, endAt = p.endAt ?? 50.5, endDur = p.endTime ?? 4.5;
    dimK += ((t >= dimAt ? 1 : 0) - dimK) * Math.min(1, dt * 1.6);
    if (t >= dimAt && !dimSent) { dimSent = true; events.push('dim'); }
    if (t >= endAt && !endSent) { endSent = true; events.push('end'); }
    if (t >= endAt + endDur && !doneSent) { doneSent = true; events.push('done'); }
    const goneAll = clamp01((t - endAt) / endDur);
    uFire.value = 0.35 + 1.4 * stageK[0]; uFireOn.value = fireCs ? smooth01((t - fireCs.t0) / 2) * (1 - goneAll) : 0;

    // ---- hands: the velocity field (any wall)
    for (const h of input.hands || []) {
      let ls = lastStamp.get(h.stroke);
      if (!ls) { ls = { t: time, v: new THREE.Vector3(), q: h.pos.clone(), seen: time }; lastStamp.set(h.stroke, ls); }
      tmpV.subVectors(h.pos, ls.q).multiplyScalar(1 / Math.max(dt, 1e-3)); ls.v.lerp(tmpV, Math.min(1, dt * 10)); ls.q.copy(h.pos); ls.seen = time;
      if (time - ls.t > 0.07) {
        const sp = ls.v.length(), amt = Math.min(1, 0.25 + sp / 0.7);
        STAMPS[stampI].set(h.pos.x, h.pos.y, h.pos.z, amt); SVEL[stampI].set(ls.v.x, ls.v.y, ls.v.z, time); if (sp < 0.05) SVEL[stampI].set(0, 0.08, 0, time);
        stampT[stampI] = time; stampI = (stampI + 1) % NSTAMP; ls.t = time;
      }
    }
    for (const [k, ls] of lastStamp) if (time - ls.seen > 0.5) lastStamp.delete(k);
    for (let i = 0; i < NSTAMP; i++) if (time - stampT[i] > 2.6) STAMPS[i].w = 0;

    // ---- the bodies
    let builtAll = true;
    for (const cs of castells) {
      for (const b of cs.bodies) {
        b.born = clamp01((t - b.t) / 1.2);
        if (b.born < 1) builtAll = false;
        // the explaining castell's parts
        let g = 0, rel = 0, dim = 0;
        if (cs.explain) {
          const k = b.group === 1 ? stageK[1] : b.group === 2 ? stageK[2] : b.group === 3 ? stageK[3] : b.group === 4 ? Math.max(stageK[3] * 0.7, stageK[4]) : 0;
          g = k; rel = k;
          if (b.group >= 3) dim = dimK * (1 - Math.max(stageK[3], stageK[4]) * 0.6);
          if (b.group === 4) { const a = manual[4] != null ? manual[4] : stageK[4] > 0.05 || t >= st[4] ? 1 : 0; const w = smooth01(a); b.w[2] = 1 - w; b.w[3] = w; }
        }
        b.glow = g; b.rel = rel; b.dim = dim;
        // the end: from the top down, the far ones a little later
        const hgt = b.pos.y / Math.max(1, cs.top);
        b.gone = clamp01((goneAll * 1.5 - (1 - hgt) * 0.35 - cs.haze * 0.15));
      }
      for (const M of cs.meshes) {
        const A = M.buf.array;
        M.list.forEach((b, k) => {
          const o = k * 16;
          A[o] = b.pos.x; A[o + 1] = b.pos.y; A[o + 2] = b.pos.z; A[o + 3] = b.hs;
          A[o + 4] = b.yaw; A[o + 5] = b.seed * 97; A[o + 6] = b.born; A[o + 7] = b.gone;
          A[o + 8] = b.w[1]; A[o + 9] = b.w[2]; A[o + 10] = b.w[3]; A[o + 11] = b.lean + 0.015 * Math.sin(time * 0.7 + b.seed * 9);
          A[o + 12] = b.glow; A[o + 13] = b.dim; A[o + 14] = cs.haze; A[o + 15] = b.rel;
        });
        M.buf.needsUpdate = true;
        M.mesh.frustumCulled = uLeave.value < 0.01 && goneAll <= 0;   // letting go, the points leave the sphere: no culling then
      }
    }
    if (builtAll && castells.length && types.length && !builtSent) { builtSent = true; events.push('built'); }
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999 && goneAll < 1;
  }
  function highlight(stage, k) { const i = typeof stage === 'number' ? stage : STAGES.indexOf(stage); if (i >= 0 && i < STAGES.length) manual[i] = k == null ? null : clamp01(k); }
  function progress() {
    let n = 0, b0 = 0; for (const cs of castells) for (const b of cs.bodies) { n++; b0 += b.born; }
    return { built: n ? +(b0 / n).toFixed(3) : 0, stage: stageNow >= 0 ? STAGES[stageNow] : null, dimmed: +dimK.toFixed(2), ending: endSent ? clamp01((lastT - (P.endAt ?? 50.5)) / (P.endTime ?? 4.5)) : 0, done: doneSent, readyMs };
  }
  function dispose() { bodyMat.dispose(); jobs.length = 0; for (const cs of castells) for (const M of cs.meshes) M.mesh.geometry.dispose(); }
  if (typeof window !== 'undefined') window.__castells3d = { castells, progress, highlight, events };
  return { object, update, dispose, highlight, progress, events, setParams() {} };
}
