// The media helper (ui/helper.html, a hidden window of the desktop app; engine/media/helper.js is its other end). It takes
// jobs from the engine by long poll and answers with what only Chromium can do:
//   thumb       one picture of a file: an image, a video frame (H.264), a sound's waveform → two PNGs (160×90 and 480 wide)
//   canDecode   can this computer decode that video? (isConfigSupported AND a real sample decoded: it can say yes and fail)
//   audioDecode a sound (an MP4's AAC, or MP3 / AAC / FLAC / Ogg) → s16le PCM that starts at the clip's time 0
//   convert     a video or a picture → HAP frames, one by one, to the engine (Convert to HAP, path A): decoded by WebCodecs, DXT-compressed
//               on the (low-power) GPU, wrapped by hapFrame; the engine writes the .mov (engine/media/convert.js)
//
// Files are read through the engine (GET /api/helper/file/<token>, by byte ranges: a 2 GB video is never loaded whole).
// `window.__helper` exposes the handlers to the tests (tests/media-helper.test.mjs).

import { movIndexAsync } from '/shared/mov.js';
import { sniffKind, imageInfo, reducedSize } from '/shared/sniff.js';
import { hapFrame, HAP_FMT } from '/shared/hapenc.js';
import { createDxtEncoder } from './dxt-gpu.js';

const THUMB_W = [160, 480];
const SOUND_MAX_S = 20 * 60;

// ---------------------------------------------------------------------------------------------- files by ranges

/** A reader of a file the engine serves: size and read(offset, length) → Uint8Array. */
export async function openRemote(url) {
  const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  if (!r.ok && r.status !== 206) throw new Error(`read: ${r.status}`);
  await r.arrayBuffer();
  const cr = /\/(\d+)$/.exec(r.headers.get('Content-Range') || '');
  const size = cr ? Number(cr[1]) : Number(r.headers.get('Content-Length') || 0);
  const read = async (off, len) => {
    len = Math.max(0, Math.min(len, size - off));
    if (!len) return new Uint8Array(0);
    const x = await fetch(url, { headers: { Range: `bytes=${off}-${off + len - 1}` } });
    if (!x.ok && x.status !== 206) throw new Error(`read: ${x.status}`);
    return new Uint8Array(await x.arrayBuffer());
  };
  return { size, read };
}

// ---------------------------------------------------------------------------------------------- pictures → PNG

const png64 = async (cv) => {
  const blob = await (cv.convertToBlob ? cv.convertToBlob({ type: 'image/png' }) : new Promise((res) => cv.toBlob(res, 'image/png')));
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Both thumbnails of a picture `src` (ImageBitmap / VideoFrame…) of sw×sh. 160×90 fills the card (a strip wider than 3:1 shows
 *  its top and, along the bottom, the whole strip); 480 wide keeps the whole picture. */
async function thumbsOf(src, sw, sh) {
  const out = {};
  for (const w of THUMB_W) {
    let cw = w, ch;
    if (w === 160) ch = 90; else ch = Math.max(1, Math.round((480 * sh) / sw));
    const cv = new OffscreenCanvas(cw, ch), g = cv.getContext('2d');
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, cw, ch);
    g.imageSmoothingQuality = 'high';
    if (w === 160) {
      const band = sw / sh > 3 ? Math.max(8, Math.min(45, Math.round((160 * sh) / sw))) : 0, h2 = 90 - band, aspect = 160 / h2;
      let sx = 0, sy = 0, cwid = sw, chei = sh;
      if (sw / sh > aspect) { cwid = sh * aspect; sx = (sw - cwid) / 2; } else { chei = sw / aspect; sy = (sh - chei) / 2; }
      g.drawImage(src, sx, sy, cwid, chei, 0, 0, 160, h2);
      if (band) g.drawImage(src, 0, 0, sw, sh, 0, h2, 160, band);
    } else g.drawImage(src, 0, 0, sw, sh, 0, 0, cw, ch);
    out[`png${w}`] = await png64(cv);
  }
  return out;
}

