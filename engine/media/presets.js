// Experience presets (MEDIA-SERVER.md §4b.4, D9): a card in Live = what comes out — an experience with its parameters, a
// sound piece with its own, the clips of its slots, and what happens to the clip grid when it loads (onLoad keep/clear).
// There is ONE live experience at a time. A preset loads its experience EXACTLY the way experience.play always did (the
// engine's own path: profile.experience.id, the experience layer and the output on), so the output page needs nothing
// new; its parameters become the live ones (profile.experience.params), which is also why switching between two presets
// of the same experience does not reload the page — only the parameters change, live.
//
// Presets live in the show (show.js › normPreset). This module keeps which one is live and how it is doing, and drives
// the engine through a small host (index.js builds it from what engine.js gives):
//   visual() sounds() walls()                 the catalog and the room's wall ids
//   running() soundPlaying()                  the experience / sound piece that plays now (ids) or null
//   run(id, params?) stop()                   experience.play / experience.stop, as they always were
//   playSound(id, params?) stopSound()        sound.play / sound.stop
//   clearGrid() clearX()                      the transport: the grid layers / the experience's own clips
// Migration: a show without presets gets its first one from what the room played before (profile.experience + audio.sound).

import { checkParam } from '../experiences.js';

/** An experience that has not sent a frame this long after its preset loaded: the preset is in error (the card turns amber). */
export const PRESET_START_MS = 5000;

const r1 = (v) => Math.round(v * 10) / 10;

/** A preset's parameters, checked against the piece's manifest: what does not fit is left out (the manifest default applies). */
export function cleanParams(entry, params, wallIds = []) {
  const out = {};
  for (const p of entry?.params || []) {
    if (!params || !(p.key in params)) continue;
    try { out[p.key] = checkParam(p, params[p.key], wallIds); } catch { /* left to its default */ }
  }
  return out;
}

/** The show's preset of an experience (the first one): what experience.play {id} loads. */
export const presetForExperience = (show, experienceId) => show?.presets?.find((p) => p.experienceId === experienceId) || null;

/** The first preset of a room, from what it played before presets existed; null when it played nothing installed. */
export function presetFromProfile(profile, visual = [], sounds = []) {
  const x = profile?.experience, e = x?.id ? visual.find((v) => v.id === x.id) : null;
  if (!e) return null;
  const s = profile.audio?.sound, snd = s?.id ? sounds.find((v) => v.id === s.id) : null;
  return {
    id: 'p1', name: e.name || e.id, experienceId: e.id, params: { ...(x.params?.[e.id] || {}) },
    sound: snd ? { id: snd.id, params: { ...(s.params?.[snd.id] || {}) } } : null,
    media: {}, onLoad: 'keep',
  };
}

/**
 * A show with no presets gets the room's experience as its first card (and as the start preset when the room started
 * it with the app). → the show to save, or null when there is nothing to do.
 */
export function migratePresets(show, profile, visual, sounds) {
  if (!show || show.presets?.length) return null;
  const p = presetFromProfile(profile, visual, sounds);
  if (!p) return null;
  return { ...show, presets: [p], start: { ...show.start, presetId: profile.experience.autostart ? p.id : show.start?.presetId ?? null } };
}

export class Presets {
  /** @param {{now?: () => number, host: object, log?: object}} o */
  constructor({ now = () => performance.now(), host, log = null }) {
    this.now = now;
    this.host = host;
    this.log = log;
    this.live = null;  // { id (null = an experience played without a preset), experienceId, state, error, at }
    this.sound = null; // the sound piece a preset started (a preset without one stops it; one started by hand is left alone)
    this.rev = 0;
  }

  /** state.media.preset: { id, experienceId, state: 'loading' | 'live' | 'error', error, at } or null. */
  state() { return this.live ? { ...this.live } : null; }

  /** preset.load: the experience (with the preset's parameters), its clips, the grid, the sound piece. */
  load(show, presetId) {
    const p = show?.presets?.find((x) => x.id === presetId);
    if (!p) throw new Error(`unknown preset "${presetId}"`);
    const H = this.host, walls = H.walls();
    const e = p.experienceId ? H.visual().find((x) => x.id === p.experienceId) : null;
    if (p.experienceId && !e) throw new Error(`"${p.name}": the experience "${p.experienceId}" is not installed`);
    const snd = p.sound ? H.sounds().find((x) => x.id === p.sound.id) || null : null;
    if (p.sound && !snd) this.log?.warn(`preset "${p.name}": the sound piece "${p.sound.id}" is not installed`);
    const was = H.running(), wasLive = this.live;
    // 1. the experience, the way experience.play does it; a preset without one leaves the clips on black
    if (e) H.run(e.id, cleanParams(e, p.params, walls)); else if (was) H.stop();
    // 2. what the outgoing experience launched stops with its transition; the same experience keeps its own
    if (!e || e.id !== was) H.clearX();
    // 3. the clip grid
    if (p.onLoad === 'clear') H.clearGrid();
    // 4. the sound piece (the audio page crossfades it in 1 s)
    if (snd) { H.playSound(snd.id, cleanParams(snd, p.sound.params, walls)); this.sound = snd.id; }
    else if (this.sound) { if (H.soundPlaying() === this.sound) H.stopSound(); this.sound = null; }
    // the same experience, already sending frames: the page is not reloaded, so it is live at once
    const same = !!e && was === e.id && wasLive?.experienceId === e.id && wasLive.state === 'live';
    this._set({ id: p.id, experienceId: e?.id ?? null, state: !e || same ? 'live' : 'loading', error: null, at: r1(this.now()) });
    return { presetId: p.id, state: this.live.state };
  }

