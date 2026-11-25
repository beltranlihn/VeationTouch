// Ressonància — the hold-targets (plan 05 §2.6, direction D3b): «rest and hold, never strike». Pure (no DOM, no GL, no audio).
//
// KEEP IDENTICAL: ressonancia/targets.js and ressonancia-sound/targets.js (a piece imports only from its own folder).
//
// One pattern for the whole work: a visible target (Ø ≥ 0.44 m) within reach → a hand rests on it ≈ 0.5 s (it CHARGES: the ring
// fills, a sound at once) → it is ACTIVE and held ≈ 0.5 s more → DONE, and the next one lights elsewhere. Free touch still answers,
// but what moves the work forward is resting and holding. Nothing here measures a strike, a tempo or a landing window.
//
// The score creates it, offers a stage and steps it; its list travels in S.targets (the sound leads, the image copies it).
//
//   const TG = createTargets({ lengths, heights, masks, seed, emit });
//   TG.offer({ mode, goal, need, walls, y: [0.9, 1.4], r: 0.22, shape, w, h, y0, y1, charge: 0.5, hold: 0.5, grace: 0.8, pairs, kind, rungs, sides, chains, life, max });
//     shape: 'disc' (r; the default) | 'rect' (a block w × h centred at y; each ≥ 0.4 m) | 'pillar' (w wide from y0 to y1; y is its middle).
//     A hand is inside within +0.10 m of the shape. Targets keep ≥ 0.36 m between their edges (0.18 when a crowded person needs one).
//   TG.place({ wall, dx, y, kind, life, chain, dir, shape, w, h, y0, y1 });   // one explicit target (the echo's arrival, the wait's ring…), any mode
//   TG.clear();                                      // no targets (a stage without them)
//   TG.step(dt, strokes, n, now);                    // strokes = S.strokes ({ stroke, wall, dx, s, y }), n = S.n, now = S.clock
//   TG.list      → S.targets: [{ id, wall, dx, s, y, r, shape, w, h (m; a disc: w = h = 2r), kind, mode, state: 'idle'|'charging'|'active'|'done', charge 0..1, hold 0..1,
//                               on (hands inside now), chain, link (its number in its chain), rung, side (−1 left of the wall's centre,
//                               +1 right), pairOf (id | 0), bornAt, doneAt, life, dir (placed ones: the way a wave travels along the
//                               perimeter, +1 / −1; 0 = none) }]
//   TG.progress  0..1 of the stage's goal · TG.reached (the goal was met) · TG.stats { done, links, ladders, together, byWall[], bySide[][2] }
//   TG.need      the together-call's need now · TG.activeN  how many are active now
//   events (through `emit`, else TG.drain()): 'tg:on:<id>' 'tg:charge:<id>' 'tg:active:<id>' 'tg:done:<id>' 'tg:off:<id>' (gone unused)
//                                               'tg:link:<chain>' 'tg:ladder:<chain>' 'tg:goal'
//
// Modes:
//   field     N targets at once over the walls; goal = how many must be DONE (a number or n => number).
//   chain     a head per chain; when it is done the next link lights 0.8–2.5 m away (it may turn a corner); goal = links.
//   together  the collective call: `need` targets ACTIVE AT THE SAME TIME for `hold` s (no time window: they wait); need defaults to
//             clamp(round(0.35 × n / 1.6), 1, 6). An active target stays active while held. goal reached once per offer.
//   ladder    a vertical chain: the next rung is born above (or below) the last one on the same wall; a whole ladder = 'tg:ladder';
//             goal = ladders. `rungs` (m from the floor, default up [0.9, 1.25, 1.6]); when a rung is above 1.4 m every other ladder
//             (and every ladder of a person whose hands are low) uses the child's rungs (default [0.7, 1.05, 1.4]; `kidRungs`).
//   manual    only what place() puts.
//
// Rules (D3b, D8): centre between 0.9 and 1.4 m by default; ≥ 0.5 m from a corner, ≥ 0.8 m from another target (0.62 when a crowded
// person needs one; a pair 0.6–1.2 m), never inside a mask;
// at least one FREE target on every offered wall and one within 1.2 m of every person (hands < 1.6 m apart = one person); a target
// held by one person does not count as free for another (no monopoly: another lights beside her); alive = clamp(ceil(0.75 n) + walls,
// 4, 16) in field/together; never more than 16 drawn (when full, an unused one far from every hand is recycled). Charging: any hand
// inside (r + 0.10 m), whatever its stroke; without a hand the charge is KEPT for `grace` s and then drains in 3 s (the sensor drops
// hands: nobody has to insist or repeat).

