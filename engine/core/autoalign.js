// Auto-align: find a sensor's pose on its wall from what it sees in the EMPTY room.
// The scan plane is parallel to the wall, so it cuts the floor and the two adjacent walls along
// three straight lines (a "U"). Fitting those lines gives the sensor's height above the floor,
// its distance to the left wall, its rotation, its mirror flag — and the real wall width
// between the neighbours, to cross-check the plans. The configured (approximate) pose is only
// used to tell which line is which and which way is "right".

import { poseMatrix, apply } from './geometry.js';

/** Total-least-squares line through points: {c:[x,y] centroid, d:[dx,dy] unit direction, rms}. */
function fitLine(pts) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { const dx = x - cx, dy = y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d = [Math.cos(a), Math.sin(a)];
  let e = 0;
  for (const [x, y] of pts) { const r = -(x - cx) * d[1] + (y - cy) * d[0]; e += r * r; }
  return { c: [cx, cy], d, rms: Math.sqrt(e / pts.length), n: pts.length };
}

const distToLine = (L, [x, y]) => Math.abs(-(x - L.c[0]) * L.d[1] + (y - L.c[1]) * L.d[0]);

/** Sequential RANSAC: up to `max` lines, each with ≥ minInliers points. Deterministic (seeded). */
export function findLines(points, { max = 4, tol = 0.025, minInliers = 25, iters = 400, seed = 7 } = {}) {
  let rest = points.slice();
  const lines = [];
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  while (lines.length < max && rest.length >= minInliers) {
    let best = null, bestIn = null;
    for (let k = 0; k < iters; k++) {
      const p = rest[Math.floor(rnd() * rest.length)], q = rest[Math.floor(rnd() * rest.length)];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 0.2) continue;
      const L = { c: p, d: [(q[0] - p[0]) / len, (q[1] - p[1]) / len] };
      const inl = rest.filter((r) => distToLine(L, r) <= tol);
      if (!bestIn || inl.length > bestIn.length) { best = L; bestIn = inl; }
    }
    if (!bestIn || bestIn.length < minInliers) break;
    const L = fitLine(bestIn);
    const inl = rest.filter((r) => distToLine(L, r) <= tol);
    lines.push({ ...fitLine(inl), points: inl });
    const set = new Set(inl);
    rest = rest.filter((r) => !set.has(r));
  }
  return lines;
}

/**
 * @param {[number,number][]} pts  sensor-frame points (metres) of the empty room
 * @param {{x:number,y:number,rotation:number,mirror?:boolean}} pose  approximate configured pose
 * @param {{width:number,height:number}} wall
 */
export function autoAlign(pts, pose, wall) {
  const lines = findLines(pts);
  if (lines.length < 2) return { ok: false, error: 'not enough straight surfaces seen — is the room empty and the background captured?' };
  const M0 = poseMatrix(pose);
  // describe each line in the APPROXIMATE wall frame to recognise floor / left / right
  const desc = lines.map((L) => {
    const [ax, ay] = apply(M0, L.c[0], L.c[1]);
    const [bx, by] = apply(M0, L.c[0] + L.d[0], L.c[1] + L.d[1]);
    const ang = Math.abs(Math.atan2(by - ay, bx - ax)); // 0 = horizontal, π/2 = vertical
    const horiz = Math.min(ang, Math.PI - ang);
    return { L, cx: ax, cy: ay, horiz };
  });
  const floorC = desc.filter((q) => q.horiz < Math.PI / 6).sort((a, b) => a.cy - b.cy)[0];
  if (!floorC) return { ok: false, error: 'no floor line found (check the approximate rotation)' };
  const verts = desc.filter((q) => q !== floorC && q.horiz > Math.PI / 3);
  const left = verts.filter((q) => q.cx < wall.width / 2).sort((a, b) => b.L.n - a.L.n)[0] || null;
  const right = verts.filter((q) => q.cx >= wall.width / 2).sort((a, b) => b.L.n - a.L.n)[0] || null;

  // wall-frame axes expressed in the sensor frame
  const F = floorC.L;
  let u = F.d.slice();
  const [ux0, uy0] = apply(M0, 0, 0), [ux1, uy1] = apply(M0, u[0], u[1]);
  if (ux1 - ux0 < 0) u = [-u[0], -u[1]];                       // u must point to +x (right)
  // v: perpendicular to the floor, pointing from the floor towards the sensor (origin)
  let v = [-u[1], u[0]];
  const sideOfOrigin = (0 - F.c[0]) * v[0] + (0 - F.c[1]) * v[1];
  if (sideOfOrigin < 0) v = [-v[0], -v[1]];
  void uy0; void uy1;
  const h = Math.abs(sideOfOrigin);                             // sensor height above the floor
  // x of the sensor: from the left wall if seen, else from the right wall, else keep
  const xOf = (W) => { // signed distance along u from wall line W to the origin
    const t = ((0 - W.c[0]) * u[0] + (0 - W.c[1]) * u[1]);
    // project: the wall line is ~perpendicular to u, so its offset along u is its centroid's
    return t + 0; };
  let x = pose.x, xFrom = 'kept';
  let measuredWidth = null;
  if (left) { x = xOf(left.L); xFrom = 'left wall'; }
  if (right) {
    const xr = wall.width + xOf(right.L);
    if (!left) { x = xr; xFrom = 'right wall'; }
    if (left) measuredWidth = Math.abs(((right.L.c[0] - left.L.c[0]) * u[0]) + ((right.L.c[1] - left.L.c[1]) * u[1]));
  }
  // linear part sensor→wall has rows u, v: first column (u.x, v.x) gives θ; det gives the mirror
  const det = u[0] * v[1] - u[1] * v[0];
  const mirror = det < 0;
  const rotation = (Math.atan2(v[0], u[0]) * 180) / Math.PI;
  const r = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    ok: true,
    pose: { x: r(x), y: r(h), rotation: r(rotation, 2), mirror },
    seen: { floor: true, left: !!left, right: !!right, lines: lines.length },
    xFrom,
    floorRmsMm: r(F.rms * 1000, 1),
    measuredWidth: measuredWidth === null ? null : r(measuredWidth),
    widthDiff: measuredWidth === null ? null : r(measuredWidth - wall.width),
  };
}

/** Sensor-frame points from a learned background (per-angle-bin distances in mm). */
export function backgroundPoints(dist, binDeg) {
  const out = [];
  for (let b = 0; b < dist.length; b++) {
    const d = dist[b];
    if (!(d > 0)) continue;
    const a = ((b + 0.5) * binDeg * Math.PI) / 180;
    out.push([(d / 1000) * Math.cos(a), (d / 1000) * Math.sin(a)]);
  }
  return out;
}
