const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const o = window.__obra, st = window.__labRoom.stage, R = st.ROOM, S = o.score.state;
const put = (k, wi, dx, y) => { const w = R.walls[wi]; const p = R.toStrip(w.id, w.width / 2 + dx, y); st.put(k, p.s, p.t); };
const lift = (k) => st.lift(k);
const part = (n) => o.parts[n]?.part;
const glide = async (k, wi, dx, y0, y1, ms, steps = 20) => { for (let i = 0; i <= steps; i++) { put(k, wi, dx, y0 + (y1 - y0) * i / steps); await wait(ms / steps); } };
const out = { block: S.block, following: o.following() };
const EV = []; { const gu = o.guide.update; o.guide.update = (dt, a) => { for (const e of a.events || []) if (!/^(pulse)$/.test(e)) EV.push(e); return gu.call(o.guide, dt, a); }; }
const r = {}, N = Number(new URLSearchParams(location.search).get('n') ?? 1), Bz = window.__brasa;
const t0 = performance.now(); while (S.brasaStage !== 'call' && performance.now() - t0 < 6000) await wait(30);
const bc = new BroadcastChannel('ressonancia'); const spam = setInterval(() => bc.postMessage({ type: 'ctl', pace: 1 }), 30);
const tap = async (k, w, dx) => { put(k, w, dx, 1.2); await wait(140); lift(k); };
// a miss: well before the call's window
await tap('m', 1, -1.5); r.miss = Bz.white();
// wait to the TOK, then land
const t1 = performance.now(); while (performance.now() - t1 < 4500) { const C = S.call; if (C && C.n > 0 && (S.clock - C.at) > -0.15 && (S.clock - C.at) < 0.3) break; await wait(15); }
r.ct = +(S.clock - S.call.at).toFixed(2);
const ws = N === 1 ? [[1, 0.8]] : [[0, 0], [1, 0.5], [2, -0.5], [3, 0]];
await Promise.all(ws.map(([w, dx], i) => tap('h' + i, w, dx)));
r.hit = Bz.white(); r.events = EV.filter((e) => /call|wave/.test(e)); r.waveBig = S.waveBig;
await wait(150);
setTimeout(() => clearInterval(spam), 300);
return r;
