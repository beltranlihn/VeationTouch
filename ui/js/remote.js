// The room remote — what a phone or tablet opens in the room (main.js decides; the computer keeps the full app).
// A bar at the bottom has two modes (MEDIA-SERVER.md §7.1): Live (remote-live.js: what is on the walls, launch clips
// and columns, load the experience, the master, blackout) and Calibrate (this file, as it always was). It opens in Live
// when the room is in Show mode or every wall with sensors is calibrated and verified, otherwise in Calibrate; once the
// operator switches, this device remembers the choice (vt-remote-mode). In Live the calibration parts are not drawn,
// the projection leaves the Fit / walk-test views, and the engine sends no point clouds (setViz).
// Calibrate: at the top, the room live (walls, zones, hands) and the guide: ONE next thing to do, in order, until the room is
// ready — sensors running → background → projection → calibrate each wall → verify each wall (a failed one goes to
// Fit at its worst point) → walk test → lock. The operator stands at the wall with the phone in one hand:
//   Prepare   sensors running, background captured, projection open
//   Calibrate touch and hold the projected targets (a touch that disagrees with the others is asked again by itself)
//   Fit       put a hand on a projected point of the mesh; the cyan ring shows where the system sees it; Match (or
//             the arrows) moves that point until the ring sits under the hand
//   Verify    touch new points and read the real error; when it fails, "Fix" takes the worst point to Fit
//   Test      walk test: the projection shows what the outputs send under every hand; touch every wall, cross every
//             corner; "Fix here" takes the point under the hand to Fit
// Every screen is ONE action (installers, in a dark room, standing at a wall): "Step N of M · what", one plain sentence
// saying what to do (which wall, where on it, how), "You should see…", "If not: …", and one primary action — a big
// button, or (while a hand has to be held on the wall) the instruction itself. A touch that is accepted buzzes, flashes
// the target and can beep. The grid on the walls can be switched on in Verify and Test.
// Same engine commands as the desktop (views.js), sized for a hand-held screen. Parts that
// change 30 times a second (progress ring, hand, mini map) are updated in place: buttons are never rebuilt under
// the finger.

import { store, on, connect, cmd, editProfile, undo, history, otherControl, setViz } from './conn.js';
import { h, sec, toast, confirmBox, switchUi } from './dom.js';
import { createLive } from './remote-live.js';
import * as V from './views.js';
import { gridFrom, gridSolveNode, gridNearestNode, wallUvToCanvas, mappingOutline, shapeOutline, planCloses, verifyPassMm, calibVerdict } from '/shared/geometry.js';
import { canvasZoneOnWall } from './shapes.js';

const STEPS = [['prepare', 'Prepare'], ['calibrate', 'Calibrate'], ['fit', 'Fit'], ['verify', 'Verify'], ['test', 'Test']];
const MIN_WEIGHT = 0.25; // Fit: the hand must be this close to the point (bilinear weight) for Match to be meaningful
const run = (p, ok) => p.then((r) => { if (ok) toast(ok, 'ok'); return r; }).catch((e) => toast(e.message, 'bad'));
const P = () => store.state.profile;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

const rc = {
  remote: true,
  sound: lsGet('vt-remote-sound') !== 'off', // a short beep when a touch is accepted (remembered on this phone)
  fb: { ok: 0, bad: 0, vibrated: 0, beeps: 0 }, // feedback given so far (also read by the UI tests)
  wall: (() => { try { return localStorage.getItem('vt-remote-wall'); } catch { return null; } })(),
  step: 'prepare',
  node: null,          // Fit: the mesh point being moved (index into mapping.points)
  follow: true,        // Fit: the selected point follows the hand on the wall
  nudgeStep: 5,        // Fit: pixels per arrow press
  samples: [],         // Fit: the last positions of the one hand on the wall (Match averages them)
  pendingFix: null,    // {wallId, x, y}: Fit opens on the mesh point nearest to this spot (a failed check point)
  walk: { walls: new Set(), corners: new Set() }, // Test: walls touched and corners crossed so far
  calibOpt: { cols: 3, rows: 3, top: 1.9, bottom: 0.45, holdMs: 700 },
  mode: null,          // 'live' | 'calibrate' — decided when the first state arrives (openingMode)
  get calibWall() { return rc.wall; },
  set calibWall(v) { rc.wall = v; },
  setMode: (m) => setMode(m), openingMode: () => openingMode(),
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
  title: h('b', {}, 'Calibration'),
  modes: h('nav', { class: 'r-modes', 'aria-label': 'Mode' },
    [['live', 'Live'], ['calibrate', 'Calibrate']].map(([m, t]) => h('button', { 'data-mode': m, 'aria-pressed': 'false', onclick: () => setMode(m) }, h('span', { class: 'd' }), t))),
};
const liveUi = createLive();
document.body.prepend(h('div', { class: 'remote', id: 'remote' },
  h('header', { class: 'r-top' },
    h('img', { src: 'brand/veation-marca-pequena.svg', alt: '' }),
    h('div', { class: 'r-title' }, el.title, el.room),
    h('div', { class: 'grow' }), liveUi.lockBtn, el.chips),
  el.banner, el.live, el.guide, el.walls, el.steps, el.body, el.foot, liveUi.el, el.modes));

// ------------------------------------------------------------------ modes: Live | Calibrate (MEDIA-SERVER.md §7.1)

