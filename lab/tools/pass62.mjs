#!/usr/bin/env node
// VEATION Touch lab — the harness pass of 05-plan §6.2 for res-obra3d, through shot.mjs (the GPU lock). Gate: ZERO console errors in
// every case. Each case loads the work, waits for the warm-up, jumps to a block, lets it play and reads back what the score has on
// screen: the targets (how many, their heights, their size), the posts on the sound channel, the fps.
//
//   node lab/tools/pass62.mjs <out-dir> [--only name,name]
//
// Prints one line per case (✓ / ✗ and why) and writes <out-dir>/pass62.json + one capture per case (two rows, 1600 px): LOOK at them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'pass62');
fs.mkdirSync(out, { recursive: true });
const only = flag('--only') ? new Set(flag('--only').split(',')) : null;

// a hand pinned at the right edge of the last wall (P3), near the P3 | P4 seam, at 1.2 m: the seam check
const SEAM = "const st = window.__labRoom?.stage; if (st) { st.put('seam', 0.997, 1 - 1.2 / 3.75); }";
// [name, query, block, js after the jump, seconds, checks]
const CASES = [
  ...['brasa', 'tronc', 'festa'].flatMap((b) => [1, 4, 15].map((n) => [`${b}-g${n}`, `group=${n}`, b, '', 8, { targets: b !== 'festa' }])),
  ...['tronc', 'pom', 'baixada'].map((b) => [`${b}-lidar`, 'group=4&lidar', b, '', 8, {}]),
  ['seam-brasa', 'group=1&demo=0', 'brasa', SEAM, 6, {}],
  ['seam-festa', 'group=1&demo=0', 'festa', SEAM, 6, {}],
  ['viewer-brasa', 'group=4&view=1', 'brasa', '', 8, { posts: 0 }],
  ['wallH35-tronc', 'group=4&wallH=3.5', 'tronc', '', 8, {}],
  ['wallH35-baixada', 'group=4&wallH=3.5', 'baixada', '', 8, {}],
];
const results = [];
for (const [name, query, block, js, secs, checks] of CASES) {
  if (only && !only.has(name)) continue;
  const evalFile = path.join(out, `.${name}.js`);
  fs.writeFileSync(evalFile, `const w = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra) await w(100);
const o = window.__obra, S = o.score.state;
const rx = new BroadcastChannel('ressonancia'); let posts = 0; rx.onmessage = (e) => { if (e.data?.type === 'fx' || e.data?.type === 'ctl') posts++; };
await o.warm?.done;
o.score.jump(${JSON.stringify(block)}); await w(300); if (o.tr) o.tr.t = 99;
${js}
let maxN = 0, ys = [], minDim = 9;
for (let i = 0; i < ${secs * 2}; i++) { await w(500); const T = S.targets || []; maxN = Math.max(maxN, T.length); for (const t of T) { ys.push(t.y); minDim = Math.min(minDim, t.w || 2 * (t.r || 0.22), t.h || 2 * (t.r || 0.22)); } }
return JSON.stringify({ block: S.block, phase: S.phase, maxTargets: maxN, yMin: ys.length ? +Math.min(...ys).toFixed(2) : null, yMax: ys.length ? +Math.max(...ys).toFixed(2) : null, minDim: ys.length ? +minDim.toFixed(2) : null, posts, sink: window.__vtDev?.sink, fps: Math.round(o.fps?.() || 0) });`);
  const url = `/experiences/res-obra3d/index.html?capture&seed=3&${query}`;
  const r = spawnSync(process.execPath, [path.join(HERE, 'shot.mjs'), 'qa', url, '--eval-file', evalFile, '--rows', '--width', '1600', '--shot', path.join(out, name + '.png'), '--max', '90000', '--what', 'pass-' + name], { encoding: 'utf8' });
  fs.rmSync(evalFile, { force: true });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('SMOKE ')) || 'SMOKE {"error":"no output"}';
  let o; try { o = JSON.parse(line.slice(6)); } catch { o = { error: line }; }
  let res = null; try { res = JSON.parse(o.result); } catch { res = o.result; }
  const why = [];
  if (o.error) why.push(o.error);
  if ((o.errors || []).length) why.push(`${o.errors.length} console error(s): ${String(o.errors[0]).slice(0, 120)}`);
  if (res && checks.targets && !(res.maxTargets > 0)) why.push('no targets');
  if (res && res.maxTargets > 16) why.push(`${res.maxTargets} targets (> 16)`);
  if (res && res.yMin != null && (res.yMin < 0.6 || res.yMax > 2.3)) why.push(`target heights ${res.yMin}–${res.yMax} m`);
  if (res && res.minDim != null && res.minDim < 0.4) why.push(`a target ${res.minDim} m (< 0.4)`);
  if (res && 'posts' in checks && res.posts !== checks.posts) why.push(`${res.posts} posts on the channel (want ${checks.posts})`);
  const row = { name, query, block, ok: !why.length, why, stats: o.stats, result: res };
  results.push(row);
  console.log(`${row.ok ? '✓' : '✗'} ${name.padEnd(16)} ${JSON.stringify(res).slice(0, 170)}${why.length ? '  ← ' + why.join(' · ') : ''}`);
}
fs.writeFileSync(path.join(out, 'pass62.json'), JSON.stringify(results, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} ok · ${out}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
