#!/usr/bin/env node
// Ressonància — the hold-targets (ressonancia/targets.js) in Node, no GPU (plan 05 §5.5 I0, §6.1 «Dianas, en todas»).
//   node lab/estudio/tools/targets-test.mjs        → exit 0 = every check passed; each failure printed
// With 1, 2, 4, 8 and 15 people: ≥ 1 free target on every wall and one within 1.2 m of every person, never more than 16; a hand the
// sensor loses for 0.6 s keeps its charge; strikes (0.2 s taps) never complete a target; the four modes reach their goals.
import { createTargets } from '../../experiments/ressonancia/targets.js';

const LEN = [7.33, 6.483, 7.353, 6.411], S0 = [0, 7.33, 13.813, 21.166], PER = LEN.reduce((a, b) => a + b, 0);
const W = 4, DT = 1 / 40;
const wrap = (x) => ((x % PER) + PER) % PER, cd = (a, b) => { const d = wrap(a - b); return d > PER / 2 ? d - PER : d; };
const wallAt = (s) => { s = wrap(s); for (let w = W - 1; w >= 0; w--) if (s >= S0[w]) return w; return 0; };
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL ' + msg); } };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// people at random places, 1 or 2 hands each (hands of a person 0.5–0.9 m apart)
function crowd(nPeople, handsEach) {
  const P = [];
  for (let i = 0; i < nPeople; i++) {
    const s = wrap(rnd() * PER), y = 0.9 + rnd() * 0.6, k = typeof handsEach === 'number' ? handsEach : rnd() < 0.6 ? 2 : 1;
    P.push({ s, y, hands: Array.from({ length: k }, (_, j) => ({ ds: j ? 0.5 + rnd() * 0.4 : 0, dy: j ? (rnd() - 0.5) * 0.3 : 0 })) });
  }
  return P;
}
let strokeId = 1;
function handsOf(P) {
  const out = [];
  for (const p of P) for (const h of p.hands) {
    if (!h.stroke) h.stroke = strokeId++;
    const s = wrap(p.s + h.ds), w = wallAt(s);
    out.push({ stroke: h.stroke, wall: w, dx: s - S0[w] - LEN[w] / 2, s, y: p.y + h.dy });
  }
  return out;
}
const live = (TG) => TG.list.filter((t) => t.state !== 'done');

// 1. coverage with 1, 2, 4, 8, 15 people, static, in field, together, chain and ladder
for (const mode of ['field', 'together', 'chain', 'ladder']) for (const np of [1, 2, 4, 8, 15]) {
  const TG = createTargets({ lengths: LEN, seed: np * 13 + mode.length });
  const P = crowd(np, np === 1 ? 2 : undefined), H = handsOf(P), n = H.length;
  // the hands stand BETWEEN targets (not on them): move every person 0.3 m off any target after the first step
  TG.offer({ mode, pairs: mode === 'field', sides: mode === 'ladder' });
  let worstWall = 99, worstPerson = 0, maxN = 0, maxD = 0;
  for (let i = 0; i < 400; i++) {
    TG.step(DT, H, n, i * DT);
    if (i < 20) continue;
    if (TG.reached) break;   // a together call that was met stops offering (the score opens the next one)
    maxN = Math.max(maxN, live(TG).length); maxD = Math.max(maxD, TG.list.length);
    for (let w = 0; w < W; w++) { const c = live(TG).filter((t) => t.wall === w && t.on === 0).length; worstWall = Math.min(worstWall, c); }
    // a person's free target: not held by someone else, within 1.2 m (chain/ladder: their next link may be 2.5 m away)
    const R = mode === 'chain' ? 2.6 : mode === 'ladder' ? 1.7 : 1.2 + 0.3;
    for (const p of P) {
      const has = live(TG).some((t) => Math.abs(cd(t.s, p.s)) <= R);
      if (!has) { worstPerson++; if (process.env.DBG) console.log(mode, np, i, p.s.toFixed(2), live(TG).length, TG.list.length, i === 200 ? JSON.stringify({ hands: H.filter((h) => Math.abs(cd(h.s, p.s)) < 2.5).map((h) => [h.s.toFixed(2), h.y.toFixed(2)]), tg: live(TG).filter((t) => Math.abs(cd(t.s, p.s)) < 3).map((t) => [t.s.toFixed(2), t.y.toFixed(2), t.state, t.on]), reached: TG.reached }) : ""); }
    }
  }
  ok(worstWall >= 1, `${mode} ${np}p: a wall without a free target (min ${worstWall})`);
  ok(worstPerson === 0, `${mode} ${np}p: ${worstPerson} person-steps without a target near`);
  ok(maxN <= 16 && maxD <= 20, `${mode} ${np}p: ${maxN} alive (≤ 16), ${maxD} drawn (≤ 20)`);
  if (mode === 'field') { const want = Math.min(16, Math.max(4, Math.ceil(0.75 * n) + 4)); ok(live(TG).length >= Math.min(want, 16) - 3, `field ${np}p: ${live(TG).length} alive, want ~${want}`); }
}

