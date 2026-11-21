// Live › the clip grid (MEDIA-SERVER.md §4b.3, §2b): rows = layers that cover each other (the top row is on top),
// columns = moments of the show; decks keep the grid small however big the library is.
//   cell          picture = launch (clip.trigger), name = select (the inspector); a status dot — grey copying, cyan
//                 ready, amber problem (the reason on hover); the live cell has a cyan border and its play indicator:
//                 a ring for loops (Ableton), a bar + the time left for clips that end. Computed here from the engine's
//                 clock and the play the engine sent; the engine is never asked where a clip is.
//   column head   launches the column (column.trigger); the last column launched is cyan
//   layer head    layers.js: X, name, M, B, opacity and volume
//   bar           deck tabs (+ to add one), Eject all, the show's name with its menu (New, Open, Rename, Duplicate,
//                 Export, Import; Rename / Delete deck)
// Show mode: cells still launch; editing and dragging are off, and the bar says so quietly.

import { store, cmd } from '../conn.js';
import { h, toast, confirmBox, promptBox, modal } from '../dom.js';
import { playhead, passLength } from '/shared/transport.js';
import { layerHead, xlayerHead, headKey } from './layers.js';

const LH_W = 168;               // the layer head column (px)
const ADD_W = 28;               // the "+" column at the end of the header row
const GAP = 4;
const CW_MIN = 92, CW_MAX = 176;
const MAX_LAYERS = 8, MAX_COLUMNS = 256;
const LOOPING = new Set(['loop', 'bounce']);
const AUTOPILOT = new Set(['next', 'prev', 'random', 'first']);

