// Live › "Convert to HAP" (a native video — H.264, H.265, VP9 — becomes a HAP movie the room plays with no decoder to
// spare). The engine does the work with FFmpeg, a separate executable the client installs (System › Converter, which is
// not built here); this file is only the UI on its operations:
//   media.convert {mediaId | path, codec: 'hap' | 'hapq' | 'hapa', fps?}   starts a job (a medium of the show, or a file this
//                      computer refused: the engine marks those with convert: true and their path); its progress is a job in
//                      state.media.import (kind 'convert': waiting | converting | done | failed), as the copies are
//   media.convertCancel {jobId}                                      stops it (and dismisses a failed one)
//   media.ffmpeg.status                                              is FFmpeg installed — only the files Chromium cannot read need it
// Until the engine has these operations the UI must not break: the first call that comes back "unknown command" hides
// every Convert action (L.conv.supported = false); nothing else here is reached.

import { cmd } from '../conn.js';
import { h, toast, modal } from '../dom.js';
import { isNativeVideo } from './media-info.js';

export const CODECS = [['hap', 'HAP', 'Fast and small: the usual choice'], ['hapq', 'HAP Q', 'Better colour, bigger files'], ['hapa', 'HAP Alpha', 'Keeps transparency']];
const FPS = [['', 'Keep'], ['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60']];
const DONE = new Set(['done', 'failed', 'cancelled', 'interrupted']);
const unknownOp = (e) => /unknown (command|op)/i.test(e?.message || '');

/** The page's knowledge of the converter: supported null = not asked yet, false = this engine has no such operations. */
export function convState(L) { return (L.conv ||= { supported: null, ffmpeg: null, asked: false }); }

/** Asks the engine once whether it can convert (and whether FFmpeg is there). Safe to call again; never throws. */
export async function probe(L, force = false) {
  const c = convState(L);
  if (c.asked && !force) return c;
  c.asked = true;
  try {
    const r = await cmd('media.ffmpeg.status');
    c.supported = true;
    c.ffmpeg = r ? { ...r, installed: !!(r.installed ?? r.available ?? r.found ?? r.ok) } : null;
  } catch (e) {
    if (unknownOp(e)) c.supported = false;
    else if (/not connected/i.test(e.message)) c.asked = false; // try again when the connection is up
    else c.supported = true; // the operation exists; it failed for its own reason
  }
  L.ctx?.rerender?.(); L.grid?.render?.(true); L.browser?.render?.(true);
  return c;
}

/** Every conversion the engine reports, whichever list it keeps them in. */
export function jobsOf(L) {
  const M = L.media();
  return [...(M.import || []).filter((j) => j.kind === 'convert'), ...(M.convert || [])];
}
export const isActive = (j) => !DONE.has(j.state);
const waiting = (j) => j.state === 'queued' || j.state === 'waiting';
/** The conversion running (or waiting) for this medium, or null. */
export const jobFor = (L, mediaId) => jobsOf(L).find((j) => j.mediaId === mediaId && isActive(j)) || null;
/** 0–100 from whatever the job reports (done / total, or a fraction, or a percentage). */
export function pctOf(j) {
  if (j.total) return Math.max(0, Math.min(100, Math.floor((j.done / j.total) * 100)));
  const p = j.pct ?? j.progress ?? j.percent;
  if (typeof p === 'number') return Math.max(0, Math.min(100, Math.floor(p <= 1 ? p * 100 : p)));
  return 0;
}

/** Is the Convert action offered for this medium (a native video, an engine that can, the show not locked)? */
export function canConvert(L, m) {
  return !!m && isNativeVideo(m) && L.conv?.supported !== false && !!L.show() && !L.locked();
}

/** The bottom bar's line: {kind, text, frac, job} while conversions run (or the last one failed). */
export function summary(L) {
  const list = jobsOf(L), active = list.filter(isActive);
  if (!active.length) {
    const failed = list.filter((j) => j.state === 'failed');
    return failed.length ? { kind: 'failed', frac: 0, text: `Conversion of "${failed[0].name || 'a file'}" failed${failed[0].error ? `: ${failed[0].error}` : ''}`, job: failed[0] } : { kind: null, frac: 0, text: '', job: null };
  }
  const cur = active.find((j) => !waiting(j)) || active[0], pct = pctOf(cur), n = active.length;
  return { kind: 'converting', frac: pct / 100, job: cur, text: `Converting ${n > 1 ? `1 of ${n} · ` : ''}"${cur.name || 'a file'}" to HAP — ${waiting(cur) ? 'waiting' : `${pct} %`}` };
}

export function cancel(L, job) {
  if (job) L.run(cmd('media.convertCancel', { jobId: job.id }));
}