export const TG = { r: 0.22, catch: 0.10, charge: 0.5, hold: 0.5, grace: 0.8, decay: 3, corner: 0.5, apart: 0.8, near: 1.2, person: 1.6,
  pair: [0.6, 1.2], link: [0.8, 2.5], keepDone: 0.8, max: 16, drawn: 20, holdGrace: 0.35, y: [0.9, 1.4], rungs: [0.9, 1.25, 1.6], kidRungs: [0.7, 1.05, 1.4] };

export function createTargets(opt = {}) {
  const LEN = (opt.lengths && opt.lengths.length ? opt.lengths : [7.33, 6.483, 7.353, 6.411]).map((l) => (l > 0 ? l : 6.9));
  const W = LEN.length, HGT = LEN.map((_, w) => (opt.heights && opt.heights[w] > 0 ? opt.heights[w] : 3.75));
  const MASK = LEN.map((_, w) => (opt.masks && Array.isArray(opt.masks[w]) ? opt.masks[w] : []));   // [{ dx0, dx1, y0, y1 }] m, dx from the wall's centre
  const S0 = LEN.reduce((a, l, w) => { a.push(w ? a[w - 1] + LEN[w - 1] : 0); return a; }, []), PER = LEN.reduce((a, b) => a + b, 0);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap = (x) => ((x % PER) + PER) % PER;
  const cd = (a, b) => { const d = wrap(a - b); return d > PER / 2 ? d - PER : d; };   // circular a − b along the perimeter
  const sOf = (w, dx) => wrap(S0[w] + LEN[w] / 2 + dx);
  const wallAt = (s) => { s = wrap(s); for (let w = W - 1; w >= 0; w--) if (s >= S0[w]) return w; return 0; };
  let seed = (opt.seed >>> 0) || 1;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const queue = [], emit = typeof opt.emit === 'function' ? opt.emit : (e) => queue.push(e);

  const list = [], inner = new Map();   // inner: id → { lost, occ (person index or −1), by (person index that did it) }
  let spec = null, now = 0, idSeq = 0, chainSeq = 0, ladderSeq = 0, togetherT = 0, goalN = 0;
  const api = { list, progress: 0, reached: false, need: 1, activeN: 0, n: 0,
    stats: { done: 0, links: 0, ladders: 0, together: 0, byWall: LEN.map(() => 0), bySide: LEN.map(() => [0, 0]) } };

  // ---- placement
  // 25-11 (Beltrán): every stage's target is an object of its world with its own SHAPE — 'disc' (r), 'rect' (a block or slab w × h
  // centred at (s, y)), 'pillar' (a column w wide from y0 to y1: anybody of any height can hold it). Half extents of a shape:
  const SHAPES = { disc: 1, rect: 1, pillar: 1 };
  function shapeOf(o = {}) {
    const sh = SHAPES[o.shape] ? o.shape : SHAPES[spec && spec.shape] ? spec.shape : 'disc', r = o.r > 0 ? o.r : spec && spec.r > 0 ? spec.r : TG.r;
    if (sh === 'disc') return { shape: sh, r, w: 2 * r, h: 2 * r, hx: r, hy: r, yc: null };
    const w = Math.max(0.4, o.w || (spec && spec.w) || (sh === 'pillar' ? 0.5 : 0.6));
    if (sh === 'pillar') { const y0 = o.y0 ?? (spec && spec.y0) ?? 0.6, y1 = Math.max(y0 + 0.4, o.y1 ?? (spec && spec.y1) ?? 2.2); return { shape: sh, r, w, h: y1 - y0, hx: w / 2, hy: (y1 - y0) / 2, yc: (y0 + y1) / 2 }; }
    const h = Math.max(0.4, o.h || (spec && spec.h) || 0.4); return { shape: sh, r, w, h, hx: w / 2, hy: h / 2, yc: null };
  }
  const halfOf = (t) => (t.shape === 'disc' || !t.shape ? [t.r, t.r] : [t.w / 2, t.h / 2]);
  // the gap between two shapes (boxes; discs as their squares), ≥ 0 when apart
  const gapOf = (ds, dy, ax, ay, bx, by) => Math.max(Math.abs(ds) - ax - bx, Math.abs(dy) - ay - by);
  function free(w, dx, y, r, ignore, partner, sh) {
    sh = sh || shapeOf(); const hx = sh.hx, hy = sh.hy;
    if (Math.abs(dx) + hx > LEN[w] / 2 - (TG.corner - TG.r) + 1e-6) return false;   // ≥ 0.5 m from a corner (a disc's centre; any shape's edge ≥ 0.28 m)
    if (y - hy < 0.05 || y + hy > HGT[w] - 0.05) return false;
    for (const m of MASK[w]) if (dx + hx > m.dx0 && dx - hx < m.dx1 && y + hy > m.y0 && y - hy < m.y1) return false;
    const s = sOf(w, dx), apart = spec && spec.apart > 0 ? spec.apart : TG.apart, minGap = apart - 2 * TG.r, pairGap = TG.pair[0] - 2 * TG.r;
    if (!opt.underHands) for (const h of handNear) if (sh.shape === 'disc' ? Math.hypot(cd(h.s, s), h.y - y) < r + TG.catch + 0.1 : Math.abs(cd(h.s, s)) < hx + TG.catch + 0.1 && Math.abs(h.y - y) < hy + TG.catch + 0.1) return false;   // never born under a resting hand: a hand has to come to it
    for (const t of list) {
      if (t.id === ignore) continue;
      const [bx, by] = halfOf(t), g = gapOf(cd(t.s, s), t.y - y, hx, hy, bx, by);
      if (g < (partner && t.id === partner ? pairGap : minGap) - 1e-9) return false;
    }
    return true;
  }
  function band() { const sh = shapeOf(); if (sh.yc != null) return [sh.yc, sh.yc]; const b = spec && spec.y ? spec.y : TG.y; return [Math.min(b[0], b[1]), Math.max(b[0], b[1])]; }
  function make(w, dx, y, extra = {}) {
    const sh = shapeOf(extra), r = sh.r;
    if (sh.yc != null) y = sh.yc;
    const t = { id: ++idSeq, wall: w, dx, s: sOf(w, dx), y, r, shape: sh.shape, w: sh.w, h: sh.h, kind: (spec && spec.kind) || extra.kind || '', mode: spec ? spec.mode : 'manual', state: 'idle',
      charge: 0, hold: 0, on: 0, chain: 0, link: 0, rung: -1, side: dx < 0 ? -1 : 1, pairOf: 0, bornAt: now, doneAt: 0, life: 0, dir: 0, ...extra };
    t.shape = sh.shape; t.w = sh.w; t.h = sh.h; t.r = r; delete t.y0; delete t.y1;
    list.push(t); inner.set(t.id, { lost: 0, occ: -1, by: -1, kid: false, dir: 1 }); emit('tg:on:' + t.id);
    return t;
  }
  function remove(t, silent) { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); inner.delete(t.id); if (!silent) emit('tg:off:' + t.id); }
  // a free spot near a perimeter position: tries outwards from `s` between d0 and d1 m, on either side (or `dir` first)
  function spotNear(s, y, d0, d1, dir, sameWall, partner) {
    const r = spec && spec.r > 0 ? spec.r : TG.r, [y0, y1] = band();
    const w0 = wallAt(s);
    for (let k = 0; k < 16; k++) {
      const d = d0 + (d1 - d0) * (k < 8 ? rnd() : (k - 8) / 8), sg = dir ? (k % 3 === 2 ? -dir : dir) : rnd() < 0.5 ? -1 : 1;
      let ss = wrap(s + sg * d), w = wallAt(ss);
      if (sameWall && w !== w0) continue;
      let dx = ss - S0[w] - LEN[w] / 2;
      const lim = LEN[w] / 2 - TG.corner;
      if (Math.abs(dx) > lim) {   // inside a corner's margin: step past the corner (or back) to the nearest allowed spot
        if (sameWall) dx = Math.sign(dx) * lim;
        else if (sg > 0 === dx > 0) { w = (w + (dx > 0 ? 1 : W - 1)) % W; dx = dx > 0 ? -(LEN[w] / 2 - TG.corner) : LEN[w] / 2 - TG.corner; }
        else dx = Math.sign(dx) * lim;
      }
      const yy = k >= 8 ? (k % 2 ? y0 : y1) : clamp(y + (k ? (rnd() - 0.5) * 0.3 : 0), y0, y1);   // late tries: the band's edges (a crowd's hands block the middle)
      if (free(w, dx, yy, r, 0, partner)) return { w, dx, y: yy };
    }
    return null;
  }
  function spotOnWall(w, side) {
    const r = spec && spec.r > 0 ? spec.r : TG.r, [y0, y1] = band(), lim = LEN[w] / 2 - TG.corner, cg = spec && spec.cluster ? spec.clusterGap || 2 : 0;
    for (let k = 0; k < 14; k++) {
      let dx = (rnd() * 2 - 1) * lim; if (side) dx = side * Math.abs(dx) * 0.9 + side * 0.1 * lim;
      const y = y0 + (y1 - y0) * rnd();
      if (cg && k < 10) { const s = sOf(w, dx); let near = false; for (const t of list) if (t.state !== 'done' && Math.abs(cd(t.s, s)) < cg) { near = true; break; } if (near) continue; }   // clusters ≥ clusterGap apart
      if (free(w, dx, y, r)) return { w, dx, y };
    }
    return null;
  }
  // 25-11 (AD): spec.cluster = [min, max]: a seed's cluster — its siblings 0.6–1.0 m from it on the same wall, at heights varied within
  // the band (one of them at a child's height, ≤ childY)
  function addCluster(t) {
    if (!spec || !spec.cluster || t.mode !== 'field') return;
    const [a, b] = spec.cluster, n = a + Math.floor(rnd() * (b - a + 1)), [y0, y1] = band(), childY = spec.childY || 1.3;
    let last = t;
    for (let k = 1; k < n && !full(); k++) {
      const y = k === 1 ? y0 + (Math.min(childY, y1) - y0) * rnd() : y0 + (y1 - y0) * rnd();
      const sp = spotNear(last.s, y, 0.6, 1.0, k % 2 ? 1 : -1, true, last.id) || spotNear(t.s, y, 0.6, 1.0, k % 2 ? -1 : 1, true, t.id);
      if (!sp) break;
      last = make(sp.w, sp.dx, sp.y, { cluster: t.id }); t.cluster = t.id;
    }
  }

  // ---- the people: hands sorted along the room; a person = hands within 1.6 m of her first one
  const people = [], handBuf = [], handNear = [], recentH = [];   // handNear: the hands now + the ones seen in the last second (a resting hand the sensor drops for a moment is still there)
  function group(strokes) {
    people.length = 0;
    for (const h of handBuf) { if (recentH.length >= 64) recentH.shift(); recentH.push({ s: h.s, y: h.y, t: now }); }
    while (recentH.length && now - recentH[0].t > 1) recentH.shift();
    handBuf.length = 0;
    for (const h of strokes || []) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      const s = typeof h.s === 'number' && isFinite(h.s) ? wrap(h.s) : sOf(h.wall, h.dx || 0);
      handBuf.push({ s, y: typeof h.y === 'number' && isFinite(h.y) ? h.y : 1.1, wall: h.wall, p: -1 });
    }
    handBuf.sort((a, b) => a.s - b.s);
    handNear.length = 0; for (const h of handBuf) handNear.push(h); for (const h of recentH) handNear.push(h);
    for (const h of handBuf) {
      const last = people[people.length - 1];
      if (last && h.s - last.s0 <= TG.person) { last.hands.push(h); h.p = people.length - 1; }
      else { people.push({ s0: h.s, s: h.s, y: h.y, wall: h.wall, hands: [h] }); h.p = people.length - 1; }
    }
    if (people.length > 1) {   // across the seam: the last person and the first may be one
      const a = people[people.length - 1], b = people[0];
      if (wrap(b.hands[b.hands.length - 1].s - a.s0) <= TG.person) { for (const h of b.hands) { a.hands.push(h); } people.shift(); }
    }
    people.forEach((p, i) => {
      let sx = 0; const ys = [];
      for (const h of p.hands) { h.p = i; sx += cd(h.s, p.s0); ys.push(h.y); }
      p.s = wrap(p.s0 + sx / p.hands.length); ys.sort((a, b) => a - b); p.y = ys[ys.length >> 1]; p.wall = wallAt(p.s);
    });
  }

  // ---- the stage
  function offer(o = {}) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].state !== 'done') remove(list[i]);
    spec = { mode: 'field', walls: null, pairs: false, ...o };
    if (!spec.walls) spec.walls = LEN.map((_, w) => w);
    goalN = 0; togetherT = 0; api.reached = false; api.progress = 0;
    const st = api.stats; st.done = 0; st.links = 0; st.ladders = 0; st.together = 0; st.byWall.fill(0); for (const b of st.bySide) b[0] = b[1] = 0;
    return api;
  }
  function clear() { for (let i = list.length - 1; i >= 0; i--) if (list[i].state !== 'done') remove(list[i]); spec = null; api.progress = 0; api.reached = false; }
  function place(p = {}) {
    if (!(p.wall >= 0 && p.wall < W)) return null;
    if (full()) recycle(true);
    if (full()) return null;
    const lim = LEN[p.wall] / 2 - TG.corner, dx = clamp(p.dx || 0, -lim, lim), y = clamp(p.y ?? 1.2, 0.3, HGT[p.wall] - 0.3);
    const ex = { kind: p.kind || (spec && spec.kind) || '', life: p.life || 0, chain: p.chain || 0, dir: p.dir || 0, placed: true };
    for (const k of ['shape', 'w', 'h', 'y0', 'y1', 'r']) if (p[k] != null) ex[k] = p[k];
    return make(p.wall, dx, y, ex);
  }
  // when the room is full: an unused target nobody needs — not the last free one of its wall, and every person near it has another
  // one near her — the oldest first (force: any unused one)
  function recycle(force) {
    let best = null;
    const nearR = coverR();
    for (const t of list) {
      if (t.state !== 'idle' || t.charge > 0 || t.placed) continue;
      if (!force) {
        let onWall = 0; for (const u of list) if (u !== t && u.wall === t.wall && u.state !== 'done' && u.on === 0) onWall++;
        if (onWall < 1) continue;
        let needed = false;
        for (const p of handBuf) {
          if (Math.abs(cd(t.s, p.s)) > nearR) continue;
          let other = false; for (const u of list) if (u !== t && u.state !== 'done' && Math.abs(cd(u.s, p.s)) <= nearR) { other = true; break; }
          if (!other) { needed = true; break; }
        }
        if (needed) continue;
      }
      if (!best || t.bornAt < best.bornAt) best = t;
    }
    if (best) { remove(best); return true; }
    return false;
  }
  const coverR = () => (spec && spec.mode === 'chain' ? TG.link[1] + 0.1 : spec && spec.mode === 'ladder' ? 1.4 : TG.near);
  const aliveN = () => { let c = 0; for (const t of list) if (t.state !== 'done') c++; return c; };
  const full = () => aliveN() >= TG.max || list.length >= TG.drawn;   // ≤ 16 alive; + the ones finishing (≤ 20 drawn)
  const goalOf = () => { const g = spec.goal; const v = typeof g === 'function' ? g(api.n) : g; return typeof v === 'number' && isFinite(v) && v > 0 ? v : Infinity; };
  const needOf = () => { const q = spec.need; const v = typeof q === 'function' ? q(api.n) : q; return typeof v === 'number' && v > 0 ? Math.round(v) : clamp(Math.round((0.35 * api.n) / 1.6), 1, 6); };
  const rungsOf = (kid) => { const R = spec.rungs || TG.rungs; return kid && Math.max(...R) > 1.4 ? spec.kidRungs || TG.kidRungs : R; };

  // a person's head: a chain head / a ladder's first rung / a field target (a pair with `pairs`)
  function headFor(p, idx) {
    const m = spec.mode, R = spec.r > 0 ? spec.r : TG.r;
    if (full() && !recycle(false)) return;
    if (m === 'ladder') {
      const kid = p.y < 1.15 || ladderSeq % 2 === 1, R0 = rungsOf(kid);
      const sp = spotNear(p.s, R0[0], 0.3, 0.9, 0, true); if (!sp) return;
      const yy = R0[0]; if (!free(sp.w, sp.dx, yy, R)) return;
      const t = make(sp.w, sp.dx, yy, { chain: ++chainSeq, link: 0, rung: 0 }); ladderSeq++; inner.get(t.id).kid = R0 !== (spec.rungs || TG.rungs);
      return;
    }
    const yP = spec.cluster ? band()[0] + (band()[1] - band()[0]) * rnd() : clamp(p.y, ...band());   // clusters: heights varied
    let sp = spotNear(p.s, yP, 0.6, 1.1, 0, false) || spotNear(p.s, clamp(p.y, ...band()), 0.3, 1.15, 0, false);
    if (!sp) { const a = spec.apart; spec.apart = 0.62; sp = spotNear(p.s, clamp(p.y, ...band()), 0.3, 1.15, 0, false); spec.apart = a; }   // a crowded spot: a little closer
    if (!sp) return;
    const t = make(sp.w, sp.dx, sp.y, m === 'chain' ? { chain: ++chainSeq, link: 0 } : {});
    if (m === 'chain') inner.get(t.id).dir = rnd() < 0.5 ? -1 : 1;
    if (spec.cluster && m === 'field') { addCluster(t); return; }   // near a person too: a small cluster, not a lone one
    if (spec.pairs && (m === 'field' || m === 'together') && api.n <= 6 && aliveN() < TG.max - 2 && list.length < TG.drawn - 2) {   // two hands: a second one beside it, an offer (small groups: with many people the room needs the targets spread)
      const side = cd(t.s, p.s) >= 0 ? 1 : -1;
      const q = spotNear(t.s, t.y, TG.pair[0], TG.pair[1], -side, false, t.id) || spotNear(t.s, t.y, TG.pair[0], TG.pair[1], side, false, t.id);
      if (q) { const u = make(q.w, q.dx, q.y, {}); u.pairOf = t.id; t.pairOf = u.id; }
    }
  }
  // what follows a done target in a chain or a ladder
  function next(t) {
    const m = spec.mode, I = inner.get(t.id);
    if (m === 'chain') {
      // toward the nearest other person within 6 m (the fire is passed on), else along the chain's own direction
      let dir = I ? I.dir : 1, bd = 6;
      for (let i = 0; i < people.length; i++) { if (i === (I ? I.by : -1)) continue; const d = cd(people[i].s, t.s); if (Math.abs(d) > 1.6 && Math.abs(d) < bd) { bd = Math.abs(d); dir = Math.sign(d); } }
      const sp = spotNear(t.s, t.y, TG.link[0], TG.link[0] + 0.8, dir, false) || spotNear(t.s, t.y, TG.link[0], TG.link[1], dir, false);
      if (!sp) return;
      const u = make(sp.w, sp.dx, sp.y, { chain: t.chain, link: t.link + 1 }); inner.get(u.id).dir = dir;
    } else if (m === 'ladder') {
      const R0 = rungsOf(I && I.kid);
      if (t.rung + 1 >= R0.length) {   // the ladder is whole
        api.stats.ladders++; api.stats.bySide[t.wall][t.side < 0 ? 0 : 1]++; emit('tg:ladder:' + t.chain);
        return;   // the person's next ladder is born by the coverage
      }
      const yy = R0[t.rung + 1], R = spec.r > 0 ? spec.r : TG.r;
      for (let k = 0; k < 8; k++) {
        const dx = clamp(t.dx + (rnd() - 0.5) * 0.4, -(LEN[t.wall] / 2 - TG.corner), LEN[t.wall] / 2 - TG.corner);
        if (free(t.wall, dx, yy, R, t.id)) { const u = make(t.wall, dx, yy, { chain: t.chain, link: t.link + 1, rung: t.rung + 1 }); inner.get(u.id).kid = I && I.kid; return; }
      }
      const u = make(t.wall, t.dx, yy, { chain: t.chain, link: t.link + 1, rung: t.rung + 1 }); inner.get(u.id).kid = I && I.kid;   // the rung above, whatever
    }
  }
  function finish(t, I) {
    t.state = 'done'; t.doneAt = now; t.charge = 1; t.hold = 1;
    const st = api.stats; st.done++; st.byWall[t.wall]++;
    emit('tg:done:' + t.id);
    if (spec && (spec.mode === 'chain' || spec.mode === 'ladder') && !t.placed) { st.links++; emit('tg:link:' + t.chain); }
    if (spec && !t.placed) next(t);
  }

  function step(dt, strokes, n, clock) {
    now = typeof clock === 'number' && isFinite(clock) ? clock : now + dt;
    api.n = Math.max(0, n || 0);
    group(strokes);
    const chargeT = (spec && spec.charge) || TG.charge, holdT = (spec && spec.hold) || TG.hold, grace = (spec && spec.grace) || TG.grace;
    const together = spec && spec.mode === 'together';
    // 1. who is inside each target; charge, hold, grace
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i], I = inner.get(t.id);
      if (t.state === 'done') { if (now - t.doneAt >= TG.keepDone) remove(t, true); continue; }
      let on = 0, occ = -1; const cr = t.r + TG.catch, [hx, hy] = halfOf(t), box = t.shape && t.shape !== 'disc';
      for (const h of handBuf) {
        const ds = Math.abs(cd(h.s, t.s)), dy = Math.abs(h.y - t.y);
        if (box ? ds <= hx + TG.catch && dy <= hy + TG.catch : ds <= cr && dy <= cr && Math.hypot(ds, dy) <= cr) { on++; occ = h.p; I.occS = h.s; }
      }
      t.on = on; I.occ = occ; if (!on) I.occS = NaN;
      if (on) {
        I.lost = 0; I.by = occ;
        if (t.state === 'idle') { t.state = 'charging'; emit('tg:charge:' + t.id); }
        if (t.state === 'charging') { t.charge = Math.min(1, t.charge + dt / chargeT); if (t.charge >= 1) { t.state = 'active'; t.hold = 0; emit('tg:active:' + t.id); } }
        else if (t.state === 'active' && !together) { t.hold = Math.min(1, t.hold + dt / holdT); if (t.hold >= 1) finish(t, I); }
      } else {
        I.lost += dt;
        // the HOLD forgives only the sensor's drops (holdGrace); the CHARGE is kept for grace s: a tap never completes a target
        if (t.state === 'active' && I.lost > TG.holdGrace) { if (together) { if (I.lost > grace) t.state = 'charging'; } else { t.state = 'charging'; t.hold = 0; } }
        if (I.lost > grace) {
          if (t.state === 'charging') { t.charge = Math.max(0, t.charge - dt / TG.decay); if (t.charge <= 0) t.state = 'idle'; }
        }
        if (t.life > 0 && t.state === 'idle' && now - t.bornAt >= t.life) { remove(t); continue; }
      }
    }
    let active = 0, heldNow = 0, heldTol = 0;
    for (const t of list) if (t.state === 'active') { active++; const I = inner.get(t.id); if (t.on) heldNow++; if (t.on || I.lost <= TG.holdGrace) heldTol++; }
    api.activeN = active;
    if (!spec) { api.progress = 0; return api; }
    // 2. the goal
    if (together) {
      api.need = needOf();
      if (!api.reached) {
        // the time held together counts only while the hands are there (a drop of ≤ holdGrace s pauses it; a tap's gap undoes it)
        if (heldNow >= api.need) togetherT += dt; else if (heldTol < api.need) togetherT = Math.max(0, togetherT - dt * 2);
        let partial = 0; for (const t of list) if (t.state === 'charging') partial += t.charge;
        api.progress = clamp((Math.min(active + 0.5 * partial, api.need) / api.need) * 0.85 + 0.15 * (togetherT / holdT), 0, 1);
        if (togetherT >= holdT) {
          for (const t of list) if (t.state === 'active') finish(t, inner.get(t.id));
          api.stats.together++; api.reached = true; api.progress = 1; emit('tg:goal');
        }
      }
    } else if (spec.mode !== 'manual') {
      const g = goalOf(), st = api.stats, v = spec.mode === 'field' ? st.done : spec.mode === 'chain' ? st.links : st.ladders;
      api.progress = g === Infinity ? 0 : clamp(v / g, 0, 1);
      if (!api.reached && v >= g) { api.reached = true; emit('tg:goal'); }
    }
    if (spec.mode === 'manual' || (together && api.reached)) return api;
    // 3. coverage: every person has a free target near her; every offered wall has a free one; field/together fill up to `alive`
    const m = spec.mode, nearR = coverR();
    // checked hand by hand: a target held by a hand more than 0.9 m away (somebody else) is not free for this one (no monopoly)
    for (const h of handBuf) {
      let ok = false;
      for (const t of list) {
        if (t.state === 'done') continue;
        const I = inner.get(t.id);
        if (t.on && !(Math.abs(cd(I.occS, h.s)) <= 0.9)) continue;
        if (Math.abs(cd(t.s, h.s)) <= nearR) { ok = true; break; }
      }
      if (!ok) headFor({ s: h.s, y: h.y, hands: people[h.p] ? people[h.p].hands : [h] }, h.p);
    }
    const maxAlive = Math.min(TG.max, spec.max > 0 ? spec.max : TG.max);
    for (const w of spec.walls) {
      const sides = spec.sides && m === 'ladder' ? [-1, 1] : [0];
      for (const sd of sides) {
        let has = false;
        for (const t of list) if (t.wall === w && t.state !== 'done' && t.on === 0 && (!sd || t.side === sd)) { has = true; break; }
        if (has || ((aliveN() >= maxAlive || list.length >= TG.drawn) && !recycle(false))) continue;
        if (m === 'ladder') {
          const kid = ladderSeq % 2 === 1, R0 = rungsOf(kid), sp = spotOnWall(w, sd); if (!sp) continue;
          const R = spec.r > 0 ? spec.r : TG.r; if (!free(w, sp.dx, R0[0], R)) continue;
          const t = make(w, sp.dx, R0[0], { chain: ++chainSeq, link: 0, rung: 0 }); ladderSeq++; inner.get(t.id).kid = R0 !== (spec.rungs || TG.rungs);
        } else {
          const sp = spotOnWall(w, 0); if (!sp) continue;
          if (m === 'field' && spec.cluster) { addCluster(make(sp.w, sp.dx, sp.y)); continue; }
          const t = make(w, sp.dx, sp.y, m === 'chain' ? { chain: ++chainSeq } : {}); if (m === 'chain') inner.get(t.id).dir = rnd() < 0.5 ? -1 : 1;
        }
      }
    }
    if (m === 'field' || m === 'together') {
      const want = Math.min(maxAlive, clamp(Math.ceil(0.75 * api.n) + spec.walls.length, 4, TG.max));
      let alive = 0; for (const t of list) if (t.state !== 'done') alive++;
      for (let k = 0; k < 4 && alive < want && !full(); k++) {
        // the wall with the fewest targets per hand on it (walls with people first)
        let bw = -1, bv = Infinity;
        for (const w of spec.walls) { let c = 0, hn = 0; for (const t of list) if (t.wall === w && t.state !== 'done') c++; for (const h of handBuf) if (h.wall === w) hn++; const v = (c + 1) / (hn + 1); if (v < bv) { bv = v; bw = w; } }
        if (bw < 0) break;
        const sp = spotOnWall(bw, 0); if (!sp) break;
        const t0 = make(sp.w, sp.dx, sp.y); alive++; if (spec.cluster) { const n0 = list.length; addCluster(t0); alive += list.length - n0; }
      }
    }
    return api;
  }

  api.offer = offer; api.clear = clear; api.place = place; api.step = step;
  api.drain = () => queue.splice(0);
  api.spec = () => spec;
  api.people = () => people.map((p) => ({ s: p.s, y: p.y, wall: p.wall, hands: p.hands.length }));
  return api;
}
