// pinya3d — the body generator (pure JS, no three.js): ONE smooth body per build, baked once at load.
//
// 1. A skeleton posed by two-bone IK (as castell.js): pelvis, spine, head, arms, hands, legs, feet.
// 2. The body in a rest pose (A-pose) as a signed distance field: ellipsoids and round cones per bone, blended with a smooth min
//    (soft inside the torso, tighter where a limb joins it, so armpits do not web), plus a small nose and brow on a faceless head.
// 3. Surface nets on a grid (2.8 cm for the crowd, 1.8 cm for the figures that press): vertices projected on the surface (Newton),
//    normals from the SDF gradient. Detailed hands (fingers, thumb) are their own SDF on a 4.5 mm grid, rigid on the hand bone.
// 4. Skinning at load: every vertex bound to its 3 nearest bones; each pose = rigid bone transforms rest → pose, so all poses share
//    one topology and the GPU blends them.
// 5. Baked per vertex: ambient occlusion and thickness (from the SDF), a clay mottle, the shards (Voronoi on the surface; vertices
//    duplicated only along shard borders, which are the crack lines), the breath and leg regions, the head weight, the distance from
//    the right palm.

// ---------------------------------------------------------------------------------------------------------------- vectors, rng
export const V = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const UP = V(0, 1, 0), FWD = V(0, 0, 1), LEFT = V(1, 0, 0);     // a body faces +z; its left is +x
const pitch = (a) => [0, Math.cos(a), Math.sin(a)];
export function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function ik(A, T, l1, l2, p) {
  const d0 = sub(T, A), D = len(d0) || 1e-4, dir = mul(d0, 1 / D);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let b = sub(p, mul(dir, dot(p, dir))); if (len(b) < 1e-4) b = cross(dir, [1, 0, 0]); b = norm(b);
  return [add(madd(A, dir, a), mul(b, h)), madd(A, dir, d)];
}

// ---------------------------------------------------------------------------------------------------------------- skeleton
// spec: lean, hunch, head (rad), turn (head yaw, rad), feet [L, R] ankles, hands [L, R] wrists, hf [{fd, pn}] hand frames, elbow pole
export function pose(sp, B) {
  const s = B.s, sd1 = pitch(sp.lean), sd2 = pitch(sp.lean + sp.hunch);
  let hd = pitch(sp.lean + sp.hunch + sp.head);
  const [fl, fr] = sp.feet, mid = mul(add(fl, fr), 0.5);
  const lat = Math.max(0, Math.abs(fl[0] - fr[0]) / 2 - 0.09 * s), leg = 0.85 * s * 0.97;
  const pelvis = add(mid, V(0, Math.sqrt(Math.max(0.04, leg * leg - lat * lat)) + 0.03 * s, -0.04 * Math.sin(sp.lean)));
  const waist = madd(pelvis, sd1, 0.22 * s), shC = madd(waist, sd2, 0.27 * s), neck = madd(waist, sd2, 0.31 * s);
  // the shoulder rises when the arm goes up
  const up = (h) => (h[1] > shC[1] + 0.2 ? Math.min(0.045, (h[1] - shC[1] - 0.2) * 0.12) * s : 0);
  const shL = madd(madd(shC, LEFT, B.sh * s), UP, up(sp.hands[0])), shR = madd(madd(shC, LEFT, -B.sh * s), UP, up(sp.hands[1]));
  const hL = madd(pelvis, LEFT, B.hip * s), hR = madd(pelvis, LEFT, -B.hip * s);
  const kp = add(FWD, mul(UP, 0.1));
  const [kL, aL] = ik(hL, fl, 0.43 * s, 0.42 * s, add(kp, mul(LEFT, 0.2)));
  const [kR, aR] = ik(hR, fr, 0.43 * s, 0.42 * s, add(kp, mul(LEFT, -0.2)));
  const ep = sp.elbow || V(0, -1, -0.3);
  const [eL, wL] = ik(shL, sp.hands[0], 0.29 * s, 0.26 * s, add(ep, mul(LEFT, 0.6)));
  const [eR, wR] = ik(shR, sp.hands[1], 0.29 * s, 0.26 * s, add(ep, mul(LEFT, -0.6)));
  const hf = (w, e, f) => { if (f) { const fd = norm(f.fd); return { fd, pn: norm(sub(f.pn, mul(fd, dot(f.pn, fd)))) }; } const fd = norm(sub(w, e)); let pn = cross(fd, LEFT); if (len(pn) < 0.2) pn = cross(fd, UP); return { fd, pn: norm(pn) }; };
  if (sp.turn) { const c = Math.cos(sp.turn), sn = Math.sin(sp.turn); hd = norm([hd[0] * c + hd[2] * sn, hd[1], -hd[0] * sn + hd[2] * c]); }
  const hfw = norm(sp.turn ? [Math.sin(sp.turn), 0, Math.cos(sp.turn)] : FWD);
  return { s, sd1, sd2, hd, hfw, pelvis, waist, shC, neck, shL, shR, hL, hR, kL, kR, aL, aR, eL, eR, wL, wR,
    headC: madd(neck, hd, 0.17 * s), hfL: hf(wL, eL, sp.hf?.[0]), hfR: hf(wR, eR, sp.hf?.[1]),
    tL: madd(madd(aL, FWD, 0.14 * s), UP, -0.04 * s), tR: madd(madd(aR, FWD, 0.14 * s), UP, -0.04 * s) };
}

