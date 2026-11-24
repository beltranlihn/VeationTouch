// Ressonància — 3D base (a test page). A night square around the room to check the CAVE projection: a floor grid that must run on
// without a break across every corner (P3 → P4 too), a ring of columns 11 m away, four towers, one per wall direction, and a hand
// as a warm light ON THE WALL PLANE, where the hand is. If the grid kinks at a corner, the projection is wrong.
import { connectExperience } from '/experiences/runtime.js';
import { createRoom3D } from '../ressonancia/scenes3d/room3d.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const P = { renderer: 'auto', eye: 1.6, bloom: 0.6, exposure: 1, grid: true, ...vt.params };
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', eyeHeight: P.eye, bloom: { strength: P.bloom }, exposure: P.exposure });
const { THREE, scene } = room;
vt.on('params', (p) => { Object.assign(P, p); room.setEye(P.eye); room.setBloom({ strength: P.bloom }); room.renderer.toneMappingExposure = P.exposure; grid.visible = !!P.grid; });

room.clearColor.set(0x05070c);
const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), new THREE.MeshBasicMaterial({ color: 0x070a14, side: THREE.BackSide, fog: false })); scene.add(sky);
scene.fog = new THREE.FogExp2(0x070910, 0.035);
scene.add(new THREE.HemisphereLight(0x8ea4c8, 0x1a120c, 0.35));
const moon = new THREE.DirectionalLight(0xb8c8ff, 0.6); moon.position.set(-8, 14, -5); scene.add(moon);

// the square's floor: worn stone, very dark
const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 96), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85, metalness: 0 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(80, 80, 0xE5B567, 0x3a3228); grid.position.y = 0.002; grid.material.transparent = true; grid.material.opacity = 0.9; grid.visible = !!P.grid; scene.add(grid);

// a ring of stone columns
const stone = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.7 });
const colGeo = new THREE.CylinderGeometry(0.35, 0.42, 7, 24);
for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2, c = new THREE.Mesh(colGeo, stone); c.position.set(Math.sin(a) * 11, 3.5, -Math.cos(a) * 11); scene.add(c); }
// four towers, one beyond each wall, with warm lamps
for (const w of room.walls) {
  const base = w.centre.clone().addScaledVector(w.normal, -8);
  for (let k = 0; k < 8; k++) { const r = 1.4 - k * 0.13, m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, 0.8, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.05, 0.5, 0.2 + k * 0.04), roughness: 0.5, emissive: new THREE.Color(0.6, 0.12, 0.03), emissiveIntensity: 0.1 + k * 0.08 })); m.position.copy(base).setY(0.4 + k * 0.82); scene.add(m); }
  const lamp = new THREE.PointLight(0xffb36b, 30, 14, 2); lamp.position.copy(base).addScaledVector(w.normal, 3).setY(3); scene.add(lamp);
}

// hands: a small warm light on the wall plane, and a soft glowing disc facing the room
const MAXL = 12, lights = [], discs = [];
const discGeo = new THREE.CircleGeometry(0.16, 32);
for (let i = 0; i < MAXL; i++) {
  const l = new THREE.PointLight(0xffc890, 0, 6, 2); scene.add(l); lights.push(l);
  const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.6), transparent: true, opacity: 0, depthWrite: false })); scene.add(d); discs.push(d);
}
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
let frames = 0, t0 = performance.now(), fps = 0;
vt.loop((dt) => {
  const hs = room.hands();
  for (let i = 0; i < MAXL; i++) {
    const h = hs[i], l = lights[i], d = discs[i];
    if (!h) { l.intensity *= 0.85; d.material.opacity *= 0.85; continue; }
    l.position.copy(h.pos).addScaledVector(h.normal, -0.4); l.intensity = 8;                       // a little behind the wall: it lights the world beyond
    d.position.copy(h.pos).addScaledVector(h.normal, -0.01); d.quaternion.copy(_q.setFromUnitVectors(_z, h.normal)); d.material.opacity = 1;
  }
  room.render(dt);
  frames++; const now = performance.now(); if (now - t0 > 1000) { fps = (frames * 1000) / (now - t0); frames = 0; t0 = now; }
}, canvas);
window.__room3d = { room, fps: () => fps, discs, debug: () => { const h = room.hands()[0]; if (!h) return null; const v = discs[0].position.clone().project(room.walls[h.wall].camera); return { wall: h.wall, u: +h.u.toFixed(3), v: +h.v.toFixed(3), pos: h.pos.toArray().map((x) => +x.toFixed(2)), ndc: v.toArray().map((x) => +x.toFixed(3)), op: discs[0].material.opacity, visible: discs[0].visible }; } };   // for the lab's checks only
