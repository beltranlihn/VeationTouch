// Ressonància — the hold-targets, drawn (plan 05 §2.6, D3b). Owner: Tech/QA. The RULES live in ../targets.js (Interacción): this
// module only draws what the score publishes in S.targets (shape / w / h / y = centre), so the picture and the sound see the same.
//
//   const T3 = createTargets3D({ THREE, TSL, room });   room.scene.add(T3.object);
//   T3.update(dt, { targets: S.targets, block: S.block, time, on, events });   // every frame; on = the "guide" parameter
//
// v4 (art direction 25-11: «no rings, no UI — objects of the world, in its light»). Every target is a THING of the square, standing in
// the scene (depth, the scene's lamps and key light, cast shadow, a contact shadow on the ground), just behind the wall plane:
//   rect  (rung, foot, down, …)  an ASHLAR of the square's stone (`pedra-llum`, bevelled) on its own plinth from the ground; charging
//                                lights its JOINTS in gold and a gold glow rises up its face; active: all joints gold; rung lifts with the
//                                hold, down steps down
//   fire                         a BRAZIER: a dark ceramic bowl on a slender stand, embers inside, a flame that grows as it charges
//   pillar (call, echo, crown)   a COLUMN of glazed lime that fills with gold / light from the bottom up; all flare on 'wave'
//   disc  (print, palm, …)       a stone PLAQUE on the wall; the gold print glows into it with the charge (palm: small and quiet)
// Rest = the stone / the chapter's light tone, no gold; `or` only while charging / active. Done: the object flies to its consequence
// (DONE by kind) and goes; removed unused: it sinks back. One draw per skin (instanced, 20 slots), nothing allocated per frame.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ACH, lin, chapter } from './palette.js';

const MAXT = 20;
// done → the consequence (m, in the target's frame: x along the wall, y up, z into the room) and seconds
const DONE = {
  fire: { to: [0, 1.2, 0], secs: 1.0 }, call: { to: [0, 0.6, 0], secs: 1.0 }, palm: { to: [0, 0, -0.1], secs: 0.8 },
  rung: { to: [0, 1.6, 0], secs: 1.2 }, foot: { to: [0, -0.3, 0], secs: 1.2 }, down: { to: [0, -0.9, 0], secs: 1.2 },
  echo: { to: [1.2, 0, 0], secs: 1.2 }, crown: { to: [0, 1.6, 0], secs: 1.4 }, print: { to: [0, 0, -0.02], secs: 2.8 },
  other: { to: [0, 0.5, 0], secs: 1.0 },
};
const SKIN_OF = (t, block) => (t.shape === 'pillar' || ['call', 'echo', 'crown'].includes(t.kind) ? 'column' : t.kind === 'fire' || t.kind === 'relay' || block === 'brasa' ? 'brazier'
  : t.kind === 'print' ? 'plaque' : t.shape === 'rect' || ['rung', 'foot', 'down'].includes(t.kind) ? 'ashlar' : 'plaque');   // print: the hand (plaque path)

