// Ressonància — part «tronc3d»: III. Tronc — Equilibri — THE CASTELL AS A PORCELAIN SCULPTURE (ARTE-3 §4, T-049, TRON).
// Contract: ../PARTS.md; GUION.md › III. Previous versions: tronc3d.T049.js.bak (TRO-F's assemblage), tronc3d.TROF.js.bak, …
//
// A real human tower — pinya, folre, baixos … sisens, dosos, acotxador, enxaneta (castell.js's layout, «3 de 9 amb folre») — carved in
// MATTE WHITE PORCELAIN; the only colour is the sashes (faixes) in glazed trencadís. One tower behind each wall of the structure, large
// and centred, lit like a museum piece (a warm broad key from above, a cool rim, a low fill, a soft radial halo behind) on a medium
// blue-grey ground. The bodies are signed distance fields meshed once per page (./tronc3d/sculpt.js, in steps, shared by every
// instance), one mesh per floor, the same geometry for the four towers. Beside each tower, on the wall plane, a fine vertical ruler with
// the floors' real names in mono (BAIXOS · SEGONS · TERÇOS …): each name lights when its floor locks.
//   · LIFT: the forming floor is GRAINS that gather at the band of shoulders (the hands' height, state.band / yMed) and rise with it; at
//     the lock they solidify into porcelain from the bottom up (the dissolve run backwards).
//   · TOUCH: a hand dissolves the porcelain into grains exactly where its ray (eye → hand) meets the sculpture (hover-particle-dissolve:
//     one erosion function for the solid and the grains, evaluated at the REST position; brush 16/s, up 8/s, down 4/s); they come home.
//   · LEAN: the sculpture tilts (lean[w], ±7°, a damped spring) and sheds a stream of grains on the falling side; upright, they return.
//   · WOBBLE: a thin bright crack runs round the top floor; 'steady' closes it, 'slip' lets that floor fall as grains.
//   · walls without a tower: grains drift along the foot of the wall towards the nearest tower; a hand lifts them, a lift sends a burst.
// Quiet zones (text ±1.6 m × 1.75–2.2 m, button ±0.9 m × 0.9–1.6 m at each wall's centre): the sculpture is veiled there (≤ 35 %).
// API (kept from T-032, used by fall3d and baixada3d): collapse({ mode, duration }), restore(), collapsing, takeFloor(i, { tower, hide }),
// giveFloor(i, tower), levels(), impacts, rise. Sound: impacts → 'fx:impact' on the work's BroadcastChannel (notas/ENT.md).
// Outside its own block (baixada, fall) only the floors are drawn (the decor fades in ~1 s).

