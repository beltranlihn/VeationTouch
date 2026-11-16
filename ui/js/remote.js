// Calibration remote — what a phone or tablet opens in the room (main.js decides; the computer keeps the full app).
// At the top, the room live (walls, zones, hands) and the guide: ONE next thing to do, in order, until the room is
// ready — sensors running → background → projection → calibrate each wall → verify each wall (a failed one goes to
// Fit at its worst point) → walk test → lock. The operator stands at the wall with the phone in one hand:
//   Prepare   sensors running, background captured, projection open
//   Calibrate touch and hold the projected targets (a touch that disagrees with the others is asked again by itself)
//   Fit       put a hand on a projected point of the mesh; the cyan ring shows where the system sees it; Match (or
//             the arrows) moves that point until the ring sits under the hand
//   Verify    touch new points and read the real error; when it fails, "Fix" takes the worst point to Fit
//   Test      walk test: the projection shows what the outputs send under every hand; touch every wall, cross every
//             corner; "Fix here" takes the point under the hand to Fit
// Same engine commands and the same panels as the desktop (views.js), sized for a hand-held screen. Parts that
// change 30 times a second (progress ring, hand, mini map) are updated in place: buttons are never rebuilt under
// the finger.

import { store, on, connect, cmd, editProfile, undo, history, otherControl } from './conn.js';
import { h, sec, toast, confirmBox, switchUi } from './dom.js';
import * as V from './views.js';
import { gridFrom, gridSolveNode, gridNearestNode, wallUvToCanvas, mappingOutline, shapeOutline, planCloses } from '/shared/geometry.js';
import { canvasZoneOnWall } from './shapes.js';

