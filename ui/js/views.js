// Panel views. Each returns DOM for the right-hand panel (bottom sheet on phones).
// They read from `store` and write through `editProfile` / `cmd` only.

import { store, on, cmd, editProfile, upload, otherControl, isCoarse } from './conn.js';
import { h, sec, field, selectField, toggle, nudgeField, fader, badge, dot, toast, confirmBox, promptBox, stateKind, round, modal, switchUi } from './dom.js';
import { gridMap, gridFrom, gridInsert, verifyPassMm, calibVerdict } from '/shared/geometry.js';
import { uvToCanvas, texturePreviewSize } from './workspace.js';

const run = (p, okMsg) => p.then((r) => { if (okMsg) toast(okMsg, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state.profile;

// The device that was driving a calibration is told when another device cancelled it (the desktop and the phone both load this file).
let noticeSeen = 0;
on('status', () => {
  const n = store.status?.notice;
  if (!n || n.at === noticeSeen) return;
  noticeSeen = n.at;
  if (n.to && n.to === store.state?.you) toast(n.text, 'warn');
});

/** Background capture with a 5 s countdown: the operator is often the one holding the tablet in front of the wall. */
export function captureBackground(args, what) {
  let n = 5, started = false, timer = null;
  const num = h('div', { class: 'countdown' }, String(n));
  const go = () => { started = true; clearInterval(timer); close(); run(cmd('bg.capture', args), `Capturing the background of ${what} — keep the wall clear`); };
  const close = modal(`Capture background · ${what}`, h('div', { class: 'countdown-box' },
    h('p', {}, 'Leave the wall clear: nobody and nothing in front of the sensors until it finishes (≈ 2 s).'),
    num,
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => close() }, 'Cancel'),
      h('button', { class: 'btn small primary', onclick: go }, 'Start now'))),
  { onClose: () => { if (!started) clearInterval(timer); } });
  timer = setInterval(() => { n -= 1; if (n <= 0) go(); else num.textContent = String(n); }, 1000);
}
/** "Capture background — all sensors" with how many already have one: the first step of every set-up. */
function captureAllRow() {
  const st = store.status?.sensors || {};
  const running = P().sensors.filter((s) => s.enabled && st[s.id]);
  const done = running.filter((s) => st[s.id].background).length;
  return h('div', { class: 'actions', style: { alignItems: 'center' } },
    h('button', { class: `btn small${done < running.length ? ' primary' : ''}`, disabled: !running.length, title: running.length ? '' : 'No sensor is running', onclick: () => captureBackground({}, 'all sensors') }, 'Capture background — all sensors'),
    h('span', { class: 'muted' }, running.length ? `${done}/${running.length} running sensors have one` : 'no sensor running'));
}

const wallName = (id) => P().walls.find((w) => w.id === id)?.name || id;
const zoneWhere = (z) => (z.space === 'canvas' ? `canvas · ${(z.walls || []).join(' + ') || 'no wall'}` : z.wallId);
const nextId = (list, prefix) => { let k = list.length + 1; while (list.some((x) => x.id === `${prefix}${k}`)) k++; return `${prefix}${k}`; };
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

// ======================================================================= SYSTEM & CALIBRATION › STATUS
// (the Live tab's panel until the media-server navigation: health, counters, walls, zones, simulator, events)

export function status(ctx) {
  const L = store.live || {};
  const st = store.status?.sensors || {};
  const prof = P();
  const sims = prof.sensors.some((s) => s.driver === 'sim');
  const out = [
    sec(['Health', store.state.locked ? badge('Show · locked', 'warn') : null], health(ctx)),
    sec('Now',
      h('div', { class: 'grid2' },
        bigNum(L.roomCount ?? 0, 'touches in the room'),
        bigNum(L.burst ?? 0, 'hands landed in 0.3 s'))),
    sec('Walls', h('div', { class: 'list' }, prof.walls.map((w) => {
      const sensors = prof.sensors.filter((s) => s.wallId === w.id);
      const n = (L.walls?.[w.id] || []).length;
      return h('div', { class: `item${ctx.sel?.kind === 'wall' && ctx.sel.id === w.id ? ' on' : ''}`, onclick: () => ctx.select('wall', w.id) },
        h('div', { class: 't' }, `${w.id} · ${w.name}`, h('small', {}, sensors.map((s) => `${s.id} ${st[s.id]?.state || 'stopped'}`).join(' · ') || 'no sensor')),
        sensors.map((s) => dot(stateKind(st[s.id]?.state))),
        badge(String(n), n ? 'live' : ''));
    }))),
  ];
  if (prof.zones.length) {
    out.push(sec('Zones', h('div', { class: 'list' }, prof.zones.map((z) => {
      const zs = L.zones?.[z.id];
      return h('div', { class: 'item', onclick: () => ctx.select('zone', z.id) },
        h('div', { class: 't' }, z.name, h('small', {}, zoneWhere(z))),
        badge(zs?.active ? `active · ${zs.count}` : 'idle', zs?.active ? 'warn' : ''));
    }))));
  }
  if (sims) {
    out.push(sec('Simulator',
      h('p', {}, 'Simulated sensors are running. Turn on virtual hands and touch the wall view to create touches — they go out through every output like real ones.'),
      toggle('Virtual hands', ctx.ws.tool === 'hand', (on) => { ctx.ws.tool = on ? 'hand' : 'select'; ctx.rerender(); }, 'touch / click the walls'),
      nudgeField('Wandering hands', prof.simulation.wanderers, 1, (v) => editProfile((p) => { p.simulation.wanderers = Math.max(0, Math.min(30, Math.round(v))); }), { decimals: 0, unit: '/wall' })));
  }
  out.push(sec('Events', h('div', { class: 'feed', id: 'eventFeed' }, feedLines())));
  return out;
}

/** A driver error in plain words (the raw text stays in the tooltip). */
function plainError(e) {
  if (!e) return '';
  const m = /no answer.*?from ([\d.]+)/i.exec(e);
  if (m) return `no answer from ${m[1]} — check its cable, power and IP address`;
  if (/EADDRINUSE|EACCES/.test(e)) return 'the network port is busy — another program is using it';
  if (/ENETUNREACH|EHOSTUNREACH/.test(e)) return 'network unreachable — this computer is not on the sensors’ network';
  return e;
}

/**
 * Everything that needs attention, from every source, most serious first: [kind 'bad'|'warn', text, action button?, title?].
 * The Health list (Status) and the Problems indicator of the top bar read the same list. A later source (missing media,
 * audio devices that are not there, disconnected screens) is a function (ctx) → items pushed onto `problemSources`.
 */
export const problemSources = [healthItems];
export function problems(ctx) {
  const items = problemSources.flatMap((f) => f(ctx) || []);
  return items.sort((a, b) => (a[0] === 'bad' ? -1 : 1) - (b[0] === 'bad' ? -1 : 1));
}

/** The Health list of Status: every problem with its fix, most serious first — or a single "all good". */
function health(ctx) {
  const items = problems(ctx);
  if (!items.length) return h('div', { class: 'health' }, h('div', { class: 'ok' }, '✓ All sensors scanning, calibrated and outputs sending.'));
  return h('div', { class: 'health' }, items.slice(0, 8).map(([k, t, action, title]) => h('div', { class: `${k} hrow`, title: title || '' },
    h('span', { class: 'msg' }, `${k === 'bad' ? '✕' : '!'} ${t}`), action || null)),
  items.length > 8 ? h('div', { class: 'muted' }, `+ ${items.length - 8} more`) : null);
}

/** The room's own health: sensors, background, calibration, outputs, engine rate — each with the action that fixes it. */
function healthItems(ctx) {
  const prof = P();
  const st = store.status?.sensors || {};
  const outs = store.status?.outputs || {};
  const eng = store.status?.engine || {};
  const items = []; // [kind, text, action?, title?]
  const act = (label, fn) => h('button', { class: 'btn small', onclick: fn }, label);
  const down = [], noBg = [], uncal = new Set();
  for (const s of prof.sensors.filter((x) => x.enabled)) {
    const t = st[s.id];
    if (!t || t.state === 'stopped' || t.state === 'offline' || t.state === 'error') down.push([s, t]);
    else if (t.state !== 'scanning') items.push(['warn', `${s.id}: ${t.state}…`]);
    else {
      if (!t.background) noBg.push(s);
      else if (t.bgMotion) items.push(['warn', `${s.id}: something moved during the background capture`, act('Capture again', () => captureBackground({ sensorId: s.id }, s.id))]);
      if (!s.calibration) uncal.add(s.wallId);
      if (t.health?.status === 1) items.push(['warn', `${s.id}: the sensor reports a warning (0x${t.health.errorCode.toString(16)})`, act('Sensor', () => { ctx.go('sensors'); ctx.select('sensor', s.id); })]);
    }
  }
  if (down.length === 1) {
    const [s, t] = down[0];
    items.push(['bad', `${s.id} (${s.wallId}): ${t ? `${t.state}${t.lastError ? ` — ${plainError(t.lastError)}` : ''}` : 'not running'}`, act('Sensor', () => { ctx.go('sensors'); ctx.select('sensor', s.id); }), t?.lastError]);
  } else if (down.length > 1) {
    const e = down.find(([, t]) => t?.lastError)?.[1]?.lastError;
    items.push(['bad', `${down.length} sensors offline (${down.map(([s]) => s.id).join(', ')})${e ? ` — ${plainError(e)}` : ''}`, act('Sensors', () => ctx.go('sensors')), e]);
  }
  if (noBg.length) items.push(['warn', noBg.length === 1 ? `${noBg[0].id}: no background captured` : `${noBg.length} sensors without background`, act(noBg.length === 1 ? 'Capture' : 'Capture all', () => captureBackground(noBg.length === 1 ? { sensorId: noBg[0].id } : {}, noBg.length === 1 ? noBg[0].id : 'all sensors'))]);
  if (uncal.size) {
    const first = [...uncal][0];
    items.push(['warn', `${uncal.size === 1 ? `${first} is` : `${uncal.size} walls are`} not calibrated (using the measured pose)`, act(`Calibrate ${first}`, () => { ctx.calibWall = first; ctx.go('calibrate'); })]);
  }
  for (const o of prof.outputs.filter((x) => x.enabled)) {
    const s = outs[o.id];
    if (s?.lastError) items.push(['bad', `Output ${o.name}: ${s.lastError}`, act('Output', () => { ctx.go('outputs'); ctx.select('output', o.id); })]);
  }
  if (eng.fps && eng.fps < 50) items.push(['warn', `Engine running at ${eng.fps} fps (expected 60)`]);
  return items;
}

export function feedLines() {
  if (!store.events.length) return [h('div', { class: 'muted' }, 'No touches yet.')];
  return store.events.slice(0, 30).map((e) => h('div', {},
    e.type === 'cross' ? `${fmtTime(e.at)}  ↔ cross #${e.id}  ${e.from} → ${e.wallId}  (${e.x.toFixed(2)}, ${e.y.toFixed(2)}) m`
      : `${fmtTime(e.at)}  ${e.type === 'down' ? '▼ down' : '▲ up  '}  #${e.id}  ${e.wallId}  (${e.x.toFixed(2)}, ${e.y.toFixed(2)}) m`));
}

function bigNum(n, label) {
  return h('div', {}, h('div', { style: { fontSize: '28px', fontWeight: 600, lineHeight: 1.1 }, class: 'tnum' }, String(n)), h('div', { class: 'muted' }, label));
}

// ======================================================================= ROOM

export function room(ctx) {
  const prof = P();
  const w = ctx.sel?.kind === 'wall' ? prof.walls.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec('Room profile',
      field('Name', prof.name, (v) => editProfile((p) => { p.name = v; }, 'rename room')),
      field('Notes', prof.notes, (v) => editProfile((p) => { p.notes = v; }, 'edit notes')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => newRoomWizard(ctx) }, 'New room…'))),
    sec(['Walls', h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => addWall(ctx) }, '+ Add wall')],
      h('p', { class: 'muted' }, 'Walls in the order you see them from inside the room. Drag the amber handles on the canvas to resize.'),
      h('div', { class: 'list' }, prof.walls.map((x) => h('div', { class: `item${w?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('wall', x.id) },
        h('div', { class: 't' }, `${x.id} · ${x.name}`, h('small', {}, `${x.width} × ${x.height} m · ${prof.sensors.filter((s) => s.wallId === x.id).length} sensor(s) · ${x.masks.length} mask(s)`)),
        !x.enabled ? badge('off') : null)))),
  ];
  if (w) out.push(...wallEditor(w, ctx));
  else out.push(sec(null, h('p', { class: 'muted' }, 'Select a wall in the list or on the canvas to edit it.')));
  return out;
}

export function addWall(ctx) {
  const prof = P();
  const id = nextId(prof.walls, 'W');
  const last = prof.walls.at(-1);
  editProfile((p) => {
    const pr = last ? { ...last.pixelRect, x: Math.min(p.canvas.width - 64, last.pixelRect.x + last.pixelRect.w) } : { x: 0, y: 0, w: 1920, h: 1080 };
    p.walls.push({ id, name: `Wall ${p.walls.length + 1}`, width: last?.width ?? 4, height: last?.height ?? 2.5, pixelRect: pr });
  }, 'add wall');
  setTimeout(() => ctx.select('wall', id));
}

/** "→ P1" (or "→ P4, closing the room" for the last wall). */
function nextWallName(w) {
  const walls = P().walls, i = walls.findIndex((x) => x.id === w.id);
  return i < walls.length - 1 ? `→ ${walls[i + 1].id}` : walls.length > 2 ? `→ ${walls[0].id} (if the room closes)` : '—';
}

function wallEditor(w, ctx) {
  const set = (fn, label = 'edit wall') => editProfile((p) => fn(p.walls.find((x) => x.id === w.id)), label);
  const idx = P().walls.findIndex((x) => x.id === w.id);
  return [
    sec(`Wall ${w.id}`,
      field('Name', w.name, (v) => set((x) => { x.name = v; })),
      field('Width', w.width, (v) => set((x) => { x.width = v; }), { unit: 'm', step: 0.001 }),
      field('Height', w.height, (v) => set((x) => { x.height = v; }), { unit: 'm', step: 0.001 }),
      h('p', { class: 'muted' }, 'Height = the touch surface (usually the projected image height).'),
      field('Scan plane', w.planeOffset, (v) => set((x) => { x.planeOffset = v; }), { unit: 'm', step: 0.005 }),
      h('h2', { style: { marginTop: '12px' } }, 'Corner with the next wall'),
      toggle('Continuous', w.joinNext !== false, (on) => set((x) => { x.joinNext = on; }, 'continuous corner'), nextWallName(w)),
      h('p', { class: 'muted' }, 'A hand that slides across this corner stays ONE touch: same id, no up / down — it moves on in the content as one. Turn it off for walls that do not meet.'),
      field('Angle', w.turn ?? 90, (v) => set((x) => { x.turn = Math.max(-180, Math.min(180, v)); }, 'corner angle'), { unit: '°', step: 5 }),
      h('p', { class: 'muted' }, 'Shapes the room in Live › 3D: 90 = an ordinary inside corner, 0 = the next wall continues straight on.'),
      toggle('Enabled', w.enabled, (on) => set((x) => { x.enabled = on; })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => { ctx.go('mapping'); ctx.select('wall', w.id); } }, 'Map to pixels…'),
        h('button', { class: 'btn small', onclick: () => { ctx.ws.setFocus(w.id); ctx.go('zones'); } }, 'Zones & masks…'))),
    sec('Order',
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', disabled: idx <= 0, onclick: () => editProfile((p) => { const a = p.walls; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; }) }, '← Move left'),
        h('button', { class: 'btn small', disabled: idx >= P().walls.length - 1, onclick: () => editProfile((p) => { const a = p.walls; [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]]; }) }, 'Move right →'),
        h('button', { class: 'btn small danger', onclick: async () => {
          if (!await confirmBox(`Delete wall ${w.id} "${w.name}"? Its sensors move to another wall and its zones are deleted.`, 'Delete', true)) return;
          editProfile((p) => { p.walls = p.walls.filter((x) => x.id !== w.id); p.zones = p.zones.filter((z) => z.space === 'canvas' || z.wallId !== w.id); });
          ctx.select(null);
        } }, 'Delete wall'))),
  ];
}

// ======================================================================= MAPPING (Output › Screens)

export function mapping(ctx) {
  const prof = P();
  const w = ctx.sel?.kind === 'wall' ? prof.walls.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec('Output canvas',
      h('p', { class: 'muted' }, 'The video your content renders at (e.g. the 4K signal into the video processor). Each wall occupies a region of it; touches sent in canvas coordinates follow this mapping.'),
      h('div', { class: 'grid2' },
        field('Width', prof.canvas.width, (v) => editProfile((p) => { p.canvas.width = Math.round(v); }, 'canvas size'), { inline: true, step: 1 }),
        field('Height', prof.canvas.height, (v) => editProfile((p) => { p.canvas.height = Math.round(v); }, 'canvas size'), { inline: true, step: 1 }))),
    sec('Walls', h('div', { class: 'list' }, prof.walls.map((x) => h('div', { class: `item${w?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('wall', x.id) },
      h('div', { class: 't' }, `${x.id} · ${x.name}`, h('small', {}, x.mapping.mode === 'corners' ? 'corner pin' : x.mapping.mode === 'grid' ? `grid ${x.mapping.us.length}×${x.mapping.vs.length}` : `${x.pixelRect.w}×${x.pixelRect.h} px @ ${x.pixelRect.x}, ${x.pixelRect.y}`)),
      badge(x.mapping.mode, x.mapping.mode !== 'rect' ? 'warn' : ''))))),
  ];
  out.push(sec('Content underlay',
    h('p', { class: 'muted' }, `A frame of your content at the canvas size (${prof.canvas.width} × ${prof.canvas.height}). It is drawn under the canvas here and under each wall in Zones, so zones are drawn on what is really projected.`),
    h('div', { class: 'actions' },
      h('label', { class: 'btn small' }, store.state.underlay ? 'Replace image…' : 'Upload image…', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        run(upload('/api/underlay', f), 'Content image uploaded');
      } })),
      store.state.underlay ? h('button', { class: 'btn small danger', onclick: () => run(upload('/api/underlay', '', 'remove=1')) }, 'Remove') : null)));
  if (!w) { out.push(sec(null, h('p', { class: 'muted' }, 'Select a wall on the canvas to move its region or drag its corners.'))); return out; }
  const set = (fn, label) => editProfile((p) => fn(p.walls.find((x) => x.id === w.id)), label);
  out.push(sec(`Wall ${w.id} → pixels`,
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Mode'), h('div', { class: 'seg' },
      [['rect', 'Rect'], ['corners', 'Corners'], ['grid', 'Grid']].map(([m, t]) =>
        h('button', { class: w.mapping.mode === m ? 'on' : '', onclick: () => setMappingMode(w.id, m) }, t)))),
    w.mapping.mode === 'grid' ? gridPanel(w, ctx) : w.mapping.mode === 'rect'
      ? [h('p', { class: 'muted' }, 'Axis-aligned region. Drag it on the canvas, or its corners to resize.'),
        h('div', { class: 'grid4' }, ...['x', 'y', 'w', 'h'].map((k) => field(k.toUpperCase(), w.pixelRect[k], (v) => set((x) => { x.pixelRect[k] = Math.round(v); x.mapping = { mode: 'rect' }; }, 'edit region'), { inline: true, step: 1 })))]
      : [h('p', { class: 'muted' }, 'Corner pin: drag each corner until the pattern on the wall matches the physical wall edges (“Pattern”). It changes where touches land in canvas coordinates, never the image.'),
        ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'].map((name, k) => h('div', { class: 'row' }, h('span', { class: 'k' }, name),
          ...[0, 1].map((a) => { const inp = field(a ? 'y' : 'x', w.mapping.corners[k][a], (v) => set((x) => { x.mapping.corners[k][a] = v; }, 'move corner'), { inline: true, step: 1 }); inp.style.flex = '1'; return inp; }))),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => setMappingMode(w.id, 'rect') }, 'Reset to rectangle'))]));
  out.push(sec('Check it on the wall',
    h('p', { class: 'muted' }, 'With “Pattern” the projection draws each wall’s 0.5 m grid through this mapping. Touch the wall with a hand (or a virtual hand): the cyan dot must appear under it.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => cmd('projection.set', { mode: store.state.projection.mode === 'identify' ? 'off' : 'identify' }) },
      store.state.projection.mode === 'identify' ? 'Hide pattern' : 'Pattern'))));
  return out;
}

