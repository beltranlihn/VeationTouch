// Live › the clip panel (docs/research/resolume-ux.md §C.6), the inspector of one clip, of several, or of a disk file.
//   One clip     the picture, LIVE and Launch, then the TRANSPORT — a timeline of the file with its In and Out handles
//                (drag them), the playhead while the clip is on air (click the timeline: the clip jumps there) and the
//                readout — and four tabs, each short enough to fit without scrolling: Clip (end, loops, In/Out,
//                transition, launch) · Placement (fit, where) · Audio (route, gain) · File (data, status, Replace file…,
//                Show in browser, Remove).
//   Several      "3 clips": the fields they share (a field that differs says so); a field touched is set on all of them.
//   A disk file  its picture and data, and "Add to the show".
// Every edit is a show edit (L.editShow: one undo step, the engine's revision rule, locked in Show mode).

import { store, cmd } from '../conn.js';
import { h, sec, field, selectField, fader, badge } from '../dom.js';
import { playhead } from '/shared/transport.js';
import { bytes, duration, stamp, locate } from './library.js';
import { importPaths, report } from './dnd.js';
import * as A from './actions.js';
import * as C from './convert.js';
import { badgeOf, notesOf, convertHint } from './media-info.js';

const AUTOPILOT = new Set(['next', 'prev', 'random', 'first']);
const END_SEG = [['loop', 'Loop'], ['hold', 'Hold'], ['clear', 'Eject'], ['bounce', 'Bounce'], ['next', 'Next']];
const END_LABEL = { loop: 'Loop', hold: 'Play once, hold the last frame', clear: 'Play once, then eject', bounce: 'Bounce', next: 'Then the next clip', prev: 'Then the previous clip', random: 'Then a random clip', first: 'Then the first clip' };
const TABS = [['clip', 'Clip'], ['place', 'Placement'], ['audio', 'Audio'], ['file', 'File']];
const HAP_NAME = { Hap1: 'HAP', Hap5: 'HAP Alpha', HapY: 'HAP Q', HapA: 'HAP Alpha-only' };
const ROUTE_LABEL = { spread: 'All speakers', mono: 'Mono, all speakers', walls: 'One channel per wall', direct: 'Direct channels' };
const CLIP_ROUTES = ['spread', 'mono', 'walls', 'direct'];
const TRIGGER_LABEL = { restart: 'Normal (again = restart)', toggle: 'Toggle (again = eject)' };
const seconds = (ms) => `${Math.round(ms / 100) / 10} s`;
const audioText = (a) => (!a ? 'None' : `${a.channels} ch · ${a.rate / 1000} kHz${a.supported ? '' : ` · ${a.codecName || a.codec || 'not PCM'} — will not play`}`);

/** A segmented control (the app's `seg`): [[value, text]], the one that is `value` lit. `mixed`: none lit. */
const seg = (options, value, onPick, cls = '') => h('div', { class: `seg ${cls}`, role: 'group' }, options.map(([v, t]) => h('button', {
  class: v === value ? 'on' : '', 'aria-pressed': String(v === value), 'data-v': v, onclick: () => { if (v !== value) onPick(v); } }, t)));
const row = (label, ...c) => h('div', { class: 'row' }, h('span', { class: 'k' }, label), ...c);

/** Sets what `fn` does on every clip of these cells, in one edit. */
function editCells(L, cells, fn, label) {
  const deckId = L.deck().id;
  return L.editShow((sh) => {
    const deck = sh.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    let any = false;
    for (const c of cells) { const clip = sh.clips.find((x) => x.id === deck.cells[`${c.layerId}:${c.column}`]); if (clip) { fn(clip, sh); any = true; } }
    return any;
  }, label);
}

// ------------------------------------------------------------------ the transport

/**
 * The timeline of a clip's file: the whole file, the part between In and Out lit, the handles to drag, and — while the
 * clip is live — the playhead (L.panelPaint moves it with the engine's clock). Click: the live clip jumps there.
 */