const STEPS = [['prepare', 'Prepare'], ['calibrate', 'Calibrate'], ['fit', 'Fit'], ['verify', 'Verify'], ['test', 'Test']];
const MIN_WEIGHT = 0.25; // Fit: the hand must be this close to the point (bilinear weight) for Match to be meaningful
const run = (p, ok) => p.then((r) => { if (ok) toast(ok, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state.profile;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const rc = {
  remote: true,
  wall: (() => { try { return localStorage.getItem('vt-remote-wall'); } catch { return null; } })(),
  step: 'prepare',
  node: null,          // Fit: the mesh point being moved (index into mapping.points)
  follow: true,        // Fit: the selected point follows the hand on the wall
  nudgeStep: 5,        // Fit: pixels per arrow press
  samples: [],         // Fit: the last positions of the one hand on the wall (Match averages them)
  pendingFix: null,    // {wallId, x, y}: Fit opens on the mesh point nearest to this spot (a failed check point)
  walk: { walls: new Set(), corners: new Set() }, // Test: walls touched and corners crossed so far
  calibOpt: { cols: 3, rows: 3, top: 1.9, bottom: 0.45, holdMs: 700 },
  get calibWall() { return rc.wall; },
  set calibWall(v) { rc.wall = v; },
  select() {}, go() {}, // the shared panels may call them; the remote has no other views
  rerender: () => render(true),
  takeControl,
  setWall, setStep, matchNode, nudgeNode,
  nextTask: () => nextTask(), drawLive: () => drawLive(), fixAt: (w, pt) => fixAt(w, pt),
  fixWorst: (v, k) => { // a failed verification: close it and fit at its worst check point
    const w = P().walls.find((x) => x.id === v.wallId), t = v.targets[k];
    run(cmd('verify.cancel')).then(() => fixAt(w, t));
  },
};
window.__vt = rc; // debugging aid and UI tests

// ------------------------------------------------------------------ shell

document.getElementById('app')?.remove();
document.body.classList.add('remote-ui');
const el = {
  room: h('div', { class: 'r-room' }),
  chips: h('div', { class: 'chips' }),
  banner: h('div', { class: 'r-banner', hidden: true }),
  live: h('canvas', { class: 'r-live', 'aria-label': 'The room now: each wall, its zones and the hands on it — tap a wall to choose it' }),
  guide: h('div', { class: 'r-guide' }),
  walls: h('div', { class: 'r-walls' }),
  steps: h('nav', { class: 'r-steps' }),
  body: h('main', { class: 'r-body', id: 'rBody' }),
  foot: h('footer', { class: 'r-foot' }),
};
document.body.prepend(h('div', { class: 'remote', id: 'remote' },
  h('header', { class: 'r-top' },
    h('img', { src: 'brand/veation-marca-pequena.svg', alt: '' }),
    h('div', { class: 'r-title' }, h('b', {}, 'Calibration'), el.room),
    h('div', { class: 'grow' }), el.chips),
  el.banner, el.live, el.guide, el.walls, el.steps, el.body, el.foot));

function curWall() {
  const W = P().walls;
  if (!W.some((w) => w.id === rc.wall)) rc.wall = W[0]?.id ?? null;
  return W.find((w) => w.id === rc.wall) || null;
}

function setWall(id) {
  if (rc.wall === id) return;
  rc.wall = id; rc.node = null; rc.samples = [];
  try { localStorage.setItem('vt-remote-wall', id); } catch { /* storage blocked */ }
  render(true);
}

function setStep(step) {
  if (rc.step === step) return;
  rc.step = step; rc.node = null; rc.samples = [];
  if (step === 'test') rc.walk = { walls: new Set(), corners: new Set() };
  render(true);
  el.body.scrollTop = 0;
}

/** A running calibration or verification takes the remote to its wall and step. */
let sessionSeen = '';
function followSession() {
  const c = store.status?.calib, v = store.status?.verify;
  const key = c ? `c:${c.wallId}` : v ? `v:${v.wallId}` : '';
  if (key === sessionSeen) return;
  sessionSeen = key;
  if (c) { rc.wall = c.wallId; rc.step = 'calibrate'; } else if (v) { rc.wall = v.wallId; rc.step = 'verify'; }
}

const wallDone = (w) => { const r = V.wallReadiness(w); return r.sensors.length > 0 && r.calibrated.length === r.sensors.length; };
const prepared = (w) => {
  const r = V.wallReadiness(w);
  return r.sensors.length > 0 && r.running.length === r.sensors.length && r.withBg.length === r.sensors.length && (store.status?.projections ?? 0) > 0;
};

// ------------------------------------------------------------------ render (only when something structural changed)

function sessionKey() {
  const c = store.status?.calib, v = store.status?.verify, s = c || v;
  if (!s) return '';
  return JSON.stringify([c ? 'c' : 'v', s.wallId, s.phase, s.index, s.redoing ?? null, s.worst ?? null,
    s.targets.map((t) => [t.captured?.length ?? 0, t.skipped ? 1 : 0, t.errMm ?? null]), s.summary ?? null, c?.result ? Object.keys(c.result) : null]);
}

function bodyKey(w) {
  if (!w) return 'none';
  const st = store.status?.sensors || {};
  const sensors = V.wallReadiness(w).sensors.map((s) => [s.id, st[s.id]?.state ?? null, !!st[s.id]?.background, s.calibration?.rmsMm ?? null]);
  const pr = store.state.projection;
  const common = [rc.step, w.id, otherControl()?.id ?? '', !!store.state.locked, sessionKey(), sensors];
  const step = {
    prepare: () => [store.status?.projections ?? 0, store.state.displays?.length ?? 0, pr.displayId, pr.open],
    calibrate: () => [rc.calibOpt.cols, rc.calibOpt.rows],
    fit: () => [w.mapping.mode, w.mapping.points?.length ?? 0, (store.status?.projections ?? 0) > 0, rc.nudgeStep],
    verify: () => [w.verified ? [w.verified.at, w.verified.pass] : null],
    test: () => [P().walls.map((x) => [x.id, x.joinNext, V.wallReadiness(x).sensors.length]), walkDone()],
  }[rc.step]();
  return JSON.stringify([...common, ...step]);
}

let lastBody = '', lastChrome = '', pending = false;
function render(force = false) {
  if (!store.state) return;
  followSession();
  const w = curWall();
  renderChrome(w, force);
  const key = bodyKey(w);
  if (!force && key === lastBody) { live(); return; }
  const a = document.activeElement;
  if (a && el.body.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { pending = true; return; }
  pending = false;
  lastBody = key;
  const top = el.body.scrollTop;
  el.body.replaceChildren(...(w ? body(w) : [sec(null, h('p', { class: 'muted' }, 'This room has no walls yet — set it up on the computer.'))]).flat().filter(Boolean));
  el.body.scrollTop = top;
  applyPendingFix();
  live();
}
el.body.addEventListener('focusout', () => setTimeout(() => { if (pending) render(true); }, 0));

function renderChrome(w, force) {
  renderGuide();
  const session = store.status?.calib || store.status?.verify;
  const ctl = otherControl();
  const key = JSON.stringify([P().name, P().walls.map((x) => [x.id, x.name, wallDone(x)]), w?.id, rc.step, w && prepared(w), session?.wallId ?? null,
    store.state.projection.mode, ctl?.id ?? '', ctl?.device ?? '', !!store.state.locked, !!store.status?.calib]);
  if (!force && key === lastChrome) return;
  lastChrome = key;
  el.room.textContent = P().name;
  // whoever drives the session: this phone follows it until it takes control
  el.banner.hidden = !ctl && !store.state.locked;
  if (ctl) {
    el.banner.replaceChildren(h('span', {}, h('b', {}, `${store.status?.calib ? 'Calibration' : 'Verification'} on ${ctl.device}`), ' — this phone only follows it.'),
      h('button', { class: 'btn small attn', onclick: takeControl }, 'Take control'));
  } else if (store.state.locked) {
    el.banner.replaceChildren(h('span', {}, h('b', {}, 'Show mode'), ' — the room is locked. Unlock it on the computer to calibrate.'));
  }
  el.walls.replaceChildren(...P().walls.map((x) => h('button', {
    class: x.id === w?.id ? 'on' : '', title: x.name, disabled: !!session && x.id !== session.wallId, onclick: () => setWall(x.id),
  }, x.id, h('span', { class: `m${wallDone(x) ? ' ok' : ''}` }, wallDone(x) ? 'calibrated' : '—'))));
  const done = { prepare: w && prepared(w), calibrate: w && wallDone(w), verify: !!w?.verified?.pass, test: walkDone() };
  el.steps.replaceChildren(...STEPS.map(([id, t], k) => h('button', {
    class: `${rc.step === id ? 'on' : ''}${done[id] ? ' done' : ''}`, disabled: !!session && id !== rc.step, onclick: () => setStep(id),
  }, h('span', { class: 'n' }, done[id] ? '✓' : String(k + 1)), t)));
  const mode = store.state.projection.mode;
  el.foot.replaceChildren(
    h('span', { class: 'lbl' }, 'Projection'),
    h('div', { class: 'seg' }, [['off', 'Off'], ['identify', 'Pattern'], ['debug', 'Debug']].map(([m, t]) =>
      h('button', { class: mode === m ? 'on' : '', onclick: () => run(cmd('projection.set', { mode: m })) }, t))),
    h('div', { class: 'grow' }),
    h('button', { class: 'btn small', title: 'The whole app on this device (Room, Mapping, Zones, Outputs…)', onclick: () => switchUi('full') }, 'Full app'));
}

let chipsKey = '';
function renderChips() {
  const st = store.status?.sensors || {};
  const en = P().sensors.filter((s) => s.enabled);
  const ok = en.filter((s) => st[s.id]?.state === 'scanning').length;
  const bad = en.some((s) => ['offline', 'error'].includes(st[s.id]?.state));
  const n = store.live?.roomCount ?? 0;
  const sim = en.some((s) => s.driver === 'sim');
  const key = `${ok}/${en.length}|${bad}|${n}|${sim}`;
  if (key === chipsKey) return;
  chipsKey = key;
  el.chips.replaceChildren(...[ // replaceChildren would print a null as text
    sim ? h('span', { class: 'chip sim', title: 'Simulated sensors and hands — not the real room' }, 'Simulated') : null,
    h('span', { class: 'chip', title: 'Sensors scanning' }, h('span', { class: `dot ${bad ? 'bad' : ok === en.length && en.length ? 'ok' : 'warn'}` }), h('span', { class: 'n tnum' }, `${ok}/${en.length}`), 'sensors'),
    h('span', { class: 'chip', title: 'Touches now' }, h('span', { class: `dot ${n ? 'live' : ''}` }), h('span', { class: 'n tnum' }, String(n))),
  ].filter(Boolean));
}

/** What changes 30 times a second: chips, the session's progress ring, the Fit step's hand and buttons. */
function live() {
  renderChips();
  drawLive();
  updateWalk();
  sendWalk();
  const s = store.status?.calib || store.status?.verify;
  const ring = el.body.querySelector('.calib-big .ring');
  if (s && ring && s.phase !== 'done') ring.innerHTML = V.ringSvg(s.phase === 'release' ? 1 : s.progress, s.phase === 'release');
  sendFit();
  updateFit();
}

function body(w) {
  const c = store.status?.calib, v = store.status?.verify;
  const other = otherControl();
  const follow = (list) => { // another device drives the session: follow it, its buttons are not ours
    if (other) for (const s of list) s.querySelectorAll?.('.actions .btn, .linkish').forEach((b) => { b.disabled = true; });
    return list;
  };
  if (rc.step === 'calibrate') return c ? follow(V.calibSession(c, rc)) : calibrateBody(w);
  if (rc.step === 'verify') return v ? follow(V.verifySession(v, other ? null : rc)) : verifyBody(w);
  if (rc.step === 'fit') return fitBody(w);
  if (rc.step === 'test') return testBody();
  return prepareBody(w);
}

function prepareBody(w) {
  return [
    V.calibChecklist(w),
    sec(null,
      h('p', { class: 'muted' }, 'Keep the wall clear while the background is captured. The projection must be open on the projector: the targets and the fit points are drawn there.'),
      h('button', { class: `btn block big${prepared(w) ? ' primary' : ''}`, onclick: () => setStep('calibrate') }, 'Next: calibrate')),
  ];
}

function calibrateBody(w) {
  const r = V.wallReadiness(w);
  const done = r.sensors.length > 0 && r.calibrated.length === r.sensors.length;
  return [
    done ? sec(null, h('div', { class: 'callout ok' }, `${w.id} is calibrated (${r.calibrated.map((s) => `${s.id}: ${s.calibration.rmsMm} mm`).join(', ')}). Calibrate again only if a sensor moved — or go on to Fit.`),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => setStep('fit') }, 'Next: fit'))) : null,
    V.calibStart(rc, w),
    V.calibTargets(rc),
  ];
}

// ------------------------------------------------------------------ Fit

/** About one point every 1.5 m across and 1.2 m up — enough to follow a wavy wall or a projector's bend. */
function meshSize(w) {
  return [clamp(Math.round(w.width / 1.5) + 1, 3, 9), clamp(Math.round(w.height / 1.2) + 1, 3, 6)];
}

function makeMesh(w) {
  const [nx, ny] = meshSize(w);
  editProfile((p) => {
    const q = p.walls.find((x) => x.id === w.id);
    const prev = { ...q };
    q.mapping = { mode: 'grid', ...gridFrom((u, v) => wallUvToCanvas(prev, u, v), nx, ny) }; // same picture: nothing jumps
  }, 'fit mesh');
}

/** Tell the projection which point to highlight (it draws the mesh of that wall while the Fit step is open). */
let fitSent = 'none';
function sendFit() {
  const w = store.state && curWall();
  const want = w && rc.step === 'fit' && w.mapping.mode === 'grid' && !document.hidden ? { wallId: w.id, node: rc.node } : null;
  const key = JSON.stringify(want);
  if (key === fitSent || !store.connected) return;
  fitSent = key;
  cmd('projection.set', { fit: want }).catch(() => { fitSent = 'none'; });
}
document.addEventListener('visibilitychange', sendFit);

const fitEl = {}; // the Fit step's live parts
function fitBody(w) {
  const m = w.mapping;
  const out = [];
  if (!((store.status?.projections ?? 0) > 0)) out.push(sec(null, h('div', { class: 'callout attn' }, 'The points and the ring are drawn by the projection: open it on the projector first (Prepare).')));
  if (m.mode !== 'grid') {
    const [nx, ny] = meshSize(w);
    out.push(sec(`Fit ${w.id}`,
      h('p', {}, 'Fit corrects where touches land, point by point, until the ring drawn on the wall sits under your hand. It works on a mesh of points over the wall.'),
      h('p', { class: 'muted' }, `${w.id} uses ${m.mode === 'corners' ? 'a corner pin' : 'a rectangle'} now. The mesh starts with exactly the same picture — nothing moves until you adjust a point.`),
      h('button', { class: 'btn primary block big', onclick: () => makeMesh(w) }, `Make a ${nx} × ${ny} mesh`)));
    return out;
  }
  fitEl.map = h('canvas', { class: 'r-map', 'aria-label': 'The mesh of the wall: tap a point to choose it' });
  fitEl.map.addEventListener('pointerdown', pickNode);
  fitEl.status = h('div', { class: 'r-fit-status' });
  fitEl.node = h('div', { class: 'r-node tnum' });
  fitEl.match = h('button', { class: 'btn primary block big', onclick: () => matchNode() }, 'Match the point to my hand');
  fitEl.follow = h('button', { class: 'btn small', onclick: () => { rc.follow = !rc.follow; updateFit(); } }, 'Follow my hand');
  fitEl.undo = h('button', { class: 'btn small', onclick: () => undo() }, 'Undo');
  const pad = (dx, dy, t, label) => h('button', { 'aria-label': label, onclick: () => nudgeNode(dx, dy) }, t);
  out.push(sec(`Fit ${w.id}`,
    fitEl.map, fitEl.status, fitEl.match,
    h('div', { class: 'r-pad' },
      fitEl.node,
      // the centre of the pad is the step: 1 → 5 → 20 px per press
      h('div', { class: 'dpad' }, h('span'), pad(0, -1, '↑', 'Move the point up'), h('span'), pad(-1, 0, '←', 'Move the point left'),
        h('button', { class: 'mid tnum', title: 'Pixels per press — tap to change', onclick: () => { rc.nudgeStep = { 1: 5, 5: 20, 20: 1 }[rc.nudgeStep] || 5; render(true); } }, `${rc.nudgeStep} px`),
        pad(1, 0, '→', 'Move the point right'), h('span'), pad(0, 1, '↓', 'Move the point down'), h('span'))),
    h('div', { class: 'actions', style: { justifyContent: 'center' } }, fitEl.follow, fitEl.undo),
    !w.verified?.pass ? h('button', { class: 'btn block', style: { marginTop: 'var(--sp-12)' }, onclick: () => setStep('verify') }, `Done here — verify ${w.id} again`) : null),
  sec('How it works', h('ol', { class: 'r-how' },
    h('li', {}, 'Put one open hand on an amber point on the wall.'),
    h('li', {}, 'The cyan ring is where the system sees your hand.'),
    h('li', {}, 'Tap Match — or move the point with the arrows — until the ring sits under your hand.'),
    h('li', {}, 'Repeat on every point that is off. Undo goes back one step.'))));
  return out;
}

/** The one touch on the wall ([id, x, y, size, coasting]), 'many', or null. */
function handOnWall(w) {
  const list = store.live?.walls?.[w.id] || [];
  return list.length === 1 ? list[0] : list.length ? 'many' : null;
}

const nodeUv = (m, k) => [m.us[k % m.us.length], m.vs[Math.floor(k / m.us.length)]];
const nodeDist = (w, k, u, v) => { const [a, b] = nodeUv(w.mapping, k); return Math.hypot((a - u) * w.width, (b - v) * w.height); };

/** Each live frame: remember where the hand is; with "Follow my hand", select the point under it. */
function onLive() {
  if (store.state && rc.step === 'test') noteWalk();
  const w = store.state && curWall();
  if (!w || rc.step !== 'fit' || w.mapping.mode !== 'grid') return;
  const t = handOnWall(w);
  if (!t || t === 'many') { rc.samples = []; return; }
  const [id, x, y] = t;
  if (rc.samples.length && rc.samples[0].id !== id) rc.samples = [];
  rc.samples.push({ id, x, y });
  if (rc.samples.length > 8) rc.samples.shift();
  if (rc.follow) {
    const u = x / w.width, v = 1 - y / w.height;
    const k = gridNearestNode(w.mapping, u, v, w.width, w.height);
    // hysteresis: a hand halfway between two points must not make the selection flicker
    if (k !== rc.node && (rc.node == null || nodeDist(w, k, u, v) < 0.8 * nodeDist(w, rc.node, u, v))) rc.node = k;
  }
}

function updateFit() {
  const w = store.state && curWall();
  if (!fitEl.status?.isConnected || !w || w.mapping.mode !== 'grid') return;
  const m = w.mapping, k = rc.node, t = handOnWall(w);
  fitEl.node.textContent = k == null || !m.points[k] ? 'No point chosen' : `Point ${k + 1} of ${m.points.length} · ${Math.round(m.points[k][0])}, ${Math.round(m.points[k][1])} px`;
  let msg, ok = false;
  if (!t) msg = 'Put one hand on an amber point on the wall.';
  else if (t === 'many') msg = 'One hand only — there are several touches on this wall.';
  else if (k == null) msg = 'Choose a point: tap it above, or turn on Follow my hand.';
  else {
    const [, x, y] = t;
    ok = !!gridSolveNode(m, k, x / w.width, 1 - y / w.height, m.points[k], MIN_WEIGHT);
    msg = ok ? `Hand at ${x.toFixed(2)}, ${y.toFixed(2)} m · on point ${k + 1}` : `Your hand is far from point ${k + 1} — put it on the point.`;
  }
  fitEl.status.textContent = msg;
  fitEl.match.disabled = !ok;
  fitEl.follow.classList.toggle('on', rc.follow);
  fitEl.undo.disabled = !history.undoLabel();
}

/** Pixels per metre of the wall's mapping around (u, v). */
function localScale(w, u, v) {
  const [ax, ay] = wallUvToCanvas(w, u, v), [bx, by] = wallUvToCanvas(w, u + 0.1 / w.width, v);
  return Math.hypot(bx - ax, by - ay) * 10;
}

/**
 * Match: the hand is on the projected point k, so the content pixel under it is that point's pixel. Move point k
 * so that the hand's wall position maps to exactly that pixel — the ring jumps under the hand (the dot moves on).
 */
function matchNode() {
  const w = curWall(), m = w?.mapping, k = rc.node;
  if (!m || m.mode !== 'grid' || k == null || !rc.samples.length) return;
  const x = mean(rc.samples.map((s) => s.x)), y = mean(rc.samples.map((s) => s.y));
  const u = x / w.width, v = 1 - y / w.height;
  const target = m.points[k];
  const np = gridSolveNode(m, k, u, v, target, MIN_WEIGHT);
  if (!np) { toast(`Your hand is far from point ${k + 1} — put it on the point.`, 'bad'); return; }
  const moved = Math.hypot(np[0] - target[0], np[1] - target[1]);
  if (moved > localScale(w, u, v) * 0.6) {
    toast(`That would move point ${k + 1} by more than 60 cm: check that your hand is on point ${k + 1}, or calibrate ${w.id} again.`, 'bad');
    return;
  }
  editProfile((p) => { p.walls.find((q) => q.id === w.id).mapping.points[k] = [r1(np[0]), r1(np[1])]; }, `fit point ${k + 1}`)
    .then(() => toast(`Point ${k + 1} moved ${Math.round(moved)} px — the ring should now sit under your hand.`, 'ok'));
}

function nudgeNode(dx, dy) {
  const w = curWall(), k = rc.node;
  if (!w || w.mapping.mode !== 'grid' || k == null) { toast('Choose a point first: put your hand on it, or tap it on the mesh.', 'bad'); return; }
  const s = rc.nudgeStep;
  editProfile((p) => {
    const q = p.walls.find((x) => x.id === w.id).mapping;
    q.points[k] = [r1(q.points[k][0] + dx * s), r1(q.points[k][1] + dy * s)];
  }, `move point ${k + 1}`);
}

/** The mini map: the wall's mesh in content pixels, the chosen point, and the hand where the system sees it. */
let mapTf = null;
function drawMap() {
  requestAnimationFrame(drawMap);
  const cv = fitEl.map;
  if (!cv?.isConnected || !store.state) return;
  const w = curWall();
  if (!w || w.mapping.mode !== 'grid') return;
  const m = w.mapping, nx = m.us.length;
  const out = mappingOutline(m, w.pixelRect, 12);
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const dpr = devicePixelRatio || 1, cw = cv.clientWidth || 300, pad = 22;
  const k = Math.min((cw - pad * 2) / (b.x1 - b.x0), (cw * 0.7 - pad * 2) / (b.y1 - b.y0));
  const ch = Math.round((b.y1 - b.y0) * k + pad * 2);
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = `${ch}px`; }
  const ox = (cw - (b.x1 - b.x0) * k) / 2;
  const X = (x) => ox + (x - b.x0) * k, Y = (y) => pad + (y - b.y0) * k;
  mapTf = { X, Y };
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.beginPath(); out.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath();
  g.fillStyle = '#161616'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = 'rgba(229,181,103,0.45)';
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); };
  for (let j = 0; j < m.vs.length; j++) line(m.points.slice(j * nx, j * nx + nx));
  for (let i = 0; i < nx; i++) line(m.vs.map((_, j) => m.points[j * nx + i]));
  m.points.forEach(([x, y], q) => {
    const on = q === rc.node;
    g.fillStyle = on ? '#E5B567' : 'rgba(229,181,103,0.8)';
    g.beginPath(); g.arc(X(x), Y(y), on ? 6 : 4, 0, Math.PI * 2); g.fill();
    if (on) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X(x), Y(y), 12, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
  });
  if (rc.node != null && m.points[rc.node]) {
    const [x, y] = m.points[rc.node];
    g.fillStyle = '#E0E0E0'; g.font = '600 11px Geist, system-ui'; g.textBaseline = 'bottom'; g.textAlign = 'center';
    g.fillText(String(rc.node + 1), X(x), Y(y) - 14);
    g.textAlign = 'left';
  }
  for (const [, x, y] of store.live?.walls?.[w.id] || []) {
    const [px, py] = wallUvToCanvas(w, x / w.width, 1 - y / w.height);
    g.strokeStyle = '#4FC3E8'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(X(px), Y(py), 9, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
  }
}
requestAnimationFrame(drawMap);

