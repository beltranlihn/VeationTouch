const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
await wait(800);
const L = () => part('tronc3d').lift, r = { walls: S.walls };
put('a', 1, 1.8, 1.0); await wait(60);
r.land = { currents: L().currents, b1: L().bands[1] };
await wait(900); r.held = L().bands[1];
// lift there: 1.0 -> 1.5 over 1.5 s, held
await glide('a', 1, 1.8, 1.0, 1.5, 1500); r.afterLift = { currents: L().currents, b1: L().bands[1], rise: S.rise, liftK: S.liftK, phrase: S.phrase };
await wait(1200); r.later = { currents: L().currents, b1: L().bands[1], floors: S.floors, fp: +S.floorProgress?.toFixed(2) };
return r;
