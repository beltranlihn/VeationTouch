// Ressonància — the cue table: what the voice says and what the text writes, for each event of the score (05-plan §2.3, §3).
// THE source of the script: if voice and text disagree anywhere, this table wins. Pure data + one pure resolver (no DOM, no audio).
//
// TWO IDENTICAL COPIES: ressonancia/cues.js and ressonancia-sound/cues.js (a piece may only import from its own folder).
// Keep them byte-identical (lab/tools/check-syntax.mjs checks the pair). Owner: Narrative & voice.
//
// The voice and the text on screen are in peninsular Spanish (vosotros), the casteller words in Catalan: an approved exception
// for this work (director, 2026-11-24). Every other text of the software stays English.
//
// An entry:  { voice, where, energy, text, place, kind, once, repeat, cooldown, y, cap, delay }
//   voice   file name in ressonancia-sound/audio/es/ (no extension) | { [n]: name } chosen by the event's n | null (text only)
//   where   'room'  every wall (roomInput)                  'focus' the wall that calls (S.focus.wall, else the achievement's wall)
//           'ach'   the achievement's wall (S.ach.wall)     'arg'   the wall in the event's argument ('gust:2', 'pack:1')
//           'busy'  the wall with the most hands
//   energy  how it is said (documentation of the take; the tag is in gen-voice.mjs): whisper · soft · warm · lift · joy · shout · urgent
//   text    what is written | { [n]: text } | null;  place: 'focus' (100 % on the calling wall, 30 % elsewhere) · 'all' (100 % on all
//           four) · 'structure' (the castell's walls) · 'ach' (0.35 m above the achievement's point, breaks into tiles) · 'travel'
//           (follows S.focus while it moves: the relay)
//   kind    'task' (a consigna: cuts the line before)  ·  'ach' (an achievement: waits ≤ 1.5 s for the voice, else text only)
//           'card' (a chapter card or narration: cuts)  ·  'hint' (dropped if someone is speaking)
//   once    true: once per pass (default) · repeat: true may say it again (floors, the colla) · cooldown: s between two repeats
//           (the colla's cues: once per BLOCK — sound.js forgets them at each block)
//   y, cap  height of the text's centre and capital height in metres when not the kind's default (task 1.62 / 0.18,
//           ach 0.35 above the point / 0.14, card 1.95 / 0.18)
//   delay   s before the voice starts (default 0.3)

