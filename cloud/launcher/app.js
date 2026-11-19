import { DEFAULT_RELAY } from './config.js';
import {
  parseHash, parseRoomLink, statusUrl, openUrl, mergeRoom, forgetRoom, sanitizeList, cleanName, displayName,
} from './rooms.js';

const $ = (id) => document.getElementById(id);
const STORE = 'veation-touch-rooms';
const RETRY_MS = 10000;
const POLL_MS = 15000;
let timer = null;

// ---------- storage (every access guarded) ----------
function load() {
  try { return sanitizeList(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* private mode: keep working */ }
}

// ---------- network ----------
async function checkStatus(relay, room) {
  const url = statusUrl(relay, room);
  if (!url) return { online: false, name: null, failed: true };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!res.ok) return { online: false, name: null, failed: true };
    const j = await res.json();
    return { online: !!j && j.online === true, name: cleanName(j && j.name), failed: false };
  } catch {
    return { online: false, name: null, failed: true };
  } finally { clearTimeout(t); }
}

function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } }

// ---------- opening a room ----------
function showOpening(msg, { attn = false, retry = false, back = false } = {}) {
  $('list-view').hidden = true;
  $('opening').hidden = false;
  const m = $('opening-msg');
  m.textContent = msg;
  m.className = 'msg' + (attn ? ' attn' : '');
  $('retry').hidden = !retry;
  $('back').hidden = !back;
}

async function openRoom(entry) {
  stopTimer();
  showOpening(`Checking ${displayName(entry)}…`);
  const st = await checkStatus(entry.relay, entry.room);
  const name = st.name || entry.name;
  entry = { ...entry, name };
  if (name) save(mergeRoom(load(), entry));
  if (st.online) {
    save(mergeRoom(load(), { ...entry, lastOpened: Date.now() }));
    showOpening(`Opening ${displayName(entry)}…`);
    const url = openUrl(entry.relay, entry.room, entry.key);
    if (url) location.replace(url);
    return;
  }
  showOpening(`${displayName(entry)} is offline — its server must be on and connected to the internet.`, { attn: true, retry: true, back: true });
  $('retry').onclick = () => openRoom(entry);
  $('back').onclick = () => { stopTimer(); showList(); };
  timer = setTimeout(() => openRoom(entry), RETRY_MS);
}

// ---------- list ----------
const statuses = new Map(); // room -> 'on' | 'off'
let confirming = null;

function button(text, cls, fn) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = fn;
  return b;
}

function renderList() {
  const rooms = load();
  const ul = $('rooms');
  ul.textContent = '';
  $('empty').hidden = rooms.length > 0;
  for (const r of rooms) {
    const li = document.createElement('li');
    li.className = 'room';
    const s = statuses.get(r.room);
    const top = document.createElement('div'); top.className = 'room-top';
    const dot = document.createElement('span'); dot.className = 'dot ' + (s === 'on' ? 'on' : s === 'off' ? '' : 'unk');
    const nm = document.createElement('span'); nm.className = 'room-name'; nm.textContent = displayName(r);
    const st = document.createElement('span'); st.className = 'room-state ' + (s || '');
    st.textContent = s === 'on' ? 'Online' : s === 'off' ? 'Offline' : 'Checking…';
    top.append(dot, nm, st);
    li.append(top);
    const row = document.createElement('div'); row.className = 'row';
    if (confirming === r.room) {
      const c = document.createElement('div'); c.className = 'confirm';
      const p = document.createElement('p'); p.textContent = `Forget ${displayName(r)}? You will need its link again to reopen it.`;
      row.append(
        button('Forget', 'btn warn', () => { save(forgetRoom(load(), r.room)); statuses.delete(r.room); confirming = null; renderList(); }),
        button('Cancel', 'btn', () => { confirming = null; renderList(); }),
      );
      c.append(p, row); li.append(c);
    } else {
      row.append(
        button('Open', 'btn primary', () => openRoom(r)),
        button('Forget', 'btn', () => { confirming = r.room; renderList(); }),
      );
      li.append(row);
    }
    ul.append(li);
  }
}

async function pollAll() {
  await Promise.all(load().map(async (r) => {
    const st = await checkStatus(r.relay, r.room);
    statuses.set(r.room, st.online ? 'on' : 'off');
    if (st.name && st.name !== r.name) save(mergeRoom(load(), { ...r, name: st.name }));
  }));
  if (!$('list-view').hidden) renderList();
}

function schedulePoll() {
  stopTimer();
  timer = setTimeout(async () => { await pollAll(); if (!$('list-view').hidden) schedulePoll(); }, POLL_MS);
}

function showList() {
  $('opening').hidden = true;
  $('list-view').hidden = false;
  renderList();
  pollAll().then(() => { if (!$('list-view').hidden) schedulePoll(); });
}

$('paste').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('paste-err');
  const res = parseRoomLink($('link').value, DEFAULT_RELAY);
  if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
  err.hidden = true;
  $('link').value = '';
  const entry = { room: res.room, key: res.key, relay: res.relay, name: null, lastOpened: Date.now() };
  save(mergeRoom(load(), entry));
  openRoom(load().find((r) => r.room === res.room) || entry);
});

// ---------- start ----------
function start() {
  const hash = location.hash;
  if (hash && hash.length > 1) {
    const res = parseHash(hash, DEFAULT_RELAY);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
    if (!res.ok) { showOpening(res.error, { attn: true, back: true }); $('back').onclick = showList; return; }
    const entry = { room: res.room, key: res.key, relay: res.relay, name: null, lastOpened: Date.now() };
    save(mergeRoom(load(), entry));
    openRoom(load().find((r) => r.room === res.room) || entry);
    return;
  }
  showList();
}
start();
