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
import { createGuideBeam } from './pinya3d/guidebeam.js';
import * as handoff from './pinya3d/handoff.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------- bodies and poses
// a body faces +z (the room); the wall is in front of it at body-local z ≈ ZW. Poses: push low · push high · push the back in front
const BUILDS = [{ s: 1.0, sh: 0.19, hip: 0.092, hipW: 0.15, chest: 0.178 }, { s: 0.95, sh: 0.172, hip: 0.1, hipW: 0.168, chest: 0.162 }];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
const ZW = 0.46;
// first row: A = both palms on the wall · B = the right palm on the wall, the left arm over the neighbour's shoulder
const PUSH_A = [
  // push low: the weight forward, head down between the arms, one foot back
  { lean: 0.3, hunch: 0.14, head: 0.32, feet: [V(0.12, 0.07, 0.14), V(-0.11, 0.07, -0.2)], hands: [V(0.2, 0.9, ZW - 0.04), V(-0.18, 0.94, ZW - 0.04)],
    hf: [{ fd: [0.15, 1, 0], pn: [0, 0, 1] }, { fd: [-0.15, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.55) },
  // push high: upright, arms up, palms flat on the wall
  { lean: 0.14, hunch: 0.06, head: 0.22, feet: [V(0.12, 0.07, 0.12), V(-0.11, 0.07, -0.14)], hands: [V(0.2, 1.6, ZW - 0.02), V(-0.18, 1.65, ZW - 0.02)],
    hf: [{ fd: [0.12, 1, 0], pn: [0, 0, 1] }, { fd: [-0.12, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.6) }];
const SHOULDER = { fd: [1, -0.25, 0], pn: [0, -1, 0] };
const PUSH_B = [
  { lean: 0.22, hunch: 0.1, head: 0.2, turn: -0.25, feet: [V(0.13, 0.07, 0.08), V(-0.1, 0.07, -0.16)], hands: [V(0.5, 1.3, 0.02), V(-0.17, 0.95, ZW - 0.04)],
    hf: [SHOULDER, { fd: [-0.1, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.45) },
  { lean: 0.1, hunch: 0.04, head: 0.05, turn: -0.3, feet: [V(0.13, 0.07, 0.06), V(-0.1, 0.07, -0.14)], hands: [V(0.5, 1.36, 0.0), V(-0.16, 1.66, ZW - 0.02)],
    hf: [SHOULDER, { fd: [-0.1, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.6) }];
// the rows behind (pinya3d's postures): hands flat on the back in front · arms over the neighbours' shoulders · one arm round the
// neighbour, the other pushing the back in front · hands on the back, the head turned
const BACK = [
  { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.12, 0.07, -0.1), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)],
    hf: [{ fd: [0, 0.5, 0.2], pn: [0, 0, 1] }, { fd: [0, 0.5, 0.2], pn: [0, 0, 1] }], elbow: V(0, -1, -0.2) },
  { lean: 0.08, hunch: 0.06, head: 0.12, feet: [V(0.12, 0.07, 0.05), V(-0.12, 0.07, -0.04)], hands: [V(0.52, 1.36, -0.02), V(-0.5, 1.34, 0.03)],
    hf: [SHOULDER, { fd: [-1, -0.25, 0], pn: [0, -1, 0] }], elbow: V(0, -1, -0.4) },
  { lean: 0.14, hunch: 0.12, head: 0.25, feet: [V(0.11, 0.07, 0.08), V(-0.12, 0.07, -0.08)], hands: [V(0.5, 1.33, 0.04), V(-0.12, 1.12, 0.45)],
    hf: [SHOULDER, { fd: [0, 0.4, 0.3], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) },
  { lean: 0.2, hunch: 0.18, head: 0.3, turn: 0.45, feet: [V(0.12, 0.07, -0.08), V(-0.12, 0.07, 0.08)], hands: [V(0.2, 1.18, 0.45), V(-0.12, 1.3, 0.46)],
    hf: [{ fd: [0.2, 0.5, 0.2], pn: [0, 0, 1] }, { fd: [-0.1, 0.5, 0.2], pn: [0, 0, 1] }], elbow: V(0, -1, -0.2) }];
// four body types: [build, front variant, back posture, both palms on the wall]
const TYPES = [[0, PUSH_A, BACK[0], true], [1, PUSH_B, BACK[1], false], [0, PUSH_B, BACK[2], false], [1, PUSH_A, BACK[3], true]];
const NPT_F = 1900, NPT_B = 950;    // points per body: the front row (seen close) · the rows behind
const COL = 0.56, ROW = 0.6;        // column spacing along the wall · row spacing behind
const D0 = 0.012;                   // the palm sits this far behind the wall plane
const SPREAD = 2.1;                 // open hands, the fingers apart: that is where our palm meets theirs

// palms (body-local, build scale 1) per pose: right = the anchor (meets the visitor's hand), left = the neighbour's side
function palmsOf(B, specs) {
  return specs.map((sp) => { const k = pose(sp, B); const at = (w, f) => [w[0] + f.fd[0] * 0.05 * k.s + f.pn[0] * 0.019 * k.s, w[1] + f.fd[1] * 0.05 * k.s + f.pn[1] * 0.019 * k.s, w[2] + f.fd[2] * 0.05 * k.s + f.pn[2] * 0.019 * k.s];
    return { R: at(k.wR, k.hfR), L: at(k.wL, k.hfL) }; });
}

export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, uniformArray, int, select, vec2, vec3, vec4, float, clamp, mix, smoothstep, sin, cos, max, min, abs, normalize, varying, fract,
    cameraPosition, cameraProjectionMatrix, modelViewMatrix, modelWorldMatrix, dot, exp, pow, length } = TSL;
  const P = params || {};
  const object = new THREE.Group(); object.name = 'pinya3d2';
  // ---- the opening that teaches (director 26-11, as the correfoc's): while the voice explains, the guide beam runs round the room and
  // presses on a point of each wall (P4, P1, P2, P3, one after another); at each press a being is born there, pushing against the light
  // as against a hand — four beings, one a wall, and the net begins. Then the room plays (its hands work from the first second).
  // Times: params.intro = { start, walls: [t0, t1, t2, t3], hold } in s from the block's start (input.t); intro: false = off.
  const INTRO = { start: 0.5, walls: [3.0, 5.0, 7.0, 9.0], hold: 0.5 };   // the recorded voice (26-11): 0.5 «The pinya is the base…», 5.5 «Touch the wall…», 11 «Fill the room.»
  const beam = createGuideBeam({ THREE, TSL, room }); object.add(beam.object);
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
  // ONE red matter for the hand's fibres and the thread: deep red, coral where a pulse or a growing tip passes
  const redMatter = (k) => mix(tc(RED), vec3(1.0, 0.3, 0.2), clamp(k, 0, 1));
  // the colour script: cold blue-grey → a soft reddish light (linear RGB)
  const COLD = [0.34, 0.42, 0.56], WARM = [1.0, 0.27, 0.19], RED = [0.85, 0.05, 0.035], BONE = [0.87, 0.78, 0.7];
  // the colour script: params.cool (the dark's cold) and params.warm (the red of the full room) override these, eased here (~1.5 s)
  const uCool = uniform(new THREE.Vector3(...COLD)), uWarmC = uniform(new THREE.Vector3(...WARM));
  // leaveTo 'dust' (default): at the end the beings do not go, they let go into dust that stays in the air (uDust 1) and fades only with
  // the host's leave or params.dust; the tower takes it (handoff 'pinya') and builds its ronda out of it
  const uDust = uniform(1), uDustK = uniform(1);

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
      for (let t = 0; t < 6 && body.aAux2[v * 4 + 1] === 1 && body.aAux2[v * 4] > 0.89 && r() > 0.45; t++) v = Math.floor(r() * body.n);
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
    const driftGo = vec3(r1.sub(0.5).mul(1.3).add(sin(uTime.mul(0.5).add(r2.mul(40))).mul(0.15).mul(g0)), g0.mul(g0).mul(r2.mul(2.4).add(1.2)).add(g0.mul(0.25)), r3.sub(0.65).mul(1.2)).mul(g0);
    const driftDust = vec3(r1.sub(0.5).mul(0.9).add(sin(uTime.mul(0.3).add(r2.mul(40))).mul(0.08)), r2.mul(0.9).add(0.4).add(sin(uTime.mul(0.25).add(r3.mul(30))).mul(0.06)), r3.sub(0.5).mul(0.9).add(cos(uTime.mul(0.27).add(r1.mul(25))).mul(0.08))).mul(g0);
    const drift = mix(driftGo, driftDust, uDust);
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
    const handK = smoothstep(0.998, 0.9999, aux2.y).mul(smoothstep(0.885, 0.895, aux2.x));   // the detailed hands: finer points, so fingers read
    const size = float(0.0042).add(co.z.mul(0.0045)).mul(float(1).sub(handK.mul(0.45))).mul(float(1).sub(e).mul(0.8).add(1)).mul(float(1).sub(g0.mul(0.55)));
    const d = ndcScale(pv, c0, size), k = max(float(1), uMinPt.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(co.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w);
    const vN = varying(modelWorldMatrix.mul(vec4(nl, 0)).xyz), vP = varying(modelWorldMatrix.mul(vec4(local, 1)).xyz);
    const vCo = varying(co), vNdc = varying(c0.xy.div(c0.w));
    const vA = varying(vec4(e, g0, float(1).div(k.mul(k)), clamp(p.y.div(1.7), 0, 1)));
    const vB = varying(vec4(i1.w, i3.z, i3.w, row)), vC = varying(vec4(aux2.x, aux2.y, aux.w, sh.w));
    const q = vCo.xy; m.opacityNode = float(1).sub(smoothstep(0.999, 1.001, dot(q, q))).mul(max(float(1).sub(uDust.mul(smoothstep(0.3, 0.9, vA.y))), smoothstep(0.02, 0.03, uDustK))); m.alphaTest = 0.5;
    // light: the silhouette catches it (rim), soft ambient occlusion, the legs sink into the dark, the rows behind are dimmer
    const N = normalize(vN), Vd = normalize(cameraPosition.sub(vP));
    const rim = pow(float(1).sub(abs(dot(N, Vd))), 2.2);
    const ao = vC.x.mul(0.6).add(0.4), low = smoothstep(0.02, 0.75, vA.w).mul(0.85).add(0.15);
    const warm = clamp(uWarm, 0, 1);
    const base = mix(uCool, uWarmC, min(warm.mul(warm.mul(-0.4).add(1.2)), 1)).mul(mix(float(0.75), float(1.15), vCo.z));
    const rowK = mix(float(1), float(0.55), vB.w);
    let col = base.mul(float(0.26).mul(rim.mul(1.9).add(0.28)).mul(ao).mul(low).mul(rowK).mul(uLight).mul(warm.mul(0.5).add(0.8)));
    const twk = pow(sin(uTime.mul(vCo.z.mul(2.2).add(0.5)).add(vCo.w.mul(60))).mul(0.5).add(0.5), 28);
    col = col.mul(twk.mul(2.2).add(1));
    // the hand's answer: the palm that meets the visitor glows (contact), the newborn being shines and settles (born flash)
    const palmK = exp(vC.z.mul(vC.z).mul(-14)), contact = vB.z.mul(palmK.mul(0.55).add(rim.mul(0.12)));
    const flashC = vB.y.mul(rim.mul(0.6).add(0.25)).mul(0.55);
    const glowC = mix(vec3(0.75, 0.85, 1.0), uWarmC, warm.mul(0.7).add(0.3));
    col = col.add(glowC.mul(contact.add(flashC).add(vB.x.mul(rim).mul(0.35))).mul(uGlow).mul(0.5));
    // assembling and dissolving points are motes of light: brighter, cooler, then thin out
    const mote = float(1).sub(vA.x).add(vA.y.mul(0.8));
    col = col.add(mix(uCool, glowC, warm).mul(mote.mul(twk.mul(0.6).add(0.05)).mul(0.25)));
    const fade = smoothstep(0.0, 0.25, vA.x).mul(mix(float(1).sub(smoothstep(0.5, 1.0, vA.y)), mix(float(1), uDustK, smoothstep(0.3, 0.9, vA.y)), uDust));
    col = col.mul(float(1).sub(calmOf(vNdc)));
    m.colorNode = col.mul(fade).mul(vA.z.mul(0.5).add(0.5));
    m.fog = false;
    return m;
  }

  // ---- slots: columns along every wall × rows behind (capacity); beings take them as hands call them
  const ROWS = 4;
  const cols = walls.map((w) => { const n = Math.max(1, Math.floor((w.width - 0.5) / COL) + 1), x0 = -((n - 1) * COL) / 2; return Array.from({ length: n }, (_, j) => x0 + j * COL); });
  const pending = [];
  const beings = [];      // { wall, col, row, x, y (palm height, front), s, born, gone, type, seed, ... }
  const grid = cols.map((c) => c.map(() => new Array(ROWS).fill(null)));
  const meshes = [];      // [type][wall][front 0 / back 1] → { mesh, buf, list }
  const types = [];
  let palms = [];
  const ptMat = pointMaterial();
  const jobs = [];
  const tCreate = performance.now(); let readyMs = 0;
  const ready = [];       // the types baked so far (a hand that lands before any is ready waits in `pending`)
  for (let t = 0; t < TYPES.length; t++) {
    const [bi, front, back] = TYPES[t];
    jobs.push({ gen: bakeBodyGen(BUILDS[bi], REST, [front[0], front[1], back], { grid: 0.022, detail: true, seed: 31 + t * 9, shards: 24, spread: SPREAD }), done: (body) => {
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
      ready.push(t);
    } });
  }
  palms = TYPES.map(([bi, front, back]) => palmsOf(BUILDS[bi], [front[0], front[1], back]));

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
    const gc = mix(vec3(0.7, 0.82, 1.0), uWarmC, uWarm.mul(0.8).add(0.1));
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

  // ---- THE RED NETWORK (Beltrán 26-11: «los cables deben ir uniendo las manos entre los personajes cercanos, y ése es el hilo»):
  // every being, once formed, stretches fine red threads (Vicente's ribbons) from its palms to the palms of its near neighbours —
  // beside it in its row, and in front or behind when close. Palm to palm, never loose. Few beings: a few threads; as the room fills the
  // net thickens, joins the groups and closes round the room (360°, P3 → P4 too: distances are 3D, a thread bends behind the corner).
  // A new thread grows from the newborn's palm and a pulse runs along it when it hooks; the hand that called a being drags its threads.
  const NE = 420, ES = 14;
  const net = lineBuffer(NE, ES);
  {
    const pos = attribute('position', 'vec3'), tg = attribute('aT', 'vec3'), aF = attribute('aF', 'vec4');
    const t = aF.x, side = aF.y, grow = aF.z, t0 = aF.w;
    const sway = sin(uTime.mul(0.6).add(t0.mul(13.7)).add(t.mul(3))).mul(0.006).mul(sin(t.mul(Math.PI)));
    const p = pos.add(vec3(0, sway, 0)).add(vec3(0, uLeave.mul(uLeave).mul(1.2), 0));
    const pv = modelViewMatrix.mul(vec4(p, 1)), tv = modelViewMatrix.mul(vec4(tg, 0)).xyz;
    const rb = ribbon(pv, tv, float(0.0021), side, uMinFb);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = TSL.select(grow.greaterThan(0.001), rb.pos, vec4(0, 0, 2, 1));
    // it grows from the newborn's palm (t = 0) to the other palm; a pulse runs along as it hooks, then now and then a slow one
    const vis = float(1).sub(smoothstep(grow.sub(0.03), grow, t));
    const vT = varying(t), vS = varying(side), vA = varying(vis.div(rb.k)), vT0 = varying(t0);
    const age = uTime.sub(vT0), run = age.mul(1.4);
    const hook = exp(vT.sub(run).mul(vT.sub(run)).mul(-60)).mul(smoothstep(2.2, 0.6, age)).add(exp(age.sub(0.75).mul(age.sub(0.75)).mul(-8)).mul(0.6).mul(exp(vT.sub(1).mul(vT.sub(1)).mul(-30)).add(exp(vT.mul(vT).mul(-30)))));
    const slow = pow(sin(vT.mul(5).sub(uTime.mul(0.8)).add(vT0.mul(7.3))).mul(0.5).add(0.5), 12).mul(0.5);
    const ends = exp(vT.mul(vT).mul(-200)).add(exp(vT.sub(1).mul(vT.sub(1)).mul(-200))).mul(0.6);   // a small knot of light at each palm
    const k = hook.add(slow).add(ends);
    m.colorNode = redMatter(k).mul(k.mul(1.3).add(0.42)).mul(float(1).sub(vS.mul(vS))).mul(vA).mul(uGlow).mul(float(1).sub(uLeave)).mul(1.25);
    m.fog = false;
    const mesh = new THREE.Mesh(net.g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; object.add(mesh);
  }
  const NS = 384, cov = new Uint8Array(NS);                    // threadCover: the share of the perimeter the connected net spans
  const edges = new Map();                                     // key → { a, b, sa, sb (palm sides), t0, from, len }
  let netT = -9, netN = -1, joins = 0;

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
    const c = mix(uCool, uWarmC, uWarm.mul(0.85)).mul(float(1).sub(smoothstep(0.2, 1.0, r2))).mul(twk.mul(1.6).add(0.25))
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
  let endFrom = 0, beingId = 0, dustSent = false; const tmpC3 = new THREE.Vector3();   // the end starts where the last being was called and travels both ways round the room
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
    if (!ready.length) { if (!opt.auto && pending.length < 16) pending.push([w, x, y]); return null; }
    const c = claim(w, x); if (!c) return null;
    // a first-row being with nobody on its left (seen from the room: towards wall.right) pushes with both palms: an arm over a missing
    // neighbour's shoulder would read as an arm thrown out
    let pool = ready;
    if (c.row === 0) {
      const xr0 = cols[w][c.j]; const hasN = beings.some((q) => q.wall === w && q.row === 0 && q.x > xr0 + 0.2 && q.x < xr0 + 0.8);
      if (!hasN) { const A = ready.filter((t) => TYPES[t][3]); if (A.length) pool = A; }
    }
    const type = pool[Math.floor(rr() * pool.length)];
    const xr = c.row === 0 ? (c.j === claimNearest(w, x) && Math.abs(x - cols[w][c.j]) < COL * 0.7 ? x : cols[w][c.j] + (rr() - 0.5) * 0.08) : cols[w][c.j] + (rr() - 0.5) * 0.1;
    const front = c.row === 0 ? null : grid[w][c.j][0];
    const b = { id: ++beingId, wall: w, j: c.j, row: c.row, x: c.row && front ? front.x + (rr() - 0.5) * 0.1 : xr, y: c.row === 0 ? (opt.y ?? (1.05 + rr() * 0.55)) : 1.25, yT: 0, type, seed: rr(), phase: rr() * 9,
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
    const A = b.M.buf.array, o = b.k * 16, w = b.wall, W = walls[w], B = BUILDS[TYPES[b.type][0]], pl = palms[b.type];
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
    // both palms in the part's space (the threads' ends): front row from its push poses, the rows behind from their posture
    const palmAt = (q, out) => out.set(A[o] + Xx * q[0] * ws * hs + W.normal.x * q[2] * ws * hs, oy + q[1] * hs, A[o + 2] + Xz * q[0] * ws * hs + W.normal.z * q[2] * ws * hs);
    const lerp3 = (u, v, k) => [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, u[2] + (v[2] - u[2]) * k];
    if (!b.pR) { b.pR = new THREE.Vector3(); b.pL = new THREE.Vector3(); b.dragP = new THREE.Vector3(); b.dragK = 0; }
    if (b.row === 0) { palmAt(lerp3(pl[0].R, pl[1].R, hp), b.pR); palmAt(lerp3(pl[0].L, pl[1].L, hp), b.pL); } else { palmAt(pl[2].R, b.pR); palmAt(pl[2].L, b.pL); }
    if (b.dragK > 0.001) b.pR.lerp(b.dragP, b.dragK);   // the hand that called it drags its threads
  }

  // ================================================================================================== update
  const invM = new THREE.Matrix4();
  const introTargets = (() => { const ids = ['P4', 'P1', 'P2', 'P3'], idx = ids.map((id) => walls.findIndex((w) => w.id === id)).filter((i) => i >= 0);
    return (idx.length === NW ? idx : walls.map((_, i) => i)).map((wi, k) => ({ wall: wi, x: k % 2 ? 0.95 : -0.95, y: 1.2 })); })();
  let introKey = '', introPlan = null, introEnd = -1, introOn = false; const introQ = [];
  const knownStrokes = new Set(), nowStrokes = new Set();
  function update(dt, input) {
    dt = Math.min(0.1, dt || 0.016);
    if (jobs.length) {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) { const r = jobs[0].gen.next(); if (r.done) { jobs[0].done(r.value); jobs.shift(); } }
      if (!jobs.length) readyMs = Math.round(performance.now() - tCreate);
    }
    if (ready.length && pending.length) { for (const q of pending.splice(0)) spawn(q[0], q[1], q[2], {}); }
    events.length = 0;
    const p = input.params || P;
    time = input.time ?? time + dt;
    // alone in the study, the dark of the chapter (in the work the host sets the background; suggested: the same, warming with fill())
    if (!input.state && room.setBackground) { const k = warmS; room.setBackground({ bottom: [0.0035 + 0.006 * k, 0.0045 + 0.0015 * k, 0.008], top: [0.008 + 0.01 * k, 0.011 + 0.002 * k, 0.02 - 0.004 * k], gain: 1 }); }
    uTime.value = time;
    uLight.value = p.light ?? 1; uGlow.value = p.glow ?? 1; uBreath.value = p.breath ?? 1;
    uLeave.value = clamp01(input.leave ?? p.leave ?? 0); uArrive.value = clamp01(input.arrive ?? p.arrive ?? 1);
    const hands = input.hands || [];
    object.updateMatrixWorld(); invM.copy(object.matrixWorld).invert();   // hands are on the world's walls; the part may hang from the host's rig

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
      const g = glows.find((q) => q.stroke === h.stroke); if (g) { g.pos.copy(h.pos).applyMatrix4(invM).addScaledVector(W.normal, -0.01); g.on = true; }
      // the being that answered this hand keeps its palm on it: it follows the height slowly, and glows where they meet
      const b = s.being;
      if (b && !b.dead && b.row === 0 && b.wall === h.wall && Math.abs(b.x - x) < 0.45) { b.yT = Math.max(0.55, Math.min(2.05, y)); b.held = time; }
      if (b && !b.dead) { b.dragHeld = time; if (b.dragP) b.dragP.copy(h.pos).applyMatrix4(invM).addScaledVector(W.normal, -0.012); }
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

    // ---- the opening: the guide beam presses, a being is born at each press (as for a hand: its palm on the light, its threads)
    {
      const intro = p.intro === false ? false : (p.intro ?? INTRO), key = JSON.stringify(intro);
      if (key !== introKey) { introKey = key; introPlan = beam.planOf(intro, introTargets); introEnd = introPlan ? Math.max(...introPlan.targets.map((q) => q.t + q.hold)) + 1.5 : -1; }
      const bt = input.t ?? time;
      for (const e of beam.update(dt, bt, introPlan)) {
        if (e.type !== 'press' && e.type !== 'hold') continue;
        const W = walls[e.wall], x = (e.pos.x - W.centre.x) * W.right.x + (e.pos.z - W.centre.z) * W.right.z;
        const b = spawn(e.wall, x, e.pos.y, {}); if (b) { b.flash = 1; b.contact = 1; b.held = time; }
        const g = glows.find((q) => q.stroke === null && q.a < 0.05) || glows[0];
        g.stroke = null; g.a = 1; g.pos.copy(e.pos).applyMatrix4(invM).addScaledVector(W.normal, -0.01);
        events.push(`intro:${e.i}`);
        introQ.push({ t: time + 0.9, wall: e.wall, x: x + (e.i % 2 ? -1 : 1) * COL, y: 1.05 + 0.3 * ((e.i * 7) % 3) / 2 });   // a companion beside it (as a held hand calls one): the first threads
      }
      for (let k = introQ.length - 1; k >= 0; k--) if (time >= introQ[k].t) { const q = introQ.splice(k, 1)[0]; spawn(q.wall, q.x, q.y, { auto: true }); }
      introOn = introPlan && bt < introEnd;
    }

    // ---- solo help: once the room has started, beings come out of the dark by themselves next to the groups
    const assist = p.assist ?? 0.35;   // beings / s
    if (!introOn && firstT >= 0 && assist > 0 && fullT < 0 && time - firstT > (p.assistDelay ?? 6) && beings.length) {
      assistAcc += dt * assist;
      while (assistAcc >= 1) {
        assistAcc -= 1;
        // half of them grow a random group; the other half go to the emptiest wall (next to its beings, or in from the corner of a
        // neighbour that has some): the room fills all round, not only where the hands are
        let a = beings[Math.floor(rr() * beings.length)], x = a.x + (rr() < 0.5 ? -1 : 1) * COL * (1 + Math.floor(rr() * 2)), w = a.wall;
        if (rr() < 0.5 + 0.4 * total) {
          let we = 0; for (let i = 1; i < NW; i++) if (fillW[i] < fillW[we]) we = i;
          const mine = beings.filter((q) => q.wall === we);
          if (mine.length) { a = mine[Math.floor(rr() * mine.length)]; w = we; x = a.x + (rr() < 0.5 ? -1 : 1) * COL * (1 + Math.floor(rr() * 2)); }
          else { const prev = fillW[(we + NW - 1) % NW] >= fillW[(we + 1) % NW]; w = we; x = (prev ? -1 : 1) * (walls[we].width / 2 - 0.35); }
        }
        spawn(w, x, 1.0 + rr() * 0.6, { auto: true });
      }
    }

    // ---- the fill, per wall and in total; density along the perimeter; the thread
    const fc = fillCount(); let alive = 0; fillW.fill(0);
    for (const b of beings) { alive++; fillW[b.wall]++; }
    for (let w = 0; w < NW; w++) fillW[w] = clamp01(fillW[w] / (fc * walls[w].width / PER));
    { let t = 0; for (let w = 0; w < NW; w++) t += Math.min(fillW[w], 1) * walls[w].width; total = clamp01(t / PER); }   // a crowded wall does not count for an empty one
    // ---- the red network: rebuilt when beings come (or every 0.5 s while a hand drags); each pair of near beings joined palm to palm
    if (beings.length !== netN || time - netT > 0.25) { netN = beings.length; netT = time; rebuildNet(p); }
    writeNet(dt);

    // ---- colour: from cold to warm with the fill (smooth, no step)
    const warmT = Math.min(1, (p.warm ?? 1) * smooth01(total * 1.05)) + (fullT >= 0 ? 0.1 : 0);
    warmS += (warmT - warmS) * Math.min(1, dt * 0.35); uWarm.value = warmS;
    { const kc = Math.min(1, dt / 1.5); if (Array.isArray(p.cool)) uCool.value.lerp(tmpC3.fromArray(p.cool), kc); if (Array.isArray(p.warm)) uWarmC.value.lerp(tmpC3.fromArray(p.warm), kc); }
    const dustMode = (p.leaveTo ?? 'dust') === 'dust';
    uDust.value = dustMode ? 1 : 0; uDustK.value = clamp01((p.dust ?? 1) * (1 - uLeave.value));

    // ---- full → hold → they let go into particles (the way out)
    let minW = 1; for (let w = 0; w < NW; w++) minW = Math.min(minW, fillW[w]);
    if (fullT < 0 && total >= (p.fullAt ?? 0.92) && minW >= (p.minWall ?? 0.6)) { fullT = time; events.push('full'); }
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
      const dragging = b.dragHeld != null && time - b.dragHeld < 0.35; b.dragK += ((dragging ? 1 : 0) - b.dragK) * Math.min(1, dt * (dragging ? 10 : 2.2));
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
    // the dust is in the air: publish where each being's dust hangs (room frame), for the tower to build its ronda out of it
    if (dustMode && ended && !dustSent && time - endT > endDur * 0.75) {
      dustSent = true; const n = beings.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), wc = uWarmC.value, cc = uCool.value;
      object.updateMatrixWorld();
      beings.forEach((b, i) => { const A = b.M?.buf?.array, o = b.k * 16; if (A && b.k >= 0) tmpC3.set(A[o], A[o + 1] + A[o + 3] * 0.85 + 0.8, A[o + 2]).applyMatrix4(object.matrixWorld); else tmpC3.set(0, -50, 0);   // its chest, where its dust hangs (room frame)
        pos[i * 3] = tmpC3.x; pos[i * 3 + 1] = tmpC3.y; pos[i * 3 + 2] = tmpC3.z; const k = warmS; col[i * 3] = cc.x + (wc.x - cc.x) * k; col[i * 3 + 1] = cc.y + (wc.y - cc.y) * k; col[i * 3 + 2] = cc.z + (wc.z - cc.z) * k; });
      handoff.put('pinya', { positions: pos, colors: col, count: n }); events.push('dust:ready');
    }

    // ---- the palm flashes
    const ga = gA.array;
    glows.forEach((g, i) => {
      if (g.stroke !== null && !nowStrokes.has(g.stroke)) { g.stroke = null; }
      g.a = g.stroke !== null ? Math.min(1, g.a + dt * 12) : Math.max(0, g.a - dt / 0.9);
      ga[i * 4] = g.pos.x; ga[i * 4 + 1] = g.pos.y; ga[i * 4 + 2] = g.pos.z; ga[i * 4 + 3] = g.a * 0.8;
    });
    gA.needsUpdate = true;
    // the tower took the dust: in this same frame it starts from it, so the pinya goes (no double image, no gap)
    if (dustSent && handoff.claimed('pinya')) { object.visible = false; return; }
    object.visible = uArrive.value > 0.001 && uLeave.value < 0.999;
  }

  // which pairs of beings hold hands: candidates = pairs whose nearest palms are ≤ netReach apart (3D, so across a corner too);
  // shortest first, each palm in at most 2 threads, each being in at most 4 (a net, not a web of everything to everything)
  const cand = [], deg = new Map(), parent = new Map(), csize = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  function rebuildNet(p) {
    const reach = p.netReach ?? 1.3, R2 = reach * reach, list = beings.filter((b) => b.pR && b.born > 0.35 && !b.dead);
    cand.length = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(dS(a.s, b.s)) > reach + 0.8) continue;
      let best = 1e9, sa = 0, sb = 0;
      for (const [u, pu] of [[0, a.pR], [1, a.pL]]) for (const [v, pv] of [[0, b.pR], [1, b.pL]]) { const d = pu.distanceToSquared(pv); if (d < best) { best = d; sa = u; sb = v; } }
      if (best <= R2) cand.push([best, a, b, sa, sb]);
    }
    cand.sort((u, v) => u[0] - v[0]);
    deg.clear(); parent.clear(); csize.clear();
    for (const b of list) { parent.set(b, b); csize.set(b, 1); }
    const keep = new Set();
    for (const [d2, a, b, sa, sb] of cand) {
      const da = deg.get(a) || [0, 0, 0], db = deg.get(b) || [0, 0, 0];
      if (da[2] >= 5 || db[2] >= 5 || da[sa] >= 3 || db[sb] >= 3) continue;
      da[sa]++; da[2]++; db[sb]++; db[2]++; deg.set(a, da); deg.set(b, db);
      const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id; keep.add(key);
      if (!edges.has(key)) edges.set(key, { a, b, sa, sb, t0: time, from: a.t0 > b.t0 ? a : b, len: Math.sqrt(d2) });
      else Object.assign(edges.get(key), { a, b, sa, sb, len: Math.sqrt(d2) });
      const ra = find(a), rb = find(b);
      if (ra !== rb) { const big = csize.get(ra) >= 3 && csize.get(rb) >= 3; parent.set(ra, rb); csize.set(rb, csize.get(ra) + csize.get(rb)); if (big && time - (edges.get(key).t0) < 0.6 && joins < 64) { joins++; events.push('thread:join'); } }
    }
    for (const k of [...edges.keys()]) if (!keep.has(k)) edges.delete(k);
  }
  const eA = new THREE.Vector3(), eB = new THREE.Vector3(), eM = new THREE.Vector3(), eP = new THREE.Vector3(), eT = new THREE.Vector3();
  function writeNet() {
    let l = 0; cov.fill(0);
    for (const E of edges.values()) {
      if (l >= NE) break;
      const { a, b } = E, from = E.from === b ? b : a, to = from === a ? b : a, sf = from === a ? E.sa : E.sb, st = from === a ? E.sb : E.sa;
      eA.copy(sf ? from.pL : from.pR); eB.copy(st ? to.pL : to.pR);
      const grow = clamp01((time - E.t0) / (0.5 + E.len * 0.5)) * (1 - Math.max(a.gone, b.gone)) * smooth01(Math.min(a.born, b.born) * 2 - 0.6);
      // a light curve: it sags a little, and bends behind the walls (never into the room): the control point goes back along both normals
      const na = walls[a.wall].normal, nb = walls[b.wall].normal, len = eA.distanceTo(eB);
      eM.addVectors(eA, eB).multiplyScalar(0.5); eM.y -= 0.02 + 0.05 * len; eM.x -= (na.x + nb.x) * (0.03 + 0.06 * len); eM.z -= (na.z + nb.z) * (0.03 + 0.06 * len);
      for (let j = 0; j < ES; j++) {
        const t = j / (ES - 1), u = 1 - t;
        eP.set(u * u * eA.x + 2 * u * t * eM.x + t * t * eB.x, u * u * eA.y + 2 * u * t * eM.y + t * t * eB.y, u * u * eA.z + 2 * u * t * eM.z + t * t * eB.z);
        eT.set(2 * u * (eM.x - eA.x) + 2 * t * (eB.x - eM.x), 2 * u * (eM.y - eA.y) + 2 * t * (eB.y - eM.y), 2 * u * (eM.z - eA.z) + 2 * t * (eB.z - eM.z)).normalize();
        setV(net, l, j, eP, eT, grow * 1.03, E.t0);
      }
      // the connected span of the perimeter (the short way between the two beings)
      if (grow > 0.5) { let s0 = a.s, d = dS(a.s, b.s); if (d < 0) { s0 = b.s; d = -d; } const i0 = Math.floor((s0 / PER) * NS), n = Math.ceil((d / PER) * NS); for (let k = 0; k <= n; k++) cov[(i0 + k) % NS] = 1; }
      l++;
    }
    for (; l < NE; l++) { const o = l * ES * 2 * net.F; if (net.A[o + 8] === 0) break; for (let j = 0; j < ES * 2; j++) net.A[o + j * net.F + 8] = 0; }
    net.ib.needsUpdate = true;
    let c = 0; for (let i = 0; i < NS; i++) c += cov[i]; threadCover = c / NS;
  }

  function reset() {
    if (dustSent) { handoff.clear('pinya'); dustSent = false; }
    for (const b of beings) { b.dead = true; }
    beings.length = 0; for (const G of grid) for (const c of G) c.fill(null);
    for (const T of meshes) if (T) for (const W of T) for (const M of W) { M.list.length = 0; M.mesh.geometry.instanceCount = 0; }
    edges.clear(); netN = -1; joins = 0; cov.fill(0); fullT = -1; endT = -1; ended = false; doneSent = false; firstT = -1; assistAcc = 0; joinedSent = 0; warmS = 0; total = 0; threadCover = 0;
  }
  function fill() { return { total: +total.toFixed(3), walls: Array.from(fillW, (v) => +v.toFixed(3)), full: fullT >= 0, threadCover: +threadCover.toFixed(3), beings: beings.length, ending: ended ? clamp01((time - endT) / ((P.endTime ?? 7))) : 0, done: doneSent, dust: dustSent ? uDustK.value : 0 }; }
  function setParams() {}
  function dispose() { ptMat.dispose(); gGeo.dispose(); net.g.dispose(); for (const T of meshes) if (T) for (const W of T) for (const M of W) M.mesh.geometry.dispose(); jobs.length = 0; }
  const api = { object, update, setParams, dispose, fill, reset, events };
  if (typeof window !== 'undefined') window.__pinya3d2 = { beings, fill, reset, edges, get readyMs() { return readyMs; }, spawn: (w, x, y) => spawn(w, x, y, {}), events, cols, PER };
  return api;
}
