// The central workspace. Each tool (mode) changes WHAT the canvas shows and WHAT can be grabbed:
//   live       all walls, read-only, virtual hands
//   room       all walls; drag a wall's right/top edge to resize it
//   mapping    the OUTPUT CANVAS in pixels: move wall regions, drag corners (corner pin)
//   sensors    one wall in focus: drag a sensor, rotate it with its handle, live point cloud
//   calibrate  one wall in focus with the targets
//   zones      one wall in focus (wall zones and masks, metres) — or the output canvas (canvas zones, pixels,
//              drawn on the content and free to span walls): draw rect / polygon / circle, move, reshape
// Edits are previewed locally while dragging (`ghost`) and committed once on release.

import { store } from './conn.js';
import { apply as applyM, gridMap, gridInsert, invertMap, densify, planCloses, mappingOutline, wallUvToCanvas } from '/shared/geometry.js';
import { TouchMask } from '/shared/mask.js';
import { kindOf, geomOf, withGeom, assignGeom, boundsOfGeom, translateGeom, describeGeom, shapeOutline, pointInShape, polygonArea, canvasToUv, canvasZoneOnWall } from './shapes.js';

const GAP = 0.6;                       // metres between walls in the strip
const SEAM = 0.06;                     // Live: walls joined by a continuous corner only show a seam (one surface)
const FOCUS_MODES = new Set(['sensors', 'calibrate', 'zones']);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const normRect = (r) => ({ x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) });
const rectCorners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

/** Wall UV (0..1 top-left) → canvas px through the wall's mapping: the engine's own code (/shared/geometry.js). */
export const uvToCanvas = wallUvToCanvas;

/** The live texture preview is drawn at the output's resolution, capped to this many pixels (a phone stays smooth). */
const PREVIEW_MAX_PX = 700000;
/** Resolution of the Texture preview for an output: [scale, width, height] (the output's own, or less when huge). */
export function texturePreviewSize(P, o) {
  const scale = Math.min(o.scale, Math.sqrt(PREVIEW_MAX_PX / (P.canvas.width * P.canvas.height)));
  return [scale, Math.max(16, Math.round(P.canvas.width * scale)), Math.max(16, Math.round(P.canvas.height * scale))];
}

