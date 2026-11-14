// `npm run check` — syntax-check every JS file of the app (fast, no dependencies).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'engine', 'ui/js', 'sdk', 'scripts'];
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.m?js$/.test(f.name)) files.push(p); } };
roots.filter((r) => fs.existsSync(r)).forEach(walk);
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.error(`✖ ${f}\n${e.stderr}`); }
}
console.log(`${files.length - bad}/${files.length} files OK`);
process.exit(bad ? 1 : 0);
