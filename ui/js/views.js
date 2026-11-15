// Panel views. Each returns DOM for the right-hand panel (bottom sheet on phones).
// They read from `store` and write through `editProfile` / `cmd` only.

import { store, cmd, editProfile, upload } from './conn.js';
import { h, sec, field, selectField, toggle, nudgeField, badge, dot, toast, confirmBox, promptBox, stateKind, round, modal } from './dom.js';
import { gridMap, gridFrom, gridInsert } from '/shared/geometry.js';
import { uvToCanvas } from './workspace.js';

const run = (p, okMsg) => p.then((r) => { if (okMsg) toast(okMsg, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state.profile;

/** Background capture with a 5 s countdown: the operator is often the one holding the tablet in front of the wall. */
function captureBackground(args, what) {
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
const wallName = (id) => P().walls.find((w) => w.id === id)?.name || id;
const nextId = (list, prefix) => { let k = list.length + 1; while (list.some((x) => x.id === `${prefix}${k}`)) k++; return `${prefix}${k}`; };
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

// ======================================================================= LIVE

export function live(ctx) {
  const L = store.live || {};
  const st = store.status?.sensors || {};
  const prof = P();
  const sims = prof.sensors.some((s) => s.driver === 'sim');
  const out = [
    sec(['Health', store.state.locked ? badge('Show · locked', 'warn') : null], health()),
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
        h('div', { class: 't' }, z.name, h('small', {}, wallName(z.wallId))),
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

/** Everything that needs attention, most serious first — or a single "all good". */
function health() {
  const prof = P();
  const st = store.status?.sensors || {};
  const outs = store.status?.outputs || {};
  const eng = store.status?.engine || {};
  const items = [];
  for (const s of prof.sensors.filter((x) => x.enabled)) {
    const t = st[s.id];
    if (!t || t.state === 'stopped') items.push(['bad', `${s.id}: not running`]);
    else if (t.state === 'offline' || t.state === 'error') items.push(['bad', `${s.id} (${s.wallId}): ${t.state}${t.lastError ? ` — ${t.lastError}` : ''}`]);
    else if (t.state !== 'scanning') items.push(['warn', `${s.id}: ${t.state}…`]);
    else {
      if (!t.background) items.push(['warn', `${s.id}: no background captured`]);
      else if (t.bgMotion) items.push(['warn', `${s.id}: something moved during the background capture — repeat it with the wall clear`]);
      if (!s.calibration) items.push(['warn', `${s.id}: not calibrated (using the measured pose)`]);
      if (t.health?.status === 1) items.push(['warn', `${s.id}: sensor reports a warning (0x${t.health.errorCode.toString(16)})`]);
    }
  }
  for (const o of prof.outputs.filter((x) => x.enabled)) {
    const s = outs[o.id];
    if (s?.lastError) items.push(['bad', `Output ${o.name}: ${s.lastError}`]);
  }
  if (eng.fps && eng.fps < 50) items.push(['warn', `Engine running at ${eng.fps} fps (expected 60)`]);
  if (!items.length) return h('div', { class: 'health' }, h('div', { class: 'ok' }, '✓ All sensors scanning, calibrated and outputs sending.'));
  items.sort((a, b) => (a[0] === 'bad' ? -1 : 1) - (b[0] === 'bad' ? -1 : 1));
  return h('div', { class: 'health' }, items.slice(0, 8).map(([k, t]) => h('div', { class: k }, `${k === 'bad' ? '✕' : '!'} ${t}`)),
    items.length > 8 ? h('div', { class: 'muted' }, `+ ${items.length - 8} more`) : null);
}

export function feedLines() {
  if (!store.events.length) return [h('div', { class: 'muted' }, 'No touches yet.')];
  return store.events.slice(0, 30).map((e) => h('div', {},
    `${fmtTime(e.at)}  ${e.type === 'down' ? '▼ down' : '▲ up  '}  #${e.id}  ${e.wallId}  (${e.x.toFixed(2)}, ${e.y.toFixed(2)}) m`));
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
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => newRoomWizard() }, 'New room…'))),
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
          editProfile((p) => { p.walls = p.walls.filter((x) => x.id !== w.id); p.zones = p.zones.filter((z) => z.wallId !== w.id); });
          ctx.select(null);
        } }, 'Delete wall'))),
  ];
}

// ======================================================================= MAPPING

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
      : [h('p', { class: 'muted' }, 'Corner pin: drag each corner until the pattern on the wall matches the physical wall edges (“Show pattern on walls”). It changes where touches land in canvas coordinates, never the image.'),
        ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'].map((name, k) => h('div', { class: 'row' }, h('span', { class: 'k' }, name),
          ...[0, 1].map((a) => { const inp = field(a ? 'y' : 'x', w.mapping.corners[k][a], (v) => set((x) => { x.mapping.corners[k][a] = v; }, 'move corner'), { inline: true, step: 1 }); inp.style.flex = '1'; return inp; }))),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => setMappingMode(w.id, 'rect') }, 'Reset to rectangle'))]));
  out.push(sec('Check it on the wall',
    h('p', { class: 'muted' }, 'With “Show pattern on walls” the projection draws each wall’s 0.5 m grid through this mapping. Touch the wall with a hand (or a virtual hand): the cyan dot must appear under it.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => cmd('projection.set', { mode: store.state.projection.mode === 'identify' ? 'off' : 'identify' }) },
      store.state.projection.mode === 'identify' ? 'Hide pattern' : 'Show pattern on walls'))));
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