function transport(L, s, clip, m, live, edit) {
  const dur = m?.video?.duration || 0, fps = m?.video?.fps || 30, step = 1 / fps;
  const still = m?.kind === 'image';
  // a still with no Out that does not move on by itself never ends: there is nothing to scrub, so the timeline says "Still"
  const effEnd0 = clip.end === 'layer' ? L.layer(s.layerId)?.end : clip.end;
  if (still && !(clip.out > clip.in) && !AUTOPILOT.has(effEnd0)) {
    L.panelPaint = () => {};
    return h('div', { class: `lv-tl still endless${live ? ' live' : ''}`, 'aria-label': 'Timeline of the clip' },
      h('div', { class: 'lv-tl-still' }, h('b', {}, 'Still'), h('span', {}, 'It stays until another clip takes the layer. Give it an Out point to make it run for a time.')));
  }
  const strip = h('div', { class: 'lv-tl-strip', 'data-dur': String(dur) });
  const dimL = h('i', { class: 'lv-tl-dim' }), dimR = h('i', { class: 'lv-tl-dim r' }), region = h('i', { class: 'lv-tl-region' });
  const hIn = h('i', { class: 'lv-tl-h in', title: 'In: drag', tabindex: '0', role: 'slider', 'aria-label': 'In point' }), hOut = h('i', { class: 'lv-tl-h out', title: 'Out: drag', tabindex: '0', role: 'slider', 'aria-label': 'Out point' });
  const ph = h('i', { class: 'lv-tl-ph' }), guide = h('i', { class: 'lv-tl-guide' }), tip = h('span', { class: 'lv-tl-tip tnum' });
  const readout = h('div', { class: 'lv-tl-read tnum' });
  if (m?.kind === 'audio') strip.style.backgroundImage = `url("${L.thumbUrl(m, 480)}")`; // a sound's timeline is its waveform
  strip.append(dimL, dimR, region, ph, guide, tip, hIn, hOut);
  let tin = clip.in || 0, tout = clip.out ?? dur;
  const pct = (t) => `${(Math.max(0, Math.min(dur, t)) / (dur || 1)) * 100}%`;
  const paintBox = () => {
    dimL.style.width = pct(tin); dimR.style.left = pct(tout); dimR.style.right = '0';
    region.style.left = pct(tin); region.style.right = `${100 - (Math.min(dur, tout) / (dur || 1)) * 100}%`;
    hIn.style.left = pct(tin); hOut.style.left = pct(tout);
    hIn.setAttribute('aria-valuenow', tin.toFixed(2)); hOut.setAttribute('aria-valuenow', tout.toFixed(2));
    readout.replaceChildren(h('span', {}, 'In ', h('b', {}, stamp(tin))), h('span', {}, 'Out ', h('b', {}, stamp(tout))), h('span', { class: 'len' }, `${(tout - tin).toFixed(1)} s`), h('span', { class: 'left' }));
  };
  paintBox();
  const at = (cx) => { const r = strip.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((cx - r.left) / (r.width || 1)) * dur)); };
  const snap = (t) => Math.round(t / step) * step;
  const dragHandle = (hd, which) => hd.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || L.locked() || !dur || still) return;
    e.preventDefault(); e.stopPropagation();
    try { hd.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    hd.classList.add('drag');
    const move = (ev) => {
      const t = snap(at(ev.clientX));
      if (which === 'in') tin = Math.max(0, Math.min(t, tout - step)); else tout = Math.min(dur, Math.max(t, tin + step));
      paintBox();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      hd.classList.remove('drag');
      const a = +tin.toFixed(3), b = tout >= dur - step / 2 ? null : +tout.toFixed(3);
      if (a !== (clip.in || 0) || b !== (clip.out ?? null)) edit((c) => { c.in = a; c.out = b; }, which === 'in' ? 'clip in' : 'clip out');
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  dragHandle(hIn, 'in'); dragHandle(hOut, 'out');
  const nudge = (which) => (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d || L.locked()) return;
    e.preventDefault(); e.stopPropagation();
    const k = step * (e.shiftKey ? 10 : 1);
    if (which === 'in') tin = Math.max(0, Math.min(tin + d * k, tout - step)); else tout = Math.min(dur, Math.max(tout + d * k, tin + step));
    paintBox();
    const a = +tin.toFixed(3), b = tout >= dur - step / 2 ? null : +tout.toFixed(3);
    edit((c) => { c.in = a; c.out = b; }, which === 'in' ? 'clip in' : 'clip out');
  };
  hIn.addEventListener('keydown', nudge('in')); hOut.addEventListener('keydown', nudge('out'));
  strip.addEventListener('pointermove', (e) => { const t = at(e.clientX); guide.style.left = pct(t); tip.style.left = pct(t); tip.textContent = stamp(t); L.tlAt = { mediaId: m?.id, t }; });
  strip.addEventListener('click', (e) => {
    if (e.target.closest('.lv-tl-h') || !live || !dur) return;
    // the live clip jumps there: the same clip launched at that point of its segment
    const t = Math.max(clip.in || 0, Math.min(tout, at(e.clientX)));
    L.run(cmd('clip.trigger', { deckId: L.deck().id, layerId: s.layerId, column: s.column, offset: Math.max(0, t - (clip.in || 0)) }));
  });
  // ticks: every second up to 30 s of file, then every 5 / 10 / 30 / 60 s so there are never more than ~12
  const every = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((n) => dur / n <= 12) || 600;
  const ticks = h('div', { class: 'lv-tl-ticks' });
  for (let t = 0; t <= dur + 1e-6; t += every) ticks.append(h('span', { class: 'tnum', style: { left: pct(t) } }, duration(t)));
  L.panelPaint = (now) => {
    const e = L.entry(s.layerId);
    const on = !!e?.play && e.play.clipId === clip.id;
    ph.style.display = on ? 'block' : 'none';
    const left = readout.querySelector('.left');
    if (!on) { left.textContent = ''; return; }
    const pos = playhead(e.play, now ?? e.play.startAt).time;
    ph.style.left = pct(pos);
    left.textContent = e.play.endsAt ? `−${stamp(Math.max(0, (e.play.endsAt - (now ?? e.play.startAt)) / 1000))}` : stamp(pos);
  };
  L.panelPaint(L.now());
  return h('div', { class: `lv-tl${live ? ' live' : ''}${still ? ' still' : ''}`, 'aria-label': 'Timeline of the clip' }, strip, ticks, readout);
}

