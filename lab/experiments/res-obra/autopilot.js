// LAB ONLY — a virtual audience for simulate.html. It reads the score (window.__obra) and plays the visitors the guide asks for:
// they touch in Brasa, hold the circles in Pinya, press on the beat and hold both sides in Tronc, stay still in Pom de dalt, play
// in the Ressonància, hold while the castell comes down. Hands go through the lab harness's stage (window.__labRoom.stage.put /
// lift), so the visual piece and the sound piece both see them, exactly as they would see real hands. Not part of the piece.
const q = new URLSearchParams(location.search);
const PEOPLE = q.get('people') === '0' ? 0 : Math.min(15, Math.max(2, Number(q.get('people')) || 6));   // 0 = «sólo yo»: no virtual audience (T-046)
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
  ownPointer(r, from, to);
  const fit = () => {
    const W = innerWidth, k = W / ((to - from) * ROOM.strip.width), h = ROOM.strip.height * k;
    const avail = (innerHeight - 64 - 16 - 6) / 2, s = Math.min(1, avail / h);
    r.style.width = `${W * s}px`; r.style.height = `${h * s}px`; r.style.margin = '0 auto';
    v.style.height = '100%'; v.style.left = `${-from * ROOM.strip.width * k * s}px`;
  };
  addEventListener('resize', fit); fit();
  v.play().catch(() => {});
}
// T-046 (Beltrán: «tocaba y no pasaba nada»): the pointer on a visible row is a hand where it is seen. The row spans [from, to) of the
// strip: s = from + x/width · (to − from), t = y/height; the kit ignores pointers here ([data-lk-ignore]). Shift + click pins a hand (or
// unpins the one under it). Every hand gets a marker on the rows: yours cyan, the virtual audience's amber.
const own = new Map(); let pinN = 0;
function ownPointer(r, from, to) {
  r.dataset.lkIgnore = ''; r.style.cursor = 'crosshair'; r.style.touchAction = 'none';
  const at = (e) => { const b = r.getBoundingClientRect(); return { s: from + ((e.clientX - b.left) / b.width) * (to - from), t: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  r.addEventListener('pointerdown', (e) => {
    const p = at(e);
    if (e.shiftKey) {
      let hit = null, bd = 1e9;
      for (const [k, h] of own) if (k.startsWith('mepin')) { const d = Math.hypot((((h.s - p.s + 0.5) % 1) + 1) % 1 - 0.5, (h.t - p.t) * H / ROOM.perimeter); if (d < bd) { bd = d; hit = k; } }
      if (hit && bd * ROOM.perimeter < 0.45) { stage.lift(hit); own.delete(hit); } else { const k = 'mepin' + (pinN++); stage.put(k, p.s, p.t); own.set(k, p); }
      return;
    }
    try { r.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    const k = 'me' + e.pointerId; stage.put(k, p.s, p.t); own.set(k, p);
    window.__lastOwnHand = { key: k, s: +p.s.toFixed(4), t: +p.t.toFixed(4) };   // lab checks
  });
  r.addEventListener('pointermove', (e) => { const k = 'me' + e.pointerId; if (!own.has(k)) return; const p = at(e); stage.put(k, p.s, p.t); own.set(k, p); });
  const up = (e) => { const k = 'me' + e.pointerId; if (own.has(k)) { stage.lift(k); own.delete(k); } };
  r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
}
row(0, half, 'P4 · P1'); row(half, 1, 'P2 · P3');
{ // the markers
  const rows = [...view.querySelectorAll('.row')], spans = [[0, half], [half, 1]], pool = rows.map(() => []);
  const css = (own) => `position:absolute;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%);${own ? 'width:22px;height:22px;border:2px solid #4FC3E8;box-shadow:0 0 8px rgba(79,195,232,.6)' : 'width:9px;height:9px;background:rgba(229,181,103,.75)'}`;
  const draw = () => {
    rows.forEach((r, i) => {
      const [from, to] = spans[i], w = r.clientWidth, h = r.clientHeight; let n = 0;
      for (const hd of stage.hands()) {
        if (hd.demo) continue;
        const s = ((hd.s % 1) + 1) % 1; if (s < from || s >= to) continue;
        const mine = !String(hd.key).startsWith('auto');
        let d = pool[i][n]; if (!d) { d = document.createElement('div'); r.appendChild(d); pool[i].push(d); }
        if (d.dataset.own !== String(mine)) { d.style.cssText = css(mine); d.dataset.own = String(mine); }
        d.style.display = ''; d.style.left = `${((s - from) / (to - from)) * w}px`; d.style.top = `${hd.t * h}px`; n++;
      }
      for (let k = n; k < pool[i].length; k++) pool[i][k].style.display = 'none';
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

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

// the new verbs (24-11, plan de interacción step 0; ENT): hands that slide up or down the wall at a human pace, gather towards the wall's
// centre, and one hand raised (l'aleta). Stateless: each is a height / offset as a function of the time since the verb started.
const slideY = (from, dy, speed, since) => from + Math.sign(dy) * Math.min(Math.abs(dy), Math.max(0, since) * speed);   // rise (dy > 0) or lower (dy < 0)
const gatherDx = (dx, since, secs = 4) => dx * (1 - Math.min(1, Math.max(0, since) / secs));                          // towards the centre
function raiseOne(p, w, ym, since) {           // l'aleta: one hand rises 0.3–0.6 m at 0.3–0.45 m/s, the other stays
  const c = wallC[w], dy = 0.3 + (p.i % 4) * 0.1, speed = 0.3 + (p.i % 3) * 0.075, late = (p.i % 5) * 0.25;
  put(p.hands[0], c - 0.1 * sPerM, slideY(ym, dy, speed, since - late));
  put(p.hands[1], c + 0.12 * sPerM, ym - 0.05);
}

function tick() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000) * PACE; last = now; t += dt;   // the audience lives in the score's time
  const b = S.block, phase = S.phase, key = b + ':' + phase;
  if (key !== mode) { mode = key; modeT = 0; } else modeT += dt;
  const sw = structure();

  if (PEOPLE === 0) { /* «sólo yo»: nobody else touches */ }
  else if (b === 'wait') {                            // two visitors walk up and hold the walls
    if (modeT > 2) { hold(people[0], 0, 0, 1.25); hold(people[1], 1, 0, 1.25); } else liftAll();
    for (const p of people.slice(2)) for (const h of p.hands) lift(h);
  } else if (b === 'intro' || b === 'crown' || b === 'acta' || b === 'fall' || phase === 'title') {
    liftAll();                                        // they watch and listen
  } else if (b === 'brasa') {
    if (phase === 'reward') liftAll();
    else if (S.brasaStage ? S.brasaStage === 'spark' : modeT < 14) {   // first, each one touches on their own (the spark)
      for (const p of people) { p.next -= dt; const h = p.hands[0]; if (h.on && p.next < 1.2) lift(h); if (p.next <= 0) { p.next = 2 + rnd() * 3; put(h, wallC[p.wall] + (rnd() - 0.5) * 4 * sPerM, 1.05 + rnd() * 0.4); } }
    } else if (S.brasaStage === 'call' && S.call) {   // the call (24-11): they listen to tok… tok… and strike on the TOK (the sloppy ones a little late)
      const C = S.call, dtT = S.clock - C.at;
      for (const p of people) { const off = p.sloppy ? 0.45 : 0.08; if (dtT >= off - 0.02 && dtT < off + 0.35 && C.n <= 3) put(p.hands[0], wallC[p.wall] + ((p.i >> 2) - 1) * 0.9 * sPerM, 1.2 + 0.1 * Math.sin(p.i)); else lift(p.hands[0]); }
    } else {                                          // then together, as the voice asks
      tapAt -= dt;
      if (tapAt <= 0) { tapAt = 4.2; for (const p of people) put(p.hands[0], wallC[p.wall] + ((p.i >> 2) - 1) * 0.9 * sPerM, 1.2 + 0.1 * Math.sin(p.i)); }
      else if (tapAt < 3) liftAll();
    }
  } else if (b === 'pinya') {                         // they walk to the walls the circle needs, one by one, and hold
    const need = Math.max(2, S.needWalls), offs = S.buttons >= 3 ? [-1.1, 0, 1.1] : S.buttons === 2 ? [-0.7, 0.7] : [0];
    people.forEach((p, k) => {
      if (modeT < 1.5 + k * 1.6) { lift(p.hands[0]); lift(p.hands[1]); return; }
      const w = k % need, o = offs[Math.floor(k / need) % offs.length] + ((k / need) | 0) * 0.3;
      const near = 0.2 + 0.8 * (1 - Math.min(1, Math.max(0, (S.tp || 0) - 15) / 6));   // 24-11: after the palm (15 s) they follow it to the wall's centre
      hold(p, w, o * near, 1.1);
    });
  } else if (b === 'tronc') {                         // lift and level (24-11): each phrase, hands down to receive, then up 0.5 m; the sloppy one is the base
    const sec = (S.phraseT || 0) * (T.tronc.phrase || 4.8);
    people.forEach((p, k) => {
      const w = sw[k % sw.length], side = S.balance ? (Math.floor(k / sw.length) % 2 ? 0.65 : -0.65) : 0;
      let y = p.sloppy ? 0.95 : slideY(0.95, 0.5, 0.38, sec - 1.2);
      if (S.wobble > 0 && w === S.wobbleWall) y = Math.max(0.7, 1.45 - S.wobble * 4);   // it trembles: hands to the foot
      hold(p, w, side, y, S.balance && sw.length * 2 > people.length);
    });
  } else if (b === 'pom' && phase === 'aleta') {     // l'aleta: they raise one hand, like the enxaneta
    people.forEach((p, k) => raiseOne(p, sw[k % sw.length], 1.25, modeT - 0.6));
  } else if (b === 'pom') {                           // still, hands on the wall
    people.forEach((p, k) => { const w = sw[k % sw.length]; hold(p, w, 0, 1.25); });
  } else if (b === 'festa' && S.festaStage === 'call' && S.call) {   // the final call (24-11): everybody strikes on the TOK
    const C = S.call, dtT = S.clock - C.at;
    for (const p of people) { const off = p.sloppy ? 0.4 : 0.08; if (dtT >= off - 0.02 && dtT < off + 0.35 && C.n <= 4) put(p.hands[0], wallC[p.wall] + ((p.i >> 2) - 1) * 0.9 * sPerM, 1.0 + 0.15 * (p.i % 4)); else lift(p.hands[0]); lift(p.hands[1]); }
  } else if (b === 'festa') {                         // play: groups land together, someone drags; in the echo, someone returns the fronts
    if (S.festaStage === 'echo' && S.fronts) for (const f of S.fronts) { const d = S.clock - f.arrive; if (d > -0.15 && d < 0.2) { const p = people.find((q) => q.wall === f.to && !q.sloppy); if (p) { put(p.hands[1], wallC[f.to] + 0.4 * sPerM, 1.1 + 0.3 * (f.gen % 3)); p.next2 = 0.4; } } }
    for (const p of people) if (p.next2 !== undefined) { p.next2 -= dt; if (p.next2 <= 0) { lift(p.hands[1]); p.next2 = undefined; } }
    tapAt -= dt;
    if (tapAt <= 0) { tapAt = 1.6 + rnd() * 1.2; const n = 2 + Math.floor(rnd() * Math.min(PEOPLE, 6)); for (let j = 0; j < n; j++) { const p = people[Math.floor(rnd() * PEOPLE)]; put(p.hands[0], rnd(), 0.9 + rnd() * 0.9); p.next = 0.5 + rnd() * 0.5; } }
    for (const p of people) { p.next -= dt; if (p.next <= 0) lift(p.hands[0]); }
    const d = people[0].hands[1]; put(d, wallC[0] + Math.sin(t * 0.35) * 2.5 * sPerM, 1.3 + 0.25 * Math.sin(t * 0.5));   // one dragging hand
  } else if (b === 'baixada') {                       // bring it down (24-11): up to receive, then down 0.75 m at 0.3 m/s, gently
    const sec = (t + 0.0) % 6.5;
    people.forEach((p, k) => { const w = sw[k % sw.length]; const y = sec < 1.5 ? slideY(0.85, 0.75, 0.6, sec) : sec < 4 ? slideY(1.6, -0.75, 0.3, sec - 1.5) : 0.85; hold(p, w, 0, y); });
  }

  // the bar
  let at = 0; for (const [pb, d] of PLAN) { if (pb === b) { at += Math.min(S.t, d); break; } at += d; }
  if (b === 'wait') at = 0;
  head.style.left = `${(at / total) * 100}%`;
  blockEl.innerHTML = `<b>${NAMES[b] || b}</b> &nbsp;·&nbsp; ${phase === 'title' ? 'chapter card' : phase === 'reward' ? 'reward' : phase === 'aleta' ? "l'aleta" : 'play'} &nbsp;·&nbsp; ${PEOPLE} people${S.structure ? ` · castell on ${S.structure} walls · ${S.floors} floors` : ''}`;
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
