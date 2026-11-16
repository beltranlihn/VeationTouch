// Zone and mask geometry for the editor. Pure helpers over the shared geometry module (the engine runs the
// same maths): a "geom" is {kind:'rect', rect} | {kind:'polygon', points} | {kind:'circle', circle:{x,y,r}},
// in the units of the space the shape lives in (wall metres, y up · canvas pixels, y down).

import { boundsOf, shapeOutline, densify, fitHomography, invert, apply, gridMap, invertMap, polygonArea, pointInShape } from '/shared/geometry.js';

export { shapeOutline, pointInShape, polygonArea };

export const kindOf = (o) => o.shape || o.type || 'rect';
export const normRect = (r) => ({ x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) });

/** Geometry of a zone or a mask. */
export function geomOf(o) {
  const k = kindOf(o);
  if (k === 'polygon') return { kind: k, points: o.points };
  if (k === 'circle') return { kind: k, circle: o.circle };
  return { kind: 'rect', rect: normRect(o.rect || o) };
}

export function boundsOfGeom(g) {
  if (g.kind === 'polygon') return boundsOf(g.points);
  if (g.kind === 'circle') { const c = g.circle; return { x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r }; }
  return normRect(g.rect);
}

/** The object with its geometry replaced (zones keep their bounds in `rect`, masks in x0…y1). */
export function withGeom(o, g, isZone) {
  const b = boundsOfGeom(g);
  if (isZone) {
    const z = { ...o, shape: g.kind, rect: g.kind === 'rect' ? normRect(g.rect) : b };
    delete z.points; delete z.circle;
    if (g.kind === 'polygon') z.points = g.points;
    if (g.kind === 'circle') z.circle = g.circle;
    return z;
  }
  const m = { ...o, type: g.kind === 'polygon' ? 'polygon' : 'rect', ...b };
  delete m.points;
  if (g.kind === 'polygon') m.points = g.points;
  return m;
}

/** Write a geometry into a profile object in place (the edit callback of the editor). */
export function assignGeom(target, g, isZone) {
  const v = withGeom(target, g, isZone);
  for (const k of ['shape', 'type', 'rect', 'points', 'circle', 'x0', 'y0', 'x1', 'y1']) {
    if (k in v) target[k] = v[k]; else delete target[k];
  }
}

export function translateGeom(g, dx, dy, round = (v) => v) {
  if (g.kind === 'polygon') return { kind: g.kind, points: g.points.map(([x, y]) => [round(x + dx), round(y + dy)]) };
  if (g.kind === 'circle') return { kind: g.kind, circle: { ...g.circle, x: round(g.circle.x + dx), y: round(g.circle.y + dy) } };
  const r = g.rect;
  return { kind: 'rect', rect: { x0: round(r.x0 + dx), y0: round(r.y0 + dy), x1: round(r.x1 + dx), y1: round(r.y1 + dy) } };
}

/** Short size readout for the selection label. */
export function describeGeom(g, unit) {
  const f = unit === 'px' ? (v) => Math.round(v) : (v) => v.toFixed(2);
  if (g.kind === 'circle') return `Ø ${f(g.circle.r * 2)} ${unit}  @ ${f(g.circle.x)}, ${f(g.circle.y)}`;
  const b = boundsOfGeom(g);
  const size = `${f(b.x1 - b.x0)} × ${f(b.y1 - b.y0)} ${unit}`;
  return g.kind === 'polygon' ? `${g.points.length} points · ${size}` : `${size}  @ ${f(b.x0)}, ${f(b.y0)}`;
}

// ------------------------------------------------------------------ canvas ↔ wall

const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
const hInv = new WeakMap();

/** Output-canvas pixel → wall UV (0..1, origin top-left) through the wall's mapping. Grid maps clamp to the wall. */
export function canvasToUv(w, X, Y) {
  const m = w.mapping;
  if (m?.mode === 'corners') {
    let Hi = hInv.get(m);
    if (!Hi) { Hi = invert(fitHomography(UNIT, m.corners)) || [1, 0, 0, 0, 1, 0, 0, 0, 1]; hInv.set(m, Hi); }
    return apply(Hi, X, Y);
  }
  if (m?.mode === 'grid') return invertMap((u, v) => gridMap(m, u, v), X, Y);
  const r = w.pixelRect;
  return [(X - r.x) / r.w, (Y - r.y) / r.h];
}

const cache = new WeakMap();
/** Outline of a canvas zone in the metres of one wall (cached per wall object and zone geometry). */
export function canvasZoneOnWall(z, w) {
  let m = cache.get(w);
  if (!m) { m = new Map(); cache.set(w, m); }
  const key = JSON.stringify(geomOf(z));
  let pts = m.get(key);
  if (!pts) {
    pts = densify(shapeOutline(z, 48), 24).map(([X, Y]) => { const [u, v] = canvasToUv(w, X, Y); return [u * w.width, (1 - v) * w.height]; });
    if (m.size > 200) m.clear();
    m.set(key, pts);
  }
  return pts;
}
