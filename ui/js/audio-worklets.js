// Room audio — the AudioWorklet processors (loaded with audioWorklet.addModule; the logic is in audio-core.js).
//   vt-limiter      the final stage of the synthesis context (N channels in, N out), reports its peak and gain reduction
//   vt-ring-writer  the end of the synthesis context: writes the channels into each device's ring buffer (outputs silence)
//   vt-ring-reader  one per output device (its own context): plays that device's ring buffer

import { Limiter, RingWriter, RingReader } from './audio-core.js';

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
