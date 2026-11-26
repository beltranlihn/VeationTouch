// The guide beam — a teaching opening shared by pinya3d2 and torre3d (director 26-11: «como en el correfoc»). While the voice says what
// to do, a fine warm light with a trail of particles runs round the room at hand height and PRESSES on a point of each wall, showing the
// stage's gesture: a quick press (the pinya: a being is born there) or a press-and-hold (the tower: the charge ring fills). Then the room
// plays. The public's hands work from the first second: the beam never blocks anything.
//
//   const beam = createGuideBeam({ THREE, TSL, room });   part.object.add(beam.object)
//   beam.update(dt, t, plan) → events this frame: [{ type: 'press' | 'hold' | 'release', i, wall, pos (room Vector3) }]
//     t     seconds since the block began (the host's clock: input.t)
//     plan  { start, targets: [{ wall, x (m from the wall's centre), y, t (arrive), hold (s) }], exit }   — built by the part from
//           its `intro` parameter: { start, walls: [t0, t1, …], hold }
// The head travels along the walls (just behind their planes), the short way round the perimeter, with an eased glide; it dips
// into the wall and flashes when it presses. Room space (it hangs from the part's object, not from a world that moves).

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

export function createGuideBeam({ THREE, TSL, room }) {
  const { attribute, uniform, vec2, vec3, vec4, float, max, abs, length, smoothstep, sin, exp, pow, dot, varying, mix, cameraProjectionMatrix, modelViewMatrix } = TSL;
  const object = new THREE.Group(); object.name = 'guidebeam';
  const walls = room.walls, NW = walls.length, H = room.strip?.height || 912;
  const offs = []; let PER = 0; for (const w of walls) { offs.push(PER); PER += w.width; }
  const wrapS = (s) => ((s % PER) + PER) % PER;
  const uTime = uniform(0), uMin = uniform(1.0 * 2 / H);
  const WARM = [1.0, 0.74, 0.46];
  const at = (s, y, back, out) => {   // a point on the walls at perimeter s, height y, `back` m behind the plane
    s = wrapS(s); let w = 0; while (w < NW - 1 && s >= offs[w + 1]) w++;
    const W = walls[w], x = s - offs[w] - W.width / 2;
    return out.set(W.centre.x + W.right.x * x - W.normal.x * back, y, W.centre.z + W.right.z * x - W.normal.z * back);
  };
  const sOf = (wall, x) => offs[wall] + walls[wall].width / 2 + x;
  const clipOf = (pv) => cameraProjectionMatrix.mul(pv);
  const ndcScale = (pv, c0, size) => { const c1 = clipOf(vec4(pv.xy.add(vec2(size, size)), pv.z, 1)); return abs(c1.xy.div(c1.w).sub(c0.xy.div(c0.w))).add(1e-7); };

  // ---- the trail: the head's last NT positions as a tapered ribbon (clip space, never < 1 px)
  const NT = 56, F = 9, TA = new Float32Array(NT * 2 * F), tIdx = [];
  for (let j = 0; j < NT - 1; j++) { const a = j * 2; tIdx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  for (let j = 0; j < NT; j++) for (let sd = 0; sd < 2; sd++) { const o = (j * 2 + sd) * F; TA[o + 6] = j / (NT - 1); TA[o + 7] = sd ? 1 : -1; TA[o + 1] = -50; }
  const tib = new THREE.InterleavedBuffer(TA, F); tib.setUsage(THREE.DynamicDrawUsage);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.InterleavedBufferAttribute(tib, 3, 0)); tg.setAttribute('aT', new THREE.InterleavedBufferAttribute(tib, 3, 3)); tg.setAttribute('aF', new THREE.InterleavedBufferAttribute(tib, 3, 6));
  tg.setIndex(new THREE.BufferAttribute(new Uint32Array(tIdx), 1));
  const uAlpha = uniform(0), uFlash = uniform(0);
  {
    const pos = attribute('position', 'vec3'), tgv = attribute('aT', 'vec3'), aF = attribute('aF', 'vec3');
    const t = aF.x, side = aF.y;
    const pv = modelViewMatrix.mul(vec4(pos, 1)), c0 = clipOf(pv), ct = clipOf(vec4(pv.xyz.add(modelViewMatrix.mul(vec4(tgv, 0)).xyz.mul(0.05)), 1));
    const wid = float(0.0035).mul(pow(t, 1.5)).add(0.0004), d = ndcScale(pv, c0, wid);
    const dir = ct.xy.div(ct.w).sub(c0.xy.div(c0.w)).div(d), dn = dir.div(length(dir).add(1e-6)), perp = vec2(dn.y.negate(), dn.x);
    const k = max(float(1), uMin.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = vec4(c0.xy.add(perp.mul(d).mul(k).mul(side).mul(c0.w)), c0.z, c0.w);
    const vT = varying(t), vS = varying(side), vK = varying(float(1).div(k));
    m.colorNode = mix(vec3(1.0, 0.45, 0.2), vec3(WARM[0], WARM[1], WARM[2]), vT).mul(pow(vT, 1.8).mul(1.4)).mul(float(1).sub(vS.mul(vS))).mul(vK).mul(uAlpha);
    m.fog = false;
    const mesh = new THREE.Mesh(tg, m); mesh.frustumCulled = false; mesh.renderOrder = 9; object.add(mesh);
  }
  // ---- the head: a small warm light, a flash when it presses
  const uHead = uniform(new THREE.Vector4(0, -50, 0, 0));
  {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(uHead.xyz, 1)), sz = float(0.05).add(uFlash.mul(0.12));
    m.vertexNode = TSL.select(uAlpha.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(TSL.positionGeometry.xy.mul(sz.mul(3))), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const dd = TSL.uv().sub(0.5).mul(2), r2 = dot(dd, dd).mul(9);
    m.colorNode = mix(vec3(WARM[0], WARM[1], WARM[2]), vec3(1, 0.96, 0.88), exp(r2.mul(-5))).mul(exp(r2.mul(-1.4)).mul(0.3).add(exp(r2.mul(-7)).mul(1.0))).mul(uFlash.mul(1.4).add(0.8)).mul(uAlpha);
    m.fog = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false; mesh.renderOrder = 10; object.add(mesh);
  }
  // ---- motes: shed by the head, they drift and fade (a pool of NM)
  const NM = 220, MA = new Float32Array(NM * 4 * 8), mIdx = new Uint32Array(NM * 6), Cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < NM; k++) { for (let c = 0; c < 4; c++) { const o = (k * 4 + c) * 8; MA[o + 1] = -50; MA[o + 3] = Cc[c][0]; MA[o + 4] = Cc[c][1]; } const q = k * 4; mIdx.set([q, q + 1, q + 2, q, q + 2, q + 3], k * 6); }
  const mib = new THREE.InterleavedBuffer(MA, 8); mib.setUsage(THREE.DynamicDrawUsage);
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(mib, 3, 0)); g.setAttribute('aM', new THREE.InterleavedBufferAttribute(mib, 4, 3)); g.setIndex(new THREE.BufferAttribute(mIdx, 1));
    const p = attribute('position', 'vec3'), am = attribute('aM', 'vec4');   // corner xy, life 0..1, size
    const pv = modelViewMatrix.mul(vec4(p, 1)), c0 = clipOf(pv), d = ndcScale(pv, c0, float(0.004).add(am.w.mul(0.006))), k = max(float(1), uMin.div(d.y));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    m.vertexNode = TSL.select(am.z.greaterThan(0.001), vec4(c0.xy.add(am.xy.mul(d).mul(k).mul(c0.w)), c0.z, c0.w), vec4(0, 0, 2, 1));
    const vM = varying(am), vK = varying(float(1).div(k.mul(k)));
    const r2 = dot(vM.xy, vM.xy);
    m.colorNode = vec3(WARM[0], WARM[1], WARM[2]).mul(float(1).sub(smoothstep(0.3, 1.0, r2))).mul(pow(vM.z, 1.5)).mul(vK.mul(0.6).add(0.4)).mul(1.1);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; object.add(mesh);
  }
  const motes = []; for (let k = 0; k < NM; k++) motes.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), life: 0, max: 1, size: Math.random() });
  let nextMote = 0, moteAcc = 0;

  // ---- state
  const head = new THREE.Vector3(0, -50, 0), prev = new THREE.Vector3(), trail = []; for (let j = 0; j < NT; j++) trail.push(new THREE.Vector3(0, -50, 0));
  const fired = new Set(), out = [], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let alpha = 0, flash = 0, lastT = -1;
  // where the head is at time t: before the first target it glides in from 3 m back along the perimeter; between targets it glides the
  // short way; at a target it dips into the wall (a press) for the target's hold; after the last it glides on 3 m and fades
  function sample(t, plan, outP) {
    const T = plan.targets; if (!T.length) return 0;
    const s = T.map((q) => sOf(q.wall, q.x));
    const glide = (s0, s1, y0, y1, k) => { let d = s1 - s0; if (d > PER / 2) d -= PER; if (d < -PER / 2) d += PER; const e = k * k * (3 - 2 * k), y = y0 + (y1 - y0) * e + Math.sin(Math.PI * e) * 0.18; return at(s0 + d * e, y, 0.03 + Math.sin(Math.PI * e) * 0.12, outP); };
    if (t < T[0].t) { const k = clamp01((t - plan.start) / Math.max(0.3, T[0].t - plan.start)); glide(s[0] - 3.2, s[0], T[0].y + 0.25, T[0].y, k); return smooth01(k * 3); }
    for (let i = 0; i < T.length; i++) {
      const q = T[i], pressEnd = q.t + (q.hold || 0.5);
      if (t < pressEnd) { const u = clamp01((t - q.t) / (q.hold || 0.5)), dip = Math.sin(Math.PI * Math.min(1, u * 2.2)) * 0.03 + 0.012; at(s[i], q.y, dip, outP); return 1; }
      const nx = T[i + 1];
      if (nx && t < nx.t) { glide(s[i], s[i + 1], q.y, nx.y, clamp01((t - pressEnd) / Math.max(0.3, nx.t - pressEnd))); return 1; }
      if (!nx) { const k = clamp01((t - pressEnd) / (plan.exit ?? 1.6)); glide(s[i], s[i] + 3.2, q.y, q.y + 0.35, k); return 1 - smooth01(k); }
    }
    return 0;
  }
  function update(dt, t, plan) {
    out.length = 0;
    uTime.value = t;
    if (lastT > t + 0.5) fired.clear();   // the clock went back (a new pass of the block): the opening plays again
    lastT = t;
    if (!plan || !plan.targets?.length || t < plan.start) { alpha = Math.max(0, alpha - dt * 3); uAlpha.value = alpha; if (alpha <= 0) uHead.value.set(0, -50, 0, 0); stepMotes(dt, false); return out; }
    const a = sample(t, plan, head);
    // events: a press when the head reaches a target; for a hold, a release when it leaves
    plan.targets.forEach((q, i) => {
      if (t >= q.t && !fired.has('p' + i)) { fired.add('p' + i); out.push({ type: q.hold > 0.8 ? 'hold' : 'press', i, wall: q.wall, pos: at(sOf(q.wall, q.x), q.y, 0, new THREE.Vector3()) }); flash = 1; }
      if (q.hold > 0.8 && t >= q.t + q.hold && !fired.has('r' + i)) { fired.add('r' + i); out.push({ type: 'release', i, wall: q.wall, pos: at(sOf(q.wall, q.x), q.y, 0, new THREE.Vector3()) }); }
    });
    alpha += (a - alpha) * Math.min(1, dt * 8); uAlpha.value = alpha;
    flash = Math.max(0, flash - dt * 2.2);
    // while it holds, a soft beat
    const holding = plan.targets.some((q) => q.hold > 0.8 && t >= q.t && t < q.t + q.hold);
    uFlash.value = flash + (holding ? 0.25 + 0.15 * Math.sin(t * 9) : 0);
    uHead.value.set(head.x, head.y, head.z, alpha);
    // the trail: shift the positions along (one sample a frame), then write the ribbon
    for (let j = 0; j < NT - 1; j++) trail[j].copy(trail[j + 1]);
    trail[NT - 1].copy(head); if (trail[0].y < -40) for (const p of trail) p.copy(head);
    for (let j = 0; j < NT; j++) {
      const p = trail[j], q = trail[Math.min(NT - 1, j + 1)], r = trail[Math.max(0, j - 1)];
      tmp.subVectors(q, r); if (tmp.lengthSq() < 1e-10) tmp.set(1, 0, 0); tmp.normalize();
      for (let sd = 0; sd < 2; sd++) { const o = (j * 2 + sd) * F; TA[o] = p.x; TA[o + 1] = p.y; TA[o + 2] = p.z; TA[o + 3] = tmp.x; TA[o + 4] = tmp.y; TA[o + 5] = tmp.z; }
    }
    tib.needsUpdate = true;
    // motes: shed with the speed, a burst on a press
    const sp = prev.distanceTo(head) / Math.max(dt, 1e-3); prev.copy(head);
    moteAcc += dt * (40 + sp * 30) * alpha + (flash > 0.95 ? 24 : 0);
    stepMotes(dt, true);
    return out;
  }
  function stepMotes(dt, emit) {
    while (emit && moteAcc >= 1) {
      moteAcc -= 1; const m = motes[nextMote]; nextMote = (nextMote + 1) % NM;
      m.p.copy(head).add(tmp2.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05));
      m.v.set((Math.random() - 0.5) * 0.25, 0.05 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25); m.life = 1; m.max = 0.7 + Math.random() * 1.1;
    }
    for (let k = 0; k < NM; k++) {
      const m = motes[k];
      if (m.life > 0) { m.life = Math.max(0, m.life - dt / m.max); m.p.addScaledVector(m.v, dt); m.v.multiplyScalar(1 - dt * 0.8); }
      for (let c = 0; c < 4; c++) { const o = (k * 4 + c) * 8; MA[o] = m.p.x; MA[o + 1] = m.life > 0 ? m.p.y : -50; MA[o + 2] = m.p.z; MA[o + 5] = m.life; MA[o + 6] = m.size; }
    }
    mib.needsUpdate = true;
  }
  // a plan from the part's `intro` parameter: { start, walls: [t0, t1, …] (one per target, in order), hold, y }
  function planOf(intro, targets) {
    if (!intro || intro === false || intro.on === false) return null;
    const ts = intro.walls || [];
    return { start: intro.start ?? 0.6, exit: intro.exit ?? 1.6, targets: targets.map((q, i) => ({ ...q, t: ts[i] ?? (intro.start ?? 0.6) + 1.6 + i * 1.8, hold: q.hold ?? intro.hold ?? 0.5, y: intro.y ?? q.y ?? 1.2 })) };
  }
  return { object, update, planOf, get head() { return head; } };
}
