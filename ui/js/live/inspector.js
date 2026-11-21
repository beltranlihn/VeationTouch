// Live › the inspector (the right-hand panel): what is selected, with its settings (MEDIA-SERVER.md §4b.3, §4b.4).
//   a clip      end, loops, in / out, transition, launch style, fit and where, audio route and gain — each with
//               "Layer default" (a clip follows its layer until it is given its own value: §2.2, Resolume's lesson)
//   a layer     its live mix (opacity, volume, blend, bypass, mute) and the defaults its clips inherit
//   a card      the experience's parameters (live when it is the live card), its sound piece and that one's
//               parameters, the clip slots its manifest declares (drop a clip or a library file on one, or pick it from
//               its menu), what it does to the grid
//   an experience without a card, and None: its parameters, and the room's sound pieces as they always were
//   a library file, the experience's own row, an empty cell
// With nothing selected it shows the live card. Show mode: what is an edit of the show is locked (the engine refuses
// it too); what runs the show — launching, the mix, the parameters — is not.

import { store, cmd } from '../conn.js';
import { h, sec, field, selectField, toggle, fader, badge, confirmBox, toast } from '../dom.js';
import * as V from '../views.js';
import { locate, bytes, duration } from './library.js';
import { newClip } from './dnd.js';
import { mixOf } from './layers.js';

const LAYER_ENDS = ['loop', 'hold', 'clear', 'bounce', 'next', 'prev', 'random', 'first'];
const AUTOPILOT = new Set(['next', 'prev', 'random', 'first']);
const END_LABEL = { loop: 'Loop', hold: 'Play once, hold the last frame', clear: 'Play once, then eject', bounce: 'Bounce', next: 'Then the next clip', prev: 'Then the previous clip', random: 'Then a random clip', first: 'Then the first clip' };
const TRIGGER_LABEL = { restart: 'Normal (again = restart)', toggle: 'Toggle (again = eject)' };
const CLIP_ROUTES = ['spread', 'mono', 'walls', 'direct'];
const ROUTE_LABEL = { spread: 'All speakers', mono: 'Mono, all speakers', walls: 'One channel per wall', direct: 'Direct channels' };
const BLENDS = [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']];
const HAP_NAME = { Hap1: 'HAP', Hap5: 'HAP Alpha', HapY: 'HAP Q', HapA: 'HAP Alpha-only' };
const seconds = (ms) => `${Math.round(ms / 100) / 10} s`;

/** Disables what edits the show inside `box` while the room is locked (Show mode), with a quiet line saying so. */
function lockIt(L, box, note = true) {
  if (!L.locked()) return box;
  for (const el of box.querySelectorAll('button, select, input')) el.disabled = true;
  for (const el of box.querySelectorAll('.vfield, .vbox')) { el.setAttribute('aria-disabled', 'true'); el.style.pointerEvents = 'none'; }
  if (note) box.append(h('p', { class: 'muted lv-locked' }, 'Show mode: locked. Launching works as always.'));
  return box;
}

const segRow = (label, options, value, onPick) => h('div', { class: 'row' }, h('span', { class: 'k' }, label),
  h('div', { class: 'seg' }, options.map(([v, t]) => h('button', { class: v === value ? 'on' : '', 'aria-pressed': String(v === value), onclick: () => { if (v !== value) onPick(v); } }, t))));

/** One manifest parameter (number → fader, select, bool → switch, wall → the room's walls), as the old Experience panel drew them. */
function paramControl(q, value, send, liveSend) {
  if (q.type === 'number') {
    const dec = (String(q.step).split('.')[1] || '').length;
    return fader(q.label, value, { min: q.min, max: q.max, step: q.step, unit: q.unit || '', decimals: dec }, liveSend, send);
  }
  if (q.type === 'select') return selectField(q.label, value, q.options, send);
  if (q.type === 'bool') return toggle(q.label, !!value, send);
  const walls = store.state.profile.walls;
  return selectField(q.label, value ?? '', [['', 'Any'], ...walls.map((w) => [w.id, w.name || w.id])], (v) => send(v === '' ? null : v));
}

const statusBox = (L, st) => {
  if (st.kind === 'copying') {
    return h('div', { class: 'callout lv-istatus' }, h('b', {}, st.text), h('div', { class: 'muted' }, 'It can be launched once the copy is done; the file is then played from the library, never from the drive.'),
      L.locked() ? null : h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => L.run(cmd('media.importCancel', { id: st.job.id })) }, 'Cancel the copy')));
  }
  if (st.kind === 'missing') return h('div', { class: 'callout attn lv-istatus' }, st.text, h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => locate(L) }, 'Locate…')));
  if (st.kind === 'problem') return h('div', { class: 'callout attn lv-istatus' }, st.text);
  return null;
};