const MODE_KEY = 'vt-remote-mode';
/** Every wall with sensors is calibrated and passed its verification. */
const roomReady = () => { const W = P().walls.filter((w) => V.wallReadiness(w).sensors.length); return W.length > 0 && W.every((w) => wallDone(w) && !!w.verified?.pass); };
/** Where the remote opens: this device's last choice; else Live in Show mode or with the room ready, Calibrate otherwise. */
function openingMode() {
  const m = lsGet(MODE_KEY);
  if (m === 'live' || m === 'calibrate') return m;
  if (store.status?.calib || store.status?.verify) return 'calibrate'; // a session is running: it owns the remote
  return store.state.locked || roomReady() ? 'live' : 'calibrate';
}
let vizOff = false;
function applyMode(m) {
  rc.mode = m;
  const live = m === 'live';
  document.getElementById('remote').classList.toggle('mode-live', live);
  document.body.classList.toggle('rl-on', live);
  el.title.textContent = live ? 'Live' : 'Calibration';
  for (const b of el.modes.children) { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  liveUi.setActive(live);
  if (live !== vizOff) { vizOff = live; setViz(!live); } // Live draws no point clouds: none cross the relay
  sendFit(); sendWalk(); // Live: the projection leaves the Fit and walk-test views
}
function setMode(m) {
  if (m !== 'live' && m !== 'calibrate') return;
  lsSet(MODE_KEY, m); // remembered on this device once chosen
  if (m === rc.mode) return;
  liftSimHand();
  applyMode(m);
  if (m === 'calibrate') { lastBody = ''; lastChrome = ''; chipsKey = ''; guideKey = ''; render(true); }
}

function curWall() {
  const W = P().walls;
  if (!W.some((w) => w.id === rc.wall)) rc.wall = W[0]?.id ?? null;
  return W.find((w) => w.id === rc.wall) || null;
}

function setWall(id) {
  if (rc.wall === id) return;
  liftSimHand();
  rc.wall = id; rc.node = null; rc.samples = [];
  lsSet('vt-remote-wall', id);
  render(true);
}

function setStep(step) {
  if (rc.step === step) return;
  liftSimHand();
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
    s.targets.map((t) => [t.captured?.length ?? 0, t.skipped ? 1 : 0, t.errMm ?? null]), s.summary ?? null, c?.result ? Object.entries(c.result).map(([k, r]) => [k, r.ok, r.rmsMm ?? null]) : null, c?.armed ?? null]);
}

