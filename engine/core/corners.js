// Continuous corners: a hand sliding from one wall onto the next stays ONE touch.
//
// Each wall keeps its own tracker (WallTracker). This layer sits on top of them. Two walls are joined at a corner
// when the profile says so (`wall.joinNext`: wall i's right edge meets wall i+1's left edge; the last wall meets the
// first one when the room plan closes). Near a joined corner a touch is followed in CORNER COORDINATES — the signed
// distance u from the corner along the strip (u < 0 on the left wall, u ≥ 0 on the right one), so both sides of the
// corner are one line:
//   · a new track near the corner, at the height of a touch there, joins it: same public id, no extra down, and it
//     is confirmed at once with the hand's velocity (no confirmFrames wait, no start from rest)
//   · while both sensors see the hand, the position is the recency-weighted average of the two
//   · between the two walls there is always a short blind stretch (edge margins, the two scan planes): a hand moving
//     towards the corner is carried through it at its own speed until the other wall sees it — at most until it is
//     past the corner zone of the far wall (a hand lifted while heading into a corner ends a moment later)
//   · the reported wall follows u; when it changes a `cross` event is emitted; up only when the hand is really gone
// Everything downstream (zones, outputs, UI) sees these public touches.

import { roomPlan } from './geometry.js';

export const CORNER_DEFAULTS = Object.freeze({
  edgeZone: 0.25,  // m each side of a joined corner where touches are followed across it (0 = never link)
  yTol: 0.25,      // m height difference allowed between the two sides
  freshMs: 120,    // a track seen within this time steers the position
  recentMs: 45,    // each side weighs exp(−seenMs / recentMs): the newer reading leads
  predictMs: 60,   // the trackers already extrapolate this much (WallTracker.predictMs)
  bridgeMs: 1200,  // never carry a hand longer than this after its last sighting
  minSpeed: 0.15,  // m/s along the strip to count as "heading into the corner"
  tauMs: 35,       // smoothing of the corner coordinate (time constant)
});

export class CornerLinker {
  constructor(params = {}) {
    this.p = { ...CORNER_DEFAULTS, ...params };
    this.setZone(this.p.edgeZone);
    this.right = new Map();   // wallId → the wall joined at its right edge
    this.left = new Map();    // wallId → the wall joined at its left edge
    this.widths = new Map();
    this.pubOf = new Map();   // internal track id → public id
    this.groups = new Map();  // public id → group (see _group)
  }

  /** Corner zone (m): how far from a corner, on each side, a hand is followed across it; 0 = off. */
  setZone(m) { this.p.edgeZone = Math.max(0, m); this.p.yTol = Math.max(0.1, Math.min(0.4, m)); }

  /** @param {{id:string,width:number,joinNext?:boolean,turn?:number}[]} walls in strip order */
  configure(walls) {
    this.right.clear(); this.left.clear();
    this.widths = new Map(walls.map((w) => [w.id, w.width]));
    let closes = false;
    if (walls.length > 2) {
      const plan = roomPlan(walls), a = plan[0], z = plan.at(-1);
      closes = Math.hypot(z.p0[0] + z.dir[0] * z.width - a.p0[0], z.p0[1] + z.dir[1] * z.width - a.p0[1]) < 0.3;
    }
    walls.forEach((w, i) => {
      if (w.joinNext === false) return;
      const n = i + 1 < walls.length ? walls[i + 1] : closes ? walls[0] : null;
      if (n && n.id !== w.id) { this.right.set(w.id, n.id); this.left.set(n.id, w.id); }
    });
  }

  /** Joined pairs [[leftWallId, rightWallId]…] (UI, tests). */
  joins() { return [...this.right.entries()]; }

  /** The joined corner a point of a wall is near, as {left, right, u}; null away from corners. */
  _cornerOf(wallId, x) {
    const Z = this.p.edgeZone;
    if (!(Z > 0)) return null;
    const W = this.widths.get(wallId);
    const r = this.right.get(wallId), l = this.left.get(wallId);
    if (r && x >= W - Z) return { left: wallId, right: r, u: x - W };
    if (l && x <= Z) return { left: l, right: wallId, u: x };
    return null;
  }