export function createTargets3D({ THREE, TSL, room }) {
  const { uniform, vec3, float, smoothstep, abs, max, mix, step, attribute, positionGeometry, normalGeometry, uv, length, mx_noise_float } = TSL;   // geometry, not local: an instanced mesh's local position is already moved
  const object = new THREE.Group(); object.name = 'targets3d';
  const uTime = uniform(0), FLARE = uniform(0), GOLD = vec3(...ACH.lin);
  const LIGHT = uniform(new THREE.Vector3(...chapter('wait').lin.light)), lightNow = chapter('wait').lin.light.slice();   // the chapter's light tone, eased
  const LIGHTK = uniform(0), FIREK = uniform(0);   // a light chapter (bronze edge on the columns) · the Brasa (the columns are fire)
  const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const ceramic = (o) => (room.matter?.ceramic ? room.matter.ceramic(o) : new THREE.MeshStandardNodeMaterial({ color: 0xd8c6a6, roughness: 0.6 }));
  const cs = room.contactShadows ? room.contactShadows(MAXT) : null;
  if (cs) object.add(cs.mesh);

  // ---- per-instance state (one attribute set per skin): aS charge, hold, gold, burst · aG grow, asm, rise (m), -
  function skin(geo, mat, name) {
    const g = geo.clone(), aS = new THREE.InstancedBufferAttribute(new Float32Array(MAXT * 4), 4), aG = new THREE.InstancedBufferAttribute(new Float32Array(MAXT * 4), 4);
    aS.setUsage(THREE.DynamicDrawUsage); aG.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aS', aS); g.setAttribute('aG', aG);
    const mesh = new THREE.InstancedMesh(g, mat, MAXT); mesh.name = 'targets3d:' + name; mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXT; i++) mesh.setMatrixAt(i, zero);
    object.add(mesh);
    return { mesh, aS, aG, used: 0 };
  }
  const S_ = () => attribute('aS', 'vec4');
  const yUnit = () => positionGeometry.y.add(0.5);   // 0 (bottom) … 1 (top) of the unit geometry (positionGeometry: before the instance matrix)
  const addEmissive = (m, node) => { m.emissiveNode = m.emissiveNode ? m.emissiveNode.add(node) : node; };

  // ashlar: a bevelled block; the joints (the bevels) light in gold, a gold glow rises up the face
  // masonry: two courses with a joint between them and a staggered vertical joint in each — the JOINTS are what light in gold
  const ashlarMat = ceramic({ color: 'pedra-llum', glaze: 0.2, wear: 0.9, rim: 0.2, hands: 0.3 });
  {
    const S = S_(), y = yUnit(), x = positionGeometry.x;
    const course = abs(y.sub(0.5)), vjoint = abs(x.sub(mix(float(-0.18), float(0.22), step(0.5, y))));
    const joint = max(smoothstep(0.022, 0.008, course), smoothstep(0.018, 0.006, vjoint)).mul(smoothstep(0.3, 0.6, abs(normalGeometry.z)));
    const bevel = smoothstep(0.08, 0.35, float(1).sub(max(max(abs(normalGeometry.x), abs(normalGeometry.y)), abs(normalGeometry.z))));
    // the stone: bedding streaks, pitting and a weathered tone that varies over the block — never a clean painted box
    const grain = mx_noise_float(positionGeometry.mul(vec3(9.0, 23.0, 9.0))).mul(0.12).add(mx_noise_float(positionGeometry.mul(41.0)).mul(0.08)).add(mx_noise_float(positionGeometry.mul(3.1)).mul(0.1));
    ashlarMat.colorNode = ashlarMat.colorNode.mul(vec3(1.0, 0.9, 0.74)).mul(float(0.56).sub(grain)).mul(float(1).sub(joint.mul(0.55))).mul(float(1).sub(bevel.mul(0.15)));
    const front = smoothstep(0.6, 0.95, normalGeometry.z);
    const level = mix(S.x, float(1.2), step(0.5, S.z)), rise = smoothstep(level.add(0.02), level.sub(0.06), y);
    const lit = max(joint, bevel.mul(0.6)).mul(step(y, level));                         // the joints fill with gold from the bottom up
    addEmissive(ashlarMat, vec3(...lin('cal-fanal')).mul(0.07).add(GOLD.mul(lit.mul(S.x.mul(2.2).add(S.y.mul(3.0))).add(front.mul(rise).mul(S.y.mul(0.35))).mul(float(1).sub(S.w)))));   // warm: the lamps' light the stone keeps
  }
  const ashlar = skin(new RoundedBoxGeometry(1, 1, 1, 4, 0.12), ashlarMat, 'ashlar');   // a generous bevel: it catches the light
  const plinth = skin(new RoundedBoxGeometry(1, 1, 1, 2, 0.03), ceramic({ color: 'ombra', glaze: 0.12, wear: 0.9, rim: 0.02, hands: 0.1 }), 'corbel');   // warm dark stone (not blue)   // a stone shelf from the wall under the block (no bollards)

  // brazier: a dark ceramic bowl, embers inside (with the charge), on a slender stand; the flame is a separate light skin
  const bowlGeo = (() => {
    const prof = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 0.5; prof.push(new THREE.Vector2(0.12 + 0.38 * Math.sin(a), (1 - Math.cos(a)) - 0.5)); }
    prof.push(new THREE.Vector2(0.5, 0.5)); prof.push(new THREE.Vector2(0.44, 0.46)); prof.push(new THREE.Vector2(0.3, 0.2));
    const g = new THREE.LatheGeometry(prof, 32); g.computeVertexNormals(); return g;
  })();
  const bowlMat = ceramic({ color: 'carbó', glaze: 0.7, wear: 0.4, rim: 0.08, hands: 0.15, side: THREE.DoubleSide });
  bowlMat.metalness = 0.65;   // dark iron, not clay: the ember is the only warm thing on it
  {
    const S = S_(), inner = smoothstep(0.36, 0.46, positionGeometry.y).mul(step(length(positionGeometry.xz), 0.44));   // the coals: only the inner lip / the top of the bowl
    const flick = mx_noise_float(positionGeometry.mul(14.0).add(vec3(0, uTime.mul(1.3), 0))).mul(0.35).add(0.75);
    const rim = smoothstep(0.42, 0.5, positionGeometry.y);                                  // the bowl's lip: metal catching its own ember
    addEmissive(bowlMat, mix(vec3(...lin('brasa')), GOLD, S.z).mul(inner.mul(flick).mul(S.x.mul(1.4).add(S.y.mul(2.2)).add(0.8)))
      .add(vec3(...lin('flama')).mul(rim.mul(float(0.14).add(S.x.mul(0.35)).add(S.y.mul(0.5))))));   // a thin warm lip at rest; it brightens as it charges
  }
  const bowl = skin(bowlGeo, bowlMat, 'brazier');
  const standMat = ceramic({ color: 'carbó', glaze: 0.6, wear: 0.5, rim: 0.06, hands: 0.05 }); standMat.metalness = 0.6;
  { const S = S_(); addEmissive(standMat, vec3(...lin('flama')).mul(smoothstep(0.38, 0.5, positionGeometry.y).mul(float(0.01).add(S.x.mul(0.12)).add(S.y.mul(0.2))))); }   // the ember lights the top of its post
  const stand = skin(new THREE.CylinderGeometry(0.5, 0.7, 1, 10), standMat, 'stand');
  // the flame: a light shape (additive) over the bowl; its height grows with the charge (set per instance)
  const flameMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  {
    const S = S_(), q = uv(), x = q.x.sub(0.5).mul(2), y = q.y;
    const n = mx_noise_float(vec3(x.mul(3.0), y.mul(4.0).sub(uTime.mul(2.2)), uTime.mul(0.5))).mul(0.3);
    const width = float(1).sub(y).mul(0.9).add(0.1).add(n.mul(0.4));
    const body = smoothstep(width, width.mul(0.4), abs(x)).mul(smoothstep(1.0, 0.55, y.add(n.mul(0.3)))).mul(smoothstep(0, 0.08, y));
    const col = mix(vec3(...lin('brasa')), mix(vec3(...lin('flama')), GOLD, S.z), float(1).sub(y).mul(0.8));
    flameMat.colorNode = TSL.min(col.mul(body).mul(S.x.mul(0.8).add(S.y.mul(0.7)).add(0.2)), vec3(0.75, 0.55, 0.35)).mul(float(1).sub(S.w));   // capped: fire, never a white cone
    flameMat.opacityNode = float(1);
  }
  const flame = skin(new THREE.PlaneGeometry(1, 1), flameMat, 'flame'); flame.mesh.castShadow = false; flame.mesh.receiveShadow = false;
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  { const S = S_(), q = uv().sub(0.5).mul(2), r2 = q.x.mul(q.x).add(q.y.mul(q.y)); poolMat.colorNode = vec3(...lin('flama')).mul(TSL.exp(r2.mul(-3.5))).mul(float(0.05).add(S.x.mul(0.2)).add(S.y.mul(0.3))).mul(float(1).sub(S.w)); poolMat.opacityNode = float(1); }
  const glowPool = skin(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, 'ember-pool'); glowPool.mesh.castShadow = false; glowPool.mesh.receiveShadow = false;
  // palm (Pinya): nothing at rest (the figure's palm IS the target); charging: a faint warm ring that fills with gold
  const palmMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  { const S = S_(), q = uv().sub(0.5).mul(2), r = TSL.length(q), soft = smoothstep(1.0, 0.35, r), core = smoothstep(0.6, 0.0, r);
    // AD #4: no disc — a faint warm ring (r ≤ 0.25 m) at the palm, its arc filling with `or` from the top, clockwise, as it charges
    const ang = TSL.fract(TSL.atan(q.x, q.y).div(Math.PI * 2).add(1)), arc = step(ang, S.x.max(S.z)), band = smoothstep(0.1, 0.0, abs(r.sub(0.82)));
    palmMat.colorNode = mix(vec3(...lin('cal-fanal')).mul(0.18), GOLD.mul(float(0.5).add(S.y.mul(0.8))), arc).mul(band).mul(float(1).sub(S.w)); palmMat.opacityNode = float(1); }
  const palmGlow = skin(new THREE.PlaneGeometry(1, 1), palmMat, 'palm'); palmGlow.mesh.castShadow = false; palmGlow.mesh.receiveShadow = false;

  // column (call, echo, crown): a COLUMN OF LIGHT, not a solid — additive, soft at its edges (it fades where the surface turns away) and
  // at both ends, in the chapter's light tone and faint at rest; the gold rises inside it from the bottom as it charges; it flares when
  // active and on 'wave'. Capped: never white, never a hard silhouette over the scene
  const columnMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, fog: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });   // premultiplied «over»: rgb adds light, alpha darkens
  {
    const S = S_(), y = yUnit(), V = TSL.normalize(TSL.cameraPosition.sub(TSL.positionWorld)), ndv = abs(TSL.dot(TSL.normalize(TSL.normalWorld), V));
    const lick = mx_noise_float(vec3(positionGeometry.x.mul(4.0), y.mul(3.0).sub(uTime.mul(1.8)), positionGeometry.z.mul(4.0))).mul(0.3);
    const ends = smoothstep(0.0, 0.04, y).mul(smoothstep(float(0.95).add(lick.mul(0.3)), float(0.35).add(lick), y));   // the top licks and fades out
    const body = TSL.pow(ndv, 1.4).mul(ends);                                            // soft: bright on its axis, gone at the edges and ends
    const rim = smoothstep(0.45, 0.12, ndv).mul(ends);                                   // its silhouette band (only drawn dark on light chapters)
    const level = mix(S.x, float(1.2), step(0.5, S.z)), fill = smoothstep(level.add(0.03), level.sub(0.05), y);
    const shimmer = mx_noise_float(vec3(positionGeometry.x.mul(6.0), y.mul(5.0).sub(uTime.mul(0.6)), positionGeometry.z.mul(6.0))).mul(0.25).add(0.85);
    const flick = mx_noise_float(vec3(positionGeometry.x.mul(3.0), y.mul(7.0).sub(uTime.mul(2.6)), uTime.mul(0.7))).mul(0.5).add(0.75);   // fire: it licks upward
    const fireK = FIREK, wobble = mix(shimmer, flick, fireK);
    // fire (Brasa): flama licking up from the brazier, brighter; light (crown / echo): the chapter's tone, soft. Gold rises inside both
    // fire: brightest where it is born in the bowl (a hot core), thinning upward
    const base = mix(LIGHT.mul(0.05), vec3(...lin('flama')).mul(float(0.55).mul(TSL.pow(float(1).sub(y), 0.5))).add(vec3(...lin('brasa')).mul(smoothstep(0.3, 0.0, y).mul(0.5))), FIREK);
    const glow = base.add(GOLD.mul(fill.mul(float(0.3).add(S.y.mul(0.4))))).add(GOLD.mul(FLARE.mul(0.3).add(S.y.mul(step(0.5, S.z)).mul(0.15))));
    const bronzeA = rim.mul(0.4).mul(LIGHTK);
    columnMat.colorNode = TSL.min(glow.mul(body).mul(wobble), vec3(0.6)).add(vec3(...lin('bronze')).mul(bronzeA).mul(0.5)).mul(float(1).sub(S.w));
    columnMat.opacityNode = bronzeA.add(body.mul(0.05)).mul(float(1).sub(S.w));
  }
  const beam = skin(new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 10, true), columnMat, 'beam'); beam.mesh.castShadow = false; beam.mesh.receiveShadow = false;   // light columns (crown, echo): straight, soft
  const column = skin(new THREE.CylinderGeometry(0.16, 0.5, 1, 24, 10, true), columnMat, 'column');   // the fire column (Brasa): tapering   // tapering: wide at the base, narrow at the top column.mesh.castShadow = false; column.mesh.receiveShadow = false;

  // plaque: a stone slab on the wall; the print glows into it in gold (an oval at its heart) with the charge, and stays when done
  const plaqueMat = ceramic({ color: 'pedra-llum', glaze: 0.3, wear: 0.7, rim: 0.2, hands: 0.3 });   // warm stone (the fallback too: never a grey square)
  {
    const S = S_(), front = smoothstep(0.6, 0.95, normalGeometry.z), d = length(positionGeometry.xy.mul(TSL.vec2(1.0, 0.8))), heart = smoothstep(0.42, 0.18, d);
    addEmissive(plaqueMat, vec3(...lin('cal-fanal')).mul(0.06).add(GOLD.mul(front.mul(heart).mul(S.x.mul(0.9).add(S.y.mul(1.4)).add(S.z.mul(0.3))))));
  }
  const plaque = skin(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), plaqueMat, 'plaque');

  // the acta's PRINT: a HAND at real size on the lime wall (procedural: a palm and five rounded fingers). At rest a faint warm outline that
  // invites the hand; charging, gold fills it from the wrist up; done, it glows and hands over to actatext's print (which stays)
  const handMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  {
    const S = S_(), q = uv().sub(TSL.vec2(0.5, 0.5)).mul(TSL.vec2(1.0, 1.2));        // hand space: x ±0.5, y ±0.6 (wrist at the bottom)
    const cap = (ax, ay, bx, by, r) => { const pa = q.sub(TSL.vec2(ax, ay)), ba = TSL.vec2(bx - ax, by - ay); const h = TSL.clamp(TSL.dot(pa, ba).div(TSL.dot(ba, ba)), 0, 1); return length(pa.sub(ba.mul(h))).sub(r); };
    const palm = length(q.sub(TSL.vec2(0.0, -0.17)).mul(TSL.vec2(1.0, 1.15))).sub(0.27);
    let d = TSL.min(palm, cap(-0.02, -0.45, 0.0, -0.3, 0.17));                          // palm + wrist
    d = TSL.min(d, cap(-0.25, -0.12, -0.42, 0.08, 0.07));                              // thumb
    d = TSL.min(d, cap(-0.15, 0.05, -0.2, 0.42, 0.065));                               // index
    d = TSL.min(d, cap(-0.02, 0.07, -0.03, 0.5, 0.068));                               // middle
    d = TSL.min(d, cap(0.11, 0.05, 0.14, 0.44, 0.064));                                // ring
    d = TSL.min(d, cap(0.22, 0.0, 0.3, 0.3, 0.056));                                   // little
    const inside = smoothstep(0.012, -0.012, d), edge = smoothstep(0.025, 0.0, abs(d));
    const yH = q.y.div(1.2).add(0.5), level = mix(S.x, float(1.2), step(0.5, S.z)), fill = smoothstep(level.add(0.02), level.sub(0.04), yH).mul(inside);
    const rest = vec3(...lin('cal-fanal')).mul(edge.mul(0.16));
    const gold = GOLD.mul(fill.mul(float(0.45).add(S.y.mul(0.5)))).add(GOLD.mul(edge.mul(S.x.mul(0.3))));
    handMat.colorNode = rest.add(gold).mul(float(1).sub(S.w));
    // on a light (lime) wall the outline is an ENGRAVING (it darkens the lime a little), on a dark one a faint warm line
    handMat.opacityNode = fill.mul(0.25).add(edge.mul(0.32).mul(LIGHTK)).mul(float(1).sub(S.w));
  }
  const hand = skin(new THREE.PlaneGeometry(1, 1), handMat, 'hand'); hand.mesh.castShadow = false; hand.mesh.receiveShadow = false;

  const SKINS = [ashlar, plinth, bowl, stand, flame, glowPool, palmGlow, column, beam, plaque, hand];

  // ---- the slots
  const pool = Array.from({ length: MAXT }, (_, i) => ({ i, id: 0, live: false, asm: 0, grow: 0, gold: 0, burst: 0, charge: 0, hold: 0, done: false, on: false, to: [0, 0, 0], rise: 0 }));
  const byId = new Map();
  const free = () => pool.find((p) => !p.live && p.asm <= 0.002 && p.burst === 0) || pool.find((p) => !p.live);
  const M4 = new THREE.Matrix4(), P3 = new THREE.Vector3(), SC = new THREE.Vector3();
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  // one instance of a skin for this slot, in the target's wall frame (x, y, z = into the room). A composite object (brazier + its
  // fire column, block + corbel) grows / shrinks about ONE anchor height, so its pieces never come apart while it assembles or goes
  function put(sk, p, cx, cy, cz, sx, sy, sz, anchor = cy) {
    const i = sk.used++; if (i >= MAXT) return;
    const w = room.walls[p.wall];
    const k = Math.max(0.001, sm(p.asm) * (1 - 0.85 * sm(p.burst)) * (1 + 0.05 * p.grow));
    const b = sm(p.burst), rise = p.rise * p.hold;
    P3.copy(w.centre).addScaledVector(w.right, p.dx + cx * k + p.to[0] * b).setY(anchor + (cy - anchor) * k + rise + p.to[1] * b - (1 - sm(p.asm)) * 0.25).addScaledVector(w.normal, cz + p.to[2] * b);
    M4.compose(P3, basis[p.wall], SC.set(sx * k, sy * k, sz * k)); sk.mesh.setMatrixAt(i, M4);
    sk.aS.setXYZW(i, p.charge, p.hold, p.gold, p.burst); sk.aG.setXYZW(i, p.grow, p.asm, rise, 0);
  }
  let shown = 0, csN = 0, warm = 3;   // warm: the first frames draw every skin (empty) — their pipelines are built at load, not on the first touch
  let blockNow = '';
  function update(dt, { targets, block = '', time = 0, on = true, events } = {}) {
    uTime.value = time; blockNow = block;
    { const L2 = chapter(block).lin.light; for (let k = 0; k < 3; k++) lightNow[k] = ease(lightNow[k], L2[k], dt, 1.5); LIGHT.value.set(lightNow[0], lightNow[1], lightNow[2]);
      LIGHTK.value = ease(LIGHTK.value, chapter(block).dark ? 0 : 1, dt, 1.5); FIREK.value = ease(FIREK.value, block === 'brasa' ? 1 : 0, dt, 1.5); }
    shown = ease(shown, on ? 1 : 0, dt, 3);
    if (events) for (const e of events) if (typeof e === 'string' && (e === 'wave' || e.startsWith('wave'))) FLARE.value = 1;
    FLARE.value = Math.max(0, FLARE.value - dt / 1.2);
    for (const p of pool) p.seen = false;
    const list = Array.isArray(targets) ? targets : [];
    for (let i = 0; i < list.length && i < MAXT; i++) {
      const t = list[i]; if (!t || t.id == null) continue;
      let p = byId.get(t.id);
      if (!p) { p = free(); if (!p) continue; if (p.id) byId.delete(p.id); byId.set(t.id, p); Object.assign(p, { id: t.id, live: true, asm: 0, grow: 0, gold: 0, burst: 0, charge: 0, hold: 0 }); }
      p.seen = true; p.live = true;
      p.wall = Math.min(room.walls.length - 1, Math.max(0, t.wall | 0)); p.dx = +t.dx || 0;
      p.skin = SKIN_OF(t, blockNow); p.kind = t.kind || 'other';
      p.w = +t.w || (t.r > 0 ? 2 * t.r : 0.44); p.h = +t.h || (t.r > 0 ? 2 * t.r : 0.44); p.y = +t.y || 1.25;
      p.charge = t.state === 'idle' ? Math.max(0, +t.charge || 0) : t.state === 'charging' ? +t.charge || 0 : 1;
      p.hold = t.state === 'active' ? +t.hold || 0 : t.state === 'done' ? 1 : 0;
      p.goldTo = t.state === 'active' || t.state === 'done' ? 1 : 0;
      p.done = t.state === 'done'; p.on = (t.on | 0) > 0;
      const D = DONE[p.kind] || DONE.other, sx = p.kind === 'echo' ? (Math.sign(+t.dir || +t.side || 1) || 1) : 1;
      p.to = [D.to[0] * sx, D.to[1], D.to[2]]; p.secs = D.secs;
      p.rise = p.kind === 'rung' ? 0.3 : p.kind === 'down' ? -0.3 : 0;
    }
    for (const sk of SKINS) sk.used = 0;
    csN = 0;
    for (const p of pool) {
      if (!p.id) continue;
      if (!p.seen && p.live) { p.live = false; if (p.charge >= 0.999) p.done = true; }
      p.asm = p.live ? ease(p.asm, shown, dt, 3.2) : Math.max(0, p.asm - dt / 0.6);
      p.grow = ease(p.grow, p.on && p.live ? 1 : 0, dt, p.on ? 7 : 3);
      p.gold = ease(p.gold, p.goldTo || 0, dt, 9);
      if (p.done) p.burst = Math.min(1, p.burst + dt / (p.secs || 1)); else if (p.live) p.burst = 0;
      if (!p.live && (p.done ? p.burst >= 1 : p.asm <= 0.002)) { byId.delete(p.id); p.id = 0; p.burst = 0; p.asm = 0; p.done = false; continue; }
      const W = p.w, H = p.h, bottom = p.y - H / 2, w = room.walls[p.wall];
      if (p.skin === 'ashlar') {                       // the block just behind the wall plane, on its plinth from the ground
        const bw = Math.min(0.45, W * 0.8), bh = Math.min(0.32, H * 0.8), D = 0.26;   // ~45 cm: the block, not the hit area (that stays the score's w × h)
        put(ashlar, p, 0, p.y, -D / 2 - 0.01, bw, bh, D);
        put(plinth, p, 0, p.y - bh / 2 - 0.03, -D / 2 - 0.01, bw * 1.15, 0.06, D * 1.1, p.y);   // its corbel
      } else if (p.skin === 'brazier') {               // a bowl of w, on a stand from the ground; the flame above it
        const bw = Math.min(0.5, Math.max(0.36, W)), bh = bw * 0.42, bowlY = p.y;
        put(bowl, p, 0, bowlY, -bw / 2 - 0.02, bw, bh, bw);
        const sb = bowlY - bh / 2; if (sb > 0.05) put(stand, p, 0, sb / 2, -bw / 2 - 0.02, 0.08, sb, 0.08, 0);
        const fh = 0.18 + 0.55 * p.charge + 0.35 * p.hold;
        put(flame, p, 0, bowlY + bh / 2 + fh / 2 - 0.04, -bw / 2 - 0.02, bw * 0.7, fh, 1, bowlY);
        if (cs && csN < cs.count) { P3.copy(w.centre).addScaledVector(w.right, p.dx).addScaledVector(w.normal, -bw / 2); cs.set(csN++, P3.x, P3.z, 0.2, 0.5 * sm(p.asm)); }
        put(glowPool, p, 0, 0.01, -bw / 2 - 0.02, 1.4, 1, 1.4, 0);           // the ember's warmth on the ground
      } else if (p.skin === 'column') {                // a column of w × h (its own extent), half sunk in the wall
        // it RISES FROM THE FLOOR (never floating) to the top of the score's extent; in Brasa a brazier at its foot feeds the fire
        const top = p.y + H / 2, cw = Math.min(0.5, W) * 0.75;
        if (blockNow === 'brasa') {
          const bw = 0.56, bh = bw * 0.42, bowlY = 1.0;   // a wide bowl at hand height; the fire is born in it
          put(bowl, p, 0, bowlY, -bw / 2 - 0.02, bw, bh, bw, bowlY);
          put(stand, p, 0, (bowlY - bh / 2) / 2, -bw / 2 - 0.02, 0.08, bowlY - bh / 2, 0.08, 0);
          put(glowPool, p, 0, 0.01, -bw / 2 - 0.02, 1.4, 1, 1.4, 0);
          const fb = bowlY - bh * 0.35, ft = Math.max(top, 2.2); put(column, p, 0, (fb + ft) / 2, -bw / 2 - 0.02, bw * 0.75, ft - fb, bw * 0.75, bowlY);   // from inside the bowl
        } else put(beam, p, 0, top / 2, -0.04, cw, top, cw, 0);
      } else if (p.kind === 'palm') {                  // the Pinya: warm light on the wall where the palm will meet the hand
        // AD #8: nothing here — the figure's own palm (pinya3d) is the target and glows itself; no ring over the wall
      } else if (p.kind === 'print') {                 // the acta: a hand at real size (≥ 20 cm tall), gold when held
        const hh = 0.3; put(hand, p, 0, p.y, 0.004, hh * 0.83, hh, 1);   // a real hand, ~30 cm with the wrist
      } else {                                          // the generic fallback: a warm stone plaque
        put(plaque, p, 0, p.y, -0.01, W, H, 0.05);
      }
    }
    for (const sk of SKINS) {
      for (let i = sk.used; i < MAXT; i++) sk.mesh.setMatrixAt(i, ZERO);
      sk.mesh.instanceMatrix.needsUpdate = true; sk.aS.needsUpdate = true; sk.aG.needsUpdate = true;
      sk.mesh.visible = sk.used > 0 || warm > 0;
    }
    if (cs) for (let i = csN; i < cs.count; i++) cs.clear(i);
    if (warm > 0) warm--;
  }
  function dispose() { object.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); }); }
  // prime(true): every skin drawn (its unused slots are zero-scale) until prime(false) — the host's in-wait renders of the next sets, so
  // the skins' pipelines exist for THOSE light sets (QA 25-11: the first brazier at intro → Brasa cost a 0.7 s frame)
  function prime(v) { for (const sk of SKINS) sk.mesh.visible = !!v || sk.used > 0; }
  return { object, update, dispose, prime, get count() { let n = 0; for (const p of pool) if (p.id) n++; return n; } };
}
