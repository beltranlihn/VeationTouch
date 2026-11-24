const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
const r = {}, N = Number(new URLSearchParams(location.search).get('n') ?? 1), F = part('festa3d');
const t0 = performance.now(); while (S.festaStage !== 'echo' && performance.now() - t0 < 6000) await wait(30);
const bc = new BroadcastChannel('ressonancia'); const spam = setInterval(() => bc.postMessage({ type: 'ctl', pace: 1 }), 30);
await wait(200);
const W = o.room.walls, cum = []; let a = 0; for (const w of W) { cum.push(a); a += w.width; }
r.handS = +(cum[1] + W[1].width / 2 + 2.2).toFixed(2); r.centreS = +(cum[1] + W[1].width / 2).toFixed(2);
const tap = async (k, w, dx) => { put(k, w, dx, 1.3); await wait(150); lift(k); };
if (N === 1) { await tap('a', 1, 2.2); }
else { await tap('a', 1, 2.2); await wait(120); await tap('b', 0, -2.0); await wait(120); await tap('c', 2, 1.0); await wait(120); await tap('d', 3, 0); await wait(120); await tap('e', 1, -1.5); await wait(120); await tap('f', 2, -2.5); }
await wait(700);
r.fronts = F.fronts; r.score = (S.fronts || []).map((f) => [f.id, f.from, f.to, f.gen]); r.stage = S.festaStage; r.solo = S.solo;
setTimeout(() => clearInterval(spam), 300);
return r;