/** Tap a point on the mini map to choose it (Follow my hand turns off: the choice is yours). */
function pickNode(e) {
  const w = curWall();
  if (!mapTf || !w || w.mapping.mode !== 'grid') return;
  const r = fitEl.map.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  let best = -1, bd = 40;
  w.mapping.points.forEach(([x, y], q) => { const d = Math.hypot(mapTf.X(x) - px, mapTf.Y(y) - py); if (d < bd) { bd = d; best = q; } });
  if (best < 0) return;
  rc.node = best; rc.follow = false;
  sendFit(); updateFit();
}

// ------------------------------------------------------------------ Verify → Fit

function verifyBody(w) {
  const vf = w.verified;
  return [
    vf ? sec(null, h('div', { class: `callout ${vf.pass ? 'ok' : 'attn'}` }, `Last verification of ${w.id}: mean ${vf.meanMm} mm · worst ${vf.maxMm} mm. `,
      vf.pass ? 'Good for hands.' : 'Larger than a hand radius somewhere: fix it there with your hand, then verify again.'),
    !vf.pass ? h('button', { class: 'btn primary block big', onclick: () => fixAt(w, vf.worst) }, 'Fix it with your hand') : null) : null,
    V.calibCurrent(rc, w),
  ];
}

/** Open Fit on wall w with the mesh point nearest to pt (wall metres) chosen — once the wall has a mesh. */
function fixAt(w, pt) {
  if (!w) return;
  rc.pendingFix = pt && Number.isFinite(pt.x) ? { wallId: w.id, x: pt.x, y: pt.y } : null;
  setWall(w.id);
  setStep('fit');
  applyPendingFix();
}