async function imageThumb(url, size, sn, head) {
  const info = imageInfo(head, sn.format, sn.brand);
  if (!info) throw Object.assign(new Error('the image header does not read'), { code: 'image-bad' });
  const r = await fetch(url);
  const blob = new Blob([await r.arrayBuffer()]);
  const red = reducedSize(info.width, info.height);
  const bm = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'premultiply', ...(red ? { resizeWidth: red.width, resizeHeight: red.height, resizeQuality: 'high' } : {}) });
  try { return await thumbsOf(bm, bm.width, bm.height); } finally { bm.close(); }
}

// ---------------------------------------------------------------------------------------------- video

/** The AVC samples of a movie as EncodedVideoChunks: AVCC length-prefixed samples go in as they are with `description` (avcC). */
function chunkOf(v, i, bytes) {
  return new EncodedVideoChunk({ type: !v.native.sync || v.native.syncSet.has(i) ? 'key' : 'delta', timestamp: Math.round(v.present[i] * 1e6), data: bytes });
}
function prepare(v) { if (!v.native.syncSet) v.native.syncSet = new Set(v.native.sync || []); return v; }

/** Reads the byte range that holds samples [a, b] of a movie (one request when they are contiguous, as they are in a normal file). */
async function samples(read, v, a, b) {
  const out = [];
  let i = a;
  while (i <= b) { // contiguous runs in one read
    let j = i, end = v.offsets[i] + v.sizes[i];
    while (j + 1 <= b && v.offsets[j + 1] === end && end - v.offsets[i] < (32 << 20)) { j++; end += v.sizes[j]; }
    const buf = await read(v.offsets[i], end - v.offsets[i]);
    for (let k = i, o = 0; k <= j; k++) { out.push(buf.subarray(o, o + v.sizes[k])); o += v.sizes[k]; }
    i = j + 1;
  }
  return out;
}

/** Decodes samples [from, to] (decode order, `from` a sync sample) and returns the frames, in presentation order. The caller closes them. */
async function decodeRange(ix, read, from, to, { hardware = 'no-preference', onOutput = null, latency = false, bounded = false } = {}) {
  const v = prepare(ix.video), n = v.native;
  const frames = [];
  let err = null;
  const dec = new VideoDecoder({ output: (f) => { frames.push(f); onOutput?.(); }, error: (e) => { err = e; } });
  dec.configure({ codec: n.codecString, codedWidth: v.width, codedHeight: v.height, description: n.config, hardwareAcceleration: hardware, optimizeForLatency: latency });
  const bytes = await samples(read, v, from, to);
  for (let k = 0; k < bytes.length; k++) {
    dec.decode(chunkOf(v, from + k, bytes[k]));
    if (bounded) while (dec.decodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1)); // as playback feeds it: the speed measured is the sustained one
  }
  try { await dec.flush(); } catch (e) { err = err || e; }
  try { dec.close(); } catch { /* closed */ }
  if (err) { for (const f of frames) f.close(); throw err; }
  return frames;
}

/** The nearest sync sample at or before decode index i. */
function keyBefore(v, i) {
  const s = v.native.sync;
  if (!s || !s.length) return i;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= i) lo = mid; else hi = mid - 1; }
  return s[lo] <= i ? s[lo] : 0;
}

