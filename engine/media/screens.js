// Advanced Output (MEDIA-SERVER.md §5): the second stage of the room's image, canvas → screens. Pure: no DOM, no GL —
// the engine (templates, which display is which), the output page (the meshes it draws) and the UI (the stages, nudging,
// snapping) all use this one file (served to the browser as /shared/media/screens.js).
//
//   content canvas ──Input──▶ slice (a rectangle of the canvas) ──Output──▶ a region of a screen: rect · corners · grid
//
// - A screen is one physical output (a display of the system: the Datapath Fx4's 3840×2400 input, a projector...), with
//   the resolution it was designed at. Its slices are in SCREEN pixels; their inputs in CANVAS pixels.
// - A slice linked to a wall (`wallId`) with `input: null` follows the wall's pixelRect: move the wall, the slice follows.
// - wall.mapping keeps its meaning (wall → canvas: touches, zones, calibration). This is only canvas → screen.
// - Flips mirror the picture inside the slice's output region.
// The normalisation (normScreens / normSlice) lives in engine/profile.js, the single gate of the profile.

import { fitHomography, apply, gridMap, gridFrom, IDENTITY } from '../core/geometry.js';

/** The Datapath Fx4 in 2×2: one 3840×2400 input split into four 1920×1200 outputs (TL, TR, BL, BR). */
export const FX4 = Object.freeze({ width: 3840, height: 2400, cols: 2, rows: 2 });
export const SCREEN_MAX = 16384;
export const TEMPLATES = ['walls', 'fx4', 'per-wall'];

const r1 = (v) => Math.round(v * 10) / 10;
const wallsInCanvasOrder = (walls) => walls.filter((w) => w.enabled !== false).slice().sort((a, b) => a.pixelRect.x - b.pixelRect.x || a.pixelRect.y - b.pixelRect.y);

// ------------------------------------------------------------------------------------------------ geometry

/** The canvas rectangle a slice takes its picture from: its own input, its wall's pixelRect, or the whole canvas. */
export function sliceInput(slice, profile) {
  if (slice.input) return slice.input;
  const w = slice.wallId && profile.walls.find((x) => x.id === slice.wallId);
  if (w) return w.pixelRect;
  return { x: 0, y: 0, w: profile.canvas.width, h: profile.canvas.height };
}

const homCache = new WeakMap();
/** Screen px of the point (u, v) ∈ [0, 1]² of a slice's output region (u →, v ↓), whatever its mode. */
export function outputPoint(output, u, v) {
  if (output.mode === 'grid') return gridMap(output, u, v);
  if (output.mode === 'corners') {
    let H = homCache.get(output);
    if (!H) { H = fitHomography([[0, 0], [1, 0], [1, 1], [0, 1]], output.corners) || IDENTITY; homCache.set(output, H); }
    return apply(H, u, v);
  }
  const r = output.rect;
  return [r.x + u * r.w, r.y + v * r.h];
}

/** The four outer corners (TL, TR, BR, BL) of a slice's output region, screen px. */
export function outputCorners(output) {
  if (output.mode === 'corners') return output.corners.map((c) => c.slice());
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => outputPoint(output, u, v));
}

