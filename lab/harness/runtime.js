// VEATION Touch lab — the DEV RUNTIME. The lab server (harness/serve.mjs) serves this file as /experiences/runtime.js, so a
// runtime-ready experiment (`import { connectExperience } from '/experiences/runtime.js'`) runs UNCHANGED in a plain browser:
// the same vt shape as the app's experiences/runtime.js, on the XR Lab room (strip 7196×912, 4 walls in metres, closed loop),
// with the mouse as a hand, pinned hands, virtual hands, overlay, body scale, parameters panel and a simulated 4.1 room.
//
// The hands go through the REAL runtime's makeHands (the app's file, read-only, served as /__real/runtime.js): the same
// strokes, the same stitching, the same playback. `L` turns on the "LiDAR feel": readings at 10 Hz, some missed, the tracker
// id changing after a miss, played back 150 ms late — an experiment that survives L survives the sensor.
//
// Differences from the app (do not rely on them): no Spout, no engine, vt.media is the app's own simulation (stand-in clips),
// the walls have no masks, wall heights are LabKit.ROOM.wallHeight (3.75 m; the profile says 3.5 while it is confirmed).
import { makeHands, makeMedia, standInSlots } from '/__real/runtime.js';

const q = new URLSearchParams(location.search);
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), ms))]);

let kitReady = null;
function loadKit() {
  if (window.LabKit) return Promise.resolve();
  kitReady ??= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/harness/kit.js'; s.onload = res; s.onerror = () => rej(new Error('kit.js')); document.head.appendChild(s); });
  return kitReady;
}

/** The first canvas of the page, as the app shows it in a browser: filling the window, proportions kept, on black. */
function fillWindow() {
  const c = document.querySelector('canvas:not([data-lk])');
  if (!c) return null;
  const de = document.documentElement.style, b = document.body.style;
  de.background = b.background = '#000'; b.margin = '0'; b.overflow = 'hidden';
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', display: 'block', objectFit: 'contain' });
  return c;
}
/** Where the strip is on screen: the canvas's content box (object-fit: contain). */
function stripRect(c) {
  const b = c.getBoundingClientRect(), a = c.width / c.height, ba = b.width / b.height;
  if (ba > a) { const w = b.height * a; return { x: b.left + (b.width - w) / 2, y: b.top, w, h: b.height }; }
  const h = b.width / a; return { x: b.left, y: b.top + (b.height - h) / 2, w: b.width, h };
}

/** F (25-11): one wall of the strip filling the window (R.zoom 1..n), or the whole strip (0). The canvas is laid out larger and shifted,
 *  so stripRect() — and with it the mouse → hand mapping and the overlay — stays exact. */
function applyZoom(R) {
  const c = R.canvas; if (!c) return;
  const K = R.K, S = K.ROOM.strip, w = R.zoom ? K.ROOM.walls[R.zoom - 1] : null;
  if (!w) { Object.assign(c.style, { inset: '0', left: '', top: '', width: '100vw', height: '100vh', objectFit: 'contain' }); return; }
  const SW = Math.min(innerWidth * S.width / w.w, innerHeight * S.width / S.height), SH = SW * S.height / S.width;
  const left = (innerWidth - (w.w / S.width) * SW) / 2 - (w.x / S.width) * SW, top = (innerHeight - SH) / 2;
  Object.assign(c.style, { inset: 'auto', left: left + 'px', top: top + 'px', width: SW + 'px', height: SH + 'px', objectFit: 'fill' });
}

/** A page with no canvas (a sound piece): the strip drawn as a band across the window. */
function bandRect() { const w = Math.max(200, innerWidth - 96), h = w * 912 / 7196; return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h }; }

async function manifestOf() {
  try { return await within(fetch(new URL('manifest.json', document.baseURI)).then((r) => r.json()), 2500); } catch { return null; }
}

/** The shared room: one stage (hands, overlay, keys) per page, one simulated 4.1 room on demand. */
let shared = null;
async function room(opt) {
  if (shared) return shared;
  await loadKit();
  const K = window.LabKit;
  const R = { K, stage: null, audio: null, listeners: [], hands: new Map(), vts: new Set(), t: 0 };
  R.stage = K.createStage({
    title: opt.title || document.title || 'Experiment', fixedStrip: true, backdrop: !!opt.backdrop, view: opt.view || (() => (R.canvas ? stripRect(R.canvas) : bandRect())),
    hint: opt.hint, help: opt.help,
    onSound: (on) => { R.audio?.setOn(on); },
    onF: () => { R.zoom = ((R.zoom || 0) + 1) % (K.ROOM.walls.length + 1); applyZoom(R); },   // F: one wall large, in turn (25-11, Beltrán)
  });
  addEventListener('resize', () => applyZoom(R));
  R.stage.onGesture(() => { R.audio?.resume(); });
  shared = R;
  return R;
}