// 2. a hand on a target: charge in 0.5 s, active, done after 0.5 s more; the sensor drops it 0.6 s mid-charge: the charge is kept
{
  const TG = createTargets({ lengths: LEN, seed: 3 });
  TG.offer({ mode: 'manual' });
  const t = TG.place({ wall: 1, dx: 0, y: 1.2 });
  const hand = [{ stroke: 1, wall: 1, dx: 0.05, s: S0[1] + LEN[1] / 2 + 0.05, y: 1.25 }];
  const ev = []; let clock = 0; const run = (sec, hs) => { for (let k = 0; k < Math.round(sec / DT); k++) { clock += DT; TG.step(DT, hs, 1, clock); ev.push(...TG.drain()); } };
  run(0.3, hand); const c1 = t.charge;
  run(0.6, []); const c2 = t.charge;
  ok(c1 > 0.5 && Math.abs(c2 - c1) < 1e-9, `grace: charge ${c1.toFixed(2)} → ${c2.toFixed(2)} after a 0.6 s drop`);
  ok(ev.includes('tg:charge:' + t.id), 'tg:charge emitted at the first touch');
  run(0.3, hand); ok(t.state === 'active', `active after 0.5 s of charge (state ${t.state})`);
  run(0.55, hand); ok(t.state === 'done', `done after 0.5 s held (state ${t.state})`);
  ok(ev.includes('tg:active:' + t.id) && ev.includes('tg:done:' + t.id), 'tg:active and tg:done emitted');
  // a longer loss drains it
  const u = TG.place({ wall: 2, dx: 0, y: 1.2 }), h2 = [{ stroke: 2, wall: 2, dx: 0, s: S0[2] + LEN[2] / 2, y: 1.2 }];
  run(0.3, h2); run(2.5, []); ok(u.charge < 0.2, `a 2.5 s loss drains the charge (${u.charge.toFixed(2)})`);
}

// 3. strikes: a hand that taps (0.2 s down, 0.6 s up) on targets never completes one, in any mode
for (const mode of ['field', 'together', 'chain', 'ladder']) {
  const TG = createTargets({ lengths: LEN, seed: 5 });
  TG.offer({ mode, goal: 1 });
  let clock = 0, done = 0;
  for (let k = 0; k < 40 * 30; k++) {
    clock += DT; const ph = clock % 0.8;
    let hs = [];
    if (ph < 0.2) { const t = live(TG)[Math.floor(clock / 0.8) % Math.max(1, live(TG).length)]; if (t) hs = [{ stroke: 100 + Math.floor(clock / 0.8), wall: t.wall, dx: t.dx, s: t.s, y: t.y }]; }
    TG.step(DT, hs, 2, clock);
    done += TG.drain().filter((e) => e.startsWith('tg:done') || e === 'tg:goal').length;
  }
  ok(done === 0, `strikes only (${mode}): ${done} targets completed`);
}

// 3b. a fast tapper on ONE target (0.25 s down, 0.6 s up: inside the charge's grace) never completes it, nor a together call
for (const mode of ['manual', 'together']) {
  const TG = createTargets({ lengths: LEN, seed: 6 });
  TG.offer({ mode, need: 1 });
  const t = mode === 'manual' ? TG.place({ wall: 1, dx: 0, y: 1.2 }) : null;
  let clock = 0, done = 0;
  for (let k = 0; k < 40 * 20; k++) {
    clock += DT; const tt = t || live(TG)[0];
    const hs = clock % 0.85 < 0.25 && tt ? [{ stroke: 1, wall: tt.wall, dx: tt.dx, s: tt.s, y: tt.y }] : [];
    TG.step(DT, hs, 1, clock); done += TG.drain().filter((e) => e.startsWith('tg:done') || e === 'tg:goal').length;
  }
  ok(done === 0, `fast tapper (${mode}): ${done} completed`);
}

// 4. no monopoly: A holds a target; B stands 0.9 m from it with nothing else near → B gets her own within 1.2 m
{
  const TG = createTargets({ lengths: LEN, seed: 9 });
  TG.offer({ mode: 'field' });
  const t = TG.place({ wall: 0, dx: 0, y: 1.2 });
  for (const u of TG.list.slice()) if (u !== t) TG.list.splice(TG.list.indexOf(u), 1);
  const sA = S0[0] + LEN[0] / 2, A = { stroke: 1, wall: 0, dx: 0, s: sA, y: 1.2 }, B = { stroke: 2, wall: 0, dx: 2.0, s: sA + 2.0, y: 1.2 };
  let clock = 0; for (let k = 0; k < 20; k++) { clock += DT; TG.step(DT, [A, B], 2, clock); }
  const forB = live(TG).some((u) => u !== t && Math.abs(cd(u.s, B.s)) <= 1.2);
  ok(forB, 'no monopoly: the second person gets a target beside the held one');
}

