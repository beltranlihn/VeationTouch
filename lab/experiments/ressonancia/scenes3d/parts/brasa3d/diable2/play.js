// Ressonància — diable v2 play: click the floor and a devil builds up from the embers there, then runs the ring (the relay's
// pace, 2.6–3.4 m/s), leaping now and then; after ~14 s it dissolves into sparks. Shift+click: it stays and dances.
// A stand-in for what brasa3d gives the devils: a ring round the eye (BRA's ringPoint), a black water floor with a plain mirror,
// a small CPU spark pool behind BRA's `emit` signature. Lab tool only.
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createDiables } from '../diable2.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(Math.max(2, innerWidth), Math.max(2, innerHeight), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
await renderer.init();
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0908);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 5.2, 10.5); camera.lookAt(0, 0.6, 0);
const world = new THREE.Group(); scene.add(world);
const { uniform, vec3, vec4, vec2, float, Fn, attribute, positionGeometry, modelViewMatrix, cameraProjectionMatrix, mix, max, length, uv, exp, smoothstep, select, abs } = TSL;

// the ring: like the room's perimeter, a circle round the eye; s = metres along it, d = metres beyond it
const R = 4.2, eye = new THREE.Vector3(0, 1.6, 0);
const ringPoint = (s, d, out) => { const a = s / R, r = R + d; out.set(Math.cos(a) * r, 0, Math.sin(a) * r); return R; };

// the water: black, a faint ring of embers on it, the devils drawn again in a plain mirror
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicNodeMaterial({ depthWrite: false }));
floor.rotation.x = -Math.PI / 2;
{ const p = attribute('position', 'vec3'), r = length(vec2(p.x, p.y)), band = exp(r.sub(R).mul(r.sub(R)).mul(-6));
  floor.material.colorNode = vec3(0.004, 0.0035, 0.003).add(vec3(0.05, 0.012, 0.003).mul(band)); }
world.add(floor);
const U = { time: uniform(0), leave: uniform(0), devils: uniform(1), refl: uniform(0.9) };
const mirP = Fn(([p]) => vec3(p.x, p.y.negate(), p.z));

// a small CPU spark pool with brasa3d's emit() signature
const NS = 12000, sp = new Float32Array(NS * 4), sv = new Float32Array(NS * 4), sk = new Float32Array(NS * 4);
let cur = 0;
function emit(n, px, py, pz, spread, dx, dy, dz, cone, vmin, vmax, lmin, lmax, heat, g, drag, ix = 0, iy = 0, iz = 0) {
  n = Math.floor(n); const l = Math.hypot(dx, dy, dz) || 1;
  for (let j = 0; j < n; j++) {
    const i = cur; cur = (cur + 1) % NS;
    let ux = dx / l + (Math.random() * 2 - 1) * cone, uy = dy / l + (Math.random() * 2 - 1) * cone, uz = dz / l + (Math.random() * 2 - 1) * cone;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const s = vmin + (vmax - vmin) * Math.pow(Math.random(), 1.4), k = 0.6 + 0.4 * Math.random();
    sp.set([px + (Math.random() - 0.5) * spread, py + (Math.random() - 0.5) * spread, pz + (Math.random() - 0.5) * spread, 0], i * 4);
    sv.set([ux * s + ix * k, uy * s + iy * k, uz * s + iz * k, lmin + (lmax - lmin) * Math.random()], i * 4);
    sk.set([heat * (0.75 + 0.3 * Math.random()), g, drag, 0], i * 4);
  }
}
const sg = new THREE.InstancedBufferGeometry();
sg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); sg.setIndex([0, 1, 2, 0, 2, 3]);
const aP = new THREE.InstancedBufferAttribute(sp, 4), aV = new THREE.InstancedBufferAttribute(sv, 4), aK = new THREE.InstancedBufferAttribute(sk, 4);
for (const a of [aP, aV, aK]) a.setUsage(THREE.DynamicDrawUsage);
sg.setAttribute('aP', aP); sg.setAttribute('aV', aV); sg.setAttribute('aK', aK); sg.instanceCount = NS;
for (const mirror of [false, true]) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const P4 = attribute('aP', 'vec4'), V4 = attribute('aV', 'vec4'), K4 = attribute('aK', 'vec4');
  const alive = P4.w.lessThan(V4.w), x = P4.w.div(max(V4.w, 1e-3));
  const p1 = mirror ? mirP(P4.xyz) : P4.xyz, v = mirror ? vec3(V4.x, V4.y.negate(), V4.z) : V4.xyz;
  const a = modelViewMatrix.mul(vec4(p1.sub(v.mul(0.022)), 1)), b = modelViewMatrix.mul(vec4(p1, 1));
  const ax = b.xy.sub(a.xy), al = max(length(ax), 1e-5), perp = vec2(ax.y.negate(), ax.x).div(al);
  const mv = mix(a, b, positionGeometry.y.add(0.5)), w = max(float(0.006), mv.z.negate().mul(0.0016));
  m.vertexNode = select(alive, cameraProjectionMatrix.mul(vec4(mv.xy.add(perp.mul(positionGeometry.x.mul(w))), mv.z, 1)), vec4(0, 0, 2, 1));
  const T = K4.x.mul(float(1).sub(x));
  const c = mix(mix(vec3(0.25, 0.012, 0.004), vec3(1, 0.19, 0.01), smoothstep(0.2, 0.9, T)), vec3(1, 0.82, 0.43), smoothstep(1.0, 1.8, T)).mul(T.mul(0.8));
  const q = uv().x.sub(0.5);
  m.colorNode = c.mul(exp(q.mul(q).mul(-12))).mul(float(0.006).div(w)).mul(mirror ? 0.45 : 1);
  const mesh = new THREE.Mesh(sg, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 4; world.add(mesh);
}
function stepSparks(dt) {
  for (let i = 0; i < NS; i++) {
    const o = i * 4; if (sp[o + 3] >= sv[o + 3]) continue;
    const dr = Math.exp(-sk[o + 2] * dt);
    sv[o + 1] -= 9.8 * sk[o + 1] * dt; sv[o] *= dr; sv[o + 1] *= dr; sv[o + 2] *= dr;
    sp[o] += sv[o] * dt; sp[o + 1] += sv[o + 1] * dt; sp[o + 2] += sv[o + 2] * dt; sp[o + 3] += dt;
    if (sp[o + 1] < 0.004 && sv[o + 1] < 0) { sp[o + 1] = 0.004; sv[o] *= 0.5; sv[o + 1] *= -0.3; sv[o + 2] *= 0.5; sk[o] *= 0.82; }
  }
  aP.needsUpdate = true; aV.needsUpdate = true; aK.needsUpdate = true;
}

