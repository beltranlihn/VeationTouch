// The rig of the Convert to HAP page tests (tests/convert-page.test.mjs, tests/hap-player.test.mjs): an engine, its server and
// the real hidden helper page of the app (Electron through tests/ui/runner.cjs) that the engine's jobs go to. TEST-ONLY.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Store } from '../../../engine/store.js';
import { Engine } from '../../../engine/engine.js';
import { createServer } from '../../../engine/server.js';
import { movIndex, describeMovie } from '../../../engine/media/mov.js';
import { decodeFrame } from '../../../engine/media/hap.js';
import { blockImage } from '../../../engine/media/thumb.js';
import { readStripe } from './make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..', '..', '..');
export let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }

/** The engine, its server and one hidden helper page; `go(rig)` runs in the engine when the page is polling. → whatever it returns */
export async function withHelperPage(go, { pageScript = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cvp-'));
  const rig = { dir };
  rig.store = new Store(dir, path.join(root, 'profiles'), quiet);
  rig.engine = new Engine({ store: rig.store, log: quiet, version: 'test' });
  rig.engine.start();
  rig.server = await createServer(rig.engine, { port: 0, root, log: quiet });
  rig.engine.port = rig.server.port;
  const ctl = http.createServer(async (req, res) => {
    let out;
    try { out = (await go(rig)) ?? {}; } catch (e) { out = { error: String(e.stack || e.message) }; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out));
  });
  await new Promise((r) => ctl.listen(0, '127.0.0.1', r));
  try {
    const p = structuredClone(rig.engine.profile);
    p.simulation.wanderers = 0;
    await rig.engine.command('profile.update', { profile: p, rev: rig.engine.rev });
    const file = path.join(dir, 'script.js');
    fs.writeFileSync(file, pageScript || `return await fetch('http://127.0.0.1:${ctl.address().port}/go').then((x) => x.json());`);
    const run = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${rig.server.port}/helper${pageScript ? '?manual' : ''}`, `--script=${file}`, '--wait=load'];
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, run, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the UI runner: ${outText.slice(0, 800)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return data;
  } finally { ctl.close(); rig.server.close(); await rig.engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Converts `src` and returns the result movie, indexed: {job, bytes, ix, d}. */
export async function convertAndOpen(rig, src, opts) {
  const m = rig.engine.media;
  const { jobId } = await m.command('media.convert', { __local: true, path: src, ...opts });
  let job;
  for (let i = 0; i < 1200; i++) { job = m.mediaState().import.find((j) => j.id === jobId); if (job?.state === 'done' || job?.state === 'failed') break; await sleep(25); }
  if (job?.state !== 'done') throw new Error(`conversion ${job?.state}: ${job?.error}`);
  const med = m.show.media.find((x) => x.id === job.resultMediaId), file = path.join(m.libraryDir, med.file);
  const bytes = fs.readFileSync(file), ix = movIndex((o, l) => bytes.subarray(o, o + l), bytes.length);
  return { job, med, bytes, ix, d: describeMovie(ix, bytes.length) };
}
/** One decoded frame as pixels of its 4×4 blocks: {px(x, y) in the picture's pixels, number: its stripe}. */
export function frameOf({ bytes, ix, d }, f) {
  const v = ix.video, sample = bytes.subarray(v.offsets[f], v.offsets[f] + v.sizes[f]);
  const bi = blockImage(decodeFrame(sample, v.fourcc, v.width, v.height));
  const px = (x, y) => { const i = ((y >> 2) * bi.width + (x >> 2)) * 3; return [bi.rgb[i], bi.rgb[i + 1], bi.rgb[i + 2]]; };
  return { px, number: readStripe(px, v.width, v.height) };
}
