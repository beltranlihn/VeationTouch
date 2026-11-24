#!/usr/bin/env node
// Ressonància — the score in Node, no GPU (plan 05 §5.5 I1, §6.1): synthetic audiences walk whole passes and the report says how
// long each block lasted, how it ended, where the colla helped and which achievements were named.
//
//   node lab/estudio/tools/score-sim.mjs [--score path/to/score.js] [--sizes 1,2,4,8,15] [--acts hold,passive,strike] [--seed 1]
//                                        [--lidar 0.06] [--json out.json] [--events] [--shrink]
//
// Sizes are PEOPLE except 1 and 2: «1» = one person with one hand, «2» = one person with both hands, 4 = 2 people with 2 hands, 8 = 5
// people (8 hands), 15 = 15 people (24 hands). Acts:
//   hold     rests and holds where the work asks: on the targets (S.targets) when there are, else what the voice asks today
//            (the button, the call's TOK, packing, lifting with the phrase, stillness, raising, the echo, bringing it down)
//   passive  hands resting where they are, never following
//   strike   only taps (0.25 s down, 0.8–1.6 s up), anywhere
//   slow     as hold, but hesitant and late: waits 2.5–5 s before each new target, walks at 0.4 m/s, lifts slowly
// --reach m: nobody reaches above m (children: --reach 1.4): targets higher are ignored, hands never go above it.
// --lidar p: every 0.1 s a hand is lost with probability p for 0.1–0.3 s (and comes back under a new stroke 1 time in 5).
// --shrink: the group shrinks from its size to 2 people halfway through each interactive block (D8).
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const scorePath = path.resolve(arg('score', path.join(HERE, '../../experiments/ressonancia/score.js')));
const { createScore } = await import(pathToFileURL(scorePath).href);
const SIZES = arg('sizes', '1,2,4,8,15').split(',').map(Number), ACTS = arg('acts', 'hold,passive,strike').split(',');
const LIDAR = Number(arg('lidar', '0.06')), SEED = Number(arg('seed', '1')), DT = 0.05, SHRINK = flag('shrink'), REACH = Number(arg('reach', '2.2'));

const LEN = [7.33, 6.483, 7.353, 6.411], W = 4, S0 = LEN.reduce((a, l, w) => { a.push(w ? a[w - 1] + LEN[w - 1] : 0); return a; }, []), PER = LEN.reduce((a, b) => a + b, 0);
const wrap = (x) => ((x % PER) + PER) % PER, cd = (a, b) => { const d = wrap(a - b); return d > PER / 2 ? d - PER : d; };
const wallAt = (s) => { s = wrap(s); for (let w = W - 1; w >= 0; w--) if (s >= S0[w]) return w; return 0; };
const centreS = (w) => S0[w] + LEN[w] / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const INTERACTIVE = ['brasa', 'pinya', 'tronc', 'pom', 'festa', 'baixada'];

