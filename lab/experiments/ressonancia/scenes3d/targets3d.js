// Ressonància — the hold-targets, drawn (plan 05 §2.6, D3b). Owner: Tech/QA. The RULES live in ../targets.js (Interacción): this
// module only draws what the score publishes in S.targets, so the picture and the sound see the same targets.
//
//   const T3 = createTargets3D({ THREE, TSL, room });   room.overlay.add(T3.object);
//   T3.update(dt, { targets: S.targets, block: S.block, time, on });   // every frame; on = the "guide" parameter
//
// One target = a band of trencadís on the wall plane (Ø 2·r, r = 0.22 m by default; the band ~6.5 cm wide), centred at (wall, dx, y):
// 18 glazed tesserae of uneven thickness and tilt (each catches the light on its own), grout between them, a soft dark disc behind so
// it reads over light universes too. Its states:
//   idle      the band in the chapter's LIGHT tone (palette.js › PAL[block].light; on light chapters half-way to its shadow), low contrast and breathing slowly (16 of them must
//             not clutter the room); it assembles from its pieces when it is born
//   (hands)   a hand inside (t.on > 0): it grows ~15 % in 300–600 ms and its glaze lights up (the sound answers at once)
//   charging  the tesserae turn ACHIEVEMENT GOLD (palette.js › ACH, `or`) one by one, clockwise from the top, and a faint gold fill
//             RISES inside the ring with `charge` (read from 3 m: «it is filling»)
//   active    the whole band is gold and glows as `hold` goes 0 → 1
//   done      the tesserae fly to the CONSEQUENCE, by kind: fire → up into the flame at the hand · palm → into the figure's palm (they
//             close on the centre) · rung → up to the next floor · echo → along the wall (t.dir, else t.side) · crown → up · print →
//             down onto the wall, where they settle and stay a while as the print · anything else → outwards and up
//   gone      a target that leaves the list unused disassembles in 0.6 s
// kind 'palm' (Pinya: the figure's palm IS the target): a quieter band, no disc. ≤ 16 live targets + 'done' ones (pool of 20).
// Nothing is allocated per frame: the pool is built once, each target with its own uniforms.
import { OVER } from './typo3d.js';
import { PAL, ACH, chapter } from './palette.js';

const MAXT = 20, NSEG = 18, R0 = 0.22, TUBE = 0.033, FLAT = 0.45;   // 20: ≤ 16 live + the 'done' ones kept 0.8 s for their break
// done → the consequence, per kind: where the tesserae go (m, in the target's frame: x along the wall, y up, z into the room),
// focus (0 = a radial burst, 1 = all to that point), contract (close on the centre), keep (stay at the end, 0..1), seconds
const DONE = {
  fire:  { to: [0, 0.9, 0.12], focus: 0.85, contract: 0.35, keep: 0, secs: 1.1 },
  palm:  { to: [0, 0, -0.03], focus: 1, contract: 1, keep: 0, secs: 0.9 },
  rung:  { to: [0, 0.45, 0], focus: 0.9, contract: 0.25, keep: 0, secs: 1.0 },
  echo:  { to: [1.1, 0, 0], focus: 0.9, contract: 0.3, keep: 0, secs: 1.2 },
  crown: { to: [0, 1.4, 0.1], focus: 0.9, contract: 0.15, keep: 0, secs: 1.4 },
  print: { to: [0, -0.04, -0.035], focus: 1, contract: 0.55, keep: 1, secs: 2.8 },
  other: { to: [0, 0, 0], focus: 0, contract: 0, keep: 0, secs: 1.1 },
};

