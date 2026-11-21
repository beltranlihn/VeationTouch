// Output › Screens: the Advanced Output (MEDIA-SERVER.md §5.2), modelled on Resolume's — under the Mapping, a deck with
//   left    the tree Screens ▸ Slices, + Screen, + Slice and the templates (Slices from walls, Datapath Fx4 (2×2) — 1:1
//           or Fit —, One display per wall)
//   centre  the stages, Input / Output / Split (stage.js): the canvas with the slices' inputs, the screen with their outputs
//   right   the inspector: X / Y / W / H of the stage in use, Rect / Corner pin / Grid, Flip H / V, and 1:1 pixels, Fit to
//           screen, Center, Match input to wall
// and a bar: where the room output goes (Screens / Spout / Single window), the test card, the Preview window.
// Arrows move the selected slice 1 px (Shift: 10 px) in the stage last used. Every edit is one profile edit (undo).
// The slices' geometry and templates are engine/media/screens.js (served as /shared/media/screens.js).

import { store, cmd, editProfile } from '../conn.js';
import { h, field, selectField, toggle, toast, confirmBox } from '../dom.js';
import * as V from '../views.js';
import { sliceInput, outputBounds, nudgeSlice, placeSlice, setOutputMode } from '/shared/media/screens.js';
import { createStage } from './stage.js';

