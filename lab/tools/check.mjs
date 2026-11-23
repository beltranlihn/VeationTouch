// VEATION Touch lab — check a page without looking at it. Starts the lab server if it is not running, opens the URL in a hidden
// Electron window (tools/smoke.cjs), prints what the page logged and optionally saves a screenshot.
//
//   node lab/tools/check.mjs <path-or-url> [--shot out.png] [--delay 2500] [--size 1600x400] [--eval "js"] [--eval-file f.js]
//   e.g.  node lab/tools/check.mjs /experiences/my-piece/index.html --shot lab/experiments/my-piece/preview.png --delay 8000
//
// Output: one line "SMOKE {...}" with { url, title, errors[], result }. Exit 0 = no console errors. A hidden window: nothing shows.
// Only the processes this script starts are stopped.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../harness/serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const target = args[0] && !args[0].startsWith('--') ? args[0] : null;
if (!target) { console.error('usage: node lab/tools/check.mjs <path-or-url> [--shot out.png] [--delay ms] [--size WxH] [--eval js]'); process.exit(2); }
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
let electron;
try { electron = require(path.resolve(HERE, '..', '..', 'node_modules', 'electron')); } catch { console.error('electron is not installed (run npm install in the repo root)'); process.exit(2); }

let url = target, lab = null;
if (!/^(https?|file):/.test(target)) {
  try { lab = await createLabServer({ port: 0 }); } catch (e) { console.error('lab server: ' + e.message); process.exit(2); }
  url = `http://localhost:${lab.port}${target.startsWith('/') ? '' : '/'}${target}`;
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.LAB_SMOKE = JSON.stringify({ url, shot: flag('--shot') ? path.resolve(flag('--shot')) : null, delay: flag('--delay') ? Number(flag('--delay')) : undefined, size: flag('--size'), eval: flag('--eval'), evalFile: flag('--eval-file') ? path.resolve(flag('--eval-file')) : null });
const child = spawn(electron, [path.join(HERE, 'smoke.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
let err = ''; child.stderr.on('data', (d) => { err += d; }); child.on('error', (e) => { err += String(e); });
const guard = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 20000);
child.on('exit', async (code) => {
  clearTimeout(guard);
  const line = out.split(/\r?\n/).find((l) => l.startsWith('SMOKE ')) || 'SMOKE ' + JSON.stringify({ error: 'no output from the window', exitCode: code, stderr: err.slice(-400) });
  console.log(line);
  await lab?.close();
  process.exit(code ?? 2);
});
