// Level check — mounting aid. A 2D LiDAR cannot measure the tilt of its own plane against the wall, but
// with the room empty two symptoms are visible in its static returns (see ARCHITECTURE.md › Level check):
//   1. Wall grazing: returns INSIDE the wall rectangle (not floor, not a neighbouring wall, not a mask) mean the
//      plane reaches the wall there; beyond that point the wall blocks the laser and hands are not seen.
//   2. Floor line: the floor must be seen from corner to corner; stretches missing from it are where the plane
//      entered the wall (or something stands on the floor) before reaching it.
// Pure function: sensor-frame points in, verdict + marks in wall metres out.

import { apply, pointInRect } from './geometry.js';

/**
 * @param {[number,number][]} pts       sensor-frame points (metres), e.g. backgroundPoints()
 * @param {number[]} matrix             sensor → wall 3×3 (calibration homography or pose matrix)
 * @param {{width:number,height:number,masks?:{x0:number,y0:number,x1:number,y1:number}[]}} wall
 * @param {object} [o]
 * @returns {{ok:boolean, grazing:[number,number][], grazingRegion:object|null, nearestM:number|null,
 *            floorCoverage:number, floorGaps:[number,number][], counts:object, advice:string[]}}
 */
export function levelCheck(pts, matrix, wall, o = {}) {
  const floorTol = o.floorTol ?? 0.08;   // a floor return is within ±8 cm of y = 0
  const sideTol = o.sideTol ?? 0.08;     // a neighbouring-wall return is within ±8 cm of x = 0 / x = W
  const cell = o.cell ?? 0.1;            // floor coverage resolution along x
  const minGrazing = o.minGrazing ?? 3;  // fewer isolated points are noise
  const minCoverage = o.minCoverage ?? 0.95;
  const W = wall.width, H = wall.height;
  const masks = (wall.masks || []).filter((m) => !m.type || m.type === 'rect');
  const origin = apply(matrix, 0, 0);

  const nCells = Math.max(1, Math.round(W / cell));
  const floorHit = new Uint8Array(nCells);
  const grazing = [];
  const counts = { floor: 0, side: 0, masked: 0, grazing: 0, outside: 0 };

  for (const [sx, sy] of pts) {
    const [x, y] = apply(matrix, sx, sy);
    if (x < -sideTol || x > W + sideTol || y < -floorTol || y > H + 0.3) { counts.outside++; continue; }
    if (masks.some((m) => pointInRect(x, y, m))) { counts.masked++; continue; }
    if (Math.abs(y) <= floorTol) {
      counts.floor++;
      const c = Math.floor((x / W) * nCells);
      floorHit[Math.min(nCells - 1, Math.max(0, c))] = 1;
      continue;
    }
    if (x <= sideTol || x >= W - sideTol) { counts.side++; continue; }
    counts.grazing++;
    grazing.push([round(x), round(y)]);
  }

  // floor coverage and the missing stretches (merged runs of empty cells)
  let covered = 0;
  const floorGaps = [];
  for (let c = 0; c < nCells; c++) {
    if (floorHit[c]) { covered++; continue; }
    const x0 = round((c / nCells) * W), x1 = round(((c + 1) / nCells) * W);
    const last = floorGaps[floorGaps.length - 1];
    if (last && Math.abs(last[1] - x0) < 1e-9) last[1] = x1; else floorGaps.push([x0, x1]);
  }
  const floorCoverage = round(covered / nCells, 3);

  const grazed = grazing.length >= minGrazing;
  let grazingRegion = null, nearestM = null;
  if (grazed) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
    nearestM = Infinity;
    for (const [x, y] of grazing) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      cx += x; cy += y;
      nearestM = Math.min(nearestM, Math.hypot(x - origin[0], y - origin[1]));
    }
    cx /= grazing.length; cy /= grazing.length;
    grazingRegion = { x0: round(x0), y0: round(y0), x1: round(x1), y1: round(y1), where: describe(cx, cy, W, H) };
    nearestM = round(nearestM, 2);
  }

  const advice = [];
  if (grazed) {
    const r = grazingRegion;
    advice.push(`The scan plane touches the wall ${r.where} (x ${f2(r.x0)}–${f2(r.x1)} m, y ${f2(r.y0)}–${f2(r.y1)} m, `
      + `from ${f2(nearestM)} m away): tilt the sensor so its plane moves away from the wall on that side.`);
  }
  const gapLen = floorGaps.reduce((a, [g0, g1]) => a + (g1 - g0), 0);
  if (floorCoverage < minCoverage) {
    const list = floorGaps.slice(0, 3).map(([g0, g1]) => `${f2(g0)}–${f2(g1)} m`).join(', ');
    advice.push(`The floor line is incomplete (${Math.round(floorCoverage * 100)} % seen; missing ${list}${floorGaps.length > 3 ? '…' : ''}). `
      + (grazed ? 'Same side as the grazing: the plane enters the wall before the floor.' : 'Check for objects on the floor there, or a plane leaning into the wall.'));
  }
  if (!counts.floor) advice.push('No floor seen at all — check the pose (Auto-align) or that the sensor faces the floor.');
  if (!advice.length) advice.push('The plane clears the wall and the floor is seen from corner to corner.');

  return {
    ok: !grazed && floorCoverage >= minCoverage && counts.floor > 0,
    grazing, grazingRegion, nearestM, floorCoverage, floorGaps, gapLenM: round(gapLen), counts, advice,
  };
}

function describe(x, y, W, H) {
  const col = x < W / 3 ? 'left' : x > (2 * W) / 3 ? 'right' : 'centre';
  const row = y < H / 3 ? 'lower' : y > (2 * H) / 3 ? 'upper' : 'middle';
  if (row === 'middle' && col === 'centre') return 'in the middle';
  if (col === 'centre') return `in the ${row} centre`;
  return row === 'middle' ? `on the ${col}` : `on the ${row} ${col}`;
}

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const f2 = (v) => v.toFixed(2);