async function videoThumb(url, frameWanted) {
  const { size, read } = await openRemote(url), ix = await movIndexAsync(read, size), v = ix.video;
  if (!v?.native?.codecString) throw Object.assign(new Error('not a video this helper decodes'), { code: 'no-decoder' });
  const order = v.native.order, k = Math.max(0, Math.min(v.count - 1, frameWanted ?? Math.floor(v.count * 0.1)));
  const target = order[k], key = keyBefore(v, target);
  // every sample up to the one presented at k, plus those after it in decode order that are presented before it (B-frames)
  let to = target; for (let i = key; i < v.count && i <= target + 16; i++) if (v.present[i] <= v.present[target] && i > to) to = i;
  const frames = await decodeRange(ix, read, key, to);
  try {
    const want = Math.round(v.present[target] * 1e6);
    let best = frames[0];
    for (const f of frames) if (Math.abs(f.timestamp - want) < Math.abs(best.timestamp - want)) best = f;
    if (!best) throw new Error('no frame came out of the decoder');
    const rot = v.native.rotation || 0, w = best.displayWidth, h = best.displayHeight;
    if (!rot) return await thumbsOf(best, w, h);
    const cv = new OffscreenCanvas(rot === 180 ? w : h, rot === 180 ? h : w), g = cv.getContext('2d');
    g.translate(cv.width / 2, cv.height / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(best, -w / 2, -h / 2);
    return await thumbsOf(cv, cv.width, cv.height);
  } finally { for (const f of frames) f.close(); }
}

/**
 * Can this computer decode `codec` at width×height? Both asked of the configuration (hardware first) and PROVED on a real
 * sample of the file: isConfigSupported can say yes and the decode still fail. `hardware` = the GPU decoded it.
 */
async function canDecode({ src, codec, width, height }) {
  const cfg = (hw) => ({ codec, codedWidth: width, codedHeight: height, hardwareAcceleration: hw });
  const hw = (await VideoDecoder.isConfigSupported(cfg('prefer-hardware'))).supported, any = (await VideoDecoder.isConfigSupported(cfg('no-preference'))).supported;
  if (!hw && !any) {
    // how far does this decoder go? the same codec at a size every decoder reads says "too big" from "no decoder at all"
    const small = (await VideoDecoder.isConfigSupported({ codec, codedWidth: 1920, codedHeight: 1080 })).supported;
    return { ok: false, hardware: false, reason: small ? 'too-big' : 'no-decoder', limit: small ? '4096×4096' : null };
  }
  const { size, read } = await openRemote(src), ix = await movIndexAsync(read, size), v = ix.video;
  if (!v?.native) return { ok: false, hardware: false, reason: 'no-decoder' };
  // a REAL decode of the first frames (up to 40 on the CPU): the decoder can say yes to a configuration and fail on the data
  const key = v.native.sync && v.native.sync.length ? v.native.sync[0] : 0, to = Math.min(v.count - 1, key + (hw ? 8 : 40));
  const stamps = [];
  let frames;
  try { frames = await decodeRange(ix, read, key, to, { hardware: hw ? 'prefer-hardware' : 'prefer-software', latency: true, bounded: true, onOutput: () => stamps.push(performance.now()) }); } catch (e) {
    return { ok: false, hardware: false, reason: 'no-decoder', detail: String(e.message || e) };
  }
  const got = frames.length;
  for (const f of frames) f.close();
  if (!got) return { ok: false, hardware: false, reason: 'no-decoder', detail: 'no frame came out' };
  const warm = stamps.length > 12 ? (stamps[stamps.length - 1] - stamps[8]) / (stamps.length - 9) : null; // ms a frame once warm (a note: the limit that decides is the whole pipeline, see engine/media/index.js › _checkVideo)
  return { ok: true, hardware: hw, frames: got, ...(warm ? { decodeMs: Math.round(warm * 10) / 10 } : {}) };
}

// ---------------------------------------------------------------------------------------------- sound

const waveformThumbs = async (planes, rate) => {
  const out = {};
  const n = planes[0].length;
  for (const w of THUMB_W) {
    const ch = w === 160 ? 90 : 120, cv = new OffscreenCanvas(w, ch), g = cv.getContext('2d');
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, ch);
    g.fillStyle = '#8c8c8c';
    const bars = Math.min(w - 8, w === 160 ? 80 : 240), step = Math.max(1, Math.floor(n / bars));
    for (let b = 0; b < bars; b++) {
      let pk = 0;
      for (const p of planes) for (let i = b * step; i < Math.min(n, (b + 1) * step); i += Math.max(1, step >> 5)) pk = Math.max(pk, Math.abs(p[i]));
      const h = Math.max(1, pk * (ch * 0.7)), x = 4 + b * ((w - 8) / bars);
      g.fillRect(x, ch / 2 - h / 2, Math.max(1, (w - 8) / bars - 1), h);
    }
    out[`png${w}`] = await png64(cv);
  }
  return out;
};

