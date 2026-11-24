// Ressonància — part "castell": four human towers made of light, one beyond each wall (contract: ../PARTS.md).
//
// Bodies: every person is a procedural body (torso lofted along a spine, pelvis, neck, head, arms, hands, legs, feet: capsules and
// ellipsoids on a small skeleton posed by two-bone IK to real targets: feet on the shoulders of the one below, hands on the
// neighbours' shoulders, on the backs of the inner ring, on the calves above) and is drawn ONLY as luminous particles sampled on that
// surface. Surface sampling + additive light = bodies that glow at the silhouette like pearl or porcelain; never a mannequin. The
// sash (faixa) is a darker band; children (acotxador, enxaneta) have child proportions.
// Structure (castell-local, metres, +z towards the room): a pinya of 3 rings (≈12/18/24 people) pressed round the base, leaning in,
// the first ring with arms raised to the second tier's legs, the others with hands on the backs of the ring inside; a tronc of
// `tiers` levels of 3 ("tres") or 4 ("quatre") facing out, each standing on the shoulders of the one below, arms on the neighbours'
// shoulders; the pom de dalt: dosos (2, embracing), the acotxador (crouched over them) and the enxaneta (a child, standing on top).
// The four castells share one geometry (one InstancedBufferGeometry of billboards; all motion in the vertex shader, TSL); each has
// its own uniforms (build, dissolve, hand, breathing phase), walls 1 and 3 see it mirrored.
//
// Choreography on input.t (the intro's clock, s):
//   0–22   nothing
//   22–47  the castells rise, wall i starts at 22 + 2.4 i and is complete at 44 + 1.0 i (wall 0: the enxaneta on top at 44):
//          the pinya condenses from particles spiralling in out of the dark, inner ring first, then the baixos; then tier after tier
//          climbs (≈2 s per tier: each person rises from below into place, the arms move from reaching to holding, a soft flash
//          when they settle), then the dosos, the acotxador and the enxaneta, who climbs the whole tower
//   46–53  they dissolve upward, the top first, before the last ones are complete: particles rise as thin streaks, drift and fade
//          (wall i from 46 + 0.3 i, 6 s)
//   53–    nothing
// params.build (0..1) overrides the rise when > 0 (the chapter Tronc can raise it floor by floor), params.dissolve likewise.
// Per-wall (the whole work, res-obra3d; all optional, absent = as before): params.buildPer[i] / disPer[i] (0..1) replace build /
// dissolve for castell i; params.show[i] === false hides it; params.tilt[i] (rad) leans it about its wall's normal, pivoting at the base.
// Hands (on the wall planes): the nearest castell's pinya leans a little towards the hand and warms on that side.

const T0 = 22, STAGGER = 2.4, TOP0 = 44, TOPSTEP = 1.0, DIS0 = 46, DISSTEP = 0.3, DISDUR = 6.0;
const BASE_N = 2300;                                     // particles for an adult (scale 1) at density 1

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
  ['head', null, null, 0, 0, 0.13, 1.2],
  ['cap', 'shL', 'eL', 0.052, 0.04, 0.085, 1], ['cap', 'shR', 'eR', 0.052, 0.04, 0.085, 1],
  ['cap', 'eL', 'wL', 0.04, 0.03, 0.06, 1.05], ['cap', 'eR', 'wR', 0.04, 0.03, 0.06, 1.05],
  ['cap', 'wL', 'hnL', 0.032, 0.022, 0.025, 1.3], ['cap', 'wR', 'hnR', 0.032, 0.022, 0.025, 1.3],
  ['cap', 'hL', 'kL', 0.085, 0.055, 0.16, 0.95], ['cap', 'hR', 'kR', 0.085, 0.055, 0.16, 0.95],
  ['cap', 'kL', 'aL', 0.055, 0.036, 0.11, 0.95], ['cap', 'kR', 'aR', 0.055, 0.036, 0.11, 0.95],
  ['cap', 'aL', 'tL', 0.04, 0.03, 0.03, 0.9], ['cap', 'aR', 'tR', 0.04, 0.03, 0.03, 0.9],
  ['sph', 'shL', null, 0.058, 0, 0.02, 1], ['sph', 'shR', null, 0.058, 0, 0.02, 1],
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