export function newRoomWizard() {
  const o = { name: 'New room', walls: 4, width: 6, height: 3, cw: 3840, ch: 912, layout: 'strip', driver: 's2e', ip: '192.168.11.11' };
  const body = h('div', {});
  const draw = () => {
    body.replaceChildren(
      field('Room name', o.name, (v) => { o.name = v; }),
      h('div', { class: 'grid2' },
        selectField('Walls', o.walls, [1, 2, 3, 4, 5, 6, 8].map((n) => [n, String(n)]), (v) => { o.walls = v; draw(); }, { inline: true, numeric: true }),
        selectField('Sensors', o.driver, [['s2e', 'One S2E per wall'], ['sim', 'Simulated (no hardware)'], ['none', 'None yet']], (v) => { o.driver = v; draw(); }, { inline: true }),
        field('Wall width (m)', o.width, (v) => { o.width = v; }, { inline: true, step: 0.01 }),
        field('Wall height (m)', o.height, (v) => { o.height = v; }, { inline: true, step: 0.01 }),
        field('Canvas width (px)', o.cw, (v) => { o.cw = Math.round(v); }, { inline: true, step: 1 }),
        field('Canvas height (px)', o.ch, (v) => { o.ch = Math.round(v); }, { inline: true, step: 1 }),
        selectField('Wall regions', o.layout, [['strip', 'Continuous strip (one panorama)'], ['grid', 'Grid (e.g. 2×2 for a 4-output processor)'], ['row', 'Side by side in fixed slots']], (v) => { o.layout = v; draw(); }, { inline: true }),
        o.driver === 's2e' ? field('First sensor IP', o.ip, (v) => { o.ip = v.trim(); }, { inline: true }) : h('span')),
      o.layout === 'strip' ? h('p', { class: 'muted' }, `Strip: the canvas height is kept (${o.ch} px) and each wall gets a width proportional to its metres — e.g. Barcelona XR Lab is 7196 × 912.`) : null,
      h('p', { class: 'muted' }, 'Everything can be changed afterwards: sizes in Room, pixel regions in Mapping, sensors in Sensors.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: create }, 'Create room'), h('button', { class: 'btn', onclick: () => close() }, 'Cancel')));
  };
  const close = modal('New room', body);
  draw();

  function create() {
    const n = o.walls;
    let walls;
    if (o.layout === 'strip') {
      // one continuous panorama: same pixels per metre everywhere, walls side by side
      const pxPerM = o.ch / o.height;
      const ww = Math.round(o.width * pxPerM);
      walls = Array.from({ length: n }, (_, i) => ({ id: `W${i + 1}`, name: `Wall ${i + 1}`, width: o.width, height: o.height,
        pixelRect: { x: i * ww, y: 0, w: ww, h: o.ch } }));
      o.cw = ww * n;
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
    run(cmd('profile.create', { name: o.name, profile }), `Created ${o.name}`).then((r) => { if (r) close(); });
  }
}

// ======================================================================= SENSORS

export function sensors(ctx) {
  const prof = P();
  const st = store.status?.sensors || {};
  const s = ctx.sel?.kind === 'sensor' ? prof.sensors.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec(['Sensors', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => discoverModal(ctx), title: 'Find RPLIDAR S2E units on the network' }, 'Discover'),
      h('button', { class: 'btn small', onclick: () => addSensor('s2e') }, '+ S2E'),
      h('button', { class: 'btn small', onclick: () => addSensor('sim') }, '+ Simulated')],
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

function sensorEditor(s, t, ctx) {
  const set = (fn) => editProfile((p) => fn(p.sensors.find((x) => x.id === s.id)));
  const out = [];
  out.push(sec(`Sensor ${s.id}`,
    field('Name', s.name, (v) => set((x) => { x.name = v; })),
    selectField('Wall', s.wallId, P().walls.map((w) => [w.id, `${w.id} · ${w.name}`]), (v) => set((x) => { x.wallId = v; })),
    selectField('Driver', s.driver, [['s2e', 'RPLIDAR S2E (Ethernet)'], ['sim', 'Simulated']], (v) => set((x) => { x.driver = v; })),
    s.driver === 's2e' ? [
      field('IP address', s.host, (v) => set((x) => { x.host = v.trim(); })),
      field('UDP port', s.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
      selectField('Scan mode', s.scanMode, [['auto', 'Auto (Sensitivity if available)'], ['typical', 'Slamtec typical'], ['sensitivity', 'Sensitivity'], ['dense', 'DenseBoost']], (v) => set((x) => { x.scanMode = v; })),
      field('Motor speed', s.motorRpm, (v) => set((x) => { x.motorRpm = Math.round(v); }), { unit: 'rpm', step: 60 }),
      h('p', { class: 'muted' }, '0 = sensor default (600 rpm = 10 Hz). Faster spins lower latency but fewer points per revolution.'),
    ] : null,
    toggle('Enabled', s.enabled, (on) => set((x) => { x.enabled = on; }))));

  out.push(sec('Mounting (wall metres)',
    h('p', { class: 'muted' }, s.calibration ? 'Calibrated: the pose below is no longer used for tracking.' : 'Position of the sensor on its wall (origin: bottom-left corner, seen from inside the room). Use Auto-align with the room empty, or drag / rotate the sensor on the canvas.'),
    autoAlignBox(s, t),
    levelCheckBox(s, t),
    nudgeField('X', s.pose.x, 0.01, (v) => set((x) => { x.pose.x = v; }), { unit: 'm' }),
    nudgeField('Y', s.pose.y, 0.01, (v) => set((x) => { x.pose.y = v; }), { unit: 'm' }),
    nudgeField('Rotation', s.pose.rotation, 0.5, (v) => set((x) => { x.pose.rotation = v; }), { unit: '°', decimals: 2 }),
    toggle('Mirror', s.pose.mirror, (on) => set((x) => { x.pose.mirror = on; }), 'sensor mounted upside down')));

  const kv = (k, v) => [h('dt', {}, k), h('dd', {}, v ?? '—')];
  out.push(sec('Status',
    t ? h('dl', { class: 'kv' },
      kv('State', h('span', {}, dot(stateKind(t.state)), ' ', t.state)),
      kv('Revolutions', `${t.hz} Hz`), kv('Packets', `${t.pps}/s`), kv('Mode', t.modeName),
      kv('Data age', t.sinceData === null ? '—' : `${t.sinceData} ms`),
      kv('CRC errors', t.crcErrors), kv('Restarts', t.restarts),
      kv('Firmware', t.info?.firmware), kv('Serial', t.info?.serial),
      kv('Health', t.health ? ['good', 'warning', 'error'][t.health.status] + (t.health.errorCode ? ` (0x${t.health.errorCode.toString(16)})` : '') : null),
      kv('Detections', `${t.detections} · ${t.rejected} large`),
      t.lastError ? kv('Last error', h('span', { style: { color: 'var(--danger)' } }, t.lastError)) : null)
      : h('p', { class: 'muted' }, s.enabled ? 'Starting…' : 'Disabled.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', disabled: !t, onclick: () => run(cmd('sensor.restart', { id: s.id }), 'Restarting') }, 'Restart'))));

  out.push(sec('Background',
    h('p', { class: 'muted' }, 'Learn what the sensor sees with the room EMPTY (floor, adjacent walls, fixed objects). Everything else becomes a touch candidate.'),
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Status'), t?.learning ? badge(`learning ${t.learning.done}/${t.learning.frames}`, 'warn') : t?.background ? (t.bgMotion ? badge('captured · movement', 'warn') : badge('captured', 'ok')) : badge('none', 'warn')),
    t?.bgMotion && !t.learning ? h('div', { class: 'callout attn' },
      `Something moved in front of the wall during the capture (near ${t.bgMotion.where.map((w) => `x ${w.x} m, y ${w.y} m`).join(' · ')}). `
      + 'It may now be part of the background and hide touches there: capture again with the wall clear.') : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn small primary', disabled: !t, onclick: () => captureBackground({ sensorId: s.id }, s.id) }, t?.bgMotion ? 'Capture again' : 'Capture background'),
      h('button', { class: 'btn small', disabled: !t?.background, onclick: () => run(cmd('bg.clear', { sensorId: s.id })) }, 'Clear'))));

  out.push(sec('Calibration',
    s.calibration
      ? h('dl', { class: 'kv' }, ...kv('Type', s.calibration.kind), ...kv('Error (RMS)', `${s.calibration.rmsMm} mm`), ...kv('Worst point', `${s.calibration.maxMm} mm`), ...kv('Points', s.calibration.points), ...kv('Date', s.calibration.at ? new Date(s.calibration.at).toLocaleString() : '—'))
      : h('p', { class: 'muted' }, 'Not calibrated — using the measured pose.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => { ctx.calibWall = s.wallId; ctx.go('calibrate'); } }, `Calibrate ${s.wallId}…`),
      h('button', { class: 'btn small danger', disabled: !s.calibration, onclick: async () => {
        if (await confirmBox(`Remove the calibration of ${s.id}? It will fall back to the measured pose.`, 'Remove', true)) run(cmd('calib.clear', { sensorId: s.id }));
      } }, 'Remove calibration'))));

  out.push(sec(null, h('button', { class: 'btn small danger', onclick: async () => {
    if (!await confirmBox(`Delete sensor ${s.id} "${s.name}"?`, 'Delete', true)) return;
    editProfile((p) => { p.sensors = p.sensors.filter((x) => x.id !== s.id); });
    ctx.select(null);
  } }, 'Delete sensor')));
  return out;
}

/** Discover S2E units on the network; add them as sensors or point an existing sensor at them. */
function discoverModal(ctx) {
  const body = h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Searching the server networks for RPLIDAR S2E units (UDP 8089)…'));
  const close = modal('Discover sensors', body);
  cmd('sensor.discover').then((r) => {
    const prof = P();
    const walls = prof.walls.map((w) => [w.id, `${w.id} · ${w.name}`]);
    const rows = r.found.map((f) => {
      let wallId = walls.find(([id]) => !prof.sensors.some((s) => s.wallId === id))?.[0] || walls[0]?.[0];
      return h('div', { class: 'item', style: { flexWrap: 'wrap', cursor: 'default' } },
        h('div', { class: 't' }, `${f.host}${f.factoryDefault ? ' (factory address)' : ''}`,
          h('small', {}, `${f.info ? `serial ${f.info.serial} · fw ${f.info.firmware}` : 'no info'} · health ${['good', 'warning', 'error'][f.health.status] || f.health.status}`)),
        f.usedBy ? badge(`used by ${f.usedBy}`, 'ok') : [
          selectField('', wallId, walls, (v) => { wallId = v; }, { inline: true }),
          h('button', { class: 'btn small primary', onclick: () => {
            const id = nextId(P().sensors, 'S');
            const wall = P().walls.find((w) => w.id === wallId);
            editProfile((q) => { q.sensors.push({ id, name: `LiDAR ${wallId}`, wallId, driver: 's2e', host: f.host, port: 8089, pose: { x: wall.width / 2, y: wall.height + 0.3, rotation: -90 } }); }, 'add discovered sensor');
            toast(`${id} added on ${wallId} — then Auto-align it with the room empty`, 'ok'); close(); setTimeout(() => ctx.select('sensor', id));
          } }, 'Add')],
        h('button', { class: 'btn small', title: 'Experimental: not yet verified on hardware', onclick: async () => {
          const ip = await promptBox(`New static IP for ${f.host} (experimental — RoboStudio is the proven way)`, f.factoryDefault ? '192.168.11.11' : f.host, 'Set IP');
          if (!ip) return;
          if (!await confirmBox(`Change ${f.host} to ${ip}? The unit resets and comes back on the new address. If it does not answer afterwards, use RoboStudio.`, 'Change IP')) return;
          run(cmd('sensor.setIp', { host: f.host, ip }), `Sent — the unit resets as ${ip}. Run Discover again in a few seconds.`);
        } }, 'Change IP…'));
    });
    body.replaceChildren(
      rows.length ? h('div', { class: 'list' }, rows) : h('p', {}, 'No unit answered. Check the PoE switch, the cables and that this server has an address in the sensors’ network (new units answer on 192.168.11.2 — the server needs a 192.168.11.x address).'),
      r.running.length ? h('p', { class: 'muted' }, `Not probed (running, probing would interrupt them): ${r.running.map((x) => `${x.host}${x.usedBy ? ` = ${x.usedBy}` : ''}`).join(', ')}`) : null,
      h('p', { class: 'muted' }, 'Every new S2E ships as 192.168.11.2: connect and re-address them one at a time.'));
  }).catch((e) => body.replaceChildren(h('div', { class: 'callout bad' }, e.message)));
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
    out.replaceChildren(h('div', { class: 'callout ok' },
      h('div', {}, h('b', {}, 'Proposed pose: '), `x ${p.x} m · y ${p.y} m · ${p.rotation}°${p.mirror ? ' · mirrored' : ''}`),
      h('div', { class: 'muted' }, `Seen: floor${r.seen.left ? ' · left wall' : ''}${r.seen.right ? ' · right wall' : ''} · floor fit ${r.floorRmsMm} mm · x from ${r.xFrom}${r.usedBackground ? '' : ' · from a live scan (capture the background for a steadier result)'}`),
      r.measuredWidth !== null ? h('div', { style: { color: widthWarn ? 'var(--attn)' : undefined } }, `Wall width measured between neighbours: ${r.measuredWidth} m (plans: ${wall.width} m${widthWarn ? ` — ${r.widthDiff > 0 ? '+' : ''}${Math.round(r.widthDiff * 1000)} mm, check the plans or the corners` : ''})`) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn small primary', onclick: () => editProfile((q) => { q.sensors.find((x) => x.id === s.id).pose = { ...p }; }, 'auto-align sensor').then(() => { done(); toast('Pose applied', 'ok'); }) }, 'Apply'),
        widthWarn ? h('button', { class: 'btn small', onclick: () => editProfile((q) => { q.walls.find((w) => w.id === s.wallId).width = r.measuredWidth; }, 'wall width from sensor') }, `Use ${r.measuredWidth} m as wall width`) : null,
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
  if (c) return calibSession(c, ctx);
  const vs = store.status?.verify;
  if (vs) return verifySession(vs);
  const prof = P();
  const st = store.status?.sensors || {};
  const wallId = ctx.calibWall && prof.walls.some((w) => w.id === ctx.calibWall) ? ctx.calibWall : prof.walls[0]?.id;
  ctx.calibWall = wallId;
  const wall = prof.walls.find((w) => w.id === wallId);
  if (!wall) return [sec('Calibrate', h('p', { class: 'muted' }, 'Add a wall first.'))];
  const sensorsOfWall = prof.sensors.filter((s) => s.wallId === wall.id && s.enabled);
  const running = sensorsOfWall.filter((s) => st[s.id] && st[s.id].state === 'scanning');
  const withBg = sensorsOfWall.filter((s) => st[s.id]?.background);
  const proj = store.state.projection;
  const opt = ctx.calibOpt;
  const check = (done, text, action) => h('div', { class: `check${done ? ' done' : ''}` }, h('span', { class: 'mark' }, done ? '✓' : ''), h('span', { class: 't' }, text), action);

  return [
    sec('Wall to calibrate', h('div', { class: 'seg', style: { flexWrap: 'wrap', height: 'auto' } }, prof.walls.map((w) =>
      h('button', { class: w.id === wallId ? 'on' : '', style: { height: 'var(--ctl-h)' }, onclick: () => { ctx.calibWall = w.id; ctx.rerender(); } }, w.id)))),
    sec('Before you start', h('div', { class: 'checklist' },
      check(sensorsOfWall.length > 0 && running.length === sensorsOfWall.length, `${running.length}/${sensorsOfWall.length} sensors of ${wall.id} running`),
      check(sensorsOfWall.length > 0 && withBg.length === sensorsOfWall.length, 'Background captured with the room empty',
        h('button', { class: 'btn small', disabled: !running.length, onclick: () => captureBackground({ wallId: wall.id }, wall.id) }, 'Capture')),
      check(proj.open || !store.state.displays?.length, store.state.displays?.length ? 'Projection window open (targets appear on the wall)' : 'Open /projection on the projection screen',
        store.state.displays?.length ? h('button', { class: 'btn small', onclick: () => run(cmd('projection.set', { open: !proj.open })) }, proj.open ? 'Close' : 'Open') : null))),
    sec('Targets',
      h('p', { class: 'muted' }, 'A grid of targets within reach. More targets = better accuracy; 3 × 3 is a good default.'),
      h('div', { class: 'grid2' },
        selectField('Columns', opt.cols, [[2, '2'], [3, '3'], [4, '4'], [5, '5']], (v) => { opt.cols = v; ctx.rerender(); }, { inline: true, numeric: true }),
        selectField('Rows', opt.rows, [[2, '2'], [3, '3'], [4, '4']], (v) => { opt.rows = v; ctx.rerender(); }, { inline: true, numeric: true }),
        field('Lowest target', opt.bottom, (v) => { opt.bottom = v; }, { inline: true, step: 0.05 }),
        field('Highest target', opt.top, (v) => { opt.top = v; }, { inline: true, step: 0.05 })),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Hold time'), selectField('', opt.holdMs, [[500, '0.5 s'], [700, '0.7 s'], [1000, '1 s'], [1500, '1.5 s']], (v) => { opt.holdMs = v; }, { inline: true, numeric: true }))),
    sec(null,
      h('button', { class: 'btn primary block', disabled: !running.length, onclick: () => run(cmd('calib.start', { wallId: wall.id, cols: opt.cols, rows: opt.rows, top: opt.top, bottom: opt.bottom, holdMs: opt.holdMs, force: withBg.length !== sensorsOfWall.length && ctx.forceCalib })) },
        `Start calibration of ${wall.id}`),
      withBg.length !== sensorsOfWall.length ? h('p', { class: 'muted' }, 'Capture the background first — without it the floor and side walls look like hands.') : null),
    sec('Current calibration', h('div', { class: 'list' }, sensorsOfWall.map((s) => h('div', { class: 'item', onclick: () => ctx.select('sensor', s.id) },
      h('div', { class: 't' }, `${s.id} · ${s.name}`), s.calibration ? badge(`${s.calibration.rmsMm} mm RMS`, s.calibration.rmsMm < 10 ? 'ok' : 'warn') : badge('not calibrated')))),
      h('p', { class: 'muted' }, 'Verify touches 5 new points (not the calibration ones) and measures the error of the real tracked touch — what the outputs send.'),
      h('button', { class: 'btn block', disabled: !running.length, onclick: () => run(cmd('verify.start', { wallId: wall.id, top: opt.top, bottom: opt.bottom })) }, `Verify ${wall.id}`)),
  ];
}

function verifySession(v) {
  const total = v.targets.length;
  if (v.phase === 'done') {
    const s = v.summary;
    const good = s && s.maxMm <= 25;
    return [sec(`Verification of ${v.wallId}`,
      s ? h('div', { class: `callout ${good ? 'ok' : 'attn'}` }, `Mean error ${s.meanMm} mm · worst ${s.maxMm} mm on ${s.n} points. `, good ? 'Good for hands.' : 'Larger than a hand radius: recalibrate, or redo the worst calibration point.') : h('p', { class: 'muted' }, 'No point measured.'),
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
    sec(null, h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn danger', onclick: () => run(cmd('verify.cancel')) }, 'Stop'))),
  ];
}

function calibSession(c, ctx) {
  const total = c.targets.length;
  const wall = P().walls.find((w) => w.id === c.wallId);
  if (c.phase === 'done') {
    const rows = Object.entries(c.result || {});
    const ok = rows.some(([, r]) => r.ok);
    return [
      sec(`Calibration of ${c.wallId} — result`,
        h('table', { class: 'calib-table' },
          h('tr', {}, h('th', {}, 'Sensor'), h('th', {}, 'Type'), h('th', {}, 'Points'), h('th', {}, 'RMS'), h('th', {}, 'Worst')),
          rows.map(([sid, r]) => h('tr', {}, h('td', {}, sid), h('td', {}, r.ok ? r.kind : h('span', { style: { color: 'var(--danger)' } }, r.error)),
            h('td', {}, String(r.points)), h('td', {}, r.ok ? `${r.rmsMm} mm` : '—'), h('td', {}, r.ok ? `${r.maxMm} mm` : '—')))),
        h('p', { class: 'muted' }, 'Below ~10 mm RMS is excellent for hands. A single large worst point usually means that target was touched off-centre — redo it with "Back".'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', disabled: !ok, onclick: () => run(cmd('calib.apply'), 'Calibration saved — verify it with “Verify”') }, 'Apply & save'),
          c.worst >= 0 ? h('button', { class: 'btn attn', onclick: () => run(cmd('calib.redo', { index: c.worst })) }, `Redo worst point (#${c.worst + 1})`) : null,
          h('button', { class: 'btn', onclick: () => run(cmd('calib.back')) }, 'Back'),
          h('button', { class: 'btn danger', onclick: () => run(cmd('calib.cancel')) }, 'Discard'))),
    ];
  }
  const msg = c.phase === 'release' ? 'Captured — take your hand off the wall.'
    : c.phase === 'holding' ? 'Hold still…'
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
      h('button', { class: 'btn', onclick: () => run(cmd('calib.skip')) }, 'Skip target'),
      h('button', { class: 'btn danger', onclick: () => run(cmd('calib.cancel')) }, 'Cancel'))),
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

export function zones(ctx) {
  const prof = P();
  const wallId = ctx.ws.focus || prof.walls[0]?.id;
  const wall = prof.walls.find((w) => w.id === wallId);
  const z = ctx.sel?.kind === 'zone' ? prof.zones.find((x) => x.id === ctx.sel.id) : null;
  const m = ctx.sel?.kind === 'mask' ? wall?.masks.find((x) => x.id === ctx.sel.id) : null;
  const tool = (t, label) => h('button', { class: `btn small${ctx.ws.tool === t ? ' attn' : ''}`, onclick: () => { ctx.ws.tool = t; ctx.rerender(); } }, label);
  const zl = prof.zones.filter((x) => x.wallId === wallId);
  const out = [
    sec([`Zones on ${wallId || '—'}`, h('span', { class: 'grow' }), tool('zone', '+ Draw zone')],
      h('p', { class: 'muted' }, 'Each zone sends enter / hold / exit and a live count. Drag on the wall to draw; drag to move; handles resize.'),
      zl.length ? h('div', { class: 'list' }, zl.map((x) => h('div', { class: `item${z?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('zone', x.id, x.wallId) },
        h('div', { class: 't' }, x.name, h('small', {}, `${x.id} · ${(Math.abs(x.rect.x1 - x.rect.x0)).toFixed(2)} × ${(Math.abs(x.rect.y1 - x.rect.y0)).toFixed(2)} m`)),
        store.live?.zones?.[x.id]?.active ? badge(`active · ${store.live.zones[x.id].count}`, 'warn') : null,
        !x.enabled ? badge('off') : null))) : h('p', { class: 'muted' }, 'No zones on this wall yet.')),
    sec([`Masks on ${wallId || '—'}`, h('span', { class: 'grow' }), tool('mask', '+ Draw mask')],
      h('p', { class: 'muted' }, 'Ignored areas: a door, a lamp crossing the scan plane, a speaker…'),
      wall?.masks.length ? h('div', { class: 'list' }, wall.masks.map((x) => h('div', { class: `item${m?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('mask', x.id, wallId) },
        h('div', { class: 't' }, x.name, h('small', {}, `${x.id} · ${(Math.abs(x.x1 - x.x0)).toFixed(2)} × ${(Math.abs(x.y1 - x.y0)).toFixed(2)} m`))))) : h('p', { class: 'muted' }, 'No masks.')),
  ];
  if (z) {
    const set = (fn, label = 'edit zone') => editProfile((p) => fn(p.zones.find((x) => x.id === z.id)), label);
    out.push(sec(`Zone ${z.id}`,
      field('Name', z.name, (v) => set((x) => { x.name = v; }, 'rename zone')),
      selectField('Wall', z.wallId, prof.walls.map((w) => [w.id, `${w.id} · ${w.name}`]), (v) => set((x) => { x.wallId = v; }, 'move zone to wall')),
      h('div', { class: 'grid4' }, ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, z.rect[k], (v) => set((x) => { x.rect[k] = v; }), { inline: true, step: 0.01 }))),
      field('Hold after', z.holdMs, (v) => set((x) => { x.holdMs = Math.round(v); }), { unit: 'ms', step: 100 }),
      field('Release after', z.releaseMs, (v) => set((x) => { x.releaseMs = Math.round(v); }), { unit: 'ms', step: 50 }),
      field('Trigger address', z.address, (v) => set((x) => { x.address = v.trim(); }, 'trigger address'), { placeholder: slugAddr(z.name) }),
      toggle('Enabled', z.enabled, (on) => set((x) => { x.enabled = on; })),
      h('p', { class: 'muted' }, 'Touches OSC: ', h('code', {}, `/vt/zone/${z.id}/enter|hold|exit`), ' · Triggers output: ', h('code', {}, `${z.address || slugAddr(z.name)} 1|0`)),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.zones = p.zones.filter((x) => x.id !== z.id); }, 'delete zone'); ctx.select(null); } }, 'Delete zone'))));
  }
  if (m) {
    const set = (fn, label = 'edit mask') => editProfile((p) => fn(p.walls.find((w) => w.id === wallId).masks.find((x) => x.id === m.id)), label);
    out.push(sec(`Mask ${m.id}`,
      field('Name', m.name, (v) => set((x) => { x.name = v; }, 'rename mask')),
      h('div', { class: 'grid4' }, ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, m[k], (v) => set((x) => { x[k] = v; }), { inline: true, step: 0.01 }))),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { const w = p.walls.find((q) => q.id === wallId); w.masks = w.masks.filter((x) => x.id !== m.id); }, 'delete mask'); ctx.select(null); } }, 'Delete mask'))));
  }
  return out;
}

