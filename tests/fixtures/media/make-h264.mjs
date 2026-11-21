// Generator of the small H.264 / AAC fixtures the format tests read (tests/fixtures/media/*.mp4, committed: a few kB each).
// RUN BY HAND, ONCE, on a computer with FFmpeg — the tests never run it and the product never uses FFmpeg (CLAUDE.md › Códecs):
//   node tests/fixtures/media/make-h264.mjs
// Origin of each file (FFmpeg 8.1 full build from winget Gyan.FFmpeg, libx264 + native AAC), so it can be made again:
//   h264-markers.mp4  256×32, 30 fps, 60 frames, High profile 4:2:0, B-frames (-bf 2) and a keyframe every 15 (-g 15): the frames
//                     of tests/fixtures/media/make-hap.mjs › picture() — corner markers and a 14-bit frame-number stripe — piped
//                     as raw RGBA. Fast start. No audio.
//   h264-click.mp4    64×32 black, 30 fps, 3 s, with an AAC-LC mono 48 kHz track: a 1 kHz burst of 5 ms at EXACTLY 2.000 s
//                     (aevalsrc), the rest silence. The encoder's priming (1024 samples) is in the edit list, as every AAC MP4 has it.
//   exif6.jpg         32×64 (portrait) JPEG of markerPicture(): corner markers TL red, TR green, BL blue, BR white; EXIF Orientation = 6,
//                     so a viewer shows it 64×32 turned a quarter clockwise (TL → top-right). Made by FFmpeg from a PNG, then the EXIF
//                     APP1 segment is inserted after SOI by this script.
//   click.mp3         1 s mono 48 kHz MP3 (libmp3lame, 64 kbps) with the same 5 ms burst at 0.500 s.
//   h264-hd.mp4       1920×1080 is NOT committed: the tests that need it make it in the scratchpad with FFmpeg.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { picture } from './make-hap.mjs';
import { markerPicture, pngFile } from './make-image.mjs';

const here = import.meta.dirname;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

function run(args, input) {
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr)}`);
}

// ---- markers
{
  const W = 256, H = 32, N = 60;
  const raw = Buffer.concat(Array.from({ length: N }, (_, f) => Buffer.from(picture(f, W, H))));
  run(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '30', '-i', '-', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', '14', '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-bf', '2', '-movflags', '+faststart', path.join(here, 'h264-markers.mp4')], raw);
}
// ---- click (video 3 s + AAC)
run(['-f', 'lavfi', '-i', 'color=c=black:s=64x32:r=30:d=3', '-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,2\\,2.005)\\,0.9*sin(2*PI*1000*t)\\,0):s=48000:d=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', path.join(here, 'h264-click.mp4')]);
// ---- a JPEG with EXIF orientation 6
{
  const tmp = path.join(here, 'exif6-src.png'), jpg = path.join(here, 'exif6.jpg');
  fs.writeFileSync(tmp, pngFile(32, 64, markerPicture(32, 64, { alphaBlock: false })));
  run(['-i', tmp, '-pix_fmt', 'yuvj444p', '-q:v', '1', jpg]);
  fs.rmSync(tmp);
  const j = fs.readFileSync(jpg);
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const exif = Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]), tiff]); // 'Exif' + two zero bytes
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  fs.writeFileSync(jpg, Buffer.concat([j.subarray(0, 2), seg, j.subarray(2)]));
}
// ---- an MP3
run(['-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,0.5\\,0.505)\\,0.9*sin(2*PI*1000*t)\\,0):s=48000:d=1', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', path.join(here, 'click.mp3')]);
for (const f of ['h264-markers.mp4', 'h264-click.mp4', 'exif6.jpg', 'click.mp3']) console.log(f, fs.statSync(path.join(here, f)).size, 'bytes');
