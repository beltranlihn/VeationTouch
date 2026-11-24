// Ressonància — the score: the whole 10-minute work as a pure state machine (no DOM, no GL, no audio). See GUION.md.
//
// It reads only what the room knows — how many hands, on which walls, on which side of a wall's centre, when they land, how still
// they are — and walks the pass:
//
//   wait     the threshold: free play reveals the start button (reveal), holding the button starts the pass (start)
//   intro    La plaça, 70 s, pre-designed
//   brasa    FIRE            touch; then together (waves)                         -> the ring is awake
//   pinya    BODY AND EARTH  Força: fill the circles, hold the walls at once      -> the circle closes, the structure is set
//   tronc    STONE           Equilibri: press on the pulse, hold both sides       -> 5 to 9 floors
//   pom      AIR AND NIGHT   Valor: stay still, pass the light from wall to wall  -> three climbers reach the top
//   crown    LIGHT           l'aleta, 25 s, pre-designed
//   festa    RESONANCE       free: the room resonates with the hands
//   baixada  Seny: keep holding while it comes down                               -> descarregat | carregat
//   fall     it fell before the crown (intent) or on the way down (carregat)
//   acta     the group's castell and its four values, 40 s, then back to wait
//
// Every interactive block has three phases: 'title' (the chapter card and the voice: teach), 'play', 'reward' (the payoff and the
// way out). A block never ends before its minimum and never lasts beyond its maximum: a pass is always about ten minutes.
// The group is estimated from the hands seen (2 to 15 people) and sets how much each goal asks.
export const BLOCKS = ['wait', 'intro', 'brasa', 'pinya', 'tronc', 'pom', 'crown', 'festa', 'baixada', 'fall', 'acta'];
export const FLOOR_NAMES = ['Baixos', 'Segons', 'Terços', 'Quarts', 'Quints', 'Sisens', 'Setens', 'Vuitens', 'Novens'];
export const CLIMBERS = ['Dosos', 'Acotxador', 'Enxaneta'];
export const STRUCTURES = ['', 'pilar', 'torre', 'tres', 'quatre'];

export const TIMES = {                       // seconds
  linger: 2,                                 // a wall stays "held" this long after its last hand (the sensor drops hands; people shift)
  start: 3, abandon: 45,
  reveal: { down: 0.035, downMax: 3, hold: 0.01, holdMax: 4, rate: 0.055, bank: 0.2, idle: 6, decay: 60, keep: 25, settle: 1, button: 0.55 },   // the wait's button: see step()
  intro: 70,
  title: 6,                                  // the chapter card
  brasa: { min: 45, target: 60, max: 75, reward: 7, spark: 20, gap: 0.8, slower: 0.2, early: 0.5, late: 0.7, pause: 3.2, lead: 1.0 },   // 24-11: the call (tok… tok… TOK; window −early/+late around the TOK)
  pinya: { min: 50, target: 75, max: 100, reward: 8, fill: 10, hold: 3, palm: 15, pack: [0.55, 0.9], net: 40 },   // 24-11: gather (pack: the fill's ramp on `pack`)
  tronc: { min: 85, target: 115, max: 145, reward: 6, period: 2.4, phrase: 4.8, rise: 0.33, wobble: 5, foot: 0.95, gain: 0.72, help: 0.5 },   // 24-11: lift and level (period: the music's pulse; phrase: gather → rise → lock)
  pom: { min: 70, target: 90, max: 120, reward: 3, climb: [21, 23, 25], empty: 12, still: 0.15, stillSpeed: 0.3 },   // still: a hand moved less than this (m) in 1 s (filtered); stillSpeed: unused since 24-11, kept for compatibility
  aleta: { window: 8, rise: 0.28, high: 1.6, quorum: 0.6, within: 2 },   // l'aleta: after the pom's reward, the group raises its hands and the castell is crowned
  hand: { size: 0.12, base: 6, span: 2 },   // the default hand width (m), how slowly a hand's baseline follows it (s), the window of `span` (m)
  crown: 25,
  festa: { min: 60, target: 76, max: 84, free: 20, echo: 48, travel: 3, window: 0.7, ghost: 12, calls: 4, gap: 0.8, lead: 1.0, pause: 3.2, early: 0.5, late: 0.7 },   // 24-11: free → echo → call → bloom
  baixada: { min: 30, target: 40, max: 50, empty: 6, lower: 0.5, gentle: 0.4, net: 12, drop: 3 },   // 24-11: the group brings it down (net: the clock lowers it in the last 12 s)
  fall: 12, acta: 40,
};

