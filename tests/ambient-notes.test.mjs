// "Ambient notes" sound experience (experiences/ambient-notes). The pure logic (scales, chords, voice book, impulse
// response) runs in Node; the sound itself is rendered with an OfflineAudioContext in a hidden Electron window
// (tests/ui/runner.cjs, as tests/alma-fluid.test.mjs does) against a fake host (experiences/ambient-notes/test-host.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'experiences', 'ambient-notes');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: the rendering tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/* ------------------------------------------------------------------ in the page */

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>t</title>'); return; }
      const abs = path.join(root, p);
      if (!p.startsWith('/experiences/ambient-notes/') || !abs.startsWith(dir) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// every page script starts with this: the fake host, the piece, and `run` (build a host, start the piece, plan, render)
const PRELUDE = `
  const T = await import('/experiences/ambient-notes/test-host.js');
  const mod = await import('/experiences/ambient-notes/sound.js');
  const SR = 48000;
  // run({ over, seconds, speakers, wallIds, sub }, (host, piece) => { host.touch(...); host.at(...) }) → { host, piece, ch }
  const run = async (o, plan) => {
    const host = await T.fakeHost({ seconds: o.seconds ?? 6, speakers: o.speakers ?? 2, wallIds: o.wallIds, sub: o.sub ?? true, overrides: o.over || {} });
    const piece = await mod.default(host);
    if (plan) await plan(host, piece);
    const ch = await host.render();
    return { host, piece, ch };
  };
  const wallRms = (r, id, t0, t1) => Math.sqrt(r.host.channelsOf[id].reduce((a, c) => a + T.rms(r.ch[c], SR, t0, t1) ** 2, 0));
  const hz2midi = (f) => 69 + 12 * Math.log2(f / 440);
`;

async function inPage(script) {
  const { server, port } = await serve();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-notes-'));
  const file = path.join(tmp, 'script.js');
  fs.writeFileSync(file, PRELUDE + script);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${port}/blank.html`, `--script=${file}`, '--wait=load'];
    const outText = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    assert.deepEqual(data.errors, [], `page errors: ${data.errors.join(' | ')}`);
    if (process.env.VT_VERBOSE) console.log(JSON.stringify(data.result));
    return data.result;
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ the package (no browser) */

test('ambient-notes: manifest, files and rules of the project', () => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.id, 'ambient-notes');
  assert.equal(m.kind, 'sound');
  assert.equal(m.entry, 'sound.js');
  assert.deepEqual(m.params.map((p) => p.key), ['key', 'scale', 'lowOctave', 'octaves', 'attack', 'swell', 'release', 'reverbMix', 'padVolume', 'notesVolume', 'padChange', 'positionFilter', 'maxPerWall', 'maxNotes']);
  for (const p of m.params) {
    assert.ok(['number', 'select', 'bool', 'wall'].includes(p.type), `${p.key}: type ${p.type}`);
    assert.ok(p.label && /^[\x20-\x7e]+$/.test(p.label), `${p.key}: English label`);
    if (p.type === 'number') assert.ok(p.default >= p.min && p.default <= p.max && p.step > 0, `${p.key}: default inside its range`);
    if (p.type === 'select') assert.ok(p.options.some(([v]) => v === p.default), `${p.key}: default is one of the options`);
  }
  assert.deepEqual(m.params.find((p) => p.key === 'key').options.map(([v]) => v), ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  assert.ok(m.params.find((p) => p.key === 'scale').options.length >= 5);
  for (const f of ['sound.js', 'theory.js', 'voices.js', 'ir.js', 'test-host.js']) assert.ok(fs.existsSync(path.join(dir, f)), `${f} exists`);
  // the piece makes its own sound and leaves the output to the host
  const src = fs.readFileSync(path.join(dir, 'sound.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/ctx\.destination|\.destination\b/.test(src), 'never connects to the destination: the host owns the output');
  assert.ok(!/fetch\(|decodeAudioData|new Audio\(|<audio|\.wav|\.mp3|\.ogg/i.test(src), 'no sample is loaded');
  assert.ok(!/new (Oscillator|ConstantSource|AudioBufferSource)Node/.test(src), 'sources come from the context factories (so the host/tests can count them)');
  for (const f of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes('\r'), `${f}: LF line endings`);
});

/* ------------------------------------------------------------------ scales, notes and chords */

test('ambient-notes: height picks a note of the scale — low is low, high is high — in every key and scale', async () => {
  const { KEYS, SCALES, scaleLadder, noteForHeight, inScale, V_LOW, V_HIGH } = await load('theory.js');
  assert.equal(KEYS.length, 12);
  for (const key of KEYS) for (const scale of Object.keys(SCALES)) {
    const ladder = scaleLadder(key, scale, 3, 2);
    for (const n of ladder) assert.ok(inScale(n, key, scale), `${key} ${scale}: ${n} belongs to the scale`);
    assert.deepEqual([...ladder].sort((a, b) => a - b), ladder, 'ascending');
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.01) { const n = noteForHeight(v, ladder); assert.ok(n >= last, 'never goes down as the hand goes up'); last = n; assert.ok(ladder.includes(n)); }
    assert.equal(noteForHeight(0, ladder), ladder[0]);
    assert.equal(noteForHeight(1, ladder), ladder[ladder.length - 1]);
    assert.ok(noteForHeight(0.2, ladder) < noteForHeight(0.8, ladder));
  }
  // C3 = MIDI 48: octave 3, two octaves, C major pentatonic
  assert.deepEqual(scaleLadder('C', 'major-pentatonic', 3, 1), [48, 50, 52, 55, 57, 60]);
  assert.deepEqual(scaleLadder('D', 'minor-pentatonic', 2, 1).map((n) => n % 12), [2, 5, 7, 9, 0, 2]);
  assert.ok(V_LOW > 0 && V_HIGH < 1, 'the very floor and top are not needed to reach the ends');
  assert.equal(noteForHeight(V_LOW, scaleLadder('C', 'dorian', 3, 3)), 48);
  assert.ok(noteForHeight(V_HIGH, scaleLadder('C', 'dorian', 3, 3)) >= 78, 'a hand near the top reaches the top octave');
  // the note range follows the parameters
  assert.ok(scaleLadder('C', 'dorian', 3, 4).length > scaleLadder('C', 'dorian', 3, 1).length);
  assert.ok(scaleLadder('C', 'dorian', 4, 1)[0] === 60);
});

test('ambient-notes: the pad\'s chords are made of the scale\'s own notes, change every time, and keep the bass below', async () => {
  const { KEYS, SCALES, chordFor, inScale } = await load('theory.js');
  for (const key of KEYS) for (const scale of Object.keys(SCALES)) {
    let prev = null;
    for (let step = 0; step < 20; step++) {
      const ch = chordFor(key, scale, step);
      assert.equal(ch.notes.length, 4);
      for (const n of [...ch.notes, ch.bass]) assert.ok(inScale(n, key, scale), `${key} ${scale} step ${step}: ${n} is in the scale`);
      assert.ok(ch.bass < Math.min(...ch.notes), 'the bass is below the chord');
      assert.ok(ch.notes.every((n) => n >= 40 && n <= 76), `inside a warm register: ${ch.notes}`);
      assert.equal(ch.bass % 12, ch.root % 12, 'the bass plays the root');
      const sig = ch.notes.join(',');
      if (prev) assert.notEqual(sig, prev, `${key} ${scale}: chord ${step} differs from the one before`);
      prev = sig;
    }
    assert.deepEqual(chordFor(key, scale, 0), chordFor(key, scale, chordFor(key, scale, 0) && SCALES[scale].length === 5 ? 6 : 8), 'the progression cycles');
  }
});

test('ambient-notes: the impulse response is generated — decorrelated channels, a decay of 60 dB, darker as it goes', async () => {
  const { makeImpulse, rng } = await load('ir.js');
  const sr = 48000, T = 3;
  const [L, R] = makeImpulse({ sampleRate: sr, seconds: T, seed: 4 });
  const rmsOf = (d, a, b) => { let s = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) s += d[i] * d[i]; return Math.sqrt(s / ((b - a) * sr)); };
  assert.ok(L.length >= sr * T && L.every(Number.isFinite) && R.every(Number.isFinite));
  // decorrelated: independent noise in each ear
  let sLR = 0, sLL = 0, sRR = 0;
  for (let i = 0; i < L.length; i++) { sLR += L[i] * R[i]; sLL += L[i] * L[i]; sRR += R[i] * R[i]; }
  assert.ok(Math.abs(sLR / Math.sqrt(sLL * sRR)) < 0.05, `left and right are decorrelated (${(sLR / Math.sqrt(sLL * sRR)).toFixed(3)})`);
  // exponential decay: −60 dB at the stated time (energy-wise, within a few dB), nothing before the pre-delay
  const early = rmsOf(L, 0.05, 0.15), late = rmsOf(L, T - 0.2, T);
  const dbDrop = 20 * Math.log10(late / early);
  assert.ok(dbDrop < -50 && dbDrop > -70, `about −60 dB by the end (${dbDrop.toFixed(1)} dB)`);
  assert.equal(Math.max(...L.slice(0, 0.01 * sr).map(Math.abs)), 0, 'a pre-delay of silence');
  assert.ok(Math.abs(L[Math.floor(0.0185 * sr)]) < 0.05, 'a soft onset, not a click');
  // darker: the first-difference (high-frequency) share is smaller late than early
  const hf = (d, a, b) => { let n = 0, e = 0; for (let i = Math.floor(a * sr) + 1; i < Math.floor(b * sr); i++) { n += (d[i] - d[i - 1]) ** 2; e += d[i] ** 2; } return n / e; };
  assert.ok(hf(L, 2, 2.5) < hf(L, 0.05, 0.3) * 0.6, 'high frequencies die first');
  // the same seed gives the same sound; another seed another one
  assert.deepEqual(makeImpulse({ sampleRate: 8000, seconds: 0.2, seed: 4 }), makeImpulse({ sampleRate: 8000, seconds: 0.2, seed: 4 }));
  assert.notDeepEqual(makeImpulse({ sampleRate: 8000, seconds: 0.2, seed: 4 })[0], makeImpulse({ sampleRate: 8000, seconds: 0.2, seed: 5 })[0]);
  const r = rng(3); const xs = Array.from({ length: 1000 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1) && Math.abs(xs.reduce((a, b) => a + b) / 1000 - 0.5) < 0.06);
});

/* ------------------------------------------------------------------ the voice book */

test('ambient-notes: notes are keyed by stroke — a repeated down gives no second note; the oldest yields at the caps', async () => {
  const { VoiceBook } = await load('voices.js');
  const b = new VoiceBook({ maxPerWall: 3, maxTotal: 5 });
  const a1 = b.add({ stroke: 1, wallId: 'P1', t: 0 });
  assert.ok(a1.voice && !a1.duplicate);
  // the same stroke lands again (whatever tracker id carries it): the same note, no new one
  const dup = b.add({ stroke: 1, wallId: 'P1', t: 0.1 });
  assert.deepEqual([dup.voice, dup.duplicate, dup.evict.length], [null, true, 0]);
  assert.equal(b.count(), 1);
  assert.equal(b.get(1), a1.voice);
  // a different stroke is a different note even on the same wall
  b.add({ stroke: 2, wallId: 'P1', t: 0.2 });
  b.add({ stroke: 3, wallId: 'P1', t: 0.3 });
  assert.equal(b.count('P1'), 3);
  // the 4th note on a wall: the oldest of that wall yields
  const r4 = b.add({ stroke: 4, wallId: 'P1', t: 0.4 });
  assert.deepEqual(r4.evict.map((v) => v.stroke), [1], 'the oldest on the wall yields');
  assert.equal(r4.evict[0].state, 'stolen');
  assert.ok(!b.has(1), 'a note that yielded is not held any more');
  assert.equal(b.release(1), null, 'lifting the hand of a note that yielded does nothing');
  assert.equal(b.count('P1'), 3);
  // total cap across walls: the oldest of all
  b.add({ stroke: 5, wallId: 'P2', t: 0.5 });
  b.add({ stroke: 6, wallId: 'P2', t: 0.6 });
  assert.equal(b.count(), 5);
  const r7 = b.add({ stroke: 7, wallId: 'P3', t: 0.7 });
  assert.deepEqual(r7.evict.map((v) => v.stroke), [2], 'at the total cap the oldest in the room yields');
  assert.equal(b.count(), 5);
  // tails go before held notes
  const tail = b.release(3);
  assert.equal(tail.state, 'tail');
  assert.ok(!b.has(3) && b.count() === 5, 'a released note keeps sounding (its tail) and counts');
  const r8 = b.add({ stroke: 8, wallId: 'P3', t: 0.8 });
  assert.deepEqual(r8.evict.map((v) => v.stroke), [3], 'the note dying away yields before held ones');
  // a stroke can land again once its note has been released
  b.release(8);
  assert.ok(b.add({ stroke: 8, wallId: 'P3', t: 0.9 }).voice, 'a released stroke id may start a new note');
  // lowering the caps live
  const c = new VoiceBook({ maxPerWall: 4, maxTotal: 12 });
  for (let i = 0; i < 4; i++) c.add({ stroke: i, wallId: 'P1', t: i });
  c.setLimits({ maxPerWall: 2, maxTotal: 12 });
  assert.deepEqual(c.enforce().map((v) => v.stroke), [0, 1]);
  assert.equal(c.count(), 2);
  c.finish(c.get(2));
  assert.equal(c.count(), 1);
});

/* ------------------------------------------------------------------ rendering */

test('ambient-notes: a touch on P2 sounds only on the speakers of P2 (notes, their reverb and their tail)', opt, async () => {
  const r = await inPage(`
    const wallIds = ['P1', 'P2', 'P3', 'P4'];
    const r = await run({ seconds: 7, over: { padVolume: 0 } }, (h) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P2', u: 0.5, v: 0.5 });
      h.touch(2.0, 'up', { stroke: 1, wallId: 'P2', u: 0.5, v: 0.5 });
    });
    const win = [[0.6, 2.0], [2.2, 5]];
    const by = Object.fromEntries(wallIds.map((id) => [id, win.map(([a, b]) => wallRms(r, id, a, b))]));
    // an unknown wall (not in the audio map): nothing sounds and nothing throws
    const u = await run({ seconds: 3, wallIds: ['P1', 'P2'], over: { padVolume: 0 } }, (h) => { h.touch(0.5, 'down', { stroke: 1, wallId: 'P9', u: 0.5, v: 0.5 }); });
    const unknownCounts = u.piece._debug.counts();
    const unknownPeak = Math.max(...u.ch.map((c) => T.peak(c)));
    // the position along the wall moves the note between the wall's two speakers
    const pos = await run({ seconds: 5, over: { padVolume: 0, reverbMix: 0 } }, (h) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P3', u: 0.0, v: 0.5 });
      h.touch(1.5, 'move', { stroke: 1, wallId: 'P3', u: 1.0, v: 0.5 });
      h.touch(4.5, 'up', { stroke: 1, wallId: 'P3', u: 1.0, v: 0.5 });
    });
    const [lc, rc] = pos.host.channelsOf.P3;
    return { by, sub: T.rms(r.ch[r.host.subCh], SR, 0.6, 2), unknownCounts, unknownPeak, positions: pos.host.calls.positions.length,
      left: [T.rms(pos.ch[lc], SR, 0.8, 1.4), T.rms(pos.ch[rc], SR, 0.8, 1.4)], right: [T.rms(pos.ch[lc], SR, 3, 4), T.rms(pos.ch[rc], SR, 3, 4)] };`);
  for (const [i, name] of [[0, 'while it is held'], [1, 'in its tail']]) {
    const own = r.by.P2[i];
    assert.ok(own > 0.003, `P2 sounds ${name} (rms ${own})`);
    for (const id of ['P1', 'P3', 'P4']) assert.ok(r.by[id][i] < own / 100, `${id} stays silent ${name} (${r.by[id][i]} vs ${own})`);
  }
  assert.ok(r.sub > 0, 'the note also feeds the sub sum');
  assert.equal(r.unknownCounts.total, 0, 'a wall that is not in the audio map plays nothing');
  assert.equal(r.unknownPeak, 0);
  assert.ok(r.positions >= 1, 'a move calls setPosition');
  assert.ok(r.left[0] > r.left[1] * 8, `at u = 0 the note is on the left speaker (${r.left})`);
  assert.ok(r.right[1] > r.right[0] * 8, `moved to u = 1 it goes to the right speaker (${r.right})`);
});

test('ambient-notes: a held hand makes a long note that grows, and lifting it fades out in a long tail', opt, async () => {
  const r = await inPage(`
    const rel = 3;
    const r = await run({ seconds: 10, over: { padVolume: 0, reverbMix: 0, release: rel } }, (h) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });
      h.touch(3.5, 'up', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });   // held for 3 s
    });
    const d = T.sum(r.ch, r.host.channelsOf.P1);
    const w = (a, b) => T.rms(d, SR, a, b);
    // a shorter hold with the same release, for comparison of the swell
    const tap = await run({ seconds: 4, over: { padVolume: 0, reverbMix: 0, release: rel } }, (h) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });
    });
    const dt = T.sum(tap.ch, tap.host.channelsOf.P1);
    return {
      early: w(0.9, 1.1), held: w(3.3, 3.45), at29: w(3.35, 3.4),
      afterUp: [w(3.6, 3.7), w(4.5, 4.6), w(5.5, 5.6), w(6.5, 6.6)],
      end: w(8.9, 9.9), peak: T.peak(d, SR, 0.5, 3.5), live: r.piece._debug.counts(),
      tapLate: T.rms(dt, SR, 3.3, 3.45),
      stepsHeld: T.maxStep(d, SR, 0.4, 3.5), peakHeld: T.peak(d, SR, 0.4, 3.5),
    };`);
  const dbOf = (x) => 20 * Math.log10(Math.max(x, 1e-12));
  assert.ok(r.held > 0.004, `energy is present at 2.9 s of holding (rms ${r.held})`);
  assert.ok(r.held > r.early * 0.9, 'the note does not die while the hand stays');
  assert.ok(r.afterUp[0] < r.held && r.afterUp[1] < r.afterUp[0] && r.afterUp[2] < r.afterUp[1] && r.afterUp[3] < r.afterUp[2], `after the lift it decays monotonically (${r.afterUp})`);
  assert.ok(dbOf(r.afterUp[1] / r.held) > -26, `a long tail: still audible 1 s after the lift (${dbOf(r.afterUp[1] / r.held).toFixed(1)} dB)`);
  assert.ok(dbOf(r.end / r.held) < -60, `below −60 dB after the tail (${dbOf(r.end / r.held).toFixed(1)} dB)`);
  assert.ok(r.peak < 0.12, `one note leaves plenty of headroom (peak ${r.peak})`);
  // the note keeps going while the hand stays (the control without a lift: nothing fades)
  assert.ok(r.tapLate > r.held * 0.9, `held without lifting for 3 s it is as loud as the held note (${r.tapLate} vs ${r.held})`);
  assert.ok(r.stepsHeld < r.peakHeld * 0.35, `no clicks while it is held (largest step ${r.stepsHeld}, peak ${r.peakHeld})`);
  assert.equal(r.live.live, 0, 'once the tail is over its nodes are gone');
});

test('ambient-notes: two touches at different heights play two DIFFERENT notes of the scale — and the key follows the parameters live', opt, async () => {
  const r = await inPage(`
    const r = await run({ seconds: 8, over: { padVolume: 0, reverbMix: 0, key: 'D', scale: 'minor-pentatonic', release: 0.6 } }, (h, piece) => {
      h.touch(0.3, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.2 });
      h.touch(2.2, 'up', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.2 });
      h.touch(3.0, 'down', { stroke: 2, wallId: 'P1', u: 0.5, v: 0.8 });
      h.touch(4.6, 'up', { stroke: 2, wallId: 'P1', u: 0.5, v: 0.8 });
      // the operator changes the key and the scale while the piece plays
      h.at(4.8, () => piece.setParams({ key: 'F#', scale: 'major-pentatonic' }));
      h.touch(5.0, 'down', { stroke: 3, wallId: 'P1', u: 0.5, v: 0.8 });
      h.touch(7.4, 'up', { stroke: 3, wallId: 'P1', u: 0.5, v: 0.8 });
    });
    const d = T.sum(r.ch, r.host.channelsOf.P1);
    const note = (t) => hz2midi(T.dominantHz(d, SR, t, 60, 2500));
    return { low: note(1.3), high: note(3.9), newKey: note(5.8), same: note(6.4) };`);
  const { inScale } = await load('theory.js');
  const near = (m) => Math.abs(m - Math.round(m));
  for (const [name, m] of [['low', r.low], ['high', r.high]]) {
    assert.ok(near(m) < 0.2, `${name}: ${m.toFixed(2)} is a note, not between two`);
    assert.ok(inScale(Math.round(m), 'D', 'minor-pentatonic'), `${name}: ${Math.round(m)} is in D minor pentatonic`);
  }
  assert.ok(Math.round(r.high) - Math.round(r.low) >= 5, `the higher hand plays a clearly higher note (${Math.round(r.low)} → ${Math.round(r.high)})`);
  assert.ok(near(r.newKey) < 0.2 && inScale(Math.round(r.newKey), 'F#', 'major-pentatonic'), `after the change the note is in F# major pentatonic (${r.newKey.toFixed(2)})`);
  assert.ok(!inScale(Math.round(r.newKey), 'D', 'minor-pentatonic') || Math.round(r.newKey) !== Math.round(r.high), 'and it is not the old key\'s note');
  assert.ok(Math.abs(r.same - r.newKey) < 0.2, 'the same height keeps the same note');
});