export function setMappingMode(wallId, mode) {
  const cur = P().walls.find((x) => x.id === wallId);
  if (cur?.mapping.mode === mode) return;
  editProfile((p) => {
    const w = p.walls.find((x) => x.id === wallId);
    const r = w.pixelRect;
    const outer = w.mapping.mode === 'corners' ? w.mapping.corners
      : w.mapping.mode === 'grid' ? [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => gridMap(w.mapping, u, v))
        : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    if (mode === 'rect') w.mapping = { mode: 'rect' }; // the bounding box becomes the rectangle
    else if (mode === 'corners') w.mapping = { mode: 'corners', corners: outer.map((c) => c.map((x) => Math.round(x * 10) / 10)) };
    else {
      // a 3×3 mesh that starts exactly where the wall is now (nothing jumps)
      const prev = { ...w };
      w.mapping = { mode: 'grid', ...gridFrom((u, v) => uvToCanvas(prev, u, v), 3, 3) };
    }
  }, { rect: 'reset mapping', corners: 'corner pin', grid: 'grid warp' }[mode]);
}

function gridPanel(w, ctx) {
  const m = w.mapping;
  const node = ctx.ws.node?.wallId === w.id ? ctx.ws.node.k : -1;
  const step = ctx.nudgeStep || 1;
  const nudge = (dx, dy) => editProfile((p) => {
    const q = p.walls.find((x) => x.id === w.id).mapping;
    if (node >= 0) q.points[node] = [q.points[node][0] + dx * step, q.points[node][1] + dy * step];
  }, 'move grid node');
  const pad = (dx, dy, t) => h('button', { class: 'btn', style: { width: '56px', height: '48px', fontSize: '18px' }, disabled: node < 0, onclick: () => nudge(dx, dy) }, t);
  return [
    h('p', { class: 'muted' }, `Mesh of ${m.us.length} × ${m.vs.length} nodes. Drag a node on the canvas (or select it and use the pad) until the pattern on the wall lines up with the physical surface. It bends where touches land in canvas coordinates, never the image.`),
    h('div', { class: 'actions' },
      h('button', { class: `btn small${ctx.ws.tool === 'addrow' ? ' attn' : ''}`, onclick: () => { ctx.ws.tool = ctx.ws.tool === 'addrow' ? 'select' : 'addrow'; ctx.rerender(); } }, '+ Row'),
      h('button', { class: `btn small${ctx.ws.tool === 'addcol' ? ' attn' : ''}`, onclick: () => { ctx.ws.tool = ctx.ws.tool === 'addcol' ? 'select' : 'addcol'; ctx.rerender(); } }, '+ Column'),
      h('button', { class: 'btn small', disabled: m.us.length > 17 || m.vs.length > 17, onclick: () => subdivide(w) }, 'Subdivide'),
      h('button', { class: 'btn small', onclick: () => setMappingMode(w.id, 'corners') }, 'Back to corners')),
    ctx.ws.tool === 'addrow' || ctx.ws.tool === 'addcol' ? h('p', { class: 'muted' }, `Click on the wall to add a ${ctx.ws.tool === 'addrow' ? 'row' : 'column'} there.`) : null,
    h('h2', { style: { marginTop: '12px' } }, node >= 0 ? `Node ${node + 1} · ${Math.round(m.points[node][0])}, ${Math.round(m.points[node][1])} px` : 'Fine adjust — select a node'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: '6px', justifyContent: 'center' } },
      h('span'), pad(0, -1, '↑'), h('span'), pad(-1, 0, '←'), h('span', { class: 'muted', style: { alignSelf: 'center', textAlign: 'center' } }, `${step}px`), pad(1, 0, '→'), h('span'), pad(0, 1, '↓'), h('span')),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, h('div', { class: 'seg' }, [1, 5, 20].map((s) =>
      h('button', { class: step === s ? 'on' : '', onclick: () => { ctx.nudgeStep = s; ctx.rerender(); } }, `${s} px`)))),
  ];
}

function subdivide(w) {
  editProfile((p) => {
    const q = p.walls.find((x) => x.id === w.id);
    let g = { us: q.mapping.us, vs: q.mapping.vs, points: q.mapping.points };
    const mids = (ts) => ts.slice(1).map((t, k) => Math.round(((t + ts[k]) / 2) * 1000) / 1000);
    for (const t of mids(g.us)) g = gridInsert(g, 'u', t);
    for (const t of mids(g.vs)) g = gridInsert(g, 'v', t);
    q.mapping = { mode: 'grid', ...g };
  }, 'subdivide grid');
}

// ======================================================================= NEW ROOM WIZARD

export function newRoomWizard(ctx) {
  const o = { name: 'New room', walls: 4, width: 6, height: 3, cw: 3840, ch: 912, layout: 'strip', driver: 's2e', ip: '192.168.11.11' };
  const body = h('div', {});
  // a strip keeps the same pixels per metre on every wall: its width follows from the walls, it is not a choice
  const stripWidth = () => Math.round((o.width * o.ch) / o.height) * o.walls;
  const draw = () => {
    if (o.layout === 'strip') o.cw = stripWidth();
    const strip = o.layout === 'strip';
    body.replaceChildren(
      field('Room name', o.name, (v) => { o.name = v; }),
      h('div', { class: 'grid2' },
        selectField('Walls', o.walls, [1, 2, 3, 4, 5, 6, 8].map((n) => [n, String(n)]), (v) => { o.walls = v; draw(); }, { inline: true, numeric: true }),
        selectField('Sensors', o.driver, [['s2e', 'One S2E per wall'], ['sim', 'Simulated (no hardware)'], ['none', 'None yet']], (v) => { o.driver = v; draw(); }, { inline: true }),
        field('Wall width (m)', o.width, (v) => { o.width = v; draw(); }, { inline: true, step: 0.01 }),
        field('Wall height (m)', o.height, (v) => { o.height = v; draw(); }, { inline: true, step: 0.01 }),
        field(strip ? 'Canvas width (px) · from the walls' : 'Canvas width (px)', o.cw, (v) => { o.cw = Math.round(v); }, { inline: true, step: 1, readonly: strip }),
        field('Canvas height (px)', o.ch, (v) => { o.ch = Math.round(v); draw(); }, { inline: true, step: 1 }),
        selectField('Wall regions', o.layout, [['strip', 'Continuous strip (one panorama)'], ['grid', 'Grid (e.g. 2×2 for a 4-output processor)'], ['row', 'Side by side in fixed slots']], (v) => { o.layout = v; draw(); }, { inline: true }),
        o.driver === 's2e' ? field('First sensor IP', o.ip, (v) => { o.ip = v.trim(); }, { inline: true }) : h('span')),
      strip ? h('p', { class: 'muted' }, `Strip: one panorama of ${o.cw} × ${o.ch} px — every wall gets ${Math.round((o.width * o.ch) / o.height)} px, the same pixels per metre everywhere.`) : null,
      h('p', { class: 'muted' }, 'Everything can be changed afterwards: sizes in Room, pixel regions in Output › Screens, sensors in Sensors.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: create }, 'Create room'), h('button', { class: 'btn', onclick: () => close() }, 'Cancel')));
  };
  const close = modal('New room', body);
  draw();

  function create() {
    const n = o.walls;
    let walls;
    if (o.layout === 'strip') {
      // one continuous panorama: same pixels per metre everywhere, walls side by side
      const ww = Math.round((o.width * o.ch) / o.height);
      walls = Array.from({ length: n }, (_, i) => ({ id: `W${i + 1}`, name: `Wall ${i + 1}`, width: o.width, height: o.height,
        pixelRect: { x: i * ww, y: 0, w: ww, h: o.ch } }));
      o.cw = stripWidth();
    } else {
      const cols = o.layout === 'row' ? n : Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const sw = Math.floor(o.cw / cols), sh = Math.floor(o.ch / rows);
      walls = Array.from({ length: n }, (_, i) => {
        // fit the wall's aspect ratio inside its slot, anchored top-left
        const k = Math.min(sw / o.width, sh / o.height);
        return { id: `W${i + 1}`, name: `Wall ${i + 1}`, width: o.width, height: o.height,
          pixelRect: { x: (i % cols) * sw, y: Math.floor(i / cols) * sh, w: Math.round(o.width * k), h: Math.round(o.height * k) } };
      });
    }
    const ipParts = o.ip.split('.').map(Number);
    const sensors = o.driver === 'none' ? [] : walls.map((w, i) => ({
      id: `S${i + 1}`, name: `LiDAR ${w.id}`, wallId: w.id, driver: o.driver,
      host: ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.${ipParts[3] + i}` : '192.168.11.2',
      pose: { x: w.width / 2, y: w.height + 0.25, rotation: -90 },
    }));
    const profile = { name: o.name, canvas: { width: o.cw, height: o.ch }, walls, sensors, zones: [],
      outputs: [{ id: 'O1', name: 'TouchDesigner', type: 'osc', host: '127.0.0.1', port: 9000 }],
      simulation: { wanderers: o.driver === 'sim' ? 1 : 0 } };
    cmd('profile.create', { name: o.name, profile }).then(() => {
      close();
      // the next step of a set-up: the sensors (simulated ones already run: their background is next)
      ctx?.go('sensors');
      toast(o.driver === 's2e' ? `${o.name} created — next: connect the sensors (Sensor network…)` : o.driver === 'sim' ? `${o.name} created — next: capture the background of the sensors` : `${o.name} created — next: add its sensors`, 'ok');
    }).catch((e) => toast(e.message, 'bad'));
  }
}

// ======================================================================= SENSORS

export function sensors(ctx) {
  const prof = P();
  const st = store.status?.sensors || {};
  const s = ctx.sel?.kind === 'sensor' ? prof.sensors.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec(['Sensors', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => discoverModal(ctx), title: 'Find the RPLIDAR S2E units on the network and give each one its address' }, 'Sensor network…'),
      h('button', { class: 'btn small', onclick: () => addSensor('s2e') }, '+ S2E'),
      h('button', { class: 'btn small', onclick: () => addSensor('sim') }, '+ Simulated')],
      prof.sensors.length ? captureAllRow() : null,
      prof.sensors.length > 1 ? h('p', { class: 'muted' }, 'Which unit is which? Wave a hand in front of a sensor: its row shows “moving”.') : null,
      prof.sensors.length ? h('div', { class: 'list' }, prof.sensors.map((x) => {
        const t = st[x.id];
        return h('div', { class: `item${s?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('sensor', x.id) },
          dot(x.enabled ? stateKind(t?.state) : ''),
          h('div', { class: 't' }, `${x.id} · ${x.name}`, h('small', {}, `${x.driver === 'sim' ? 'simulated' : `${x.host}:${x.port}`} → ${x.wallId}`)),
          t?.activity ? badge('moving', 'live') : null,
          x.calibration ? badge('cal', 'ok') : badge('pose'),
          badge(x.enabled ? (t?.state === 'scanning' ? `${t.hz} Hz` : t?.state || 'stopped') : 'off', x.enabled ? stateKind(t?.state) : ''));
      })) : h('p', { class: 'muted' }, 'No sensors yet.')),
  ];
  if (s) out.push(...sensorEditor(s, st[s.id], ctx));
  return out;

  function addSensor(driver) {
    editProfile((p) => {
      const id = nextId(p.sensors, 'S');
      const wall = p.walls[0];
      const n = p.sensors.filter((x) => x.driver === 's2e').length;
      p.sensors.push({ id, name: `LiDAR ${id}`, wallId: wall?.id, driver, host: `192.168.11.${11 + n}`, port: 8089,
        pose: { x: wall ? wall.width / 2 : 0, y: wall ? wall.height + 0.3 : 0, rotation: -90 } });
      setTimeout(() => ctx.select('sensor', id));
    });
  }
}

/** Folded sections remember being open across re-renders (the panel is rebuilt with every status). */
const openFolds = new Set();
function fold(key, title, ...children) {
  return h('details', { class: 'sec fold', open: openFolds.has(key), ontoggle: (e) => { if (e.target.open) openFolds.add(key); else openFolds.delete(key); } },
    h('summary', {}, title), ...children);
}

/** Sensor inspector, in the order of use: what it is and how it is doing → background → mounting → calibration;
 *  network, scan mode and the technical details are folded away. */
function sensorEditor(s, t, ctx) {
  const set = (fn) => editProfile((p) => fn(p.sensors.find((x) => x.id === s.id)));
  const out = [];
  const kv = (k, v) => [h('dt', {}, k), h('dd', {}, v ?? '—')];
  out.push(sec(`Sensor ${s.id}`,
    field('Name', s.name, (v) => set((x) => { x.name = v; })),
    selectField('Wall', s.wallId, P().walls.map((w) => [w.id, `${w.id} · ${w.name}`]), (v) => set((x) => { x.wallId = v; })),
    toggle('Enabled', s.enabled, (on) => set((x) => { x.enabled = on; })),
    t ? h('dl', { class: 'kv' },
      kv('State', h('span', {}, dot(stateKind(t.state)), ' ', t.state)),
      kv('Data', `${t.hz} Hz${t.sinceData === null ? '' : ` · ${t.sinceData} ms ago`}`),
      t.lastError ? kv('Last error', h('span', { style: { color: 'var(--danger)' } }, t.lastError)) : null)
      : h('p', { class: 'muted' }, s.enabled ? 'Starting…' : 'Disabled.')));

  out.push(sec('Background',
    h('p', { class: 'muted' }, 'Learn what the sensor sees with the room EMPTY (floor, adjacent walls, fixed objects). Everything else becomes a touch candidate. Do it first, and again after moving the sensor.'),
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Status'), t?.learning ? badge(`learning ${t.learning.done}/${t.learning.frames}`, 'warn') : t?.background ? (t.bgMotion ? badge('captured · movement', 'warn') : badge('captured', 'ok')) : badge('none', 'warn')),
    t?.bgMotion && !t.learning ? h('div', { class: 'callout attn' },
      `Something moved in front of the wall during the capture (near ${t.bgMotion.where.map((w) => `x ${w.x} m, y ${w.y} m`).join(' · ')}). `
      + 'It may now be part of the background and hide touches there: capture again with the wall clear.') : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn small primary', disabled: !t, title: t ? '' : 'The sensor is not running', onclick: () => captureBackground({ sensorId: s.id }, s.id) }, t?.bgMotion ? 'Capture again' : 'Capture background'),
      h('button', { class: 'btn small', disabled: !t?.background, onclick: () => run(cmd('bg.clear', { sensorId: s.id })) }, 'Clear'))));

  out.push(sec('Mounting (wall metres)',
    h('p', { class: 'muted' }, s.calibration ? 'Calibrated: the pose below is no longer used for tracking.' : 'Position of the sensor on its wall (origin: bottom-left corner, seen from inside the room). Use Auto-align with the room empty, or drag / rotate the sensor on the canvas.'),
    autoAlignBox(s, t),
    levelCheckBox(s, t),
    nudgeField('X', s.pose.x, 0.01, (v) => set((x) => { x.pose.x = v; }), { unit: 'm' }),
    nudgeField('Y', s.pose.y, 0.01, (v) => set((x) => { x.pose.y = v; }), { unit: 'm' }),
    nudgeField('Rotation', s.pose.rotation, 0.5, (v) => set((x) => { x.pose.rotation = v; }), { unit: '°', decimals: 2 }),
    toggle('Mirror', s.pose.mirror, (on) => set((x) => { x.pose.mirror = on; }), 'sensor mounted upside down')));

  out.push(sec('Calibration',
    s.calibration
      ? h('dl', { class: 'kv' }, ...kv('Type', s.calibration.kind), ...kv('Error (RMS)', `${s.calibration.rmsMm} mm`), ...kv('Worst point', `${s.calibration.maxMm} mm`), ...kv('Points', s.calibration.points), ...kv('Date', s.calibration.at ? new Date(s.calibration.at).toLocaleString() : '—'))
      : h('p', { class: 'muted' }, 'Not calibrated — using the measured pose.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => { ctx.calibWall = s.wallId; ctx.go('calibrate'); } }, `Calibrate ${s.wallId}…`),
      h('button', { class: 'btn small danger', disabled: !s.calibration, onclick: async () => {
        if (await confirmBox(`Remove the calibration of ${s.id}? It will fall back to the measured pose.`, 'Remove', true)) run(cmd('calib.clear', { sensorId: s.id }));
      } }, 'Remove calibration'))));

  out.push(fold(`net:${s.id}`, s.driver === 's2e' ? `Network & scan · ${s.host}` : 'Driver',
    selectField('Driver', s.driver, [['s2e', 'RPLIDAR S2E (Ethernet)'], ['sim', 'Simulated']], (v) => set((x) => { x.driver = v; })),
    s.driver === 's2e' ? [
      field('IP address', s.host, (v) => set((x) => { x.host = v.trim(); })),
      field('UDP port', s.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
      selectField('Scan mode', s.scanMode, [['auto', 'Auto (Sensitivity if available)'], ['typical', 'Slamtec typical'], ['sensitivity', 'Sensitivity'], ['dense', 'DenseBoost']], (v) => set((x) => { x.scanMode = v; })),
      field('Motor speed', s.motorRpm, (v) => set((x) => { x.motorRpm = Math.round(v); }), { unit: 'rpm', step: 60 }),
      h('p', { class: 'muted' }, '0 = sensor default (600 rpm = 10 Hz). Faster spins lower latency but fewer points per revolution.'),
    ] : null));

  out.push(fold(`details:${s.id}`, 'Details',
    t ? h('dl', { class: 'kv' },
      kv('Packets', `${t.pps}/s`), kv('Mode', t.modeName),
      kv('CRC errors', t.crcErrors), kv('Restarts', t.restarts),
      kv('Firmware', t.info?.firmware), kv('Serial', t.info?.serial),
      kv('Health', t.health ? ['good', 'warning', 'error'][t.health.status] + (t.health.errorCode ? ` (0x${t.health.errorCode.toString(16)})` : '') : null),
      kv('Detections', `${t.detections} · ${t.rejected} large`))
      : h('p', { class: 'muted' }, 'No data yet.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', disabled: !t, onclick: () => run(cmd('sensor.restart', { id: s.id }), 'Restarting') }, 'Restart'),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (!await confirmBox(`Delete sensor ${s.id} "${s.name}"?`, 'Delete', true)) return;
        editProfile((p) => { p.sensors = p.sensors.filter((x) => x.id !== s.id); });
        ctx.select(null);
      } }, 'Delete sensor'))));
  return out;
}

