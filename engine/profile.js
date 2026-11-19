// Room profile: everything that describes one installation (walls, sensors, pixel layout,
// zones, outputs, processing). Nothing about a specific room lives in code — Barcelona XR Lab
// is just the first profile (profiles/xrlab.json).
//
// `normalizeProfile` is the single gate: anything loaded from disk or edited by the UI goes
// through it, gets defaults, gets clamped, and old schema versions are migrated.

import { PROCESSING_DEFAULTS } from './core/pipeline.js';
import { boundsOf, polygonArea, polygonsOverlap, shapeOutline, mappingOutline, planCloses, wallUvToCanvas } from './core/geometry.js';
import { TRACKER_DEFAULTS } from './core/tracker.js';

export const SCHEMA = 1;

const num = (v, d, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const int = (v, d, min, max) => Math.round(num(v, d, min, max));
const str = (v, d = '') => (typeof v === 'string' ? v.slice(0, 200) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
export const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const id = (v, d) => (typeof v === 'string' && ID_RE.test(v) ? v : d);
const ipv4 = (v, d) => (typeof v === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || v === 'localhost' ? v : d);

function rect(r, d) {
  if (!r || typeof r !== 'object') return d;
  return { x0: num(r.x0, d.x0), y0: num(r.y0, d.y0), x1: num(r.x1, d.x1), y1: num(r.y1, d.y1) };
}

function uniqueIds(list, prefix) {
  const seen = new Set();
  list.forEach((item, i) => {
    let v = item.id;
    if (!v || seen.has(v)) { let k = i + 1; do { v = `${prefix}${k++}`; } while (seen.has(v)); item.id = v; }
    seen.add(item.id);
  });
  return list;
}

/** Corners TL, TR, BR, BL of a pixel rect. */
export const rectCorners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

function normGrid(m, canvas) {
  const okTs = (ts) => Array.isArray(ts) && ts.length >= 2 && ts.length <= 33 && ts[0] === 0 && ts.at(-1) === 1 &&
    ts.every((t, k) => Number.isFinite(t) && (k === 0 || t > ts[k - 1]));
  if (!okTs(m.us) || !okTs(m.vs)) return null;
  if (!Array.isArray(m.points) || m.points.length !== m.us.length * m.vs.length) return null;
  if (!m.points.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite))) return null;
  const cl = (v, max) => Math.round(Math.min(max * 2, Math.max(-max, v)) * 10) / 10;
  return { mode: 'grid', us: m.us.map(Number), vs: m.vs.map(Number), points: m.points.map(([x, y]) => [cl(x, canvas.width), cl(y, canvas.height)]) };
}

function normMapping(m, pixelRect, canvas) {
  if (m?.mode === 'grid') { const g = normGrid(m, canvas); if (g) return g; }
  const mode = m?.mode === 'corners' ? 'corners' : 'rect';
  const ok = mode === 'corners' && Array.isArray(m.corners) && m.corners.length === 4 &&
    m.corners.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite));
  if (!ok) return { mode: 'rect', corners: rectCorners(pixelRect) };
  const cl = (v, max) => Math.round(Math.min(max * 2, Math.max(-max, v)) * 10) / 10;
  return { mode, corners: m.corners.map(([x, y]) => [cl(x, canvas.width), cl(y, canvas.height)]) };
}

function normVerified(v) {
  if (!v || typeof v !== 'object' || !Number.isFinite(v.maxMm)) return null;
  const mm = (x) => Math.round(num(x, 0, 0, 100000) * 10) / 10;
  const worst = v.worst && Number.isFinite(v.worst.x) && Number.isFinite(v.worst.y) ? { x: num(v.worst.x, 0, -100, 100), y: num(v.worst.y, 0, -100, 100), errMm: mm(v.worst.errMm) } : null;
  return { at: str(v.at), meanMm: mm(v.meanMm), maxMm: mm(v.maxMm), n: int(v.n, 0, 0, 100), passMm: mm(v.passMm ?? 25), pass: v.pass === true, worst };
}

