// Room profile: everything that describes one installation (walls, sensors, pixel layout,
// zones, outputs, processing). Nothing about a specific room lives in code — Barcelona XR Lab
// is just the first profile (profiles/xrlab.json).
//
// `normalizeProfile` is the single gate: anything loaded from disk or edited by the UI goes
// through it, gets defaults, gets clamped, and old schema versions are migrated.

import { PROCESSING_DEFAULTS } from './core/pipeline.js';
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

function normWall(w, i, canvas) {
  const width = num(w?.width, 6, 0.2, 100);
  const height = num(w?.height, 3, 0.2, 30);
  const pr = w?.pixelRect || {};
  return {
    id: id(w?.id, `W${i + 1}`),
    name: str(w?.name, `Wall ${i + 1}`),
    width, height,
    enabled: bool(w?.enabled, true),
    // where this wall lands in the output canvas (pixels)
    pixelRect: {
      x: int(pr.x, 0, 0, canvas.width), y: int(pr.y, 0, 0, canvas.height),
      w: int(pr.w, Math.min(1920, canvas.width), 1, canvas.width), h: int(pr.h, Math.min(1080, canvas.height), 1, canvas.height),
    },
    planeOffset: num(w?.planeOffset, 0.02, 0, 1), // informational: distance scan plane ↔ wall
    masks: (Array.isArray(w?.masks) ? w.masks : []).slice(0, 64).map((m, k) => ({
      id: id(m?.id, `M${k + 1}`), name: str(m?.name, `Mask ${k + 1}`), type: 'rect',
      ...rect(m, { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }),
    })),
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

function normZone(z, i, walls) {
  const wallId = walls.some((w) => w.id === z?.wallId) ? z.wallId : walls[0]?.id ?? null;
  return {
    id: id(z?.id, `Z${i + 1}`),
    name: str(z?.name, `Zone ${i + 1}`),
    wallId,
    enabled: bool(z?.enabled, true),
    rect: rect(z?.rect, { x0: 0.5, y0: 0.5, x1: 1.5, y1: 1.5 }),
    holdMs: int(z?.holdMs, 1000, 0, 60000),
    releaseMs: int(z?.releaseMs, 150, 0, 5000),
  };
}

function normOutput(o, i) {
  const type = ['osc', 'tuio'].includes(o?.type) ? o.type : 'osc';
  return {
    id: id(o?.id, `O${i + 1}`),
    name: str(o?.name, type === 'tuio' ? 'TUIO' : 'OSC'),
    type,
    enabled: bool(o?.enabled, true),
    host: str(o?.host, '127.0.0.1') || '127.0.0.1',
    port: int(o?.port, type === 'tuio' ? 3333 : 9000, 1, 65535),
    coords: ['wall', 'canvas'].includes(o?.coords) ? o.coords : 'wall',
    prefix: typeof o?.prefix === 'string' && /^\/[A-Za-z0-9_/-]*$/.test(o.prefix) ? o.prefix.replace(/\/$/, '') : '/vt',
    rateHz: int(o?.rateHz, 60, 1, 120),
    walls: Array.isArray(o?.walls) ? o.walls.filter((w) => typeof w === 'string') : [], // [] = all walls
    tuioPortPerWall: bool(o?.tuioPortPerWall, false),
  };
}

export function normalizeProfile(input) {
  const p = input && typeof input === 'object' ? migrate(structuredClone(input)) : {};
  const canvas = { width: int(p.canvas?.width, 3840, 16, 32768), height: int(p.canvas?.height, 2400, 16, 32768) };
  const walls = uniqueIds((Array.isArray(p.walls) ? p.walls : []).slice(0, 32).map((w, i) => normWall(w, i, canvas)), 'W');
  const sensors = uniqueIds((Array.isArray(p.sensors) ? p.sensors : []).slice(0, 64).map((s, i) => normSensor(s, i, walls)), 'S');
  const zones = uniqueIds((Array.isArray(p.zones) ? p.zones : []).slice(0, 256).map((z, i) => normZone(z, i, walls)), 'Z');
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
    },
    tracking: {
      mergeDist: num(tr.mergeDist, T.mergeDist, 0, 1),
      gateBase: num(tr.gateBase, T.gateBase, 0.01, 2),
      maxSpeed: num(tr.maxSpeed, T.maxSpeed, 0.1, 20),
      confirmFrames: int(tr.confirmFrames, T.confirmFrames, 1, 20),
      tentativeMs: int(tr.tentativeMs, T.tentativeMs, 50, 3000),
      coastMs: int(tr.coastMs, T.coastMs, 0, 3000),
      predictMs: int(tr.predictMs, T.predictMs, 0, 300),
      oneEuro: {
        minCutoff: num(tr.oneEuro?.minCutoff, T.oneEuro.minCutoff, 0.01, 30),
        beta: num(tr.oneEuro?.beta, T.oneEuro.beta, 0, 50),
        dCutoff: num(tr.oneEuro?.dCutoff, T.oneEuro.dCutoff, 0.01, 30),
      },
    },
    simulation: {
      wanderers: int(p.simulation?.wanderers, 0, 0, 30),
    },
  };
}

function migrate(p) {
  // schema 1 is the first one; future versions transform `p` here step by step.
  if (!p.schema) p.schema = 1;
  return p;
}

/** Pixel position of a wall point (metres) in the output canvas. */
export function wallToCanvas(wall, x, y) {
  const r = wall.pixelRect;
  return [r.x + (x / wall.width) * r.w, r.y + (1 - y / wall.height) * r.h];
}

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
