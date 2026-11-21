// What the room output's mixer draws, bottom → top: the layers of profile.output.layers (state.output.layersEffective) —
// experience, media, touches, grid — and, above everything, the calibration feedback. Each layer's source is a texture
// the output page keeps up to date (ui/js/output.js); this module turns "which layers, in which order, with which
// opacity and blend" into the list of draws for ui/js/mixer/gl.js. Pure: no DOM, no GL (it runs in Node for the tests).
//
// GROUPS are layers made of layers registered from outside the mixer. The `media` output layer is the group that the
// clip player (phase F6, MEDIA-SERVER.md §4.5) fills — without touching the mixer:
//
//   const media = registry.group('media');
//   const L1 = media.add('L1', { order: 1 });       // a clip layer (bottom → top by `order`, then by when it was added)
//   L1.show(texA);                                  // what it shows: a texture of the mixer's context (mixer.texture(w, h))
//   L1.crossfade(texB, 0.5);                        // a transition: mix(A, B, t) on premultiplied colour; crossfade(null) ends it
//   L1.set({ opacity: 0.8, blend: 'add', place: { x, y, w, h }, src: [u0, v0, u1, v1], visible: true });
//   const off = media.onFrame(({ t, now, dt, mixer }) => { /* upload this frame's textures */ });
//   media.remove('L1');
//
// - A group is PASS-THROUGH (like a Photoshop pass-through group, like Resolume's layers): each clip layer blends straight
//   onto what is below the group, with its own blend (none given = the group's blend from the profile) and its opacity ×
//   the group's opacity. No extra image the size of the room per group.
// - `onFrame` runs once per composed frame, before the group draws, with `t` = the instant of that frame (the
//   experience's requestAnimationFrame time when it drives the output, in this page's clock) — the clip clock must come
//   from it, not from performance.now() at compose time (MEDIA-SERVER-MEDIDAS.md §8.3).
// - A group with a visible layer makes the output compose every frame even without an experience.
// - After a lost WebGL context every texture is gone: watch mixer.generation (or mixer.onRestored) and make them again.

export const LAYER_IDS = ['experience', 'media', 'touches', 'grid'];
const BLENDS = ['normal', 'screen', 'add', 'multiply'];
const clamp01 = (v, d = 1) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export class ClipLayer {
  constructor(group, id, seq) {
    this.group = group; this.id = id; this.seq = seq;
    this.order = 0; this.opacity = 1; this.blend = null; this.visible = true;
    this.place = null; this.src = null; // FBO px {x, y, w, h} (y from the top) / texture coordinates [u0, v0, u1, v1]
    this.tex = null; this.texB = null; this.mix = 0;
  }
  /** What the layer shows (null = nothing). */
  show(tex) { this.tex = tex || null; return this; }
  /** A crossfade towards texB, t in [0, 1] (0 = A only); null ends it. */
  crossfade(texB, t = 0) { this.texB = texB || null; this.mix = texB ? clamp01(t, 0) : 0; return this; }
  set(o = {}) {
    if (Number.isFinite(o.order)) this.order = o.order;
    if ('opacity' in o) this.opacity = clamp01(o.opacity);
    if ('blend' in o) this.blend = BLENDS.includes(o.blend) ? o.blend : null;
    if ('visible' in o) this.visible = o.visible !== false;
    if ('place' in o) this.place = o.place && [o.place.x, o.place.y, o.place.w, o.place.h].every(Number.isFinite) ? { ...o.place } : null;
    if ('src' in o) this.src = Array.isArray(o.src) && o.src.length === 4 ? [...o.src] : null;
    return this;
  }
  get drawable() { return this.visible && !!this.tex && this.opacity > 0; }
}

export class Group {
  constructor(id) { this.id = id; this.layers = new Map(); this.hooks = new Set(); this.seq = 0; }
  /** A clip layer (made on first use; `opts` as in ClipLayer.set). */
  add(id, opts = {}) {
    let L = this.layers.get(id);
    if (!L) { L = new ClipLayer(this, id, this.seq++); this.layers.set(id, L); }
    return L.set(opts);
  }
  get(id) { return this.layers.get(id) || null; }
  remove(id) { this.layers.delete(id); }
  clear() { this.layers.clear(); }
  /** Bottom → top. */
  list() { return [...this.layers.values()].sort((a, b) => a.order - b.order || a.seq - b.seq); }
  get active() { for (const L of this.layers.values()) if (L.drawable) return true; return false; }
  /** fn({ t, now, dt, gl, mixer }) before the group draws, every composed frame. Returns a function that removes it. */
  onFrame(fn) { this.hooks.add(fn); return () => this.hooks.delete(fn); }
  frame(info) { for (const fn of this.hooks) { try { fn(info); } catch (e) { console.error(e); } } }
  /** The draws of this group (pass-through), given the group's own opacity and blend. */
  draws(opacity = 1, blend = 'normal') {
    const out = [];
    for (const L of this.list()) {
      if (!L.drawable) continue;
      const p = L.place;
      out.push({ id: `${this.id}:${L.id}`, tex: L.tex, texB: L.texB, mix: L.mix, opacity: L.opacity * opacity, blend: L.blend || blend, src: L.src, dst: p ? [p.x, p.y, p.w, p.h] : null });
    }
    return out;
  }
}

/** The groups of one output page (one registry per mixer). */
export function createRegistry() {
  const groups = new Map();
  return {
    groups,
    group(id) { let g = groups.get(id); if (!g) { g = new Group(id); groups.set(id, g); } return g; },
    /** Some group has something to show (the output must keep composing). */
    get active() { for (const g of groups.values()) if (g.active) return true; return false; },
  };
}

/**
 * The draws of one composed frame, bottom → top.
 * @param {object[]} layers  the layers to draw ({id, opacity, blend}), bottom → top — already without what is off or parked
 * @param {object} src       the sources: { experience: {tex, ready, opaque?, texB?, mix?}, touches: {tex}, grid: {tex}, feedback: {tex, on} }
 * @param {object} registry  createRegistry()
 * @returns {object[]} draws for mixer.compose: {id, tex, texB?, mix?, opacity, blend, opaque?, src?, dst?}
 */
export function buildDraws(layers, src, registry) {
  const out = [];
  for (const l of layers) {
    const opacity = clamp01(l.opacity), blend = BLENDS.includes(l.blend) ? l.blend : 'normal';
    if (l.id === 'media') { out.push(...registry.group('media').draws(opacity, blend)); continue; }
    const s = src[l.id];
    if (!s?.tex || (l.id === 'experience' && !s.ready)) continue;
    // the experience was its page on black: whatever alpha its canvas has, it is shown opaque — unless its manifest says
    // it is transparent (s.opaque false: its premultiplied canvas lets the clips under it show). texB / mix: the switch
    // from the outgoing experience's frozen frame (tex) to the incoming one (texB)
    out.push({ id: l.id, tex: s.tex, opacity, blend, opaque: l.id === 'experience' && s.opaque !== false, ...(s.texB ? { texB: s.texB, mix: s.mix } : {}) });
  }
  // the calibration feedback (what moves under the hand): above every layer, as it is drawn
  if (src.feedback?.on && src.feedback.tex) out.push({ id: 'feedback', tex: src.feedback.tex, opacity: 1, blend: 'normal' });
  return out;
}
