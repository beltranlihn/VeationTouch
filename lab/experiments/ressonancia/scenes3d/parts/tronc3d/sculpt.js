// tronc3d/sculpt.js — the castell as a porcelain sculpture: pure JS (no three.js), built once per page (module cache), in steps.
//
// 1. The castell's layout (people and their poses) is castell.js's (skeleton + two-bone IK, a «3 de 9 amb folre»): a pinya of three
//    rings, the folre on the first ring's shoulders, a tronc of three per tier (baixos … sisens), the dosos, the acotxador, the enxaneta.
// 2. Every person is a smooth signed distance field (ellipsoids for torso, pelvis and head, round cones for the limbs, blended with a
//    smooth min); the people of one floor are joined with a tighter smooth min (they meld where they touch, like one carved piece).
// 3. Each floor is meshed on its own grid (surface nets; empty bricks skipped), normals from the SDF gradient. Baked per vertex: ambient
//    occlusion (from the SDF), the sash (faixa) region, a continuous noise (the dissolve's threshold noise) and the height inside the floor.
// 4. Grains: samples on each floor's surface by triangle area (position, normal, the same noise at the same rest position, a seed).
// Units: «castell metres» (a person of scale 1 ≈ 1.7 m); the part scales the whole sculpture. Floors = the score's levels:
//   0 PINYA · 1 BAIXOS · 2 SEGONS (+ the folre) · 3 TERÇOS · 4 QUARTS · 5 QUINTS · 6 SISENS · 7 DOSOS · 8 ACOTXADOR · 9 ENXANETA

export const NAMES = ['PINYA', 'BAIXOS', 'SEGONS', 'TERÇOS', 'QUARTS', 'QUINTS', 'SISENS', 'DOSOS', 'ACOTXADOR', 'ENXANETA'];
export const NL = 10;

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
export function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------ castell.js's skeleton (copied)
function ik(A, T, l1, l2, p) {
  const d0 = sub(T, A), D = len(d0) || 1e-4, dir = mul(d0, 1 / D);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let b = sub(p, mul(dir, dot(p, dir))); if (len(b) < 1e-4) b = cross(dir, [1, 0, 0]); b = norm(b);
  return [add(madd(A, dir, a), mul(b, h)), madd(A, dir, d)];
}
function skeleton(sp) {
  const s = sp.s, f = norm(sp.f), side = norm(cross(f, UP));
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
    s, f, side, sd, hd, pelvis, S, TL, neck, neckTop: madd(neck, hd, 0.06 * s), headC: madd(neck, hd, (0.06 + 0.1 * hsc) * s), hsc,
    shL, shR, hL, hR, kL, kR, aL, aR, eL, eR, wL, wR,
    hnL: madd(wL, norm(sub(wL, eL)), 0.15 * s), hnR: madd(wR, norm(sub(wR, eR)), 0.15 * s), tL: foot(aL), tR: foot(aR),
  };
}

