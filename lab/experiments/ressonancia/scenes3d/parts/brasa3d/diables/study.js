// Ressonància — study page for the correfocs (DIA, T-064): ../diables.js alone on the room, with a stand-in for what brasa3d gives
// it (a black water floor with a plain mirror, a small CPU spark pool behind the same `emit` signature, BRA-like slots).
//   ?mode=close | dance | run | cycle      (default dance)   ?gl=1 WebGL2   ?k=0..1 / ?dis=0..1 hold assemble / dissolve
//   ?n=<devils>  ?scale=1 (the harness)    window.__dia = { fps, count, D }  for the lab's checks
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../../../room3d.js';
import { createDiables } from '../diables.js';

const Q = new URLSearchParams(location.search);
const mode = Q.get('mode') || 'dance', holdK = Q.has('k') ? +Q.get('k') : null, holdDis = Q.has('dis') ? +Q.get('dis') : null;
const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const room = await createRoom3D(vt, canvas, { forceWebGL: Q.get('gl') === '1', eyeHeight: 1.6, bloom: { strength: 0.35 }, exposure: 1 });
room.setBackground?.('brasa'); room.setEnvironment?.('brasa');
const { uniform, vec3, float, Fn, attribute, positionGeometry, modelViewMatrix, cameraProjectionMatrix, vec2, vec4, mix, max, length, uv, exp, smoothstep, select } = TSL;

const object = new THREE.Group(); room.scene.add(object);
const world = new THREE.Group(); object.add(world);
const walls = room.walls, NW = walls.length, eye = room.eye;
const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
const wrapP = (x) => ((x % PER) + PER) % PER;
function ringPoint(s, d, out) {
  s = wrapP(s);
  let w = NW - 1; for (let i = 0; i < NW; i++) if (s < cum[i] + walls[i].width) { w = i; break; }
  const W = walls[w], u = s - cum[w];
  const x = W.pa.x + W.right.x * u, z = W.pa.z + W.right.z * u;
  const dx = x - eye.x, dz = z - eye.z, tw = Math.hypot(dx, dz) || 1;
  out.set(eye.x + (dx / tw) * (tw + d), 0, eye.z + (dz / tw) * (tw + d));
  return tw;
}

// the water: black, with the devils drawn again in a plain mirror (BRA's has ripples and the bed's glow)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicNodeMaterial({ depthWrite: false }));
floor.rotation.x = -Math.PI / 2; floor.material.colorNode = vec3(0.0021, 0.0018, 0.0015); world.add(floor);
const U = { time: uniform(0), leave: uniform(0), devils: uniform(1), refl: uniform(1) };
const mirP = Fn(([p]) => vec3(p.x, p.y.negate(), p.z));
const CHROME = vec3(1.0, 0.93, 0.84);