/**
 * Sensor network, all from the app (no other software): is this computer on the sensors' network (and set it up if
 * it is not), which S2E units answer, and put each one on its wall — the app gives it its address and only reports
 * success once the unit answers there with the same serial number.
 */
export function discoverModal(ctx) {
  const body = h('div', { class: 'sensor-net' });
  modal('Sensor network', body);
  const busy = new Map(); // host → 'Setting 192.168.11.11…' while a unit is being re-addressed
  let last = null;
  const check = (ok, ...text) => h('div', { class: `check${ok ? ' done' : ''}` }, h('span', { class: 'mark' }, ok ? '✓' : '!'), h('span', { class: 't' }, ...text));
  const search = (everywhere = false) => {
    body.replaceChildren(h('p', { class: 'muted', style: { marginTop: 0 } }, everywhere ? 'Searching every network of this computer for RPLIDAR S2E units…' : 'Searching the sensor network for RPLIDAR S2E units…'));
    cmd('sensor.discover', everywhere === true ? { everywhere: true } : undefined).then((r) => { last = r; show(r); }).catch((e) => body.replaceChildren(h('div', { class: 'callout bad' }, e.message), againRow()));
  };
  const againRow = () => h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => search() }, 'Search again'),
    h('button', { class: 'btn small', onclick: () => search(true), title: 'Also probe the other networks of this computer (slower)' }, 'Search every network'));
  const wallLabel = (id) => { const w = P().walls.find((x) => x.id === id); return w ? `${w.id} · ${w.name}` : id; };

  function computerPart(net) {
    net = { unconfigured: [], serverIp: '192.168.11.5', ...net };
    if (net.reachable) return check(true, `This computer is on the sensor network: ${net.via.ip} (${net.via.name}).`);
    return h('div', {},
      check(false, `This computer has no address on 192.168.11.x, where new sensors answer. It has: ${net.have || 'no network address'}.`),
      net.unconfigured.length
        ? net.unconfigured.map((n) => h('div', { class: 'callout attn' },
          `“${n.name}” is plugged into a network without DHCP (${n.ip}): that is what the card on the sensors’ switch looks like. `,
          store.state.local
            ? h('button', { class: 'btn small primary', onclick: (e) => {
              e.target.disabled = true;
              run(cmd('net.setSensorNic', { iface: n.name }), `${n.name} now has ${net.serverIp} — searching for the sensors`).then((x) => { if (x) setTimeout(search, 2500); else e.target.disabled = false; });
            } }, `Use it for the sensors (${net.serverIp})`)
            : h('span', { class: 'muted' }, 'Do it on the server itself (Windows asks for administrator rights there).'),
          h('div', { class: 'muted', style: { marginTop: '6px' } }, 'Windows asks for administrator rights. Only that card changes; the Wi-Fi and the other networks stay as they are.')))
        : h('p', { class: 'muted' }, `Connect a network card of this computer to the sensors’ PoE switch and Search again — the app then offers to give it ${net.serverIp}. (By hand: Windows Settings › Network › Ethernet › IP assignment › Manual, ${net.serverIp} / 255.255.255.0.)`));
  }

  /** Default wall for a new unit: a wall whose sensor is waiting for it, else a wall without sensors, else the first. */
  function defaultWall(r) {
    const W = P().walls;
    return (W.find((w) => r.suggest?.[w.id]?.sensorId) || W.find((w) => !P().sensors.some((x) => x.wallId === w.id && x.enabled)) || W[0])?.id;
  }

  function unitRow(f, r) {
    const info = `${f.info ? `serial ${f.info.serial} · firmware ${f.info.firmware}` : 'no device info'} · health ${['good', 'warning', 'error'][f.health.status] || f.health.status}`;
    const head = h('div', { class: 't' }, `${f.host}${f.factoryDefault ? ' (factory address)' : ''}`, h('small', {}, info));
    if (f.usedBy) {
      const s = P().sensors.find((x) => x.id === f.usedBy);
      return h('div', { class: 'item unit', style: { cursor: 'default' } }, head, badge(`${f.usedBy}${s ? ` · ${s.wallId}` : ''}`, 'ok'),
        h('button', { class: 'btn small', onclick: () => otherAddress(f, s?.wallId, s?.id) }, 'Change address…'));
    }
    if (busy.has(f.host)) return h('div', { class: 'item unit', style: { cursor: 'default' } }, head, busy.get(f.host));
    let wallId = defaultWall(r);
    const ipOf = () => r.suggest?.[wallId]?.ip;
    const to = h('span', { class: 'to tnum' });
    const put = h('button', { class: 'btn small primary', onclick: () => assign(f, wallId, ipOf(), r.suggest?.[wallId]?.sensorId) });
    const paint = () => {
      const ip = ipOf();
      to.textContent = !ip ? '' : ip === f.host ? `stays ${ip}` : `→ ${ip}`;
      put.textContent = `Put on ${wallId}`;
      put.disabled = !ip || !r.network.reachable;
    };
    paint();
    return h('div', { class: 'item unit', style: { flexWrap: 'wrap', cursor: 'default' } }, head,
      selectField('', wallId, P().walls.map((w) => [w.id, wallLabel(w.id)]), (v) => { wallId = v; paint(); }, { inline: true }),
      to, put,
      h('button', { class: 'linkish', onclick: () => otherAddress(f, wallId, r.suggest?.[wallId]?.sensorId) }, 'Other address…'));
  }

  async function otherAddress(f, wallId, sensorId) {
    const ip = await promptBox(`New address for the sensor at ${f.host}`, r0(f.host), 'Set address');
    if (ip) assign(f, wallId, ip.trim(), sensorId);
  }
  const r0 = (host) => (last?.suggest?.[defaultWall(last)]?.ip) || host;

  function assign(f, wallId, ip, sensorId) {
    if (!ip) return;
    const assignTo = sensorId ? { sensorId, wallId } : { wallId };
    if (ip === f.host) { // already on the right address: just put it on its wall
      editProfile((q) => {
        const s = (sensorId && q.sensors.find((x) => x.id === sensorId)) || null;
        if (s) Object.assign(s, { driver: 's2e', host: ip, port: 8089, enabled: true });
        else {
          const w = q.walls.find((x) => x.id === wallId);
          q.sensors.push({ id: nextId(q.sensors, 'S'), name: `LiDAR ${wallId}`, wallId, driver: 's2e', host: ip, port: 8089, pose: { x: w.width / 2, y: w.height + 0.3, rotation: -90 } });
        }
      }, 'add discovered sensor');
      toast(`${ip} is on ${wallId} — next: background and Auto-align with the room empty`, 'ok');
      setTimeout(search, 800);
      return;
    }
    // a real S2E is silent for 10–65 s while it restarts on its new address: count the seconds so it never looks hung
    const t0 = Date.now();
    const label = h('span', { class: 'muted tnum restarting' });
    const tick = () => { label.textContent = `Setting ${ip}… the sensor is restarting: ${Math.round((Date.now() - t0) / 1000)} s (it can take a minute — leave it plugged in)`; };
    tick();
    const timer = setInterval(tick, 1000);
    busy.set(f.host, label);
    show(last);
    cmd('sensor.readdress', { host: f.host, ip, assign: assignTo }).then((x) => {
      if (x.pending) toast(`${x.sensorId || 'The sensor'}${x.wallId ? ` · ${x.wallId}` : ''}: sent to ${x.ip}, not answering yet after ${Math.round(x.ms / 1000)} s — it is still restarting and connects by itself when it answers. Not within 2 minutes? Power-cycle it and Search.`, 'warn');
      else toast(`${x.sensorId} · ${x.wallId}: the sensor answers on ${x.ip} after ${Math.round(x.ms / 1000)} s (serial ${x.serial || '—'}) — next: background and Auto-align`, 'ok');
    }).catch((e) => {
      toast(e.message, 'bad');
    }).finally(() => { clearInterval(timer); busy.delete(f.host); search(); });
  }

  function show(r) {
    const units = r.found.map((f) => unitRow(f, r));
    const factory = r.found.filter((f) => f.factoryDefault).length;
    const waiting = P().walls.filter((w) => r.suggest?.[w.id]?.sensorId).map((w) => `${w.id} (${r.suggest[w.id].ip})`);
    body.replaceChildren(...[
      sec('This computer', computerPart(r.network)),
      sec('Sensors',
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Every new S2E ships with the same address (192.168.11.2), so only one answers there at a time: plug in new sensors ONE at a time — plug one in, Search, put it on its wall; then the next. Which unit is which? The one you just plugged in.'),
        units.length ? h('div', { class: 'list' }, units)
          : h('p', {}, r.network.reachable ? `No sensor answered on ${r.network.via.name} (${r.network.via.ip}). A sensor that was just plugged in needs up to a minute before it answers: wait and Search again. Still nothing? Check the switch port, the cable and its 12 V supply (a new unit stays still — no spinning, no light — until the app starts it).` : 'No sensor can answer until this computer is on their network (above).'),
        factory > 1 ? h('div', { class: 'callout attn' }, 'More than one unit is on the factory address: unplug all new ones but one.') : null,
        waiting.length ? h('p', { class: 'muted' }, `Walls waiting for their sensor: ${waiting.join(', ')}.`) : null,
        r.running.length ? h('p', { class: 'muted' }, `Running now (not asked, it would interrupt them): ${r.running.map((x) => `${x.host}${x.usedBy ? ` = ${x.usedBy}` : ''}`).join(', ')}`) : null),
      againRow(),
    ].filter(Boolean)); // replaceChildren would print a null as text
  }
  search();
}

/** Auto-align: proposes the pose from the floor + side-wall lines the sensor sees. */
// Results of Auto-align / Level check per sensor: the Sensors panel re-renders on every status message
// (~2 Hz), so they live here, not in the DOM.
const sensorResults = { align: new Map(), level: new Map() };

function autoAlignBox(s, t) {
  const out = h('div');
  const show = (r) => {
    if (!r) { out.replaceChildren(); return; }
    if (r.pending) { out.replaceChildren(h('p', { class: 'muted' }, 'Fitting floor and side walls…')); return; }
    if (!r.ok) { out.replaceChildren(h('div', { class: 'callout bad' }, r.error)); return; }
    const p = r.pose;
    const wall = P().walls.find((w) => w.id === s.wallId);
    const widthWarn = r.widthDiff !== null && Math.abs(r.widthDiff) > 0.03;
    const done = () => { sensorResults.align.delete(s.id); show(null); };
    // Left/right: the empty room (floor + two side walls) looks the same mirrored, so Auto-align takes the side from
    // the approximate pose. A hand near the LEFT end settles it (XR Lab: all four sensors were mirrored).
    const side = r.side || null;
    const checkSide = () => {
      set({ ...r, side: { pending: true } });
      cmd('sensor.sideCheck', { id: s.id, pose: p }).then((x) => set({ ...r, side: x }))
        .catch((e) => set({ ...r, side: { error: e.message } }));
    };
    const flip = () => {
      set({ pending: true });
      cmd('sensor.autoAlign', { id: s.id, mirror: !p.mirror }).then(set).catch((e) => { sensorResults.align.delete(s.id); show(null); toast(e.message, 'bad'); });
    };
    const sideRow = !side
      ? h('div', { class: 'side-check' }, h('span', {}, h('b', {}, 'Left or right? '), `Put one hand flat on ${wall.id} near its LEFT end (seen from the room) and press Check side — the empty room looks the same mirrored.`),
        h('button', { class: 'btn small', onclick: checkSide }, 'Check side'))
      : side.pending ? h('div', { class: 'side-check muted' }, `Waiting for one hand near the left end of ${wall.id}…`)
        : side.error ? h('div', { class: 'side-check' }, h('span', { style: { color: 'var(--attn)' } }, side.error), h('button', { class: 'btn small', onclick: checkSide }, 'Check again'))
          : side.side === 'left' ? h('div', { class: 'side-check' }, `✓ Your hand is on the left (x ${side.x} m): left and right are right.`)
            : side.side === 'middle' ? h('div', { class: 'side-check' }, h('span', {}, `Your hand is near the middle (x ${side.x} m of ${side.width}) — touch closer to the left end.`), h('button', { class: 'btn small', onclick: checkSide }, 'Check again'))
              : h('div', { class: 'side-check' }, h('span', { style: { color: 'var(--attn)' } }, `Your hand came out on the RIGHT (x ${side.x} m): the sensor sees this wall mirrored.`),
                h('button', { class: 'btn small primary', onclick: flip }, 'Flip left/right and align again'));
    out.replaceChildren(h('div', { class: 'callout ok' },
      h('div', {}, h('b', {}, 'Proposed pose: '), `x ${p.x} m · y ${p.y} m · ${p.rotation}°${p.mirror ? ' · mirrored' : ''}`),
      h('div', { class: 'muted' }, `Seen: floor${r.seen.left ? ' · left wall' : ''}${r.seen.right ? ' · right wall' : ''} · floor fit ${r.floorRmsMm} mm · x from ${r.xFrom}${r.usedBackground ? '' : ' · from a live scan (capture the background for a steadier result)'}`),
      r.xWarn ? h('div', { style: { color: 'var(--attn)' } }, `Careful: ${r.xWarn}.`) : null,
      r.measuredWidth !== null && r.widthTrusted !== false ? h('div', { style: { color: widthWarn ? 'var(--attn)' : undefined } }, `Wall width measured between neighbours: ${r.measuredWidth} m (plans: ${wall.width} m${widthWarn ? ` — ${r.widthDiff > 0 ? '+' : ''}${Math.round(r.widthDiff * 1000)} mm, check the plans or the corners` : ''})`) : null,
      sideRow,
      h('div', { class: 'actions' },
        h('button', { class: `btn small${side?.side === 'left' ? ' primary' : ''}`, onclick: () => editProfile((q) => { q.sensors.find((x) => x.id === s.id).pose = { ...p }; }, 'auto-align sensor').then(() => { done(); toast('Pose applied', 'ok'); }) }, side?.side === 'left' ? 'Apply' : 'Apply without checking'),
        widthWarn && r.widthTrusted !== false ? h('button', { class: 'btn small', onclick: () => editProfile((q) => { q.walls.find((w) => w.id === s.wallId).width = r.measuredWidth; }, 'wall width from sensor') }, `Use ${r.measuredWidth} m as wall width`) : null,
        h('button', { class: 'btn small', onclick: done }, 'Dismiss'))));
  };
  const set = (r) => { if (r) sensorResults.align.set(s.id, r); show(r); };
  show(sensorResults.align.get(s.id));
  return h('div', { style: { margin: '6px 0 10px' } },
    h('button', { class: 'btn small', disabled: !t || t.state !== 'scanning', onclick: () => {
      set({ pending: true });
      cmd('sensor.autoAlign', { id: s.id }).then(set).catch((e) => { sensorResults.align.delete(s.id); show(null); toast(e.message, 'bad'); });
    } }, 'Auto-align (room empty)'),
    out);
}

