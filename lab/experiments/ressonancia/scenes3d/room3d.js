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
//   T-048 (SIS, ARTE-3 §3): bloom at half (BLOOM_K); PALETTE[block] { bottom, top, accent }; setBackground(block | {...}) (a deep gradient,
//   never #000); flash(positionNode) / flashAt(v) / flashLights («la mano es una linterna»); lightRecipe(), rimNode(), makeHalo(),
//   placeHalo() (the ONE light recipe and the soft halo behind a hero object). No glitch, no pixel-sorting outside the tile transition.
// Why the interactive things live on the wall plane: that plane is where the projection is exact for EVERY visitor, wherever they
// stand. Far things (a square, a sky, a tower 10 m away) read well from anywhere; near things bend for a visitor far from the
// centre. So hands touch the world exactly where they touch the wall; the universe opens behind.
// Rendering: the four views go into one HDR render target (the strip, as the room expects it), then one post pass (bloom, tone
// mapping, grain) to the canvas. WebGPU when available, WebGL2 otherwise (three.js picks it). Nothing is allocated per frame.
//   STUDIO NIGHT 25-11 (VFX, plan 05 §2.4/§2.7/§2.8): palette.js is the only source of colour (room.PAL, room.PALETTE, ENV_PRESETS read
//   it); the post is AgX + a grade per chapter (room.setGrade) + a projector-safe shoulder + a continuous vertical darkening; the air
//   is a RADIAL fog coloured by the sky in each direction (room.setAir); the one matter (room.matter.ceramic / .body) and contact
//   shadows (room.contactShadows). setBackground(block) — which the host calls on every block change — also sets the block's grade and
//   air, so nothing else has to call them. See PARTS.md «What the room gives since the studio night».
import * as THREE from 'three/webgpu';
import { Discard, If, Loop, uniformArray, screenCoordinate, positionGeometry, texture, uniform, uv, vec2, vec3, vec4, float, fract, sin, cos, dot, Fn, floor, select, clamp, abs, min, max, smoothstep, mix, pow, positionLocal, normalize, length, exp, atan, asin, pmremTexture, normalWorld, positionWorld, cameraPosition, agxToneMapping, sRGBTransferOETF, sRGBTransferEOTF, fog, instancedDynamicBufferAttribute, mx_noise_float, exp2 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { PAL, TOK, lin as palLin, linOf } from './palette.js';

export async function createRoom3D(vt, canvas, opt = {}) {
  const W = vt.size.width, H = vt.size.height;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL: !!opt.forceWebGL, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  await renderer.init();
  // the tone mapping is done in the post node (AgX + the chapter's grade + the projector's shoulder): the pipeline only converts the
  // colour space. renderer.toneMappingExposure stays the OPERATOR's exposure (the hosts write it): it is read every frame.
  renderer.toneMapping = THREE.NoToneMapping;
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
  // VFX perf 25-11: the room's quality for the parts' own knobs (the hosts pass renderScale 1 / 0.8 / 0.6 for high / medium / low)
  const QUALITY = opt.quality || (RS >= 0.99 ? 'high' : RS >= 0.75 ? 'medium' : 'low');
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
  // a token's hue (max channel = k), from palette.js: nobody writes a hex here
  const hueOf = (token, k = 1) => { const c = palLin(token), m = Math.max(c[0], c[1], c[2], 1e-4); return [c[0] / m * k, c[1] / m * k, c[2] / m * k]; };
  // per block, after the palette of the work (plan 05 §2.7; was the art bible's colour script with turquoise / coral / violet): a cooler
  // light zone above and a warmer one below, so glaze and chrome read as matter; the light chapters (pinya, tronc, crown, festa, baixada,
  // acta) brighter. `hdri` weights: g = generated, night, sky. The host calls room.setEnvironment(block).
  const ENV_PRESETS = {
    generated: { g: 1, night: 0, sky: 0, sat: 1, tint: [1, 1, 1], top: [1, 1, 1], bottom: [1, 1, 1], gain: 1, panels: true },
    wait:    { g: 0, night: 1, sky: 0, sat: 0.15, tint: hueOf('pedra-nit'), top: [1, 1, 1], bottom: hueOf('fanal', 0.5), gain: 0.9, panels: false },
    intro:   { g: 0.5, night: 1, sky: 0, sat: 0.5, tint: hueOf('blau-plaça'), top: [1, 1, 1], bottom: hueOf('fanal', 0.9), gain: 1.1, panels: true },
    brasa:   { g: 0, night: 0.35, sky: 1, sat: 0.2, tint: [1, 1, 1], top: hueOf('lluna', 0.7), bottom: hueOf('brasa', 0.3), gain: 0.9, panels: false },
    pinya:   { g: 0.3, night: 1, sky: 0, sat: 0.4, tint: hueOf('blau-plaça'), top: [1, 1, 1], bottom: hueOf('cal-foc', 0.8), gain: 1.0, panels: true },
    tronc:   { g: 0.3, night: 1, sky: 0, sat: 0.4, tint: hueOf('blau-hora'), top: [1, 1, 1], bottom: hueOf('porcellana', 0.8), gain: 1.1, panels: true },
    pom:     { g: 0.3, night: 1, sky: 0, sat: 0.5, tint: [1, 1, 1], top: hueOf('blau-hora', 0.9), bottom: hueOf('or-clar', 0.6), gain: 1.1, panels: false },
    crown:   { g: 0.3, night: 1, sky: 0, sat: 0.4, tint: hueOf('blau-plaça'), top: [1, 1, 1], bottom: hueOf('or-clar', 0.9), gain: 1.0, panels: true },
    festa:   { g: 0.3, night: 1, sky: 0, sat: 0.4, tint: hueOf('blau-plaça'), top: [1, 1, 1], bottom: hueOf('or-clar', 0.9), gain: 1.0, panels: true },
    baixada: { g: 0, night: 0, sky: 1, sat: 0.5, tint: [1, 1, 1], top: hueOf('alba-blau', 0.95), bottom: hueOf('alba-rosa', 1), gain: 1.4, panels: false },
    fall:    { g: 0, night: 0.5, sky: 0.6, sat: 0.3, tint: [1, 1, 1], top: hueOf('cendra', 0.6), bottom: hueOf('brasa', 0.4), gain: 0.8, panels: false },
    acta:    { g: 0, night: 0.3, sky: 0.8, sat: 0.1, tint: hueOf('cal'), top: [1, 1, 1], bottom: hueOf('ombra', 0.7), gain: 1.2, panels: false },
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
  const lin = (token) => vec3(...palLin(token));
  const PA = lin('lluna'), PB = lin('cal-fanal'), PC = lin('or');   // the light in the cracks: moon, lantern lime, gold (palette.js; was cyan / pink)
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
  // T-048 (ARTE-3 §3 «bloom a la mitad»): every strength asked for (opt.bloom.strength, setBloom) is applied × BLOOM_K = 0.5, so the
  // host's knob keeps its scale (0.6 = today's default → 0.3 on screen). The festa's bloom event is the scene's own light, not the bloom
  // (DECISIONES 24-11 00:00: mean-luma rise ≤ ×2/s, ≤ 2 % burnt, once, calm in ≤ 8 s): unchanged by this.
  const BLOOM_K = 0.5;
  const B = { strength: uniform((opt.bloom?.strength ?? 0.55) * BLOOM_K), radius: uniform(opt.bloom?.radius ?? 0.4), threshold: uniform(opt.bloom?.threshold ?? 0.85) };   // T-037: tighter and higher (was 0.6 / 0.75): light round what is bright, not a fog over the wall
  const bl = bloom(src, B.strength, B.radius, B.threshold);
  // the bloom wraps round the room like the strip: its bright pass and every blur level repeat in x, so a halo near the P3|P4 seam
  // continues on the other side instead of being cut (BloomNode's internal targets, three r187; INT 2026-11-23)
  for (const rt of [bl._renderTargetBright, ...(bl._renderTargetsHorizontal || []), ...(bl._renderTargetsVertical || [])]) if (rt) rt.texture.wrapS = THREE.RepeatWrapping;
  const grainAmt = uniform(opt.grain ?? 1.5 / 255), time = uniform(0);
  const grain = Fn(() => { const p = uv().mul(vec2(W, H)).add(time.mul(61.7)); return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(grainAmt); });
  // ---- the studio chain (plan 05 V2, §2.8): HDR → exposure (chapter EV × the operator's exposure) → saturation → split tone (shadows
  // towards the chapter's shadow hue, lights towards its light hue) → AgX → in display space: a gentle contrast, the continuous vertical
  // darkening (top and bottom of the strip, the same on the four walls: never a vignette per wall, which would frame the corners), a
  // projector-safe shoulder (nothing above `ceil`: p99 ≤ 0.85, burnt ≤ 1 %), the lift (the blackest black is the chapter's shadow
  // token, never #000) and a dither that is strongest in the blacks (the projector bands there). Every value eases (≈ 1.2 s).
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const G = { ev: uniform(0), sat: uniform(1), contrast: uniform(1), lo: uniform(v3([1, 1, 1])), loK: uniform(0), hi: uniform(v3([1, 1, 1])), hiK: uniform(0),
    lift: uniform(v3([0, 0, 0])), liftK: uniform(0), ceil: uniform(0.9), vTop: uniform(0.2), vBot: uniform(0.15), bloom: uniform(1), opExp: uniform(1),
    accent: uniform(v3([1, 0.7, 0.3])), shadow: uniform(v3([0.01, 0.01, 0.02])) };
  const lumN = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722));
  const graded = Fn(() => {
    const c = src.rgb.add(bl.rgb.mul(G.bloom)).mul(G.opExp).mul(exp2(G.ev)).toVar();
    const l = lumN(c);
    c.assign(max(mix(vec3(l), c, G.sat), vec3(0)));
    const w = l.div(l.add(0.25));                                                  // 0 in the shadows → 1 in the lights
    c.assign(c.mul(mix(vec3(1), G.lo, G.loK.mul(float(1).sub(w)))).mul(mix(vec3(1), G.hi, G.hiK.mul(w))));
    const d = sRGBTransferOETF(agxToneMapping(c, float(1))).toVar();             // display values 0..1
    d.assign(clamp(d.sub(0.42).mul(G.contrast).add(0.42), 0, 1));
    const y = uv().y;                                                              // the strip's height (the same on the four walls)
    const yUp = select(float(renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? 1 : 0).greaterThan(0.5), float(1).sub(y), y);
    d.mulAssign(float(1).sub(G.vTop.mul(pow(smoothstep(0.6, 1.0, yUp), 1.6))).sub(G.vBot.mul(smoothstep(0.16, 0.0, yUp))));
    // the shoulder: by the brightest channel (no hue shift), from 0.72 up, never above ceil
    const m = max(max(d.x, d.y), max(d.z, 1e-4)), k0 = float(0.72), span = max(G.ceil.sub(k0), 0.02);
    const mm = select(m.greaterThan(k0), k0.add(span.mul(float(1).sub(exp(m.sub(k0).div(span).negate())))), m);
    d.mulAssign(mm.div(m));
    d.addAssign(G.lift.mul(float(1).sub(d)).mul(G.liftK));
    const ld = lumN(d);
    d.addAssign(vec3(grain().mul(float(1.6).sub(clamp(ld.mul(1.8), 0, 1)))));   // dither: ×1.6 in the blacks, ×0.6 in the lights
    return sRGBTransferEOTF(clamp(d, 0, 1));                                       // the pipeline encodes to sRGB again
  });
  pipeline.outputNode = vec4(graded(), float(1));

  // ---- hands on the walls, in world coordinates
  const hs = [];
  for (let i = 0; i < 32; i++) hs.push({ stroke: null, wall: 0, u: 0, v: 0, pos: new THREE.Vector3(), normal: new THREE.Vector3(), vx: 0, vy: 0, size: 0, ended: false });
  const out = [];
  function wallPoint(wi, u, v, target = new THREE.Vector3()) {
    const w = walls[wi];
    return target.copy(w.pa).addScaledVector(_vb.subVectors(w.pb, w.pa), u).addScaledVector(_vc.subVectors(w.pc, w.pa), v);
  }
  function hands() {
    out.length = 0; handsFrame = frameNo;
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

  // ================================================================================================ T-048 (SIS): the shared system
  // ARTE-3 §3: one background per block (never pure black), one light recipe, one soft halo behind the hero object, and «la mano es
  // una linterna» (every material may read the hands as soft lights). Documented for parts in PARTS.md («What the room gives since T-048»).
  //
  // ---- the palette of the system per block (notas/ARTE.md §2): `bottom` / `top` = the background's deep gradient (the «Fondo» column,
  // lifted a little towards the chapter's colour above), `accent` = the chapter's accent for the fine graphics and the hands' light.
  // STUDIO NIGHT: from palette.js (PAL[block].sky / .accent): `bottom`, `horizon`, `top` = the sky seen from the eye (linear), `accent` =
  // the chapter's accent (the hand's answer), `light` (a target at rest), `shadow`, `ink`, `ach` (gold). Same shape as before + more.
  const PALETTE = Object.fromEntries(Object.entries(PAL).map(([k, p]) => [k, { bottom: p.lin.sky.bottom, horizon: p.lin.sky.horizon, top: p.lin.sky.top,
    accent: p.lin.accent, light: p.lin.light, shadow: p.lin.shadow, ink: p.lin.ink, ach: p.lin.ach, luma: p.luma }]));
  // ---- the grade and the air of each chapter (plan 05 §2.8: the light curve). ev = exposure in stops over the operator's; sat; lo / hi =
  // split tone (token hue, amount); lift = the blacks' colour (token, amount); ceil = the shoulder's top (display); vTop / vBot = the
  // vertical darkening; bloom = × the host's bloom; sky = × the background; air = the radial fog (see setAir); key = the light's
  // direction in the air (a lobe of the light's colour in the fog towards it), { dir: [x, y, z], token, k }.
  const GRADE = {
    wait:    { ev: 0.35, sat: 0.9, contrast: 1.0, lo: 'tinta', loK: 0.3, hi: 'os', hiK: 0.1, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.3, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.0072, height: 0.22, heightK: 0.5, start: 3.6, max: 0.7 } },
    intro:   { ev: 0.75, sat: 0.95, contrast: 1.0, lo: 'blau-plaça', loK: 0.3, hi: 'cal-fanal', hiK: 0.15, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.3, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.012, height: 0.25, heightK: 0.5, start: 3.6, max: 0.75, key: { dir: [0, 0.05, -1], token: 'fanal', k: 0.25 } } },
    brasa:   { ev: 0.35, sat: 0.85, contrast: 1.06, lo: 'tinta', loK: 0.25, hi: 'flama', hiK: 0.06, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.35, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.012, height: 0.22, heightK: 0.6, start: 4.5, max: 0.7 } },   // smoke: dark, the fires light it (no colour veil)
    pinya:   { ev: 0.3, sat: 0.95, contrast: 1.08, lo: 'blau-plaça', loK: 0.4, hi: 'cal-foc', hiK: 0.12, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.3, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.016, height: 0.18, heightK: 0.55, start: 6, max: 0.82 } },   // Beltrán 25-11: the festival night, spots through haze
    tronc:   { ev: 0.3, sat: 0.95, contrast: 1.08, lo: 'blau-plaça', loK: 0.4, hi: 'porcellana', hiK: 0.1, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.3, vBot: 0.2, bloom: 0.5, sky: 1,
      air: { density: 0.016, height: 0.16, heightK: 0.5, start: 6, max: 0.82 } },
    pom:     { ev: 0.45, sat: 0.85, contrast: 1.02, lo: 'nit-alta', loK: 0.35, hi: 'lluna', hiK: 0.1, lift: 'nit-alta', liftK: 0.35, ceil: 0.9, vTop: 0.25, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.0112, height: 0.2, heightK: 0.5, start: 3.6, max: 0.75 } },
    crown:   { ev: 0.4, sat: 0.95, contrast: 1.12, lo: 'tinta', loK: 0.3, hi: 'or-clar', hiK: 0.12, lift: 'tinta', liftK: 0.35, ceil: 0.88, vTop: 0.15, vBot: 0.15, bloom: 1, sky: 1,
      air: { density: 0.008, height: 0.12, heightK: 0.3, start: 6, max: 0.6 } },   // a gold burst inside the night
    festa:   { ev: 0.35, sat: 0.95, contrast: 1.05, lo: 'tinta', loK: 0.3, hi: 'or-clar', hiK: 0.12, lift: 'tinta', liftK: 0.35, ceil: 0.88, vTop: 0.2, vBot: 0.15, bloom: 1, sky: 1,
      air: { density: 0.008, height: 0.12, heightK: 0.3, start: 6, max: 0.6 } },
    baixada: { ev: 0.55, sat: 0.92, contrast: 1.02, lo: 'albergínia', loK: 0.3, hi: 'alba-rosa', hiK: 0.12, lift: 'albergínia', liftK: 0.35, ceil: 0.88, vTop: 0.15, vBot: 0.15, bloom: 0.7, sky: 1,
      air: { density: 0.014, height: 0.14, heightK: 0.4, start: 3.6, max: 0.8, key: { dir: [1, 0.08, 0], token: 'alba-rosa', k: 0.35 } } },
    fall:    { ev: 0.35, sat: 0.75, contrast: 1.02, lo: 'tinta', loK: 0.3, hi: 'cendra', hiK: 0.1, lift: 'tinta', liftK: 0.35, ceil: 0.9, vTop: 0.25, vBot: 0.2, bloom: 1, sky: 1,
      air: { density: 0.016, height: 0.2, heightK: 0.5, start: 3.6, max: 0.8 } },
    acta:    { ev: 0.5, sat: 0.82, contrast: 1.03, lo: 'ombra', loK: 0.25, hi: 'cal', hiK: 0.1, lift: 'ombra', liftK: 0.35, ceil: 0.88, vTop: 0.2, vBot: 0.15, bloom: 0.7, sky: 1,
      air: { density: 0.008, height: 0.15, heightK: 0.4, start: 3.6, max: 0.7, key: { dir: [0.6, 0.3, -1], token: 'cal', k: 0.2 } } },
  };
  // ---- the background: a sphere round the eye (r 320 m, inside the far plane), drawn first, without depth: whatever a part draws covers
  // it; where nothing is drawn the wall shows the chapter's sky. Three stops (bottom · a horizon band at the eye's height · top), eased
  // (~1.5 s) on every change. The SAME function colours the air (setAir): far things melt into the sky — aerial perspective, no outline.
  const P0 = PALETTE.wait;
  const bg = { bottom: uniform(v3(P0.bottom)), horizon: uniform(v3(P0.horizon)), top: uniform(v3(P0.top)), gain: uniform(opt.background ?? 1), sky: uniform(1),
    to: { bottom: [...P0.bottom], horizon: [...P0.horizon], top: [...P0.top], sky: 1 }, name: 'wait' };
  const skyAt = (d) => {                         // d: a unit direction from the eye
    const y = d.y, up = pow(smoothstep(0.0, 0.55, y), 0.8), dn = smoothstep(0.0, -0.4, y);
    return mix(mix(bg.horizon, bg.top, up), bg.bottom, dn).mul(bg.gain).mul(bg.sky);
  };
  const bgMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  bgMat.colorNode = Fn(() => skyAt(normalize(positionLocal)))();
  const bgMesh = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24), bgMat);
  bgMesh.name = 'room:background'; bgMesh.renderOrder = -1000; bgMesh.frustumCulled = false; bgMesh.position.copy(eye);
  scene.add(bgMesh);
  // setBackground('pinya') | setBackground({ bottom, horizon, top } (linear)) | setBackground('tronc', { top: […] }) · { gain } (0 = black)
  // A block name ALSO sets that block's grade and air (the host calls this on every block change); { grade: false } leaves them.
  function setBackground(what = 'wait', over = null) {
    const base = typeof what === 'string' ? PALETTE[what] || PALETTE.wait : what;
    const c = { ...base, ...(over || {}) };
    if (c.bottom) bg.to.bottom = [...c.bottom]; if (c.top) bg.to.top = [...c.top]; bg.to.horizon = [...(c.horizon || c.top || bg.to.horizon)];
    if (c.gain != null) bg.gain.value = c.gain;
    bg.name = typeof what === 'string' ? what : 'custom';
    if (typeof what === 'string' && c.grade !== false) { setGrade(what, { now: c.now }); setAir(what); airSweep(scene); porx.to = PORX_ON.has(what) ? 1 : 0; porx.lit.value = what === 'crown' || what === 'festa' ? 1 : 0; field.to = FIELD_ON.has(what) ? 1 : 0; }
    if (c.now) for (const key of ['bottom', 'horizon', 'top']) bg[key].value.fromArray(bg.to[key]);
  }
  function stepBackground(dt) {
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['bottom', 'horizon', 'top']) { const v = bg[key].value, t = bg.to[key]; v.x += (t[0] - v.x) * k; v.y += (t[1] - v.y) * k; v.z += (t[2] - v.z) * k; }
    bg.sky.value += (bg.to.sky - bg.sky.value) * k;
  }

  // ---- setGrade(block | { ev, sat, contrast, lo, loK, hi, hiK, lift, liftK, ceil, vTop, vBot, bloom, sky }, { now }) — the chapter's grade
  // (tokens by name). Eased ≈ 1.2 s (the mean luma never changes faster than ×2 per second). room.grade = the current targets.
  const gTo = {}; let gradeName = 'wait';
  const hueV = (t) => { const c = typeof t === 'string' ? palLin(t) : t, m = Math.max(c[0], c[1], c[2], 1e-4); return [c[0] / m, c[1] / m, c[2] / m]; };
  function setGrade(what = 'wait', o = {}) {
    const g = typeof what === 'string' ? { ...(GRADE[what] || GRADE.wait) } : { ...GRADE[gradeName], ...what };
    if (typeof what === 'string') gradeName = GRADE[what] ? what : 'wait';
    for (const k of ['ev', 'sat', 'contrast', 'loK', 'hiK', 'liftK', 'ceil', 'vTop', 'vBot', 'bloom']) if (g[k] != null) gTo[k] = g[k];
    if (g.lo) gTo.lo = hueV(g.lo); if (g.hi) gTo.hi = hueV(g.hi);
    if (g.lift) gTo.lift = typeof g.lift === 'string' ? palLin(g.lift) : g.lift;
    if (g.sky != null) bg.to.sky = g.sky;
    const p = PALETTE[gradeName]; gTo.accent = p.accent; gTo.shadow = p.shadow;
    if (o.now) stepGrade(1e3);
  }
  function stepGrade(dt) {
    const k = 1 - Math.exp(-dt * 1.6);
    for (const [key, t] of Object.entries(gTo)) {
      const U = G[key]; if (!U) continue;
      if (Array.isArray(t)) { const v = U.value; v.x += (t[0] - v.x) * k; v.y += (t[1] - v.y) * k; v.z += (t[2] - v.z) * k; } else U.value += (t - U.value) * k;
    }
    G.opExp.value = renderer.toneMappingExposure ?? 1;
  }

  // ---- the air (plan 05 V1; 04 §2.2): a RADIAL fog — distance from the eye, not the view depth (which differs ~14 % between the two
  // walls of a corner: a seam). Exponential with a height falloff (denser near the floor), starting at the wall planes (nothing in the
  // room is fogged), capped below 1 (silhouettes never vanish), breathing ±8 %. Its colour is the SKY in that direction (skyAt), plus a
  // lobe of the key light's colour towards the light. On every material with `fog` (the default); additive glows are exempted
  // automatically (airSweep: fog on an additive material would ADD the sky's colour as a slab).
  //   room.setAir({ density, height (1/m falloff), heightK (0..1 how much the height matters), start (m), max, key: { dir, token, k } })
  //   room.setAir('brasa') → that chapter's air (setBackground does this) · room.setAir({ density: 0 }) → no air
  const A = { density: uniform(0.02), height: uniform(0.2), heightK: uniform(0.5), start: uniform(3.6), max: uniform(0.7),
    keyDir: uniform(new THREE.Vector3(0, 0, -1)), keyCol: uniform(new THREE.Vector3(0, 0, 0)) };
  const aTo = { density: 0.02, height: 0.2, heightK: 0.5, start: 3.6, max: 0.7, keyCol: [0, 0, 0] };
  const eyeU = uniform(eye);
  const airFactor = Fn(() => {
    const rel = positionWorld.sub(eyeU), dist = length(rel);
    const breathe = sin(time.mul(0.21)).mul(0.08).add(1);
    const base = float(1).sub(exp(max(dist.sub(A.start), 0).mul(A.density).mul(breathe).negate()));
    const hf = mix(float(1), exp(max(positionWorld.y, 0).mul(A.height).negate()).mul(1.6).min(1.4), A.heightK);
    return clamp(base.mul(hf), 0, A.max);
  });
  const airColor = Fn(() => {
    const d = normalize(positionWorld.sub(eyeU));
    const lobe = pow(max(dot(d, normalize(A.keyDir)), 0), 6);
    return skyAt(d).add(A.keyCol.mul(lobe));
  });
  scene.fogNode = fog(airColor(), airFactor());
  function setAir(what = {}) {
    const a = typeof what === 'string' ? (GRADE[what] || GRADE.wait).air : what;
    for (const k of ['density', 'height', 'heightK', 'start', 'max']) if (a[k] != null) aTo[k] = a[k];
    if (a.key) { if (a.key.dir) A.keyDir.value.fromArray(a.key.dir); const c = typeof a.key.token === 'string' ? palLin(a.key.token, a.key.k ?? 0.3) : (a.key.color || [0, 0, 0]); aTo.keyCol = c; }
    else if (typeof what === 'string') aTo.keyCol = [0, 0, 0];
  }
  function stepAir(dt) {
    const k = 1 - Math.exp(-dt * 1.2);
    for (const key of ['density', 'height', 'heightK', 'start', 'max']) A[key].value += (aTo[key] - A[key].value) * k;
    const v = A.keyCol.value, t = aTo.keyCol; v.x += (t[0] - v.x) * k; v.y += (t[1] - v.y) * k; v.z += (t[2] - v.z) * k;
  }
  // additive (and multiply / subtractive) materials never take the air; a material can opt out with userData.air = false (or fog = false)
  const swept = new WeakSet();
  function airSweep(root) {
    root.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        if (swept.has(m)) continue; swept.add(m);
        if (m.fog && (m.blending === THREE.AdditiveBlending || m.blending === THREE.MultiplyBlending || m.blending === THREE.SubtractiveBlending || m.userData?.air === false)) { m.fog = false; m.needsUpdate = true; }
      }
    });
  }
  { const add0 = scene.add.bind(scene); scene.add = (...objs) => { for (const o of objs) if (o?.traverse) airSweep(o); return add0(...objs); }; }

  // ---- «la mano es una linterna» (refs/saltmere gradient-border-flashlight): up to FL_N hands as soft lights, world positions ON the wall
  // planes, radius FL_R. room.flash(positionNode) → TSL float (1 at a hand, ~0.07 at FL_R, ~0 beyond; summed, ≤ 1.5): distance in 3D,
  // so a hand near a corner also lights what is near it on the neighbouring wall. Lights come in fast (≈ 70 ms) and go in ≈ 0.4 s.
  // room.flashLights = the uniforms (vec4: xyz position, w strength 0..1); room.flashAt(Vector3) = the same value on the CPU.
  const FL_N = 6, FL_R = 0.9;
  const flU = Array.from({ length: FL_N }, () => uniform(new THREE.Vector4(0, -99, 0, 0)));
  const flS = Array.from({ length: FL_N }, () => ({ stroke: null, s: 0, seen: false, pos: new THREE.Vector3(0, -99, 0) }));
  const flR = uniform(FL_R);
  function flash(p) {
    let acc = float(0);
    for (const L of flU) { const d = length(p.sub(L.xyz)).div(flR); acc = acc.add(L.w.mul(exp(d.mul(d).mul(-2.6)))); }
    return min(acc, float(1.5));
  }
  function flashAt(p) { let a = 0; for (const S of flS) { if (S.s <= 0.001) continue; const d = p.distanceTo(S.pos) / FL_R; a += S.s * Math.exp(-2.6 * d * d); } return Math.min(a, 1.5); }
  let handsFrame = -1, frameNo = 0;
  function stepFlash(dt) {
    if (handsFrame !== frameNo) hands();                            // nobody asked this frame: read them here
    for (const S of flS) S.seen = false;
    for (const h of out) {
      if (h.ended) continue;
      let S = null;
      for (const c of flS) if (c.stroke === h.stroke) { S = c; break; }
      if (!S) for (const c of flS) if (!c.seen && (c.stroke === null || c.s < 0.02) && (!S || c.s < S.s)) S = c;
      if (!S) continue;
      if (S.stroke !== h.stroke) { S.stroke = h.stroke; S.s = 0; }
      S.seen = true; S.pos.copy(h.pos);
    }
    for (let i = 0; i < FL_N; i++) {
      const S = flS[i]; S.s += ((S.seen ? 1 : 0) - S.s) * (1 - Math.exp(-dt * (S.seen ? 14 : 2.5)));
      if (!S.seen && S.s < 0.005) { S.s = 0; S.stroke = null; }
      flU[i].value.set(S.pos.x, S.pos.y, S.pos.z, S.s);
    }
  }

  // ---- the ONE light recipe (ARTE-3 §1, notas/ARTE.md §3): a warm, broad key from above the room's centre (each wall sees its objects lit
  // from above and from the public), a low cool fill (hemisphere, ≤ 10 %), and the cool rim as a NODE (a view-dependent Fresnel term, true
  // on all four walls at once — no light per wall). A part adds `recipe.group` to its own object (the host keeps the set of lights steady)
  // and adds `recipe.rim()` to its materials' emissiveNode (or colorNode for basic materials).
  //   const recipe = room.lightRecipe({ warm: 0xFFE0BC, cool: 0x9FB4D8, key: 2.2, fill: 0.08 });  part.object.add(recipe.group);
  //   mat.emissiveNode = room.rimNode([0.62, 0.74, 1.0], 0.6, 3);
  function rimNode(color = [0.62, 0.74, 1.0], k = 0.6, power = 3) {
    const V = normalize(cameraPosition.sub(positionWorld)), g = float(1).sub(abs(dot(normalize(normalWorld), V)));
    return vec3(color[0], color[1], color[2]).mul(pow(g, power)).mul(k);
  }
  function lightRecipe({ warm = 0xFFE0BC, cool = 0x9FB4D8, key = 2.2, fill = 0.08, height = 7.5 } = {}) {
    const group = new THREE.Group(); group.name = 'lightRecipe';
    const keyL = new THREE.PointLight(warm, key, 0, 0); keyL.position.set(eye.x, height, eye.z); keyL.userData.atmos = false; group.add(keyL);
    const fillL = new THREE.HemisphereLight(cool, warm, fill); group.add(fillL);
    const c = new THREE.Color(cool);
    return { group, key: keyL, fill: fillL, rim: (k = 0.6, power = 3) => rimNode([c.r, c.g, c.b], k, power) };
  }
  // ---- the soft radial halo behind a hero object (ARTE-3 §3): an additive disc, no edge, facing the eye. `placeHalo(h, at, behind)` puts
  // it `behind` m further from the eye than `at`. Keep `intensity` ≤ 0.3 where it sits behind a quiet zone (≤ 35 % luminance).
  //   const halo = room.makeHalo({ color: [1, 0.8, 0.55], radius: 2.4, intensity: 0.22 });  part.object.add(halo.mesh);  room.placeHalo(halo, hero.position, 1.5);
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  function makeHalo({ color = [1, 0.82, 0.6], radius = 2.4, intensity = 0.22 } = {}) {
    const U = { color: uniform(new THREE.Vector3(...color)), k: uniform(intensity) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const q = uv().sub(0.5).mul(2), r2 = dot(q, q);
    m.colorNode = U.color.mul(exp(r2.mul(-3.2)).sub(exp(float(-3.2))).max(0)).mul(U.k);
    const mesh = new THREE.Mesh(haloGeo, m); mesh.name = 'room:halo'; mesh.scale.setScalar(radius * 2); mesh.renderOrder = -10;
    return { mesh, U, set(o = {}) { if (o.color) U.color.value.fromArray(o.color); if (o.intensity != null) U.k.value = o.intensity; if (o.radius != null) mesh.scale.setScalar(o.radius * 2); } };
  }
  const _hd = new THREE.Vector3();
  function placeHalo(h, at, behind = 1.2) {
    _hd.subVectors(at, eye); _hd.y = 0; if (_hd.lengthSq() < 1e-6) _hd.set(0, 0, -1); _hd.normalize();
    h.mesh.position.copy(at).addScaledVector(_hd, behind); h.mesh.lookAt(eye.x, h.mesh.position.y, eye.z);
  }

  // ---- THE ONE MATTER (D4, plan 05 V3): glazed ceramic / trencadís — a standard material (cheap ×4 walls) with a roughness that varies
  // over the surface (a specular that changes as the light moves reads as matter; never below 0.14: no sparkle in projection), a darker
  // glaze in the worn hollows, the room's environment, a fine cold rim (the figure–ground separation) and the hands' light in the
  // chapter's accent («la mano es una linterna»). Colours are palette tokens (or linear [r, g, b]); instance colours multiply.
  //   const m = room.matter.ceramic({ color: 'porcellana', glaze: 0.7, wear: 0.3 });
  //   const b = room.matter.body({ color: 'cal-foc', faixa: 'faixa', faixaY: [0.95, 1.12] });   // y in the body's own metres (feet at 0)
  const colOf = (c) => (typeof c === 'string' ? palLin(c) : Array.isArray(c) ? c : c?.isColor ? [c.r, c.g, c.b] : [0.8, 0.78, 0.74]);
  const RIM = palLin('lluna');
  function ceramic({ color = 'os', glaze = 0.6, wear = 0.3, rim = 0.35, hands = 0.35, env = 1, scale = 1, side = THREE.FrontSide } = {}) {
    const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, side });
    m.color.setRGB(...colOf(color));
    const p = positionGeometry.mul(scale);   // (the shape's own coordinates: positionLocal includes an InstancedMesh's instance matrix)
    const n1 = mx_noise_float(p.mul(2.3)), n2 = mx_noise_float(p.mul(13.0));
    const base = mix(float(0.62), float(0.2), float(glaze));
    m.roughnessNode = clamp(base.add(n1.mul(0.14 * wear)).add(n2.mul(0.07 * wear)), 0.14, 0.92);
    const hollow = smoothstep(0.25, 0.75, n2.mul(0.5).add(0.5)).mul(0.16 * wear);
    m.colorNode = vec3(...colOf(color)).mul(float(1).sub(hollow));
    if (envMap) { m.envMap = envMap; m.envMapIntensity = (0.25 + glaze * 0.55) * env; }
    m.emissiveNode = rimNode(RIM, rim, 3.5).add(G.accent.mul(flash(positionWorld)).mul(hands * 0.35));
    m.userData.matter = 'ceramic';
    return m;
  }
  function body({ color = 'cal-foc', faixa = 'faixa', faixaY = [0.95, 1.12], glaze = 0.45, wear = 0.35, rim = 0.4, hands = 0.4 } = {}) {
    const m = ceramic({ color, glaze, wear, rim, hands, scale: 1.6 });
    const band = smoothstep(faixaY[0] - 0.015, faixaY[0] + 0.015, positionGeometry.y).mul(float(1).sub(smoothstep(faixaY[1] - 0.015, faixaY[1] + 0.015, positionGeometry.y)));
    const n2 = mx_noise_float(positionGeometry.mul(20.8)), hollow = smoothstep(0.25, 0.75, n2.mul(0.5).add(0.5)).mul(0.16 * wear);
    m.colorNode = mix(vec3(...colOf(color)), vec3(...colOf(faixa)), band).mul(float(1).sub(hollow));
    m.userData.matter = 'body';
    return m;
  }
  const matter = { ceramic, body };

  // ---- THE PRINT OF THE HANDS (plan 05 V6; 01 §2.6, Sequins): a persistent mask painted by the hands round the room. One small float
  // target over perimeter × height (1800 × 228: ~1.5 cm a texel; it wraps at the P3|P4 seam), ping-pong, one quad pass a frame:
  //   R = the print (each hand seals a disc of 25 cm, reaches 1 in ~0.3 s; decays with τ 26 s: still visible a minute later)
  //   G = the touch now (τ 0.6 s).
  // room.heat        TextureNode (u = perimeter s / PER, v = height / H; RepeatWrapping in u)
  // room.heatAt(s, y) TSL vec2 (R, G) at perimeter s (m, continuous round the room) and height y (m)
  // room.heatAtWorld(p) TSL vec2 at a WORLD point (the wall point seen in its direction from the eye: anything behind a wall reads the
  //                   print of the wall in front of it)
  // room.stamp(s, y, radius = 0.25, k = 1) a scripted print (≤ 16 a frame) · room.wallS(wallIndex, u) → s (m) · room.PER
  const HW = 1800, HH = 228, PERIM = walls.reduce((a, w) => a + w.width, 0), HMAX = Math.max(...walls.map((w) => w.height));
  const wCum = []; { let a = 0; for (const w of walls) { wCum.push(a); a += w.width; } }
  const wallS = (wi, u) => wCum[wi] + u * walls[wi].width;
  const hrt = () => { const rt = new THREE.RenderTarget(HW, HH, { type: THREE.HalfFloatType, depthBuffer: false }); rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter; return rt; };
  let heatA = hrt(), heatB = hrt();
  const heatPrev = texture(heatA.texture), heatTex = texture(heatB.texture);
  const HS_N = 32, hsVec = Array.from({ length: HS_N }, () => new THREE.Vector4(0, 0, 0.25, 0)), uHS = uniformArray(hsVec, 'vec4');
  const hDecay = uniform(1), hDecayG = uniform(1), hDt = uniform(0);
  const heatMat = new THREE.NodeMaterial(); heatMat.depthTest = false; heatMat.depthWrite = false;
  heatMat.fragmentNode = Fn(() => {
    const p = uv(), prev = heatPrev.sample(p);
    const sx = p.x.mul(PERIM), sy = p.y.mul(HMAX), add = float(0).toVar();
    Loop(HS_N, ({ i }) => {
      const S = uHS.element(i);
      If(S.w.greaterThan(0.0001), () => {
        const dx = sx.sub(S.x), du = dx.sub(floor(dx.div(PERIM).add(0.5)).mul(PERIM)), dv = sy.sub(S.y);
        const r2 = du.mul(du).add(dv.mul(dv)).div(S.z.mul(S.z));
        add.addAssign(exp(r2.mul(-2.2)).mul(S.w));
      });
    });
    const R = min(prev.x.mul(hDecay).add(add.mul(hDt).mul(3.5)), 1.0), Gc = min(prev.y.mul(hDecayG).add(add.mul(hDt).mul(6.0)), 1.0);
    return vec4(R, Gc, 0, 1);
  })();
  const heatQuad = new THREE.QuadMesh(heatMat);
  let hsN = 0;
  function stamp(sm, y, radius = 0.25, k = 1) { if (hsN >= 16) return; hsVec[16 + hsN].set(((sm % PERIM) + PERIM) % PERIM, y, radius, k / Math.max(hDt.value, 1 / 120)); hsN++; }
  function stepHeat(dt) {
    let n = 0;
    for (const h of out) { if (n >= 16) break; if (h.ended) continue; hsVec[n].set(wallS(h.wall, h.u), h.v * walls[h.wall].height, 0.25, 1); n++; }
    for (let i = n; i < 16; i++) hsVec[i].w = 0;
    for (let i = 16 + hsN; i < HS_N; i++) hsVec[i].w = 0;
    hDt.value = Math.min(dt, 0.1); hDecay.value = Math.exp(-dt / 26); hDecayG.value = Math.exp(-dt / 0.6);
    const sw = heatA; heatA = heatB; heatB = sw;                    // read last frame's, write the new one
    heatPrev.value = heatA.texture;
    renderer.setRenderTarget(heatB); heatQuad.render(renderer);
    heatTex.value = heatB.texture; hsN = 0;
  }
  const heatAt = (sNode, yNode) => heatTex.sample(vec2(sNode.div(PERIM), yNode.div(HMAX))).xy;
  const heatAtWorld = (p) => {                                       // the wall in front of the world point, seen from the eye
    const d = vec3(p.x.sub(eye.x), 0, p.z.sub(eye.z)), dl = max(length(d), 1e-4), dir = d.div(dl);
    const best = float(1e6).toVar(), sOut = float(0).toVar(), yOut = float(0).toVar();
    walls.forEach((w, i) => {
      const nx = w.normal.x, nz = w.normal.z, den = dir.x.mul(-nx).add(dir.z.mul(-nz));
      const dist = -((w.pa.x - eye.x) * nx + (w.pa.z - eye.z) * nz);
      const t = float(dist).div(max(den, 1e-4));
      const hx = dir.x.mul(t).add(eye.x - w.pa.x), hz = dir.z.mul(t).add(eye.z - w.pa.z), along = hx.mul(w.right.x).add(hz.mul(w.right.z));
      const ok = den.greaterThan(1e-4).and(t.lessThan(best)).and(along.greaterThanEqual(-0.01)).and(along.lessThanEqual(w.width + 0.01));
      If(ok, () => { best.assign(t); sOut.assign(along.add(wCum[i])); yOut.assign(float(eye.y).add(p.y.sub(eye.y).mul(t.div(dl)))); });
    });
    return heatAt(sOut, yOut);
  };

  // ---- THE PORXADA (plan 05 V5; 04 §1.4, layer 0): a Catalan porch round the room — a square stone column (0.42 m) standing just
  // behind EACH CORNER of the room (behind both walls: it hides the corner's fold and gives a known human scale) and a lintel along each
  // wall whose underside is seen as a dark band at the top of the image (above 3.45 m: never in the 0.6–2.0 m band). Almost black (the
  // chapter's shadow token), the one matter, lit by whatever light the world has and by the hands. We look at the square THROUGH it.
  // Present in intro, brasa, pinya, tronc, baixada (setBackground sets it); room.setPorxada(0..1) overrides. It comes and goes by a
  // dissolve of fragments (screen-door), the work's language. In the scene root: the same frame in both worlds of a transition.
  const PORX_ON = new Set(['intro', 'brasa', 'pinya', 'tronc', 'pom', 'crown', 'baixada']);   // (pinya is the abstract field: no porch)
  const porx = { k: uniform(0), to: 0, group: new THREE.Group(), lit: uniform(0) };
  porx.group.name = 'room:porxada';
  {
    const pm = ceramic({ color: [0.012, 0.011, 0.013], glaze: 0.2, wear: 0.6, rim: 0.1, hands: 0.5, env: 0.25 });
    pm.userData.air = false; pm.fog = false;                       // layer 0: crisp and almost black, never hazed
    const baseCol = pm.colorNode;
    pm.colorNode = Fn(() => {
      const h = fract(sin(dot(floor(screenCoordinate.xy.div(3)), vec2(12.9898, 78.233))).mul(43758.5453));
      If(h.greaterThan(porx.k), () => { Discard(); });
      return baseCol.mul(G.shadow.mul(6.0).add(0.4)).mul(mix(float(1), float(11), porx.lit));   // the chapter's shadow tone, very dark; lit bronze stone in the gold chapters
    })();
    const colG = new THREE.BoxGeometry(0.42, 6.0, 0.42).translate(0, 3.0, 0);
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i], wp = walls[(i + walls.length - 1) % walls.length];
      const back = w.normal.clone().add(wp.normal).multiplyScalar(-0.5);           // into the world, away from both walls
      const c = new THREE.Mesh(colG, pm); c.position.copy(w.pa).addScaledVector(back, 0.62); c.position.y = 0;
      c.lookAt(c.position.x + back.x, 0, c.position.z + back.z); porx.group.add(c);
      // the springers: a short beam from each corner (1.1 m), underside at 3.72 m, just behind the wall — never a full-width band
      for (const [end, sgn] of [[w.pa, 1], [w.pb, -1]]) {
        const L = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.3).translate(0, 0.25, 0), pm);
        L.position.copy(end).addScaledVector(w.right, sgn * 0.45).addScaledVector(w.normal, -0.28); L.position.y = 3.72;
        L.lookAt(L.position.x - w.normal.x, 3.72, L.position.z - w.normal.z); porx.group.add(L);
      }
    }
    porx.group.visible = false; scene.add(porx.group);
  }
  function setPorxada(k = 1) { porx.to = Math.max(0, Math.min(1, k)); }

  const texCache = new Map(), texLoader = new THREE.TextureLoader();
  const ccTex = (name, map, srgb) => {
    const key = name + map; if (texCache.has(key)) return texCache.get(key);
    const t = texLoader.load(new URL(`./assets/cc0/${name}/${name}_${map}_1k.jpg`, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = renderer.getMaxAnisotropy ? Math.min(16, renderer.getMaxAnisotropy() || 8) : 8;
    texCache.set(key, t); return t;
  };

  // ---- THE FIELD (director 25-11: Pinya is an ABSTRACT world — «a gathering of light in the night»): a dark polished ground that goes on
  // to a low warm glow on the horizon far away, haze in layers (the room's air), and where hands have been (room.heat: the people
  // who came to the wall) warm pools of light lie on the ground just behind the wall, staying ~a minute. Palette pinya (cal-foc,
  // terracota, ombra; faixa). No plaza, no porch. Shown by setBackground for FIELD_ON; it dissolves in / out like the porch.
  const FIELD_ON = new Set([]);   // AD#5: Pinya went back to the night square (the field stays available: room.field.set(1))
  const field = { k: uniform(0), to: 0, group: new THREE.Group() };
  field.group.name = 'room:field';
  {
    const dith = () => fract(sin(dot(floor(screenCoordinate.xy.div(2)), vec2(12.9898, 78.233))).mul(43758.5453));
    // the ground: dark, glossy, reflecting the room's environment; the pools are emissive
    const gm = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.22 });
    const OMB = vec3(...palLin('ombra')), CALF = vec3(...palLin('cal-foc')), TERR = vec3(...palLin('terracota')), FAIX = vec3(...palLin('faixa'));
    // wet dark stone (AD 25-11): the slab texture in world metres, darkened; puddles glossier
    const fUV = positionWorld.xz.div(2.4), slab = texture(ccTex('large_sandstone_blocks', 'diff', true), fUV).rgb;
    gm.colorNode = Fn(() => { If(dith().greaterThan(field.k), () => { Discard(); }); return slab.mul(OMB.mul(0.5).add(0.02)).mul(0.55); })();
    gm.normalMap = ccTex('large_sandstone_blocks', 'nor_gl', false);
    const pw = positionWorld;
    gm.roughnessNode = clamp(mx_noise_float(vec3(pw.x.mul(0.25), 1.3, pw.z.mul(0.25))).mul(0.12).add(0.24), 0.14, 0.5);
    if (envMap) { gm.envMap = envMap; gm.envMapIntensity = 0.12; }   // (the env's coloured panels read as pastel blobs on the wet floor)
    gm.emissiveNode = Fn(() => {
      // the pool behind each place where hands were: the print at hand height along that direction, lying 0.3–2.2 m behind the wall
      const d = vec3(pw.x.sub(eye.x), 0, pw.z.sub(eye.z)), dist = length(d);
      const hp = heatAtWorld(vec3(pw.x, eye.y, pw.z));                   // the wall straight in front of this ground point, at eye height
      const hb = heatAtWorld(vec3(pw.x, eye.y - 0.45, pw.z));
      const H = max(hp.x, hb.x).mul(0.8).add(max(hp.y, hb.y).mul(0.6));
      // how far behind the wall: the wall distance in this direction ≈ the nearest wall plane (rectangle room)
      let wd = float(1e3);
      for (const w of walls) { const den = d.x.mul(-w.normal.x).add(d.z.mul(-w.normal.z)).div(max(dist, 1e-3)); const dd = -((w.pa.x - eye.x) * w.normal.x + (w.pa.z - eye.z) * w.normal.z); wd = min(wd, select(den.greaterThan(0.05), float(dd).div(den), float(1e3))); }
      const behind = dist.sub(wd), band = exp(behind.sub(0.9).div(0.55).pow(2).negate());
      const flick = mx_noise_float(vec3(pw.x.mul(1.3), time.mul(0.4), pw.z.mul(1.3))).mul(0.15).add(0.9);
      return mix(TERR, CALF, clamp(H.mul(0.5), 0, 1)).mul(H.mul(band).mul(flick).mul(0.9));
    })();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 120).rotateX(-Math.PI / 2), gm); ground.position.y = 0.002; ground.receiveShadow = true;
    field.group.add(ground);
    // the low warm glow on the horizon, far away: an open cylinder at 46 m, additive, brighter at the ground line, breathing, uneven round
    const hm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false });
    hm.colorNode = Fn(() => {
      const y = positionLocal.y, a = atan(positionLocal.z, positionLocal.x);
      const uneven = mx_noise_float(vec3(cos(a).mul(2.2), sin(a).mul(2.2), time.mul(0.03))).mul(0.5).add(0.6);
      const v = exp(y.div(-1.6)).mul(smoothstep(-0.2, 0.3, y));
      return mix(TERR, CALF, exp(y.div(-0.5))).mul(v).mul(uneven).mul(0.0).mul(field.k);   // AD 25-11: no glowing band
    })();
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 9, 96, 1, true).translate(0, 4.5, 0), hm); glow.renderOrder = -500; glow.frustumCulled = false;
    field.group.add(glow);
    // the far square, only suggested: facades as sparse warm points at 26–42 m, dissolving into the haze (the room's air)
    {
      const NPT = 9000, pos = new Float32Array(NPT * 3); let s0 = 99173; const rn = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
      for (let i = 0; i < NPT; i++) {
        const a = rn() * Math.PI * 2, rad = 26 + rn() * 16, blockA = Math.floor(a / 0.21), hgt = 5 + ((blockA * 7919) % 4);
        let y = rn() * hgt; const wy = (y % 3.2) / 3.2, wa = (a * rad % 2.4) / 2.4;
        if (rn() < 0.55) y = Math.floor(y / 3.2) * 3.2 + 1.2 + (rn() - 0.5) * 0.9;            // windows' rows
        if (rn() < 0.12) y = hgt;                                                             // roof lines
        pos.set([Math.cos(a) * rad, Math.max(0, y), Math.sin(a) * rad], i * 3); void wy; void wa;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pmat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      pmat.colorNode = CALF.mul(0.16).mul(field.k).mul(exp(length(positionWorld.sub(eyeU)).sub(26.0).mul(-0.06)));
      const pts = new THREE.Points(g, pmat); pts.frustumCulled = false; field.group.add(pts);
    }
    field.group.position.set(eye.x, 0, eye.z);
    field.group.visible = false; scene.add(field.group);
  }
  function stepField(dt) {
    const v = field.k.value + (field.to - field.k.value) * (1 - Math.exp(-dt * 1.1));
    field.k.value = Math.abs(v - field.to) < 0.003 ? field.to : v; field.group.visible = field.k.value > 0.003;
  }

  function stepPorx(dt) {
    const v = porx.k.value + (porx.to - porx.k.value) * (1 - Math.exp(-dt * 1.2));
    porx.k.value = Math.abs(v - porx.to) < 0.003 ? porx.to : v; porx.group.visible = porx.k.value > 0.003;
  }

  // ---- THE GROUND THAT GOES ON (plan 05 V4; 04 §1.5): a floor at y = 0 at REAL scale, so the room's floor seems to continue into the image.
  // CC0 maps of assets/cc0 in world-space UV (one texture tile = `metres`), max anisotropy (the texture gradient IS the floor's depth cue),
  // tinted by a palette token, wet patches (roughness down to `wetRough`), receives the key shadow, takes the air. A disc of `radius` m.
  //   const g = room.ground({ tile: 'old_mosaic_floor', metres: 1.6, color: 'pedra-llum', wet: 0.3 }); part.object.add(g.mesh);
  function ground({ tile = 'old_mosaic_floor', metres = 1.6, color = 'pedra-llum', tint = 0.7, wet = 0.25, wetRough = 0.12, radius = 80, y = 0 } = {}) {
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
    const tuv = positionWorld.xz.div(metres);
    const dif = texture(ccTex(tile, 'diff', true), tuv).rgb, rgh = texture(ccTex(tile, 'rough', false), tuv).r;
    const tc = vec3(...colOf(color)), dl = dot(dif, vec3(0.2126, 0.7152, 0.0722));
    mat.colorNode = mix(dif, dif.div(max(dl, 0.02)).mul(0.5).mul(tc).mul(dl.add(0.25)), float(tint));   // the map's detail, the chapter's tone
    const wz = smoothstep(0.15, 0.55, mx_noise_float(vec3(positionWorld.x.mul(0.35), 0.7, positionWorld.z.mul(0.35)))).mul(wet);
    mat.roughnessNode = mix(clamp(rgh.mul(0.6).add(0.35), 0.3, 1), float(wetRough), wz);
    mat.normalMap = ccTex(tile, 'nor_gl', false); mat.normalScale = new THREE.Vector2(1, 1);
    if (envMap) { mat.envMap = envMap; mat.envMapIntensity = 0.6; }
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2), mat);
    mesh.position.y = y; mesh.receiveShadow = true; mesh.name = 'room:ground';
    return { mesh, material: mat };
  }

  // ---- THE KEY SHADOW (plan 05 V7; 04 §2.3, §1.8): ONE light with a real shadow map per world — what gives the light worlds their depth
  // (dark defined shadow over light ground). three's ShadowNode re-renders the map for EVERY camera of a frame (four walls = ×4): here the
  // map is rendered once per frame (autoUpdate off, needsUpdate before the first wall). PCF soft, 2048², an orthographic box round the eye.
  //   room.keyShadow(directionalLight, { extent: 30, size: 2048, radius: 4, bias, normalBias }) → { light, off() }
  //   Casters / receivers opt in: mesh.castShadow = mesh.receiveShadow = true (keep casters few: the square, the tower, the crowd).
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const keyLights = new Set();
  // { static: true }: the map is rendered only when .dirty() is called (static casters: the square) — the part calls it when its light or
  // its geometry moves. Quality (room.quality): high 2048², medium 1024², low no shadow (returns a stub).
  function keyShadow(light, { extent = 30, size = 2048, radius = 4, near = 1, far = 160, bias = -0.0005, normalBias = 0.04, static: stat = false } = {}) {
    if (!light?.shadow) return null;
    if (QUALITY === 'low') return { light, off() {}, dirty() {} };
    if (QUALITY === 'medium') size = Math.min(size, 1024);
    light.castShadow = true; light.shadow.mapSize.set(size, size); light.userData.shadowStatic = stat; light.userData.shadowDirty = true;
    const c = light.shadow.camera; if (c.isOrthographicCamera) { c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent; }
    c.near = near; c.far = far; c.updateProjectionMatrix();
    light.shadow.bias = bias; light.shadow.normalBias = normalBias; light.shadow.radius = radius;
    light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    keyLights.add(light);
    return { light, off() { keyLights.delete(light); }, dirty() { light.userData.shadowDirty = true; } };
  }
  function shadowsOnce() { for (const L of keyLights) if (L.intensity > 0 && (!L.userData.shadowStatic || L.userData.shadowDirty)) { L.shadow.needsUpdate = true; L.userData.shadowDirty = false; } }

  // ---- contact shadows (plan 05 V3; 04 §2.3): what makes a thing STAND. One InstancedMesh of soft discs flat on the floor (+4 mm), in the
  // chapter's shadow colour (never black), no air. set(i, x, z, radius, k) — k 0..1 (0.5–0.7 under a figure); clear(i); the mesh goes
  // in the part's own object. Radius ≈ 0.6 × the figure's width.
  //   const cs = room.contactShadows(64); part.object.add(cs.mesh); cs.set(0, x, z, 0.35, 0.6);
  const csGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function contactShadows(maxN = 64, { color = null, y = 0.004 } = {}) {
    const kA = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1); kA.setUsage(THREE.DynamicDrawUsage);
    const geo = csGeo.clone(); geo.setAttribute('csK', kA);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const q = uv().sub(0.5).mul(2), r2 = dot(q, q);
    const col = color ? vec3(...colOf(color)) : G.shadow;
    mat.colorNode = col;
    mat.opacityNode = exp(r2.mul(-3.6)).sub(exp(float(-3.6))).max(0).mul(instancedDynamicBufferAttribute(kA)).mul(0.9);
    const mesh = new THREE.InstancedMesh(geo, mat, maxN); mesh.name = 'room:contactShadows'; mesh.frustumCulled = false; mesh.renderOrder = -5;
    const o = new THREE.Object3D();
    for (let i = 0; i < maxN; i++) { o.position.set(0, -50, 0); o.scale.setScalar(0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); }
    let dirty = false;
    return { mesh, count: maxN,
      set(i, x, z, r = 0.35, k = 0.6) { if (i < 0 || i >= maxN) return; o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.set(r * 2, 1, r * 2); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); kA.array[i] = k; mesh.instanceMatrix.needsUpdate = true; kA.needsUpdate = true; dirty = true; },
      clear(i) { if (i < 0 || i >= maxN) return; kA.array[i] = 0; kA.needsUpdate = true; },
      setK(i, k) { if (i < 0 || i >= maxN) return; kA.array[i] = k; kA.needsUpdate = true; },
      get dirty() { return dirty; } };
  }

  // ---- the overlay: a second, small scene drawn over the final image of every wall, after the tile composition (so the tiles never
  // break it): the host's guiding thread (T-028). No depth: draw it additive or with depthTest off.
  const overlay = new THREE.Scene();
  let overlayCount = 0;

  let t = 0, swept0 = false, heatErr = false;
  setGrade('wait', { now: true }); setAir('wait'); for (const k of ['density', 'height', 'heightK', 'start', 'max']) A[k].value = aTo[k];
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
    stepFlash(dt); stepBackground(dt); stepGrade(dt); stepAir(dt); stepPorx(dt); stepField(dt); frameNo++;
    try { stepHeat(dt); } catch (err) { if (!heatErr) { heatErr = true; console.info('room3d: the hands\' print is off (' + err.message + ')'); } }
    if (!swept0) { swept0 = true; airSweep(scene); }   // whatever was added before the room existed or without scene.add
    if (ENV.pending) bakeEnvironment();
    jitter();
    const tl = tiles.on && !!pass;
    if (tl) { pass('out'); shadowsOnce(); clearTo(stripOut); views(stripOut, scene, true); pass('in'); }
    shadowsOnce(); clearTo(strip); views(strip, scene, true);
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
  function setBloom(o = {}) { for (const k of ['strength', 'radius', 'threshold']) if (o[k] != null) B[k].value = o[k] * (k === 'strength' ? BLOOM_K : 1); }
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

  return { THREE, renderer, scene, overlay, clearColor, walls, eye, hands, wallPoint, render, setBloom,
    // T-048 (SIS): the shared system — see PARTS.md «What the room gives since T-048»
    quality: QUALITY, PALETTE, PAL, GRADE, setBackground, background: bg, setGrade, grade: gTo, gradeU: G, setAir, air: A, airSweep, sky: skyAt, matter, contactShadows, keyShadow, ground, setPorxada, porxada: porx, field: { set: (k) => { field.to = Math.max(0, Math.min(1, k)); }, uniforms: field }, heat: heatTex, heatAt, heatAtWorld, stamp, wallS, PER: PERIM, flash, flashAt, flashLights: flU, FLASH_R: FL_R, lightRecipe, rimNode, makeHalo, placeHalo, setEye, setTiles, tileFront, tiles, envMap, useEnvironment, captureEnvironment, setEnvironment, environment: ENV, ENV_PRESETS, aa: TAA ? 'taa' : (opt.samples ? 'msaa' : 'none'), backend, strip, pipeline };
}
