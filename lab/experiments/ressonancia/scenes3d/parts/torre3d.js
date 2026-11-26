// Ressonància — part «torre3d»: the tower of the trailer, after the pinya (contract: ../PARTS.md). Brief: Beltrán via the director, 26-11.
//
// The base is complete: the RONDA stands formed right behind the front wall (P1, the title wall), at real scale, as if we were inside
// the pinya; behind it the square, made of sparse particles. The other three walls invite: a hand held there ~1.7 s (a ring charges
// under it) makes a being of points at the hand; it lets go into a stream of points that FLIES round the room to the tower, lands on
// the ronda's shoulders and CLIMBS (poses: reach · bend · stand) to its place on the shoulders of the tier below. One after another,
// the people of the room are the ones who climb. Every tier complete → the WORLD sinks one step (we rise with the tower): the
// square's buildings go down behind, until we are above the roofs. On P1 a hand stirs the beings' particles (they part, swirl and
// come home). With the enxaneta at the top: a small golden light rises from the base up the column, shoulder to shoulder (the Pom
// «carries the enxaneta's light to the top»), she raises her hand (l'aleta) and a golden wave runs round the room; then the tower
// and the square let go into rising particles.
//
// API: part.progress() → { tier, tiers, climbers, needed, height, ending, done }; part.events (this frame): 'joined:<tier>',
// 'tier:<n>', 'top', 'aleta', 'end', 'done'; part.reset(); part.setBackdrop(positions Float32Array xyz[, colours]) swaps the square.
import { bakeBodyGen, pose, rng, V } from './pinya3d/body.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------- bodies
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const SHOULDER_L = { fd: [1, -0.25, 0], pn: [0, -1, 0] }, SHOULDER_R = { fd: [-1, -0.25, 0], pn: [0, -1, 0] };
const FLAT = { fd: [0, 0.5, 0.2], pn: [0, 0, 1] };
// the ronda: hands flat on the back in front · arms over the neighbours' shoulders · one arm round the neighbour, the other pushing
const RONDA = [
  { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.12, 0.07, -0.1), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)], hf: [FLAT, FLAT], elbow: V(0, -1, -0.2) },
  { lean: 0.08, hunch: 0.06, head: 0.12, feet: [V(0.12, 0.07, 0.05), V(-0.12, 0.07, -0.04)], hands: [V(0.52, 1.36, -0.02), V(-0.5, 1.34, 0.03)], hf: [SHOULDER_L, SHOULDER_R], elbow: V(0, -1, -0.4) },
  { lean: 0.14, hunch: 0.12, head: 0.25, feet: [V(0.11, 0.07, 0.08), V(-0.12, 0.07, -0.08)], hands: [V(0.5, 1.33, 0.04), V(-0.12, 1.12, 0.45)], hf: [SHOULDER_L, { fd: [0, 0.4, 0.3], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) }];
