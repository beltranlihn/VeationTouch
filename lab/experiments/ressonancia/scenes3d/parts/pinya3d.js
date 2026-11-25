// Ressonància — part «pinya3d»: chapter II, Pinya · Força (contract: ../PARTS.md; plan 05 §5.7 M2). STUDIO NIGHT 25-11: the point
// clouds and fibres are gone; the pinya is made of the body kit (../bodykit.js): solid ceramic castellers, lit, on the floor, with shadows.
// (The earlier point-cloud part is in git history before 25-11.)
//
// A LIGHT world (D5b): the lit square (plaza.js, lit mode) behind, bodies in cal-foc / terracota / faixa with ombra shadows.
//   THE FIGURE THAT COMES TO YOUR PALM (M2, D3): every hand gets a person of ceramic 0.4–0.6 m behind the wall whose right palm lies
//     exactly under the hand, on the wall plane (≈ 1.4 m tall seen on the wall). It is there in the first frame (it steps forward over
//     0.5 s from 2 m back) and its height follows the hand: low hands get a child, high hands an arm raised. The palm IS the target
//     (S.targets kind 'palm'): at rest a figure already stands at each palm target offering its palm; charging the target loads the
//     figure's weight onto the hand (it leans in, the palm warms in gold as it charges), and when it is held it STAYS (25 s after the
//     hand leaves). In the pack stage the figures slide to the wall's centre (the score's 'pack') and the hands follow them.
//   'ach:wallfull' / 'wall:<w>': the figures of that wall lock shoulder to shoulder (arms over the neighbours) and stay for the block.
//   THE PINYA OF EACH WALL: rings of castellers round a point 3.0 m behind the wall's centre (the castell's foot), facing in. With
//     fill[w] they come in from a loose crowd to the rings and take the pinya's postures (arms locked, hands on the backs in front);
//     'close' → everyone locks; the walls of the structure keep their pinya, the others loosen.
// Study (no input.state): params fill, closed, arrive, leave, density, depth, pack, floor. One waiting figure per wall.
import { createBodies } from '../bodykit.js';
import { lin } from '../palette.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const NPALM = 18;            // figures for hands (16) + waiting ones
const RINGS = [{ r: 0.7, n: 9, pose: 'lock' }, { r: 1.15, n: 14, pose: 'lock' }];   // two tight rings (perf: the splat budget)   // a TIGHT mass, shoulder to shoulder, arms to the centre

