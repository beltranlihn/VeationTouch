import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseHash, parseRoomLink, statusUrl, openUrl, normalizeRelay, mergeRoom, forgetRoom, sanitizeList,
  isRoomId, isKey, cleanName,
} from '../cloud/launcher/rooms.js';

const ROOM = 'abcdefg234';
const KEY = 'Zk3_-aB9xQ7mPq2w';
const RELAY = 'https://relay.example.workers.dev';
const DEF = 'https://default.example.workers.dev';

test('room ids and keys are validated', () => {
  assert.ok(isRoomId(ROOM));
  for (const bad of ['', 'abcdefg23', 'abcdefg2345', 'ABCDEFG234', 'abcdefg18!', 'abcdefg01a', null, 5]) assert.equal(isRoomId(bad), false, String(bad));
  assert.ok(isKey(KEY));
  for (const bad of ['', 'short', 'has space 12345', 'a/b?c=d&e=1234', 'x'.repeat(129), null]) assert.equal(isKey(bad), false, String(bad));
});

test('relay: https only, http only for localhost and 127.0.0.1', () => {
  assert.equal(normalizeRelay(RELAY + '/'), RELAY);
  assert.equal(normalizeRelay('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(normalizeRelay('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  for (const bad of ['http://relay.example.com', 'http://localhost.evil.com', 'ftp://x.com', 'javascript:alert(1)',
    'https://user:pw@relay.example.com', 'relay.example.com', '', null, 'https://']) assert.equal(normalizeRelay(bad), null, String(bad));
});

test('parseHash accepts a good link, with and without relay=', () => {
  const a = parseHash(`#r=${ROOM}&k=${KEY}&relay=${encodeURIComponent(RELAY)}`, DEF);
  assert.deepEqual(a, { ok: true, room: ROOM, key: KEY, relay: RELAY });
  const b = parseHash(`r=${ROOM}&k=${KEY}`, DEF);
  assert.equal(b.relay, DEF);
});

test('parseHash rejects bad input', () => {
  const cases = [
    '', '#', '#r=&k=', `#k=${KEY}`, `#r=${ROOM}`,
    `#r=BAD&k=${KEY}`, `#r=${ROOM}&k=no`, `#r=${ROOM}&k=${KEY}%20x`,
    `#r=${ROOM}&k=${KEY}&relay=${encodeURIComponent('http://evil.example.com')}`,
    `#r=${ROOM}&k=${KEY}&relay=${encodeURIComponent('javascript:alert(1)')}`,
    '#' + 'a'.repeat(2000),
  ];
  for (const c of cases) assert.equal(parseHash(c, DEF).ok, false, c);
  assert.equal(parseHash(`#r=${ROOM}&k=${KEY}`, 'http://insecure.example.com').ok, false);
  assert.equal(parseHash(null, DEF).ok, false);
});

test('parseRoomLink takes a full pasted URL', () => {
  const r = parseRoomLink(`  https://site.vercel.app/#r=${ROOM}&k=${KEY}&relay=${encodeURIComponent(RELAY)}  `, DEF);
  assert.equal(r.ok, true);
  assert.equal(r.room, ROOM);
  assert.equal(parseRoomLink('https://site.vercel.app/', DEF).ok, false);
  assert.equal(parseRoomLink(42, DEF).ok, false);
});

test('the key never goes into the status query', () => {
  const u = statusUrl(RELAY, ROOM);
  assert.equal(u, `${RELAY}/_relay/status?room=${ROOM}`);
  assert.ok(!u.includes(KEY) && !/[?&]k=/.test(u));
  assert.equal(statusUrl('http://evil.example.com', ROOM), null);
  assert.equal(statusUrl(RELAY, 'bad'), null);
  // statusUrl takes no key at all: a third argument cannot leak into it
  assert.ok(!statusUrl(RELAY, ROOM, KEY).includes(KEY));
  // and the page code never builds a status URL from anything but (relay, room)
  const app = fs.readFileSync(new URL('../cloud/launcher/app.js', import.meta.url), 'utf8');
  for (const m of app.matchAll(/statusUrl\(([^)]*)\)/g)) assert.ok(!/key/i.test(m[1]), m[0]);
});

test('openUrl carries the key once, encoded, and refuses unsafe input', () => {
  assert.equal(openUrl(RELAY, ROOM, KEY), `${RELAY}/r/${ROOM}/?k=${encodeURIComponent(KEY)}`);
  assert.equal(openUrl('http://relay.example.com', ROOM, KEY), null);
  assert.equal(openUrl(RELAY, 'bad', KEY), null);
  assert.equal(openUrl(RELAY, ROOM, 'a b'), null);
  assert.equal(openUrl('http://localhost:8787', ROOM, KEY), `http://localhost:8787/r/${ROOM}/?k=${KEY}`);
});

test('mergeRoom upserts, keeps the saved name, orders newest first, drops invalid', () => {
  const e = (room, extra = {}) => ({ room, key: KEY, relay: RELAY, name: null, lastOpened: 1, ...extra });
  let l = mergeRoom([], e(ROOM, { name: 'XR Lab', lastOpened: 5 }));
  l = mergeRoom(l, e('bbbbbbbbbb', { lastOpened: 9 }));
  assert.deepEqual(l.map((r) => r.room), ['bbbbbbbbbb', ROOM]);
  l = mergeRoom(l, e(ROOM, { name: null, lastOpened: 20 }));
  assert.equal(l.length, 2);
  assert.equal(l[0].room, ROOM);
  assert.equal(l[0].name, 'XR Lab');
  assert.equal(mergeRoom(l, { room: 'bad', key: KEY, relay: RELAY }).length, 2);
  assert.equal(mergeRoom(l, e('cccccccccc', { relay: 'http://evil.example.com' })).length, 2);
});

test('stored data from localStorage is sanitized', () => {
  const dirty = [null, 'x', { room: ROOM, key: KEY, relay: 'http://evil.example.com' },
    { room: ROOM, key: KEY, relay: RELAY, name: '  A\u0000\nB  ', lastOpened: 'x' }, { room: ROOM, key: KEY, relay: RELAY }];
  const clean = sanitizeList(dirty);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].name, 'A B');
  assert.equal(clean[0].lastOpened, 0);
  assert.deepEqual(sanitizeList('nope'), []);
  assert.equal(cleanName('x'.repeat(500)).length, 80);
});

test('forgetRoom removes only that room', () => {
  const l = mergeRoom(mergeRoom([], { room: ROOM, key: KEY, relay: RELAY }), { room: 'bbbbbbbbbb', key: KEY, relay: RELAY });
  assert.deepEqual(forgetRoom(l, ROOM).map((r) => r.room), ['bbbbbbbbbb']);
});

test('vercel.json sets the security headers', () => {
  const v = JSON.parse(fs.readFileSync(new URL('../cloud/launcher/vercel.json', import.meta.url), 'utf8'));
  assert.equal(v.cleanUrls, true);
  const h = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
  assert.match(h['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(h['Content-Security-Policy'], /style-src 'self'(;|$)/);
  assert.equal(h['Referrer-Policy'], 'no-referrer');
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
});
