// Ressonància — brasa3d / foguera (T-063, ARTE-BRASA §a §b §d): the protagonist of each wall.
//
//   The foguera   a cut-paper fire sculpture (ref 04 + 01): NL concentric shells of 2.5 cm card, cream inside → maroon outside, each
//                 with 5–9 S-curled tongues on its top edge (vertex stage: the outline is procedural, one seed per wall). Matte, lit like a
//                 museum piece by a fake key (warm, upper left of the viewer, 55°), a cold rim from behind-right, a low fill and the lava
//                 from below; a soft shadow where an outer shell hides the inner one. Only the core (the two cream shells) is emissive.
//                 It turns 2°/s and breathes ±3 % every 6 s. A held hand opens the shells on its side (≤ 12°, lift ≤ 8 cm); the TOK
//                 opens them all 15° and brings the core to #FFD27A.
//   The islet     its pedestal (ref 02): NI stacked charcoal terraces (2.2 cm each, Ø ≈ 3 m, 35 cm high) with ONE lava vein running from
//                 the foguera's foot towards the visitor. The terraces' cut edges are the contour lines: 8 % ember at rest, lit by the
//                 contour pulses (hands, the relay's feet, the call) and by the perimeter heat field (waves).
//   Both are drawn a second time mirrored in the black water (additive, like every reflection of brasa3d).
// One draw per material for the 4 walls (instanced); no lights, no shadows, nothing allocated per frame.

const NL = 10, NT = 120, NR = 16;          // foguera: sheets, columns, rows
const NI = 16, NIT = 96;                    // islet: terraces, segments
export const FOG_D = 1.6;                   // metres beyond the wall (near: it is seen 1.2–1.3 m tall with the apex ≤ 1.65 m)
export const FOG_X = 1.5;                   // metres to the right of the wall's centre, out of the button's axis (all 4 walls)
export const NPULSE = 12;

