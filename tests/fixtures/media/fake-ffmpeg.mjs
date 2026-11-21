// A stand-in for ffmpeg.exe for tests/convert.test.mjs: the engine runs it the way it runs the real one (the arguments are
// recorded), it prints `-progress` lines and a "Duration:" line, and writes a small real HAP movie to the last argument.
// FAKE_FFMPEG = ok (default) | fail | hang (progress forever until killed) ; FAKE_FFMPEG_LOG = a file the argv is written to ;
// FAKE_FFMPEG_PID = a file the pid is written to. TEST-ONLY.
import fs from 'node:fs';
import { makeHap } from './make-hap.mjs';

const args = process.argv.slice(2), out = args[args.length - 1], mode = process.env.FAKE_FFMPEG || 'ok';
if (process.env.FAKE_FFMPEG_LOG) fs.writeFileSync(process.env.FAKE_FFMPEG_LOG, JSON.stringify(args));
if (process.env.FAKE_FFMPEG_PID) fs.writeFileSync(process.env.FAKE_FFMPEG_PID, String(process.pid));
const fmt = args[args.indexOf('-format') + 1];
process.stderr.write('Input #0, mov,mp4, from \'in.mov\':\n  Duration: 00:00:00.40, start: 0.000000, bitrate: 1000 kb/s\n');
const tick = (us) => process.stdout.write(`frame=1\nout_time_us=${us}\nprogress=continue\n`);
if (mode === 'fail') { process.stderr.write('in.mov: Invalid data found when processing input\n'); process.exit(1); }
if (mode === 'hang') { fs.writeFileSync(out, 'partial'); tick(100000); setInterval(() => tick(200000), 50); } else {
  tick(200000);
  const { bytes } = makeHap({ variant: fmt === 'hap_q' ? 'hapq' : fmt === 'hap_alpha' ? 'hapa' : 'hap', width: 256, height: 32, frames: 12, fps: 30, audio: { codec: 'sowt', channels: 2, rate: 8000 } });
  fs.writeFileSync(out, bytes);
  process.stdout.write('frame=12\nout_time_us=400000\nprogress=end\n');
  process.exit(0);
}
