// Ressonància — part «baixada3d»: La bajada — Seny — «Luz que llueve» (contract: ../PARTS.md). GUION.md › «La bajada — Seny».
//
// The castell comes down floor by floor in a slow RAIN OF COLOUR: every 'down' (a floor coming down) releases a burst of fragments of
// that floor's colour (the trencadís palette, from the gold of the pinya to the violet of the top) behind the castell's walls; they fall
// slowly (1–1.5 m/s), turning, catching the light. The ones that fall close to the wall plane can be CAUGHT: where a hand rests, a
// fragment stops at its height, flares and goes out in the hand. Where nobody holds, they fall through and die on the floor in a short
// puddle of colour. When the last floor is down (floors 0) the rain thins out and the last drops settle.
// The fall (state.block 'fall' / event 'fall': carregat): everything drops at once — every fragment of every floor released together,
// with gravity, and no hand stops them.
// Hands: a landing hand answers at once (a warm ring on the wall plane, < 1 frame), a resting hand holds a soft halo that grows (it is
// holding the castell); the caught fragments flare in it.
// arrive: scattered gold fragments (the festa's light) turn, converge and fall into line as the first rain; leave: the rain stops,
// the fragments float up and apart, turning, and thin into dust.
//
// How: ~24 000 fragments, all analytic in the vertex stage (no compute, no per-frame upload: identical on WebGPU and WebGL2). Each one
// has a column (perimeter s, a depth behind the wall 0.05–2.6 m), a start height, a speed and a phase; its current cycle k gives the
// moment t0 it left; it is shown if the EMISSION at t0 (a burst after each recorded 'down', a base trickle while floors remain) beats
// its seed. Its colour is the floor that was coming down at t0 (from the history of downs). Hands are a small uniform array (perimeter
// s, height, holding time). Sizes in metres; perimeter coordinates wrap round the room (seamless P3→P4).
// Alone (res-3d-study, no input.state): a stand-in from params: floors (-1 = from progress), maxFloors, cycle (s: an automatic descent
// loop), fall, walls, arrive, leave.
export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, int, positionGeometry, positionWorld, modelViewMatrix,
    cameraProjectionMatrix, cameraWorldMatrix, mix, smoothstep, clamp, sin, cos, fract, floor, abs, max, min, pow, exp, length, dot,
    select, step, mod, Loop, If, Discard, sqrt, varyingProperty, normalize,
  } = TSL;
  function rng(s) { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const walls = room.walls, NW = walls.length;
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const hash = (a, b) => fract(sin(float(a).mul(12.9898).add(float(b).mul(78.233))).mul(43758.5453));

  // -------------------------------------------------------------------------------------------- uniforms
  const MAXD = 12, MAXH = 16;
  const uTime = uniform(0), uFloors = uniform(7), uMax = uniform(7), uFallT = uniform(1e9), uArrive = uniform(1), uLeave = uniform(0);
  const uRain = uniform(1), uGain = uniform(1), uWallsOn = uniform(new THREE.Vector4(1, 1, 1, 1)), uEnd = uniform(1e9);
  const DV = Array.from({ length: MAXD }, () => new THREE.Vector4(-1e9, 0, 0, 0)), uDowns = uniformArray(DV, 'vec4');   // x: time of a 'down'
  const HV = Array.from({ length: MAXH }, () => new THREE.Vector4(0, 0, 0, 0)), uHands = uniformArray(HV, 'vec4');      // s, y, presence, held s
  const uNH = uniform(0, 'int');
  // the trencadís palette by floor (0 = the pinya's gold … 8 = the top's violet), linear
  const PAL = [[1.0, 0.56, 0.26], [1.0, 0.47, 0.18], [0.92, 0.36, 0.13], [0.82, 0.24, 0.10], [0.95, 0.50, 0.20], [1.0, 0.64, 0.32], [1.0, 0.74, 0.50], [1.0, 0.82, 0.64], [1.0, 0.90, 0.80]];   // the castell's light by floor: gold at the base, pearl and white at the top
  const PV = PAL.map((c) => new THREE.Vector4(c[0], c[1], c[2], 1)), uPal = uniformArray(PV, 'vec4');

  // -------------------------------------------------------------------------------------------- the castells (the sources)
  // One castell beyond each structure wall, as the castell part places them (wall centre pushed out; from ctx.parts.castell when it is
  // there, else the same rule): x, z of its axis, its full height, on/off. The rain leaves from the floor that is coming down.
  const CV = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 10, 1)), uCast = uniformArray(CV, 'vec4');
  function placeCastells(topH, pushes) {
    for (let w = 0; w < Math.min(4, NW); w++) {
      const W = walls[w], eye = room.eye;
      const dWall = -(W.pa.x - eye.x) * W.normal.x - (W.pa.z - eye.z) * W.normal.z, tanUp = (W.height - eye.y) / dWall;
      const push = pushes?.[w] ?? Math.max(8.5, (topH + 0.55 - eye.y) / tanUp - dWall);
      CV[w].x = W.centre.x - W.normal.x * push; CV[w].y = W.centre.z - W.normal.z * push; CV[w].z = topH;
    }
  }

  // -------------------------------------------------------------------------------------------- the fragments, and the dust they trail
  // FR fragments per castell (larger tumbling pieces: warm core, the floor's colour at the edges) and, for each, DU motes of dust that
  // follow its path a little late (the same path evaluated at t − lag, diffusing). All analytic in the vertex stage.
  const FR = Math.round(150 * (P.density ?? 1)), DU = 22, NF = 4 * FR, N = NF * (1 + DU);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const fA = new Float32Array(N * 4), fB = new Float32Array(N * 4);
  {
    const r = rng(2026);
    let n = 0;
    for (let c = 0; c < 4; c++) for (let f = 0; f < FR; f++) {
      const ang = r() * Math.PI * 2, rad = 0.25 + Math.pow(r(), 0.7) * 1.5, s1 = r(), s2 = r(), ph = r() * 40, size = 0.07 + Math.pow(r(), 2) * 0.12;
      for (let d = 0; d <= DU; d++) {
        const lag = d === 0 ? 0 : 0.06 + Math.pow(d / DU, 1.3) * 1.6;
        fA.set([c, ang, rad, lag], n * 4); fB.set([s1, s2, ph, d === 0 ? size : -(0.010 + r() * 0.012)], n * 4); n++;   // size < 0: a mote of dust
      }
    }
  }
  g.setAttribute('fA', new THREE.InstancedBufferAttribute(fA, 4)); g.setAttribute('fB', new THREE.InstancedBufferAttribute(fB, 4));
  g.instanceCount = N;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
  const wrap = (d) => d.sub(float(PER).mul(floor(d.div(PER).add(0.5))));
  const A = attribute('fA', 'vec4'), B = attribute('fB', 'vec4');
  const vCol = varyingProperty('vec3', 'vRainCol'), vEdge = varyingProperty('vec3', 'vRainEdge'), vDust = varyingProperty('float', 'vRainDust'), vQ = varying(positionGeometry.xy);
  const vShape = varyingProperty('vec4', 'vRainShape');
  const EYE = room.eye.clone();
  // the walls, for projecting a fragment onto the wall plane it is seen through (catching it in a hand)
  const WV = walls.slice(0, 4).map((w) => new THREE.Vector4(w.normal.x, w.normal.z, -(w.pa.x - EYE.x) * w.normal.x - (w.pa.z - EYE.z) * w.normal.z, 0));
  const WP = walls.slice(0, 4).map((w, i) => new THREE.Vector4(w.pa.x, w.pa.z, w.right.x, w.right.z));
  const WC = walls.slice(0, 4).map((w, i) => new THREE.Vector4(cum[i], w.width, 0, 0));
  const uWN = uniformArray(WV, 'vec4'), uWP = uniformArray(WP, 'vec4'), uWC = uniformArray(WC, 'vec4');
  mat.vertexNode = Fn(() => {
    const wi = A.x, ang = A.y, rad = A.z, lag = A.w, sd1 = B.x, sd2 = B.y, phase = B.z, sizeA = B.w;
    const isDust = step(sizeA, 0.0), size = abs(sizeA);
    const C = uCast.element(int(wi)), on = select(wi.lessThan(0.5), uWallsOn.x, select(wi.lessThan(1.5), uWallsOn.y, select(wi.lessThan(2.5), uWallsOn.z, uWallsOn.w)));
    const t = uTime.sub(lag), period = sd1.mul(4.0).add(16.0);
    const k = floor(t.add(phase).div(period)), t0 = k.mul(period).sub(phase), age = t.sub(t0);
    // emission at t0: a burst after each 'down', a thin trickle while floors remain; the floors standing when it left
    const em = float(0).toVar(), downsAfter = float(0).toVar();
    Loop(MAXD, ({ i }) => {
      const td = uDowns.element(i).x;
      If(td.lessThanEqual(t0), () => { em.addAssign(exp(t0.sub(td).negate().div(4.0)).mul(0.9)); });
      If(td.greaterThan(t0), () => { downsAfter.addAssign(1); });
    });
    const floorsAt = uFloors.add(downsAfter);
    em.addAssign(select(floorsAt.greaterThan(0.5), float(0.12), float(0.0)));
    const shown = step(hash(k, sd1.mul(91.7)), em.mul(uRain)).mul(on).mul(step(t0, uEnd)).mul(step(0.5, floorsAt.add(0.5)));
    const floorH = C.z.div(max(uMax, 1.0));
    const fi = clamp(floorsAt.sub(1).sub(step(0.85, hash(k, sd2))), 0, 8);
    const edge = uPal.element(int(fi)).xyz;
    // the path: from the floor coming down, falling slowly, drifting a little out from the castell towards the room, tumbling
    const h0 = floorsAt.sub(0.15).sub(hash(k.add(1.7), sd2).mul(0.7)).mul(floorH).add(0.2);
    const v = sd2.mul(0.45).add(1.0);
    const out = vec2(cos(ang), sin(ang)), toRoom = normalize(vec2(EYE.x, EYE.z).sub(C.xy).add(vec2(0.0001, 0)));
    const drift = toRoom.mul(age.mul(0.22)).add(out.mul(age.mul(0.06)));
    const xz = C.xy.add(out.mul(rad)).add(drift).toVar();
    const y = h0.sub(v.mul(age)).toVar();
    const E = shown.toVar(), flare = float(0).toVar(), dead = float(0).toVar();
    // seen through the wall plane: its point on the wall (perimeter s, height) — a hand there catches it
    If(uFallT.greaterThan(uTime), () => {
      Loop(4, ({ i }) => {
        const wn = uWN.element(i), dx = xz.sub(vec2(EYE.x, EYE.z)), Dh = length(dx), dir = dx.div(Dh);
        const den = dot(dir, wn.xy).negate();
        If(den.greaterThan(0.2), () => {
          const tw = wn.z.div(den), X = vec2(EYE.x, EYE.z).add(dir.mul(tw)), wp = uWP.element(i), wc = uWC.element(i);
          const u = dot(X.sub(wp.xy), wp.zw);
          If(u.greaterThanEqual(-0.01).and(u.lessThanEqual(wc.y.add(0.01))), () => {
            const sW = wc.x.add(u), ratio = tw.div(Dh);
            Loop(uNH, ({ i: j }) => {
              const h = uHands.element(j);
              const ds = abs(wrap(sW.sub(h.x)));
              const yc = float(EYE.y).add(h.y.sub(EYE.y).div(ratio));          // the height at which it crosses the hand's line of sight
              If(ds.lessThan(h.z.mul(0.24)).and(h0.greaterThan(yc)).and(y.lessThan(yc)), () => {
                const tc = age.sub(h0.sub(yc).div(v));
                y.assign(yc); flare.assign(max(flare, exp(tc.mul(-4.0)))); E.mulAssign(exp(tc.mul(-2.2)));
              });
            });
          });
        });
      });
    });
    If(y.lessThan(0.03), () => { const tf = y.negate().div(v); y.assign(0.03); dead.assign(1); E.mulAssign(exp(tf.mul(-3.0)).mul(0.12)); });
    // the fall: the whole castell at once, heavy, with gravity; it darkens as it falls (embers going out), nothing catches it
    const fallC = float(1).toVar();
    If(uTime.greaterThan(uFallT), () => {
      const tf = max(t.sub(uFallT), 0), yF = sd1.mul(C.z).add(0.3);
      const yy = yF.sub(tf.mul(tf).mul(4.0).mul(sd2.mul(0.4).add(0.8)));
      xz.assign(C.xy.add(out.mul(rad.mul(float(1).add(tf.mul(0.6))))));
      y.assign(max(yy, 0.03));
      E.assign(on.mul(step(0.15, sd2)).mul(select(yy.greaterThan(0.03), float(1), exp(yy.mul(0.35)))).mul(step(0.0, uTime.sub(uFallT).sub(lag))));
      fallC.assign(exp(tf.mul(-0.9)));
      flare.assign(0);
    });
    // arrive: gathered from scattered gold; leave: up and apart, into dust
    const scat = float(1).sub(uArrive).mul(float(1).sub(uArrive)), lv = uLeave;
    const off = vec3(sin(sd1.mul(53.0)), sin(sd2.mul(31.0)).mul(0.6).add(0.4), cos(sd1.mul(47.0))).mul(scat.mul(4.0).add(lv.mul(lv).mul(sd2.mul(3).add(1.5))));
    const dust = isDust.mul(vec3(sin(lag.mul(2.3).add(sd1.mul(60)).add(phase)), sin(lag.mul(1.7).add(sd2.mul(40))).mul(0.4), cos(lag.mul(2.1).add(sd1.mul(30)).add(phase))).mul(lag.mul(0.09)));
    const p = vec3(xz.x, y, xz.y).add(off).add(vec3(0, lv.mul(lv).mul(sd1.mul(4).add(2)), 0)).add(dust);
    E.mulAssign(smoothstep(0.0, 0.5, uArrive).mul(smoothstep(1.0, 0.55, lv)));
    E.mulAssign(select(isDust.greaterThan(0.5), exp(lag.mul(-1.8)).mul(0.5).mul(float(1).sub(dead)), float(1)));
    // colour: the floor's colour at the edges, a warm core; in the fall it darkens to deep ember, then nothing
    const warm = vec3(1.0, 0.78, 0.5);
    const heat = fallC;
    vEdge.assign(mix(vec3(0.35, 0.05, 0.02), edge, heat).mul(E).mul(uGain).mul(float(1).add(flare.mul(3.0))).mul(1.4));
    vCol.assign(mix(vec3(0.3, 0.06, 0.02), warm, heat).mul(E).mul(uGain).mul(float(1).add(flare.mul(4.0))).mul(1.7));
    vDust.assign(isDust);
    // tumbling: a flat piece turning (its width breathes with cos of the tumble), spinning in the view plane
    const spin = uTime.mul(sd1.mul(1.6).add(0.4)).add(sd2.mul(20)), tumble = abs(cos(uTime.mul(sd2.mul(2.0).add(0.6)).add(sd1.mul(9))));
    vShape.assign(vec4(cos(spin), sin(spin), select(dead.greaterThan(0.5), float(0.25), max(tumble, 0.22)), sd1));
    const mv = modelViewMatrix.mul(vec4(p, 1));
    const sz = size.mul(float(1).add(flare.mul(0.8))).mul(select(isDust.greaterThan(0.5), float(1), float(1.0)));
    const q = positionGeometry.xy, c = cos(spin), sn = sin(spin);
    const qr = select(isDust.greaterThan(0.5), q, vec2(q.x.mul(c).sub(q.y.mul(sn)), q.x.mul(sn).add(q.y.mul(c))));
    const corner = qr.mul(sz).mul(select(isDust.greaterThan(0.5), vec2(1, 2.2), vec2(1, 1)));
    return select(E.greaterThan(0.002), cameraProjectionMatrix.mul(vec4(mv.xy.add(corner), mv.z, mv.w)), vec4(0, 0, 2, 1));
  })();
  mat.colorNode = Fn(() => {
    const q = vQ, r2 = dot(q, q);
    // dust: a soft dot. fragment: an irregular shard (three half-planes from its seed), squashed by its tumble; warm core, coloured rim
    const dustC = vEdge.mul(exp(r2.mul(-3.0)));
    const sh = vShape, qs = vec2(q.x.div(sh.z), q.y);
    const a1 = sh.w.mul(6.283), d1 = dot(qs, vec2(cos(a1), sin(a1))), d2 = dot(qs, vec2(cos(a1.add(2.2)), sin(a1.add(2.2)))), d3 = dot(qs, vec2(cos(a1.add(4.1)), sin(a1.add(4.1))));
    const dmax = max(max(d1, d2), d3), inside = smoothstep(0.62, 0.5, dmax);
    const core = smoothstep(0.45, 0.0, dmax.add(0.15));
    // a glint when the face turns to the eye (the tumble at its widest): brief, whitening the warm core, with a soft star round it
    const glint = pow(sh.z, 28.0);
    const frag = mix(vEdge, vCol, core).mul(inside).mul(float(1).add(glint.mul(2.2))).add(vCol.mul(glint.mul(exp(r2.mul(-3.0))).mul(0.6)))
      .add(vEdge.mul(exp(r2.mul(-2.0)).mul(0.08)));
    return vec4(select(vDust.greaterThan(0.5), dustC, frag), 1);
  })();
  mat.fog = false;
  const object = new THREE.Group(); object.name = 'baixada3d';
  const rain = new THREE.Mesh(g, mat); rain.frustumCulled = false; object.add(rain);

  // -------------------------------------------------------------------------------------------- the hands: ring on landing, halo while holding
  const NSP = MAXH * 2;
  const hg = new THREE.InstancedBufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); hg.setIndex([0, 1, 2, 0, 2, 3]);
  const hA = new Float32Array(NSP * 4), hB = new Float32Array(NSP * 4), hC = new Float32Array(NSP * 4);
  const HA = new THREE.InstancedBufferAttribute(hA, 4), HB = new THREE.InstancedBufferAttribute(hB, 4), HC = new THREE.InstancedBufferAttribute(hC, 4);
  for (const a of [HA, HB, HC]) a.setUsage(THREE.DynamicDrawUsage);
  hg.setAttribute('hA', HA); hg.setAttribute('hB', HB); hg.setAttribute('hC', HC); hg.instanceCount = 0;
  {
    // hA = centre xyz, half size · hB = right axis xyz, age (s since landing) · hC = wall normal xyz, held (0..1)
    const a = attribute('hA', 'vec4'), b = attribute('hB', 'vec4'), c = attribute('hC', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const q = positionGeometry.xy, R = a.w;
    m.positionNode = a.xyz.add(b.xyz.mul(q.x.mul(R))).add(vec3(0, 1, 0).mul(q.y.mul(R))).add(c.xyz.mul(-0.004));
    const vL = varying(q.mul(R)), vAge = varying(b.w), vHeld = varying(c.w), vN = varying(c.xyz);
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const d = length(vL), rr = vAge.mul(0.9).add(0.08);
      const ring = exp(d.sub(rr).div(0.025).pow(2).negate()).mul(exp(vAge.mul(-2.5))).mul(0.9);
      const halo = exp(d.mul(d).div(vHeld.mul(0.05).add(0.02)).negate()).mul(vHeld.mul(0.16).add(0.04));
      return vec4(vec3(1.0, 0.62, 0.3).mul(ring.add(halo)).mul(uArrive).mul(float(1).sub(uLeave)), 1);
    })();
    m.fog = false;
    var hands = new THREE.Mesh(hg, m); hands.frustumCulled = false; hands.renderOrder = 9; object.add(hands);
  }
  const _a = new THREE.Vector3();
  const wallAt = (s) => { s = ((s % PER) + PER) % PER; for (let i = NW - 1; i >= 0; i--) if (s >= cum[i]) return i; return 0; };
  const onWall = (wi, s, y, out) => { const w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER); return out.copy(w.pa).addScaledVector(w.right, ds + w.width / 2).setY(y); };
  let nSp = 0;
  function handSprite(s, y, R, age, held) {
    const wi = wallAt(s), w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER);
    for (let n = 0; n < 2 && nSp < NSP; n++) {
      const k = n === 0 ? wi : ds < 0 ? (wi + NW - 1) % NW : (wi + 1) % NW;
      if (n === 1 && Math.abs(ds) < w.width / 2 - R) break;                  // near a corner: also on the neighbour wall (seamless)
      onWall(k, s, y, _a); const ww = walls[k], j = nSp * 4;
      hA[j] = _a.x; hA[j + 1] = _a.y; hA[j + 2] = _a.z; hA[j + 3] = R;
      hB[j] = ww.right.x; hB[j + 1] = ww.right.y; hB[j + 2] = ww.right.z; hB[j + 3] = age;
      hC[j] = ww.normal.x; hC[j + 1] = ww.normal.y; hC[j + 2] = ww.normal.z; hC[j + 3] = held; nSp++;
    }
  }

  // -------------------------------------------------------------------------------------------- per frame
  const pool = Array.from({ length: 32 }, () => ({ stroke: null, seen: 0, born: 0 }));
  let lastPulse = -1e9, frame = 0, prevFloors = -1, dIdx = 0, fallSeen = false, endSeen = false, time = 0;
  const pushDown = (t) => { DV[dIdx % MAXD].x = t; dIdx++; };
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    time = input.time ?? time + dt; uTime.value = time;
    const pr = input.params || P, S = input.state || null, ev = input.events;
    // ---- state (the score's, or a stand-in)
    let floors, maxF, fall = false;
    if (S) {
      maxF = Math.max(1, S.stats?.maxFloors || S.floors || 7); floors = S.floors ?? 0;
      fall = S.block === 'fall' || S.outcome === 'carregat';
      for (let w = 0; w < 4; w++) uWallsOn.value.setComponent(w, S.walls && S.walls.some(Boolean) ? (S.walls[w] ? 1 : 0) : 1);
    } else {
      maxF = Math.max(1, Math.round(pr.maxFloors ?? 7));
      if (pr.cycle > 0) { const c = (time % pr.cycle) / pr.cycle; floors = Math.max(0, maxF - Math.floor(c * (maxF + 1.5))); }
      else floors = pr.floors >= 0 ? Math.round(pr.floors) : Math.round(maxF * (1 - clamp01(input.progress ?? pr.progress ?? 0)));
      fall = !!pr.fall && time >= (pr.fallDelay ?? 0);
      const nw = Math.max(2, Math.min(4, Math.round(pr.walls ?? 4)));
      for (let w = 0; w < 4; w++) uWallsOn.value.setComponent(w, w < nw ? 1 : 0);
    }
    // ---- downs: the score's events, or a change of floors (stand-in); a fresh start (floors went up) clears the history
    let downEv = 0;
    if (S && ev) { for (const e of ev) { if (e === 'down') downEv++; if (e === 'fall') fallSeen = false; } }
    if (prevFloors >= 0 && floors > prevFloors) { for (const d of DV) d.x = -1e9; dIdx = 0; uFallT.value = 1e9; endSeen = false; uEnd.value = 1e9; }
    if (S && ev) { for (let i = 0; i < downEv; i++) pushDown(time); }
    else if (prevFloors >= 0 && floors < prevFloors) for (let i = 0; i < prevFloors - floors; i++) pushDown(time);
    else if (!S && prevFloors < 0 && floors < maxF) for (let i = Math.min(MAXD, maxF - floors); i >= 1; i--) pushDown(time - i * 4.5);   // stand-in: the floors already down came down before
    // stand-in with a fixed `floors`: the descent goes on as a pulse (a virtual 'down' every `pulse` s, the count unchanged)
    if (!S && !(pr.cycle > 0) && floors > 0 && (pr.pulse ?? 5) > 0 && time - lastPulse >= (pr.pulse ?? 5)) { lastPulse = time; pushDown(time); }
    prevFloors = floors;
    if (fall && !fallSeen) { fallSeen = true; uFallT.value = time; } else if (!fall) { fallSeen = false; uFallT.value = 1e9; }
    if (floors === 0 && !endSeen) { endSeen = true; uEnd.value = time + 2.5; } else if (floors > 0) { endSeen = false; uEnd.value = 1e9; }
    uFloors.value = floors; uMax.value = maxF;
    // the sources: the castell part's castells when it is in the scene, else the same placement rule for a castell of maxF floors
    const cp = ctx.parts?.castell;
    if (cp?.castells?.length) {
      const top = cp.stats?.top || maxF * 1.45 + 1.6;
      for (let w = 0; w < Math.min(4, cp.castells.length); w++) { const gp = cp.castells[w].grp.position; CV[w].x = gp.x; CV[w].y = gp.z; CV[w].z = top; }
    } else placeCastells(maxF * 1.45 + 1.6);
    uRain.value = pr.rain ?? 1; uGain.value = pr.gain ?? 1;
    // ---- arrive / leave
    uArrive.value = S ? (input.arrive ?? 1) : (input.arrive ?? pr.arrive ?? 1);
    uLeave.value = S ? (input.leave ?? 0) : (input.leave ?? pr.leave ?? 0);
    // ---- hands
    let nH = 0; nSp = 0;
    for (const h of input.hands || []) {
      let st = null; for (const p of pool) if (p.stroke === h.stroke) { st = p; break; }
      if (!st) { for (const p of pool) if (p.seen < frame - 1) { st = p; break; } st = st || pool[0]; st.stroke = h.stroke; st.born = time; }
      st.seen = frame;
      const s = cum[h.wall] + h.u * walls[h.wall].width, y = h.pos.y, held = Math.min(1, (time - st.born) / 2.5);
      if (nH < MAXH) { HV[nH].set(s, y, 1, held); nH++; }
      handSprite(s, y, 0.9, time - st.born, held);
    }
    for (const p of pool) if (p.seen !== frame) p.stroke = null;
    uNH.value = nH; hg.instanceCount = nSp;
    for (const a of [HA, HB, HC]) a.needsUpdate = true;
  }
  function setParams() { /* read live in update(); density applies on reload */ }
  function dispose() { g.dispose(); hg.dispose(); mat.dispose(); hands.material.dispose(); }
  if (typeof window !== 'undefined') window.__baixada3d = { fragments: N };
  return { object, update, setParams, dispose };
}
