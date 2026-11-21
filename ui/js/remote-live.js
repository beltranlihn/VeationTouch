// The phone's Live (MEDIA-SERVER.md §7.2) — the Live mode of the room remote. remote.js has the mode bar (Live |
// Calibrate) and the header; Calibrate is the calibration remote exactly as it was. One hand, a dark room, and often
// the internet relay between the phone and the server (the guest Wi-Fi of a room rarely reaches it):
//   NOW          always on top: the live experience, and per layer the clip on the walls with its time left (computed
//                here from the engine's clock and the play the engine sent — the engine is never asked) and its X
//   Experiences  big cards; a tap loads (preset.load · experience.play · preset.unload = None)
//   Deck         the show's clip grid as 2-column cells grouped by the show's columns, or a list (Mitti) — remembered
//                on this device; tap = launch (clip.trigger), long press = details (read-only); ◀ ▶ = column.next;
//                the deck selector
//   Master       the room's level (the VEATION fader, no knob) and Mute; Hold for BLACKOUT (0.6 s, the fill shows it),
//                amber while the room is dark, a tap lifts it
//   Lock         the padlock in the header: every tap is ignored until the bar at the bottom is slid to its end
// Importing, editing the grid, Advanced Output and audio routing say "Edit on the computer": the phone never imports.
// Bandwidth (§7.3): state, commands and 160 px thumbnails — their URL carries the file's fingerprint, so a phone keeps
// them for good, and they load lazily; no video, no audio, and no point clouds while Live is open (remote.js › setViz).
// As in remote.js, each part is built when what it shows changes (a key per part); what plays is patched in place
// (classes, texts, bar widths, four times a second while something plays): buttons are never rebuilt under the finger.

import { store, on, cmd } from './conn.js';
import { h, fader, toast, modal } from './dom.js';
import { makeClock } from './clock.js';
import { progressOf, clockText } from './live/grid.js';

const LONG_MS = 500;   // a long press opens the details of a clip
const HOLD_MS = 600;   // Hold for BLACKOUT
const TICK_MS = 250;   // the time left, four times a second (enough for seconds; kind to the battery)
const LOOPING = new Set(['loop', 'bounce']);
// = ui/js/live/inspector.js › END_LABEL (copied: that module is the desktop inspector, not shared)
const END_LABEL = { loop: 'Loop', hold: 'Play once, hold the last frame', clear: 'Play once, then eject', bounce: 'Bounce', next: 'Then the next clip', prev: 'Then the previous clip', random: 'Then a random clip', first: 'Then the first clip' };
const ON_COMPUTER = ['Import media', 'Edit the grid', 'Advanced Output', 'Audio routing'];

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const run = (p) => p.catch((e) => { toast(e.message, 'bad'); return null; });

/**
 * What is live on the shelf: {kind:'preset'|'experience'|'none', id, state, error}.
 * A copy of ui/js/live/index.js › L.liveCard — that module mounts the desktop's Live when imported, so it is not shared.
 */
export function liveCard(S) {
  const P = S?.media?.preset, show = S?.show;
  if (P?.id && show?.presets.some((p) => p.id === P.id)) return { kind: 'preset', id: P.id, state: P.state, error: P.error };
  if (P?.experienceId) return { kind: 'experience', id: P.experienceId, state: P.state, error: P.error };
  if (S?.experience?.running && S.experience.id) return { kind: 'experience', id: S.experience.id, state: 'live', error: S.experience.error };
  return { kind: 'none', state: 'live' };
}

/** The shelf's cards in order: the show's presets, the installed experiences without a card, None (as shelf.js). */
export function shelfCards(S) {
  const show = S?.show, cat = S?.experiences || [], out = [];
  for (const p of show?.presets || []) {
    const e = p.experienceId ? cat.find((x) => x.id === p.experienceId) : null;
    out.push({ kind: 'preset', id: p.id, name: p.name, sub: !p.experienceId ? 'Clips only' : e ? (e.name !== p.name ? e.name : 'Experience') : 'Not installed' });
  }
  const covered = new Set((show?.presets || []).map((p) => p.experienceId).filter(Boolean));
  for (const e of cat) if (!covered.has(e.id)) out.push({ kind: 'experience', id: e.id, name: e.name, sub: 'Experience' });
  out.push({ kind: 'none', id: 'none', name: 'None', sub: 'Clips only, on black' });
  return out;
}

