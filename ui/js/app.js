// VEATION Touch — operator UI (desktop window and phones/tablets on the LAN).
// Each tool turns the central canvas into its own workspace (see workspace.js); the right
// panel is the inspector of what is selected there.

import { store, on, connect, cmd, editProfile, setViz, isCoarse, undo, redo, history } from './conn.js';
import { h, toast, confirmBox, modal } from './dom.js';
import { Workspace } from './workspace.js';
import * as V from './views.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel');
const app = $('app');

const ctx = {
  view: 'live',
  sel: null,
  calibWall: null,
  calibFocus: false,
  calibOpt: { cols: 3, rows: 3, top: 1.9, bottom: 0.45, holdMs: 700 },
  select(kind, id, wallId) {
    const P = store.state?.profile;
    if (kind && !wallId) wallId = kind === 'wall' ? id : (kind === 'sensor' ? P?.sensors.find((s) => s.id === id)?.wallId : kind === 'zone' ? P?.zones.find((z) => z.id === id)?.wallId : undefined);
    ctx.sel = kind ? { kind, id, wallId } : null;
    ws.selection = ctx.sel;
    if (wallId && ws.focus && ws.focus !== wallId && ws.space === 'wall') ws.setFocus(wallId);
    render(); renderBar();
  },
  go(view) { setView(view); },
  rerender: () => { render(); renderBar(); },
};

const ws = new Workspace($('roomCanvas'), {
  edit: (mutate, label) => {
    if (store.state?.locked) { toast('The room is locked (Show mode). Unlock it to edit.', 'bad'); return Promise.resolve(); }
    return editProfile(mutate, label).catch((e) => toast(e.message, 'bad'));
  },
  pick: (sel) => {
    ctx.sel = sel;
    if (sel?.kind === 'wall' && ctx.view === 'calibrate') ctx.calibWall = sel.id;
    render(); renderBar();
  },
  hand: (() => {
    let last = 0;
    return (wallId, x, y, phase, id) => {
      const now = performance.now();
      if (phase === 'move' && now - last < 30) return;
      last = now;
      cmd('sim.touch', { wallId, x, y, id, down: phase !== 'up' }).catch(() => {});
    };
  })(),
  draw: (kind, wallId, rect) => {
    const P = store.state.profile;
    if (kind === 'mask') {
      const w = P.walls.find((q) => q.id === wallId);
      let k = w.masks.length + 1; while (w.masks.some((m) => m.id === `M${k}`)) k++;
      const id = `M${k}`;
      editProfile((Q) => { Q.walls.find((q) => q.id === wallId).masks.push({ id, name: `Mask ${k}`, type: 'rect', ...rect }); }, 'add mask');
      ws.tool = 'select';
      setTimeout(() => ctx.select('mask', id, wallId));
    } else {
      let k = P.zones.length + 1; while (P.zones.some((z) => z.id === `Z${k}`)) k++;
      const id = `Z${k}`;
      editProfile((Q) => { Q.zones.push({ id, name: `Zone ${k}`, wallId, rect, holdMs: 1000, releaseMs: 150 }); }, 'add zone');
      ws.tool = 'select';
      setTimeout(() => ctx.select('zone', id, wallId));
    }
    hint(); renderBar();
  },
  changed: () => { render(); renderBar(); },
});
ctx.ws = ws;
ctx.rv = ws; // views use ctx.rv for the hand tool
window.__vt = ctx; // debugging aid (DevTools / automated UI checks)
ctx.views = V;

// ------------------------------------------------------------------ views & render

const RERENDER_ON = {
  live: ['state', 'status', 'live'], room: ['state'], mapping: ['state'], sensors: ['state', 'status'],
  calibrate: ['state', 'status', 'calib'], zones: ['state', 'live'], outputs: ['state', 'status'], system: ['state', 'recording'],
};

function setView(view) {
  ctx.view = view;
  for (const b of $('nav').querySelectorAll('button')) b.classList.toggle('on', b.dataset.view === view);
  ws.setMode(view);
  const keep = { room: ['wall'], mapping: ['wall'], sensors: ['sensor', 'wall'], zones: ['zone', 'mask', 'wall'], outputs: ['output'], live: ['wall'], calibrate: ['wall'] }[view] || [];
  if (ctx.sel && !keep.includes(ctx.sel.kind)) { ctx.sel = null; ws.selection = null; }
  if (view === 'calibrate' && ws.focus) ctx.calibWall = ws.focus;
  try { localStorage.setItem('vt-view', view); } catch { /* ignore */ }
  panel.scrollTop = 0;
  updateFocusMode();
  hint(); render(); renderBar();
}

