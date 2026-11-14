// VEATION Touch — operator UI (desktop window and phones/tablets on the LAN).

import { store, on, connect, cmd, editProfile, setViz, isCoarse } from './conn.js';
import { h, toast, badge } from './dom.js';
import { RoomView } from './roomview.js';
import * as V from './views.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel');

const rv = new RoomView($('roomCanvas'));
const ctx = {
  rv,
  view: 'live',
  sel: null,
  calibWall: null,
  calibOpt: { cols: 3, rows: 3, top: 1.9, bottom: 0.45, holdMs: 700 },
  select(kind, id) { ctx.sel = kind ? { kind, id } : null; rv.selection = ctx.sel; render(); },
  go(view) { setView(view); },
  rerender: () => render(),
  startDraw(target, wallId) { rv.mode = 'draw'; rv.drawTarget = target; rv.drawWall = wallId; hint(); render(); },
};

// ------------------------------------------------------------------ views & render

const RERENDER_ON = {
  live: ['state', 'status', 'live'], room: ['state'], sensors: ['state', 'status'], calibrate: ['state', 'status', 'calib'],
  zones: ['state', 'live'], outputs: ['state', 'status'], system: ['state'],
};

function setView(view) {
  ctx.view = view;
  for (const b of $('nav').querySelectorAll('button')) b.classList.toggle('on', b.dataset.view === view);
  if (view !== 'live' && rv.mode === 'hand') rv.mode = 'select';
  if (view === 'zones') { rv.mode = 'draw'; rv.drawTarget = 'zone'; } else if (rv.drawTarget === 'zone') { rv.mode = 'select'; rv.drawTarget = null; }
  const keep = { room: 'wall', sensors: 'sensor', zones: 'zone', outputs: 'output', live: 'wall' }[view];
  if (ctx.sel && ctx.sel.kind !== keep) ctx.select(null);
  try { localStorage.setItem('vt-view', view); } catch { /* ignore */ }
  panel.scrollTop = 0;
  hint();
  render();
}

let pending = false, lastRender = 0;
function render() {
  if (!store.state) return;
  // Never rebuild the panel under the operator's cursor/keyboard: wait for focus to leave.
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
    live: rv.mode === 'hand' ? 'Virtual hands: touch or click a wall · two fingers to zoom' : 'Drag to pan · wheel or pinch to zoom · double-click to fit',
    room: rv.mode === 'draw' ? 'Drag on the wall to draw the mask' : 'Tap a wall to edit it',
    sensors: 'Tap a sensor to edit it · white dots = what the LiDAR sees, grey = background',
    calibrate: 'Amber target = the one to touch now',
    zones: 'Drag on a wall to draw a zone · tap a zone to edit it',
    outputs: '', system: '',
  }[ctx.view];
  $('stageHint').textContent = t || '';
}

// ------------------------------------------------------------------ room view hooks

rv.onPick = (p) => {
  if (!p) return ctx.select(null);
  if (p.kind === 'sensor' && ctx.view !== 'sensors') { ctx.view = 'sensors'; setView('sensors'); }
  if (p.kind === 'zone' && ctx.view !== 'zones' && ctx.view !== 'live') { setView('zones'); }
  if (p.kind === 'wall' && ctx.view === 'calibrate') { ctx.calibWall = p.id; }
  if (p.kind === 'wall' && !['room', 'live', 'calibrate'].includes(ctx.view)) return;
  ctx.select(p.kind, p.id);
};

rv.onDraw = (wallId, rect) => {
  if (rv.drawTarget === 'mask') {
    rv.mode = 'select'; rv.drawTarget = null; hint();
    editProfile((p) => {
      const w = p.walls.find((x) => x.id === wallId);
      let k = w.masks.length + 1; while (w.masks.some((m) => m.id === `M${k}`)) k++;
      w.masks.push({ id: `M${k}`, name: `Mask ${k}`, type: 'rect', ...rect });
    });
    ctx.select('wall', wallId);
    return;
  }
  editProfile((p) => {
    let k = p.zones.length + 1; while (p.zones.some((z) => z.id === `Z${k}`)) k++;
    p.zones.push({ id: `Z${k}`, name: `Zone ${k}`, wallId, rect, holdMs: 1000, releaseMs: 150 });
    setTimeout(() => ctx.select('zone', `Z${k}`));
  });
};

