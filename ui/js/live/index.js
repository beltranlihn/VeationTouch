// Live — the room running (MEDIA-SERVER.md §4b.3, §4b.4). One screen, no sub-tabs; where a room that is set up opens.
//   Stage, top to bottom:
//     the room monitor   the workspace's 'live' mode (2D strip / 3D / Inside, the touches); while clips are on air it
//                        shows the room's real output (the preview the desktop app captures), otherwise the experience
//                        simulated on the walls. System & Calibration › Status shares the same monitor.
//     the shelf          the experience cards (shelf.js): click the picture = load it, click the name = select it
//     the clip grid      decks, columns, the layer strip and the read-only "Experience clips" row (grid.js, layers.js)
//     the library        the drawer with the copies in progress, the files of the show, master and mute (library.js)
//   Panel: the inspector of what is selected (inspector.js); with nothing selected, the live card.
//   Drag and drop (dnd.js): files from the explorer onto a cell, a layer or the drawer; clips within the grid.
// The engine decides and the pages draw: a launch is a command, and where a clip is comes from its play and the
// engine's clock (the live feed's t, ui/js/clock.js) — nothing here asks the engine for a position.
// Views return the DOM of the right-hand panel (see views.js); app.js routes the view id 'live' here.

import { store, on, cmd } from '../conn.js';
import { h, toast } from '../dom.js';
import * as V from '../views.js';
import { makeClock } from '../clock.js';
import { createShelf } from './shelf.js';
import { createGrid } from './grid.js';
import { createLibrary, missingProblems } from './library.js';
import { createDnd } from './dnd.js';
import { inspector, inspectorKey } from './inspector.js';

const clone = (o) => structuredClone(o);
const UNDO_MAX = 60;
const ACTIVE_COPY = new Set(['queued', 'copying']);

/** A show with no file yet: what the grid shows before the first drop (the engine's blankShow has the same ids). */
const BLANK = Object.freeze({
  id: null, name: null, media: [], clips: [], presets: [],
  layers: [1, 2, 3].map((k) => ({ id: `L${k}`, name: `Layer ${k}`, opacity: 1, blend: 'normal', bypass: false, transitionMs: 500, end: 'loop', trigger: 'restart', ignoreColumn: false, audio: { volume: 1, mute: false, route: null } })),
  decks: [{ id: 'D1', name: 'Main', columns: 8, cells: {} }],
});

/**
 * The Live screen's own state, shared with its parts (each part gets this object: no import cycles).
 * Selection kinds: {kind:'cell', layerId, column} · {kind:'layer', layerId} · {kind:'xlayer'} · {kind:'preset', id} ·
 * {kind:'experience', id} · {kind:'none'} · {kind:'media', mediaId} — null = the live card.
 */
export const L = {
  ctx: null,
  root: null,
  clock: makeClock(),
  sel: null,
  deckId: null,
  drawer: false,
  undoStack: [],
  cardThumbs: new Map(),      // card key → data URL of the output the last time that card was live (this session)
  drag: null,                 // an internal drag: {kind:'clip', layerId, column, clipId} | {kind:'media', mediaId}
  S: () => store.state,
  show: () => store.state?.show || null,
  /** The show, or the blank one the grid shows before there is a file. */
  view: () => store.state?.show || BLANK,
  media: () => store.state?.media || {},
  locked: () => !!store.state?.locked,
  /** Engine time now (ms), or null before the first live message. */
  now: () => L.clock.engineNow(),
};
if (typeof window !== 'undefined') window.__vtLive = L; // debugging aid and the UI tests (tests/live-ui.test.mjs)

// ------------------------------------------------------------------ reading the state

/** The visible deck (remembered per show on this device). */
L.deck = () => {
  const s = L.view();
  return s.decks.find((d) => d.id === L.deckId) || s.decks[0];
};
L.setDeck = (id) => {
  L.deckId = id;
  try { if (L.show()) localStorage.setItem(`vt-live-deck-${L.show().id}`, id); } catch { /* storage blocked */ }
  L.refresh(true);
};
L.clip = (id) => L.view().clips.find((c) => c.id === id) || null;
L.mediaOf = (clip) => (clip ? L.view().media.find((m) => m.id === clip.mediaId) || null : null);
L.layer = (id) => L.view().layers.find((l) => l.id === id) || null;
L.clipAt = (deck, layerId, column) => L.clip(deck.cells[`${layerId}:${column}`]);
/** The transport entry of a layer (state.media.layers / xlayer). */
L.entry = (layerId) => (layerId === 'xlayer' ? L.media().xlayer : L.media().layers?.[layerId]) || null;
/** Something is on a layer of the grid or the experience's (playing, held or fading out). */
L.onAir = () => Object.values(L.media().layers || {}).concat(L.media().xlayer || []).some((e) => e && (e.play || e.from));

