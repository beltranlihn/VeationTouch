// The hand-off between parts (director 26-11, Beltrán: «que las transiciones sucedan dentro del mismo mundo»): one instance per page
// (an ES module is evaluated once), so the part that leaves can leave its matter in the air as dust and the part that comes can take it
// and build itself out of it — the same particles in the same place, no gap, no load/unload.
//
//   put(key, { positions: Float32Array (xyz per source, room frame), colors?: Float32Array (rgb per source), count })
//   take(key) → that record, once (it is marked claimed); null if there is none or it was taken
//   claimed(key) → true once taken: the leaving part hides itself then (in the same frame the new one starts from it)
//   peek(key), clear(key)
// Keys used: 'pinya' (pinya3d2 → torre3d: its beings' dust), 'castells' (castells3d → whoever comes next: its dust).
const store = new Map();
export function put(key, rec) { store.set(key, { ...rec, at: typeof performance !== 'undefined' ? performance.now() : Date.now(), claimed: false }); }
export function take(key) { const r = store.get(key); if (!r || r.claimed) return null; r.claimed = true; return r; }
export function claimed(key) { const r = store.get(key); return !!(r && r.claimed); }
export function peek(key) { return store.get(key) || null; }
export function clear(key) { store.delete(key); }