  /** experience.play {id} when the show has no preset of it: the experience exactly as before, and its state here. */
  adhoc(experienceId) {
    const H = this.host, was = H.running(), wasLive = this.live;
    H.run(experienceId); // the parameters stay what they are
    if (was !== experienceId) H.clearX();
    const same = was === experienceId && wasLive?.experienceId === experienceId && wasLive.state === 'live';
    this._set({ id: null, experienceId, state: same ? 'live' : 'loading', error: null, at: r1(this.now()) });
    return { presetId: null, state: this.live.state };
  }

  /** preset.unload: the "None" card — no experience, its clips stop, the preset's sound piece stops; the grid plays on. */
  unload() {
    const H = this.host;
    if (H.running()) H.stop();
    H.clearX();
    if (this.sound && H.soundPlaying() === this.sound) H.stopSound();
    this.sound = null;
    this._set(null);
    return {};
  }

  /** experience.stop (the old API) stopped the experience: nothing is live; its clips stop. The sound is left as it was. */
  stopped() { this.host.clearX(); this._set(null); }

  /** The experience page reports every 2 s (experience.report): its first frames make the preset live, an error shows. */
  report(fps, error) {
    const L = this.live;
    if (!L?.experienceId) return;
    const state = error ? 'error' : fps > 0 ? 'live' : L.state;
    if (state !== L.state || (error || null) !== L.error) this._set({ ...L, state, error: error || (state === 'error' ? L.error : null) });
  }

  /** Another show, or an edit: a live preset that is no longer in it stays live as an experience without a card. */
  showChanged(show) {
    if (this.live?.id && !show?.presets?.some((p) => p.id === this.live.id)) this._set({ ...this.live, id: null });
  }

  nextDue() { return this.live?.state === 'loading' ? this.live.at + PRESET_START_MS : null; }

  advance(now = this.now()) {
    const L = this.live;
    if (L?.state === 'loading' && now >= L.at + PRESET_START_MS) this._set({ ...L, state: 'error', error: `The experience did not start within ${PRESET_START_MS / 1000} s.` });
  }

  /**
   * A parameter of a preset (preset.param), checked against the manifest of its experience (or of its sound piece).
   * → { preset, entry, value, live } — the caller writes it into the show (and into the live parameters when live).
   */
  param(show, presetId, key, value, { sound = false } = {}) {
    const p = show?.presets?.find((x) => x.id === presetId);
    if (!p) throw new Error(`unknown preset "${presetId}"`);
    const id = sound ? p.sound?.id : p.experienceId;
    if (!id) throw new Error(`"${p.name}" has no ${sound ? 'sound piece' : 'experience'}`);
    const entry = (sound ? this.host.sounds() : this.host.visual()).find((x) => x.id === id);
    if (!entry) throw new Error(`"${id}" is not installed`);
    const param = entry.params.find((q) => q.key === key);
    if (!param) throw new Error(`"${id}" has no parameter "${key}"`);
    const v = checkParam(param, value, this.host.walls());
    const live = this.live?.id === p.id && (sound ? this.sound === id : this.live.experienceId === id);
    return { preset: p, entry, key: param.key, value: v, live };
  }

  /** The live preset, if it is the one of this experience (kind 'experience') or of this sound piece (kind 'sound'). */
  liveFor(kind, id) {
    if (!this.live?.id) return null;
    if (kind === 'sound') return this.sound === id ? this.live.id : null;
    return this.live.experienceId === id ? this.live.id : null;
  }

  // ------------------------------------------------------------------ restarts

  dump() { return { live: this.live, sound: this.sound }; }

  /** After an engine restart: the live preset comes back, its experience and sound piece running again if they are not. */
  restore(d, shift = 0) {
    if (!d || typeof d !== 'object') return;
    const H = this.host, L = d.live && typeof d.live === 'object' ? d.live : null;
    if (L?.experienceId && H.visual().some((x) => x.id === L.experienceId)) {
      const running = H.running() === L.experienceId;
      if (!running) H.run(L.experienceId);
      this.live = { id: L.id ?? null, experienceId: L.experienceId, state: running ? L.state : 'loading', error: running ? L.error ?? null : null, at: running ? r1((L.at || 0) + shift) : r1(this.now()) };
    } else if (L && !L.experienceId) this.live = { ...L, at: r1((L.at || 0) + shift) };
    if (typeof d.sound === 'string' && H.sounds().some((x) => x.id === d.sound)) {
      if (H.soundPlaying() !== d.sound) H.playSound(d.sound);
      this.sound = d.sound;
    }
    this.rev++;
  }

  _set(live) { this.live = live; this.rev++; }
}
