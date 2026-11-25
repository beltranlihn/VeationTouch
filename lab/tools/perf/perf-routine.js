window.__runAlbum = async (dir, tag) => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = window.__prog = { dir, done: [], err: null, state: 'loading' };
  try {
    for (let i = 0; i < 150 && !(window.__obra && window.__obra.bg && window.__obra.bg.ready); i++) await w(1000);
    await w(14000);
    const g = [], f = [], acc = {}; let n = 0, calls = 0, tris = 0;
    for (let i = 0; i < 20; i++) {
      await w(500); const p = window.__roomPerf; if (!p) continue;
      g.push(p.gpu); f.push(window.__obra.fps()); n++; calls = p.calls; tris = p.tris;
      for (const [k, v] of Object.entries(p.passes)) acc[k] = (acc[k] || 0) + v;
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const passes = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +(v / n).toFixed(2)]).sort((a, b) => b[1] - a[1]));
    P.done.push({ file: tag, fps: Math.round(avg(f)), gpu: +avg(g).toFixed(2), calls, tris, passes });
    P.state = 'done';
  } catch (e) { P.err = String(e && e.stack || e); P.state = 'error'; }
};