let handThrottle = 0;
rv.onHand = (wallId, x, y, phase, id) => {
  const now = performance.now();
  if (phase === 'move' && now - handThrottle < 30) return;
  handThrottle = now;
  cmd('sim.touch', { wallId, x, y, id, down: phase !== 'up' }).catch(() => {});
};

// ------------------------------------------------------------------ top bar / status

function renderTop() {
  const S = store.state;
  const sel = $('profileSelect');
  sel.replaceChildren(...S.profiles.map((p) => h('option', { value: p.id, selected: p.id === S.profile.id }, p.name)));
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
  ].filter(Boolean));
}

function renderStatusBar() {
  const S = store.state, e = store.status?.engine || {};
  $('statusBar').replaceChildren(...[
    h('span', {}, h('b', {}, S.profile.name)),
    h('span', {}, `engine ${e.fps ?? '—'} fps`),
    h('span', {}, `${e.rss ?? '—'} MB`),
    h('span', {}, `v${S.version}`),
    S.lan?.[0] ? h('span', {}, 'tablet: ', h('b', {}, S.lan[0].url.replace(/\?k=.*/, ''))) : null,
  ].filter(Boolean));
}

$('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
$('profileSelect').addEventListener('change', (e) => cmd('profile.load', { id: e.target.value }).then(() => { rv.fitted = false; ctx.select(null); }).catch((err) => toast(err.message, 'bad')));
$('projSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) cmd('projection.set', { mode: b.dataset.mode }).catch((err) => toast(err.message, 'bad')); });
$('connectBtn').addEventListener('click', () => V.openConnectModal());
$('fitBtn').addEventListener('click', () => rv.fit());
const pointsBtn = $('pointsBtn');
pointsBtn.classList.toggle('on', rv.showPoints);
pointsBtn.addEventListener('click', () => { rv.showPoints = !rv.showPoints; pointsBtn.classList.toggle('on', rv.showPoints); setViz(rv.showPoints); });

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
  // a profile switch or geometry change → refit
  const sig = JSON.stringify(store.state.profile.walls.map((w) => [w.id, w.width, w.height]));
  if (sig !== ctx.wallSig) { ctx.wallSig = sig; rv.fitted = false; }
  if (ctx.sel && !exists(ctx.sel)) ctx.sel = null;
  rv.selection = ctx.sel;
  renderTop(); renderChips(); renderStatusBar();
  maybeRender('state');
});
on('status', () => { renderChips(); renderStatusBar(); maybeRender('status'); });
on('live', () => { renderChips(); maybeRender('live', 250); });
on('calib', () => maybeRender('calib', 90));
on('events', () => { const f = document.getElementById('eventFeed'); if (f) f.replaceChildren(...V.feedLines()); });
on('log', () => { const b = document.getElementById('logBox'); if (b) { const atEnd = b.scrollTop + b.clientHeight >= b.scrollHeight - 8; b.replaceChildren(...V.logLines()); if (atEnd) b.scrollTop = b.scrollHeight; } });
on('connection', (ok) => {
  $('connLost').hidden = ok;
  if (ok) cmd('logs.get').then((r) => { store.logs = r.entries; }).catch(() => {});
});

function exists(sel) {
  const p = store.state.profile;
  const list = { wall: p.walls, sensor: p.sensors, zone: p.zones, output: p.outputs }[sel.kind];
  return list?.some((x) => x.id === sel.id);
}

if (isCoarse) document.body.classList.add('coarse');
connect();