test('ambient-notes: one hand is one note — split ids and repeated downs do not add voices', opt, async () => {
  const r = await inPage(`
    // a pass the tracker splits into 3 ids: the runtime gives ONE stroke; the events carry different ids, same stroke
    const single = await run({ seconds: 5, over: { padVolume: 0, reverbMix: 0 } }, (h, piece) => {
      h.touch(0.5, 'down', { stroke: 7, id: 1, wallId: 'P2', u: 0.2, v: 0.5 });
      h.touch(1.0, 'move', { stroke: 7, id: 2, wallId: 'P2', u: 0.3, v: 0.5 });
      h.touch(1.1, 'down', { stroke: 7, id: 2, wallId: 'P2', u: 0.3, v: 0.5 });     // a down for a stroke that already has a note
      h.touch(1.5, 'move', { stroke: 7, id: 3, wallId: 'P2', u: 0.5, v: 0.5 });
      h.touch(1.6, 'down', { stroke: 7, id: 3, wallId: 'P2', u: 0.5, v: 0.5 });
      h.at(1.7, () => { window.__mid = piece._debug.counts(); window.__sources = h.sources.filter((s) => s.startAt !== null && s.kind === 'osc').length; });
      h.touch(3.0, 'up', { stroke: 7, id: 3, wallId: 'P2', u: 0.5, v: 0.5 });
      h.touch(3.1, 'up', { stroke: 7, id: 1, wallId: 'P2', u: 0.5, v: 0.5 });      // a second up changes nothing
    });
    const mid = window.__mid, sources = window.__sources;
    // control: the same hand with only one down
    const one = await run({ seconds: 3, over: { padVolume: 0, reverbMix: 0 } }, (h) => { h.touch(0.5, 'down', { stroke: 7, wallId: 'P2', u: 0.2, v: 0.5 }); h.at(1.7, () => { window.__ctl = h.sources.filter((s) => s.startAt !== null && s.kind === 'osc').length; }); });
    const d = T.sum(single.ch, single.host.channelsOf.P2);
    const pitchA = T.dominantHz(d, SR, 0.8, 60, 2500), pitchB = T.dominantHz(d, SR, 1.9, 60, 2500);
    // two strokes at once are two notes
    const two = await run({ seconds: 3, over: { padVolume: 0 } }, (h, piece) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P2', u: 0.2, v: 0.3 });
      h.touch(0.5, 'down', { stroke: 2, wallId: 'P2', u: 0.2, v: 0.7 });
      h.at(1, () => { window.__two = piece._debug.counts(); });
    });
    return { mid, sources, control: window.__ctl, pitchA, pitchB, after: single.piece._debug.counts(), two: window.__two, listeners: single.host.vt.listenerCount() };`);
  assert.equal(r.mid.total, 1, `3 downs and 3 ids of one stroke: one voice (${JSON.stringify(r.mid)})`);
  assert.equal(r.mid.held, 1);
  assert.equal(r.sources, r.control, `no extra oscillators for the repeated downs (${r.sources} vs ${r.control})`);
  assert.ok(Math.abs(r.pitchA - r.pitchB) < 1, `the note keeps its pitch through the whole pass (${r.pitchA.toFixed(1)} → ${r.pitchB.toFixed(1)} Hz)`);
  assert.equal(r.after.held, 0);
  assert.equal(r.two.held, 2, 'two strokes are two notes');
  assert.equal(r.listeners, 1, 'the piece listens to touches');
});

