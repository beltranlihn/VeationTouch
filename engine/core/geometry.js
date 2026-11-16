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

// ---------------------------------------------------------------- zone and mask shapes
// A shape is `{shape:'rect', rect}`, `{shape:'polygon', points:[[x,y]…]}` or `{shape:'circle', circle:{x,y,r}}`
// (zones), or a mask `{type:'rect', x0,y0,x1,y1}` / `{type:'polygon', points}`. Units are those of the space the
// shape lives in (wall metres or canvas pixels); the maths does not care.

const shapeKind = (z) => z.shape || z.type || 'rect';

/** Is (x, y) inside a zone or mask shape? */
export function pointInShape(x, y, z) {
  const k = shapeKind(z);
  if (k === 'polygon') return pointInPolygon(x, y, z.points);
  if (k === 'circle') { const c = z.circle; return (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r; }
  return pointInRect(x, y, z.rect || z);
}

/** Axis-aligned bounds {x0,y0,x1,y1} of points. */
export function boundsOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

/** Closed outline of a shape as a polygon (circles as `n` points). */
export function shapeOutline(z, n = 32) {
  const k = shapeKind(z);
  if (k === 'polygon') return z.points;
  if (k === 'circle') { const c = z.circle; return Array.from({ length: n }, (_, i) => [c.x + c.r * Math.cos((2 * Math.PI * i) / n), c.y + c.r * Math.sin((2 * Math.PI * i) / n)]); }
  const r = z.rect || z;
  return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
}

/** Closed polygon with every edge split into pieces no longer than `step` (to draw it through a curved map). */
export function densify(points, step) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
    const n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** Signed area of a polygon (shoelace). */
export function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  return a / 2;
}

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const on = (p, q, r) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(a, c, b)) || (o2 === 0 && on(a, d, b)) || (o3 === 0 && on(c, a, d)) || (o4 === 0 && on(c, b, d));
}

/** Do two polygons share any area (or touch)? */
export function polygonsOverlap(a, b) {
  if (a.some(([x, y]) => pointInPolygon(x, y, b)) || b.some(([x, y]) => pointInPolygon(x, y, a))) return true;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) if (segmentsCross(a[j], a[i], b[l], b[k])) return true;
  }
  return false;
}

/**
 * Floor plan of the walls (metres, seen from above, y = north). Wall i starts where wall i−1 ends and the corner
 * between them turns `wall.turn` degrees CLOCKWISE (an ordinary inside corner = 90, 0 = the wall continues
 * straight), so the content strip wraps around the room as seen from inside. Centred on its bounds.
 * With `close`, a room whose loop ends within `closeTol` of its start (measured widths never match exactly: XR Lab's
 * opposite walls differ by 2–7 cm) is drawn closed: the mismatch is spread along the walls, so every corner meets.
 * @returns {{id:string, p0:[number,number], dir:[number,number], normal:[number,number], width:number, height:number}[]}
 *          `normal` points into the room (the side the wall is seen from). p0 + dir · x (x in the wall's own metres,
 *          0…width) is the point on the plan; |dir| is 1 unless the loop was closed (then within a few per mille).
 */
