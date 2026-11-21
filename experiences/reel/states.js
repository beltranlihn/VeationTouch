// Reel — the state machine (pure: no DOM, no GPU, no clock of its own; tests/reel.test.mjs runs it in Node).
//
//              hit "Play Reel"                          the clip ends (or a hand held still 1.5 s)
//   LANDING ─────────────────────▶ REEL ──────────────────────────────────────────────────▶ LANDING
//      │ hit "See Projects"
//      ▼                  hit a blob                    the clip ends (or a hand held still 1.5 s)
//    MENU ──────────────────────────▶ PROJECT(i) ──────────────────────────────────────────▶ MENU
//      │ hit "Back", or idleBackS without a hand on the walls
//      ▼
//   LANDING
//
// step(state, event, ctx) → { state, actions }. Events (all with t = the page's clock, ms):
//   { type: 'hit', target: { kind: 'play' | 'projects' | 'back' | 'project', index } }
//   { type: 'played', req, playId, clipId }         vt.media.play resolved
//   { type: 'playFailed', req, clipId, error }      vt.media.play rejected
//   { type: 'started' | 'ended' | 'error', playId, clipId, reason?, error? }   vt.media events
//   { type: 'hold' }                                a hand held still (hold-to-exit)
//   { type: 'touch' }                               hands on the walls (keeps the menu from going idle)
//   { type: 'tick' }                                time passes
// ctx = { slots: { reel: clip | null, projects: [clip] }, params: { holdToExit, idleBackS } }
// Actions for the page: { do: 'play', req, clipId } · { do: 'stop' } · { do: 'report', error } · { do: 'preload', clipIds }.
//
// Reliability (MEDIA-SERVER.md §6.1): a slot that is empty or a clip that is missing never starts (its button / blob is
// drawn off and does not respond — usable() below); a play that is refused, errors, or has not started within
// START_TIMEOUT_MS goes back to where it came from and reports why. The room never stays on a screen with no way out.

export const START_TIMEOUT_MS = 3000;
export const PRELOAD_MAX = 8;    // = the engine's preload window (transport.js › PRELOAD_MAX)
const DEAD_MAX = 16;              // play ids this page has let go of, remembered so their late events are ignored

/** A clip that can play: assigned, not missing (copying, gone). */
export const usable = (clip) => !!clip && !clip.missing;

export function initial(t = 0) {
  return { name: 'landing', index: -1, phase: null, from: null, clipId: null, playId: null, req: 0, since: t, lastTouch: t, dead: [] };
}

const playing = (s) => s.name === 'reel' || s.name === 'project';
const projectsOf = (ctx) => (Array.isArray(ctx?.slots?.projects) ? ctx.slots.projects : []);

/** Can "See Projects" open the menu? (at least one project that can play) */
export const hasProjects = (ctx) => projectsOf(ctx).some(usable);

function preloadFor(name, ctx) {
  if (name === 'landing') return usable(ctx?.slots?.reel) ? [ctx.slots.reel.id] : [];
  if (name === 'menu') return projectsOf(ctx).filter(usable).slice(0, PRELOAD_MAX - 1).map((c) => c.id);
  return [];
}

function enter(s, name, t, ctx, extra = {}) {
  const next = { ...s, name, index: -1, phase: null, from: null, clipId: null, playId: null, since: t, lastTouch: t, ...extra };
  const ids = preloadFor(name, ctx);
  return { state: next, actions: ids.length ? [{ do: 'preload', clipIds: ids }] : [] };
}

function start(s, name, index, clip, t) {
  const req = s.req + 1;
  return {
    state: { ...s, name, index, phase: 'starting', from: s.name, clipId: clip.id, playId: null, req, since: t, lastTouch: t },
    actions: [{ do: 'play', req, clipId: clip.id }],
  };
}