/** How a medium of the show is: copying / problem (copy interrupted or failed) / missing / ready, with the words. */
L.status = (mediaId) => {
  const M = L.media(), show = L.show();
  if (!show) return { kind: 'ready', text: 'Ready' };
  const job = (M.import || []).find((j) => j.mediaId === mediaId && j.showId === show.id && j.kind !== 'export' && j.state !== 'done' && j.state !== 'cancelled');
  if (job && ACTIVE_COPY.has(job.state)) {
    const pct = job.total ? Math.floor((job.done / job.total) * 100) : 0;
    return { kind: 'copying', job, pct, text: job.state === 'queued' ? 'Waiting to be copied into the library' : `Copying into the library — ${pct} %` };
  }
  if (job) return { kind: 'problem', job, text: (M.problems || []).find((p) => p.importId === job.id)?.text || job.error || 'The copy did not finish.' };
  const p = (M.problems || []).find((x) => x.mediaId === mediaId);
  if (p) return { kind: p.kind === 'missing-media' ? 'missing' : 'problem', text: p.text, fix: p.fix };
  return { kind: 'ready', text: 'Ready' };
};

/** What is live on the shelf: {kind:'preset', id} | {kind:'experience', id} | {kind:'none'}, with the preset's state. */
L.liveCard = () => {
  const S = store.state, P = L.media().preset, show = L.show();
  if (P?.id && show?.presets.some((p) => p.id === P.id)) return { kind: 'preset', id: P.id, state: P.state, error: P.error };
  if (P?.experienceId) return { kind: 'experience', id: P.experienceId, state: P.state, error: P.error };
  if (S?.experience?.running && S.experience.id) return { kind: 'experience', id: S.experience.id, state: 'live', error: S.experience.error };
  return { kind: 'none', state: 'live' };
};

/** The card the inspector shows when nothing is selected: the live one, or the room's experience. */
L.defaultSel = () => {
  const c = L.liveCard();
  if (c.kind !== 'none') return { kind: c.kind, id: c.id };
  const id = store.state?.profile?.experience?.id, show = L.show();
  const p = show?.presets.find((x) => x.experienceId === id);
  if (p) return { kind: 'preset', id: p.id };
  if (id && (store.state?.experiences || []).some((e) => e.id === id)) return { kind: 'experience', id };
  return { kind: 'none' };
};

/** A thumbnail of a medium (the URL carries its fingerprint: cached for good). */
L.thumbUrl = (m, size = 160) => {
  if (!m) return '';
  const S = store.state;
  return `/api/media/thumb/${encodeURIComponent(m.id)}.png?s=${size}&v=${m.fingerprint || ''}${S?.local ? '' : `&k=${encodeURIComponent(S?.token || '')}`}`;
};

// ------------------------------------------------------------------ doing things

/** A command; its error is a toast. Resolves with the result, or null. */
L.run = (p, okMsg) => p.then((r) => { if (okMsg) toast(okMsg, 'ok'); return r; }).catch((e) => { toast(e.message, 'bad'); return null; });

L.select = (sel) => {
  L.sel = sel;
  L.shelf?.patch(); L.grid?.patch(); L.lib?.patch();
  L.ctx?.rerender();
};
L.isSel = (kind, a, b) => {
  const s = L.sel || L.defaultSel();
  if (!s || s.kind !== kind) return false;
  if (kind === 'cell') return s.layerId === a && s.column === b;
  if (kind === 'layer') return s.layerId === a;
  if (kind === 'media') return s.mediaId === a;
  if (kind === 'preset' || kind === 'experience') return s.id === a;
  return true;
};

/** Mix values at most ~15 times a second while a fader moves (the last one always goes out). */
L.throttle = (send) => {
  let last = 0, timer = null, latest = null;
  const go = () => { timer = null; last = performance.now(); send(latest); };
  return (v) => { latest = v; if (timer) return; const wait = 66 - (performance.now() - last); if (wait <= 0) go(); else timer = setTimeout(go, wait); };
};

let editChain = Promise.resolve();
/**
 * Edits the open show: `mutate(copy)` on the latest show the engine confirmed, sent with its revision (show.update; an
 * edit made from a show that changed meanwhile is refused). Edits run one after another, so quick ones never race.
 * Each one can be undone (Ctrl+Z in Live). `mutate` returning false sends nothing.
 */