const audioText = (a) => (!a ? 'None' : `${a.channels} ch · ${a.rate / 1000} kHz${a.supported ? '' : ` · ${a.codecName || a.codec || 'not PCM'} — will not play`}`);

/** What the inspector depends on beyond the state messages (it is rebuilt when this changes, not at every media message). */
export function inspectorKey(L) {
  const s = L.sel || L.defaultSel();
  const st = (mediaId) => { const x = L.status(mediaId); return [x.kind, x.kind === 'copying' ? Math.floor(x.pct / 10) : 0]; };
  if (s.kind === 'cell') {
    const clip = L.clipAt(L.deck(), s.layerId, s.column);
    return JSON.stringify(['cell', s.layerId, s.column, clip?.id ?? null, clip ? st(clip.mediaId) : null, L.entry(s.layerId)?.play?.clipId === clip?.id]);
  }
  if (s.kind === 'media') return JSON.stringify(['media', s.mediaId, st(s.mediaId)]);
  if (s.kind === 'layer' || s.kind === 'xlayer') { const e = L.entry(s.layerId || 'xlayer'); return JSON.stringify([s.kind, s.layerId, e?.play?.playId ?? null, e ? mixOf(L, { id: s.layerId || 'xlayer', audio: {} }) : null]); }
  return JSON.stringify([s.kind, s.id, L.liveCard()]);
}

export function inspector(L) { return parts(L).filter(Boolean); } // (a section a selection has not got is null)

function parts(L) {
  let s = L.sel || L.defaultSel();
  const show = L.show();
  // a selection that is gone (another device removed it): the live card
  if ((s.kind === 'preset' && !show?.presets.some((p) => p.id === s.id))
    || (s.kind === 'experience' && !(store.state.experiences || []).some((e) => e.id === s.id))
    || (s.kind === 'media' && !show?.media.some((m) => m.id === s.mediaId))
    || ((s.kind === 'cell' || s.kind === 'layer') && !L.layer(s.layerId))) { L.sel = null; s = L.defaultSel(); }
  switch (s.kind) {
    case 'cell': { const clip = L.clipAt(L.deck(), s.layerId, s.column); return clip ? clipInspector(L, s, clip) : emptyCell(L, s); }
    case 'layer': return layerInspector(L, L.layer(s.layerId));
    case 'xlayer': return xlayerInspector(L);
    case 'preset': return presetInspector(L, show.presets.find((p) => p.id === s.id));
    case 'experience': return experienceInspector(L, (store.state.experiences || []).find((e) => e.id === s.id));
    case 'media': return mediaInspector(L, show.media.find((m) => m.id === s.mediaId));
    default: return noneInspector(L);
  }
}

// ------------------------------------------------------------------ a clip

