// Live › the browser (docs/research/resolume-ux.md §C.2): the left column, always there (B folds it).
//   Show   the files of the show: a thumbnail, the name, the length, how many cells use it ("unused" when none); search
//          and order; click selects (the inspector), Ctrl / Shift add to the selection, a double-click shows it large
//   Disk   this computer's drives (the USB stick too), the library and the user's folders, folder by folder, with a
//          thumbnail of every file the engine can read — read only (engine: media.fsRoots / media.fsList, and the
//          thumbnails of /api/media/diskthumb, all this computer only). A file or a folder is dragged from here onto
//          the grid (dnd.js: it is copied into the library there, as every import is).
//   Replace   "Replace file…" on a clip arms the browser: the next double-click on a file replaces that clip's file and
//          keeps its settings (the drop onto the clip does the same).
// No file type is filtered here: what the engine cannot read is dimmed, and the engine says why when it is dropped.

import { cmd, store } from '../conn.js';
import { h, toast } from '../dom.js';
import { duration, bytes, locate } from './library.js';
import { dropPaths, placeMedia } from './dnd.js';

const MEDIA_EXT = /\.(mov|mp4|m4v|webm|avi|mkv|mpg|mpeg|wmv|png|jpe?g|gif|webp|bmp|tiff?|wav|mp3|flac|aiff?|ogg|m4a)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;
const AUDIO_EXT = /\.(wav|mp3|flac|aiff?|ogg|m4a)$/i;
const store_ = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const joinPath = (dir, name) => (/[\\/]$/.test(dir) ? dir + name : `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`);
const kindOf = (name) => (IMAGE_EXT.test(name) ? 'IMG' : AUDIO_EXT.test(name) ? 'AUD' : /\.mov$/i.test(name) ? 'HAP' : 'VID');

