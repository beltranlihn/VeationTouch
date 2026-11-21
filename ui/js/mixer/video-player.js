// One H.264 clip playing on the room output (docs/research/media-formats.md §2.4): the same player as a HAP clip has — the
// request window, "late but newer", the trajectories, parking, the loop prefetch (ui/js/mixer/hap-player.js) — over a
// decoder with state (video-worker.js, video-pool.js). The only difference is WHERE a request goes: the frames of the
// playback to the 'main' lane of the clip's worker, the first frames of the loop (the prefetch the wrap needs) to its 'wrap' lane.

import { HapPlayer } from './hap-player.js';

let seq = 0;

export class VideoPlayer extends HapPlayer {
  constructor(o) { super(o); this.uid = ++seq; } // (the worker keeps the decoders of a clip apart by this: two plays of one file never share one)

  /** The most urgent frame to ask for: {idx, rank, lane}. */
  next() {
    const c = super.next();
    if (!c) return null;
    c.lane = this.wrapNeed && this.wrapNeed.includes(c.idx) && !this.need.includes(c.idx) ? 'wrap' : 'main';
    return c;
  }
}
