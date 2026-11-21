// Convert to HAP (docs/research/media-formats.md P5): any video or picture becomes a HAP movie in the library, and the clips
// that used it switch to it. One job at a time (the room's PC also runs Unreal), two roads:
//
//   A  in the app   what Chromium decodes (H.264 in MP4/MOV, pictures): the hidden helper window decodes (WebCodecs),
//                   DXT-compresses on the low-power GPU and sends HAP frames to the engine (job `convert`, parts); the engine
//                   writes the .mov (HapWriter) — the audio, as PCM, first.
//   B  FFmpeg       everything else (ProRes, DNxHD, MPEG-2, AVI, WebM...): an LGPL ffmpeg.exe the operator installed (ffmpeg.js)
//                   runs as a SEPARATE process: `-c:v hap -format ... -c:a pcm_s16le -progress pipe:1`.
//
// Both write <library>/.convert/<job>.part; a finished file is renamed into <library>/<show>/, checked like any import and
// adopted by MediaEngine.adoptConverted (ONE show edit: the new medium and every clip moved to it, settings kept).
// A cancelled or failed job removes its .part; what a crash leaves is swept at start. The job is in state.media.import with
// kind 'convert': {id, kind, showId, mediaId, name, state: waiting|converting|done|failed, done, total, etaS, error, codec,
// via: 'chromium'|'ffmpeg', resultMediaId}. `done`/`total` are frames (road A) or milliseconds of the source (road B).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { movIndexAsync } from './mov.js';
import { sniffKind } from './sniff.js';
import { HAP_FMT, movBuild, movFtyp, u8cat } from './hapenc.js';
import { FfmpegTool } from './ffmpeg.js';
import { absoluteIn, freeName, safeName, formatBytes, diskSpace } from './library.js';
import { fileName } from './show.js';

export const CODECS = ['hap', 'hapq', 'hapa'];
const FFMPEG_FORMAT = { hap: 'hap', hapq: 'hap_q', hapa: 'hap_alpha' };
const SUFFIX = { hap: 'HAP', hapq: 'HAPQ', hapa: 'HAPA' };
const DONE_KEEP_MS = 10000;
const ACTIVE = new Set(['waiting', 'converting']);
const coded = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/**
 * The QuickTime file of a conversion, written as the frames arrive: ftyp, a 64-bit mdat that grows (audio first, then the frames),
 * and the moov at the end (hapenc.js › movBuild). `repeat` stores a frame once and points several samples at it (a still picture).
 */
export class HapWriter {
  constructor(file, { width, height, fps, codec, audio = null }) {
    this.file = file; this.width = width; this.height = height; this.fps = fps; this.codec = codec; this.audio = audio;
    this.frames = []; this.chunks = []; this.fh = null;
    this.pos = 0;
  }

  async open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.fh = await fs.promises.open(this.file, 'w');
    const ftyp = movFtyp(), head = new Uint8Array(16);
    new DataView(head.buffer).setUint32(0, 1); head.set([0x6d, 0x64, 0x61, 0x74], 4); // 'mdat', size 1 = a 64-bit size follows (patched at the end)
    await this._write(u8cat([ftyp, head]));
    this.mdat = ftyp.length;
  }

  async _write(bytes) {
    await this.fh.write(bytes, 0, bytes.length, this.pos);
    this.pos += bytes.length;
  }

  /** @param {Uint8Array} bytes one HAP frame @param {number} [repeat] how many samples it is */
  async addFrame(bytes, repeat = 1) {
    const off = this.pos;
    await this._write(bytes);
    for (let i = 0; i < repeat; i++) this.frames.push({ off, size: bytes.length });
  }

  /** @param {Uint8Array} pcm interleaved s16le */
  async addAudio(pcm) {
    const ch = this.audio?.channels;
    if (!ch) throw coded('convert-bad', 'audio arrived for a movie without sound');
    const samples = Math.floor(pcm.length / (ch * 2));
    if (!samples) return;
    this.chunks.push({ off: this.pos, samples });
    await this._write(pcm.subarray(0, samples * ch * 2));
  }

  /** The moov and the mdat size; the file is whole after this. */
  async finish() {
    if (!this.frames.length) throw coded('convert-bad', 'no frames were converted');
    const F = HAP_FMT[this.codec];
    const moov = movBuild({ fourcc: F.fourcc, w: this.width, h: this.height, depth: F.depth, fps: this.fps, frames: this.frames,
      audio: this.audio && this.chunks.length ? { sr: this.audio.rate, ch: this.audio.channels, chunks: this.chunks } : null });
    const mdatSize = this.pos - this.mdat;
    await this._write(moov);
    const sz = new Uint8Array(8), dv = new DataView(sz.buffer);
    dv.setUint32(0, Math.floor(mdatSize / 4294967296)); dv.setUint32(4, mdatSize >>> 0);
    await this.fh.write(sz, 0, 8, this.mdat + 8);
    await this.fh.sync().catch(() => {});
    await this.fh.close(); this.fh = null;
  }

  async abort() {
    try { await this.fh?.close(); } catch { /* closed */ }
    this.fh = null;
    fs.rmSync(this.file, { force: true });
  }
}