test('ambient-notes: 20 hands at once — voices stay under the caps, the oldest yield, and nothing gets near full scale', opt, async () => {
  const r = await inPage(`
    const touches = (h, t, n) => { for (let i = 0; i < n; i++) h.touch(t, 'down', { stroke: i, wallId: ['P1', 'P2', 'P3', 'P4'][i % 4], u: (i * 0.37) % 1, v: ((i * 0.23) % 0.8) + 0.1 }); };
    // the worst case for level: every control at its maximum
    const r = await run({ seconds: 6, over: { padVolume: 100, notesVolume: 100, reverbMix: 100, maxPerWall: 6, maxNotes: 24, attack: 0.05 } }, (h, piece) => {
      touches(h, 0.5, 20);
      h.at(2.5, () => { window.__c = piece._debug.counts(); window.__s = piece._debug.strokes(); window.__run = h.runningAt(h.ctx.currentTime); });
    });
    const worst = Math.max(...r.ch.map((c) => T.peak(c)));
    // the defaults: caps of 4 per wall and 12 in all
    const d = await run({ seconds: 6 }, (h, piece) => {
      touches(h, 0.5, 20);
      h.at(2.5, () => { window.__dc = piece._debug.counts(); window.__ds = piece._debug.strokes(); window.__drun = h.runningAt(h.ctx.currentTime); });
    });
    const dworst = Math.max(...d.ch.map((c) => T.peak(c)));
    const dh = d.piece._debug.counts();
    // 20 hands that lift again: the tails count until they are over
    return { maxCounts: window.__c, maxStrokes: window.__s, maxWorst: worst, counts: window.__dc, strokes: window.__ds, running: window.__drun, worst: dworst, total: dh.total };`);
  assert.ok(r.counts.total <= 12, `at most 12 voices at the default caps (${r.counts.total})`);
  assert.equal(r.counts.total, 12);
  for (const [id, n] of Object.entries(r.counts.perWall)) assert.ok(n <= 4, `${id} has at most 4 (${n})`);
  assert.ok(!r.strokes.includes(0) && !r.strokes.includes(1) && r.strokes.includes(19), `the oldest hands yielded, the newest are still sounding (${r.strokes})`);
  assert.ok(r.running <= 12 * 6 + 14, `no pile of oscillators (${r.running} running)`);
  assert.ok(r.worst < 0.9, `no sample near full scale before the host's limiter (peak ${r.worst})`);
  assert.ok(r.maxWorst < 0.9, `...even with every volume at 100 % and the caps at their maximum (peak ${r.maxWorst})`);
  assert.ok(r.maxCounts.total <= 24 && r.maxCounts.total > 12, `the caps are parameters (${r.maxCounts.total})`);
  for (const n of Object.values(r.maxCounts.perWall)) assert.ok(n <= 6);
});