/** Back to where the video was launched from; `dead` remembers its play id so that its late events change nothing. */
function back(s, t, ctx, extra = [], playId = null) {
  const ids = [s.playId, playId].filter((id, i, a) => id && a.indexOf(id) === i && !s.dead.includes(id));
  const dead = ids.length ? [...s.dead, ...ids].slice(-DEAD_MAX) : s.dead;
  const r = enter({ ...s, dead }, s.from || 'landing', t, ctx);
  return { state: r.state, actions: [...extra, ...r.actions] };
}

/** Is engine event `e` about the play this state is waiting for / showing? */
function mine(s, e) {
  if (!playing(s) || (e.playId && s.dead.includes(e.playId))) return false;
  if (s.playId) return e.playId === s.playId;
  return e.clipId === s.clipId; // the play id is not known yet (the engine's event came before the command's answer)
}

const what = (s) => (s.name === 'reel' ? 'The reel' : `Project ${s.index + 1}`);

export function step(s, e, ctx = {}) {
  const t = Number.isFinite(e?.t) ? e.t : s.since;
  const params = ctx.params || {};
  const same = { state: s, actions: [] };
  switch (e?.type) {
    case 'hit': {
      const k = e.target?.kind;
      if (s.name === 'landing' && k === 'play') return usable(ctx.slots?.reel) ? start(s, 'reel', -1, ctx.slots.reel, t) : same;
      if (s.name === 'landing' && k === 'projects') return hasProjects(ctx) ? enter(s, 'menu', t, ctx) : same;
      if (s.name === 'menu' && k === 'back') return enter(s, 'landing', t, ctx);
      if (s.name === 'menu' && k === 'project') {
        const clip = projectsOf(ctx)[e.target.index];
        return usable(clip) ? start(s, 'project', e.target.index, clip, t) : same;
      }
      return same;
    }
    case 'touch':
      return s.name === 'menu' ? { state: { ...s, lastTouch: t }, actions: [] } : same;
    case 'tick': {
      if (s.name === 'menu') {
        const idle = Math.max(1, Number(params.idleBackS) || 60) * 1000;
        return t - s.lastTouch >= idle ? enter(s, 'landing', t, ctx) : same;
      }
      if (playing(s) && s.phase === 'starting' && t - s.since >= START_TIMEOUT_MS) {
        return back(s, t, ctx, [{ do: 'stop' }, { do: 'report', error: `${what(s)} clip did not start within ${START_TIMEOUT_MS / 1000} s.` }]);
      }
      return same;
    }
    case 'played': {
      if (playing(s) && e.req === s.req) {
        if (s.dead.includes(e.playId)) return same;
        return { state: { ...s, playId: s.playId || e.playId || null }, actions: [] };
      }
      // the answer to a play this page has already given up on (it timed out, or a hand left the video): it must not
      // play on behind the landing / the menu — unless another video is showing (a launch on the reserved layer replaces)
      if (e.playId && !s.dead.includes(e.playId)) {
        const dead = [...s.dead, e.playId].slice(-DEAD_MAX);
        return { state: { ...s, dead }, actions: playing(s) ? [] : [{ do: 'stop' }] };
      }
      return same;
    }
    case 'playFailed':
      if (playing(s) && e.req === s.req) return back(s, t, ctx, [{ do: 'report', error: `${what(s)} clip could not play: ${e.error || 'refused'}` }]);
      return same;
    case 'started':
      if (mine(s, e) && s.phase === 'starting') return { state: { ...s, phase: 'playing', playId: e.playId || s.playId }, actions: [] };
      return same;
    case 'ended':
      if (!mine(s, e)) return same;
      return back(s, t, ctx, e.reason === 'error' ? [{ do: 'report', error: `${what(s)} clip stopped: ${e.error || 'playback error'}` }] : [], e.playId);
    case 'error':
      if (!mine(s, e)) return same;
      return back(s, t, ctx, [{ do: 'stop' }, { do: 'report', error: `${what(s)} clip failed: ${e.error || e.reason || 'playback error'}` }], e.playId);
    case 'hold':
      if (playing(s) && s.phase === 'playing' && params.holdToExit !== false) return back(s, t, ctx, [{ do: 'stop' }]);
      return same;
    default:
      return same;
  }
}
