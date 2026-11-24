const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
await wait(300);
const L = () => part('tronc3d').lift, r = {};
const H = [[0, -0.4], [0, 0.4], [1, 0], [2, 0.5]];
H.forEach(([w, dx], i) => put('h' + i, w, dx, 1.0)); await wait(60);
r.land = L().bands.map((b) => [b.spot, b.flash]); r.cur = L().currents;
// two phrases of lifting in time with the score's phrase
const t0 = performance.now(); let best = null;
while (performance.now() - t0 < 7500) {
  const ph = S.phrase, k = S.phraseT ?? 0, y = ph === 'gather' ? 1.0 : ph === 'rise' ? 1.0 + 0.55 * Math.min(1, k * 2) : 1.55;
  H.forEach(([w, dx], i) => put('h' + i, w, dx, y));
  const f = L().bands.map((b) => b.flash); if (EV.includes('lift') && !best) best = { flash: f, spot: L().bands.map((b) => b.spot) };
  await wait(50);
}
r.events = EV.filter((e) => !/^hint/.test(e)); r.atLift = best; r.walls = S.walls; r.solo = S.solo; r.floors = S.floors;
return r;