import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
import { sculpture, NAMES, NL } from './tronc3d/sculpt.js';
import { createBodies } from '../bodykit.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SC = 2.5;           // the sculpture's scale (castell metres → metres)
const TOWER_D = 6.5;       // the tower's axis, m beyond the wall
const FORM_Y = 4.3;        // lift mode: the forming floor's centre (world y): seen at ~2.5 m on the wall, above the guide's text; its grains rise to it from the band
const FORM_Y0 = 4.3;       // without the band (older score): a little higher
const BRUSH_R = 0.22;       // the hand's brush, castell metres (≈ 0.46 m at the tower, ≈ 17 cm on the wall)
const PHRASE = 4.8;        // the study's stand-in phrase (gather → rise → lock)
const BAND_W = 2.6;
const RULER_X = -1.62;     // the rod: seen this far (m on the wall) left of the tower's axis

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, int, positionGeometry, normalGeometry, positionWorld, normalize, mix, smoothstep, clamp,
    max, min, pow, dot, sin, cos, abs, exp, fract, floor, select, length, step, modelViewMatrix, modelWorldMatrix, cameraProjectionMatrix, uv, Fn, If, texture,
  } = TSL;
  const walls = room.walls, NW = walls.length;
  const R = rng(20261124);
  const B = sculpture();
  const object = new THREE.Group(); object.name = 'tronc3d';
  const world = new THREE.Group(); object.add(world);              // the room's rise moves this group (the towers)
  const lone = () => !!ctx.parts && Object.keys(ctx.parts).length === 0;   // fall3d's private tower (parts: {}): floors only
  // 25-11 framing (director): the castell at HUMAN scale, close — its pinya on the floor of the square, the floor line low on the wall,
  // the forming floor in the reach band (1.0–2.0 m on the wall); the room rises with it (M6). fall3d's private tower keeps the old frame.
  const OLD = lone() || P.towerScale === 2.5;
  const SC = P.towerScale ?? (OLD ? 2.5 : 1.0), TOWER_D = P.towerD ?? (OLD ? 6.5 : 1.25);   // 25-11 (AD): the baixos almost life-size, the floor line ≈ 0.45 m on the wall
  const FORM_Y = OLD ? 4.3 : 1.35, FORM_Y0 = OLD ? 4.3 : 1.45;

  // -------------------------------------------------------------------------------------------- shared uniforms
  const uTime = uniform(0), uGain = uniform(1), uDecor = uniform(1), uAway = uniform(0), uLeave = uniform(0);
  const _eyeW = room.eye.clone();

  // -------------------------------------------------------------------------------------------- the towers (one per wall)
  const towers = walls.map((w, i) => {
    const U = {
      brush: uniformArray(Array.from({ length: 4 }, () => new THREE.Vector4(0, -50, 0, 0)), 'vec4'),
      floor: uniformArray(Array.from({ length: NL }, () => new THREE.Vector4(1, 0, -1, 0)), 'vec4'),   // solid, forming, goneT, flash
      lean: uniform(new THREE.Vector4(0, 0, 0, 0)),               // sign, shed (0..1), fall side for the collapse, mode (0 intent · 1 carregat)
      lift: uniform(new THREE.Vector4(0, 0, 0, 0)),               // —, lift shown (0..1), band y (local), forming floor's centre y (local)
      crack: uniform(new THREE.Vector4(-1, 0, 1, 0)),             // floor, open (0..1), side, —
      eyeL: uniform(new THREE.Vector3(0, 1, 8)),
      wc: uniform(w.centre.clone()), wr: uniform(w.right.clone()), wn: uniform(w.normal.clone()),
      beat: uniform(0), veil: uniform(1),
    };
    const g = new THREE.Group(); world.add(g);                    // at the tower's foot, facing the room
    const tilt = new THREE.Group(); g.add(tilt);
    const root = new THREE.Group(); root.scale.setScalar(SC); tilt.add(root);
    g.rotation.y = Math.atan2(w.normal.x, w.normal.z);
    return { w, tw: i, U, g, tilt, root, on: false, solid: [], grain: [], theta: 0, omega: 0, colTilt: 0, dist: TOWER_D, built: 0, brk: 1, cracked: false,
      st: Array.from({ length: NL }, () => ({ solid: 0, forming: 0, lift: 0, goneT: -1, flash: 0, taken: false, gone: false, shown: false })),
      slots: Array.from({ length: 4 }, () => ({ stroke: null, p: new THREE.Vector3(0, -50, 0), tgt: new THREE.Vector3(), amt: 0, want: 0, fresh: true, seen: -9, seenHere: false })) };
  });

  // -------------------------------------------------------------------------------------------- materials
  // the erosion, the same for the solid and the grains (at the REST position p, normal n, noise nz, height in floor hr, floor fl)
  const PORC = vec3(0.8, 0.785, 0.75);
  const ACCENT = vec3(...(room.PALETTE?.tronc?.accent || [0.77, 0.37, 0.025]));
  function exposure(U, p, n, nz, hr, fl) {
    let xb = float(0);
    for (let i = 0; i < 4; i++) {
      const b = U.brush.element(i);
      const d = length(p.sub(b.xyz)).div(BRUSH_R).add(nz.sub(0.5).mul(0.42));
      xb = max(xb, b.w.mul(float(1).sub(smoothstep(0.55, 1.0, d))));
    }
    const fs = U.floor.element(fl);
    const xf = smoothstep(-0.05, 0.05, hr.add(nz.sub(0.5).mul(0.3)).sub(fs.x.mul(1.35).sub(0.17)));   // above the front: still grains
    const sg = U.lean.x, shed = U.lean.y;
    const side = dot(n, vec3(sg, 0, 0)).mul(0.6).add(clamp(p.x.mul(sg).div(0.8), -1, 1).mul(0.4)).add(smoothstep(1.5, 10.5, p.y).mul(0.35)).add(nz.sub(0.5).mul(0.35));
    const xl = smoothstep(float(1.05).sub(shed.mul(0.75)), float(1.15).sub(shed.mul(0.75)), side).mul(step(0.01, shed)).mul(step(0.5, fl.toFloat()));
    const xg = step(0, fs.z);
    const xa = step(nz.mul(0.55).add(float(1).sub(smoothstep(0, 10.8, p.y)).mul(0.45)), uAway.mul(1.08));
    return { x: max(max(xb, xl), max(max(xf, xg), xa)), xl, xg, fs };
  }
  // light: museum recipe in tower space (+z towards the room)
  const KEY = normalize(vec3(0.32, 0.88, 0.5)), RIM_L = normalize(vec3(-0.8, 0.25, -0.55)), RIM_R = normalize(vec3(0.75, 0.35, -0.55)), FILL = normalize(vec3(-0.25, -0.1, 1));
  function glaze(h) {     // trencadís of the faixes: cobalt #2146B0, ochre #E3A32B, white (art direction, round 5)
    return select(h.lessThan(0.45), vec3(0.015, 0.06, 0.43), select(h.lessThan(0.7), vec3(0.77, 0.37, 0.025), vec3(0.85, 0.82, 0.74)));
  }
  const h31 = (q) => fract(sin(dot(q, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  // trencadís on the sash: a cheap 3D cell pattern (2×2×2 neighbourhood) → tile colour and grout
  const tiles = Fn(([p]) => {
    const q = p.mul(26), c = floor(q), f = fract(q);
    const best = vec4(9, 9, 0, 0).toVar();
    for (let k = 0; k < 8; k++) {
      const o = vec3(k & 1, (k >> 1) & 1, (k >> 2) & 1).add(step(vec3(0.5), f).sub(1));
      const cc = c.add(o), jit = vec3(h31(cc), h31(cc.add(17.3)), h31(cc.add(41.7))).mul(0.8).add(0.1);
      const d = length(o.add(jit).sub(f));
      If(d.lessThan(best.x), () => { best.y.assign(best.x); best.x.assign(d); best.z.assign(h31(cc.add(5.1))); }).ElseIf(d.lessThan(best.y), () => { best.y.assign(d); });
    }
    return best;
  });
  function shade(U, p, n, ao, sash, seed, forGrain) {
    const V = normalize(U.eyeL.sub(p));
    const ndv = max(dot(n, V), 0);
    const t = forGrain ? vec4(0.5, 0.9, seed, 0) : tiles(p);
    const grout = forGrain ? float(1) : smoothstep(0.02, 0.07, t.y.sub(t.x));
    const alb = mix(PORC, glaze(t.z).mul(mix(0.25, 1, grout)), sash);
    const wrap = clamp(dot(n, KEY).add(0.15).div(1.15), 0, 1);
    const top = smoothstep(-2, 9, p.y).mul(0.35).add(0.75);      // the key falls from above: brighter up the tower
    const keyC = vec3(1.0, 0.9, 0.78).mul(wrap.mul(1.55)).mul(top);
    const hemi = mix(vec3(0.04, 0.04, 0.05), vec3(0.17, 0.19, 0.24), n.y.mul(0.5).add(0.5));
    const fill = vec3(0.45, 0.52, 0.66).mul(max(dot(n, FILL), 0).mul(0.22));
    const occ = pow(ao, 1.6).mul(0.85).add(0.15);
    let col = alb.mul(keyC.add(hemi).add(fill)).mul(occ);
    const fr = pow(float(1).sub(ndv), 3);
    const rim = vec3(0.62, 0.76, 1.0).mul(fr.mul(max(dot(n, RIM_L), 0).mul(1.1).add(max(dot(n, RIM_R), 0).mul(0.5)))).mul(occ);
    col = col.add(rim);
    shade.rim = rim;
    const Hh = normalize(KEY.add(V)), nh = max(dot(n, Hh), 0);
    col = col.add(vec3(1.0, 0.92, 0.82).mul(pow(nh, mix(26, 110, sash)).mul(mix(0.09, 1.1, sash))).mul(occ).mul(mix(1, grout, sash)));
    col = col.add(mix(vec3(0.1, 0.1, 0.12), vec3(0.4, 0.45, 0.55), n.y.mul(0.5).add(0.5)).mul(fr.mul(0.35).add(0.04)).mul(sash).mul(grout));   // the glaze's reflection
    return col;
  }
  // the quiet zones, measured on the tower's own wall: the ray eye → fragment meets the wall plane at (u, v)
  function veil(U, pw) {
    const e = vec3(_eyeU.x, _eyeU.y, _eyeU.z), d = pw.sub(e);
    const tt = dot(U.wc.sub(e), U.wn).div(min(dot(d, U.wn), -1e-4));
    const hit = e.add(d.mul(tt)), u = abs(dot(hit.sub(U.wc), U.wr)), v = hit.y;
    const box = (hu, v0, v1) => float(1).sub(smoothstep(hu, hu + 0.35, u)).mul(smoothstep(v0 - 0.25, v0, v)).mul(float(1).sub(smoothstep(v1, v1 + 0.25, v)));
    const pool = mix(float(0.42), float(1), smoothstep(0.9, 2.75, v));     // the key's pool: the light falls from above
    return float(1).sub(box(1.6, -1.0, 2.25).mul(U.veil).mul(uQuiet)).mul(mix(float(1), pool, U.veil));
  }
  const _eyeU = uniform(room.eye.clone());
  const uQuiet = uniform(0.84);   // how much the sculpture is shaded behind the guide's quiet zones (T-054: p95 ≤ 35 %)

  function solidMaterial(U) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide });
    const p = positionGeometry, n = normalize(normalGeometry), A = attribute('aAux', 'vec4'), fl = attribute('aFl', 'float').toInt();
    const nz = A.x, ao = A.y, sash = A.z, hr = A.w;
    const E = exposure(U, p, n, nz, hr, fl);
    let col = shade(U, p, n, ao, sash, float(0), false);
    // the hole's lip: a warm, thin edge of light where the porcelain is about to become grains
    const lip = smoothstep(0.28, 0.5, E.x);
    col = col.add(vec3(1.0, 0.86, 0.7).mul(lip.mul(lip).mul(0.55)));
    // the wobble's crack: a thin bright line round the floor
    const ck = U.crack, onF = step(abs(fl.toFloat().sub(ck.x)), 0.5);
    const reach = smoothstep(-0.9, 0.2, p.x.mul(ck.z).add(ck.y.mul(1.6)).sub(0.9));
    const c = abs(hr.sub(0.56).sub(sin(p.x.mul(6.5).add(p.z.mul(4.1))).mul(0.07)).sub(sin(p.x.mul(17).sub(p.z.mul(13))).mul(0.018)));
    const line = float(1).sub(smoothstep(0.004, 0.012, c)).mul(onF).mul(smoothstep(0, 0.25, ck.y)).mul(reach);
    col = mix(col, vec3(4.0, 3.3, 2.5), line);
    col = col.mul(float(1).add(E.fs.w.mul(0.45)));            // the lock's flash
    if (room.flash) {   // «la mano es una linterna» (SIS): the hands' light catches the porcelain's silhouettes near them
      const V = normalize(U.eyeL.sub(p)), rimT = pow(float(1).sub(max(dot(n, V), 0)), 2.5);
      col = col.add(ACCENT.mul(room.flash(positionWorld)).mul(rimT.mul(0.5).add(lip.mul(0.6))).mul(0.5));
    }
    // in the shaded quiet zones the cool rim keeps the silhouettes (thin edges: little area, the p95 stays low)
    const vk = veil(U, positionWorld);
    m.colorNode = col.mul(uGain).mul(vk).add(shade.rim.mul(uGain).mul(float(1).sub(vk)).mul(0.55));
    m.opacityNode = float(1).sub(step(0.5, E.x));
    m.alphaTest = 0.5;
    m.fog = false;
    return m;
  }
  function grainMaterial(U) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const Rr = attribute('aRest', 'vec4'), Nn = attribute('aNrm', 'vec4'), Ax = attribute('aGx', 'vec4'), fl = attribute('aFl', 'float').toInt();
    const p = Rr.xyz, nz = Rr.w, n = Nn.xyz, seed = Nn.w, sash = Ax.x, ao = Ax.y, hr = Ax.z, cls = Ax.w;
    const E = exposure(U, p, n, nz, hr, fl), fs = E.fs;
    const forming = fs.y;
    const ex = smoothstep(0.45, 1.0, E.x).mul(float(1).sub(forming.mul(0.8)));
    const amp = select(cls.lessThan(0.5), float(0.035), select(cls.lessThan(1.5), float(0.12), float(0.34)));
    const t = uTime, s1 = seed.mul(40), s2 = fract(seed.mul(7.3)), s3 = fract(seed.mul(13.7));
    const flow = vec3(sin(t.mul(0.9).add(s1).add(p.y.mul(4))), sin(t.mul(0.7).add(s1.mul(0.6)).add(p.x.mul(4))).mul(0.6).add(0.3), cos(t.mul(0.8).add(s1.mul(0.8)).add(p.z.mul(4))));
    let q = p.add(n.mul(amp.mul(0.5).add(0.025)).mul(ex)).add(flow.mul(amp).mul(ex));
    // the forming floor: gathered flat at the band, rising with it, opening into the figures
    // the forming floor is gathered from grains: they come in on their own delays (seed), loose and low around the top of the tower,
    // and RISE with the band into the figures of the new floor; the lock then turns them to porcelain (below)
    const lift = U.lift.y, hF = U.lift.z;
    // T-054: the grains are drawn INTO the figures early (most are on the silhouette by ~40 % of the lift); the floor as a whole
    // rises the last stretch with the band; only a few loose grains still hang below
    const k = smoothstep(s2.mul(0.3), s2.mul(0.3).add(0.32), lift), kk = k.mul(k).mul(float(3).sub(k.mul(2)));
    const breath = float(1).sub(U.beat.mul(0.05).mul(kk));
    const loose = float(1).sub(kk), sway = vec3(s3.sub(0.5), sin(t.mul(1.1).add(s1)).mul(0.5), seed.sub(0.5)).mul(0.22).mul(loose);
    const fx = p.x.mul(breath), fz = p.z.mul(breath);
    const fy = p.y.sub(float(1).sub(smoothstep(0.0, 1.0, lift)).mul(hF).mul(0.28)).sub(loose.mul(hF).mul(0.3));
    q = mix(q, vec3(fx, fy, fz).add(sway).add(flow.mul(0.012).mul(loose)), forming);
    const formVis = mix(float(1), step(s2, lift.mul(1.5).add(0.1)), forming);
    // leaning: a stream from the falling side (each grain falls, fades, and is home again)
    const ph = fract(t.mul(0.32).add(seed.mul(3.1)));
    const fall = vec3(U.lean.x.mul(ph.mul(0.6).add(0.08)), ph.mul(ph).mul(-2.6), s3.sub(0.5).mul(0.4).mul(ph));
    q = q.add(fall.mul(E.xl));
    let alpha = mix(float(1), float(1).sub(smoothstep(0.6, 1, ph)), E.xl);
    // gone (the collapse, a slip): thrown out, falling, fading
    const gt = max(fs.z, 0), intent = float(1).sub(U.lean.w);
    const v0 = mix(vec3(s2.sub(0.5).mul(0.6), s3.mul(-0.5).sub(0.2), seed.sub(0.5).mul(0.6)),
      vec3(U.lean.z.mul(s2.mul(1.8).add(0.5)), s3.mul(2.0).add(0.5), seed.sub(0.5).mul(1.4)), intent);
    q = q.add(v0.mul(gt).add(vec3(0, gt.mul(gt).mul(-1.5), 0)).mul(E.xg));
    alpha = alpha.mul(float(1).sub(smoothstep(2.4, 4.0, gt).mul(E.xg)));
    // leaving: they rise
    q = q.add(vec3(0, uLeave.mul(seed.mul(2.5).add(0.8)), 0));
    const vis = smoothstep(0.42, 0.58, E.x).mul(alpha).mul(formVis);
    const col = mix(shade(U, p, n, ao, sash, seed, true), mix(PORC.mul(0.62), glaze(seed).mul(0.8), sash), 0.45).mul(float(1.0).add(smoothstep(0.9, 1, s2).mul(0.5))).mul(uGain).mul(veil(U, varying(modelWorldMatrix.mul(vec4(q, 1)).xyz)));
    const size = float(0.016).add(seed.mul(0.012)).mul(mix(float(1), float(0.75), sash));
    const mv = modelViewMatrix.mul(vec4(q, 1));
    const corner = positionGeometry.xy.mul(size.mul(SC));
    m.vertexNode = select(vis.greaterThan(0.02), cameraProjectionMatrix.mul(vec4(mv.xy.add(corner), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const vV = varying(vis), d = uv().sub(0.5);
    m.colorNode = col;
    m.opacityNode = step(dot(d, d), float(0.25)).mul(step(0.5, vV));
    m.alphaTest = 0.5;
    m.fog = false;
    return m;
  }
  for (const t of towers) { t.mS = solidMaterial(t.U); t.mG = grainMaterial(t.U); }

  // -------------------------------------------------------------------------------------------- geometry (once the sculpture is built)
  let built = false;
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const geoS = new Array(NL).fill(null), geoG = new Array(NL).fill(null);
  const LV = Array.from({ length: NL }, () => ({ y0: 0, y1: 1, yc: 0.5, h: 1 }));
  function addFloor(lv) {
    const F = B.floors[lv];
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.BufferAttribute(F.pos, 3));
    gs.setAttribute('normal', new THREE.BufferAttribute(F.nrm, 3));
    gs.setAttribute('aAux', new THREE.BufferAttribute(F.aux, 4));
    gs.setAttribute('aFl', new THREE.BufferAttribute(new Float32Array(F.pos.length / 3).fill(lv), 1));
    gs.setIndex(new THREE.BufferAttribute(F.idx, 1));
    gs.boundingSphere = new THREE.Sphere(new THREE.Vector3(F.cx, (F.y0 + F.y1) / 2, F.cz), F.rad + 0.6);
    const G = F.grains, gg = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'uv']) gg.setAttribute(k, quad.getAttribute(k));
    gg.setIndex(quad.getIndex());
    gg.setAttribute('aRest', new THREE.InstancedBufferAttribute(G.rest, 4));
    gg.setAttribute('aNrm', new THREE.InstancedBufferAttribute(G.nrm, 4));
    gg.setAttribute('aGx', new THREE.InstancedBufferAttribute(G.aux, 4));
    gg.setAttribute('aFl', new THREE.InstancedBufferAttribute(new Float32Array(G.n).fill(lv), 1));
    gg.instanceCount = G.n;
    gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(F.cx, (F.y0 + F.y1) / 2, F.cz), F.rad + 4.5);   // grains travel (lean, collapse)
    geoS[lv] = gs; geoG[lv] = gg;
    Object.assign(LV[lv], { y0: F.y0, y1: F.y1, yc: (F.y0 + F.y1) / 2, h: F.y1 - F.y0 });
    for (const t of towers) {
      const ms = new THREE.Mesh(gs, t.mS), mg = new THREE.Mesh(gg, t.mG);
      ms.visible = mg.visible = false; t.root.add(ms); t.root.add(mg); t.solid[lv] = ms; t.grain[lv] = mg;
    }
  }
  let nAdded = 0;
  // the levels' frame before the build is done (fall3d / baixada may ask): the sculpture's real heights, measured once
  const LV0 = [[0.01, 1.71], [0.01, 1.85], [1.32, 3.22], [2.88, 4.6], [4.27, 5.95], [5.62, 7.27], [6.96, 8.57], [8.29, 9.63], [9.43, 9.99], [9.8, 10.84]];
  LV0.forEach(([a, b], i) => Object.assign(LV[i], { y0: a, y1: b, yc: (a + b) / 2, h: b - a }));
  const TOWER_H = 10.84;

  // -------------------------------------------------------------------------------------------- the backdrop: blue-grey ground + halos
  const halo = uniformArray(walls.map(() => new THREE.Vector4(0, 0, -1, 0)), 'vec4');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), (() => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const d = normalize(positionGeometry);
    let c = mix(vec3(0.016, 0.019, 0.025), vec3(0.042, 0.049, 0.063), smoothstep(-0.45, 0.05, d.y));
    c = mix(c, vec3(0.03, 0.035, 0.046), smoothstep(0.2, 0.9, d.y));
    let h = float(0);
    for (let i = 0; i < NW; i++) { const H = halo.element(i); const a = max(dot(d, H.xyz), 0); h = h.add(exp(float(1).sub(a).mul(-34)).mul(H.w)); }
    c = c.add(vec3(0.07, 0.068, 0.066).mul(h));
    m.colorNode = c.mul(uDecor);
    m.fog = false;
    return m;
  })());
  sky.renderOrder = -10; sky.frustumCulled = false;
  sky.position.copy(room.eye);   // 25-11 (VFX): no own dome any more — the room's sky (setBackground / palette) shows through
  if (!room.sky) object.add(sky);
  // the shared halo (SIS, T-048): one soft disc behind each tower's top (falls back to the sky's own halo)
  if (room.makeHalo && room.placeHalo) for (const t of towers) { t.halo = room.makeHalo({ color: [1, 0.86, 0.7], radius: 6.5, intensity: 0.12 }); object.add(t.halo.mesh); }

  // -------------------------------------------------------------------------------------------- the band of shoulders (wall plane)
  const bands = walls.map((w) => {
    const U = { k: uniform(0), flash: uniform(0), hx: uniform(0), hk: uniform(0) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const q = uv().sub(vec2(0.5, 0.5)).mul(vec2(BAND_W + 0.4, 0.3));               // metres in the band
    const x = abs(q.x), core = float(1).sub(smoothstep(0.003, 0.007, abs(q.y))), glow = exp(q.y.mul(q.y).mul(-5000)).mul(0.16);
    const ends = float(1).sub(smoothstep(BAND_W / 2 - 0.25, BAND_W / 2, x));
    const tick = step(abs(x.sub(BAND_W / 2)), 0.004).mul(step(abs(q.y), 0.045));                   // a fine end mark
    const spot = exp(q.x.sub(U.hx).mul(q.x.sub(U.hx)).mul(-6)).mul(U.hk);
    const I = core.mul(ends).mul(float(0.55).add(spot).add(U.flash.mul(1.2))).add(glow.mul(ends).mul(float(0.6).add(spot).add(U.flash))).add(tick.mul(0.6));
    m.colorNode = vec3(1.0, 0.9, 0.78).mul(I).mul(U.k);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(BAND_W + 0.4, 0.3), m);
    g.renderOrder = 5; g.frustumCulled = false; object.add(g);
    return { g, U, w, y: 0.95, vy: 0, tilt: 0, ox: 0, ax: new THREE.Vector3(), hN: 0, hX: 0, hS: 0 };
  });

  // -------------------------------------------------------------------------------------------- the ruler (wall plane): line, ticks, names
  // part of the sculpture (not the guide's: SIS's rulers live at the wall edges): a fine measuring rod standing beside each tower at its
  // depth, rising with it; its marks and names are sized for the wall (the group is scaled by depth / wall distance every frame)
  const LABEL_H = 0.085, LABEL_W = 0.8;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let labelTex = null;
  function drawLabels(font) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.font = font;
    for (let i = 0; i < NL; i++) { const s = NAMES[i].split('').join(String.fromCharCode(8201)); g.fillText(s, cv.width - 8, i * 64 + 33); }
    if (labelTex) labelTex.needsUpdate = true;
  }
  if (cv) {
    cv.width = 512; cv.height = 64 * NL;
    drawLabels('500 40px ui-monospace, Menlo, Consolas, monospace');
    labelTex = new THREE.CanvasTexture(cv); labelTex.colorSpace = THREE.SRGBColorSpace; labelTex.flipY = false; labelTex.needsUpdate = true;
    try {   // Geist Mono (OFL, scenes3d/fonts), as the guide's labels
      const ff = new FontFace('TroncMono', `url(${new URL('../fonts/geistmono-400.woff2', import.meta.url).href})`);
      ff.load().then((f) => { document.fonts.add(f); drawLabels('400 42px TroncMono, ui-monospace, monospace'); }).catch(() => {});
    } catch { /* system mono */ }
  }
  const labK = Array.from({ length: NL }, () => uniform(0)), labE = new Float32Array(NL);
  const labMats = labK.map((k, i) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const a = labelTex ? texture(labelTex, vec2(uv().x, float(i).add(float(1).sub(uv().y)).div(NL))).a : float(0);
    m.colorNode = vec3(0.86, 0.88, 0.92).mul(a).mul(k);
    return m;
  });
  const lineK = uniform(0);
  const lineMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  lineMat.colorNode = vec3(0.55, 0.6, 0.68).mul(lineK).mul(0.42);
  const tickMat = labK.map((k) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }); m.colorNode = vec3(0.86, 0.88, 0.92).mul(k).mul(0.9); return m; });
  const labGeo = new THREE.PlaneGeometry(LABEL_W, LABEL_H), tickGeo = new THREE.PlaneGeometry(0.1, 0.004), lineGeo = new THREE.PlaneGeometry(0.004, 1);
  lineGeo.translate(0, 0.5, 0);
  const rulers = towers.map((t) => {
    const g = new THREE.Group(); t.g.add(g);
    const line = new THREE.Mesh(lineGeo, lineMat); g.add(line);
    const labs = [], ticks = [];
    for (let i = 0; i < NL; i++) {
      const L = new THREE.Mesh(labGeo, labMats[i]); L.position.x = -LABEL_W / 2 - 0.08; g.add(L); labs.push(L);
      const T = new THREE.Mesh(tickGeo, tickMat[i]); g.add(T); ticks.push(T);
    }
    for (const o of [line, ...labs, ...ticks]) { o.renderOrder = 6; o.frustumCulled = false; }
    return { g, labs, ticks, line };
  });

  // -------------------------------------------------------------------------------------------- the foot of the walls without a tower
  const PER = [], perim = walls.reduce((a, w) => { PER.push(a); return a + w.width; }, 0);
  const wallAt = (s) => { s = ((s % perim) + perim) % perim; for (let i = NW - 1; i >= 0; i--) if (s >= PER[i]) return [i, (s - PER[i]) / walls[i].width]; return [0, 0]; };
  const ND = 700;
  const dS = new Float32Array(ND), dY = new Float32Array(ND), dV = new Float32Array(ND), dL = new Float32Array(ND), dA = new Float32Array(ND), dDir = new Float32Array(ND), dTo = new Float32Array(ND);
  const dPos = new Float32Array(ND * 4);
  const dGeo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'uv']) dGeo.setAttribute(k, quad.getAttribute(k));
  dGeo.setIndex(quad.getIndex());
  const dAttr = new THREE.InstancedBufferAttribute(dPos, 4); dAttr.setUsage(THREE.DynamicDrawUsage); dGeo.setAttribute('aD', dAttr); dGeo.instanceCount = ND;
  const drift = new THREE.Mesh(dGeo, (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const D = attribute('aD', 'vec4'), mv = modelViewMatrix.mul(vec4(D.xyz, 1)), sz = float(0.022);
    m.vertexNode = select(D.w.greaterThan(0.003), cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(sz)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const d = uv().sub(0.5), gl = exp(dot(d, d).mul(-14)), a = varying(D.w);
    m.colorNode = vec3(0.92, 0.88, 0.82).mul(gl).mul(a).mul(uDecor).mul(0.9);
    return m;
  })());
  drift.frustumCulled = false; object.add(drift);
  let dNext = 0;
  function spawnDrift(s, y, to, dir, fast) {
    const i = dNext; dNext = (dNext + 1) % ND;
    dS[i] = s; dY[i] = y; dV[i] = (fast ? 1.6 : 0.35) * (0.7 + R() * 0.6); dL[i] = 0; dA[i] = fast ? 1 : 0.35 + R() * 0.4; dDir[i] = dir; dTo[i] = to;
  }

  // -------------------------------------------------------------------------------------------- sound: impacts on the work's channel
  const impacts = [], impactPool = Array.from({ length: 32 }, () => ({ wall: 0, u: 0.5, force: 0 }));
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function impact(wall, u, force, mat, kind) {
    if (impacts.length < impactPool.length) { const o = impactPool[impacts.length]; o.wall = wall; o.u = u; o.force = force; impacts.push(o); }
    if (!mat || !fxBc || fxN >= 16 || lone() || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = clamp01(u); fxMsg.strength = clamp01(force); fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }

  // -------------------------------------------------------------------------------------------- picking: the ray eye → hand, on the SDF
  const _hit = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _best = new THREE.Vector3();
  function pick(t, handPos, out) {
    _m.copy(t.root.matrixWorld).invert();
    _o.copy(_eyeW).applyMatrix4(_m); _d.copy(handPos).applyMatrix4(_m).sub(_o).normalize();
    // start where the ray passes the tower's near side (the hand is on the wall, the tower ~6 m behind)
    const tc = -(_o.x * _d.x + _o.z * _d.z) / Math.max(1e-4, _d.x * _d.x + _d.z * _d.z);
    let s = Math.max(0, tc - 3.2), minD = 1e9;
    for (let it = 0; it < 90; it++) {
      _p.copy(_o).addScaledVector(_d, s);
      let dd = 1e9;
      for (let lv = 0; lv < NL; lv++) {
        const st = t.st[lv], F = B.floors[lv];
        if (!F || !st.shown || st.taken || st.gone || (st.forming && st.lift < 0.85)) continue;
        if (_p.y < F.y0 - 0.3 || _p.y > F.y1 + 0.3) continue;
        dd = Math.min(dd, F.sdf(_p.x, _p.y, _p.z));
      }
      if (dd > 1e8) dd = 0.15;
      if (dd < minD) { minD = dd; _best.copy(_p); }
      if (dd < 0.004) { out.copy(_p); return 1; }
      s += Math.max(dd * 0.9, 0.008);
      if (s > tc + 3.2) break;
    }
    if (minD < 0.32) { out.copy(_best); return 1 - minD / 0.32; }
    return 0;
  }

  // -------------------------------------------------------------------------------------------- the collapse (fall3d / baixada call it)
  // collapse({ mode: 'intent' | 'carregat', duration = 15 }) — on this sculpture, rescaled to duration (s of a 15 s script):
  //   0–1.6 a tremor grows · 1.6 the crack at the floor that gives (intent ~2/3 up; carregat the first) · intent: 2.4–4 the upper part
  //   leans to one side, from 3 s the floors from the top down to the crack burst into grains thrown out to that side; carregat: from 3 s
  //   the floors fall into grains from the bottom up · ~duration-2.5 → duration: everything fades to black.
  const col = { on: false, t: 0, mode: 'intent', dur: 15, floors: 0, side: 1 };
  let keepFloors = 0;
  function collapse(opt = {}) {
    col.on = true; col.t = 0; col.mode = opt.mode === 'carregat' ? 'carregat' : 'intent'; col.dur = Math.max(4, opt.duration ?? 15);
    col.floors = keepFloors; col.side = R() < 0.5 ? -1 : 1;
    for (const t of towers) { t.colTilt = 0; t.brk = col.mode === 'intent' ? Math.max(1, Math.round(t.built * 0.62)) : 1; t.cracked = false; for (const s of t.st) { s.gone = false; s.goneT = -1; } }
  }
  function restore() { col.on = false; for (const t of towers) { t.colTilt = 0; t.cracked = false; for (const s of t.st) { s.gone = false; s.goneT = -1; s.taken = false; } } }
  function collapseStep(t) {
    const ct = col.t / (col.dur / 15), intent = col.mode === 'intent';
    const amp = smooth(0, 1.6, ct) * (ct < 9 ? 1 : 0);
    t.omega += (Math.sin(time * 31 + t.tw) + Math.sin(time * 17.7)) * amp * 0.0016;
    if (!t.cracked && ct >= 1.6) { t.cracked = true; t.st[t.brk].flash = 1; impact(t.tw, 0.5, 1, 'stone', 'hit'); }
    t.colTilt = intent ? col.side * 0.11 * smooth(2.4, 4.0, ct) : 0;
    t.U.crack.value.set(t.cracked && ct < 3 ? t.brk : -1, t.cracked ? 1 : 0, col.side, 0);
    for (let lv = 0; lv <= t.built; lv++) {
      const s = t.st[lv]; if (s.gone || s.taken) continue;
      const at = intent ? (lv >= t.brk ? 3 + (t.built - lv) * 0.45 : 99) : 3 + lv * 0.3;
      if (ct < at) continue;
      s.gone = true; s.goneT = 0; s.flash = Math.max(s.flash, 0.5);
      impact(t.tw, 0.5, 0.7, 'ceramic', 'break');
    }
  }

  // -------------------------------------------------------------------------------------------- per-frame state
  const _v = new THREE.Vector3(), _e = new THREE.Euler();
  let time = 0, rise = 0, riseV = 0, floorsPrev = -1, reward = 0, pull = 0, decor = 1, wasIn = true, snapNext = false;

  // -------------------------------------------------------------------------------------------- THE BODIES (STUDIO NIGHT 25-11, plan 05 M3/M4)
  // The castell is made of the body kit (../bodykit.js): the same solid ceramic castellers as the Pinya, in porcelain, standing on the
  // floor of the square with their shadows. The sculpture (sculpt.js) still runs underneath for everything else — its grains (the
  // forming floor, the hands' dissolve, the shed of a lean), its levels (rise, rulers, levels() for fall3d / baixada3d) and its collapse
  // (fall3d: while the castell falls the porcelain sculpture is shown, it is what breaks) — but its solid meshes are not drawn.
  // Layout in castell metres (× SC in the tower's frame, like the sculpture): a pinya of three rings + a folre, a tronc of three per tier,
  // the dosos, the acotxador, the enxaneta. Mode (setMode): build (Tronc) · top (Pom: the same castell) · crowned (the enxaneta's arm up) · down.
  const CAST = [], CLV = [], TRUNK = [];      // CLV: the bodies' own levels (y0, y1 in castell metres), for levels() in the human-scale mode
  {
    const r3 = rng(4401);
    // 25-11 (Art Director): the lower floors life-size in the foreground, the tower growing to ~3.4 m on the wall by COMPRESSING the
    // upper floors (a forced perspective: each tier ×PERSP), never shrinking the whole tower; no room-rise in this mode
    const PERSP = OLD ? 1 : 0.58;   // the whole 9-floor castell fits ≤ 3.4 m on the wall
    const tier = [1.05, 1.02, 1.02, 1.02, 1.02, 1.02].map((v, L) => v * Math.pow(PERSP, L));
    let feet = 0;
    for (let L = 0; L < 6; L++) {
      const s = tier[L], R0 = 0.33 * Math.max(0.55, s);
      TRUNK[L + 1] = { y: feet, r: R0 + 0.18 * s, h: 1.342 * s };
      // each casteller a little different (yaw, size, build, how much they carry): no repeated beads
      for (let j = 0; j < 3; j++) { const a = Math.PI / 2 + (j * TAU) / 3, jy = (r3() - 0.5) * 0.3, js = 1 + (r3() - 0.5) * 0.16;   // height ±8 %
        CAST.push({ lv: L + 1, x: Math.cos(a) * R0, z: Math.sin(a) * R0, y: feet, yaw: Math.atan2(Math.cos(a), Math.sin(a)) + jy, pose: 'lock', pose2: 'carry', mixV: 0.1 + r3() * 0.3, s: s * js, build: (L + j) % 2 }); }
      feet += 1.342 * s + 0.03;
    }
    const pd = Math.pow(PERSP, 6), pa = Math.pow(PERSP, 7), pe = Math.pow(PERSP, 8);
    // the pom de dalt is not compressed below a readable size (AD: the enxaneta's raised arm reads at the top, ≤ 3.4 m)
    const sD = OLD ? 0.8 : Math.max(0.8 * pd, 0.18), sA = OLD ? 0.66 : Math.max(0.66 * pa, 0.16), sE = OLD ? 0.62 : Math.max(0.62 * pe, 0.18);
    for (const sg of [-1, 1]) CAST.push({ lv: 7, x: sg * 0.17 * Math.max(0.5, sD / 0.8), z: 0, y: feet, yaw: Math.atan2(-sg, 0), pose: 'lock', s: sD, build: 1 });
    const dsY = feet + 1.286 * sD + 0.03 * sD;
    CAST.push({ lv: 8, x: 0, z: -0.06 * sA, y: dsY, yaw: 0, pose: 'carry', s: sA, build: 2 });
    CAST.push({ lv: 9, x: 0, z: -0.02 * sE, y: OLD ? Math.max(dsY + 0.42, 9.8) : dsY + 0.62 * sA, yaw: 0, pose: 'stand', pose2: 'raise', s: sE, build: 2, enx: true });
    TRUNK[7] = { y: feet, r: 0.3 * sD / 0.8, h: 1.286 * sD }; TRUNK[8] = { y: dsY, r: 0.2 * sA / 0.66, h: 1.36 * sA }; TRUNK[9] = { y: dsY + 0.62 * sA, r: 0.15 * sE / 0.62, h: 1.7 * sE };
    for (const c of CAST) { const L = CLV[c.lv] || (CLV[c.lv] = { y0: 1e9, y1: -1e9 }); L.y0 = Math.min(L.y0, c.y); L.y1 = Math.max(L.y1, c.y + 1.7 * c.s); }
    const ringN = OLD ? [10, 16, 22] : [9];       // human scale: one ring, no folre — the trunk must read above it (AD)      // two tight rings (+ the folre): the splat budget goes to the tower
    for (let i = 0; i < ringN.length; i++) {
      const rad = (OLD ? 0.73 : 0.95) + i * 0.44 + 0.1, off = 0.31 + i * 0.17;
      for (let j = 0; j < ringN[i]; j++) {
        const a = off + ((j + (r3() - 0.5) * 0.2) * TAU) / ringN[i], s = 0.94 + r3() * 0.1, rr = rad + (r3() - 0.5) * 0.05;
        CAST.push({ lv: 0, x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: 0, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: 'carry', s, build: r3() < 0.5 ? 0 : 1, ring: i });
        if (i === 0 && OLD) { const rf = rr - 0.04; CAST.push({ lv: 0, x: Math.cos(a) * rf, z: Math.sin(a) * rf, y: 1.313 * s + 0.03, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: 'carry', s: 0.95, build: 0, folre: true }); }
      }
    }
  }
  const bodies = P.bodies !== false && !lone();   // fall3d's private tower (parts: {}) falls as the sculpture: no bodies there
  const kit = bodies ? createBodies({ THREE, TSL, room, max: Math.min(400, CAST.length * Math.min(NW, 4)), lods: [1, 2], spots: ctx.parts?.plaza?.spots || null }) : null;   // the square's stage spots light the bodies in their beams
  if (kit) {
    world.add(kit.object);
    const fx = kit.tok('faixa'), pl = kit.tok('pedra-llum'), soft = fx.map((v, i) => v * 0.68 + pl[i] * 0.32);   // the faixa a little chalked by the light
    kit.setColors({ shirt: 'porcellana', skin: ['pedra-llum', 1.02], trousers: ['pedra-llum', 0.82], faixa: soft, hair: ['tinta-ombra', 1.6], crack: 'pedra-llum', shadow: 'tinta-ombra' });
    kit.uniforms.crack.value = 0.55;
    kit.setSplat({ lit: 'cal-foc', half: 'terracota', amb: 'tinta-ombra', contact: 1, backAO: 1 });   // the one warm ramp (AD); dark gaps where the floors meet
  }
  let lightMode = '', breathK = 0, crownT = 0, crownK = 0;
  let castMode = 'build', focusY = null;
  function setMode(m) { castMode = m || 'build'; if (castMode !== 'top') focusY = null; }
  // setFocusY(y): y in metres above the plaza floor (the tower unrisen, e.g. trunk(f).yRest): the world lowers (≤ 0.30 m/s) so that
  // height sits at the eye's level, in the reach band; null gives the ground back
  function setFocusY(y) { focusY = y == null ? null : +y; }
  const _bp = new THREE.Vector3();
  function placeBodies(dt, inTronc, floorsNow, withScore) {
    if (!kit) return;
    for (const t of towers) for (const s of t.st) s.takenT = s.taken ? (s.takenT || 0) + dt : 0;
    crownT = castMode === 'crowned' ? crownT + dt : 0;   // the crown: gold runs DOWN from the enxaneta, floor by floor (0.5 s each)
    // against the luminous gold air the tower must be a dark-and-gold sculpture: denser, a dark rim, the shadow side to bronze
    { const cw = castMode === 'crowned' ? 1 : 0; crownK += (cw - crownK) * Math.min(1, dt * 1.5); kit.setSplat({ darkRim: 0.9 * crownK, opacity: 1 + 0.5 * crownK }); }
    const lm = withScore ? 'scene' : 'self'; if (lm !== lightMode) { lightMode = lm; kit.setLighting(lm); }
    let n = 0;
    const crowned = castMode === 'crowned';
    for (const t of towers) {
      const visT = t.on && t.g.visible, ringOnly = !visT && inTronc && !OLD && !col.on;   // a wall without a tower shows its pinya ring
      const phi = Math.atan2(t.w.normal.x, t.w.normal.z), cp = Math.cos(phi), sp = Math.sin(phi), th = visT ? t.theta : 0, ct = Math.cos(th), st = Math.sin(th);
      if (!visT) t.g.position.copy(t.w.centre).addScaledVector(t.w.normal, -TOWER_D).setY(0);
      for (const c of CAST) {
        const i = n++; if (i >= kit.count) break;
        if ((!visT && !(ringOnly && c.lv === 0)) || col.on) { kit.hide(i); continue; }
        const S = t.st[c.lv];
        if (castMode === 'top' && c.lv >= 7) { kit.hide(i); continue; }      // the Pom draws its climbers (Interacción); crowned: shown again
        // the bajada (Art Director): a floor taken by baixada3d does not vanish — its bodies dissolve into light (≈ 2.5 s)
        const tk = S.taken ? (S.takenT || 0) : 0;
        const shown = c.lv === 0 || (S.shown && (!S.taken || tk < 2.5) && (S.solid > 0.001 || S.forming || S.goneT >= 0 || S.taken));
        if (!shown || (S.goneT >= 1.6)) { kit.hide(i); continue; }
        // a floor that forms climbs into place with the lift; one that slips drops and goes
        // particles: a forming floor ASSEMBLES from streams (with the lift), a slipping one falls as dust; no body moves as a block
        let dy = 0, form = 1, fmode = 'gather';
        if (c.lv > 0 && S.forming && S.solid < 1) { form = Math.min(1, S.lift * 0.8 + S.solid * 0.6); dy = -(1 - form) * 0.15; }   // the next floor gathers only as the hands lift it   // the next floor hovers half-formed until the hands lift it
        if (S.goneT >= 0) { form = Math.max(0, 1 - S.goneT / 1.4); fmode = 'dust'; }
        if (S.taken) { form = Math.max(0, 1 - tk / 2.5); fmode = 'light'; }
        if (c.lv === 0) form = 0.97 + 0.03 * Math.sin(time * 0.4 + c.x * 3 + c.z * 2);   // the pinya's mass breathes
        const sw = c.lv > 0 && !OLD ? Math.sin(time * 0.45 + t.tw * 1.7) * 0.012 * Math.min(1, c.y / 3) : 0;   // the trunk sways, 1–2 cm, slowly
        const lx = (c.x + sw) * SC, ly = (c.y + dy) * SC, lz = c.z * SC;
        const tx = lx * ct - ly * st, ty = lx * st + ly * ct;                       // the lean (tower frame, about its z)
        _bp.set(t.g.position.x + cp * tx + sp * lz, ty, t.g.position.z - sp * tx + cp * lz);
        // the pinya opens towards the room: nobody of it stands in front of (or on) the wall plane — the audience is its front
        if (c.lv === 0 && (_bp.x - t.w.centre.x) * t.w.normal.x + (_bp.z - t.w.centre.z) * t.w.normal.z > -0.3) { kit.hide(i); continue; }
        const away = uAway.value;
        // arrive / leave: the particles gather / scatter (form below), no block movement
        const pose2 = c.enx ? (crowned ? 'raise' : 'stand') : c.pose;
        kit.set(i, { pos: [_bp.x, _bp.y, _bp.z], yaw: phi + c.yaw, pose: c.pose, pose2: c.enx ? pose2 : (c.pose2 || c.pose), mix: c.enx ? (crowned ? 1 : 0) : (c.lv > 0 && S.forming && S.solid < 0.5 ? 1 : (c.mixV || 0)),
          form: form * (1 - uAway.value), fmode, lod: c.lv > 0 && c.lv <= 3 ? 'mid' : 'far', scale: c.s * SC,   /* the trunk in mid detail (9k splats): it must read as bodies */ build: c.build, glow: crowned ? Math.min(1, Math.max(0, (crownT - (9 - c.lv) * 0.4) / 0.6)) * (c.enx ? 1.6 : 1) : S.flash * 0.35, tint: c.tint || (c.tint = [0.9 + 0.1 * ((c.x * 13.7 + c.z * 7.1 + c.lv) % 1 + 1) % 1, 0, 0].map((v, k, a) => a[0] * (k === 2 ? 0.985 : 1))) });
      }
    }
    for (let i = n; i < kit.count; i++) kit.hide(i);
    kit.update(dt);
  }
  let beat = 0, liftHold = 0, liftOn = false, liftP = 0, standDrop = 0, wobPrev = false, wobWall = -1;
  const wob = { on: false, t: 0, side: 1, lv: -1, close: 0 }, slip = { lv: -1, t: 0 };
  const plazaPrev = new Float32Array(NW), plazaCool = new Float32Array(NW);

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.05);
    time = input.time ?? time + dt; uTime.value = time % 1000;
    impacts.length = 0; fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    // ---- the build (once per page, shared): ~7 ms a frame until done; each floor appears when it is meshed
    if (!built) {
      B.step(7);   // (a no-op while the worker builds)
      while (nAdded < NL && B.floors[nAdded]) addFloor(nAdded++);
      if (nAdded === NL) built = true;
    }
    const pr = input.params || P, S = input.state || null;
    if (!S && pr.collapse && pr.collapse !== 'off' && !col.on && floorsPrev >= 0 && time > 2) collapse({ mode: pr.collapse, duration: pr.collapseDur ?? 15 });
    if (!S && (!pr.collapse || pr.collapse === 'off') && col.on) restore();
    uGain.value = (pr.gain ?? 1) * (col.on ? 1 - smooth(col.dur - 2.5, col.dur, col.t) : 1);
    _eyeW.copy(room.eye); object.updateMatrixWorld(); _eyeU.value.copy(room.eye);
    uQuiet.value = Math.min(1, Math.max(0, pr.quiet ?? 0.84));

    // ---- the score (or the study's stand-in)
    let floors, prog, structure, rewarding;
    if (S) { floors = S.floors || 0; prog = S.floorProgress || 0; rewarding = S.phase === 'reward' && S.block === 'tronc'; structure = S.walls; }
    else {
      if (pr.cycle > 0) { const c = (time % pr.cycle) / pr.cycle, x = c * 10.5; floors = Math.min(9, Math.floor(x)); prog = x - Math.floor(x); }
      else { floors = pr.floors >= 0 ? Math.round(pr.floors) : Math.round(9 * clamp01(input.progress ?? pr.progress ?? 0)); prog = pr.floorProgress ?? 0.4; }
      rewarding = !!pr.reward; structure = null;
    }
    liftOn = S ? (Array.isArray(S.yMed) && pr.lift !== false) : pr.lift !== false;
    if (liftOn && !S) {
      const ph = (time % PHRASE) / PHRASE;
      prog = (pr.liftAt ?? -1) >= 0 ? pr.liftAt : smooth(0.2, 0.72, ph);
      if (pr.cycle > 0) floors = Math.min(9, Math.floor((time % (PHRASE * 10)) / PHRASE));
    }
    if (!S) floors -= standDrop;
    floors = Math.max(0, Math.min(9, floors | 0)); if (floors >= 9) prog = 0;
    if (liftOn && S && Array.isArray(S.liftK)) {
      let sum = 0, n = 0; for (let w = 0; w < S.liftK.length; w++) if (!S.walls || S.walls[w]) { sum += S.liftK[w] || 0; n++; }
      const target = n ? sum / n : 0, held = S.phrase === 'lock' ? Math.max(liftHold, target) : target;
      liftHold = S.phrase === 'gather' ? target : held; liftP = held;
    } else liftP = liftOn ? prog : 0;
    beat = S ? (S.beat || 0) : (time % 2.4) / 2.4;
    const playing = S ? S.block === 'tronc' && S.phase === 'play' : !pr.reward;
    const inTronc = !S || S.block === 'tronc';
    { const want = inTronc && pr.decor !== false && !(!S && lone()) ? 1 : 0; decor += (want - decor) * ease(4, dt); if (Math.abs(want - decor) < 0.004) decor = want; uDecor.value = decor; }
    if (S && inTronc && !wasIn && col.on) restore();
    if (col.on) { floors = col.floors; prog = 0; rewarding = false; }
    else if (!inTronc) {
      // a late entry (a jump to the Pom, a join after the Tronc): the castell stands at the group's height at once (≥ 5 floors)
      if ((castMode === 'top' || castMode === 'crowned') && keepFloors < 5) keepFloors = Math.min(9, Math.max(5, (S && S.castell && S.castell.floors) || 0));
      floors = keepFloors; prog = 0; rewarding = false;
    }
    else keepFloors = floors;
    if (col.on) col.t += dt;
    const arrive = clamp01(S ? (input.arrive ?? 1) : (input.arrive ?? pr.arrive ?? 1));
    const leave = clamp01(S ? (input.leave ?? 0) : (input.leave ?? pr.leave ?? 0));
    uAway.value = Math.max(1 - arrive, leave); uLeave.value = leave;
    reward += ((rewarding ? 1 : 0) - reward) * ease(0.5, dt);
    const nw = Math.max(1, Math.min(NW, Math.round(pr.walls ?? NW)));
    const reset = floors < floorsPrev - 1 && inTronc && !col.on;
    const forming = inTronc && liftOn && playing && !col.on && floors < 9 && !lone();

    // ---- the wobble: 'wobble' → the crack opens round the top floor, the tower trembles and leans; 'steady' closes it; 'slip' drops it
    { const ev = input.events || [], has = (x) => ev.includes && ev.includes(x);
      let start = has('wobble'), steady = has('steady'), slipE = has('slip');
      if (!S) { const on = !!pr.wobble; if (on && !wobPrev) { start = true; standDrop = 0; } wobPrev = on; if (wob.on && wob.t > 5) { if ((pr.wobbleEnd || 'steady') === 'slip') slipE = true; else steady = true; } if (!on && standDrop && slip.lv < 0) standDrop = 0; }
      if (S) { const on = (S.wobble || 0) > 0; if (on && !wob.on) start = true; if (!on && wob.on && !steady && !slipE) wob.on = false; }
      if (S && (S.wobbleWall ?? -1) >= 0) wobWall = S.wobbleWall;
      if (start && !wob.on && inTronc && floors >= 1) { wob.on = true; wob.t = 0; wob.side = R() < 0.5 ? -1 : 1; wob.lv = floors; for (const t of towers) if (t.on && (!S || t.tw === wobWall)) impact(t.tw, 0.5, 0.9, 'ceramic', 'break'); }
      if (wob.on) wob.t += dt;
      if (steady && (wob.on || S)) { wob.on = false; for (const t of towers) if (t.on && (!S || t.tw === wobWall)) { for (let lv = 0; lv <= floors; lv++) t.st[lv].flash = Math.max(t.st[lv].flash, 0.5); impact(t.tw, 0.5, 1, 'stone', 'floor'); } }
      if (slipE && (wob.on || S)) {
        const lv = wob.on ? wob.lv : floors; wob.on = false;
        if (!S) standDrop = 1;
        if (lv >= 1 && slip.lv < 0) { slip.lv = lv; slip.t = time; for (const t of towers) if (t.on) { t.st[lv].goneT = 0; t.st[lv].gone = true; impact(t.tw, 0.5, 1, 'ceramic', 'break'); } }
      }
      if (slip.lv >= 0 && time - slip.t > 2.6) { for (const t of towers) { const s = t.st[slip.lv]; s.gone = false; s.goneT = -1; s.solid = 0; } slip.lv = -1; }
      wob.close = wob.on ? Math.min(1, wob.close + dt / 1.2) : Math.max(0, wob.close - dt / 0.8);
    }

    // ---- the rise: the room climbs with the forming floor (lift: the forming floor sits at the hands); reward: drawn back, all of it
    const fl = Math.min(NL - 1, floors + 1), riseOn = OLD ? (pr.rise ?? 1) : 0;   // human scale: the tower is framed by its forced perspective, the room does not rise
    let target = (LV[fl].yc * SC - (liftOn ? FORM_Y : FORM_Y0)) * riseOn;
    pull += ((rewarding || (leave > 0 && pull > 0.01) ? 1 : 0) - pull) * ease(0.6, dt);
    if (pull > 0.001) target += (TOWER_H * SC * 0.5 - 1.2 - target) * smooth(0, 1, pull);
    target = Math.max(0, target);                     // 25-11 (director): the world only goes DOWN (the room rises); never up, never floating
    if (focusY != null && !OLD && !col.on) {
      target = Math.max(0, focusY - (room.eye.y || 1.6));
      if (target > 0.01) target = Math.max(target, 0.75);      // never a base hanging mid-wall: lowered at all, it leaves through the bottom edge
    }   // Pom: the climbed floor in the reach band (setFocusY)
    else if (!inTronc || col.on) target = rise;
    // entering / reset: the room starts on the ground and eases (≤ 0.30 m/s) to its height — a snap only when asked (fall3d) or at 0
    if (snapNext || ((reset || floorsPrev < 0 || (inTronc && !wasIn)) && target < 0.01)) { rise = target; riseV = 0; snapNext = false; }
    else if (floorsPrev < 0 || (inTronc && !wasIn)) { rise = Math.max(0, Math.min(rise, target)); riseV = 0; }
    wasIn = inTronc;
    { const vmax = 0.30, acc = 0.3, want = Math.max(-vmax, Math.min(vmax, (target - rise) * 0.7)); riseV += Math.max(-acc * dt, Math.min(acc * dt, want - riseV)); rise += riseV * dt; }
    world.position.y = -rise;

    // ---- hands per wall
    for (const b of bands) { _e.set(0, Math.atan2(b.w.normal.x, b.w.normal.z), 0, 'YXZ'); b.ax.set(1, 0, 0).applyEuler(_e); b.hN = 0; b.hX = 0; b.hS = 0; }
    const hands = input.hands || [];
    for (const h of hands) { const b = bands[h.wall ?? 0]; if (!b || !h.pos) continue; b.hN++; b.hX += _v.copy(h.pos).sub(b.w.centre).dot(b.ax); b.hS += h.u ?? 0.5; }
    const evL = input.events || [], liftE = inTronc && evL.includes && evL.includes('lift');

    // ---- per tower
    const showT = (i) => (!OLD ? true : structure ? !!structure[i] : i < nw);   // 25-11 (AD): the castell on every wall, same hierarchy
    for (const t of towers) {
      t.on = showT(t.tw);
      const U = t.U;
      t.g.visible = t.on;
      if (!t.on) continue;
      if (reset) for (const s of t.st) { s.solid = 0; s.goneT = -1; s.gone = false; }
      if (S && inTronc) for (const s of t.st) s.taken = false;   // in its own block the tower is always its own
      t.built = floors;
      // the floors' states
      for (let lv = 0; lv < NL; lv++) {
        const s = t.st[lv];
        s.flash *= Math.exp(-dt * 2.2);
        if (s.goneT >= 0) s.goneT += dt;
        const isForm = forming && lv === floors + 1 && s.goneT < 0;
        if (lv <= floors) {
          if (s.forming && !s.locking) { s.locking = true; s.flash = 1; impact(t.tw, 0.5, 0.8, 'ceramic', 'floor'); if (bands[t.tw]) bands[t.tw].U.flash.value = 1; }
          if (s.solid < 1) {
            if (s.forming || floorsPrev < 0 || reset || !inTronc || col.on || lone() || !liftOn) {
              s.lift += (1 - s.lift) * ease(9, dt);
              if (s.forming) { if (s.lift > 0.97) s.solid = Math.min(1, s.solid + dt / 1.1); } else s.solid = Math.min(1, s.solid + dt / 1.1);
              if (floorsPrev < 0 || reset || (!inTronc && !col.on) || snapNext) s.solid = 1;
            } else s.solid = Math.min(1, s.solid + dt / 1.1);
            if (s.solid >= 1) { s.forming = 0; s.lift = 1; s.locking = false; }
          } else { s.forming = 0; s.lift = 1; }
          s.shown = true;
        } else if (isForm) {
          s.solid = 0; s.forming = 1; s.lift += (liftP - s.lift) * ease(10, dt); s.shown = true;
        } else if (s.goneT >= 0 && s.goneT < 4.2) { s.shown = true; }
        else { s.solid = 0; s.forming = 0; s.lift = 0; s.shown = false; }
        if (lv === 0) { s.solid = 1; s.shown = true; s.forming = 0; }
        if (s.goneT >= 4.2 && col.on) s.shown = false;
        U.floor.array[lv].set(s.solid, s.forming, s.goneT, s.flash);
        const vis = s.shown && !s.taken && built && !!t.solid[lv];
        if (t.solid[lv]) { t.solid[lv].visible = vis && s.solid > 0.001 && s.goneT < 0 && (!kit || col.on); t.grain[lv].visible = vis && (!kit || col.on || (OLD && ((s.forming && s.solid < 1) || s.goneT >= 0 || t.U.lean.value.y > 0.05))); }
      }
      // the lean: a damped spring towards lean·7°, weak trembles it
      let lean = S ? (S.lean?.[t.tw] || 0) : (pr.lean ?? 0) * (t.tw % 2 ? -1 : 1);
      let weak = S ? (S.weak?.[t.tw] || 0) : (pr.weak ?? 0);
      if (liftOn && !S && Math.abs(pr.level ?? 0) > 0.01) lean = clamp01(Math.abs(pr.level) / 0.35) * Math.sign(pr.level);
      const wobHere = wob.on && (!S || t.tw === wobWall);
      if (wobHere) { if (!S) lean = wob.side * smooth(0, 1.2, wob.t) * 0.9; weak = 3; }
      if (!inTronc || col.on) { lean = 0; weak = 0; }
      if (col.on) collapseStep(t);
      const tgt = col.on ? t.colTilt : -lean * 0.122 * (1 - reward * 0.6);
      t.omega += ((tgt - t.theta) * 5.0 - t.omega * 1.3) * dt + (weak / 3) * (Math.sin(time * 17.3 + t.tw) * 0.9 + Math.sin(time * 29.1 + t.tw * 2) * 0.6) * 0.004;
      t.theta += t.omega * dt;
      const shed = 0.75 * clamp01((Math.abs(t.theta) / 0.122 - 0.18) / 0.82) * (inTronc && !col.on ? 1 : 0);
      U.lean.value.x += ((t.theta < 0 ? 1 : -1) - U.lean.value.x) * ease(6, dt);    // the falling side (tower +x is the wall's right)
      U.lean.value.y += (shed - U.lean.value.y) * ease(shed > U.lean.value.y ? 3 : 1.5, dt);
      U.lean.value.z = col.side; U.lean.value.w = col.mode === 'carregat' ? 1 : 0;
      if (!col.on) U.crack.value.set(wob.close > 0.001 && (wobHere || (!wob.on && wob.lv >= 0)) ? wob.lv : -1, wob.close, wob.side, 0);
      // the tower's frame
      t.dist = TOWER_D + 16 * smooth(0, 1, pull);
      t.g.position.copy(t.w.centre).addScaledVector(t.w.normal, -t.dist).setY(0);
      t.tilt.rotation.z = t.theta;
      // the lift: band height (local), the forming floor's centre
      const b = bands[t.tw], dW = Math.max(0.5, -_v.copy(t.w.centre).sub(room.eye).dot(t.w.normal)), dT = dW + t.dist;
      const bandW = room.eye.y + ((b ? b.y : 1) - room.eye.y) * (dT / dW);             // the band, seen from the eye, at the tower's depth
      U.lift.value.set(0, t.st[fl]?.lift ?? 0, LV[fl].h, LV[fl].yc);
      U.beat.value = forming ? Math.max(Math.exp(-beat * 7), smooth(0.7, 1, beat)) : 0;
      U.veil.value = decor;
      // halo: behind the upper part of what stands
      if (t.halo) { _v.copy(t.g.position).setY((LV[fl].yc + 0.5) * SC - rise); room.placeHalo(t.halo, _v, 2.5); t.halo.set({ intensity: 0.12 * (0.7 + 0.3 * reward) * decor * (1 - uAway.value * 0.5) }); t.halo.mesh.visible = decor > 0.01; }
      else { const hy = Math.max(2.6, room.eye.y + 1.2); _v.copy(t.g.position).setY(hy).addScaledVector(t.w.normal, -4).sub(room.eye).normalize(); halo.array[t.tw].set(_v.x, _v.y, _v.z, (0.6 + 0.4 * reward) * decor); }
    }
    // a wall without a tower keeps the same soft halo (round 5: no empty grey wall)
    const anyOn = towers.some((t) => t.on);
    for (const t of towers) if (!t.on) {
      halo.array[t.tw].w = 0;
      if (t.halo) { _v.copy(t.w.centre).addScaledVector(t.w.normal, -TOWER_D).setY(4.2); room.placeHalo(t.halo, _v, 2.5); t.halo.set({ intensity: 0.07 * decor * (1 - uAway.value * 0.5) * (inTronc && anyOn ? 1 : 0) }); t.halo.mesh.visible = decor > 0.01 && inTronc && anyOn; }
    }
    object.updateMatrixWorld();

    // ---- brushes: the hands on a tower's wall, picked on the sculpture
    for (const t of towers) {
      // LiDAR (10 Hz, missed readings, a new id after a miss): a slot keeps its brush ~0.3 s after its hand is last seen and is let go
      // after 0.6 s; a new stroke that lands where a recent one was takes over its slot quietly (no new sound, no dip)
      for (const sl of t.slots) { sl.seenHere = false; if (time - sl.seen > 0.3) sl.want = 0; }
      if (t.on && built && !col.on && !lone()) {
        for (const h of hands) {
          if ((h.wall ?? -1) !== t.tw || !h.pos) continue;
          const k = pick(t, h.pos, _hit);
          let sl = t.slots.find((x) => x.stroke === h.stroke);
          if (!sl && k > 0) { sl = t.slots.find((x) => x.stroke !== null && !x.seenHere && time - x.seen < 0.6 && x.p.distanceTo(_hit) < 0.35 && !hands.some((o) => o.stroke === x.stroke)); if (sl) sl.stroke = h.stroke; }
          if (!sl) { sl = t.slots.find((x) => x.stroke === null) || t.slots.reduce((a, x) => (x.amt < a.amt ? x : a)); sl.stroke = h.stroke; sl.fresh = true; }
          sl.seenHere = true; sl.seen = time;
          if (k > 0) {
            sl.tgt.copy(_hit);
            if (sl.fresh || sl.amt < 0.05) { sl.p.copy(sl.tgt); if (sl.fresh) impact(t.tw, h.u ?? 0.5, 0.25 + 0.25 * k, 'ceramic', 'hit'); }
            sl.fresh = false; sl.want = k;
          } else sl.want = 0;
        }
        for (const sl of t.slots) if (sl.stroke !== null && !sl.seenHere && time - sl.seen > 0.6) sl.stroke = null;
      } else for (const sl of t.slots) { sl.stroke = null; sl.want = 0; }
      for (let i = 0; i < 4; i++) {
        const sl = t.slots[i];
        if (sl.want > 0) sl.p.lerp(sl.tgt, ease(16, dt));
        sl.amt += (sl.want - sl.amt) * ease(sl.want > sl.amt ? 8 : 4, dt);
        if (sl.amt < 0.002) sl.amt = 0;
        t.U.brush.array[i].set(sl.p.x, sl.p.y, sl.p.z, sl.amt);
      }
      _v.copy(_eyeW); t.root.worldToLocal(_v); t.U.eyeL.value.copy(_v);
      t.U.wc.value.copy(t.w.centre); t.U.wr.value.copy(t.w.right); t.U.wn.value.copy(t.w.normal);
    }

    // ---- the bands of shoulders (on the wall plane, room frame)
    for (let wi = 0; wi < bands.length; wi++) {
      const b = bands[wi], w = walls[wi], hasT = showT(wi), onT = inTronc && liftOn && !col.on && !lone() && playing;
      const kWant = onT ? (hasT ? 1 : 0.35) : 0;
      let yM, dLR;
      if (S && Array.isArray(S.band)) { yM = S.band[wi] || 0.9; const yl = S.yL?.[wi] || 0, yr = S.yR?.[wi] || 0; dLR = yl && yr ? yl - yr : 0; }
      else if (S) { yM = S.yMed?.[wi] || 0; const yl = S.yL?.[wi] || 0, yr = S.yR?.[wi] || 0; dLR = yl && yr ? yl - yr : 0; if (!yM) yM = 0.95 + 0.35 * liftP; }
      else { yM = 0.95 + 0.6 * liftP; dLR = pr.level ?? 0; }
      yM = Math.min(2.0, Math.max(0.6, yM || 0.95));
      b.vy += ((yM - b.y) * 60 - b.vy * 14) * dt; b.y += b.vy * dt;
      b.tilt += (Math.max(-0.3, Math.min(0.3, Math.atan2(dLR, BAND_W * 0.6))) - b.tilt) * ease(10, dt);
      const hx = b.hN ? b.hX / b.hN : 0, half = Math.max(0, (w.width - BAND_W) / 2 - 0.2);
      b.ox += ((onT && !hasT && b.hN ? Math.max(-half, Math.min(half, hx)) : 0) - b.ox) * ease(6, dt);
      if (b.hN && onT) { b.U.hx.value = hx - b.ox; b.U.hk.value = Math.max(b.U.hk.value, hasT ? 0.25 : 0.4); }
      if (liftE && onT && b.hN && (!S || !S.lifters || (S.lifters[wi] || 0) > 0)) { b.U.flash.value = 1; b.U.hk.value = 1.4; }
      // la plaça: a lift on a wall with no tower sends a burst of grains along the foot to the nearest tower
      if (onT && !hasT) {
        const rv = S ? (S.rise?.[wi] || 0) : liftP; plazaCool[wi] -= dt;
        const thr = S ? 0.18 : 0.5;
        if (rv > thr && plazaPrev[wi] <= thr && plazaCool[wi] <= 0) {
          const to = nearestTower(wi, showT);
          if (to >= 0) { const s0 = b.hN ? PER[wi] + (b.hS / b.hN) * w.width : PER[wi] + w.width / 2, dir = dirTo(s0, to); for (let k = 0; k < 60; k++) spawnDrift(s0 + (R() - 0.5) * 0.5, 0.25 + R() * 0.5, to, dir, true); plazaCool[wi] = 1.2; b.U.flash.value = 1; }
        }
        plazaPrev[wi] = rv;
      }
      const kk = b.U.k.value + (kWant - b.U.k.value) * ease(3, dt);
      b.U.k.value = kk * decor; b.g.visible = kk * decor > 0.01 && P.band === true;   // 25-11: the band of light read as a UI line
      b.U.flash.value *= Math.exp(-dt * 3); b.U.hk.value *= Math.exp(-dt * 2.5);
      b.g.position.copy(w.centre).addScaledVector(w.normal, -0.03).addScaledVector(b.ax, b.ox).setY(b.y);
      _e.set(0, Math.atan2(w.normal.x, w.normal.z), -b.tilt, 'YXZ'); b.g.quaternion.setFromEuler(_e);
    }

    // ---- the rulers: a tick and a name per floor, at the height the floor is seen on the wall
    lineK.value = decor * (inTronc ? 1 : 0) * (1 - uAway.value);
    for (let lv = 0; lv < NL; lv++) {
      const s = towers.find((t) => t.on)?.st[lv];
      const locked = s && lv <= floors && s.solid >= 0.99, form = s && s.forming;
      const want = lv === 0 ? 0.42 : locked ? 0.95 : form ? 0.45 + 0.15 * Math.sin(time * 2.6) : 0.2;
      labE[lv] += (want + (s ? s.flash * 0.6 : 0) - labE[lv]) * ease(5, dt);
      labK[lv].value = Math.max(0, labE[lv]) * decor * (1 - uAway.value) * (inTronc ? 1 : 0);
    }
    for (let wi = 0; wi < NW; wi++) {
      const r = rulers[wi], t = towers[wi], k = decor * (1 - uAway.value), on = t.on && k > 0.02 && built && P.ruler === true;   // 25-11: no ruler (read as UI)
      r.g.visible = on; if (!on) continue;
      const dW = Math.max(0.5, -_v.copy(t.w.centre).sub(room.eye).dot(t.w.normal)), dT = dW + t.dist, sc = dT / dW;
      r.g.scale.setScalar(sc); r.g.position.set(RULER_X * sc, 0, 0.6);
      r.line.position.y = 0; r.line.scale.y = (TOWER_H * SC + 1) / sc;
      let last = 1e9;                                    // names ≥ 0.14 m apart on the wall: from the top down, a crowded lower name is left out
      for (let lv = NL - 1; lv >= 0; lv--) { const y = LV[lv].yc * SC / sc; r.labs[lv].position.y = y; r.ticks[lv].position.set(0, y, 0); const ok = last - y >= 0.14; r.labs[lv].visible = ok; if (ok) last = y; }
    }

    // ---- the foot of the walls without a tower: grains drift to the nearest tower
    const anyT = towers.some((t) => t.on), quietWalls = [];
    for (let wi = 0; wi < NW; wi++) if (!showT(wi) && anyT && inTronc && !col.on && !lone()) quietWalls.push(wi);
    if (quietWalls.length && decor > 0.01) {
      for (const wi of quietWalls) if (R() < dt * 34) { const to = nearestTower(wi, showT); const s0 = PER[wi] + R() * walls[wi].width; spawnDrift(s0, 0.08 + R() * 0.32, to, dirTo(s0, to), false); }
    }
    for (let i = 0; i < ND; i++) {
      if (dA[i] <= 0) { dPos[i * 4 + 3] = 0; continue; }
      dL[i] += dt; dS[i] += dDir[i] * dV[i] * dt;
      const [wi, u] = wallAt(dS[i]), w = walls[wi];
      // arrived at the tower's wall: fade before its centre
      const atT = wi === dTo[i] && Math.abs(u - 0.5) < 0.38;
      const life = smooth(0, 0.6, dL[i]) * (atT ? 1 - smooth(0.38, 0.12, Math.abs(u - 0.5)) : 1) * (dL[i] > 30 ? 0 : 1);
      if (atT && Math.abs(u - 0.5) < 0.13) { dA[i] = 0; const t = towers[dTo[i]]; if (t && dV[i] > 1) t.st[0].flash = Math.max(t.st[0].flash, 0.6); continue; }
      // a hand on that wall lifts the grains near it
      let lift = 0; const b = bands[wi];
      if (b.hN) { const hs = b.hS / b.hN, d = (u - hs) * w.width; lift = Math.exp(-d * d * 3) * 0.5; }
      dY[i] += ((lift ? 0.2 + lift : 0) - (dY[i] > 0.6 ? 0.05 : 0)) * dt;
      room.wallPoint(wi, clamp01(u), Math.max(0.03, dY[i] + Math.sin(dL[i] * 1.3 + i) * 0.03) / w.height, _v); _v.addScaledVector(w.normal, -0.05);
      dPos[i * 4] = _v.x; dPos[i * 4 + 1] = _v.y; dPos[i * 4 + 2] = _v.z; dPos[i * 4 + 3] = dA[i] * life * decor;
    }
    dAttr.needsUpdate = true;
    floorsPrev = floors;
    if (kit) {   // the Pom's silence: the particles breathe (≈ 0.15 Hz, size and light)
      const sil = S && S.pomStage === 'silence' ? 1 : 0; breathK += (sil - breathK) * Math.min(1, dt * 0.8);
      const b = Math.sin(time * 0.94) * breathK; kit.setSplat({ size: 1 + 0.07 * b, key: 1 + 0.12 * b });
    }
    placeBodies(dt, inTronc, floors, !!S);
  }
  function nearestTower(wi, showT) {
    let best = -1, bd = 1e9; for (let j = 0; j < NW; j++) { if (!showT(j)) continue; let d = Math.abs((PER[j] + walls[j].width / 2) - (PER[wi] + walls[wi].width / 2)); d = Math.min(d, perim - d); if (d < bd) { bd = d; best = j; } }
    return best;
  }
  function dirTo(s0, to) { if (to < 0) return 1; let d = (PER[to] + walls[to].width / 2) - s0; if (d > perim / 2) d -= perim; if (d < -perim / 2) d += perim; return Math.sign(d) || 1; }

  // -------------------------------------------------------------------------------------------- takeFloor / giveFloor / levels
  // takeFloor(i, { tower = -1 (all), hide = true }) → floor i's matter as pieces in WORLD coordinates (≈ 240 grains of it per tower):
  // [{ tower, x, y, z, q: [x,y,z,w], sx, sy, sz (m), r, g, b (linear), kind ('stone' porcelain | 'glaze' sash), geo: 'tile' }].
  // With hide the floor is no longer drawn here (the caller draws it from then on). giveFloor(i, tower) shows it again.
  const _q = new THREE.Quaternion(), _n = new THREE.Vector3(), YUP = new THREE.Vector3(0, 1, 0);
  function takeFloor(i, opt = {}) {
    const tower = opt.tower ?? -1, hide = opt.hide !== false, out = [];
    object.updateMatrixWorld(true);
    const F = B.floors[i];
    for (const t of towers) {
      if (!t.on || (tower >= 0 && t.tw !== tower)) continue;
      const s = t.st[i];
      if (F && s.shown && !s.taken && !s.gone && (i <= t.built || i === 0)) {
        const G = F.grains, want = i === 0 ? 320 : 240, step = Math.max(1, Math.floor(G.n / want));
        for (let k = 0; k < G.n; k += step) {
          _v.set(G.rest[k * 4], G.rest[k * 4 + 1], G.rest[k * 4 + 2]).applyMatrix4(t.root.matrixWorld);
          _n.set(G.nrm[k * 4], G.nrm[k * 4 + 1], G.nrm[k * 4 + 2]); _q.setFromUnitVectors(YUP, _n);
          const sash = G.aux[k * 4] > 0.5, sz = SC * (0.07 + G.nrm[k * 4 + 3] * 0.05);
          out.push({ tower: t.tw, x: _v.x, y: _v.y, z: _v.z, q: [_q.x, _q.y, _q.z, _q.w], sx: sz, sy: sz * 0.12, sz: sz * 0.8, r: sash ? 0.1 : 0.8, g: sash ? 0.3 : 0.785, b: sash ? 0.45 : 0.75, kind: sash ? 'glaze' : 'stone', geo: 'tile' });
        }
      }
      if (hide) s.taken = true;
    }
    if (hide) for (const t of towers) if (!t.on && (tower < 0 || t.tw === tower)) t.st[i].taken = true;
    return out;
  }
  function giveFloor(i, tower = -1) { for (const t of towers) if (tower < 0 || t.tw === tower) t.st[i].taken = false; }
  // levels(): per shown tower, its floors as they stand: [{ tower, built (0..9), floors: [{ i, name, y (world, centre), h, taken, gone }] }]
  function levels() {
    world.updateMatrixWorld(true);
    const y0 = world.matrixWorld.elements[13];
    const lvOf = (L, i) => (!OLD && CLV[i] ? { yc: (CLV[i].y0 + CLV[i].y1) / 2, h: CLV[i].y1 - CLV[i].y0 } : L);
    return towers.filter((t) => t.on).map((t) => ({ tower: t.tw, built: t.built, foot: { x: t.g.position.x, z: t.g.position.z }, floors: LV.map((L0, i) => { const L = lvOf(L0, i); return { i, name: NAMES[i].toLowerCase(), y: y0 + L.yc * SC, h: L.h * SC, taken: !!t.st[i].taken, gone: !!t.st[i].gone }; }) }));
  }

  // trunk(floor, tower?) → { x, z, y, r, h, tower } in WORLD metres: the axis of the tower at that floor (y = its feet, r = the radius of
  // the bodies' ring, h = its height); for climbers (Pom). Without `tower`: the first tower on screen. null when there is none.
  function trunk(floor, tower = -1) {
    const t = tower >= 0 ? towers[tower] : towers.find((q) => q.on);
    const L = TRUNK[Math.max(1, Math.min(9, floor | 0))]; if (!t || !L) return null;
    world.updateMatrixWorld(true);
    const y0 = world.matrixWorld.elements[13], th = t.theta || 0;
    const phi = Math.atan2(t.w.normal.x, t.w.normal.z), d = -Math.sin(th) * L.y * SC;   // the lean shifts the axis along the tower's x
    return { x: t.g.position.x + Math.cos(phi) * d, z: t.g.position.z - Math.sin(phi) * d, y: y0 + L.y * SC * Math.cos(th), yRest: L.y * SC, r: L.r * SC, h: L.h * SC, tower: t.tw };
  }
  // textObstacles() → [{ wall, x, half, y0, y1 }] (wall coordinates, m): the tower (or the pinya ring) on each wall, up to its visible top
  const OB = [], _ob = new THREE.Vector3();
  function textObstacles() {
    OB.length = 0;
    if (!kit || col.on) return OB;
    world.updateMatrixWorld(true);
    const y0w = world.matrixWorld.elements[13];
    for (const t of towers) {
      const ring = !(t.on && t.g.visible); if (ring && (OLD || keepFloors < 0)) continue;
      const dW = Math.max(0.5, -_ob.copy(t.w.centre).sub(room.eye).dot(t.w.normal)), k = dW / (dW + TOWER_D);
      let top = 1.75;
      if (!ring) for (let lv = 9; lv >= 1; lv--) if (CLV[lv] && t.st[lv].shown && !t.st[lv].taken) { top = CLV[lv].y1 * SC; break; }
      const Y = top + y0w, onWall = room.eye.y + (Y - room.eye.y) * k;
      OB.push({ wall: t.tw, x: 0, half: 1.15 * k + 0.2, y0: 0, y1: Math.min(t.w.height || 3.75, Math.max(0.5, onWall)) });
    }
    return OB;
  }
  function setParams(p) { if (p && p !== P) Object.assign(P, p); }
  function dispose() {
    try { fxBc?.close(); } catch { /* closed */ }
    for (const t of towers) { t.mS.dispose(); t.mG.dispose(); t.halo?.mesh.material.dispose(); }
    for (const g of [...geoS, ...geoG]) g?.dispose();
    quad.dispose(); dGeo.dispose(); sky.geometry.dispose(); sky.material.dispose(); labelTex?.dispose();
    for (const b of bands) { b.g.geometry.dispose(); b.g.material.dispose(); }
    for (const m of [...labMats, ...tickMat, lineMat, drift.material]) m.dispose();
    labGeo.dispose(); tickGeo.dispose(); lineGeo.dispose();
  }
  const api = {
    object, update, setParams, dispose, impacts, setMode, setFocusY, kit, towerD: TOWER_D, scale: SC, trunk, textObstacles,
    get rise() { return rise; },
    collapse, restore, takeFloor, giveFloor, levels,
    get collapsing() { return { on: col.on, t: col.t, mode: col.mode, duration: col.dur }; },
  };
  if (typeof window !== 'undefined') window.__tronc3d = {
    get built() { return { done: built, floors: nAdded, ms: Math.round(B.ms), people: B.people }; },
    get rise() { return rise; }, impacts, get lift() { return { on: liftOn, p: liftP, wobble: wob.on, crack: wob.close, slip: slip.lv }; },
    get towers() { return towers.map((t) => ({ on: t.on, theta: +t.theta.toFixed(4), shed: +t.U.lean.value.y.toFixed(2), brush: t.slots.map((s) => +s.amt.toFixed(2)), st: t.st.map((s) => [+s.solid.toFixed(2), s.forming, +s.lift.toFixed(2), +s.goneT.toFixed(1), s.taken ? 1 : 0]) })); },
    get grains() { return B.floors.reduce((a, F) => a + (F ? F.grains.n : 0), 0); },
    collapse, restore, takeFloor, giveFloor, levels, get collapsing() { return api.collapsing; },
    snap() { snapNext = true; },
  };
  return api;
}
