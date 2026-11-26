// Ressonància — brasa3d / fire3: a VOLUMETRIC fire (ray-marched in a box), vendored and adapted.
//
// From @wolffo/three-fire 1.4.0, dist/tsl/vanilla.esm.js (MIT, © 2015 typeWolffo — LICENSE-three-fire.txt here), itself the TSL port of
// mattatz/THREE.Fire (MIT). Downloaded 26-11 from unpkg; see SOURCES.md. The algorithm is theirs: each fire is a unit box; the fragment
// marches `iterations` steps along the view ray through it, at each step samples a gradient texture at (radius, height) displaced up by
// a turbulence (fbm of |Perlin|, `octaves`), and sums.
// Adapted for brasa v2 (Personaje):
//   · no `three` bare imports: THREE and TSL are passed in (the room's import map); no texture loading — `makeFireTexture` builds the
//     gradient in code (the repo's Fire-grayscale.png carries no license);
//   · depth TESTED (the correfocs running in front hide it), additive (HDR fire), the brightness and the level as uniforms;
//   · the time is a uniform the host drives (U.time), not TSL's global `time`.
//
//   const F = createVolumeFire({ THREE, TSL, fireTex, iterations: 16, octaves: 3, time: U.time })   → { mesh, u, update() }
//   F.u.color (Color, HDR tint) · F.u.gain (brightness) · F.u.magnitude (shape) · F.u.noiseScale (x, y, z, speed) · F.u.seed
//   mesh.scale = the flame's size (m); call F.update() after moving / scaling it (the inverse matrix the march needs)

export function makeFireTexture(THREE, N = 128) {
  // (radius, height) → the flame's colour and density: a tapering tongue, hot at its root and axis, cooling to red at its edges
  const data = new Uint8Array(N * N * 4);
  const ramp = (t) => {                                     // t 0 (cold edge) … 1 (core)
    const stops = [[0, [0, 0, 0]], [0.18, [90, 8, 2]], [0.42, [205, 52, 10]], [0.66, [248, 128, 28]], [0.86, [255, 196, 92]], [1, [255, 236, 190]]];
    for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1], [t1, c1] = stops[k], f = (t - t0) / (t1 - t0);
      return c0.map((v, i) => v + (c1[i] - v) * f);
    }
    return stops.at(-1)[1];
  };
  for (let j = 0; j < N; j++) {
    const y = j / (N - 1);                                  // height (0 root … 1 tip)
    const R = 0.92 * Math.pow(1 - y, 0.75) * (0.55 + 0.45 * Math.min(1, y / 0.12));   // the tongue's half-width at this height
    for (let i = 0; i < N; i++) {
      const r = i / (N - 1);                                // radius
      const inside = Math.max(0, 1 - r / Math.max(R, 1e-3));
      const t = Math.pow(inside, 0.8) * (1 - 0.55 * y);
      const c = ramp(Math.min(1, t * 1.15));
      const o = (j * N + i) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = Math.round(255 * Math.min(1, inside * 1.4));
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createVolumeFire({ THREE, TSL, fireTex, iterations = 16, octaves = 3, time, color = 0xffffff, magnitude = 1.3, noiseScale = [1, 2, 1, 0.3], lacunarity = 2.0, gain = 0.5, seed = Math.random() * 19.19, rootFade = 0.1 }) {
  const { Fn, vec4, uniform, vec3, positionWorld, normalize, cameraPosition, float, length, Loop, sqrt, dot, vec2, texture, select, abs, mx_noise_float, smoothstep } = TSL;
  const u = {
    color: uniform(new THREE.Color(color)),
    seed: uniform(seed),
    invModelMatrix: uniform(new THREE.Matrix4()),
    scale: uniform(new THREE.Vector3(1, 1, 1)),
    noiseScale: uniform(new THREE.Vector4(...noiseScale)),
    magnitude: uniform(magnitude),
    lacunarity: uniform(lacunarity),
    gain: uniform(gain),
    bright: uniform(1),
    root: uniform(rootFade),                                 // (brasa v2) the root dissolves over this share of the box's height: no hard cut
  };
  const T = time || uniform(0);
  // turbulence: fbm of |Perlin|
  const turbulence = Fn(([p]) => {
    const sum = float(0).toVar(), freq = float(1).toVar(), amp = float(1).toVar(), pos = vec3(p).toVar();
    Loop(octaves, () => { sum.addAssign(abs(mx_noise_float(pos.mul(freq))).mul(amp)); freq.mulAssign(u.lacunarity); amp.mulAssign(u.gain); });
    return sum;
  });
  const samplerFire = Fn(([p, s]) => {
    const radius = sqrt(dot(p.xz, p.xz));
    const st = vec2(radius, p.y).toVar();
    const animP = vec3(p).toVar();
    animP.y.subAssign(u.seed.add(T).mul(s.w));
    animP.assign(animP.mul(vec3(s.x, s.y, s.z)));
    st.y.addAssign(sqrt(st.y).mul(u.magnitude).mul(turbulence(animP)));
    const out = st.x.lessThanEqual(0.0).or(st.x.greaterThanEqual(1.0)).or(st.y.lessThanEqual(0.0)).or(st.y.greaterThanEqual(1.0));
    return select(out, vec4(0.0), texture(fireTex, st).mul(smoothstep(0.0, u.root, p.y)));   // (the root fades in: the box's floor never shows)
  });
  const frag = Fn(() => {
    const rayPos = vec3(positionWorld).toVar(), rayDir = normalize(rayPos.sub(cameraPosition)).toVar();
    const rayLen = float(0.0288 * (20 / iterations)).mul(length(u.scale));
    const col = vec4(0.0).toVar();
    Loop(iterations, () => {
      rayPos.addAssign(rayDir.mul(rayLen));
      const lp = u.invModelMatrix.mul(vec4(rayPos, 1.0)).xyz.toVar();
      lp.y.addAssign(0.5); lp.x.mulAssign(2.0); lp.z.mulAssign(2.0);
      col.addAssign(samplerFire(lp, u.noiseScale));
    });
    // (additive HDR: the mean colour along the ray × 3 × brightness; the march length is normalised to 20 steps)
    return vec4(col.xyz.mul(vec3(u.color)).mul(u.bright).mul(3.0 / iterations), 1.0);
  })();
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  material.fragmentNode = frag;
  material.fog = false;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  return {
    mesh, u,
    update() { mesh.updateMatrixWorld(); u.invModelMatrix.value.copy(mesh.matrixWorld).invert(); u.scale.value.copy(mesh.scale); },
    dispose() { mesh.geometry.dispose(); material.dispose(); },
  };
}
