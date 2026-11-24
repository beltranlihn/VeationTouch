const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
const r = {};
const N = Number(new URLSearchParams(location.search).get('n') ?? 4);
const HH = [[1, -0.6], [1, 0.6], [2, 0], [3, 0]].slice(0, N);
HH.forEach(([w, dx], i) => put('h' + i, w, dx, 1.2));
const bc = new BroadcastChannel('ressonancia');
const t0 = performance.now(); while (S.phase !== 'aleta' && performance.now() - t0 < 8000) await wait(20);
const spam = setInterval(() => bc.postMessage({ type: 'ctl', pace: 1 }), 30);
r.at = [S.block, S.phase, +(performance.now() - t0).toFixed(0)];
// N=1: the one hand rises 0.42 m and holds; N=4: hand 1 rises 0.42 m and holds, hand 3 goes to 1.75 (2 of 4: no quorum, the window stays)
if (N === 1) await glide('h0', 1, -0.6, 1.2, 1.62, 400, 8); else { await glide('h1', 1, 0.6, 1.2, 1.62, 400, 8); put('h3', 3, 0, 1.75); }
await wait(N === 1 ? 700 : 1500);
r.mid = [S.phase, +(S.tp ?? 0).toFixed(1), S.aletaHands];
r.events = EV.filter((e) => /aleta|crown/.test(e));
setTimeout(() => clearInterval(spam), 400);
return r;
