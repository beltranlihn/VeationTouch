// Shows (MEDIA-SERVER.md §4.2): normalizeShow as the single gate, inheritance from the layer, versions in the store,
// the profile's `media` and `audio.media`, and show edits through the engine (revision, Show mode). Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeShow, blankShow, newClip, clipSettings, libraryPath, withoutMedia } from '../engine/media/show.js';
import { normalizeProfile, normAudio } from '../engine/profile.js';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vt-show-'));

const video = { fourcc: 'Hap1', width: 256, height: 32, fps: 30, frames: 300, duration: 10 };
const med = (id, file, extra = {}) => ({ id, file, size: 1000, fingerprint: 'a'.repeat(40), video, audio: null, ...extra });

// ---------------------------------------------------------------------------------------------- normalizeShow

// Fails if an empty or half-built show is not completed (a UI would have no layer to drop into), or if normalising
// twice changes anything (every load would rewrite the file and add a version).
test('show: defaults (three layers, one Main deck of eight columns) and normalising twice changes nothing', () => {
  const s = normalizeShow({ name: 'Reel' }, { canvas: { width: 7196, height: 912 } });
  assert.equal(s.schema, 1);
  assert.equal(s.id, 'reel');
  assert.deepEqual(s.canvas, { width: 7196, height: 912 }, 'a new show takes the room canvas');
  assert.deepEqual(s.layers.map((l) => [l.id, l.name, l.end, l.trigger, l.transitionMs]), [['L1', 'Layer 1', 'loop', 'restart', 500], ['L2', 'Layer 2', 'loop', 'restart', 500], ['L3', 'Layer 3', 'loop', 'restart', 500]]);
  assert.deepEqual(s.decks, [{ id: 'D1', name: 'Main', columns: 8, cells: {} }]);
  assert.deepEqual(s.start, { presetId: null, deckId: 'D1', column: null });
  assert.deepEqual(normalizeShow(s), s);
  const full = normalizeShow({
    name: 'Full', media: [med('m1', 'full/a.mov', { audio: { format: 's16le', codec: 'sowt', supported: true, channels: 2, rate: 48000, frames: 480000, duration: 10 } })],
    clips: [{ id: 'c1', mediaId: 'm1', in: 2, out: 8, loops: 3, end: 'bounce', color: '#AABBCC' }],
    decks: [{ id: 'D1', cells: { 'L2:3': 'c1' } }], presets: [{ id: 'p1', experienceId: 'alma-fluid', params: { quality: 'ultra' }, media: { reel: 'c1' } }],
    start: { presetId: 'p1', deckId: 'D1', column: 3 },
  });
  assert.deepEqual(normalizeShow(full), full);
  assert.equal(full.clips[0].color, '#aabbcc');
  assert.deepEqual([full.clips[0].in, full.clips[0].out], [2, 8]);
  assert.equal(full.media[0].audio.supported, true);
});

// Fails if two items can share an id (a cell or a launch would hit the wrong one).
test('show: ids are made valid and unique in every list', () => {
  const s = normalizeShow({
    media: [med('m1', 'x/a.mov'), med('m1', 'x/b.mov'), med('bad id!', 'x/c.mov')],
    clips: [{ id: 'c1', mediaId: 'm1' }, { id: 'c1', mediaId: 'm1' }],
    layers: [{ id: 'L1' }, { id: 'L1' }, {}],
    decks: [{ id: 'D' }, { id: 'D' }],
    presets: [{ id: 'p' }, { id: 'p' }],
  });
  for (const k of ['media', 'clips', 'layers', 'decks', 'presets']) {
    const ids = s[k].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `${k}: ${ids}`);
    assert.ok(ids.every((i) => /^[A-Za-z0-9_-]{1,40}$/.test(i)), `${k}: ${ids}`);
  }
  assert.equal(s.media.length, 3);
});

// Fails if a dangling reference survives: a cell pointing at a clip (or layer) that does not exist, or a clip whose
// medium is gone, would make a launch fail in the room instead of at load.
test('show: cells pointing at missing clips or layers go; clips without their medium go, and their cells with them', () => {
  const s = normalizeShow({
    media: [med('m1', 'x/a.mov'), { id: 'm2', file: 'x/b.mov', video: { fourcc: 'avc1' } }], // m2 is not HAP: dropped
    clips: [{ id: 'c1', mediaId: 'm1' }, { id: 'c2', mediaId: 'm2' }, { id: 'c3', mediaId: 'nope' }],
    decks: [{ id: 'D1', cells: { 'L1:0': 'c1', 'L1:1': 'c2', 'L2:0': 'c3', 'L1:2': 'ghost', 'L9:0': 'c1', 'L1:x': 'c1', 'L1:300': 'c1', 'L3:12': 'c1' } }],
    presets: [{ id: 'p1', media: { reel: 'c2', projects: ['c1', 'c3', 'ghost'] } }],
  });
  assert.deepEqual(s.media.map((m) => m.id), ['m1']);
  assert.deepEqual(s.clips.map((c) => c.id), ['c1']);
  assert.deepEqual(s.decks[0].cells, { 'L1:0': 'c1', 'L3:12': 'c1' });
  assert.equal(s.decks[0].columns, 13, 'the grid grows to hold its last column');
  assert.deepEqual(s.presets[0].media, { projects: ['c1'] });
  const after = withoutMedia(s, ['m1']);
  assert.deepEqual([after.media, after.clips, after.decks[0].cells, after.presets[0].media], [[], [], {}, { projects: [] }]);
});

