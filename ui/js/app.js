// VEATION Touch — operator UI (desktop window and phones/tablets on the LAN).
// Three sections in the rail — Live · Output · System & Calibration — each with its sub-tabs (index.html › #subnav).
// A sub-tab is a view: it turns the central canvas into its own workspace (see workspace.js), and the right panel is
// the inspector of what is selected there.

import { store, on, connect, cmd, editProfile, setViz, isCoarse, undo, redo, history, otherControl, editBlocked } from './conn.js';
import { h, toast, confirmBox, modal } from './dom.js';
import { Workspace } from './workspace.js';
import * as expview from './expview.js';
import { Room3D } from './room3d.js';
import { withGeom, geomOf, translateGeom, boundsOfGeom } from './shapes.js';
import * as V from './views.js';
import * as LiveView from './live/index.js';
import * as OutputView from './outputview/index.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel');
const app = $('app');

/** Virtual hands → simulated sensors (moves throttled to ~30 Hz). Shared by the 2D and the 3D view. */
const handHook = (() => {
  let last = 0;
  return (wallId, x, y, phase, id) => {
    const now = performance.now();
    if (phase === 'move' && now - last < 30) return;
    last = now;
    cmd('sim.touch', { wallId, x, y, id, down: phase !== 'up' }).catch(() => {});
  };
})();

const ctx = {
  view: 'live',
  section: 'live',
  live3d: (() => { try { return localStorage.getItem('vt-live-3d') === '1'; } catch { return false; } })(),
  sel: null,
  calibWall: null,
  calibFocus: false,
  calibOpt: { cols: 3, rows: 3, top: 1.9, bottom: 0.45, holdMs: 700 },
  select(kind, id, wallId) {
    const P = store.state?.profile;
    if (kind && !wallId) wallId = kind === 'wall' ? id : (kind === 'sensor' ? P?.sensors.find((s) => s.id === id)?.wallId : kind === 'zone' ? P?.zones.find((z) => z.id === id)?.wallId : undefined);
    ctx.sel = kind ? { kind, id, wallId } : null;
    ws.selection = ctx.sel;
    ws.vertex = null;
    // a canvas zone is edited on the output canvas, everything else on its wall
    if (ctx.view === 'zones' && (kind === 'zone' || kind === 'mask')) ws.setZoneSpace(kind === 'zone' && P?.zones.find((z) => z.id === id)?.space === 'canvas' ? 'canvas' : 'wall');
    if (wallId && ws.focus && ws.focus !== wallId && ws.space === 'wall') ws.setFocus(wallId);
    render(); renderBar(); hint();
  },
  go(view) { setView(view); },
  goSection(section) { goSection(section); },
  rerender: () => { render(); renderBar(); },
};

const ws = new Workspace($('roomCanvas'), {
  edit: (mutate, label) => {
    const why = editBlocked();
    if (why) { toast(why, 'bad'); return Promise.resolve(); }
    return editProfile(mutate, label).catch((e) => toast(e.message, 'bad'));
  },
  pick: (sel) => {
    ctx.sel = sel;
    if (sel?.kind === 'wall' && ctx.view === 'calibrate') ctx.calibWall = sel.id;
    render(); renderBar();
  },
  hand: handHook,
  draw: (kind, { space, wallId, geom }) => {
    const P = store.state.profile;
    const why = editBlocked();
    if (why) { toast(why, 'bad'); return; }
    if (kind === 'mask') {
      const w = P.walls.find((q) => q.id === wallId);
      let k = w.masks.length + 1; while (w.masks.some((m) => m.id === `M${k}`)) k++;
      const id = `M${k}`;
      editProfile((Q) => { Q.walls.find((q) => q.id === wallId).masks.push(withGeom({ id, name: `Mask ${k}` }, geom, false)); }, 'add mask');
      ws.tool = 'select';
      setTimeout(() => ctx.select('mask', id, wallId));
    } else {
      let k = P.zones.length + 1; while (P.zones.some((z) => z.id === `Z${k}`)) k++;
      const id = `Z${k}`;
      const zone = withGeom({ id, name: `Zone ${k}`, space, wallId: space === 'canvas' ? null : wallId, holdMs: 1000, releaseMs: 150, minHands: 1 }, geom, true);
      editProfile((Q) => { Q.zones.push(zone); }, 'add zone');
      ws.tool = 'select';
      setTimeout(() => ctx.select('zone', id, zone.wallId));
    }
    hint(); renderBar();
  },
  changed: () => { render(); renderBar(); hint(); },
});
ctx.ws = ws;
// the tool bar ends where the view buttons (Undo, Redo, Fit, Points, Content) begin, whatever their number
{
  const tools = document.querySelector('.stage-tools'), bar = $('wsBar');
  const fitBar = () => {
    const sameRow = tools.getBoundingClientRect().top < bar.getBoundingClientRect().top + 30;
    bar.style.right = sameRow ? `${tools.offsetWidth + 24}px` : '';
  };
  new ResizeObserver(fitBar).observe(tools);
  addEventListener('resize', fitBar);
}
const r3d = new Room3D($('room3d'), { hand: handHook, ws, changed: () => renderBar() });
ctx.r3d = r3d;

