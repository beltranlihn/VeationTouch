// The clip layers of the room output (MEDIA-SERVER.md §4.5): state.media (the engine's transport, engine/media/
// transport.js) → one HapPlayer per playing clip (two on a layer during a crossfade) → the `media` group of the mixer
// (ui/js/mixer/layers.js). Runs in the output page (ui/js/output.js wires it); everything it needs is injected, so the
// pure parts run in Node (tests/hap-player.test.mjs).
//
// Every composed frame (the group's onFrame hook, `t` = the frame's instant):
//   engine time = clock.engineNow(t) → per play: the elapsed time locked to the output's frames (hap-player.js ›
//   FrameLock) → transport.playhead() → the frame, its direction, the segment → HapPlayer.drive() (the request window,
//   the loop prefetch) → the layer: a texture, or mix(from, play, k) during a crossfade, its opacity, blend and place.
//   k = clamp((engine now − fadeAt) / transitionMs, 0, 1): a launch on an empty layer fades in, an eject fades out.
// - PLACE (the clip's `place`): 'canvas' (default), 'wall' (that wall's pixelRect) or 'walls' (the box around every wall's
//   pixelRect); 'stretch' (default) fills it, 'fit' shows the whole clip inside it, 'fill' covers it and crops the clip.
// - PARKING: in calibration mode (state.output.calibrating), on a bypassed layer, or when no frame with the clip layers
//   has been composed for PARK_AFTER_MS (blackout, output off), the players park: no decoding, their ImageBitmaps closed.
//   When they are drawn again they come back to where the clock says.
// - A FILE THAT FAILS (missing, a drive pulled out, cut short): its player breaks; the layer keeps its last image for
//   HOLD_MS, then the page sends media.report {playId, error}: the engine ejects it with the layer's transition and every
//   client gets mediaEvent 'error'. If the engine does not answer (it is down) the page fades the clip out itself. The
//   page never waits for anything: a broken clip is only an image that goes.
// - LATE frames (the wanted frame was not decoded in time: the previous one stays) are counted and sent, at most every
//   REPORT_MS, as media.report {late, frames, seconds, layers}.
// - KINDS (docs/research/media-formats.md): a HAP clip has a HapPlayer, a still image a StillPlayer (decoded once, one texture
//   with mipmaps), an H.264 video a VideoPlayer (a decoder with state in a worker), a sound has none (it is the audio page's).
// - Each player has its own texture (RGBA8, the clip's size), recycled; after a lost GPU context they are made again
//   and the current frames asked for again.
// - PRELOAD (state.media.preload, vt.media.preload — MEDIA-SERVER.md §4.4): the clips an experience asked to keep ready
//   get a player of their own that decodes ONLY the first frame of the clip's segment onto its texture and then parks
//   (no bitmap held: one texture each, the clip's size). One at a time, after the playing clips, so a live clip is never
//   late for it. When that clip is launched, its play ADOPTS the ready player: the first frame is on screen at once.
//   A clip that leaves the list (or is already playing) lets its player go.

import { HapPool, hapWorkers } from './hap-pool.js';
import { HapPlayer, FrameLock, requestWindow } from './hap-player.js';
import { StillPlayer } from './still-player.js';
import { VideoPool } from './video-pool.js';
import { VideoPlayer } from './video-player.js';