// ---------------------------------------------------------------------------------------------------------------- the castell
// people: { spec (pose B), specA (climbing pose) or null, start, dur, climb (m, 0 = condenses in place), energy, pinya }
function buildCastell(kind, tiers, seed) {
  const r = rng(seed), n = kind === 'quatre' ? 4 : 3, R = n === 4 ? 0.36 : 0.31;
  const people = [], tronc = [];
  const ang0 = n === 4 ? Math.PI / 4 : Math.PI / 2;      // tres: one of them faces the room
  // scales per tier: strong at the bottom, lighter going up
  const tierScale = (L) => [1.05, 1.0, 0.97, 0.94, 0.92, 0.9, 0.88][L] ?? 0.88;
  // 1. the tronc (core first: positions of shoulders depend only on feet, lean)
  for (let L = 0; L < tiers; L++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const a = ang0 + (j * 2 * Math.PI) / n, f = V(Math.cos(a), 0, Math.sin(a)), side = norm(cross(f, UP)), s = tierScale(L) * (0.98 + r() * 0.04);
      let feet;
      if (L === 0) { const c = mul(f, R + 0.02); feet = [add(madd(c, side, -0.15), V(0, 0.075 * s, 0)), add(madd(c, side, 0.15), V(0, 0.075 * s, 0))]; }
      else { const b = tronc[L - 1][j].k; feet = [madd(add(b.shL, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, 0.035), madd(add(b.shR, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, -0.035)]; }
      const spec = { f, s, lean: L === 0 ? -0.04 : 0.02, head: L === 0 ? 0.15 : -0.05, feet, hands: [V(), V()], bend: L === 0 ? 0.93 : 0.96 };
      row.push({ spec, k: skeleton(spec), a, j });
    }
    tronc.push(row);
  }
  const T = tronc.length;
  // tronc arms: on the neighbours' shoulders (baixos: on the calves of the segon above)
  for (let L = 0; L < T; L++) for (const p of tronc[L]) {
    const k = p.k, sp = p.spec;
    if (L === 0 && T > 1) {
      const up = tronc[1][p.j].k;
      sp.hands = [madd(add(up.aL, V(0, 0.16 * up.s, 0)), k.f, 0.07), madd(add(up.aR, V(0, 0.16 * up.s, 0)), k.f, 0.07)];
      sp.elbow = add(mul(k.side, 0), add(mul(UP, -0.4), k.f));
    } else {
      const nb = [tronc[L][(p.j + n - 1) % n].k, tronc[L][(p.j + 1) % n].k];
      const hands = [];
      for (const sgn of [-1, 1]) {               // -1 = left hand: the neighbour on my left
        const q = nb.reduce((best, b) => (dot(sub(b.pelvis, k.pelvis), k.side) * sgn > dot(sub(best.pelvis, k.pelvis), k.side) * sgn ? b : best));
        const near = len(sub(q.shL, k.pelvis)) < len(sub(q.shR, k.pelvis)) ? q.shL : q.shR;
        hands.push(add(lerp(near, q.neck, 0.35), V(0, 0.06 * q.s, 0)));
      }
      sp.hands = hands; sp.elbow = add(mul(UP, -1), mul(k.f, 0.5));
    }
    p.k = skeleton(sp);
  }
  // the pom de dalt
  const top = tronc[T - 1], shY = top.reduce((a, p) => a + (p.k.shL[1] + p.k.shR[1]) / 2, 0) / n;
  const dosos = [];
  for (const sgn of [-1, 1]) {
    const s = 0.8, c = V(sgn * 0.16, 0, 0), f = V(-sgn, 0, 0), side = norm(cross(f, UP));
    const feet = [add(madd(c, side, -0.13), V(0, shY + 0.07 + 0.07 * s, 0)), add(madd(c, side, 0.13), V(0, shY + 0.07 + 0.07 * s, 0))];
    const spec = { f, s, lean: 0.12, head: 0.1, feet, hands: [V(), V()], bend: 0.95 };
    dosos.push({ spec, k: skeleton(spec) });
  }
  for (let i = 0; i < 2; i++) {                  // embracing: hands on the other's far shoulders
    const me = dosos[i], o = dosos[1 - i].k;
    me.spec.hands = [add(o.shR, V(0, 0.05, 0)), add(o.shL, V(0, 0.05, 0))];
    me.spec.elbow = add(mul(UP, -0.6), mul(me.k.f, -0.2));
    me.k = skeleton(me.spec);
  }
  const dsY = (dosos[0].k.shL[1] + dosos[0].k.shR[1]) / 2;
  const sA = 0.66, ac = { f: V(0, 0, 1), s: sA, lean: 1.05, head: -0.5, child: true, bend: 0.7,
    feet: [V(-0.16, dsY + 0.07 + 0.065 * sA, 0.0), V(0.16, dsY + 0.07 + 0.065 * sA, 0.0)],
    pelvis: V(0, dsY + 0.07 + 0.3 * sA, -0.12), knee: V(0, 0.3, 1),
    hands: [V(-0.17, dsY + 0.08, 0.2), V(0.17, dsY + 0.08, 0.2)], elbow: V(0, -0.3, -1) };
  const acK = skeleton(ac);
  const backY = acK.S(0.55)[1] + 0.12 * sA;
  const sE = 0.62, enx = { f: V(0, 0, 1), s: sE, lean: 0.06, head: -0.12, child: true, bend: 0.9,
    feet: [V(-0.15, backY + 0.06 * sE, -0.02), V(0.15, backY + 0.06 * sE, -0.02)], hands: [V(-0.42, backY + 0.85, 0.04), V(0.42, backY + 0.85, 0.04)],
    elbow: V(0, -1, 0) };

  // 2. the pinya: rings facing in, leaning in, pressed together
  const rings = [], baseR = R + 0.42;
  const ringN = n === 4 ? [13, 19, 25] : [12, 18, 24];
  for (let i = 0; i < 3; i++) {
    const rad = baseR + i * 0.43, row = [], nn = ringN[i], off = r() * 6.28;
    for (let j = 0; j < nn; j++) {
      const a = off + ((j + (r() - 0.5) * 0.25) * 2 * Math.PI) / nn, out = V(Math.cos(a), 0, Math.sin(a)), f = mul(out, -1), side = norm(cross(f, UP));
      const s = 0.93 + r() * 0.12, rr = rad + (r() - 0.5) * 0.06, fwd = r() < 0.5 ? -1 : 1;
      const c = mul(out, rr + 0.1);
      const feet = [add(madd(madd(c, side, -0.12), f, fwd * 0.12), V(0, 0.075 * s, 0)), add(madd(madd(c, side, 0.12), f, -fwd * 0.12), V(0, 0.075 * s, 0))];
      const spec = { f, s, lean: [0.2, 0.32, 0.4][i] + r() * 0.08, head: i === 0 ? -0.25 : 0.35 + r() * 0.2, feet, hands: [V(), V()], bend: 0.93 };
      row.push({ spec, k: skeleton(spec), out, a, rad: rr });
    }
    rings.push(row);
  }
  for (let i = 0; i < 3; i++) for (const p of rings[i]) {
    const sp = p.spec, k = p.k, s = sp.s;
    if (i === 0) {                               // arms raised high: to the segons' legs / the baixos' shoulders
      const hy = T > 1 ? 1.95 + r() * 0.2 : 1.5, hr = R + 0.16 + r() * 0.06;
      const tg = madd(mul(p.out, hr), k.side, 0);
      sp.hands = [add(madd(tg, k.side, -0.14), V(0, hy, 0)), add(madd(tg, k.side, 0.14), V(0, hy, 0))];
      sp.elbow = add(mul(k.side, 0), add(mul(UP, -0.5), mul(k.f, -0.6)));
    } else {                                     // hands on the backs / shoulders of the ring inside
      const hr = rings[i - 1][0].rad + 0.12, hy = (1.28 + r() * 0.12) * s;
      const tg = mul(p.out, hr);
      sp.hands = [add(madd(tg, k.side, -0.2), V(0, hy, 0)), add(madd(tg, k.side, 0.2), V(0, hy + (r() - 0.5) * 0.1, 0))];
      sp.elbow = add(mul(UP, -1), mul(k.f, -0.2));
    }
    p.k = skeleton(sp);
  }

  // 3. the schedule, in nominal seconds (then normalised so that build 0..1 is the whole rise)
  const ph = () => r() * 6.283;
  rings.forEach((row, i) => row.forEach((p) => people.push({ k: p.k, kA: null, start: 0.2 + i * 1.0 + r() * 1.3, dur: 3.8, climb: 0, energy: [0.5, 0.65, 0.85][i], pinya: 1, phase: ph() })));
  tronc[0].forEach((p, j) => people.push({ k: p.k, kA: null, start: 2.6 + j * 0.2, dur: 3.2, climb: 0, energy: 0.9, pinya: 0.5, phase: ph() }));
  const climbing = (sp) => {                     // the pose while climbing: reaching up, one knee raised, hugging the tower
    const k = skeleton(sp), s = sp.s;
    const hands = [madd(add(k.shL, V(0, 0.5 * s, 0)), k.f, 0.1), madd(add(k.shR, V(0, 0.42 * s, 0)), k.f, 0.12)];
    const feet = [madd(add(sp.feet[0], V(0, 0.42 * s, 0)), k.f, 0.18), add(sp.feet[1], V(0, -0.12 * s, 0))];
    return skeleton({ ...sp, hands, feet, lean: (sp.lean || 0) + 0.18, elbow: V(0, -1, 0), pelvis: null });
  };
  const step = 1.8, t1 = 6.2;
  for (let L = 1; L < T; L++) tronc[L].forEach((p, j) => people.push({ k: p.k, kA: climbing(p.spec), start: t1 + (L - 1) * step + j * 0.2, dur: 2.4, climb: 1.9, energy: 1, pinya: 0, phase: ph() }));
  const tl = t1 + (T - 1) * step;
  dosos.forEach((p, j) => people.push({ k: p.k, kA: climbing(p.spec), start: tl + 0.3 + j * 0.3, dur: 2.2, climb: 1.7, energy: 1.1, pinya: 0, phase: ph() }));
  people.push({ k: acK, kA: climbing(ac), start: tl + 2.0, dur: 2.0, climb: 1.5, energy: 1.15, pinya: 0, phase: ph() });
  people.push({ k: skeleton(enx), kA: climbing(enx), start: tl + 3.4, dur: 2.8, climb: 2.6, energy: 1.3, pinya: 0, phase: ph() });
  const total = Math.max(...people.map((p) => p.start + p.dur));
  for (const p of people) { p.start /= total; p.dur /= total; }
  return { people, total };
}

// ---------------------------------------------------------------------------------------------------------------- the part
export function create({ THREE, TSL, room, params }) {
  const { attribute, uniform, vec2, vec3, vec4, float, clamp, mix, smoothstep, sin, cos, exp, max, min, normalize, select, varying,
    positionGeometry, modelViewMatrix, cameraProjectionMatrix, uv, dot, length, step } = TSL;
  const P = params;
  const object = new THREE.Group();
  object.name = 'castell';

  // shared uniforms
  const uTint = uniform(new THREE.Vector3(1, 1, 1)), uTime = uniform(0), uTop = uniform(10), uGain = uniform(1), uSize = uniform(0.03), uSpan = uniform(20);

  // ---- the geometry (one, shared by the four castells)
  let geo = null, geoOcc = null, top = 10, structKey = '';
  function rebuild() {
    const kind = P.kind === 'quatre' ? 'quatre' : 'tres', tiers = Math.round(Math.min(7, Math.max(4, P.tiers ?? 5))), dens = Math.min(3, Math.max(0.1, P.density ?? 1));
    structKey = `${kind}|${tiers}|${dens}`;
    const { people } = buildCastell(kind, tiers, 1234 + tiers * 7 + (kind === 'quatre' ? 99 : 0));
    const counts = people.map((p) => Math.round(BASE_N * dens * p.k.s * p.k.s));
    const N = counts.reduce((a, b) => a + b, 0);
    const aB = new Float32Array(N * 4), aA = new Float32Array(N * 4), aN = new Float32Array(N * 4), aP = new Float32Array(N * 4), aR = new Float32Array(N * 4);
    const r = rng(77), pos = [0, 0, 0], nrm = [0, 0, 0], rec = [0, 0, 0, 0];
    let i = 0; top = 0;
    // cumulative weights for picking a segment by area
    const cum = []; let acc = 0; for (const g of SEGS) { acc += g[5] / SEGW; cum.push(acc); }
    people.forEach((p, pi) => {
      for (let c = 0; c < counts[pi]; c++, i++) {
        const x = r(); let sg = 0; while (sg < cum.length - 1 && x > cum[sg]) sg++;
        rec[0] = sg; rec[1] = r(); rec[2] = r(); rec[3] = r();
        const e = evalSample(p.k, rec, pos, nrm);
        const jit = (r() - 0.5) * 0.012;           // a little thickness
        aB[i * 4] = pos[0] + nrm[0] * jit; aB[i * 4 + 1] = pos[1] + nrm[1] * jit; aB[i * 4 + 2] = pos[2] + nrm[2] * jit; aB[i * 4 + 3] = e * p.energy;
        top = Math.max(top, pos[1]);
        aN[i * 4] = nrm[0]; aN[i * 4 + 1] = nrm[1]; aN[i * 4 + 2] = nrm[2]; aN[i * 4 + 3] = r();
        if (p.kA) evalSample(p.kA, rec, pos, nrm);
        aA[i * 4] = pos[0]; aA[i * 4 + 1] = pos[1]; aA[i * 4 + 2] = pos[2]; aA[i * 4 + 3] = r();
        aP[i * 4] = p.start; aP[i * 4 + 1] = p.dur; aP[i * 4 + 2] = p.phase; aP[i * 4 + 3] = p.climb;
        aR[i * 4] = r(); aR[i * 4 + 1] = r(); aR[i * 4 + 2] = r(); aR[i * 4 + 3] = p.pinya;
      }
    });
    // LOD (T-011): the walls' eye sees each castell from the front. A particle on the far side of a body (its normal away from the
    // eye) carries ~5 % of the light (shell term below) and the back half of the pinya stands behind the tronc: keep a fraction of
    // those (their energy scaled up by 1/fraction, so the light is the same), all of the rest. The occluder pass draws only the
    // front-facing particles (the back ones never hide anything the front ones do not).
    const ez = (P.distance ?? 6.5) + 3.4, KEEP_BACK = 0.2, KEEP_PINYA_BACK = 0.3;   // T-011 step 5 (was 0.3 / 0.45)
    const cls = new Uint8Array(N);                 // 0 front, also an occluder · 3 front · 1 back, kept · 2 dropped
    let nFront = 0, nKeep = 0;
    for (let k = 0; k < N; k++) {
      const x = aB[k * 4], y = aB[k * 4 + 1], z = aB[k * 4 + 2];
      let vx = -x, vy = 1.6 - y, vz = ez - z; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      const ndv = aN[k * 4] * vx + aN[k * 4 + 1] * vy + aN[k * 4 + 2] * vz;
      const pinyaBack = aR[k * 4 + 3] > 0.9 && z < -0.4;
      const keep = pinyaBack ? KEEP_PINYA_BACK : ndv < -0.3 ? KEEP_BACK : 1;
      const hk = (Math.imul(k + 7, 2246822519) >>> 0) / 4294967296;
      if (keep >= 1) { if (hk < 0.5) { cls[k] = 0; nFront++; } else cls[k] = 3; }
      else if (((Math.imul(k + 1, 2654435761) >>> 0) / 4294967296) < keep) { cls[k] = 1; aB[k * 4 + 3] /= keep; }
      else cls[k] = 2;
      if (cls[k] !== 2) nKeep++;
    }
    const pack = (src) => { const out = new Float32Array(nKeep * 4); let o = 0; for (const want of [0, 3, 1]) for (let k = 0; k < N; k++) if (cls[k] === want) { out.set(src.subarray(k * 4, k * 4 + 4), o * 4); o++; } return out; };
    const arrs = [['aB', pack(aB)], ['aA', pack(aA)], ['aN', pack(aN)], ['aP', pack(aP)], ['aR', pack(aR)]];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [name, arr] of arrs) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, 4));
    g.instanceCount = nKeep;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, top * 0.5 + 1.5, 0), top * 0.5 + 4);
    const go = new THREE.InstancedBufferGeometry();          // the occluder: the same buffers, the front-facing particles only
    for (const name of ['position', 'uv', 'aB', 'aA', 'aN', 'aP', 'aR']) go.setAttribute(name, g.getAttribute(name));
    go.setIndex(g.getIndex()); go.instanceCount = nFront; go.boundingSphere = g.boundingSphere;
    if (geo) geo.dispose();
    if (geoOcc) geoOcc.dispose();
    geo = g; geoOcc = go; uTop.value = top;
    for (const c of castells) { c.mesh.geometry = geo; c.occ.geometry = geoOcc; }
    stats.particles = nKeep; stats.sampled = N; stats.occluders = nFront; stats.people = people.length; stats.top = top;
  }
  const stats = { particles: 0, people: 0, top: 0 };

  // ---- the material: everything happens in the vertex shader
  // occ = true: the occluder pass (depth only, slightly inside the skin, larger): it hides what is behind a body, so the bodies
  // read as bodies and not as a tangle of overlapping light
  function makeMaterial(U, occ) {
    const B = attribute('aB', 'vec4'), A = attribute('aA', 'vec4'), Nn = attribute('aN', 'vec4'), Pp = attribute('aP', 'vec4'), Rr = attribute('aR', 'vec4');
    const posB = B.xyz, energy = B.w, posA = A.xyz, r0 = A.w, nrm = Nn.xyz, r4 = Nn.w;
    const start = Pp.x, dur = Pp.y, phase = Pp.z, climb = Pp.w, r1 = Rr.x, r2 = Rr.y, r3 = Rr.z, pinya = Rr.w;
    const sm = (x) => x.mul(x).mul(x.mul(x.mul(6).sub(15)).add(10));       // smootherstep on 0..1
    const u = clamp(U.build.sub(start).div(dur), 0, 1);
    // condensing (pinya, baixos): every particle spirals in from the dark on its own delay
    const up = clamp(u.sub(r0.mul(0.45)).div(0.55), 0, 1), e0 = sm(up);
    const dir = normalize(vec3(r1.sub(0.5), r2.mul(0.7).sub(0.25), r3.sub(0.5)).add(vec3(0, 0.0001, 0)));
    const sc = posB.add(dir.mul(r0.mul(2.6).add(0.8)));
    const ang = float(1).sub(e0).mul(r1.mul(1.4).add(0.6));
    const ca = cos(ang), sa = sin(ang);
    const scR = vec3(sc.x.mul(ca).sub(sc.z.mul(sa)), sc.y, sc.x.mul(sa).add(sc.z.mul(ca)));
    const pCond = mix(scR, posB, e0);
    // climbing: rising from below, from slightly outside, arms reaching then holding; a short trail of particles behind
    const uc = clamp(u.sub(r0.mul(0.1)).div(0.9), 0, 1), ec = sm(uc);
    const pose = smoothstep(0.55, 1.0, uc);
    const radial = normalize(vec3(posB.x, 0, posB.z).add(vec3(0.0001, 0, 0)));
    const pClimb = mix(posA, posB, pose).add(radial.mul(float(1).sub(ec).mul(0.35))).sub(vec3(0, float(1).sub(ec).mul(climb), 0));
    const isClimb = climb.greaterThan(0.01);
    let p = select(isClimb, pClimb, pCond);
    // breathing: each person on their own slow rhythm (the surface swells along its normal, the light with it)
    const br = sin(uTime.mul(float(6.283).div(phase.mul(0.35).add(3.4))).add(phase).add(U.phase));
    p = p.add(nrm.mul(br.mul(0.007)));
    // a hand: the pinya leans towards it
    const hdir = U.hand.xyz, hamt = U.hand.w;
    const lean = posB.y.div(1.7).clamp(0, 1.3);
    p = p.add(hdir.mul(hamt.mul(pinya).mul(lean.mul(lean)).mul(0.22)));
    // light: warm gold at the base, pearl above, white at the top; a key light from above and in front; the far side dimmer
    const h = clamp(posB.y.div(uTop), 0, 1);
    const gold = vec3(1.0, 0.56, 0.26), pearl = vec3(1.0, 0.8, 0.62), white = vec3(1.0, 0.9, 0.8);
    let col = mix(mix(gold, pearl, smoothstep(0.0, 0.45, h)), white, smoothstep(0.6, 1.0, h)).mul(uTint);   // params.tint: the host's colour script (T-028)
    const L = normalize(vec3(0.25, 0.8, 0.55));
    const lam = max(dot(nrm, L), 0).mul(0.55).add(0.45);
    // seen from the eye: the far side of each body almost gone, the silhouette bright (pearl, x-ray), the far side of the castell dimmer
    const vd = normalize(U.eye.sub(posB)), ndv = dot(nrm, vd);
    const rim = float(1).sub(ndv.abs()), front = smoothstep(-0.25, 0.35, ndv);
    const shell = front.mul(rim.mul(rim).mul(1.5).add(0.3)).add(0.05);
    const ve = normalize(vec3(U.eye.x, 0, U.eye.z)), depth = smoothstep(-2.2, 1.6, dot(vec3(posB.x, 0, posB.z), ve));
    col = col.mul(mix(vec3(1.04, 0.96, 0.98), vec3(0.9, 0.97, 1.08), rim.mul(rim)));   // pearl: a faint cool sheen at the silhouette
    const aura = occ ? float(0) : step(0.985, r4);                          // a few wide, faint sprites: the soft glow round the bodies (T-011: 1.5 % at 3× the light, was 4.5 %: a third of their fill)
    let E = energy.mul(lam).mul(shell).mul(depth.mul(0.6).add(0.4)).mul(br.mul(0.12).add(0.88)).mul(sin(uTime.mul(r1.mul(2.0).add(0.7)).add(r2.mul(40))).mul(0.12).add(0.88));
    // appearing: in-flight particles are fainter, a soft flash when a climber settles
    E = E.mul(select(isClimb, smoothstep(0.0, 0.12, uc), smoothstep(0.0, 0.3, up).mul(e0.mul(0.6).add(0.4))));
    const since = U.build.sub(start.add(dur)).mul(uSpan);
    E = E.mul(float(1).add(select(isClimb.and(since.greaterThan(0)), exp(since.mul(-2.2)).mul(1.3), float(0))));
    E = E.mul(float(1).add(hamt.mul(pinya).mul(max(dot(normalize(vec3(posB.x, 0, posB.z).add(vec3(0.0001, 0, 0))), hdir), 0)).mul(0.6)));
    // the dissolve: upward, the top first, into thin rising streaks that drift and fade
    const T = U.dis.mul(6.0), order = clamp(uTop.sub(posB.y).div(uTop), 0, 1);
    const v = clamp(T.sub(order.mul(2.4)).sub(r2.mul(1.0)).div(2.4), 0, 1);
    p = p.add(vec3(sin(v.mul(2.7).add(r1.mul(6.283))).mul(v).mul(0.6), v.mul(v).mul(r3.mul(3.5).add(1.4)), cos(v.mul(2.3).add(r4.mul(6.283))).mul(v).mul(0.6)));
    E = E.mul(float(1).sub(smoothstep(0.3, 1.0, v))).mul(float(1).add(sin(min(v.mul(2.5), 1).mul(3.1416)).mul(0.35)));
    col = mix(col, vec3(0.78, 0.82, 0.98), v.mul(0.75));
    E = E.mul(uGain).mul(1.8).mul(mix(float(1), float(0.15), aura));
    // the billboard, in view space (the walls' cameras are upright: view y is world up, so streaks rise)
    if (occ) p = p.sub(nrm.mul(0.02)).sub(vd.mul(0.06));     // pushed back, away from the eye: the skin itself stays visible
    const mv = modelViewMatrix.mul(vec4(p, 1));
    const stretch = float(1).add(v.mul(float(1).sub(v)).mul(14)).add(float(1).sub(e0).mul(select(isClimb, float(0), float(3))));
    const size = uSize.mul(float(1).sub(v.mul(0.45))).mul(occ ? 2.0 : mix(float(1), float(9), aura));   // the occluder: half of the front particles, 2.0× (was all, 1.5×)
    const corner = positionGeometry.xy.mul(vec2(size, size.mul(stretch)));
    const clip = cameraProjectionMatrix.mul(vec4(mv.xy.add(corner), mv.z, mv.w));
    const settled = select(isClimb, ec, e0);
    const vis = occ ? settled.greaterThan(0.85).and(v.lessThan(0.25)).and(U.build.greaterThan(start)) : E.greaterThan(0.0004);
    const m = occ ? new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.vertexNode = select(vis, clip, vec4(0, 0, 2, 1));
    const vCol = varying(col.mul(E).div(stretch));
    const d = uv().sub(0.5), g = exp(dot(d, d).mul(-16));   // (the corners: e^-8)
    m.colorNode = occ ? vec3(0) : vCol.mul(g);
    m.fog = false;
    return m;
  }

  // ---- the four castells (one beyond each wall), and a warm pool of light on the floor under each
  const castells = room.walls.map((w, i) => {
    const grp = new THREE.Group();
    const U = { build: uniform(0), dis: uniform(0), hand: uniform(new THREE.Vector4(0, 0, 1, 0)), phase: uniform(0), eye: uniform(new THREE.Vector3(0, 1.6, 12)) };
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(U, false));
    const occ = new THREE.Mesh(mesh.geometry, makeMaterial(U, true));
    if (i % 2 === 1) { mesh.scale.x = -1; occ.scale.x = -1; }   // walls 1 and 3 see it mirrored: four castells, not one
    occ.renderOrder = -1;
    grp.add(occ, mesh);
    U.phase.value = i * 1.7;
    // floor glow
    const gU = uniform(0);
    const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const fuv = uv().sub(0.5).mul(2), rr = length(fuv);
    gm.colorNode = vec3(1.0, 0.6, 0.3).mul(gU).mul(exp(rr.mul(rr).mul(-7)).add(exp(rr.mul(rr).mul(-40)).mul(0.6)));
    gm.fog = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), gm);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
    grp.add(floor);
    object.add(grp);
    return { wall: w, grp, mesh, occ, U, gU, hand: new THREE.Vector3(), handAmt: 0, b: 0, d: 0 };
  });

  // ---- placing them: base centre = wall centre pushed out along -normal; "fit" pushes further so the enxaneta stays in the window
  function place() {
    for (const c of castells) {
      const w = c.wall, eye = room.eye;
      const dWall = -(w.pa.x - eye.x) * w.normal.x - (w.pa.z - eye.z) * w.normal.z;   // eye → wall plane
      const tanUp = (w.height - eye.y) / dWall;
      let push = P.distance ?? 8.5;
      if (P.fit !== false) push = Math.max(push, (top + 0.55 - eye.y) / tanUp - dWall);
      c.grp.position.copy(w.centre).addScaledVector(w.normal, -push).setY(0);
      c.grp.rotation.set(0, Math.atan2(w.normal.x, w.normal.z), 0);
      c.grp.updateMatrixWorld(true);
      c.push = push;
    }
  }

  rebuild(); place();

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const tmp = new THREE.Vector3();
  function update(dt, input) {
    const prm = input.params || P;
    if (prm !== P) Object.assign(P, prm);
    uTime.value = input.time ?? 0;
    uGain.value = P.light ?? 1;
    if (Array.isArray(P.tint)) uTint.value.fromArray(P.tint); else uTint.value.set(1, 1, 1);
    uSize.value = P.size ?? 0.03;
    const t = input.t ?? 0, hands = input.hands || [];
    const k = 1 - Math.exp(-dt * 2.5);
    for (let i = 0; i < castells.length; i++) {
      const c = castells[i];
      const s = T0 + STAGGER * i, e = TOP0 + TOPSTEP * i;
      let b = clamp01((t - s) / (e - s)); if ((P.build ?? 0) > 0) b = clamp01(P.build);
      let d = clamp01((t - (DIS0 + DISSTEP * i)) / DISDUR); if ((P.dissolve ?? 0) > 0) d = clamp01(P.dissolve);
      if (P.buildPer) b = clamp01(P.buildPer[i] ?? 0);           // per-wall control (the whole work's host): replaces the clock
      if (P.disPer) d = clamp01(P.disPer[i] ?? 0);
      c.U.build.value = b; c.U.dis.value = d;
      uSpan.value = 22;
      c.mesh.visible = b > 0 && d < 1 && !(P.show && P.show[i] === false);
      c.grp.rotation.z = P.tilt ? P.tilt[i] || 0 : 0;             // a lean about the wall's normal (rad, + = the top to the left)
      c.gU.value = 0.022 * Math.min(1, b * 4) * (1 - d) * (P.light ?? 1) * (P.floorGlow ?? 1);   // floorGlow: the host can soften the pool under the pinya
      c.grp.visible = c.mesh.visible;
      // the hand: average of the hands on this wall, as a horizontal direction in the castell's frame
      let n = 0; tmp.set(0, 0, 0);
      for (const h of hands) if (h.wall === i) { tmp.add(h.pos); n++; }
      if (n) {
        tmp.multiplyScalar(1 / n); c.grp.worldToLocal(tmp); tmp.y = 0; tmp.normalize();
        if (c.mesh.scale.x < 0) tmp.x = -tmp.x;
        c.hand.lerp(tmp, k);
      }
      c.handAmt += ((n ? (P.lean ?? 0.6) : 0) - c.handAmt) * k;
      c.U.hand.value.set(c.hand.x, 0, c.hand.z, c.handAmt);
      c.U.eye.value.copy(room.eye); c.grp.worldToLocal(c.U.eye.value); if (c.mesh.scale.x < 0) c.U.eye.value.x *= -1;
    }
  }
  function setParams(p) {
    if (p && p !== P) Object.assign(P, p);
    const kind = P.kind === 'quatre' ? 'quatre' : 'tres', tiers = Math.round(Math.min(7, Math.max(4, P.tiers ?? 5))), dens = Math.min(3, Math.max(0.1, P.density ?? 1));
    if (`${kind}|${tiers}|${dens}` !== structKey) rebuild();
    place();
  }
  function dispose() { geo?.dispose(); geoOcc?.dispose(); for (const c of castells) { c.mesh.material.dispose(); c.occ.material.dispose(); c.grp.children[2].geometry.dispose(); c.grp.children[2].material.dispose(); } }
  return { object, update, setParams, dispose, stats, castells };
}
