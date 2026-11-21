// The state on the wire to a device that comes through the internet relay (MEDIA-SERVER.md §7.3, F13). The relay carries
// state, commands and thumbnails, and a phone on a guest network gets the whole state when it connects: with a show of
// 60 clips that was ~60 kB, most of it the same default values in every clip. For those clients (server.js › peer.tunnel)
// the engine sends the state COMPACT and conn.js expands it back before anything reads it, so every page sees exactly
// the show the engine has. What is left out:
//   show.clips[]   every field equal to a new clip's default (show.js › newClip: tests/media-restart.test.mjs checks the
//                  table below against it, so they cannot drift apart)
//   show.media[]   mtimeMs (the engine's own bookkeeping of the library check: no page reads it)
//   media.import   finished and cancelled copies (a remote device cannot act on them; it sees the ones that run)
// The message carries `compact: 1`; expandState() puts the defaults back and drops the flag. A message without the flag is
// returned as it is (a LAN device and this computer get the full state).
// PURE and import-free: the engine imports it, the pages load it as /shared/media/wire.js.

/** The default value of each field of a clip (show.js › newClip, but for its id, mediaId, name and end). */
export const CLIP_DEFAULTS = Object.freeze({
  color: null, end: 'layer', loops: 1, in: 0, out: null, trigger: 'layer', transitionMs: null,
  place: Object.freeze({ target: 'canvas', wallId: null, fit: 'stretch' }),
  audio: Object.freeze({ gainDb: 0, route: null }),
});

const same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
const FINISHED = new Set(['done', 'cancelled']);

/** A clip without its default fields. */
export function compactClip(c) {
  const out = {};
  for (const [k, v] of Object.entries(c)) if (!(k in CLIP_DEFAULTS) || !same(v, CLIP_DEFAULTS[k])) out[k] = v;
  return out;
}

/** A compact clip with its defaults back (fresh objects: a page may edit them). */
export function expandClip(c) {
  const out = {};
  for (const [k, v] of Object.entries(CLIP_DEFAULTS)) out[k] = v && typeof v === 'object' ? { ...v } : v;
  return Object.assign(out, c);
}

/** state.media for the wire: the copies that are not over. */
export function compactMedia(m) {
  if (!m || !Array.isArray(m.import) || !m.import.some((j) => FINISHED.has(j.state))) return m;
  return { ...m, import: m.import.filter((j) => !FINISHED.has(j.state)) };
}

/** The state message (or a 'media' message) for a client of the relay. */
export function compactState(st) {
  if (st.type === 'media') return { ...compactMedia(st), compact: 1 };
  const out = { ...st, compact: 1 };
  if (st.show) {
    out.show = {
      ...st.show,
      clips: (st.show.clips || []).map(compactClip),
      media: (st.show.media || []).map(({ mtimeMs, ...m }) => m),
    };
  }
  if (st.media) out.media = compactMedia(st.media);
  return out;
}

/** What conn.js does with every message: a compact one gets its defaults back; any other is returned as it is. */
export function expandState(m) {
  if (!m || m.compact !== 1) return m;
  const { compact, ...out } = m;
  if (out.show) out.show = { ...out.show, clips: (out.show.clips || []).map(expandClip) };
  return out;
}