function clipInspector(L, s, clip) {
  const layer = L.layer(s.layerId), m = L.mediaOf(clip), st = L.status(clip.mediaId), e = L.entry(s.layerId);
  const live = e?.play?.clipId === clip.id;
  const v = m?.video || {}, dur = v.duration || 0, fps = v.fps || 30, canvas = store.state.profile.canvas;
  const edit = (fn, label) => L.editShow((sh) => { const c = sh.clips.find((x) => x.id === clip.id); if (!c) return false; fn(c, sh); return true; }, label);
  const deckId = L.deck().id;
  const launch = () => L.run(cmd('clip.trigger', { deckId, layerId: s.layerId, column: s.column }));
  const effEnd = clip.end === 'layer' ? layer.end : clip.end;
  const step = Math.max(0.001, Math.round((1 / fps) * 1000) / 1000);

  const top = sec([h('span', { class: 'lv-ititle', title: clip.name }, clip.name), h('span', { class: 'grow' }), live ? badge('LIVE', 'live') : null,
    h('button', { class: 'btn small primary', title: 'Launch it on its layer', disabled: st.kind !== 'ready' || undefined, onclick: launch }, live ? 'Restart' : 'Launch')],
  h('div', { class: 'lv-ithumb' }, h('img', { src: L.thumbUrl(m, 480), alt: '', onerror: (ev) => ev.target.classList.add('gone') })),
  statusBox(L, st),
  h('dl', { class: 'kv' },
    h('dt', {}, 'Cell'), h('dd', {}, `${layer.name} · column ${s.column + 1}${L.view().decks.length > 1 ? ` · ${L.deck().name}` : ''}`),
    h('dt', {}, 'File'), h('dd', {}, m?.file || '—'),
    h('dt', {}, 'Video'), h('dd', {}, `${v.width} × ${v.height} · ${Math.round(fps * 100) / 100} fps · ${duration(dur)} · ${HAP_NAME[v.fourcc] || v.fourcc}`),
    h('dt', {}, 'Audio'), h('dd', {}, audioText(m?.audio)),
    h('dt', {}, 'Size'), h('dd', {}, bytes(m?.size))));

  const playback = lockIt(L, sec('Playback',
    field('Name', clip.name, (val) => { const n = String(val).trim(); if (n && n !== clip.name) edit((c) => { c.name = n.slice(0, 80); }, 'rename clip'); }),
    selectField('End', clip.end, [['layer', `Layer default — ${END_LABEL[layer.end]}`], ...LAYER_ENDS.map((k) => [k, END_LABEL[k]])], (val) => edit((c) => { c.end = val; }, 'clip end')),
    AUTOPILOT.has(effEnd) ? fader('Loops', clip.loops, { min: 1, max: 99, step: 1, unit: '×' }, null, (val) => edit((c) => { c.loops = val; }, 'clip loops')) : null,
    fader('In', clip.in, { min: 0, max: dur, step, unit: 's', decimals: 2 }, null, (val) => edit((c) => { c.in = val; if (c.out !== null && c.out <= val) c.out = null; }, 'clip in')),
    fader('Out', clip.out ?? dur, { min: 0, max: dur, step, unit: 's', decimals: 2 }, null, (val) => edit((c) => { c.out = val >= dur - step / 2 ? null : val; }, 'clip out')),
    selectField('Transition', clip.transitionMs === null ? 'layer' : 'own', [['layer', `Layer default — ${seconds(layer.transitionMs)}`], ['own', 'Its own']],
      (val) => edit((c) => { c.transitionMs = val === 'layer' ? null : (c.transitionMs ?? layer.transitionMs); }, 'clip transition')),
    clip.transitionMs !== null ? fader('Time', clip.transitionMs / 1000, { min: 0, max: 10, step: 0.1, unit: 's', decimals: 1 }, null, (val) => edit((c) => { c.transitionMs = Math.round(val * 1000); }, 'clip transition')) : null,
    selectField('Launch', clip.trigger, [['layer', `Layer default — ${layer.trigger === 'toggle' ? 'Toggle' : 'Normal'}`], ['restart', TRIGGER_LABEL.restart], ['toggle', TRIGGER_LABEL.toggle]], (val) => edit((c) => { c.trigger = val; }, 'clip launch'))), false);

  const walls = store.state.profile.walls;
  const where = clip.place.target === 'wall' ? `wall:${clip.place.wallId}` : clip.place.target;
  const placement = lockIt(L, sec('Placement',
    segRow('Fit', [['stretch', 'Stretch'], ['fit', 'Fit'], ['fill', 'Fill']], clip.place.fit, (val) => edit((c) => { c.place.fit = val; }, 'clip fit')),
    selectField('Where', where, [['canvas', 'The whole canvas'], ...walls.map((w) => [`wall:${w.id}`, `${w.id} · ${w.name || w.id}`])],
      (val) => edit((c) => { c.place = val.startsWith('wall:') ? { ...c.place, target: 'wall', wallId: val.slice(5) } : { ...c.place, target: val, wallId: null }; }, 'clip place')),
    v.width && (v.width !== canvas.width || v.height !== canvas.height) ? h('p', { class: 'muted' }, `This clip is ${v.width} × ${v.height}; the room canvas is ${canvas.width} × ${canvas.height}.`) : null), false);

  const audio = m?.audio ? lockIt(L, sec('Audio',
    m.audio.supported ? null : h('div', { class: 'callout attn' }, `The audio of this file is ${m.audio.codecName || m.audio.codec || 'not PCM'} and will not play. Export it with PCM audio.`),
    selectField('Route', clip.audio.route ?? '', [['', `Layer default — ${layer.audio.route ? ROUTE_LABEL[layer.audio.route] : 'the room\'s'}`], ...CLIP_ROUTES.map((r) => [r, ROUTE_LABEL[r]])], (val) => edit((c) => { c.audio.route = val || null; }, 'clip route')),
    fader('Gain', clip.audio.gainDb, { min: -60, max: 12, step: 0.5, unit: 'dB', decimals: 1 }, null, (val) => edit((c) => { c.audio.gainDb = val; }, 'clip gain'))), false)
    : sec('Audio', h('p', { class: 'muted' }, 'This file has no audio.'));

  const actions = lockIt(L, sec(null, h('div', { class: 'actions' },
    h('button', { class: 'btn small', title: 'Take it out of this cell (the file stays in the show)', onclick: () => removeCell(L, s, clip) }, 'Remove from the grid'),
    h('button', { class: 'btn small danger', title: 'Take the file and its clips out of the show (the file stays in the library folder)', onclick: () => removeMedia(L, m) }, 'Remove the file…'))), true);
  return [top, playback, placement, audio, actions];
}

