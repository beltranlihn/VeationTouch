// Every folder an experience reaches by relative path (../<sibling>/...) must itself be a catalog entry: the server only serves
// folders of catalog entries (engine/server.js, /experiences/<id>/), so a missing sibling is a 404 — or worse, a silent
// fallback (Ressonància reads its parts' defaults from ../res-3d-study/ and just looks wrong without it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXP = path.join(ROOT, 'experiences');

function* sources(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') yield* sources(p); }
    else if (/\.(m?js|html)$/i.test(e.name)) yield p;
  }
}

export function missingSiblings(expDir) {
  const ids = fs.readdirSync(expDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const out = [];
  for (const id of ids) {
    for (const file of sources(path.join(expDir, id))) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/['"`(]((?:\.\.\/)+[A-Za-z0-9_-]+)\//g)) {
        // resolve against the file: only paths that leave this experience's folder name a sibling
        const rel = path.relative(expDir, path.resolve(path.dirname(file), m[1])).split(path.sep);
        const sib = rel[0];
        if (sib === id || sib === '..' || rel.length !== 1) continue;
        if (!fs.existsSync(path.join(expDir, sib, 'manifest.json'))) out.push(`${path.relative(expDir, file)} -> ../${sib}/`);
      }
    }
  }
  return out;
}

test('experiences: every sibling folder reached by relative path is in the catalog', () => {
  assert.deepEqual(missingSiblings(EXP), []);
});

test('experiences: the sibling check fails when a sibling is missing (it can fail)', (t) => {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.data', 'deps-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'a')); fs.mkdirSync(path.join(tmp, 'b'));
  fs.writeFileSync(path.join(tmp, 'a', 'manifest.json'), '{}');
  fs.writeFileSync(path.join(tmp, 'a', 'x.js'), "import '../b/y.js'; const u = new URL(`../a/z.js`, import.meta.url);");
  fs.mkdirSync(path.join(tmp, 'a', 'deep', 'er'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'a', 'deep', 'er', 'w.js'), "fetch('../assets/t.png'); import('../../../b/y.js');"); // inside a; and b again
  assert.equal(missingSiblings(tmp).length, 2); // b has no manifest.json (reached twice); ../assets/ stays inside a
  fs.writeFileSync(path.join(tmp, 'b', 'manifest.json'), '{}');
  assert.deepEqual(missingSiblings(tmp), []);
});
