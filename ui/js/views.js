// Panel views. Each returns DOM for the right-hand panel (bottom sheet on phones).
// They read from `store` and write through `editProfile` / `cmd` only.

import { store, cmd, editProfile } from './conn.js';
import { h, sec, field, selectField, toggle, nudgeField, badge, dot, toast, confirmBox, promptBox, stateKind, round, modal } from './dom.js';

const run = (p, okMsg) => p.then((r) => { if (okMsg) toast(okMsg, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state.profile;
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
      toggle('Virtual hands', ctx.rv.mode === 'hand', (on) => { ctx.rv.mode = on ? 'hand' : 'select'; ctx.rerender(); }, 'touch / click the walls'),
      nudgeField('Wandering hands', prof.simulation.wanderers, 1, (v) => editProfile((p) => { p.simulation.wanderers = Math.max(0, Math.min(30, Math.round(v))); }), { decimals: 0, unit: '/wall' })));
  }
  out.push(sec('Events', h('div', { class: 'feed', id: 'eventFeed' }, feedLines())));
  return out;
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
      field('Name', prof.name, (v) => editProfile((p) => { p.name = v; })),
      field('Notes', prof.notes, (v) => editProfile((p) => { p.notes = v; }))),
    sec('Video output',
      h('p', { class: 'muted' }, 'The canvas your content renders at. Each wall is a rectangle inside it.'),
      h('div', { class: 'grid2' },
        field('Width', prof.canvas.width, (v) => editProfile((p) => { p.canvas.width = v; }), { inline: true, step: 1 }),
        field('Height', prof.canvas.height, (v) => editProfile((p) => { p.canvas.height = v; }), { inline: true, step: 1 })),
      layoutPreview(prof, w?.id)),
    sec(['Walls', h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: addWall }, '+ Add wall')],
      h('div', { class: 'list' }, prof.walls.map((x) => h('div', { class: `item${w?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('wall', x.id) },
        h('div', { class: 't' }, `${x.id} · ${x.name}`, h('small', {}, `${x.width} × ${x.height} m · ${x.pixelRect.w}×${x.pixelRect.h} px @ ${x.pixelRect.x},${x.pixelRect.y}`)),
        !x.enabled ? badge('off') : null)))),
  ];
  if (w) out.push(...wallEditor(w, ctx));
  else out.push(sec(null, h('p', { class: 'muted' }, 'Select a wall in the list or on the view to edit it.')));
  return out;

  function addWall() {
    editProfile((p) => {
      const id = nextId(p.walls, 'W');
      p.walls.push({ id, name: `Wall ${p.walls.length + 1}`, width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 1920, h: 1080 } });
      setTimeout(() => ctx.select('wall', id));
    });
  }
}

function wallEditor(w, ctx) {
  const set = (fn) => editProfile((p) => fn(p.walls.find((x) => x.id === w.id)));
  const idx = P().walls.findIndex((x) => x.id === w.id);
  return [
    sec(`Wall ${w.id}`,
      field('Name', w.name, (v) => set((x) => { x.name = v; })),
      field('Width', w.width, (v) => set((x) => { x.width = v; }), { unit: 'm', step: 0.001 }),
      field('Height', w.height, (v) => set((x) => { x.height = v; }), { unit: 'm', step: 0.001 }),
      h('p', { class: 'muted' }, 'Height = the touch surface (usually the projected image height).'),
      field('Scan plane', w.planeOffset, (v) => set((x) => { x.planeOffset = v; }), { unit: 'm', step: 0.005 }),
      toggle('Enabled', w.enabled, (on) => set((x) => { x.enabled = on; }))),
    sec('Pixels in the output canvas',
      h('div', { class: 'grid4' },
        ...['x', 'y', 'w', 'h'].map((k) => field(k.toUpperCase(), w.pixelRect[k], (v) => set((x) => { x.pixelRect[k] = Math.round(v); }), { inline: true, step: 1 })))),
    sec(['Masks', h('span', { class: 'grow' }),
      h('button', { class: `btn small${ctx.rv.drawTarget === 'mask' ? ' attn' : ''}`, onclick: () => { ctx.startDraw('mask', w.id); } }, 'Draw mask')],
      h('p', { class: 'muted' }, 'Areas ignored on this wall (a door, a lamp crossing the scan plane…).'),
      w.masks.length ? w.masks.map((m) => h('div', { class: 'grid4', style: { marginBottom: '6px' } },
        ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, m[k], (v) => set((x) => { x.masks.find((q) => q.id === m.id)[k] = v; }), { inline: true, step: 0.01 })),
      )).concat(h('div', { class: 'actions' }, w.masks.map((m) => h('button', { class: 'btn small danger', onclick: () => set((x) => { x.masks = x.masks.filter((q) => q.id !== m.id); }) }, `Delete ${m.id}`))))
        : h('p', { class: 'muted' }, 'No masks.')),
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

function layoutPreview(prof, selId) {
  const cv = h('canvas', { style: { width: '100%', height: '120px', marginTop: '8px', background: '#0A0B0C', borderRadius: '3px' } });
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const k = Math.min((r.width - 16) / prof.canvas.width, (r.height - 16) / prof.canvas.height);
    const ox = (r.width - prof.canvas.width * k) / 2, oy = (r.height - prof.canvas.height * k) / 2;
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.strokeRect(ox + 0.5, oy + 0.5, prof.canvas.width * k, prof.canvas.height * k);
    g.font = '500 10px Geist, system-ui';
    for (const w of prof.walls) {
      const p = w.pixelRect;
      g.fillStyle = w.id === selId ? 'rgba(229,181,103,0.30)' : 'rgba(255,255,255,0.08)';
      g.fillRect(ox + p.x * k, oy + p.y * k, p.w * k, p.h * k);
      g.strokeStyle = w.id === selId ? '#E5B567' : 'rgba(255,255,255,0.35)';
      g.strokeRect(ox + p.x * k + 0.5, oy + p.y * k + 0.5, p.w * k, p.h * k);
      g.fillStyle = '#B8B8B8';
      g.fillText(w.id, ox + p.x * k + 4, oy + p.y * k + 12);
    }
  });
  return cv;
}

// ======================================================================= SENSORS

export function sensors(ctx) {
  const prof = P();
  const st = store.status?.sensors || {};
  const s = ctx.sel?.kind === 'sensor' ? prof.sensors.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec(['Sensors', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => addSensor('s2e') }, '+ S2E'),
      h('button', { class: 'btn small', onclick: () => addSensor('sim') }, '+ Simulated')],
      prof.sensors.length ? h('div', { class: 'list' }, prof.sensors.map((x) => {
        const t = st[x.id];
        return h('div', { class: `item${s?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('sensor', x.id) },
          dot(x.enabled ? stateKind(t?.state) : ''),
          h('div', { class: 't' }, `${x.id} · ${x.name}`, h('small', {}, `${x.driver === 'sim' ? 'simulated' : `${x.host}:${x.port}`} → ${x.wallId}`)),
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
    h('p', { class: 'muted' }, s.calibration ? 'Calibrated: the pose below is no longer used for tracking.' : 'Measured position of the sensor on the wall frame (origin: bottom-left corner, seen from inside the room). Rotate until the live floor line lies on y = 0.'),
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
    h('div', { class: 'row' }, h('span', { class: 'k' }, 'Status'), t?.learning ? badge(`learning ${t.learning.done}/${t.learning.frames}`, 'warn') : t?.background ? badge('captured', 'ok') : badge('none', 'warn')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small primary', disabled: !t, onclick: () => run(cmd('bg.capture', { sensorId: s.id }), 'Capturing background — keep the wall clear') }, 'Capture background'),
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

// ======================================================================= CALIBRATE

export function calibrate(ctx) {
  const c = store.status?.calib;
  if (c) return calibSession(c, ctx);
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
        h('button', { class: 'btn small', disabled: !running.length, onclick: () => run(cmd('bg.capture', { wallId: wall.id }), 'Capturing — keep the wall clear') }, 'Capture')),
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
      h('div', { class: 't' }, `${s.id} · ${s.name}`), s.calibration ? badge(`${s.calibration.rmsMm} mm RMS`, s.calibration.rmsMm < 10 ? 'ok' : 'warn') : badge('not calibrated'))))),
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
          h('button', { class: 'btn primary', disabled: !ok, onclick: () => run(cmd('calib.apply'), 'Calibration saved') }, 'Apply & save'),
          h('button', { class: 'btn', onclick: () => run(cmd('calib.back')) }, 'Back'),
          h('button', { class: 'btn danger', onclick: () => run(cmd('calib.cancel')) }, 'Discard'))),
    ];
  }
  const msg = c.phase === 'release' ? 'Captured — take your hand off the wall.'
    : c.phase === 'holding' ? 'Hold still…'
      : `Touch and hold the amber target on ${wall?.name || c.wallId} with an open hand.`;
  const ring = h('div', { class: 'ring', html: ringSvg(c.phase === 'release' ? 1 : c.progress, c.phase === 'release') });
  return [
    sec(null, h('div', { class: 'calib-big' },
      ring,
      h('div', { class: 'step tnum' }, `Target ${Math.min(c.index + 1, total)} / ${total}`),
      h('div', { class: 'msg' }, msg),
      h('div', { class: 'muted' }, `${c.wallId} · ${c.sensorIds.join(', ')}`))),
    sec(null, h('div', { class: 'actions', style: { justifyContent: 'center' } },
      h('button', { class: 'btn', disabled: c.index === 0, onclick: () => run(cmd('calib.back')) }, '← Back'),
      h('button', { class: 'btn', onclick: () => run(cmd('calib.skip')) }, 'Skip target'),
      h('button', { class: 'btn danger', onclick: () => run(cmd('calib.cancel')) }, 'Cancel'))),
  ];
}

