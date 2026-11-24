// Ressonància — the room in 3D. A CAVE: an eye at the centre of the room and ONE OFF-AXIS CAMERA PER WALL, each wall an exact window
// onto a world that goes on behind it. The four windows meet at the corners, so the world is continuous round the room (P3 → P4 too).
//
//   const room = await createRoom3D(vt, canvas, { eyeHeight: 1.6 });
//   room.scene.add(...);                          // build the world in METRES: y up, floor at y = 0, the eye at (0, eyeHeight, 0)
//   vt.loop((dt) => { ...; room.render(); }, canvas);
//
// What it gives:
//   THREE, renderer, scene, walls: [{ id, index, width, height, centre (Vector3 on the floor), right, normal (into the room),
//     pa, pb, pc (bottom-left, bottom-right, top-left corners), camera }], eye (Vector3), hands() (the hands on the walls in WORLD
//   coordinates: [{ stroke, wall, u, v, pos (Vector3 on the wall plane), normal, vx, vy (m/s along the wall), ended }]),
//   wallPoint(wall, u, v, out), setBloom({ strength, radius, threshold }), render(), backend ('webgpu' | 'webgl2').
// Why the interactive things live on the wall plane: that plane is where the projection is exact for EVERY visitor, wherever they
// stand. Far things (a square, a sky, a tower 10 m away) read well from anywhere; near things bend for a visitor far from the
// centre. So hands touch the world exactly where they touch the wall; the universe opens behind.
// Rendering: the four views go into one HDR render target (the strip, as the room expects it), then one post pass (bloom, tone
// mapping, grain) to the canvas. WebGPU when available, WebGL2 otherwise (three.js picks it). Nothing is allocated per frame.
import * as THREE from 'three/webgpu';
import { texture, uniform, uv, vec2, vec3, vec4, float, fract, sin, dot, Fn } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export async function createRoom3D(vt, canvas, opt = {}) {
  const W = vt.size.width, H = vt.size.height;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL: !!opt.forceWebGL, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  await renderer.init();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opt.exposure ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  const backend = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';

  // NO scene.background: in WebGPU a colour background clears the WHOLE target on every render, which would wipe the other walls.
  // The strip is cleared once per frame with `clearColor`; a sky is geometry (a large sphere seen from inside).
  const scene = new THREE.Scene();
  const clearColor = new THREE.Color(opt.clearColor ?? 0x000000);

  // ---- the room as a rectangle (4 walls), or a polygon for other rooms. Walls in profile order, left to right seen from inside.
  const eye = new THREE.Vector3(0, opt.eyeHeight ?? 1.6, 0);
  const n = vt.walls.length, widths = vt.walls.map((w) => w.width), heights = vt.walls.map((w) => w.height);
  const sides = [];
  if (n === 4) {
    const A = (widths[0] + widths[2]) / 2, B = (widths[1] + widths[3]) / 2;
    sides.push([new THREE.Vector3(0, 0, -B / 2), new THREE.Vector3(1, 0, 0)], [new THREE.Vector3(A / 2, 0, 0), new THREE.Vector3(0, 0, 1)],
      [new THREE.Vector3(0, 0, B / 2), new THREE.Vector3(-1, 0, 0)], [new THREE.Vector3(-A / 2, 0, 0), new THREE.Vector3(0, 0, -1)]);
  } else {
    const per = widths.reduce((a, b) => a + b, 0), apothem = per / (2 * n * Math.tan(Math.PI / n));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const fwd = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); sides.push([fwd.clone().multiplyScalar(apothem), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))]); }
  }
  const up = new THREE.Vector3(0, 1, 0);
  const walls = vt.walls.map((w, i) => {
    const [centre, right] = sides[i], normal = new THREE.Vector3().crossVectors(right, up).normalize();   // into the room (right × up)
    // corners: on a rectangle room the walls share their corners exactly (the profile's widths differ by ~1 %: averaged), so
    // anything drawn on the walls meets at the corners; other rooms use each wall's own width.
    const half = (n === 4 ? (i % 2 === 0 ? (widths[0] + widths[2]) / 2 : (widths[1] + widths[3]) / 2) : widths[i]) / 2;
    const pa = centre.clone().addScaledVector(right, -half), pb = centre.clone().addScaledVector(right, half), pc = pa.clone().setY(heights[i]);
    const camera = new THREE.PerspectiveCamera(60, w.rect.w / w.rect.h, opt.near ?? 0.05, opt.far ?? 400);
    camera.matrixAutoUpdate = true; camera.userData.wall = i;          // a material can tell which wall it is drawn for
    return { id: w.id, index: i, width: half * 2, height: heights[i], centre, right, normal, pa, pb, pc, camera, rect: w.rect };
  });
  const wallIndex = new Map(walls.map((w) => [w.id, w.index]));

  // Kooima's generalized perspective projection: the frustum through the wall's corners from the eye
  const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _m = new THREE.Matrix4();
  function fit(w) {
    const cam = w.camera, near = cam.near, far = cam.far;
    cam.coordinateSystem = renderer.coordinateSystem;            // else the renderer would reset the matrix on the first frame
    _va.subVectors(w.pa, eye); _vb.subVectors(w.pb, eye); _vc.subVectors(w.pc, eye);
    const d = -_va.dot(w.normal);
    const l = (w.right.dot(_va) * near) / d, r = (w.right.dot(_vb) * near) / d, b = (up.dot(_va) * near) / d, t = (up.dot(_vc) * near) / d;
    cam.projectionMatrix.makePerspective(l, r, t, b, near, far, cam.coordinateSystem);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    _m.makeBasis(w.right, up, w.normal);                          // the camera looks along -normal (out through the wall)
    cam.position.copy(eye); cam.quaternion.setFromRotationMatrix(_m); cam.updateMatrixWorld(true);
  }
  for (const w of walls) fit(w);

  // ---- the strip: one HDR target, four viewports
  // `renderScale` (0.5–1) renders the 3D at a fraction of the strip and the post pass scales it up (the quality knob);
  // `samples` is MSAA on the strip (4 is costly at room size).
  const RS = Math.min(1, Math.max(0.4, opt.renderScale ?? 1)), RW = Math.round(W * RS), RH = Math.round(H * RS);
  const strip = new THREE.RenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: true, samples: opt.samples ?? 0 });
  strip.texture.wrapS = THREE.RepeatWrapping;                     // the seam is not a seam

  // ---- post: bloom over the strip, tone mapping and colour space by the pipeline, a little grain against banding
  const pipeline = new THREE.RenderPipeline(renderer);
  const src = texture(strip.texture);
  const B = { strength: uniform(opt.bloom?.strength ?? 0.55), radius: uniform(opt.bloom?.radius ?? 0.6), threshold: uniform(opt.bloom?.threshold ?? 0.75) };
  const bl = bloom(src, B.strength, B.radius, B.threshold);
  // the bloom wraps round the room like the strip: its bright pass and every blur level repeat in x, so a halo near the P3|P4 seam
  // continues on the other side instead of being cut (BloomNode's internal targets, three r187; INT 2026-11-23)
  for (const rt of [bl._renderTargetBright, ...(bl._renderTargetsHorizontal || []), ...(bl._renderTargetsVertical || [])]) if (rt) rt.texture.wrapS = THREE.RepeatWrapping;
  const grainAmt = uniform(opt.grain ?? 1 / 255), time = uniform(0);
  const grain = Fn(() => { const p = uv().mul(vec2(W, H)).add(time.mul(61.7)); return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(grainAmt); });
  pipeline.outputNode = vec4(src.rgb.add(bl.rgb).add(vec3(grain())), float(1));

  // ---- hands on the walls, in world coordinates
  const hs = [];
  for (let i = 0; i < 32; i++) hs.push({ stroke: null, wall: 0, u: 0, v: 0, pos: new THREE.Vector3(), normal: new THREE.Vector3(), vx: 0, vy: 0, ended: false });
  const out = [];
  function wallPoint(wi, u, v, target = new THREE.Vector3()) {
    const w = walls[wi];
    return target.copy(w.pa).addScaledVector(_vb.subVectors(w.pb, w.pa), u).addScaledVector(_vc.subVectors(w.pc, w.pa), v);
  }
  function hands() {
    out.length = 0;
    for (const h of vt.hands()) {
      if (out.length >= hs.length) break;
      const wi = wallIndex.get(h.wallId); if (wi == null) continue;
      const w = walls[wi], r = w.rect, o = hs[out.length];
      o.stroke = h.stroke; o.ended = !!h.ended; o.wall = wi;   // ended: the sensor has lost it; the runtime keeps it during its stitch window
       o.u = (h.x - r.x) / r.w; o.v = 1 - (h.y - r.y) / r.h;
      wallPoint(wi, o.u, o.v, o.pos); o.normal.copy(w.normal);
      const ppm = vt.walls[wi].pxPerM || 261; o.vx = (h.vx || 0) / ppm; o.vy = -(h.vy || 0) / ppm;
      out.push(o);
    }
    return out;
  }

  let t = 0;
  function render(dt = 1 / 60) {
    t += dt; time.value = t % 1000;
    renderer.setRenderTarget(strip);
    strip.scissorTest = false; renderer.setClearColor(clearColor, 1); renderer.clear();
    strip.scissorTest = true;
    for (const w of walls) {
      const r = w.rect, x0 = Math.round(r.x * RS), x1 = Math.round((r.x + r.w) * RS), y0 = Math.round((H - r.y - r.h) * RS), y1 = Math.round((H - r.y) * RS);   // viewports count from the bottom
      strip.viewport.set(x0, y0, x1 - x0, y1 - y0); strip.scissor.set(x0, y0, x1 - x0, y1 - y0);
      renderer.render(scene, w.camera);
    }
    strip.scissorTest = false; strip.viewport.set(0, 0, RW, RH); strip.scissor.set(0, 0, RW, RH);
    renderer.setRenderTarget(null);
    pipeline.render();
  }
  function setBloom(o = {}) { for (const k of ['strength', 'radius', 'threshold']) if (o[k] != null) B[k].value = o[k]; }
  function setEye(y) { eye.y = y; for (const w of walls) fit(w); }

  return { THREE, renderer, scene, clearColor, walls, eye, hands, wallPoint, render, setBloom, setEye, backend, strip, pipeline };
}