function normWall(w, i, canvas) {
  const width = num(w?.width, 6, 0.2, 100);
  const height = num(w?.height, 3, 0.2, 30);
  const pr = w?.pixelRect || {};
  let pixelRect = {
    x: int(pr.x, 0, 0, canvas.width), y: int(pr.y, 0, 0, canvas.height),
    w: int(pr.w, Math.min(1920, canvas.width), 1, canvas.width), h: int(pr.h, Math.min(1080, canvas.height), 1, canvas.height),
  };
  // Mapping wall → output canvas: `rect` (axis-aligned, = pixelRect) or `corners` (corner pin,
  // a homography). In corners mode pixelRect becomes the bounding box (overview, old clients).
  const mapping = normMapping(w?.mapping, pixelRect, canvas);
  if (mapping.mode !== 'rect') {
    const pts = mapping.mode === 'grid' ? mapping.points : mapping.corners;
    const xs = pts.map((c) => c[0]), ys = pts.map((c) => c[1]);
    const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
    pixelRect = { x, y, w: Math.max(1, Math.ceil(Math.max(...xs)) - x), h: Math.max(1, Math.ceil(Math.max(...ys)) - y) };
  }
  return {
    id: id(w?.id, `W${i + 1}`),
    name: str(w?.name, `Wall ${i + 1}`),
    width, height,
    enabled: bool(w?.enabled, true),
    pixelRect,
    mapping,
    // distance scan plane ↔ wall: 2–3 cm normally; further out the wall reacts before the touch (and Verify allows more)
    planeOffset: num(w?.planeOffset, 0.02, 0, 1),
    // the last verification (written by the engine, dropped when the mapping or the calibration changes)
    verified: normVerified(w?.verified),
    turn: num(w?.turn, 90, -180, 180), // floor plan (3D view): corner to the NEXT wall, degrees clockwise seen from above
    // a hand crossing the corner to the next wall stays ONE touch (same id); unset = decided per room below
    joinNext: typeof w?.joinNext === 'boolean' ? w.joinNext : null,
    masks: (Array.isArray(w?.masks) ? w.masks : []).slice(0, 64).map((m, k) => {
      const base = { id: id(m?.id, `M${k + 1}`), name: str(m?.name, `Mask ${k + 1}`) };
      const pts = m?.type === 'polygon' ? polyPoints(m.points) : null;
      // a polygon mask keeps its bounds in x0…y1 too (lists, older readers)
      if (pts) return { ...base, type: 'polygon', points: pts, ...boundsOf(pts) };
      return { ...base, type: 'rect', ...rect(m, { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }) };
    }),
    notes: str(w?.notes),
  };
}

function normSensor(s, i, walls) {
  const wallId = walls.some((w) => w.id === s?.wallId) ? s.wallId : walls[0]?.id ?? null;
  const wall = walls.find((w) => w.id === wallId);
  const pose = s?.pose || {};
  const cal = s?.calibration;
  return {
    id: id(s?.id, `S${i + 1}`),
    name: str(s?.name, `Sensor ${i + 1}`),
    wallId,
    enabled: bool(s?.enabled, true),
    driver: ['s2e', 'sim'].includes(s?.driver) ? s.driver : 's2e',
    host: ipv4(s?.host, '192.168.11.2'),
    port: int(s?.port, 8089, 1, 65535),
    scanMode: ['auto', 'typical', 'sensitivity', 'dense'].includes(s?.scanMode) || Number.isInteger(s?.scanMode) ? s.scanMode : 'auto',
    motorRpm: int(s?.motorRpm, 0, 0, 1200),
    // measured mounting position in the wall frame (metres) — used until calibrated
    pose: {
      x: num(pose.x, wall ? wall.width / 2 : 0), y: num(pose.y, wall ? wall.height : 0),
      rotation: num(pose.rotation, -90, -360, 360), mirror: bool(pose.mirror, false),
    },
    calibration: cal && Array.isArray(cal.matrix) && cal.matrix.length === 9 && cal.matrix.every(Number.isFinite)
      ? { matrix: cal.matrix.map(Number), kind: str(cal.kind, 'homography'), rmsMm: num(cal.rmsMm, 0), maxMm: num(cal.maxMm, 0), points: int(cal.points, 0, 0, 999), at: str(cal.at) }
      : null,
    hasBackground: bool(s?.hasBackground, false),
    notes: str(s?.notes),
  };
}

