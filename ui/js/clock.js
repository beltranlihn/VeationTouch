// The engine's clock in a page (D5 of MEDIA-SERVER.md: the clock is the engine's). Messages from the engine carry its
// time (the live feed's `t`, the transport's instants); a page keeps the offset `page time − engine time` and turns one
// into the other. The estimate is the one the experience runtime has always used for the hands (makeHands › ingest in
// experiences/runtime.js — tests/mixer.test.mjs checks that both give the same offset): a message is never early, only
// late by its trip, so the offset follows the QUICKEST messages at once (−3 ms per message at most, against a stalled
// read) and creeps up slowly (+2 % of the gap, ≤ 0.5 ms per message) when every message is late; a jump of more than
// 5 s is another engine clock (a restart) and is taken as it is.

export const CLOCK_JUMP_MS = 5000;

/** @param {() => number} [now] the page clock (ms), performance.now() by default */
export function makeClock(now = () => performance.now()) {
  let off = null, samples = 0;
  return {
    /** A message stamped `tEng` (engine ms) arrived at `pageNow` (now by default). Returns the offset. */
    sample(tEng, pageNow = now()) {
      if (!Number.isFinite(tEng) || !Number.isFinite(pageNow)) return off;
      samples++;
      const s = pageNow - tEng;
      if (off == null || Math.abs(s - off) > CLOCK_JUMP_MS) off = s;
      else { const d = s - off; off += d < 0 ? Math.max(d, -3) : Math.min(d * 0.02, 0.5); }
      return off;
    },
    /** page ms − engine ms (null until the first message). */
    get offset() { return off; },
    get ready() { return off != null; },
    get samples() { return samples; },
    /** The engine's time now (or at page time `pageT`); null until the first message. */
    engineNow(pageT = now()) { return off == null ? null : pageT - off; },
    /** An engine instant in page time (null until the first message). */
    toPage(tEng) { return off == null || !Number.isFinite(tEng) ? null : tEng + off; },
    reset() { off = null; samples = 0; },
  };
}