// ------------------------------------------------------------------------------------------------ the castell: people per floor
function layout() {
  const r = rng(9031), n = 3, R = 0.31, T = 6;
  const out = [];                                           // { k, lv }
  const tronc = [];
  const ang0 = Math.PI / 2;                                 // one of the three faces the room (+z)
  const tierScale = (L) => [1.05, 1.0, 0.97, 0.94, 0.92, 0.9][L] ?? 0.88;
  for (let L = 0; L < T; L++) {
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
  for (let L = 0; L < T; L++) for (const p of tronc[L]) {
    const k = p.k, sp = p.spec;
    if (L === 0) {
      const up = tronc[1][p.j].k;
      sp.hands = [madd(add(up.aL, V(0, 0.16 * up.s, 0)), k.f, 0.07), madd(add(up.aR, V(0, 0.16 * up.s, 0)), k.f, 0.07)];
      sp.elbow = add(mul(UP, -0.4), k.f);
    } else {
      const nb = [tronc[L][(p.j + n - 1) % n].k, tronc[L][(p.j + 1) % n].k], hands = [];
      for (const sgn of [-1, 1]) {
        const q = nb.reduce((best, b) => (dot(sub(b.pelvis, k.pelvis), k.side) * sgn > dot(sub(best.pelvis, k.pelvis), k.side) * sgn ? b : best));
        const near = len(sub(q.shL, k.pelvis)) < len(sub(q.shR, k.pelvis)) ? q.shL : q.shR;
        hands.push(add(lerp(near, q.neck, 0.35), V(0, 0.06 * q.s, 0)));
      }
      sp.hands = hands; sp.elbow = add(mul(UP, -1), mul(k.f, 0.5));
    }
    p.k = skeleton(sp);
    out.push({ k: p.k, lv: L + 1 });
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
  for (let i = 0; i < 2; i++) {
    const me = dosos[i], o = dosos[1 - i].k;
    me.spec.hands = [add(o.shR, V(0, 0.05, 0)), add(o.shL, V(0, 0.05, 0))];
    me.spec.elbow = add(mul(UP, -0.6), mul(me.k.f, -0.2));
    me.k = skeleton(me.spec); out.push({ k: me.k, lv: 7 });
  }
  const dsY = (dosos[0].k.shL[1] + dosos[0].k.shR[1]) / 2;
  const sA = 0.66, ac = { f: V(0, 0, 1), s: sA, lean: 1.05, head: -0.5, child: true, bend: 0.7,
    feet: [V(-0.16, dsY + 0.07 + 0.065 * sA, 0.0), V(0.16, dsY + 0.07 + 0.065 * sA, 0.0)],
    pelvis: V(0, dsY + 0.07 + 0.3 * sA, -0.12), knee: V(0, 0.3, 1),
    hands: [V(-0.17, dsY + 0.08, 0.2), V(0.17, dsY + 0.08, 0.2)], elbow: V(0, -0.3, -1) };
  const acK = skeleton(ac); out.push({ k: acK, lv: 8 });
  const backY = acK.S(0.55)[1] + 0.12 * sA;
  const sE = 0.62, enx = { f: V(0, 0, 1), s: sE, lean: 0.06, head: -0.12, child: true, bend: 0.9,
    feet: [V(-0.15, backY + 0.06 * sE, -0.02), V(0.15, backY + 0.06 * sE, -0.02)], hands: [V(-0.36, backY + 0.92, 0.06), V(0.4, backY + 0.98, 0.02)],
    elbow: V(0, -1, 0) };
  out.push({ k: skeleton(enx), lv: 9 });

  // the pinya: three rings facing in, leaning in, pressed together
  const rings = [], baseR = R + 0.42, ringN = [10, 16, 22];
  for (let i = 0; i < 3; i++) {
    const rad = baseR + i * 0.44, row = [], nn = ringN[i], off = 0.31 + i * 0.17;
    for (let j = 0; j < nn; j++) {
      const a = off + ((j + (r() - 0.5) * 0.2) * 2 * Math.PI) / nn, o = V(Math.cos(a), 0, Math.sin(a)), f = mul(o, -1), side = norm(cross(f, UP));
      const s = 0.94 + r() * 0.1, rr = rad + (r() - 0.5) * 0.05, fwd = r() < 0.5 ? -1 : 1;
      const c = mul(o, rr + 0.1);
      const feet = [add(madd(madd(c, side, -0.12), f, fwd * 0.1), V(0, 0.075 * s, 0)), add(madd(madd(c, side, 0.12), f, -fwd * 0.1), V(0, 0.075 * s, 0))];
      const spec = { f, s, lean: [0.2, 0.32, 0.4][i] + r() * 0.06, head: i === 0 ? -0.25 : 0.3 + r() * 0.2, feet, hands: [V(), V()], bend: 0.93 };
      row.push({ spec, k: skeleton(spec), out: o, a, rad: rr });
    }
    rings.push(row);
  }
  // the folre: one on the shoulders of each of the first ring, facing in, hands on the segons' backs
  const folre = [];
  for (const p of rings[0]) {
    const b = p.k, s = 0.92 + r() * 0.06, f = mul(p.out, -1);
    const feet = [madd(add(b.shL, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, 0.03), madd(add(b.shR, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, -0.03)];
    const spec = { f, s, lean: 0.22, head: -0.1, feet, hands: [V(), V()], bend: 0.95 };
    let k = skeleton(spec);
    let best = tronc[1][0], bd = 9; for (const q of tronc[1]) { const d = len(sub(q.k.pelvis, k.pelvis)); if (d < bd) { bd = d; best = q; } }
    const bk = best.k, tg = madd(bk.S(0.35), norm(sub(k.pelvis, bk.pelvis)), 0.12);
    spec.hands = [madd(tg, k.side, -0.17), madd(tg, k.side, 0.17)]; spec.elbow = add(mul(UP, -1), mul(k.f, -0.2));
    k = skeleton(spec); folre.push({ k, spec }); out.push({ k, lv: 2 });
  }
  for (let i = 0; i < 3; i++) rings[i].forEach((p, j) => {
    const sp = p.spec, k = p.k, s = sp.s;
    if (i === 0) {                                          // arms raised: to the calves of the folre on their shoulders
      const fk = folre[j].k;
      sp.hands = [add(lerp(fk.aL, fk.kL, 0.35), mul(p.out, 0.03)), add(lerp(fk.aR, fk.kR, 0.35), mul(p.out, 0.03))];
      sp.elbow = add(mul(UP, -0.5), mul(k.f, -0.6));
    } else {                                                // hands on the backs of the ring inside
      const hr = rings[i - 1][0].rad + 0.14, hy = (1.26 + r() * 0.1) * s, tg = mul(p.out, hr);
      sp.hands = [add(madd(tg, k.side, -0.2), V(0, hy, 0)), add(madd(tg, k.side, 0.2), V(0, hy + (r() - 0.5) * 0.08, 0))];
      sp.elbow = add(mul(UP, -1), mul(k.f, -0.2));
    }
    p.k = skeleton(sp); out.push({ k: p.k, lv: 0 });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ SDF primitives
// prim: { t: 0 ellipsoid | 1 round cone, c / a,b, axes, r…, bb [x0,y0,z0,x1,y1,z1], person, torso (0/1) }
function ellPrim(c, ax, ay, az, rx, ry, rz, person, torso) {
  const m = Math.max(rx, ry, rz);
  return { t: 0, c, ax, ay, az, rx, ry, rz, person, torso, bb: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] };
}
function conePrim(a, b, r1, r2, person, torso) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / Math.max(1e-8, l2);
  const m = Math.max(r1, r2);
  return { t: 1, a, b, ba, l2, rr, a2, il2, r1, r2, person, torso,
    bb: [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m] };
}
function primD(q, x, y, z) {
  if (q.t === 0) {
    const px = x - q.c[0], py = y - q.c[1], pz = z - q.c[2];
    const lx = (px * q.ax[0] + py * q.ax[1] + pz * q.ax[2]), ly = (px * q.ay[0] + py * q.ay[1] + pz * q.ay[2]), lz = (px * q.az[0] + py * q.az[1] + pz * q.az[2]);
    const k0 = Math.hypot(lx / q.rx, ly / q.ry, lz / q.rz), k1 = Math.hypot(lx / (q.rx * q.rx), ly / (q.ry * q.ry), lz / (q.rz * q.rz));
    return k1 < 1e-9 ? -Math.min(q.rx, q.ry, q.rz) : (k0 * (k0 - 1)) / k1;
  }
  // round cone (iq), exact
  const pax = x - q.a[0], pay = y - q.a[1], paz = z - q.a[2], ba = q.ba;
  const yy = pax * ba[0] + pay * ba[1] + paz * ba[2], z2 = yy * yy * q.il2;
  const qx = pax * q.l2 - ba[0] * yy, qy = pay * q.l2 - ba[1] * yy, qz = paz * q.l2 - ba[2] * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = (yy - q.l2) * (yy - q.l2);
  const k = Math.sign(q.rr) * q.rr * q.rr * x2;
  if (Math.sign(yy - q.l2) * q.a2 * y2 > k) return Math.sqrt(x2 + y2) * q.il2 - q.r2;
  if (Math.sign(yy) * q.a2 * z2 < k) return Math.sqrt(x2 + yy * yy) * q.il2 - q.r1;
  return (Math.sqrt(x2 * q.a2 * q.il2) + yy * q.rr) * q.il2 - q.r1;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function bodyPrims(k, person, out) {
  const s = k.s, dp = norm(cross(k.sd, k.side));            // depth axis (front of the body: −dp or +dp; symmetric anyway)
  const E = (c, ax, ay, az, rx, ry, rz, torso) => out.push(ellPrim(c, ax, ay, az, rx * s, ry * s, rz * s, person, torso));
  const C = (a, b, r1, r2, torso = 0) => out.push(conePrim(k[a] ?? a, k[b] ?? b, r1 * s, r2 * s, person, torso));
  // torso: four ellipsoids along the spine, pelvis, the neck and the head
  E(k.S(0.02), k.side, k.sd, dp, 0.158, 0.13, 0.112, 1);
  E(k.S(0.3), k.side, k.sd, dp, 0.138, 0.17, 0.1, 1);
  E(k.S(0.6), k.side, k.sd, dp, 0.165, 0.17, 0.112, 1);
  E(k.S(0.82), k.side, k.sd, dp, 0.185, 0.1, 0.098, 1);
  E(k.S(-0.08), k.side, k.sd, dp, 0.15, 0.1, 0.115, 1);
  C(k.neck, k.neckTop, 0.052, 0.046, 1);
  // the head: a sculpted, stylised head — a slightly narrower skull, a jaw and chin, the plane of the brow and a hint of nose (T-054)
  const hdp = norm(cross(k.hd, k.side)), hs = k.hsc * s, H = (a, b) => madd(madd(k.headC, k.hd, a * hs), hdp, b * hs);
  out.push(ellPrim(H(0.012, -0.008), k.side, k.hd, hdp, 0.074 * hs, 0.1 * hs, 0.09 * hs, person, 1));      // the skull
  out.push(ellPrim(H(-0.05, 0.022), k.side, k.hd, hdp, 0.054 * hs, 0.05 * hs, 0.062 * hs, person, 1));     // jaw and chin
  out.push(ellPrim(H(0.03, 0.06), k.side, k.hd, hdp, 0.062 * hs, 0.022 * hs, 0.03 * hs, person, 1));       // the brow's plane
  out.push(conePrim(H(0.012, 0.078), H(-0.022, 0.094), 0.011 * hs, 0.016 * hs, person, 1));                // the nose
  // limbs (round cones), mitten hands, feet
  C('shL', 'eL', 0.05, 0.04); C('shR', 'eR', 0.05, 0.04);
  C('eL', 'wL', 0.04, 0.03); C('eR', 'wR', 0.04, 0.03);
  C('wL', 'hnL', 0.034, 0.024); C('wR', 'hnR', 0.034, 0.024);
  C('hL', 'kL', 0.082, 0.054); C('hR', 'kR', 0.082, 0.054);
  C('kL', 'aL', 0.054, 0.035); C('kR', 'aR', 0.054, 0.035);
  C('aL', 'tL', 0.04, 0.03); C('aR', 'tR', 0.04, 0.03);
}

// ------------------------------------------------------------------------------------------------ a continuous value noise (the dissolve)
const H3 = (x, y, z) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(H3(xi, yi, zi), H3(xi + 1, yi, zi), u), L(H3(xi, yi + 1, zi), H3(xi + 1, yi + 1, zi), u), v),
    L(L(H3(xi, yi, zi + 1), H3(xi + 1, yi, zi + 1), u), L(H3(xi, yi + 1, zi + 1), H3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const noise3 = (x, y, z) => 0.65 * vnoise(x * 6.5, y * 6.5, z * 6.5) + 0.35 * vnoise(x * 15 + 7.1, y * 15 + 3.3, z * 15 + 1.7);

// ------------------------------------------------------------------------------------------------ one floor: SDF on bricks + surface nets
const KB = 0.034, KF = 0.016;                                // blend inside a body · between bodies of a floor
function makeSDF(people, h) {
  const prims = []; people.forEach((k, i) => bodyPrims(k, i, prims));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const q of prims) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.bb[a]); hi[a] = Math.max(hi[a], q.bb[a + 3]); }
  lo = lo.map((v) => v - 2 * h); hi = hi.map((v) => v + 2 * h);
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const B = 8, bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B), pad = KB + 2 * h;
  const lists = new Array(bx * by * bz);
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    const x0 = lo[0] + i * B * h - pad, x1 = lo[0] + (i + 1) * B * h + pad, y0 = lo[1] + j * B * h - pad, y1 = lo[1] + (j + 1) * B * h + pad, z0 = lo[2] + k * B * h - pad, z1 = lo[2] + (k + 1) * B * h + pad;
    const L = []; for (const q of prims) if (q.bb[0] < x1 && q.bb[3] > x0 && q.bb[1] < y1 && q.bb[4] > y0 && q.bb[2] < z1 && q.bb[5] > z0) L.push(q);
    lists[i + bx * (j + by * k)] = L.length ? L : null;
  }
  const FAR = 4 * h;
  const evalL = (L, x, y, z) => {
    let tot = FAR, cur = FAR, per = -1;
    for (const q of L) {
      const d = primD(q, x, y, z);
      if (q.person !== per) { if (per >= 0) tot = smin(tot, cur, KF); per = q.person; cur = d; } else cur = smin(cur, d, KB);
    }
    if (per >= 0) tot = smin(tot, cur, KF);
    return tot;
  };
  const sdf = (x, y, z) => {
    const i = Math.floor((x - lo[0]) / h / B), j = Math.floor((y - lo[1]) / h / B), k = Math.floor((z - lo[2]) / h / B);
    if (i < 0 || j < 0 || k < 0 || i >= bx || j >= by || k >= bz) return FAR;
    const L = lists[i + bx * (j + by * k)]; return L ? evalL(L, x, y, z) : FAR;
  };
  return { prims, lists, lo, hi, nx, ny, nz, B, bx, by, bz, FAR, evalL, sdf };
}
function* meshFloor(people, h, budget) {
  const { prims, lists, lo, nx, ny, nz, B, bx, by, bz, FAR, evalL, sdf } = makeSDF(people, h);
  void prims;
  // the grid, brick by brick
  const G = new Float32Array(nx * ny * nz).fill(FAR);
  let t0 = performance.now();
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    const L = lists[i + bx * (j + by * k)]; if (!L) continue;
    for (let z = k * B; z < Math.min(nz, (k + 1) * B); z++) for (let y = j * B; y < Math.min(ny, (j + 1) * B); y++) {
      const zz = lo[2] + z * h, yy = lo[1] + y * h, row = (y + ny * z) * nx;
      for (let x = i * B; x < Math.min(nx, (i + 1) * B); x++) G[row + x] = evalL(L, lo[0] + x * h, yy, zz);
    }
    if (performance.now() - t0 > budget) { yield; t0 = performance.now(); }
  }
  // surface nets
  const cells = new Int32Array(nx * ny * nz).fill(-1), P = [], I = [];
  const sx = 1, sy = nx, sz = nx * ny;
  const cOff = []; for (let c = 0; c < 8; c++) cOff.push((c & 1) * sx + ((c >> 1) & 1) * sy + ((c >> 2) & 1) * sz);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const m = x + nx * (y + ny * z);
      let mask = 0; for (let c = 0; c < 8; c++) { cv[c] = G[m + cOff[c]]; if (cv[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let px = 0, py = 0, pz = 0, ne = 0;
      for (const [a, b] of EDGES) {
        if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        px += (a & 1) + (((b & 1) - (a & 1)) * t); py += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); pz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t); ne++;
      }
      cells[m] = P.length / 3;
      P.push(lo[0] + (x + px / ne) * h, lo[1] + (y + py / ne) * h, lo[2] + (z + pz / ne) * h);
      // faces: the three edges leaving corner 0 of this cell
      const s0 = mask & 1;
      for (let ax = 0; ax < 3; ax++) {
        if (((mask >> (1 << ax)) & 1) === s0) continue;
        const u = (ax + 1) % 3, v = (ax + 2) % 3, cu = [x, y, z][u], cvv = [x, y, z][v];
        if (cu === 0 || cvv === 0) continue;
        const du = [sx, sy, sz][u], dv = [sx, sy, sz][v];
        const a = cells[m], b = cells[m - du], c = cells[m - du - dv], d = cells[m - dv];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        if (s0) I.push(a, b, d, b, c, d); else I.push(a, d, b, b, d, c);
      }
    }
    if (performance.now() - t0 > budget) { yield; t0 = performance.now(); }
  }
  const nv = P.length / 3, pos = new Float32Array(P), nrm = new Float32Array(nv * 3), aux = new Float32Array(nv * 4);
  // normals, AO, sash, noise
  const e = h * 0.5;
  let y0 = 1e9, y1 = -1e9;
  for (let v = 0; v < nv; v++) { y0 = Math.min(y0, pos[v * 3 + 1]); y1 = Math.max(y1, pos[v * 3 + 1]); }
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nrm[v * 3] = gx; nrm[v * 3 + 1] = gy; nrm[v * 3 + 2] = gz;
    let occ = 0, sc = 1;
    for (const hh of [0.025, 0.055, 0.1, 0.17]) { occ += (hh - Math.min(hh, Math.max(0, sdf(x + gx * hh, y + gy * hh, z + gz * hh)))) * sc; sc *= 0.6; }
    // the sash: on the torso, the band from the waist up a hand's width (the person whose torso is nearest)
    let sash = 0, bestD = 1e9, bestP = -1, bestT = 0;
    const bi = Math.floor((x - lo[0]) / h / B), bj = Math.floor((y - lo[1]) / h / B), bk = Math.floor((z - lo[2]) / h / B);
    const L = lists[Math.min(bx - 1, Math.max(0, bi)) + bx * (Math.min(by - 1, Math.max(0, bj)) + by * Math.min(bz - 1, Math.max(0, bk)))];
    if (L) {
      let limb = 1e9;
      for (const q of L) { const d = primD(q, x, y, z); if (q.torso) { if (d < bestD) { bestD = d; bestP = q.person; } } else if (d < limb) limb = d; }
      if (bestP >= 0 && bestD < limb + 0.004) {
        const k = people[bestP], t = dot(sub([x, y, z], k.pelvis), k.sd) / k.TL;
        bestT = t; if (t > 0.07 && t < 0.3) sash = 1;
      }
    }
    void bestT;
    aux[v * 4] = noise3(x, y, z); aux[v * 4 + 1] = Math.max(0, Math.min(1, 1 - occ * 4.2)); aux[v * 4 + 2] = sash; aux[v * 4 + 3] = (y - y0) / Math.max(1e-3, y1 - y0);
    if (v % 3000 === 0 && performance.now() - t0 > budget) { yield; t0 = performance.now(); }
  }
  // winding: agree with the SDF normals
  let agree = 0;
  for (let t = 0; t < Math.min(I.length, 3000); t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ab = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], ac = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    agree += Math.sign(dot(cross(ab, ac), [nrm[a], nrm[a + 1], nrm[a + 2]]));
  }
  const idx = new Uint32Array(I);
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  let cx = 0, cz = 0, rad = 0; for (let v = 0; v < nv; v++) { cx += pos[v * 3]; cz += pos[v * 3 + 2]; } cx /= nv || 1; cz /= nv || 1;
  for (let v = 0; v < nv; v++) rad = Math.max(rad, Math.hypot(pos[v * 3] - cx, pos[v * 3 + 1] - (y0 + y1) / 2, pos[v * 3 + 2] - cz));
  return { pos, nrm, aux, idx, y0, y1, cx, cz, rad, sdf };
}

