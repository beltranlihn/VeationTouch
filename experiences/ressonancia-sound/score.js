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
//   pom      AIR AND NIGHT   Valor: three climbs — the relay (still hands pass the light), the breath (the whole room still),
//                            the silence (nobody moves)                                -> three climbers reach the top
//   crown    LIGHT           l'aleta, 25 s, pre-designed
//   festa    RESONANCE       free: the room resonates with the hands
//   baixada  Seny: keep holding while it comes down                               -> descarregat | carregat
//   fall     it fell before the crown (intent) or on the way down (carregat)
//   acta     the group's castell and its four values, 40 s; every hand that rests leaves a gold handprint; then back to wait
//
// Every interactive block has three phases: 'title' (the chapter card and the voice: teach), 'play', 'reward' (the payoff and the
// way out). A block never ends before its minimum and never lasts beyond its maximum: a pass is always about ten minutes.
// The group is estimated from the hands seen (2 to 15 people) and sets how much each goal asks.
export const BLOCKS = ['wait', 'intro', 'brasa', 'pinya', 'tronc', 'pom', 'crown', 'festa', 'baixada', 'fall', 'acta'];
export const FLOOR_NAMES = ['Baixos', 'Segons', 'Terços', 'Quarts', 'Quints', 'Sisens', 'Setens', 'Vuitens', 'Novens'];
export const CLIMBERS = ['Dosos', 'Acotxador', 'Enxaneta'];
export const POM_STAGES = ['relay', 'breath', 'silence'];   // T-050: the three climbs are three different gestures
export const STRUCTURES = ['', 'pilar', 'torre', 'tres', 'quatre'];

export const TIMES = {                       // seconds
  linger: 2,                                 // a wall stays "held" this long after its last hand (the sensor drops hands; people shift)
  start: 3, abandon: 45, dup: 0.1,   // dup: a new stroke within this (m) of a live one on its wall is the same hand (folded, 24-11)
  reveal: { down: 0.035, downMax: 3, hold: 0.02, holdMax: 4, rate: 0.055, soloRate: 0.08, bank: 0.2, idle: 6, decay: 60, keep: 25, settle: 1, button: 0.55 },   // the wait's button: see step()
  intro: 70,
  title: 6,                                  // the chapter card
  brasa: { min: 45, target: 60, max: 75, reward: 7, spark: 12, gap: 0.8, slower: 0.2, early: 0.5, late: 0.7, pause: 3.2, lead: 1.0,   // 24-11: the call (tok… tok… TOK; window −early/+late around the TOK)
    relayReach: 2.5, relayRun: 1.2, relayCrawl: 0.08, relayStall: 6, relayFetch: 0.9, relayMax: 30, relayNear: 0.15 },   // T-055 the relay (spark 20 → 12): see notas/ENT.md › T-055
  pinya: { min: 50, target: 75, max: 100, reward: 8, fill: 10, hold: 3, palm: 15, pack: [0.55, 0.9], net: 40, nearFull: 1.8, nearZero: 3 },   // nearFull/nearZero (T-050, tunable): the packed window counts fully up to nearFull m from the wall's centre, 0 at nearZero   // 24-11: gather (pack: the fill's ramp on `pack`)
  tronc: { min: 85, target: 115, max: 145, reward: 6, period: 2.4, phrase: 4.8, rise: 0.33, wobble: 5, foot: 0.95, gain: 0.72, help: 0.5, base: 0.15 },   // base (T-050, tunable): a hand that did not lift and moved < base m in 1 s is the tower's base   // 24-11: lift and level (period: the music's pulse; phrase: gather → rise → lock)
  pom: { min: 70, target: 90, max: 120, reward: 1.5, climb: [38, 16, 10], rest: 7, empty: 20, still: 0.15, stillSpeed: 0.3,   // still: a hand moved less than this (m) in 1 s (filtered); stillSpeed: unused since 24-11, kept for compatibility
    relay: { every: 4, fly: 1.5, ready: 1, falter: 1.2, cost: 0.04, gone: 1, thread: 24 },   // T-050 the relay: seek the next still hand after `every` s held; a still hand is `ready` after 1 s; the holder moving for `falter` s sends it back (she slips `cost`)
    breath: { slow: 0.7, more: 0.35, many: 4 }, gust: 0.35, gustGap: 1.5, breakGap: 1.2, breakCost: 0.06 },   // breath: speed = share² × (slow + more·(still hands − 1)/many); a gust: a hand moved > gust m in 1 s; the silence: a move costs breakCost
  print: { from: 3, to: 15, rest: 0.5, max: 60, near: 0.15 },   // T-050 the acta's handprints: a hand resting ≥ rest s between from and to leaves one (not two within `near` m)
  aleta: { window: 10, rise: 0.28, high: 1.6, highAfter: 2, quorum: 0.6, within: 2 },   // l'aleta: after the pom's reward, the group raises its hands and the castell is crowned
  hand: { size: 0.12, base: 6, span: 2, moved: 0.1, recent: 2 },   // moved/recent: a hand already down counts half at a call's TOK if it moved > moved m or landed < recent s ago   // the default hand width (m), how slowly a hand's baseline follows it (s), the window of `span` (m)
  crown: 25,
  festa: { min: 60, target: 76, max: 84, free: 20, echo: 48, travel: 3, window: 0.7, ghost: 12, calls: 4, gap: 0.8, lead: 1.0, pause: 3.2, early: 0.5, late: 0.7 },   // 24-11: free → echo → call → bloom
  baixada: { min: 30, target: 40, max: 50, empty: 10, lower: 0.35, gentle: 0.4, net: 12, drop: 3, outside: 0.5 },   // 24-11: the group brings it down (net: the clock lowers it in the last 12 s)
  fall: 12, acta: 40,
};

