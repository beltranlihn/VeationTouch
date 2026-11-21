// An H.264 decode worker of the room output (docs/research/media-formats.md §2.4): the clips that are MP4 / MOV with H.264
// play through WebCodecs' VideoDecoder, with OUR demux (engine/media/mov.js, served as /shared/mov.js) and OUR clock: the
// engine's playhead() says which frame, this worker produces exactly that one. Unlike a HAP frame, a video frame depends on
// the ones before it (keyframe → P → B), so a decoder here HAS STATE; ui/js/mixer/video-pool.js gives each clip one worker
// (affinity) and a few requests in flight.
//
// A MODULE worker with Node, like hap-worker.js (the output window's workers have `nodeIntegrationInWorker`): the file is
// read with `fs`, never fetched. Messages:
//   {t:'init', req}                              → {t:'init', req, ok, err}
//   {t:'info', req, path}                        → {t:'info', req, ix:{fourcc, codec, width, height, count, fps, dur, kind:'video', rotation, gop, …}} | {t:'err'}
//   {t:'frame', req, path, idx, lane, tray, uid} → {t:'frame', req, idx, bm, w, h, tD} | {t:'stale', req, idx} | {t:'err', req, idx, msg}
//   {t:'release', uid}                           (no answer: the player `uid` is gone, its decoders go) · {t:'close', req, path} · {t:'closeall', req}
// `idx` is a frame of the ENGINE's timeline (floor(time · fps)); it is mapped to a sample by the presentation times (a
// variable-rate phone video keeps its clock). A request is answered in order, per lane; a lane is a decoder: 'main' is
// the playback, 'wrap' prepares the first frames of the segment while the main one is still at its end (the loop is
// seamless, as with HAP). A request of a newer trajectory (`tray`) than the lane's drops the older ones (stale).
//
// FLOW CONTROL (the lesson of F0: unbounded decoding filled the GPU process): a lane feeds the decoder only as far as the
// furthest frame asked for (+ the decoder's reorder depth), keeps at most CAP finished bitmaps, and a VideoFrame is turned
// into an ImageBitmap and CLOSED at once (a hardware decoder has a handful of surfaces: holding frames stops it).
// Errors start with a code: read:, no-moov, mov-bad, no-decoder:, unsupported-config:, decode:, no-node:, no-webcodecs:.

import { movIndex } from '/shared/mov.js';

let fs = null, nodeErr = '';
try { fs = require('fs'); } catch (e) { nodeErr = `no-node: the output window's workers have no Node (${e?.message || e})`; }

const CAP = 6;       // finished bitmaps a lane holds (a 7196×912 bitmap is 26 MB)
const WAIT_MS = 1500; // a frame asked for that has not come in this long is given up (the player asks again): a request must never hang
const LOOK = 3;      // samples fed beyond the one the furthest wanted frame needs (the decoder's reorder depth)
const QUEUE = 6;     // decodeQueueSize above which nothing more is fed
const codeOf = (e) => (/^[a-z0-9-]+:/.test(String(e?.message || e)) ? String(e.message || e) : `read: ${e?.message || e}`);

// ---------------------------------------------------------------------------------------------- open files

const files = new Map(); // path → { fd, v, used, tsSorted, idxMap, needDecode }
function open(path) {
  let f = files.get(path);
  if (!f) {
    if (!fs) throw new Error(nodeErr);
    let fd;
    try { fd = fs.openSync(path, 'r'); } catch (e) { throw new Error(`read: ${e.code === 'ENOENT' ? 'the file is not there' : e.message}`); }
    try {
      const size = fs.fstatSync(fd).size;
      const read = (o, l) => { const n = Math.max(0, Math.min(l, size - o)), b = Buffer.alloc(n); if (n && fs.readSync(fd, b, 0, n, o) !== n) throw new Error('read: short read'); return b; };
      const ix = movIndex(read, size), v = ix.video;
      if (!v || !v.native || !v.native.codecString) throw new Error('not-supported: not an H.264 video track');
      f = prepare({ fd, v, used: 0 });
    } catch (e) { try { fs.closeSync(fd); } catch { /* closed */ } throw new Error(codeOf(e)); }
    files.set(path, f);
    if (files.size > 16) { const old = [...files.entries()].sort((a, b) => a[1].used - b[1].used)[0]; if (old && old[0] !== path) forget(old[0]); }
  }
  f.used = performance.now();
  return f;
}
function forget(path) {
  const f = files.get(path);
  if (f) { for (const L of f.lanes || []) dropLane(L); try { fs.closeSync(f.fd); } catch { /* closed */ } files.delete(path); }
}

