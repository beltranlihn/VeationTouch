// VEATION Touch lab — the shared GPU lock (05-plan §5.1), used by shot.mjs and measure.mjs.
// `.gpu-lock` at the repo root (in .git/info/exclude), one line «<agent> <ISO time> <what> <seconds>». Taken with an exclusive create
// (O_EXCL), in turn: waiters leave a ticket in `.gpu-queue/` and the oldest goes next. A lock older than 4 min is an orphan and is
// taken over (said aloud: tell the director). Released only by its owner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCK = path.join(ROOT, '.gpu-lock');
export const QUEUE = path.join(ROOT, '.gpu-queue');   // FIFO tickets: whoever waits longest goes next (no starvation by back-to-back shots)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for the lock and takes it. → release() (idempotent). Exits the process with code 3 when it never comes free. */
export async function takeGpuLock(agent, what, seconds, { waitMs = 15 * 60 * 1000, log = console.log } = {}) {
  const line = `${agent} ${new Date().toISOString()} ${String(what).replace(/\s+/g, '_').slice(0, 60)} ${Math.round(seconds)}\n`;
  let held = false;
  const release = () => { if (!held) return; held = false; try { if (fs.readFileSync(LOCK, 'utf8') === line) fs.unlinkSync(LOCK); } catch { /* gone */ } };
  // a ticket in the queue; the lock is taken only when ours is the oldest live ticket (stale tickets, > 5 min, are ignored)
  try { fs.mkdirSync(QUEUE, { recursive: true }); } catch { /* there */ }
  const ticket = path.join(QUEUE, `${Date.now()}-${process.pid}-${agent}`);
  try { fs.writeFileSync(ticket, line); } catch { /* no queue: plain retries */ }
  const dropTicket = () => { try { fs.unlinkSync(ticket); } catch { /* gone */ } };
  const myTurn = () => { try {
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    const live = fs.readdirSync(QUEUE).filter((n) => { const [t, pid] = n.split('-').map(Number); return Date.now() - t < 300000 && alive(pid); }).sort(); return !live.length || live[0] === path.basename(ticket); } catch { return true; } };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { release(); dropTicket(); process.exit(130); });
  process.once('exit', () => { release(); dropTicket(); });
  const t0 = Date.now(); let said = '';
  while (!held) {
    if (myTurn()) { try { fs.writeFileSync(LOCK, line, { flag: 'wx' }); held = true; dropTicket(); break; } catch (e) { if (e.code !== 'EEXIST') throw e; } }
    let other = '', age = 0;
    try { other = fs.readFileSync(LOCK, 'utf8').trim(); age = (Date.now() - fs.statSync(LOCK).mtimeMs) / 1000; } catch { other = '(free, another ticket first)'; age = 0; }
    if (age > 240) {
      log(`gpu-lock: ORPHAN lock (${Math.round(age)} s old): «${other}» — taking it. Tell the director.`);
      try { fs.unlinkSync(LOCK); } catch { /* someone else took it */ }
      continue;
    }
    if (Date.now() - t0 > waitMs) { log(`gpu-lock: the GPU stayed busy for ${Math.round(waitMs / 60000)} min («${other}»); giving up`); process.exit(3); }
    if (said !== other) { log(`gpu-lock: GPU busy — «${other}» (${Math.round(age)} s); queued`); said = other; }
    await sleep(2000);
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
