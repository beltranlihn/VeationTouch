// Ressonància — part «pinya3d»: chapter II, Pinya · Força · body and earth (contract: ../PARTS.md).  T-007 (bodies of porcelain).
//
// The public is the pinya, and the world answers with bodies. Beyond every wall a dense crowd of figures of clay and translucent
// porcelain stands on rising earth terraces in five concentric rings round the room (radii 5.85–7.85 m: 2.3–4.4 m beyond the wall
// centres), shoulder to shoulder, rows overlapping, all facing the room's centre. They breathe (4 s in, 6 s out). Dark and asleep:
// only a grazing pearl rim from above; the light is the warmth under the skin, where hands wake them.
//
// Bodies (./pinya3d/body.js): ONE smooth body per build — an SDF of ellipsoids and round cones blended with a smooth min, meshed by
// surface nets, skinned to a 15-bone skeleton at load and baked in three poses with one topology (asleep · awake · rotllana; two pose
// variants per build, two builds, so four body types). Baked per vertex: AO, thickness (translucency), clay mottle, shards (Voronoi;
// split only on shard borders = the crack lines), head weight. Per instance: height, width, head turn, breath phase, tint.
// The vertex shader blends poses, breathes, turns the head, leans towards a hand, steps sideways in the dance, and FRAGMENTS (every
// vertex knows its shard's centre and seed: arrive/leave are pure vertex-stage displacement and rotation).
// Shading: almost no general light. A grazing pearl rim from above; a glow under the skin, deep red where the body is thick and gold
// where it is thin (fingers, ears, the edge of the shoulders); porcelain inside the shards, with glints.
// Culling: the rings are grouped in 2 bands (each a Group that turns), each band cut in 8 sectors × 4 body types, one mesh each with
// its own bounding sphere: each wall's camera draws only its bodies.
//
// Hands: at once (same frame) a warm glow on the far side of the wall and the crowd behind lights up and leans in; then a figure steps
// out of the dark (a pool of 12, detailed hands with fingers) and lays its palm of clay on the visitor's hand on the wall plane
// (~2.2 s); the warmth runs from the palm up the arm into the body. Hand gone: it lingers 1.2 s and steps back into the dark.
// input.state (score.js): fill[w] wakes wall w ring after ring (front and centre first); 'wall:<i>' = a deep warm pulse front to back;
// closed → rotllana pose, the bands turn (alternate directions, stepping sideways), a band of warmth goes round; 'close' = a wave of
// light round the ring. Pinya 'reward' (and later blocks): the clay dries and cracks, the cracks glowing like glaze (the trencadís).
// input.leave: shards float up and away, turning (clay outside, porcelain inside), and thin into the dark, top first.
// input.arrive: shards of ash and earth converge from below and around and lock into bodies, bottom first, warming.
// Study (no input.state): params fill, closed, dry, arrive, leave, glow, light, breath, press.
import { bakeBodyGen, rng, V } from './pinya3d/body.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------------------------------------------------------- builds and poses
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const ROTLLANA = { lean: 0.0, hunch: 0.0, head: -0.04, feet: [V(0.12, 0.07, 0.0), V(-0.12, 0.07, 0.0)], hands: [V(0.34, 1.42, 0.1), V(-0.34, 1.42, 0.1)],
  hf: [{ fd: [1, 0.5, 0], pn: [0, 0, 1] }, { fd: [-1, 0.5, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) };
const CROWD = [
  [ // variant 0: hands on the backs in front · arms up, palms pushing towards the room
    { lean: 0.26, hunch: 0.3, head: 0.6, feet: [V(0.11, 0.07, 0.1), V(-0.11, 0.07, -0.1)], hands: [V(0.16, 1.0, 0.42), V(-0.16, 1.04, 0.44)],
      hf: [{ fd: [0, -0.35, 1], pn: [0, 1, 0.35] }, { fd: [0, -0.3, 1], pn: [0, 1, 0.3] }], elbow: V(0, -1, -0.2) },
    { lean: 0.14, hunch: -0.04, head: -0.12, feet: [V(0.11, 0.07, 0.14), V(-0.11, 0.07, -0.12)], hands: [V(0.32, 1.86, 0.29), V(-0.29, 1.89, 0.31)],
      hf: [{ fd: [0.15, 1, 0.1], pn: [0, -0.1, 1] }, { fd: [-0.15, 1, 0.1], pn: [0, -0.1, 1] }], elbow: V(0, -1, -0.3) },
    ROTLLANA],
  [ // variant 1: head sunk, one hand on the back in front, the other hanging · one arm high, the other pushing
    { lean: 0.3, hunch: 0.38, head: 0.75, feet: [V(0.12, 0.07, -0.06), V(-0.1, 0.07, 0.12)], hands: [V(0.2, 0.78, 0.12), V(-0.15, 1.02, 0.44)],
      hf: [null, { fd: [0, -0.3, 1], pn: [0, 1, 0.3] }], elbow: V(0, -1, -0.2) },
    { lean: 0.1, hunch: 0.0, head: -0.25, feet: [V(0.12, 0.07, -0.08), V(-0.11, 0.07, 0.13)], hands: [V(0.27, 1.95, 0.21), V(-0.36, 1.66, 0.44)],
      hf: [{ fd: [0.1, 1, 0.1], pn: [0, -0.2, 1] }, { fd: [-0.2, 1, 0.4], pn: [0, -0.4, 1] }], elbow: V(0, -1, -0.3) },
    ROTLLANA],
];
for (const set of CROWD) for (const sp of set) if (sp.hf) sp.hf = sp.hf.map((f) => f || undefined);
const ZW_L = 0.5, ZW_H = 0.4;     // where the press poses put the wall (body-local z of the palms)
const PRESS = [
  { lean: 0.06, hunch: 0.02, head: 0.1, feet: [V(0.11, 0.07, 0.12), V(-0.11, 0.07, -0.12)], hands: [V(0.22, 0.95, 0.22), V(-0.2, 1.2, 0.34)],
    hf: [{ fd: [0, 0.3, 1], pn: [0, 1, -0.3] }, { fd: [0, 0.8, 0.6], pn: [0, -0.6, 0.8] }], elbow: V(0, -1, -0.3) },
  { lean: 0.28, hunch: 0.1, head: 0.3, feet: [V(0.12, 0.07, 0.12), V(-0.11, 0.07, -0.14)], hands: [V(0.27, 0.95, ZW_L - 0.06), V(-0.14, 1.02, ZW_L - 0.02)],
    hf: [{ fd: [0.25, 1, 0], pn: [0, 0, 1] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.5) },
  { lean: 0.12, hunch: 0.04, head: 0.05, feet: [V(0.12, 0.07, 0.1), V(-0.11, 0.07, -0.12)], hands: [V(0.32, 1.38, ZW_H - 0.02), V(-0.1, 1.72, ZW_H - 0.02)],
    hf: [{ fd: [0.2, 1, 0], pn: [0, 0, 1] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.6) },
];

// ---------------------------------------------------------------------------------------------------------------- the part
export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, vec2, vec3, vec4, float, clamp, mix, smoothstep, sin, cos, max, normalize, select, varying, fract,
    cameraPosition, frontFacing, positionGeometry, cameraProjectionMatrix, modelViewMatrix, modelWorldMatrix, uv, dot, exp, pow, cross, reflect } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'pinya3d';
  const uTime = uniform(0), uLeave = uniform(0), uArrive = uniform(1), uDry = uniform(0), uGain = uniform(1), uLight = uniform(1), uBreath = uniform(1);

  // ---- geometry: one interleaved vertex buffer (30 floats) shared by all meshes of a body type, one instance buffer (16 floats)
  // per mesh: WebGPU allows 8 vertex buffers.
  function vertexAttrs(body) {
    const n = body.n, A = new Float32Array(n * 30);
    for (let v = 0; v < n; v++) {
      const o = v * 30;
      for (let k = 0; k < 3; k++) { A.set(body.P[k].subarray(v * 3, v * 3 + 3), o + k * 6); A.set(body.N[k].subarray(v * 3, v * 3 + 3), o + k * 6 + 3); }
      A.set(body.aSh.subarray(v * 4, v * 4 + 4), o + 18); A.set(body.aAux.subarray(v * 4, v * 4 + 4), o + 22); A.set(body.aAux2.subarray(v * 4, v * 4 + 4), o + 26);
    }
    const ib = new THREE.InterleavedBuffer(A, 30), at = {};
    for (const [name, size, off] of [['position', 3, 0], ['normal', 3, 3], ['pB', 3, 6], ['nB', 3, 9], ['pC', 3, 12], ['nC', 3, 15], ['aSh', 4, 18], ['aAux', 4, 22], ['aAux2', 4, 26]]) at[name] = new THREE.InterleavedBufferAttribute(ib, size, off);
    return { at, index: new THREE.BufferAttribute(body.index, 1) };
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
  const instBuf = (count) => { const b = new THREE.InstancedInterleavedBuffer(new Float32Array(count * 16), 16, 1); b.setUsage(THREE.DynamicDrawUsage); return b; };

  // ---- the vertex/fragment graph. mode 'crowd' | 'press'
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
  function makeMaterial(mode) {
    const pA = attribute('position', 'vec3'), nA = attribute('normal', 'vec3'), pB = attribute('pB', 'vec3'), nB = attribute('nB', 'vec3'), pC = attribute('pC', 'vec3'), nC = attribute('nC', 'vec3');
    const sh = attribute('aSh', 'vec4'), aux = attribute('aAux', 'vec4'), aux2 = attribute('aAux2', 'vec4');
    const i0 = attribute('i0', 'vec4'), i1 = attribute('i1', 'vec4'), i2 = attribute('i2', 'vec4'), i3 = attribute('i3', 'vec4');
    // crowd: i0 = (x, baseY, z, height) band-local; i1 = (wake, glow, lean, rotllana); i2 = (seed, phase, step, yaw); i3 = (head turn, width, -, -)
    // press: i0 = (x, y, z, height) world;      i1 = (approach, height blend, glow, contact s); i2 = (seed, phase, visible, yaw); i3 = (0, 1, -, -)
    const seed = i2.x, phase = i2.y, yaw = i2.w;
    let p, n, glowV, wakeV, zN;
    if (mode === 'crowd') {
      const w = i1.x, rl = i1.w;
      p = mix(mix(pA, pB, w), pC, rl); n = mix(mix(nA, nB, w), nC, rl);
      wakeV = max(w, rl); glowV = i1.y; zN = mix(mix(float(0.2), float(0.06), w), float(0.0), rl);
    } else {
      const ap = i1.x, h = i1.y, ease = ap.mul(ap).mul(float(3).sub(ap.mul(2)));
      p = mix(pA, mix(pB, pC, h), ease); n = mix(nA, mix(nB, nC, h), ease);
      wakeV = float(0.35).add(ap.mul(0.65)); zN = float(0.12);
      const front = i1.w.mul(0.55);
      // warmth born in the palm, fading with the distance from it (never a uniform skin)
      const run = smoothstep(front, front.sub(0.35), aux.w).mul(exp(aux.w.mul(-3.2))).mul(0.7).add(exp(aux.w.mul(-30)).mul(smoothstep(0.0, 0.25, i1.w)).mul(1.3));
      glowV = i1.z.mul(0.5).add(run.mul(smoothstep(0.0, 0.1, i1.w)));
    }
    n = normalize(n);
    // head turn (per instance), about a vertical axis through the neck
    const ht = i3.x.mul(aux2.w), ch = cos(ht), shh = sin(ht);
    const hx = p.x, hz = p.z.sub(zN);
    p = vec3(hx.mul(ch).add(hz.mul(shh)), p.y, hx.mul(shh).negate().add(hz.mul(ch)).add(zN));
    n = vec3(n.x.mul(ch).add(n.z.mul(shh)), n.y, n.x.mul(shh).negate().add(n.z.mul(ch)));
    // breath: 4 s in, 6 s out
    const bt = fract(uTime.add(phase).div(10));
    const br = select(bt.lessThan(0.4), smoothstep(0.0, 0.4, bt), float(1).sub(smoothstep(0.4, 1.0, bt))).mul(uBreath);
    p = p.add(n.mul(aux.y.mul(br).mul(0.012))).add(vec3(0, aux.y.mul(br).mul(0.008), 0));
    if (mode === 'crowd') {
      const st = i2.z, lift = aux.z.mul(i1.w);
      p = p.add(vec3(lift.abs().mul(sin(st).mul(0.03)), max(lift.mul(sin(st)), 0).mul(0.07), 0));
      p = p.add(vec3(0, 0, p.y.mul(i1.z).mul(0.16)));
    }
    // fragmentation
    const L = sh.xyz, sd = sh.w.add(seed.mul(0.37));
    const r1 = fract(sd.mul(17.23)), r2 = fract(sd.mul(41.71)), r3 = fract(sd.mul(73.13)), r4 = fract(sd.mul(131.3));
    const hgt = clamp(p.y.div(1.8), 0, 1);
    const u = clamp(uLeave.mul(1.9).sub(r1.mul(0.3).add(float(1).sub(hgt).mul(0.3)).add(fract(seed.mul(7.7)).mul(0.25))).div(0.95), 0, 1);
    const va = clamp(float(1).sub(uArrive.mul(1.9).sub(r2.mul(0.3).add(hgt.mul(0.3)).add(fract(seed.mul(5.3)).mul(0.25))).div(0.95)), 0, 1);
    const axis = normalize(vec3(r1.sub(0.5), r2.sub(0.5), r3.sub(0.5)).add(vec3(0, 0.001, 0)));
    const ang = u.mul(r3.mul(3).add(1.5)).add(va.mul(r4.mul(3).add(2)));
    const sc = float(1).sub(smoothstep(0.55, 1.0, u)).mul(float(1).sub(smoothstep(0.45, 1.0, va)));
    const dLeave = vec3(r3.sub(0.5).mul(1.4), u.mul(u).mul(r1.mul(2.6).add(1.4)).add(u.mul(0.3)), r2.add(0.3).negate()).mul(u);
    const dArrive = normalize(vec3(r1.sub(0.5), r2.mul(0.5).sub(0.55), r3.sub(0.85))).mul(r4.mul(2.2).add(0.8)).mul(pow(va, 1.3));
    p = p.sub(L).add(rotA(L.mul(sc), axis, ang)).add(dLeave).add(dArrive);
    n = rotA(n, axis, ang);
    // instance → object
    const cy = cos(yaw), sy = sin(yaw), hs = i0.w, ws = i3.y;
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const ps = vec3(p.x.mul(ws), p.y, p.z.mul(ws)).mul(hs);
    const local = X.mul(ps.x).add(vec3(0, ps.y, 0)).add(F.mul(ps.z)).add(i0.xyz);
    const nl = X.mul(n.x).add(vec3(0, n.y, 0)).add(F.mul(n.z));
    const vis = mode === 'press' ? i2.z : float(1);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.positionNode = select(vis.greaterThan(0.5), local, vec3(0, -50, 0));
    const vN = varying(modelWorldMatrix.mul(vec4(nl, 0)).xyz), vP = varying(modelWorldMatrix.mul(vec4(local, 1)).xyz);
    const vWake = varying(wakeV), vGlow = varying(glowV.mul(br.mul(0.3).add(0.8)));
    const vCrack = varying(aux.x), vFade = varying(float(1).sub(smoothstep(0.35, 1.0, u)).mul(float(1).sub(smoothstep(0.5, 1.0, va))));
    const vAsh = varying(va), vU = varying(u), vH = varying(hgt), vSeed = varying(sd), vAo = varying(aux2.x), vThin = varying(aux2.y), vMott = varying(aux2.z);
    const tint = varying(fract(seed.mul(0.6180339)));
    // ---- shading: dark matter; a grazing pearl rim from above; the warmth under the skin
    const N = normalize(vN).mul(select(frontFacing, float(1), float(-1)));
    const Vd = normalize(cameraPosition.sub(vP)), Ld = normalize(vec3(0, 12, 0).sub(vP));
    const ndl = dot(N, Ld), ndv = clamp(dot(N, Vd), 0, 1);
    const wrap = clamp(ndl.add(0.4).div(1.4), 0, 1);
    const rim = pow(float(1).sub(ndv), 3.5);
    let clay = mix(mix(vec3(0.28, 0.1, 0.05), vec3(0.46, 0.22, 0.12), tint), mix(vec3(0.66, 0.5, 0.38), vec3(0.86, 0.8, 0.72), tint), clamp(vH.mul(0.9).add(vMott.mul(0.3)).sub(0.25), 0, 1));
    clay = mix(clay, vec3(0.62, 0.56, 0.5), uDry.mul(0.55));
    const albedo = select(frontFacing, clay, vec3(0.86, 0.85, 0.81));
    const ash = mix(float(1), float(0.25), vAsh);
    const ao = vAo.mul(vAo);
    const low = smoothstep(0.0, 0.75, vH);                                                  // the feet sink into the shadow
    const lit = mix(float(0.03), float(0.07), vWake).mul(uLight).mul(low);
    let col = albedo.mul(wrap).mul(lit).mul(ao).mul(ash);
    // pearl: a cool sheen on the silhouette, mostly on surfaces that face the light from above
    const top = clamp(N.y.mul(0.6).add(0.4), 0, 1);
    col = col.add(vec3(0.7, 0.74, 0.88).mul(rim).mul(top).mul(mix(float(0.07), float(0.1), vWake)).mul(clamp(vGlow, 0, 1).mul(0.9).add(0.6)).mul(ao).mul(uLight).mul(low.mul(0.8).add(0.2)));
    // a thin pearl highlight that catches on the rim (the porcelain sheen)
    col = col.add(vec3(0.86, 0.88, 0.98).mul(pow(float(1).sub(ndv), 7)).mul(top).mul(mix(float(0.12), float(0.3), vWake)).mul(clamp(vGlow, 0, 1).mul(1.2).add(0.6)).mul(ao).mul(uLight).mul(float(1).sub(uDry.mul(0.5))).mul(low.mul(0.8).add(0.2)));
    // porcelain sheen (wet, gone when it dries)
    const Hh = normalize(Ld.add(Vd));
    col = col.add(vec3(1.0, 0.92, 0.85).mul(pow(max(dot(N, Hh), 0), 30)).mul(0.05).mul(vWake).mul(float(1).sub(uDry)).mul(ao).mul(uLight));
    // under the skin: deep red where thick, gold where thin; brighter where the surface faces you
    const gcol = mix(vec3(0.55, 0.07, 0.02), vec3(1.0, 0.58, 0.24), clamp(vThin.mul(0.8).add(pow(ndv, 2).mul(0.35)), 0, 1));
    // translucent porcelain: the warmth shows at the silhouette and in the thin parts, the faces towards you stay dark
    const glowK = vThin.mul(0.5).add(float(1).sub(ndv).mul(0.75)).add(0.08).mul(ao.mul(0.6).add(0.4)).mul(smoothstep(0.12, 0.6, vH).mul(0.7).add(0.3));
    col = col.add(gcol.mul(vGlow).mul(glowK).mul(uGain).mul(float(1).sub(uDry.mul(0.6))).mul(float(1).sub(vAsh)).mul(float(1).sub(vU.mul(0.6))));
    // the cracks of the dry clay: glaze colours shine through
    const crack = float(1).sub(smoothstep(0.0, 0.12, vCrack)).mul(uDry.add(smoothstep(0.0, 0.15, vU)).min(1)).mul(float(1).sub(smoothstep(0.3, 0.8, vU)));
    const glaze = mix(mix(vec3(0.15, 0.4, 1.0), vec3(0.1, 0.75, 0.6), fract(vSeed.mul(11.1))), vec3(1.0, 0.7, 0.2), smoothstep(0.62, 0.64, fract(vSeed.mul(23.7))));
    col = col.add(glaze.mul(crack).mul(0.35));
    // porcelain glints on flying shards, ember edges on arriving ash
    const R = reflect(Vd.negate(), N);
    col = col.add(vec3(1.0, 0.95, 0.88).mul(pow(max(dot(R, Ld), 0), 60).mul(0.8).mul(smoothstep(0.02, 0.2, vU)).mul(select(frontFacing, float(0.2), float(1)))));
    col = col.add(vec3(1.0, 0.35, 0.08).mul(float(1).sub(smoothstep(0.0, 0.4, vCrack))).mul(vAsh.mul(float(1).sub(vAsh)).mul(4)).mul(0.3));
    m.colorNode = col.mul(vFade);
    m.fog = false;
    return m;
  }

  // ---- the crowd: five rings, pressed together, rows staggered and overlapping
  const RINGS = [0, 1, 2, 3, 4].map((i) => ({ r: 5.85 + 0.5 * i, y: 0.3 * i, band: i < 2 ? 0 : 1 })), SPACING = 0.47, NSEC = 8;
  const crowd = [];
  const rr = rng(4242);
  RINGS.forEach((R, ri) => {
    const nn = Math.round((2 * Math.PI * R.r) / SPACING), off = ri * 0.5 * (2 * Math.PI) / nn;
    for (let j = 0; j < nn; j++) {
      const a0 = off + ((j + (rr() - 0.5) * 0.35) * 2 * Math.PI) / nn, h = 0.9 + rr() * 0.17;
      crowd.push({ ring: ri, band: R.band, a0, r: R.r + (rr() - 0.5) * 0.16, y: R.y, seed: rr(), phase: rr() * 3, type: Math.floor(rr() * 4), h, w: 0.93 + rr() * 0.14,
        turn: (rr() - 0.5) * 0.9, wake: 0, glow: 0, lean: 0, rl: 0, wall: 0, u: 0.5, mesh: null, slot: 0 });
    }
  });
  // the bodies are baked in the background (a generator advanced in update() with a time budget per frame): create() returns at once
  const tCreate = performance.now();
  const types = [], jobs = [];
  const crowdMat = makeMaterial('crowd');
  const bandGroups = [new THREE.Group(), new THREE.Group()]; for (const g of bandGroups) object.add(g);
  const meshes = [];
  function buildType(t) {
    for (let b = 0; b < 2; b++) for (let s = 0; s < NSEC; s++) {
      const list = crowd.filter((c) => c.band === b && c.type === t && Math.floor((((c.a0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / NSEC)) === s);
      if (!list.length) continue;
      const buf = instBuf(list.length), A = buf.array, cen = new THREE.Vector3();
      list.forEach((c, k) => {
        c.slot = k; const x = Math.cos(c.a0) * c.r, z = Math.sin(c.a0) * c.r; c.x = x; c.z = z; cen.x += x; cen.z += z;
        const o = k * 16; A[o] = x; A[o + 1] = c.y; A[o + 2] = z; A[o + 3] = c.h; A[o + 8] = c.seed * 97; A[o + 11] = Math.atan2(-x, -z); A[o + 12] = c.turn; A[o + 13] = c.w;
      });
      cen.multiplyScalar(1 / list.length); cen.y = 1.5;
      let rad = 0; for (const c of list) rad = Math.max(rad, Math.hypot(c.x - cen.x, c.z - cen.z));
      const mesh = new THREE.Mesh(makeGeo(types[t], buf, list.length, new THREE.Sphere(cen, rad + 2.2)), crowdMat);
      mesh.frustumCulled = !flying;
      bandGroups[b].add(mesh);
      const M = { list, buf, mesh }; meshes.push(M); for (const c of list) c.mesh = M;
    }
  }

  // ---- the pressers: a figure that comes to the wall and lays its palm on the visitor's hand
  const NPR = 12;
  const prBuf = instBuf(NPR), prMat = makeMaterial('press');
  let pbody = null, prMesh = null;
  jobs.push({ gen: bakeBodyGen(BUILDS[0], REST, PRESS, { grid: 0.02, detail: true, seed: 99, shards: 34 }), done: (body) => {
    pbody = body; prMesh = new THREE.Mesh(makeGeo(vertexAttrs(body), prBuf, NPR), prMat); prMesh.frustumCulled = false; object.add(prMesh);
  } });
  for (let bi = 0; bi < 2; bi++) for (let vi = 0; vi < 2; vi++) {
    const t = bi * 2 + vi;
    const set = bi === 0 ? CROWD[vi] : CROWD[vi].map((sp, k) => (k !== 1 ? sp : { ...sp, hands: sp.hands.map((h) => V(h[0] * 1.1, h[1] - 0.14, h[2] - 0.02)) }));
    jobs.push({ gen: bakeBodyGen(BUILDS[bi], REST, set, { grid: 0.028, detail: false, seed: 11 + bi * 7 + vi, shards: 26 }), done: (body) => { types[t] = vertexAttrs(body); buildType(t); } });
  }
  const pressers = [];
  for (let i = 0; i < NPR; i++) pressers.push({ stroke: null, wall: 0, target: new THREE.Vector3(), held: 0, app: 0, contact: 0, seed: (i * 0.618) % 1 });
  const createMs = Math.round(performance.now() - tCreate); let readyMs = 0;

  // ---- the glow on the far side of the wall at each hand (immediate): view-facing soft discs just behind the wall plane
  const NG = 32;
  const gA = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4); gA.setUsage(THREE.DynamicDrawUsage);
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  gGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  gGeo.setIndex([0, 1, 2, 0, 2, 3]); gGeo.setAttribute('g0', gA); gGeo.instanceCount = NG;
  {
    const g0 = attribute('g0', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(g0.xyz, 1));
    m.vertexNode = select(g0.w.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(0.28)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const d = uv().sub(0.5).mul(2), r2 = dot(d, d);
    m.colorNode = vec3(1.0, 0.45, 0.18).mul(exp(r2.mul(-7)).mul(0.22).add(exp(r2.mul(-30)).mul(0.3))).mul(g0.w).mul(uGain);   // tight: the light is born in the palm, no cloud
    m.fog = false;
    const gm = new THREE.Mesh(gGeo, m); gm.frustumCulled = false; gm.renderOrder = 5; object.add(gm);
  }
  const glows = []; for (let i = 0; i < NG; i++) glows.push({ stroke: null, pos: new THREE.Vector3(), v: 0, on: false });

  // ---- the earth: terraces under the rings, dark clay warmed a little by the crowd above it
  const NPR_G = 12, pressVec = []; for (let i = 0; i < NPR_G; i++) pressVec.push(new THREE.Vector4(0, 0, 0, 0));
  const uPress = TSL.uniformArray(pressVec);
  {
    const pts = [new THREE.Vector2(3.0, 0)];
    RINGS.forEach((R, i) => { const r0 = R.r - 0.28; if (i > 0) pts.push(new THREE.Vector2(r0, RINGS[i - 1].y), new THREE.Vector2(r0 + 0.02, R.y)); });
    const last = RINGS[RINGS.length - 1];
    pts.push(new THREE.Vector2(last.r + 0.5, last.y), new THREE.Vector2(last.r + 0.55, 3.0), new THREE.Vector2(30, 3.0));
    const geo = new THREE.LatheGeometry(pts, 192);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const pw = varying(TSL.positionWorld), nw = varying(TSL.normalWorld);
    const lit = clamp(TSL.abs(dot(normalize(nw), normalize(vec3(0, 12, 0).sub(pw)))).add(0.3).div(1.3), 0, 1);
    const rad = TSL.length(pw.xz);
    const warm = uniform(0); m.userData.warm = warm;
    const grain = fract(sin(dot(pw.xz.mul(40).floor(), vec2(12.9898, 78.233))).mul(43758.5453)).mul(0.25).add(0.85);
    // under each figure that comes to press: a warm pool of light from its glow, with a soft contact shadow at its feet
    const pool = TSL.Fn(() => {
      const acc = vec2(0, 1).toVar();
      TSL.Loop(NPR_G, ({ i }) => {
        const q = uPress.element(i), d = TSL.length(pw.xz.sub(q.xy));
        acc.x.addAssign(exp(d.mul(d).mul(-0.9)).mul(q.z));
        acc.y.mulAssign(float(1).sub(float(1).sub(smoothstep(0.12, 0.5, d)).mul(q.w)));
      });
      return acc;
    })();
    const base = vec3(0.05, 0.022, 0.014).mul(lit).mul(grain).mul(uLight).mul(float(0.12).add(warm.mul(0.8))).mul(smoothstep(8.6, 6.0, rad));
    m.colorNode = base.add(vec3(0.55, 0.2, 0.07).mul(pool.x).mul(grain).mul(0.4).mul(uGain)).mul(pool.y).mul(uArrive).mul(float(1).sub(uLeave));
    m.fog = false;
    const ground = new THREE.Mesh(geo, m); ground.frustumCulled = false; object.add(ground);
    object.userData.ground = m;
  }

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

  // ---- state
  const fills = new Float32Array(NW), pulseT = new Float32Array(NW).fill(-99), prevFill = new Float32Array(NW);
  const rot = new Float32Array(2);
  let closeT = -99, closedS = 0, prevClosed = 0, dryS = 0, flying = false;
  const NR = RINGS.length;

  function update(dt, input) {
    dt = Math.min(0.1, dt || 0.016);
    if (jobs.length) {                                   // bake a little more (≈ 8 ms a frame)
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) { const r = jobs[0].gen.next(); if (r.done) { jobs[0].done(r.value); jobs.shift(); } }
      if (!jobs.length) readyMs = Math.round(performance.now() - tCreate);
    }
    const prm = input.params || P, time = input.time ?? 0, st = input.state;
    uTime.value = time;
    uGain.value = prm.glow ?? 1; uLight.value = prm.light ?? 1; uBreath.value = prm.breath ?? 1;
    const leave = input.leave ?? (prm.leave ?? 0), arrive = input.arrive ?? (prm.arrive ?? 1);
    uLeave.value = clamp01(leave); uArrive.value = clamp01(arrive);
    // shards far from home: no culling while they fly
    const fly = uLeave.value > 0 || uArrive.value < 1;
    if (fly !== flying) { flying = fly; for (const M of meshes) M.mesh.frustumCulled = !fly; }
    let closed, dryT;
    if (st && st.fill) {
      for (let i = 0; i < NW; i++) fills[i] = st.fill[i] ?? 0;
      closed = st.closed ?? 0;
      const after = ['tronc', 'pom', 'crown', 'festa', 'baixada', 'fall', 'acta'].includes(st.block);
      dryT = after ? 1 : st.block === 'pinya' && st.phase === 'reward' ? clamp01((st.tp ?? 0) / 6) : 0;
      if (st.block === 'pinya' && st.phase === 'reward') closed = 1;
      for (const e of input.events || []) {
        if (e.startsWith('wall:')) pulseT[+e.slice(5) % NW] = time;
        else if (e === 'close') closeT = time;
      }
    } else {
      const f = clamp01(prm.fill ?? 0);
      for (let i = 0; i < NW; i++) fills[i] = f;
      closed = clamp01(prm.closed ?? 0); dryT = clamp01(prm.dry ?? 0);
      for (let i = 0; i < NW; i++) { if (prevFill[i] < 1 && fills[i] >= 1) pulseT[i] = time; prevFill[i] = fills[i]; }
      if (prevClosed < 1 && closed >= 1) closeT = time; prevClosed = closed;
    }
    dryS += (dryT - dryS) * Math.min(1, dt * 1.5); uDry.value = dryS;
    closedS += (closed - closedS) * Math.min(1, dt * 1.2);
    const spin = 0.035 * clamp01((closedS - 0.5) * 2) * (1 - dryS);
    for (let b = 0; b < 2; b++) { rot[b] += dt * spin * (b ? -1 : 1); bandGroups[b].rotation.y = rot[b]; }
    const hands = input.hands || [];

    // ---- the crowd, per body (world angle = band-local angle − band rotation)
    const kUpG = 1 - Math.exp(-dt * 28), kDnG = 1 - Math.exp(-dt * 1.4), kW = 1 - Math.exp(-dt * 1.1), kL = 1 - Math.exp(-dt * 1.6);
    const a0w = Math.atan2(walls[0].centre.z, walls[0].centre.x);
    let warmSum = 0;
    for (const M of meshes) {
      const A = M.buf.array;
      for (const c of M.list) {
        const a = c.a0 - rot[c.band], x = Math.cos(a) * c.r, z = Math.sin(a) * c.r;
        wallOf(x, z, c);
        const f = fills[c.wall];
        const order = 0.6 * (c.ring / (NR - 1)) + 0.3 * Math.abs(c.u - 0.5) * 2 + 0.1 * c.seed;
        const alive = clamp01((f * 1.12 - order + 0.04) / 0.12) * clamp01(f * 20);
        let infl = 0;
        for (const h of hands) {
          let d = a - Math.atan2(h.pos.z, h.pos.x); d = Math.atan2(Math.sin(d), Math.cos(d));
          const lat = d * c.r; infl += Math.exp(-(lat * lat) / 0.45) * Math.exp(-c.ring * 0.75);   // local: the bodies right behind the hand
        }
        infl = Math.min(1, infl);
        const tp = time - pulseT[c.wall] - c.ring * 0.22, pulse = tp > 0 ? Math.exp(-tp * 2.2) * Math.min(1, tp * 12) * 1.2 : 0;
        let ca = a - a0w; ca = Math.abs(Math.atan2(Math.sin(ca), Math.cos(ca))) / Math.PI;
        const tc = time - closeT - ca * 2.2, cw = tc > 0 ? Math.exp(-tc * 1.8) * Math.min(1, tc * 10) * 1.0 : 0;
        const rlT = clamp01(closedS * 1.4 - ca * 0.4);
        c.wake += (Math.max(alive, infl * 0.9, rlT) - c.wake) * kW;
        const band = 0.5 + 0.5 * Math.sin(a - time * 0.55 + c.ring * 0.35);   // ONE pool of warmth that walks round the ring
        // the warmth: modest where the wall is full (a flicker of life per body), strong where a hand is, a band that turns when closed
        // a full wall is not an evenly lit mass: a few bodies smoulder in turn (embers), the rest stays dark; the light is the hands'
        const em = 0.5 + 0.5 * Math.sin(time * (0.12 + c.seed * 0.18) + c.seed * 40), ember = em * em * em * em * em * em;
        const b8 = band * band * band * band, b16 = b8 * b8;   // the closed ring: a narrow band of warmth that turns, the rest dark
        const gT = alive * (0.04 + 0.5 * ember) * (1 - rlT * 0.5) + infl * 0.85 + pulse + cw + rlT * b16 * 0.9;
        c.glow += (gT - c.glow) * (gT > c.glow ? kUpG : kDnG);
        c.lean += (infl * 0.5 - c.lean) * kL;
        c.rl += (rlT - c.rl) * kW;
        warmSum += c.glow;
        const s = c.slot * 16;
        A[s + 4] = c.wake * (1 - c.rl); A[s + 5] = c.glow; A[s + 6] = c.lean; A[s + 7] = c.rl;
        A[s + 9] = c.phase * (1 - closedS * 0.8); A[s + 10] = time * 2.2 * (spin > 0 ? 1 : 0) + c.ring * 1.7; A[s + 12] = c.turn * (1 - c.rl * 0.8);
      }
      M.buf.needsUpdate = true;
    }
    object.userData.ground.userData.warm.value = (warmSum / crowd.length) * 0.6;

    // ---- the hands: glow at once; a figure comes to press
    for (const g of glows) g.on = false;
    const press = prm.press !== false;
    for (const h of hands) {
      const g = glows.find((q) => q.stroke === h.stroke) || glows.find((q) => q.v < 0.01 && !q.on);
      if (g) { if (g.stroke !== h.stroke) g.pos.copy(h.pos); g.stroke = h.stroke; g.on = true; g.pos.lerp(h.pos, 0.5); g.pos.addScaledVector(h.normal, -0.01); }
      if (!press) continue;
      let p = pressers.find((q) => q.stroke === h.stroke);
      if (!p) {
        if (pressers.some((q) => q.held > 0 && q.wall === h.wall && q.target.distanceTo(h.pos) < 0.5)) continue;
        p = pressers.find((q) => q.stroke === null && q.app < 0.01) || null;
        if (!p) continue;
        p.stroke = h.stroke; p.wall = h.wall; p.target.copy(h.pos); p.contact = 0;
      }
      p.held = 1.2; p.target.lerp(h.pos, Math.min(1, dt * 4));
    }
    const ga = gA.array;
    glows.forEach((g, i) => { g.v = g.on ? Math.min(1, g.v + dt * 14) : Math.max(0, g.v - dt * 1.2); if (!g.on && g.v <= 0) g.stroke = null; ga[i * 4] = g.pos.x; ga[i * 4 + 1] = g.pos.y; ga[i * 4 + 2] = g.pos.z; ga[i * 4 + 3] = g.v * (1 - uLeave.value); });
    gA.needsUpdate = true;
    const B = prBuf.array;
    if (pbody) pressers.forEach((p, i) => {
      if (p.stroke !== null && !hands.some((h) => h.stroke === p.stroke)) { p.held -= dt; if (p.held <= 0) p.stroke = null; }
      const going = p.stroke !== null;
      p.app = going ? Math.min(1, p.app + dt / 2.2) : Math.max(0, p.app - dt / 2.6);
      p.contact = going && p.app > 0.97 ? p.contact + dt : Math.max(0, p.contact - dt * 2);
      const w = walls[p.wall], F = w.normal, yaw = Math.atan2(F.x, F.z);
      const h = clamp01((p.target.y - 1.0) / 0.72);
      const pl = pbody.palm[1], ph = pbody.palm[2];
      const px = pl[0] + (ph[0] - pl[0]) * h, py = pl[1] + (ph[1] - pl[1]) * h, pz = pl[2] + (ph[2] - pl[2]) * h;
      // the body origin puts the palm (body-local px, py, pz) on the hand, 6 mm behind the wall plane
      const Xx = Math.cos(yaw), Xz = -Math.sin(yaw);
      const e = p.app * p.app * (3 - 2 * p.app), back = (1 - e) * 1.7 + 0.006;
      const oy = Math.max(-0.2, Math.min(0.25, p.target.y - py));
      const o = i * 16;
      B[o] = p.target.x - Xx * px - F.x * (pz + back); B[o + 1] = oy * e; B[o + 2] = p.target.z - Xz * px - F.z * (pz + back); B[o + 3] = 1;
      pressVec[i].set(B[o], B[o + 2], p.app * (0.35 + Math.min(1, p.contact) * 0.65), p.app);
      B[o + 4] = p.app; B[o + 5] = h; B[o + 6] = 0.03 + p.app * 0.1; B[o + 7] = p.contact;
      B[o + 8] = p.seed * 50; B[o + 9] = i * 0.7; B[o + 10] = p.app > 0.001 ? 1 : 0; B[o + 11] = yaw; B[o + 12] = 0; B[o + 13] = 1;
    });
    prBuf.needsUpdate = true;
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999;
  }
  function dispose() { for (const M of meshes) M.mesh.geometry.dispose(); crowdMat.dispose(); prMesh?.geometry.dispose(); prMat.dispose(); gGeo.dispose(); jobs.length = 0; }
  if (typeof window !== 'undefined') window.__pinya3d = { bodies: crowd.length, get meshes() { return meshes.length; }, get verts() { return types.map((t) => t.at.position.count); }, get presserVerts() { return pbody?.n; }, createMs, get readyMs() { return readyMs; }, pressers };
  return { object, update, setParams() {}, dispose };
}