/** m:ss (h:mm:ss past an hour), never negative. */
export function clockText(s) {
  s = Math.max(0, Math.ceil(s - 1e-6));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

/** Was this play launched from this cell? (A play by clip id alone counts for the first cell of that clip in its row.) */
function fromCell(p, clipId, deck, layerId, col) {
  if (!p || p.clipId !== clipId) return false;
  if (p.deckId) return p.deckId === deck.id && p.column === col;
  let first = null;
  for (let c = 0; c < deck.columns && first === null; c++) if (deck.cells[`${layerId}:${c}`] === clipId) first = c;
  return first === col;
}

/**
 * Where a play is for its indicator: ring (loops) or bar + time left (clips that end), from the engine's time `now`.
 * → { kind: 'ring'|'bar', frac, left: seconds|null }
 */
export function progressOf(p, now, held = false) {
  const len = passLength(p);
  if (LOOPING.has(p.end)) {
    const ph = playhead(p, now ?? p.startAt);
    return { kind: 'ring', frac: Math.max(0, Math.min(1, (ph.time - p.in) / len)), left: null };
  }
  const total = AUTOPILOT.has(p.end) ? len * (p.loops || 1) : len;
  const el = now == null ? 0 : Math.max(0, Math.min(total, (now - p.startAt) / 1000 + (p.offset || 0)));
  return { kind: 'bar', frac: held ? 1 : el / total, left: held ? 0 : total - el };
}

export function createGrid(L) {
  const el = h('div', { class: 'lv-grid' });
  let key = '', rows = null;

  // ---------------------------------------------------------------- building

  function cell(deck, layer, col) {
    const clip = L.clipAt(deck, layer.id, col);
    const base = { 'data-layer': layer.id, 'data-col': String(col) };
    if (!clip) {
      return h('div', { class: 'lv-cell empty', ...base, title: L.locked() ? '' : 'Drop HAP files here', onclick: () => L.select({ kind: 'cell', layerId: layer.id, column: col }) });
    }
    const m = L.mediaOf(clip);
    const img = h('img', { src: L.thumbUrl(m, 160), alt: '', draggable: 'false', loading: 'lazy', onerror: (e) => e.target.classList.add('gone') });
    const ring = h('span', { class: 'lv-ring', html: '<svg viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="0 100"/></svg>' });
    return h('div', { class: 'lv-cell', ...base, 'data-clip': clip.id, 'data-media': m?.id || '', draggable: L.locked() ? 'false' : 'true' },
      h('button', { class: 'lv-thumb', title: `Launch "${clip.name}"`, 'aria-label': `Launch ${clip.name}`, onclick: () => trigger(deck, layer.id, col) },
        img, ring,
        h('span', { class: 'lv-bar' }, h('i')),
        h('span', { class: 'lv-copy' }, h('i'), h('em', { class: 'tnum' })),
        h('span', { class: 'lv-flag' }),
        h('span', { class: 'lv-left tnum' })), // the time left, on the picture (read from afar; the name keeps its room)
      h('button', { class: 'lv-name', title: `${clip.name} — select`, onclick: () => L.select({ kind: 'cell', layerId: layer.id, column: col }) },
        h('span', { class: 'dot' }), h('span', { class: 't' }, clip.name)));
  }

  function trigger(deck, layerId, column) {
    if (!L.show()) return;
    L.run(cmd('clip.trigger', { deckId: deck.id, layerId, column }));
  }

  function bar(show, deck) {
    const locked = L.locked();
    const decks = h('div', { class: 'well lv-decks', role: 'tablist', 'aria-label': 'Decks' },
      L.view().decks.map((d) => h('button', {
        class: d.id === deck.id ? 'on' : '', role: 'tab', 'aria-selected': String(d.id === deck.id), 'data-deck': d.id, title: show && !locked ? 'Double-click to rename' : d.name,
        onclick: () => L.setDeck(d.id), ondblclick: () => renameDeck(d),
      }, d.name)));
    return h('div', { class: 'lv-gbar' },
      decks,
      h('button', { class: 'ibtn lv-adddeck', title: 'Add a deck', disabled: !show || locked || L.view().decks.length >= 32 || undefined, onclick: addDeck }, '+'),
      h('div', { class: 'grow' }),
      locked ? h('span', { class: 'lv-locknote', title: 'Show mode locks the show against edits; launching works as always' }, 'Show mode · launching only') : null,
      h('button', { class: 'btn small', title: 'Eject every layer (with each layer\'s transition)', disabled: !show || undefined, onclick: () => L.run(cmd('media.clearAll')) }, 'Eject all'),
      h('button', { class: 'btn small lv-showbtn', title: 'The show: what the grid, the decks and the cards belong to', onclick: (e) => showMenu(e.currentTarget) },
        h('span', { class: 'lbl' }, 'Show'), h('span', { class: 't' }, show ? show.name : 'None yet'), h('span', { class: 'caret' }, '▾')));
  }

  function render(force = false) {
    const show = L.show(), deck = L.deck(), V = L.view();
    const k = JSON.stringify([show?.id ?? null, show?.rev ?? null, deck.id, L.locked(), V.decks.map((d) => d.name)]);
    if (!force && k === key) return;
    key = k;
    const sc = rows?.parentElement;
    const scroll = sc ? [sc.scrollLeft, sc.scrollTop] : [0, 0];
    const locked = L.locked();
    const layers = [...V.layers].reverse(); // the top row is the top layer
    const head = h('div', { class: 'lv-row lv-head' },
      h('div', { class: 'lv-corner' },
        h('button', { class: 'ibtn small', title: 'Add a layer on top', disabled: !show || locked || V.layers.length >= MAX_LAYERS || undefined, onclick: addLayer }, '+ Layer')),
      Array.from({ length: deck.columns }, (_, c) => h('button', { class: 'lv-col', 'data-col': String(c), title: `Launch column ${c + 1}`, disabled: !show || undefined, onclick: () => L.run(cmd('column.trigger', { deckId: deck.id, column: c })) },
        h('span', { class: 'n tnum' }, String(c + 1)), h('span', { class: 'go' }, '▶'))),
      h('button', { class: 'lv-addcol', title: 'Add a column', disabled: !show || locked || deck.columns >= MAX_COLUMNS || undefined, onclick: addColumn }, '+'));
    rows = h('div', { class: 'lv-rows' },
      head,
      layers.map((layer) => h('div', { class: 'lv-row', 'data-layer': layer.id },
        layerHead(L, layer),
        Array.from({ length: deck.columns }, (_, c) => cell(deck, layer, c)),
        h('span'))),
      h('div', { class: 'lv-row lv-xrow', 'data-layer': 'xlayer' }, xlayerHead(L), h('div', { class: 'lv-xcell' })));
    const scroller = h('div', { class: 'lv-scroll' }, rows);
    const report = el.querySelector('.lv-report'); // what an import refused stays until it is closed
    el.replaceChildren(...[bar(show, deck), show ? null : h('div', { class: 'lv-empty' },
      h('b', {}, 'No show yet.'), ' Drop HAP files from the explorer onto a cell to start one — they are copied into the library.'), scroller, report].filter(Boolean));
    el.classList.toggle('locked', locked);
    resize();
    scroller.scrollLeft = scroll[0]; scroller.scrollTop = scroll[1];
  }

  /** Cell width from the room there is: up to eight columns fill the width; more scroll. */
  function resize() {
    if (!rows) return;
    const n = Math.max(1, Math.min(8, L.deck().columns));
    const avail = el.clientWidth - 24 - LH_W - ADD_W - GAP * (n + 1) - 10; // (the scroller's padding, a scroll bar)
    const cw = Math.max(CW_MIN, Math.min(CW_MAX, Math.floor(avail / n)));
    rows.style.setProperty('--cw', `${cw}px`);
    rows.style.setProperty('--n', String(L.deck().columns));
    rows.style.setProperty('--lhw', `${LH_W}px`);
  }

  // ---------------------------------------------------------------- what plays (no rebuild)

  function patch() {
    if (!rows) return;
    const deck = L.deck(), M = L.media(), now = L.now();
    for (const c of rows.querySelectorAll('.lv-cell')) {
      const layerId = c.dataset.layer, col = Number(c.dataset.col), clipId = c.dataset.clip;
      c.classList.toggle('sel', !!L.sel && L.isSel('cell', layerId, col));
      if (!clipId) continue;
      const e = L.entry(layerId);
      const live = !!e?.play && fromCell(e.play, clipId, deck, layerId, col);
      const fading = !live && !!e?.from && fromCell(e.from, clipId, deck, layerId, col) && (now == null || e.fadeAt == null || now < e.fadeAt + (e.transitionMs || 0));
      c.classList.toggle('live', live);
      c.classList.toggle('out', fading);
      c.classList.toggle('held', live && e.state === 'held');
      const ind = live ? (LOOPING.has(e.play.end) ? 'ring' : 'bar') : '';
      c.classList.toggle('ind-ring', ind === 'ring');
      c.classList.toggle('ind-bar', ind === 'bar');
      const st = L.status(c.dataset.media);
      for (const k of ['copying', 'ready', 'missing', 'problem']) c.classList.toggle(`st-${k}`, st.kind === k);
      const dot = c.querySelector('.lv-name .dot');
      dot.className = `dot${st.kind === 'ready' ? ' live' : st.kind === 'copying' ? '' : ' warn'}`;
      dot.title = st.text;
      c.querySelector('.lv-name').title = `${c.querySelector('.lv-name .t').textContent} — ${st.text}. Click to select.`;
      const flag = c.querySelector('.lv-flag');
      flag.textContent = st.kind === 'missing' ? 'Missing' : st.kind === 'problem' ? 'Copy stopped' : '';
      const copy = c.querySelector('.lv-copy');
      if (st.kind === 'copying') { copy.querySelector('i').style.width = `${st.pct}%`; copy.querySelector('em').textContent = st.job.state === 'queued' ? 'Waiting' : `Copying ${st.pct} %`; }
      if (!live) { c.querySelector('.lv-left').textContent = ''; }
    }
    for (const b of rows.querySelectorAll('.lv-col')) b.classList.toggle('live', !!M.column && M.column.deckId === deck.id && M.column.index === Number(b.dataset.col));
    for (const r of rows.querySelectorAll('.lv-row[data-layer]')) {
      const id = r.dataset.layer, e = L.entry(id);
      r.classList.toggle('on-air', !!e?.play);
      const head = r.querySelector('.lv-lh');
      head.classList.toggle('sel', !!L.sel && (id === 'xlayer' ? L.sel.kind === 'xlayer' : L.isSel('layer', id)));
      if (id === 'xlayer') continue;
      // another device moved a fader (or the engine took the mix back): this head is built again — never under a drag
      const layer = L.layer(id);
      if (layer && head.dataset.key !== headKey(L, layer) && !head.querySelector('.vfield.drag') && !head.contains(document.activeElement)) {
        const fresh = layerHead(L, layer);
        fresh.classList.toggle('sel', head.classList.contains('sel'));
        head.replaceWith(fresh);
      }
    }
    xcell();
  }

  /** The experience's row: what it launched, with its indicator. */
  function xcell() {
    const box = rows.querySelector('.lv-xcell'), e = L.media().xlayer;
    const clip = e?.play ? L.clip(e.play.clipId) : null;
    const k = clip ? `${e.play.playId}` : 'none';
    if (box.dataset.key === k) return;
    box.dataset.key = k;
    if (!clip) { box.replaceChildren(h('span', { class: 'muted' }, 'Nothing launched by the experience')); box.classList.remove('live'); return; }
    const m = L.mediaOf(clip);
    box.classList.add('live');
    box.replaceChildren(
      h('img', { src: L.thumbUrl(m, 160), alt: '', draggable: 'false', onerror: (ev) => ev.target.classList.add('gone') }),
      h('span', { class: 't' }, clip.name),
      h('span', { class: 'lv-bar' }, h('i')),
      h('span', { class: 'lv-left tnum' }));
  }

  function paint(now) {
    if (!rows) return;
    for (const c of rows.querySelectorAll('.lv-cell.live')) {
      const e = L.entry(c.dataset.layer);
      if (!e?.play) continue;
      const pr = progressOf(e.play, now, e.state === 'held');
      if (pr.kind === 'ring') c.querySelector('.lv-ring .fg').setAttribute('stroke-dasharray', `${(pr.frac * 100).toFixed(1)} 100`);
      else c.querySelector('.lv-bar i').style.width = `${(pr.frac * 100).toFixed(2)}%`;
      c.querySelector('.lv-left').textContent = pr.kind === 'bar' ? (e.state === 'held' ? 'Hold' : `−${clockText(pr.left)}`) : '';
    }
    const x = rows.querySelector('.lv-xcell.live'), e = L.media().xlayer;
    if (x && e?.play) {
      const pr = progressOf(e.play, now, e.state === 'held');
      x.querySelector('.lv-bar i').style.width = `${(pr.frac * 100).toFixed(2)}%`;
      x.querySelector('.lv-left').textContent = pr.kind === 'bar' ? `−${clockText(pr.left)}` : '';
    }
  }

  // ---------------------------------------------------------------- editing the grid

  const nextId = (list, prefix) => { const used = new Set(list.map((x) => x.id)); let k = 1; while (used.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };

  function addLayer() {
    L.editShow((s) => {
      if (s.layers.length >= MAX_LAYERS) return false;
      s.layers.push({ id: nextId(s.layers, 'L'), name: `Layer ${s.layers.length + 1}` });
      return true;
    }, 'add layer');
  }
  function addColumn() {
    const id = L.deck().id;
    L.editShow((s) => { const d = s.decks.find((x) => x.id === id); if (!d || d.columns >= MAX_COLUMNS) return false; d.columns++; return true; }, 'add column');
  }
  async function addDeck() {
    let id = null;
    await L.editShow((s) => { id = nextId(s.decks, 'D'); s.decks.push({ id, name: `Deck ${s.decks.length + 1}`, columns: 8, cells: {} }); }, 'add deck');
    if (id && L.view().decks.some((d) => d.id === id)) L.setDeck(id);
  }
  async function renameDeck(d) {
    if (!L.show() || L.locked()) return;
    const name = await promptBox('Name of the deck', d.name, 'Rename');
    if (name) L.editShow((s) => { const x = s.decks.find((q) => q.id === d.id); if (x) x.name = name; }, 'rename deck');
  }
  async function deleteDeck(d) {
    const n = Object.keys(d.cells).length;
    if (!await confirmBox(`Delete the deck "${d.name}"${n ? ` and its ${n} cell${n === 1 ? '' : 's'}` : ''}? The files stay in the library. Ctrl+Z brings it back.`, 'Delete', true)) return;
    L.editShow((s) => { if (s.decks.length < 2) return false; s.decks = s.decks.filter((x) => x.id !== d.id); return true; }, 'delete deck');
  }

  // ---------------------------------------------------------------- the show's menu

  function showMenu(anchor) {
    const show = L.show(), locked = L.locked(), desk = !!store.state?.local;
    const item = (label, fn, o = {}) => h('button', { class: o.danger ? 'danger' : '', disabled: o.off || undefined, title: o.title || '', onclick: () => { close(); fn(); } }, label);
    const menu = h('div', { class: 'lv-menu', role: 'menu' },
      locked ? h('div', { class: 'lv-menu-note' }, 'Show mode: unlock the room to change shows.') : null,
      item('New show…', newShow, { off: locked }),
      item('Open…', openShow, { off: locked }),
      item('Rename…', renameShow, { off: locked || !show }),
      item('Duplicate…', duplicateShow, { off: locked || !show }),
      h('div', { class: 'sep' }),
      item('Export to a folder…', exportShow, { off: locked || !show || !desk, title: desk ? 'A folder with show.json and its media, to take to another computer' : 'On the computer of the room' }),
      item('Import from a folder…', importShow, { off: locked || !desk, title: desk ? 'A folder exported from another computer' : 'On the computer of the room' }),
      h('div', { class: 'sep' }),
      item('Rename deck…', () => renameDeck(L.deck()), { off: locked || !show }),
      item('Delete deck', () => deleteDeck(L.deck()), { off: locked || !show || L.view().decks.length < 2, danger: true }));
    const r = anchor.getBoundingClientRect();
    document.body.append(menu);
    const w = menu.offsetWidth;
    Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`, top: `${r.bottom + 4}px` });
    const away = (e) => { if (!menu.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    function close() { menu.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); }
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true); }, 0);
    menu.querySelector('button:not([disabled])')?.focus();
  }

  async function newShow() {
    const name = await promptBox('Name of the new show', 'New show', 'Create');
    if (name) L.run(cmd('show.create', { name }), `Show "${name}" created`);
  }
  async function renameShow() {
    const name = await promptBox('Name of the show', L.show().name, 'Rename');
    if (name) L.editShow((s) => { s.name = name; }, 'rename show');
  }
  async function duplicateShow() {
    const s = L.show();
    const name = await promptBox('Name of the copy (it uses the same files)', `${s.name} copy`, 'Duplicate');
    if (name) L.run(cmd('show.create', { name, from: s.id }), `"${name}" is open`);
  }
  async function exportShow() {
    const dir = await promptBox('Folder to export the show into (a folder with show.json and its files is made there)', '', 'Export');
    if (!dir) return;
    const r = await L.run(cmd('show.export', { dir }));
    if (r) toast(`Exporting to ${r.dir}${r.copying ? ` — copying ${r.copying} file${r.copying === 1 ? '' : 's'} (see the library)` : ''}${r.missing?.length ? `. Not found: ${r.missing.join(', ')}` : ''}`, r.missing?.length ? 'warn' : 'ok');
  }
  async function importShow() {
    const dir = await promptBox('Folder of an exported show (the one with show.json)', '', 'Import');
    if (!dir) return;
    const r = await L.run(cmd('show.import', { dir }));
    if (!r) return;
    if (await confirmBox(`Show imported${r.copying ? ` — its ${r.copying} file${r.copying === 1 ? ' is' : 's are'} being copied into the library` : ''}. Open it now?`, 'Open')) L.run(cmd('show.load', { id: r.id }));
  }
  async function openShow() {
    const r = await L.run(cmd('show.list'));
    if (!r) return;
    const cur = L.show()?.id;
    const list = h('div', { class: 'list' }, r.shows.length ? r.shows.map((s) => h('div', { class: `item${s.id === cur ? ' on' : ''}` },
      h('div', { class: 't' }, s.name, h('small', {}, `${s.media} file${s.media === 1 ? '' : 's'} · ${s.clips} clip${s.clips === 1 ? '' : 's'}`)),
      s.id === cur ? h('span', { class: 'badge live' }, 'open') : h('button', { class: 'btn small primary', onclick: () => { close(); L.run(cmd('show.load', { id: s.id }), `"${s.name}" is open`); } }, 'Open'),
      s.id === cur ? null : h('button', { class: 'btn small danger', onclick: async () => {
        if (!await confirmBox(`Delete the show "${s.name}"? Its files stay in the library; a backup of the show is kept in the data folder.`, 'Delete', true)) return;
        L.run(cmd('show.delete', { id: s.id }), `"${s.name}" deleted`);
      } }, 'Delete'))) : h('p', { class: 'muted' }, 'No shows yet.'));
    const close = modal('Open a show', h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Opening a show stops the clips of the one that is open.'), list));
  }

  return { el, render, patch, paint, resize };
}
