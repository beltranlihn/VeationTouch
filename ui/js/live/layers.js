// Live › the layer strip: the head of each row of the clip grid (MEDIA-SERVER.md §4b.3, Resolume's layer header).
//   X        eject: the clip goes with the layer's transition (Delete does the same for the selected layer)
//   name     select: the inspector shows the layer's defaults (end, trigger, transition…) that its clips inherit
//   M · B    mute the layer's audio · bypass the layer (it stays in the grid and keeps playing, unseen)
//   faders   opacity and volume, live (layer.set, ~15 per second while dragged); the engine keeps them in the show
// The read-only "Experience clips" row (xlayer) has the X only: what an experience launches is the experience's.
// Destructive things are in view and in their place (§2b.1, 3): the X is the first thing of the row.

import { cmd } from '../conn.js';
import { h, fader } from '../dom.js';

/** The mix of a layer as the transport has it (what plays), the show's when the transport has none yet. */
export function mixOf(L, layer) {
  const e = L.entry(layer.id);
  return e ? { opacity: e.opacity, blend: e.blend, bypass: e.bypass, volume: e.volume, mute: e.mute }
    : { opacity: layer.opacity, blend: layer.blend, bypass: layer.bypass, volume: layer.audio?.volume ?? 1, mute: !!layer.audio?.mute };
}

/** The key of what a layer head shows: rebuilt when it changes (another device moved a fader), never while dragged. */
export const headKey = (L, layer) => JSON.stringify([layer.id, layer.name, mixOf(L, layer), !!L.show()]);

/** The head of a grid layer. */
export function layerHead(L, layer) {
  const mix = mixOf(L, layer), real = !!L.show();
  const set = (args) => (real ? L.run(cmd('layer.set', { layerId: layer.id, ...args })) : null);
  const live = (key) => L.throttle((v) => { if (real) cmd('layer.set', { layerId: layer.id, [key]: v }).catch(() => {}); });
  const ms = (letter, on, title, onclick) => h('button', { class: `ms${on ? ' on' : ''}`, title, 'aria-pressed': on ? 'true' : 'false', disabled: !real || undefined, onclick }, letter);
  const el = h('div', { class: 'lv-lh', 'data-layer': layer.id, 'data-key': headKey(L, layer) },
    h('i', { class: 'lv-air' }),
    h('div', { class: 'lv-lh-top' },
      h('button', { class: 'lv-x', title: `Eject ${layer.name} (Delete)`, 'aria-label': `Eject ${layer.name}`, disabled: !real || undefined, onclick: () => L.run(cmd('layer.clear', { layerId: layer.id })) }, '✕'),
      h('button', { class: 'lv-lname', title: `${layer.name}: its settings`, onclick: () => L.select({ kind: 'layer', layerId: layer.id }) }, layer.name),
      ms('M', mix.mute, mix.mute ? 'Muted — click to hear this layer' : 'Mute this layer\'s audio', () => set({ mute: !mix.mute })),
      ms('B', mix.bypass, mix.bypass ? 'Bypassed — click to show this layer again' : 'Bypass: hide this layer (it keeps playing)', () => set({ bypass: !mix.bypass }))),
    fader('Opacity', mix.opacity, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live('opacity'), (v) => set({ opacity: v })),
    fader('Volume', mix.volume, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' }, live('volume'), (v) => set({ volume: v })));
  if (!real) for (const f of el.querySelectorAll('.vfield, .vbox')) { f.setAttribute('aria-disabled', 'true'); f.style.pointerEvents = 'none'; }
  return el;
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
