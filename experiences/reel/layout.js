// Reel — where things go on the walls (pure: no DOM, no GPU; tests/reel.test.mjs runs it in Node).
//
// Everything is placed in METRES on each wall (x from its left end, y from the floor), then mapped to render px. A wall of
// 3.5 m and one of 2.4 m put their buttons at the same height from the floor: within reach (the lesson of Ambient notes —
// "the middle of the wall" of a 3.5 m wall is out of reach). Targets keep CORNER_M from a wall's ends (the corners), stay
// off its masks (doors, lamps: the sensor does not see there) and their centres stay between REACH[0] and REACH[1].
//
//   landingLayout(walls, opt) → { brands, items }    the brand + "Play Reel" / "See Projects" on every wall, centred on it
//   menuLayout(walls, n, opt) → { blobs, items }     n project blobs: on every wall ('per-wall', the default) or one set
//                                                    spread round the room ('around'); a "Back" button on every wall
//   blobMotion(blobs, t, walls) → blobs moved        a slow drift, pushed apart, kept off corners, masks and out of reach
//   toTarget(item, wall)                             metres → the render-px target hit.js tests (x, y, r, hx, pxPerM)
//
// `walls`: the runtime's vt.walls — { id, rect (render px), width, height (m), pxPerM, masks (render-px boxes) }.

export const CORNER_M = 0.3;            // targets keep this far from a wall's ends
export const REACH = [0.9, 1.7];        // target centres between these heights (m from the floor)
export const BUTTON_BAND = [1.0, 1.5];  // the landing buttons' centres (a narrower band: the first thing anyone touches)
export const MASK_MARGIN_M = 0.05;      // targets keep this far from a mask's box
export const BUTTON = { w: 1.5, h: 0.34, gap: 0.4, wMin: 1.1 };   // a landing button (pill), metres
export const BACK = { w: 0.62, h: 0.3, y: 1.3, gap: 0.15 };        // the menu's "Back" (pill), metres
export const DRIFT = { x: 0.07, y: 0.05 };                          // how far a blob floats from its home, metres
export const BLOB_GAP_M = 0.2;          // between two blobs' discs (drift included)
export const LABEL_W_M = 0.85;          // room a project name needs under a blob (one row)…
export const LABEL_W2_M = 0.9;          // …and with two rows (names above the top row, below the bottom one)
export const LABEL_MAX_M = 1.3;         // the widest a project name may be (it wraps onto a second row past this)
export const NAME_SIZE_M = 0.1;         // a project name's text size, metres (font size)…
export const NAME_MIN_M = 0.09;         // …never below this: ~9 cm is legible from across a room (a name wraps before it shrinks)
export const BLOB_SIZE_M = 0.8;         // the blob diameter asked for by default: the biggest that fits is used, down to MIN_SCALE of it
export const ROW_Y = { one: 1.3, top: 1.65, bottom: 0.95 };          // blob rows, metres from the floor (inside REACH)
export const MIN_SCALE = 0.3;          // blobs shrink down to this on a crowded wall before one is left out
export const BRAND_ART = { w: 1003, h: 952 };                       // the logo composition (blob layer), source px

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** A wall in metres: its masks as boxes in metres (y from the floor). */
export function wallMetres(w) {
  const r = w.rect, W = w.width, H = w.height;
  const masks = (w.masks || []).map((m) => ({
    x0: ((m.x - r.x) / r.w) * W, x1: ((m.x + m.w - r.x) / r.w) * W,
    y0: H - ((m.y + m.h - r.y) / r.h) * H, y1: H - ((m.y - r.y) / r.h) * H,
  }));
  return { id: w.id, width: W, height: H, masks };
}

/** Metres on wall `w` → render px. */
export function toPx(w, xm, ym) {
  const r = w.rect;
  return [r.x + (xm / w.width) * r.w, r.y + (1 - ym / w.height) * r.h];
}

/** An item in metres → the render-px target of hit.js. */
export function toTarget(it, w) {
  const [x, y] = toPx(w, it.xm, it.ym);
  const k = w.pxPerM || w.rect.w / w.width;
  return { id: it.id, kind: it.kind, index: it.index ?? -1, wallId: w.id, x, y, r: it.rm * k, hx: (it.hxm || 0) * k, pxPerM: k };
}

