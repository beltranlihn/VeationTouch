// Live › where dropped things go (docs/research/resolume-ux.md §C.3). Pure functions over a show — no DOM, no engine —
// so the rules can be checked on their own (tests/live-ui.test.mjs) and the drag shows EXACTLY what a drop will do.
//   The rule above all: a drop never overwrites a cell that has a clip. Files take the free cells; the occupied ones are
//   skipped (and shown struck through while dragging); what does not fit is said, never silently dropped.
//   A cell is "layerId:column" in deck.cells; show.layers is bottom → top (the grid draws the top layer first).

export const cellKey = (layerId, column) => `${layerId}:${column}`;
export const splitKey = (k) => ({ layerId: k.slice(0, k.lastIndexOf(':')), column: Number(k.slice(k.lastIndexOf(':') + 1)) });

const layerName = (show, id) => show.layers.find((l) => l.id === id)?.name || id;

/**
 * `n` free cells in a layer from `from` going right; the occupied ones are skipped, the deck's end stops it.
 * → { slots: [{layerId, column}], skipped: [{layerId, column}] (occupied cells inside the span), unplaced }
 */
export function freeRun(deck, layerId, from, n) {
  const slots = [], skipped = [];
  for (let c = Math.max(0, from); c < deck.columns && slots.length < n; c++) {
    if (deck.cells[cellKey(layerId, c)]) skipped.push({ layerId, column: c });
    else slots.push({ layerId, column: c });
  }
  return { slots, skipped, unplaced: n - slots.length };
}

/**
 * What dropping `n` things on a target does.
 *   {kind:'cell', layerId, column}   the free cells of that layer from there on
 *   {kind:'layer', layerId}          the first free cells of that layer
 *   {kind:'column', column}          one per layer in that column, from the top layer down (occupied layers are skipped)
 *   {kind:'deck'}                    the first free cells of the first layer of `deck` (the one given)
 *   {kind:'newdeck'}                 a deck that does not exist yet: `deck` is a blank one; the first layer, one per column
 * → { slots, skipped, unplaced, label }
 */
export function planDrop(show, deck, target, n) {
  if (target.kind === 'column') {
    const slots = [], skipped = [];
    for (const layer of [...show.layers].reverse()) {
      if (deck.cells[cellKey(layer.id, target.column)]) skipped.push({ layerId: layer.id, column: target.column });
      else if (slots.length < n) slots.push({ layerId: layer.id, column: target.column });
    }
    return { slots, skipped, unplaced: n - slots.length, label: `column ${target.column + 1}` };
  }
  if (target.kind === 'layer') return { ...freeRun(deck, target.layerId, 0, n), label: layerName(show, target.layerId) };
  if (target.kind === 'deck' || target.kind === 'newdeck') {
    const first = show.layers[0]?.id;
    return { ...freeRun(deck, first, 0, n), label: `${layerName(show, first)} of ${target.kind === 'deck' ? deck.name : 'a new deck'}` };
  }
  return { ...freeRun(deck, target.layerId, target.column, n), label: layerName(show, target.layerId) };
}

/** "3 files → Layer 2 · columns 3–5 (column 4 is taken: skipped)" — what a drag says while it is over a target. */
export function describePlan(plan, n, noun = 'file') {
  const things = `${n} ${noun}${n === 1 ? '' : 's'}`;
  if (!plan.slots.length) return `${things}: no free cell here`;
  const isCol = plan.label.startsWith('column');
  const cols = plan.slots.map((s) => s.column + 1);
  const where = isCol ? `${plan.label} · ${plan.slots.length === 1 ? '1 layer' : `${plan.slots.length} layers`}`
    : `${plan.label} · ${cols.length === 1 ? `column ${cols[0]}` : `columns ${cols[0]}–${cols[cols.length - 1]}`}`;
  const extra = [
    plan.skipped.length ? `${plan.skipped.length === 1 && !isCol ? `column ${plan.skipped[0].column + 1} is taken` : `${plan.skipped.length} taken`}: skipped` : null,
    plan.unplaced > 0 ? `${plan.unplaced} without room` : null,
  ].filter(Boolean);
  return `${things} → ${where}${extra.length ? ` (${extra.join('; ')})` : ''}`;
}

/**
 * Shifting a layer's cells right to make room for `n` at `column` (a drop between two cells).
 * → { ok, moves: [[fromColumn, toColumn]…] (right to left, so they can be applied in order) } — not ok when the last
 * cells would fall off the deck.
 */
export function planInsert(deck, layerId, column, n) {
  const used = [];
  for (let c = column; c < deck.columns; c++) if (deck.cells[cellKey(layerId, c)]) used.push(c);
  if (used.length && used[used.length - 1] + n >= deck.columns) return { ok: false, moves: [] };
  if (!used.length && column + n > deck.columns) return { ok: false, moves: [] };
  return { ok: true, moves: used.reverse().map((c) => [c, c + n]) };
}

/** Applies planInsert's moves to a deck (mutates). */
export function applyInsert(deck, layerId, moves) {
  for (const [a, b] of moves) { deck.cells[cellKey(layerId, b)] = deck.cells[cellKey(layerId, a)]; delete deck.cells[cellKey(layerId, a)]; }
}

/**
 * Gives a clip another file and keeps everything else it was set to. In and Out stay where they were unless the new
 * file is shorter. (Mutates the clip.) → {notes: ['…']} (what the operator should know).
 */
export function replaceFile(clip, oldMedia, media) {
  const notes = [], dur = media.video?.duration;
  const base = (m) => (m?.file || '').split('/').pop().replace(/\.[^.]+$/, '');
  const wasNamed = !oldMedia || clip.name === base(oldMedia);
  clip.mediaId = media.id;
  if (wasNamed) clip.name = base(media).slice(0, 80) || clip.name;
  if (Number.isFinite(dur) && dur > 0) {
    if (clip.in >= dur) { clip.in = 0; clip.out = null; notes.push('The new file is shorter than the clip\'s In point: In and Out were reset.'); }
    else if (clip.out !== null && clip.out > dur) { clip.out = null; notes.push('The new file is shorter than the clip\'s Out point: Out now follows its end.'); }
  }
  return { notes };
}

/**
 * Cells for pasting a copied set: each keeps its place relative to the others, anchored at `anchor` ({layerId, column});
 * `items` = [{layerId, column}]. A target that is off the deck or taken is left out and counted.
 * → { out: [{from, to}], refused: [item] }
 */
export function planPaste(show, deck, items, anchor) {
  const order = show.layers.map((l) => l.id);
  const minL = Math.min(...items.map((i) => order.indexOf(i.layerId))), minC = Math.min(...items.map((i) => i.column));
  const aL = order.indexOf(anchor.layerId);
  const out = [], refused = [];
  for (const it of items) {
    const li = aL + (order.indexOf(it.layerId) - minL), col = anchor.column + (it.column - minC);
    if (li < 0 || li >= order.length || col < 0 || col >= deck.columns || deck.cells[cellKey(order[li], col)]) { refused.push(it); continue; }
    out.push({ from: it, to: { layerId: order[li], column: col } });
  }
  return { out, refused };
}