const toS16 = (planes, from, count, out, outAt) => {
  const ch = planes.length;
  for (let i = 0; i < count; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, planes[c][from + i]));
    out[outAt + i * ch + c] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
};

/** Decodes a sound the browser knows (MP3, AAC, FLAC, Ogg) whole: 48 kHz, the channels it has. */
/** A length (seconds) for a compressed sound BEFORE it is decoded: the MP3 header's bitrate (CBR) over the bytes, else null. */
export function estimateSoundSeconds(head, size) {
  let i = 0;
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) i = 10 + (((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f));
  for (let k = i; k + 4 <= head.length && k < i + 8192; k++) {
    if (head[k] !== 0xff || (head[k + 1] & 0xe0) !== 0xe0) continue;
    const ver = (head[k + 1] >> 3) & 3, layer = (head[k + 1] >> 1) & 3, br = head[k + 2] >> 4;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15) continue; // Layer III only
    const t = ver === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    return ((size - k) * 8) / (t[br] * 1000);
  }
  return null;
}
const SOUND_MAX_BYTES = 256 << 20; // whatever the codec, a file this big is longer than the cap or too big to hold decoded

async function soundPlanes(url) {
  const { size, read } = await openRemote(url);
  const est = estimateSoundSeconds(await read(0, Math.min(size, 16384)), size);
  if ((est != null && est > SOUND_MAX_S + 5) || size > SOUND_MAX_BYTES) throw Object.assign(new Error('longer than 20 min'), { code: 'audio-long' });
  const r = await fetch(url), data = await r.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const buf = await ctx.decodeAudioData(data);
  return { planes: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), rate: buf.sampleRate };
}

/** The AAC of an MP4/M4A decoded packet by packet; the result starts at the clip's time 0 (priming and edit lists taken off). */
async function aacPlanes(url) {
  const { size, read } = await openRemote(url), ix = await movIndexAsync(read, size), a = ix.audio;
  if (!a?.aac) throw Object.assign(new Error('no AAC track'), { code: 'audio-bad' });
  if (a.duration > SOUND_MAX_S + 5) throw Object.assign(new Error('the sound is longer than 20 min'), { code: 'audio-long' }); // before decoding a byte
  const rate = a.rate, ch = a.channels;
  const planes = Array.from({ length: ch }, () => []);
  let outRate = rate, err = null;
  const dec = new AudioDecoder({
    output: (d) => {
      outRate = d.sampleRate;
      for (let c = 0; c < Math.min(ch, d.numberOfChannels); c++) { const p = new Float32Array(d.numberOfFrames); d.copyTo(p, { planeIndex: c, format: 'f32-planar' }); planes[c].push(p); }
      d.close();
    },
    error: (e) => { err = e; },
  });
  dec.configure({ codec: a.aac.codecString, sampleRate: rate, numberOfChannels: ch, description: a.aac.config });
  const per = Math.max(1, Math.round(1024 / rate * 1e6));
  const CH = 256;
  for (let i = 0; i < a.aac.count && !err; i += CH) {
    const hi = Math.min(a.aac.count - 1, i + CH - 1);
    let k = i;
    const first = a.aac.offsets[i], end = a.aac.offsets[hi] + a.aac.sizes[hi];
    const buf = end - first < (64 << 20) ? await read(first, end - first) : null; // (the packets of a chunk are contiguous in a normal file)
    for (; k <= hi; k++) {
      const bytes = buf ? buf.subarray(a.aac.offsets[k] - first, a.aac.offsets[k] - first + a.aac.sizes[k]) : await read(a.aac.offsets[k], a.aac.sizes[k]);
      dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: k * per, data: bytes }));
    }
    while (dec.decodeQueueSize > 512) await new Promise((r) => setTimeout(r, 2));
  }
  await dec.flush(); dec.close();
  if (err) throw err;
  const flat = planes.map((list) => { const n = list.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let q = 0; for (const x of list) { o.set(x, q); q += x.length; } return o; });
  // the clip's time 0 is where the video starts: sample (videoStart − audio shift) × rate of the decoded stream
  const v0 = ix.video?.native ? ix.video.present[ix.video.native.order[0]] : 0;
  const startSample = Math.round((v0 - a.shift) * outRate);
  const total = Math.round(a.duration * outRate); // the length the index says (stts): the decoder may return a packet more
  return { planes: flat, rate: outRate, startSample, total };
}

