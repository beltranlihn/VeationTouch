// Ressonància — part «baixada3d»: La bajada — Seny — «the way down at dawn» (ARTE-2 §3 row «Bajada»; ref. 12, vertical greenhouses
// in pastel; ticket lab/estudio/tickets/T-035-3DPO-baixada.md; contract ../PARTS.md). The previous «Luz que llueve» is kept whole in
// baixada3d.ARTE2.js.bak.
//
// Dawn: the only light background of the work (rose and lilac above, peach at the horizon, aquamarine sea, the sun about to rise).
// Beyond each wall of the castell's structure stands the castell as a TOWER OF COLOURED GLASS: each floor a ring of glass shards
// (rose, lilac, aquamarine, peach, mint, pearl…; physical glass: clear-coat, thin-film iridescence, the host's environment), turning
// slowly. THE WAY DOWN: the room stands at the top of the tower and comes DOWN with it — every 'down' (the score takes a floor away) the
// top ring lets go and the eye sinks one floor (a damped spring: smooth, ≤ 1 m/s); vertical greenhouses of glass and the morning city
// rise around us.
// The shards of the floor that lets go fall as a slow RAIN OF GLASS (gravity, flat glass gliding: slow vertically, carried out towards
// the room, fluttering and turning), and a light trickle keeps falling from the top while floors remain. Physical: where a HAND is held
// a shard that passes through it (seen through the wall at the hand) STOPS, flares and A FLOWER GROWS THERE on the wall (its colour;
// more catches, bigger flower). Where nobody holds, shards fall to the ground and SHATTER into chips that bounce and lie glittering at
// the towers' feet (the debris field we land among at the end).
// The fall (leaving into 'fall' / outcome 'carregat'): the whole tower lets go at once, heavy, and the colour drains.
// Three depths: glass chips drifting 0.2–1 m behind the walls · the glass castells (≈ 7 m beyond the walls) and the rain · greenhouses
// (16–45 m), the city in the morning mist, the sea and the sky.
// arrive: the shards fly in from scattered and lock into their rings, the sky comes in by cells; leave: the rings part and rise, everything
// thins out.
// Alone (res-3d-study, no input.state) a stand-in from params: floors (-1 = from progress), maxFloors, cycle, fall, fallDelay, walls,
// arrive, leave, rain, gain, floorH.
// Sound (wave 2, ENT's snippet): a caught shard 'glass'/'hit', a shard that shatters 'glass'/'floor', a flower that opens 'petal'/'bloom'.

