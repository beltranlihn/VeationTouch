// Ressonància — diable v2 turntable: the devils up close on a plain dark ground, no room (the model check next to the reference).
//   ?mode=turn   front, 3/4, profile, back in the rest pose (the reference's turnaround)       (default)
//   ?mode=pose   the same four views, dancing in place          ?mode=dance | run   one devil, the camera follows
//   ?k=0..1 / ?dis=0..1 hold assemble / dissolve      ?gl=1 WebGL2      window.__tt = { D, slots }
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createDiables } from '../diable2.js';

const Q = new URLSearchParams(location.search);
const mode = Q.get('mode') || 'turn';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: Q.get('gl') === '1' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(Math.max(2, innerWidth), Math.max(2, innerHeight), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
await renderer.init();
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x151210);
const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.1, 100);
const world = new THREE.Group(); scene.add(world);
const { uniform, vec3, Fn } = TSL;
const U = { time: uniform(0), leave: uniform(0), devils: uniform(1), refl: uniform(0.5) };
const mirP = Q.get('mirror') === '1' ? Fn(([p]) => vec3(p.x, p.y.negate(), p.z)) : null;
const ringPoint = (s, d, out) => (out.set(s, 0, -d), 10);
const eye = new THREE.Vector3(0, 1.6, 30);
const D = createDiables({ THREE, TSL, room: null, world, U, mirP, CHROME: null, fireRamp: null, emit: null, MAXD: 4, ringPoint, eye });
const slots = []; for (let i = 0; i < 4; i++) slots.push({ on: false, s: 0, d: 0, h: 1, k: 1, dis: 0, hop: 0, gain: 1, style: 0, age: 0, born: i * 1.37 });
const xs = [-1.35, -0.45, 0.45, 1.35], faces = [0, -40, -90, 180].map((a) => a * Math.PI / 180);
if (mode === 'turn' || mode === 'pose') xs.forEach((x, i) => Object.assign(slots[i], { on: true, s: x, face: faces[i], rest: mode === 'turn' }));
else Object.assign(slots[0], { on: true, s: 0, spd: mode === 'run' ? 3.0 : 1.4 });
camera.position.set(0, 0.95, 9.2); camera.lookAt(0, 0.95, 0);
const holdK = Q.has('k') ? +Q.get('k') : null, holdDis = Q.has('dis') ? +Q.get('dis') : null;
let time = 0, last = performance.now();
let vw = 0, vh = 0;
const fit = () => {                                                       // follow the window (and wait while it is 0 × 0)
  const w = innerWidth, h = innerHeight;
  if (w < 2 || h < 2 || (w === vw && h === vh)) return w >= 2 && h >= 2;
  vw = w; vh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  return true;
};
renderer.setAnimationLoop(() => {
  if (!fit()) return;
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  for (const sl of slots) if (sl.on) {
    sl.age += dt;
    if (sl.spd) { sl.s += sl.spd * dt * (mode === 'dance' ? 0.6 + 0.4 * Math.sin(time * 0.4) : 1); }
    if (holdK !== null) sl.k = holdK; if (holdDis !== null) sl.dis = holdDis;
  }
  if (mode === 'dance' || mode === 'run') { camera.position.set(slots[0].s + 0.6, 1.0, 5.5); camera.lookAt(slots[0].s, 0.9, 0); }
  U.time.value = time;
  D.update(dt, time, slots);
  renderer.render(scene, camera);
});
if (Q.get('motes') === '0' || (mode === 'turn' && Q.get('motes') !== '1')) for (const m of D.meshes) if (m.material.blending === THREE.AdditiveBlending) m.visible = false, m.layers.set(31);
window.__tt = { D, slots };
