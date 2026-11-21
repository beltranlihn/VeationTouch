// Live › drag and drop (MEDIA-SERVER.md §4d.3; docs/research/resolume-ux.md §C.3). The rule above all: a drop never
// overwrites a cell that has a clip, and while it is dragged the grid shows exactly what it will do (ui/js/live/place.js).
//   sources   files from the explorer (the desktop window gives the paths: app/main-preload.cjs › vtDesktop; a browser has
//             none) · files or folders of the browser's Disk view · files of the show (the browser's Show view) · a clip
//             of the grid
//   targets   a cell · the gap before a clip (insert, the rest of the layer moves right) · a column head (one per layer,
//             top layer down) · a layer head (its first free cells) · a deck tab (the first free cells of its first layer)
//             · the "+" of the decks (a new deck, named after the folder) · the browser (the show's files, no cell)
//   files     on a free cell: they fill the free cells from there; the taken ones are skipped, what has no room is said
//             on a clip: ONE file replaces that clip's file and keeps its settings (Ctrl: a new clip instead)
//   clips     moved; onto a clip: swapped; Ctrl or Alt: copied (onto a free cell — a copy never takes a taken one)
// The refused files are listed ONCE, with the exact message of each (a small panel, not a popup per file).
// Show mode: nothing is dragged and nothing is dropped; launching is untouched.

import { cmd, store } from '../conn.js';
import { h, toast } from '../dom.js';
import { messageOf, rejectConvert } from './media-info.js';
import { convertDialog } from './convert.js';
import { cellKey, planDrop, describePlan, planInsert, applyInsert, replaceFile, freeRun } from './place.js';

