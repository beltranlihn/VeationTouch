// Ressonància — part «plaza3d»: the intro's night square, modelled in Blender and BAKED (contract: ../PARTS.md).
// Source: ../plaza3d/blender/ (plaza_gen.py = the model, plaza_bake.py + plaza_bake_encode.py = the panorama, plaza_points.py =
// the point cloud). Files: ./plaza3d/bake/ (bake.json, beauty_<k>.png RGBM slices, light_<j>.png light shares, depth.png) and
// ./plaza3d/points.bin + points.json.
//
// Two layers, both seen from the room's eye (0, 1.6, 0):
//   THE PLATE — one 360° equirectangular panorama path-traced in Cycles, on a sphere round the eye whose vertices sit at the baked
//     depth (so castells and points behind lamps and facades are hidden where they should be). Every pixel samples the panorama by
//     its direction from the eye: from the eye the image is exact whatever the mesh. The light is split in groups (each standing
//     lamp, each side's wall lanterns, arcades and windows, the stained glass, the lamp glass, the sky): the plate relights as
//     beauty · Σ k_i · share_i, so lamps can light one by one, windows breathe and P1 stays calm behind the text.
//   THE POINTS — the same model as ~400 k points (edges, windows and cornices denser): they condense out of a scattered dust,
//     settle on the architecture and hand over to the plate.
//
// params (live): reveal 0..1 (0–0.6 the points condense, edges and windows first; 0.5–1 they fade into the plate; 1 = the square),
//   shatter 0..1 (the reverse: the plate breaks back into points that drift up and thin out), lamps, windows, sky, stained, calm
//   (0..1, how much P1's arcades and windows are dimmed: it is the wall that explains), fog (live mist over the baked one),
//   silhouette (0..1, the square drawn dark), points (0..1 density), handLamp (a hand lights the nearest standing lamp, T-056).
//   THE SQUARE OF PARTICLES (intro 17–55 s): reveal back to 0.55 (the plate goes, its depth stays so only what the eye sees of the
//   square remains, settled), with pointGain ≈ 0.09, breathe 1 (a slow breathing), cool ≈ 0.5 (cold stone, warm windows);
//   then shatter 0 → 1 lifts them away from there without a jump.
//   occlude (0/1, default 1): with the plate off, keep its depth as an occluder; 0 for points only when the host moves `object`
//   (the tower). ease (s, default 0.6): every look parameter (dark, lit, fires, night, pointGain, cool, breathe, lamps, windows,
//   sky, calm, stained, fog, silhouette) follows its target with this spring, so the host may jump between values.
//   dark (0..1, live: crossfades to the CORREFOC's square, ./plaza3d/bake_dark/: lights off, a low moon) with fires [f0..f3] (0..1+, one foguera
//   per wall in strip order P4 P1 P2 P3: its warm light on the wet floor and the low facades), lit (0..1, the boom: lamps and
//   windows of the intro's bake come on) and night (the dark sky's level).
// Cost: plate = one draw per wall, ~11 texture reads per pixel; points = one instanced draw per wall, hidden when reveal = 1 and
// shatter = 0 (no cost at rest).
export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    uniform, uniformArray, attribute, vec2, vec3, vec4, float, positionWorld, positionGeometry, modelViewMatrix, cameraProjectionMatrix,
    mix, smoothstep, clamp, sin, cos, floor, pow, exp, length, normalize, dot, texture, atan, asin, select, varying, uv, hash,
    instanceIndex, mx_noise_float, max,
  } = TSL;
  const object = new THREE.Group(); object.name = 'plaza3d';
  const base = new URL('./plaza3d/', import.meta.url);
  const eye = room.eye.clone();
  // study page only: the intro's deep blue behind the square (in the trailer the host sets the background)
  if (P.studyNight && room.setBackground) room.setBackground({ bottom: [0.006, 0.009, 0.024], top: [0.002, 0.003, 0.012], gain: 1, now: true });

  // ------------------------------------------------------------------------------------------------ uniforms
  const uFade = uniform(0), uReveal = uniform(1), uShatter = uniform(0), uTime = uniform(0), uSil = uniform(0), uFog = uniform(1);
  const uPts = uniform(1), uEye = uniform(eye.clone()), uGain = uniform(0.05), uBreath = uniform(0), uCool = uniform(0);
  const G = Array.from({ length: 8 }, () => new THREE.Vector4());      // group intensities, four per light texture (the intro's bake)
  const uG = uniformArray(G, 'vec4');
  const uNight = uniform(1), uFires = uniform(new THREE.Vector4()), uDark = uniform(0);   // the dark bake (correfoc): sky, fires, its weight
  let darkMesh = null;
  let bake = null, dark = null, plate = null, points = null, ready = false;
  const LOAD_DARK = P.loadDark !== false;                               // both bakes live in ONE part: `dark` crossfades them (26-11)
  const groupK = [];                                                    // per group: current intensity
  const lampBoost = [];                                                 // per standing lamp: a hand's boost, decays

  // ------------------------------------------------------------------------------------------------ loading (async; nothing drawn until ready)
  const tl = new THREE.TextureLoader();
  const loadTex = (name, dir = 'bake/') => new Promise((res, rej) => tl.load(new URL(dir + name, base).href, (t) => {
    t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; res(t);
  }, undefined, rej));
  const loadImageData = (name) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); res(g.getImageData(0, 0, im.width, im.height)); };
    im.onerror = rej; im.src = new URL('bake/' + name, base).href;
  });

  (async () => {
    bake = await (await fetch(new URL('bake/bake.json', base))).json();
    const nL = Math.max(...bake.groups.map((g) => g.tex)) + 1;
    const [beauty, lights, dimg] = await Promise.all([
      Promise.all([...Array(bake.slices).keys()].map((k) => loadTex(`beauty_${k}.png`))),
      Promise.all([...Array(nL).keys()].map((j) => loadTex(`light_${j}.png`))),
      loadImageData('depth.png'),
    ]);
    bake.groups.forEach((g, i) => { groupK[i] = 1; if (g.kind === 'fanal') lampBoost[i] = 0; });
    plate = makePlate({ meta: bake, beauty, lights }, dimg); object.add(plate);
    if (LOAD_DARK) {
      try {
      dark = await (await fetch(new URL('bake_dark/bake.json', base))).json();
      const fires = dark.groups.filter((g) => g.kind === 'fire');
      const [db, ft] = await Promise.all([
        Promise.all([...Array(dark.slices).keys()].map((k) => loadTex(`beauty_${k}.png`, 'bake_dark/'))),
        Promise.all(fires.map((g) => loadTex(g.file, 'bake_dark/'))),
      ]);
      darkMesh = makeDarkPlate(plate.geometry, { meta: dark, beauty: db, fires: fires.map((g, i) => ({ side: g.side, tex: ft[i] })) });
      object.add(darkMesh);
      } catch (e) { console.warn('plaza3d: no dark bake', e); }
    }
    try { points = await makePoints(); if (points) object.add(points); } catch (e) { console.warn('plaza3d: no points', e); }
    ready = true;
  })().catch((e) => console.error('plaza3d: bake not loaded', e));

  // ------------------------------------------------------------------------------------------------ direction ↔ panorama
  // u: azimuth from the forward (side 0) towards side 1 (clockwise seen from above = left to right on the strip), 0.5 = forward
  const LAT0 = () => (bake.latMin * Math.PI) / 180, LAT1 = () => (bake.latMax * Math.PI) / 180;
  function panoUV(dir) {   // TSL: dir (normalized, world) → vec2(u, v) with v = 0 at latMin, 1 at latMax
    const fwd = new THREE.Vector3(...bake.forward).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const x = dot(dir, vec3(right.x, right.y, right.z)), z = dot(dir, vec3(fwd.x, fwd.y, fwd.z));
    const u = atan(x, z).div(Math.PI * 2).add(0.5);
    const v = asin(clamp(dir.y, -1, 1)).sub(LAT0()).div(LAT1() - LAT0());
    return vec2(u, v);
  }

  // ------------------------------------------------------------------------------------------------ the plate
  function makePlate(setA, dimg) {
    const NU = 768, NV = Math.round(NU * (bake.latMax - bake.latMin) / 360);
    const dw = dimg.width, dh = dimg.height, D = dimg.data;
    const fwd = new THREE.Vector3(...bake.forward).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
    const depthAt = (u, v) => {           // v = 0 at the top row (latMax); nearest of a 3×3 neighbourhood's minimum → lamps keep their posts
      const cx = Math.min(dw - 1, Math.floor(u * dw)), cy = Math.min(dh - 1, Math.floor(v * dh));
      let m = 1e9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const x = (cx + i + dw) % dw, y = Math.min(dh - 1, Math.max(0, cy + j)), o = (y * dw + x) * 4;
        m = Math.min(m, ((D[o] * 256 + D[o + 1]) / 65535) * bake.depthMax);
      }
      return m >= bake.depthMax * 0.98 ? 250 : Math.min(m, 250);
    };
    let k = 0;
    for (let j = 0; j <= NV; j++) {
      const vTop = j / NV, lat = (bake.latMax - vTop * (bake.latMax - bake.latMin)) * Math.PI / 180;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, az = (u - 0.5) * Math.PI * 2;
        const dx = Math.cos(lat) * Math.sin(az), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(az);
        const d = depthAt(u % 1, vTop) * 1.012;          // a little behind the surfaces: the points ON them stay visible
        pos[k++] = eye.x + (right.x * dx + fwd.x * dz) * d; pos[k++] = eye.y + dy * d; pos[k++] = eye.z + (right.z * dx + fwd.z * dz) * d;
      }
    }
    const idx = [];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: true });
    const dir = normalize(positionWorld.sub(uEye));
    const uvp = panoUV(dir);
    // one baked set: the RGBM slice this pixel falls in, relit by its light groups (Σ intensity_i · share_i)
    const shade = (set, U) => {
      const S = set.meta.slices, su = uvp.x.mul(S), ks = floor(su), lu = su.sub(ks);
      let rgbm = texture(set.beauty[0], vec2(lu, uvp.y));
      for (let s_ = 1; s_ < S; s_++) rgbm = select(ks.greaterThanEqual(s_), texture(set.beauty[s_], vec2(lu, uvp.y)), rgbm);
      const c = pow(rgbm.rgb, vec3(set.meta.rgbGamma)).mul(rgbm.a.mul(set.meta.rgbmRange));
      let f = float(0);
      set.lights.forEach((t, jj) => { f = f.add(dot(texture(t, uvp), U.element(jj))); });
      return c.mul(f);
    };
    const col = shade(setA, uG);
    // live mist over the baked one: slow, low, warm-grey
    const lat = asin(clamp(dir.y, -1, 1));
    const n = mx_noise_float(vec3(atan(dir.x, dir.z).mul(3.0).add(uTime.mul(0.02)), lat.mul(9.0), uTime.mul(0.03))).mul(0.5).add(0.5);
    const band = smoothstep(-0.42, -0.08, lat).mul(float(1).sub(smoothstep(-0.02, 0.22, lat)));
    const mist = vec3(0.32, 0.26, 0.21).mul(n.mul(n)).mul(band).mul(uFog).mul(0.06);
    m.colorNode = col.add(mist).mul(float(1).sub(uSil.mul(0.96)));
    m.opacityNode = uFade;
    m.fog = false; m.toneMapped = true;
    const mesh = new THREE.Mesh(g, m); mesh.name = 'plaza3d:plate'; mesh.frustumCulled = false; mesh.renderOrder = -10;
    mesh.visible = false;
    return mesh;
  }

  // ------------------------------------------------------------------------------------------------ the dark plate (correfoc)
  // drawn additively over the plate (same mesh, same depth): the square with its lights off (sky and moon only) + each foguera's
  // light, exact RGBM layers (no shares: an unlit fire leaves no hole). The intro's plate adds the lamps and windows with `lit`.
  function makeDarkPlate(geom, set) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true,
      depthFunc: THREE.LessEqualDepth, blending: THREE.AdditiveBlending });
    const dir = normalize(positionWorld.sub(uEye)), uvp = panoUV(dir);
    const dec = (t) => { const c = texture(t, uvp); return pow(c.rgb, vec3(set.meta.rgbGamma)).mul(c.a.mul(set.meta.rgbmRange)); };
    const S = set.meta.slices, su = uvp.x.mul(S), ks = floor(su), lu = su.sub(ks);
    let rgbm = texture(set.beauty[0], vec2(lu, uvp.y));
    for (let s_ = 1; s_ < S; s_++) rgbm = select(ks.greaterThanEqual(s_), texture(set.beauty[s_], vec2(lu, uvp.y)), rgbm);
    let col = pow(rgbm.rgb, vec3(set.meta.rgbGamma)).mul(rgbm.a.mul(set.meta.rgbmRange)).mul(uNight);
    const order = ['P4', 'P1', 'P2', 'P3'];
    for (const f of set.fires) col = col.add(dec(f.tex).mul([uFires.x, uFires.y, uFires.z, uFires.w][order.indexOf(f.side)]));
    m.colorNode = col.mul(uDark).mul(float(1).sub(uSil.mul(0.96))); m.opacityNode = uFade; m.fog = false;
    const mesh = new THREE.Mesh(geom, m); mesh.name = 'plaza3d:dark'; mesh.frustumCulled = false; mesh.renderOrder = -9; mesh.visible = false;
    return mesh;
  }

  // ------------------------------------------------------------------------------------------------ the points
  async function makePoints() {
    const meta = await (await fetch(new URL('points.json', base))).json();
    const buf = await (await fetch(new URL('points.bin', base))).arrayBuffer();
    const N = meta.count, xyz = new Float32Array(buf, 0, N * 3), rgba = new Uint8Array(buf, N * 12, N * 4);
    const kind = meta.bytesKind ? new Uint8Array(buf, N * 16, N) : new Uint8Array(N);
    const aP = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { aP[i * 4] = xyz[i * 3]; aP[i * 4 + 1] = xyz[i * 3 + 1]; aP[i * 4 + 2] = xyz[i * 3 + 2]; aP[i * 4 + 3] = kind[i]; }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(new Uint8Array(rgba), 4, true));
    g.instanceCount = N; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 80);
    const Ap = attribute('aP', 'vec4'), Ac = attribute('aC', 'vec4');
    const tgt = Ap.xyz, kd = Ap.w;
    const h1 = hash(instanceIndex), h2 = hash(instanceIndex.add(7919)), h3 = hash(instanceIndex.add(104729));
    // order of arrival: edges and windows first, then surfaces, the floor last
    const d0 = select(kd.lessThan(0.5), float(0.16), select(kd.lessThan(1.5), float(0.0), select(kd.lessThan(2.5), float(0.3), float(0.02))));
    const delay = d0.add(h1.mul(0.24));
    const rr = clamp(uReveal.div(0.6), 0, 1.2);
    const p = smoothstep(0, 1, clamp(rr.sub(delay).div(0.32), 0, 1));
    const q = float(1).sub(p);
    // a scattered dust that swirls in (a cheap curl-like field) and settles
    const rnd = normalize(vec3(h1.sub(0.5), h2.sub(0.5).mul(0.6), h3.sub(0.5)));
    const sw = vec3(sin(uTime.mul(0.41).add(tgt.y.mul(0.35)).add(h1.mul(6.283))), cos(uTime.mul(0.33).add(tgt.x.mul(0.21)).add(h2.mul(6.283))).mul(0.55),
      sin(uTime.mul(0.37).add(tgt.z.mul(0.27)).add(h3.mul(6.283))));
    const inPos = tgt.add(rnd.mul(h2.mul(5.0).add(2.5)).add(vec3(0, h3.mul(2.0), 0)).add(sw.mul(1.2)).mul(q.mul(q))).add(sw.mul(uBreath.mul(0.02)));
    // shatter: the square breaks back into points that rise, turn and thin out
    const sh = uShatter, sv = clamp(sh.mul(1.4).sub(h1.mul(0.4)), 0, 1);
    const outPos = tgt.add(sw.mul(sv.mul(1.8))).add(vec3(0, sv.mul(sv).mul(h2.mul(6.0).add(3.0)), 0));
    const pos = select(sh.greaterThan(0.0), outPos, inPos);
    let E = smoothstep(delay.sub(0.2), delay, rr).mul(0.3).add(p.mul(0.7));
    const shown = float(1).sub(smoothstep(0.55, 0.95, uReveal));                      // 1 while the points are the square (reveal ≤ 0.55)
    E = E.mul(shown);                                                                    // hand over to the plate
    E = select(sh.greaterThan(0.0), mix(smoothstep(0.0, 0.15, sh), float(1), shown).mul(float(1).sub(smoothstep(0.35, 1.0, sv))), E);
    E = E.mul(float(1).add(uBreath.mul(0.22).mul(sin(uTime.mul(0.55).add(h1.mul(6.283)).add(tgt.x.mul(0.12))))));   // breathing
    const keep = h3.lessThan(uPts);
    const lin = pow(Ac.rgb, vec3(2.2)), emis = Ac.a.greaterThan(0.1);
    const cool = mix(lin, vec3(dot(lin, vec3(0.3, 0.55, 0.15))).mul(vec3(0.62, 0.78, 1.25)), uCool);   // cold stone, warm windows
    const colr = select(emis, lin.mul(2.5), cool).mul(select(kd.greaterThan(1.5).and(kd.lessThan(2.5)), float(0.6), float(1.0)));
    const mv = modelViewMatrix.mul(vec4(pos, 1));
    const dist = length(mv.xyz);
    const size = dist.mul(0.0032).mul(float(1).add(q.mul(1.6)));
    const clip = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(size)), mv.z, mv.w));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = select(E.greaterThan(0.003).and(keep), clip, vec4(0, 0, 2, 1));
    const vCol = varying(colr.mul(E).mul(uGain).mul(uPts.max(0.25).reciprocal().min(2.0)));
    const dd = uv().sub(0.5), gs = exp(dot(dd, dd).mul(-14));
    m.colorNode = vCol.mul(gs); m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.name = 'plaza3d:points'; mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
    return mesh;
  }

  // ------------------------------------------------------------------------------------------------ per frame
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const _v = new THREE.Vector3();
  // every look parameter follows its target with a soft spring (τ = params.ease, s): the host may jump, the square glides
  const S = {};
  const ease = (key, target, dt, tau) => {
    if (!(key in S) || !isFinite(S[key])) S[key] = target;
    S[key] += (target - S[key]) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
    return S[key];
  };
  function update(dt, input) {
    uTime.value += dt;
    if (!ready) return;
    const tau = num(P.ease, 0.6), E_ = (k, v) => ease(k, v, dt, tau);
    const reveal = num(P.reveal, 1), shatter = num(P.shatter, 0) || num(input?.leave, 0);
    const d = E_('dark', P.dark === true ? 1 : P.dark === false ? 0 : num(P.dark, 0));
    uReveal.value = reveal; uShatter.value = shatter; uSil.value = E_('sil', num(P.silhouette, 0)); uFog.value = E_('fog', num(P.fog, 1));
    uPts.value = num(P.points, 1); uGain.value = E_('gain', num(P.pointGain, 0.05)); uBreath.value = E_('breathe', num(P.breathe, 0)); uCool.value = E_('cool', num(P.cool, 0));
    uDark.value = dark ? d : 0;
    uFade.value = smooth(0.58, 1.0, reveal) * (1 - smooth(0.0, 0.45, shatter));
    if (points) points.visible = (reveal < 0.999 || shatter > 0) && !(shatter >= 0.999);
    // the plate also stays (invisible, depth only) while the points are shown — only what the eye sees of the square remains —
    // unless occlude = 0 (points only, e.g. the tower, where the host moves the square: object.position)
    const occ = num(P.occlude, 1) > 0.5;
    if (plate) plate.visible = uFade.value > 0.002 || (points ? points.visible && shatter < 0.5 && occ : false);
    // a hand lights the nearest standing lamp (T-056): boost, then settle back
    if (P.handLamp !== false && input?.downs?.length) for (const h of input.downs) {
      if (!h.pos && !h.world) continue;
      const hp = h.world || h.pos; let best = -1, bd = 1e9;
      bake.groups.forEach((g, i) => { if (g.kind === 'fanal' && g.pos) { _v.set(...g.pos); const dd = _v.distanceToSquared(hp); if (dd < bd) { bd = dd; best = i; } } });
      if (best >= 0) lampBoost[best] = 1;
    }
    const lamps = E_('lamps', num(P.lamps, 1)), win = E_('win', num(P.windows, 1)), sky = E_('sky', num(P.sky, 1));
    const calm = E_('calm', num(P.calm, 0.45)), st = E_('stained', num(P.stained, 1)), lit = E_('lit', num(P.lit, 0));
    const t = uTime.value;
    for (const v of G) v.set(0, 0, 0, 0);
    const on = (1 - d) + d * lit;                                        // the intro's lights: full, or the correfoc's boom
    bake.groups.forEach((g, i) => {
      let k = 1;
      const c = g.side === 'P1' ? 1 - calm : 1;
      if (g.kind === 'sky') k = sky * (1 - d);                           // the dark bake brings its own sky
      else if (g.kind === 'fanal') { lampBoost[i] = Math.max(0, (lampBoost[i] || 0) - dt / 3); k = lamps * (1 + 0.6 * (lampBoost[i] || 0)) * (g.side === 'P1' ? 1 - calm * 0.4 : 1); }
      else if (g.kind === 'wall' || g.kind === 'lampglass') k = lamps * c;
      else if (g.kind === 'arcade') k = lamps * c;
      else if (g.kind === 'windows') k = win * c * (0.9 + 0.1 * Math.sin(t * 0.21 + i * 1.7));      // rooms breathe a little
      else if (g.kind === 'stained') k = st;
      if (g.kind !== 'sky') k *= on;
      groupK[i] = k;
      G[g.tex].setComponent('rgba'.indexOf(g.ch), k);
    });
    if (dark) {
      const fires = Array.isArray(P.fires) ? P.fires : [];
      uNight.value = E_('night', num(P.night, 1));
      for (let i = 0; i < 4; i++) uFires.value.setComponent(i, E_('fire' + i, num(fires[i], 0)) * (1 + 0.12 * Math.sin(t * 7.3 + i * 2.1) * Math.sin(t * 3.1 + i)));
    }
    if (darkMesh) darkMesh.visible = !!plate?.visible && uDark.value > 0.002;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function setParams(p) { if (p) Object.assign(P, p); }
  function dispose() {
    for (const m of [plate, points]) if (m) { m.geometry.dispose(); m.material.dispose(); }
    if (darkMesh) darkMesh.material.dispose();
  }
  return { object, update, setParams, dispose, get ready() { return ready; } };
}