/** The room monitor › 3D (Live and Status): the WebGL view replaces the 2D strip (which stops drawing meanwhile). */
function update3d() {
  const want = onMonitor() && ctx.live3d;
  if (want && !r3d.ok) { ctx.live3d = false; toast('The 3D view needs WebGL 2, which this browser does not offer.', 'bad'); }
  const on = onMonitor() && ctx.live3d;
  r3d.setActive(on);
  ws.suspended = on;
}
function setLive3d(on) {
  ctx.live3d = on;
  try { localStorage.setItem('vt-live-3d', on ? '1' : '0'); } catch { /* ignore */ }
  update3d(); hint(); renderBar();
}
try { ws.zoneSpace = localStorage.getItem('vt-zone-space') === 'canvas' ? 'canvas' : 'wall'; } catch { /* ignore */ }
ctx.rv = ws; // views use ctx.rv for the hand tool
window.__vt = ctx; // debugging aid (DevTools / automated UI checks)
ctx.views = V;

// ------------------------------------------------------------------ sections, sub-tabs & views

/** View id → the panel it shows. The ids are the ones the views have always had (ctx.go('<id>') keeps working). */
const VIEWS = {
  ...LiveView.views,                                       // Live
  ...OutputView.views,                                     // Output: mapping (Screens) · audio · outputs (Protocols)
  status: V.status, room: V.room, sensors: V.sensors, calibrate: V.calibrate, zones: V.zones, system: V.system, // System & Calibration
};
/** Old ids that no longer are a view of their own. */
const ALIASES = { experiences: 'live' }; // the Experiences tab was split: the experience and the sound piece are in Live
/** The workspace mode of a view, when it is not the view's own id: Status shares the room monitor with Live. */
const WS_MODE = { status: 'live' };
const wsMode = (view) => WS_MODE[view] || view;
const onMonitor = () => wsMode(ctx.view) === 'live';

// the markup is the one list of sections and sub-tabs: a section opens on data-home, every data-view of its group is its sub-tab
const SECTIONS = [...$('nav').querySelectorAll('button[data-section]')].map((b) => b.dataset.section);
const HOME = {}, SECTION_OF = {};
for (const b of $('nav').querySelectorAll('button[data-section]')) { HOME[b.dataset.section] = b.dataset.home; SECTION_OF[b.dataset.home] = b.dataset.section; }
for (const g of $('subnav').querySelectorAll('.subtabs[data-section]')) for (const b of g.querySelectorAll('button[data-view]')) SECTION_OF[b.dataset.view] = g.dataset.section;
for (const v of Object.keys(VIEWS)) if (!SECTION_OF[v]) console.error(`view "${v}" has no section`);
ctx.nav = { sections: SECTIONS, home: HOME, sectionOf: (v) => SECTION_OF[ALIASES[v] || v] ?? null, views: Object.keys(VIEWS), aliases: ALIASES };

const RERENDER_ON = {
  live: ['state'], status: ['state', 'status', 'live'],
  mapping: ['state'], audio: ['state'], outputs: ['state', 'status'],
  room: ['state'], sensors: ['state', 'status'], calibrate: ['state', 'status', 'calib'], zones: ['state', 'live'], system: ['state', 'recording'],
};

function setView(view) {
  view = ALIASES[view] || view;
  if (!VIEWS[view]) return;
  const section = SECTION_OF[view];
  ctx.view = view; ctx.section = section;
  app.dataset.section = section; app.dataset.view = view;
  for (const b of $('nav').querySelectorAll('button[data-section]')) {
    b.classList.toggle('on', b.dataset.section === section);
    if (b.dataset.section === section) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  let tabs = null;
  for (const g of $('subnav').querySelectorAll('.subtabs[data-section]')) { g.hidden = g.dataset.section !== section; if (!g.hidden) tabs = g; }
  $('subnav').hidden = !tabs; // Live is one screen: no sub-tab bar
  for (const b of $('subnav').querySelectorAll('button[data-view]')) { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-selected', String(b.dataset.view === view)); }
  ws.setMode(wsMode(view));
  update3d();
  const keep = { room: ['wall'], mapping: ['wall'], sensors: ['sensor', 'wall'], zones: ['zone', 'mask', 'wall'], outputs: ['output'], live: ['wall'], status: ['wall'], calibrate: ['wall'] }[view] || [];
  if (ctx.sel && !keep.includes(ctx.sel.kind)) { ctx.sel = null; ws.selection = null; }
  if (view === 'calibrate' && ws.focus) ctx.calibWall = ws.focus;
  // remembered on this device: the last view, and the last sub-tab of each section (a section opens where it was left)
  try { localStorage.setItem('vt-view', view); localStorage.setItem(`vt-tab-${section}`, view); } catch { /* ignore */ }
  panel.scrollTop = 0;
  updateFocusMode();
  hint(); render(); renderBar();
}

/** A section opens on its last sub-tab on this device (the first time: its home). */
function goSection(section) {
  if (!HOME[section]) return;
  let view = HOME[section];
  try { const t = localStorage.getItem(`vt-tab-${section}`); if (t && SECTION_OF[t] === section && VIEWS[t]) view = t; } catch { /* ignore */ }
  setView(view);
}

let pending = false, lastRender = 0;
function render() {
  if (!store.state) return;
  const a = document.activeElement;
  // never rebuild the panel under the operator: a field being typed in, a fader being dragged or adjusted
  if ((a && panel.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.classList.contains('vfield'))) || panel.querySelector('.vfield.drag')) { pending = true; return; }
  pending = false;
  lastRender = performance.now();
  const top = panel.scrollTop;
  panel.replaceChildren(...VIEWS[ctx.view](ctx));
  panel.scrollTop = top;
}
panel.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));
panel.addEventListener('faderend', () => setTimeout(() => { if (pending && !panel.contains(document.activeElement)) render(); }, 0));