/**
 * The dialog: format (and frame rate), then start. `m` is a medium of the show, or {path, name}: a file this computer
 * refused (the engine marks those convert: true) — those need FFmpeg, and when it is missing the dialog says so and points to
 * System › Converter (that card is not here, only the way to it). A medium the app decodes itself (H.264) does not.
 */
export async function convertDialog(L, m) {
  if (!m || L.locked()) return;
  const c = await probe(L);
  if (c.supported === false) { toast('This version of the engine cannot convert yet.', 'warn'); return; }
  const byPath = !m.id && !!m.path;
  const missing = byPath && !!c.ffmpeg && c.ffmpeg.installed === false;
  let codec = 'hap', fps = '';
  const name = byPath ? m.name || m.path.split(/[\\/]/).pop() : m.file.split('/').pop();
  const seg = h('div', { class: 'seg lv-convcodec', role: 'group', 'aria-label': 'HAP format' });
  const paint = () => seg.replaceChildren(...CODECS.map(([k, t, tip]) => h('button', { class: k === codec ? 'on' : '', 'aria-pressed': String(k === codec), 'data-codec': k, title: tip, onclick: () => { codec = k; paint(); } }, t)));
  paint();
  const fpsSel = h('select', { class: 'lv-convfps', 'aria-label': 'Frame rate' }, FPS.map(([v, t]) => h('option', { value: v }, t)));
  fpsSel.addEventListener('change', () => { fps = fpsSel.value; });
  let close = () => {};
  const go = h('button', { class: 'btn primary', disabled: missing || undefined, onclick: async () => {
    const r = await cmd('media.convert', { ...(byPath ? { path: m.path } : { mediaId: m.id }), codec, ...(fps ? { fps: Number(fps) } : {}) }).catch((e) => e);
    if (r instanceof Error) {
      if (unknownOp(r)) { convState(L).supported = false; close(); L.ctx?.rerender?.(); L.grid?.render?.(true); L.browser?.render?.(true); return; }
      toast(r.message, 'bad');
      return;
    }
    close();
    toast(`Converting "${name}" — the original file stays in the library.`, 'ok');
  } }, 'Convert');
  close = modal('Convert to HAP', h('div', { class: 'lv-convert' },
    h('p', { style: { marginTop: 0 } }, h('b', {}, name), ' becomes a HAP movie that the room plays smoothly on any computer. The original file is kept.'),
    missing ? h('div', { class: 'callout attn', 'data-ffmpeg': 'missing' }, 'FFmpeg is not installed on this computer, and this kind of file needs it. Install it from System › Converter.',
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => { close(); L.ctx?.go?.('system'); } }, 'Open System'))) : null,
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Format'), seg),
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Frame rate'), fpsSel),
    h('div', { class: 'actions' }, go, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'))));
}

/** A conversion's own progress box (inspector): the bar, the share, Cancel. null when none runs for this medium. */
export function convertBox(L, mediaId) {
  const j = jobFor(L, mediaId);
  if (!j) return null;
  const pct = pctOf(j);
  return h('div', { class: 'callout lv-istatus lv-convbox', 'data-job': j.id },
    h('b', {}, waiting(j) ? 'Waiting to be converted to HAP' : `Converting to HAP — ${pct} %`),
    h('div', { class: 'lv-cbar wide' }, h('i', { style: { width: `${pct}%` } })),
    L.locked() ? null : h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => cancel(L, j) }, 'Cancel')));
}

/** The Problems entries about conversion: a movie the import warned about (with a way to fix it), a conversion that failed. */
export function convertProblems(L, notesOf, convertHint) {
  const items = [];
  if (!L.show() || L.conv?.supported === false) return items;
  const inGrid = (id) => L.show().clips.some((c) => c.mediaId === id); // (an original that nothing uses any more has been converted)
  for (const m of L.show().media) {
    if (!isNativeVideo(m) || !(m.notes || []).length || jobFor(L, m.id) || !inGrid(m.id)) continue;
    const name = m.file.split('/').pop(), first = notesOf(m)[0];
    if (!first) continue;
    items.push(['warn', `${name}: ${first.text}`, h('button', { class: 'btn small', disabled: L.locked() || undefined, onclick: () => convertDialog(L, m) }, 'Convert to HAP…'), convertHint(m) ? 'Converting it to HAP fixes this.' : undefined]);
  }
  for (const p of (L.media().problems || []).filter((x) => x.kind === 'convert')) items.push(['warn', p.text, h('button', { class: 'btn small', onclick: () => L.run(cmd('media.convertCancel', { jobId: p.jobId })) }, 'Dismiss')]);
  return items;
}
