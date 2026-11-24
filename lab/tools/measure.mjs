#!/usr/bin/env node
// VEATION Touch lab — frame-time measurement of res-obra3d, block by block, under the GPU lock (Tech/QA; 05-plan §6.3).
//
//   node lab/tools/measure.mjs [--blocks brasa,pinya,festa] [--quality high|medium|low] [--scale 1] [--secs 20] [--viewer]
//                              [--group 4] [--uncapped] [--renderer auto|webgl2] [--out results.json] [--full]
//
// For each block: one Electron run (lock taken and released around it, so the team can render between blocks) with the ROOM instance
// at --scale (default 1 = 7196 × 912) and, with --viewer, the app's VIEWER instance beside it (?view=1: 0.5×, 30 fps, low quality —
// the second copy of the page that Live shows), both on the same GPU. Virtual hands: ?group=N (default 4). Both wait for the light-set
// warm-up, jump to the block, settle 3 s, then the room measures its frames for --secs: fps, frame-time p50 / p95 / p99 / worst
// (ms), frames over 20 ms and over 33 ms, the host's own fps counter and the slowest CPU step per part (__obra.prof).
// The hidden window is offscreen: rAF is held to 60 (as a 60 Hz output); --uncapped lifts it to 240 to see the headroom.
// Scale 1 is the full strip on the shared GPU: refused without --full (only Tech/QA, only in the authorized windows).
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
const blocks = String(flag('--blocks', 'brasa,pinya,festa')).split(',').map((b) => b.trim()).filter(Boolean);
const scale = Number(flag('--scale', 1)), secs = Math.max(5, Number(flag('--secs', 20))), group = Number(flag('--group', 4));
const quality = flag('--quality', 'high'), renderer = flag('--renderer', 'auto');
if (scale > 0.5 && !has('--full')) { console.error(`measure: scale=${scale} renders the full strip on the shared GPU. Only Tech/QA, only in the authorized windows (03:30–03:45, 05:40–06:00): add --full.`); process.exit(2); }
const electron = await findElectron();
if (!electron) { console.error('electron not found'); process.exit(2); }

let base = 'http://localhost:8780', lab = null;
try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch { lab = await createLabServer({ port: 0 }); base = `http://localhost:${lab.port}`; }
const params = encodeURIComponent(JSON.stringify({ quality, renderer }));
const roomUrl = `${base}/experiences/res-obra3d/index.html?capture&scale=${scale}&group=${group}&seed=3&params=${params}`;
const viewerUrl = has('--viewer') ? `${base}/experiences/res-obra3d/index.html?capture&view=1&group=${group}&seed=3&params=${params}` : null;

const results = [];
for (const block of blocks) {
  const max = (secs + 60) * 1000;
  const release = await takeGpuLock('qa', `measure-${block}-${quality}-s${scale}`, max / 1000, { log: (m) => console.log('measure: ' + m) });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  env.LAB_MEASURE = JSON.stringify({ room: roomUrl, viewer: viewerUrl, block, secs, settle: 3000, uncapped: has('--uncapped'), max });
  const child = spawn(electron, [path.join(HERE, 'measure.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
  const guard = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, max + 5000);
  const code = await new Promise((r) => child.on('exit', r));
  clearTimeout(guard); release();
  const line = out.split(/\r?\n/).find((l) => l.startsWith('MEASURE ')) || 'MEASURE ' + JSON.stringify({ error: 'no output', code, stderr: err.slice(-300) });
  let o; try { o = JSON.parse(line.slice(8)); } catch { o = { error: line }; }
  o.block = o.block || block; o.quality = quality; o.scale = scale; o.viewerOn = !!viewerUrl; o.group = group;
  results.push(o);
  if (o.error) console.log(`${block.padEnd(8)} ERROR ${o.error} ${JSON.stringify(o.errors || [])}`);
  else console.log(`${block.padEnd(8)} ${quality} s${scale}${viewerUrl ? ' +viewer' : ''}: ${o.fps} fps · p50 ${o.p50} · p95 ${o.p95} · p99 ${o.p99} · worst ${o.worst} ms · >20ms ${o.over20} · >33ms ${o.over33}` +
    `${o.viewer ? ` · viewer ${o.viewer.fps} fps` : ''} · errors ${o.errors?.length ?? 0} · cpu ${JSON.stringify(o.cpu)}`);
}
await lab?.close();
const out = flag('--out'); if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.error) ? 2 : 0);
