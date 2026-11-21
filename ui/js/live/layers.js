// Live › the layer strip: the head of each row of the clip grid (MEDIA-SERVER.md §4b.3, Resolume's layer header).
//   X        eject: the clip goes with the layer's transition (Delete does the same for the selected layer)
//   name     select: the inspector shows the layer's defaults (end, trigger, transition…) that its clips inherit;
//            double-click renames it
//   S · M · B  solo (only this layer is shown: layer.solo, never saved in the show) · mute the layer's audio · bypass the
//            layer (it stays in the grid and keeps playing, unseen). Solo and bypass on one layer leave no picture: dimmed
//   playing  the name of the clip that plays on the layer
//   opacity, blend   live (layer.set, ~15 per second while dragged); the engine keeps them in the show. The layer's
//            volume is in the inspector (its section when the name is selected)
// The read-only "Experience clips" row (xlayer) has the X only: what an experience launches is the experience's.
// Destructive things are in view and in their place (§2b.1, 3): the X is the first thing of the row.

import { cmd } from '../conn.js';
import { h, fader, promptBox } from '../dom.js';

/** The mix of a layer as the transport has it (what plays), the show's when the transport has none yet. */
export function mixOf(L, layer) {
  const e = L.entry(layer.id);
  // (while another layer is soloed the transport says bypass for every other one: the layer's own switch is bypassSet)
  return e ? { opacity: e.opacity, blend: e.blend, bypass: e.bypassSet ?? e.bypass, volume: e.volume, mute: e.mute }
    : { opacity: layer.opacity, blend: layer.blend, bypass: layer.bypass, volume: layer.audio?.volume ?? 1, mute: !!layer.audio?.mute };
}

/** The layer that is soloed (layer.solo), or null. */
export const soloOf = (L) => L.media().solo || null;

/** The key of what a layer head shows: rebuilt when it changes (another device moved a fader), never while dragged. */
export const headKey = (L, layer) => JSON.stringify([layer.id, layer.name, mixOf(L, layer), soloOf(L) === layer.id, !!soloOf(L), !!L.show()]);

const BLENDS = [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']];

/** The head of a grid layer: ✕ name S M B · what plays · opacity · blend. */
export function layerHead(L, layer) {
  const mix = mixOf(L, layer), real = !!L.show(), solo = soloOf(L) === layer.id, other = !!soloOf(L) && !solo;
  const set = (args) => (real ? L.run(cmd('layer.set', { layerId: layer.id, ...args })) : null);
  const live = (key) => L.throttle((v) => { if (real) cmd('layer.set', { layerId: layer.id, [key]: v }).catch(() => {}); });
  const ms = (letter, on, title, onclick, cls = '') => h('button', { class: `ms ${cls}${on ? ' on' : ''}`, title, 'aria-pressed': on ? 'true' : 'false', 'data-ms': letter, disabled: !real || undefined, onclick }, letter);
  const playing = L.entry(layer.id)?.play ? L.clip(L.entry(layer.id).play.clipId) : null;
  const blend = h('select', { class: 'lv-blend', title: 'How this layer mixes with the ones under it', 'aria-label': `Blend of ${layer.name}`, disabled: !real || undefined,
    onchange: (e) => set({ blend: e.target.value }) }, BLENDS.map(([v, t]) => h('option', { value: v, selected: v === mix.blend }, t)));
  const el = h('div', { class: `lv-lh${solo ? ' solo' : ''}${other ? ' dimmed' : ''}`, 'data-layer': layer.id, 'data-key': headKey(L, layer) },
    h('i', { class: 'lv-air' }),
    h('div', { class: 'lv-lh-top' },
      h('button', { class: 'lv-x', title: `Eject ${layer.name} (Delete)`, 'aria-label': `Eject ${layer.name}`, disabled: !real || undefined, onclick: () => L.run(cmd('layer.clear', { layerId: layer.id })) }, '✕'),
      h('button', { class: 'lv-lname', title: `${layer.name}: its settings (double-click to rename)`, onclick: () => L.select({ kind: 'layer', layerId: layer.id }), ondblclick: () => rename(L, layer) }, layer.name),
      ms('S', solo, solo ? 'Solo — click to show every layer again' : 'Solo: show only this layer', () => L.run(cmd('layer.solo', { layerId: solo ? null : layer.id })), 'solo'),
      ms('M', mix.mute, mix.mute ? 'Muted — click to hear this layer' : 'Mute the audio of this layer', () => set({ mute: !mix.mute })),
      ms('B', mix.bypass, mix.bypass ? 'Bypassed — click to show this layer again' : 'Bypass: hide this layer (it keeps playing)', () => set({ bypass: !mix.bypass }))),
    h('div', { class: 'lv-np', title: 'What plays on this layer' }, h('span', { class: 'play' }, '▶'), h('span', { class: 't' }, playing ? playing.name : '—')),
    fader('Opacity', mix.opacity, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live('opacity'), (v) => set({ opacity: v })),
    h('div', { class: 'row lv-blendrow' }, h('label', {}, 'Blend'), blend));
  if (!real) for (const f of el.querySelectorAll('.vfield, .vbox')) { f.setAttribute('aria-disabled', 'true'); f.style.pointerEvents = 'none'; }
  return el;
}

async function rename(L, layer) {
  if (!L.show() || L.locked()) return;
  const name = await promptBox('Name of the layer', layer.name, 'Rename');
  if (name?.trim()) L.editShow((sh) => { const l = sh.layers.find((x) => x.id === layer.id); if (!l) return false; l.name = name.trim().slice(0, 40); return true; }, 'rename layer');
}

/** The head of the experience's own row. */
export function xlayerHead(L) {
  return h('div', { class: 'lv-lh lv-xh', 'data-layer': 'xlayer' },
    h('i', { class: 'lv-air' }),
    h('div', { class: 'lv-lh-top' },
      h('button', { class: 'lv-x', title: 'Stop what the experience launched', 'aria-label': 'Eject the experience clips', disabled: !L.show() || undefined, onclick: () => L.run(cmd('layer.clear', { layerId: 'xlayer' })) }, '✕'),
      h('button', { class: 'lv-lname', title: 'Clips the live experience launches (read-only)', onclick: () => L.select({ kind: 'xlayer' }) }, 'Experience clips')),
    h('small', { class: 'lv-xnote' }, 'Launched by the experience'));
}