function removeCell(L, s, clip) {
  const deckId = L.deck().id;
  L.editShow((sh) => {
    const d = sh.decks.find((x) => x.id === deckId);
    if (!d) return false;
    delete d.cells[`${s.layerId}:${s.column}`];
    // a clip no cell and no card uses any more goes with it
    const used = sh.decks.some((x) => Object.values(x.cells).includes(clip.id)) || sh.presets.some((p) => Object.values(p.media || {}).flat().includes(clip.id));
    if (!used) sh.clips = sh.clips.filter((c) => c.id !== clip.id);
    return true;
  }, 'remove clip');
}

async function removeMedia(L, m) {
  if (!m) return;
  const name = m.file.split('/').pop();
  const n = L.view().clips.filter((c) => c.mediaId === m.id).length;
  if (!await confirmBox(`Take "${name}" out of the show${n ? `, with its ${n} clip${n === 1 ? '' : 's'}` : ''}? The file stays in the library folder.`, 'Remove', true)) return;
  L.select(null);
  L.run(cmd('media.remove', { mediaId: m.id }), `"${name}" removed from the show`);
}

function emptyCell(L, s) {
  const layer = L.layer(s.layerId), desk = !!window.vtDesktop;
  return [sec(`Empty cell · ${layer.name} · column ${s.column + 1}`,
    h('p', {}, L.locked() ? 'Show mode: unlock the room to add clips.' : desk
      ? 'Drop HAP files here from the explorer: they are copied into the library, and several fill the next columns of this layer.'
      : 'Import works in the desktop app: drop HAP files on this cell on the computer of the room.'),
    L.show()?.media.length && !L.locked() ? h('p', { class: 'muted' }, 'Or drag a file from the library (the drawer under the grid).') : null)];
}

// ------------------------------------------------------------------ a layer

