// VEATION Touch lab — the REAL engine with the lab's experiments in its catalogue, without modifying the software.
//
//   node lab/tools/lab-engine.mjs [--port 8771] [--play <experience-id>]      (or: npm run lab:engine)
//
// This is `engine/main.js` (read only) started with one extra option the engine already has: `experienceDirs`, the folders it scans
// for experiments after its own `experiences/` (it is how the engine's tests add theirs). So the experiments of lab/experiments/
// appear in the Experiences tab and run through the app's REAL runtime (experiences/runtime.js): real hand playback, real walls from
// the profile, the room output, the viewer in the Live strip and the 3D room. Differences from `npm run engine`: port 8771 and its
// own data folder (lab/.data), so the lab never touches the app's data (.data/ or %APPDATA%).
//
// With the simulated profile ("Barcelona XR Lab (simulated)", picked automatically on a fresh data folder) the views show virtual
// hands. Open http://localhost:8771/ in Chrome/Edge: Experiences tab → pick an experiment → Play. For the page itself with the
// real runtime and the room's output: http://localhost:8771/experiences/<id>/index.html?run=1
//
// It does NOT cover the desktop app (`npm start`): that one starts its own engine with only the app's experiences/ folder. For
// the app, an experiment has to be integrated by the studio (copied into experiences/).
// Limits: no Electron here, so no Spout and no room audio window — Spout and sound need the desktop app (sound pieces: use the lab's
// sound stage, /sound/<id> on the lab server).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LAB_EXPERIMENTS = path.resolve(HERE, '..', 'experiments');
const imp = (p) => import(new URL(`file:///${path.join(ROOT, p).replace(/\\/g, '/')}`).href);
const { createLogger } = await imp('engine/log.js');
const { Store } = await imp('engine/store.js');
const { Engine } = await imp('engine/engine.js');
const { createServer } = await imp('engine/server.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const dataDir = path.resolve(args.data || path.join(HERE, '..', '.data'));
fs.mkdirSync(dataDir, { recursive: true });
const log = createLogger(path.join(dataDir, 'logs'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
process.on('unhandledRejection', (e) => log.error(`unhandled rejection: ${e?.stack || e}`));

const store = new Store(dataDir, path.join(ROOT, 'profiles'), log);
const engine = new Engine({ store, log, version: pkg.version, experienceDirs: [LAB_EXPERIMENTS] });
engine.desktop = false;
engine.start();

const want = Number(args.port) || 8771;
let server = null;
for (let p = want; p < want + 20 && !server; p++) {
  try { server = await createServer(engine, { port: p, root: ROOT, log }); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
}
if (!server) { console.error('no free port for the lab engine'); process.exit(71); }
engine.port = server.port;

const lab = engine.catalog.filter((e) => String(e.dir).startsWith(LAB_EXPERIMENTS));
console.log(`VEATION Touch (lab): http://localhost:${server.port}/`);
console.log(`profile: ${engine.profile.name}`);
console.log(`lab experiments in the catalogue: ${lab.length ? lab.map((e) => `${e.id} (${e.kind})`).join(', ') : 'none yet'}`);
if (args.play && args.play !== true) {
  try { await engine.command('experience.play', { id: String(args.play) }); console.log(`playing: ${args.play}`); } catch (e) { console.error(`--play: ${e.message}`); }
}

async function shutdown() { await engine.stop(); server.close(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