function run(size, act, seed) {
  let rs = seed * 9973 + size * 31 + act.length; const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const mathRandom = Math.random; Math.random = rnd;   // the score's own draws (the call's wall, the wobble's wall), seeded
  const sc = createScore(W, { lengths: LEN }), S = sc.state;
  const nPeople = size <= 2 ? 1 : size === 8 ? 5 : size, handsEach = size === 1 ? 1 : size === 8 ? null : 2;
  let strokeId = 1;
  const people = Array.from({ length: nPeople }, (_, i) => {
    const home = i % W, s = centreS(home) + (rnd() - 0.5) * (LEN[home] - 2.5);
    const k = handsEach ?? (i < 3 ? 2 : 1);
    return { i, home, s, gone: false, hands: Array.from({ length: k }, (_, j) => ({ off: j ? 0.6 : 0, y: REACH < 1.6 ? 0.8 + rnd() * 0.35 : 1.1 + rnd() * 0.3, down: true, stroke: strokeId++, lostUntil: -1, tapAt: rnd() * 1.5, claim: 0 })) };
  });
  const ev = {}, blocks = [], assists = new Set(), achs = {}, stageOrder = [];
  let t = 0, cur = '', curAt = 0, pass = 0, lastTick = 0, snap = null;
  if (act !== 'hold') sc.jump('intro');
  const hands = [];
  const maxT = 1500;
  while (t < maxT) {
    t += DT;
    const B = S.block;
    // the group shrinks to 2 people halfway through every interactive block (D8)
    if (SHRINK && INTERACTIVE.includes(B)) { const half = S.t > 20; for (const p of people) p.gone = half && p.i >= 2; } else for (const p of people) p.gone = false;
    policy(S, people, act, t, rnd);
    // the hands as the sensor gives them (LiDAR losses every 0.1 s)
    const tick = Math.floor(t / 0.1) !== Math.floor(lastTick / 0.1); lastTick = t;
    hands.length = 0;
    for (const p of people) {
      if (p.gone) continue;
      for (const h of p.hands) {
        if (tick && LIDAR > 0 && t > h.lostUntil && rnd() < LIDAR) { h.lostUntil = t + 0.1 + rnd() * 0.2; if (rnd() < 0.2) h.newId = true; }
        if (!h.down || t < h.lostUntil) continue;
        if (h.newId) { h.stroke = strokeId++; h.newId = false; }
        const s = wrap(p.s + h.off), w = wallAt(s);
        hands.push({ stroke: h.stroke, wall: w, dx: s - centreS(w), s, y: Math.min(REACH, h.y), vx: 0, vy: 0, size: 0.12, speed: 0 });
      }
    }
    sc.step(DT, hands);
    for (const e of S.events.splice(0)) {
      const k = e.replace(/:-?\d+$/, '');
      ev[k] = (ev[k] || 0) + 1;
      if (e.startsWith('assist:on:')) assists.add(e.slice(10));
      if (e.startsWith('ach:')) { const a = e.slice(4); achs[a] = (achs[a] || 0) + 1; if (S.ach && S.ach.by === 'colla') achs[a + '(colla)'] = (achs[a + '(colla)'] || 0) + 1; }
      if (e.startsWith('stage:')) stageOrder.push(e.slice(6) + '@' + Math.round(S.passT));
    }
    if (S.block === 'acta' && S.t < 0.2) snap = { acta: sc.acta(), outcome: S.outcome, result: S.result ? JSON.parse(JSON.stringify(S.result)) : {}, castell: S.castell ? JSON.parse(JSON.stringify(S.castell)) : {}, waves: S.waves, echo: S.echoHits, bloom: S.bloomSize, structure: S.structure, aleta: S.aletaHands };
    if (S.block !== cur) { if (cur) blocks.push([cur, +(t - curAt).toFixed(1)]); cur = S.block; curAt = t; if (cur === 'wait' && blocks.length > 1) { pass++; break; } }
  }
  Math.random = mathRandom;
  const Z = snap || { acta: sc.acta(), outcome: S.outcome, result: {}, castell: {} };
  return { size, act, seed, total: +blocks.filter(([b]) => b !== 'wait').reduce((a, [, d]) => a + d, 0).toFixed(1), blocks, outcome: Z.outcome, acta: Z.acta.castell, snap: Z,
    result: Z.result, castell: Z.castell, assists: [...assists], achs, ev, stages: stageOrder, abandoned: !!ev.abandon };
}