function layerInspector(L, layer) {
  const mix = mixOf(L, layer), e = L.entry(layer.id), real = !!L.show();
  const set = (args) => (real ? L.run(cmd('layer.set', { layerId: layer.id, ...args })) : null);
  const live = (key) => L.throttle((v) => { if (real) cmd('layer.set', { layerId: layer.id, [key]: v }).catch(() => {}); });
  const edit = (fn, label) => L.editShow((sh) => { const l = sh.layers.find((x) => x.id === layer.id); if (!l) return false; fn(l, sh); return true; }, label);
  const clip = e?.play ? L.clip(e.play.clipId) : null;
  const top = sec([h('span', { class: 'lv-ititle' }, layer.name), h('span', { class: 'grow' }), e?.play ? badge('on air', 'live') : null,
    h('button', { class: 'btn small', title: 'Eject (Delete)', disabled: !e?.play || undefined, onclick: () => L.run(cmd('layer.clear', { layerId: layer.id })) }, 'Eject')],
  clip ? h('p', {}, 'Playing ', h('b', {}, clip.name), '.') : h('p', { class: 'muted' }, 'Nothing on this layer.'),
  fader('Opacity', mix.opacity, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live('opacity'), (v) => set({ opacity: v })),
  fader('Volume', mix.volume, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live('volume'), (v) => set({ volume: v })),
  selectField('Blend', mix.blend, BLENDS, (v) => set({ blend: v })),
  toggle('Bypass', mix.bypass, (on) => set({ bypass: on }), 'hidden, still playing'),
  toggle('Mute', mix.mute, (on) => set({ mute: on })));
  const defaults = lockIt(L, sec('Defaults of its clips',
    h('p', { class: 'muted' }, 'A clip set to "Layer default" follows these — now, and after any change here.'),
    selectField('End', layer.end, LAYER_ENDS.map((k) => [k, END_LABEL[k]]), (v) => edit((l) => { l.end = v; }, 'layer end')),
    fader('Transition', layer.transitionMs / 1000, { min: 0, max: 10, step: 0.1, unit: 's', decimals: 1 }, null, (v) => edit((l) => { l.transitionMs = Math.round(v * 1000); }, 'layer transition')),
    selectField('Launch', layer.trigger, [['restart', TRIGGER_LABEL.restart], ['toggle', TRIGGER_LABEL.toggle]], (v) => edit((l) => { l.trigger = v; }, 'layer launch')),
    selectField('Audio route', layer.audio.route ?? '', [['', 'The room\'s (Output › Audio)'], ...CLIP_ROUTES.map((r) => [r, ROUTE_LABEL[r]])], (v) => edit((l) => { l.audio.route = v || null; }, 'layer route')),
    toggle('Skip column launches', layer.ignoreColumn, (on) => edit((l) => { l.ignoreColumn = on; }, 'layer columns'), 'a background that stays'),
    field('Name', layer.name, (v) => { const n = String(v).trim(); if (n) edit((l) => { l.name = n.slice(0, 60); }, 'rename layer'); })), false);
  const remove = real && L.view().layers.length > 1 ? lockIt(L, sec(null, h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: async () => {
    const n = L.view().decks.reduce((a, d) => a + Object.keys(d.cells).filter((k) => k.startsWith(`${layer.id}:`)).length, 0);
    if (!await confirmBox(`Remove "${layer.name}"${n ? ` and its ${n} cell${n === 1 ? '' : 's'}` : ''}? Ctrl+Z brings it back.`, 'Remove', true)) return;
    L.select(null);
    edit((l, sh) => { sh.layers = sh.layers.filter((x) => x.id !== layer.id); for (const d of sh.decks) for (const k of Object.keys(d.cells)) if (k.startsWith(`${layer.id}:`)) delete d.cells[k]; }, 'remove layer');
  } }, 'Remove the layer'))), false) : null;
  return [top, defaults, remove];
}

function xlayerInspector(L) {
  const e = L.media().xlayer, clip = e?.play ? L.clip(e.play.clipId) : null;
  return [sec([h('span', { class: 'lv-ititle' }, 'Experience clips'), h('span', { class: 'grow' }), clip ? badge('on air', 'live') : null,
    h('button', { class: 'btn small', disabled: !clip || undefined, onclick: () => L.run(cmd('layer.clear', { layerId: 'xlayer' })) }, 'Eject')],
  h('p', {}, 'The clips the live experience launches play here, above the grid\'s layers. They stop by themselves when the experience is unloaded.'),
  clip ? h('p', {}, 'Playing ', h('b', {}, clip.name), '.') : h('p', { class: 'muted' }, 'Nothing launched by the experience.'))];
}

// ------------------------------------------------------------------ cards

function startRow(L, on, set, note) {
  const box = h('div', {}, toggle('Start with the app', on, set, note));
  if (L.locked()) for (const b of box.querySelectorAll('button')) b.disabled = true;
  return box;
}