/** Writes interleaved s16le PCM of planes[start …] (silence before 0) to the engine's route as the job's answer. */
async function postPcm(job, { planes, rate, startSample = 0, total = null }) {
  const ch = planes.length, avail = planes[0].length;
  const frames = Math.max(0, (total ?? avail) - startSample); // the track's length from the clip's time 0 (a negative start adds silence in front)
  const parts = [], BLOCK = 1 << 18;
  for (let done = 0; done < frames; done += BLOCK) {
    const n = Math.min(BLOCK, frames - done), out = new Int16Array(n * ch);
    for (let i = 0; i < n; i++) {
      const s = startSample + done + i;
      for (let c = 0; c < ch; c++) { const v = s >= 0 && s < avail ? Math.max(-1, Math.min(1, planes[c][s])) : 0; out[i * ch + c] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767); }
    }
    parts.push(out);
  }
  await answer(job.id, { rate, channels: ch, frames, startSample }, new Blob(parts));
  return { rate, channels: ch, frames };
}

// ---------------------------------------------------------------------------------------------- Convert to HAP (path A)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One piece of the conversion to the engine; it answers {cancel} (or 404: the job is over) when the operator gave up. */
async function postPart(job, meta, body) {
  const r = await fetch(`/api/helper/part/${job.id}`, { method: 'POST', headers: { 'X-VT-Meta': encodeURIComponent(JSON.stringify(meta)), 'Content-Type': 'application/octet-stream' }, body });
  if (r.status === 404) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
  if (!r.ok) throw new Error(`part ${r.status}`);
  const j = await r.json();
  if (j.cancel) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
}

/**
 * The frames of a movie as the page sees them, in presentation order, resampled to `fps` when another rate is asked for.
 * `frames()` is an async generator of drawables (a VideoFrame, or a canvas when the movie is rotated or sized otherwise): the
 * caller must NOT close them, the generator does when it moves on.
 */
