// Ressonància — the hold-targets, drawn (plan 05 §2.6, D3b). Owner: Tech/QA. The RULES live in ../targets.js (Interacción): this
// module only draws what the score publishes in S.targets, so the picture and the sound see the same targets.
//
//   const T3 = createTargets3D({ THREE, TSL, room });   room.overlay.add(T3.object);
//   T3.update(dt, { targets: S.targets, block: S.block, time, on });   // every frame; on = the "guide" parameter
//
// One target = a glass ring on the wall plane (Ø 2·r, r = 0.22 m by default), centred at (wall, dx, y), with a soft dark disc behind
// it so it reads over any universe. Its states:
//   idle      the ring in the chapter's LIGHT tone (palette.js › PAL[block].light), breathing slowly; it assembles from its segments
//   (hands)   a hand inside (t.on > 0): the ring grows ~15 % in 300–600 ms and brightens (the sound answers at once: ../targets.js events)
//   charging  the ring's own tesserae turn ACHIEVEMENT GOLD one by one, clockwise from the top (palette.js › ACH, `or`), as `charge` goes 0 → 1
//   active    the whole ring turns gold and glows as `hold` goes 0 → 1
//   done      the ring and its tiles break into fragments that fly towards the consequence (v1: outwards and up; v2: `toward`)
//   gone      a target that leaves the list unused disassembles (segments drift away) in 0.6 s
// kind 'palm' (Pinya: the figure's palm is the target): a quieter ring, no disc. ≤ 16 live targets + 'done' ones (pool of 20). Nothing is allocated per frame: 16 pooled targets, each with its own uniforms.
import { OVER } from './typo3d.js';
import { PAL, ACH, chapter } from './palette.js';

const MAXT = 20, NSEG = 18, R0 = 0.22, TUBE = 0.024;   // 20: ≤ 16 live + the 'done' ones kept 0.8 s for their break