test('ambient-notes: a note that yields fades out quickly — it never cuts', opt, async () => {
  const r = await inPage(`
    // (a) a new hand lands on a wall that is full: the oldest yields
    const a = await run({ seconds: 4, over: { padVolume: 0, reverbMix: 0, maxPerWall: 2, attack: 0.05 } }, (h, piece) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.3 });
      h.touch(1.0, 'down', { stroke: 2, wallId: 'P1', u: 0.5, v: 0.5 });
      h.touch(2.0, 'down', { stroke: 3, wallId: 'P1', u: 0.5, v: 0.7 });
      h.at(2.01, () => { window.__s = piece._debug.strokes(); });
    });
    // (b) the oldest yields with no new note starting at that moment, so only the fade is in the signal
    const b = await run({ seconds: 4, over: { padVolume: 0, reverbMix: 0, maxPerWall: 4, attack: 0.05 } }, (h, piece) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.3 });
      h.touch(1.0, 'down', { stroke: 2, wallId: 'P1', u: 0.5, v: 0.5 });
      h.at(2.0, () => piece.setParams({ maxPerWall: 1 }));
      h.at(2.01, () => { window.__s2 = piece._debug.strokes(); });
    });
    const db = T.sum(b.ch, b.host.channelsOf.P1);
    // (c) the total cap: a hand on another wall makes the only note on P1 yield; P1's channels carry nothing but its fade
    const c = await run({ seconds: 4, over: { padVolume: 0, reverbMix: 0, maxNotes: 1 } }, (h) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.4 });
      h.touch(2.0, 'down', { stroke: 2, wallId: 'P2', u: 0.5, v: 0.4 });
    });
    const dc = T.sum(c.ch, c.host.channelsOf.P1);
    const fade = [T.rms(dc, SR, 1.9, 1.99), T.rms(dc, SR, 2.01, 2.03), T.rms(dc, SR, 2.1, 2.2), T.rms(dc, SR, 2.8, 3.5)];
    // the note that yields, alone: how loud it is (a cut would step by about that much)
    const solo = await run({ seconds: 3, over: { padVolume: 0, reverbMix: 0, attack: 0.05 } }, (h) => { h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.3 }); });
    return { fade, strokes: window.__s, strokes2: window.__s2, step: T.maxStep(db, SR, 1.95, 2.9), normal: T.maxStep(db, SR, 1.4, 1.95), soloPeak: T.peak(T.sum(solo.ch, solo.host.channelsOf.P1), SR, 1.5, 2.5),
      counts: a.piece._debug.counts() };`);
  assert.deepEqual(r.strokes.sort(), [2, 3], 'stroke 1, the oldest, yielded');
  assert.deepEqual(r.strokes2, [2], 'and lowering the cap makes the oldest yield too');
  assert.ok(r.step < r.soloPeak * 0.15, `the fade has no step in it (largest step ${r.step}; the note alone peaks at ${r.soloPeak}, a cut would step that much)`);
  assert.ok(r.step < r.normal * 2 + 0.001, `...no more than the notes make on their own (${r.step} vs ${r.normal})`);
  assert.ok(r.fade[0] > 0.004, `the note is sounding before it yields (${r.fade[0]})`);
  assert.ok(r.fade[1] > r.fade[0] * 0.5, `it is still there 10-30 ms later, fading — not cut (${r.fade[1]} vs ${r.fade[0]})`);
  assert.ok(r.fade[2] < r.fade[1] && r.fade[2] > 0, `quick fade (${r.fade[2]})`);
  assert.ok(r.fade[3] < r.fade[0] / 300, `and gone well within a second (${r.fade[3]})`);
  assert.equal(r.counts.live, 2, 'the note that yielded has been taken apart');
});

