#!/usr/bin/env node
// VEATION Touch lab — ONE render under the shared GPU lock (05-plan §5.1). Every agent renders only through this.
//
//   node lab/tools/shot.mjs <agent> <path-or-url> [--shot out.png] [--what label] [--delay ms] [--eval js | --eval-file f.js]
//                           [--rows] [--width 1600] [--size WxH] [--max ms] [--no-stats] [--full]
//
//   e.g.  node lab/tools/shot.mjs vfx "/experiences/res-obra3d/index.html?capture&group=4&seed=3" --eval-file my.js --rows --width 1600 --shot /tmp/brasa.png
//
// 1. Takes the lock `.gpu-lock` (repo root; one line «<agent> <ISO time> <what> <seconds>»). If another agent holds it, waits and
//    retries every 20 s; a lock older than 4 min is an orphan: it says so (tell the director) and takes it.
// 2. Renders in a hidden Electron window (lab/tools/smoke.cjs) for at most --max ms (default 90 s: the 3D work needs ~15–20 s to
//    load). A path uses the harness already running on :8780, or starts a private one on a free port.
// 3. Releases the lock — always, also on failure or Ctrl+C.
// Prints the SMOKE line (errors, the --eval result, stats) and a summary «luma · p99 · burnt %» of the capture (the strip only).
// Exit code: 0 ok · 1 the page logged console errors · 2 failure · 3 the lock never came free.
// Scale: the harness's default (0.5). A URL asking ?scale=1 (or anything but 0.25 / 0.5) is refused unless --full (Tech/QA only, in
// the authorized windows).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../harness/serve.mjs';
import { takeGpuLock, findElectron } from './gpu-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const has = (k) => args.includes(k);
const agent = args[0];
// Git Bash (MSYS) rewrites an argument that starts with «/» into a Windows path under its install dir («/experiences/x» →
// «C:/Program Files/Git/experiences/x»): undo it, so the same command works from Bash, PowerShell and cmd.
const target = args[1] && (/^[A-Za-z]:[\\/]/.test(args[1]) ? args[1].replace(/\\/g, '/').replace(/^[A-Za-z]:\/(?:[^?]*?\/)?Git\//, '/') : args[1]);
if (!agent || !target || agent.startsWith('--') || target.startsWith('--')) {
  console.error('usage: node lab/tools/shot.mjs <agent> <path-or-url> [--shot out.png] [--what label] [--delay ms] [--eval js | --eval-file f.js] [--rows] [--width 1600] [--size WxH] [--max ms] [--no-stats] [--full]');
  process.exit(2);
}
if (!/^[A-Za-z0-9_.-]{1,24}$/.test(agent)) { console.error('agent: a short name (letters, digits, - _ .)'); process.exit(2); }

// ---- scale guard
const scaleOf = (u) => { const m = /[?&]scale=([0-9.]+)/.exec(u); return m ? Number(m[1]) : 0.5; };
if (![0.25, 0.5].includes(scaleOf(target)) && !has('--full')) {
  console.error(`shot: scale=${scaleOf(target)} renders the full strip on the shared GPU. Only Tech/QA, only in the authorized windows (03:30–03:45, 05:40–06:00): add --full.`);
  process.exit(2);
}

const electron = await findElectron();
if (!electron) { console.error('electron not found (npm install in the repo root, or set ELECTRON_PATH)'); process.exit(2); }

// ---- the lock
const maxMs = Math.max(10000, Number(flag('--max')) || 90000);
const what = (flag('--what') || (flag('--shot') ? path.basename(flag('--shot')) : target.split('?')[0].split('/').filter(Boolean).slice(-2).join('/'))).replace(/\s+/g, '_').slice(0, 60);
const release = await takeGpuLock(agent, what, maxMs / 1000, { waitMs: (Number(flag('--lock-wait')) || 15 * 60) * 1000, log: (m) => console.log('shot: ' + m.replace(/^gpu-lock: /, '')) });

// ---- the server
let url = target, lab = null;
if (!/^(https?|file):/.test(target)) {
  const p = target.startsWith('/') ? target : '/' + target;
  let up = false;
  try { const r = await fetch('http://localhost:8780/', { signal: AbortSignal.timeout(1500) }); up = r.ok; } catch { up = false; }
  if (up) url = 'http://localhost:8780' + p;
  else {
    try { lab = await createLabServer({ port: 0 }); } catch (e) { console.error('lab server: ' + e.message); release(); process.exit(2); }
    url = `http://localhost:${lab.port}${p}`;
  }
}

// ---- the render
const shot = flag('--shot') ? path.resolve(flag('--shot')) : null;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.LAB_SMOKE = JSON.stringify({
  url, shot, delay: flag('--delay') ? Number(flag('--delay')) : 300, size: flag('--size'), eval: flag('--eval'),
  evalFile: flag('--eval-file') ? path.resolve(flag('--eval-file')) : null, max: maxMs, rows: has('--rows'),
  crop: true, width: flag('--width') ? Number(flag('--width')) : undefined, stats: !has('--no-stats'),
});
// one window; a run that ends with no result line (the window crashed or never started: a GPU-process restart, another Electron
// starting at the same moment) is tried ONCE more, still under the lock
async function runOnce() {
  const child = spawn(electron, [path.join(HERE, 'smoke.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += String(e); });
  const guard = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, maxMs + 5000);
  const code = await new Promise((r) => child.on('close', r));   // 'close': stdout fully read (not just the process gone)
  clearTimeout(guard);
  return { code, line: out.split(/\r?\n/).find((l) => l.startsWith('SMOKE ')), err };
}
let run = await runOnce();
if (!run.line) { console.log(`shot: no result from the window (exit ${run.code}${run.err ? ', ' + run.err.trim().split('\n').pop().slice(0, 160) : ''}); trying once more`); run = await runOnce(); }
const code = run.code;
await lab?.close();
release();
const smoke = run.line || 'SMOKE ' + JSON.stringify({ error: 'no output from the window', exitCode: code, stderr: run.err.slice(-400) });
console.log(smoke);
try {
  const o = JSON.parse(smoke.slice(6));
  if (o.stats) console.log(`shot: ${what} · luma ${o.stats.luma} · p99 ${o.stats.p99} · burnt ${o.stats.burnt} % · errors ${o.errors?.length ?? '?'}${shot ? ' · ' + shot : ''}`);
} catch { /* printed as is */ }
process.exit(code ?? 2);