// bones: [name, frame(k) → { o, x, y, z }]
const segFrame = (a, b, ref) => { const y = norm(sub(b, a)); let z = sub(ref, mul(y, dot(ref, y))); if (len(z) < 1e-3) z = cross(y, LEFT); z = norm(z); return { o: a, x: cross(y, z), y, z }; };
const BONES = [
  ['pelvis', (k) => segFrame(k.pelvis, k.waist, cross(LEFT, k.sd1))],
  ['spine', (k) => segFrame(k.waist, k.neck, cross(LEFT, k.sd2))],
  ['head', (k) => { const f = segFrame(k.neck, k.headC, k.hfw); return f; }],
  ['uaL', (k) => segFrame(k.shL, k.eL, cross(norm(sub(k.eL, k.shL)), LEFT))], ['uaR', (k) => segFrame(k.shR, k.eR, cross(norm(sub(k.eR, k.shR)), LEFT))],
  ['faL', (k) => segFrame(k.eL, k.wL, cross(norm(sub(k.wL, k.eL)), LEFT))], ['faR', (k) => segFrame(k.eR, k.wR, cross(norm(sub(k.wR, k.eR)), LEFT))],
  ['hdL', (k) => ({ o: k.wL, x: cross(k.hfL.fd, k.hfL.pn), y: k.hfL.fd, z: k.hfL.pn })], ['hdR', (k) => ({ o: k.wR, x: cross(k.hfR.fd, k.hfR.pn), y: k.hfR.fd, z: k.hfR.pn })],
  ['thL', (k) => segFrame(k.hL, k.kL, FWD)], ['thR', (k) => segFrame(k.hR, k.kR, FWD)],
  ['snL', (k) => segFrame(k.kL, k.aL, FWD)], ['snR', (k) => segFrame(k.kR, k.aR, FWD)],
  ['ftL', (k) => segFrame(k.aL, k.tL, UP)], ['ftR', (k) => segFrame(k.aR, k.tR, UP)],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---------------------------------------------------------------------------------------------------------------- SDF
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function ellD(p, e) {        // e: { c, ax, ay, az, r }
  const dx = p[0] - e.c[0], dy = p[1] - e.c[1], dz = p[2] - e.c[2];
  const lx = (dx * e.ax[0] + dy * e.ax[1] + dz * e.ax[2]) / e.r[0], ly = (dx * e.ay[0] + dy * e.ay[1] + dz * e.ay[2]) / e.r[1], lz = (dx * e.az[0] + dy * e.az[1] + dz * e.az[2]) / e.r[2];
  const k0 = Math.hypot(lx, ly, lz), k1 = Math.hypot(lx / e.r[0], ly / e.r[1], lz / e.r[2]) || 1e-6;
  return (k0 * (k0 - 1)) / k1;
}
function coneD(p, c) {      // c: { a, b, r1, r2 }
  const bax = c.b[0] - c.a[0], bay = c.b[1] - c.a[1], baz = c.b[2] - c.a[2], pax = p[0] - c.a[0], pay = p[1] - c.a[1], paz = p[2] - c.a[2];
  const t = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - (c.r1 + (c.r2 - c.r1) * t);
}
// the body's primitives in a posed skeleton k; groups: 0 torso+head (soft), 1..4 limbs (each blended softly inside, tightly with torso)
function bodyPrims(k, B, mitten) {
  const s = k.s, P = [];
  const fr = (ay, fwd = FWD) => { const az = norm(sub(fwd, mul(ay, dot(fwd, ay)))); return { ax: cross(ay, az), ay, az }; };
  const E = (c, f, r, bone, g) => P.push({ t: 'e', c, ...f, r, bone: BI[bone], g });
  const C = (a, b, r1, r2, bone, g) => P.push({ t: 'c', a, b, r1, r2, bone: BI[bone], g });
  const sdm = norm(add(k.sd1, k.sd2));
  E(madd(k.pelvis, k.sd1, 0.02 * s), fr(k.sd1), [B.hipW * s, 0.12 * s, 0.11 * s], 'pelvis', 0);
  for (const sx of [-1, 1]) {   // gluteus and hip, round
    E(madd(madd(madd(k.pelvis, k.sd1, -0.04 * s), cross(LEFT, k.sd1), -0.045 * s), LEFT, sx * 0.068 * s), fr(k.sd1), [0.085 * s, 0.1 * s, 0.08 * s], 'pelvis', 0);
    E(madd(madd(k.pelvis, k.sd1, 0.06 * s), LEFT, sx * 0.1 * s), fr(k.sd1), [0.06 * s, 0.07 * s, 0.07 * s], 'pelvis', 0);
  }
  E(madd(k.waist, sdm, 0.05 * s), fr(sdm), [0.15 * s, 0.24 * s, 0.1 * s], 'spine', 0);
  E(madd(k.waist, k.sd2, 0.19 * s), fr(k.sd2), [B.chest * s, 0.13 * s, 0.115 * s], 'spine', 0);
  E(madd(k.shC, k.sd2, 0.01 * s), fr(k.sd2), [(B.sh + 0.02) * s, 0.05 * s, 0.075 * s], 'spine', 0);
  C(madd(k.neck, k.hd, -0.05 * s), madd(k.neck, k.hd, 0.08 * s), 0.052 * s, 0.045 * s, 'head', 0);
  const hf = fr(k.hd, k.hfw);
  E(k.headC, hf, [0.078 * s, 0.108 * s, 0.093 * s], 'head', 0);
  E(madd(madd(k.headC, hf.az, 0.05 * s), k.hd, -0.06 * s), hf, [0.05 * s, 0.045 * s, 0.05 * s], 'head', 0);       // jaw
  E(madd(madd(k.headC, hf.az, 0.088 * s), k.hd, -0.01 * s), hf, [0.011 * s, 0.024 * s, 0.016 * s], 'head', 0);    // nose
  E(madd(madd(k.headC, hf.az, 0.07 * s), k.hd, 0.025 * s), hf, [0.06 * s, 0.014 * s, 0.022 * s], 'head', 0);      // brow
  const dirOf = (a, b) => norm(sub(b, a)), at = (a, b, t) => add(a, mul(sub(b, a), t));
  for (const [sd, g] of [['L', 1], ['R', 2]]) {
    const sh = k['sh' + sd], e = k['e' + sd], w = k['w' + sd];
    // two straight segments with a clear elbow: no muscle bulges along them (they read as an S), a deltoid cap at the shoulder,
    // an elbow knob, a forearm thinner than the arm
    C(sh, e, 0.054 * s, 0.045 * s, 'ua' + sd, g);
    E(at(sh, e, 0.1), fr(dirOf(sh, e), FWD), [0.062 * s, 0.085 * s, 0.058 * s], 'ua' + sd, g);          // deltoid
    E(e, fr(dirOf(sh, e), FWD), [0.045 * s, 0.045 * s, 0.045 * s], 'fa' + sd, g);                          // elbow
    C(e, w, 0.04 * s, 0.029 * s, 'fa' + sd, g);
    if (mitten) {
      const f = k['hf' + sd], hx = cross(f.fd, f.pn), fh = { ax: hx, ay: f.fd, az: f.pn };
      E(madd(w, f.fd, 0.045 * s), fh, [0.045 * s, 0.05 * s, 0.025 * s], 'hd' + sd, g);                                   // palm
      C(madd(madd(w, f.fd, 0.085 * s), f.pn, 0.004 * s), madd(madd(w, f.fd, 0.14 * s), f.pn, 0.016 * s), 0.03 * s, 0.022 * s, 'hd' + sd, g);   // the fingers together, a little curled
      E(madd(madd(w, f.fd, 0.045 * s), hx, (sd === 'L' ? -1 : 1) * 0.04 * s), fh, [0.02 * s, 0.045 * s, 0.022 * s], 'hd' + sd, g);   // thumb
    }
  }
  for (const [sd, g] of [['L', 3], ['R', 4]]) {
    const h = k['h' + sd], kn = k['k' + sd], a = k['a' + sd], t = k['t' + sd];
    C(h, kn, 0.085 * s, 0.054 * s, 'th' + sd, g);
    E(madd(at(h, kn, 0.38), FWD, 0.012 * s), fr(dirOf(h, kn), FWD), [0.08 * s, 0.17 * s, 0.083 * s], 'th' + sd, g);   // thigh mass
    C(kn, a, 0.05 * s, 0.03 * s, 'sn' + sd, g);
    E(madd(at(kn, a, 0.3), FWD, -0.022 * s), fr(dirOf(kn, a), FWD), [0.05 * s, 0.11 * s, 0.054 * s], 'sn' + sd, g);   // calf
    E(madd(at(a, t, 0.42), UP, -0.022 * s), fr(dirOf(a, t), UP), [0.043 * s, 0.1 * s, 0.032 * s], 'ft' + sd, g);      // foot
  }
  return P;
}
const primD = (p, q) => (q.t === 'e' ? ellD(p, q) : coneD(p, q));
function bodySDF(P) {
  for (const q of P) {       // a bounding sphere per primitive: far primitives are skipped (they cannot change the smooth min)
    if (q.t === 'e') { q.bc = q.c; q.bR = Math.max(q.r[0], q.r[1], q.r[2]); }
    else { q.bc = mul(add(q.a, q.b), 0.5); q.bR = len(sub(q.b, q.a)) / 2 + Math.max(q.r1, q.r2); }
  }
  const g = new Float64Array(5), n = P.length;
  return (p) => {
    g.fill(1e9);
    for (let i = 0; i < n; i++) {
      const q = P[i], dx = p[0] - q.bc[0], dy = p[1] - q.bc[1], dz = p[2] - q.bc[2], rb = q.bR + 0.12;
      if (dx * dx + dy * dy + dz * dz > rb * rb) continue;     // > 12 cm from it: it cannot matter near the surface
      const d = q.t === 'e' ? ellD(p, q) : coneD(p, q); g[q.g] = q.g === 0 ? smin(g[0], d, 0.05) : smin(g[q.g], d, q.g <= 2 ? 0.012 : 0.03);
    }
    let d = g[0]; for (let i = 1; i < 5; i++) d = smin(d, g[i], 0.022);
    return d;
  };
}
// a detailed right hand in its own frame: wrist at 0, fingers +y, palm facing +z, thumb towards -x (the body's midline for a right hand facing +z... mirrored for the left)
function handSDF(s, spread = 1) {   // spread > 1: an open hand, fingers apart (pinya3d2)
  const P = [{ t: 'e', c: [0, 0.05 * s, 0], ax: LEFT, ay: UP, az: FWD, r: [0.046 * s, 0.058 * s, 0.018 * s], g: 0 }, { t: 'c', a: [0, -0.04 * s, -0.003], b: [0, 0.015 * s, 0], r1: 0.03 * s, r2: 0.032 * s, g: 0 }];
  [[-0.031, 0.066, -0.1], [-0.011, 0.076, -0.03], [0.01, 0.072, 0.035], [0.029, 0.058, 0.1]].forEach(([o, L, sp]) => {
    const base = [o * s * (1 + 0.12 * (spread - 1)), 0.098 * s, 0.002], dir = norm([sp * spread, 1, 0.06 / spread]);
    P.push({ t: 'c', a: base, b: madd(base, dir, L * s * (1 + 0.06 * (spread - 1))), r1: 0.0098 * s, r2: 0.0082 * s, g: 1 });
  });
  const tb = [-0.04 * s, 0.03 * s, 0.006], td = norm([-0.8 * Math.min(1.4, spread), 0.6, 0.15 / spread]);
  P.push({ t: 'c', a: tb, b: madd(tb, td, 0.062 * s), r1: 0.0125 * s, r2: 0.0095 * s, g: 1 });
  return (p) => { let a = 1e9, b = 1e9; for (const q of P) { const d = primD(p, q); if (q.g === 0) a = smin(a, d, 0.015); else b = Math.min(b, d); } return smin(a, b, 0.006); };
}

// ---------------------------------------------------------------------------------------------------------------- surface nets
function* nets(f, lo, hi, h) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  const p = [0, 0, 0];
  for (let k = 0; k < nz; k++) { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { p[0] = lo[0] + i * h; p[1] = lo[1] + j * h; p[2] = lo[2] + k * h; F[id(i, j, k)] = f(p); } yield; }
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) { yield; for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t); sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t); n++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  } }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) { if (k % 4 === 0) yield; for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[id(i, j, k)] < 0;
    if (i < nx - 1 && (F[id(i + 1, j, k)] < 0) !== v0) quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)], !v0);
    if (j < ny - 1 && (F[id(i, j + 1, k)] < 0) !== v0) quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], cell[cid(i, j, k - 1)], !v0);
    if (k < nz - 1 && (F[id(i, j, k + 1)] < 0) !== v0) quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)], !v0);
  } }
  // project on the surface and take the gradient as normal
  const nrm = new Float32Array(pos.length), e = h * 0.15, q = [0, 0, 0];
  const grad = (x, y, z) => { q[0] = x + e; q[1] = y; q[2] = z; const a = f(q); q[0] = x - e; const b = f(q); q[0] = x; q[1] = y + e; const c = f(q); q[1] = y - e; const d = f(q); q[1] = y; q[2] = z + e; const g1 = f(q); q[2] = z - e; const g2 = f(q); return [(a - b) / (2 * e), (c - d) / (2 * e), (g1 - g2) / (2 * e)]; };
  for (let v = 0; v < pos.length; v += 3) {
    if (v % 300 === 0) yield;
    for (let it = 0; it < 2; it++) { q[0] = pos[v]; q[1] = pos[v + 1]; q[2] = pos[v + 2]; const d = f(q), g = grad(pos[v], pos[v + 1], pos[v + 2]), gg = dot(g, g) || 1; pos[v] -= (d * g[0]) / gg; pos[v + 1] -= (d * g[1]) / gg; pos[v + 2] -= (d * g[2]) / gg; }
    const g = norm(grad(pos[v], pos[v + 1], pos[v + 2])); nrm[v] = g[0]; nrm[v + 1] = g[1]; nrm[v + 2] = g[2];
  }
  return { pos: new Float32Array(pos), nrm, idx };
}