/**
 * What the sensors would tell one consumer (a visual vt, or a sound vt) about the kit's hands: [{ id, wallId, x, y, size, t, pxPerM }]
 * in the consumer's pixels, or null between two readings in the LiDAR feel (10 Hz, ~6 % of the readings missed, a new tracker id after a miss).
 */
function makeSensor(R, vt, sound) {
  const tracker = new Map(); let trackerSeq = 1000, last = 0; const miss = new Map();
  return (now) => {
    const lidar = R.stage.lidar, W = vt.size.width, H = vt.size.height, hs = R.stage.hands(), out = [];
    if (lidar) { if (now - last < 100) return null; last = now; }
    for (const h of hs) {
      if (lidar) {
        if (miss.get(h.key) > 0) { miss.set(h.key, miss.get(h.key) - 1); continue; }
        if (Math.random() < 0.06) { miss.set(h.key, 1); tracker.delete(h.key); continue; }
      }
      if (!tracker.has(h.key)) tracker.set(h.key, lidar ? trackerSeq++ : h.id);
      const w = vt.walls.find((k) => k.id === h.wallId), rw = R.K.ROOM.wall(h.wallId), pxPerM = sound ? rw.w / rw.width : (w ? w.pxPerM : 1);
      const r = { id: tracker.get(h.key), wallId: h.wallId, x: h.s * W, y: h.t * H, size: sound ? h.size : h.size * pxPerM, t: now, pxPerM };
      if (sound) { r.u = h.u; r.v = h.v; }
      out.push(r);
    }
    for (const k of [...tracker.keys()]) if (!hs.some((h) => h.key === k)) tracker.delete(k);
    return out;
  };
}

function ensureAudio(R) {
  if (!R.audio) { R.audio = R.K.createRoomAudio(); R.stage.addMeters(R.audio.levels); R.stage.state.soundOn && R.audio.setOn(true); }
  return R.audio;
}

function setParams(vt, next) { Object.keys(vt.params).forEach((k) => delete vt.params[k]); Object.assign(vt.params, next); vt.emit('params', vt.params); }

function baseHandle() {
  const listeners = { params: new Set(), touch: new Set(), resize: new Set() };
  return {
    params: {}, sink: 'browser', fit: 'fit', fps: 60, standalone: true, harness: true, id: null,
    on(type, fn) { (listeners[type] ??= new Set()).add(fn); return () => listeners[type].delete(fn); },
    emit(type, e) { for (const fn of listeners[type] || []) { try { fn(e); } catch (err) { console.error(err); } } },
  };
}

/**
 * Same signature as the app's connectExperience. { sound: true, id } → a SOUND piece's vt (no canvas); otherwise a visual one.
 * Extra for the lab: ?scale=1 (default 0.5: half-size render, fast), ?params={json}, ?sound=<id> (a sound piece plays with this one),
 * ?soundParams={json} (that sound piece's parameters, e.g. {"lang":"es"}).
 */