test('ambient-notes: the note starts at the moment of the touch — well inside 150 ms', opt, async () => {
  const r = await inPage(`
    const r = await run({ seconds: 3, over: { padVolume: 0, reverbMix: 0, attack: 0.15 } }, (h) => {
      h.touch(1.0, 'down', { stroke: 1, wallId: 'P4', u: 0.5, v: 0.5 });
    });
    const d = T.sum(r.ch, r.host.channelsOf.P4);
    let first = null;
    for (let i = Math.floor(0.9 * SR); i < d.length; i++) if (Math.abs(d[i]) > 3e-4) { first = i / SR - 1.0; break; }
    return { first, before: T.peak(d, SR, 0, 0.99), quiet: T.peak(d, SR, 1.0, 1.01) };`);
  assert.equal(r.before, 0, 'silence before the touch (no pad here)');
  assert.ok(r.first !== null && r.first < 0.06, `sound within 60 ms of the touch (${r.first && (r.first * 1000).toFixed(1)} ms)`);
});

test('ambient-notes: a touch is felt the moment it lands — the note is STRUCK (loud within 10 ms), rings down, then swells while held', opt, async () => {
  const r = await inPage(`
    const r = await run({ seconds: 6, over: { padVolume: 0, reverbMix: 0 } }, (h) => {
      h.touch(1.0, 'down', { stroke: 1, wallId: 'P4', u: 0.5, v: 0.5 });
    });
    const d = T.sum(r.ch, r.host.channelsOf.P4);
    return { strike: T.rms(d, SR, 1.002, 1.012), rung: T.rms(d, SR, 1.5, 1.6), held: T.rms(d, SR, 5.4, 5.6), maxStep: T.maxStep(d, SR, 1.0, 1.02) };`);
  // with a soft fade-in (the old 150 ms ramp) the first 10 ms are at a few % of the note: the touch is not felt
  assert.ok(r.strike > r.rung * 1.2, `the strike is the loudest moment: ${r.strike} in the first 10 ms vs ${r.rung} at 0.5 s`);
  assert.ok(r.held > r.rung * 1.3, `a held hand lets the note swell after the strike (${r.rung} → ${r.held})`);
  assert.ok(r.maxStep < 0.05, `quick but not a click: no jump between samples (${r.maxStep})`);
});

