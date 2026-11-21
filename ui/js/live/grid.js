// Live › the clip grid (MEDIA-SERVER.md §4b.3, §2b; docs/research/resolume-ux.md §C.4): rows = layers that cover each
// other (the top row is on top), columns = moments of the show; decks keep the grid small however big the library is.
//   cell          picture = launch (clip.trigger), name = select (the inspector); a status dot — grey copying, cyan
//                 ready, amber problem (the reason on hover); the live cell has a cyan border and a PLAYHEAD: a 2 px
//                 line that crosses the picture (a loop's goes back to the start) and, for clips that end, the time
//                 left. Computed here from the engine's clock and the play the engine sent; the engine is never asked
//                 where a clip is. Three sizes (S · M · L, remembered on this device). Hover: the clip, large.
//   selection     click the name: that clip · Ctrl-click adds or takes away · Shift-click the rectangle between —
//                 several clips are edited at once (inspector) and copied, pasted, duplicated, removed together
//   column head   launches the column (column.trigger); the last column launched is cyan; right-click makes it the
//                 room's start column (show.start, marked START: it launches by itself when the engine starts)
//   layer head    layers.js: X, name, S · M · B, what plays, opacity, blend
//   bar           deck tabs (+ to add one), Keys, the size of the cells, the browser, Eject all, the show's name
//                 with its menu (New, Open, Rename, Duplicate, Export, Import; Rename / Delete deck)
// Show mode: cells still launch; editing and dragging are off, and the bar says so quietly.

import { store, cmd } from '../conn.js';
import { h, toast, confirmBox, promptBox, modal } from '../dom.js';
import { playhead, passLength } from '/shared/transport.js';
import { layerHead, xlayerHead, headKey } from './layers.js';
import { locate } from './library.js';
import * as A from './actions.js';

const LH_W = 184;               // the layer head column (px)
const ADD_W = 28;               // the "+" column at the end of the header row
const SIZES = { S: 104, M: 144, L: 208 };
const MAX_LAYERS = 8, MAX_COLUMNS = 256;
const LOOPING = new Set(['loop', 'bounce']);
const AUTOPILOT = new Set(['next', 'prev', 'random', 'first']);
/** The keys of Keys mode (C.7): a row of the keyboard per layer, from the top layer down; the column is the key's place. */
export const KEY_ROWS = ['qwertyui', 'asdfghjk', 'zxcvbnm,'];

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