function maybeRender(ev, minGapMs = 0) {
  if (!RERENDER_ON[ctx.view].includes(ev)) return;
  if (minGapMs && performance.now() - lastRender < minGapMs) return;
  render();
}

function zoneHint() {
  const where = ws.space === 'canvas' ? 'on the canvas' : 'on the wall';
  if (ws.tool === 'zone' || ws.tool === 'mask') {
    const what = ws.tool === 'mask' ? 'a mask (ignored area)' : 'a zone';
    if (ws.shape === 'polygon') {
      if (!ws.poly) return `Click ${where} to place the first point of ${what}`;
      const n = ws.poly.pts.length;
      return `${n} point${n === 1 ? '' : 's'} · click to add · click the first point, double-click or Enter to close · Backspace undoes a point`;
    }
    if (ws.shape === 'circle') return `Drag ${where} from the centre outwards to draw a circular zone`;
    return `Drag ${where} to draw ${what}`;
  }
  if (ws.tool === 'hand') return ws.space === 'canvas' ? 'Virtual hand on the canvas: it lands on the wall under the pointer (through the Mapping)' : 'Virtual hand: touch or click the wall';
  return ws.space === 'canvas'
    ? 'Canvas zones: drawn on the content, free to span walls · dashed = wall zones (edit them in Wall)'
    : 'Drag a zone to move it · handles reshape · polygon: drag a point, drag a midpoint to add one, double-click a point to remove it · Ctrl+D duplicates';
}

function hint() {
  const monitor = ctx.live3d
    ? (ws.tool === 'hand' ? 'Virtual hand: touch a wall in 3D · two fingers to zoom' : 'Drag to orbit · right-drag or Shift-drag to pan · wheel or pinch to zoom · double-click resets · walls facing away hide so you see inside')
    : ws.tool === 'hand' ? 'Virtual hands: touch or click a wall · two fingers to zoom' : 'Read-only view of the whole room · drag to pan · wheel or pinch to zoom';
  const t = {
    live: monitor,
    status: monitor,
    audio: '',
    room: 'Drag the amber handles to resize a wall · tap a wall to edit it',
    mapping: 'The output canvas in pixels · drag a wall to move it · drag its corners · arrows nudge 1 px (Shift 10 px)',
    sensors: 'Drag a sensor to move it · drag the amber dot to rotate · the floor line should lie on the bottom edge',
    calibrate: store.status?.calib ? 'Amber target = the one to touch now' : store.status?.verify ? 'Touch each check point: the error of the real touch is measured' : 'Choose the wall, go through the checklist, then start the calibration',
    zones: zoneHint(),
    outputs: ws.texture ? (ws.tool === 'hand' ? 'Virtual hand: drag on the canvas — the disc appears where that touch lands through the Mapping' : 'Live texture: exactly what this output sends · white = touch · drag to pan, wheel or pinch to zoom') : '',
    system: '',
  }[ctx.view];
  $('stageHint').textContent = t || '';
  renderXpCaption();
}

/** Says the walls show the experience simulated here, so nobody takes it for the room's output. */
function renderXpCaption() {
  const c = $('xpCaption'), e = expview.active() ? expview.current() : null;
  const show = !!e && ws.space === 'wall' && !(ctx.view === 'outputs' && ws.texture);
  c.hidden = !show;
  c.textContent = show ? `${e.name} — preview in this window` : '';
}

// ------------------------------------------------------------------ workspace bar

const ICON = {
  select: '<svg viewBox="0 0 24 24"><path d="M5 3l14 9-6 1-3 6z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7s-5-2-6.5-5L3 11.5a1.4 1.4 0 0 1 2.3-1.6L8 13"/></svg>',
  zone: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/></svg>',
  mask: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M4 13l8-8M8 19L20 7M14 19l6-6"/></svg>',
};

