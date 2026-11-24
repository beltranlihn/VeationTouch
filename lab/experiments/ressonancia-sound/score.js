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
import { createTargets } from './targets.js';

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
  tg: { charge: 0.5, hold: 0.5, grace: 0.8, r: 0.22 },   // 25-11 (D3b) the hold-targets: rest charge s, then hold s; a lost hand keeps the charge grace s; radius (m)
  brasa: { min: 45, target: 60, max: 75, reward: 7, spark: 12, gap: 0.8, pause: 3.2, lead: 1.0, callMax: 14, fracs: [0.35, 0.5, 0.65], relayMax: 30, relayMin: 8 },   // 25-11: spark → relay (chain) → 3 calls (together; fracs of the group, callMax s before the colla)
  pinya: { min: 50, target: 75, max: 94, reward: 8, fill: 10, hold: 3, palm: 15, pack: [0.55, 0.9], net: 40, nearFull: 1.8, nearZero: 3 },   // nearFull/nearZero: at least half the wall (25-11, A5)
  tronc: { min: 85, target: 115, max: 145, reward: 6, period: 2.4, phrase: 4.8, wobble: 7, foot: 0.95, footY: [0.62, 0.68], help: 0.5,   // 25-11: ladders (rungs; a child's kidRungs), needK × n / 1.6 ladders a floor,
    rungs: [0.85, 1.25, 1.65], kidRungs: [0.65, 1.05, 1.45], every: 6, colla: 16, needK: 0.5 },                                            // ≥ every s between floors, the colla after colla s (to 5)
  pom: { min: 70, target: 90, max: 112, reward: 1.5, climb: [38, 16, 10], rest: 7, empty: 20, still: 0.15, stillSpeed: 0.3,   // still: a hand moved less than this (m) in 1 s (filtered); stillSpeed: unused since 24-11, kept for compatibility
    relay: { every: 4, fly: 1.5, ready: 1, falter: 1.2, cost: 0.04, gone: 1, thread: 24, hop: 0.12, base: 0.55, one: 1.0 },   // 25-11 (B4): she climbs at base (one hand: one) and every handoff lifts her hop at once; hops every clamp(16 / still hands, 1.5, every) s
    breath: { slow: 0.7, more: 0.35, many: 4 }, gust: 0.35, gustGap: 1.5, breakGap: 1.2, breakCost: 0.08, breaksMax: 3, arriving: 1.5 },   // A11/A12: a gust needs ≥ 20 % of the hands; the silence tolerates 15 % moving (max 4) and the hands arriving (< arriving s)
  print: { from: 3, to: 15, rest: 0.5, max: 60, near: 0.15 },   // T-050 the acta's handprints: a hand resting ≥ rest s between from and to leaves one (not two within `near` m)
  aleta: { window: 12, rise: 0.28, high: 1.6, highAfter: 2, quorum: 0.6, quorumMany: 0.4, within: 3, up: 0.35, top: 1.9 },   // 25-11 (A13): quorum 0.6 up to 4 hands → quorumMany from 12; crown-targets `up` m above every hand (≤ top)
  hand: { size: 0.12, base: 6, span: 2 },   // the default hand width (m), how slowly a hand's baseline follows it (s), the narrowest packing window (m)
  crown: 25,
  festa: { min: 60, target: 76, max: 84, free: 24, echo: 52, travel: 3, ghost: 12, echoLife: 8, calls: 4, gap: 0.8, lead: 1.0, pause: 2.5, callMax: 7, fracs: [0.35, 0.45, 0.55, 0.65] },   // 25-11: free (rings) → echo (targets that wait) → 4 calls → bloom
  baixada: { min: 30, target: 40, max: 50, empty: 10, net: 12, drop: 3, rungs: [1.55, 1.15, 0.8, 0.45], kidRungs: [1.3, 0.9, 0.5], coda: 8 },   // coda: free play once it is down, before the acta   // 25-11: ladders down, two floors each (net: the clock lowers it in the last 12 s)
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
  const relayFresh = () => ({ chain: 0, travel: 0, dist: 0, lastS: 0, s: 0, lap: 0, holderWall: -1, holder: null, y: 1.1, speed: 0, target: null, stall: 0, assist: false, jumps: 0, corners: 0, jump: null, corner: null, done: false, s0: 0, perimeter: PER });
  const S = {
    block: 'wait', phase: 'play', t: 0, tp: 0, clock: 0, pass: 0, passT: 0,
    hands: 0, count: zeros(), held: zeros(false), left: zeros(false), right: zeros(false),
    people: 2, needWalls: Math.min(W, 2), buttons: 1,       // the group as estimated, and what it sets
    solo: false, warn: null,                                 // 24-11: one person (peak of hands ≤ 2); a warning at half a deadline
    progress: 0,                                             // 0..1 of the current block's goal (drives the scene)
    start: 0, reveal: 0,                                     // wait: the start ring, and how much of the start button play has revealed
    touched: 0, waves: 0, wavesOwn: 0, brasaStage: 'spark', waveBig: false,   // brasa
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
    // 25-11 (plan 05 §2.1): the shared interfaces. n = hands present, smoothed (rises in ~0.5 s, falls in ~4 s): the base of every
    // collective threshold. focus = the wall that calls ({ wall, s, y, kind, at }; kind: call relay pack next lean wobble light break
    // echo print). assistOn = the block where the colla is helping NOW ('' = nobody helps). castell = the group's castell, persistent.
    // result = how each block ended (the acta reads it). ach = the last achievement ({ key, n, wall, s, y, by: group | colla, at }).
    // targets = the hold-targets now (targets.js › list; [] while a stage offers none), tgProgress = their goal 0..1.
    n: 0, focus: null, assistOn: '', stage: '',
    castell: { state: 'none', walls: [], structure: 0, floors: 0, floorsOwn: 0, floorsColla: 0, climbers: 0, crown: '', slips: 0, cracks: 0, lost: 0 },
    result: { brasa: '', pinya: null, tronc: null, pom: '', festa: 0, baixada: '' },
    ach: null, targets: [], tgProgress: 0,
    events: [],   // drained by the caller (T-055: + 'lamp:w' 'relay:start' 'relay:jump' 'relay:assist' 'relay:lap' 'corner'): 'block:x' 'phase:x' 'reveal' 'start' 'aleta' 'palm' 'pack:w' 'learned:x' 'lift' 'level' 'wobble' 'steady' 'slip' 'lower' 'crack' 'wave' 'awake' 'wall:n' 'close' 'pulse' 'floor' 'weak' 'balance' 'climber:n' 'arrived:n' 'handoff:w' 'falter' 'gust:w' 'hush:break:w' 'print:w' 'crown' 'bloom' 'down' 'fall' 'hint:x' 'abandon'
  };
  S.relay = relayFresh();
  // 25-11 (D3b) the hold-targets: created once, stepped every step (sec «the targets» below), offered by each stage
  const cdP = (a, b) => { const d = wrapP(a - b); return d > PER / 2 ? d - PER : d; };   // circular a − b along the perimeter
  const tgDone = [], tgLadders = []; let tgGoal = false;
  const TG = createTargets({ lengths: LEN, heights: opt.heights, masks: opt.masks, seed: opt.seed || 1, emit: (e) => {
    S.events.push(e);
    if (e.startsWith('tg:done:')) { const id = +e.slice(8); for (const t of TG.list) if (t.id === id) { tgDone.push(t); break; } }
    else if (e.startsWith('tg:ladder:')) { const c = +e.slice(10); for (let i = tgDone.length - 1; i >= 0; i--) if (tgDone[i].chain === c) { tgLadders.push(tgDone[i]); break; } }
    else if (e === 'tg:goal') tgGoal = true;
  } });
  const offer = (o) => { const G = T.tg; TG.offer({ r: G.r, charge: G.charge, hold: G.hold, grace: G.grace, ...o }); };
  let codaAt = 0, offered = false, relayGoal = 5, relayT0 = 0, collaAt = -1e9, lastFloorAt = 0, ladderAcc = 0, frontLaunch = -1e9;
  const sideK = Array.from({ length: W }, () => [0, 0]);
  let relayR = 0;                                                        // T-055 the runner, unwrapped (m)
  const landed = [], lampAt = zeros(-1e9);                               // T-055 the hands that landed this step; a wall's last lamp
  const lastSeen = zeros(-1e9), lastDown = zeros(-1e9), seenL = zeros(-1e9), seenR = zeros(-1e9);
  let strokes = new Set(), peak = 0, emptyFor = 0, lastHint = -1e9, stuckFor = 0;
  let downTimes = [], waveAt = -1e9, holdAll = 0, beatT = 0, evalAt = 0, pulseAt = 0, pulsesBalanced = 0, pulsesEval = 0, fillSpeed = 0;
  let stillT = 0, pomT = 0, downT = 0, festaClusterAt = -1e9, festaCluster = 0, bloomAt = -1e9, order = [];
  let revealedAt = -1e9, onButton = 0, revealBank = 0;
  let breaksThis = 0, holderId = null, holdT = 0, goneT = 0, gustAt = -1e9, breakAt = -1e9, falterAt = -1e9, cracksB = 0;   // T-050 the pom's climbs; the bajada's cracks (Seny)
  const printed = new Set();                                                                                // T-050 the strokes that left a print
  // per stroke: a baseline height and a short history (for the displacement in the last second); allocated once per stroke
  const HIST = 56, track = new Map(), strokePool = [], lostTr = [];
  let maxDisp = 0, aletaBase = new Map(), aletaRose = new Map();
  let palmAt = -1e9, stillRun = 0, unisonSum = 0, frontId = 0, lastEcho = -1e9, festaEndAt = -1;
  const downsW = zeros(0), frontAt = zeros(-1e9);
  const learn = (k) => { if (!S.learned[k]) { S.learned[k] = true; emit('learned:' + k); } };
  let phraseClock = 0, riseBase = new Map(), riseMax = new Map(), wobbles = 0, firstWobbleAt = 0, wobbleT = 0, steadyT = 0, noLift = 0, levelEval = 0, levelOk = 0, descentMax = new Map(), descentFloorsLeft = 0, dropT = 0, crackedThis = false, lowerAt = -1e9;
  const wallHands = Array.from({ length: W }, () => []), spanN = zeros(0), spanTotal = zeros(0);
  function follow(h, now, dt) {
    let tr = track.get(h.stroke);
    const hasY = typeof h.y === 'number' && isFinite(h.y), y = hasY ? h.y : 0, hasS = typeof h.s === 'number' && isFinite(h.s);
    if (!tr) { tr = { y0: y, land: now, ht: new Float64Array(HIST), hx: new Float32Array(HIST), hy: new Float32Array(HIST), n: 0, i: 0, last: -1e9, disp: 0, y, hasY, su: hasS ? h.s : h.dx || 0, s: hasS ? h.s : 0 }; track.set(h.stroke, tr);
      if (hasS) for (let i = lostTr.length - 1; i >= 0; i--) { const L = lostTr[i]; if (Math.abs(cdP(L.s, h.s)) < 0.4 && Math.abs(L.y - y) < 0.4) { tr.still = L.still; tr.land = L.land; lostTr.splice(i, 1); break; } }   // the sensor split a resting hand: it does not «arrive» again
    }
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
  // 25-11 (D3b, plan 05 §4.3): THE CALL on targets. Targets light on every wall; the call is met when `need` of them are held AT THE
  // SAME TIME for tg.hold s (need = clamp(round(frac × n / 1.6), 1, 6), frac growing call after call). No window, no strike, no
  // failure: after callMax s open the colla completes it (named). Between calls a pause of B.pause s. C.n: the call (1…), > calls = done.
  function callOpen(C, B, now, frac, kind) {
    offer({ mode: 'together', kind, shape: 'pillar', w: 0.5, y0: 0.6, y1: 2.2, need: (n) => clamp(Math.round((frac * n) / 1.6), 1, 6) });   // 25-11: columns anybody can hold
    C.open = true; C.openAt = now; C.gap = B.gap; C.at = now + B.lead + 2 * B.gap; C.hits = 0; C.armed = false; C.tokDone = true; C.phase = 0;
    let bw = 0, bc = -1; for (let w = 0; w < W; w++) if (S.count[w] > bc) { bc = S.count[w]; bw = w; } C.from = bw; C.to = -1;
    emit('call');
  }
  // → 0 nothing happened, 1 the group met it, 0.5 the colla met it (the wave goes either way)
  function callStep(C, B, now, fracs, kind, block) {
    if (!C.open) {
      if (C.n <= fracs.length && now >= (C.pauseUntil || 0)) callOpen(C, B, now, fracs[C.n - 1], kind);
      return 0;
    }
    C.phase = TG.progress; C.need = TG.need; C.hits = TG.activeN;
    let k = 0;
    if (TG.reached) k = 1;
    else if (now - C.openAt >= B.callMax) { k = 0.5; collaAt = now; helped[block] = true; }
    if (!k) return 0;
    S.waveBig = true; waveAt = now; emit('wave');
    achieve('wave', C.n, C.from, k === 1 ? 'group' : 'colla');
    if (k === 1) learn(block);
    C.n++; C.open = false; C.pauseUntil = now + B.pause; C.at = now;
    TG.clear();
    return k;
  }
  const minY = (tr, now, secs) => { let m = tr.y; for (let k = 0; k < tr.n; k++) if (now - tr.ht[k] <= secs && tr.hy[k] < m) m = tr.hy[k]; return m; };
  const median = (a) => { if (!a.length) return 0; a.sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

  const emit = (e) => S.events.push(e);
  // 25-11 (plan 05 §2.1–2.2): achievements, the calling wall, the colla's visible help
  const sOfHand = (h) => (typeof h.s === 'number' && isFinite(h.s) ? h.s : perimOf(h.wall, h.dx));
  function achieve(key, n, wall, by, s, y) {
    const w = wall >= 0 && wall < W ? wall : -1;
    S.ach = { key, n: n || 0, wall: w, s: typeof s === 'number' && isFinite(s) ? s : w >= 0 ? perimOf(w, 0) : 0, y: typeof y === 'number' && isFinite(y) ? y : 1.4, by: by || 'group', at: S.clock };
    emit('ach:' + key);
  }
  function setFocus(wall, kind, s, y) {
    if (!(wall >= 0 && wall < W)) { if (S.focus) { S.focus = null; emit('focus:none'); } return; }
    const f = S.focus, fs = typeof s === 'number' && isFinite(s) ? s : perimOf(wall, 0), fy = typeof y === 'number' && isFinite(y) && y > 0 ? y : 1.4;
    // no flapping: a change waits 1.5 s after the last one, except the urgent kinds (a tremble, a broken silence, an echo arriving)
    if (!f || ((f.kind !== kind || f.wall !== wall) && (S.clock - f.at >= 1.5 || (f.kind !== kind && URGENT.has(kind))))) { S.focus = { wall, s: fs, y: fy, kind, at: S.clock }; emit('focus:' + wall); }
    else if (f.wall === wall) { f.s = fs; f.y = fy; }
  }
  function setAssist(on) { const v = on ? S.block : ''; if (S.assistOn !== v) { S.assistOn = v; emit(v ? 'assist:on:' + v : 'assist:off'); } if (v) helped[v] = true; }
  const helped = {}, URGENT = new Set(['wobble', 'break', 'echo', 'call']);
  const firedW = zeros(false), fullOnce = zeros(false); let firedN = 0, relayHelped = false, pinyaHelped = false, ownAcc = 0, collaAcc = 0, lastLevel = true, breakFocusAt = -1e9, breakWall = -1;
  const floorBy = [];
  function enter(block) {   // per-block trackers of the new interfaces
    TG.clear(); offered = false; collaAt = -1e9; S.assist = 0;
    if (block === 'brasa') { firedW.fill(false); firedN = 0; relayHelped = false; S.wavesOwn = 0; S.call.n = 0; S.call.open = false; }
    if (block === 'pinya') { pinyaHelped = false; fullOnce.fill(false); S.castell.state = 'pinya'; }
    if (block === 'tronc') { for (const k of sideK) k[0] = k[1] = 0; ownAcc = 0; collaAcc = 0; lastLevel = true; floorBy.length = 0; S.castell.floorsOwn = 0; S.castell.floorsColla = 0; S.castell.lost = 0; S.castell.state = 'tronc'; }
    if (block === 'pom') { S.castell.state = 'pom'; S.castell.climbers = 0; S.castell.slips = 0; }
    if (block === 'baixada') { S.castell.cracks = 0; S.baixadaStage = 'lower'; }
  }
  function floorGained() { const by = collaAcc > ownAcc ? 'colla' : 'group'; ownAcc = 0; collaAcc = 0; floorBy.push(by); if (by === 'colla') S.castell.floorsColla++; else S.castell.floorsOwn++; achieve('floor', S.floors, -1, by); }
  function floorLost() { const by = floorBy.pop(); if (by === 'colla') S.castell.floorsColla = Math.max(0, S.castell.floorsColla - 1); else if (by) S.castell.floorsOwn = Math.max(0, S.castell.floorsOwn - 1); S.castell.lost++; }
  function bloomAch() { const k = S.bloomSize < 0.45 ? 1 : S.bloomSize < 0.75 ? 2 : 3; S.result.festa = k; achieve('bloom', k, -1, helped.festa ? 'colla' : 'group'); }
  function creak() { S.castell.cracks++; achieve('creak', S.castell.cracks, -1, 'group'); }
  // the calling wall and the colla's help, every step (no rule reads them: they say what the score already does)
  // 'stage:<block>:<stage>' once when each stage opens (S.stage holds it): the voice and the text key their lines on it
  function stageNow() {
    const b = S.block, rw = S.phase === 'reward';
    if (b === 'wait') return S.reveal >= 1 ? 'start' : 'reveal';
    if (b === 'intro') return 'lamps';
    if (b === 'brasa') return rw ? 'reward' : S.brasaStage;
    if (b === 'pinya') return rw ? 'reward' : S.pinyaStage;
    if (b === 'tronc') return rw ? 'reward' : 'lift';
    if (b === 'pom') return S.phase === 'aleta' ? 'aleta' : rw ? 'reward' : S.pomStage;
    if (b === 'festa') return S.festaStage;
    if (b === 'baixada') return S.baixadaStage || 'lower';
    return b;
  }
  function interfaces(now) {
    const st = S.block + ':' + stageNow(); if (st !== S.stage) { S.stage = st; emit('stage:' + st); }
    const B = T[S.block];
    let busiest = -1, bc = 0; for (let w = 0; w < W; w++) if (S.count[w] > bc) { bc = S.count[w]; busiest = w; }
    let assist = false;
    if (S.block === 'wait') setFocus(S.reveal >= 1 ? busiest : -1, 'call');
    else if (S.block === 'brasa') {
      const R = S.relay, C = S.call;
      if (S.brasaStage === 'relay') { setFocus(R.holderWall, 'relay', R.s, R.y); if (R.assist) relayHelped = true; assist = R.assist; }
      else if (S.brasaStage === 'call' && C.n <= 3) setFocus(C.from, 'call');
      else setFocus(-1);
      if (S.phase === 'reward' && S.waves < 3) assist = true;
    } else if (S.block === 'pinya') {
      if (S.phase !== 'reward') {
        if (S.assist > 0) { assist = true; pinyaHelped = true; }
        let anyFull = false; for (let w = 0; w < W; w++) if (fullOnce[w]) anyFull = true;
        let next = -1;
        if (anyFull) for (let w = 0; w < W && next < 0; w++) if (!fullOnce[w] && (fullOnce[(w + 1) % W] || fullOnce[(w + W - 1) % W])) next = w;
        if (next >= 0) setFocus(next, 'next');
        else if (S.focus && S.focus.kind === 'pack' && !fullOnce[S.focus.wall] && S.held[S.focus.wall]) setFocus(S.focus.wall, 'pack');   // sticky
        else { let pw = -1, pc = 0; for (let w = 0; w < W; w++) if (!fullOnce[w] && S.count[w] > pc) { pc = S.count[w]; pw = w; } setFocus(pw, 'pack'); }   // every wall full: nobody is called
      } else setFocus(-1);
    } else if (S.block === 'tronc') {
      if (S.wobble > 0 && S.wobbleWall >= 0) setFocus(S.wobbleWall, 'wobble', undefined, B.foot);
      else { let lw = -1, lv = 0.45; for (let w = 0; w < W; w++) if (S.walls[w] && Math.abs(S.lean[w]) >= lv) { lv = Math.abs(S.lean[w]); lw = w; } setFocus(S.balance ? lw : -1, 'lean'); }
      if (S.phase !== 'reward' && S.assist > 0) assist = true;
    } else if (S.block === 'pom') {
      if (S.phase === 'aleta') setFocus(-1);
      else if (now - breakFocusAt < 1.5 && breakWall >= 0) setFocus(breakWall, 'break');
      else if (S.pomHolder) setFocus(S.pomHolder.wall, 'light', S.pomHolder.s, S.pomHolder.y);
      else setFocus(S.lightWall, 'light');
      if (S.phase === 'play' && S.t > B.target) assist = true;
    } else if (S.block === 'festa') {
      let f = null; for (const x of S.fronts) if (!f || x.at > f.at) f = x;
      setFocus(S.festaStage === 'echo' && f ? f.to : -1, 'echo');
      if (f && f.ghost) assist = true;
    } else if (S.block === 'baixada') { setFocus(-1); if (S.t >= B.max - B.net && S.baixadaStage !== 'free') assist = true; }
    else if (S.block === 'acta') { const p = S.prints[S.prints.length - 1]; setFocus(S.printOpen && p ? p.wall : -1, 'print', p && p.s, p && p.y); }
    else setFocus(-1);
    if (now - collaAt < 3) assist = true;   // the colla just did something: named
    setAssist(assist);
    const c = S.castell; c.floors = S.floors; c.structure = S.structure; c.walls.length = 0; for (let w = 0; w < W; w++) if (S.walls[w]) c.walls.push(w);
  }
  function go(block) { enter(block); S.block = block; S.t = 0; S.tp = 0; S.progress = 0; stuckFor = 0; emptyFor = 0;   /* 24-11: the abandon counts inside a block — after the 70 s intro (nobody touches) the brasa no longer abandons at once */ const interactive = T[block] && typeof T[block] === 'object'; S.phase = interactive && block !== 'festa' && block !== 'baixada' ? 'title' : 'play'; emit('block:' + block); emit('phase:' + S.phase); }
  function phase(p) { S.phase = p; S.tp = 0; stuckFor = 0; emit('phase:' + p); }
  function hint(key) { if (S.clock - lastHint > 25) { lastHint = S.clock; emit('hint:' + key); } }
  function reset(abandoned) {
    if (abandoned) emit('abandon');
    Object.assign(S, { festaStage: 'free', echoHits: 0, bloomSize: 0, bloomDur: 0, brasaStage: 'spark', waveBig: false, start: 0, reveal: 0, touched: 0, waves: 0, closed: 0, structure: 0, beat: 0, pulses: 0, floors: 0, floorProgress: 0, balance: false, climber: 0, climb: 0, lightWall: -1, nextWall: -1, resonance: 0, blooms: 0, outcome: null, passT: 0 });
    S.fill = zeros(0); S.walls = zeros(false); S.lean = zeros(0); S.weak = zeros(0);
    S.values = { forca: 0, equilibri: 0, valor: 0, seny: 0 }; S.stats = { maxHands: 0, maxFloors: 0, stillS: 0 };
    S.relay = relayFresh(); S.lamp = null; S.lamps = []; S.lampN = 0;   // T-055
    TG.clear(); offered = false; S.wavesOwn = 0; S.call.open = false;
    S.focus = null; S.assistOn = ''; S.ach = null; S.targets = TG.list; S.tgProgress = 0; for (const k in helped) delete helped[k];   // 25-11
    S.castell = { state: 'none', walls: [], structure: 0, floors: 0, floorsOwn: 0, floorsColla: 0, climbers: 0, crown: '', slips: 0, cracks: 0, lost: 0 };
    S.result = { brasa: '', pinya: null, tronc: null, pom: '', festa: 0, baixada: '' };
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
    if (from && !back && S.climber === 0) S.climb = Math.min(0.995, S.climb + T.pom.relay.hop);   // 25-11 (B4): every handoff lifts her at once
    if (from) { S.pomHandoffs++; if (S.pomHandoffs === 1 || S.pomHandoffs % 3 === 0) achieve('handoff', S.pomHandoffs, o.wall, 'group', o.s, o.y); }
    S.pomHandoff = { from, to: posOf(o), back, at: S.clock }; emit('handoff:' + o.wall);
  }
  function pomInit() {
    S.climber = 0; S.climb = 0; order = structureWalls(); holderId = null; holdT = 0; goneT = 0; gustAt = breakAt = falterAt = -1e9;
    Object.assign(S, { pomStage: 'relay', pomRest: 0, pomHolder: null, pomFrom: null, pomFly: 1, pomFalter: 0, pomThread: [], pomHandoffs: 0, pomHandoff: null, pomBreath: 0, pomGust: 0, pomHush: 0, restless: false });
  }
  // 25-11 THE RELAY on targets (D3b; plan 05 §4.3, A3, I6). A chain of targets: the fire devil rests on the chain's head; whoever holds
  // it receives the fire and the next link lights 0.8–2.5 m away (toward the next person if there is one, round a corner too); with a
  // group every person has a head near her (several chains at once). Goal: clamp(4 + round(n / 2), 5, 12) links, or once round the
  // room. After relayMax s the colla carries it the rest of the way (named). S.relay keeps its shape for the image and the sound.
  function relayStart(now) {
    const R = S.relay = relayFresh();
    let born = null, bt = -1e9;
    for (const o of S.strokes) { const tr = track.get(o.stroke), lt = tr ? tr.land : 0; if (!born || lt > bt) { born = o; bt = lt; } }
    relayR = born ? perimOf(born.wall, born.dx) : perimOf(0, 0);
    R.s = R.s0 = wrapP(relayR); R.holderWall = wallAtS(relayR); R.y = born ? born.y || 1.1 : 1.1; if (born) R.holder = born.stroke;
    relayGoal = clamp(4 + Math.round(S.n / 2), 5, 12); relayT0 = S.t; R.travel = 0; R.dist = 0; R.lastS = R.s;
    offer({ mode: 'chain', kind: 'relay', goal: relayGoal });
    emit('relay:start');
  }
  function relayStep(dt, now, B) {
    const R = S.relay; if (R.done) return true;
    for (const t of tgDone) {   // a link held: the fire jumps there
      if (t.mode !== 'chain') continue;
      const fw = R.holderWall; R.jumps++; R.jump = { from: fw, to: t.wall, at: now }; R.chain = t.chain; emit('relay:jump');
      R.dist += Math.abs(cdP(t.s, R.lastS)); R.lastS = t.s;   // how far the fire really went, link to link
      let best = null, bd = 1e9; for (const o of S.strokes) { const d = Math.abs(cdP(o.s || perimOf(o.wall, o.dx), t.s)); if (d < bd) { bd = d; best = o; } }
      R.holder = best ? best.stroke : null;
    }
    // the devil goes to the head of its chain (or the nearest head), at a person's pace
    let head = null, hd = 1e9;
    for (const t of TG.list) {
      if (t.state === 'done' || t.mode !== 'chain') continue;
      const d = Math.abs(cdP(t.s, wrapP(relayR))) - (t.chain === R.chain ? 100 : 0);
      if (d < hd) { hd = d; head = t; }
    }
    R.target = head ? { stroke: null, wall: head.wall, s: head.s, y: head.y } : null;
    const want = head ? cdP(head.s, wrapP(relayR)) : 0, v = Math.min(2.5, 0.3 + Math.abs(want) * 1.5);
    R.speed += (v - R.speed) * (1 - Math.exp(-dt / 0.35));
    const move = Math.sign(want) * Math.min(Math.abs(want), R.speed * dt), from = relayR;
    relayR += move; R.travel += Math.abs(move);
    for (let w = 0; w < W; w++) { const a = Math.floor((relayR - S0[w]) / PER), b = Math.floor((from - S0[w]) / PER); if (a !== b) { R.corners++; R.corner = { wall: w, s: S0[w], at: now }; emit('corner'); } }
    R.s = wrapP(relayR); R.holderWall = wallAtS(relayR); if (head) R.y += (head.y - R.y) * (1 - Math.exp(-dt / 0.4));
    R.lap = clamp(Math.max(TG.progress, R.travel / PER), 0, 1);
    if (!R.assist && S.t - relayT0 >= B.relayMax) { R.assist = true; relayHelped = true; emit('relay:assist'); }
    // done: the links AND at least relayMin m of room (a wall: one person walks the fire along it, ~15–20 s), or once round, or the colla
    if ((TG.reached && R.dist >= Math.min(B.relayMin, PER / 2)) || R.travel >= PER || R.assist) {
      R.done = true; R.lap = 1; R.speed = 0; R.target = null; const by = R.assist ? 'colla' : 'group'; R.assist = false;
      emit('relay:lap'); achieve('lap', R.jumps, R.holderWall, by, R.s, R.y); TG.clear(); return true;
    }
    return false;
  }
  function fall(outcome) { S.outcome = outcome; S.castell.state = 'fallen'; if (outcome === 'carregat') S.result.baixada = 'carregat'; emit('fall'); go('fall'); }
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
    for (const [k, tr] of track) if (!seen.has(k)) {   // 25-11 (§4.3 edge fix): remember a lost hand for 1 s, so a new stroke where it was inherits its stillness
      if (lostTr.length >= 32) lostTr.shift();
      lostTr.push({ s: tr.s, y: tr.y, still: tr.still || 0, land: tr.land, at: now });
      track.delete(k);
    }
    while (lostTr.length && now - lostTr[0].at > 1) lostTr.shift();
    for (let w = 0; w < W; w++) {
      const a = wallHands[w];
      if (!a.length) { S.yMed[w] = S.yL[w] = S.yR[w] = S.span[w] = S.rise[w] = 0; spanN[w] = 0; spanTotal[w] = 0; continue; }
      const ys = [], yl = [], yrr = []; let rs = 0;
      for (const h of a) { const tr = track.get(h.stroke), y = tr.y; ys.push(y); if ((h.dx || 0) <= 0) yl.push(y); else yrr.push(y); rs += y - tr.y0; }
      S.yMed[w] = median(ys); S.yL[w] = median(yl); S.yR[w] = median(yrr); S.rise[w] = rs / a.length;
      a.sort((p, q) => (p.dx || 0) - (q.dx || 0));
      let best = 0, bestN = 0, bestX = 0, total = 0;
      for (const h of a) total += h.size > 0 ? h.size : T.hand.size;
      const spanWin = clamp(T.hand.span + 0.25 * (a.length - 4), T.hand.span, 4.5);   // 25-11 (A5): 2 m, wider with a crowd (to 4.5 m)
      for (let i = 0, j = 0, sum = 0; i < a.length; i++) {           // the densest window
        sum += a[i].size > 0 ? a[i].size : T.hand.size;
        while ((a[i].dx || 0) - (a[j].dx || 0) > spanWin) { sum -= a[j].size > 0 ? a[j].size : T.hand.size; j++; }
        if (sum > best) { best = sum; bestN = i - j + 1; bestX = ((a[i].dx || 0) + (a[j].dx || 0)) / 2; }
      }
      S.span[w] = best; spanN[w] = bestN; spanTotal[w] = total; S.packX[w] = bestX;
    }
    strokes = seen; S.hands = seen.size; if (S.hands > S.stats.maxHands) S.stats.maxHands = S.hands;
    S.n = clamp(S.n + (S.hands - S.n) * (1 - Math.exp(-dt / (S.hands > S.n ? 0.22 : 1.75))), 0, 32);   // 25-11: rises in ~0.5 s, falls in ~4 s
    let heldN = 0;
    for (let w = 0; w < W; w++) { S.held[w] = now - lastSeen[w] <= T.linger; if (S.held[w]) heldN++; S.left[w] = now - seenL[w] <= T.linger; S.right[w] = now - seenR[w] <= T.linger; }
    emptyFor = S.hands ? 0 : emptyFor + dt;
    while (downTimes.length && now - downTimes[0] > 1.2) downTimes.shift();
    // the group (25-11, A1/A2): from S.n (the hands present, smoothed), about 1.6 hands a person; recomputed every step — a group that
    // shrinks or grows changes what is asked at once (no peak that takes minutes to come down, nothing frozen before the pinya)
    peak = Math.max(S.hands, peak - dt * 0.05);                // kept for the record (stats); no rule reads it
    S.people = clamp(Math.ceil(S.n / 1.6), 2, 15);
    S.solo = S.n <= 2.2;                                      // one person: the work must be whole with one
    S.needWalls = S.solo ? 1 : Math.min(W, S.people <= 3 ? 2 : S.people <= 7 ? 3 : 4); S.buttons = S.people <= 4 ? 1 : S.people <= 9 ? 2 : 3;
    // the targets (D3b): stepped on this step's hands, before the blocks read what was done
    tgDone.length = 0; tgLadders.length = 0; tgGoal = false;
    TG.step(dt, S.strokes, S.n, now);
    S.targets = TG.list; S.tgProgress = TG.progress;
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
        // I. Brasa (25-11, D3b, plan 05 §4.3 B1): SPARK — fire-targets on every wall: holding one lights that wall's fire (ach:fire);
        // when min(4, walls with hands) fires are lit (after the card), or at B.spark s → THE RELAY (a chain of targets, relayStep) →
        // THREE CALLS (callStep: together, need 35 % → 50 % → 65 % of the group, 1 to 6 targets held at once). Never a strike.
        S.touched += downs;
        const C = S.call;
        if (S.brasaStage === 'spark') {
          if (!offered) { offer({ mode: 'field', kind: 'fire', pairs: true }); offered = true; }
          for (const t of tgDone) if (!firedW[t.wall]) { firedW[t.wall] = true; firedN++; achieve('fire', firedN, t.wall, 'group', t.s, t.y); }
          let withHands = 0; for (let w = 0; w < W; w++) if (S.held[w]) withHands++;
          const wantFires = Math.min(4, Math.max(1, withHands));
          S.progress = clamp(firedN / wantFires, 0, 1) * 0.25;
          if ((firedN >= wantFires && S.t >= T.title) || S.t >= B.spark) { S.brasaStage = 'relay'; relayStart(now); }
        } else if (S.brasaStage === 'relay') {
          S.progress = 0.25 * (1 + S.relay.lap);
          if (relayStep(dt, now, B)) { S.brasaStage = 'call'; hint('together'); C.n = 1; C.open = false; C.pauseUntil = now + 1; }
        } else {
          if (C.n <= 3) {
            const k = callStep(C, B, now, B.fracs, 'call', 'brasa');
            if (k) { S.waves++; if (k === 1) S.wavesOwn++; }
          }
          S.progress = clamp(0.25 + Math.min(3, S.waves) * 0.25, 0, 1);
        }
        stuckFor += dt; if (downs) stuckFor = Math.max(0, stuckFor - 4);
        if (S.phase === 'play' && ((S.waves >= 3 && S.t >= B.min) || S.t >= B.max - B.reward)) {
          if (S.waves < 3) { collaAt = now; helped.brasa = true; }   // the room wakes anyway: the colla, named
          TG.clear(); emit('awake'); S.result.brasa = S.wavesOwn >= 3 ? 'encesa' : 'ajudada';
          achieve('awake', S.wavesOwn, -1, S.wavesOwn >= 3 ? 'group' : 'colla'); phase('reward');
        }
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) go('pinya'); }
    } else if (S.block === 'pinya') {
      if (playing) {
        // II. Pinya = GATHER (25-11, D3b/D8, plan 05 A2/A5/A6/B2). PALM: palm-targets — holding one, a figure puts her weight on you
        // ('palm'); then PACK: the hands gather toward the wall's centre and the wall fills by how packed they are (the window widens
        // with the crowd: clamp(2 + 0.25 × (hands − 4), 2, 4.5) m). The STRUCTURE = the walls FILLED during the block (one after the other
        // counts: one person who fills two walls makes a torre), at least one. It closes when the walls asked NOW (needNow = clamp(walls
        // with hands, 1, needWalls)) have been filled and a filled wall is held for B.hold s. From B.net s the colla closes the gap (named).
        S.pinyaStage = S.t < B.palm ? 'palm' : 'pack';
        if (S.pinyaStage === 'palm') { if (!offered) { offer({ mode: 'field', kind: 'palm', pairs: true }); offered = true; } for (const t of tgDone) emit('palm'); }
        else if (offered) { TG.clear(); offered = false; }
        let filled0 = 0, hands0 = 0; for (let w = 0; w < W; w++) { if (fullOnce[w]) filled0++; if (S.count[w]) hands0++; }
        S.assist = filled0 >= clamp(hands0, 1, S.needWalls) ? 0 : clamp((S.tp - B.net) / 10, 0, 1);   // the colla only while the walls asked are not filled yet
        let packedHands = 0;
        for (let w = 0; w < W; w++) {
          const nf = Math.max(B.nearFull, LEN[w] / 2), nz = Math.max(B.nearZero, nf + 0.5);
          const frac = S.count[w] ? spanN[w] / S.count[w] : 0, near = clamp(1 - (Math.abs(S.packX[w]) - nf) / Math.max(0.05, nz - nf), 0, 1);
          S.pack[w] = S.count[w] >= 1 ? clamp((frac - 0.5) / 0.3, 0, 1) * near : 0;
          const wasPacked = S.packed[w]; S.packed[w] = S.pack[w] >= 0.9 || (wasPacked && S.pack[w] >= 0.75);
          if (S.packed[w] && !wasPacked) emit('pack:' + w);
          if (S.packed[w]) packedHands += spanN[w];
        }
        if (S.hands && packedHands >= S.hands / 2) learn('pinya');
        for (let w = 0; w < W; w++) {
          const before = S.fill[w], r = B.pack, k = Math.max(clamp((S.pack[w] - r[0]) / (r[1] - r[0]), 0, 1), S.count[w] ? S.assist * 0.6 : 0);
          S.fill[w] = S.count[w] > 0 && k > 0 ? Math.min(1, S.fill[w] + (dt / B.fill) * k) : Math.max(0, S.fill[w] - dt / 40);
          if (before < 1 && S.fill[w] >= 1) { emit('wall:' + w); if (!fullOnce[w]) { fullOnce[w] = true; achieve('wallfull', fullOnce.filter(Boolean).length, w, S.assist > 0 ? 'colla' : 'group'); } }
        }
        let withHands = 0, filled = 0, heldFull = false;
        for (let w = 0; w < W; w++) { if (S.count[w]) withHands++; if (fullOnce[w]) filled++; if (fullOnce[w] && S.held[w] && S.fill[w] >= 0.6) heldFull = true; }
        const needNow = clamp(withHands, 1, S.needWalls);
        holdAll = filled >= needNow && heldFull ? holdAll + dt : Math.max(0, holdAll - dt * 2);
        S.closed = clamp(holdAll / B.hold, 0, 1);
        const top = S.fill.slice().sort((a, b) => b - a).slice(0, needNow).reduce((a, b) => a + b, 0) / needNow;
        S.progress = clamp(Math.max(top, Math.min(1, filled / needNow)) * 0.8 + S.closed * 0.2, 0, 1);
        if (S.tp > 20 && filled < needNow) hint('more'); else if (filled >= needNow && S.closed < 1 && S.tp > 30) hint('hold');
        const timeUp = S.t >= B.max - B.reward;
        if ((S.closed >= 1 && S.t >= B.min) || timeUp) {
          // the structure: the walls filled (at least the fullest one)
          S.walls = zeros(false); let n = 0;
          for (let w = 0; w < W; w++) if (fullOnce[w]) { S.walls[w] = true; n++; }
          if (!n) { let bw = 0; for (let w = 1; w < W; w++) if (S.fill[w] > S.fill[bw]) bw = w; S.walls[bw] = true; n = 1; }
          S.structure = n;
          fillSpeed = clamp(1 - (S.t - B.min) / (B.max - B.min), 0, 1);
          const byG = S.closed >= 1 && !pinyaHelped && S.assist <= 0;
          S.result.pinya = { n: S.structure, by: byG ? 'group' : 'colla' }; S.castell.structure = S.structure;
          S.closed = 1; TG.clear(); emit('close'); achieve('close', S.structure, -1, byG ? 'group' : 'colla'); phase('reward');
        }
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) { beatT = 0; evalAt = 0; phraseClock = 0; wobbles = 0; S.wobble = 0; S.wobbleWall = -1; S.phrase = 'gather'; go('tronc'); } }
    } else if (S.block === 'tronc') {
      // III. Tronc = LIFT and LEVEL on LADDERS (25-11, D3b, plan 05 §4.3, A7–A9, B3). Ladder-targets on both sides of every wall: a low
      // rung (0.9 m), then one 0.35 m higher (to 1.6 m; a child's ladder 0.7 → 1.05 → 1.4 is always offered too). A whole ladder lifts the
      // tower: clamp(ceil(0.5 × n / 1.6), 1, 6) ladders a floor (a ladder on a wall without the tower counts B.help), at most one floor
      // every B.every s (a crowd does not rush it). The tower leans toward the side that is ahead in ladders (judged only with ≥ 2 hands
      // on the wall); a leaning wall's ladders count × 0.7. Once at the penultimate floor (twice if well ahead) it WOBBLES: foot-targets
      // (0.6–0.9 m) on every tower wall, clamp(ceil(0.25 × hands of the wobbling wall), 1, 4) held within B.wobble s, or it loses a floor
      // in view. The colla gives a floor after B.colla s without one, but only up to 5 (named). The music's pulse and phrase keep
      // running (S.beat, S.phrase): they no longer judge.
      const sw = structureWalls(), inSW = (w) => S.walls[w];
      S.balance = S.floors >= 3;
      for (let w = 0; w < W; w++) { sideK[w][0] *= Math.exp(-dt / 25); sideK[w][1] *= Math.exp(-dt / 25); }
      for (const w of sw) {
        let target = 0;
        if (S.balance && S.count[w] >= 2 && S.left[w] && S.right[w]) target = clamp((sideK[w][1] - sideK[w][0]) / 2, -1, 1);
        if (S.wobbleWall === w && S.wobble > 0) target = Math.sign(target || 1) * Math.max(Math.abs(target), 0.6 + 0.3 * Math.sin(now * 3.1));
        S.lean[w] += (target - S.lean[w]) * (1 - Math.exp(-dt * 0.8));
      }
      S.level = sw.every((w) => Math.abs(S.lean[w]) < 0.45);
      for (let w = 0; w < W; w++) if (S.count[w]) S.band[w] += (S.yMed[w] - S.band[w]) * (1 - Math.exp(-dt * 6));   // the shoulders follow the hands
      if (playing) {
        beatT += dt;
        if (beatT >= B.period) { beatT -= B.period; S.pulses++; emit('pulse'); }
        S.beat = beatT / B.period;
        phraseClock += dt; if (phraseClock >= B.phrase) phraseClock -= B.phrase;
        const f = phraseClock / B.phrase; S.phraseT = f; S.phrase = f < 0.25 ? 'gather' : f < 0.75 ? 'rise' : 'lock';
        if (!offered) { offer({ mode: 'ladder', kind: 'rung', shape: 'rect', w: 0.6, h: 0.4, sides: true, rungs: B.rungs, kidRungs: B.kidRungs }); offered = true; lastFloorAt = S.t; ladderAcc = 0; }
        // the rungs climbed show on each wall (S.liftK: the highest rung reached on the wall, 0..1)
        for (let w = 0; w < W; w++) { let k = 0; for (const t of TG.list) if (t.wall === w && t.mode === 'ladder' && t.rung >= 0) k = Math.max(k, (t.rung + (t.state === 'done' ? 1 : t.charge)) / B.rungs.length); S.liftK[w] += (k - S.liftK[w]) * (1 - Math.exp(-dt * 4)); S.lifters[w] = 0; S.bases[w] = 0; }
        if (S.wobble > 0) {                                   // the tower trembles: hands to its foot, or it slips
          wobbleT += dt; S.wobble = clamp(wobbleT / B.wobble, 0.001, 1);
          if (wobbleT > 1.5 && TG.progress < 0.5) hint('foot');
          if (TG.reached) { emit('steady'); achieve('steady', S.floors, S.wobbleWall, 'group'); S.wobble = 0; S.wobbleWall = -1; offered = false; lastFloorAt = S.t; }
          else if (wobbleT >= B.wobble) { emit('slip'); const ww = S.wobbleWall; if (S.floors > 0) floorLost(); S.floors = Math.max(0, S.floors - 1); S.floorProgress = 0; S.wobble = 0; S.wobbleWall = -1; offered = false; lastFloorAt = S.t; achieve('slip', S.floors, ww, 'group'); }
        } else {
          for (const t of tgLadders) {
            const k = (inSW(t.wall) ? 1 : B.help) * (S.balance && Math.abs(S.lean[t.wall] || 0) >= 0.45 ? 0.7 : 1);
            ladderAcc += k; ownAcc += k; sideK[t.wall][t.side < 0 ? 0 : 1] += 1; learn('tronc'); emit('lift');
            if (S.balance) { levelEval++; if (S.level) { levelOk++; emit('level'); } else emit('balance'); }
            if (S.balance && S.level !== lastLevel) { lastLevel = S.level; let lw = -1, lv = 0; for (const w of sw) if (Math.abs(S.lean[w]) > lv) { lv = Math.abs(S.lean[w]); lw = w; } achieve(S.level ? 'level' : 'lean', S.floors, lw, 'group'); }
          }
          const needL = clamp(Math.ceil((B.needK * S.n) / 1.6), 1, 6);
          S.floorProgress = clamp(ladderAcc / needL, 0, 1);
          let gained = false;
          if (ladderAcc >= needL && S.t - lastFloorAt >= B.every && S.floors < 9) { ladderAcc -= needL; gained = true; }
          else if (S.t - lastFloorAt >= B.colla && S.floors < 5) { collaAcc += 10; collaAt = now; helped.tronc = true; gained = true; }   // the colla, named
          else if (S.t - lastFloorAt >= B.colla * 0.6 && S.floors < 5) hint('lift');
          if (gained) {
            S.floors++; lastFloorAt = S.t; S.stats.maxFloors = Math.max(S.stats.maxFloors, S.floors); emit('floor'); floorGained();
            const first = wobbles === 0 && (S.floors === 7 || (S.floors >= 4 && S.t >= B.target - 10));   // the penultimate floor (or late)
            const second = wobbles === 1 && S.floors === 8 && firstWobbleAt < B.target - 30;               // twice if the group is well ahead
            if (first || second) {
              if (!wobbles) firstWobbleAt = S.t; wobbles++; S.wobble = 0.001; wobbleT = 0; steadyT = 0;
              let bw = sw[0] ?? 0, bc = -1; for (const w of sw) if (S.count[w] > bc) { bc = S.count[w]; bw = w; } S.wobbleWall = bw;   // A8: the tower wall with most hands
              const handsW = S.count[bw] || 0, walls = S.count[bw] ? sw : sw.length ? sw : [bw];
              offer({ mode: 'field', kind: 'foot', shape: 'rect', w: 0.8, h: 0.4, walls, y: B.footY, goal: clamp(Math.ceil(0.25 * handsW), 1, 4) }); offered = true;
              emit('wobble');
            }
          }
        }
        S.progress = clamp((S.floors + S.floorProgress) / 9, 0, 1);
        pulsesEval = levelEval; pulsesBalanced = levelOk;                 // the acta's equilibri: the share of ladders with every tower straight
        if (S.wobble === 0 && ((S.floors >= 9 && S.t >= B.min) || (S.t >= B.target && S.floors >= 5) || S.t >= B.max - B.reward)) {
          const c = S.castell, by = c.floorsColla > 0 && c.floorsOwn < 6 ? 'colla' : 'group';
          TG.clear(); S.result.tronc = { floors: S.floors, own: c.floorsOwn, colla: c.floorsColla, by }; achieve('tower', S.floors, -1, by); phase('reward');
        }
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
        let nPres = 0, nStill = 0, moveW = -1, gustD = 0, gustW = -1, nGust = 0, nMoving = 0;
        for (const o of S.strokes) { nPres++; if (o.disp > B.gust) nGust++; if (o.disp > B.still) { const tr = track.get(o.stroke); if (!tr || now - tr.land >= B.arriving) nMoving++; } if (o.disp <= B.still) nStill++; else { if (moveW < 0) moveW = o.wall; if (o.disp > gustD) { gustD = o.disp; gustW = o.wall; } } }
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
            gain = nPres <= 1 ? R.one : R.base; still = 1;
            if (!flying) { holdT += dt; const every = clamp(16 / Math.max(1, nStill), 1.5, R.every); if (holdT >= every && cand && !resting) handTo(cand, false); }   // A10
          } else if (flying) gain = nPres <= 1 ? R.one : R.base;                         // in the air between two hands
        } else if (S.pomStage === 'breath') {
          S.pomGust = Math.max(0, S.pomGust - dt / 1.5);
          if (nGust >= Math.max(1, Math.ceil(0.2 * nPres)) && now - gustAt >= B.gustGap) { gustAt = now; S.pomGust = 1; emit('gust:' + gustW); }
          const Br = B.breath;
          S.pomBreath = nStill ? share * share * (Br.slow + Br.more * Math.min(1, (nStill - 1) / Br.many)) : 0;
          S.restless = nStill < nPres;
          gain = S.pomGust > 0.3 ? 0 : S.pomBreath; still = share;
        } else {
          const all = nPres > 0 && nMoving <= Math.min(4, Math.floor(0.15 * nPres));   // A12: a few moving (and the ones arriving) do not break it
          S.pomHush += ((all ? 1 : nPres ? 0.5 * share : 0) - S.pomHush) * (1 - Math.exp(-dt / 0.5));
          S.restless = nPres > 0 && !all;
          if (S.restless && !resting) { if (now - breakAt >= B.breakGap && breaksThis < B.breaksMax) { breakAt = now; breaksThis++; S.climb = Math.max(0, S.climb - B.breakCost); emit('hush:break:' + moveW); S.castell.slips++; breakFocusAt = now; breakWall = moveW; achieve('break', S.castell.slips, moveW, 'group'); } }
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
          emit('arrived:' + S.climber); S.castell.climbers = S.climber + 1; achieve('arrived', S.climber, S.lightWall, S.t > B.target ? 'colla' : 'group');
          breaksThis = 0;
          if (S.climber < 2) { S.climber++; S.climb = 0; S.pomRest = B.rest; S.pomStage = POM_STAGES[S.climber]; S.pomGust = 0; S.pomFalter = 0; S.restless = false; emit('climber:' + S.climber); }
          else { S.climb = 1; S.pomHush = 1; S.result.pom = S.castell.slips <= 1 ? 'net' : 'patit'; phase('reward'); }   // she arrives: B.reward s of silence, then l'aleta
        }
        S.progress = clamp((S.climber + Math.min(1, S.climb)) / 3, 0, 1);
        if (S.phase !== 'reward' && emptyFor >= B.empty) fall('intent');            // only an empty room falls (20 s, warned at 10)
        else if (S.phase === 'play' && S.t >= B.max) { S.result.pom = 'patit'; phase('reward'); }            // at max it crowns (narrow if they did not get far), never falls
      } else if (S.phase === 'reward') {
        S.progress = 1;
        if (S.tp >= B.reward) {
          phase('aleta'); aletaBase.clear(); aletaRose.clear(); for (const o of S.strokes) aletaBase.set(o.stroke, o.y);
          // 25-11 (D3b): a crown-target above every hand (≤ 12) and one on every wall at 1.5 m: raising a hand onto it counts too
          const A = T.aleta; offer({ mode: 'manual', kind: 'crown' });
          let k = 0; for (const o of S.strokes) { if (k++ >= 12) break; const y0 = o.y || 1.2; const c0 = y0 + (y0 < 1.15 ? 0.25 : 0.3), c1 = y0 < 1.15 ? Math.max(c0 + 0.4, 1.55) : Math.min(2.25, Math.max(c0 + 0.5, A.top)); TG.place({ wall: o.wall, dx: o.dx, shape: 'pillar', w: 0.45, y0: c0, y1: c1, kind: 'crown' }); }   // a column of light from just above the hand: raise it along (a low hand, a child's: within her reach)
          for (let w = 0; w < W; w++) TG.place({ wall: w, dx: 0, shape: 'pillar', w: 0.5, y0: 1.3, y1: 2.15, kind: 'crown' });
        }
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
        for (const t of tgDone) {   // a crown-target held: the hand on it rose
          let best = null, bd = 1e9; for (const o of S.strokes) { if (o.wall !== t.wall) continue; const d = Math.hypot(o.dx - t.dx, o.y - t.y); if (d < bd) { bd = d; best = o; } }
          if (best && !aletaRose.has(best.stroke)) { aletaRose.set(best.stroke, now); risen++; recent++; }
        }
        S.aletaHands = present ? Math.min(1, risen / present) : 0;
        const quorum = present <= 4 ? A.quorum : present >= 12 ? A.quorumMany : A.quorum + ((A.quorumMany - A.quorum) * (present - 4)) / 8;   // A13
        const byQuorum = !!present && recent / present >= quorum;
        if (byQuorum || S.tp >= A.window) {
          S.aletaWidth = clamp(0.15 + 0.85 * S.aletaHands * (1 - 0.5 * Math.min(1, S.tp / A.window)), 0, 1);
          if (S.aletaHands >= 0.5) learn('aleta');
          S.castell.crown = byQuorum ? 'ample' : 'justa'; S.castell.state = 'crowned';
          emit('aleta'); emit('crown'); achieve('crown', S.castell.climbers, -1, byQuorum ? 'group' : 'colla'); go('crown');
        }
      }
    } else if (S.block === 'crown') {
      S.progress = S.t / T.crown; if (S.t >= T.crown) { S.resonance = 0; go('festa'); }
    } else if (S.block === 'festa') {
      // V. La ressonància (25-11, D3b, plan 05 §4.3, A14/A15, B6). FREE: ring-targets everywhere; every one held opens a big ring and
      // adds resonance (landings only make the free wave, they count nothing). ECHO: the room sends a wave across; it lights a target on
      // the wall where it arrives, which waits B.echoLife s for somebody to hold it («Devolvedla») — held, it goes back across, bigger;
      // ≤ clamp(ceil(n / 5), 1, 4) fronts at once; with ≤ 2 people it arrives on their own wall. Nobody returns one for B.ghost s: the
      // room returns it (the colla, named). THE CALL ×4 (callStep, each bigger). The BLOOM, always: its size by how together they were.
      if (S.t < dt * 1.5) { unisonSum = 0; S.fronts.length = 0; S.echoHits = 0; S.bloomSize = 0; S.bloomDur = 0; festaEndAt = -1; lastEcho = now; S.call.n = 0; S.call.open = false; offered = false; frontLaunch = -1e9; }
      const stage = festaEndAt >= 0 ? 'bloom' : S.t < B.free ? 'free' : S.t < B.echo ? 'echo' : 'call';
      if (stage !== S.festaStage) { S.festaStage = stage; offered = false; if (stage === 'call' || stage === 'bloom') { S.fronts.length = 0; } }
      const ppl = Math.max(1, S.n / 1.6);
      S.resonance = clamp(S.resonance + dt * (0.004 * Math.min(12, S.hands) - 0.03), 0, 1.2);
      if (stage === 'free') {
        // FREE (25-11, Beltrán): no targets, nothing to complete — every hand answers and the room plays; only presence adds resonance
        if (offered) { TG.clear(); offered = false; }
      } else if (stage === 'echo') {
        if (!offered) { offer({ mode: 'manual', kind: 'echo' }); offered = true; }
        const maxF = clamp(Math.ceil(S.n / 5), 1, 4);
        let busiest = 0, bc = -1; for (let w = 0; w < W; w++) if (S.count[w] > bc) { bc = S.count[w]; busiest = w; }
        const arrival = (from) => (S.people <= 2 && S.n <= 2.2 ? busiest : W >= 4 ? (from + 2) % W : (from + 1) % W);
        const launch = (from, gen, ghost) => { const to = arrival(from), dir = Math.sign(cdP(perimOf(to, 0), perimOf(from, 0))) || (frontId % 2 ? -1 : 1); S.fronts.push({ id: ++frontId, from, to, dir, at: now, arrive: now + B.travel, gen: Math.min(4, gen), ghost, tg: 0, placedAt: 0 }); frontLaunch = now; emit(ghost ? 'ghost' : 'front'); };
        // the room sends the first ones (staggered); later ones are the returns
        if (S.fronts.length < maxF && now - frontLaunch >= 4 && (S.fronts.length === 0 || S.n > 5)) launch((busiest + 2) % W, 0, false);
        for (let i = S.fronts.length - 1; i >= 0; i--) {
          const f = S.fronts[i];
          if (!f.tg && now >= f.arrive) {                  // it arrives: a target lights on that wall, near a hand there if any
            let dx = 0, y = 1.2, bd = 1e9; for (const o of S.strokes) if (o.wall === f.to) { const d = Math.abs(o.dx); if (d < bd) { bd = d; dx = o.dx + (o.dx > 0 ? -0.5 : 0.5); y = clamp(o.y || 1.2, 0.9, 1.4); } }
            const t = TG.place({ wall: f.to, dx, shape: 'pillar', w: 0.5, y0: 0.6, y1: 2.2, kind: 'echo', life: B.echoLife, dir: f.dir }); f.tg = t ? t.id : -1; f.placedAt = now;
          }
          if (f.tg > 0) {
            const done = tgDone.find((t) => t.id === f.tg);
            if (done) {
              S.fronts.splice(i, 1); S.echoHits++; learn('festa'); lastEcho = now; S.resonance += 0.12 / Math.sqrt(ppl);
              emit('echo'); achieve('echo', S.echoHits, f.to, 'group', done.s, done.y);
              if (S.fronts.length < maxF) launch(f.to, f.gen + 1, false);
              continue;
            }
          }
          if (f.tg && now - f.placedAt >= B.echoLife) {     // nobody held it
            S.fronts.splice(i, 1);
            if (now - lastEcho > B.ghost && S.fronts.length < maxF) { lastEcho = now; collaAt = now; helped.festa = true; launch(f.to, f.gen + 1, true); }
          }
        }
      } else if (stage === 'call') {
        if (S.call.n === 0) { S.call.n = 1; S.call.open = false; S.call.pauseUntil = now; }
        if (S.call.n <= B.calls) {
          const k = callStep(S.call, B, now, B.fracs, 'call', 'festa');
          if (k) {
            S.resonance += 0.22 * k; unisonSum += k === 1 ? 1 : 0.25;   // the colla's calls barely count for the bloom
            if (S.call.n > B.calls) {                                // the last one: the room flowers, always
              S.bloomSize = clamp(0.2 + 0.5 * (unisonSum / B.calls) + 0.3 * Math.min(1, S.echoHits / clamp(S.n / 1.6, 2, 6)), 0, 1); S.bloomDur = 4 + 4 * S.bloomSize;
              bloomAt = now; S.blooms++; emit('bloom'); bloomAch(); festaEndAt = now + S.bloomDur; TG.clear();
            }
          }
        }
      }
      S.progress = clamp(S.resonance, 0, 1);
      if ((festaEndAt >= 0 && now >= festaEndAt) || S.t >= B.max) {
        if (!S.blooms) { S.bloomSize = clamp(0.2 + 0.5 * (unisonSum / B.calls) + 0.3 * Math.min(1, S.echoHits / clamp(S.n / 1.6, 2, 6)), 0, 1); S.bloomDur = 0; S.blooms++; emit('bloom'); bloomAch(); }   // never leaves without its bloom
        TG.clear(); downT = 0; go('baixada');
      }
    } else if (S.block === 'baixada') {
      // La bajada = BRING IT DOWN on LADDERS (25-11, D3b, plan 05 §4.3, A16, B7). Ladders that go DOWN (1.5 → 1.2 → 0.9 → 0.6 m; a
      // child's 1.3 → 1.0 → 0.7): each one held rung by rung (≈ 1 s a rung: the charge sets the pace, no speed is judged) brings two
      // floors down. It CRACKS only when the room lets go in the middle of a ladder (no wall held for linger + 1 s): two floors drop at
      // once; B.drop of those in a row = carregat. The clock lowers it only as a net in the last B.net s (named); the last floor never
      // comes down before `min`.
      const anyHeld = S.held.some((v) => v);
      if (S.t < dt * 1.5) { crackedThis = false; dropT = 0; S.descents = 0; S.dropped = 0; downT = 0; cracksB = 0; offered = false; }
      if (!offered) { offer({ mode: 'ladder', kind: 'down', shape: 'rect', w: 0.6, h: 0.4, rungs: B.rungs, kidRungs: B.kidRungs }); offered = true; }
      if (emptyFor >= B.empty / 2 && S.floors > 2 && S.warn !== 'fall') { S.warn = 'fall'; emit('warn:fall'); }   // half the deadline: it creaks
      if (!anyHeld && emptyFor >= B.empty && S.floors > 2) { fall('carregat'); return S; }
      for (let w = 0; w < W; w++) if (S.count[w]) S.band[w] += (S.yMed[w] - S.band[w]) * (1 - Math.exp(-dt * 6));
      const lowerFloors = (n) => { for (let i = 0; i < n && S.floors > (S.t < B.min ? 1 : 0); i++) { S.floors--; emit('down'); achieve('down', S.floors, -1, S.assistOn ? 'colla' : 'group'); } };
      // how far down the most advanced ladder is (the image lowers the band with it)
      let mid = false, k = 0;
      for (const t of TG.list) if (t.mode === 'ladder' && t.rung > 0 && t.state !== 'done') { mid = true; k = Math.max(k, (t.rung + t.charge) / B.rungs.length); }
      S.lowerK += (k - S.lowerK) * (1 - Math.exp(-dt * 4));
      // let go in the middle of a ladder: it drops (two floors, a crack); B.drop in a row and it falls
      if (mid && !anyHeld) {
        dropT += dt;
        if (dropT >= 1) { dropT = 0; S.dropped++; cracksB++; crackedThis = true; emit('crack'); creak(); lowerFloors(2); offered = false; if (S.dropped >= B.drop) { fall('carregat'); return S; } }
      } else dropT = 0;
      for (const t of tgLadders) {                             // a ladder, complete
        S.descents++; if (!crackedThis) { S.dropped = 0; achieve('clean', S.descents, t.wall, 'group', t.s, t.y); } emit('lower'); learn('baixada'); lowerFloors(2);
        crackedThis = false;
      }
      if (S.t >= B.max - B.net) { downT += dt; const every = Math.max(0.6, (B.max - S.t) / Math.max(1, S.floors + 0.5)); if (downT >= every) { downT = 0; lowerFloors(1); } }   // the net
      if (S.baixadaStage !== 'free' && (S.floors === 0 || S.t >= B.max)) {   // down: the result, then B.coda s of FREE play (no targets) before the acta
        S.floors = 0; TG.clear(); offered = true; S.outcome = 'descarregat'; S.result.baixada = S.castell.cracks ? 'cruixit' : S.descents ? 'net' : 'ajudada'; S.castell.state = 'down';   // ajudada: only the clock brought it down
        S.baixadaStage = 'free'; codaAt = S.t;
      }
      if (S.baixadaStage === 'free' && S.t - codaAt >= B.coda) { finish(); go('acta'); }
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
    interfaces(now);
    return S;
  }

  /** The line of the acta, as the colles write it: "3 de 7 · descarregat". */
  function acta() {
    const kind = S.structure === 1 ? 'pilar' : String(S.structure || 0);
    // 25-11 (B8): what the group did and what the colla did — the acta tells them apart
    const c = S.castell, r = S.result;
    return { castell: `${kind} de ${S.stats.maxFloors}`, structure: STRUCTURES[S.structure] || '', floors: S.stats.maxFloors, outcome: S.outcome, hands: S.stats.maxHands, prints: S.prints.length, people: S.people, stillS: Math.round(S.stats.stillS), values: { ...S.values },
      floorsOwn: c.floorsOwn, floorsColla: c.floorsColla, crown: c.crown, slips: c.slips, cracks: c.cracks,
      result: { brasa: r.brasa, pinya: r.pinya ? { ...r.pinya } : null, tronc: r.tronc ? { ...r.tronc } : null, pom: r.pom, festa: r.festa, baixada: r.baixada },
      helped: Object.keys(helped).filter((k) => helped[k]) };
  }
  /** Rehearsal: go to a block with a plausible state. */
  function jump(block) {
    if (!BLOCKS.includes(block)) return;
    if (block === 'wait') { reset(false); return; }
    const after = (b) => BLOCKS.indexOf(block) > BLOCKS.indexOf(b);
    if (after('pinya') && !S.structure) { const n = Math.min(W, Math.max(S.solo ? 1 : 2, S.needWalls)); S.walls = zeros(false); for (let w = 0; w < n; w++) S.walls[w] = true; S.structure = n; S.fill = S.walls.map((v) => (v ? 1 : 0)); S.closed = 1; }
    if (after('tronc') && S.floors < 5) { S.floors = 7; S.stats.maxFloors = Math.max(S.stats.maxFloors, 7); }
    if (block === 'brasa') { S.brasaStage = 'spark'; S.wavesOwn = 0; S.waves = 0; S.touched = 0; S.call.n = 0; S.waveBig = false; S.relay = relayFresh(); }
    if (block === 'tronc') { S.floors = 0; S.floorProgress = 0; beatT = 0; evalAt = 0; phraseClock = 0; wobbles = 0; S.wobble = 0; S.wobbleWall = -1; }
    if (block === 'pom') pomInit();
    if (block === 'fall') S.outcome = S.outcome || 'intent';
    if (block === 'acta') { S.outcome = S.outcome || 'descarregat'; finish(); }
    if (block === 'baixada') downT = 0;
    go(block);
  }
  return { state: S, step, acta, jump, times: T };
}
