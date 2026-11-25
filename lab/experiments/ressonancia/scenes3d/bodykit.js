// Ressonància — the body kit (plan 05 §2.5): ONE treatment of the human figure for the whole work. Solid, lit, ceramic bodies at
// human scale, standing on the floor with a contact shadow and a soft cast shadow away from the key light.
//
//   const kit = createBodies({ THREE, TSL, room, max: 64 });
//   part.object.add(kit.object);
//   kit.set(i, { pos: [x, 0, z], yaw, pose: 'palm', pose2: 'stand', mix: 0.3, scale: 1, build: 0, tint: [1, 1, 1], glow: 0 });
//   kit.hide(i);
//   kit.update(dt);                       // every frame: steps the bake (until ready), packs the visible bodies, breath clock
//   kit.ready                             // Promise: the meshes are baked (≈ 1 s in the background, a few ms per slice)
//   kit.palm(pose, build) → [x, y, z]     // body-local right palm (front of the palm), for scale 1 (multiply by scale, rotate by yaw)
//   kit.yawTo(from, to)                   // the yaw that makes a body at `from` face `to` (both {x, z})
//
// Bodies come from body.js (`bakeBodyGen`: an SDF skeleton meshed with surface nets, baked once at load). Every build is baked in
// all five poses with one topology; the poses live in a half-float texture and the vertex stage blends two of them per instance
// (`pose` → `pose2` by `mix`), so a figure can move between poses without new geometry. Two levels of detail: near (1.8 cm grid,
// separate hands with fingers) for figures ≤ `nearDist` m from the eye, far (3.2 cm grid) for the crowd. A body faces local +z.
//
// The matter (D4): a glazed ceramic in four regions — skin (head and hands, warm unglazed bisque), shirt, trousers and the faixa —
// with baked AO, a clay mottle, and the fine crackle of the trencadís along the bake's shard borders. `room.matter.body` replaces
// the material when VFX delivers it (one line, `opt.material`); until then MeshStandardNodeMaterial + the room's rim and the
// hands' flash. Colours are the approved palette (05 §2.7); `opt.colors` overrides them (palette.js when it exists).
import { bakeBodyGen, pose as skeleton, V } from './parts/pinya3d/body.js';
import { lin as palLin } from './palette.js';
import { loadHumanBases, bakeHumanGen, HUMAN_POSES, HUMAN_BUILDS } from './bodykit-gltf.js';

// ---------------------------------------------------------------------------------------------------------------- palette (05 §2.7)
// palette.js tokens (or [token, k] or linear [r, g, b]); skin = 'bisque' = terracota lifted half-way to cal-foc. Pinya by default;
// a chapter calls kit.setColors({ shirt: 'porcellana', shadow: 'tinta-ombra', … }).
export const BODY_COLORS = { skin: 'bisque', shirt: 'cal-foc', trousers: 'ombra', faixa: 'faixa', hair: 'ombra', shadow: 'ombra', crack: 'ombra', glow: 'or' };
const tokLin = (t) => {
  if (Array.isArray(t) && typeof t[0] === 'number') return t;
  if (Array.isArray(t)) return palLin(t[0], t[1] ?? 1);
  if (t === 'bisque') { const a = palLin('terracota'), b = palLin('cal-foc'); return a.map((v, i) => v * 0.5 + b[i] * 0.5); }
  return palLin(t);
};