const r4 = (v) => Math.round(v * 10000) / 10000;

/** 3–64 finite points with a non-zero area, else null. */
function polyPoints(list) {
  if (!Array.isArray(list)) return null;
  const pts = list.filter((p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(Number(v))))
    .slice(0, 64).map(([x, y]) => [r4(Number(x)), r4(Number(y))]);
  return pts.length >= 3 && Math.abs(polygonArea(pts)) > 1e-6 ? pts : null;
}

/**
 * Zone geometry. `space: 'wall'` (default) = wall metres on `wallId`; `space: 'canvas'` = output-canvas pixels,
 * so one zone can span several walls and is drawn on the content itself. Shapes: rect (`rect`), polygon
 * (`points`) or circle (`circle: {x, y, r}`); non-rect shapes keep their bounds in `rect` (lists, older readers).
 */
function normZoneShape(z, space, canvas) {
  const def = space === 'canvas'
    ? { x0: Math.round(canvas.width * 0.45), y0: Math.round(canvas.height * 0.35), x1: Math.round(canvas.width * 0.55), y1: Math.round(canvas.height * 0.65) }
    : { x0: 0.5, y0: 0.5, x1: 1.5, y1: 1.5 };
  if (z?.shape === 'polygon') {
    const pts = polyPoints(z.points);
    if (pts) return { shape: 'polygon', points: pts, rect: boundsOf(pts) };
  }
  if (z?.shape === 'circle' && z.circle) {
    const x = num(z.circle.x, NaN), y = num(z.circle.y, NaN), r = num(z.circle.r, NaN, 0, 1e5);
    if (Number.isFinite(x) && Number.isFinite(y) && r > 0) return { shape: 'circle', circle: { x: r4(x), y: r4(y), r: r4(r) }, rect: { x0: r4(x - r), y0: r4(y - r), x1: r4(x + r), y1: r4(y + r) } };
  }
  return { shape: 'rect', rect: rect(z?.rect, def) };
}

function normZone(z, i, walls, canvas) {
  const space = z?.space === 'canvas' ? 'canvas' : 'wall';
  const wallId = space === 'canvas' ? null : walls.some((w) => w.id === z?.wallId) ? z.wallId : walls[0]?.id ?? null;
  const name = str(z?.name, `Zone ${i + 1}`);
  const geo = normZoneShape(z, space, canvas);
  // walls the zone covers (derived): its own wall, or every wall whose canvas region overlaps it
  const outline = shapeOutline(geo, 24);
  const covers = space === 'canvas' ? walls.filter((w) => polygonsOverlap(outline, mappingOutline(w.mapping, w.pixelRect))).map((w) => w.id)
    : wallId ? [wallId] : [];
  return {
    id: id(z?.id, `Z${i + 1}`),
    name,
    // address used by "Triggers" outputs; empty = derived from the name
    address: typeof z?.address === 'string' && /^\/[A-Za-z0-9_\-/]{1,120}$/.test(z.address) ? z.address : '',
    space,
    wallId,
    walls: covers,
    enabled: bool(z?.enabled, true),
    ...geo,
    holdMs: int(z?.holdMs, 1000, 0, 60000),
    releaseMs: int(z?.releaseMs, 150, 0, 5000),
    minHands: int(z?.minHands, 1, 1, 20), // the zone is active only with at least this many touches inside
  };
}