// ------------------------------------------------------------------------------------------------ free room on a wall

/** [lo, hi] minus the `blocks` intervals → sorted disjoint intervals. */
function subtract([lo, hi], blocks) {
  let out = hi >= lo ? [[lo, hi]] : [];
  for (const [a, b] of blocks) {
    const next = [];
    for (const [c, d] of out) {
      if (b <= c || a >= d) { next.push([c, d]); continue; }
      if (a > c) next.push([c, a]);
      if (b < d) next.push([b, d]);
    }
    out = next;
  }
  return out;
}

const intersect = (A, B) => {
  const out = [];
  for (const [a, b] of A) for (const [c, d] of B) { const lo = Math.max(a, c), hi = Math.min(b, d); if (hi >= lo) out.push([lo, hi]); }
  return out.sort((p, q) => p[0] - q[0]);
};
const shift = (A, d) => A.map(([a, b]) => [a + d, b + d]);

/**
 * Where the centre of a shape of half-extents ex × ey at height y may go on wall `wm`: inside the corner margins and off
 * every mask (and every box of `taken`, placed before). → intervals of x (metres).
 */
export function freeCentres(wm, y, ex, ey, taken = []) {
  const blocks = [];
  for (const m of [...wm.masks, ...taken]) {
    const g = m.gap ?? MASK_MARGIN_M;
    if (m.y1 + g <= y - ey || m.y0 - g >= y + ey) continue; // no vertical overlap
    blocks.push([m.x0 - ex - g, m.x1 + ex + g]);
  }
  return subtract([CORNER_M + ex, wm.width - CORNER_M - ex], blocks);
}