// ---------------------------------------------------------------------------------------------------------------- bake
// B: build; rest: rest spec; specs: 3 pose specs; opt: { grid, detail (separate hands), seed, shards }
export function bakeBody(B, rest, specs, opt) { const g = bakeBodyGen(B, rest, specs, opt); let r; while (!(r = g.next()).done); return r.value; }
export function* bakeBodyGen(B, rest, specs, opt) {
  const kr = pose(rest, B), ks = specs.map((sp) => pose(sp, B));
  const P = bodyPrims(kr, B, !opt.detail), f = bodySDF(P);
  const lo = [-0.62, -0.08, -0.32], hi = [0.62, 1.95 * B.s, 0.36];
  const body = yield* nets(f, lo, hi, opt.grid);
  const parts = [{ m: body, bone: -1 }];
  if (opt.detail) {
    const hs = handSDF(B.s, opt.spread || 1), hm = yield* nets(hs, [-0.075, -0.06, -0.035], [0.075, 0.2, 0.035], 0.0045);
    // right hand: thumb towards the midline = +x in the hand frame for a right hand facing +z; the SDF has it at -x: mirror
    const mir = (m) => { const p = m.pos.slice(), n = m.nrm.slice(); for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; } const idx = m.idx.slice(); for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } return { pos: p, nrm: n, idx }; };
    parts.push({ m: hm, bone: BI.hdL, local: true }, { m: mir(hm), bone: BI.hdR, local: true });
  }
  // merge
  let nv = 0, ni = 0; for (const q of parts) { nv += q.m.pos.length / 3; ni += q.m.idx.length; }
  const rp = new Float32Array(nv * 3), rn = new Float32Array(nv * 3), idx = new Uint32Array(ni), fixed = new Int16Array(nv).fill(-1);
  const frR = BONES.map((b) => b[1](kr)), frP = ks.map((k) => BONES.map((b) => b[1](k)));
  { let o = 0, oi = 0;
    for (const q of parts) {
      const n = q.m.pos.length / 3;
      for (let v = 0; v < n; v++) {
        let p = [q.m.pos[v * 3], q.m.pos[v * 3 + 1], q.m.pos[v * 3 + 2]], nn = [q.m.nrm[v * 3], q.m.nrm[v * 3 + 1], q.m.nrm[v * 3 + 2]];
        if (q.local) { const F = frR[q.bone]; p = add(F.o, add(add(mul(F.x, p[0]), mul(F.y, p[1])), mul(F.z, p[2]))); nn = add(add(mul(F.x, nn[0]), mul(F.y, nn[1])), mul(F.z, nn[2])); fixed[o + v] = q.bone; }
        rp.set(p, (o + v) * 3); rn.set(nn, (o + v) * 3);
      }
      for (let i = 0; i < q.m.idx.length; i++) idx[oi + i] = q.m.idx[i] + o;
      o += n; oi += q.m.idx.length;
    }
  }
  // skin weights (3 bones)
  const W = new Float32Array(nv * 3), J = new Int16Array(nv * 3), pp = [0, 0, 0];
  const bw = new Float32Array(BONES.length);
  for (let v = 0; v < nv; v++) {
    if (v % 400 === 0) yield;
    if (fixed[v] >= 0) { J[v * 3] = fixed[v]; W[v * 3] = 1; J[v * 3 + 1] = fixed[v]; J[v * 3 + 2] = fixed[v]; continue; }
    pp[0] = rp[v * 3]; pp[1] = rp[v * 3 + 1]; pp[2] = rp[v * 3 + 2];
    bw.fill(-1e9); let dmin = 1e9;
    for (const q of P) { const d = primD(pp, q); if (-d > bw[q.bone]) bw[q.bone] = -d; if (d < dmin) dmin = d; }
    const best = [];
    for (let b = 0; b < BONES.length; b++) if (bw[b] > -1e8) best.push([Math.exp((-(-bw[b]) + dmin) / (b >= 3 && b <= 8 ? 0.007 : 0.022)), b]);   // arms: a short blend, so the elbow stays an elbow
    best.sort((a, b) => b[0] - a[0]);
    const s3 = best.slice(0, 3), tot = s3.reduce((a, c) => a + c[0], 0);
    for (let i = 0; i < 3; i++) { J[v * 3 + i] = s3[i] ? s3[i][1] : s3[0][1]; W[v * 3 + i] = s3[i] ? s3[i][0] / tot : 0; }
  }
  // poses
  const toLocal = (F, p) => { const d = sub(p, F.o); return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
  const fromLocal = (F, l) => add(F.o, add(add(mul(F.x, l[0]), mul(F.y, l[1])), mul(F.z, l[2])));
  const rot = (Fa, Fb, n) => { const l = [dot(n, Fa.x), dot(n, Fa.y), dot(n, Fa.z)]; return add(add(mul(Fb.x, l[0]), mul(Fb.y, l[1])), mul(Fb.z, l[2])); };
  const PP = ks.map(() => new Float32Array(nv * 3)), NN = ks.map(() => new Float32Array(nv * 3));
  for (let pi = 0; pi < ks.length; pi++) for (let v = 0; v < nv; v++) {
    if (v % 1500 === 0) yield;
    const p = [rp[v * 3], rp[v * 3 + 1], rp[v * 3 + 2]], n = [rn[v * 3], rn[v * 3 + 1], rn[v * 3 + 2]];
    let x = [0, 0, 0], y = [0, 0, 0];
    for (let i = 0; i < 3; i++) { const w = W[v * 3 + i]; if (!w) continue; const b = J[v * 3 + i]; x = madd(x, fromLocal(frP[pi][b], toLocal(frR[b], p)), w); y = madd(y, rot(frR[b], frP[pi][b], n), w); }
    y = norm(y); PP[pi].set(x, v * 3); NN[pi].set(y, v * 3);
  }
  // AO and thickness from the SDF (rest pose); a clay mottle
  const ao = new Float32Array(nv), thin = new Float32Array(nv), mott = new Float32Array(nv), headW = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    if (v % 300 === 0) yield;
    const p = [rp[v * 3], rp[v * 3 + 1], rp[v * 3 + 2]], n = [rn[v * 3], rn[v * 3 + 1], rn[v * 3 + 2]];
    let occ = 0, sc = 1;
    for (const hh of [0.02, 0.045, 0.08, 0.13]) { occ += (hh - Math.min(hh, Math.max(0, f(madd(p, n, hh))))) * sc; sc *= 0.6; }
    ao[v] = fixed[v] >= 0 ? 0.9 : clamp01(1 - occ * 4.5);
    thin[v] = fixed[v] >= 0 ? 1 : clamp01((f(madd(p, n, -0.075)) + 0.075) / 0.075);
    mott[v] = 0.5 + 0.25 * Math.sin(p[0] * 31 + p[1] * 17) * Math.sin(p[2] * 27 - p[1] * 23) + 0.25 * Math.sin(p[0] * 71 + p[2] * 53 + p[1] * 61);
    for (let i = 0; i < 3; i++) if (J[v * 3 + i] === BI.head) headW[v] += W[v * 3 + i];
  }
  // shards: seeds on the surface, every triangle to the nearest seed (penalty across bones); split vertices on shard borders
  const r = rng(opt.seed), seeds = [], tri = idx.length / 3;
  const dom = (v) => J[v * 3];
  const cen = (t) => { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3; return [(rp[a] + rp[b] + rp[c]) / 3, (rp[a + 1] + rp[b + 1] + rp[c + 1]) / 3, (rp[a + 2] + rp[b + 2] + rp[c + 2]) / 3]; };
  for (let tries = 0; tries < 6000 && seeds.length < opt.shards; tries++) {
    const t = Math.floor(r() * tri), c = cen(t);
    if (seeds.every((q) => len(sub(q.c, c)) > 0.13)) seeds.push({ c, bone: dom(idx[t * 3]), sx: 0, sy: 0, sz: 0, n: 0, rnd: r() });
  }
  const shard = new Int32Array(tri);
  for (let t = 0; t < tri; t++) {
    if (t % 1500 === 0) yield;
    const c = cen(t), bn = dom(idx[t * 3]); let best = 0, bd = 1e9;
    for (let si = 0; si < seeds.length; si++) { const q = seeds[si]; const d = len(sub(q.c, c)) + (q.bone === bn ? 0 : 0.08); if (d < bd) { bd = d; best = si; } }
    shard[t] = best; const q = seeds[best]; q.sx += c[0]; q.sy += c[1]; q.sz += c[2]; q.n++;
  }
  const map = new Map(), owners = new Map(), outIdx = new Uint32Array(idx.length), src = [];
  for (let t = 0; t < tri; t++) for (let j = 0; j < 3; j++) {
    if (j === 0 && t % 3000 === 0) yield;
    const v = idx[t * 3 + j], key = v * 256 + shard[t];
    let nvx = map.get(key); if (nvx === undefined) { nvx = src.length; map.set(key, nvx); src.push([v, shard[t]]); owners.set(v, (owners.get(v) || 0) + 1); }
    outIdx[t * 3 + j] = nvx;
  }
  const n = src.length;
  // palm of the right hand per pose (front of the palm), for the figure that presses
  const palm = ks.map((k) => madd(madd(k.wR, k.hfR.fd, 0.05 * k.s), k.hfR.pn, 0.019 * k.s));
  const OUT = { n, index: outIdx, P: ks.map(() => new Float32Array(n * 3)), N: ks.map(() => new Float32Array(n * 3)), aSh: new Float32Array(n * 4), aAux: new Float32Array(n * 4), aAux2: new Float32Array(n * 4), palm };
  for (let i = 0; i < n; i++) {
    if (i % 2000 === 0) yield;
    const [v, s] = src[i], q = seeds[s];
    for (let pi = 0; pi < ks.length; pi++) { OUT.P[pi].set(PP[pi].subarray(v * 3, v * 3 + 3), i * 3); OUT.N[pi].set(NN[pi].subarray(v * 3, v * 3 + 3), i * 3); }
    OUT.aSh[i * 4] = rp[v * 3] - q.sx / q.n; OUT.aSh[i * 4 + 1] = rp[v * 3 + 1] - q.sy / q.n; OUT.aSh[i * 4 + 2] = rp[v * 3 + 2] - q.sz / q.n; OUT.aSh[i * 4 + 3] = q.rnd;
    const b0 = J[v * 3], y = rp[v * 3 + 1];
    const breath = b0 === BI.spine || b0 === BI.pelvis ? 1 : b0 === BI.head ? 0.5 : (b0 >= BI.uaL && b0 <= BI.faR) ? 0.35 : 0;
    const isL = b0 === BI.thL || b0 === BI.snL || b0 === BI.ftL, isR = b0 === BI.thR || b0 === BI.snR || b0 === BI.ftR;
    const lift = clamp01(1 - y / 0.9);
    const p1 = OUT.P[1].subarray(i * 3, i * 3 + 3);
    OUT.aAux[i * 4] = owners.get(v) > 1 ? 0 : 1; OUT.aAux[i * 4 + 1] = breath; OUT.aAux[i * 4 + 2] = (isL ? lift : 0) - (isR ? lift : 0);
    OUT.aAux[i * 4 + 3] = len(sub([p1[0], p1[1], p1[2]], palm[1]));
    OUT.aAux2[i * 4] = ao[v]; OUT.aAux2[i * 4 + 1] = thin[v]; OUT.aAux2[i * 4 + 2] = mott[v]; OUT.aAux2[i * 4 + 3] = headW[v];
  }
  return OUT;
}
