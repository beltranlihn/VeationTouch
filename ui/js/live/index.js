// Live — the room running. One screen, no sub-tabs; where a room that is set up opens.
//   Stage: the room monitor = the workspace's 'live' mode (2D strip / 3D / Inside, the touches, virtual hands, the
//          experience simulated on the walls). System & Calibration › Status shares that same monitor.
//   Panel: for now the Experience panel (the experience picker with its parameters, and the sound piece), moved here from
//          the old Experiences tab. The preset shelf and the clip grid replace it (media-server plan, F8 and F10).
// Views return the DOM of the right-hand panel (see views.js); app.js routes the view id 'live' here.

import * as V from '../views.js';

/** The panel of Live. */
export function live(ctx) {
  return V.experiencePanel(ctx);
}

/** View id → panel builder, merged into app.js's router. */
export const views = { live };
