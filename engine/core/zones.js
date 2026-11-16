// Trigger zones. Each zone reports enter / hold / exit events and a live touch count.
//   space 'wall'   — shape in wall metres on its wall (rect, polygon or circle)
//   space 'canvas' — shape in output-canvas pixels: every touch is taken through its wall's Mapping first,
//                    so a zone can span walls and matches what is projected
// A zone is active while at least `minHands` touches are inside. Exit is debounced (releaseMs) so a 10 Hz
// dropout does not produce exit+enter flicker. `fire()` forces a zone active briefly (testing receivers).

import { pointInShape } from './geometry.js';
import { wallToCanvas } from '../profile.js';

export const FIRE_MS = 400;

export class ZoneEngine {
  constructor() { this.state = new Map(); this.forced = new Map(); this.walls = new Map(); }

  /** @param {object[]} zones profile zones @param {object[]} [walls] profile walls (needed by canvas zones) */
  configure(zones, walls = []) {
    const ids = new Set(zones.map((z) => z.id));
    for (const id of [...this.state.keys()]) if (!ids.has(id)) this.state.delete(id);
    for (const id of [...this.forced.keys()]) if (!ids.has(id)) this.forced.delete(id);
    this.zones = zones;
    this.walls = new Map(walls.map((w) => [w.id, w]));
  }

  /** Force a zone active for `ms` (the "Fire" test): the same enter / exit path as a real touch. */
  fire(zoneId, nowMs, ms = FIRE_MS) {
    const z = this.zones?.find((q) => q.id === zoneId);
    if (!z) throw new Error('unknown zone');
    this.forced.set(zoneId, nowMs + ms);
  }

  /** Touches of every wall in canvas pixels (only computed when a canvas zone exists). */
  _canvasTouches(touchesByWall) {
    const out = [];
    for (const [wallId, list] of Object.entries(touchesByWall)) {
      const w = this.walls.get(wallId);
      if (!w) continue;
      for (const t of list) { const [x, y] = wallToCanvas(w, t.x, t.y); out.push({ id: t.id, x, y }); }
    }
    return out;
  }

  /**
   * @param {Record<string, {id:number,x:number,y:number}[]>} touchesByWall
   * @param {number} nowMs
   */
  update(touchesByWall, nowMs) {
    const events = [];
    const counts = {};
    let onCanvas = null;
    for (const z of this.zones || []) {
      if (z.enabled === false) continue;
      let list;
      if (z.space === 'canvas') list = onCanvas ??= this._canvasTouches(touchesByWall);
      else list = touchesByWall[z.wallId] || [];
      const inside = list.filter((t) => pointInShape(t.x, t.y, z));
      const until = this.forced.get(z.id);
      const forced = until !== undefined && nowMs < until;
      if (until !== undefined && !forced) this.forced.delete(z.id);
      const need = z.minHands || 1;
      const count = forced ? Math.max(inside.length, need) : inside.length;
      const wallId = z.wallId ?? null;
      let s = this.state.get(z.id);
      if (!s) { s = { active: false, since: 0, lastSeen: 0, held: false }; this.state.set(z.id, s); }
      if (count >= need) {
        s.lastSeen = nowMs;
        if (!s.active) {
          s.active = true; s.since = nowMs; s.held = false;
          events.push({ type: 'enter', zoneId: z.id, wallId, count, t: nowMs, ...(forced ? { test: true } : {}) });
        }
        if (!s.held && z.holdMs > 0 && nowMs - s.since >= z.holdMs) {
          s.held = true;
          events.push({ type: 'hold', zoneId: z.id, wallId, count, t: nowMs });
        }
      } else if (s.active && nowMs - s.lastSeen >= (z.releaseMs ?? 150)) {
        s.active = false; s.held = false;
        events.push({ type: 'exit', zoneId: z.id, wallId, count: 0, t: nowMs, duration: (nowMs - s.since) / 1000 });
      }
      counts[z.id] = { count, active: s.active, ids: inside.map((t) => t.id) };
    }
    return { events, counts };
  }
}

/** Rolling count of touch-downs in a window — "how many hands landed together". */
export class BurstMeter {
  constructor(windowMs = 300) { this.windowMs = windowMs; this.downs = []; }
  add(events) { for (const e of events) if (e.type === 'down') this.downs.push({ t: e.t, wallId: e.wallId }); }
  value(nowMs) {
    const from = nowMs - this.windowMs;
    while (this.downs.length && this.downs[0].t < from) this.downs.shift();
    return this.downs.length;
  }
}
