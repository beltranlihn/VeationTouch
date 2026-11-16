// "Texture" output: a black-and-white (greyscale) mask of the touches, rendered in OUTPUT-CANVAS
// pixels through each wall's mapping, sent over Spout, NDI or shown full screen (one of them, chosen per output) so
// TouchDesigner / Unreal / Resolume use it directly as a texture (particles, fluids, masks…). Rendered on the CPU by core/mask.js (the same code draws
// the live preview in the UI) — at the default quarter resolution (960×600 for a 3840×2400 canvas) a frame
// costs a few milliseconds.

import { createRequire } from 'node:module';
import { TouchMask } from '../core/mask.js';
import { NdiSender } from './ndi.js';

let spout = null, spoutError = null, spoutOwner = null;
function loadSpout() {
  if (spout || spoutError) return spout;
  try { spout = createRequire(import.meta.url)('../../native/spout-send/dsp_spout.node'); } catch (e) { spoutError = e.message; }
  return spout;
}

/** The mask at the output's resolution (canvas × scale), expanded to opaque grey RGBA for Spout. */
export class TextureRenderer {
  constructor() { this.m = new TouchMask(); this.rgba = null; }
  get w() { return this.m.w; }
  get h() { return this.m.h; }
  get mask() { return this.m.mask; }

  configure(o, profile) {
    this.o = o;
    const w = Math.max(16, Math.round(profile.canvas.width * o.scale));
    const h = Math.max(16, Math.round(profile.canvas.height * o.scale));
    if (this.m.resize(w, h)) {
      this.rgba = Buffer.alloc(w * h * 4);
      for (let i = 3; i < this.rgba.length; i += 4) this.rgba[i] = 255;
    }
  }

  /** @param {{wall:object, touches:object[]}[]} walls @param {number} dtMs since the previous render */
  render(walls, dtMs) {
    if (!this.m.render(walls, this.o, this.o.scale, dtMs)) return false; // nothing changed: keep the last (black) frame
    const { mask } = this.m, rgba = this.rgba;
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) { const v = mask[i]; rgba[j] = v; rgba[j + 1] = v; rgba[j + 2] = v; }
    return true;
  }
}

/**
 * One Texture output → ONE sink, the one chosen in the output (`sink`): a Spout sender (same machine), an NDI source
 * (the network, through the installed NDI runtime) or a full-screen window (drawn by the window itself from the live
 * touches — the engine sends nothing). Only the chosen sink runs; a disabled output runs none.
 */
export class TextureOutput {
  constructor(log) { this.log = log; this.r = new TextureRenderer(); this.started = false; this.last = 0; this.error = null; this.key = ''; this.n = 0; this.receivers = null; }

  configure(o, profile) {
    this.r.configure(o, profile);
    this.o = o;
    const key = `${o.sink}|${o.senderName}`;
    if (key === this.key && !this.error) return;
    this._stop();
    this.key = key;
    if (o.sink === 'window') return; // the full-screen window renders the mask itself (ui/js/texture.js)
    if (o.sink === 'ndi') {
      this.ndi = new NdiSender();
      this.error = this.ndi.start(o.senderName);
      this.started = !this.error;
      this.receivers = this.started ? 0 : null;
      if (this.started) this.log.info(`NDI source "${o.senderName}" ${this.r.w}×${this.r.h}`);
      else this.ndi = null;
      return;
    }
    if (spoutOwner && spoutOwner !== this) { this.error = 'only one Texture output can send over Spout'; return; }
    const sp = loadSpout();
    if (!sp) { this.error = `Spout not available (${spoutError})`; return; }
    this.started = sp.start(o.senderName);
    spoutOwner = this.started ? this : null;
    this.error = this.started ? null : 'Spout sender could not start (DirectX 11 unavailable?)';
    if (this.started) this.log.info(`Spout sender "${o.senderName}" ${this.r.w}×${this.r.h}`);
  }

  /** @returns {boolean} whether a frame was sent */
  send(walls, nowMs) {
    if (!this.started) return false;
    const dt = this.last ? nowMs - this.last : 16;
    this.last = nowMs;
    this.r.render(walls, dt);
    if (this.ndi) {
      this.ndi.send(this.r.rgba, this.r.w, this.r.h, this.o.rateHz);
      if (this.n++ % 30 === 0) this.receivers = this.ndi.receivers();
      return true;
    }
    return spout.send(this.r.rgba, this.r.w, this.r.h, false);
  }

  _stop() {
    if (this.ndi) { this.ndi.stop(); this.ndi = null; }
    if (spoutOwner === this) { try { spout.stop(); } catch { /* ignore */ } spoutOwner = null; }
    this.started = false; this.error = null; this.receivers = null; this.last = 0;
  }

  close() { this._stop(); this.key = ''; }
}
