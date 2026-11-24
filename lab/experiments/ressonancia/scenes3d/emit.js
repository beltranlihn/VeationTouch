// Ressonància — who may talk to the sound piece on BroadcastChannel('ressonancia') (LOCAL WORKAROUND: the runtime has no channel
// between a visual piece and its sound piece yet).
//
// The app opens a visual page TWICE: the room instance and a small viewer (vt.sink === 'viewer': Live's preview, the 3D room view).
// Both would post to the sound piece — fx impacts from every part, ctl jumps / pace / thresholds from the host — and the sound plays
// them all: doubled hits, doubled jumps, and (the parts' local simulations use Math.random) "ghost" hits the room never drew.
// So ONLY the room instance posts. The viewer still renders and still LISTENS (it follows the sound's score state).
// In the lab harness vt.sink is 'browser': it posts, as before.
//
// The host calls setSink(vt) right after connectExperience(), before any part is created. Until then (a part loaded on its own),
// the app's viewer URL (?view=1) is the fallback.
let sink = null;
let viewerUrl = false;
try { viewerUrl = new URLSearchParams(globalThis.location?.search || '').get('view') === '1'; } catch { viewerUrl = false; }

export function setSink(vt) { sink = vt && typeof vt.sink === 'string' ? vt.sink : null; }
export function canEmit() { return sink == null ? !viewerUrl : sink !== 'viewer'; }
