// The import worker (MEDIA-SERVER.md §4.1, §4d.3): everything that reads a movie's bytes for the library runs here, in
// a worker_thread of the engine, never in its 60 Hz loop — the index (probe), the fingerprint, the thumbnails and the
// copy. One worker per task; engine/media/index.js queues the copies (one at a time, in order).
//
// The copy (§4d.3 step 4): sequential, in 8 MB blocks, into `<name>.part` next to the final file, fsync, rename. The
// `.part` has a sidecar `<name>.part.json` = {fingerprint, size, src}: when the same source comes back (same
// fingerprint and size) after the drive was pulled, the copy CONTINUES from the last whole block of the `.part`.
// A read error = the source went away: the `.part` is kept (fsynced) and the task ends `interrupted`. A write error
// (disk full…) ends it `failed` and removes the `.part`. Cancelling removes both files.
//
// Reads and writes are synchronous: they block this thread only, and leave the libuv pool to the engine. Cancel is a
// flag in shared memory (ctrl[0] = 1), seen between blocks without a message round trip.
//
// Messages to the engine: {type:'inspected', i, result} · {type:'fingerprint', i, result} · {type:'thumb', ok}
//   · {type:'progress', done, total, resumedFrom} · {type:'done', size, mtimeMs, resumedFrom}
//   · {type:'interrupted', done, code, message} · {type:'failed', code, message} · {type:'cancelled'}

import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { movIndex, describeMovie } from './mov.js';
import { decodeFrame, codedError } from './hap.js';
import { blockImage, thumbnailImages, defaultThumbFrame } from './thumb.js';
import { encodePng } from './png.js';
import { fingerprintOf, FP_SPAN, thumbName } from './library.js';

export const BLOCK = 8 * 1024 * 1024;
const PROGRESS_MS = 200;

/**
 * How a source is read: the file itself. (The tests pass another opener — a drive that is pulled after N bytes, a slow
 * one — as a module URL; see MediaEngine's `sourceOpener`.)
 * @returns {{size:number, read:(buf:Buffer, off:number, len:number, pos:number) => number, close:() => void}}
 */
export function openFile(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const st = fs.fstatSync(fd);
    if (st.isDirectory()) throw Object.assign(new Error(`${file} is a folder`), { code: 'EISDIR' });
    return { size: st.size, read: (buf, off, len, pos) => fs.readSync(fd, buf, off, len, pos), close: () => fs.closeSync(fd) };
  } catch (e) { fs.closeSync(fd); throw e; }
}

/** Reads [pos, pos+len) fully (a read may return less than asked); returns the bytes read. */
function readFull(src, buf, len, pos) {
  let n = 0;
  while (n < len) { const k = src.read(buf, n, len - n, pos + n); if (!k) break; n += k; }
  return n;
}
const readAt = (src) => (off, len) => { const b = Buffer.allocUnsafe(Math.max(0, len)); return b.subarray(0, readFull(src, b, b.length, off)); };

function fingerprintSrc(src) {
  const span = Math.min(FP_SPAN, src.size), read = readAt(src);
  return fingerprintOf(read(0, span), read(src.size - span, span), src.size);
}

const errInfo = (e) => ({ code: e?.code || 'error', message: String(e?.message || e), codec: e?.codec ?? null, codecName: e?.codecName ?? null });

/** Both thumbnails of an indexed movie into <thumbs>/<fingerprint>-160.png and -480.png (written whole, then renamed). */
function writeThumbs(ix, read, fp, dir, frame = null) {
  const v = ix.video;
  const f = frame === null ? defaultThumbFrame(v) : Math.max(0, Math.min(v.count - 1, frame));
  const sample = read(v.offsets[f], v.sizes[f]);
  if (sample.length < v.sizes[f]) throw codedError('truncated', `the file ends inside frame ${f}`);
  const { wide, cell } = thumbnailImages(blockImage(decodeFrame(sample, v.fourcc, v.width, v.height)), v.width, v.height);
  fs.mkdirSync(dir, { recursive: true });
  for (const [img, w] of [[cell, 160], [wide, 480]]) {
    const out = path.join(dir, thumbName(fp, w, frame)), tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, encodePng(img.width, img.height, img.rgb, 3));
    fs.renameSync(tmp, out);
  }
}

/** What the import needs to know about one file: size, probe, fingerprint (+ thumbnails written when `thumbsDir`). */
export function inspect(file, open, thumbsDir) {
  let src;
  try { src = open(file); } catch (e) { return { error: errInfo(e) }; }
  try {
    const read = readAt(src);
    const ix = movIndex(read, src.size);
    const probe = describeMovie(ix, src.size);
    const fingerprint = fingerprintSrc(src);
    let thumb = false;
    if (thumbsDir) { try { writeThumbs(ix, read, fingerprint, thumbsDir); thumb = true; } catch { /* a frame that does not decode: no thumbnail, still a clip */ } }
    return { size: src.size, probe, fingerprint, thumb };
  } catch (e) { return { error: errInfo(e) }; } finally { try { src.close(); } catch { /* gone */ } }
}

function writeSidecar(file, data) { fs.writeFileSync(file, JSON.stringify(data)); }

/**
 * Copies `src` to `dst` through `dst.part` (see the top of this file).
 * @param {{src:string, dst:string, size:number, fingerprint:string, block?:number}} t
 * @param {{post:(m:object) => void, open:Function, cancelled:() => boolean}} io
 */