// ---------------------------------------------------------------------------------------------------------------------------- acts
function policy(S, people, act, t, rnd) {
  const B = S.block;
  if (act === 'passive') { for (const p of people) for (const h of p.hands) h.down = true; return; }   // (slow: below, with hold)
  if (act === 'strike') {
    for (const p of people) {
      if (rnd() < 0.002) p.s = wrap(p.s + (rnd() - 0.5) * 3);
      for (const h of p.hands) { h.tapAt -= DT; if (h.tapAt <= 0) { h.down = !h.down; h.tapAt = h.down ? 0.25 : 0.8 + rnd() * 0.8; if (h.down) h.y = 0.8 + rnd() * 0.9; } }
    }
    return;
  }
  // hold: on the targets when there are any
  const live = (S.targets || []).filter((x) => x.state !== 'done');
  const SL = act === 'slow' ? 0.4 : 1;   // slow: hesitant and late (walks at 40 %, waits 2.5–5 s before each new target, lifts slowly)
  if (live.length && !(B === 'pom' && S.phase !== 'aleta')) { onTargets(S, people, live, t, SL < 1, rnd); return; }
  for (const p of people) for (const h of p.hands) h.down = true;
  const walk = (p, s, v = 0.9) => { const d = cd(s, p.s), st = Math.min(Math.abs(d), v * SL * DT); p.s = wrap(p.s + Math.sign(d) * st); };
  const lift = (h, y, k = 3) => { h.y += (y - h.y) * Math.min(1, DT * k * SL); };
  if (B === 'wait') { for (const p of people) { walk(p, centreS(p.home) - 0.3); for (const h of p.hands) lift(h, 1.2); } return; }
  if (B === 'brasa') {
    if (S.brasaStage === 'relay' && S.relay) {   // one person walks ahead of the fire devil; a group stands spread
      if (people.length <= 2) walk(people[0], S.relay.s + 1.6, 1.0);
      return;
    }
    if (S.brasaStage === 'call' && S.call) {    // up before the TOK, land on it
      const C = S.call, dtTok = C.at - S.clock;
      for (const p of people) for (const h of p.hands) h.down = !(dtTok > 0 && dtTok < 0.6);
    }
    return;
  }
  if (B === 'pinya') { for (const p of people) { walk(p, centreS(p.home) + (p.i % 3 - 1) * 0.5 - p.hands.length * 0.15, 0.5); for (const h of p.hands) lift(h, 1.2); } return; }
  if (B === 'tronc') {
    const want = S.wobble > 0 && S.wobbleWall >= 0;
    for (const p of people) {
      const w = wallAt(p.s);
      if (want && w === S.wobbleWall) { for (const h of p.hands) lift(h, 0.75, 4); continue; }
      walk(p, centreS(p.home) + (p.i % 2 ? 0.6 : -0.9), 0.5);
      const y = S.phrase === 'gather' ? 0.9 : 1.45;
      for (const h of p.hands) lift(h, y, 4);
    }
    return;
  }
  if (B === 'pom') {
    if (S.phase === 'aleta') for (const p of people) for (const h of p.hands) lift(h, Math.min(REACH, 1.8), 3);
    return;   // still
  }
  if (B === 'festa') {
    if (S.festaStage === 'free') { const ph = t % 3; for (const p of people) for (const h of p.hands) h.down = ph > 0.4; }
    else if (S.festaStage === 'echo') {
      for (const p of people) for (const h of p.hands) {
        const w = wallAt(p.s + h.off), f = (S.fronts || []).find((x) => x.to === w && Math.abs(x.arrive - S.clock) < 0.5);
        h.down = !f || Math.abs(f.arrive - S.clock) < 0.15 ? true : false;
      }
    } else if (S.call) { const dtTok = S.call.at - S.clock; for (const p of people) for (const h of p.hands) h.down = !(dtTok > 0 && dtTok < 0.6); }
    return;
  }
  if (B === 'baixada') { const ph = t % 4; for (const p of people) for (const h of p.hands) { h.y = ph < 0.5 ? h.y + (1.6 - h.y) * Math.min(1, DT * 4) : Math.max(0.65, h.y - 0.3 * DT); } return; }
}
// rest and hold on the targets: every person goes to the nearest free one (not another's) and puts a hand on it until it is done
const lowOf = (x) => x.y - (x.h || 2 * (x.r || 0.22)) / 2;   // the lowest point of a target (pillars and blocks are tall)
function onTargets(S, people, live, t, slow, rnd) {
  const taken = new Set();
  for (const p of people) {
    const mine = p.hands[0].claim && live.find((x) => x.id === p.hands[0].claim);
    if (mine) { taken.add(mine.id); continue; }
    let best = null, bd = 1e9;
    for (const x of live) { if (taken.has(x.id) || lowOf(x) + 0.05 > REACH) continue; const d = Math.abs(cd(x.s, p.s)); if (d < bd) { bd = d; best = x; } }
    const was = p.hands[0].claim; p.hands[0].claim = best ? best.id : 0; if (best) taken.add(best.id);
    if (slow && best && best.id !== was) p.wait = 2.5 + rnd() * 2.5;
  }
  for (const p of people) {
    const x = live.find((y) => y.id === p.hands[0].claim);
    for (const h of p.hands) h.down = true;
    if (!x) continue;
    if (slow && p.wait > 0) { p.wait -= DT; continue; }       // hesitates: the hand stays where it was
    const d = cd(x.s, p.s), st = Math.min(Math.abs(d), (slow ? 0.4 : 1.0) * DT); p.s = wrap(p.s + Math.sign(d) * st);
    const ty = Math.min(x.y, REACH - 0.05, Math.max(lowOf(x) + 0.12, x.y));
    p.hands[0].y += (ty - p.hands[0].y) * Math.min(1, DT * (slow ? 2 : 5));
    if (p.hands[1]) { // the second hand: on the pair if there is one, else resting beside
      const q = x.pairOf && live.find((y) => y.id === x.pairOf);
      if (q) { p.hands[1].off = cd(q.s, p.s); p.hands[1].y += (q.y - p.hands[1].y) * Math.min(1, DT * 5); } else p.hands[1].off = 0.6;
    }
  }
}