  /** u of a point in a given corner's frame (null if the wall is not one of its two walls). */
  _u(c, wallId, x) {
    if (wallId === c.left) return x - this.widths.get(c.left);
    if (wallId === c.right) return x;
    return null;
  }

  /** The group a new track at (wallId, x, y) continues across a corner, if any. */
  _match(wallId, x, y) {
    let best = null, bestD = Infinity;
    for (const g of this.groups.values()) {
      if (!g.corner || !g.est) continue;
      const u = this._u(g.corner, wallId, x);
      if (u === null || Math.abs(y - g.est.y) > this.p.yTol) continue;
      const d = Math.abs(u - g.est.u);
      if (d <= this.p.edgeZone + 0.1 && d < bestD) { best = g; bestD = d; }
    }
    return best;
  }

  /**
   * WallTracker hook: confirm a tentative track at once when it continues a touch across a corner — and give it the
   * hand's velocity (x runs the same way on both walls of a joined corner), so it does not start from rest.
   */
  shouldConfirm(wallId, track) {
    if (!this._cornerOf(wallId, track.x)) return false;
    const g = this._match(wallId, track.x, track.y);
    if (!g) return false;
    track.vx = g.est.vu; track.vy = g.est.vy;
    return true;
  }

  /**
   * @param {{id:number,wallId:string,x:number,y:number,vx:number,vy:number,size:number,seenMs:number,coasting:boolean}[]} touches
   *        internal touches of every wall this tick
   * @param {object[]} events internal down / up events of this tick
   * @returns {{touches:object[], events:object[]}} public touches and events
   */
  update(touches, events, now) {
    const alive = new Set(touches.map((t) => t.id));
    for (const iid of [...this.pubOf.keys()]) if (!alive.has(iid)) this.pubOf.delete(iid);
    // 1. new tracks: continue a touch across a corner, or start their own group
    for (const t of touches) {
      if (this.pubOf.has(t.id)) continue;
      const g = this._cornerOf(t.wallId, t.x) ? this._match(t.wallId, t.x, t.y) : null;
      if (g) { this.pubOf.set(t.id, g.id); continue; }
      this.pubOf.set(t.id, t.id);
      // est: the latest estimate in corner coordinates {u, y, vu, vy, size, t (last sighting)} while near a corner
      this.groups.set(t.id, { id: t.id, downAt: now, corner: null, est: null, uS: null, t: now, out: null });
    }
    const out = [];
    for (const e of events) if (e.type === 'down' && this.pubOf.get(e.id) === e.id) out.push(e); // ups: decided below
    // 2. one public touch per group (a bridged group has no track for a moment)
    const members = new Map();
    for (const t of touches) { const pub = this.pubOf.get(t.id); if (!members.has(pub)) members.set(pub, []); members.get(pub).push(t); }
    const pubTouches = [];
    for (const g of [...this.groups.values()]) {
      const o = this._report(g, members.get(g.id) || [], now);
      if (!o) {
        if (g.out) out.push({ type: 'up', id: g.id, wallId: g.out.wallId, x: g.out.x, y: g.out.y, t: now, duration: (now - g.downAt) / 1000 });
        this.groups.delete(g.id);
        continue;
      }
      if (g.out && g.out.wallId !== o.wallId) {
        // fromX: where it left the previous wall (its edge there), for outputs that only carry one of the two walls
        const fromX = this.right.get(g.out.wallId) === o.wallId ? this.widths.get(g.out.wallId) : 0;
        out.push({ type: 'cross', id: g.id, from: g.out.wallId, to: o.wallId, wallId: o.wallId, x: o.x, y: o.y, fromX, t: now, duration: (now - g.downAt) / 1000 });
      }
      g.out = o;
      pubTouches.push(o);
    }
    return { touches: pubTouches, events: out };
  }