export function createScore(nWalls, opt = {}) {
  const W = Math.max(1, nWalls), T = { ...TIMES, ...(opt.times || {}) };
  const zeros = (v = 0) => Array.from({ length: W }, () => v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const S = {
    block: 'wait', phase: 'play', t: 0, tp: 0, clock: 0, pass: 0, passT: 0,
    hands: 0, count: zeros(), held: zeros(false), left: zeros(false), right: zeros(false),
    people: 2, needWalls: Math.min(W, 2), buttons: 1,       // the group as estimated, and what it sets
    progress: 0,                                             // 0..1 of the current block's goal (drives the scene)
    start: 0, reveal: 0,                                     // wait: the start ring, and how much of the start button play has revealed
    touched: 0, waves: 0, brasaStage: 'spark', waveBig: false,   // brasa
    call: { n: 0, at: 0, gap: 0.8, phase: 0, from: 0, to: 0, hits: 0, need: 2 },   // brasa: the call (24-11)
    fill: zeros(0), closed: 0,                               // pinya: each wall's circles, the circle closing
    walls: zeros(false), structure: 0,                       // the castell's structure, set when the pinya closes
    beat: 0, pulses: 0, floors: 0, floorProgress: 0, lean: zeros(0), weak: zeros(0), balance: false,   // tronc
    climber: 0, climb: 0, lightWall: -1, nextWall: -1, restless: false,                                 // pom
    phrase: 'gather', phraseT: 0, band: zeros(0.9), liftK: zeros(0), lifters: zeros(0), bases: zeros(0), level: true, wobble: 0, wobbleWall: -1,   // tronc (24-11)
    lowerK: 0, descents: 0, dropped: 0,                      // baixada (24-11)
    pinyaStage: 'palm', pack: zeros(0), packed: zeros(false), packX: zeros(0),   // pinya (24-11)
    aletaHands: 0, aletaWidth: 0,                            // l'aleta: the share of hands that rose, and how wide the crown (0..1)
    // the hands' height and spread (24-11, plan de interacción step 0): per wall, metres; 0 when the wall has no hands
    yMed: zeros(0), yL: zeros(0), yR: zeros(0),              // median height of the wall's hands: all, left of its centre, right of it
    span: zeros(0),                                          // total width of the hands inside the densest 2 m window of the wall
    rise: zeros(0),                                          // mean of how much the wall's hands rose above their baseline (m)
    strokes: [],                                             // per hand now: { stroke, wall, y, y0 (baseline), rise, disp (m moved in the last 1 s, filtered) }
    learned: {}, assist: 0,                                  // verbs the group has shown it knows (set by later steps), the colla's help 0..1
    resonance: 0, blooms: 0,                                 // festa
    festaStage: 'free', fronts: [], echoHits: 0, bloomSize: 0, bloomDur: 0,   // festa (24-11)
    outcome: null,
    values: { forca: 0, equilibri: 0, valor: 0, seny: 0 },   // the acta's four bars, 0..1
    stats: { maxHands: 0, maxFloors: 0, stillS: 0 },
    events: [],   // drained by the caller: 'block:x' 'phase:x' 'reveal' 'start' 'aleta' 'palm' 'pack:w' 'learned:x' 'lift' 'level' 'wobble' 'steady' 'slip' 'lower' 'crack' 'wave' 'awake' 'wall:n' 'close' 'pulse' 'floor' 'weak' 'balance' 'climber:n' 'arrived:n' 'crown' 'bloom' 'down' 'fall' 'hint:x' 'abandon'
  };
  const lastSeen = zeros(-1e9), lastDown = zeros(-1e9), seenL = zeros(-1e9), seenR = zeros(-1e9);
  let strokes = new Set(), peak = 0, emptyFor = 0, lastHint = -1e9, stuckFor = 0;
  let downTimes = [], waveAt = -1e9, holdAll = 0, beatT = 0, evalAt = 0, pulseAt = 0, pulsesBalanced = 0, pulsesEval = 0, fillSpeed = 0;
  let stillT = 0, pomT = 0, downT = 0, festaClusterAt = -1e9, festaCluster = 0, bloomAt = -1e9, order = [];
  let revealedAt = -1e9, onButton = 0, revealBank = 0;
  // per stroke: a baseline height and a short history (for the displacement in the last second); allocated once per stroke
  const HIST = 32, track = new Map(), strokePool = [];
  let maxDisp = 0, aletaBase = new Map(), aletaRose = new Map();
  let palmAt = -1e9, stillRun = 0, unisonSum = 0, frontId = 0, lastEcho = -1e9, festaEndAt = -1;
  const downsW = zeros(0), frontAt = zeros(-1e9);
  const learn = (k) => { if (!S.learned[k]) { S.learned[k] = true; emit('learned:' + k); } };
  let phraseClock = 0, riseBase = new Map(), wobbles = 0, firstWobbleAt = 0, wobbleT = 0, steadyT = 0, noLift = 0, levelEval = 0, levelOk = 0, descentMax = new Map(), descentFloorsLeft = 0, dropT = 0, crackedThis = false, lowerAt = -1e9;
  const wallHands = Array.from({ length: W }, () => []), spanN = zeros(0), spanTotal = zeros(0);
  function follow(h, now, dt) {
    let tr = track.get(h.stroke);
    const hasY = typeof h.y === 'number' && isFinite(h.y), y = hasY ? h.y : 0, x = h.dx || 0;
    if (!tr) { tr = { y0: y, land: now, ht: new Float64Array(HIST), hx: new Float32Array(HIST), hy: new Float32Array(HIST), n: 0, i: 0, last: -1e9, disp: 0, y, hasY }; track.set(h.stroke, tr); }
    tr.y = y; tr.hasY = hasY;
    tr.y0 += (y - tr.y0) * (1 - Math.exp(-dt / T.hand.base));
    if (now - tr.last >= 0.04) { tr.last = now; tr.ht[tr.i] = now; tr.hx[tr.i] = x; tr.hy[tr.i] = y; tr.i = (tr.i + 1) % HIST; tr.n = Math.min(HIST, tr.n + 1); }
    // displacement over the last second, filtered: the mean of the last 0.25 s against the mean of 0.75–1.25 s ago
    let ax = 0, ay = 0, an = 0, bx = 0, by = 0, bn = 0;
    for (let k = 0; k < tr.n; k++) { const a = now - tr.ht[k]; if (a <= 0.25) { ax += tr.hx[k]; ay += tr.hy[k]; an++; } else if (a >= 0.75 && a <= 1.25) { bx += tr.hx[k]; by += tr.hy[k]; bn++; } }
    tr.disp = an && bn ? Math.hypot(ax / an - bx / bn, ay / an - by / bn) : 0;
    tr.dy = an && bn ? ay / an - by / bn : 0;                       // signed: up +, down −
    return tr;
  }
  const median = (a) => { if (!a.length) return 0; a.sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

  const emit = (e) => S.events.push(e);
  function go(block) { S.block = block; S.t = 0; S.tp = 0; S.progress = 0; stuckFor = 0; emptyFor = 0;   /* 24-11: the abandon counts inside a block — after the 70 s intro (nobody touches) the brasa no longer abandons at once */ const interactive = T[block] && typeof T[block] === 'object'; S.phase = interactive && block !== 'festa' && block !== 'baixada' ? 'title' : 'play'; emit('block:' + block); emit('phase:' + S.phase); }
  function phase(p) { S.phase = p; S.tp = 0; stuckFor = 0; emit('phase:' + p); }
  function hint(key) { if (S.clock - lastHint > 25) { lastHint = S.clock; emit('hint:' + key); } }
  function reset(abandoned) {
    if (abandoned) emit('abandon');
    Object.assign(S, { festaStage: 'free', echoHits: 0, bloomSize: 0, bloomDur: 0, brasaStage: 'spark', waveBig: false, start: 0, reveal: 0, touched: 0, waves: 0, closed: 0, structure: 0, beat: 0, pulses: 0, floors: 0, floorProgress: 0, balance: false, climber: 0, climb: 0, lightWall: -1, nextWall: -1, resonance: 0, blooms: 0, outcome: null, passT: 0 });
    S.fill = zeros(0); S.walls = zeros(false); S.lean = zeros(0); S.weak = zeros(0);
    S.values = { forca: 0, equilibri: 0, valor: 0, seny: 0 }; S.stats = { maxHands: 0, maxFloors: 0, stillS: 0 };
    phraseClock = 0; wobbles = 0; levelEval = 0; levelOk = 0; S.wobble = 0; S.wobbleWall = -1; S.descents = 0; S.dropped = 0; S.lowerK = 0; revealedAt = -1e9; revealBank = 0; stillRun = 0; S.pack = zeros(0); S.packed = zeros(false); S.learned = {}; S.assist = 0; S.aletaHands = 0; S.aletaWidth = 0; peak = 0; pulsesBalanced = 0; pulsesEval = 0; fillSpeed = 0; stillT = 0; pomT = 0;
    go('wait');
  }
  const structureWalls = () => { const a = []; for (let w = 0; w < W; w++) if (S.walls[w]) a.push(w); return a; };
  function fall(outcome) { S.outcome = outcome; emit('fall'); go('fall'); }
  function finish() {       // the four values, as the group played them
    const v = S.values;
    v.forca = clamp(0.35 + 0.65 * fillSpeed, 0, 1);
    v.equilibri = pulsesEval ? clamp(pulsesBalanced / pulsesEval, 0, 1) : 0;
    v.valor = clamp((S.stats.maxFloors / 9) * 0.6 + (S.outcome === 'intent' ? 0.1 : 0.4), 0, 1);
    v.seny = clamp((pomT ? stillT / pomT : 0) * 0.6 + (S.outcome === 'descarregat' ? 0.4 : 0), 0, 1);
  }

  /** hands: the hands down now: [{ stroke, wall (index), dx (m from the wall's centre, + to the right), y (m from the floor), vx, vy (m/s),
   *  size (m), s (m along the perimeter), speed (m/s) }]. Only stroke, wall and dx are required: without y the work plays as before
   *  (heights read 0, nothing rises). */
  function step(dt, hands) {
    S.clock += dt; S.t += dt; S.tp += dt; if (S.block !== 'wait') S.passT += dt;
    const now = S.clock, seen = new Set(); let downs = 0, maxSpeed = 0;
    onButton = 0; downsW.fill(0);
    S.count.fill(0);
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      S.count[h.wall]++; lastSeen[h.wall] = now; seen.add(h.stroke);
      if ((h.dx || 0) <= 0.15) seenL[h.wall] = now; if ((h.dx || 0) >= -0.15) seenR[h.wall] = now;
      if (!strokes.has(h.stroke)) { lastDown[h.wall] = now; downs++; downsW[h.wall]++; downTimes.push(now); }
      if (h.speed > maxSpeed) maxSpeed = h.speed;
      if (Math.abs(h.dx || 0) <= T.reveal.button) onButton++;
    }
    // heights, spread and stillness (step 0)
    for (const a of wallHands) a.length = 0;
    maxDisp = 0; S.strokes.length = 0;
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      const tr = follow(h, now, dt);
      if (tr.disp > maxDisp) maxDisp = tr.disp;
      wallHands[h.wall].push(h);
      let o = strokePool[S.strokes.length]; if (!o) { o = { stroke: 0, wall: 0, y: 0, y0: 0, rise: 0, disp: 0, dy: 0 }; strokePool.push(o); }
      o.stroke = h.stroke; o.wall = h.wall; o.y = tr.y; o.y0 = tr.y0; o.rise = tr.y - tr.y0; o.disp = tr.disp; o.dy = tr.dy; S.strokes.push(o);
    }
    for (const k of track.keys()) if (!seen.has(k)) track.delete(k);
    for (let w = 0; w < W; w++) {
      const a = wallHands[w];
      if (!a.length) { S.yMed[w] = S.yL[w] = S.yR[w] = S.span[w] = S.rise[w] = 0; spanN[w] = 0; spanTotal[w] = 0; continue; }
      const ys = [], yl = [], yrr = []; let rs = 0;
      for (const h of a) { const tr = track.get(h.stroke), y = tr.y; ys.push(y); if ((h.dx || 0) <= 0) yl.push(y); else yrr.push(y); rs += y - tr.y0; }
      S.yMed[w] = median(ys); S.yL[w] = median(yl); S.yR[w] = median(yrr); S.rise[w] = rs / a.length;
      a.sort((p, q) => (p.dx || 0) - (q.dx || 0));
      let best = 0, bestN = 0, bestX = 0, total = 0;
      for (const h of a) total += h.size > 0 ? h.size : T.hand.size;
      for (let i = 0, j = 0, sum = 0; i < a.length; i++) {           // the densest window of T.hand.span metres
        sum += a[i].size > 0 ? a[i].size : T.hand.size;
        while ((a[i].dx || 0) - (a[j].dx || 0) > T.hand.span) { sum -= a[j].size > 0 ? a[j].size : T.hand.size; j++; }
        if (sum > best) { best = sum; bestN = i - j + 1; bestX = ((a[i].dx || 0) + (a[j].dx || 0)) / 2; }
      }
      S.span[w] = best; spanN[w] = bestN; spanTotal[w] = total; S.packX[w] = bestX;
    }
    strokes = seen; S.hands = seen.size; if (S.hands > S.stats.maxHands) S.stats.maxHands = S.hands;
    let heldN = 0;
    for (let w = 0; w < W; w++) { S.held[w] = now - lastSeen[w] <= T.linger; if (S.held[w]) heldN++; S.left[w] = now - seenL[w] <= T.linger; S.right[w] = now - seenR[w] <= T.linger; }
    emptyFor = S.hands ? 0 : emptyFor + dt;
    while (downTimes.length && now - downTimes[0] > 1.2) downTimes.shift();
    // the group: the most hands seen at once lately, about 1.6 hands a person on the wall
    peak = Math.max(S.hands, peak - dt * 0.05);
    S.people = clamp(Math.ceil(peak / 1.6), 2, 15);
    if (S.block === 'wait' || S.block === 'intro' || S.block === 'brasa' || (S.block === 'pinya' && S.phase === 'title')) {   // what the group sets is settled before the pinya is played
      S.needWalls = Math.min(W, S.people <= 3 ? 2 : S.people <= 7 ? 3 : 4); S.buttons = S.people <= 4 ? 1 : S.people <= 9 ? 2 : 3;
    }
    const B = T[S.block], interactive = B && typeof B === 'object';
    if (interactive && S.block !== 'festa' && emptyFor >= T.abandon) { reset(true); return S; }
    if (interactive && S.phase === 'title' && S.tp >= T.title) phase('play');
    const playing = S.phase === 'play';

    if (S.block === 'wait') {
      // the threshold. Playing (hands landing, hands on the walls) REVEALS the start button; once it is whole it stays while
      // anybody is there; then a hand on the button (the centre of a wall) fills the start ring: 3 s with two hands, 4.5 s with one.
      // What play earns goes into a small bank that pays out at most `rate` a second: two people playing reveal it in ~20–45 s,
      // a big group in no less than ~18 s (time to see the room).
      const R = T.reveal;
      if (S.reveal < 1) {
        revealBank = Math.min(R.bank, revealBank + R.down * Math.min(R.downMax, downs) + dt * R.hold * Math.min(R.holdMax, S.hands));
        const pay = Math.min(revealBank, R.rate * dt); revealBank -= pay;
        S.reveal = Math.min(1, S.reveal + pay);
        if (emptyFor >= R.idle) S.reveal = Math.max(0, S.reveal - dt / R.decay);
        if (S.reveal >= 1) { revealedAt = now; emit('reveal'); }
      } else if (emptyFor >= R.keep) S.reveal = 1 - 1e-6;               // everybody left long ago: it starts to fade again
      const pressing = S.reveal >= 1 && now - revealedAt >= R.settle && onButton > 0;
      S.start = pressing ? Math.min(1, S.start + (dt / T.start) * (onButton >= 2 ? 1 : 1 / 1.5)) : Math.max(0, S.start - dt / (T.start * 2)); S.progress = S.start;
      if (S.start >= 1) { S.pass++; emit('start'); go('intro'); }
    } else if (S.block === 'intro') {
      S.progress = S.t / T.intro; if (S.t >= T.intro) go('brasa');
    } else if (S.block === 'brasa') {
      if (playing) {
        // I. Brasa (24-11, plan step 6): first the spark (loose touches, jets, devils), then THE CALL: the room calls tok… tok… TOK
        // (gap s apart) and everybody strikes on the TOK (window −early/+late). Three calls: from one wall; from one wall answered on the
        // opposite one; on all four (the whole ring burns → 'awake'). A missed call: a small wave and the room calls again, slower.
        S.touched += downs;
        const C = S.call;
        if (S.brasaStage === 'spark') {
          S.progress = clamp(Math.min(1, S.touched / Math.min(8, S.people)) * 0.25, 0, 0.25);
          if (S.tp >= B.spark) {   // the spark lasts B.spark s (the relay of the devils comes later in the plan)
 S.brasaStage = 'call'; hint('together'); C.n = 1; C.gap = B.gap; C.from = Math.floor(Math.random() * W); C.to = C.from; C.at = now + B.lead + 2 * C.gap; C.hits = 0; C.armed = true; }
        } else {
          C.need = clamp(Math.round(S.people * 0.4), 2, 5);
          const first = C.at - 2 * C.gap;
          if (C.n > 3) { S.progress = 1; } else {
          if (C.armed && now >= first) { C.armed = false; emit('call'); }
          C.phase = now < first ? 0 : clamp((now - first) / (2 * C.gap), 0, 1);
          if (downs && now >= C.at - B.early && now <= C.at + B.late) C.hits += downs;
          if (now > C.at + B.late) {                               // judge the call
            const big = C.hits >= C.need;
            S.waveBig = big; waveAt = now; emit('wave');
            if (big) {
              S.waves++; learn('brasa');
              if (S.waves >= 3) C.n = 4;                          // the ring is whole: it wakes (not before the block's minimum)
              else { C.n++; C.gap = B.gap; C.from = (C.from + 1) % W; C.to = C.n === 2 ? (C.from + 2) % W : -1; }
            } else C.gap = Math.min(B.gap + 2 * B.slower, C.gap + B.slower);   // slower, never «again, together»
            C.at = now + B.pause + 2 * C.gap; C.hits = 0; C.armed = true;
          }
          S.progress = clamp(0.25 + Math.min(3, S.waves) * 0.25, 0, 1);
          }
        }
        stuckFor += dt; if (downs) stuckFor = Math.max(0, stuckFor - 4);
        if (S.phase === 'play' && ((S.waves >= 3 && S.t >= B.min) || S.t >= B.max - B.reward)) { emit('awake'); phase('reward'); }
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) go('pinya'); }
    } else if (S.block === 'pinya') {
      if (playing) {
        // II. Pinya = GATHER (24-11, plan step 4): palm to palm, then the figures slide to the wall's centre and the hands follow them;
        // a wall fills by how PACKED its hands are (their width inside the densest 2 m, against what the group should show there, times
        // the share of the wall's hands inside that window), not by time. From B.net s the crowd of light closes the gap (assist).
        S.pinyaStage = S.tp < B.palm ? 'palm' : 'pack';
        if (downs && now - palmAt > 0.3) { palmAt = now; emit('palm'); }
        S.assist = clamp((S.tp - B.net) / 10, 0, 1);
        let packedHands = 0;
        for (let w = 0; w < W; w++) {
          // packed = most of THIS wall's hands (≥ 80 %, at least one) inside its densest 2 m window, and that window near the wall's centre
          // (where the palms lead): one hand that followed its palm packs its wall; a group spread along the wall does not
          const frac = S.count[w] ? spanN[w] / S.count[w] : 0, near = clamp(1 - (Math.abs(S.packX[w]) - 1.0) / 0.8, 0, 1);
          S.pack[w] = S.count[w] >= 1 ? clamp((frac - 0.5) / 0.3, 0, 1) * near : 0;
          const wasPacked = S.packed[w]; S.packed[w] = S.pack[w] >= 0.9 || (wasPacked && S.pack[w] >= 0.75);
          if (S.packed[w] && !wasPacked) emit('pack:' + w);
          if (S.packed[w]) packedHands += spanN[w];
        }
        if (S.hands && packedHands >= S.hands / 2) learn('pinya');
        let full = 0, fullHeld = 0;
        for (let w = 0; w < W; w++) {
          const before = S.fill[w], r = B.pack, k = Math.max(clamp((S.pack[w] - r[0]) / (r[1] - r[0]), 0, 1), S.count[w] ? S.assist * 0.6 : 0);
          S.fill[w] = S.count[w] > 0 && k > 0 ? Math.min(1, S.fill[w] + (dt / B.fill) * k) : Math.max(0, S.fill[w] - dt / 40);
          if (before < 1 && S.fill[w] >= 1) emit('wall:' + w);
          if (S.fill[w] >= 1) { full++; if (S.held[w]) fullHeld++; }
        }
        holdAll = fullHeld >= S.needWalls ? holdAll + dt : Math.max(0, holdAll - dt * 2);
        S.closed = clamp(holdAll / B.hold, 0, 1);
        const top = S.fill.slice().sort((a, b) => b - a).slice(0, S.needWalls).reduce((a, b) => a + b, 0) / S.needWalls;
        S.progress = clamp(top * 0.8 + S.closed * 0.2, 0, 1);
        if (S.tp > 20 && full < S.needWalls) hint('more'); else if (full >= S.needWalls && S.closed < 1 && S.tp > 30) hint('hold');
        const timeUp = S.t >= B.max - B.reward;
        if ((S.closed >= 1 && S.t >= B.min) || timeUp) {
          // the structure: the walls the group holds (at least the two fullest)
          const rank = S.fill.map((f, w) => [f + (S.held[w] ? 1 : 0), w]).sort((a, b) => b[0] - a[0]);
          const n = clamp(Math.max(S.needWalls, timeUp ? 0 : fullHeld), Math.min(2, W), W);
          S.walls = zeros(false); for (let i = 0; i < n; i++) S.walls[rank[i][1]] = true; S.structure = n;
          fillSpeed = clamp(1 - (S.t - B.min) / (B.max - B.min), 0, 1);
          S.closed = 1; emit('close'); phase('reward');
        }
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) { beatT = 0; evalAt = 0; phraseClock = 0; wobbles = 0; S.wobble = 0; S.wobbleWall = -1; S.phrase = 'gather'; go('tronc'); } }
    } else if (S.block === 'tronc') {
      // III. Tronc = LIFT and LEVEL (24-11, plan step 2). Each 4.8 s phrase: gather (hands down to receive) → rise → lock. At the lock
      // every structure wall is judged on its hands' RELATIVE rise since the rise began (≥ B.rise counts as a lifter); still hands that
      // stay low are the base (they steady the tower); walls without a tower help at B.help. The lean comes from yR − yL. Once, at
      // the penultimate floor (twice if the group is well ahead), the tower WOBBLES: B.wobble s to bring hands down to its foot, or it
      // loses a floor. The pulse stays as the music's clock ('pulse', beat).
      const sw = structureWalls(), inSW = (w) => S.walls[w];
      S.balance = S.floors >= 3;
      for (const w of sw) {           // a tower leans to the side that is lower (or that nobody holds)
        let target = 0;
        if (S.balance) {
          if (S.left[w] && S.right[w]) target = S.count[w] >= 2 && S.yL[w] && S.yR[w] ? clamp((S.yL[w] - S.yR[w]) / 0.4, -1, 1) : 0;
          else target = S.left[w] ? 1 : S.right[w] ? -1 : Math.sin(now * 0.7 + w * 1.9);
        }
        if (S.wobbleWall === w && S.wobble > 0) target = Math.sign(target || 1) * Math.max(Math.abs(target), 0.6 + 0.3 * Math.sin(now * 3.1));
        S.lean[w] += (target - S.lean[w]) * (1 - Math.exp(-dt * 0.8));
      }
      S.level = sw.every((w) => Math.abs(S.lean[w]) < 0.45);
      for (let w = 0; w < W; w++) if (S.count[w]) S.band[w] += (S.yMed[w] - S.band[w]) * (1 - Math.exp(-dt * 6));   // the shoulders follow the hands
      if (playing) {
        beatT += dt;
        if (beatT >= B.period) { beatT -= B.period; S.pulses++; emit('pulse'); }
        S.beat = beatT / B.period;
        if (S.wobble > 0) {                                   // the tower trembles: hands to its foot, or it slips
          wobbleT += dt; S.wobble = clamp(wobbleT / B.wobble, 0.001, 1);
          let foot = 0; for (const o of S.strokes) if (o.wall === S.wobbleWall && (o.y < B.foot || o.y === 0)) foot++;
          steadyT = foot ? steadyT + dt : Math.max(0, steadyT - dt * 0.5);
          if (steadyT >= 1) { emit('steady'); S.wobble = 0; S.wobbleWall = -1; phraseClock = 0; }
          else if (wobbleT >= B.wobble) { emit('slip'); S.floors = Math.max(0, S.floors - 1); S.floorProgress = 0; S.wobble = 0; S.wobbleWall = -1; phraseClock = 0; }
          if (wobbleT > 1.5 && !foot) hint('foot');
        } else {
          phraseClock += dt;
          const f = phraseClock / B.phrase, g0 = 0.25, r0 = 0.75;      // gather 0–1.2 s · rise 1.2–3.6 s · lock 3.6–4.8 s
          const ph = f < g0 ? 'gather' : f < r0 ? 'rise' : 'lock';
          S.phraseT = clamp(f, 0, 1);
          if (ph === 'rise' && S.phrase !== 'rise') { riseBase.clear(); for (const o of S.strokes) riseBase.set(o.stroke, o.y); }
          if (ph === 'rise' || ph === 'lock') {
            const per = zeros(0), up = zeros(0), bs = zeros(0), n = zeros(0);
            for (const o of S.strokes) {
              if (!riseBase.has(o.stroke)) riseBase.set(o.stroke, o.y);
              const r = o.y - riseBase.get(o.stroke); n[o.wall]++;
              per[o.wall] += r; if (r >= B.rise) up[o.wall]++; else if (o.disp < 0.15) bs[o.wall]++;
            }
            for (let w = 0; w < W; w++) { S.liftK[w] = n[w] ? clamp(per[w] / n[w] / B.rise, 0, 1) : 0; S.lifters[w] = up[w]; S.bases[w] = bs[w]; }
          }
          if (ph === 'lock' && S.phrase === 'rise') {          // the lock: judge the phrase
            let sum = 0, helpSum = 0, helpN = 0, lifted = 0;
            for (let w = 0; w < W; w++) {
              const k = S.count[w] ? clamp((S.lifters[w] / S.count[w]) * 1.5, 0, 1) : 0;
              if (inSW(w)) {
                const g = S.count[w] ? Math.max(k, 0.15 + (S.bases[w] ? 0.05 : 0)) * (S.balance && Math.abs(S.lean[w]) >= 0.45 ? 0.4 : 1) : 0;
                S.weak[w] = g === 0 ? Math.min(3, S.weak[w] + 1) : S.bases[w] || S.lifters[w] ? 0 : S.weak[w];
                sum += g; if (k > 0.5) lifted++;
              } else if (S.count[w]) { helpSum += k; helpN++; }
            }
            const gain = clamp(sum / Math.max(1, sw.length) + (helpN ? (B.help * helpSum) / helpN / Math.max(1, sw.length) : 0), 0, 1);
            const assist = S.t > B.target ? clamp((S.t - B.target) / Math.max(1, B.max - B.reward - B.target), 0, 1) : 0;
            S.assist = assist;
            if (lifted === sw.length && sw.length) { emit('lift'); learn('tronc'); }
            if (S.balance) { levelEval++; if (S.level) { levelOk++; emit('level'); } else emit('balance'); }
            if (gain < 0.3) { emit('weak'); noLift++; if (noLift >= 2) hint(S.balance && !S.level ? 'straight' : 'lift'); } else noLift = 0;
            S.floorProgress += ((gain + assist * 2.6) * B.gain) / (1 + 0.12 * S.floors);
            if (S.floorProgress >= 1 && S.floors < 9) {
              S.floorProgress = Math.min(0.5, S.floorProgress - 1); S.floors++; S.stats.maxFloors = Math.max(S.stats.maxFloors, S.floors); emit('floor');
              const first = wobbles === 0 && (S.floors === 7 || (S.floors >= 4 && S.t >= B.target - 10));   // the penultimate floor (or late)
              const second = wobbles === 1 && S.floors === 8 && firstWobbleAt < B.target - 30;               // twice if the group is well ahead
              if (first || second) { if (!wobbles) firstWobbleAt = S.t; wobbles++; S.wobble = 0.001; wobbleT = 0; steadyT = 0; S.wobbleWall = sw[Math.floor(Math.random() * sw.length)] ?? 0; emit('wobble'); }
            }
            S.progress = clamp((S.floors + S.floorProgress) / 9, 0, 1);
            pulsesEval = levelEval; pulsesBalanced = levelOk;                 // the acta's equilibri: the share of locks with every tower straight
          }
          if (phraseClock >= B.phrase) phraseClock -= B.phrase;
          S.phrase = ph;
        }
        if (S.wobble === 0 && ((S.floors >= 9 && S.t >= B.min) || (S.t >= B.target && S.floors >= 7) || S.t >= B.max - B.reward)) phase('reward');
      } else if (S.phase === 'reward') { if (S.tp >= B.reward) { S.climber = 0; S.climb = 0; order = structureWalls(); go('pom'); } }
    } else if (S.block === 'pom') {
      if (playing) {
        pomT += dt;
        // the light goes round the structure's walls; it passes only where hands are still
        const n = order.length, seg = Math.min(n - 1, Math.floor(S.climb * n)), w = order[seg];
        S.lightWall = w; S.nextWall = order[(seg + 1) % n];
        const heldHere = now - lastSeen[w] <= 1;
        S.restless = heldHere && maxDisp > B.still;     // moved more than `still` in the last second (filtered); a lost stroke is absent, not restless
        if (!(heldHere && !S.restless)) stillRun = 0;
        if (heldHere && !S.restless) { S.climb += dt / B.climb[S.climber]; stillT += dt; S.stats.stillS += dt; stillRun += dt; if (stillRun >= 4) learn('pom'); }
        else if (!heldHere) { S.climb = Math.max(0, S.climb - (dt / B.climb[S.climber]) * 0.3); if (S.tp > 8) hint('still'); }
        const late = S.t > B.target; if (late) S.climb += dt / 25;                            // past its time the light finds its way
        if (S.climb >= 1) { emit('arrived:' + S.climber); if (S.climber < 2) { S.climber++; S.climb = 0; emit('climber:' + S.climber); } else { S.climb = 1; phase('reward'); } }
        S.progress = clamp((S.climber + Math.min(1, S.climb)) / 3, 0, 1);
        if (S.phase === 'play' && ((emptyFor >= B.empty) || (S.t >= B.max && S.progress < 0.5))) fall('intent');
        else if (S.phase === 'play' && S.t >= B.max) phase('reward');
      } else if (S.phase === 'reward') {
        S.progress = 1;
        if (S.tp >= B.reward) { phase('aleta'); aletaBase.clear(); aletaRose.clear(); for (const o of S.strokes) aletaBase.set(o.stroke, o.y); }
      } else if (S.phase === 'aleta') {
        // l'aleta (24-11, plan step 1): the enxaneta raises her hand; every hand that rises ≥ `rise` above where it was when the window
        // opened (or where it landed, if later), or that goes above `high`, counts. The castell is crowned when most of the hands
        // present (`quorum`) rose within `within` s — or at the end of the window, always. aletaWidth: wider the more and the sooner.
        const A = T.aleta;
        S.progress = 1;
        let present = 0, risen = 0, recent = 0;
        for (const o of S.strokes) {
          present++;
          if (!aletaBase.has(o.stroke)) aletaBase.set(o.stroke, o.y);
          if (!aletaRose.has(o.stroke) && (o.y - aletaBase.get(o.stroke) >= A.rise || o.y > A.high)) aletaRose.set(o.stroke, now);
          const at = aletaRose.get(o.stroke);
          if (at !== undefined) { risen++; if (now - at <= A.within) recent++; }
        }
        S.aletaHands = present ? risen / present : 0;
        if ((present && recent / present >= A.quorum) || S.tp >= A.window) {
          S.aletaWidth = clamp(0.15 + 0.85 * S.aletaHands * (1 - 0.5 * Math.min(1, S.tp / A.window)), 0, 1);
          if (S.aletaHands >= 0.5) learn('aleta');
          emit('aleta'); emit('crown'); go('crown');
        }
      }
      else if (S.phase === 'title' && S.tp < dt * 1.5) emit('climber:0');
    } else if (S.block === 'crown') {
      S.progress = S.t / T.crown; if (S.t >= T.crown) { S.resonance = 0; go('festa'); }
    } else if (S.block === 'festa') {
      // V. La ressonància (24-11, plan step 7): FREE (play; hands that land together add up, as before) → ECHO (each wave travels to the
      // opposite wall as a visible front, arriving after B.travel s; a hand on that wall within ±B.window of the arrival returns it
      // doubled; if nobody returns one in B.ghost s the room does) → THE CALL (Brasa's tok… tok… TOK on all four walls, B.calls times,
      // each bigger) → the BLOOM, always, on the last call: its size and length by `resonance` (how together the group was).
      if (S.t < dt * 1.5) { unisonSum = 0; S.fronts.length = 0; S.echoHits = 0; S.bloomSize = 0; S.bloomDur = 0; festaEndAt = -1; lastEcho = now; S.call.n = 0; }
      S.festaStage = festaEndAt >= 0 ? 'bloom' : S.t < B.free ? 'free' : S.t < B.echo ? 'echo' : 'call';
      if (downs) { if (now - festaClusterAt <= 0.5) festaCluster += downs; else { festaClusterAt = now; festaCluster = downs; } S.resonance += festaCluster >= 2 ? (0.2 * downs) / S.people : 0.01; }
      S.resonance = clamp(S.resonance + dt * (0.004 * Math.min(12, S.hands) - 0.03), 0, 1.2);
      const opp = (w) => (W >= 4 ? (w + 2) % W : (w + 1) % W);
      // the fronts: returns first (a hand on the arrival wall, at the arrival), then new fronts from the other landings
      const used = zeros(0);
      for (let i = S.fronts.length - 1; i >= 0; i--) {
        const f = S.fronts[i];
        if (downsW[f.to] - used[f.to] > 0 && Math.abs(now - f.arrive) <= B.window) {
          used[f.to]++; S.fronts.splice(i, 1); S.echoHits++; learn('festa'); lastEcho = now; S.resonance += 0.12 / Math.sqrt(S.people);
          if (S.fronts.length < 12) S.fronts.push({ id: ++frontId, from: f.to, to: f.from, at: now, arrive: now + B.travel, gen: Math.min(4, f.gen + 1), ghost: false });
          emit('echo');
        } else if (now > f.arrive + B.window) {
          S.fronts.splice(i, 1);
          if (S.festaStage === 'echo' && now - lastEcho > B.ghost) {   // nobody returned one for a while: the room returns it
            lastEcho = now; S.fronts.push({ id: ++frontId, from: f.to, to: f.from, at: now, arrive: now + B.travel, gen: Math.min(4, f.gen + 1), ghost: true }); emit('ghost');
          }
        }
      }
      if (S.festaStage === 'echo') for (let w = 0; w < W; w++) if (downsW[w] - used[w] > 0 && now - frontAt[w] > 0.6 && S.fronts.length < 12) { frontAt[w] = now; S.fronts.push({ id: ++frontId, from: w, to: opp(w), at: now, arrive: now + B.travel, gen: 0, ghost: false }); emit('front'); }
      // the call
      const C = S.call;
      if (S.festaStage === 'call') {
        if (C.n === 0) { C.n = 1; C.gap = B.gap; C.from = 0; C.to = -1; C.at = now + B.lead + 2 * C.gap; C.hits = 0; C.armed = true; S.fronts.length = 0; }
        C.need = clamp(Math.round(S.people * 0.4), 2, 5);
        const first = C.at - 2 * C.gap;
        if (C.armed && now >= first) { C.armed = false; emit('call'); }
        C.phase = now < first ? 0 : clamp((now - first) / (2 * C.gap), 0, 1);
        if (downs && now >= C.at - B.early && now <= C.at + B.late) C.hits += downs;
        if (now > C.at + B.late) {
          const k = Math.min(1, C.hits / C.need); S.resonance += 0.22 * k; S.waveBig = k >= 1; unisonSum += k; emit('wave');
          if (C.n >= B.calls) {                                       // the last one: the room flowers, always
            // how together they were: the calls hit in unison (½), the echoes returned (0.3), the base (0.2)
            S.bloomSize = clamp(0.2 + 0.5 * (unisonSum / B.calls) + 0.3 * Math.min(1, S.echoHits / 6), 0, 1); S.bloomDur = 4 + 4 * S.bloomSize;
            bloomAt = now; S.blooms++; emit('bloom'); festaEndAt = now + S.bloomDur; C.n = B.calls + 1;
          } else { C.n++; C.at = now + B.pause + 2 * C.gap; C.hits = 0; C.armed = true; }
        }
      }
      S.progress = clamp(S.resonance, 0, 1);
      if ((festaEndAt >= 0 && now >= festaEndAt) || S.t >= B.max) {
        if (!S.blooms) { S.bloomSize = clamp(0.2 + 0.5 * (unisonSum / B.calls) + 0.3 * Math.min(1, S.echoHits / 6), 0, 1); S.bloomDur = 0; S.blooms++; emit('bloom'); }   // never leaves without its bloom
        downT = 0; go('baixada');
      }
    } else if (S.block === 'baixada') {
      // La bajada = BRING IT DOWN (24-11, plan step 3). The hands on the structure's walls carry the band down: a descent is complete
      // when their median drop from the highest point since it began reaches B.lower; it brings down two floors. Gentle (≤ B.gentle m/s)
      // is clean; abrupt, or letting go, CRACKS. B.drop descents dropped in a row (all hands gone from the tower mid-descent) = carregat.
      // The clock only lowers it as a net in the last B.net s; the last floor never comes down before `min`.
      const sw = structureWalls(), anyHeld = sw.some((w) => S.held[w]);
      if (S.t < dt * 1.5) { descentMax.clear(); crackedThis = false; dropT = 0; S.descents = 0; S.dropped = 0; downT = 0; }
      if (!anyHeld && emptyFor >= B.empty && S.floors > 2) { fall('carregat'); return S; }
      const drops = [];
      for (const o of S.strokes) {
        if (!S.walls[o.wall]) continue;
        const m = Math.max(descentMax.get(o.stroke) ?? o.y, o.y); descentMax.set(o.stroke, m);
        drops.push(m - o.y);
        if (o.dy < -B.gentle && !crackedThis && S.lowerK > 0.1) { crackedThis = true; emit('crack'); }
      }
      for (const k of descentMax.keys()) if (!strokes.has(k)) descentMax.delete(k);
      S.lowerK = drops.length ? clamp(median(drops) / B.lower, 0, 1) : S.lowerK;
      for (let w = 0; w < W; w++) if (S.count[w]) S.band[w] += (S.yMed[w] - S.band[w]) * (1 - Math.exp(-dt * 6));
      const lowerFloors = (n) => { for (let i = 0; i < n && S.floors > (S.t < B.min ? 1 : 0); i++) { S.floors--; emit('down'); } };
      // let go in the middle of a descent: it drops (two floors, a crack); three in a row and it falls
      if (S.lowerK > 0.15 && !sw.some((w) => S.count[w])) { dropT += dt; if (dropT >= 1) { dropT = 0; S.dropped++; emit('crack'); lowerFloors(2); S.lowerK = 0; descentMax.clear(); crackedThis = false; if (S.dropped >= B.drop) { fall('carregat'); return S; } } } else dropT = 0;
      if (S.lowerK >= 1) {                                      // a descent, complete
        S.descents++; if (!crackedThis) S.dropped = 0; emit('lower'); learn('baixada'); lowerFloors(2);
        S.lowerK = 0; descentMax.clear(); for (const o of S.strokes) descentMax.set(o.stroke, o.y); crackedThis = false;
      }
      if (S.t >= B.max - B.net) { downT += dt; const every = Math.max(0.6, (B.max - S.t) / Math.max(1, S.floors + 0.5)); if (downT >= every) { downT = 0; lowerFloors(1); } }   // the net
      if (S.floors === 0 || S.t >= B.max) { S.floors = 0; S.outcome = 'descarregat'; finish(); go('acta'); }
      S.progress = 1 - S.floors / Math.max(1, S.stats.maxFloors);
    } else if (S.block === 'fall') {
      S.progress = S.t / T.fall; if (S.t >= T.fall) { S.floors = 0; finish(); go('acta'); }
    } else if (S.block === 'acta') {
      S.progress = S.t / T.acta; if (S.t >= T.acta) reset(false);
    }
    return S;
  }

  /** The line of the acta, as the colles write it: "3 de 7 · descarregat". */
  function acta() {
    const kind = S.structure === 1 ? 'pilar' : String(S.structure || 0);
    return { castell: `${kind} de ${S.stats.maxFloors}`, structure: STRUCTURES[S.structure] || '', floors: S.stats.maxFloors, outcome: S.outcome, hands: S.stats.maxHands, people: S.people, stillS: Math.round(S.stats.stillS), values: { ...S.values } };
  }
  /** Rehearsal: go to a block with a plausible state. */
  function jump(block) {
    if (!BLOCKS.includes(block)) return;
    if (block === 'wait') { reset(false); return; }
    const after = (b) => BLOCKS.indexOf(block) > BLOCKS.indexOf(b);
    if (after('pinya') && !S.structure) { const n = Math.min(W, Math.max(2, S.needWalls)); S.walls = zeros(false); for (let w = 0; w < n; w++) S.walls[w] = true; S.structure = n; S.fill = S.walls.map((v) => (v ? 1 : 0)); S.closed = 1; }
    if (after('tronc') && S.floors < 5) { S.floors = 7; S.stats.maxFloors = Math.max(S.stats.maxFloors, 7); }
    if (block === 'brasa') { S.brasaStage = 'spark'; S.waves = 0; S.touched = 0; S.call.n = 0; S.waveBig = false; }
    if (block === 'tronc') { S.floors = 0; S.floorProgress = 0; beatT = 0; evalAt = 0; phraseClock = 0; wobbles = 0; S.wobble = 0; S.wobbleWall = -1; }
    if (block === 'pom') { S.climber = 0; S.climb = 0; order = structureWalls(); }
    if (block === 'fall') S.outcome = S.outcome || 'intent';
    if (block === 'acta') { S.outcome = S.outcome || 'descarregat'; finish(); }
    if (block === 'baixada') downT = 0;
    go(block);
  }
  return { state: S, step, acta, jump, times: T };
}
