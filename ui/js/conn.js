// Connection to the engine (WebSocket /ws/ui) + the client-side store.
// The access key arrives in the pairing URL (?k=…) and is remembered on the device.

const listeners = new Map();
export const store = {
  state: null,      // {profile, profiles, rev, projection, displays, lan, token, local, version}
  status: null,     // {sensors, outputs, engine, calib}
  live: null,       // {walls: {wallId: [[id,x,y,size,coasting]]}, zones, roomCount, burst}
  viz: new Map(),   // sensorId → {wallId, pts: Float32Array, det, rejected}
  logs: [],
  events: [],       // recent down/up for the feed
  connected: false,
};

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}
function emit(type, data) { for (const fn of listeners.get(type) || []) fn(data); }

const params = new URLSearchParams(location.search);
let key = params.get('k');
try {
  if (key) localStorage.setItem('vt-key', key);
  else key = localStorage.getItem('vt-key');
} catch { /* storage blocked */ }
if (params.has('k')) { // keep the key out of screenshots (and the rest of the query: the texture page needs ?o=)
  const rest = new URLSearchParams(location.search); rest.delete('k');
  // window.history: this module exports its own `history` (undo/redo), which is not initialised yet here
  window.history.replaceState(null, '', `${location.pathname}${[...rest].length ? `?${rest}` : ''}`);
}

export const isCoarse = matchMedia('(pointer:coarse)').matches;