function normOutput(o, i) {
  const type = ['osc', 'tuio', 'triggers', 'texture', 'webhook', 'artnet', 'sacn'].includes(o?.type) ? o.type : 'osc';
  return {
    id: id(o?.id, `O${i + 1}`),
    name: str(o?.name, { tuio: 'TUIO', triggers: 'Triggers', texture: 'Touch texture', webhook: 'Webhook', artnet: 'Art-Net', sacn: 'sACN' }[type] || 'OSC'),
    // texture (NDI source name) options
    senderName: str(o?.senderName, 'VEATION Touch').replace(/[^\w .-]/g, '').slice(0, 60) || 'VEATION Touch',
    scale: [0.125, 0.25, 0.5, 1].includes(o?.scale) ? o.scale : 0.25,
    radius: num(o?.radius, 0.08, 0.01, 1),
    sizeMode: o?.sizeMode === 'touch' ? 'touch' : 'fixed', // 'touch': the disc grows with what touches (radius = the minimum)
    overlay: o?.overlay === 'off' ? 'off' : 'auto', // the calibration pattern (grid, targets) drawn on top while the walls' "Grid" is on or a calibration runs
    // where the texture goes — only this one runs: NDI (network) or a full-screen window. Spout is not here: the whole
    // app has ONE Spout sender, the room output (`output`, below), which can carry this mask as its "touches" layer
    sink: ['ndi', 'window'].includes(o?.sink) ? o.sink : 'ndi',
    displayId: Number.isFinite(o?.displayId) ? o.displayId : null, // 'window': the display it fills
    fit: o?.fit === 'stretch' ? 'stretch' : 'fit',                  // 'window': keep the canvas proportions, or fill
    softness: num(o?.softness, 0.5, 0, 1),
    trailMs: int(o?.trailMs, 0, 0, 10000),
    // webhook: zone events POSTed as JSON
    url: typeof o?.url === 'string' && /^https?:\/\/[^\s]{1,490}$/i.test(o.url.trim()) ? o.url.trim() : '',
    // artnet / sacn: one DMX channel per zone from `channel` — Art-Net 15-bit Port-Address, sACN universe 1–63999
    universe: type === 'sacn' ? int(o?.universe, 1, 1, 63999) : int(o?.universe, 0, 0, 32767),
    channel: int(o?.channel, 1, 1, 512),
    priority: int(o?.priority, 100, 0, 200), // sACN: the highest-priority source wins at the receiver
    type,
    enabled: bool(o?.enabled, true),
    // sacn 'multicast' = the universe's group 239.255.x.y
    host: str(o?.host, { artnet: '255.255.255.255', sacn: 'multicast' }[type] || '127.0.0.1') || (type === 'sacn' ? 'multicast' : '127.0.0.1'),
    port: int(o?.port, { tuio: 3333, triggers: 7000, artnet: 6454, sacn: 5568 }[type] || 9000, 1, 65535),
    coords: ['wall', 'canvas'].includes(o?.coords) ? o.coords : 'wall',
    prefix: typeof o?.prefix === 'string' && /^\/[A-Za-z0-9_/-]*$/.test(o.prefix) ? o.prefix.replace(/\/$/, '') : '/vt',
    rateHz: int(o?.rateHz, ['texture', 'artnet', 'sacn'].includes(type) ? 30 : 60, 1, 120),
    walls: Array.isArray(o?.walls) ? o.walls.filter((w) => typeof w === 'string') : [], // [] = all walls
    tuioPortPerWall: bool(o?.tuioPortPerWall, false),
  };
}

/**
 * The experience loaded in this room (Experiences tab): which one, whether it starts with the app, and the parameter
 * values the operator chose for each experience (keyed by experience id — the manifest says what the keys mean).
 * Where it goes (Spout, scale, rate…) is the room output's business: `output`, below.
 */