function toolBtn(id, label, title) {
  return h('button', { class: `tool${id === 'select' || id === 'hand' ? ' view' : ''}${ws.tool === id ? ' on' : ''}`, title, html: `${ICON[id] || ''}${label}`, onclick: () => { ws.tool = id; hint(); renderBar(); } });
}

/** Outputs with a Texture output selected: the stage shows its live mask (what the Spout sender sends). */
function syncTexture() {
  const o = ctx.view === 'outputs' && ctx.sel?.kind === 'output' ? store.state?.profile.outputs.find((x) => x.id === ctx.sel.id) : null;
  const want = o?.type === 'texture' ? o.id : null;
  if ((ws.texture?.id ?? null) !== want) { ws.texture = want ? { id: want, override: {} } : null; ws.fitKey = ''; hint(); }
}

function renderBar() {
  const P = store.state?.profile;
  if (!P) return;
  syncTexture();
  const bar = [];
  const sims = P.sensors.some((s) => s.driver === 'sim' && s.enabled);
  const wallSpace = !['mapping', 'outputs', 'audio', 'system'].includes(ctx.view) && ws.space === 'wall';

  // wall navigator
  if (wallSpace && P.walls.length > 1) {
    const forced = ['sensors', 'calibrate', 'zones'].includes(ctx.view);
    bar.push(h('div', { class: 'seg' },
      forced ? null : h('button', { class: `wallnav${!ws.focus ? ' on' : ''}`, onclick: () => { ws.setFocus(null); } }, 'All'),
      P.walls.map((w) => h('button', { class: `wallnav${ws.focus === w.id ? ' on' : ''}`, title: w.name, onclick: () => { ws.setFocus(w.id); if (ctx.view === 'calibrate') { ctx.calibWall = w.id; render(); } } }, w.id))));
  }

  if (onMonitor()) {
    bar.push(h('div', { class: 'seg', title: 'The room as a strip of walls (2D) or standing around the floor (3D)' },
      h('button', { class: `view${ctx.live3d ? '' : ' on'}`, onclick: () => setLive3d(false) }, '2D'),
      h('button', { class: `view${ctx.live3d ? ' on' : ''}`, onclick: () => setLive3d(true) }, '3D')));
    if (ctx.live3d) bar.push(h('div', { class: 'seg' },
      h('button', { class: `view${r3d.cam?.inside ? ' on' : ''}`, title: 'Stand in the middle of the room and look around', onclick: () => { if (r3d.cam?.inside) r3d.reset(); else r3d.inside(); } }, 'Inside')));
  }
  if (ctx.view === 'outputs' && ws.texture && sims) {
    bar.push(h('div', { class: 'seg' }, toolBtn('select', 'View', 'Pan and zoom'), toolBtn('hand', 'Virtual hand', 'Touch the walls with a simulated hand (through the Mapping) to try the texture')));
  }
  if (onMonitor() || ctx.view === 'sensors') {
    if (sims) bar.push(h('div', { class: 'seg' }, toolBtn('select', 'View', ctx.live3d && onMonitor() ? 'Orbit, pan and zoom' : 'Pan and select'), toolBtn('hand', 'Virtual hand', 'Touch the wall with a simulated hand')));
  }
  if (ctx.view === 'zones') {
    const onCanvas = ws.space === 'canvas';
    bar.push(h('div', { class: 'seg', title: 'Where zones are drawn: on one wall (metres) or on the output canvas (pixels, over the content — a zone can span walls)' },
      [['wall', 'Wall'], ['canvas', 'Canvas']].map(([v, t]) => h('button', { class: ws.zoneSpace === v ? 'on' : '', onclick: () => setZoneSpace(v) }, t))));
    bar.push(h('div', { class: 'seg' }, toolBtn('select', 'Select', 'Select, move and reshape (Esc)'), toolBtn('zone', 'Zone', 'Draw a trigger zone'),
      onCanvas ? null : toolBtn('mask', 'Mask', 'Draw an ignored area (LiDAR returns there are dropped)'), sims ? toolBtn('hand', 'Hand', 'Test with a virtual hand') : null));
    if (ws.tool === 'zone' || ws.tool === 'mask') {
      const shapes = ws.tool === 'mask' ? [['rect', 'Rect'], ['polygon', 'Polygon']] : [['rect', 'Rect'], ['polygon', 'Polygon'], ['circle', 'Circle']];
      if (ws.tool === 'mask' && ws.shape === 'circle') ws.shape = 'rect';
      bar.push(h('div', { class: 'seg' }, shapes.map(([v, t]) => h('button', { class: ws.shape === v ? 'on' : '', onclick: () => { ws.shape = v; ws.cancelPoly(); hint(); renderBar(); } }, t))));
    }
    if (ws.poly) {
      bar.push(h('div', { class: 'seg' },
        h('button', { class: 'on', disabled: ws.poly.pts.length < 3, onclick: () => ws.finishPoly(), title: 'Close the polygon (Enter, double-click or the first point)' }, `Finish · ${ws.poly.pts.length}`),
        h('button', { onclick: () => ws.undoPolyPoint(), title: 'Remove the last point (Backspace)' }, 'Undo point'),
        h('button', { onclick: () => ws.cancelPoly(), title: 'Cancel (Esc)' }, 'Cancel')));
    } else {
      const zsel = ctx.sel?.kind === 'zone' || ctx.sel?.kind === 'mask';
      bar.push(h('div', { class: 'seg' },
        h('button', { disabled: ctx.sel?.kind !== 'zone', onclick: duplicateSel, title: 'Duplicate (Ctrl+D)' }, 'Duplicate'),
        h('button', { disabled: !zsel, onclick: deleteSel, title: 'Delete (Del) — with a polygon point selected, deletes the point' }, 'Delete')));
    }
  }
  if (['zones', 'sensors', 'room'].includes(ctx.view)) {
    const px = ws.space === 'canvas';
    bar.push(h('span', { class: 'ws-label' }, 'Snap'), h('div', { class: 'seg' }, [[0, 'Off'], [0.01, px ? '1 px' : '1 cm'], [0.05, px ? '5 px' : '5 cm'], [0.1, px ? '10 px' : '10 cm']].map(([v, t]) =>
      h('button', { class: ws.snap === v ? 'on' : '', onclick: () => { ws.snap = v; renderBar(); } }, t))));
  }
  if (ctx.view === 'room') {
    bar.push(h('div', { class: 'seg' },
      h('button', { onclick: () => V.addWall(ctx) }, '+ Wall'),
      h('button', { onclick: () => V.newRoomWizard(ctx) }, 'New room…')));
  }
  if (ctx.view === 'mapping') {
    const w = ctx.sel?.kind === 'wall' ? P.walls.find((q) => q.id === ctx.sel.id) : null;
    bar.push(h('div', { class: 'seg' }, P.walls.map((q) => h('button', { class: w?.id === q.id ? 'on' : '', onclick: () => ctx.select('wall', q.id) }, q.id))));
    if (w) bar.push(h('div', { class: 'seg' }, [['rect', 'Rect'], ['corners', 'Corners'], ['grid', 'Grid']].map(([m, t]) =>
      h('button', { class: w.mapping.mode === m ? 'on' : '', onclick: () => V.setMappingMode(w.id, m) }, t))));
    if (w?.mapping.mode === 'grid') bar.push(h('div', { class: 'seg' },
      toolBtn('select', 'Move', 'Drag nodes (arrows nudge the selected node)'),
      h('button', { class: `tool${ws.tool === 'addrow' ? ' on' : ''}`, onclick: () => { ws.tool = ws.tool === 'addrow' ? 'select' : 'addrow'; ctx.rerender(); } }, '+ Row'),
      h('button', { class: `tool${ws.tool === 'addcol' ? ' on' : ''}`, onclick: () => { ws.tool = ws.tool === 'addcol' ? 'select' : 'addcol'; ctx.rerender(); } }, '+ Column')));
    const pm = store.state.projection.mode;
    bar.push(h('button', { class: `btn small${pm === 'identify' ? ' attn' : ''}`, onclick: () => cmd('projection.set', { mode: pm === 'identify' ? 'off' : 'identify' }) }, pm === 'identify' ? 'Pattern: on' : 'Pattern'));
  }
  if (ctx.view === 'calibrate' && (store.status?.calib || store.status?.verify) && !isCoarse) {
    bar.push(h('button', { class: 'btn small', onclick: () => { ctx.calibFocus = !ctx.calibFocus; updateFocusMode(); } }, ctx.calibFocus ? 'Exit focus mode' : 'Focus mode'));
  }
  $('wsBar').replaceChildren(...bar.filter(Boolean));
  $('undoBtn').disabled = !history.undoLabel();
  $('redoBtn').disabled = !history.redoLabel();
  $('undoBtn').title = history.undoLabel() ? `Undo ${history.undoLabel()} (Ctrl+Z)` : 'Nothing to undo';
  $('redoBtn').title = history.redoLabel() ? `Redo ${history.redoLabel()} (Ctrl+Shift+Z)` : 'Nothing to redo';
}