function levelCheckBox(s, t) {
  const out = h('div');
  const show = (r) => {
    if (!r) { out.replaceChildren(); return; }
    if (r.pending) { out.replaceChildren(h('p', { class: 'muted' }, 'Checking the static returns…')); return; }
    const done = () => { sensorResults.level.delete(s.id); if (store.level?.sensorId === s.id) store.level = null; show(null); };
    out.replaceChildren(h('div', { class: `callout ${r.ok ? 'ok' : 'bad'}` },
      ...r.advice.map((a) => h('div', {}, a)),
      h('div', { class: 'muted' }, `Floor seen ${Math.round(r.floorCoverage * 100)} % of the width · ${r.counts.grazing} returns inside the wall`
        + `${r.counts.masked ? ` · ${r.counts.masked} inside masks (ignored)` : ''} · live data (last 0.5 s): keep the wall clear, re-check after each adjustment`),
      h('div', { class: 'muted' }, 'A plane too FAR from the wall is not visible here: check 1.5–3 cm with a ruler at a few points.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: done }, r.ok ? 'Dismiss' : 'Hide marks'))));
  };
  const set = (r) => {
    if (r && !r.pending) {
      sensorResults.level.set(s.id, r);
      store.level = r.ok ? null : { sensorId: s.id, wallId: r.wallId, grazing: r.grazing, region: r.grazingRegion, floorGaps: r.floorGaps };
    } else if (r) sensorResults.level.set(s.id, r);
    show(r);
  };
  show(sensorResults.level.get(s.id));
  return h('div', { style: { margin: '6px 0 10px' } },
    h('button', { class: 'btn small', disabled: !t || t.state !== 'scanning', title: 'Does the scan plane touch the wall? Is the floor seen from corner to corner?', onclick: () => {
      set({ pending: true });
      cmd('sensor.levelCheck', { id: s.id }).then(set).catch((e) => { sensorResults.level.delete(s.id); show(null); toast(e.message, 'bad'); });
    } }, 'Level check'),
    out);
}

// ======================================================================= CALIBRATE

export function calibrate(ctx) {
  const c = store.status?.calib;
  const vs = store.status?.verify;
  const other = otherControl();
  if ((c || vs) && other) {
    // view-only: follow the session, but its controls belong to the device that drives it
    const view = c ? calibSession(c, ctx) : verifySession(vs);
    for (const s of view) s.querySelectorAll?.('.actions .btn:not([data-always])').forEach((b) => { b.disabled = true; }); // (Discard / Exit always work)
    return [sec(null, h('p', {}, h('b', { style: { color: 'var(--attn)' } }, `${c ? 'Calibration' : 'Verification'} driven by ${other.device}.`),
      ' You can follow it here; to drive it from this device, take control.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn attn', onclick: () => ctx.takeControl() }, 'Take control'))), ...view];
  }
  if (c) return calibSession(c, ctx);
  if (vs) return verifySession(vs);
  const prof = P();
  const wallId = ctx.calibWall && prof.walls.some((w) => w.id === ctx.calibWall) ? ctx.calibWall : prof.walls[0]?.id;
  ctx.calibWall = wallId;
  const wall = prof.walls.find((w) => w.id === wallId);
  if (!wall) return [sec('Calibrate', h('p', { class: 'muted' }, 'Add a wall first.'))];
  return [
    sec('Wall to calibrate', h('div', { class: 'seg', style: { flexWrap: 'wrap', height: 'auto' } }, prof.walls.map((w) =>
      h('button', { class: w.id === wallId ? 'on' : '', style: { height: 'var(--ctl-h)' }, onclick: () => { ctx.calibWall = w.id; ctx.rerender(); } }, w.id)))),
    calibChecklist(wall),
    // the pixel map: a metre grid through every wall's mapping, on the projection page and the Texture outputs
    sec('Pixel map', toggle('Grid on the walls', !!store.state.grid, (on) => run(cmd('projection.set', { grid: on })), '0.5 m / 1 m lines, wall ids, centre cross'),
      h('p', { class: 'muted' }, 'Check that the grid fits the physical walls before calibrating. The targets of a calibration are drawn on it too.')),
    calibTargets(ctx),
    calibStart(ctx, wall),
    calibCurrent(ctx, wall),
  ];
}

/** The sensors of a wall, and which of them run / have a background. */
export function wallReadiness(wall) {
  const st = store.status?.sensors || {};
  const sensors = P().sensors.filter((s) => s.wallId === wall.id && s.enabled);
  return {
    sensors,
    running: sensors.filter((s) => st[s.id] && st[s.id].state === 'scanning'),
    withBg: sensors.filter((s) => st[s.id]?.background),
    calibrated: sensors.filter((s) => s.calibration),
  };
}

/** "Before you start": sensors running, background captured, projection open (each with its fix). */
export function calibChecklist(wall) {
  const { sensors, running, withBg } = wallReadiness(wall);
  const check = (done, text, action) => h('div', { class: `check${done ? ' done' : ''}` }, h('span', { class: 'mark' }, done ? '✓' : ''), h('span', { class: 't' }, text), action);
  return sec('Before you start', h('div', { class: 'checklist' },
    check(sensors.length > 0 && running.length === sensors.length, `${running.length}/${sensors.length} sensors of ${wall.id} running`),
    check(sensors.length > 0 && withBg.length === sensors.length, 'Background captured with the room empty',
      h('div', { class: 'acts-inline' },
        h('button', { class: 'btn small', disabled: !running.length, onclick: () => captureBackground({ wallId: wall.id }, wall.id) }, `Capture ${wall.id}`),
        h('button', { class: 'btn small', disabled: !running.length, onclick: () => captureBackground({}, 'all sensors') }, 'All walls'))),
    projectionCheck(check)));
}

/** How many targets, where (heights) and how long to hold. */
export function calibTargets(ctx) {
  const opt = ctx.calibOpt;
  return sec('Targets',
    h('p', { class: 'muted' }, 'A grid of targets within reach. More targets = better accuracy; 3 × 3 is a good default.'),
    h('div', { class: 'grid2' },
      selectField('Columns', opt.cols, [[2, '2'], [3, '3'], [4, '4'], [5, '5']], (v) => { opt.cols = v; ctx.rerender(); }, { inline: true, numeric: true }),
      selectField('Rows', opt.rows, [[2, '2'], [3, '3'], [4, '4']], (v) => { opt.rows = v; ctx.rerender(); }, { inline: true, numeric: true }),
      field('Lowest target (m)', opt.bottom, (v) => { opt.bottom = v; }, { inline: true, step: 0.05 }),
      field('Highest target (m)', opt.top, (v) => { opt.top = v; }, { inline: true, step: 0.05 })),
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Hold time'), selectField('', opt.holdMs, [[500, '0.5 s'], [700, '0.7 s'], [1000, '1 s'], [1500, '1.5 s']], (v) => { opt.holdMs = v; }, { inline: true, numeric: true })));
}

/** The start button, and the real reason when it cannot start. */
export function calibStart(ctx, wall) {
  const st = store.status?.sensors || {};
  const { sensors, running, withBg } = wallReadiness(wall);
  const opt = ctx.calibOpt;
  return sec(null,
    h('button', { class: 'btn primary block', disabled: !running.length, onclick: () => run(cmd('calib.start', { wallId: wall.id, cols: opt.cols, rows: opt.rows, top: opt.top, bottom: opt.bottom, holdMs: opt.holdMs, force: withBg.length !== sensors.length && ctx.forceCalib })) },
      `Start calibration of ${wall.id}`),
    !sensors.length ? h('p', { class: 'muted' }, `${wall.id} has no sensor: add one in Sensors.`)
      : !running.length ? h('p', { class: 'muted' }, `No sensor of ${wall.id} is running (${sensors.map((s) => `${s.id}: ${st[s.id]?.state || 'stopped'}`).join(', ')}) — check them in Sensors.`)
        : withBg.length !== sensors.length ? h('p', { class: 'muted' }, 'Capture the background first — without it the floor and side walls look like hands.') : null);
}

/** The wall's current calibration, and Verify. */
export function calibCurrent(ctx, wall) {
  const { sensors, running } = wallReadiness(wall);
  const opt = ctx.calibOpt;
  return sec('Current calibration', h('div', { class: 'list' }, sensors.map((s) => h('div', { class: 'item', onclick: () => ctx.select('sensor', s.id) },
    h('div', { class: 't' }, `${s.id} · ${s.name}`), s.calibration ? badge(`${s.calibration.rmsMm} mm RMS`, s.calibration.rmsMm < 10 ? 'ok' : 'warn') : badge('not calibrated')))),
    h('p', { class: 'muted' }, 'Verify touches 5 new points (not the calibration ones) and measures the error of the real tracked touch — what the outputs send.'),
    h('button', { class: 'btn block', disabled: !running.length, onclick: () => run(cmd('verify.start', { wallId: wall.id, top: opt.top, bottom: opt.bottom })) }, `Verify ${wall.id}`));
}

/** ctx.fixWorst(v): the remote offers to fix the worst point with the hand (Fit) when the verification fails. */
export function verifySession(v, ctx) {
  const total = v.targets.length;
  if (v.phase === 'done') {
    const s = v.summary;
    const lim = verifyPassMm(P().walls.find((w) => w.id === v.wallId));
    const good = s && s.maxMm <= lim;
    const worst = s ? v.targets.reduce((b, t, k) => (t.errMm !== null && (b < 0 || t.errMm > v.targets[b].errMm) ? k : b), -1) : -1;
    return [sec(`Verification of ${v.wallId}`,
      s ? h('div', { class: `callout ${good ? 'ok' : 'attn'}` }, `Mean error ${s.meanMm} mm · worst ${s.maxMm} mm on ${s.n} points. `,
        good ? `Good for hands (limit ${lim} mm).` : ctx?.fixWorst ? `Over the ${lim} mm limit at point ${worst + 1}: fix it there with your hand.` : `Over the ${lim} mm limit: recalibrate, or redo the worst calibration point.`) : h('p', { class: 'muted' }, 'No point measured.'),
      !good && s && ctx?.fixWorst ? h('button', { class: 'btn primary block big', onclick: () => ctx.fixWorst(v, worst) }, `Fix point ${worst + 1} with your hand`) : null,
      h('table', { class: 'calib-table' },
        h('tr', {}, h('th', {}, 'Point'), h('th', {}, 'Target (m)'), h('th', {}, 'Measured (m)'), h('th', {}, 'Error')),
        v.targets.map((t, k) => h('tr', {}, h('td', {}, String(k + 1)), h('td', {}, `${t.x.toFixed(2)}, ${t.y.toFixed(2)}`),
          h('td', {}, t.measured ? `${t.measured[0].toFixed(3)}, ${t.measured[1].toFixed(3)}` : '—'), h('td', {}, t.errMm !== null ? `${t.errMm} mm` : '—')))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => run(cmd('verify.cancel')) }, 'Done')))];
  }
  const msg = v.phase === 'release' ? 'Measured — take your hand off the wall.' : v.phase === 'holding' ? 'Hold still…' : 'Touch the amber check point with an open hand.';
  return [
    sec(null, h('div', { class: 'calib-big' },
      h('div', { class: 'ring', html: ringSvg(v.phase === 'release' ? 1 : v.progress, v.phase === 'release') }),
      h('div', { class: 'step tnum' }, `Check ${Math.min(v.index + 1, total)} / ${total}`),
      h('div', { class: 'msg' }, msg),
      h('div', { class: 'muted' }, v.targets.filter((t) => t.errMm !== null).map((t, k) => `#${k + 1} ${t.errMm} mm`).join(' · ') || `${v.wallId} · verification`))),
    sec(null, h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn danger', 'data-always': '', onclick: () => run(cmd('verify.cancel')) }, 'Stop'))),
  ];
}

export function calibSession(c, ctx) {
  const total = c.targets.length;
  const wall = P().walls.find((w) => w.id === c.wallId);
  if (c.phase === 'done') {
    const rows = Object.entries(c.result || {});
    const ok = rows.some(([, r]) => r.ok);
    const vd = calibVerdict(c.result), rms = Math.round(vd.rmsMm);
    const canRedo = ok && c.worst >= 0, startOver = ok && vd.bad && (vd.startOver || !canRedo), redoFirst = ok && vd.bad && !startOver; // a bad result is never saved by default
    const apply = () => run(cmd('calib.apply'), 'Calibration saved — verify it with “Verify”');
    const applyAnyway = async () => {
      if (!await confirmBox(`This calibration is off by ${rms} mm on average — hands will land ${rms} mm away. Save it anyway?`, 'Save it anyway', true)) return;
      apply();
    };
    const redoBtn = (cls) => h('button', { class: `btn ${cls}`.trim(), onclick: () => run(cmd('calib.redo', { index: c.worst })) }, `Redo worst point (#${c.worst + 1})`);
    const o = ctx?.calibOpt;
    const startOverBtn = (cls) => h('button', { class: `btn ${cls}`.trim(), onclick: async () => {
      await run(cmd('calib.cancel'));
      if (o) run(cmd('calib.start', { wallId: c.wallId, cols: o.cols, rows: o.rows, top: o.top, bottom: o.bottom, holdMs: o.holdMs }));
    } }, 'Start over');
    return [
      sec(`Calibration of ${c.wallId} — result`,
        h('table', { class: 'calib-table' },
          h('tr', {}, h('th', {}, 'Sensor'), h('th', {}, 'Type'), h('th', {}, 'Points'), h('th', {}, 'RMS'), h('th', {}, 'Worst')),
          rows.map(([sid, r]) => h('tr', {}, h('td', {}, sid), h('td', {}, r.ok ? r.kind : h('span', { style: { color: 'var(--danger)' } }, r.error)),
            h('td', {}, String(r.points)), h('td', {}, r.ok ? `${r.rmsMm} mm` : '—'), h('td', {}, r.ok ? `${r.maxMm} mm` : '—')))),
        vd.bad ? h('p', { style: { color: 'var(--attn)' } }, `This calibration is off by ${rms} mm on average (worst ${vd.maxMm} mm): hands would land that far from where they touch. ${startOver ? 'Too many points are off — start over.' : `Redo the worst point (#${c.worst + 1}) before saving.`}`)
          : h('p', { class: 'muted' }, 'Below ~10 mm RMS is excellent for hands. A single large worst point usually means that target was touched off-centre — redo it with “Redo worst point”.'),
        h('div', { class: 'actions' },
          startOver ? startOverBtn('primary') : redoFirst ? redoBtn('primary') : h('button', { class: 'btn primary', disabled: !ok, onclick: apply }, 'Apply & save'),
          ok && vd.bad ? h('button', { class: 'btn', onclick: applyAnyway }, 'Apply & save') : null,
          canRedo && !redoFirst && !startOver ? redoBtn('attn') : null,
          canRedo && startOver ? redoBtn('') : null,
          h('button', { class: 'btn', onclick: () => run(cmd('calib.back')) }, 'Back'),
          h('button', { class: 'btn danger', 'data-always': '', onclick: () => run(cmd('calib.cancel')) }, 'Discard'))),
    ];
  }
  const msg = c.phase === 'release' ? 'Captured — take your hand off the wall.'
    : c.phase === 'holding' ? 'Hold still…'
      : c.autoRedo ? `Target ${c.autoRedo.index + 1} did not match the others (${c.autoRedo.errMm} mm off) — touch it again, on the centre of the dot.`
        : `${c.redoing ? `Redoing target ${c.index + 1}. ` : ''}Touch and hold the amber target on ${wall?.name || c.wallId} with an open hand.`;
  const ring = h('div', { class: 'ring', html: ringSvg(c.phase === 'release' ? 1 : c.progress, c.phase === 'release') });
  return [
    sec(null, h('div', { class: 'calib-big' },
      ring,
      h('div', { class: 'step tnum' }, `Target ${Math.min(c.index + 1, total)} / ${total}`),
      h('div', { class: 'msg' }, msg),
      wall ? h('div', { class: 'target-map', html: targetMapSvg(wall, c) }) : null,
      h('div', { class: 'muted' }, `${c.wallId} · ${c.sensorIds.join(', ')}`))),
    sec(null, h('div', { class: 'actions', style: { justifyContent: 'center' } },
      h('button', { class: 'btn', disabled: c.index === 0, onclick: () => run(cmd('calib.back')) }, '← Back'),
      h('button', { class: 'btn', onclick: () => run(cmd('calib.skip')) }, 'Skip target'))),
    sec(null, h('div', { class: 'actions', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'linkish danger-ink', onclick: async () => {
        if (await confirmBox(`Cancel the calibration of ${c.wallId}? The targets captured so far are discarded; the current calibration stays.`, 'Cancel calibration', true)) run(cmd('calib.cancel'));
      } }, 'Cancel calibration…'))),
  ];
}

/** Miniature of the wall with all targets: where am I, which one is next, which are done. */
function targetMapSvg(wall, c) {
  const W = 300, H = Math.round((W * wall.height) / wall.width);
  const X = (x) => (x / wall.width) * W, Y = (y) => H - (y / wall.height) * H;
  const dots = c.targets.map((t, k) => {
    const cur = k === c.index && c.phase !== 'done';
    const col = cur ? '#E5B567' : t.captured.length ? '#7FC4A2' : t.skipped ? '#6D6D6D' : '#8C8C8C';
    return `<circle cx="${X(t.x)}" cy="${Y(t.y)}" r="${cur ? 9 : 5}" fill="${cur || t.captured.length ? col : 'none'}" stroke="${col}" stroke-width="2"/>` +
      `<text x="${X(t.x) + 11}" y="${Y(t.y) + 4}" fill="#8C8C8C" font-size="11" font-family="Geist, system-ui">${k + 1}</text>`;
  }).join('');
  return `<svg viewBox="-12 -12 ${W + 24} ${H + 24}" width="100%"><rect x="0" y="0" width="${W}" height="${H}" fill="#161616" stroke="rgba(255,255,255,0.25)"/>${dots}</svg>`;
}

export function ringSvg(p, done) {
  const r = 52, C = 2 * Math.PI * r;
  const col = done ? '#7FC4A2' : '#E5B567';
  return `<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#262626" stroke-width="8"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0, Math.min(1, p)))}" transform="rotate(-90 60 60)"/>
  <circle cx="60" cy="60" r="14" fill="none" stroke="${col}" stroke-width="2"/><path d="M60 38v12M60 70v12M38 60h12M70 60h12" stroke="${col}" stroke-width="2"/></svg>`;
}

// ======================================================================= ZONES

const slugAddr = (s) => `/${String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item'}`;

const SHAPE_NAME = { rect: 'Rect', polygon: 'Polygon', circle: 'Circle' };

/** One line describing a zone's place and size, for the lists. */
function zoneLine(x) {
  const unit = x.space === 'canvas' ? 'px' : 'm';
  const f = unit === 'px' ? (v) => String(Math.round(v)) : (v) => v.toFixed(2);
  const size = x.shape === 'circle' ? `Ø ${f(x.circle.r * 2)} ${unit}` : `${f(Math.abs(x.rect.x1 - x.rect.x0))} × ${f(Math.abs(x.rect.y1 - x.rect.y0))} ${unit}`;
  const where = x.space === 'canvas' ? `canvas${x.walls?.length ? ` · ${x.walls.join(' + ')}` : ' · off every wall'}` : x.wallId;
  return `${x.id} · ${SHAPE_NAME[x.shape] || 'Rect'} · ${size} · ${where}`;
}

export function zones(ctx) {
  const prof = P();
  const onCanvas = ctx.ws.space === 'canvas';
  const wallId = ctx.ws.focus || prof.walls[0]?.id;
  const wall = prof.walls.find((w) => w.id === wallId);
  const z = ctx.sel?.kind === 'zone' ? prof.zones.find((x) => x.id === ctx.sel.id) : null;
  const m = ctx.sel?.kind === 'mask' && !onCanvas ? wall?.masks.find((x) => x.id === ctx.sel.id) : null;
  const tool = (t, label) => h('button', { class: `btn small${ctx.ws.tool === t ? ' attn' : ''}`, onclick: () => { ctx.ws.tool = t; ctx.rerender(); } }, label);
  const item = (x) => h('div', { class: `item${z?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('zone', x.id, x.wallId) },
    h('div', { class: 't' }, x.name, h('small', {}, zoneLine(x))),
    store.live?.zones?.[x.id]?.active ? badge(`active · ${store.live.zones[x.id].count}`, 'warn') : null,
    x.space === 'canvas' && !onCanvas ? badge('canvas') : null,
    !x.enabled ? badge('off') : null);
  const out = [];
  if (onCanvas) {
    const zl = prof.zones.filter((x) => x.space === 'canvas');
    out.push(sec(['Canvas zones', h('span', { class: 'grow' }), tool('zone', '+ Draw zone')],
      h('p', { class: 'muted' }, `Drawn in output-canvas pixels (${prof.canvas.width} × ${prof.canvas.height}), over the content: a zone can span walls (a door painted across a corner). Touches reach it through each wall's Mapping.`),
      zl.length ? h('div', { class: 'list' }, zl.map(item)) : h('p', { class: 'muted' }, 'No canvas zones yet. Dashed outlines are wall zones — edit those in Wall.')));
  } else {
    const zl = prof.zones.filter((x) => (x.space === 'canvas' ? (x.walls || []).includes(wallId) : x.wallId === wallId));
    out.push(sec([`Zones on ${wallId || '—'}`, h('span', { class: 'grow' }), tool('zone', '+ Draw zone')],
      h('p', { class: 'muted' }, 'Each zone sends enter / hold / exit and a live count. Rect, polygon or circle; drag to move, handles reshape. Canvas zones (dashed) are edited in Canvas.'),
      zl.length ? h('div', { class: 'list' }, zl.map(item)) : h('p', { class: 'muted' }, 'No zones on this wall yet.')),
    sec([`Masks on ${wallId || '—'}`, h('span', { class: 'grow' }), tool('mask', '+ Draw mask')],
      h('p', { class: 'muted' }, 'Ignored areas: a door, a lamp crossing the scan plane, a speaker… (rect or polygon)'),
      wall?.masks.length ? h('div', { class: 'list' }, wall.masks.map((x) => h('div', { class: `item${m?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('mask', x.id, wallId) },
        h('div', { class: 't' }, x.name, h('small', {}, `${x.id} · ${x.type === 'polygon' ? `polygon, ${x.points.length} points · ` : ''}${(Math.abs(x.x1 - x.x0)).toFixed(2)} × ${(Math.abs(x.y1 - x.y0)).toFixed(2)} m`))))) : h('p', { class: 'muted' }, 'No masks.')));
  }
  if (z) out.push(zoneEditor(z, ctx));
  if (m) {
    const set = (fn, label = 'edit mask') => editProfile((p) => fn(p.walls.find((w) => w.id === wallId).masks.find((x) => x.id === m.id)), label);
    out.push(sec(`Mask ${m.id}`,
      field('Name', m.name, (v) => set((x) => { x.name = v; }, 'rename mask')),
      m.type === 'polygon'
        ? h('p', { class: 'muted' }, `Polygon · ${m.points.length} points. Drag a point to move it, drag a midpoint to add one, double-click a point (or select it and press Delete) to remove it.`)
        : h('div', { class: 'grid4' }, ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, m[k], (v) => set((x) => { x[k] = v; }), { inline: true, step: 0.01 }))),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { const w = p.walls.find((q) => q.id === wallId); w.masks = w.masks.filter((x) => x.id !== m.id); }, 'delete mask'); ctx.select(null); } }, 'Delete mask'))));
  }
  return out;
}

function zoneEditor(z, ctx) {
  const prof = P();
  const set = (fn, label = 'edit zone') => editProfile((p) => fn(p.zones.find((x) => x.id === z.id)), label);
  const canvasZ = z.space === 'canvas';
  const unit = canvasZ ? 'px' : 'm', step = canvasZ ? 1 : 0.01;
  let geo;
  if (z.shape === 'circle') {
    geo = h('div', { class: 'grid4' },
      field('x', z.circle.x, (v) => set((x) => { x.circle.x = v; }), { inline: true, step }),
      field('y', z.circle.y, (v) => set((x) => { x.circle.y = v; }), { inline: true, step }),
      field('radius', z.circle.r, (v) => set((x) => { x.circle.r = Math.max(canvasZ ? 1 : 0.01, v); }), { inline: true, step }));
  } else if (z.shape === 'polygon') {
    geo = h('p', { class: 'muted' }, `Polygon · ${z.points.length} points (${unit}). Drag a point to move it, drag a midpoint to add one, double-click a point (or select it and press Delete) to remove it.`);
  } else {
    geo = h('div', { class: 'grid4' }, ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, z.rect[k], (v) => set((x) => { x.rect[k] = v; }), { inline: true, step })));
  }
  const fire = () => cmd('zone.fire', { id: z.id }).then(() => toast(`${z.name}: enter … exit sent to every output (marked as a test)`, 'ok')).catch((e) => toast(e.message, 'bad'));
  return sec(`Zone ${z.id}`,
    field('Name', z.name, (v) => set((x) => { x.name = v; }, 'rename zone')),
    canvasZ
      ? h('p', { class: 'muted' }, `On the output canvas (${SHAPE_NAME[z.shape]}, pixels) · covers ${z.walls?.length ? z.walls.join(', ') : 'no wall — move it onto a wall region'}`)
      : selectField('Wall', z.wallId, prof.walls.map((w) => [w.id, `${w.id} · ${w.name}`]), (v) => set((x) => { x.wallId = v; }, 'move zone to wall')),
    geo,
    field('Hold after', z.holdMs, (v) => set((x) => { x.holdMs = Math.round(v); }), { unit: 'ms', step: 100 }),
    field('Release after', z.releaseMs, (v) => set((x) => { x.releaseMs = Math.round(v); }), { unit: 'ms', step: 50 }),
    field('Min hands', z.minHands ?? 1, (v) => set((x) => { x.minHands = Math.max(1, Math.min(20, Math.round(v))); }, 'min hands'), { step: 1 }),
    h('p', { class: 'muted' }, 'Active only while at least this many touches are inside (2 = "two people together").'),
    field('Trigger address', z.address, (v) => set((x) => { x.address = v.trim(); }, 'trigger address'), { placeholder: slugAddr(z.name) }),
    toggle('Enabled', z.enabled, (on) => set((x) => { x.enabled = on; })),
    h('p', { class: 'muted' }, 'Touches OSC: ', h('code', {}, `/vt/zone/${z.id}/enter|hold|exit`), ' · Triggers output: ', h('code', {}, `${z.address || slugAddr(z.name)} 1|0`)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: fire, title: 'Make the zone active for a moment: enter … exit through every output, without touching the wall' }, 'Fire (test)'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.zones = p.zones.filter((x) => x.id !== z.id); }, 'delete zone'); ctx.select(null); } }, 'Delete zone')));
}

// ======================================================================= OUTPUTS (Output › Protocols)

export function outputs(ctx) {
  const prof = P();
  const stats = store.status?.outputs || {};
  const o = ctx.sel?.kind === 'output' ? prof.outputs.find((x) => x.id === ctx.sel.id) : null;
  const add = (type) => {
    const id = nextId(prof.outputs, 'O');
    editProfile((p) => {
      p.outputs.push({ id, name: { tuio: 'TUIO', triggers: 'Triggers', texture: 'Touch texture', webhook: 'Webhook', artnet: 'Art-Net', sacn: 'sACN' }[type] || 'OSC', type,
        host: { artnet: '255.255.255.255', sacn: 'multicast' }[type] || '127.0.0.1', port: { tuio: 3333, triggers: 7000, artnet: 6454, sacn: 5568 }[type] || 9000,
        walls: [], // the editor opens on this local copy before the engine has normalised it (it reads walls)
        ...(type === 'sacn' ? { universe: 1 } : {}) });
    }, `add ${type} output`);
    setTimeout(() => ctx.select('output', id));
  };
  const host = location.hostname || 'localhost';
  const out = [
    sec(['Destinations', h('span', { class: 'grow' }),
      h('button', { class: 'btn small primary', onclick: () => {
        const close = modal('Add a destination', h('div', { class: 'list' }, OUTPUT_TYPES.map(([type, title, what]) =>
          h('div', { class: 'item', onclick: () => { close(); add(type); } }, h('div', { class: 't' }, title, h('small', {}, what))))));
      } }, '+ Add…')],
      prof.outputs.length ? h('div', { class: 'list' }, prof.outputs.map((x) => {
        const s = stats[x.id];
        return h('div', { class: `item${o?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('output', x.id) },
          dot(x.enabled ? (s?.errors ? 'bad' : 'ok') : ''),
          h('div', { class: 't' }, x.name, h('small', {}, outputSummary(x))),
          badge(s ? `${s.sent} sent` : '—', s?.errors ? 'bad' : ''));
      })) : h('p', { class: 'muted' }, 'No destinations.')),
  ];
  if (o?.type === 'texture') out.push(...textureEditor(o, stats[o.id], ctx));
  else if (o?.type === 'webhook' || o?.type === 'artnet' || o?.type === 'sacn') out.push(zoneOutputEditor(o, stats[o.id], ctx));
  else if (o) {
    const set = (fn) => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)));
    const s = stats[o.id];
    const trig = o.type === 'triggers';
    out.push(sec(`${{ osc: 'OSC', tuio: 'TUIO', triggers: 'Triggers (OSC)' }[o.type]} · ${o.id}`,
      field('Name', o.name, (v) => set((x) => { x.name = v; })),
      field('Host', o.host, (v) => set((x) => { x.host = v.trim(); })),
      field('Port', o.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
      trig ? h('p', { class: 'muted' }, 'Zones only, as simple on/off messages for show controllers (Resolume, MadMapper, QLab, lighting desks): ', h('code', {}, '<address> 1'), ' on enter, ', h('code', {}, '<address> 0'), ' on exit, ', h('code', {}, '<address>/hold 1'), ', ', h('code', {}, '<address>/count n'), '.')
        : [selectField('Coordinates', o.coords, [['wall', 'Per wall (0–1 of each wall)'], ['canvas', 'Canvas (0–1 of the whole output, follows Mapping)']], (v) => set((x) => { x.coords = v; })),
          field('Rate', o.rateHz, (v) => set((x) => { x.rateHz = Math.round(v); }), { unit: 'Hz', step: 1 })],
      o.type === 'osc' ? field('Address prefix', o.prefix, (v) => set((x) => { x.prefix = v; })) : o.type === 'tuio' ? toggle('One port per wall', o.tuioPortPerWall, (on) => set((x) => { x.tuioPortPerWall = on; }), o.tuioPortPerWall ? `${o.port}, ${o.port + 1}…` : '') : null,
      trig ? h('div', { class: 'feed', style: { maxHeight: 'none' } }, prof.zones.length ? prof.zones.map((z) => h('div', {}, `${z.address || slugAddr(z.name)}   ← ${z.name} (${zoneWhere(z)})`)) : h('div', { class: 'muted' }, 'No zones yet — draw them in Zones.')) : null,
      wallsPicker(o, set),
      toggle('Enabled', o.enabled, (on) => set((x) => { x.enabled = on; })),
      s ? h('p', { class: 'muted' }, `${s.sent} packets sent · ${s.errors} errors${s.lastError ? ` · ${s.lastError}` : ''}`) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => run(cmd('output.test', { id: o.id }), 'Test message sent') }, 'Send test'),
        h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.outputs = p.outputs.filter((x) => x.id !== o.id); }); ctx.select(null); } }, 'Delete'))));
  }
  out.push(sec('WebSocket (web & Electron apps)',
    h('p', {}, 'Browsers cannot receive UDP. Web apps connect here and get the same frames as JSON:'),
    h('p', {}, h('code', {}, `ws://${host}:${location.port}/ws/data`)),
    h('p', { class: 'muted' }, 'Client SDK: ', h('a', { href: '/sdk/veation-touch.js', target: '_blank', style: { color: 'var(--ink-2)' } }, '/sdk/veation-touch.js'))));
  out.push(sec('OSC address space', h('div', { class: 'feed', style: { maxHeight: 'none' } },
    ['/vt/frame  i:seq f:time',
      '/vt/room/count  i      /vt/room/burst  i',
      '/vt/wall/<id>/count  i',
      '/vt/wall/<id>/alive  i… ids',
      '/vt/wall/<id>/touch  i:id f:u f:v f:vu f:vv f:size f:age',
      '/vt/wall/<id>/down  i:id f:u f:v',
      '/vt/wall/<id>/up    i:id f:u f:v f:duration',
      '/vt/zone/<id>/enter|hold|exit  i:count',
      '/vt/zone/<id>/count  i',
      'u, v: 0–1, origin top-left. size in metres, age in seconds.'].map((t) => h('div', {}, t)))));
  return out;
}