export function createTargets3D({ THREE, TSL, room }) {
  const { uniform, uv, vec3, vec4, float, smoothstep, exp, length, step, clamp: tclamp, max, sin, abs, pow, dot, normalize, reflect, attribute, positionGeometry, normalWorld, positionWorld, cameraPosition, modelWorldMatrix, mix, fract, pmremTexture } = TSL;
  const object = new THREE.Group(); object.name = 'targets3d';
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const uTime = uniform(0);
  // the chapter's light tone and the gold, eased between chapters (linear RGB)
  const REST = uniform(new THREE.Vector3(...PAL.wait.lin.light)), GOLD = vec3(...ACH.lin);
  const restNow = PAL.wait.lin.light.slice();
  // the rest tone: the chapter's light tone on dark chapters; on light ones (Pinya, Tronc, crown, festa, bajada, acta) a light tone would
  // vanish into the wall, so the band is the light tone half-way to the chapter's shadow, and the disc behind darkens a little more
  const restOf = (b) => { const c = chapter(b); return c.dark ? c.lin.light : c.lin.light.map((v, k) => v + (c.lin.shadow[k] - v) * 0.55); };
  const LIGHTK = uniform(0); let lightNow = 0;
  const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
  const ease3 = (k) => float(1).sub(float(1).sub(k).mul(float(1).sub(k)).mul(float(1).sub(k)));

  // ---- shared geometry: the band = a torus flattened against the wall, cut in NSEG tesserae (each vertex knows its tessera's
  // direction and a hash), and the disc behind
  const ringGeo = (() => {
    const g = new THREE.TorusGeometry(R0, TUBE, 12, NSEG * 6).toNonIndexed();
    const p = g.getAttribute('position'), n = p.count, seg = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.setZ(i, p.getZ(i) * FLAT);
    for (let i = 0; i < n; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const k = Math.floor(((Math.atan2(cy, cx) / (Math.PI * 2) + 1) % 1) * NSEG), a = ((k + 0.5) / NSEG) * Math.PI * 2;
      const h = ((Math.sin(k * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
      for (let j = 0; j < 3; j++) { seg[(i + j) * 3] = Math.cos(a); seg[(i + j) * 3 + 1] = Math.sin(a); seg[(i + j) * 3 + 2] = h; }
    }
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 3));
    g.computeVertexNormals();
    return g;
  })();
  const HALF = R0 * 2.2, discGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const env = (dir, rough) => (room.envMap ? pmremTexture(room.envMap, dir, float(rough)).rgb : mix(vec3(0.02, 0.025, 0.05), vec3(0.5, 0.42, 0.36), smoothstep(-0.2, 0.9, dir.y)));

  // ---- the pool
  const pool = [];
  for (let i = 0; i < MAXT; i++) {
    // asm: assembled 0..1 · grow: a hand inside (eased) · charge, hold 0..1 · gold: the band gilded (active) · burst 0..1 (done)
    // subtle: 1 for kind 'palm' · to / focus / contract / keep: where 'done' sends the tesserae (DONE) · seed
    const U = { asm: uniform(0), grow: uniform(0), charge: uniform(0), hold: uniform(0), gold: uniform(0), burst: uniform(0), subtle: uniform(0),
      to: uniform(new THREE.Vector3()), focus: uniform(0), contract: uniform(0), keep: uniform(0), seed: uniform(i * 0.137 + 0.05) };
    const group = new THREE.Group(); group.visible = false;
    // the dark disc behind, and inside the ring the gold fill that rises with the charge (a level with a bright meniscus)
    {
      const d = uv().sub(0.5).mul(HALF * 2), r = length(d);
      const vis = smoothstep(0.15, 0.9, U.asm).mul(float(1).sub(U.burst)).mul(float(1).sub(U.subtle));
      const shade = float(1).sub(smoothstep(R0 * 0.85, R0 * 1.8, r)).mul(LIGHTK.mul(0.16).add(0.36)).mul(vis);
      const inside = float(1).sub(smoothstep(R0 - TUBE * 0.9, R0 - TUBE * 0.5, r));
      const level = float(-(R0 - TUBE)).add(U.charge.mul(2 * (R0 - TUBE)));
      const below = smoothstep(level.add(0.005), level.sub(0.005), d.y).mul(step(0.002, U.charge));
      const meniscus = exp(abs(d.y.sub(level)).mul(-160.0)).mul(step(0.002, U.charge)).mul(float(1).sub(step(0.999, U.charge)));
      const fill = inside.mul(below.mul(float(0.16).add(U.hold.mul(0.22))).add(meniscus.mul(0.35))).mul(vis);
      const glow = exp(r.mul(r).negate().div(0.5 * R0 * R0)).mul(U.hold.mul(0.18).add(U.grow.mul(0.03))).mul(vis);
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = GOLD.mul(fill.add(glow)); m.opacityNode = max(shade.add(fill.mul(0.3)), 0);
      const mesh = new THREE.Mesh(discGeo, m); mesh.renderOrder = 19; mesh.frustumCulled = false; group.add(mesh);
    }
    // the band of tesserae
    const ring = new THREE.Group(); group.add(ring);
    {
      const S3 = attribute('aSeg', 'vec3'), dir = vec3(S3.x, S3.y, 0), tan = vec3(S3.y.negate(), S3.x, 0), h = S3.z, h2 = fract(h.mul(7.13).add(0.31));
      const a = TSL.atan(S3.y, S3.x), idx = fract(float(0.25).sub(a.div(Math.PI * 2))).mul(NSEG).floor();   // 0 at the top, clockwise
      const pg = positionGeometry, fa = fract(TSL.atan(pg.y, pg.x).div(Math.PI * 2).mul(NSEG));             // 0..1 across a tessera
      const kin = tclamp(U.asm.mul(1.7).sub(h.mul(0.7)), 0, 1), e = ease3(kin), ie = float(1).sub(e);
      const bk = tclamp(U.burst.mul(1.4).sub(h.mul(0.4)), 0, 1), bkE = ease3(bk);
      const gild = tclamp(U.charge.mul(NSEG).sub(idx), 0, 1), since = U.charge.mul(NSEG).sub(idx).sub(1.0);
      const pop = exp(max(since, 0).mul(-8.0)).mul(step(0.999, gild));                 // a tessera that has just turned gold swells a little
      // relief: every tessera its own thickness (0.8–1.2 of the band) and a tilt along the ring (its glaze catches the light alone)
      const centre = vec3(normalize(pg.xy).mul(R0), 0), q = pg.sub(centre);
      const shaped = centre.add(q.mul(h.mul(0.4).add(0.8))).add(vec3(0, 0, fa.sub(0.5).mul(h2.sub(0.5)).mul(0.05)));
      const breathe = float(1).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.012)).add(U.grow.mul(0.15));
      // assembling: the pieces come from around; done: to the consequence (focus) or a radial burst, closing on the centre (contract)
      const asmOff = dir.mul(ie.mul(h.mul(0.35).add(0.18))).add(vec3(0, ie.mul(h.sub(0.5)).mul(0.3), ie.mul(h.mul(0.3).add(0.15))));
      const radial = dir.mul(bk.mul(h.mul(0.7).add(0.35))).add(vec3(0, bk.mul(bk).mul(0.5), bk.mul(0.25)));
      const aimed = U.to.mul(bkE.mul(h.mul(0.3).add(0.85))).add(tan.mul(bk.mul(float(1).sub(bk)).mul(h2.sub(0.5)).mul(0.12)));
      const close = centre.mul(bkE.mul(U.contract)).negate();
      const off = asmOff.add(mix(radial, aimed, U.focus)).add(close).add(dir.mul(pop.mul(0.012)));
      const m = new THREE.MeshBasicNodeMaterial({ ...OVER, side: THREE.FrontSide });
      m.positionNode = shaped.mul(breathe).mul(float(1).sub(bkE.mul(U.contract).mul(0.4))).add(off);
      const grout = smoothstep(0.03, 0.12, fa).mul(smoothstep(0.97, 0.88, fa));
      // the tilted normal of each tessera (world space)
      const tilt = tan.mul(h2.sub(0.5).mul(0.9)).add(dir.mul(h.sub(0.5).mul(0.5)));
      const N = normalize(normalWorld.add(modelWorldMatrix.mul(vec4(tilt, 0)).xyz)), V = normalize(cameraPosition.sub(positionWorld));
      const ndv = abs(dot(N, V)), g1 = float(1).sub(ndv), F = g1.mul(g1).mul(g1).mul(g1).mul(g1).mul(0.96).add(0.04);
      const refl = env(reflect(V.negate(), N), 0.05).mul(2.4);
      const Lw = normalize(V.mul(0.6).add(vec3(0.2, 0.8, 0)));
      const awake = max(max(U.grow, gild), U.gold);                                     // calm at rest; the glaze wakes with a hand / the gold
      const hl = pow(max(dot(N, normalize(V.add(Lw))), 0), 70.0).mul(awake.mul(1.3).add(0.35));
      const tone = mix(REST, GOLD, max(gild, U.gold)).mul(h.mul(0.3).add(0.85));
      const lit = float(0.42).add(U.grow.mul(0.3)).add(gild.mul(0.15)).add(U.hold.mul(0.7)).add(pop.mul(0.8)).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.5).add(0.5).mul(0.08));
      const col = tone.mul(lit.mul(ndv.mul(0.6).add(0.4))).add(refl.mul(F).mul(awake.mul(0.25).add(0.15))).add(vec3(hl).mul(tone.add(0.3)));
      const fade = float(1).sub(smoothstep(mix(float(0.6), float(0.97), U.keep), float(1), bk));
      const vis = step(0.001, kin).mul(fade).mul(float(1).sub(U.subtle.mul(0.45)));
      m.colorNode = col.mul(grout.mul(0.85).add(0.15)).mul(vis).mul(e.mul(0.7).add(0.3)); m.opacityNode = grout.mul(0.25).add(0.68).mul(vis);
      const mesh = new THREE.Mesh(ringGeo, m); mesh.renderOrder = 21; mesh.frustumCulled = false; ring.add(mesh);
    }
    object.add(group);
    pool.push({ U, group, ring, id: 0, live: false, asm: 0, grow: 0, gold: 0, burst: 0, charge: 0, hold: 0, wall: 0, dx: 0, y: 1.25, r: R0, goneAt: -1, kind: 'other', dirX: 1 });
  }
  const byId = new Map();
  const free = () => pool.find((p) => !p.live && p.asm <= 0.002 && p.burst === 0) || pool.find((p) => !p.live);

  let shown = 0;   // the guide's switch, eased
  let warmFrames = 3;   // the first frames draw every pooled target fully transparent: its pipelines are built at load, not on the first touch
  function update(dt, { targets, block, time = 0, on = true } = {}) {
    uTime.value = time;
    const L = restOf(block); lightNow = ease(lightNow, chapter(block).dark ? 0 : 1, dt, 1.5); LIGHTK.value = lightNow;
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
      p.kind = DONE[t.kind] ? t.kind : 'other';
      p.dirX = Math.sign(+t.dir || +t.side || 1) || 1;
    }
    for (const p of pool) {
      if (!p.id) { p.group.visible = warmFrames > 0; continue; }
      if (!p.seen) {                                    // left the list: a done one finishes its break, an unused one disassembles
        if (p.live) { p.live = false; p.goneAt = time; if (p.charge >= 0.999) p.done = true; }
      }
      const D = DONE[p.kind] || DONE.other;
      p.asm = p.live ? ease(p.asm, shown, dt, 3.2) : Math.max(0, p.asm - dt / 0.6);
      p.grow = ease(p.grow, p.on && p.live ? 1 : 0, dt, p.on ? 7 : 3);     // 300–600 ms
      p.gold = ease(p.gold, p.goldTo || 0, dt, 9);
      if (p.done) p.burst = Math.min(1, p.burst + dt / D.secs); else if (p.live) p.burst = 0;
      const gone = !p.live && (p.done ? p.burst >= 1 : p.asm <= 0.002);
      if (gone) { byId.delete(p.id); p.id = 0; p.burst = 0; p.asm = 0; p.done = false; p.group.visible = false; continue; }
      const w = room.walls[p.wall], s = p.r / R0;
      p.group.position.copy(w.centre).addScaledVector(w.right, p.dx).setY(p.y).addScaledVector(w.normal, -0.04);
      p.group.quaternion.copy(basis[p.wall]);
      p.group.scale.setScalar(s);
      const U = p.U;
      U.asm.value = p.asm; U.grow.value = p.grow; U.charge.value = p.charge; U.hold.value = p.hold; U.gold.value = p.gold; U.burst.value = p.burst; U.subtle.value = p.subtle || 0;
      U.to.value.set(D.to[0] * (p.kind === 'echo' ? p.dirX : 1), D.to[1], D.to[2]); U.focus.value = D.focus; U.contract.value = D.contract; U.keep.value = D.keep;
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