/** Zones: draw on a wall (metres) or on the output canvas (pixels). */
function setZoneSpace(v) {
  ws.setZoneSpace(v);
  if (v === 'canvas' && ws.tool === 'mask') ws.tool = 'select';
  if (v === 'canvas' && ctx.sel?.kind === 'mask') ctx.sel = null;
  if (v === 'canvas' && ctx.sel?.kind === 'zone' && store.state.profile.zones.find((z) => z.id === ctx.sel.id)?.space !== 'canvas') { ctx.sel = null; ws.selection = null; }
  if (v === 'wall' && ctx.sel?.kind === 'zone' && store.state.profile.zones.find((z) => z.id === ctx.sel.id)?.space === 'canvas') { ctx.sel = null; ws.selection = null; }
  try { localStorage.setItem('vt-zone-space', v); } catch { /* ignore */ }
  hint(); render(); renderBar();
}
ctx.setZoneSpace = setZoneSpace;

function duplicateSel() {
  const z = store.state.profile.zones.find((q) => q.id === ctx.sel?.id);
  if (!z || ctx.sel?.kind !== 'zone') return;
  const P = store.state.profile;
  let k = P.zones.length + 1; while (P.zones.some((q) => q.id === `Z${k}`)) k++;
  const id = `Z${k}`;
  // the copy sits a little to the right (20 cm on a wall, 40 px on the canvas), kept inside
  const g = geomOf(z), b = boundsOfGeom(g);
  const right = z.space === 'canvas' ? P.canvas.width : P.walls.find((w) => w.id === z.wallId).width;
  const dx = Math.max(0, Math.min(z.space === 'canvas' ? 40 : 0.2, right - b.x1));
  const round = z.space === 'canvas' ? (v) => Math.round(v * 10) / 10 : (v) => Math.round(v * 1000) / 1000;
  editProfile((Q) => { Q.zones.push(withGeom({ ...structuredClone(z), id, name: `${z.name} copy`, address: '' }, translateGeom(g, dx, 0, round), true)); }, 'duplicate zone');
  setTimeout(() => ctx.select('zone', id, z.wallId));
}