// ------------------------------------------------------------------ what the file is

/** The kind and codec of a file as chips, with its size in pixels (the inspector's first look). */
function kindRow(m) {
  if (!m) return null;
  const kb = badgeOf(m), v = m.video || {};
  const size = kb.kind === 'image' ? `${m.image?.width || v.width} × ${m.image?.height || v.height}` : kb.kind === 'audio' ? '' : `${v.width} × ${v.height}`;
  return h('div', { class: 'lv-kindrow', 'data-kind': kb.kind },
    h('span', { class: `lv-chipk k-${kb.kind}` }, kb.label), kb.codec ? h('span', { class: 'lv-chipk' }, kb.codec) : null,
    size ? h('span', { class: 'muted tnum' }, size) : null);
}

/** The facts that depend on the kind: a movie has a frame rate and a length, a still a size, a sound a length. */
function factRows(m) {
  const kb = badgeOf(m), v = m?.video || {};
  const rows = [h('dt', {}, 'Kind'), h('dd', {}, [kb.label[0] + kb.label.slice(1).toLowerCase(), kb.codec].filter(Boolean).join(' · '))];
  if (kb.kind === 'image') {
    const im = m.image || {};
    rows.push(h('dt', {}, 'Picture'), h('dd', {}, `${im.width || v.width} × ${im.height || v.height}${im.reduced ? ` (shown at ${im.reduced.width} × ${im.reduced.height})` : ''}`));
  } else if (kb.kind === 'audio') rows.push(h('dt', {}, 'Length'), h('dd', {}, duration(m.audio?.duration || v.duration)));
  else rows.push(h('dt', {}, 'Video'), h('dd', {}, `${v.width} × ${v.height} · ${Math.round((v.fps || 30) * 100) / 100} fps · ${duration(v.duration)} · ${kb.codec}`));
  return rows;
}