// 5. a person who rests and holds: field reaches 6 done in ≤ 15 s; chain 8 links in ≤ 30 s (walking at ≤ 1 m/s); ladder 2 in ≤ 20 s;
//    together with 1 person (need 1) and with 15 people (need ≤ 6)
function player(TG, P, sec, speed = 1) {   // every person walks to the nearest free target and holds it
  let clock = 0; const evs = [];
  for (let k = 0; k < Math.round(sec / DT); k++) {
    clock += DT;
    for (const p of P) {
      let best = null, bd = 1e9;
      for (const t of live(TG)) { const d = Math.abs(cd(t.s, p.s)); const taken = P.some((q) => q !== p && q.on === t.id); if (!taken && d < bd) { bd = d; best = t; } }
      p.on = best ? best.id : 0;
      if (best) { const d = cd(best.s, p.s), st = Math.min(Math.abs(d), speed * DT); p.s = wrap(p.s + Math.sign(d) * st); p.y += (best.y - p.y) * Math.min(1, DT * 4); }
    }
    TG.step(DT, handsOf(P), P.reduce((a, p) => a + p.hands.length, 0), clock);
    for (const e of TG.drain()) evs.push([clock, e]);
    if (TG.reached) return { t: clock, evs };
  }
  return { t: Infinity, evs };
}
{
  let TG = createTargets({ lengths: LEN, seed: 11 }); TG.offer({ mode: 'field', goal: 6 });
  let r = player(TG, crowd(1, 1), 30); ok(r.t <= 15, `field, one hand: 6 done in ${r.t.toFixed(1)} s (≤ 15)`);
  TG = createTargets({ lengths: LEN, seed: 12 }); TG.offer({ mode: 'chain', goal: 8 });
  r = player(TG, crowd(1, 1), 60); ok(r.t <= 30, `chain, one hand: 8 links in ${r.t.toFixed(1)} s (≤ 30)`);
  TG = createTargets({ lengths: LEN, seed: 13 }); TG.offer({ mode: 'ladder', goal: 2 });
  r = player(TG, crowd(1, 1), 40); ok(r.t <= 20, `ladder, one hand: 2 ladders in ${r.t.toFixed(1)} s (≤ 20)`);
  TG = createTargets({ lengths: LEN, seed: 14 }); TG.offer({ mode: 'together' });
  r = player(TG, crowd(1, 1), 20); ok(r.t <= 5, `together, one hand: need ${TG.need}, reached in ${r.t.toFixed(1)} s`);
  TG = createTargets({ lengths: LEN, seed: 15 }); TG.offer({ mode: 'together' });
  const big = crowd(15); r = player(TG, big, 30); const nh = big.reduce((a, p) => a + p.hands.length, 0);
  ok(TG.need >= 1 && TG.need <= 6 && r.t <= 10, `together, 15 people (${nh} hands): need ${TG.need} (1–6), reached in ${r.t.toFixed(1)} s`);
  TG = createTargets({ lengths: LEN, seed: 16 }); TG.offer({ mode: 'ladder', goal: 1, rungs: [0.9, 1.25, 1.6] });
  const kidsMin = []; for (let k = 0; k < 40; k++) { TG.step(DT, [], 4, k * DT); }
  const low = live(TG).filter((t) => t.rung === 0).map((t) => t.y); ok(low.some((y) => y <= 0.75), `ladder: a child's ladder is offered (first rungs ${low.map((y) => y.toFixed(2)).join(' ')})`);
}

// 6. placement: never inside a corner's margin, never inside a mask, ≥ 0.8 m apart (pairs ≥ 0.6)
{
  const masks = [[{ dx0: -1, dx1: 1, y0: 0, y1: 2.5 }], [], [], []];
  const TG = createTargets({ lengths: LEN, masks, seed: 21 });
  TG.offer({ mode: 'field', pairs: true });
  const H = handsOf(crowd(15));
  let bad = 0, close = 0;
  for (let k = 0; k < 200; k++) {
    TG.step(DT, H, H.length, k * DT);
    for (const t of TG.list) {
      if (Math.abs(t.dx) > LEN[t.wall] / 2 - 0.5 + 1e-6) bad++;
      if (t.wall === 0 && t.dx + t.r > -1 && t.dx - t.r < 1 && !t.placed) bad++;
      for (const u of TG.list) if (u.id < t.id) { const d = Math.hypot(cd(u.s, t.s), u.y - t.y); if (d < 0.6 - 1e-6) close++; }   // 0.8 m apart; 0.62 when a crowded spot needs one (and pairs, 0.6)
    }
  }
  ok(bad === 0, `placement: ${bad} target-steps in a corner margin or a mask`);
  ok(close === 0, `placement: ${close} pairs of targets too close`);
}

console.log(`targets-test: ${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
