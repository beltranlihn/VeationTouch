// Ressonància — the score's thresholds as operator parameters (T-052, for the room session with the real S2E).
//
// KEEP IDENTICAL: ressonancia/tuning.js and ressonancia-sound/tuning.js (a piece imports only from its own folder).
//
// Every entry of TUNE is a manifest parameter `t.<path>` (e.g. `t.tronc.rise`) of the visual piece (res-obra3d/manifest.json).
// The score reads T.<block>.<field> on every step, so writing into score.times applies AT ONCE, no reload. The visual host applies
// them to its own score and sends them to the sound piece (which leads the score) over the BroadcastChannel: { type: 'ctl', times }.
//
// The effective value of a threshold:
//   1. the operator's value, when it differs from the manifest default (DEF below = TIMES as of T-052);
//   2. else the preset's value (`tuning`: 'lab' = the score as it is; 'sala' = a tolerant start for the real sensor);
//   3. else the score's own TIMES (so a later change of TIMES in score.js is not hidden by a stale manifest default).
// overrides() gives { path: value | null } for EVERY path (null = back to the score's own value), so a value moved back is undone.

//  path               label (panel)                                   min    max   step  default unit
export const TUNE = [
  ['linger',           'Hold: wall stays held after a hand (s)',       0.5,   6,    0.25, 2,    's'],
  ['abandon',          'Empty room → back to wait (s; warn at half)',  20,    180,  5,    45,   's'],
  ['start',            'Wait: hold on the start button (s)',           1,     8,    0.5,  3,    's'],
  ['reveal.button',    'Wait: start button half-width (m)',            0.3,   1.2,  0.05, 0.55, 'm'],
  ['title',            'Chapter card on screen (s)',                   2,     10,   0.5,  6,    's'],
  ['dup',              'Same hand if a new id is within (m)',          0.04,  0.3,  0.01, 0.1,  'm'],
  ['hand.size',        'Hand width when the sensor gives none (m)',    0.05,  0.3,  0.01, 0.12, 'm'],
  ['hand.span',        'Pinya/span window width (m)',                  1,     3.5,  0.1,  2,    'm'],
  ['hand.moved',       'Call: resting hand counts if it moved (m)',    0.03,  0.3,  0.01, 0.1,  'm'],
  ['hand.recent',      'Call: or if it landed less than (s) ago',      0.5,   5,    0.25, 2,    's'],
  ['brasa.early',      'Brasa call: early window before TOK (s)',      0.2,   1.5,  0.05, 0.5,  's'],
  ['brasa.late',       'Brasa call: late window after TOK (s)',        0.2,   2,    0.05, 0.7,  's'],
  ['brasa.max',        'Brasa: longest (s)',                           45,    120,  5,    75,   's'],
  // T-055 the relay (spark → relay → call): the fire devil runs round the room from hand to hand
  ['brasa.spark',      'Brasa: spark lasts (s), then the relay',       6,     25,   1,    12,   's'],
  ['brasa.relayReach', 'Brasa relay: jumps to a hand ahead within (m)', 1,    4,    0.1,  2.5,  'm'],
  ['brasa.relayRun',   'Brasa relay: running speed (m/s)',             0.5,   2.5,  0.1,  1.2,  'm/s'],
  ['brasa.relayStall', 'Brasa relay: no hand ahead → fetched after (s)', 2,   15,   0.5,  6,    's'],
  ['brasa.relayFetch', 'Brasa relay: fetched at (m/s)',                0.3,   2,    0.1,  0.9,  'm/s'],
  ['brasa.relayMax',   'Brasa relay: the lap closes by (s)',           15,    45,   1,    30,   's'],
  ['brasa.relayNear',  'Brasa relay: on the hand within (m)',          0.05,  0.5,  0.01, 0.15, 'm'],
  ['pinya.pack.0',     'Pinya: packed from (0–1)',                     0.2,   0.9,  0.05, 0.55, ''],
  ['pinya.pack.1',     'Pinya: fully packed at (0–1)',                 0.4,   1,    0.05, 0.9,  ''],
  ['pinya.hold',       'Pinya: hold the circle (s)',                   1,     8,    0.5,  3,    's'],
  ['pinya.net',        'Pinya: the colla helps after (s)',             15,    90,   5,    40,   's'],
  ['pinya.nearFull',   'Pinya: packed counts fully up to (m from centre)', 0.8, 3, 0.1,  1.8,  'm'],   // T-050
  ['pinya.nearZero',   'Pinya: packed counts nothing from (m)',        1.5,   4,    0.1,  3,    'm'],
  ['tronc.rise',       'Tronc: a lift counts from (m)',                0.1,   0.6,  0.01, 0.33, 'm'],
  ['tronc.foot',       'Tronc wobble: hands below (m) steady it',      0.5,   1.6,  0.05, 0.95, 'm'],
  ['tronc.wobble',     'Tronc wobble: time to steady it (s)',          2,     12,   0.5,  5,    's'],
  ['tronc.help',       'Tronc: walls without tower help (0–1)',        0,     1,    0.05, 0.5,  ''],
  ['tronc.gain',       'Tronc: climb speed',                           0.3,   1.5,  0.02, 0.72, ''],
  ['tronc.base',       'Tronc: a hand that moved less (m) is the base', 0.05, 0.4,  0.01, 0.15, 'm'],   // T-050
  ['pom.still',        'Pom: still = moved less than (m in 1 s)',      0.05,  0.4,  0.01, 0.15, 'm'],
  ['pom.empty',        'Pom: empty room falls after (s)',              8,     60,   1,    20,   's'],
  // T-050 the three climbs (relay · breath · silence) and the acta's handprints
  ['pom.climb.0',      'Pom relay: length when held still (s)',        20,    60,   1,    38,   's'],
  ['pom.relay.every',  'Pom relay: hop to the next still hand every (s)', 2,  8,    0.5,  4,    's'],
  ['pom.relay.ready',  'Pom relay: a hand is ready after still (s)',    0.3,   3,    0.1,  1,    's'],
  ['pom.relay.falter', 'Pom relay: holder moving → goes back after (s)', 0.5, 4,    0.1,  1.2,  's'],
  ['pom.climb.1',      'Pom breath: length at full speed (s)',         8,     30,   1,    16,   's'],
  ['pom.gust',         'Pom breath: a gust = moved more than (m in 1 s)', 0.2, 1,  0.05, 0.35, 'm'],
  ['pom.climb.2',      'Pom silence: length (s)',                      5,     20,   1,    10,   's'],
  ['pom.breakCost',    'Pom silence: a move costs (share of the climb)', 0,  0.2,  0.01, 0.06, ''],
  ['print.rest',       'Acta: a hand leaves a print after resting (s)', 0.2,  2,    0.1,  0.5,  's'],
  ['aleta.rise',       'L\'aleta: a raise counts from (m)',            0.1,   0.5,  0.01, 0.28, 'm'],
  ['aleta.high',       'L\'aleta: or a hand above (m)',                1.2,   2.2,  0.05, 1.6,  'm'],
  ['aleta.quorum',     'L\'aleta: share of hands to crown (0–1)',      0.2,   1,    0.05, 0.6,  ''],
  ['aleta.window',     'L\'aleta: crowns anyway after (s)',            4,     20,   1,    10,   's'],
  ['festa.early',      'Festa call: early window (s)',                 0.2,   1.5,  0.05, 0.5,  's'],
  ['festa.late',       'Festa call: late window (s)',                  0.2,   2,    0.05, 0.7,  's'],
  ['festa.window',     'Festa echo: answer window ± (s)',              0.3,   2,    0.05, 0.7,  's'],
  ['festa.travel',     'Festa echo: front crossing time (s)',          1.5,   6,    0.25, 3,    's'],
  ['festa.ghost',      'Festa echo: room answers after (s)',           4,     30,   1,    12,   's'],
  ['baixada.lower',    'Baixada: a descent counts from (m)',           0.1,   0.6,  0.01, 0.35, 'm'],
  ['baixada.gentle',   'Baixada: gentle up to (m/s), faster creaks',   0.2,   1,    0.05, 0.4,  'm/s'],
  ['baixada.empty',    'Baixada: let go → carregat after (s)',         4,     30,   1,    10,   's'],
  ['baixada.outside',  'Baixada: walls without tower count (0–1)',     0,     1,    0.05, 0.5,  ''],
];

