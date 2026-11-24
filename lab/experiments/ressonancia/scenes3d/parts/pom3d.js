// Ressonància — part «pom3d»: IV. Pom de dalt — Valor — the universe of AIR AND NIGHT, in 3D (contract: ../PARTS.md).
//
// The smallest climb last; the square holds its breath. VERTIGO: the room RISES. As the climb advances the whole world (group
// `world`) sinks: the viewpoint goes from the square's floor (eye 1.6 m) to `height` (24 m) above it. First the square's facades
// slide down past the walls (stone, lit windows, fanals below), then the rooftops of the old town all round (terracotta gables,
// flat terraces, chimneys, bell towers), the city's sea of lights out to the horizon, the dark Mediterranean on one side with the
// moon's path on it, Collserola's ridge on the other; the sky opens (deep blue-black, stars, a slow wind) and FIBROUS CLOUDS
// (thousands of fine luminous lines, blue and violet with warm edges, dripping long vertical streaks) drift past the walls.
// Height is felt: the facades, roofs and a stream of motes slide down; the ground below is ray-cast exactly from the eye's altitude.
//
// The three climbers (dosos, acotxador, enxaneta): small gold lights that climb in turn a tower of embers beyond each wall of the
// castell's structure (state.walls), spiralling once round a tower and arcing to the next (the order of the score: the light is on
// state.lightWall, the next tower glows before she comes: a beacon on state.nextWall), leaving a fine gold thread (analytic: the
// thread is the path itself, revealed up to where she is). restless = the light flickers and slips back, the wind gusts, the clouds
// shiver. 'arrived:<n>' = a soft bell of light; the last arrival: the enxaneta raises her hand and the night holds its breath.
// Hands are stillness: a still hand grows a calm halo and gathers small stars, still hands < 2 m apart are joined by constellation
// lines; a moving hand ripples the air.
// arrive: the ceramic tower (trencadís shards) beyond each structure wall opens; its fragments fly up and become stars and streaks;
// the night fades in. leave: the night breaks into floating shards of sky (stars and city lights in them, mirror glints) that drift
// apart and burst into gold; the enxaneta's light swells (the crown follows).
// Alone (res-3d-study, no input.state) a stand-in state comes from params: progress → climber/climb; walls (2–4); restless; arrive;
// leave; cycle (s, > 0 = the ascent loops on its own).
// ---------------------------------------------------------------------------------------------------------------- bodies
// The body kit below (vector helpers, two-bone IK, skeleton, the surface segments and their sampling) is copied from parts/castell.js
// (owner: INT; not imported so that castell.js stays untouched), used for the towers of embers the three climb.
// ---------------------------------------------------------------------------------------------------------------- small vector kit
const V = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const UP = V(0, 1, 0);
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// two-bone IK: root A, target T, lengths l1 l2, pole direction p → [joint, end]
function ik(A, T, l1, l2, p) {
  const d0 = sub(T, A), D = len(d0) || 1e-4, dir = mul(d0, 1 / D);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let b = sub(p, mul(dir, dot(p, dir))); if (len(b) < 1e-4) b = cross(dir, [1, 0, 0]); b = norm(b);
  return [add(madd(A, dir, a), mul(b, h)), madd(A, dir, d)];
}

// ---------------------------------------------------------------------------------------------------------------- one body
// spec: { f (facing, horizontal unit), s (scale), lean (rad, forward), head (rad, extra pitch), feet [L, R] ankle targets,
//         hands [L, R] wrist targets, elbow (pole), knee (pole), hipLift (extra pelvis height), child }
function skeleton(sp) {
  const s = sp.s, f = norm(sp.f), side = norm(cross(f, UP));         // side = the person's right
  const lean = sp.lean || 0, sd = norm(add(mul(UP, Math.cos(lean)), mul(f, Math.sin(lean))));
  const [fl, fr] = sp.feet, mid = lerp(fl, fr, 0.5);
  const lat = Math.max(0, len(sub(fl, fr)) / 2 - 0.09 * s), reach = 0.85 * s * (sp.bend ?? 0.97);
  const pelvis = sp.pelvis || add(mid, V(0, Math.sqrt(Math.max(0.04 * s * s, reach * reach - lat * lat)) + 0.03 * s + (sp.hipLift || 0), 0));
  const TL = 0.52 * s, S = (t) => madd(pelvis, sd, t * TL);
  const hd = norm(add(mul(UP, Math.cos(lean + (sp.head || 0))), mul(f, Math.sin(lean + (sp.head || 0)))));
  const neck = S(1), shC = S(0.86), shW = (sp.child ? 0.17 : 0.185) * s;
  const shL = madd(shC, side, -shW), shR = madd(shC, side, shW);
  const hL = madd(madd(pelvis, side, -0.09 * s), sd, -0.03 * s), hR = madd(madd(pelvis, side, 0.09 * s), sd, -0.03 * s);
  const kp = sp.knee || add(f, mul(UP, 0.1));
  const [kL, aL] = ik(hL, fl, 0.43 * s, 0.42 * s, add(kp, mul(side, -0.25)));
  const [kR, aR] = ik(hR, fr, 0.43 * s, 0.42 * s, add(kp, mul(side, 0.25)));
  const ep = sp.elbow || add(mul(UP, -1), mul(f, -0.3));
  const [eL, wL] = ik(shL, sp.hands[0], 0.29 * s, 0.26 * s, add(ep, mul(side, -0.6)));
  const [eR, wR] = ik(shR, sp.hands[1], 0.29 * s, 0.26 * s, add(ep, mul(side, 0.6)));
  const hsc = sp.child ? 1.22 : 1;
  const foot = (a) => madd(madd(a, f, 0.15 * s), UP, -0.045 * s);
  return {
    s, f, side, sd, hd, pelvis, S, neck, neckTop: madd(neck, hd, 0.06 * s), headC: madd(neck, hd, (0.06 + 0.1 * hsc) * s), hsc,
    shL, shR, hL, hR, kL, kR, aL, aR, eL, eR, wL, wR,
    hnL: madd(wL, norm(sub(wL, eL)), 0.16 * s), hnR: madd(wR, norm(sub(wR, eR)), 0.16 * s), tL: foot(aL), tR: foot(aR),
  };
}