export function createFoguera({ THREE, TSL, room, U, world, ringPoint, hearthS, heatSample, mirP, CHROME, eye }) {
  const {
    Fn, uniform, uniformArray, attribute, varying, instanceIndex, vec2, vec3, vec4, float, int, sin, cos, exp, mix, clamp, smoothstep,
    max, min, abs, pow, dot, normalize, length, select, fract, positionWorld, cameraPosition, Loop, fwidth, step, sign,
  } = TSL;
  const NW = room.walls.length;
  const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const linA = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

  // ---- per wall: centre, frame (fwd = towards the eye, right), seed, scale so the apex is seen ≤ 1.65 m
  const C = [], FR = [], centres = [];
  const _v = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    const w = Math.min(i, NW - 1);
    const tw = ringPoint(hearthS[w] + FOG_X, FOG_D, _v);
    const fx = eye.x - _v.x, fz = eye.z - _v.z, fl = Math.hypot(fx, fz) || 1;
    const k = tw / (tw + FOG_D), apex = Math.min(1.78, 1.6 + 0.05 / k);   // world height seen at 1.65 m on the wall
    C.push(new THREE.Vector4(_v.x, _v.z, apex, hearthS[w] + FOG_X));
    FR.push(new THREE.Vector4(fx / fl, fz / fl, 0.37 + i * 1.71, i));
    centres.push(new THREE.Vector3(_v.x, 0.8, _v.z));
  }
  const uC = uniformArray(C, 'vec4'), uFR = uniformArray(FR, 'vec4');
  // the vein's run across the water, from the islet's edge to the ember ring (the floor draws it): ax, az, bx, bz
  const VS = [];
  for (let i = 0; i < 4; i++) {
    const c = C[i], f = FR[i], rx = f.y, rz = -f.x, va = Math.atan2(-0.8, 0.6);
    const dx = rx * Math.cos(va) + f.x * Math.sin(va), dz = rz * Math.cos(va) + f.y * Math.sin(va);
    const w = Math.min(i, NW - 1); ringPoint(hearthS[w] + FOG_X + 0.9, 4.2, _v);
    VS.push(new THREE.Vector4(c.x - f.x * 0.9 + dx * 1.05, c.y - f.y * 0.9 + dz * 1.05, _v.x, _v.z));
  }
  const uVS = uniformArray(VS, 'vec4');
  // per wall live state: x = open left, y = open right, z = core heat, w = lava (0.6 .. 2.5)
  const ST = []; for (let i = 0; i < 4; i++) ST.push(new THREE.Vector4(0, 0, 0.5, 0.6));
  const uST = uniformArray(ST, 'vec4');
  const uRot = uniform(0), uBreath = uniform(1), uTok = uniform(0);
  // contour pulses (shared with the floor's contour lines): x, z (local), t0, reach (m)
  const PU = []; for (let i = 0; i < NPULSE; i++) PU.push(new THREE.Vector4(0, 0, -1e4, 0));
  const uPU = uniformArray(PU, 'vec4');
  let puI = 0;
  function pulse(x, z, reach, time) { PU[puI].set(x, z, time % 3000, reach); puI = (puI + 1) % NPULSE; }
  // light running along the contour lines from each pulse: 3 m/s, decay 1.2 s, up to `reach` metres
  const pulseT = Fn(([xz]) => {
    const acc = float(0).toVar();
    Loop(NPULSE, ({ i }) => {
      const p = uPU.element(i), age = U.time.sub(p.z), d = length(xz.sub(p.xy));
      const front = smoothstep(0.35, 0.0, d.sub(age.mul(3.0)));
      const inReach = smoothstep(p.w.add(0.4), p.w, d);
      acc.addAssign(exp(age.div(-1.2)).mul(front).mul(inReach).mul(exp(d.mul(-0.35))).mul(select(age.greaterThan(0), float(1), float(0))));
    });
    return min(acc, 1.5);
  });

  // ---- palette (ARTE-BRASA §b)
  const SHELL = [linA('#6E1410'), linA('#C8281A'), linA('#C8281A'), linA('#EE6A1F'), linA('#EE6A1F'), linA('#EE6A1F'), linA('#F2B23A'), linA('#F2B23A'), linA('#F2B23A'), linA('#F4E3C8')];   // back → front
  const shellCol = (k) => { let c = vec3(...SHELL[0]); for (let i = 1; i < NL; i++) c = select(k.greaterThan(i - 0.5), vec3(...SHELL[i]), c); return c; };
  const KEY = lin('#FFE2B8'), RIM = lin('#9FB4C8'), FILL = lin('#2A1810'), LAVA_C = lin('#FFD27A'), LAVA_M = lin('#FF7A1A'), LAVA_E = lin('#B3260E');
  const COAL0 = lin('#141110'), COAL1 = lin('#23201E'), COAL2 = lin('#3A3531'), COAL3 = lin('#5A524B');
  const CONT0 = lin('#FF7A1A'), CONT1 = lin('#FF9A3D');
  // the key light per wall: from the viewer's upper left, elevation 55°; the rim from behind-right
  const frameOf = () => {
    const f = uFR.element(instanceIndex);
    const fwd = vec3(f.x, 0, f.y), right = vec3(f.y, 0, f.x.negate());     // right as the viewer sees it (facing the wall)
    return { fwd, right, seed: f.z };
  };

  // ================================================================== the foguera: NL cut-paper sheets stacked in depth
  // Sheet k (0 = back, the largest, garnet … NL-1 = front, the smallest, cream) is a flame silhouette with 5–9 S-curled tongues, a
  // 2.5 cm card (front face, back face, the cut edge along its outline), bent a little round the vertical, 5 cm behind the next one.
  const fogGeo = (() => {
    const aA = [], idx = [];
    for (let k = 0; k < NL; k++) {
      for (let side = 0; side < 2; side++) {
        const o = aA.length / 4;
        for (let j = 0; j <= NT; j++) for (let i = 0; i <= NR; i++) aA.push(k, (j / NT) * 2 - 1, i / NR, side);
        for (let j = 0; j < NT; j++) for (let i = 0; i < NR; i++) { const a = o + j * (NR + 1) + i, b = a + NR + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      const o = aA.length / 4;
      for (let j = 0; j <= NT; j++) { aA.push(k, (j / NT) * 2 - 1, 1, 2); aA.push(k, (j / NT) * 2 - 1, 1, 3); }
      for (let j = 0; j < NT; j++) { const a = o + j * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((aA.length / 4) * 3), 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 4));
    g.setIndex(idx);
    g.instanceCount = Math.min(4, NW);
    return g;
  })();
  const SP = 0.05, CARD = 0.025, WB = 1.0;                               // spacing between sheets, card thickness, back sheet half-width
  const kF = (k) => k.div(NL - 1);
  const sheetW = (k) => float(WB).mul(float(1).sub(kF(k).mul(0.66)));
  // the sheet's top at normalized x (-1..1): an envelope × tongues
  const sheetTop = (k, x, Hb, seed) => {
    const n = fract(k.mul(0.37).add(seed)).mul(4.0).add(5.0).floor();     // 5–9 tongues
    const ph = k.mul(2.39).add(seed.mul(3.1));
    const env = pow(max(float(1).sub(x.mul(x)), 0.0), 0.65);
    const a = x.add(1).mul(n).mul(Math.PI * 0.5).add(ph).add(sin(x.mul(2.3).add(k)).mul(0.5));
    const lobe = cos(a).mul(0.5).add(0.5);
    const tip = pow(lobe, 1.6);
    const vary = sin(x.mul(n.add(1.0)).mul(1.7).sub(ph)).mul(0.5).add(0.5);
    const H = Hb.mul(float(1).sub(kF(k).mul(0.56)));
    return H.mul(env).mul(float(0.42).add(tip.mul(vary.mul(0.35).add(0.65)).mul(0.58))).mul(1.1);   // (no clamp: a clamp cuts the tallest tongue flat)
  };
  const fogMats = [];
  for (const mirror of [false, true]) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });   // the mirror too is opaque: additive would sum the hidden sheets
    const A = attribute('aA', 'vec4'), k = A.x, x = A.y, v = A.z, side = A.w;
    const c4 = uC.element(instanceIndex), st = uST.element(instanceIndex);
    const { fwd, right, seed } = frameOf();
    const base = float(0.06), Hb = c4.z.sub(U.lift).sub(base);                 // the apex stays at 1.65 m on the wall as the world rises
    const W = sheetW(k), top = sheetTop(k, x, Hb, seed);
    const vv = select(side.greaterThan(1.5), float(1), v);
    const y = vv.mul(top);
    const yN = y.div(max(Hb, 0.1));
    // the S: each tongue sways sideways as it rises; the tips lean out; the sheet narrows a little upward
    const sCurl = sin(yN.mul(4.2).add(x.mul(3.0)).add(k.mul(1.3)).add(U.time.mul(0.25))).mul(0.07).mul(yN);
    let xw = x.mul(W).mul(float(1).sub(yN.mul(yN).mul(0.25))).add(sCurl).add(x.mul(yN).mul(yN).mul(0.12));
    // a held hand opens the sheets on its side (≤ 12°) and lifts them (≤ 8 cm); the TOK fans them all 15°
    const sideOpen = mix(st.x, st.y, step(0.0, x));
    const open = sideOpen.mul(0.21).add(uTok.mul(0.27)).mul(kF(k).mul(-0.5).add(1.0));
    xw = xw.add(sign(x).mul(y).mul(open));
    const lift = sideOpen.mul(0.07).mul(abs(x)).add(uTok.mul(0.04));
    const back = select(side.equal(1).or(side.equal(3)), float(CARD), float(0));
    const z = k.sub(NL - 1).mul(SP).sub(x.mul(x).mul(W).mul(0.14)).sub(back);
    const breath = uBreath, sw = sin(U.time.mul(0.31).add(seed)).mul(0.06);      // a slow sway (±3.5°) instead of a turn
    const R2 = right.add(fwd.mul(sw)), F2 = fwd.sub(right.mul(sw));
    const p = vec3(c4.x, 0, c4.y).add(R2.mul(xw.mul(breath))).add(F2.mul(z)).add(vec3(0, base.add(y.add(lift).mul(breath)), 0));
    m.positionNode = mirror ? mirP(p) : p;
    const nF = normalize(F2.add(R2.mul(x.mul(0.28))));
    const nrm = select(side.greaterThan(1.5), normalize(vec3(0, 1, 0).add(R2.mul(x.mul(0.6)))), select(side.equal(1), nF.negate(), nF));
    const vN = varying(mirror ? vec3(nrm.x, nrm.y.negate(), nrm.z) : nrm), vK = varying(k), vX = varying(x), vYr = varying(y), vSide = varying(side);
    const vHb = varying(Hb), vSeed = varying(seed);
    const vKey = varying(normalize(right.negate().mul(0.45).add(fwd.mul(0.36)).add(vec3(0, 0.82, 0))));
    const vRim = varying(normalize(right.mul(0.6).sub(fwd.mul(0.6)).add(vec3(0, 0.3, 0))));
    const vCore = varying(st.z), vLava = varying(st.w);
    m.colorNode = Fn(() => {
      const N0 = normalize(vN), V = normalize(cameraPosition.sub(positionWorld));
      const N = select(dot(N0, V).lessThan(0), N0.negate(), N0);
      const alb = shellCol(vK);
      const cut = smoothstep(1.5, 2.5, vSide);                                     // the card's cut edge
      // the soft shadow of the sheet in front (light from the upper left: it falls 4 cm right and 5 cm down), penumbra 4 cm
      const kn = vK.add(1), Wn = sheetW(kn), xs = vX.mul(sheetW(vK)).sub(0.04).div(Wn);
      const topN = sheetTop(kn, clamp(xs, -1, 1), vHb, vSeed);
      const inFront = smoothstep(0.03, -0.03, vYr.sub(topN).add(0.05)).mul(smoothstep(1.02, 0.9, abs(xs))).mul(step(vK, NL - 1.5));
      const occ = float(1).sub(inFront.mul(0.6)).mul(select(vSide.lessThan(0.5), float(1), float(0.6)));
      const key = KEY.mul(max(dot(N, vKey), 0).mul(2.4).mul(occ));
      const fill = FILL.mul(0.15);
      const below = LAVA_M.mul(exp(vYr.div(-0.3))).mul(0.22).mul(vLava);
      const rim = RIM.mul(pow(float(1).sub(abs(dot(N, V))), 3.0).mul(max(dot(N, vRim), 0)).mul(0.5));
      const edge = KEY.mul(cut).mul(max(N.y, 0).mul(0.35).add(0.12));             // the lit edge of the cut: a fine warm line
      const lit = alb.mul(key.add(fill).add(below).add(edge)).mul(0.5).add(rim.mul(alb.mul(0.5).add(0.5)));
      // only the core glows: the front sheets low down; the TOK brings it to #FFD27A
      const core = smoothstep(NL - 3.5, NL - 1.0, vK).mul(exp(vYr.div(-0.45))).mul(vCore).mul(abs(vX).mul(-0.6).add(1.0));
      const col = lit.add(LAVA_C.mul(core).mul(mirror ? 0.06 : 0.22)).toVar();
      const vis = smoothstep(0.15, 0.6, U.arrive).mul(float(1).sub(smoothstep(0.1, 0.55, U.leave))).mul(float(1).sub(U.wait));
      return mirror ? col.mul(vis).mul(CHROME).mul(U.refl).mul(0.38).add(vec3(0.0021, 0.0018, 0.0016)) : col.mul(vis);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(fogGeo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 1;
    world.add(mesh); fogMats.push(mesh);
  }

  // ================================================================== the islet (pedestal of terraces, one lava vein)
  const isGeo = (() => {
    const aA = [], idx = [];
    for (let k = 0; k < NI; k++) {
      const o = aA.length / 4;
      aA.push(k, 0, 0, 0);                                                         // top centre
      for (let j = 0; j <= NIT; j++) aA.push(k, (j / NIT) * Math.PI * 2, 1, 0);    // top rim
      for (let j = 0; j < NIT; j++) idx.push(o, o + 1 + j + 1, o + 1 + j);
      const s0 = aA.length / 4;
      for (let j = 0; j <= NIT; j++) { aA.push(k, (j / NIT) * Math.PI * 2, 1, 1); aA.push(k, (j / NIT) * Math.PI * 2, 0, 1); }   // side: top, bottom
      for (let j = 0; j < NIT; j++) { const a = s0 + j * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((aA.length / 4) * 3), 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 4));
    g.setIndex(idx);
    g.instanceCount = Math.min(4, NW);
    return g;
  })();
  const TH = 0.022, ISL_BACK = 0.9;   // the islet's front edge ≥ 1.3 m beyond the wall: ≥ 40 cm of reflection under it
  const VEIN_A = Math.atan2(-0.8, 0.6);                                         // the vein runs back and right, to the ember ring
  // the terrace k's outline radius at angle a (local frame: a = 0 along +right, π/2 towards the eye) and its centre shift (back)
  const isR = (k, a, seed) => {
    const f = k.div(NI);
    const R = float(1.2).mul(float(1).add(sin(a.mul(2.0).add(seed)).mul(0.11)).add(sin(a.mul(3.0).add(seed.mul(2.3))).mul(0.07)).add(sin(a.mul(7.0).add(seed.mul(4.1))).mul(0.03)));
    const wob = sin(a.mul(5.0).add(k.mul(1.7)).add(seed)).mul(0.035).add(sin(a.mul(11.0).sub(k.mul(2.9))).mul(0.012));
    // the vein's groove: the terraces are notched where it runs (towards the eye, a ≈ π/2)
    const dv = a.sub(VEIN_A), notch = exp(dv.mul(dv).mul(-30.0)).mul(0.08).mul(f);
    return R.mul(float(1).sub(pow(f, 0.85).mul(0.78))).mul(float(1).add(wob)).sub(notch);
  };
  const isMats = [];
  for (const mirror of [false, true]) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const A = attribute('aA', 'vec4'), k = A.x, a = A.y, rimK = A.z, kind = A.w;
    const c4 = uC.element(instanceIndex), st = uST.element(instanceIndex);
    const { fwd, right, seed } = frameOf();
    const f = k.div(NI);
    const rr = isR(k, a, seed).mul(select(kind.greaterThan(0.5), float(1), rimK));
    const shift = fwd.mul(f.mul(-0.3));                                           // upper terraces sit back: they descend towards the visitor
    const y = select(kind.greaterThan(0.5), k.add(rimK).mul(TH), k.add(1).mul(TH));
    const loc = right.mul(cos(a)).add(fwd.mul(sin(a)));
    const p = vec3(c4.x, 0, c4.y).add(fwd.mul(-ISL_BACK)).add(shift).add(loc.mul(rr)).add(vec3(0, y, 0));   // the islet sits behind the foguera: it never hides it
    m.positionNode = mirror ? mirP(p) : p;
    // side normal: radial corrected by the outline's slope
    const dr = isR(k, a.add(0.02), seed).sub(isR(k, a.sub(0.02), seed)).div(0.04);
    const tang = right.mul(sin(a).negate()).add(fwd.mul(cos(a)));
    const ns = normalize(loc.mul(isR(k, a, seed)).sub(tang.mul(dr)));
    const nrm = select(kind.greaterThan(0.5), ns, vec3(0, 1, 0));
    const vN = varying(mirror ? vec3(nrm.x, nrm.y.negate(), nrm.z) : nrm), vKind = varying(kind), vF = varying(f);
    // the vein in the islet's own frame: along (towards the eye) and across, meandering
    const rel = p.xz.sub(vec2(c4.x, c4.y).sub(fwd.xz.mul(ISL_BACK)));
    const vdir = right.xz.mul(Math.cos(VEIN_A)).add(fwd.xz.mul(Math.sin(VEIN_A))), vper = vec2(vdir.y.negate(), vdir.x);
    const along = dot(rel, vdir), across = dot(rel, vper);
    const vAl = varying(along), vAc = varying(across.sub(sin(along.mul(3.1).add(seed)).mul(0.06)));
    const vKey = varying(normalize(right.negate().mul(0.45).add(fwd.mul(0.36)).add(vec3(0, 0.82, 0))));
    const vLava = varying(st.w), vXZ = varying(p.xz);
    const hsI = heatSample(c4.w, true), vWave = varying(hsI.g.mul(4 * 0.35).add(hsI.r.mul(4 * 0.08)));   // waves and woken embers at this wall
    m.colorNode = Fn(() => {
      const N0 = normalize(vN), V = normalize(cameraPosition.sub(positionWorld));
      const N = select(dot(N0, V).lessThan(0), N0.negate(), N0);
      const side = smoothstep(0.5, 0.9, vKind);
      // charcoal: shadow / base / light by the key; the cut edges are the contour lines
      const kd = max(dot(N, vKey), 0);
      const coal = mix(mix(COAL0, COAL1, smoothstep(0.0, 0.5, kd)), COAL2, smoothstep(0.5, 1.0, kd)).mul(1.4);
      const edge = mix(COAL2, COAL3, kd);
      const w = float(0.03).add(smoothstep(0.3, 1.4, vAl).mul(0.03));             // the vein: 6–12 cm wide
      const inV = smoothstep(w, w.mul(0.45), abs(vAc)).mul(smoothstep(0.25, 0.5, vAl));
      const coreV = smoothstep(w.mul(0.45), w.mul(0.12), abs(vAc));
      const glow = exp(abs(vAc).div(-0.2)).mul(smoothstep(0.2, 0.5, vAl));          // its light on the charcoal
      const lavaT = inV.mul(min(vLava, 1.6));
      const lava = mix(mix(LAVA_E, LAVA_M, smoothstep(0.1, 0.6, inV)), LAVA_C, coreV.mul(0.6)).mul(lavaT.mul(0.55));
      // contour lines: the terraces' cut edges, 8 % ember at rest, lit by pulses and by the ring's heat (waves)
      const pu = pulseT(vXZ);
      const lineK = min(float(0.08).add(pu).add(vWave).add(U.awake.mul(0.15)), 1.0);
      const cont = mix(CONT0, CONT1, min(pu.add(vWave), 1.0)).mul(lineK).mul(side).mul(0.6);   // ≤ 0.6: out of the bloom, no neon
      const base = mix(coal, edge.mul(0.9), side.mul(0.5)).mul(float(0.55).add(vF.mul(0.35)));
      const col = base.add(LAVA_M.mul(glow).mul(vLava).mul(0.05)).add(cont).add(lava).toVar();
      const vis = smoothstep(0.1, 0.5, U.arrive).mul(float(1).sub(smoothstep(0.2, 0.7, U.leave))).mul(float(1).sub(U.wait));
      return mirror ? col.mul(vis).mul(CHROME).mul(U.refl).mul(0.4).add(vec3(0.0021, 0.0018, 0.0016)) : col.mul(vis);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(isGeo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 1;
    world.add(mesh); isMats.push(mesh);
  }

  // ================================================================== CPU: hands open the shells, the lava rises, the TOK
  const openT = new Float32Array(8), lavaT = new Float32Array(4);
  let rot = 0, tokK = 0;
  const easeO = (tgt, cur, dt) => cur + (tgt - cur) * (1 - Math.exp(-dt / (tgt > cur ? 0.35 : 1.5)));
  function update(dt, time, hands, walls, cum, tokPulse) {
    rot = (rot + dt * (2 * Math.PI / 180)) % (Math.PI * 2);
    uRot.value = rot;
    uBreath.value = 1 + 0.03 * Math.sin((time / 6) * Math.PI * 2);
    openT.fill(0); lavaT.fill(0);
    for (const h of hands) {
      const i = h.wall; if (i > 3) continue;
      const du = (h.u - 0.5) * walls[i].width - FOG_X;                          // from the foguera
      if (Math.abs(du) > 3.0) continue;
      if (du < 0) openT[i * 2] = 1; else openT[i * 2 + 1] = 1;
      lavaT[i] = 1;
    }
    tokK = Math.max(tokK * Math.exp(-dt / 0.7), tokPulse || 0);
    uTok.value = tokK;
    for (let i = 0; i < 4; i++) {
      const s = ST[i];
      s.x = easeO(openT[i * 2], s.x, dt); s.y = easeO(openT[i * 2 + 1], s.y, dt);
      s.w += ((lavaT[i] ? 2.5 : 0.6) - s.w) * (1 - Math.exp(-dt / (lavaT[i] ? 0.4 : 0.7)));
      s.z = 0.55 + 0.25 * Math.min(1, U.level.value) + 1.6 * tokK + 0.3 * lavaT[i];
    }
  }
  return {
    meshes: [...fogMats, ...isMats], centres, pulse, pulseT, uPU, uVS, uST, update,
    dispose() { fogGeo.dispose(); isGeo.dispose(); for (const m of [...fogMats, ...isMats]) m.material.dispose(); },
  };
}
