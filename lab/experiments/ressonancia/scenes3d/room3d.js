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
//   T-028: overlay (a scene drawn over the final image, no depth: the guide, the guiding thread), envMap (PMREM environment for
//   physical materials) + useEnvironment(k), setTiles({ on, mix, amount, origin, seed }) and render(dt, pass) for the tile transition
//   (pass('out' | 'in') is the host's hook to show each world), aa ('msaa' | 'taa' | 'none'; opt.aa = 'taa').
//   T-037 (RND-F): setEnvironment(block | {...}) re-bakes envMap in place from the CC0 HDRIs + the colour script; setTiles also takes
//   accentFrom / accentTo, origins, depth, mirror, glow, streaks; tileFront(wallIndex) 0..1; the tile pass rebuilt (see below). PARTS.md.
// Why the interactive things live on the wall plane: that plane is where the projection is exact for EVERY visitor, wherever they
// stand. Far things (a square, a sky, a tower 10 m away) read well from anywhere; near things bend for a visitor far from the
// centre. So hands touch the world exactly where they touch the wall; the universe opens behind.
// Rendering: the four views go into one HDR render target (the strip, as the room expects it), then one post pass (bloom, tone
// mapping, grain) to the canvas. WebGPU when available, WebGL2 otherwise (three.js picks it). Nothing is allocated per frame.
import * as THREE from 'three/webgpu';
import { texture, uniform, uv, vec2, vec3, vec4, float, fract, sin, cos, dot, Fn, floor, select, clamp, abs, min, max, smoothstep, mix, pow, positionLocal, normalize, length, exp, atan, asin, pmremTexture } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

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
    w.p8 = cam.projectionMatrix.elements[8]; w.p9 = cam.projectionMatrix.elements[9];   // the un-jittered off-axis terms (TAA)
    _m.makeBasis(w.right, up, w.normal);                          // the camera looks along -normal (out through the wall)
    cam.position.copy(eye); cam.quaternion.setFromRotationMatrix(_m); cam.updateMatrixWorld(true);
  }
  for (const w of walls) fit(w);

  // ---- the strip: one HDR target, four viewports
  // `renderScale` (0.5–1) renders the 3D at a fraction of the strip and the post pass scales it up (the quality knob);
  // `samples` is MSAA on the strip (4 is costly at room size). `aa: 'taa'` swaps MSAA for a temporal AA (below).
  const RS = Math.min(1, Math.max(0.4, opt.renderScale ?? 1)), RW = Math.round(W * RS), RH = Math.round(H * RS);
  const TAA = opt.aa === 'taa';
  const hdr = (samples, depth = true) => { const rt = new THREE.RenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: depth, samples }); rt.texture.wrapS = THREE.RepeatWrapping; return rt; };   // the seam is not a seam
  const strip = hdr(TAA ? 0 : opt.samples ?? 0);
  // T-028: the outgoing world of a transition gets its own strip; `comp` holds the tile composition of the two (+ the overlay)
  const stripOut = hdr(TAA ? 0 : opt.samples ?? 0), comp = hdr(0, false);

  // ---- the tile transition (T-028 INT, rebuilt in T-037 RND-F; the work's signature; ARTE-2 §7, refs 13/14). The outgoing image and
  // the incoming one are composed through a field of SLABS THAT CARRY THE IMAGE; see the composition pass below.
  // tiles.mix 0 = all old … 1 = all new; amount scales the relief; depth / mirror / glow / streaks tune each ingredient (1 = as designed).
  const tiles = { on: false, mix: uniform(0), amount: uniform(1), origin: uniform(0.25), seed: uniform(0), time: uniform(0),
    depth: uniform(1), mirror: uniform(1), glow: uniform(1), streaks: uniform(1), eyeV: uniform(eye.y / heights[0]),
    accentFrom: uniform(new THREE.Vector3(1, 1, 1)), accentTo: uniform(new THREE.Vector3(1, 1, 1)), accentK: uniform(0), origins: uniform(1) };
  // ---- an environment for physical materials (T-028 INT; T-037 RND-F: HDRI + the colour script). ONE pre-filtered texture
  // (`room.envMap`, PMREM) that every part holds; `room.setEnvironment(...)` re-bakes it IN PLACE (same texture: parts change nothing).
  // What is baked is a sphere seen from inside: INT's generated night (deep blue-black, a warm horizon, soft panels of light) and / or
  // a CC0 HDRI of the shared library (`assets/cc0/hdri/`: 'night' = rooftop_night, 'sky' = kloppenheim pure sky), desaturated towards
  // `sat`, multiplied by `tint`, by a vertical ramp `bottom` → `top` (the art bible: cold and light above, warm below) and by `gain`.
  // Parts opt in: material.envMap = room.envMap (+ envMapIntensity), or room.useEnvironment(k) for the whole scene (ask the director).
  let envMap = null, pmrem = null, envRT = null;
  const ENV = { name: 'generated', pending: null, cfg: null, loaded: { night: false, sky: false }, failed: {}, bakes: 0 };
  const hueOf = (hex, k = 1) => { const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b, 1e-4); return [c.r / m * k, c.g / m * k, c.b / m * k]; };
  // per block, after the art bible's colour script (notas/ARTE.md §2, column «cielo del entorno»): always a cold light zone above and a
  // warm one below, so chrome reads as metal. `hdri` weights: g = generated, night, sky. The host calls room.setEnvironment(block).
  const ENV_PRESETS = {
    generated: { g: 1, night: 0, sky: 0, sat: 1, tint: [1, 1, 1], top: [1, 1, 1], bottom: [1, 1, 1], gain: 1, panels: true },
    wait:    { g: 0, night: 1, sky: 0, sat: 0.15, tint: hueOf('#AEB8C8'), top: [1, 1, 1], bottom: hueOf('#FF6B2E', 0.5), gain: 0.9, panels: false },
    intro:   { g: 0.5, night: 1, sky: 0, sat: 0.6, tint: hueOf('#6E86C8'), top: [1, 1, 1], bottom: hueOf('#FFB25A', 0.9), gain: 1.1, panels: true },
    brasa:   { g: 0, night: 0.35, sky: 1, sat: 0.2, tint: [1, 1, 1], top: hueOf('#9FB4D8', 0.7), bottom: hueOf('#FF6A1F', 0.3), gain: 0.9, panels: false },
    pinya:   { g: 0, night: 1, sky: 0.25, sat: 0.3, tint: [1, 1, 1], top: hueOf('#2ED3C6', 0.8), bottom: hueOf('#FF6F59', 0.55), gain: 1.0, panels: false },
    tronc:   { g: 0, night: 1, sky: 0.2, sat: 0.4, tint: [1, 1, 1], top: hueOf('#2BB8B0', 0.75), bottom: hueOf('#B8562C', 0.8), gain: 1.1, panels: true },
    pom:     { g: 0.3, night: 1, sky: 0, sat: 0.5, tint: [1, 1, 1], top: hueOf('#5A78D8', 0.9), bottom: hueOf('#FFD27A', 0.7), gain: 1.1, panels: false },
    crown:   { g: 0, night: 0.6, sky: 0.8, sat: 0.35, tint: [1, 1, 1], top: hueOf('#FFF0C8', 0.8), bottom: hueOf('#B9A3FF', 0.55), gain: 0.8, panels: true },
    festa:   { g: 0, night: 0.6, sky: 0.8, sat: 0.35, tint: [1, 1, 1], top: hueOf('#FFF0C8', 0.9), bottom: hueOf('#B9A3FF', 0.6), gain: 0.9, panels: true },
    baixada: { g: 0, night: 0, sky: 1, sat: 0.5, tint: [1, 1, 1], top: hueOf('#B9A3E8', 0.9), bottom: hueOf('#FFD0A8', 1), gain: 1.3, panels: false },
    fall:    { g: 0, night: 0.5, sky: 0.6, sat: 0.3, tint: [1, 1, 1], top: hueOf('#B9A3E8', 0.6), bottom: hueOf('#FF6A1F', 0.4), gain: 0.8, panels: false },
    acta:    { g: 0, night: 1, sky: 0, sat: 0.1, tint: hueOf('#F2EEE6'), top: [1, 1, 1], bottom: [0.6, 0.6, 0.6], gain: 0.7, panels: false },
  };
  const EU = { g: uniform(1), night: uniform(0), sky: uniform(0), sat: uniform(1), gain: uniform(1), rot: uniform(0),
    tint: uniform(new THREE.Vector3(1, 1, 1)), top: uniform(new THREE.Vector3(1, 1, 1)), bottom: uniform(new THREE.Vector3(1, 1, 1)) };
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  const tNight = texture(blank), tSky = texture(blank);
  const envScene = new THREE.Scene(), envPanels = [];
  try {
    const sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    sky.colorNode = Fn(() => {
      const d = normalize(positionLocal), y = d.y;
      const gen = mix(vec3(0.02, 0.025, 0.05), vec3(0.10, 0.12, 0.2), smoothstep(0.0, 1.0, y))
        .add(vec3(0.5, 0.28, 0.12).mul(pow(float(1).sub(abs(y)), 8)).mul(0.6)).add(vec3(0.03, 0.02, 0.01).mul(smoothstep(0.0, -1.0, y)));
      const euv = vec2(atan(d.z, d.x).div(Math.PI * 2).add(0.5).add(EU.rot), asin(clamp(y, -1, 1)).div(Math.PI).add(0.5));
      const hd = min(tNight.sample(euv).rgb.mul(EU.night).add(tSky.sample(euv).rgb.mul(EU.sky)), vec3(24));   // lamps and the sun, tamed: no fireflies
      const lum = dot(hd, vec3(0.3, 0.55, 0.15));
      const c = mix(vec3(lum), hd, EU.sat).mul(EU.tint).add(gen.mul(EU.g));
      return c.mul(mix(EU.bottom, EU.top, smoothstep(-0.2, 0.45, y))).mul(EU.gain);
    })();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), sky));
    const pg = new THREE.PlaneGeometry(1, 1);
    for (const [col, a, y, w, h] of [[[3, 1.6, 0.8], 0.3, 6, 18, 5], [[0.6, 1.4, 2.2], 2.2, 10, 14, 4], [[2.4, 0.9, 1.6], 3.8, 4, 10, 8], [[2.6, 2.6, 2.8], 5.2, 22, 26, 6]]) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide }));
      m.position.set(Math.cos(a) * 30, y, Math.sin(a) * 30); m.scale.set(w, h, 1); m.lookAt(0, y, 0); envScene.add(m); envPanels.push(m);
    }
    pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(envScene, 0.03);
    envMap = envRT.texture;
  } catch (err) { console.info('room3d: no environment map (' + err.message + ')'); }
  // the HDRIs load in the background (local files, ~1.5 MB each); a preset that needs one waits for it (the generated night meanwhile)
  if (envMap && opt.hdri !== false) {
    const loader = new HDRLoader();
    for (const [key, file, node] of [['night', 'rooftop_night_1k.hdr', tNight], ['sky', 'kloppenheim_07_puresky_1k.hdr', tSky]]) {
      loader.load(new URL('./assets/cc0/hdri/' + file, import.meta.url).href, (tex) => {
        tex.wrapS = THREE.RepeatWrapping; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
        node.value = tex; ENV.loaded[key] = true;
      }, undefined, () => { ENV.failed[key] = true; console.info('room3d: HDRI ' + file + ' not loaded (the generated environment stays)'); });
    }
  }
  // setEnvironment('brasa') | setEnvironment({ g, night, sky, sat, tint, top, bottom, gain, panels, rot }) | setEnvironment('pom', { gain: 1.4 })
  // The bake (one PMREM, a few ms) happens inside the next render(); while a tile transition runs it waits for the wave's peak
  // (tiles.mix ≥ 0.5), so the outgoing world keeps its own sky. { now: true } bakes at once. Returns false when there is no environment.
  function setEnvironment(what = 'generated', over = null) {
    if (!envRT) return false;
    const base = typeof what === 'string' ? ENV_PRESETS[what] || ENV_PRESETS.generated : { ...ENV_PRESETS.generated, ...what };
    ENV.pending = { ...base, ...(over || {}) }; ENV.pendingName = typeof what === 'string' ? what : 'custom';
    if (over?.now || (typeof what === 'object' && what.now)) bakeEnvironment(true);
    return true;
  }
  function bakeEnvironment(force = false) {
    const c = ENV.pending; if (!c || !envRT) return;
    if (!force && tiles.on && tiles.mix.value < 0.5) return;
    if ((c.night > 0 && !ENV.loaded.night && !ENV.failed.night) || (c.sky > 0 && !ENV.loaded.sky && !ENV.failed.sky)) return;   // still loading
    const lost = (c.night > 0 && ENV.failed.night) || (c.sky > 0 && ENV.failed.sky);                                           // no file: the generated night, tinted
    EU.g.value = lost ? Math.max(c.g, 1) : c.g; EU.night.value = c.night; EU.sky.value = c.sky; EU.sat.value = c.sat; EU.gain.value = c.gain; EU.rot.value = c.rot || 0;
    EU.tint.value.fromArray(c.tint); EU.top.value.fromArray(c.top); EU.bottom.value.fromArray(c.bottom);
    for (const m of envPanels) m.visible = c.panels !== false;
    try { pmrem.fromScene(envScene, 0.03, 0.1, 100, { renderTarget: envRT }); ENV.name = ENV.pendingName; ENV.cfg = c; ENV.bakes++; }
    catch (err) { console.info('room3d: environment bake skipped (' + err.message + ')'); }
    ENV.pending = null;
  }
  // captureEnvironment(sc, { renderTarget, position, size, sigma }): a part's own environment, rendered from the eye (or `position`)
  // and pre-filtered — e.g. the square at rest, so its wet slabs and glass reflect the real square. Pass the target it returned the
  // first time to refresh it in place (same texture: no material rebuild). Returns null where it cannot be built.
  function captureEnvironment(sc = scene, o = {}) {
    if (!pmrem) return null;
    try { return pmrem.fromScene(sc, o.sigma ?? 0.015, 0.1, 200, { size: o.size ?? 256, position: o.position ?? eye, renderTarget: o.renderTarget ?? null }); }
    catch (err) { console.info('room3d: environment capture skipped (' + err.message + ')'); return null; }
  }
  function useEnvironment(k = 1) { scene.environment = k > 0 ? envMap : null; scene.environmentIntensity = k; }

  // ---- the composition pass of the tile transition (T-037). One full-strip pass, ~9 texture taps per pixel.
  //  · A static quadtree of slabs: 0.9 m, 0.45, 0.22 and 0.11 m mixed by chance (refs 13/14's collage of block sizes); an integer
  //    count across the strip, so the field wraps at the P3|P4 seam. Flush slabs are invisible: nothing pops when the wave arrives.
  //  · ONE WAVE: each slab's clock `lp` runs 0 → 1 as a wedge-shaped front passes, from `origin` both ways round the room.
  //  · RELIEF WITH THE ROOM'S OWN PERSPECTIVE: a slab sinks into the wall (up to ~0.45 m) and is drawn as a real recessed box seen
  //    from the eye of the room — each wall has its vanishing point (the foot of the eye on it), so every slab shifts and shows the
  //    inner walls of its hole differently (parallax). The hole's walls carry the image's edge colours pulled into depth (the
  //    voxel look of the refs), lit from above (the bible's key light: ledges bright, soffits dark), darker with depth.
  //  · THE SLAB TURNS (about a vertical or a horizontal axis): the old world on one face, the new on the other. While it turns it
  //    is a MIRROR: it reflects room.envMap, a specular glint (HDR ~2.5) sweeps across it, and its bevel carries a thin film —
  //    always, also over black worlds: a wave of mirrors, never missing blocks.
  //  · LIGHT THROUGH THE CRACKS: behind a turning slab the new world shows, and iridescent light (#8FE3FF → #F2A6C8 → #F6D47A, tinted
  //    by the incoming world's own colour there) spills round the slab's edge and up the hole's walls — also over black.
  //  · PIXEL SORTING: where the front passes, vertical bands 0.3–1.2 m long hold the image's colours sorted bright → dark.
  const tIn = texture(strip.texture), tOut = texture(stripOut.texture);
  const WHv = vec2(W, H), NB = vec2(Math.max(4, Math.round(W / 236)), Math.max(1, Math.round(H / 228)));
  const h21 = (c, s) => fract(sin(dot(c, vec2(127.1, 311.7)).add(s)).mul(43758.5453));
  const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const PA = lin('#8FE3FF'), PB = lin('#F2A6C8'), PC = lin('#F6D47A');
  const pal3 = (x) => { const t = fract(x).mul(3); return mix(mix(mix(PA, PB, clamp(t, 0, 1)), PC, clamp(t.sub(1), 0, 1)), PA, clamp(t.sub(2), 0, 1)); };
  const luma = (c) => dot(c, vec3(0.3, 0.55, 0.15));
  const safe = (c) => clamp(c, vec3(0), vec3(64));                 // a part's stray Inf must not turn into NaN here (Inf × 0)
  // the walls in strip order: where each starts (px), its vanishing point (px), the eye's distance (px), its axes in the world
  const wd = [...walls].sort((a, b) => a.rect.x - b.rect.x).map((w) => {
    const ppm = w.rect.w / w.width, d = -_va.subVectors(w.pa, eye).dot(w.normal), u = -_va.dot(w.right) / w.width;
    return { x0: w.rect.x, px: float(w.rect.x + u * w.rect.w), d: float(Math.max(0.5, d) * ppm), right: vec3(w.right.x, w.right.y, w.right.z), back: vec3(-w.normal.x, -w.normal.y, -w.normal.z) };
  });
  const perWall = (x, key) => { let v = wd[0][key]; for (let i = 1; i < wd.length; i++) v = select(x.greaterThanEqual(wd[i].x0), wd[i][key], v); return v; };
  const WD = 0.3;
  // a slab's start: the front runs round the room from `origin` both ways, a wedge (mid-height leads), a little chance.
  // tiles.origins = n: n fronts start together, evenly spaced from `origin` (4 = one per wall on a 4-wall room); each covers 1/n of the room in the same time
  const timeAt = (cen, h) => abs(fract(cen.x.sub(tiles.origin).mul(tiles.origins).add(0.5)).sub(0.5)).mul(1.2).add(abs(cen.y.sub(0.5)).mul(0.12)).add(h.mul(0.1)).mul(1 - WD);
  const compNode = Fn(() => {
    const p = uv(), pp = p.mul(WHv), sd = tiles.seed;
    // the quadtree (static: by chance only)
    const c0 = floor(p.mul(NB)), s1 = h21(c0, sd).greaterThan(0.69);   // art round 4: area big : medium : small ≈ 9 : 3 : 1
    const c1 = floor(p.mul(NB.mul(2))), s2 = s1.and(h21(c1, sd.add(3.1)).greaterThan(0.74));
    const c2 = floor(p.mul(NB.mul(4))), s3 = s2.and(h21(c2, sd.add(5.7)).greaterThan(0.7));
    const N = select(s3, NB.mul(8), select(s2, NB.mul(4), select(s1, NB.mul(2), NB))).toVar();
    const c = floor(p.mul(N)).toVar(), S = WHv.div(N).toVar(), a = c.mul(S), cen = c.add(0.5).div(N).toVar();
    const hb = h21(c, sd.add(1.7)).toVar(), hc = h21(c, sd.add(9.9)).toVar(), hd = h21(c, sd.add(4.4)).toVar();
    const lp = clamp(tiles.mix.sub(timeAt(cen, h21(c, sd.add(7.3)))).div(WD), 0, 1).toVar();
    const zf = smoothstep(0, 0.3, lp).mul(float(1).sub(smoothstep(0.7, 1, lp))).toVar();        // out of the wall and back
    // the recessed box, seen from the eye of the room
    const cx = cen.x.mul(W), Pp = vec2(perWall(cx, 'px'), tiles.eyeV.mul(H)), dW = perWall(cx, 'd');
    const zpx = min(S.x.mul(hd.mul(0.9).add(0.35)), float(120)).mul(zf).mul(tiles.amount).mul(tiles.depth);
    const sP = zpx.div(dW).add(1), rel = pp.sub(Pp).toVar();
    const qb = Pp.add(rel.mul(sP)).sub(a).div(S).toVar();                                         // where the ray meets the hole's bottom, in the cell
    const inB = qb.x.greaterThan(0).and(qb.x.lessThan(1)).and(qb.y.greaterThan(0)).and(qb.y.lessThan(1));
    // the slab turns in the bottom of its hole
    const fl = smoothstep(0.2, 0.8, lp), A = sin(fl.mul(Math.PI)).mul(hd.mul(9).add(3).mul(Math.PI / 180)), cA = max(abs(cos(A)), 0.035), sA = sin(A).toVar();   // art round 4: each slab turns 3–12°, it does not flip
    const vert = hb.greaterThan(0.42), dir = select(hc.greaterThan(0.5), float(1), float(-1));
    const g = float(1).sub(zf.mul(0.07)), u0 = qb.sub(0.5);
    const along = select(vert, u0.x, u0.y), across = select(vert, u0.y, u0.x);
    const af = along.div(cA.mul(g)).toVar();
    const key = sA.mul(dir).mul(select(fl.lessThan(0.5), float(1), float(-1))).mul(0.4);          // the edge that comes forward looks taller
    const kf = across.div(g.mul(max(float(1).add(clamp(af, -0.5, 0.5).mul(key)), 0.5))).toVar();
    const qf = select(vert, vec2(af, kf), vec2(kf, af)).add(0.5).toVar();
    const inF = inB.and(qf.x.greaterThan(0)).and(qf.x.lessThan(1)).and(qf.y.greaterThan(0)).and(qf.y.lessThan(1));
    const isIn = lp.greaterThan(0.5);
    const suv = a.add(clamp(select(inB, qf, qb), 0, 1).mul(S)).div(WHv);                          // the face's image; outside it, its edge pulled into depth
    const tile = safe(mix(tOut.sample(suv).rgb, tIn.sample(suv).rgb, smoothstep(0.42, 0.58, lp))).toVar();
    const newP = safe(tIn.sample(p).rgb).toVar();
    // the light behind the wall: the film's colours by place and time, tinted by the incoming world's own colour at this slab
    const gIn = safe(tIn.sample(cen).rgb), film0 = pal3(hb.mul(0.35).add(pp.x.add(pp.y).div(900)).add(tiles.time.mul(0.07)).add(lp.mul(0.5)));
    // with the host's accents (setTiles({ accentFrom, accentTo })) the light goes from the outgoing chapter's colour to the incoming one's, the film only as a shimmer on it
    const accent = mix(tiles.accentFrom, tiles.accentTo, smoothstep(0.3, 0.7, lp));
    const film = mix(film0, accent.mul(film0.mul(0.7).add(0.5)), tiles.accentK).toVar();
    const glowC = mix(film, gIn.div(luma(gIn).add(0.25)).mul(0.9), 0.45).mul(tiles.glow).toVar();
    // --- the slab's face: its image, lit as it turns, a mirror of the room's environment, a glint, a bevel with a thin film
    const eT = float(1).sub(qf.y).mul(S.y), eB = qf.y.mul(S.y), eL = qf.x.mul(S.x), eR = float(1).sub(qf.x).mul(S.x);
    const rim = float(1).sub(smoothstep(0.6, 2.4, min(min(eL, eR), min(eT, eB))));
    const litTop = float(1).sub(smoothstep(0, 2.2, eT)), shadeBot = float(1).sub(smoothstep(0, 2.6, eB));
    const lintel = float(1).sub(smoothstep(0, zpx.mul(0.45).add(1), eT)).mul(0.5).mul(zf);       // the hole's upper wall shades the face
    const nrm = select(vert, vec3(sA.mul(dir), 0, cos(A).negate()), vec3(0, sA.mul(dir), cos(A).negate()));
    const Vl = normalize(vec3(rel, dW)), nv = nrm.mul(select(dot(nrm, Vl).greaterThan(0), float(-1), float(1)));
    const lam = clamp(abs(dot(nrm, vec3(0, 0.8, -0.6))).div(0.6), 0.4, 1.5);
    const Rl = Vl.sub(nv.mul(dot(Vl, nv).mul(2)));
    const Rw = perWall(cx, 'right').mul(Rl.x).add(vec3(0, 1, 0).mul(Rl.y)).add(perWall(cx, 'back').mul(Rl.z));
    const envC = envMap ? safe(pmremTexture(envMap, Rw, float(0.14)).rgb) : mix(vec3(0.22, 0.1, 0.04), vec3(0.3, 0.4, 0.55), smoothstep(-0.3, 0.5, Rw.y));
        const mir = zf.mul(sA.mul(sA).mul(2.0).add(select(hc.greaterThan(0.7), float(0.14), float(0.03)))).mul(tiles.mirror);   // half the slabs are mirrors all the way; all of them while they turn
    const sweep = fl.mul(1.6).sub(0.3), gl = select(vert, qf.x, qf.y).sub(sweep).div(0.07);
    const glint = exp(gl.mul(gl).negate()).mul(min(sA.mul(sA).mul(40), 1)).mul(0.6).mul(tiles.mirror);
    const face = tile.mul(zf.mul(0.6).mul(float(1).sub(smoothstep(0.1, 0.6, luma(tile)))).add(1)).mul(lam).mul(float(1).sub(mir.mul(0.4))).mul(float(1).sub(lintel)).mul(float(1).sub(shadeBot.mul(zf).mul(0.5)))
      .add(min(envC, vec3(1.1)).mul(mir).mul(1.3))
      .add(mix(vec3(1), film, 0.4).mul(glint))
      .add(tile.mul(litTop.mul(zf).mul(0.5)));   // art round 4: no halo on the frame (the bevel is the image, lit) — the light lives in the crack
    // --- the void behind a turning slab: the new world, and the light spilling round the slab's edge
    const ex = max(abs(af).sub(0.5), 0).mul(select(vert, S.x, S.y)).mul(cA), ey = max(abs(kf).sub(0.5), 0).mul(select(vert, S.y, S.x));
    const dv = length(vec2(ex, ey));
    // art round 4: the light leaks through SOME cracks, unevenly along them (where the slab lifts most), never a lit frame round every slab
    const leakK = select(hc.greaterThan(0.55), float(1), float(0.2)).mul(smoothstep(-0.2, 0.8, sin(pp.x.add(pp.y).mul(0.045).add(hb.mul(40)))));
    const hole = newP.mul(float(1).sub(zf.mul(0.5))).add(glowC.mul(exp(dv.div(-3.5)).mul(1.0).mul(leakK).add(0.03)).mul(zf));
    // --- the hole's inner walls: the image's edge pulled into depth, lit from above, darker with depth, the light rising from the bottom
    const over = max(max(qb.negate(), qb.sub(1)), vec2(0)).mul(S);
    const dfv = clamp(vec2(1).sub(over.div(max(abs(rel).mul(sP.sub(1)), vec2(1e-3)))), 0, 1);
    const df = min(dfv.x, dfv.y);
    const wallShade = select(dfv.x.lessThan(dfv.y), float(0.6), select(rel.y.lessThan(0), float(1.25), float(0.3)));
    const side = tile.mul(wallShade).mul(mix(1, 0.5, df)).add(glowC.mul(pow(df, 10).mul(0.25)).mul(leakK).mul(zf));   // the hole's walls: only a trace of the crack's light
    const col = select(inF, face, select(inB, hole, side)).toVar();
    // --- pixel sorting where the front passes: bands 4 or 14 px wide, 0.3–1.2 m long, the image's own colours sorted bright → dark
    const cen0 = c0.add(0.5).div(NB), l0 = clamp(tiles.mix.sub(timeAt(cen0, float(0.5))).div(WD), 0, 1);
    const fr = sin(l0.mul(Math.PI)).mul(tiles.streaks);
    const cidB = floor(pp.x.div(14)), wide = h21(vec2(cidB, 3.5), sd).greaterThan(0.6);
    const cid = select(wide, cidB.add(7000), floor(pp.x.div(4)));
    const Lc = h21(vec2(cid, 1.5), sd).mul(230).add(80), oc = h21(vec2(cid, 2.5), sd).mul(Lc);
    const sgi = floor(pp.y.add(oc).div(Lc)), sy = fract(pp.y.add(oc).div(Lc));
    const act = smoothstep(0, 0.12, fr.sub(h21(vec2(cid, sgi), sd.add(5)).mul(0.9).add(0.25)));
    const yB = sgi.mul(Lc).sub(oc).div(H), yT = sgi.add(1).mul(Lc).sub(oc).div(H), w0 = select(l0.greaterThan(0.5), float(1), float(0));
    const sT = safe(mix(tOut.sample(vec2(p.x, yT)).rgb, tIn.sample(vec2(p.x, yT)).rgb, w0)), sB = safe(mix(tOut.sample(vec2(p.x, yB)).rgb, tIn.sample(vec2(p.x, yB)).rgb, w0));
    const hiT = luma(sT).greaterThan(luma(sB)), hi = select(hiT, sT, sB), lo = select(hiT, sB, sT);
    col.assign(mix(col, mix(lo, hi, pow(sy, 1.6)), act.mul(0.85).mul(smoothstep(0.03, 0.3, luma(hi)))));   // only where there is colour to drag: never a dark band
    return vec4(col, 1);
  })();
  const compMat = new THREE.NodeMaterial(); compMat.fragmentNode = compNode;
  const compQuad = new THREE.QuadMesh(compMat);

  // ---- temporal AA (opt.aa 'taa'): each wall's projection is jittered by a sub-pixel Halton offset every frame and the image is
  // blended with its history, the history clamped to the current 3×3 neighbourhood (no reprojection: the room's eye is still; moving
  // things fall back to the current frame through the clamp). Wraps at the seam like everything else.
  let histA = TAA ? hdr(0, false) : null, histB = TAA ? hdr(0, false) : null;
  const taaIn = texture(comp.texture), taaHist = texture(histA ? histA.texture : comp.texture), taaK = uniform(1);
  let taaMat = null, taaQuad = null;
  if (TAA) {
    const px = vec2(1 / RW, 1 / RH);
    taaMat = new THREE.NodeMaterial();
    taaMat.fragmentNode = Fn(() => {
      // T-037: variance clipping (the history is kept inside mean ± 1 σ of the current 3×3, tighter than its min/max box: a cloud of
      // moving points no longer smears) and a faster answer where the history disagrees with the present (something moved)
      const p = uv(), cur = clamp(taaIn.sample(p).rgb, vec3(0), vec3(64)).toVar();
      const m1 = cur.toVar(), m2 = cur.mul(cur).toVar();
      for (const [a, b] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { const s = clamp(taaIn.sample(p.add(px.mul(vec2(a, b)))).rgb, vec3(0), vec3(64)); m1.addAssign(s); m2.addAssign(s.mul(s)); }
      const mu = m1.div(9), sg = max(m2.div(9).sub(mu.mul(mu)), vec3(0)).sqrt();
      const raw = taaHist.sample(p).rgb, hist = clamp(raw, mu.sub(sg), mu.add(sg));
      const moved = dot(abs(raw.sub(hist)), vec3(0.33)).div(dot(mu, vec3(0.33)).add(0.05));
      return vec4(mix(hist, cur, clamp(taaK.add(smoothstep(0.1, 1.0, moved).mul(0.5)), 0, 1)), 1);
    })();
    taaQuad = new THREE.QuadMesh(taaMat);
  }
  const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  let taaFrame = 0;

  // ---- post: bloom over the image, tone mapping and colour space by the pipeline, a little grain against banding
  const pipeline = new THREE.RenderPipeline(renderer);
  const src = texture(strip.texture);
  const B = { strength: uniform(opt.bloom?.strength ?? 0.55), radius: uniform(opt.bloom?.radius ?? 0.4), threshold: uniform(opt.bloom?.threshold ?? 0.85) };   // T-037: tighter and higher (was 0.6 / 0.75): light round what is bright, not a fog over the wall
  const bl = bloom(src, B.strength, B.radius, B.threshold);
  // the bloom wraps round the room like the strip: its bright pass and every blur level repeat in x, so a halo near the P3|P4 seam
  // continues on the other side instead of being cut (BloomNode's internal targets, three r187; INT 2026-11-23)
  for (const rt of [bl._renderTargetBright, ...(bl._renderTargetsHorizontal || []), ...(bl._renderTargetsVertical || [])]) if (rt) rt.texture.wrapS = THREE.RepeatWrapping;
  const grainAmt = uniform(opt.grain ?? 1.5 / 255), time = uniform(0);
  const grain = Fn(() => { const p = uv().mul(vec2(W, H)).add(time.mul(61.7)); return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(grainAmt); });
  // the finish (T-037): film grain that follows the light — a third of it in the blacks (it still breaks banding, the projector's black
  // stays black), all of it in the mid-tones. NO vignette: per wall it would draw four frames round the public and break the corners.
  const lit = src.rgb.add(bl.rgb);
  pipeline.outputNode = vec4(lit.add(vec3(grain().mul(clamp(dot(lit, vec3(0.3, 0.55, 0.15)).mul(1.6), 0, 1).mul(0.67).add(0.33)))), float(1));

  // ---- hands on the walls, in world coordinates
  const hs = [];
  for (let i = 0; i < 32; i++) hs.push({ stroke: null, wall: 0, u: 0, v: 0, pos: new THREE.Vector3(), normal: new THREE.Vector3(), vx: 0, vy: 0, size: 0, ended: false });
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
      const ppm = vt.walls[wi].pxPerM || 261; o.vx = (h.vx || 0) / ppm; o.vy = -(h.vy || 0) / ppm; o.size = (h.size || 0) / ppm;   // m (T-040)
      out.push(o);
    }
    return out;
  }

  // ---- the overlay: a second, small scene drawn over the final image of every wall, after the tile composition (so the tiles never
  // break it): the host's guiding thread (T-028). No depth: draw it additive or with depthTest off.
  const overlay = new THREE.Scene();
  let overlayCount = 0;

  let t = 0;
  // WebGL2: a whole-target clear after rendering into another target only cleared the last viewport used (the tile passes accumulated
  // additive layers into white); there each wall's viewport is cleared on its own, scissored. WebGPU clears the whole target once.
  const GL2 = backend === 'webgl2';
  function views(target, sc, clear = false) {
    renderer.setRenderTarget(target);
    target.scissorTest = true;
    for (const w of walls) {
      const r = w.rect, x0 = Math.round(r.x * RS), x1 = Math.round((r.x + r.w) * RS), y0 = Math.round((H - r.y - r.h) * RS), y1 = Math.round((H - r.y) * RS);   // viewports count from the bottom
      target.viewport.set(x0, y0, x1 - x0, y1 - y0); target.scissor.set(x0, y0, x1 - x0, y1 - y0);
      if (clear && GL2) { renderer.setClearColor(clearColor, 1); renderer.autoClear = true; }
      renderer.render(sc, w.camera);
      renderer.autoClear = false;
    }
    target.scissorTest = false; target.viewport.set(0, 0, RW, RH); target.scissor.set(0, 0, RW, RH);
  }
  function clearTo(target) { if (GL2) return; renderer.setRenderTarget(target); target.scissorTest = false; renderer.setClearColor(clearColor, 1); renderer.clear(); }
  function jitter() {
    const k = TAA ? (taaFrame++ % 8) + 1 : 0;
    for (const w of walls) {
      const e = w.camera.projectionMatrix.elements, vw = Math.max(1, w.rect.w * RS), vh = Math.max(1, w.rect.h * RS);
      const jx = TAA ? (halton(k, 2) - 0.5) * 2 / vw : 0, jy = TAA ? (halton(k, 3) - 0.5) * 2 / vh : 0;
      if (e[8] === w.p8 - jx && e[9] === w.p9 - jy) continue;
      e[8] = w.p8 - jx; e[9] = w.p9 - jy; w.camera.projectionMatrixInverse.copy(w.camera.projectionMatrix).invert();
    }
  }
  // render(dt, pass): pass(which) is the host's hook while tiles.on: it is called with 'out' before the outgoing world is drawn and
  // with 'in' before the incoming one (show / hide each world's objects); it is not called otherwise.
  function render(dt = 1 / 60, pass = null) {
    t += dt; time.value = t % 1000; tiles.time.value = t % 1000;
    if (ENV.pending) bakeEnvironment();
    jitter();
    const tl = tiles.on && !!pass;
    if (tl) { pass('out'); clearTo(stripOut); views(stripOut, scene, true); pass('in'); }
    clearTo(strip); views(strip, scene, true);
    let img = strip;
    if (tl) { renderer.setRenderTarget(comp); compQuad.render(renderer); img = comp; }
    overlayCount = overlay.children.length;
    if (overlayCount) { if (img === strip) { renderer.setRenderTarget(strip); renderer.clearDepth(); } views(img, overlay); }   // the overlay never depth-tests against the world
    if (TAA) {
      taaIn.value = img.texture; taaHist.value = histA.texture;
      renderer.setRenderTarget(histB); taaQuad.render(renderer); taaK.value = 0.12;
      img = histB; const sw = histA; histA = histB; histB = sw;
    }
    src.value = img.texture;
    renderer.setRenderTarget(null);
    pipeline.render();
  }
  // warm the tile pass now (its pipeline would otherwise be built in the first frame of the first transition: a hitch at the cut)
  try { renderer.setRenderTarget(comp); compQuad.render(renderer); renderer.setRenderTarget(null); } catch (err) { console.info('room3d: tile pass warm-up skipped (' + err.message + ')'); }
  function setBloom(o = {}) { for (const k of ['strength', 'radius', 'threshold']) if (o[k] != null) B[k].value = o[k]; }
  function setEye(y) { eye.y = y; tiles.eyeV.value = y / heights[0]; for (const w of walls) fit(w); }
  function setTiles(o = {}) { if (o.on != null) tiles.on = !!o.on; for (const k of ['mix', 'amount', 'origin', 'seed', 'depth', 'mirror', 'glow', 'streaks']) if (o[k] != null) tiles[k].value = o[k];
    if (o.origins != null) tiles.origins.value = Math.max(1, Math.round(o.origins));
    if (o.accentFrom && o.accentTo) { tiles.accentFrom.value.fromArray(o.accentFrom); tiles.accentTo.value.fromArray(o.accentTo); tiles.accentK.value = o.accentK ?? 0.8; }
    else if (o.accentK != null) tiles.accentK.value = o.accentK;
  }
  // tileFront(wallIndex): 0..1 — how far the wave of slabs has passed the CENTRE of that wall (0 = not there yet, 1 = its slabs there
  // have locked into the new world). 1 when no tile transition is running. For the guide: bring a wall's new words in at 1 (+0.3 s).
  function tileFront(wi) {
    if (!tiles.on) return 1;
    const w = walls[wi]; if (!w) return 1;
    const x = (w.rect.x + w.rect.w / 2) / W, dx = Math.abs(((((x - tiles.origin.value) * tiles.origins.value + 0.5) % 1) + 1) % 1 - 0.5);
    return Math.min(1, Math.max(0, (tiles.mix.value - (dx * 1.2 + 0.1) * (1 - WD)) / WD));
  }

  return { THREE, renderer, scene, overlay, clearColor, walls, eye, hands, wallPoint, render, setBloom, setEye, setTiles, tileFront, tiles, envMap, useEnvironment, captureEnvironment, setEnvironment, environment: ENV, ENV_PRESETS, aa: TAA ? 'taa' : (opt.samples ? 'msaa' : 'none'), backend, strip, pipeline };
}
