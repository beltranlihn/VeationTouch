// The central workspace. Each tool (mode) changes WHAT the canvas shows and WHAT can be grabbed:
//   live       all walls, read-only, virtual hands
//   room       all walls; drag a wall's right/top edge to resize it
//   mapping    the OUTPUT CANVAS in pixels: move wall regions, drag corners (corner pin)
//   sensors    one wall in focus: drag a sensor, rotate it with its handle, live point cloud
//   calibrate  one wall in focus with the targets
//   zones      one wall in focus: draw / move / resize zones and masks
// Edits are previewed locally while dragging (`ghost`) and committed once on release.

import { store } from './conn.js';
import { fitHomography, apply as applyM, gridMap, gridInsert, invertMap } from '/shared/geometry.js';

const GAP = 0.6;                       // metres between walls in the strip
const FOCUS_MODES = new Set(['sensors', 'calibrate', 'zones']);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const r3 = (v) => Math.round(v * 1000) / 1000;
const normRect = (r) => ({ x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) });
const rectCorners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
const hCache = new WeakMap();

/** Wall UV (0..1 top-left) → canvas px through the wall's mapping (same maths as the engine). */
export function uvToCanvas(wall, u, v, mapping = wall.mapping) {
  if (mapping?.mode === 'grid') return gridMap(mapping, u, v);
  if (mapping?.mode === 'corners') {
    let H = hCache.get(mapping);
    if (!H) { H = fitHomography([[0, 0], [1, 0], [1, 1], [0, 1]], mapping.corners); hCache.set(mapping, H); }
    return applyM(H, u, v);
  }
  const r = wall.pixelRect;
  return [r.x + u * r.w, r.y + v * r.h];
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
  get space() { return this.mode === 'mapping' ? 'canvas' : 'wall'; }

  setMode(mode) {
    this.mode = mode;
    this.tool = mode === 'zones' ? 'select' : this.tool === 'hand' && ['live', 'sensors', 'zones', 'calibrate'].includes(mode) ? 'hand' : 'select';
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
    return list.map((w) => { const wall = this.val('wall', w.id, w); const r = { wall, x0: x }; x += wall.width + GAP; return r; });
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
    const s = Math.min((this.w - pad * 2) / totalW, (this.h - top - pad - 30) / maxH);
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

  // ------------------------------------------------------------------ hit testing

  handleSize() { return this.coarse ? 16 : 7; }

  rectHandles(l, r) {
    const n = normRect(r);
    const xs = [n.x0, (n.x0 + n.x1) / 2, n.x1], ys = [n.y1, (n.y0 + n.y1) / 2, n.y0];
    const out = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!(i === 1 && j === 1)) out.push({ i, j, px: this.sx(l.x0 + xs[i]), py: this.sy(ys[j]) });
    return out;
  }

  /** Outline of a wall region in canvas px (works for rect, corners and grid). */
  outline(w, m) {
    if (m.mode !== 'grid') return m.mode === 'corners' ? m.corners : rectCorners(this.val('pixelRect', w.id, w.pixelRect));
    const pts = [], n = 12;
    for (let k = 0; k < n; k++) pts.push(gridMap(m, k / n, 0));
    for (let k = 0; k < n; k++) pts.push(gridMap(m, 1, k / n));
    for (let k = 0; k < n; k++) pts.push(gridMap(m, 1 - k / n, 1));
    for (let k = 0; k < n; k++) pts.push(gridMap(m, 0, 1 - k / n));
    return pts;
  }

  hit(px, py) {
    const P = this.P;
    const L = this.walls();
    const hs = this.handleSize() + 4;
    const sel = this.selection;

    if (this.space === 'canvas') {
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

    // selected zone/mask handles
    if (this.mode === 'zones' && (sel?.kind === 'zone' || sel?.kind === 'mask')) {
      const { obj, l } = this._selRect();
      if (obj) for (const h of this.rectHandles(l, obj)) if (Math.abs(h.px - px) <= hs && Math.abs(h.py - py) <= hs) return { type: 'handle', h };
    }
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
      const inR = (r) => at.x >= Math.min(r.x0, r.x1) && at.x <= Math.max(r.x0, r.x1) && at.y >= Math.min(r.y0, r.y1) && at.y <= Math.max(r.y0, r.y1);
      const z = [...P.zones].reverse().find((q) => q.wallId === at.l.wall.id && inR(this.val('zone', q.id, q).rect));
      if (z) return { type: 'zone', zone: z, l: at.l, at };
      const m = [...at.l.wall.masks].reverse().find((q) => inR(this.val('mask', `${at.l.wall.id}/${q.id}`, q)));
      if (m) return { type: 'mask', mask: m, l: at.l, at };
    }
    if (at) return { type: 'wall', l: at.l, at };
    return null;
  }

  _selRect() {
    const sel = this.selection, P = this.P;
    const l = this.walls().find((q) => q.wall.id === sel.wallId);
    if (!l) return {};
    if (sel.kind === 'zone') { const z = P.zones.find((q) => q.id === sel.id); return z ? { obj: this.val('zone', z.id, z).rect, l } : {}; }
    const w = P.walls.find((q) => q.id === sel.wallId);
    const m = w?.masks.find((q) => q.id === sel.id);
    return m ? { obj: this.val('mask', `${w.id}/${m.id}`, m), l } : {};
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
    c.addEventListener('dblclick', () => { this.fitKey = ''; });
    c.addEventListener('pointermove', (e) => { if (!this.pointers.size) this._hover(e.offsetX, e.offsetY); });
  }

  _hover(px, py) {
    const h = this.hit(px, py);
    const cur = { handle: 'nwse-resize', corner: 'move', region: 'grab', rotate: 'grab', sensor: 'grab', zone: 'grab', mask: 'grab', edgeW: 'ew-resize', edgeH: 'ns-resize' }[h?.type];
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
    if ((this.tool === 'zone' || this.tool === 'mask') && h?.at) {
      const x = this.snapM(h.at.x), y = this.snapM(h.at.y);
      this.drag = { type: 'draw', kind: this.tool, l: h.l, r: { x0: x, y0: y, x1: x, y1: y } };
      return;
    }
    if (h?.type === 'handle') {
      const sel = this.selection;
      const { obj, l } = this._selRect();
      this.drag = { type: 'resize', sel, l, r0: normRect(obj), hi: h.h.i, hj: h.h.j };
      return;
    }
    if (h?.type === 'zone' || h?.type === 'mask') {
      const isZ = h.type === 'zone';
      this.selection = isZ ? { kind: 'zone', id: h.zone.id, wallId: h.l.wall.id } : { kind: 'mask', id: h.mask.id, wallId: h.l.wall.id };
      this.hooks.pick(this.selection);
      const r0 = normRect(isZ ? h.zone.rect : h.mask);
      this.drag = { type: 'move', sel: this.selection, l: h.l, r0, start: [h.at.x, h.at.y] };
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
      case 'draw': d.r.x1 = this.snapM(clamp(X - d.l.x0, 0, d.l.wall.width)); d.r.y1 = this.snapM(clamp(Y, 0, d.l.wall.height)); break;
      case 'move': {
        if (!p.moved) break;
        const W = d.l.wall.width, H = d.l.wall.height, r = d.r0;
        let ox = this.snapM(X - d.l.x0 - d.start[0]), oy = this.snapM(Y - d.start[1]);
        ox = clamp(ox, -r.x0, W - r.x1); oy = clamp(oy, -r.y0, H - r.y1);
        const nr = { x0: r3(r.x0 + ox), y0: r3(r.y0 + oy), x1: r3(r.x1 + ox), y1: r3(r.y1 + oy) };
        this._ghostRect(d.sel, nr);
        break;
      }
      case 'resize': {
        const r = { ...d.r0 };
        const x = this.snapM(clamp(X - d.l.x0, 0, d.l.wall.width)), y = this.snapM(clamp(Y, 0, d.l.wall.height));
        if (d.hi === 0) r.x0 = Math.min(x, r.x1 - 0.02); if (d.hi === 2) r.x1 = Math.max(x, r.x0 + 0.02);
        if (d.hj === 0) r.y1 = Math.max(y, r.y0 + 0.02); if (d.hj === 2) r.y0 = Math.min(y, r.y1 - 0.02);
        this._ghostRect(d.sel, r);
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

  _ghostRect(sel, r) {
    if (sel.kind === 'zone') {
      const z = this.P.zones.find((q) => q.id === sel.id);
      this.ghost = { kind: 'zone', id: z.id, value: { ...z, rect: r } };
    } else {
      const w = this.P.walls.find((q) => q.id === sel.wallId);
      const m = w.masks.find((q) => q.id === sel.id);
      this.ghost = { kind: 'mask', id: `${w.id}/${m.id}`, value: { ...m, ...r } };
    }
  }

  _cancelDrag() {
    if (this.drag?.type === 'hand') this.hooks.hand(this.drag.wallId, 0, 0, 'up', this.drag.handId);
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
      case 'hand': H.hand(d.wallId, 0, 0, 'up', d.handId); break;
      case 'draw': {
        const r = normRect(d.r);
        if (r.x1 - r.x0 >= 0.04 && r.y1 - r.y0 >= 0.04) H.draw(d.kind, d.l.wall.id, r);
        break;
      }
      case 'move': case 'resize':
        if (g) {
          if (g.kind === 'zone') H.edit((P) => { P.zones.find((q) => q.id === g.id).rect = g.value.rect; }, d.type === 'move' ? 'move zone' : 'resize zone');
          else { const [wid, mid] = g.id.split('/'); H.edit((P) => { const m = P.walls.find((w) => w.id === wid).masks.find((q) => q.id === mid); Object.assign(m, { x0: g.value.x0, y0: g.value.y0, x1: g.value.x1, y1: g.value.y1 }); }, d.type === 'move' ? 'move mask' : 'resize mask'); }
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
        if (!p.moved) this._click(d.h);
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
    if (sel.kind === 'zone') { this.hooks.edit((Q) => { const r = Q.zones.find((q) => q.id === sel.id).rect; r.x0 = r3(r.x0 + dx * st); r.x1 = r3(r.x1 + dx * st); r.y0 = r3(r.y0 - dy * st); r.y1 = r3(r.y1 - dy * st); }, 'nudge zone'); return true; }
    if (sel.kind === 'mask') { this.hooks.edit((Q) => { const m = Q.walls.find((w) => w.id === sel.wallId).masks.find((q) => q.id === sel.id); m.x0 = r3(m.x0 + dx * st); m.x1 = r3(m.x1 + dx * st); m.y0 = r3(m.y0 - dy * st); m.y1 = r3(m.y1 - dy * st); }, 'nudge mask'); return true; }
    if (sel.kind === 'sensor') { this.hooks.edit((Q) => { const s = Q.sensors.find((q) => q.id === sel.id); s.pose.x = r3(s.pose.x + dx * st); s.pose.y = r3(s.pose.y - dy * st); }, 'nudge sensor'); return true; }
    void P;
    return false;
  }

  // ------------------------------------------------------------------ drawing

  draw() {
    const ctx = this.ctx, P = this.P;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!P) return;
    const key = `${this.mode}|${this.focus}|${this.w}x${this.h}|${P.id}|${P.walls.map((w) => w.id).join(',')}|${P.canvas.width}x${P.canvas.height}`;
    // never re-frame in the middle of a drag: the drag maths would jump
    if (key !== this.fitKey && !this.drag) { this.fitKey = key; this.fit(); }
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
      // labels under the wall
      ctx.font = '500 11px Geist, system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillStyle = w.enabled ? '#B8B8B8' : '#6D6D6D';
      ctx.fillText(`${w.id}  ${w.name}`, X(0), Y(0) + 7);
      ctx.fillStyle = '#6D6D6D';
      ctx.fillText(`${w.width.toFixed(2)} × ${w.height.toFixed(2)} m`, X(0), Y(0) + 21);
      const count = (live[w.id] || []).length;
      if (count) { ctx.fillStyle = C.live; ctx.textAlign = 'right'; ctx.fillText(`${count} touch${count > 1 ? 'es' : ''}`, X(w.width), Y(0) + 21); ctx.textAlign = 'left'; }

      // room mode: resize handles + dimensions
      if (M === 'room') {
        ctx.fillStyle = C.attn;
        const hs = this.handleSize();
        ctx.fillRect(X(w.width) - hs / 2, Y(w.height / 2) - hs * 1.5, hs, hs * 3);
        ctx.fillRect(X(w.width / 2) - hs * 1.5, Y(w.height) - hs / 2, hs * 3, hs);
        ctx.fillStyle = '#8C8C8C';
        ctx.textAlign = 'center';
        ctx.fillText(`${w.width.toFixed(3)} m`, X(w.width / 2), Y(w.height) - 18);
        ctx.textAlign = 'left';
      }

      // masks
      for (const m0 of w.masks) {
        const m = normRect(this.val('mask', `${w.id}/${m0.id}`, m0));
        const rx = X(m.x0), ry = Y(m.y1), rw = (m.x1 - m.x0) * s, rh = (m.y1 - m.y0) * s;
        const on = zonesActive;
        ctx.fillStyle = on ? 'rgba(224,108,108,0.12)' : 'rgba(224,108,108,0.05)';
        ctx.fillRect(rx, ry, rw, rh);
        hatch(ctx, rx, ry, rw, rh, on ? 'rgba(224,108,108,0.30)' : 'rgba(224,108,108,0.12)');
        ctx.strokeStyle = on ? 'rgba(224,108,108,0.7)' : 'rgba(224,108,108,0.3)';
        ctx.setLineDash([4, 3]); ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh); ctx.setLineDash([]);
        if (on) { ctx.fillStyle = 'rgba(224,108,108,0.9)'; ctx.font = '500 10px Geist, system-ui'; ctx.fillText(m0.name, rx + 4, ry + 4); }
      }
      // zones
      for (const z0 of P.zones.filter((q) => q.wallId === w.id)) {
        const z = this.val('zone', z0.id, z0);
        const st = store.live?.zones?.[z.id];
        const r = normRect(z.rect);
        const rx = X(r.x0), ry = Y(r.y1), rw = (r.x1 - r.x0) * s, rh = (r.y1 - r.y0) * s;
        const selZ = sel?.kind === 'zone' && sel.id === z.id;
        const dim = !zonesActive && M !== 'live';
        ctx.fillStyle = st?.active ? 'rgba(229,181,103,0.22)' : dim ? 'rgba(229,181,103,0.03)' : 'rgba(229,181,103,0.07)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = !z.enabled || dim ? 'rgba(229,181,103,0.35)' : C.attn;
        ctx.lineWidth = selZ ? 2 : 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
        ctx.lineWidth = 1;
        if (!dim || st?.active) {
          ctx.fillStyle = C.attn; ctx.font = '500 10px Geist, system-ui';
          ctx.fillText(`${z.name}${st?.count ? ` · ${st.count}` : ''}`, rx + 4, ry + 4);
        }
      }
      // selection handles (zones/masks)
      if (zonesActive && (sel?.kind === 'zone' || sel?.kind === 'mask') && sel.wallId === w.id) {
        const { obj } = this._selRect();
        if (obj) {
          const r = normRect(obj);
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111';
          const hs = this.handleSize();
          for (const h of this.rectHandles(l, r)) { ctx.fillRect(h.px - hs / 2, h.py - hs / 2, hs, hs); ctx.strokeRect(h.px - hs / 2 + 0.5, h.py - hs / 2 + 0.5, hs - 1, hs - 1); }
          ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${(r.x1 - r.x0).toFixed(2)} × ${(r.y1 - r.y0).toFixed(2)} m  @ ${r.x0.toFixed(2)}, ${r.y0.toFixed(2)}`, X(r.x0), Y(r.y1) - 4);
          ctx.textBaseline = 'top';
        }
      }
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
        ctx.fillStyle = '#fff'; ctx.font = '600 10px Geist, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(id), px, py);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      }
    }

    // rectangle being drawn
    const d = this.drag;
    if (d?.type === 'draw') {
      const r = normRect(d.r);
      ctx.strokeStyle = d.kind === 'mask' ? C.danger : C.attn; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(this.sx(d.l.x0 + r.x0), this.sy(r.y1), (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
      ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.fillStyle = '#B8B8B8'; ctx.font = '500 10px Geist, system-ui';
      ctx.fillText(`${(r.x1 - r.x0).toFixed(2)} × ${(r.y1 - r.y0).toFixed(2)} m`, this.sx(d.l.x0 + r.x1) + 6, this.sy(r.y0) - 14);
    }
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

    for (const w0 of P.walls) {
      const pr = this.val('pixelRect', w0.id, w0.pixelRect);
      const m = this.ghost?.kind === 'mapping' && this.ghost.id === w0.id ? this.ghost.value
        : this.ghost?.kind === 'pixelRect' && this.ghost.id === w0.id ? { mode: 'rect', corners: rectCorners(pr) } : w0.mapping;
      const w = { ...w0, pixelRect: pr, mapping: m };
      const out = this.outline(w, m);
      const cs = m.mode === 'grid' ? null : out;
      const selW = sel?.id === w.id;
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
      } else {
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
      // live touches through the mapping (verifies the mapping end to end)
      for (const [id, x, y] of live[w.id] || []) {
        const [tx, ty] = uvToCanvas(w, x / w.width, 1 - y / w.height, m);
        ctx.fillStyle = 'rgba(79,195,232,0.5)'; ctx.strokeStyle = C.live;
        ctx.beginPath(); ctx.arc(X(tx), Y(ty), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        void id;
      }
    }
  }
}

function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
function hatch(ctx, x, y, w, h, color) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color;
  for (let t = -h; t < w; t += 8) line(ctx, x + t, y + h, x + t + h, y);
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