function normExperience(e) {
  const params = {};
  for (const [eid, vals] of Object.entries(e?.params && typeof e.params === 'object' ? e.params : {}).slice(0, 64)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(eid) || !vals || typeof vals !== 'object') continue;
    params[eid] = Object.fromEntries(Object.entries(vals).slice(0, 64)
      .filter(([k, v]) => /^[A-Za-z0-9_.-]{1,40}$/.test(k) && (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))))
      .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
  }
  return {
    id: typeof e?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(e.id) ? e.id : null,
    autostart: bool(e?.autostart, false),
    params,
  };
}

// ---------------------------------------------------------------- the room output (ONE Spout sender for the whole app)

export const OUTPUT_LAYERS = ['experience', 'touches', 'grid']; // default order, bottom → top
export const OUTPUT_BLENDS = ['normal', 'screen', 'add', 'multiply'];
export const OUTPUT_SCALES = [0.25, 0.5, 0.75, 1];
export const OUTPUT_FPS = [30, 60];
export const TOUCH_LAYER_SCALES = [0.125, 0.25, 0.5, 1];
const LAYER_DEFAULTS = { experience: { on: true, blend: 'normal' }, touches: { on: false, blend: 'screen' }, grid: { on: false, blend: 'screen' } };

function normLayer(l, lid) {
  const d = LAYER_DEFAULTS[lid];
  const out = {
    id: lid,
    on: bool(l?.on, d.on),
    opacity: Math.round(num(l?.opacity, 1, 0, 1) * 100) / 100,
    blend: OUTPUT_BLENDS.includes(l?.blend) ? l.blend : d.blend,
  };
  if (lid === 'touches') { // the same fields and meaning as a Texture output
    Object.assign(out, {
      radius: num(l?.radius, 0.08, 0.01, 1),
      sizeMode: l?.sizeMode === 'touch' ? 'touch' : 'fixed',
      softness: num(l?.softness, 0.5, 0, 1),
      trailMs: int(l?.trailMs, 0, 0, 10000),
      walls: Array.isArray(l?.walls) ? l.walls.filter((w) => typeof w === 'string').slice(0, 32) : [], // [] = all walls
      scale: TOUCH_LAYER_SCALES.includes(l?.scale) ? l.scale : 0.25, // of the canvas: the CPU rasteriser's resolution
    });
  }
  return out;
}

/**
 * The room output: what leaves the app as ONE image (the single Spout sender, or a full-screen window) and the layers
 * it is made of, bottom → top (array order). Each layer: on, opacity, blend; `touches` also carries the mask settings.
 */
export function normRoomOutput(o) {
  const seen = new Set(), layers = [];
  for (const l of Array.isArray(o?.layers) ? o.layers : []) {
    if (l && OUTPUT_LAYERS.includes(l.id) && !seen.has(l.id)) { seen.add(l.id); layers.push(normLayer(l, l.id)); }
  }
  for (const lid of OUTPUT_LAYERS) if (!seen.has(lid)) layers[lid === 'experience' ? 'unshift' : 'push'](normLayer(null, lid));
  return {
    on: bool(o?.on, false),
    sink: o?.sink === 'window' ? 'window' : 'spout',
    senderName: str(o?.senderName, 'VEATION Touch').replace(/[^\w .-]/g, '').trim().slice(0, 60) || 'VEATION Touch',
    displayId: Number.isFinite(o?.displayId) ? o.displayId : null,
    fit: o?.fit === 'stretch' ? 'stretch' : 'fit',
    scale: OUTPUT_SCALES.includes(o?.scale) ? o.scale : 0.5,
    fps: o?.fps === 30 ? 30 : 60,
    layers,
  };
}

/**
 * Profiles saved before the room output existed: where the experience went (sink, display, fit, scale, rate) moves from
 * `experience` to `output`, and a Texture output sent over Spout becomes the touches layer (on, with its settings — the
 * sender name is kept if it was customised). Any other Texture-over-Spout output is dropped: there is only one Spout
 * sender now. Runs once: a profile that has `output` is left alone.
 */