/** Bounding box of a slice's output region {x, y, w, h}, screen px. */
export function outputBounds(output) {
  if (output.mode === 'rect') return { ...output.rect };
  const pts = output.mode === 'grid' ? output.points : output.corners;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Where the canvas point (cx, cy) lands on the screen through this slice (screen px) — null outside its input. */
export function canvasToScreen(slice, input, cx, cy) {
  const u = (cx - input.x) / input.w, v = (cy - input.y) / input.h;
  const e = 1e-5; // (texture coordinates come back in float32)
  if (!(u >= -e && u <= 1 + e && v >= -e && v <= 1 + e)) return null;
  return outputPoint(slice.output, slice.flipH ? 1 - u : u, slice.flipV ? 1 - v : v);
}

/** The parameters at which a slice is sampled: rect = its corners; corner pin = 16 steps (the homography, piecewise);
 *  grid = 8 steps per cell, on the cell lines (inside a cell the mesh is bilinear). */
function steps(output) {
  const even = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
  if (output.mode === 'rect') return [even(1), even(1)];
  if (output.mode === 'corners') return [even(16), even(16)];
  const sub = (ts) => ts.slice(0, -1).flatMap((t, i) => Array.from({ length: 8 }, (_, k) => t + ((ts[i + 1] - t) * k) / 8)).concat(1);
  return [sub(output.us), sub(output.vs)];
}

/**
 * The triangles that draw one slice: `pos` in screen px, `uv` in canvas texture coordinates (0..1, y from the top: what
 * the mixer's FBO holds). Two triangles per cell; `count` vertices. Flips swap the texture coordinates, not the shape.
 */
export function sliceMesh(slice, input, canvas) {
  const [us, vs] = steps(slice.output);
  const nu = us.length, nv = vs.length;
  const P = [], T = [];
  for (const v of vs) for (const u of us) {
    P.push(outputPoint(slice.output, u, v));
    const su = slice.flipH ? 1 - u : u, sv = slice.flipV ? 1 - v : v;
    T.push([(input.x + su * input.w) / canvas.width, (input.y + sv * input.h) / canvas.height]);
  }
  const count = (nu - 1) * (nv - 1) * 6;
  const pos = new Float32Array(count * 2), uv = new Float32Array(count * 2);
  let k = 0;
  const put = (i) => { pos[k] = P[i][0]; uv[k] = T[i][0]; pos[k + 1] = P[i][1]; uv[k + 1] = T[i][1]; k += 2; };
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
    put(a); put(b); put(c); put(a); put(c); put(d);
  }
  return { pos, uv, count };
}

// ------------------------------------------------------------------------------------------------ editing

/** A slice moved by (dx, dy): in its screen (`stage` 'output') or in the canvas ('input': it gets its own input). */
export function nudgeSlice(slice, stage, dx, dy, profile) {
  const s = structuredClone(slice);
  if (stage === 'input') {
    const r = sliceInput(slice, profile), c = profile.canvas;
    const x = Math.max(0, Math.min(c.width - r.w, r.x + dx)), y = Math.max(0, Math.min(c.height - r.h, r.y + dy));
    s.input = { x: Math.round(x), y: Math.round(y), w: r.w, h: r.h };
    return s;
  }
  const o = s.output;
  if (o.mode === 'rect') { o.rect.x += dx; o.rect.y += dy; }
  else for (const p of o.mode === 'grid' ? o.points : o.corners) { p[0] = r1(p[0] + dx); p[1] = r1(p[1] + dy); }
  return s;
}

/** A slice's output in another mode, starting exactly where it is now (nothing jumps; a grid starts 3×3). */
export function setOutputMode(slice, mode) {
  const s = structuredClone(slice), o = slice.output;
  if (o.mode === mode) return s;
  if (mode === 'rect') { const b = outputBounds(o); s.output = { mode: 'rect', rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(1, Math.round(b.w)), h: Math.max(1, Math.round(b.h)) } }; }
  else if (mode === 'corners') s.output = { mode: 'corners', corners: outputCorners(o).map((p) => p.map(r1)) };
  else s.output = { mode: 'grid', ...gridFrom((u, v) => outputPoint(o, u, v), 3, 3) };
  return s;
}

/** Moves the whole output region by (dx, dy) (any mode). */
function shift(output, dx, dy) {
  if (output.mode === 'rect') { output.rect.x = Math.round(output.rect.x + dx); output.rect.y = Math.round(output.rect.y + dy); return; }
  for (const p of output.mode === 'grid' ? output.points : output.corners) { p[0] = r1(p[0] + dx); p[1] = r1(p[1] + dy); }
}

/**
 * The inspector's actions on a slice: '1:1' (a rect of the input's size, same centre), 'fit' (the input's proportions,
 * as large as the screen allows, centred), 'center' (the region centred in the screen), 'match' (back to its wall's
 * pixelRect: input null).
 */