export class Converter {
  /**
   * @param {import('./index.js').MediaEngine} media
   * @param {{ffmpeg?:{cmd:string,args?:string[]}, fetchImpl?:Function, versionOf?:Function, platform?:string, pin?:object, toolDir?:string}} [seams] tests only
   */
  constructor(media, seams = {}) {
    this.media = media; this.seams = seams;
    this.jobs = new Map();
    this.seq = 0;
    this.running = null;
    this.tool = new FfmpegTool({ dir: seams.toolDir || path.join(media.store.dir, 'tools', 'ffmpeg'), log: media.log, fetchImpl: seams.fetchImpl, versionOf: seams.versionOf, platform: seams.platform, pin: seams.pin, onChange: () => media._emitMedia(), busy: () => [...this.jobs.values()].some((j) => j.state === 'converting' && j.via === 'ffmpeg') });
  }

  get libraryDir() { return this.media.libraryDir; }
  get convertDir() { return path.join(this.libraryDir, '.convert'); }

  /** What is left of a conversion that did not finish (a crash, a cut): removed. */
  sweep() { try { fs.rmSync(this.convertDir, { recursive: true, force: true }); } catch { /* the drive is not there */ } }

  publicJobs() {
    return [...this.jobs.values()].map((j) => ({ id: j.id, kind: 'convert', showId: j.showId, mediaId: j.mediaId, name: j.name, state: j.state, done: j.done, total: j.total, mbps: 0, etaS: j.etaS, error: j.error, codec: j.codec, via: j.via, resultMediaId: j.resultMediaId }));
  }

  /** Failed conversions, for Problems (the operator dismisses them with media.convertCancel). */
  problems() {
    return [...this.jobs.values()].filter((j) => j.state === 'failed').map((j) => ({ kind: 'convert', jobId: j.id, mediaId: j.mediaId, text: `Conversion of "${j.name}" to HAP failed: ${j.error}`, fix: null }));
  }

  summary() { return { ffmpeg: this.tool.status() }; }

  // ------------------------------------------------------------------ the operations