function bodyKey(w) {
  if (!w) return 'none';
  const st = store.status?.sensors || {};
  const sensors = V.wallReadiness(w).sensors.map((s) => [s.id, st[s.id]?.state ?? null, !!st[s.id]?.background, s.calibration?.rmsMm ?? null]);
  const pr = store.state.projection;
  const common = [rc.step, w.id, otherControl()?.id ?? '', !!store.state.locked, sessionKey(), sensors, gridOn(),
    P().walls.map((x) => [x.id, wallDone(x), x.verified?.pass ?? null, prepared(x)])];
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
  if (rc.mode === null) applyMode(openingMode());
  if (rc.mode === 'live') { renderChips(); el.room.textContent = P().name; return; } // remote-live.js draws Live
  followSession();
  const w = curWall();
  renderChrome(w, force);
  const key = bodyKey(w);
  if (!force && key === lastBody) { live(); watchFeedback(); return; }
  const a = document.activeElement;
  if (a && el.body.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { pending = true; return; }
  pending = false;
  lastBody = key;
  const top = el.body.scrollTop;
  el.body.replaceChildren(...(w ? body(w) : [sec(null, h('p', { class: 'muted' }, 'This room has no walls yet. Set it up on the computer, then reload this page.'))]).flat().filter(Boolean));
  el.body.scrollTop = top;
  applyPendingFix();
  live();
  watchFeedback();
}
el.body.addEventListener('focusout', () => setTimeout(() => { if (pending) render(true); }, 0));

function renderChrome(w, force) {
  renderGuide();
  const session = store.status?.calib || store.status?.verify;
  const ctl = otherControl();
  document.getElementById('remote')?.classList.toggle('in-session', !!session); // a session owns the screen: only its step
  const key = JSON.stringify([rc.sound, P().name, P().walls.map((x) => [x.id, x.name, wallDone(x)]), w?.id, rc.step, w && prepared(w), session?.wallId ?? null,
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
    h('button', { class: `btn small${rc.sound ? ' on' : ''}`, title: 'A short beep when a touch is accepted', 'aria-pressed': String(rc.sound), onclick: toggleSound }, rc.sound ? 'Sound on' : 'Sound off'),
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
  const near = el.body.querySelector('.r-near'); // how far the hand is from the target: changes every scan, updated in place
  if (near) { const t = nearText(store.status?.calib); if (near.textContent !== t) near.textContent = t; near.hidden = !t; }
  sendFit();
  updateFit();
}

// ------------------------------------------------------------------ the words: every screen says what to do

const STEP_NAME = { prepare: 'Prepare', calibrate: 'Calibrate', fit: 'Fit', verify: 'Verify', test: 'Walk test' };
const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;

/** "Step 2 of 5 · Calibrate P2" */
function stepTitle(step, w) {
  const k = STEPS.findIndex(([id]) => id === step) + 1;
  return `Step ${k} of ${STEPS.length} · ${STEP_NAME[step]}${step !== 'test' && w ? ` ${w.id}` : ''}`;
}

/** The wall by name AND position, as laid out in the strip at the top: "the right wall — P2". */
function wallWords(w) {
  const W = P().walls, i = W.findIndex((x) => x.id === w.id), n = W.length;
  if (n > 3) return `the ${ORD(i + 1)} wall from the left — ${w.id}`;
  const pos = n <= 1 ? '' : n === 2 ? (i === 0 ? 'left ' : 'right ') : ['left ', 'middle ', 'right '][i];
  return `the ${pos}wall — ${w.id}`;
}

/** Where a target is on the wall, said against the other targets: "at the top left (1.9 m up)". */
function spotWords(targets, t) {
  const xs = targets.map((q) => q.x), ys = targets.map((q) => q.y);
  const pick = (v, lo, hi, names) => (hi - lo < 0.05 ? names[1] : (v - lo) / (hi - lo) < 0.34 ? names[0] : (v - lo) / (hi - lo) > 0.66 ? names[2] : names[1]);
  const col = pick(t.x, Math.min(...xs), Math.max(...xs), ['left', 'centre', 'right']);
  const row = pick(t.y, Math.min(...ys), Math.max(...ys), ['bottom', 'middle', 'top']);
  const where = row === 'middle' && col === 'centre' ? 'in the middle' : `at the ${row} ${col}`;
  return `${where} (${t.y.toFixed(1)} m up)`;
}

/** Walls done in this step, always visible: "Walls 2 of 4 done · P4 ✓ P1 ✓ P2 P3". */
function wallsProgress(step) {
  const W = P().walls.filter((w) => V.wallReadiness(w).sensors.length);
  const done = { prepare: prepared, calibrate: wallDone, fit: (w) => !!w.verified?.pass, verify: (w) => !!w.verified?.pass, test: (w) => rc.walk.walls.has(w.id) }[step];
  if (!W.length) return null;
  return h('div', { class: 'r-prog' }, h('span', { class: 'lbl tnum' }, `Walls ${W.filter(done).length} of ${W.length} done`),
    ...W.map((w) => h('span', { class: `pw${done(w) ? ' ok' : ''}${w.id === rc.wall ? ' cur' : ''}` }, done(w) ? `${w.id} ✓` : w.id)));
}

/**
 * The top of every screen. `act` is the one sentence, the action word first. With `touch` the sentence IS the primary
 * action (a hand held on the wall: nothing to tap) and it flashes when the touch is accepted.
 */
function card(step, w, { title, act, see, fix, tone, touch = false, progress = true }) {
  return sec(null, h('div', { class: `r-task${tone ? ` ${tone}` : ''}` },
    h('div', { class: 'r-stepno tnum' }, title || stepTitle(step, w)),
    act ? h('p', { class: `r-do${touch ? ' r-act r-primary r-target' : ''}` }, act) : null,
    see ? h('p', { class: 'r-see' }, h('b', {}, 'You should see: '), see) : null,
    fix ? h('p', { class: 'r-fixit' }, h('b', {}, 'If not: '), fix) : null,
    progress ? wallsProgress(step) : null));
}

/** The one primary button of a screen (big, full width). */
const primary = (label, onclick, { disabled = false } = {}) =>
  sec(null, h('button', { class: 'btn primary block big r-primary', disabled, onclick }, label));

const secondary = (label, onclick, { disabled = false } = {}) => h('button', { class: 'btn block', disabled, onclick }, label);

// ------------------------------------------------------------------ feedback: a touch was accepted

let actx = null;
function beep(kind) {
  rc.fb.beeps++;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx ||= new AC();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = 'sine'; o.frequency.value = kind === 'ok' ? 880 : 220;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ok' ? 0.12 : 0.22));
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
  } catch { /* no audio on this device */ }
}

/** Buzz, flash the target, beep (if on). kind: 'ok' = the touch was accepted, 'bad' = it is asked again. */
function feedback(kind = 'ok') {
  rc.fb[kind]++;
  // the browser refuses (and warns) until the page has had a tap: on a phone the operator has always tapped Start by now
  try { if (navigator.userActivation?.hasBeenActive !== false && navigator.vibrate?.(kind === 'ok' ? 80 : [70, 50, 70])) rc.fb.vibrated++; } catch { /* no vibration here */ }
  const t = document.querySelector('#rBody .r-target');
  if (t) { t.classList.remove('flash', 'flash-bad'); void t.offsetWidth; t.classList.add(kind === 'ok' ? 'flash' : 'flash-bad'); }
  if (rc.sound) beep(kind);
}

function toggleSound() {
  rc.sound = !rc.sound;
  lsSet('vt-remote-sound', rc.sound ? 'on' : 'off');
  if (rc.sound) beep('ok'); // the tap is a gesture: it also unlocks audio on phones
  render(true);
}

/** Calibration / verification: a capture ("take your hand off") is an accepted touch; "did not match" asks again. */
let fbSession = '', fbPhase = '', fbAuto = '';
function watchFeedback() {
  const c = store.status?.calib, v = store.status?.verify, s = c || v;
  const id = s ? `${c ? 'c' : 'v'}:${s.wallId}` : '';
  const auto = s?.autoRedo ? `${s.autoRedo.index}:${s.autoRedo.errMm}` : '';
  if (id !== fbSession) { fbSession = id; fbPhase = s?.phase ?? ''; fbAuto = auto; return; } // a new session: nothing to react to yet
  if (!s) return;
  if (s.phase === 'release' && fbPhase !== 'release') feedback('ok');
  if (auto && auto !== fbAuto) feedback('bad');
  fbPhase = s.phase; fbAuto = auto;
}

// ------------------------------------------------------------------ grid on the walls (Verify and Test)

const gridOn = () => !!(store.state?.grid ?? store.state?.projection?.grid);
/** A grid drawn on every wall, to see whether touches line up. The engine reports whether it is on. */
function gridButton() {
  const on = gridOn();
  return h('button', { class: `btn block r-grid${on ? ' on' : ''}`, 'aria-pressed': String(on),
    onclick: () => run(cmd('projection.set', { grid: !gridOn() })) }, on ? 'Grid on the walls: on — tap to hide it' : 'Show a grid on the walls');
}

// ------------------------------------------------------------------ screens

function body(w) {
  const c = store.status?.calib, v = store.status?.verify;
  const other = otherControl();
  // A running session owns the screen whatever step this phone was on: its way out (Exit calibration) must always be reachable.
  // Another device drives it: the buttons that change it offer "Take control and …" in the same tap (see gate()).
  if (c) return [...calibSession(c, P().walls.find((x) => x.id === c.wallId) || w), other ? null : simTargetSec(c, 'target', 1300)];
  if (v) return [...verifySession(v, P().walls.find((x) => x.id === v.wallId) || w), other ? null : simTargetSec(v, 'check point', 1600)];
  if (rc.step === 'calibrate') return calibrateBody(w);
  if (rc.step === 'verify') return verifyBody(w);
  if (rc.step === 'fit') return fitBody(w);
  if (rc.step === 'test') return testBody();
  return prepareBody(w);
}

function prepareBody(w) {
  const r = V.wallReadiness(w), st = store.status?.sensors || {}, pr = store.state.projection;
  const down = r.sensors.filter((s) => st[s.id]?.state !== 'scanning'), noBg = r.sensors.filter((s) => !st[s.id]?.background);
  const open = (store.status?.projections ?? 0) > 0, ids = (l) => l.map((s) => s.id).join(', ');
  const rows = [[r.sensors.length > 0 && !down.length, `Sensors of ${w.id} running`], [r.sensors.length > 0 && !noBg.length, 'Background captured, room empty'], [open, 'Projection open on the projector']];
  const checks = sec(null, h('div', { class: 'checklist' }, rows.map(([ok, t]) => h('div', { class: `check${ok ? ' done' : ''}` }, h('span', { class: 'mark' }, ok ? '✓' : ''), h('span', { class: 't' }, t)))));
  if (!r.sensors.length) return [card('prepare', w, { act: `${w.id} has no sensor. On the computer, open Sensors and put one on ${w.id}.`, tone: 'warn' }), checks, primary('Waiting for a sensor', null, { disabled: true })];
  if (down.length) {
    return [card('prepare', w, { act: `Check the power and the network cable of ${ids(down)}.`, see: 'The sensor count at the top turns green.',
      fix: 'Tap Restart. Still not running: on the computer, Sensors says why.', tone: 'warn' }), checks,
    primary(`Restart ${ids(down)}`, () => down.forEach((s) => run(cmd('sensor.restart', { id: s.id }))))];
  }
  if (noBg.length) {
    return [card('prepare', w, { act: `Clear the wall and step away from ${w.id}. Then tap Capture background.`, see: 'A 5-second countdown, then “Background captured”.',
      fix: 'Anyone or anything left in front of the sensor becomes part of the background. Capture again with the room empty.' }), checks,
    primary('Capture background', () => V.captureBackground({ wallId: w.id }, w.id))];
  }
  if (!open) {
    const can = pr.displayId != null;
    return [card('prepare', w, { act: can ? 'Open the projection on the projector.' : 'Open the projection on the projector, from the computer.', see: 'The projector shows the room’s picture.',
      fix: can ? 'Nothing appears: check that the projector is on and set to the right input.' : 'On the computer: Calibrate › Before you start › choose the projector’s display, then Open.', tone: 'warn' }), checks,
    primary(can ? 'Open projection' : 'Waiting for the projection', can ? () => run(cmd('projection.set', { open: true })) : null, { disabled: !can })];
  }
  return [card('prepare', w, { act: `All set for ${w.id}. Go on and calibrate it.`, see: 'Three green ticks below.' }), checks, primary(`Next: calibrate ${w.id}`, () => setStep('calibrate'))];
}

// ------------------------------------------------------------------ Calibrate

const startCalib = (w) => { const o = rc.calibOpt; return run(cmd('calib.start', { wallId: w.id, cols: o.cols, rows: o.rows, top: o.top, bottom: o.bottom, holdMs: o.holdMs, armed: true })); }; // the phone is at the wall

function calibStartButton(w, isPrimary) {
  const off = !V.wallReadiness(w).running.length, label = `Start calibration of ${w.id}`;
  return isPrimary ? primary(label, () => startCalib(w), { disabled: off }) : sec(null, secondary(`${label} again — only if a sensor moved`, () => startCalib(w), { disabled: off }));
}

function calibrateBody(w) {
  const { sensors, running, withBg, calibrated } = V.wallReadiness(w);
  const st = store.status?.sensors || {}, opt = rc.calibOpt, n = opt.cols * opt.rows;
  const done = sensors.length > 0 && calibrated.length === sensors.length;
  const options = h('details', { class: 'sec fold r-opts' }, h('summary', {}, `Targets: ${opt.cols} × ${opt.rows} · options`), V.calibTargets(rc));
  if (done) {
    return [card('calibrate', w, { act: `${w.id} is calibrated (${calibrated.map((s) => `${s.id}: ${s.calibration.rmsMm} mm`).join(', ')}). Go on and verify it.`, see: 'Under 10 mm is excellent.' }),
      primary(`Next: verify ${w.id}`, () => setStep('verify')), calibStartButton(w, false), options];
  }
  if (!sensors.length) return [card('calibrate', w, { act: `${w.id} has no sensor. On the computer, open Sensors and put one on ${w.id}.`, tone: 'warn' }), calibStartButton(w, true)];
  if (!running.length) {
    return [card('calibrate', w, { act: `Fix the sensors of ${w.id} first: ${sensors.map((s) => `${s.id} is ${st[s.id]?.state || 'stopped'}`).join(', ')}.`,
      fix: 'Check power and network cable, then go to Prepare and tap Restart.', tone: 'warn' }), primary('Go to Prepare', () => setStep('prepare'))];
  }
  if (withBg.length !== sensors.length) {
    return [card('calibrate', w, { act: `Capture the background of ${w.id} first, with nobody in front of the wall.`,
      fix: 'Without it the floor and the side walls look like hands. Go to Prepare and tap Capture background.', tone: 'warn' }),
    primary('Go to Prepare', () => setStep('prepare'))];
  }
  return [card('calibrate', w, { act: `Stand facing ${wallWords(w)}, an arm’s length away. Tap Start.`, see: `An amber ring on ${w.id}: “Touch and hold · 1/${n}”.`,
    fix: 'No ring on the wall? Open the projection on the projector (Prepare).' }), calibStartButton(w, true), options];
}

/** The wall's targets in miniature: the current one amber, the done ones green. */
function targetMap(w, s) {
  const W = 300, H = Math.max(60, Math.round((W * w.height) / w.width));
  const X = (x) => (x / w.width) * W, Y = (y) => H - (y / w.height) * H;
  const dots = s.targets.map((t, k) => {
    const cur = k === s.index && s.phase !== 'done', got = t.captured?.length || t.errMm != null;
    const col = cur ? '#E5B567' : got ? '#7FC4A2' : '#8C8C8C';
    return `<circle cx="${X(t.x)}" cy="${Y(t.y)}" r="${cur ? 10 : 6}" fill="${cur || got ? col : 'none'}" stroke="${col}" stroke-width="2"/><text x="${X(t.x) + 12}" y="${Y(t.y) + 5}" fill="#B8B8B8" font-size="14" font-family="Geist, system-ui">${k + 1}</text>`;
  }).join('');
  return h('div', { class: 'target-map', html: `<svg viewBox="-12 -12 ${W + 24} ${H + 24}" width="100%"><rect x="0" y="0" width="${W}" height="${H}" fill="#161616" stroke="rgba(255,255,255,0.25)"/>${dots}</svg>` });
}

/** What the person at the wall has to do right now, by phase (shared by Calibrate and Verify). */
function touchWords(s, w, what) {
  const t = s.targets[Math.min(s.index, s.targets.length - 1)];
  if (s.phase === 'release') return { act: 'Got it. Take your hand off the wall.', see: s.index + 1 >= s.targets.length ? 'The result in a moment.' : `The next ${what} appears.` };
  if (s.phase === 'holding') return { act: 'Hold still. Keep your palm flat on the ring.', see: 'The ring fills up, then turns green.', fix: 'The ring stops filling? Your hand moved: take it off and press again.' };
  if (s.autoRedo) {
    return { act: `Target ${s.autoRedo.index + 1} did not match the others (${s.autoRedo.errMm} mm off). Press it again, right on the centre of the ring.`,
      see: 'The ring fills up, then turns green.', fix: 'Still not matching: stand square to the wall and use your palm, not a finger.', tone: 'warn' };
  }
  return { act: `Press the amber ${what} ${spotWords(s.targets, t)} on ${wallWords(w)}. Use your open palm, flat. Hold until the ring is full.`, see: 'The ring fills up, then turns green.',
    fix: 'Nothing fills? Press closer to the centre of the ring, palm flat, and keep other people away from the wall.' };
}

/**
 * A button that changes a session another device drives: it says "Take control and …" and one tap does control.take, then
 * the op. A button that is bound to fail is never shown. Returns [label, onclick] for primary() / gbtn().
 * `as` is the wording after "Take control and" when the label alone does not read well there; `pre` is a question asked
 * BEFORE taking control (declining it leaves everything as it was).
 */
function gate(label, fn, as = label, pre = null) {
  if (!otherControl()) return [label, pre ? async () => { if (await pre()) return fn(); } : fn];
  return [`Take control and ${as.charAt(0).toLowerCase()}${as.slice(1)}`, async () => {
    if (pre && !await pre()) return;
    try { await cmd('control.take'); } catch (e) { toast(e.message, 'bad'); return; }
    return fn();
  }];
}
const gbtn = (cls, label, fn, as, extra = {}, pre = null) => { const [t, f] = gate(label, fn, as, pre); return h('button', { class: `btn ${cls}`.trim(), onclick: f, ...extra }, t); };

/** The way out of calibration mode: always there, in every phase, with or without control. Cancelling is open to every paired device. */
function exitButton(kind, wallId, captured = 0) {
  const op = kind === 'verify' ? 'verify.cancel' : 'calib.cancel';
  return h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'linkish danger-ink r-exit', onclick: async () => {
    if (captured > 0 && !await confirmBox(`Exit calibration of ${wallId}? The ${captured} point${captured === 1 ? '' : 's'} captured so far ${captured === 1 ? 'is' : 'are'} discarded; the current calibration stays.`, 'Exit calibration', true)) return;
    run(cmd(op));
  } }, 'Exit calibration'));
}