/** A menu at a point, in the style of Immersive Studio Pro's: [[label, fn, {off, title, danger, key}] | 'sep' | note]. */
export function popMenu(x, y, items) {
  const menu = h('div', { class: 'lv-menu', role: 'menu' }, items.map((it) => {
    if (it === 'sep') return h('div', { class: 'sep' });
    if (typeof it === 'string') return h('div', { class: 'lv-menu-note' }, it);
    const [label, fn, o = {}] = it;
    return h('button', { class: o.danger ? 'danger' : '', disabled: o.off || undefined, title: o.title || '', onclick: () => { close(); fn(); } },
      h('span', { class: 'grow' }, label), o.key ? h('span', { class: 'lv-mkey' }, o.key) : null);
  }));
  document.body.append(menu);
  Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, x))}px`, top: `${Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, y))}px` });
  const away = (e) => { if (!menu.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  function close() { menu.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); }
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true); }, 0);
  menu.querySelector('button:not([disabled])')?.focus();
  return close;
}

export function createGrid(L) {
  const el = h('div', { class: 'lv-grid' });
  let key = '', rows = null;
  // the size of the cells: remembered here; a touch screen of the room reads from further away, so it starts at L
  let size = 'M';
  try { size = localStorage.getItem('vt-live-size') || (matchMedia('(pointer: coarse)').matches && innerWidth >= 1280 ? 'L' : 'M'); } catch { /* storage blocked */ }
  if (!SIZES[size]) size = 'M';
  L.keys = false; // Keys mode (the QWERTY rows and the number keys launch); armed on purpose, it disarms itself
  let keysTimer = null;

  // ---------------------------------------------------------------- building

  function cell(deck, layer, col) {
    const clip = L.clipAt(deck, layer.id, col);
    const base = { 'data-layer': layer.id, 'data-col': String(col) };
    const select = (e) => selectCell(e, layer.id, col);
    if (!clip) {
      return h('div', { class: 'lv-cell empty', ...base, title: L.locked() ? '' : 'Drop files here', onclick: select,
        oncontextmenu: (e) => { e.preventDefault(); cellMenu(e.clientX, e.clientY, deck, layer, col); } }, h('span', { class: 'plus' }, '+'));
    }
    const m = L.mediaOf(clip);
    const img = h('img', { src: L.thumbUrl(m, size === 'L' ? 480 : 160), alt: '', draggable: 'false', loading: 'lazy', onerror: (e) => e.target.classList.add('gone') });
    return h('div', { class: 'lv-cell', ...base, 'data-clip': clip.id, 'data-media': m?.id || '', draggable: L.locked() ? 'false' : 'true',
      oncontextmenu: (e) => { e.preventDefault(); if (!L.isInSel(layer.id, col)) L.select({ kind: 'cell', layerId: layer.id, column: col }); cellMenu(e.clientX, e.clientY, deck, layer, col); } },
    h('button', { class: 'lv-thumb', title: `Launch "${clip.name}"`, 'aria-label': `Launch ${clip.name}`, onclick: (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) selectCell(e, layer.id, col); else trigger(deck, layer.id, col); } },
      img,
      h('i', { class: 'lv-ph' }),
      h('span', { class: 'lv-copy' }, h('i'), h('em', { class: 'tnum' })),
      h('span', { class: 'lv-flag' }),
      h('span', { class: 'lv-keylbl' }),
      h('span', { class: 'lv-left tnum' })), // the time left, on the picture (read from afar; the name keeps its room)
    h('button', { class: 'lv-name', title: `${clip.name} — select`, onclick: select },
      h('span', { class: 'dot' }), h('span', { class: 't' }, clip.name)),
    h('button', { class: 'btn small lv-locatebtn', title: 'Search a folder for the missing files of the show', onclick: (e) => { e.stopPropagation(); locate(L); } }, 'Locate…'));
  }

  /** Click on a cell's name or empty space: select (Ctrl: add or take away; Shift: the rectangle from the last one). */
  function selectCell(e, layerId, col) {
    const mod = e?.ctrlKey || e?.metaKey, shift = e?.shiftKey;
    const deck = L.deck();
    if ((mod || shift) && L.clipAt(deck, layerId, col)) {
      let list = L.cellsSelected();
      if (shift && list.length) {
        const anchor = L.anchor || list[0], order = L.view().layers.map((l) => l.id);
        const a = order.indexOf(anchor.layerId), b = order.indexOf(layerId), c0 = Math.min(anchor.column, col), c1 = Math.max(anchor.column, col);
        list = [];
        for (let li = Math.min(a, b); li <= Math.max(a, b); li++) for (let c = c0; c <= c1; c++) if (L.clipAt(deck, order[li], c)) list.push({ layerId: order[li], column: c });
      } else {
        const has = list.some((x) => x.layerId === layerId && x.column === col);
        list = has ? list.filter((x) => !(x.layerId === layerId && x.column === col)) : [...list, { layerId, column: col }];
        L.anchor = { layerId, column: col };
      }
      L.select(list.length ? { kind: 'cell', layerId: list[list.length - 1].layerId, column: list[list.length - 1].column } : null);
      L.setMulti(list);
      return;
    }
    L.anchor = { layerId, column: col };
    L.select({ kind: 'cell', layerId, column: col });
  }

  function trigger(deck, layerId, column) {
    if (!L.show()) return;
    L.run(cmd('clip.trigger', { deckId: deck.id, layerId, column }));
  }

  function bar(show, deck) {
    const locked = L.locked();
    const decks = h('div', { class: 'well lv-decks', role: 'tablist', 'aria-label': 'Decks' },
      L.view().decks.map((d) => h('button', {
        class: d.id === deck.id ? 'on' : '', role: 'tab', 'aria-selected': String(d.id === deck.id), 'data-deck': d.id, title: show && !locked ? 'Double-click to rename; drop files here to fill its first layer' : d.name,
        onclick: () => L.setDeck(d.id), ondblclick: () => renameDeck(d),
      }, d.name)));
    const sizes = h('div', { class: 'seg lv-sizes', role: 'group', 'aria-label': 'Size of the cells' }, Object.keys(SIZES).map((k) => h('button', {
      class: k === size ? 'on' : '', 'aria-pressed': String(k === size), 'data-size': k, title: { S: 'Small cells', M: 'Medium cells', L: 'Large cells: to read from afar' }[k], onclick: () => setSize(k),
    }, k)));
    return h('div', { class: 'lv-gbar' },
      decks,
      h('button', { class: 'ibtn lv-adddeck', title: 'Add a deck (drop a folder here: a deck named after it)', disabled: !show || locked || L.view().decks.length >= 32 || undefined, onclick: addDeck }, '+'),
      h('div', { class: 'grow' }),
      locked ? h('span', { class: 'lv-locknote', title: 'Show mode locks the show against edits; launching works as always' }, 'Show mode · launching only') : null,
      h('button', { class: `ibtn small lv-keysbtn${L.keys ? ' armed' : ''}`, 'aria-pressed': String(L.keys), disabled: !show || undefined,
        title: 'Keys: the keyboard launches. 1–9, 0 = columns; Q–I, A–K, Z–, = the clips of the layers. It disarms itself after 10 minutes without a key.', onclick: () => setKeys(!L.keys) }, 'Keys'),
      sizes,
      h('button', { class: `ibtn small lv-bbtn${L.main?.classList.contains('nobrowser') ? '' : ' on'}`, title: 'The browser: files of the show and of this computer (B)', 'aria-label': 'Browser', onclick: () => L.browser.toggle() }, 'Browser'),
      h('button', { class: 'btn small', title: 'Eject every layer (with each layer\'s transition)', disabled: !show || undefined, onclick: () => L.run(cmd('media.clearAll')) }, 'Eject all'),
      h('button', { class: 'btn small lv-showbtn', title: 'The show: what the grid, the decks and the cards belong to', onclick: (e) => showMenu(e.currentTarget) },
        h('span', { class: 'lbl' }, 'Show'), h('span', { class: 't' }, show ? show.name : 'None yet'), h('span', { class: 'caret' }, '▾')));
  }

  function setSize(k) {
    size = k;
    try { localStorage.setItem('vt-live-size', k); } catch { /* storage blocked */ }
    L.grid.render(true);
  }

  function setKeys(on) {
    L.keys = on && !!L.show();
    clearTimeout(keysTimer);
    if (L.keys) keysTimer = setTimeout(() => setKeys(false), 10 * 60 * 1000);
    L.touchKeys = () => { if (L.keys) { clearTimeout(keysTimer); keysTimer = setTimeout(() => setKeys(false), 10 * 60 * 1000); } };
    for (const b of el.querySelectorAll('.lv-keysbtn')) { b.classList.toggle('armed', L.keys); b.setAttribute('aria-pressed', String(L.keys)); }
    el.classList.toggle('keys', L.keys);
    patch();
  }
  L.setKeys = setKeys;

  function render(force = false) {
    const show = L.show(), deck = L.deck(), V = L.view();
    const k = JSON.stringify([show?.id ?? null, show?.rev ?? null, deck.id, L.locked(), V.decks.map((d) => d.name), size]);
    if (!force && k === key) return;
    key = k;
    const sc = rows?.parentElement;
    const scroll = sc ? [sc.scrollLeft, sc.scrollTop] : [0, 0];
    const locked = L.locked();
    const layers = [...V.layers].reverse(); // the top row is the top layer
    const head = h('div', { class: 'lv-row lv-head' },
      h('div', { class: 'lv-corner' },
        h('button', { class: 'ibtn small', title: 'Add a layer on top', disabled: !show || locked || V.layers.length >= MAX_LAYERS || undefined, onclick: addLayer }, '+ Layer')),
      Array.from({ length: deck.columns }, (_, c) => {
        // the room's start column (show.start: it launches by itself when the engine starts) carries START
        const start = !!show && show.start?.deckId === deck.id && show.start?.column === c;
        return h('button', {
          class: `lv-col${start ? ' start' : ''}`, 'data-col': String(c), disabled: !show || undefined,
          title: `Launch column ${c + 1}${start ? ' — the room opens with it' : ''}\nRight-click: start the room with it · drop files here: one per layer`,
          onclick: () => L.run(cmd('column.trigger', { deckId: deck.id, column: c })),
          oncontextmenu: (e) => { e.preventDefault(); if (show) columnMenu(e.clientX, e.clientY, deck, c, start); },
        }, h('span', { class: 'n tnum' }, String(c + 1)), h('span', { class: 'go' }, '▶'), start ? h('span', { class: 'st' }, 'START') : null);
      }),
      h('button', { class: 'lv-addcol', title: 'Add a column', disabled: !show || locked || deck.columns >= MAX_COLUMNS || undefined, onclick: addColumn }, '+'));
    rows = h('div', { class: 'lv-rows', 'data-size': size },
      head,
      layers.map((layer) => h('div', { class: 'lv-row', 'data-layer': layer.id },
        layerHead(L, layer),
        Array.from({ length: deck.columns }, (_, c) => cell(deck, layer, c)),
        h('span'))),
      h('div', { class: 'lv-row lv-xrow', 'data-layer': 'xlayer' }, xlayerHead(L), h('div', { class: 'lv-xcell' })));
    const scroller = h('div', { class: 'lv-scroll' }, rows);
    const report = el.querySelector('.lv-report'); // what an import refused stays until it is closed
    el.replaceChildren(...[bar(show, deck), show ? null : h('div', { class: 'lv-empty' },
      h('b', {}, 'No show yet.'), ' Drop files from the browser or the explorer onto a cell to start one — they are copied into the library.'), scroller, report].filter(Boolean));
    el.classList.toggle('locked', locked);
    el.classList.toggle('keys', L.keys);
    resize();
    scroller.scrollLeft = scroll[0]; scroller.scrollTop = scroll[1];
  }

  /** Cell width from the size chosen (S · M · L). */
  function resize() {
    if (!rows) return;
    rows.style.setProperty('--cw', `${SIZES[size]}px`);
    rows.style.setProperty('--n', String(L.deck().columns));
    rows.style.setProperty('--lhw', `${LH_W}px`);
    for (const b of el.querySelectorAll('.lv-bbtn')) b.classList.toggle('on', !L.main?.classList.contains('nobrowser'));
  }

  // ---------------------------------------------------------------- what plays (no rebuild)

  function patch() {
    if (!rows) return;
    const deck = L.deck(), M = L.media(), now = L.now();
    const multi = L.cellsSelected();
    const layerIdx = new Map([...L.view().layers].reverse().map((l, i) => [l.id, i]));
    for (const c of rows.querySelectorAll('.lv-cell')) {
      const layerId = c.dataset.layer, col = Number(c.dataset.col), clipId = c.dataset.clip;
      const inSel = multi.some((x) => x.layerId === layerId && x.column === col);
      c.classList.toggle('sel', (!!L.sel && L.isSel('cell', layerId, col)) || inSel);
      c.classList.toggle('multi', multi.length > 1 && inSel);
      const kr = KEY_ROWS[layerIdx.get(layerId)];
      c.querySelector('.lv-keylbl')?.replaceChildren(L.keys && kr && col < kr.length ? kr[col].toUpperCase() : '');
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
      if (!live) { c.querySelector('.lv-left').textContent = ''; c.querySelector('.lv-ph').style.left = '0'; }
    }
    for (const b of rows.querySelectorAll('.lv-col')) b.classList.toggle('live', !!M.column && M.column.deckId === deck.id && M.column.index === Number(b.dataset.col));
    for (const r of rows.querySelectorAll('.lv-row[data-layer]')) {
      const id = r.dataset.layer, e = L.entry(id);
      r.classList.toggle('on-air', !!e?.play);
      const head = r.querySelector('.lv-lh');
      head.classList.toggle('sel', !!L.sel && (id === 'xlayer' ? L.sel.kind === 'xlayer' : L.isSel('layer', id)));
      if (id === 'xlayer') continue;
      // what plays on the layer, by name (read from the head without looking for the cell)
      const np = head.querySelector('.lv-np .t'), playing = e?.play ? L.clip(e.play.clipId) : null;
      if (np) np.textContent = playing ? playing.name : '—';
      head.querySelector('.lv-np')?.classList.toggle('on', !!playing);
      // another device moved a fader (or the engine took the mix back): this head is built again — never under a drag
      const layer = L.layer(id);
      const a = document.activeElement, typing = !!a && head.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.classList.contains('vfield'));
      if (layer && head.dataset.key !== headKey(L, layer) && !head.querySelector('.vfield.drag') && !typing) {
        const fresh = layerHead(L, layer);
        fresh.classList.toggle('sel', head.classList.contains('sel'));
        head.replaceWith(fresh);
      }
    }
    for (const b of el.querySelectorAll('.lv-keysbtn')) b.classList.toggle('armed', L.keys);
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
      c.querySelector('.lv-ph').style.left = `${(pr.frac * 100).toFixed(2)}%`;
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

  // ---------------------------------------------------------------- a cell's menu (right-click)

  function cellMenu(x, y, deck, layer, col) {
    const clip = L.clipAt(deck, layer.id, col), locked = L.locked(), n = L.cellsSelected().length;
    const off = locked || !L.show();
    const items = clip ? [
      locked ? 'Show mode: unlock the room to edit.' : null,
      ['Launch', () => trigger(deck, layer.id, col), { key: 'Enter' }],
      ['Select', () => L.select({ kind: 'cell', layerId: layer.id, column: col })],
      'sep',
      ['Rename…', () => A.rename(L, { layerId: layer.id, column: col }), { off, key: 'F2' }],
      ['Replace file…', () => A.replaceFile(L, { layerId: layer.id, column: col }), { off, title: 'Pick the new file in the browser: the clip keeps its settings' }],
      ['Show in browser', () => L.browser.reveal(clip.mediaId)],
      'sep',
      [n > 1 ? `Duplicate ${n} clips` : 'Duplicate', () => A.duplicate(L), { off, key: 'Ctrl+D' }],
      [n > 1 ? `Copy ${n} clips` : 'Copy', () => A.copy(L), { key: 'Ctrl+C' }],
      [n > 1 ? `Cut ${n} clips` : 'Cut', () => A.cut(L), { off, key: 'Ctrl+X' }],
      ['Paste', () => A.paste(L, { layerId: layer.id, column: col }), { off: off || !L.clipboard, key: 'Ctrl+V' }],
      'sep',
      [n > 1 ? `Remove ${n} clips from the grid` : 'Remove from the grid', () => A.removeFromGrid(L), { off, danger: true, title: 'The files stay in the show' }],
      ['Remove the file…', () => A.removeFile(L, clip), { off, danger: true, title: 'Takes the file and its clips out of the show' }],
    ] : [
      locked ? 'Show mode: unlock the room to edit.' : null,
      ['Paste', () => A.paste(L, { layerId: layer.id, column: col }), { off: off || !L.clipboard, key: 'Ctrl+V' }],
      ['Open the browser', () => { if (L.main.classList.contains('nobrowser')) L.browser.toggle(); }],
    ];
    popMenu(x, y, items.filter(Boolean));
  }

  // ---------------------------------------------------------------- a column's menu (right-click on its head)

  /**
   * Launch it, or make it the room's start column: when the engine starts (the computer is switched on), it launches by
   * itself — with the start card, if one is set (show.start; engine/media/index.js › autostart). One per show.
   */
  function columnMenu(x, y, deck, c, start) {
    const locked = L.locked();
    const setStart = (on) => L.editShow((s) => { s.start = { ...(s.start || {}), deckId: deck.id, column: on ? c : null }; }, on ? 'start column' : 'no start column');
    popMenu(x, y, [
      locked ? 'Show mode: unlock the room to change the start.' : null,
      [`Launch column ${c + 1}`, () => L.run(cmd('column.trigger', { deckId: deck.id, column: c }))],
      'sep',
      start ? ['Do not start the room with it', () => setStart(false), { off: locked }]
        : [`Start the room with column ${c + 1}`, () => setStart(true), { off: locked, title: 'When the computer starts, this column launches by itself (with the start card, if one is set)' }],
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------- the show's menu

  function showMenu(anchor) {
    const show = L.show(), locked = L.locked(), desk = !!store.state?.local;
    const r = anchor.getBoundingClientRect();
    popMenu(r.right - 200, r.bottom + 4, [
      locked ? 'Show mode: unlock the room to change shows.' : null,
      ['New show…', newShow, { off: locked }],
      ['Open…', openShow, { off: locked }],
      ['Rename…', renameShow, { off: locked || !show }],
      ['Duplicate…', duplicateShow, { off: locked || !show }],
      'sep',
      ['Export to a folder…', exportShow, { off: locked || !show || !desk, title: desk ? 'A folder with show.json and its media, to take to another computer' : 'On the computer of the room' }],
      ['Import from a folder…', importShow, { off: locked || !desk, title: desk ? 'A folder exported from another computer' : 'On the computer of the room' }],
      'sep',
      ['Rename deck…', () => renameDeck(L.deck()), { off: locked || !show }],
      ['Delete deck', () => deleteDeck(L.deck()), { off: locked || !show || L.view().decks.length < 2, danger: true }],
    ].filter(Boolean));
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

  return { el, render, patch, paint, resize, trigger, setSize, get size() { return size; } };
}