function movieSource(ix, read, fps) {
  const v = prepare(ix.video), n = v.native, order = n.order;
  const t0 = v.present[order[0]], t1 = v.present[order[v.count - 1]];
  const srcFps = v.count > 1 && t1 > t0 ? (v.count - 1) / (t1 - t0) : v.fps;
  const rot = n.rotation || 0, W = rot === 90 || rot === 270 ? v.height : v.width, H = rot === 90 || rot === 270 ? v.width : v.height;
  const outFps = fps && Math.abs(fps - srcFps) > 0.01 ? fps : srcFps;
  const total = outFps === srcFps ? v.count : Math.max(1, Math.round((v.count / srcFps) * outFps));
  const upright = (f) => {
    if (!rot && f.displayWidth === W && f.displayHeight === H) return f;
    const cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
    if (!rot) { g.drawImage(f, 0, 0, W, H); return cv; }
    const w = f.displayWidth, h = f.displayHeight;
    g.translate(W / 2, H / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(f, -w / 2, -h / 2);
    return cv;
  };
  async function* frames() {
    const q = [];
    let err = null, finished = false, stopped = false;
    const dec = new VideoDecoder({ output: (f) => { q.push(f); }, error: (e) => { err = e; } });
    dec.configure({ codec: n.codecString, codedWidth: v.width, codedHeight: v.height, description: n.config, hardwareAcceleration: 'no-preference' });
    const BATCH = 16;
    (async () => {
      for (let a = 0; a < v.count && !err && !stopped; a += BATCH) {
        while (q.length + dec.decodeQueueSize > 6 && !err && !stopped) await sleep(2);
        const b = Math.min(v.count - 1, a + BATCH - 1), bytes = await samples(read, v, a, b);
        for (let k = 0; k < bytes.length && !stopped; k++) dec.decode(chunkOf(v, a + k, bytes[k]));
      }
      if (!stopped && !err) await dec.flush();
      finished = true;
    })().catch((e) => { err = err || e; finished = true; });
    let prev = null, cur = null, k = 0;
    const tk = (i) => t0 + i / outFps;
    try {
      for (;;) {
        if (!q.length) { if (err) throw err; if (finished) break; await sleep(1); continue; }
        cur = q.shift();
        if (outFps === srcFps) { yield upright(cur); cur.close(); cur = null; continue; }
        // another rate: every output instant takes the last decoded frame at or before it
        const ct = cur.timestamp / 1e6;
        if (prev) { while (k < total && tk(k) < ct - 1e-6) { yield upright(prev); k++; } prev.close(); }
        prev = cur; cur = null;
      }
      if (prev) { while (k < total) { yield upright(prev); k++; } prev.close(); prev = null; }
    } finally { stopped = true; for (const f of q) f.close(); try { cur?.close(); } catch { /* closed */ } try { prev?.close(); } catch { /* closed */ } try { dec.close(); } catch { /* closed */ } }
  }
  return { width: W, height: H, fps: outFps, total, frames };
}

async function convertJob(job) {
  const fmt = HAP_FMT[job.codec];
  if (!fmt) throw Object.assign(new Error(`unknown HAP codec ${job.codec}`), { code: 'bad-job' });
  const { size, read } = await openRemote(job.src);
  const head = await read(0, Math.min(size, 1 << 20)), sn = sniffKind(head);
  let src, bm = null, ix = null;
  if (sn.kind === 'image') {
    const info = imageInfo(head, sn.format, sn.brand);
    if (!info) throw Object.assign(new Error('the image header does not read'), { code: 'image-bad' });
    const red = reducedSize(info.width, info.height);
    const blob = new Blob([await (await fetch(job.src)).arrayBuffer()]);
    // 'none': the DXT5 keeps straight colour and the player premultiplies on playback (hap-worker mode 1); premultiplying here too gave dark halos
    bm = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none', ...(red ? { resizeWidth: red.width, resizeHeight: red.height, resizeQuality: 'high' } : {}) });
    const fps = job.fps || 30;
    src = { width: bm.width, height: bm.height, fps, total: Math.round(fps), still: true, frames: async function* () { yield bm; } };
  } else if (sn.kind === 'mov') {
    ix = await movIndexAsync(read, size);
    if (!ix.video?.native?.codecString) throw Object.assign(new Error('not a video this helper decodes'), { code: 'no-decoder' });
    src = movieSource(ix, read, job.fps || null);
  } else throw Object.assign(new Error('not a picture or a video'), { code: 'no-convert' });

  const audio = ix?.audio?.aac ? await aacPlanes(job.src) : null; // (PCM tracks and others: the engine says the sound was dropped)
  const enc = createDxtEncoder(fmt.tex);
  let sent = 0;
  try {
    await postPart(job, { t: 'begin', width: src.width, height: src.height, fps: src.fps, frames: src.total, audio: audio ? { rate: audio.rate, channels: audio.planes.length } : null, renderer: enc.info.renderer });
    if (audio) { // s16le from the clip's time 0, in blocks the engine appends
      const ch = audio.planes.length, avail = audio.planes[0].length, frames = Math.max(0, (audio.total ?? avail) - audio.startSample), BLOCK = 1 << 17;
      for (let done = 0; done < frames; done += BLOCK) {
        const m = Math.min(BLOCK, frames - done), out = new Int16Array(m * ch);
        for (let i = 0; i < m; i++) {
          const at = audio.startSample + done + i;
          for (let c = 0; c < ch; c++) { const x = at >= 0 && at < avail ? Math.max(-1, Math.min(1, audio.planes[c][at])) : 0; out[i * ch + c] = x < 0 ? Math.round(x * 32768) : Math.round(x * 32767); }
        }
        await postPart(job, { t: 'a', frames: m }, out);
      }
    }
    const blocks = Math.ceil(src.width / 4) * Math.ceil(src.height / 4);
    let chunks = blocks > 65536 ? Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 4) >> 1)) : 1;
    chunks = 2 ** Math.floor(Math.log2(chunks)); // (a power of two, as VEATION writes them)
    for await (const fr of src.frames()) {
      const payload = hapFrame(enc.encode(fr, src.width, src.height), job.codec, chunks);
      if (src.still) { await postPart(job, { t: 'v', i: 0, repeat: src.total }, payload); sent = src.total; break; }
      await postPart(job, { t: 'v', i: sent }, payload);
      sent++;
      await sleep(0); // one frame at a time, and the page breathes: the room's PC has Unreal on it
      if (sent >= src.total) break;
    }
  } finally { enc.close(); bm?.close(); }
  return { frames: sent, width: src.width, height: src.height, fps: src.fps, audio: !!audio };
}