export function createScore(nWalls, opt = {}) {
  const W = Math.max(1, nWalls), T = { ...TIMES, ...(opt.times || {}) };
  const zeros = (v = 0) => Array.from({ length: W }, () => v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // T-055 the room along its perimeter (m): each wall's length and where it starts (P4 = 0 in the XR Lab), the same frame as a hand's `s`
  const LEN = Array.from({ length: W }, (_, w) => (opt.lengths && opt.lengths[w] > 0 ? opt.lengths[w] : W === 4 ? [7.33, 6.483, 7.353, 6.411][w] : 6.9));
  const S0 = LEN.reduce((a, l, w) => { a.push(w ? a[w - 1] + LEN[w - 1] : 0); return a; }, []), PER = LEN.reduce((a, b) => a + b, 0);
  const wrapP = (x) => ((x % PER) + PER) % PER;
  const perimOf = (wall, dx) => wrapP(S0[wall] + LEN[wall] / 2 + (dx || 0));
  const wallAtS = (x) => { x = wrapP(x); for (let w = W - 1; w >= 0; w--) if (x >= S0[w]) return w; return 0; };
  const relayFresh = () => ({ s: 0, lap: 0, holderWall: -1, holder: null, y: 1.1, speed: 0, target: null, stall: 0, assist: false, jumps: 0, corners: 0, jump: null, corner: null, done: false, s0: 0, perimeter: PER });
  const S = {
    block: 'wait', phase: 'play', t: 0, tp: 0, clock: 0, pass: 0, passT: 0,
    hands: 0, count: zeros(), held: zeros(false), left: zeros(false), right: zeros(false),
    people: 2, needWalls: Math.min(W, 2), buttons: 1,       // the group as estimated, and what it sets
    solo: false, warn: null,                                 // 24-11: one person (peak of hands ≤ 2); a warning at half a deadline
    progress: 0,                                             // 0..1 of the current block's goal (drives the scene)
    start: 0, reveal: 0,                                     // wait: the start ring, and how much of the start button play has revealed
    touched: 0, waves: 0, brasaStage: 'spark', waveBig: false,   // brasa
    call: { n: 0, at: 0, gap: 0.8, phase: 0, from: 0, to: 0, hits: 0, need: 2 },   // brasa: the call (24-11)
    relay: null,                                             // T-055 brasa: the relay (set below; notas/ENT.md › T-055)
    lamp: null, lamps: [], lampN: 0,                         // T-055 intro: the lamp a landing hand lights (lamp:w)
    fill: zeros(0), closed: 0,                               // pinya: each wall's circles, the circle closing
    walls: zeros(false), structure: 0,                       // the castell's structure, set when the pinya closes
    beat: 0, pulses: 0, floors: 0, floorProgress: 0, lean: zeros(0), weak: zeros(0), balance: false,   // tronc
    climber: 0, climb: 0, lightWall: -1, nextWall: -1, restless: false,                                 // pom
    // T-050 the three climbs (notas/ENT.md › T-050). A position = { stroke, wall, dx, y, s }
    pomStage: 'relay', pomRest: 0, pomHolder: null, pomFrom: null, pomFly: 1, pomFalter: 0, pomThread: [], pomHandoffs: 0, pomHandoff: null,
    pomBreath: 0, pomGust: 0, pomHush: 0,
    prints: [], printOpen: false,                            // T-050 the acta's handprints: { wall, dx, y, s, size, t }
    phrase: 'gather', phraseT: 0, band: zeros(0.9), liftK: zeros(0), lifters: zeros(0), bases: zeros(0), level: true, wobble: 0, wobbleWall: -1,   // tronc (24-11)
    lowerK: 0, descents: 0, dropped: 0,                      // baixada (24-11)
    pinyaStage: 'palm', pack: zeros(0), packed: zeros(false), packX: zeros(0),   // pinya (24-11)
    aletaHands: 0, aletaWidth: 0,                            // l'aleta: the share of hands that rose, and how wide the crown (0..1)
    // the hands' height and spread (24-11, plan de interacción step 0): per wall, metres; 0 when the wall has no hands
    yMed: zeros(0), yL: zeros(0), yR: zeros(0),              // median height of the wall's hands: all, left of its centre, right of it
    span: zeros(0),                                          // total width of the hands inside the densest 2 m window of the wall
    rise: zeros(0),                                          // mean of how much the wall's hands rose above their baseline (m)
    strokes: [],                                             // per hand now: { stroke, wall, dx, s, size, y, y0 (baseline), rise, disp (m moved in the last 1 s, filtered), still (s still in a row) }
    learned: {}, assist: 0,                                  // verbs the group has shown it knows (set by later steps), the colla's help 0..1
    resonance: 0, blooms: 0,                                 // festa
    festaStage: 'free', fronts: [], echoHits: 0, bloomSize: 0, bloomDur: 0,   // festa (24-11)
    outcome: null,
    values: { forca: 0, equilibri: 0, valor: 0, seny: 0 },   // the acta's four bars, 0..1
    stats: { maxHands: 0, maxFloors: 0, stillS: 0 },
    events: [],   // drained by the caller (T-055: + 'lamp:w' 'relay:start' 'relay:jump' 'relay:assist' 'relay:lap' 'corner'): 'block:x' 'phase:x' 'reveal' 'start' 'aleta' 'palm' 'pack:w' 'learned:x' 'lift' 'level' 'wobble' 'steady' 'slip' 'lower' 'crack' 'wave' 'awake' 'wall:n' 'close' 'pulse' 'floor' 'weak' 'balance' 'climber:n' 'arrived:n' 'handoff:w' 'falter' 'gust:w' 'hush:break:w' 'print:w' 'crown' 'bloom' 'down' 'fall' 'hint:x' 'abandon'
  };
  S.relay = relayFresh();
  let relayR = 0;                                                        // T-055 the runner, unwrapped (m)
  const landed = [], lampAt = zeros(-1e9);                               // T-055 the hands that landed this step; a wall's last lamp
  const lastSeen = zeros(-1e9), lastDown = zeros(-1e9), seenL = zeros(-1e9), seenR = zeros(-1e9);
  let strokes = new Set(), peak = 0, emptyFor = 0, lastHint = -1e9, stuckFor = 0;
  let downTimes = [], waveAt = -1e9, holdAll = 0, beatT = 0, evalAt = 0, pulseAt = 0, pulsesBalanced = 0, pulsesEval = 0, fillSpeed = 0;
  let stillT = 0, pomT = 0, downT = 0, festaClusterAt = -1e9, festaCluster = 0, bloomAt = -1e9, order = [];
  let revealedAt = -1e9, onButton = 0, revealBank = 0;
  let holderId = null, holdT = 0, goneT = 0, gustAt = -1e9, breakAt = -1e9, falterAt = -1e9, cracksB = 0;   // T-050 the pom's climbs; the bajada's cracks (Seny)
  const printed = new Set();                                                                                // T-050 the strokes that left a print
  // per stroke: a baseline height and a short history (for the displacement in the last second); allocated once per stroke
  const HIST = 56, track = new Map(), strokePool = [];
  let maxDisp = 0, aletaBase = new Map(), aletaRose = new Map();
  let palmAt = -1e9, stillRun = 0, unisonSum = 0, frontId = 0, lastEcho = -1e9, festaEndAt = -1;
  const downsW = zeros(0), frontAt = zeros(-1e9);
  const learn = (k) => { if (!S.learned[k]) { S.learned[k] = true; emit('learned:' + k); } };
  let phraseClock = 0, riseBase = new Map(), riseMax = new Map(), wobbles = 0, firstWobbleAt = 0, wobbleT = 0, steadyT = 0, noLift = 0, levelEval = 0, levelOk = 0, descentMax = new Map(), descentFloorsLeft = 0, dropT = 0, crackedThis = false, lowerAt = -1e9;
  const wallHands = Array.from({ length: W }, () => []), spanN = zeros(0), spanTotal = zeros(0);
  function follow(h, now, dt) {
    let tr = track.get(h.stroke);
    const hasY = typeof h.y === 'number' && isFinite(h.y), y = hasY ? h.y : 0, hasS = typeof h.s === 'number' && isFinite(h.s);
    if (!tr) { tr = { y0: y, land: now, ht: new Float64Array(HIST), hx: new Float32Array(HIST), hy: new Float32Array(HIST), n: 0, i: 0, last: -1e9, disp: 0, y, hasY, su: hasS ? h.s : h.dx || 0, s: hasS ? h.s : 0 }; track.set(h.stroke, tr); }
    // the position along the room: the perimeter `s`, unwrapped (crossing a corner or the P3|P4 seam is not a jump); dx without s
    if (hasS) { const ds = h.s - tr.s; tr.su += Math.abs(ds) > 5 ? 0 : ds; tr.s = h.s; } else tr.su = h.dx || 0;
    const x = tr.su;
    tr.y = y; tr.hasY = hasY;
    tr.y0 += (y - tr.y0) * (1 - Math.exp(-dt / T.hand.base));
    if (now - tr.last >= 0.04) { tr.last = now; tr.ht[tr.i] = now; tr.hx[tr.i] = x; tr.hy[tr.i] = y; tr.i = (tr.i + 1) % HIST; tr.n = Math.min(HIST, tr.n + 1); }
    // displacement over the last second, filtered: the mean of the last 0.25 s against the mean of 0.75–1.25 s ago
    let ax = 0, ay = 0, an = 0, bx = 0, by = 0, bn = 0;
    for (let k = 0; k < tr.n; k++) { const a = now - tr.ht[k]; if (a <= 0.25) { ax += tr.hx[k]; ay += tr.hy[k]; an++; } else if (a >= 0.75 && a <= 1.25) { bx += tr.hx[k]; by += tr.hy[k]; bn++; } }
    tr.disp = an && bn ? Math.hypot(ax / an - bx / bn, ay / an - by / bn) : 0;
    tr.dy = an && bn ? ay / an - by / bn : 0;                       // signed: up +, down −
    tr.still = tr.disp <= T.pom.still ? (tr.still || 0) + dt : 0;   // T-050: seconds still in a row
    return tr;
  }
  // a call's count (24-11, #9): landings from the first tok to TOK + late, PLUS, at the TOK, the hands already down that moved more
  // than T.hand.moved in the last second or landed less than T.hand.recent s ago (half each: the sensor cannot see a press)
  function callCount(C, B, now, downs) {
    const first = C.at - 2 * C.gap;
    if (downs && now >= first && now <= C.at + B.late) C.hits += downs;
    if (!C.tokDone && now >= C.at) {
      C.tokDone = true;
      for (const o of S.strokes) { const tr = track.get(o.stroke); if (tr && tr.land < first && (o.disp > T.hand.moved || now - tr.land < T.hand.recent)) C.hits += 0.5; }
    }
  }
  const minY = (tr, now, secs) => { let m = tr.y; for (let k = 0; k < tr.n; k++) if (now - tr.ht[k] <= secs && tr.hy[k] < m) m = tr.hy[k]; return m; };
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
    S.relay = relayFresh(); S.lamp = null; S.lamps = []; S.lampN = 0;   // T-055
    S.prints = []; printed.clear(); S.printOpen = false; S.pomThread = []; S.pomHolder = null; S.pomHandoff = null; cracksB = 0;
    phraseClock = 0; wobbles = 0; levelEval = 0; levelOk = 0; S.wobble = 0; S.wobbleWall = -1; S.descents = 0; S.dropped = 0; S.lowerK = 0; revealedAt = -1e9; revealBank = 0; stillRun = 0; S.pack = zeros(0); S.packed = zeros(false); S.learned = {}; S.assist = 0; S.aletaHands = 0; S.aletaWidth = 0; peak = 0; pulsesBalanced = 0; pulsesEval = 0; fillSpeed = 0; stillT = 0; pomT = 0;
    go('wait');
  }
  const structureWalls = () => { const a = []; for (let w = 0; w < W; w++) if (S.walls[w]) a.push(w); return a; };
  // T-050 the pom's helpers: a hand by its stroke, a position copied from a hand, the stillest hand, the light handed to a hand
  const strokeOf = (id) => { for (const o of S.strokes) if (o.stroke === id) return o; return null; };
  const posOf = (o) => ({ stroke: o.stroke, wall: o.wall, dx: o.dx, y: o.y, s: o.s });
  const setPos = (p, o) => { p.stroke = o.stroke; p.wall = o.wall; p.dx = o.dx; p.y = o.y; p.s = o.s; };
  const stillest = () => { let b = null; for (const o of S.strokes) if (!b || o.still > b.still || (o.still === b.still && o.disp < b.disp)) b = o; return b; };
  function handTo(o, back) {   // 'handoff:w' — from null = she is born there (no flight)
    const from = S.pomHolder ? { ...S.pomHolder } : null;
    S.pomFrom = from; S.pomHolder = posOf(o); holderId = o.stroke; S.pomFly = from ? 0 : 1; holdT = 0; goneT = 0; S.pomFalter = 0;
    if (!S.pomThread.some((p) => p.stroke === o.stroke)) { S.pomThread.push(posOf(o)); if (S.pomThread.length > T.pom.relay.thread) S.pomThread.shift(); }
    if (from) S.pomHandoffs++;
    S.pomHandoff = { from, to: posOf(o), back, at: S.clock }; emit('handoff:' + o.wall);
  }
  function pomInit() {
    S.climber = 0; S.climb = 0; order = structureWalls(); holderId = null; holdT = 0; goneT = 0; gustAt = breakAt = falterAt = -1e9;
    Object.assign(S, { pomStage: 'relay', pomRest: 0, pomHolder: null, pomFrom: null, pomFly: 1, pomFalter: 0, pomThread: [], pomHandoffs: 0, pomHandoff: null, pomBreath: 0, pomGust: 0, pomHush: 0, restless: false });
  }
  // T-055 THE RELAY (proposal §4.2; notas/ENT.md › T-055). A fire devil runs along the walls (+s) at a person's pace to the nearest hand
  // AHEAD within relayReach and jumps to it; a hand dragged ahead is followed; with no hand ahead it nearly stops and, after relayStall s,
  // the other devils fetch it (relayFetch m/s to the next hand at any distance). The net: in the last 10 s of relayMax it hurries just
  // enough to close the lap. Goal: once round the room. Every corner crossed is a flare.
  function relayStart(now) {
    const R = S.relay = relayFresh();
    let born = null, bt = -1e9;
    for (const o of S.strokes) { const tr = track.get(o.stroke), lt = tr ? tr.land : 0; if (!born || lt > bt) { born = o; bt = lt; } }
    relayR = born ? perimOf(born.wall, born.dx) : perimOf(0, 0);
    R.s = R.s0 = relayR; R.holderWall = wallAtS(relayR);
    if (born) { R.holder = born.stroke; R.y = born.y || 1.1; }
    emit('relay:start');
  }
  function relayStep(dt, now, B) {
    const R = S.relay; if (R.done) return true;
    const near = B.relayNear, back = 0.5;
    let best = null, bd = Infinity, bs = 0;
    for (const o of S.strokes) {
      const hs = perimOf(o.wall, o.dx); let fd = wrapP(hs - relayR); if (fd > PER - back) fd -= PER;
      if (fd <= near || (!R.assist && fd > B.relayReach)) continue;
      if (fd < bd) { bd = fd; best = o; bs = hs; }
    }
    // the net: in the last 10 s of relayMax, at least the speed that closes the lap in time
    const left = B.spark + B.relayMax - S.t, need = Math.max(0, (1 - R.lap) * PER), net = left < 10 ? need / Math.max(0.25, left) : 0;
    if (net > B.relayRun && !R.assist) { R.assist = true; emit('relay:assist'); }
    let v;
    if (best) {
      R.target = { stroke: best.stroke, wall: best.wall, s: bs, y: best.y }; R.stall = 0;
      // a person's pace; catching up with a hand dragged faster
      v = Math.max(R.assist ? Math.max(B.relayFetch, B.relayRun) : B.relayRun, best.stroke === R.holder && bd <= B.relayReach ? (bd - near) * 2 : 0, net);
    } else {
      R.target = null; R.stall += dt;
      if (R.stall >= B.relayStall && !R.assist) { R.assist = true; emit('relay:assist'); }
      v = Math.max(R.assist ? B.relayFetch : B.relayCrawl, net);
    }
    R.speed += (v - R.speed) * (1 - Math.exp(-dt / (v > R.speed ? 0.35 : 0.6)));
    if (net > R.speed) R.speed = net;
    let move = R.speed * dt;
    if (best && move >= bd - near * 0.5) move = Math.max(0, bd - near * 0.5);   // lands on the hand
    const from = relayR; relayR += move;
    for (let w = 0; w < W; w++) if (Math.floor((relayR - S0[w]) / PER) > Math.floor((from - S0[w]) / PER)) { R.corners++; R.corner = { wall: w, s: S0[w], at: now }; emit('corner'); }
    if (best && bd - move <= near) {   // it reached the hand: it jumps onto it
      if (best.stroke !== R.holder) { const fw = R.holder === null ? R.holderWall : (strokeOf(R.holder) || { wall: R.holderWall }).wall; R.jumps++; R.jump = { from: fw, to: best.wall, at: now }; emit('relay:jump'); }
      R.holder = best.stroke; R.assist = net > B.relayRun; R.stall = 0;
    }
    const h = R.holder === null ? null : strokeOf(R.holder);
    R.y = h ? h.y || R.y : best ? best.y || R.y : R.y;
    R.s = wrapP(relayR); R.holderWall = wallAtS(relayR); R.lap = clamp((relayR - R.s0) / PER, 0, 1);
    if (R.lap >= 1) { R.done = true; R.speed = 0; R.target = null; R.assist = false; emit('relay:lap'); return true; }
    return false;
  }
  function fall(outcome) { S.outcome = outcome; emit('fall'); go('fall'); }
  function finish() {       // the four values, as the group played them
    const v = S.values;
    v.forca = clamp(0.35 + 0.65 * fillSpeed, 0, 1);
    v.equilibri = pulsesEval ? clamp(pulsesBalanced / pulsesEval, 0, 1) : 0;
    // T-050 (proposal §4.10): Valor = the stillness in the Pom and the hands raised in l'aleta; Seny = how gently it came down
    v.valor = clamp((pomT ? stillT / pomT : 0) * 0.6 + (S.outcome === 'intent' ? 0 : 0.4 * S.aletaHands), 0, 1);
    v.seny = S.outcome === 'descarregat' ? clamp(0.25 + 0.75 * (S.descents / Math.max(1, S.descents + cracksB)), 0, 1) : 0.15;
    S.prints = []; printed.clear(); S.printOpen = false;   // the acta starts with no handprints
  }

  // duplicates (24-11): a NEW stroke within T.dup of a live one on its wall (the sensor gave the same hand a new id) is folded into it
  const alias = new Map(), lastPos = new Map(), normPool = [], normList = [], present = new Set();
  function fold(hands, now) {
    normList.length = 0; present.clear();
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      let c = alias.get(h.stroke);
      if (c === undefined) {
        c = h.stroke;
        for (const [k, L] of lastPos) if (k !== h.stroke && L.wall === h.wall && Math.abs(L.dx - (h.dx || 0)) < T.dup && Math.abs(L.y - (h.y || 0)) < T.dup) { c = k; break; }   // the same hand twice (a new id on a coasting one)
        alias.set(h.stroke, c);
      }
      if (present.has(c)) {                               // its twin is already here this frame
        // T-050: two hands that were folded and have since parted (> 3 × dup apart) are two hands again — else the second one would
        // stay invisible to the score for as long as it is down (two people packing close in the pinya, then spreading out)
        const L = lastPos.get(c);
        if (c === h.stroke || !L || (L.wall === h.wall && Math.abs(L.dx - (h.dx || 0)) < 3 * T.dup && Math.abs(L.y - (h.y || 0)) < 3 * T.dup)) continue;
        c = h.stroke; alias.set(h.stroke, c); if (present.has(c)) continue;
      }
      present.add(c);
      let o = normPool[normList.length]; if (!o) { o = {}; normPool.push(o); }
      o.stroke = c; o.wall = h.wall; o.dx = h.dx || 0; o.y = h.y; o.vx = h.vx; o.vy = h.vy; o.size = h.size; o.s = h.s; o.speed = h.speed || 0;
      normList.push(o);
      let L = lastPos.get(c); if (!L) { L = { wall: 0, dx: 0, y: 0 }; lastPos.set(c, L); } L.wall = h.wall; L.dx = o.dx; L.y = h.y || 0;
    }
    for (const k of lastPos.keys()) if (!present.has(k)) lastPos.delete(k);
    if (alias.size > 256) for (const [raw, c] of alias) if (!present.has(c)) alias.delete(raw);
    return normList;
  }

  /** hands: the hands down now: [{ stroke, wall (index), dx (m from the wall's centre, + to the right), y (m from the floor), vx, vy (m/s),
   *  size (m), s (m along the perimeter), speed (m/s) }]. Only stroke, wall and dx are required: without y the work plays as before
   *  (heights read 0, nothing rises). */
  function step(dt, hands) {
    S.clock += dt; S.t += dt; S.tp += dt; if (S.block !== 'wait') S.passT += dt;
    const now = S.clock, seen = new Set(); let downs = 0, maxSpeed = 0;
    onButton = 0; downsW.fill(0); landed.length = 0; if (S.lamps.length) S.lamps = [];
    S.count.fill(0);
    hands = fold(hands, now);
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      S.count[h.wall]++; lastSeen[h.wall] = now; seen.add(h.stroke);
      if ((h.dx || 0) <= 0.15) seenL[h.wall] = now; if ((h.dx || 0) >= -0.15) seenR[h.wall] = now;
      if (!strokes.has(h.stroke)) { lastDown[h.wall] = now; downs++; downsW[h.wall]++; downTimes.push(now); landed.push(h); }
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
      let o = strokePool[S.strokes.length]; if (!o) { o = { stroke: 0, wall: 0, dx: 0, s: 0, size: 0, y: 0, y0: 0, rise: 0, disp: 0, dy: 0, still: 0 }; strokePool.push(o); }
      o.stroke = h.stroke; o.wall = h.wall; o.y = tr.y; o.y0 = tr.y0; o.rise = tr.y - tr.y0; o.disp = tr.disp; o.dy = tr.dy; S.strokes.push(o);
      o.dx = h.dx || 0; o.s = typeof h.s === 'number' && isFinite(h.s) ? h.s : 0; o.size = h.size > 0 ? h.size : T.hand.size; o.still = tr.still;
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
    S.solo = peak <= 2;                                       // one person (24-11): the work must be whole with one
    if (S.block === 'wait' || S.block === 'intro' || S.block === 'brasa' || (S.block === 'pinya' && S.phase === 'title')) {   // what the group sets is settled before the pinya is played
      S.needWalls = S.solo ? 1 : Math.min(W, S.people <= 3 ? 2 : S.people <= 7 ? 3 : 4); S.buttons = S.people <= 4 ? 1 : S.people <= 9 ? 2 : 3;
    }
    const B = T[S.block], interactive = B && typeof B === 'object';
    if (S.hands) S.warn = null;
    if (interactive && S.block !== 'festa' && emptyFor >= T.abandon / 2 && S.warn !== 'abandon' && S.warn !== 'fall') { S.warn = 'abandon'; emit('warn:abandon'); }
    if (interactive && S.block !== 'festa' && emptyFor >= T.abandon) { reset(true); return S; }
    if (interactive && S.phase === 'title' && S.tp >= T.title) phase('play');
    const playing = S.phase === 'play' || S.phase === 'title';   // 24-11: the chapter card is a layer — the score listens under it

    if (S.block === 'wait') {
      // the threshold. Playing (hands landing, hands on the walls) REVEALS the start button; once it is whole it stays while
      // anybody is there; then a hand on the button (the centre of a wall) fills the start ring: 3 s with two hands, 4.5 s with one.
      // What play earns goes into a small bank that pays out at most `rate` a second: two people playing reveal it in ~20–45 s,
      // a big group in no less than ~18 s (time to see the room).
      const R = T.reveal;
      if (S.reveal < 1) {
        revealBank = Math.min(R.bank, revealBank + R.down * Math.min(R.downMax, downs) + dt * R.hold * Math.min(R.holdMax, S.hands));
        const pay = Math.min(revealBank, (S.solo ? R.soloRate : R.rate) * dt); revealBank -= pay;
        S.reveal = Math.min(1, S.reveal + pay);
        if (emptyFor >= R.idle) S.reveal = Math.max(0, S.reveal - dt / R.decay);
        if (S.reveal >= 1) { revealedAt = now; emit('reveal'); }
      } else if (emptyFor >= R.keep) S.reveal = 1 - 1e-6;               // everybody left long ago: it starts to fade again
      const pressing = S.reveal >= 1 && now - revealedAt >= R.settle && onButton > 0;
      S.start = pressing ? Math.min(1, S.start + (dt / T.start) * (onButton >= 2 ? 1 : 1 / 1.5)) : Math.max(0, S.start - dt / (T.start * 2)); S.progress = S.start;
      if (S.start >= 1) { S.pass++; emit('start'); go('intro'); }
    } else if (S.block === 'intro') {
      // T-055 (proposal §4.1): no goals; each hand that lands lights the lamp nearest to it (the visual picks it): 'lamp:w'
      for (const h of landed) {
        if (now - lampAt[h.wall] < 0.25) continue;
        lampAt[h.wall] = now; S.lampN++;
        S.lamp = { wall: h.wall, s: typeof h.s === 'number' && isFinite(h.s) ? h.s : perimOf(h.wall, h.dx), dx: h.dx || 0, y: typeof h.y === 'number' && isFinite(h.y) ? h.y : 0, at: now, n: S.lampN };
        S.lamps.push(S.lamp); emit('lamp:' + h.wall);
      }
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
          if (S.t >= B.spark) { S.brasaStage = 'relay'; relayStart(now); }   // the spark lasts B.spark s from the block's start (the card is a layer)
        } else if (S.brasaStage === 'relay') {
          if (relayStep(dt, now, B)) {   // the fire went once round the room: the call, as before
 S.brasaStage = 'call'; hint('together'); C.n = 1; C.gap = B.gap; C.from = Math.floor(Math.random() * W); C.to = C.from; C.at = now + B.lead + 2 * C.gap; C.hits = 0; C.armed = true; C.tokDone = false; }
        } else {
          C.need = S.solo ? 1 : clamp(Math.round(S.people * 0.4), 2, 5);
          const first = C.at - 2 * C.gap;
          if (C.n > 3) { S.progress = 1; } else {
          if (C.armed && now >= first) { C.armed = false; emit('call'); }
          C.phase = now < first ? 0 : clamp((now - first) / (2 * C.gap), 0, 1);
          callCount(C, B, now, downs);
          if (now > C.at + B.late) {                               // judge the call
            const big = C.hits >= C.need;
            S.waveBig = big; waveAt = now; emit('wave');
            if (big) {
              S.waves++; learn('brasa');
              if (S.waves >= 3) C.n = 4;                          // the ring is whole: it wakes (not before the block's minimum)
              else { C.n++; C.gap = B.gap; C.from = (C.from + 1) % W; C.to = C.n === 2 ? (C.from + 2) % W : -1; }
            } else C.gap = Math.min(B.gap + 2 * B.slower, C.gap + B.slower);   // slower, never «again, together»
            C.at = now + B.pause + 2 * C.gap; C.hits = 0; C.armed = true; C.tokDone = false;
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
        S.pinyaStage = S.t < B.palm ? 'palm' : 'pack';
        if (downs && now - palmAt > 0.3) { palmAt = now; emit('palm'); }
        S.assist = clamp((S.tp - B.net) / 10, 0, 1);
        let packedHands = 0;
        for (let w = 0; w < W; w++) {
          // packed = most of THIS wall's hands (≥ 80 %, at least one) inside its densest 2 m window, and that window near the wall's centre
          // (where the palms lead): one hand that followed its palm packs its wall; a group spread along the wall does not
          const frac = S.count[w] ? spanN[w] / S.count[w] : 0, near = clamp(1 - (Math.abs(S.packX[w]) - B.nearFull) / Math.max(0.05, B.nearZero - B.nearFull), 0, 1);   // full to 1.8 m from the centre, 0 at 3 m
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
        let withHands = 0; for (let w = 0; w < W; w++) if (S.count[w]) withHands++;
        const needNow = withHands === 1 ? 1 : S.needWalls;   // the whole group on one wall (or one person): that wall closes the circle
        holdAll = fullHeld >= needNow ? holdAll + dt : Math.max(0, holdAll - dt * 2);
        S.closed = clamp(holdAll / B.hold, 0, 1);
        const top = S.fill.slice().sort((a, b) => b - a).slice(0, needNow).reduce((a, b) => a + b, 0) / needNow;
        S.progress = clamp(top * 0.8 + S.closed * 0.2, 0, 1);
        if (S.tp > 20 && full < needNow) hint('more'); else if (full >= needNow && S.closed < 1 && S.tp > 30) hint('hold');
        const timeUp = S.t >= B.max - B.reward;
        if ((S.closed >= 1 && S.t >= B.min) || timeUp) {
          // the structure: the walls the group holds (at least the two fullest)
          const rank = S.fill.map((f, w) => [f + (S.held[w] ? 1 : 0), w]).sort((a, b) => b[0] - a[0]);
          const n = clamp(Math.max(needNow, timeUp ? 0 : fullHeld), needNow < 2 ? 1 : Math.min(2, W), W);   // one wall = a pilar
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
          // 24-11 (#13): each hand's base = the lowest it was in the last 2 s when the rise begins (one already up is not sent back to 0);
          // it is judged on the HIGHEST it reached during rise + lock, at the end of the phrase
          if (ph === 'rise' && S.phrase !== 'rise') { riseBase.clear(); riseMax.clear(); for (const o of S.strokes) { const tr = track.get(o.stroke); riseBase.set(o.stroke, tr ? minY(tr, now, 2) : o.y); } }
          if (ph === 'rise' || ph === 'lock') {
            const per = zeros(0), up = zeros(0), bs = zeros(0), n = zeros(0);
            for (const o of S.strokes) {
              if (!riseBase.has(o.stroke)) { const tr = track.get(o.stroke); riseBase.set(o.stroke, tr ? minY(tr, now, 2) : o.y); }
              riseMax.set(o.stroke, Math.max(riseMax.get(o.stroke) ?? o.y, o.y));
              const r = riseMax.get(o.stroke) - riseBase.get(o.stroke); n[o.wall]++;
              per[o.wall] += r; if (r >= B.rise) up[o.wall]++; else if (o.disp < B.base) bs[o.wall]++;
            }
            for (let w = 0; w < W; w++) { S.liftK[w] = n[w] ? clamp(per[w] / n[w] / B.rise, 0, 1) : 0; S.lifters[w] = up[w]; S.bases[w] = bs[w]; }
          }
          if (ph === 'gather' && S.phrase === 'lock') {        // the end of the phrase: judge it
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
            let swHands = 0; for (const w of sw) if (S.count[w]) swHands++;
            if (swHands && lifted >= swHands) { emit('lift'); learn('tronc'); }   // every tower wall that has hands lifted
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
      } else if (S.phase === 'reward') { if (S.tp >= B.reward) { pomInit(); go('pom'); } }
    } else if (S.block === 'pom') {
      if (playing) {
        // IV. Pom de dalt (T-050, proposal §4.5): three climbs, three gestures of stillness. A hand is still when it moved < B.still in
        // the last second (filtered, along the perimeter); a hand the sensor loses is absent, not restless. After each arrival she rests
        // B.rest s (the next climber is named) before the next climb counts.
        //   relay   (Dosos)     the light is born under the stillest hand; every B.relay.every s held it flies (B.relay.fly s) to the next
        //                       still hand anywhere in the room, leaving a thread between all the hands that carried it; if its hand moves
        //                       it falters and, after B.relay.falter s, goes back to the previous one. Solo: between the person's hands.
        //   breath  (Acotxador) she rises while the WHOLE room is still; the more still hands the faster; a sudden move is a gust: she
        //                       holds on (no progress for a moment, never a fall)
        //   silence (Enxaneta)  near nothing: she climbs only while everybody is still; any move is heard and costs a little
        pomT += dt;
        if (S.phase === 'title' && S.tp < dt * 1.5) emit('climber:0');
        const R = B.relay, rate = 1 / B.climb[S.climber];
        S.pomStage = POM_STAGES[S.climber];
        let nPres = 0, nStill = 0, moveW = -1, gustD = 0, gustW = -1;
        for (const o of S.strokes) { nPres++; if (o.disp <= B.still) nStill++; else { if (moveW < 0) moveW = o.wall; if (o.disp > gustD) { gustD = o.disp; gustW = o.wall; } } }
        const share = nPres ? nStill / nPres : 0, resting = S.pomRest > 0;
        if (resting) S.pomRest = Math.max(0, S.pomRest - dt);
        for (const p of S.pomThread) { const o = strokeOf(p.stroke); if (o) setPos(p, o); }   // the thread follows its hands while they are there
        let gain = 0, still = 0;
        if (S.pomStage === 'relay') {
          if (S.pomFly < 1) S.pomFly = Math.min(1, S.pomFly + dt / R.fly);
          const h = holderId === null ? null : strokeOf(holderId), flying = S.pomFly < 1;
          if (h) { setPos(S.pomHolder, h); goneT = 0; } else if (holderId !== null) goneT += dt;
          // the next still hand: one that has not carried her yet, on another wall, the stillest
          let cand = null, best = -1;
          for (const o of S.strokes) {
            if (o.stroke === holderId || o.still < R.ready || o.disp > B.still) continue;
            const sc = (S.pomThread.some((p) => p.stroke === o.stroke) ? 0 : 2) + (S.pomHolder && o.wall !== S.pomHolder.wall ? 1 : 0) + Math.min(1, o.still / 4);
            if (sc > best) { best = sc; cand = o; }
          }
          S.nextWall = cand ? cand.wall : S.lightWall;
          S.restless = !!h && h.disp > B.still;
          if (holderId === null || (!h && goneT >= R.gone)) {   // born under the stillest hand; or its hand is gone: the stillest present takes her
            const o = cand || stillest();
            if (o) handTo(o, false);
          } else if (h && S.restless) {                        // her hand moves: she falters, and goes back
            if (S.pomFalter === 0 && now - falterAt > 2) { falterAt = now; emit('falter'); }
            S.pomFalter = Math.min(1, S.pomFalter + dt / R.falter);
            if (S.pomFalter >= 1) {
              let back = null;
              for (let i = S.pomThread.length - 1; i >= 0 && !back; i--) { const p = S.pomThread[i]; if (p.stroke !== holderId) { const o = strokeOf(p.stroke); if (o && o.disp <= B.still) back = o; } }
              back = back || cand;
              if (back) { S.climb = Math.max(0, S.climb - R.cost); handTo(back, true); }
            }
          } else if (h) {                                     // held still: she climbs, and after a while seeks the next still hand
            S.pomFalter = Math.max(0, S.pomFalter - dt / 0.6);
            gain = 1; still = 1;
            if (!flying) { holdT += dt; if (holdT >= R.every && cand && !resting) handTo(cand, false); }
          } else if (flying) gain = 1;                         // in the air between two hands
        } else if (S.pomStage === 'breath') {
          S.pomGust = Math.max(0, S.pomGust - dt / 1.5);
          if (gustD > B.gust && now - gustAt >= B.gustGap) { gustAt = now; S.pomGust = 1; emit('gust:' + gustW); }
          const Br = B.breath;
          S.pomBreath = nStill ? share * share * (Br.slow + Br.more * Math.min(1, (nStill - 1) / Br.many)) : 0;
          S.restless = nStill < nPres;
          gain = S.pomGust > 0.3 ? 0 : S.pomBreath; still = share;
        } else {
          const all = nPres > 0 && nStill === nPres;
          S.pomHush += ((all ? 1 : nPres ? 0.5 * share : 0) - S.pomHush) * (1 - Math.exp(-dt / 0.5));
          S.restless = nPres > 0 && !all;
          if (S.restless && !resting) { if (now - breakAt >= B.breakGap) { breakAt = now; S.climb = Math.max(0, S.climb - B.breakCost); emit('hush:break:' + moveW); } }
          else if (all) { gain = 1; still = 1; }
        }
        S.lightWall = S.pomHolder ? S.pomHolder.wall : order[0] ?? 0;
        if (S.pomStage !== 'relay') S.nextWall = S.lightWall;
        if (resting) gain = 0;
        else if (!nPres && !(S.pomStage === 'relay' && S.pomFly < 1)) S.climb = Math.max(0, S.climb - rate * 0.3 * dt);   // an empty room: she slips back a little
        S.climb += gain * rate * dt;
        stillT += dt * still; S.stats.stillS += dt * still;
        stillRun = still >= 0.999 ? stillRun + dt : 0; if (stillRun >= 4) learn('pom');
        if (S.restless && S.tp > 8) hint('still');
        if (emptyFor >= B.empty / 2 && S.warn !== 'fall') { S.warn = 'fall'; emit('warn:fall'); }   // half the deadline: the light trembles
        const late = S.t > B.target; if (late && !resting) S.climb += dt / 25;                // past its time the light finds its way
        if (S.climb >= 1) {
          emit('arrived:' + S.climber);
          if (S.climber < 2) { S.climber++; S.climb = 0; S.pomRest = B.rest; S.pomStage = POM_STAGES[S.climber]; S.pomGust = 0; S.pomFalter = 0; S.restless = false; emit('climber:' + S.climber); }
          else { S.climb = 1; S.pomHush = 1; phase('reward'); }   // she arrives: B.reward s of silence, then l'aleta
        }
        S.progress = clamp((S.climber + Math.min(1, S.climb)) / 3, 0, 1);
        if (S.phase !== 'reward' && emptyFor >= B.empty) fall('intent');            // only an empty room falls (20 s, warned at 10)
        else if (S.phase === 'play' && S.t >= B.max) phase('reward');            // at max it crowns (narrow if they did not get far), never falls
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
          if (!aletaRose.has(o.stroke) && (o.y - aletaBase.get(o.stroke) >= A.rise || (o.y > A.high && S.tp >= A.highAfter))) aletaRose.set(o.stroke, now);
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
      const opp = (w) => (S.people <= 2 ? w : W >= 4 ? (w + 2) % W : (w + 1) % W);   // ≤ 2 people: the front goes round and comes back to its own wall
      const takes = (f, w) => w === f.to || (S.people <= 2 && (w === (f.to + 1) % W || w === (f.to + W - 1) % W));
      // the fronts: returns first (a hand on the arrival wall, at the arrival), then new fronts from the other landings
      const used = zeros(0);
      for (let i = S.fronts.length - 1; i >= 0; i--) {
        const f = S.fronts[i];
        let rw = -1; for (let w = 0; w < W; w++) if (downsW[w] - used[w] > 0 && takes(f, w)) { rw = w; break; }
        if (rw >= 0 && Math.abs(now - f.arrive) <= B.window) {
          used[rw]++; S.fronts.splice(i, 1); S.echoHits++; learn('festa'); lastEcho = now; S.resonance += 0.12 / Math.sqrt(S.people);
          if (S.fronts.length < 12) S.fronts.push({ id: ++frontId, from: rw, to: opp(rw), at: now, arrive: now + B.travel, gen: Math.min(4, f.gen + 1), ghost: false });
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
        if (C.n === 0) { C.n = 1; C.gap = B.gap; C.from = 0; C.to = -1; C.at = now + B.lead + 2 * C.gap; C.hits = 0; C.armed = true; C.tokDone = false; S.fronts.length = 0; }
        C.need = S.solo ? 1 : clamp(Math.round(S.people * 0.4), 2, 5);
        const first = C.at - 2 * C.gap;
        if (C.armed && now >= first) { C.armed = false; emit('call'); }
        C.phase = now < first ? 0 : clamp((now - first) / (2 * C.gap), 0, 1);
        callCount(C, B, now, downs);
        if (now > C.at + B.late) {
          const k = Math.min(1, C.hits / C.need); S.resonance += 0.22 * k; S.waveBig = k >= 1; unisonSum += k; emit('wave');
          if (C.n >= B.calls) {                                       // the last one: the room flowers, always
            // how together they were: the calls hit in unison (½), the echoes returned (0.3), the base (0.2)
            S.bloomSize = clamp(0.2 + 0.5 * (unisonSum / B.calls) + 0.3 * Math.min(1, S.echoHits / 6), 0, 1); S.bloomDur = 4 + 4 * S.bloomSize;
            bloomAt = now; S.blooms++; emit('bloom'); festaEndAt = now + S.bloomDur; C.n = B.calls + 1;
          } else { C.n++; C.at = now + B.pause + 2 * C.gap; C.hits = 0; C.armed = true; C.tokDone = false; }
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
      // 24-11 (#11b): EVERY hand counts; the ones on walls without the tower at B.outside
      const anyHeld = S.held.some((v) => v);
      if (S.t < dt * 1.5) { descentMax.clear(); crackedThis = false; dropT = 0; S.descents = 0; S.dropped = 0; downT = 0; cracksB = 0; }
      if (emptyFor >= B.empty / 2 && S.floors > 2 && S.warn !== 'fall') { S.warn = 'fall'; emit('warn:fall'); }   // half the deadline: it creaks
      if (!anyHeld && emptyFor >= B.empty && S.floors > 2) { fall('carregat'); return S; }
      const drops = [], dropsOut = [];
      for (const o of S.strokes) {
        const m = Math.max(descentMax.get(o.stroke) ?? o.y, o.y); descentMax.set(o.stroke, m);
        (S.walls[o.wall] ? drops : dropsOut).push(m - o.y);
        if (o.dy < -B.gentle && !crackedThis && S.lowerK > 0.1) { crackedThis = true; cracksB++; emit('crack'); }
      }
      for (const k of descentMax.keys()) if (!strokes.has(k)) descentMax.delete(k);
      if (drops.length || dropsOut.length) S.lowerK = clamp(Math.max(drops.length ? median(drops) : 0, dropsOut.length ? median(dropsOut) * B.outside : 0) / B.lower, 0, 1);   // the tower's hands, or the others at half
      for (let w = 0; w < W; w++) if (S.count[w]) S.band[w] += (S.yMed[w] - S.band[w]) * (1 - Math.exp(-dt * 6));
      const lowerFloors = (n) => { for (let i = 0; i < n && S.floors > (S.t < B.min ? 1 : 0); i++) { S.floors--; emit('down'); } };
      // let go in the middle of a descent: it drops (two floors, a crack); three in a row and it falls
      if (S.lowerK > 0.15 && !S.hands) { dropT += dt; if (dropT >= 1) { dropT = 0; S.dropped++; cracksB++; emit('crack'); lowerFloors(2); S.lowerK = 0; descentMax.clear(); crackedThis = false; if (S.dropped >= B.drop) { fall('carregat'); return S; } } } else dropT = 0;
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
      // l'acta (T-050, proposal §4.10): from `from` to `to` s every hand that rests (`rest` s still) leaves a gold handprint that stays
      const Pr = T.print;
      S.printOpen = S.t >= Pr.from && S.t < Pr.to;
      if (S.printOpen) for (const o of S.strokes) {
        if (printed.has(o.stroke) || o.still < Pr.rest || S.prints.length >= Pr.max) continue;
        printed.add(o.stroke);
        let near = false; for (const p of S.prints) if (p.wall === o.wall && Math.hypot(p.dx - o.dx, p.y - o.y) < Pr.near) { near = true; break; }
        if (near) continue;   // the same resting hand under a new id
        S.prints.push({ wall: o.wall, dx: o.dx, y: o.y, s: o.s, size: o.size, t: Math.round(S.t * 100) / 100 }); emit('print:' + o.wall);
      }
      S.progress = S.t / T.acta; if (S.t >= T.acta) reset(false);
    }
    return S;
  }

  /** The line of the acta, as the colles write it: "3 de 7 · descarregat". */
  function acta() {
    const kind = S.structure === 1 ? 'pilar' : String(S.structure || 0);
    return { castell: `${kind} de ${S.stats.maxFloors}`, structure: STRUCTURES[S.structure] || '', floors: S.stats.maxFloors, outcome: S.outcome, hands: S.stats.maxHands, prints: S.prints.length, people: S.people, stillS: Math.round(S.stats.stillS), values: { ...S.values } };
  }
  /** Rehearsal: go to a block with a plausible state. */
  function jump(block) {
    if (!BLOCKS.includes(block)) return;
    if (block === 'wait') { reset(false); return; }
    const after = (b) => BLOCKS.indexOf(block) > BLOCKS.indexOf(b);
    if (after('pinya') && !S.structure) { const n = Math.min(W, Math.max(S.solo ? 1 : 2, S.needWalls)); S.walls = zeros(false); for (let w = 0; w < n; w++) S.walls[w] = true; S.structure = n; S.fill = S.walls.map((v) => (v ? 1 : 0)); S.closed = 1; }
    if (after('tronc') && S.floors < 5) { S.floors = 7; S.stats.maxFloors = Math.max(S.stats.maxFloors, 7); }
    if (block === 'brasa') { S.brasaStage = 'spark'; S.waves = 0; S.touched = 0; S.call.n = 0; S.waveBig = false; S.relay = relayFresh(); }
    if (block === 'tronc') { S.floors = 0; S.floorProgress = 0; beatT = 0; evalAt = 0; phraseClock = 0; wobbles = 0; S.wobble = 0; S.wobbleWall = -1; }
    if (block === 'pom') pomInit();
    if (block === 'fall') S.outcome = S.outcome || 'intent';
    if (block === 'acta') { S.outcome = S.outcome || 'descarregat'; finish(); }
    if (block === 'baixada') downT = 0;
    go(block);
  }
  return { state: S, step, acta, jump, times: T };
}
