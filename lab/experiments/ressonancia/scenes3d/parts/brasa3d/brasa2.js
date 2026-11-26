// Ressonància — brasa v2 (26-11, Beltrán + the director): THE CORREFOC LEVEL, rebuilt. «Tot castell comença a la foscor, amb un sol gest.»
//
// The idea: the fire builds the atmosphere and holds up what comes next. The interaction is FEEDING THE FIRE by making correfocs.
//   · The square (the plaça, fons.js) in the dark — «as if the lights were off»: you can hardly tell we are in it.
//   · ONE BONFIRE PER WALL (foguera2.js), each its own: P4 a tower («pira»), P1 a long bonfire («Sant Joan»), P2 an iron brazier,
//     P3 a crown of embers. 3.3 m beyond the wall's centre (FOG_D), the heart of the flame ~1.2 m up (FOG_H).
//   · A hand that lands calls a correfoc there (diable v3): it builds up from the embers and runs the room in a lane in front of the
//     fires (1.1–2.15 m beyond the walls). Every fire it passes it FEEDS: a flash, a burst of sparks, the fire grows… and grows.
//   · Unfed, a fire sinks back very slowly. When the four burn high enough (or after N feeds in all), the BOOM: a joint flare, a ring
//     of light running out over the floor, and the square lights up (its windows, the fire on its cornices) to receive the pinya.
//   · LIGHT: no lamps — each fire and each devil lights the floor (additive pools on the water); the square is lit from below by a heat
//     field that follows the fires (the baked dark plaza of the Plaza session takes `progress().fires` when it comes).
//   · A hand that keeps SLIDING is a correfoc too: a thin organic line of fire behind it and sparks thrown off it.
//   · THE OPENING (~12–15 s, `params.intro` in s from the block's start, for the voice): the room dark, the four fires only embers ·
//     a thin warm line of light runs round the room at hand height and stops at the middle of P1 (1.2 m) · «pum!» there the first
//     correfoc is born, as if the line were the hand that calls it · it runs the room and lights each fire's first flame (≈ 0.15);
//     the square glows a little. The public's hands work all the while.
//   · Solo: one person calling a devil every few seconds completes it in ~60–90 s (each devil runs ~1.15 laps: it passes every fire);
//     a group: much faster (and more devils, the oldest give way).
//
// API (for the director: the score, the sound, the trailer)
//   create({ THREE, TSL, room, params }) → { object, update(dt, input), setParams, dispose, progress(), events, reset() }
//   input   PARTS.md's: time, t (the block's clock: drives the opening), arrive, leave, hands [{ stroke, wall, y, s, … }], downs
//   sound()    → { births [{ wall, u }], devils [{ wall, u, spd }], hands [{ wall, u, slide }], fires [{ wall, level, flash }], feeds,
//                 boom, storm } this frame: what brasa2/sound.js (the fire's synthesis) plays — the director mounts it in the work's sound
//   progress() → { fires: [P4, P1, P2, P3] (0..1, above 1 in the boom), total (0..1), devils, feeds, done, boom (0..1) }
//   events  the array of this frame's events: 'feed:<w>' (wall index), 'boom', 'done', 'storm', 'storm:full', 'intro:strip', 'intro:boom',
//           'dust' (the exit begins), 'dust:gone'
//   ENTRY  out of the intro's dust: the fires light one by one from P1 (entryAt 0.4, entryGap 0.9 s), the water fades in over entryWater 6 s
//   EXIT   leaveTo 'dust' (default; 'cut' = the old way): on leave the storm's sparks settle into a warm floating dust that outlives us by
//          dustTime 6 s — part.lingering is true meanwhile (keep updating and drawing the part); params.tint [r,g,b] or '#hex' = the dust's
//          colour, followed with a 1.5 s ease (push it towards the next block's palette)
//   THE STORM after the boom (stormDelay 3.2 s, stormRamp 4 s; storm false = none): the room fills with sparks and flashes, the rest fades
//   under them (progress().storm 0..1) — the handover: switch blocks on 'storm:full' (or when you like)
//   params  intro { strip 0.5, stop 4.0, boom 4.8, run [5, 12] } · feed 0.06 · boomAt 0.72 · boomFeeds 52 · decay 0.004 /s ·
//           maxDevils 8 · devils 1 · sparks 1 · introOn true · handFire true · plaza (0..1 extra light on the square, 0)
// Cost (theory): see foguera2.js; plus the floor (1 draw), the square (fons: 1 draw, its mirror hidden), the GPU sparks (1 compute
// + 1 draw, 65k), the devils (diable2: 2 draws, no mirror), the hand fire (1 draw). Switches: ?b2nosparks, ?b2nofons + foguera2's.

import { createFogueres } from './foguera2.js';
import { createFons } from './fons.js';
import { createDiables as createDiable2 } from './diable2.js';

export const FOG_D = 3.3, FOG_H = 1.2;
const NC = 256, NSP = 98304, MAXE = 64, MAXD = 14;
const LANES = [1.1, 1.45, 1.8, 2.15];
const FIRE_TYPE = { P4: 0, P1: 1, P2: 2, P3: 3 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };

