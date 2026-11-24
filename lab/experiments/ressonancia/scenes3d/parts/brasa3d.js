// Ressonància — 3D part "brasa3d": I. Brasa, the FIRE universe (contract: ../PARTS.md, chapter in ../../GUION.md).
//
// What it draws (everything emissive; the room host does bloom + ACES)
//   The ember ring   a bed of coals on the square's floor all round the room, 4–8 m beyond the walls (one mesh, radial from the eye,
//                    so it is continuous across the corners and the strip's ends). Coals = world-space noise (lumps, glowing cracks,
//                    grey ash crust), breathing. Its heat = the chapter's level (progress) + a 1-D heat field round the perimeter
//                    (512 cells, CPU, an RGBA8 texture: R = embers woken by hands / waves, G = flare of wave fronts) + the awake flare.
//                    At progress 0 only a few patches glow; at 1 a whole ring. Low flames over it: 36 000 analytic sprites
//                    (vertex stage, no state) rising, swaying and cooling, taller where it is hotter.
//   Sparks           131 072 GPU particles (TSL compute; transform feedback on WebGL2): a ring buffer fed by up to 64 emitters per
//                    frame (CPU writes ranges + launch parameters as uniforms). Ballistic with drag, they bounce on the floor and cool
//                    white-gold -> orange -> red; buoyant ones (awake column, leave) rise, swirl and end as grey ash. Drawn as
//                    view-space streaks (velocity x a short shutter), never thinner than ~1.3 px.
//   Diables          up to 10 figures of fire: a small procedural skeleton per devil (CPU, 24 joints: running/dancing legs by two-bone
//                    IK, a forca held up with two carretilles that spray sparks), drawn as ~4 500 particles each sampled on capsules
//                    round the bones, each particle a little flame lick rising off the body. They assemble out of the embers and
//                    dissolve upward into sparks. Born where a hand lands (one per place), dancing at 0.8–1.5 m/s on the square's
//                    floor; each wave front leaves a relay of short-lived devils every 4 m, running at 2.6–3.4 m/s (human pace).
//   Fragments        2 400 shards (instanced quads, vertex-stage motion). ARRIVE: they hang high (the intro's drifting stone and
//                    mirror), fall turning and IGNITE where they land (a flash, a puff of sparks), and the bed catches fire under them
//                    (the same perimeter noise decides when each stretch of the ring lights). Then they lie in the bed as coals.
//                    LEAVE: the bed cools, the shards lift as ember and ash, turning, glinting like mirrors, drifting up and thinning;
//                    ember motes rise from the whole ring.
//   The air          one quad per wall on the wall plane: a warm haze above the ring (closed form of its height on the wall), and an
//                    immediate glow + flash under every hand (< 1 frame).
//   Lights           4 PointLights (layer 31: not used by the renderer, read by the atmos part) on the hottest hearths.
//
// Input (chapter host): input.state.progress / phase ('title' | 'play' | 'reward'), input.events 'wave' / 'awake', input.arrive,
//   input.leave, input.hands / downs. A 'wave' runs from where hands landed together in the last 1.2 s (circular mean), both ways round
//   the room at waveSpeed (3 m/s) until the fronts meet opposite (a burst). 'awake': the ring flares and a slow column of sparks rises
//   all round for ~8 s. phase 'reward': the ring contracts into four hearths (one per wall) and cools into ash and warm earth.
// Study (no input.state): progress from the host, params.arrive / leave, params.phase, params.wave / awake (rising edge = trigger),
//   params.waveEvery (s, automatic waves), params.autoWave (two hands within 0.9 s make a wave, as the score does).
// Sizes in metres; nothing allocated per frame; no readPixels.

