// LAB ONLY (T-045) — the work inside a 3D model of the room. Not part of the piece and no change to it: this page runs the work exactly
// as review.html does (experience.js + the virtual audience) and, instead of the flat strip, maps the work's canvas (the strip, through
// its own capture stream) onto the four walls of a room built from the room profile (vt.walls: real widths and heights, in profile
// order, corners meeting, P3 → P4 continuous). The viewer is a separate three.js renderer (WebGL2) on its own canvas.
//   «Dentro»: the eye at the centre of the room at 1.6 m; drag to look round 360°, wheel = field of view (60–100°).
//   «Fuera»:  an orbit round the room from above / outside; the walls are drawn from their inside face only, so the near ones never hide
//             the far ones; drag to orbit, wheel to zoom.
//   A click on a wall puts a hand there for 0.8 s (through the harness stage, as the 2D view does); Shift + drag (or the «Mano» button)
//   keeps a hand under the pointer while it moves. Keys: V view, M hand mode.
import * as THREE from 'three/webgpu';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage || !window.__vtDev) await wait(100);
const vt = window.__vtDev, stage = window.__labRoom.stage, ROOM = stage.ROOM;
const work = document.getElementById('c'), cv = document.getElementById('v3d');

// ---------------------------------------------------------------- renderer, scene
const renderer = new THREE.WebGPURenderer({ canvas: cv, antialias: true, forceWebGL: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
await renderer.init();
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0b);

// the work's picture: the canvas's own stream (as the 2D view uses), as a video texture
const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.autoplay = true;
video.srcObject = work.captureStream(30); video.play().catch(() => {});
const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;

// ---------------------------------------------------------------- the room, as room3d.js builds it
const n = vt.walls.length, widths = vt.walls.map((w) => w.width), heights = vt.walls.map((w) => w.height);
const SW = vt.size.width, SH = vt.size.height;
const sides = [];
if (n === 4) {
  const A = (widths[0] + widths[2]) / 2, B = (widths[1] + widths[3]) / 2;
  sides.push([new THREE.Vector3(0, 0, -B / 2), new THREE.Vector3(1, 0, 0)], [new THREE.Vector3(A / 2, 0, 0), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(0, 0, B / 2), new THREE.Vector3(-1, 0, 0)], [new THREE.Vector3(-A / 2, 0, 0), new THREE.Vector3(0, 0, -1)]);
} else {
  const per = widths.reduce((a, b) => a + b, 0), ap = per / (2 * n * Math.tan(Math.PI / n));
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; sides.push([new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(ap), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))]); }
}
const UP = new THREE.Vector3(0, 1, 0);
const wallMeshes = [], wallInfo = [];
const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, toneMapped: false });
vt.walls.forEach((w, i) => {
  const [centre, right] = sides[i], normal = new THREE.Vector3().crossVectors(right, UP).normalize();   // into the room
  const width = n === 4 ? (i % 2 === 0 ? (widths[0] + widths[2]) / 2 : (widths[1] + widths[3]) / 2) : widths[i], h = heights[i];
  const pa = centre.clone().addScaledVector(right, -width / 2);
  // a quad on the wall plane, facing the room; uv = the wall's rect in the strip (the video texture is flipped: v up)
  const r = w.rect, u0 = r.x / SW, u1 = (r.x + r.w) / SW, vT = 1 - r.y / SH, vB = 1 - (r.y + r.h) / SH;
  const g = new THREE.BufferGeometry(), P = [], UV = [];
  for (const [uu, vv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const p = pa.clone().addScaledVector(right, uu * width).setY(vv * h); P.push(p.x, p.y, p.z);
    UV.push(u0 + (u1 - u0) * uu, vB + (vT - vB) * vv);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);                                   // counter-clockwise seen from inside: the front face looks into the room
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.userData.wall = i; scene.add(m); wallMeshes.push(m);
  wallInfo.push({ id: w.id, pa, right, normal, width, h });
  // a thin dark frame line at the top of each wall (from inside) and a small label P1…P4
  const lc = document.createElement('canvas'); lc.width = 128; lc.height = 48; const x = lc.getContext('2d');
  x.fillStyle = 'rgba(229,181,103,0.75)'; x.font = '500 26px Geist, system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(w.id, 64, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, depthWrite: false }));
  sp.scale.set(0.45, 0.17, 1); sp.position.copy(centre).addScaledVector(normal, 0.25).setY(h + 0.18); scene.add(sp);
});
// the dark floor and a faint ceiling outline
const span = Math.max(...wallInfo.map((w) => w.width)) * 1.4;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ color: 0x141414 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const ring = []; for (const w of wallInfo) { const a = w.pa.clone(), b = w.pa.clone().addScaledVector(w.right, w.width); ring.push(a.x, w.h, a.z, b.x, w.h, b.z, a.x, 0.002, a.z, b.x, 0.002, b.z); }
const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3a3a })));
// people for scale: adults 1.7 m, a child 1.2 m, standing round the room facing the walls
const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
function person(x, z, h, face) {
  const g = new THREE.Group(), r = h * 0.11;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, h * 0.62, 4, 12), bodyMat); body.position.y = h * 0.42; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 16, 12), bodyMat); head.position.y = h * 0.9; g.add(head);
  g.position.set(x, 0, z); g.rotation.y = face; scene.add(g);
}
person(-1.7, -1.9, 1.7, 0); person(2.3, 0.6, 1.72, -Math.PI / 2); person(0.9, 2.0, 1.2, Math.PI); person(-2.3, 1.1, 1.65, Math.PI / 2);   // ~1.3–1.6 m from the walls, out of the centre's line of sight