/** Was this play launched from this cell? (= live/grid.js › fromCell: a play by clip id alone counts for the first cell of that clip in its row.) */
function fromCell(p, clipId, deck, layerId, col) {
  if (!p || p.clipId !== clipId) return false;
  if (p.deckId) return p.deckId === deck.id && p.column === col;
  let first = null;
  for (let c = 0; c < deck.columns && first === null; c++) if (deck.cells[`${layerId}:${c}`] === clipId) first = c;
  return first === col;
}

const RING = '<svg viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="0 100"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export function createLive() {
  const clock = makeClock();
  const st = {
    active: false,
    view: lsGet('vt-remote-live-view') === 'list' ? 'list' : 'grid',
    deckId: null,
    locked: lsGet('vt-remote-lock') === '1',
    pressing: 0,       // fingers down on the Live screen: a rebuild waits for them
    pending: false,
    keys: { now: '', shelf: '', deck: '', master: '' },
  };

  // ---------------------------------------------------------------- reading the state

  const S = () => store.state;
  const show = () => S()?.show || null;
  const M = () => S()?.media || {};
  const clipOf = (id) => show()?.clips.find((c) => c.id === id) || null;
  const mediaOf = (clip) => (clip ? show()?.media.find((m) => m.id === clip.mediaId) || null : null);
  const entry = (id) => (id === 'xlayer' ? M().xlayer : M().layers?.[id]) || null;
  const deck = () => {
    const s = show();
    if (!s) return null;
    if (st.deckId === null) st.deckId = lsGet(`vt-remote-deck-${s.id}`);
    return s.decks.find((d) => d.id === st.deckId) || s.decks[0] || null;
  };
  /** Columns of the deck that have at least one clip, in order. */
  const usedColumns = (d) => {
    const L = show()?.layers || [], out = [];
    for (let c = 0; c < d.columns; c++) if (L.some((l) => d.cells[`${l.id}:${c}`])) out.push(c);
    return out;
  };
  /** A thumbnail (= live/index.js › L.thumbUrl): the fingerprint in the URL makes it cacheable for good. */
  const thumbUrl = (m) => (m ? `/api/media/thumb/${encodeURIComponent(m.id)}.png?s=160&v=${m.fingerprint || ''}${S()?.local ? '' : `&k=${encodeURIComponent(S()?.token || '')}`}` : '');
  const segLen = (clip, m) => Math.max(0, (clip.out ?? m?.video?.duration ?? 0) - (clip.in || 0));
  const endOf = (clip, layer) => (clip.end && clip.end !== 'layer' ? clip.end : layer?.end || 'loop');
  /** How a medium of the show is: 'copying' (with %), 'missing', or 'ready' (= L.status, the two cases a phone shows). */
  const statusOf = (mediaId) => {
    const job = (M().import || []).find((j) => j.mediaId === mediaId && j.showId === show()?.id && (j.state === 'queued' || j.state === 'copying'));
    if (job) return { kind: 'copying', text: job.state === 'queued' ? 'Waiting' : `Copying ${job.total ? Math.floor((job.done / job.total) * 100) : 0} %` };
    if ((M().problems || []).some((p) => p.mediaId === mediaId && p.kind === 'missing-media')) return { kind: 'missing', text: 'Missing' };
    return { kind: 'ready', text: '' };
  };

  // ---------------------------------------------------------------- doing things (nothing while the screen is locked)

  function send(op, args = {}) {
    if (st.locked) { nudgeLock(); return null; }
    return run(cmd(op, args));
  }
  const buzz = (ms = 30) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch { /* no vibration */ } };

  /** Tap = onTap; a long press (finger still for LONG_MS) = onLong instead. A scroll cancels both. */
  function press(el, onTap, onLong) {
    let timer = null, fired = false, x0 = 0, y0 = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } el.classList.remove('pressing'); };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      fired = false; x0 = e.clientX; y0 = e.clientY;
      cancel();
      el.classList.add('pressing');
      timer = setTimeout(() => { timer = null; fired = true; el.classList.remove('pressing'); if (!st.locked) { buzz(); onLong(); } }, LONG_MS);
    });
    el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is ours, not the browser's menu
    el.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); return; } onTap(); });
  }

  // ---------------------------------------------------------------- the shell

  const el = {
    root: h('div', { class: 'rl', id: 'rLive' }),
    now: h('section', { class: 'rl-now', 'aria-label': 'Now on the walls' }),
    scroll: h('main', { class: 'rl-scroll' }),
    shelf: h('section', { class: 'rl-sec rl-shelf' }),
    deck: h('section', { class: 'rl-sec rl-deck' }),
    ro: h('section', { class: 'rl-sec rl-ro' },
      h('h3', {}, 'On the computer'),
      h('p', { class: 'muted' }, 'This phone runs the show. Setting it up is done in the app on the computer.'),
      h('div', { class: 'rl-rolist' }, ON_COMPUTER.map((t) => h('div', { class: 'rl-roitem' }, h('span', {}, t), h('span', { class: 'rl-rotag' }, 'Edit on the computer'))))),
    bottom: h('section', { class: 'rl-bottom' }),
    master: h('div', { class: 'rl-master' }),
    bo: h('button', { class: 'rl-blackout', 'aria-pressed': 'false' }, h('i', { class: 'fill' }), h('span', { class: 't' }, 'Hold for BLACKOUT')),
    lockBtn: h('button', { class: 'ibtn rl-lockbtn', title: 'Lock the screen against accidental taps', 'aria-label': 'Lock the screen', 'aria-pressed': 'false', html: LOCK_SVG }),
    shield: h('div', { class: 'rl-shield', hidden: true, role: 'dialog', 'aria-label': 'The screen is locked' },
      h('div', { class: 'rl-shield-note' }, 'Locked — taps do nothing'),
      h('div', { class: 'rl-slide', role: 'slider', 'aria-label': 'Slide to unlock', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
        h('i'), h('span', {}, 'Slide to unlock  →'))),
  };
  el.scroll.append(el.shelf, el.deck, el.ro);
  el.bottom.append(el.master, el.bo);
  el.root.append(el.now, el.scroll, el.bottom);
  document.body.append(el.shield);

  // a rebuild waits while a finger is down on the Live screen (it would replace the button under it)
  el.root.addEventListener('pointerdown', () => { st.pressing++; });
  const lift = () => { if (!st.pressing) return; st.pressing = 0; if (st.pending) setTimeout(() => render(), 0); };
  addEventListener('pointerup', lift, true);
  addEventListener('pointercancel', lift, true);
  el.root.addEventListener('faderend', () => setTimeout(() => render(), 0));

  // ---------------------------------------------------------------- NOW

  function buildNow() {
    const s = show();
    const layers = [...(s?.layers || [])].reverse(); // the top layer first, as on the walls
    const key = JSON.stringify(layers.map((l) => [l.id, l.name]));
    if (key === st.keys.now && el.now.firstChild) return;
    st.keys.now = key;
    const row = (id, name) => h('div', { class: 'rl-nrow', 'data-layer': id, hidden: true },
      h('span', { class: 'rl-nl' }, name),
      h('span', { class: 'rl-nc' }),
      h('span', { class: 'rl-nind' }, h('span', { class: 'rl-nring', html: RING }), h('span', { class: 'rl-nbar' }, h('i'))),
      h('span', { class: 'rl-nleft tnum' }),
      h('button', { class: 'rl-nx', 'aria-label': `Eject ${name}`, title: `Eject ${name}`, onclick: () => send('layer.clear', { layerId: id }) }, '✕'));
    el.now.replaceChildren(
      h('div', { class: 'rl-nx-head' }, h('span', { class: 'lbl' }, 'NOW'), h('span', { class: 'rl-xname' }), h('span', { class: 'rl-xstate' })),
      h('div', { class: 'rl-bo-line', hidden: true }, 'BLACKOUT — the room is dark'),
      ...layers.map((l) => row(l.id, l.name)),
      row('xlayer', 'Experience clips'),
      h('div', { class: 'rl-nidle muted' }, 'No clip on the layers'));
  }

  function patchNow() {
    const S0 = S(), card = liveCard(S0);
    const name = card.kind === 'preset' ? show()?.presets.find((p) => p.id === card.id)?.name
      : card.kind === 'experience' ? (S0.experiences || []).find((e) => e.id === card.id)?.name || card.id : null;
    const xn = el.now.querySelector('.rl-xname'), xs = el.now.querySelector('.rl-xstate');
    xn.textContent = name || 'No experience';
    xn.classList.toggle('on', card.kind !== 'none' && card.state === 'live');
    xs.textContent = card.kind === 'none' ? 'clips on black' : card.state === 'loading' ? 'Starting…' : card.state === 'error' ? 'Did not start' : 'LIVE';
    xs.className = `rl-xstate${card.kind === 'none' ? '' : card.state === 'error' ? ' attn' : card.state === 'live' ? ' on' : ''}`;
    xs.title = card.state === 'error' ? card.error || '' : '';
    el.now.querySelector('.rl-bo-line').hidden = !M().blackout;
    let any = false;
    for (const r of el.now.querySelectorAll('.rl-nrow')) {
      const e = entry(r.dataset.layer), clip = e?.play ? clipOf(e.play.clipId) : null;
      r.hidden = !clip;
      if (!clip) continue;
      any = true;
      const c = r.querySelector('.rl-nc');
      if (c.textContent !== clip.name) c.textContent = clip.name;
      r.dataset.play = e.play.playId || '';
      const ring = LOOPING.has(e.play.end);
      r.classList.toggle('ind-ring', ring);
      r.classList.toggle('ind-bar', !ring);
      r.classList.toggle('held', e.state === 'held');
    }
    el.now.querySelector('.rl-nidle').hidden = any;
    paintNow(clock.engineNow());
  }

  function paintNow(now) {
    for (const r of el.now.querySelectorAll('.rl-nrow:not([hidden])')) {
      const e = entry(r.dataset.layer);
      if (!e?.play) continue;
      const pr = progressOf(e.play, now, e.state === 'held');
      if (pr.kind === 'ring') r.querySelector('.rl-nring .fg').setAttribute('stroke-dasharray', `${(pr.frac * 100).toFixed(1)} 100`);
      else r.querySelector('.rl-nbar i').style.width = `${(pr.frac * 100).toFixed(1)}%`;
      const t = pr.kind === 'bar' ? (e.state === 'held' ? 'Hold' : `−${clockText(pr.left)}`) : 'Loop';
      const left = r.querySelector('.rl-nleft');
      if (left.textContent !== t) left.textContent = t;
    }
  }

  // ---------------------------------------------------------------- Experiences

  function buildShelf() {
    const list = shelfCards(S());
    const key = JSON.stringify(list);
    if (key === st.keys.shelf) return;
    st.keys.shelf = key;
    const load = (c) => (c.kind === 'preset' ? send('preset.load', { presetId: c.id }) : c.kind === 'experience' ? send('experience.play', { id: c.id }) : send('preset.unload'));
    el.shelf.replaceChildren(
      h('h3', {}, 'Experiences'),
      h('div', { class: 'rl-cards' }, list.map((c) => h('button', { class: `rl-card k-${c.kind}`, 'data-kind': c.kind, 'data-id': c.id, 'aria-label': `Load ${c.name}`, onclick: () => load(c) },
        h('span', { class: 'g' }, c.kind === 'none' ? '∅' : c.name.slice(0, 1).toUpperCase()),
        h('span', { class: 'tx' }, h('span', { class: 't' }, c.name), h('small', {}, c.sub)),
        h('span', { class: 'rl-badge' })))));
  }

  function patchShelf() {
    const live = liveCard(S());
    for (const c of el.shelf.querySelectorAll('.rl-card')) {
      const on = c.dataset.kind === live.kind && (live.kind === 'none' || c.dataset.id === live.id);
      c.classList.toggle('live', on && live.state === 'live');
      c.classList.toggle('loading', on && live.state === 'loading');
      c.classList.toggle('error', on && live.state === 'error');
      c.querySelector('.rl-badge').textContent = !on ? '' : live.state === 'error' ? 'Error' : live.state === 'loading' ? 'Starting…' : 'LIVE';
    }
  }

  // ---------------------------------------------------------------- the deck

  function setDeck(id) {
    st.deckId = id;
    if (show()) lsSet(`vt-remote-deck-${show().id}`, id);
    render();
  }
  function setView(v) {
    if (st.view === v) return;
    st.view = v;
    lsSet('vt-remote-live-view', v);
    render();
  }

  /** Read-only details of a clip (long press): what it is and how it ends. Changing it is done on the computer. */
  function details(d, layer, col, clip) {
    const m = mediaOf(clip), end = endOf(clip, layer), len = segLen(clip, m);
    const row = (k, v) => h('div', { class: 'rl-drow' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    modal(clip.name, h('div', { class: 'rl-details' },
      m ? h('img', { src: thumbUrl(m), alt: '' }) : null,
      row('Duration', clockText(len)),
      row('End', `${END_LABEL[end] || end}${clip.end === 'layer' || !clip.end ? ' (layer default)' : ''}`),
      row('Layer', layer.name),
      row('Column', `${col + 1} · ${d.name}`),
      m ? row('File', m.file.split('/').pop()) : null,
      h('p', { class: 'muted rl-dnote' }, 'Read-only here. Edit the clip on the computer.')));
  }

  function deckKey(d) {
    const s = show();
    if (!s || !d) return JSON.stringify([!!s, st.view]);
    return JSON.stringify([s.id, d.id, d.columns, d.cells, s.decks.map((x) => [x.id, x.name]), s.layers.map((l) => [l.id, l.name, l.end]),
      s.clips.map((c) => [c.id, c.name, c.mediaId, c.end, c.in, c.out]), s.media.map((m) => [m.id, m.fingerprint]), st.view, !!S()?.local]);
  }

  function buildDeck() {
    const s = show(), d = deck();
    const key = deckKey(d);
    if (key === st.keys.deck) return;
    st.keys.deck = key;
    if (!s || !d) {
      el.deck.replaceChildren(h('h3', {}, 'Clips'), h('p', { class: 'muted rl-empty' }, 'No show yet. Make one in Live on the computer: drop HAP files on its grid.'));
      return;
    }
    const sel = s.decks.length > 1
      ? h('select', { class: 'rl-decksel', 'aria-label': 'Deck', onchange: (e) => setDeck(e.target.value) }, s.decks.map((x) => h('option', { value: x.id, selected: x.id === d.id }, x.name)))
      : h('span', { class: 'rl-deckname' }, d.name);
    const bar = h('div', { class: 'rl-dbar' },
      h('span', { class: 'lbl' }, 'Deck'), sel, h('div', { class: 'grow' }),
      h('button', { class: 'rl-step', 'aria-label': 'Previous column', title: 'Previous column', onclick: () => send('column.next', { dir: -1, deckId: d.id }) }, '◀'),
      h('button', { class: 'rl-step', 'aria-label': 'Next column', title: 'Next column', onclick: () => send('column.next', { dir: 1, deckId: d.id }) }, '▶'));
    const views = h('div', { class: 'seg rl-views', role: 'group', 'aria-label': 'View' },
      [['grid', 'Grid'], ['list', 'List']].map(([v, t]) => h('button', { class: st.view === v ? 'on' : '', 'data-view': v, 'aria-pressed': String(st.view === v), onclick: () => setView(v) }, t)));
    const layers = [...s.layers].reverse();
    const cols = usedColumns(d);
    const groups = cols.map((c) => {
      const items = layers.filter((l) => d.cells[`${l.id}:${c}`]).map((l) => {
        const clip = clipOf(d.cells[`${l.id}:${c}`]);
        return clip ? item(d, l, c, clip) : null;
      });
      return h('div', { class: 'rl-group', 'data-col': String(c) },
        h('div', { class: 'rl-ghead' }, h('span', { class: 'n tnum' }, `Column ${c + 1}`),
          h('button', { class: 'rl-colgo', 'data-col': String(c), 'aria-label': `Launch column ${c + 1}`, onclick: () => send('column.trigger', { deckId: d.id, column: c }) }, '▶ Launch column')),
        h('div', { class: st.view === 'list' ? 'rl-list' : 'rl-cells' }, items));
    });
    el.deck.replaceChildren(h('div', { class: 'rl-dtop' }, h('h3', {}, 'Clips'), views), bar,
      ...(groups.length ? groups : [h('p', { class: 'muted rl-empty' }, 'This deck has no clips. Add them on the computer.')]));
  }

  /** A cell (grid) or a row (list): tap = launch, long press = details. */
  function item(d, layer, c, clip) {
    const m = mediaOf(clip), list = st.view === 'list';
    const bar = h('span', { class: 'rl-cbar' }, h('i')), left = h('span', { class: 'rl-cleft tnum' });
    const pic = h('span', { class: 'rl-pic' },
      m ? h('img', { src: thumbUrl(m), alt: '', loading: 'lazy', draggable: 'false', onerror: (e) => e.target.classList.add('gone') }) : null,
      h('span', { class: 'rl-flag' }), list ? null : [bar, left]);
    const b = h('button', { class: list ? 'rl-lrow' : 'rl-cell', 'data-layer': layer.id, 'data-col': String(c), 'data-clip': clip.id, 'aria-label': `Launch ${clip.name}` },
      pic,
      h('span', { class: 'rl-cname' }, h('span', { class: 't' }, clip.name),
        h('small', { class: 'tnum' }, list ? `${layer.name} · ${clockText(segLen(clip, m))} · ${LOOPING.has(endOf(clip, layer)) ? 'loops' : 'once'}` : layer.name)),
      list ? [left, bar] : null);
    press(b, () => send('clip.trigger', { deckId: d.id, layerId: layer.id, column: c }), () => details(d, layer, c, clip));
    return b;
  }

  function patchDeck() {
    const d = deck();
    if (!d) return;
    const col = M().column;
    for (const g of el.deck.querySelectorAll('.rl-group')) g.classList.toggle('live', !!col && col.deckId === d.id && col.index === Number(g.dataset.col));
    for (const b of el.deck.querySelectorAll('[data-clip]')) {
      const e = entry(b.dataset.layer);
      const live = !!e?.play && fromCell(e.play, b.dataset.clip, d, b.dataset.layer, Number(b.dataset.col));
      b.classList.toggle('live', live);
      b.classList.toggle('ind-bar', live && !LOOPING.has(e.play.end));
      if (!live) b.querySelector('.rl-cleft').textContent = '';
      const sti = statusOf(clipOf(b.dataset.clip)?.mediaId);
      b.classList.toggle('st-missing', sti.kind === 'missing');
      b.classList.toggle('st-copying', sti.kind === 'copying');
      const f = b.querySelector('.rl-flag');
      if (f.textContent !== sti.text) f.textContent = sti.text;
    }
    paintDeck(clock.engineNow());
  }

  function paintDeck(now) {
    for (const b of el.deck.querySelectorAll('[data-clip].live')) {
      const e = entry(b.dataset.layer);
      if (!e?.play) continue;
      const pr = progressOf(e.play, now, e.state === 'held');
      b.querySelector('.rl-cbar i').style.width = `${(pr.frac * 100).toFixed(1)}%`;
      const t = pr.kind === 'bar' ? (e.state === 'held' ? 'Hold' : `−${clockText(pr.left)}`) : 'LIVE';
      const left = b.querySelector('.rl-cleft');
      if (left.textContent !== t) left.textContent = t;
    }
  }

  // ---------------------------------------------------------------- master, mute, blackout

  function buildMaster() {
    const A = S()?.profile?.audio || {};
    const key = JSON.stringify([A.master, !!A.mute]);
    if (key === st.keys.master) return;
    if (el.master.querySelector('.vfield.drag')) { st.pending = true; return; }
    st.keys.master = key;
    let last = 0;
    const live = (v) => { const t = performance.now(); if (t - last < 66 || st.locked) return; last = t; cmd('audio.set', { master: v }).catch(() => {}); };
    const f = fader('Master', A.master ?? 1, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live, (v) => send('audio.set', { master: v }));
    el.master.replaceChildren(f,
      h('button', { class: `rl-mute${A.mute ? ' on' : ''}`, 'aria-pressed': String(!!A.mute), title: A.mute ? 'The room is muted — tap to hear it' : 'Mute the room', onclick: () => send('audio.mute', { mute: !S().profile.audio.mute }) }, A.mute ? 'Muted' : 'Mute'));
  }

  let holdT = null, heldAt = 0;
  el.bo.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || st.locked || M().blackout) return;
    el.bo.classList.add('holding');
    clearTimeout(holdT);
    holdT = setTimeout(() => { holdT = null; heldAt = Date.now(); el.bo.classList.remove('holding'); buzz(60); send('media.blackout', { on: true }); }, HOLD_MS);
  });
  const release = () => {
    if (!holdT) return;
    clearTimeout(holdT); holdT = null;
    el.bo.classList.remove('holding');
    el.bo.classList.add('hint'); setTimeout(() => el.bo.classList.remove('hint'), 900); // a short tap: show how
  };
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.bo.addEventListener(t, release);
  el.bo.addEventListener('contextmenu', (e) => e.preventDefault());
  el.bo.addEventListener('click', () => {
    if (Date.now() - heldAt < 1500) return; // the release of the hold that just blacked out
    if (M().blackout) send('media.blackout', { on: false });
  });

  function patchBlackout() {
    const on = !!M().blackout;
    el.bo.classList.toggle('on', on);
    el.bo.setAttribute('aria-pressed', String(on));
    const t = on ? 'BLACKOUT ON · tap to lift' : 'Hold for BLACKOUT';
    const span = el.bo.querySelector('.t');
    if (span.textContent !== t) span.textContent = t;
  }

  // ---------------------------------------------------------------- the screen lock

  function setLocked(on) {
    st.locked = on;
    lsSet('vt-remote-lock', on ? '1' : '0');
    el.lockBtn.classList.toggle('on', on);
    el.lockBtn.setAttribute('aria-pressed', String(on));
    el.lockBtn.setAttribute('aria-label', on ? 'The screen is locked' : 'Lock the screen');
    el.shield.hidden = !(on && st.active);
    el.root.classList.toggle('locked', on);
    resetSlide();
    if (on) buzz();
  }
  function nudgeLock() {
    const s = el.shield.querySelector('.rl-slide');
    s.classList.remove('nudge'); void s.offsetWidth; s.classList.add('nudge');
  }
  el.lockBtn.addEventListener('click', () => { if (!st.locked) setLocked(true); else nudgeLock(); });
  el.shield.addEventListener('click', (e) => { if (!e.target.closest('.rl-slide')) nudgeLock(); });

  const slide = el.shield.querySelector('.rl-slide'), slideFill = slide.querySelector('i');
  function resetSlide() { slideFill.style.width = '0%'; slide.setAttribute('aria-valuenow', '0'); slide.classList.remove('drag'); }
  slide.addEventListener('pointerdown', (e) => {
    const r = slide.getBoundingClientRect();
    if ((e.clientX - r.left) / (r.width || 1) > 0.35) { nudgeLock(); return; } // it starts at the left end
    e.preventDefault();
    try { slide.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    slide.classList.add('drag');
    const move = (ev) => {
      const f = clamp((ev.clientX - r.left) / (r.width || 1), 0, 1);
      slideFill.style.width = `${(f * 100).toFixed(1)}%`;
      slide.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      if (f >= 0.92) { end(); setLocked(false); }
    };
    const end = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    const up = () => { end(); resetSlide(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });

  // ---------------------------------------------------------------- render / patch / the time left

  function render() {
    if (!st.active || !S()) return;
    const a = document.activeElement;
    if (st.pressing || el.root.querySelector('.vfield.drag') || (a && el.root.contains(a) && (a.tagName === 'SELECT' || a.tagName === 'INPUT'))) { st.pending = true; return; }
    st.pending = false;
    buildNow(); buildShelf(); buildDeck(); buildMaster();
    patch();
  }

  function patch() {
    if (!st.active || !S() || !el.now.firstChild) return; // (not built yet: render() comes first)
    patchNow(); patchShelf(); patchDeck(); patchBlackout();
    tick();
  }

  let timer = null;
  const playing = () => Object.values(M().layers || {}).concat(M().xlayer || []).some((e) => e?.play);
  function tick() {
    if (timer || !st.active || !playing()) return;
    timer = setInterval(() => {
      if (!st.active || !playing()) { clearInterval(timer); timer = null; return; }
      const now = clock.engineNow();
      paintNow(now); paintDeck(now);
    }, TICK_MS);
  }

  function setActive(on) {
    st.active = on;
    el.shield.hidden = !(on && st.locked);
    if (on) { st.keys = { now: '', shelf: '', deck: '', master: '' }; render(); }
  }

  on('state', () => render());
  on('media', () => { if (st.pending) render(); else patch(); });
  on('live', (m) => { if (m && Number.isFinite(m.t)) clock.sample(m.t); });
  addEventListener('focusout', () => setTimeout(() => { if (st.pending) render(); }, 0));
  setLocked(st.locked);

  const api = { el: el.root, lockBtn: el.lockBtn, setActive, render, patch, setLocked, get locked() { return st.locked; }, get view() { return st.view; }, setView, setDeck, clock };
  window.__vtLiveRemote = api; // debugging aid and the UI tests (tests/remote-live.test.mjs)
  return api;
}