export function createTargets3D({ THREE, TSL, room }) {
  const { uniform, uv, vec2, vec3, float, smoothstep, exp, length, step, select, clamp: tclamp, max, min, cos, sin, abs, pow, dot, normalize, reflect, attribute, positionGeometry, positionLocal, normalWorld, positionWorld, cameraPosition, mix, fract, pmremTexture } = TSL;
  const object = new THREE.Group(); object.name = 'targets3d';
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const uTime = uniform(0);
  // the chapter's light tone and the gold, eased between chapters (linear RGB)
  const REST = uniform(new THREE.Vector3(...PAL.wait.lin.light)), GOLD = vec3(...ACH.lin);
  const restNow = PAL.wait.lin.light.slice();
  const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
  const ease3 = (k) => float(1).sub(float(1).sub(k).mul(float(1).sub(k)).mul(float(1).sub(k)));

  // ---- shared geometry: the ring cut in NSEG segments (each vertex knows its segment's direction and a hash), the disc, the tiles
  const ringGeo = (() => {
    const g = new THREE.TorusGeometry(R0, TUBE, 14, NSEG * 6).toNonIndexed();
    const p = g.getAttribute('position'), n = p.count, seg = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const k = Math.floor(((Math.atan2(cy, cx) / (Math.PI * 2) + 1) % 1) * NSEG), a = ((k + 0.5) / NSEG) * Math.PI * 2;
      const h = ((Math.sin(k * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
      for (let j = 0; j < 3; j++) { seg[(i + j) * 3] = Math.cos(a); seg[(i + j) * 3 + 1] = Math.sin(a); seg[(i + j) * 3 + 2] = h; }
    }
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 3));
    return g;
  })();
  const HALF = R0 * 2.2, discGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const env = (dir, rough) => (room.envMap ? pmremTexture(room.envMap, dir, float(rough)).rgb : mix(vec3(0.02, 0.025, 0.05), vec3(0.5, 0.42, 0.36), smoothstep(-0.2, 0.9, dir.y)));

  // ---- the pool
  const pool = [];
  for (let i = 0; i < MAXT; i++) {
    // asm: assembled 0..1 · grow: a hand inside (eased) · charge, hold 0..1 · gold: the ring gilded (active) · burst 0..1 (done)
    // subtle: 1 for kind 'palm' (in the Pinya the figure's palm IS the target: a quieter ring, no disc) · seed
    const U = { asm: uniform(0), grow: uniform(0), charge: uniform(0), hold: uniform(0), gold: uniform(0), burst: uniform(0), subtle: uniform(0), seed: uniform(i * 0.137 + 0.05) };
    const group = new THREE.Group(); group.visible = false;
    // the dark disc behind (so the ring reads over light universes too) and the soft gold glow of a charge / a hold
    {
      const d = uv().sub(0.5).mul(HALF * 2), r = length(d);
      const vis = smoothstep(0.15, 0.9, U.asm).mul(float(1).sub(U.burst)).mul(float(1).sub(U.subtle));
      const shade = float(1).sub(smoothstep(R0 * 0.85, R0 * 1.8, r)).mul(0.4).mul(vis);
      const glow = exp(r.mul(r).negate().div(0.5 * R0 * R0)).mul(U.charge.mul(0.10).add(U.hold.mul(0.25)).add(U.grow.mul(0.04))).mul(vis);
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = GOLD.mul(glow); m.opacityNode = max(shade, 0);
      const mesh = new THREE.Mesh(discGeo, m); mesh.renderOrder = 19; mesh.frustumCulled = false; group.add(mesh);
    }
    // the ring IS a trencadís: NSEG glazed tesserae with grout between them, in the chapter's light tone. It assembles from its pieces,
    // grows with a hand, and the charge gilds the tesserae one by one clockwise from the top (each pops as it turns gold); active = all
    // gold, glowing as the hold fills; done = the tesserae fly off towards the consequence
    const ring = new THREE.Group(); group.add(ring);
    {
      const S3 = attribute('aSeg', 'vec3'), dir = vec3(S3.x, S3.y, 0), h = S3.z;
      const a = TSL.atan(S3.y, S3.x), idx = fract(float(0.25).sub(a.div(Math.PI * 2))).mul(NSEG).floor();   // 0 at the top, clockwise
      const kin = tclamp(U.asm.mul(1.7).sub(h.mul(0.7)), 0, 1), e = ease3(kin), ie = float(1).sub(e);
      const bk = tclamp(U.burst.mul(1.5).sub(h.mul(0.5)), 0, 1);
      const gild = tclamp(U.charge.mul(NSEG).sub(idx), 0, 1), since = U.charge.mul(NSEG).sub(idx).sub(1.0);
      const pop = exp(max(since, 0).mul(-8.0)).mul(step(0.999, gild));                // a tessera that has just turned gold swells a little
      const off = dir.mul(ie.mul(h.mul(0.35).add(0.18))).add(vec3(0, ie.mul(h.sub(0.5)).mul(0.3), ie.mul(h.mul(0.3).add(0.15))))
        .add(dir.mul(bk.mul(h.mul(0.7).add(0.35)))).add(vec3(0, bk.mul(bk).mul(0.5), bk.mul(0.25)))
        .add(dir.mul(pop.mul(0.012)));
      const breathe = float(1).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.015)).add(U.grow.mul(0.15));
      const m = new THREE.MeshBasicNodeMaterial({ ...OVER, side: THREE.FrontSide });
      m.positionNode = positionLocal.mul(breathe).add(off);
      // grout: dark gaps where one tessera meets the next (the angle of the fragment, not of the vertex)
      const pg = positionGeometry, fa = fract(TSL.atan(pg.y, pg.x).div(Math.PI * 2).mul(NSEG));
      const grout = smoothstep(0.03, 0.12, fa).mul(smoothstep(0.97, 0.88, fa));
      const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
      const ndv = abs(dot(N, V)), g1 = float(1).sub(ndv), F = g1.mul(g1).mul(g1).mul(g1).mul(g1).mul(0.96).add(0.04);
      const Rf = reflect(V.negate(), N), refl = env(Rf, 0.05).mul(2.6);
      const Lw = normalize(V.mul(0.6).add(vec3(0.2, 0.8, 0)));
      const hl = pow(max(dot(N, normalize(V.add(Lw))), 0), 90.0).mul(1.6);              // the glaze's highlight, one per tessera
      // each tessera its own shade of the tone (± 20 %), as broken ceramic is
      const tone = mix(REST, GOLD, max(gild, U.gold)).mul(h.mul(0.4).add(0.8));
      const lit = float(0.55).add(U.grow.mul(0.3)).add(U.hold.mul(0.7)).add(pop.mul(0.8)).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.5).add(0.5).mul(0.1));
      const col = tone.mul(lit.mul(ndv.mul(0.6).add(0.4))).add(refl.mul(F).mul(0.35)).add(vec3(hl).mul(tone.add(0.3)));
      const vis = step(0.001, kin).mul(float(1).sub(smoothstep(0.6, 1.0, bk))).mul(float(1).sub(U.subtle.mul(0.45)));
      m.colorNode = col.mul(grout.mul(0.85).add(0.15)).mul(vis).mul(e.mul(0.7).add(0.3)); m.opacityNode = grout.mul(0.3).add(0.62).mul(vis);
      const mesh = new THREE.Mesh(ringGeo, m); mesh.renderOrder = 21; mesh.frustumCulled = false; ring.add(mesh);
    }
    object.add(group);
    pool.push({ U, group, ring, id: 0, live: false, asm: 0, grow: 0, gold: 0, burst: 0, charge: 0, hold: 0, wall: 0, dx: 0, y: 1.25, r: R0, goneAt: -1 });
  }
  const byId = new Map();
  const free = () => pool.find((p) => !p.live && p.asm <= 0.002 && p.burst === 0) || pool.find((p) => !p.live);

  let shown = 0;   // the guide's switch, eased
  let warmFrames = 3;   // the first frames draw every pooled target fully transparent: its pipelines are built at load, not on the first touch
  function update(dt, { targets, block, time = 0, on = true } = {}) {
    uTime.value = time;
    const L = chapter(block).lin.light;
    for (let k = 0; k < 3; k++) restNow[k] = ease(restNow[k], L[k], dt, 1.5);
    REST.value.set(restNow[0], restNow[1], restNow[2]);
    shown = ease(shown, on ? 1 : 0, dt, 3);
    // match the score's list to the pool (by id: a target keeps its slot, so its animation carries on)
    for (const p of pool) p.seen = false;
    const list = Array.isArray(targets) ? targets : [];
    for (let i = 0; i < list.length && i < MAXT; i++) {
      const t = list[i]; if (!t || t.id == null) continue;
      let p = byId.get(t.id);
      if (!p) { p = free(); if (!p) continue; if (p.id) byId.delete(p.id); byId.set(t.id, p); Object.assign(p, { id: t.id, live: true, asm: 0, grow: 0, gold: 0, burst: 0, charge: 0, hold: 0 }); }
      p.seen = true; p.live = true;
      p.wall = Math.min(room.walls.length - 1, Math.max(0, t.wall | 0)); p.dx = +t.dx || 0; p.y = +t.y || 1.25; p.r = t.r > 0 ? t.r : R0;
      p.charge = t.state === 'idle' ? Math.max(0, +t.charge || 0) : t.state === 'charging' ? +t.charge || 0 : 1;
      p.hold = t.state === 'active' ? +t.hold || 0 : t.state === 'done' ? 1 : 0;
      p.goldTo = t.state === 'active' || t.state === 'done' ? 1 : 0;
      p.done = t.state === 'done';
      p.on = (t.on | 0) > 0;
      p.subtle = t.kind === 'palm' ? 1 : 0;
    }
    for (const p of pool) {
      if (!p.id) { p.group.visible = warmFrames > 0; continue; }
      if (!p.seen) {                                    // left the list: a done one finishes its burst, an unused one disassembles
        if (p.live) { p.live = false; p.goneAt = time; if (p.charge >= 0.999) p.done = true; }
      }
      const wantAsm = p.live ? shown : 0;
      p.asm = p.live ? ease(p.asm, wantAsm, dt, 3.2) : Math.max(0, p.asm - dt / 0.6);
      p.grow = ease(p.grow, p.on && p.live ? 1 : 0, dt, p.on ? 7 : 3);     // 300–600 ms
      p.gold = ease(p.gold, p.goldTo || 0, dt, 9);
      if (p.done) p.burst = Math.min(1, p.burst + dt / 1.1); else if (p.live) p.burst = 0;
      const gone = !p.live && (p.done ? p.burst >= 1 : p.asm <= 0.002);
      if (gone) { byId.delete(p.id); p.id = 0; p.burst = 0; p.asm = 0; p.done = false; p.group.visible = false; continue; }
      const w = room.walls[p.wall], s = p.r / R0;
      p.group.position.copy(w.centre).addScaledVector(w.right, p.dx).setY(p.y).addScaledVector(w.normal, -0.04);
      p.group.quaternion.copy(basis[p.wall]);
      p.group.scale.setScalar(s);
      const U = p.U;
      U.asm.value = p.asm; U.grow.value = p.grow; U.charge.value = p.charge; U.hold.value = p.hold; U.gold.value = p.gold; U.burst.value = p.burst; U.subtle.value = p.subtle || 0;
      p.group.visible = p.asm > 0.002 || p.burst > 0;
    }
    if (warmFrames > 0) warmFrames--;
  }
  function dispose() {
    ringGeo.dispose(); discGeo.dispose();
    object.traverse((o) => { if (o.material) o.material.dispose(); });
  }
  return { object, update, dispose, get count() { let n = 0; for (const p of pool) if (p.id) n++; return n; } };
}
