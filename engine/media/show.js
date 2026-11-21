// Show: what a room's media server plays (MEDIA-SERVER.md §4.2, D8) — the media files it uses from the library, the
// clips made from them, the layers, the decks of the clip grid and the experience presets. It is a file apart from the
// room profile (`shows/<id>.json`, with versions like the profiles): the same show opens in another room, and the
// profile only says which show it plays (`profile.media.showId`).
//
// `normalizeShow` is the single gate: a show loaded from disk, edited by the UI or imported goes through it, gets its
// defaults, gets clamped, and loses whatever points nowhere (a clip without its media, a cell without its clip…).
// Environment-neutral apart from the profile helpers it reuses: no file system here.

import { OUTPUT_BLENDS, AUDIO_ROUTES, slug } from '../profile.js';
import { HAP_FORMATS } from './hap.js';

export const SHOW_SCHEMA = 2; // 2: media.kind (hap | video | image | audio); a schema-1 show is all HAP, which is the default kind
export const MAX_LAYERS = 8;
export const DEFAULT_LAYERS = 3;
export const DEFAULT_COLUMNS = 8;
export const MAX_COLUMNS = 256;
export const MAX_TRANSITION_MS = 10000;
/** What a library file is: a HAP movie, a native video (H.264 in MP4/MOV), a still image or a sound. */
export const MEDIA_KINDS = ['hap', 'video', 'image', 'audio'];
/** The length a still image is given for the autopilot and for the clip's `out` (docs/research/media-formats.md §4.1). */
export const STILL_SECONDS = 10;
/** A sound or an image has no frames of its own: the transport still counts them at this rate. */
export const SYNTH_FPS = 30;

/** How a clip ends (§2.2). A clip may also say 'layer': whatever its layer says. */
export const LAYER_ENDS = ['loop', 'hold', 'clear', 'bounce', 'next', 'prev', 'random', 'first'];
export const CLIP_ENDS = ['layer', ...LAYER_ENDS];
/** What a second launch of a playing clip does (§2.1): Normal (restart) or Toggle (eject). */
export const LAYER_TRIGGERS = ['restart', 'toggle'];
export const CLIP_TRIGGERS = ['layer', ...LAYER_TRIGGERS];
/** A layer's or a clip's own audio route (§4c.3); null = the next one up (layer → room). The matrix is the room's. */
export const CLIP_ROUTES = AUDIO_ROUTES.filter((r) => r !== 'auto' && r !== 'matrix');
export const FITS = ['stretch', 'fit', 'fill'];
export const PLACE_TARGETS = ['canvas', 'wall', 'walls'];
export const PRESET_ON_LOAD = ['keep', 'clear'];

const LAYER_DEFAULTS = Object.freeze({ opacity: 1, blend: 'normal', bypass: false, transitionMs: 500, end: 'loop', trigger: 'restart', ignoreColumn: false });

