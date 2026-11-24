#!/usr/bin/env node
// VEATION Touch lab — frame-time measurement of res-obra3d, block by block, under the GPU lock (Tech/QA; 05-plan §6.3).
// Runs from a fresh checkout (repo root, after `npm install`): it starts its own lab server when :8780 is not up, needs nothing else.
//
//   node lab/tools/measure.mjs --full [--blocks brasa,pinya,pinya@15,tronc,pom,festa] [--quality high,medium] [--scale 1] [--secs 20]
//                              [--viewer] [--group 4] [--uncapped] [--renderer auto|webgl2] [--out results.json]
//
//   e.g. (the room server, scale 1, room + viewer):  node lab/tools/measure.mjs --full --viewer
//
// Blocks: any score block; `block@N` measures it with N virtual hands (default --group, 4). Defaults: brasa, pinya, pinya@15, tronc,
// pom, festa × high, medium. For each block × quality: one Electron run (the GPU lock is taken and released around it, so the team can
// render between runs) with the ROOM instance at --scale (default 1 = 7196 × 912) and, with --viewer, the app's VIEWER instance beside
// it (?view=1: 0.5×, 30 fps, low quality — the second copy of the page Live shows), both on the same GPU. Both wait for the light-set
// warm-up, jump to the block, settle 3 s, then the room measures its frames for --secs: fps, frame-time p50 / p95 / p99 / worst (ms),
// frames over 20 and over 33 ms, the host's own fps and the slowest CPU step per part (__obra.prof). At the end, a markdown table.
// The hidden window is offscreen: rAF is held to 60 (a 60 Hz output); --uncapped lifts the limit to see the headroom.
// Scale > 0.5 renders the full strip on a shared GPU: refused without --full.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../harness/serve.mjs';
import { takeGpuLock, findElectron } from './gpu-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const blocks = String(flag('--blocks', 'brasa,pinya,pinya@15,tronc,pom,festa')).split(',').map((b) => b.trim()).filter(Boolean);
const qualities = String(flag('--quality', 'high,medium')).split(',').map((q) => q.trim()).filter(Boolean);
const scale = Number(flag('--scale', 1)), secs = Math.max(5, Number(flag('--secs', 20))), group = Number(flag('--group', 4));
const renderer = flag('--renderer', 'auto');
if (scale > 0.5 && !has('--full')) { console.error(`measure: scale=${scale} renders the full strip on the shared GPU: add --full (Tech/QA, or a machine of its own).`); process.exit(2); }
const electron = await findElectron();
if (!electron) { console.error('electron not found (npm install in the repo root)'); process.exit(2); }

let base = 'http://localhost:8780', lab = null;
try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch { lab = await createLabServer({ port: 0 }); base = `http://localhost:${lab.port}`; }
const urlOf = (quality, hands, view) => `${base}/experiences/res-obra3d/index.html?capture${view ? '&view=1' : `&scale=${scale}`}&group=${hands}&seed=3&params=${encodeURIComponent(JSON.stringify({ quality, renderer }))}`;

const results = [];
for (const quality of qualities) for (const spec of blocks) {
  const [block, n] = spec.split('@'), hands = Number(n) || group;
  const max = (secs + 70) * 1000;
  const release = await takeGpuLock('qa', `measure-${block}@${hands}-${quality}-s${scale}`, max / 1000, { log: (m) => console.log('measure: ' + m) });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  env.LAB_MEASURE = JSON.stringify({ room: urlOf(quality, hands, false), viewer: has('--viewer') ? urlOf(quality, hands, true) : null, block, secs, settle: 3000, uncapped: has('--uncapped'), max });
  const child = spawn(electron, [path.join(HERE, 'measure.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
  const guard = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, max + 5000);
  const code = await new Promise((r) => child.on('close', r));
  clearTimeout(guard); release();
  const line = out.split(/\r?\n/).find((l) => l.startsWith('MEASURE ')) || 'MEASURE ' + JSON.stringify({ error: 'no output', code, stderr: err.slice(-300) });
  let o; try { o = JSON.parse(line.slice(8)); } catch { o = { error: line }; }
  Object.assign(o, { block: o.block || block, spec, hands, quality, scale, viewerOn: has('--viewer') });
  results.push(o);
  if (o.error) console.log(`${spec.padEnd(9)} ${quality} ERROR ${o.error} ${JSON.stringify(o.errors || [])}`);
  else console.log(`${spec.padEnd(9)} ${quality} s${scale}${o.viewerOn ? ' +viewer' : ''}: ${o.fps} fps · p50 ${o.p50} · p95 ${o.p95} · p99 ${o.p99} · worst ${o.worst} ms · >20ms ${o.over20} · >33ms ${o.over33}` +
    `${o.viewer ? ` · viewer ${o.viewer.fps} fps` : ''} · errors ${o.errors?.length ?? 0} · cpu ${JSON.stringify(o.cpu)}`);
}
await lab?.close();
const outFile = flag('--out'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\n| block | hands | quality | fps | p50 ms | p95 | p99 | worst | >33 ms | viewer fps | errors |\n|---|---|---|---|---|---|---|---|---|---|---|`);
for (const o of results) console.log(o.error ? `| ${o.block} | ${o.hands} | ${o.quality} | ERROR: ${String(o.error).slice(0, 60)} | | | | | | | |`
  : `| ${o.block} | ${o.hands} | ${o.quality} | ${o.fps} | ${o.p50} | ${o.p95} | ${o.p99} | ${o.worst} | ${o.over33} | ${o.viewer ? o.viewer.fps : '—'} | ${o.errors?.length ?? 0} |`);
console.log(`(scale ${scale} = ${Math.round(7196 * scale)} × ${Math.round(912 * scale)}${has('--viewer') ? ', + viewer 0.5 / 30 fps / low' : ''}, ${secs} s per block)`);
process.exit(results.some((r) => r.error) ? 2 : 0);
