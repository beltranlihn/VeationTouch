// P0 of docs/research/media-formats.md (§7.2): can this computer play a wide H.264 (7196×912, the room canvas) and at what cost?
// A MEASUREMENT, not a test: it needs the GPU of the room (it is NOT named *.test.mjs, so `npm test` does not run it). It makes
// an engine on a temp folder, imports the file, plays it on the output page (the app's output window, off screen) for a few
// seconds and prints what the helper says (hardware or CPU decoding) and how the playback went (frames, late frames, decode
// time per frame, whole-machine CPU).
//
//   node tests/probe/video-wide.mjs <file.mp4> [seconds=8]
//
// The source is made with FFmpeg OUTSIDE the repo, e.g.
//   ffmpeg -f lavfi -i testsrc2=size=7196x912:rate=60:duration=6 -c:v libx264 -preset veryfast -crf 24 -g 60 -bf 2 -pix_fmt yuv420p -level 5.2 -movflags +faststart wide.mp4

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../../engine/store.js';
import { Engine } from '../../engine/engine.js';
import { createServer } from '../../engine/server.js';
import { normalizeProfile } from '../../engine/profile.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const file = path.resolve(process.argv[2] || '');
const seconds = Number(process.argv[3] || 8);
if (!fs.existsSync(file)) { console.error('usage: node tests/probe/video-wide.mjs <file.mp4> [seconds]'); process.exit(1); }
const electron = (await import('electron')).default;
const quiet = { info() {}, warn(m) { console.log('warn:', m); }, error(m) { console.log('error:', m); }, recent: () => [] };
const cpu = () => os.cpus().reduce((a, c) => { for (const k of Object.keys(c.times)) a[k] = (a[k] || 0) + c.times[k]; return a; }, {});
const busy = (a, b) => { const d = (k) => (b[k] || 0) - (a[k] || 0), t = ['user', 'nice', 'sys', 'idle', 'irq'].reduce((s, k) => s + d(k), 0); return Math.round(100 * (1 - d('idle') / t)); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-wide-'));
const store = new Store(dir, path.join(root, 'profiles'), quiet);
const engine = new Engine({ store, log: quiet, version: 'probe' });
engine.start();
const server = await createServer(engine, { port: 0, root, log: quiet });
engine.port = server.port;
try {
  const p = structuredClone(engine.profile);
  p.simulation.wanderers = 0; p.experience = normalizeProfile({}).experience;
  p.output = { ...normalizeProfile({}).output, on: true, scale: 0.25 };
  await engine.command('profile.update', { profile: p, rev: engine.rev });
  console.log(`canvas ${engine.profile.canvas.width}×${engine.profile.canvas.height}, output ${engine.profile.canvas.width * 0.25}×${engine.profile.canvas.height * 0.25}`);
  // the helper page answers canDecode (a second Electron window: the helper), the output page plays
  const helper = spawn(electron.toString(), [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/helper`, `--script=${path.join(dir, 'idle.js')}`, '--wait=load'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'idle.js'), 'await new Promise((r) => setTimeout(r, 30000)); return 1;');
  for (let i = 0; i < 100 && !engine.media.helper.online; i++) await new Promise((r) => setTimeout(r, 100));
  const imp = await engine.media.importFiles([file], { layerId: 'L1', column: 0 }, { __local: true });
  console.log('import:', JSON.stringify(imp.accepted.map((a) => ({ name: a.name, warnings: a.warnings }))), JSON.stringify(imp.rejected));
  helper.kill();
  const m = engine.media.show.media[0];
  if (!m) { console.log('not imported'); process.exit(0); }
  console.log('medium:', JSON.stringify(m.video));
  for (let i = 0; i < 400 && [...engine.media.jobs.values()].some((j) => j.state !== 'done'); i++) await new Promise((r) => setTimeout(r, 100));
  const script = `
    const { store, cmd } = await import('/js/conn.js');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(15); return !!f(); };
    await until(() => window.__out && window.__out.mixer() && store.state && store.state.show && window.__out.clock.ready && window.__out.clock.samples >= 60, 15000);
    const O = window.__out, M = O.media;
    await cmd('clip.trigger', { clipId: ${JSON.stringify(engine.media.show.clips[0].id)}, layerId: 'L1', transitionMs: 0 });
    await until(() => { const p = M.info().players[0]; return p && p.ready; }, 20000);
    await wait(1500);
    await fetch('http://127.0.0.1:${server.port}/api/health'); // (nothing: a marker in the server's log would need a route)
    const a = M.info().players[0], t0 = performance.now(), s0 = { ...a.seq }, v0 = { ...M.info().video };
    await wait(${seconds * 1000});
    const b = M.info().players[0], v1 = M.info().video;
    return { seconds: (performance.now() - t0) / 1000, before: s0, after: b.seq, stats: b.stats, lat: b.lat, video: v1, vbefore: v0, timing: O.stats.timing, w: b.w, h: b.h };`;
  fs.writeFileSync(path.join(dir, 'play.js'), script);
  const c0 = cpu();
  const out = await new Promise((resolve) => {
    const pr = spawn(electron.toString(), [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${server.port}/output?run=1`, `--script=${path.join(dir, 'play.js')}`, '--wait=load', '--output-window', '--w=640', '--h=200'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = ''; pr.stdout.on('data', (d) => { buf += d; }); pr.on('exit', () => resolve(buf));
  });
  const c1 = cpu();
  const line = out.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
  const d = JSON.parse(line.slice(line.indexOf(' ') + 1)), r = d.result;
  if (!r) { console.log(line.slice(0, 600)); process.exit(1); }
  const q = (k) => r.after[k] - r.before[k];
  console.log(`picture ${r.w}×${r.h}`);
  console.log(`played ${r.seconds.toFixed(1)} s: ${q('newFrames')} new frames (${(q('newFrames') / r.seconds).toFixed(1)}/s), ${q('skipped')} skipped, ${q('late')} late output frames of ${q('frames')} (${(100 * q('late') / q('frames')).toFixed(1)} %)`);
  console.log(`request → bitmap latency ${r.lat.toFixed(1)} ms; decoder pool ${JSON.stringify(r.video)}; composed ${JSON.stringify(r.timing)}`);
  console.log(`whole-machine CPU during the whole run (page start included): ${busy(c0, c1)} %`);
} finally { server.close(); await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
process.exit(0);