// 'sala': a tolerant start for the real S2E (RESSONANCIA.md §8, PLAN-INTERACCION §3): occlusion from the sensor above loses hands
// (longer linger, lower quorum), a «still» hand trembles more than the simulated ±2 cm, 10 Hz + 150 ms widen the call windows, a lift
// read from far away is shorter than in the lab. Starting points to measure from, not measured values.
export const PRESETS = {
  lab: {},
  sala: {
    linger: 3, abandon: 60,
    'brasa.relayReach': 3.0, 'brasa.relayStall': 5, 'brasa.relayNear': 0.22,   // T-055: hands lost to occlusion leave wider gaps; a noisier «on the hand»
    'brasa.early': 0.7, 'brasa.late': 1.0, 'festa.early': 0.7, 'festa.late': 1.0, 'festa.window': 1.0,
    'pinya.pack.0': 0.45, 'pinya.pack.1': 0.8,
    'tronc.rise': 0.25, 'tronc.foot': 1.1, 'tronc.wobble': 7,
    'pom.still': 0.22,
    'pinya.nearFull': 2.1, 'pinya.nearZero': 3.3, 'tronc.base': 0.22,   // T-050: base cutoff follows the noisier «still»
    'pom.relay.ready': 1.2, 'pom.relay.falter': 1.8, 'pom.gust': 0.5, 'pom.breakCost': 0.03, 'print.rest': 0.6,
    'aleta.rise': 0.22, 'aleta.quorum': 0.45,
    'baixada.lower': 0.28, 'baixada.gentle': 0.5, 'baixada.empty': 14,
  },
};

