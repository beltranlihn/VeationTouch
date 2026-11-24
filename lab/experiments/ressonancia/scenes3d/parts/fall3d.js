// Ressonància — 3D part "fall3d": the castell falls (contract: ../PARTS.md; GUION.md › Pom de dalt «si falla» = intent, La bajada «si
// todos sueltan» = carregat). A pre-designed sequence of 15 s, dignified, then darkness for the acta.
//
// The handover (no visible jump): fall3d draws THE CASTELL ITSELF — the particles of castell.js, from its own geometry, at its own
// places (each tower's group matrix, mirroring and tilt included), at the build each tower had when the fall began, with the castell's
// own light (gold below, pearl above, the silhouette bright, the far side dim, the depth occluder). At t = 0 it is the castell; the
// host hides castell.js and shows this. Which castell: ctx.parts.castell when the host has it (res-obra3d); otherwise (the study) a
// private instance of castell.js that is never added to the scene, only read.
//
// intent (DECISIONES 23:52): after Pom no castell is on screen; in the black, the castell the GROUP built (tronc tiers = floors − 2,
// 4–7, from state.stats.maxFloors / acta.floors, on the structure's walls) assembles from fragments in the first 1.5 s, then the
// script below runs in what is left of `duration`. carregat: the castell on screen falls (no assembly).
//
// The script (s; input.state.t in the block 'fall', or a clock started by the 'fall' event; params.duration (default 15) rescales it,
// e.g. INT passes the score's TIMES.fall = 12)
//   0–1.6   stillness: the light holds; a tremor grows, barely visible.
//   1.6–2.4 the crack: a thin bright fissure runs across the tower where it gives (intent: high, where the upper half will go; carregat:
//           low, across the pinya's shoulders), seen on the face turned to the room; it glows on, dimmer, until the tower comes apart.
//   3–9     the collapse, in the work's language of fragments: intent — the upper half leans to one side and the tower comes apart from
//           the top down, the high particles thrown out in an arc; carregat — the base lets go and the tower sinks vertically into
//           itself. Every particle falls with gravity (a short streak), touches the stone, barely bounces, cools gold -> ember -> dark.
//   9–13    rest: the last embers go out one by one; slow dust rises and thins.
//   13–15   silence and darkness: black at 15 s, ready for the acta.
// arrive / leave: a fade. Study params: outcome, tiers / kind (the private castell), duration, arrive, leave, light, size, shift
// (slides the private castells along their wall, for seam checks), and the host's t ("Run the clock" off = a frozen instant).

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    uniform, attribute, varying, positionGeometry, uv, vec2, vec3, vec4, float, sin, cos, exp, mix, clamp, smoothstep, max, min, abs,
    sqrt, dot, normalize, length, select, step, modelViewMatrix, cameraProjectionMatrix,
  } = TSL;
  const object = new THREE.Group();
  object.name = 'fall3d';
  const NW = room.walls.length;
  const U = { asm: uniform(1), t: uniform(0), vis: uniform(1), out: uniform(0), time: uniform(0), top: uniform(9), gain: uniform(1.75), size: uniform(0.03) };

  // ------------------------------------------------------------------------------------------------ the castell to read
  // carregat: the castell on screen (ctx.parts.castell, at the build it has); intent (after Pom, where no castell is on screen) and the
  // study: a private castell.js, built with the GROUP's floors, never added to the scene, only read
  let own = null, ownP = null;
  ownP = { build: 1, kind: P.kind || 'tres', tiers: Number(P.tiers) || 5, distance: 6.5, fit: false, light: 1, density: 1, size: 0.03 };
  import('./castell.js').then((m) => { own = m.create({ THREE, TSL, room, params: ownP }); own.object.updateMatrixWorld(true); });
  function source(intent) {
    const c = ctx.parts?.castell;
    if (!intent && c && c.castells) return c;
    return own;
  }

  // ------------------------------------------------------------------------------------------------ the castell's particles, falling
  const smt = (x) => x.mul(x).mul(x.mul(x.mul(6).sub(15)).add(10));
  const ember = (T) => { const t = max(T, 0.0), r = smoothstep(0.02, 0.5, t), g = smoothstep(0.35, 1.2, t).mul(0.6).mul(r), b = smoothstep(0.9, 1.8, t).mul(0.9).mul(g); return vec3(r, g, b).mul(t); };
  function makeMaterial(C, occ) {
    const B = attribute('aB', 'vec4'), A = attribute('aA', 'vec4'), Nn = attribute('aN', 'vec4'), Pp = attribute('aP', 'vec4'), Rr = attribute('aR', 'vec4');
    const posB = B.xyz, energy = B.w, posA = A.xyz, r0 = A.w, nrm = Nn.xyz, r4 = Nn.w;
    const start = Pp.x, dur = Pp.y, phase = Pp.z, climb = Pp.w, r1 = Rr.x, r2 = Rr.y, r3 = Rr.z, pinya = Rr.w, t = U.t;
    // the castell as castell.js shows it at this build (same formulas: condensing, climbing, breathing)
    const u = clamp(C.build.sub(start).div(dur), 0, 1);
    const up = clamp(u.sub(r0.mul(0.45)).div(0.55), 0, 1), e0 = smt(up);
    const dir = normalize(vec3(r1.sub(0.5), r2.mul(0.7).sub(0.25), r3.sub(0.5)).add(vec3(0, 0.0001, 0)));
    const sc = posB.add(dir.mul(r0.mul(2.6).add(0.8)));
    const ang = float(1).sub(e0).mul(r1.mul(1.4).add(0.6)), ca = cos(ang), sa = sin(ang);
    const pCond = mix(vec3(sc.x.mul(ca).sub(sc.z.mul(sa)), sc.y, sc.x.mul(sa).add(sc.z.mul(ca))), posB, e0);
    const uc = clamp(u.sub(r0.mul(0.1)).div(0.9), 0, 1), ec = smt(uc), pose = smoothstep(0.55, 1.0, uc);
    const radial = normalize(vec3(posB.x, 0, posB.z).add(vec3(0.0001, 0, 0)));
    const pClimb = mix(posA, posB, pose).add(radial.mul(float(1).sub(ec).mul(0.35))).sub(vec3(0, float(1).sub(ec).mul(climb), 0));
    const isClimb = climb.greaterThan(0.01);
    const br = sin(U.time.mul(float(6.283).div(phase.mul(0.35).add(3.4))).add(phase).add(C.phase)).mul(float(1).sub(smoothstep(0.0, 1.5, t)));  // the breathing stops
    const pB = select(isClimb, pClimb, pCond).add(nrm.mul(br.mul(0.007)));
    // intent: in the black, the group's castell assembles from fragments (asm 0 -> 1, each particle on its own delay, spiralling in)
    const ka = clamp(U.asm.sub(r0.mul(0.55)).div(0.45), 0, 1), ke = smt(ka);
    const angA = float(1).sub(ke).mul(r1.mul(1.6).add(0.8)), cA = cos(angA), sA = sin(angA);
    const scA = posB.add(dir.mul(r0.mul(3.2).add(1.2))).add(vec3(0, float(1).sub(r2).mul(1.5), 0));
    const p0 = mix(vec3(scA.x.mul(cA).sub(scA.z.mul(sA)), scA.y, scA.x.mul(sA).add(scA.z.mul(cA))), pB, ke);
    const h = clamp(posB.y.div(U.top), 0, 1);
    const gold = vec3(1.0, 0.56, 0.26), pearl = vec3(1.0, 0.8, 0.62), white = vec3(1.0, 0.9, 0.8);
    let col = mix(mix(gold, pearl, smoothstep(0.0, 0.45, h)), white, smoothstep(0.6, 1.0, h));
    const lam = max(dot(nrm, normalize(vec3(0.25, 0.8, 0.55))), 0).mul(0.55).add(0.45);
    const vd = normalize(C.eye.sub(posB)), ndv = dot(nrm, vd);
    const rim = float(1).sub(ndv.abs()), front = smoothstep(-0.25, 0.35, ndv);
    const shell = front.mul(rim.mul(rim).mul(1.5).add(0.3)).add(0.05);
    const ve = normalize(vec3(C.eye.x, 0, C.eye.z)), depth = smoothstep(-2.2, 1.6, dot(vec3(posB.x, 0, posB.z), ve));
    col = col.mul(mix(vec3(1.04, 0.96, 0.98), vec3(0.9, 0.97, 1.08), rim.mul(rim)));
    const aura = occ ? float(0) : step(0.985, r4);
    let E = energy.mul(lam).mul(shell).mul(depth.mul(0.6).add(0.4)).mul(br.mul(0.12).add(0.88)).mul(sin(U.time.mul(r1.mul(2.0).add(0.7)).add(r2.mul(40))).mul(0.12).add(0.88));
    E = E.mul(select(isClimb, smoothstep(0.0, 0.12, uc), smoothstep(0.0, 0.3, up).mul(e0.mul(0.6).add(0.4)))).mul(smoothstep(0.0, 0.12, ka).mul(ke.mul(0.2).add(0.8)));   // gathering: at the castell's own light almost at once
    // ---- the fall (castell-local: y up, +x = the topple side; the group's matrix carries it to the world, mirrored and tilted)
    const yN = clamp(posB.y.div(U.top), 0, 1), isI = U.out.lessThan(0.5);
    const tRel = select(isI, float(3.0).add(float(1).sub(yN).mul(3.4)).add(r1.mul(0.5)).add(pinya.greaterThan(0.5).select(0.6, 0.0)), float(2.8).add(yN.mul(4.2)).add(r1.mul(0.7)));   // carregat: it sinks tier by tier from the base, ~5 s
    const trem = vec3(sin(U.time.mul(23.0).add(r1.mul(60.0))), sin(U.time.mul(19.0).add(r2.mul(60.0))), sin(U.time.mul(29.0).add(r3.mul(60.0)))).mul(smoothstep(0.3, 1.6, t).mul(0.005).add(smoothstep(1.8, 3.0, t).mul(0.016)));
    const above = max(posB.y.sub(U.top.mul(0.5)), 0);
    const restP = p0.add(trem).add(select(isI, vec3(above.mul(above).mul(0.06).mul(smoothstep(2.3, 4.6, t)), 0, 0), vec3(0, smoothstep(2.2, 3.4, t).mul(-0.12).mul(yN.add(0.3)).sub(max(t.sub(2.8), 0).mul(0.35).mul(smoothstep(0.0, 0.3, yN))), 0)));
    const v0 = select(isI,
      vec3(yN.mul(2.6).add(0.4).mul(r2.mul(0.6).add(0.7)), r1.mul(1.2), 0).add(radial.mul(r3.mul(0.9).add(0.3))),
      radial.mul(r2.mul(0.9).add(0.25)).add(vec3(r3.sub(0.5).mul(0.4), r1.mul(0.3), 0)));
    const tau = max(t.sub(tRel), 0), gY = r3.mul(0.03).add(0.02), y0 = restP.y;
    const tL = v0.y.add(sqrt(v0.y.mul(v0.y).add(max(y0.sub(gY), 0).mul(19.6)))).div(9.8);
    const tf = min(tau, tL), ta = max(tau.sub(tL), 0), landed = step(0.0, tau.sub(tL)).mul(step(0.0001, tau));
    const fly = vec3(restP.x.add(v0.x.mul(tf)), max(y0.add(v0.y.mul(tf)).sub(tf.mul(tf).mul(4.9)), gY), restP.z.add(v0.z.mul(tf)));
    // on the ground they spread out low and wide (a warm pool, never a bright disc behind the guide's text)
    const p = select(tau.greaterThan(0), fly.add(vec3(v0.x, 0, v0.z).mul(float(1).sub(exp(ta.mul(-4.0))).mul(0.12))).add(radial.mul(r3.mul(0.9).add(0.3)).mul(float(1).sub(exp(ta.mul(-1.5))))), restP);
    const falling = step(0.0001, tau).mul(float(1).sub(landed));
    const speed = length(vec2(v0.x, v0.y.sub(tf.mul(9.8)))).mul(falling);
    // ---- the crack: a thin bright fissure across the tower where it gives, on the face turned to the room
    // intent: down the face from the pom through the upper tronc (where the top gives); carregat: across the pinya's shoulders
    const faceK = smoothstep(0.1, 0.5, dot(normalize(vec3(posB.x, 0, posB.z).add(vec3(0.0001, 0, 0))), ve));
    const xc = sin(posB.y.mul(5.0).add(1.0)).mul(0.06).add(sin(posB.y.mul(13.0)).mul(0.03));
    const dxc = posB.x.sub(xc).div(0.03);
    const runY = mix(U.top, U.top.mul(0.45), smoothstep(1.6, 2.35, t));
    const lineI = exp(dxc.mul(dxc).negate()).mul(step(runY, posB.y));
    const yc = float(1.35).add(sin(posB.x.mul(9.0).add(1.0)).mul(0.09)).add(sin(posB.x.mul(23.0)).mul(0.04));
    const dyc = posB.y.sub(yc).div(0.028);
    const runX = mix(float(-2.9), float(2.9), smoothstep(1.6, 2.35, t));
    const lineC = exp(dyc.mul(dyc).negate()).mul(step(posB.x, runX));
    const onLine = select(isI, lineI, lineC).mul(faceK);
    const crack = onLine.mul(float(1).sub(step(0.985, r4))).mul(smoothstep(1.55, 1.7, t)).mul(mix(float(1), float(0.25), smoothstep(2.4, 3.2, t))).mul(float(1).sub(step(0.0001, tau)));
    // ---- light through the fall: held, a little brighter falling, a soft touch on landing, cooling to ember then dark; all black by 15
    const cool = float(1).sub(exp(ta.mul(float(0.45).add(r1.mul(0.8))).negate()));
    E = E.mul(float(1).sub(falling.mul(0.4)))   // falling, they dim (going out), never brighter than the standing castell
      .mul(float(1).sub(cool)).mul(mix(float(1), float(0.14), landed)).add(landed.mul(exp(ta.mul(-6.0))).mul(0.04));   // on the ground: dimmer (they pile up), going out
    col = mix(col, ember(float(1.2)).div(1.2).add(vec3(0.05, 0, 0)), smoothstep(0.0, 0.6, cool.add(landed.mul(0.3))));
    E = E.mul(float(1).sub(select(isI, smoothstep(2.8, 4.4, t).mul(0.4), smoothstep(1.2, 2.8, t).mul(0.5))));   // intent: full light until it comes apart (they see what they built)   // after the crack the castell's light starts to go (the guide's text stays readable)
    E = E.mul(U.gain).mul(1.8).mul(mix(float(1), float(0.15), aura)).mul(float(1).sub(smoothstep(12.5, 15.0, t))).mul(U.vis);
    const crackC = vec3(1.0, 0.86, 0.62).mul(crack.mul(6.0)).mul(U.vis);
    // ---- the billboard (as castell.js): falling particles stretch into a short streak
    const pp = occ ? p.sub(nrm.mul(0.02)).sub(vd.mul(0.06)) : p;
    const mv = modelViewMatrix.mul(vec4(pp, 1));
    const stretch = float(1).add(min(speed.mul(0.9), 5.0)).add(float(1).sub(e0).mul(select(isClimb, float(0), float(3))));
    const size = U.size.mul(occ ? 2.0 : mix(float(1), float(9), aura));
    const clip = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(vec2(size, size.mul(stretch)))), mv.z, mv.w));
    const settled = select(isClimb, ec, e0);
    const vis = occ ? settled.greaterThan(0.85).and(ke.greaterThan(0.95)).and(tau.lessThan(0.0001)).and(C.build.greaterThan(start)).and(U.vis.greaterThan(0.5)) : E.add(crack).greaterThan(0.0004);
    const m = occ ? new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = select(vis, clip, vec4(0, 0, 2, 1));
    const vCol = varying(col.mul(E).div(stretch).add(crackC));
    const d = uv().sub(0.5);
    m.colorNode = occ ? vec3(0) : vCol.mul(exp(dot(d, d).mul(-16)));
    m.fog = false;
    return m;
  }
  const towers = [];
  for (let i = 0; i < 4; i++) {
    const C = { build: uniform(0), phase: uniform(i * 1.7), eye: uniform(new THREE.Vector3(0, 1.6, 12)) };
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(C, false)), occ = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(C, true));
    mesh.frustumCulled = false; occ.frustumCulled = false; mesh.matrixAutoUpdate = false; occ.matrixAutoUpdate = false; occ.renderOrder = -1;
    g.add(occ, mesh); object.add(g);
    towers.push({ g, mesh, occ, C, base: new THREE.Vector3(), on: false });
  }

  // ------------------------------------------------------------------------------------------------ the dust (after the impacts)
  const NDU = 4000, DB = []; for (let i = 0; i < 4; i++) DB.push(new THREE.Vector4());
  const uDB = TSL.uniformArray(DB, 'vec4');
  const dustMesh = (() => {
    const r = rng(7), aD = new Float32Array(NDU * 4), aE = new Float32Array(NDU * 4);
    for (let i = 0; i < NDU; i++) {
      const ph = r() * Math.PI * 2, rad = 0.4 + 3.0 * Math.sqrt(r());
      aD[i * 4] = Math.cos(ph) * rad; aD[i * 4 + 1] = Math.sin(ph) * rad; aD[i * 4 + 2] = 3.6 + r() * 5.5; aD[i * 4 + 3] = i % 4;
      aE[i * 4] = r(); aE[i * 4 + 1] = r(); aE[i * 4 + 2] = r(); aE[i * 4 + 3] = r();
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aD', new THREE.InstancedBufferAttribute(aD, 4));
    g.setAttribute('aE', new THREE.InstancedBufferAttribute(aE, 4));
    g.instanceCount = NDU;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const D4 = attribute('aD', 'vec4'), E4 = attribute('aE', 'vec4');
    const tw = uDB.element(TSL.int(D4.w));
    const tau = max(U.t.sub(D4.z), 0), a = clamp(tau.div(E4.x.mul(3.0).add(3.5)), 0, 1);
    const p = vec3(tw.x.add(D4.x).add(sin(E4.y.mul(40.0).add(U.t.mul(0.3))).mul(a.mul(0.6))), a.mul(E4.z.mul(2.5).add(1.0)).add(0.1), tw.y.add(D4.y).add(cos(E4.w.mul(40.0).add(U.t.mul(0.25))).mul(a.mul(0.6))));
    const size = float(0.1).add(E4.w.mul(0.18)).mul(a.mul(1.4).add(0.6));
    const A = sin(a.mul(Math.PI)).mul(step(0.0001, tau)).mul(tw.w).mul(U.vis).mul(float(1).sub(smoothstep(12.0, 14.5, U.t)));
    const mv = modelViewMatrix.mul(vec4(p, 1));
    m.vertexNode = select(A.greaterThan(0.002), cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(size)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const vA = varying(A), q = uv().sub(0.5);
    m.colorNode = vec3(0.02, 0.016, 0.013).mul(vA).mul(exp(dot(q, q).mul(-14.0)));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
    object.add(mesh);
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ per frame
  let ownClock = -1, prevBlock = '', frozen = null, lastShift = 0;
  const frozenBuild = new Float32Array(4);
  function update(dt, input) {
    const S = input.state, time = input.time ?? 0;
    const arrive = clamp01(input.arrive ?? (P.arrive ?? 1)), leave = clamp01(input.leave ?? (P.leave ?? 0));
    U.vis.value = arrive * (1 - leave);
    object.visible = U.vis.value > 0.001;
    if (!object.visible) return;
    const dur = Math.max(5, Number(P.duration) || 15);
    let t, outcome;
    if (S) {
      if (input.events) for (const e of input.events) if (e === 'fall') ownClock = time;
      if (S.block === 'fall' && prevBlock !== 'fall' && ownClock < 0) ownClock = time;
      prevBlock = S.block;
      t = S.block === 'fall' ? S.t : ownClock >= 0 ? time - ownClock : 0;
      outcome = S.outcome || 'intent';
    } else { t = input.t ?? 0; outcome = P.outcome || 'intent'; }
    const intent = outcome !== 'carregat', src = source(intent);
    if (!src) return;
    if (intent) U.vis.value = Math.min(1, arrive * 8) * (1 - leave);   // intent: the assembly from fragments IS the arrival (no extra fade)
    // intent: the castell assembles in the first TA s, then the 15 s script runs in what is left of `duration`
    const TA = intent ? 1.5 : 0;
    U.asm.value = intent ? clamp01(Math.max(0, t) / TA) : 1;
    U.t.value = Math.max(0, t - TA) * (15 / Math.max(3, dur - TA));
    U.out.value = intent ? 0 : 1;
    if (src === own) {                                              // the group's castell: tronc tiers from the floors it reached
      const floors = S ? (input.acta?.floors || S.stats?.maxFloors || S.floors || 0) : Number(P.floors) || 0;
      const tiers = floors ? Math.round(Math.min(7, Math.max(4, floors - 2))) : Number(P.tiers) || 5;
      const kind = S && S.structure === 4 ? 'quatre' : (P.kind || 'tres'), sh = S ? 0 : Number(P.shift) || 0;
      if (tiers !== ownP.tiers || kind !== ownP.kind || sh !== lastShift) {
        ownP.tiers = tiers; ownP.kind = kind; own.setParams(ownP); lastShift = sh;
        if (sh) for (const c of own.castells) { c.grp.position.addScaledVector(c.wall.right, sh); c.grp.updateMatrixWorld(true); }
      }
      own.update(dt, { time, t: 0, hands: [], params: ownP });
      own.object.updateMatrixWorld(true);
    }
    U.time.value = time % 1000;
    U.gain.value = Number(P.light ?? 1.75); U.size.value = Number(P.size ?? 0.03);
    U.top.value = src.stats?.top || 9;
    // the build each tower had when the fall began (frozen from then on)
    const inFall = S ? S.block === 'fall' || ownClock >= 0 : true;
    if (!inFall) frozen = null;
    for (let i = 0; i < 4; i++) {
      const tw = towers[i], c = src.castells[i % src.castells.length];
      if (!c || i >= NW) { tw.g.visible = false; DB[i].w = 0; continue; }
      if (!frozen) frozenBuild[i] = src === own ? 1 : c.U.build.value;
      const b = frozenBuild[i];
      const onWall = src !== own || !S || !S.walls || !S.walls.some(Boolean) || !!S.walls[i];   // intent: the structure's walls
      tw.g.visible = b > 0.002 && onWall;
      if (tw.mesh.geometry !== c.mesh.geometry) tw.mesh.geometry = c.mesh.geometry;
      if (tw.occ.geometry !== c.occ.geometry) tw.occ.geometry = c.occ.geometry;
      tw.mesh.matrix.copy(c.mesh.matrixWorld); tw.occ.matrix.copy(c.occ.matrixWorld);       // (object and group stay identity: matrix = world)
      tw.mesh.matrixWorldNeedsUpdate = true; tw.occ.matrixWorldNeedsUpdate = true;
      tw.C.build.value = b; tw.C.eye.value.copy(c.U.eye.value); tw.C.phase.value = c.U.phase.value;
      c.grp.getWorldPosition(tw.base);
      DB[i].set(tw.base.x, tw.base.z, 0, tw.g.visible ? 1 : 0);
    }
    if (inFall) frozen = true;
  }
  if (typeof window !== 'undefined') window.__fall3d = { asm: () => U.asm.value, t: () => U.t.value, tiers: () => ownP.tiers, top: () => U.top.value };
  return {
    object,
    update,
    setParams(p) { if (p && p !== P) Object.assign(P, p); },
    dispose() { for (const tw of towers) { tw.mesh.material.dispose(); tw.occ.material.dispose(); } dustMesh.geometry.dispose(); dustMesh.material.dispose(); if (own && own !== 'loading') own.dispose?.(); },
  };
}