test('ambient-notes: with the default values the people come first — a touch stands well above the pad on its wall', opt, async () => {
  const r = await inPage(`
    const both = await run({ seconds: 5 }, (h) => { h.touch(2.0, 'down', { stroke: 1, wallId: 'P4', u: 0.5, v: 0.5 }); });
    const pad = await run({ seconds: 5 });
    const on = (x, t0, t1) => T.rms(T.sum(x.ch, x.host.channelsOf.P4), SR, t0, t1);
    return { pad: on(pad, 2.0, 4.5), strike: on(both, 2.0, 2.1), held: on(both, 3.0, 4.5) };`);
  const db = (a, b) => 20 * Math.log10(a / b);
  if (process.env.VT_VERBOSE) console.log(`  strike +${db(r.strike, r.pad).toFixed(1)} dB, held +${db(r.held, r.pad).toFixed(1)} dB over the pad`);
  assert.ok(db(r.strike, r.pad) > 8, `the strike is well above the pad (${db(r.strike, r.pad).toFixed(1)} dB)`);
  assert.ok(db(r.held, r.pad) > 7.5, `and so is the held note (${db(r.held, r.pad).toFixed(1)} dB)`);
});

test('ambient-notes: the pad plays alone, on every wall, with its low end in the sub — and moves very slowly', opt, async () => {
  const r = await inPage(`
    const r = await run({ seconds: 16, over: { padChange: 8 } }, (h, piece) => {
      h.at(9, () => { window.__before = piece._debug.chord(); piece._debug.nextChord(); });
      h.at(15, () => { window.__after = piece._debug.chord(); });
    });
    const wall = (id) => T.sum(r.ch, r.host.channelsOf[id]);
    const p1 = wall('P1');
    const win = (a, b) => T.rms(p1, SR, a, b);
    // short windows through the chord change: how much the level jumps from one to the next
    const levels = []; for (let t = 5; t < 15.5; t += 0.5) levels.push(win(t, t + 0.5));
    const steps = levels.slice(1).map((x, i) => Math.abs(20 * Math.log10(x / levels[i])));
    const spec = (t) => { const s = T.spectrum(p1, SR, t); return Array.from(s.mag.slice(0, 2400)); };
    const a = spec(6), b = spec(14), a2 = spec(7);
    const cos = (x, y) => { let n = 0, p = 0, q = 0; for (let i = 0; i < x.length; i++) { n += x[i] * y[i]; p += x[i] * x[i]; q += y[i] * y[i]; } return n / Math.sqrt(p * q); };
    // the low end: little under 90 Hz on the walls, the bass in the sub
    const low = (d) => { const s = T.spectrum(d, SR, 6); let lo = 0, all = 0; for (let i = 1; i < 6000; i++) { const f = i * s.hzPerBin; if (f < 90) lo += s.mag[i] ** 2; else all += s.mag[i] ** 2; } return lo / all; };
    return {
      rms: ['P1', 'P2', 'P3', 'P4'].map((id) => T.rms(wall(id), SR, 6, 8)), sub: T.rms(r.ch[r.host.subCh], SR, 6, 8),
      early: win(0, 0.3), later: win(6, 8), maxStep: Math.max(...steps), similarNow: cos(a, a2), differentLater: cos(a, b),
      lowWall: low(p1), lowSub: low(r.ch[r.host.subCh]), before: window.__before.notes, after: window.__after.notes,
      peak: Math.max(...r.ch.map((c) => T.peak(c))), live: r.piece._debug.counts() };`);
  assert.ok(r.later > 0.003, `the pad is audible with no touches (rms ${r.later})`);
  assert.ok(r.early < r.later / 3, 'it comes in slowly');
  const hi = Math.max(...r.rms), lo = Math.min(...r.rms);
  assert.ok(lo > hi * 0.9, `the same pad on every wall (${r.rms})`);
  assert.ok(r.sub > 0.001, `the bass reaches the sub channel (${r.sub})`);
  assert.ok(r.lowWall < 0.02, `the walls carry little under 90 Hz (${r.lowWall})`);
  assert.ok(r.lowSub > 0.5, `...the sub carries it (${r.lowSub})`);
  assert.notDeepEqual(r.before, r.after, 'the chord changed');
  assert.ok(r.similarNow > 0.9, `it is steady between changes (similarity ${r.similarNow.toFixed(3)})`);
  assert.ok(r.differentLater < r.similarNow - 0.02, `a different chord later (${r.differentLater.toFixed(3)} vs ${r.similarNow.toFixed(3)})`);
  assert.ok(r.maxStep < 3, `the change is a slow crossfade: no level jump of more than 3 dB per half second (${r.maxStep.toFixed(2)})`);
  assert.ok(r.peak < 0.5, `the pad leaves headroom (peak ${r.peak})`);
  assert.ok(r.live.layers <= 2, 'old chords are taken apart');
});