export function createBrasa2({ THREE, TSL, room, params }) {
  const P = params || {};
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionGeometry, uv, texture, vec2, vec3, vec4, float,
    int, uint, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, floor, fract, pow, dot, normalize, length, select,
    hash, modelViewMatrix, cameraProjectionMatrix, step,
  } = TSL;
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const object = new THREE.Group(); object.name = 'brasa2';
  const world = new THREE.Group(); world.name = 'brasa2-world'; object.add(world);
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const wrapC = (x) => x - PER * Math.floor(x / PER + 0.5);
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
  const hearthS = walls.map((w, i) => cum[i] + w.width / 2);
  const w0 = walls[0], PX_ANG = (w0.height / w0.rect.h) / Math.max(1, -new THREE.Vector3().subVectors(w0.pa, eye).dot(w0.normal));
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  // ------------------------------------------------------------------------------------------------ uniforms, the heat field (lights the square)
  const U = {
    time: uniform(0), dt: uniform(1 / 60), level: uniform(0), arrive: uniform(1), leave: uniform(0), cool: uniform(0), awake: uniform(0),
    wait: uniform(0), lift: uniform(0), refl: uniform(0), devils: uniform(1), crowd: uniform(1), heat: uniform(1), seed: uniform(0, 'uint'), nE: uniform(0, 'int'),
    plaza: uniform(0.12), sparkK: uniform(1),
    settle: uniform(0), tint: uniform(new THREE.Vector3(1, 0.62, 0.32)), water: uniform(0),   // the exit to dust · its tint · the entry's water
  };
  const heatData = new Uint8Array(NC * 4);
  const heatTex = new THREE.DataTexture(heatData, NC, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  heatTex.wrapS = THREE.RepeatWrapping; heatTex.magFilter = THREE.LinearFilter; heatTex.minFilter = THREE.LinearFilter; heatTex.needsUpdate = true;
  const heatSample = (s, vertex) => { const t = texture(heatTex, vec2(s.div(PER), 0.5)); return vertex ? t.level(0) : t; };
  const CELL = PER / NC, heatR = new Float32Array(NC), heatG = new Float32Array(NC);

  let floorMesh = null, sparkMeshRef = null, lineMesh = null;
  // ------------------------------------------------------------------------------------------------ 1. the floor: black water (lit only by what burns)
  // (director 26-11: with the baked plaza behind us — fons off — the floor is the plaza's: ours would paint black over the foot of its
  //  façades. Then the bed is only light: the fires' and the devils' pools, the embers, the sparks. params.floor forces it either way.)
  if (P.floor ?? (P.fons !== false)) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), new THREE.MeshBasicNodeMaterial({ depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    const pw = attribute('position', 'vec3');
    floor.material.colorNode = vec3(0.0032, 0.0026, 0.0022).mul(float(1).sub(U.leave.mul(0.7)));
    floor.material.transparent = true; floor.material.opacityNode = U.water.mul(float(1).sub(U.leave));   // (the water comes in with a long fade)
    floor.material.fog = false; floor.renderOrder = -2; world.add(floor); floorMesh = floor;
    void pw;
  }

  // ------------------------------------------------------------------------------------------------ 2. the square in the dark (fons), lit by the fires
  const fons = QS.has('b2nofons') || P.fons === false ? null
    : createFons({ THREE, TSL, room, U, world, ringPoint, heatSample, mirP: TSL.Fn(([p]) => vec3(p.x, p.y.negate(), p.z)), eye, light: U.plaza });
  if (fons) fons.meshes[1].visible = false;                       // (no mirror: the fire lights the water, it does not mirror the square)

  // ------------------------------------------------------------------------------------------------ 3. sparks (GPU compute; BRA's, without the mirror)
  const E0 = [], E1 = [], E2 = [], E3 = [], E4 = [];
  for (let i = 0; i < MAXE; i++) { E0.push(new THREE.Vector4()); E1.push(new THREE.Vector4()); E2.push(new THREE.Vector4()); E3.push(new THREE.Vector4()); E4.push(new THREE.Vector4()); }
  const uE0 = uniformArray(E0, 'vec4'), uE1 = uniformArray(E1, 'vec4'), uE2 = uniformArray(E2, 'vec4'), uE3 = uniformArray(E3, 'vec4'), uE4 = uniformArray(E4, 'vec4');
  const bufP = instancedArray(NSP, 'vec4'), bufV = instancedArray(NSP, 'vec4'), bufK = instancedArray(NSP, 'vec4');
  const TAU = Math.PI * 2;
  const rnd = (k) => hash(instanceIndex.mul(uint(9)).add(U.seed).add(uint(k)));
  const unitV = (a, b) => { const z = rnd(a).mul(2).sub(1), ph = rnd(b).mul(TAU), rr = sqrt(max(float(1).sub(z.mul(z)), 0)); return vec3(rr.mul(cos(ph)), z, rr.mul(sin(ph))); };
  const fireRamp = (T) => { const t = max(T, 0.0), r = smoothstep(0.02, 0.55, t), g = smoothstep(0.45, 1.35, t).mul(0.62).mul(r), b = smoothstep(0.95, 1.9, t).mul(0.95).mul(g); return vec3(r, g, b).mul(t).mul(1.4); };
  let sparkCompute = null;
  if (!QS.has('b2nosparks')) {
    const sparkStep = Fn(() => {
      const p4 = bufP.element(instanceIndex).toVar(), v4 = bufV.element(instanceIndex).toVar(), k4 = bufK.element(instanceIndex).toVar();
      const fi = float(instanceIndex), born = int(-1).toVar();
      Loop(U.nE, ({ i }) => {
        const e0 = uE0.element(i), dd = fi.sub(e0.x).toVar();
        If(dd.lessThan(0), () => { dd.addAssign(NSP); });
        If(dd.lessThan(e0.y), () => { born.assign(i); });
      });
      If(born.greaterThanEqual(0), () => {
        const e0 = uE0.element(born), e1 = uE1.element(born), e2 = uE2.element(born), e3 = uE3.element(born), e4 = uE4.element(born);
        const pos = e1.xyz.add(unitV(1, 2).mul(e1.w.mul(pow(rnd(3), 0.5))));
        const dir = normalize(e2.xyz.add(unitV(4, 5).mul(e2.w)));
        const sp = mix(e3.x, e3.y, pow(rnd(6), 1.4));
        p4.assign(vec4(pos, 0)); v4.assign(vec4(dir.mul(sp).add(e4.xyz.mul(rnd(7).mul(0.4).add(0.6))), mix(e3.z, e3.w, rnd(8))));
        k4.assign(vec4(e0.z.mul(rnd(9).mul(0.3).add(0.75)), e4.w, e0.w, rnd(10)));
      }).Else(() => {
        If(v4.w.greaterThan(0).and(p4.w.lessThan(v4.w)), () => {
          const dt = U.dt, g = k4.y, v = v4.xyz.toVar(), p = p4.xyz.toVar();
          v.addAssign(vec3(0, g.mul(-9.8).mul(dt), 0));
          v.mulAssign(exp(k4.z.negate().mul(dt)));
          // (the exit: the sparks settle into a warm floating dust — slowed, lifted a little, swirling, living much longer)
          v.mulAssign(exp(U.settle.mul(-1.6).mul(dt)));
          v.addAssign(vec3(sin(p.y.mul(1.9).add(U.time.mul(0.5)).add(k4.w.mul(40.0))).mul(0.25), float(0.16).add(k4.w.mul(0.1)).sub(g.mul(9.8).mul(0.9)), cos(p.y.mul(1.4).add(U.time.mul(0.4)).add(k4.w.mul(23.0))).mul(0.25)).mul(U.settle).mul(dt));
          p.addAssign(v.mul(dt));
          const hot = k4.x.toVar();
          If(p.y.lessThan(0.004).and(v.y.lessThan(0)), () => { p.assign(vec3(p.x, 0.004, p.z)); v.assign(vec3(v.x.mul(0.5), v.y.mul(-0.3), v.z.mul(0.5))); hot.mulAssign(0.82); });
          p4.assign(vec4(p, p4.w.add(dt.mul(float(1).sub(U.settle.mul(0.86)))))); v4.assign(vec4(v, v4.w)); k4.assign(vec4(hot, k4.yzw));
        });
      });
      bufP.element(instanceIndex).assign(p4); bufV.element(instanceIndex).assign(v4); bufK.element(instanceIndex).assign(k4);
    });
    sparkCompute = sparkStep().compute(NSP);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.instanceCount = NSP;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const P4 = bufP.toAttribute(), V4 = bufV.toAttribute(), K4 = bufK.toAttribute();
    const alive = V4.w.greaterThan(0).and(P4.w.lessThan(V4.w));
    const x = clamp(P4.w.div(max(V4.w, 1e-3)), 0, 1);
    const T = K4.x.mul(pow(float(1).sub(x), 1.1)).mul(sin(U.time.mul(31.0).add(K4.w.mul(300.0))).mul(0.12).add(0.88));
    const head = modelViewMatrix.mul(vec4(P4.xyz, 1)), tail = modelViewMatrix.mul(vec4(P4.xyz.sub(V4.xyz.mul(0.024)), 1));
    const ax2 = head.xy.sub(tail.xy), L = length(ax2), dir = select(L.greaterThan(1e-5), ax2.div(max(L, 1e-5)), vec2(0, 1)), perp = vec2(dir.y.negate(), dir.x);
    const W = max(float(0.011), head.z.negate().max(0.1).mul(PX_ANG * 1.3));
    const pg = positionGeometry.xy, along = pg.y.add(0.5);
    const c = mix(tail.xyz, head.xyz, along).add(vec3(perp.mul(pg.x.mul(W)).add(dir.mul(pg.y.mul(W))), 0));
    m.vertexNode = select(alive, cameraProjectionMatrix.mul(vec4(c, 1)), vec4(0, 0, 2, 1));
    const E = float(0.011).div(W).mul(float(1).div(L.div(W.mul(5.0)).add(1))).mul(2.2);
    const fc = fireRamp(T).mul(E), lum = dot(fc, vec3(0.3, 0.55, 0.15));
    const vC = varying(mix(fc, U.tint.mul(lum).mul(1.6), U.settle.mul(0.85)).mul(float(1).sub(U.settle.mul(0.45)))), vA = varying(along);   // (the dust: dimmer, in the tint)
    const q = uv().sub(0.5);
    m.colorNode = vC.mul(exp(q.x.mul(q.x).mul(-14))).mul(mix(float(0.3), float(1), vA)).mul(U.sparkK);   // (the sparks outlive the fade: the storm is theirs)
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; world.add(mesh); room.reactive?.(mesh); sparkMeshRef = mesh;
  }
  let cursor = 0, nE = 0;
  function emit(n, px, py, pz, spread, dx, dy, dz, cone, vmin, vmax, lmin, lmax, heat, g, drag, ix = 0, iy = 0, iz = 0) {
    n = Math.floor(n * Math.max(0, Number(P.sparks ?? 1)));
    if (!sparkCompute || n <= 0 || nE >= MAXE) return;
    n = Math.min(n, 4096);
    const l = Math.hypot(dx, dy, dz) || 1;
    E0[nE].set(cursor, n, heat, drag); E1[nE].set(px, py, pz, spread); E2[nE].set(dx / l, dy / l, dz / l, cone);
    E3[nE].set(vmin, vmax, lmin, lmax); E4[nE].set(ix, iy, iz, g);
    cursor = (cursor + n) % NSP; nE++;
  }

  // ------------------------------------------------------------------------------------------------ 4. the four fires
  const sites = walls.map((w, i) => {
    ringPoint(hearthS[i], FOG_D, _v);
    const fx = eye.x - _v.x, fz = eye.z - _v.z, fl = Math.hypot(fx, fz) || 1;
    return { x: _v.x, z: _v.z, s: hearthS[i], type: FIRE_TYPE[w.id] ?? (i % 4), face: { x: fx / fl, z: fz / fl } };
  });
  const FIRE = createFogueres({ THREE, TSL, world, U, emit, sites, room });
  for (const m of FIRE.meshes) room.reactive?.(m);
  const lvl = new Float32Array(NW), target = new Float32Array(NW), flash = new Float32Array(NW), lastFed = new Float32Array(NW).fill(-99);

  // ------------------------------------------------------------------------------------------------ 5. the correfocs
  const DIA = createDiable2({ THREE, TSL, room, world, U, mirP: null, CHROME: null, fireRamp, emit, MAXD, ringPoint, eye });
  for (const m of DIA.meshes) room.reactive?.(m);
  const devils = [];
  for (let i = 0; i < MAXD; i++) devils.push({ on: false, s: 0, d: LANES[0], dir: 1, spd: 0, top: 3, age: 0, life: 12, k: 0, dis: 0, hop: 0, hopT: -1, nextHop: 4, h: 1, gain: 1, style: 0, born: i * 1.37, intro: false, order: 0, fedAt: new Float32Array(NW).fill(-99) });
  let order = 0;
  function spawnDevil(s, time, opt = {}) {
    // one per place (a hand held still does not call a crowd), a cap (the oldest gives way)
    for (const dv of devils) if (dv.on && dv.age < 1.0 && Math.abs(wrapC(dv.s - s)) < 1.2) return null;
    const cap = Math.max(1, Math.min(MAXD, Number(P.maxDevils ?? 8)));
    const live = devils.filter((d) => d.on && d.dis === 0);
    if (live.length >= cap) { const old = live.reduce((a, b) => (a.order < b.order ? a : b)); old.life = Math.min(old.life, old.age); }
    let dv = devils.find((d) => !d.on); if (!dv) return null;
    const use = LANES.map((L) => devils.filter((d) => d.on && Math.abs(d.d - L) < 0.15).length), least = Math.min(...use);
    const pick = LANES.filter((_, k) => use[k] === least);
    const lane = opt.lane ?? pick[Math.floor(Math.random() * pick.length)];
    const top = opt.speed ?? (2.6 + Math.random() * 0.8);
    Object.assign(dv, { on: true, s, d: lane + (opt.lane != null ? 0 : (Math.random() - 0.5) * 0.12), dir: opt.dir ?? (Math.random() < 0.5 ? 1 : -1), spd: 0, top,
      age: 0, k: 0, dis: 0, hop: 0, hopT: -1, nextHop: 3.5 + Math.random() * 3, h: 0.96 + Math.random() * 0.08, gain: 1, style: Math.random() < 0.5 ? 0 : 1,
      born: time + Math.random() * 10, intro: !!opt.intro, order: order++, go0: opt.go0 ?? 1.1, held: !!opt.held, stroke: opt.stroke ?? null,
      // ~1.15 laps: every fire is passed at least once
      life: opt.life ?? (1.1 + 1.0 + (PER * 1.15) / top) });
    dv.fedAt.fill(-99);
    births.push({ s, intro: !!opt.intro });
    return dv;
  }

  // ------------------------------------------------------------------------------------------------ 6. lines of light: the hands' fire, the opening's strip
  // Ribbons of points (world xyz + time stamp) drawn as one thin organic filament each (Beltrán 26-11: not a cone — a line).
  const MAXT = 14, TP = 40, TRAIL_T = 0.7;
  const segA = new Float32Array(MAXT * TP * 4), segB = new Float32Array(MAXT * TP * 4), segG = new Float32Array(MAXT * TP);
  const tg = new THREE.InstancedBufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); tg.setIndex([0, 1, 2, 0, 2, 3]);
  const tA = new THREE.InstancedBufferAttribute(segA, 4), tB = new THREE.InstancedBufferAttribute(segB, 4);
  tA.setUsage(THREE.DynamicDrawUsage); tB.setUsage(THREE.DynamicDrawUsage);
  const tG = new THREE.InstancedBufferAttribute(segG, 1); tG.setUsage(THREE.DynamicDrawUsage);
  tg.setAttribute('aA', tA); tg.setAttribute('aB', tB); tg.setAttribute('aG', tG); tg.instanceCount = 0;
  const uNow = uniform(0), uTrail = uniform(TRAIL_T);
  {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const A4 = attribute('aA', 'vec4'), B4 = attribute('aB', 'vec4'), G1 = attribute('aG', 'float');   // G: the line's gain (the opening's call is stronger)
    const live = float(1).sub(max(uNow.sub(B4.w), 0).div(uTrail.mul(G1.mul(0.5).add(0.5))));
    const a0 = modelViewMatrix.mul(vec4(A4.xyz, 1)), b0 = modelViewMatrix.mul(vec4(B4.xyz, 1));
    const ax = b0.xy.sub(a0.xy), al = max(length(ax), 1e-5), perp = vec2(ax.y.negate(), ax.x).div(al), dir = ax.div(al);
    const wob = (t) => sin(t.mul(29.0).add(uNow.mul(5.0))).add(sin(t.mul(53.0).sub(uNow.mul(7.3))).mul(0.6)).mul(0.006).mul(max(uNow.sub(t), 0).div(uTrail).add(0.35));
    const a = vec4(a0.xy.add(perp.mul(wob(A4.w))), a0.z, a0.w), b = vec4(b0.xy.add(perp.mul(wob(B4.w))), b0.z, b0.w);
    const mv = mix(a, b, positionGeometry.y.add(0.5));
    const w = max(float(0.007).mul(live.mul(0.4).add(0.6)).mul(G1), mv.z.negate().mul(0.0012).mul(G1));
    m.vertexNode = select(live.greaterThan(0.0), cameraProjectionMatrix.mul(vec4(mv.xy.add(perp.mul(positionGeometry.x.mul(w))).add(dir.mul(positionGeometry.y.mul(w))), mv.z, 1)), vec4(0, 0, 2, 1));
    const Lr = max(live, 0);
    const colr = mix(mix(vec3(0.35, 0.03, 0.01), vec3(1.0, 0.32, 0.06), smoothstep(0.15, 0.6, Lr)), vec3(1.0, 0.86, 0.6), smoothstep(0.75, 1.0, Lr));
    const q = uv().x.sub(0.5);
    m.colorNode = colr.mul(exp(q.mul(q).mul(-16))).mul(pow(Lr, 1.4).mul(1.5).add(0.05)).mul(G1.mul(0.6).add(0.4)).mul(sin(uNow.mul(19.0).add(B4.w.mul(41.0))).mul(0.12).add(0.88)).mul(float(1).sub(U.leave.mul(0.7)));
    m.fog = false;
    const mesh = new THREE.Mesh(tg, m); mesh.frustumCulled = false; mesh.renderOrder = 6; world.add(mesh); room.reactive?.(mesh); lineMesh = mesh;
  }
  const TR = new Map();                       // id → { pts ring, head, prev, vel, last, acc, seen, gone }
  // a point of the wall plane (perimeter s, height y), a little into the scene
  function wallPt(s, y, out, away) {
    s = wrapP(s);
    let w = NW - 1; for (let i = 0; i < NW; i++) if (s < cum[i] + walls[i].width) { w = i; break; }
    const W = walls[w], u = s - cum[w];
    out.set(W.pa.x + W.right.x * u, y, W.pa.z + W.right.z * u);
    away.set(out.x - eye.x, 0, out.z - eye.z).normalize();
    out.addScaledVector(away, 0.3);
    return out;
  }
  const _away = new THREE.Vector3(), _hv = new THREE.Vector3();
  function trailPoint(id, P3, time, sparks, dt, away, gain = 1) {
    let t = TR.get(id);
    if (!t) { if (TR.size >= MAXT) return; t = { pts: new Float32Array(TP * 4).fill(-1e3), head: 0, prev: P3.clone(), vel: new THREE.Vector3(), last: -1, acc: 0, gain }; TR.set(id, t); }
    t.seen = true; t.gone = 0;
    _hv.subVectors(P3, t.prev).divideScalar(Math.max(dt, 1e-3)); if (_hv.length() > 20) _hv.set(0, 0, 0);
    t.vel.lerp(_hv, 1 - Math.exp(-dt / 0.08)); t.prev.copy(P3);
    const spd = t.vel.length(), slide = clamp01((spd - 0.12) / 0.6);
    if (spd > 0.05 && time - t.last > 0.018) { t.pts.set([P3.x, P3.y, P3.z, time], t.head * 4); t.head = (t.head + 1) % TP; t.last = time; }
    if (!sparks) return;
    t.acc += dt * (70 + 520 * slide);
    if (t.acc >= 4) {
      const n = Math.floor(t.acc); t.acc -= n;
      const k = spd > 1e-3 ? 1 / spd : 0;
      emit(n, P3.x, P3.y, P3.z, 0.03, -t.vel.x * k * 0.6 + away.x * 0.35, -0.45 - t.vel.y * k * 0.6, -t.vel.z * k * 0.6 + away.z * 0.35, 0.65,
        1.2 + 1.6 * slide, 2.4 + 2.4 * slide, 0.45, 1.0, 1.6 + 0.6 * slide, 0.9, 1.3, t.vel.x * 0.25, t.vel.y * 0.25, t.vel.z * 0.25);
    }
  }
  function flushTrails(time, dt) {
    let k = 0;
    for (const [id, t] of TR) {
      if (!t.seen) { t.gone = (t.gone || 0) + dt; if (t.gone > TRAIL_T + 0.2) { TR.delete(id); continue; } }
      t.seen = false;
      for (let j = 0; j < TP - 1; j++) {
        const i0 = ((t.head + j) % TP) * 4, i1 = ((t.head + j + 1) % TP) * 4;
        if (t.pts[i0 + 3] < 0 || t.pts[i1 + 3] < 0 || time - t.pts[i1 + 3] > TRAIL_T || t.pts[i1 + 3] - t.pts[i0 + 3] > 0.35) continue;
        segA.set(t.pts.subarray(i0, i0 + 4), k * 4); segB.set(t.pts.subarray(i1, i1 + 4), k * 4); segG[k] = t.gain || 1; k++;
      }
    }
    tg.instanceCount = k; tA.needsUpdate = true; tB.needsUpdate = true; tG.needsUpdate = true; uNow.value = time;
  }

  // ------------------------------------------------------------------------------------------------ 7. state
  let storm = 0, stormOn = false, stormFull = false, ambAcc = 0;
  let settle = 0, dustT = -1, dustOn = false, dustGone = false, lingering = false;   // the exit to dust
  const appear = new Float32Array(4).fill(1), appearFlag = new Uint8Array(4);
  let births = [];                                             // (this frame's correfoc births, for the sound)
  let events = [], feeds = 0, boomAt = -1, done = false, introFired = { strip: false, boom: false }, clock0 = null, prevT = 0;
  const handsSeen = new Map(), handS = new Map();
  const introCfg = () => ({ strip: 0.5, stop: 4.0, boom: 4.8, run: [5, 12], ...(P.intro || {}) });   // (the voice: 0.5 «Every castell…», 5.0 «The correfoc carries the fire», 9.0 «Touch the wall…»)
  function reset() {
    lvl.fill(0); target.fill(0); flash.fill(0); lastFed.fill(-99); feeds = 0; boomAt = -1; done = false; storm = 0; stormOn = false; stormFull = false; settle = 0; dustT = -1; dustOn = false; dustGone = false; lingering = false; appearFlag.fill(0); introFired = { strip: false, boom: false }; clock0 = null;
    for (const dv of devils) dv.on = false;
    TR.clear(); handsSeen.clear(); events = [];
  }

  // ------------------------------------------------------------------------------------------------ update
  const P3h = new THREE.Vector3();
  function update(dt, input = {}) {
    dt = Math.min(Math.max(dt || 1 / 60, 1e-3), 1 / 20);
    const time = input.time ?? (prevT + dt); prevT = time;
    events = []; births = [];
    const arrive = input.arrive ?? P.arrive ?? 1, leave = input.leave ?? P.leave ?? 0;
    // the block's clock (drives the opening): the host's t, else from the first frame we are there
    if (clock0 === null && arrive > 0.01) clock0 = time;
    // (the score's state.t when it is ours — s in the block —, else our own clock since we arrived; the host's input.t is the
    //  sequence's clock, not the block's)
    const S = input.state;
    const own = clock0 === null ? 0 : time - clock0, st = S && S.block === 'brasa' && Number.isFinite(S.t) ? S.t : 0;
    const tb = Math.max(own, st);                                 // (the score's when it runs ahead — a resumed block —, else ours: in a jump its t stays 0)
    const I = introCfg(), introOn = P.introOn !== false;
    nE = 0;

    // ---- the opening: a line of light runs round the room at hand height and stops at the middle of P1; «pum», the first correfoc
    const iP1 = Math.max(0, walls.findIndex((w) => w.id === 'P1')), sStop = hearthS[iP1];
    if (introOn && tb >= I.strip && tb < I.boom) {
      if (!introFired.strip) { introFired.strip = true; events.push('intro:strip'); }
      const u = smoother((tb - I.strip) / Math.max(0.1, I.stop - I.strip));
      const sh = sStop - PER * (1 - u), yy = FOG_H;
      // the head and its tail: the line is drawn as points of the head's recent path (one lap, eased to a stop, then held, then gathered)
      const gather = clamp01((tb - I.stop) / Math.max(0.1, I.boom - I.stop));
      const tid = 'intro', t = TR.get(tid);
      wallPt(sh + Math.sin(tb * 7) * 0.02 * (1 - u), yy + Math.sin(tb * 3.1) * 0.05 * (1 - gather), P3h, _away);
      if (tb < I.boom) trailPoint(tid, P3h, time, tb < I.stop + 0.2, dt, _away, 2.2);
      if (t && tb >= I.stop) t.seen = tb < I.boom;
    }
    // (the pum fires once even if the clock jumped past it — a hidden page, a host that resumes —; far past the run, the four first
    //  flames are lit at once instead)
    if (introOn && tb >= I.boom && !introFired.boom) {
      introFired.boom = true; events.push('intro:boom');
      if (!introFired.strip) { introFired.strip = true; events.push('intro:strip'); }
      if (tb > I.run[1]) { for (let i = 0; i < NW; i++) { target[i] = Math.max(target[i], 0.15); flash[i] = 1; } }
      else {
        wallPt(sStop, FOG_H, P3h, _away);
        emit(260, P3h.x, P3h.y, P3h.z, 0.05, _away.x * 0.3, 0.6, _away.z * 0.3, 1.0, 1.5, 4.5, 0.5, 1.2, 2.2, 0.7, 1.0);
        // the first correfoc: born here, it runs one lap through the four fires in the run window
        const run0 = I.run[0], run1 = I.run[1], lap = Math.max(2, run1 - run0);
        const lane = 1.45, k = (1 + lane / 3.4);
        spawnDevil(sStop, time, { intro: true, lane, dir: 1, speed: (PER / lap) * k, go0: Math.max(0.2, run0 - tb), life: run1 - tb + 0.1 });
      }
    }

    // (a safety net: at the end of the run window every fire has its first flame, whatever happened to the first correfoc)
    if (introOn && introFired.boom && !introFired.lit && tb >= I.run[1] + 0.3) {
      introFired.lit = true;
      for (let i = 0; i < NW; i++) if (target[i] < 0.15) { target[i] = 0.15; flash[i] = 1; events.push('feed:' + i); }
    }

    // ---- (Beltrán: «the room is never a flat colour») a soft bed of embers always rising round the room, from the first frame
    ambAcc += dt * Number(P.ambient ?? 140) * (1 - 0.5 * settle) * (leave >= 0.995 ? 0 : 1);
    while (ambAcc >= 12 && nE < MAXE - 12) {
      ambAcc -= 12; ringPoint(Math.random() * PER, 0.4 + Math.random() * 6.5, _v);
      emit(12, _v.x, 0.02 + Math.random() * 0.3, _v.z, 0.8, (Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3, 0.5, 0.25, 0.8, 2.5, 5.0, 0.9 + Math.random() * 0.6, -0.04, 0.35);
    }

    // ---- hands: a landing calls a correfoc there; a sliding hand trails fire
    // (Beltrán: «the room is always interactive»: in every phase — the opening, the boom, the storm — a hand makes sparks at the palm
    //  the moment it lands, embers while it rests, the line of fire when it slides; a correfoc only when one can be born)
    const hands = input.hands || [];
    for (const h of hands) {
      const s = h.s ?? (cum[h.wall] + (h.u ?? 0.5) * walls[h.wall].width), y = h.y ?? h.pos?.y ?? 1.2;
      if (!handsSeen.has(h.stroke)) {
        handsSeen.set(h.stroke, time);
        wallPt(s, y, P3h, _away);
        emit(70, P3h.x, P3h.y, P3h.z, 0.05, _away.x * 0.4, 0.5, _away.z * 0.4, 0.9, 1.0, 3.2, 0.5, 1.2, 2.0, 0.6, 1.0);   // (the palm's sparks, at once)
        if ((P.devils ?? 1) > 0 && arrive > 0.3 && leave < 0.3) spawnDevil(s, time, { held: true, stroke: h.stroke });
      } else handsSeen.set(h.stroke, time);
      handS.set('h' + h.stroke, s);
      if (P.handFire !== false) { wallPt(s, y, P3h, _away); trailPoint('h' + h.stroke, P3h, time, true, dt, _away); }
    }
    for (const [k, t0] of handsSeen) if (time - t0 > 0.6) { handsSeen.delete(k); for (const dv of devils) if (dv.on && dv.stroke === k) dv.held = false; }
    const heldStrokes = new Set(hands.map((h) => h.stroke));
    for (const dv of devils) if (dv.on && dv.held && !heldStrokes.has(dv.stroke)) dv.held = false;
    flushTrails(time, dt);

    // ---- the correfocs: build up, set off (after the hand lets go), run their lanes, feed the fires they pass, dissolve
    const feedK = Number(P.feed ?? 0.06), introFloor = 0.15;
    let liveN = 0;
    for (const dv of devils) {
      if (!dv.on) continue;
      dv.age += dt;
      dv.k = Math.min(1, dv.k + dt / 0.9);
      if (dv.age > dv.life || leave > 0.3 || storm > 0.25) dv.dis = Math.min(1, dv.dis + dt / 1.6);   // (in the storm they burst into sparks too)
      if (dv.dis >= 1) { dv.on = false; continue; }
      if (dv.dis === 0) liveN++;
      const go = dv.held ? 0 : smoother((dv.age - dv.go0) / 1.0);
      dv.spd = dv.top * go * (1 - dv.dis);
      const tw = ringPoint(dv.s, dv.d, _v);
      dv.s = wrapP(dv.s + dv.dir * dv.spd * dt * tw / (tw + dv.d));
      if (!dv.intro && dv.hopT < 0 && go >= 1 && dv.age > dv.nextHop) { dv.hopT = 0; dv.nextHop = dv.age + 3 + Math.random() * 4; }
      if (dv.hopT >= 0) { dv.hopT += dt; const u = dv.hopT / 0.55; dv.hop = u < 1 ? Math.sin(Math.PI * u) * 0.42 : 0; if (u >= 1) dv.hopT = -1; }
      // feeding: passing a fire (within 0.9 m along the room), once per pass
      if (dv.spd > 1.0 && dv.dis === 0) for (let i = 0; i < NW; i++) {
        if (Math.abs(wrapC(dv.s - sites[i].s)) < 0.9 && time - dv.fedAt[i] > 3) {
          dv.fedAt[i] = time; lastFed[i] = time; flash[i] = 1; feeds++;
          if (dv.intro) target[i] = Math.max(target[i], introFloor);
          else if (boomAt < 0) target[i] = Math.min(1, target[i] + feedK * (1 + 0.6 * (1 - target[i])));
          events.push('feed:' + i);
          // the fire answers: a burst of sparks up from it
          emit(320, sites[i].x, 0.7, sites[i].z, 0.45, 0, 1, 0, 0.5, 3.5, 7.5, 0.8, 1.8, 2.3, 0.28, 0.85);
        }
      }
    }

    // ---- the fires: grow towards their target (slowly: «it grows, and grows»), sink back very slowly when nobody feeds them
    const decay = Number(P.decay ?? 0.004), floorL = introFired.boom ? introFloor * 0.6 : 0;
    for (let i = 0; i < NW; i++) {
      if (boomAt < 0 && time - lastFed[i] > 8) target[i] = Math.max(floorL, target[i] - decay * dt);
      if (boomAt >= 0) target[i] = Math.max(target[i], 0.95);
      lvl[i] += (target[i] - lvl[i]) * (1 - Math.exp(-dt / (target[i] > lvl[i] ? 1.6 : 4.0)));
      flash[i] = Math.max(0, flash[i] - dt / 1.1);                  // (the feed's flare falls back over ~1 s)
    }
    // ---- the boom: when the four burn high enough (or after N feeds), once
    const bAt = Number(P.boomAt ?? 0.72), bFeeds = Number(P.boomFeeds ?? 52);
    if (boomAt < 0 && (introFired.boom || !introOn) && (Math.min(...lvl) >= bAt || feeds >= bFeeds)) {
      boomAt = time; events.push('boom');
      for (let i = 0; i < NW; i++) emit(600, sites[i].x, 0.8, sites[i].z, 0.6, 0, 1, 0, 0.5, 4, 9, 1.0, 2.2, 2.4, 0.25, 0.7);
    }
    const boomK = boomAt < 0 ? 0 : clamp01((time - boomAt) / 3.0);
    if (boomAt >= 0 && !done && time - boomAt > 3.0) { done = true; events.push('done'); }
    // ---- THE STORM (Beltrán 26-11): when the fire is complete the room fills with sparks and flashes, everything else fading under
    // them — the organic handover to the next block. `stormDelay` s after the boom, over `stormRamp` s; 'storm', then 'storm:full'.
    const sT0 = boomAt < 0 ? Infinity : boomAt + Number(P.stormDelay ?? 3.2), sRamp = Math.max(0.5, Number(P.stormRamp ?? 4.0));
    storm = P.storm === false ? 0 : clamp01((time - sT0) / sRamp);
    if (storm > 0 && !stormOn) { stormOn = true; events.push('storm'); }
    if (storm >= 1 && !stormFull) { stormFull = true; events.push('storm:full'); }
    if (storm > 0 && !(toDustNow(leave))) {
      const k = Math.min(MAXE - nE - 8, Math.round(10 + 34 * storm)), total = dt * (6000 + 30000 * storm * storm);
      for (let e = 0; e < k; e++) {
        const sAt = Math.random() * PER, d = Math.random() < 0.35 ? 0.15 + Math.random() * 0.9 : 1 + Math.random() * 7;   // some close: big streaks over the walls
        ringPoint(sAt, d, _v);
        const up = Math.random() < 0.8;
        emit(total / k, _v.x, up ? Math.random() * 1.8 : 3.2 + Math.random() * 1.2, _v.z, 0.6, (Math.random() - 0.5) * 0.8, up ? 1 : -0.4, (Math.random() - 0.5) * 0.8, 0.8,
          1.2 + 2 * storm, 3.5 + 3.5 * storm, 1.2, 2.8, 1.6 + 1.0 * Math.random(), up ? 0.12 : 0.5, 0.55);
      }
      // chispazos: now and then a burst somewhere, bright
      if (Math.random() < dt * (2 + 10 * storm) && nE < MAXE) {
        ringPoint(Math.random() * PER, 0.4 + Math.random() * 4, _v);
        emit(220 + 400 * storm, _v.x, 0.4 + Math.random() * 2, _v.z, 0.1, 0, 0.3, 0, 1.0, 3, 8, 0.5, 1.3, 2.6, 0.4, 1.0);
      }
    }
    const fadeK = smoother(storm) * 0.94, Leff = Math.max(leave, fadeK);

    // ---- THE ENTRY (director 26-11: «within the same world»): our pieces come out of the intro's dust — the fires light one by one
    //      (from P1 round the room, `entryGap` s apart, each over 1.6 s, a little catch of sparks), the water with a long fade
    if (P.entry !== false) {
      const gap = Number(P.entryGap ?? 0.9), first = Number(P.entryAt ?? 0.4), order = [iP1, (iP1 + 1) % NW, (iP1 + 2) % NW, (iP1 + 3) % NW];
      order.forEach((wi, k) => {
        const a = clamp01((tb - first - k * gap) / 1.6); appear[wi] = a * a * (3 - 2 * a);
        if (a > 0.3 && !appearFlag[wi]) { appearFlag[wi] = 1; emit(90, sites[wi].x, 0.25, sites[wi].z, 0.3, 0, 1, 0, 0.7, 1.2, 3.0, 0.6, 1.4, 1.8, 0.4, 1.0); }
      });
      U.water.value = smoother(tb / Math.max(0.5, Number(P.entryWater ?? 6)));
    } else { appear.fill(1); U.water.value = 1; }
    // ---- THE EXIT to dust (leaveTo 'dust', the default): when the host takes us out the sparks don't vanish — they settle (slower,
    //      longer-lived, buoyant, in the tint) into a warm floating dust that is still in the air when the next block arrives, and fades
    //      over `dustTime` s after we are gone. While it does, `part.lingering` is true: keep calling update() and drawing us.
    const toDust = (P.leaveTo ?? 'dust') === 'dust';
    if (toDust && leave > 0.001) {
      if (!dustOn) { dustOn = true; events.push('dust'); }
      settle = Math.min(1, settle + dt / 1.5);
      if (leave >= 0.999) dustT = dustT < 0 ? 0 : dustT + dt;
    } else if (leave <= 0.001) { settle = Math.max(0, settle - dt / 1.5); dustT = -1; dustOn = false; dustGone = false; }
    const dustTime = Math.max(1, Number(P.dustTime ?? 6));
    const dustFade = dustT < 0 ? 0 : smoother(dustT / dustTime);
    lingering = toDust && dustT >= 0 && dustFade < 1;
    if (toDust && dustT >= 0 && dustFade >= 1 && !dustGone) { dustGone = true; events.push('dust:gone'); }
    U.settle.value = settle;
    // the tint the residual dust follows (params.tint: [r, g, b] linear, or a hex string), eased
    {
      const tt = P.tint; let tr = 1, tgc = 0.62, tbc = 0.32;
      if (Array.isArray(tt)) [tr, tgc, tbc] = tt; else if (typeof tt === 'string' || typeof tt === 'number') { const c = new THREE.Color(tt); tr = c.r; tgc = c.g; tbc = c.b; }
      const k = 1 - Math.exp(-dt / 1.5), v = U.tint.value; v.set(v.x + (tr - v.x) * k, v.y + (tgc - v.y) * k, v.z + (tbc - v.z) * k);
    }

    // ---- the fires drawn; the square lit from below by a heat field that follows them; the floor's light is theirs and the devils'
    FIRE.setRingCentre(eye.x, eye.z);
    FIRE.update(dt, time, { level: Array.from(lvl, (v) => v * (1 - Leff)), flash, boom: boomK, appear });
    heatR.fill(0); heatG.fill(0);
    for (let i = 0; i < NW; i++) {
      const c = Math.round(wrapP(sites[i].s) / CELL);
      for (let k = -40; k <= 40; k++) { const j = (c + k + NC) % NC, d = (k * CELL) / 2.4; heatR[j] += lvl[i] * 0.55 * Math.exp(-d * d); heatG[j] += flash[i] * 0.25 * Math.exp(-d * d * 4); }
    }
    for (let j = 0; j < NC; j++) { heatData[j * 4] = Math.min(255, heatR[j] * 255); heatData[j * 4 + 1] = Math.min(255, heatG[j] * 255); }
    heatTex.needsUpdate = true;
    const mean = (lvl[0] + lvl[1] + lvl[2] + lvl[3]) / 4;
    U.level.value = boomAt >= 0 ? Math.min(1, 0.4 + boomK) : mean * 0.5;
    U.plaza.value = Math.min(1, 0.06 + mean * 0.4 + boomK * 0.6 + Number(P.plaza ?? 0));
    U.awake.value = boomAt >= 0 ? Math.sin(Math.PI * Math.min(1, boomK * 1.6)) * 0.6 : 0;
    U.time.value = time % 3000; U.dt.value = dt; U.arrive.value = arrive; U.leave.value = Leff; U.devils.value = Number(P.devils ?? 1);
    U.sparkK.value = (toDust ? (1 - dustFade) : (1 - leave * 0.7)) * (1 + storm * 0.6 * (1 - settle));
    U.seed.value = (U.seed.value + 7919) >>> 0;
    fons?.update(dt, events.includes('boom'));
    DIA.update(dt, time, devils);
    U.nE.value = nE;
    if (sparkCompute) room.renderer.compute(sparkCompute);
    object.visible = arrive > 0.001 && (leave < 0.999 || lingering);
    // (once we are gone only the dust stays drawn)
    { const gone = leave >= 0.995; for (const m of FIRE.meshes) { if (m.userData.vol) m.visible = m.visible && !gone; else m.visible = !gone && !m.userData.off && (m.userData.fire === undefined || appear[m.userData.fire] > 0.003); } if (gone) for (const m of DIA.meshes) m.visible = false; if (fons) { fons.meshes[0].visible = !gone; } if (floorMesh) floorMesh.visible = !gone; if (lineMesh) lineMesh.visible = !gone; }
    if (typeof window !== 'undefined') window.__brasa2 = { progress, devils, lvl, flash, FIRE, feeds: () => feeds, sites, last: { arrive, leave, tb, clock0, block: S?.block, st: S?.t, it: input.t, hands: hands.length, intro: introFired, I, introOn } };
  }
  // ---- the sound's view of the level (brasa2/sound.js): where things are on the walls (wall id, u 0..1 along it), how much
  function wallU(s) {
    s = wrapP(s); let w = NW - 1; for (let i = 0; i < NW; i++) if (s < cum[i] + walls[i].width) { w = i; break; }
    return [walls[w].id, (s - cum[w]) / walls[w].width];
  }
  const SND = { births: [], devils: [], hands: [], fires: [], feeds: [], boom: false, storm: 0, done: false };
  function sound() {
    SND.births = births.map((b) => { const [wall, u] = wallU(b.s); return { wall, u, intro: b.intro }; });
    SND.devils = devils.filter((d) => d.on && d.dis === 0 && d.k > 0.5).map((d) => { const [wall, u] = wallU(d.s); return { wall, u, spd: d.spd, held: d.held }; });
    SND.hands = [];
    for (const [id, t] of TR) if (id[0] === 'h' && t.seen !== false) {
      const sp = t.vel.length(), sH = handS.get(id); if (sH === undefined) continue;
      const [wall, u] = wallU(sH);
      SND.hands.push({ id, wall, u, slide: clamp01((sp - 0.12) / 0.6), speed: sp });
    }
    SND.fires = sites.map((st, i) => ({ wall: walls[i].id, level: lvl[i], flash: flash[i] }));
    SND.feeds = events.filter((e) => e.startsWith('feed:')).map((e) => walls[+e.slice(5)].id);
    SND.boom = events.includes('boom'); SND.storm = storm; SND.done = done;
    return SND;
  }
  const toDustNow = (lv) => (P.leaveTo ?? 'dust') === 'dust' && lv > 0.001;
  function progress() {
    const fires = Array.from(lvl, (v, i) => v + (boomAt >= 0 ? 0.25 * Math.sin(Math.PI * Math.min(1, (prevT - boomAt) / 2)) : 0));
    const bAt = Number(P.boomAt ?? 0.72), bFeeds = Number(P.boomFeeds ?? 52);
    const total = boomAt >= 0 ? 1 : Math.min(0.99, Math.max(Math.min(...lvl) / bAt, feeds / bFeeds));
    return { fires, total, devils: devils.filter((d) => d.on && d.dis === 0).length, feeds, done, boom: boomAt < 0 ? 0 : clamp01((prevT - boomAt) / 3), storm };
  }
  return {
    object, update, progress, reset, sound,
    debug: { setLevel(i, v) { target[i] = v; lvl[i] = v; }, feed(i) { target[i] = Math.min(1, target[i] + Number(P.feed ?? 0.06)); flash[i] = 1; lastFed[i] = prevT; }, devil(s, dir) { return spawnDevil(s, prevT, dir ? { dir } : {}); } },   // (lab: studies and captures)
    get events() { return events; },
    get lingering() { return lingering; },          // (the exit to dust: true while our dust is still in the air after leave = 1)
    setParams(p) { if (p && p !== P) Object.assign(P, p); },
    dispose() { FIRE.dispose(); DIA.dispose(); fons?.dispose(); heatTex.dispose(); tg.dispose(); object.parent?.remove(object); },
  };
}
