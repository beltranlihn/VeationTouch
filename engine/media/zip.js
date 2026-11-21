// A small ZIP reader: lists the central directory and extracts chosen entries (stored or deflated) to files, streaming, so
// a 170 MB build is never held in memory. Only what the FFmpeg download needs: no ZIP64, no encryption, no multi-disk.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';

/** The entries of a zip file: [{name, method, csize, size, offset}] (offset = the local header). */
export async function listZip(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('not a zip file (no end record)');
    const count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error('zip64 archives are not supported');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    const out = [];
    for (let p = 0, i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('the zip directory is damaged');
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), offset = cd.readUInt32LE(p + 42);
      out.push({ name: cd.toString('utf8', p + 46, p + 46 + nl), method, csize, size: usize, offset });
      p += 46 + nl + xl + cl;
    }
    return out;
  } finally { await fh.close(); }
}

/** Extracts one entry to `dest` (written whole to dest.tmp, then renamed). */
export async function extractEntry(file, entry, dest) {
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`zip entry "${entry.name}" uses compression ${entry.method}`);
  const fh = await fs.promises.open(file, 'r');
  try {
    const lh = Buffer.alloc(30);
    await fh.read(lh, 0, 30, entry.offset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('the zip entry header is damaged');
    const start = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    const src = fh.createReadStream({ start, end: start + entry.csize - 1, autoClose: false });
    const ws = fs.createWriteStream(tmp);
    await pipeline(src, ...(entry.method === 8 ? [zlib.createInflateRaw()] : []), ws);
    if (!ws.closed) await once(ws, 'close'); // (Windows refuses the rename while the handle is open)
    if (fs.statSync(tmp).size !== entry.size) { fs.rmSync(tmp, { force: true }); throw new Error(`zip entry "${entry.name}" came out ${'with the wrong size'}`); }
    await renameRetry(tmp, dest);
  } finally { await fh.close(); }
}


/** A rename that waits for a virus scanner (Windows holds a fresh .exe for a moment: EPERM / EBUSY). */
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (e) {
      if (i >= 40 || (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES')) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
