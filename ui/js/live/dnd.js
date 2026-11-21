// Live › drag and drop (MEDIA-SERVER.md §4d.3, §2b.3 7):
//   files from the explorer   onto a cell (several fill the following columns of its layer), onto a layer's head (its
//                             first free columns) or onto the library drawer (the show only, no cell) → media.import.
//                             The desktop window gives the page the files' paths (app/main-preload.cjs › vtDesktop); a
//                             browser has none, and says so. The refused files are listed ONCE, with the exact message
//                             of each (a small panel, not a popup per file); notes on accepted files go in the same list.
//   a clip within the grid    onto another cell: moved there (show.update with the revision); onto a clip: the two
//                             swap; Ctrl or Alt held: a copy (a new clip with the same settings).
//   a file of the library     onto a cell: a new clip of it in that cell (it takes its layer's settings, §2.2).
// Show mode: nothing is dragged and nothing is dropped; launching is untouched.

import { cmd } from '../conn.js';
import { h, toast } from '../dom.js';

const ALREADY = 'Already in the library.';

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const nextId = (list, prefix) => { const used = new Set(list.map((x) => x.id)); let k = 1; while (used.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };

/** Where a drop lands: {kind:'cell', layerId, column} | {kind:'layer', layerId} | {kind:'drawer'} | null. */
function targetOf(t) {
  const c = t.closest?.('.lv-cell');
  if (c && c.dataset.layer) return { kind: 'cell', el: c, layerId: c.dataset.layer, column: Number(c.dataset.col), clipId: c.dataset.clip || null };
  const lh = t.closest?.('.lv-lh');
  if (lh && lh.dataset.layer && lh.dataset.layer !== 'xlayer') return { kind: 'layer', el: lh, layerId: lh.dataset.layer };
  const d = t.closest?.('.lv-drawer');
  if (d) return { kind: 'drawer', el: d };
  return null;
}

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

/**
 * Imports files dropped from the explorer. `target`: a cell {layerId, column}, a layer {layerId} or null (the library).
 * The first drop of a room with no show makes one (the engine does). → the engine's answer, or null.
 */
export async function importFiles(L, files, target) {
  if (L.locked()) { toast('Show mode: unlock the room to import files.', 'bad'); return null; }
  const api = typeof window !== 'undefined' ? window.vtDesktop : null;
  if (!api) { toast('Import works in the desktop app.', 'warn'); return null; }
  const paths = api.pathsFor(files);
  if (!paths.length) { toast('Nothing to import: drop the files from the explorer.', 'warn'); return null; }
  const deckId = L.deck().id;
  const res = await L.run(cmd('media.import', { paths, target: target ? { deckId, layerId: target.layerId, ...(Number.isInteger(target.column) ? { column: target.column } : {}) } : null }));
  if (!res) return null;
  report(L, res);
  const first = res.accepted.find((a) => a.clipId);
  if (first && target) {
    const col = Object.entries(L.deck().cells).find(([, v]) => v === first.clipId)?.[0];
    if (col) L.select({ kind: 'cell', layerId: col.slice(0, col.lastIndexOf(':')), column: Number(col.slice(col.lastIndexOf(':') + 1)) });
  }
  return res;
}

/** The one list of what an import refused (and the notes on what it took). Nothing when all went in quietly. */
export function report(L, res) {
  const old = L.root?.querySelector('.lv-report');
  old?.remove();
  const notes = res.accepted.flatMap((a) => a.warnings.filter((w) => w !== ALREADY).map((w) => ({ name: a.name, message: w })));
  const reused = res.accepted.filter((a) => a.warnings.includes(ALREADY));
  if (!res.rejected.length && !notes.length) {
    if (res.accepted.length) toast(`${res.accepted.length} file${res.accepted.length === 1 ? '' : 's'} added${reused.length ? ` (${reused.length} already in the library)` : ''}${res.accepted.some((a) => a.copying) ? ' — copying into the library' : ''}`, 'ok');
    return null;
  }
  const n = res.rejected.length;
  const title = n ? `${n} file${n === 1 ? ' was' : 's were'} not imported` : 'Imported, with a note';
  const panel = h('div', { class: 'lv-report', role: 'status' },
    h('header', {}, h('b', {}, title), res.accepted.length ? h('span', { class: 'muted' }, ` · ${res.accepted.length} added`) : null, h('span', { class: 'grow' }),
      h('button', { class: 'ibtn small', title: 'Close', onclick: () => panel.remove() }, 'Close')),
    n ? h('ul', { class: 'lv-rejected' }, res.rejected.map((r) => h('li', {}, h('span', { class: 'msg' }, r.message)))) : null,
    notes.length ? h('ul', { class: 'lv-notes' }, notes.map((r) => h('li', {}, h('span', { class: 'msg' }, r.message)))) : null);
  (L.grid?.el || L.root)?.append(panel); // over the grid's bottom corner: never over the drawer or the inspector
  return panel;
}

export function createDnd(L, root) {
  let over = null;
  const mark = (t) => { if (over && over !== t?.el) over.classList.remove('dragover'); over = t?.el || null; over?.classList.add('dragover'); };

  root.addEventListener('dragstart', (e) => {
    if (L.locked()) { e.preventDefault(); return; }
    const c = e.target.closest?.('.lv-cell[data-clip]');
    const t = e.target.closest?.('.lv-tile[data-media]');
    if (c) L.drag = { kind: 'clip', layerId: c.dataset.layer, column: Number(c.dataset.col), clipId: c.dataset.clip };
    else if (t) L.drag = { kind: 'media', mediaId: t.dataset.media };
    else return;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', L.drag.clipId || L.drag.mediaId);
    (c || t).classList.add('dragging');
  });
  root.addEventListener('dragend', () => { L.drag = null; mark(null); for (const x of root.querySelectorAll('.dragging')) x.classList.remove('dragging'); });

  /** Can this drag land on that target? */
  const fits = (e, t) => {
    if (!t || L.locked()) return false;
    if (hasFiles(e)) return true;
    if (!L.drag || !L.show()) return false;
    if (t.kind !== 'cell') return false;
    if (L.drag.kind === 'clip') return !(t.layerId === L.drag.layerId && t.column === L.drag.column);
    return L.drag.kind === 'media';
  };

  root.addEventListener('dragover', (e) => {
    const t = targetOf(e.target);
    if (!fits(e, t)) { mark(null); if (hasFiles(e) || L.drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = hasFiles(e) || L.drag?.kind === 'media' || e.ctrlKey || e.altKey ? 'copy' : 'move';
    mark(t);
  });
  root.addEventListener('dragleave', (e) => { if (over && !over.contains(e.relatedTarget)) mark(null); });

  root.addEventListener('drop', (e) => {
    const t = targetOf(e.target);
    mark(null);
    e.preventDefault();
    if (hasFiles(e)) {
      if (L.locked()) { toast('Show mode: unlock the room to import files.', 'bad'); return; }
      if (!t) return;
      importFiles(L, e.dataTransfer.files, t.kind === 'drawer' ? null : t);
      return;
    }
    const d = L.drag, ok = fits(e, t);
    L.drag = null;
    if (!ok || !d) return;
    const deckId = L.deck().id, to = `${t.layerId}:${t.column}`;
    if (d.kind === 'media') {
      L.editShow((s) => {
        const m = s.media.find((x) => x.id === d.mediaId), deck = s.decks.find((x) => x.id === deckId);
        if (!m || !deck) return false;
        const c = newClip(s, m, t.layerId);
        s.clips.push(c); deck.cells[to] = c.id;
        return true;
      }, 'add clip').then((r) => { if (r) L.select({ kind: 'cell', layerId: t.layerId, column: t.column }); });
      return;
    }
    const copy = e.ctrlKey || e.altKey;
    L.editShow((s) => {
      const deck = s.decks.find((x) => x.id === deckId), from = `${d.layerId}:${d.column}`;
      if (!deck || deck.cells[from] !== d.clipId) return false;
      if (copy) {
        const src = s.clips.find((c) => c.id === d.clipId);
        if (!src) return false;
        const c = { ...structuredClone(src), id: nextId(s.clips, 'c') };
        s.clips.push(c); deck.cells[to] = c.id;
      } else {
        const there = deck.cells[to];
        deck.cells[to] = d.clipId;
        if (there) deck.cells[from] = there; else delete deck.cells[from];
      }
      return true;
    }, copy ? 'copy clip' : 'move clip').then((r) => { if (r) L.select({ kind: 'cell', layerId: t.layerId, column: t.column }); });
  });

  // files dropped anywhere else on the window open nothing (the window would try to show the file)
  // (a drop zone of its own — the Locate dialog's — has already taken the event: defaultPrevented)
  addEventListener('dragover', (e) => { if (hasFiles(e) && !e.defaultPrevented && !root.contains(e.target)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } });
  addEventListener('drop', (e) => { if (hasFiles(e) && !e.defaultPrevented && !root.contains(e.target)) e.preventDefault(); });
}