function deleteSel() {
  const s = ctx.sel;
  if (s?.kind === 'zone') editProfile((Q) => { Q.zones = Q.zones.filter((z) => z.id !== s.id); }, 'delete zone');
  else if (s?.kind === 'mask') editProfile((Q) => { const w = Q.walls.find((q) => q.id === s.wallId); w.masks = w.masks.filter((m) => m.id !== s.id); }, 'delete mask');
  else return;
  ctx.select(null);
}

function updateFocusMode() {
  const on = ctx.view === 'calibrate' && !!(store.status?.calib || store.status?.verify) && (isCoarse || ctx.calibFocus);
  app.classList.toggle('calib-focus', on);
}

// ------------------------------------------------------------------ keyboard

addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (ctx.view === 'zones' && ws.poly) {
    // polygon being drawn: Enter closes it, Backspace removes the last point, Esc cancels
    if (e.key === 'Enter') { e.preventDefault(); ws.finishPoly(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); ws.undoPolyPoint(); return; }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ctx.view === 'zones') { e.preventDefault(); if (!ws.deleteVertex()) deleteSel(); return; }
  if (e.key === 'Escape') {
    if (!$('overlay').hidden) { $('overlay').querySelector('header .ibtn')?.click(); return; } // close the open dialog
    if (ws.cancelPoly()) return;
    ws.tool = 'select'; ctx.select(null); hint(); return;
  }
  if (e.key === '?') { shortcuts(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrows && ctx.view === 'mapping' && OutputView.nudge(arrows[0], arrows[1], e.shiftKey)) { e.preventDefault(); return; } // a slice (Advanced Output)
  if (arrows && ws.nudge(arrows[0], arrows[1], e.shiftKey)) e.preventDefault();
  // 1 · 2 · 3: the sections (each opens on its last sub-tab); the sub-tabs are clicked
  if (!mod && !e.altKey && /^[1-9]$/.test(e.key) && SECTIONS[Number(e.key) - 1]) goSection(SECTIONS[Number(e.key) - 1]);
});

function shortcuts() {
  const rows = [
    ['1 · 2 · 3', 'Switch section: Live, Output, System & Calibration (each opens on its last sub-tab)'],
    ['Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y', 'Undo · redo'],
    ['Arrows', 'Nudge the selection: 1 px in Output › Screens, one snap step (1 cm by default) on walls'],
    ['Shift + arrows', '10 px · ten snap steps'],
    ['Ctrl+D', 'Duplicate the selected zone'],
    ['Delete', 'Delete the selected zone or mask — or the selected polygon point (Zones)'],
    ['Enter · Backspace', 'Polygon tool: close the polygon · remove the last point'],
    ['Double-click a point', 'Remove that polygon point'],
    ['Esc', 'Close the dialog · cancel the polygon · back to Select · clear the selection'],
    ['Double-click · Fit', 'Frame the view'],
    ['Wheel · pinch', 'Zoom'],
    ['Drag on empty space', 'Pan'],
    ['?', 'This sheet'],
  ];
  modal('Keyboard shortcuts', h('dl', { class: 'kv shortcuts' }, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])));
}

// ------------------------------------------------------------------ top bar / status

function renderTop() {
  const S = store.state;
  app.classList.toggle('locked', !!S.locked);
  $('contentBtn').hidden = !S.underlay;
  $('expBtn').hidden = !expview.available();
  $('expBtn').classList.toggle('on', expview.isOn());
  renderXpCaption();
  $('lockBtn').classList.toggle('on', !!S.locked);
  $('lockBtn').textContent = S.locked ? 'Show · locked' : 'Show';
  if (S.locked && ws.tool !== 'select' && ws.tool !== 'hand') ws.tool = 'select';
  $('profileSelect').replaceChildren(...S.profiles.map((p) => h('option', { value: p.id, selected: p.id === S.profile.id }, p.name)));
  for (const b of $('projSeg').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === S.projection.mode);
}

