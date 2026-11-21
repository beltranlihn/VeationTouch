// Room audio — the AudioWorklet processors (loaded with audioWorklet.addModule; the logic is in audio-core.js).
//   vt-limiter      the final stage of the synthesis context (N channels in, N out), reports its peak and gain reduction
//   vt-ring-writer  the end of the synthesis context: writes the channels into each device's ring buffer (outputs silence)
//   vt-ring-reader  one per output device (its own context): plays that device's ring buffer
//   vt-media-player one per clip that sounds (synthesis context): plays the clip's PCM ring where the engine's clock says
//                   (audio-core.js › ClipReader; the page fills the ring: ui/js/audio-media.js)

import { Limiter, RingWriter, RingReader, ClipReader } from './audio-core.js';

registerProcessor('vt-limiter', class extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const o = options.processorOptions || {};
    this.lim = new Limiter({ channels: o.channels || 2, ceilingDb: o.ceilingDb, sampleRate });
    this.blocks = 0;
    this.port.onmessage = (e) => { if (Number.isFinite(e.data?.ceilingDb)) this.lim.setCeiling(e.data.ceilingDb); };
  }
  process(inputs, outputs) {
    const out = outputs[0], n = out[0]?.length || 128;
    this.lim.process(inputs[0] || [], out, n);
    if (++this.blocks >= 20) { this.blocks = 0; this.port.postMessage(this.lim.take()); } // ~every 53 ms
    return true;
  }
});

registerProcessor('vt-ring-writer', class extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.rings = (options.processorOptions?.rings || []).map((r) => ({ first: r.first, count: r.count, w: new RingWriter(r.sab) }));
  }
  process(inputs) {
    const inp = inputs[0] || [];
    const n = inp[0]?.length || 128;
    for (const r of this.rings) r.w.write(inp.slice(r.first, r.first + r.count), n);
    return true;
  }
});

registerProcessor('vt-ring-reader', class extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const o = options.processorOptions || {};
    this.reader = new RingReader(o.sab, { target: o.target });
    this.state = 'prime';
    this.blocks = 0;
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const st = this.reader.read(out, out[0]?.length || 128);
    if (st !== this.state) { this.state = st; this.port.postMessage({ state: st, underruns: this.reader.underruns }); }
    return true;
  }
});

registerProcessor('vt-media-player', class extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const o = options.processorOptions || {};
    this.player = new ClipReader(o.sab, { rate: o.rate, sampleRate, startAt: o.startAt, offset: o.offset, off: o.off, fadeIn: o.fadeIn, fadeOut: o.fadeOut });
    this.blocks = 0; this.alive = true;
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if ('off' in m) this.player.setMap(m.off, !!m.seek);
      if ('fadeIn' in m || 'fadeOut' in m) this.player.setFades(m.fadeIn, m.fadeOut);
      if ('startAt' in m) this.player.setPlay(m.startAt, m.offset);
      if (m.stop) this.alive = false;
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    this.player.process(out, out[0]?.length || 128, currentFrame);
    if (++this.blocks >= 94) { this.blocks = 0; this.port.postMessage(this.player.stats()); } // ~every 250 ms
    return this.alive;
  }
});
