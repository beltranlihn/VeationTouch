// Ressonància — the director: the dramaturgy of the piece as a pure state machine (no DOM, no GL, no audio).
//
// It reads only what the room can really know: how many hands, on which walls, when they land, how still they are. From that it
// walks the five movements and adapts to the group (one visitor raises a pilar, four walls held raise a quatre):
//
//   brasa    the ember line waits; hands wake it. Enough touching moves on.
//   pinya    one hearth per wall; the walls being held become the structure (1 pilar · 2 torre · 3 tres · 4 quatre).
//   tronc    the timbal's pulse. Hands down on the pulse fix floors (a fresh landing counts double a hand that just stays).
//   pom      silence. Hands on the wall, still: the enxaneta climbs.
//   aleta    crowned. Then:
//   baixada  it comes down floor by floor, as long as somebody still holds it          -> descarregat
//   fall     it fell: before the crown (intent) or on the way down (carregat)
//   acta     the room rests on the result, then back to brasa for the next group.
//
// The room never stops: every movement has a way forward when a group cannot do a step.
// The same file is meant to run in the sound piece too (it will lead; the visual will follow its snapshots).
export const STRUCTURES = ['', 'pilar', 'torre', 'tres', 'quatre'];

export const TIMES = {            // seconds
  linger: 2,                      // a wall stays "held" this long after its last hand (the sensor drops hands; people shift)
  brasaMin: 12, brasaEnergy: 10,  // hand-seconds of touching before the line gathers
  pinyaMin: 14, pinyaStable: 6, pinyaAll: 2.5, pinyaMax: 45, pinyaEmpty: 20,
  period: 2.4, late: 0.35, fresh: 0.6,   // the pulse; a landing counts from 0.6 s before it to 0.35 s after
  troncGood: 100, troncMax: 140, troncEnd: 180, troncIdlePulses: 5,
  pomNeed: 14, pomMax: 75, pomEmpty: 10, stillSpeed: 0.3,
  aleta: 14, down: 1.7, downEmpty: 5, fall: 6, acta: 12,
};