function migrateRoomOutput(p) {
  if (p.output && typeof p.output === 'object') return;
  const e = p.experience && typeof p.experience === 'object' ? p.experience : {};
  const out = {};
  for (const k of ['sink', 'displayId', 'fit', 'scale', 'fps']) if (k in e) out[k] = e[k];
  const outputs = Array.isArray(p.outputs) ? p.outputs : [];
  const isSpoutTexture = (o) => o && o.type === 'texture' && (o.sink === undefined || o.sink === 'spout');
  const tex = outputs.find(isSpoutTexture);
  const custom = (n, dflt) => (typeof n === 'string' && n.trim() && n !== dflt ? n : null);
  out.senderName = custom(tex?.senderName, 'VEATION Touch') || custom(e.senderName, 'VEATION Touch Experience') || 'VEATION Touch';
  const playing = !!(e.autostart && e.id);
  out.layers = [{ id: 'experience', on: playing }];
  if (tex) {
    const { radius, sizeMode, softness, trailMs, walls, scale } = tex;
    out.layers.push({ id: 'touches', on: tex.enabled !== false, radius, sizeMode, softness, trailMs, walls, scale });
  }
  out.on = playing || (!!tex && tex.enabled !== false);
  p.output = out;
  // the one that became the touches layer leaves the list; any other Spout texture is KEPT with its settings, switched
  // off and moved to NDI (there is one Spout sender now) — never deleted behind the operator's back
  p.outputs = outputs.filter((o) => o !== tex).map((o) => (isSpoutTexture(o) ? { ...o, sink: 'ndi', enabled: false } : o));
}

