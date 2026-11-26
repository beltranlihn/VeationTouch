// Ressonància — part «pinya3d2»: chapter II, Pinya · Força, v2 (contract: ../PARTS.md). Brief: Beltrán via the director, 26-11.
//
// The room starts in a dark of cold, almost colourless particles. Every hand that lands calls a BEING of points out of that dust,
// right behind the wall where it touched: it assembles in ~1.5 s (the palm first: <100 ms a glow in the palm), stands 0.4 m behind
// the wall plane and PUSHES, its palm on the wall at the height of the hand — a mirror of the visitor. Another hand elsewhere calls
// another. Side by side, their hands are joined by a pale STRIP (the first row of a pinya). A hand where a being already stands calls
// one BEHIND it, pushing its back; a held hand keeps calling them (the group grows from the hand), and once the room has started,
// beings come out of the dark by themselves near the groups (the solo path).
// The aim is to FILL THE ROOM. A fine RED THREAD forms where a stretch of the perimeter has enough beings, joins the groups as the room
// fills (the gaps it may bridge grow with the fill), and closes round the room. The light warms from cold blue-grey to a soft red
// with the fill. When the room is full the beings let go into particles that rise and drift apart, calmly: the way out.
//
// Progress for the host / score / sound: part.fill() → { total, walls[4], full, threadCover, beings, ending, done }.
// part.events (this frame): 'born:<wall>:<u>:<y>:<row>', 'thread:join', 'full', 'end', 'done'.
// Study (no input.state): params in res-3d-study/parts/pinya3d2.json. Hands by `stroke`; the sensor may drop one (held 0.35 s).
import { bakeBodyGen, pose, rng, V } from './pinya3d/body.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------- bodies and poses
// a body faces +z (the room); the wall is in front of it at body-local z ≈ ZW. Poses: push low · push high · push the back in front
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const ZW = 0.46;
const POSES = [
  // 0 · push low: the weight forward, head down between the arms, one foot back
  { lean: 0.3, hunch: 0.14, head: 0.32, feet: [V(0.12, 0.07, 0.14), V(-0.11, 0.07, -0.2)], hands: [V(0.2, 0.9, ZW - 0.04), V(-0.18, 0.94, ZW - 0.04)],
    hf: [{ fd: [0.15, 1, 0], pn: [0, 0, 1] }, { fd: [-0.15, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.55) },
  // 1 · push high: upright, arms up, palms flat on the wall
  { lean: 0.14, hunch: 0.06, head: 0.22, feet: [V(0.12, 0.07, 0.12), V(-0.11, 0.07, -0.14)], hands: [V(0.2, 1.6, ZW - 0.02), V(-0.18, 1.65, ZW - 0.02)],
    hf: [{ fd: [0.12, 1, 0], pn: [0, 0, 1] }, { fd: [-0.12, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.6) },
  // 2 · both hands flat on the back of the one in front, head down, pushing (the rows behind)
  { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.12, 0.07, -0.1), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)],
    hf: [{ fd: [0, 0.5, 0.2], pn: [0, 0, 1] }, { fd: [0, 0.5, 0.2], pn: [0, 0, 1] }], elbow: V(0, -1, -0.2) },
];
const NPT_F = 2600, NPT_B = 1500;   // points per body: the front row (seen close) · the rows behind
const COL = 0.56, ROW = 0.6;        // column spacing along the wall · row spacing behind
const D0 = 0.012;                   // the palm sits this far behind the wall plane

// palms (body-local, build scale 1) per pose: right = the anchor (meets the visitor's hand), left = the neighbour's side
function palmsOf(B) {
  return POSES.map((sp) => { const k = pose(sp, B); const at = (w, f) => [w[0] + f.fd[0] * 0.05 * k.s + f.pn[0] * 0.019 * k.s, w[1] + f.fd[1] * 0.05 * k.s + f.pn[1] * 0.019 * k.s, w[2] + f.fd[2] * 0.05 * k.s + f.pn[2] * 0.019 * k.s];
    return { R: at(k.wR, k.hfR), L: at(k.wL, k.hfL) }; });
}

export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, vec2, vec3, vec4, float, clamp, mix, smoothstep, sin, cos, max, min, abs, normalize, varying, fract,
    cameraPosition, cameraProjectionMatrix, modelViewMatrix, modelWorldMatrix, dot, exp, pow, length } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'pinya3d2';
  const walls = room.walls, NW = walls.length;
  const H = room.strip?.height || 912;
  const uTime = uniform(0), uLeave = uniform(0), uArrive = uniform(1), uWarm = uniform(0), uLight = uniform(1), uGlow = uniform(1), uBreath = uniform(1);
  const uMinPt = uniform(1.0 * 2 / H), uMinFb = uniform(0.9 * 2 / H);
  const WH = walls[0]?.height || 3.75;
  // the guide's words (1.72–2.3 m at each wall centre) stay readable: points dim there (a wall's own view = the NDC square)
  const uBand = uniform(new THREE.Vector4(2 * 1.72 / WH - 1, 2 * 2.3 / WH - 1, 0.48, 0.5));
  const calmOf = (ndc) => smoothstep(uBand.x.sub(0.08), uBand.x, ndc.y).mul(float(1).sub(smoothstep(uBand.y, uBand.y.add(0.08), ndc.y)))
    .mul(float(1).sub(smoothstep(uBand.z, uBand.z.add(0.09), abs(ndc.x)))).mul(uBand.w);
  const clipOf = (pv) => cameraProjectionMatrix.mul(pv);
  const ndcScale = (pv, c0, size) => { const c1 = clipOf(vec4(pv.xy.add(vec2(size, size)), pv.z, 1)); return abs(c1.xy.div(c1.w).sub(c0.xy.div(c0.w))).add(1e-7); };
  const tc = (c) => vec3(c[0], c[1], c[2]);
  // the colour script: cold blue-grey → a soft reddish light (linear RGB)
  const COLD = [0.34, 0.42, 0.56], WARM = [1.0, 0.36, 0.26], RED = [0.85, 0.05, 0.035], BONE = [0.87, 0.78, 0.7];

  // ---- perimeter: s (m) along the walls in strip order, continuous round the room (P3 → P4 has no seam)
  const offs = []; let PER = 0; for (const w of walls) { offs.push(PER); PER += w.width; }
  const wrapS = (s) => ((s % PER) + PER) % PER;
  const dS = (a, b) => { let d = (b - a) % PER; if (d > PER / 2) d -= PER; if (d < -PER / 2) d += PER; return d; };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  // a point on wall w at x (m from its centre), height y, `back` m behind the plane
  const wallAt = (w, x, y, back, out) => { const W = walls[w]; return out.set(W.centre.x + W.right.x * x - W.normal.x * back, y, W.centre.z + W.right.z * x - W.normal.z * back); };

  // ================================================================================================== the beings: point clouds
  const instBuf = (count) => { const b = new THREE.InstancedInterleavedBuffer(new Float32Array(count * 16), 16, 1); b.setUsage(THREE.DynamicDrawUsage); return b; };
  // one interleaved buffer per body type (34 floats per corner), quads of 4 corners
  function pointType(body, seed, n) {
    const r = rng(seed), F = 34, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) {
      let v = Math.floor(r() * body.n);
      // the detailed hands are meshed on a finer grid: thin their vertices out so a hand is not a solid blot
      for (let t = 0; t < 6 && body.aAux2[v * 4 + 1] === 1 && body.aAux2[v * 4] > 0.89 && r() > 0.22; t++) v = Math.floor(r() * body.n);
      const rnd = r(), rnd2 = r();
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
    return { at, index: new THREE.BufferAttribute(idx, 1), n };
  }
  function makeGeo(va, inst, sphere) {
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(va.at)) g.setAttribute(k, a);
    g.setIndex(va.index);
    for (let i = 0; i < 4; i++) g.setAttribute('i' + i, new THREE.InterleavedBufferAttribute(inst, 4, i * 4));
    g.instanceCount = 0;
    g.boundingSphere = sphere;
    return g;
  }

  // per instance (16 floats): i0 = (x, y, z, height) · i1 = (pose height 0..1, row 0/1, born 0..1, glow) · i2 = (seed, phase, lean, yaw)
  //                           i3 = (gone 0..1, width, born flash, contact)
  function pointMaterial() {
    const pA = attribute('position', 'vec3'), pB = attribute('pB', 'vec3'), pC = attribute('pC', 'vec3'), nA = attribute('nA', 'vec3'), nB = attribute('nB', 'vec3'), nC = attribute('nC', 'vec3');
    const aux = attribute('aAux', 'vec4'), aux2 = attribute('aAux2', 'vec4'), co = attribute('aCo', 'vec4'), sh = attribute('aSh', 'vec4');
    const i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4');
    const hp = i1.x, row = i1.y, born = i1.z, seed = i2.x, phase = i2.y, lean = i2.z, yaw = i2.w, gone = i3.x;
    let p = mix(mix(pA, pB, hp), pC, row);
    const n = normalize(mix(mix(nA, nB, hp), nC, row));
    // breath (10 s, the same body of the room) and the push: the rows behind lean their whole weight into the back in front
    const bt = fract(uTime.add(phase).div(9)), br = smoothstep(0.0, 0.45, bt).mul(float(1).sub(smoothstep(0.45, 1.0, bt))).mul(uBreath);
    p = p.add(n.mul(aux.y.mul(br).mul(0.012))).add(vec3(0, aux.y.mul(br).mul(0.007), 0));
    p = p.add(vec3(0, p.y.mul(lean).mul(lean).mul(-0.03), p.y.mul(lean).mul(0.24)));
    // birth: the points come in out of the dust — the palm first (aAux.w = distance from the right palm), the feet last
    const r1 = fract(co.z.mul(17.23).add(seed)), r2 = fract(co.w.mul(41.71).add(seed.mul(0.7))), r3 = fract(co.z.mul(73.13).add(co.w.mul(5.1)));
    const order = clamp(aux.w.mul(0.42), 0, 0.75).mul(float(1).sub(row.mul(0.6))).add(r1.mul(0.25));
    const e0 = clamp(born.mul(1.0 + 0.75 + 0.25).sub(order).div(0.75), 0, 1), e = e0.mul(e0).mul(float(3).sub(e0.mul(2)));
    const scat = normalize(vec3(r1.sub(0.5).mul(1.2), r2.sub(0.55), r3.sub(0.85)).add(vec3(0, 0.001, 0))).mul(r2.mul(0.9).add(0.25));   // out of the dust behind and below it
    const swirl = vec3(sin(uTime.mul(0.4).add(r1.mul(30))), cos(uTime.mul(0.33).add(r2.mul(20))).mul(0.5), cos(uTime.mul(0.37).add(r3.mul(25)))).mul(0.12);
    p = p.add(scat.add(swirl).mul(float(1).sub(e)));
    // gone (the end, or the host's leave): the being lets go into particles that rise and drift apart, turning
    const g0 = clamp(max(gone, uLeave).mul(1.6).sub(r3.mul(0.35)).sub(clamp(float(1).sub(p.y.div(1.8)), 0, 1).mul(0.25)), 0, 1);
    const drift = vec3(r1.sub(0.5).mul(1.3).add(sin(uTime.mul(0.5).add(r2.mul(40))).mul(0.15).mul(g0)), g0.mul(g0).mul(r2.mul(2.4).add(1.2)).add(g0.mul(0.25)), r3.sub(0.65).mul(1.2)).mul(g0);
    p = p.add(drift);
    // the host's arrive (a being that already stands when the part comes in): out of the dust as at birth
    p = p.add(scat.mul(float(1).sub(uArrive)).mul(1.4));
    // instance transform
    const cy = cos(yaw), sy = sin(yaw), hs = i0.w, ws = i3.y;
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const ps = vec3(p.x.mul(ws), p.y, p.z.mul(ws)).mul(hs);
    const local = X.mul(ps.x).add(vec3(0, ps.y, 0)).add(F.mul(ps.z)).add(i0.xyz);
    const nl = X.mul(n.x).add(vec3(0, n.y, 0)).add(F.mul(n.z));
    const pv = modelViewMatrix.mul(vec4(local, 1)), c0 = clipOf(pv);
    const size = float(0.0042).add(co.z.mul(0.0045)).mul(float(1).sub(e).mul(0.8).add(1)).mul(float(1).sub(g0.mul(0.55)));
    const d = ndcScale(pv, c0, size), k = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w);
    const vN = varying(modelWorldMatrix.mul(vec4(nl, 0)).xyz), vP = varying(modelWorldMatrix.mul(vec4(local, 1)).xyz);
    const vCo = varying(co), vNdc = varying(c0.xy.div(c0.w));
    const vA = varying(vec4(e, g0, float(1).div(k.mul(k)), clamp(p.y.div(1.7), 0, 1)));
    const vB = varying(vec4(i1.w, i3.z, i3.w, row)), vC = varying(vec4(aux2.x, aux2.y, aux.w, sh.w));
    const q = vCo.xy; m.opacityNode = float(1).sub(smoothstep(0.999, 1.001, dot(q, q))); m.alphaTest = 0.5;
    // light: the silhouette catches it (rim), soft ambient occlusion, the legs sink into the dark, the rows behind are dimmer
    const N = normalize(vN), Vd = normalize(cameraPosition.sub(vP));
    const rim = pow(float(1).sub(abs(dot(N, Vd))), 2.2);
    const ao = vC.x.mul(0.6).add(0.4), low = smoothstep(0.02, 0.75, vA.w).mul(0.85).add(0.15);
    const warm = clamp(uWarm, 0, 1);
    const base = mix(tc(COLD), tc(WARM), min(warm.mul(warm.mul(-0.4).add(1.2)), 1)).mul(mix(float(0.75), float(1.15), vCo.z));
    const rowK = mix(float(1), float(0.55), vB.w);
    let col = base.mul(float(0.26).mul(rim.mul(1.9).add(0.28)).mul(ao).mul(low).mul(rowK).mul(uLight).mul(warm.mul(0.5).add(0.8)));
    const twk = pow(sin(uTime.mul(vCo.z.mul(2.2).add(0.5)).add(vCo.w.mul(60))).mul(0.5).add(0.5), 28);
    col = col.mul(twk.mul(2.2).add(1));
    // the hand's answer: the palm that meets the visitor glows (contact), the newborn being shines and settles (born flash)
    const palmK = exp(vC.z.mul(vC.z).mul(-14)), contact = vB.z.mul(palmK.mul(0.55).add(rim.mul(0.12)));
    const flashC = vB.y.mul(rim.mul(0.6).add(0.25)).mul(0.55);
    const glowC = mix(vec3(0.75, 0.85, 1.0), tc(WARM), warm.mul(0.7).add(0.3));
    col = col.add(glowC.mul(contact.add(flashC).add(vB.x.mul(rim).mul(0.35))).mul(uGlow).mul(0.5));
    // assembling and dissolving points are motes of light: brighter, cooler, then thin out
    const mote = float(1).sub(vA.x).add(vA.y.mul(0.8));
    col = col.add(mix(tc(COLD), glowC, warm).mul(mote.mul(twk.mul(0.6).add(0.05)).mul(0.25)));
    const fade = smoothstep(0.0, 0.25, vA.x).mul(float(1).sub(smoothstep(0.5, 1.0, vA.y)));
    col = col.mul(float(1).sub(calmOf(vNdc)));
    m.colorNode = col.mul(fade).mul(vA.z.mul(0.5).add(0.5));
    m.fog = false;
    return m;
  }

  // ---- slots: columns along every wall × rows behind (capacity); beings take them as hands call them
  const ROWS = 4;
  const cols = walls.map((w) => { const n = Math.max(1, Math.floor((w.width - 0.5) / COL) + 1), x0 = -((n - 1) * COL) / 2; return Array.from({ length: n }, (_, j) => x0 + j * COL); });
  const beings = [];      // { wall, col, row, x, y (palm height, front), s, born, gone, type, seed, ... }
  const grid = cols.map((c) => c.map(() => new Array(ROWS).fill(null)));
  const meshes = [];      // [type][wall][front 0 / back 1] → { mesh, buf, list }
  const types = [];
  let palms = [];
  const ptMat = pointMaterial();
  const jobs = [];
  const tCreate = performance.now(); let readyMs = 0;
  for (let t = 0; t < 2; t++) {
    jobs.push({ gen: bakeBodyGen(BUILDS[t], REST, POSES, { grid: 0.022, detail: true, seed: 31 + t * 9, shards: 24 }), done: (body) => {
      types[t] = { front: pointType(body, 900 + t, NPT_F), back: pointType(body, 950 + t, NPT_B) };
      meshes[t] = walls.map((w, wi) => {
        const cen = new THREE.Vector3(); wallAt(wi, 0, 1.4, 1.3, cen);
        const sphere = new THREE.Sphere(cen, w.width / 2 + 2.6);
        return [0, 1].map((b) => {
          const cap = cols[wi].length * (b ? ROWS - 1 : 1), buf = instBuf(cap);
          const mesh = new THREE.Mesh(makeGeo(b ? types[t].back : types[t].front, buf, sphere), ptMat);
          mesh.renderOrder = 2; object.add(mesh);
          return { mesh, buf, list: [], cap };
        });
      });
    } });
  }
  palms = BUILDS.map(palmsOf);

  // ================================================================================================== the flash in the palm (< 100 ms)
  const NG = 16;
  const gA = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4); gA.setUsage(THREE.DynamicDrawUsage);
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  gGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  gGeo.setIndex([0, 1, 2, 0, 2, 3]); gGeo.setAttribute('g0', gA); gGeo.instanceCount = NG;
  {
    const g0 = attribute('g0', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(g0.xyz, 1));
    m.vertexNode = TSL.select(g0.w.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(TSL.positionGeometry.xy.mul(0.2)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const dd = TSL.uv().sub(0.5).mul(2), r2 = dot(dd, dd);
    const gc = mix(vec3(0.7, 0.82, 1.0), tc(WARM), uWarm.mul(0.8).add(0.1));
    m.colorNode = mix(gc, vec3(1, 0.95, 0.9), exp(r2.mul(-60))).mul(exp(r2.mul(-9)).mul(0.22).add(exp(r2.mul(-45)).mul(0.5))).mul(g0.w).mul(uGlow).mul(float(1).sub(uLeave));
    m.fog = false;
    const gm = new THREE.Mesh(gGeo, m); gm.frustumCulled = false; gm.renderOrder = 6; object.add(gm);
  }

  // ================================================================================================== ribbons (strip and thread)
  // a ribbon in clip space: centre c0, direction from the view-space tangent, half width `wid` (world), side ±1, never < 1 px
  function ribbon(pv, tv, wid, side, minNdc) {
    const c0 = clipOf(pv), ct = clipOf(vec4(pv.xyz.add(tv.mul(0.05)), 1));
    const d = ndcScale(pv, c0, wid), dir = ct.xy.div(ct.w).sub(c0.xy.div(c0.w)).div(d);
    const dn = dir.div(length(dir).add(1e-6)), perp = vec2(dn.y.negate(), dn.x);
    const k = max(float(1), minNdc.div(d.y));
    return { pos: vec4(c0.xy.add(perp.mul(d).mul(k).mul(side).mul(c0.w)), c0.z, c0.w), k };
  }
  // a dynamic polyline buffer: per vertex (pos xyz, tangent xyz, t, side, a, b) — 10 floats, 2 vertices per sample
  function lineBuffer(nLines, nSamp) {
    const F = 10, nv = nLines * nSamp * 2, A = new Float32Array(nv * F), idx = [];
    for (let l = 0; l < nLines; l++) for (let j = 0; j < nSamp - 1; j++) { const a = (l * nSamp + j) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    for (let l = 0; l < nLines; l++) for (let j = 0; j < nSamp; j++) for (let sd = 0; sd < 2; sd++) { const o = ((l * nSamp + j) * 2 + sd) * F; A[o + 6] = j / (nSamp - 1); A[o + 7] = sd ? 1 : -1; A[o + 1] = -50; }
    const ib = new THREE.InterleavedBuffer(A, F); ib.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aT', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('aF', new THREE.InterleavedBufferAttribute(ib, 4, 6));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return { g, A, ib, F, nSamp };
  }
  const setV = (L, l, j, p, tg, a, b) => { for (let sd = 0; sd < 2; sd++) { const o = ((l * L.nSamp + j) * 2 + sd) * L.F; L.A[o] = p.x; L.A[o + 1] = p.y; L.A[o + 2] = p.z; L.A[o + 3] = tg.x; L.A[o + 4] = tg.y; L.A[o + 5] = tg.z; L.A[o + 8] = a; L.A[o + 9] = b; } };

  // ---- the strip: palm to palm between neighbours of the first row (pale, on the wall plane); across a corner it bends at the corner
  const NSTRIP = 64, SS = 14, STRANDS = 2;
  const strip = lineBuffer(NSTRIP * STRANDS, SS);
  {
    const pos = attribute('position', 'vec3'), tg = attribute('aT', 'vec3'), aF = attribute('aF', 'vec4');
    const t = aF.x, side = aF.y, grow = aF.z, rnd = aF.w;
    const pv = modelViewMatrix.mul(vec4(pos, 1)), tv = modelViewMatrix.mul(vec4(tg, 0)).xyz;
    const rb = ribbon(pv, tv, float(0.0022), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = rb.pos;
    // it grows from both palms towards the middle
    const fromEnd = float(1).sub(abs(t.mul(2).sub(1))), vis = float(1).sub(smoothstep(grow.sub(0.04), grow, fromEnd));
    const vT = varying(t), vS = varying(side), vA = varying(vis.div(rb.k)), vR = varying(rnd), vNdc = varying(rb.pos.xy.div(rb.pos.w));
    const flow = pow(sin(vT.mul(11).sub(uTime.mul(0.9)).add(vR.mul(17))).mul(0.5).add(0.5), 4);
    const c = mix(tc(BONE), tc(WARM), uWarm.mul(0.6)).mul(flow.mul(0.3).add(0.22));
    m.colorNode = c.mul(float(1).sub(vS.mul(vS))).mul(vA).mul(uLight).mul(float(1).sub(uLeave)).mul(float(1).sub(calmOf(vNdc).mul(0.6)));
    m.fog = false;
    const mesh = new THREE.Mesh(strip.g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; object.add(mesh);
  }

  // ---- the red thread: three fine strands twisted round a line woven through the crowd (0.95 m behind the walls, at the waists),
  // round the whole room; per vertex `cov` = how much of it exists there (it grows from the dense stretches outwards)
  const NS = 384;                                  // samples of the perimeter (≈ 7 cm)
  const dens = new Float32Array(NS), cov = new Float32Array(NS), target = new Uint8Array(NS);
  const TH_STR = 3, TH_N = NS + 1;
  const thread = lineBuffer(TH_STR, TH_N);
  const thPos = [];                                // centre line point per sample (world), and tangent
  {
    const DEPTH = 0.95;
    for (let i = 0; i <= NS; i++) {
      const s = (i / NS) * PER;
      let w = 0; while (w < NW - 1 && s >= offs[w + 1]) w++;
      const x = s - offs[w] - walls[w].width / 2;
      // near a corner the line rounds it (behind the corner, the walls' offset lines meet beyond it): blend the two walls' offsets
      const p = wallAt(w, x, 0, DEPTH, new THREE.Vector3());
      const toEnd = walls[w].width / 2 - x, toStart = x + walls[w].width / 2, R = 0.8;
      if (toEnd < R) { const wn = (w + 1) % NW, q = wallAt(wn, -walls[wn].width / 2 + (R - toEnd) * 0, 0, DEPTH, tmpA); const k = smooth01((R - toEnd) / R) * 0.5; p.lerp(q, k); }
      else if (toStart < R) { const wp = (w + NW - 1) % NW, q = wallAt(wp, walls[wp].width / 2, 0, DEPTH, tmpA); const k = smooth01((R - toStart) / R) * 0.5; p.lerp(q, k); }
      thPos.push(p);
    }
    const r = rng(616);
    const tw = [r() * 6, r() * 6, r() * 6];
    for (let l = 0; l < TH_STR; l++) for (let i = 0; i <= NS; i++) {
      const s = (i / NS) * PER, a = thPos[i], b = thPos[Math.min(NS, i + 1)], c = thPos[Math.max(0, i - 1)];
      const tg = tmpB.subVectors(b, c).normalize();
      const y = 1.18 + 0.09 * Math.sin(s * 0.9 + 1.3) + 0.05 * Math.sin(s * 2.3);
      const ph = (l / TH_STR) * Math.PI * 2 + s * 4.2 + tw[l] * 0.1, rad = 0.012;
      const p = tmpA.set(a.x - tg.z * Math.cos(ph) * rad, y + Math.sin(ph) * rad, a.z + tg.x * Math.cos(ph) * rad);
      setV(thread, l, i, p, tg, 0, l);
    }
    thread.ib.needsUpdate = true;
    const pos = attribute('position', 'vec3'), tg = attribute('aT', 'vec3'), aF = attribute('aF', 'vec4');
    const t = aF.x, side = aF.y, cv = aF.z, strand = aF.w;
    const sway = sin(uTime.mul(0.35).add(t.mul(60)).add(strand.mul(2))).mul(0.01);
    const p = pos.add(vec3(0, sway, 0)).add(vec3(0, float(1).sub(cv).mul(-0.25), 0)).add(vec3(0, uLeave.mul(uLeave).mul(1.5), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), tv = modelViewMatrix.mul(vec4(tg, 0)).xyz;
    const rb = ribbon(pv, tv, float(0.0018), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = TSL.select(cv.greaterThan(0.002), rb.pos, vec4(0, 0, 2, 1));
    const vT = varying(t), vS = varying(side), vC = varying(cv), vK = varying(float(1).div(rb.k)), vSt = varying(strand);
    // a slow pulse of light travels along it (one way round the room, 40 s a turn), the growing tip a little brighter
    const pulse = pow(sin(vT.mul(Math.PI * 2 * 3).sub(uTime.mul(0.47)).add(vSt.mul(0.6))).mul(0.5).add(0.5), 14);
    const tip = smoothstep(0.35, 0.9, vC).mul(float(1).sub(smoothstep(0.9, 1.0, vC)));
    const core = mix(tc(RED), vec3(1.0, 0.38, 0.24), pulse.mul(0.6).add(tip.mul(0.5)));
    m.colorNode = core.mul(pulse.mul(0.9).add(0.42).add(tip.mul(0.8))).mul(smoothstep(0.0, 0.35, vC)).mul(float(1).sub(vS.mul(vS))).mul(vK)
      .mul(uGlow).mul(float(1).sub(uLeave)).mul(0.55);
    m.fog = false;
    const mesh = new THREE.Mesh(thread.g, m); mesh.frustumCulled = false; mesh.renderOrder = 3; object.add(mesh);
  }

  // ================================================================================================== the dust (the dark the beings come out of)
  {
    const n = 18000, r = rng(1717), F = 8, A = new Float32Array(n * 4 * F), idx = new Uint32Array(n * 6), C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    // veils: slow clouds of motes (not an even grain), most close behind the walls where the beings will stand, some deeper, a few far
    const veils = []; for (let i = 0; i < 46; i++) { const w = Math.floor(r() * NW), q = r(); veils.push({ w, x: (r() - 0.5) * walls[w].width, y: q < 0.65 ? 0.3 + r() * 2.0 : -0.5 + r() * 7, back: q < 0.65 ? 0.3 + r() * 2.2 : 3 + r() * 14, sx: 0.5 + r() * 1.6, sy: 0.25 + r() * 0.7 }); }
    const gs = () => (r() + r() + r() - 1.5) / 1.5;
    for (let k = 0; k < n; k++) {
      const v = r() < 0.82 ? veils[Math.floor(r() * veils.length)] : null;
      const w = v ? v.w : Math.floor(r() * NW), x = v ? v.x + gs() * v.sx * 1.4 : (r() - 0.5) * walls[w].width * 1.02;
      const back = Math.max(0.12, v ? v.back + gs() * v.sx * 0.6 : 0.2 + Math.pow(r(), 1.3) * 12);
      const y = v ? v.y + gs() * v.sy * 1.4 : -0.5 + r() * 4;
      const p = wallAt(w, x * (1 + back * 0.25), y, back, tmpA), rnd = r(), big = r();
      for (let c = 0; c < 4; c++) A.set([p.x, p.y, p.z, C[c][0], C[c][1], rnd, big, back], (k * 4 + c) * F);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, F), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 3));
    g.setAttribute('aD', new THREE.InterleavedBufferAttribute(ib, 1, 7));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const pos = attribute('position', 'vec3'), co = attribute('aC', 'vec4'), back = attribute('aD', 'float');
    const drift = vec3(sin(uTime.mul(0.06).add(co.z.mul(40))), sin(uTime.mul(0.045).add(co.z.mul(23))).mul(0.6), cos(uTime.mul(0.05).add(co.z.mul(71)))).mul(back.mul(0.04).add(0.08));
    const p = pos.add(drift).add(vec3(0, uLeave.mul(uLeave).mul(co.z.add(0.5)).mul(4), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), c0 = clipOf(pv);
    const sz = float(0.004).add(co.w.mul(co.w).mul(0.01)).mul(back.mul(0.12).add(1));
    const d = ndcScale(pv, c0, sz), k = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w);
    const vC = varying(co), vK = varying(float(1).div(k.mul(k))), vD = varying(back);
    const r2 = dot(vC.xy, vC.xy), twk = pow(sin(uTime.mul(vC.z.mul(0.8).add(0.2)).add(vC.z.mul(90))).mul(0.5).add(0.5), 10);
    const c = mix(tc(COLD), tc(WARM), uWarm.mul(0.85)).mul(float(1).sub(smoothstep(0.2, 1.0, r2))).mul(twk.mul(1.6).add(0.25))
      .mul(exp(vD.mul(-0.09)).mul(0.85).add(0.15)).mul(0.07).mul(vK.mul(0.6).add(0.4));
    m.colorNode = c.mul(uArrive).mul(float(1).sub(uLeave)).mul(uLight);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; object.add(mesh);
  }

  // ================================================================================================== state
  const slotsH = new Map();     // stroke → { wall, x, y, being, t0, lastSpawn, seen }
  const glows = []; for (let i = 0; i < NG; i++) glows.push({ stroke: null, pos: new THREE.Vector3(), a: 0, on: false });
  const events = [];
  let time = 0, total = 0, warmS = 0, threadCover = 0, fullT = -1, endT = -1, ended = false, doneSent = false, assistAcc = 0, firstT = -1, joinedSent = 0;
  const fillW = new Float32Array(NW);
  let endFrom = 0;   // the end starts where the last being was called and travels both ways round the room
  const rr = rng(4242);
  const prm = () => P;

  const fillCount = () => Math.max(4, Math.round(prm().fillCount ?? 96));
  // which slot a call takes: the front of the nearest column if free and nobody stands within 0.42 m; else the first free row behind it;
  // else the nearest column with room (searching outwards)
  function claim(w, x) {
    const C = cols[w]; let j = 0, bd = 1e9; for (let k = 0; k < C.length; k++) { const d = Math.abs(C[k] - x); if (d < bd) { bd = d; j = k; } }
    const frontFree = (k) => !grid[w][k][0] && !beings.some((b) => b.wall === w && b.row === 0 && !b.dead && Math.abs(b.x - (k === j ? x : C[k])) < 0.42);
    if (frontFree(j)) return { w, j, row: 0 };
    const rows = Math.max(2, Math.min(ROWS, Math.round(prm().rows ?? 3)));
    for (let ring = 0; ring < C.length * 2; ring++) {
      for (const k of ring ? [j - ring, j + ring] : [j]) {
        if (k < 0 || k >= C.length) continue;
        for (let r = ring ? 0 : 1; r < rows; r++) if (!grid[w][k][r] && (r > 0 || frontFree(k)) && (r === 0 || grid[w][k][r - 1])) return { w, j: k, row: r };
      }
    }
    return null;
  }
  function spawn(w, x, y, opt = {}) {
    if (ended || fullT >= 0 && opt.auto) return null;
    if (!meshes[0] || !meshes[1]) return null;
    const c = claim(w, x); if (!c) return null;
    const type = rr() < 0.5 ? 0 : 1;
    const xr = c.row === 0 ? (c.j === claimNearest(w, x) && Math.abs(x - cols[w][c.j]) < COL * 0.7 ? x : cols[w][c.j] + (rr() - 0.5) * 0.08) : cols[w][c.j] + (rr() - 0.5) * 0.1;
    const front = c.row === 0 ? null : grid[w][c.j][0];
    const b = { wall: w, j: c.j, row: c.row, x: c.row && front ? front.x + (rr() - 0.5) * 0.1 : xr, y: c.row === 0 ? (opt.y ?? (1.05 + rr() * 0.55)) : 1.25, yT: 0, type, seed: rr(), phase: rr() * 9,
      h: 0.93 + rr() * 0.12, ws: 0.95 + rr() * 0.1, born: 0, flash: 1, glow: 0, lean: 0, lv: 0, gone: 0, contact: 0, held: null, t0: time, dead: false, M: null, k: -1, yaw: 0, ox: 0 };
    b.yT = b.y; b.s = wrapS(offs[w] + walls[w].width / 2 + b.x);
    grid[w][c.j][c.row] = b; beings.push(b);
    const M = meshes[type][w][c.row ? 1 : 0]; b.M = M; b.k = M.list.length; M.list.push(b); M.mesh.geometry.instanceCount = M.list.length;
    if (front) front.lv += 0.9;   // the one in front takes the push
    events.push(`born:${w}:${((b.x + walls[w].width / 2) / walls[w].width).toFixed(3)}:${b.y.toFixed(2)}:${c.row}`);
    if (firstT < 0) firstT = time;
    endFrom = b.s;
    return b;
  }
  function claimNearest(w, x) { const C = cols[w]; let j = 0, bd = 1e9; for (let k = 0; k < C.length; k++) { const d = Math.abs(C[k] - x); if (d < bd) { bd = d; j = k; } } return j; }

  // ---- write one being's instance
  const yawOf = (w) => Math.atan2(walls[w].normal.x, walls[w].normal.z);
  function writeInst(b) {
    const A = b.M.buf.array, o = b.k * 16, w = b.wall, W = walls[w], B = BUILDS[b.type], pl = palms[b.type];
    const yaw = yawOf(w), Xx = Math.cos(yaw), Xz = -Math.sin(yaw);
    const hs = b.h * B.s, ws = b.ws;
    let hp = 0, px = 0, py = 0, pz = 0, oy = 0, back = 0;
    if (b.row === 0) {
      hp = clamp01((b.y / hs - pl[0].R[1]) / (pl[1].R[1] - pl[0].R[1]));
      px = (pl[0].R[0] + (pl[1].R[0] - pl[0].R[0]) * hp) * ws * hs; py = (pl[0].R[1] + (pl[1].R[1] - pl[0].R[1]) * hp) * hs; pz = (pl[0].R[2] + (pl[1].R[2] - pl[0].R[2]) * hp) * ws * hs;
      oy = Math.max(-0.3, Math.min(0.1, b.y - py)); back = D0 + pz;
    } else { back = D0 + ZW * hs + b.row * ROW; px = 0; }
    // the anchor (front: the right palm) on the wall plane at x
    wallAt(w, b.x, 0, 0, tmpA);
    A[o] = tmpA.x - Xx * px - W.normal.x * back; A[o + 1] = oy; A[o + 2] = tmpA.z - Xz * px - W.normal.z * back; A[o + 3] = hs;
    A[o + 4] = hp; A[o + 5] = b.row ? 1 : 0; A[o + 6] = b.born; A[o + 7] = b.glow;
    A[o + 8] = b.seed * 97; A[o + 9] = b.phase; A[o + 10] = b.lean; A[o + 11] = yaw;
    A[o + 12] = b.gone; A[o + 13] = ws; A[o + 14] = b.flash; A[o + 15] = b.contact;
    b.palmY = py + oy; b.palmLx = b.x + (b.row ? 0 : ((pl[0].L[0] - pl[0].R[0]) + ((pl[1].L[0] - pl[1].R[0]) - (pl[0].L[0] - pl[0].R[0])) * hp) * ws * hs);
    b.palmLy = b.row ? 0 : (pl[0].L[1] + (pl[1].L[1] - pl[0].L[1]) * hp) * hs + oy;
  }

  // ================================================================================================== update
  const knownStrokes = new Set(), nowStrokes = new Set();
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
    // alone in the study, the dark of the chapter (in the work the host sets the background; suggested: the same, warming with fill())
    if (!input.state && room.setBackground) { const k = warmS; room.setBackground({ bottom: [0.0035 + 0.006 * k, 0.0045 + 0.0015 * k, 0.008], top: [0.008 + 0.01 * k, 0.011 + 0.002 * k, 0.02 - 0.004 * k], gain: 1 }); }
    uTime.value = time;
    uLight.value = p.light ?? 1; uGlow.value = p.glow ?? 1; uBreath.value = p.breath ?? 1;
    uLeave.value = clamp01(input.leave ?? p.leave ?? 0); uArrive.value = clamp01(input.arrive ?? p.arrive ?? 1);
    const hands = input.hands || [];

    // ---- hands: a new stroke calls a being where it touched; a held hand keeps calling them (behind, then beside)
    nowStrokes.clear();
    for (const h of hands) {
      nowStrokes.add(h.stroke);
      const W = walls[h.wall]; if (!W) continue;
      const x = (h.pos.x - W.centre.x) * W.right.x + (h.pos.z - W.centre.z) * W.right.z, y = h.pos.y;
      let s = slotsH.get(h.stroke);
      if (!s) {
        s = { wall: h.wall, x, y, being: null, t0: time, last: time, seen: time, n: 0 };
        slotsH.set(h.stroke, s);
        if (!knownStrokes.has(h.stroke) && uLeave.value < 0.5) { s.being = spawn(h.wall, x, Math.max(0.55, Math.min(2.05, y)), {}); }
        const g = glows.find((q) => q.stroke === null && q.a < 0.05) || glows.find((q) => q.stroke === null) || glows[0];
        g.stroke = h.stroke; g.a = Math.max(g.a, 0.6);
      }
      s.wall = h.wall; s.x = x; s.y = y; s.seen = time;
      const g = glows.find((q) => q.stroke === h.stroke); if (g) { g.pos.copy(h.pos).addScaledVector(W.normal, -0.01); g.on = true; }
      // the being that answered this hand keeps its palm on it: it follows the height slowly, and glows where they meet
      const b = s.being;
      if (b && !b.dead && b.row === 0 && b.wall === h.wall && Math.abs(b.x - x) < 0.45) { b.yT = Math.max(0.55, Math.min(2.05, y)); b.held = time; }
      // held: one more being every holdEvery s (the group grows from the hand)
      const every = p.holdEvery ?? 1.2;
      if (every > 0 && time - s.t0 > 1.0 && time - s.last > every && s.n < (p.holdMax ?? 8) && uLeave.value < 0.5) {
        s.last = time; s.n++;
        const side = s.n % 3 === 1 ? 0 : s.n % 3 === 2 ? 1 : -1;
        spawn(h.wall, x + side * COL, 1.0 + rr() * 0.6, { auto: true });
      }
    }
    for (const [k, s] of slotsH) if (!nowStrokes.has(k) && time - s.seen > 0.35) slotsH.delete(k);
    knownStrokes.clear(); for (const k of nowStrokes) knownStrokes.add(k);

    // ---- solo help: once the room has started, beings come out of the dark by themselves next to the groups
    const assist = p.assist ?? 0.35;   // beings / s
    if (firstT >= 0 && assist > 0 && fullT < 0 && time - firstT > (p.assistDelay ?? 6) && beings.length) {
      assistAcc += dt * assist;
      while (assistAcc >= 1) {
        assistAcc -= 1;
        const a = beings[Math.floor(rr() * beings.length)];
        spawn(a.wall, a.x + (rr() < 0.5 ? -1 : 1) * COL * (1 + Math.floor(rr() * 2)), 1.0 + rr() * 0.6, { auto: true });
      }
    }

    // ---- the fill, per wall and in total; density along the perimeter; the thread
    const fc = fillCount(); let alive = 0; fillW.fill(0);
    for (const b of beings) { alive++; fillW[b.wall]++; }
    for (let w = 0; w < NW; w++) fillW[w] = clamp01(fillW[w] / (fc * walls[w].width / PER));
    total = clamp01(alive / fc);
    const thr = p.threadAt ?? 0.45, sig = 0.7;
    dens.fill(0);
    for (const b of beings) {
      const wgt = b.row === 0 ? 1 : 0.8, i0 = Math.round((b.s / PER) * NS), span = Math.ceil((sig * 2.5 / PER) * NS);
      for (let di = -span; di <= span; di++) { const i = (i0 + di + NS) % NS, d = (di / NS) * PER; dens[i] += wgt * Math.exp(-(d * d) / (2 * sig * sig)) * smooth01(b.born * 2); }
    }
    const dNorm = 1 / (2.5 * (sig * Math.sqrt(2 * Math.PI)) / COL);   // ≈ 1 for 2.5 rows packed
    for (let i = 0; i < NS; i++) dens[i] *= dNorm;
    // target: dense stretches, and gaps between two dense stretches no longer than the bridge (it grows with the fill: at full, the ring)
    const bridge = 1.2 + (PER / 2) * smooth01((total - 0.25) / 0.7);
    let anyDense = false; for (let i = 0; i < NS; i++) { target[i] = dens[i] >= thr ? 1 : 0; if (target[i]) anyDense = true; }
    if (anyDense) {
      let start = 0; while (target[start]) { start++; if (start >= NS) break; }
      if (start < NS) {
        for (let k = 0, i = start, gapStart = -1; k <= NS; k++, i = (i + 1) % NS) {
          if (!target[i] && gapStart < 0) gapStart = k;
          if (target[i] && gapStart >= 0) { const len = ((k - gapStart) / NS) * PER; if (len <= bridge) for (let q = gapStart; q < k; q++) target[(start + q) % NS] = 2; gapStart = -1; }
        }
      }
    }
    const grow = (p.threadSpeed ?? 0.7) * dt * NS / PER;   // samples per frame at the growing front
    let covSum = 0, joins = 0;
    for (let i = 0; i < NS; i++) {
      const L = cov[(i + NS - 1) % NS], R = cov[(i + 1) % NS];
      if (target[i] === 1) cov[i] = Math.min(1, cov[i] + dt / 1.2);
      else if (target[i] === 2 && Math.max(L, R) > 0.98) cov[i] = Math.min(1, cov[i] + grow * 1.0);
      else if (!target[i]) cov[i] = Math.max(0, cov[i] - dt * 0.15);
      covSum += cov[i];
      if (target[i] === 2 && cov[i] > 0.99) joins++;
    }
    threadCover = covSum / NS;
    if (joins > 0 && joinedSent === 0) { events.push('thread:join'); joinedSent = 1; }
    for (let l = 0; l < TH_STR; l++) for (let i = 0; i <= NS; i++) { const c = cov[i % NS]; for (let sd = 0; sd < 2; sd++) thread.A[((l * TH_N + i) * 2 + sd) * thread.F + 8] = c; }
    thread.ib.needsUpdate = true;

    // ---- colour: from cold to warm with the fill (smooth, no step)
    const warmT = Math.min(1, (p.warm ?? 1) * smooth01(total * 1.05)) + (fullT >= 0 ? 0.1 : 0);
    warmS += (warmT - warmS) * Math.min(1, dt * 0.35); uWarm.value = warmS;

    // ---- full → hold → they let go into particles (the way out)
    if (fullT < 0 && alive >= fc) { fullT = time; events.push('full'); }
    const hold = p.endHold ?? 4, endDur = p.endTime ?? 7;
    if (p.end === false && fullT >= 0) { /* the host decides the end */ } else if (fullT >= 0 && endT < 0 && time - fullT > hold) { endT = time; events.push('end'); }
    ended = endT >= 0;

    // ---- beings
    const kW = 1 - Math.exp(-dt * 1.2);
    for (const b of beings) {
      b.born = Math.min(1, b.born + dt / (p.bornTime ?? 1.6));
      b.flash = Math.max(0, b.flash - dt / 2.2);
      const near = b.held != null && time - b.held < 0.3;
      b.contact += ((near ? 1 : 0) - b.contact) * Math.min(1, dt * (near ? 12 : 1.5));
      if (b.row === 0) b.y += (b.yT - b.y) * Math.min(1, dt * 1.6);
      // the push: a damped spring; the rows behind lean into the back in front, and the whole room sways a little when it is full
      const sway = (0.04 + 0.08 * total) * Math.sin(time * 0.7 + b.s * 0.6);
      const lT = b.row ? 0.16 + sway : 0.04 + sway * 0.3;
      b.lv += ((lT - b.lean) * 14 - b.lv * 3.4) * dt; b.lean += b.lv * dt;
      const g = (b.flash * 0.6 + b.contact * 0.8) * (1 - b.gone);
      b.glow += (g - b.glow) * kW;
      if (ended) { const ds = Math.abs(dS(endFrom, b.s)) / (PER / 2), tt = (time - endT) / endDur; b.gone = clamp01((tt - ds * 0.45) / 0.55); }
      else if (p.dissolve != null) b.gone = clamp01(p.dissolve);
      writeInst(b);
    }
    for (const T of meshes) if (T) for (const W of T) for (const M of W) if (M.list.length) M.buf.needsUpdate = true;
    if (ended && !doneSent && time - endT > endDur + 0.5) { doneSent = true; events.push('done'); }

    // ---- the strip: neighbours side by side in the first row (≤ 0.95 m apart along the perimeter, across corners too)
    const front = beings.filter((b) => b.row === 0).sort((a, b) => a.s - b.s);
    let nl = 0;
    for (let k = 0; k < front.length && nl < NSTRIP; k++) {
      const a = front[k], b = front[(k + 1) % front.length]; if (a === b || front.length < 2) break;
      const gap = wrapS(b.s - a.s); if (gap > 0.95 || gap < 0.2) continue;
      const g0 = smooth01(Math.min(a.born, b.born) * 1.6 - 0.6) * (1 - Math.max(a.gone, b.gone));
      for (let st = 0; st < STRANDS; st++) {
        const l = nl * STRANDS + st;
        // from a's left palm to b's right palm; across a corner through the corner point on the wall planes
        const ya = a.palmLy + st * 0.012, yb = b.palmY + st * 0.012;
        for (let j = 0; j < SS; j++) {
          const t = j / (SS - 1), sAt = wrapS(a.s + (a.palmLx - a.x) + t * (gap - (a.palmLx - a.x))), y = ya + (yb - ya) * t - Math.sin(t * Math.PI) * (0.025 + st * 0.012);
          let w = 0; while (w < NW - 1 && sAt >= offs[w + 1]) w++;
          const pp = wallAt(w, sAt - offs[w] - walls[w].width / 2, y, D0 + 0.004, tmpA), tg = tmpB.copy(walls[w].right);
          setV(strip, l, j, pp, tg, g0 * 1.02, (k * 7 + st) % 13 / 13);
        }
      }
      nl++;
    }
    for (let l = nl * STRANDS; l < NSTRIP * STRANDS; l++) for (let j = 0; j < SS; j++) { const o = ((l * SS + j) * 2) * strip.F; if (strip.A[o + 8] === 0 && strip.A[o + 1] === -50) break; for (let sd = 0; sd < 2; sd++) { strip.A[o + sd * strip.F + 8] = 0; strip.A[o + sd * strip.F + 1] = -50; } }
    strip.ib.needsUpdate = true;

    // ---- the palm flashes
    const ga = gA.array;
    glows.forEach((g, i) => {
      if (g.stroke !== null && !nowStrokes.has(g.stroke)) { g.stroke = null; }
      g.a = g.stroke !== null ? Math.min(1, g.a + dt * 12) : Math.max(0, g.a - dt / 0.9);
      ga[i * 4] = g.pos.x; ga[i * 4 + 1] = g.pos.y; ga[i * 4 + 2] = g.pos.z; ga[i * 4 + 3] = g.a * 0.8;
    });
    gA.needsUpdate = true;
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999;
  }

  function reset() {
    for (const b of beings) { b.dead = true; }
    beings.length = 0; for (const G of grid) for (const c of G) c.fill(null);
    for (const T of meshes) if (T) for (const W of T) for (const M of W) { M.list.length = 0; M.mesh.geometry.instanceCount = 0; }
    cov.fill(0); fullT = -1; endT = -1; ended = false; doneSent = false; firstT = -1; assistAcc = 0; joinedSent = 0; warmS = 0; total = 0; threadCover = 0;
  }
  function fill() { return { total: +total.toFixed(3), walls: Array.from(fillW, (v) => +v.toFixed(3)), full: fullT >= 0, threadCover: +threadCover.toFixed(3), beings: beings.length, ending: ended ? clamp01((time - endT) / ((P.endTime ?? 7))) : 0, done: doneSent }; }
  function setParams() {}
  function dispose() { ptMat.dispose(); gGeo.dispose(); strip.g.dispose(); thread.g.dispose(); for (const T of meshes) if (T) for (const W of T) for (const M of W) M.mesh.geometry.dispose(); jobs.length = 0; }
  const api = { object, update, setParams, dispose, fill, reset, events };
  if (typeof window !== 'undefined') window.__pinya3d2 = { beings, fill, reset, cov, dens, get readyMs() { return readyMs; }, spawn: (w, x, y) => spawn(w, x, y, {}), events, cols, PER };
  return api;
}