const num = (v, d, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const int = (v, d, min, max) => Math.round(num(v, d, min, max));
const str = (v, d = '', n = 200) => (typeof v === 'string' ? v.slice(0, n) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const idOf = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : null);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Gives every item an id that is valid and unique (`prefix` + n for the ones that have none or repeat one). */
function uniqueIds(list, prefix) {
  const seen = new Set(), taken = new Set(list.map((x) => x.id).filter(Boolean));
  let k = 1;
  for (const item of list) {
    if (!item.id || seen.has(item.id)) {
      let v; do { v = `${prefix}${k++}`; } while (seen.has(v) || taken.has(v));
      item.id = v;
    }
    seen.add(item.id);
  }
  return list;
}

/**
 * A path relative to the library folder, with forward slashes, that cannot leave it: no drive, no root, no `..`, no
 * characters Windows refuses in a name (':' would also open an NTFS alternate stream). null when it is none of that.
 */
export function libraryPath(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!s || s.length > 400 || s.startsWith('/') || /^[A-Za-z]:/.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || /[<>:"|?*\u0000-\u001f]/.test(p) || /[. ]$/.test(p))) return null;
  return s;
}

/** The file name of a library path ('alma-reel/Reel 2026.mov' → 'Reel 2026.mov'). */
export const fileName = (file) => String(file || '').split('/').pop();
/** A clip's default name: the file name without its extension. */
export const clipName = (file) => fileName(file).replace(/\.[^.]+$/, '') || 'Clip';

function normMedia(m) {
  if (!m || typeof m !== 'object') return null;
  const kind = pick(m.kind, MEDIA_KINDS, 'hap');
  const file = libraryPath(m.file), v = m.video && typeof m.video === 'object' ? m.video : null;
  const a = m.audio && typeof m.audio === 'object' ? m.audio : null;
  if (!file) return null;
  if (kind === 'hap' && (!v || !HAP_FORMATS[v.fourcc])) return null; // a HAP movie inside the library
  if (kind !== 'hap' && !v && !(kind === 'audio' && a)) return null;
  const dur0 = num(a?.duration, 1, 0, 1e7);
  const vv = v || { fourcc: 'AUD ', width: 1, height: 1, fps: SYNTH_FPS, frames: Math.max(1, Math.round(dur0 * SYNTH_FPS)), duration: dur0 };
  const fps = num(vv.fps, 30, 0.1, 1000);
  const video = {
    fourcc: str(vv.fourcc, '', 16), width: int(vv.width, 16, 1, 65535), height: int(vv.height, 16, 1, 65535), fps: r3(fps),
    frames: int(vv.frames, 1, 1, 1e9), duration: r3(num(vv.duration, 0, 0, 1e7)),
  };
  if (kind === 'video') { // what the player and the import need to know about a native video
    video.codec = str(vv.codec, '', 40);
    video.rotation = pick(int(vv.rotation, 0, 0, 270), [0, 90, 180, 270], 0);
    video.gop = int(vv.gop, 0, 0, 1e6);
    video.vfr = bool(vv.vfr, false);
  }
  const im = m.image && typeof m.image === 'object' ? m.image : null;
  return {
    id: idOf(m.id),
    file,
    kind,
    size: int(m.size, 0, 0, Number.MAX_SAFE_INTEGER),
    mtimeMs: Math.round(num(m.mtimeMs, 0, 0)),
    fingerprint: typeof m.fingerprint === 'string' && /^[0-9a-f]{40}$/.test(m.fingerprint) ? m.fingerprint : null,
    video,
    audio: a ? {
      format: typeof a.format === 'string' && /^[fsu](8|16|24|32|64)(le|be)?$/.test(a.format) ? a.format : null, // the PCM encoding, null = will not play
      codec: str(a.codec, '', 8), codecName: str(a.codecName, '', 80),
      supported: bool(a.supported, false) && typeof a.format === 'string',
      channels: int(a.channels, 0, 0, 64), rate: int(a.rate, 0, 0, 768000), frames: int(a.frames, 0, 0, Number.MAX_SAFE_INTEGER),
      duration: r3(num(a.duration, 0, 0, 1e7)),
      // a sound that Chromium decodes (AAC, MP3…): its PCM is made once into the audio cache (engine/media/audio-cache.js)
      cache: bool(a.cache, false),
    } : null,
    ...(kind === 'image' && im ? { image: { format: str(im.format, '', 8), width: int(im.width, 1, 1, 1e6), height: int(im.height, 1, 1, 1e6), animated: bool(im.animated, false),
      reduced: im.reduced && typeof im.reduced === 'object' ? { width: int(im.reduced.width, 1, 1, 65535), height: int(im.reduced.height, 1, 1, 65535) } : null } } : {}),
    notes: arr(m.notes, 8).map((x) => str(x, '', 200)).filter(Boolean), // what the import said about the file (warnings): the inspector shows them
    thumbFrame: m.thumbFrame === null || m.thumbFrame === undefined ? null : int(m.thumbFrame, 0, 0, 1e9), // null = at 10 %
  };
}

function normAudioRef(a, routes) {
  return { gainDb: Math.round(num(a?.gainDb, 0, -60, 12) * 10) / 10, route: routes.includes(a?.route) ? a.route : null };
}

function normClip(c, media) {
  if (!c || typeof c !== 'object') return null;
  const m = media.get(c.mediaId);
  if (!m) return null; // a clip without its media cannot play: it goes (and so do its cells)
  const dur = m.video.duration;
  const inS = r3(num(c.in, 0, 0, Math.max(0, dur)));
  const out = c.out === null || c.out === undefined ? null : r3(num(c.out, dur, 0, dur));
  const place = c.place && typeof c.place === 'object' ? c.place : {};
  const target = pick(place.target, PLACE_TARGETS, 'canvas');
  return {
    id: idOf(c.id), mediaId: m.id,
    name: str(c.name, '', 80) || clipName(m.file),
    color: typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color.toLowerCase() : null,
    end: pick(c.end, CLIP_ENDS, 'layer'),
    loops: int(c.loops, 1, 1, 99),
    in: inS,
    out: out !== null && out > inS ? out : null,
    trigger: pick(c.trigger, CLIP_TRIGGERS, 'layer'),
    transitionMs: c.transitionMs === null || c.transitionMs === undefined ? null : int(c.transitionMs, 0, 0, MAX_TRANSITION_MS),
    place: { target, wallId: target === 'wall' ? idOf(place.wallId) : null, fit: pick(place.fit, FITS, 'stretch') },
    audio: { ...normAudioRef(c.audio, CLIP_ROUTES) },
  };
}

function normLayer(l, i) {
  l = l && typeof l === 'object' ? l : {};
  const D = LAYER_DEFAULTS;
  return {
    id: idOf(l.id), name: str(l.name, '', 60) || `Layer ${i + 1}`,
    opacity: Math.round(num(l.opacity, D.opacity, 0, 1) * 1000) / 1000,
    blend: pick(l.blend, OUTPUT_BLENDS, D.blend),
    bypass: bool(l.bypass, D.bypass),
    transitionMs: int(l.transitionMs, D.transitionMs, 0, MAX_TRANSITION_MS),
    end: pick(l.end, LAYER_ENDS, D.end),
    trigger: pick(l.trigger, LAYER_TRIGGERS, D.trigger),
    ignoreColumn: bool(l.ignoreColumn, D.ignoreColumn),
    audio: { volume: Math.round(num(l.audio?.volume, 1, 0, 1) * 1000) / 1000, mute: bool(l.audio?.mute, false), route: CLIP_ROUTES.includes(l.audio?.route) ? l.audio.route : null },
  };
}

function normDeck(d, i, layerIds, clipIds) {
  d = d && typeof d === 'object' ? d : {};
  const cells = {};
  let maxCol = -1;
  for (const [key, clipId] of Object.entries(d.cells && typeof d.cells === 'object' && !Array.isArray(d.cells) ? d.cells : {}).slice(0, MAX_LAYERS * MAX_COLUMNS * 2)) {
    const m = /^([A-Za-z0-9_-]{1,40}):(\d{1,3})$/.exec(key);
    if (!m || !layerIds.has(m[1]) || !clipIds.has(clipId)) continue; // a cell must point at a layer and a clip that exist
    const col = Number(m[2]);
    if (col >= MAX_COLUMNS) continue;
    cells[`${m[1]}:${col}`] = clipId;
    maxCol = Math.max(maxCol, col);
  }
  return {
    id: idOf(d.id), name: str(d.name, '', 60) || (i ? `Deck ${i + 1}` : 'Main'),
    columns: Math.max(int(d.columns, DEFAULT_COLUMNS, 1, MAX_COLUMNS), maxCol + 1), // the grid grows with what is in it
    cells,
  };
}

/** { key: value } of a preset's experience or sound piece: flat, scalar values only (the manifest says what they mean). */
function normParams(src) {
  return Object.fromEntries(Object.entries(src && typeof src === 'object' && !Array.isArray(src) ? src : {}).slice(0, 64)
    .filter(([k, v]) => /^[A-Za-z0-9_.-]{1,40}$/.test(k) && (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))))
    .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
}

function normPreset(p, i, clipIds) {
  p = p && typeof p === 'object' ? p : {};
  const media = {};
  for (const [slot, v] of Object.entries(p.media && typeof p.media === 'object' && !Array.isArray(p.media) ? p.media : {}).slice(0, 32)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(slot)) continue;
    if (Array.isArray(v)) media[slot] = v.slice(0, 64).filter((c) => clipIds.has(c));
    else if (clipIds.has(v)) media[slot] = v;
  }
  const s = p.sound && typeof p.sound === 'object' ? p.sound : null;
  return {
    id: idOf(p.id), name: str(p.name, '', 80) || `Preset ${i + 1}`,
    experienceId: idOf(p.experienceId),
    params: normParams(p.params),
    sound: s && idOf(s.id) ? { id: s.id, params: normParams(s.params) } : null,
    media,
    onLoad: pick(p.onLoad, PRESET_ON_LOAD, 'keep'),
  };
}