export const HOLD_MS = 1000;
export const GRACE_MS = 1500;
export const REPORT_MS = 5000;
export const PARK_AFTER_MS = 400;
export const XLAYER = 'xlayer';
const AUTOPILOT = ['next', 'prev', 'random', 'first'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Where a clip goes in the room's image (render px, y from the top) and which part of it.
 * @param {{target?:string, wallId?:string|null, fit?:string}|null} place the clip's place
 * @param {{width:number, height:number}} clip @param {{canvas:{width,height}, walls:object[]}} prof
 * @param {{w:number, h:number}} size the render size (the canvas × the output's scale)
 * @returns {{dst:{x,y,w,h}|null, src:number[]|null}} null = the whole image / the whole clip
 */
export function placeRect(place, clip, prof, size) {
  const C = prof?.canvas || { width: size.w, height: size.h }, s = size.w / C.width, sy = size.h / C.height;
  let a = { x: 0, y: 0, w: C.width, h: C.height };
  const rectOf = (w) => w?.pixelRect && w.pixelRect.w > 0 && w.pixelRect.h > 0 ? w.pixelRect : null;
  if (place?.target === 'wall') { const r = rectOf((prof?.walls || []).find((w) => w.id === place.wallId)); if (r) a = { ...r }; }
  else if (place?.target === 'walls') {
    const rs = (prof?.walls || []).map(rectOf).filter(Boolean);
    if (rs.length) { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)); a = { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 }; }
  }
  const full = a.x === 0 && a.y === 0 && a.w === C.width && a.h === C.height;
  const fit = place?.fit || 'stretch', cw = clip?.width || a.w, ch = clip?.height || a.h;
  if (fit === 'fit') {
    const k = Math.min(a.w / cw, a.h / ch), w = cw * k, h = ch * k;
    a = { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h };
    return { dst: { x: a.x * s, y: a.y * sy, w: a.w * s, h: a.h * sy }, src: null };
  }
  let src = null;
  if (fit === 'fill') {
    const k = Math.max(a.w / cw, a.h / ch), su = a.w / (cw * k), sv = a.h / (ch * k);
    if (su < 1 - 1e-6 || sv < 1 - 1e-6) src = [(1 - su) / 2, (1 - sv) / 2, (1 + su) / 2, (1 + sv) / 2];
  }
  return { dst: full ? null : { x: a.x * s, y: a.y * sy, w: a.w * s, h: a.h * sy }, src };
}

/**
 * The weights of a layer's two plays at engine time `tEng`: {play, from, k}. A crossfade is mix(from, play, k); a launch
 * on an empty layer fades in over its transition, an eject fades out.
 */
export function fadeOf(e, tEng) {
  const T = e?.transitionMs || 0, at = e?.fadeAt;
  const k = !Number.isFinite(at) ? 1 : T > 0 ? clamp01((tEng - at) / T) : tEng >= at ? 1 : 0;
  if (e?.play && e?.from) return { play: k, from: 1 - k, k };
  if (e?.play) return { play: k, from: 0, k };
  if (e?.from) return { play: 0, from: 1 - k, k };
  return { play: 0, from: 0, k };
}

/** The frames of a play's segment: [first, last], as transport.js › playhead keeps them. */
export function segmentOf(p) {
  const top = Math.max(0, p.frames - 1);
  const first = Math.min(top, Math.max(0, Math.floor(p.in * p.fps + 1e-6)));
  const last = Math.max(first, Math.min(top, Math.ceil(p.out * p.fps - 1e-6) - 1));
  return { first, last };
}

/**
 * The frames that come right after the next wrap (loop) or turn (bounce), to prefetch when the playhead is close to it;
 * null when nothing wraps (hold, clear, an autopilot's last pass — the next clip is its own play) or it is still far.
 */
export function wrapTargets(p, ph, ventana, fps, lat) {
  const { first, last } = segmentOf(p);
  if (last <= first) return null;
  if (p.end === 'hold' || p.end === 'clear') return null;
  if (AUTOPILOT.includes(p.end) && ph.pass + 1 >= (p.loops || 1)) return null;
  const { L } = requestWindow(fps, lat), K = Math.max(1, Math.min(5, L + 1)), out = [];
  if (p.end === 'bounce') {
    if (ph.dir > 0 && last - ph.frame <= ventana + 2) for (let k = 1; k <= K && last - k >= first; k++) out.push(last - k);
    else if (ph.dir < 0 && ph.frame - first <= ventana + 2) for (let k = 1; k <= K && first + k <= last; k++) out.push(first + k);
  } else if (last - ph.frame <= ventana + 2) for (let k = 0; k <= K && first + k <= last; k++) out.push(first + k);
  return out.length ? out : null;
}