function renderChips() {
  const st = store.status?.sensors || {};
  const prof = store.state?.profile;
  if (!prof) return;
  const en = prof.sensors.filter((s) => s.enabled);
  const ok = en.filter((s) => st[s.id]?.state === 'scanning').length;
  const bad = en.filter((s) => ['offline', 'error'].includes(st[s.id]?.state)).length;
  const outs = prof.outputs.filter((o) => o.enabled).length;
  const n = store.live?.roomCount ?? 0;
  $('chips').replaceChildren(...[
    h('span', { class: 'chip', title: 'Sensors scanning' }, h('span', { class: `dot ${bad ? 'bad' : ok === en.length && en.length ? 'ok' : 'warn'}` }), h('span', { class: 'n tnum' }, `${ok}/${en.length}`), 'sensors'),
    h('span', { class: 'chip', title: 'Touches now' }, h('span', { class: `dot ${n ? 'live' : ''}` }), h('span', { class: 'n tnum' }, String(n)), 'touches'),
    h('span', { class: 'chip opt', title: 'Enabled outputs' }, h('span', { class: 'n tnum' }, String(outs)), 'outputs'),
    store.status?.calib ? h('span', { class: 'chip', style: { color: 'var(--attn)' } }, `calibrating ${store.status.calib.wallId}`) : null,
    store.status?.recording ? h('button', { class: 'chip', style: { color: 'var(--danger)' }, title: 'Stop recording', onclick: () => cmd('rec.stop').then(() => toast('Recording saved', 'ok')) }, `● REC ${store.status.recording.seconds}s`) : null,
    store.status?.replay ? h('button', { class: 'chip', style: { color: 'var(--attn)' }, title: 'Stop the replay and go back to the live sensors', onclick: () => cmd('replay.stop') }, `▶ REPLAY ${store.status.replay.pos}s · stop`) : null,
  ].filter(Boolean));
}

/**
 * Problems (n) in the top bar: how many things need attention (V.problems — the Health list of Status, and any source a
 * later part adds to V.problemSources), in amber, or red with a fault. It opens Status, where each one has its fix.
 * Nothing at all when there is no problem.
 */
function renderProblems() {
  const list = store.state ? V.problems(ctx) : [];
  const key = list.map((p) => `${p[0]}|${p[1]}`).join('\n');
  const box = $('problems');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren(...(list.length ? [h('button', { class: 'chip', title: `${list.map((p) => p[1]).join('\n')}\n\nOpen Status`, onclick: () => ctx.go('status') },
    h('span', { class: `dot ${list.some((p) => p[0] === 'bad') ? 'bad' : 'warn'}` }), 'Problems', h('span', { class: 'n tnum' }, `(${list.length})`))] : []));
}
ctx.renderProblems = renderProblems; // a problem source that changes outside state/status asks for a refresh