/** What the import said about the file (the engine's own words), with the way out when converting to HAP would help. */
export function notesBox(L, m) {
  const notes = notesOf(m);
  if (!notes.length) return null;
  const c = L.conv?.ffmpeg;
  return h('div', { class: `callout lv-notes${notes.some((n) => n.convert) ? ' attn' : ''}`, 'data-notes': String(notes.length) },
    h('b', {}, notes.length === 1 ? 'Note' : 'Notes'),
    h('ul', {}, notes.map((n) => h('li', {}, n.text))),
    C.canConvert(L, m) ? h('div', { class: 'actions' },
      h('button', { class: 'btn small lv-convbtn', title: convertHint(m) ? 'Converting it to HAP fixes this' : 'Makes a HAP copy that the room plays with no decoder to spare', onclick: () => C.convertDialog(L, m) }, 'Convert to HAP…')) : null,
    c && c.installed === false && C.canConvert(L, m) ? h('div', { class: 'muted' }, 'FFmpeg is not installed on this computer: see System › Converter.') : null);
}

/** "Set cover frame" (the movie's picture in the grid, browser and panel): the playhead if it is live, else the point last pointed at. */
function coverButtons(L, m, clip, live) {
  if (!m || m.kind === 'image' || m.kind === 'audio') return [];
  const fps = m.video?.fps || 30;
  const where = () => {
    const e = L.entry(L.sel?.layerId);
    if (live && e?.play) return playhead(e.play, L.now() ?? e.play.startAt).time;
    return L.tlAt?.mediaId === m.id ? L.tlAt.t : clip.in || 0;
  };
  return [
    h('button', { class: 'btn small lv-cover', title: 'The picture of this file everywhere: the frame under the playhead (live), or where you last pointed on the timeline', disabled: L.locked() || undefined,
      onclick: () => A.setCover(L, m.id, Math.round(where() * fps)) }, 'Set cover frame'),
    m.thumbFrame !== null && m.thumbFrame !== undefined ? h('button', { class: 'btn small', title: 'Back to the default picture (at 10 %)', disabled: L.locked() || undefined, onclick: () => A.setCover(L, m.id, null) }, 'Reset cover') : null,
  ];
}
export { kindRow, factRows, coverButtons };

// ------------------------------------------------------------------ one clip