export function normalizeProfile(input) {
  const p = input && typeof input === 'object' ? migrate(structuredClone(input)) : {};
  const canvas = { width: int(p.canvas?.width, 3840, 16, 32768), height: int(p.canvas?.height, 2400, 16, 32768) };
  const walls = uniqueIds((Array.isArray(p.walls) ? p.walls : []).slice(0, 32).map((w, i) => normWall(w, i, canvas)), 'W');
  // continuous corners default ON only where the walls certainly meet: a room whose wall loop closes. Walls that
  // merely follow each other in the list (separate walls, older profiles) stay independent until joined in Room.
  const closes = planCloses(walls);
  for (const w of walls) if (w.joinNext === null) w.joinNext = closes;
  const sensors = uniqueIds((Array.isArray(p.sensors) ? p.sensors : []).slice(0, 64).map((s, i) => normSensor(s, i, walls)), 'S');
  const zones = uniqueIds((Array.isArray(p.zones) ? p.zones : []).slice(0, 256).map((z, i) => normZone(z, i, walls, canvas)), 'Z');
  const outputs = uniqueIds((Array.isArray(p.outputs) ? p.outputs : []).slice(0, 32).map(normOutput), 'O');
  const pr = p.processing || {};
  const tr = p.tracking || {};
  const D = PROCESSING_DEFAULTS, T = TRACKER_DEFAULTS;
  return {
    schema: SCHEMA,
    id: id(p.id, slug(p.name || 'room')),
    name: str(p.name, 'New room') || 'New room',
    notes: str(p.notes),
    canvas,
    walls, sensors, zones, outputs,
    experience: normExperience(p.experience),
    output: normRoomOutput(p.output),
    processing: {
      minQuality: int(pr.minQuality, D.minQuality, 0, 255),
      minRangeMm: int(pr.minRangeMm, D.minRangeMm, 0, 2000),
      binDeg: num(pr.binDeg, D.binDeg, 0.1, 2),
      bgThresholdMm: int(pr.bgThresholdMm, D.bgThresholdMm, 5, 500),
      edgeMargin: num(pr.edgeMargin, D.edgeMargin, 0, 1),
      floorMargin: num(pr.floorMargin, D.floorMargin, 0, 2),
      clusterGap: num(pr.clusterGap, D.clusterGap, 0.005, 0.5),
      minPoints: int(pr.minPoints, D.minPoints, 1, 100),
      minSize: num(pr.minSize, D.minSize, 0, 1),
      maxSize: num(pr.maxSize, D.maxSize, 0.02, 3),
      contactCorrection: num(pr.contactCorrection, D.contactCorrection, 0, 1.5),
      calibCaptureM: num(pr.calibCaptureM, 0.75, 0.2, 2), // calibration: a hand counts only within this distance of the target
    },
    tracking: {
      mergeDist: num(tr.mergeDist, T.mergeDist, 0, 1),
      gateBase: num(tr.gateBase, T.gateBase, 0.01, 2),
      maxSpeed: num(tr.maxSpeed, T.maxSpeed, 0.1, 20),
      confirmFrames: int(tr.confirmFrames, T.confirmFrames, 1, 20),
      tentativeMs: int(tr.tentativeMs, T.tentativeMs, 50, 3000),
      coastMs: int(tr.coastMs, T.coastMs, 0, 3000),
      predictMs: int(tr.predictMs, T.predictMs, 0, 300),
      cornerZone: num(tr.cornerZone, 0.25, 0, 1), // m each side of a joined corner where touches are linked (0 = off)
      oneEuro: {
        minCutoff: num(tr.oneEuro?.minCutoff, T.oneEuro.minCutoff, 0.01, 30),
        beta: num(tr.oneEuro?.beta, T.oneEuro.beta, 0, 50),
        dCutoff: num(tr.oneEuro?.dCutoff, T.oneEuro.dCutoff, 0.01, 30),
      },
    },
    simulation: {
      wanderers: int(p.simulation?.wanderers, 0, 0, 30),
      // simulated mounting error per sensor id (tests and Level check demos): { gapMm, tiltDeg, towardsDeg }
      planes: Object.fromEntries(Object.entries(p.simulation?.planes || {}).filter(([k]) => ID_RE.test(k)).slice(0, 64)
        .map(([k, v]) => [k, { gapMm: num(v?.gapMm, 20, 0, 200), tiltDeg: num(v?.tiltDeg, 0, 0, 10), towardsDeg: num(v?.towardsDeg, -90, -180, 180) }])),
    },
  };
}

function migrate(p) {
  // schema 1 is the first one; future versions transform `p` here step by step.
  if (!p.schema) p.schema = 1;
  migrateRoomOutput(p); // keyed on the field itself: only profiles saved before the room output existed
  return p;
}

/** Canvas pixel of a wall UV (0..1, origin top-left), honouring the wall mapping (shared with the UI). */
export { wallUvToCanvas };

/** Pixel position of a wall point (metres) in the output canvas. */
export function wallToCanvas(wall, x, y) {
  return wallUvToCanvas(wall, x / wall.width, 1 - y / wall.height);
}

/** Address a zone uses on "Triggers" outputs. */
export const zoneAddress = (z) => z.address || `/${slug(z.name)}`;

/** Wall UV (0..1, origin top-left) of a wall point (metres). */
export function wallToUv(wall, x, y) {
  return [x / wall.width, 1 - y / wall.height];
}

/** A blank profile with one wall, one simulated sensor and one OSC output. */
export function blankProfile(name = 'New room') {
  return normalizeProfile({
    name,
    canvas: { width: 1920, height: 1080 },
    walls: [{ id: 'W1', name: 'Wall 1', width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 1920, h: 1080 } }],
    sensors: [{ id: 'S1', name: 'Sensor 1', wallId: 'W1', driver: 'sim', pose: { x: 2, y: 2.6, rotation: -90 } }],
    outputs: [{ id: 'O1', name: 'TouchDesigner', type: 'osc', host: '127.0.0.1', port: 9000 }],
    simulation: { wanderers: 2 },
  });
}