  /**
   * media.convert {mediaId | path, codec, fps?}: queues a job. `mediaId` = a medium of the open show (its clips switch to the
   * result); `path` = a file on this computer that import refused (ProRes...): the result only joins the library.
   * @returns {{jobId:string}}
   */
  start(args = {}) {
    if (!args.__local) throw new Error('files are converted in the desktop app, on this computer');
    const codec = CODECS.includes(args.codec) ? args.codec : null;
    if (!codec) throw new Error(`codec must be one of ${CODECS.join(', ')}`);
    const fps = args.fps === undefined || args.fps === null || args.fps === '' ? null : Number(args.fps);
    if (fps !== null && !(fps >= 1 && fps <= 240)) throw new Error('fps must be between 1 and 240');
    const show = this.media._ensureShow();
    let name, mediaId = null, src = null;
    if (args.mediaId) {
      const m = show.media.find((x) => x.id === args.mediaId);
      if (!m) throw new Error('no such media');
      if (m.kind === 'hap') throw new Error(`"${fileName(m.file)}" is already HAP`);
      if (m.kind === 'audio') throw new Error('a sound has nothing to convert');
      if (this.media._jobFor(show.id, m.id)) throw new Error('the file is still being copied into the library: convert it when the copy is done');
      const busy = [...this.jobs.values()].find((j) => ACTIVE.has(j.state) && j.mediaId === m.id && j.showId === show.id);
      if (busy) return { jobId: busy.id };
      mediaId = m.id; name = fileName(m.file);
    } else if (typeof args.path === 'string' && path.isAbsolute(args.path)) {
      src = path.resolve(args.path); name = path.basename(src);
      const busy = [...this.jobs.values()].find((j) => ACTIVE.has(j.state) && j.src === src);
      if (busy) return { jobId: busy.id };
    } else throw new Error('say what to convert: mediaId or an absolute path');
    const via = args.via === 'chromium' || args.via === 'ffmpeg' ? args.via : null; // (the road is chosen by the file; this forces one)
    const job = { id: `v${++this.seq}`, showId: show.id, mediaId, src, name, codec, fps, force: via, state: 'waiting', done: 0, total: 0, etaS: null, error: null, via: null, resultMediaId: null, startedAt: 0, cancel: null, cancelled: false };
    this.jobs.set(job.id, job);
    this.media._emitMedia();
    this._pump();
    return { jobId: job.id };
  }

