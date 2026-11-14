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
if (params.has('k')) history.replaceState(null, '', location.pathname); // keep the key out of screenshots

export const isCoarse = matchMedia('(pointer:coarse)').matches;
let ws = null, nextId = 1, retry = 0;
let serverProfile = null;
const pending = new Map();
const isProjection = location.pathname.startsWith('/projection');
const role = isProjection ? 'projection' : params.get('role') || 'ui';
let wantViz = !isProjection;

function url() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = new URLSearchParams({ role });
  if (key) q.set('k', key);
  return `${proto}://${location.host}/ws/ui?${q}`;
}

export function connect() {
  ws = new WebSocket(url());
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    retry = 0;
    store.connected = true;
    sendHello();
    emit('connection', true);
  };
  ws.onclose = () => {
    store.connected = false;
    emit('connection', false);
    for (const p of pending.values()) p.reject(new Error('connection lost'));
    pending.clear();
    setTimeout(connect, Math.min(5000, 300 * 2 ** retry++));
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return onViz(ev.data);
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'state': store.state = m; serverProfile = m.profile; emit('state', m); break;
      case 'status': store.status = m; emit('status', m); break;
      case 'live':
        store.live = m;
        if ('calib' in m) {
          const had = !!store.status?.calib;
          store.status = { ...(store.status || {}), calib: m.calib };
          if (m.calib || had) emit('calib');
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

/** Send a command; resolves with the result or rejects with the engine's error. */
export function cmd(op, args = {}) {
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject(new Error('not connected'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 'cmd', id, op, args }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); } }, 15000);
  });
}

/**
 * Edit the active profile: mutate a copy, apply locally at once, persist on the engine.
 * Edits are serialised so fast consecutive changes never race each other's revision.
 */
let editChain = Promise.resolve();
export function editProfile(mutate) {
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