/** The tables the lanes need: presentation order, timestamps, the frame → sample map for the engine's timeline, what to feed for each frame. */
function prepare(f) {
  const v = f.v, n = v.native, count = v.count, order = n.order;
  const sorted = new Float64Array(count); for (let k = 0; k < count; k++) sorted[k] = v.present[order[k]];
  const first = sorted[0], last = sorted[count - 1];
  const fps = count > 1 && last > first ? Math.round(((count - 1) / (last - first)) * 1e6) / 1e6 : v.fps;
  // the engine's frame idx (floor(time · fps)) → the presentation index: the last frame shown at (idx + ½)/fps — identity for a constant rate
  const idxMap = new Int32Array(count);
  for (let i = 0, k = 0; i < count; i++) { const t = first + (i + 0.5) / fps; while (k + 1 < count && sorted[k + 1] <= t) k++; idxMap[i] = k; }
  // to have frame k come out, the samples up to the furthest one among frames 0..k must have been fed
  const need = new Int32Array(count); let m = 0; for (let k = 0; k < count; k++) { m = Math.max(m, order[k]); need[k] = m; }
  let gop = 0; const s = n.sync;
  if (s && s.length) { gop = s[0]; for (let i = 1; i < s.length; i++) gop = Math.max(gop, s[i] - s[i - 1]); gop = Math.max(gop, count - s[s.length - 1]); } else gop = 1;
  f.sorted = sorted; f.idxMap = idxMap; f.need = need; f.fps = fps; f.dur = count / fps; f.gop = gop; f.lanes = [];
  f.tsSorted = Float64Array.from(sorted, (t) => Math.round(t * 1e6));
  return f;
}
const kOfTs = (f, ts) => { // presentation index of a timestamp (µs): binary search in the sorted timestamps
  const a = f.tsSorted; let lo = 0, hi = a.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < ts) lo = mid + 1; else hi = mid; }
  return Math.abs(a[lo] - ts) <= 2 ? lo : -1;
};
/** The sync sample at or before decode index d. */
function keyBefore(f, d) {
  const s = f.v.native.sync;
  if (!s || !s.length) return d;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= d) lo = mid; else hi = mid - 1; }
  return s[lo] <= d ? s[lo] : 0;
}

// ---------------------------------------------------------------------------------------------- a lane: one decoder with state

let rb = null;
function newLane(path, f, name, uid) {
  const L = { path, f, name, uid, dec: null, seq: 0, fed: 0, ready: new Map(), waiters: [], keepMin: 0, lastReq: -1, lastOut: -1, tray: 0, flushed: false, err: null, canvas: null, inflight: new Set() };
  f.lanes.push(L);
  return L;
}
function dropLane(L) {
  L.seq++;
  try { L.dec?.close(); } catch { /* closed */ }
  L.dec = null;
  for (const bm of L.ready.values()) { try { bm.close(); } catch { /* closed */ } }
  L.ready.clear();
  for (const w of L.waiters.splice(0)) w.res({ stale: true });
  const i = L.f.lanes.indexOf(L); if (i >= 0) L.f.lanes.splice(i, 1);
}

function configure(L) {
  const f = L.f, v = f.v, n = v.native;
  if (typeof VideoDecoder === 'undefined') throw new Error('no-webcodecs: this window has no WebCodecs');
  try { L.dec?.close(); } catch { /* closed */ }
  const seq = ++L.seq;
  L.dec = new VideoDecoder({
    output: (frame) => onOutput(L, seq, frame),
    error: (e) => { if (L.seq === seq) { L.err = `decode: ${e?.message || e}`; failAll(L, L.err); } },
  });
  L.dec.configure({ codec: n.codecString, codedWidth: v.width, codedHeight: v.height, description: n.config, optimizeForLatency: true });
  L.dec.ondequeue = () => { if (L.seq === seq) pump(L); }; // the queue has room again: feed on (frames before the wanted one are decoded and dropped)
  L.flushed = false;
}

function failAll(L, msg) { for (const w of L.waiters.splice(0)) w.rej(new Error(msg)); }

/** A decoded frame: kept as an ImageBitmap if somebody can use it, closed in any case. */
function onOutput(L, seq, frame) {
  if (L.seq !== seq || !L.dec) { frame.close(); return; }
  const k = kOfTs(L.f, frame.timestamp);
  // nobody can want a frame before the earliest one asked for (unless the lane is keeping a whole GOP for a reverse play)
  const floor = L.keepLow ? L.keepMin : Math.max(L.keepMin, L.waiters.length ? Math.min(...L.waiters.map((w) => w.k)) : L.lastReq);
  if (k < floor || k < 0 || L.ready.has(k) || (L.ready.size >= CAP && !L.waiters.some((w) => w.k === k))) { frame.close(); pump(L); return; }
  const t0 = performance.now();
  const p = bitmapOf(L, frame).then((bm) => {
    frame.close();
    if (L.seq !== seq) { bm.close(); return; }
    L.lastOut = Math.max(L.lastOut, k);
    L.ready.set(k, bm);
    L.tD = performance.now() - t0;
    settle(L); pump(L);
  }, (e) => { try { frame.close(); } catch { /* closed */ } if (L.seq === seq) failAll(L, `decode: ${e?.message || e}`); });
  L.inflight.add(p); p.finally(() => L.inflight.delete(p));
}