export function clipPanel(L, s, clip, kit) {
  const { lockIt, statusBox } = kit;
  const layer = L.layer(s.layerId), m = L.mediaOf(clip), st = L.status(clip.mediaId), e = L.entry(s.layerId);
  const live = e?.play?.clipId === clip.id;
  const v = m?.video || {}, dur = v.duration || 0, fps = v.fps || 30, canvas = store.state.profile.canvas;
  const edit = (fn, label) => L.editShow((sh) => { const c = sh.clips.find((x) => x.id === clip.id); if (!c) return false; fn(c, sh); return true; }, label);
  const deckId = L.deck().id;
  const launch = () => L.run(cmd('clip.trigger', { deckId, layerId: s.layerId, column: s.column }));
  const effEnd = clip.end === 'layer' ? layer.end : clip.end;
  const step = Math.max(0.001, Math.round((1 / fps) * 1000) / 1000);
  const tab = TABS.some(([k]) => k === L.itab) ? L.itab : 'clip';

  const top = sec([h('span', { class: 'lv-ititle', title: clip.name }, clip.name), h('span', { class: 'grow' }), live ? badge('LIVE', 'live') : null,
    h('button', { class: 'btn small primary', title: 'Launch it on its layer (Enter)', disabled: st.kind !== 'ready' || undefined, onclick: launch }, live ? 'Restart' : 'Launch')],
  h('div', { class: 'lv-ithumb' }, h('img', { src: L.thumbUrl(m, 480), alt: '', onerror: (ev) => ev.target.classList.add('gone') })),
  kindRow(m),
  statusBox(L, st),
  C.convertBox(L, clip.mediaId),
  lockIt(L, transport(L, s, clip, m, live, edit), true),
  h('div', { class: 'seg lv-tabs', role: 'tablist' }, TABS.map(([k, t]) => h('button', { class: k === tab ? 'on' : '', role: 'tab', 'aria-selected': String(k === tab), 'data-tab': k, onclick: () => { L.itab = k; L.ctx.rerender(); } }, t, k === 'file' && notesOf(m).length ? h('i', { class: `lv-tabdot${notesOf(m).some((n) => n.convert) ? ' act' : ''}`, title: 'The import left a note about this file' }) : null))));

  const clipTab = lockIt(L, sec(null,
    field('Name', clip.name, (val) => { const n = String(val).trim(); if (n && n !== clip.name) edit((c) => { c.name = n.slice(0, 80); }, 'rename clip'); }),
    row('Colour', A.colorRow(clip.color, (c) => edit((cl) => { cl.color = c; }, c ? 'clip colour' : 'clip colour off'))),
    row('End', seg(END_SEG, clip.end === 'layer' ? effEnd : clip.end, (x) => edit((c) => { c.end = x; }, 'clip end'), 'lv-endseg')),
    h('div', { class: 'row lv-follow' }, h('span', { class: 'k' }, ''),
      h('button', { class: `lv-chip${clip.end === 'layer' ? ' on' : ''}`, title: 'Follow the layer: the clip does what the layer says', onclick: () => edit((c) => { c.end = 'layer'; }, 'clip end') }, `Layer default · ${END_LABEL[layer.end]}`),
      !END_SEG.some(([k]) => k === effEnd) ? h('span', { class: 'muted' }, END_LABEL[effEnd]) : null),
    AUTOPILOT.has(effEnd) ? fader('Loops', clip.loops, { min: 1, max: 99, step: 1, unit: '×' }, null, (val) => edit((c) => { c.loops = val; }, 'clip loops')) : null,
    fader('In', clip.in, { min: 0, max: dur, step, unit: 's', decimals: 2 }, null, (val) => edit((c) => { c.in = val; if (c.out !== null && c.out <= val) c.out = null; }, 'clip in')),
    fader('Out', clip.out ?? dur, { min: 0, max: dur, step, unit: 's', decimals: 2 }, null, (val) => edit((c) => { c.out = val >= dur - step / 2 ? null : val; }, 'clip out')),
    selectField('Transition', clip.transitionMs === null ? 'layer' : 'own', [['layer', `Layer default — ${seconds(layer.transitionMs)}`], ['own', 'Its own']],
      (val) => edit((c) => { c.transitionMs = val === 'layer' ? null : (c.transitionMs ?? layer.transitionMs); }, 'clip transition')),
    clip.transitionMs !== null ? fader('Time', clip.transitionMs / 1000, { min: 0, max: 10, step: 0.1, unit: 's', decimals: 1 }, null, (val) => edit((c) => { c.transitionMs = Math.round(val * 1000); }, 'clip transition')) : null,
    selectField('Launch', clip.trigger, [['layer', `Layer default — ${layer.trigger === 'toggle' ? 'Toggle' : 'Normal'}`], ['restart', TRIGGER_LABEL.restart], ['toggle', TRIGGER_LABEL.toggle]], (val) => edit((c) => { c.trigger = val; }, 'clip launch'))), false);

  const walls = store.state.profile.walls;
  const where = clip.place.target === 'wall' ? `wall:${clip.place.wallId}` : clip.place.target;
  const placeTab = lockIt(L, sec(null,
    row('Fit', seg([['stretch', 'Stretch'], ['fit', 'Fit'], ['fill', 'Fill']], clip.place.fit, (val) => edit((c) => { c.place.fit = val; }, 'clip fit'))),
    selectField('Where', where, [['canvas', 'The whole canvas'], ...walls.map((w) => [`wall:${w.id}`, `${w.id} · ${w.name || w.id}`])],
      (val) => edit((c) => { c.place = val.startsWith('wall:') ? { ...c.place, target: 'wall', wallId: val.slice(5) } : { ...c.place, target: val, wallId: null }; }, 'clip place')),
    v.width && (v.width !== canvas.width || v.height !== canvas.height) ? h('p', { class: 'muted' }, `This clip is ${v.width} × ${v.height}; the room canvas is ${canvas.width} × ${canvas.height}.`) : null), false);

  const audioTab = m?.audio ? lockIt(L, sec(null,
    m.audio.supported ? null : h('div', { class: 'callout attn' }, `The audio of this file is ${m.audio.codecName || m.audio.codec || 'not PCM'} and will not play. Export it with PCM audio.`),
    selectField('Route', clip.audio.route ?? '', [['', `Layer default — ${layer.audio.route ? ROUTE_LABEL[layer.audio.route] : 'the room\'s'}`], ...CLIP_ROUTES.map((r) => [r, ROUTE_LABEL[r]])], (val) => edit((c) => { c.audio.route = val || null; }, 'clip route')),
    fader('Gain', clip.audio.gainDb, { min: -60, max: 12, step: 0.5, unit: 'dB', decimals: 1 }, null, (val) => edit((c) => { c.audio.gainDb = val; }, 'clip gain'))), false)
    : sec(null, h('p', { class: 'muted' }, 'This file has no audio.'));

  const cell = { layerId: s.layerId, column: s.column };
  const fileTab = h('div', {},
    sec(null, h('dl', { class: 'kv' },
      h('dt', {}, 'Cell'), h('dd', {}, `${layer.name} · column ${s.column + 1}${L.view().decks.length > 1 ? ` · ${L.deck().name}` : ''}`),
      h('dt', {}, 'File'), h('dd', {}, m?.file || '—'),
      ...factRows(m),
      h('dt', {}, 'Audio'), h('dd', {}, audioText(m?.audio)),
      h('dt', {}, 'Size'), h('dd', {}, bytes(m?.size)))),
    notesBox(L, m),
    st.kind === 'missing' ? sec(null, h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => locate(L) }, 'Locate…'))) : null,
    lockIt(L, sec(null, h('div', { class: 'actions' },
      h('button', { class: 'btn small', title: 'Pick another file in the browser: the clip keeps its settings', onclick: () => A.replaceFile(L, cell) }, 'Replace file…'),
      h('button', { class: 'btn small', onclick: () => L.browser.reveal(clip.mediaId) }, 'Show in browser'),
      ...coverButtons(L, m, clip, live),
      C.canConvert(L, m) && !notesOf(m).length ? h('button', { class: 'btn small lv-convbtn', title: 'Makes a HAP copy of this video that the room plays with no decoder to spare', onclick: () => C.convertDialog(L, m) }, 'Convert to HAP…') : null,
      h('button', { class: 'btn small', title: 'Take it out of this cell (the file stays in the show)', onclick: () => A.removeFromGrid(L, cell) }, 'Remove from the grid'),
      h('button', { class: 'btn small danger', title: 'Take the file and its clips out of the show (the file stays in the library folder)', onclick: () => A.removeFile(L, clip) }, 'Remove the file…'))), true));
  return [top, { clip: clipTab, place: placeTab, audio: audioTab, file: fileTab }[tab]];
}