export function createDirector(nWalls, opt = {}) {
  const W = Math.max(1, nWalls), T = { ...TIMES, ...(opt.times || {}) };
  const zeros = (v = 0) => Array.from({ length: W }, () => v);
  const S = {
    move: 'brasa', t: 0, clock: 0, session: 0,
    hands: 0, count: zeros(), held: zeros(false), walls: zeros(false), structure: 0,
    energy: 0, closed: 0,                 // brasa: how awake the line is (0..1) · pinya: share of the walls held
    beat: 0, pulses: 0, floors: 0, progress: 0, weak: zeros(0),   // tronc: phase 0..1 (the pulse is at 0), floors fixed, 0..1 to the next
    climb: 0, restless: false,            // pom: the enxaneta's way up 0..1; hands moving
    crownAt: -1, fallAt: -1, outcome: null,
    stats: { maxHands: 0, maxFloors: 0, stillS: 0, lead: -1 },
    events: [],                           // drained by the caller: 'move:<name>', 'pulse', 'floor', 'weak', 'crown', 'down', 'fall'
  };
  const lastSeen = zeros(-1e9), lastDown = zeros(-1e9), downs = zeros(0);
  let strokes = new Set(), stableAt = 0, allFor = 0, emptyFor = 0, beatT = 0, evalAt = 0, pulseAt = 0, idlePulses = 0, downT = 0;

  function go(move) { S.move = move; S.t = 0; emptyFor = 0; S.events.push('move:' + move); }
  function reset() {
    S.session++; S.energy = 0; S.closed = 0; S.floors = 0; S.progress = 0; S.pulses = 0; S.climb = 0; S.crownAt = -1; S.fallAt = -1; S.outcome = null;
    S.walls = zeros(false); S.structure = 0; S.weak = zeros(0); S.stats = { maxHands: 0, maxFloors: 0, stillS: 0, lead: -1 };
    downs.fill(0); go('brasa');
  }
  function fall(outcome) { S.outcome = outcome; S.fallAt = S.clock; S.events.push('fall'); go('fall'); }
  const onStructure = (fn) => { let n = 0; for (let w = 0; w < W; w++) if (S.walls[w] && fn(w)) n++; return n; };

  /** hands: [{ stroke, wall (index), speed (m/s) }] — the hands down now. */
  function step(dt, hands) {
    S.clock += dt; S.t += dt;
    const now = S.clock, seen = new Set();
    S.count.fill(0); let maxSpeed = 0;
    for (const h of hands) {
      if (!(h.wall >= 0 && h.wall < W)) continue;
      S.count[h.wall]++; lastSeen[h.wall] = now; seen.add(h.stroke);
      if (!strokes.has(h.stroke)) { lastDown[h.wall] = now; downs[h.wall]++; }
      if (S.walls[h.wall] && h.speed > maxSpeed) maxSpeed = h.speed;
    }
    strokes = seen; S.hands = seen.size;
    if (S.hands > S.stats.maxHands) S.stats.maxHands = S.hands;
    let heldN = 0; for (let w = 0; w < W; w++) { S.held[w] = now - lastSeen[w] <= T.linger; if (S.held[w]) heldN++; }
    emptyFor = S.hands ? 0 : emptyFor + dt;

    if (S.move === 'brasa') {
      S.energy = S.hands ? Math.min(T.brasaEnergy, S.energy + dt * Math.min(S.hands, 6)) : Math.max(0, S.energy - dt * 0.5);
      if (S.energy >= T.brasaEnergy && S.t >= T.brasaMin) { stableAt = now; allFor = 0; go('pinya'); }
    } else if (S.move === 'pinya') {
      const before = Math.round(S.closed * W);
      S.closed = heldN / W;
      if (heldN > before) stableAt = now;
      allFor = heldN === W ? allFor + dt : 0;
      const lock = heldN > 0 && (allFor >= T.pinyaAll || (S.t >= T.pinyaMin && now - stableAt >= T.pinyaStable) || S.t >= T.pinyaMax);
      if (lock) {
        S.walls = S.held.slice(); S.structure = heldN; S.floors = 0; S.progress = 0; S.pulses = 0; beatT = 0; evalAt = 0; idlePulses = 0; downs.fill(0);
        go('tronc');
      } else if (emptyFor >= T.pinyaEmpty) reset();
    } else if (S.move === 'tronc') {
      beatT += dt;
      if (beatT >= T.period) { beatT -= T.period; S.pulses++; pulseAt = now; evalAt = now + T.late; S.events.push('pulse'); }
      S.beat = beatT / T.period;
      if (evalAt && now >= evalAt) {
        evalAt = 0;
        let sum = 0, fresh = 0;
        for (let w = 0; w < W; w++) {
          if (!S.walls[w]) continue;
          const f = lastDown[w] >= pulseAt - T.fresh, here = now - lastSeen[w] <= 0.5;
          const g = f ? 1 : here ? 0.55 : 0;
          S.weak[w] = g === 0 ? Math.min(3, S.weak[w] + 1) : 0;
          sum += g; if (f) fresh++;
        }
        const gain = sum / S.structure;
        idlePulses = gain === 0 ? idlePulses + 1 : 0;
        if (gain < 0.5) S.events.push('weak');
        S.progress += (gain * 0.5 + (fresh === S.structure ? 0.2 : 0)) / (1 + 0.12 * S.floors);
        if (S.progress >= 1 && S.floors < 9) { S.progress = Math.min(0.5, S.progress - 1); S.floors++; S.stats.maxFloors = S.floors; S.events.push('floor'); }
        if (idlePulses >= T.troncIdlePulses) { if (S.floors >= 1) fall('intent'); else reset(); }
        else if (S.floors >= 9 || (S.t >= T.troncGood && S.floors >= 5) || (S.t >= T.troncMax && S.floors >= 2) || S.t >= T.troncEnd) {
          if (S.floors >= 1) { let lead = -1; for (let w = 0; w < W; w++) if (S.walls[w] && (lead < 0 || downs[w] > downs[lead])) lead = w; S.stats.lead = lead; S.climb = 0; go('pom'); }
          else reset();
        }
      }
    } else if (S.move === 'pom') {
      const holding = onStructure((w) => now - lastSeen[w] <= 1) === S.structure, any = onStructure((w) => S.held[w]) > 0;
      S.restless = holding && maxSpeed > T.stillSpeed;
      if (holding && !S.restless) { S.climb += dt / T.pomNeed; S.stats.stillS += dt; }
      else if (!holding) S.climb = Math.max(0, S.climb - (dt / T.pomNeed) * 0.35);
      if (S.climb >= 1 || (S.t >= T.pomMax && S.climb >= 0.4)) { S.climb = 1; S.crownAt = now; S.events.push('crown'); go('aleta'); }
      else if ((!any && emptyFor >= T.pomEmpty) || S.t >= T.pomMax) fall('intent');
    } else if (S.move === 'aleta') {
      if (S.t >= T.aleta) { downT = 0; go('baixada'); }
    } else if (S.move === 'baixada') {
      downT += dt;
      if (onStructure((w) => S.held[w]) === 0 && emptyFor >= T.downEmpty && S.floors > 2) fall('carregat');
      else if (downT >= T.down) {
        downT = 0;
        if (S.floors > 0) { S.floors--; S.events.push('down'); }
        if (S.floors === 0) { S.outcome = 'descarregat'; go('acta'); }
      }
    } else if (S.move === 'fall') {
      if (S.t >= T.fall) { S.floors = 0; go('acta'); }
    } else if (S.move === 'acta') {
      if (S.t >= T.acta) reset();
    }
    return S;
  }

  /** The line of the acta, as the colles write it: "3 de 7, descarregat". */
  function acta() {
    const kind = S.structure === 1 ? 'pilar' : String(S.structure);
    return { castell: `${kind} de ${S.stats.maxFloors}`, structure: STRUCTURES[S.structure] || '', floors: S.stats.maxFloors, outcome: S.outcome, hands: S.stats.maxHands, stillS: Math.round(S.stats.stillS), lead: S.stats.lead };
  }
  /** Study / operator: jump to a movement with a plausible state (all walls as the structure unless there is one). */
  function jump(move) {
    if (!S.structure) { S.walls = zeros(true); S.structure = W; }
    if (move === 'brasa') { reset(); return; }
    if (move === 'pinya') { S.floors = 0; stableAt = S.clock; allFor = 0; }
    if (move === 'tronc') { S.floors = 0; S.progress = 0; beatT = 0; evalAt = 0; idlePulses = 0; }
    if (move === 'pom') { S.floors = Math.max(S.floors, 7); S.stats.maxFloors = S.floors; S.climb = 0; }
    if (move === 'aleta') { S.floors = Math.max(S.floors, 7); S.stats.maxFloors = S.floors; S.climb = 1; S.crownAt = S.clock; S.events.push('crown'); }
    if (move === 'baixada') { S.floors = Math.max(S.floors, 7); S.climb = 1; if (S.crownAt < 0) S.crownAt = S.clock - 20; downT = 0; }
    go(move);
  }
  return { state: S, step, acta, jump, times: T };
}
