const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
const r = {}, N = Number(new URLSearchParams(location.search).get('n') ?? 1), PI = window.__pinya3d;
const t0 = performance.now(); while (S.block !== 'pinya' && performance.now() - t0 < 3000) await wait(30);
if (N === 1) {
  put('a', 1, 2.4, 1.2); await wait(80); r.landPalm = PI.palms.filter((q) => q.on && q.stroke !== null).length;
  while (S.pinyaStage !== 'pack' && performance.now() - t0 < 4000) await wait(30);
  const q = () => PI.palms.find((p) => p.on && p.stroke !== null && p.wall === 1);
  const x0 = q()?.x; let hx = 2.4; const t1 = performance.now();
  while (performance.now() - t1 < 3000) { const p = q(); if (p) { hx = p.x + 0.28; put('a', 1, hx, 1.2); } await wait(60); }   // a hand that lags 0.28 m behind its palm
  r.palmX = [x0, q()?.x, q()?.back]; r.pack = S.pack; r.fill = S.fill;
} else {
  for (let i = 0; i < N; i++) put('h' + i, i % 4, -2.2 + (Math.floor(i / 4)) * 1.3, 1.1 + 0.1 * (i % 3));
  await wait(1500); r.palms = PI.palms.filter((q) => q.on && q.stroke !== null).length; r.n = N;
}
return r;
