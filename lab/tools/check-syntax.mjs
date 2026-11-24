#!/usr/bin/env node
// VEATION Touch lab — the no-GPU check before every commit (05-plan §5.0). For the Ressonància folders, lab/tools and lab/harness:
//   1. syntax of every .js / .mjs / .cjs (node --check; vendor/ and shots/ skipped);
//   2. the pairs that must stay byte-identical between the visual core and the sound piece (score.js, tuning.js, targets.js, cues.js);
//   3. the manifests as the app reads them: valid JSON, ≤ 64 params, keys and lengths (engine/experiences.js rules).
//   node lab/tools/check-syntax.mjs            → exit 0 = all good; every problem printed on its own line
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '..');
const EXP = path.join(LAB, 'experiments');
const DIRS = ['res-obra3d', 'ressonancia', 'ressonancia-sound', 'res-3d-study'].map((d) => path.join(EXP, d)).concat([path.join(LAB, 'tools'), path.join(LAB, 'harness')]);
const problems = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'shots' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(m|c)?js$/.test(e.name)) out.push(p);
  }
  return out;
}
let n = 0;
for (const f of DIRS.flatMap((d) => walk(d))) {
  n++;
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`syntax  ${path.relative(LAB, f)}: ${(r.stderr || '').split('\n').filter(Boolean).slice(0, 4).join(' | ')}`);
}

for (const name of ['score.js', 'tuning.js', 'targets.js', 'cues.js']) {
  const a = path.join(EXP, 'ressonancia', name), b = path.join(EXP, 'ressonancia-sound', name);
  const ea = fs.existsSync(a), eb = fs.existsSync(b);
  if (!ea && !eb) continue;
  if (ea !== eb) { problems.push(`pair    ${name}: only in ${ea ? 'ressonancia' : 'ressonancia-sound'}`); continue; }
  if (!fs.readFileSync(a).equals(fs.readFileSync(b))) problems.push(`pair    ${name}: ressonancia/ and ressonancia-sound/ differ (must be identical)`);
}

const KEY = /^[A-Za-z0-9_.-]{1,40}$/;
for (const d of ['res-obra3d', 'ressonancia', 'ressonancia-sound', 'res-3d-study']) {
  const f = path.join(EXP, d, 'manifest.json'); if (!fs.existsSync(f)) continue;
  let m; try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problems.push(`manifest ${d}: invalid JSON (${e.message})`); continue; }
  const ps = Array.isArray(m.params) ? m.params : [];
  if (ps.length > 64) problems.push(`manifest ${d}: ${ps.length} params — the app keeps the first 64 and drops «${ps.slice(64).map((p) => p.key).join(', ')}»`);
  if ((m.name || '').length > 80) problems.push(`manifest ${d}: name > 80`);
  if ((m.description || '').length > 400) problems.push(`manifest ${d}: description > 400 (${m.description.length})`);
  const seen = new Set();
  for (const p of ps) {
    if (!KEY.test(p.key || '')) problems.push(`manifest ${d}: bad key «${p.key}»`);
    if (seen.has(p.key)) problems.push(`manifest ${d}: duplicate key «${p.key}»`); seen.add(p.key);
    if ((p.label || '').length > 60) problems.push(`manifest ${d}: label of ${p.key} > 60`);
    if (p.unit && p.unit.length > 12) problems.push(`manifest ${d}: unit of ${p.key} > 12`);
    if (p.options && p.options.length > 64) problems.push(`manifest ${d}: ${p.key} has > 64 options`);
    for (const o of p.options || []) if (String(Array.isArray(o) ? o[1] : o).length > 60) problems.push(`manifest ${d}: an option label of ${p.key} > 60`);
    if (p.type === 'number' && (p.default < p.min || p.default > p.max)) problems.push(`manifest ${d}: default of ${p.key} outside min–max`);
  }
}

for (const p of problems) console.log(p);
console.log(`check-syntax: ${n} files, ${problems.length ? problems.length + ' problem(s)' : 'all good'}`);
process.exit(problems.length ? 1 : 0);