export class Workspace {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{edit:(mutate:Function,label:string)=>void, pick:(sel:object|null)=>void,
   *          hand:Function, changed:Function}} hooks
   */
  constructor(canvas, hooks) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.mode = 'live';
    this.tool = 'select';           // select | hand | zone | mask
    this.shape = 'rect';            // what the zone / mask tools draw: rect | polygon | circle
    this.zoneSpace = 'wall';        // Zones: draw on a wall (metres) or on the output canvas (pixels)
    this.poly = null;               // polygon being drawn {kind, space, wallId, pts}
    this.vertex = null;             // selected polygon vertex {id, k} (Delete removes it)
    this.mouse = null;              // last pointer position (rubber band of the polygon tool)
    this.focus = null;              // wall id in focus (null = all walls)
    this.snap = 0.01;               // metres (0 = off)
    this.selection = null;          // {kind:'wall'|'sensor'|'zone'|'mask'|'region', id, wallId?}
    this.showPoints = true;
    this.showContent = true;
    this.view = { s: 80, ox: 40, oy: 40 };
    this.fitKey = '';
    this.pointers = new Map();
    this.drag = null;
    this.ghost = null;              // in-progress edit {kind, id, value}
    this.coarse = matchMedia('(pointer:coarse)').matches;
    this.colors = { live: css('--live'), attn: css('--attn'), danger: css('--danger'), ok: css('--ok-ink') };
    this._bind();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ mode / focus

  get P() { return store.state?.profile; }
  get space() { return this.mode === 'mapping' || (this.mode === 'zones' && this.zoneSpace === 'canvas') || (this.mode === 'outputs' && this.texture) ? 'canvas' : 'wall'; }

  setZoneSpace(space) {
    if (this.zoneSpace === space) return;
    this.zoneSpace = space; this.poly = null; this.vertex = null; this.fitKey = '';
    if (this.selection?.kind === 'mask' && space === 'canvas') this.selection = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.poly = null; this.vertex = null;
    this.tool = mode === 'zones' ? 'select' : this.tool === 'hand' && ['live', 'sensors', 'zones', 'calibrate', 'outputs'].includes(mode) ? 'hand' : 'select';
    if (FOCUS_MODES.has(mode) && !this.focus) this.focus = this.selection?.wallId || this.P?.walls[0]?.id || null;
    if (!FOCUS_MODES.has(mode) && mode !== 'mapping' && ['live', 'room'].includes(mode)) { /* keep user's choice */ }
    this.fitKey = '';
  }

  setFocus(wallId) { this.focus = wallId; this.fitKey = ''; this.hooks.changed?.(); }

  walls() {
    const P = this.P;
    if (!P) return [];
    const list = this.focus && this.space === 'wall' ? P.walls.filter((w) => w.id === this.focus) : P.walls;
    let x = 0;
    let prev = null;
    return list.map((w) => {
      const wall = this.val('wall', w.id, w);
      if (prev) x += this._gap(prev, wall);
      const r = { wall, x0: x }; x += wall.width; prev = wall;
      return r;
    });
  }

  /** Space between two walls of the strip: in Live, consecutive walls joined by a continuous corner just touch. */
  _gap(a, b) {
    const W = this.P.walls, i = W.findIndex((q) => q.id === a.id);
    return this.mode === 'live' && W[i + 1]?.id === b.id && a.joinNext !== false ? SEAM : GAP;
  }

  /** Value of an object, overridden by the in-progress drag. */
  val(kind, id, orig) {
    const g = this.ghost;
    return g && g.kind === kind && g.id === id ? g.value : orig;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fitKey = '';
  }

  fit() {
    const P = this.P;
    if (!P || !this.w) return;
    const pad = this.coarse ? 24 : 36, top = 52;
    if (this.space === 'canvas') {
      const k = Math.min((this.w - pad * 2) / P.canvas.width, (this.h - pad - top) / P.canvas.height);
      this.view = { s: k, ox: (this.w - P.canvas.width * k) / 2, oy: top + (this.h - top - pad - P.canvas.height * k) / 2 };
      return;
    }
    const L = this.walls();
    if (!L.length) return;
    const totalW = L.at(-1).x0 + L.at(-1).wall.width;
    const maxH = Math.max(...L.map((l) => l.wall.height)) + 0.7; // room for sensors above the wall
    const loop = this._loops(L) ? 46 : 0; // room for the "↻" marks at both ends of a closed room
    const s = Math.min((this.w - (pad + loop) * 2) / totalW, (this.h - top - pad - 30) / maxH);
    this.view.s = Math.max(4, s);
    this.view.ox = (this.w - totalW * this.view.s) / 2;
    this.view.oy = top + (this.h - top - pad - 30 - maxH * this.view.s) / 2 + maxH * this.view.s;
  }

  // wall space: strip metres ↔ screen     canvas space: output pixels ↔ screen
  sx(x) { return this.view.ox + x * this.view.s; }
  sy(y) { return this.space === 'canvas' ? this.view.oy + y * this.view.s : this.view.oy - y * this.view.s; }
  toWorld(px, py) {
    return this.space === 'canvas' ? [(px - this.view.ox) / this.view.s, (py - this.view.oy) / this.view.s]
      : [(px - this.view.ox) / this.view.s, (this.view.oy - py) / this.view.s];
  }

  wallAt(px, py, pad = 0) {
    const [X, Y] = this.toWorld(px, py);
    for (const l of this.walls()) {
      const x = X - l.x0;
      if (x >= -pad && x <= l.wall.width + pad && Y >= -pad && Y <= l.wall.height + 0.8) return { l, x, y: Y };
    }
    return null;
  }

  snapM(v) { return this.snap ? r3(Math.round(v / this.snap) * this.snap) : r3(v); }

  sensorOrigin(s) {
    if (s.calibration?.matrix) return applyM(s.calibration.matrix, 0, 0);
    return [s.pose.x, s.pose.y];
  }

  /** All walls are shown and they close into a loop (the last corner joins the first wall). */
  _loops(L) {
    const P = this.P;
    return L.length === P.walls.length && L.length > 2 && P.walls.at(-1).joinNext !== false && roomCloses(P.walls);
  }

  // ------------------------------------------------------------------ hit testing

  handleSize() { return this.coarse ? 16 : 7; }

  /** Outline of a wall region in canvas px (works for rect, corners and grid). */
  outline(w, m) { return mappingOutline(m, this.val('pixelRect', w.id, w.pixelRect)); }

  hit(px, py) {
    const P = this.P;
    const L = this.walls();
    const hs = this.handleSize() + 4;
    const sel = this.selection;

    if (this.space === 'canvas') {
      if (this.mode === 'zones') return this._zoneHit(px, py);
      const order = [...P.walls].sort((a, b) => (sel?.id === b.id) - (sel?.id === a.id));
      for (const w of order) {
        const m = this.val('mapping', w.id, w.mapping);
        if (m.mode === 'grid') {
          if (sel?.id !== w.id) continue; // grid nodes are grabbable on the selected wall only
          for (let k = 0; k < m.points.length; k++) if (Math.hypot(this.sx(m.points[k][0]) - px, this.sy(m.points[k][1]) - py) <= hs) return { type: 'node', wall: w, k };
          continue;
        }
        const cs = m.mode === 'corners' ? m.corners : rectCorners(this.val('pixelRect', w.id, w.pixelRect));
        for (let k = 0; k < 4; k++) if (Math.hypot(this.sx(cs[k][0]) - px, this.sy(cs[k][1]) - py) <= hs) return { type: 'corner', wall: w, k };
      }
      const [X, Y] = this.toWorld(px, py);
      for (const w of order) {
        if (inPoly(X, Y, this.outline(w, this.val('mapping', w.id, w.mapping)))) return { type: 'region', wall: w, X, Y };
      }
      return null;
    }

    // handles of the selected zone / mask
    if (this.mode === 'zones') { const zh = this._zoneHandleHit(px, py); if (zh) return zh; }
    if (this.mode === 'sensors') {
      for (const s of P.sensors) {
        const l = L.find((q) => q.wall.id === s.wallId);
        if (!l) continue;
        const sv = this.val('sensor', s.id, s);
        const [ox, oy] = this.sensorOrigin(sv);
        const cx = this.sx(l.x0 + ox), cy = this.sy(oy);
        if (sel?.kind === 'sensor' && sel.id === s.id && !sv.calibration) {
          const [hx, hy] = this._rotHandle(sv, cx, cy);
          if (Math.hypot(hx - px, hy - py) <= hs + 2) return { type: 'rotate', sensor: s, l, cx, cy };
        }
        if (Math.hypot(cx - px, cy - py) <= (this.coarse ? 22 : 13)) return { type: 'sensor', sensor: s, l };
      }
    }
    if (this.mode === 'room') {
      for (const l of L) {
        const w = l.wall;
        if (Math.abs(this.sx(l.x0 + w.width) - px) <= hs && py <= this.sy(0) && py >= this.sy(w.height)) return { type: 'edgeW', l };
        if (Math.abs(this.sy(w.height) - py) <= hs && px >= this.sx(l.x0) && px <= this.sx(l.x0 + w.width)) return { type: 'edgeH', l };
      }
    }
    const at = this.wallAt(px, py);
    if (at && this.mode === 'zones') {
      const z = [...P.zones].reverse().find((q) => q.space !== 'canvas' && q.wallId === at.l.wall.id && pointInShape(at.x, at.y, this.val('zone', q.id, q)));
      if (z) return { type: 'zone', zone: z, l: at.l, at };
      const m = [...at.l.wall.masks].reverse().find((q) => pointInShape(at.x, at.y, this.val('mask', `${at.l.wall.id}/${q.id}`, q)));
      if (m) return { type: 'mask', mask: m, l: at.l, at };
    }
    if (at) return { type: 'wall', l: at.l, at };
    return null;
  }

  // ------------------------------------------------------------------ zones & masks (any shape, wall or canvas)

  /** Screen ↔ zone space: wall metres on a wall of the strip (y up), or output-canvas pixels (y down). */
  _tf(space, wallId) {
    if (space === 'canvas') {
      if (this.space !== 'canvas') return null;
      const c = this.P.canvas, st = this.snap * 100; // snap 1 / 5 / 10 cm → 1 / 5 / 10 px
      return { toS: (x, y) => [this.sx(x), this.sy(y)], toZ: (px, py) => this.toWorld(px, py), up: false, unit: 'px', round: r1,
        snap: (v) => (st ? Math.round(v / st) * st : r1(v)), bounds: { x0: 0, y0: 0, x1: c.width, y1: c.height } };
    }
    const l = this.space === 'wall' && this.walls().find((q) => q.wall.id === wallId);
    if (!l) return null;
    return { l, toS: (x, y) => [this.sx(l.x0 + x), this.sy(y)], toZ: (px, py) => { const [X, Y] = this.toWorld(px, py); return [X - l.x0, Y]; },
      up: true, unit: 'm', round: r3, snap: (v) => this.snapM(v), bounds: { x0: 0, y0: 0, x1: l.wall.width, y1: l.wall.height } };
  }

  /** The selected zone or mask as it is edited now (ghost included), if it can be edited in this space. */
  _selObj() {
    const sel = this.selection, P = this.P;
    if (sel?.kind === 'zone') {
      const z = P.zones.find((q) => q.id === sel.id);
      const tf = z && this._tf(z.space === 'canvas' ? 'canvas' : 'wall', z.wallId);
      return tf ? { obj: this.val('zone', z.id, z), orig: z, isZone: true, ghostId: z.id, tf } : null;
    }
    if (sel?.kind === 'mask') {
      const w = P.walls.find((q) => q.id === sel.wallId);
      const m = w?.masks.find((q) => q.id === sel.id);
      const tf = m && this._tf('wall', w.id);
      return tf ? { obj: this.val('mask', `${w.id}/${m.id}`, m), orig: m, isZone: false, ghostId: `${w.id}/${m.id}`, tf } : null;
    }
    return null;
  }

  /** Handles of a shape, in screen px: rect 8 (i/j = left…right / top…bottom ON SCREEN), circle 4, polygon vertices + midpoints. */
  _handles(so) {
    const g = geomOf(so.obj), out = [], toS = so.tf.toS;
    if (g.kind === 'polygon') {
      const n = g.points.length;
      g.points.forEach(([x, y], k) => { const [hx, hy] = toS(x, y); out.push({ type: 'vertex', k, px: hx, py: hy }); });
      g.points.forEach(([x, y], k) => { const [x2, y2] = g.points[(k + 1) % n]; const [hx, hy] = toS((x + x2) / 2, (y + y2) / 2); out.push({ type: 'mid', k, px: hx, py: hy }); });
    } else if (g.kind === 'circle') {
      const c = g.circle;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const [hx, hy] = toS(c.x + dx * c.r, c.y + dy * c.r); out.push({ type: 'radius', px: hx, py: hy }); }
    } else {
      const [ax, ay] = toS(g.rect.x0, g.rect.y0), [bx, by] = toS(g.rect.x1, g.rect.y1);
      const xs = [Math.min(ax, bx), (ax + bx) / 2, Math.max(ax, bx)], ys = [Math.min(ay, by), (ay + by) / 2, Math.max(ay, by)];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!(i === 1 && j === 1)) out.push({ type: 'handle', i, j, px: xs[i], py: ys[j] });
    }
    return out;
  }

  _zoneHandleHit(px, py) {
    const so = this._selObj();
    if (!so) return null;
    const hs = this.handleSize() + 4;
    const list = this._handles(so).sort((a, b) => (a.type === 'mid') - (b.type === 'mid')); // vertices win over midpoints
    for (const h of list) if (Math.abs(h.px - px) <= hs && Math.abs(h.py - py) <= hs) return { type: 'handle', h, so };
    return null;
  }

  /** Zones tool on the output canvas: handles, then canvas zones, then the wall under the pointer (virtual hand). */
  _zoneHit(px, py) {
    const zh = this._zoneHandleHit(px, py);
    if (zh) return zh;
    const [X, Y] = this.toWorld(px, py);
    const z = [...this.P.zones].reverse().find((q) => q.space === 'canvas' && pointInShape(X, Y, this.val('zone', q.id, q)));
    if (z) return { type: 'zone', zone: z, at: { x: X, y: Y } };
    const cw = this._wallAtCanvas(X, Y);
    return cw ? { type: 'cwall', ...cw } : null;
  }

  /** Wall under a canvas pixel and the point there in wall metres (through the mapping). */
  _wallAtCanvas(X, Y) {
    for (const w of this.P.walls) {
      if (!inPoly(X, Y, this.outline(w, w.mapping))) continue;
      const [u, v] = canvasToUv(w, X, Y);
      return { wall: w, x: clamp(u, 0, 1) * w.width, y: (1 - clamp(v, 0, 1)) * w.height };
    }
    return null;
  }

  _ghostGeom(so, g) {
    this.ghost = { kind: so.isZone ? 'zone' : 'mask', id: so.ghostId, value: withGeom(so.orig, g, so.isZone) };
  }

  /** Save a zone / mask geometry (from a ghost-shaped {kind, id, value}). */
  _commitGeom(gh, label) {
    const isZ = gh.kind === 'zone';
    const geom = geomOf(gh.value);
    return this.hooks.edit((P) => {
      let t;
      if (isZ) t = P.zones.find((q) => q.id === gh.id);
      else { const [wid, mid] = gh.id.split('/'); t = P.walls.find((w) => w.id === wid)?.masks.find((q) => q.id === mid); }
      if (t) assignGeom(t, geom, isZ);
    }, label);
  }

  /** Remove a vertex of the selected polygon (keeps at least 3). */
  deleteVertex(k = this.vertex?.k) {
    const so = this._selObj();
    if (!so || this.vertex?.id !== this.selection?.id || kindOf(so.orig) !== 'polygon' || k === undefined || so.orig.points.length <= 3) return false;
    const pts = so.orig.points.filter((_, i) => i !== k);
    this.vertex = null;
    this._commitGeom({ kind: so.isZone ? 'zone' : 'mask', id: so.ghostId, value: withGeom(so.orig, { kind: 'polygon', points: pts }, so.isZone) }, 'delete point');
    return true;
  }

  /** Geometry of a rect / circle being drawn (null while too small to keep, unless `loose`). */
  _drawnGeom(d, loose = false) {
    const [ax, ay] = d.a, [bx, by] = d.b;
    const min = d.space === 'canvas' ? 4 : 0.04;
    if (d.shape === 'circle') {
      const r = d.tf.round(Math.hypot(bx - ax, by - ay));
      return loose || r >= min / 2 ? { kind: 'circle', circle: { x: ax, y: ay, r: Math.max(r, 1e-3) } } : null;
    }
    const r = normRect({ x0: ax, y0: ay, x1: bx, y1: by });
    return loose || (r.x1 - r.x0 >= min && r.y1 - r.y0 >= min) ? { kind: 'rect', rect: r } : null;
  }

  // polygon tool: each click adds a point; the first point, a double-click, Enter or "Finish" closes it
  _polyClick(px, py) {
    let tf;
    if (this.poly) {
      tf = this._tf(this.poly.space, this.poly.wallId);
      if (!tf) { this.poly = null; return; }
      const pts = this.poly.pts;
      if (pts.length >= 3) { const [fx, fy] = tf.toS(...pts[0]); if (Math.hypot(fx - px, fy - py) <= this.handleSize() + 6) { this.finishPoly(); return; } }
    } else {
      const canvas = this.space === 'canvas';
      let wallId = null;
      if (canvas) tf = this._tf('canvas');
      else { const at = this.wallAt(px, py); if (!at || at.y > at.l.wall.height) return; wallId = at.l.wall.id; tf = this._tf('wall', wallId); }
      if (!tf) return;
      this.poly = { kind: this.tool, space: canvas ? 'canvas' : 'wall', wallId, pts: [] };
    }
    const [zx, zy] = tf.toZ(px, py);
    const x = clamp(tf.snap(zx), tf.bounds.x0, tf.bounds.x1), y = clamp(tf.snap(zy), tf.bounds.y0, tf.bounds.y1);
    const last = this.poly.pts.at(-1);
    if (last && Math.abs(last[0] - x) < 1e-6 && Math.abs(last[1] - y) < 1e-6) return;
    this.poly.pts.push([x, y]);
    if (this.poly.pts.length >= 64) { this.finishPoly(); return; }
    this.hooks.changed?.();
  }

  finishPoly() {
    const q = this.poly;
    this.poly = null;
    if (q && q.pts.length >= 3 && Math.abs(polygonArea(q.pts)) > (q.space === 'canvas' ? 16 : 0.0016)) {
      this.hooks.draw(q.kind, { space: q.space, wallId: q.wallId, geom: { kind: 'polygon', points: q.pts } });
    }
    this.hooks.changed?.();
  }

  undoPolyPoint() { if (!this.poly) return; this.poly.pts.pop(); if (!this.poly.pts.length) this.poly = null; this.hooks.changed?.(); }
  cancelPoly() { if (!this.poly) return false; this.poly = null; this.hooks.changed?.(); return true; }

  /** Virtual hand on the output canvas: it lands on the wall under the pointer, through the Mapping. */
  _canvasHand(e, px, py) {
    const cw = this._wallAtCanvas(...this.toWorld(px, py));
    if (cw) { this.drag = { type: 'chand', wallId: cw.wall.id, handId: `ui${e.pointerId}` }; this.hooks.hand(cw.wall.id, cw.x, cw.y, 'down', this.drag.handId); }
  }

  /** Pointer down in Zones: draw tools, handles, bodies. Returns true when it took the gesture. */
  _zoneDown(e, h, px, py) {
    const canvas = this.space === 'canvas';
    if (this.tool === 'hand') {
      if (!canvas) return false;
      this._canvasHand(e, px, py);
      return true;
    }
    if (this.tool === 'zone' || this.tool === 'mask') {
      if (canvas && this.tool === 'mask') return true; // masks live on walls (they act on the LiDAR data)
      const shape = this.tool === 'mask' && this.shape === 'circle' ? 'rect' : this.shape;
      if (shape === 'polygon') { this.drag = { type: 'pan', h, start: this.toWorld(px, py), poly: true }; return true; } // a click adds a point
      const tf = canvas ? this._tf('canvas') : h?.l ? this._tf('wall', h.l.wall.id) : null;
      if (!tf) return true;
      const [zx, zy] = tf.toZ(px, py);
      const a = [clamp(tf.snap(zx), tf.bounds.x0, tf.bounds.x1), clamp(tf.snap(zy), tf.bounds.y0, tf.bounds.y1)];
      this.drag = { type: 'draw', kind: this.tool, shape, tf, space: canvas ? 'canvas' : 'wall', wallId: tf.l?.wall.id ?? null, a, b: a.slice() };
      return true;
    }
    if (h?.type === 'handle') {
      this.drag = { type: 'reshape', so: h.so, g0: geomOf(h.so.obj), hd: h.h };
      this.vertex = h.h.type === 'vertex' ? { id: this.selection.id, k: h.h.k } : null;
      this.hooks.changed?.();
      return true;
    }
    if (h?.type === 'zone' || h?.type === 'mask') {
      const isZ = h.type === 'zone';
      const obj = isZ ? h.zone : h.mask;
      this.selection = { kind: h.type, id: obj.id, wallId: isZ ? obj.wallId : h.l.wall.id };
      this.vertex = null;
      this.hooks.pick(this.selection);
      const so = this._selObj();
      if (so) this.drag = { type: 'move', so, g0: geomOf(so.obj), start: so.tf.toZ(px, py) };
      return true;
    }
    return false;
  }

  _reshape(d, px, py) {
    const tf = d.so.tf, B = tf.bounds, hd = d.hd;
    const [zx, zy] = tf.toZ(px, py);
    const x = clamp(tf.snap(zx), B.x0, B.x1), y = clamp(tf.snap(zy), B.y0, B.y1);
    if (hd.type === 'mid') {
      // dragging a midpoint inserts a point there; from then on it is that point
      const pts = d.g0.points.map((q) => q.slice());
      pts.splice(hd.k + 1, 0, [x, y]);
      d.g0 = { kind: 'polygon', points: pts };
      d.hd = { type: 'vertex', k: hd.k + 1, added: true };
      this.vertex = { id: this.selection.id, k: hd.k + 1 };
    }
    const g0 = d.g0, h2 = d.hd;
    let g;
    if (h2.type === 'vertex') {
      const pts = g0.points.map((q) => q.slice());
      pts[h2.k] = [x, y];
      g = { kind: 'polygon', points: pts };
    } else if (h2.type === 'radius') {
      const c = g0.circle, minR = tf.unit === 'px' ? 2 : 0.02;
      g = { kind: 'circle', circle: { ...c, r: tf.round(Math.max(minR, Math.hypot(zx - c.x, zy - c.y))) } };
    } else {
      // rect: screen left/right/top/bottom → zone edges (on a wall y points up, so the top edge is y1)
      const r = { ...g0.rect }, min = tf.unit === 'px' ? 2 : 0.02;
      if (h2.i === 0) r.x0 = Math.min(x, r.x1 - min);
      if (h2.i === 2) r.x1 = Math.max(x, r.x0 + min);
      const top = h2.j === 0, bottom = h2.j === 2;
      if ((top && tf.up) || (bottom && !tf.up)) r.y1 = Math.max(y, r.y0 + min);
      if ((bottom && tf.up) || (top && !tf.up)) r.y0 = Math.min(y, r.y1 - min);
      g = { kind: 'rect', rect: r };
    }
    this._ghostGeom(d.so, g);
  }

  _rotHandle(s, cx, cy) {
    const a = (s.pose.rotation * Math.PI) / 180;
    const R = this.coarse ? 56 : 42;
    return [cx + Math.cos(a) * R, cy - Math.sin(a) * R];
  }

  // ------------------------------------------------------------------ input

  _bind() {
    const c = this.c;
    c.addEventListener('wheel', (e) => { e.preventDefault(); this._zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e, true));
    c.addEventListener('dblclick', (e) => {
      if (this.poly) { this.finishPoly(); return; }
      if (this.mode === 'zones') {
        const h = this.hit(e.offsetX, e.offsetY);
        if (h?.type === 'handle' && h.h.type === 'vertex') { this.vertex = { id: this.selection.id, k: h.h.k }; this.deleteVertex(h.h.k); return; }
        if (this.tool !== 'select' && this.tool !== 'hand') return;
      }
      this.fitKey = '';
    });
    c.addEventListener('pointermove', (e) => { this.mouse = [e.offsetX, e.offsetY]; if (!this.pointers.size) this._hover(e.offsetX, e.offsetY); });
    c.addEventListener('pointerleave', () => { this.mouse = null; });
  }

  _hover(px, py) {
    const h = this.hit(px, py);
    const cur = h?.type === 'handle' && h.h ? ({ vertex: 'move', mid: 'copy', radius: 'ew-resize' }[h.h.type] || 'nwse-resize')
      : { handle: 'nwse-resize', corner: 'move', region: 'grab', rotate: 'grab', sensor: 'grab', zone: 'grab', mask: 'grab', edgeW: 'ew-resize', edgeH: 'ns-resize' }[h?.type];
    this.c.style.cursor = this.tool === 'zone' || this.tool === 'mask' ? 'crosshair' : this.tool === 'hand' ? 'pointer' : cur || 'default';
    this.hoverHit = h;
  }

  _zoomAt(px, py, k) {
    const s2 = Math.min(this.space === 'canvas' ? 50 : 3000, Math.max(this.space === 'canvas' ? 0.02 : 4, this.view.s * k));
    const kk = s2 / this.view.s;
    this.view.ox = px - (px - this.view.ox) * kk;
    this.view.oy = py - (py - this.view.oy) * kk;
    this.view.s = s2;
  }

  _down(e) {
    try { this.c.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    // The first finger (or the mouse) starts a fresh gesture: drop pointers whose "up" was lost,
    // otherwise this press would be taken as the second finger of a pinch.
    if (e.isPrimary) { this.pointers.clear(); this.drag = null; this.ghost = null; }
    const px = e.offsetX, py = e.offsetY;
    const p = { x: px, y: py, x0: px, y0: py, moved: false };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) { this._cancelDrag(); for (const q of this.pointers.values()) q.pinch = true; return; }
    const h = this.hit(px, py);
    const sel = (w) => this.selection?.kind === 'wall' && this.selection.id === w.id;
    this.drag = { type: 'pan', h, start: this.toWorld(px, py), shift: e.shiftKey };

    if (this.mode === 'zones') {
      if (this._zoneDown(e, h, px, py)) return;
      if (this.space === 'canvas') return; // canvas zones: everything else pans
    }
    if (this.mode === 'outputs') {
      // the texture preview is read-only: the virtual hand touches, anything else pans
      if (this.tool === 'hand' && this.space === 'canvas') this._canvasHand(e, px, py);
      return;
    }
    if (this.space === 'canvas') {
      // grid tools: click inside the selected grid wall to insert a row / column there
      if ((this.tool === 'addrow' || this.tool === 'addcol') && h?.type === 'region' && h.wall.mapping.mode === 'grid' && sel(h.wall)) {
        const g = h.wall.mapping;
        const uv = invertMap((u, v) => gridMap(g, u, v), h.X, h.Y);
        if (uv) {
          const ng = gridInsert(g, this.tool === 'addcol' ? 'u' : 'v', Math.round((this.tool === 'addcol' ? uv[0] : uv[1]) * 1000) / 1000);
          if (ng !== g) this.hooks.edit((Q) => { Q.walls.find((q) => q.id === h.wall.id).mapping = { mode: 'grid', ...ng }; }, this.tool === 'addcol' ? 'add grid column' : 'add grid row');
        }
        this.drag = null;
        return;
      }
      if (h?.type === 'node') {
        this.node = { wallId: h.wall.id, k: h.k };
        this.drag = { type: 'node', h, wall: h.wall, map0: structuredClone(h.wall.mapping) };
        this.hooks.changed?.();
        return;
      }
      if (h?.type === 'corner' || h?.type === 'region') {
        if (!sel(h.wall)) { this.node = null; this.selection = { kind: 'wall', id: h.wall.id, wallId: h.wall.id }; this.hooks.pick(this.selection); }
        this.drag = { type: h.type, h, start: this.toWorld(px, py), wall: h.wall, map0: structuredClone(h.wall.mapping), rect0: { ...h.wall.pixelRect } };
      }
      return;
    }
    if (this.tool === 'hand' && h?.type && h.at && h.at.y <= h.l.wall.height) {
      this.drag = { type: 'hand', wallId: h.l.wall.id, handId: `ui${e.pointerId}` };
      this.hooks.hand(h.l.wall.id, h.at.x, h.at.y, 'down', this.drag.handId);
      return;
    }
    if (h?.type === 'sensor') {
      this.selection = { kind: 'sensor', id: h.sensor.id, wallId: h.sensor.wallId };
      this.hooks.pick(this.selection);
      if (!h.sensor.calibration) this.drag = { type: 'sensor', s: h.sensor, l: h.l, start: this.toWorld(px, py), pose0: { ...h.sensor.pose } };
      return;
    }
    if (h?.type === 'rotate') { this.drag = { type: 'rotate', s: h.sensor, l: h.l, cx: h.cx, cy: h.cy }; return; }
    if (h?.type === 'edgeW' || h?.type === 'edgeH') { this.drag = { type: h.type, l: h.l, w0: { ...h.l.wall } }; return; }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const px = e.offsetX, py = e.offsetY;
    const dx = px - p.x, dy = py - p.y;
    if (Math.hypot(px - p.x0, py - p.y0) > 4) p.moved = true;
    if (p.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = px; p.y = py;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 0) this._zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, after / before);
      this.view.ox += dx / 2; this.view.oy += dy / 2;
      return;
    }
    p.x = px; p.y = py;
    const d = this.drag;
    if (!d) return;
    const [X, Y] = this.toWorld(px, py);
    const P = this.P;
    switch (d.type) {
      case 'pan': if (p.moved) { this.view.ox += dx; this.view.oy += dy; } break;
      case 'hand': {
        const l = this.walls().find((q) => q.wall.id === d.wallId);
        if (l) this.hooks.hand(d.wallId, clamp(X - l.x0, 0, l.wall.width), clamp(Y, 0, l.wall.height), 'move', d.handId);
        break;
      }
      case 'draw': {
        const tf = d.tf, B = tf.bounds;
        const [zx, zy] = tf.toZ(px, py);
        d.b = [clamp(tf.snap(zx), B.x0, B.x1), clamp(tf.snap(zy), B.y0, B.y1)];
        break;
      }
      case 'move': {
        if (!p.moved) break;
        const tf = d.so.tf, B = tf.bounds, b = boundsOfGeom(d.g0);
        const [zx, zy] = tf.toZ(px, py);
        const dx = clamp(tf.snap(zx - d.start[0]), B.x0 - b.x0, B.x1 - b.x1), dy = clamp(tf.snap(zy - d.start[1]), B.y0 - b.y0, B.y1 - b.y1);
        this._ghostGeom(d.so, translateGeom(d.g0, dx, dy, tf.round));
        break;
      }
      case 'reshape': if (p.moved || d.hd.type !== 'mid') this._reshape(d, px, py); break;
      case 'chand': {
        const cw = this._wallAtCanvas(X, Y);
        if (!cw) break;
        if (cw.wall.id !== d.wallId) { this.hooks.hand(d.wallId, 0, 0, 'up', d.handId); d.wallId = cw.wall.id; this.hooks.hand(d.wallId, cw.x, cw.y, 'down', d.handId); }
        else this.hooks.hand(d.wallId, cw.x, cw.y, 'move', d.handId);
        break;
      }
      case 'sensor': {
        if (!p.moved) break;
        const pose = { ...d.pose0, x: this.snapM(d.pose0.x + X - d.start[0]), y: this.snapM(d.pose0.y + Y - d.start[1]) };
        this.ghost = { kind: 'sensor', id: d.s.id, value: { ...d.s, pose } };
        break;
      }
      case 'rotate': {
        let a = (Math.atan2(-(py - d.cy), px - d.cx) * 180) / Math.PI;
        a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a * 4) / 4;
        this.ghost = { kind: 'sensor', id: d.s.id, value: { ...d.s, pose: { ...d.s.pose, rotation: a } } };
        break;
      }
      case 'edgeW': case 'edgeH': {
        const w = { ...d.w0 };
        if (d.type === 'edgeW') w.width = Math.max(0.5, this.snapM(X - d.l.x0)); else w.height = Math.max(0.5, this.snapM(Y));
        this.ghost = { kind: 'wall', id: w.id, value: w };
        break;
      }
      case 'node': {
        if (!p.moved) break;
        const pts = d.map0.points.map((q) => q.slice());
        pts[d.h.k] = [Math.round(X * 2) / 2, Math.round(Y * 2) / 2];
        this.ghost = { kind: 'mapping', id: d.wall.id, value: { ...d.map0, points: pts } };
        break;
      }
      case 'corner': case 'region': {
        if (!p.moved) break;
        const [sx0, sy0] = d.start;
        const ddx = Math.round(X - sx0), ddy = Math.round(Y - sy0);
        const cw = P.canvas.width, ch = P.canvas.height;
        const snapEdge = (v, max) => { const t = 12 / this.view.s; return Math.abs(v) < t ? 0 : Math.abs(v - max) < t ? max : v; };
        if (d.map0.mode === 'grid') {
          this.ghost = { kind: 'mapping', id: d.wall.id, value: { ...d.map0, points: d.map0.points.map(([x, y]) => [x + ddx, y + ddy]) } };
        } else if (d.map0.mode === 'corners') {
          const cs = d.map0.corners.map((c) => c.slice());
          if (d.type === 'corner') cs[d.h.k] = [snapEdge(Math.round(X), cw), snapEdge(Math.round(Y), ch)];
          else for (const c of cs) { c[0] += ddx; c[1] += ddy; }
          this.ghost = { kind: 'mapping', id: d.wall.id, value: { mode: 'corners', corners: cs } };
        } else {
          let { x, y, w, h } = d.rect0;
          if (d.type === 'region') { x = snapEdge(x + ddx, cw - w); y = snapEdge(y + ddy, ch - h); }
          else {
            const k = d.h.k; // 0 TL 1 TR 2 BR 3 BL — the opposite corner stays put
            const fx = k === 0 || k === 3 ? x + w : x, fy = k === 0 || k === 1 ? y + h : y;
            const nx = snapEdge(Math.round(X), cw), ny = snapEdge(Math.round(Y), ch);
            x = Math.min(fx, nx); y = Math.min(fy, ny); w = Math.max(1, Math.abs(nx - fx)); h = Math.max(1, Math.abs(ny - fy));
          }
          const pr = { x, y, w, h };
          this.ghost = { kind: 'pixelRect', id: d.wall.id, value: pr };
          this._ghostMap = { kind: 'mapping', id: d.wall.id, value: { mode: 'rect', corners: rectCorners(pr) } };
        }
        break;
      }
      default: break;
    }
  }

  _cancelDrag() {
    if (this.drag?.type === 'hand' || this.drag?.type === 'chand') this.hooks.hand(this.drag.wallId, 0, 0, 'up', this.drag.handId);
    this.drag = null; this.ghost = null; this._ghostMap = null;
  }

  _up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!p || !d || p.pinch) { if (!this.pointers.size) this.drag = null; return; }
    this.drag = null;
    const g = this.ghost;
    this.ghost = null;
    const gm = this._ghostMap; this._ghostMap = null;
    if (cancelled) return;
    const H = this.hooks;
    switch (d.type) {
      case 'hand': case 'chand': H.hand(d.wallId, 0, 0, 'up', d.handId); break;
      case 'draw': {
        const geom = this._drawnGeom(d);
        if (geom) H.draw(d.kind, { space: d.space, wallId: d.wallId, geom });
        break;
      }
      case 'move': case 'reshape':
        if (g) {
          const what = g.kind === 'zone' ? 'zone' : 'mask';
          const label = d.type === 'move' ? `move ${what}` : d.hd.added ? 'add point' : d.hd.type === 'vertex' ? 'move point' : `resize ${what}`;
          this._commitGeom(g, label);
        }
        break;
      case 'sensor': case 'rotate':
        if (g) H.edit((P) => { P.sensors.find((q) => q.id === g.id).pose = g.value.pose; }, d.type === 'rotate' ? 'rotate sensor' : 'move sensor');
        break;
      case 'edgeW': case 'edgeH':
        if (g) H.edit((P) => { const w = P.walls.find((q) => q.id === g.id); w.width = g.value.width; w.height = g.value.height; }, 'resize wall');
        break;
      case 'node':
        if (g) H.edit((P) => { P.walls.find((q) => q.id === g.id).mapping = g.value; }, 'move grid node');
        break;
      case 'corner': case 'region':
        if (g?.kind === 'mapping') H.edit((P) => { P.walls.find((q) => q.id === g.id).mapping = g.value; }, d.type === 'corner' ? 'move corner' : 'move wall region');
        else if (g?.kind === 'pixelRect') H.edit((P) => { const w = P.walls.find((q) => q.id === g.id); w.pixelRect = g.value; w.mapping = { mode: 'rect' }; }, 'move wall region');
        break;
      case 'pan':
        if (!p.moved && d.poly) this._polyClick(p.x, p.y);
        else if (!p.moved) this._click(d.h);
        break;
      default: break;
    }
    void gm;
  }

  _click(h) {
    if (!h) { this.selection = null; this.hooks.pick(null); return; }
    if (h.type === 'wall') { this.selection = { kind: 'wall', id: h.l.wall.id, wallId: h.l.wall.id }; this.hooks.pick(this.selection); }
  }

  /** Arrow-key nudge of the selection. */
  nudge(dx, dy, big) {
    const sel = this.selection, P = this.P;
    if (!sel) return false;
    const st = (this.snap || 0.01) * (big ? 10 : 1);
    if (this.space === 'canvas' && sel.kind === 'wall') {
      const k = big ? 10 : 1;
      const node = this.node?.wallId === sel.id ? this.node.k : -1;
      this.hooks.edit((Q) => {
        const w = Q.walls.find((q) => q.id === sel.id);
        if (w.mapping.mode === 'grid' && node >= 0) { const p = w.mapping.points[node]; w.mapping.points[node] = [p[0] + dx * k, p[1] + dy * k]; }
        else if (w.mapping.mode === 'grid') w.mapping.points = w.mapping.points.map(([x, y]) => [x + dx * k, y + dy * k]);
        else if (w.mapping.mode === 'corners') w.mapping.corners = w.mapping.corners.map(([x, y]) => [x + dx * k, y + dy * k]);
        else { w.pixelRect.x += dx * k; w.pixelRect.y += dy * k; w.mapping = { mode: 'rect' }; }
      }, 'nudge wall region');
      return true;
    }
    if (sel.kind === 'zone' || sel.kind === 'mask') {
      const so = this._selObj();
      if (!so) return false;
      const px = so.tf.unit === 'px', step = px ? (big ? 10 : 1) : st;
      // arrow up = +y on a wall (y up), −y on the canvas (y down)
      const g = translateGeom(geomOf(so.orig), dx * step, (px ? dy : -dy) * step, so.tf.round);
      this._commitGeom({ kind: so.isZone ? 'zone' : 'mask', id: so.ghostId, value: withGeom(so.orig, g, so.isZone) }, `nudge ${sel.kind}`);
      return true;
    }
    if (sel.kind === 'sensor') { this.hooks.edit((Q) => { const s = Q.sensors.find((q) => q.id === sel.id); s.pose.x = r3(s.pose.x + dx * st); s.pose.y = r3(s.pose.y - dy * st); }, 'nudge sensor'); return true; }
    void P;
    return false;
  }

  // ------------------------------------------------------------------ drawing

  draw() {
    if (this.suspended) return; // the 3D view is on top
    const ctx = this.ctx, P = this.P;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!P) return;
    const key = `${this.mode}|${this.space}|${this.focus}|${this.w}x${this.h}|${P.id}|${P.walls.map((w) => w.id).join(',')}|${P.canvas.width}x${P.canvas.height}`;
    // never re-frame in the middle of a drag: the drag maths would jump
    if (key !== this.fitKey && !this.drag) { this.fitKey = key; this.fit(); }
    if (this.mode === 'outputs' && this.texture) return this._drawTexture();
    if (this.space === 'canvas') return this._drawCanvas();
    this._drawWalls();
  }

  /** The content image (a frame of the output canvas), loaded when its URL changes. */
  underlay() {
    const u = store.state?.underlay?.url;
    if (!this.showContent || !u) return null;
    if (this._ulUrl !== u) {
      this._ulUrl = u; this._ul = null;
      const img = new Image();
      img.onload = () => { if (this._ulUrl === u) this._ul = img; };
      img.src = u;
    }
    return this._ul;
  }

  _drawWalls() {
    const ctx = this.ctx, P = this.P, s = this.view.s, C = this.colors;
    const L = this.walls();
    const ul = this.underlay();
    if (ul) {
      // each wall shows ITS part of the content (its pixel region; corner/grid maps use the bounding box)
      const kx = ul.naturalWidth / P.canvas.width, ky = ul.naturalHeight / P.canvas.height;
      ctx.save(); ctx.globalAlpha = 0.5;
      for (const l of L) {
        const r = l.wall.pixelRect;
        ctx.drawImage(ul, r.x * kx, r.y * ky, r.w * kx, r.h * ky, this.sx(l.x0), this.sy(l.wall.height), l.wall.width * s, l.wall.height * s);
      }
      ctx.restore();
    }
    const live = store.live?.walls || {};
    const calib = store.status?.calib;
    const sel = this.selection;
    const M = this.mode;
    const zonesActive = M === 'zones', sensorsActive = M === 'sensors';
    const labelled = new Set(); // canvas zones already labelled this frame

    for (const l of L) {
      const w = l.wall;
      const X = (x) => this.sx(l.x0 + x), Y = (y) => this.sy(y);
      const selW = sel?.kind === 'wall' && sel.id === w.id;
      ctx.fillStyle = ul ? 'rgba(22,22,22,0.35)' : '#161616'; // translucent over the content image
      ctx.fillRect(X(0), Y(w.height), w.width * s, w.height * s);
      const step = s > 120 ? 0.1 : 0.5;
      for (let gx = step; gx < w.width - 1e-6; gx += step) { ctx.strokeStyle = Math.abs(gx % 1) < 1e-6 || Math.abs(gx % 1 - 1) < 1e-6 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.035)'; line(ctx, X(gx), Y(0), X(gx), Y(w.height)); }
      for (let gy = step; gy < w.height - 1e-6; gy += step) { ctx.strokeStyle = Math.abs(gy % 1) < 1e-6 || Math.abs(gy % 1 - 1) < 1e-6 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.035)'; line(ctx, X(0), Y(gy), X(w.width), Y(gy)); }
      ctx.strokeStyle = selW ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = selW ? 1.5 : 1;
      ctx.strokeRect(X(0) + 0.5, Y(w.height) + 0.5, w.width * s, w.height * s);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      line(ctx, X(-0.25), Y(0), X(w.width + 0.25), Y(0));
      // labels under the wall — only what fits in its width (narrow walls used to write over their neighbours)
      ctx.font = '500 11px Geist, system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const room = w.width * s - 6;
      const fit = (...options) => options.find((t) => ctx.measureText(t).width <= room) ?? '';
      ctx.fillStyle = w.enabled ? '#B8B8B8' : '#6D6D6D';
      ctx.fillText(fit(`${w.id}  ${w.name}`, w.id), X(0), Y(0) + 7);
      ctx.fillStyle = '#6D6D6D';
      const count = (live[w.id] || []).length;
      const touches = count ? ` · ${count} touch${count > 1 ? 'es' : ''}` : '';
      const dims = fit(`${w.width.toFixed(2)} × ${w.height.toFixed(2)} m${touches}`, `${w.width.toFixed(2)} m${touches}`, `${w.width.toFixed(1)} m`, '');
      const plain = dims.endsWith(touches) && touches ? dims.slice(0, -touches.length) : dims;
      ctx.fillText(plain, X(0), Y(0) + 21);
      // touch count right after the size (walls of a continuous strip touch: nothing at their right end)
      if (touches && dims.endsWith(touches)) { ctx.fillStyle = C.live; ctx.fillText(touches, X(0) + ctx.measureText(plain).width, Y(0) + 21); }

      // room mode: resize handles + dimensions
      if (M === 'room') {
        ctx.fillStyle = C.attn;
        // handles scale down with the wall on screen (on a phone the whole room is small: they covered it)
        const hs = this.handleSize(), len = Math.min(hs * 3, (w.height * s) / 3, (w.width * s) / 3), th = Math.min(hs, len / 2);
        ctx.fillRect(X(w.width) - th / 2, Y(w.height / 2) - len / 2, th, len);
        ctx.fillRect(X(w.width / 2) - len / 2, Y(w.height) - th / 2, len, th);
        // the precise width only where it does not run into the sensor label (the short one is under the wall)
        if (w.width * s > 170) { ctx.fillStyle = '#8C8C8C'; ctx.fillText(`${w.width.toFixed(3)} m`, X(0) + 2, Y(w.height) - 18); }
      }

      // masks (hatched)
      for (const m0 of w.masks) {
        const m = this.val('mask', `${w.id}/${m0.id}`, m0);
        const on = zonesActive;
        const pts = shapeOutline(m).map(([x, y]) => [X(x), Y(y)]);
        tracePath(ctx, pts);
        ctx.fillStyle = on ? 'rgba(224,108,108,0.12)' : 'rgba(224,108,108,0.05)'; ctx.fill();
        hatchPath(ctx, pts, on ? 'rgba(224,108,108,0.30)' : 'rgba(224,108,108,0.12)');
        tracePath(ctx, pts);
        ctx.strokeStyle = on ? 'rgba(224,108,108,0.7)' : 'rgba(224,108,108,0.3)';
        ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
        if (on) { const b = boxOf(pts); ctx.fillStyle = 'rgba(224,108,108,0.9)'; ctx.font = '500 10px Geist, system-ui'; ctx.fillText(m0.name, b.x0 + 4, b.y0 + 4); }
      }
      // zones of this wall, and canvas zones that reach it (dashed: they are edited on the canvas)
      ctx.save();
      ctx.beginPath(); ctx.rect(X(0), Y(w.height), w.width * s, w.height * s); ctx.clip();
      for (const z0 of P.zones) {
        const onCanvas = z0.space === 'canvas';
        if (onCanvas ? !(z0.walls || []).includes(w.id) : z0.wallId !== w.id) continue;
        const z = this.val('zone', z0.id, z0);
        const pts = (onCanvas ? canvasZoneOnWall(z, w) : shapeOutline(z, 48)).map(([x, y]) => [X(x), Y(y)]);
        // a canvas zone reaching several walls gets its label once (it used to read "Corner P1-P2 Corner P1-P2")
        const label = !onCanvas || !labelled.has(z.id);
        if (onCanvas) labelled.add(z.id);
        this._drawZoneShape(z, pts, { dim: !zonesActive && M !== 'live', dashed: onCanvas, sel: sel?.kind === 'zone' && sel.id === z.id, clip: { x0: X(0), y0: Y(w.height) }, label });
      }
      ctx.restore();
    }
    // a closed room: the strip's two ends are the same corner (P3 ↻ P4)
    if (this._loops(L)) {
      const a = L.at(-1), b = L[0], ym = this.sy(Math.min(a.wall.height, b.wall.height) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.setLineDash([3, 3]);
      const xr = this.sx(a.x0 + a.wall.width), xl = this.sx(b.x0);
      line(ctx, xr + 2, ym, xr + 18, ym); line(ctx, xl - 18, ym, xl - 2, ym); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText(`↻ ${b.wall.id}`, xr + 21, ym);
      ctx.textAlign = 'right'; ctx.fillText(`${a.wall.id} ↻`, xl - 21, ym);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    // continuous corners: a small link between consecutive walls of the strip (Live draws them touching instead)
    for (let k = 0; k + 1 < L.length && M !== 'live'; k++) {
      const a = L[k], b = L[k + 1];
      const ia = P.walls.findIndex((q) => q.id === a.wall.id), ib = P.walls.findIndex((q) => q.id === b.wall.id);
      if (ib !== ia + 1 || a.wall.joinNext === false) continue;
      const x0 = this.sx(a.x0 + a.wall.width), x1 = this.sx(b.x0), ym = this.sy(Math.min(a.wall.height, b.wall.height) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.setLineDash([3, 3]);
      line(ctx, x0 + 2, ym, x1 - 2, ym); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc((x0 + x1) / 2, ym, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // point clouds
    const pointsOn = this.showPoints && (M !== 'room');
    if (pointsOn) {
      for (const [, v] of store.viz) {
        const l = L.find((q) => q.wall.id === v.wallId);
        if (!l) continue;
        const pts = v.pts;
        const strong = sensorsActive || M === 'calibrate';
        for (let k = 0; k < pts.length; k += 3) {
          const cls = pts[k + 2];
          const px = this.sx(l.x0 + pts[k]), py = this.sy(pts[k + 1]);
          if (px < -2 || py < -2 || px > this.w + 2 || py > this.h + 2) continue;
          ctx.fillStyle = cls === 1 ? '#E0E0E0' : cls === 0 ? (strong ? 'rgba(160,160,160,0.55)' : 'rgba(140,140,140,0.3)') : (strong ? 'rgba(120,120,120,0.45)' : 'rgba(109,109,109,0.18)');
          const r = cls === 1 ? 1.8 : strong ? 1.4 : 1.1;
          ctx.fillRect(px - r / 2, py - r / 2, r, r);
        }
        ctx.strokeStyle = 'rgba(79,195,232,0.6)';
        for (const [x, y, size] of v.det || []) circle(ctx, this.sx(l.x0 + x), this.sy(y), Math.max(3, (size / 2) * s));
        ctx.strokeStyle = 'rgba(224,108,108,0.8)';
        ctx.setLineDash([3, 3]);
        for (const [x, y, size] of v.rejected || []) circle(ctx, this.sx(l.x0 + x), this.sy(y), Math.max(5, (size / 2) * s));
        ctx.setLineDash([]);
      }
    }

    // Level check marks (Sensors): returns where the scan plane reaches the wall, floor stretches not seen
    const lv = store.level;
    const ll = lv && M === 'sensors' && L.find((q) => q.wall.id === lv.wallId);
    if (ll) {
      ctx.fillStyle = C.danger;
      for (const [x, y] of lv.grazing) ctx.fillRect(this.sx(ll.x0 + x) - 1.5, this.sy(y) - 1.5, 3, 3);
      ctx.strokeStyle = C.danger;
      if (lv.region) {
        const r = lv.region, pad = 0.06;
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
        ctx.strokeRect(this.sx(ll.x0 + r.x0 - pad), this.sy(r.y1 + pad), (r.x1 - r.x0 + 2 * pad) * s, (r.y1 - r.y0 + 2 * pad) * s);
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 4;
      for (const [g0, g1] of lv.floorGaps) { ctx.beginPath(); ctx.moveTo(this.sx(ll.x0 + g0), this.sy(0)); ctx.lineTo(this.sx(ll.x0 + g1), this.sy(0)); ctx.stroke(); }
      ctx.lineWidth = 1;
    }

    // sensors
    for (const s0 of P.sensors) {
      const l = L.find((q) => q.wall.id === s0.wallId);
      if (!l) continue;
      const sn = this.val('sensor', s0.id, s0);
      const [ox, oy] = this.sensorOrigin(sn);
      const px = this.sx(l.x0 + ox), py = this.sy(oy);
      const st = store.status?.sensors?.[sn.id];
      const color = !sn.enabled ? '#6D6D6D' : st?.state === 'scanning' ? C.ok : st?.state === 'offline' || st?.state === 'error' ? C.danger : C.attn;
      const selS = sel?.kind === 'sensor' && sel.id === sn.id;
      const R = sensorsActive ? (this.coarse ? 12 : 9) : 6;
      if (sensorsActive) {
        // 0° axis of the sensor
        const [hx, hy] = this._rotHandle(sn, px, py);
        ctx.strokeStyle = selS && !sn.calibration ? C.attn : 'rgba(255,255,255,0.25)';
        ctx.setLineDash([3, 3]); line(ctx, px, py, hx, hy); ctx.setLineDash([]);
        if (selS && !sn.calibration) { ctx.fillStyle = C.attn; ctx.beginPath(); ctx.arc(hx, hy, this.handleSize() / 2 + 2, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = '#262626';
      ctx.strokeStyle = selS ? '#fff' : color;
      ctx.lineWidth = selS ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py, R * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'bottom';
      ctx.fillText(sensorsActive ? `${sn.id}${sn.calibration ? ' · calibrated' : ''}` : sn.id, px + R + 4, py - 3);
      if (sensorsActive && selS) {
        ctx.fillStyle = '#8C8C8C'; ctx.textBaseline = 'top';
        ctx.fillText(`x ${sn.pose.x.toFixed(3)}  y ${sn.pose.y.toFixed(3)}  ${sn.pose.rotation.toFixed(1)}°`, px + R + 4, py + 3);
      }
      ctx.textBaseline = 'top';
    }

    // calibration targets
    if (calib) {
      const l = L.find((q) => q.wall.id === calib.wallId);
      if (l) {
        calib.targets.forEach((t, k) => {
          const px = this.sx(l.x0 + t.x), py = this.sy(t.y);
          const cur = k === calib.index && calib.phase !== 'done';
          const done = t.captured.length > 0;
          ctx.strokeStyle = cur ? C.attn : done ? C.ok : 'rgba(255,255,255,0.35)';
          ctx.lineWidth = cur ? 2 : 1;
          circle(ctx, px, py, cur ? 12 : 7);
          line(ctx, px - 16, py, px + 16, py); line(ctx, px, py - 16, px, py + 16);
          if (cur && calib.progress > 0) { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 18, -Math.PI / 2, -Math.PI / 2 + calib.progress * Math.PI * 2); ctx.stroke(); }
          ctx.lineWidth = 1;
          ctx.fillStyle = '#8C8C8C'; ctx.font = '500 10px Geist, system-ui';
          ctx.fillText(String(k + 1), px + 9, py + 6);
        });
      }
    }

    // verification check points
    const ver = store.status?.verify;
    if (ver) {
      const l = L.find((q) => q.wall.id === ver.wallId);
      if (l) ver.targets.forEach((t, k) => {
        const px = this.sx(l.x0 + t.x), py = this.sy(t.y);
        const cur = k === ver.index && ver.phase !== 'done';
        ctx.strokeStyle = cur ? C.attn : t.errMm !== null ? C.ok : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = cur ? 2 : 1;
        circle(ctx, px, py, cur ? 11 : 6);
        ctx.lineWidth = 1;
        if (t.measured) {
          ctx.fillStyle = C.live; ctx.beginPath(); ctx.arc(this.sx(l.x0 + t.measured[0]), this.sy(t.measured[1]), 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui'; ctx.fillText(`${t.errMm} mm`, px + 10, py + 6);
        }
      });
    }

    // touches
    for (const l of L) {
      for (const [id, x, y, size, coast] of live[l.wall.id] || []) {
        const px = this.sx(l.x0 + x), py = this.sy(y);
        const r = Math.max(6, (Math.max(size, 0.06) / 2) * s);
        ctx.fillStyle = coast ? 'rgba(79,195,232,0.15)' : 'rgba(79,195,232,0.35)';
        ctx.strokeStyle = C.live; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1;
        // ids only when zoomed in enough to read them (on the whole-room strip they were just noise)
        if (s >= 45) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 10px Geist, system-ui'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(id), px + r * 0.75 + 2, py - r * 0.75);
          ctx.textBaseline = 'top';
        }
      }
    }
    if (zonesActive) this._drawSelection();
    this._drawPending();
  }

  /** A zone outline (screen px): amber, filled while active, label at its top-left. */
  _drawZoneShape(z, pts, { dim = false, dashed = false, sel = false, clip = null, label = true } = {}) {
    const ctx = this.ctx, C = this.colors;
    const st = store.live?.zones?.[z.id];
    tracePath(ctx, pts);
    ctx.fillStyle = st?.active ? 'rgba(229,181,103,0.22)' : dim ? 'rgba(229,181,103,0.03)' : 'rgba(229,181,103,0.07)';
    ctx.fill();
    ctx.strokeStyle = !z.enabled || dim ? 'rgba(229,181,103,0.35)' : C.attn;
    ctx.lineWidth = sel ? 2 : 1;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
    if (label && (!dim || st?.active)) {
      const b = boxOf(pts);
      ctx.fillStyle = C.attn; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'top';
      const text = `${z.name}${st?.count ? ` · ${st.count}` : ''}${z.minHands > 1 ? ` (${z.minHands}+)` : ''}`;
      // only when it fits inside the zone (small zones on the whole-room strip would write over each other)
      if (ctx.measureText(text).width + 8 <= b.x1 - b.x0) ctx.fillText(text, Math.max(b.x0, clip?.x0 ?? -Infinity) + 4, Math.max(b.y0, clip?.y0 ?? -Infinity) + 4);
    }
  }

  /** Handles and size readout of the selected zone / mask. */
  _drawSelection() {
    const so = this._selObj();
    if (!so) return;
    const ctx = this.ctx, hs = this.handleSize();
    for (const h of this._handles(so)) {
      if (h.type === 'mid') {
        if (this.coarse) continue; // on touch screens midpoints are too close to the vertices: add points with a double tap
        ctx.fillStyle = '#111'; ctx.strokeStyle = '#E0E0E0';
        ctx.beginPath(); ctx.arc(h.px, h.py, hs / 2 - 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        continue;
      }
      const on = h.type === 'vertex' && this.vertex?.id === this.selection.id && this.vertex.k === h.k;
      ctx.fillStyle = on ? this.colors.attn : '#fff'; ctx.strokeStyle = '#111';
      if (h.type === 'handle') { ctx.fillRect(h.px - hs / 2, h.py - hs / 2, hs, hs); ctx.strokeRect(h.px - hs / 2 + 0.5, h.py - hs / 2 + 0.5, hs - 1, hs - 1); }
      else { ctx.beginPath(); ctx.arc(h.px, h.py, hs / 2 + 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    const g = geomOf(so.obj), b = boundsOfGeom(g);
    const [ax, ay] = so.tf.toS(b.x0, b.y0), [bx, by] = so.tf.toS(b.x1, b.y1);
    ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'bottom';
    ctx.fillText(describeGeom(g, so.tf.unit), Math.min(ax, bx), Math.min(ay, by) - 4);
    ctx.textBaseline = 'top';
  }

  /** A rect / circle being dragged out, or the polygon being clicked in. */
  _drawPending() {
    const ctx = this.ctx, C = this.colors, d = this.drag;
    if (d?.type === 'draw') {
      const g = this._drawnGeom(d, true);
      const pts = shapeOutline(g, 48).map(([x, y]) => d.tf.toS(x, y));
      ctx.strokeStyle = d.kind === 'mask' ? C.danger : C.attn; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      tracePath(ctx, pts); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1;
      const [bx, by] = d.tf.toS(...d.b);
      ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'top';
      ctx.fillText(describeGeom(g, d.tf.unit), bx + 8, by + 6);
    }
    const q = this.poly;
    const tf = q && this._tf(q.space, q.wallId);
    if (!tf) return;
    const pts = q.pts.map(([x, y]) => tf.toS(x, y));
    ctx.strokeStyle = q.kind === 'mask' ? C.danger : C.attn; ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    if (this.mouse && !this.coarse && pts.length) { ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(...pts.at(-1)); ctx.lineTo(...this.mouse); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = 1;
    pts.forEach(([x, y], i) => {
      const closer = i === 0 && pts.length >= 3; // click it to close
      ctx.fillStyle = closer ? C.attn : '#fff';
      ctx.beginPath(); ctx.arc(x, y, closer ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  _drawCanvas() {
    const ctx = this.ctx, P = this.P, k = this.view.s, C = this.colors;
    const X = (x) => this.sx(x), Y = (y) => this.sy(y);
    const sel = this.selection;
    // output canvas
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(X(0), Y(0), P.canvas.width * k, P.canvas.height * k);
    const ul = this.underlay();
    if (ul) { ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(ul, X(0), Y(0), P.canvas.width * k, P.canvas.height * k); ctx.restore(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(X(0) + 0.5, Y(0) + 0.5, P.canvas.width * k, P.canvas.height * k);
    ctx.fillStyle = '#8C8C8C'; ctx.font = '500 11px Geist, system-ui'; ctx.textBaseline = 'bottom';
    ctx.fillText(`Output canvas · ${P.canvas.width} × ${P.canvas.height} px`, X(0), Y(0) - 6);
    ctx.textBaseline = 'top';
    const live = store.live?.walls || {};
    const editMap = this.mode === 'mapping'; // in Zones the wall regions are only a reference

    for (const w0 of P.walls) {
      const pr = this.val('pixelRect', w0.id, w0.pixelRect);
      const m = this.ghost?.kind === 'mapping' && this.ghost.id === w0.id ? this.ghost.value
        : this.ghost?.kind === 'pixelRect' && this.ghost.id === w0.id ? { mode: 'rect', corners: rectCorners(pr) } : w0.mapping;
      const w = { ...w0, pixelRect: pr, mapping: m };
      const out = this.outline(w, m);
      const cs = m.mode === 'grid' ? null : out;
      const selW = editMap && sel?.kind === 'wall' && sel.id === w.id;
      const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); };
      path(out); ctx.closePath();
      ctx.fillStyle = selW ? 'rgba(229,181,103,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      // wall grid (0.5 m) through the mapping (polylines: a mesh bends lines at cell borders)
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      const N = m.mode === 'grid' ? 24 : 1;
      const poly = (fn) => { path(Array.from({ length: N + 1 }, (_, k) => fn(k / N))); ctx.stroke(); };
      for (let gx = 0.5; gx < w.width; gx += 0.5) poly((t) => uvToCanvas(w, gx / w.width, t, m));
      for (let gy = 0.5; gy < w.height; gy += 0.5) poly((t) => uvToCanvas(w, t, 1 - gy / w.height, m));
      path(out); ctx.closePath();
      ctx.strokeStyle = selW ? C.attn : 'rgba(255,255,255,0.45)'; ctx.lineWidth = selW ? 2 : 1; ctx.stroke(); ctx.lineWidth = 1;
      // label
      const [cx, cy] = uvToCanvas(w, 0.5, 0.5, m);
      ctx.fillStyle = selW ? '#fff' : '#B8B8B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 13px Geist, system-ui'; ctx.fillText(w.id, X(cx), Y(cy) - 8);
      ctx.font = '500 10px Geist, system-ui'; ctx.fillStyle = '#8C8C8C';
      ctx.fillText(m.mode === 'corners' ? 'corner pin' : m.mode === 'grid' ? `grid ${m.us.length}×${m.vs.length}` : `${pr.w} × ${pr.h} px`, X(cx), Y(cy) + 8);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (m.mode === 'grid') {
        // mesh lines between nodes (straight inside each cell) and the nodes themselves
        const nx = m.us.length, ny = m.vs.length;
        ctx.strokeStyle = selW ? 'rgba(229,181,103,0.55)' : 'rgba(229,181,103,0.25)';
        for (let j = 0; j < ny; j++) path(m.points.slice(j * nx, j * nx + nx)), ctx.stroke();
        for (let i = 0; i < nx; i++) path(Array.from({ length: ny }, (_, j) => m.points[j * nx + i])), ctx.stroke();
        if (selW) {
          const hs = this.handleSize();
          m.points.forEach(([x, y], k) => {
            const on = this.node?.wallId === w.id && this.node.k === k;
            ctx.fillStyle = on ? '#fff' : C.attn; ctx.strokeStyle = '#111';
            ctx.beginPath(); ctx.arc(X(x), Y(y), hs / 2 + (on ? 3 : 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          });
        }
      } else if (editMap) {
        // corner handles
        const hs = this.handleSize() + (selW ? 2 : 0);
        cs.forEach(([x, y]) => {
          ctx.fillStyle = selW ? C.attn : '#B8B8B8'; ctx.strokeStyle = '#111';
          ctx.beginPath(); ctx.arc(X(x), Y(y), hs / 2 + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }
      const wide = Math.abs(this.sx(cs ? Math.max(...cs.map((q) => q[0])) : 0) - this.sx(cs ? Math.min(...cs.map((q) => q[0])) : 0)) > 230;
      if (selW && cs && wide) {
        ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui';
        cs.forEach(([x, y], i) => ctx.fillText(`${Math.round(x)}, ${Math.round(y)}`, X(x) + (i === 1 || i === 2 ? -64 : 8), Y(y) + (i < 2 ? 8 : -20)));
      }
    }

    if (this.mode === 'zones') {
      // wall zones where they land on the content (reference, dashed), then the canvas zones (editable)
      for (const z of P.zones) {
        const w = z.space !== 'canvas' && P.walls.find((q) => q.id === z.wallId);
        if (!w) continue;
        const pts = densify(shapeOutline(z, 48), Math.max(0.05, w.width / 60)).map(([x, y]) => { const [cx, cy] = uvToCanvas(w, x / w.width, 1 - y / w.height); return [X(cx), Y(cy)]; });
        this._drawZoneShape(z, pts, { dim: true, dashed: true });
      }
      for (const z0 of P.zones) {
        if (z0.space !== 'canvas') continue;
        const z = this.val('zone', z0.id, z0);
        this._drawZoneShape(z, shapeOutline(z, 64).map(([x, y]) => [X(x), Y(y)]), { sel: sel?.kind === 'zone' && sel.id === z.id });
      }
    }

    // live touches through the mapping (verifies the mapping end to end)
    for (const w of P.walls) {
      const m = this.ghost?.kind === 'mapping' && this.ghost.id === w.id ? this.ghost.value : w.mapping;
      for (const [, x, y] of live[w.id] || []) {
        const [tx, ty] = uvToCanvas(w, x / w.width, 1 - y / w.height, m);
        ctx.fillStyle = 'rgba(79,195,232,0.5)'; ctx.strokeStyle = C.live;
        ctx.beginPath(); ctx.arc(X(tx), Y(ty), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (this.mode === 'zones') { this._drawSelection(); this._drawPending(); }
  }

  /**
   * Outputs › Texture: the live mask, rendered by the engine's own rasteriser (/shared/mask.js) from the live
   * touches with the output's settings (and the slider being dragged) — what the Spout sender sends.
   */
  _drawTexture() {
    const ctx = this.ctx, P = this.P, k = this.view.s;
    const X = (x) => this.sx(x), Y = (y) => this.sy(y);
    const o0 = P.outputs.find((x) => x.id === this.texture.id);
    if (!o0) return;
    const o = { ...o0, ...this.texture.override };
    const pv = this._texturePreview(o);
    ctx.fillStyle = '#000';
    ctx.fillRect(X(0), Y(0), P.canvas.width * k, P.canvas.height * k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pv.canvas, X(0), Y(0), P.canvas.width * k, P.canvas.height * k);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(X(0) + 0.5, Y(0) + 0.5, P.canvas.width * k, P.canvas.height * k);
    ctx.fillStyle = '#8C8C8C'; ctx.font = '500 11px Geist, system-ui'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    const where = o.sink === 'ndi' ? `NDI “${o.senderName}”` : o.sink === 'window' ? 'Full screen' : `Spout “${o.senderName}”`;
    ctx.fillText(`${where} · ${Math.round(P.canvas.width * o.scale)} × ${Math.round(P.canvas.height * o.scale)} px${o.enabled ? '' : ' · output off'}`, X(0), Y(0) - 6);
    // where each wall lands, for reference (walls the output leaves out are hatched)
    for (const w of P.walls) {
      const out = this.outline(w, w.mapping).map(([x, y]) => [X(x), Y(y)]);
      tracePath(ctx, out);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
      if (o.walls.length && !o.walls.includes(w.id)) hatchPath(ctx, out, 'rgba(255,255,255,0.08)');
      const b = boxOf(out);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '600 11px Geist, system-ui'; ctx.textBaseline = 'top';
      ctx.fillText(w.id, b.x0 + 6, b.y0 + 5);
    }
  }

  /** The preview's mask: a new frame for each live message (≈30 Hz), at most at the output's own rate. */
  _texturePreview(o) {
    const P = this.P;
    const [scale, w, h] = texturePreviewSize(P, o);
    let pv = this._tex;
    if (!pv || pv.w !== w || pv.h !== h) {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const img = new ImageData(w, h);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      pv = this._tex = { w, h, canvas, g: canvas.getContext('2d'), img, mask: new TouchMask(), live: null, t: null };
      pv.mask.resize(w, h);
      pv.g.putImageData(img, 0, 0);
    }
    const L = store.live;
    if (!L || L === pv.live) return pv;
    pv.live = L;
    if (pv.t !== null && L.t >= pv.t && L.t - pv.t < 1000 / o.rateHz - 2) return pv; // the output's own rate
    const dt = pv.t === null || L.t < pv.t ? 33 : Math.min(1000, L.t - pv.t);
    pv.t = L.t;
    const walls = P.walls.filter((x) => !o.walls.length || o.walls.includes(x.id))
      .map((wall) => ({ wall, touches: (L.walls?.[wall.id] || []).map(([, x, y, size]) => ({ x, y, size })) }));
    if (pv.mask.render(walls, o, scale, dt)) {
      const m = pv.mask.mask, d = pv.img.data;
      for (let i = 0, j = 0; i < m.length; i++, j += 4) { const v = m[i]; d[j] = v; d[j + 1] = v; d[j + 2] = v; }
      pv.g.putImageData(pv.img, 0, 0);
    }
    return pv;
  }
}

/** Does the wall loop close? (the engine's rule, `planCloses`) Cached per walls array. */
const closesCache = new WeakMap();
function roomCloses(walls) {
  if (!closesCache.has(walls)) closesCache.set(walls, planCloses(walls));
  return closesCache.get(walls);
}

function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
function tracePath(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function boxOf(pts) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
/** Diagonal hatching inside a closed screen-space path. */
function hatchPath(ctx, pts, color) {
  const b = boxOf(pts), w = b.x1 - b.x0, h = b.y1 - b.y0;
  ctx.save(); tracePath(ctx, pts); ctx.clip();
  ctx.strokeStyle = color;
  for (let t = -h; t < w; t += 8) line(ctx, b.x0 + t, b.y0 + h, b.x0 + t + h, b.y0);
  ctx.restore();
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-300) + xi) inside = !inside;
  }
  return inside;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
