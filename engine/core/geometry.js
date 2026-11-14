// Geometry helpers: 3×3 projective transforms, homography / affine fitting, polygons.
// Conventions (see ARCHITECTURE.md › Coordinates):
//   sensor frame  — metres, x = d·cos(θ), y = d·sin(θ), θ = raw LiDAR angle.
//   wall frame    — metres, origin at the bottom-left corner of the touch surface seen from
//                   inside the room, x to the right, y up.
//   wall UV       — normalised 0..1 with the origin at the TOP-left (screen convention).

/** @typedef {number[]} Mat3  row-major, length 9 */

export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** @param {Mat3} m @param {number} x @param {number} y @returns {[number, number]} */
export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  const iw = Math.abs(w) < 1e-12 ? 0 : 1 / w;
  return [(m[0] * x + m[1] * y + m[2]) * iw, (m[3] * x + m[4] * y + m[5]) * iw];
}

/** @param {Mat3} a @param {Mat3} b @returns {Mat3} a·b */
export function multiply(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

/** @param {Mat3} m @returns {Mat3|null} */
export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

/**
 * Rigid pose of a sensor inside a wall frame as a matrix sensor→wall.
 * @param {{x:number,y:number,rotation:number,mirror?:boolean}} pose  rotation in degrees
 * @returns {Mat3}
 */
export function poseMatrix(pose) {
  const r = (pose.rotation * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const my = pose.mirror ? -1 : 1;
  // R · diag(1, my)  then translate
  return [c, -s * my, pose.x, s, c * my, pose.y, 0, 0, 1];
}

/** Solve A·x = b (n×n) in place with partial pivoting. Returns null if singular. */
export function solveLinear(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r][col]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-12) return null;
    if (piv !== col) { [A[piv], A[col]] = [A[col], A[piv]]; [b[piv], b[col]] = [b[col], b[piv]]; }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/** Hartley normalisation: translate centroid to origin, mean distance √2. */
function normaliser(pts) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let md = 0;
  for (const [x, y] of pts) md += Math.hypot(x - cx, y - cy);
  md /= pts.length;
  const s = md > 1e-12 ? Math.SQRT2 / md : 1;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

/**
 * Least-squares homography src→dst from ≥4 correspondences (normalised DLT, h33 = 1).
 * @param {[number,number][]} src @param {[number,number][]} dst
 * @returns {Mat3|null}
 */
export function fitHomography(src, dst) {
  const n = src.length;
  if (n < 4 || dst.length !== n) return null;
  const Ts = normaliser(src), Td = normaliser(dst);
  const s = src.map(([x, y]) => apply(Ts, x, y));
  const d = dst.map(([x, y]) => apply(Td, x, y));
  // Normal equations for the 8 unknowns.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const addRow = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < n; i++) {
    const [x, y] = s[i], [u, v] = d[i];
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solveLinear(AtA, Atb);
  if (!h) return null;
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const TdInv = invert(Td);
  if (!TdInv) return null;
  const H = multiply(TdInv, multiply(Hn, Ts));
  const k = Math.abs(H[8]) > 1e-12 ? 1 / H[8] : 1;
  return H.map((v) => v * k);
}

/**
 * Least-squares affine transform src→dst from ≥3 correspondences.
 * @returns {Mat3|null}
 */
export function fitAffine(src, dst) {
  const n = src.length;
  if (n < 3 || dst.length !== n) return null;
  const AtA = Array.from({ length: 3 }, () => new Array(3).fill(0));
  const bu = [0, 0, 0], bv = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const row = [src[i][0], src[i][1], 1];
    for (let a = 0; a < 3; a++) {
      bu[a] += row[a] * dst[i][0];
      bv[a] += row[a] * dst[i][1];
      for (let b = 0; b < 3; b++) AtA[a][b] += row[a] * row[b];
    }
  }
  const pu = solveLinear(AtA.map((r) => r.slice()), bu);
  const pv = solveLinear(AtA.map((r) => r.slice()), bv);
  if (!pu || !pv) return null;
  return [pu[0], pu[1], pu[2], pv[0], pv[1], pv[2], 0, 0, 1];
}

/** Residuals of a fitted transform, in the dst units. */
export function residuals(m, src, dst) {
  const errs = src.map(([x, y], i) => {
    const [u, v] = apply(m, x, y);
    return Math.hypot(u - dst[i][0], v - dst[i][1]);
  });
  const rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / Math.max(1, errs.length));
  return { errors: errs, rms, max: errs.length ? Math.max(...errs) : 0 };
}

/** True if the 2×2 linear part keeps orientation sane (not degenerate). */
export function isWellConditioned(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  return Number.isFinite(det) && Math.abs(det) > 1e-6;
}

/** Ray-casting point-in-polygon. @param {[number,number][]} poly */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-300) + xi) inside = !inside;
  }
  return inside;
}

/** @param {{x0:number,y0:number,x1:number,y1:number}} r */
export function pointInRect(x, y, r) {
  return x >= Math.min(r.x0, r.x1) && x <= Math.max(r.x0, r.x1) && y >= Math.min(r.y0, r.y1) && y <= Math.max(r.y0, r.y1);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