/**
 * The single gate of a show.
 * @param {object} input @param {{canvas?:{width:number, height:number}}} [opts] canvas: the room's, for a show without one
 */
export function normalizeShow(input, opts = {}) {
  const s = input && typeof input === 'object' ? structuredClone(input) : {};
  const name = str(s.name, '', 120).trim() || 'New show';
  const cv = s.canvas && typeof s.canvas === 'object' ? s.canvas : opts.canvas || {};
  const canvas = { width: int(cv.width, 1920, 16, 32768), height: int(cv.height, 1080, 16, 32768) };

  // media: one entry per library file (the same file twice is the same medium: its clips move to the first one)
  const media = [], byFile = new Map(), alias = new Map();
  for (const raw of arr(s.media, 4096)) {
    const m = normMedia(raw);
    if (!m) continue;
    const first = byFile.get(m.file);
    if (first) { if (raw.id) alias.set(raw.id, first); continue; }
    byFile.set(m.file, m); media.push(m);
  }
  uniqueIds(media, 'm');
  const mediaById = new Map(media.map((m) => [m.id, m]));
  for (const [from, m] of alias) if (!mediaById.has(from)) mediaById.set(from, m);

  const clips = uniqueIds(arr(s.clips, 8192).map((c) => normClip(c, mediaById)).filter(Boolean), 'c');
  const clipIds = new Set(clips.map((c) => c.id));

  const layers = uniqueIds((arr(s.layers, MAX_LAYERS).length ? arr(s.layers, MAX_LAYERS) : Array(DEFAULT_LAYERS).fill(null)).map(normLayer), 'L');
  const layerIds = new Set(layers.map((l) => l.id));

  const decks = uniqueIds((arr(s.decks, 32).length ? arr(s.decks, 32) : [null]).map((d, i) => normDeck(d, i, layerIds, clipIds)), 'D');
  const presets = uniqueIds(arr(s.presets, 128).map((p, i) => normPreset(p, i, clipIds)), 'p');

  const st = s.start && typeof s.start === 'object' ? s.start : {};
  const deck = decks.find((d) => d.id === st.deckId) || decks[0];
  return {
    schema: SHOW_SCHEMA,
    id: idOf(s.id) || slug(name),
    name,
    canvas,
    media, clips, layers, decks, presets,
    start: {
      presetId: presets.some((p) => p.id === st.presetId) ? st.presetId : null,
      deckId: deck.id,
      column: st.column === null || st.column === undefined ? null : int(st.column, 0, 0, deck.columns - 1),
    },
  };
}

