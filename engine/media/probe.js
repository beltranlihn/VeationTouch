// probe(path): what a .mov holds, from its index only (a few small reads plus the `moov`), so it is fast even with the
// file still on a USB stick. Node-only wrapper around engine/media/mov.js (movIndexAsync + describeMovie).

import fs from 'node:fs';
import { movIndexAsync, describeMovie } from './mov.js';

/**
 * Opens a movie and indexes it. The caller closes it.
 * @param {string} file
 * @returns {Promise<{file:string, size:number, index:import('./mov.js').MovIndex,
 *   read:(offset:number, length:number) => Promise<Buffer>, close:() => Promise<void>}>}
 */
export async function openMovie(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const read = async (offset, length) => {
      const b = Buffer.allocUnsafe(Math.max(0, Math.min(length, size - offset)));
      if (!b.length) return b;
      const { bytesRead } = await fh.read(b, 0, b.length, offset);
      return b.subarray(0, bytesRead);
    };
    const index = await movIndexAsync(read, size);
    return { file, size, index, read, close: () => fh.close() };
  } catch (e) {
    await fh.close().catch(() => {});
    throw e;
  }
}

/**
 * @param {string} file
 * @returns {Promise<{video:{fourcc:string, codecName:string, width:number, height:number, fps:number, frames:number, duration:number},
 *   audio:{format:string, codecName:string, encoding:string|null, supported:boolean, channels:number, rate:number, frames:number, duration:number}|null,
 *   warnings:{code:string, message:string}[]}>}
 * Rejects with a coded error (err.code): no-moov, mov-bad, truncated, not-hap (err.codecName), hapm, not-supported —
 * or the fs error (ENOENT…).
 */
export async function probe(file) {
  const mv = await openMovie(file);
  try { return describeMovie(mv.index, mv.size); } finally { await mv.close(); }
}