// Fails if a show can point outside the library: the PCM route and the copy would then read any file of the machine.
test('show: media paths stay inside the library (no drive, root, .., alternate stream)', () => {
  for (const bad of ['C:/Windows/x.mov', '/etc/x.mov', '../x.mov', 'a/../../x.mov', 'a/./x.mov', 'a/x.mov:stream', 'a//x.mov', '\\\\server\\x.mov', 'a/x.mov.', '']) {
    assert.equal(libraryPath(bad), null, bad);
  }
  assert.equal(libraryPath('show\\Reel 2026.mov'), 'show/Reel 2026.mov');
  assert.equal(libraryPath('./show/a.mov'), 'show/a.mov');
  assert.deepEqual(normalizeShow({ media: [med('m1', '../../x.mov')] }).media, []);
});

// MEDIA-SERVER.md §2.2, the Resolume bug: "play once and hold" set on a layer did not reach clips imported into it
// afterwards. Fails if a new clip takes hard-coded defaults (end 'loop' / trigger 'restart' / 500 ms) instead of its
// layer's, or if it copies the layer's values once (a later change of the layer must reach it: "Layer Determined").
test('show: a new clip takes its layer\'s settings, now and after the layer changes; a clip with audio on a looping layer plays once', () => {
  const s = normalizeShow({ layers: [{ id: 'L1' }, { id: 'L2', end: 'hold', trigger: 'toggle', transitionMs: 1200, audio: { route: 'mono' } }], media: [med('m1', 'x/a.mov')] });
  const silent = s.media[0];
  const c = newClip(s, silent, 'L2');
  s.clips.push(c);
  const L2 = s.layers[1];
  assert.deepEqual(clipSettings(c, L2), { end: 'hold', trigger: 'toggle', transitionMs: 1200, loops: 1, route: 'mono' });
  L2.end = 'next'; L2.transitionMs = 3000;
  assert.deepEqual([clipSettings(c, L2).end, clipSettings(c, L2).transitionMs], ['next', 3000], 'the layer\'s change reaches the clip');
  assert.equal(clipSettings(normalizeShow(s).clips[0], L2).end, 'next', 'and survives a save');
  const reel = { ...silent, audio: { format: 's16le', supported: true, channels: 2, rate: 48000 } };
  assert.equal(clipSettings(newClip(s, reel, 'L1'), s.layers[0]).end, 'clear', 'a reel on a looping layer does not repeat on its own');
  assert.equal(clipSettings(newClip(s, reel, 'L2'), L2).end, 'next', 'any other layer ending is inherited, audio or not');
  assert.equal(clipSettings(newClip(s, silent, 'L1'), s.layers[0]).end, 'loop');
  assert.notEqual(newClip(s, silent, 'L1').id, c.id, 'a new id');
});

// ---------------------------------------------------------------------------------------------- store