// the torso as a loft of ellipses along the spine: [t, half-width, half-depth]
const LOFT = [[-0.14, 0.135, 0.10], [0.0, 0.165, 0.115], [0.2, 0.14, 0.10], [0.45, 0.15, 0.11], [0.7, 0.172, 0.12], [0.86, 0.19, 0.10], [1.0, 0.07, 0.06]];
function loftR(t) {
  for (let i = 1; i < LOFT.length; i++) if (t <= LOFT[i][0]) { const a = LOFT[i - 1], b = LOFT[i], k = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  return [LOFT[LOFT.length - 1][1], LOFT[LOFT.length - 1][2]];
}
// segments: [kind, a, b, rA, rB, weight(area, at scale 1), energy]   kinds: 'torso', 'cap' (capsule), 'ell' (ellipsoid), 'sph'
const SEGS = [
  ['torso', null, null, 0, 0, 0.56, 1],
  ['pelvis', null, null, 0, 0, 0.10, 0.9],
  ['cap', 'neck', 'neckTop', 0.05, 0.045, 0.02, 0.9],
  ['head', null, null, 0, 0, 0.30, 1.5],
  ['cap', 'shL', 'eL', 0.052, 0.04, 0.085, 1], ['cap', 'shR', 'eR', 0.052, 0.04, 0.085, 1],
  ['cap', 'eL', 'wL', 0.04, 0.03, 0.06, 1.05], ['cap', 'eR', 'wR', 0.04, 0.03, 0.06, 1.05],
  ['cap', 'wL', 'hnL', 0.032, 0.022, 0.025, 1.3], ['cap', 'wR', 'hnR', 0.032, 0.022, 0.025, 1.3],
  ['cap', 'hL', 'kL', 0.085, 0.055, 0.16, 0.95], ['cap', 'hR', 'kR', 0.085, 0.055, 0.16, 0.95],
  ['cap', 'kL', 'aL', 0.055, 0.036, 0.11, 0.95], ['cap', 'kR', 'aR', 0.055, 0.036, 0.11, 0.95],
  ['cap', 'aL', 'tL', 0.04, 0.03, 0.03, 0.9], ['cap', 'aR', 'tR', 0.04, 0.03, 0.03, 0.9],
  ['sph', 'shL', null, 0.058, 0, 0.06, 1.4], ['sph', 'shR', null, 0.058, 0, 0.06, 1.4],
];
const SEGW = SEGS.reduce((a, g) => a + g[5], 0);

function evalSample(k, rec, out, onorm) {      // rec = [seg, u1, u2, u3]; writes position and normal
  const g = SEGS[rec[0]], s = k.s, u1 = rec[1], u2 = rec[2], th = u2 * 6.283185;
  let p, n;
  if (g[0] === 'torso') {
    const t = -0.14 + u1 * 1.14, [rx, rz] = loftR(t), c = k.S(t), dp = norm(cross(k.sd, k.side));
    const cx = Math.cos(th), cz = Math.sin(th);
    p = add(c, add(mul(k.side, rx * s * cx), mul(dp, rz * s * cz)));
    n = norm(add(mul(k.side, cx / rx), mul(dp, cz / rz)));
  } else if (g[0] === 'pelvis' || g[0] === 'head') {
    const ct = 2 * u1 - 1, st = Math.sqrt(1 - ct * ct), d = [st * Math.cos(th), ct, st * Math.sin(th)];
    const ax = g[0] === 'head' ? k.hd : k.sd, dp = norm(cross(ax, k.side));
    const r = g[0] === 'head' ? [0.078 * k.hsc, 0.112 * k.hsc, 0.095 * k.hsc] : [0.16, 0.1, 0.12];
    const c = g[0] === 'head' ? k.headC : k.S(-0.07);
    p = add(c, add(add(mul(k.side, d[0] * r[0] * s), mul(ax, d[1] * r[1] * s)), mul(dp, d[2] * r[2] * s)));
    n = norm(add(add(mul(k.side, d[0] / r[0]), mul(ax, d[1] / r[1])), mul(dp, d[2] / r[2])));
  } else if (g[0] === 'sph') {
    const ct = 2 * u1 - 1, st = Math.sqrt(1 - ct * ct); n = [st * Math.cos(th), ct, st * Math.sin(th)];
    p = madd(k[g[1]], n, g[3] * s);
  } else {                                       // capsule with round caps
    const A = k[g[1]], B = k[g[2]], ab = sub(B, A), L = len(ab) || 1e-4, ax = mul(ab, 1 / L);
    let e1 = cross(ax, UP); if (len(e1) < 0.1) e1 = cross(ax, [1, 0, 0]); e1 = norm(e1); const e2 = cross(ax, e1);
    const rA = g[3] * s, rB = g[4] * s, capA = rA * rA * 2, capB = rB * rB * 2, cyl = L * (rA + rB);
    const pick = rec[3] * (capA + capB + cyl);
    if (pick < cyl) {
      const t = u1, r = rA + (rB - rA) * t, cx = Math.cos(th), cz = Math.sin(th);
      n = add(mul(e1, cx), mul(e2, cz)); p = add(madd(A, ab, t), mul(n, r));
    } else {
      const atA = pick < cyl + capA, ct = u1, st = Math.sqrt(1 - ct * ct);
      n = add(add(mul(e1, st * Math.cos(th)), mul(e2, st * Math.sin(th))), mul(ax, atA ? -ct : ct));
      p = madd(atA ? A : B, n, atA ? rA : rB);
    }
  }
  out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; onorm[0] = n[0]; onorm[1] = n[1]; onorm[2] = n[2];
  return g[6] * (g[0] === 'torso' && rec[1] > 0.11 && rec[1] < 0.3 ? 0.42 / g[6] : 1);   // the sash: a darker band
}


// a tronc of `tiers` levels of n (3 or 4) people standing on each other's shoulders, arms on the neighbours' shoulders, and a child
// (the enxaneta) on top; returns surface samples [x, y, z, nx, ny, nz, energy] (castell-local: y up, the tower's axis at x = z = 0)
// (from parts/castell.js: buildCastell's tronc, simplified — no pinya, no climbing poses)
function buildTower(n, tiers, seed, perPerson) {
  const r = rng(seed), R = n === 4 ? 0.46 : 0.40, ang0 = n === 4 ? Math.PI / 4 : Math.PI / 2, tronc = [];
  for (let L = 0; L < tiers; L++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const a = ang0 + (j * 2 * Math.PI) / n + L * 0.0, f = V(Math.cos(a), 0, Math.sin(a)), side = norm(cross(f, UP)), s = Math.max(0.82, 1.04 - L * 0.012) * (0.98 + r() * 0.04);
      let feet;
      if (L === 0) { const c = mul(f, R + 0.02); feet = [add(madd(c, side, -0.15), V(0, 0.075 * s, 0)), add(madd(c, side, 0.15), V(0, 0.075 * s, 0))]; }
      else { const b = tronc[L - 1][j].k; feet = [madd(add(b.shL, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, 0.035), madd(add(b.shR, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, -0.035)]; }
      const spec = { f, s, lean: L === 0 ? -0.04 : 0.02, head: L === 0 ? 0.15 : -0.05, feet, hands: [V(), V()], bend: L === 0 ? 0.93 : 0.96 };
      row.push({ spec, k: skeleton(spec), j });
    }
    tronc.push(row);
  }
  for (let L = 0; L < tiers; L++) for (const p of tronc[L]) {
    const k = p.k, sp = p.spec, nb = [tronc[L][(p.j + n - 1) % n].k, tronc[L][(p.j + 1) % n].k], hands = [];
    for (const sgn of [-1, 1]) {
      const q = nb.reduce((best, b) => (dot(sub(b.pelvis, k.pelvis), k.side) * sgn > dot(sub(best.pelvis, k.pelvis), k.side) * sgn ? b : best));
      const near = len(sub(q.shL, k.pelvis)) < len(sub(q.shR, k.pelvis)) ? q.shL : q.shR;
      hands.push(add(lerp(near, q.neck, 0.35), V(0, 0.06 * q.s, 0)));
    }
    sp.hands = hands; sp.elbow = add(mul(UP, -1), mul(k.f, 0.5)); p.k = skeleton(sp);
  }
  const people = tronc.flat().map((p) => p.k);
  const top = tronc[tiers - 1], shY = top.reduce((a, p) => a + (p.k.shL[1] + p.k.shR[1]) / 2, 0) / n;
  { const s = 0.6, f = V(0, 0, 1); const spec = { f, s, lean: 0, head: 0, child: true, feet: [V(-0.1, shY + 0.07 + 0.065 * s, 0), V(0.1, shY + 0.07 + 0.065 * s, 0)], hands: [V(-0.35, shY + 1.0, 0.05), V(0.32, shY + 0.75, 0.1)], bend: 0.97 }; people.push(skeleton(spec)); }
  const cumW = []; let acc = 0; for (const g of SEGS) { acc += g[5] / SEGW; cumW.push(acc); }
  const out = [], pos = [0, 0, 0], nrm = [0, 0, 0];
  for (const k of people) {
    const N = Math.round(perPerson * k.s * k.s);
    for (let i = 0; i < N; i++) {
      const u = r(); let si = 0; while (si < cumW.length - 1 && u > cumW[si]) si++;
      const e = evalSample(k, [si, r(), r(), r()], pos, nrm);
      out.push([pos[0], pos[1], pos[2], nrm[0], nrm[1], nrm[2], e]);
    }
  }
  return { samples: out, top: shY + 1.1 };
}

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, positionWorld, positionLocal, positionGeometry, normalWorld,
    cameraPosition, cameraProjectionMatrix, modelViewMatrix, modelWorldMatrix, mix, smoothstep, clamp, sin, cos, fract, floor, abs,
    max, min, pow, exp, length, normalize, dot, cross, mx_noise_float, uv, Loop, If, select, step, fwidth, mod, cameraWorldMatrix,
    Discard, sqrt, atan,
  } = TSL;

  // -------------------------------------------------------------------------------------------- helpers
  function rng(s) { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const sm = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
  const TAU = Math.PI * 2;
  const walls = room.walls, NW = walls.length, EYE = room.eye.clone();
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(cos(a).oneMinus())));

  // -------------------------------------------------------------------------------------------- uniforms
  const uTime = uniform(0), uA = uniform(1.6), uLift = uniform(0), uWorld = uniform(1), uShiver = uniform(0), uLeave = uniform(0);
  const uArrive = uniform(1), uStars = uniform(1), uCity = uniform(1), uCloud = uniform(1), uGold = uniform(1), uQ = uniform(0);
  const uBell = uniform(0), uCalm = uniform(0);
  const moonDirV = new THREE.Vector3(0.62, 0.40, 0.68).normalize();
  const uMoon = uniform(moonDirV);
  const SEA = new THREE.Vector2(0.7, 0.714).normalize();           // the sea lies towards +x+z (between walls 1 and 2)
  const uSea = uniform(SEA);
  const SQ = 18;                                                     // the square: sides 18 m from the eye
  const NL = 12, lampV = Array.from({ length: NL }, () => new THREE.Vector4()), uLamps = uniformArray(lampV, 'vec4');
  const GOLD = vec3(1.0, 0.62, 0.26);

  // -------------------------------------------------------------------------------------------- the dome: sky above, ground below
  // the ground is ray-cast from the eye at altitude uA: the square's floor, streets glowing between roofs, the sea of city lights,
  // the coast and the sea. Everything below the horizon that no geometry covers is this.
  const lightDots = (Q, spacing, prob, fp, seed) => {
    const g = Q.div(spacing), c = floor(g), f = fract(g);
    const jit = vec2(hash12(c.add(seed)), hash12(c.add(seed + 7.7))).mul(0.6).add(0.2);
    const d = length(f.sub(jit)).mul(spacing);
    const r = max(fp.mul(0.75), 0.45);
    const on = step(float(1 - prob), hash12(c.add(seed + 3.1)));
    const k = float(0.45).div(r);
    return on.mul(k.mul(k)).mul(exp(d.mul(d).div(r.mul(r)).negate()));
  };
  const hazeCol = (dir) => {
    const land = smoothstep(0.35, -0.2, dot(normalize(dir.xz.add(vec2(0.0001, 0))), uSea));
    const low = exp(max(dir.y, 0).div(0.06).negate());
    return mix(vec3(0.010, 0.013, 0.024), vec3(0.030, 0.019, 0.011), land).mul(low.mul(0.8).add(0.2));
  };
  const skyCol = (dir) => {
    const y = dir.y;
    const g = mix(vec3(0.014, 0.019, 0.036), vec3(0.0010, 0.0017, 0.0048), pow(clamp(y, 0, 1), 0.45)).add(hazeCol(dir));
    const md = max(dot(dir, uMoon), 0);
    const moon = smoothstep(0.99985, 0.99992, md).mul(5.0).add(pow(md, 400).mul(0.12)).add(pow(md, 18).mul(0.02));
    // stars: two layers of 3D cells on the direction
    const star = (scale, th, gain) => {
      const sp = dir.mul(scale), cell = floor(sp), h = hash13(cell), f = fract(sp).sub(0.5);
      const tw = sin(uTime.mul(h.mul(2.5).add(0.6).mul(uCalm.mul(-0.7).add(1))).add(h.mul(60))).mul(0.3).add(0.7);
      return step(th, h).mul(smoothstep(0.42, 0.0, length(f))).mul(tw).mul(h.sub(th).div(1 - th).pow(3).mul(gain).add(0.12));
    };
    const s = star(230, 0.993, 3.2).add(star(470, 0.985, 0.6).mul(0.5));
    const band = exp(dot(dir, normalize(vec3(-0.3, 0.55, 0.78))).mul(dot(dir, normalize(vec3(-0.3, 0.55, 0.78)))).mul(-9));
    const dust = smoothstep(0.0, 0.6, mx_noise_float(dir.mul(7.0))).mul(band.oneMinus().oneMinus()).mul(0.004);
    // Collserola: a dark ridge on the land side with a few lights
    const az = dir.xz, land = smoothstep(0.1, -0.35, dot(normalize(az.add(vec2(0.0001, 0))), uSea));
    const ang = sin(az.x.mul(3.0)).mul(0.5).add(sin(az.y.mul(5.0).add(1.3)).mul(0.3)).add(mx_noise_float(vec3(az.mul(9.0), 1.0)).mul(0.25));
    const ridge = ang.mul(0.02).add(0.045).mul(land);
    const hide = smoothstep(ridge, ridge.sub(0.002), y).mul(step(-0.001, y));
    const mtLights = step(0.9965, hash13(floor(dir.mul(700)))).mul(hide).mul(0.5);
    const starsOn = s.add(dust).mul(smoothstep(0.0, 0.12, y)).mul(uStars).mul(hide.oneMinus());
    const mtn = vec3(0.004, 0.0045, 0.007).add(hazeCol(dir).mul(0.6));
    return mix(g.add(vec3(0.78, 0.84, 1.0).mul(moon)).add(vec3(starsOn)), mtn.add(vec3(1.0, 0.7, 0.45).mul(mtLights)), hide);
  };
  const groundCol = Fn(([dir]) => {
    const ny = max(dir.y.negate(), 0.0004);
    const t = uA.div(ny), Pg = dir.xz.mul(t);
    const fp = length(fwidth(Pg));
    const c = vec3(0).toVar();
    const inSq = step(abs(Pg.x), SQ).mul(step(abs(Pg.y), SQ));
    // the square's floor: dark slabs and the fanals' pools
    const slab = hash12(floor(Pg.mul(vec2(1.4, 1.6))));
    const pool = vec3(0).toVar();
    Loop(NL, ({ i }) => { const L = uLamps.element(i); const d = Pg.sub(L.xz); pool.addAssign(vec3(1.0, 0.55, 0.25).mul(L.w.mul(0.10).div(dot(d, d).add(3.0)))); });
    const sqC = vec3(0.010, 0.009, 0.008).mul(slab.mul(0.5).add(0.6)).add(pool);
    // the city: streets glowing between the roofs; dots of light; the Eixample grid further out; then the coast and the sea
    const along = dot(Pg, uSea), coast = mx_noise_float(vec3(Pg.mul(0.004), 2.0)).mul(120).add(640);
    const sea = smoothstep(coast.sub(10), coast.add(10), along);
    const R = Pg.x.mul(0.7071).sub(Pg.y.mul(0.7071)), S = Pg.x.mul(0.7071).add(Pg.y.mul(0.7071));
    const gx = abs(fract(R.div(133.3)).sub(0.5)).mul(133.3), gz = abs(fract(S.div(133.3)).sub(0.5)).mul(133.3);
    const street = max(smoothstep(fp.add(10), 6, min(gx, gz)), smoothstep(fp.add(30), 26, gx.add(gz)).mul(1.25));   // the Eixample's chamfered crossings (xamfrans)
    const dist = length(Pg), eix = smoothstep(380, 520, dist);
    const glowBase = mix(float(0.018).add(mx_noise_float(vec3(Pg.mul(0.05), 0.0)).mul(0.008)), street.mul(0.035).add(0.004), eix);
    const dots = mix(lightDots(Pg, 11, 0.35, fp, 1.0), lightDots(Pg, 30, 0.8, fp, 5.0).mul(street.mul(0.85).add(0.15)), eix)
      .add(lightDots(Pg, 23, 0.12, fp, 9.0).mul(0.6));
    const white = step(0.8, hash12(floor(Pg.div(37))));
    const lights = mix(vec3(1.0, 0.52, 0.18), vec3(0.85, 0.9, 1.0), white).mul(dots.mul(1.3).add(glowBase.mul(1.3))).mul(uCity);
    const landC = vec3(0.004, 0.0032, 0.0028).add(lights);
    // the sea: almost black, the moon's path glittering, a port's lights along the coast, rare ships
    const Rf = vec3(dir.x, dir.y.negate(), dir.z);
    const ripple = mx_noise_float(vec3(Pg.mul(vec2(0.08, 0.3)), uTime.mul(0.4))).mul(0.06);
    const path = pow(max(dot(normalize(Rf.add(vec3(ripple, 0, ripple))), uMoon), 0), 120).mul(1.6);
    const glit = step(0.6, mx_noise_float(vec3(Pg.mul(0.5), uTime.mul(0.8)))).mul(path).mul(2.0);
    const port = exp(along.sub(coast).mul(along.sub(coast)).div(-60)).mul(lightDots(Pg, 9, 0.6, fp, 13.0).add(0.03));
    const ships = lightDots(Pg, 160, 0.03, fp, 21.0).mul(0.6);
    const seaC = vec3(0.0015, 0.0025, 0.005).add(vec3(0.8, 0.85, 1.0).mul(path.mul(0.3).add(glit))).add(vec3(1.0, 0.75, 0.5).mul(ships));
    c.assign(mix(mix(landC, seaC.add(vec3(1.0, 0.6, 0.3).mul(port.mul(uCity))), sea), sqC, inSq));
    const fog = exp(t.mul(-0.0011));
    return mix(hazeCol(vec3(dir.x, 0, dir.z)).mul(1.3), c, fog);
  });
  const domeCol = Fn(([dir]) => {
    const hz = smoothstep(-0.004, 0.004, dir.y);
    return mix(groundCol(dir), skyCol(dir), hz);
  });
  // transparent: while Pom arrives the dome comes in by FRAGMENTS (cells of the sky, from arrive 0.1), never as an opaque pop over the
  // outgoing chapter (INT, 00:1x)
  const uDomeIn = uniform(1);
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true });
  domeMat.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const cell = floor(dir.mul(9.0)), h = hash13(cell.add(vec3(3.1, 7.7, 1.3)));
    const a = smoothstep(h.mul(0.75), h.mul(0.75).add(0.12), uDomeIn);
    return vec4(domeCol(dir).mul(uWorld.mul(0.85).add(0.15)), a);
  })();
  domeMat.fog = false;

  // -------------------------------------------------------------------------------------------- groups
  const object = new THREE.Group(); object.name = 'pom3d';
  const world = new THREE.Group(); object.add(world);             // everything that sinks
  const geos = [], mats = [domeMat];
  const dome = new THREE.Mesh(new THREE.SphereGeometry(330, 64, 32), domeMat);
  geos.push(dome.geometry); dome.position.copy(EYE); dome.renderOrder = -10; dome.frustumCulled = false; object.add(dome);

  // -------------------------------------------------------------------------------------------- the city: buildings
  const R0 = rng(4242);
  const B = [];   // { x, z, rot, w, d, h, tint, square, roof: 0 flat / 1 gable, tower }
  const TINTS = [[0.62, 0.50, 0.36], [0.58, 0.48, 0.38], [0.66, 0.55, 0.40], [0.52, 0.46, 0.40], [0.70, 0.56, 0.38], [0.55, 0.42, 0.32]];
  // the square: four sides of facades, streets at the corners
  for (let k = 0; k < 4; k++) {
    const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][k];
    const nx = Math.cos(ang), nz = Math.sin(ang), tx = -nz, tz = nx;
    let u = -SQ + 4.5;
    while (u < SQ - 4.5) {
      const w = Math.min(SQ - 4.5 - u, 6 + R0() * 5); if (w < 3) break;
      const d = 13 + R0() * 4, h = 13 + R0() * 5, cu = u + w / 2;
      B.push({ x: nx * (SQ + d / 2) + tx * cu, z: nz * (SQ + d / 2) + tz * cu, rot: -ang, w: d, d: w, h, tint: TINTS[Math.floor(R0() * TINTS.length)], square: 1, roof: R0() < 0.5 ? 1 : 0, nx, nz, cu, along: w });
      u += w;
    }
  }
  // the old town: irregular blocks out to ~230 m (nothing over the sea)
  for (let gx = -230; gx <= 230; gx += 26) for (let gz = -230; gz <= 230; gz += 26) {
    const jx = gx + (R0() - 0.5) * 6, jz = gz + (R0() - 0.5) * 6;
    if (Math.abs(jx) < SQ + 22 && Math.abs(jz) < SQ + 22) continue;
    const r = Math.hypot(jx, jz); if (r > 235) continue;
    const rot = (Math.sin(jx * 0.013) + Math.cos(jz * 0.011)) * 0.25;
    const bw = 26 - 4 - R0() * 3, n = 1 + Math.floor(R0() * 3);
    for (let i = 0; i < n; i++) {
      const w = bw / n, off = -bw / 2 + w * (i + 0.5);
      const c = Math.cos(rot), s = Math.sin(rot);
      B.push({ x: jx + c * off, z: jz + s * off, rot: -rot, w, d: bw * (0.75 + R0() * 0.25), h: 11 + R0() * 11 + (R0() < 0.08 ? 6 : 0), tint: TINTS[Math.floor(R0() * TINTS.length)], square: 0, roof: R0() < 0.55 ? 1 : 0 });
    }
  }
  // bell towers (Santa Maria del Mar, the cathedral, parish churches)
  const TOWERS = [[52, -70, 46], [-95, 40, 52], [130, 110, 40], [-60, -150, 38], [20, 120, 42], [-170, -40, 36]];
  for (const [x, z, h] of TOWERS) B.push({ x, z, rot: 0.2, w: 7, d: 7, h, tint: [0.6, 0.5, 0.38], square: 0, roof: 2, tower: 1 });

  function instanced(geo, mat, list, fill) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const a0 = new Float32Array(list.length * 4), a1 = new Float32Array(list.length * 4);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    list.forEach((b, i) => { fill(b, p, e, s, a0, a1, i); q.setFromEuler(e); M.compose(p, q, s); m.setMatrixAt(i, M); });
    // WebGPU allows 8 vertex buffers per pipeline: no uv, and the two per-instance vec4s interleaved in ONE buffer
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    const il = new Float32Array(list.length * 8);
    for (let i = 0; i < list.length; i++) { il.set(a0.subarray(i * 4, i * 4 + 4), i * 8); il.set(a1.subarray(i * 4, i * 4 + 4), i * 8 + 4); }
    const ib = new THREE.InstancedInterleavedBuffer(il, 8, 1);
    geo.setAttribute('aI0', new THREE.InterleavedBufferAttribute(ib, 4, 0)); geo.setAttribute('aI1', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    m.frustumCulled = false; geos.push(geo); mats.push(mat); world.add(m); return m;
  }
  // shading of all stone: moonlight, a cool sky ambient, the warm glow of the streets on the lower facades, lit windows, haze
  const cityMat = (kind) => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = Fn(() => {
      const I0 = attribute('aI0', 'vec4'), I1 = attribute('aI1', 'vec4');
      const tint = I0.xyz, seed = I0.w, sq = I1.x, H = I1.y;
      const Pw = positionWorld, N = normalize(normalWorld), y = Pw.y.add(uLift);
      const V = Pw.sub(cameraPosition), dist = length(V), dir = V.div(dist);
      const moon = max(dot(N, uMoon), 0);
      const amb = vec3(0.016, 0.019, 0.03).mul(N.y.mul(0.4).add(0.8));
      let col;
      if (kind === 'iron') {
        const tangent = normalize(vec2(N.z.negate(), N.x).add(vec2(0.0001, 0))), u = dot(Pw.xz, tangent), top = I1.y;
        const bar = step(abs(fract(u.div(0.11)).sub(0.5)), 0.09), band = step(top.sub(0.07), y).add(step(y, top.sub(0.93))).add(step(abs(y.sub(top.sub(0.75))), 0.015));
        If(bar.add(band).lessThan(0.5).and(step(abs(N.y), 0.5).greaterThan(0.5)), () => { Discard(); });
        col = vec3(0.012, 0.011, 0.010).add(vec3(0.05, 0.026, 0.01).mul(exp(y.div(-6.0)))).add(vec3(0.03, 0.035, 0.05).mul(moon));
      } else if (kind === 'roof') {
        const tile = smoothstep(0.0, 0.25, abs(fract(y.div(0.32)).sub(0.5))).mul(smoothstep(0.5, 0.05, fwidth(y))).mul(0.25).add(0.75);
        const terra = vec3(0.30, 0.11, 0.055).mul(hash12(vec2(seed, 3.0)).mul(0.4).add(0.8)).mul(tile);
        col = terra.mul(amb.mul(1.4).add(vec3(0.11, 0.12, 0.16).mul(moon))).add(vec3(0.02, 0.008, 0.003).mul(terra));
      } else if (kind === 'dome') {
        // a lead-grey dome with ribs (azimuth) catching the moon; its lantern lit
        const az = sin(atan(Pw.z.sub(I1.w), Pw.x.sub(I1.z)).mul(16));
        const rib = smoothstep(0.85, 1.0, abs(az)).mul(0.5);
        const lead = vec3(0.10, 0.11, 0.12).mul(float(1).add(rib));
        col = lead.mul(amb.mul(1.6).add(vec3(0.14, 0.15, 0.2).mul(moon))).add(vec3(1.0, 0.62, 0.3).mul(smoothstep(H.sub(1.2), H.sub(0.4), y).mul(0.6)));
      } else {
        const tangent = normalize(vec2(N.z.negate(), N.x).add(vec2(0.0001, 0)));
        const u = dot(Pw.xz, tangent);
        const vert = step(abs(N.y), 0.5);
        const isSq = sq.greaterThan(0.5);
        const g0 = select(isSq, float(4.6), float(3.8)), fh = select(isSq, float(3.5), float(3.1));
        const bw = float(2.8);
        const cu = floor(u.div(bw)), cv = floor(y.sub(g0).div(fh));
        const fu = fract(u.div(bw)), fv = fract(y.sub(g0).div(fh)).mul(fh), dx = abs(fu.sub(0.5)).mul(bw);
        const upper = step(g0, y).mul(step(y, H.sub(0.8))).mul(vert);
        const win = step(dx, 0.55).mul(step(0.5, fv)).mul(step(fv, 2.6)).mul(upper).mul(float(kind === 'tower' ? 0 : 1));
        const surround = step(dx, 0.68).mul(step(0.38, fv)).mul(step(fv, 2.74)).mul(upper).mul(win.oneMinus());   // dressed-stone frame
        const hw = hash12(vec2(cu.add(seed.mul(91.0)), cv)), hs = hash12(vec2(cv.add(seed), cu.add(3.0)));
        const lit = step(hw, select(isSq, float(0.32), float(0.22)));
        // inside the window: recessed (shadow under the lintel and on one jamb), a lit room (warm, a curtain, the mullion cross), or
        // closed persianes (horizontal slats, green or brown); some lit rooms with the persiana half down
        const recess = smoothstep(2.6, 2.25, fv).mul(smoothstep(-0.55, -0.35, fu.sub(0.5).mul(bw))).mul(0.85).add(0.15);
        const mull = step(abs(fu.sub(0.5)).mul(bw), 0.03).add(step(abs(fv.sub(2.05)), 0.025)).min(1);
        const room = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.70, 0.40), hash12(vec2(cv, cu))).mul(hw.mul(0.9).add(0.15))
          .mul(float(0.65).add(exp(dx.mul(dx).mul(-6.0)).mul(0.5))).mul(smoothstep(2.6, 0.5, fv).mul(0.5).add(0.5));
        const slat = smoothstep(0.35, 0.5, abs(fract(fv.div(0.075)).sub(0.5))).mul(0.5).add(0.5);
        const shutC = mix(vec3(0.05, 0.085, 0.06), vec3(0.08, 0.055, 0.035), step(0.5, hs)).mul(slat);
        const half = step(0.6, hs).mul(step(mix(float(2.6), float(1.4), hs), fv));                     // the persiana let down this far
        const closed = step(0.45, hs).mul(lit.oneMinus());
        const glass = vec3(0.004, 0.006, 0.012).add(vec3(0.02, 0.025, 0.04).mul(moon));
        const inWin = select(lit.greaterThan(0.5), select(half.greaterThan(0.5), shutC.mul(0.25).add(room.mul(0.12)), room.mul(float(1).sub(mull.mul(0.85))).mul(0.55)),
          select(closed.greaterThan(0.5), shutC.mul(amb.mul(3.0).add(vec3(0.05, 0.05, 0.07).mul(moon))).mul(4.0), glass)).mul(recess);
        // the ground floor: arched openings (shops lit low and warm, wooden doors), ashlar courses
        const gArch = step(dx, 0.9).mul(step(y, g0.sub(0.5))).mul(step(dx.mul(dx).add(max(y.sub(g0.sub(1.4)), 0).pow(2)), 0.81)).mul(vert).mul(step(0.25, y));
        const shopLit = step(0.62, hash12(vec2(cu, seed)));
        const shopC = select(shopLit.greaterThan(0.5), vec3(1.0, 0.55, 0.22).mul(0.05).mul(hash12(vec2(cu, 7.0)).add(0.3)).mul(smoothstep(g0.sub(0.4), 0.3, y).mul(0.75).add(0.25)).mul(smoothstep(0.9, 0.5, dx).mul(0.6).add(0.4)),
          vec3(0.025, 0.015, 0.009).mul(smoothstep(0.35, 0.5, abs(fract(u.div(0.18)).sub(0.5))).mul(0.4).add(0.6)));
        const course = step(y, g0.sub(0.15)).mul(smoothstep(0.46, 0.5, abs(fract(y.div(0.45)).sub(0.5)))).mul(0.35);
        const aa = smoothstep(1.2, 0.3, fwidth(u));                 // far away the windows turn into their average
        // the wall: stucco or stone with grain, stains running down from the sills, a string course and a frieze, darker at the foot
        const grain = mx_noise_float(Pw.mul(0.7)).mul(0.12).add(mx_noise_float(Pw.mul(vec3(3.0, 0.4, 3.0))).mul(0.06)).add(0.9);
        const stain = step(dx, 0.5).mul(smoothstep(0.5, 0.0, fv)).mul(upper).mul(0.18);
        const band = step(abs(y.sub(g0)), 0.12).mul(0.25).add(step(H.sub(1.0), y).mul(step(y, H.sub(0.5))).mul(-0.2));
        const foot = smoothstep(0.0, 0.8, y).mul(0.35).add(0.65);
        const stone = tint.mul(grain).mul(float(1).sub(stain).sub(course).add(band).add(surround.mul(0.25))).mul(foot).mul(0.6);
        const up = vec3(0.07, 0.034, 0.012).mul(exp(y.div(-6.0)));    // the streets' glow on the lower facades
        const pool = vec3(0).toVar();
        If(isSq, () => {
          Loop(NL, ({ i }) => { const L = uLamps.element(i); const d = vec3(Pw.x, y, Pw.z).sub(L.xyz); pool.addAssign(vec3(1.0, 0.55, 0.25).mul(L.w.mul(1.8).mul(max(dot(N, normalize(d.negate())), 0)).div(dot(d, d).add(1.0)))); });
        });
        const light = amb.add(vec3(0.09, 0.10, 0.14).mul(moon)).add(up).add(pool);
        const openings = max(win, gArch);
        const detail = stone.mul(light).mul(openings.oneMinus()).add(inWin.mul(win)).add(shopC.mul(gArch).mul(light.mul(2.0).add(1.0)));
        const far = tint.mul(0.6).mul(light).mul(0.85).add(vec3(1.0, 0.6, 0.28).mul(0.03).mul(vert));   // the average, far away
        const wall = mix(far, detail, aa);
        const roofTop = step(0.5, N.y);
        const tileG = smoothstep(0.44, 0.5, max(abs(fract(Pw.x.div(0.6)).sub(0.5)), abs(fract(Pw.z.div(0.6)).sub(0.5)))).mul(smoothstep(0.4, 0.08, fwidth(Pw.x))).mul(0.18);
        const terr = mix(vec3(0.17, 0.11, 0.08), vec3(0.14, 0.13, 0.12), hash12(vec2(seed, 5.0))).mul(mx_noise_float(Pw.mul(0.5)).mul(0.15).add(0.9)).mul(float(1).sub(tileG)).mul(amb.mul(1.3).add(vec3(0.1, 0.11, 0.15).mul(moon)));
        col = mix(wall, terr, roofTop);
        if (kind === 'tower') col = col.add(vec3(1.0, 0.6, 0.3).mul(step(H.sub(9), y).mul(step(y, H.sub(5))).mul(step(abs(fract(u.div(3.5)).sub(0.5)), 0.17)).mul(vert).mul(0.5)));
      }
      // aerial depth: near blocks darker and crisp, the far city sinking into a warm-blue night haze (the height reads)
      const fog = exp(dist.mul(-0.0085)), nearK = mix(float(0.72), float(1.0), smoothstep(15.0, 90.0, dist));
      const haze = hazeCol(vec3(dir.x, 0, dir.z)).mul(1.3).add(vec3(0.002, 0.003, 0.006));   // the same haze the ray-cast ground sinks into
      return mix(haze, col.mul(nearK), fog).mul(uWorld);
    })();
    m.fog = false;
    return m;
  };
  const boxGeo = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };
  const body = B.filter((b) => !b.tower);
  instanced(boxGeo(), cityMat('wall'), body, (b, p, e, s, a0, a1, i) => { p.set(b.x, 0, b.z); e.set(0, b.rot, 0); s.set(b.w, b.h, b.d); a0.set([...b.tint, R0() * 100], i * 4); a1.set([b.square, b.h, 0, 0], i * 4); });
  const tw = B.filter((b) => b.tower);
  instanced(boxGeo(), cityMat('tower'), tw, (b, p, e, s, a0, a1, i) => { p.set(b.x, 0, b.z); e.set(0, b.rot, 0); s.set(b.w, b.h, b.d); a0.set([...b.tint, i * 7.1], i * 4); a1.set([0, b.h, 0, 0], i * 4); });
  // gable roofs: a prism, ridge along the building's long side
  const gable = new THREE.BufferGeometry();
  { const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0];
    gable.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); gable.computeVertexNormals(); }
  const gl = body.filter((b) => b.roof === 1);
  instanced(gable, cityMat('roof'), gl, (b, p, e, s, a0, a1, i) => { const along = b.w > b.d; p.set(b.x, b.h, b.z); e.set(0, b.rot + (along ? 0 : Math.PI / 2), 0); s.set((along ? b.w : b.d) + 0.4, 2.2 + R0() * 1.5, (along ? b.d : b.w) + 0.4); a0.set([...b.tint, R0() * 100], i * 4); a1.set([0, 0, 0, 0], i * 4); });
  const spire = new THREE.ConeGeometry(0.72, 1, 8); spire.translate(0, 0.5, 0);
  instanced(spire, cityMat('roof'), tw, (b, p, e, s, a0, a1, i) => { p.set(b.x, b.h, b.z); e.set(0, b.rot, 0); s.set(b.w, 7, b.d); a0.set([0.5, 0.45, 0.4, i], i * 4); a1.set([0, 0, 0, 0], i * 4); });
  const chims = [];
  for (const b of body) { const n = 1 + Math.floor(R0() * 4); for (let k = 0; k < n; k++) chims.push({ x: b.x + (R0() - 0.5) * Math.min(b.w, b.d) * 0.7, z: b.z + (R0() - 0.5) * Math.min(b.w, b.d) * 0.7, h: b.h + (b.roof ? 1.2 : 0), rot: b.rot, tint: b.tint }); }
  instanced(boxGeo(), cityMat('chim'), chims, (b, p, e, s, a0, a1, i) => { p.set(b.x, b.h - 0.2, b.z); e.set(0, b.rot, 0); s.set(0.55, 1.3 + R0(), 0.7); a0.set([...b.tint, R0() * 100], i * 4); a1.set([0, 0, 0, 0], i * 4); });
  // flat terraces (terrats): a parapet round the edge, a stair house (caseta) and a water tank on some (T-023: rooflines with volume)
  const parap = [], cases = [];
  for (const b of body) {
    if (b.roof !== 0) continue;
    const c = Math.cos(b.rot), sn = Math.sin(b.rot), at = (lx, lz) => [b.x + lx * c + lz * sn, b.z - lx * sn + lz * c];
    for (const sg of [-1, 1]) {
      const [x1, z1] = at(0, sg * (b.d / 2 - 0.1)); parap.push({ x: x1, z: z1, y: b.h, sx: b.w, sy: 0.95, sz: 0.2, rot: b.rot, tint: b.tint });
      const [x2, z2] = at(sg * (b.w / 2 - 0.1), 0); parap.push({ x: x2, z: z2, y: b.h, sx: 0.2, sy: 0.95, sz: b.d, rot: b.rot, tint: b.tint });
    }
    if (R0() < 0.55) { const [x, z] = at((R0() - 0.5) * b.w * 0.5, (R0() - 0.5) * b.d * 0.5); cases.push({ x, z, y: b.h, sx: 2.6, sy: 2.3, sz: 2.2, rot: b.rot, tint: b.tint }); }
    if (R0() < 0.35) { const [x, z] = at((R0() - 0.5) * b.w * 0.6, (R0() - 0.5) * b.d * 0.6); cases.push({ x, z, y: b.h, sx: 1.2, sy: 1.5, sz: 1.2, rot: b.rot, tint: [0.45, 0.45, 0.45] }); }
  }
  const boxFill = (b, p, e, sc, a0, a1, i) => { p.set(b.x, b.y, b.z); e.set(0, b.rot, 0); sc.set(b.sx, b.sy, b.sz); a0.set([...b.tint, R0() * 100], i * 4); a1.set([0, 0, 0, 0], i * 4); };
  instanced(boxGeo(), cityMat('chim'), parap, boxFill);
  instanced(boxGeo(), cityMat('chim'), cases, boxFill);
  // a dome over the roofs (a basilica of the old town, on the land side): a drum with lit windows, a lead dome with ribs, a lit lantern
  {
    const dx = -105, dz = -70, R = 8.5, dh = 24;
    const drum = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); drum.translate(0, 0.5, 0);
    instanced(drum, cityMat('tower'), [0], (b, p, e, sc, a0, a1, i) => { p.set(dx, 0, dz); e.set(0, 0, 0); sc.set(R, dh, R); a0.set([0.6, 0.52, 0.42, 3.3], 0); a1.set([0, dh + 6, 0, 0], 0); });
    const cap = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    instanced(cap, cityMat('dome'), [0], (b, p, e, sc, a0, a1, i) => { p.set(dx, dh, dz); e.set(0, 0, 0); sc.set(R, R * 0.95, R); a0.set([0.3, 0.3, 0.3, 1], 0); a1.set([0, dh + R * 0.95, dx, dz], 0); });
    const lan = new THREE.CylinderGeometry(1, 1, 1, 12); lan.translate(0, 0.5, 0);
    instanced(lan, cityMat('dome'), [0], (b, p, e, sc, a0, a1, i) => { p.set(dx, dh + R * 0.9, dz); e.set(0, 0, 0); sc.set(1.3, 3.2, 1.3); a0.set([0.3, 0.3, 0.3, 2], 0); a1.set([0, dh + R * 0.9 + 3.2, dx, dz], 0); });
  }
  // the square's facades in relief (T-008 step 3): a string course over the ground floor, a cornice, and under the windows
  // stone balconies with wrought-iron railings (every bay on the principal floor, some above), on the shader's window grid
  const slabs = [], rails = [], _fv = new THREE.Vector3();
  for (const b of B) {
    if (!b.square) continue;
    const tx = b.nz, tz = -b.nx;                                      // the facade's u axis as the shader computes it
    const u0 = -b.cu - b.along / 2, u1 = -b.cu + b.along / 2, fx = b.nx * SQ, fz = b.nz * SQ;
    const at = (u, out) => out.set(fx + tx * u, 0, fz + tz * u);
    at(-b.cu, _fv);
    slabs.push({ x: _fv.x - b.nx * 0.06, z: _fv.z - b.nz * 0.06, y: 4.45, h: 0.22, w: b.along + 0.1, d: 0.24, rot: b.rot, tint: b.tint });
    slabs.push({ x: _fv.x - b.nx * 0.2, z: _fv.z - b.nz * 0.2, y: b.h - 0.45, h: 0.45, w: b.along + 0.3, d: 0.55, rot: b.rot, tint: b.tint });
    for (let k = Math.ceil(u0 / 2.8 - 0.5); (k + 0.5) * 2.8 + 0.8 < u1; k++) {
      const uc = (k + 0.5) * 2.8; if (uc - 0.8 < u0) continue;
      for (let cv = 0; ; cv++) {
        const sill = 4.6 + cv * 3.5 + 0.5; if (sill + 2.1 > b.h - 0.8) break;
        if (cv > 0 && R0() < 0.55) continue;
        const bw = cv === 0 ? 1.7 : 1.4, bd = cv === 0 ? 0.65 : 0.5;
        at(uc, _fv);
        slabs.push({ x: _fv.x - b.nx * bd / 2, z: _fv.z - b.nz * bd / 2, y: sill - 0.16, h: 0.16, w: bw, d: bd, rot: b.rot, tint: b.tint });
        rails.push({ x: _fv.x - b.nx * (bd - 0.03), z: _fv.z - b.nz * (bd - 0.03), y: sill, h: 1.0, w: bw - 0.04, d: 0.03, rot: b.rot });
        for (const sgn of [-1, 1]) rails.push({ x: _fv.x + tx * sgn * (bw / 2 - 0.02) - b.nx * bd / 2, z: _fv.z + tz * sgn * (bw / 2 - 0.02) - b.nz * bd / 2, y: sill, h: 1.0, w: 0.03, d: bd - 0.04, rot: b.rot });
      }
    }
  }
  // (box: x along the facade after rotation `rot`, z out of it — the square's boxes were built with w = depth: swap here)
  instanced(boxGeo(), cityMat('wall'), slabs, (b, p, e, s, a0, a1, i) => { p.set(b.x, b.y, b.z); e.set(0, b.rot, 0); s.set(b.d, b.h, b.w); a0.set([...b.tint, 5 + i], i * 4); a1.set([0, 0, 0, 0], i * 4); });
  instanced(boxGeo(), cityMat('iron'), rails, (b, p, e, s, a0, a1, i) => { p.set(b.x, b.y, b.z); e.set(0, b.rot, 0); s.set(b.d, b.h, b.w); a0.set([0, 0, 0, 0], i * 4); a1.set([0, b.y + b.h, 0, 0], i * 4); });

  // the fanals of the square (on the facades, 4.3 m up)
  const lamps = [];
  for (let k = 0; k < 4; k++) {
    const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][k], nx = Math.cos(ang), nz = Math.sin(ang), tx = -nz, tz = nx;
    for (const u of [-10, 0, 10]) lamps.push(new THREE.Vector3(nx * (SQ - 0.6) + tx * u, 4.3, nz * (SQ - 0.6) + tz * u));
  }

  // -------------------------------------------------------------------------------------------- billboards (embers, motes, glows, shards)
  // aP = (x, y, z, size m), aC = (r, g, b, kind) — kind 0 soft dot, 1 star (core, halo, spikes), 2 ring (bell), 3 vertical streak,
  // 4 trencadís shard (arrive), 5 mote (wrapped in height, sinks forever)
  function billboards(n, parent, opt = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const aP = new Float32Array(n * 4), aC = new Float32Array(n * 4), aX = new Float32Array(n * 4);
    const AP = new THREE.InstancedBufferAttribute(aP, 4), AC = new THREE.InstancedBufferAttribute(aC, 4), AX = new THREE.InstancedBufferAttribute(aX, 4);
    if (opt.dynamic) { AP.setUsage(THREE.DynamicDrawUsage); AC.setUsage(THREE.DynamicDrawUsage); }
    g.setAttribute('bbP', AP); g.setAttribute('bbC', AC); g.setAttribute('bbX', AX); g.instanceCount = n;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: opt.depthTest !== false, blending: THREE.AdditiveBlending });
    const p4 = attribute('bbP', 'vec4'), c4 = attribute('bbC', 'vec4'), x4 = attribute('bbX', 'vec4');
    const kind = c4.w;
    let p = p4.xyz;
    let size = p4.w, stretch = float(1), bright = float(1), colr = c4.xyz;
    if (opt.motes) {                                                   // height wrapped round the eye: an endless stream
      const span = 44.0;
      p = vec3(p4.x, mod(p4.y.sub(uLift), span).sub(span / 2).add(EYE.y), p4.z);
      stretch = float(1).add(abs(uShiver).mul(0));
      bright = smoothstep(span / 2, span / 2 - 6, abs(p.y.sub(EYE.y))).mul(uWorld);
    }
    if (opt.shards) {                                                  // arrive: the ceramic tower opens, shards fly up into stars
      const delay = x4.x, sd = x4.y, nrm = vec3(x4.z, 0, x4.w);
      const k = clamp(uArrive.mul(1.35).sub(0.12).sub(delay).div(0.55), 0, 1);
      const up = vec3(0, 1, 0), tng = vec3(nrm.z.negate(), 0, nrm.x);
      const fly = nrm.mul(k.mul(1.6).add(k.mul(k).mul(3.0))).add(up.mul(k.mul(k).mul(sd.mul(10).add(8)).add(k.mul(2)))).add(tng.mul(k.mul(k).mul(sd.sub(0.5).mul(6))));
      p = p.add(fly);
      const star = smoothstep(0.35, 0.8, k);
      size = size.mul(mix(float(1), float(0.22), star));
      stretch = float(1).add(step(0.55, sd).mul(sin(k.mul(3.1416)).mul(9)));
      colr = mix(colr, mix(vec3(0.7, 0.8, 1.6), vec3(0.6, 0.45, 1.4), step(0.55, sd)), star).mul(float(1).add(star.mul(2.5)));
      bright = smoothstep(0.0, 0.08, uArrive).mul(smoothstep(1.0, 0.8, k)).mul(select(k.greaterThan(0.0), float(1), float(0.8)));
    }
    const mv = modelViewMatrix.mul(vec4(p, 1));
    const corner = positionGeometry.xy.mul(vec2(size, size.mul(stretch)));
    m.vertexNode = select(bright.greaterThan(0.0001), cameraProjectionMatrix.mul(vec4(mv.xy.add(corner), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const vC = varying(colr.mul(bright)), vK = varying(kind), vS = varying(stretch), vQ = varying(positionGeometry.xy);
    m.colorNode = Fn(() => {
      const q = vQ, r2 = dot(q, q), r = sqrt(r2);
      const dotK = exp(r2.mul(-9));
      const starK = exp(r2.mul(-900)).mul(8).add(exp(r2.mul(-60)).mul(0.6)).add(exp(r.mul(-6)).mul(0.08))
        .add(exp(abs(q.y).mul(-160)).mul(exp(abs(q.x).mul(-5))).mul(0.35)).add(exp(abs(q.x).mul(-160)).mul(exp(abs(q.y).mul(-7))).mul(0.25));
      const ringK = exp(r.sub(0.8).div(0.06).pow(2).negate()).add(exp(r2.mul(-4)).mul(0.15));
      const streakK = exp(q.x.mul(q.x).mul(-300)).mul(smoothstep(1.0, 0.2, abs(q.y)));
      const shardK = step(r, 0.95).mul(step(abs(q.x.add(q.y.mul(0.4))), 0.75)).mul(float(1).add(exp(r2.mul(-3)).mul(0.3)));
      const k = vK;
      const f = select(k.lessThan(0.5), dotK, select(k.lessThan(1.5), starK, select(k.lessThan(2.5), ringK, select(k.lessThan(3.5), streakK, select(k.lessThan(4.5), mix(shardK, dotK.mul(1.5), smoothstep(1.5, 4.0, vS)), dotK)))));
      return vec4(vC.mul(f), 1);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; parent.add(mesh); geos.push(g); mats.push(m);
    return { mesh, g, aP, aC, aX, AP, AC, set(i, x, y, z, s, r, gg, b, k) { aP[i * 4] = x; aP[i * 4 + 1] = y; aP[i * 4 + 2] = z; aP[i * 4 + 3] = s; aC[i * 4] = r; aC[i * 4 + 1] = gg; aC[i * 4 + 2] = b; aC[i * 4 + 3] = k; } };
  }
  // the fanals: static warm glows (their brightness rides on uWorld through the dynamic glows' own update: they are in `glows`)
  // motes: an endless stream round the room, from 6 to 40 m, rising past the eye as the world sinks
  const NM = 3500, motes = billboards(NM, object, { motes: true });
  { const r = rng(77); for (let i = 0; i < NM; i++) { const a = r() * TAU, d = 6 + Math.pow(r(), 1.6) * 34, warm = r() < 0.15; const k = 0.04 + r() * 0.08;
    motes.set(i, Math.cos(a) * d, r() * 44, Math.sin(a) * d, 0.03 + r() * 0.05 + d * 0.0012, warm ? k * 1.0 : k * 0.55, warm ? k * 0.6 : k * 0.65, warm ? k * 0.3 : k * 0.9, 5); } }

  // -------------------------------------------------------------------------------------------- the climb: towers, path, threads
  const climb = { order: [0, 1, 2, 3], A1: 14, top: 11.4, floors: 7, built: '' };
  const TR = 9.5, NEAR = 0.75, FT = 0.72;
  // the eye rises to `height` (0 = 32 m); the climbers' towers reach the summit (surreal: far taller than the castell's 5–9 floors;
  // T-008 step 1 tried castell height and was held back: see notas/3D-PO.md). `floors` only sets the arrive's ceramic tower.
  function setFloors(f, h) { climb.floors = Math.max(5, Math.min(9, Math.round(f || 7))); climb.A1 = h > 0 ? h : 32; }
  const TOPR = [2.3, 2.8, 3.3], RSTART = -1.1;
  const towerAng = (w) => Math.atan2(-walls[w].normal.z, -walls[w].normal.x);
  const Aof = (p) => 1.6 + (climb.A1 - 1.6) * (1 - Math.pow(1 - clamp01(p), 1.6));
  const ease = (t) => t * t * (3 - 2 * t);
  // the climber i at c (0..1) → world-local position (out)
  function pathPos(i, c, out) {
    const o = climb.order, n = o.length, sf = c * n, k = Math.min(n - 1, Math.floor(sf)), f = sf - k;
    const y = Aof((i + c) / 3) + RSTART + (TOPR[i] - RSTART) * (0.3 * c + 0.7 * ease(c));
    const th = towerAng(o[k]);
    if (k < n - 1 && f > FT) {
      const g = (f - FT) / (1 - FT), th2 = towerAng(o[k + 1]);
      let d = th2 - th; while (d <= 0) d += TAU;
      const a = th + d * ease(g), rad = TR - NEAR - 0.8 * Math.sin(Math.PI * g);
      out.set(Math.cos(a) * rad, y + 0.25 * Math.sin(Math.PI * g), Math.sin(a) * rad);
    } else {
      const g = k < n - 1 ? f / FT : f;
      const phi = th + Math.PI + g * TAU;                               // starts on the eye's side of the tower, one turn round it
      out.set(Math.cos(th) * TR + Math.cos(phi) * NEAR, y, Math.sin(th) * TR + Math.sin(phi) * NEAR);
    }
    return out;
  }
  // threads: three ribbons of NSEG segments each, the path sampled; revealed up to uQ in the shader
  const NSEG = 700;
  const thrGeo = new THREE.InstancedBufferGeometry();
  thrGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); thrGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const tA = new Float32Array(3 * NSEG * 4), tB = new Float32Array(3 * NSEG * 4);
  const TA = new THREE.InstancedBufferAttribute(tA, 4), TB = new THREE.InstancedBufferAttribute(tB, 4);
  thrGeo.setAttribute('aA', TA); thrGeo.setAttribute('aB', TB); thrGeo.instanceCount = 3 * NSEG; geos.push(thrGeo);
  const thrMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const A = attribute('aA', 'vec4'), Bq = attribute('aB', 'vec4');
    const q0 = A.w, q1 = Bq.w, vis = clamp(uQ.sub(q0).div(q1.sub(q0)), 0, 1);
    const tremble = vec3(sin(uTime.mul(23).add(q0.mul(40))), sin(uTime.mul(19).add(q0.mul(33))), 0).mul(uShiver.mul(0.02));
    const pa = A.xyz.add(tremble), pb = mix(A.xyz, Bq.xyz, vis).add(tremble);
    const va = modelViewMatrix.mul(vec4(pa, 1)), vb = modelViewMatrix.mul(vec4(pb, 1));
    const along = positionGeometry.x, side = positionGeometry.y;
    const v = mix(va, vb, along);
    const d = normalize(vb.xy.sub(va.xy).add(vec2(0.00001, 0))), perp = vec2(d.y.negate(), d.x);
    const w = max(float(0.008), v.z.negate().mul(0.0012));   // ≥ ~1 px each side: no dashes
    const clip = cameraProjectionMatrix.mul(vec4(v.xy.add(perp.mul(w).mul(side)), v.z, v.w));
    thrMat.vertexNode = select(uQ.greaterThan(q0), clip, vec4(0, 0, 2, 1));
    const fresh = exp(uQ.sub(q1).max(0).mul(-25)).mul(2.0).add(1);
    const shimmer = sin(q0.mul(900).sub(uTime.mul(1.2))).mul(0.2).add(0.8);
    const vI = varying(fresh.mul(shimmer).mul(uBell.mul(1.5).add(1)).mul(uGold).mul(uWorld).mul(0.55));
    const vSd = varying(side);
    thrMat.colorNode = Fn(() => vec4(GOLD.mul(vI).mul(exp(vSd.mul(vSd).mul(-2.2))).mul(1.1), 1))();
    thrMat.fog = false; mats.push(thrMat);
  }
  const threads = new THREE.Mesh(thrGeo, thrMat); threads.frustumCulled = false; world.add(threads);
  // the towers of embers: bodies of the castell, ring after ring, up to the summit
  let embers = null;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const bodyCache = new Map();
  function towerBody(per, want) {                                     // cached: the bodies of a tower (CPU ~25 ms), once per kind and height
    const key = per + '|' + want.toFixed(2);
    if (!bodyCache.has(key)) {
      let tiers = Math.max(3, Math.floor((want - 1.8) / 1.45));
      while (buildTower(per, tiers, 9, 0).top < want && tiers < 40) tiers++;
      bodyCache.set(key, buildTower(per, tiers, 9, P.bodies ? 420 * P.bodies : 420).samples);
    }
    return bodyCache.get(key);
  }
  function build() {
    const key = climb.order.join(',') + '|' + climb.A1 + '|' + climb.floors;
    if (key === climb.built) return; climb.built = key;
    // threads
    for (let i = 0; i < 3; i++) for (let s = 0; s < NSEG; s++) {
      const c0 = s / NSEG, c1 = (s + 1) / NSEG, k = (i * NSEG + s) * 4;
      pathPos(i, c0, _v); pathPos(i, c1, _w);
      tA[k] = _v.x; tA[k + 1] = _v.y; tA[k + 2] = _v.z; tA[k + 3] = i + c0;
      tB[k] = _w.x; tB[k + 1] = _w.y; tB[k + 2] = _w.z; tB[k + 3] = i + c1;
    }
    TA.needsUpdate = true; TB.needsUpdate = true;
    // embers (rebuilt on a change of structure only): the tronc as bodies (T-008 step 2, the castell part's bodies) up to the summit,
    // each person drawn as ember particles on its surface, brighter at the silhouette seen from the eye; a low pinya of embers round it
    const want = climb.A1 + TOPR[2] - 0.2, per = climb.order.length >= 4 ? 4 : 3;
    const body = towerBody(per, want), r = rng(9);
    // one billboard set, sized once for the largest structure (4 towers of 4 a floor): a change of structure rewrites it in place (no
    // new geometry or material, no temporary arrays: no shader compile and no stall when Pom arrives)
    const cap = 4 * (towerBody(4, want).length + 500);
    if (!embers || embers.cap < cap) { if (embers) { world.remove(embers.mesh); embers.g.dispose(); embers.mesh.material.dispose(); } embers = billboards(cap, world); embers.cap = cap; }
    let i = 0;
    for (const w of climb.order) {
      const th = towerAng(w), cx = Math.cos(th) * TR, cz = Math.sin(th) * TR;
      const ex = -Math.cos(th), ez = -Math.sin(th);                     // towards the eye (horizontal)
      const rot = Math.atan2(ex, ez) + w * 0.7, cr = Math.cos(rot), sr = Math.sin(rot);
      for (let n = 0; n < body.length; n++) {
        const b = body[n];
        const x = b[0] * cr + b[2] * sr, z = -b[0] * sr + b[2] * cr, nx = b[3] * cr + b[5] * sr, nz = -b[3] * sr + b[5] * cr;
        const front = nx * ex + nz * ez, rim = 1 - Math.abs(front);
        const k = b[6] * (front > -0.2 ? 1 : 0.12) * (0.07 + 1.9 * rim * rim * rim) * (0.75 + 0.5 * r()) * 0.5;
        embers.set(i++, cx + x, b[1], cz + z, 0.017 + 0.008 * r(), k, k * 0.3, k * 0.09, 0);
      }
      for (let j = 0; j < 500; j++) {
        const a = r() * TAU, d = 1.2 + r() * 2.6, k = (r() * r() * 0.6 + 0.05) * 0.42;
        embers.set(i++, cx + Math.cos(a) * d, r() * 1.4 * (1 - (d - 1.2) / 2.8) + 0.2, cz + Math.sin(a) * d, 0.05, k, k * 0.3, k * 0.09, 0);
      }
    }
    embers.g.instanceCount = i; embers.AP.needsUpdate = true; embers.AC.needsUpdate = true;
  }

  // dynamic glows: 3 climbers, beacon, 4 bells, the enxaneta's hand, the 12 fanals
  const NG = 3 + 1 + 4 + 1 + NL;
  const glows = billboards(NG, world, { dynamic: true, depthTest: false });
  glows.mesh.renderOrder = 8;

  // -------------------------------------------------------------------------------------------- fibrous clouds
  const clouds = [];
  // Each fibre segment is a soft ribbon ≈ 1.8 px wide with a gaussian profile (T-008 step 4: 1 px lines shimmered as they moved;
  // a ribbon that never gets thinner than its pixel footprint keeps its energy steady from frame to frame).
  // Per segment: cA = (a.xyz, seed) · cB = (b.xyz, brightness of b / a) · cC = (colour at a, drip depth at a) · cN = (normal, drip depth at b)
  const cloudMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  {
    const A4 = attribute('cA', 'vec4'), B4 = attribute('cB', 'vec4'), C4 = attribute('cC', 'vec4'), N4 = attribute('cN', 'vec4');
    const sd = A4.w, along = positionGeometry.x, side = positionGeometry.y;
    const deform = (p, dd) => p
      .add(vec3(sin(uTime.mul(0.5).add(sd.mul(30))), 0, cos(uTime.mul(0.43).add(sd.mul(17)))).mul(dd.mul(dd).mul(0.006)))
      .add(vec3(sin(uTime.mul(31).add(sd.mul(91))), sin(uTime.mul(27).add(sd.mul(57))), sin(uTime.mul(29).add(sd.mul(13)))).mul(uShiver.mul(0.07)))
      .add(vec3(sin(p.y.mul(0.8).add(uTime.mul(0.3))), 0, cos(p.x.mul(0.6).add(uTime.mul(0.25)))).mul(0.12));
    const pa = deform(A4.xyz, C4.w), pb = deform(B4.xyz, N4.w);
    const va = modelViewMatrix.mul(vec4(pa, 1)), vb = modelViewMatrix.mul(vec4(pb, 1));
    const v = mix(va, vb, along);
    const dv = vb.xy.sub(va.xy), dl = length(dv);
    const dir = select(dl.greaterThan(1e-5), dv.div(dl), vec2(1, 0)), perp = vec2(dir.y.negate(), dir.x);
    const halfW = v.z.negate().mul(0.0011);                              // ≈ 0.9 px each side at scale 1 (the strip: ~0.0011 rad/px)
    const ext = dir.mul(along.mul(2).sub(1).mul(halfW));               // caps: the ribbon reaches half a pixel past each end
    cloudMat.vertexNode = cameraProjectionMatrix.mul(vec4(v.xy.add(perp.mul(halfW.mul(side))).add(ext), v.z, v.w));
    // light, per segment (from its normal): pearl front, bright silhouette, warm rim and underside; drips are flat
    const Nw = normalize(modelWorldMatrix.mul(vec4(N4.xyz, 0)).xyz.add(vec3(0, 0.0001, 0)));
    const Pw = modelWorldMatrix.mul(vec4(mix(pa, pb, along), 1)).xyz, V = normalize(Pw.sub(cameraPosition));
    const isDrip = step(length(N4.xyz), 0.1);
    const facing = dot(Nw, V.negate()), rim = float(1).sub(abs(facing));
    const lit = mix(smoothstep(-0.4, 0.5, facing).mul(0.6).add(0.25).mul(rim.mul(rim).mul(1.6).add(0.5)), float(1), isDrip);
    const warmK = clamp(rim.mul(rim).mul(0.8).add(Nw.y.negate().mul(0.6)), 0, 1).mul(isDrip.oneMinus());
    const base = C4.xyz.mul(mix(float(1), B4.w, along));
    const col = mix(base, vec3(1.0, 0.55, 0.25).mul(length(base).mul(0.9)), warmK.mul(0.75));
    const vCol = varying(col.mul(lit).mul(uCloud).mul(uWorld).mul(0.9)), vSide = varying(side);
    cloudMat.colorNode = Fn(() => vec4(vCol.mul(exp(vSide.mul(vSide).mul(-2.2))), 1))();
    cloudMat.fog = false; mats.push(cloudMat);
  }
  const ribbonQuad = new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3);
  function makeCloud(r, seed) {
    const R = rng(seed);
    const W = 10 + R() * 18, H = 3.5 + R() * 4, D = W * (0.4 + R() * 0.3);
    const lobes = [];
    const nl = 5 + Math.floor(R() * 5);
    for (let i = 0; i < nl; i++) { const x = (R() - 0.5) * W * 0.8, rr = (0.25 + R() * 0.3) * W * 0.5; lobes.push([x, rr * 0.35 + R() * H * 0.4, (R() - 0.5) * D * 0.5, rr, rr * (0.55 + R() * 0.25), rr * (0.7 + R() * 0.3)]); }
    const pos = [], col = [], nrm = [];
    const inside = (x, y, z, skip) => { for (let j = 0; j < lobes.length; j++) { if (j === skip) continue; const L = lobes[j]; const a = (x - L[0]) / L[3], b = (y - L[1]) / L[4], c = (z - L[2]) / L[5]; if (a * a + b * b + c * c < 0.8) return true; } return false; };
    const NF = Math.round(W * W * 9 * (P.fibres ?? 1));
    const yMin = Math.min(...lobes.map((L) => L[1] - L[4])), yMax = Math.max(...lobes.map((L) => L[1] + L[4]));
    const colAt = (y, k) => { const h = (y - yMin) / (yMax - yMin); const c0 = [0.30, 0.22, 0.75], c1 = [0.42, 0.50, 1.0], c2 = [0.70, 0.78, 1.0]; const m = h < 0.5 ? c0.map((v, i) => v + (c1[i] - v) * h * 2) : c1.map((v, i) => v + (c2[i] - v) * (h - 0.5) * 2); return m.map((v) => v * k); };
    for (let f = 0; f < NF; f++) {
      const j = Math.floor(R() * nl), L = lobes[j];
      let u = R() * TAU, v = R() * 2 - 1, s = Math.sqrt(1 - v * v);
      const scale = 0.9 + R() * 0.16, k = (0.04 + R() * 0.09) * 0.8, sd = R();
      let px = L[0] + Math.cos(u) * s * L[3] * scale, py = L[1] + v * L[4] * scale, pz = L[2] + Math.sin(u) * s * L[5] * scale;
      const steps = 6 + Math.floor(R() * 8);
      for (let st = 0; st < steps; st++) {
        let nx = (px - L[0]) / (L[3] * L[3]), ny = (py - L[1]) / (L[4] * L[4]), nz = (pz - L[2]) / (L[5] * L[5]); const nn = Math.hypot(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
        let fx = Math.sin(py * 0.7 + seed) + 1.4, fy = Math.sin(px * 0.4 + pz * 0.3) * 0.35, fz = Math.cos(px * 0.25 + py * 0.9 + seed);
        const dd = fx * nx + fy * ny + fz * nz; fx -= dd * nx; fy -= dd * ny; fz -= dd * nz; const fl = Math.hypot(fx, fy, fz) || 1;
        let qx = px + (fx / fl) * 0.38, qy = py + (fy / fl) * 0.38, qz = pz + (fz / fl) * 0.38;
        const ex = (qx - L[0]) / L[3], ey = (qy - L[1]) / L[4], ez = (qz - L[2]) / L[5], el = Math.hypot(ex, ey, ez) / scale || 1;
        qx = L[0] + (qx - L[0]) / el; qy = L[1] + (qy - L[1]) / el; qz = L[2] + (qz - L[2]) / el;
        if (!inside(px, py, pz, j) && !inside(qx, qy, qz, j)) {
          const ca = colAt(py, k), cb = colAt(qy, k);
          pos.push(px, py, pz, qx, qy, qz); col.push(...ca, sd, ...cb, sd); nrm.push(nx, ny, nz, 0, nx, ny, nz, 0);
        }
        px = qx; py = qy; pz = qz;
      }
    }
    // drips: from the undersides, long vertical streaks thinning into the dark
    const ND = Math.round(W * 22 * (P.fibres ?? 1));
    for (let d = 0; d < ND; d++) {
      const j = Math.floor(R() * nl), L = lobes[j], u = R() * TAU, v = -0.35 - R() * 0.65, s = Math.sqrt(1 - v * v);
      const x = L[0] + Math.cos(u) * s * L[3], y = L[1] + v * L[4], z = L[2] + Math.sin(u) * s * L[5];
      if (inside(x, y, z, j)) continue;
      const len = 1 + Math.pow(R(), 2.2) * 11, k = 0.06 + R() * 0.12, sd = R(), segs = 5;
      for (let g = 0; g < segs; g++) {
        const a = g / segs, b = (g + 1) / segs, ka = k * Math.pow(1 - a, 1.6), kb = k * Math.pow(1 - b, 1.6);
        pos.push(x, y - a * len, z, x, y - b * len, z);
        col.push(0.38 * ka, 0.32 * ka, 0.95 * ka, sd, 0.38 * kb, 0.32 * kb, 0.95 * kb, sd);
        nrm.push(0, 0, 0, Math.max(0.02, a * len), 0, 0, 0, Math.max(0.02, b * len));
      }
    }
    const ns = pos.length / 6, cA = new Float32Array(ns * 4), cB = new Float32Array(ns * 4), cC = new Float32Array(ns * 4), cN = new Float32Array(ns * 4);
    for (let j = 0; j < ns; j++) {
      const p = j * 6, c = j * 8, k = j * 4;
      const la = Math.hypot(col[c], col[c + 1], col[c + 2]) || 1e-6, lb = Math.hypot(col[c + 4], col[c + 5], col[c + 6]);
      cA.set([pos[p], pos[p + 1], pos[p + 2], col[c + 3]], k); cB.set([pos[p + 3], pos[p + 4], pos[p + 5], lb / la], k);
      cC.set([col[c], col[c + 1], col[c + 2], nrm[c + 3]], k); cN.set([nrm[c], nrm[c + 1], nrm[c + 2], nrm[c + 7]], k);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', ribbonQuad); g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('cA', new THREE.InstancedBufferAttribute(cA, 4)); g.setAttribute('cB', new THREE.InstancedBufferAttribute(cB, 4));
    g.setAttribute('cC', new THREE.InstancedBufferAttribute(cC, 4)); g.setAttribute('cN', new THREE.InstancedBufferAttribute(cN, 4));
    g.instanceCount = ns;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), W * 0.7 + 14);
    geos.push(g);
    const mesh = new THREE.Mesh(g, cloudMat);
    return { mesh, half: W / 2 };
  }
  {
    const R = rng(31), NC = 18;
    for (let i = 0; i < NC; i++) {
      const c = makeCloud(R, 100 + i);
      const rad = Math.max(c.half + 7, 12 + Math.pow(R(), 1.3) * 55);
      const alt = 15 + R() * 26 + (rad > 40 ? R() * 14 : 0);
      clouds.push({ mesh: c.mesh, a: R() * TAU, rad, alt, w: (0.18 + R() * 0.25) / rad, bob: R() * TAU });
      world.add(c.mesh);
    }
  }

  // -------------------------------------------------------------------------------------------- the hands, on the wall planes
  // One instanced sprite per element, lying on the wall plane and only as large as its influence (T-008 step 0: the cost follows the
  // area the hands light, not hands × the whole room): kind 0 a hand (halo, gold heart, gathered stars; 2.4 m square), kind 1 a
  // ripple (a ring), kind 2 a constellation line (a 12 cm ribbon; split at a corner when two hands are on neighbouring walls).
  // Each sprite carries its wall's normal: a camera draws only its own wall's sprites (a sprite overhanging a corner would
  // otherwise show through the neighbour wall at the wrong place).
  const MAXH = 16, MAXS = 24, MAXR = 16, NSP = (MAXH + MAXR) * 2 + MAXS * 2;
  const HV = Array.from({ length: MAXH }, () => new THREE.Vector4()), SV = Array.from({ length: MAXS }, () => new THREE.Vector4()), SW = Array.from({ length: MAXS }, () => new THREE.Vector4()), RV = Array.from({ length: MAXR }, () => new THREE.Vector4());
  const spG = new THREE.InstancedBufferGeometry();
  spG.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); spG.setIndex([0, 1, 2, 0, 2, 3]);
  const sA = new Float32Array(NSP * 4), sB = new Float32Array(NSP * 4), sN = new Float32Array(NSP * 4), sD = new Float32Array(NSP * 4);
  const SA = new THREE.InstancedBufferAttribute(sA, 4), SB = new THREE.InstancedBufferAttribute(sB, 4), SN = new THREE.InstancedBufferAttribute(sN, 4), SD = new THREE.InstancedBufferAttribute(sD, 4);
  for (const a of [SA, SB, SN, SD]) a.setUsage(THREE.DynamicDrawUsage);
  spG.setAttribute('hA', SA); spG.setAttribute('hB', SB); spG.setAttribute('hN', SN); spG.setAttribute('hD', SD); spG.instanceCount = 0; geos.push(spG);
  {
    // hA = centre xyz, kind · hB = along-axis xyz (unit, on the wall plane), half length · hN = wall normal xyz, half height ·
    // hD = kind 0: stillness, presence, s, y · kind 1: age, amplitude, -, - · kind 2: weight, -, -, -
    const A = attribute('hA', 'vec4'), Bx = attribute('hB', 'vec4'), Nn = attribute('hN', 'vec4'), D = attribute('hD', 'vec4');
    const ax = Bx.xyz, nrm = Nn.xyz, upv = cross(nrm, ax);
    const q = positionGeometry.xy, lx = q.x.mul(Bx.w), ly = q.y.mul(Nn.w);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.positionNode = A.xyz.add(ax.mul(lx)).add(upv.mul(ly)).add(nrm.mul(-0.004));
    const vL = varying(vec2(lx, ly)), vK = varying(A.w), vD = varying(D), vN = varying(nrm), vH = varying(q.x.mul(0.5).add(0.5));
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const c = vec3(0).toVar(), d2 = dot(vL, vL);
      If(vK.lessThan(0.5), () => {
        const st = vD.x.mul(vD.x).mul(float(3).sub(vD.x.mul(2))), pres = vD.y;
        const r = st.mul(0.32).add(0.16);
        c.addAssign(vec3(0.10, 0.15, 0.30).mul(pres.mul(st.mul(0.65).add(0.35))).mul(exp(d2.div(r.mul(r)).negate())).mul(0.6));
        c.addAssign(GOLD.mul(st.mul(pres).mul(exp(d2.mul(-1100))).mul(1.4)));
        // the stars a still hand gathers: cells fixed on the wall (perimeter s, height y), so they do not slide with the hand
        const P2 = vec2(vD.z.add(vL.x), vD.w.add(vL.y)), cell = floor(P2.div(0.07)), hsh = hash12(cell), f = fract(P2.div(0.07)).sub(0.5);
        const spark = step(0.9, hsh).mul(exp(dot(f, f).mul(-120))).mul(sin(uTime.mul(hsh.mul(3).add(1)).add(hsh.mul(50))).mul(0.4).add(0.6));
        c.addAssign(vec3(0.75, 0.82, 1.0).mul(spark.mul(pres.mul(st).mul(exp(d2.mul(-1.6)))).mul(1.2)));
      }).ElseIf(vK.lessThan(1.5), () => {
        const age = vD.x, dist = sqrt(d2), rad = age.mul(0.8).add(0.1), life = exp(age.mul(-1.4)).mul(vD.y);
        c.addAssign(vec3(0.5, 0.6, 0.85).mul(exp(dist.sub(rad).div(age.mul(0.03).add(0.015)).pow(2).negate()).mul(life).mul(0.14)));
      }).Else(() => {
        const d = abs(vL.y);
        c.addAssign(vec3(0.75, 0.82, 1.0).mul(vD.x).mul(exp(d.mul(d).mul(-90000)).mul(0.9).add(exp(d.mul(-40)).mul(0.04))).mul(sin(vH.mul(30).sub(uTime.mul(0.8))).mul(0.25).add(0.75)));
      });
      return vec4(c.mul(uWorld.mul(0.7).add(0.3)), 1);
    })();
    m.fog = false; mats.push(m);
    var handSprites = new THREE.Mesh(spG, m); handSprites.frustumCulled = false; handSprites.renderOrder = 9; object.add(handSprites);
  }
  // perimeter coordinate s (m) and height y → wall index, point on the wall plane (out)
  const wallAt = (s) => { s = ((s % PER) + PER) % PER; for (let i = NW - 1; i >= 0; i--) if (s >= cum[i]) return i; return 0; };
  // the point at perimeter s on wall wi's plane (extended past its edges when s lies just beyond them: a halo crossing a corner)
  const onWall = (wi, s, y, out) => { const w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER); return out.copy(w.pa).addScaledVector(w.right, ds + w.width / 2).setY(y); };
  // a round sprite (hand, ripple) of half size R at s: on its wall, and also on a neighbour if it reaches across the corner
  function roundSprite(kind, s, y, R, d0, d1, d2, d3) {
    const wi = wallAt(s), w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER);
    for (let n = 0; n < 2; n++) {
      const k = n === 0 ? wi : ds < 0 ? (wi + NW - 1) % NW : (wi + 1) % NW;
      if (n === 1 && Math.abs(ds) < w.width / 2 - R) break;
      onWall(k, s, y, _a); const r = walls[k].right; sprite(kind, _a.x, _a.y, _a.z, r.x, r.y, r.z, R, k, R, d0, d1, d2, d3);
    }
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  let nSp = 0;
  function sprite(kind, cx, cy, cz, axx, axy, axz, half, wi, halfH, d0, d1, d2, d3) {
    if (nSp >= NSP) return;
    const k = nSp * 4, n = walls[wi].normal;
    sA[k] = cx; sA[k + 1] = cy; sA[k + 2] = cz; sA[k + 3] = kind;
    sB[k] = axx; sB[k + 1] = axy; sB[k + 2] = axz; sB[k + 3] = half;
    sN[k] = n.x; sN[k + 1] = n.y; sN[k + 2] = n.z; sN[k + 3] = halfH;
    sD[k] = d0; sD[k + 1] = d1; sD[k + 2] = d2; sD[k + 3] = d3; nSp++;
  }
  function lineSprite(wi, s1, y1, s2, y2, wgt) {   // both ends on wall wi (s in that wall's range)
    onWall(wi, s1, y1, _a); onWall(wi, s2, y2, _b); _d.subVectors(_b, _a); const L = _d.length(); if (L < 0.01) return; _d.multiplyScalar(1 / L);
    sprite(2, (_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2, _d.x, _d.y, _d.z, L / 2, wi, 0.06, wgt, 0, 0, 0);
  }
  function fillHands(nH, nS, nR) {
    nSp = 0;
    for (let i = 0; i < nH; i++) { const h = HV[i]; roundSprite(0, h.x, h.y, 1.2, h.w, h.z, h.x, h.y); }
    for (let i = 0; i < nR; i++) { const rp = RV[i]; roundSprite(1, rp.x, rp.y, rp.z * 0.8 + 0.35, rp.z, rp.w, 0, 0); }
    for (let i = 0; i < nS; i++) {
      const sg = SV[i], w1 = wallAt(sg.x), w2 = wallAt(sg.z), wgt = SW[i].x;
      if (w1 === w2) { lineSprite(w1, sg.x, sg.y, sg.z, sg.w, wgt); continue; }
      // neighbouring walls: split at the corner (in the perimeter coordinate, going the short way from s1 to s2)
      const fwd = sg.z > sg.x, cs = fwd ? cum[w1] + walls[w1].width : cum[w1];
      const t = (cs - sg.x) / (sg.z - sg.x), yc = sg.y + (sg.w - sg.y) * t;
      lineSprite(w1, sg.x, sg.y, cs - (fwd ? 0.0005 : -0.0005), yc, wgt);
      const cs2 = fwd ? cs : cs;   // the same corner seen from the other wall
      lineSprite(w2, ((cs2 % PER) + PER) % PER + (fwd ? 0.0005 : -0.0005), yc, sg.z, sg.w, wgt);
    }
    spG.instanceCount = nSp;
    for (const a of [SA, SB, SN, SD]) a.needsUpdate = true;
  }

  // -------------------------------------------------------------------------------------------- arrive: the ceramic tower opens
  let arriveShards = null;
  function buildArrive(floors) {
    const r = rng(55), list = [];
    const H = Math.max(5, Math.min(9, floors || 7)) * 1.3 + 0.8;
    const TC = [[0.85, 0.83, 0.78], [0.06, 0.14, 0.55], [0.55, 0.20, 0.08], [0.70, 0.50, 0.15], [0.10, 0.35, 0.22], [0.75, 0.30, 0.12], [0.2, 0.35, 0.7]];
    for (const w of climb.order) {
      const th = towerAng(w), cx = Math.cos(th) * TR, cz = Math.sin(th) * TR;
      for (let y = 0.2; y < H; y += 0.24) {
        const rad = 1.15 - 0.035 * y, n = Math.round((TAU * rad) / 0.24);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU + y * 1.3 + r() * 0.08, nx = Math.cos(a), nz = Math.sin(a);
          const c = TC[Math.floor(r() * TC.length)], lit = (0.25 + 0.75 * Math.max(0, nx * -Math.cos(th) + nz * -Math.sin(th))) * (0.35 + r() * 0.25);
          list.push([cx + nx * rad, y, cz + nz * rad, 0.11 + r() * 0.04, c[0] * lit, c[1] * lit, c[2] * lit, (1 - y / H) * 0.3 + r() * 0.2, r(), nx, nz]);
        }
      }
    }
    const cap = 4 * 50 * 32;                                         // sized once (4 towers, 9 floors): a change only rewrites it
    if (!arriveShards || arriveShards.cap < list.length) {
      if (arriveShards) { world.remove(arriveShards.mesh); arriveShards.g.dispose(); arriveShards.mesh.material.dispose(); }
      arriveShards = billboards(Math.max(cap, list.length), world, { shards: true }); arriveShards.cap = Math.max(cap, list.length);
      arriveShards.aX && (arriveShards.g.attributes.bbX.setUsage(THREE.DynamicDrawUsage));
    }
    list.forEach((s, i) => { arriveShards.set(i, s[0], s[1], s[2], s[3], s[4], s[5], s[6], 4); arriveShards.aX.set([s[7], s[8], s[9], s[10]], i * 4); });
    arriveShards.g.instanceCount = list.length;
    arriveShards.AP.needsUpdate = true; arriveShards.AC.needsUpdate = true; arriveShards.g.attributes.bbX.needsUpdate = true;
    arriveShards.mesh.material.blending = THREE.NormalBlending;
    arriveShards.mesh.renderOrder = 8;                              // in front of the night's shards assembling round it
  }

  // -------------------------------------------------------------------------------------------- leave: the night breaks into shards
  const uBreak = uniform(new THREE.Vector3(0, 0.3, -1).normalize());
  const uFallLeave = uniform(0);                                     // 1 when Pom leaves into the fall (intent): no gold, the light goes out
  {
    const ico = new THREE.IcosahedronGeometry(11, 9), pa = ico.attributes.position, n = pa.count;
    const jit = (x, y, z) => { const k = Math.round(x * 97) * 73856093 ^ Math.round(y * 97) * 19349663 ^ Math.round(z * 97) * 83492791; const r = rng(k); return [(r() - 0.5) * 0.85, (r() - 0.5) * 0.85, (r() - 0.5) * 0.85]; };
    const pos = new Float32Array(n * 3), cen = new Float32Array(n * 4), bar = new Float32Array(n * 3), r = rng(8);
    for (let t = 0; t < n; t += 3) {
      let cx = 0, cy = 0, cz = 0; const sd = r();
      for (let k = 0; k < 3; k++) { const x = pa.getX(t + k), y = pa.getY(t + k), z = pa.getZ(t + k), j = jit(x, y, z); pos.set([x + j[0], y + j[1], z + j[2]], (t + k) * 3); cx += x / 3; cy += y / 3; cz += z / 3; bar[(t + k) * 3 + k] = 1; }
      for (let k = 0; k < 3; k++) cen.set([cx, cy, cz, sd], (t + k) * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.BufferAttribute(cen, 4)); g.setAttribute('aBar', new THREE.BufferAttribute(bar, 3));
    ico.dispose(); geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const C = attribute('aC', 'vec4'), cdir = normalize(C.xyz), sd = C.w;
    const delay = float(1).sub(dot(cdir, uBreak)).mul(0.2).add(sd.mul(0.14));
    // leave: the shards break away (k 0 → 1); arrive (T-022): the same shards fly IN from scattered (k 1 → 0) from ~+1 s and lock,
    // the night assembled from its fragments, then the world shows through as they thin away
    const kL = clamp(uLeave.sub(0.1).sub(delay).div(0.46), 0, 1);
    const kA = clamp(float(1).sub(uArrive.add(0.14).sub(delay.mul(0.6)).div(0.45)), 0, 1);
    const k = max(kL, select(uArrive.lessThan(0.999), kA, float(0)));
    const axis = normalize(vec3(fract(sd.mul(17.3)).sub(0.5), fract(sd.mul(41.7)).sub(0.5), fract(sd.mul(73.1)).sub(0.5)).add(vec3(0, 0.001, 0)));
    const ang = k.mul(fract(sd.mul(131.0)).mul(2.5).add(0.6));
    const shrink = smoothstep(0.95, 0.6, k);
    const local = rotA(positionGeometry.sub(C.xyz).mul(shrink), axis, ang);
    m.positionNode = C.xyz.mul(float(1).add(k.mul(0.5)).add(k.mul(k).mul(0.9))).add(vec3(0, k.mul(k).mul(fract(sd.mul(9.1)).mul(3).add(1)), 0)).add(local);
    const vDir = varying(normalize(positionGeometry)), vK = varying(k), vBar = varying(attribute('aBar', 'vec3')), vD = varying(delay), vSd = varying(fract(sd.mul(57.3)));
    const vN = varying(rotA(cdir, axis, ang));
    m.colorNode = Fn(() => {
      // the night itself (dark): the shard carries the sky and the city of its own direction; it dims as it drifts away
      const img = domeCol(vDir).mul(float(1).sub(vK.mul(0.6)));
      // cracks: hairlines (≈ 1.2 px whatever the distance) that spread from the enxaneta's light, the only light at first
      // cracks: NOT every edge (that reads as a wireframe): each shard keeps only some of its edges (its own random choice), they
      // spread slowly from the break (the enxaneta's light) and a few other points, and fade out at random; most of the night stays dark
      const r0 = fract(vSd.mul(13.7)), r1 = fract(vSd.mul(29.3)), r2 = fract(vSd.mul(51.1));
      const ex = select(r0.lessThan(0.3), vBar.x, float(1)), ey = select(r1.lessThan(0.25), vBar.y, float(1)), ez = select(r2.lessThan(0.2), vBar.z, float(1));
      const edge = min(min(ex, ey), ez);
      const line = float(1).sub(smoothstep(0.0, fwidth(vBar.x.add(vBar.y)).mul(0.9), edge));
      const seedsNear = max(max(step(0.93, fract(vSd.mul(7.1))), smoothstep(0.55, 0.0, vD)), float(0));
      const spread = max(smoothstep(vD.mul(0.9).add(0.02), vD.mul(0.9).add(0.12), uLeave).mul(seedsNear.mul(0.6).add(0.4)), smoothstep(0.35, 0.15, vK).mul(step(uArrive, 0.999)).mul(smoothstep(0.95, 0.7, uArrive)).mul(0.25));
      const crack = line.mul(spread).mul(smoothstep(0.6, 0.15, vK)).mul(0.55);
      // a mirror glint per shard, brief, as it turns
      const V = normalize(positionWorld.sub(cameraPosition)), Rr = V.sub(vN.mul(dot(V, vN).mul(2)));
      const sheen = pow(max(dot(Rr, uBreak), 0), 80).mul(sin(vK.mul(3.1416))).mul(0.9);
      // only one shard in four bursts into gold, briefly; the others thin into the dark
      const burst = smoothstep(0.55, 0.7, vK).mul(smoothstep(0.9, 0.72, vK)).mul(step(vSd, 0.25)).mul(step(0.001, uLeave));
      // the guide's band (0.9–1.6 m on the walls = rays just below the eye's horizon): the shards stay dim there; leaving into the fall
      // there is no gold at all (it fell: no crown)
      const Vd = normalize(positionWorld.sub(cameraPosition));
      const inBand = smoothstep(-0.30, -0.20, Vd.y).mul(smoothstep(0.08, 0.0, Vd.y));
      const goldK = float(1).sub(uFallLeave).mul(float(1).sub(inBand.mul(0.75)));
      const col = img.mul(float(1).sub(burst.mul(goldK))).mul(float(1).sub(inBand.mul(0.3))).add(GOLD.mul(crack.mul(float(1).sub(uFallLeave.mul(0.6))).add(sheen).add(burst.mul(1.4)).mul(goldK)));
      const alpha = max(smoothstep(0.02, 0.32, uLeave), step(uArrive, 0.999).mul(smoothstep(1.0, 0.82, uArrive))).mul(smoothstep(1.0, 0.8, vK));
      return vec4(col, alpha);
    })();
    m.fog = false; mats.push(m);
    var leaveMesh = new THREE.Mesh(g, m); leaveMesh.position.copy(EYE); leaveMesh.frustumCulled = false; leaveMesh.renderOrder = 7; leaveMesh.visible = false; object.add(leaveMesh);
  }

  // -------------------------------------------------------------------------------------------- per frame
  const pool = Array.from({ length: 32 }, () => ({ stroke: null, still: 0, emit: 0, seen: 0, s: 0, y: 0 }));
  const rip = Array.from({ length: MAXR }, () => ({ s: 0, y: 0, age: 99, amp: 0 }));
  const bells = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, age: 99 }));
  const addRip = (s, y, a) => { let b = rip[0]; for (const r of rip) if (r.age > b.age) b = r; b.s = s; b.y = y; b.age = 0; b.amp = a; };
  let frame = 0, qShown = -1, agit = 0, gust = 0, raise = 0, prevClimber = 0, prevQ = 0, lastFloors = -1, crownK = 0, walk = 0;
  const _p = new THREE.Vector3(), order = [];
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    const time = input.time ?? 0, pr = input.params || P, S = input.state || null;
    uTime.value = time;
    // ---- the state (the score's, or a stand-in)
    let progress, climber, cl, restless = false;
    order.length = 0;
    if (S && Array.isArray(S.walls)) for (let w = 0; w < S.walls.length && w < NW; w++) if (S.walls[w]) order.push(w);
    if (!order.length) { const nw = Math.max(2, Math.min(NW, Math.round(pr.walls ?? NW))); for (let w = 0; w < nw; w++) order.push(w); }
    if (S) { progress = S.progress ?? 0; climber = S.climber ?? 0; cl = S.climb ?? 0; restless = !!S.restless; }
    else {
      progress = (pr.cycle > 0) ? ((time % pr.cycle) / pr.cycle) : (input.progress ?? pr.progress ?? 0);
      climber = pr.climber >= 0 ? Math.round(pr.climber) : Math.min(2, Math.floor(progress * 3));
      cl = pr.climb >= 0 ? pr.climb : clamp01(progress * 3 - climber);
      if (pr.climber >= 0 || pr.climb >= 0) progress = (climber + cl) / 3;
      restless = !!pr.restless;
    }
    const ord = order.join(',');
    const fl = S?.floors || pr.floors || 7, fkey = climb.floors + '|' + climb.A1;
    setFloors(fl, pr.height || 0);
    if (ord !== climb.order.join(',') || fkey !== climb.floors + '|' + climb.A1) { climb.order = order.slice(); build(); buildArrive(climb.floors); }
    if (!arriveShards) buildArrive(climb.floors);
    // ---- hands: stillness grows, movement ripples
    const hands = input.hands || [];
    let nH = 0, moving = 0;
    for (const h of hands) {
      let st = null; for (const p of pool) if (p.stroke === h.stroke) { st = p; break; }
      if (!st) { st = pool.find((p) => p.seen !== frame - 1 && p.seen !== frame) || pool[0]; st.stroke = h.stroke; st.still = 0; st.emit = 0; addRip(cum[h.wall] + h.u * walls[h.wall].width, h.pos.y, 0.35); }
      st.seen = frame; st.s = cum[h.wall] + h.u * walls[h.wall].width; st.y = h.pos.y;
      const sp = Math.hypot(h.vx || 0, h.vy || 0);
      if (sp > 0.3) { st.still = Math.max(0, st.still - dt * 4); moving++; st.emit -= dt; if (st.emit <= 0) { addRip(st.s, st.y, Math.min(1, 0.4 + sp)); st.emit = 0.45; } }
      else st.still = Math.min(1, st.still + dt / 2);
      if (nH < MAXH) { HV[nH].set(st.s, st.y, 1, st.still); nH++; }
    }
    for (const p of pool) if (p.seen !== frame) p.stroke = null;
    let nS = 0;
    for (let i = 0; i < nH && nS < MAXS; i++) for (let j = i + 1; j < nH && nS < MAXS; j++) {
      const si = HV[i].w, sj = HV[j].w; if (si < 0.3 || sj < 0.3) continue;
      let dx = HV[j].x - HV[i].x; dx -= PER * Math.round(dx / PER); const dy = HV[j].y - HV[i].y, d = Math.hypot(dx, dy); if (d > 2) continue;
      SV[nS].set(HV[i].x, HV[i].y, HV[i].x + dx, HV[j].y); const f = (Math.min(si, sj) - 0.3) / 0.7; SW[nS].set(f * f * (1 - Math.pow(d / 2, 3)) * 0.5, 0, 0, 0); nS++;
    }
    let nR = 0; for (const r of rip) { r.age += dt; if (r.age < 3.5 && nR < MAXR) { RV[nR].set(r.s, r.y, r.age, r.amp); nR++; } }
    fillHands(nH, nS, nR);
    if (!S && moving) restless = true;
    // ---- agitation, wind, hesitation
    agit += ((restless ? 1 : 0) - agit) * (1 - Math.exp(-dt * (restless ? 6 : 1.2)));
    if (restless) gust = Math.min(1, gust + dt * 1.5); else gust = Math.max(0, gust - dt * 0.25);
    const q = Math.min(3, climber + cl);
    if (qShown < 0 || Math.abs(q - qShown) > 0.6) qShown = q;
    else { qShown += (q - qShown) * (1 - Math.exp(-dt * 2.5 * (1 - 0.85 * agit))); qShown = Math.max(0, qShown - agit * 0.004 * dt); }
    const done = qShown >= 2.995 || (S && S.phase === 'reward');
    // ---- arrivals: the bell of light
    const events = input.events;
    const ring = (n) => { let b = bells[0]; for (const x of bells) if (x.age > b.age) b = x; pathPos(n, 1, _p); b.x = _p.x; b.y = _p.y; b.z = _p.z; b.age = 0; uBell.value = 1; if (n === 2) raise = Math.max(raise, 0.001); };
    if (S && events) { for (const e of events) if (typeof e === 'string' && e.startsWith('arrived:')) ring(+e.slice(8) || 0); }
    else if (!S) { if (Math.floor(qShown) > Math.floor(prevQ) && qShown - prevQ < 0.5) ring(Math.floor(qShown) - 1); if (qShown >= 2.995 && prevQ < 2.995) ring(2); }
    prevQ = qShown;
    if (done) raise = Math.max(raise, 0.001);
    if (qShown < 2.9 && !done) raise = 0;
    if (raise > 0) raise = Math.min(1, raise + dt / 2.2);
    uBell.value = Math.max(0, uBell.value - dt * 0.6);
    crownK += ((raise > 0 ? 1 : 0) - crownK) * (1 - Math.exp(-dt * 0.6));
    uCalm.value = crownK;
    // ---- the ascent
    const A = Aof(qShown / 3) + 0.03 * Math.sin(time * 0.9) * (1 - crownK);
    uA.value = A; uLift.value = A - 1.6; world.position.y = -(A - 1.6);
    uQ.value = qShown;
    // ---- arrive / leave
    const arrive = input.arrive ?? (S ? 1 : pr.arrive ?? 1), leave = input.leave ?? (S ? 0 : pr.leave ?? 0);
    uArrive.value = arrive; uLeave.value = leave;
    arriveShards.mesh.visible = arrive < 0.999;
    leaveMesh.visible = leave > 0.001 || arrive < 0.999;
    uDomeIn.value = Math.min(1, Math.max(0, (arrive - 0.1) / 0.6));
    dome.visible = arrive > 0.1;
    for (const c of world.children) if (c.isInstancedMesh) c.visible = uWorld.value > 0.02;   // the city's opaque blocks: not before they show
    // leaving into the fall (the score's block is 'fall', or the outcome 'intent'; study: params.fallLeave)
    const fallLeave = leave > 0 && (S ? (S.block === 'fall' || S.outcome === 'intent') : !!pr.fallLeave);
    uFallLeave.value = fallLeave ? 1 : 0;
    uWorld.value = sm((arrive - 0.45) / 0.45) * (1 - sm((leave - 0.05) / 0.35));   // arrive: the world shows through once the shards have locked   // the night drains slowly into the shards (QA 23:3x)
    uStars.value = (pr.stars ?? 1); uCity.value = pr.city ?? 1; uCloud.value = (pr.clouds ?? 1) * 0.9; uGold.value = pr.gold ?? 1;
    uShiver.value = agit;
    // ---- clouds drift round the room
    const wind = (pr.wind ?? 1) * (1 + 3 * gust) * (1 - 0.75 * crownK);
    walk += dt * wind;
    for (const c of clouds) { const a = c.a + walk * c.w; c.mesh.position.set(Math.cos(a) * c.rad, c.alt + 0.6 * Math.sin(time * 0.1 + c.bob), Math.sin(a) * c.rad); c.mesh.rotation.y = -a; }
    // ---- the lights
    const ci = Math.min(2, Math.floor(qShown)), cc = Math.min(1, qShown - ci);
    const flick = 1 - agit * 0.65 * (0.5 + 0.5 * Math.sin(time * 21 + 3 * Math.sin(time * 6.3)));
    for (let i = 0; i < 3; i++) {
      const vis = i < ci || (i === ci) ? 1 : 0;
      if (i < ci) { pathPos(i, 1, _p); const b = 0.35 * (0.85 + 0.15 * Math.sin(time * 1.3 + i)); glows.set(i, _p.x, _p.y, _p.z, 0.7, 1.0 * b * 3, 0.7 * b * 3, 0.35 * b * 3, 1); }
      else if (i === ci) {
        pathPos(i, cc, _p); _p.x += agit * 0.02 * Math.sin(time * 17); _p.y += agit * 0.02 * Math.sin(time * 13);
        const b = flick * (0.9 + 0.1 * Math.sin(time * 1.3)) * (fallLeave ? 1 - sm(leave / 0.2) : 1 + crownK * 0.8 + leave * 1.5) * (pr.gold ?? 1);
        glows.set(i, _p.x, _p.y, _p.z, 1.1 + 0.8 * crownK + leave * 1.2, 1.0 * b * 4, 0.72 * b * 4, 0.38 * b * 4, 1);
      } else glows.set(i, 0, 0, 0, 0, 0, 0, 0, 1);
      if (!vis) glows.set(i, 0, 0, 0, 0, 0, 0, 0, 1);
    }
    // the beacon: the next tower glows where she will arrive
    {
      const n = climb.order.length, sf = cc * n, k = Math.min(n - 1, Math.floor(sf)), f = sf - k;
      let b = 0;
      if (k < n - 1 && !done) { b = sm((f - 0.4) / 0.32) * (1 - sm((f - 0.92) / 0.08)); pathPos(ci, (k + 1) / n, _p); }
      glows.set(3, _p.x, _p.y, _p.z, 1.6, 0.5 * b, 0.32 * b, 0.12 * b, 0);
      if (b === 0) glows.set(3, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    for (let j = 0; j < 4; j++) { const bl = bells[j]; bl.age += dt; const a = bl.age, L = a < 3 ? (1 - a / 3) : 0; glows.set(4 + j, bl.x, bl.y, bl.z, 0.4 + a * 1.6, 1.0 * L * 1.2, 0.7 * L * 1.2, 0.35 * L * 1.2, 2); }
    // the enxaneta raises her hand: a thin streak of gold above the light
    if (raise > 0) { pathPos(2, 1, _p); const h = sm(raise) * 0.32; glows.set(8, _p.x, _p.y + h + 0.05, _p.z, Math.max(0.01, h), 2.4 * sm(raise), 1.6 * sm(raise), 0.7 * sm(raise), 3); }
    else glows.set(8, 0, 0, 0, 0, 0, 0, 0, 3);
    // the fanals below
    const lk = (pr.lamps ?? 1) * uWorld.value;
    for (let i = 0; i < NL; i++) { const L = lamps[i], v = lk * (0.95 + 0.05 * Math.sin(time * 7 + i)); lampV[i].set(L.x, L.y, L.z, v); glows.set(9 + i, L.x, L.y, L.z, 0.5, 2.2 * v, 1.2 * v, 0.5 * v, 0); }
    if (fallLeave) { const kf = 1 - sm(leave / 0.2); for (let i = 0; i < 9; i++) for (let c = 0; c < 3; c++) glows.aC[i * 4 + c] *= kf; }   // it fell: the lights go out in ~1 s
    glows.AP.needsUpdate = true; glows.AC.needsUpdate = true;
    // leave: the break starts from the enxaneta's light
    pathPos(2, 1, _p); _p.y -= (A - 1.6); uBreak.value.copy(_p).sub(EYE).normalize();
    prevClimber = climber; if (S?.floors != null) lastFloors = S.floors;
  }
  setFloors(P.floors || 7, P.height || 0); build(); buildArrive(climb.floors);
  towerBody(3, climb.A1 + TOPR[2] - 0.2); towerBody(4, climb.A1 + TOPR[2] - 0.2);   // warm both kinds at load
  for (const o of [[0, 1], [0, 1, 2], [0, 1, 2, 3].slice(0, NW)]) { climb.order = o; climb.built = ''; build(); buildArrive(climb.floors); }   // and the rebuild paths (JIT): no stall when Pom arrives
  function setParams() { /* read live in update(); fibres apply on reload */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); if (embers) { embers.g.dispose(); embers.mesh.material.dispose(); } if (arriveShards) { arriveShards.g.dispose(); arriveShards.mesh.material.dispose(); } }
  if (typeof window !== 'undefined') window.__pom3d = { buildings: B.length, chimneys: chims.length, clouds: clouds.length, cloudSegments: clouds.reduce((a, c) => a + c.mesh.geometry.instanceCount, 0) };
  return { object, update, setParams, dispose };
}
