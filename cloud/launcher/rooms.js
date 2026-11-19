// Pure logic of the room launcher: no DOM, no network, no storage. Unit-tested in tests/launcher.test.mjs.

export const ROOM_RE = /^[a-z2-7]{10}$/;
export const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const MAX_ROOMS = 50;
export const MAX_NAME = 80;

export const isRoomId = (v) => typeof v === 'string' && ROOM_RE.test(v);
export const isKey = (v) => typeof v === 'string' && KEY_RE.test(v);

/** Returns the origin of a relay URL, or null. https only; http only for localhost / 127.0.0.1 (tests). */
export function normalizeRelay(value) {
  if (typeof value !== 'string' || value.length > 300) return null;
  let u;
  try { u = new URL(value.trim()); } catch { return null; }
  if (u.username || u.password) return null;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol === 'https:') { /* ok */ }
  else if (u.protocol === 'http:' && local) { /* ok */ }
  else return null;
  if (!u.hostname) return null;
  return u.origin;
}

/** Keeps a display name short and free of control characters. Always rendered with textContent. */
export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const s = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s || null;
}

/**
 * Parses "#r=<room>&k=<key>&relay=<url>" (the leading # is optional).
 * Returns {ok:true, room, key, relay} or {ok:false, error}.
 */
export function parseHash(hash, defaultRelay) {
  if (typeof hash !== 'string' || hash.length > 1000) return { ok: false, error: 'This link is not valid.' };
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const room = p.get('r');
  const key = p.get('k');
  if (!isRoomId(room)) return { ok: false, error: 'This link has no valid room.' };
  if (!isKey(key)) return { ok: false, error: 'This link has no valid access key.' };
  const rawRelay = p.get('relay');
  const relay = normalizeRelay(rawRelay ?? defaultRelay);
  if (!relay) return { ok: false, error: rawRelay ? 'This link points to an unsafe relay address.' : 'No relay address is configured.' };
  return { ok: true, room, key, relay };
}

/** Accepts a pasted full link or just its "#..." part. */
export function parseRoomLink(text, defaultRelay) {
  if (typeof text !== 'string') return { ok: false, error: 'Paste a room link.' };
  const t = text.trim();
  const i = t.indexOf('#');
  if (i < 0) return { ok: false, error: 'Paste a room link.' };
  return parseHash(t.slice(i), defaultRelay);
}

/** Status check. The key is never part of it (the function does not even accept one). */
export function statusUrl(relay, room) {
  const base = normalizeRelay(relay);
  if (!base || !isRoomId(room)) return null;
  return `${base}/_relay/status?room=${encodeURIComponent(room)}`;
}

/** Address that opens the room's own UI through the relay (the relay sets its cookie from ?k=). */
export function openUrl(relay, room, key) {
  const base = normalizeRelay(relay);
  if (!base || !isRoomId(room) || !isKey(key)) return null;
  return `${base}/r/${room}/?k=${encodeURIComponent(key)}`;
}

/** Validates one stored entry; returns a clean copy or null. */
export function sanitizeRoom(r) {
  if (!r || typeof r !== 'object') return null;
  const relay = normalizeRelay(r.relay);
  if (!isRoomId(r.room) || !isKey(r.key) || !relay) return null;
  return {
    room: r.room, key: r.key, relay,
    name: cleanName(r.name),
    lastOpened: Number.isFinite(r.lastOpened) ? r.lastOpened : 0,
  };
}

/** Sanitizes a stored list: drops bad entries and duplicates, newest first. */
export function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const c = sanitizeRoom(r);
    if (!c || seen.has(c.room)) continue;
    seen.add(c.room);
    out.push(c);
  }
  return out.sort((a, b) => b.lastOpened - a.lastOpened).slice(0, MAX_ROOMS);
}

/** Adds or updates a room (matched by id). A missing name keeps the one already saved. */
export function mergeRoom(list, entry) {
  const clean = sanitizeRoom(entry);
  const base = sanitizeList(list);
  if (!clean) return base;
  const prev = base.find((r) => r.room === clean.room);
  const merged = { ...clean, name: clean.name || (prev && prev.name) || null };
  return sanitizeList([merged, ...base.filter((r) => r.room !== clean.room)]);
}

export function forgetRoom(list, room) {
  return sanitizeList(list).filter((r) => r.room !== room);
}

export function displayName(r) {
  return (r && r.name) || 'Room ' + (r ? r.room : '');
}