const get = (o, path) => { for (const k of path.split('.')) { if (o == null) return undefined; o = o[k]; } return o; };

/** The effective overrides from the operator's params: { path: number | null } for every TUNE path. */
export function overrides(P = {}) {
  const pre = PRESETS[P.tuning] || PRESETS.lab, out = {};
  for (const [path, , , , , def] of TUNE) {
    const v = Number(P['t.' + path]);
    out[path] = isFinite(v) && Math.abs(v - def) > 1e-9 ? v : (pre[path] ?? null);
  }
  return out;
}

/** Writes overrides into a score's live times (score.times), copying a block's object before changing it (never the shared TIMES).
 *  null = the base (the score's own TIMES). Returns how many values changed. */
export function applyTimes(T, ov, base) {
  let n = 0;
  for (const [path] of TUNE) {
    if (!(path in ov)) continue;
    const want = ov[path] ?? get(base, path);
    if (typeof want !== 'number' || !isFinite(want) || get(T, path) === want) continue;
    const ks = path.split('.');
    if (ks.length === 1) { T[ks[0]] = want; n++; continue; }
    // copy-on-write down the path: T.pinya → a fresh object, T.pinya.pack → a fresh array
    let o = T;
    for (let i = 0; i < ks.length - 1; i++) {
      const k = ks[i], cur = o[k];
      if (cur == null || typeof cur !== 'object') break;
      o[k] = Array.isArray(cur) ? cur.slice() : { ...cur };
      o = o[k];
    }
    o[ks[ks.length - 1]] = want; n++;
  }
  return n;
}

/** The manifest entries (for keeping res-obra3d/manifest.json in step: node -e "import('./tuning.js').then(m=>console.log(JSON.stringify(m.manifestParams())))"). */
export function manifestParams() {
  return [
    { key: 'tuning', label: 'Thresholds preset', type: 'select', default: 'lab', options: [['lab', 'Lab (the score as it is)'], ['sala', 'Room (tolerant start for the real sensor)']] },
    ...TUNE.map(([path, label, min, max, step, def, unit]) => ({ key: 't.' + path, label: label.slice(0, 60), type: 'number', min, max, step, default: def, ...(unit ? { unit } : {}) })),
  ];
}