function presetInspector(L, p) {
  const S = store.state, show = L.show(), cat = S.experiences || [], sounds = S.sounds || [];
  const e = p.experienceId ? cat.find((x) => x.id === p.experienceId) : null;
  const snd = p.sound ? sounds.find((x) => x.id === p.sound.id) : null;
  const lc = L.liveCard(), live = lc.kind === 'preset' && lc.id === p.id;
  const edit = (fn, label) => L.editShow((sh) => { const x = sh.presets.find((q) => q.id === p.id); if (!x) return false; fn(x, sh); return true; }, label);
  const param = (key, sound = false) => (value) => L.run(cmd('preset.param', { presetId: p.id, key, value, ...(sound ? { sound: true } : {}) }));
  const liveParam = (key, sound = false) => L.throttle((value) => cmd('preset.param', { presetId: p.id, key, value, ...(sound ? { sound: true } : {}) }).catch(() => {}));
  const top = sec([h('span', { class: 'lv-ititle' }, p.name), h('span', { class: 'grow' }), live ? badge(lc.state === 'live' ? 'LIVE' : lc.state === 'loading' ? 'starting' : 'error', lc.state === 'error' ? 'warn' : 'live') : null,
    h('button', { class: 'btn small primary', disabled: (!!p.experienceId && !e) || undefined, onclick: () => L.run(cmd('preset.load', { presetId: p.id })) }, live ? 'Reload' : 'Load')],
  e ? h('p', { class: 'muted' }, e.description || e.name) : p.experienceId ? h('div', { class: 'callout bad' }, `The experience "${p.experienceId}" is not installed on this computer.`) : h('p', { class: 'muted' }, 'No experience: the clips of the grid alone, on black.'),
  live && lc.state === 'error' ? h('div', { class: 'callout attn' }, lc.error || 'The experience did not start.') : null);
  const params = e?.params.length ? sec(['Parameters', live ? h('small', { class: 'lv-livehint' }, 'live') : null],
    e.params.map((q) => paramControl(q, q.key in p.params ? p.params[q.key] : q.default, param(q.key), liveParam(q.key)))) : null;
  const reloadIfLive = (r) => { if (r && live && p.onLoad === 'keep') L.run(cmd('preset.load', { presetId: p.id })); };
  const sound = sec('Sound',
    lockIt(L, h('div', {}, selectField('Sound piece', p.sound?.id ?? '', [['', 'None'], ...sounds.map((x) => [x.id, x.name])],
      (v) => edit((x) => { x.sound = v ? { id: v, params: {} } : null; }, 'card sound').then(reloadIfLive))), false),
    snd?.params.length ? snd.params.map((q) => paramControl(q, q.key in p.sound.params ? p.sound.params[q.key] : q.default, param(q.key, true), liveParam(q.key, true))) : null,
    p.sound && !snd ? h('p', { class: 'muted' }, `The sound piece "${p.sound.id}" is not installed.`) : null);
  const slots = e?.media?.length ? slotSection(L, p, e) : null;
  const autostartOn = !!S.profile.experience.autostart && (show.start?.presetId ? show.start.presetId === p.id : S.profile.experience.id === p.experienceId);
  const setup = sec('Card',
    lockIt(L, h('div', {},
      segRow('On load', [['keep', 'Keep the clips'], ['clear', 'Eject the clips']], p.onLoad, (v) => edit((x) => { x.onLoad = v; }, 'card on load')),
      field('Name', p.name, (v) => { const n = String(v).trim(); if (n && n !== p.name) edit((x) => { x.name = n.slice(0, 80); }, 'rename card'); })), false),
    p.experienceId ? startRow(L, autostartOn, (on) => {
      L.run(cmd('experience.set', { autostart: on }));
      edit((x, sh) => { sh.start = { ...sh.start, presetId: on ? p.id : null }; }, 'start card');
    }, 'the room opens with this card') : null,
    lockIt(L, h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => {
        let id = null;
        edit((x, sh) => { const used = new Set(sh.presets.map((q) => q.id)); let n = 1; while (used.has(`p${n}`)) n++; id = `p${n}`; sh.presets.push({ ...structuredClone(x), id, name: `${x.name} copy` }); }, 'duplicate card')
          .then((r) => { if (r && id) L.select({ kind: 'preset', id }); });
      } }, 'Duplicate'),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (!await confirmBox(`Remove the card "${p.name}"? ${live ? 'It stays live until another card loads. ' : ''}Ctrl+Z brings it back.`, 'Remove', true)) return;
        L.select(null);
        edit((x, sh) => { sh.presets = sh.presets.filter((q) => q.id !== p.id); if (sh.start?.presetId === p.id) sh.start.presetId = null; }, 'remove card');
      } }, 'Remove the card')), true));
  return [top, params, sound, slots, setup];
}

/**
 * The clip slots a card's experience declares (MEDIA-SERVER.md §4.4: a piece like Reel plays them through vt.media).
 * Each slot takes a clip of the grid or a file of the library — dragged onto it, or picked from its menu (a file gets a
 * clip of its own) — saved in the show (show.update with its revision). A live card's page sees the change at once.
 */