export async function connectExperience(opt = {}) {
  const manifest = await manifestOf();
  const id = (location.pathname.match(/\/experiences\/([^/]+)\//) || [])[1] || opt.id || null;
  const R = await room({ title: manifest?.name || document.title, backdrop: !!opt.sound, help: manifest?.lab?.help });
  const K = R.K, RM = K.ROOM, WH = RM.wallHeight;
  const vt = Object.assign(baseHandle(), { id, closedLoop: true });
  // parameters: the manifest's defaults, then ?params=
  for (const p of manifest?.params || []) if (p && p.key && 'default' in p) vt.params[p.key] = p.default;
  try { if (q.has('params')) Object.assign(vt.params, JSON.parse(q.get('params'))); } catch { /* ignore a bad ?params */ }
  if (manifest?.params?.length) R.stage.params(manifest.params, vt.params, () => vt.emit('params', vt.params));

  if (opt.sound) return connectSound(vt, R);

  const scale = Number(q.get('scale')) > 0 ? Math.min(1, Number(q.get('scale'))) : 0.5;
  const size = { width: Math.round(RM.strip.width * scale), height: Math.round(RM.strip.height * scale) };
  vt.canvas = { ...RM.strip }; vt.scale = scale; vt.size = size;
  vt.walls = RM.walls.map((w) => ({ id: w.id, name: w.name, rect: { x: Math.round(w.x * scale), y: 0, w: Math.round(w.w * scale), h: size.height }, width: w.width, height: WH, pxPerM: (w.w * scale) / w.width, masks: [] }));
  vt.toPx = (wallId, xm, ym) => { const w = vt.walls.find((k) => k.id === wallId) || vt.walls[0]; return [w.rect.x + (xm / w.width) * w.rect.w, w.rect.y + (1 - ym / w.height) * w.rect.h]; };
  const stand = standInSlots(manifest?.media);
  vt.media = makeMedia({ real: false, slots: () => stand });
  // Two sets of hands, both the app's makeHands: direct (the pointer is where it is) and the LiDAR feel (10 Hz readings, 150 ms late,
  // stitched). Both speak through vt.emit('touch'); only the one being fed has anything to say.
  const H1 = makeHands(vt, { direct: true }), H2 = makeHands(vt);
  const sensor = makeSensor(R, vt, false);
  let mode = false, canvas = null, along = null;
  vt.hands = () => (R.stage.lidar ? H2 : H1).hands();
  vt.touches = () => (R.stage.lidar ? H2 : H1).touches();
  vt._tick = () => { H1.tick(); H2.tick(); };
  const feed = (now) => {
    if (R.stage.lidar !== mode) { (mode ? H2 : H1).ingest([], now); mode = R.stage.lidar; } // the set that stops lets go of its hands
    const r = sensor(now);
    if (r) (mode ? H2 : H1).ingest(r, now);
    along?.feed(now);
  };
  vt.loop = (fn, src) => {
    let last = performance.now(), raf = 0;
    const step = (tNow) => {
      const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!canvas) { canvas = fillWindow(); if (canvas) { R.canvas = canvas; canvas.dataset.lkSeen = '1'; } }
      try { R.stage.step(dt); feed(now); vt._tick(); fn(dt); } catch (e) { console.error(e); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  };
  vt.frame = () => {};
  addEventListener('resize', () => vt.emit('resize', vt.size));
  // a sound piece that plays alongside: ?sound=<id>
  if (q.get('sound')) along = await startAlongside(q.get('sound'), R, vt);
  window.__vtDev = vt; window.__labRoom = R;
  window.__vtStarted?.();
  return vt;
}

// ------------------------------------------------------------------------------------------------ sound
async function connectSound(vt, R) {
  const K = R.K, RM = K.ROOM;
  vt.sink = 'sound'; vt.canvas = { ...RM.strip }; vt.scale = 1; vt.size = { ...RM.strip };
  vt.walls = RM.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: RM.wallHeight }));
  const sh = makeHands(vt, { sound: true });
  vt.hands = () => sh.hands();
  vt._tick = () => sh.tick();
  vt.dispose = () => {};
  const sensor = makeSensor(R, vt, true);
  vt.feed = (now) => { const r = sensor(now); if (r) sh.ingest(r, now); else sh.tick(); };
  // the sound page drives itself
  if (!R.__soundLoop) {
    R.__soundLoop = true; let last = performance.now();
    const step = () => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; try { R.stage.step(dt); vt.feed(now); } catch (e) { console.error(e); } requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  window.__vtDev = vt; window.__labRoom = R;
  return vt;
}

/** Starts a sound piece `id` with its own sound vt on the same hands. Returns { feed }. */
async function startAlongside(id, R, visual) {
  const manifest = await within(fetch(`/experiences/${encodeURIComponent(id)}/manifest.json`).then((r) => r.json()), 2500).catch(() => null);
  const svt = Object.assign(baseHandle(), { id, closedLoop: true });
  for (const p of manifest?.params || []) if (p && p.key && 'default' in p) svt.params[p.key] = p.default;
  try { if (q.has('soundParams')) Object.assign(svt.params, JSON.parse(q.get('soundParams'))); } catch { /* ignore a bad ?soundParams */ }   // e.g. ?soundParams={"lang":"es"}
  const K = R.K, RM = K.ROOM;
  svt.sink = 'sound'; svt.canvas = { ...RM.strip }; svt.scale = 1; svt.size = { ...RM.strip };
  svt.walls = RM.walls.map((w) => ({ id: w.id, name: w.name, width: w.width, height: RM.wallHeight }));
  const sh = makeHands(svt, { sound: true });
  svt.hands = () => sh.hands(); svt.dispose = () => {};
  await startSoundPiece(id, svt, R);
  const sensor = makeSensor(R, svt, true);
  return { feed: (now) => { const r = sensor(now); if (r) sh.ingest(r, now); else sh.tick(); } };
}

/** Run `experiences/<id>/sound.js` against the simulated room. Returns the piece ({ setParams, stop }). */
export async function startSoundPiece(id, vt, R) {
  R ??= shared; const audio = ensureAudio(R);
  const mod = await import(`/experiences/${encodeURIComponent(id)}/sound.js`);
  const piece = await mod.default({ audio: audio.audio, vt, params: vt.params });
  vt.on('params', (p) => { try { piece?.setParams?.({ ...p }); } catch (e) { console.error(e); } });
  window.__soundPiece = piece;
  return piece;
}