// ======================================================================= OUTPUTS

export function outputs(ctx) {
  const prof = P();
  const stats = store.status?.outputs || {};
  const o = ctx.sel?.kind === 'output' ? prof.outputs.find((x) => x.id === ctx.sel.id) : null;
  const add = (type) => {
    if (type === 'texture' && prof.outputs.some((x) => x.type === 'texture' && x.enabled)) return toast('There is already an active Texture output (one Spout sender per installation).', 'bad');
    const id = nextId(prof.outputs, 'O');
    editProfile((p) => {
      p.outputs.push({ id, name: { tuio: 'TUIO', triggers: 'Triggers', texture: 'Touch texture', webhook: 'Webhook', artnet: 'Art-Net' }[type] || 'OSC', type,
        host: type === 'artnet' ? '255.255.255.255' : '127.0.0.1', port: { tuio: 3333, triggers: 7000, artnet: 6454 }[type] || 9000 });
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
  else if (o?.type === 'webhook' || o?.type === 'artnet') out.push(zoneOutputEditor(o, stats[o.id], ctx));
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
      o.type === 'osc' ? field('Address prefix', o.prefix, (v) => set((x) => { x.prefix = v; })) : o.type === 'tuio' ? toggle('One port per wall', o.tuioPortPerWall, (on) => set((x) => { x.tuioPortPerWall = on; }), on ? '' : `${o.port}, ${o.port + 1}…`) : null,
      trig ? h('div', { class: 'feed', style: { maxHeight: 'none' } }, prof.zones.length ? prof.zones.map((z) => h('div', {}, `${z.address || slugAddr(z.name)}   ← ${z.name} (${z.wallId})`)) : h('div', { class: 'muted' }, 'No zones yet — draw them in Zones.')) : null,
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
  ['texture', 'Texture (Spout)', 'Black & white mask of the touches on this computer'],
  ['tuio', 'TUIO', 'The multitouch standard (TUIO 1.1 cursors)'],
  ['webhook', 'Webhook', 'Zone events as HTTP POST (JSON) — show control, home automation, your own server'],
  ['artnet', 'Art-Net (DMX)', 'One DMX channel per zone, 255 while active — lighting consoles and nodes'],
];

function outputSummary(x) {
  if (x.type === 'triggers') return `TRIGGERS → ${x.host}:${x.port} · zones on/off`;
  if (x.type === 'webhook') return `WEBHOOK → ${x.url || 'no URL yet'} · zone events`;
  if (x.type === 'artnet') return `ART-NET → ${x.host} · universe ${x.universe} · from channel ${x.channel}`;
  if (x.type === 'texture') return `TEXTURE → Spout “${x.senderName}” · ${x.rateHz} Hz`;
  return `${x.type.toUpperCase()} → ${x.host}:${x.port} · ${x.coords === 'canvas' ? 'canvas' : 'wall'} UV · ${x.rateHz} Hz`;
}

function wallsPicker(o, set) {
  const prof = P();
  return h('div', { class: 'row' }, h('span', { class: 'k' }, 'Walls'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 } },
    prof.walls.map((w) => {
      const on = !o.walls.length || o.walls.includes(w.id);
      return h('button', { class: `ibtn${on ? ' on' : ''}`, onclick: () => set((x) => {
        const all = prof.walls.map((q) => q.id);
        let sel = x.walls.length ? x.walls.slice() : all.slice();
        sel = on ? sel.filter((q) => q !== w.id) : [...sel, w.id];
        x.walls = sel.length === all.length ? [] : sel;
      }) }, w.id);
    })));
}

/** Webhook and Art-Net: zone-driven destinations (no touch coordinates). */
function zoneOutputEditor(o, s, ctx) {
  const prof = P();
  const set = (fn) => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)));
  const zones = prof.zones.filter((z) => z.enabled !== false && (!o.walls.length || o.walls.includes(z.wallId)));
  const hook = o.type === 'webhook';
  const body = hook ? [
    field('URL', o.url, (v) => set((x) => { x.url = v.trim(); }), { placeholder: 'http://192.168.1.50:8000/hook' }),
    o.url ? null : h('div', { class: 'callout attn' }, 'Enter an http:// or https:// address.'),
    h('p', { class: 'muted' }, 'One POST per zone event (enter, hold, exit), in order, JSON body:'),
    h('div', { class: 'feed', style: { maxHeight: 'none' } }, h('div', {}, '{ "event": "enter", "zone": { "id", "name", "wallId", "address" },'), h('div', {}, '  "count": 1, "duration": 1.5 (exit), "room": 3, "time": "…" }')),
  ] : [
    field('Host', o.host, (v) => set((x) => { x.host = v.trim(); })),
    h('p', { class: 'muted' }, 'The node’s IP, or a broadcast address (255.255.255.255, 2.255.255.255…).'),
    field('Port', o.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
    field('Universe', o.universe, (v) => set((x) => { x.universe = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, '15-bit Port-Address (Net · Sub-Net · Universe), 0–32767.'),
    field('First channel', o.channel, (v) => set((x) => { x.channel = Math.round(v); }), { step: 1 }),
    h('p', { class: 'muted' }, 'One channel per zone: 255 while the zone is active, 0 otherwise. Sent on change and every second.'),
    h('div', { class: 'feed', style: { maxHeight: 'none' } }, zones.length
      ? zones.slice(0, 513 - o.channel).map((z, k) => h('div', {}, `ch ${o.channel + k}   ← ${z.name} (${z.wallId})`))
      : h('div', { class: 'muted' }, 'No zones yet — draw them in Zones.')),
  ];
  return sec(`${hook ? 'Webhook' : 'Art-Net (DMX)'} · ${o.id}`,
    field('Name', o.name, (v) => set((x) => { x.name = v; })),
    ...body,
    wallsPicker(o, set),
    toggle('Enabled', o.enabled, (on) => set((x) => { x.enabled = on; })),
    s ? h('p', { class: 'muted' }, `${s.sent} ${hook ? 'requests' : 'packets'} sent · ${s.errors} errors${s.lastError ? ` · ${s.lastError}` : ''}`) : null,
    hook ? null : h('p', { class: 'muted' }, 'Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', disabled: hook && !o.url, onclick: () => run(cmd('output.test', { id: o.id }), hook ? 'Test event posted' : 'All mapped channels at 255 for a second') }, 'Send test'),
      h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.outputs = p.outputs.filter((x) => x.id !== o.id); }); ctx.select(null); } }, 'Delete')));
}

