// Live › the experience shelf (MEDIA-SERVER.md §4b.4): one card per preset of the show — an experience with its
// parameters and its sound piece — then the installed experiences that have no card yet (so loading one never dead-ends,
// with or without a show), then "None": the clips alone, on black.
//   picture = load it (preset.load / experience.play / preset.unload)     name = select it (the inspector: parameters,
//   sound piece, clip slots, what it does to the grid)
// The live card has a cyan border and LIVE; one that is starting says so; one that did not start is amber with the
// reason. Its picture is the room's output the last time it was live (this session), else a plain tile.

import { store, cmd } from '../conn.js';
import { h } from '../dom.js';

const SNAP_MS = 3000;

export function createShelf(L) {
  const el = h('div', { class: 'lv-shelf' });
  let key = '', lastSnap = 0;

  /** The cards, in order: presets, uncovered experiences, None. */
  function cards() {
    const S = store.state, show = L.show(), cat = S.experiences || [], sounds = S.sounds || [];
    const out = [];
    for (const p of show?.presets || []) {
      const e = p.experienceId ? cat.find((x) => x.id === p.experienceId) : null;
      const snd = p.sound ? sounds.find((x) => x.id === p.sound.id) : null;
      const sub = [e && e.name !== p.name ? e.name : null, p.experienceId && !e ? 'not installed' : null, !p.experienceId ? 'Clips only' : null, snd ? `+ ${snd.name}` : null].filter(Boolean).join(' · ');
      out.push({ kind: 'preset', id: p.id, name: p.name, sub: sub || 'Experience', broken: !!p.experienceId && !e });
    }
    const covered = new Set((show?.presets || []).map((p) => p.experienceId).filter(Boolean));
    for (const e of cat) if (!covered.has(e.id)) out.push({ kind: 'experience', id: e.id, name: e.name, sub: show ? 'Experience · no card yet' : 'Experience' });
    out.push({ kind: 'none', id: 'none', name: 'None', sub: 'Clips only, on black' });
    return out;
  }

  const cardKey = (c) => `${L.show()?.id || '-'}|${c.kind}|${c.id}`;

  function load(c) {
    if (c.kind === 'preset') L.run(cmd('preset.load', { presetId: c.id }));
    else if (c.kind === 'experience') L.run(cmd('experience.play', { id: c.id }));
    else L.run(cmd('preset.unload'));
  }

  function card(c) {
    const pic = L.cardThumbs.get(cardKey(c));
    return h('div', { class: `lv-card k-${c.kind}${c.broken ? ' broken' : ''}`, 'data-kind': c.kind, 'data-id': c.id },
      h('button', { class: 'lv-cthumb', title: c.kind === 'none' ? 'Load None: no experience, only the clips' : `Load "${c.name}"`, 'aria-label': `Load ${c.name}`, onclick: () => load(c) },
        pic ? h('img', { src: pic, alt: '' }) : h('span', { class: 'glyph' }, c.kind === 'none' ? '∅' : c.name.slice(0, 1).toUpperCase()),
        h('span', { class: 'go' }, '▶')),
      h('button', { class: 'lv-cname', title: `${c.name} — select (its settings in the inspector)`, onclick: () => L.select({ kind: c.kind, id: c.id }) },
        h('span', { class: 't' }, c.name), h('small', {}, c.sub)),
      h('span', { class: 'lv-badge' }));
  }

  function render(force = false) {
    const S = store.state, show = L.show();
    const list = cards();
    const k = JSON.stringify([list, !!show, L.locked(), (S.experiences || []).length]);
    if (!force && k === key) return;
    key = k;
    el.replaceChildren(
      h('span', { class: 'lbl lv-shelf-lbl' }, 'Experiences'),
      h('div', { class: 'lv-cards' }, list.map(card),
        show ? h('button', { class: 'lv-addcard', title: 'A new card: an experience with its own parameters and sound', disabled: L.locked() || undefined, onclick: (e) => addMenu(e.currentTarget) }, '+') : null));
  }

  function patch() {
    const live = L.liveCard();
    for (const c of el.querySelectorAll('.lv-card')) {
      const on = c.dataset.kind === live.kind && (live.kind === 'none' || c.dataset.id === live.id);
      const state = on ? live.state : null;
      c.classList.toggle('live', on && state === 'live');
      c.classList.toggle('loading', on && state === 'loading');
      c.classList.toggle('error', on && state === 'error');
      c.classList.toggle('sel', L.isSel(c.dataset.kind, c.dataset.id));
      const b = c.querySelector('.lv-badge');
      b.textContent = !on ? '' : state === 'error' ? 'Error' : state === 'loading' ? 'Starting…' : 'LIVE';
      b.title = on && state === 'error' ? live.error || 'The experience did not start' : '';
    }
  }

  /** The room's output, while a card is live: its picture for the rest of the session (every 3 s at most). */
  function snapshot(img) {
    const live = L.liveCard();
    if (live.kind === 'none' || L.onAir() || performance.now() - lastSnap < SNAP_MS || !img.naturalWidth) return;
    lastSnap = performance.now();
    const c = document.createElement('canvas');
    c.width = 160; c.height = Math.max(8, Math.round((160 * img.naturalHeight) / img.naturalWidth));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const k = `${L.show()?.id || '-'}|${live.kind}|${live.id}`;
    L.cardThumbs.set(k, c.toDataURL('image/jpeg', 0.8));
    const card = el.querySelector(`.lv-card[data-kind="${live.kind}"][data-id="${CSS.escape(live.id)}"] .lv-cthumb`);
    if (card) { card.querySelector('.glyph, img')?.replaceWith(h('img', { src: L.cardThumbs.get(k), alt: '' })); }
  }

  function addMenu(anchor) {
    const cat = store.state.experiences || [];
    const add = (e) => {
      let id = null;
      L.editShow((s) => {
        const used = new Set(s.presets.map((p) => p.id)); let n = 1; while (used.has(`p${n}`)) n++;
        id = `p${n}`;
        const same = s.presets.filter((p) => p.experienceId === e.id).length;
        s.presets.push({ id, name: same ? `${e.name} ${same + 1}` : e.name, experienceId: e.id, params: {}, sound: null, media: {}, onLoad: 'keep' });
      }, 'add card').then((r) => { if (r && id) L.select({ kind: 'preset', id }); });
    };
    const menu = h('div', { class: 'lv-menu', role: 'menu' },
      h('div', { class: 'lv-menu-note' }, 'New card from'),
      cat.length ? cat.map((e) => h('button', { onclick: () => { close(); add(e); } }, e.name)) : h('div', { class: 'lv-menu-note' }, 'No experiences installed'),
      h('div', { class: 'sep' }),
      h('button', { onclick: () => { close(); L.run(cmd('experience.list'), 'Experiences scanned'); } }, 'Look for experiences again'));
    const r = anchor.getBoundingClientRect();
    document.body.append(menu);
    Object.assign(menu.style, { left: `${Math.min(innerWidth - menu.offsetWidth - 8, r.left)}px`, top: `${r.bottom + 4}px` });
    const away = (ev) => { if (!menu.contains(ev.target)) close(); };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); close(); } };
    function close() { menu.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); }
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true); }, 0);
  }

  return { el, render, patch, snapshot };
}