// ------------------------------------------------------------------ several clips

/** The value all of them share, or the marker that they differ. */
const MIXED = '__mixed';
const common = (list, get) => { const first = get(list[0]); return list.every((x) => JSON.stringify(get(x)) === JSON.stringify(first)) ? first : MIXED; };

export function bulkPanel(L, cells, kit) {
  const { lockIt } = kit;
  const deck = L.deck();
  const clips = cells.map((c) => L.clip(deck.cells[`${c.layerId}:${c.column}`])).filter(Boolean);
  if (!clips.length) return [sec('Selection', h('p', { class: 'muted' }, 'Nothing selected.'))];
  const set = (fn, label) => editCells(L, cells, fn, `${label} (${clips.length})`);
  const withMixed = (opts, cur) => (cur === MIXED ? [[MIXED, '— differs —'], ...opts] : opts);
  const pick = (fn) => (val) => { if (val !== MIXED) fn(val); };
  const layerOf = (c) => L.layer(c.layerId);
  const layerIdOfClip = new Map(cells.map((c) => [deck.cells[`${c.layerId}:${c.column}`], c])); // clip id → its cell (each clip's OWN layer)
  const end = common(clips, (c) => c.end), trig = common(clips, (c) => c.trigger), fit = common(clips, (c) => c.place.fit);
  const where = common(clips, (c) => (c.place.target === 'wall' ? `wall:${c.place.wallId}` : c.place.target));
  const gain = common(clips, (c) => c.audio.gainDb), trans = common(clips, (c) => c.transitionMs === null ? 'layer' : 'own');
  const walls = store.state.profile.walls;
  const top = sec([h('span', { class: 'lv-ititle' }, `${clips.length} clips`), h('span', { class: 'grow' }), h('button', { class: 'btn small', title: 'Back to one clip', onclick: () => L.select(L.sel) }, 'Only one')],
    h('div', { class: 'lv-multi-thumbs' }, clips.slice(0, 8).map((c) => h('img', { src: L.thumbUrl(L.mediaOf(c), 160), alt: '', title: c.name, onerror: (ev) => ev.target.classList.add('gone') }))),
    h('p', { class: 'muted' }, 'What you change here is set on every one of them. Ctrl+C copies them, Ctrl+V pastes, Ctrl+D duplicates.'));
  const body = lockIt(L, sec('Playback',
    selectField('End', end, withMixed([['layer', 'Layer default'], ...Object.entries(END_LABEL)], end), pick((val) => set((c) => { c.end = val; }, 'clips end'))),
    selectField('Launch', trig, withMixed([['layer', 'Layer default'], ['restart', TRIGGER_LABEL.restart], ['toggle', TRIGGER_LABEL.toggle]], trig), pick((val) => set((c) => { c.trigger = val; }, 'clips launch'))),
    selectField('Transition', trans, withMixed([['layer', 'Layer default'], ['own', 'Its own (from the layer\'s)']], trans), pick((val) => set((c) => { c.transitionMs = val === 'layer' ? null : (c.transitionMs ?? layerOf(layerIdOfClip.get(c.id))?.transitionMs ?? 500); }, 'clips transition'))),
    row('Fit', fit === MIXED ? h('span', { class: 'muted' }, '— differs —') : null, seg([['stretch', 'Stretch'], ['fit', 'Fit'], ['fill', 'Fill']], fit === MIXED ? null : fit, (val) => set((c) => { c.place.fit = val; }, 'clips fit'))),
    selectField('Where', where, withMixed([['canvas', 'The whole canvas'], ...walls.map((w) => [`wall:${w.id}`, `${w.id} · ${w.name || w.id}`])], where),
      pick((val) => set((c) => { c.place = val.startsWith('wall:') ? { ...c.place, target: 'wall', wallId: val.slice(5) } : { ...c.place, target: val, wallId: null }; }, 'clips place'))),
    fader('Gain', gain === MIXED ? 0 : gain, { min: -60, max: 12, step: 0.5, unit: 'dB', decimals: 1 }, null, (val) => set((c) => { c.audio.gainDb = val; }, 'clips gain')),
    gain === MIXED ? h('p', { class: 'muted' }, 'The gains differ: moving the fader sets them all.') : null), false);
  const actions = lockIt(L, sec(null, h('div', { class: 'actions' },
    h('button', { class: 'btn small', onclick: () => A.duplicate(L) }, 'Duplicate'),
    h('button', { class: 'btn small', onclick: () => A.copy(L) }, 'Copy'),
    h('button', { class: 'btn small danger', title: 'The files stay in the show', onclick: () => A.removeFromGrid(L) }, 'Remove from the grid'))), true);
  return [top, body, actions];
}

// ------------------------------------------------------------------ a file of the disk browser

export function filePanel(L, s) {
  const local = !!store.state?.local;
  const thumb = `/api/media/diskthumb?s=480&path=${encodeURIComponent(s.path)}`;
  return [sec([h('span', { class: 'lv-ititle', title: s.name }, s.name)],
    local ? h('div', { class: 'lv-ithumb' }, h('img', { src: thumb, alt: '', onerror: (ev) => ev.target.classList.add('gone') })) : null,
    h('dl', { class: 'kv' }, h('dt', {}, 'File'), h('dd', {}, s.path), h('dt', {}, 'Size'), h('dd', {}, bytes(s.size))),
    h('p', { class: 'muted' }, 'Drag it onto a cell, a column, a layer or a deck: it is copied into the library there. Or add it to the show without a cell.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn small primary', disabled: L.locked() || undefined, onclick: async () => {
      const r = await importPaths(L, [s.path]);
      if (r) report(L, r);
    } }, 'Add to the show')))];
}