// Fails if saving a show does not keep the previous file as a version, or if restoring does not bring it back.
test('store: shows are saved atomically with versions that list and restore, apart from the profiles', async () => {
  const dir = tmp();
  try {
    const store = new Store(dir, null, quiet);
    store.saveShow(blankShow('Night', { id: 'night' }));
    await new Promise((r) => setTimeout(r, 10));
    store.saveShow({ ...store.loadShow('night'), name: 'Night 2' });
    await new Promise((r) => setTimeout(r, 10));
    store.saveShow({ ...store.loadShow('night'), name: 'Night 3' });
    assert.deepEqual(store.listShows(), [{ id: 'night', name: 'Night 3', media: 0, clips: 0 }]);
    const v = store.listShowVersions('night');
    assert.deepEqual(v.map((x) => x.name), ['Night 2', 'Night'], 'newest first');
    assert.match(v[0].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    store.restoreShowVersion('night', v[1].version);
    assert.equal(store.loadShow('night').name, 'Night');
    assert.equal(store.listShowVersions('night')[0].name, 'Night 3', 'the replaced one became a version');
    store.saveShow({ ...store.loadShow('night'), name: 'Quiet' }, { backup: false });
    assert.equal(store.listShowVersions('night').length, 3, 'bookkeeping saves add no version');
    assert.deepEqual(store.listVersions('night'), [], 'profile versions are elsewhere');
    assert.throws(() => store.restoreShowVersion('night', '../x.json'), /invalid/);
    assert.throws(() => store.loadShow('../x'), /invalid show id/);
    fs.writeFileSync(path.join(dir, 'shows', 'night.json'), '{ broken');
    assert.equal(store.loadShow('night').name, 'Night 3', 'a corrupt file falls back to its newest version');
    assert.equal(store.uniqueShowId('Night'), 'night-2');
    assert.equal(store.mediaDir(store.loadSettings()), path.join(dir, 'media'), 'the library is <data>/media by default');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------- profile

// Fails if a profile saved before the media server changes behaviour or loses the new blocks on a round trip
// (migration by presence, as migrateRoomOutput), or if the values are not clamped.
test('profile: media and audio.media get defaults when absent, are clamped, and survive normalising twice', () => {
  const walls = [{ id: 'A', width: 4, height: 3 }, { id: 'B', width: 4, height: 3 }];
  const old = normalizeProfile({ name: 'old room', walls });
  assert.deepEqual(old.media, { showId: null, autostart: true });
  assert.deepEqual(old.audio.media, { level: 1, avOffsetMs: 0, route: 'auto', width: 0.6, front: 'A', matrix: null, duckDb: -60 });
  const p = normalizeProfile({ name: 'x', walls, media: { showId: 'bad id!', autostart: 'yes' },
    audio: { channels: 3, media: { level: 4, avOffsetMs: -900, route: 'surround', width: -1, front: 'ZZ', duckDb: 5, matrix: [[0, -100, 'x', 9, 1, 2], [null, null]] } } });
  assert.deepEqual(p.media, { showId: null, autostart: true });
  assert.deepEqual(p.audio.media, { level: 1, avOffsetMs: -200, route: 'auto', width: 0, front: 'A', matrix: [[0, -60, null]], duckDb: 0 });
  const q = normalizeProfile({ name: 'y', walls, media: { showId: 'alma-reel', autostart: false }, audio: { media: { route: 'matrix', front: 'B', width: 0.25 } } });
  assert.deepEqual(q.media, { showId: 'alma-reel', autostart: false });
  assert.deepEqual([q.audio.media.route, q.audio.media.front, q.audio.media.width], ['matrix', 'B', 0.25]);
  assert.deepEqual(normalizeProfile(q), q);
  assert.deepEqual(normAudio(q.audio, q.walls), q.audio);
});

// ---------------------------------------------------------------------------------------------- engine

// Fails if an edit made on a stale copy overwrites a newer one (two devices editing), if the media list can be
// changed by an edit (only the library may add files), or if Show mode lets show management through.
test('engine: show edits carry a revision, cannot touch the media list, and are refused in Show mode', async () => {
  const dir = tmp();
  const engine = new Engine({ store: new Store(dir, null, quiet), log: quiet, version: 'test' });
  engine.start();
  try {
    assert.equal(engine.state().show, null, 'a room starts without a show');
    const { id } = await engine.command('show.create', { name: 'Gallery' });
    assert.equal(engine.profile.media.showId, id, 'the room plays the new show');
    assert.equal(engine.store.loadProfile(engine.profile.id).media.showId, id, 'and it is saved in the profile');
    const st = engine.state();
    assert.equal(st.show.id, id);
    assert.ok(Number.isInteger(st.show.rev));
    assert.deepEqual([st.media.import, st.media.problems], [[], []]); // (state.media also carries the transport since F4)
    assert.equal(st.library.dir, path.join(dir, 'media'));
    const rev = st.show.rev;
    const edited = { ...st.show, name: 'Gallery A', layers: [...st.show.layers, { name: 'Top' }], media: [med('m9', 'elsewhere/evil.mov')] };
    const r = await engine.command('show.update', { show: edited, rev });
    assert.notEqual(r.rev, rev);
    assert.equal(engine.state().show.name, 'Gallery A');
    assert.equal(engine.state().show.layers.length, 4);
    assert.deepEqual(engine.state().show.media, [], 'an edit cannot add a file to the show');
    await assert.rejects(engine.command('show.update', { show: { ...edited, name: 'Old copy' }, rev }), /^Error: stale/);
    assert.equal(engine.state().show.name, 'Gallery A');
    assert.equal(engine.store.listShowVersions(id).length, 1);
    await engine.command('show.create', { name: 'Second' });
    await assert.rejects(engine.command('show.delete', { id: engine.profile.media.showId }), /open show/);
    await engine.command('show.load', { id });
    assert.equal(engine.state().show.name, 'Gallery A');
    await engine.command('app.lock', { locked: true });
    for (const [op, args] of [['show.update', { show: edited }], ['show.load', { id }], ['show.create', { name: 'x' }], ['show.delete', { id: 'second' }],
      ['show.export', { id }], ['show.import', { json: edited }], ['show.restore', { version: 'x.json' }], ['media.import', { paths: [path.join(dir, 'a.mov')], __local: true }],
      ['media.importCancel', { id: 'i1' }], ['media.relink', { dir, __local: true }], ['media.remove', { mediaId: 'm1' }], ['media.setDir', { dir, __local: true }]]) {
      await assert.rejects(engine.command(op, args), /locked \(Show mode\)/, op);
    }
    assert.equal((await engine.command('show.versions', {})).versions.length, 1, 'reading the versions is not an edit');
    assert.ok((await engine.command('show.list', {})).shows.length === 2);
    await engine.command('app.lock', { locked: false });
    await engine.command('show.delete', { id: 'second' });
    assert.deepEqual((await engine.command('show.list', {})).shows.map((s) => s.id), [id]);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
