// VEATION Touch — client SDK for web / Electron apps (ES module, no dependencies).
//
//   import { VeationTouch } from 'http://<server>:8770/sdk/veation-touch.js';
//   const vt = new VeationTouch('ws://192.168.1.20:8770/ws/data', { rateHz: 60 });
//   vt.on('down', (t) => …);           // {id, wallId, u, v, x, y}
//   vt.on('up', (t) => …);
//   vt.on('frame', (f) => …);          // every frame: f.walls[i].touches[j] = {id,u,v,x,y,vx,vy,size,age}
//   vt.on('zone', (e) => …);           // {type:'enter'|'hold'|'exit', zoneId, wallId, count}
//   vt.touches('P2')                   // current touches of a wall
//   vt.toCanvas('P2', u, v)            // → [px, py] in the output canvas
//
// u, v are 0..1 with the origin at the TOP-LEFT of the wall. x, y are metres from the
// bottom-left corner of the wall. The connection retries forever.

import { fitHomography, apply } from '../shared/geometry.js'; // served by the engine next to this file

export class VeationTouch {
  constructor(url, { rateHz = 60 } = {}) {
    this.url = url;
    this.rateHz = rateHz;
    this.handlers = new Map();
    this.profile = null;
    this.frame = null;
    this.connected = false;
    this._retry = 0;
    this._open();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  _emit(type, data) { for (const fn of this.handlers.get(type) || []) { try { fn(data); } catch (e) { console.error(e); } } }

  _open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this._retry = 0;
      this.connected = true;
      ws.send(JSON.stringify({ type: 'subscribe', rateHz: this.rateHz }));
      this._emit('connect');
    };
    ws.onclose = () => {
      this.connected = false;
      this._emit('disconnect');
      if (!this._closed) setTimeout(() => this._open(), Math.min(5000, 250 * 2 ** this._retry++));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'hello') { this.profile = m.profile; this._emit('profile', m.profile); return; }
      if (m.type !== 'frame') return;
      this.frame = m;
      const byId = new Map(m.walls.map((w) => [w.id, w]));
      for (const e of m.events) {
        const wall = this.profile?.walls.find((w) => w.id === e.wallId);
        const t = byId.get(e.wallId)?.touches.find((q) => q.id === e.id);
        const u = wall ? e.x / wall.width : t?.u, v = wall ? 1 - e.y / wall.height : t?.v;
        this._emit(e.type, { id: e.id, wallId: e.wallId, u, v, x: e.x, y: e.y, duration: e.duration });
      }
      for (const z of m.zoneEvents) this._emit('zone', z);
      this._emit('frame', m);
    };
  }

  touches(wallId) { return this.frame?.walls.find((w) => w.id === wallId)?.touches || []; }

  toCanvas(wallId, u, v) {
    const w = this.profile?.walls.find((x) => x.id === wallId);
    if (!w) return null;
    if (w.mapping?.mode === 'corners') {
      // corner-pin: bilinear-free projective map of the unit square onto the 4 corners
      w._H ??= fitHomography([[0, 0], [1, 0], [1, 1], [0, 1]], w.mapping.corners);
      return apply(w._H, u, v);
    }
    return [w.pixelRect.x + u * w.pixelRect.w, w.pixelRect.y + v * w.pixelRect.h];
  }

  close() { this._closed = true; this.ws?.close(); }
}