  /** media.convertCancel {jobId}: stops a running or queued job (nothing is left), or dismisses a finished / failed one. */
  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('no such conversion');
    if (ACTIVE.has(job.state)) {
      job.cancelled = true;
      if (job.cancel) await job.cancel();
      if (job.state === 'waiting') this.jobs.delete(id);
      // a running job removes itself when its road ends (_execute's catch)
      if (job.state === 'converting' && job._ended) await job._ended;
    } else this.jobs.delete(id);
    this.media._emitMedia();
    return {};
  }

  async stop() {
    for (const j of this.jobs.values()) { j.cancelled = true; try { await j.cancel?.(); } catch { /* going */ } }
    if (this.running) await this.running.catch(() => {});
    this.tool.cancelInstall();
    this.sweep();
  }

  // ------------------------------------------------------------------ the queue

  _pump() {
    if (this.running || this.media._stopped) return;
    const job = [...this.jobs.values()].find((j) => j.state === 'waiting');
    if (!job) return;
    job.state = 'converting'; job.startedAt = Date.now();
    job._ended = null;
    this.running = (async () => {
      let end; job._ended = new Promise((r) => { end = r; });
      try { await this._execute(job); } catch (e) {
        this._cleanup(job);
        if (job.cancelled) { this.jobs.delete(job.id); this.media.log.info(`conversion of "${job.name}" cancelled`); } else {
          job.state = 'failed'; job.error = String(e.message || e);
          this.media.log.warn(`conversion of "${job.name}": ${job.error}`);
        }
      }
      end();
      this.running = null;
      this.media._emitMedia();
      if (job.state === 'done') setTimeout(() => { if (this.jobs.get(job.id)?.state === 'done') { this.jobs.delete(job.id); this.media._emitMedia(); } }, DONE_KEEP_MS).unref?.();
      this._pump();
    })();
  }

  _cleanup(job) { if (job.part) fs.rmSync(job.part, { force: true }); }

  async _execute(job) {
    const m = this.media, lib = this.libraryDir;
    let src = job.src;
    if (job.mediaId) {
      const med = m._mediaOf(job.showId, job.mediaId);
      if (!med) throw new Error('the media is no longer in the show');
      src = absoluteIn(lib, med.file);
    }
    if (!fs.existsSync(src)) throw new Error('the source file is not there (is its drive connected?)');
    const via = await this._road(src, job.force);
    job.via = via;
    job.part = path.join(this.convertDir, `${job.id}-${process.pid}.part`);
    fs.mkdirSync(this.convertDir, { recursive: true });
    const result = via === 'chromium' ? await this._viaChromium(job, src) : await this._viaFfmpeg(job, src);
    if (job.cancelled) throw coded('cancelled', 'cancelled');
    // into the library: <show>/<name> HAP.mov, then adopted (probed, fingerprinted, the clips switched) in one show edit
    const base = safeName(path.basename(src).replace(/\.[^.]+$/, '') || 'clip');
    const dir = path.join(lib, job.showId);
    fs.mkdirSync(dir, { recursive: true });
    const final = freeName(`${base} ${SUFFIX[job.codec]}.mov`, (n) => fs.existsSync(path.join(dir, n)));
    const dest = path.join(dir, final);
    fs.renameSync(job.part, dest);
    job.part = null;
    let adopted;
    try { adopted = await m.adoptConverted({ showId: job.showId, sourceMediaId: job.mediaId, file: dest, notes: result.notes || [] }); } catch (e) {
      fs.rmSync(dest, { force: true });
      throw coded('convert-bad', `the converted file did not pass the library's checks: ${e.message}`);
    }
    job.resultMediaId = adopted.mediaId; job.state = 'done'; job.done = job.total || 1; job.total = job.total || 1; job.etaS = 0;
    m.log.info(`converted "${job.name}" to ${final} (${job.via}, ${((Date.now() - job.startedAt) / 1000).toFixed(1)} s, ${adopted.relinked} clip${adopted.relinked === 1 ? '' : 's'} switched)`);
  }

  /** Which road: the helper (Chromium) when it can decode the file, else FFmpeg; 'chromium' / 'ffmpeg' from the seam or the file. */
  async _road(src, force = null) {
    const fh = await fs.promises.open(src, 'r');
    let kind = 'unknown', native = false;
    try {
      const { size } = await fh.stat();
      const read = async (offset, length) => { const b = Buffer.allocUnsafe(Math.max(0, Math.min(length, size - offset))); if (!b.length) return b; const { bytesRead } = await fh.read(b, 0, b.length, offset); return b.subarray(0, bytesRead); };
      const sn = sniffKind(await read(0, Math.min(size, 1 << 20)));
      kind = sn.kind;
      if (kind === 'mov') {
        const ix = await movIndexAsync(read, size).catch(() => null);
        if (ix?.video && /^Hap/.test(ix.video.fourcc)) throw new Error('this movie is already HAP');
        native = !!ix?.video?.native?.codecString && !ix.fragmented;
        if (!ix?.video) kind = 'novideo';
      }
    } finally { await fh.close(); }
    if (kind === 'audio' || kind === 'wav' || kind === 'novideo') throw new Error('this file is a sound: there is no video to convert');
    if (force === 'ffmpeg') { if (this._ffmpegReady()) return 'ffmpeg'; throw coded('no-ffmpeg', 'FFmpeg is not installed: install the converter in System › Converter'); }
    if (force === 'chromium') { if (this.media.helper.online) return 'chromium'; throw coded('no-helper', 'the desktop app is needed to convert this file'); }
    const chromium = kind === 'image' || (kind === 'mov' && native);
    if (chromium && this.media.helper.online) return 'chromium';
    if (this._ffmpegReady()) return 'ffmpeg';
    if (chromium) throw coded('no-helper', 'the desktop app is needed to convert this file (or install FFmpeg in System › Converter)');
    throw coded('no-ffmpeg', 'Chromium cannot read this file: install the converter in System › Converter (FFmpeg) and convert it again');
  }

  _ffmpegReady() { return !!this.seams.ffmpeg || this.tool.status().installed; }

  // ------------------------------------------------------------------ road A: the helper

  async _viaChromium(job, src) {
    const m = this.media;
    let writer = null, spaceChecked = false, info = null;
    const notes = [];
    const onPart = async (meta, body) => {
      if (job.cancelled) return;
      if (meta.t === 'begin') {
        info = meta;
        writer = new HapWriter(job.part, { width: meta.width, height: meta.height, fps: meta.fps, codec: job.codec, audio: meta.audio });
        await writer.open();
        job.total = meta.frames;
        const F = HAP_FMT[job.codec], est = meta.frames * Math.ceil(meta.width / 4) * Math.ceil(meta.height / 4) * F.bpb * (meta.frames > 1 ? 0.85 : 1 / meta.frames);
        const sp = await diskSpace(this.libraryDir);
        if (sp.free !== null && !spaceChecked && est > sp.free) throw coded('no-space', `Not enough space: about ${formatBytes(est)} needed, ${formatBytes(sp.free)} free on the library's drive.`);
        spaceChecked = true;
      } else if (!writer) throw coded('convert-bad', 'the helper sent data before it began');
      else if (meta.t === 'a') await writer.addAudio(body);
      else if (meta.t === 'v') {
        await writer.addFrame(body, meta.repeat || 1);
        job.done = writer.frames.length;
        const el = (Date.now() - job.startedAt) / 1000;
        job.etaS = job.done > 2 && el > 1 ? Math.round((el / job.done) * (job.total - job.done)) : null;
        m._emitMedia();
      }
    };
    if (job.cancelled) throw coded('cancelled', 'cancelled'); // (cancelled before the road began: nothing is launched)
    const req = m.helper.request({ kind: 'convert', codec: job.codec, fps: job.fps, name: job.name }, { files: { src }, onPart, timeoutMs: 120000 });
    job.cancel = async () => { m.helper.abort(req.id); };
    let res;
    try { res = await req; } catch (e) {
      await writer?.abort();
      if (job.cancelled || e.code === 'cancelled') throw coded('cancelled', 'cancelled');
      throw e;
    } finally { job.cancel = null; }
    if (job.cancelled) { await writer?.abort(); throw coded('cancelled', 'cancelled'); }
    if (!writer) throw coded('convert-bad', 'the helper did not start the conversion');
    await writer.finish();
    return { notes, frames: res.frames };
  }

  // ------------------------------------------------------------------ road B: FFmpeg

  async _viaFfmpeg(job, src) {
    const m = this.media;
    const cmd = this.seams.ffmpeg || { cmd: this.tool.exe, args: [] };
    const args = [...(cmd.args || []), '-hide_banner', '-nostdin', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
      ...(job.fps ? ['-vf', `fps=${job.fps}`] : []),
      '-c:v', 'hap', '-format', FFMPEG_FORMAT[job.codec], '-chunks', '4', '-c:a', 'pcm_s16le', '-f', 'mov', '-progress', 'pipe:1', '-nostats', job.part];
    if (job.cancelled) throw coded('cancelled', 'cancelled');
    const child = spawn(cmd.cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', buf = '', durMs = 0, outMs = 0;
    child.stderr.on('data', (d) => {
      err = (err + d).slice(-4000);
      if (!durMs) { const dm = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err); if (dm) { durMs = Math.round((Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3])) * 1000); job.total = durMs; } }
    });
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        const kv = /^(\w+)=(.*)$/.exec(line);
        if (!kv) continue;
        if (kv[1] === 'out_time_us' || kv[1] === 'out_time_ms') { const v = Number(kv[2]); if (v >= 0) outMs = Math.round(v / 1000); } // (out_time_ms is in microseconds too: an FFmpeg quirk)
        if (kv[1] === 'progress') {
          job.done = durMs ? Math.min(outMs, durMs) : outMs;
          const el = (Date.now() - job.startedAt) / 1000;
          job.etaS = durMs && job.done > 0 && el > 1 ? Math.max(0, Math.round((el / job.done) * (durMs - job.done))) : null;
          m._emitMedia();
        }
      }
    });
    const exit = new Promise((resolve) => { child.on('error', (e) => { err += String(e.message || e); resolve(-1); }); child.on('close', (c) => resolve(c)); });
    job.cancel = async () => { try { child.kill(); } catch { /* gone */ } await exit; };
    let code;
    try { code = await exit; } finally { job.cancel = null; }
    if (job.cancelled) throw coded('cancelled', 'cancelled');
    if (code !== 0 || !fs.existsSync(job.part)) {
      const lines = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      throw coded('ffmpeg', `FFmpeg could not convert it${lines.length ? `: ${lines[lines.length - 1]}` : ''}`);
    }
    return { notes: [] };
  }
}