function slotSection(L, p, e) {
  const show = L.show();
  const used = (sh, id) => sh.decks.some((d) => Object.values(d.cells).includes(id)) || sh.presets.some((q) => Object.values(q.media || {}).flat().includes(id));
  const edit = (fn, label) => L.editShow((sh) => { const x = sh.presets.find((q) => q.id === p.id); if (!x) return false; x.media = { ...(x.media || {}) }; return fn(x, sh); }, label);
  /** The clip id for a dragged / picked thing: {kind:'clip', clipId} | {kind:'media', mediaId} (a new clip of that file). */
  const clipFor = (sh, ref) => {
    if (ref.kind === 'clip') return sh.clips.some((c) => c.id === ref.clipId) ? ref.clipId : null;
    const m = sh.media.find((x) => x.id === ref.mediaId);
    if (!m) return null;
    const c = newClip(sh, m, null);
    sh.clips.push(c);
    return c.id;
  };
  const put = (slot, ref) => edit((x, sh) => {
    const list = [].concat(x.media[slot.key] || []);
    if (slot.type === 'clips' && ref.kind === 'clip' && list.includes(ref.clipId)) return false;
    if (slot.type === 'clips' && list.length >= slot.max) { toast(`${slot.label} holds ${slot.max} clip${slot.max === 1 ? '' : 's'} at most.`, 'warn'); return false; }
    const id = clipFor(sh, ref);
    if (!id) return false;
    x.media[slot.key] = slot.type === 'clips' ? [...list, id] : id;
    const old = slot.type === 'clip' ? list[0] : null; // the clip it replaced, if nothing else uses it, goes
    if (old && old !== id && !used(sh, old)) sh.clips = sh.clips.filter((c) => c.id !== old);
    return true;
  }, 'card clip');
  const take = (slot, id) => edit((x, sh) => {
    if (slot.type === 'clips') x.media[slot.key] = [].concat(x.media[slot.key] || []).filter((c) => c !== id); else delete x.media[slot.key];
    if (!used(sh, id)) sh.clips = sh.clips.filter((c) => c.id !== id); // a clip nothing uses any more goes with it, as in the grid
    return true;
  }, 'card clip');
  // the menu: the show's clips, then the library files that have none yet
  const options = show ? [...show.clips.map((c) => [`clip:${c.id}`, c.name]),
    ...show.media.filter((m) => !show.clips.some((c) => c.mediaId === m.id)).map((m) => [`media:${m.id}`, `${m.file.split('/').pop()} (file)`])] : [];
  const pick = (slot) => (v) => { if (v) put(slot, v.startsWith('clip:') ? { kind: 'clip', clipId: v.slice(5) } : { kind: 'media', mediaId: v.slice(6) }); };
  const zone = (slot, children) => {
    const el = h('div', { class: 'lv-slot', 'data-slot': slot.key }, children);
    const ok = () => !L.locked() && (L.drag?.kind === 'clip' || L.drag?.kind === 'media');
    el.addEventListener('dragover', (ev) => { if (!ok()) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; el.classList.add('dragover'); });
    el.addEventListener('dragleave', (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove('dragover'); });
    el.addEventListener('drop', (ev) => {
      el.classList.remove('dragover');
      if (!ok()) return;
      ev.preventDefault();
      const d = L.drag;
      put(slot, d.kind === 'clip' ? { kind: 'clip', clipId: d.clipId } : { kind: 'media', mediaId: d.mediaId });
    });
    return el;
  };
  const chip = (slot, id) => {
    const c = L.clip(id);
    return h('div', { class: 'lv-slotclip', 'data-clip': id }, h('span', { class: 't', title: c?.name || id }, c?.name || id),
      h('button', { class: 'ibtn small', title: 'Take it out of this slot', 'aria-label': `Remove ${c?.name || id}`, onclick: () => take(slot, id) }, '×'));
  };
  const body = e.media.map((slot) => {
    const v = p.media?.[slot.key], ids = (Array.isArray(v) ? v : v ? [v] : []).filter((id) => L.clip(id));
    const full = slot.type === 'clips' && ids.length >= slot.max;
    return zone(slot, [
      h('div', { class: 'lv-slothead' }, h('span', { class: 'k' }, slot.label), slot.type === 'clips' ? h('span', { class: 'muted' }, `${ids.length} / ${slot.max}`) : null),
      ids.length ? ids.map((id) => chip(slot, id)) : h('div', { class: 'lv-drop' }, slot.type === 'clips' ? 'Drop clips here' : 'Drop a clip here'),
      options.length && !full ? selectField(slot.type === 'clips' ? 'Add' : 'Clip', '', [['', slot.type === 'clips' ? 'Choose a clip…' : ids.length ? 'Change…' : 'Choose a clip…'], ...options], pick(slot)) : null,
    ]);
  });
  return lockIt(L, sec('Clips of the experience', body,
    h('p', { class: 'muted' }, show?.clips.length || show?.media.length ? 'Drag a clip from the grid or a file from the library onto a slot.' : 'Add clips to the show first: drop HAP files on the grid or the library.')), true);
}

/** The old Experience panel's Sound section (views.js): the room's sound pieces, Play / Stop, parameters, start with the app. */
function roomSound(L) {
  try { return V.experiencePanel(L.ctx)[1]; } catch { return null; }
}