test('ambient-notes: Notes volume and Reverb mix act on notes that are already sounding', opt, async () => {
  const r = await inPage(`
    // notes volume to 0 while a hand is held
    const a = await run({ seconds: 6, over: { padVolume: 0, reverbMix: 0 } }, (h, piece) => {
      h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });
      h.at(3, () => piece.setParams({ notesVolume: 0 }));
    });
    const da = T.sum(a.ch, a.host.channelsOf.P1);
    // reverb: the tail after a short note
    const tail = async (mix) => {
      const x = await run({ seconds: 7, over: { padVolume: 0, reverbMix: mix, release: 0.6 } }, (h) => {
        h.touch(0.5, 'down', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });
        h.touch(1.0, 'up', { stroke: 1, wallId: 'P1', u: 0.5, v: 0.5 });
      });
      return T.rms(T.sum(x.ch, x.host.channelsOf.P1), SR, 1.7, 2.2);
    };
    // the pad volume
    const pad = async (vol) => { const x = await run({ seconds: 8, over: { padVolume: vol } }); return T.rms(T.sum(x.ch, x.host.channelsOf.P1), SR, 6, 8); };
    return { before: T.rms(da, SR, 2.5, 2.9), after: T.rms(da, SR, 4, 5), dry: await tail(0), wet: await tail(100), quiet: await pad(10), loud: await pad(90) };`);
  assert.ok(r.before > 0.003 && r.after < r.before / 1000, `Notes volume 0 silences a held note (${r.before} → ${r.after})`);
  assert.ok(r.dry < 1e-5, `no reverb, no tail after a short note (${r.dry})`);
  assert.ok(r.wet > 1e-4 && r.wet > r.dry * 20, `Reverb mix 100 % leaves a tail (${r.wet})`);
  assert.ok(r.loud > r.quiet * 4, `Pad volume is the pad's level (${r.quiet} → ${r.loud})`);
});