const OUTPUT_TYPES = [
  ['osc', 'OSC', 'Every touch (id, position, velocity, size) and zone events — TouchDesigner, Unreal, Max'],
  ['triggers', 'Triggers (OSC)', 'Zones only, as on/off messages — Resolume, MadMapper, QLab, lighting desks'],
  ['texture', 'Texture', 'Black & white mask of the touches — over NDI or full screen on a display'],
  ['tuio', 'TUIO', 'The multitouch standard (TUIO 1.1 cursors)'],
  ['webhook', 'Webhook', 'Zone events as HTTP POST (JSON) — show control, home automation, your own server'],
  ['artnet', 'Art-Net (DMX)', 'One DMX channel per zone, 255 while active — lighting consoles and nodes'],
  ['sacn', 'sACN (E1.31)', 'The same DMX channels over the ANSI standard (multicast) — consoles, media servers, gateways'],
];

function outputSummary(x) {
  if (x.type === 'triggers') return `TRIGGERS → ${x.host}:${x.port} · zones on/off`;
  if (x.type === 'webhook') return `WEBHOOK → ${x.url || 'no URL yet'} · zone events`;
  if (x.type === 'artnet') return `ART-NET → ${x.host} · universe ${x.universe} · from channel ${x.channel}`;
  if (x.type === 'sacn') return `sACN → ${x.host === 'multicast' ? `multicast ${sacnGroupOf(x.universe)}` : x.host} · universe ${x.universe} · from channel ${x.channel}`;
  if (x.type === 'texture') return `TEXTURE → ${textureWhere(x)} · ${x.rateHz} Hz`;
  return `${x.type.toUpperCase()} → ${x.host}:${x.port} · ${x.coords === 'canvas' ? 'canvas' : 'wall'} UV · ${x.rateHz} Hz`;
}

function wallsPicker(o, set) {
  const prof = P();
  return h('div', { class: 'row' }, h('span', { class: 'k' }, 'Walls'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 } },
    prof.walls.map((w) => {
      const picked = o.walls || []; // [] = all walls
      const on = !picked.length || picked.includes(w.id);
      return h('button', { class: `ibtn${on ? ' on' : ''}`, onclick: () => set((x) => {
        const all = prof.walls.map((q) => q.id);
        let sel = x.walls?.length ? x.walls.slice() : all.slice();
        sel = on ? sel.filter((q) => q !== w.id) : [...sel, w.id];
        x.walls = sel.length === all.length ? [] : sel;
      }) }, w.id);
    })));
}

/** Webhook and Art-Net: zone-driven destinations (no touch coordinates). */
const sacnGroupOf = (u) => `239.255.${(u >> 8) & 255}.${u & 255}`;

function zoneOutputEditor(o, s, ctx) {
  const prof = P();
  const set = (fn) => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)));
  const picked = o.walls || [];
  const zones = prof.zones.filter((z) => z.enabled !== false && (!picked.length || (z.walls || [z.wallId]).some((w) => picked.includes(w))));
  const hook = o.type === 'webhook';
  const body = hook ? [
    field('URL', o.url, (v) => set((x) => { x.url = v.trim(); }), { placeholder: 'http://192.168.1.50:8000/hook' }),
    o.url ? null : h('div', { class: 'callout attn' }, 'Enter an http:// or https:// address.'),
    h('p', { class: 'muted' }, 'One POST per zone event (enter, hold, exit), in order, JSON body:'),
    h('div', { class: 'feed', style: { maxHeight: 'none' } }, h('div', {}, '{ "event": "enter", "zone": { "id", "name", "wallId", "address" },'), h('div', {}, '  "count": 1, "duration": 1.5 (exit), "room": 3, "time": "…" }')),
  ] : o.type === 'sacn' ? [
    field('Destination', o.host, (v) => set((x) => { x.host = v.trim() || 'multicast'; }), { placeholder: 'multicast' }),
    h('p', { class: 'muted' }, `“multicast” sends to the universe group (${sacnGroupOf(o.universe)}), which every sACN receiver on the network can join; or type a receiver’s IP (unicast).`),
    field('Universe', o.universe, (v) => set((x) => { x.universe = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, '1–63999.'),
    field('Priority', o.priority, (v) => set((x) => { x.priority = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, '0–200 (100 is the default): with two sources on one universe, the receiver follows the higher priority.'),
  ] : [
    field('Host', o.host, (v) => set((x) => { x.host = v.trim(); })),
    h('p', { class: 'muted' }, 'The node’s IP, or a broadcast address (255.255.255.255, 2.255.255.255…).'),
    field('Port', o.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
    field('Universe', o.universe, (v) => set((x) => { x.universe = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, '15-bit Port-Address (Net · Sub-Net · Universe), 0–32767.'),
  ];
  if (!hook) body.push(
    field('First channel', o.channel, (v) => set((x) => { x.channel = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, 'One channel per zone: 255 while the zone is active, 0 otherwise. Sent on change and every second.'),
    h('div', { class: 'feed', style: { maxHeight: 'none' } }, zones.length
      ? zones.slice(0, 513 - o.channel).map((z, k) => h('div', {}, `ch ${o.channel + k}   ← ${z.name} (${zoneWhere(z)})`))
      : h('div', { class: 'muted' }, 'No zones yet — draw them in Zones.')));
  return sec(`${hook ? 'Webhook' : o.type === 'sacn' ? 'sACN (E1.31)' : 'Art-Net (DMX)'} · ${o.id}`,
    field('Name', o.name, (v) => set((x) => { x.name = v; })),
    ...body,
    wallsPicker(o, set),
    toggle('Enabled', o.enabled, (on) => set((x) => { x.enabled = on; })),
    s ? h('p', { class: 'muted' }, `${s.sent} ${hook ? 'requests' : 'packets'} sent · ${s.errors} errors${s.lastError ? ` · ${s.lastError}` : ''}`) : null,
    o.type === 'artnet' ? h('p', { class: 'muted' }, 'Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.') : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', disabled: hook && !o.url, onclick: () => run(cmd('output.test', { id: o.id }), hook ? 'Test event posted' : 'All mapped channels at 255 for a second') }, 'Send test'),
      h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.outputs = p.outputs.filter((x) => x.id !== o.id); }); ctx.select(null); } }, 'Delete')));
}

const SINKS = [['ndi', 'NDI'], ['window', 'Full screen']]; // (Spout goes through the single room output: Output › Screens)
function textureWhere(o) {
  if (o.sink === 'ndi') return `NDI “${o.senderName}”`;
  if (o.sink === 'window') return `full screen · ${store.state.displays?.find((d) => d.id === o.displayId)?.label || (o.displayId == null ? 'no display' : 'display not connected')}`;
  return `NDI “${o.senderName}”`;
}

function textureEditor(o, s, ctx) {
  const prof = P();
  const set = (fn, label = 'edit texture output') => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)), label);
  const dims = (k) => `${Math.round(prof.canvas.width * k)}×${Math.round(prof.canvas.height * k)}`;
  // a fader previews on the stage while dragged (nothing saved), and commits once on release
  const live = (key) => (v) => { if (ctx.ws.texture?.id === o.id) ctx.ws.texture.override[key] = v; };
  const commit = (key, label, fn = (v) => v) => (v) => { set((x) => { x[key] = fn(v); }, label); if (ctx.ws.texture?.id === o.id) delete ctx.ws.texture.override[key]; };
  const touch = o.sizeMode === 'touch';
  const [, pw, ph] = texturePreviewSize(prof, o);
  const displays = store.state.displays || [];
  const feed = (...lines) => h('div', { class: 'feed', style: { maxHeight: 'none' } }, lines.map((l) => (l instanceof Node ? l : h('div', {}, l))));
  const sink = {
    ndi: [
      field('Source name', o.senderName, (v) => set((x) => { x.senderName = v; }, 'rename NDI source')),
      feed(`Appears on the network as “<this computer> (${o.senderName})”`, 'TouchDesigner: NDI In TOP · Resolume / MadMapper / OBS: NDI source · Unreal: NDI plugin',
        h('div', { class: 'muted' }, 'Any computer on the same network. Uses the NDI Runtime installed here (free, ndi.video). NDI® is a registered trademark of Vizrt NDI AB.'))],
    window: [
      displays.length
        ? selectField('Display', o.displayId ?? '', [['', 'Choose a display…'], ...displays.map((d) => [d.id, `${d.label} · ${d.width}×${d.height}${d.primary ? ' (primary)' : ''}`])],
          (v) => set((x) => { x.displayId = v === '' ? null : Number(v); }, 'texture display'))
        : h('p', { class: 'muted' }, 'The desktop app opens the full-screen window on the display you choose. Here (a browser) open the page and press F11.'),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Proportions'), h('div', { class: 'seg' }, [['fit', 'Fit'], ['stretch', 'Stretch']].map(([m, t]) =>
        h('button', { class: o.fit === m ? 'on' : '', title: m === 'fit' ? 'The canvas proportions, black around' : 'Fill the whole display', onclick: () => set((x) => { x.fit = m; }, 'texture proportions') }, t)))),
      h('div', { class: 'actions' }, h('a', { class: 'btn small', href: `/texture?o=${encodeURIComponent(o.id)}`, target: '_blank' }, 'Open page')),
      feed('Pure black and white on its own display — for a capture card or another machine’s video input.')],
  }[o.sink];
  const state = s?.lastError ? h('div', { class: 'callout bad' }, s.lastError)
    : !o.enabled ? h('p', { class: 'muted' }, 'Off — nothing is sent and no window is open.')
      : o.sink === 'window' ? h('p', { class: 'muted' }, (store.status?.textureWindows ?? 0) ? 'Window open.' : o.displayId == null && displays.length ? 'Choose the display.' : 'No window open.')
        : h('p', { class: 'muted' }, `${s?.sent ?? 0} frames sent${o.sink === 'ndi' ? ` · ${s?.receivers ?? 0} receiver${s?.receivers === 1 ? '' : 's'}` : ''}`);
  return [
    sec(`Texture · ${o.id}`,
      h('p', { class: 'muted' }, 'A greyscale mask of the touches — white discs on black — in output-canvas pixels, following each wall’s Mapping. Use it as a texture: particles, fluids, reveal masks. The centre shows it live, exactly as it is sent.'),
      h('p', { class: 'muted', 'data-note': 'spout' }, 'Spout goes through the single room output (Output › Screens).'),
      field('Name', o.name, (v) => set((x) => { x.name = v; })),
      // only the chosen destination runs (the others are not even started)
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Send to'), h('div', { class: 'seg' }, SINKS.map(([m, t]) =>
        h('button', { class: o.sink === m ? 'on' : '', onclick: () => set((x) => { x.sink = m; }, 'texture destination') }, t)))),
      sink,
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Resolution'), h('div', { class: 'seg' }, [[0.125, '1/8'], [0.25, '1/4'], [0.5, '1/2'], [1, 'Full']].map(([k, t]) =>
        h('button', { class: o.scale === k ? 'on' : '', title: dims(k), onclick: () => set((x) => { x.scale = k; }, 'texture resolution') }, t)))),
      h('p', { class: 'muted' }, `${dims(o.scale)} px${pw !== Math.round(prof.canvas.width * o.scale) ? ` · preview here at ${pw} × ${ph}` : ''}.`),
      selectField('Calibration overlay', o.overlay || 'auto', [['auto', 'Automatic'], ['off', 'Off']], (v) => set((x) => { x.overlay = v; }, 'texture overlay')),
      h('p', { class: 'muted' }, 'Automatic draws the grid and the targets of the calibration on top of the touches while “Grid on the walls” is on or a calibration, verification or Fit runs.')),
    sec('Blobs',
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Size'), h('div', { class: 'seg' }, [['fixed', 'Fixed'], ['touch', 'Follows the touch']].map(([m, t]) =>
        h('button', { class: (o.sizeMode || 'fixed') === m ? 'on' : '', onclick: () => set((x) => { x.sizeMode = m; }, 'blob size') }, t)))),
      touch ? h('p', { class: 'muted' }, 'The disc takes the measured width of what touches — a hand, an arm, a body — never smaller than the minimum radius.') : null,
      fader(touch ? 'Minimum radius' : 'Radius', o.radius, { min: 0.01, max: 0.5, step: 0.005, k: 100, unit: 'cm', decimals: 1 }, live('radius'), commit('radius', 'blob radius')),
      fader('Soft edge', o.softness, { min: 0, max: 1, step: 0.05, k: 100, unit: '%' }, live('softness'), commit('softness', 'blob soft edge')),
      fader('Trail', o.trailMs, { min: 0, max: Math.max(3000, o.trailMs), step: 50, unit: 'ms' }, live('trailMs'), commit('trailMs', 'blob trail', Math.round)),
      field('Rate', o.rateHz, (v) => set((x) => { x.rateHz = Math.round(v); }), { unit: 'Hz', step: 1 }),
      wallsPicker(o, set)),
    sec(null,
      toggle('Enabled', o.enabled, (on) => set((x) => { x.enabled = on; })),
      state,
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.outputs = p.outputs.filter((x) => x.id !== o.id); }, 'delete output'); ctx.select(null); } }, 'Delete'))),
  ];
}

