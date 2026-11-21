// The media library in the engine (MEDIA-SERVER.md §4d, phase F2): validation with the exact messages of §4d.3, the
// copy into the library in a worker (.part, resume, cancel), fingerprints, free space, missing files and Locate…, the
// thumbnail and PCM routes (and who may use them), and the 60 Hz loop during a copy. Node only; every file is made
// in a temp folder (tests/fixtures/media/make-hap.mjs) and read through tests/fixtures/media/fake-source.mjs when a
// drive has to be pulled, slow or large.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { MediaEngine } from '../engine/media/index.js';
import { INTERRUPTED } from '../engine/media/library.js';
import { startRelay } from '../cloud/relay/node-relay.mjs';
import { makeHap } from './fixtures/media/make-hap.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const FAKE = pathToFileURL(path.join(import.meta.dirname, 'fixtures', 'media', 'fake-source.mjs')).href;
const MB = 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, what = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** A movie made larger by a trailing `free` atom (the moov comes before it, so it stays valid), `extra` bytes long. */
function padded(bytes, extra, seed = 1) {
  const tail = Buffer.alloc(extra);
  tail.writeUInt32BE(extra, 0); tail.write('free', 4, 'latin1');
  let x = seed >>> 0 || 1;
  for (let i = 8; i < extra; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; tail[i] = x >>> 24; }
  return Buffer.concat([Buffer.from(bytes), tail]);
}
/** A movie of exactly `size` bytes. */
const sized = (bytes, size, seed) => padded(bytes, size - bytes.length, seed);

