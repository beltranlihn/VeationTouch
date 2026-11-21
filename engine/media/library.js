// The media library (MEDIA-SERVER.md §4d): the folder where every clip of every show lives, outside the repo and the
// profile (`settings.mediaDir`, by default <data>/media), one sub-folder per show: <library>/<show-id>/<file>.mov.
// A clip always plays from here; importing COPIES into it (D7), unless the file is already inside.
//
// This module holds what both threads need: the fingerprint, the validation messages of §4d.3 (exact English text: the
// interface shows them as they are), free space, sizes for people, and the path rules.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { libraryPath } from './show.js';

/** Bytes of the head and of the tail that go into a fingerprint. */
export const FP_SPAN = 1024 * 1024;

/**
 * The fingerprint of a file: SHA-1 of its first 1 MB, its last 1 MB and its size (decimal). Reads 2 MB however large
 * the file is, so it works on a 20 GB clip still on a USB stick; a different file of the same name and size is told
 * apart by its content (the moov of a .mov sits at one end, the first frames at the other).
 * @param {Uint8Array} head bytes [0, min(1 MB, size)) @param {Uint8Array} tail bytes [max(0, size − 1 MB), size) @param {number} size
 */
export function fingerprintOf(head, tail, size) {
  return crypto.createHash('sha1').update(head).update(tail).update(String(size)).digest('hex');
}

/** The fingerprint of a file on disk (asynchronous reads; 2 MB). */
export async function fingerprintFile(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const span = Math.min(FP_SPAN, size);
    const head = Buffer.alloc(span), tail = Buffer.alloc(span);
    await fh.read(head, 0, span, 0);
    await fh.read(tail, 0, span, size - span);
    return { fingerprint: fingerprintOf(head, tail, size), size };
  } finally { await fh.close(); }
}

// ---------------------------------------------------------------------------------------------- messages (§4d.3)

const GB = 1024 ** 3, MB = 1024 ** 2;
/** A size as Windows Explorer writes it (binary units, one decimal): '21.4 GB', '3.0 MB', '12 KB'. */
export function formatBytes(b) {
  b = Math.max(0, b);
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`;
  return `${Math.ceil(b / 1024)} KB`;
}

/** The drive a folder is on, as the operator knows it: 'D:' on Windows, the share of a UNC path, '/' elsewhere. */
export function driveOf(dir) {
  const root = path.parse(path.resolve(dir)).root;
  return root.replace(/[\\/]+$/, '') || root;
}

/** The movie extension the library takes (HAP lives in QuickTime). */
export const isMovName = (name) => /\.mov$/i.test(name);

/**
 * The message for a file the import refuses (§4d.3), from the coded error of engine/media/probe.js. `name` is the
 * file name as dropped.
 */
export function rejectMessage(err, name) {
  const q = `"${name}"`;
  switch (err?.code) {
    case 'not-mov': return `${q} is not a HAP movie. VEATION Touch plays HAP (.mov) — export it as HAP or HAP Q.`;
    case 'not-hap':
      // codec null: not a QuickTime movie at all (Matroska renamed .mov…) or no video track
      if (!err.codec) return `${q} is not a HAP movie. VEATION Touch plays HAP (.mov) — export it as HAP or HAP Q.`;
      return `${q} is ${err.codecName || err.codec}, not HAP. Export it as HAP or HAP Q.`;
    case 'hapm': case 'not-supported':
      return `${err.codecName || 'This HAP variant'} is not supported yet. Use HAP, HAP Alpha or HAP Q.`;
    case 'no-moov': case 'truncated': case 'mov-bad':
      return `${q} is incomplete (no index). Copy it again from the source.`;
    case 'ENOENT': return `${q} was not found.`;
    case 'EISDIR': return `${q} is a folder. Drop the movie files themselves.`;
    case 'no-space': return `Not enough space: ${formatBytes(err.needed)} needed, ${formatBytes(err.free)} free on ${err.drive}.`;
    default: return `${q} could not be read (${err?.code || err?.message || 'unknown error'}).`;
  }
}

/** The warning for a clip accepted with audio that will not play (§4d.3). */
export const audioWarning = (name, codecName) => `The audio of "${name}" is ${codecName} and will not play. Export with PCM audio.`;
/** The warning for a clip whose size is not the room canvas (§4d.3). */
export const sizeWarning = (v, canvas) => `This clip is ${v.width}×${v.height}; the room canvas is ${canvas.width}×${canvas.height}. It will be stretched (change Fit).`;
/** A file whose fingerprint is already in the library: reused, not copied (§4d.3). */
export const ALREADY = 'Already in the library.';
/** The clip of a copy whose source went away (§4d.3 step 6). */
export const INTERRUPTED = 'Copy interrupted — plug the drive back in';

// ---------------------------------------------------------------------------------------------- disk

/** Free and total bytes of the drive that holds `dir` (or its nearest existing parent). */
export async function diskSpace(dir) {
  let d = path.resolve(dir);
  for (;;) {
    try { const s = await fs.promises.statfs(d); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch (e) {
      const up = path.dirname(d);
      if (up === d || e.code !== 'ENOENT') return { free: null, total: null };
      d = up;
    }
  }
}

/** The library path of `abs` if it lies inside the library folder `lib`, else null. */
export function insideLibrary(lib, abs) {
  const base = path.resolve(lib), p = path.resolve(abs);
  if (!(process.platform === 'win32' ? p.toLowerCase().startsWith(base.toLowerCase() + path.sep) : p.startsWith(base + path.sep))) return null;
  return libraryPath(path.relative(base, p));
}

/** The absolute path of a library path. */
export const absoluteIn = (lib, file) => path.join(path.resolve(lib), ...file.split('/'));

/** `name` in `dir`, or 'name (2).ext', 'name (3).ext'… if `taken(candidate)` says it is used. */
export function freeName(name, taken) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let c = name, k = 2;
  while (taken(c)) c = `${stem} (${k++})${ext}`;
  return c;
}

/** A file name the library can hold: the dropped name with the characters Windows refuses replaced. */
export function safeName(name) {
  const s = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 180);
  return s || 'clip.mov';
}

/**
 * Files under `dir` (up to `depth` folders down, at most `limit` entries looked at) whose name, ignoring case, is in
 * `names` (lower case). → Map(lower-case name → [absolute paths]). For "Locate…": the operator picks a folder.
 */
export async function findByName(dir, names, { depth = 8, limit = 200000 } = {}) {
  const out = new Map();
  let seen = 0;
  const walk = async (d, left) => {
    let list;
    try { list = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (++seen > limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (left > 0 && !e.name.startsWith('$')) await walk(p, left - 1); } // $RECYCLE.BIN, $Windows.~BT…
      else if (e.isFile() && names.has(e.name.toLowerCase())) { const k = e.name.toLowerCase(); if (!out.has(k)) out.set(k, []); out.get(k).push(p); }
    }
  };
  await walk(path.resolve(dir), depth);
  return out;
}

/** Thumbnail file names in <data>/thumbs (§4d.4): by fingerprint, so a file in two shows has one. */
export const thumbName = (fp, width, frame = null) => `${fp}${frame === null || frame === undefined ? '' : `-f${frame}`}-${width}.png`;
export const THUMB_WIDTHS = [160, 480];