// ======================================================================= EXPERIENCES (split: Live · Output › Screens · Output › Audio)

const XP_SCALES = [0.25, 0.5, 0.75, 1];
const LAYER_NAMES = { experience: 'Experience', touches: 'Touches', grid: 'Grid' };
const LAYER_HINTS = {
  experience: 'The piece that is playing (Play and Stop are in Live)',
  touches: 'Black and white mask of the touches',
  grid: 'Pixel map: wall outlines, metre grid, wall ids and calibration targets',
};
const BLEND_OPTIONS = [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']];
let xpTimer = null, touchesFoldOpen = false;

/** The room output's last frame (the engine keeps it in memory). A device that is not this computer carries its key. */
function xpPreviewUrl() {
  const S = store.state;
  return `/api/experience/preview.jpg?t=${Date.now()}${S.local ? '' : `&k=${encodeURIComponent(S.token || '')}`}`;
}

/** Refresh the preview once a second while one is on screen (the view is rebuilt often; one timer serves them all). */
function xpKeepFresh() {
  if (xpTimer) return;
  xpTimer = setInterval(() => {
    const img = document.querySelector('img.xp-preview');
    if (!img || !store.state?.output?.running) { clearInterval(xpTimer); xpTimer = null; return; }
    img.src = xpPreviewUrl();
  }, 1000);
}

/** Send a value while a fader moves (about 15 per second at most; the last value always goes out). */
function xpLive(send) {
  let last = 0, timer = null, latest = null;
  const go = () => { timer = null; last = performance.now(); send(latest); };
  return (v) => { latest = v; if (timer) return; const wait = 66 - (performance.now() - last); if (wait <= 0) go(); else timer = setTimeout(go, wait); };
}
const xpLiveParam = (key, op = 'experience.param') => xpLive((v) => cmd(op, { key, value: v }).catch(() => {}));
/** The master level while its fader moves (the audio window follows the state; saved once the fader settles). */
const auLive = (key) => xpLive((v) => cmd('audio.set', { [key]: v }).catch(() => {}));
// an underrun is a dropout: the device had nothing to play for a moment (a short cut in the sound); counted since it opened
const DROP_TITLE = 'Short cuts in the sound: the device had nothing to play for a moment (counted since it opened; each one is in the log)';
const dropouts = (n) => `${n} dropout${n === 1 ? '' : 's'}`;
/** A layer setting while a fader moves: the whole stack goes out with that one value changed. */
const xpLiveLayer = (id, key) => xpLive((v) => {
  const layers = structuredClone(store.state.profile.output.layers);
  layers.find((l) => l.id === id)[key] = v;
  cmd('output.layers', { layers }).catch(() => {});
});

/** Live (until the preset shelf and the clip grid replace it): the experience picker, its parameters, the sound piece. */
export function experiencePanel(ctx) {
  const X = xpParts(ctx);
  return [X.catalog(), X.sounds()];
}
/** Output › Screens, under the Mapping: the room output — on/off, live preview, layers, where it goes, scale, rate. */
export function roomOutput(ctx) { return [sec(null, xpParts(ctx).outputCard())]; }
/** Output › Audio: the room's sound — devices, channel map, sub and filters, limiter, Test per channel, master, mute. */
export function audio(ctx) { return [sec(null, xpParts(ctx).audioCard())]; }

/** The parts of what was the Experiences tab, built from one reading of the state; each view takes the ones it shows. */
function xpParts(ctx) {
  const S = store.state, X = S.experience, cat = S.experiences || [], prof = P();
  const X0 = prof.experience; // the saved settings (parameters, start with the app)
  const O = prof.output, OS = S.output; // the room output: how it is set / what it is doing now
  const locked = !!S.locked;
  const headless = !(S.displays?.length); // no desktop app around: the page is opened in a browser
  const saved = (c) => X0.params?.[c.id] || {};
  const dims = (k) => `${Math.round(prof.canvas.width * k)} × ${Math.round(prof.canvas.height * k)} px`;
  const setOut = (args) => run(cmd('output.set', args));
  const pageUrl = OS.url ? `${location.origin}${OS.url}${S.local ? '' : `&k=${encodeURIComponent(S.token || '')}`}` : '';

  const paramRow = (c, p, op = 'experience.param', values = saved(c)) => {
    const value = p.key in values ? values[p.key] : p.default;
    const send = (v) => run(cmd(op, { key: p.key, value: v }));
    if (p.type === 'number') {
      const dec = (String(p.step).split('.')[1] || '').length;
      return fader(p.label, value, { min: p.min, max: p.max, step: p.step, unit: p.unit || '', decimals: dec }, xpLiveParam(p.key, op), send);
    }
    if (p.type === 'select') return selectField(p.label, value, p.options, send);
    if (p.type === 'bool') return toggle(p.label, !!value, send);
    return selectField(p.label, value ?? '', [['', 'Any'], ...prof.walls.map((w) => [w.id, w.name || w.id])], (v) => send(v === '' ? null : v));
  };

  // ---- the layers: the list reads top to bottom (the first row is the top layer); the profile keeps them bottom → top
  const sendLayers = (layers) => run(cmd('output.layers', { layers }));
  const edit = (id, fn) => { const layers = structuredClone(O.layers); fn(layers.find((l) => l.id === id), layers); sendLayers(layers); };
  const move = (id, d) => {
    const layers = structuredClone(O.layers), i = layers.findIndex((l) => l.id === id), j = i + d;
    if (j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    sendLayers(layers);
  };

  const touchesSettings = (l) => h('details', { class: 'xp-fold', open: touchesFoldOpen || undefined, ontoggle: (e) => { touchesFoldOpen = e.target.open; } },
    h('summary', {}, 'Touch mask settings'),
    h('div', { class: 'xp-fold-body' },
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Size'), h('div', { class: 'seg' }, [['fixed', 'Fixed'], ['touch', 'Follows the touch']].map(([m, t]) =>
        h('button', { class: l.sizeMode === m ? 'on' : '', onclick: () => edit('touches', (x) => { x.sizeMode = m; }) }, t)))),
      fader(l.sizeMode === 'touch' ? 'Minimum radius' : 'Radius', l.radius, { min: 0.01, max: 0.5, step: 0.005, k: 100, unit: 'cm', decimals: 1 },
        xpLiveLayer('touches', 'radius'), (v) => edit('touches', (x) => { x.radius = v; })),
      fader('Soft edge', l.softness, { min: 0, max: 1, step: 0.05, k: 100, unit: '%' }, xpLiveLayer('touches', 'softness'), (v) => edit('touches', (x) => { x.softness = v; })),
      fader('Trail', l.trailMs, { min: 0, max: Math.max(3000, l.trailMs), step: 50, unit: 'ms' }, xpLiveLayer('touches', 'trailMs'), (v) => edit('touches', (x) => { x.trailMs = Math.round(v); })),
      selectField('Resolution', l.scale, [0.125, 0.25, 0.5, 1].map((k) => [k, `${k === 1 ? 'Full' : `1/${1 / k}`} — ${dims(k)}`]), (v) => edit('touches', (x) => { x.scale = v; }), { numeric: true }),
      wallsPicker(l, (fn) => edit('touches', fn))));

  const layerRow = (l, i, n) => {
    const head = toggle(LAYER_NAMES[l.id], l.on, (on) => edit(l.id, (x) => { x.on = on; }));
    head.title = LAYER_HINTS[l.id];
    const mv = h('div', { class: 'xp-mv' },
      h('button', { class: 'ibtn', 'aria-label': `Move ${LAYER_NAMES[l.id]} up`, title: 'Up: above the next layer', disabled: i === n - 1, onclick: () => move(l.id, +1) }, '↑'),
      h('button', { class: 'ibtn', 'aria-label': `Move ${LAYER_NAMES[l.id]} down`, title: 'Down: below the next layer', disabled: i === 0, onclick: () => move(l.id, -1) }, '↓'));
    head.insertBefore(mv, head.querySelector('.switch'));
    return h('div', { class: `xp-layer${l.on ? ' on' : ''}`, 'data-layer': l.id },
      head,
      fader('Opacity', l.opacity, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, xpLiveLayer(l.id, 'opacity'), (v) => edit(l.id, (x) => { x.opacity = v; })),
      selectField('Blend', l.blend, BLEND_OPTIONS, (v) => edit(l.id, (x) => { x.blend = v; })),
      l.id === 'touches' ? touchesSettings(l) : null);
  };

  const destination = () => {
    const box = h('div', { class: 'xp-set' },
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Send to'), h('div', { class: 'seg' }, [['spout', 'Spout'], ['window', 'Full screen']].map(([m, t]) =>
        h('button', { class: O.sink === m ? 'on' : '', onclick: () => setOut({ sink: m }) }, t)))),
      O.sink === 'spout'
        ? [field('Sender name', O.senderName, (v) => setOut({ senderName: v })),
          h('p', { class: 'muted' }, `Spout "${O.senderName}" on this computer: Resolume, TouchDesigner, MadMapper… read it as one source. It is the only Spout sender of the app.`)]
        : [S.displays?.length
          ? selectField('Display', O.displayId ?? '', [['', 'Choose a display…'], ...S.displays.map((d) => [d.id, `${d.label} · ${d.width}×${d.height}${d.primary ? ' (primary)' : ''}`])],
            (v) => setOut({ displayId: v === '' ? null : Number(v) }))
          : h('p', { class: 'muted' }, 'The desktop app opens the full-screen window on the display you choose. Here, open the output page in a browser (F11).'),
        h('div', { class: 'row' }, h('span', { class: 'k' }, 'Proportions'), h('div', { class: 'seg' }, [['fit', 'Fit'], ['stretch', 'Stretch']].map(([m, t]) =>
          h('button', { class: O.fit === m ? 'on' : '', title: m === 'fit' ? 'The canvas proportions, black around' : 'Fill the whole display', onclick: () => setOut({ fit: m }) }, t))))],
      selectField('Scale', O.scale, XP_SCALES.map((k) => [k, `${k} — ${dims(k)}`]), (v) => setOut({ scale: v }), { numeric: true }),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'FPS'), h('div', { class: 'seg' }, [30, 60].map((f) =>
        h('button', { class: O.fps === f ? 'on' : '', onclick: () => setOut({ fps: f }) }, String(f))))));
    if (locked) {
      for (const el of box.querySelectorAll('button, select, input')) el.disabled = true;
      box.append(h('p', { class: 'muted' }, 'Locked in Show mode: unlock the room to change where it goes.'));
    }
    return box;
  };

  const status = () => {
    if (OS.error) return h('div', { class: 'callout bad' }, OS.error);
    if (X.error) return h('div', { class: 'callout bad' }, X.error);
    const where = O.sink === 'spout' ? `Spout "${O.senderName}"` : 'full screen';
    // an off-screen window paints when the image changes: with no piece playing a still image is normal, not a fault
    const fps = X.running ? X.fps : OS.fps;
    return h('p', { class: 'xp-status' },
      fps >= 5 ? h('b', { class: 'live tnum' }, `${fps} fps`) : h('span', { class: 'muted' }, X.running ? 'Starting…' : 'Sends a frame whenever the image changes'),
      h('span', { class: 'muted' }, ` · ${where} · ${dims(O.scale)}`));
  };

  const outputCard = () => { if (OS.running) xpKeepFresh(); return h('div', { class: `xp-card xp-out${OS.running ? ' on' : ''}`, 'data-card': 'output' },
    h('div', { class: 'head' },
      h('div', { class: 't' }, 'Output — VEATION Touch', h('small', {}, 'The one image of the room: the experience, the touches and the grid, stacked as you choose')),
      OS.running ? badge(OS.calibrating ? 'calibration' : 'live', OS.calibrating ? 'warn' : 'live') : null),
    toggle('Output', O.on, (on) => setOut({ on })),
    OS.calibrating ? h('div', { class: 'callout attn xp-calib', role: 'status' }, 'Calibration mode — showing the grid and the touches',
      h('div', { class: 'muted' }, 'The output shows only what calibration needs, on black. Your layers come back by themselves when the calibration, verification, fit, walk test or grid ends.')) : null,
    OS.running ? [
      h('div', { class: 'xp-prev', style: { aspectRatio: `${prof.canvas.width} / ${prof.canvas.height}` } },
        h('img', { class: 'xp-preview', alt: 'Live preview of the output', src: OS.previewAt ? xpPreviewUrl() : undefined, onerror: (e) => e.target.classList.add('empty'), onload: (e) => e.target.classList.remove('empty') })),
      status(),
      headless ? h('div', { class: 'callout attn' }, 'No desktop app on this computer: open the output page in a browser to run it. ',
        h('a', { href: pageUrl, target: '_blank', style: { color: 'var(--ink)' } }, pageUrl)) : null,
    ] : null,
    h('div', { class: `xp-layers${OS.calibrating ? ' suspended' : ''}` },
      h('h3', {}, 'Layers', h('small', {}, 'top of the list = on top')),
      [...O.layers].reverse().map((l, k, all) => layerRow(l, all.length - 1 - k, all.length))),
    destination()); };

  const autostart = () => {
    const box = h('div', { class: 'xp-set' }, toggle('Start with the app', X0.autostart, (on) => run(cmd('experience.set', { autostart: on }))));
    if (locked) for (const el of box.querySelectorAll('button')) el.disabled = true; // an installation setting: Show mode locks it
    return box;
  };

  const card = (c) => {
    const running = X.running && X.id === c.id, selected = X.id === c.id;
    return h('div', { class: `xp-card${running ? ' on' : ''}`, 'data-id': c.id },
      h('div', { class: 'head' },
        h('div', { class: 't' }, c.name, c.description ? h('small', {}, c.description) : null),
        running ? badge('running', 'live') : null,
        running
          ? h('button', { class: 'btn small', onclick: () => run(cmd('experience.stop')) }, 'Stop')
          : h('button', { class: 'btn small primary', onclick: () => run(cmd('experience.play', { id: c.id })) }, 'Play')),
      running ? (X.error ? h('div', { class: 'callout bad' }, X.error) : null) : null,
      running || selected ? [
        c.params.length ? h('div', { class: 'xp-params' }, c.params.map((p) => paramRow(c, p))) : null,
        autostart(),
      ] : null);
  };


  // ---- the room's sound: devices, the logical channel map, Test per channel, master / mute, then the sound pieces
  const AU = S.audio || {}, AP = prof.audio, sounds = S.sounds || [];
  const setAudio = (args) => run(cmd('audio.set', args));
  const lockIt = (box, note) => {
    if (!locked) return box;
    for (const el of box.querySelectorAll('button, select, input')) el.disabled = true;
    for (const el of box.querySelectorAll('.vfield, .vbox')) { el.setAttribute('aria-disabled', 'true'); el.style.pointerEvents = 'none'; }
    if (note) box.append(h('p', { class: 'muted' }, 'Locked in Show mode: unlock the room to change this.'));
    return box;
  };
  const chans = Array.from({ length: AP.channels }, (_, k) => k + 1);
  const roleOf = (c) => {
    if (AP.sub.channel === c) return 'Sub';
    const ws = prof.walls.filter((w) => (AP.map[w.id] || []).includes(c)).map((w) => w.name || w.id);
    return ws.length ? ws.join(', ') : 'Unused';
  };
  const deviceOf = (c) => {
    if (AU.fold || !AU.sinks?.length) return AU.running ? 'Default device (left / right)' : '';
    const sk = AU.sinks.find((k) => c - 1 >= k.first && c - 1 < k.first + k.count);
    return sk ? (sk.missing ? `${sk.label} (not found)` : sk.error ? `${sk.label} (error)` : `${sk.label} · output ${c - sk.first}`) : 'No device';
  };

  const deviceSlots = () => {
    const names = (AU.devices || []).filter((d) => !d.default).map((d) => d.label);
    const rows = AP.devices.map((label, i) => {
      const sk = (AU.sinks || [])[i];
      const opts = [...new Set([...names, label])].map((n) => [n, n === label && !names.includes(n) ? `${n} (not found)` : n]);
      return h('div', { class: 'au-slot' },
        selectField(`Output ${i + 1}`, label, opts, (v) => { const next = [...AP.devices]; next[i] = v; setAudio({ devices: next }); }),
        h('span', { class: 'muted tnum' }, sk ? `${sk.count} ch` : ''),
        sk?.underruns ? h('span', { class: 'au-drop tnum', 'data-drop': String(i + 1), title: DROP_TITLE }, dropouts(sk.underruns)) : null,
        h('button', { class: 'btn small', 'aria-label': `Remove output ${i + 1}`, onclick: () => setAudio({ devices: AP.devices.filter((_, k) => k !== i) }) }, 'Remove'));
    });
    const free = names.filter((n) => !AP.devices.includes(n));
    return h('div', { class: 'au-devices-set' },
      AP.devices.length ? rows : h('p', { class: 'muted' }, 'No output devices chosen: everything plays in stereo on the default device of this computer, the channels folded into left and right.'),
      free.length ? selectField('Add device', '', [['', 'Choose…'], ...free.map((n) => [n, n])], (v) => { if (v) setAudio({ devices: [...AP.devices, v] }); }) : null,
      AP.devices.length && AU.running && !AU.fold && AU.available < AP.channels
        ? h('div', { class: 'callout attn' }, `The devices chosen give ${AU.available} channel${AU.available === 1 ? '' : 's'}; the map uses ${AP.channels}. Channels beyond them are silent.`) : null);
  };

  const wallMap = () => h('div', { class: 'au-map' }, prof.walls.map((w) => {
    const mine = AP.map[w.id] || [];
    return h('div', { class: 'row au-wall', 'data-wall': w.id },
      h('span', { class: 'k' }, w.name || w.id),
      h('div', { class: 'au-chips' }, chans.filter((c) => c !== AP.sub.channel).map((c) =>
        h('button', { class: mine.includes(c) ? 'on' : '', 'aria-pressed': mine.includes(c) ? 'true' : 'false', title: `Channel ${c}`,
          onclick: () => run(cmd('audio.map', { map: { ...AP.map, [w.id]: mine.includes(c) ? mine.filter((x) => x !== c) : [...mine, c].sort((a, b) => a - b) } })) }, String(c)))));
  }));

  const setup = () => lockIt(h('div', { class: 'xp-set au-setup' },
    h('h3', {}, 'Outputs', h('small', {}, 'logical channels run on over the devices, in order')),
    deviceSlots(),
    selectField('Channels', AP.channels, Array.from({ length: 32 }, (_, k) => [k + 1, String(k + 1)]), (v) => run(cmd('audio.map', { map: AP.map, channels: v })), { numeric: true }),
    h('h3', {}, 'Walls', h('small', {}, 'speakers of a wall run left to right in channel order')),
    wallMap(),
    h('h3', {}, 'Sub and filters'),
    selectField('Sub channel', AP.sub.channel ?? '', [['', 'No sub'], ...chans.map((c) => [c, `Channel ${c}`])], (v) => run(cmd('audio.map', { map: AP.map, sub: { channel: v === '' ? null : Number(v) } }))),
    fader('Crossover', AP.sub.crossoverHz, { min: 40, max: 250, step: 1, unit: 'Hz' }, null, (v) => setAudio({ sub: { crossoverHz: v } })),
    fader('Wall high-pass', AP.wallHighpassHz, { min: 0, max: 500, step: 5, unit: 'Hz' }, null, (v) => setAudio({ wallHighpassHz: v })),
    h('p', { class: 'muted' }, 'The sub gets everything below the crossover; set the high-pass of the walls to the same frequency (0 = off).'),
    fader('Limiter ceiling', AP.ceilingDb, { min: -12, max: -1, step: 0.5, unit: 'dB', decimals: 1 }, null, (v) => setAudio({ ceilingDb: v }))), true);

  const channelTable = () => h('div', { class: 'au-chans' },
    h('h3', {}, 'Channels', h('small', {}, 'Test plays a soft tone on one channel: find which speaker is which')),
    chans.map((c) => h('div', { class: 'au-ch', 'data-ch': String(c) },
      h('span', { class: 'n tnum' }, String(c)),
      h('div', { class: 'who' }, roleOf(c), deviceOf(c) ? h('small', {}, deviceOf(c)) : null),
      h('button', { class: 'btn small', disabled: !AP.on || locked || undefined, title: locked ? 'Locked in Show mode' : `Test channel ${c}`, 'data-test': String(c),
        onclick: () => run(cmd('audio.test', { channel: c })) }, 'Test'))));

  const deviceReadout = () => h('div', { class: 'au-devices' },
    h('h3', {}, 'Devices', h('small', {}, 'every output of this computer and how many channels it offers')),
    (AU.devices || []).length
      ? AU.devices.map((d) => h('div', { class: 'au-dev' }, h('span', {}, d.label, d.default ? h('small', {}, ' · default') : null), h('span', { class: 'tnum' }, `${d.channels} ch`)))
      : h('p', { class: 'muted' }, AP.on ? 'Reading the devices…' : 'Turn audio on to read the devices of this computer.'));

  const audioStatus = () => {
    if (!AP.on) return null;
    if (AU.error) return h('div', { class: 'callout bad' }, AU.error);
    if (!AU.running) return h('p', { class: 'xp-status muted' }, headless ? h('span', {}, 'No desktop app on this computer: open the audio page in a browser tab and keep it open. ', h('a', { href: `${location.origin}${AU.url}${S.local ? '' : `&k=${encodeURIComponent(S.token || '')}`}`, target: '_blank', style: { color: 'var(--ink)' } }, 'Audio page')) : 'Starting…');
    const lvl = AU.peakDb == null || AU.peakDb <= -90 ? 'silent' : `${AU.peakDb} dB`;
    const nDev = AU.sinks.filter((k) => !k.missing).length;
    const drops = AU.sinks.reduce((n, k) => n + (k.underruns || 0), 0);
    return h('p', { class: 'xp-status' }, h('b', { class: 'live tnum' }, 'Running'),
      h('span', { class: 'muted' }, ` · ${AU.fold ? 'stereo, default device' : `${AU.available} channels on ${nDev} device${nDev === 1 ? '' : 's'}`} · peak ${lvl}`),
      drops ? h('span', { class: 'au-drop tnum', 'data-drop': 'total', title: DROP_TITLE }, ` · ${dropouts(drops)}`) : null);
  };

  const audioCard = () => h('div', { class: `xp-card xp-audio${AU.running ? ' on' : ''}`, 'data-card': 'audio' },
    h('div', { class: 'head' },
      h('div', { class: 't' }, 'Audio — room sound', h('small', {}, 'Sound pieces over the speakers of the room, with the sub, a master level and a limiter that is always on')),
      AU.running ? badge(AP.mute ? 'muted' : 'live', AP.mute ? 'warn' : 'live') : null),
    toggle('Audio', AP.on, (on) => setAudio({ on })),
    audioStatus(),
    AP.on ? [
      fader('Master', AP.master, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, auLive('master'), (v) => setAudio({ master: v })),
      toggle('Mute', AP.mute, (mute) => run(cmd('audio.mute', { mute }))),
    ] : null,
    channelTable(),
    setup(),
    deviceReadout());

  const soundParam = (c, p) => paramRow(c, p, 'sound.param', AP.sound.params?.[c.id] || {});
  const soundCard = (c) => {
    const running = AU.sound?.running && AU.sound.id === c.id, selected = AP.sound.id === c.id;
    return h('div', { class: `xp-card${running ? ' on' : ''}`, 'data-sound': c.id },
      h('div', { class: 'head' },
        h('div', { class: 't' }, c.name, c.description ? h('small', {}, c.description) : null),
        running ? badge(AU.sound.active ? 'playing' : 'starting', 'live') : null,
        running
          ? h('button', { class: 'btn small', onclick: () => run(cmd('sound.stop')) }, 'Stop')
          : h('button', { class: 'btn small primary', onclick: () => run(cmd('sound.play', { id: c.id })) }, 'Play')),
      running && AU.sound.error ? h('div', { class: 'callout bad' }, AU.sound.error) : null,
      running || selected ? [
        c.params.length ? h('div', { class: 'xp-params' }, c.params.map((p) => soundParam(c, p))) : null,
        lockIt(h('div', { class: 'xp-set' }, toggle('Start with the app', AP.sound.autostart, (on) => run(cmd('sound.set', { autostart: on })))), false),
      ] : null);
  };

  return {
    outputCard,
    catalog: () => sec(['Experiences', h('span', { class: 'grow' }), h('button', { class: 'btn small', title: 'Look for experiences again', onclick: () => run(cmd('experience.list')) }, 'Rescan')],
      h('p', { class: 'muted' }, 'Interactive pieces that react to the touches. Play one and it becomes the Experience layer of the room output (Output › Screens).'),
      cat.length ? h('div', { class: 'xp-list' }, cat.map(card)) : h('p', { class: 'muted' }, 'No experiences found. They live in the experiences folder of the app: one folder each, with a manifest.json.')),
    audioCard,
    sounds: () => sec('Sound',
      h('p', { class: 'muted' }, 'Pieces that only make sound, over the speakers of the room (Output › Audio). They play at the same time as the experience above, and react to the hands.'),
      sounds.length ? h('div', { class: 'xp-list' }, sounds.map(soundCard)) : h('p', { class: 'muted' }, 'No sound pieces found. They live in the experiences folder too: a manifest.json with "kind": "sound".')),
  };
}