/** The ImageBitmap of a frame, upright: turned by the track's rotation (a phone's portrait video) on a 2D canvas. */
async function bitmapOf(L, frame) {
  const rot = L.f.v.native.rotation || 0;
  if (!rot) return createImageBitmap(frame);
  const w = frame.displayWidth, h = frame.displayHeight, sw = rot === 180 ? w : h, sh = rot === 180 ? h : w;
  if (!L.canvas || L.canvas.width !== sw || L.canvas.height !== sh) L.canvas = new OffscreenCanvas(sw, sh);
  const g = L.canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, sw, sh);
  g.translate(sw / 2, sh / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(frame, -w / 2, -h / 2);
  return createImageBitmap(L.canvas);
}

function settle(L) {
  for (let i = L.waiters.length - 1; i >= 0; i--) {
    const w = L.waiters[i], bm = L.ready.get(w.k);
    if (bm) { L.ready.delete(w.k); L.waiters.splice(i, 1); clearTimeout(w.timer); w.res({ bm, k: w.k }); }
  }
}

/** Feeds the decoder as far as the furthest wanted frame needs (+ LOOK); at the end of the file, flushes the reorder buffer. */
function pump(L) {
  const f = L.f, v = f.v, n = v.native;
  if (!L.dec || L.err || !L.waiters.length) return;
  const want = Math.max(...L.waiters.map((w) => w.k)), upTo = Math.min(v.count - 1, f.need[want] + LOOK);
  while (L.fed <= upTo && L.dec.decodeQueueSize < QUEUE && L.ready.size < CAP) {
    const i = L.fed++;
    if (!rb || rb.length < v.sizes[i]) rb = Buffer.allocUnsafeSlow(Math.ceil(v.sizes[i] * 1.25));
    let got;
    try { got = fs.readSync(L.f.fd, rb, 0, v.sizes[i], v.offsets[i]); } catch (e) { L.err = `read: ${e.code || ''} ${e.message}`.trim(); failAll(L, L.err); return; }
    if (got !== v.sizes[i]) { L.err = 'read: short read (the file was cut short or its drive removed)'; failAll(L, L.err); return; }
    const isKey = !n.sync || n.sync.length === 0 || n.syncSet?.has(i) || (n.syncSet ??= new Set(n.sync)).has(i);
    try { L.dec.decode(new EncodedVideoChunk({ type: isKey ? 'key' : 'delta', timestamp: Math.round(v.present[i] * 1e6), data: rb.subarray(0, v.sizes[i]) })); } catch (e) { L.err = `decode: ${e?.message || e}`; failAll(L, L.err); return; }
  }
  if (L.fed > v.count - 1 && !L.flushed && L.waiters.length) { // the end of the stream: what the decoder still holds comes out on a flush
    L.flushed = true;
    const seq = L.seq;
    // (the bitmaps of the last frames are still being made when the flush ends: wait for them before saying a frame is not coming)
    L.dec.flush().then(() => Promise.allSettled([...L.inflight])).then(() => { if (L.seq === seq) { settle(L); for (const w of L.waiters.splice(0)) w.res({ gone: true }); } }, () => {});
  }
}

/** Starts the lane at the keyframe before presentation frame k; frames before `keep` are decoded but dropped. */
function seek(L, k, backward) {
  const f = L.f, d = f.v.native.order[k], key = keyBefore(f, d);
  configure(L);
  for (const bm of L.ready.values()) { try { bm.close(); } catch { /* closed */ } }
  L.ready.clear();
  for (let i = L.waiters.length - 1; i >= 0; i--) if (L.waiters[i].k < k) { L.waiters[i].res({ stale: true }); L.waiters.splice(i, 1); } // (asked for before the jump: of no use now)
  L.fed = key; L.lastOut = -1; L.err = null;
  // a backward step (bounce) keeps the whole GOP up to k, so the frames before k are there for the steps that follow
  L.keepLow = !!backward;
  if (backward) { let lo = k; while (lo > 0 && f.v.native.order[lo - 1] >= key && k - lo < CAP - 2) lo--; L.keepMin = lo; } else L.keepMin = k;
}

