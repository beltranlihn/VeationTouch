// Media formats in the REAL pages (docs/research/media-formats.md, round 1): what needs Chromium. Still images on the room
// output (decoded by a worker, one texture with mipmaps: the right way up, premultiplied, upright by EXIF, reduced when
// larger than the GPU takes, held as long as nothing replaces them), a sound that makes no picture, and the media helper
// (the hidden window: the engine's jobs — thumbnails, "can this computer decode it?", the PCM of AAC and MP3).
// Electron hidden windows through tests/ui/runner.cjs, as tests/hap-player.test.mjs does; the fixtures are written by
// tests/fixtures/media/make-image.mjs or are the few-kB binaries of make-h264.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Store } from '../engine/store.js';
import { Engine } from '../engine/engine.js';
import { createServer } from '../engine/server.js';
import { normalizeProfile } from '../engine/profile.js';
import { normalizeShow } from '../engine/media/show.js';
import { MARKERS, layout } from './fixtures/media/make-hap.mjs';
import { pngFile, bmpFile, wavFile, markerPicture } from './fixtures/media/make-image.mjs';

const quiet = { info() {}, warn() {}, error() {}, recent: () => [] };
const root = path.resolve(import.meta.dirname, '..');
const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'media', name));
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const OUTPUT_WINDOW = ['--output-window', '--w=640', '--h=200']; // the room output as the app makes it: Node in its workers, rendered off screen
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** A test engine with the simulated room (output on at scale 0.25) and `setup(rig)` to write the show; then `script` in a page. → {result, errors, rig} */
async function inPage(urlPath, script, { setup, handlers = {}, output = true, args = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-pg-'));
  const rig = { dir, hits: [] };
  rig.store = new Store(dir, path.join(root, 'profiles'), quiet);
  rig.engine = new Engine({ store: rig.store, log: quiet, version: 'test' });
  rig.engine.start();
  rig.server = await createServer(rig.engine, { port: 0, root, log: quiet });
  rig.engine.port = rig.server.port;
  const ctl = http.createServer(async (req, res) => {
    const key = req.url.slice(1).split('?')[0];
    rig.hits.push(key);
    let out = {};
    try { out = (await handlers[key]?.(rig)) ?? {}; } catch (e) { out = { error: String(e.stack || e.message) }; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out));
  });
  await new Promise((r) => ctl.listen(0, '127.0.0.1', r));
  rig.ctlPort = ctl.address().port;
  try {
    const p = structuredClone(rig.engine.profile);
    p.simulation.wanderers = 0;
    p.experience = normalizeProfile({}).experience;
    if (output) p.output = { ...normalizeProfile({}).output, on: true, scale: 0.25 };
    await rig.engine.command('profile.update', { profile: p, rev: rig.engine.rev });
    if (setup) await setup(rig);
    const file = path.join(dir, 'script.js');
    fs.writeFileSync(file, `const CTL = ${rig.ctlPort};\n${script}`);
    const run = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${rig.server.port}${urlPath}`, `--script=${file}`, '--wait=load', ...args];
    const outText = await new Promise((resolve, reject) => {
      const pr = spawn(electronPath, run, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      pr.stdout.on('data', (d) => { buf += d; });
      pr.on('error', reject);
      pr.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the UI runner: ${outText.slice(0, 800)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    return { ...data, rig };
  } finally {
    ctl.close();
    rig.server.close(); await rig.engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Puts files in the library and a show of clips for them: items [{id, file, bytes, kind, w, h, end?, audio?}]. */
function writeShow(rig, items) {
  const lib = rig.engine.media.libraryDir, media = [], clips = [];
  for (const it of items) {
    const abs = path.join(lib, 'pg', it.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, it.bytes);
    media.push({
      id: `m-${it.id}`, file: `pg/${it.file}`, kind: it.kind, size: it.bytes.length,
      video: it.video || { fourcc: it.kind === 'image' ? 'IMG ' : 'AUD ', width: it.w || 1, height: it.h || 1, fps: 30, frames: it.kind === 'image' ? 1 : Math.round(it.seconds * 30), duration: it.kind === 'image' ? 10 : it.seconds },
      ...(it.kind === 'image' ? { image: { format: it.format || 'png', width: it.w, height: it.h, animated: false } } : {}),
      audio: it.audio || null,
    });
    clips.push({ id: it.id, mediaId: `m-${it.id}`, end: it.end || 'hold', ...(it.clip || {}) });
  }
  rig.store.saveShow(normalizeShow({ id: 'pg', name: 'PG', media, clips, layers: [{ id: 'L1', transitionMs: 0 }, { id: 'L2', transitionMs: 0 }] }));
  return rig.engine.command('show.load', { id: 'pg' });
}

const PAGE_LIB = `
const { store, cmd } = await import('/js/conn.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(15); return !!f(); };
const ctl = (k) => fetch('http://127.0.0.1:' + CTL + '/' + k).then((r) => r.json());
await until(() => window.__out && window.__out.mixer() && store.state && store.state.show && window.__out.clock.ready, 12000);
const O = window.__out, M = O.media, m = O.mixer(), W = m.width, H = m.height;
const px = (x, y) => [...m.readFbo(Math.round(x), Math.round(y), 1, 1)].slice(0, 3);
/** the four corner markers of a clip of cw×ch px drawn over the whole canvas (the markers are 8 px: 4 px in is inside) */
const corners = (cw, ch, d = 4) => { const sx = W / cw, sy = H / ch; return { tl: px(d * sx, d * sy), tr: px(W - d * sx, d * sy), bl: px(d * sx, H - d * sy), br: px(W - d * sx, H - d * sy) }; };
const P = (layer) => M.info().players.find((p) => p.layerId === layer);
const ready = async (clipId, layer = 'L1') => { await until(() => { const p = P(layer), L = M.last[layer]; return p && p.clipId === clipId && p.ready && L && L.play && L.play.playId === p.playId && L.wB > 0.99; }, 15000); await wait(200); }; // (after the preroll the picture is drawn on the next composed frame)
`;

// ---------------------------------------------------------------------------------------------- still images

// Fails if the picture is drawn upside down or mirrored (the markers move), if the alpha is not premultiplied (the half
// transparent block comes out white instead of grey), if a JPEG ignores its EXIF rotation (phone photos come out sideways),
// if an image larger than 16384 px is not reduced, if a held still ends by itself or its player never frees the decoded
// bitmap, or if a sound clip gets a picture player.
test('output page: still images — upright and premultiplied (PNG, BMP), upright by EXIF (JPEG), reduced above 16384 px, held until replaced; a sound makes no picture', opt, async () => {
  const wide = pngFile(20000, 16, markerPicture(20000, 16, { alphaBlock: false }));
  const { result: r, errors } = await inPage('/output?run=1', `${PAGE_LIB}
    const out = {};
    await until(() => O.clock.samples >= 30, 6000);
    await cmd('clip.trigger', { clipId: 'png', layerId: 'L1', transitionMs: 0 });
    await ready('png');
    out.png = { corners: corners(256, 32), centre: px(W / 2, H / 2), info: P('L1') };
    // held: nothing ends it, the picture is still the clip on the layer and still on the image 2.5 s later
    await wait(2500);
    out.heldPlay = store.state.media.layers.L1.play && store.state.media.layers.L1.play.clipId;
    out.heldCorner = corners(256, 32).tl; out.heldPlayers = M.info().players.length;
    await cmd('clip.trigger', { clipId: 'bmp', layerId: 'L1', transitionMs: 0 }); await ready('bmp');
    out.bmp = corners(256, 32);
    await cmd('clip.trigger', { clipId: 'jpg', layerId: 'L1', transitionMs: 0 }); await ready('jpg');
    out.jpg = { corners: corners(64, 32), info: P('L1') };
    await cmd('clip.trigger', { clipId: 'wide', layerId: 'L1', transitionMs: 0 }); await ready('wide');
    out.wide = { info: P('L1'), ramp: { left: px(3, H / 2), right: px(W - 4, H / 2), top: px(W / 2, 3), bottom: px(W / 2, H - 4) } };
    // a sound on another layer: it plays (the engine says so), the mixer has no player for it
    await cmd('clip.trigger', { clipId: 'wav', layerId: 'L2', transitionMs: 0 });
    await wait(500);
    out.wav = { play: store.state.media.layers.L2.play && { kind: store.state.media.layers.L2.play.kind, audio: store.state.media.layers.L2.play.audio }, players: M.info().players.map((p) => p.layerId) };
    await cmd('layer.clear', { layerId: 'L1', transitionMs: 0 });
    await until(() => M.info().players.length === 0, 6000);
    out.after = { players: M.info().players.length, centre: px(W / 2, H / 2) };
    return out;`, {
    setup: (rig) => writeShow(rig, [
      { id: 'png', file: 'a.png', kind: 'image', bytes: pngFile(256, 32), w: 256, h: 32 },
      { id: 'bmp', file: 'b.bmp', kind: 'image', bytes: bmpFile(256, 32), w: 256, h: 32, format: 'bmp' },
      { id: 'jpg', file: 'c.jpg', kind: 'image', bytes: fixture('exif6.jpg'), w: 64, h: 32, format: 'jpeg' },
      { id: 'wide', file: 'd.png', kind: 'image', bytes: wide, w: 16384, h: 13 },
      { id: 'wav', file: 'e.wav', kind: 'audio', bytes: wavFile({ frames: 48000, channels: 1 }), seconds: 1, end: 'clear', audio: { format: 's16le', supported: true, channels: 1, rate: 48000, frames: 48000, duration: 1 } },
    ]),
    args: OUTPUT_WINDOW,
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const M_ = MARKERS;
  assert.ok(near(r.png.corners.tl, M_.topLeft, 40) && near(r.png.corners.tr, M_.topRight, 40) && near(r.png.corners.bl, M_.bottomLeft, 40) && near(r.png.corners.br, M_.bottomRight, 40), `PNG corners ${JSON.stringify(r.png.corners)}`);
  assert.ok(near(r.bmp.tl, M_.topLeft, 40) && near(r.bmp.br, M_.bottomRight, 40) && near(r.bmp.bl, M_.bottomLeft, 40), `BMP corners ${JSON.stringify(r.bmp)}`);
  // half-transparent white over black, premultiplied: ~128 grey (un-premultiplied it would be white)
  assert.ok(near(r.png.centre, [128, 128, 128], 14), `alpha block ${r.png.centre}`);
  assert.equal(r.png.info.kind, 'image'); assert.deepEqual([r.png.info.w, r.png.info.h], [256, 32]);
  assert.equal(r.heldPlay, 'png', 'a held still is still the clip on its layer'); assert.ok(near(r.heldCorner, M_.topLeft, 40)); assert.equal(r.heldPlayers, 1);
  // EXIF 6: stored TL red, TR green, BL blue, BR white → shown rotated a quarter clockwise: TR red, BR green, TL blue, BL white
  assert.ok(near(r.jpg.corners.tl, M_.bottomLeft, 70) && near(r.jpg.corners.tr, M_.topLeft, 70) && near(r.jpg.corners.br, M_.topRight, 70) && near(r.jpg.corners.bl, M_.bottomRight, 70), `JPEG corners ${JSON.stringify(r.jpg.corners)}`);
  assert.deepEqual([r.jpg.info.w, r.jpg.info.h], [64, 32], 'upright: 64×32, not the stored 32×64');
  // the 20000 px wide image is reduced to the GPU's limit
  assert.equal(r.wide.info.w, 16384); assert.equal(r.wide.info.reduced, true); assert.ok(r.wide.info.h <= 14 && r.wide.info.h >= 12, `${r.wide.info.h}`);
  // (its 4 px markers are gone in the averaging of a 9:1 minification, and a 13-row image has no vertical detail left at the
  // mipmap level that suits its width: the picture is checked by its red ramp, which grows to the right — still not mirrored)
  assert.ok(r.wide.ramp.right[0] > r.wide.ramp.left[0] + 60, `reduced image ramp ${JSON.stringify(r.wide.ramp)}`);
  // a sound: playing, audible, and no picture player
  assert.deepEqual(r.wav.play, { kind: 'audio', audio: true }); assert.ok(!r.wav.players.includes('L2'), `players ${r.wav.players}`);
  assert.equal(r.after.players, 0); assert.ok(near(r.after.centre, [0, 0, 0], 1));
});

// ---------------------------------------------------------------------------------------------- the media helper

// The real helper page (ui/helper.html) polling the engine, driven from Node through engine.media.helper.request. Fails if
// the helper cannot decode what it is given: a picture's thumbnail (PNG with its two sizes), a video frame, whether this
// computer decodes the H.264 (a real sample, not only isConfigSupported), and — the point of the audio cache — the AAC's
// click at 2.000 s ± 1 ms: the encoder's priming (1024 samples = 21 ms) and the edit lists must be off.
test('media helper: thumbnails of an image and of an H.264 frame, can-decode of H.264, the PCM cache of an AAC track starts at the clip\'s time 0 and an MP3 decodes', opt, async () => {
  const { result: r, errors } = await inPage('/helper', `
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    return await fetch('http://127.0.0.1:' + CTL + '/go').then((x) => x.json());`, {
    output: false,
    handlers: {
      go: async (rig) => {
        const h = rig.engine.media.helper, out = {};
        for (let i = 0; i < 100 && !h.online; i++) await new Promise((r) => setTimeout(r, 50));
        out.online = h.online;
        const files = {};
        for (const [k, name, bytes] of [['png', 'a.png', pngFile(64, 32)], ['mp4', 'markers.mp4', fixture('h264-markers.mp4')], ['click', 'click.mp4', fixture('h264-click.mp4')], ['mp3', 'click.mp3', fixture('click.mp3')], ['txt', 't.txt', Buffer.from('hello')]]) {
          files[k] = path.join(rig.dir, name); fs.writeFileSync(files[k], bytes);
        }
        const dim = (b64) => { const b = Buffer.from(b64, 'base64'); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
        const th = await h.request({ kind: 'thumb', name: 'a.png' }, { files: { src: files.png } });
        out.pngThumb = { a: dim(th.png160), b: dim(th.png480) };
        const tv = await h.request({ kind: 'thumb', frame: 20, name: 'markers.mp4' }, { files: { src: files.mp4 } });
        out.mp4Thumb = { a: dim(tv.png160), b: dim(tv.png480) };
        out.can = await h.request({ kind: 'canDecode', codec: 'avc1.64000a', width: 256, height: 32 }, { files: { src: files.mp4 } });
        out.cantCode = await h.request({ kind: 'canDecode', codec: 'avc1.64000a', width: 65000, height: 65000 }, { files: { src: files.mp4 } }).catch((e) => ({ error: e.message }));
        out.txt = await h.request({ kind: 'thumb' }, { files: { src: files.txt } }).catch((e) => ({ code: e.code }));
        // the AAC of the MP4 → the cache file, read back here: where is the click?
        const dest = path.join(rig.dir, 'click.pcm');
        const a = await h.request({ kind: 'audioDecode', format: 'mp4', name: 'click.mp4' }, { files: { src: files.click }, dest });
        const pcm = fs.readFileSync(dest);
        let first = -1, peak = 0;
        for (let i = 0; i < pcm.length / 2; i++) { const v = Math.abs(pcm.readInt16LE(i * 2)); peak = Math.max(peak, v); if (first < 0 && v > 6000) first = i; }
        out.aac = { ...a, bytes: pcm.length, first, peak };
        const dest2 = path.join(rig.dir, 'mp3.pcm');
        const b = await h.request({ kind: 'audioDecode', format: 'mp3', name: 'click.mp3' }, { files: { src: files.mp3 }, dest: dest2 });
        const pcm2 = fs.readFileSync(dest2);
        let first2 = -1, peak2 = 0;
        for (let i = 0; i < pcm2.length / (2 * b.channels); i++) { const v = Math.abs(pcm2.readInt16LE(i * 2 * b.channels)); peak2 = Math.max(peak2, v); if (first2 < 0 && v > 6000) first2 = i; }
        out.mp3 = { ...b, first: first2, peak: peak2 };
        return out;
      },
    },
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(r.online, true, 'the helper page is polling the engine');
  assert.deepEqual([r.pngThumb.a.sig, r.pngThumb.a.w, r.pngThumb.a.h], ['PNG', 160, 90]);
  assert.deepEqual([r.pngThumb.b.w, r.pngThumb.b.h], [480, 240], 'the wide thumbnail keeps the aspect');
  assert.deepEqual([r.mp4Thumb.a.sig, r.mp4Thumb.a.w, r.mp4Thumb.a.h], ['PNG', 160, 90]); assert.deepEqual([r.mp4Thumb.b.w, r.mp4Thumb.b.h], [480, 60]);
  assert.equal(r.can.ok, true, JSON.stringify(r.can)); assert.equal(typeof r.can.hardware, 'boolean'); assert.ok(r.can.frames >= 1, 'a real sample was decoded');
  assert.ok(r.cantCode.ok === false && r.cantCode.reason, `65000×65000 H.264: ${JSON.stringify(r.cantCode)}`);
  assert.equal(r.txt.code, 'no-thumb');
  // the AAC click: the file has it at 2.000 s = frame 96000. Without the priming taken off it would be at 97024 (21 ms late).
  assert.equal(r.aac.rate, 48000); assert.equal(r.aac.channels, 1);
  assert.ok(Math.abs(r.aac.first - 96000) <= 48, `the click is at frame ${r.aac.first} (${((r.aac.first / 48000) * 1000).toFixed(1)} ms), it should be at 96000 (2000 ms) ± 1 ms`);
  assert.ok(r.aac.peak > 20000, `the click is loud: peak ${r.aac.peak}`);
  assert.ok(Math.abs(r.aac.frames - 3 * 48000) <= 1100, `length ${r.aac.frames}`);
  assert.equal(r.mp3.rate, 48000); assert.ok(r.mp3.peak > 20000 && Math.abs(r.mp3.first - 24000) < 2400, `mp3 click at ${r.mp3.first}`);
});

// ---------------------------------------------------------------------------------------------- H.264 on the output

const PAGE_VIDEO = `
const { playhead } = await import('/shared/transport.js');
const G = ${JSON.stringify({ ...layout(256, 32).stripe, cw: 256, ch: 32 })};
const stripeAt = () => {
  const row = m.readFbo(0, Math.round(((G.y0 + G.y1) / 2) * (H / G.ch)), W, 1); let f = 0;
  for (let b = 0; b < G.bits; b++) { const i = Math.round((G.x0 + b * G.cell + G.cell / 2) * (W / G.cw)) * 4; if (row[i] + row[i + 1] + row[i + 2] > 384) f |= 1 << b; }
  return f;
};
`;

// Fails if the frame on the screen is not the one the engine's clock says (B-frames in the wrong order, a seek that starts
// mid-GOP and shows the wrong frame, an off-by-one in the presentation index), if the loop does not wrap to frame 0 at once,
// if the corners are not the right way up, or if a clip that goes leaves a decoder behind. The fixture has B-frames and a
// keyframe every 15: the clip starting at frame 24 (mid-GOP) and a jump back by `clip.trigger` are the seeks.
test('output page: an H.264 MP4 plays the frame the clock says (B-frames in order), from a mid-GOP in-point, the loop wraps to frame 0, the picture is upright, and its decoder goes with it', opt, async () => {
  const { result: r, errors } = await inPage('/output?run=1', `${PAGE_LIB}${PAGE_VIDEO}
    const out = { samples: [], notes: [] };
    await until(() => O.clock.samples >= 60, 6000);
    const sample = async (ms) => {
      const t0 = performance.now(), s = [];
      while (performance.now() - t0 < ms) {
        const L = M.last.L1, pl = store.state.media.layers.L1.play;
        if (L && L.play && pl && L.play.started) s.push({ shown: L.play.shown, stripe: stripeAt(), clock: playhead(pl, L.tEng).frame, want: L.play.frame });
        await wait(23);
      }
      return s;
    };
    // (1) the whole clip, looping: 2 s of 60 frames
    await cmd('clip.trigger', { clipId: 'v', layerId: 'L1', transitionMs: 0 });
    await ready('v');
    out.seq0 = P('L1').seq; out.loop = await sample(4600); out.seq1 = P('L1').seq;
    out.corners = corners(256, 32); out.info = P('L1');
    // (2) in-point at frame 24 (mid-GOP, B-frames around it), held at frame 40
    await cmd('clip.trigger', { clipId: 'mid', layerId: 'L1', transitionMs: 0 });
    out.mid = await sample(1500); // (from the first frame: the segment is 18 frames, 0.6 s)
    out.midEnd = { shown: M.last.L1.play.shown, stripe: stripeAt() };
    // (3) away: the player and its decoder are freed
    await cmd('layer.clear', { layerId: 'L1', transitionMs: 0 });
    await until(() => M.info().players.length === 0, 6000);
    await wait(300);
    out.after = { players: M.info().players.length, video: M.info().video, centre: px(W / 2, H / 2) };
    return out;`, {
    setup: (rig) => writeShow(rig, [
      { id: 'v', file: 'markers.mp4', kind: 'video', bytes: fixture('h264-markers.mp4'), end: 'loop', video: { fourcc: 'avc1', codec: 'avc1.64000a', width: 256, height: 32, fps: 30, frames: 60, duration: 2, rotation: 0, gop: 15, vfr: false } },
      { id: 'mid', file: 'markers.mp4', kind: 'video', bytes: fixture('h264-markers.mp4'), end: 'hold', clip: { in: 0.8, out: 1.4 }, video: { fourcc: 'avc1', codec: 'avc1.64000a', width: 256, height: 32, fps: 30, frames: 60, duration: 2, rotation: 0, gop: 15, vfr: false } },
    ]),
    args: OUTPUT_WINDOW,
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  const S = r.loop;
  assert.ok(S.length > 40, `${S.length} samples`);
  assert.equal(S.filter((s) => s.stripe !== s.shown).length, 0, `the image is the frame the player says: ${JSON.stringify(S.filter((s) => s.stripe !== s.shown).slice(0, 5))}`);
  const off = S.filter((s) => Math.abs(s.shown - s.clock) > 1 && Math.abs(s.shown - s.clock) < 58);
  assert.ok(off.length <= S.length * 0.06, `frame vs clock: ${off.length} of ${S.length} off ${JSON.stringify(off.slice(0, 5))}`);
  assert.ok(new Set(S.map((s) => s.shown)).size > 40, 'the frames move: 4.6 s of a 2 s loop show most of its frames');
  const d = r.seq1, b = r.seq0;
  assert.equal(d.skipped - b.skipped, 0, 'no frame skipped'); assert.ok(d.late - b.late <= 4, `late output frames: ${d.late - b.late}`);
  assert.ok(d.wrapLog.length >= 2 && d.wrapLog.every((w) => w.first === 0), `wraps: ${JSON.stringify(d.wrapLog)}`);
  assert.ok(d.wrapLog.filter((w) => w.late !== 0).length <= 1, `the loop should wrap without a late frame: ${JSON.stringify(d.wrapLog)}`);
  const c = r.corners;
  assert.ok(near(c.tl, MARKERS.topLeft, 80) && near(c.tr, MARKERS.topRight, 80) && near(c.bl, MARKERS.bottomLeft, 80) && near(c.br, MARKERS.bottomRight, 80), `H.264 corners ${JSON.stringify(c)}`);
  assert.equal(r.info.kind, 'video'); assert.deepEqual([r.info.w, r.info.h], [256, 32]);
  // the in-point: the first frames are 24, 25… (never 15, the keyframe the decoder starts from), then it holds at 41 (out 1.4 s = frame 42, last 41)
  // the in-point: nothing before frame 24 is ever shown (15 is the keyframe the decoder starts from, 16–23 are decoded and thrown away);
  // the first frames may be late (a first launch has no preload: ≤ 3 samples with nothing shown yet), then every frame is the one said
  const M_ = r.mid.filter((s) => s.shown >= 0), fresh = r.mid.length - M_.length;
  assert.ok(M_.length > 8, `${M_.length} samples`); assert.ok(fresh <= 3, `${fresh} samples before the first frame`);
  assert.ok(M_.slice(1).every((s) => s.stripe === s.shown), `the image is the frame said: ${JSON.stringify(M_.filter((s) => s.stripe !== s.shown))}`);
  const lo = Math.min(...M_.slice(1).map((s) => s.shown));
  assert.ok(lo >= 24 && lo <= 27, `first frame ${lo}`);
  assert.equal(r.midEnd.shown, 41); assert.equal(r.midEnd.stripe, 41, 'held on the last frame of the segment');
  assert.deepEqual([r.after.players, r.after.centre], [0, [0, 0, 0]]);
});