// ---------------------------------------------------------------- cameras: inside and outside
const cam = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
const view = { mode: 'in', yaw: 0, pitch: 0.05, fov: 80, oYaw: 0.7, oPitch: 0.55, oDist: 16, hand: false };
function place() {
  if (view.mode === 'in') {
    cam.fov = view.fov; cam.position.set(0, 1.6, 0);
    cam.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  } else {
    cam.fov = 45; const cp = Math.cos(view.oPitch);
    cam.position.set(Math.sin(view.oYaw) * cp * view.oDist, 1.6 + Math.sin(view.oPitch) * view.oDist, Math.cos(view.oYaw) * cp * view.oDist);
    cam.lookAt(0, 1.2, 0);
  }
  cam.updateProjectionMatrix();
}
function resize() { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); place(); }
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- UI: views, hand mode
const bIn = document.getElementById('bIn'), bOut = document.getElementById('bOut'), bHand = document.getElementById('bHand'), hint = document.getElementById('hint3d');
function setMode(m) {
  view.mode = m; bIn.classList.toggle('on', m === 'in'); bOut.classList.toggle('on', m === 'out');
  hint.textContent = m === 'in' ? 'Arrastra para mirar · rueda: campo de visión · V cambia de vista · clic en un muro = una mano (Mayús + arrastrar la mantiene)'
    : 'Arrastra para girar alrededor · rueda: acercar · V cambia de vista · clic en un muro = una mano';
  place();
}
function setHand(on) { view.hand = on; bHand.classList.toggle('on', on); cv.classList.toggle('hand', on); }
bIn.onclick = () => setMode('in'); bOut.onclick = () => setMode('out'); bHand.onclick = () => setHand(!view.hand);
addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  if (e.key === 'v' || e.key === 'V') setMode(view.mode === 'in' ? 'out' : 'in');
  else if (e.key === 'm' || e.key === 'M') setHand(!view.hand);
});

// ---------------------------------------------------------------- pointer: look / orbit, or a hand on a wall
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(ev) {
  const r = cv.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const hs = ray.intersectObjects(wallMeshes, false);
  for (const h of hs) {
    const i = h.object.userData.wall, w = wallInfo[i];
    if (h.face && h.face.normal.dot(ray.ray.direction) > 0) continue;   // only the inside face counts
    const u = h.point.clone().sub(w.pa).dot(w.right) / w.width, v = h.point.y / w.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    return { i, u, v };
  }
  return null;
}
// a wall point → the harness stage: s = strip fraction (ROOM's strip, in profile order like the 2D view), t = 1 − height / wall height
function toStage(hp) {
  const id = wallInfo[hp.i].id, Rw = ROOM.walls.find((w) => w.id === id) || ROOM.walls[hp.i];
  return { s: (Rw.x + hp.u * Rw.w) / ROOM.strip.width, t: 1 - hp.v };
}
let drag = null, handSeq = 0;
const tapTimers = new Map();
cv.addEventListener('pointerdown', (ev) => {
  try { cv.setPointerCapture(ev.pointerId); } catch { /* a synthetic pointer */ }
  const handMode = view.hand || ev.shiftKey, hp = hit(ev);
  drag = { x: ev.clientX, y: ev.clientY, moved: 0, hand: null, handMode };
  if (handMode && hp) { const key = 'v3d' + (handSeq++); const s = toStage(hp); stage.put(key, s.s, s.t); drag.hand = key; }
});
cv.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.handMode) { if (drag.hand) { const hp = hit(ev); if (hp) { const s = toStage(hp); stage.put(drag.hand, s.s, s.t); } } return; }
  if (view.mode === 'in') { const k = (view.fov / 80) * 0.004; view.yaw += dx * k; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * k)); }
  else { view.oYaw -= dx * 0.006; view.oPitch = Math.max(0.05, Math.min(1.45, view.oPitch + dy * 0.005)); }
  place();
});
cv.addEventListener('pointerup', (ev) => {
  if (!drag) return;
  if (drag.hand) stage.lift(drag.hand);
  else if (drag.moved < 5) {                                        // a click: a hand there for 0.8 s
    const hp = hit(ev);
    if (hp) { const key = 'v3d' + (handSeq++), s = toStage(hp); stage.put(key, s.s, s.t); tapTimers.set(key, setTimeout(() => { stage.lift(key); tapTimers.delete(key); }, 800)); }
  }
  drag = null;
});
cv.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  if (view.mode === 'in') view.fov = Math.max(60, Math.min(100, view.fov + Math.sign(ev.deltaY) * 3));
  else view.oDist = Math.max(6, Math.min(40, view.oDist * (1 + Math.sign(ev.deltaY) * 0.08)));
  place();
}, { passive: false });

// ---------------------------------------------------------------- loop
renderer.setAnimationLoop(() => { renderer.render(scene, cam); });
window.__sala3d = { view, setMode, setHand, hit, toStage, cam, wallInfo, place };   // lab checks only
