// Experiences: interactive pieces (WebGL pages) the app can load and send to the room. The catalog is the set of
// `experiences/<id>/manifest.json` files; nothing about a particular experience lives in the engine except what its
// manifest declares (its parameters). See ARCHITECTURE.md › Experiences and experiences/runtime.js for the page API.

import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const KEY_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const PARAM_TYPES = ['number', 'select', 'bool', 'wall'];
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const finite = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A manifest parameter, normalised; null when it is unusable. */
function normParam(p) {
  if (!p || typeof p !== 'object' || !KEY_RE.test(p.key || '') || !PARAM_TYPES.includes(p.type)) return null;
  const base = { key: p.key, label: text(p.label, 60) || p.key, type: p.type };
  if (p.type === 'number') {
    const min = finite(p.min, 0), max = Math.max(min, finite(p.max, 1));
    const step = finite(p.step, 0) > 0 ? p.step : (max - min) / 100 || 1;
    return { ...base, min, max, step, default: Math.min(max, Math.max(min, finite(p.default, min))), unit: text(p.unit, 12) };
  }
  if (p.type === 'select') {
    const options = (Array.isArray(p.options) ? p.options : []).slice(0, 64)
      .map((o) => (Array.isArray(o) ? [o[0], text(String(o[1] ?? o[0]), 60)] : [o, text(String(o), 60)]))
      .filter(([v]) => typeof v === 'string' || typeof v === 'number');
    if (!options.length) return null;
    return { ...base, options, default: options.some(([v]) => v === p.default) ? p.default : options[0][0] };
  }
  if (p.type === 'bool') return { ...base, default: p.default === true };
  return { ...base, default: typeof p.default === 'string' ? p.default : null }; // 'wall': a wall id of the room
}

/** One manifest → a catalog entry, or null. `dir` stays inside the engine (it is never sent to a client). */
export function normManifest(m, folder, dir) {
  if (!m || typeof m !== 'object') return null;
  const id = typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : ID_RE.test(folder) ? folder : null;
  if (!id) return null;
  const entry = typeof m.entry === 'string' && m.entry && !m.entry.startsWith('/') && !m.entry.includes('..') && !m.entry.includes('\\') ? m.entry : 'index.html';
  const seen = new Set();
  const params = (Array.isArray(m.params) ? m.params : []).slice(0, 64).map(normParam).filter((p) => p && !seen.has(p.key) && seen.add(p.key));
  return { id, name: text(m.name, 80) || id, description: text(m.description, 400), entry, params, dir };
}

/** The manifest of every folder of the given roots. The first root to define an id wins. */
export function scanCatalog(roots, log) {
  const out = [], ids = new Set();
  for (const root of roots) {
    let names = [];
    try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { continue; }
    for (const folder of names) {
      const dir = path.join(root, folder);
      try {
        const m = normManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), folder, dir);
        if (!m) { log?.warn(`experience "${folder}": unusable manifest`); continue; }
        if (ids.has(m.id)) continue;
        ids.add(m.id);
        out.push(m);
      } catch (e) { if (e.code !== 'ENOENT') log?.warn(`experience "${folder}": ${e.message}`); }
    }
  }
  return out;
}

/** What a client is told about the catalog (no disk paths). */
export const publicCatalog = (catalog) => catalog.map(({ dir, ...rest }) => rest);

/**
 * A value for one manifest parameter, or an Error saying why not. Numbers are clamped into their range; a select
 * takes one of its options; a wall must be one of the room's walls (or empty).
 */
export function checkParam(param, value, wallIds = []) {
  switch (param.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(n)) throw new Error(`"${param.key}" needs a number`);
      return Math.min(param.max, Math.max(param.min, n));
    }
    case 'select': {
      const o = param.options.find(([v]) => v === value || String(v) === String(value));
      if (!o) throw new Error(`"${param.key}" must be one of: ${param.options.map(([v]) => v).join(', ')}`);
      return o[0];
    }
    case 'bool':
      if (typeof value !== 'boolean') throw new Error(`"${param.key}" must be true or false`);
      return value;
    default:
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !wallIds.includes(value)) throw new Error(`"${param.key}" must be a wall of this room`);
      return value;
  }
}

export const SCALES = [0.25, 0.5, 0.75, 1];
export const FPS = [30, 60];
