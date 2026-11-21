// Live › the hover preview (docs/research/resolume-ux.md §C.4): rest the pointer on a cell, a file of the show or a file
// of the disk and a card shows it large — picture, name, length, size, where it is — without selecting or launching it.
// Half a second of rest first, so crossing the grid never flickers; any press, drag or scroll takes it away.

import { h } from '../dom.js';
import { duration, bytes } from './library.js';

const DELAY_MS = 500;
const W = 300;

export function createHover(L, root) {
  const card = h('div', { class: 'lv-hover', hidden: true, role: 'tooltip' });
  document.body.append(card);
  let timer = null, cur = null;

  const hide = () => { clearTimeout(timer); timer = null; card.hidden = true; cur = null; };

  function describe(t) {
    if (t.matches('.lv-file')) {
      const name = t.dataset.path.split(/[\\/]/).pop();
      return { img: `/api/media/diskthumb?s=480&path=${encodeURIComponent(t.dataset.path)}`, title: name, lines: [t.querySelector('.lv-tuse')?.textContent, t.dataset.path] };
    }
    const m = L.view().media.find((x) => x.id === (t.dataset.media || '')) || null;
    const clip = t.matches('.lv-cell') ? L.clip(t.dataset.clip) : null;
    if (!m) return null;
    const v = m.video || {};
    const lines = [
      [duration(v.duration), v.width ? `${v.width} × ${v.height}` : null, v.fps ? `${Math.round(v.fps * 100) / 100} fps` : null, bytes(m.size)].filter(Boolean).join(' · '),
      clip ? `${L.layer(t.dataset.layer)?.name} · column ${Number(t.dataset.col) + 1}` : m.file,
    ];
    return { img: L.thumbUrl(m, 480), title: clip?.name || m.file.split('/').pop(), lines };
  }

  function show(t) {
    if (L.drag || !t.isConnected) return;
    const d = describe(t);
    if (!d) return;
    const img = h('img', { src: d.img, alt: '', onerror: (e) => e.target.classList.add('gone') });
    card.replaceChildren(h('div', { class: 'pic' }, img), h('b', {}, d.title), ...d.lines.filter(Boolean).map((l) => h('span', { class: 'm tnum' }, l)));
    card.hidden = false;
    const r = t.getBoundingClientRect(), ch = card.offsetHeight;
    const left = r.right + 10 + W > innerWidth ? r.left - W - 10 : r.right + 10;
    Object.assign(card.style, { width: `${W}px`, left: `${Math.max(8, left)}px`, top: `${Math.max(8, Math.min(innerHeight - ch - 8, r.top))}px` });
  }

  root.addEventListener('mouseover', (e) => {
    const t = e.target.closest?.('.lv-cell[data-clip], .lv-tile[data-media], .lv-file[data-path]') || null;
    if (t === cur) return;
    hide();
    cur = t;
    if (t) timer = setTimeout(() => show(t), DELAY_MS);
  });
  root.addEventListener('mouseleave', hide);
  for (const ev of ['pointerdown', 'dragstart', 'wheel', 'contextmenu']) root.addEventListener(ev, hide, true);
  addEventListener('keydown', hide, true);
  return { hide, card };
}