/** Frame `idx` of the engine's timeline from lane `L`: a promise of {bm, k}. */
function get(L, idx, tray) {
  const f = L.f, k = f.idxMap[Math.max(0, Math.min(f.v.count - 1, idx))];
  if (tray > L.tray) { // a new trajectory: what was asked before is of no use
    L.tray = tray;
    for (const w of L.waiters.splice(0)) w.res({ stale: true });
  } else if (tray < L.tray) return Promise.resolve({ stale: true });
  const backward = L.lastReq >= 0 && k < L.lastReq;
  L.lastReq = k;
  const have = L.ready.get(k);
  if (have) { L.ready.delete(k); return Promise.resolve({ bm: have, k }); }
  // the lane carries on while the frame is ahead of what it has produced and reachable by decoding on: in the same GOP
  // (its keyframe already fed) or close to what is fed. A decoder that has fallen behind (a CPU that is slower than the
  // clip's rate) shows its frames late, at the pace it manages, and once it is more than a GOP behind jumps to the keyframe of the frame
  // wanted: the picture follows at the decoder's rate and catches up in steps, instead of falling further and further behind.
  const base = Math.max(L.lastOut, L.keepMin - 1); // the last frame the lane has produced or been asked to skip
  const key = keyBefore(f, f.v.native.order[k]);
  const continues = !!L.dec && !L.err && k > base && (key <= L.fed || f.need[k] - L.fed <= Math.max(6, f.gop));
  if (!continues || backward) seek(L, k, backward);
  else {
    L.keepLow = false; L.keepMin = Math.max(L.keepMin, k - 1); // (frames before the one wanted are of no use now: they must not fill the lane)
  }
  return new Promise((res, rej) => {
    const w = { k, res, rej, timer: null };
    w.timer = setTimeout(() => { const i = L.waiters.indexOf(w); if (i >= 0) { L.waiters.splice(i, 1); res({ stale: true }); } }, WAIT_MS);
    L.waiters.push(w); pump(L);
  });
}

/** The lane for a request: 'main' (the playback) or 'wrap' (the loop's first frames). A main request that continues where the wrap lane is takes it over. */
function laneFor(path, name, f, k, uid) {
  let L = f.lanes.find((x) => x.uid === uid && x.name === name); // (a lane belongs to one player: two plays of one file have a decoder each)
  if (name === 'main') {
    const W = f.lanes.find((x) => x.uid === uid && x.name === 'wrap');
    if (W && W.dec && !W.err && (W.ready.has(k) || (k > W.lastOut && k - W.lastOut <= 4 && W.lastOut >= 0))) {
      const M = L; // the wrap lane has the loop's start: it becomes the main lane
      if (M) dropLane(M);
      W.name = 'main'; return W;
    }
  }
  return L || newLane(path, f, name, uid);
}

// ---------------------------------------------------------------------------------------------- messages

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.t === 'init') {
      const ok = !!fs && typeof VideoDecoder !== 'undefined';
      postMessage({ t: 'init', req: m.req, ok, err: ok ? '' : (fs ? 'no-webcodecs: this window has no WebCodecs' : nodeErr) });
      return;
    }
    if (m.t === 'info') {
      const f = open(m.path), v = f.v, n = v.native;
      postMessage({ t: 'info', req: m.req, ix: { kind: 'video', fourcc: v.fourcc, codec: n.codecString, width: v.width, height: v.height, count: v.count, fps: f.fps, dur: f.dur, gop: f.gop, rotation: n.rotation || 0 } });
      return;
    }
    if (m.t === 'frame') {
      const f = open(m.path), L = laneFor(m.path, m.lane === 'wrap' ? 'wrap' : 'main', f, f.idxMap[Math.max(0, Math.min(f.v.count - 1, m.idx | 0))], m.uid | 0);
      const t0 = performance.now();
      const r = await get(L, m.idx | 0, m.tray | 0);
      if (r.stale || r.gone) { postMessage({ t: 'stale', req: m.req, idx: m.idx }); return; }
      postMessage({ t: 'frame', req: m.req, idx: m.idx, bm: r.bm, w: r.bm.width, h: r.bm.height, tD: performance.now() - t0 }, [r.bm]);
      return;
    }
    if (m.t === 'release') { for (const f of files.values()) for (const L of [...f.lanes]) if (L.uid === (m.uid | 0)) dropLane(L); return; }
    if (m.t === 'closeall') { for (const k of [...files.keys()]) forget(k); postMessage({ t: 'closeall', req: m.req }); return; }
    if (m.t === 'close') { forget(m.path); postMessage({ t: 'close', req: m.req }); return; }
  } catch (err) { postMessage({ t: 'err', req: m.req, idx: m.idx, msg: codeOf(err) }); }
};
