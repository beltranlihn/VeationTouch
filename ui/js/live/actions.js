// Live › what is done to the selected clips (the cell menu, the keyboard and the inspector all come here): rename,
// replace the file, copy · cut · paste · duplicate, remove from the grid, remove the file. Every one is a show edit (one
// undo step) made with L.editShow, so the engine's revision rule and Show mode apply. Nothing here overwrites a clip:
// a paste or a copy goes to free cells and says how many it could not place.

import { cmd } from '../conn.js';
import { h, toast, confirmBox, promptBox } from '../dom.js';
import { cellKey, freeRun, planPaste } from './place.js';
import { CLIP_COLORS } from './media-info.js';

const nextId = (list, prefix) => { const used = new Set(list.map((x) => x.id)); let k = 1; while (used.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };
const same = (a, b) => a.layerId === b.layerId && a.column === b.column;

/** The cells to act on: the selection when `cell` is in it (or none is given), else just that cell. */
const targets = (L, cell) => {
  const sel = L.cellsSelected();
  return !cell || sel.some((c) => same(c, cell)) ? sel : [cell];
};

export async function rename(L, cell) {
  const clip = L.clipAt(L.deck(), cell.layerId, cell.column);
  if (!clip || L.locked()) return;
  const name = await promptBox('Name of the clip', clip.name, 'Rename');
  if (name?.trim()) L.editShow((s) => { const c = s.clips.find((x) => x.id === clip.id); if (!c) return false; c.name = name.trim().slice(0, 80); return true; }, 'rename clip');
}

/** Arms the browser: the next file double-clicked there replaces this clip's file (the clip keeps its settings). */
export function replaceFile(L, cell) {
  if (L.locked()) return;
  L.replace = { layerId: cell.layerId, column: cell.column, deckId: L.deck().id };
  if (L.main.classList.contains('nobrowser')) L.browser.toggle();
  L.browser.render(true);
  L.patch();
  toast('Double-click the new file in the browser (Show or Disk).', 'ok');
}

/** Copies the selected clips (their settings travel with them; the files stay where they are). */
export function copy(L) {
  const sel = L.cellsSelected();
  if (!sel.length) return false;
  const deck = L.deck();
  const items = sel.map((c) => ({ layerId: c.layerId, column: c.column, clip: structuredClone(L.clip(deck.cells[cellKey(c.layerId, c.column)])) })).filter((i) => i.clip);
  if (!items.length) return false;
  L.clipboard = { items };
  toast(`${items.length} clip${items.length === 1 ? '' : 's'} copied. Select a free cell and paste (Ctrl+V).`, 'ok');
  return true;
}

export function cut(L) {
  if (L.locked() || !copy(L)) return;
  removeFromGrid(L, null, true);
}

/** Pastes the clipboard keeping its layout, the first cell on `anchor` (default: the selected cell). Taken cells are skipped. */
export function paste(L, anchor = null) {
  if (L.locked() || !L.clipboard) return;
  const a = anchor || (L.sel?.kind === 'cell' ? { layerId: L.sel.layerId, column: L.sel.column } : null);
  if (!a) { toast('Select the cell to paste at.', 'warn'); return; }
  const items = L.clipboard.items, deckId = L.deck().id;
  let placed = [], refused = [];
  L.editShow((s) => {
    const deck = s.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    const usable = items.filter((i) => s.media.some((m) => m.id === i.clip.mediaId));
    const plan = planPaste(s, deck, usable, a);
    placed = []; refused = plan.refused.concat(items.filter((i) => !usable.includes(i)));
    for (const { from, to } of plan.out) {
      const c = { ...structuredClone(from.clip), id: nextId(s.clips, 'c') };
      s.clips.push(c); deck.cells[cellKey(to.layerId, to.column)] = c.id; placed.push(to);
    }
    return placed.length > 0;
  }, 'paste clips').then((r) => {
    if (refused.length) toast(`${refused.length} clip${refused.length === 1 ? '' : 's'} not pasted: ${placed.length ? 'the cell is taken or off the grid' : 'no free cell there'}.`, 'warn');
    if (r && placed.length) { L.select({ kind: 'cell', layerId: placed[0].layerId, column: placed[0].column }); if (placed.length > 1) L.setMulti(placed); }
  });
}

/** Ctrl+D: a copy of each selected clip in the next free cell to its right, in the same layer. */
export function duplicate(L) {
  const sel = L.cellsSelected();
  if (L.locked() || !sel.length) return;
  const deckId = L.deck().id;
  let placed = [], short = 0;
  L.editShow((s) => {
    const deck = s.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    placed = []; short = 0;
    for (const c of sel) {
      const src = s.clips.find((x) => x.id === deck.cells[cellKey(c.layerId, c.column)]);
      const free = src ? freeRun(deck, c.layerId, c.column + 1, 1).slots[0] : null;
      if (!free) { short++; continue; }
      const copy2 = { ...structuredClone(src), id: nextId(s.clips, 'c') };
      s.clips.push(copy2); deck.cells[cellKey(free.layerId, free.column)] = copy2.id; placed.push(free);
    }
    return placed.length > 0;
  }, 'duplicate clips').then((r) => {
    if (short) toast(`${short} clip${short === 1 ? '' : 's'} not duplicated: no free cell to the right.`, 'warn');
    if (r && placed.length) { L.select({ kind: 'cell', layerId: placed[0].layerId, column: placed[0].column }); if (placed.length > 1) L.setMulti(placed); }
  });
}

/** Takes the selected clips out of their cells (the files stay in the show); a clip nothing uses any more goes too. */
export function removeFromGrid(L, cell = null, quiet = false) {
  if (L.locked()) return;
  const list = targets(L, cell), deckId = L.deck().id;
  if (!list.length) return;
  L.editShow((s) => {
    const deck = s.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    const gone = [];
    for (const c of list) { const id = deck.cells[cellKey(c.layerId, c.column)]; if (id) { gone.push(id); delete deck.cells[cellKey(c.layerId, c.column)]; } }
    for (const id of gone) {
      const used = s.decks.some((x) => Object.values(x.cells).includes(id)) || s.presets.some((p) => Object.values(p.media || {}).flat().includes(id));
      if (!used) s.clips = s.clips.filter((c) => c.id !== id);
    }
    return gone.length > 0;
  }, quiet ? 'cut clips' : 'remove clips').then(() => { L.select(null); });
}

/** Takes a file and its clips out of the show (the file stays in the library folder). */
export async function removeFile(L, clip) {
  const m = L.mediaOf(clip);
  if (!m || L.locked()) return;
  const name = m.file.split('/').pop();
  const n = L.view().clips.filter((c) => c.mediaId === m.id).length;
  if (!await confirmBox(`Take "${name}" out of the show${n ? `, with its ${n} clip${n === 1 ? '' : 's'}` : ''}? The file stays in the library folder.`, 'Remove', true)) return;
  L.select(null);
  L.run(cmd('media.remove', { mediaId: m.id }), `"${name}" removed from the show`);
}

/** Ctrl+A: every clip of the deck in view. */
export function selectAll(L) {
  const deck = L.deck(), list = [];
  for (const layer of L.view().layers) for (let c = 0; c < deck.columns; c++) if (L.clipAt(deck, layer.id, c)) list.push({ layerId: layer.id, column: c });
  if (!list.length) return;
  L.select({ kind: 'cell', layerId: list[0].layerId, column: list[0].column });
  L.setMulti(list);
}

// ------------------------------------------------------------------ colours, column names, the cover frame

/** Colours the selected clips (or only `cell`): color is a '#rrggbb' of CLIP_COLORS, or null for none. One undo step. */
export function setColor(L, color, cell = null) {
  if (L.locked()) return;
  const list = targets(L, cell), deckId = L.deck().id;
  if (!list.length) return;
  L.editShow((s) => {
    const deck = s.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    let any = false;
    for (const c of list) { const clip = s.clips.find((x) => x.id === deck.cells[cellKey(c.layerId, c.column)]); if (clip && clip.color !== color) { clip.color = color; any = true; } }
    return any;
  }, color ? 'clip colour' : 'clip colour off');
}

/** A row of swatches (none + the palette): `current` is lit; a click calls onPick(color | null). */
export function colorRow(current, onPick, disabled = false) {
  const sw = (color, name) => h('button', { class: `lv-sw${(current || null) === color ? ' on' : ''}${color ? '' : ' none'}`, 'data-color': color || '', title: name, 'aria-label': name, 'aria-pressed': String((current || null) === color),
    disabled: disabled || undefined, style: color ? { background: color } : {}, onclick: () => onPick(color) });
  return h('div', { class: 'lv-swatches', role: 'group', 'aria-label': 'Clip colour' }, sw(null, 'No colour'), CLIP_COLORS.map(([c, n]) => sw(c, n)));
}

/** Names a column of the deck in view ("Intro", "Drop"); an empty name clears it. */
export async function renameColumn(L, deck, column) {
  if (L.locked() || !L.show()) return;
  const cur = deck.colNames?.[String(column)] || '';
  const name = await promptBox(`Name of column ${column + 1}`, cur, 'Rename');
  if (name !== null && name !== undefined) setColumnName(L, deck.id, column, name.trim().slice(0, 40));
}
export function setColumnName(L, deckId, column, name) {
  return L.editShow((s) => {
    const d = s.decks.find((x) => x.id === deckId);
    if (!d) return false;
    d.colNames = { ...(d.colNames || {}) };
    if (name) d.colNames[String(column)] = name; else delete d.colNames[String(column)];
    if (!Object.keys(d.colNames).length) delete d.colNames;
    return true;
  }, name ? 'name column' : 'clear column name');
}

/** The picture of a movie (cell, browser, panel): this frame of it (null = the default, at 10 %). */
export function setCover(L, mediaId, frame) {
  if (L.locked()) return null;
  return L.run(cmd('media.cover', { mediaId, frame }), frame === null ? 'Cover frame reset.' : 'Cover frame set.');
}