let pending = false, lastRender = 0;
function render() {
  if (!store.state) return;
  const a = document.activeElement;
  if (a && panel.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { pending = true; return; }
  pending = false;
  lastRender = performance.now();
  const top = panel.scrollTop;
  panel.replaceChildren(...V[ctx.view](ctx));
  panel.scrollTop = top;
}
panel.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

function maybeRender(ev, minGapMs = 0) {
  if (!RERENDER_ON[ctx.view].includes(ev)) return;
  if (minGapMs && performance.now() - lastRender < minGapMs) return;
  render();
}

function hint() {
  const t = {
    live: ws.tool === 'hand' ? 'Virtual hands: touch or click a wall · two fingers to zoom' : 'Read-only view of the whole room · drag to pan · wheel or pinch to zoom',
    room: 'Drag the amber handles to resize a wall · tap a wall to edit it',
    mapping: 'The output canvas in pixels · drag a wall to move it · drag its corners · arrows nudge 1 px (Shift 10 px)',
    sensors: 'Drag a sensor to move it · drag the amber dot to rotate · the floor line should lie on the bottom edge',
    calibrate: 'Amber target = the one to touch now',
    zones: ws.tool === 'zone' ? 'Drag on the wall to draw a zone' : ws.tool === 'mask' ? 'Drag on the wall to draw a mask (ignored area)' : 'Drag a zone to move it · handles resize · Delete removes · Ctrl+D duplicates',
    outputs: '', system: '',
  }[ctx.view];
  $('stageHint').textContent = t || '';
}

// ------------------------------------------------------------------ workspace bar

const ICON = {
  select: '<svg viewBox="0 0 24 24"><path d="M5 3l14 9-6 1-3 6z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7s-5-2-6.5-5L3 11.5a1.4 1.4 0 0 1 2.3-1.6L8 13"/></svg>',
  zone: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/></svg>',
  mask: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M4 13l8-8M8 19L20 7M14 19l6-6"/></svg>',
};

function toolBtn(id, label, title) {
  return h('button', { class: `tool${ws.tool === id ? ' on' : ''}`, title, html: `${ICON[id] || ''}${label}`, onclick: () => { ws.tool = id; hint(); renderBar(); } });
}

function renderBar() {
  const P = store.state?.profile;
  if (!P) return;
  const bar = [];
  const sims = P.sensors.some((s) => s.driver === 'sim' && s.enabled);
  const wallSpace = ctx.view !== 'mapping' && ctx.view !== 'outputs' && ctx.view !== 'system';

  // wall navigator
  if (wallSpace && P.walls.length > 1) {
    const forced = ['sensors', 'calibrate', 'zones'].includes(ctx.view);
    bar.push(h('div', { class: 'seg' },
      forced ? null : h('button', { class: `wallnav${!ws.focus ? ' on' : ''}`, onclick: () => { ws.setFocus(null); } }, 'All'),
      P.walls.map((w) => h('button', { class: `wallnav${ws.focus === w.id ? ' on' : ''}`, title: w.name, onclick: () => { ws.setFocus(w.id); if (ctx.view === 'calibrate') { ctx.calibWall = w.id; render(); } } }, w.id))));
  }

  if (ctx.view === 'live' || ctx.view === 'sensors') {
    if (sims) bar.push(h('div', { class: 'seg' }, toolBtn('select', 'View', 'Pan and select'), toolBtn('hand', 'Virtual hand', 'Touch the wall with a simulated hand')));
  }
  if (ctx.view === 'zones') {
    bar.push(h('div', { class: 'seg' }, toolBtn('select', 'Select', 'Select, move and resize (Esc)'), toolBtn('zone', 'Zone', 'Draw a trigger zone'), toolBtn('mask', 'Mask', 'Draw an ignored area'), sims ? toolBtn('hand', 'Hand', 'Test with a virtual hand') : null));
    const zsel = ctx.sel?.kind === 'zone' || ctx.sel?.kind === 'mask';
    bar.push(h('div', { class: 'seg' },
      h('button', { disabled: ctx.sel?.kind !== 'zone', onclick: duplicateSel, title: 'Duplicate (Ctrl+D)' }, 'Duplicate'),
      h('button', { disabled: !zsel, onclick: deleteSel, title: 'Delete (Del)' }, 'Delete')));
  }
  if (['zones', 'sensors', 'room'].includes(ctx.view)) {
    bar.push(h('span', { class: 'ws-label' }, 'Snap'), h('div', { class: 'seg' }, [[0, 'Off'], [0.01, '1 cm'], [0.05, '5 cm'], [0.1, '10 cm']].map(([v, t]) =>
      h('button', { class: ws.snap === v ? 'on' : '', onclick: () => { ws.snap = v; renderBar(); } }, t))));
  }
  if (ctx.view === 'room') {
    bar.push(h('div', { class: 'seg' },
      h('button', { onclick: () => V.addWall(ctx) }, '+ Wall'),
      h('button', { onclick: () => V.newRoomWizard() }, 'New room…')));
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
    bar.push(h('button', { class: `btn small${pm === 'identify' ? ' attn' : ''}`, onclick: () => cmd('projection.set', { mode: pm === 'identify' ? 'off' : 'identify' }) }, pm === 'identify' ? 'Pattern on walls: on' : 'Show pattern on walls'));
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

function duplicateSel() {
  const z = store.state.profile.zones.find((q) => q.id === ctx.sel?.id);
  if (!z) return;
  const P = store.state.profile;
  let k = P.zones.length + 1; while (P.zones.some((q) => q.id === `Z${k}`)) k++;
  const id = `Z${k}`;
  const dx = Math.min(0.2, P.walls.find((w) => w.id === z.wallId).width - Math.max(z.rect.x0, z.rect.x1));
  editProfile((Q) => { Q.zones.push({ ...structuredClone(z), id, name: `${z.name} copy`, address: '', rect: { ...z.rect, x0: z.rect.x0 + dx, x1: z.rect.x1 + dx } }); }, 'duplicate zone');
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && ctx.view === 'zones') { e.preventDefault(); deleteSel(); return; }
  if (e.key === 'Escape') {
    if (!$('overlay').hidden) { $('overlay').querySelector('header .ibtn')?.click(); return; } // close the open dialog
    ws.tool = 'select'; ctx.select(null); hint(); return;
  }
  if (e.key === '?') { shortcuts(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrows && ws.nudge(arrows[0], arrows[1], e.shiftKey)) e.preventDefault();
  if (!mod && /^[1-8]$/.test(e.key)) {
    const views = ['live', 'room', 'mapping', 'sensors', 'calibrate', 'zones', 'outputs', 'system'];
    setView(views[Number(e.key) - 1]);
  }
});

function shortcuts() {
  const rows = [
    ['1 – 8', 'Switch tool: Live, Room, Mapping, Sensors, Calibrate, Zones, Outputs, System'],
    ['Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y', 'Undo · redo'],
    ['Arrows', 'Nudge the selection: 1 px in Mapping, one snap step (1 cm by default) on walls'],
    ['Shift + arrows', '10 px · ten snap steps'],
    ['Ctrl+D', 'Duplicate the selected zone'],
    ['Delete', 'Delete the selected zone or mask (Zones)'],
    ['Esc', 'Close the dialog · back to Select · clear the selection'],
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

function renderStatusBar() {
  const S = store.state, e = store.status?.engine || {};
  $('statusBar').replaceChildren(...[
    h('span', {}, h('b', {}, S.profile.name)),
    h('span', {}, `canvas ${S.profile.canvas.width}×${S.profile.canvas.height}`),
    h('span', {}, `engine ${e.fps ?? '—'} fps`),
    h('span', {}, `${e.rss ?? '—'} MB`),
    h('span', {}, `v${S.version}`),
    h('button', { class: 'linkish muted', onclick: shortcuts, title: 'Keyboard shortcuts' }, 'keys 1–8 tools · Ctrl+Z undo · ? shortcuts'),
  ].filter(Boolean));
}

$('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
$('profileSelect').addEventListener('change', (e) => cmd('profile.load', { id: e.target.value }).then(() => { ws.focus = null; ctx.select(null); }).catch((err) => toast(err.message, 'bad')));
$('projSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) cmd('projection.set', { mode: b.dataset.mode }).catch((err) => toast(err.message, 'bad')); });
$('connectBtn').addEventListener('click', () => V.openConnectModal());
$('lockBtn').addEventListener('click', async () => {
  const locked = !!store.state?.locked;
  if (locked && !await confirmBox('Unlock the room? Zones, sensors and mapping become editable again.', 'Unlock')) return;
  cmd('app.lock', { locked: !locked }).then(() => { if (!locked) setView('live'); }).catch((e) => toast(e.message, 'bad'));
});
$('fitBtn').addEventListener('click', () => { ws.fitKey = ''; });
$('undoBtn').addEventListener('click', () => undo());
$('redoBtn').addEventListener('click', () => redo());
const contentBtn = $('contentBtn');
contentBtn.classList.toggle('on', ws.showContent);
contentBtn.addEventListener('click', () => { ws.showContent = !ws.showContent; contentBtn.classList.toggle('on', ws.showContent); });
const pointsBtn = $('pointsBtn');
pointsBtn.classList.toggle('on', ws.showPoints);
pointsBtn.addEventListener('click', () => { ws.showPoints = !ws.showPoints; pointsBtn.classList.toggle('on', ws.showPoints); setViz(ws.showPoints); });

// ------------------------------------------------------------------ store events

let firstState = true;
on('state', () => {
  if (firstState) {
    firstState = false;
    let v = 'live';
    try { v = localStorage.getItem('vt-view') || 'live'; } catch { /* ignore */ }
    if (!V[v]) v = 'live';
    setView(v);
  }
  if (ctx.sel && !exists(ctx.sel)) { ctx.sel = null; ws.selection = null; }
  if (ws.focus && !store.state.profile.walls.some((w) => w.id === ws.focus)) ws.setFocus(['sensors', 'calibrate', 'zones'].includes(ctx.view) ? store.state.profile.walls[0]?.id ?? null : null);
  renderTop(); renderChips(); renderStatusBar(); renderBar();
  maybeRender('state');
});
let recKey = '';
on('status', () => {
  renderChips(); renderStatusBar(); maybeRender('status');
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
  $('connLost').hidden = ok;
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