// ======================================================================= SYSTEM

export function system(ctx) {
  const S = store.state;
  const eng = store.status?.engine || {};
  const lan = S.lan || [];
  const out = [
    // a phone or tablet opens the calibration remote; this one chose the full app — the way back
    isCoarse ? sec('This device', h('p', { class: 'muted' }, 'Phones and tablets open the calibration remote: just what is needed at the wall (prepare, calibrate, fit, verify).'),
      h('button', { class: 'btn block', onclick: () => switchUi('remote') }, 'Calibration remote')) : null,
    sec('Connect a phone or tablet', connectContent()),
    sec(['Room profiles', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => newRoomWizard(ctx) }, '+ New'),
      h('label', { class: 'btn small' }, 'Import', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importProfile }))],
      // the name gets its own line (it used to be squeezed out by the buttons); actions below it
      h('div', { class: 'list' }, S.profiles.map((p) => h('div', { class: `item stack${p.id === S.profile.id ? ' on' : ''}` },
        h('div', { class: 'head' }, h('div', { class: 't' }, p.name, h('small', {}, `${p.id} · ${p.walls} walls · ${p.sensors} sensors`)), p.id === S.profile.id ? badge('active', 'ok') : null),
        h('div', { class: 'acts' },
          p.id === S.profile.id ? null : h('button', { class: 'btn small', onclick: () => switchRoom(p) }, 'Load'),
          h('button', { class: 'btn small', onclick: () => versionsModal(p) }, 'Versions'),
          h('button', { class: 'btn small', onclick: () => exportProfile(p.id) }, 'Export'),
          h('button', { class: 'btn small', onclick: () => duplicate(p) }, 'Duplicate'),
          p.id !== S.profile.id ? h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`Delete the room profile "${p.name}"? A backup is kept in the data folder.`, 'Delete', true)) run(cmd('profile.delete', { id: p.id })); } }, 'Delete') : null))))),
    sec('Network', ...networkBox()),
    sec('Recordings', recordingsBox()),
    sec('Processing (advanced)', ...processingFields()),
    sec('Application',
      h('dl', { class: 'kv' },
        h('dt', {}, 'Version'), h('dd', {}, S.version),
        h('dt', {}, 'Engine'), h('dd', {}, `${eng.fps ?? '—'} fps · tick ${eng.tickMaxMs ?? '—'} ms · ${eng.rss ?? '—'} MB`),
        h('dt', {}, 'Uptime'), h('dd', {}, eng.uptime ? fmtDur(eng.uptime) : '—')),
      S.local && S.displays?.length ? toggle('Start with Windows', S.autostart, (on) => run(cmd('app.autostart', { enabled: on }))) : null),
    sec('Projection',
      projectionMode(),
      h('p', { class: 'muted' }, 'Pattern draws every wall with its id and grid through its Mapping — use it to check the pixel layout. Debug draws the live touches. Calibration targets always appear while calibrating.'),
      S.displays?.length ? projectionControls() : h('p', { class: 'muted' }, 'Projection page: ', h('a', { href: '/projection', target: '_blank', style: { color: 'var(--ink-2)' } }, '/projection'), ' — open it fullscreen on the projection output.')),
    sec('Log', h('div', { class: 'log', id: 'logBox' }, logLines())),
  ];
  return out.filter(Boolean);

  async function duplicate(p) {
    const name = await promptBox('Name of the copy', `${p.name} copy`, 'Duplicate');
    if (name) run(cmd('profile.create', { name, from: p.id, keepCalibration: false }), `Created ${name}`);
  }
  async function exportProfile(id) {
    const r = await run(cmd('profile.export', { id }));
    if (!r) return;
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(r.json, null, 2)], { type: 'application/json' })), download: `${id}.json` });
    document.body.append(a); a.click(); a.remove();
  }
  async function importProfile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    run(cmd('profile.import', { json: text }), `Imported ${f.name}`);
  }
}

/** Record raw sensor data in the room; replay it anywhere to tune without hardware. */
function recordingsBox() {
  const box = h('div', {});
  const list = h('div', { class: 'list' }, h('p', { class: 'muted' }, 'Loading…'));
  const fmtMb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const load = () => cmd('rec.list').then((r) => {
    const rep = store.status?.replay?.file;
    list.replaceChildren(...(r.recordings.length ? r.recordings.map((x) => h('div', { class: `item${rep === x.file ? ' on' : ''}` },
      h('div', { class: 't' }, x.file.replace(/\.vtrec\.gz$/, ''), h('small', {}, `${x.profile || '?'} · ${(x.sensors || []).join(', ')} · ${fmtMb(x.bytes)}`)),
      rep === x.file ? h('button', { class: 'btn small attn', onclick: () => run(cmd('replay.stop')).then(load) }, 'Stop') :
        h('button', { class: 'btn small', onclick: () => run(cmd('replay.start', { file: x.file }), 'Replaying — the room now runs on this recording').then(load) }, 'Play'),
      h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`Delete the recording ${x.file}?`, 'Delete', true)) run(cmd('rec.delete', { file: x.file })).then(load); } }, '✕')))
      : [h('p', { class: 'muted' }, 'No recordings yet.')]));
  }).catch((e) => list.replaceChildren(h('p', { class: 'muted' }, e.message)));
  const rec = store.status?.recording;
  box.append(
    h('p', { class: 'muted' }, 'Records the raw LiDAR revolutions of every sensor (≈ 2–4 MB per sensor per minute, 10 min max). Play one later — at the studio, on a laptop — and the room behaves exactly as it did: tune background, filters, zones and calibration without hardware.'),
    h('div', { class: 'actions' },
      rec ? h('button', { class: 'btn danger', onclick: () => run(cmd('rec.stop'), 'Recording saved').then(load) }, `■ Stop recording (${rec.seconds} s)`)
        : h('button', { class: 'btn', disabled: !!store.status?.replay, onclick: async () => {
          const name = await promptBox('Name of the recording', `${P().id}-session`, 'Record');
          if (name) run(cmd('rec.start', { name }), 'Recording…');
        } }, '● Record')),
    list);
  load();
  return box;
}

async function versionsModal(p) {
  const r = await run(cmd('profile.versions', { id: p.id }));
  if (!r) return;
  const close = modal(`Versions of ${p.name}`, h('div', {},
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Every save keeps the previous version (the last 30). Restoring one makes it current; the current one is kept as a version too.'),
    r.versions.length ? h('div', { class: 'list' }, r.versions.map((v) => h('div', { class: 'item' },
      h('div', { class: 't' }, new Date(v.at).toLocaleString(), h('small', {}, `${v.walls} walls · ${v.sensors} sensors · ${v.zones} zones`)),
      h('button', { class: 'btn small', onclick: async () => {
        if (!await confirmBox(`Restore "${p.name}" to the version of ${new Date(v.at).toLocaleString()}?`, 'Restore')) return;
        const ok = await run(cmd('profile.restore', { id: p.id, version: v.version }), 'Version restored');
        if (ok) close();
      } }, 'Restore')))) : h('p', { class: 'muted' }, 'No earlier versions yet.')));
}

function projectionMode() {
  const pr = store.state.projection;
  return h('div', { class: 'row' }, h('span', { class: 'k' }, 'Projection shows'),
    h('div', { class: 'seg' }, [['off', 'Off'], ['identify', 'Pattern'], ['debug', 'Debug']].map(([m, t]) =>
      h('button', { class: pr.mode === m ? 'on' : '', onclick: () => run(cmd('projection.set', { mode: m })) }, t))));
}

/**
 * Calibrate checklist: the targets are drawn by the projection page — ✓ only when one is really connected
 * (a window flagged open on no display, or a page closed in a browser, used to pass as ready).
 */
export function projectionCheck(check) {
  const pr = store.state.projection, displays = store.state.displays || [];
  const pages = store.status?.projections ?? 0;
  if (!displays.length) {
    return check(pages > 0, pages ? 'Projection page open — the targets appear on the wall' : 'Open the projection page full-screen on the projector',
      pages ? null : h('a', { class: 'btn small', href: '/projection', target: '_blank' }, 'Open page'));
  }
  return check(pages > 0, pages ? `Projection open on ${displays.find((d) => d.id === pr.displayId)?.label || 'its display'}` : 'Projection: choose its display and open it',
    h('div', { class: 'acts-inline' },
      selectField('', pr.displayId ?? '', [['', 'Display…'], ...displays.map((d) => [d.id, `${d.label}${d.primary ? ' (primary)' : ''}`])], (v) => run(cmd('projection.set', { displayId: v === '' ? null : Number(v), open: v !== '' })), { inline: true }),
      pr.displayId != null ? h('button', { class: 'btn small', onclick: () => run(cmd('projection.set', { open: !pr.open })) }, pr.open ? 'Close' : 'Open') : null));
}

