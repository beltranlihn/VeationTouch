// Ressonància — the body kit's human base (25-11, Beltrán: «real anatomy»): CC0 base meshes by Quaternius (Universal Base Characters,
// quaternius.com; assets/models/human/LICENSE-quaternius-CC0.txt), posed and skinned ONCE per pose on the CPU, in the same shape as
// body.js's bake, so bodykit.js keeps one pipeline (pose textures, splats sampled in volume).
//
//   const base = await loadHumanBases(THREE);                 // both glTFs (geometry + skin only; offline, no draco / meshopt)
//   const r = bakeHuman(THREE, base[build], specs, opt)        // → { n, index, P: [rest, …poses], N, aux, aux2, palm }
//
// Poses are written as WORLD directions of the bones (body frame: +z forward, +x the body's left, +y up), so they do not depend on the
// rig's local axes: each bone is turned, parents first, so that the segment to its child points where asked. Proportions: the free pack
// is «Superhero»; the casteller is made sturdier-ordinary — arms and thighs squashed radially round their bone, chest a little
// narrower, the child with a bigger head. The body faces +z with its feet at y = 0.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = ['Superhero_Male_FullBody.gltf', 'Superhero_Female_FullBody.gltf'];
const SKIP = /^(Face|Face\.001|Eyes|Eyebrows)$/;

export function loadHumanBases(THREE) {
  const loader = new GLTFLoader();
  return Promise.all(FILES.map((f) => new Promise((res, rej) => loader.load(new URL(`./assets/models/human/${f}`, import.meta.url).href, res, undefined, rej))));
}

// bone classes for the splats' density and depth: 0 head · 1 torso · 2 thigh · 3 limb (upper arm, shin) · 4 hand · 5 foot · 6 forearm
function classOf(name) {
  if (/^(Head|neck_01)$/.test(name)) return 0;
  if (/^(pelvis|spine_0[123]|clavicle_[lr]|root)$/.test(name)) return 1;
  if (/^thigh_/.test(name)) return 2;
  if (/^(upperarm_|calf_)/.test(name)) return 3;
  if (/^lowerarm_/.test(name)) return 6;
  if (/^(hand_|index_|middle_|ring_|pinky_|thumb_)/.test(name)) return 4;
  if (/^(foot_|ball_)/.test(name)) return 5;
  return 3;
}

// body frame directions per pose (mirrored for the right side: x → −x). `lean` (rad, forward), `head` (rad, down), `bend` knees.
const D = (x, y, z) => [x, y, z];
export const HUMAN_POSES = {
  // weight on the left leg, the right one free and a little bent; arms hanging relaxed
  stand: { lean: 0.05, head: 0.12, arms: { up: D(0.07, -1, 0.02), lo: D(0.03, -1, 0.12), hand: D(0.02, -1, 0.08) }, legs: { th: D(0.03, -1, 0.02), ca: D(0.02, -1, -0.03) },
    legR: { th: D(-0.15, -1, 0.1), ca: D(-0.06, -1, -0.14) } },
  palm: { lean: 0.1, head: 0.06, arms: { up: D(0.16, -1, 0.06), lo: D(0.1, -1, 0.16), hand: D(0.05, -1, 0.1) },
    armR: { up: D(-0.06, -0.33, 0.94), lo: D(-0.02, 0.12, 1), hand: D(0, 1, 0.25) }, legs: { th: D(0.1, -1, 0.1), ca: D(0.04, -1, -0.12) } },
  // the pinya's embrace: arms at shoulder height, elbows bent, hugging forward and in; back leaning in, head down
  lock: { lean: 0.32, head: 0.38, arms: { up: D(0.82, 0.02, 0.55), lo: D(-0.35, -0.05, 1), hand: D(-0.6, -0.15, 0.75) }, legs: { th: D(0.14, -1, 0.18), ca: D(0.06, -1, -0.2) } },
  // carrying: knees well bent, feet apart, back loaded, arms up holding the one above — effort
  carry: { lean: 0.26, head: 0.2, arms: { up: D(0.3, 0.85, 0.32), lo: D(0.06, 1, 0.1), hand: D(0, 1, 0.08) }, legs: { th: D(0.24, -0.84, 0.46), ca: D(0.1, -1, -0.36) } },
  raise: { lean: -0.03, head: -0.2, arms: { up: D(0.18, -1, 0.05), lo: D(0.12, -1, 0.15), hand: D(0.05, -1, 0.1) },
    armR: { up: D(-0.12, 1, 0.08), lo: D(-0.05, 1, 0.06), hand: D(0, 1, 0.05) }, legs: { th: D(0.17, -1, 0.12), ca: D(0.06, -1, -0.14) } },
};
export const HUMAN_BUILDS = [
  { base: 0, scale: 0.955, arm: 0.84, thigh: 0.88, chest: 0.9, head: 1.0 },      // a man
  { base: 1, scale: 0.97, arm: 0.86, thigh: 0.9, chest: 0.93, head: 1.0 },       // a woman
  { base: 1, scale: 1.0, arm: 0.8, thigh: 0.85, chest: 0.86, head: 1.38, legs: 0.8, arms: 0.86 },   // a child (instance scale 0.55–0.8): big head, short limbs
];

