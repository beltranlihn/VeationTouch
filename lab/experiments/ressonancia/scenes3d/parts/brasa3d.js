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
// STUDIO NIGHT 25-11 (VFX, plan 05 §5.6 Brasa a–c): (a) THE FIRE CATCHES UNDER THE HAND — a flame of ~1.2 m rises in the wall plane
//   (0.6 m behind it) within 0.3–0.6 s of a hand landing (the sound answers at once), holds while the hand stays, and sinks to an ember
//   that glows on for ~60 s (16 hearths; a new hand near a burning one feeds it). (b/c) IN THE SQUARE AT NIGHT: when the plaza part is
//   shown with this one (the host's Brasa set), the liquid chrome floor, its reflections, the far monoliths and the liquid's haze go,
//   the world does not sink, and every hand-lit fire lights the square's facades and slabs (parts.plaza.setFires). The air and the
//   smoke are the room's (setAir: a dark smoky night).

import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
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

export function create({ THREE, TSL, room, params, parts }) {
  const P = params || {};
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionWorld, positionGeometry, uv, texture,
    vec2, vec3, vec4, float, int, uint, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, floor, fract, pow,
    dot, normalize, length, select, hash, modelViewMatrix, cameraProjectionMatrix, cameraWorldMatrix, cameraPosition, Discard,
    mx_noise_float, mx_fractal_noise_float, cross, reflect, step, atan,
  } = TSL;
  const object = new THREE.Group();
  object.name = 'brasa3d';
  const world = new THREE.Group(); world.name = 'brasa3d-world';        // everything of the fire world: it rises (the room sinks into the liquid)
  object.add(world);
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
  const s0h = (h) => cum[h.wall] + h.u * walls[h.wall].width;          // a hand's perimeter position
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
    lift: uniform(0), refl: uniform(1), chrome: uniform(1), quiet: uniform(0.3), callT: uniform(-99), callGap: uniform(0.8), callOn: uniform(0), callW: uniform(new THREE.Vector4()),
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
  const puddleT = (xz) => mix(smoothstep(-0.05, 0.35, mx_noise_float(vec3(xz.x.mul(0.21), 7.7, xz.y.mul(0.21)))), float(1), U.wait);   // the lava lies in puddles
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
  const subGeo = (g, n) => { const h = new THREE.InstancedBufferGeometry(); h.index = g.index; for (const k in g.attributes) h.setAttribute(k, g.attributes[k]); h.instanceCount = n; return h; };   // a shared subset (perf)
  const additive = () => new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  // ------------------------------------------------------------------------------------------------ the liquid chrome (T-029)
  // The world's floor is liquid metal at local y = 0 (the world group rises by `lift`: the room sinks into it). Its surface =
  // a slow swell (4 analytic waves) + up to RIP_N ripple rings (CPU sources: splashes, drops, the wave fronts) + fine noise (the floor
  // only). It REFLECTS two ways: (1) mirror geometry — flames, sparks, devils, tiles, drops and the far monoliths are drawn a second time
  // mirrored in y = 0, each point shifted by the surface slope where its reflection is seen (so the reflection ripples); it is world
  // geometry, continuous at the corners and at P3|P4; (2) an environment term — each reflected ray is cut with the fire ring (a cylinder
  // round the eye) and reads the ring's heat there (the broad glow, broken by the ripples), dark sky above.
  const RIP_N = 24, RIP_C = 0.6, RIP_K = TAU / 0.3;
  const RS = []; for (let i = 0; i < RIP_N; i++) RS.push(new THREE.Vector4(0, 0, -1e4, 0));
  const uRS = uniformArray(RS, 'vec4');
  let ripI = 0;
  const SWELL = [[0.83, 0.56, 2.2, 0.9, 0.05], [-0.42, 0.91, 3.1, -1.1, 0.032], [0.97, -0.24, 4.3, 1.3, 0.012], [-0.66, -0.75, 0.6, -0.35, 0.07]];   // the ground swell: λ 1.5–3 m, 4–8 cm (+ a long one)
  const swellT = (xz) => {
    let h = float(0), gx = float(0), gz = float(0);
    for (const [dx, dz, k, w, a] of SWELL) {
      const ph = xz.x.mul(dx * k).add(xz.y.mul(dz * k)).add(U.time.mul(w));
      h = h.add(sin(ph).mul(a)); const c = cos(ph).mul(a * k); gx = gx.add(c.mul(dx)); gz = gz.add(c.mul(dz));
    }
    return vec3(h, gx, gz).mul(U.chrome);
  };
  const ripT = Fn(([xz]) => {
    const acc = vec3(0, 0, 0).toVar();
    Loop(RIP_N, ({ i }) => {
      const r4 = uRS.element(i), d = xz.sub(r4.xy), r = length(d).add(0.002), age = U.time.sub(r4.z);
      const ph = r.sub(age.mul(RIP_C)), q = ph.add(0.3);
      const env = exp(q.mul(q).mul(-5.0)).mul(exp(age.mul(-0.6))).mul(r4.w).div(r.mul(1.2).add(0.6)).mul(step(0.0, age));
      const g = cos(ph.mul(RIP_K)).mul(env).mul(RIP_K);
      acc.addAssign(vec3(sin(ph.mul(RIP_K)).mul(env), g.mul(d.x).div(r), g.mul(d.y).div(r)));
    });
    return acc;
  });
  // the reflection of a local point p (world group): mirrored in y = 0 and shifted by the slope where it is seen reflected
  const camL = vec3(cameraPosition.x, cameraPosition.y.sub(U.lift), cameraPosition.z);
  const mirP = Fn(([p]) => {
    const hgt = max(p.y, 0.0);
    const q = camL.xz.add(p.xz.sub(camL.xz).mul(camL.y.div(camL.y.add(hgt))));
    const g = swellT(q);   // (perf, QA 14:30: no 24-ripple loop per mirrored vertex; the floor still draws every ripple)
    const k = min(hgt, 1.5).mul(1.6);
    return vec3(p.x.add(g.y.mul(k)), hgt.negate(), p.z.add(g.z.mul(k)));
  });
  const CHROME = vec3(1.0, 0.93, 0.84);                                 // the metal's tint on what it reflects
  // the perimeter position s of a direction (hx, hz) from the eye (a 4-wall rectangle; the eye at x = z = 0)
  const angleS = (hx, hz) => {
    const zw = abs(hz).mul(ax).greaterThan(abs(hx).mul(bz));
    const x0 = hx.mul(bz).div(max(abs(hz), 1e-4)), z0 = hz.mul(ax).div(max(abs(hx), 1e-4));
    const sZ = select(hz.lessThan(0), x0.add(ax + cum[0]), float(cum[2] + ax).sub(x0));
    const sX = select(hx.greaterThan(0), z0.add(bz + (cum[1] ?? 0)), float((cum[3] ?? 0) + bz).sub(z0));
    return select(zw, sZ, sX);
  };
  let twSum = 0; for (const w of walls) twSum += -new THREE.Vector3().subVectors(w.centre, eye).dot(w.normal);
  const RCYL = twSum / NW + 6.2;                                         // the ring, as a cylinder round the eye
  // the fire ring seen along a reflected ray R from a surface point P (local): its heat where the ray meets the ring, low and warm
  const envFire = (P, R, vertex) => {
    const a = max(dot(R.xz, R.xz), 1e-5), b = dot(P.xz, R.xz).mul(2), c = dot(P.xz, P.xz).sub(RCYL * RCYL);
    const disc = b.mul(b).sub(a.mul(c).mul(4)), sq = sqrt(max(disc, 0));
    const t = select(c.lessThan(0), b.negate().add(sq), b.negate().sub(sq)).div(a.mul(2));
    const ok = disc.greaterThan(0).and(t.greaterThan(0));
    const hit = P.xz.add(R.xz.mul(t)), yh = max(P.y.add(R.y.mul(t)), 0.0);
    const s = angleS(hit.x, hit.y);
    const H = bedHeat(s, 0.85, heatSample(s, vertex));
    const glow = H.mul(exp(yh.div(-0.3)).mul(0.45).add(exp(yh.div(-1.2)).mul(0.04)));
    return vec3(1.0, 0.36, 0.1).mul(glow).mul(select(ok, float(1), float(0)));
  };
  const skyEnv = (R) => vec3(0.003, 0.0028, 0.003).add(vec3(0.35, 0.46, 0.69).mul(0.1).mul(smoothstep(0.02, 0.5, R.y)).mul(mx_noise_float(vec3(R.x.mul(3.0), R.y.mul(6.0), R.z.mul(3.0))).mul(0.35).add(0.75)))
    .add(vec3(0.012, 0.0045, 0.0016).mul(exp(max(R.y, 0).mul(-9.0))).mul(U.level).mul(float(1).sub(U.cool)));
  const fireLightK = () => min(U.level.mul(0.5).add(0.12).mul(float(1).sub(U.cool.mul(0.6))).add(U.awake.mul(0.15)), 0.7);
  // a glossy highlight of the fire ring's light (it lies out and below): tiles, drops, monoliths
  const fireSpec = (P, R, k) => { const Ld = normalize(vec3(P.x, P.y.negate().mul(0.2).sub(0.25), P.z)); return vec3(1.0, 0.5, 0.2).mul(pow(max(dot(R, Ld), 0), k)).mul(fireLightK()); };
  // quaternion rotation (tiles)
  const rotQ = (q, v) => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2.0));

  // ------------------------------------------------------------------------------------------------ 1. the floor and the ember bed
  const floorMesh = (() => {
    const sList = [];
    walls.forEach((w, i) => { const n = Math.max(8, Math.round(w.width * 16)); for (let k = 0; k < n; k++) sList.push(cum[i] + (w.width * k) / n); });
    sList.push(PER);
    const dList = [-2.2, -1.6, -1.0, -0.5, 0.02, 0.5, 1.2, 2, 2.8, 3.3, 3.6, 3.9, 4.2, 4.6, 5, 5.5, 6, 6.5, 7, 7.4, 7.8, 8.1, 8.4, 8.8, 9.4, 10.5, 12, 15, 20, 30, 45, 70, 110];
    const pos = [], at = [], idx = [];
    for (const s of sList) for (const d of dList) { ringPoint(s, d, _v); pos.push(_v.x, 0, _v.z); at.push(s, d); }
    const nd = dList.length;
    for (let i = 0; i < sList.length - 1; i++) for (let j = 0; j < nd - 1; j++) { const a = i * nd + j, b = a + nd; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSD', new THREE.Float32BufferAttribute(at, 2));
    g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, depthWrite: false });   // no depth: its reflections (mirror geometry, y < 0) show through it
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
      const pud = puddleT(xz);
      const T = H.mul(band).mul(pud).mul(coal.mul(0.75).add(0.12).add(crk.mul(coal).mul(1.1))).mul(fl).mul(breathe);
      const col = fireRamp(T).toVar();
      // ash crust, warm earth (the reward: the next chapter is clay)
      const ash = vec3(0.016, 0.015, 0.014).mul(band).mul(float(1).sub(coal).mul(0.7).add(0.3)).mul(min(H.mul(2.0).add(U.cool.mul(1.2)), 1.0));
      const earthMask = smoothstep(RING0 - 2.5, RING0, d).mul(smoothstep(RING1 + 3, RING1, d));
      const earth = vec3(0.034, 0.016, 0.007).mul(U.earth).mul(earthMask).mul(mx_noise_float(vec3(xz.x.mul(1.7), 9.0, xz.y.mul(1.7))).mul(0.3).add(0.8));
      col.addAssign(ash.add(earth));
      // the liquid chrome between the floating embers: swell + ripples + fine noise, reflecting the fire ring and the sky
      const wq = vec2(mx_noise_float(vec3(xz.x.mul(0.09), 3.3, xz.y.mul(0.09))), mx_noise_float(vec3(xz.x.mul(0.09), 8.1, xz.y.mul(0.09)))).mul(3.5);   // the swell warped (no periodic zigzag)
      const rip = vec3(0, 0, 0).toVar();
      If(d.lessThan(4.5), () => { rip.assign(ripT(xz)); });   // ripples live near the walls (splashes, drops, the wave's wake): skip the loop far out (perf)
      const g = swellT(xz.add(wq)).add(rip).toVar();
      const gN = vec2(sin(xz.x.mul(3.7).add(xz.y.mul(1.3)).add(t.mul(0.5))), sin(xz.y.mul(3.1).sub(xz.x.mul(1.9)).sub(t.mul(0.43)))).mul(0.012).mul(U.chrome);   // fine ripple, analytic (was 3 noises)
      const Nn = normalize(vec3(g.y.add(gN.x).negate(), 1.0, g.z.add(gN.y).negate()));
      const V = normalize(cameraPosition.sub(positionWorld));
      const R = reflect(V.negate(), Nn).toVar();
      R.y.assign(max(R.y, 0.002));
      const cosT = max(dot(Nn, V), 0.0), F = float(0.78).add(pow(float(1).sub(cosT), 5.0).mul(0.22));
      const Pl = vec3(xz.x, 0.0, xz.y);
      const farK = float(1).sub(smoothstep(3.0, 4.5, abs(d.sub(6.0))).mul(0.5));   // far from the fire: near-black metal with silver edges
      const liquid = envFire(Pl, R, false).mul(farK).add(skyEnv(R).mul(mix(float(0.5), float(1), farK))).mul(F).mul(CHROME).mul(U.refl).mul(float(1).sub(U.earth.mul(0.55)));
      const island = band.mul(pud).mul(smoothstep(0.32, 0.64, coal)).mul(float(1).sub(U.wait)).add(U.wait.mul(band));
      const outC = mix(liquid, col, max(island, float(1).sub(U.chrome)));
      return outC.mul(float(1).sub(smoothstep(0.55, 1.0, U.leave)));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -2;
    world.add(mesh);
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
    const meshes = [];
    for (const mirror of [false, true]) {
    const m = additive();
    const H4 = attribute('aH', 'vec4'), R4 = attribute('aR', 'vec4');
    const xz = H4.xy, s = H4.z, r1 = R4.x, r2 = R4.y, r3 = R4.z, r4 = R4.w, t = U.time;
    const hs = heatSample(s, true);
    const H = bedHeat(s, livePatch(xz), hs).mul(puddleT(xz)).mul(float(1).sub(smoothstep(0.1, 0.5, U.leave))).mul(U.flames).mul(float(1).sub(U.wait));
    const age = fract(t.mul(r1.mul(0.9).add(0.55)).add(r2.mul(17.0)));
    const tongue = mx_noise_float(vec3(xz.x.mul(1.6), t.mul(1.3), xz.y.mul(1.6))).mul(0.5).add(0.55);
    const hgt = H.mul(0.55).add(0.08).mul(tongue).add(hs.g.mul(4 * 0.5)).add(U.awake.mul(0.45));
    const sway = age.mul(age).mul(0.16);
    const p = vec3(xz.x.add(sin(t.mul(2.3).add(r3.mul(40.0)).add(age.mul(4.0))).mul(sway)), age.mul(hgt).add(0.04), xz.y.add(cos(t.mul(1.9).add(r4.mul(40.0)).add(age.mul(3.0))).mul(sway)));
    const size = float(0.1).add(r3.mul(0.12)).mul(float(1).sub(age.mul(0.55))).mul(min(H, 1.2).mul(0.5).add(0.55));
    const T = pow(float(1).sub(age), 1.25).mul(1.25).mul(min(H, 1.5));
    const E = smoothstep(0.0, 0.08, age).mul(pow(float(1).sub(age), 1.3)).mul(0.09);
    m.vertexNode = select(H.greaterThan(0.025), billboard(mirror ? mirP(p) : p, size, size.mul(1.7)), HIDE);
    const vC = varying(fireRamp(T).mul(E));
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-16).add(q.y.mul(q.y).mul(-11)))).mul(mirror ? CHROME.mul(U.refl).mul(0.65) : float(1));
    m.fog = false;
    const mesh = new THREE.Mesh(mirror ? subGeo(g, Math.floor(NF / 3)) : g, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 2;
    world.add(mesh); meshes.push(mesh);
    }
    return meshes;
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
    const meshes = [];
    for (const mirror of [false, true]) {
    const m = additive();
    const P4 = bufP.toAttribute(), V4 = bufV.toAttribute(), K4 = bufK.toAttribute();
    const inside = abs(P4.x).lessThan(ax - 0.02).and(abs(P4.z).lessThan(bz - 0.02));
    const alive = V4.w.greaterThan(0).and(P4.w.lessThan(V4.w)).and(inside.not());
    const x = clamp(P4.w.div(max(V4.w, 1e-3)), 0, 1);
    const buoy = K4.y.lessThan(0);
    const T = K4.x.mul(pow(float(1).sub(x), select(buoy, float(1.6), float(1.1)))).mul(sin(U.time.mul(31.0).add(K4.w.mul(300.0))).mul(0.12).add(0.88));
    const hp = mirror ? mirP(P4.xyz) : P4.xyz, tp = mirror ? hp.sub(vec3(V4.x, V4.y.negate(), V4.z).mul(0.024)) : P4.xyz.sub(V4.xyz.mul(0.024));
    const head = modelViewMatrix.mul(vec4(hp, 1)), tail = modelViewMatrix.mul(vec4(tp, 1));
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
    // T-047 (#20): sparks born with heat ≥ 2.9 (only the call's counted landings; every other emitter ≤ 2.5) are drawn WHITE
    const vC = varying(mix(fireRamp(T), vec3(1.0, 0.96, 0.9).mul(T.mul(1.5)), step(2.9, K4.x)).mul(E).add(vec3(0.05, 0.048, 0.046).add(vec3(0.5, 0.55, 0.62).mul(glint)).mul(ashK)));
    const vA = varying(along);
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-14))).mul(mix(float(0.3), float(1), vA)).mul(mirror ? CHROME.mul(U.refl).mul(0.6) : float(1));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 4;
    world.add(mesh); meshes.push(mesh);
    }
    return meshes;
  })();
  let cursor = 0, nE = 0, whiteN = 0;
  const sparkGain = () => Math.max(0, Number(P.sparks ?? 1)) * 0.7;   // AD#5: −30 %
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
    const w2 = BONES.map((b, i) => (i === 16 || i === 17 ? 0 : (b[0] === b[1] ? 4 * b[2] * b[2] * 3.2 : LEN[i] * (b[2] + b[3]) * 3.2) + 0.002));   // AD#5: no forca pole / bar (it read as a gallows); the hands still spray the carretilles' sparks
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
    const meshes = [];
    for (const mirror of [false, true]) {
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
    m.vertexNode = select(st.x.greaterThan(0.001).and(T.greaterThan(0.01)), billboard(mirror ? mirP(p) : p, size, size.mul(float(1.4).add(v.mul(2.0)))), HIDE);
    const vC = varying(fireRamp(T).mul(E));
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(dot(q, q).mul(-14))).mul(mirror ? CHROME.mul(U.refl).mul(0.65) : float(1));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 3;
    world.add(mesh); meshes.push(mesh);
    }
    return meshes;
  })();
  const devils = [];
  for (let i = 0; i < MAXD; i++) devils.push({ on: false, s: 0, d: DEV_D, dir: 1, spd: 0.7, age: 0, life: 8, k: 0, dis: 0, style: 0, phase: 0, wave: null, h: 1, acc: 0, born: 0, res: i >= MAXD - 4, hop: 0, gain: 1 });
  // T-056: the last 4 slots are the relay's (the runner + up to 3 that run to fetch it); spawnDevil never takes them
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
    root.y += 0.28 * h * Math.sin(spinK * Math.PI) + (dv.hop || 0);   // T-056: the relay's leap
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
    for (const dv of devils) if (dv.on && dv.dis === 0 && Math.abs(wrapC(dv.s - s)) < 1.6 && !wave && !dv.wave) return null;   // one per place (the relay's runner too: no second devil on its hand)
    { let n = 0, all = 0; for (const dv of devils) if (dv.on && dv.dis === 0 && !dv.res) { all++; if (!dv.wave) n++; }
      if (!wave && n >= (crowdN > 4 ? 2 : 5)) return null;               // a crowd: at most 2 hand devils (5 for a few people)
      if (wave && all >= (crowdN > 4 ? 4 : 6)) return null; }            // and the wave's relay only while few dance
    const dv = devils.find((x) => !x.on && !x.res);
    if (!dv) return null;
    Object.assign(dv, { hop: 0, gain: 1, on: true, s, d: DEV_D + (Math.random() - 0.5) * 1.2, dir, spd, stride: 0.3, age: 0, life, k: 0, dis: 0, style: devilCount % 2, phase: Math.random() * 6, wave, h: 1 + Math.random() * 0.1, acc: 0, born: devilCount++ * 1.37 % 100 });
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
    world.add(mesh);
    // CPU: a subset of landings throws a puff of sparks
    const puffs = [];
    for (let i = 0; i < NSH; i += 12) puffs.push({ a: aFl[i * 4], x: aRest[i * 4], z: aRest[i * 4 + 2], h: aFl[i * 4 + 1], dx: aFl[i * 4 + 2], dz: aFl[i * 4 + 3] });
    mesh.userData.puffs = puffs;
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------ 5c. the burning trencadís (T-029)
  // NT glazed ceramic tiles float 0.15–1.1 m beyond the walls at hand height (the near layer), turning slowly, their edges smouldering.
  // A hand knocks them loose (CPU rigid bodies): they catch fire, jump into the world spinning, fall, hit the liquid chrome (a crown of
  // sparks, a crown of chrome drops, a ripple), bounce once, float, tilt and sink as they go out. New ones assemble 3–6 s later.
  // Drawn as one instanced slab (per-instance position/scale, quaternion, state from the CPU each frame) + its mirror in the liquid.
  const NT = 240, ND = 220;
  const tA = new Float32Array(NT * 4), tQ = new Float32Array(NT * 4), tS = new Float32Array(NT * 4);
  const GLAZE = [[0.024, 0.006, 0.004], [0.03, 0.008, 0.005], [0.04, 0.011, 0.006], [0.026, 0.007, 0.004], [0.022, 0.012, 0.01]];   // crust #2A0C08   // crust #2A0C08, a few with red glaze
  const glazeT = (k) => { let c = vec3(...GLAZE[0]); for (let i = 1; i < GLAZE.length; i++) c = select(k.greaterThan(i - 0.5), vec3(...GLAZE[i]), c); return c; };
  // a hot surface lit by the fire: the light from the ring (out and down), from the liquid below, and its glossy reflection
  const glossEnv = (P, R) => envFire(P, R, false).add(skyEnv(R)).mul(select(R.y.greaterThan(0), float(1), float(0)))
    .add(envFire(P, vec3(R.x, R.y.abs(), R.z), false).mul(0.75).mul(select(R.y.greaterThan(0), float(0), float(1))));
  const tileGeo = (() => {
    const NCOR = 7, P0 = [], N0 = [], F0 = [], C0 = [];
    const ring = (k, rad, z) => { const a = (k % NCOR) * (Math.PI * 2 / NCOR); return [Math.cos(a) * rad, Math.sin(a) * rad, z]; };
    const tri = (A, B, C, ka, kb, kc, face) => {
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((x) => x / l);
      for (const [Pt, k] of [[A, ka], [B, kb], [C, kc]]) { P0.push(...Pt); N0.push(...n); F0.push(face); C0.push(k % NCOR); }
    };
    for (let k = 0; k < NCOR; k++) {
      const k1 = k + 1;
      tri([0, 0, 0.5], ring(k, 0.5, 0.5), ring(k1, 0.5, 0.5), k, k, k1, 1);
      tri([0, 0, -0.5], ring(k1, 0.5, -0.5), ring(k, 0.5, -0.5), k, k1, k, -1);
      const a0 = ring(k, 0.5, 0.5), a1 = ring(k1, 0.5, 0.5), b0 = ring(k, 0.5, -0.5), b1 = ring(k1, 0.5, -0.5);
      tri(b0, b1, a1, k, k1, k1, 0); tri(b0, a1, a0, k, k1, k, 0);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P0, 3));
    geo.setAttribute('aNrm', new THREE.Float32BufferAttribute(N0, 3));
    geo.setAttribute('aFace', new THREE.Float32BufferAttribute(F0, 1));
    geo.setAttribute('aCor', new THREE.Float32BufferAttribute(C0, 1));
    for (const [k, arr] of [['aTA', tA], ['aTQ', tQ], ['aTS', tS]]) { const b = new THREE.InstancedBufferAttribute(arr, 4); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, b); }
    geo.instanceCount = NT;
    return geo;
  })();
  const tileMesh = [];
  for (const mirror of [false, true]) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const A4 = attribute('aTA', 'vec4'), Q4 = attribute('aTQ', 'vec4'), S4 = attribute('aTS', 'vec4');
    const aNrm = attribute('aNrm', 'vec3'), aFace = attribute('aFace', 'float'), aCor = attribute('aCor', 'float');
    const sd = S4.z, pg = positionGeometry;
    const cs = sin(sd.mul(91.0).add(aCor.mul(2.7)).add(sd.mul(13.0))).mul(0.3).add(1.0);
    const sc = A4.w.mul(S4.y);                                           // size × appear (0 = hidden)
    const loc = vec3(pg.xy.mul(cs).mul(vec2(sc, sc.mul(sd.mul(0.5).add(0.7)))), pg.z.mul(sc.mul(0.14)));
    const pw = rotQ(Q4, loc).add(A4.xyz), nw = rotQ(Q4, aNrm);
    const pf = mirror ? mirP(pw) : pw, vYl = varying(pf.y);   // the height over the liquid (local: robust to the host's rig)
    m.positionNode = pf;
    const vN = varying(mirror ? vec3(nw.x, nw.y.negate(), nw.z) : nw), vFace = varying(aFace), vH = varying(S4.x), vG = varying(S4.w), vSd = varying(sd);
    const vLoc = varying(loc.div(max(sc, 1e-4)));
    m.colorNode = Fn(() => {
      const yl = vYl;
      If(mirror ? yl.greaterThan(0.0) : yl.lessThan(0.0), () => { Discard(); });     // the liquid swallows it: cut at the surface
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld));
      const Nf = select(dot(N, V).lessThan(0), N.negate(), N);
      const P = vec3(positionWorld.x, yl, positionWorld.z);
      const Ld = normalize(vec3(P.x, P.y.negate().mul(0.25).sub(0.3), P.z));
      const I = fireLightK();
      const top = smoothstep(0.5, 0.9, vFace), bottom = smoothstep(-0.5, -0.9, vFace);
      const glaze = glazeT(vG), bisc = vec3(0.2, 0.075, 0.035);
      const alb = mix(mix(bisc.mul(0.8), bisc, bottom), glaze, top);
      const diff = alb.mul(vec3(1.0, 0.56, 0.3)).mul(I).mul(max(dot(Nf, Ld), 0).add(max(Nf.y.negate(), 0).mul(0.45)).add(0.22)).mul(1.6).add(alb.mul(vec3(0.03, 0.026, 0.024)));
      const R = reflect(V.negate(), Nf);
      const fr = float(0.04).add(pow(float(1).sub(max(dot(Nf, V), 0)), 5.0).mul(0.96));
      const spec = glossEnv(P, R).mul(fr).mul(top.mul(0.85).add(0.15)).mul(4.0).add(fireSpec(P, R, 30.0).mul(top.mul(2.2).add(0.2))).add(vec3(0.03, 0.032, 0.04).mul(fr).mul(top).mul(smoothstep(0.0, 0.8, R.y)));
      // burning: the edges first, a crackle of the glaze, the biscuit underneath
      const crk = pow(float(1).sub(abs(mx_noise_float(vLoc.mul(7.0).add(vSd.mul(31.0))))), 14.0);
      const T = vH.mul(select(abs(vFace).lessThan(0.5), float(1.45).add(smoothstep(0.6, 1.0, vH).mul(0.35)), mix(float(0.55), crk.mul(1.05), top)));
      return diff.add(spec).add(fireRamp(T)).mul(mirror ? CHROME.mul(U.refl).mul(0.85) : float(1));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(tileGeo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 1;
    world.add(mesh); tileMesh.push(mesh);
  }
  const tiles = [];
  for (let i = 0; i < NT; i++) tiles.push({ mode: 0, wall: 0, s: 0, rest: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), heat: 0, alpha: 0, seed: Math.random(), glaze: Math.floor(Math.random() * 5), scale: 0.1, timer: Math.random() * 2, delay: 0, kick: 1, hvx: 0, bounced: 0, appear: 0, ph: Math.random() * 6.3 });
  // droplets of chrome (the splash's crown)
  const dA = new Float32Array(ND * 4);
  const dropGeo = (() => {
    const src = new THREE.IcosahedronGeometry(1, 2), geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', src.getAttribute('position')); geo.setAttribute('normal', src.getAttribute('normal'));
    const b = new THREE.InstancedBufferAttribute(dA, 4); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aDA', b);
    geo.instanceCount = ND; return geo;
  })();
  const dropMesh = [];
  for (const mirror of [false, true]) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide });
    const D4 = attribute('aDA', 'vec4'), nrm = attribute('normal', 'vec3');
    const pw = D4.xyz.add(positionGeometry.mul(D4.w).mul(vec3(1, 1.25, 1)));
    const pf = mirror ? mirP(pw) : pw, vYl = varying(pf.y);
    m.positionNode = pf;
    const vN = varying(mirror ? vec3(nrm.x, nrm.y.negate(), nrm.z) : nrm);
    m.colorNode = Fn(() => {
      const yl = vYl;
      If(mirror ? yl.greaterThan(0.0) : yl.lessThan(0.0), () => { Discard(); });
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld)), R = reflect(V.negate(), N);
      const P = vec3(positionWorld.x, yl, positionWorld.z);
      const rimD = pow(float(1).sub(abs(dot(N, V))), 3.0);
      return glossEnv(P, R).mul(CHROME).mul(1.6).add(fireSpec(P, R, 6.0).mul(3.0)).add(vec3(0.06, 0.062, 0.075).mul(smoothstep(-0.2, 0.9, R.y))).add(vec3(0.5, 0.25, 0.1).mul(rimD).mul(fireLightK())).add(vec3(1.0, 0.45, 0.15).mul(max(N.y.negate(), 0)).mul(fireLightK()).mul(0.2)).mul(mirror ? CHROME.mul(U.refl).mul(0.85) : float(1));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(dropGeo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 1;
    world.add(mesh); dropMesh.push(mesh);
  }
  const drops = []; for (let i = 0; i < ND; i++) drops.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.01 });
  let dropI = 0;

  // ------------------------------------------------------------------------------------------------ 5d. the far background (T-029)
  // Monoliths of molten chrome 26–46 m away, half sunk in the liquid: dark, they only catch the fire's glow (their faces that look at the
  // ring reflect it) and stand reflected in the liquid. Their group turns very slowly round the room (≤ 1.5°/s).
  const NFAR0 = 8, NCOL = 12, NFAR = NFAR0 + NCOL;   // 5 a wall: 3 near, 2 far
  const farGroup = new THREE.Group(); world.add(farGroup);
  const heroDrop = [], heroHalo = [];
  const farMesh = [];
  {
    const r = rng(123), aF = new Float32Array(NFAR * 4), aG = new Float32Array(NFAR * 4);
    for (let i = 0; i < NFAR; i++) {
      if (i >= NFAR0) {                               // a chrome column / drop rising out of the liquid among the embers
        const k = i - NFAR0; ringPoint((k + 0.25 + 0.5 * r()) / NCOL * PER, 2.5 + 3 * r(), _v);
        aF[i * 4] = _v.x; aF[i * 4 + 1] = _v.z; aF[i * 4 + 2] = 0.22 + 0.1 * r(); aF[i * 4 + 3] = 2 + 1.6 + 0.9 * r();
        aF[i * 4 + 2] = 0;   // T-053 (ARTE r5): the small columns are not drawn (radius 0): the big drop of each wall is the hero
        aG[i * 4] = r(); aG[i * 4 + 1] = (r() - 0.5) * 0.08; aG[i * 4 + 2] = r(); aG[i * 4 + 3] = r();
        continue;
      }
      const a = (i + 0.2 + r() * 0.6) / NFAR0 * Math.PI * 2 + 0.4, rad = 40 + r() * 20;
      aF[i * 4] = Math.cos(a) * rad; aF[i * 4 + 1] = Math.sin(a) * rad; aF[i * 4 + 2] = 2.2 + 1.2 * r(); aF[i * 4 + 3] = 18 + r() * 12;
      aG[i * 4] = r(); aG[i * 4 + 1] = (r() - 0.5) * 0.25; aG[i * 4 + 2] = r(); aG[i * 4 + 3] = r();
      // T-053: ONE big drop per wall (seen at u ≈ 0.7 of it, clear of the text and the button), with air round it; the rest not drawn
      const hw = i >> 1;
      if (i % 2 || hw >= NW) aF[i * 4 + 2] = 0;
      else { ringPoint(cum[hw] + walls[hw].width * 0.7, 0, _v); const dx = _v.x - eye.x, dz = _v.z - eye.z, dl = Math.hypot(dx, dz) || 1; aF[i * 4] = eye.x + dx / dl * rad; aF[i * 4 + 1] = eye.z + dz / dl * rad; heroDrop.push([aF[i * 4], aF[i * 4 + 3] * 0.32, aF[i * 4 + 1]]); }
    }
    const src = new THREE.CylinderGeometry(1, 1, 1, 28, 90, false), geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(src.getIndex()); geo.setAttribute('position', src.getAttribute('position')); geo.setAttribute('normal', src.getAttribute('normal'));
    geo.setAttribute('aF', new THREE.InstancedBufferAttribute(aF, 4)); geo.setAttribute('aG', new THREE.InstancedBufferAttribute(aG, 4));
    geo.instanceCount = NFAR;
    for (const mirror of [false, true]) {
      const m = mirror ? new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide });
      const F4 = attribute('aF', 'vec4'), G4 = attribute('aG', 'vec4'), nrm = attribute('normal', 'vec3'), pg = positionGeometry;
      const yy = pg.y.add(0.5).mul(F4.w).sub(2.0);                       // the base sunk 2 m
      // a MERCURY DROP rising out of the liquid: a meniscus at its foot, a belly, a neck, a small head (one family, near and far)
      const Hv = F4.w.sub(2.0), tt = clamp(yy.div(Hv), 0, 1);
      // in metres: a belly low, a long thin neck, and a ROUND head (a sphere of radius rh on top: no point)
      const sz = F4.z.mul(G4.w.mul(0.3).add(0.85)), rh = sz.mul(0.62), yc = Hv.sub(rh);
      const radAt = (y) => {
        const t = clamp(y.div(Hv), 0, 1), b = t.sub(0.26).div(0.2);
        const body = float(0.2).add(exp(b.mul(b).negate()).mul(0.8)).add(exp(t.div(-0.035)).mul(0.5)).mul(sz)
          .mul(float(1).sub(smoothstep(yc.sub(rh.mul(0.5)), yc.sub(rh.mul(0.05)), y)).mul(0.6).add(0.4)).mul(step(y, yc));
        const hd = y.sub(yc), head = sqrt(max(rh.mul(rh).sub(hd.mul(hd)), 0.0));
        return max(body, head);
      };
      const wob = sin(U.time.mul(0.35).add(G4.x.mul(30.0)).add(tt.mul(5.0))).mul(0.03).add(1);
      const rad = radAt(yy).mul(wob);
      const drdy = radAt(yy.add(0.02)).sub(radAt(yy.sub(0.02))).div(0.04);
      const lean = G4.y.mul(max(yy, 0));
      const p = vec3(pg.x.mul(rad).add(F4.x).add(lean), yy, pg.z.mul(rad).add(F4.y));
      const pf = mirror ? vec3(p.x, p.y.negate(), p.z) : p, vYl = varying(pf.y);
      m.positionNode = pf;
      const ang = atan(pg.z, pg.x), rd = normalize(vec3(pg.x, 0, pg.z).add(vec3(1e-4, 0, 0))), tg = vec3(rd.z.negate(), 0, rd.x);
      const nl = normalize(rd.sub(vec3(0, clamp(drdy, -3, 3), 0)).add(tg.mul(sin(ang.mul(11.0).add(yy.div(Hv).mul(9.0)).add(G4.x.mul(20.0))).mul(smoothstep(0.35, 0.7, tt)).mul(0.22))));   // a twisted neck: the fire in spiral streaks
      const vN = varying(mirror ? vec3(nl.x, nl.y.negate(), nl.z) : nl);
      m.colorNode = Fn(() => {
        const yl = vYl;
        If(mirror ? yl.greaterThan(0.0) : yl.lessThan(0.0), () => { Discard(); });
        const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld)), R = reflect(V.negate(), N);
        const P = vec3(positionWorld.x, abs(yl), positionWorld.z);
        const fireOnly = envFire(P, vec3(R.x, abs(R.y), R.z), false).mul(select(R.y.greaterThan(0), float(1), float(0.7)));
        const rim = pow(float(1).sub(abs(dot(N, V))), 4.0);
        // the faces that look at the room catch the fire's light (strongest low down); the silhouette is rim-lit in fire
        const Lf = normalize(vec3(P.x.negate(), 0.12, P.z.negate()));
        const lit = vec3(1.0, 0.36, 0.1).mul(fireLightK()).mul(pow(max(dot(N, Lf), 0), 1.5)).mul(exp(P.y.div(-10.0))).mul(0.05).mul(smoothstep(15.0, 40.0, length(P.xz)));
        void lit;
        const c = fireOnly.mul(CHROME).mul(24.0).add(fireSpec(P, R, 40.0).mul(1.6))   // T-053 (ARTE r5): the reflection ×2 (they read as matte bottles).add(vec3(0.0015, 0.0014, 0.0016)).add(vec3(0.012, 0.013, 0.018).mul(smoothstep(0.3, 1.0, R.y)))
          .add(vec3(0.1, 0.14, 0.26).mul(pow(rim, 1.5)).mul(0.5)).add(vec3(0.35, 0.46, 0.69).mul(0.09).mul(exp(abs(R.y).mul(-10.0))))   // a cold silver horizon across the mirror
          .add(skyEnv(R).mul(select(R.y.greaterThan(0), float(1.6), float(0))))
          .add(vec3(0.35, 0.45, 0.69).mul(pow(rim, 0.75)).mul(0.35));   // T-053: the recipe's cool rim (#9FB4D8) on the silhouette
        const vis = float(1).sub(U.wait).mul(smoothstep(0.2, 0.8, U.arrive)).mul(float(1).sub(smoothstep(0.2, 0.7, U.leave)));
        return c.mul(vis).mul(mirror ? CHROME.mul(U.refl).mul(0.45) : float(1));
      })();
      m.fog = false;
      const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 0;
      farGroup.add(mesh); farMesh.push(mesh);
    }
    if (room.makeHalo && room.placeHalo) for (const hp of heroDrop) {   // T-053: the soft halo behind each hero drop (ember, ≤ 0.2)
      const h = room.makeHalo({ color: [1, 0.5, 0.22], radius: 11, intensity: 0 }); farGroup.add(h.mesh);
      room.placeHalo(h, new THREE.Vector3(hp[0], hp[1], hp[2]), 6); heroHalo.push(h);
    }
  }


  // ------------------------------------------------------------------------------------------------ 5e. low haze over the liquid (T-029)
  // 320 wide, flat, soft sprites 9–45 m out, 0.2–2.6 m over the liquid, drifting slowly round; lit red by the fire (stronger near the
  // ring, fading with distance). Additive and faint: the guide band stays readable.
  const NHZ = 110;
  const hazeMesh = (() => {
    const r = rng(211), aH = new Float32Array(NHZ * 4), aQ = new Float32Array(NHZ * 4);
    for (let i = 0; i < NHZ; i++) {
      aH[i * 4] = r() * Math.PI * 2; aH[i * 4 + 1] = 9 + 36 * r() * r(); aH[i * 4 + 2] = 0.2 + 16.0 * r() * r();   // up to ~7 m: the upper half of the walls has a warm breath aH[i * 4 + 3] = r();
      aQ[i * 4] = 6 + 10 * r(); aQ[i * 4 + 1] = 2 + 4 * r(); aQ[i * 4 + 2] = (r() - 0.5) * 0.02; aQ[i * 4 + 3] = r();
    }
    const g = quadGeo(NHZ, { aH, aQ });
    const m = additive();
    const H4 = attribute('aH', 'vec4'), Q4 = attribute('aQ', 'vec4'), t = U.time;
    const a = H4.x.add(t.mul(Q4.z)), rad = H4.y;
    const p = vec3(cos(a).mul(rad), H4.z.add(sin(t.mul(0.07).add(H4.w.mul(20.0))).mul(0.25)), sin(a).mul(rad));
    const k = exp(rad.sub(10.0).div(-14.0)).mul(exp(H4.z.div(-9.0)));
    const A = k.mul(fireLightK()).mul(float(1).sub(U.wait)).mul(smoothstep(0.1, 0.7, U.arrive)).mul(float(1).sub(smoothstep(0.2, 0.8, U.leave))).mul(U.haze)
      .mul(sin(t.mul(0.05).add(Q4.w.mul(30.0))).mul(0.35).add(0.65));
    m.vertexNode = select(A.greaterThan(0.002), billboard(p, Q4.x, Q4.y), HIDE);
    const vA = varying(A), q = uv().sub(0.5);
    m.colorNode = vec3(1.0, 0.3, 0.08).mul(vA).mul(0.03).mul(exp(q.x.mul(q.x).mul(-9.0).add(q.y.mul(q.y).mul(-12.0))));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5;
    world.add(mesh);
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
    world.add(mesh);
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

  // ------------------------------------------------------------------------------------------------ 5f. the hand fires (VFX 25-11, Brasa a)
  // MAXF hearths, each NPF analytic flame sprites (vertex stage, no state): fA = (x, y, z, strength), fB = (height, width, age, ember),
  // fC = (the wall's right x, z, 0, 0). Flame = white-gold at the root → orange → red tongues; ember = a low red bed with a few licks.
  const MAXF = 16, NPF = 640;
  const fA = Array.from({ length: MAXF }, () => new THREE.Vector4(0, -50, 0, 0)), fB = Array.from({ length: MAXF }, () => new THREE.Vector4(1.2, 0.5, 0, 0)), fC = Array.from({ length: MAXF }, () => new THREE.Vector4(1, 0, 0, 0));
  const uFA = uniformArray(fA, 'vec4'), uFB = uniformArray(fB, 'vec4'), uFC = uniformArray(fC, 'vec4');
  const handFireMesh = (() => {
    const r = rng(977), aR = new Float32Array(MAXF * NPF * 4), aI = new Float32Array(MAXF * NPF * 4);
    for (let i = 0; i < MAXF * NPF; i++) { aR[i * 4] = r(); aR[i * 4 + 1] = r(); aR[i * 4 + 2] = r(); aR[i * 4 + 3] = r(); aI[i * 4] = Math.floor(i / NPF); }
    const g = quadGeo(MAXF * NPF, { aR, aI });
    const m = additive();
    const R4 = attribute('aR', 'vec4'), I4 = attribute('aI', 'vec4'), t = U.time;
    const fi = I4.x.toInt(), A = uFA.element(fi), B = uFB.element(fi), C = uFC.element(fi);
    const r1 = R4.x, r2 = R4.y, r3 = R4.z, r4 = R4.w;
    const grow = smoothstep(0.0, 0.5, B.z);                                   // 0 → 1 in 0.3–0.6 s: the flame rises (the sound is instant)
    const str = A.w, emb = B.w;
    const age = fract(t.mul(r1.mul(0.8).add(0.75)).add(r2.mul(17.0)));
    const tongue = mx_noise_float(vec3(A.x.mul(0.7).add(r3.mul(3.0)), t.mul(1.6), A.z.mul(0.7))).mul(0.35).add(0.75);
    const hgt = B.x.mul(grow).mul(tongue).mul(mix(float(1), float(0.22), emb)).mul(min(str.mul(1.6), 1.0));
    const lat = r3.sub(0.5).mul(B.y).mul(float(1).sub(age.mul(0.75)));          // wide at the root, a tongue at the top
    const dep = r4.sub(0.5).mul(0.35).mul(float(1).sub(age.mul(0.6)));
    const sway = age.mul(age).mul(0.2);
    const right = vec3(C.x, 0, C.y), back = vec3(C.y, 0, C.x.negate());
    const p = A.xyz.add(right.mul(lat.add(sin(t.mul(2.7).add(r2.mul(40.0)).add(age.mul(4.0))).mul(sway)))).add(back.mul(dep)).add(vec3(0, age.mul(hgt), 0));
    const size = float(0.07).add(r4.mul(0.09)).mul(float(1).sub(age.mul(0.45))).mul(grow.mul(0.6).add(0.4)).mul(mix(float(1), float(0.6), emb));
    const T = pow(float(1).sub(age), 1.2).mul(1.45).mul(min(str, 1.2)).mul(mix(float(1), float(0.55), emb));
    const E = smoothstep(0.0, 0.07, age).mul(pow(float(1).sub(age), 1.6)).mul(0.11).mul(str);
    m.vertexNode = select(str.greaterThan(0.01), billboard(p, size, size.mul(2.6)), HIDE);
    const vC = varying(fireRamp(T).mul(E));
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-18).add(q.y.mul(q.y).mul(-9))));
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'brasa:handFires';
    world.add(mesh); return mesh;
  })();
  // CPU side of the hand fires
  const fires = Array.from({ length: MAXF }, (_, i) => ({ i, on: false, stroke: null, born: 0, last: 0, str: 0, emb: 0, pos: new THREE.Vector3(), wall: 0 }));
  const fireOut = [];   // for the square: [{ pos, k }]
  function lightFire(h, time) {
    const W = walls[h.wall];
    _v2.copy(h.pos).addScaledVector(W.normal, -0.6); _v2.y = Math.max(0.15, h.pos.y - 0.55);   // the root ~0.55 m under the hand, 0.6 m behind the wall
    let best = null;
    for (const F of fires) if (F.on && F.pos.distanceTo(_v2) < 0.8) { best = F; break; }      // feed a fire already there
    if (!best) { best = fires.find((F) => !F.on) || fires.reduce((a, b) => (a.str + (a.emb ? 0 : 1) < b.str + (b.emb ? 0 : 1) ? a : b)); best.born = time; best.str = Math.max(best.on ? best.str : 0, 0.05); best.pos.copy(_v2); }
    best.on = true; best.stroke = h.stroke; best.last = time; best.wall = h.wall;
    fC[best.i].set(W.right.x, W.right.z, 0, 0);
  }
  function stepFires(dt, time, hs) {
    for (const F of fires) {
      if (!F.on) continue;
      let held = false;
      for (const h of hs) if (h.stroke === F.stroke) { held = true; F.last = time; _v2.copy(h.pos).addScaledVector(walls[h.wall].normal, -0.6); _v2.y = Math.max(0.15, h.pos.y - 0.55); F.pos.lerp(_v2, 1 - Math.exp(-dt / 0.8)); break; }
      const since = time - F.last;                                   // 0 while held; the flame sinks to an ember in ~5 s, the ember lives ~60 s
      const tgt = held ? 1 : since < 5 ? 1 - 0.75 * smoother(since / 5) : 0.25 * (1 - smoother((since - 5) / 55));
      F.str += (tgt - F.str) * (1 - Math.exp(-dt / (held ? 0.25 : 0.6)));
      F.emb += ((held ? 0 : smoother((since - 1) / 5)) - F.emb) * (1 - Math.exp(-dt / 0.8));
      if (!held && since > 60 && F.str < 0.01) { F.on = false; F.str = 0; F.stroke = null; }
      const k = F.str * (1 - U.leave.value) * crowdK;
      fA[F.i].set(F.pos.x, F.pos.y - lift, F.pos.z, k); fB[F.i].set(1.25, 0.55, time - F.born, F.emb);
    }
    for (const F of fires) if (!F.on) fA[F.i].w = 0;
    // the square's fire light: the strongest few
    fireOut.length = 0;
    for (const F of fires) if (F.on && F.str > 0.02) fireOut.push(F);
    fireOut.sort((a, b) => b.str - a.str);
    const plaza = parts?.plaza;
    if (plaza?.setFires) plaza.setFires(fireOut, (F) => F.pos, (F) => F.str * (0.35 + 0.65 * (1 - F.emb)) * (1 - U.leave.value));
  }
  // (b/c) in the square: the liquid world's floor, reflections, monoliths and haze go
  const liquidOnly = [];
  let inPlazaK = -1;
  function setInPlaza(on) {
    if (on === inPlazaK) return; inPlazaK = on;
    if (!liquidOnly.length) { world.traverse((o) => { if (o.isMesh && o.renderOrder === -1) liquidOnly.push(o); }); liquidOnly.push(floorMesh, farGroup); if (typeof hazeMesh !== 'undefined' && hazeMesh) liquidOnly.push(...[].concat(hazeMesh)); }
    for (const o of liquidOnly) if (o) o.visible = !on;
    for (const mm of tileMesh) if (mm) mm.visible = !on;   // the burning trencadís read as confetti on the paving: the joints glow instead (plaza)
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
      const yR = eyeU.y.sub(eyeU.y.sub(U.lift).mul(tw).div(tw.add(mix(float(6.0), float((WAIT0 + WAIT1) / 2), U.wait))));             // where the middle of the bed is seen on this wall
      const hs = heatSample(s, false);
      const H = bedHeat(s, smoothstep(0.0, 0.7, U.level).mul(0.7).add(0.15), hs).mul(float(1).sub(smoothstep(0.3, 0.9, U.leave)));
      const dy = y.sub(yR);
      const g1 = exp(dy.mul(dy).div(-2 * 0.05 * 0.05)).mul(0.035), g2 = exp(max(dy, 0).div(-0.55)).mul(smoothstep(-0.08, 0.02, dy)).mul(0.03);
      const c = vec3(1.0, 0.36, 0.1).mul(H.mul(g1.add(g2))).mul(U.haze).toVar();
      // T-043 THE CALL (tok… tok… TOK): on every calling wall a ring of fire light (a wide ellipse) contracts onto the ember line and
      // ARRIVES on the TOK; the two toks before it pulse it. The answering wall (call 2) shows only the last beat. callW per wall:
      // 1 = calls (the whole countdown), 0.5 = answers, 0 = silent.
      If(U.callOn.greaterThan(0.001), () => {
        let wsel = float(U.callW.x), wc = float(cum[0] + walls[0].width / 2);
        const comps = ['x', 'y', 'z', 'w'];
        for (let i = 1; i < NW && i < 4; i++) { const inW = s.greaterThanEqual(cum[i]); wsel = select(inW, U.callW[comps[i]], wsel); wc = select(inW, float(cum[i] + walls[i].width / 2), wc); }
        const ct = U.callT, gp = U.callGap, dxw = s.sub(wc);
        const full = step(0.75, wsel);
        const span = mix(gp, gp.mul(2), full);                                  // the answering wall: only the last gap
        const k = clamp(ct.negate().div(span), 0, 1), live = step(span.negate(), ct).mul(step(ct, 0.0)).mul(step(0.25, wsel));
        const rx = k.mul(2.6).add(0.12), ry = k.mul(0.75).add(0.03);
        const ex_ = dxw.div(rx), ey_ = dy.div(ry), e = sqrt(ex_.mul(ex_).add(ey_.mul(ey_)));
        const rd = e.sub(1).mul(rx).div(0.07), ring = exp(rd.mul(rd).negate());
        const p1 = ct.add(gp.mul(2)).div(0.09), p2 = ct.add(gp).div(0.09);
        const tok = exp(p1.mul(p1).negate()).mul(full).add(exp(p2.mul(p2).negate()).mul(mix(float(0.6), float(1), full)));   // tok, tok
        c.addAssign(vec3(1.0, 0.38, 0.1).mul(ring).mul(float(0.3).add(float(1).sub(k).mul(0.3)).add(tok.mul(0.55))).mul(live).mul(U.callOn));
        // the TOK: the ring lands on the line and runs along it both ways, hot
        const tk = max(ct, 0.0), land = exp(tk.mul(-3.5)).mul(step(0.0, ct)).mul(step(ct, 0.9)).mul(step(0.25, wsel));
        const spread = tk.mul(4.0).add(0.15), xs = dxw.div(spread), ys = dy.div(0.045);
        c.addAssign(vec3(1.0, 0.62, 0.25).mul(exp(xs.mul(xs).negate()).mul(exp(ys.mul(ys).negate()))).mul(land).mul(0.9).mul(U.callOn));
      });
      Loop(U.nH, ({ i }) => {                                             // a hand: a warm glow at once, a flash when it lands
        const hp = uHP.element(i), d = Pw.sub(hp.xyz), r2 = dot(d, d);
        c.addAssign(vec3(1.0, 0.45, 0.15).mul(exp(r2.div(-2 * 0.13 * 0.13)).mul(hp.w.mul(0.16).add(0.04))).add(vec3(1.0, 0.55, 0.2).mul(exp(r2.div(-2 * 0.06 * 0.06)).mul(hp.w.mul(0.4)))));   // orange, never a white ball
      });
      return vec4(c.mul(float(1).sub(U.leave)), 1.0);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6;
    object.add(mesh);   // (the air stays on the wall planes: not lifted)
    return mesh;
  })();


  // ------------------------------------------------------------------ the guide's quiet zones (director's rule, 24-11)
  // At each wall's centre, text ±1.6 m × 1.75–2.2 m and button ±0.9 m × 0.9–1.6 m: whatever the world shows behind them is veiled
  // (a black layer on the wall plane, soft edges 0.2 m) by U.quiet (0..1), so nothing there reads above ~35 % luminance.
  const _vq = new THREE.Vector3();
  const quietMesh = (() => {
    const pos = [], at = [], idx = [];
    walls.forEach((w, i) => {
      const o = pos.length / 3;
      for (const [uu, vv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        room.wallPoint(i, uu, vv, _vq).addScaledVector(w.normal, -0.003);
        pos.push(_vq.x, _vq.y, _vq.z); at.push((uu - 0.5) * w.width, vv * w.height);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aQ', new THREE.Float32BufferAttribute(at, 2)); g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide });
    const q = varying(attribute('aQ', 'vec2'));
    const box = (hw, y0, y1) => smoothstep(hw + 0.5, hw - 0.1, abs(q.x)).mul(smoothstep(y0 - 0.4, y0 + 0.05, q.y)).mul(smoothstep(y1 + 0.4, y1 - 0.05, q.y));   // soft: a dimming, never a box
    m.colorNode = vec3(0, 0, 0);
    m.opacityNode = max(box(1.6, 1.75, 2.2), box(0.9, 0.9, 1.6)).mul(U.quiet);
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5.9;
    return mesh;
  })();
  object.add(quietMesh);

  // ------------------------------------------------------------------------------------------------ 7. lights for the other parts
  const lights = walls.map((w, i) => {
    const l = new THREE.PointLight(0xff7a30, 0, 0, 2); l.layers.set(31);
    ringPoint(hearthS[i], 6, l.position); l.position.y = 0.6;
    world.add(l); return l;
  });

  // ------------------------------------------------------------------------------------------------ CPU state
  const hands = []; for (let i = 0; i < 32; i++) hands.push({ stroke: null, seen: false, acc: 0, rib: 0, jet: 0, jetAcc: 0, flash: 0, s: 0, y: 1.2 });
  const recent = []; for (let i = 0; i < 16; i++) recent.push({ s: 0, t: -1e9 });
  let recentI = 0;
  const waves = []; for (let i = 0; i < 4; i++) waves.push({ on: false, s0: 0, t0: 0, last: [0, 0], lastR: [-1e9, -1e9], met: false });
  let level = 0.1, awakeEnv = 0, awakeT = -1e9, contract = 0, cool = 0, prevArrive = -1, lastWave = -1e9, prevWaveP = false, prevAwakeP = false, nextAutoWave = 0;
  const recentUps = []; for (let i = 0; i < 8; i++) recentUps.push({ s: 0, y: 0, t: -1e9 });
  let upI = 0, served = 'brasa', servedPhase = 'play', crowdN = 0, crowdK = 1, waitK = 0, breathPh = 0, trailI = 0, puffCount = 0, ambAcc = 0, columnAcc = 0, leaveAcc = 0, frame = 0, rewardT = 0;
  // ---- T-056: the relay (score state `relay` {s, lap, holderWall}, events 'relay:jump' {from, to} and 'corner'; study: params.relay)
  const lapCells = new Float32Array(NC);           // 1 where the fire has passed on this lap (the trail of embers in the bed)
  const RL = { on: false, s: 0, prevS: 0, vel: 0, hopK: 1, hopFrom: 0, hopDur: 0.5, k: 0, assist: false, assistT: 0, trailK: 0, emberAcc: 0, full: false, cornerAt: [], st: { s: 0, lap: 0, run: 0, travelled: 0, lastHand: null }, jumps: 0, corners: 0 };
  for (let i = 0; i < NW; i++) RL.cornerAt.push(-1e9);
  const evName = (e) => (typeof e === 'string' ? e : e && typeof e === 'object' ? String(e.type ?? e.name ?? e.e ?? e.event ?? '') : '');
  function markLap(a, b) {                         // cells between perimeter a and b (the short way round)
    const d = wrapC(b - a), n = Math.min(NC, Math.ceil(Math.abs(d) / CELL) + 1);
    for (let k = 0; k <= n; k++) { const j = Math.round(wrapP(a + (d * k) / Math.max(1, n)) / CELL) % NC; lapCells[j] = 1; }
  }
  function cornerFlare(i, time) {
    if (time - RL.cornerAt[i] < 2.5) return; RL.cornerAt[i] = time; RL.corners++;
    const cs = cum[i], dR = Number(P.relayD ?? 2.6);
    maxHeat(flare, cs, 3.0, 1.0); addHeat(dyn, cs, 1.6, 1.0);
    ringPoint(cs, dR, _v); emit(Math.max(260, 600 * crowdK), _v.x, 0.15, _v.z, 0.5, 0, 1, 0, 0.3, 3.5, 8.5, 1.0, 2.2, 2.3, 0.9, 0.35);   // a flare at the corner
    ringPoint(cs, RING0 + 1.5, _v); emit(220, _v.x, 0.1, _v.z, 0.9, 0, 1, 0, 0.45, 2, 6, 0.8, 1.6, 2.0, 0.9, 0.4);
  }
  const addHeat = (arr, s, amt, sigma) => {
    const n = Math.ceil((sigma * 3) / CELL), c = Math.round(wrapP(s) / CELL);
    for (let k = -n; k <= n; k++) { const j = ((c + k) % NC + NC) % NC, x = (k * CELL) / sigma; arr[j] += amt * Math.exp(-0.5 * x * x); }
  };
  const maxHeat = (arr, s, amt, sigma) => {
    const n = Math.ceil((sigma * 3) / CELL), c = Math.round(wrapP(s) / CELL);
    for (let k = -n; k <= n; k++) { const j = ((c + k) % NC + NC) % NC, x = (k * CELL) / sigma; arr[j] = Math.max(arr[j], amt * Math.exp(-0.5 * x * x)); }
  };
  function startWave(s0, time, big = true) {
    const w = waves.find((x) => !x.on) || waves[0];
    w.on = true; w.s0 = s0; w.t0 = time; w.met = false; w.lastR = [-1e9, -1e9]; w.big = big;   // a missed call: a small wave (an eighth of the way, dimmer, no devils)
    w.last[0] = w.last[1] = 0;
    if (big) { spawnDevil(s0, 1, 3.0, 2.8, w, time); spawnDevil(s0, -1, 3.0, 2.8, w, time); }
    lastWave = time;
  }
  function waveOrigin(time) {                       // circular mean of the hands landed in the last 1.2 s
    let cx = 0, cz = 0, n = 0;
    for (const r of recent) if (time - r.t <= 1.2) { const a = (r.s / PER) * Math.PI * 2; cx += Math.cos(a); cz += Math.sin(a); n++; }
    if (!n) return wrapP(hearthS[0]);
    return wrapP((Math.atan2(cz, cx) / (Math.PI * 2)) * PER);
  }

  // ---- T-029: the liquid, the tiles, the drops (CPU)
  const HANG = 0, _cw = [0, 0, 0, 0]; let callOnK = 0, nHang = 0, farAcc = 0, lift = 0, liftV = 0, splashN = 0, trailT = 0, impacts = 0;
  const fx = []; for (let i = 0; i < 16; i++) fx.push({ t: -1, wall: 0, u: 0, force: 0 });   // 'fx:impact' for the sound (wave 2)
  let fxI = 0;
  const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _t = new THREE.Vector3(), _img = new THREE.Vector3();
  function addRipple(x, z, amp, time) { RS[ripI].set(x, z, time % 3000, amp); ripI = (ripI + 1) % RIP_N; }
  function spinStep(t, dt) {
    const wl = t.w.length(); if (wl < 1e-5) return;
    _ax.copy(t.w).multiplyScalar(1 / wl); _q.setFromAxisAngle(_ax, wl * dt); t.q.premultiply(_q);
  }
  function placeTile(t, time) {                    // a new resting place beyond a wall, at hand height, away from the guide's button
    for (let k = 0; k < 8; k++) {
      let x = Math.random() * PER, w = NW - 1; for (let i = 0; i < NW; i++) if (x < cum[i] + walls[i].width) { w = i; break; }
      const W = walls[w], u = (x - cum[w]) / W.width;
      if (u < 0.03 || u > 0.97) continue;
      const y = 0.62 + 1.55 * (Math.random() + Math.random()) / 2, du = (u - 0.5) * W.width;
      if (k < 7 && Math.hypot(du, y - 1.25) < 0.42) continue;
      const depth = 0.15 + 0.95 * Math.random() * Math.random();
      t.wall = w; t.s = x;
      t.rest.copy(W.pa).addScaledVector(W.right, u * W.width).addScaledVector(W.normal, -depth); t.rest.y = y;
      break;
    }
    t.pos.copy(t.rest); t.pos.y -= lift; t.vel.set(0, 0, 0);
    t.q.setFromAxisAngle(_ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * 6.3);
    t.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.12 + 0.4 * Math.random());
    { const z = Math.random(); t.scale = z < 0.15 ? 0.26 + 0.1 * Math.random() : z < 0.5 ? 0.13 + 0.07 * Math.random() : 0.06 + 0.04 * Math.random(); }   // 1 : 3 : 9
    t.mode = 1; t.heat = 0.15; t.delay = 0; t.bounced = 0; t.seed = Math.random(); t.glaze = Math.floor(Math.random() * 5);
    t.appear = 0.15 + 0.8 * Math.random(); t.born = time;
  }
  function knock(t, kick, hvx) {
    const W = walls[t.wall], r = Math.random;
    t.mode = 2; t.bounced = 0; t.heat = 0.95; t.delay = 0;
    fxAt(t.pos, 0.6, 'fire', 'ignite');
    t.vel.copy(W.normal).multiplyScalar(-(0.6 + 0.9 * r()) * kick).addScaledVector(W.right, (r() - 0.5) * 0.9 + hvx * 0.5);
    t.vel.y = (0.5 + 1.3 * r()) * kick;
    t.w.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(4 + 7 * r());
    if (nE < MAXE - 10) emit(16, t.pos.x, t.pos.y, t.pos.z, 0.04, -W.normal.x, 0.6, -W.normal.z, 0.9, 0.6, 2.4, 0.3, 0.8, 1.75, 1, 0.8);   // it catches
  }
  // a hand on wall i at world position hp: knock the tiles whose image on the wall is under it (a landing: a cascade round it)
  function touchTiles(h, down, hy) {
    const W = walls[h.wall], n = W.normal, R0 = down ? 0.55 : 0.2;
    const dWall = -_t.subVectors(W.pa, eye).dot(n);
    let found = 0;
    for (const t of tiles) {
      if (t.mode !== 1 || t.wall !== h.wall || t.alpha < 0.5 || t.delay > 0) continue;
      _t.copy(t.pos); _t.y += lift; _t.sub(eye);
      const k = dWall / Math.max(1e-3, -_t.dot(n));
      _img.copy(eye).addScaledVector(_t, k);
      const dist = _img.distanceTo(h.pos);
      if (dist >= R0) continue;
      found++;
      t.kick = 1; t.hvx = h.vx || 0;
      if (!down || dist < 0.12) knock(t, 1, t.hvx); else t.delay = 0.01 + (dist / R0) * 0.24;
    }
    if (down) {                                   // and a tile breaks off right under the hand, at once
      let t = tiles.find((x) => x.mode === 0) || tiles.find((x) => x.mode === 3) || tiles[0];
      placeTile(t, 0); t.wall = h.wall; t.s = cum[h.wall] + h.u * W.width;
      t.rest.copy(h.pos).addScaledVector(n, -0.22); t.pos.copy(t.rest); t.pos.y = hy; t.alpha = 1;
      knock(t, 1, h.vx || 0);
    }
  }
  function splash(t, time) {
    const sp = -t.vel.y, W = walls[t.wall];
    fxAt(t.pos, Math.min(1, Math.abs(t.vel.y) / 6), 'fire', 'splash');
    addRipple(t.pos.x, t.pos.z, Math.min(0.024, 0.005 * sp), time);
    if (splashN < 6) { splashN++; emit((26 + 16 * sp) * (0.3 + 0.7 * crowdK) * (time - awakeT < 4 ? 0.4 : 1), t.pos.x, 0.02, t.pos.z, 0.05, 0, 1, 0, 0.5, 1.2, 2.6 + sp * 0.5, 0.35, 1.0, 1.8, 1, 0.9); }
    const nd = Math.min(12, Math.round(4 + sp * 2));
    for (let k = 0; k < nd; k++) {
      const d = drops[dropI]; dropI = (dropI + 1) % ND;
      const a = Math.random() * Math.PI * 2, v = (0.4 + 0.9 * Math.random()) * (0.5 + sp * 0.18);
      d.on = true; d.pos.set(t.pos.x, 0.01, t.pos.z); d.vel.set(Math.cos(a) * v, (1.1 + 1.6 * Math.random()) * (0.45 + sp * 0.16), Math.sin(a) * v);
      d.r = 0.012 + 0.024 * Math.random() * Math.random();
    }
    impacts++;
    const u = ((t.s - cum[t.wall]) / W.width);
    const f = fx[fxI]; f.t = time; f.wall = t.wall; f.u = Math.min(1, Math.max(0, u)); f.force = Math.min(1, sp / 5); fxI = (fxI + 1) % fx.length;
  }
  function stepTiles(dt, time, arrive, leave) {
    splashN = 0; let trails = 0; nHang = 0; for (const t of tiles) if (t.mode === 1) nHang++;
    for (let i = 0; i < NT; i++) {
      const t = tiles[i];
      if (leave > 0.02 && (t.mode === 1 || t.mode === 2)) { t.mode = 4; t.vel.set((Math.random() - 0.5) * 0.4, 0.2 + 0.6 * Math.random(), (Math.random() - 0.5) * 0.4); t.w.multiplyScalar(2.5).addScalar(0.5); }
      if (t.mode === 1) {
        if (t.delay > 0) { t.delay -= dt; if (t.delay <= 0) { knock(t, t.kick, t.hvx); continue; } }
        t.pos.copy(t.rest); t.pos.y += -lift + 0.025 * Math.sin(time * 0.6 + t.ph * 5); t.pos.x += 0.012 * Math.sin(time * 0.43 + t.ph * 3);
        spinStep(t, dt);
        t.heat += (0.3 + 0.15 * level - t.heat) * (1 - Math.exp(-dt / 0.8));
        const gate = clamp01((arrive - t.appear) / 0.12) * (1 - waitK);
        t.alpha = Math.min(gate, t.alpha + dt / 0.7);
      } else if (t.mode === 2) {
        t.vel.y -= 9.8 * dt; t.vel.multiplyScalar(Math.exp(-0.06 * dt)); t.pos.addScaledVector(t.vel, dt); spinStep(t, dt);
        t.heat += (0.9 - t.heat) * (1 - Math.exp(-dt / 1.5));
        if (trails < 6 && ((i + frame) & 1) === 0 && nE < MAXE - 8) { trails++; emit(3, t.pos.x, t.pos.y, t.pos.z, 0.03, 0, 1, 0, 1.0, 0.05, 0.5, 0.35, 0.8, 1.5, 0.2, 2.0); }
        if (t.pos.y - 0.01 <= 0 && t.vel.y < 0) {
          if (!t.bounced) {
            splash(t, time);
            t.bounced = 1; t.pos.y = 0.012; t.vel.y = -t.vel.y * 0.3; t.vel.x *= 0.55; t.vel.z *= 0.55;
            t.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + 5 * Math.random());
          } else {
            addRipple(t.pos.x, t.pos.z, 0.006, time);
            t.mode = 3; t.timer = 0; t.pos.y = 0.004; t.vel.set(t.vel.x * 0.3, 0, t.vel.z * 0.3);
            t.w.multiplyScalar(0.15);
          }
        }
      } else if (t.mode === 3) {                   // afloat: it slows, tilts one edge down and sinks as it goes out
        t.timer += dt; t.vel.multiplyScalar(Math.exp(-dt * 1.5)); t.pos.addScaledVector(t.vel, dt);
        if (t.timer > 0.7 && t.timer - dt <= 0.7 && nE < MAXE - 6) { emit(16, t.pos.x, 0.03, t.pos.z, 0.06, 0, 1, 0, 0.7, 0.25, 0.8, 1.2, 2.4, 0.32, -0.12, 1.4); fxAt(t.pos, 0.5, 'fire', 'sink'); }   // a hiss of steam and ash as it goes under
        if (t.timer > 0.7) { t.pos.y -= dt * (0.015 + 0.05 * (t.timer - 0.7)); if (t.w.lengthSq() < 0.5) t.w.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.9); }
        else t.pos.y = 0.004 + 0.003 * Math.sin(t.timer * 9);
        spinStep(t, dt);
        t.heat *= Math.exp(-dt / 0.9);
        if (t.pos.y < -0.12 || t.timer > 6) { t.mode = 0; t.alpha = 0; t.timer = 3 + 3 * Math.random(); }
      } else if (t.mode === 4) {                   // leaving: lift, turn, drift apart, thin out
        t.vel.y += dt * 0.5; t.pos.addScaledVector(t.vel, dt); spinStep(t, dt);
        t.heat += (0.55 - t.heat) * (1 - Math.exp(-dt / 0.6));
        t.alpha = Math.min(t.alpha, 1 - smoother((leave - 0.35) / 0.5));
        if (leave < 0.01) { t.mode = 0; t.timer = Math.random(); }
      } else {
        t.alpha = 0;
        t.timer -= dt;
        if (t.timer <= 0 && leave < 0.01 && waitK < 0.5) { if (nHang < HANG) { placeTile(t, time); t.alpha = 0; nHang++; } else t.timer = 0.5 + Math.random(); }
      }
      const j = i * 4;
      tA[j] = t.pos.x; tA[j + 1] = t.pos.y; tA[j + 2] = t.pos.z; tA[j + 3] = t.scale;
      tQ[j] = t.q.x; tQ[j + 1] = t.q.y; tQ[j + 2] = t.q.z; tQ[j + 3] = t.q.w;
      tS[j] = t.heat; tS[j + 1] = Math.max(0, t.alpha); tS[j + 2] = t.seed; tS[j + 3] = t.glaze;
    }
    for (const k of ['aTA', 'aTQ', 'aTS']) tileGeo.getAttribute(k).needsUpdate = true;
    for (let i = 0; i < ND; i++) {
      const d = drops[i], j = i * 4;
      if (d.on) {
        d.vel.y -= 9.8 * dt; d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y < 0 && d.vel.y < 0) { d.on = false; if ((i % 3) === 0) addRipple(d.pos.x, d.pos.z, 0.003, time); }
      }
      dA[j] = d.pos.x; dA[j + 1] = d.pos.y; dA[j + 2] = d.pos.z; dA[j + 3] = d.on ? d.r : 0;
    }
    dropGeo.getAttribute('aDA').needsUpdate = true;
  }
  for (const t of tiles) placeTile(t, 0);
  for (let i = HANG; i < NT; i++) { tiles[i].mode = 0; tiles[i].timer = 1e9; }   // the rest: a pool for the tiles a hand breaks off
  // T-053 (ARTE r5): HANG 0 (was 64) — no red tiles floating at hand height (read as confetti); a landing hand still breaks one off under it

  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {                // wall: room.walls index · u: 0..1 along it · strength: 0..1
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }
  function fxAt(p, strength, mat, kind) {                         // the same from a world point (the wall it is seen through from the eye)
    const W = room.walls, e = room.eye, dx = p.x - e.x, dz = p.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
  }

  function relayStandIn(dt, time, hs, events) {   // the study: the fire runs at 1.3 m/s; a hand ahead within 2.5 m takes it (a jump)
    const st = RL.st;
    if (!P.relay) { st.run = 0; return null; }
    if (!st.run) { st.run = 1; st.s = hs.length ? s0h(hs[0]) : hearthS[0] - 1.5; st.travelled = 0; st.lastHand = hs.length ? hs[0].stroke : null; }
    let ahead = null, best = 2.5;
    for (const h of hs) { const d = wrapC(s0h(h) - st.s); if (h.stroke !== st.lastHand && d > 0.4 && d < best) { best = d; ahead = h; } }
    const s1 = st.s;
    if (ahead) { st.s = st.s + best; st.lastHand = ahead.stroke; events.push({ type: 'relay:jump', from: s1, to: st.s }); }
    else {
      const holder = hs.find((h) => h.stroke === st.lastHand);
      const v = holder ? 0 : hs.length ? 0.15 : 1.3;                  // held: it waits on the hand; nobody ahead: it almost stops
      if (holder) st.s += wrapC(s0h(holder) - st.s) * Math.min(1, dt * 6); else st.s += v * dt;
    }
    for (let i = 0; i < NW; i++) if (wrapC(s1 - cum[i]) < 0 && wrapC(st.s - cum[i]) >= 0) events.push('corner');
    st.travelled += Math.abs(wrapC(st.s - s1));
    let hw = NW - 1; const sp = wrapP(st.s); for (let i = 0; i < NW; i++) if (sp < cum[i] + walls[i].width) { hw = i; break; }
    return { s: st.s, lap: st.travelled / PER, holderWall: hw, assist: !!P.relayAssist };
  }
  const _relEv = [];
  function stepRelay(dt, time, S, events, hs, leave) {
    _relEv.length = 0;
    let R = null;
    if (S) { const r = S.relay; if (r && Number.isFinite(+r.s) && r.done !== true && S.block === 'brasa' && (S.brasaStage !== undefined ? S.brasaStage === 'relay' : r.holderWall >= 0)) R = r; }   // T-055: relay lives from 'relay:start' to the end of the Brasa (done in 'call')
    else R = relayStandIn(dt, time, hs, _relEv);
    let jumpEv = false, cornerEv = false, lapEv = false;
    const scan = (list) => { if (list) for (const e of list) { const n = evName(e); if (n.startsWith('relay:jump')) jumpEv = true; else if (n === 'corner' || n.startsWith('corner:')) cornerEv = true; else if (n === 'relay:lap') lapEv = true; } };
    scan(events); scan(_relEv);
    const runner = devils[MAXD - 1], dR = Number(P.relayD ?? 2.6), want = !!R && leave < 0.3 && (P.relayOn ?? true) !== false;
    if (want) {
      const target = +R.s;
      if (!RL.on) {                                 // it is born where the fire is
        RL.on = true; RL.s = target; RL.prevS = target; RL.vel = 0; RL.hopK = 1; RL.full = false; lapCells.fill(0);
        Object.assign(runner, { on: true, s: target, d: dR, dir: 1, spd: 0.5, stride: 0.3, age: 0, life: 1e9, k: 0, dis: 0, style: 0, phase: 0, wave: null, h: 1.12, acc: 0, born: 7.3, hop: 0, gain: 1.25 });
      }
      const diff = wrapC(target - RL.s);
      if ((jumpEv || Math.abs(diff) > 1.0) && RL.hopK >= 1 && Math.abs(diff) > 0.15) {   // a leap to the next hand
        RL.hopK = 0; RL.hopFrom = RL.s; RL.hopDur = Math.min(0.8, 0.38 + Math.abs(diff) * 0.12); RL.jumps++;
        ringPoint(RL.s, dR, _v); emit(160, _v.x, 0.3, _v.z, 0.2, 0, 1, 0, 0.5, 1.5, 4, 0.5, 1.1, 2.0, 0.9, 0.5);   // take-off
      }
      const s1 = RL.s;
      if (RL.hopK < 1) {
        RL.hopK = Math.min(1, RL.hopK + dt / RL.hopDur);
        const span = wrapC(target - RL.hopFrom), e = smoother(RL.hopK);
        RL.s = RL.hopFrom + span * e;
        runner.hop = (0.35 + Math.min(0.6, Math.abs(span) * 0.18)) * Math.sin(Math.PI * RL.hopK);
        ringPoint(RL.s, dR, _v); emit(Math.max(2, Math.round(260 * dt)), _v.x, 0.9 + runner.hop, _v.z, 0.25, 0, 1, 0, 0.8, 0.2, 1.0, 0.5, 1.0, 1.9, 0.6, 1.0);   // the arc leaves sparks
        if (RL.hopK >= 1) { runner.hop = 0; ringPoint(RL.s, dR, _v); emit(220, _v.x, 0.1, _v.z, 0.3, 0, 1, 0, 0.55, 2, 5, 0.5, 1.2, 2.1, 1, 0.5); addRipple(_v.x, _v.z, 0.012, time); }   // landing
      } else RL.s += diff * (1 - Math.exp(-dt / 0.15));                // it runs with the fire (human pace: the score's s)
      const ds = wrapC(RL.s - s1);
      markLap(s1, RL.s);
      for (let i = 0; i < NW; i++) if (wrapC(s1 - cum[i]) * wrapC(RL.s - cum[i]) < 0 && Math.abs(wrapC(RL.s - cum[i])) < 1.5) cornerFlare(i, time);   // crossing a corner
      if (cornerEv) { let bi = 0, bd = 1e9; for (let i = 0; i < NW; i++) { const d = Math.abs(wrapC(RL.s - cum[i])); if (d < bd) { bd = d; bi = i; } } cornerFlare(bi, time); }
      RL.vel += (ds / Math.max(dt, 1e-3) - RL.vel) * (1 - Math.exp(-dt / 0.25));
      runner.s = RL.s; runner.d = dR;
      if (Math.abs(RL.vel) > 0.1) runner.dir = RL.vel > 0 ? 1 : -1;
      runner.spd = Math.min(3.4, Math.abs(RL.vel) * (1 + dR / 3.5));   // the gait: world speed
      RL.trailK = Math.min(1, RL.trailK + dt / 0.8);
      let cov = 0; for (let i = 0; i < NC; i++) cov += lapCells[i];
      if (!RL.full && (cov >= NC * 0.97 || +R.lap >= 0.999 || lapEv)) {             // the full lap: the whole trail flares
        RL.full = true; for (let i = 0; i < NC; i++) { lapCells[i] = 1; flare[i] = Math.max(flare[i], 1.0); }
      }
      // assisted: two or three devils run to fetch the fire and run with it
      const ast = R.assist === true || +R.assist > 0.3 || R.stuck === true || R.fetch === true;
      if (ast && !RL.assist) {
        const n = crowdN > 4 ? 2 : 3;
        for (let j = 0; j < 3; j++) {
          const f = devils[MAXD - 2 - j]; if (j >= n) continue;
          const side = j % 2 ? -1 : 1, off = side * (4 + j * 1.3);
          Object.assign(f, { on: true, s: RL.s + off, d: dR + 0.5 + j * 0.6, dir: -side, spd: 3, stride: 0.4, age: 0, life: 1e9, k: 0, dis: 0, style: (j + 1) % 2, phase: j * 2.1, wave: null, h: 0.95 + 0.05 * j, acc: 0, born: 11 + j * 3.7, hop: 0, gain: 0.9, slot: side * (0.8 + 0.35 * j) });
        }
      }
      if (!ast && RL.assist) for (let j = 0; j < 3; j++) { const f = devils[MAXD - 2 - j]; if (f.on && f.life > 1e8) f.life = f.age + 1.2; }
      RL.assist = ast;
      for (let j = 0; j < 3; j++) {
        const f = devils[MAXD - 2 - j]; if (!f.on) continue;
        const dd = wrapC(RL.s + (f.slot || 0) - f.s), sp = Math.min(2.6, Math.abs(dd) * 2 + Math.abs(RL.vel));   // run to it, then with it
        const step = Math.sign(dd) * Math.min(Math.abs(dd), sp * dt);
        f.s += step; if (Math.abs(step) > 1e-4) f.dir = Math.sign(step); f.spd = Math.max(0.6, sp * (1 + f.d / 3.5));
      }
    } else if (RL.on) {                              // the relay is over: the runner and its helpers dissolve, the trail cools
      RL.on = false; RL.assist = false;
      for (let j = 0; j < 4; j++) { const f = devils[MAXD - 1 - j]; if (f.on && f.life > 1e8) { f.life = f.age; f.hop = 0; } }
    }
    if (!RL.on) RL.trailK = Math.max(0, RL.trailK - dt / (S && S.relay && S.relay.done ? 10 : 4));   // after the lap the trail stays a while into the call
    // the trail: the lap travelled glows in the bed and breathes a few embers
    if (RL.trailK > 0.001) {
      const tk = RL.trailK * (1 - leave) * Number(P.trail ?? 1);
      for (let i = 0; i < NC; i++) if (lapCells[i] > 0) dyn[i] = Math.max(dyn[i], 1.05 * tk * (0.85 + 0.15 * Math.sin(time * 1.7 + i * 0.37)));
      RL.emberAcc += dt * 55 * tk;
      for (let tries = 0; RL.emberAcc >= 1 && tries < 6; tries++) {
        const j = Math.floor(Math.random() * NC); if (lapCells[j] <= 0) continue;
        RL.emberAcc -= 1; ringPoint(j * CELL, dR + 0.3 + Math.random() * 2.2, _v);
        emit(5, _v.x, 0.06, _v.z, 0.25, 0, 1, 0, 0.35, 0.6, 1.9, 0.9, 2.0, 2.0, 0.6, 0.8);
      }
      if (RL.emberAcc > 3) RL.emberAcc = 3;
    } else if (!RL.on) lapCells.fill(0);
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
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    U.seed.value = (frame * 2654435761) >>> 0;
    // ---- the room sinks into the liquid as the ring wakes (the world rises; ≤ 3 cm/s, soft accelerations); none in the wait
    const plazaOn = !!(parts?.plaza?.object?.visible) && P.inPlaza !== false;   // the host shows the square with the fire (Brasa set)
    setInPlaza(plazaOn);
    const liftT = plazaOn ? 0 : Math.max(0, Number(P.sink ?? 0.5)) * smoother(Math.min(1, level * 1.15)) * (1 - waitK);
    if (frame <= 2 || (!S && time < 4)) { lift = liftT; liftV = 0; }
    else { const want = Math.max(-0.03, Math.min(0.03, (liftT - lift) * 0.6)); liftV += (want - liftV) * (1 - Math.exp(-dt / 0.9)); lift += liftV * dt; }
    world.position.y = lift; U.lift.value = lift;

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
    let onCall = false;   // (whiteN: lab count of white sparks)                                             // T-047: is now inside the call's counting window?
    if (S) { const C = S.block === 'brasa' && S.brasaStage === 'call' && S.call; if (C && C.n > 0) { const ct = (S.clock ?? 0) - C.at; onCall = ct >= -2 * (C.gap || 0.8) && ct <= 0.7; } }
    else if (Number(P.call) > 0) { const ct = (time % 4) - 2.4; onCall = ct >= -1.6 && ct <= 0.7; }
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
      let slot = null, newDown = false;
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
          newDown = true;
          if (waitK < 0.5) lightFire(h, time);   // VFX 25-11 (a): the fire catches under the hand
          { const W = walls[h.wall]; _v.copy(h.pos).addScaledVector(W.normal, -0.5); addRipple(_v.x, _v.z, 0.014, time); }
          const n = h.normal, wk = 1 - 0.75 * waitK;
          emit(Math.max(24, 60 * gH) * wk, h.pos.x - n.x * 0.03, h.pos.y - lift, h.pos.z - n.z * 0.03, 0.03, -n.x * 0.4, 0.9, -n.z * 0.4, 0.8, 1.0, 3.0, 0.4, 0.9, 1.6, 0.6, 1.2);   // a small burst at the hand, at once
          // T-047 (#20): a landing that COUNTS on the call (score.js › callCount: from the first tok to TOK + 0.7 s, any wall) also throws
          // a white spark that rises slowly, unlike the normal orange burst: the hand sees at once that it hit
          if (onCall) whiteN++;
          if (onCall) emit(Math.max(30, 70 * gH), h.pos.x - n.x * 0.04, h.pos.y - lift + 0.03, h.pos.z - n.z * 0.04, 0.03, 0, 1, 0, 0.18, 0.9, 1.8, 1.6, 2.4, 4.0, -0.25, 0.5);   // heat 4 (≥ 2.9 after jitter) = drawn white
          if ((P.devils ?? 1) > 0 && waitK < 0.5) spawnDevil(s0, Math.random() < 0.5 ? -1 : 1, 0.8 + Math.random() * 0.7, 7 + Math.random() * 3, null, time);   // dancing pace, m/s in the world
        }
      }
      slot.seen = true;
      if (waitK < 0.5 && P.tiles !== false) touchTiles(h, newDown, h.pos.y - lift);
      const s = cum[h.wall] + h.u * walls[h.wall].width; slot.s = s; slot.y = h.pos.y;
      addHeat(dyn, s, dt * 0.9 * gH, 0.6);
      const n = h.normal, w = walls[h.wall], sp = Math.hypot(h.vx || 0, h.vy || 0);
      slot.acc += dt * (70 + 520 * Math.min(sp, 1.5)) * gH * (1 - 0.7 * waitK);                   // a resting hand: a trickle; a dragged one: a trail
      if (slot.acc >= 4) {
        const k = Math.floor(slot.acc); slot.acc -= k;
        const ix = w.right.x * (h.vx || 0) * 0.6, iz = w.right.z * (h.vx || 0) * 0.6, iy = (h.vy || 0) * 0.6;
        emit(k, h.pos.x - n.x * 0.03, h.pos.y - lift, h.pos.z - n.z * 0.03, 0.04, -n.x * 0.7, 0.7, -n.z * 0.7, 0.5, 1.2, 4.5, 0.7, 1.6, 1.5, 1, 0.6, ix, iy, iz);
      }
      // the correfoc fountain: a jet over 0.6 s from the hand into the world (not all at once: a jet, and no white ball of overlap)
      if (slot.jet > 0) {
        const wk = 1 - 0.75 * waitK, nn = h.normal;
        slot.jetAcc += (780 / 0.6) * gH * wk * Math.min(dt, slot.jet); slot.jet -= dt;
        // T-056: the hand's height decides the jet: low (children) a short low spray, high a tall one
        const hk = clamp01((h.pos.y - 0.5) / 1.5);
        if (slot.jetAcc >= 4) { const k = Math.floor(slot.jetAcc); slot.jetAcc -= k; emit(k, h.pos.x - nn.x * 0.03, h.pos.y - lift, h.pos.z - nn.z * 0.03, 0.05, -nn.x * (0.95 - 0.35 * hk), 0.3 + 0.65 * hk, -nn.z * (0.95 - 0.35 * hk), 0.3, 2.2 + 1.6 * hk, 4.5 + 5.5 * hk, 1.0 + 0.5 * hk, 2.0 + 1.2 * hk, 1.75, 1, 0.3); }
      }
      // T-056: a held hand keeps a column of sparks rising out of the bed under it; its top is seen at the hand's height on the wall
      if ((P.column ?? 1) > 0 && waitK < 0.5) {
        const dC = Number(P.relayD ?? 2.6), twC = ringPoint(s0h(h), dC, _v2), ey = eye.y || 1.6;
        const apex = Math.max(0.2, Math.min(4.5, ey + (h.pos.y - ey) * (twC + dC) / twC));    // the world height seen at the hand's height
        slot.colAcc = (slot.colAcc || 0) + dt * 80 * gH * Number(P.column ?? 1) * (1 - waitK);
        if (slot.colAcc >= 3) {
          const k = Math.floor(slot.colAcc); slot.colAcc -= k;
          const v0 = Math.sqrt(2 * 9.8 * apex) * 1.06, tA = v0 / 9.8;
          emit(k, _v2.x, 0.05, _v2.z, 0.06, 0, 1, 0, 0.035, v0 * 0.86, v0, tA * 1.05, tA * 1.5, 2.2, 1, 0.25);
        }
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
          const mx = (h.pos.x + slot.px) / 2, my = (h.pos.y + slot.py) / 2 - lift, mz = (h.pos.z + slot.pz) / 2;
          emit(k / 2, h.pos.x - n.x * 0.04, h.pos.y - lift, h.pos.z - n.z * 0.04, 0.035 + mv * 0.25, 0, 1, 0, 1.0, 0.01, 0.12, 2.0, 3.2, 1.6, -0.02, 3.5);
          emit(k / 2, mx - n.x * 0.04, my, mz - n.z * 0.04, 0.035 + mv * 0.25, 0, 1, 0, 1.0, 0.01, 0.12, 2.0, 3.2, 1.6, -0.02, 3.5);
        }
      }
      slot.px = h.pos.x; slot.py = h.pos.y; slot.pz = h.pos.z;
      if (!newDown) for (const F of fires) if (F.on && F.stroke !== h.stroke && F.pos.distanceToSquared(h.pos) < 1.0 && time - F.last > 0.25 && time - F.last < 0.9) F.stroke = h.stroke;   // the sensor gave the same hand a new stroke
      if (nh < 16) { HP[nh].set(h.pos.x, h.pos.y - lift, h.pos.z, slot.flash * gHs); nh++; }
      slot.flash *= Math.exp(-dt / 0.18);
    }
    for (const x of hands) if (!x.seen && x.stroke !== null) { const u = recentUps[upI]; u.s = x.s; u.y = x.y ?? 1.2; u.t = time; upI = (upI + 1) % recentUps.length; x.stroke = null; }
    U.nH.value = nh;
    stepFires(dt, time, hs);

    // ---- the chapter's level, waves, awake, reward
    const target = phase === 'reward' ? 1 : 0.0 + progress;
    level += (target - level) * (1 - Math.exp(-dt * 0.8));
    if (waveEv) {
      // the call's wave starts from the calling wall's centre; a miss (state.waveBig false) is a small wave
      const C = S && S.call, fromCall = S && S.brasaStage === 'call' && C;
      startWave(fromCall ? wrapP(hearthS[C.from % NW]) : waveOrigin(time), time, S ? S.waveBig !== false : true);
    }
    // ---- the call's countdown (state.call; study: params.call 1..3 loops a call every 4 s, the TOK at 2.4 s)
    {
      let on = 0, ct = -99, gap = 0.8; const cw = _cw; cw[0] = cw[1] = cw[2] = cw[3] = 0;
      if (S && S.block === 'brasa' && S.phase === 'play' && S.brasaStage === 'call' && S.call) {
        const C = S.call; ct = (S.clock ?? 0) - C.at; gap = C.gap || 0.8; on = 1;
        if (C.to === -1 || C.n >= 3) cw[0] = cw[1] = cw[2] = cw[3] = 1; else { cw[C.from % NW] = 1; if (C.to !== C.from && C.to >= 0) cw[C.to % NW] = 0.5; }
      } else if (!S && Number(P.call) > 0) {
        const n = Math.round(Number(P.call)), per = 4; ct = ((time % per) + per) % per - 2.4; gap = 0.8; on = 1;
        if (n >= 3) cw[0] = cw[1] = cw[2] = cw[3] = 1; else { cw[1] = 1; if (n === 2) cw[3] = 0.5; }
      }
      callOnK += ((on ? 1 : 0) - callOnK) * (1 - Math.exp(-dt / 0.3));
      U.callT.value = ct; U.callGap.value = gap; U.callOn.value = callOnK * (1 - leave); U.callW.value.set(cw[0], cw[1], cw[2], cw[3]);
    }
    const vW = Number(P.waveSpeed) || 3;
    for (const w of waves) {
      if (!w.on) continue;
      const r = vW * (time - w.t0), half = PER / 2, wk = w.big === false ? 0.4 : 1;
      if (w.big === false && r >= PER / 8) { w.on = false; continue; }
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
        maxHeat(flare, s, 2.6 * wk, 0.8); addHeat(dyn, s, dt * 2.4 * wk, 0.9);
        ringPoint(s, 4.5 + Math.random() * 3.5, _v);
        emit(Math.max(1, Math.round(1700 * dt * wk * (0.45 + 0.55 * crowdK))), _v.x, 0.15, _v.z, 0.6, 0, 1, 0, 0.4, 3, 8, 1.0, 2.2, 2.2, 0.9, 0.4);
        if (time - w.lastR[side] > 0.28) { w.lastR[side] = time; ringPoint(s, 0.5 + Math.random() * 2.5, _v); addRipple(_v.x, _v.z, 0.012, time); }
        for (const t of tiles) if (t.mode === 1 && t.delay <= 0 && t.alpha > 0.5 && Math.abs(wrapC(t.s - s)) < 0.45) { t.kick = 0.8; t.hvx = 0; t.delay = 0.01 + Math.random() * 0.2; }   // the front knocks the tiles down as it passes
        if (w.big !== false && r - w.last[side] >= 4) { w.last[side] = r; spawnDevil(s, side ? -1 : 1, 2.6 + Math.random() * 0.8, 2.6, w, time); }   // a relay of devils along the front
      }
    }
    if (awakeEv) {
      awakeT = time; for (let i = 0; i < NC; i++) flare[i] = Math.max(flare[i], 1.2);
      // the ring is awake: every tile comes down, in a spiral that runs round the room in ~2.5 s, into the liquid
      const a0 = Math.random();
      for (const t of tiles) if (t.mode === 1 && t.alpha > 0.3) { t.kick = 0.7; t.hvx = 0; t.delay = 0.05 + (((t.s / PER - a0) % 1) + 1) % 1 * 2.4 + Math.random() * 0.15; }
    }
    const sa = time - awakeT;
    awakeEnv = sa < 0 ? 0 : sa < 0.8 ? 1.6 * smoother(sa / 0.8) : 0.35 + 1.25 * Math.exp(-(sa - 0.8) / 3);
    if (phase === 'reward') rewardT += dt; else rewardT = 0;
    const cTarget = phase === 'reward' ? smoother((rewardT - 1.5) / 4) : 0;
    contract += (cTarget - contract) * (1 - Math.exp(-dt * 1.5));
    const coolT = Math.max(phase === 'reward' ? 0.55 * smoother((rewardT - 3) / 4) : 0, smoother(leave / 0.7));
    cool += (coolT - cool) * (1 - Math.exp(-dt * 2));

    // ---- ambient sparks off the ring, the awake column, the leave motes, the landing puffs
    farAcc += dt * 16 * arrive * (1 - waitK) * (1 - leave) * (0.4 + 0.6 * level);   // a few embers drifting up in the depth (12–40 m out)
    while (farAcc >= 1) { farAcc -= 1; ringPoint(Math.random() * PER, 12 + Math.random() * 28, _v); emit(3, _v.x, 0.2 + Math.random() * Math.random() * 9, _v.z, 0.6, 0, 1, 0, 0.6, 0.2, 0.9, 5, 9, 1.5, -0.14, 0.5); }   // embers drifting high in the depth: the upper half lives
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

    // ---- T-056: the relay — one devil runs the room at the hand's pace, leaps to the next hand, flares at the corners, leaves a trail
    stepRelay(dt, time, S, input.events, hs, leave);

    // ---- devils
    for (let i = 0; i < MAXD; i++) {
      const dv = devils[i], ds = DS[i];
      if (!dv.on) { ds.set(0, 0, 0, 0); continue; }
      dv.age += dt;

      dv.k = Math.min(1, dv.k + dt / 0.9);
      if (dv.age > dv.life || leave > 0.3) dv.dis = Math.min(1, dv.dis + dt / 1.8);
      if (dv.dis >= 1) { dv.on = false; ds.set(0, 0, 0, 0); continue; }
      const tw = ringPoint(dv.s, dv.d, _v2);
      if (!dv.res) dv.s += dv.dir * dv.spd * dt * tw / (tw + dv.d);      // spd is metres per second on the square's floor (the relay's devils are moved by stepRelay)
      dv.stride = Math.min(0.55, 0.16 + dv.spd * 0.12);
      dv.phase += dt * Math.PI * 2 * Math.min(3.0, Math.max(1.3, 0.9 + dv.spd * 0.6));
      pose(dv, time);
      for (let j = 0; j < NJ; j++) JV[i * NJ + j].set(J[j].x, J[j].y, J[j].z, 0);
      ds.set(dv.k, dv.dis, (0.9 + 0.15 * Math.sin(time * 9 + i)) * Math.max(0.5, Number(P.devils ?? 1)) * (dv.gain || 1), 0);
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

    // ---- the tiles and drops
    stepTiles(dt, time, arrive, leave);

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
    U.flames.value = Number(P.flames ?? 1) * (inPlazaK === true ? 0.55 : 1); U.heat.value = Number(P.heat ?? 1); U.devils.value = Number(P.devils ?? 1) * (0.35 + 0.65 * crowdK);
    // (a crowd: the devils dimmer; the bed too, so many hands are no brighter than ~4)
    U.crowd.value = 0.6 + 0.4 * crowdK;
    U.haze.value = Number(P.haze ?? 1) * (inPlazaK === true ? 0.35 : 1);
    if (inPlazaK === true) shardMesh.visible = arrive < 0.999 || leave > 0.001;   // AD 25-11: no red confetti lying on the paving U.wait.value = waitK; U.breath.value = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(breathPh * Math.PI * 2)); U.smoke.value = Math.max(0, Number(P.smoke ?? 1)); smokeMesh.visible = U.smoke.value > 0;
    updatePlumes(time, level * (1 - cool * 0.5), arrive);
    U.chrome.value = Math.max(0, Number(P.chrome ?? 1)) * (1 - 0.85 * waitK);
    U.refl.value = Math.max(0, Number(P.reflect ?? 1)) * smoother(arrive / 0.6) * (1 - 0.7 * waitK);
    { const hk = 0.2 * (1 - waitK) * clamp01((arrive - 0.2) / 0.6) * (1 - clamp01((leave - 0.2) / 0.5)); for (const h of heroHalo) { h.set({ intensity: hk }); h.mesh.visible = hk > 0.002; } }
    farGroup.rotation.y = (farGroup.rotation.y + dt * (Number(P.turn ?? 1.2) * Math.PI / 180) * (0.3 + 0.7 * level) * (1 - waitK)) % (Math.PI * 2);
    U.quiet.value = Math.min(0.85, (0.36 + 0.35 * Math.min(1, awakeEnv) + 0.25 * clamp01((crowdN - 1) / 6)) * (1 - waitK) * Math.max(0, Number(P.quiet ?? 1)));
    U.nE.value = nE;
    for (let i = 0; i < lights.length; i++) {
      const c = Math.round(wrapP(hearthS[i]) / CELL) % NC;
      lights[i].intensity = (8 + 30 * level + 20 * (dyn[c] + flare[c])) * arrive * (1 - cool * 0.8) * (1 - leave);
    }
    room.renderer.compute(sparkCompute);
  }

  if (typeof window !== 'undefined') window.__brasa = { breath: () => U.breath.value, wait: () => waitK, puffs: () => puffCount, roots: () => devils.map((d, i) => (d.on && d.dis === 0 ? [i, JV[i * NJ].x, JV[i * NJ].z, d.wave ? 1 : 0] : null)).filter(Boolean), devils: () => devils.filter((d) => d.on).length, callT: () => U.callT.value, lift: () => lift, impacts: () => impacts, fx: () => fx.filter((f) => f.t >= 0), tiles: () => tiles.reduce((a, t) => { a[t.mode]++; return a; }, [0, 0, 0, 0, 0]), waves: () => waves.filter((w) => w.on).length, emitters: () => nE, white: () => whiteN, relay: () => ({ on: RL.on, s: RL.s, hop: RL.hopK < 1, jumps: RL.jumps, corners: RL.corners, assist: RL.assist, lap: lapCells.reduce((a, b) => a + b, 0) / NC, full: RL.full, helpers: [1, 2, 3].filter((j) => devils[MAXD - 1 - j].on).length }) };
  // textObstacles() (director 25-11): what stands in the text's band, for the host's text placer: [{ wall, x, half, y0, y1 }]
  // (wall index, metres from the wall's centre along it, half-width m, heights m from the floor). Allocation-light (a few per call).
  const _to = [], _tp = new THREE.Vector3();
  function wallOf(p) {
    const ex = p.x - room.eye.x, ez = p.z - room.eye.z; let best = -1, bt = Infinity, bx = 0;
    room.walls.forEach((w, i) => { const den = -(ex * w.normal.x + ez * w.normal.z); if (den <= 1e-4) return; const d = -((w.pa.x - room.eye.x) * w.normal.x + (w.pa.z - room.eye.z) * w.normal.z); const t = d / den;
      const hx = room.eye.x + ex * t - w.centre.x, hz = room.eye.z + ez * t - w.centre.z, x = hx * w.right.x + hz * w.right.z;
      if (t > 0 && t < bt && Math.abs(x) <= w.width / 2 + 0.01) { bt = t; best = i; bx = x; } });
    return best < 0 ? null : { wall: best, x: bx };
  }
  function textObstacles() {
    _to.length = 0;
    devils.forEach((d, i) => { if (!d.on) return; const j = JV[i * NJ]; _tp.set(j.x, 0, j.z); const o = wallOf(_tp); if (o) _to.push({ wall: o.wall, x: o.x, half: 0.6, y0: 0, y1: 2.0, kind: 'devil' }); });
    for (const F of fires) if (F.on && F.str > 0.05) { const w = room.walls[F.wall]; if (!w) continue; const x = (F.pos.x - w.centre.x) * w.right.x + (F.pos.z - w.centre.z) * w.right.z; _to.push({ wall: F.wall, x, half: 0.6, y0: 0, y1: Math.min(2.0, F.pos.y + 1.3), kind: 'fire' }); }
    return _to;
  }
  return {
    object, textObstacles,
    update,
    setParams(p) { if (p && p !== P) Object.assign(P, p); },
    dispose() {
      for (const m of [floorMesh, ...flameMesh, ...sparkMesh, ...devilMesh, shardMesh, smokeMesh, airMesh, ...tileMesh, ...dropMesh, ...farMesh, hazeMesh]) { m.geometry.dispose(); m.material.dispose(); }
      for (const h of heroHalo) h.mesh.material.dispose();   // (the halo's plane is the room's, shared)
      heatTex.dispose();
      try { fxBc?.close(); } catch { /* closed */ }
      for (const b of [bufP, bufV, bufK]) b.value?.dispose?.();
    },
  };
}
