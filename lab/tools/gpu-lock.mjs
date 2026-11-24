// VEATION Touch lab — the shared GPU lock (05-plan §5.1), used by shot.mjs and measure.mjs.
// `.gpu-lock` at the repo root (in .git/info/exclude), one line «<agent> <ISO time> <what> <seconds>». Taken with an exclusive create
// (O_EXCL); a lock older than 4 min is an orphan and is taken over (said aloud: tell the director). Released only by its owner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCK = path.join(ROOT, '.gpu-lock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for the lock and takes it. → release() (idempotent). Exits the process with code 3 when it never comes free. */
export async function takeGpuLock(agent, what, seconds, { waitMs = 15 * 60 * 1000, log = console.log } = {}) {
  const line = `${agent} ${new Date().toISOString()} ${String(what).replace(/\s+/g, '_').slice(0, 60)} ${Math.round(seconds)}\n`;
  let held = false;
  const release = () => { if (!held) return; held = false; try { if (fs.readFileSync(LOCK, 'utf8') === line) fs.unlinkSync(LOCK); } catch { /* gone */ } };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { release(); process.exit(130); });
  process.once('exit', release);
  const t0 = Date.now(); let said = '';
  while (!held) {
    try { fs.writeFileSync(LOCK, line, { flag: 'wx' }); held = true; break; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let other = '', age = 0;
    try { other = fs.readFileSync(LOCK, 'utf8').trim(); age = (Date.now() - fs.statSync(LOCK).mtimeMs) / 1000; } catch { continue; }   // freed meanwhile
    if (age > 240) {
      log(`gpu-lock: ORPHAN lock (${Math.round(age)} s old): «${other}» — taking it. Tell the director.`);
      try { fs.unlinkSync(LOCK); } catch { /* someone else took it */ }
      continue;
    }
    if (Date.now() - t0 > waitMs) { log(`gpu-lock: the GPU stayed busy for ${Math.round(waitMs / 60000)} min («${other}»); giving up`); process.exit(3); }
    if (said !== other) { log(`gpu-lock: GPU busy — «${other}» (${Math.round(age)} s); retrying every 20 s`); said = other; }
    await sleep(20000);
  }
  return release;
}

/** electron's executable: this tree's node_modules, else the main checkout this worktree hangs from, else $ELECTRON_PATH. */
export async function findElectron() {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  for (const r of [ROOT, path.resolve(ROOT, '..', '..', '..')]) { try { return require(path.join(r, 'node_modules', 'electron')); } catch { /* next */ } }
  if (process.env.ELECTRON_PATH && fs.existsSync(process.env.ELECTRON_PATH)) return process.env.ELECTRON_PATH;
  return null;
}