function applyPendingFix() {
  const f = rc.pendingFix, w = store.state && curWall();
  if (!f || !w || w.id !== f.wallId || rc.step !== 'fit' || w.mapping.mode !== 'grid') return;
  rc.node = gridNearestNode(w.mapping, f.x / w.width, 1 - f.y / w.height, w.width, w.height);
  rc.pendingFix = null;
  sendFit(); updateFit();
}

// ------------------------------------------------------------------ guide: one next thing to do

const walkKey = () => `vt-walk:${P().id}`;
/** The walk test passed after the last verification of every wall (a new verification asks for it again). */
function walkDone() {
  let at = null;
  try { at = localStorage.getItem(walkKey()); } catch { /* storage blocked */ }
  return !!at && P().walls.every((w) => !w.verified || w.verified.at <= at);
}

/** What to do next to get the room ready — one thing at a time, in order. */
function nextTask() {
  const S = store.state, st = store.status?.sensors || {};
  const walls = P().walls, first = walls[0]?.id;
  const t = (() => {
    if (!walls.length) return { text: 'This room has no walls yet — set it up on the computer.' };
    const en = P().sensors.filter((s) => s.enabled);
    if (!en.length) return { text: 'No sensors yet: on the computer, Sensors › Sensor network… finds them and puts each one on its wall.' };
    const down = en.filter((s) => st[s.id]?.state !== 'scanning');
    if (down.length) return { text: `${down.map((s) => s.id).join(', ')} not running — check cable and power (Sensors on the computer says why).`, warn: true };
    if (en.some((s) => !st[s.id]?.background)) return { text: 'Room empty? Capture the background of every sensor.', label: 'Capture background', act: () => V.captureBackground({}, 'all sensors') };
    if (!((store.status?.projections ?? 0) > 0)) return { text: 'Open the projection on the projector.', label: 'Prepare', go: [rc.wall || first, 'prepare'] };
    const covered = walls.filter((w) => V.wallReadiness(w).sensors.length);
    const uncal = covered.find((w) => !wallDone(w));
    if (uncal) return { text: `Calibrate ${uncal.id}: touch and hold each amber target with an open hand.`, label: `Calibrate ${uncal.id}`, go: [uncal.id, 'calibrate'] };
    const unver = covered.find((w) => !w.verified);
    if (unver) return { text: `Verify ${unver.id}: 5 check points measure the real error.`, label: `Verify ${unver.id}`, go: [unver.id, 'verify'] };
    const bad = covered.find((w) => !w.verified.pass);
    if (bad) return { text: `${bad.id} is ${bad.verified.maxMm} mm off at one point: fix it there with your hand, then verify again.`, label: `Fix ${bad.id}`, act: () => fixAt(bad, bad.verified.worst), warn: true };
    if (!walkDone()) return { text: 'Walk test: touch every wall and slide a hand across every corner.', label: 'Walk test', go: [rc.wall || first, 'test'] };
    if (!S.locked) return { text: 'The room is ready. Lock it for the show.', label: 'Lock (Show)', act: () => run(cmd('app.lock', { locked: true }), 'Room locked — Show mode'), ok: true };
    return { text: 'The room is ready and locked.', ok: true, done: true };
  })();
  // locked: nothing can be changed — say so instead of sending the operator to a step that refuses
  if (S.locked && !t.done) return { text: `Show mode: the room is locked. Unlock it on the computer to go on (next: ${t.text.replace(/[.:].*$/, '').toLowerCase()}).`, warn: true };
  return t;
}