test('ambient-notes: stop() releases every voice and leaves no timer, oscillator or listener behind', opt, async () => {
  const r = await inPage(`
    const timers = T.trackTimers();
    const host = await T.fakeHost({ seconds: 6, over: undefined });
    const piece = await mod.default(host);
    const beforeTimers = timers.live();
    for (let i = 0; i < 6; i++) host.touch(0.5, 'down', { stroke: i, wallId: ['P1', 'P2', 'P3'][i % 3], u: 0.5, v: 0.1 + i * 0.12 });
    host.touch(1.0, 'up', { stroke: 0, wallId: 'P1', u: 0.5, v: 0.1 });     // one note is already in its tail
    let mid = null, afterStop = null;
    host.at(2.0, () => { mid = { running: host.runningAt(2.0), timers: timers.live(), counts: piece._debug.counts(), listeners: host.vt.listenerCount() }; });
    host.at(3.0, async () => {
      await piece.stop(100);
      afterStop = { timers: timers.live(), listeners: host.vt.listenerCount() };
    });
    host.touch(3.2, 'down', { stroke: 99, wallId: 'P1', u: 0.5, v: 0.5 });   // after stop(): ignored
    const ch = await host.render();
    timers.restore();
    const unstopped = host.sources.filter((s) => s.startAt !== null && (s.stopAt === null || s.stopAt > 3.0 + 0.4)).length;
    return { beforeTimers, mid, afterStop, started: host.sources.filter((s) => s.startAt !== null).length, unstopped, runningAfter: host.runningAt(3.5),
      silent: Math.max(...ch.map((c) => T.peak(c, SR, 3.6, 6))), disconnected: host.calls.disconnects, opened: host.calls.wallInput.length,
      stopAgain: await piece.stop(10).then(() => 'ok') };`);
  assert.ok(r.beforeTimers >= 1, `the piece does use a timer while it plays (${r.beforeTimers}), so counting them means something`);
  assert.ok(r.mid.running > 20 && r.mid.counts.total === 6 && r.mid.listeners === 1, `six notes and the pad are sounding before stop (${JSON.stringify(r.mid)})`);
  assert.equal(r.afterStop.timers, 0, 'no timer or interval is left');
  assert.equal(r.afterStop.listeners, 0, 'the touch listener is removed');
  assert.equal(r.unstopped, 0, `every oscillator/source has been stopped (${r.started} were started)`);
  assert.equal(r.runningAfter, 0);
  assert.equal(r.silent, 0, 'silence after stop(), and a touch after stop() makes no sound');
  assert.equal(r.disconnected, r.opened, 'every wall input the piece opened was disconnected');
  assert.equal(r.stopAgain, 'ok', 'stop() twice is harmless');
});