// a climber, four poses blended by weight (organic climbing: the hands and a foot go first, then the push):
//   step L / step R: a foot up on the thigh or hip of the one below, one hand high on a shoulder above, the other forward (step R's
//   forward palm also meets the visitor's hand at the wall when the climber forms) · pull: the weight over the shoulders below, hands
//   on them · stand: on the shoulders, arms over the neighbours'
const STEP_R = { lean: 0.12, hunch: 0.06, head: -0.25, feet: [V(0.12, 0.07, 0.04), V(-0.1, 0.42, 0.2)], hands: [V(0.22, 1.86, 0.3), V(-0.2, 1.45, 0.42)],
  hf: [{ fd: [0.1, 1, 0.2], pn: [0, 0.2, 1] }, { fd: [-0.1, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.4) };
const STEP_L = { lean: 0.14, hunch: 0.08, head: -0.2, feet: [V(0.1, 0.46, 0.2), V(-0.12, 0.07, 0.04)], hands: [V(0.2, 1.45, 0.42), V(-0.22, 1.88, 0.3)],
  hf: [{ fd: [0.1, 1, 0], pn: [0, 0, 1] }, { fd: [-0.1, 1, 0.2], pn: [0, 0.2, 1] }], elbow: V(0, -1, -0.4) };
const PULL = { lean: 0.55, hunch: 0.42, head: 0.35, feet: [V(0.13, 0.07, -0.16), V(-0.12, 0.07, 0.06)], hands: [V(0.22, 0.98, 0.42), V(-0.2, 1.02, 0.4)],
  hf: [{ fd: [0, 0.2, 1], pn: [0, -1, 0.2] }, { fd: [0, 0.2, 1], pn: [0, -1, 0.2] }], elbow: V(0, -1, -0.1) };
const CLIMB = [STEP_L, STEP_R, PULL, RONDA[1]];
// the enxaneta: step L · step R · bent over the acotxador · bent, the left hand up (l'aleta)
const ENX = [STEP_L, STEP_R, { ...PULL, lean: 0.42 },
  { lean: 0.38, hunch: 0.3, head: -0.1, feet: [V(0.13, 0.07, -0.16), V(-0.12, 0.07, 0.06)], hands: [V(0.16, 2.02, 0.1), V(-0.2, 1.02, 0.4)],
    hf: [{ fd: [0, 1, 0], pn: [0, 0, 1] }, { fd: [0, 0.2, 1], pn: [0, -1, 0.2] }], elbow: V(0, -1, -0.2) }];
const RONDA4 = [...RONDA, RONDA[0]];
// the baked types: [build, poses, label]
const TYPES = [[0, RONDA4, 'ronda'], [1, RONDA4, 'ronda'], [0, CLIMB, 'climb'], [1, CLIMB, 'climb'], [1, ENX, 'enx']];
const NPT = 1900;
const SPREAD = 2.1;
const GOLD = [1.0, 0.66, 0.26];

export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, uniformArray, vec2, vec3, vec4, float, int, clamp, mix, smoothstep, sin, cos, max, min, abs, normalize, varying, fract, select,
    cameraPosition, cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix, modelViewMatrix, dot, exp, pow, length, cross, atan, floor, sqrt } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'torre3d';
  const world = new THREE.Group(); object.add(world);            // everything that sinks as we rise
  const walls = room.walls, NW = walls.length;
  const H = room.strip?.height || 912;
  const uTime = uniform(0), uLeave = uniform(0), uArrive = uniform(1), uWarm = uniform(0.5), uLight = uniform(1), uGlow = uniform(1), uRise = uniform(0), uBreath = uniform(1);
  const uPlaza = uniform(1), uPlazaSize = uniform(1), uMinPt = uniform(1.0 * 2 / H), uEyeL = uniform(new THREE.Vector3(0, 1.6, 0)), uFaixa = uniform(1), uWave = uniform(new THREE.Vector4(0, 0, 0, -1));   // wave: centre xyz (room), radius
  const clipOf = (pv) => cameraProjectionMatrix.mul(pv);
  const ndcScale = (pv, c0, size) => { const c1 = clipOf(vec4(pv.xy.add(vec2(size, size)), pv.z, 1)); return abs(c1.xy.div(c1.w).sub(c0.xy.div(c0.w))).add(1e-7); };
  const tc = (c) => vec3(c[0], c[1], c[2]);
  const COLD = [0.5, 0.56, 0.7], WARM = [1.0, 0.42, 0.32], RED = [0.85, 0.05, 0.035];

  // ---- the front wall (P1 by default) and the tower's place: the ronda's near side just behind its plane
  const wallIdx = () => { const id = P.towerWall; let i = walls.findIndex((w) => w.id === id); if (i < 0) i = walls.findIndex((w) => w.id === 'P1'); return i < 0 ? Math.min(1, NW - 1) : i; };
  let TW = wallIdx();
  const R1 = 0.82, R2 = 1.32, R3 = 1.82, GAP = 0.04;   // three rings, the outer one almost on the wall plane (we are inside the pinya)
  const C = new THREE.Vector3(), N1 = new THREE.Vector3(), X1 = new THREE.Vector3();
  function placeTower() { const w = walls[TW]; N1.copy(w.normal); X1.copy(w.right); C.copy(w.centre).addScaledVector(N1, -(GAP + R3 + 0.16)); C.y = 0; }
  placeTower();

  // ---- the tiers (parameter: e.g. "4,3,3,2,1,1"): radius by count, feet on the shoulders of the tier below; the last ones are children
  let tiers = [], slots = [];
  const SH = 1.4;   // shoulder height of a build-1 body standing
  function buildTiers() {
    const spec = String(P.tiers ?? '4,3,3,2,1,1').split(/[ ,]+/).map((x) => Math.max(1, Math.min(6, Math.round(+x) || 1))).slice(0, 8);
    tiers = []; slots = [];
    let y = 0; const nT = spec.length;
    spec.forEach((n, k) => {
      const last = k === nT - 1, acotx = n === 1 && !last && k === nT - 2;
      const hs = k >= nT - 1 ? 0.62 : k >= nT - 2 ? 0.72 : k >= nT - 3 && n <= 2 ? 0.85 : k >= 2 ? 0.95 : 1.0;
      const r = n >= 4 ? 0.42 : n === 3 ? 0.36 : n === 2 ? 0.23 : 0;
      const T = { k, n, y, hs, r, role: last ? 'enx' : acotx ? 'acotx' : n === 2 && k >= nT - 3 ? 'dosos' : 'tier', seated: 0, done: false };
      tiers.push(T);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + (k % 2) * Math.PI / n + Math.atan2(N1.z, N1.x) + Math.PI / 4;
        const pos = new THREE.Vector3(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r);
        // they face the centre (a ring) — one alone faces the room (the eye)
        const yaw = n >= 2 ? Math.atan2(C.x - pos.x, C.z - pos.z) : Math.atan2(N1.x, N1.z);
        slots.push({ tier: k, j, pos, yaw, hs, who: null, final: T.role === 'acotx' || T.role === 'enx' ? 1 : 2 });
      }
      y += T.role === 'acotx' ? 0.92 * hs : SH * hs;   // the enxaneta climbs onto the acotxador's back
    });
  }
  buildTiers();

  // ================================================================================================== bodies: point clouds
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
  const instBuf = (count) => { const b = new THREE.InstancedInterleavedBuffer(new Float32Array(count * 20), 20, 1); b.setUsage(THREE.DynamicDrawUsage); return b; };

  // the hand brush on the front wall: 12 stamps (room xyz, strength): points near the ray eye → stamp part, swirl and come home
  const NSTAMP = 12, STAMPS = []; for (let i = 0; i < NSTAMP; i++) STAMPS.push(new THREE.Vector4(0, -50, 0, 0));
  const uStamp = uniformArray(STAMPS, 'vec4');
  const brush = (pw, rnd) => TSL.Fn(() => {
    const acc = vec3(0, 0, 0).toVar();
    TSL.Loop(NSTAMP, ({ i }) => {
      const s = uStamp.element(i);
      TSL.If(s.w.greaterThan(0.001), () => {
        const toS = s.xyz.sub(cameraPosition), ls = length(toS), dir = toS.div(ls);
        const v = pw.sub(cameraPosition), along = dot(v, dir), perp = v.sub(dir.mul(along));
        const d = length(perp), rad = along.div(ls).mul(0.3);   // ≈ 0.3 m on the wall, wider deeper
        const f = s.w.mul(exp(d.mul(d).div(rad.mul(rad)).negate()));
        const out = perp.div(d.add(1e-4)), sw = normalize(cross(dir, out).add(vec3(0, 1e-4, 0)));
        const ang = sin(uTime.mul(1.7).add(rnd.mul(30)).add(d.mul(9)));
        acc.addAssign(out.mul(rad.mul(0.32)).add(sw.mul(rad.mul(0.42).mul(ang))).add(vec3(0, rnd.sub(0.4).mul(rad).mul(0.3), 0)).mul(f));
      });
    });
    const la = length(acc);
    return acc.mul(min(float(1), float(0.22).div(la.add(1e-5))));   // a stir, never a blast: ≤ 22 cm
  })();

  // per instance (16): i0 = (D xyz: the body's place, height) · i1 = (O xyz: where it formed, travel 0..1) · i2 = (pose 0..2, yaw, seed, yawO)
  //                    i3 = (born, gone, glow, gold)
  function beingMaterial() {
    const pA = attribute('position', 'vec3'), pB = attribute('pB', 'vec3'), pC = attribute('pC', 'vec3'), pD = attribute('pD', 'vec3'), nA = attribute('nA', 'vec3'), nB = attribute('nB', 'vec3'), nC = attribute('nC', 'vec3'), nD = attribute('nD', 'vec3');
    const aux = attribute('aAux', 'vec4'), aux2 = attribute('aAux2', 'vec4'), co = attribute('aCo', 'vec4');
    const i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4'), i4 = attribute('i4', 'vec4');
    const seed = i2.z, born = i3.x, gone = i3.y, wA = float(1).sub(i4.x).sub(i4.y).sub(i4.z);
    let p = pA.mul(wA).add(pB.mul(i4.x)).add(pC.mul(i4.y)).add(pD.mul(i4.z));
    const n = normalize(nA.mul(wA).add(nB.mul(i4.x)).add(nC.mul(i4.y)).add(nD.mul(i4.z)).add(vec3(0, 1e-4, 0)));
    const faixa = smoothstep(0.86, 0.9, p.y).mul(float(1).sub(smoothstep(1.0, 1.04, p.y))).mul(uFaixa);   // the sash, red at the waist
    const bt = fract(uTime.add(seed.mul(3.1)).div(9)), br = smoothstep(0.0, 0.45, bt).mul(float(1).sub(smoothstep(0.45, 1.0, bt))).mul(uBreath);
    p = p.add(n.mul(aux.y.mul(br).mul(0.012))).add(vec3(0, aux.y.mul(br).mul(0.007), 0));
    p = p.add(vec3(0, p.y.mul(i4.w).mul(i4.w).mul(-0.03), p.y.mul(i4.w).mul(0.24)));   // lean: the whole weight, pivoting on the feet (balance, the torso leading)
    const r1 = fract(co.z.mul(17.23).add(seed)), r2 = fract(co.w.mul(41.71).add(seed.mul(0.7))), r3 = fract(co.z.mul(73.13).add(co.w.mul(5.1)));
    // birth out of the dust (the palm first) · the end: rise and drift apart
    const order = clamp(aux.w.mul(0.42), 0, 0.75).add(r1.mul(0.25));
    const e0 = clamp(born.mul(2.0).sub(order).div(0.75), 0, 1), e = e0.mul(e0).mul(float(3).sub(e0.mul(2)));
    const scat = normalize(vec3(r1.sub(0.5).mul(1.2), r2.sub(0.55), r3.sub(0.85)).add(vec3(0, 0.001, 0))).mul(r2.mul(0.9).add(0.25));
    const swirl = vec3(sin(uTime.mul(0.4).add(r1.mul(30))), cos(uTime.mul(0.33).add(r2.mul(20))).mul(0.5), cos(uTime.mul(0.37).add(r3.mul(25)))).mul(0.12);
    p = p.add(scat.add(swirl).mul(float(1).sub(e)));
    const g0 = clamp(max(gone, uLeave).mul(1.6).sub(r3.mul(0.35)).sub(clamp(float(1).sub(p.y.div(1.8)), 0, 1).mul(0.25)), 0, 1);
    p = p.add(vec3(r1.sub(0.5).mul(1.3), g0.mul(g0).mul(r2.mul(2.4).add(1.2)).add(g0.mul(0.25)), r3.sub(0.5).mul(1.2)).mul(g0));
    // the body in place (D, yaw) and where it formed (O, yawO)
    const hs = i0.w, rot = (yw, q) => vec3(q.x.mul(cos(yw)).add(q.z.mul(sin(yw))), q.y, q.x.mul(sin(yw).negate()).add(q.z.mul(cos(yw))));
    const ps = p.mul(hs);
    const atD = i0.xyz.add(rot(i2.y, ps)), atO = i1.xyz.add(rot(i2.w, ps));
    // the journey: a stream of points round the room (round the eye, through the room in front of the walls), each point a little late
    const tp0 = clamp(i1.w.mul(1.45).sub(r1.mul(0.45)), 0, 1), tp = tp0.mul(tp0).mul(float(3).sub(tp0.mul(2)));
    const shape = float(1).sub(smoothstep(0.0, 0.2, tp0).mul(float(1).sub(smoothstep(0.8, 1.0, tp0))));
    const a = i1.xz.sub(uEyeL.xz), b = i0.xz.sub(uEyeL.xz);
    const ang0 = atan(a.y, a.x), ang1 = atan(b.y, b.x);
    const dA0 = ang1.sub(ang0), dA = dA0.sub(floor(dA0.add(Math.PI).div(Math.PI * 2)).mul(Math.PI * 2));
    const ang = ang0.add(dA.mul(tp)), bump = sin(tp.mul(Math.PI));
    const rad = mix(mix(length(a), length(b), tp), float(2.35), bump.mul(0.85));
    const py = mix(i1.y.add(hs.mul(1.25)), i0.y.add(hs.mul(1.1)), tp).add(bump.mul(0.35));
    const tube = normalize(vec3(r2.sub(0.5), r3.sub(0.5), r1.sub(0.5)).add(vec3(0, 0.001, 0))).mul(r3.mul(0.18).add(0.05).mul(bump))
      .add(vec3(sin(uTime.mul(3).add(r1.mul(40))), cos(uTime.mul(2.6).add(r2.mul(33))), sin(uTime.mul(2.2).add(r3.mul(27)))).mul(0.05).mul(bump));
    const pathP = vec3(uEyeL.x.add(cos(ang).mul(rad)), py, uEyeL.z.add(sin(ang).mul(rad))).add(tube);
    const local = mix(pathP, mix(atO, atD, smoothstep(0.45, 0.55, tp)), shape);
    // world position, the hand brush, then the view
    const pw0 = modelWorldMatrix.mul(vec4(local, 1)).xyz;
    const pw = pw0.add(brush(pw0, r2));
    const pv = cameraViewMatrix.mul(vec4(pw, 1)), c0 = clipOf(pv);
    const handK = smoothstep(0.998, 0.9999, aux2.y).mul(smoothstep(0.885, 0.895, aux2.x));
    const size = float(0.0042).add(co.z.mul(0.0045)).mul(float(1).sub(handK.mul(0.45))).mul(float(1).sub(e).mul(0.8).add(1)).mul(float(1).sub(g0.mul(0.55)))
      .mul(float(1).sub(shape).mul(0.4).add(1));
    const d = ndcScale(pv, c0, size), kq = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w);
    const nw = normalize(modelWorldMatrix.mul(vec4(mix(rot(i2.w, n), rot(i2.y, n), smoothstep(0.45, 0.55, tp)), 0)).xyz);
    const vN = varying(nw), vP = varying(pw), vCo = varying(co);
    const vA = varying(vec4(e, g0, float(1).div(kq.mul(kq)), clamp(p.y.div(1.7), 0, 1)));
    const vB = varying(vec4(i3.z, i3.w, faixa, shape)), vC = varying(vec4(aux2.x, handK, 0, 0));
    m.opacityNode = float(1).sub(smoothstep(0.999, 1.001, dot(vCo.xy, vCo.xy))); m.alphaTest = 0.5;
    const N = normalize(vN), Vd = normalize(cameraPosition.sub(vP));
    const rim = pow(float(1).sub(abs(dot(N, Vd))), 2.2);
    const ao = vC.x.mul(0.6).add(0.4), low = smoothstep(0.02, 0.75, vA.w).mul(0.85).add(0.15);
    const base = mix(tc(COLD), tc(WARM), uWarm).mul(mix(float(0.75), float(1.15), vCo.z));
    let col = base.mul(float(0.26).mul(rim.mul(1.9).add(0.28)).mul(ao).mul(low).mul(uLight));
    const twk = pow(sin(uTime.mul(vCo.z.mul(2.2).add(0.5)).add(vCo.w.mul(60))).mul(0.5).add(0.5), 28);
    col = col.mul(twk.mul(2.2).add(1));
    col = mix(col, tc(RED).mul(rim.mul(0.5).add(0.2)).mul(0.6), vB.z.mul(0.55));                              // the sash
    col = col.add(mix(vec3(0.8, 0.88, 1.0), tc(GOLD), 0.5).mul(vB.x).mul(rim.mul(0.5).add(0.15)).mul(uGlow).mul(0.5));   // a newborn shines
    col = col.add(tc(GOLD).mul(vB.y).mul(rim.mul(1.3).add(0.35)).mul(uGlow).mul(0.6));                        // the Pom's light
    // in the stream the points are motes of light
    const mote = float(1).sub(vA.x).add(vA.y.mul(0.8)).add(float(1).sub(vB.w).mul(1.2));
    col = col.add(mix(tc(COLD), tc(GOLD), uWarm.mul(0.6)).mul(mote.mul(twk.mul(0.6).add(0.06)).mul(0.3)));
    const fade = smoothstep(0.0, 0.25, vA.x).mul(float(1).sub(smoothstep(0.5, 1.0, vA.y)));
    m.colorNode = col.mul(fade).mul(vA.z.mul(0.5).add(0.5)).mul(uArrive);
    m.fog = false;
    return m;
  }
  const beingMat = beingMaterial();
  const jobs = [], ready = [], meshes = [];
  const tCreate = performance.now(); let readyMs = 0;
  const CAP = 40;
  TYPES.forEach(([bi, poses], t) => {
    jobs.push({ gen: bakeBodyGen(BUILDS[bi], REST, poses, { grid: 0.022, detail: true, seed: 51 + t * 7, shards: 24, spread: SPREAD }), done: (body) => {
      const pt = pointType(body, 1200 + t, NPT), buf = instBuf(CAP), g = new THREE.InstancedBufferGeometry();
      for (const [k, a] of Object.entries(pt.at)) g.setAttribute(k, a);
      g.setIndex(pt.index); for (let i = 0; i < 5; i++) g.setAttribute('i' + i, new THREE.InterleavedBufferAttribute(buf, 4, i * 4));
      g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
      const mesh = new THREE.Mesh(g, beingMat); mesh.frustumCulled = false; mesh.renderOrder = 2; world.add(mesh);

      meshes[t] = { mesh, buf, list: [] }; ready.push(t);
      if (TYPES[t][2] === 'ronda') placeRonda();
    } });
  });
  const palmOf = (bi, sp) => { const k = pose(sp, BUILDS[bi]); return [k.wR[0] + k.hfR.fd[0] * 0.05 + k.hfR.pn[0] * 0.019, k.wR[1] + k.hfR.fd[1] * 0.05 + k.hfR.pn[1] * 0.019, k.wR[2] + k.hfR.fd[2] * 0.05 + k.hfR.pn[2] * 0.019]; };
  const reachPalm = [palmOf(0, STEP_R), palmOf(1, STEP_R)];

  // ---- the ronda: two rings facing the tower, formed (it is the base the pinya left)
  const ronda = [];
  function placeRonda() {
    if (!(meshes[0] && meshes[1]) || ronda.length) return;
    const rr = rng(77);
    const spots = [];
    for (const [R, n, ph] of [[R1, 8, 0], [R2, 12, 0.5], [R3, 16, 0.25]]) for (let j = 0; j < n; j++) {
      const a = ((j + ph) / n) * Math.PI * 2 + (rr() - 0.5) * 0.12, r = R + (rr() - 0.5) * 0.06;
      spots.push([R, new THREE.Vector3(C.x + Math.cos(a) * r, 0, C.z + Math.sin(a) * r)]);
    }
    // the crescent: the pinya spreads along the wall beyond the rings, right behind its plane, leaning in towards the tower
    const W = walls[TW];
    for (const side of [-1, 1]) for (let j = 0; j < 4; j++) {
      const x = side * (R3 * 0.78 + 0.5 + j * 0.56 + (rr() - 0.5) * 0.12), d = 0.16 + rr() * 0.12 + j * 0.05;
      if (Math.abs(x) > W.width / 2 - 0.3) continue;
      spots.push([R3 + 1, new THREE.Vector3().copy(W.centre).addScaledVector(X1, x).addScaledVector(N1, -d).setY(0)]);
    }
    for (const [R, pos] of spots) {
      const t = rr() < 0.5 ? 0 : 1;
      const pz = R === R1 ? (rr() < 0.7 ? 0 : 2) : (rr() < 0.55 ? 0 : rr() < 0.5 ? 1 : 2), w = [0, 0, 0, 0]; w[pz] = 1;
      const b = { type: t, pos, O: pos, yaw: Math.atan2(C.x - pos.x, C.z - pos.z), yawO: 0, hs: 0.95 + rr() * 0.1, w, lean: R > R3 ? 0.08 : 0,
        travel: 1, born: 0, gone: 0, glow: 0, gold: 0, seed: rr(), delay: rr() * 0.6 + (R === R1 ? 0 : R === R2 ? 0.3 : 0.6), M: meshes[t], k: meshes[t].list.length, y0: 0 };
      meshes[t].list.push(b); ronda.push(b);
    }
    for (const t of [0, 1]) meshes[t].mesh.geometry.instanceCount = meshes[t].list.length;
  }

  // ================================================================================================== the square (a stand-in of particles)
  let backdrop = null; const tmpB = new THREE.Vector3();
  // pos: Float32Array xyz (the world's frame) · rgba: Uint8Array (a: 0 surface, 160 lit window, 255 stained glass / lamp) or null ·
  // lit: Float32Array 0..1 per point (the stand-in) or null
  let backdropMat = null;
  function backdropMesh(pos, rgba, lit) {
    const n = pos.length / 3, F = 11, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]], r = rng(5);
    for (let k = 0; k < n; k++) {
      const rnd = r(), cw = rgba ? (rgba[k * 4 + 3] >= 250 ? 1 : rgba[k * 4 + 3] >= 150 ? 0.7 : 0) : lit ? lit[k] : 0;
      const cr = rgba ? rgba[k * 4] / 255 : 0.55, cg = rgba ? rgba[k * 4 + 1] / 255 : 0.62, cb = rgba ? rgba[k * 4 + 2] / 255 : 0.8;
      for (let c = 0; c < 4; c++) A.set([pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], Cc[c][0], Cc[c][1], rnd, cw, cr, cg, cb, 0], (k * 4 + c) * F);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 3)); g.setAttribute('aRgb', new THREE.InterleavedBufferAttribute(ib, 3, 7));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (!backdropMat) backdropMat = backdropMaterial();
    const mesh = new THREE.Mesh(g, backdropMat); mesh.renderOrder = 1;
    return mesh;
  }
  function backdropMaterial() {
    const p0 = attribute('position', 'vec3'), co = attribute('aC', 'vec4'), rgb = attribute('aRgb', 'vec3');
    const drift = vec3(sin(uTime.mul(0.1).add(co.z.mul(40))), cos(uTime.mul(0.08).add(co.z.mul(23))), sin(uTime.mul(0.09).add(co.z.mul(71)))).mul(0.015);
    const g0 = clamp(uLeave.mul(1.5).sub(co.z.mul(0.5)), 0, 1);
    const p = p0.add(drift).add(vec3(co.z.sub(0.5).mul(2), g0.mul(g0).mul(co.z.add(0.6)).mul(6), fract(co.z.mul(7.7)).sub(0.5).mul(2)).mul(g0));
    const pw = modelWorldMatrix.mul(vec4(p, 1)).xyz, pv = cameraViewMatrix.mul(vec4(pw, 1)), c0 = clipOf(pv);
    const d = ndcScale(pv, c0, float(0.0055).add(co.z.mul(0.004)).add(co.w.mul(0.005)).mul(uPlazaSize)), kq = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w);
    const vC = varying(co), vK = varying(float(1).div(kq.mul(kq))), vP = varying(pw), vG = varying(g0), vRgb = varying(rgb);
    const r2 = dot(vC.xy, vC.xy), twk = pow(sin(uTime.mul(vC.z.mul(0.7).add(0.2)).add(vC.z.mul(90))).mul(0.5).add(0.5), 12);
    // the surfaces cool and dim (the tower leads), lit windows and lamps warm
    const surf = mix(vRgb, vec3(0.55, 0.62, 0.8), 0.6), litC = mix(vRgb, vec3(1.0, 0.72, 0.42), 0.3);
    const col = mix(surf.mul(0.075), litC.mul(0.9), vC.w);   // fine, cold and dim: the tower leads
    const wv = uWave.w.greaterThan(0).select(exp(abs(length(vP.xz.sub(uWave.xz)).sub(uWave.w)).mul(-1.6)), float(0));
    m.colorNode = col.mul(float(1).sub(smoothstep(0.55, 0.8, r2))).mul(twk.mul(0.6).add(0.75)).mul(vK.mul(0.6).add(0.4)).mul(uLight).mul(uPlaza)
      .add(tc(GOLD).mul(wv).mul(0.6)).mul(uArrive).mul(float(1).sub(vG));
    m.fog = false;
    return m;
  }
  // a square: the far façade behind the tower (16 m), two side façades, the paving; floors, cornices, pilasters, window frames, a roof line
  function standIn() {
    const r = rng(909), pts = [], col = [];
    const put = (p, c = 0) => { pts.push(p.x, p.y, p.z); col.push(c); };
    const at = (u, y, d, out = new THREE.Vector3()) => out.copy(C).addScaledVector(X1, u).addScaledVector(N1, -d).setY(y);
    const tmp = new THREE.Vector3();
    const line = (a, b, n, c = 0) => { for (let i = 0; i < n; i++) { const t = r(); put(tmp.lerpVectors(a, b, t).add(new THREE.Vector3((r() - 0.5) * 0.04, (r() - 0.5) * 0.04, (r() - 0.5) * 0.04)), c); } };
    const facade = (u0, u1, d0, d1, Hh) => {   // a façade from (u0, d0) to (u1, d1) in the tower's frame, Hh high
      const A0 = at(u0, 0, d0), A1 = at(u1, 0, d1), len = A0.distanceTo(A1), bays = Math.max(1, Math.round(len / 3.2)), floors = Math.round(Hh / 2.5);
      const P = (t, y) => new THREE.Vector3().lerpVectors(A0, A1, t).setY(y);
      for (let f = 0; f <= floors; f++) line(P(0, f * Hh / floors), P(1, f * Hh / floors), Math.round(len * (f === floors ? 70 : 34)));
      line(P(0, Hh + 0.5), P(1, Hh + 0.5), Math.round(len * 22));
      for (let b = 0; b <= bays; b++) line(P(b / bays, 0), P(b / bays, Hh), Math.round(Hh * 30));
      for (let b = 0; b < bays; b++) for (let f = 0; f < floors; f++) {
        const t0 = (b + 0.32) / bays, t1 = (b + 0.68) / bays, y0 = f * Hh / floors + 0.55, y1 = y0 + 1.45, lit = f > 0 && r() < 0.16 ? 1 : 0;
        for (const [p, q] of [[P(t0, y0), P(t1, y0)], [P(t1, y0), P(t1, y1)], [P(t1, y1), P(t0, y1)], [P(t0, y1), P(t0, y0)]]) line(p, q, 22, lit);
        if (lit) for (let i = 0; i < 40; i++) put(P(t0 + (t1 - t0) * r(), y0 + (y1 - y0) * r()), 1);
      }
      for (let i = 0; i < len * Hh * 6; i++) put(P(r(), r() * Hh), 0);
    };
    facade(-20, 20, 15, 15, 7.4);
    facade(-11.5, -11.5, 3.5, 15, 6.6);
    facade(11.5, 11.5, 15, 3.5, 6.6);
    for (let i = 0; i < 9000; i++) { const u = (r() - 0.5) * 23, d = -1 + r() * 16; const grid = r() < 0.7; const p = at(grid ? Math.round(u) + (r() - 0.5) * 0.04 : u, 0.005, grid && r() < 0.5 ? d : Math.round(d) + (r() - 0.5) * 0.04); put(p, 0); }
    return { pos: new Float32Array(pts), col: new Float32Array(col) };
  }
  // setBackdrop(positions xyz [, rgba Uint8Array]) — the square's points in the world's frame (they sink with it)
  function setBackdrop(pos, rgba, lit) {
    if (backdrop) { world.remove(backdrop); for (const m of backdrop.children) m.geometry.dispose(); }
    backdrop = new THREE.Group(); world.add(backdrop);
    // cells of 12.5 m on the ground (an 8 × 8 grid over ±50 m): each wall's camera draws only the cells its frustum meets
    const n = pos.length / 3, G = 8, CELL = 12.5, NSEC = G * G, cnt = new Int32Array(NSEC), sec = new Uint8Array(n);
    const cellOf = (x, z) => Math.min(G - 1, Math.max(0, Math.floor((x + 50) / CELL))) * G + Math.min(G - 1, Math.max(0, Math.floor((z + 50) / CELL)));
    for (let i = 0; i < n; i++) { sec[i] = cellOf(pos[i * 3], pos[i * 3 + 2]); cnt[sec[i]]++; }
    for (let k = 0; k < NSEC; k++) {
      if (!cnt[k]) continue;
      const P = new Float32Array(cnt[k] * 3), Q = rgba ? new Uint8Array(cnt[k] * 4) : null, L = lit ? new Float32Array(cnt[k]) : null; let j = 0;
      const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
      for (let i = 0; i < n; i++) {
        if (sec[i] !== k) continue;
        P[j * 3] = pos[i * 3]; P[j * 3 + 1] = pos[i * 3 + 1]; P[j * 3 + 2] = pos[i * 3 + 2];
        lo.min(tmpB.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2])); hi.max(tmpB);
        if (Q) for (let c = 0; c < 4; c++) Q[j * 4 + c] = rgba[i * 4 + c];
        if (L) L[j] = lit[i];
        j++;
      }
      const mesh = backdropMesh(P, Q, L), bs = new THREE.Sphere(); new THREE.Box3(lo, hi).getBoundingSphere(bs); bs.radius += 0.6;
      mesh.geometry.boundingSphere = bs; mesh.frustumCulled = true; backdrop.add(mesh);
    }
  }
  { const s = standIn(); setBackdrop(s.pos, null, s.col); }
  // the Plaza session's square of points (plaza3d/points.bin: Float32 xyz × n, then Uint8 rgba × n; shuffled: a prefix is an even subset)
  if (P.plaza !== false && typeof fetch === 'function') {
    fetch(new URL('./plaza3d/points.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((meta) => meta && fetch(new URL('./plaza3d/points.bin', import.meta.url))
      .then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
        if (!buf) return;
        const n = meta.count, k = Math.max(1000, Math.min(n, Math.round(n * (P.plazaDensity ?? 0.75))));
        setBackdrop(new Float32Array(buf, 0, k * 3), new Uint8Array(buf, meta.bytesPosition, k * 4));
      })).catch(() => { /* the stand-in stays */ });
  }

  // ================================================================================================== dust round the room (it streams down as we rise)
  {
    const n = 14000, r = rng(1717), F = 8, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) {
      const w = walls[Math.floor(r() * NW)], back = 0.2 + Math.pow(r(), 1.4) * 9, x = (r() - 0.5) * w.width * (1 + back * 0.3);
      const p = new THREE.Vector3().copy(w.centre).addScaledVector(w.right, x).addScaledVector(w.normal, -back); p.y = -1 + r() * 7;
      const rnd = r(), big = r();
      for (let c = 0; c < 4; c++) A.set([p.x, p.y, p.z, Cc[c][0], Cc[c][1], rnd, big, back], (k * 4 + c) * F);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 3)); g.setAttribute('aD', new THREE.InterleavedBufferAttribute(ib, 1, 7));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const p0 = attribute('position', 'vec3'), co = attribute('aC', 'vec4'), back = attribute('aD', 'float');
    const drift = vec3(sin(uTime.mul(0.06).add(co.z.mul(40))), sin(uTime.mul(0.045).add(co.z.mul(23))).mul(0.6), cos(uTime.mul(0.05).add(co.z.mul(71)))).mul(back.mul(0.04).add(0.08));
    // in the room's frame (not the world's): they stream down as we rise (wrapped in 7 m)
    const yw = fract(p0.y.add(1).add(uRise).div(7)).mul(7).sub(1);
    const p = vec3(p0.x, yw, p0.z).add(drift).add(vec3(0, uLeave.mul(uLeave).mul(co.z.add(0.5)).mul(4), 0));
    const pw = modelWorldMatrix.mul(vec4(p, 1)).xyz, pv = cameraViewMatrix.mul(vec4(pw, 1)), c0 = clipOf(pv);
    const d = ndcScale(pv, c0, float(0.004).add(co.w.mul(co.w).mul(0.01)).mul(back.mul(0.12).add(1))), kq = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w);
    const vC = varying(co), vK = varying(float(1).div(kq.mul(kq))), vD = varying(back), vP = varying(pw);
    const r2 = dot(vC.xy, vC.xy), twk = pow(sin(uTime.mul(vC.z.mul(0.8).add(0.2)).add(vC.z.mul(90))).mul(0.5).add(0.5), 10);
    const wv = uWave.w.greaterThan(0).select(exp(abs(length(vP.xz.sub(uWave.xz)).sub(uWave.w)).mul(-1.4)), float(0));
    const c = mix(tc(COLD), tc(WARM), uWarm.mul(0.5)).mul(float(1).sub(smoothstep(0.2, 1.0, r2))).mul(twk.mul(1.6).add(0.25)).mul(exp(vD.mul(-0.12)).mul(0.85).add(0.15)).mul(0.07).mul(vK.mul(0.6).add(0.4))
      .add(tc(GOLD).mul(wv).mul(twk.mul(2).add(0.6)).mul(0.5));
    m.colorNode = c.mul(uArrive).mul(float(1).sub(uLeave)).mul(uLight);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; object.add(mesh);
  }

  // ================================================================================================== rings on the other walls: invite · charge
  const NRING = 16;
  const rA = new THREE.InstancedBufferAttribute(new Float32Array(NRING * 8), 8); rA.setUsage(THREE.DynamicDrawUsage);
  {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.instanceCount = NRING;
    const ib = new THREE.InstancedInterleavedBuffer(rA.array, 8, 1); ib.setUsage(THREE.DynamicDrawUsage); rA.ib = ib;
    g.setAttribute('r0', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('r1', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    const r0 = attribute('r0', 'vec4'), r1 = attribute('r1', 'vec4');   // r0: centre xyz (room), alpha · r1: right x, right z, progress 0..1 (or -1 = invite), radius
    const q = TSL.positionGeometry.xy, R = abs(r1.w).mul(1.25);
    const pw = r0.xyz.add(vec3(r1.x, 0, r1.y).mul(q.x.mul(R))).add(vec3(0, q.y.mul(R), 0));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    m.vertexNode = TSL.select(r0.w.greaterThan(0.001), cameraProjectionMatrix.mul(cameraViewMatrix.mul(modelWorldMatrix.mul(vec4(pw, 1)))), vec4(0, 0, 2, 1));
    const vQ = varying(q.mul(1.25)), vR = varying(r1), vA = varying(r0.w);
    const rr = length(vQ), an = atan(vQ.x, vQ.y.negate()).div(Math.PI * 2).add(0.5);   // 0 at the bottom, clockwise
    const lineK = exp(rr.sub(1).mul(rr.sub(1)).mul(-2400));
    const dots = pow(sin(an.mul(Math.PI * 2 * 36).add(uTime.mul(0.6))).mul(0.5).add(0.5), 6);
    const invite = vR.z.lessThan(0);
    const filled = smoothstep(vR.z.sub(0.004), vR.z, an).oneMinus();
    const inv = lineK.mul(dots.mul(0.8).add(0.2)).mul(sin(uTime.mul(1.3)).mul(0.25).add(0.6));
    const chg = lineK.mul(filled.mul(1.0).add(0.18)).add(exp(rr.mul(rr).mul(-30)).mul(vR.z).mul(0.25));
    const gold = vR.w.lessThan(0);
    const colr = gold.select(tc(GOLD).mul(1.6), mix(vec3(0.78, 0.86, 1.0), tc(GOLD), 0.35));
    const dot0 = exp(rr.mul(rr).mul(-14)).mul(sin(uTime.mul(2.2)).mul(0.25).add(0.75)).mul(0.55);   // a golden point: a soft core inside the ring
    m.colorNode = colr.mul(invite.select(inv.mul(0.35), chg.mul(0.6)).add(gold.select(dot0, float(0)))).mul(vA).mul(float(1).sub(uLeave));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; object.add(mesh);
  }

  // ================================================================================================== the ruler (P1's plane): the metres
  // Beltrán: «en la parte donde empezamos a subir, debe mostrar ese gráfico con los metros». tronc3d's measuring rod beside the
  // column: a fine line, a mark + name + real height per tier (lit when the tier closes), and a live reading of our height at eye
  // level that counts up with the rise. It shows when we start to rise and goes out with the end. Geist Mono, cold grey, no glow.
  const NAMES = ['BAIXOS', 'SEGONS', 'TERÇOS', 'QUARTS', 'QUINTS', 'SISENS'];
  const tierName = (k) => { const nT = tiers.length, T = tiers[k]; return T.role === 'enx' ? 'ENXANETA' : T.role === 'acotx' ? 'ACOTXADOR' : T.role === 'dosos' ? 'DOSOS' : NAMES[Math.min(k, NAMES.length - 1)] || 'PIS ' + (k + 1); void nT; };
  const markY = (k) => { const T = tiers[k]; return k + 1 < tiers.length ? tiers[k + 1].y : T.y + 1.0 * T.hs; };   // the top of a tier: where the next stands
  const fmtM = (v) => v.toFixed(1).replace('.', ',') + ' m';
  const RUL_X = 0.78, LAB_H = 0.075, LAB_W = 0.75;
  const NLAB = 8, cvL = typeof document !== 'undefined' ? document.createElement('canvas') : null, cvR = cvL ? document.createElement('canvas') : null;
  let labTex = null, liveTex = null, fontFam = 'ui-monospace, Menlo, Consolas, monospace', liveStr = '';
  function drawLabels() {
    if (!cvL) return; const g = cvL.getContext('2d');
    g.clearRect(0, 0, cvL.width, cvL.height); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `400 40px ${fontFam}`;
    const thin = String.fromCharCode(8201);
    for (let k = 0; k < Math.min(NLAB, tiers.length); k++) g.fillText(`${tierName(k).split('').join(thin)}   ${fmtM(markY(k))}`, 8, k * 64 + 33);
    if (labTex) labTex.needsUpdate = true;
  }
  function drawLive(v) {
    if (!cvR) return; const str = fmtM(v); if (str === liveStr) return; liveStr = str;
    const g = cvR.getContext('2d'); g.clearRect(0, 0, cvR.width, cvR.height); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `400 44px ${fontFam}`;
    g.fillText(str, 8, 33); if (liveTex) liveTex.needsUpdate = true;
  }
  if (cvL) {
    cvL.width = 1024; cvL.height = 64 * NLAB; cvR.width = 512; cvR.height = 64;
    labTex = new THREE.CanvasTexture(cvL); labTex.colorSpace = THREE.SRGBColorSpace; labTex.flipY = false;
    liveTex = new THREE.CanvasTexture(cvR); liveTex.colorSpace = THREE.SRGBColorSpace; liveTex.flipY = false;
    drawLabels(); drawLive(1.6);
    try {   // Geist Mono (OFL, scenes3d/fonts), as the guide's labels
      const ff = new FontFace('TorreMono', `url(${new URL('../fonts/geistmono-400.woff2', import.meta.url).href})`);
      ff.load().then((f) => { document.fonts.add(f); fontFam = 'TorreMono, ui-monospace, monospace'; drawLabels(); liveStr = ''; drawLive(1.6 + rise); }).catch(() => {});
    } catch { /* system mono */ }
  }
  const rulK = uniform(0), labK = Array.from({ length: NLAB }, () => uniform(0)), labE = new Float32Array(NLAB);
  const addMat = () => new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const INK = vec3(0.78, 0.82, 0.9);
  const ruler = new THREE.Group(); object.add(ruler);
  const rLine = new THREE.Mesh(new THREE.PlaneGeometry(0.0035, 1).translate(0, 0.5, 0), addMat()); rLine.material.colorNode = INK.mul(0.32).mul(rulK);
  ruler.add(rLine);
  const rTicks = [], rLabs = [];
  for (let i = 0; i < NLAB; i++) {
    const tm = addMat(); tm.colorNode = INK.mul(labK[i]).mul(rulK).mul(0.8);
    const T = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.0035), tm); ruler.add(T); rTicks.push(T);
    const lm = addMat(); const a = labTex ? TSL.texture(labTex, vec2(TSL.uv().x, float(i).add(float(1).sub(TSL.uv().y)).div(NLAB))).a : float(0);
    lm.colorNode = INK.mul(a).mul(labK[i]).mul(rulK).mul(0.75);
    const L = new THREE.Mesh(new THREE.PlaneGeometry(LAB_W * 2, LAB_H), lm); L.position.x = LAB_W + 0.07; ruler.add(L); rLabs.push(L);
  }
  // the live reading: a slightly longer mark at eye level and our height
  const liveTick = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.004), addMat()); liveTick.material.colorNode = INK.mul(rulK).mul(0.9); ruler.add(liveTick);
  const liveLab = new THREE.Mesh(new THREE.PlaneGeometry(LAB_W, LAB_H * 1.1), addMat());
  liveLab.material.colorNode = INK.mul(liveTex ? TSL.texture(liveTex, vec2(TSL.uv().x, float(1).sub(TSL.uv().y))).a : float(0)).mul(rulK).mul(0.95);
  liveLab.position.set(LAB_W / 2 + 0.16, 0, 0); ruler.add(liveLab);
  for (const o of [rLine, ...rTicks, ...rLabs, liveTick, liveLab]) { o.renderOrder = 6; o.frustumCulled = false; }
  let rulE = 0;

  // ================================================================================================== the light in her hand · the golden beams
  const pomU = uniform(new THREE.Vector4(0, -50, 0, 0)), pomV = uniform(new THREE.Vector4(0.06, 1, 0, 0));   // pos (world), on · size, intensity
  {
    const g = new THREE.PlaneGeometry(2, 2), m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(pomU.xyz, 1));
    m.vertexNode = TSL.select(pomU.w.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(TSL.positionGeometry.xy.mul(pomV.x.mul(3))), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const d = TSL.uv().sub(0.5).mul(2), r2 = dot(d, d).mul(9);
    m.colorNode = mix(tc(GOLD), vec3(1, 0.95, 0.82), exp(r2.mul(-6))).mul(exp(r2.mul(-1.2)).mul(0.35).add(exp(r2.mul(-7)).mul(0.9))).mul(pomV.y).mul(pomU.w).mul(float(1).sub(uLeave));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; world.add(mesh);
  }
  const goldAt = (wi, out) => out.copy(walls[wi].centre).setY(1.2);
  // the hand she holds up (her left palm in l'aleta), in the world's frame
  const enxPalm = (() => { const k = pose(ENX[3], BUILDS[1]); return [k.wL[0] + k.hfL.fd[0] * 0.06, k.wL[1] + k.hfL.fd[1] * 0.06, k.wL[2] + k.hfL.fd[2] * 0.06]; })();
  function handOf(b, out) {
    const q = enxPalm, hs = b.hs, cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
    return out.set(b.pos.x + (q[0] * cy + q[2] * sy) * hs, b.pos.y + (b.dy || 0) + q[1] * hs + 0.04, b.pos.z + (-q[0] * sy + q[2] * cy) * hs);
  }
  const NB = 3, NBP = 900, BA = [], BB = [];
  for (let i = 0; i < NB; i++) { BA.push(new THREE.Vector4(0, -50, 0, 0)); BB.push(new THREE.Vector4(0, -50, 0, 0)); }
  const uBA = uniformArray(BA, 'vec4'), uBB = uniformArray(BB, 'vec4'), uEyeR = uniform(new THREE.Vector3().copy(room.eye));
  const beams = []; for (let i = 0; i < NB; i++) beams.push({ on: false, k: 0, reach: 0, wall: -1, from: new THREE.Vector3() });
  {
    const n = NB * NBP, F = 6, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]], r = rng(3131);
    for (let k = 0; k < n; k++) { const bi = Math.floor(k / NBP), u0 = r(), a = r(), b2 = r(); for (let c = 0; c < 4; c++) A.set([bi, u0, a, b2, Cc[c][0], Cc[c][1]], (k * 4 + c) * F); const q = k * 4; idx.set([q, q + 1, q + 2, q, q + 2, q + 3], k * 6); }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aQ', new THREE.InterleavedBufferAttribute(ib, 2, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const a4 = attribute('position', 'vec4'), cq = attribute('aQ', 'vec2');
    const bi = int(a4.x), u0 = a4.y, ra = a4.z, rb = a4.w;
    const PA = uBA.element(bi), PB = uBB.element(bi), str = PA.w, reach = PB.w;
    // round the room in front of the walls (as the climbers' streams), from the wall's point to her hand; the flow runs at ~0.6 / s
    const u = fract(u0.add(uTime.mul(0.42).add(ra.mul(0.05))));
    const ea = PA.xz.sub(uEyeR.xz), eb = PB.xz.sub(uEyeR.xz), ang0 = atan(ea.y, ea.x), ang1 = atan(eb.y, eb.x);
    const dA0 = ang1.sub(ang0), dA = dA0.sub(floor(dA0.add(Math.PI).div(Math.PI * 2)).mul(Math.PI * 2));
    const bump = sin(u.mul(Math.PI));
    const rad = mix(mix(length(ea), length(eb), u), float(2.35), bump.mul(0.85));
    const ang = ang0.add(dA.mul(u.mul(u).mul(float(3).sub(u.mul(2)))));
    const py = mix(PA.y, PB.y, u).add(bump.mul(0.45));
    const jit = vec3(sin(uTime.mul(2.1).add(ra.mul(40))), cos(uTime.mul(1.7).add(rb.mul(33))), sin(uTime.mul(1.9).add(ra.mul(17).add(rb.mul(9))))).mul(float(0.025).add(bump.mul(0.07)));
    const pw = vec3(uEyeR.x.add(cos(ang).mul(rad)), py, uEyeR.z.add(sin(ang).mul(rad))).add(jit);
    const pv = cameraViewMatrix.mul(modelWorldMatrix.mul(vec4(pw, 1))), c0 = clipOf(pv);
    const d = ndcScale(pv, c0, float(0.006).add(rb.mul(0.007))), kq = max(float(1), uMinPt.div(d.y));
    const vis = str.mul(float(1).sub(smoothstep(reach.sub(0.06), reach, u))).mul(smoothstep(0.0, 0.05, u)).mul(float(1).sub(smoothstep(0.95, 1.0, u)));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = TSL.select(vis.greaterThan(0.002), vec4(c0.xy.add(cq.mul(d).mul(kq).mul(c0.w)), c0.z, c0.w), vec4(0, 0, 2, 1));
    const vQ = varying(cq), vV = varying(vis.div(kq.mul(kq).mul(0.6).add(0.4))), vR = varying(ra);
    const r2 = dot(vQ, vQ), twk = pow(sin(uTime.mul(vR.mul(3).add(1)).add(vR.mul(60))).mul(0.5).add(0.5), 6);
    m.colorNode = mix(tc(GOLD), vec3(1, 0.92, 0.75), twk.mul(0.5)).mul(float(1).sub(smoothstep(0.4, 1.0, r2))).mul(twk.mul(1.2).add(0.6)).mul(vV).mul(1.4).mul(uGlow);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; object.add(mesh);
  }

  // ================================================================================================== state
  const climbers = [];
  const charges = [];         // { stroke, wall, pos (room), t0, done, auto }
  const events = [];
  let pomT0 = -1, readyT = -1, chargedT = -1, charge = 0, lastHold = 0, autoW = -1;
  const pomP = new THREE.Vector3(0, -50, 0), handL = new THREE.Vector3(0, 6.5, 0);
  let time = 0, rise = 0, riseV = 0, slide = 2.5, completed = 0, topT = -1, aletaT = -1, endT = -1, doneSent = false, lastClimb = -99, firstT = -1, rondaBorn = 0;
  let reactiveOn = false; const tmpL = new THREE.Vector3();
  const invW = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
  const rr = rng(2024);
  const otherWalls = () => walls.map((_, i) => i).filter((i) => i !== TW);

  // a climber is born at a hand (wall wi, room point h): it forms behind the wall, its forward palm on the hand
  function makeClimber(wi, h, auto) {
    const slot = slots.find((s) => !s.who); if (!slot) return null;
    const enx = slot.tier === tiers.length - 1;
    const t = enx ? 4 : (rr() < 0.5 ? 2 : 3); if (!meshes[t]) return null;
    const W = walls[wi], bi = TYPES[t][0], hs = slot.hs, pl = reachPalm[bi];
    const yawO = Math.atan2(W.normal.x, W.normal.z), Xx = Math.cos(yawO), Xz = -Math.sin(yawO);
    const back = 0.012 + pl[2] * hs, oy = Math.max(-0.35, Math.min(0.25, h.y - pl[1] * hs));
    const Or = new THREE.Vector3(h.x - Xx * pl[0] * hs - W.normal.x * back, oy, h.z - Xz * pl[0] * hs - W.normal.z * back);   // room space
    const b = { type: t, slot, wall: wi, Or, O: new THREE.Vector3(), pos: new THREE.Vector3(), yaw: slot.yaw, yawO, hs, c: 0, travel: 0, born: 0, gone: 0, glow: 1, gold: 0,
      seed: rr(), state: 'form', t0: time, M: meshes[t], k: meshes[t].list.length, auto, climbT: 0, w: [0, 1, 0, 0], lean: 0, dy: 0 };
    slot.who = b; meshes[t].list.push(b); meshes[t].mesh.geometry.instanceCount = meshes[t].list.length; climbers.push(b);
    lastClimb = time; if (firstT < 0) firstT = time;
    return b;
  }
  // the landing: on the ronda's shoulders, on the near side (towards the eye), a little to one side
  // the landing (Beltrán 26-11: nobody lands and then slides or jumps to its place): the stream lands WHERE the climber will climb from —