function textureEditor(o, s, ctx) {
  const prof = P();
  const set = (fn, label = 'edit texture output') => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)), label);
  const dims = (k) => `${Math.round(prof.canvas.width * k)}×${Math.round(prof.canvas.height * k)}`;
  return [
    sec(`Texture (Spout) · ${o.id}`,
      h('p', { class: 'muted' }, 'A greyscale mask of the touches — white discs on black — in output-canvas pixels, following each wall’s Mapping. Use it as a texture: particles, fluids, reveal masks.'),
      field('Name', o.name, (v) => set((x) => { x.name = v; })),
      field('Spout sender', o.senderName, (v) => set((x) => { x.senderName = v; }, 'rename Spout sender')),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Resolution'), h('div', { class: 'seg' }, [[0.125, '1/8'], [0.25, '1/4'], [0.5, '1/2'], [1, 'Full']].map(([k, t]) =>
        h('button', { class: o.scale === k ? 'on' : '', title: dims(k), onclick: () => set((x) => { x.scale = k; }, 'texture resolution') }, t))), h('span', { class: 'muted' }, dims(o.scale))),
      field('Disc radius', o.radius, (v) => set((x) => { x.radius = v; }), { unit: 'm', step: 0.01 }),
      field('Soft edge', o.softness, (v) => set((x) => { x.softness = Math.max(0, Math.min(1, v)); }), { step: 0.1 }),
      field('Trail', o.trailMs, (v) => set((x) => { x.trailMs = Math.round(v); }), { unit: 'ms', step: 50 }),
      field('Rate', o.rateHz, (v) => set((x) => { x.rateHz = Math.round(v); }), { unit: 'Hz', step: 1 }),
      toggle('Enabled', o.enabled, (on) => set((x) => { x.enabled = on; })),
      s?.lastError ? h('div', { class: 'callout bad' }, s.lastError) : h('p', { class: 'muted' }, `${s?.sent ?? 0} frames sent`),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.outputs = p.outputs.filter((x) => x.id !== o.id); }, 'delete output'); ctx.select(null); } }, 'Delete'))),
    sec('Receive it',
      h('div', { class: 'feed', style: { maxHeight: 'none' } },
        h('div', {}, `TouchDesigner: Syphon Spout In TOP → sender "${o.senderName}"`),
        h('div', {}, `Resolume / MadMapper: Spout source "${o.senderName}"`),
        h('div', {}, 'Unreal: a Spout receiver plugin (e.g. Off World Live)'),
        h('div', { class: 'muted' }, 'Same machine only (Spout shares a GPU texture). For another machine, use OSC/WebSocket and build the mask there.'))),
  ];
}