export function create({ THREE, TSL, room, params }) {
  const P = params || {};
  const object = new THREE.Group(); object.name = 'pinya3d';
  const walls = room.walls, NW = walls.length;
  const perWall = RINGS.reduce((a, r) => a + r.n, 0);
  const NCROWD = Math.min(160, perWall * NW);
  const kit = createBodies({ THREE, TSL, room, max: NPALM + NCROWD });
  object.add(kit.object);
  // ---- THE FIGURE'S OWN PALM GLOWS while a hand charges it (AD #8; it replaces targets3d's ring for kind 'palm'): a small gold light in
  //      the palm, on the wall plane, growing with the charge, a flash when it is held
  const { Fn, attribute, varying, vec4, positionGeometry, modelViewMatrix, cameraProjectionMatrix, dot, exp, max } = TSL;
  const OR = lin('or'), NPG = 24, pgA = new Float32Array(NPG * 4), pgC = new Float32Array(NPG * 4);
  const pgGeo = new THREE.InstancedBufferGeometry();
  pgGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); pgGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const PGA = new THREE.InstancedBufferAttribute(pgA, 4), PGC = new THREE.InstancedBufferAttribute(pgC, 4);
  PGA.setUsage(THREE.DynamicDrawUsage); PGC.setUsage(THREE.DynamicDrawUsage); pgGeo.setAttribute('pgA', PGA); pgGeo.setAttribute('pgC', PGC); pgGeo.instanceCount = 0;
  const pgMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  {
    const a = attribute('pgA', 'vec4'), c = attribute('pgC', 'vec4'), mv = modelViewMatrix.mul(vec4(a.xyz, 1));
    const sz = max(a.w, mv.z.negate().mul(0.004));
    pgMat.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(sz)), mv.z, mv.w));
    const vQ = varying(positionGeometry.xy), vC = varying(c.xyz);
    pgMat.colorNode = Fn(() => { const d2 = dot(vQ, vQ); return vec4(vC.mul(exp(d2.mul(-7)).add(exp(d2.mul(-60)).mul(1.2))), 1); })();
    pgMat.fog = false;
  }
  const pgMesh = new THREE.Mesh(pgGeo, pgMat); pgMesh.frustumCulled = false; pgMesh.renderOrder = 9; object.add(pgMesh);
  let nPG = 0;
  const palmGlow = (x, y, z, s, k) => { if (nPG >= NPG || k <= 0.003) return; const o = nPG * 4; pgA[o] = x; pgA[o + 1] = y; pgA[o + 2] = z; pgA[o + 3] = s; pgC[o] = OR[0] * k; pgC[o + 1] = OR[1] * k; pgC[o + 2] = OR[2] * k; nPG++; };
  // the floor in the study only (in the work the lit square brings its own, with the key shadow)
  let floor = null;
  if (room.ground) { floor = room.ground({ color: 'cal-foc' }); floor.mesh.visible = false; object.add(floor.mesh); }

  // ---- rng
  let seed = 9173; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ---- the crowd: rings round each wall's castell foot
  const crowd = [];
  for (let w = 0; w < NW && crowd.length < NCROWD; w++) {
    RINGS.forEach((R, ri) => {
      for (let k = 0; k < R.n && crowd.length < NCROWD; k++) {
        const a = (k / R.n) * Math.PI * 2 + ri * 0.37 + w + (rnd() - 0.5) * 0.6 * Math.PI * 2 / R.n;
        crowd.push({ i: NPALM + crowd.length, w, ri, a, r: R.r, pose: R.pose, order: ri / RINGS.length * 0.55 + rnd() * 0.45,
          build: rnd() < 0.5 ? 0 : 1, scale: 0.92 + rnd() * 0.16, loose: 0.9 + rnd() * 1.6, la: (rnd() - 0.5) * 0.9, alive: 0, tint: 0.9 + rnd() * 0.12, ph: rnd() * 6.28,
          yj: (rnd() - 0.5) * 0.24, lean: 0.18 + rnd() * 0.22 });   // AD: height ±8 %, yaw and phase variation, heads leaning in by different amounts
      }
    });
  }
  const footOf = (w, D, out) => out.copy(walls[w].centre).addScaledVector(walls[w].normal, -D).setY(0);

  // ---- the palm figures
  const palms = Array.from({ length: NPALM }, (_, i) => ({ i, on: false, idle: false, wall: 0, x: 0, y: 1.25, stroke: null, app: 0, contact: 0, charge: 0,
    held: 0, stay: 0, glow: 0, locked: false, lockX: 0, lockK: 0, wait: 0, back: false, tgId: 0, build: i % 2, back0: 2 }));
  const pA = kit.palm('palm', 0), pR = kit.palm('raise', 0);
  function palmPlace(q, pose = {}) {
    // height → body: a child below ~1 m, an adult up to 1.47 m, then the arm rises (palm → raise)
    const y = Math.min(2.1, Math.max(0.55, q.y));
    const pa = kit.palm('palm', q.build), pc = kit.palm('palm', 2);
    let s = y / pa[1], build = q.build, m = 0, pl = pa;
    if (s < 0.86) { build = 2; s = Math.min(0.8, Math.max(0.55, y / pc[1])); pl = pc; }
    else if (s > 1.06) { s = 1.06; const pr = kit.palm('raise', q.build); m = clamp01((y / s - pa[1]) / (pr[1] - pa[1])); pl = [pa[0] + (pr[0] - pa[0]) * m, pa[1] + (pr[1] - pa[1]) * m, pa[2] + (pr[2] - pa[2]) * m]; }
    pose.s = s; pose.build = build; pose.m = m; pose.pl = pl;
    return pose;
  }

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), foot = new THREE.Vector3();
  function freeFig() {
    const f = palms.find((p) => !p.on); if (f) return f;
    let old = null; for (const p of palms) if (p.join >= 1 && (!old || p.joinAt < old.joinAt)) old = p;
    if (old) { old.join = 0; old.on = false; old.app = 0; }
    return old;
  }
  const _pose = {};
  let fills = new Array(NW).fill(0), closedS = 0, packK = new Array(NW).fill(0), lockWall = new Array(NW).fill(0);
  let studyPrevFill = new Array(NW).fill(0), mode = '';

  function update(dt, input) {
    dt = Math.min(0.1, dt || 0.016);
    const prm = input.params || P, time = input.time ?? 0, st = input.state;
    const withScore = !!(st && Array.isArray(st.fill));
    const arrive = clamp01(input.arrive ?? prm.arrive ?? 1), leave = clamp01(input.leave ?? prm.leave ?? 0);
    const there = smooth(arrive) * (1 - smooth(leave));
    // lighting: in the work the lit square's key (real shadow) lights them; alone, self-lit + the kit's cast shadow
    const m = withScore ? 'scene' : 'self';
    if (m !== mode) { mode = m; kit.setLighting(m); }
    if (floor) floor.mesh.visible = !withScore && prm.floor !== false;
    const D = prm.depth ?? 3.0;   // the castell's foot: close, the same place as the Tronc's tower (2.3 m)

    // ---- the score's state (or the study stand-in)
    let closed = 0, structure = null;
    const events = input.events || [];
    if (withScore) {
      for (let w = 0; w < NW; w++) fills[w] = st.fill[w] ?? 0;
      closed = st.block === 'pinya' ? (st.phase === 'reward' ? 1 : st.closed ?? 0) : 1;
      if (closed >= 1 && Array.isArray(st.walls) && st.walls.some(Boolean)) structure = st.walls;
      for (const e of events) {
        if (e.startsWith('wall:')) lockWall[(+e.slice(5)) % NW] = 1;
        else if (e.startsWith('ach:wallfull') && st.ach && st.ach.wall >= 0) lockWall[st.ach.wall % NW] = 1;
      }
      for (let w = 0; w < NW; w++) if (fills[w] >= 1) lockWall[w] = 1;
    } else {
      const f = clamp01(prm.fill ?? 0.6);
      for (let w = 0; w < NW; w++) { fills[w] = f; if (studyPrevFill[w] < 1 && f >= 1) lockWall[w] = 1; if (f < 1) lockWall[w] = 0; studyPrevFill[w] = f; }
      closed = clamp01(prm.closed ?? 0);
    }
    closedS += (closed - closedS) * Math.min(1, dt * 1.2);

    // ---- the crowd
    const dens = clamp01(prm.density ?? 1), nShow = Math.round(NCROWD * (0.45 + 0.55 * dens));
    for (let k = 0; k < crowd.length; k++) {
      const c = crowd[k];
      if (k >= nShow || there <= 0.001) { kit.hide(c.i); continue; }
      const f = structure ? (structure[c.w] ? 1 : fills[c.w] * 0.5) : fills[c.w];
      const want = smooth((f * 1.15 - c.order + 0.12) / 0.24);
      c.alive += (want - c.alive) * Math.min(1, dt / (want > c.alive ? 1.1 : 2.2));
      const al = c.alive;
      if (al < 0.03) { kit.hide(c.i); continue; }                                  // not yet: no body, no dust
      footOf(c.w, D, foot);
      // the pinya is a TIGHT ring in lock round its centre (AD): its place is fixed, it gathers there (form), it never stands loose
      const r = c.r, a = c.a;
      const x = foot.x + Math.cos(a) * r, z = foot.z + Math.sin(a) * r;
      const yaw = Math.atan2(foot.x - x, foot.z - z) + c.yj;
      // a radial ring: arms locked, heads tilted to the centre (lock → carry by each body's own lean), the lean breathing slowly
      const tilt = c.lean + 0.06 * Math.sin(time * 0.35 + c.ph);
      // particles (25-11): the loose crowd is half air — the pinya assembles as the wall fills, and breathes
      kit.set(c.i, { pos: [x, 0, z], yaw, pose: 'lock', pose2: 'carry', mix: tilt, scale: c.scale, build: c.build, tint: [c.tint, c.tint, c.tint], glow: 0,
        form: al * there, fmode: 'gather', pool: 0.16 * al * there });   // a warm pool of light under the ring
    }

    // ---- hands → wall coordinates
    const hands = input.hands || [];
    const hx = [];
    for (const h of hands) { const w = walls[h.wall]; hx.push({ stroke: h.stroke, wall: h.wall, x: tmp.copy(h.pos).sub(w.centre).dot(w.right), y: h.pos.y }); }
    // the palm targets (the score's), else one waiting figure per wall at its centre (study / before the targets)
    const tgs = withScore && Array.isArray(st.targets) ? st.targets.filter((t) => t.kind === 'palm' && t.state !== 'done') : null;
    const waits = tgs ? tgs.map((t) => ({ wall: t.wall % NW, x: t.dx, y: t.y, id: t.id, charge: t.state === 'active' ? 1 : t.charge || 0 }))
      : (withScore && st.block === 'pinya' && st.pinyaStage === 'pack') ? [] : walls.map((_, w) => ({ wall: w, x: 0, y: 1.25, id: -1 - w, charge: 0 }));
    // waiting figures: keep one per offered palm
    for (const wt of waits) {
      let q = palms.find((p) => p.idle && p.tgId === wt.id);
      if (!q) { q = palms.find((p) => !p.on); if (!q) continue; Object.assign(q, { join: 0, on: true, idle: true, tgId: wt.id, wall: wt.wall, x: wt.x, y: wt.y, stroke: null, app: 0, contact: 0, charge: 0, wasHeld: false, heldT: 0, stay: 0, glow: 0, locked: false, back: false, wait: 0 }); }
      q.wall = wt.wall; q.tx = wt.x; q.ty = wt.y; q.tCharge = wt.charge; q.seen = true;
    }
    for (const q of palms) if (q.idle && !q.stroke && !q.seen && !q.locked) q.idle = false;   // its target is gone: it leaves (stay → retreat)
    for (const q of palms) q.seen = false;
    // claims: a new hand takes the waiting figure within 0.9 m on its wall, else a figure steps out of the crowd
    for (const h of hx) {
      if (palms.some((q) => q.stroke === h.stroke)) continue;
      let q = palms.find((p) => p.on && p.idle && !p.stroke && p.wall === h.wall && Math.abs(p.x - h.x) < 0.9);
      if (!q) q = freeFig() || palms.filter((p) => p.on && !p.stroke && !p.locked && !p.join).sort((a, b) => a.stay - b.stay)[0];
      if (!q) continue;
      if (!q.on || q.wall !== h.wall || Math.abs(q.x - h.x) > 0.9) Object.assign(q, { app: 0, x: h.x, y: h.y, wall: h.wall, back0: 0.25, charge: 0, glow: 0, locked: false, wasHeld: false, heldT: 0 });   // it ASSEMBLES there (particles stream in), barely steps
      Object.assign(q, { on: true, idle: false, stroke: h.stroke, held: 1.2, stay: 25, back: false, wait: 0 });
    }
    // pack targets: the figures with a hand on each wall, ordered along it, shoulder to shoulder round its centre
    const packStage = withScore ? st.pinyaStage === 'pack' : !!prm.pack;
    for (let w = 0; w < NW; w++) {
      const list = palms.filter((q) => q.on && (q.stroke !== null || q.locked) && q.wall === w).sort((a, b) => a.x - b.x);
      list.forEach((q, k) => { q.slot = (k - (list.length - 1) / 2) * 0.62; });
      if (lockWall[w]) for (const q of list) { if (!q.locked) { q.locked = true; q.lockK = 0; q.glow = Math.max(q.glow, 0.6); } }
    }

    // ---- per palm figure (a figure that joined the ring keeps its place there; when no figure is free, the oldest of them is lent
    //      back — it fades out of the ring and gathers at the new hand)
    nPG = 0;
    for (const q of palms) {
      if (!q.on) { kit.hide(q.i); continue; }
      if (there <= 0.001) { q.join = 0; q.on = false; kit.hide(q.i); continue; }   // the block is gone: the joined ones go with it
      // «YOU BECAME PART OF THE PINYA» (director 25-11): a figure whose palm was held walks back into the ring in ~2.6 s (its particles
      // stream as it goes, its light pool trailing), turns to the centre and locks in with the others; it stays for the block
      if (q.join > 0) {
        const was = q.join; q.join = Math.min(2, q.join + dt / 2.6); if (was < 1 && q.join >= 1) q.joinAt = time;
        const t = smooth(Math.min(1, q.join)), inRing = q.join >= 1;
        const x = q.fx + (q.jx - q.fx) * t, z = q.fz + (q.jz - q.fz) * t;
        let dy = q.jyaw - q.fyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const tilt = 0.24 + 0.06 * Math.sin(time * 0.35 + q.i * 1.7);
        kit.set(q.i, { pos: [x, 0, z], yaw: q.fyaw + dy * t, pose: inRing ? 'lock' : 'stand', pose2: inRing ? 'carry' : 'lock', mix: inRing ? tilt : t, scale: q.js, build: q.jb,
          glow: q.glow * there, tint: [1, 1, 1], form: there * (1 - 0.45 * Math.sin(Math.PI * Math.min(1, q.join))), fmode: 'gather', lod: 'near', pool: 0.16 + 0.3 * (1 - t) });
        q.glow = Math.max(0, q.glow - dt * 0.9);
        continue;
      }
      const h = q.stroke !== null ? hx.find((e) => e.stroke === q.stroke) : null;
      if (q.stroke !== null && !h) { q.held -= dt; if (q.held <= 0) q.stroke = null; }
      if (h) {
        const d = Math.hypot(h.x - q.x, h.y - q.y);
        if (q.app < 0.98) { q.x += (h.x - q.x) * Math.min(1, dt * 10); q.y += (h.y - q.y) * Math.min(1, dt * 10); }
        else if (packStage && !q.locked && d < 0.35) { const dx = (q.slot ?? 0) - q.x; q.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.3 * dt); q.y += (h.y - q.y) * Math.min(1, dt * 3); q.wait = 0; q.back = false; }
        else if (d < 0.35) { q.x += (h.x - q.x) * Math.min(1, dt * 6); q.y += (h.y - q.y) * Math.min(1, dt * 6); }
        else if (d < 0.8 && !q.back) { q.wait += dt; if (q.wait > 1.6) q.back = true; }
        else { const k = Math.min(1, (0.6 * dt) / Math.max(1e-3, d)); q.x += (h.x - q.x) * k; q.y += (h.y - q.y) * k; if (d < 0.08) { q.back = false; q.wait = 0; } }
        q.contact = d < 0.32 ? Math.min(1, q.contact + dt * 5) : Math.max(0, q.contact - dt * 2);
        q.stay = 25;
      } else {
        q.contact = Math.max(0, q.contact - dt * 1.5);
        if (q.idle) { q.x += ((q.tx ?? 0) - q.x) * Math.min(1, dt * 0.8); q.y += ((q.ty ?? 1.25) + Math.sin(time * 0.63 + q.i) * 0.012 - q.y) * Math.min(1, dt * 0.8); }
        else if (!q.locked) q.stay -= dt;
      }
      // charge: the target's own, else the time of contact; the weight loads, the palm warms in gold, held = it stays
      const tc = q.idle || q.stroke !== null ? (q.tCharge ?? 0) : 0;
      const charge = Math.max(tc, q.contact >= 0.99 ? Math.min(1, q.charge + dt / 0.5) : q.charge * Math.max(0, 1 - dt * 0.4));
      if (q.charge < 1 && charge >= 1) { q.glow = 0.6; q.heldT = 0; q.wasHeld = true; }
      if (q.wasHeld && h) q.heldT = (q.heldT || 0) + dt;
      q.charge = charge;
      q.glow = Math.max(0, q.glow - dt * 0.9);   // gold only as a brief flash of achievement (held / locked), never a standing colour
      // arrive / retreat
      const go = q.stay > 0 || q.idle || q.locked;
      q.app = go ? Math.min(1, q.app + dt / 1.4) : Math.max(0, q.app - dt / 2.5);      // it gathers at once and is whole in ≈ 1.4 s (from the ground and the hand inward); it dissolves slowly
      if (q.app <= 0 && !go) { q.on = false; kit.hide(q.i); continue; }
      if (q.locked) { q.lockK = Math.min(1, q.lockK + dt / 1.4); q.x += ((q.slot ?? q.x) - q.x) * Math.min(1, dt * 0.8); }
      // place: the palm on the wall plane at (x, y); the body faces into the room
      const w = walls[q.wall], yaw = Math.atan2(w.normal.x, w.normal.z);
      const pp = palmPlace(q, _pose);
      const e = smooth(q.app), lean = 0.04 * q.charge;                         // the weight goes into the hand
      const back = (1 - e) * q.back0 + (q.locked ? 0.12 * q.lockK : 0);
      // body origin = palm point − R(yaw)·palmLocal·s, pushed back while it arrives
      const X = [Math.cos(yaw), -Math.sin(yaw)], F = [Math.sin(yaw), Math.cos(yaw)];
      const lx = pp.pl[0] * pp.s, lz = pp.pl[2] * pp.s;
      tmp.copy(w.centre).addScaledVector(w.right, q.x);
      const ox = tmp.x - X[0] * lx - F[0] * lz + w.normal.x * (lean - back) * 1, oz = tmp.z - X[1] * lx - F[1] * lz + w.normal.z * (lean - back);
      const vis = there * q.app;
      // held (the palm target done) and then let go — or held 2.5 s: it goes to join the ring (not in the pack stage: those slide and lock)
      if (!q.join && !q.locked && !packStage && q.wasHeld && q.app > 0.95 && (!h || q.heldT > 2.5)) {
        footOf(q.wall, D, foot);
        const n = walls[q.wall].normal, a0 = Math.atan2(n.z, n.x), k = palms.filter((o) => o.join > 0 && o.wall === q.wall).length;
        const a = a0 + (k % 2 ? 1 : -1) * (0.17 + Math.floor(k / 2) * 0.33), r = 1.55;   // the front arc of a third ring, towards the room
        Object.assign(q, { wasHeld: false, join: 1e-4, fx: ox, fz: oz, fyaw: yaw, js: pp.s, jb: pp.build, jx: foot.x + Math.cos(a) * r, jz: foot.z + Math.sin(a) * r, stroke: null, idle: false, glow: Math.max(q.glow, 0.4) });
        q.jyaw = Math.atan2(foot.x - q.jx, foot.z - q.jz);
        continue;
      }
      if (vis <= 0.002) { kit.hide(q.i); continue; }
      let pose = 'palm', pose2 = pp.m > 0 ? 'raise' : 'palm', mix = pp.m;
      if (q.app < 0.999) { pose = 'palm'; pose2 = pp.m > 0 ? 'raise' : 'palm'; mix = pp.m; }   // assembled straight into the offered palm
      if (q.locked) {   // locked shoulder to shoulder — only with a neighbour; alone it stands (AD: no T-posed flankers)
        const mate = palms.some((o) => o !== q && o.on && o.locked && o.wall === q.wall && Math.abs((o.slot ?? o.x) - (q.slot ?? q.x)) < 0.9);
        pose = 'palm'; pose2 = mate ? 'lock' : 'stand'; mix = q.lockK;
      }
      else if (!h && !q.idle && q.stay < 8) { pose = 'stand'; pose2 = 'palm'; mix = clamp01(q.stay / 8); }   // the arm comes down before it goes back
      // a waiting figure (an offered palm, nobody there yet) is a quieter suggestion: dimmer, not fully gathered; with a hand: whole, bright
      const held = q.stroke !== null || q.locked || q.charge > 0.05, wk = held ? 1 : 0.45, wf = 1;   // waiting: dimmer but whole (AD: no blurry half-gathered discs)
      { const k = (q.charge > 0.02 ? (0.15 + 0.85 * q.charge) * (q.stroke !== null || q.idle ? 1 : 0.5) : 0) * 0.9 + q.glow * 1.6;   // the palm: on the wall plane
        palmGlow(tmp.x + w.normal.x * 0.02, q.y, tmp.z + w.normal.z * 0.02, 0.05 + 0.08 * q.charge + 0.1 * q.glow, k * there * q.app); }
      kit.set(q.i, { pos: [ox, 0, oz], yaw, pose, pose2, mix, scale: pp.s, build: pp.build, glow: q.glow * there, tint: [wk, wk, wk], form: e * wf * there, fmode: 'gather', lod: 'near', pool: held ? 0.35 : 0 });
    }
    pgGeo.instanceCount = nPG; PGA.needsUpdate = true; PGC.needsUpdate = true;
    kit.update(dt);
  }

  // textObstacles() → [{ wall, x, half, y0, y1 }] (wall coordinates, m): where the bodies are this frame, so the text avoids them
  const OB = [];
  function textObstacles() {
    OB.length = 0;
    for (let w = 0; w < NW; w++) if (crowd.some((c) => c.w === w && c.alive > 0.1)) {
      const dW = Math.max(0.5, -tmp.copy(walls[w].centre).sub(room.eye).dot(walls[w].normal)), D = P.depth ?? 3.0, k = dW / (dW + D);
      OB.push({ wall: w, x: 0, half: (RINGS[RINGS.length - 1].r + 0.3) * k, y0: 0, y1: room.eye.y + (1.75 - room.eye.y) * k });
    }
    for (const q of palms) if (q.on && q.app > 0.05 && !q.join) OB.push({ wall: q.wall, x: q.x + 0.25, half: 0.38, y0: 0, y1: Math.min(2.1, Math.max(q.y + 0.35, 1.5)) });
    return OB;
  }
  function dispose() { kit.dispose(); pgGeo.dispose(); pgMat.dispose(); }
  if (typeof window !== 'undefined') window.__pinya3d = { kit, palms, crowd, get ready() { return kit.isReady; } };
  return { object, update, setParams() {}, dispose, impacts: [], kit, textObstacles };
}
