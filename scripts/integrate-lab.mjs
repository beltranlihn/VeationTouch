// Copy lab experiments into experiences/ (the studio's integration step; lab/CLAUDE.md §8.2).
//
//   node scripts/integrate-lab.mjs --from <repo-or-worktree-with-lab> <id> [<id> …] [--dry]
//
// Each lab/experiments/<id>/ is copied to experiences/<id>/ (replacing what was there), skipping lab-only files: review and
// room-viewer pages, screenshots folders, previews, shots. The folder names are kept, because pieces import their siblings by
// relative path (../<sibling>/...). Prints what it copied and the size; refuses files over 20 MB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = argv.includes('--dry'); if (dry) argv.splice(argv.indexOf('--dry'), 1);
const from = path.resolve(flag('--from') || ROOT);
const ids = argv;
if (!ids.length) { console.error('usage: node scripts/integrate-lab.mjs --from <repo> <id> [<id> …] [--dry]'); process.exit(2); }

const SKIP_FILES = /^(review\.html|sala3d\.(html|js)|preview\.png)$/i;
const SKIP_DIRS = /^(shots|captures|screenshots|node_modules|\.data)$/i;
const MAX = 20 * 1024 * 1024;

let total = 0;
const missing = new Set();
for (const id of ids) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || id.startsWith('_')) throw new Error(`bad id: ${id}`);
  const src = path.join(from, 'lab', 'experiments', id);
  const dst = path.join(ROOT, 'experiences', id);
  if (!fs.existsSync(path.join(src, 'manifest.json'))) throw new Error(`${src} has no manifest.json`);
  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name)) walk(path.join(dir, e.name), path.join(rel, e.name)); continue; }
      if (SKIP_FILES.test(e.name)) continue;
      const size = fs.statSync(path.join(dir, e.name)).size;
      if (size > MAX) throw new Error(`${path.join(id, rel, e.name)} is over 20 MB`);
      files.push([path.join(rel, e.name), size]);
    }
  })(src, '');
  // sibling folders this piece reaches by relative path: they must be integrated too, or they 404 (or fail silently)
  for (const [rel] of files) {
    if (!/\.(m?js|html|json)$/i.test(rel)) continue;
    const text = fs.readFileSync(path.join(src, rel), 'utf8');
    for (const m of text.matchAll(/\.\.\/([A-Za-z0-9_-]+)\//g)) {
      const sib = m[1];
      if (sib === id || ids.includes(sib) || !fs.existsSync(path.join(from, 'lab', 'experiments', sib))) continue;
      missing.add(`${sib} (used by ${id}/${rel.replace(/\\/g, '/')})`);
    }
  }
  const bytes = files.reduce((a, [, s]) => a + s, 0); total += bytes;
  console.log(`${id}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB${dry ? ' (dry run)' : ''}`);
  if (dry) continue;
  fs.rmSync(dst, { recursive: true, force: true });
  for (const [rel] of files) {
    fs.mkdirSync(path.dirname(path.join(dst, rel)), { recursive: true });
    fs.copyFileSync(path.join(src, rel), path.join(dst, rel));
  }
}
console.log(`total ${(total / 1048576).toFixed(1)} MB`);
if (missing.size) { console.error(`MISSING sibling folders (add them to the list):\n  ${[...missing].join('\n  ')}`); process.exit(1); }