L.editShow = (mutate, label = 'edit') => {
  if (L.locked()) { toast('Show mode: unlock the room to edit the show.', 'bad'); return Promise.resolve(null); }
  const run = editChain.then(async () => {
    const cur = store.state?.show;
    if (!cur) throw new Error('There is no show yet: drop a clip on the grid to start one.');
    const next = clone(cur); delete next.rev;
    if (mutate(next) === false) return null;
    const before = clone(cur); delete before.rev;
    const res = await cmd('show.update', { show: next, rev: cur.rev });
    L.undoStack.push({ label, showId: cur.id, show: before });
    if (L.undoStack.length > UNDO_MAX) L.undoStack.shift();
    return res;
  });
  editChain = run.catch(() => {});
  return run.catch((e) => { toast(e.message, 'bad'); return null; });
};

/**
 * Ctrl+Z: the show as it was before the last edit made here. Launches are not edits; and what was moved live since
 * stays where it is (a layer's opacity and volume, a card's parameters) — an undo never jumps the room's image.
 */
L.undo = () => {
  const u = L.undoStack.pop();
  const cur = store.state?.show;
  if (!u || !cur || cur.id !== u.showId) { L.undoStack.length = 0; return false; }
  const back = clone(u.show);
  for (const l of back.layers) {
    const now = cur.layers.find((x) => x.id === l.id);
    if (now) Object.assign(l, { opacity: now.opacity, blend: now.blend, bypass: now.bypass, audio: { ...l.audio, volume: now.audio.volume, mute: now.audio.mute } });
  }
  for (const p of back.presets) {
    const now = cur.presets.find((x) => x.id === p.id);
    if (now && now.experienceId === p.experienceId) p.params = { ...now.params };
    if (now?.sound && p.sound?.id === now.sound.id) p.sound.params = { ...now.sound.params };
  }
  const run = editChain.then(() => cmd('show.update', { show: back, rev: store.state.show.rev }));
  editChain = run.catch(() => {});
  run.then(() => toast(`Undone: ${u.label}`), (e) => toast(e.message, 'bad'));
  return true;
};

// ------------------------------------------------------------------ the screen

/** Puts the deck (shelf, grid, drawer) under the monitor, once, the first time Live opens. */
function mount(ctx) {
  L.ctx = ctx;
  if (L.root) return;
  const wrap = document.querySelector('main.stage .view-wrap');
  if (!wrap) return;
  L.root = h('div', { class: 'live-deck', id: 'liveDeck' });
  L.shelf = createShelf(L);
  L.grid = createGrid(L);
  L.lib = createLibrary(L);
  L.root.append(L.shelf.el, L.grid.el, L.lib.el);
  wrap.after(L.root);
  L.dnd = createDnd(L, L.root);
  // the monitor says so while the room is blacked out (amber: attention)
  L.blackoutCaption = h('div', { class: 'lv-bo-caption', hidden: true }, 'Blackout — the room is dark');
  wrap.append(L.blackoutCaption);
  // a part rebuilt under a fader being dragged or a field being typed in waits for the gesture to end
  L.root.addEventListener('faderend', () => setTimeout(() => L.refresh(), 0));
  L.root.addEventListener('focusout', () => setTimeout(() => L.refresh(), 0));
  new ResizeObserver(() => L.grid.resize()).observe(L.grid.el);
}

let pendingRefresh = false;
/** Rebuilds what changed (each part keeps a key of what it shows) and patches what plays. */
L.refresh = (force = false) => {
  if (!L.root || !store.state) return;
  const show = L.show();
  if (show && L.undoStack.length && L.undoStack[0].showId !== show.id) L.undoStack.length = 0;
  if (show && L.deckId === null) { try { L.deckId = localStorage.getItem(`vt-live-deck-${show.id}`); } catch { /* storage blocked */ } }
  if (L.deckId && !L.view().decks.some((d) => d.id === L.deckId)) L.deckId = null;
  const a = document.activeElement;
  const busy = L.root.querySelector('.vfield.drag') || (a && L.root.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.classList.contains('vfield')));
  if (busy) { pendingRefresh = true; return; }
  pendingRefresh = false;
  L.shelf.render(force); L.grid.render(force); L.lib.render(force);
  L.patch();
};

/** What plays, what copies, what is selected: classes and texts, no rebuild. Then the indicators. */
L.patch = () => {
  if (!L.root) return;
  L.shelf.patch(); L.grid.patch(); L.lib.patch();
  paintTop();
  L.paint();
  loop();
};

