// LAB ONLY — a virtual audience for simulate.html. It reads the score (window.__obra) and plays the visitors the guide asks for:
// they touch in Brasa, hold the circles in Pinya, press on the beat and hold both sides in Tronc, stay still in Pom de dalt, play
// in the Ressonància, hold while the castell comes down. Hands go through the lab harness's stage (window.__labRoom.stage.put /
// lift), so the visual piece and the sound piece both see them, exactly as they would see real hands. Not part of the piece.
const q = new URLSearchParams(location.search);
const PEOPLE = Math.min(15, Math.max(2, Number(q.get('people')) || 6));
let PACE = 1; try { PACE = Number(JSON.parse(q.get('params') || '{}').pace) || 1; } catch { /* no params */ }   // the pace is the piece's own parameter: ?params={"pace":2}
const rnd = (() => { let a = 0x51ab; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await wait(100);
const { score } = window.__obra, S = score.state, stage = window.__labRoom.stage, ROOM = stage.ROOM, H = ROOM.wallHeight;
const canvas = document.getElementById('c');

// ---------------------------------------------------------------- the view: the strip in two rows, from the canvas's own stream
const view = document.getElementById('view');
const half = ROOM.walls[2].x / ROOM.strip.width;                    // P4 · P1 | P2 · P3
const stream = canvas.captureStream(30);
function row(from, to, label) {
  const r = document.createElement('div'); r.className = 'row';
  const v = document.createElement('video'); v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = stream;
  r.appendChild(v);
  for (const w of ROOM.walls) { const c = (w.x + w.w / 2) / ROOM.strip.width; if (c >= from && c < to) { const t = document.createElement('div'); t.className = 'tag'; t.textContent = w.id; t.style.left = `${((c - from) / (to - from)) * 100}%`; r.appendChild(t); } }
  view.appendChild(r);
  const fit = () => {
    const W = innerWidth, k = W / ((to - from) * ROOM.strip.width), h = ROOM.strip.height * k;
    const avail = (innerHeight - 64 - 16 - 6) / 2, s = Math.min(1, avail / h);
    r.style.width = `${W * s}px`; r.style.height = `${h * s}px`; r.style.margin = '0 auto';
    v.style.height = '100%'; v.style.left = `${-from * ROOM.strip.width * k * s}px`;
  };
  addEventListener('resize', fit); fit();
  v.play().catch(() => {});
}
row(0, half, 'P4 · P1'); row(half, 1, 'P2 · P3');

// ---------------------------------------------------------------- the timeline at the bottom
const NAMES = { wait: 'Waiting', intro: 'Intro · La plaça', brasa: 'I · Brasa', pinya: 'II · Pinya — Força', tronc: 'III · Tronc — Equilibri', pom: 'IV · Pom de dalt — Valor', crown: "V · L'aleta — the crown", festa: 'V · La ressonància', baixada: 'La baixada — Seny', fall: 'The fall', acta: "L'acta" };
const T = score.times, PLAN = [['intro', T.intro], ['brasa', T.brasa.target], ['pinya', T.pinya.target], ['tronc', T.tronc.target], ['pom', T.pom.target], ['crown', T.crown], ['festa', T.festa.target], ['baixada', T.baixada.target], ['acta', T.acta]];
const total = PLAN.reduce((a, [, d]) => a + d, 0), COLORS = { intro: '#3a3226', brasa: '#7a2a10', pinya: '#6b4a33', tronc: '#8a5a3a', pom: '#1d2540', crown: '#a8873e', festa: '#c9a24a', baixada: '#5a4030', acta: '#262626' };
const track = document.getElementById('track');
for (const [b, d] of PLAN) { const i = document.createElement('i'); i.style.width = `${(d / total) * 100}%`; i.style.background = COLORS[b]; i.title = NAMES[b]; track.appendChild(i); }
const head = document.getElementById('head'), blockEl = document.getElementById('block'), clockEl = document.getElementById('clock');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- the audience
const wallC = ROOM.walls.map((w) => (w.x + w.w / 2) / ROOM.strip.width);     // wall centres, strip fraction
const sPerM = 1 / ROOM.perimeter, tOf = (ym) => 1 - ym / H;
const people = Array.from({ length: PEOPLE }, (_, i) => ({ i, wall: i % 4, hands: [{ key: `auto${i}a`, on: false, s: 0, t: 0 }, { key: `auto${i}b`, on: false, s: 0, t: 0 }], next: rnd() * 2, sloppy: i % 5 === 4 }));
const put = (h, s, ym) => { h.s = ((s % 1) + 1) % 1; h.t = tOf(ym); h.on = true; stage.put(h.key, h.s, h.t); };
const lift = (h) => { if (h.on) { h.on = false; stage.lift(h.key); } };
const liftAll = () => { for (const p of people) for (const h of p.hands) lift(h); };
const structure = () => { const a = []; for (let w = 0; w < S.walls.length; w++) if (S.walls[w]) a.push(w); return a.length ? a : [0, 1]; };
let last = performance.now(), t = 0, mode = '', modeT = 0, tapAt = 0, lastBeat = 0;

function hold(p, w, dx, ym, both = false) {          // a person standing at wall w, hands near (centre + dx), still, a tiny sway
  const c = wallC[w] + dx * sPerM, sway = 0.01 * Math.sin(t * 0.7 + p.i);
  put(p.hands[0], c - (both ? 0.32 : 0.06) * sPerM + sway * sPerM, ym + sway);
  if (both || p.i % 2 === 0) put(p.hands[1], c + (both ? 0.32 : 0.12) * sPerM, ym - 0.05); else lift(p.hands[1]);
}

function tick() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000) * PACE; last = now; t += dt;   // the audience lives in the score's time
  const b = S.block, phase = S.phase, key = b + ':' + phase;
  if (key !== mode) { mode = key; modeT = 0; } else modeT += dt;
  const sw = structure();

  if (b === 'wait') {                                 // two visitors walk up and hold the walls
    if (modeT > 2) { hold(people[0], 0, 0, 1.25); hold(people[1], 1, 0, 1.25); } else liftAll();
    for (const p of people.slice(2)) for (const h of p.hands) lift(h);
  } else if (b === 'intro' || b === 'crown' || b === 'acta' || b === 'fall' || phase === 'title') {
    liftAll();                                        // they watch and listen
  } else if (b === 'brasa') {
    if (phase === 'reward') liftAll();
    else if (modeT < 14) {                            // first, each one touches on their own
      for (const p of people) { p.next -= dt; const h = p.hands[0]; if (h.on && p.next < 1.2) lift(h); if (p.next <= 0) { p.next = 2 + rnd() * 3; put(h, wallC[p.wall] + (rnd() - 0.5) * 4 * sPerM, 1.05 + rnd() * 0.4); } }
    } else {                                          // then together, as the voice asks
      tapAt -= dt;
      if (tapAt <= 0) { tapAt = 4.2; for (const p of people) put(p.hands[0], wallC[p.wall] + ((p.i >> 2) - 1) * 0.9 * sPerM, 1.2 + 0.1 * Math.sin(p.i)); }
      else if (tapAt < 3) liftAll();
    }
  } else if (b === 'pinya') {                         // they walk to the walls the circle needs, one by one, and hold
    const need = Math.max(2, S.needWalls), offs = S.buttons >= 3 ? [-1.1, 0, 1.1] : S.buttons === 2 ? [-0.7, 0.7] : [0];
    people.forEach((p, k) => {
      if (modeT < 1.5 + k * 1.6) { lift(p.hands[0]); lift(p.hands[1]); return; }
      const w = k % need, o = offs[Math.floor(k / need) % offs.length];
      hold(p, w, o, 1.25);
    });
  } else if (b === 'tronc') {                         // on the castell's walls: press on the beat; from the third floor, both sides
    const beat = S.beat, crossed = beat < lastBeat; lastBeat = beat;
    people.forEach((p, k) => {
      const w = sw[k % sw.length], side = S.balance ? (Math.floor(k / sw.length) % 2 ? 0.65 : -0.65) : 0;
      const off = p.sloppy && Math.sin(t * 0.13 + p.i) > 0.6;              // now and then someone loses the pulse
      const up = !off && beat > 0.62 && beat < 0.93;                       // lift just before the drum, land on it
      if (up) { lift(p.hands[0]); lift(p.hands[1]); } else hold(p, w, side, 1.25, S.balance && sw.length * 2 > people.length);
      if (crossed && off) lift(p.hands[0]);
    });
  } else if (b === 'pom') {                           // still, hands on the wall
    people.forEach((p, k) => { const w = sw[k % sw.length]; hold(p, w, 0, 1.25); });
  } else if (b === 'festa') {                         // play: groups land together, someone drags
    tapAt -= dt;
    if (tapAt <= 0) { tapAt = 1.6 + rnd() * 1.2; const n = 2 + Math.floor(rnd() * Math.min(PEOPLE, 6)); for (let j = 0; j < n; j++) { const p = people[Math.floor(rnd() * PEOPLE)]; put(p.hands[0], rnd(), 0.9 + rnd() * 0.9); p.next = 0.5 + rnd() * 0.5; } }
    for (const p of people) { p.next -= dt; if (p.next <= 0) lift(p.hands[0]); }
    const d = people[0].hands[1]; put(d, wallC[0] + Math.sin(t * 0.35) * 2.5 * sPerM, 1.3 + 0.25 * Math.sin(t * 0.5));   // one dragging hand
  } else if (b === 'baixada') {
    people.forEach((p, k) => { const w = sw[k % sw.length]; hold(p, w, 0, 1.25); });
  }

  // the bar
  let at = 0; for (const [pb, d] of PLAN) { if (pb === b) { at += Math.min(S.t, d); break; } at += d; }
  if (b === 'wait') at = 0;
  head.style.left = `${(at / total) * 100}%`;
  blockEl.innerHTML = `<b>${NAMES[b] || b}</b> &nbsp;·&nbsp; ${phase === 'title' ? 'chapter card' : phase === 'reward' ? 'reward' : 'play'} &nbsp;·&nbsp; ${PEOPLE} people${S.structure ? ` · castell on ${S.structure} walls · ${S.floors} floors` : ''}`;
  clockEl.textContent = `${mmss(S.passT || 0)} / ≈${mmss(total)}${PACE !== 1 ? ` · ×${PACE}` : ''}`;
  requestAnimationFrame(tick);
}

// start on a click: the browser needs a gesture for the sound; the pass starts from the wait, fresh
document.getElementById('start').addEventListener('click', (e) => {
  e.currentTarget.remove();
  const from = q.get('from') || 'wait';   // ?from=pinya starts the review at a chapter
  const bc = new BroadcastChannel('ressonancia'); bc.postMessage({ type: 'ctl', jump: from }); bc.close();
  score.jump(from);
  last = performance.now(); requestAnimationFrame(tick);
}, { once: true });