export function roomPlan(walls, { close = false, closeTol = 0.3 } = {}) {
  const out = [];
  let x = 0, y = 0, a = 0; // the first wall runs east
  for (const w of walls) {
    const dir = [Math.cos(a), Math.sin(a)];
    out.push({ id: w.id, p0: [x, y], dir, normal: [dir[1], -dir[0]], width: w.width, height: w.height });
    x += dir[0] * w.width; y += dir[1] * w.width;
    a -= ((w.turn ?? 90) * Math.PI) / 180;
  }
  const gap = [x - (out[0]?.p0[0] ?? 0), y - (out[0]?.p0[1] ?? 0)];
  if (close && out.length > 2 && Math.hypot(...gap) > 1e-9 && Math.hypot(...gap) < closeTol) {
    // move each corner back by its share of the gap (proportional to the length walked so far)
    const total = out.reduce((s, o) => s + o.width, 0);
    let walked = 0;
    const corners = out.map((o) => { const k = walked / total; walked += o.width; return [o.p0[0] - gap[0] * k, o.p0[1] - gap[1] * k]; });
    out.forEach((o, i) => {
      const p0 = corners[i], p1 = corners[(i + 1) % out.length];
      const d = [(p1[0] - p0[0]) / o.width, (p1[1] - p0[1]) / o.width], len = Math.hypot(...d);
      o.p0 = p0; o.dir = d; o.normal = [d[1] / len, -d[0] / len];
    });
  }
  const pts = out.flatMap((o) => [o.p0, [o.p0[0] + o.dir[0] * o.width, o.p0[1] + o.dir[1] * o.width]]);
  const b = boundsOf(pts.length ? pts : [[0, 0]]);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (const o of out) o.p0 = [o.p0[0] - cx, o.p0[1] - cy];
  return out;
}

/** Does the wall loop close — the last wall ends within `tol` metres of where the first begins (3 walls or more)? */
export function planCloses(walls, tol = 0.3) {
  if (walls.length < 3) return false;
  const plan = roomPlan(walls), a = plan[0], z = plan.at(-1);
  return Math.hypot(z.p0[0] + z.dir[0] * z.width - a.p0[0], z.p0[1] + z.dir[1] * z.width - a.p0[1]) < tol;
}