export function placeSlice(slice, action, screen, profile) {
  const s = structuredClone(slice), inp = sliceInput(slice, profile);
  if (action === 'match') { if (s.wallId && profile.walls.some((w) => w.id === s.wallId)) s.input = null; return s; }
  if (action === 'center') {
    const b = outputBounds(s.output);
    shift(s.output, Math.round((screen.width - b.w) / 2 - b.x), Math.round((screen.height - b.h) / 2 - b.y));
    return s;
  }
  if (action === '1:1') {
    const b = outputBounds(s.output), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    s.output = { mode: 'rect', rect: { x: Math.round(cx - inp.w / 2), y: Math.round(cy - inp.h / 2), w: inp.w, h: inp.h } };
    return s;
  }
  if (action === 'fit') {
    const k = Math.min(screen.width / inp.w, screen.height / inp.h), w = Math.round(inp.w * k), h = Math.round(inp.h * k);
    s.output = { mode: 'rect', rect: { x: Math.round((screen.width - w) / 2), y: Math.round((screen.height - h) / 2), w, h } };
    return s;
  }
  return s;
}

/** Where a value snaps: the screen's edges, halves and quarters, and the other slices' edges (`extra`). */
export function snapTargets(size, extra = []) {
  return [0, size / 4, size / 2, (size * 3) / 4, size, ...extra];
}

/** `v` moved onto the nearest target within `tol`, or left as it is. */
export function snapValue(v, targets, tol) {
  let best = v, bd = tol;
  for (const t of targets) { const d = Math.abs(t - v); if (d <= bd) { bd = d; best = t; } }
  return best;
}

/** A rect being dragged: its left / right edge (and top / bottom) snapped to the targets, keeping its size. */
export function snapRect(rect, screen, others = [], tol = 8) {
  const xs = snapTargets(screen.width, others.flatMap((r) => [r.x, r.x + r.w]));
  const ys = snapTargets(screen.height, others.flatMap((r) => [r.y, r.y + r.h]));
  const pick = (a, size, ts) => {
    const l = snapValue(a, ts, tol), r = snapValue(a + size, ts, tol);
    if (l !== a && (r === a + size || Math.abs(l - a) <= Math.abs(r - a - size))) return l;
    if (r !== a + size) return r - size;
    return a;
  };
  return { ...rect, x: Math.round(pick(rect.x, rect.w, xs)), y: Math.round(pick(rect.y, rect.h, ys)) };
}

// ------------------------------------------------------------------------------------------------ templates

/** A slice of `wall`, 1:1 and centred in the cell (x, y, w, h) of a screen — or fitted to it (`fit`, or when 1:1 does not fit). */
function wallSlice(id, wall, cell, fit) {
  const r = wall.pixelRect;
  const k = fit || r.w > cell.w || r.h > cell.h ? Math.min(cell.w / r.w, cell.h / r.h) : 1;
  const w = Math.round(r.w * k), h = Math.round(r.h * k);
  return {
    id, name: wall.id, wallId: wall.id, enabled: true, input: null,
    output: { mode: 'rect', rect: { x: cell.x + Math.round((cell.w - w) / 2), y: cell.y + Math.round((cell.h - h) / 2), w, h } },
    flipH: false, flipV: false,
  };
}

/**
 * "Datapath Fx4 (2×2)": one 3840×2400 screen, the walls in canvas order (left → right: P4, P1, P2, P3 in XR Lab) in the
 * quadrants top-left, top-right, bottom-left, bottom-right; each slice 1:1 and centred in its 1920×1200 quadrant
 * (MEDIA-SERVER.md §10). `fit`: each one as large as its quadrant allows instead. A fifth wall and later get no quadrant.
 */