// at its place's back, a little round the column (the spiral) and below it, on the hips / shoulders of the tier below — so what follows
// is only two short steps of the organic climb. The baixos land on their place on the ground. Its frame is the world's: it follows the rise.
const slotAng = (S) => (S.pos.distanceTo(tmpL.set(C.x, S.pos.y, C.z)) < 0.05 ? Math.atan2(N1.z, N1.x) : Math.atan2(S.pos.z - C.z, S.pos.x - C.x));
const landing = (b, out) => {
  const S = b.slot; if (S.tier === 0) return out.copy(S.pos);
  const a = slotAng(S) - (b.seed < 0.5 ? -1 : 1) * 0.45, r = Math.hypot(S.pos.x - C.x, S.pos.z - C.z) + 0.38;
  return out.set(C.x + Math.cos(a) * r, Math.max(0, S.pos.y - 1.05), C.z + Math.sin(a) * r);
};

  function writeInst(b) {
    const A = b.M.buf.array, o = b.k * 20, w = b.w;
    A[o] = b.pos.x; A[o + 1] = b.pos.y + (b.dy || 0); A[o + 2] = b.pos.z; A[o + 3] = b.hs;
    A[o + 4] = b.O.x; A[o + 5] = b.O.y; A[o + 6] = b.O.z; A[o + 7] = b.travel;
    A[o + 8] = 0; A[o + 9] = b.yaw; A[o + 10] = b.seed * 97; A[o + 11] = b.yawO;
    A[o + 12] = b.born; A[o + 13] = b.gone; A[o + 14] = b.glow; A[o + 15] = b.gold;
    A[o + 16] = w[1]; A[o + 17] = w[2]; A[o + 18] = w[3]; A[o + 19] = b.lean || 0;
  }

  const setW = (w, a, b2, c, d) => { w[0] = a; w[1] = b2; w[2] = c; w[3] = d; };
  const ease3 = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  // the way up, by the back of the tower in a spiral: steps from the landing to the place; each step = a foot up + a push.
  // Positions: angle round the tower and radius from it, and height (feet). Intermediate steps stand on the shoulders of each tier.
  function planClimb(b) {
    // two steps from the landing to the place: a foot on the hip below (half the height, half the turn), then onto the shoulders
    const S = b.slot, from = b.pos.clone(), r0 = Math.hypot(from.x - C.x, from.z - C.z), a0 = Math.atan2(from.z - C.z, from.x - C.x);
    const aS = slotAng(S), rS = Math.hypot(S.pos.x - C.x, S.pos.z - C.z);
    let dA = aS - a0; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
    const pts = [{ a: a0, r: r0, y: from.y }];
    if (S.tier > 0) {
      pts.push({ a: a0 + dA * 0.5, r: r0 + (rS - r0) * 0.45, y: from.y + (S.pos.y - from.y) * 0.5 });
      pts.push({ a: aS, r: rS, y: S.pos.y });
    }
    b.plan = pts; b.phase = 'steps';
  }
  function climbStep(b, t, p) {
    const S = b.slot, pts = b.plan, n = pts.length - 1, stepT = p.climbStep ?? 1.5, riseT = 1.15;
    const place = (q0, q1, k) => { const a = q0.a + (q1.a - q0.a) * k, r = q0.r + (q1.r - q0.r) * k; b.pos.set(C.x + Math.cos(a) * r, q0.y + (q1.y - q0.y) * k, C.z + Math.sin(a) * r); };
    if (t < n * stepT) {
      const i = Math.floor(t / stepT), u = (t - i * stepT) / stepT, q0 = pts[i], q1 = pts[i + 1], L = i % 2 === 0;
      // reach (0–0.38): a foot up on the thigh / hip below, a hand to the shoulder above · push (0.32–0.84): the body goes up with weight
      // (slow start, faster, slow end: ease in-out cubic), the step pose gives way to the pull · land (0.84–1): it gives a little
      const reach = smooth01(u / 0.38), push = ease3((u - 0.32) / 0.52), back = smooth01((u - 0.36) / 0.5);
      const ws = reach * (1 - back);
      setW(b.w, L ? ws : 0, L ? 0 : ws, 1 - ws, 0);
      place(q0, q1, push);
      b.dy = -0.03 * Math.sin(Math.PI * clamp01((u - 0.84) / 0.16)) + 0.04 * Math.sin(Math.PI * clamp01((u - 0.3) / 0.25)) * (1 - push);
      // the torso leads: it leans into the push before the body moves, and straightens as it arrives
      b.lean = 0.06 + 0.2 * Math.sin(Math.PI * clamp01((u - 0.22) / 0.55)) - 0.05 * reach * (1 - push);
      b.yaw = Math.atan2(C.x - b.pos.x, C.z - b.pos.z);
      return;
    }
    // the last: it rises from the pull to its stance (stand, or stays bent: acotxador, enxaneta), turning to its place's facing
    const v = clamp01((t - n * stepT) / riseT), k = ease3(v);
    if (n === 0) b.pos.copy(S.pos); else place(pts[n], pts[n], 1);
    const fin = S.final === 1 ? 0 : 1;
    setW(b.w, 0, 0, 1 - k * fin, k * fin);
    b.dy = 0.025 * Math.sin(Math.PI * v);
    b.lean = 0.18 * (1 - k) + 0.02;
    const yt = Math.atan2(C.x - b.pos.x, C.z - b.pos.z); b.yaw = yt + angDiff(yt, S.yaw) * k;
    if (v >= 1) { b.phase = 'done'; b.pos.copy(S.pos); b.yaw = S.yaw; }
  }

  const knownStrokes = new Set(), nowStrokes = new Set();
  const stampT = []; for (let i = 0; i < NSTAMP; i++) stampT.push({ t: -99, s: 0 });
  let stampI = 0; const lastStamp = new Map();

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
    uTime.value = time;
    uLight.value = p.light ?? 1; uGlow.value = p.glow ?? 1; uWarm.value = p.warm ?? 0.5; uFaixa.value = p.faixa === false ? 0 : 1; uBreath.value = p.breath ?? 1; uPlaza.value = p.plazaLight ?? 1; uPlazaSize.value = p.plazaSize ?? 1;
    uLeave.value = clamp01(input.leave ?? p.leave ?? 0); uArrive.value = clamp01(input.arrive ?? p.arrive ?? 1);
    if (!input.state && room.setBackground) room.setBackground({ bottom: [0.006, 0.006, 0.012], top: [0.012, 0.014, 0.026], gain: 1 });

    // ---- THE RISE: a critically damped spring to the feet of the next tier; the world comes in close as the part arrives
    // while it builds: the newest tier's people about eye level (we look at their shoulders, the next arriving above them);
    // with the enxaneta up we keep rising past her (topRise): the roofs of the square go down behind, she stands over them
    const topY0 = tiers[tiers.length - 1].y + tiers[tiers.length - 1].hs;
    const target = topT >= 0 ? topY0 + (p.topRise ?? 1.1) - room.eye.y : completed > 0 ? tiers[completed - 1].y * (p.riseK ?? 1) + 0.6 : 0;
    const w0 = 1.6;   // ≈ 2.5 s to settle
    riseV += (-(w0 * w0) * (rise - target) - 2 * w0 * riseV) * dt; rise += riseV * dt;
    slide += ((1 - uArrive.value) * 2.5 - slide) * Math.min(1, dt * 1.2);
    world.position.set(-N1.x * slide, -rise, -N1.z * slide);
    uRise.value = rise;
    if (backdrop) { backdrop.position.y = -rise * (p.plazaSink ?? 0.35); const cull = uLeave.value < 0.01; if (backdrop.userData.cull !== cull) { backdrop.userData.cull = cull; for (const m of backdrop.children) m.frustumCulled = cull; } }   // leaving, its points rise out of their sectors: no culling   // the square goes down behind a little faster than the tower (parallax): at the top its roofs are below us
    object.updateMatrixWorld(); invW.copy(world.matrixWorld).invert();
    uEyeL.value.copy(room.eye).applyMatrix4(invW);

    // ---- hands: the front wall stirs; the others charge a ring and, held ~1.7 s, make a climber
    const hands = input.hands || [];
    nowStrokes.clear();
    const holdT = p.hold ?? 1.7;
    for (const h of hands) {
      nowStrokes.add(h.stroke);
      if (h.wall === TW) {
        const ls = lastStamp.get(h.stroke);
        if (!ls || time - ls.t > 0.18 || ls.p.distanceTo(h.pos) > 0.18) {   // a stamp every 0.12 s or 12 cm: a wake that heals
          const st = stampT[stampI]; st.t = time; st.s = 1; STAMPS[stampI].set(h.pos.x, h.pos.y, h.pos.z, 1); stampI = (stampI + 1) % NSTAMP;
          lastStamp.set(h.stroke, { t: time, p: h.pos.clone() });
        }
        continue;
      }
      if (topT >= 0) continue;   // the tower is up: the walls' hands are for the golden points now
      let ch = charges.find((q) => q.stroke === h.stroke);
      if (!ch) { ch = { stroke: h.stroke, wall: h.wall, pos: h.pos.clone(), t0: time, done: false, seen: time, a: 0 }; charges.push(ch); }
      ch.seen = time;
      if (h.pos.distanceTo(ch.pos) > 0.35 && !ch.done) { ch.pos.copy(h.pos); ch.t0 = time; ch.wall = h.wall; }   // moved too far: it starts again
      if (!ch.done && time - ch.t0 >= holdT && endT < 0 && topT < 0) { ch.done = true; if (!makeClimber(h.wall, h.pos, false)) ch.full = true; }
    }
    for (const [k] of lastStamp) if (!nowStrokes.has(k)) lastStamp.delete(k);
    for (let i = 0; i < NSTAMP; i++) { const st = stampT[i]; const age = time - st.t; const s = age < 0.08 ? age / 0.08 : Math.exp(-(age - 0.08) / 0.5); STAMPS[i].w = age > 3 ? 0 : s * 0.7; }
    // charges: let go before the end → the ring empties
    for (let i = charges.length - 1; i >= 0; i--) { const ch = charges[i]; if (!nowStrokes.has(ch.stroke) && time - ch.seen > 0.35) { ch.gone = (ch.gone ?? 0) + dt; if (ch.gone > 0.6) charges.splice(i, 1); } }

    // ---- solo help: after a while with no new climber, the room calls one by itself (a ring charges on a wall without a hand)
    const assist = p.assist ?? 3.5;
    if (assist > 0 && topT < 0 && slots.some((s) => !s.who) && time > (p.assistDelay ?? 5) && time - lastClimb > assist) {
      if (!charges.some((q) => q.auto)) {
        const ws = otherWalls(), wi = ws[Math.floor(rr() * ws.length)], W = walls[wi];
        const pos = new THREE.Vector3().copy(W.centre).addScaledVector(W.right, (rr() - 0.5) * W.width * 0.5); pos.y = 1.1 + rr() * 0.4;
        charges.push({ stroke: 'auto' + time, auto: true, wall: wi, pos, t0: time, done: false, seen: time, a: 0 });
      }
    }
    for (const ch of charges) if (ch.auto) { ch.seen = time; if (!ch.done && time - ch.t0 >= holdT * 1.3) { ch.done = true; makeClimber(ch.wall, ch.pos, true); ch.stroke = null; } if (ch.done) ch.gone = (ch.gone ?? 0) + dt; }
    for (let i = charges.length - 1; i >= 0; i--) if (charges[i].auto && charges[i].gone > 0.6) charges.splice(i, 1);

    // ---- the ronda: formed out of the dust when the part arrives
    rondaBorn = Math.min(1, rondaBorn + dt / 2.6);
    for (const b of ronda) { b.born = clamp01((rondaBorn - b.delay * 0.3) / 0.7) * uArrive.value; b.pos.copy(b.O); b.travel = 1; }

    // ---- climbers: form at the hand → fly round the room → land on the ronda → climb → their place
    const formT = 0.95, flyT = p.flyTime ?? 2.8;
    for (const b of climbers) {
      const tt = time - b.t0, S = b.slot, T = tiers[S.tier];
      b.glow = Math.max(0, b.glow - dt / 3);
      if (b.state === 'form') {
        // it forms at the hand, its forward palm on the visitor's (step R), then lets go into the stream
        b.born = clamp01(tt / formT); b.travel = 0; setW(b.w, 0, 1, 0, 0); b.O.copy(b.Or).applyMatrix4(invW); landing(b, b.pos);
        if (tt >= formT + 0.25) { b.state = 'fly'; b.t1 = time; }
      } else if (b.state === 'fly') {
        // it re-forms where it lands hugging the shoulders it lands on (pull)
        b.O.copy(b.Or).applyMatrix4(invW);
        const below = S.tier === 0 || tiers[S.tier - 1].seated >= tiers[S.tier - 1].n;
        b.tf = (b.tf ?? 0) + (below || b.travel < 0.8 ? dt : 0);   // the tier below is not up yet: the stream hovers near the tower
        b.travel = Math.min(below ? 1 : 0.8, clamp01(b.tf / flyT)); landing(b, b.pos); b.yaw = Math.atan2(C.x - b.pos.x, C.z - b.pos.z);
        const k = smooth01((b.travel - 0.55) / 0.45); setW(b.w, 0, 1 - k, k, 0);
        if (b.travel >= 1) { b.state = 'climb'; b.t2 = time; planClimb(b); }
      } else if (b.state === 'climb') {
        climbStep(b, time - b.t2, p);
        if (b.phase === 'done') { b.state = 'settle'; b.t3 = time; T.seated++; events.push(`joined:${S.tier}`); b.glow = 0.8; }
      } else if (b.state === 'settle' || b.state === 'seated') {
        // it settles: a small give in the knees, a sway to find its balance, then it breathes (the shader's breath)
        const ts = time - (b.t3 ?? time);
        b.pos.copy(S.pos); b.yaw = S.yaw;
        b.dy = -0.035 * Math.exp(-ts * 3.2) * Math.cos(ts * 7.5) + 0.035 * Math.exp(-ts * 9);
        b.lean = 0.07 * Math.exp(-ts * 2.4) * Math.sin(ts * 5.2 + 0.6) + (S.final === 1 ? 0.04 : 0.02) * Math.sin(time * 0.9 + b.seed * 6) * smooth01(ts / 2);
        if (ts > 2.5) b.state = 'seated';
        if (b.type === 4 && pomT0 >= 0) { const k = smooth01((time - pomT0) / 0.9); setW(b.w, 0, 0, 1 - k, k); }
      }
    }
    // the TAA's reactive mask (drawn once more) only while a climber moves; settled ones keep their antialiasing for free
    const moving = climbers.some((b) => b.state === 'form' || b.state === 'fly' || b.state === 'climb');
    if (moving !== reactiveOn && room.reactive) { reactiveOn = moving; for (const t of [2, 3, 4]) if (meshes[t]) room.reactive(meshes[t].mesh, moving); }
    // tiers complete in order → the world sinks one step
    while (completed < tiers.length && tiers[completed].seated >= tiers[completed].n) { completed++; events.push(`tier:${completed}`); }
    if (completed >= tiers.length && topT < 0) { topT = time; events.push('top'); }

    // ---- the end, played by the room (Beltrán 26-11): the Pom's light rises up the column to the hand the enxaneta holds up and waits there,
    // beating · on the other three walls golden points invite · a hand held on one sends a beam of golden particles round the room to
    // her hand and charges it (several charge faster; let go, it cuts and the charge sinks slowly) · charged: l'aleta, the wave, the end
    const topY = tiers[tiers.length - 1].y + 1.0 * tiers[tiers.length - 1].hs;
    let pomY = -9;
    const enx = climbers.find((q) => q.type === 4 && (q.state === 'settle' || q.state === 'seated'));
    if (enx) handOf(enx, handL);
    if (topT >= 0 && p.end !== false && pomT0 < 0) pomT0 = time + 1.2;
    if (pomT0 >= 0) {
      const tp = (time - pomT0) / (p.pomTime ?? 3);
      if (tp >= 0) {
        pomY = smooth01(tp) * handL.y;
        const k = smooth01((tp - 0.82) / 0.18);
        pomP.set(C.x + (handL.x - C.x) * k, Math.min(pomY, handL.y), C.z + (handL.z - C.z) * k);
        if (tp >= 1 && readyT < 0) { readyT = time; lastHold = time; events.push('aleta:ready'); }
      }
    }
    // the beams: one per other wall, from its golden point; held → strength up, let go → down
    const ow = otherWalls();
    let rate = 0;
    if (readyT >= 0 && chargedT < 0) {
      for (let i = 0; i < ow.length && i < NB; i++) {
        const W = walls[ow[i]]; goldAt(ow[i], tmpV);
        let held = false;
        for (const h of hands) if (h.wall === ow[i] && h.pos.distanceTo(tmpV) < (p.goldReach ?? 0.55)) held = true;
        if (held) { lastHold = time; autoW = -1; }
        if (!held && autoW === ow[i]) held = true;
        beams[i].on = held; beams[i].wall = ow[i]; beams[i].from.copy(tmpV).addScaledVector(W.normal, -0.01);
      }
      if (autoW < 0 && time - lastHold > (p.chargeAssist ?? 10)) autoW = ow[Math.floor(rr() * ow.length)];
      for (const B of beams) { B.k += ((B.on ? 1 : 0) - B.k) * Math.min(1, dt * (B.on ? 6 : 2.5)); B.reach = B.on ? Math.min(1, B.reach + dt / 0.9) : B.k < 0.02 ? 0 : B.reach; rate += B.k * smooth01(B.reach * 1.4 - 0.3); }
      const solo = p.chargeTime ?? 4.5;
      if (rate > 0.02) charge = Math.min(1, charge + dt * Math.min(2.4, rate) / solo); else charge = Math.max(0, charge - dt * 0.06);
      if (charge >= 1) { chargedT = time; events.push('aleta:charged'); }
    } else for (const B of beams) { B.k = Math.max(0, B.k - dt * 1.5); }
    if (chargedT >= 0 && aletaT < 0 && time - chargedT > 0.35) { aletaT = time; events.push('aleta'); }
    if (aletaT >= 0) { const tw = time - aletaT; const top = tmpV.copy(C).setY(0); top.applyMatrix4(world.matrixWorld); uWave.value.set(top.x, 0, top.z, tw * (p.waveSpeed ?? 5)); if (tw > 2.4 && endT < 0) { endT = time; events.push('end'); } }
    // the light in her hand: it beats, waiting; it grows and brightens with the charge; at l'aleta it flares and goes with the wave
    {
      const on = pomT0 >= 0 && time > pomT0 && endT < 0 ? 1 : endT >= 0 ? Math.max(0, 1 - (time - endT) / 2) : 0;
      const beat = 0.5 + 0.5 * Math.sin(time * (2.2 + 3 * charge));
      const flare = aletaT >= 0 ? Math.exp(-(time - aletaT) * 1.2) * 1.5 : 0;
      pomU.value.set(pomP.x, pomP.y, pomP.z, on);
      pomV.value.set(0.05 + 0.13 * charge + 0.04 * beat * (readyT >= 0 ? 1 : 0.3) + flare * 0.25, (0.55 + 0.45 * beat) * (0.6 + 1.4 * charge) + flare, 0, 0);
      // beams in the room's frame: from the wall's point to the hand
      world.updateMatrixWorld(); tmpW.copy(pomP).applyMatrix4(world.matrix);   // the part's frame (the beams hang from `object`)
      for (let i = 0; i < NB; i++) { const B = beams[i]; BA[i].set(B.from.x, B.from.y, B.from.z, B.k * (chargedT >= 0 ? Math.max(0, 1 - (time - chargedT) * 2) : 1)); BB[i].set(tmpW.x, tmpW.y, tmpW.z, B.reach); }
    }
    const endDur = p.endTime ?? 6;
    const goneAll = endT >= 0 ? clamp01((time - endT) / endDur) : 0;
    if (endT >= 0 && !doneSent && time - endT > endDur + 0.5) { doneSent = true; events.push('done'); }
    for (const b of [...ronda, ...climbers]) {
      const yb = (b.pos.y + 1.1 * b.hs);
      const g = pomY > -5 ? Math.exp(-(((yb - pomY) / 0.55) ** 2)) + (yb < pomY ? 0.22 : 0) : 0;
      b.gold += (g - b.gold) * Math.min(1, dt * 6);
      if (b.type === 4 && aletaT >= 0) b.gold = Math.max(b.gold, 1.2 * Math.exp(-(time - aletaT) / 3));
      b.gone = clamp01((goneAll * 1.4 - (b.pos.y / (topY + 1)) * 0.4));
      writeInst(b);
    }
    for (const M of meshes) if (M && M.list.length) M.buf.needsUpdate = true;
    if (aletaT < 0) uWave.value.w = -1;

    // ---- rings: an invitation at each other wall's centre (while there are places), and a charge under every held hand
    const A = rA.array; let ri = 0;
    const open = slots.some((s) => !s.who) && topT < 0;
    for (const wi of otherWalls()) {
      if (ri >= NRING) break; const W = walls[wi], o = ri * 8;
      const busy = charges.some((q) => q.wall === wi && !q.done);
      A[o] = W.centre.x + W.normal.x * 0.0; A[o + 1] = 1.2; A[o + 2] = W.centre.z; A[o + 3] = open && !busy ? 1 : 0;
      A[o + 4] = W.right.x; A[o + 5] = W.right.z; A[o + 6] = -1; A[o + 7] = 0.36; ri++;
    }
    for (const ch of charges) {
      if (ri >= NRING) break; const W = walls[ch.wall], o = ri * 8;
      const prog = ch.done ? 1 : clamp01((time - ch.t0) / (holdT * (ch.auto ? 1.3 : 1)));
      ch.a = ch.gone ? Math.max(0, 1 - ch.gone / 0.6) : Math.min(1, ch.a + dt * 10);
      A[o] = ch.pos.x - W.normal.x * 0.005; A[o + 1] = ch.pos.y; A[o + 2] = ch.pos.z - W.normal.z * 0.005; A[o + 3] = ch.a * (ch.full ? 0.3 : 1) * (ch.auto ? 0.7 : 1);
      A[o + 4] = W.right.x; A[o + 5] = W.right.z; A[o + 6] = Math.max(0.001, prog); A[o + 7] = 0.24; ri++;
    }
    // the golden points: Ø 40 cm at 1.2 m on each other wall, waiting with her; the ring fills with the charge while held
    if (readyT >= 0) for (let i = 0; i < ow.length && ri < NRING; i++) {
      const W = walls[ow[i]], o = ri * 8, B = beams[i]; goldAt(ow[i], tmpV);
      const a = clamp01((time - readyT) / 1.2) * (chargedT >= 0 ? Math.max(0, 1 - (time - chargedT) / 1.5) : 1);
      A[o] = tmpV.x - W.normal.x * 0.005; A[o + 1] = tmpV.y; A[o + 2] = tmpV.z - W.normal.z * 0.005; A[o + 3] = a;
      A[o + 4] = W.right.x; A[o + 5] = W.right.z; A[o + 6] = B && B.k > 0.05 ? Math.max(0.001, charge) : -1; A[o + 7] = -0.2; ri++;
    }
    for (; ri < NRING; ri++) A[ri * 8 + 3] = 0;
    rA.ib.needsUpdate = true;
    // ---- the ruler: on P1's plane beside the column; marks slide down as we rise (each at the height its tier is seen on the wall)
    {
      const W = walls[TW], eye = room.eye;
      const dW = Math.max(0.5, -(W.centre.x - eye.x) * W.normal.x - (W.centre.z - eye.z) * W.normal.z);
      const dT = Math.max(dW + 0.5, -(C.x - eye.x) * N1.x - (C.z - eye.z) * N1.z + slide), sc = dW / dT;
      const want = completed >= 1 && endT < 0 && (p.ruler ?? true) ? 1 : 0;
      rulE += (want - rulE) * Math.min(1, dt * (want ? 0.8 : 1.6)); rulK.value = rulE * uArrive.value;
      ruler.visible = rulE > 0.003;
      if (ruler.visible) {
        ruler.position.copy(W.centre).addScaledVector(W.right, RUL_X).addScaledVector(W.normal, -0.02); ruler.position.y = 0;
        ruler.rotation.set(0, Math.atan2(W.normal.x, W.normal.z), 0);
        rLine.position.y = 0.2; rLine.scale.y = Math.min(3.4, W.height - 0.35);
        const toWall = (y) => eye.y + (y - rise - eye.y) * sc;
        let lastY = 1e9;   // names ≥ 0.13 m apart on the wall: from the top down, a crowded lower name is left out (its mark stays)
        for (let k = NLAB - 1; k >= 0; k--) {
          const on = k < tiers.length; const y = on ? toWall(markY(k)) : -9, vis = on && y > 0.25 && y < W.height - 0.3;
          rTicks[k].visible = rLabs[k].visible = vis; if (!vis) continue;
          rTicks[k].position.set(0, y, 0); rLabs[k].position.y = y;
          if (lastY - y < 0.13 || Math.abs(y - eye.y) < 0.09) rLabs[k].visible = false; else lastY = y;
          const T = tiers[k], closed = T.seated >= T.n, forming = !closed && k === completed;
          const wantK = closed ? 0.95 : forming ? 0.42 + 0.12 * Math.sin(time * 2.4) : 0.22;
          labE[k] += (wantK - labE[k]) * Math.min(1, dt * 4); labK[k].value = labE[k];
        }
        liveTick.position.set(0, eye.y, 0); liveLab.position.y = eye.y;
        drawLive(eye.y + rise);
      }
    }
    knownStrokes.clear(); for (const k of nowStrokes) knownStrokes.add(k);
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999;
  }
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function reset() {
    for (const b of climbers) { const M = b.M; M.list.splice(M.list.indexOf(b), 1); }
    for (const M of meshes) if (M) { M.list.forEach((b, k) => { b.k = k; }); M.mesh.geometry.instanceCount = M.list.length; }
    climbers.length = 0; charges.length = 0; for (const s of slots) s.who = null; for (const T of tiers) T.seated = 0;
    pomT0 = -1; readyT = -1; chargedT = -1; charge = 0; autoW = -1; for (const B of beams) { B.k = 0; B.reach = 0; B.on = false; }
    completed = 0; topT = -1; aletaT = -1; endT = -1; doneSent = false; lastClimb = time; firstT = -1; rondaBorn = 0; riseV = 0;
  }
  function finish() { P.end = true; }
  function progress() {
    const needed = slots.length, seated = climbers.filter((b) => b.state === 'seated' || b.state === 'settle').length;
    return { tier: completed, tiers: tiers.length, climbers: seated, inFlight: climbers.length - seated, needed, height: +rise.toFixed(2),
      ending: endT >= 0 ? clamp01((time - endT) / (P.endTime ?? 6)) : 0, done: doneSent, charge: +charge.toFixed(3), ready: readyT >= 0 };
  }
  function setParams(p) { if (p && p.tiers != null && String(p.tiers) !== String(P.__tiersBuilt ?? '')) { /* tiers change on reset */ } }
  function dispose() { beingMat.dispose(); jobs.length = 0; for (const M of meshes) if (M) M.mesh.geometry.dispose(); if (backdrop) { for (const m of backdrop.children) m.geometry.dispose(); backdropMat?.dispose(); } }
  if (typeof window !== 'undefined') window.__torre3d = { progress, reset, climbers, ronda, slots, tiers, events, get readyMs() { return readyMs; }, make: (wi, x, y) => { const W = walls[wi]; const h = new THREE.Vector3().copy(W.centre).addScaledVector(W.right, x); h.y = y; return !!makeClimber(wi, h, false); }, TW: () => TW };
  return { object, update, setParams, dispose, progress, reset, events, setBackdrop, finish };
}
