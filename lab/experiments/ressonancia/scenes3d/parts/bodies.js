// Ressonància — study part «bodies» (Modelling, M1): the body kit (../bodykit.js) alone on a lit floor. Three bodies behind each wall
// (12), the five poses, two builds and a child; each looks at the eye. A hand on a wall: the nearest body turns to it and offers its
// palm. Study only (the work's chapters use bodykit through their own parts).
// Params: depth (m behind the wall), pose (all | one), crack, rim, light, floor.
import { createBodies, POSES } from '../bodykit.js';

export function create({ THREE, TSL, room, params }) {
  const P = params || {};
  const object = new THREE.Group(); object.name = 'bodies';
  const kit = createBodies({ THREE, TSL, room, max: 24, lods: [0, 1] });
  object.add(kit.object);
  const K0 = kit.uniforms.key.value.clone();
  // no light of its own: the bodies are self-lit (as in the work); the floor is a basic gradient
  // the floor: warm lime (cal-foc), lit by the recipe; a soft darkening far away so the horizon is not a hard line
  const lin = (h) => new THREE.Color(h);
  const floorMat = new THREE.MeshBasicNodeMaterial();
  { const { positionWorld, length, smoothstep, mix, vec3, float } = TSL;
    const d = length(positionWorld.xz), far = smoothstep(6, 26, d);
    // night (25-11): a dark stone floor with a warm pool of light round each wall's bodies
    floorMat.colorNode = mix(vec3(0.045, 0.04, 0.045), vec3(0.012, 0.016, 0.03), far); }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96).rotateX(-Math.PI / 2), floorMat); floor.name = 'bodies:floor';
  object.add(floor);
  room.setBackground?.('pinya');

  // the POSE SHEET (25-11, for Beltrán's approval): on every wall the five poses and a child, side by side, near the wall plane
  // (a 1.7 m body fills ~45 % of the wall), alternating man / woman
  const slots = [];
  const SHEET = [['stand', 0, 1], ['palm', 1, 1], ['lock', 0, 1], ['carry', 1, 1], ['raise', 0, 1], ['stand', 2, 0.66]];
  room.walls.forEach((w, wi) => {
    SHEET.forEach(([pose, build, scale], k) => {
      slots.push({ i: wi * SHEET.length + k, wi, u: 0.12 + k * 0.152, pose, build, scale });
    });
  });
  const tmp = new THREE.Vector3();
  function place(dt) {
    const depth = P.depth ?? 0.15, poseSel = P.pose || 'all';
    for (const s of slots) {
      const w = room.walls[s.wi];
      tmp.copy(w.centre).addScaledVector(w.right, (s.u - 0.5) * w.width).addScaledVector(w.normal, -depth);
      s.x = tmp.x; s.z = tmp.z;
      const pose = poseSel === 'all' ? s.pose : poseSel;
      const yaw = Math.atan2(room.eye.x - s.x, room.eye.z - s.z);
      kit.set(s.i, { pos: [s.x, 0, s.z], yaw, pose, pose2: pose, mix: 0, scale: s.scale, build: s.scale < 0.8 ? 2 : s.build, lod: P.lod === 'far' ? 'far' : 'near', pool: 0.7 });
    }
  }
  const touched = new Map();   // slot → 0..1
  return {
    object,
    update(dt, input) {
      place(dt);
      kit.uniforms.crack.value = P.crack ?? 0.35; kit.uniforms.rim.value = P.rim ?? 0.55;
      kit.uniforms.key.value.copy(K0).multiplyScalar(P.light ?? 1);
      floor.visible = P.floor !== false;
      // a hand: the nearest body on that wall offers its palm (pose blend toward 'palm')
      for (const s of slots) touched.set(s, Math.max(0, (touched.get(s) || 0) - dt * 0.6));
      for (const h of input.hands || []) {
        let best = null, bd = 1e9;
        for (const s of slots) if (s.wi === h.wall) { const d = Math.hypot(s.x - h.pos.x, s.z - h.pos.z); if (d < bd) { bd = d; best = s; } }
        if (best) touched.set(best, Math.min(1, (touched.get(best) || 0) + dt * 2.6));
      }
      for (const s of slots) { const k = touched.get(s) || 0; if (k > 0) kit.set(s.i, { pose2: 'palm', mix: k * k * (3 - 2 * k), glow: 0 }); }
      kit.update(dt);
    },
    dispose() { kit.dispose(); },
  };
}
