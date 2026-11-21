// Convert to HAP, road A, in the REAL helper page (docs/research/media-formats.md P5): WebCodecs decodes the H.264, the GPU
// encoder DXT-compresses, hapFrame wraps, the engine writes the movie. What it writes is read back with the library's own HAP
// reader (decodeFrame): every frame there, in order (B-frames), the right way up, the sound on its clock, the rate honoured, a
// picture held as a second of movie. Electron hidden window through tests/ui/runner.cjs, as tests/media-page.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MARKERS } from './fixtures/media/make-hap.mjs';
import { pngFile, markerPicture } from './fixtures/media/make-image.mjs';

import { withHelperPage, sleep, convertAndOpen, frameOf, electronPath } from './fixtures/media/convert-rig.mjs';
const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'media', name));
const opt = { skip: !electronPath && 'electron is not installed' };
const near = (a, b, tol = 48) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Fails if a frame is lost or repeated (the B-frame order of the decoder), if the picture is upside down or the colours wrong
// (the GPU encoder's row order, the YCoCg conversion), if the sound is not where the clip says (the AAC priming), if the rate
// asked for is not honoured, or if the movie the page produced is not a movie the library reads.
test('convert (helper page): H.264 → HAP and HAP Q — every frame in order, upright, the click at 2.000 s, the rate honoured; a picture → one second', opt, async () => {
  const { result: r, errors } = await withHelperPage(async (rig) => {
    const m = rig.engine.media;
    for (let i = 0; i < 200 && !m.helper.online; i++) await sleep(50);
    const mp4 = path.join(rig.dir, 'markers.mp4'), click = path.join(rig.dir, 'click.mp4'), png = path.join(rig.dir, 'logo.png');
    fs.writeFileSync(mp4, fixture('h264-markers.mp4')); fs.writeFileSync(click, fixture('h264-click.mp4')); fs.writeFileSync(png, pngFile(64, 32, markerPicture(64, 32)));
    const out = { online: m.helper.online };
    const a = await convertAndOpen(rig, mp4, { codec: 'hap' });
    out.hap = { via: a.job.via, fourcc: a.d.video.fourcc, w: a.d.video.width, h: a.d.video.height, frames: a.d.video.frames, fps: a.d.video.fps,
      numbers: [0, 1, 7, 16, 31, 44, 59].map((f) => frameOf(a, f).number) };
    const f0 = frameOf(a, 0), last = frameOf(a, 59);
    out.hap.corners = { tl: f0.px(2, 2), tr: f0.px(253, 2), bl: f0.px(2, 29), br: f0.px(253, 29) };
    out.hap.last = { tl: last.px(2, 2), br: last.px(253, 29) };
    const q = await convertAndOpen(rig, mp4, { codec: 'hapq' });
    out.hapq = { fourcc: q.d.video.fourcc, frames: q.d.video.frames, numbers: [0, 30, 59].map((f) => frameOf(q, f).number), tl: frameOf(q, 0).px(2, 2), tr: frameOf(q, 0).px(253, 2), bl: frameOf(q, 0).px(2, 29) };
    const slow = await convertAndOpen(rig, mp4, { codec: 'hap', fps: 15 });
    out.fps15 = { frames: slow.d.video.frames, fps: slow.d.video.fps, numbers: [0, 1, 2, 10, 29].map((f) => frameOf(slow, f).number) };
    const c = await convertAndOpen(rig, click, { codec: 'hap' });
    const au = c.ix.audio, pcm = Buffer.alloc(0);
    let first = -1, peak = 0, at = 0;
    for (let k = 0; k < au.chunkOffsets.length && first < 0; k++) {
      for (let i = 0; i < au.chunkFrames[k]; i++) { const v = Math.abs(c.bytes.readInt16LE(au.chunkOffsets[k] + i * au.bytesPerFrame)); peak = Math.max(peak, v); if (first < 0 && v > 6000) first = at + i; }
      at += au.chunkFrames[k];
    }
    out.click = { rate: au.rate, channels: au.channels, frames: au.frames, first, peak, supported: c.d.audio.supported, videoFrames: c.d.video.frames, pcmLen: pcm.length };
    const p = await convertAndOpen(rig, png, { codec: 'hapa' });
    const pf = frameOf(p, 0);
    out.png = { fourcc: p.d.video.fourcc, frames: p.d.video.frames, fps: p.d.video.fps, w: p.d.video.width, h: p.d.video.height, distinct: new Set(p.ix.video.offsets).size,
      tl: pf.px(2, 2), tr: pf.px(61, 2), bl: pf.px(2, 29), br: pf.px(61, 29), shown: m.show.media.length };
    out.leftover = fs.existsSync(path.join(m.libraryDir, '.convert')) ? fs.readdirSync(path.join(m.libraryDir, '.convert')) : [];
    return out;
  });
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.online, true);
  assert.equal(r.hap.via, 'chromium');
  assert.deepEqual([r.hap.fourcc, r.hap.w, r.hap.h, r.hap.frames, r.hap.fps], ['Hap1', 256, 32, 60, 30]);
  assert.deepEqual(r.hap.numbers, [0, 1, 7, 16, 31, 44, 59], 'every frame is the frame it was: none lost, none repeated, B-frames in presentation order');
  assert.ok(near(r.hap.corners.tl, MARKERS.topLeft) && near(r.hap.corners.tr, MARKERS.topRight) && near(r.hap.corners.bl, MARKERS.bottomLeft) && near(r.hap.corners.br, MARKERS.bottomRight), `corners upright: ${JSON.stringify(r.hap.corners)}`);
  assert.ok(near(r.hap.last.tl, MARKERS.topLeft) && near(r.hap.last.br, MARKERS.bottomRight));
  assert.deepEqual([r.hapq.fourcc, r.hapq.frames, r.hapq.numbers], ['HapY', 60, [0, 30, 59]]);
  assert.ok(near(r.hapq.tl, MARKERS.topLeft, 64) && near(r.hapq.tr, MARKERS.topRight, 64) && near(r.hapq.bl, MARKERS.bottomLeft, 64), `HAP Q corners: ${JSON.stringify([r.hapq.tl, r.hapq.tr, r.hapq.bl])}`);
  assert.deepEqual([r.fps15.frames, r.fps15.fps], [30, 15]);
  r.fps15.numbers.forEach((n, i) => assert.ok(Math.abs(n - [0, 2, 4, 20, 58][i]) <= 1, `15 fps: output frame ${[0, 1, 2, 10, 29][i]} is source frame ${n}`));
  assert.deepEqual([r.click.rate, r.click.channels, r.click.supported], [48000, 1, true]);
  assert.ok(Math.abs(r.click.first - 96000) <= 48, `the click is at frame ${r.click.first}, it should be at 96000 (2.000 s)`);
  assert.ok(r.click.peak > 20000 && Math.abs(r.click.frames - 144000) <= 1100 && r.click.videoFrames === 90, JSON.stringify(r.click));
  assert.deepEqual([r.png.fourcc, r.png.frames, r.png.fps, r.png.w, r.png.h, r.png.distinct], ['Hap5', 30, 30, 64, 32, 1], 'a picture is a second of movie, one frame stored');
  assert.ok(near(r.png.tl, MARKERS.topLeft) && near(r.png.tr, MARKERS.topRight) && near(r.png.bl, MARKERS.bottomLeft) && near(r.png.br, MARKERS.bottomRight), `the picture is upright: ${JSON.stringify(r.png)}`);
  assert.deepEqual(r.leftover, [], 'no part file is left');
});