/** An empty show: three layers and one deck of eight columns. */
export function blankShow(name = 'New show', { canvas, id } = {}) {
  return normalizeShow({ id, name, canvas }, { canvas });
}

/** The first id `prefix` + n that `list` does not use. */
export function nextId(list, prefix) {
  const used = new Set(list.map((x) => x.id));
  let k = 1; while (used.has(`${prefix}${k}`)) k++;
  return `${prefix}${k}`;
}

/**
 * A new clip of `media`, to be put in `layerId`. MEDIA-SERVER.md §2.2: a clip takes its layer's settings WHEN IT IS
 * CREATED (the Resolume bug: "play once and hold" set on a layer did not reach the clips imported into it afterwards).
 * Here every setting of a new clip is 'layer' / null — the layer's, now and after any later change of the layer
 * (Resolume's "Layer Determined") — with one exception: a clip with audio on a LOOPING layer ends after one pass
 * ('clear'), because a reel must not repeat on its own; every other layer ending is inherited as it is.
 */
export function newClip(show, media, layerId, o = {}) {
  const layer = show.layers.find((l) => l.id === layerId) || null;
  const audible = !!media.audio?.supported;
  return {
    id: o.id || nextId(show.clips, 'c'), mediaId: media.id, name: o.name || clipName(media.file), color: null,
    end: audible && (!layer || layer.end === 'loop') ? 'clear' : 'layer',
    loops: 1, in: 0, out: null, trigger: 'layer', transitionMs: null,
    place: { target: 'canvas', wallId: null, fit: 'stretch' },
    audio: { gainDb: 0, route: null },
  };
}

/** What a clip does when it plays on `layer`: its own settings where it has them, the layer's where it says 'layer'. */
export function clipSettings(clip, layer) {
  const L = layer || LAYER_DEFAULTS;
  return {
    end: clip.end === 'layer' ? L.end : clip.end,
    trigger: clip.trigger === 'layer' ? L.trigger : clip.trigger,
    transitionMs: clip.transitionMs ?? L.transitionMs,
    loops: clip.loops,
    route: clip.audio?.route ?? layer?.audio?.route ?? null, // null = the room's (profile.audio.media.route)
  };
}

/**
 * Removes media (and the clips made from them, their cells and preset slots) from a show. Returns the new show; the
 * files themselves are not touched.
 */
export function withoutMedia(show, mediaIds) {
  const gone = new Set(mediaIds);
  return normalizeShow({ ...show, media: show.media.filter((m) => !gone.has(m.id)) });
}

/** A short description for lists: { id, name, media, clips }. */
export const showSummary = (s) => ({ id: s.id, name: s.name, media: s.media?.length || 0, clips: s.clips?.length || 0 });