/** Upload a file to an engine endpoint with this device's access key. */
export async function upload(pathname, body, extra = '') {
  const q = new URLSearchParams(extra);
  if (key) q.set('k', key);
  const r = await fetch(`${pathname}?${q}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
  return j;
}
let ws = null, nextId = 1, retry = 0, unpaired = false;
let serverProfile = null;
const pending = new Map();
// the pages that only draw (projection, full-screen texture, the room output, an experience) never need point clouds
const pageRole = location.pathname.startsWith('/projection') ? 'projection' : location.pathname.startsWith('/texture') ? 'texture'
  : location.pathname.startsWith('/output') ? 'output' : location.pathname.startsWith('/audio') ? 'audio' : location.pathname.startsWith('/experiences/') ? 'experience' : null;
const role = pageRole || params.get('role') || 'ui';
let wantViz = !pageRole;

function url() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = new URLSearchParams({ role });
  if (key) q.set('k', key);
  return `${proto}://${location.host}/ws/ui?${q}`;
}

export function connect() {
  // one channel per page: a second caller (the audio window and the runtime of its sound piece) shares the open one
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(url());
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    retry = 0;
    unpaired = false;
    store.connected = true;
    sendHello();
    emit('connection', true);
  };
  ws.onclose = () => {
    store.connected = false;
    emit('connection', unpaired ? 'unpaired' : false);
    // the page loads but the UI channel is refused: tell "this device is not paired" apart from "engine down"
    fetch(`/api/pair-check${key ? `?k=${encodeURIComponent(key)}` : ''}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { const u = j.paired === false; if (u !== unpaired) { unpaired = u; emit('connection', u ? 'unpaired' : false); } })
      .catch(() => {});
    for (const p of pending.values()) p.reject(new Error('connection lost'));
    pending.clear();
    setTimeout(connect, Math.min(5000, 300 * 2 ** retry++));
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return onViz(ev.data);
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'state':
        if (serverProfile && serverProfile.id !== m.profile.id) { history.clear(); store.events.length = 0; emit('events', []); } // another room: its own history and events
        store.state = m; serverProfile = m.profile; emit('state', m);
        break;
      case 'status': store.status = { ...m, clients: m.clients ?? store.status?.clients }; emit('status', m); break;
      case 'live':
        store.live = m;
        if ('calib' in m || 'verify' in m) {
          const had = !!(store.status?.calib || store.status?.verify);
          store.status = { ...(store.status || {}), calib: m.calib ?? null, verify: m.verify ?? null };
          if (m.calib || m.verify || had) emit('calib');
        }
        if (m.events) { store.events.unshift(...m.events.map((e) => ({ ...e, at: Date.now() }))); store.events.length = Math.min(store.events.length, 40); emit('events', m.events); }
        emit('live', m);
        break;
      case 'log': store.logs.push(m.entry); if (store.logs.length > 400) store.logs.shift(); emit('log', m.entry); break;
      case 'ack': {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); m.ok ? p.resolve(m.result) : p.reject(new Error(m.error)); }
        break;
      }
      default: break;
    }
  };
}

function sendHello() {
  if (ws?.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'hello', role, viz: wantViz, vizHz: isCoarse ? 5 : 10 }));
}

export function setViz(on) { wantViz = on; sendHello(); if (!on) store.viz.clear(); }

function onViz(buf) {
  const dv = new DataView(buf);
  const hlen = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = (hlen + 4 + 3) & ~3;
  const all = new Float32Array(buf, base);
  store.viz.clear();
  for (const s of head.sensors) {
    store.viz.set(s.id, { wallId: s.wallId, pts: all.subarray(s.offset, s.offset + s.count * 3), det: s.det, rejected: s.rejected });
  }
  emit('viz');
}

/**
 * Commands that legitimately take longer than the usual 15 s: a real S2E needs up to ~65 s to come back on a new
 * address (the engine waits 90 s), and the elevated network change waits for the operator to accept Windows' prompt.
 */
export const CMD_TIMEOUT_MS = { 'sensor.readdress': 120000, 'net.setSensorNic': 120000, 'net.fixFirewall': 120000, 'sensor.sideCheck': 40000 };

/** Send a command; resolves with the result or rejects with the engine's error. */
export function cmd(op, args = {}) {
  if (CLEARS_HISTORY.has(op)) history.clear();
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject(new Error('not connected'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 'cmd', id, op, args }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`no answer from the engine (${op})`)); } }, CMD_TIMEOUT_MS[op] || 15000);
  });
}

// ------------------------------------------------------------------ undo / redo
// Snapshots of the profile the engine confirmed before each edit. Cleared by operations whose
// effects must never be undone by accident (load another room, apply a calibration…).
const undoStack = [], redoStack = [];
export const history = {
  undoLabel: () => undoStack.at(-1)?.label || null,
  redoLabel: () => redoStack.at(-1)?.label || null,
  clear() { undoStack.length = 0; redoStack.length = 0; emit('history'); },
};
const CLEARS_HISTORY = new Set(['profile.load', 'profile.create', 'profile.import', 'calib.apply', 'calib.clear']);

export function undo() { swap(undoStack, redoStack); }
export function redo() { swap(redoStack, undoStack); }
function swap(from, to) {
  const why = editBlocked();
  if (why) { emit('error', new Error(why)); return; }
  const e = from.pop();
  if (!e || !serverProfile) return;
  to.push({ label: e.label, profile: structuredClone(serverProfile) });
  const snap = e.profile;
  queueEdit((q) => { for (const k of Object.keys(q)) delete q[k]; Object.assign(q, structuredClone(snap)); })
    .catch((e) => emit('error', e)); // e.g. the room is locked: the engine refuses and the old state comes back
  emit('history');
}

/**
 * Edit the active profile: mutate a copy, apply locally at once, persist on the engine.
 * Edits are serialised so fast consecutive changes never race each other's revision.
 */
/** Who drives the running calibration, if it is ANOTHER device (this one is then view-only). */
export function otherControl() {
  const c = store.status?.control;
  return c && !c.gone && c.id !== store.state?.you ? c : null;
}

/** Why this device cannot edit the room right now (null = it can). */
export function editBlocked() {
  if (store.state?.locked) return 'The room is locked (Show mode). Unlock it to edit.';
  const c = otherControl();
  return c ? `Calibration in progress on ${c.device} — take control to edit.` : null;
}

export function editProfile(mutate, label = 'edit') {
  const why = editBlocked();
  if (why) { emit('error', new Error(why)); return Promise.resolve(); }
  if (serverProfile) {
    undoStack.push({ label, profile: structuredClone(serverProfile) });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    emit('history');
  }
  return queueEdit(mutate);
}

let editChain = Promise.resolve();
function queueEdit(mutate) {
  const p = structuredClone(store.state.profile);
  mutate(p);
  store.state = { ...store.state, profile: p };
  emit('state', store.state);
  const run = editChain.then(async () => {
    // Re-apply on the last profile the ENGINE confirmed (the engine broadcasts the new state
    // before it acks, so it already includes every earlier queued edit).
    const latest = structuredClone(serverProfile);
    mutate(latest);
    const res = await cmd('profile.update', { profile: latest, rev: store.state.rev });
    if (res?.rev && store.state.rev < res.rev) store.state = { ...store.state, rev: res.rev };
    return res;
  });
  editChain = run.catch(() => {});
  return run;
}