/** Another device drives the calibration: say so, and offer to take over (a tablet can die mid-session). */
function renderControl() {
  const c = otherControl();
  app.classList.toggle('viewonly', !!c);
  const b = $('ctlBanner');
  const key = c ? `${c.id}|${!!store.status?.calib}` : '';
  if (b.dataset.key === key) return;
  b.dataset.key = key;
  b.hidden = !c;
  if (c) b.replaceChildren(
    h('span', {}, h('b', {}, `${store.status?.calib ? 'Calibration' : 'Verification'} in progress on ${c.device}`), ' — this device is view-only until it finishes.'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn small', onclick: takeControl }, 'Take control'));
}

async function takeControl() {
  const c = otherControl();
  if (c && !await confirmBox(`Take control from ${c.device}? The session continues on this device and ${c.device} becomes view-only.`, 'Take control')) return;
  cmd('control.take').then(() => toast('You have control of the session', 'ok')).catch((e) => toast(e.message, 'bad'));
}
ctx.takeControl = takeControl;

function renderStatusBar() {
  const S = store.state, e = store.status?.engine || {};
  $('statusBar').replaceChildren(...[
    h('span', {}, h('b', {}, S.profile.name)),
    h('span', {}, `canvas ${S.profile.canvas.width}×${S.profile.canvas.height}`),
    h('span', {}, `engine ${e.fps ?? '—'} fps`),
    h('span', {}, `${e.rss ?? '—'} MB`),
    h('span', {}, `v${S.version}`),
    h('button', { class: 'linkish muted', onclick: shortcuts, title: 'Keyboard shortcuts' }, 'keys 1–3 sections · Ctrl+Z undo · ? shortcuts'),
  ].filter(Boolean));
}

$('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-section]'); if (b) goSection(b.dataset.section); });
$('subnav').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
$('profileSelect').addEventListener('change', async (e) => {
  // switching rooms stops sensors and outputs: confirm, and put the selector back if not
  const ok = await V.switchRoom(store.state.profiles.find((p) => p.id === e.target.value));
  if (ok) { ws.focus = null; ctx.select(null); } else e.target.value = store.state.profile.id;
});
$('projSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) cmd('projection.set', { mode: b.dataset.mode }).catch((err) => toast(err.message, 'bad')); });
$('connectBtn').addEventListener('click', () => V.openConnectModal());
$('lockBtn').addEventListener('click', async () => {
  const locked = !!store.state?.locked;
  if (locked && !await confirmBox('Unlock the room? Zones, sensors and mapping become editable again.', 'Unlock')) return;
  cmd('app.lock', { locked: !locked }).then(() => { if (!locked) setView('live'); }).catch((e) => toast(e.message, 'bad'));
});
$('fitBtn').addEventListener('click', () => { if (r3d.active) { r3d.reset(); renderBar(); } else ws.fitKey = ''; });
$('undoBtn').addEventListener('click', () => undo());
$('redoBtn').addEventListener('click', () => redo());
const contentBtn = $('contentBtn');
contentBtn.classList.toggle('on', ws.showContent);
contentBtn.addEventListener('click', () => { ws.showContent = !ws.showContent; contentBtn.classList.toggle('on', ws.showContent); });
const expBtn = $('expBtn');
expBtn.addEventListener('click', () => { expview.setOn(!expview.isOn()); expBtn.classList.toggle('on', expview.isOn()); renderXpCaption(); });
const pointsBtn = $('pointsBtn');
pointsBtn.classList.toggle('on', ws.showPoints);
pointsBtn.addEventListener('click', () => { ws.showPoints = !ws.showPoints; pointsBtn.classList.toggle('on', ws.showPoints); setViz(ws.showPoints); });

// ------------------------------------------------------------------ store events

let firstState = true;
on('state', () => {
  if (firstState) {
    firstState = false;
    // where this device was last (an old id still works: 'experiences' opens Live)
    let v = 'live';
    try { v = localStorage.getItem('vt-view') || 'live'; } catch { /* ignore */ }
    v = ALIASES[v] || v;
    if (!VIEWS[v]) v = 'live';
    setView(v);
  }
  if (ctx.sel && !exists(ctx.sel)) { ctx.sel = null; ws.selection = null; }
  if (ws.focus && !store.state.profile.walls.some((w) => w.id === ws.focus)) ws.setFocus(['sensors', 'calibrate', 'zones'].includes(ctx.view) ? store.state.profile.walls[0]?.id ?? null : null);
  renderTop(); renderChips(); renderProblems(); renderStatusBar(); renderControl(); renderBar();
  maybeRender('state');
});
let recKey = '';
on('status', () => {
  renderChips(); renderProblems(); renderStatusBar(); renderControl(); maybeRender('status');
  // follow the wall being calibrated / verified (a view-only device did not choose it)
  const cw = (store.status?.calib || store.status?.verify)?.wallId;
  if (ctx.view === 'calibrate' && cw && ws.focus !== cw) { ctx.calibWall = cw; ws.setFocus(cw); }
  // the System view only needs a refresh when recording/replay starts or stops
  const k = `${!!store.status?.recording}|${store.status?.replay?.file || ''}`;
  if (k !== recKey) { recKey = k; maybeRender('recording'); }
});
on('live', () => { renderChips(); maybeRender('live', 250); });
on('calib', () => { updateFocusMode(); renderBar(); maybeRender('calib', 90); });
on('history', () => renderBar());
on('error', (e) => toast(e.message, 'bad'));
on('events', () => { const f = document.getElementById('eventFeed'); if (f) f.replaceChildren(...V.feedLines()); });
on('log', () => { const b = document.getElementById('logBox'); if (b) { const atEnd = b.scrollTop + b.clientHeight >= b.scrollHeight - 8; b.replaceChildren(...V.logLines()); if (atEnd) b.scrollTop = b.scrollHeight; } });
on('connection', (ok) => {
  $('connLost').hidden = ok === true;
  const unpaired = ok === 'unpaired';
  $('connLostTitle').textContent = unpaired ? 'This device is not paired' : 'Connection to the engine lost';
  $('connLostText').textContent = unpaired
    ? 'On the server, open Connect device and scan its QR code with this device (the link carries the access key).'
    : 'Reconnecting…';
  if (ok) cmd('logs.get').then((r) => { store.logs = r.entries; }).catch(() => {});
});

function exists(sel) {
  const p = store.state.profile;
  if (sel.kind === 'mask') return p.walls.find((w) => w.id === sel.wallId)?.masks.some((m) => m.id === sel.id);
  const list = { wall: p.walls, sensor: p.sensors, zone: p.zones, output: p.outputs }[sel.kind];
  return list?.some((x) => x.id === sel.id);
}

if (isCoarse) document.body.classList.add('coarse');
connect();