function experienceInspector(L, e) {
  const S = store.state, X0 = S.profile.experience, lc = L.liveCard();
  const live = lc.kind === 'experience' && lc.id === e.id, selected = X0.id === e.id;
  const values = X0.params?.[e.id] || {};
  const send = (key) => (value) => L.run(cmd('experience.param', { key, value }));
  const liveSend = (key) => L.throttle((value) => cmd('experience.param', { key, value }).catch(() => {}));
  const top = sec([h('span', { class: 'lv-ititle' }, e.name), h('span', { class: 'grow' }), live ? badge(lc.state === 'error' ? 'error' : 'LIVE', lc.state === 'error' ? 'warn' : 'live') : null,
    live ? h('button', { class: 'btn small', onclick: () => L.run(cmd('experience.stop')) }, 'Stop') : h('button', { class: 'btn small primary', onclick: () => L.run(cmd('experience.play', { id: e.id })) }, 'Load')],
  e.description ? h('p', { class: 'muted' }, e.description) : null,
  live && lc.error ? h('div', { class: 'callout attn' }, lc.error) : null);
  const params = e.params.length ? sec(['Parameters', live ? h('small', { class: 'lv-livehint' }, 'live') : null],
    live || selected ? e.params.map((q) => paramControl(q, q.key in values ? values[q.key] : q.default, send(q.key), liveSend(q.key)))
      : h('p', { class: 'muted' }, 'Load it to adjust its parameters.')) : null;
  const more = sec(null,
    startRow(L, !!X0.autostart && selected, (on) => L.run(cmd('experience.set', { autostart: on })), selected ? null : 'load it first'),
    L.show() && !L.locked() ? h('div', { class: 'actions' }, h('button', { class: 'btn small', title: 'A card in the shelf with these parameters (and a sound piece of its own)', onclick: () => {
      let id = null;
      L.editShow((sh) => { const used = new Set(sh.presets.map((q) => q.id)); let n = 1; while (used.has(`p${n}`)) n++; id = `p${n}`; sh.presets.push({ id, name: e.name, experienceId: e.id, params: { ...(selected ? values : {}) }, sound: null, media: {}, onLoad: 'keep' }); }, 'add card')
        .then((r) => { if (r && id) L.select({ kind: 'preset', id }); });
    } }, 'Make it a card')) : null);
  return [top, params, more, roomSound(L)];
}

function noneInspector(L) {
  const lc = L.liveCard(), live = lc.kind === 'none';
  return [sec([h('span', { class: 'lv-ititle' }, 'None'), h('span', { class: 'grow' }), live ? badge('LIVE', 'live') : h('button', { class: 'btn small primary', onclick: () => L.run(cmd('preset.unload')) }, 'Load')],
    h('p', {}, 'No experience: the clips of the grid alone, on black — the room as a pure media server.')), roomSound(L)];
}

// ------------------------------------------------------------------ a library file

function mediaInspector(L, m) {
  const st = L.status(m.id), v = m.video || {}, name = m.file.split('/').pop();
  const cells = [];
  for (const d of L.view().decks) for (const [k, id] of Object.entries(d.cells)) if (L.clip(id)?.mediaId === m.id) cells.push(`${L.layer(k.slice(0, k.lastIndexOf(':')))?.name} · column ${Number(k.slice(k.lastIndexOf(':') + 1)) + 1}${L.view().decks.length > 1 ? ` (${d.name})` : ''}`);
  return [sec([h('span', { class: 'lv-ititle', title: name }, name)],
    h('div', { class: 'lv-ithumb' }, h('img', { src: L.thumbUrl(m, 480), alt: '', onerror: (ev) => ev.target.classList.add('gone') })),
    statusBox(L, st),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Video'), h('dd', {}, `${v.width} × ${v.height} · ${Math.round((v.fps || 0) * 100) / 100} fps · ${duration(v.duration)} · ${HAP_NAME[v.fourcc] || v.fourcc}`),
      h('dt', {}, 'Audio'), h('dd', {}, audioText(m.audio)),
      h('dt', {}, 'Size'), h('dd', {}, bytes(m.size)),
      h('dt', {}, 'In the grid'), h('dd', {}, cells.join(' · ') || 'Not yet — drag it onto a cell'))),
  lockIt(L, sec(null, h('div', { class: 'actions' }, h('button', { class: 'btn small danger', onclick: () => removeMedia(L, m) }, 'Remove the file…'))), true)];
}