let guideKey = '';
function renderGuide() {
  const t = nextTask();
  const key = JSON.stringify([t.text, t.label, t.ok, t.warn]);
  if (key === guideKey) return;
  guideKey = key;
  el.guide.className = `r-guide${t.ok ? ' ok' : t.warn ? ' warn' : ''}`;
  el.guide.replaceChildren(
    h('div', { class: 'g-text' }, h('span', { class: 'lbl' }, t.done ? 'Ready' : 'Next'), h('span', { class: 'what' }, t.text)),
    t.label ? h('button', { class: `btn small${t.ok ? '' : ' primary'}`, onclick: () => { if (t.go) { setWall(t.go[0]); setStep(t.go[1]); } else t.act?.(); } }, t.label) : null);
}

// ------------------------------------------------------------------ the room, live (top strip)

let liveHit = [];
/** Every wall side by side at the same scale, its zones (amber, filled while active) and the hands (cyan). */
function drawLive() {
  const cv = el.live;
  if (!store.state || !cv.isConnected) return;
  const W = P().walls;
  cv.hidden = !W.length;
  if (!W.length) return;
  const dpr = devicePixelRatio || 1, cw = cv.clientWidth || 340, gap = 4, pad = 2, lab = 13;
  const sumW = W.reduce((a, w) => a + w.width, 0), maxH = Math.max(...W.map((w) => w.height));
  const k = (cw - pad * 2 - gap * (W.length - 1)) / sumW;
  const ch = Math.round(maxH * k + lab + pad * 2);
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = `${ch}px`; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const base = pad + lab + maxH * k; // the floor
  let x0 = pad;
  liveHit = [];
  for (const w of W) {
    const ww = w.width * k, top = base - w.height * k, on = w.id === rc.wall;
    const X = (x) => x0 + x * k, Y = (y) => base - y * k;
    g.fillStyle = '#161616'; g.fillRect(x0, top, ww, w.height * k);
    for (const z of P().zones) {
      const pts = z.space === 'canvas' ? (z.walls?.includes(w.id) ? canvasZoneOnWall(z, w) : null) : z.wallId === w.id ? shapeOutline(z, 24) : null;
      if (!pts?.length) continue;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath();
      if (store.live?.zones?.[z.id]?.active) { g.fillStyle = 'rgba(229,181,103,0.35)'; g.fill(); }
      g.strokeStyle = 'rgba(229,181,103,0.8)'; g.lineWidth = 1; g.stroke();
    }
    g.strokeStyle = on ? '#E0E0E0' : 'rgba(255,255,255,0.22)'; g.lineWidth = on ? 1.5 : 1;
    g.strokeRect(x0 + 0.5, top + 0.5, ww - 1, w.height * k - 1);
    for (const [, x, y, , coast] of store.live?.walls?.[w.id] || []) {
      g.fillStyle = coast ? 'rgba(79,195,232,0.45)' : '#4FC3E8';
      g.beginPath(); g.arc(X(x), Y(y), 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = on ? '#E0E0E0' : '#8C8C8C'; g.font = '600 10px Geist, system-ui'; g.textBaseline = 'alphabetic';
    g.fillText(w.id, x0 + 1, pad + 10);
    liveHit.push([x0, x0 + ww, w.id]);
    x0 += ww + gap;
  }
}
el.live.addEventListener('pointerdown', (e) => {
  if (store.status?.calib || store.status?.verify) return; // a session keeps the remote on its wall
  const x = e.clientX - el.live.getBoundingClientRect().left;
  const hit = liveHit.find(([a, b]) => x >= a - 2 && x <= b + 2);
  if (hit) setWall(hit[2]);
});

// ------------------------------------------------------------------ Test (walk test)

/** Joined corners [[left, right]] — the same rule as the engine (corners.js): wall i meets i+1, the last the first. */
function cornersOf(W) {
  const closes = planCloses(W), out = [];
  W.forEach((w, i) => {
    if (w.joinNext === false) return;
    const n = i + 1 < W.length ? W[i + 1] : closes ? W[0] : null;
    if (n && n.id !== w.id) out.push([w.id, n.id]);
  });
  return out;
}
const cornerKey = (a, b) => [a, b].sort().join('|');
const testWalls = () => P().walls.filter((w) => V.wallReadiness(w).sensors.length);
const testCorners = () => { const ids = new Set(testWalls().map((w) => w.id)); return cornersOf(P().walls).filter(([a, b]) => ids.has(a) && ids.has(b)); };

function noteWalk() {
  for (const [id, list] of Object.entries(store.live?.walls || {})) if (list.length) rc.walk.walls.add(id);
  for (const e of store.live?.events || []) if (e.type === 'cross' && e.from) rc.walk.corners.add(cornerKey(e.from, e.wallId));
}

/** The wall with the only hand in the room (Fix here needs one hand, held still), or null. */
function oneHandWall() {
  const on = Object.entries(store.live?.walls || {}).filter(([, l]) => l.length);
  return on.length === 1 && on[0][1].length === 1 ? on[0][0] : null;
}

const walkEl = {};
function testBody() {
  walkEl.key = null;
  walkEl.list = h('div', { class: 'checklist' });
  walkEl.fix = h('button', { class: 'btn block big', onclick: () => { const id = oneHandWall(); if (!id) return; setWall(id); setStep('fit'); } }, 'Fix here');
  walkEl.finish = h('button', { class: 'btn primary block big', onclick: () => {
    try { localStorage.setItem(walkKey(), new Date().toISOString()); } catch { /* storage blocked */ }
    toast('Walk test passed', 'ok');
    render(true);
  } }, 'The room passes the walk test');
  return [sec('Walk test',
    h('p', {}, 'The projection shows what the outputs send: a white disc under each hand, and the zones. Walk the room: touch every wall — high, low, near the edges — and slide a hand across every corner.'),
    walkEl.list,
    h('p', { class: 'muted' }, 'Where the disc is not under your hand: keep the hand there, alone on the wall, and tap Fix here.'),
    walkEl.fix, h('div', { style: { height: 'var(--sp-8)' } }), walkEl.finish),
  walkDone() ? sec(null, h('div', { class: 'callout ok' }, 'This room passed the walk test after its last verification.')) : null];
}

function updateWalk() {
  if (!walkEl.list?.isConnected) return;
  const W = testWalls(), C = testCorners();
  const key = JSON.stringify([[...rc.walk.walls].sort(), [...rc.walk.corners].sort(), W.map((w) => w.id)]);
  if (walkEl.key !== key) {
    walkEl.key = key;
    const row = (ok, text) => h('div', { class: `check${ok ? ' done' : ''}` }, h('span', { class: 'mark' }, ok ? '✓' : ''), h('span', { class: 't' }, text));
    walkEl.list.replaceChildren(...W.map((w) => row(rc.walk.walls.has(w.id), `Touched ${w.id}`)),
      ...C.map(([a, b]) => row(rc.walk.corners.has(cornerKey(a, b)), `Crossed the corner ${a} → ${b}`)));
  }
  const one = oneHandWall();
  walkEl.fix.disabled = !one;
  walkEl.fix.textContent = one ? `Fix here (${one})` : 'Fix here — one hand on the wall';
  walkEl.finish.disabled = !(W.length && W.every((w) => rc.walk.walls.has(w.id)) && C.every(([a, b]) => rc.walk.corners.has(cornerKey(a, b))));
}

/** While Test is open, the projection shows the walk-test view (what the outputs send) on every wall. */
let walkSent = 'none';
function sendWalk() {
  const want = !!store.state && rc.step === 'test' && !document.hidden;
  if (String(want) === walkSent || !store.connected) return;
  walkSent = String(want);
  cmd('projection.set', { walk: want }).catch(() => { walkSent = 'none'; });
}
document.addEventListener('visibilitychange', sendWalk);

// ------------------------------------------------------------------ control, connection

async function takeControl() {
  const c = otherControl();
  if (c && !await confirmBox(`Take control from ${c.device}? The session continues on this phone and ${c.device} becomes view-only.`, 'Take control')) return;
  run(cmd('control.take'), 'You have control of the session');
}

on('state', () => render());
on('status', () => render());
on('calib', () => render());
on('live', () => { onLive(); live(); });
on('history', () => updateFit());
on('error', (e) => toast(e.message, 'bad'));
on('connection', (ok) => {
  const $ = (id) => document.getElementById(id);
  $('connLost').hidden = ok === true;
  const unpaired = ok === 'unpaired';
  $('connLostTitle').textContent = unpaired ? 'This device is not paired' : 'Connection to the engine lost';
  $('connLostText').textContent = unpaired
    ? 'On the computer, open Connect device and scan its QR code with this phone (the link carries the access key).'
    : 'Reconnecting…';
  if (ok === true) { fitSent = 'none'; walkSent = 'none'; render(true); }
});
connect();