// the floor names that rise with the tower (castells: baixos, segons, terços, quarts…)
export const FLOOR_NAME = { 1: 'Baixos', 2: 'Segons', 3: 'Terços', 4: 'Quarts', 5: 'Quints', 6: 'Sisens', 7: 'Setens', 8: 'Vuitens', 9: 'Novens' };
export const STRUCT_NAME = { 1: 'Pilar', 2: 'Torre', 3: 'Tres', 4: 'Quatre' };
export const WAVE_NAME = { 1: 'Primera ola', 2: 'Segunda ola', 3: 'Tercera ola' };
export const CLIMBER_NAME = { 0: 'Dosos', 1: 'Acotxador', 2: 'Enxaneta' };
const ord = (n) => ({ 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve' }[n] || String(n));

export const CUES = {
  // ---- 3.0 wait and intro
  'wait:invite': { voice: 'v-wait-invite', where: 'room', energy: 'soft', text: 'Tocad el muro', place: 'all', kind: 'hint', repeat: true, cooldown: 40 },
  'reveal': { voice: 'v-wait-start', where: 'busy', energy: 'soft', text: 'Sostened el anillo', place: 'focus', kind: 'task', repeat: true, delay: 1.4 },
  'intro:1': { voice: 'v-intro-1', where: 'room', energy: 'whisper', text: null, kind: 'card' },
  'intro:2': { voice: 'v-intro-2', where: 'room', energy: 'whisper', text: null, kind: 'card' },   // only in the 70 s intro (retired at 45 s)
  'intro:3': { voice: 'v-intro-3', where: 'room', energy: 'whisper', text: null, kind: 'card' },
  'intro:4': { voice: 'v-intro-4', where: 'room', energy: 'whisper', text: null, kind: 'card' },
  'intro:5': { voice: 'v-intro-5', where: 'room', energy: 'whisper', text: null, kind: 'card' },   // the motto: introtext.js writes it wall by wall
  // ---- 3.1 I · Brasa
  'title:brasa': { voice: 'v-brasa-1', where: 'room', energy: 'whisper', text: 'Tocad el muro', place: 'focus', kind: 'card', card: ['I', 'Brasa', 'El despertar'] },
  'ach:fire': { voice: 'v-brasa-fire', where: 'ach', energy: 'soft', text: 'Ha prendido', place: 'ach', kind: 'ach' },          // voice «El fuego prende» («Ha prendido» = «aprendido» by ear)
  'relay:start': { voice: 'v-brasa-pass', where: 'focus', energy: 'warm', text: 'Pasad el fuego', place: 'travel', kind: 'task' },
  'relay:assist': { voice: 'v-colla-1', where: 'focus', energy: 'warm', text: 'La colla os ayuda', place: 'ach', kind: 'ach', repeat: true, cooldown: 600 },
  'assist:on:brasa': { alias: 'relay:assist' },
  'ach:lap': { voice: 'v-brasa-lap', where: 'room', energy: 'lift', text: 'El fuego da la vuelta', place: 'all', kind: 'ach' },
  'tg:charge': { voice: 'v-hold', where: 'ach', energy: 'soft', text: null, kind: 'hint' },                                   // the first target charging, once a pass
  'stage:brasa:call': { voice: 'v-brasa-2', where: 'room', energy: 'soft', text: 'Todos a la vez', place: 'all', kind: 'task' },
  'call:late': { voice: 'v-brasa-hold', where: 'focus', energy: 'soft', text: 'Posad la mano', place: 'focus', kind: 'task' },   // a call open 8 s (sound's clock)
  'ach:wave': { voice: { 1: 'v-brasa-wave' }, where: 'room', energy: 'lift', text: WAVE_NAME, place: 'ach', kind: 'ach', repeat: true },
  'ach:awake': { voice: 'v-brasa-awake', where: 'room', energy: 'warm', text: 'Despierta', place: 'all', kind: 'ach', colla: 'v-colla-1' },   // by: colla → «La colla os ayuda» first
  // ---- 3.2 II · Pinya
  'title:pinya': { voice: 'v-pinya-task', where: 'room', energy: 'warm', text: 'Palma con palma', place: 'focus', kind: 'card', card: ['II', 'Pinya', 'Fuerza'] },
  'stage:pinya:pack': { voice: 'v-pinya-closein', where: 'busy', energy: 'soft', text: 'Juntaos', place: 'focus', kind: 'task' },
  'ach:wallfull': { voice: 'v-pinya-wall', where: 'ach', energy: 'warm', text: 'Aguanta', place: 'ach', kind: 'ach' },
  'focus:next': { voice: 'v-pinya-other', where: 'focus', energy: 'warm', text: 'Ahora aquí', place: 'focus', kind: 'task' },
  'assist:on:pinya': { voice: 'v-colla-2', where: 'focus', energy: 'warm', text: 'La colla os ayuda', place: 'ach', kind: 'ach' },
  'ach:close': { voice: 'v-pinya-3', where: 'room', energy: 'warm', text: null, kind: 'ach', then: { key: 'struct', after: 2.2 } },
  'struct': { voice: { 1: 'v-struct-1', 2: 'v-struct-2', 3: 'v-struct-3', 4: 'v-struct-4' }, where: 'room', energy: 'warm', text: STRUCT_NAME, place: 'structure', kind: 'ach', cap: 0.22 },
  // ---- 3.3 III · Tronc
  'title:tronc': { voice: 'v-tronc-lift', where: 'room', energy: 'warm', text: 'Levantad', place: 'structure', kind: 'card', card: ['III', 'Tronc', 'Equilibrio'], others: 'Sostened la luz' },   // walls without the tower: the target is «la luz» everywhere (voice: «Dejad la mano sobre la luz»)
  'ach:floor': { voice: { 2: 'v-floor-2', 3: 'v-floor-3', 4: 'v-floor-4', 5: 'v-floor-5', 6: 'v-floor-6', 7: 'v-floor-7', 8: 'v-floor-8', 9: 'v-floor-9' }, where: 'busy', energy: 'lift', text: FLOOR_NAME, place: 'structure', kind: 'ach', repeat: true, rise: true },
  'ach:lean': { voice: 'v-tronc-2', where: 'focus', energy: 'soft', text: 'Los dos lados', place: 'focus', kind: 'task' },
  'focus:lean': { alias: 'ach:lean' },
  'ach:level': { voice: 'v-tronc-level', where: 'focus', energy: 'soft', text: 'Recta', place: 'ach', kind: 'ach' },
  'level': { alias: 'ach:level' },
  'wobble': { voice: 'v-tronc-wobble', where: 'focus', energy: 'urgent', text: 'Sujetad la base', place: 'focus', kind: 'task', y: 1.0, repeat: true, cooldown: 30 },   // every tremble, on its wall (≥ 30 s apart)
  'ach:steady': { voice: 'v-tronc-steady', where: 'ach', energy: 'warm', text: 'La pinya aguanta', place: 'ach', kind: 'ach' },
  'ach:slip': { voice: 'v-tronc-slip', where: 'ach', energy: 'urgent', text: null, kind: 'ach', breakFloor: true, repeat: true, cooldown: 12 },   // the floor's name breaks and falls
  'assist:on:tronc': { voice: 'v-colla-1', where: 'room', energy: 'warm', text: 'La colla os ayuda', place: 'all', kind: 'ach', repeat: true, cooldown: 600 },
  'ach:tower': { voice: 'v-tronc-done', where: 'room', energy: 'warm', text: (n) => `${ord(n)} pisos`, place: 'structure', kind: 'ach' },   // voice «La torre está en pie» («tronc» came out «tronco»)
  // ---- 3.4 IV · Pom de dalt and l'aleta
  'title:pom': { voice: 'v-pom-1', where: 'room', energy: 'whisper', text: null, kind: 'card', card: ['IV', 'Pom de dalt', 'Valor'] },
  'pom:play': { voice: 'v-pom-2', where: 'focus', energy: 'whisper', text: 'Quietos', place: 'focus', kind: 'task' },
  'ach:handoff': { voice: { 1: 'v-pom-handoff' }, where: 'ach', energy: 'whisper', text: null, kind: 'ach', repeat: true },
  'ach:arrived': { voice: { 0: 'v-pom-arrived-0', 1: 'v-pom-arrived-1' }, where: 'room', energy: 'whisper', text: CLIMBER_NAME, place: 'ach', kind: 'ach', repeat: true },
  'climber:1': { voice: 'v-pom-breath', where: 'room', energy: 'whisper', text: 'Contened el aliento', place: 'focus', kind: 'task' },
  'climber:2': { voice: 'v-pom-silence', where: 'room', energy: 'whisper', text: 'Enxaneta', place: 'focus', kind: 'task' },
  'hush': { voice: 'v-pom-hush', where: 'arg', energy: 'whisper', text: null, kind: 'hint', repeat: true, cooldown: 15 },          // 'gust:w' / 'hush:break:w' / ach:break
  'ach:break': { alias: 'hush' },
  'pom:near': { voice: 'v-pom-3', where: 'room', energy: 'whisper', text: null, kind: 'hint' },                                 // climb > 0.7 (score's hint 'still')
  'aleta': { voice: 'v-aleta-raise', where: 'room', energy: 'soft', text: 'Levantad la mano', place: 'all', kind: 'task', then: { key: 'aleta:yours', after: 0.6 } },
  'aleta:yours': { voice: 'v-aleta-yours', where: 'room', energy: 'soft', text: null, kind: 'task' },
  // ---- 3.5 coronation and V · la ressonància
  'ach:crown': { voice: 'v-crown-shout', where: 'room', energy: 'shout', text: 'Coronado', place: 'all', kind: 'card', then: { key: 'crowned', after: 1.6 }, delay: 0.05 },
  'crowned': { voice: 'v-aleta-crowned', where: 'room', energy: 'warm', text: null, kind: 'ach' },
  'block:festa': { voice: 'v-aleta-2', where: 'room', energy: 'warm', text: 'La plaza es vuestra', place: 'all', kind: 'card' },
  'stage:festa:echo': { voice: 'v-festa-echo', where: 'room', energy: 'joy', text: 'Lanzad una onda', place: 'focus', kind: 'task' },
  'focus:echo': { voice: 'v-festa-return', where: 'focus', energy: 'joy', text: 'Devolvedla', place: 'focus', kind: 'task' },     // the first wave arrives and lights its target
  'ach:echo': { voice: null, text: 'Eco', place: 'ach', kind: 'ach', repeat: true },
  'stage:festa:call': { voice: 'v-festa-call', where: 'room', energy: 'joy', text: 'Todos a la vez', place: 'all', kind: 'task' },
  'ach:bloom': { voice: 'v-festa-bloom', where: 'room', energy: 'joy', text: 'Ressonància', place: 'all', kind: 'ach', cap: 0.22 },
  'assist:on:pom': { voice: 'v-colla-1', where: 'room', energy: 'whisper', text: 'La colla os ayuda', place: 'all', kind: 'ach', repeat: true, cooldown: 600 },
  'assist:on:festa': { voice: 'v-colla-1', where: 'room', energy: 'warm', text: 'La colla os ayuda', place: 'all', kind: 'ach', repeat: true, cooldown: 600 },
  'assist:on:baixada': { voice: 'v-colla-1', where: 'room', energy: 'soft', text: 'La colla os ayuda', place: 'all', kind: 'ach', repeat: true, cooldown: 600 },
  // ---- 3.6 baixada, fall and acta
  'block:baixada': { voice: 'v-baixada-1', where: 'room', energy: 'soft', text: 'Bajadlo despacio', place: 'structure', kind: 'card' },
  'ach:clean': { voice: { 1: 'v-baixada-ok' }, where: 'focus', energy: 'soft', text: null, kind: 'ach', repeat: true },
  'ach:down': { voice: null, text: FLOOR_NAME, place: 'structure', kind: 'ach', repeat: true, rise: true },                         // the name comes down with the tower
  'ach:creak': { voice: { 1: 'v-baixada-gently' }, where: 'focus', energy: 'soft', text: null, kind: 'ach', repeat: true },
  'warn:fall': { voice: 'v-baixada-warn', where: 'room', energy: 'urgent', text: 'Manos al muro', place: 'all', kind: 'task' },
  'fall': { voice: 'v-fall', where: 'room', energy: 'soft', text: null, kind: 'card', card: ['', 'Ha caído', 'Quedan las brasas'] },
  'acta:outcome': { voice: { descarregat: 'v-cierre-descarregat', carregat: 'v-cierre-carregat', intent: 'v-cierre-intent' }, where: 'room', energy: 'warm', text: null, kind: 'card' },   // actatext.js writes the outcome
  'acta:print': { voice: 'v-acta-print', where: 'room', energy: 'warm', text: 'Dejad vuestra mano', place: 'all', kind: 'task', y: 1.45 },
  'acta:final': { voice: 'v-cierre-final', where: 'room', energy: 'whisper', text: null, kind: 'card' },
  'warn:abandon': { voice: 'v-warn-return', where: 'room', energy: 'soft', text: 'Volved al muro', place: 'all', kind: 'task', repeat: true, cooldown: 30 },   // voice «La pinya os necesita» («castell» came out «castillo»)
};

// Achievements of 05-plan §2.2 with NO cue of their own, said explicitly (nothing is forgotten): none — every ach: has an entry.
export const NO_CUE = [];

// the intro's voice clock (s from the start of the 45 s intro; 05-plan §3.0). v-intro-2 is retired (kept on disk).
export const INTRO_AT = [[2, 'intro:1'], [10, 'intro:3'], [21, 'intro:4'], [27.5, 'intro:5']];
// the acta's clock (s from its start)
export const ACTA_AT = [[3, 'acta:print'], [5.4, 'acta:outcome'], [24.5, 'acta:final']];   // the outcome after the print line (it would cut it)
// the 70 s intro's clock (until TIMES.intro is 45 s; 05-plan §3.0 first cut)
export const INTRO_AT_70 = [[8.5, 'intro:1'], [17, 'intro:2'], [29, 'intro:3'], [41, 'intro:4'], [53.3, 'intro:5']];
export const CALL_LATE = 8;   // s a call stays open before «Posad la mano en la luz»

// Which cue an event of the score is (or null). `S` is the score's state at the event (S.block, S.ach, S.focus, S.phase).
// Returns { key, cue, n } — `n` picks the variant of voice / text (the achievement's n, the structure, the outcome…).
export function cueKey(ev, S) {
  const i = ev.indexOf(':'), k = i < 0 ? ev : ev.slice(0, i), arg = i < 0 ? '' : ev.slice(i + 1), b = S && S.block;
  if (k === 'phase') {
    if (arg === 'title') return 'title:' + b;
    if (arg === 'play' && b === 'pom') return 'pom:play';
    if (arg === 'aleta') return 'aleta';
    return null;
  }
  if (k === 'block') return arg === 'festa' ? 'block:festa' : arg === 'baixada' ? 'block:baixada' : null;
  if (k === 'focus') return S && S.focus ? 'focus:' + S.focus.kind : null;
  if (k === 'tg') return arg.startsWith('charge') ? 'tg:charge' : null;
  if (k === 'gust' || k === 'hush') return 'hush';
  if (k === 'hint') return arg === 'still' ? 'pom:near' : null;
  return CUES[ev] ? ev : null;
}

export function resolve(key, S) {
  let cue = CUES[key]; if (!cue) return null;
  if (cue.alias) { key = cue.alias; cue = CUES[key]; if (!cue) return null; }
  const a = S && S.ach;
  let n = a && key.startsWith('ach:') ? a.n : 0;
  if (key === 'struct') n = (S && (S.structure || (S.castell && S.castell.structure))) || 1;
  if (key === 'acta:outcome') n = (S && S.outcome) || 'descarregat';
  const pick = (v) => (v == null ? null : typeof v === 'function' ? v(n, S) : typeof v === 'object' ? (v[n] ?? null) : v);
  return { key, cue, n, voice: pick(cue.voice), text: pick(cue.text), by: a ? a.by : 'group' };
}

// the wall a cue speaks / writes on (index into vt.walls), or -1 for the whole room
export function cueWall(cue, S, evArg) {
  if (!cue || cue.where === 'room') return -1;
  if (cue.where === 'arg') { const w = parseInt(String(evArg).split(':').pop(), 10); if (w >= 0) return w; }
  if (cue.where === 'focus' && S && S.focus && S.focus.wall >= 0) return S.focus.wall;
  if ((cue.where === 'ach' || cue.where === 'focus' || cue.where === 'arg') && S && S.ach && S.ach.wall >= 0) return S.ach.wall;
  if (S && Array.isArray(S.count)) { let best = -1, w = -1; S.count.forEach((c, j) => { if (c > best) { best = c; w = j; } }); if (best > 0) return w; }
  return -1;
}
