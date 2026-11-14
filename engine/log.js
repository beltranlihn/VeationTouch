// Logger: console + rotating file (5 × 2 MB) + in-memory ring for the UI's log view.

import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const FILES = 5;
const RING = 400;

export function createLogger(dir, { quiet = false } = {}) {
  const ring = [];
  const listeners = new Set();
  let file = null, size = 0;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'engine.log');
    try { size = fs.statSync(file).size; } catch { size = 0; }
  }

  const rotate = () => {
    for (let i = FILES - 1; i >= 1; i--) {
      const a = i === 1 ? file : `${file}.${i - 1}`;
      try { fs.renameSync(a, `${file}.${i}`); } catch { /* missing */ }
    }
    size = 0;
  };

  const write = (level, msg) => {
    const entry = { t: Date.now(), level, msg: String(msg) };
    ring.push(entry);
    if (ring.length > RING) ring.shift();
    const line = `${new Date(entry.t).toISOString()} ${level.toUpperCase().padEnd(5)} ${entry.msg}\n`;
    if (!quiet) (level === 'error' ? process.stderr : process.stdout).write(line);
    if (file) {
      try {
        if (size + line.length > MAX_BYTES) rotate();
        fs.appendFileSync(file, line);
        size += line.length;
      } catch { /* disk issues must never crash the engine */ }
    }
    for (const l of listeners) { try { l(entry); } catch { /* ignore */ } }
  };

  return {
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
    recent: () => ring.slice(),
    onEntry: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
