// VEATION Touch lab — the lab server. A tiny static server (Node only, no dependencies) that runs the lab's experiments in a plain
// browser WITHOUT the app and WITHOUT touching it:
//
//   node lab/harness/serve.mjs [--port 8780]        →  http://localhost:8780/
//
//   /                              the lab: every experiment, its stage and status
//   /experiences/<id>/<file>       lab/experiments/<id>/<file>     (the URL a runtime-ready experiment has in the app)
//   /experiences/runtime.js        harness/runtime.js              (the DEV runtime, same API as the app's)
//   /__real/runtime.js             experiences/runtime.js          (the app's own file, read only: makeHands, makeMedia)
//   /sound/<id>                    a sound piece on the simulated 4.1 room
//   /experiments/<id>/<file>       the same folder, for standalone prototypes
//   /harness/<file>                lab/harness/<file>              (kit.js…)
//
// It only reads. It listens on 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '..');
const REPO = path.resolve(LAB, '..');
const EXP = path.join(LAB, 'experiments');
const REAL_RUNTIME = path.join(REPO, 'experiences', 'runtime.js');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glsl': 'text/plain; charset=utf-8', '.wgsl': 'text/plain; charset=utf-8' };
const ID_RE = /^[A-Za-z0-9_-]{1,60}$/;

/** `rel` inside `base`, or null (no `..`, no escaping the folder). */
function within(base, rel) {
  const f = path.resolve(base, '.' + path.sep + rel);
  return f === base || f.startsWith(base + path.sep) ? f : null;
}

function send(res, file, headers = {}) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', ...headers });
    fs.createReadStream(file).pipe(res);
  });
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** What is in lab/experiments/: id, name, stage (runtime | sound | prototype), status and kind from NOTES.md. */
export function listExperiments() {
  let names = [];
  try { names = fs.readdirSync(EXP, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { /* none yet */ }
  return names.map((folder) => {
    const dir = path.join(EXP, folder), m = readJson(path.join(dir, 'manifest.json'));
    let notes = ''; try { notes = fs.readFileSync(path.join(dir, 'NOTES.md'), 'utf8'); } catch { /* no notes yet */ }
    const field = (k) => (notes.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.+)`, 'i')) || [])[1]?.trim() || '';
    const title = (notes.match(/^#\s+(.+)$/m) || [])[1]?.trim();
    const stage = m ? (m.kind === 'sound' ? 'sound' : 'runtime') : fs.existsSync(path.join(dir, 'index.html')) ? 'prototype' : 'empty';
    return { folder, id: m?.id || folder, name: m?.name || title || folder, stage, status: field('Status') || 'unknown', kind: field('Kind') || (stage === 'sound' ? 'sound' : 'visual'),
      author: field('Author'), updated: field('Updated'), preview: fs.existsSync(path.join(dir, 'preview.png')), template: folder.startsWith('_') };
  });
}

export function createLabServer({ port = 8780 } = {}) {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (p === '/' || p === '/index.html') return send(res, path.join(HERE, 'index.html'));
    if (p === '/api/experiments') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(listExperiments())); }
    if (p === '/experiences/runtime.js') return send(res, path.join(HERE, 'runtime.js'));
    if (p === '/__real/runtime.js') return send(res, REAL_RUNTIME);
    let m;
    if ((m = p.match(/^\/sound\/([^/]+)\/?$/)) && ID_RE.test(m[1])) return send(res, path.join(HERE, 'sound.html'));
    if (p.startsWith('/harness/')) { const f = within(HERE, p.slice('/harness/'.length)); return f ? send(res, f) : (res.writeHead(404), res.end()); }
    if ((m = p.match(/^\/(experiences|experiments)\/([^/]+)\/(.*)$/)) && ID_RE.test(m[2])) {
      // /experiences/<id> may be a manifest id or a folder name: the folder wins, then a manifest with that id
      let dir = within(EXP, m[2]);
      if (!dir || !fs.existsSync(dir)) { const hit = listExperiments().find((e) => e.id === m[2]); dir = hit ? within(EXP, hit.folder) : null; }
      const f = dir ? within(dir, m[3] || 'index.html') : null;
      return f ? send(res, f.endsWith(path.sep) ? path.join(f, 'index.html') : f) : (res.writeHead(404), res.end('not found'));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const want = i > 0 ? Number(process.argv[i + 1]) : 8780;
  let lab = null;
  for (let port = want; port < want + 20 && !lab; port++) {
    try { lab = await createLabServer({ port }); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (!lab) { console.error('no free port'); process.exit(1); }
  console.log(`VEATION Touch lab: http://localhost:${lab.port}/   (Ctrl+C to stop)`);
}