const NC = 512;                         // heat cells round the perimeter
const NSP = 131072;                     // sparks
const MAXE = 64;                        // emitters per frame
const NF = 36000;                       // flame sprites
const MAXD = 14, NJ = 24, PER_DEVIL = 4500;
const NSH = 2400;                       // shards
const RING0 = 4, RING1 = 8;             // the bed, metres beyond the walls
const DEV_D = 6.0;
const WAIT0 = 9.0, WAIT1 = 10.0;           // the wait's line: this far beyond the walls (seen at ~1.06–1.19 m on them)                      // devils dance in the middle of the bed

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function create({ THREE, TSL, room, params }) {
  const P = params || {};
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionWorld, positionGeometry, uv, texture,
    vec2, vec3, vec4, float, int, uint, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, floor, fract, pow,
    dot, normalize, length, select, hash, modelViewMatrix, cameraProjectionMatrix, cameraWorldMatrix, cameraPosition, Discard,
    mx_noise_float, mx_fractal_noise_float, cross, reflect, step,
  } = TSL;
  const object = new THREE.Group();
  object.name = 'brasa3d';
  const walls = room.walls, NW = walls.length, eye = room.eye;

  // ------------------------------------------------------------------------------------------------ the room as a perimeter
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const ax = NW === 4 ? Math.abs(walls[1].centre.x) : 3.5, bz = NW === 4 ? Math.abs(walls[0].centre.z) : 3.5;
  const w0 = walls[0], pxM = w0.height / w0.rect.h;
  const dWall0 = Math.max(1, -new THREE.Vector3().subVectors(w0.pa, eye).dot(w0.normal));
  const PX_ANG = pxM / dWall0;
  const wrapC = (x) => x - PER * Math.floor(x / PER + 0.5);           // signed circular difference
  const wrapP = (x) => ((x % PER) + PER) % PER;
  // a point of the floor ring: the wall point at perimeter s, pushed out from the eye by d metres. Writes out (Vector3), returns tw.
  function ringPoint(s, d, out) {
    s = wrapP(s);
    let w = NW - 1; for (let i = 0; i < NW; i++) if (s < cum[i] + walls[i].width) { w = i; break; }
    const W = walls[w], u = s - cum[w];
    const x = W.pa.x + W.right.x * u, z = W.pa.z + W.right.z * u;
    const dx = x - eye.x, dz = z - eye.z, tw = Math.hypot(dx, dz) || 1;
    out.set(eye.x + (dx / tw) * (tw + d), 0, eye.z + (dz / tw) * (tw + d));
    return tw;
  }
  const nS = (s) => { const a = (s / PER) * Math.PI * 2; return 0.5 + 0.22 * Math.sin(a * 3 + 1.3) + 0.16 * Math.sin(a * 7 + 0.4) + 0.1 * Math.sin(a * 13 + 2.1); };
  const ignTh = (s) => 0.03 + 0.62 * nS(s);                         // the arrive value at which this stretch of the ring catches
  const hearthS = walls.map((w, i) => cum[i] + w.width / 2);

  // ------------------------------------------------------------------------------------------------ uniforms and the heat field
  const U = {
    time: uniform(0), dt: uniform(1 / 60), level: uniform(0.1), arrive: uniform(1), leave: uniform(0), contract: uniform(0),
    cool: uniform(0), earth: uniform(0), awake: uniform(0), flames: uniform(1), heat: uniform(1), devils: uniform(1), haze: uniform(1), smoke: uniform(1), wait: uniform(0), breath: uniform(1), crowd: uniform(1),
    seed: uniform(0, 'uint'), nE: uniform(0, 'int'), nH: uniform(0, 'int'),
  };
  const heatData = new Uint8Array(NC * 4);
  const heatTex = new THREE.DataTexture(heatData, NC, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  heatTex.wrapS = THREE.RepeatWrapping; heatTex.magFilter = THREE.LinearFilter; heatTex.minFilter = THREE.LinearFilter; heatTex.needsUpdate = true;
  const dyn = new Float32Array(NC), flare = new Float32Array(NC);
  const CELL = PER / NC;

  // TSL helpers
  const TAU = Math.PI * 2;
  const fireRamp = (T) => {                                             // cooling ember: dark red -> orange -> yellow-white (HDR)
    const t = max(T, 0.0);
    const r = smoothstep(0.02, 0.55, t), g = smoothstep(0.45, 1.35, t).mul(0.62).mul(r), b = smoothstep(0.95, 1.9, t).mul(0.95).mul(g);
    return vec3(r, g, b).mul(t).mul(1.4);
  };
  const nST = (s) => { const a = s.mul(TAU / PER); return float(0.5).add(sin(a.mul(3).add(1.3)).mul(0.22)).add(sin(a.mul(7).add(0.4)).mul(0.16)).add(sin(a.mul(13).add(2.1)).mul(0.1)); };
  const ignT = (s) => { const th = nST(s).mul(0.62).add(0.03); return max(smoothstep(th, th.add(0.12), U.arrive), smoothstep(0.0, 0.08, U.arrive).mul(0.6)); };   // a glow all round at once (~0.4 s), then stretch by stretch
  const wrapT = (x) => x.sub(floor(x.div(PER).add(0.5)).mul(PER));
  const hearthT = (s) => {
    let sum = float(0);
    for (const h of hearthS) { const d = wrapT(s.sub(h)).div(1.4); sum = sum.add(exp(d.mul(d).negate())); }
    return mix(float(1), min(sum.mul(1.25), 1.0), U.contract);
  };
  const waitRings = (s) => {                                            // 1, dimmed to 0.45 behind each wall's button ring (centre ±0.45 m)
    let sum = float(0);
    for (const h of hearthS) { const d = wrapT(s.sub(h)).div(0.45); sum = sum.add(exp(d.mul(d).negate())); }
    return float(1).sub(min(sum, 1.0).mul(0.55));
  };
  const heatSample = (s, vertex) => { const t = texture(heatTex, vec2(s.div(PER), 0.5)); return vertex ? t.level(0) : t; };
  // the live heat of the bed at perimeter s (no fine noise): level + embers woken + flare, lit by arrival, contracted, cooled
  const bedHeat = (s, live, hs) => {
    const base = U.level.mul(0.6).add(0.42);
    const raw = base.mul(live).add(hs.r.mul(4 * 0.5)).add(hs.g.mul(4 * 0.6)).add(U.awake.mul(0.6));
    const soft = raw.div(raw.mul(0.6).add(1));                         // a soft ceiling: a crowd of hands never whitens the ring
    return soft.mul(U.crowd).mul(ignT(s)).mul(hearthT(s)).mul(float(1).sub(U.cool.mul(0.82))).mul(U.heat);
  };
  const livePatch = (xz) => {
    const pn = mx_noise_float(vec3(xz.x.mul(0.42), U.time.mul(0.045), xz.y.mul(0.42))).mul(0.5).add(0.5);
    return smoothstep(float(0.62).sub(U.level.mul(0.85)), float(0.92).sub(U.level.mul(0.5)), pn);
  };
  const billboard = (p, sx, sy) => {
    const mv = modelViewMatrix.mul(vec4(p, 1));
    return cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(vec2(sx, sy))), mv.z, mv.w));
  };
  const HIDE = vec4(0, 0, 2, 1);
  const quadGeo = (n, attrs) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k], 4));
    g.instanceCount = n;
    return g;
  };
  const additive = () => new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  // ------------------------------------------------------------------------------------------------ 1. the floor and the ember bed
  const floorMesh = (() => {
    const sList = [];
    walls.forEach((w, i) => { const n = Math.max(8, Math.round(w.width * 16)); for (let k = 0; k < n; k++) sList.push(cum[i] + (w.width * k) / n); });
    sList.push(PER);
    const dList = [0.02, 0.5, 1.2, 2, 2.8, 3.3, 3.6, 3.9, 4.2, 4.6, 5, 5.5, 6, 6.5, 7, 7.4, 7.8, 8.1, 8.4, 8.8, 9.4, 10.5, 12, 15, 20, 30];
    const pos = [], at = [], idx = [];
    for (const s of sList) for (const d of dList) { ringPoint(s, d, _v); pos.push(_v.x, 0, _v.z); at.push(s, d); }
    const nd = dList.length;
    for (let i = 0; i < sList.length - 1; i++) for (let j = 0; j < nd - 1; j++) { const a = i * nd + j, b = a + nd; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSD', new THREE.Float32BufferAttribute(at, 2));
    g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const vSD = varying(attribute('aSD', 'vec2'));
    m.colorNode = Fn(() => {
      const s = vSD.x, d = vSD.y, xz = positionWorld.xz, t = U.time;
      const hs = heatSample(s, false);
      const en = mx_noise_float(vec3(xz.x.mul(0.9), 3.1, xz.y.mul(0.9)));
      const bandP = smoothstep(RING0 - 0.5, RING0 + 0.6, d.add(en.mul(0.5))).mul(smoothstep(RING1 + 0.6, RING1 - 0.6, d.add(en.mul(0.6))));
      // the wait (GUION › Espera): a thin line of embers far out (9–10 m beyond the walls), which the walls show at hand height
      const bandW = smoothstep(WAIT0 - 0.12, WAIT0 + 0.12, d.add(en.mul(0.1))).mul(smoothstep(WAIT1 + 0.12, WAIT1 - 0.12, d.add(en.mul(0.12))));
      const band = mix(bandP, bandW, U.wait);
      const live = mix(livePatch(xz), float(1), U.wait);
      const H = bedHeat(s, live, hs);
      // the wait breathes slowly (~6 s, a soft travelling swell along the line) and stays dim under the guide's button rings
      const underRing = waitRings(s);
      const breathe = mix(sin(t.mul(1.05).add(s.mul(0.37))).mul(0.12).add(0.9),
        U.breath.mul(sin(s.mul(TAU * 2 / PER).sub(t.mul(0.35))).mul(0.12).add(0.88)).mul(2.1).mul(underRing), U.wait);
      const coal = smoothstep(-0.25, 0.65, mx_fractal_noise_float(vec3(xz.x.mul(2.6), t.mul(0.03), xz.y.mul(2.6)), 3, 2.0, 0.5));
      const ridge = float(1).sub(abs(mx_noise_float(vec3(xz.x.mul(6.5), t.mul(0.07), xz.y.mul(6.5)))));
      const crk = pow(ridge, 7.0);
      const fl = mx_noise_float(vec3(xz.x.mul(1.4), t.mul(0.9), xz.y.mul(1.4))).mul(0.25).add(0.85);
      const T = H.mul(band).mul(coal.mul(0.75).add(0.12).add(crk.mul(coal).mul(1.1))).mul(fl).mul(breathe);
      const col = fireRamp(T).toVar();
      // ash crust, warm earth (the reward: the next chapter is clay), the fire's light on the square's floor
      const ash = vec3(0.016, 0.015, 0.014).mul(band).mul(float(1).sub(coal).mul(0.7).add(0.3)).mul(min(H.mul(2.0).add(U.cool.mul(1.2)), 1.0));
      const earthMask = smoothstep(RING0 - 2.5, RING0, d).mul(smoothstep(RING1 + 3, RING1, d));
      const earth = vec3(0.034, 0.016, 0.007).mul(U.earth).mul(earthMask).mul(mx_noise_float(vec3(xz.x.mul(1.7), 9.0, xz.y.mul(1.7))).mul(0.3).add(0.8));
      const glowAmt = H.mul(exp(abs(d.sub(mix(float(6.0), float((WAIT0 + WAIT1) / 2), U.wait))).mul(-0.42))).mul(mix(float(0.028), float(0.006), U.wait));
      col.addAssign(ash.add(earth).add(vec3(1.0, 0.42, 0.14).mul(glowAmt)));
      return col.mul(float(1).sub(smoothstep(0.55, 1.0, U.leave)));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -2;
    object.add(mesh);
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ 2. low flames over the bed
  const flameMesh = (() => {
    const r = rng(31), aH = new Float32Array(NF * 4), aR = new Float32Array(NF * 4);
    let i = 0;
    while (i < NF) {
      const s = r() * PER, d = RING0 + 0.3 + (RING1 - RING0 - 0.6) * (0.5 + (r() + r() + r() - 1.5) / 1.6);
      const tw = ringPoint(s, d, _v);
      if (r() > (tw + d) / (tw + RING1 + 1)) continue;                // even density on the ground (the far corners are larger)
      aH[i * 4] = _v.x; aH[i * 4 + 1] = _v.z; aH[i * 4 + 2] = s; aH[i * 4 + 3] = d;
      aR[i * 4] = r(); aR[i * 4 + 1] = r(); aR[i * 4 + 2] = r(); aR[i * 4 + 3] = r();
      i++;
    }
    const g = quadGeo(NF, { aH, aR });
    const m = additive();
    const H4 = attribute('aH', 'vec4'), R4 = attribute('aR', 'vec4');
    const xz = H4.xy, s = H4.z, r1 = R4.x, r2 = R4.y, r3 = R4.z, r4 = R4.w, t = U.time;
    const hs = heatSample(s, true);
    const H = bedHeat(s, livePatch(xz), hs).mul(float(1).sub(smoothstep(0.1, 0.5, U.leave))).mul(U.flames).mul(float(1).sub(U.wait));
    const age = fract(t.mul(r1.mul(0.9).add(0.55)).add(r2.mul(17.0)));
    const tongue = mx_noise_float(vec3(xz.x.mul(1.6), t.mul(1.3), xz.y.mul(1.6))).mul(0.5).add(0.55);
    const hgt = H.mul(0.55).add(0.08).mul(tongue).add(hs.g.mul(4 * 0.5)).add(U.awake.mul(0.45));
    const sway = age.mul(age).mul(0.16);
    const p = vec3(xz.x.add(sin(t.mul(2.3).add(r3.mul(40.0)).add(age.mul(4.0))).mul(sway)), age.mul(hgt).add(0.04), xz.y.add(cos(t.mul(1.9).add(r4.mul(40.0)).add(age.mul(3.0))).mul(sway)));
    const size = float(0.1).add(r3.mul(0.12)).mul(float(1).sub(age.mul(0.55))).mul(min(H, 1.2).mul(0.5).add(0.55));
    const T = pow(float(1).sub(age), 1.25).mul(1.25).mul(min(H, 1.5));
    const E = smoothstep(0.0, 0.08, age).mul(pow(float(1).sub(age), 1.3)).mul(0.09);
    m.vertexNode = select(H.greaterThan(0.025), billboard(p, size, size.mul(1.7)), HIDE);
    const vC = varying(fireRamp(T).mul(E));
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-16).add(q.y.mul(q.y).mul(-11))));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2;
    object.add(mesh);
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ 3. sparks (GPU compute)
  const E0 = [], E1 = [], E2 = [], E3 = [], E4 = [];
  for (let i = 0; i < MAXE; i++) { E0.push(new THREE.Vector4()); E1.push(new THREE.Vector4()); E2.push(new THREE.Vector4()); E3.push(new THREE.Vector4()); E4.push(new THREE.Vector4()); }
  const uE0 = uniformArray(E0, 'vec4'), uE1 = uniformArray(E1, 'vec4'), uE2 = uniformArray(E2, 'vec4'), uE3 = uniformArray(E3, 'vec4'), uE4 = uniformArray(E4, 'vec4');
  const bufP = instancedArray(NSP, 'vec4');       // position, age
  const bufV = instancedArray(NSP, 'vec4');       // velocity, life
  const bufK = instancedArray(NSP, 'vec4');       // heat0, gravity scale, drag, seed
  const rnd = (k) => hash(instanceIndex.mul(uint(9)).add(U.seed).add(uint(k)));
  const unitV = (a, b) => { const z = rnd(a).mul(2).sub(1), ph = rnd(b).mul(TAU), rr = sqrt(max(float(1).sub(z.mul(z)), 0)); return vec3(rr.mul(cos(ph)), z, rr.mul(sin(ph))); };
  const sparkStep = Fn(() => {
    const p4 = bufP.element(instanceIndex).toVar(), v4 = bufV.element(instanceIndex).toVar(), k4 = bufK.element(instanceIndex).toVar();
    const fi = float(instanceIndex);
    const born = int(-1).toVar();
    Loop(U.nE, ({ i }) => {
      const e0 = uE0.element(i);
      const dd = fi.sub(e0.x).toVar();
      If(dd.lessThan(0), () => { dd.addAssign(NSP); });
      If(dd.lessThan(e0.y), () => { born.assign(i); });
    });
    If(born.greaterThanEqual(0), () => {
      const e0 = uE0.element(born), e1 = uE1.element(born), e2 = uE2.element(born), e3 = uE3.element(born), e4 = uE4.element(born);
      const pos = e1.xyz.add(unitV(1, 2).mul(e1.w.mul(pow(rnd(3), 0.5))));
      const dir = normalize(e2.xyz.add(unitV(4, 5).mul(e2.w)));
      const sp = mix(e3.x, e3.y, pow(rnd(6), 1.4));
      const vel = dir.mul(sp).add(e4.xyz.mul(rnd(7).mul(0.4).add(0.6)));
      p4.assign(vec4(pos, 0));
      v4.assign(vec4(vel, mix(e3.z, e3.w, rnd(8))));
      k4.assign(vec4(e0.z.mul(rnd(9).mul(0.3).add(0.75)), e4.w, e0.w, rnd(10)));
    }).Else(() => {
      If(v4.w.greaterThan(0).and(p4.w.lessThan(v4.w)), () => {
        const dt = U.dt, g = k4.y;
        const v = v4.xyz.toVar(), p = p4.xyz.toVar();
        v.addAssign(vec3(0, g.mul(-9.8).mul(dt), 0));
        If(g.lessThan(0), () => {                                      // buoyant: a slow swirl
          v.addAssign(vec3(sin(p.y.mul(1.7).add(U.time.mul(0.9)).add(k4.w.mul(40.0))), 0, cos(p.y.mul(1.3).add(U.time.mul(0.7)).add(k4.w.mul(23.0)))).mul(dt.mul(0.9)));
        });
        v.mulAssign(exp(k4.z.negate().mul(dt)));
        p.addAssign(v.mul(dt));
        const hot = k4.x.toVar();
        If(p.y.lessThan(0.004).and(v.y.lessThan(0)), () => {          // a bounce on the stone: it loses speed and heat
          p.assign(vec3(p.x, 0.004, p.z));
          v.assign(vec3(v.x.mul(0.5), v.y.mul(-0.3), v.z.mul(0.5)));
          hot.mulAssign(0.82);
        });
        p4.assign(vec4(p, p4.w.add(dt)));
        v4.assign(vec4(v, v4.w));
        k4.assign(vec4(hot, k4.yzw));
      });
    });
    bufP.element(instanceIndex).assign(p4);
    bufV.element(instanceIndex).assign(v4);
    bufK.element(instanceIndex).assign(k4);
  });
  const sparkCompute = sparkStep().compute(NSP);
  const sparkMesh = (() => {
    const g = quadGeo(NSP, {});
    const m = additive();
    const P4 = bufP.toAttribute(), V4 = bufV.toAttribute(), K4 = bufK.toAttribute();
    const inside = abs(P4.x).lessThan(ax - 0.02).and(abs(P4.z).lessThan(bz - 0.02));
    const alive = V4.w.greaterThan(0).and(P4.w.lessThan(V4.w)).and(inside.not());
    const x = clamp(P4.w.div(max(V4.w, 1e-3)), 0, 1);
    const buoy = K4.y.lessThan(0);
    const T = K4.x.mul(pow(float(1).sub(x), select(buoy, float(1.6), float(1.1)))).mul(sin(U.time.mul(31.0).add(K4.w.mul(300.0))).mul(0.12).add(0.88));
    const head = modelViewMatrix.mul(vec4(P4.xyz, 1)), tail = modelViewMatrix.mul(vec4(P4.xyz.sub(V4.xyz.mul(0.024)), 1));
    const ax2 = head.xy.sub(tail.xy), L = length(ax2), dir = select(L.greaterThan(1e-5), ax2.div(max(L, 1e-5)), vec2(0, 1)), perp = vec2(dir.y.negate(), dir.x);
    const dist = head.z.negate().max(0.1);
    const w0 = select(buoy, float(0.016), float(0.011)), W = max(w0, dist.mul(PX_ANG * 1.3));
    const pg = positionGeometry.xy, along = pg.y.add(0.5);
    const c = mix(tail.xyz, head.xyz, along).add(vec3(perp.mul(pg.x.mul(W)).add(dir.mul(pg.y.mul(W))), 0));
    m.vertexNode = select(alive, cameraProjectionMatrix.mul(vec4(c, 1)), HIDE);
    // ash: the buoyant ones end as grey flakes that sometimes catch the light
    const ashK = select(buoy, float(1).sub(smoothstep(0.08, 0.45, T)).mul(float(1).sub(x)), float(0));
    const glint = pow(max(sin(U.time.mul(K4.w.mul(3.0).add(1.0)).add(K4.w.mul(90.0))), 0), 30.0).mul(0.6);
    const E = w0.div(W).mul(float(1).div(L.div(W.mul(5.0)).add(1))).mul(2.2);
    const vC = varying(fireRamp(T).mul(E).add(vec3(0.05, 0.048, 0.046).add(vec3(0.5, 0.55, 0.62).mul(glint)).mul(ashK)));
    const vA = varying(along);
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-14))).mul(mix(float(0.3), float(1), vA));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4;
    object.add(mesh);
    return mesh;
  })();
  let cursor = 0, nE = 0;
  const sparkGain = () => Math.max(0, Number(P.sparks ?? 1));
  // n sparks from (px,py,pz) within `spread` m, along dir (+ cone), speed vmin..vmax, life lmin..lmax, heat, gravity scale, drag, inherited velocity
  function emit(n, px, py, pz, spread, dx, dy, dz, cone, vmin, vmax, lmin, lmax, heat, g, drag, ix = 0, iy = 0, iz = 0) {
    n = Math.floor(n * sparkGain());
    if (n <= 0 || nE >= MAXE) return;
    n = Math.min(n, 8192);
    const l = Math.hypot(dx, dy, dz) || 1;
    E0[nE].set(cursor, n, heat, drag); E1[nE].set(px, py, pz, spread); E2[nE].set(dx / l, dy / l, dz / l, cone);
    E3[nE].set(vmin, vmax, lmin, lmax); E4[nE].set(ix, iy, iz, g);
    cursor = (cursor + n) % NSP; nE++;
  }

  // ------------------------------------------------------------------------------------------------ 4. diables
  const JV = []; for (let i = 0; i < MAXD * NJ; i++) JV.push(new THREE.Vector4());
  const DS = []; for (let i = 0; i < MAXD; i++) DS.push(new THREE.Vector4());
  const uJ = uniformArray(JV, 'vec4'), uDS = uniformArray(DS, 'vec4');
  // bones: [jointA, jointB, radiusA, radiusB, energy]
  const BONES = [[0, 1, 0.14, 0.17, 1], [1, 2, 0.17, 0.06, 1], [2, 3, 0.055, 0.06, 1], [3, 3, 0.105, 0.105, 1.1], [4, 5, 0.065, 0.065, 1],
    [4, 6, 0.055, 0.045, 1], [5, 7, 0.055, 0.045, 1], [6, 8, 0.042, 0.032, 1.05], [7, 9, 0.042, 0.032, 1.05], [10, 11, 0.09, 0.09, 1],
    [10, 12, 0.085, 0.06, 0.95], [11, 13, 0.085, 0.06, 0.95], [12, 14, 0.058, 0.04, 0.95], [13, 15, 0.058, 0.04, 0.95], [14, 16, 0.04, 0.03, 0.9],
    [15, 17, 0.04, 0.03, 0.9], [18, 19, 0.02, 0.02, 0.3], [20, 21, 0.016, 0.016, 0.3], [3, 22, 0.03, 0.006, 1.3], [3, 23, 0.03, 0.006, 1.3]];
  const devilMesh = (() => {
    const r = rng(77), n = MAXD * PER_DEVIL;
    const aJ = new Float32Array(n * 4), aD = new Float32Array(n * 4), aS = new Float32Array(n * 4);
    const wts = BONES.map(([a, b, ra, rb]) => (a === b ? 4 * ra * ra * 3.2 : 0.4 * (ra + rb)) + 0.004);   // ~ area
    const tot = wts.reduce((x, y) => x + y, 0), cumW = []; let acc = 0; for (const w of wts) { acc += w / tot; cumW.push(acc); }
    // the length of a bone does not matter for the weights of joints pairs at build time: use nominal lengths
    const LEN = [0.42, 0.18, 0.12, 0, 0.36, 0.3, 0.3, 0.27, 0.27, 0.2, 0.45, 0.45, 0.44, 0.44, 0.16, 0.16, 1.6, 0.7, 0.13, 0.13];
    const w2 = BONES.map((b, i) => (b[0] === b[1] ? 4 * b[2] * b[2] * 3.2 : LEN[i] * (b[2] + b[3]) * 3.2) + 0.002);
    const t2 = w2.reduce((x, y) => x + y, 0); acc = 0; cumW.length = 0; for (const w of w2) { acc += w / t2; cumW.push(acc); }
    for (let i = 0; i < n; i++) {
      const slot = Math.floor(i / PER_DEVIL), x = r(); let b = 0; while (b < cumW.length - 1 && x > cumW[b]) b++;
      const [ja, jb, ra, rb, e] = BONES[b], t = r();
      const z = 2 * r() - 1, ph = r() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
      aJ[i * 4] = slot * NJ + ja; aJ[i * 4 + 1] = slot * NJ + jb; aJ[i * 4 + 2] = t; aJ[i * 4 + 3] = (ra + (rb - ra) * t) * (0.75 + 0.25 * r());
      aD[i * 4] = rr * Math.cos(ph); aD[i * 4 + 1] = z; aD[i * 4 + 2] = rr * Math.sin(ph); aD[i * 4 + 3] = e;
      aS[i * 4] = r(); aS[i * 4 + 1] = r(); aS[i * 4 + 2] = r(); aS[i * 4 + 3] = slot;
    }
    const g = quadGeo(n, { aJ, aD, aS });
    const m = additive();
    const J4 = attribute('aJ', 'vec4'), D4 = attribute('aD', 'vec4'), S4 = attribute('aS', 'vec4');
    const A = uJ.element(int(J4.x)), B = uJ.element(int(J4.y)), st = uDS.element(int(S4.w));
    const r1 = S4.x, r2 = S4.y, r3 = S4.z, t = U.time;
    const c = mix(A.xyz, B.xyz, J4.z);
    const age = fract(t.mul(r1.mul(1.3).add(0.9)).add(r2.mul(7.0)));
    const lick = r3.mul(0.2).add(0.05).mul(st.z);
    let p = c.add(D4.xyz.mul(J4.w)).add(vec3(0, age.mul(lick), 0)).add(D4.xyz.mul(age.mul(0.035)));
    // assemble out of the embers, spiralling up
    const ka = clamp(st.x.sub(r1.mul(0.45)).div(0.55), 0, 1), e = ka.mul(ka).mul(float(3).sub(ka.mul(2)));
    const src = vec3(c.x.add(r2.sub(0.5).mul(1.4)), float(0.03), c.z.add(r3.sub(0.5).mul(1.4)));
    p = mix(src, p, e);
    // dissolve: up and apart, the top first
    const v = clamp(st.y.mul(1.7).sub(r1.mul(0.4)).sub(float(1).sub(clamp(c.y.div(2.6), 0, 1)).mul(0.3)), 0, 1);
    p = p.add(vec3(sin(r2.mul(6.283).add(v.mul(2.0))).mul(v).mul(0.6), v.mul(v).mul(r3.mul(2.5).add(1.2)), cos(r3.mul(6.283).add(v.mul(2.0))).mul(v).mul(0.6)));
    const T = pow(float(1).sub(age), 1.3).mul(1.6).add(0.12).mul(D4.w).mul(st.z).mul(e.mul(0.6).add(0.4)).mul(float(1).sub(smoothstep(0.35, 1.0, v)));
    const E = smoothstep(0.0, 0.1, age).mul(pow(float(1).sub(age), 0.9)).mul(0.33).mul(U.devils).mul(float(1).sub(U.leave));
    const size = float(0.05).add(r3.mul(0.03)).mul(age.mul(0.5).add(0.8)).mul(float(1).add(v.mul(0.8)));
    m.vertexNode = select(st.x.greaterThan(0.001).and(T.greaterThan(0.01)), billboard(p, size, size.mul(float(1.4).add(v.mul(2.0)))), HIDE);
    const vC = varying(fireRamp(T).mul(E));
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(dot(q, q).mul(-14)));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
    object.add(mesh);
    return mesh;
  })();
  const devils = [];
  for (let i = 0; i < MAXD; i++) devils.push({ on: false, s: 0, d: DEV_D, dir: 1, spd: 0.7, age: 0, life: 8, k: 0, dis: 0, style: 0, phase: 0, wave: null, h: 1, acc: 0, born: 0 });
  // skeleton scratch
  const J = []; for (let i = 0; i < NJ; i++) J.push(new THREE.Vector3());
  const F = new THREE.Vector3(), Sd = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), root = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), poleD = new THREE.Vector3(), barD = new THREE.Vector3(), toEye = new THREE.Vector3();
  const _d = new THREE.Vector3(), _b = new THREE.Vector3();
  function ik2(A, T, l1, l2, pole, outJ, outE) {
    _d.subVectors(T, A); const D = _d.length() || 1e-4; _d.multiplyScalar(1 / D);
    const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _b.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); _b.normalize();
    outJ.copy(A).addScaledVector(_d, a).addScaledVector(_b, h);
    outE.copy(A).addScaledVector(_d, d);
  }
  function pose(dv, time) {
    const h = dv.h, ph = dv.phase;
    const tw = ringPoint(dv.s, dv.d, root);
    ringPoint(dv.s + 0.05 * dv.dir, dv.d, tmpA); F.subVectors(tmpA, root).setY(0).normalize();
    toEye.set(eye.x - root.x, 0, eye.z - root.z).normalize();
    const turn = 0.5 + 0.5 * Math.sin(time * 0.6 + dv.born * 3.1);       // the dance turns them now and then towards the room
    const sp = (time * 0.11 + dv.born * 0.37) % 1, spinK = sp < 0.09 ? sp / 0.09 : 0;   // now and then a full turn with a leap
    F.multiplyScalar(1 - 0.75 * turn * turn).addScaledVector(toEye, 0.75 * turn * turn).normalize();
    if (spinK > 0) F.applyAxisAngle(UPV, spinK * Math.PI * 2);
    root.y += 0.28 * h * Math.sin(spinK * Math.PI);
    Sd.crossVectors(F, UPV).normalize();                                // the devil's right
    const bob = 0.06 * Math.abs(Math.sin(ph));
    const lean = 0.16 + 0.1 * Math.sin(ph * 0.5 + dv.born);
    J[0].copy(root).addScaledVector(UPV, (0.92 + bob) * h);
    tmpA.copy(UPV).multiplyScalar(Math.cos(lean)).addScaledVector(F, Math.sin(lean));
    J[1].copy(J[0]).addScaledVector(tmpA, 0.42 * h);
    J[2].copy(J[0]).addScaledVector(tmpA, 0.6 * h);
    J[3].copy(J[2]).addScaledVector(UPV, 0.13 * h).addScaledVector(F, 0.03 * h);
    J[4].copy(J[1]).addScaledVector(UPV, 0.06 * h).addScaledVector(Sd, -0.19 * h);
    J[5].copy(J[1]).addScaledVector(UPV, 0.06 * h).addScaledVector(Sd, 0.19 * h);
    J[10].copy(J[0]).addScaledVector(Sd, -0.1 * h); J[11].copy(J[0]).addScaledVector(Sd, 0.1 * h);
    for (let L = 0; L < 2; L++) {
      const psi = ph + L * Math.PI, sg = L ? 1 : -1;
      const an = J[14 + L].copy(root).addScaledVector(F, dv.stride * Math.sin(psi) * h).addScaledVector(UPV, (0.08 + 0.24 * Math.max(0, Math.cos(psi))) * h).addScaledVector(Sd, sg * 0.12 * h);
      tmpB.copy(F).addScaledVector(UPV, 0.1);
      ik2(J[10 + L], an, 0.46 * h, 0.44 * h, tmpB, J[12 + L], J[14 + L]);
      J[16 + L].copy(J[14 + L]).addScaledVector(F, 0.16 * h).addScaledVector(UPV, -0.05 * h);
    }
    // the forca: a pole held up, the crossbar with two carretilles
    poleD.copy(UPV).addScaledVector(F, 0.28).addScaledVector(Sd, 0.18 * Math.sin(ph * 0.5 + dv.born)).normalize();
    if (dv.style === 0) {
      tmpA.copy(J[1]).addScaledVector(UPV, 0.32 * h).addScaledVector(F, 0.26 * h).addScaledVector(Sd, 0.04 * h);   // upper grip
      tmpC.copy(tmpA).addScaledVector(poleD, -0.34 * h);                                                     // lower grip
    } else {
      tmpA.copy(J[5]).addScaledVector(UPV, 0.5 * h).addScaledVector(F, 0.1 * h).addScaledVector(Sd, 0.12 * h);
      tmpC.copy(J[4]).addScaledVector(Sd, -0.38 * h).addScaledVector(UPV, -0.05 * h + 0.18 * Math.sin(ph) * h).addScaledVector(F, 0.15 * Math.cos(ph) * h);
    }
    tmpB.copy(UPV).multiplyScalar(-1).addScaledVector(F, -0.2).addScaledVector(Sd, 0.7);
    ik2(J[5], tmpA, 0.3 * h, 0.27 * h, tmpB, J[7], J[9]);
    tmpB.copy(UPV).multiplyScalar(-1).addScaledVector(F, -0.2).addScaledVector(Sd, -0.7);
    ik2(J[4], tmpC, 0.3 * h, 0.27 * h, tmpB, J[6], J[8]);
    J[18].copy(J[9]).addScaledVector(poleD, -0.45 * h);
    J[19].copy(J[9]).addScaledVector(poleD, 1.15 * h);
    barD.copy(Sd).addScaledVector(poleD, -Sd.dot(poleD)).normalize();
    J[20].copy(J[19]).addScaledVector(barD, -0.36 * h); J[21].copy(J[19]).addScaledVector(barD, 0.36 * h);
    J[22].copy(J[3]).addScaledVector(UPV, 0.2 * h).addScaledVector(Sd, -0.09 * h).addScaledVector(F, 0.05 * h);
    J[23].copy(J[3]).addScaledVector(UPV, 0.2 * h).addScaledVector(Sd, 0.09 * h).addScaledVector(F, 0.05 * h);
    return tw;
  }
  let devilCount = 0;
  function spawnDevil(s, dir, spd, life, wave, time) {
    for (const dv of devils) if (dv.on && dv.dis === 0 && Math.abs(wrapC(dv.s - s)) < 1.6 && !wave && !dv.wave) return null;   // one per place
    { let n = 0, all = 0; for (const dv of devils) if (dv.on && dv.dis === 0) { all++; if (!dv.wave) n++; }
      if (!wave && n >= (crowdN > 4 ? 2 : 5)) return null;               // a crowd: at most 2 hand devils (5 for a few people)
      if (wave && all >= (crowdN > 4 ? 4 : 6)) return null; }            // and the wave's relay only while few dance
    const dv = devils.find((x) => !x.on);
    if (!dv) return null;
    Object.assign(dv, { on: true, s, d: DEV_D + (Math.random() - 0.5) * 1.2, dir, spd, stride: 0.3, age: 0, life, k: 0, dis: 0, style: devilCount % 2, phase: Math.random() * 6, wave, h: 1 + Math.random() * 0.1, acc: 0, born: devilCount++ * 1.37 % 100 });
    return dv;
  }

  // ------------------------------------------------------------------------------------------------ 5. fragments (arrive / leave)
  const shardMesh = (() => {
    const r = rng(91), aRest = new Float32Array(NSH * 4), aSd = new Float32Array(NSH * 4), aFl = new Float32Array(NSH * 4);
    for (let i = 0; i < NSH; i++) {
      const s = r() * PER, d = RING0 - 0.2 + (RING1 - RING0 + 0.4) * r();
      ringPoint(s, d, _v);
      aRest[i * 4] = _v.x; aRest[i * 4 + 1] = 0.015 + r() * 0.03; aRest[i * 4 + 2] = _v.z; aRest[i * 4 + 3] = s;
      const big = r() < 0.12 ? 1.8 : 1;
      aSd[i * 4] = (0.07 + 0.22 * r() * r()) * big; aSd[i * 4 + 1] = r(); aSd[i * 4 + 2] = r(); aSd[i * 4 + 3] = r();
      aFl[i * 4] = Math.min(0.97, ignTh(s) + 0.02 + r() * 0.1);                    // lands when its stretch of the ring catches
      aFl[i * 4 + 1] = 6 + r() * 12;                                               // starts this high
      aFl[i * 4 + 2] = (r() - 0.5) * 3; aFl[i * 4 + 3] = (r() - 0.5) * 3;          // drift while falling
    }
    // a slab: a hexagonal outline, a mirror top, a stone underside, bevelled stone edges (flat normals: every face its own vertices)
    // position.xy = outline (unit radius 0.5), position.z = -0.5..0.5 across the thickness; aFace: 1 top, -1 underside, 0 edges;
    // aNrm = the face's local normal; aCor = the corner index (the outline is jittered per instance and per corner)
    const g = (() => {
      const NCOR = 6, P0 = [], N0 = [], F0 = [], C0 = [];
      const ring = (k, rad, z) => { const a = (k % NCOR) * (Math.PI * 2 / NCOR); return [Math.cos(a) * rad, Math.sin(a) * rad, z]; };
      const tri = (A, B, C, ka, kb, kc, face) => {
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((x) => x / l);
        for (const [Pt, k] of [[A, ka], [B, kb], [C, kc]]) { P0.push(...Pt); N0.push(...n); F0.push(face); C0.push(k % NCOR); }
      };
      const IN = 0.78, ZF = 0.5, ZE = 0.22;
      for (let k = 0; k < NCOR; k++) {
        const k1 = k + 1;
        tri([0, 0, ZF], ring(k, 0.5 * IN, ZF), ring(k1, 0.5 * IN, ZF), k, k, k1, 1);                   // mirror top
        tri([0, 0, -ZF], ring(k1, 0.5 * IN, -ZF), ring(k, 0.5 * IN, -ZF), k, k1, k, -1);                // stone underside
        const ti0 = ring(k, 0.5 * IN, ZF), ti1 = ring(k1, 0.5 * IN, ZF), to0 = ring(k, 0.5, ZE), to1 = ring(k1, 0.5, ZE);
        const bo0 = ring(k, 0.5, -ZE), bo1 = ring(k1, 0.5, -ZE), bi0 = ring(k, 0.5 * IN, -ZF), bi1 = ring(k1, 0.5 * IN, -ZF);
        tri(to0, to1, ti1, k, k1, k1, 0); tri(to0, ti1, ti0, k, k1, k, 0);                               // upper bevel
        tri(bo0, bo1, to1, k, k1, k1, 0); tri(bo0, to1, to0, k, k1, k, 0);                               // edge band
        tri(bi0, bi1, bo1, k, k1, k1, 0); tri(bi0, bo1, bo0, k, k1, k, 0);                               // lower bevel
      }
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P0, 3));
      geo.setAttribute('aNrm', new THREE.Float32BufferAttribute(N0, 3));
      geo.setAttribute('aFace', new THREE.Float32BufferAttribute(F0, 1));
      geo.setAttribute('aCor', new THREE.Float32BufferAttribute(C0, 1));
      for (const [k2, arr] of [['aRest', aRest], ['aSd', aSd], ['aFl', aFl]]) geo.setAttribute(k2, new THREE.InstancedBufferAttribute(arr, 4));
      geo.instanceCount = NSH;
      return geo;
    })();
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const R4 = attribute('aRest', 'vec4'), S4 = attribute('aSd', 'vec4'), L4 = attribute('aFl', 'vec4');
    const aNrm = attribute('aNrm', 'vec3'), aFace = attribute('aFace', 'float'), aCor = attribute('aCor', 'float');
    const sz = S4.x, r1 = S4.y, r2 = S4.z, r3 = S4.w, t = U.time;
    const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
    const pg = positionGeometry;
    const cs = sin(r1.mul(91.0).add(aCor.mul(2.7)).add(r2.mul(13.0))).mul(0.32).add(1.0);        // this corner's radius (irregular outline)
    const sx = sz, sy = sz.mul(r3.mul(0.5).add(0.65)), th = sz.mul(r2.mul(0.1).add(0.14));        // thickness 14–24 % of the size
    const loc = pg.xy.mul(cs).mul(vec2(sx, sy));
    const yaw = r1.mul(6.283), tilt = r2.sub(0.5).mul(0.5);
    // the slab's local frame: X along loc.x, Y along loc.y (lying flat, a little tilted), Z = thickness (normal ~ up)
    const AX = vec3(1, 0, 0), AY = vec3(0, sin(tilt), cos(tilt).negate()), AZ = vec3(0, cos(tilt), sin(tilt));
    let lp = AX.mul(loc.x).add(AY.mul(loc.y)).add(AZ.mul(pg.z.mul(th)));
    let nl = normalize(AX.mul(aNrm.x.div(sx)).add(AY.mul(aNrm.y.div(sy))).add(AZ.mul(aNrm.z.div(th))));
    const yK = vec3(0, 1, 0);
    lp = rotA(lp, yK, yaw); nl = rotA(nl, yK, yaw);
    const axis = normalize(vec3(r1.sub(0.5), r3.sub(0.5), r2.sub(0.5)).add(vec3(0, 0.001, 0)));
    // arrive: hang, fall, land, ignite
    const FALL = 0.32;
    const k = clamp(U.arrive.sub(L4.x.sub(FALL)).div(FALL), 0, 1);
    const fallY = L4.y.mul(float(1).sub(k.mul(k))).add(sin(t.mul(0.3).add(r1.mul(40.0))).mul(0.2).mul(float(1).sub(k)));
    const spinA = float(1).sub(k).mul(r2.mul(9.0).add(3.0)).add(float(1).sub(k).mul(t.mul(0.4)));
    // leave: lift, drift up and apart, turning; thin out
    const ld = r3.mul(0.38).add(0.04);
    const lv = clamp(U.leave.sub(ld).div(0.5), 0, 3);
    // (on the wall a shard 9–10 m away rises ~1/3 of its world height: to reach 1.8–3 m on the wall at leave 0.6 it climbs 2–5 m)
    const out = normalize(vec3(R4.x, 0, R4.z).add(vec3(0.001, 0, 0)));
    const tng = vec3(out.z.negate(), 0, out.x);
    const up = lv.mul(2.6).add(lv.mul(lv).mul(4.5)).mul(r1.mul(0.8).add(0.6));
    const lift = vec3(0, up, 0).add(out.mul(lv.mul(r2.mul(1.2).sub(0.8)))).add(tng.mul(lv.mul(r3.sub(0.5)).mul(2.4)))
      .add(vec3(sin(t.mul(0.37).add(r1.mul(40.0))), sin(t.mul(0.29).add(r3.mul(23.0))).mul(0.5), cos(t.mul(0.31).add(r2.mul(40.0)))).mul(min(lv, 1).mul(0.3)));
    const ang = spinA.add(lv.mul(r1.mul(4.0).add(2.0))).add(t.mul(r2.mul(0.9).add(0.35)).mul(min(lv.mul(4.0), 1)));
    const scl = float(1).sub(smoothstep(0.75, 1.1, lv.add(r1.mul(0.08))));
    const pw = rotA(lp.mul(scl), axis, ang);
    const nw = rotA(nl, axis, ang);
    const centre = vec3(R4.x.add(L4.z.mul(float(1).sub(k))), R4.y.add(th.mul(0.5)).add(fallY), R4.z.add(L4.w.mul(float(1).sub(k)))).add(lift);
    m.positionNode = centre.add(pw);
    const hs = heatSample(R4.w, true);
    // a static per-shard patch (no noise per vertex: 2 400 slabs × 84 vertices × 4 views)
    const Hl = bedHeat(R4.w, smoothstep(float(0.62).sub(U.level.mul(0.85)), float(0.92).sub(U.level.mul(0.5)), fract(r1.mul(7.13).add(r3.mul(3.7)))), hs);
    const since = U.arrive.sub(L4.x).div(0.07);
    const flash = select(since.greaterThan(0), exp(since.negate()).mul(2.6), float(0));
    const landed = smoothstep(-0.01, 0.01, U.arrive.sub(L4.x));
    // the heat enters by the edges first: edges hotter, the mirror face a little cooler
    const faceHeat = select(aFace.greaterThan(0.5), float(0.75), select(aFace.lessThan(-0.5), float(0.9), float(1.3)));
    const Tc0 = Hl.mul(r2.mul(r2).mul(0.9).add(0.12)).add(flash).mul(landed).mul(exp(lv.mul(-1.6))).mul(faceHeat);
    // falling, it catches: an ember edge (cantos only) that warms from dark red as it nears the ground; never white before it lands
    const falling = step(0.001, k).mul(float(1).sub(landed));
    const fallT = smoothstep(0.25, 1.0, k).mul(0.4).add(0.08).mul(select(abs(aFace).lessThan(0.5), float(1), float(0.15))).mul(r3.mul(0.6).add(0.6)).mul(falling);
    // leaving, every shard breaks off as a live ember whatever the bed's heat (after the reward it is cool): it rises glowing and
    // cools to ash on the way up, so the break reads for ~3 s
    const leaveT = smoothstep(0.0, 0.12, lv).mul(exp(lv.mul(-1.5))).mul(r2.mul(0.35).add(0.5)).mul(select(abs(aFace).lessThan(0.5), float(1.3), float(0.8)));
    const Tc = Tc0.add(fallT).add(leaveT);
    const vLv = varying(smoothstep(0.02, 0.25, lv).mul(float(1).sub(smoothstep(0.9, 1.1, lv)))), vT = varying(Tc), vN = varying(nw), vVis = varying(smoothstep(0.0, 0.06, U.arrive).mul(scl).mul(float(1).sub(U.wait))), vFall = varying(falling);
    const vFace = varying(aFace), vSeed = varying(r1);
    m.colorNode = Fn(() => {
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld));
      const Nf = select(dot(N, V).lessThan(0), N.negate(), N);
      const R = reflect(V.negate(), Nf);
      const moon = normalize(vec3(-0.38, 0.8, 0.46));
      const isTop = smoothstep(0.5, 0.9, vFace);
      // the mirror face: brief glints of the moon, and of the fire below when it turns to face down (stronger while it rises)
      const moonG = pow(max(dot(R, moon), 0), 60.0).mul(mix(float(0.35), float(2.6), max(vLv, vFall.mul(0.6))));
      const fireG = pow(max(R.y.negate(), 0), 8.0).mul(U.level.mul(0.6).add(0.4)).mul(float(1).sub(U.cool.mul(0.5))).mul(mix(float(0.06), float(1.6), vLv));
      const mirror = vec3(0.004, 0.004, 0.0045).add(vec3(0.75, 0.74, 0.72).mul(moonG)).add(vec3(1.0, 0.5, 0.2).mul(fireG));
      // stone (underside, edges): dark sandstone with grain, lit a little by the moon and warmly by the fire below; a fine line of
      // light on the edges as they turn (fresnel)
      const grain = mx_noise_float(positionWorld.mul(38.0).add(vSeed.mul(50.0))).mul(0.25).add(0.85);
      const stoneC = vec3(0.05, 0.04, 0.03).mul(grain);
      const lit = vec3(0.3, 0.36, 0.48).mul(max(dot(Nf, moon), 0).mul(0.05)).add(vec3(1.0, 0.45, 0.16).mul(max(Nf.y.negate(), 0).mul(U.level.mul(0.08).add(0.02)).mul(float(1).sub(U.cool.mul(0.6)))));
      const rim = pow(float(1).sub(abs(dot(N, V))), 5.0).mul(select(abs(vFace).lessThan(0.5), float(1), float(0))).mul(mix(float(0.05), float(0.5), vLv));
      const stone = stoneC.mul(lit.mul(12.0)).add(vec3(1.0, 0.7, 0.45).mul(rim));
      const surf = mix(stone, mirror, isTop).mul(float(1).sub(min(vT, 1)));
      return surf.add(fireRamp(vT.mul(0.9))).mul(vVis);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1;
    object.add(mesh);
    // CPU: a subset of landings throws a puff of sparks
    const puffs = [];
    for (let i = 0; i < NSH; i += 12) puffs.push({ a: aFl[i * 4], x: aRest[i * 4], z: aRest[i * 4 + 2], h: aFl[i * 4 + 1], dx: aFl[i * 4 + 2], dz: aFl[i * 4 + 3] });
    mesh.userData.puffs = puffs;
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ 5b. smoke in a few columns
  // 24 plumes (3 500 sprites), placed by the CPU on hot stretches of the ring and moved when their 12–20 s life ends (fading in and out). The sprites,
  // large and soft (vertex stage, no state, NORMAL blending) are shared out among them: each rises up its column, widens with
  // height, leans with a slow wind and dissolves high up. Dark brown, lit warm from below. Denser in reward; 0 with leave. params.smoke.
  const NSM = 3500, NPL = 24;
  const PL = []; for (let i = 0; i < NPL; i++) PL.push(new THREE.Vector4());
  const uPL = uniformArray(PL, 'vec4');
  const uWind = uniform(new THREE.Vector3(0.6, 0, 0.2));
  const plumes = []; for (let i = 0; i < NPL; i++) plumes.push({ s: (i + Math.random()) * PER / NPL, d: 6, t0: -Math.random() * 16, dur: 12 + Math.random() * 8 });
  const smokeMesh = (() => {
    const r = rng(53), aR = new Float32Array(NSM * 4), aQ = new Float32Array(NSM * 4);
    for (let i = 0; i < NSM; i++) {
      aR[i * 4] = r(); aR[i * 4 + 1] = r(); aR[i * 4 + 2] = r(); aR[i * 4 + 3] = r();
      const ph = r() * Math.PI * 2, rad = Math.sqrt(r());
      aQ[i * 4] = Math.cos(ph) * rad; aQ[i * 4 + 1] = Math.sin(ph) * rad; aQ[i * 4 + 2] = i % NPL; aQ[i * 4 + 3] = r();
    }
    const g = quadGeo(NSM, { aR, aQ });
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, side: THREE.DoubleSide });
    const R4 = attribute('aR', 'vec4'), Q4 = attribute('aQ', 'vec4');
    const r1 = R4.x, r2 = R4.y, r3 = R4.z, r4 = R4.w, t = U.time;
    const pl = uPL.element(int(Q4.z));
    const age = fract(t.div(r1.mul(4.0).add(9.0)).add(r2.mul(13.0)));
    const y = age.mul(r3.mul(3.0).add(5.0)).add(0.25);
    const spread = age.mul(1.4).add(0.25);
    const sway = vec3(sin(t.mul(0.21).add(Q4.z.mul(1.7)).add(y.mul(0.5))), 0, cos(t.mul(0.17).add(Q4.z.mul(2.3)).add(y.mul(0.4)))).mul(age.mul(0.35));
    const p = vec3(pl.x.add(Q4.x.mul(spread)), y, pl.y.add(Q4.y.mul(spread))).add(uWind.mul(age.mul(age).mul(3.0))).add(sway);
    const size = float(0.8).add(r4.mul(0.7)).mul(age.mul(1.6).add(0.7));
    const dens = pl.w.mul(float(1).sub(U.wait)).mul(U.contract.mul(1.0).add(1)).mul(float(1).sub(smoothstep(0.25, 0.75, U.leave))).mul(U.smoke);
    const A = sin(age.mul(Math.PI)).mul(float(1).sub(age.mul(0.5))).mul(dens).mul(0.16)
      .mul(mx_noise_float(vec3(p.x.mul(0.35), p.y.mul(0.4).sub(t.mul(0.12)), p.z.mul(0.35))).mul(0.9).add(0.55).max(0));
    m.vertexNode = select(A.greaterThan(0.002), billboard(p, size, size), HIDE);
    const vA = varying(A), vWarm = varying(vec3(1.0, 0.4, 0.13).mul(pl.w.mul(exp(y.div(-1.5))).mul(0.12)));
    const q = uv().sub(0.5);
    m.colorNode = vec3(0.012, 0.01, 0.009).add(vWarm);
    m.opacityNode = vA.mul(exp(dot(q, q).mul(-9.0))).mul(float(1).sub(smoothstep(0.42, 0.5, length(q))));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5;
    object.add(mesh);
    return mesh;
  })();
  function updatePlumes(time, level, arr) {
    uWind.value.set(0.55 * Math.cos(time * 0.013), 0, 0.55 * Math.sin(time * 0.013));
    for (let i = 0; i < NPL; i++) {
      const pl = plumes[i];
      if (time - pl.t0 > pl.dur) {                      // a new column where the ring is hot (best of four tries)
        let best = pl.s, bh = -1;
        for (let k = 0; k < 4; k++) { const sx = Math.random() * PER, c = Math.round(wrapP(sx) / CELL) % NC, hh = dyn[c] + flare[c] + Math.random() * 0.4; if (hh > bh) { bh = hh; best = sx; } }
        pl.s = best; pl.d = RING0 + 1 + Math.random() * 2.5; pl.t0 = time; pl.dur = 12 + Math.random() * 8;
      }
      const u = (time - pl.t0) / pl.dur, env = Math.sin(Math.PI * clamp01(u)) ** 0.7;
      const c = Math.round(wrapP(pl.s) / CELL) % NC;
      ringPoint(pl.s, pl.d, _v);
      PL[i].set(_v.x, _v.z, pl.s, env * Math.min(1.6, 0.25 + 0.75 * level + 0.5 * dyn[c] + 0.4 * flare[c]) * clamp01((arr - ignTh(pl.s)) / 0.12));
    }
  }

  // ------------------------------------------------------------------------------------------------ 6. the air on the wall planes
  const HP = []; for (let i = 0; i < 16; i++) HP.push(new THREE.Vector4());
  const uHP = uniformArray(HP, 'vec4');
  const airMesh = (() => {
    const pos = [], sAt = [], nAt = [], idx = [];
    walls.forEach((w, i) => {
      const o = pos.length / 3, m = 0.06 / w.width;
      for (const [uu, vv] of [[-m, -0.02], [1 + m, -0.02], [1 + m, 1.02], [-m, 1.02]]) {
        room.wallPoint(i, uu, vv, _v).addScaledVector(w.normal, -0.004);
        pos.push(_v.x, _v.y, _v.z); sAt.push(cum[i] + uu * w.width); nAt.push(w.normal.x, w.normal.y, w.normal.z);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(sAt, 1));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(nAt, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const vS = varying(attribute('aS', 'float')), vN = varying(attribute('aN', 'vec3'));
    const eyeU = uniform(eye.clone());
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const Pw = positionWorld, y = Pw.y, s = wrapT(vS.sub(PER / 2)).add(PER / 2);
      const tw = length(Pw.xz.sub(eyeU.xz));
      const yR = eyeU.y.sub(eyeU.y.mul(tw).div(tw.add(mix(float(6.0), float((WAIT0 + WAIT1) / 2), U.wait))));             // where the middle of the bed is seen on this wall
      const hs = heatSample(s, false);
      const H = bedHeat(s, smoothstep(0.0, 0.7, U.level).mul(0.7).add(0.15), hs).mul(float(1).sub(smoothstep(0.3, 0.9, U.leave)));
      const dy = y.sub(yR);
      const g1 = exp(dy.mul(dy).div(-2 * 0.05 * 0.05)).mul(0.035), g2 = exp(max(dy, 0).div(-0.55)).mul(smoothstep(-0.08, 0.02, dy)).mul(0.03);
      const c = vec3(1.0, 0.36, 0.1).mul(H.mul(g1.add(g2))).mul(U.haze).toVar();
      Loop(U.nH, ({ i }) => {                                             // a hand: a warm glow at once, a flash when it lands
        const hp = uHP.element(i), d = Pw.sub(hp.xyz), r2 = dot(d, d);
        c.addAssign(vec3(1.0, 0.45, 0.15).mul(exp(r2.div(-2 * 0.13 * 0.13)).mul(hp.w.mul(0.16).add(0.04))).add(vec3(1.0, 0.55, 0.2).mul(exp(r2.div(-2 * 0.06 * 0.06)).mul(hp.w.mul(0.4)))));   // orange, never a white ball
      });
      return vec4(c.mul(float(1).sub(U.leave)), 1.0);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6;
    object.add(mesh);
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ 7. lights for the other parts
  const lights = walls.map((w, i) => {
    const l = new THREE.PointLight(0xff7a30, 0, 0, 2); l.layers.set(31);
    ringPoint(hearthS[i], 6, l.position); l.position.y = 0.6;
    object.add(l); return l;
  });

  // ------------------------------------------------------------------------------------------------ CPU state
  const hands = []; for (let i = 0; i < 32; i++) hands.push({ stroke: null, seen: false, acc: 0, rib: 0, jet: 0, jetAcc: 0, flash: 0, s: 0, y: 1.2 });
  const recent = []; for (let i = 0; i < 16; i++) recent.push({ s: 0, t: -1e9 });
  let recentI = 0;
  const waves = []; for (let i = 0; i < 4; i++) waves.push({ on: false, s0: 0, t0: 0, last: [0, 0], met: false });
  let level = 0.1, awakeEnv = 0, awakeT = -1e9, contract = 0, cool = 0, prevArrive = -1, lastWave = -1e9, prevWaveP = false, prevAwakeP = false, nextAutoWave = 0;
  const recentUps = []; for (let i = 0; i < 8; i++) recentUps.push({ s: 0, y: 0, t: -1e9 });
  let upI = 0, served = 'brasa', servedPhase = 'play', crowdN = 0, crowdK = 1, waitK = 0, breathPh = 0, trailI = 0, puffCount = 0, ambAcc = 0, columnAcc = 0, leaveAcc = 0, frame = 0, rewardT = 0;
  const addHeat = (arr, s, amt, sigma) => {
    const n = Math.ceil((sigma * 3) / CELL), c = Math.round(wrapP(s) / CELL);
    for (let k = -n; k <= n; k++) { const j = ((c + k) % NC + NC) % NC, x = (k * CELL) / sigma; arr[j] += amt * Math.exp(-0.5 * x * x); }
  };
  const maxHeat = (arr, s, amt, sigma) => {
    const n = Math.ceil((sigma * 3) / CELL), c = Math.round(wrapP(s) / CELL);
    for (let k = -n; k <= n; k++) { const j = ((c + k) % NC + NC) % NC, x = (k * CELL) / sigma; arr[j] = Math.max(arr[j], amt * Math.exp(-0.5 * x * x)); }
  };
  function startWave(s0, time) {
    const w = waves.find((x) => !x.on) || waves[0];
    w.on = true; w.s0 = s0; w.t0 = time; w.met = false;
    w.last[0] = w.last[1] = 0;
    spawnDevil(s0, 1, 3.0, 2.8, w, time); spawnDevil(s0, -1, 3.0, 2.8, w, time);
    lastWave = time;
  }
  function waveOrigin(time) {                       // circular mean of the hands landed in the last 1.2 s
    let cx = 0, cz = 0, n = 0;
    for (const r of recent) if (time - r.t <= 1.2) { const a = (r.s / PER) * Math.PI * 2; cx += Math.cos(a); cz += Math.sin(a); n++; }
    if (!n) return wrapP(hearthS[0]);
    return wrapP((Math.atan2(cz, cx) / (Math.PI * 2)) * PER);
  }

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20);
    const time = input.time ?? 0, S = input.state;
    const arrive = clamp01(input.arrive ?? (P.arrive ?? 1)), leave = clamp01(input.leave ?? (P.leave ?? 0));
    const vis = arrive > 0.001 && leave < 0.999;
    object.visible = vis;
    if (!vis) { prevArrive = arrive; return; }
    // the block this part serves: while it leaves (the score has moved on) it keeps the last one it served, so it breaks as itself
    if (S && (S.block === 'wait' || S.block === 'brasa')) { served = S.block; servedPhase = S.phase; }
    const phase = S ? servedPhase : (P.phase || 'play');
    const waitOn = S ? served === 'wait' : !!P.wait;
    waitK = frame <= 1 ? (waitOn ? 1 : 0) : waitK + ((waitOn ? 1 : 0) - waitK) * (1 - Math.exp(-dt / 1.2));
    breathPh = (time / 6) % 1;
    const progress = clamp01(input.progress ?? (S ? S.progress : P.progress) ?? 0);   // the host's per-part progress (0.05 in the wait; held while leaving)
    frame++; nE = 0;
    U.seed.value = (frame * 2654435761) >>> 0;

    // ---- events
    let waveEv = false, awakeEv = false;
    if (input.events) for (const e of input.events) { if (e === 'wave') waveEv = true; else if (e === 'awake') awakeEv = true; }
    if (!S) {                                       // the study's stand-in for the score
      if (P.wave && !prevWaveP) waveEv = true; prevWaveP = !!P.wave;
      if (P.awake && !prevAwakeP) awakeEv = true; prevAwakeP = !!P.awake;
      const every = Number(P.waveEvery) || 0;
      if (every > 0 && time >= nextAutoWave) { if (nextAutoWave > 0) waveEv = true; nextAutoWave = time + every; }
    }

    // ---- hands
    const downs = input.downs || [], hs = input.hands || [];
    for (const h of hands) h.seen = false;
    let together = 0;
    // a crowd is capped: 1–4 hands each get the full answer; with n > 4 every hand gives 4/n, so 15 hands light like ~4
    const gH = Math.min(1, 4 / Math.max(1, hs.length)), gHs = Math.sqrt(gH);
    crowdN = hs.length; crowdK += (gH - crowdK) * (1 - Math.exp(-dt / 0.6));
    for (const h of downs) {
      const s = cum[h.wall] + h.u * walls[h.wall].width;
      recent[recentI].s = s; recent[recentI].t = time; recentI = (recentI + 1) % recent.length;
      addHeat(dyn, s, 2.2 * gH, 0.75);
    }   // (the fountain, the burst and the devil start with the hand's slot below: a re-landing of the same hand is not a new touch)
    if (!S && P.autoWave !== false) {
      for (const r of recent) if (time - r.t <= 0.9) together++;
      if (downs.length && together >= 2 && time - lastWave > 2.5) waveEv = true;
    }
    let nh = 0;
    for (const h of hs) {
      let slot = null;
      for (const x of hands) if (x.stroke === h.stroke && x.stroke !== null) { slot = x; break; }
      if (!slot) {
        slot = hands.find((x) => x.stroke === null) || hands[0]; slot.stroke = h.stroke; slot.acc = 0; slot.rib = 0; slot.jetAcc = 0; slot.px = undefined;
        // the sensor can lose a hand for a moment and give it back with a new stroke: a landing within 0.6 m and 0.8 s of a hand that
        // just left is the same hand (no new fountain, no new devil)
        const s0 = cum[h.wall] + h.u * walls[h.wall].width;
        let cont = false;
        for (const u of recentUps) if (time - u.t < 0.8 && Math.abs(wrapC(u.s - s0)) < 0.6 && Math.abs(u.y - h.pos.y) < 0.6) { cont = true; break; }
        // (the old stroke's `up` comes ~0.3 s late: a new stroke right where another hand still is, is that hand)
        if (!cont) for (const x of hands) if (x !== slot && x.stroke !== null && Math.abs(wrapC(x.s - s0)) < 0.35 && Math.abs((x.y ?? 0) - h.pos.y) < 0.35) { cont = true; break; }
        slot.flash = cont ? slot.flash : 1; slot.jet = cont ? 0 : 0.6;
        if (!cont) {
          const n = h.normal, wk = 1 - 0.75 * waitK;
          emit(Math.max(24, 60 * gH) * wk, h.pos.x - n.x * 0.03, h.pos.y, h.pos.z - n.z * 0.03, 0.03, -n.x * 0.4, 0.9, -n.z * 0.4, 0.8, 1.0, 3.0, 0.4, 0.9, 1.6, 0.6, 1.2);   // a small burst at the hand, at once
          if ((P.devils ?? 1) > 0 && waitK < 0.5) spawnDevil(s0, Math.random() < 0.5 ? -1 : 1, 0.8 + Math.random() * 0.7, 7 + Math.random() * 3, null, time);   // dancing pace, m/s in the world
        }
      }
      slot.seen = true;
      const s = cum[h.wall] + h.u * walls[h.wall].width; slot.s = s; slot.y = h.pos.y;
      addHeat(dyn, s, dt * 0.9 * gH, 0.6);
      const n = h.normal, w = walls[h.wall], sp = Math.hypot(h.vx || 0, h.vy || 0);
      slot.acc += dt * (70 + 520 * Math.min(sp, 1.5)) * gH * (1 - 0.7 * waitK);                   // a resting hand: a trickle; a dragged one: a trail
      if (slot.acc >= 4) {
        const k = Math.floor(slot.acc); slot.acc -= k;
        const ix = w.right.x * (h.vx || 0) * 0.6, iz = w.right.z * (h.vx || 0) * 0.6, iy = (h.vy || 0) * 0.6;
        emit(k, h.pos.x - n.x * 0.03, h.pos.y, h.pos.z - n.z * 0.03, 0.04, -n.x * 0.7, 0.7, -n.z * 0.7, 0.5, 1.2, 4.5, 0.7, 1.6, 1.5, 1, 0.6, ix, iy, iz);
      }
      // the correfoc fountain: a jet over 0.6 s from the hand into the world (not all at once: a jet, and no white ball of overlap)
      if (slot.jet > 0) {
        const wk = 1 - 0.75 * waitK, nn = h.normal;
        slot.jetAcc += (780 / 0.6) * gH * wk * Math.min(dt, slot.jet); slot.jet -= dt;
        if (slot.jetAcc >= 4) { const k = Math.floor(slot.jetAcc); slot.jetAcc -= k; emit(k, h.pos.x - nn.x * 0.03, h.pos.y, h.pos.z - nn.z * 0.03, 0.05, -nn.x * 0.75, 0.68, -nn.z * 0.75, 0.32, 3.2, 8.5, 1.3, 2.8, 1.75, 1, 0.3); }
      }
      // a dragged hand leaves a ribbon: slow embers that hang where the hand passed, then sink and go out
      // (by the distance the hand really travels — the sensor's velocity can be 0 — about 4 embers a centimetre; they hang almost still,
      // glow gold, cool to red over 2–3 s and end as grey flakes)
      if (slot.px !== undefined) {
        const mv = Math.hypot(h.pos.x - slot.px, h.pos.y - slot.py, h.pos.z - slot.pz);
        if (mv < 0.5) slot.rib += mv * 400 * gH;
        if (slot.rib >= 3) {
          const k = Math.floor(slot.rib); slot.rib -= k;
          // spread along the segment just travelled: two emitters, at its two halves
          const mx = (h.pos.x + slot.px) / 2, my = (h.pos.y + slot.py) / 2, mz = (h.pos.z + slot.pz) / 2;
          emit(k / 2, h.pos.x - n.x * 0.04, h.pos.y, h.pos.z - n.z * 0.04, 0.035 + mv * 0.25, 0, 1, 0, 1.0, 0.01, 0.12, 2.0, 3.2, 1.6, -0.02, 3.5);
          emit(k / 2, mx - n.x * 0.04, my, mz - n.z * 0.04, 0.035 + mv * 0.25, 0, 1, 0, 1.0, 0.01, 0.12, 2.0, 3.2, 1.6, -0.02, 3.5);
        }
      }
      slot.px = h.pos.x; slot.py = h.pos.y; slot.pz = h.pos.z;
      if (nh < 16) { HP[nh].set(h.pos.x, h.pos.y, h.pos.z, slot.flash * gHs); nh++; }
      slot.flash *= Math.exp(-dt / 0.18);
    }
    for (const x of hands) if (!x.seen && x.stroke !== null) { const u = recentUps[upI]; u.s = x.s; u.y = x.y ?? 1.2; u.t = time; upI = (upI + 1) % recentUps.length; x.stroke = null; }
    U.nH.value = nh;

    // ---- the chapter's level, waves, awake, reward
    const target = phase === 'reward' ? 1 : 0.0 + progress;
    level += (target - level) * (1 - Math.exp(-dt * 0.8));
    if (waveEv) startWave(waveOrigin(time), time);
    const vW = Number(P.waveSpeed) || 3;
    for (const w of waves) {
      if (!w.on) continue;
      const r = vW * (time - w.t0), half = PER / 2;
      if (r >= half) {
        if (!w.met) {                               // the fronts meet on the far side
          w.met = true;
          const sm = w.s0 + half; ringPoint(sm, 6, _v); maxHeat(flare, sm, 3.5, 1.6); addHeat(dyn, sm, 2.0, 1.4);
          emit(1400, _v.x, 0.2, _v.z, 1.2, 0, 1, 0, 0.35, 4, 10, 1.6, 3.2, 2.4, 0.8, 0.35);
        }
        if (time - w.t0 > half / vW + 0.5) w.on = false;
        continue;
      }
      for (let side = 0; side < 2; side++) {
        const s = w.s0 + (side ? -r : r);
        maxHeat(flare, s, 2.6, 0.8); addHeat(dyn, s, dt * 2.4, 0.9);
        ringPoint(s, 4.5 + Math.random() * 3.5, _v);
        emit(Math.max(1, Math.round(1700 * dt * (0.45 + 0.55 * crowdK))), _v.x, 0.15, _v.z, 0.6, 0, 1, 0, 0.4, 3, 8, 1.0, 2.2, 2.2, 0.9, 0.4);
        if (r - w.last[side] >= 4) { w.last[side] = r; spawnDevil(s, side ? -1 : 1, 2.6 + Math.random() * 0.8, 2.6, w, time); }   // a relay of devils along the front
      }
    }
    if (awakeEv) { awakeT = time; for (let i = 0; i < NC; i++) flare[i] = Math.max(flare[i], 1.2); }
    const sa = time - awakeT;
    awakeEnv = sa < 0 ? 0 : sa < 0.8 ? 1.6 * smoother(sa / 0.8) : 0.35 + 1.25 * Math.exp(-(sa - 0.8) / 3);
    if (phase === 'reward') rewardT += dt; else rewardT = 0;
    const cTarget = phase === 'reward' ? smoother((rewardT - 1.5) / 4) : 0;
    contract += (cTarget - contract) * (1 - Math.exp(-dt * 1.5));
    const coolT = Math.max(phase === 'reward' ? 0.55 * smoother((rewardT - 3) / 4) : 0, smoother(leave / 0.7));
    cool += (coolT - cool) * (1 - Math.exp(-dt * 2));

    // ---- ambient sparks off the ring, the awake column, the leave motes, the landing puffs
    if (waitK > 0.5) {                                              // the wait: now and then a single ember leaves the line
      ambAcc += dt * 2.5 * waitK;
      while (ambAcc >= 1) { ambAcc -= 1; const s = Math.random() * PER; ringPoint(s, WAIT0 + Math.random(), _v); emit(2 + Math.random() * 3, _v.x, 0.05, _v.z, 0.2, 0, 1, 0, 0.3, 0.6, 1.8, 1.2, 2.4, 1.3, -0.1, 0.8); }
    }
    else ambAcc += dt * (1.5 + 26 * level * (1 - cool)) * arrive;
    while (ambAcc >= 1) {
      ambAcc -= 1;
      const s = Math.random() * PER; ringPoint(s, RING0 + 0.5 + Math.random() * 3, _v);
      emit(5 + Math.random() * 10, _v.x, 0.08, _v.z, 0.3, 0, 1, 0, 0.45, 1.5, 4.8, 0.7, 1.8, 1.7, 0.75, 0.7);
    }
    if (sa >= 0 && sa < 9) {
      columnAcc += dt * 26 * (sa < 7 ? 1 : 1 - (sa - 7) / 2);
      while (columnAcc >= 1) {
        columnAcc -= 1;
        const s = Math.random() * PER; ringPoint(s, RING0 + Math.random() * 4, _v);
        emit(60, _v.x, 0.2, _v.z, 0.7, 0, 1, 0, 0.25, 1.0, 2.6, 4.5, 7.5, 1.6, -0.22, 0.35);
      }
    }
    if (leave > 0.02 && leave < 0.75) {
      leaveAcc += dt * 90 * (1 - leave / 0.75);
      while (leaveAcc >= 1) {
        leaveAcc -= 1;
        const s = Math.random() * PER; ringPoint(s, RING0 + Math.random() * 4, _v);
        emit(40, _v.x, 0.1, _v.z, 0.8, 0, 1, 0, 0.5, 0.4, 1.6, 4, 7, 1.4, -0.18, 0.5);
      }
    }
    if (prevArrive >= 0 && arrive > prevArrive && arrive - prevArrive < 0.15) {
      for (const p of shardMesh.userData.puffs) if (p.a > prevArrive && p.a <= arrive && ++puffCount) emit(26, p.x, 0.05, p.z, 0.15, 0, 1, 0, 0.6, 1.2, 4, 0.5, 1.4, 2.0, 1, 0.8);
    }
    // falling shards leave a thin trail of dying embers: 8 of the falling ones per frame, in turn
    if (arrive < 0.999) {
      const pf = shardMesh.userData.puffs; let n = 0;
      for (let j = 0; j < pf.length && n < 8; j++) {
        const p = pf[(trailI + j) % pf.length], kf = clamp01((arrive - (p.a - 0.32)) / 0.32);
        if (kf <= 0.02 || kf >= 0.99) continue;
        const u = 1 - kf;
        emit(3, p.x + p.dx * u, 0.03 + p.h * (1 - kf * kf), p.z + p.dz * u, 0.08, 0, 1, 0, 1.0, 0.05, 0.4, 0.4, 0.8, 0.55 + 0.5 * kf, 0.15, 2.5);
        n++;
      }
      trailI = (trailI + 8) % pf.length;
    }
    prevArrive = arrive;

    // ---- devils
    for (let i = 0; i < MAXD; i++) {
      const dv = devils[i], ds = DS[i];
      if (!dv.on) { ds.set(0, 0, 0, 0); continue; }
      dv.age += dt;

      dv.k = Math.min(1, dv.k + dt / 0.9);
      if (dv.age > dv.life || leave > 0.3) dv.dis = Math.min(1, dv.dis + dt / 1.8);
      if (dv.dis >= 1) { dv.on = false; ds.set(0, 0, 0, 0); continue; }
      const tw = ringPoint(dv.s, dv.d, _v2);
      dv.s += dv.dir * dv.spd * dt * tw / (tw + dv.d);                   // spd is metres per second on the square's floor
      dv.stride = Math.min(0.55, 0.16 + dv.spd * 0.12);
      dv.phase += dt * Math.PI * 2 * Math.min(3.0, Math.max(1.3, 0.9 + dv.spd * 0.6));
      pose(dv, time);
      for (let j = 0; j < NJ; j++) JV[i * NJ + j].set(J[j].x, J[j].y, J[j].z, 0);
      ds.set(dv.k, dv.dis, (0.9 + 0.15 * Math.sin(time * 9 + i)) * Math.max(0.5, Number(P.devils ?? 1)), 0);
      addHeat(dyn, dv.s, dt * 0.5, 0.7);
      // the carretilles: two spinning sprays at the ends of the crossbar
      const live = dv.k * (1 - dv.dis);
      dv.acc += dt * 650 * live;
      if (dv.acc >= 6) {
        const n = Math.floor(dv.acc); dv.acc -= n;
        for (let e = 0; e < 2; e++) {
          const end = J[20 + e], a = time * 11 + e * Math.PI + i;
          tmpA.crossVectors(barD, UPV).normalize();
          const dx = Math.cos(a) * UPV.x + Math.sin(a) * tmpA.x, dy = Math.cos(a) * UPV.y + Math.sin(a) * tmpA.y + 0.3, dz = Math.cos(a) * UPV.z + Math.sin(a) * tmpA.z;
          emit(n / 2, end.x, end.y, end.z, 0.03, dx, dy, dz, 0.45, 2.5, 6, 0.4, 1.0, 2.1, 0.8, 1.1);
        }
      }
    }

    // ---- the heat field -> texture
    const kd = Math.exp(-dt / 3.2), kf = Math.exp(-dt / 0.7);
    for (let i = 0; i < NC; i++) {
      dyn[i] = Math.min(4, dyn[i] * kd); flare[i] = Math.min(4, flare[i] * kf);
      heatData[i * 4] = Math.round((dyn[i] / 4) * 255); heatData[i * 4 + 1] = Math.round((flare[i] / 4) * 255);
    }
    heatTex.needsUpdate = true;

    // ---- uniforms
    U.time.value = time % 3000; U.dt.value = dt; U.level.value = level; U.arrive.value = arrive; U.leave.value = leave;
    U.contract.value = contract; U.cool.value = cool; U.earth.value = Math.max(contract, smoother(leave / 0.5)); U.awake.value = awakeEnv * (1 - cool);
    U.flames.value = Number(P.flames ?? 1); U.heat.value = Number(P.heat ?? 1); U.devils.value = Number(P.devils ?? 1) * (0.35 + 0.65 * crowdK);
    // (a crowd: the devils dimmer; the bed too, so many hands are no brighter than ~4)
    U.crowd.value = 0.6 + 0.4 * crowdK;
    U.haze.value = Number(P.haze ?? 1); U.wait.value = waitK; U.breath.value = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(breathPh * Math.PI * 2)); U.smoke.value = Math.max(0, Number(P.smoke ?? 1)); smokeMesh.visible = U.smoke.value > 0;
    updatePlumes(time, level * (1 - cool * 0.5), arrive);
    U.nE.value = nE;
    for (let i = 0; i < lights.length; i++) {
      const c = Math.round(wrapP(hearthS[i]) / CELL) % NC;
      lights[i].intensity = (8 + 30 * level + 20 * (dyn[c] + flare[c])) * arrive * (1 - cool * 0.8) * (1 - leave);
    }
    room.renderer.compute(sparkCompute);
  }

  if (typeof window !== 'undefined') window.__brasa = { breath: () => U.breath.value, wait: () => waitK, puffs: () => puffCount, roots: () => devils.map((d, i) => (d.on && d.dis === 0 ? [i, JV[i * NJ].x, JV[i * NJ].z, d.wave ? 1 : 0] : null)).filter(Boolean), devils: () => devils.filter((d) => d.on).length, waves: () => waves.filter((w) => w.on).length, emitters: () => nE };
  return {
    object,
    update,
    setParams(p) { if (p && p !== P) Object.assign(P, p); },
    dispose() {
      for (const m of [floorMesh, flameMesh, sparkMesh, devilMesh, shardMesh, smokeMesh, airMesh]) { m.geometry.dispose(); m.material.dispose(); }
      heatTex.dispose();
      for (const b of [bufP, bufV, bufK]) b.value?.dispose?.();
    },
  };
}