export function ringSvg(p, done) {
  const r = 52, C = 2 * Math.PI * r;
  const col = done ? '#7FC4A2' : '#E5B567';
  return `<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#262626" stroke-width="8"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0, Math.min(1, p)))}" transform="rotate(-90 60 60)"/>
  <circle cx="60" cy="60" r="14" fill="none" stroke="${col}" stroke-width="2"/><path d="M60 38v12M60 70v12M38 60h12M70 60h12" stroke="${col}" stroke-width="2"/></svg>`;
}

// ======================================================================= ZONES

export function zones(ctx) {
  const prof = P();
  const z = ctx.sel?.kind === 'zone' ? prof.zones.find((x) => x.id === ctx.sel.id) : null;
  const out = [
    sec(['Zones', h('span', { class: 'grow' })],
      h('p', { class: 'muted' }, 'Drag on a wall in the view to draw a zone. Each zone sends enter / hold / exit events and a live count.'),
      prof.zones.length ? h('div', { class: 'list' }, prof.zones.map((x) => h('div', { class: `item${z?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('zone', x.id) },
        h('div', { class: 't' }, x.name, h('small', {}, `${x.id} · ${wallName(x.wallId)}`)),
        store.live?.zones?.[x.id]?.active ? badge(`active · ${store.live.zones[x.id].count}`, 'warn') : null,
        !x.enabled ? badge('off') : null))) : h('p', { class: 'muted' }, 'No zones yet.')),
  ];
  if (z) {
    const set = (fn) => editProfile((p) => fn(p.zones.find((x) => x.id === z.id)));
    out.push(sec(`Zone ${z.id}`,
      field('Name', z.name, (v) => set((x) => { x.name = v; })),
      selectField('Wall', z.wallId, prof.walls.map((w) => [w.id, `${w.id} · ${w.name}`]), (v) => set((x) => { x.wallId = v; })),
      h('div', { class: 'grid4' }, ...['x0', 'y0', 'x1', 'y1'].map((k) => field(k, z.rect[k], (v) => set((x) => { x.rect[k] = v; }), { inline: true, step: 0.01 }))),
      field('Hold after', z.holdMs, (v) => set((x) => { x.holdMs = Math.round(v); }), { unit: 'ms', step: 100 }),
      field('Release after', z.releaseMs, (v) => set((x) => { x.releaseMs = Math.round(v); }), { unit: 'ms', step: 50 }),
      toggle('Enabled', z.enabled, (on) => set((x) => { x.enabled = on; })),
      h('p', { class: 'muted' }, 'OSC: ', h('code', {}, `/vt/zone/${z.id}/enter|hold|exit`), ' ', h('code', {}, `/vt/zone/${z.id}/count`)),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => { editProfile((p) => { p.zones = p.zones.filter((x) => x.id !== z.id); }); ctx.select(null); } }, 'Delete zone'))));
  }
  return out;
}

// ======================================================================= OUTPUTS

export function outputs(ctx) {
  const prof = P();
  const stats = store.status?.outputs || {};
  const o = ctx.sel?.kind === 'output' ? prof.outputs.find((x) => x.id === ctx.sel.id) : null;
  const add = (type) => editProfile((p) => {
    const id = nextId(p.outputs, 'O');
    p.outputs.push({ id, name: type === 'tuio' ? 'TUIO' : 'OSC', type, host: '127.0.0.1', port: type === 'tuio' ? 3333 : 9000 });
    setTimeout(() => ctx.select('output', id));
  });
  const host = location.hostname || 'localhost';
  const out = [
    sec(['Destinations', h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => add('osc') }, '+ OSC'),
      h('button', { class: 'btn small', onclick: () => add('tuio') }, '+ TUIO')],
      prof.outputs.length ? h('div', { class: 'list' }, prof.outputs.map((x) => {
        const s = stats[x.id];
        return h('div', { class: `item${o?.id === x.id ? ' on' : ''}`, onclick: () => ctx.select('output', x.id) },
          dot(x.enabled ? (s?.errors ? 'bad' : 'ok') : ''),
          h('div', { class: 't' }, x.name, h('small', {}, `${x.type.toUpperCase()} → ${x.host}:${x.port} · ${x.coords === 'canvas' ? 'canvas' : 'wall'} UV · ${x.rateHz} Hz`)),
          badge(s ? `${s.sent} sent` : '—', s?.errors ? 'bad' : ''));
      })) : h('p', { class: 'muted' }, 'No destinations.')),
  ];
  if (o) {
    const set = (fn) => editProfile((p) => fn(p.outputs.find((x) => x.id === o.id)));
    const s = stats[o.id];
    out.push(sec(`${o.type.toUpperCase()} · ${o.id}`,
      field('Name', o.name, (v) => set((x) => { x.name = v; })),
      field('Host', o.host, (v) => set((x) => { x.host = v.trim(); })),
      field('Port', o.port, (v) => set((x) => { x.port = Math.round(v); }), { step: 1 }),
      selectField('Coordinates', o.coords, [['wall', 'Per wall (0–1 of each wall)'], ['canvas', 'Canvas (0–1 of the whole output)']], (v) => set((x) => { x.coords = v; })),
      field('Rate', o.rateHz, (v) => set((x) => { x.rateHz = Math.round(v); }), { unit: 'Hz', step: 1 }),
      o.type === 'osc' ? field('Address prefix', o.prefix, (v) => set((x) => { x.prefix = v; })) : toggle('One port per wall', o.tuioPortPerWall, (on) => set((x) => { x.tuioPortPerWall = on; }), on ? '' : `${o.port}, ${o.port + 1}…`),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Walls'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 } },
        prof.walls.map((w) => {
          const on = !o.walls.length || o.walls.includes(w.id);
          return h('button', { class: `ibtn${on ? ' on' : ''}`, onclick: () => set((x) => {
            const all = prof.walls.map((q) => q.id);
            let sel = x.walls.length ? x.walls.slice() : all.slice();
            sel = on ? sel.filter((q) => q !== w.id) : [...sel, w.id];
            x.walls = sel.length === all.length ? [] : sel;
          }) }, w.id);
        }))),
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
        h('button', { class: 'btn small', onclick: () => exportProfile(p.id) }, 'Export'),
        h('button', { class: 'btn small', onclick: () => duplicate(p) }, 'Duplicate'),
        p.id !== S.profile.id ? h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`Delete the room profile "${p.name}"? A backup is kept in the data folder.`, 'Delete', true)) run(cmd('profile.delete', { id: p.id })); } }, '✕') : null)))),
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

export function connectContent() {
  const S = store.state;
  const lan = S.lan || [];
  if (!lan.length) return h('p', { class: 'muted' }, 'No network interface found. Connect this computer to the room network.');
  const first = lan[0].url;
  return h('div', {},
    h('div', { class: 'qr' }, h('img', { src: `/api/qr.svg?t=${encodeURIComponent(first)}`, alt: 'QR code' })),
    h('p', { style: { textAlign: 'center' } }, 'Scan with the tablet camera. It must be on the same network (Wi-Fi of the room).'),
    lan.map((l) => h('p', {}, h('span', { class: 'muted' }, `${l.iface}: `), h('code', {}, l.url))),
    h('p', { class: 'muted' }, 'The link contains the access key of this installation — share it only with operators.'));
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
