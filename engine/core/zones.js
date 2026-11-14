// Trigger zones: rectangles in wall metres. Each zone reports enter / exit / hold events
// and a live touch count. Exit is debounced (releaseMs) so a 10 Hz dropout does not
// produce exit+enter flicker.

import { pointInRect } from './geometry.js';

export class ZoneEngine {
  constructor() { this.state = new Map(); }

  /** @param {object[]} zones profile zones */
  configure(zones) {
    const ids = new Set(zones.map((z) => z.id));
    for (const id of [...this.state.keys()]) if (!ids.has(id)) this.state.delete(id);
    this.zones = zones;
  }

  /**
   * @param {Record<string, {id:number,x:number,y:number}[]>} touchesByWall
   * @param {number} nowMs
   */
  update(touchesByWall, nowMs) {
    const events = [];
    const counts = {};
    for (const z of this.zones || []) {
      if (z.enabled === false) continue;
      const list = touchesByWall[z.wallId] || [];
      const inside = list.filter((t) => pointInRect(t.x, t.y, z.rect));
      let s = this.state.get(z.id);
      if (!s) { s = { active: false, since: 0, lastSeen: 0, held: false }; this.state.set(z.id, s); }
      if (inside.length) {
        s.lastSeen = nowMs;
        if (!s.active) {
          s.active = true; s.since = nowMs; s.held = false;
          events.push({ type: 'enter', zoneId: z.id, wallId: z.wallId, count: inside.length, t: nowMs });
        }
        if (!s.held && z.holdMs > 0 && nowMs - s.since >= z.holdMs) {
          s.held = true;
          events.push({ type: 'hold', zoneId: z.id, wallId: z.wallId, count: inside.length, t: nowMs });
        }
      } else if (s.active && nowMs - s.lastSeen >= (z.releaseMs ?? 150)) {
        s.active = false; s.held = false;
        events.push({ type: 'exit', zoneId: z.id, wallId: z.wallId, count: 0, t: nowMs, duration: (nowMs - s.since) / 1000 });
      }
      counts[z.id] = { count: inside.length, active: s.active, ids: inside.map((t) => t.id) };
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