const ALREADY = 'Already in the library.';
const INSERT_PX = 12; // the left edge of a clip: dropping there puts the thing BEFORE it

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const nextId = (list, prefix) => { const used = new Set(list.map((x) => x.id)); let k = 1; while (used.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A new clip of a library file, for a layer: the layer's settings, except a clip with audio on a looping layer plays
 * once. (No layer — a card's slot, inspector.js: the experience says how it plays.)
 */
export function newClip(show, media, layerId) {
  const layer = show.layers.find((l) => l.id === layerId);
  const audible = !!media.audio?.supported;
  return {
    id: nextId(show.clips, 'c'), mediaId: media.id, name: media.file.split('/').pop().replace(/\.[^.]+$/, '') || 'Clip', color: null,
    end: audible && (!layer || layer.end === 'loop') ? 'clear' : 'layer',
    loops: 1, in: 0, out: null, trigger: 'layer', transitionMs: null,
    place: { target: 'canvas', wallId: null, fit: 'stretch' }, audio: { gainDb: 0, route: null },
  };
}

/** "A conversion to HAP would fix it": the engine's hint (convert: true) as a way to System › Converter, where FFmpeg lives. */
function convertTag(L, r) {
  if (!rejectConvert(r) && !r.convert) return null;
  if (L.conv?.supported === false) return null;
  // a refused file the engine can convert carries its path: the dialog (it needs FFmpeg: it says so, with the way to System › Converter)
  if (r.path) return h('span', { class: 'lv-convhint' }, ' ', h('button', { class: 'btn small lv-convbtn', onclick: () => convertDialog(L, { path: r.path, name: r.name }) }, 'Convert to HAP…'));
  return null;
}

/** The one list of what an import refused (and the notes on what it took). Nothing when all went in quietly. */
export function report(L, res, extra = []) {
  const old = L.root?.querySelector('.lv-report');
  old?.remove();
  // (a warning is a string, or {message, convert}: the engine's words either way)
  const wtext = (w) => (typeof w === 'string' ? w : messageOf(w));
  const notes = res.accepted.flatMap((a) => (a.warnings || []).filter((w) => wtext(w) !== ALREADY).map((w) => ({ name: a.name, message: wtext(w), convert: typeof w === 'object' && rejectConvert(w) }))).concat(extra.map((message) => ({ message })));
  const reused = res.accepted.filter((a) => (a.warnings || []).some((w) => wtext(w) === ALREADY));
  if (!res.rejected.length && !notes.length) {
    if (res.accepted.length) toast(`${res.accepted.length} file${res.accepted.length === 1 ? '' : 's'} added${reused.length ? ` (${reused.length} already in the library)` : ''}${res.accepted.some((a) => a.copying) ? ' — copying into the library' : ''}`, 'ok');
    return null;
  }
  const n = res.rejected.length;
  const title = n ? `${n} file${n === 1 ? ' was' : 's were'} not imported` : 'Done, with a note';
  const panel = h('div', { class: 'lv-report', role: 'status' },
    h('header', {}, h('b', {}, title), res.accepted.length ? h('span', { class: 'muted' }, ` · ${res.accepted.length} added`) : null, h('span', { class: 'grow' }),
      h('button', { class: 'ibtn small', title: 'Close', onclick: () => panel.remove() }, 'Close')),
    n ? h('ul', { class: 'lv-rejected' }, res.rejected.map((r) => h('li', {}, h('span', { class: 'msg' }, messageOf(r)), convertTag(L, r)))) : null,
    notes.length ? h('ul', { class: 'lv-notes' }, notes.map((r) => h('li', {}, h('span', { class: 'msg' }, r.message), convertTag(L, r)))) : null);
  (L.grid?.el || L.root)?.append(panel); // over the grid's bottom corner: never over the browser or the inspector
  return panel;
}

/** Waits (a moment) for the show the engine confirmed to have these files: the state message may trail the answer. */
async function untilMedia(ids) {
  for (let k = 0; k < 80; k++) {
    const s = store.state?.show;
    if (s && ids.every((id) => s.media.some((m) => m.id === id))) return true;
    await sleep(25);
  }
  return false;
}

/** Disk paths → the files to import (a folder is the files in it) and the folder's name. */
async function expand(L, paths) {
  const r = await L.run(cmd('media.fsExpand', { paths }));
  return r || { files: paths, folder: null };
}

/**
 * Imports files into the show WITHOUT putting them in a cell (the placement is Live's: place.js). → the engine's
 * answer {accepted:[{mediaId…}], rejected} or null.
 */
export async function importPaths(L, paths) {
  if (L.locked()) { toast('Show mode: unlock the room to import files.', 'bad'); return null; }
  const res = await L.run(cmd('media.import', { paths, target: null }));
  if (!res) return null;
  if (res.accepted.length) await untilMedia(res.accepted.map((a) => a.mediaId));
  return res;
}

/**
 * Puts media of the show where a drop says (see the head of this file). `tgt`: {kind:'cell'|'layer'|'column'|'deck'|
 * 'newdeck'|'insert', layerId?, column?, deckId?, name?}. `o.copy`: a new clip even on a taken cell.
 * → {placed: [{layerId, column}], unplaced, replaced, deckId} or null.
 */
export async function placeMedia(L, mediaIds, tgt, o = {}) {
  const deckId0 = tgt.deckId || L.deck().id;
  const out = { placed: [], unplaced: 0, replaced: false, deckId: deckId0, blocked: false, notes: [] };
  const r = await L.editShow((s) => {
    out.placed = []; out.unplaced = 0; out.replaced = false; out.notes = []; out.blocked = false;
    const media = mediaIds.map((id) => s.media.find((m) => m.id === id)).filter(Boolean);
    if (!media.length) return false;
    let deck;
    if (tgt.kind === 'newdeck') {
      if (s.decks.length >= 32) { out.blocked = 'A show has at most 32 decks.'; return false; }
      deck = { id: nextId(s.decks, 'D'), name: String(tgt.name || `Deck ${s.decks.length + 1}`).slice(0, 40), columns: Math.min(256, Math.max(8, media.length)), cells: {} };
      s.decks.push(deck);
      out.deckId = deck.id;
    } else deck = s.decks.find((d) => d.id === deckId0);
    if (!deck) return false;
    if (tgt.kind === 'cell' && media.length === 1 && !o.copy) {
      const clip = s.clips.find((c) => c.id === deck.cells[cellKey(tgt.layerId, tgt.column)]);
      if (clip) {
        out.notes = replaceFile(clip, s.media.find((m) => m.id === clip.mediaId), media[0]).notes;
        out.placed = [{ layerId: tgt.layerId, column: tgt.column }]; out.replaced = true;
        return true;
      }
    }
    let slots;
    if (tgt.kind === 'insert') {
      const pl = planInsert(deck, tgt.layerId, tgt.column, media.length);
      if (!pl.ok) { out.blocked = 'There is no room to insert here: the layer would run past the last column.'; return false; }
      applyInsert(deck, tgt.layerId, pl.moves);
      slots = media.map((_, i) => ({ layerId: tgt.layerId, column: tgt.column + i }));
    } else {
      const plan = planDrop(s, deck, tgt.kind === 'newdeck' ? { kind: 'deck' } : tgt, media.length);
      slots = plan.slots; out.unplaced = plan.unplaced;
    }
    if (!slots.length) { out.blocked = 'No free cell there: nothing was placed (the files are in the library).'; return false; }
    slots.forEach((sl, i) => { const c = newClip(s, media[i], sl.layerId); s.clips.push(c); deck.cells[cellKey(sl.layerId, sl.column)] = c.id; out.placed.push(sl); });
    return true;
  }, tgt.kind === 'newdeck' ? 'new deck' : out.replaced ? 'replace file' : 'add clips');
  if (out.blocked) toast(out.blocked, 'warn');
  if (!r) return null;
  if (out.unplaced > 0) toast(`${out.unplaced} file${out.unplaced === 1 ? ' has' : 's have'} no free cell: ${out.unplaced === 1 ? 'it is' : 'they are'} in the library, not in the grid.`, 'warn');
  if (out.notes.length) toast(out.notes.join(' '), 'warn');
  if (out.replaced) toast('File replaced: the clip keeps its settings.', 'ok');
  if (tgt.kind === 'newdeck' && out.deckId) L.setDeck(out.deckId);
  const first = out.placed[0];
  if (first) { L.select({ kind: 'cell', layerId: first.layerId, column: first.column }); if (out.placed.length > 1) L.setMulti(out.placed); }
  return out;
}

/** Files (paths from the explorer or the Disk view) dropped on a target: import, then place what was accepted. */
export async function dropPaths(L, paths, tgt, o = {}) {
  const { files, folder } = await expand(L, paths);
  if (!files.length) { toast('That folder has no files in it.', 'warn'); return null; }
  const res = await importPaths(L, files);
  if (!res) return null;
  const t = tgt.kind === 'newdeck' && folder ? { ...tgt, name: folder.name } : tgt;
  const ids = res.accepted.map((a) => a.mediaId);
  const placed = t.kind === 'browser' || !ids.length ? null : await placeMedia(L, ids, t, o);
  report(L, res, placed?.unplaced ? [`${placed.unplaced} without a free cell: in the library, not in the grid.`] : []);
  return { res, placed };
}

export function createDnd(L, root) {
  let marked = [], tagKey = '';
  const tag = h('div', { class: 'lv-droptag', hidden: true });
  document.body.append(tag);

  const clearMarks = () => {
    for (const el of marked) el.classList.remove('dragover', 'range', 'skip', 'ins', 'nofit', 'lay-above', 'lay-below');
    marked = []; tag.hidden = true; tagKey = '';
  };
  const mark = (el, cls) => { if (el) { el.classList.add(cls); marked.push(el); } };
  const cellEl = (layerId, column) => root.querySelector(`.lv-cell[data-layer="${layerId}"][data-col="${column}"]`);

  /** What a drop at this event would land on: {kind, el, …} or null. */
  function targetOf(e) {
    const t = e.target;
    if (L.drag?.kind === 'layer') { // a layer by its grip: any row says where it goes (above or below that one)
      const row = t.closest?.('.lv-row[data-layer]');
      if (!row || row.dataset.layer === 'xlayer') return null;
      const r = row.getBoundingClientRect();
      return { kind: 'layerrow', el: row.querySelector('.lv-lh'), layerId: row.dataset.layer, above: e.clientY < r.top + r.height / 2 };
    }
    const c = t.closest?.('.lv-cell');
    if (c && c.dataset.layer) {
      const layerId = c.dataset.layer, column = Number(c.dataset.col), taken = !!c.dataset.clip;
      if (taken && e.clientX - c.getBoundingClientRect().left < INSERT_PX) return { kind: 'insert', el: c, layerId, column };
      return { kind: 'cell', el: c, layerId, column, clipId: c.dataset.clip || null };
    }
    const col = t.closest?.('.lv-col');
    if (col) return { kind: 'column', el: col, column: Number(col.dataset.col) };
    const lh = t.closest?.('.lv-lh');
    if (lh && lh.dataset.layer && lh.dataset.layer !== 'xlayer') return { kind: 'layer', el: lh, layerId: lh.dataset.layer };
    const dt = t.closest?.('.lv-decks button[data-deck]');
    if (dt) return { kind: 'deck', el: dt, deckId: dt.dataset.deck };
    const add = t.closest?.('.lv-adddeck');
    if (add) return { kind: 'newdeck', el: add };
    const b = t.closest?.('.lv-browser, .lv-bottom');
    if (b) return { kind: 'browser', el: b };
    return null;
  }

  /** How many things the drag carries (a drag from the explorer tells only how many items). */
  const countOf = (e) => (L.drag ? (L.drag.mediaIds?.length || L.drag.paths?.length || 1) : e.dataTransfer?.items?.length || 1);

  /** Can this drag land on that target? */
  const fits = (e, t) => {
    if (!t || L.locked()) return false;
    if (hasFiles(e)) return true;
    const d = L.drag;
    if (!d) return false;
    if (d.kind === 'layer') return t.kind === 'layerrow' && t.layerId !== d.layerId && L.show() && L.view().layers.length > 1;
    if (d.kind === 'clip') {
      if (!L.show()) return false;
      if (t.kind !== 'cell' && t.kind !== 'insert') return false;
      return !(t.kind === 'cell' && t.layerId === d.layerId && t.column === d.column);
    }
    if (t.kind === 'browser') return false; // (files from the explorer only: they are already in the browser's own list)
    return d.kind === 'media' || d.kind === 'files';
  };

  /** The plan a drag has at a target, for the marks and the words. null when it is not a placement. */
  function planFor(e, t) {
    const view = L.view(), n = countOf(e), copy = e.ctrlKey || e.altKey;
    const deck = t.kind === 'deck' ? view.decks.find((d) => d.id === t.deckId) : t.kind === 'newdeck' ? { id: null, name: '', columns: Math.min(256, Math.max(8, n)), cells: {} } : L.deck();
    if (!deck) return null;
    const noun = L.drag?.kind === 'clip' ? 'clip' : 'file';
    if (t.kind === 'layerrow') {
      const name = (id) => view.layers.find((l) => l.id === id)?.name || id;
      return { slots: [], skipped: [], unplaced: 0, text: `Move ${name(L.drag.layerId)} ${t.above ? 'above' : 'below'} ${name(t.layerId)}`, single: true };
    }
    if (t.kind === 'insert') {
      const pl = planInsert(deck, t.layerId, t.column, n);
      return { insert: true, ok: pl.ok, slots: pl.ok ? Array.from({ length: n }, (_, i) => ({ layerId: t.layerId, column: t.column + i })) : [], skipped: [], unplaced: 0,
        text: pl.ok ? `${n} ${noun}${n === 1 ? '' : 's'} → insert before column ${t.column + 1} of ${view.layers.find((l) => l.id === t.layerId)?.name}` : 'No room to insert: the layer would run past the last column' };
    }
    if (t.kind === 'cell') {
      const taken = !!deck.cells[cellKey(t.layerId, t.column)];
      if (L.drag?.kind === 'clip' && !copy) return { slots: [], skipped: [], unplaced: 0, text: taken ? 'The two clips swap places' : 'Move the clip here', single: true };
      if (taken && n === 1 && !copy) return { slots: [], skipped: [], unplaced: 0, text: 'Replace this clip\'s file (it keeps its settings) — Ctrl: a new clip next to it', single: true };
      if (L.drag?.kind === 'clip') {
        const plan = freeRun(deck, t.layerId, t.column, 1);
        return { ...plan, text: plan.slots.length ? `Copy the clip → column ${plan.slots[0].column + 1}` : 'No free cell to the right for a copy' };
      }
    }
    const plan = planDrop(view, deck, t.kind === 'cell' ? t : t.kind === 'newdeck' ? { kind: 'newdeck' } : t, n);
    return { ...plan, text: describePlan(plan, n, noun) + (t.kind === 'newdeck' ? ' (a new deck, named after the folder)' : '') };
  }

  root.addEventListener('dragstart', (e) => {
    if (L.locked()) { e.preventDefault(); return; }
    const grip = e.target.closest?.('.lv-grip');
    if (grip) { // a layer, by its grip
      L.drag = { kind: 'layer', layerId: grip.dataset.layer };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', grip.dataset.layer);
      try { const head = grip.closest('.lv-lh'); e.dataTransfer.setDragImage(head, 20, 14); } catch { /* no custom ghost */ }
      grip.closest('.lv-lh')?.classList.add('dragging');
      return;
    }
    const c = e.target.closest?.('.lv-cell[data-clip]');
    const t = e.target.closest?.('.lv-tile[data-media]');
    const f = e.target.closest?.('.lv-file[data-path], .lv-folder[data-path]');
    if (c) L.drag = { kind: 'clip', layerId: c.dataset.layer, column: Number(c.dataset.col), clipId: c.dataset.clip };
    else if (t) {
      const ids = L.browser?.dragMedia(t.dataset.media) || [t.dataset.media];
      L.drag = { kind: 'media', mediaId: ids[0], mediaIds: ids };
    } else if (f) L.drag = { kind: 'files', paths: L.browser?.dragPaths(f.dataset.path) || [f.dataset.path] };
    else return;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', L.drag.clipId || L.drag.mediaId || L.drag.paths[0]);
    // the pointer carries the picture of what is dragged (§C.3: a ghost), at 70 %
    const img = (c || t || f).querySelector('img:not(.gone)');
    if (img?.complete && img.naturalWidth) { try { e.dataTransfer.setDragImage(img, 24, 14); } catch { /* no custom ghost */ } }
    (c || t || f).classList.add('dragging');
  });
  root.addEventListener('dragend', () => { L.drag = null; clearMarks(); for (const x of root.querySelectorAll('.dragging')) x.classList.remove('dragging'); });

  root.addEventListener('dragover', (e) => {
    const t = targetOf(e);
    if (!fits(e, t)) {
      clearMarks();
      if (hasFiles(e) || L.drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }
      return;
    }
    e.preventDefault();
    const plan = t.kind === 'browser' ? null : planFor(e, t);
    e.dataTransfer.dropEffect = L.drag?.kind === 'layer' ? 'move' : hasFiles(e) || L.drag?.kind !== 'clip' || e.ctrlKey || e.altKey ? 'copy' : 'move';
    // the marks change only when the plan does (a dragover fires every few ms)
    const key = `${t.kind}|${t.layerId}|${t.column}|${t.deckId}|${t.above}|${plan?.text}|${(plan?.slots || []).length}|${e.ctrlKey || e.altKey}`;
    if (key !== tagKey) {
      clearMarks(); tagKey = key;
      if (t.kind === 'layerrow') mark(t.el, t.above ? 'lay-above' : 'lay-below'); else mark(t.el, 'dragover');
      if (t.kind === 'insert') mark(t.el, plan?.ok ? 'ins' : 'nofit');
      for (const sl of plan?.slots || []) if (!(t.kind === 'insert')) mark(cellEl(sl.layerId, sl.column), 'range');
      for (const sl of plan?.skipped || []) mark(cellEl(sl.layerId, sl.column), 'skip');
      if (plan?.text) tag.textContent = plan.text;
    }
    if (plan?.text) {
      tag.hidden = false;
      Object.assign(tag.style, { left: `${Math.min(innerWidth - tag.offsetWidth - 8, e.clientX + 16)}px`, top: `${Math.min(innerHeight - 40, e.clientY + 18)}px` });
    }
  });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) clearMarks(); });

  root.addEventListener('drop', (e) => {
    const t = targetOf(e);
    const ok = fits(e, t), copy = e.ctrlKey || e.altKey;
    clearMarks();
    e.preventDefault();
    if (hasFiles(e)) {
      if (L.locked()) { toast('Show mode: unlock the room to import files.', 'bad'); return; }
      if (!t) return;
      const api = window.vtDesktop;
      if (!api) { toast('Import works in the desktop app.', 'warn'); return; }
      const paths = api.pathsFor(e.dataTransfer.files);
      if (!paths.length) { toast('Nothing to import: drop the files from the explorer.', 'warn'); return; }
      dropPaths(L, paths, t, { copy });
      return;
    }
    const d = L.drag;
    L.drag = null;
    if (!ok || !d) return;
    if (d.kind === 'layer') { moveLayer(d, t); return; }
    if (d.kind === 'files') { dropPaths(L, d.paths, t, { copy }); return; }
    if (d.kind === 'media') { placeMedia(L, d.mediaIds || [d.mediaId], t, { copy }); return; }
    moveClip(d, t, copy);
  });

  /** A layer dragged by its grip onto another's row: it goes above or below it (show.layers is bottom → top: above = after). */
  function moveLayer(d, t) {
    L.editShow((s) => {
      const before = s.layers.map((l) => l.id).join();
      const i = s.layers.findIndex((l) => l.id === d.layerId);
      if (i < 0 || !s.layers.some((l) => l.id === t.layerId)) return false;
      const [lay] = s.layers.splice(i, 1);
      const j = s.layers.findIndex((l) => l.id === t.layerId);
      s.layers.splice(t.above ? j + 1 : j, 0, lay);
      return s.layers.map((l) => l.id).join() !== before;
    }, 'move layer').then((r) => { if (r) L.select({ kind: 'layer', layerId: d.layerId }); });
  }

  /** A clip of the grid dropped on a cell (move / swap / copy) or in the gap before one (insert). */
  function moveClip(d, t, copy) {
    const deckId = L.deck().id, to = cellKey(t.layerId, t.column), from = cellKey(d.layerId, d.column);
    let landed = null, blocked = null;
    L.editShow((s) => {
      const deck = s.decks.find((x) => x.id === deckId);
      if (!deck || deck.cells[from] !== d.clipId) return false;
      landed = { layerId: t.layerId, column: t.column };
      const src = s.clips.find((c) => c.id === d.clipId);
      if (t.kind === 'insert') {
        const clipId = copy ? null : deck.cells[from];
        if (!copy) delete deck.cells[from];
        const pl = planInsert(deck, t.layerId, t.column, 1);
        if (!pl.ok) { blocked = 'There is no room to insert here: the layer would run past the last column.'; return false; }
        applyInsert(deck, t.layerId, pl.moves);
        if (copy) { const c = { ...structuredClone(src), id: nextId(s.clips, 'c') }; s.clips.push(c); deck.cells[to] = c.id; } else deck.cells[to] = clipId;
        return true;
      }
      if (copy) {
        const free = freeRun(deck, t.layerId, t.column, 1).slots[0];
        if (!src || !free) { blocked = 'No free cell to the right for a copy.'; return false; }
        const c = { ...structuredClone(src), id: nextId(s.clips, 'c') };
        s.clips.push(c); deck.cells[cellKey(free.layerId, free.column)] = c.id;
        landed = free;
      } else {
        const there = deck.cells[to];
        deck.cells[to] = d.clipId;
        if (there) deck.cells[from] = there; else delete deck.cells[from];
      }
      return true;
    }, t.kind === 'insert' ? 'insert clip' : copy ? 'copy clip' : 'move clip').then((r) => {
      if (blocked) toast(blocked, 'warn');
      if (r && landed) L.select({ kind: 'cell', layerId: landed.layerId, column: landed.column });
    });
  }

  // files dropped anywhere else on the window open nothing (the window would try to show the file)
  // (a drop zone of its own — the Locate dialog's — has already taken the event: defaultPrevented)
  addEventListener('dragover', (e) => { if (hasFiles(e) && !e.defaultPrevented && !root.contains(e.target)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } });
  addEventListener('drop', (e) => { if (hasFiles(e) && !e.defaultPrevented && !root.contains(e.target)) e.preventDefault(); });
}