function projectionControls() {
  const pr = store.state.projection;
  return [
    selectField('Projection on', pr.displayId ?? '', [['', 'Choose a display…'], ...store.state.displays.map((d) => [d.id, `${d.label} · ${d.width}×${d.height}${d.primary ? ' (primary)' : ''}`])],
      (v) => run(cmd('projection.set', { displayId: v === '' ? null : Number(v) }))),
    toggle('Projection window', pr.open, (on) => run(cmd('projection.set', { open: on })), 'fullscreen on that display'),
  ];
}

let pairIface = null;
try { pairIface = localStorage.getItem('vt-pair-iface'); } catch { /* ignore */ }

let connectMode = 'wifi';
try { connectMode = localStorage.getItem('vt-connect-mode') === 'internet' ? 'internet' : 'wifi'; } catch { /* ignore */ }

/** Connect a device: on the same Wi-Fi (the LAN link) or from anywhere over the internet (the relay link). */
export function connectContent() {
  const box = h('div', {});
  const draw = () => {
    const seg = h('div', { class: 'row' }, h('span', { class: 'k' }, 'How'),
      h('div', { class: 'seg' }, [['wifi', 'Same Wi-Fi'], ['internet', 'Over the internet']].map(([k, t]) => h('button', { class: k === connectMode ? 'on' : '', onclick: () => {
        connectMode = k; try { localStorage.setItem('vt-connect-mode', k); } catch { /* ignore */ }
        draw();
      } }, t))));
    box.replaceChildren(seg, connectMode === 'internet' ? internetContent() : lanContent());
  };
  draw();
  return box;
}

/** Over the internet: state of the relay link and, when online, the public link as a QR. */
function internetContent() {
  const box = h('div', { class: 'cloud-box' });
  let shown = null;
  const draw = () => {
    const c = store.state.cloud, local = store.state.local;
    const sig = JSON.stringify([c, local, (store.status?.clients || []).filter((d) => /^internet \(/.test(d.addr)).length]);
    if (sig === shown) return;
    shown = sig;
    if (!c) { box.replaceChildren(h('p', { class: 'muted' }, 'This server does not offer internet access yet — update VEATION Touch on it.')); return; }
    const parts = [];
    if (!c.enabled) {
      parts.push(h('p', {}, 'Open the calibration remote from any network — mobile data, another Wi-Fi, another country. The room server connects out to a relay; nothing is opened in the router or firewall.'));
      if (!local) parts.push(h('div', { class: 'callout' }, 'Internet access is turned on at the server itself. Open this panel there.'));
      else if (!c.relayUrl) parts.push(h('div', { class: 'callout attn' }, 'Enter the relay address first: System › Network › Internet access.'));
      if (local) parts.push(h('button', { class: 'btn primary', disabled: !c.relayUrl, onclick: (e) => { e.target.disabled = true; run(cmd('cloud.set', { enabled: true }), 'Internet access on').then(() => { shown = null; draw(); }); } }, 'Turn on internet access'));
    } else if (c.state === 'online') {
      const who = (store.status?.clients || []).filter((d) => /^internet \(/.test(d.addr));
      parts.push(
        h('div', { class: 'check done' }, h('span', { class: 'mark' }, '✓'), h('span', { class: 't' }, 'Online — this room is reachable over the internet.')),
        h('div', { class: 'qr' }, h('img', { src: `/api/qr.svg?t=${encodeURIComponent(c.link)}`, alt: 'QR code' })),
        h('p', { class: 'join', style: { textAlign: 'center' } }, 'Scan with the phone or tablet camera — any network works.'),
        h('p', {}, h('code', {}, c.link)),
        who.length ? h('div', { class: 'check done' }, h('span', { class: 'mark' }, '✓'), h('span', { class: 't' }, `Connected: ${who.map((d) => `${d.device} (${d.addr})`).join(' · ')}`)) : null,
        h('p', { class: 'muted' }, 'The link contains the access key of this installation — share it only with operators. “New address” in System › Network cancels every link shared so far.'));
    } else if (c.state === 'error') {
      parts.push(h('div', { class: 'callout attn' }, h('b', {}, 'Cannot reach the relay. '), c.error || 'Unknown error.', h('br'), 'Retrying automatically.'));
    } else parts.push(h('div', { class: 'check' }, h('span', { class: 'mark' }, '…'), h('span', { class: 't muted' }, 'Connecting to the relay…')));
    if (c.enabled && local) parts.push(h('button', { class: 'btn small', onclick: () => run(cmd('cloud.set', { enabled: false }), 'Internet access off') }, 'Turn off internet access'));
    box.replaceChildren(...parts.filter(Boolean));
  };
  draw();
  const timer = setInterval(() => { if (!box.isConnected && Date.now() - born > 1500) clearInterval(timer); else draw(); }, 700);
  const born = Date.now();
  return box;
}

function lanContent() {
  const S = store.state;
  const lan = S.lan || [];
  if (!lan.length) return h('p', { class: 'muted' }, 'No network interface found. Connect this computer to the room network.');
  const box = h('div', {});
  const fw = h('div', {}, h('p', { class: 'muted' }, 'Checking Windows Firewall…'));
  const devices = h('div', {});
  const drawFirewall = (r) => {
    if (!r) return;
    if (r.allowed === null) { fw.replaceChildren(h('div', { class: 'check' }, h('span', { class: 'mark' }, '?'), h('span', { class: 't' }, 'Firewall: not Windows — check that port ', String(location.port), ' is open.'))); return; }
    fw.replaceChildren(h('div', { class: `check${r.allowed ? ' done' : ''}` },
      h('span', { class: 'mark' }, r.allowed ? '✓' : '!'),
      h('span', { class: 't' }, r.allowed ? `Firewall rule found (${r.rules.join(', ')})` : 'No “VEATION Touch” firewall rule found. If the tablet cannot open the link, add it:'),
      !r.allowed && store.state.local ? h('button', { class: 'btn small', onclick: () => {
        fw.querySelector('button').disabled = true;
        cmd('net.fixFirewall').then(drawFirewall).catch((e) => { toast(e.message, 'bad'); cmd('net.firewall').then(drawFirewall); });
      } }, 'Fix (administrator)') : null));
    if (!r.allowed && !store.state.local) fw.append(h('p', { class: 'muted' }, 'Open this panel on the server itself to fix it.'));
  };
  const opened = Date.now();
  // three different situations, three different fixes: connected · reached this computer but not connected ·
  // nothing reached it (another network, or a Wi-Fi that keeps devices apart)
  const drawDevices = () => {
    const list = (store.status?.clients || []).filter((c) => !c.local);
    const seen = (store.status?.reached || []).filter((r) => r.at >= opened - 120000 && !list.some((c) => c.addr === r.addr));
    const c = currentLan();
    let row;
    if (list.length) row = h('div', { class: 'check done' }, h('span', { class: 'mark' }, '✓'), h('span', { class: 't' }, `Connected: ${list.map((d) => `${d.device} (${d.addr})`).join(' · ')}`));
    else if (seen.length) {
      row = h('div', { class: 'check' }, h('span', { class: 'mark' }, '!'), h('span', { class: 't' },
        `${seen.map((r) => `${r.device} (${r.addr})`).join(' · ')} reached this computer but is not connected: scan this QR code again on it (the link carries the access key).`));
    } else if (Date.now() - opened > 20000) {
      row = h('div', { class: 'check' }, h('span', { class: 'mark' }, '!'), h('span', { class: 't' },
        'Nothing has reached this computer from another device yet. ',
        c?.guest ? `The phone is probably on “${c.ssid}” but that guest Wi-Fi keeps devices apart: use this PC’s hotspot (below).`
          : `Check that the phone is on ${c?.ssid ? `the Wi-Fi “${c.ssid}”` : `the network of “${c?.iface}”`}, not on mobile data or another Wi-Fi.`));
    } else row = h('div', { class: 'check' }, h('span', { class: 'mark' }, '…'), h('span', { class: 't muted' }, 'Waiting for a phone or tablet to connect…'));
    devices.replaceChildren(row);
  };
  const currentLan = () => lan.find((l) => l.iface === pairIface) || lan[0];
  const netLabel = (l) => (l.kind === 'hotspot' ? 'This PC’s hotspot' : l.ssid ? `Wi-Fi “${l.ssid}”` : l.iface);
  const hotspotButton = () => (store.state.local ? h('button', { class: 'btn small', onclick: () => run(cmd('net.openHotspot'), 'Turn on Mobile hotspot there, then join its Wi-Fi with the phone') }, 'Open Mobile hotspot settings') : null);
  cmd('net.firewall').then(drawFirewall).catch(() => {});
  const timer = setInterval(() => { if (!box.isConnected) clearInterval(timer); else drawDevices(); }, 1000);
  const draw = () => {
    const c = currentLan();
    box.replaceChildren(...[
      lan.length > 1 ? h('div', { class: 'row' }, h('span', { class: 'k' }, 'Network'),
        h('div', { class: 'seg', style: { flexWrap: 'wrap', height: 'auto' } }, lan.map((l) => h('button', { class: l === c ? 'on' : '', style: { height: 'var(--ctl-h)' }, title: l.sensors ? 'This is the LiDAR network' : l.iface, onclick: () => {
          pairIface = l.iface; try { localStorage.setItem('vt-pair-iface', l.iface); } catch { /* ignore */ } draw();
        } }, `${netLabel(l)} · ${l.ip}${l.sensors ? ' (sensors)' : ''}`)))) : null,
      c.kind === 'hotspot' ? h('div', { class: 'callout' }, 'This PC is the access point (Windows Mobile hotspot): join its Wi-Fi on the phone first, then scan.') : null,
      c.sensors ? h('div', { class: 'callout attn' }, 'This network reaches the LiDARs. Prefer the room Wi-Fi / access point for tablets.') : null,
      c.guest ? h('div', { class: 'callout attn guest' },
        h('b', {}, `“${c.ssid}” looks like a guest network.`), ' Guest Wi-Fi usually keeps devices from reaching each other, so the phone may not open the link. ',
        'Most reliable: turn on this PC’s Mobile hotspot and join it with the phone — or use the room’s own network.', h('br'), hotspotButton()) : null,
      h('div', { class: 'qr' }, h('img', { src: `/api/qr.svg?t=${encodeURIComponent(c.url)}`, alt: 'QR code' })),
      h('p', { class: 'join', style: { textAlign: 'center' } }, 'Scan with the phone or tablet camera. ',
        c.kind === 'hotspot' ? 'It must be on this PC’s hotspot Wi-Fi.' : c.ssid ? h('b', {}, `It must be on the Wi-Fi “${c.ssid}”.`) : `It must be on the same network as “${c.iface}” (${c.ip}).`),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, 'It opens the calibration remote: wall by wall — prepare, calibrate, fit, verify. Full app is one tap away on it.'),
      h('p', {}, h('code', {}, c.url)),
      localNameLine(S),
      h('div', { class: 'checklist', style: { margin: '12px 0' } }, fw, devices),
      h('div', { class: 'callout' },
        h('b', {}, 'Still not opening?'), h('br'),
        lan.length > 1 ? ['• Pick the network the phone is on (above). ', h('br')] : null,
        '• Some Wi-Fi networks keep devices apart (“client isolation”, typical of guest Wi-Fi): use this PC’s Mobile hotspot, or the room access point with isolation off. ',
        c.guest ? null : hotspotButton()),
      h('p', { class: 'muted' }, 'The link contains the access key of this installation — share it only with operators.'),
    ].filter(Boolean)); // replaceChildren would print a null as text
    drawDevices();
  };
  draw();
  return box;
}

export function openConnectModal() { modal('Connect a device', connectContent()); }

/**
 * Load another room — after saying what that stops: its sensors and outputs, and a calibration in progress.
 * @returns {Promise<boolean>} whether it switched
 */
export async function switchRoom(p) {
  const cur = store.state.profile;
  if (!p || p.id === cur.id) return false;
  const sensors = cur.sensors.filter((s) => s.enabled).length, outs = cur.outputs.filter((o) => o.enabled).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const calib = store.status?.calib ? ` and cancels the calibration of ${store.status.calib.wallId}` : '';
  if (!await confirmBox(`Load "${p.name}"? This stops the ${plural(sensors, 'sensor')} and ${plural(outs, 'output')} of "${cur.name}"${calib}.`, 'Load room')) return false;
  return run(cmd('profile.load', { id: p.id }), `Loaded ${p.name}`).then((r) => !!r);
}

/** The same link by name (mDNS) — easier to type than an address, and it survives a DHCP change. */
function localNameLine(S) {
  const n = S.localName;
  if (!n) return null;
  const url = `http://${n.host}:${n.port || location.port}/?k=${S.token}`;
  if (!n.running) return h('p', { class: 'muted' }, `Local name ${n.host} is off: ${n.error || 'not started'}.`);
  return h('div', {},
    h('p', {}, 'Or type it by name: ', h('code', {}, url)),
    n.conflict ? h('div', { class: 'callout attn' }, `Another device (${n.conflict}) also answers for ${n.host}. Give this server another name in System › Network.`) : null,
    h('p', { class: 'muted' }, 'Names ending in .local work on iPad, iPhone, Mac and Windows; on Android it depends on the version — the QR always works.'));
}

function networkBox() {
  const S = store.state, n = S.localName;
  return [
    ...internetBlock(),
    field('Local name', n ? n.host.replace(/\.local$/, '') : '', (v) => run(cmd('net.localName', { name: v }), 'Local name changed'), { unit: '.local', placeholder: 'veation-touch' }),
    h('p', { class: 'muted' }, n?.running
      ? `Tablets on the same network can open http://${n.host}:${n.port || location.port}/ — answered over mDNS (UDP 5353)${n.answered ? `, ${n.answered} lookups so far` : ''}. One name per server: two rooms on one network need two names.`
      : `mDNS is not running${n?.error ? ` (${n.error})` : ''}: use the QR or the address.`),
  ];
}

function processingFields() {
  const pr = P().processing, tr = P().tracking;
  const set = (fn) => editProfile(fn);
  const f = (label, v, fn, unit, step) => field(label, v, fn, { unit, step });
  return [
    h('p', { class: 'muted' }, 'Defaults suit hands on a wall with the plane 1.5–3 cm away. Change one value at a time and watch the view.'),
    f('Background margin', pr.bgThresholdMm, (v) => set((p) => { p.processing.bgThresholdMm = v; }), 'mm', 5),
    f('Edge margin', pr.edgeMargin, (v) => set((p) => { p.processing.edgeMargin = v; }), 'm', 0.01),
    f('Floor margin', pr.floorMargin, (v) => set((p) => { p.processing.floorMargin = v; }), 'm', 0.01),
    f('Cluster gap', pr.clusterGap, (v) => set((p) => { p.processing.clusterGap = v; }), 'm', 0.005),
    f('Min points', pr.minPoints, (v) => set((p) => { p.processing.minPoints = v; }), '', 1),
    f('Min size', pr.minSize, (v) => set((p) => { p.processing.minSize = v; }), 'm', 0.005),
    f('Max size', pr.maxSize, (v) => set((p) => { p.processing.maxSize = v; }), 'm', 0.01),
    f('Contact correction', pr.contactCorrection, (v) => set((p) => { p.processing.contactCorrection = v; }), '', 0.1),
    f('Min quality', pr.minQuality, (v) => set((p) => { p.processing.minQuality = v; }), '', 1),
    h('h2', { style: { marginTop: '12px' } }, 'Tracking'),
    f('Confirm after', tr.confirmFrames, (v) => set((p) => { p.tracking.confirmFrames = v; }), 'rev', 1),
    f('Keep through gaps', tr.coastMs, (v) => set((p) => { p.tracking.coastMs = v; }), 'ms', 10),
    f('Prediction', tr.predictMs, (v) => set((p) => { p.tracking.predictMs = v; }), 'ms', 10),
    f('Merge distance', tr.mergeDist, (v) => set((p) => { p.tracking.mergeDist = v; }), 'm', 0.01),
    f('Max hand speed', tr.maxSpeed, (v) => set((p) => { p.tracking.maxSpeed = v; }), 'm/s', 0.5),
    f('Smoothing (min cutoff)', tr.oneEuro.minCutoff, (v) => set((p) => { p.tracking.oneEuro.minCutoff = v; }), 'Hz', 0.1),
    f('Smoothing (speed β)', tr.oneEuro.beta, (v) => set((p) => { p.tracking.oneEuro.beta = v; }), '', 0.1),
    f('Corner zone', tr.cornerZone ?? 0.25, (v) => set((p) => { p.tracking.cornerZone = v; }), 'm', 0.05),
    h('p', { class: 'muted' }, 'A hand within this distance of a continuous corner, on either wall, stays the same touch when it crosses (0 = off).'),
  ];
}

export function logLines() {
  return store.logs.slice(-200).map((e) => h('div', { class: e.level }, `${new Date(e.t).toLocaleTimeString([], { hour12: false })} ${e.msg}`));
}

function fmtDur(s) {
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
  return hh ? `${hh} h ${mm} min` : `${mm} min ${s % 60} s`;
}

export { round };

/** System › Network › Internet access: relay address, On/Off, New address. Changed only at the server itself. */
function internetBlock() {
  const S = store.state, c = S.cloud;
  if (!c) return [];
  const stateText = !c.enabled ? 'Off' : c.state === 'online' ? 'Online' : c.state === 'error' ? `Error — ${c.error || ''}` : 'Connecting…';
  return [
    h('h3', { class: 'cloud-h' }, 'Internet access'),
    field('Relay URL', c.relayUrl, (v) => run(cmd('cloud.set', { relayUrl: v }), 'Relay address saved'), { placeholder: 'https://veation-relay.example.workers.dev', readonly: !S.local }),
    toggle('Internet access', c.enabled, (on) => run(cmd('cloud.set', { enabled: on }), on ? 'Internet access on' : 'Internet access off'), stateText),
    S.local ? h('div', { class: 'row' }, h('label', {}, 'Address'), h('div', { style: { flex: 1 } }, h('span', { class: 'muted' }, `Room ${c.roomId}`)),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (await confirmBox('Make a new address for this room? Every link and QR code shared so far stops working, and phones must scan the new one.', 'New address', true)) run(cmd('cloud.reset'), 'New address made');
      } }, 'New address')) : null,
    h('p', { class: 'muted' }, S.local
      ? 'The server connects out to a relay, so phones can reach the calibration remote from any network. The link to share is in Connect device › Over the internet.'
      : 'Internet access is changed at the server itself.'),
    h('hr', { class: 'cloud-sep' }),
  ].filter(Boolean);
}
