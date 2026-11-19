// Engine entry point. Runs inside Electron's utilityProcess (supervised by app/main.js) or
// standalone for development and headless installs:
//   node engine/main.js --data ./.data --port 8770

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger } from './log.js';
import { Store } from './store.js';
import { Engine } from './engine.js';
import { createServer } from './server.js';
import { MdnsResponder } from './mdns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const dataDir = path.resolve(args.data || path.join(root, '.data'));
const log = createLogger(path.join(dataDir, 'logs'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const parent = process.parentPort || null; // set when running as an Electron utilityProcess

const toParent = (msg) => { try { parent?.postMessage(msg); } catch { /* parent gone */ } };

process.on('uncaughtException', (e) => {
  log.error(`uncaught: ${e?.stack || e}`);
  // Let the supervisor restart a clean process instead of limping on in an unknown state.
  setTimeout(() => process.exit(70), 100);
});
process.on('unhandledRejection', (e) => log.error(`unhandled rejection: ${e?.stack || e}`));

const store = new Store(dataDir, path.join(root, 'profiles'), log);
const engine = new Engine({ store, log, version: pkg.version });
engine.start();

const wantPort = Number(args.port) || engine.settings.httpPort || 8770;
let server = null;
for (let p = wantPort; p < wantPort + 20 && !server; p++) {
  try { server = await createServer(engine, { port: p, root, log }); } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    log.warn(`port ${p} in use, trying ${p + 1}`);
  }
}
if (!server) { log.error('no free port for the server'); process.exit(71); }

engine.port = server.port;
// tablets can open http://<name>.local:<port>/ (mDNS); a busy or blocked UDP 5353 only loses the name, never the engine
const mdns = new MdnsResponder({ name: engine.settings.localName, log });
if (!args['no-mdns']) await mdns.start().catch((e) => log.warn(`mDNS: ${e.message}`));
engine.mdns = mdns;
engine.on('projection', (pr) => toParent({ type: 'projection', projection: pr, port: server.port }));
engine.on('textureWindows', (list) => toParent({ type: 'textureWindows', list }));
engine.on('experienceWindow', (window) => toParent({ type: 'experienceWindow', window }));
engine.on('autostart', (enabled) => toParent({ type: 'autostart', enabled }));
parent?.on('message', (e) => {
  const m = e.data;
  if (m?.type === 'displays') engine.setDisplays(m.list);
  if (m?.type === 'shutdown') shutdown();
});
toParent({ type: 'ready', port: server.port, token: engine.settings.token, projection: engine.settings.projection, autostart: engine.settings.autostart, textureWindows: engine.textureWindows(), experienceWindow: engine.experienceWindow() });
log.info(`UI: http://localhost:${server.port}/`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log.info('engine shutting down');
  server.close();
  await mdns.stop().catch(() => {});
  await engine.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