// --------------------------------------------------------------------------------------------------------------------------- report
const t0 = Date.now(), rows = [];
for (const act of ACTS) for (const size of SIZES) rows.push(run(size, act, SEED));
const short = (r) => {
  const bl = r.blocks.filter(([b]) => b !== 'wait').map(([b, d]) => `${b.slice(0, 5)} ${Math.round(d)}`).join(' · ');
  const res = r.result, c = r.castell;
  return `${String(r.size).padStart(2)} ${r.act.padEnd(7)} ${String(Math.round(r.total)).padStart(4)} s  ${r.acta.padEnd(10)} ${String(r.outcome).padEnd(11)} `
    + `brasa=${res.brasa || '-'} pinya=${res.pinya ? res.pinya.n + '/' + res.pinya.by : '-'} tronc=${res.tronc ? res.tronc.own + '+' + res.tronc.colla : '-'} pom=${res.pom || '-'} crown=${c.crown || '-'} festa=${res.festa} baix=${res.baixada || '-'}`
    + `  help[${r.assists.join(',')}]${r.abandoned ? ' ABANDON' : ''}\n      ${bl}`
    + `\n      today: waves ${r.snap.waves ?? '-'}/${r.ev.wave || 0} calls · relay help ${r.ev['relay:assist'] || 0} · struct ${r.snap.structure ?? '-'} · floors ${r.ev.floor || 0} slip ${r.ev.slip || 0}/${r.ev.wobble || 0} · pom breaks ${r.ev['hush:break'] || 0} falters ${r.ev.falter || 0} · aleta ${Math.round((r.snap.aleta || 0) * 100)}% · echo ${r.snap.echo ?? '-'} ghost ${r.ev.ghost || 0} · bloom ${(r.snap.bloom || 0).toFixed(2)} · cracks ${r.ev.crack || 0}`;
};
console.log(`score-sim: ${path.relative(process.cwd(), scorePath)} · seed ${SEED} · lidar ${LIDAR}${SHRINK ? ' · shrink' : ''}`);
if (!flag('table')) {
  console.log('size act    total  castell    outcome     results  help[blocks where the colla helped]');
  for (const r of rows) {
    console.log(short(r));
    if (flag('events')) console.log('      ach: ' + Object.entries(r.achs).map(([k, v]) => k + '×' + v).join(' ') + '\n      stages: ' + r.stages.join(' '));
  }
}
// THE MATRIX (plan 05 §6.1): per block, A = the group's own ending, B = the smaller one / with the colla; «+c» = the colla helped (named)
const AB = {
  brasa: (r) => (r.result.brasa ? (r.result.brasa === 'encesa' ? 'A' : 'B') : '?'),
  pinya: (r) => (r.result.pinya ? (r.result.pinya.by === 'group' ? 'A' : 'B') + r.result.pinya.n : '?'),
  tronc: (r) => (r.result.tronc ? (r.result.tronc.by === 'group' ? 'A' : 'B') + r.result.tronc.own + '+' + r.result.tronc.colla : '?'),
  pom: (r) => (r.result.pom ? (r.result.pom === 'net' ? 'A' : 'B') : '?'),
  crown: (r) => (r.castell.crown ? (r.castell.crown === 'ample' ? 'A' : 'B') : '?'),
  festa: (r) => (r.result.festa ? (r.result.festa >= 3 ? 'A' : 'B') + r.result.festa : '?'),
  baixada: (r) => (r.result.baixada ? (r.result.baixada === 'net' ? 'A' : 'B') : '?'),
};
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('act', 8) + pad('size', 5) + Object.keys(AB).map((k) => pad(k, 10)).join('') + pad('total', 7) + 'castell');
for (const r of rows) {
  console.log(pad(r.act, 8) + pad(r.size, 5) + Object.entries(AB).map(([k, f]) => pad(f(r) + (r.assists.includes(k === 'crown' ? '-' : k) ? '+c' : ''), 10)).join('')
    + pad(Math.round(r.total) + 's', 7) + r.acta + (r.outcome !== 'descarregat' ? ' ' + r.outcome : '') + (r.abandoned ? ' ABANDON' : ''));
}
console.log(`(${rows.length} passes in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (arg('json')) { const fs = await import('node:fs'); fs.writeFileSync(arg('json'), JSON.stringify(rows, null, 1)); }
