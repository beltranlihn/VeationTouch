#!/usr/bin/env node
// VEATION Touch lab — the Ressonància album: one capture per block of res-obra3d (two rows, 1600 px), through shot.mjs (the GPU lock),
// plus a contact sheet (00-contact.png) and result.json (errors, luma / p99 / burnt, targets on screen) per block.
//
//   node lab/tools/album.mjs <out-dir> [--group 4] [--blocks espera,intro,…] [--quality high] [--seed 3]
//
// Each block: load, wait for the light-set warm-up, jump, end the jump's tile crossing, put the score in a representative moment
// (RECIPES), wait, capture. A block whose page logged a console error is marked ✗ in result.json (zero errors is a gate).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'album');
const group = Number(flag('--group', 4)), seed = Number(flag('--seed', 3)), quality = flag('--quality', 'high');
fs.mkdirSync(out, { recursive: true });

// name | block | JS after the jump (o = __obra, S = state, w = sleep) | seconds before the capture
const RECIPES = [
  ['01-espera', 'wait', '', 7],
  ['02-intro', 'intro', 'S.t = 32;', 4],
  ['03-brasa-relevo', 'brasa', 'S.t = 13;', 6],
  ['04-brasa-llamada', 'brasa', 'S.t = 41.5;', 5],
  ['05-pinya', 'pinya', "S.t = 20; S.tp = 14; S.phase = 'play';", 7],
  ['06-tronc', 'tronc', "S.t = 40; S.tp = 34; S.phase = 'play'; S.floors = 4; S.floorProgress = 0.5;", 7],
  ['07-tronc-temblor', 'tronc', "await w(3000); S.t = 60; S.tp = 54; S.phase = 'play'; S.floors = 7; S.floorProgress = 0.2; await w(4000); S.wobbleWall = Math.max(0, (S.walls || []).findIndex(Boolean)); S.wobble = 0.001;", 2.5],
  ['08-pom', 'pom', "S.t = 20; S.tp = 14; S.phase = 'play';", 7],
  ['09-pom-aleta', 'pom', "await w(4500); S.t = 60; S.phase = 'aleta'; S.tp = 0;", 3.5],
  ['10-coronacion', 'crown', 'S.t = 9;', 6],
  ['11-festa', 'festa', 'S.t = 40; S.resonance = 1;', 7],
  ['12-bajada', 'baixada', 'S.t = 8;', 6],
  ['13-caida', 'fall', "S.outcome = 'intent'; S.floors = Math.max(S.floors || 0, 6);", 6],
  ['14-acta', 'acta', 'S.t = 3;', 7],
];
const only = flag('--blocks') ? new Set(flag('--blocks').split(',')) : null;
const results = [];
for (const [name, block, js, wait] of RECIPES) {
  if (only && !only.has(name) && !only.has(block)) continue;
  const evalFile = path.join(out, `.${name}.js`);
  fs.writeFileSync(evalFile, `const w = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra) await w(100);
const o = window.__obra, S = o.score.state;
await o.warm?.done;
o.score.jump(${JSON.stringify(block)}); await w(300); if (o.tr) o.tr.t = 99;
${js}
await w(${wait * 1000});
const T = S.targets || [];
return JSON.stringify({ block: S.block, phase: S.phase, t: Math.round((S.t || 0) * 10) / 10, targets: T.length, kinds: [...new Set(T.map((x) => x.kind))].join(','), yRange: T.length ? [Math.min(...T.map((x) => x.y)), Math.max(...T.map((x) => x.y))].map((v) => +v.toFixed(2)) : null, fps: Math.round(o.fps?.() || 0) });`);
  const url = `/experiences/res-obra3d/index.html?capture&group=${group}&seed=${seed}&params=${encodeURIComponent(JSON.stringify({ quality }))}`;
  const r = spawnSync(process.execPath, [path.join(HERE, 'shot.mjs'), 'album', url, '--eval-file', evalFile, '--rows', '--width', '1600', '--shot', path.join(out, name + '.png'), '--max', '90000', '--what', 'album-' + name], { encoding: 'utf8' });
  fs.rmSync(evalFile, { force: true });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('SMOKE ')) || 'SMOKE {"error":"no output"}';
  let o; try { o = JSON.parse(line.slice(6)); } catch { o = { error: line }; }
  let res = null; try { res = JSON.parse(o.result); } catch { res = o.result; }
  const row = { name, block, ok: !o.error && !(o.errors || []).length, errors: o.errors || (o.error ? [o.error] : []), stats: o.stats, result: res };
  results.push(row);
  console.log(`${row.ok ? '✓' : '✗'} ${name.padEnd(18)} ${o.stats ? `luma ${o.stats.luma} · p99 ${o.stats.p99} · burnt ${o.stats.burnt} %` : ''} · ${JSON.stringify(res).slice(0, 160)}${row.errors.length ? ' · ERRORS ' + JSON.stringify(row.errors).slice(0, 200) : ''}`);
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(results, null, 2));

// the contact sheet: the captures in a 4-column grid, rendered by a hidden window (no image library)
const pngs = fs.readdirSync(out).filter((f) => /^\d\d-.*\.png$/.test(f)).sort();
if (pngs.length) {
  const html = path.join(out, '.contact.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#111;color:#E0E0E0;font:11px/1.2 "Segoe UI",system-ui,sans-serif}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;width:1588px}figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0 3px}</style>
<div class="g">${pngs.map((f) => `<figure><figcaption>${f.replace('.png', '')}</figcaption><img src="${f}"></figure>`).join('')}</div>`);
  const rows = Math.ceil(pngs.length / 4), H = Math.round(6 + rows * (393 * 813 / 1600 + 20 + 6));
  const r = spawnSync(process.execPath, [path.join(HERE, 'shot.mjs'), 'album', 'file:///' + html.replace(/\\/g, '/'), '--size', `1600x${H}`, '--no-stats', '--delay', '1500', '--shot', path.join(out, '00-contact.png'), '--max', '30000', '--what', 'album-contact'], { encoding: 'utf8' });
  fs.rmSync(html, { force: true });
  console.log((r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('SMOKE')) ? `contact sheet: ${path.join(out, '00-contact.png')}` : 'contact sheet: failed');
}
