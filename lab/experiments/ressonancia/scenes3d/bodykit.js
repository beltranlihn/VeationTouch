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
export function createBodies({ THREE, TSL, room, max = 64, nearDist = 4.6, colors = {}, material = null, seed = 7, lods = [0, 1], builds = [0, 1, 2], render = 'splat', splats = [7000, 1600] } = {}) {
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
  const CS = room?.contactShadows ? room.contactShadows(max) : null;   // the room's contact discs (the chapter's shadow colour); the kit draws the cast
  if (CS) object.add(CS.mesh);
  let csUsed = 0, fakeCast = true;
  // 'self': lit by the kit alone (no scene light) + its own soft cast shadow · 'scene': a chapter with a real key and shadow map (the
  // lit square: room.keyShadow) — the albedo takes the real light, the self light becomes a fill, the fake cast shadow goes
  function setLighting(mode = 'self') {
    if (mode === 'scene') { uSelf.value = 0.35; uAlb.value = 0.95; fakeCast = false; } else { uSelf.value = 1; uAlb.value = 0.35; fakeCast = true; }
  }

  // ================================================================================================ SPLATS (25-11, Beltrán: particles)
  // Each body is drawn as N soft oriented splats sampled on its baked surface (area-weighted, random barycentric: a continuous volume,
  // not the vertex lattice). Every splat is baked in the five poses (half-float texture, like the mesh), so the GPU blends poses the
  // same way. One instanced quad per splat; the instance index gives (body, splat); the bodies' state is a small float texture written
  // each frame. Lit per splat in the vertex stage (key from the upper left of the eye: warm; the far side falls to the chapter's deep
  // blue; a cool rim), a gaussian footprint in the surface's plane, back-facing splats culled. They have a HOME: `form` 0..1 brings
  // them in from the air (each with its own delay: a stream, stretched along its flight) or lets them fall as dust ('dust'); they breathe.
  const splatSets = [];   // { build, lod, N, rows, tex, bodyTex, bodyData, geo, mesh, count }
  const uSize = uniform(1), uOpacity = uniform(0.9), uDrift = uniform(1), uFlow = uniform(1);
  const uSKey = uniform(new THREE.Vector3(...palLin('cal-fanal', 1.25))), uSAmb = uniform(new THREE.Vector3(...palLin('blau-plaça', 0.55)));
  const uSRim = uniform(new THREE.Vector3(...palLin('lluna', 0.55))), uSGlow = uniform(0.18);
  const quad = new THREE.PlaneGeometry(2, 2);
  function* bakeSplats(r, B, b, l, vAux, vAux2) {
    const N = splats[l] ?? 2000, rows = Math.ceil(N / TW), NP = POSES.length, idx = r.index, R0 = r.P[0];
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
    for (let k = 0; k < N; k++) {
      const x = rnd() * acc; let lo = 0, hi = tri - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < x) lo = m + 1; else hi = m; }
      let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      pick.push([lo, 1 - u - v, u, v]);
    }
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
    // aux (from the vertex with the largest weight): region, ao, rnd, crack · aux2: hair, feet, breath, size jitter
    for (let k = 0; k < N; k++) {
      const [t, w0, w1, w2] = pick[k], vi = idx[t * 3 + (w0 >= w1 && w0 >= w2 ? 0 : w1 >= w2 ? 1 : 2)];
      put(2 * NP, k, vAux[vi * 4 + 2], vAux[vi * 4 + 3], rnd(), vAux[vi * 4]);
      put(2 * NP + 1, k, vAux2[vi * 4 + 2], vAux2[vi * 4 + 3], vAux[vi * 4 + 1], rnd());
    }
    const tex = new THREE.DataTexture(data, TW, rows * (2 * NP + 2), THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const bodyData = new Float32Array(4 * max * 4);
    const bodyTex = new THREE.DataTexture(bodyData, 4, max, THREE.RGBAFormat, THREE.FloatType);
    bodyTex.minFilter = bodyTex.magFilter = THREE.NearestFilter; bodyTex.generateMipmaps = false; bodyTex.needsUpdate = true;
    const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    geo.instanceCount = 0;
    const spacing = Math.sqrt(acc / N);          // the samples' spacing on this body (m): the splat's size
    const mesh = new THREE.Mesh(geo, splatMaterial(tex, bodyTex, N, rows, spacing));
    mesh.frustumCulled = false; mesh.name = `bodykit:splats:b${b}l${l}`; mesh.renderOrder = 2;
    object.add(mesh);
    yield;
    return { build: b, lod: l, N, rows, tex, bodyTex, bodyData, geo, mesh, count: 0 };
  }
  function splatMaterial(tex, bodyTex, N, rows, spacing) {
    const { instanceIndex, positionGeometry, cross, step, fract, select, cos } = TSL;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const NP = POSES.length;
    const ii = int(instanceIndex), bi = ii.div(int(N)), si = ii.mod(int(N));
    const B0 = textureLoad(bodyTex, ivec2(0, bi)), B1 = textureLoad(bodyTex, ivec2(1, bi)), B2 = textureLoad(bodyTex, ivec2(2, bi)), B3 = textureLoad(bodyTex, ivec2(3, bi));
    const tx = si.mod(int(TW)), ty = si.div(int(TW));
    const blk = (k) => textureLoad(tex, ivec2(tx, ty.add(k.mul(int(rows)))));
    const pa = int(B1.x).mul(2), pb = int(B1.y).mul(2);
    const pA = blk(pa).xyz, pB = blk(pb).xyz, nA = blk(pa.add(1)).xyz, nB = blk(pb.add(1)).xyz;
    const AX = blk(int(2 * NP)), AX2 = blk(int(2 * NP + 1));          // AX: region, ao, rnd, crack · AX2: hair, feet, breath, jitter
    const rr = AX.z, jit = AX2.w;
    const yaw = B0.w, cy = TSL.cos(yaw), sy = TSL.sin(yaw);
    const X = vec3(cy, 0, sy.negate()), F = vec3(sy, 0, cy);
    const rotY = (v) => X.mul(v.x).add(vec3(0, v.y, 0)).add(F.mul(v.z));
    const sc = B1.w;
    let pl = mix(pA, pB, B1.z).add(vec3(0, Y0, 0));
    const nl = normalize(mix(nA, nB, B1.z));
    // breath and drift (tiny, slow, each splat its own phase)
    const ph = rr.mul(61.7), t = uTime;
    const drift = vec3(sin(t.mul(0.61).add(ph)), sin(t.mul(0.83).add(ph.mul(1.7))), sin(t.mul(0.71).add(ph.mul(2.3)))).mul(0.0045).mul(uDrift);
    pl = pl.add(drift).add(nl.mul(sin(t.mul(1.7).add(B0.x.mul(1.3)).add(B0.z.mul(0.7))).mul(AX2.z).mul(0.005)));
    // home: form 0..1, each splat with its own delay (a stream); away = in the air behind and above (gather) or fallen (dust)
    const form = B3.x, dust = B3.y;
    const k = clamp(form.mul(1.7).sub(rr.mul(0.7)), 0, 1), ke = k.mul(k).mul(float(3).sub(k.mul(2)));
    const away = float(1).sub(ke);
    const dirG = normalize(vec3(sin(rr.mul(91.3)), sin(rr.mul(53.1)).mul(0.5).add(0.45), cos(rr.mul(91.3)).sub(1.2)));      // mostly behind (-z) and up
    const offG = dirG.mul(float(1.1).add(fract(rr.mul(13.7)).mul(2.4))).add(vec3(sin(t.mul(0.9).add(ph)), 0, cos(t.mul(0.9).add(ph))).mul(0.25).mul(away));
    const offD = vec3(sin(ph).mul(0.35), pl.y.negate().add(0.02), cos(ph).mul(0.35));       // dust: down to the floor, spread a little
    const off = mix(offG, offD, dust).mul(away).mul(uFlow);
    const home = pl.add(off);
    const C = rotY(home.mul(sc)).add(B0.xyz);
    const nW = rotY(nl);
    // the footprint: a disc in the surface's plane, stretched along the stream while it flows
    const flowing = away.mul(ke).mul(4).clamp(0, 1).mul(float(1).sub(dust));
    const up0 = select(abs(nW.y).lessThan(0.92), vec3(0, 1, 0), vec3(1, 0, 0));
    const t1 = normalize(cross(nW, up0)), t2 = cross(nW, t1);
    const flowDir = normalize(rotY(offG).add(vec3(0, 0.0001, 0)));
    const a1 = normalize(mix(t1, flowDir, flowing)), a2 = normalize(cross(nW, a1).add(t2.mul(0.001)));
    const toCam = normalize(cameraPosition.sub(C)), facing = dot(nW, toCam);
    const vis = smoothstep(-0.25, 0.05, facing).max(away);                         // back-facing splats culled (not while they fly)
    const r0 = float(spacing * 1.55).mul(jit.mul(0.7).add(0.65)).mul(sc).mul(uSize).mul(vis);
    const q = positionGeometry.xy;
    m.positionNode = C.add(a1.mul(q.x.mul(r0).mul(float(1).add(flowing.mul(5))))).add(a2.mul(q.y.mul(r0)));
    // colour: region albedo, lit per splat (warm key from the upper left of the eye, deep blue on the far side, cool rim), gold glow
    const reg = AX.x, w0 = float(1).sub(smoothstep(0.35, 0.65, reg)), w3 = smoothstep(2.35, 2.65, reg);
    const w2 = smoothstep(1.35, 1.65, reg).mul(float(1).sub(w3)), w1 = float(1).sub(w0).sub(w2).sub(w3).max(0);
    let alb = uColor.skin.mul(w0).add(uColor.shirt.mul(w1)).add(uColor.trousers.mul(w2)).add(uColor.faixa.mul(w3));
    alb = mix(alb, uColor.hair.mul(0.6), step(0.5, AX2.x));
    alb = alb.mul(B2.xyz).mul(mix(float(0.45), float(1), AX.y));
    const tE = normalize(vec3(uEye.x.sub(C.x), 0, uEye.z.sub(C.z))), side = vec3(tE.z, 0, tE.x.negate());
    const Lk = normalize(side.mul(-0.75).add(vec3(0, 0.85, 0)).add(tE.mul(0.45)));
    const wrapK = clamp(dot(nW, Lk).mul(0.6).add(0.4), 0, 1);
    const fres = pow(float(1).sub(abs(facing)), 2.5);
    let colr = alb.mul(uSAmb.add(uSKey.mul(wrapK.mul(wrapK)))).add(uSRim.mul(fres)).add(alb.mul(uSKey).mul(uSGlow).mul(wrapK));
    if (room?.flash) colr = colr.add(uColor.shirt.mul(room.flash(C)).mul(0.5));
    colr = colr.add(uColor.glow.mul(B2.w).mul(1.4)).add(uColor.glow.mul(flowing).mul(0.12));
    const vCol = varying(colr, 'vSplCol'), vA = varying(vis.mul(uOpacity).mul(float(1).sub(away.mul(0.45))), 'vSplA');
    const qd = uv().sub(0.5).mul(2), d2 = dot(qd, qd);
    m.colorNode = vCol;
    m.opacityNode = exp(d2.mul(-3.2)).sub(0.041).max(0).mul(vA);
    m.alphaTest = 0.01;
    return m;
  }
  function setSplat(o = {}) {
    if (o.size != null) uSize.value = o.size;
    if (o.opacity != null) uOpacity.value = o.opacity;
    if (o.drift != null) uDrift.value = o.drift;
    if (o.flow != null) uFlow.value = o.flow;
    if (o.glow != null) uSGlow.value = o.glow;
    if (o.key) uSKey.value.set(...tokLin(o.key));
    if (o.amb) uSAmb.value.set(...tokLin(o.amb));
    if (o.rim) uSRim.value.set(...tokLin(o.rim));
    if (o.blend) for (const P of splatSets) { P.mesh.material.blending = o.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending; P.mesh.material.needsUpdate = true; }
  }

  // ---- the bake, sliced in the background (≈ 4 ms per slice)
  const palms = {};       // `${build}` → [pose][x,y,z]
  let ready = false, resolveReady;
  const readyP = new Promise((r) => { resolveReady = r; });
  const jobs = [];
  for (const b of builds) for (const l of lods) jobs.push({ b, l });
  function* bakeAll() {
    const specs = [REST, ...POSES.map((k) => POSE_SPECS[k])];
    for (const { b, l } of jobs) {
      const B = BUILDS[b], L = LODS[l];
      const r = yield* bakeBodyGen(B, REST, specs, { grid: L.grid, detail: L.detail, seed: seed + b * 31 + l * 7, shards: L.shards });
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
      const aux = new Float32Array(n * 4), aux2 = new Float32Array(n * 4), R0 = r.P[0], hc = skeleton(REST, B).headC, hk = B.head ?? 1;
      for (let v = 0; v < n; v++) {
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
    let ns = 0, nc = 0;
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
      if (SP) { const j = SP.count++, D = SP.bodyData; D.set([x, y, z, S[o + 3], S[o + 4], S[o + 5], S[o + 6], sc, S[o + 8], S[o + 9], S[o + 10], S[o + 11], S[o + 16], S[o + 17], S[o + 15], 0], j * 16); }
      if (y < 0.05 && ns < max * 2 - 1) {    // shadows only for bodies standing on the floor
        const lift = Math.max(0, y);
        // contact: round, tight, dark (sB: length, width, offset, soft) — the room's disc when it has them
        if (CS) CS.set(nc++, x, z, 0.36 * sc, 0.75 * (1 - lift * 8));
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
    if (o.tint) { S[b + 8] = o.tint[0]; S[b + 9] = o.tint[1]; S[b + 10] = o.tint[2]; }
    if (o.glow != null) S[b + 11] = o.glow;
    if (o.build != null) S[b + 12] = builds.includes(o.build) ? o.build : builds[0];
    if (o.scale != null && o.scale < 0.82 && builds.includes(2)) S[b + 12] = 2;   // a small body is a child (child proportions)
    if (o.lod != null) S[b + 13] = o.lod === 'auto' ? -1 : (o.lod === 'far' || o.lod === 1 ? 1 : 0); else if (!S[b + 14]) S[b + 13] = -1;
    if (o.form != null) S[b + 16] = o.form;                      // splats: 0 = scattered ... 1 = assembled
    if (o.fmode != null) S[b + 17] = o.fmode === 'dust' || o.fmode === 1 ? 1 : 0;   // how they are away: 'gather' (in the air, streaming in) | 'dust' (fallen)
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
