const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
const r = {}, N = Number(new URLSearchParams(location.search).get('n') ?? 1), B = window.__baixada3d;
const t0 = performance.now(); while (S.block !== 'baixada' && performance.now() - t0 < 3000) await wait(30);
await wait(300);
const tw = S.walls.findIndex((v) => v); r.walls = S.walls;
const HH = N === 1 ? [[tw, 0.5]] : [[tw, -0.5], [tw, 0.5], [(tw + 1) % 4, 0], [(tw + 2) % 4, 0.3]];
HH.forEach(([w, dx], i) => put('h' + i, w, dx, 1.2)); await wait(500);
r.waiting = [+B.bandY[tw].toFixed(2), B.bandTaken[tw]];
for (let k = 0; k <= 8; k++) { HH.forEach(([w, dx], i) => put('h' + i, w, dx, 1.2 + 0.45 * k / 8)); await wait(60); }
await wait(300); r.taken = [+B.bandY[tw].toFixed(2), B.bandTaken[tw]];
// lower 0.45 m at 0.3 m/s; sample band + the halo stretch (pool.top - y)
for (let k = 0; k <= 9; k++) { HH.forEach(([w, dx], i) => put('h' + i, w, dx, 1.65 - 0.45 * k / 15)); await wait(100); if (k === 8) r.mid = [+B.bandY[tw].toFixed(2), +S.lowerK?.toFixed(2)]; }
r.low = [+B.bandY[tw].toFixed(2), B.bandTaken[tw], +S.lowerK?.toFixed(2), S.descents]; r.events = EV.filter((e) => /lower|down|crack/.test(e));
return r;
return r;