export function* bakeHumanGen(THREE, gltf, build, specList) {
  const { Vector3, Quaternion, Matrix4 } = THREE;
  let body = null, best = 0;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !SKIP.test(o.name)) { const n = o.geometry.attributes.position.count; if (n > best) { best = n; body = o; } } });
  if (!body) throw new Error('bodykit-gltf: no skinned body');
  gltf.scene.updateMatrixWorld(true);
  const sk = body.skeleton, bones = sk.bones, byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  const geo = body.geometry, pos0 = geo.attributes.position, n = pos0.count;
  const skinI = geo.attributes.skinIndex, skinW = geo.attributes.skinWeight;
  const index = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
  const rest = bones.map((b) => b.quaternion.clone());
  // dominant bone per vertex → class
  const cls = new Uint8Array(n), dom = new Int16Array(n);
  for (let v = 0; v < n; v++) { let bw = -1, bi = 0; for (let k = 0; k < 4; k++) { const w = skinW.getComponent(v, k); if (w > bw) { bw = w; bi = skinI.getComponent(v, k); } } dom[v] = bi; cls[v] = classOf(bones[bi].name); }
  yield;
  // proportions in bind space: radial squash of arms / thighs round their bone segment, chest narrower, the head bigger
  const bindPos = new Float32Array(pos0.array.length); bindPos.set(pos0.array);
  const wpos = (name) => { const b = bones[byName[name]]; return b ? new Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  const seg = {};
  for (const [a, b] of [['upperarm_l', 'lowerarm_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_l', 'hand_l'], ['lowerarm_r', 'hand_r'], ['thigh_l', 'calf_l'], ['thigh_r', 'calf_r'], ['calf_l', 'foot_l'], ['calf_r', 'foot_r']]) seg[a] = [wpos(a), wpos(b)];
  const head = wpos('Head'), tmp = new Vector3(), pa = new Vector3(), ab = new Vector3();
  for (let v = 0; v < n; v++) {
    const name = bones[dom[v]].name; tmp.fromArray(bindPos, v * 3);
    const s = seg[name], k = /arm/.test(name) ? build.arm : /thigh|calf/.test(name) ? build.thigh : 1;
    if (s && s[0] && s[1] && k !== 1) {
      ab.subVectors(s[1], s[0]); const L2 = ab.lengthSq(); pa.subVectors(tmp, s[0]); const t = Math.min(1, Math.max(0, pa.dot(ab) / L2));
      const c = s[0].clone().addScaledVector(ab, t); tmp.sub(c).multiplyScalar(k).add(c);
    } else if (cls[v] === 1 && tmp.y > 1.05) tmp.x *= build.chest;
    if (cls[v] === 0 && build.head !== 1 && head) tmp.sub(head).multiplyScalar(build.head).add(head);
    tmp.toArray(bindPos, v * 3);
  }
  // a child's proportions: the legs shorter (everything below the hips pulled up towards them), the arms shorter (towards the shoulder)
  if (build.legs && build.legs !== 1) {
    const hipY = wpos('thigh_l').y;
    for (let v = 0; v < n; v++) { const y = bindPos[v * 3 + 1]; if (y < hipY) bindPos[v * 3 + 1] = hipY - (hipY - y) * build.legs; }
    const shl = wpos('upperarm_l'), shr = wpos('upperarm_r');
    for (let v = 0; v < n; v++) { const c = cls[v]; if (c !== 3 && c !== 4 && c !== 6) continue; if (bindPos[v * 3 + 1] < hipY + 0.05 && c === 3) continue;
      const sh = bindPos[v * 3] > 0 ? shl : shr; for (let k = 0; k < 3; k++) bindPos[v * 3 + k] = sh.getComponent(k) + (bindPos[v * 3 + k] - sh.getComponent(k)) * build.arms; }
  }
  yield;
  // posing: aim each bone's segment (to its child) at a body-frame direction
  const q = new Quaternion(), qa = new Quaternion(), pw = new Quaternion(), bw = new Quaternion(), from = new Vector3(), to = new Vector3();
  const aim = (name, child, dir) => {
    const b = bones[byName[name]], c = bones[byName[child]]; if (!b || !c || !dir) return;
    b.parent.updateMatrixWorld(true); b.updateMatrixWorld(true); c.updateMatrixWorld(true);
    from.setFromMatrixPosition(c.matrixWorld).sub(tmp.setFromMatrixPosition(b.matrixWorld)).normalize();
    to.set(dir[0], dir[1], dir[2]).normalize();
    qa.setFromUnitVectors(from, to);
    b.getWorldQuaternion(bw); b.parent.getWorldQuaternion(pw);
    q.copy(qa).multiply(bw); b.quaternion.copy(pw.invert().multiply(q));
    b.updateMatrixWorld(true);
  };
  const turn = (name, axis, ang) => {      // a world-axis rotation of a bone (lean, head)
    const b = bones[byName[name]]; if (!b) return;
    b.parent.updateMatrixWorld(true); b.updateMatrixWorld(true);
    qa.setFromAxisAngle(to.set(axis[0], axis[1], axis[2]).normalize(), ang);
    b.getWorldQuaternion(bw); b.parent.getWorldQuaternion(pw);
    q.copy(qa).multiply(bw); b.quaternion.copy(pw.invert().multiply(q)); b.updateMatrixWorld(true);
  };
  const mir = (d) => (d ? [-d[0], d[1], d[2]] : d);
  const P = [], N = [], palm = [];
  const geoTmp = new THREE.BufferGeometry(); geoTmp.setIndex(new THREE.BufferAttribute(index, 1));
  const bindAttr = new THREE.BufferAttribute(bindPos, 3);
  const skinned = new Vector3(), boneMat = new Matrix4(), sum = new Vector3();
  for (const sp of specList) {
    bones.forEach((b, i) => b.quaternion.copy(rest[i]));
    gltf.scene.updateMatrixWorld(true);
    if (sp) {
      turn('spine_01', [1, 0, 0], sp.lean * 0.5); turn('spine_02', [1, 0, 0], sp.lean * 0.5);
      for (const [sd, A, Lg] of [['l', sp.arms, sp.legs], ['r', sp.armR ? null : sp.arms, sp.legs]]) {
        const m = (d) => (sd === 'r' ? mir(d) : d);
        const arm = sd === 'r' && sp.armR ? sp.armR : A;
        if (arm) { aim('upperarm_' + sd, 'lowerarm_' + sd, sd === 'r' && sp.armR ? arm.up : m(arm.up)); aim('lowerarm_' + sd, 'hand_' + sd, sd === 'r' && sp.armR ? arm.lo : m(arm.lo)); aim('hand_' + sd, 'middle_01_' + sd, sd === 'r' && sp.armR ? arm.hand : m(arm.hand)); }
        const LL = sd === 'r' && sp.legR ? sp.legR : Lg, mm = sd === 'r' && sp.legR ? (d) => d : m;
        if (LL) { aim('thigh_' + sd, 'calf_' + sd, mm(LL.th)); aim('calf_' + sd, 'foot_' + sd, mm(LL.ca)); }
      }
      turn('neck_01', [1, 0, 0], sp.head * 0.5); turn('Head', [1, 0, 0], sp.head * 0.5);
      if (sp.armR) { aim('upperarm_r', 'lowerarm_r', sp.armR.up); aim('lowerarm_r', 'hand_r', sp.armR.lo); aim('hand_r', 'middle_01_r', sp.armR.hand); }
    }
    gltf.scene.updateMatrixWorld(true); sk.update();
    yield;
    // skin (bind positions with the proportions) → posed positions
    const out = new Float32Array(n * 3); let minY = 1e9;
    for (let v = 0; v < n; v++) {
      tmp.fromArray(bindPos, v * 3).applyMatrix4(body.bindMatrix); sum.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = skinW.getComponent(v, k); if (!w) continue;
        const bi = skinI.getComponent(v, k);
        boneMat.multiplyMatrices(bones[bi].matrixWorld, sk.boneInverses[bi]);
        skinned.copy(tmp).applyMatrix4(boneMat).multiplyScalar(w); sum.add(skinned);
      }
      sum.applyMatrix4(body.bindMatrixInverse).applyMatrix4(body.matrixWorld);
      out[v * 3] = sum.x * build.scale; out[v * 3 + 1] = sum.y * build.scale; out[v * 3 + 2] = sum.z * build.scale;
      if (out[v * 3 + 1] < minY) minY = out[v * 3 + 1];
      if (v % 2500 === 0) yield;
    }
    for (let v = 0; v < n; v++) out[v * 3 + 1] -= minY;
    geoTmp.setAttribute('position', new THREE.BufferAttribute(out, 3)); geoTmp.computeVertexNormals();
    const nrm = new Float32Array(geoTmp.attributes.normal.array);
    // the head lit as one round volume (the eye sockets of the base mesh would read as a skull): normals from the head's centre
    const hd = wpos('Head'); if (hd) { const hx = hd.x * build.scale, hy = hd.y * build.scale - minY + 0.09 * build.head, hz = hd.z * build.scale + 0.02;
      for (let v = 0; v < n; v++) if (cls[v] === 0) { const dx = out[v * 3] - hx, dy = out[v * 3 + 1] - hy, dz = out[v * 3 + 2] - hz, l = Math.hypot(dx, dy, dz) || 1; nrm[v * 3] = dx / l; nrm[v * 3 + 1] = dy / l; nrm[v * 3 + 2] = dz / l; } }
    P.push(out); N.push(nrm);
    const h = wpos('hand_r'), mm = wpos('middle_01_r');
    palm.push(h && mm ? [((h.x + mm.x) / 2) * build.scale, ((h.y + mm.y) / 2) * build.scale - minY, ((h.z + mm.z) / 2) * build.scale] : [-0.25, 1.36, 0.4]);
    yield;
  }
  bones.forEach((b, i) => b.quaternion.copy(rest[i])); gltf.scene.updateMatrixWorld(true);
  // per-vertex aux in body.js's shape: aux (border 1, breath, region, ao) · aux2 (class, mottle, hair 0, feet)
  const R0 = P[0], aux = new Float32Array(n * 4), aux2 = new Float32Array(n * 4);
  const H = Math.max(...Array.from({ length: n }, (_, v) => R0[v * 3 + 1]));
  for (let v = 0; v < n; v++) {
    const y = R0[v * 3 + 1] / H, c = cls[v];
    const faixa = c === 1 && y > 0.54 && y < 0.63;
    aux[v * 4] = 1; aux[v * 4 + 1] = c === 1 ? 1 : c === 0 ? 0.5 : 0.25; aux[v * 4 + 2] = c === 0 || c === 4 ? 0 : faixa ? 3 : y < 0.53 ? 2 : 1; aux[v * 4 + 3] = 1;
    aux2[v * 4] = c; aux2[v * 4 + 1] = 0.5; aux2[v * 4 + 2] = 0; aux2[v * 4 + 3] = c === 5 ? 1 : 0;
  }
  return { n, index, P, N, aux, aux2, palm, cls, height: H };
}