// a small CPU spark pool with brasa3d's emit() signature (study only: BRA's is a GPU compute ring buffer)
const NS = 16384, sp = new Float32Array(NS * 4), sv = new Float32Array(NS * 4), sk = new Float32Array(NS * 4);
let cur = 0;
function emit(n, px, py, pz, spread, dx, dy, dz, cone, vmin, vmax, lmin, lmax, heat, g, drag, ix = 0, iy = 0, iz = 0) {
  n = Math.floor(n); const l = Math.hypot(dx, dy, dz) || 1;
  for (let j = 0; j < n; j++) {
    const i = cur; cur = (cur + 1) % NS;
    const rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
    let ux = dx / l + rx * cone, uy = dy / l + ry * cone, uz = dz / l + rz * cone; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const s = vmin + (vmax - vmin) * Math.pow(Math.random(), 1.4), k = 0.6 + 0.4 * Math.random();
    sp.set([px + (Math.random() - 0.5) * spread, py + (Math.random() - 0.5) * spread, pz + (Math.random() - 0.5) * spread, 0], i * 4);
    sv.set([ux * s + ix * k, uy * s + iy * k, uz * s + iz * k, lmin + (lmax - lmin) * Math.random()], i * 4);
    sk.set([heat * (0.75 + 0.3 * Math.random()), g, drag, 0], i * 4);
  }
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
  const mv = mix(a, b, positionGeometry.y.add(0.5)), w = max(float(0.004), mv.z.negate().mul(0.0022));
  m.vertexNode = select(alive, cameraProjectionMatrix.mul(vec4(mv.xy.add(perp.mul(positionGeometry.x.mul(w))), mv.z, 1)), vec4(0, 0, 2, 1));
  const T = K4.x.mul(float(1).sub(x));
  const c = mix(mix(vec3(0.25, 0.012, 0.004), vec3(1, 0.19, 0.01), smoothstep(0.2, 0.9, T)), vec3(1, 0.82, 0.43), smoothstep(1.0, 1.8, T)).mul(T.mul(0.8));
  const q = uv().x.sub(0.5);
  m.colorNode = c.mul(exp(q.mul(q).mul(-12))).mul(float(0.004).div(w)).mul(mirror ? 0.5 : 1);
  const mesh = new THREE.Mesh(sg, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 4; world.add(mesh);
}

// the devils, mounted the way brasa3d will mount them
const MAXD = 14;
const D = createDiables({ THREE, TSL, room, world, U, mirP, CHROME, fireRamp: null, emit, MAXD, ringPoint });
const slots = []; for (let i = 0; i < MAXD; i++) slots.push({ on: false, s: 0, d: 2, dir: 1, spd: 0, life: 1e9, age: 0, k: 0, dis: 0, h: 1, hop: 0, gain: 1, style: 0, born: i * 1.37 });
const centre = (w) => cum[w] + walls[w].width / 2;
const N = Q.has('n') ? +Q.get('n') : null;
function spawn(i, o) { Object.assign(slots[i], { on: true, age: 0, k: 0, dis: 0, hop: 0, gain: 1, life: 1e9, ...o }); }
if (mode === 'close') {
  spawn(0, { s: centre(1), d: 1.6, spd: 0, style: 0, h: 1.0 });
} else if (mode === 'run') {
  spawn(13, { s: centre(1) - 2.5, d: 2.0, spd: 3.0, style: 0, h: 1.08, gain: 1.25, run: true });
  spawn(12, { s: centre(1) - 4.0, d: 2.6, spd: 3.0, style: 1, h: 0.98, run: true });
  spawn(11, { s: centre(1) - 5.2, d: 3.1, spd: 3.0, style: 0, h: 1.0, run: true });
  spawn(0, { s: centre(3), d: 2.2, spd: 1.4, style: 1, h: 1.02 });
} else {
  const n = N ?? (mode === 'cycle' ? 4 : 6);
  for (let i = 0; i < n; i++) spawn(i, { s: centre(i % NW) + (i >= NW ? 2.4 : -0.6), d: 1.6 + (i % 3) * 0.45, spd: i % 3 === 2 ? 0 : 1.4, dir: i % 2 ? 1 : -1, style: i % 2, h: 1 + 0.06 * Math.sin(i * 3.1), life: mode === 'cycle' ? 5 + i * 1.3 : 1e9 });
}

let time = 0, frames = 0, f0 = performance.now(), fps = 0;
const _v = new THREE.Vector3();
vt.loop((dt) => {
  dt = Math.min(dt, 0.05); time += dt;
  for (let i = 0; i < MAXD; i++) {
    const dv = slots[i]; if (!dv.on) continue;
    dv.age += dt; dv.k = Math.min(1, dv.k + dt / 0.9);
    if (dv.age > dv.life) dv.dis = Math.min(1, dv.dis + dt / 1.8);
    if (dv.dis >= 1) { if (mode === 'cycle') spawn(i, { age: 0, k: 0, dis: 0, life: 5 + Math.random() * 3 }); else dv.on = false; continue; }
    const tw = ringPoint(dv.s, dv.d, _v);
    if (dv.run) dv.s += dv.spd * dt * tw / (tw + dv.d);
    else if (dv.spd > 0) dv.s += dv.dir * dv.spd * dt * tw / (tw + dv.d) * (0.6 + 0.4 * Math.sin(time * 0.4 + i));
    if (holdK !== null) dv.k = holdK;
    if (holdDis !== null) dv.dis = holdDis;
  }
  U.time.value = time % 3000;
  D.update(dt, time, slots);
  stepSparks(dt);
  room.render(dt);
  frames++; const n = performance.now(); if (n - f0 > 1000) { fps = (frames * 1000) / (n - f0); frames = 0; f0 = n; }
}, canvas);
window.__dia = { fps: () => fps, count: () => D.count(), D, room, slots };