// ---------------------------------------------------------------------------------------------------------------- builds and poses
// sturdy castellers, sculpted (not realistic): shorter legs, thick arms, round shoulders, mitten hands, a smooth head without features
const SCULPT = { face: false, paddle: true, shY: 0.078, neck: 1.18, wrist: 1.3, foot: 1.15, curl: 0.6 };
export const BUILDS = [
  { ...SCULPT, s: 1.0, sh: 0.2, hip: 0.096, hipW: 0.155, chest: 0.198, leg: 0.92, arm: 1.18, legT: 1.06, head: 1.04, mitt: 1.46 },     // broad
  { ...SCULPT, s: 0.95, sh: 0.182, hip: 0.1, hipW: 0.168, chest: 0.178, leg: 0.93, arm: 1.12, legT: 1.04, head: 1.06, mitt: 1.42 },  // slight
  { ...SCULPT, s: 1.0, sh: 0.17, hip: 0.09, hipW: 0.16, chest: 0.172, leg: 0.84, arm: 1.1, legT: 1.04, head: 1.34, mitt: 1.5 },      // a child (used at scale 0.55–0.8)
];
const REST = { lean: 0, hunch: 0, head: 0, feet: [V(0.13, 0.07, 0), V(-0.13, 0.07, 0)], hands: [V(0.4, 0.9, 0.03), V(-0.4, 0.9, 0.03)], elbow: V(0, -1, -0.3) };
// hands: [left (+x), right (-x)]; hf: hand frames { fd: fingers, pn: palm normal }
export const POSE_SPECS = {
  // 0 · standing, at ease, weight a little forward, arms loose
  stand: { lean: 0.03, hunch: 0.04, head: 0.06, feet: [V(0.11, 0.07, 0.03), V(-0.11, 0.07, -0.02)], hands: [V(0.25, 0.84, 0.04), V(-0.25, 0.85, 0.05)],
    hf: [{ fd: [0.1, -1, 0.1], pn: [-1, 0, 0] }, { fd: [-0.1, -1, 0.1], pn: [1, 0, 0] }], elbow: V(0, -1, -0.35) },
  // 1 · the palm offered: the right hand forward at 1.38 m, flat, fingers up, palm facing +z (the visitor); the left at the side
  palm: { lean: 0.1, hunch: 0.04, head: 0.04, feet: [V(0.12, 0.07, -0.08), V(-0.11, 0.07, 0.12)], hands: [V(0.24, 0.86, 0.06), V(-0.27, 1.36, 0.4)],
    hf: [{ fd: [0.1, -1, 0.1], pn: [-1, 0, 0] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.5) },
  // 2 · locked: arms over the neighbours' shoulders (the ring of the pinya)
  lock: { lean: 0.1, hunch: 0.08, head: 0.14, feet: [V(0.13, 0.07, 0.05), V(-0.13, 0.07, -0.04)], hands: [V(0.68, 1.27, 0.07), V(-0.67, 1.26, 0.08)],
    hf: [{ fd: [1, -0.2, 0.05], pn: [0, -1, 0] }, { fd: [-1, -0.2, 0.05], pn: [0, -1, 0] }], elbow: V(0, -1, -0.15) },   // arms out, nearly straight, hands down on the neighbours' shoulders
  // 3 · carrying: both hands flat on the back of the one in front, head down, legs braced (the weight goes through the body)
  carry: { lean: 0.24, hunch: 0.22, head: 0.45, feet: [V(0.13, 0.07, -0.12), V(-0.12, 0.07, 0.1)], hands: [V(0.17, 1.22, 0.46), V(-0.15, 1.26, 0.47)],
    hf: [{ fd: [0, 0.5, 0.2], pn: [0, 0, 1] }, { fd: [0, 0.5, 0.2], pn: [0, 0, 1] }], elbow: V(0, -1, -0.2) },
  // 4 · the arm raised (l'aleta of the enxaneta): the right hand high, open, the left on the hip
  raise: { lean: -0.02, hunch: 0.0, head: -0.18, feet: [V(0.11, 0.07, 0.0), V(-0.11, 0.07, 0.02)], hands: [V(0.27, 1.0, 0.1), V(-0.2, 2.06, 0.08)],
    hf: [{ fd: [-0.3, -0.6, 0.6], pn: [-1, 0, 0] }, { fd: [-0.05, 1, 0], pn: [0, 0, 1] }], elbow: V(0, -1, -0.3) },
};
export const POSES = Object.keys(POSE_SPECS);                       // ['stand', 'palm', 'lock', 'carry', 'raise']
const POSE_I = Object.fromEntries(POSES.map((k, i) => [k, i]));
const poseIndex = (p) => (typeof p === 'number' ? Math.max(0, Math.min(POSES.length - 1, p | 0)) : (POSE_I[p] ?? 0));
for (const sp of Object.values(POSE_SPECS)) if (sp.hf) sp.hf = sp.hf.map((f) => f || undefined);

const LODS = [{ grid: 0.016, detail: false, shards: 46 }, { grid: 0.03, detail: false, shards: 30 }];   // mitten hands on both: the palm reads at 3 m
const TW = 1024;          // pose texture width (texels)
const Y0 = 0.9;           // positions are stored as y − Y0 (half-float precision ≈ 1 mm over the body)

// ---------------------------------------------------------------------------------------------------------------- regions (rest A-pose)
// 0 skin (head, neck, hands) · 1 shirt · 2 trousers · 3 faixa (+ hair: aAux2.z). From the rest pose (arms away from the body), baked per vertex.
function regionOf(p, headW, B) {
  const s = B.s, x = p[0], y = p[1], z = p[2];
  if (headW > 0.45) return 0;
  // hands: beyond the wrist along the arm (shoulder ≈ (±sh, 1.42 s) → wrist (±0.4, 0.9))
  for (const sx of [1, -1]) {
    const shx = sx * B.sh * s, shy = 1.42 * s, wx = sx * 0.4, wy = 0.9, dx = wx - shx, dy = wy - shy, L = Math.hypot(dx, dy);
    const t = ((x - shx) * dx + (y - shy) * dy) / L;
    if (t > L - 0.02 && Math.abs(x) > 0.28) return 0;
  }
  const torso = Math.hypot(x, z * 1.2) < 0.24;
  if (torso && y > 0.97 * s && y < 1.13 * s) return 3;
  if (y < 0.97 * s && Math.abs(x) < 0.27) return 2;
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------- the kit
export function createBodies({ THREE, TSL, room, max = 64, nearDist = 4.6, colors = {}, material = null, seed = 7, lods = [0, 1], builds = [0, 1, 2], render = 'splat', splats = [13000, 3000, 5500], blend: splatBlend = 'alpha', spots = null, human = true } = {}) {
  const splatOnlyLodMesh = false;
  const { attribute, uniform, vec3, vec4, float, int, ivec2, textureLoad, vertexIndex, Fn, varying, mix, sin, normalize, smoothstep, clamp,
    positionWorld, cameraViewMatrix, cameraPosition, dot, abs, pow, max: tmax, uv, length, exp } = TSL;
  const C = { ...BODY_COLORS, ...colors };
  const col = (k) => tokLin(C[k]);
  const object = new THREE.Group(); object.name = 'bodykit';
  const uTime = uniform(0);
  const uColor = {
    skin: uniform(new THREE.Vector3(...col('skin'))),
    shirt: uniform(new THREE.Vector3(...col('shirt'))),
    trousers: uniform(new THREE.Vector3(...col('trousers'))), faixa: uniform(new THREE.Vector3(...col('faixa'))),
    crack: uniform(new THREE.Vector3(...col('crack'))), hair: uniform(new THREE.Vector3(...col('hair'))), glow: uniform(new THREE.Vector3(...col('glow'))),
  };
  const uCrack = uniform(0.35), uRim = uniform(0.8), uFlash = uniform(0.6), uSculpt = uniform(new THREE.Vector2(0.38, 1.2));   // sculpt: unused since self-lit (kept for API)
  const uSelf = uniform(1), uAlb = uniform(0.35), uSpec = uniform(0.22);
  const uKey = uniform(new THREE.Vector3(...palLin('os', 0.95))), uAmb = uniform(new THREE.Vector3(...palLin('os', 0.3)));
  const uEye = uniform(new THREE.Vector3(room?.eye?.x ?? 0, room?.eye?.y ?? 1.6, room?.eye?.z ?? 0));

  // ---- CPU state per body: 20 floats (pos xyz, yaw | poseA, poseB, mix, scale | tint rgb, glow | build, lod, visible, seed | form, fmode, -, -)
  const SZ = 20, S = new Float32Array(max * SZ);
  for (let i = 0; i < max; i++) { S[i * SZ + 7] = 1; S[i * SZ + 8] = S[i * SZ + 9] = S[i * SZ + 10] = 1; S[i * SZ + 15] = ((i * 0.6180339) % 1); S[i * SZ + 16] = 1; }

  // ---- one mesh per (build, lod): InstancedBufferGeometry, pose texture, 3 instanced vec4
  const meshes = [];      // { build, lod, mesh, geo, iA, iB, iC, tex, n }
  const baseMat = material;
  function makeMaterial(tex, rows) {
    // the one matter (room.matter.body: glaze, wear, env, the lluna rim and the hands' light in the chapter's accent); colour, regions,
    // pose and the sculptor's key are the kit's. Fallback: a plain standard material + the room's rim.
    const matter = baseMat ? baseMat.clone() : room?.matter?.body ? room.matter.body({ color: 'cal-foc', faixa: 'faixa', faixaY: [-2, -1] }) : null;
    const m = matter || new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0 });
    const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), iC = attribute('iC', 'vec4');
    const aux = attribute('aAux', 'vec4');           // (crack border 0/1, breath, region, ao)
    const aux2 = attribute('aAux2', 'vec4');         // (thickness, mottle, -, -)
    const vi = int(vertexIndex), tx = vi.mod(int(TW)), ty = vi.div(int(TW));
    const fetch = (pose, k) => textureLoad(tex, ivec2(tx, ty.add(int(pose).mul(int(rows * 2))).add(int(rows * k)))).xyz;
    const yaw = iA.w, cy = TSL.cos(yaw), sy = TSL.sin(yaw);
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const rotY = (v) => X.mul(v.x).add(vec3(0, v.y, 0)).add(F.mul(v.z));
    // pose blend (two texture loads per pose), breath on the torso, then the instance transform
    const pA = fetch(iB.x, 0), pB = fetch(iB.y, 0), nA = fetch(iB.x, 1), nB = fetch(iB.y, 1);
    const pl = mix(pA, pB, iB.z).add(vec3(0, Y0, 0));
    const nl = normalize(mix(nA, nB, iB.z));
    const br = sin(uTime.mul(1.7).add(iA.x.mul(1.3)).add(iA.z.mul(0.7))).mul(aux.y).mul(0.0045);
    const ps = pl.add(nl.mul(br)).mul(iB.w);
    m.positionNode = rotY(ps).add(iA.xyz);
    const vN = varying(rotY(nl), 'vBodyN');
    m.normalNode = normalize(cameraViewMatrix.mul(vec4(normalize(vN), 0)).xyz);
    // colour by region (soft edges from the interpolated region value), mottle, AO, crackle
    const vReg = varying(aux.z, 'vBodyReg'), vAO = varying(aux.w, 'vBodyAO'), vCr = varying(aux.x, 'vBodyCr'), vMot = varying(aux2.y, 'vBodyMot');
    const vTint = varying(iC.xyz, 'vBodyTint'), vGlow = varying(iC.w, 'vBodyGlow');
    const w0 = float(1).sub(smoothstep(0.35, 0.65, vReg)), w3 = smoothstep(2.35, 2.65, vReg);
    const w2 = smoothstep(1.35, 1.65, vReg).mul(float(1).sub(w3)), w1 = float(1).sub(w0).sub(w2).sub(w3).max(0);
    let base = uColor.skin.mul(w0).add(uColor.shirt.mul(w1)).add(uColor.trousers.mul(w2)).add(uColor.faixa.mul(w3));
    const vHair = varying(aux2.z, 'vBodyHair'), vFeet = varying(aux2.w, 'vBodyFeet');
    base = mix(base, uColor.hair.mul(0.6), smoothstep(0.3, 0.7, vHair));   // ombra, deepened
    base = mix(base, uColor.trousers.mul(0.55), smoothstep(0.3, 0.7, vFeet));
    base = base.mul(vMot.sub(0.5).mul(0.16).add(1));
    const crack = float(1).sub(smoothstep(0.45, 0.95, vCr)).mul(uCrack);
    base = mix(base, uColor.crack, crack.mul(0.55));
    const ao = mix(mix(float(0.3), float(0.72), w0), float(1), vAO.mul(vAO));    // the head keeps its light (no dark mask under the brow)
    // the sculptor's key, the same for every body wherever it stands: from the upper LEFT as seen from the eye (side = the viewer's
    // right; a function of world position only, so a body across a corner is lit the same on both walls), the far side into a warm
    // shadow — the volume reads on light worlds; the cast shadow below goes the other way
    const tE = normalize(vec3(uEye.x.sub(positionWorld.x), 0, uEye.z.sub(positionWorld.z))), side = vec3(tE.z, 0, tE.x.negate());
    const Lk = normalize(side.mul(-0.75).add(vec3(0, 0.85, 0)).add(tE.mul(0.45)));
    // SELF-LIT (no light of its own in the scene: adding lights recompiles every lit material of the work): the sculptor's key and a
    // sky-coloured ambient go to the emissive; the albedo stays low so the room's env / a chapter's real lights only add a little
    const Nn = normalize(vN), alb = base.mul(vTint).mul(ao);
    const wrapK = clamp(dot(Nn, Lk).mul(0.62).add(0.38), 0, 1);
    const V0 = normalize(cameraPosition.sub(positionWorld)), Hh = normalize(Lk.add(V0));
    const glazeW = w1.add(w3).add(w0.mul(0.3)), spec = pow(clamp(dot(Nn, Hh), 0, 1), 28).mul(glazeW).mul(uSpec);
    const self = alb.mul(uAmb.add(uKey.mul(wrapK.mul(wrapK)))).add(uKey.mul(spec).mul(ao));
    m.colorNode = vec4(alb.mul(uAlb), 1);
    // the glaze: smoother on the shirt and faixa, bisque on skin, matte on the trousers; the crackle is rough
    const rough = float(0.62).mul(w0).add(float(0.34).mul(w1)).add(float(0.55).mul(w2)).add(float(0.3).mul(w3)).add(crack.mul(0.3));
    m.roughnessNode = matter?.roughnessNode ? matter.roughnessNode.mul(0.5).add(rough.mul(0.5)) : rough;
    // rim (the room's cool rim node, all four walls at once) + the hands' flash on the edges + the achievement glow (or)
    const V3 = normalize(cameraPosition.sub(positionWorld)), fres = float(1).sub(abs(dot(normalize(vN), V3)));
    let em = matter?.emissiveNode ? matter.emissiveNode.mul(uRim.mul(1.4)) : room?.rimNode ? room.rimNode([0.62, 0.74, 1.0], 1, 3).mul(uRim) : vec3(0);
    if (!matter && room?.flash) em = em.add(uColor.shirt.mul(room.flash(positionWorld)).mul(pow(fres, 2)).mul(uFlash));
    em = em.add(uColor.glow.mul(vGlow).mul(pow(fres, 1.5).mul(0.8).add(0.2)));
    m.emissiveNode = em.mul(ao).add(self.mul(uSelf));
    return m;
  }

  // ---- contact + cast shadows: one instanced quad per body ×2 (a round contact disc under the feet; a long soft one away from the key)
  const shGeo = new THREE.InstancedBufferGeometry();
  { const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2); shGeo.index = q.index; shGeo.setAttribute('position', q.attributes.position); shGeo.setAttribute('uv', q.attributes.uv); }
  const shBuf = new Float32Array(max * 2 * 8);
  const shA = new THREE.InstancedBufferAttribute(shBuf.subarray(0, max * 2 * 4), 4), shB = new THREE.InstancedBufferAttribute(new Float32Array(max * 2 * 4), 4);
  shA.setUsage(THREE.DynamicDrawUsage); shB.setUsage(THREE.DynamicDrawUsage);
  shGeo.setAttribute('sA', shA); shGeo.setAttribute('sB', shB); shGeo.instanceCount = 0;
  const shMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uShadow = uniform(new THREE.Vector3(...col('shadow'))), uShK = uniform(0.95);
  {
    const sA = attribute('sA', 'vec4'), sB = attribute('sB', 'vec4');     // sA (x, z, angle, k) · sB (length, width, offset, soft)
    const p = TSL.positionGeometry, ca = TSL.cos(sA.z), sa = TSL.sin(sA.z);
    const lx = p.x.mul(sB.y), lz = p.z.mul(sB.x).add(sB.z);
    shMat.positionNode = vec3(sA.x.add(lx.mul(ca)).add(lz.mul(sa)), 0.004, sA.y.sub(lx.mul(sa)).add(lz.mul(ca)));
    const q = uv().sub(0.5).mul(2), r2 = dot(q, q);
    const a = exp(r2.mul(sB.w.negate())).sub(exp(sB.w.negate())).max(0).div(float(1).sub(exp(sB.w.negate())));
    shMat.colorNode = vec4(uShadow, a.mul(sA.w).mul(uShK));
  }
  const shMesh = new THREE.Mesh(shGeo, shMat); shMesh.frustumCulled = false; shMesh.renderOrder = -5; shMesh.name = 'bodykit:shadows';
  object.add(shMesh);
  // light pools (the Pinya's abstract world): a warm additive gaussian on the floor under a body, its strength = pool × form
  const plGeo = new THREE.InstancedBufferGeometry();
  { const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2); plGeo.index = q.index; plGeo.setAttribute('position', q.attributes.position); plGeo.setAttribute('uv', q.attributes.uv); }
  const plA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); plA.setUsage(THREE.DynamicDrawUsage); plGeo.setAttribute('pA', plA); plGeo.instanceCount = 0;
  const plMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const uPool = uniform(new THREE.Vector3(...palLin('cal-fanal', 0.14)));
  { const pa = attribute('pA', 'vec4'), pg = TSL.positionGeometry;
    plMat.positionNode = vec3(pa.x.add(pg.x.mul(pa.z)), 0.006, pa.y.add(pg.z.mul(pa.z)));
    const qd = uv().sub(0.5).mul(2), d2 = dot(qd, qd);
    plMat.colorNode = uPool.mul(exp(d2.mul(-3.0)).sub(0.05).max(0)).mul(pa.w); }
  const plMesh = new THREE.Mesh(plGeo, plMat); plMesh.frustumCulled = false; plMesh.renderOrder = -4; plMesh.name = 'bodykit:pools'; object.add(plMesh);
  const CS = room?.contactShadows ? room.contactShadows(max, { color: 'tinta' }) : null;   // the room's contact discs (the chapter's shadow colour); the kit draws the cast
  if (CS) object.add(CS.mesh);
  let csUsed = 0, fakeCast = false;   // 25-11 (AD): no fake cast shadow — a warm light pool + the dark contact disc
  // 'self': lit by the kit alone (no scene light) + its own soft cast shadow · 'scene': a chapter with a real key and shadow map (the
  // lit square: room.keyShadow) — the albedo takes the real light, the self light becomes a fill, the fake cast shadow goes
  function setLighting(mode = 'self') {
    if (mode === 'scene') { uSelf.value = 0.35; uAlb.value = 0.95; } else { uSelf.value = 1; uAlb.value = 0.35; }
  }

  // ================================================================================================ SPLATS (25-11: «the body is light that
  // accumulates where there is mass; read by density and a spotlight, never by local colour or outline» — Art Director's body spec)
  // Each body = N round isotropic gaussians baked once from its SDF mesh, in all five poses (half-float texture; the GPU blends poses):
  //   70 % CORE — sampled IN the volume (pushed inside the surface by up to the part's depth: torso/pelvis 11 cm, head 7.5, thighs 6.5,
  //        limbs 3): dense torso, pelvis, head, thighs · 25 % SKIN — on the surface · 5 % AURA — 15–25 cm off the body, falling slowly.
  //   Hands and feet are sampled at a quarter of the density: almost dissolved. No costume: one matter; the faixa is a slightly denser,
  //   warmer band. Sizes 1.5–3 cm (core) / 4–8 cm (aura), low opacity, additive: the core accumulates to the chapter's light tone.
  // Light, per splat (vertex stage): a warm high key from the upper left of the eye (lit side `lit`, half-shadow `half`, shadow falls to
  // ~17 % and into `amb`, the night) + a cool backlight rim. Motion: every splat on a slow spring round its home (1–2 cm, 0.2–0.4 Hz), the
  // torso breathes; `form` 0..1 gathers them from the ground inward and upward (feet first, 1.2–2 s at the caller's pace); 'dust' lets
  // them fall with gravity. Nothing radial, nothing fast.
  const splatSets = [];   // { build, lod, N, rows, tex, bodyTex, bodyData, geo, mesh, count }
  const uSize = uniform(1), uOpacity = uniform(1), uDrift = uniform(1), uFlow = uniform(1), uStreak = uniform(0);
  // the lit tone warm enough to stay warm through the chapters' grade and bloom; the half tone a soft terracota
  const uLit = uniform(new THREE.Vector3(...palLin('cal-fanal').map((v, i) => v * 0.62 + palLin('fanal')[i] * 0.3))), uHalf = uniform(new THREE.Vector3(...palLin('terracota').map((v, i) => v * 0.4 + palLin('cal-foc')[i] * 0.32)));   // warm (sheet3), the half tone a soft terracota   // terracota, desaturated towards the lime
  const uSKey = uniform(0.88), uSAmb = uniform(new THREE.Vector3(...palLin('tinta', 1.0)));
  const uSRim = uniform(new THREE.Vector3(...palLin('lluna', 0.32))), uSGlow = uniform(0);
  const quad = new THREE.PlaneGeometry(2, 2);
  const uPalmCol = uniform(new THREE.Vector3(...palLin('cal-fanal', 0.9)));
  const uContact = uniform(0), uBackAO = uniform(0), uDarkRim = uniform(0), uGoldDark = uniform(new THREE.Vector3(...palLin('bronze', 0.6))), uGoldLit = uniform(new THREE.Vector3(...palLin('or-clar', 0.95)));
  const SPN = spots?.pos?.length ? Math.min(8, spots.pos.length) : 0;
  const SPP = SPN ? TSL.uniformArray(spots.pos, 'vec4') : null, SPD = SPN ? TSL.uniformArray(spots.dir, 'vec4') : null, uSpotK = uniform(0.00025);   // plaza SPOT_K ≈ 2600 → ≈ 0.65 at the beam's heart
  // the human base: per bone class [density, max depth inside (m), aura share] — wide thorax and pelvis (core 28–32 cm), thick thighs,
  // thin forearms, hands and feet at 30–40 %, the head lighter (no bulb)
  const CLS = [[0.6, 0.07, 0], [1.0, 0.13, 0.03], [0.9, 0.075, 0], [0.62, 0.04, 0.03], [0.35, 0.012, 0.05], [0.35, 0.015, 0], [0.45, 0.028, 0.04]];
  function partOf(p, reg, s) {        // rest pose (A-pose): density weight, max depth inside (m)
    const x = Math.abs(p[0]), y = p[1];
    if (reg < 0.5 && y < 1.3 * s) return [0.25, 0.01];                // hands
    if (y < 0.14 * s) return [0.3, 0.012];                             // feet
    if (reg < 0.5) return [1.0, 0.075];                                // head and neck
    if (x < 0.2 && y > 0.85 * s && y < 1.5 * s) return [reg > 2.5 ? 1.0 : 0.85, 0.11];   // torso, pelvis (the faixa a little denser)
    if (x < 0.2 && y > 0.42 * s && y <= 0.85 * s) return [0.75, 0.065]; // thighs
    return [0.55, 0.03];                                               // arms, shins
  }
  function* bakeSplats(r, B, b, l, vAux, vAux2) {
    const N = splats[l] ?? 2000, rows = Math.ceil(N / TW), NP = POSES.length, idx = r.index, R0 = r.P[0], s = B.s;
    const tri = idx.length / 3, cdf = new Float64Array(tri); let acc = 0;
    for (let t = 0; t < tri; t++) {
      const a = idx[t * 3] * 3, c = idx[t * 3 + 1] * 3, d = idx[t * 3 + 2] * 3;
      const ux = R0[c] - R0[a], uy = R0[c + 1] - R0[a + 1], uz = R0[c + 2] - R0[a + 2], vx = R0[d] - R0[a], vy = R0[d + 1] - R0[a + 1], vz = R0[d + 2] - R0[a + 2];
      acc += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); cdf[t] = acc;
    }
    yield;
    let sd = (seed * 7919 + b * 131 + l * 17) >>> 0;
    const rnd = () => { sd = (sd + 0x6d2b79f5) >>> 0; let t = sd; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = [], toH = THREE.DataUtils.toHalfFloat;
    for (let k = 0, tries = 0; k < N && tries < N * 12; tries++) {
      const x = rnd() * acc; let lo = 0, hi = tri - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < x) lo = m + 1; else hi = m; }
      let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w0 = 1 - u - v, vi = idx[lo * 3 + (w0 >= u && w0 >= v ? 0 : u >= v ? 1 : 2)];
      const [wt, dmax, auraP] = r.cls ? CLS[r.cls[vi]] : [...partOf([R0[vi * 3], R0[vi * 3 + 1], R0[vi * 3 + 2]], vAux[vi * 4 + 2], s), 0.05];
      if (rnd() > wt) continue;
      // aura only on the upper body (shoulders, arms, hands, a little on the head): the dust leaves from where the weight is carried
      const upper = R0[vi * 3 + 1] > 1.0, ty = rnd(), aP = upper ? auraP : 0;
      const kind = ty < aP ? 1 : ty < aP + 0.7 * (1 - aP) ? 0 : 0.5;
      // core inside the volume · skin: a soft density falloff across the surface (−2 … +5 cm, thinning outwards) · aura: 3–12 cm off
      const depth = kind === 0 ? -Math.pow(rnd(), 0.6) * dmax : kind === 0.5 ? Math.pow(rnd(), 2.6) * 0.05 - 0.015 : 0.03 + rnd() * 0.09;   // the skin: fuller (the edge falloff narrower)
      pick.push([lo, w0, u, v, vi, kind, depth]); k++;
    }
    while (pick.length < N) pick.push(pick[pick.length % Math.max(1, pick.length)] || [0, 1, 0, 0, idx[0], 0, 0]);
    yield;
    const data = new Uint16Array(TW * rows * (2 * NP + 2) * 4);
    const put = (blk, k, a, b2, c, d) => { const o = (blk * rows * TW + k) * 4; data[o] = toH(a); data[o + 1] = toH(b2); data[o + 2] = toH(c); data[o + 3] = toH(d); };
    for (let pi = 0; pi < NP; pi++) {
      const P = r.P[pi + 1], Nn = r.N[pi + 1];
      for (let k = 0; k < N; k++) {
        const [t, w0, w1, w2] = pick[k], i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
        const px = P[i0] * w0 + P[i1] * w1 + P[i2] * w2, py = P[i0 + 1] * w0 + P[i1 + 1] * w1 + P[i2 + 1] * w2, pz = P[i0 + 2] * w0 + P[i1 + 2] * w1 + P[i2 + 2] * w2;
        const nx = Nn[i0] * w0 + Nn[i1] * w1 + Nn[i2] * w2, ny = Nn[i0 + 1] * w0 + Nn[i1 + 1] * w1 + Nn[i2 + 1] * w2, nz = Nn[i0 + 2] * w0 + Nn[i1 + 2] * w1 + Nn[i2 + 2] * w2;
        const nl = Math.hypot(nx, ny, nz) || 1;
        put(pi * 2, k, px, py - Y0, pz, 1); put(pi * 2 + 1, k, nx / nl, ny / nl, nz / nl, 1);
      }
      yield;
    }
    // AX: region, ao, rnd, depth · AX2: kind (0 core · 0.5 skin · 1 aura), feet, breath, size jitter
    for (let k = 0; k < N; k++) {
      const q = pick[k], vi = q[4];
      put(2 * NP, k, vAux[vi * 4 + 2], vAux[vi * 4 + 3], rnd(), q[6]);
      put(2 * NP + 1, k, q[5], vAux2[vi * 4 + 3], vAux[vi * 4 + 1], rnd());
    }
    const tex = new THREE.DataTexture(data, TW, rows * (2 * NP + 2), THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const bodyData = new Float32Array(4 * max * 5);
    const bodyTex = new THREE.DataTexture(bodyData, 5, max, THREE.RGBAFormat, THREE.FloatType);
    bodyTex.minFilter = bodyTex.magFilter = THREE.NearestFilter; bodyTex.generateMipmaps = false; bodyTex.needsUpdate = true;
    const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, splatMaterial(tex, bodyTex, N, rows, l));
    mesh.frustumCulled = false; mesh.name = `bodykit:splats:b${b}l${l}`; mesh.renderOrder = 2;
    object.add(mesh);
    yield;
    return { build: b, lod: l, N, rows, tex, bodyTex, bodyData, geo, mesh, count: 0 };
  }
  function splatMaterial(tex, bodyTex, N, rows, lod) {
    const { instanceIndex, positionGeometry, cross, step, fract, select, cos } = TSL;
    const solid = splatBlend === 'solid';
    const m = new THREE.MeshBasicNodeMaterial({ transparent: !solid, depthWrite: solid, side: THREE.DoubleSide, blending: splatBlend === 'alpha' || solid ? THREE.NormalBlending : THREE.AdditiveBlending });
    m.fog = false;   // the bodies are the subject: the room's air must not wash them to a veil (they are at 2–6 m)
    const NP = POSES.length;
    const ii = int(instanceIndex), bi = ii.div(int(N)), si = ii.mod(int(N));
    const B0 = textureLoad(bodyTex, ivec2(0, bi)), B1 = textureLoad(bodyTex, ivec2(1, bi)), B2 = textureLoad(bodyTex, ivec2(2, bi)), B3 = textureLoad(bodyTex, ivec2(3, bi)), B4 = textureLoad(bodyTex, ivec2(4, bi));   // B4: the right palm (body-local, of the pose blend), palm glow
    const tx = si.mod(int(TW)), ty = si.div(int(TW));
    const blk = (k) => textureLoad(tex, ivec2(tx, ty.add(k.mul(int(rows)))));
    const pa = int(B1.x).mul(2), pb = int(B1.y).mul(2);
    const pA = blk(pa).xyz, pB = blk(pb).xyz, nA = blk(pa.add(1)).xyz, nB = blk(pb.add(1)).xyz;
    const AX = blk(int(2 * NP)), AX2 = blk(int(2 * NP + 1));
    const rr = AX.z, depth = AX.w, kind = AX2.x, jit = AX2.w;
    const aura = step(0.75, kind), core = float(1).sub(step(0.25, kind));
    const yaw = B0.w, cy = TSL.cos(yaw), sy = TSL.sin(yaw);
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const rotY = (v) => X.mul(v.x).add(vec3(0, v.y, 0)).add(F.mul(v.z));
    const sc = B1.w;
    const nl = normalize(mix(nA, nB, B1.z));
    let pl = mix(pA, pB, B1.z).add(vec3(0, Y0, 0));
    // home: inside the volume (core), on the skin, or off it (aura, falling slowly and fading on its cycle)
    const t = uTime, ph = rr.mul(61.7);
    const auraT = fract(t.mul(0.05).add(rr.mul(7.0)));
    // far LOD: a crisper body (the outward skin falloff mostly pulled in, no aura): at 4–6 m the fuzz would merge the bodies
    pl = pl.add(nl.mul(lod === 0 ? depth : depth.min(0.008))).add(vec3(auraT.mul(0.14), auraT.mul(-0.32), auraT.mul(-0.05)).mul(aura));   // the aura falls slowly and drifts to one side
    // the slow spring round home (1–2 cm, 0.2–0.4 Hz), the breath of the torso
    const hz = fract(rr.mul(5.3)).mul(0.2).add(0.2).mul(6.2832);
    const drift = vec3(sin(t.mul(hz).add(ph)), sin(t.mul(hz.mul(0.83)).add(ph.mul(1.7))), sin(t.mul(hz.mul(1.13)).add(ph.mul(2.3)))).mul(jit.mul(0.01).add(0.008)).mul(uDrift);
    pl = pl.add(drift).add(nl.mul(sin(t.mul(1.25).add(B0.x.mul(1.3)).add(B0.z.mul(0.7))).mul(AX2.z).mul(0.008)));
    // gathering: from the ground (and round the body's feet) inward and upward, feet first; dust: down with gravity
    const form = B3.x, riseM = step(1.5, B3.y), dust = step(0.5, B3.y).mul(float(1).sub(riseM));
    const hy = clamp(pl.y.div(1.9), 0, 1);
    const k = clamp(form.mul(1.45).sub(rr.mul(0.3)).sub(hy.mul(0.15)), 0, 1), ke = k.mul(k).mul(float(3).sub(k.mul(2)));
    const away = float(1).sub(ke);
    const ang = rr.mul(37.7), spread = fract(rr.mul(13.7)).mul(0.35).add(0.25);
    const offG = vec3(TSL.sin(ang).mul(spread), pl.y.mul(fract(rr.mul(3.9)).mul(0.25).add(0.7)).min(0.85).negate(), cos(ang).mul(spread));   // from below (≤ 0.85 m: the ground, the floor underneath)
    const fallT = away.mul(away);
    const offD = vec3(TSL.sin(ang).mul(0.18).mul(away), pl.y.negate().add(0.015).mul(fallT), cos(ang).mul(0.18).mul(away));
    const offR = vec3(TSL.sin(ang).mul(0.3), fract(rr.mul(3.9)).mul(1.2).add(0.6), cos(ang).mul(0.3)).mul(away.mul(away));   // up into the light
    const off = mix(mix(offG.mul(away), offD, dust), offR, riseM).mul(uFlow);
    const C = rotY(pl.add(off).mul(sc)).add(B0.xyz);
    const nW = rotY(nl);
    // a round, isotropic gaussian facing the eye
    const toCam = normalize(cameraPosition.sub(C)), facing = dot(nW, toCam);
    const right = normalize(cross(vec3(0, 1, 0), toCam).add(vec3(0.0001, 0, 0))), upv = cross(toCam, right);
    // what lies on the far side of the body is not drawn over the near side (no dark specks through the figure): skin culled at the
    // silhouette, core a little further (it is volume), aura always
    const vis = mix(smoothstep(-0.3, 0.1, facing), smoothstep(-0.6, -0.1, facing), core).max(aura).max(away);
    // crisp grain: core 1–2 cm, skin 3–5 cm, aura 6–10 cm (faint)
    const skin = step(0.25, kind).mul(float(1).sub(aura));
    const size = mix(mix(float(0.01), float(0.02), jit), mix(float(0.012), float(0.026), jit), skin).add(aura.mul(mix(float(0.012), float(0.022), jit))).mul(sc).mul(uSize).mul(lod === 0 ? 1 : lod === 2 ? 1.0 : 1.05);
    const r0 = size.mul(1.6).mul(vis);
    const q = positionGeometry.xy;
    m.positionNode = C.add(right.mul(q.x.mul(r0))).add(upv.mul(q.y.mul(r0)));
    // light: warm high key from the upper left of the eye + cool backlight; shadow falls to ~17 % and into the night
    const reg = AX.x, w3 = smoothstep(2.35, 2.65, reg);
    const tE = normalize(vec3(uEye.x.sub(C.x), 0, uEye.z.sub(C.z))), side = vec3(tE.z, 0, tE.x.negate());
    // one warm ramp by light: tinta (shadow, luma ≈ 0.05–0.10, lost in the night) → terracota (half) → cal-foc (lit, ≤ 0.8)
    const Lk = normalize(side.mul(-1.0).add(vec3(0, 0.75, 0)).add(tE.mul(0.05)));   // a true side key: half of every body in shadow
    const headK = float(1).sub(step(0.25, AX.x)).mul(step(1.35, pl.y));                // the head: no dark band under the jaw, no bulb on top
    // the core is volume: it takes the light of a normal turned half towards the eye (no dark specks from inner points of the far side)
    const nL = normalize(mix(nW, toCam, core.mul(0.3)));   // (0.55 flattened the modelling)
    const lk0 = clamp(dot(nL, Lk).mul(0.65).add(0.32), 0, 1);   // one clean tone: no per-splat AO noise; far bodies a little smoother (no mottling)
    const lk = (lod === 0 ? lk0 : mix(lk0, float(0.55), 0.2)).max(headK.mul(0.4)).min(mix(float(1), float(0.72), headK));   // the head never brighter than the torso
    const ramp = mix(mix(uSAmb, uHalf, smoothstep(0.06, 0.42, lk)), uLit, smoothstep(0.42, 0.92, lk)).mul(B2.xyz);
    let colr = ramp.mul(mix(float(0.09), float(1), lk.pow(lod === 0 ? 1.4 : 2.0))).mul(uSKey);   // far: more contrast, so overlapping bodies part by light and shadow
    colr = colr.mul(float(1).add(w3.mul(0.08)));                                                  // the faixa: a little warmer
    colr = colr.add(uSRim.mul(pow(float(1).sub(abs(facing)), 4)).mul(smoothstep(1.15, 1.45, pl.y)).mul(float(1).sub(headK)).mul(0.6));   // a thin cool rim on the shoulders (not the jaw)
    // (no hand flash on the bodies: a hand is always near the palm figure and it washed the whole body to white — the palmGlow is the answer)
    // the palm's glow (palmGlow): a warm light held in the right palm, ≥ 35–40 cm, that lights the forearm and the chest («put your hand here»)
    const dP = pl.sub(B4.xyz).length(), pgw = B4.w.mul(exp(dP.mul(dP).mul(-6.0))).mul(1.8);   // ≈ 40 cm, reads at scale 0.5
    colr = colr.add(uPalmCol.mul(pgw).mul(mix(float(0.55), float(1), smoothstep(-0.2, 0.6, dot(nW, rotY(B4.xyz.sub(pl)).normalize())))));
    // the stage spots of the square (plaza.js part.spots, when given): what stands in a beam is lit by it
    if (spots && SPP) {
      let sp = float(0);
      for (let i = 0; i < SPN; i++) {
        const P4 = SPP.element(i), D4 = SPD.element(i), Lv = P4.xyz.sub(C), dl = Lv.length().max(0.01), Ln = Lv.div(dl);
        const cone = smoothstep(D4.w, D4.w.add(0.04), dot(Ln.negate(), D4.xyz)), wr = clamp(dot(nW, Ln).mul(0.6).add(0.4), 0, 1);
        sp = sp.add(P4.w.mul(cone).mul(wr));
      }
      colr = colr.add(uLit.mul(sp.mul(uSpotK)).mul(mix(float(0.6), float(1), AX.y)));
    }
    // gold (achievement, the crown) REPLACES the ramp, keeping the light: never brighter, never white
    const goldRamp = mix(mix(uGoldDark, uColor.glow, smoothstep(0.1, 0.55, lk)), uGoldLit, smoothstep(0.55, 0.95, lk)).mul(mix(float(0.15), float(1), lk.pow(1.2)))
      .add(uGoldLit.mul(B2.w.sub(1).max(0)));   // deep bronze → or → or-clar (lit); glow > 1 = a light source (the enxaneta)
    colr = mix(colr, goldRamp, B2.w.clamp(0, 1)).add(uColor.glow.mul(uSGlow));
    colr = colr.mul(mix(float(1), float(0.3), pow(float(1).sub(abs(facing)), 2).mul(uDarkRim)));   // a dark rim: the sculpture against a bright air
    // contact shade: the feet sink into the shoulders below / the floor — a dark gap between stacked bodies
    colr = colr.mul(mix(float(1), smoothstep(0.0, 0.22, pl.y).mul(0.5).add(0.5), uContact));   // only the feet sink (no thread legs)
    // back occlusion (a tower: each body's back faces the others): the back half sinks, so overlapping bodies part by shadow
    colr = colr.mul(mix(float(1), float(0.3), smoothstep(0.1, -0.7, nl.z).mul(uBackAO)));
    // dust: each splat faint (0.08–0.15), the volume comes from accumulation; the skin thins outwards (the edge is a density falloff)
    // near: the grain of sheet3; the tower (mid / far): presence — the facade must not show through
    const opa = mix(mix(float(0.15), float(0.11).mul(float(1).sub(smoothstep(0.0, 0.05, depth))), skin), float(0.06), aura).mul(lod === 0 ? 1 : lod === 2 ? 2.6 : 3.0);   // mid / far (the tower): solid — the facade must not show through; crisp (no outward fuzz)
    const auraFade = mix(float(1), TSL.sin(auraT.mul(3.1416)), aura).mul(lod === 0 ? float(1) : float(1).sub(aura));
    const vCol = varying(colr, 'vSplCol'), vA = varying(vis.mul(uOpacity).mul(opa).mul(auraFade).mul(mix(float(1).sub(away).pow(2), float(1).sub(away.mul(0.6)), dust.max(riseM))), 'vSplA');   // gathering splats are faint until home (no heaps on the floor)
    const qd = uv().sub(0.5).mul(2), d2 = dot(qd, qd);
    m.colorNode = vCol;
    m.opacityNode = exp(d2.mul(-4.0)).sub(0.018).max(0).mul(vA);
    m.alphaTest = 0.002;
    return m;
  }
  function setSplat(o = {}) {
    if (o.size != null) uSize.value = o.size;
    if (o.spot != null) uSpotK.value = o.spot;
    if (o.contact != null) uContact.value = o.contact;
    if (o.backAO != null) uBackAO.value = o.backAO;
    if (o.darkRim != null) uDarkRim.value = o.darkRim;
    if (o.opacity != null) uOpacity.value = o.opacity;
    if (o.drift != null) uDrift.value = o.drift;
    if (o.flow != null) uFlow.value = o.flow;
    if (o.streak != null) uStreak.value = o.streak;
    if (o.glow != null) uSGlow.value = o.glow;
    if (o.key != null) uSKey.value = o.key;
    if (o.lit) uLit.value.set(...tokLin(o.lit));
    if (o.half) uHalf.value.set(...tokLin(o.half));
    if (o.amb) uSAmb.value.set(...tokLin(o.amb));
    if (o.rim) uSRim.value.set(...tokLin(o.rim));
  }

  // ---- the bake, sliced in the background (≈ 4 ms per slice)
  const palms = {};       // `${build}` → [pose][x,y,z]
  let ready = false, resolveReady;
  const readyP = new Promise((r) => { resolveReady = r; });
  const jobs = [];
  for (const b of builds) for (const l of lods) jobs.push({ b, l });
  // the human base (Quaternius CC0) — loaded at once; the SDF body (body.js) only if it cannot be loaded
  let bases = null, basesFailed = !human;
  if (human) loadHumanBases(THREE).then((g) => { bases = g; }, (e) => { basesFailed = true; console.info('bodykit: human base meshes not loaded, SDF bodies instead (' + (e?.message || e) + ')'); });
  const humanCache = {};
  function* bakeAll() {
    const specs = [REST, ...POSES.map((k) => POSE_SPECS[k])];
    while (!bases && !basesFailed) yield;
    for (const { b, l } of jobs) {
      const B = BUILDS[b], L = LODS[l];
      const useH = !!bases;
      if (useH && l > 0 && !splatOnlyLodMesh) { /* one mesh bake per build: the LODs differ only by their splat count */ }
      const r = useH ? (humanCache[b] || (humanCache[b] = yield* bakeHumanGen(THREE, bases[HUMAN_BUILDS[b].base], HUMAN_BUILDS[b], [null, ...POSES.map((k) => HUMAN_POSES[k])])))
        : yield* bakeBodyGen(B, REST, specs, { grid: L.grid, detail: L.detail, seed: seed + b * 31 + l * 7, shards: L.shards });
      yield;
      const n = r.n, rows = Math.ceil(n / TW), NP = POSES.length;
      const data = new Uint16Array(TW * rows * 2 * NP * 4), toH = THREE.DataUtils.toHalfFloat;
      for (let pi = 0; pi < NP; pi++) {
        const P = r.P[pi + 1], N = r.N[pi + 1], o0 = pi * rows * 2 * TW, o1 = o0 + rows * TW;
        for (let v = 0; v < n; v++) {
          data[(o0 + v) * 4] = toH(P[v * 3]); data[(o0 + v) * 4 + 1] = toH(P[v * 3 + 1] - Y0); data[(o0 + v) * 4 + 2] = toH(P[v * 3 + 2]); data[(o0 + v) * 4 + 3] = toH(1);
          data[(o1 + v) * 4] = toH(N[v * 3]); data[(o1 + v) * 4 + 1] = toH(N[v * 3 + 1]); data[(o1 + v) * 4 + 2] = toH(N[v * 3 + 2]); data[(o1 + v) * 4 + 3] = toH(1);
        }
        if (pi % 2) yield;
      }
      const tex = new THREE.DataTexture(data, TW, rows * 2 * NP, THREE.RGBAFormat, THREE.HalfFloatType);
      tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
      // geometry: rest positions (bounds, and the attribute three expects), per-vertex aux
      const aux = r.aux ? r.aux : new Float32Array(n * 4), aux2 = r.aux2 ? r.aux2 : new Float32Array(n * 4), R0 = r.P[0], hc = skeleton(REST, B).headC, hk = B.head ?? 1;
      for (let v = 0; v < n && !r.aux; v++) {
        const p = [R0[v * 3], R0[v * 3 + 1], R0[v * 3 + 2]];
        aux[v * 4] = r.aAux[v * 4]; aux[v * 4 + 1] = r.aAux[v * 4 + 1]; aux[v * 4 + 2] = regionOf(p, r.aAux2[v * 4 + 3], B); aux[v * 4 + 3] = r.aAux2[v * 4];
        aux2[v * 4] = r.aAux2[v * 4 + 1]; aux2[v * 4 + 1] = r.aAux2[v * 4 + 2];
        // mocador: a dark cloth on the top and back of the head (never across the face)
        if (r.aAux2[v * 4 + 3] > 0.45) { const rx = Math.abs(p[0] - hc[0]), ry = p[1] - hc[1], rz = p[2] - hc[2]; aux2[v * 4 + 2] = (ry > 0.06 * hk && rz < 0.02) || (rz < -0.03 * hk && ry > -0.03 * hk) ? 1 : 0; }
        aux2[v * 4 + 3] = p[1] < 0.13 ? 1 : 0;   // the feet: espadrilles in ombra
      }
      yield;
      const geo = new THREE.InstancedBufferGeometry();
      geo.setIndex(new THREE.BufferAttribute(r.index, 1));
      geo.setAttribute('position', new THREE.BufferAttribute(R0, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(r.N[0], 3));
      geo.setAttribute('aAux', new THREE.BufferAttribute(aux, 4));
      geo.setAttribute('aAux2', new THREE.BufferAttribute(aux2, 4));
      const iA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), iB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), iC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      for (const a of [iA, iB, iC]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC);
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, makeMaterial(tex, rows));
      mesh.frustumCulled = false; mesh.name = `bodykit:b${b}l${l}`; mesh.castShadow = true; mesh.receiveShadow = true;
      object.add(mesh);
      meshes.push({ build: b, lod: l, mesh, geo, iA, iB, iC, tex, n });
      if (render === 'splat') { mesh.material.colorWrite = false; mesh.material.depthWrite = false; mesh.receiveShadow = false; }   // an invisible shadow caster
      if (render === 'splat') { const SP = yield* bakeSplats(r, B, b, l, aux, aux2); splatSets.push(SP); }
      palms[b] = palms[b] || r.palm.slice(1).map((q) => [q[0], q[1], q[2]]);
      yield;
    }
  }
  const gen = bakeAll();
  function stepBake(budgetMs = 4) {
    if (ready) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const r = gen.next();
      if (r.done) { ready = true; resolveReady(api); return; }
    }
  }
  // keep baking even when nobody calls update (e.g. a part not on screen yet)
  const tick = () => { stepBake(6); if (!ready) setTimeout(tick, 0); };
  setTimeout(tick, 0);

  // ---- per frame: pack the visible bodies into their (build, lod) mesh, and their shadows
  const _e = room?.eye || { x: 0, y: 1.6, z: 0 };
  function update(dt = 1 / 60) {
    uTime.value += dt;
    stepBake(3);
    if (!ready) return;
    for (const M of meshes) M.count = 0;
    for (const P of splatSets) P.count = 0;
    let ns = 0, nc = 0, np = 0;
    const kx = _e.x, kz = _e.z;     // the key light is above the room's centre: the cast shadow points away from it
    for (let i = 0; i < max; i++) {
      const o = i * SZ; if (!S[o + 14]) continue;
      const x = S[o], y = S[o + 1], z = S[o + 2], sc = S[o + 7];
      const d = Math.hypot(x - _e.x, z - _e.z);
      const lod = S[o + 13] >= 0 ? S[o + 13] : (d <= nearDist ? 0 : 1);
      const M = meshes.find((q) => q.build === S[o + 12] && q.lod === lod) || meshes.find((q) => q.build === S[o + 12]) || meshes[0];
      const k = M.count++;
      M.iA.array.set([x, y, z, S[o + 3]], k * 4); M.iB.array.set([S[o + 4], S[o + 5], S[o + 6], sc], k * 4); M.iC.array.set([S[o + 8], S[o + 9], S[o + 10], S[o + 11]], k * 4);
      const SP = splatSets.find((q) => q.build === M.build && q.lod === M.lod);
      if (SP) { const j = SP.count++, D = SP.bodyData; D.set([x, y, z, S[o + 3], S[o + 4], S[o + 5], S[o + 6], sc, S[o + 8], S[o + 9], S[o + 10], S[o + 11], S[o + 16], S[o + 17], S[o + 15], 0], j * 20);
        if (S[o + 19] > 0.001) { const pa = palm(S[o + 4] | 0, S[o + 12] | 0), pb = palm(S[o + 5] | 0, S[o + 12] | 0), m = S[o + 6]; D.set([pa[0] + (pb[0] - pa[0]) * m, pa[1] + (pb[1] - pa[1]) * m, pa[2] + (pb[2] - pa[2]) * m, S[o + 19]], j * 20 + 16); } else D[j * 20 + 19] = 0; }
      if (S[o + 18] > 0.001 && y < 0.05) plA.array.set([x, z, 1.15 * sc, S[o + 18] * S[o + 16]], (np++) * 4);
      if (y < 0.05 && ns < max * 2 - 1) {    // shadows only for bodies standing on the floor
        const lift = Math.max(0, y);
        // contact: round, tight, dark (sB: length, width, offset, soft) — the room's disc when it has them
        if (CS) CS.set(nc++, x, z, 0.42 * sc, 0.5 * (1 - lift * 8));   // soft tinta under the feet
        else { shA.array.set([x, z, 0, 1 - lift * 8], ns * 4); shB.array.set([0.7 * sc, 0.62 * sc, 0, 2.6], ns * 4); ns++; }
        // cast: long, soft, away from the key (key at 7.5 m over the centre → length ≈ h · d / (7.5 − h))
        if (!fakeCast) continue;
        const tx = (kx - x) / (d || 1), tz = (kz - z) / (d || 1), dx = tz * 0.75 - tx * 0.45, dz = -tx * 0.75 - tz * 0.45;   // away from the key: right of the body, away from the eye
        const ang = Math.atan2(dx, dz), L = 1.45 * sc;
        shA.array.set([x, z, ang, 0.72], ns * 4); shB.array.set([L, 0.46 * sc, L * 0.36, 1.7], ns * 4); ns++;
      }
    }
    for (const M of meshes) { M.geo.instanceCount = M.count; if (M.count) { M.iA.needsUpdate = M.iB.needsUpdate = M.iC.needsUpdate = true; } M.mesh.visible = M.count > 0; }
    for (const P of splatSets) { P.geo.instanceCount = P.count * P.N; P.mesh.visible = P.count > 0; if (P.count) P.bodyTex.needsUpdate = true; }
    plGeo.instanceCount = np; plMesh.visible = np > 0; if (np) plA.needsUpdate = true;
    if (CS) { for (let i = nc; i < csUsed; i++) CS.clear(i); csUsed = nc; }
    shGeo.instanceCount = ns; if (ns) { shA.needsUpdate = shB.needsUpdate = true; }
    shMesh.visible = ns > 0;
  }

  const v3 = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
  function set(i, o = {}) {
    if (i < 0 || i >= max) return;
    const b = i * SZ;
    if (o.pos) { const p = v3(o.pos); S[b] = p[0]; S[b + 1] = p[1]; S[b + 2] = p[2]; }
    if (o.yaw != null) S[b + 3] = o.yaw;
    if (o.pose != null) S[b + 4] = poseIndex(o.pose);
    if (o.pose2 != null) S[b + 5] = poseIndex(o.pose2); else if (o.pose != null && o.mix == null) S[b + 5] = S[b + 4];
    if (o.mix != null) S[b + 6] = o.mix;
    if (o.scale != null) S[b + 7] = o.scale;
    if (o.tint) { S[b + 8] = Math.max(0.85, o.tint[0]); S[b + 9] = Math.max(0.85, o.tint[1]); S[b + 10] = Math.max(0.85, o.tint[2]); }   // one look: a tint only nuances
    if (o.glow != null) S[b + 11] = o.glow;
    if (o.build != null) S[b + 12] = builds.includes(o.build) ? o.build : builds[0];
    if (o.scale != null && o.scale < 0.82 && builds.includes(2)) S[b + 12] = 2;   // a small body is a child (child proportions)
    if (o.lod != null) S[b + 13] = o.lod === 'auto' ? -1 : o.lod === 'far' || o.lod === 1 ? 1 : o.lod === 'mid' || o.lod === 2 ? 2 : 0; else if (!S[b + 14]) S[b + 13] = -1;
    if (o.pool != null) S[b + 18] = o.pool;                      // a warm pool of light on the ground under the body (0..1)
    if (o.palmGlow != null) S[b + 19] = o.palmGlow;               // a warm glow in the right palm (0..1+), lighting the forearm and chest
    if (o.form != null) S[b + 16] = o.form;                      // splats: 0 = scattered ... 1 = assembled
    if (o.fmode != null) S[b + 17] = o.fmode === 'dust' || o.fmode === 1 ? 1 : o.fmode === 'light' || o.fmode === 2 ? 2 : 0;   // 'light': up, into the light   // how they are away: 'gather' (in the air, streaming in) | 'dust' (fallen)
    S[b + 14] = o.visible === false ? 0 : 1;
  }
  const hide = (i) => { if (i >= 0 && i < max) S[i * SZ + 14] = 0; };
  const palm = (p = 'palm', build = 0) => (palms[build] || palms[builds[0]] || [])[poseIndex(p)] || [-0.13, 1.4, 0.44];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  function setColors(c = {}) { for (const k of Object.keys(c)) if (uColor[k]) uColor[k].value.set(...tokLin(c[k])); if (c.shadow) uShadow.value.set(...tokLin(c.shadow)); }
  function dispose() { for (const M of meshes) { M.geo.dispose(); M.mesh.material.dispose(); M.tex.dispose(); } shGeo.dispose(); shMat.dispose(); }
  const api = {
    object, get mesh() { return object; }, count: max, set, hide, update, palm, yawTo, setColors, setLighting, setSplat, dispose, POSES, tok: tokLin, get splatCount() { return splatSets.reduce((a, P) => a + P.count * P.N, 0); },
    ready: readyP, get isReady() { return ready; },
    uniforms: { time: uTime, crack: uCrack, rim: uRim, flash: uFlash, shadow: uShK, color: uColor, sculpt: uSculpt, eye: uEye, self: uSelf, albedo: uAlb, spec: uSpec, key: uKey, amb: uAmb },
  };
  return api;
}