export function createBrowser(L) {
  const el = h('div', { class: 'lv-browser' });
  const B = {
    tab: store_('vt-live-btab', 'show'), view: store_('vt-live-bview', 'list'), sort: store_('vt-live-bsort', 'name'),
    q: '', sel: new Set(), anchor: null,
    roots: null, dir: store_('vt-live-bdir', ''), listing: null, error: '', loading: false, rootsError: '',
  };
  let key = '';
  const local = () => !!store.state?.local;
  const desk = () => !!window.vtDesktop;
  const usedBy = (mediaId) => L.view().clips.filter((c) => c.mediaId === mediaId).length;

  // ---------------------------------------------------------------- the disk

  async function loadRoots() {
    const r = await cmd('media.fsRoots').catch((e) => { B.rootsError = e.message; return null; });
    if (r) { B.roots = r.roots; B.rootsError = ''; }
    if (!B.dir && B.roots?.length) B.dir = (B.roots.find((x) => x.id === 'desktop') || B.roots[0]).path;
    if (B.dir) await go(B.dir); else render(true);
  }
  async function go(dir) {
    B.loading = true; B.error = ''; B.sel.clear();
    render(true);
    const r = await cmd('media.fsList', { dir }).catch((e) => { B.error = e.message; return null; });
    B.loading = false;
    if (r) { B.listing = r; B.dir = r.dir; keep('vt-live-bdir', r.dir); } else B.listing = null;
    el.querySelector('.lv-bbody')?.scrollTo?.(0, 0);
    render(true);
  }
  const setTab = (t) => {
    B.tab = t; B.sel.clear(); keep('vt-live-btab', t);
    if (t === 'disk' && !B.roots && !B.rootsError) loadRoots(); else render(true);
  };

  // ---------------------------------------------------------------- selection (what a drag carries)

  function pick(id, e, order) {
    if (e.shiftKey && B.anchor && order.includes(B.anchor)) {
      const a = order.indexOf(B.anchor), b = order.indexOf(id);
      B.sel = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.ctrlKey || e.metaKey) { if (B.sel.has(id)) B.sel.delete(id); else B.sel.add(id); B.anchor = id; }
    else { B.sel = new Set([id]); B.anchor = id; }
  }
  /** The media a drag of this tile carries: the selection when it is in it, else the tile alone. */
  B.dragMedia = (id) => (B.sel.has(id) && B.sel.size > 1 ? [...B.sel] : [id]);
  B.dragPaths = (p) => (B.sel.has(p) && B.sel.size > 1 ? [...B.sel] : [p]);

  // ---------------------------------------------------------------- the show's files

  function replaceNow(mediaId, path) {
    const r = L.replace;
    if (!r) return false;
    L.replace = null; L.patch();
    const tgt = { kind: 'cell', layerId: r.layerId, column: r.column, deckId: r.deckId };
    if (path) dropPaths(L, [path], tgt); else placeMedia(L, [mediaId], tgt);
    return true;
  }

  function tile(m, order) {
    const name = m.file.split('/').pop(), n = usedBy(m.id);
    return h('div', { class: 'lv-tile', 'data-media': m.id, draggable: L.locked() ? 'false' : 'true', title: `${name}\nDrag it onto a cell, a column, a layer or a deck.` },
      h('div', { class: 'lv-tthumb' },
        h('img', { src: L.thumbUrl(m, 160), alt: '', draggable: 'false', loading: 'lazy', onerror: (e) => e.target.classList.add('gone') }),
        h('span', { class: 'lv-tdur tnum' }, duration(m.video?.duration)), h('span', { class: 'lv-copy' }, h('i'), h('em', { class: 'tnum' }))),
      h('div', { class: 'lv-tlbl' }, h('span', { class: 'dot' }),
        h('span', { class: 'lv-tname' }, h('span', { class: 't' }, name),
          h('span', { class: `lv-tuse tnum${n ? '' : ' none'}` }, n ? `in the grid: ${n}` : 'unused'))),
      null);
  }
  function wireTile(t, m, order) {
    t.addEventListener('click', (e) => { pick(m.id, e, order); L.select({ kind: 'media', mediaId: m.id }); });
    t.addEventListener('dblclick', () => { if (!replaceNow(m.id)) L.select({ kind: 'media', mediaId: m.id }); });
    return t;
  }

  function showBody() {
    const show = L.show(), q = B.q.trim().toLowerCase();
    let files = [...(show?.media || [])];
    if (q) files = files.filter((m) => m.file.toLowerCase().includes(q));
    const count = new Map(files.map((m) => [m.id, usedBy(m.id)]));
    if (B.sort === 'recent') files.reverse();
    else if (B.sort === 'unused') files.sort((a, b) => count.get(a.id) - count.get(b.id));
    else files.sort((a, b) => a.file.split('/').pop().localeCompare(b.file.split('/').pop(), undefined, { numeric: true, sensitivity: 'base' }));
    const order = files.map((m) => m.id);
    const wrap = h('div', { class: `lv-tiles ${B.view}` }, files.map((m) => wireTile(tile(m, order), m, order)));
    if (!files.length) wrap.append(h('div', { class: 'lv-bempty' }, show?.media.length ? 'No file matches.' : 'No files in this show yet. Open Disk to browse this computer, or drop files from the explorer onto the grid.'));
    return wrap;
  }

  // ---------------------------------------------------------------- the disk's folders and files

  function diskBody() {
    if (!local() || !desk()) return h('div', { class: 'lv-bempty' }, 'The disk browser works in the desktop app, on the computer of the room.');
    if (B.rootsError) return h('div', { class: 'lv-bempty' }, B.rootsError);
    const roots = h('div', { class: 'lv-roots' }, (B.roots || []).map((r) => h('button', {
      class: `lv-root${B.dir && B.dir.toLowerCase().startsWith(r.path.toLowerCase()) ? ' on' : ''}`, title: r.path, onclick: () => go(r.path),
    }, h('span', { class: `ico ${r.kind}` }), r.name)));
    const crumbs = h('div', { class: 'lv-crumbs' },
      h('button', { class: 'ibtn small', title: 'Up one folder', disabled: !B.listing?.parent || undefined, onclick: () => go(B.listing.parent) }, '↑'),
      h('input', { type: 'text', class: 'lv-pathin', value: B.dir || '', title: 'The folder: type a path and press Enter', spellcheck: 'false', 'aria-label': 'Folder',
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') go(e.target.value.trim()); } }),
      h('button', { class: 'ibtn small', title: 'Read the folder again', onclick: () => go(B.dir) }, '↻'));
    const q = B.q.trim().toLowerCase();
    const list = (B.listing?.entries || []).filter((x) => !q || x.name.toLowerCase().includes(q));
    const order = list.filter((x) => x.kind === 'file').map((x) => joinPath(B.dir, x.name));
    const rows = list.map((x) => {
      const p = joinPath(B.dir, x.name);
      if (x.kind === 'dir') {
        return h('div', { class: 'lv-folder', 'data-path': p, draggable: L.locked() ? 'false' : 'true', title: `${p}\nDrag it onto the grid to import its files (onto + for a deck named after it).`,
          onclick: () => go(p) }, h('span', { class: 'ico dir' }), h('span', { class: 't' }, x.name));
      }
      const known = MEDIA_EXT.test(x.name);
      const f = h('div', { class: `lv-file${known ? '' : ' dim'}${B.sel.has(p) ? ' sel' : ''}`, 'data-path': p, draggable: L.locked() ? 'false' : 'true',
        title: `${x.name} — ${bytes(x.size)}${known ? '\nDrag it onto the grid; double-click to see it large.' : '\nNot a kind of file Live reads: the engine will say so if you drop it.'}` },
      h('div', { class: 'lv-tthumb' }, known ? h('img', { src: `/api/media/diskthumb?s=160&path=${encodeURIComponent(p)}`, alt: '', draggable: 'false', loading: 'lazy', onerror: (e) => e.target.classList.add('gone') }) : null,
        h('span', { class: 'lv-kind' }, known ? kindOf(x.name) : '')),
      h('div', { class: 'lv-tlbl' }, h('span', { class: 'lv-tname' }, h('span', { class: 't' }, x.name), h('span', { class: 'lv-tuse tnum' }, bytes(x.size)))));
      f.addEventListener('click', (e) => { pick(p, e, order); L.select({ kind: 'file', path: p, name: x.name, size: x.size }); render(true); });
      f.addEventListener('dblclick', () => { if (!replaceNow(null, p)) L.select({ kind: 'file', path: p, name: x.name, size: x.size, large: true }); });
      return f;
    });
    const wrap = h('div', { class: `lv-tiles disk ${B.view}` }, rows);
    if (B.loading) wrap.replaceChildren(h('div', { class: 'lv-bempty' }, 'Reading the folder…'));
    else if (B.error) wrap.replaceChildren(h('div', { class: 'lv-bempty attn' }, B.error));
    else if (!rows.length) wrap.append(h('div', { class: 'lv-bempty' }, q ? 'No file matches.' : 'This folder is empty.'));
    else if (B.listing?.truncated) wrap.append(h('div', { class: 'lv-bempty' }, 'The folder has more files than are listed here.'));
    return h('div', { class: 'lv-diskwrap' }, roots, crumbs, wrap);
  }

  // ---------------------------------------------------------------- the column

  function render(force = false) {
    const S = store.state, show = L.show(), lib = S.library || {};
    const k = JSON.stringify([B.tab, B.view, B.sort, B.q, [...B.sel], B.dir, B.loading, B.error, B.rootsError, !!B.roots, show?.id, show?.rev, L.locked(), L.replace, lib.dir, lib.free, !!S.local,
      (S.media?.problems || []).length]);
    if (!force && k === key) return;
    key = k;
    const keepScroll = el.querySelector('.lv-bbody')?.scrollTop || 0;
    const seg = (id, label) => h('button', { class: B.tab === id ? 'on' : '', 'aria-pressed': String(B.tab === id), disabled: (id === 'disk' && !(local() && desk())) || undefined,
      title: id === 'disk' ? (local() && desk() ? 'Browse this computer: drives, USB sticks, folders' : 'Needs the desktop app on the computer of the room') : 'The files of this show', onclick: () => setTab(id) }, label);
    const search = h('input', { type: 'text', class: 'lv-bsearch', placeholder: 'Search', value: B.q, spellcheck: 'false', 'aria-label': 'Search files' });
    search.addEventListener('input', () => { B.q = search.value; const p = search.selectionStart; render(true); const s = el.querySelector('.lv-bsearch'); s.focus(); s.setSelectionRange(p, p); });
    const head = h('div', { class: 'lv-bhead' },
      h('div', { class: 'seg lv-btabs', role: 'tablist' }, seg('show', 'Show'), seg('disk', 'Disk')),
      h('div', { class: 'grow' }),
      B.tab === 'show' ? h('select', { class: 'lv-bsort', title: 'Order', 'aria-label': 'Order', onchange: (e) => { B.sort = e.target.value; keep('vt-live-bsort', B.sort); render(true); } },
        [['name', 'Name'], ['recent', 'Newest'], ['unused', 'Unused first']].map(([v, t]) => h('option', { value: v, selected: B.sort === v }, t))) : null,
      h('div', { class: 'seg lv-bview' }, [['list', '≡', 'List'], ['grid', '▦', 'Large pictures']].map(([v, g, t]) => h('button', { class: B.view === v ? 'on' : '', title: t, 'aria-label': t, onclick: () => { B.view = v; keep('vt-live-bview', v); render(true); } }, g))));
    const banner = L.replace ? h('div', { class: 'lv-replace' },
      h('span', {}, 'Replacing the file of ', h('b', {}, L.clip(L.deck().cells[`${L.replace.layerId}:${L.replace.column}`])?.name || 'a clip'), ': double-click the new file.'),
      h('button', { class: 'ibtn small', onclick: () => { L.replace = null; L.patch(); render(true); } }, 'Cancel')) : null;
    const body = h('div', { class: 'lv-bbody' }, B.tab === 'show' ? showBody() : diskBody());
    const missing = (S.media?.problems || []).some((p) => p.kind === 'missing-media');
    const foot = h('div', { class: 'lv-bfoot muted' },
      h('span', { class: 't', title: lib.dir || '' }, 'Library: ', h('b', {}, lib.dir || '—')),
      lib.free != null ? h('span', { class: 'tnum' }, `${bytes(lib.free)} free`) : null,
      missing ? h('button', { class: 'btn small', onclick: () => locate(L) }, 'Locate…') : null);
    el.replaceChildren(...[head, h('div', { class: 'lv-bsearchrow' }, search, h('span', { class: 'lv-bcount tnum' }, B.tab === 'show' ? `${(show?.media || []).length} files` : B.listing ? `${B.listing.entries.length} items` : '')), banner, body, foot].filter(Boolean));
    el.querySelector('.lv-bbody').scrollTop = keepScroll;
    patch();
  }

  /** The copy state of the tiles (grey while copying, amber when something is wrong), and what is selected. */
  function patch() {
    for (const t of el.querySelectorAll('.lv-tile')) {
      const st = L.status(t.dataset.media);
      t.classList.toggle('sel', B.sel.has(t.dataset.media) || (!!L.sel && L.isSel('media', t.dataset.media)));
      for (const k of ['copying', 'ready', 'missing', 'problem']) t.classList.toggle(`st-${k}`, st.kind === k);
      const dot = t.querySelector('.dot');
      dot.className = `dot${st.kind === 'ready' ? ' live' : st.kind === 'copying' ? '' : ' warn'}`;
      dot.title = st.text;
      if (st.kind === 'copying') { t.querySelector('.lv-copy i').style.width = `${st.pct}%`; t.querySelector('.lv-copy em').textContent = `${st.pct} %`; }
    }
    for (const f of el.querySelectorAll('.lv-file')) f.classList.toggle('sel', B.sel.has(f.dataset.path) || (L.sel?.kind === 'file' && L.sel.path === f.dataset.path));
  }

  B.el = el; B.render = render; B.patch = patch; B.paint = () => {};
  /** B (the key) and the grid bar's button: fold or open. */
  B.toggle = () => {
    const open = !L.main.classList.contains('nobrowser');
    L.main.classList.toggle('nobrowser', open); keep('vt-live-bopen', open ? '0' : '1');
    L.grid.resize();
    L.grid.patch();
  };
  B.reveal = (mediaId) => { setTab('show'); if (L.main.classList.contains('nobrowser')) B.toggle(); B.sel = new Set([mediaId]); render(true); el.querySelector(`.lv-tile[data-media="${mediaId}"]`)?.scrollIntoView({ block: 'nearest' }); };
  B.openDisk = () => { if (L.main.classList.contains('nobrowser')) B.toggle(); setTab('disk'); };
  B.startOpen = store_('vt-live-bopen', '1') !== '0';
  if (B.tab === 'disk' && !(local() && desk())) B.tab = 'show';
  if (B.tab === 'disk') loadRoots();
  void toast;
  return B;
}