export function templateFx4(profile, { fit = false, id = 'SC1', name = 'Fx4' } = {}) {
  const qw = FX4.width / FX4.cols, qh = FX4.height / FX4.rows;
  const walls = wallsInCanvasOrder(profile.walls).slice(0, FX4.cols * FX4.rows);
  return [{
    id, name, enabled: true, display: null, width: FX4.width, height: FX4.height,
    slices: walls.map((w, i) => wallSlice(`SL${i + 1}`, w, { x: (i % FX4.cols) * qw, y: Math.floor(i / FX4.cols) * qh, w: qw, h: qh }, fit)),
  }];
}

/**
 * "Slices from walls": one slice per wall where the wall is on the canvas. Into `screen` (keeping its size, everything
 * scaled down if the canvas is larger) or, without one, a new screen the size of the canvas.
 */
export function templateFromWalls(profile, screen = null) {
  const c = profile.canvas;
  const sc = screen ? structuredClone(screen) : { id: 'SC1', name: 'Canvas', enabled: true, display: null, width: Math.min(SCREEN_MAX, c.width), height: Math.min(SCREEN_MAX, c.height), slices: [] };
  const k = Math.min(1, sc.width / c.width, sc.height / c.height);
  sc.slices = wallsInCanvasOrder(profile.walls).map((w, i) => {
    const r = w.pixelRect;
    return {
      id: `SL${i + 1}`, name: w.id, wallId: w.id, enabled: true, input: null,
      output: { mode: 'rect', rect: { x: Math.round(r.x * k), y: Math.round(r.y * k), w: Math.max(1, Math.round(r.w * k)), h: Math.max(1, Math.round(r.h * k)) } },
      flipH: false, flipV: false,
    };
  });
  return sc;
}

/**
 * "One display per wall" (the set-up with an output per projector): a screen per wall, named after it, the size of the
 * display it gets (the secondary displays left → right, when the desktop app reports them) or 1920×1200; its slice 1:1
 * and centred (fitted if the wall is larger).
 */
export function templatePerWall(profile, displays = []) {
  const ds = displays.filter((d) => !d.primary).sort((a, b) => (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0));
  return wallsInCanvasOrder(profile.walls).map((w, i) => {
    const d = ds[i];
    const width = d?.width || 1920, height = d?.height || 1200;
    return {
      id: `SC${i + 1}`, name: w.id, enabled: true, width, height,
      display: d ? { id: d.id, x: d.bounds?.x ?? null, y: d.bounds?.y ?? null, width: d.width, height: d.height, label: d.label || '' } : null,
      slices: [wallSlice(`SL${i + 1}`, w, { x: 0, y: 0, w: width, h: height }, false)],
    };
  });
}

/** A template by name, for output.screens { template } — 'fx4' (with `fit`), 'walls' (into `screenId` if given), 'per-wall'. */
export function applyTemplate(name, profile, { fit = false, displays = [], screenId = null } = {}) {
  const now = profile.output?.screens || [];
  if (name === 'fx4') return templateFx4(profile, { fit });
  if (name === 'per-wall') return templatePerWall(profile, displays);
  if (name === 'walls') {
    const at = now.findIndex((s) => s.id === screenId);
    if (at < 0) return [templateFromWalls(profile)];
    // the other screens keep their slices; ids are made unique again by the normaliser
    const others = now.filter((_, i) => i !== at), taken = new Set(others.flatMap((s) => s.slices.map((x) => x.id)));
    const sc = templateFromWalls(profile, now[at]);
    let n = 1;
    for (const sl of sc.slices) { while (taken.has(`SL${n}`)) n++; sl.id = `SL${n}`; taken.add(sl.id); }
    return now.map((s, i) => (i === at ? sc : s));
  }
  throw new Error(`template: one of ${TEMPLATES.join(', ')}`);
}

// ------------------------------------------------------------------------------------------------ displays

/**
 * The display of the system that is this screen: by id, then by geometry (position and resolution: Windows can give a
 * display another id after a restart). A screen with no display chosen yet takes the only display of its resolution.
 * Never another display "just because": not found = not connected. `taken`: displays already given to other screens.
 */