/** The x of `intervals` nearest to `x` (null when there is none). */
export function nearest(intervals, x) {
  let best = null, bd = Infinity;
  for (const [a, b] of intervals) {
    const v = clamp(x, a, b), d = Math.abs(v - x);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/**
 * `count` centres in `intervals`, at least `minStep` apart, spread evenly (at most `maxStep` apart) and centred in
 * each interval. null when they do not fit.
 */
export function fitRow(intervals, count, minStep, maxStep = Infinity) {
  if (count <= 0) return [];
  const cap = intervals.map(([a, b]) => Math.floor((b - a) / minStep + 1e-9) + 1);
  if (cap.reduce((s, c) => s + c, 0) < count) return null;
  // items per interval: in proportion to its length (largest remainder), never more than it holds
  const len = intervals.map(([a, b]) => b - a + minStep), total = len.reduce((s, l) => s + l, 0);
  const n = intervals.map((_, i) => Math.min(cap[i], Math.floor((count * len[i]) / total)));
  let left = count - n.reduce((s, c) => s + c, 0);
  const order = intervals.map((_, i) => i).sort((i, j) => ((count * len[j]) / total - n[j]) - ((count * len[i]) / total - n[i]));
  while (left > 0) { let moved = false; for (const i of order) if (left > 0 && n[i] < cap[i]) { n[i]++; left--; moved = true; } if (!moved) return null; }
  const out = [];
  intervals.forEach(([a, b], i) => {
    const c = n[i];
    if (!c) return;
    const step = c > 1 ? Math.min((b - a) / (c - 1), maxStep) : 0, mid = (a + b) / 2;
    for (let k = 0; k < c; k++) out.push(mid + (k - (c - 1) / 2) * step);
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ landing

/** Heights to try for the buttons: the asked one first, then outwards within the band. */
function heightsFrom(y0, band) {
  const out = [y0];
  for (let d = 0.05; d <= band[1] - band[0] + 1e-9; d += 0.05) for (const y of [y0 - d, y0 + d]) if (y >= band[0] - 1e-9 && y <= band[1] + 1e-9) out.push(y);
  return out;
}

/** The two buttons of one wall, in metres, or [] when nothing fits. Side by side, centred on the wall if they can be. */
function placeButtons(wm, y0) {
  const mid = wm.width / 2;
  for (const bw of [BUTTON.w, BUTTON.wMin]) {
    const ex = bw / 2, ey = BUTTON.h / 2, d = (bw + BUTTON.gap) / 2;
    for (const y of heightsFrom(y0, BUTTON_BAND)) {
      const free = freeCentres(wm, y, ex, ey);
      const cx = nearest(intersect(shift(free, d), shift(free, -d)), mid); // both centres (cx − d, cx + d) free
      if (cx !== null) return [{ xm: cx - d, ym: y, bw }, { xm: cx + d, ym: y, bw }];
    }
    // one above the other, both in the band
    const yMid = (BUTTON_BAND[0] + BUTTON_BAND[1]) / 2, dy = (BUTTON.h + 0.1) / 2;
    if (yMid - dy >= BUTTON_BAND[0] - 1e-9) {
      const cx = nearest(intersect(freeCentres(wm, yMid + dy, ex, ey), freeCentres(wm, yMid - dy, ex, ey)), mid);
      if (cx !== null) return [{ xm: cx, ym: yMid + dy, bw }, { xm: cx, ym: yMid - dy, bw }];
    }
  }
  return [];
}

/**
 * The landing: on every wall "Play Reel" and "See Projects" side by side, centred on the wall at `buttonHeight` (m, kept
 * within BUTTON_BAND), and the brand above them (on every wall, or only on `brandWall`).
 * → { brands: [{ wallId, xm, ym, hm }], items: [{ id, kind: 'play' | 'projects', wallId, xm, ym, rm, hxm }] }
 */
export function landingLayout(walls, opt = {}) {
  const y0 = clamp(Number(opt.buttonHeight) || 1.25, BUTTON_BAND[0], BUTTON_BAND[1]);
  const brands = [], items = [];
  for (const w of walls || []) {
    const wm = wallMetres(w);
    const b = placeButtons(wm, y0);
    b.forEach((p, i) => {
      const kind = i === 0 ? 'play' : 'projects';
      items.push({ id: `${kind}@${w.id}`, kind, index: -1, wallId: w.id, xm: p.xm, ym: p.ym, rm: BUTTON.h / 2, hxm: (p.bw - BUTTON.h) / 2 });
    });
    if (opt.brandWall && opt.brandWall !== w.id) continue;
    const top = b.length ? Math.max(...b.map((p) => p.ym)) + BUTTON.h / 2 : BUTTON_BAND[1];
    const lo = top + 0.22, hi = wm.height - 0.15;
    let hm = Math.min(1.9, hi - lo);
    const maxW = wm.width - 2 * CORNER_M;
    if ((hm * BRAND_ART.w) / BRAND_ART.h > maxW) hm = (maxW * BRAND_ART.h) / BRAND_ART.w;
    if (hm >= 0.35) brands.push({ wallId: w.id, xm: wm.width / 2, ym: lo + (hi - lo) / 2, hm });
  }
  return { brands, items };
}

// ------------------------------------------------------------------------------------------------ menu

/** The menu's "Back" on one wall: at its left end, mid-band. */
function placeBack(wm) {
  const ex = BACK.w / 2, ey = BACK.h / 2;
  for (const y of heightsFrom(BACK.y, REACH)) {
    const free = freeCentres(wm, y, ex, ey);
    if (free.length) return { xm: free[0][0], ym: y };
  }
  return null;
}

/**
 * `count` blobs on one wall: one row if they fit with room for their names, else two staggered rows (names above the
 * top row, below the bottom one), shrinking the blobs (down to MIN_SCALE) when even that is short.
 * → { scale, rows: 1 | 2, spots: [{ xm, ym, row }] } or null.
 */
function placeBlobs(wm, count, r, taken) {
  if (count <= 0) return { scale: 1, rows: 1, spots: [] };
  for (let k = 1; k >= MIN_SCALE - 1e-9; k -= 0.025) {
    const rk = r * k, ex = rk + DRIFT.x, ey = rk + DRIFT.y;
    // one row
    const s1 = Math.max(2 * ex + BLOB_GAP_M, LABEL_W_M * k);
    const one = fitRow(freeCentres(wm, ROW_Y.one, ex, ey, taken), count, s1, 2.2);
    if (one) return { scale: k, rows: 1, spots: one.map((xm) => ({ xm, ym: ROW_Y.one, row: 0 })) };
    // two rows, zig-zag: a slot every half step, alternating top / bottom. The half step is what keeps a blob and its
    // diagonal neighbour (a row apart) a disc and a gap apart — and the same-row neighbours (two half steps) too.
    const D = 2 * ex + BLOB_GAP_M, dy = ROW_Y.top - ROW_Y.bottom;
    const h2 = Math.max(Math.sqrt(Math.max(0, D * D - dy * dy)), D / 2, (LABEL_W2_M * k) / 2);
    const both = intersect(freeCentres(wm, ROW_Y.top, ex, ey, taken), freeCentres(wm, ROW_Y.bottom, ex, ey, taken));
    const two = fitRow(both, count, h2, 1.1);
    if (two) return { scale: k, rows: 2, spots: two.map((xm, i) => ({ xm, ym: i % 2 ? ROW_Y.bottom : ROW_Y.top, row: i % 2 ? 2 : 1 })) };
  }
  return null;
}

/** How many blobs a wall can hold (at full size): for spreading one set round the room. */
function capacity(wm, r, taken) {
  let n = 0;
  while (n < 64 && placeBlobs(wm, n + 1, r, taken)?.scale === 1) n++;
  return n;
}

/**
 * The projects menu. `count` blobs of diameter `blobSize` (m); `menuLayout`: 'per-wall' (every wall carries every blob)
 * or 'around' (one set spread round the room, in wall order). A "Back" on every wall.
 * → { blobs: [{ id, kind: 'project', index, wallId, xm, ym, rm, row, homeX, homeY }], items: blobs + backs, labelW (m) }
 *   row: 0 = a single row (name below), 1 = top row (name above), 2 = bottom row (name below)
 */
export function menuLayout(walls, count, opt = {}) {
  const r = clamp(Number(opt.blobSize) || BLOB_SIZE_M, 0.2, 0.9) / 2;
  const around = opt.menuLayout === 'around';
  const backs = [], blobs = [];
  const prep = (walls || []).map((w) => {
    const wm = wallMetres(w), b = placeBack(wm);
    const taken = b ? [{ x0: b.xm - BACK.w / 2, x1: b.xm + BACK.w / 2, y0: b.ym - BACK.h / 2, y1: b.ym + BACK.h / 2, gap: BACK.gap }] : [];
    if (b) backs.push({ id: `back@${w.id}`, kind: 'back', index: -1, wallId: w.id, xm: b.xm, ym: b.ym, rm: BACK.h / 2, hxm: (BACK.w - BACK.h) / 2 });
    return { w, wm, taken };
  });
  // which project indexes go on which wall
  let share;
  if (!around) share = prep.map(() => Array.from({ length: count }, (_, i) => i));
  else {
    const cap = prep.map((p) => capacity(p.wm, r, p.taken));
    const room = prep.map((p, i) => (cap[i] ? p.wm.width : 0)), total = room.reduce((s, v) => s + v, 0) || 1;
    const n = room.map((v, i) => Math.min(cap[i], Math.floor((count * v) / total)));
    let left = count - n.reduce((s, v) => s + v, 0);
    const order = room.map((_, i) => i).sort((i, j) => room[j] - room[i]);
    while (left > 0) { // up to what each wall holds at full size; past that (a small room), round the walls (placeBlobs shrinks them)
      let moved = false;
      for (const i of order) if (left > 0 && n[i] < cap[i]) { n[i]++; left--; moved = true; }
      if (!moved) for (const i of order) if (left > 0 && room[i] > 0) { n[i]++; left--; moved = true; }
      if (!moved) break;
    }
    let next = 0;
    share = n.map((c) => Array.from({ length: c }, () => next++));
  }
  prep.forEach(({ w, wm, taken }, i) => {
    let idx = share[i];
    let placed = placeBlobs(wm, idx.length, r, taken);
    while (!placed && idx.length) { idx = idx.slice(0, -1); placed = placeBlobs(wm, idx.length, r, taken); } // a wall that is all doors: fewer
    if (!placed) return;
    placed.spots.forEach((s, k) => {
      const rm = r * placed.scale;
      blobs.push({ id: `project${idx[k]}@${w.id}`, kind: 'project', index: idx[k], wallId: w.id, xm: s.xm, ym: s.ym, rm, hxm: 0, row: s.row, homeX: s.xm, homeY: s.ym, wallW: wm.width });
    });
  });
  // the widest a project name may be: the room between two neighbours of the same row (the tightest wall decides,
  // so every wall writes the names at one size)
  let labelW = LABEL_MAX_M;
  for (const w of walls || []) for (const row of [0, 1, 2]) {
    const xs = blobs.filter((b) => b.wallId === w.id && b.row === row).map((b) => b.xm).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) labelW = Math.min(labelW, xs[i] - xs[i - 1] - 0.2);
  }
  return { blobs, items: [...blobs, ...backs], labelW: Math.max(0.5, labelW) };
}

// ------------------------------------------------------------------------------------------------ names

/**
 * A project name in at most `maxLines` rows no wider than `maxW`, at `size` if it can (all in one unit — metres or px —
 * `measure(line, size)` answers in it): it WRAPS first, and shrinks only when wrapping is not enough, never below
 * `minSize`; a name that still does not fit at `minSize` is cut with an ellipsis. → { lines: [string], size }
 */
export function fitLabel(text, measure, { size, minSize = size, maxW = Infinity, maxLines = 1 } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [''], size };
  const wrapAt = (sz) => {
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && measure(t, sz) > maxW) { lines.push(cur); cur = w; } else cur = t;
    }
    lines.push(cur);
    return lines;
  };
  const lo = Math.min(minSize, size);
  for (let sz = size; ; sz *= 0.94) {
    sz = Math.max(sz, lo);
    const lines = wrapAt(sz);
    if (lines.length <= maxLines && lines.every((l) => measure(l, sz) <= maxW)) return { lines, size: sz };
    if (sz <= lo) break;
  }
  let lines = wrapAt(lo);
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
  lines = lines.map((l, i) => {
    if (measure(l, lo) <= maxW) return l;
    let t = l;
    while (t.length > 1 && measure(`${t}…`, lo) > maxW) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  });
  return { lines, size: lo };
}

// ------------------------------------------------------------------------------------------------ the blobs float

/** A small deterministic hash → [0, 1). */
function rand(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The blobs at time `t` (s): each floats round its home (a slow Lissajous drift of DRIFT), then overlapping ones are pushed
 * apart and every one is kept off the corners, off the masks and within REACH. Pure: the same t gives the same places.
 */
export function blobMotion(blobs, t, walls) {
  const byId = new Map((walls || []).map((w) => [w.id, wallMetres(w)]));
  const out = blobs.map((b) => {
    const s = `${b.wallId}/${b.index}`;
    const px = 11 + 6 * rand(`${s}px`), py = 13 + 6 * rand(`${s}py`);
    const fx = 2 * Math.PI * rand(`${s}fx`), fy = 2 * Math.PI * rand(`${s}fy`);
    return { ...b, xm: b.homeX + DRIFT.x * Math.sin((2 * Math.PI * t) / px + fx), ym: b.homeY + DRIFT.y * Math.sin((2 * Math.PI * t) / py + fy) };
  });
  // push apart blobs of the same wall that come too close (the layout leaves room: this only acts when it is tight)
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.wallId !== b.wallId) continue;
      const dx = b.xm - a.xm, dy = b.ym - a.ym, d = Math.hypot(dx, dy), min = a.rm + b.rm + BLOB_GAP_M / 2;
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2, ux = dx / d, uy = dy / d;
      a.xm -= ux * push; a.ym -= uy * push; b.xm += ux * push; b.ym += uy * push;
    }
  }
  for (const b of out) {
    const wm = byId.get(b.wallId);
    if (!wm) continue;
    b.ym = clamp(b.ym, REACH[0], REACH[1]);
    b.xm = clamp(b.xm, CORNER_M + b.rm, wm.width - CORNER_M - b.rm);
    for (const m of wm.masks) { // off a mask: out by the nearest side
      const g = MASK_MARGIN_M;
      if (b.ym + b.rm <= m.y0 - g || b.ym - b.rm >= m.y1 + g || b.xm + b.rm <= m.x0 - g || b.xm - b.rm >= m.x1 + g) continue;
      const left = m.x0 - g - b.rm, right = m.x1 + g + b.rm;
      b.xm = Math.abs(b.xm - left) < Math.abs(b.xm - right) ? left : right;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ motion curves

/** cubic-bezier(x1, y1, x2, y2) as a function of t in [0, 1] (CSS timing function). */
export function cubicBezier(x1, y1, x2, y2) {
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    return by(t);
  };
}

/** The website's curve: cubic-bezier(.22, 1, .36, 1). */
export const ease = cubicBezier(0.22, 1, 0.36, 1);