/** How far the hand is from the target. Empty while the hand is in reach, or when the engine does not say. */
function nearText(s) {
  const n = s?.near, r = s?.captureRadiusM;
  if (!n || !Number.isFinite(n.distM) || !(r > 0) || n.distM <= r || s.phase === 'done' || s.armed === false) return '';
  return `Your hand is ${n.distM.toFixed(1)} m from target ${Math.min(s.index + 1, s.targets.length)} — move to the amber ring`;
}

function calibSession(c, w) {
  if (c.phase === 'done') return calibResult(c, w);
  const total = c.targets.length, k = Math.min(c.index + 1, total), t = touchWords(c, w, 'ring');
  const got = c.targets.filter((q) => q.captured?.length).length;
  const waiting = c.armed === false; // the engine says nothing is captured until the operator is at the wall
  const head = waiting
    ? card('calibrate', w, { title: stepTitle('calibrate', w), progress: false, act: `Stand at ${wallWords(w)}, an arm’s length away, facing it. Then tap the button.`,
      see: `An amber ring on ${w.id}: “Touch and hold · ${k}/${total}”.`, fix: 'Nothing is captured until you tap: walking past the wall does nothing.' })
    : card('calibrate', w, { title: `${stepTitle('calibrate', w)}${c.redoing ? ' · redo' : ''}`, ...t, touch: true, progress: false });
  return [
    head,
    waiting ? primary('I’m at the wall — start', () => run(cmd('calib.arm'))) : null,
    sec(null, h('div', { class: 'calib-big' },
      h('div', { class: 'ring', html: V.ringSvg(c.phase === 'release' ? 1 : c.progress, c.phase === 'release') }),
      h('div', { class: 'step tnum' }, `Target ${k} of ${total}`),
      h('div', { class: 'r-near tnum', role: 'status', hidden: !nearText(c) }, nearText(c)),
      h('div', { class: 'muted tnum' }, `${got} captured · ${c.sensorIds.join(', ')}`),
      targetMap(w, c))),
    sec(null, h('div', { class: 'actions r-row' },
      gbtn('', '← Back', () => run(cmd('calib.back')), 'go back', { disabled: c.index === 0 }),
      gbtn('', 'Skip target', () => run(cmd('calib.skip')))),
    exitButton('calib', c.wallId, got)),
  ];
}