/** The play indicators (ring, bar, time left) and the copy bars, from the engine's clock. */
L.paint = () => {
  if (!L.root) return;
  const now = L.now();
  L.grid.paint(now);
  L.lib.paint(now);
};

let looping = false;
function loop() {
  if (looping || !L.root) return;
  const busy = () => L.ctx?.view === 'live' && (L.onAir() || (L.media().import || []).some((j) => ACTIVE_COPY.has(j.state)));
  if (!busy()) return;
  looping = true;
  const step = () => {
    if (!busy()) { looping = false; return; }
    L.paint();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ the top bar: Blackout

const blackoutBtn = h('button', {
  class: 'btn', id: 'blackoutBtn', 'aria-pressed': 'false',
  title: 'Blackout: fade the room to black and silence the clips. Click again to bring it back.',
  onclick: () => L.run(cmd('media.blackout', { on: !L.media().blackout })),
}, 'Blackout');
document.getElementById('lockBtn')?.before(blackoutBtn);

function paintTop() {
  const on = !!L.media().blackout;
  blackoutBtn.classList.toggle('on', on);
  blackoutBtn.setAttribute('aria-pressed', String(on));
  blackoutBtn.textContent = on ? 'Blackout · on' : 'Blackout';
  if (L.blackoutCaption) L.blackoutCaption.hidden = !on;
}

// ------------------------------------------------------------------ Problems: missing media, copies that stopped

V.problemSources.push(() => missingProblems(L));

// ------------------------------------------------------------------ the monitor: the room's real output while clips are on air

// 4 frames a second on the room's computer (the engine keeps the last one in memory), 1 from another device
let pv = null;
function pollPreview() {
  const ws = L.ctx?.ws, S = store.state;
  const next = () => setTimeout(pollPreview, S?.local === false ? 1000 : 250);
  if (!ws) return next();
  const want = L.ctx.view === 'live' && !!S?.output?.running && !!S.output.previewAt;
  if (!want) { ws.monitorFrame = null; return next(); }
  const img = new Image();
  img.onload = () => { pv = img; ws.monitorFrame = L.onAir() ? img : null; L.shelf?.snapshot(img); next(); };
  img.onerror = () => next();
  img.src = `/api/experience/preview.jpg?t=${Date.now()}${S.local ? '' : `&k=${encodeURIComponent(S.token || '')}`}`;
}
pollPreview();
L.preview = () => pv;

// ------------------------------------------------------------------ keyboard (Live only)
// 1 · 2 · 3 stay the sections (app.js). ← / → the previous / next column of the deck in view; Delete ejects the selected
// layer (the layer of the selected clip); Ctrl+Z undoes the last show edit made here (launches are not undone). No
// number keys for columns and no single-key blackout: an accident in a room full of people is not worth a shortcut.

addEventListener('keydown', (e) => {
  if (L.ctx?.view !== 'live' || !store.state) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest?.('.vfield, .vbox'))) return;
  if (!document.getElementById('overlay')?.hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (!mod && !e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    if (!L.show()) return;
    stop();
    L.run(cmd('column.next', { dir: e.key === 'ArrowRight' ? 1 : -1, deckId: L.deck().id }));
    return;
  }
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
    const s = L.sel;
    const layerId = s?.kind === 'cell' || s?.kind === 'layer' ? s.layerId : s?.kind === 'xlayer' ? 'xlayer' : null;
    if (!layerId || !L.show()) return;
    stop();
    L.run(cmd('layer.clear', { layerId }));
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && L.undoStack.length && !L.locked()) { stop(); L.undo(); return; }
  if (e.key === 'Escape' && L.sel) L.select(null); // (app.js clears its own selection too)
}, true);

// ------------------------------------------------------------------ store events

let inspKey = '';
on('state', () => { paintTop(); });
on('media', () => {
  if (!L.root) { paintTop(); return; }
  L.patch();
  L.ctx?.renderProblems?.();
  // the inspector follows what it shows (a copy that ends, a clip that starts) without rebuilding at every message
  const k = inspectorKey(L);
  if (k !== inspKey && L.ctx?.view === 'live') { inspKey = k; L.ctx.rerender(); }
});
on('live', (m) => { if (m && Number.isFinite(m.t)) L.clock.sample(m.t); });

// ------------------------------------------------------------------ the view

/** The panel of Live: the inspector. The deck under the monitor is mounted (once) and brought up to date. */
export function live(ctx) {
  mount(ctx);
  if (pendingRefresh) setTimeout(() => L.refresh(), 0);
  L.refresh();
  inspKey = inspectorKey(L);
  return inspector(L);
}

/** View id → panel builder, merged into app.js's router. */
export const views = { live };
