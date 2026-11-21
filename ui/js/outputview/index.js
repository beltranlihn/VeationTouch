// Output — where the room's image, sound and data go. Three sub-tabs (index.html › #subnav), each one a view id:
//   Screens   (id 'mapping')  the Mapping (output canvas, wall → pixel regions, content underlay) and, under it, the room
//                             output: on/off, live preview, layers, Spout / full screen, display, scale, fps.
//                             The Advanced Output (screens ▸ slices, Input / Output stages) grows here (plan F9).
//   Audio     (id 'audio')    the room's sound: devices, channel map, sub and filters, limiter, Test, master, mute.
//   Protocols (id 'outputs')  OSC, TUIO, Triggers, Webhook, Art-Net, sACN, Texture; WebSocket and the OSC address space.
// The ids are the ones the views always had: ctx.go('mapping') / ctx.go('outputs') still open them.

import * as V from '../views.js';

/** Output › Screens. */
export function screens(ctx) {
  return [...V.mapping(ctx), ...V.roomOutput(ctx)];
}

/** Output › Audio. */
export function audio(ctx) {
  return V.audio(ctx);
}

/** Output › Protocols. */
export function protocols(ctx) {
  return V.outputs(ctx);
}

/** View id → panel builder, merged into app.js's router. */
export const views = { mapping: screens, audio, outputs: protocols };