// ======================================================================= SYSTEM

export function system(ctx) {
  const S = store.state;
  const eng = store.status?.engine || {};
  const lan = S.lan || [];
  const out = [
    sec('Connect a phone or tablet', connectContent()),
    sec(['Room profiles', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: newProfile }, '+ New'),
      h('label', { class: 'btn small' }, 'Import', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importProfile }))],
      h('div', { class: 'list' }, S.profiles.map((p) => h('div', { class: `item${p.id === S.profile.id ? ' on' : ''}` },
        h('div', { class: 't' }, p.name, h('small', {}, `${p.id} · ${p.walls} walls · ${p.sensors} sensors`)),
        p.id === S.profile.id ? badge('active', 'ok') : h('button', { class: 'btn small', onclick: () => run(cmd('profile.load', { id: p.id }), `Loaded ${p.name}`) }, 'Load'),
        h('button', { class: 'btn small', onclick: () => versionsModal(p) }, 'Versions'),
        h('button', { class: 'btn small', onclick: () => exportProfile(p.id) }, 'Export'),
        h('button', { class: 'btn small', onclick: () => duplicate(p) }, 'Duplicate'),
        p.id !== S.profile.id ? h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`Delete the room profile "${p.name}"? A backup is kept in the data folder.`, 'Delete', true)) run(cmd('profile.delete', { id: p.id })); } }, '✕') : null)))),
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
      h('p', { class: 'muted' }, 'Identify draws every wall with its id and grid — use it to check the pixel layout. Debug draws the live touches. Calibration targets always appear while calibrating.'),
      S.displays?.length ? projectionControls() : h('p', { class: 'muted' }, 'Projection page: ', h('a', { href: '/projection', target: '_blank', style: { color: 'var(--ink-2)' } }, '/projection'), ' — open it fullscreen on the projection output.')),
    sec('Log', h('div', { class: 'log', id: 'logBox' }, logLines())),
  ];
  return out;

  async function newProfile() {
    const name = await promptBox('Name of the new room', 'New room', 'Create');
    if (name) run(cmd('profile.create', { name, from: 'blank' }), `Created ${name}`);
  }
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
    h('div', { class: 'seg' }, [['off', 'Off'], ['identify', 'Identify'], ['debug', 'Debug']].map(([m, t]) =>
      h('button', { class: pr.mode === m ? 'on' : '', onclick: () => run(cmd('projection.set', { mode: m })) }, t))));
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

