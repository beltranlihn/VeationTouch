// A source for the import worker to read instead of the plain file (MediaEngine › sourceOpener). TEST-ONLY.
// Same shape as engine/media/import-worker.js › openFile: { size, read(buf, off, len, pos) → bytes read, close() }.
//   failAfter: N   while `<file>.unplug` exists, a handle that has read more than N bytes throws EIO — the USB stick
//                  was pulled mid-copy (deleting the sentinel = plugging it back in)
//   delayMs: d     every read of more than 64 KB first waits d ms (a slow drive: a copy that lasts)
//   tail: { '<file name>': bytes }  the file goes on with a virtual `free` atom of that many bytes (a large movie that
//                  is not on disk: the moov comes before it, so the movie is still valid)

import fs from 'node:fs';
import path from 'node:path';

const PERIOD = 65521; // prime: the pattern never lines up with the 8 MB blocks
const PATTERN = Buffer.alloc(PERIOD);
for (let i = 0; i < PERIOD; i++) PATTERN[i] = (i * 2654435761) >>> 24;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

/** Writes the tail bytes [pos, pos+len) of a virtual tail starting at `base` into buf at `off`. */
function tailBytes(buf, off, len, pos, base, tail) {
  for (let i = 0; i < len; i++) {
    const p = pos + i - base;
    if (p < 8) { // the atom header: size (big-endian) + 'free'
      const h = Buffer.alloc(8); h.writeUInt32BE(tail, 0); h.write('free', 4, 'latin1');
      buf[off + i] = h[p];
      continue;
    }
    let k = (p - 8) % PERIOD, n = Math.min(len - i, PERIOD - k);
    PATTERN.copy(buf, off + i, k, k + n);
    i += n - 1;
  }
}

export function open(file, o = {}) {
  const fd = fs.openSync(file, 'r');
  const real = fs.fstatSync(fd).size;
  const tail = o.tail?.[path.basename(file)] || 0;
  const size = real + tail;
  let read = 0;
  return {
    size,
    read(buf, off, len, pos) {
      if (o.delayMs && len > 65536) Atomics.wait(sleeper, 0, 0, o.delayMs);
      if (o.failAfter !== undefined && read + len > o.failAfter && fs.existsSync(`${file}.unplug`)) {
        throw Object.assign(new Error('EIO: i/o error, read (the drive was removed)'), { code: 'EIO' });
      }
      const n = Math.max(0, Math.min(len, size - pos));
      let done = 0;
      if (pos < real) done = fs.readSync(fd, buf, off, Math.min(n, real - pos), pos);
      if (done < n && pos + done >= real) { tailBytes(buf, off + done, n - done, pos + done, real, tail); done = n; }
      read += done;
      return done;
    },
    close() { fs.closeSync(fd); },
  };
}
