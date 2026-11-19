// The profile's experience, simulated on the walls of the app's own views (Live strip, focus, 3D room).
// One hidden same-origin iframe runs the experience page in viewer mode (?run=1&view=1, see experiences/runtime.js): a second,
// small instance that is only looked at. It posts its frames here (ImageBitmap); the views draw the latest one.
// It never touches the room's real output: no Spout, no preview, no report (the running instance is a different page).

import { store, on } from './conn.js';

const KEY = 'vt-exp-view';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== '0'; } catch { /* storage blocked */ }

let iframe = null, curId = null, curSrc = '';
let latest = null; // { bitmap, seq, id }
let seq = 0;
const subs = new Set();

/** The experience of the profile, if the catalog has it: { id, name, entry }. */
export function current() {
  const id = store.state?.profile?.experience?.id;
  const e = id && (store.state.experiences || []).find((c) => c.id === id);
  return e ? { id: e.id, name: e.name, entry: e.entry } : null;
}

/** The toggle is only offered when the profile has an experience. */
export const available = () => !!current();
/** Shown in the views: available and switched on. */
export const active = () => enabled && available();
export const isOn = () => enabled;

export function setOn(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  sync();
}

/** The latest frame { bitmap, seq, id } (null while off or before the first one). */
export const frame = () => (active() ? latest : null);

/** Calls fn for every new frame (at most ~30 Hz). Returns the unsubscribe. */
export function onFrame(fn) { subs.add(fn); return () => subs.delete(fn); }

function drop() {
  try { latest?.bitmap.close(); } catch { /* already closed */ }
  latest = null;
}

function sync() {
  const c = active() ? current() : null;
  const src = c ? `/experiences/${c.id}/${c.entry}?run=1&view=1` : '';
  if (src === curSrc) return;
  curSrc = src;
  if (iframe) { iframe.remove(); iframe = null; }
  curId = c ? c.id : null;
  drop(); // a frame of another piece (or of nothing) must not linger
  if (!c) return;
  // kept rendering (not display:none, which would stop it painting): 1 px, invisible, out of the way
  iframe = document.createElement('iframe');
  iframe.id = 'xpViewer';
  iframe.title = 'Experience preview';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.src = src;
  document.body.append(iframe);
}

addEventListener('message', (e) => {
  const m = e.data;
  if (e.origin !== location.origin || !iframe || e.source !== iframe.contentWindow || m?.type !== 'vt-experience-frame') return;
  if (m.id !== curId || !(m.bitmap instanceof ImageBitmap)) { try { m.bitmap?.close?.(); } catch { /* ignore */ } return; }
  const prev = latest;
  latest = { bitmap: m.bitmap, seq: ++seq, id: m.id };
  try { prev?.bitmap.close(); } catch { /* ignore */ }
  for (const fn of subs) { try { fn(latest); } catch (err) { console.error(err); } }
});

on('state', sync);
if (store.state) sync();