export function connectContent() {
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
  const drawDevices = () => {
    const list = (store.status?.clients || []).filter((c) => !c.local);
    devices.replaceChildren(list.length
      ? h('div', { class: 'check done' }, h('span', { class: 'mark' }, '✓'), h('span', { class: 't' }, `Connected: ${list.map((c) => `${c.device} (${c.addr})`).join(' · ')}`))
      : h('div', { class: 'check' }, h('span', { class: 'mark' }, '…'), h('span', { class: 't muted' }, 'Waiting for a phone or tablet to connect…')));
  };
  cmd('net.firewall').then(drawFirewall).catch(() => {});
  const timer = setInterval(() => { if (!box.isConnected) clearInterval(timer); else drawDevices(); }, 1000);
  const draw = () => {
    const c = lan.find((l) => l.iface === pairIface) || lan[0];
    box.replaceChildren(
      lan.length > 1 ? h('div', { class: 'row' }, h('span', { class: 'k' }, 'Network'),
        h('div', { class: 'seg', style: { flexWrap: 'wrap', height: 'auto' } }, lan.map((l) => h('button', { class: l === c ? 'on' : '', style: { height: 'var(--ctl-h)' }, title: l.sensors ? 'This is the LiDAR network' : '', onclick: () => {
          pairIface = l.iface; try { localStorage.setItem('vt-pair-iface', l.iface); } catch { /* ignore */ } draw();
        } }, `${l.iface} · ${l.ip}${l.sensors ? ' (sensors)' : ''}`)))) : null,
      c.sensors ? h('div', { class: 'callout attn' }, 'This network reaches the LiDARs. Prefer the room Wi-Fi / access point for tablets.') : null,
      h('div', { class: 'qr' }, h('img', { src: `/api/qr.svg?t=${encodeURIComponent(c.url)}`, alt: 'QR code' })),
      h('p', { style: { textAlign: 'center' } }, `Scan with the tablet camera. The tablet must be on the same network as "${c.iface}".`),
      h('p', {}, h('code', {}, c.url)),
      h('div', { class: 'checklist', style: { margin: '12px 0' } }, fw, devices),
      h('div', { class: 'callout' },
        h('b', {}, 'Still not opening?'), h('br'),
        '1. Pick the network the tablet is on (above). ', h('br'),
        '2. Some Wi-Fi networks isolate devices from each other (“client isolation”) — use the room access point with isolation off.'),
      h('p', { class: 'muted' }, 'The link contains the access key of this installation — share it only with operators.'));
    drawDevices();
  };
  draw();
  return box;
}

export function openConnectModal() { modal('Connect a device', connectContent()); }

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