/** An absolute path of a library file ('shw/a.mov' in 'D:\\Media' → 'D:\\Media\\shw\\a.mov'). */
export function libraryFile(dir, file) {
  if (!dir || !file) return null;
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${String(file).split('/').join(sep)}`;
}

/**
 * The clip layers of one output page.
 * @param {object} d
 * @param {object} d.registry the mixer's registry (layers.js › createRegistry)
 * @param {() => object|null} d.mixer the mixer (gl.js) or null
 * @param {object} d.store conn.js › store @param {Function} d.on conn.js › on @param {Function} d.cmd conn.js › cmd
 * @param {object} d.clock clock.js › makeClock() (the engine's clock in this page)
 * @param {Function} d.playhead transport.js › playhead (served as /shared/transport.js)
 * @param {() => object} [d.spawn] a decode worker (default: hap-worker.js as a module worker)
 */
export function createMediaLayers({ registry, mixer, store, on, cmd, clock, playhead, spawn = null, spawnVideo = null, now = () => performance.now(), timers = globalThis }) {
  const group = registry.group('media');
  const players = new Map();  // playId → P = { playId, play, layerId, pl, tex, gen, w, h, ready, lock, failedAt, reported, loc, seq }
  const pre = new Map();      // clipId → P of a clip kept ready (state.media.preload): its first frame on its texture, parked
  const spare = [];           // textures to recycle: { tex, w, h, gen }
  let pool = null, vpool = null, lastHook = -Infinity, lastReport = now(), parkedAll = false;
  const rec = { late: 0, frames: 0, byLayer: {} };
  const last = {};            // layerId → what the last composed frame showed (tests, the real-size check)
  const stats = { frames: 0, parks: 0, reports: 0, errorsReported: 0, texturesMade: 0, preloaded: 0, adopted: 0 };

  const S = () => store.state;
  const M = () => S()?.media;
  const periodMs = () => 1000 / (S()?.profile?.output?.fps || 60);
  const getPool = () => pool || (pool = new HapPool({
    spawn: spawn || (() => new Worker(new URL('./hap-worker.js', import.meta.url), { type: 'module', name: 'hap' })),
    size: hapWorkers(),
  }));

  const getVPool = () => vpool || (vpool = new VideoPool({
    spawn: spawnVideo || (() => new Worker(new URL('./video-worker.js', import.meta.url), { type: 'module', name: 'video' })),
  }));

  // ------------------------------------------------------------------ textures

  function takeTexture(mx, w, h, mips = false) {
    const i = spare.findIndex((s) => s.w === w && s.h === h && s.gen === mx.generation && !!s.mips === mips);
    if (i >= 0) return spare.splice(i, 1)[0].tex;
    stats.texturesMade++;
    return mx.texture(w, h, { mips });
  }
  function releaseTexture(P) {
    const mx = mixer();
    if (P.tex && mx && P.gen === mx.generation) {
      if (spare.length < 2) spare.push({ tex: P.tex, w: P.w, h: P.h, gen: P.gen, mips: !!P.still }); else mx.deleteTexture(P.tex);
    }
    P.tex = null; P.ready = false;
  }

  /** A decoded frame onto the play's texture (the player owns the bitmap until here; it is closed here). */
  function upload(P, bm) {
    const mx = mixer();
    try {
      if (!mx || mx.lost || P.closed) return;
      const w = bm.width, h = bm.height;
      if (!P.tex || P.gen !== mx.generation || P.w !== w || P.h !== h) {
        if (P.tex && P.gen === mx.generation) mx.deleteTexture(P.tex);
        P.tex = takeTexture(mx, w, h, !!P.still); P.gen = mx.generation; P.w = w; P.h = h;
      }
      mx.upload(P.tex, bm, w, h, { mips: !!P.still }); // a still image is uploaded once: its mipmaps are made with it
      P.ready = true;
    } finally { try { bm.close(); } catch { /* closed */ } }
  }

  // ------------------------------------------------------------------ players

  /** What a play is: 'hap' | 'video' | 'image' | 'audio' — the play says (state.media), else the medium of the show. */
  function kindOf(p) {
    return p.kind || S()?.show?.media?.find((x) => x.id === p.mediaId)?.kind || 'hap';
  }

  function fileOf(p) {
    const st = S(), m = st?.show?.media?.find((x) => x.id === p.mediaId);
    return m ? libraryFile(st?.library?.dir, m.file) : null;
  }

  /** A player for play `p` (registered in `into` under `key`: the plays by playId, the preloads by clipId). */
  function create(p, layerId, into = players, key = p.playId) {
    const path = fileOf(p), pl0 = getPool();
    const kind = kindOf(p);
    const P = { playId: p.playId, play: p, layerId, path, kind, still: kind === 'image', tex: null, gen: -1, w: 0, h: 0, ready: false, closed: false, lock: new FrameLock(periodMs()), failedAt: null, reported: false, loc: 1, seq: { prev: -1, newFrames: 0, skipped: 0, late: 0, wraps: 0, frames: 0, wantPrev: -1, wrapAt: null, wrapLog: [] }, lastLate: 0 };
    const vp = kind === 'video' ? getVPool() : null;
    if (kind === 'image') P.pl = new StillPlayer({ path, pool: pl0, deliver: (bm) => upload(P, bm) });
    else if (vp) P.pl = new VideoPlayer({ path, pool: vp, deliver: (bm) => upload(P, bm), now });
    else P.pl = new HapPlayer({ path, pool: pl0, deliver: (bm) => upload(P, bm), now });
    into.set(key, P);
    if (!path) { P.pl.broken = 'read: the clip\'s file is not in the show'; return P; }
    if (kind === 'image') return P; // (decoded at its first drive: no index, no pool slot)
    (vp || pl0).info(path).then((ix) => { if (P.closed) return; P.pl.setInfo(ix); (vp || pl0).add(P.pl); (vp || pl0).pump(); }, (e) => { if (!P.closed) P.pl.broken = String(e?.message || e); });
    return P;
  }

  function closePlayer(P) {
    P.closed = true;
    P.pl.close();
    releaseTexture(P);
    if (players.get(P.playId) === P) players.delete(P.playId);
    if (pre.get(P.play.clipId) === P) pre.delete(P.play.clipId);
    if (P.path && ![...players.values(), ...pre.values()].some((x) => x.path === P.path)) { pool?.closeFile(P.path); vpool?.closeFile(P.path); } // (the decoder of a clip goes with its last player)
  }

  // ------------------------------------------------------------------ preload (state.media.preload)

  /** What a kept-ready clip's player plays: its segment, from the medium's video (frames, rate). */
  function preloadPlay(clip, m) {
    const fps = m?.video?.fps || 30, frames = Math.max(1, m?.video?.frames || 1);
    return { playId: `pre:${clip.id}`, clipId: clip.id, mediaId: clip.mediaId, kind: m?.kind || 'hap', in: clip.in || 0, out: clip.out ?? frames / fps, fps, frames, end: 'hold', loops: 1, startAt: 0, offset: 0 };
  }

  /**
   * After the plays of this frame: the preloads follow state.media.preload — a player for each clip asked for that is not
   * playing, its first frame decoded (ONE player at a time, the oldest first), then parked; the rest let go.
   */
  function preloadStep(mx, st, m) {
    const show = st?.show, want = new Set((m?.preload || []).filter((id) => show?.clips?.some((c) => c.id === id)));
    const playing = new Set([...players.values()].map((P) => P.play.clipId));
    for (const [clipId, P] of [...pre]) if (!want.has(clipId) || playing.has(clipId)) closePlayer(P);
    for (const clipId of want) {
      if (pre.has(clipId) || playing.has(clipId)) continue;
      const clip = show.clips.find((c) => c.id === clipId);
      create(preloadPlay(clip, show.media?.find((x) => x.id === clip.mediaId)), null, pre, clipId);
      stats.preloaded++;
    }
    let driving = false;
    for (const P of pre.values()) {
      if (P.gen !== -1 && P.gen !== mx.generation) { P.tex = null; P.ready = false; P.gen = -1; P.pl.shown = -1; } // a lost context: again
      if (P.ready || P.pl.broken) { if (!P.pl.parked) P.pl.park(); continue; }
      if (driving) continue;
      driving = true;
      const { first } = segmentOf(P.play);
      try { P.pl.drive(first, { dir: 1, first, last: first, fps: P.play.fps }); } catch (e) { P.pl.broken = `read: ${e?.message || e}`; }
    }
  }

  /** A launched play of a kept-ready clip takes its player: the first frame is already on its texture. */
  function adopt(x, mx) {
    const P = pre.get(x.p.clipId);
    if (!P || P.pl.broken || P.gen !== mx.generation || P.path !== fileOf(x.p)) return null;
    pre.delete(x.p.clipId);
    Object.assign(P, { playId: x.p.playId, play: x.p, layerId: x.layerId, lock: new FrameLock(periodMs()) });
    players.set(P.playId, P);
    stats.adopted++;
    return P;
  }

  /** Every play the transport has now, with its layer: [{p, layerId, role: 'play'|'from'}]. */
  function plays() {
    const m = M(), out = [];
    if (!m) return out;
    for (const [id, e] of [...Object.entries(m.layers || {}), [XLAYER, m.xlayer]]) {
      if (!e) continue;
      // a sound has no picture: it is the audio page's (ui/js/audio-media.js), the mixer makes no player for it
      if (e.from && kindOf(e.from) !== 'audio') out.push({ p: e.from, layerId: id, role: 'from', e });
      if (e.play && kindOf(e.play) !== 'audio') out.push({ p: e.play, layerId: id, role: 'play', e });
    }
    return out;
  }

  /** Players whose play is no longer in the transport go (their bitmaps and texture with them), and the clip layers
   *  this module made that showed nothing this frame (only its own: others may register layers in the group too). */
  function sweep(keep) {
    for (const P of [...players.values()]) if (!keep.has(P.playId)) closePlayer(P);
    for (const id of [...mine]) if (!keepLayers.has(id)) { group.remove(id); mine.delete(id); }
  }
  let keepLayers = new Set();
  const mine = new Set(); // ids of the clip layers made here

  function parkAll() {
    if (parkedAll) return;
    parkedAll = true; stats.parks++;
    for (const P of [...players.values(), ...pre.values()]) P.pl.park();
  }

  // ------------------------------------------------------------------ one composed frame

  function frame({ t }) {
    lastHook = now(); parkedAll = false;
    stats.frames++;
    const mx = mixer(), st = S(), m = M();
    if (!mx || !st || !m) { keepLayers = new Set(); sweep(new Set()); return; }
    const tEng = clock.engineNow(t);
    const list = plays();
    const keep = new Set(list.map((x) => x.p.playId));
    keepLayers = new Set();
    if (tEng === null) { sweep(keep); preloadStep(mx, st, m); return; } // no engine clock yet (no live message): nothing can be placed in time
    const prof = st.profile, size = { w: mx.width, h: mx.height };
    const order = new Map((st.show?.layers || []).map((l, i) => [l.id, i]));
    const byLayer = new Map();
    // every player says what it wants, THEN the free workers go to the most urgent frames of all of them
    if (list.length) getPool().batch(() => {
      for (const x of list) {
        let P = players.get(x.p.playId);
        if (!P) P = adopt(x, mx) || create(x.p, x.layerId);
        P.play = x.p; P.layerId = x.layerId;
        if (P.gen !== -1 && P.gen !== mx.generation) { P.tex = null; P.ready = false; P.gen = -1; P.pl.shown = -1; } // a lost context: everything again
        if (!byLayer.has(x.layerId)) byLayer.set(x.layerId, { e: x.e, from: null, play: null });
        byLayer.get(x.layerId)[x.role] = P;
        if (x.e.bypass) { P.pl.park(); continue; }
        drivePlay(P, t, tEng);
      }
    });
    for (const [layerId, b] of byLayer) compose(layerId, b, tEng, prof, size, order.has(layerId) ? order.get(layerId) : layerId === XLAYER ? 1000 : 999);
    sweep(keep);
    preloadStep(mx, st, m); // (after the plays: what is live asks for its frames first)
    report();
  }

  function drivePlay(P, t, tEng) {
    const p = P.play, pl = P.pl, fps = p.fps || 30;
    const target = (tEng - p.startAt) / 1000 + (p.offset || 0);
    const el = P.lock.step(t, target, fps);
    const ph = playhead(p, p.startAt + (el - (p.offset || 0)) * 1000);
    const { first, last: lastF } = segmentOf(p);
    const wrapTo = pl.ix ? wrapTargets(p, ph, pl.ventana, fps, pl.lat) : null;
    const before = pl.shown;
    try { pl.drive(ph.frame, { dir: ph.dir, first, last: lastF, fps, wrapTo }); } catch (e) { pl.broken = `read: ${e?.message || e}`; }
    // what the room saw: new frames, skipped ones (more than one step forward), late ones (the wanted one not there),
    // and at each wrap of a loop the first frame shown and how many output frames after the clock wrapped
    const q = P.seq;
    q.frames++;
    if (q.wantPrev >= 0 && ph.dir * (ph.frame - q.wantPrev) < 0) q.wrapAt = q.frames;
    q.wantPrev = ph.frame;
    if (pl.shown !== before && pl.shown >= 0) {
      q.newFrames++; rec.frames++;
      const d = ph.dir * (pl.shown - (q.prev < 0 ? pl.shown : q.prev));
      if (d > 1) q.skipped += d - 1;
      else if (d < 0) {
        q.wraps++;
        q.wrapLog.push({ first: pl.shown, late: q.wrapAt === null ? null : q.frames - q.wrapAt });
        if (q.wrapLog.length > 8) q.wrapLog.shift();
        q.wrapAt = null;
      }
      q.prev = pl.shown;
    }
    if (pl.ix && pl.shown !== ph.frame && ph.started) q.late++;
    // (the first frame is asked for during the preroll, before anything shows: not a late frame of the room)
    const lateNow = pl.stats.late - P.lastLate;
    if (lateNow > 0) { if (ph.started) { rec.late += lateNow; rec.byLayer[P.layerId] = (rec.byLayer[P.layerId] || 0) + lateNow; } P.lastLate = pl.stats.late; }
    P.last = { el, target, frame: ph.frame, dir: ph.dir, started: ph.started, shown: pl.shown };
    // a broken clip: its last image stays HOLD_MS, then the engine is told (it ejects it with the layer's transition)
    if (pl.broken && P.failedAt === null) P.failedAt = now();
    if (P.failedAt !== null && !P.reported && now() - P.failedAt >= HOLD_MS) {
      P.reported = true; stats.errorsReported++;
      Promise.resolve().then(() => cmd('media.report', { playId: p.playId, error: pl.broken })).catch(() => {});
    }
  }

  /** The local fade of a broken clip the engine did not eject (it may be down): after HOLD_MS + GRACE_MS, out over T. */
  function localWeight(P, e, role) {
    if (P.failedAt === null || role !== 'play') return P.loc;
    const T = Math.max(1, e.transitionMs || 500), since = now() - (P.failedAt + HOLD_MS + GRACE_MS);
    if (since > 0) P.loc = Math.min(P.loc, clamp01(1 - since / T));
    return P.loc;
  }

  function compose(layerId, b, tEng, prof, size, order) {
    const e = b.e, f = fadeOf(e, tEng);
    const A = b.from, B = b.play;
    const okA = A?.ready && A.tex, okB = B?.ready && B.tex;
    let wA = okA ? f.from * localWeight(A, e, 'from') : 0, wB = okB ? f.play * localWeight(B, e, 'play') : 0;
    if (okA && B && !okB) wA = f.from + f.play; // the incoming clip has no image yet: the outgoing one stays full
    const placeOf = (P) => { const c = S()?.show?.clips?.find((x) => x.id === P.play.clipId); return placeRect(c?.place, { width: P.w, height: P.h }, prof, size); };
    const visible = !e.bypass, base = { blend: e.blend || null, visible };
    const opacity = Number.isFinite(e.opacity) ? e.opacity : 1;
    const put = (id, o, P, w, extra = {}) => {
      keepLayers.add(id); mine.add(id);
      const r = placeOf(P);
      group.add(id, { ...base, order: o, opacity: opacity * clamp01(w), place: r.dst, src: r.src }).show(P.tex).crossfade(extra.texB || null, extra.mix || 0);
    };
    const pa = okA && placeOf(A), pb = okB && placeOf(B);
    if (okA && okB && JSON.stringify(pa) === JSON.stringify(pb)) {
      // one layer, mix(from, play, k) — the crossfade shader (premultiplied colour)
      const sum = wA + wB;
      put(layerId, order, A, sum, { texB: B.tex, mix: sum > 0 ? wB / sum : 0 });
    } else {
      if (okA) put(layerId, order, A, wA);
      if (okB) put(okA ? `${layerId}~` : layerId, order + 0.5, B, wB);
    }
    last[layerId] = { k: f.k, wA, wB, from: A && { playId: A.playId, ...A.last }, play: B && { playId: B.playId, ...B.last }, tEng };
  }

  function report() {
    const t = now();
    if (t - lastReport < REPORT_MS) return;
    const secs = (t - lastReport) / 1000;
    lastReport = t;
    if (rec.late > 0) {
      stats.reports++;
      const msg = { late: rec.late, frames: rec.frames, seconds: Math.round(secs * 10) / 10, layers: { ...rec.byLayer } };
      Promise.resolve().then(() => cmd('media.report', msg)).catch(() => {});
    }
    rec.late = 0; rec.frames = 0; rec.byLayer = {};
  }

  // ------------------------------------------------------------------ calibration, parking, the engine's messages

  /** The clip layers are drawn now (output on, the media layer in what the page draws, no calibration). */
  function drawn() {
    const st = S();
    if (!st?.profile?.output?.on || st.output?.calibrating) return false;
    return (st.output?.layersEffective || st.profile.output.layers || []).some((l) => l.id === 'media' && l.on !== false);
  }

  function sync() {
    const keep = new Set(plays().map((x) => x.p.playId));
    for (const P of [...players.values()]) if (!keep.has(P.playId)) closePlayer(P);
    if (!drawn()) parkAll();
  }
  const offs = [on?.('state', sync), on?.('media', sync)].filter(Boolean);
  // no frame with the clip layers for a while (blackout at full, output off, the page's frames stopped): park
  const watchdog = timers.setInterval?.(() => { if (players.size && now() - lastHook > PARK_AFTER_MS) parkAll(); }, 200);

  const off = group.onFrame(frame);
  return {
    frame, sync, parkAll,
    /** Something is on a clip layer, or a kept-ready clip is still decoding its first frame (the output must keep composing). */
    get busy() { return players.size > 0 || [...pre.values()].some((P) => !P.pl.parked && !P.pl.broken); }, // (until it is parked)
    get pool() { return pool; },
    players,
    preloads: pre,
    last,
    stats,
    /** A summary for the tests and the health figures. */
    info() {
      return {
        frames: stats.frames, parks: stats.parks, reports: stats.reports, errorsReported: stats.errorsReported, texturesMade: stats.texturesMade,
        workers: pool ? pool.workers.length : 0, inFlight: pool ? pool.inFlight : 0, pool: pool ? { ...pool.stats } : null,
        video: vpool ? { workers: vpool.workers.length, inFlight: vpool.inFlight, ...vpool.stats } : null,
        players: [...players.values()].map((P) => ({
          playId: P.playId, layerId: P.layerId, clipId: P.play.clipId, ready: P.ready, held: P.pl.held, pend: P.pl.pend.size,
          shown: P.pl.shown, quiere: P.pl.quiere, lat: Math.round(P.pl.lat * 10) / 10, parked: P.pl.parked, broken: P.pl.broken,
          fourcc: P.pl.ix?.fourcc || null, seq: { ...P.seq, wrapLog: [...P.seq.wrapLog] }, stats: { ...P.pl.stats }, last: P.last || null,
          failedAt: P.failedAt, reported: P.reported, kind: P.kind, w: P.w, h: P.h, reduced: !!P.pl.reduced,
        })),
        preloaded: stats.preloaded, adopted: stats.adopted,
        preloads: [...pre.values()].map((P) => ({ clipId: P.play.clipId, ready: P.ready, shown: P.pl.shown, held: P.pl.held, parked: P.pl.parked, broken: P.pl.broken })),
      };
    },
    destroy() {
      off(); for (const o of offs) o(); timers.clearInterval?.(watchdog);
      for (const P of [...players.values(), ...pre.values()]) closePlayer(P);
      pool?.terminate(); pool = null; vpool?.terminate(); vpool = null;
    },
  };
}