/** A media engine on a temp data folder, as the engine builds it, for a room whose canvas is 256×32. */
function rig(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-lib-'));
  const usb = path.join(dir, 'usb');
  fs.mkdirSync(usb);
  const store = new Store(path.join(dir, 'data'), null, quiet);
  const settings = store.loadSettings();
  let profile = normalizeProfile({ name: 'Test room', canvas: { width: 256, height: 32 }, walls: [{ id: 'W1', width: 4, height: 2.5, pixelRect: { x: 0, y: 0, w: 256, h: 32 } }] });
  let media;
  const make = () => {
    media = new MediaEngine({
      store, log: quiet, settings, profile: () => profile, sourceOpener: FAKE, checkMs: 3600000, ...opts,
      setShowId: (id) => { profile = normalizeProfile({ ...profile, media: { ...profile.media, showId: id } }); media.profileChanged(profile); },
    });
    media.profileChanged(profile);
    media.start();
    return media;
  };
  make();
  return {
    dir, usb, store, settings,
    get media() { return media; },
    restart: async () => { await media.stop(); return make(); },
    close: async () => { await media.stop(); fs.rmSync(dir, { recursive: true, force: true }); },
    file: (name, bytes) => { const f = path.join(usb, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; },
    import: (paths, target = null) => media.importFiles(paths, target, { __local: true }),
    jobs: () => [...media.jobs.values()],
    lib: (file) => path.join(media.libraryDir, ...file.split('/')),
  };
}

// ---------------------------------------------------------------------------------------------- copy

// Fails if the copy writes straight to the final name (a half-copied file would look complete and be played), if
// the show does not reference the file by a path relative to the library, if there is no thumbnail, or if a
// cancelled import leaves a .part, its sidecar, a library file or a clip behind.
test('import: the copy goes to <name>.part and is renamed when complete; the show points at it relatively, with a thumbnail; cancelling leaves nothing', async () => {
  const r = rig({ sourceOptions: { delayMs: 150 } }); // 150 ms per block read: a copy that can be watched
  try {
    const bytes = padded(makeHap({ frames: 6 }).bytes, 20 * MB);
    const f = r.file('Reel 2026.mov', bytes);
    const res = await r.import([f], { layerId: 'L1', column: 2 });
    assert.deepEqual(res.rejected, []);
    assert.equal(res.accepted.length, 1);
    const a = res.accepted[0];
    assert.deepEqual([a.reused, a.copying, a.warnings], [false, true, []]);
    const show = r.media.show, m = show.media[0];
    assert.equal(m.file, `${show.id}/Reel 2026.mov`, 'a path relative to the library, one folder per show');
    assert.equal(show.decks[0].cells['L1:2'], a.clipId, 'the clip is in the grid at once, while the copy runs');
    assert.equal(show.clips[0].name, 'Reel 2026');
    assert.equal(r.store.loadShow(show.id).media[0].file, m.file, 'and it is saved');
    const final = r.lib(m.file);
    const job = await until(() => r.jobs().find((j) => j.state === 'copying' && j.done > 0), 15000, 'the copy to start');
    assert.ok(fs.existsSync(`${final}.part`), 'the bytes go to the .part');
    assert.ok(!fs.existsSync(final), 'the final name does not exist before the copy is complete');
    assert.equal(r.media.mediaState().import[0].state, 'copying');
    assert.ok(r.media.mediaState().import[0].total === bytes.length);
    await until(() => job.state === 'done', 20000, 'the copy to end');
    assert.ok(!fs.existsSync(`${final}.part`) && !fs.existsSync(`${final}.part.json`));
    assert.ok(Buffer.from(fs.readFileSync(final)).equals(bytes), 'the library file is the source');
    assert.ok(r.media.show.media[0].mtimeMs > 0, 'the library file\'s time is recorded');
    for (const w of [160, 480]) {
      const png = fs.readFileSync(path.join(r.store.thumbsDir, `${m.fingerprint}-${w}.png`));
      assert.equal(png.readUInt32BE(16), w, `${w} px thumbnail`);
    }

    // cancel in the middle of a copy
    const second = r.file('Second.mov', padded(makeHap({ frames: 7 }).bytes, 24 * MB, 7));
    const res2 = await r.import([second], { layerId: 'L2' });
    const mid = res2.accepted[0].mediaId, dst = r.lib(r.media.show.media.find((x) => x.id === mid).file);
    const j2 = await until(() => r.jobs().find((j) => j.mediaId === mid && j.state === 'copying' && j.done > 0), 15000, 'the second copy');
    assert.ok(fs.existsSync(`${dst}.part`));
    await r.media.cancelImport(j2.id);
    assert.ok(!fs.existsSync(`${dst}.part`) && !fs.existsSync(`${dst}.part.json`) && !fs.existsSync(dst), 'no .part, no sidecar, no file');
    assert.deepEqual(fs.readdirSync(path.dirname(dst)), ['Reel 2026.mov'], 'the library folder holds only the finished copy');
    assert.ok(!r.media.show.media.some((x) => x.id === mid), 'the medium left the show');
    assert.ok(!r.media.show.clips.some((c) => c.mediaId === mid) && !Object.keys(r.media.show.decks[0].cells).some((k) => k.startsWith('L2:')), 'and its clip and cell');
    assert.ok(!r.jobs().some((j) => j.id === j2.id));
  } finally { await r.close(); }
});

// §4d.3 step 6. Fails if a read error deletes the .part (the copy would start over), if the copy restarts from 0
// when the drive comes back, if an engine restart forgets the interrupted copy, or if the resumed file differs.
test('import: a drive pulled mid-copy leaves the copy interrupted with its .part; plugged back (even after a restart) it resumes and the file is identical', async () => {
  const r = rig({ sourceOptions: { failAfter: 12 * MB } }); // with the sentinel, a read past 12 MB fails: the second 8 MB block
  try {
    const bytes = padded(makeHap({ frames: 6, audio: { codec: 'sowt' } }).bytes, 20 * MB, 3);
    const f = r.file('Pulled.mov', bytes);
    fs.writeFileSync(`${f}.unplug`, '');
    const res = await r.import([f]);
    assert.equal(res.accepted.length, 1);
    const m = r.media.show.media[0], final = r.lib(m.file);
    const job = await until(() => r.jobs().find((j) => j.state === 'interrupted'), 15000, 'the interruption');
    assert.equal(job.error, INTERRUPTED);
    assert.equal(job.error, 'Copy interrupted — plug the drive back in');
    assert.equal(fs.statSync(`${final}.part`).size, 8 * MB, 'the .part keeps the whole block that was copied');
    assert.ok(!fs.existsSync(final));
    const pb = r.media.mediaState().problems;
    assert.deepEqual(pb.map((p) => p.kind), ['copy']);
    assert.equal(pb[0].text, 'Copy of "Pulled.mov" interrupted — plug the drive back in.');

    fs.renameSync(f, `${f}.away`); // the stick is gone: nothing to resume from
    await r.media.check();
    assert.equal(job.state, 'interrupted');
    const again = await r.restart(); // the engine restarts meanwhile: the sidecar brings the copy back
    const restored = [...again.jobs.values()];
    assert.deepEqual(restored.map((j) => [j.state, j.name, j.done]), [['interrupted', 'Pulled.mov', 8 * MB]]);
    assert.deepEqual(again.mediaState().problems.map((p) => p.kind), ['copy'], 'not reported as a missing file');

    fs.renameSync(`${f}.away`, f); fs.rmSync(`${f}.unplug`); // plugged back in
    await again.check();
    const j = restored[0];
    await until(() => j.state === 'done', 20000, 'the resumed copy');
    assert.equal(j.resumedFrom, 8 * MB, 'it continued from the .part, not from 0');
    assert.ok(Buffer.from(fs.readFileSync(final)).equals(bytes), 'the resumed file is identical to the source');
    assert.deepEqual(again.mediaState().problems, []);
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- validation (§4d.3)

// Fails if any case of the validation table of MEDIA-SERVER.md §4d.3 changes its message (the interface shows them
// as they are), if a refused file is copied, or if the refusals do not come back together in one list.
test('import: every case of the validation table gives its exact message, all refusals in one list', async () => {
  const r = rig();
  try {
    const hap = (o) => makeHap({ frames: 3, ...o }).bytes;
    const full = hap();
    const paths = [
      r.file('hap.mov', hap()), r.file('alpha.mov', hap({ variant: 'hapa' })), r.file('q.mov', hap({ variant: 'hapq' })),
      r.file('clip.mp4', hap({ fourcc: 'mp4v' })),
      r.file('clip.mov', hap({ fourcc: 'xd5c' })), r.file('prores.mov', hap({ fourcc: 'apcn' })), r.file('hevc.mov', hap({ fourcc: 'hvc1' })),
      r.file('qalpha.mov', hap({ fourcc: 'HapM' })), r.file('r.mov', hap({ fourcc: 'Hap7' })), r.file('hdr.mov', hap({ fourcc: 'HapH' })),
      r.file('cut.mov', full.subarray(0, full.length - 40)), r.file('renamed.mov', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0, 0, 0, 0, 0, 0, 0])),
      r.file('aac.mov', hap({ audio: { codec: 'mp4a' } })), r.file('wide.mov', hap({ width: 512, height: 64, frames: 2 })),
      path.join(r.usb, 'gone.mov'),
    ];
    const res = await r.import(paths);
    const why = Object.fromEntries(res.rejected.map((x) => [x.name, x.message]));
    assert.deepEqual(why, {
      'clip.mp4': '"clip.mp4" is MPEG-4, which VEATION Touch cannot play. Export it as H.264 or HAP. Or use Convert to HAP.',
      'clip.mov': '"clip.mov" is XDCAM, which VEATION Touch cannot play. Export it as H.264 or HAP. Or use Convert to HAP.',
      'prores.mov': '"prores.mov" is ProRes 422, which VEATION Touch cannot play. Export it as H.264 or HAP. Or use Convert to HAP.',
      'hevc.mov': '"hevc.mov" is HEVC (H.265), which is not supported yet. Export it as H.264 or HAP. Or use Convert to HAP.',
      'qalpha.mov': 'HAP Q Alpha is not supported yet. Use HAP, HAP Alpha or HAP Q.',
      'r.mov': 'HAP R is not supported yet. Use HAP, HAP Alpha or HAP Q.',
      'hdr.mov': 'HAP HDR is not supported yet. Use HAP, HAP Alpha or HAP Q.',
      'cut.mov': '"cut.mov" is incomplete (no index). Copy it again from the source.',
      'renamed.mov': '"renamed.mov" is Matroska, which cannot be read. Export it as H.264 (MP4) or HAP. Or use Convert to HAP.',
      'gone.mov': '"gone.mov" was not found.',
    });
    const ok = Object.fromEntries(res.accepted.map((x) => [x.name, x.warnings]));
    assert.deepEqual(ok, {
      'hap.mov': [], 'alpha.mov': [], 'q.mov': [],
      'aac.mov': ['The audio of "aac.mov" is AAC and will not play. Export with PCM audio.'],
      'wide.mov': ['This clip is 512×64; the room canvas is 256×32. It will be stretched (change Fit).'],
    });
    assert.deepEqual(r.media.show.media.map((m) => m.video.fourcc), ['Hap1', 'Hap5', 'HapY', 'Hap1', 'Hap1']);
    assert.equal(r.media.show.media.find((m) => m.file.endsWith('aac.mov')).audio.supported, false);
    assert.equal(r.jobs().length, 5, 'only the accepted ones are copied');
    await until(() => r.jobs().every((j) => j.state === 'done'), 20000, 'the copies');
    assert.deepEqual(fs.readdirSync(path.join(r.media.libraryDir, r.media.show.id)).sort(), ['aac.mov', 'alpha.mov', 'hap.mov', 'q.mov', 'wide.mov']);
  } finally { await r.close(); }
});

// Fails if a file whose fingerprint is already in the library is copied again (while it is still copying, after,
// from another path, or into another show).
test('import: the same fingerprint is never copied twice ("Already in the library.")', async () => {
  const r = rig({ sourceOptions: { delayMs: 60 } });
  try {
    const bytes = padded(makeHap({ frames: 4 }).bytes, 9 * MB, 11);
    const a = r.file('a.mov', bytes), copy = r.file('elsewhere/renamed copy.mov', bytes);
    await r.import([a], { layerId: 'L1' });
    const inFlight = await r.import([a], { layerId: 'L2' }); // the first copy is still running
    assert.deepEqual(inFlight.accepted.map((x) => [x.reused, x.copying, x.warnings]), [[true, false, ['Already in the library.']]]);
    await until(() => r.jobs().every((j) => j.state === 'done'), 20000, 'the copy');
    const after = await r.import([a, copy], { layerId: 'L3' });
    assert.deepEqual(after.accepted.map((x) => [x.reused, x.copying, x.warnings[0]]), [[true, false, 'Already in the library.'], [true, false, 'Already in the library.']]);
    assert.equal(r.jobs().length, 1, 'one copy for four drops');
    assert.equal(r.media.show.media.length, 1, 'one medium');
    assert.equal(r.media.show.clips.length, 4, 'four clips of it, one per drop');
    const first = r.media.show;
    await r.media.command('show.create', { name: 'Other show' });
    const other = await r.import([copy]);
    assert.deepEqual(other.accepted.map((x) => [x.reused, x.copying]), [[true, false]]);
    assert.equal(r.media.show.media[0].file, first.media[0].file, 'the other show uses the same library file');
    assert.equal(r.jobs().length, 1);
    assert.deepEqual(fs.readdirSync(r.media.libraryDir), [first.id], 'nothing was copied for the other show');
  } finally { await r.close(); }
});

// Fails if a file that does not fit is accepted (the copy would fill the disk mid-show), if the figures are wrong,
// or if the files of one drop are not counted together.
test('import: no space (injected) refuses with the figures, counting the files of the same drop', async () => {
  const r = rig({ freeSpace: async () => ({ free: 5 * MB, total: 100 * MB }) });
  try {
    const a = r.file('a.mov', sized(makeHap({ frames: 3 }).bytes, 3 * MB, 1));
    const b = r.file('b.mov', sized(makeHap({ frames: 4 }).bytes, 3 * MB, 2));
    const res = await r.import([a, b]);
    const drive = path.parse(path.resolve(r.media.libraryDir)).root.replace(/[\\/]+$/, '') || '/';
    assert.deepEqual(res.accepted.map((x) => x.name), ['a.mov']);
    assert.deepEqual(res.rejected, [{ name: 'b.mov', message: `Not enough space: 3.0 MB needed, 2.0 MB free on ${drive}.` }]);
    assert.deepEqual(r.jobs().map((j) => j.name), ['a.mov'], 'the refused one is not queued');
    assert.equal(r.media.show.media.length, 1);
    assert.equal(r.media.libraryState().free, 5 * MB);
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- missing files (§4d.5)

// Fails if a file that left the library is not reported, if Locate… picks a file of the same name and size but
// other content, if it does not fix every match at once, or if a match outside the library is used in place
// instead of being copied in.
test('library: moving the library and Locate… fixes every missing file at once; a match outside the library is copied in', async () => {
  const r = rig();
  try {
    const A = sized(makeHap({ frames: 3 }).bytes, 3 * MB, 21), B = sized(makeHap({ frames: 5 }).bytes, 3 * MB, 22);
    await r.import([r.file('a.mov', A), r.file('b.mov', B)]);
    await until(() => r.jobs().every((j) => j.state === 'done'), 20000, 'the copies');
    await r.media.check();
    assert.deepEqual(r.media.mediaState().problems, []);
    const [ma, mb] = r.media.show.media;

    // the operator moves the library to another folder, with another layout
    const moved = path.join(r.dir, 'new library');
    fs.mkdirSync(path.join(moved, 'old', 'deep'), { recursive: true });
    fs.renameSync(r.lib(ma.file), path.join(moved, 'old', 'a.mov'));
    fs.renameSync(r.lib(mb.file), path.join(moved, 'old', 'deep', 'b.mov'));
    const decoy = Buffer.from(A); decoy[200] ^= 0xff; // same name and size, other content
    fs.mkdirSync(path.join(moved, 'aaa')); fs.writeFileSync(path.join(moved, 'aaa', 'A.MOV'), decoy);
    await r.media.command('media.setDir', { dir: moved, __local: true });
    assert.equal(r.store.loadSettings().mediaDir, path.resolve(moved), 'per machine, in settings.json');
    assert.deepEqual(r.media.mediaState().problems.map((p) => [p.kind, p.text, p.fix]), [
      ['missing-media', '"a.mov" is missing from the media library.', 'relink'],
      ['missing-media', '"b.mov" is missing from the media library.', 'relink'],
    ]);
    const fix = await r.media.command('media.relink', { dir: moved, __local: true });
    assert.deepEqual(fix, { fixed: 2, copying: 0, notFound: [], rejected: [] });
    assert.deepEqual(r.media.show.media.map((m) => m.file), ['old/a.mov', 'old/deep/b.mov'], 'the decoy was not taken');
    assert.deepEqual(r.media.mediaState().problems, []);

    // b is lost from the library; a copy of it is on a stick
    fs.rmSync(path.join(moved, 'old', 'deep', 'b.mov'));
    await r.media.check();
    assert.deepEqual(r.media.mediaState().problems.map((p) => p.mediaId), [mb.id]);
    r.file('backup/b.mov', B);
    const out = await r.media.command('media.relink', { dir: path.join(r.usb, 'backup'), __local: true });
    assert.deepEqual([out.fixed, out.copying], [0, 1]);
    await until(() => r.jobs().filter((j) => j.kind === 'relink').every((j) => j.state === 'done'), 20000, 'the copy back');
    assert.ok(Buffer.from(fs.readFileSync(path.join(moved, 'old', 'deep', 'b.mov'))).equals(B), 'copied back to where the show expects it');
    await r.media.check();
    assert.deepEqual(r.media.mediaState().problems, []);
    await assert.rejects(r.media.command('media.relink', { dir: moved }), /desktop app/, 'paths only from this computer');
  } finally { await r.close(); }
});

// ---------------------------------------------------------------------------------------------- routes

function get(port, p, o = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, ...o }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

// Fails if the PCM route answers a LAN device or a device coming through the internet relay (it would hand the
// clips' audio to anyone), if it stops answering this computer, if the samples are not the file's, or if the
// thumbnails lose their access rule or their immutable cache.
test('routes: /api/media/pcm only for this computer (not the LAN, not the relay); /api/media/thumb with the UI rule and an immutable URL', async () => {
  const relay = await startRelay({ port: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-routes-'));
  const engine = new Engine({ store: new Store(dir, null, quiet), log: quiet, version: 'test' });
  engine.start();
  const server = await createServer(engine, { port: 0, root, log: quiet });
  engine.port = server.port;
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/ui`);
  const msgs = [];
  ws.on('message', (d, bin) => { if (!bin) msgs.push(JSON.parse(d.toString())); });
  try {
    const usb = path.join(dir, 'usb'); fs.mkdirSync(usb);
    const { bytes, truth } = makeHap({ frames: 9, audio: { codec: 'sowt' } });
    const f = path.join(usb, 'voice.mov'); fs.writeFileSync(f, bytes);
    await until(() => ws.readyState === 1, 5000, 'the UI socket');
    await assert.rejects(engine.command('media.import', { paths: [f] }), /desktop app/, 'paths come only from the desktop app');
    const res = await engine.command('media.import', { paths: [f], target: { layerId: 'L1' }, __local: true });
    const clipId = res.accepted[0].clipId;
    assert.ok(engine.profile.media.showId, 'the room got a show for its first import');
    await until(() => [...engine.media.jobs.values()].every((j) => j.state === 'done'), 15000, 'the copy');
    await until(() => msgs.some((m) => m.type === 'media' && m.import?.some((j) => j.state === 'done')), 5000, 'a media message');
    const st = engine.state();
    assert.equal(st.show.clips[0].id, clipId);
    assert.deepEqual(Object.keys(st.library).sort(), ['dir', 'drive', 'free', 'isDefault', 'total']);
    assert.ok(st.library.free > 0);

    const pcm = `/api/media/pcm?clip=${clipId}&from=10&n=100`;
    const local = await get(server.port, pcm);
    assert.equal(local.status, 200);
    assert.deepEqual(['x-vt-encoding', 'x-vt-channels', 'x-vt-rate', 'x-vt-from', 'x-vt-frames'].map((h) => local.headers[h]), ['s16le', '2', '8000', '10', '100']);
    assert.equal(local.body.length, 100 * 2 * 2);
    for (let i = 0; i < 200; i++) assert.equal(local.body.readInt16LE(i * 2) / 32768, truth.audio.samples[20 + i], `sample ${i}`);
    const total = Number(local.headers['x-vt-total']);
    const end = await get(server.port, `/api/media/pcm?clip=${clipId}&from=${total - 10}&n=100`);
    assert.deepEqual([end.headers['x-vt-frames'], end.body.length], ['10', 40], 'clipped to the track');
    assert.equal((await get(server.port, `/api/media/pcm?clip=${clipId}&from=0&n=0`)).status, 400);
    assert.equal((await get(server.port, '/api/media/pcm?clip=nope&from=0&n=10')).status, 404);

    assert.equal((await get(server.port, pcm, { localAddress: '127.0.0.2' })).status, 403, 'another address (a LAN device) is refused');
    const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
    if (lan) assert.equal((await get(server.port, pcm, { host: lan.address })).status, 403, `the LAN address ${lan.address} is refused`);
    assert.equal((await get(server.port, `${pcm}&k=${engine.settings.token}`, { localAddress: '127.0.0.2' })).status, 403, 'the access key does not open it');

    await engine.command('cloud.set', { enabled: true, relayUrl: `http://127.0.0.1:${relay.port}`, launcherUrl: '', __local: true });
    await until(() => engine.cloud.state === 'online', 8000, 'the relay link');
    const viaRelay = (p) => fetch(`http://127.0.0.1:${relay.port}${p}`, { headers: { cookie: `vt_room=${engine.settings.cloud.roomId}` } });
    assert.equal((await viaRelay(`${pcm}&k=${engine.settings.token}`)).status, 403, 'refused through the relay tunnel');

    const m = st.show.media[0];
    const thumb = `/api/media/thumb/${m.id}.png?s=480&v=${m.fingerprint}`;
    const t = await get(server.port, thumb);
    assert.equal(t.status, 200);
    assert.equal(t.headers['content-type'], 'image/png');
    assert.match(t.headers['cache-control'], /immutable/);
    assert.equal(t.body.readUInt32BE(16), 480);
    const cell = await get(server.port, `/api/media/thumb/${m.id}.png?s=160`);
    assert.deepEqual([cell.body.readUInt32BE(16), cell.body.readUInt32BE(20)], [160, 90]);
    assert.equal(cell.headers['cache-control'], 'no-cache', 'without the fingerprint in the URL it is not kept');
    assert.equal((await get(server.port, thumb, { localAddress: '127.0.0.2' })).status, 401, 'a LAN device needs the key');
    assert.equal((await get(server.port, `${thumb}&k=${engine.settings.token}`, { localAddress: '127.0.0.2' })).status, 200);
    assert.equal((await viaRelay(thumb)).status, 401);
    assert.equal((await viaRelay(`${thumb}&k=${engine.settings.token}`)).status, 200, 'thumbnails do travel through the relay');
    assert.equal((await get(server.port, '/api/media/thumb/m99.png')).status, 404);
    fs.rmSync(path.join(engine.store.thumbsDir, `${m.fingerprint}-480.png`));
    assert.equal((await get(server.port, thumb)).status, 200, 'a missing thumbnail is made again');
  } finally {
    ws.close(); server.close(); await engine.stop(); await relay.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------- the 60 Hz loop

// MEDIA-SERVER.md §4d.3 step 4: the copy never runs in the engine's loop. tickMaxMs (status › engine) is the longest
// tick of each second; the gap between ticks shows a blocked event loop, which tickMaxMs alone cannot see. Fails if
// the copy (or its fingerprint, or its thumbnail) runs on the engine's thread: a block of the slow drive is 200 ms.
test('engine: during a large simulated copy the 60 Hz loop keeps its pace (tickMaxMs within +2 ms of idle)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-tick-'));
  const big = path.join(dir, 'big.mov');
  fs.writeFileSync(big, makeHap({ frames: 6 }).bytes);
  const engine = new Engine({ store: new Store(dir, null, quiet), log: quiet, version: 'test', media: { sourceOpener: FAKE, sourceOptions: { tail: { 'big.mov': 96 * MB }, delayMs: 200 } } });
  engine.start();
  let last = null, gap = 0;
  engine.on('frame', (fr) => { if (last !== null) gap = Math.max(gap, fr.t - last); last = fr.t; });
  const sample = async (ms) => {
    gap = 0; last = null;
    let tick = 0;
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) tick = Math.max(tick, engine.tickStats.lastMax || 0);
    return { tick, gap };
  };
  try {
    await sleep(1500); // warm up
    const idle = await sample(3000);
    await engine.command('media.import', { paths: [big], __local: true });
    const job = await until(() => [...engine.media.jobs.values()].find((j) => j.state === 'copying' && j.done > 0), 20000, 'the copy');
    const busy = await sample(2000);
    assert.equal(job.state, 'copying', 'the copy lasted the whole measurement');
    assert.ok(job.total > 96 * MB);
    assert.ok(busy.tick <= idle.tick + 2, `tickMaxMs ${busy.tick.toFixed(2)} ms while copying, ${idle.tick.toFixed(2)} ms idle`);
    assert.ok(busy.gap <= idle.gap + 20, `longest gap between ticks ${busy.gap.toFixed(1)} ms while copying, ${idle.gap.toFixed(1)} ms idle`);
    await engine.media.cancelImport(job.id);
  } finally { await engine.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------------------------------------ packaged (app.asar)

// The installer puts the engine inside app.asar (package.json › build.files has engine/**). Electron 44's worker_threads
// load ES modules and their relative imports from the archive (checked by hand on 2026-11-21 with an asar of the engine:
// no asarUnpack needed), so the import worker loads when packaged as long as (1) the engine is in build.files and not
// excluded, (2) MediaEngine finds the worker relative to its own module (inside the archive wherever it is installed),
// and (3) everything the worker imports is a relative file of engine/ or a node: built-in — never a package of
// node_modules (only ws and qrcode-generator are shipped) nor a file outside engine/. Fails if any of the three breaks.
test('packaged: the import worker and every module it imports ship inside app.asar (engine/**), found relative to MediaEngine', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = pkg.build.files;
  assert.ok(files.includes('engine/**'), 'the engine is in the package');
  assert.ok(!files.some((f) => f.startsWith('!engine')), 'no part of the engine is left out');
  const src = fs.readFileSync(path.join(root, 'engine', 'media', 'index.js'), 'utf8');
  assert.match(src, /const WORKER_URL = new URL\('\.\/import-worker\.js', import\.meta\.url\);/, 'found next to MediaEngine');
  assert.match(src, /new Worker\(WORKER_URL,/);
  // the worker's import closure
  const seen = new Set(), bare = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) { bare.push(`${path.relative(root, file)} → ${spec}`); continue; }
      walk(path.resolve(path.dirname(file), spec));
    }
  };
  walk(path.join(root, 'engine', 'media', 'import-worker.js'));
  assert.deepEqual(bare, [], 'the worker imports no package');
  const outside = [...seen].map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !f.startsWith('engine/'));
  assert.deepEqual(outside, [], 'everything it imports is in engine/');
  for (const f of seen) assert.ok(fs.existsSync(f), `${f} exists`);
  assert.ok(seen.size >= 8, `the closure was walked (${seen.size} modules)`);
});