/** Outline of a wall's region in the output canvas, for any mapping mode (grid edges sampled). */
export function mappingOutline(mapping, pixelRect, n = 12) {
  if (mapping?.mode === 'corners') return mapping.corners;
  if (mapping?.mode === 'grid') {
    const pts = [];
    for (let k = 0; k < n; k++) pts.push(gridMap(mapping, k / n, 0));
    for (let k = 0; k < n; k++) pts.push(gridMap(mapping, 1, k / n));
    for (let k = 0; k < n; k++) pts.push(gridMap(mapping, 1 - k / n, 1));
    for (let k = 0; k < n; k++) pts.push(gridMap(mapping, 0, 1 - k / n));
    return pts;
  }
  const r = pixelRect;
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

const homCache = new WeakMap();
/**
 * Canvas pixel of a wall UV (0..1, origin top-left) through the wall's mapping — rect, corner pin or mesh.
 * The one implementation of the mapping: the engine, the outputs, the UI and the projection all use it.
 */
export function wallUvToCanvas(wall, u, v, mapping = wall.mapping) {
  if (mapping?.mode === 'grid') return gridMap(mapping, u, v);
  if (mapping?.mode === 'corners') {
    let H = homCache.get(mapping);
    if (!H) { H = fitHomography([[0, 0], [1, 0], [1, 1], [0, 1]], mapping.corners) || IDENTITY; homCache.set(mapping, H); }
    return apply(H, u, v);
  }
  const r = wall.pixelRect;
  return [r.x + u * r.w, r.y + v * r.h];
}

// ---------------------------------------------------------------- grid warp (mesh mapping)
// A grid is { us:[0..1], vs:[0..1], points:[[x,y]] } — node lines at the given UV positions
// (strictly increasing, first 0, last 1), points row-major (row j = vs[j], column i = us[i]).
// Inside each cell the map is bilinear, so lines of constant u or v are straight within a cell.

function cellOf(ts, t) {
  let k = 0;
  while (k < ts.length - 2 && t > ts[k + 1]) k++;
  return [k, (t - ts[k]) / (ts[k + 1] - ts[k])];
}

/** Wall UV → canvas px through a grid. */
export function gridMap(g, u, v) {
  const nx = g.us.length;
  const [i, s] = cellOf(g.us, u);
  const [j, t] = cellOf(g.vs, v);
  const P = g.points;
  const a = P[j * nx + i], b = P[j * nx + i + 1], c = P[(j + 1) * nx + i + 1], d = P[(j + 1) * nx + i];
  return [
    (1 - s) * (1 - t) * a[0] + s * (1 - t) * b[0] + s * t * c[0] + (1 - s) * t * d[0],
    (1 - s) * (1 - t) * a[1] + s * (1 - t) * b[1] + s * t * c[1] + (1 - s) * t * d[1],
  ];
}

/**
 * Fit: move node k of a grid so that (u, v) maps to `target` (canvas px), the other nodes staying put.
 * Returns the node's new position, or null when (u, v) barely depends on that node (weight < `minWeight`:
 * the point is too far from it — the correction would be huge and wrong).
 */
export function gridSolveNode(g, k, u, v, target, minWeight = 0.25) {
  const nx = g.us.length;
  const i = k % nx, j = Math.floor(k / nx);
  const [ci, s] = cellOf(g.us, u), [cj, t] = cellOf(g.vs, v);
  const wi = i === ci ? 1 - s : i === ci + 1 ? s : 0;
  const wj = j === cj ? 1 - t : j === cj + 1 ? t : 0;
  const w = wi * wj;
  if (w < minWeight) return null;
  const [x, y] = gridMap(g, u, v);
  const p = g.points[k];
  return [p[0] + (target[0] - x) / w, p[1] + (target[1] - y) / w];
}

/** The grid node closest to (u, v), measured in metres on a wall of `width` × `height`. */
export function gridNearestNode(g, u, v, width = 1, height = 1) {
  let best = 0, bd = Infinity;
  g.vs.forEach((tv, j) => g.us.forEach((tu, i) => {
    const d = ((tu - u) * width) ** 2 + ((tv - v) * height) ** 2;
    if (d < bd) { bd = d; best = j * g.us.length + i; }
  }));
  return best;
}

/** Uniform nx × ny grid sampled from any UV → px function (keeps the current look). */
export function gridFrom(map, nx, ny) {
  const us = Array.from({ length: nx }, (_, i) => i / (nx - 1));
  const vs = Array.from({ length: ny }, (_, j) => j / (ny - 1));
  const points = [];
  for (const v of vs) for (const u of us) points.push(map(u, v).map((x) => Math.round(x * 10) / 10));
  return { us, vs, points };
}

/** Insert a column (axis 'u') or a row (axis 'v') at parameter t without changing the map. */
export function gridInsert(g, axis, t) {
  const ts = axis === 'u' ? g.us : g.vs;
  if (t <= 0.001 || t >= 0.999 || ts.some((x) => Math.abs(x - t) < 0.01) || ts.length >= 33) return g;
  const us = axis === 'u' ? [...g.us, t].sort((a, b) => a - b) : g.us.slice();
  const vs = axis === 'v' ? [...g.vs, t].sort((a, b) => a - b) : g.vs.slice();
  const points = [];
  for (const v of vs) for (const u of us) {
    const i = g.us.indexOf(u), j = g.vs.indexOf(v);
    points.push(i >= 0 && j >= 0 ? g.points[j * g.us.length + i].slice() : gridMap(g, u, v).map((x) => Math.round(x * 10) / 10));
  }
  return { us, vs, points };
}

/** Approximate inverse of any UV → px map (coarse search + refinement). Returns [u, v] or null. */
export function invertMap(map, x, y) {
  let best = null, bd = Infinity, step = 1 / 32;
  for (let v = 0; v <= 1 + 1e-9; v += step) for (let u = 0; u <= 1 + 1e-9; u += step) {
    const [px, py] = map(u, v); const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) { bd = d; best = [u, v]; }
  }
  for (let it = 0; it < 4; it++) {
    step /= 4;
    const [cu, cv] = best;
    for (let dv = -4; dv <= 4; dv++) for (let du = -4; du <= 4; du++) {
      const u = clamp(cu + du * step, 0, 1), v = clamp(cv + dv * step, 0, 1);
      const [px, py] = map(u, v); const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = [u, v]; }
    }
  }
  return best;
}