// grains on a floor's surface, by triangle area: rest (x, y, z, noise) · nrm (x, y, z, seed) · aux (sash, ao, hRel, class)
function grainsOf(F, density, seed) {
  const { pos, nrm, aux, idx } = F, nt = idx.length / 3, cum = new Float64Array(nt);
  let A = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ab = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], ac = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    A += len(cross(ab, ac)) * 0.5; cum[t] = A;
  }
  const n = Math.max(200, Math.round(A * density)), r = rng(seed);
  const rest = new Float32Array(n * 4), gn = new Float32Array(n * 4), ga = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = r() * A; let lo = 0, hi = nt - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
    const u = Math.sqrt(r()), v = r(), w = [1 - u, u * (1 - v), u * v];
    let p = [0, 0, 0], q = [0, 0, 0], s = 0, ao = 0, hr = 0;
    for (let j = 0; j < 3; j++) { const k = idx[lo * 3 + j]; p = madd(p, [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]], w[j]); q = madd(q, [nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]], w[j]); s += aux[k * 4 + 2] * w[j]; ao += aux[k * 4 + 1] * w[j]; hr += aux[k * 4 + 3] * w[j]; }
    q = norm(q);
    rest[i * 4] = p[0]; rest[i * 4 + 1] = p[1]; rest[i * 4 + 2] = p[2]; rest[i * 4 + 3] = noise3(p[0], p[1], p[2]);
    gn[i * 4] = q[0]; gn[i * 4 + 1] = q[1]; gn[i * 4 + 2] = q[2]; gn[i * 4 + 3] = r();
    const cr = r(); ga[i * 4] = s > 0.5 ? 1 : 0; ga[i * 4 + 1] = ao; ga[i * 4 + 2] = hr; ga[i * 4 + 3] = cr < 0.65 ? 0 : cr < 0.91 ? 1 : 2;
  }
  return { n, rest, nrm: gn, aux: ga, area: A };
}

