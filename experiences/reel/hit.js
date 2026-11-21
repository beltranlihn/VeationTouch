// Reel — what a hand touches (pure: no DOM, no GPU; tests/reel.test.mjs runs it in Node).
//
// A target is a capsule in render px: centre (x, y), visible radius r, inner half-length hx (0 = a circle, > 0 = a pill),
// on wall `wallId` whose scale is `pxPerM`. A hand hits it when it is within the HIT radius of the shape: the visible
// radius x HIT_SCALE, and never less than MIN_HIT_M on the wall (a hand is a hand, whatever the drawing).
// On a closed room the strip is a loop: x differences go the short way round (a hand at x = W − 5 px is 15 px from a
// target at x = 10 px), as makeHands › near does in the runtime.
//
// Two activations, both counted in milliseconds of the page's own clock and both blind to the hands that were already
// on the wall when the scene changed (a hand that held a video to exit lands on the menu: it must lift before it counts):
//   makeDwell  — a hand stays on a target `dwellMs` (default 500) and it fires; leaving empties the ring; two hands on
//                two targets: the first to complete wins. dwellMs 0 = on touch.
//   makeHold   — a hand held still HOLD_MS anywhere (hold-to-exit during a video); a passing touch does nothing.

export const HIT_SCALE = 1.15;   // hit radius = visible radius x this…
export const MIN_HIT_M = 0.25;   // …and never less than this, in metres on the wall
export const HOLD_MS = 1500;     // hold-to-exit: a hand still this long
export const HOLD_STILL_M = 0.15; // "still": within this of where it settled (metres on the wall)

/** The short way round a closed strip of width `W`: a difference of x in (−W/2, W/2]. */
export function wrapDx(dx, W, closed) {
  return closed && W > 0 ? dx - Math.round(dx / W) * W : dx;
}

/** Distance (px) from point (x, y) to the outline-filled shape of target `t` (0 inside its visible shape's core). */
export function shapeDistance(t, x, y, W = 0, closed = false) {
  const dx = wrapDx(x - t.x, W, closed);
  const ex = Math.max(0, Math.abs(dx) - (t.hx || 0));
  return Math.hypot(ex, y - t.y);
}

/** The hit radius of a target, px. */
export function hitRadius(t) {
  return Math.max((t.r || 0) * HIT_SCALE, MIN_HIT_M * (t.pxPerM || 0));
}

/** Is (x, y) on target `t`? */
export function isHit(t, x, y, W = 0, closed = false) {
  return shapeDistance(t, x, y, W, closed) <= hitRadius(t);
}

/** Strokes on the wall when a scene started are not counted until they lift. */
function makeStale() {
  let stale = new Set();
  return {
    reset(hands) { stale = new Set((hands || []).map((h) => h.stroke ?? h.id)); },
    /** The hands that count now: not ended (a hand the tracker lost), not left over from the previous scene. */
    live(hands) {
      const here = new Set();
      const out = [];
      for (const h of hands || []) {
        const s = h.stroke ?? h.id;
        here.add(s);
        if (!stale.has(s) && !h.ended) out.push(h);
      }
      for (const s of [...stale]) if (!here.has(s)) stale.delete(s); // it lifted: from now on a new touch of it counts
      return out;
    },
  };
}

/**
 * Dwell activation. step(targets, hands, dtMs, geo) → { fired, hot }:
 *   fired  the target that completed this step (or null) — the first to complete; on a tie the one held longer
 *   hot    Map target id → { progress 0..1, x, y } of every target a counting hand is on (x, y: the nearest such hand)
 * Only targets with `enabled !== false` respond. geo = { width, closed } of the strip.
 */
export function makeDwell(opt = {}) {
  let dwellMs = Math.max(0, Number(opt.dwellMs ?? 500) || 0);
  const held = new Map(); // target id → ms a counting hand has been on it without a break
  const stale = makeStale();
  return {
    get dwellMs() { return dwellMs; },
    set dwellMs(v) { dwellMs = Math.max(0, Number(v) || 0); },
    /** A new scene: forget the rings; the hands on the wall now must lift before they count. */
    reset(hands = []) { held.clear(); stale.reset(hands); },
    progress: (id) => (dwellMs > 0 ? Math.min(1, (held.get(id) || 0) / dwellMs) : 0),
    step(targets, hands, dtMs, geo = {}) {
      const live = stale.live(hands);
      const W = geo.width || 0, closed = !!geo.closed;
      const hot = new Map();
      let fired = null, best = -1;
      const seen = new Set();
      for (const t of targets || []) {
        if (t.enabled === false) continue;
        let near = null, nd = Infinity;
        for (const h of live) {
          const d = shapeDistance(t, h.x, h.y, W, closed);
          if (d <= hitRadius(t) && d < nd) { nd = d; near = h; }
        }
        if (!near) continue;
        seen.add(t.id);
        const ms = (held.get(t.id) ?? -1) < 0 ? 0 : held.get(t.id) + Math.max(0, dtMs);
        held.set(t.id, ms);
        hot.set(t.id, { progress: dwellMs > 0 ? Math.min(1, ms / dwellMs) : 1, x: near.x, y: near.y });
        if (ms >= dwellMs && ms > best) { best = ms; fired = t; }
      }
      for (const id of [...held.keys()]) if (!seen.has(id)) held.delete(id); // left before the end: the ring empties
      return { fired, hot };
    },
  };
}

/**
 * Hold-to-exit. step(hands, dtMs, pxPerMOf, geo) → { fired, rings }:
 *   rings  [{ stroke, x, y, progress 0..1 }] of the counting hands (where they settled)
 *   fired  true when a hand has been still `holdMs` (it moved less than `stillM` from where it settled)
 * pxPerMOf(wallId) → px per metre of that wall.
 */
export function makeHold(opt = {}) {
  const holdMs = opt.holdMs ?? HOLD_MS, stillM = opt.stillM ?? HOLD_STILL_M;
  const anchors = new Map(); // stroke → { x, y, ms }
  const stale = makeStale();
  return {
    holdMs,
    reset(hands = []) { anchors.clear(); stale.reset(hands); },
    step(hands, dtMs, pxPerMOf = () => 100, geo = {}) {
      const live = stale.live(hands);
      const W = geo.width || 0, closed = !!geo.closed;
      const rings = [];
      let fired = false;
      const seen = new Set();
      for (const h of live) {
        const s = h.stroke ?? h.id;
        seen.add(s);
        let a = anchors.get(s);
        const lim = stillM * (pxPerMOf(h.wallId) || 100);
        if (!a || Math.hypot(wrapDx(h.x - a.x, W, closed), h.y - a.y) > lim) { a = { x: h.x, y: h.y, ms: 0 }; anchors.set(s, a); }
        else a.ms += Math.max(0, dtMs);
        const progress = Math.min(1, a.ms / holdMs);
        rings.push({ stroke: s, x: a.x, y: a.y, progress });
        if (a.ms >= holdMs) fired = true;
      }
      for (const s of [...anchors.keys()]) if (!seen.has(s)) anchors.delete(s);
      return { fired, rings };
    },
  };
}