import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, attribute, varying, vec2, vec3, vec4, float, positionWorld, positionGeometry, normalGeometry, cameraPosition,
    cameraWorldMatrix, mix, smoothstep, clamp, sin, cos, fract, floor, abs, max, min, pow, exp, length, normalize, dot, cross,
    mx_noise_float, If, select, step, fwidth, Discard, atan, reflect, normalWorld,
  } = TSL;
  function rng(s) { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const sm = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
  const TAU = Math.PI * 2;
  const walls = room.walls, NW = walls.length, EYE = room.eye.clone();
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash12 = (p) => hash13(vec3(p.x, p.y, p.x.add(1.7)));
  const lineAA = (d, fw, px) => float(1).sub(smoothstep(fw.mul(px * 0.5), fw.mul(px * 0.5 + 1.0), d));
  const plines = (x, per, fw, px) => { const d = abs(fract(x.div(per).add(0.5)).sub(0.5)).mul(per); return mix(lineAA(d, fw, px), min(fw.mul(px + 1).div(per), 0.5).mul(0.3), smoothstep(per * 0.06, per * 0.25, fw)); };

  // -------------------------------------------------------------------------------------------- palette (ARTE §2, row «Bajada»; linear)
  const C = {
    top: [0.023, 0.015, 0.051], horizon: [0.62, 0.34, 0.30], rose: [0.93, 0.47, 0.56], lilac: [0.485, 0.366, 0.807],
    aqua: [0.275, 0.745, 0.644], peach: [1.0, 0.63, 0.39], sun: [1.0, 0.92, 0.75], mint: [0.55, 0.9, 0.7], pearl: [0.92, 0.88, 0.95],
  };
  const FLOORCOL = [C.peach, C.rose, C.lilac, C.aqua, C.rose, C.peach, C.lilac, C.aqua, C.rose];   // floor 0 (base) … 8 (top)
  const v3 = (c) => vec3(c[0], c[1], c[2]);

  // -------------------------------------------------------------------------------------------- uniforms, groups
  const uTime = uniform(0), uA = uniform(20), uWorld = uniform(1), uGain = uniform(1), uDomeIn = uniform(1), uDrain = uniform(0);
  // T-053: the shared system — the chapter's accent for the hands' light on the glass edges («la mano es una linterna»)
  const ACC = vec3(...(room.PALETTE?.baixada?.accent || [0.93, 0.47, 0.56])), FL = (p) => (room.flash ? room.flash(p) : float(0));
  const sunV = new THREE.Vector3(0.75, -0.03, 0.66).normalize(), uSun = uniform(sunV);
  const SEA = new THREE.Vector2(0.75, 0.66).normalize(), uSea = uniform(SEA);
  const object = new THREE.Group(); object.name = 'baixada3d';
  const world = new THREE.Group(); object.add(world);              // everything that rises as we come down
  const geos = [], mats = [];

  // THE QUIET ZONES (GUI / ARTE): at each wall's centre nothing behind the text or the button brighter than ~35 %: colDim(k) is 1
  // elsewhere and 1 − k there. The wall is the one this camera looks through (its z axis is the wall's normal).
  const colDim = (strength = 0.6) => {
    const V = positionWorld.sub(cameraPosition), camZ = cameraWorldMatrix.element(2).xyz;
    let de = float(3.5), cr = float(0), rx = float(1), rz = float(0);
    for (const w of walls) {
      const n = w.normal, dw = -((w.centre.x - EYE.x) * n.x + (w.centre.z - EYE.z) * n.z), cw = (w.centre.x - EYE.x) * w.right.x + (w.centre.z - EYE.z) * w.right.z;
      const m = step(0.999, dot(camZ, vec3(n.x, n.y, n.z)));
      de = mix(de, float(dw), m); cr = mix(cr, float(cw), m); rx = mix(rx, float(w.right.x), m); rz = mix(rz, float(w.right.z), m);
    }
    const k = dot(V, camZ).negate(), t = de.div(max(k, 0.01));
    const u = V.x.mul(rx).add(V.z.mul(rz)).mul(t).sub(cr), h = V.y.mul(t).add(cameraPosition.y);
    // two QUIET ZONES (rule of 24-11): the text ±1.6 m × 1.75–2.2 m and the button ±0.9 m × 0.9–1.6 m, soft edges of ~0.2 m
    // a soft super-gaussian lobe (no corners, it reads as light falling off, never as a plate): full over the button and the text's
    // middle, ~0.6 at the text's ends
    const gu = u.div(2.1), gh = h.sub(1.6).div(0.85);
    const inCol = exp(gu.mul(gu).mul(gu.mul(gu)).add(gh.mul(gh).mul(gh.mul(gh))).negate()).mul(step(0.0, k));
    return float(1).sub(inCol.mul(strength));
  };
  // -------------------------------------------------------------------------------------------- the sky and the ground (ray-cast)
  // the room has an EAST (ARTE round 2): the sun is just below the horizon on ONE wall (EAST_WALL); clouds lit from below on that side;
  // thin pixel-sort streaks across the low sky
  const EAST_WALL = Math.min(1, NW - 1);
  const skyCol = Fn(([dir]) => {
    // ARTE round 3: a CLEAN luminous gradient #2A2140 (zenith, deep) → #B9A3E8 → #F3B9B0 (horizon) → #FFF6E0 towards the east; the sun is
    // a glow below the horizon (no disc); clouds LIGHTER than the sky, lit from below on the east side
    const y = dir.y, az = atan(dir.z, dir.x);
    const sAz = max(dot(normalize(dir.xz.add(vec2(0.0001, 0))), normalize(uSun.xz)), -1.0), east = pow(sAz.mul(0.5).add(0.5), 3.0);
    const yy = max(y, 0.0);
    const lil = vec3(0.485, 0.366, 0.807).mul(0.34), ros = vec3(0.896, 0.485, 0.434).mul(0.5), warm = vec3(1.0, 0.92, 0.745);
    const sky0 = mix(mix(v3(C.top), lil, smoothstep(0.5, 0.14, yy)), ros, smoothstep(0.16, 0.0, yy));
    const glowE = warm.mul(pow(east, 2.0)).mul(exp(yy.div(0.07).negate()).mul(0.38).add(exp(yy.div(0.22).negate()).mul(0.1)));
    // ARTE round 4: a LUMINOUS EAST WALL (P1) in peach #FFD0A8, rising well up the sky, the sun's glow concentrated low at its azimuth
    const peachE = vec3(1.0, 0.63, 0.39).mul(pow(east, 1.5)).mul(exp(yy.div(0.28).negate()).mul(0.26));
    const sunG = vec3(1.0, 0.85, 0.62).mul(pow(max(dot(dir, uSun), 0.0), 60).mul(0.22));
    const sky = sky0.add(glowE).add(peachE).add(sunG);
    const cn = (q) => mx_noise_float(vec3(az.mul(2.4), q.mul(13.0), uTime.mul(0.008)));
    const c0 = smoothstep(0.2, 0.6, cn(y)), lit = max(cn(y.add(0.012)).sub(cn(y)), 0.0).mul(c0).mul(6.0).min(1);
    const band = smoothstep(0.03, 0.08, y).mul(smoothstep(0.42, 0.16, y));
    const cloud = mix(lil.mul(0.5).add(ros.mul(0.25)), mix(ros, warm, east).mul(0.7), lit.mul(east.mul(0.7).add(0.3))).mul(c0).mul(band).mul(0.6);
    const row = floor(y.mul(220.0)), h = hash12(vec2(row, 3.0)), a0 = hash12(vec2(row, 9.0)).mul(6.283).sub(3.1416), len = hash12(vec2(row, 5.0)).mul(0.8).add(0.15);
    const fa = az.sub(a0).div(len), inS = step(0.0, fa).mul(step(fa, 1.0)).mul(step(0.955, h)).mul(smoothstep(0.02, 0.05, y)).mul(smoothstep(0.32, 0.18, y));
    const sorted = mix(lil, mix(ros, warm, east), pow(fa.clamp(0, 1), 2.0)).mul(inS).mul(0.0);   // T-053: no pixel-sort streaks (ARTE-3 §3)
    const stars = step(0.997, hash13(floor(dir.mul(300)))).mul(smoothstep(0.4, 0.8, y)).mul(east.oneMinus()).mul(0.4);
    return sky.add(cloud).add(sorted).add(vec3(stars));
  });
  // the ground is WATER over a wet slab (ARTE round 2): it reflects the sky (Fresnel, slow ripples), low pink mist lies on it
  const groundCol = Fn(([dir]) => {
    const ny = max(dir.y.negate(), 0.0004), t = uA.div(ny), Pg = dir.xz.mul(t);
    const rip = vec2(mx_noise_float(vec3(Pg.mul(0.35), uTime.mul(0.25))), mx_noise_float(vec3(Pg.mul(0.35).add(7.3), uTime.mul(0.25)))).mul(0.035).mul(exp(t.mul(-0.01)));
    const R = normalize(vec3(dir.x.add(rip.x), ny, dir.z.add(rip.y)));
    const fres = pow(float(1).sub(ny), 5).mul(0.9).add(0.06);
    const refl = skyCol(R).mul(fres);
    const slab = vec3(0.05, 0.035, 0.06).mul(float(1).sub(fres));
    const mist = smoothstep(90.0, 420.0, t).mul(0.7);                              // mist only low, far, on the water
    const mistC = mix(vec3(0.896, 0.485, 0.434).mul(0.42), vec3(1.0, 0.92, 0.745).mul(0.6), pow(max(dot(normalize(dir.xz.add(vec2(0.0001, 0))), normalize(uSun.xz)), 0), 3));
    return mix(slab.add(refl), mistC, mist);
  });
  const domeCol = Fn(([dir]) => mix(groundCol(dir), skyCol(dir), smoothstep(-0.003, 0.003, dir.y)));
  {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true });
    m.colorNode = Fn(() => {
      const dir = normalize(positionWorld.sub(cameraPosition));
      const h = hash13(floor(dir.mul(9.0)).add(vec3(3.1, 7.7, 1.3)));
      const a = smoothstep(h.mul(0.75), h.mul(0.75).add(0.12), uDomeIn);
      return vec4(domeCol(dir).mul(uWorld.mul(0.85).add(0.15)).mul(uGain).mul(colDim(0.75)), a);
    })();
    m.fog = false; mats.push(m);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(330, 64, 32), m); geos.push(dome.geometry);
    dome.position.copy(EYE); dome.renderOrder = -10; dome.frustumCulled = false; object.add(dome);
  }

  // -------------------------------------------------------------------------------------------- greenhouses (ref. 12): glass towers
  // Opaque «cheap glass»: each pane reflects the dawn sky (its own normal), tinted; a pearl frame of mullions and floors.
  const wallAng = (w) => Math.atan2(-walls[w].normal.z, -walls[w].normal.x);
  {
    // ARTE round 3: no more pink blocks — the INTRO'S SQUARE comes back, back-lit by the dawn: four sides of facades at 18 m (3–4 houses each,
    // 12–18 m high), a bell tower, and the old town's roofs further out, as SILHOUETTES (deep violet, a warm rim on the east, a few lit windows)
    const r = rng(12), list = [];
    const SQ = 18;
    for (let side = 0; side < 4; side++) {
      const ang = side * Math.PI / 2, nx = Math.cos(ang), nz = Math.sin(ang), tx = -nz, tz = nx;
      let u = -SQ + 1.5;
      while (u < SQ - 1.5) {
        const w = Math.min(SQ - 1.5 - u, 8 + r() * 5), h = 12 + r() * 6, d = 10;
        list.push([nx * (SQ + d / 2) + tx * (u + w / 2), h / 2, nz * (SQ + d / 2) + tz * (u + w / 2), Math.PI / 2 - ang, w, h, d, [0, 0, 0]]);
        u += w + 0.15;
      }
    }
    list.push([SQ + 8, 17, -6, 0, 6, 34, 6, [0, 0, 0]], [SQ + 8, 36.5, -6, 0.785, 3.6, 5, 3.6, [0, 0, 0]]);      // the bell tower and its lantern
    for (let k = 0; k < 70; k++) {                                   // the old town beyond
      const a = r() * TAU, rad = 40 + Math.pow(r(), 0.8) * 120, h = 10 + r() * 14, w = 10 + r() * 14;
      list.push([Math.cos(a) * rad, h / 2, Math.sin(a) * rad, r() * TAU, w, h, w * (0.6 + r() * 0.6), [1, 0, 0]]);
    }
    const g0 = new THREE.BoxGeometry(1, 1, 1), g = new THREE.InstancedBufferGeometry();
    g.setIndex(g0.index); g.setAttribute('position', g0.attributes.position); g.setAttribute('normal', g0.attributes.normal);
    const a4 = new Float32Array(list.length * 4), b4 = new Float32Array(list.length * 4), c4 = new Float32Array(list.length * 4);
    list.forEach((b, i) => { a4.set([b[0], b[1], b[2], b[3]], i * 4); b4.set([b[4], b[5], b[6], 0], i * 4); c4.set([b[7][0], b[7][1], b[7][2], 0], i * 4); });
    g.setAttribute('gA', new THREE.InstancedBufferAttribute(a4, 4)); g.setAttribute('gB', new THREE.InstancedBufferAttribute(b4, 4)); g.setAttribute('gC', new THREE.InstancedBufferAttribute(c4, 4));
    g.instanceCount = list.length; geos.push(g, g0);
    const m = new THREE.MeshBasicNodeMaterial();
    const A = attribute('gA', 'vec4'), B = attribute('gB', 'vec4'), T = attribute('gC', 'vec4');
    const lp = positionGeometry.mul(B.xyz), c = cos(A.w), s = sin(A.w);
    m.positionNode = vec3(lp.x.mul(c).add(lp.z.mul(s)), lp.y, lp.z.mul(c).sub(lp.x.mul(s))).add(A.xyz);
    const n = normalGeometry, nw = vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.z.mul(c).sub(n.x.mul(s)));
    const vLP = varying(lp), vN = varying(n), vNW = varying(nw), vSZ = varying(B.xyz), vT = varying(T.xyz), vY = varying(lp.y.add(A.y));
    m.colorNode = Fn(() => {
      const V = normalize(positionWorld.sub(cameraPosition));
      const an = abs(vN), fw = length(fwidth(vLP)).add(0.0005);
      const u = select(an.x.greaterThan(0.5), vLP.z, vLP.x);
      const d = vSZ.mul(0.5).sub(abs(vLP)), big = float(1e4);
      const dE = min(min(select(an.x.greaterThan(0.5), big, d.x), select(an.y.greaterThan(0.5), big, d.y)), select(an.z.greaterThan(0.5), big, d.z));
      // back-lit: facing the dawn = a faint warm wash; the edges against the sky catch a rim; a few lit windows
      const toSun = max(dot(vNW, normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
      const rim = lineAA(dE, fw, 2.0).mul(0.5).add(lineAA(dE, fw, 6.0).mul(0.15)).mul(toSun.mul(0.8).add(0.2));
      const g = vec2(u.div(3.0), vY.div(3.3)), cl = floor(g), f = fract(g);
      const win = step(abs(f.x.sub(0.5)), 0.12).mul(step(abs(f.y.sub(0.55)), 0.17)).mul(step(0.95, hash12(cl.add(vSZ.xy)))).mul(step(an.y, 0.5)).mul(step(2.5, vY)).mul(vT.x.oneMinus());
      const sil = vec3(0.012, 0.008, 0.02).add(vec3(1.0, 0.62, 0.42).mul(toSun.mul(0.05)));
      // pure black silhouettes (director, 24-11): no lit faces, rims or windows; only the far town sinks into the low sky
      const col = vec3(0).add(sil.mul(0.0)).add(rim.mul(0.0)).add(win.mul(0.0));
      const dist = length(positionWorld.sub(cameraPosition)), f2 = exp(dist.mul(-0.004));     // only the far town fades into the low sky
      return vec4(mix(skyCol(vec3(V.x, 0.02, V.z)).mul(0.45), col, f2.mul(0.8).add(0.2)).mul(uWorld).mul(uGain).mul(colDim(0.75)), 1);
    })();
    m.fog = false; mats.push(m);
    var greenhouses = new THREE.Mesh(g, m); greenhouses.frustumCulled = false; world.add(greenhouses);
  }

  // -------------------------------------------------------------------------------------------- T-053 (ARTE r5): dawn haze at the foot
  // The square's silhouette made the bottom ~45 % of each wall pure black: a haze #1A1326 on the wall plane, full at the floor, gone by
  // 1.2 m (additive: it lifts the black, the sky above is untouched). Never #000 (ARTE-3).
  {
    const pos = [], hv = [], idx = [], _q = new THREE.Vector3();
    walls.forEach((w, i) => {
      const o = pos.length / 3, vt = Math.min(1, 1.3 / w.height);
      for (const [uu, vv] of [[0, 0], [1, 0], [1, vt], [0, vt]]) { room.wallPoint(i, uu, vv, _q).addScaledVector(w.normal, -0.004); pos.push(_q.x, _q.y, _q.z); hv.push(vv * w.height); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(hv, 1)); g.setIndex(idx); geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const hH = varying(attribute('aH', 'float'));
    m.colorNode = vec3(0.0103, 0.0065, 0.0185).mul(smoothstep(1.2, 0.0, hH)).mul(uDomeIn);
    m.fog = false; mats.push(m);
    const haze = new THREE.Mesh(g, m); haze.frustumCulled = false; haze.renderOrder = 20; object.add(haze);
  }

  // -------------------------------------------------------------------------------------------- glass shards (one InstancedMesh)
  // Every shard of the work's dawn: the castells' rings, the rain, the chips, the debris, the near layer. Physical glass (MeshPhysical:
  // clear-coat, iridescence, room.envMap) with its colour as a soft glow and a bright rim; per instance: colour + alpha, flare.
  const NSH = 5200;
  const shard = (() => {
    const r = rng(404), n = 6, pos = [0, 0, 0], rim = [0], nrm = [0, 0, 1], idx = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU + (r() - 0.5) * 0.7, rr = 0.55 + r() * 0.45; pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0); rim.push(1); nrm.push(0, 0, 1); }
    for (let k = 0; k < n; k++) idx.push(0, 1 + k, 1 + ((k + 1) % n));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('rim', new THREE.Float32BufferAttribute(rim, 1)); g.setIndex(idx);
    geos.push(g);
    // REAL GLASS, cheap (ARTE §1): almost colourless; what is behind shows through (transparency), the dawn sky REFLECTED with Fresnel,
    // a bright rim, a thin-film sheen on the rim; 1 in 5 tinted. No glow of its own (a caught one flares).
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const K = varying(attribute('sC', 'vec4')), F4 = varying(attribute('sF', 'vec4')), vR = varying(attribute('rim', 'float'));
    m.colorNode = Fn(() => {
      const edge = smoothstep(float(1).sub(fwidth(vR).mul(1.8)), 1.0, vR);
      const V = normalize(positionWorld.sub(cameraPosition)), N = normalize(normalWorld), cs = abs(dot(V, N));
      const fres = pow(float(1).sub(cs), 3).mul(0.8).add(0.16);
      const R = reflect(V, select(dot(V, N).greaterThan(0), N.negate(), N));
      const refl = skyCol(vec3(R.x, abs(R.y).add(0.01), R.z)).mul(fres).mul(1.6);
      const tint = mix(K.xyz, vec3(0.35, 0.3, 0.4), uDrain.mul(F4.y));
      const film = mix(v3(C.aqua), v3(C.rose), fract(cs.mul(3.0).add(F4.z)));
      const rim = mix(v3(C.sun), film, 0.45).mul(edge.mul(0.25));   // T-053 (ARTE r5): the outline at half (it read as wire)
      // ARTE round 3: the glass BENDS the horizon inside each shard (what is behind, seen along a ray bent by the shard's face), a glint
      // towards the east, the rim; a caught shard flares in its floor's colour
      const Nf = select(dot(V, N).greaterThan(0), N.negate(), N);
      const bent = domeCol(normalize(V.sub(Nf.mul(0.42)))).mul(mix(vec3(1), tint, 0.4));
      const sunH = normalize(vec3(uSun.x, 0.06, uSun.z)), glint = pow(max(dot(R, sunH), 0.0), 120).mul(3.0);
      const col = mix(bent, refl.div(fres.max(0.05)).mul(0.9), fres).add(rim).add(vec3(1.0, 0.9, 0.75).mul(glint)).add(tint.mul(F4.x.mul(1.3)));
      const q = colDim(0.7), qz = float(1).sub(colDim(1.0));
      // T-053 (ARTE r5): no burnt white — luminance ceiling 0.7, and 0.3 behind the text / button (the quiet zones)
      const c1 = col.mul(uGain).mul(float(1).sub(uDrain.mul(F4.y).mul(0.7))).mul(q), lum = dot(c1, vec3(0.2126, 0.7152, 0.0722));
      const c2 = c1.mul(min(float(1), mix(float(0.7), float(0.3), qz).div(lum.add(1e-4))));
      return vec4(c2.add(ACC.mul(FL(positionWorld)).mul(edge).mul(0.4)), K.w.mul(float(0.8).add(edge.mul(0.1)).add(F4.x.mul(0.2))).min(1).mul(q.mul(0.5).add(0.5)));
    })();
    m.fog = false; mats.push(m);
    const mesh = new THREE.InstancedMesh(g, m, NSH); mesh.frustumCulled = false; mesh.renderOrder = 6;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const sCa = new Float32Array(NSH * 4), sFa = new Float32Array(NSH * 4);
    const SC = new THREE.InstancedBufferAttribute(sCa, 4), SF = new THREE.InstancedBufferAttribute(sFa, 4);
    SC.setUsage(THREE.DynamicDrawUsage); SF.setUsage(THREE.DynamicDrawUsage); g.setAttribute('sC', SC); g.setAttribute('sF', SF);
    world.add(mesh);
    return { mesh, sCa, sFa, SC, SF };
  })();
  const _m4 = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _ax = new THREE.Vector3(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NSH; i++) shard.mesh.setMatrixAt(i, _zero);
  // shard state: st 0 free · 1 in a ring · 2 falling · 3 caught · 4 on the ground (bouncing / lying) · 5 near layer
  const S_ = {
    st: new Uint8Array(NSH), x: new Float32Array(NSH), y: new Float32Array(NSH), z: new Float32Array(NSH), vx: new Float32Array(NSH), vy: new Float32Array(NSH), vz: new Float32Array(NSH),
    ax: new Float32Array(NSH), ay: new Float32Array(NSH), az: new Float32Array(NSH), an: new Float32Array(NSH), av: new Float32Array(NSH), s: new Float32Array(NSH), sd: new Float32Array(NSH),
    r: new Float32Array(NSH), g: new Float32Array(NSH), b: new Float32Array(NSH), t: new Float32Array(NSH), fl: new Float32Array(NSH), tw: new Int8Array(NSH), f: new Int8Array(NSH),
    ra: new Float32Array(NSH), ry: new Float32Array(NSH), rr: new Float32Array(NSH), hx: new Float32Array(NSH), hy: new Float32Array(NSH), hz: new Float32Array(NSH),
  };
  let rs = 777; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  let nextFree = 0;
  function alloc() {
    for (let n = 0; n < NSH; n++) { const i = (nextFree + n) % NSH; if (S_.st[i] === 0) { nextFree = (i + 1) % NSH; return i; } }
    // full: recycle the oldest piece lying on the ground
    let best = -1, bt = -1; for (let i = 0; i < NSH; i++) if (S_.st[i] === 4 && S_.t[i] > bt) { bt = S_.t[i]; best = i; }
    return best;
  }
  function setShard(i, alpha) {
    if (alpha <= 0.003) { shard.mesh.setMatrixAt(i, _zero); shard.sCa[i * 4 + 3] = 0; return; }
    _ax.set(S_.ax[i], S_.ay[i], S_.az[i]); if (_ax.lengthSq() < 1e-6) _ax.set(0, 1, 0); _ax.normalize();
    _qt.setFromAxisAngle(_ax, S_.an[i]); _ps.set(S_.x[i], S_.y[i], S_.z[i]);
    const sd = S_.sd[i], s = S_.s[i]; _sc.set(s * (0.6 + 0.5 * ((sd * 7.31) % 1)), s * (0.5 + 0.6 * ((sd * 13.7) % 1)), 1);
    _m4.compose(_ps, _qt, _sc); shard.mesh.setMatrixAt(i, _m4);
    shard.sCa[i * 4] = S_.r[i]; shard.sCa[i * 4 + 1] = S_.g[i]; shard.sCa[i * 4 + 2] = S_.b[i]; shard.sCa[i * 4 + 3] = alpha;
    shard.sFa[i * 4] = S_.fl[i]; shard.sFa[i * 4 + 1] = S_.st[i] === 1 || S_.st[i] === 2 ? 1 : 0.3; shard.sFa[i * 4 + 2] = S_.sd[i];
  }

  // -------------------------------------------------------------------------------------------- the glass castells
  // mode 'rings' (alone, or no tronc3d): this part's own rings · 'tronc': the pieces of tronc3d's castell as glass
  let mode = 'rings', G0 = 0;
  const troncList = [], levelTop = new Float32Array(10), TCX = new Float32Array(4), TCZ = new Float32Array(4), _tq = new THREE.Quaternion(), _tv = new THREE.Vector3();
  function placeTronc() {
    for (let i = 0; i < NSH; i++) if (S_.st[i] === 1) S_.st[i] = 0;
    levelTop.fill(-1e9); let minY = 1e9; const cn = new Float32Array(4), r = rng(13);
    TCX.fill(0); TCZ.fill(0);
    for (const [lv, pc] of troncList) {
      _tv.set(pc.x, pc.y, pc.z); world.worldToLocal(_tv);
      const j = alloc(); if (j < 0) break;
      _tq.set(pc.q[0], pc.q[1], pc.q[2], pc.q[3]).normalize();
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_tq.w))), sn = Math.sqrt(Math.max(1e-8, 1 - _tq.w * _tq.w)), sg = _tq.w < 0 ? -1 : 1;
      S_.st[j] = 1; S_.rr[j] = -1; S_.hx[j] = _tv.x; S_.ry[j] = _tv.y; S_.hz[j] = _tv.z; S_.f[j] = lv - 1; S_.tw[j] = pc.tower & 3;
      S_.ax[j] = sg * _tq.x / sn; S_.ay[j] = sg * _tq.y / sn; S_.az[j] = sg * _tq.z / sn; S_.vx[j] = ang;
      S_.s[j] = Math.max(0.08, Math.min(1.3, Math.max(pc.sx, pc.sy, pc.sz) * 0.75)); S_.sd[j] = r(); S_.fl[j] = 0; S_.t[j] = 0; S_.hy[j] = 0;
      tintOf(j, FLOORCOL[Math.max(0, Math.min(8, lv - 1))], r());
      levelTop[lv] = Math.max(levelTop[lv], _tv.y); minY = Math.min(minY, _tv.y);
      TCX[pc.tower & 3] += _tv.x; TCZ[pc.tower & 3] += _tv.z; cn[pc.tower & 3]++;
    }
    for (let t = 0; t < 4; t++) if (cn[t]) { TCX[t] /= cn[t]; TCZ[t] /= cn[t]; }
    for (let lv = 1; lv < 10; lv++) if (levelTop[lv] < -1e8) levelTop[lv] = levelTop[lv - 1];
    G0 = Math.min(0, minY - 0.4);
  }
  // 4 in 5 shards are clear glass, 1 in 5 carries its floor's dawn colour
  function tintOf(i, col, rv) { const k = rv < 0.2 ? 1 : 0.38, c = [0.9 + (col[0] - 0.9) * k, 0.93 + (col[1] - 0.93) * k, 0.97 + (col[2] - 0.97) * k]; S_.r[i] = c[0]; S_.g[i] = c[1]; S_.b[i] = c[2]; }
  const TRC = 8.6, RINGS = 4, PER_ROW = 17;
  // off the centre of its wall (ARTE: the button's column ±0.9 m and the text stay clear): 26° to its right, on every wall
  const towerAng = (ti) => wallAng(castle.order[ti]) + 0.45;
  const castle = { order: [], maxF: 7, HF: 3.6, built: '' };
  // ARTE round 4: not four striped cylinders («tyres») but 1–2 glass towers with a castell's ASYMMETRIC silhouette: each floor its own
  // radius and an open arc (a shard ring with gaps), cantilevered off the floor below; shards in a 1 : 3 : 9 hierarchy of sizes
  const towerWalls = () => { const o = castle.order; return o.length >= 3 ? [o[0], o[2]] : [o[0]]; };
  function buildCastells() {
    const key = castle.order.join(',') + '|' + castle.maxF + '|' + castle.HF;
    if (key === castle.built) return; castle.built = key;
    for (let i = 0; i < NSH; i++) if (S_.st[i] === 1) S_.st[i] = 0;
    const r = rng(9), tws = towerWalls();
    for (let ti = 0; ti < tws.length; ti++) {
      const th = wallAng(tws[ti]) + 0.45, cx0 = Math.cos(th) * TRC, cz0 = Math.sin(th) * TRC;
      let ox = 0, oz = 0;
      for (let f = 0; f < castle.maxF; f++) {
        const col = FLOORCOL[Math.min(8, Math.round(f * 8 / Math.max(1, castle.maxF - 1)))];
        ox = Math.max(-1.5, Math.min(1.5, ox + (r() - 0.5) * 1.1)); oz = Math.max(-1.5, Math.min(1.5, oz + (r() - 0.5) * 1.1));
        const rad = (1.3 + r() * 1.1) * (1 - 0.25 * f / Math.max(1, castle.maxF - 1)), a0 = r() * TAU, span = TAU * (0.55 + r() * 0.4);
        const n = Math.round(70 + rad * 34);
        for (let k = 0; k < n; k++) {
          const i = alloc(); if (i < 0) break;
          const a = a0 + span * (k / n) + (r() - 0.5) * 0.1, q = r();
          S_.st[i] = 1; S_.tw[i] = ti; S_.f[i] = f; S_.ra[i] = a; S_.ry[i] = f * castle.HF + 0.3 + r() * (castle.HF - 0.5); S_.rr[i] = rad + (r() - 0.5) * 0.35;
          S_.hx[i] = cx0 + ox; S_.hz[i] = cz0 + oz;
          S_.s[i] = q < 0.08 ? 1.1 + r() * 0.4 : q < 0.35 ? 0.62 + r() * 0.22 : 0.32 + r() * 0.14; S_.sd[i] = r();
          tintOf(i, col, r()); S_.fl[i] = 0; S_.t[i] = 0;
          S_.hy[i] = (r() - 0.5) * 0.7;
        }
      }
    }
  }
  const ringPos = (i, time, out) => {
    if (S_.rr[i] < 0) { out.set(S_.hx[i], S_.ry[i], S_.hz[i]); return Math.atan2(S_.hz[i] - TCZ[S_.tw[i] & 3], S_.hx[i] - TCX[S_.tw[i] & 3]); }
    const spin = time * 0.06 * (S_.f[i] % 2 ? 1 : -1), a = S_.ra[i] + spin;
    out.set(S_.hx[i] + Math.cos(a) * S_.rr[i], S_.ry[i], S_.hz[i] + Math.sin(a) * S_.rr[i]);
    return a;
  };
  function release(i, time, heavy) {                                // a ring shard lets go
    const a = ringPos(i, time, _ps);
    S_.x[i] = _ps.x; S_.y[i] = _ps.y; S_.z[i] = _ps.z;
    // towards the room: aimed at a point 1 m behind the centre of the tower's wall (where the hand target is)
    const Wt = mode === 'tronc' ? walls[S_.tw[i] % NW] : walls[towerWalls()[S_.tw[i]] ?? castle.order[0]], ex = Wt.centre.x - Wt.normal.x * 1.0 - _ps.x, ez = Wt.centre.z - Wt.normal.z * 1.0 - _ps.z, el = Math.hypot(ex, ez) || 1;
    const rx = Math.cos(a), rz = Math.sin(a);
    const toRoom = !heavy && rnd() < 0.6 ? 2.2 + rnd() * 2.4 : 0;
    const out = heavy ? 0.3 + rnd() * 0.8 : 0.4 + rnd() * 0.9;
    S_.vx[i] = rx * out + (ex / el) * toRoom + (rnd() - 0.5) * 0.4; S_.vz[i] = rz * out + (ez / el) * toRoom + (rnd() - 0.5) * 0.4; S_.vy[i] = heavy ? -rnd() : 0.3 + rnd() * 0.9;
    S_.ax[i] = rnd() - 0.5; S_.ay[i] = rnd() - 0.5; S_.az[i] = rnd() - 0.5; S_.an[i] = rnd() * TAU; S_.av[i] = (0.8 + rnd() * 2.5) * (rnd() < 0.5 ? -1 : 1);
    S_.st[i] = 2; S_.t[i] = 0; S_.fl[i] = 0.4;
  }
  function chips(i, n, speed) {                                     // a shard shatters on the ground
    for (let k = 0; k < n; k++) {
      const j = alloc(); if (j < 0) return;
      S_.st[j] = 4; S_.x[j] = S_.x[i] + (rnd() - 0.5) * 0.2; S_.y[j] = G0 + 0.05; S_.z[j] = S_.z[i] + (rnd() - 0.5) * 0.2;
      const a = rnd() * TAU, hv = (0.4 + rnd()) * Math.min(1.5, speed * 0.4);
      S_.vx[j] = Math.cos(a) * hv; S_.vz[j] = Math.sin(a) * hv; S_.vy[j] = 0.8 + rnd() * Math.min(2.5, speed * 0.5);
      S_.ax[j] = rnd() - 0.5; S_.ay[j] = rnd() - 0.5; S_.az[j] = rnd() - 0.5; S_.an[j] = rnd() * TAU; S_.av[j] = (3 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1);
      S_.s[j] = S_.s[i] * (0.22 + rnd() * 0.25); S_.sd[j] = rnd(); S_.r[j] = S_.r[i]; S_.g[j] = S_.g[i]; S_.b[j] = S_.b[i]; S_.t[j] = 0; S_.fl[j] = 0.8; S_.f[j] = -1;
    }
  }
  // the near layer: glass chips 0.2–1 m behind the walls (≈ 8 per wall), drifting; wrapped in height (they rise as we come down)
  const NEAR = [], SPAN = 8, YMIN = -2;
  { const r = rng(91); for (let k = 0; k < 8 * NW; k++) { const i = alloc(); S_.st[i] = 5; const w = Math.floor(k / 8), col = FLOORCOL[Math.floor(r() * 9)]; NEAR.push({ i, w, u: 0.05 + r() * 0.9, d: 0.2 + r() * 0.8, y0: r() * SPAN }); S_.s[i] = 0.06 + r() * 0.1; S_.sd[i] = r(); tintOf(i, col, r()); S_.ax[i] = r() - 0.5; S_.ay[i] = r() - 0.5; S_.az[i] = 1.5; S_.an[i] = r() * TAU; S_.av[i] = (r() - 0.5) * 0.5; } }

  // -------------------------------------------------------------------------------------------- hands and flowers (on the wall planes)
  // kind 0 a hand (a warm landing ring, a soft halo that grows while it holds) · kind 1 a FLOWER (grows where a hand caught a shard)
  const MAXHS = 16, MAXFL = 64, MAXFX = 16, NSP = (MAXHS + MAXFL + MAXFX + 4);   // + the bands (T-042)
  const spG = new THREE.InstancedBufferGeometry();
  spG.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); spG.setIndex([0, 1, 2, 0, 2, 3]);
  const pA = new Float32Array(NSP * 4), pB = new Float32Array(NSP * 4), pC = new Float32Array(NSP * 4), pD = new Float32Array(NSP * 4);
  const PA = new THREE.InstancedBufferAttribute(pA, 4), PB = new THREE.InstancedBufferAttribute(pB, 4), PC = new THREE.InstancedBufferAttribute(pC, 4), PD = new THREE.InstancedBufferAttribute(pD, 4);
  for (const a of [PA, PB, PC, PD]) a.setUsage(THREE.DynamicDrawUsage);
  spG.setAttribute('hA', PA); spG.setAttribute('hB', PB); spG.setAttribute('hC', PC); spG.setAttribute('hD', PD); spG.instanceCount = 0; geos.push(spG);
  {
    // hA = centre xyz, kind · hB = right axis xyz, half size · hC = wall normal xyz, - · hD = kind 0: age, held, -, - · kind 1: r, g, b (colour), grow
    const A = attribute('hA', 'vec4'), Bx = attribute('hB', 'vec4'), Cn = attribute('hC', 'vec4'), D = attribute('hD', 'vec4');
    const ax = Bx.xyz, nrm = Cn.xyz, upv = cross(nrm, ax), q = positionGeometry.xy;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    m.positionNode = A.xyz.add(ax.mul(q.x.mul(Bx.w))).add(upv.mul(q.y.mul(Bx.w))).add(nrm.mul(-0.004));
    const vQ = varying(q), vK = varying(A.w), vD = varying(D), vN = varying(nrm), vSd = varying(Cn.w);
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const out = vec4(0).toVar(), r = length(vQ);
      If(vK.lessThan(0.5), () => {
        const age = vD.x, held = vD.y;
        const ring = exp(r.sub(age.mul(1.6).add(0.15).min(0.9)).div(0.035).pow(2).negate()).mul(exp(age.mul(-2.0)));
        const kd = vD.z, qy = select(vQ.y.lessThan(0), vQ.y.div(kd.mul(3.0).add(1)), vQ.y), r2h = vQ.x.mul(vQ.x).add(qy.mul(qy));   // T-047: stretched down by the descent
        const halo = exp(r2h.mul(-30)).mul(held.mul(0.22).add(kd.mul(0.3)));
        out.assign(vec4(v3(C.sun), ring.mul(0.6).add(halo).min(1)));
      }).ElseIf(vK.lessThan(1.5), () => {
        // a GLASS flower (ARTE round 2): a rosette of 6–9 shards — each petal a long irregular kite of clear glass with a bright rim, a
        // little turned from its neighbours, the caught shard's tint on 1 in 3, a cluster of small bright chips at the heart; it opens with `grow`
        const grow = vD.w, n = floor(fract(vSd.mul(9.1)).mul(4)).add(6), th = atan(vQ.y, vQ.x).add(vSd.mul(6.0)).add(3.1416);
        const rr = r.div(grow.max(0.02)), sec = th.div(6.2832).mul(n), k = floor(sec), fk = fract(sec).sub(0.5);
        const hk = fract(sin(k.add(vSd.mul(31.0)).mul(12.9898)).mul(43758.5453));
        const L = hk.mul(0.3).add(0.68), wid = hk.mul(0.25).add(0.45);
        // kite: widest at 40 % of its length, a point at both ends; across-coordinate in units of the sector
        const prof = select(rr.lessThan(L.mul(0.4)), rr.div(L.mul(0.4)), float(1).sub(rr.sub(L.mul(0.4)).div(L.mul(0.6)))).max(0);
        const across = abs(fk.add(hk.sub(0.5).mul(0.25))), half = prof.mul(wid);
        const dEdge = half.sub(across).mul(rr.max(0.05)).mul(6.2832).div(n);             // ≈ metres-ish (in units of the sprite radius)
        const fw = fwidth(dEdge).add(0.0005);
        const inside = smoothstep(fw.negate(), fw, dEdge).mul(step(0.06, rr));
        const rimL = smoothstep(fw.mul(2.5), 0.0, abs(dEdge)).mul(step(0.06, rr)).mul(step(rr, L));
        const petalC = mix(vec3(0.85, 0.88, 0.93), vD.xyz, hk.mul(0.4).add(0.45));   // every petal tinted by the floor it came from, more or less
        const sheen = pow(float(1).sub(abs(fk.mul(2.0))), 3).mul(smoothstep(0.1, 0.7, rr)).mul(0.25);
        const heart = smoothstep(0.12, 0.05, rr).mul(step(0.5, fract(sin(floor(vQ.x.mul(40.0)).add(floor(vQ.y.mul(40.0)).mul(7.0))).mul(43758.5))).mul(0.8).add(0.2));
        const col = petalC.mul(0.42).add(v3(C.sun).mul(rimL.mul(0.75).add(sheen))).add(v3(C.peach).mul(heart.mul(0.6)));
        out.assign(vec4(col, max(inside.mul(0.45).add(rimL.mul(0.75)).add(sheen.mul(inside)), heart.mul(0.8)).min(1)));
      }).ElseIf(vK.greaterThan(2.5), () => {
        // T-042 THE BAND to bring down: a horizontal bar of glass across the wall (±1 m), a bright core and two rims; vD.x crack (0..1),
        // vD.y strength, vD.z the floor's colour (0..1)
        const y = vQ.y.mul(1.1), x = abs(vQ.x), crk = vD.x;
        const ends = smoothstep(1.0, 0.8, x);
        const zig = sin(vQ.x.mul(31.0)).mul(0.012).add(sin(vQ.x.mul(77.0)).mul(0.006)).mul(crk);
        const core = exp(y.sub(zig).div(0.018).pow(2).negate()), rims = exp(abs(y).sub(0.045).div(0.006).pow(2).negate()).mul(0.6), fill = step(abs(y), 0.045).mul(0.18);
        const cracks = step(0.82, fract(vQ.x.mul(9.0).add(sin(vQ.x.mul(23.0))))).mul(step(abs(y), 0.05)).mul(crk);
        const tint = mix(v3(C.sun), mix(v3(C.rose), v3(C.aqua), vD.z), 0.45);
        out.assign(vec4(tint.mul(core.mul(1.2).add(rims).add(fill)).add(v3(C.sun).mul(cracks.mul(1.5))), core.add(rims).add(fill).add(cracks).mul(ends).mul(vD.y).min(1)));
      }).Else(() => {
        // the CATCH: a flash ring that opens fast and a soft core, in the floor's colour (vD.xyz), age vD.w (0..1)
        const a = vD.w, ring = exp(r.sub(a.mul(0.9).add(0.1)).div(0.05).pow(2).negate()).mul(float(1).sub(a)), core = exp(r.mul(r).mul(-30)).mul(float(1).sub(a).pow(2));
        out.assign(vec4(mix(vD.xyz, v3(C.sun), 0.25).mul(1.1), ring.mul(0.85).add(core.mul(0.35)).min(1).mul(colDim(0.55))));   // capped inside the quiet zones
      });
      return vec4(out.xyz.mul(uGain), out.w.mul(uWorld.mul(0.7).add(0.3)));
    })();
    m.fog = false; mats.push(m);
    var sprites = new THREE.Mesh(spG, m); sprites.frustumCulled = false; sprites.renderOrder = 9; object.add(sprites);
  }
  const flowers = Array.from({ length: MAXFL }, () => ({ on: false, w: 0, u: 0, y: 0, r: 1, g: 1, b: 1, age: 0, size: 0.3, seed: 0 }));
  let nSp = 0;
  const flashes = Array.from({ length: MAXFX }, () => ({ on: false, w: 0, u: 0, y: 0, r: 1, g: 1, b: 1, age: 0 })); let flashN = 0;
  const _w = new THREE.Vector3();
  function sprite(kind, wi, u, y, half, d0, d1, d2, d3, seed) {
    if (nSp >= NSP) return;
    const w = walls[wi], k = nSp * 4;
    _w.copy(w.pa).addScaledVector(w.right, u * w.width).setY(y);
    pA[k] = _w.x; pA[k + 1] = _w.y; pA[k + 2] = _w.z; pA[k + 3] = kind;
    pB[k] = w.right.x; pB[k + 1] = w.right.y; pB[k + 2] = w.right.z; pB[k + 3] = half;
    pC[k] = w.normal.x; pC[k + 1] = w.normal.y; pC[k + 2] = w.normal.z; pC[k + 3] = seed;
    pD[k] = d0; pD[k + 1] = d1; pD[k + 2] = d2; pD[k + 3] = d3; nSp++;
  }

  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }
  function fxAt(p, strength, mat, kind) {
    const W = room.walls, e = room.eye, dx = p.x - e.x, dz = p.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
  }
  let shatterSnd = 0;
  const _fx = new THREE.Vector3();

  // -------------------------------------------------------------------------------------------- per frame
  const pool = Array.from({ length: 32 }, () => ({ stroke: null, born: 0, seen: 0, top: 0 }));   // T-047: top = the hand's highest point in this descent
  const HP = Array.from({ length: MAXHS }, () => ({ wall: 0, u: 0, x: 0, y: 0, z: 0 }));
  let troncHidden = false, passGone = true, frame = 0, time = 0, prevFloors = -1, Acur = -1, Avel = 0, trickle = 0, fallen = false, caught = 0, shattered = 0, maxV = 0;
  const _p = new THREE.Vector3();
  function addFlower(wi, u, y, i) {
    // more catches near an existing flower make it bigger; otherwise a new one (the oldest gives way)
    for (const f of flowers) if (f.on && f.w === wi && Math.abs(f.u - u) * walls[wi].width < 0.35 && Math.abs(f.y - y) < 0.35) { f.size = Math.min(0.45, f.size + 0.04); f.age = Math.min(f.age, 0.6); return; }
    let best = flowers[0]; for (const f of flowers) { if (!f.on) { best = f; break; } if (f.age > best.age) best = f; }
    const fc = FLOORCOL[Math.max(0, Math.min(8, S_.f[i] < 0 ? 0 : S_.f[i]))];
    Object.assign(best, { on: true, w: wi, u, y, r: fc[0], g: fc[1], b: fc[2], age: 0, size: 0.25 + rnd() * 0.07, seed: rnd() });
    fxImpact(wi, u, 0.5, 'petal', 'bloom');
  }
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    time = input.time ?? time + dt; uTime.value = time;
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    const pr = input.params || P, S = input.state || null;
    // ---- state (the score's, or a stand-in)
    let floors, maxF, fall = false;
    const order = [];
    if (S && Array.isArray(S.walls)) for (let w = 0; w < S.walls.length && w < NW; w++) if (S.walls[w]) order.push(w);
    if (!order.length) { const nw = Math.max(2, Math.min(NW, Math.round(pr.walls ?? NW))); for (let w = 0; w < nw; w++) order.push(w); }
    const arrive = input.arrive ?? (S ? 1 : pr.arrive ?? 1), leave = input.leave ?? (S ? 0 : pr.leave ?? 0);
    if (S) {
      maxF = Math.max(1, S.stats?.maxFloors || S.floors || 7); floors = S.floors ?? 0;
      fall = S.block === 'fall' || S.outcome === 'carregat';
    } else {
      maxF = Math.max(1, Math.round(pr.maxFloors ?? 7));
      if (pr.cycle > 0) { const c = (time % pr.cycle) / pr.cycle; floors = Math.max(0, maxF - Math.floor(c * (maxF + 1.5))); }
      else floors = pr.floors >= 0 ? Math.round(pr.floors) : Math.round(maxF * (1 - clamp01(input.progress ?? pr.progress ?? 0)));
      fall = !!pr.fall && time >= (pr.fallDelay ?? 0);
    }
    floors = Math.min(floors, maxF);
    castle.HF = pr.floorH > 0 ? pr.floorH : 3.6;
    if (castle.order.join(',') !== order.join(',') || castle.maxF !== Math.min(9, maxF)) { castle.order = order; castle.maxF = Math.min(9, maxF); }
    // ---- THE TRONC'S CASTELL TURNED TO GLASS (ARTE round 2): when tronc3d is in the work, its pieces are taken (takeFloor, hidden there)
    // and become glass shards at the same places, sizes and turns; this part brings them down floor by floor. Given back when we go.
    const tp = ctx.parts?.tronc3d;
    const leavingToFall = leave > 0 && (S ? (S.block === 'fall' || S.outcome === 'carregat' || S.outcome === 'intent') : !!pr.fall);
    if (tp?.takeFloor) {
      if (leave >= 0.99 || arrive <= 0.01) passGone = true;
      // only ever inside the bajada itself (never during the host's prewarm, a load or a jump elsewhere)
      const inBaixada = !!S && S.block === 'baixada';
      if (passGone && inBaixada && arrive > 0.01 && leave < 0.99) {
        passGone = false;
        if (troncHidden) releaseTronc();                              // still taken from a pass that left into the fall
        troncHidden = true; troncList.length = 0;
        try { world.updateMatrixWorld(true); for (let i = 0; i <= 9; i++) for (const pc of tp.takeFloor(i, { hide: true })) troncList.push([i, pc]); } catch { troncList.length = 0; }
        // a tronc that was hardly built (a rehearsal jump) gives too few pieces for a tower: give them back and draw our own rings
        const lvs = new Set(troncList.map((t) => t[0]));
        if (troncList.length >= 150 && lvs.size >= 4) { mode = 'tronc'; placeTronc(); prevFloors = -1; }   // a real castell: ≥ 3 floors above the plinth
        // T-053 (ARTE r5): … but they stay HIDDEN (a white porcelain pinya at the text's height read «white on white»); given back by releaseTronc()
        else { troncList.length = 0; if (mode === 'tronc') { mode = 'rings'; castle.built = ''; G0 = 0; } }
      } else if (troncHidden && ((passGone && !leavingToFall) || (S && S.block !== 'baixada' && S.block !== 'fall') || !S)) releaseTronc();
      // leaving INTO THE FALL the floors stay taken (fall3d owns what comes next; giving them back would flash the old tower for a frame):
      // they go back with releaseTronc() — called by the host at the next pass, or by this part when it arrives again
    }
    const rebuilt = mode === 'rings' && castle.built !== castle.order.join(',') + '|' + castle.maxF + '|' + castle.HF;
    if (mode === 'rings') buildCastells();
    // floors that already came down (a fresh start or a jump): their rings are simply gone; a fresh start brings the tower back
    if (rebuilt || prevFloors < 0 || floors > prevFloors) {
      if (floors > prevFloors && prevFloors >= 0 && !rebuilt) { if (mode === 'rings') { castle.built = ''; buildCastells(); } else placeTronc(); fallen = false; }
      for (let i = 0; i < NSH; i++) if (S_.st[i] === 1 && S_.f[i] >= floors) S_.st[i] = 0;
      for (const f of flowers) f.on = false;
      for (let i = 0; i < NSH; i++) if (S_.st[i] === 2 || S_.st[i] === 3 || S_.st[i] === 4) S_.st[i] = 0;
    } else if (floors < prevFloors) {
      // 'down': the top ring(s) let go
      for (let i = 0; i < NSH; i++) if (S_.st[i] === 1 && S_.f[i] >= floors) release(i, time, false);
    }
    prevFloors = floors;
    // the fall: the whole tower at once (leaving into the fall, or the study's switch)
    const fallLeave = leave > 0 && (S ? (S.block === 'fall' || S.outcome === 'carregat') : !!pr.fall);
    if ((fall || fallLeave) && !fallen) { fallen = true; for (let i = 0; i < NSH; i++) if (S_.st[i] === 1) { release(i, time, true); S_.t[i] = -S_.ry[i] * 0.08; } }
    uDrain.value = fallen ? Math.min(1, uDrain.value + dt / 4) : Math.max(0, uDrain.value - dt);
    // ---- the way down: the eye stays at the top of what still stands (a damped spring; ≤ 1.1 m/s)
    // the eye 1.6 floors below the top (rings) / 4 m below the top of the tronc's highest standing floor: the tower fills the wall
    const liftT = mode === 'rings' ? Math.max(0, (floors - 1.6) * castle.HF) : Math.max(G0, (levelTop[Math.max(0, Math.min(9, floors))] ?? 0) - 4.0 - 1.6);
    const At = 1.6 + liftT;
    if (Acur < 0) { Acur = At; Avel = 0; }
    else { const om = 0.9, acc = Math.max(-0.8, Math.min(0.8, om * om * (At - Acur) - 2 * om * Avel)); Avel = Math.max(-1.1, Math.min(1.1, Avel + acc * dt)); Acur += Avel * dt; maxV = Math.max(maxV, Math.abs(Avel)); }
    const lift = Acur - 1.6, A = 1.6 + lift - G0;                     // A: the eye's height over the ground (the water)
    uA.value = A; world.position.y = -lift; greenhouses.position.y = G0;
    { const ea = wallAng(EAST_WALL) + 0.8; sunV.set(Math.cos(ea), -0.035 + 0.03 * (1 - floors / Math.max(1, maxF)), Math.sin(ea)).normalize(); }   // just below the horizon on the east wall; it nears it as we come down
    // ---- arrive / leave, light
    uWorld.value = sm((arrive - 0.3) / 0.6) * (1 - sm((leave - 0.05) / 0.5));
    uDomeIn.value = clamp01((arrive - 0.1) / 0.6) * (1 - sm((leave - 0.55) / 0.4));
    dome.visible = uDomeIn.value > 0.001; greenhouses.visible = uWorld.value > 0.02 && (pr.town ?? true) !== false;   // `town` off: the host's square (plaza.js silhouette) draws it instead
    uGain.value = pr.gain ?? 1;
    // ---- hands
    const hands = input.hands || [];
    let nH = 0; nSp = 0;
    const baixOn = S ? S.block === 'baixada' : !!pr.lower, lowerEv = !!(S && input.events && input.events.includes && input.events.includes('lower'));
    for (const h of hands) {
      let st = null; for (const p of pool) if (p.stroke === h.stroke) { st = p; break; }
      if (!st) { st = pool.find((p) => p.seen < frame - 1) || pool[0]; st.stroke = h.stroke; st.born = time; st.top = h.pos.y; }
      st.seen = frame;
      const held = Math.min(1, (time - st.born) / 2.0);
      // T-047 (#20): the halo stretches DOWN as this hand's descent grows (from its highest point, / the score's 0.35 m), same frame
      if (lowerEv) st.top = h.pos.y; st.top = Math.max(st.top, h.pos.y);
      const lk = baixOn ? clamp01((st.top - h.pos.y) / 0.35) : 0;
      sprite(0, h.wall, h.u, h.pos.y, 0.8, time - st.born, held, lk, 0, 0);
      if (nH < MAXHS && !fallen) { const o = HP[nH++]; o.wall = h.wall; o.u = h.u; o.x = h.pos.x; o.y = h.pos.y; o.z = h.pos.z; }
    }
    for (const p of pool) if (p.seen !== frame) p.stroke = null;
    // ---- the trickle: a few small shards keep falling from the top ring while floors remain
    const rain = (pr.rain ?? 1) * (floors > 0 && !fallen ? 1 : 0) * uWorld.value;
    trickle += dt * 2.2 * rain;
    while (trickle >= 1) {
      trickle -= 1;
      const tws = towerWalls(), ti = Math.floor(rnd() * tws.length), th = wallAng(tws[ti]) + 0.45, j = alloc(); if (j < 0) break;
      const col = FLOORCOL[Math.min(8, Math.round((floors - 1) * 8 / Math.max(1, castle.maxF - 1)))];
      S_.st[j] = 1; S_.tw[j] = ti; S_.f[j] = floors - 1; S_.ra[j] = rnd() * TAU; S_.ry[j] = (floors - 1) * castle.HF + castle.HF * rnd(); S_.rr[j] = 1.4;
      S_.hx[j] = Math.cos(th) * TRC; S_.hz[j] = Math.sin(th) * TRC; S_.s[j] = 0.14 + rnd() * 0.16; S_.sd[j] = rnd(); tintOf(j, col, rnd());
      release(j, time, false);
    }
    // ---- physics
    const ex = EYE.x, ey = EYE.y, ez = EYE.z;
    let nFall = 0;
    for (let i = 0; i < NSH; i++) {
      const st = S_.st[i];
      if (st === 0) { setShard(i, 0); continue; }
      if (st === 1) {                                              // in its ring (arrive: flies in; leave: parts and rises)
        const a = ringPos(i, time, _p), sd = S_.sd[i];
        const kA = clamp01((arrive - 0.05 - sd * 0.25 - (S_.ry[i] / 40) * 0.2) / 0.5), kL = sm((leave - 0.05 - sd * 0.2) / 0.5);
        const scat = (1 - sm(kA)) * (6 + sd * 6) + kL * 5;
        S_.x[i] = _p.x + Math.cos(a) * scat; S_.y[i] = _p.y + (1 - sm(kA)) * (3 + sd * 8) + kL * (4 + sd * 10); S_.z[i] = _p.z + Math.sin(a) * scat;
        // facing out from the axis, tilted
        if (S_.rr[i] >= 0) { S_.ax[i] = 0; S_.ay[i] = 1; S_.az[i] = 0; S_.an[i] = -a + Math.PI / 2 + S_.hy[i] + (1 - kA) * sd * 6 + kL * sd * 4; }
        else S_.an[i] = S_.vx[i] + (1 - kA) * sd * 6 + kL * sd * 4;    // a tronc piece keeps its own turn (stored in vx while it stands)
        S_.fl[i] = Math.max(0, S_.fl[i] - dt * 0.8);
        setShard(i, sm(kA) * (1 - kL) * 0.95); continue;
      }
      if (st === 5) continue;                                      // the near layer (below)
      S_.t[i] += dt;
      if (S_.t[i] < 0) { setShard(i, 1); continue; }                // the fall: a stagger from the bottom up
      if (st === 3) {                                              // caught: it hangs, flares, fades
        S_.fl[i] = Math.max(0, 1.2 - S_.t[i] * 1.4); S_.an[i] += S_.av[i] * dt * 0.2;
        if (S_.t[i] > 1.0) { S_.st[i] = 0; setShard(i, 0); } else setShard(i, 1 - sm((S_.t[i] - 0.4) / 0.6));
        continue;
      }
      let x = S_.x[i], y = S_.y[i], z = S_.z[i];
      if (st === 2) {
        nFall++;
        // flat glass gliding: slow vertically (drag 3.8/s: terminal ≈ 2.6 m/s), carried horizontally (drag 0.35/s), fluttering; heavy when it falls
        const heavy = fallen, kv = heavy ? 0.25 : 3.8, kh = heavy ? 0.15 : 0.35;
        S_.vy[i] += (-9.8 - S_.vy[i] * kv) * dt;
        const fl = heavy ? 0 : Math.sin(S_.t[i] * (2 + S_.sd[i] * 2) + S_.sd[i] * 20) * 0.8;
        S_.vx[i] += (-S_.vx[i] * kh + fl * S_.az[i]) * dt; S_.vz[i] += (-S_.vz[i] * kh - fl * S_.ax[i]) * dt;
        x += S_.vx[i] * dt; y += S_.vy[i] * dt; z += S_.vz[i] * dt;
        // nothing enters the room
        const rr = Math.hypot(x, z); if (rr < 3.9) { const f = 3.9 / Math.max(rr, 0.01); x *= f; z *= f; S_.vx[i] *= 0.3; S_.vz[i] *= 0.3; }
        S_.an[i] += S_.av[i] * dt; S_.fl[i] = Math.max(0, S_.fl[i] - dt * 0.6);
        // CAUGHT: seen through a held hand (the projection of the shard on that wall, from the eye, within 0.42 m of the hand)
        if (nH && !fallen && S_.t[i] > 0.45) {
          const dx = x - ex, dy = y - lift - ey + 1.6 - 1.6, dz = z - ez;
          const yR = y - lift;                                      // room frame
          for (let k = 0; k < nH; k++) {
            const H = HP[k], w = walls[H.wall], kk = -(dx * w.normal.x + dz * w.normal.z); if (kk <= 0.2) continue;
            const de = (w.centre.x - ex) * w.normal.x + (w.centre.z - ez) * w.normal.z, t = -de / kk;
            if (t >= 1 || t <= 0) continue;
            const px = ex + dx * t, py = ey + (yR - ey) * t, pz = ez + dz * t;
            const ddx = px - H.x, ddy = py - H.y, ddz = pz - H.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz < 0.5 * 0.5 && Math.hypot(dx, dz) * (1 - t) < 9) {
              S_.st[i] = 3; S_.t[i] = 0; S_.fl[i] = 1.2; caught++;
              { const fc = FLOORCOL[Math.max(0, Math.min(8, S_.f[i] < 0 ? 0 : S_.f[i]))]; S_.r[i] = fc[0]; S_.g[i] = fc[1]; S_.b[i] = fc[2]; S_.s[i] = Math.min(0.7, S_.s[i] * 1.4);
                const fx = flashes[flashN++ % MAXFX]; Object.assign(fx, { on: true, w: H.wall, u: H.u, y: H.y, r: fc[0], g: fc[1], b: fc[2], age: 0 }); }
              addFlower(H.wall, H.u, H.y, i); fxImpact(H.wall, H.u, 0.55, 'glass', 'hit');
              break;
            }
            void dy;
          }
          if (S_.st[i] === 3) { S_.x[i] = x; S_.y[i] = y; S_.z[i] = z; setShard(i, 1); continue; }
        }
        // the ground: shatter (fast enough) or bounce
        const half = S_.s[i] * 0.4 + G0;
        if (y < half) {
          const sp = Math.hypot(S_.vx[i], S_.vy[i], S_.vz[i]);
          y = half;
          if (sp > 2.2 && S_.s[i] > 0.12) {
            chips(i, 3 + Math.floor(rnd() * 3), sp); shattered++;
            if (time - shatterSnd > 0.25) { shatterSnd = time; _fx.set(x, y - lift, z); fxAt(_fx, Math.min(1, sp / 8), 'glass', 'floor'); }
            S_.st[i] = 0; setShard(i, 0); continue;
          }
          S_.vy[i] = Math.abs(S_.vy[i]) * 0.3; S_.vx[i] *= 0.6; S_.vz[i] *= 0.6; S_.st[i] = 4; S_.t[i] = 0;
        }
        if (y < G0 - 40) { S_.st[i] = 0; setShard(i, 0); continue; }
        S_.x[i] = x; S_.y[i] = y; S_.z[i] = z;
        setShard(i, 1); continue;
      }
      if (st === 4) {                                              // on the ground: bounce, settle flat, lie glittering (≤ 45 s)
        if (S_.vy[i] !== 0 || y > G0 + S_.s[i] * 0.05 + 0.02) {
          S_.vy[i] -= 9.8 * dt; x += S_.vx[i] * dt; y += S_.vy[i] * dt; z += S_.vz[i] * dt; S_.an[i] += S_.av[i] * dt;
          if (y < G0 + 0.02) { y = G0 + 0.02; if (Math.abs(S_.vy[i]) < 0.6) { S_.vy[i] = 0; S_.vx[i] = 0; S_.vz[i] = 0; S_.ax[i] = 1; S_.ay[i] = 0; S_.az[i] = 0; S_.an[i] = -Math.PI / 2; } else { S_.vy[i] = -S_.vy[i] * 0.35; S_.vx[i] *= 0.6; S_.vz[i] *= 0.6; S_.av[i] *= 0.5; } }
        }
        S_.x[i] = x; S_.y[i] = y; S_.z[i] = z; S_.fl[i] = Math.max(0, S_.fl[i] - dt);
        const life = S_.t[i];
        if (life > 45) { S_.st[i] = 0; setShard(i, 0); continue; }
        setShard(i, (1 - sm((life - 42) / 3)) * 0.9 * uWorld.value);
        continue;
      }
    }
    // ---- the near layer
    for (const n of NEAR) {
      const i = n.i, w = walls[n.w];
      const y = YMIN + (((n.y0 + lift * 1.0 + time * 0.05) % SPAN) + SPAN) % SPAN;
      _p.copy(w.pa).addScaledVector(w.right, n.u * w.width).setY(y).addScaledVector(w.normal, -n.d);
      S_.x[i] = _p.x; S_.y[i] = _p.y + lift; S_.z[i] = _p.z; S_.an[i] += S_.av[i] * dt;
      const yy = (y - YMIN) / SPAN;
      setShard(i, sm(yy / 0.12) * sm((1 - yy) / 0.12) * 0.85 * uWorld.value);
    }
    shard.mesh.instanceMatrix.needsUpdate = true; shard.SC.needsUpdate = true; shard.SF.needsUpdate = true;
    // ---- flowers
    for (const f of flowers) {
      if (!f.on) continue;
      f.age += dt;
      // it opens in ~1.4 s with a small overshoot and is brighter while it opens; then it STAYS (the glass garden) until the bajada leaves
      const grow = sm(f.age / 1.4) * f.size * (1 + 0.12 * Math.sin(f.age * 6) * Math.exp(-f.age * 1.5)) * (1 - sm((leave - 0.6) / 0.4));
      const lum = 1 + 0.8 * Math.max(0, 1 - f.age);
      if (grow > 0.003) sprite(1, f.w, f.u, f.y, grow * 1.05, Math.min(1.5, f.r * lum), Math.min(1.5, f.g * lum), Math.min(1.5, f.b * lum), 1 / 1.05, f.seed);
    }
    // ---- T-042 THE BAND (the bajada = to bring down): on each structure wall a glass band at the hands' height (state.band[w], the median
    // of the hands as they come down); at 'lower' it BREAKS into shards of the floor's colour that fall (caught as ever); 'crack' (too fast,
    // or let go): the band cracks and spills shards at once. Study: params.lower (the band follows the wall's hands, or comes down by itself,
    // and breaks at 0.85 m).
    {
      const lowerOn = S ? S.block === 'baixada' && Array.isArray(S.band) : !!pr.lower;
      if (lowerOn && !fallen) {
        const tws = castle.order.length ? castle.order : [0];
        const ev = (S && input.events) || [];
        const lowered = ev.includes('lower'), cracked = ev.includes('crack');
        for (const w of tws) {
          let by, act = 1;
          // T-047 (#12): the band APPEARS HIGH (1.6 m) and waits there, breathing, for the hands to come up and take it (a hand ≥ 1.4 m
          // on the wall, or a descent the score already sees); taken, it follows the wall's hands down (median, same frame). After each
          // 'lower' it is high again; with no hands on the wall for 1.5 s it goes back up.
          let nW = 0; for (const h of hands) if (h.wall === w) bandYs[nW++] = h.pos.y;
          const ys = bandYs.subarray(0, nW).sort(), med = nW ? ys[nW >> 1] : 0, hi = nW ? ys[nW - 1] : 0;
          if (lowered) { bandTaken[w] = 0; bandLowAt[w] = time; }
          bandAway[w] = nW ? 0 : bandAway[w] + dt; if (bandAway[w] > 1.5) bandTaken[w] = 0;
          if (!bandTaken[w] && nW && (hi >= 1.4 || (S && (S.lowerK ?? 0) > 0.15 && time - bandLowAt[w] > 1.5))) bandTaken[w] = 1;   // (after a 'lower' it waits high 1.5 s)
          if (!S && !nW) by = 1.7 - ((time * 0.12) % 0.95);              // study: alone it comes down by itself
          else if (!bandTaken[w]) { by = 1.6 + 0.025 * Math.sin(time * 2.2 + w); act = 0.75 + 0.25 * Math.sin(time * 2.2 + w); }
          else if (nW) by = med;
          else by = S ? S.band[w] || 0.9 : 1.6;
          bandY[w] = bandY[w] < 0 ? by : bandY[w] + (by - bandY[w]) * (1 - Math.exp(-dt * 8));
          const sp = Math.abs(bandY[w] - bandPrev[w]) / Math.max(dt, 1e-3); bandPrev[w] = bandY[w];
          if (!S) { if (bandArm[w] && bandY[w] < 0.85) { bandArm[w] = false; breakBand(w, sp > 0.4); } else if (bandY[w] > 1.35) bandArm[w] = true; }
          if (lowered) breakBand(w, false);
          if (cracked) { bandCrack[w] = 1; spill(w, 6); }
          bandCrack[w] = Math.max(0, bandCrack[w] - dt * 0.6);
          const fi = Math.max(0, Math.min(8, floors - 1));
          sprite(3, w, 0.5, bandY[w], 1.1, bandCrack[w], act * (1 - sm((leave - 0.05) / 0.3)) * sm(arrive), fi / 8, 0, 0);
        }
      }
    }
    for (const fx of flashes) {
      if (!fx.on) continue; fx.age += dt / 0.7; if (fx.age >= 1) { fx.on = false; continue; }
      sprite(2, fx.w, fx.u, fx.y, 0.6, fx.r, fx.g, fx.b, fx.age, 0);
    }
    spG.instanceCount = nSp; for (const a of [PA, PB, PC, PD]) a.needsUpdate = true;
    if (stats) { stats.A = A; stats.floors = floors; stats.falling = nFall; stats.caught = caught; stats.shattered = shattered; stats.flowers = flowers.filter((f) => f.on).length; stats.maxV = maxV; stats.mode = mode; stats.pieces = troncList.length; stats.G0 = G0; if (frame % 30 === 0) { let lo = 1e9, hi = -1e9, n = 0, sx = 0, sz = 0; for (let i = 0; i < NSH; i++) if (S_.st[i] === 1) { const yy = S_.y[i] - lift; lo = Math.min(lo, yy); hi = Math.max(hi, yy); sx += S_.x[i]; sz += S_.z[i]; n++; } stats.ring = [n, +lo.toFixed(1), +hi.toFixed(1), +(sx / Math.max(1, n)).toFixed(1), +(sz / Math.max(1, n)).toFixed(1)]; stats.levelTop = Array.from(levelTop).map((v) => +v.toFixed(1)); } }
  }
  // T-042: the band's shards
  const bandYs = new Float32Array(64), bandTaken = new Uint8Array(4), bandAway = new Float32Array(4), bandLowAt = new Float32Array(4).fill(-9);   // T-047
  const bandY = new Float32Array(4).fill(-1), bandPrev = new Float32Array(4), bandArm = [true, true, true, true], bandCrack = new Float32Array(4);
  function spill(w, n) {
    const W = walls[w], fc = FLOORCOL[Math.max(0, Math.min(8, (prevFloors > 0 ? prevFloors : 1) - 1))];
    for (let k = 0; k < n; k++) {
      const j = alloc(); if (j < 0) return;
      const u = (rnd() - 0.5) * 2.0;
      _ps.copy(W.centre).addScaledVector(W.right, u).addScaledVector(W.normal, -(0.25 + rnd() * 0.5));
      S_.st[j] = 2; S_.x[j] = _ps.x; S_.y[j] = bandY[w] - world.position.y + (rnd() - 0.5) * 0.06; S_.z[j] = _ps.z;
      S_.vx[j] = -W.normal.x * (0.3 + rnd() * 0.8) + W.right.x * (rnd() - 0.5) * 0.8; S_.vz[j] = -W.normal.z * (0.3 + rnd() * 0.8) + W.right.z * (rnd() - 0.5) * 0.8; S_.vy[j] = -0.2 - rnd() * 0.6;
      S_.ax[j] = rnd() - 0.5; S_.ay[j] = rnd() - 0.5; S_.az[j] = rnd() - 0.5; S_.an[j] = rnd() * TAU; S_.av[j] = (2 + rnd() * 4) * (rnd() < 0.5 ? -1 : 1);
      S_.s[j] = 0.12 + Math.pow(rnd(), 2) * 0.3; S_.sd[j] = rnd(); S_.r[j] = fc[0]; S_.g[j] = fc[1]; S_.b[j] = fc[2]; S_.t[j] = 0; S_.fl[j] = 0.9; S_.f[j] = -1;
    }
  }
  function breakBand(w, crack) { spill(w, crack ? 34 : 22); if (crack) bandCrack[w] = 1; _fx.copy(walls[w].centre).setY(bandY[w]); fxAt(_fx, crack ? 0.8 : 0.5, 'glass', crack ? 'floor' : 'hit'); }
  // give tronc3d its floors back (the host calls it at the start of a pass; harmless when nothing is taken)
  function releaseTronc() { if (!troncHidden) return; troncHidden = false; const tp = ctx.parts?.tronc3d; try { for (let i = 0; i <= 9; i++) tp?.giveFloor?.(i); } catch { /* older tronc3d */ } }
  function setParams() { /* read live in update() */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); try { fxBc?.close(); } catch { /* closed */ } }
  const stats = typeof window !== 'undefined' ? (window.__baixada3d = { A: 0, floors: 0, falling: 0, caught: 0, shattered: 0, flowers: 0, maxV: 0, bandY, bandTaken, pool }) : null;
  return { object, update, setParams, dispose, releaseTronc };
}