// ------------------------------------------------------------------------------------------------ the build (shared by every instance)
// the floors' people and grid steps (the same on every thread)
let PPL = null;
export function floorSpec(lv) {
  if (!PPL) PPL = layout();
  return { people: PPL.filter((p) => p.lv === lv).map((p) => p.k), h: lv === 0 ? 0.034 : lv === 2 ? 0.024 : 0.02, density: lv === 0 ? 220 : lv === 2 ? 650 : 1500 };
}
export function* buildFloors(budget = 6) {          // yields [lv, floor] (without its sdf function: not transferable)
  for (let lv = 0; lv < NL; lv++) {
    const { people, h, density } = floorSpec(lv);
    const F = yield* meshFloor(people, h, budget);
    F.grains = grainsOf(F, density, 100 + lv); F.lv = lv; F.people = people.length; delete F.sdf;
    yield [lv, F];
  }
}
export function attachSDF(F) { const { people, h } = floorSpec(F.lv); F.sdf = makeSDF(people, h).sdf; return F; }

// ------------------------------------------------------------------------------------------------ the build (shared by every instance)
// In a module worker (./sculpt-worker.js) when the page can (no hitch on the main thread); else in steps on the main thread.
let BUILD = null;
export function sculpture() {
  if (BUILD) return BUILD;
  const B = { done: false, floors: new Array(NL).fill(null), ms: 0, step: null, error: null, people: 0, worker: false };
  BUILD = B;
  B.people = (PPL || (PPL = layout())).length;
  let gen = null;
  const local = () => { if (!gen) gen = buildFloors(6); };
  try {
    if (typeof Worker === 'function') {
      const w = new Worker(new URL('./sculpt-worker.js', import.meta.url), { type: 'module' });
      const t0 = performance.now(); B.worker = true;
      w.onmessage = (e) => {
        const d = e.data;
        if (d.floor) { B.floors[d.floor.lv] = attachSDF(d.floor); }
        if (d.done) { B.done = true; B.ms = performance.now() - t0; w.terminate(); }
      };
      w.onerror = (e) => { e.preventDefault?.(); B.worker = false; w.terminate(); local(); };
    } else local();
  } catch { B.worker = false; local(); }
  B.step = (ms) => {
    if (B.done || B.error || !gen) return B.done;
    const t0 = performance.now();
    try {
      while (performance.now() - t0 < ms) {
        const r = gen.next();
        if (r.done) { B.done = true; break; }
        if (r.value) { const [lv, F] = r.value; if (!B.floors[lv]) B.floors[lv] = attachSDF(F); }
      }
    } catch (e) { B.error = e; console.error('tronc3d sculpt', e); }
    B.ms += performance.now() - t0;
    return B.done;
  };
  return B;
}