const quality = (mm) => (mm < 10 ? 'excellent' : mm < 20 ? 'good enough for hands' : 'too loose');

function calibResult(c, w) {
  const rows = Object.entries(c.result || {}), ok = rows.some(([, r]) => r.ok);
  const worstMm = Math.max(0, ...rows.filter(([, r]) => r.ok).map(([, r]) => r.maxMm));
  const vd = calibVerdict(c.result), rms = Math.round(vd.rmsMm);
  const canRedo = ok && c.worst >= 0;
  const startOver = !ok || vd.startOver || (vd.bad && !canRedo), redoFirst = !startOver && vd.bad; // a bad result is never saved by default
  const lines = rows.map(([sid, r]) => h('div', { class: `check${r.ok ? ' done' : ''}` }, h('span', { class: 'mark' }, r.ok ? '✓' : '!'),
    h('span', { class: 't tnum' }, r.ok ? `${sid}: ${r.rmsMm} mm average · worst ${r.maxMm} mm — ${quality(r.rmsMm)}` : `${sid}: ${r.error}`)));
  const apply = () => run(cmd('calib.apply'), 'Calibration saved — now verify it');
  const sure = () => confirmBox(`This calibration is off by ${rms} mm on average — hands will land ${rms} mm away. Save it anyway?`, 'Save it anyway', true);
  const redoWorst = () => run(cmd('calib.redo', { index: c.worst }));
  const again = async () => { await run(cmd('calib.cancel')); startCalib(w); };
  const act = !ok ? 'The calibration could not be solved. Start it again.'
    : startOver ? `This calibration is off by ${rms} mm on average (worst ${vd.maxMm} mm): too many points are off. Start over.`
      : redoFirst ? `This calibration is off by ${rms} mm on average (worst ${vd.maxMm} mm). Redo the worst point, #${c.worst + 1}.`
        : 'Check the error, then tap Apply & save.';
  const [pl, pf] = startOver ? gate('Start over', again) : redoFirst ? gate(`Redo worst point (#${c.worst + 1})`, redoWorst) : gate('Apply & save', apply);
  return [
    card('calibrate', w, { title: `${stepTitle('calibrate', w)} · result`, progress: false, act,
      see: ok ? (vd.bad ? 'Press the ring right on its centre, palm flat. The error should drop under 10 mm.' : 'Under 10 mm average is excellent for hands.') : null,
      fix: ok ? (!vd.bad && worstMm > 20 ? `The worst point is ${worstMm} mm off: tap Redo worst point (#${c.worst + 1}) and press it right on its centre.` : null)
        : 'Too few targets were captured. Tap Back to capture the missing ones, or Start over with nobody walking in front of the wall.',
      tone: ok && !vd.bad ? '' : 'warn' }),
    sec(null, h('div', { class: 'checklist' }, lines)),
    primary(pl, pf),
    sec(null, h('div', { class: 'actions r-row' },
      ok && vd.bad ? gbtn('', 'Apply & save', apply, undefined, {}, sure) : null,
      canRedo && !redoFirst ? gbtn('attn', `Redo worst point (#${c.worst + 1})`, redoWorst) : null,
      gbtn('', 'Back', () => run(cmd('calib.back')), 'go back')),
    exitButton('calib', c.wallId, c.targets.filter((q) => q.captured?.length).length)),
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
  const want = w && rc.mode !== 'live' && rc.step === 'fit' && w.mapping.mode === 'grid' && !document.hidden ? { wallId: w.id, node: rc.node } : null;
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
  // the points and the ring are drawn by the projection: say so, but let the operator carry on
  if (!((store.status?.projections ?? 0) > 0)) out.push(sec(null, h('div', { class: 'callout attn' }, 'The projection is closed, so the wall shows nothing. Go to Prepare and open it on the projector.')));
  if (m.mode !== 'grid') {
    const [nx, ny] = meshSize(w);
    return [...out, card('fit', w, { act: `Tap the button: it lays a ${nx} × ${ny} mesh of points over ${w.id}. Nothing moves yet.`,
      see: `Amber points on ${w.id}, as many as the mesh.`,
      fix: `${w.id} uses ${m.mode === 'corners' ? 'a corner pin' : 'a rectangle'} now; the mesh starts with exactly the same picture. Fit is only needed where touches land off.` }),
    primary(`Make a ${nx} × ${ny} mesh`, () => makeMesh(w)),
    !w.verified?.pass ? sec(null, secondary(`Skip fit — verify ${w.id}`, () => setStep('verify'))) : null];
  }
  fitEl.map = h('canvas', { class: 'r-map', 'aria-label': 'The mesh of the wall: tap a point to choose it' });
  fitEl.map.addEventListener('pointerdown', pickNode);
  fitEl.status = h('div', { class: 'r-fit-status r-target' });
  fitEl.node = h('div', { class: 'r-node tnum' });
  fitEl.match = h('button', { class: 'btn primary block big r-primary', onclick: () => matchNode() }, 'Match the point to my hand');
  fitEl.follow = h('button', { class: 'btn small', onclick: () => { rc.follow = !rc.follow; updateFit(); } }, 'Follow my hand');
  fitEl.undo = h('button', { class: 'btn small', onclick: () => undo() }, 'Undo');
  const pad = (dx, dy, t, label) => h('button', { 'aria-label': label, onclick: () => nudgeNode(dx, dy) }, t);
  out.push(card('fit', w, { act: `Put one open palm flat on an amber point on ${wallWords(w)}. Keep it still.`,
    see: 'A cyan ring on the wall: where the system sees your hand. After Match it sits under your palm.',
    fix: 'Match stays grey? Your hand is too far from the point, or more than one hand is on the wall.' }),
  sec(null, fitEl.map, fitEl.status, fitEl.match),
  sec('Fine tuning',
    h('div', { class: 'r-pad' },
      fitEl.node,
      // the centre of the pad is the step: 1 → 5 → 20 px per press
      h('div', { class: 'dpad' }, h('span'), pad(0, -1, '↑', 'Move the point up'), h('span'), pad(-1, 0, '←', 'Move the point left'),
        h('button', { class: 'mid tnum', title: 'Pixels per press — tap to change', onclick: () => { rc.nudgeStep = { 1: 5, 5: 20, 20: 1 }[rc.nudgeStep] || 5; render(true); } }, `${rc.nudgeStep} px`),
        pad(1, 0, '→', 'Move the point right'), h('span'), pad(0, 1, '↓', 'Move the point down'), h('span'))),
    h('div', { class: 'actions', style: { justifyContent: 'center' } }, fitEl.follow, fitEl.undo),
    simWall(w.id) ? simFitButton(w) : null),
  !w.verified?.pass ? sec(null, secondary(`Done here — verify ${w.id} again`, () => setStep('verify'))) : null);
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
  if (!t) msg = 'Put one open palm on an amber point on the wall.';
  else if (t === 'many') msg = 'Use one hand only. Take the others off this wall.';
  else if (k == null) msg = 'Tap a point on the map above, or turn on Follow my hand.';
  else {
    const [, x, y] = t;
    ok = !!gridSolveNode(m, k, x / w.width, 1 - y / w.height, m.points[k], MIN_WEIGHT);
    msg = ok ? `Hand on point ${k + 1} (${x.toFixed(2)}, ${y.toFixed(2)} m). Tap Match.` : `Move your hand onto point ${k + 1}: it is too far from it.`;
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
  if (!np) { toast(`Move your hand onto point ${k + 1}, then tap Match again.`, 'bad'); return; }
  const moved = Math.hypot(np[0] - target[0], np[1] - target[1]);
  if (moved > localScale(w, u, v) * 0.6) {
    toast(`That would move point ${k + 1} by more than 60 cm. Check your hand is on point ${k + 1}; if it is, calibrate ${w.id} again.`, 'bad');
    return;
  }
  editProfile((p) => { p.walls.find((q) => q.id === w.id).mapping.points[k] = [r1(np[0]), r1(np[1])]; }, `fit point ${k + 1}`)
    .then(() => { feedback('ok'); toast(`Point ${k + 1} moved ${Math.round(moved)} px. The ring should now sit under your hand.`, 'ok'); });
}

function nudgeNode(dx, dy) {
  const w = curWall(), k = rc.node;
  if (!w || w.mapping.mode !== 'grid' || k == null) { toast('Choose a point first: put your palm on it, or tap it on the map.', 'bad'); return; }
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
  const vf = w.verified, o = rc.calibOpt, off = !V.wallReadiness(w).running.length;
  const start = () => run(cmd('verify.start', { wallId: w.id, top: o.top, bottom: o.bottom }));
  const again = (label) => sec(null, secondary(label, start, { disabled: off }));
  if (vf && !vf.pass) {
    return [card('verify', w, { act: `${w.id} is ${vf.maxMm} mm off at one point. Fix it with your hand, then verify again.`,
      see: 'Fit opens on that point: amber points on the wall and a cyan ring where the system sees your hand.',
      fix: 'Still failing after Fit? Calibrate the wall again.', tone: 'warn' }),
    primary('Fix it with your hand', () => fixAt(w, vf.worst)), again(`Verify ${w.id} again`), sec(null, gridButton())];
  }
  if (vf) {
    const nx = nextTask(), go = nx.label && !nx.done ? nx : null;
    return [card('verify', w, { act: `${w.id} passed: ${vf.meanMm} mm average, worst ${vf.maxMm} mm. Good for hands.`, see: 'A green result.' }),
      primary(go ? go.label : 'Next: walk test', go ? () => { if (go.go) { setWall(go.go[0]); setStep(go.go[1]); } else go.act?.(); } : () => setStep('test')),
      again(`Verify ${w.id} again`), sec(null, gridButton())];
  }
  return [card('verify', w, { act: `Stand facing ${wallWords(w)}. Tap Start: five check points appear, one at a time.`,
    see: `An amber ring on ${w.id}: “Check 1 of 5”.`, fix: off ? `${w.id} has no running sensor: go to Prepare.` : 'No ring on the wall? Open the projection on the projector (Prepare).' }),
  primary(`Verify ${w.id}`, start, { disabled: off }), sec(null, gridButton())];
}

function verifySession(v, w) {
  const total = v.targets.length;
  if (v.phase === 'done') {
    const s = v.summary, lim = verifyPassMm(w), good = !!s && s.maxMm <= lim;
    const worst = s ? v.targets.reduce((b, t, k) => (t.errMm !== null && (b < 0 || t.errMm > v.targets[b].errMm) ? k : b), -1) : -1;
    const lines = v.targets.map((t, k) => h('div', { class: `check${t.errMm !== null && t.errMm <= lim ? ' done' : ''}` }, h('span', { class: 'mark' }, t.errMm !== null && t.errMm <= lim ? '✓' : '!'),
      h('span', { class: 't tnum' }, `Point ${k + 1}: ${t.errMm !== null ? `${t.errMm} mm` : 'not measured'}`)));
    return [
      card('verify', w, { title: `${stepTitle('verify', w)} · result`, progress: false,
        act: !s ? 'No point was measured. Verify again.' : good ? `Good for hands: ${s.meanMm} mm average, worst ${s.maxMm} mm (limit ${lim} mm).` : `Point ${worst + 1} is ${s.maxMm} mm off (limit ${lim} mm). Fix it with your hand.`,
        see: good ? 'The wall counts as verified.' : 'Fit opens on that point.', tone: good ? '' : 'warn' }),
      sec(null, h('div', { class: 'checklist' }, lines)),
      !good && s ? primary(`Fix point ${worst + 1} with your hand`, () => rc.fixWorst(v, worst)) : primary('Done', () => run(cmd('verify.cancel'))), // (closing is open to every device)
      !good && s ? sec(null, secondary('Done — fix it later', () => run(cmd('verify.cancel')))) : null,
      exitButton('verify', v.wallId),
    ];
  }
  const k = Math.min(v.index + 1, total), t = touchWords(v, w, 'check point');
  return [
    card('verify', w, { ...t, touch: true, progress: false }),
    sec(null, h('div', { class: 'calib-big' },
      h('div', { class: 'ring', html: V.ringSvg(v.phase === 'release' ? 1 : v.progress, v.phase === 'release') }),
      h('div', { class: 'step tnum' }, `Check ${k} of ${total}`),
      h('div', { class: 'muted tnum' }, v.targets.filter((q) => q.errMm !== null).map((q, i) => `#${i + 1} ${q.errMm} mm`).join(' · ') || `${w.id} · verification`),
      targetMap(w, v))),
    sec(null, gridButton()),
    exitButton('verify', v.wallId),
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
  const at = lsGet(walkKey());
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
    if (down.length) return { text: `Check the power and cable of ${down.map((s) => s.id).join(', ')}: not running. Sensors on the computer says why.`, warn: true };
    if (en.some((s) => !st[s.id]?.background)) return { text: 'Clear the room, then capture the background of every sensor.', label: 'Capture background', act: () => V.captureBackground({}, 'all sensors') };
    if (!((store.status?.projections ?? 0) > 0)) return { text: 'Open the projection on the projector.', label: 'Prepare', go: [rc.wall || first, 'prepare'] };
    const covered = walls.filter((w) => V.wallReadiness(w).sensors.length);
    const uncal = covered.find((w) => !wallDone(w));
    if (uncal) return { text: `Calibrate ${uncal.id}: press each amber ring with your palm and hold.`, label: `Calibrate ${uncal.id}`, go: [uncal.id, 'calibrate'] };
    const unver = covered.find((w) => !w.verified);
    if (unver) return { text: `Verify ${unver.id}: press 5 check points to measure the real error.`, label: `Verify ${unver.id}`, go: [unver.id, 'verify'] };
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
    h('div', { class: 'g-text' }, h('span', { class: 'lbl' }, t.done ? 'Ready' : 'Room next'), h('span', { class: 'what' }, t.text)),
    t.label ? h('button', { class: 'btn small', onclick: () => { if (t.go) { setWall(t.go[0]); setStep(t.go[1]); } else t.act?.(); } }, t.label) : null);
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
  walkEl.count = h('span', { class: 'lbl tnum' });
  walkEl.fix = h('button', { class: 'btn block big', onclick: () => { const id = oneHandWall(); if (!id) return; setWall(id); setStep('fit'); } }, 'Fix here');
  walkEl.finish = h('button', { class: 'btn primary block big r-primary', onclick: () => {
    lsSet(walkKey(), new Date().toISOString());
    toast('Walk test passed', 'ok');
    render(true);
  } }, 'The room passes the walk test');
  return [
    card('test', null, { act: 'Walk along the walls. Press each one with your palm, high and low, and slide your hand across every corner.',
      see: 'A white disc under your hand on the wall, and the list below ticking off.',
      fix: 'Disc not under your hand? Keep that hand still, alone on the wall, and tap Fix here.', progress: false }),
    sec(null, walkEl.count, walkEl.list),
    sec(null, walkEl.finish, h('div', { style: { height: 'var(--sp-8)' } }), walkEl.fix, h('div', { style: { height: 'var(--sp-8)' } }), gridButton()),
    testWalls().length && testWalls().every((w) => simWall(w.id)) ? sec(null,
      h('button', { class: 'btn block sim-hand', onclick: (e) => simCorners(e.currentTarget) }, 'Simulated hand across every corner'),
      h('p', { class: 'muted' }, SIM_NOTE)) : null,
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
    const total = W.length + C.length, got = W.filter((w) => rc.walk.walls.has(w.id)).length + C.filter(([a, b]) => rc.walk.corners.has(cornerKey(a, b))).length;
    walkEl.count.textContent = `${got} of ${total} done`;
  }
  const one = oneHandWall();
  walkEl.fix.disabled = !one;
  walkEl.fix.textContent = one ? `Fix here (${one})` : 'Fix here — needs one hand on a wall';
  walkEl.finish.disabled = !(W.length && W.every((w) => rc.walk.walls.has(w.id)) && C.every(([a, b]) => rc.walk.corners.has(cornerKey(a, b))));
}

/** While Test is open, the projection shows the walk-test view (what the outputs send) on every wall. */
let walkSent = 'none';
function sendWalk() {
  const want = !!store.state && rc.mode !== 'live' && rc.step === 'test' && !document.hidden;
  if (String(want) === walkSent || !store.connected) return;
  walkSent = String(want);
  cmd('projection.set', { walk: want }).catch(() => { walkSent = 'none'; });
}
document.addEventListener('visibilitychange', sendWalk);

// ------------------------------------------------------------------ simulated hands (rehearse the flow without a room)

const SIM_NOTE = 'Simulated sensors: nobody can touch the projection, so a virtual hand does it.';
/** Every enabled sensor of the wall is simulated. */
function simWall(wallId) {
  const s = P().sensors.filter((x) => x.wallId === wallId && x.enabled);
  return s.length > 0 && s.every((x) => x.driver === 'sim');
}
let simBusy = false;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const simTouch = (wallId, x, y, down, id = 'remote') => cmd('sim.touch', { wallId, x, y, id, down });

/** Calibrate / Verify: a virtual hand holds the current target, then lets go (the session moves on by itself). */
function simTargetSec(s, what, holdMs) {
  if (!s || s.phase === 'done' || !simWall(s.wallId)) return null;
  const t = s.targets[s.index];
  if (!t) return null;
  return sec(null,
    h('button', { class: 'btn block sim-hand', onclick: async () => {
      if (simBusy) return;
      simBusy = true;
      try { await simTouch(s.wallId, t.x, t.y, true); await pause(holdMs); await simTouch(s.wallId, t.x, t.y, false); }
      catch (e) { toast(e.message, 'bad'); } finally { simBusy = false; }
    } }, `Simulated hand on ${what} ${s.index + 1}`),
    h('p', { class: 'muted' }, SIM_NOTE));
}

/** Fit: a virtual hand a little off the chosen point (4 cm right, 3 cm low) — Match should bring the ring under it. */
let simFitOn = null;
/** Leaving Fit (another step or wall) lifts the virtual hand: it must not stay on the wall. */
function liftSimHand() {
  if (!simFitOn) return;
  simTouch(simFitOn.wallId, simFitOn.x, simFitOn.y, false).catch(() => {});
  simFitOn = null;
}
function simFitButton(w) {
  const on = simFitOn?.wallId === w.id;
  return h('div', { style: { marginTop: 'var(--sp-12)' } },
    h('button', { class: `btn block sim-hand${on ? ' on' : ''}`, onclick: async () => {
      if (on) { await simTouch(simFitOn.wallId, simFitOn.x, simFitOn.y, false).catch(() => {}); simFitOn = null; render(true); return; }
      const m = w.mapping, k = rc.node;
      if (m.mode !== 'grid' || k == null) { toast('Choose a point first (tap it on the mesh)', 'bad'); return; }
      const [u, v] = nodeUv(m, k);
      const x = clamp(u * w.width + 0.04, 0.05, w.width - 0.05), y = clamp((1 - v) * w.height - 0.03, 0.05, w.height - 0.05);
      rc.follow = false; // the hand is off the point on purpose: keep the chosen one
      simFitOn = { wallId: w.id, x, y };
      await simTouch(w.id, x, y, true).catch((e) => toast(e.message, 'bad'));
      render(true);
    } }, on ? 'Lift the simulated hand' : 'Simulated hand near the chosen point'),
    h('p', { class: 'muted' }, `${SIM_NOTE} It lands 4 cm right and 3 cm below the point: Match fixes that.`));
}

/** Test: a virtual hand slides across each joined corner (and so touches every wall). */
async function simCorners(btn) {
  if (simBusy) return;
  simBusy = true;
  btn.disabled = true;
  try {
    const byId = new Map(P().walls.map((w) => [w.id, w]));
    for (const [a, b] of testCorners()) {
      const A = byId.get(a), B = byId.get(b), y = 1.2;
      for (let x = A.width - 0.6; x <= A.width - 0.02; x += 0.04) { await simTouch(a, x, y, true, 'corner'); await pause(40); }
      await simTouch(a, 0, y, false, 'corner');
      for (let x = 0.02; x <= 0.6; x += 0.04) { await simTouch(b, x, y, true, 'corner'); await pause(40); }
      await pause(300);
      await simTouch(b, 0, y, false, 'corner');
      await pause(400);
    }
  } catch (e) { toast(e.message, 'bad'); } finally { simBusy = false; btn.disabled = false; }
}

// ------------------------------------------------------------------ control, connection

async function takeControl() {
  const c = otherControl();
  if (c && !await confirmBox(`Take control from ${c.device}? The session continues on this phone and ${c.device} becomes view-only.`, 'Take control')) return;
  run(cmd('control.take'), 'You have control of the session');
}

on('state', () => render());
on('status', () => render());
on('calib', () => render());
on('live', () => { if (rc.mode === 'live') { renderChips(); return; } onLive(); live(); });
on('history', () => updateFit());
on('error', (e) => toast(e.message, 'bad'));
on('connection', (ok) => {
  const $ = (id) => document.getElementById(id);
  $('connLost').hidden = ok === true;
  const unpaired = ok === 'unpaired';
  $('connLostTitle').textContent = unpaired ? 'This device is not paired' : 'Connection to the engine lost';
  $('connLostText').textContent = unpaired
    ? 'Scan the QR code again: on the computer, open Connect device and point this phone’s camera at it.'
    : 'Reconnecting… keep this phone on the room’s Wi-Fi.';
  if (ok === true) { fitSent = 'none'; walkSent = 'none'; render(true); }
});
connect();