export function copy(t, io) {
  const block = t.block || BLOCK, part = `${t.dst}.part`, meta = `${part}.json`;
  fs.mkdirSync(path.dirname(t.dst), { recursive: true });
  let start = 0;
  try {
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (t.fingerprint && m.fingerprint === t.fingerprint && m.size === t.size) start = Math.min(t.size, Math.floor(fs.statSync(part).size / block) * block);
  } catch { /* nothing to resume */ }
  let src = null, out = null;
  const closeAll = () => { try { src?.close(); } catch { /* gone */ } try { if (out !== null) fs.closeSync(out); } catch { /* closed */ } out = null; };
  const removePart = () => { fs.rmSync(part, { force: true }); fs.rmSync(meta, { force: true }); };
  try {
    out = fs.openSync(part, start > 0 ? 'r+' : 'w');
    if (start > 0) fs.ftruncateSync(out, start);
    writeSidecar(meta, { fingerprint: t.fingerprint, size: t.size, src: t.src });
  } catch (e) { closeAll(); removePart(); io.post({ type: 'failed', ...errInfo(e) }); return; }
  const interrupted = (e, done) => { try { fs.fsyncSync(out); } catch { /* keep going */ } closeAll(); io.post({ type: 'interrupted', done, ...errInfo(e) }); };
  try { src = io.open(t.src); } catch (e) { interrupted(e, start); return; }
  if (src.size !== t.size) { closeAll(); removePart(); io.post({ type: 'failed', code: 'changed', message: 'the source file changed since it was checked' }); return; }

  const buf = Buffer.allocUnsafe(Math.min(block, Math.max(1, t.size)));
  let pos = start, last = 0;
  io.post({ type: 'progress', done: pos, total: t.size, resumedFrom: start });
  while (pos < t.size) {
    if (io.cancelled()) { closeAll(); removePart(); io.post({ type: 'cancelled' }); return; }
    const len = Math.min(block, t.size - pos);
    let n;
    try { n = readFull(src, buf, len, pos); } catch (e) { interrupted(e, pos); return; }
    if (n < len) { interrupted(Object.assign(new Error('the source ended early'), { code: 'EIO' }), pos); return; }
    try { let w = 0; while (w < n) w += fs.writeSync(out, buf, w, n - w, pos + w); } catch (e) { closeAll(); removePart(); io.post({ type: 'failed', ...errInfo(e) }); return; }
    pos += n;
    const now = performance.now();
    if (now - last >= PROGRESS_MS) { last = now; io.post({ type: 'progress', done: pos, total: t.size, resumedFrom: start }); }
  }
  try {
    fs.fsyncSync(out); closeAll();
    // the copy must be the source: same head, tail and size (catches a source that changed under a resumed copy)
    const chk = open(part);
    let fp; try { fp = fingerprintSrc(chk); } finally { chk.close(); }
    if (t.fingerprint && fp !== t.fingerprint) { removePart(); io.post({ type: 'failed', code: 'mismatch', message: 'the copy does not match the source' }); return; }
    fs.renameSync(part, t.dst);
    fs.rmSync(meta, { force: true });
    const st = fs.statSync(t.dst);
    io.post({ type: 'done', size: st.size, mtimeMs: Math.round(st.mtimeMs), resumedFrom: start });
  } catch (e) { closeAll(); io.post({ type: 'failed', ...errInfo(e) }); }
}
const open = (f) => openFile(f); // the copy itself is always read back from the real file

/**
 * Runs one task. `io.open` reads sources; `io.post` reports.
 * @param {{kind:'inspect'|'fingerprint'|'thumb'|'copy'}} task
 */
export function runTask(task, io) {
  switch (task.kind) {
    case 'inspect':
      task.files.forEach((f, i) => io.post({ type: 'inspected', i, result: inspect(f, io.open, task.thumbsDir) }));
      return;
    case 'fingerprint':
      task.files.forEach((f, i) => {
        let src;
        try { src = io.open(f); io.post({ type: 'fingerprint', i, result: { size: src.size, fingerprint: fingerprintSrc(src) } }); } catch (e) { io.post({ type: 'fingerprint', i, result: { error: errInfo(e) } }); } finally { try { src?.close(); } catch { /* gone */ } }
      });
      return;
    case 'thumb': {
      let src;
      try { src = io.open(task.file); const read = readAt(src); writeThumbs(movIndex(read, src.size), read, task.fingerprint, task.thumbsDir, task.frame ?? null); io.post({ type: 'thumb', ok: true }); } catch (e) { io.post({ type: 'thumb', ok: false, ...errInfo(e) }); } finally { try { src?.close(); } catch { /* gone */ } }
      return;
    }
    case 'copy': copy(task, io); return;
    default: throw new Error(`unknown task ${task.kind}`);
  }
}

if (!isMainThread && parentPort && workerData?.task) {
  const opener = workerData.opener ? (await import(workerData.opener)).open : openFile;
  const options = workerData.openerOptions || {};
  const ctrl = workerData.ctrl ? new Int32Array(workerData.ctrl) : null;
  const post = (m) => parentPort.postMessage(m);
  try { runTask(workerData.task, { post, open: (f) => opener(f, options), cancelled: () => !!ctrl && Atomics.load(ctrl, 0) === 1 }); } catch (e) { post({ type: 'failed', ...errInfo(e) }); }
}