// ---------------------------------------------------------------------------------------------- the jobs

async function thumbJob(job) {
  const { size, read } = await openRemote(job.src);
  const head = await read(0, Math.min(size, 1 << 20)), sn = sniffKind(head);
  if (sn.kind === 'image') return imageThumb(job.src, size, sn, head);
  if (sn.kind === 'mov') {
    const ix = await movIndexAsync(read, size);
    if (ix.video?.native?.codecString) return videoThumb(job.src, job.frame);
    if (!ix.video && ix.audio?.aac) { const a = await aacPlanes(job.src); return waveformThumbs(a.planes, a.rate); }
    throw Object.assign(new Error('this movie has nothing the helper can draw'), { code: 'no-thumb' });
  }
  if (sn.kind === 'wav' || sn.kind === 'audio') { const s = await soundPlanes(job.src); return waveformThumbs(s.planes, s.rate); }
  throw Object.assign(new Error('not a picture, a video or a sound'), { code: 'no-thumb' });
}

async function audioJob(job) {
  const r = job.format === 'mp4' || job.format === 'm4a' ? await aacPlanes(job.src) : await soundPlanes(job.src);
  if (r.planes[0].length / r.rate > SOUND_MAX_S + 5) throw Object.assign(new Error('longer than 20 min'), { code: 'audio-long' });
  return postPcm(job, r);
}

const HANDLERS = {
  thumb: thumbJob,
  canDecode,
  audioDecode: audioJob,
  convert: convertJob,
};

/** Answers a job: JSON, or (with a blob) the bytes of the file the job asked for plus the figures in a header. */
async function answer(id, body, blob = null) {
  const r = blob
    ? await fetch(`/api/helper/done/${id}`, { method: 'POST', headers: { 'X-VT-Meta': encodeURIComponent(JSON.stringify(body)), 'Content-Type': 'application/octet-stream' }, body: blob })
    : await fetch(`/api/helper/done/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 204) throw new Error(`answer ${r.status}`);
}

/** Runs one job and answers it. A failure is an answer too: {error, code}. */
export async function run(job) {
  let result;
  try { result = await HANDLERS[job.kind](job); } catch (e) { result = { error: String(e?.message || e), code: e?.code || 'helper-error' }; }
  if (job.kind === 'audioDecode' && !result.error) return result; // already answered with its file
  await answer(job.id, result);
  return result;
}

let stopped = false;
async function poll() {
  while (!stopped) {
    try {
      const r = await fetch('/api/helper/next', { cache: 'no-store' });
      if (r.status === 200) { const job = await r.json(); run(job).catch(() => {}); } // (jobs run side by side: a thumbnail does not wait for a long sound)
      else await r.arrayBuffer().catch(() => {});
    } catch { await new Promise((res) => setTimeout(res, 1500)); } // the engine is not there: ask again
  }
}

window.__helper = { run, HANDLERS, openRemote, estimateSoundSeconds, stop: () => { stopped = true; }, stats: () => ({ stopped }) };
if (!new URLSearchParams(location.search).has('manual')) poll();