export function matchDisplay(screen, displays, taken = new Set()) {
  const free = displays.filter((d) => !taken.has(d.id));
  const want = screen.display;
  if (want?.id != null) { const d = free.find((x) => x.id === want.id); if (d) return d; }
  if (want && Number.isFinite(want.x) && Number.isFinite(want.y)) {
    const d = free.find((x) => x.bounds && x.bounds.x === want.x && x.bounds.y === want.y && x.width === want.width && x.height === want.height);
    if (d) return d;
  }
  if (!want) { const same = free.filter((x) => x.width === screen.width && x.height === screen.height); if (same.length === 1) return same[0]; }
  return null;
}

/**
 * The screens against the displays there are now: which are connected, where each one is inside the output window
 * (`rel`, DIP, from the window's top-left), the window that covers them (the bounding rectangle of their displays) and
 * the problems — a screen that is not connected, and, for several, displays that are not contiguous or differ in scale
 * or refresh. Problems only when the room output goes to the screens (`sink: 'screens'`).
 */
export function screensLayout(output, displays = []) {
  const taken = new Set(), list = [];
  const active = output.sink === 'screens';
  for (const s of output.screens || []) {
    const d = s.enabled ? matchDisplay(s, displays, taken) : null;
    if (d) taken.add(d.id);
    list.push({ id: s.id, name: s.name, enabled: s.enabled, width: s.width, height: s.height, connected: !!d,
      displayId: d?.id ?? null, label: d?.label || null, bounds: d?.bounds || null, size: d ? [d.width, d.height] : null, scaleFactor: d?.scaleFactor ?? null, hz: d?.hz ?? null, rel: null });
  }
  const problems = [];
  if (active) {
    for (const s of list) if (s.enabled && !s.connected) problems.push(['bad', `Screen "${s.name}" (${s.width}×${s.height}) is not connected`]);
    if (!list.some((s) => s.enabled)) problems.push(['bad', 'The room output goes to Screens, but there is no screen: add one in Output › Screens']);
    if (output.scale < 1 && list.some((s) => s.enabled)) problems.push(['warn', `The room output renders the canvas at ${output.scale}: the slices are enlarged — set Scale to 1 for 1:1 pixels (Output › Screens)`]);
  }
  const on = list.filter((s) => s.connected && s.bounds);
  let window = null;
  if (on.length) {
    const x0 = Math.min(...on.map((s) => s.bounds.x)), y0 = Math.min(...on.map((s) => s.bounds.y));
    const x1 = Math.max(...on.map((s) => s.bounds.x + s.bounds.width)), y1 = Math.max(...on.map((s) => s.bounds.y + s.bounds.height));
    for (const s of on) s.rel = { x: s.bounds.x - x0, y: s.bounds.y - y0, width: s.bounds.width, height: s.bounds.height };
    window = { bounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, displays: on.map((s) => s.displayId) };
    if (active) {
      for (const s of on) if (s.size[0] !== s.width || s.size[1] !== s.height) problems.push(['warn', `Screen "${s.name}" was set up at ${s.width}×${s.height} but its display is ${s.size[0]}×${s.size[1]}: the slices are scaled`]);
      if (on.length > 1) {
        const area = on.reduce((n, s) => n + s.bounds.width * s.bounds.height, 0);
        if (area !== window.bounds.width * window.bounds.height) problems.push(['warn', 'The screens\' displays are not contiguous in Windows: arrange them side by side with no gap (Display settings)']);
        if (new Set(on.map((s) => s.scaleFactor)).size > 1 || on.some((s) => s.scaleFactor != null && s.scaleFactor !== 1)) problems.push(['warn', 'Set every screen\'s display to 100 % scale in Windows (Display settings)']);
        if (new Set(on.map((s) => s.hz).filter(Boolean)).size > 1) problems.push(['warn', 'The screens\' displays run at different refresh rates: set them all the same']);
      }
    }
  }
  return { list, window: active ? window : null, problems };
}