const run = (p, ok) => p.then((r) => { if (ok) toast(ok, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state?.profile;
const live = (id) => store.state?.output?.screens?.list?.find((s) => s.id === id) || null;

/** The deck's state, shared with the stages. */
const A = {
  root: null, ctx: null, tab: 'output', lastStage: 'output', focus: false, hover: null, temp: null,
  sel: { screen: null, slice: null }, stages: {}, ul: null, ulUrl: null,
  P,
  screen() { const L = P()?.output?.screens || []; return L.find((s) => s.id === A.sel.screen) || L[0] || null; },
  slice() { const sc = A.screen(); return sc?.slices.find((x) => x.id === A.sel.slice) || null; },
  // (choosing a slice is the intent to work on it: the arrows go to it until a click elsewhere)
  select(screenId, sliceId) { A.sel = { screen: screenId, slice: sliceId }; A.temp = null; if (sliceId) A.focus = true; render(true); },
  /** One edit of the selected screen's slice `s` (whole), saved as one undo step. */
  commit(s, label) {
    const scId = A.screen()?.id;
    A.temp = null;
    editProfile((p) => {
      const sc = p.output.screens.find((x) => x.id === scId), i = sc?.slices.findIndex((x) => x.id === s.id) ?? -1;
      if (i >= 0) sc.slices[i] = s;
    }, label);
  },
  redraw(onlyStages = false) { for (const st of Object.values(A.stages)) st.draw(); if (!onlyStages) renderInspector(); },
  underlay() {
    const u = store.state?.underlay?.url;
    if (!u) return null;
    if (A.ulUrl !== u) { A.ulUrl = u; A.ul = null; const img = new Image(); img.onload = () => { if (A.ulUrl === u) { A.ul = img; A.redraw(true); } }; img.src = u; }
    return A.ul;
  },
};

const editScreen = (fn, label) => { const id = A.screen()?.id; return editProfile((p) => { const sc = p.output.screens.find((x) => x.id === id); if (sc) fn(sc, p); }, label); };
const nextId = (taken, prefix) => { let k = 1; while (taken.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };

// ------------------------------------------------------------------------------------------------ mount / render

/** Puts the deck under the Mapping (as Live puts its deck under the monitor), once. */
function mount(ctx) {
  A.ctx = ctx;
  if (A.root) return;
  const wrap = document.querySelector('main.stage .view-wrap');
  if (!wrap) return;
  A.bar = h('div', { class: 'ao-bar' });
  A.tree = h('div', { class: 'ao-tree' });
  A.tabs = h('div', { class: 'ao-tabs' });
  A.stageBox = h('div', { class: 'ao-stages' });
  A.insp = h('div', { class: 'ao-insp' });
  A.stages = { input: createStage('input', A), output: createStage('output', A) };
  for (const st of Object.values(A.stages)) A.stageBox.append(h('div', { class: 'ao-stage', 'data-stage': st.kind }, st.el));
  A.root = h('div', { class: 'ao-deck', id: 'aoDeck' }, A.bar, h('div', { class: 'ao-body' }, A.tree, h('div', { class: 'ao-centre' }, A.tabs, A.stageBox), A.insp));
  wrap.after(A.root);
  // the arrows move a slice only after the deck was used (the Mapping above keeps them otherwise)
  document.addEventListener('pointerdown', (e) => { A.focus = A.root.contains(e.target); }, true);
  A.root.addEventListener('focusout', () => setTimeout(() => render(), 0));
  new ResizeObserver(() => { for (const st of Object.values(A.stages)) st.resize(); }).observe(A.stageBox);
}

let pending = false;
function render(force = false) {
  if (!A.root || !P()) return;
  const a = document.activeElement;
  if (!force && a && A.root.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.classList.contains('vfield'))) { pending = true; return; }
  pending = false;
  const L = P().output.screens;
  if (A.sel.screen && !L.some((s) => s.id === A.sel.screen)) A.sel = { screen: null, slice: null };
  if (A.sel.slice && !A.slice()) A.sel.slice = null;
  if (A.stages.output.dragging() || A.stages.input.dragging()) return;
  renderBar(); renderTree(); renderTabs(); renderInspector();
  for (const st of Object.values(A.stages)) st.resize();
}
void pending;

function renderBar() {
  const O = P().output, S = store.state, locked = !!S.locked;
  const L = S.output?.screens;
  const conn = (L?.list || []).filter((s) => s.enabled);
  const status = O.sink !== 'screens' ? h('span', { class: 'muted' }, O.sink === 'spout' ? `The room goes to Spout "${O.senderName}" — the screens are ready for when you switch` : 'The room goes to a single window — switch to Screens to use these')
    : !conn.length ? h('span', { class: 'ao-warn' }, 'No screen yet')
      : h('span', { class: 'ao-st' }, conn.map((s) => h('span', { class: 'ao-chip' }, h('span', { class: `dot ${s.connected ? (O.on ? 'live' : 'ok') : 'bad'}` }), `${s.name} ${s.connected ? (s.label ? `· ${s.label}` : '· connected') : '· not connected'}`)));
  A.bar.replaceChildren(
    h('span', { class: 'ao-title' }, 'Advanced Output'),
    h('div', { class: 'seg', 'data-ao': 'dest', title: 'Where the room output goes' }, V.OUTPUT_DESTINATIONS.map(([m, t, tip]) =>
      h('button', { class: O.sink === m ? 'on' : '', title: tip, disabled: locked, onclick: () => run(cmd('output.set', { sink: m })) }, t))),
    h('button', { class: `btn small${S.output?.testCard ? ' on' : ''}`, 'data-ao': 'card', title: 'Border, diagonals, name and resolution, the slices and colour bars on every screen — checks the cable and the Fx4, not the content. Not saved.', onclick: () => run(cmd('output.testCard', { on: !S.output?.testCard })) }, 'Test card'),
    h('button', { class: 'btn small', 'data-ao': 'preview', title: 'The screens\' composition at scale in a window — on a laptop without the room\'s displays', onclick: openPreview }, 'Preview window'),
    h('span', { class: 'ao-sp' }),
    status);
}

/** The room output page in preview mode (app/main.js opens it in a window of the app; a browser opens a tab). */
function openPreview() {
  const S = store.state;
  if (!S.output?.running) toast('The room output is off: the preview shows the screens on black until you switch it on', 'warn');
  window.open(`/output?run=1&screens=preview${S.local ? '' : `&k=${encodeURIComponent(S.token || '')}`}`, 'vt-screens-preview', 'width=1280,height=820');
}

function renderTree() {
  const prof = P(), L = prof.output.screens, sc = A.screen(), locked = !!store.state.locked;
  const rows = [];
  for (const s of L) {
    const lv = live(s.id), on = sc?.id === s.id && !A.sel.slice;
    rows.push(h('button', { class: `ao-row ao-scr${on ? ' sel' : ''}${s.enabled ? '' : ' off'}`, 'data-screen': s.id, onclick: () => A.select(s.id, null) },
      h('span', { class: `dot ${lv?.connected ? 'ok' : prof.output.sink === 'screens' && s.enabled ? 'bad' : ''}`, title: lv?.connected ? `Connected: ${lv.label || 'display'}` : 'Not connected' }),
      h('span', { class: 't' }, s.name), h('small', { class: 'tnum' }, `${s.width}×${s.height}`)));
    for (const x of s.slices) {
      rows.push(h('button', { class: `ao-row ao-sl${A.sel.slice === x.id && sc?.id === s.id ? ' sel' : ''}${x.enabled ? '' : ' off'}${A.hover === x.id ? ' hov' : ''}`, 'data-slice': x.id,
        onclick: () => A.select(s.id, x.id), onpointerenter: () => { A.hover = x.id; A.redraw(true); }, onpointerleave: () => { A.hover = null; A.redraw(true); } },
      h('span', { class: 't' }, x.name), h('small', {}, x.wallId ? (x.input ? `${x.wallId} · own input` : x.wallId) : 'canvas')));
    }
  }
  A.tree.replaceChildren(
    h('div', { class: 'ao-th' }, h('span', {}, 'Screens'),
      h('button', { class: 'ibtn', disabled: locked || L.length >= 8, title: 'A new screen (one physical output)', onclick: addScreen }, '+ Screen'),
      h('button', { class: 'ibtn', disabled: locked || !sc, title: 'A new slice in the selected screen', onclick: addSlice }, '+ Slice')),
    h('div', { class: 'ao-list' }, rows.length ? rows : h('p', { class: 'muted ao-empty' }, 'No screen. Start from a template.')),
    h('div', { class: 'ao-th' }, h('span', {}, 'Templates')),
    h('div', { class: 'ao-tpl' },
      tplBtn('Datapath Fx4 (2×2)', 'One 3840×2400 screen; the walls in canvas order in the four 1920×1200 quadrants, 1:1 and centred', { template: 'fx4' }),
      tplBtn('Datapath Fx4 · Fit', 'The same, each wall as large as its quadrant allows', { template: 'fx4', fit: true }),
      tplBtn('Slices from walls', sc ? `One slice per wall where it is on the canvas, into "${sc.name}"` : 'A screen the size of the canvas with one slice per wall', { template: 'walls', screenId: sc?.id ?? null }),
      tplBtn('One display per wall', 'A screen per wall (one output per projector), each on a display', { template: 'per-wall' })));
  for (const b of A.tree.querySelectorAll('.ao-tpl button')) b.disabled = locked;
}

function tplBtn(label, tip, args) {
  return h('button', { class: 'btn small', title: tip, onclick: async () => {
    const n = P().output.screens.length;
    if (n && args.template !== 'walls' && !(await confirmBox(`Replace the ${n} screen${n === 1 ? '' : 's'} with “${label}”? (Ctrl+Z does not undo a template: it is saved at once.)`, 'Replace'))) return;
    const r = await run(cmd('output.screens', args), `${label}: done`);
    const first = P().output.screens.find((s) => s.id === args.screenId) || P().output.screens[0];
    if (r && first) A.select(first.id, null);
  } }, label);
}

function addScreen() {
  const L = P().output.screens, used = new Set((store.state.output?.screens?.list || []).map((s) => s.displayId).filter((x) => x != null));
  const d = (store.state.displays || []).filter((x) => !used.has(x.id)).sort((a, b) => Number(a.primary) - Number(b.primary))[0];
  const id = nextId(new Set(L.map((s) => s.id)), 'SC');
  editProfile((p) => { p.output.screens.push({ id, name: `Screen ${L.length + 1}`, enabled: true, width: d?.width || 1920, height: d?.height || 1080, display: null, slices: [] }); }, 'add screen')
    .then(() => A.select(id, null));
}

function addSlice() {
  const prof = P(), sc = A.screen();
  if (!sc) return;
  const id = nextId(new Set(prof.output.screens.flatMap((s) => s.slices.map((x) => x.id))), 'SL');
  const wall = prof.walls.find((w) => !sc.slices.some((x) => x.wallId === w.id));
  const base = { id, name: wall?.id || `Slice ${sc.slices.length + 1}`, wallId: wall?.id || null, enabled: true, input: null, output: { mode: 'rect', rect: { x: 0, y: 0, w: sc.width, h: sc.height } }, flipH: false, flipV: false };
  const s = placeSlice(base, wall ? '1:1' : 'fit', sc, prof);
  if (wall) Object.assign(s, placeSlice(s, 'center', sc, prof));
  editScreen((x) => { x.slices.push(s); }, 'add slice').then(() => A.select(sc.id, id));
}

function renderTabs() {
  A.tabs.replaceChildren(h('div', { class: 'seg' }, [['input', 'Input'], ['output', 'Output'], ['split', 'Split']].map(([m, t]) =>
    h('button', { class: A.tab === m ? 'on' : '', 'data-tab': m, title: { input: 'The canvas: what each slice takes', output: 'The screen: where each slice goes', split: 'Both at once' }[m],
      onclick: () => { A.tab = m; if (m !== 'split') A.lastStage = m; render(true); } }, t))),
  h('span', { class: 'muted ao-hint' }, 'Drag a slice · its corners to resize · Alt: no snapping · arrows 1 px, Shift 10 px'));
  A.stageBox.dataset.tab = A.tab;
}

// ------------------------------------------------------------------------------------------------ inspector

function renderInspector() {
  if (!A.insp) return;
  const prof = P(), sc = A.screen(), sl = A.slice(), locked = !!store.state.locked;
  if (!sc) { A.insp.replaceChildren(h('p', { class: 'muted' }, 'A screen is one physical output. Start with “Datapath Fx4 (2×2)” for the 3840×2400 splitter.')); return; }
  const out = [];
  if (!sl) {
    const lv = live(sc.id), ds = store.state.displays || [];
    out.push(h('div', { class: 'ao-ih' }, 'Screen'),
      field('Name', sc.name, (v) => editScreen((x) => { x.name = String(v).trim() || x.name; }, 'rename screen')),
      h('div', { class: 'grid2' },
        field('Width', sc.width, (v) => editScreen((x) => { x.width = Math.round(v); }, 'screen size'), { inline: true, step: 1 }),
        field('Height', sc.height, (v) => editScreen((x) => { x.height = Math.round(v); }, 'screen size'), { inline: true, step: 1 })),
      ds.length
        ? selectField('Display', sc.display?.id ?? '', [['', `Auto — the display at ${sc.width}×${sc.height}`], ...ds.map((d) => [d.id, `${d.label} · ${d.width}×${d.height}${d.primary ? ' (primary)' : ''}`])],
          (v) => editScreen((x) => { const d = ds.find((q) => String(q.id) === String(v)); x.display = d ? { id: d.id, x: d.bounds?.x ?? null, y: d.bounds?.y ?? null, width: d.width, height: d.height, label: d.label || '' } : null; }, 'screen display'))
        : h('p', { class: 'muted' }, 'The desktop app lists the displays here. Without one (a laptop, a browser), use the Preview window.'),
      h('p', { class: lv?.connected ? 'muted' : 'ao-warn' }, lv?.connected ? `Connected: ${lv.label || 'display'} (${lv.size?.join('×')})` : `Not connected${sc.display ? ` — looking for ${sc.display.label || 'its display'} (${sc.display.width}×${sc.display.height})` : ` — no display at ${sc.width}×${sc.height}`}`),
      toggle('Enabled', sc.enabled, (on) => editScreen((x) => { x.enabled = on; }, 'screen on/off')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: async () => {
        if (!(await confirmBox(`Delete the screen “${sc.name}” and its ${sc.slices.length} slice${sc.slices.length === 1 ? '' : 's'}?`, 'Delete', true))) return;
        editProfile((p) => { p.output.screens = p.output.screens.filter((x) => x.id !== sc.id); }, 'delete screen');
      } }, 'Delete screen')));
  } else {
    const stage = A.tab === 'split' ? A.lastStage : A.tab;
    const set = (fn, label) => { const s = structuredClone(sl); fn(s); A.commit(s, label); };
    const inp = sliceInput(sl, prof), ob = outputBounds(sl.output);
    const box = stage === 'input' ? inp : ob;
    const numEdit = (k, v) => set((s) => {
      v = Math.round(v);
      if (stage === 'input') { s.input = { ...inp, [k]: v }; return; }
      if (s.output.mode === 'rect') { s.output.rect[k] = v; return; }
      if (k === 'x' || k === 'y') Object.assign(s, nudgeSlice(s, 'output', k === 'x' ? v - ob.x : 0, k === 'y' ? v - ob.y : 0, prof));
    }, stage === 'input' ? 'slice input' : 'slice output');
    const nums = ['x', 'y', 'w', 'h'].map((k) => {
      const f = field(k.toUpperCase(), Math.round(box[k]), (v) => numEdit(k, v), { inline: true, step: 1 });
      if (stage === 'output' && sl.output.mode !== 'rect' && (k === 'w' || k === 'h')) f.querySelector('input').readOnly = true;
      return f;
    });
    out.push(h('div', { class: 'ao-ih' }, 'Slice'),
      field('Name', sl.name, (v) => set((s) => { s.name = String(v).trim() || s.name; }, 'rename slice')),
      selectField('Wall', sl.wallId ?? '', [['', 'None (its own input)'], ...prof.walls.map((w) => [w.id, `${w.id} · ${w.name}`])], (v) => set((s) => { s.wallId = v || null; if (!v && !s.input) s.input = { ...inp }; }, 'slice wall')),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Numbers of'), h('div', { class: 'seg' }, [['input', 'Input'], ['output', 'Output']].map(([m, t]) =>
        h('button', { class: stage === m ? 'on' : '', onclick: () => { A.lastStage = m; if (A.tab !== 'split') A.tab = m; render(true); } }, t)))),
      h('div', { class: 'grid4 ao-nums', 'data-stage': stage }, ...nums),
      h('p', { class: 'muted ao-note' }, stage === 'input' ? (sl.input ? 'Its own rectangle of the canvas.' : `Follows ${sl.wallId}'s region of the canvas.`) : `${sc.name}: ${sc.width}×${sc.height} px.`),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Mode'), h('div', { class: 'seg', 'data-ao': 'mode' }, [['rect', 'Rect'], ['corners', 'Corner pin'], ['grid', 'Grid']].map(([m, t]) =>
        h('button', { class: sl.output.mode === m ? 'on' : '', onclick: () => set((s) => { Object.assign(s, setOutputMode(s, m)); }, { rect: 'slice rect', corners: 'slice corner pin', grid: 'slice grid' }[m]) }, t)))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Flip'), h('div', { class: 'seg', 'data-ao': 'flip' },
        h('button', { class: sl.flipH ? 'on' : '', onclick: () => set((s) => { s.flipH = !s.flipH; }, 'flip H') }, 'Flip H'),
        h('button', { class: sl.flipV ? 'on' : '', onclick: () => set((s) => { s.flipV = !s.flipV; }, 'flip V') }, 'Flip V'))),
      h('div', { class: 'ao-acts' },
        act('1:1 pixels', 'A rectangle the size of its input, same centre', () => set((s) => Object.assign(s, placeSlice(s, '1:1', sc, prof)), '1:1 pixels')),
        act('Fit to screen', 'Its proportions, as large as the screen allows, centred', () => set((s) => Object.assign(s, placeSlice(s, 'fit', sc, prof)), 'fit to screen')),
        act('Center', 'Centred in the screen', () => set((s) => Object.assign(s, placeSlice(s, 'center', sc, prof)), 'center')),
        act('Match input to wall', sl.wallId ? `Back to ${sl.wallId}'s region of the canvas` : 'Choose its wall first', () => set((s) => Object.assign(s, placeSlice(s, 'match', sc, prof)), 'match input to wall'), !sl.wallId || !sl.input)),
      toggle('Enabled', sl.enabled, (on) => set((s) => { s.enabled = on; }, 'slice on/off')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => {
        editScreen((x) => { x.slices = x.slices.filter((q) => q.id !== sl.id); }, 'delete slice').then(() => A.select(sc.id, null));
      } }, 'Delete slice')));
  }
  A.insp.replaceChildren(...out);
  if (locked) for (const el of A.insp.querySelectorAll('button, select, input')) el.disabled = true;
}

const act = (label, tip, fn, disabled = false) => h('button', { class: 'btn small', title: tip, disabled, onclick: fn }, label);

// ------------------------------------------------------------------------------------------------ public

/** Arrow keys (app.js): the selected slice by 1 px (Shift: 10) in the stage last used — when the deck was used last. */
export function nudge(dx, dy, big) {
  const sl = A.slice();
  if (!A.root || !A.focus || !sl || store.state?.locked) return false;
  const k = big ? 10 : 1, stage = A.tab === 'split' ? A.lastStage : A.tab;
  A.commit(nudgeSlice(sl, stage, dx * k, dy * k, P()), stage === 'input' ? 'nudge slice input' : 'nudge slice');
  return true;
}

/** The deck, mounted the first time Output › Screens opens and refreshed with every state. */
export function deck(ctx) {
  mount(ctx);
  render();
  return [];
}

// tests: the deck's state
window.__ao = { A, render, nudge };

// Problems (top bar, Status): a screen that is not connected, a non-contiguous span… (engine/media/screens.js › screensLayout)
V.problemSources.push((ctx) => (store.state?.output?.screens?.problems || []).map(([k, t]) => [k, t, h('button', { class: 'btn small', onclick: () => ctx.go('mapping') }, 'Open Screens')]));