// the devils, mounted the way brasa3d mounts them; the slots are BRA-like and moved here
const MAXD = 14;
const D = createDiables({ THREE, TSL, room: null, world, U, mirP, CHROME: vec3(1.0, 0.93, 0.84), fireRamp: null, emit, MAXD, ringPoint, eye });
const slots = []; for (let i = 0; i < MAXD; i++) slots.push({ on: false, s: 0, d: 0, h: 1, k: 0, dis: 0, hop: 0, gain: 1, style: 0, age: 0, born: i * 1.37 });
let order = 0;
function spawn(x, z, stay) {
  let i = slots.findIndex((sl) => !sl.on);
  if (i < 0) { i = slots.reduce((b, sl, j) => (sl.order < slots[b].order ? j : b), 0); }   // all busy: the oldest makes room
  const a = Math.atan2(z, x), r = Math.hypot(x, z);
  Object.assign(slots[i], { on: true, s: a * R, d: Math.max(-2.5, Math.min(3, r - R)), h: 0.95 + Math.random() * 0.1, k: 0, dis: 0, hop: 0, gain: 1,
    style: Math.random() < 0.5 ? 0 : 1, age: 0, born: Math.random() * 100, stay, dir: Math.random() < 0.5 ? 1 : -1, spd: 0,
    top: 2.6 + Math.random() * 0.8, life: stay ? 1e9 : 13 + Math.random() * 3, nextHop: 3 + Math.random() * 3, hopT: -1, order: order++ });
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) spawn(hit.x, hit.z, e.shiftKey);
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); for (const sl of slots) if (sl.on && sl.hopT < 0 && sl.k >= 1) sl.hopT = 0; }
  if (e.key === 'x' || e.key === 'X') for (const sl of slots) if (sl.on) sl.life = Math.min(sl.life, sl.age);
});

let vw = 0, vh = 0;
const fit = () => {
  const w = innerWidth, h = innerHeight;
  if (w < 2 || h < 2) return false;
  if (w !== vw || h !== vh) { vw = w; vh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  return true;
};
const nEl = document.getElementById('n');
let time = 0, last = performance.now();
renderer.setAnimationLoop(() => {
  if (!fit()) return;
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  let n = 0;
  for (const sl of slots) {
    if (!sl.on) continue;
    n++;
    sl.age += dt;
    sl.k = Math.min(1, sl.k + dt / 0.9);                                   // builds up from the embers (0.9 s)
    if (sl.age > sl.life) sl.dis = Math.min(1, sl.dis + dt / 1.8);           // dissolves into sparks (1.8 s)
    if (sl.dis >= 1) { sl.on = false; continue; }
    // after it has built up, it sets off at the relay's pace (eased in), or dances on the spot
    const go = sl.stay ? 0 : Math.min(1, Math.max(0, (sl.age - 1.4) / 1.2));
    sl.spd = sl.top * go * go * (3 - 2 * go) * (1 - sl.dis);
    sl.s += sl.dir * sl.spd * dt * R / (R + sl.d);
    // a leap now and then while running (the relay's leap: slot.hop, metres)
    if (!sl.stay && sl.hopT < 0 && go >= 1 && sl.age > sl.nextHop) { sl.hopT = 0; sl.nextHop = sl.age + 3 + Math.random() * 4; }
    if (sl.hopT >= 0) { sl.hopT += dt; const u = sl.hopT / 0.55; sl.hop = u < 1 ? Math.sin(Math.PI * u) * 0.45 : 0; if (u >= 1) sl.hopT = -1; }
  }
  nEl.textContent = n;
  U.time.value = time;
  D.update(dt, time, slots);
  stepSparks(dt);
  renderer.render(scene, camera);
});
// a first one, so the page is not empty
spawn(0, R, false);
window.__play = { D, slots, spawn };
