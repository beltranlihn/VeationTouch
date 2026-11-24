// Ressonància — the score: the whole 10-minute work as a pure state machine (no DOM, no GL, no audio). See GUION.md.
//
// It reads only what the room knows — how many hands, on which walls, on which side of a wall's centre, when they land, how still
// they are — and walks the pass:
//
//   wait     embers; the public starts the pass by holding the walls
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
  intro: 70,
  title: 6,                                  // the chapter card
  brasa: { min: 45, target: 60, max: 75, reward: 7 },
  pinya: { min: 75, target: 105, max: 135, reward: 8, fill: 12, hold: 3 },
  tronc: { min: 105, target: 135, max: 165, reward: 6, period: 2.4, late: 0.35, fresh: 0.6 },
  pom: { min: 70, target: 90, max: 120, reward: 3, climb: [18, 20, 22], empty: 12, stillSpeed: 0.3 },
  crown: 25,
  festa: { min: 50, target: 65, max: 75 },
  baixada: { min: 30, target: 40, max: 50, empty: 6 },
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
    start: 0,                                                // wait: the start ring
    touched: 0, waves: 0,                                    // brasa
    fill: zeros(0), closed: 0,                               // pinya: each wall's circles, the circle closing
    walls: zeros(false), structure: 0,                       // the castell's structure, set when the pinya closes
    beat: 0, pulses: 0, floors: 0, floorProgress: 0, lean: zeros(0), weak: zeros(0), balance: false,   // tronc
    climber: 0, climb: 0, lightWall: -1, nextWall: -1, restless: false,                                 // pom
    resonance: 0, blooms: 0,                                 // festa
    outcome: null,
    values: { forca: 0, equilibri: 0, valor: 0, seny: 0 },   // the acta's four bars, 0..1
    stats: { maxHands: 0, maxFloors: 0, stillS: 0 },
    events: [],   // drained by the caller: 'block:x' 'phase:x' 'start' 'wave' 'awake' 'wall:n' 'close' 'pulse' 'floor' 'weak' 'balance' 'climber:n' 'arrived:n' 'crown' 'bloom' 'down' 'fall' 'hint:x' 'abandon'
  };
  const lastSeen = zeros(-1e9), lastDown = zeros(-1e9), seenL = zeros(-1e9), seenR = zeros(-1e9);
  let strokes = new Set(), peak = 0, emptyFor = 0, lastHint = -1e9, stuckFor = 0;
  let downTimes = [], waveAt = -1e9, holdAll = 0, beatT = 0, evalAt = 0, pulseAt = 0, pulsesBalanced = 0, pulsesEval = 0, fillSpeed = 0;
  let stillT = 0, pomT = 0, downT = 0, festaClusterAt = -1e9, festaCluster = 0, bloomAt = -1e9, order = [];

  const emit = (e) => S.events.push(e);
  function go(block) { S.block = block; S.t = 0; S.tp = 0; S.progress = 0; stuckFor = 0; const interactive = T[block] && typeof T[block] === 'object'; S.phase = interactive && block !== 'festa' && block !== 'baixada' ? 'title' : 'play'; emit('block:' + block); emit('phase:' + S.phase); }
  function phase(p) { S.phase = p; S.tp = 0; stuckFor = 0; emit('phase:' + p); }
  function hint(key) { if (S.clock - lastHint > 25) { lastHint = S.clock; emit('hint:' + key); } }
  function reset(abandoned) {
    if (abandoned) emit('abandon');
    Object.assign(S, { start: 0, touched: 0, waves: 0, closed: 0, structure: 0, beat: 0, pulses: 0, floors: 0, floorProgress: 0, balance: false, climber: 0, climb: 0, lightWall: -1, nextWall: -1, resonance: 0, blooms: 0, outcome: null, passT: 0 });
    S.fill = zeros(0); S.walls = zeros(false); S.lean = zeros(0); S.weak = zeros(0);
    S.values = { forca: 0, equilibri: 0, valor: 0, seny: 0 }; S.stats = { maxHands: 0, maxFloors: 0, stillS: 0 };
    peak = 0; pulsesBalanced = 0; pulsesEval = 0; fillSpeed = 0; stillT = 0; pomT = 0;
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

  /** hands: [{ stroke, wall (index), dx (metres from the wall's centre, + to the right), speed (m/s) }] — the hands down now. */
  function step(dt, hands) {
    S.clock += dt; S.t += dt; S.tp += dt; if (S.block !== 'wait') S.passT += dt;
    const now = S.clock, seen = new Set(); let downs = 0, maxSpeed = 0;
    S.count.fill(0);
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      S.count[h.wall]++; lastSeen[h.wall] = now; seen.add(h.stroke);
      if ((h.dx || 0) <= 0.15) seenL[h.wall] = now; if ((h.dx || 0) >= -0.15) seenR[h.wall] = now;
      if (!strokes.has(h.stroke)) { lastDown[h.wall] = now; downs++; downTimes.push(now); }
      if (h.speed > maxSpeed) maxSpeed = h.speed;
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
      S.start = S.hands >= 2 ? Math.min(1, S.start + dt / T.start) : Math.max(0, S.start - dt / (T.start * 2)); S.progress = S.start;
      if (S.start >= 1) { S.pass++; emit('start'); go('intro'); }
    } else if (S.block === 'intro') {
      S.progress = S.t / T.intro; if (S.t >= T.intro) go('brasa');
    } else if (S.block === 'brasa') {
      if (playing) {
        S.touched += downs;
        const need = clamp(Math.round(S.people * 0.4), 2, 5);          // how many hands landing together make a wave
        if (S.touched >= Math.min(8, S.people) && downTimes.filter((t) => now - t <= 0.9).length >= need && now - waveAt > 2.5) { waveAt = now; S.waves++; downTimes.length = 0; emit('wave'); }
        S.progress = clamp(Math.min(1, S.touched / Math.min(8, S.people)) * 0.25 + Math.min(3, S.waves) * 0.25, 0, 1);
        stuckFor += dt; if (downs) stuckFor = Math.max(0, stuckFor - 4);
        if (S.tp > 14 && S.waves === 0) hint('together'); else if (S.waves > 0 && S.waves < 3 && now - waveAt > 12) hint('again');
        if (S.waves >= 3 && S.t >= B.min) { emit('awake'); phase('reward'); } else if (S.t >= B.max - B.reward) { emit('awake'); phase('reward'); }
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) go('pinya'); }
    } else if (S.block === 'pinya') {
      if (playing) {
        let full = 0, fullHeld = 0;
        for (let w = 0; w < W; w++) {
          const before = S.fill[w];
          S.fill[w] = S.count[w] > 0 ? Math.min(1, S.fill[w] + (dt / B.fill) * Math.min(1.5, S.count[w] / S.buttons)) : Math.max(0, S.fill[w] - dt / 40);
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
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) { beatT = 0; evalAt = 0; go('tronc'); } }
    } else if (S.block === 'tronc') {
      const sw = structureWalls();
      S.balance = S.floors >= 3;
      for (const w of sw) {           // a tower leans to the side nobody holds
        const target = !S.balance || (S.left[w] && S.right[w]) ? 0 : S.left[w] ? 1 : S.right[w] ? -1 : Math.sin(now * 0.7 + w * 1.9);
        S.lean[w] += (target - S.lean[w]) * (1 - Math.exp(-dt * 0.8));
      }
      if (playing) {
        beatT += dt;
        if (beatT >= B.period) { beatT -= B.period; S.pulses++; pulseAt = now; evalAt = now + B.late; emit('pulse'); }
        S.beat = beatT / B.period;
        if (evalAt && now >= evalAt) {
          evalAt = 0;
          let sum = 0, fresh = 0, straight = 0;
          for (const w of sw) {
            const f = lastDown[w] >= pulseAt - B.fresh, here = now - lastSeen[w] <= 0.5, ok = Math.abs(S.lean[w]) < 0.45;
            const g = (f ? 1 : here ? 0.55 : 0) * (ok ? 1 : 0.4);
            S.weak[w] = g === 0 ? Math.min(3, S.weak[w] + 1) : 0;
            sum += g; if (f) fresh++; if (ok && here) straight++;
          }
          const gain = sum / Math.max(1, sw.length), late = S.t > B.target ? 0.3 : 0;       // past its time the room helps
          if (S.balance) { pulsesEval++; if (straight === sw.length) pulsesBalanced++; else emit('balance'); }
          if (gain < 0.5) { emit('weak'); if (S.pulses > 4) hint(S.balance && straight < sw.length ? 'straight' : 'beat'); }
          S.floorProgress += (gain * 0.5 + (fresh === sw.length ? 0.2 : 0) + late) / (1 + 0.25 * S.floors);
          if (S.floorProgress >= 1 && S.floors < 9) { S.floorProgress = Math.min(0.5, S.floorProgress - 1); S.floors++; S.stats.maxFloors = S.floors; emit('floor'); }
          S.progress = clamp((S.floors + S.floorProgress) / 9, 0, 1);
          if ((S.floors >= 9 && S.t >= B.min) || (S.t >= B.target && S.floors >= 7) || S.t >= B.max - B.reward) phase('reward');
        }
      } else if (S.phase === 'reward') { if (S.tp >= B.reward) { S.climber = 0; S.climb = 0; order = structureWalls(); go('pom'); } }
    } else if (S.block === 'pom') {
      if (playing) {
        pomT += dt;
        // the light goes round the structure's walls; it passes only where hands are still
        const n = order.length, seg = Math.min(n - 1, Math.floor(S.climb * n)), w = order[seg];
        S.lightWall = w; S.nextWall = order[(seg + 1) % n];
        const heldHere = now - lastSeen[w] <= 1;
        S.restless = heldHere && maxSpeed > B.stillSpeed;
        if (heldHere && !S.restless) { S.climb += dt / B.climb[S.climber]; stillT += dt; S.stats.stillS += dt; }
        else if (!heldHere) { S.climb = Math.max(0, S.climb - (dt / B.climb[S.climber]) * 0.3); if (S.tp > 8) hint('still'); }
        const late = S.t > B.target; if (late) S.climb += dt / 25;                            // past its time the light finds its way
        if (S.climb >= 1) { emit('arrived:' + S.climber); if (S.climber < 2) { S.climber++; S.climb = 0; emit('climber:' + S.climber); } else { S.climb = 1; phase('reward'); } }
        S.progress = clamp((S.climber + Math.min(1, S.climb)) / 3, 0, 1);
        if (S.phase === 'play' && ((emptyFor >= B.empty) || (S.t >= B.max && S.progress < 0.5))) fall('intent');
        else if (S.phase === 'play' && S.t >= B.max) phase('reward');
      } else if (S.phase === 'reward') { S.progress = 1; if (S.tp >= B.reward) { emit('crown'); go('crown'); } }
      else if (S.phase === 'title' && S.tp < dt * 1.5) emit('climber:0');
    } else if (S.block === 'crown') {
      S.progress = S.t / T.crown; if (S.t >= T.crown) { S.resonance = 0; go('festa'); }
    } else if (S.block === 'festa') {
      // hands that land together add up
      // (scaled by the group: two people in time resonate as much as fifteen)
      if (downs) { if (now - festaClusterAt <= 0.5) festaCluster += downs; else { festaClusterAt = now; festaCluster = downs; } S.resonance += festaCluster >= 2 ? (0.2 * downs) / S.people : 0.01; }
      S.resonance = clamp(S.resonance + dt * (0.004 * Math.min(12, S.hands) - 0.05), 0, 1.2);
      if (S.resonance >= 1 && now - bloomAt > 14) { bloomAt = now; S.blooms++; S.resonance = 0.3; emit('bloom'); }
      S.progress = clamp(S.resonance, 0, 1);
      if (S.t >= B.max || (S.t >= B.target) || (S.blooms > 0 && S.t >= B.min && now - festaClusterAt > 6)) { downT = 0; go('baixada'); }
    } else if (S.block === 'baixada') {
      downT += dt;
      const anyHeld = structureWalls().some((w) => S.held[w]), every = clamp(B.target / Math.max(1, S.stats.maxFloors + 1), 2, 6);
      if (!anyHeld && emptyFor >= B.empty && S.floors > 2) fall('carregat');
      else if (downT >= every) { downT = 0; if (S.floors > 0) { S.floors--; emit('down'); } if (S.floors === 0) { S.outcome = 'descarregat'; finish(); go('acta'); } }
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
    if (block === 'tronc') { S.floors = 0; S.floorProgress = 0; beatT = 0; evalAt = 0; }
    if (block === 'pom') { S.climber = 0; S.climb = 0; order = structureWalls(); }
    if (block === 'fall') S.outcome = S.outcome || 'intent';
    if (block === 'acta') { S.outcome = S.outcome || 'descarregat'; finish(); }
    if (block === 'baixada') downT = 0;
    go(block);
  }
  return { state: S, step, acta, jump, times: T };
}