  /** The public touch of a group this tick, or null when the hand is gone. */
  _report(g, members, now) {
    const P = this.p;
    const dt = Math.max(0, now - g.t);
    g.t = now;
    const base = { id: g.id, age: (now - g.downAt) / 1000 };
    // which corner (if any): two tracks across one, else the freshest track's — kept while it stays in that corner
    let corner = null;
    for (const a of members) for (const b of members) if (this.right.get(a.wallId) === b.wallId) corner = { left: a.wallId, right: b.wallId };
    if (!corner && members.length) {
      const m = members.reduce((a, b) => (a.seenMs <= b.seenMs ? a : b));
      const c = this._cornerOf(m.wallId, m.x);
      if (g.corner && this._u(g.corner, m.wallId, m.x) !== null && (c || Math.abs(this._u(g.corner, m.wallId, m.x)) <= P.edgeZone + 0.15)) corner = g.corner;
      else if (c) corner = { left: c.left, right: c.right };
    }
    if (!members.length) corner = g.corner;
    if (corner) members = members.filter((m) => this._u(corner, m.wallId, m.x) !== null);

    if (!corner) {
      // away from corners: the wall's own track, untouched
      g.corner = null; g.est = null; g.uS = null;
      if (!members.length) return null;
      const m = members.reduce((a, b) => (a.seenMs <= b.seenMs ? a : b));
      return { ...base, wallId: m.wallId, x: m.x, y: m.y, vx: m.vx, vy: m.vy, size: m.size, coasting: m.coasting };
    }
    if (!g.corner || g.corner.left !== corner.left || g.corner.right !== corner.right) g.uS = null;
    g.corner = corner;

    // estimates in corner coordinates; a reading older than the trackers' own prediction is carried at its speed
    // while it heads into / through the corner — that is what bridges the blind stretch between the walls
    let su = 0, sy = 0, svu = 0, svy = 0, sw = 0, size = 0, fresh = false;
    for (const m of members) {
      const u0 = this._u(corner, m.wallId, m.x);
      const age = Math.max(0, m.seenMs - P.predictMs);
      const heading = Math.abs(m.vx) >= P.minSpeed && (u0 * m.vx < 0 || Math.abs(u0) < P.edgeZone + 0.1);
      const u = u0 + (heading ? m.vx * Math.min(age, P.bridgeMs) / 1000 : 0);
      const w = Math.exp(-m.seenMs / P.recentMs) + 1e-6;
      su += u * w; sy += m.y * w; svu += m.vx * w; svy += m.vy * w; sw += w; size = Math.max(size, m.size);
      if (m.seenMs <= P.freshMs) fresh = true;
    }
    let est;
    if (members.length) {
      est = { u: su / sw, y: sy / sw, vu: svu / sw, vy: svy / sw, size, t: fresh ? now : (g.est?.t ?? now) };
    } else {
      // no track at all (both sides blind): carry the hand at its speed for a moment if it was heading this way
      const e = g.est;
      // (heading into the corner, or through it and not yet past the far wall's corner zone)
      const heading = e && Math.abs(e.vu) >= P.minSpeed && (e.u * e.vu < 0 || Math.abs(e.u) < P.edgeZone + 0.1);
      if (!e || !heading || now - e.t > P.bridgeMs) return null;
      est = { ...e, u: e.u + (e.vu * dt) / 1000 };
    }
    // never carried further than the corner zone on the far side
    est.u = Math.max(-P.edgeZone - 0.15, Math.min(P.edgeZone + 0.15, est.u));
    g.est = est;
    g.uS = g.uS == null ? est.u : g.uS + (est.u - g.uS) * (1 - Math.exp(-dt / P.tauMs));
    const onLeft = g.uS < 0;
    const wallId = onLeft ? corner.left : corner.right;
    const x = onLeft ? this.widths.get(corner.left) + g.uS : g.uS;
    return { ...base, wallId, x, y: est.y, vx: est.vu, vy: est.vy, size: est.size || 0.08, coasting: !fresh };
  }
}
