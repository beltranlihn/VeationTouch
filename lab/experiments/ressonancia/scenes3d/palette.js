// Ressonància — the palette of the work (D4b, plan 05 §2.7, approved by the director 25-11). ONE family: lime (cal), fired earth,
// night ink and gold. Every chapter takes 2–3 tones and one accent; shadows are never pure black (`tinta` / `ombra`); gold (`or`)
// is ACHIEVEMENT ONLY (target charge, the word of achievement, the crown, the prints) until the coronation.
// NOBODY WRITES A HEX OUTSIDE THIS FILE: parts, guide, targets and host read the tokens from here (or from room.PAL / room.PALETTE).
//
//   import { PAL, ACH, TOK, hex, lin, srgb, color } from './palette.js';
//   PAL.tronc.tones        → ['porcellana', 'pedra-llum', 'tinta-ombra']      token names
//   PAL.tronc.accent       → 'or'            the hand's answer / the chapter's accent
//   PAL.tronc.light        → 'porcellana'    a target at rest (the chapter's light tone)
//   PAL.tronc.shadow       → 'tinta-ombra'   cast / contact shadows, the dark of the chapter
//   PAL.tronc.ink          → 'tinta-text'    the text (os on dark chapters, tinta-text on light ones)
//   PAL.tronc.luma         → 0.45            target mean luma of the tonemapped image (0..1), the light curve (§2.8)
//   PAL.tronc.sky          → { top, horizon, bottom }   the background / air colours by direction ([token, gain] pairs)
//   lin('or') → [r, g, b] linear · srgb('or') → [r, g, b] 0..1 display · hex('or') → '#E8B04A' · color(THREE, 'or') → THREE.Color
//   PAL[block].lin.tones / .lin.accent / … → the same in linear RGB arrays (precomputed)

// ---- the tokens (hex = sRGB display colour)
export const TOK = {
  // constants of the whole work
  'os': '#EDE6D8',          // lime, porcelain, bone: the light of the work, and the ink of text over dark
  'tinta': '#0F1522',       // the night and the cold shadow (replaces black)
  'ombra': '#3A2018',       // the warm shadow over lime and earth
  'or': '#E8B04A',          // ACHIEVEMENT, and only achievement, the same through the whole work
  // wait / intro
  'pedra-nit': '#2A3140',
  'blau-plaça': '#24324C',
  'cal-fanal': '#F0D9A8',
  'fanal': '#EFA548',
  // brasa
  'carbó': '#150D0B',
  'brasa': '#C4401C',
  'flama': '#F08A30',
  // pinya
  'cal-foc': '#E6D6BC',
  'terracota': '#B25A3C',
  'faixa': '#A3302A',
  // tronc
  'porcellana': '#F1ECE2',
  'pedra-llum': '#D8C6A6',
  'tinta-ombra': '#1C2436',
  // pom
  'nit-alta': '#162038',
  'blau-hora': '#3C4D7C',
  'lluna': '#DCE3F0',
  // coronation · V
  'or-clar': '#F2D48A',
  'crema': '#FFF2D8',
  'bronze': '#5C3C14',
  // baixada
  'alba-rosa': '#F1C6B2',
  'alba-blau': '#CFDFF0',
  'albergínia': '#3B2B46',
  // fall
  'cendra': '#6F6860',
  // acta
  'cal': '#E9E2D4',
  'tinta-text': '#1B1A18',
};

// ---- per chapter (block names of the score). `sky` = the background gradient seen from the eye (also the colour of the air in that
// direction): [token, gain] — gain < 1 darkens the token, never another hue. Light chapters: a lit horizon band against a darker sky.
export const PAL = {
  wait:    { tones: ['tinta', 'pedra-nit', 'os'], accent: 'or', accentK: 0.4, light: 'os', shadow: 'tinta', ink: 'os', luma: 0.10, dark: true,
    story: 'The square asleep', sky: { top: ['pedra-nit', 0.55], horizon: ['pedra-nit', 0.9], bottom: ['tinta', 0.8] } },
  intro:   { tones: ['tinta', 'blau-plaça', 'cal-fanal'], accent: 'fanal', light: 'cal-fanal', shadow: 'tinta', ink: 'os', luma: 0.14, dark: true,
    story: 'The lanterns: first islands of lit lime', sky: { top: ['blau-plaça', 0.75], horizon: ['blau-plaça', 1.25], bottom: ['tinta', 0.9] } },
  brasa:   { tones: ['carbó', 'brasa', 'flama'], accent: 'or', light: 'flama', shadow: 'carbó', ink: 'os', luma: 0.15, dark: true,
    story: 'The one chapter of fire over dark', sky: { top: ['tinta', 0.75], horizon: ['blau-plaça', 0.5], bottom: ['tinta', 1.0] } },   // a COOL night: the warm comes only from the fires
  pinya:   { tones: ['cal-foc', 'terracota', 'ombra'], accent: 'faixa', light: 'cal-foc', shadow: 'ombra', ink: 'os', luma: 0.18, dark: true,
    story: 'The night square swallowed by the bonfires\' low warm smoke: silhouettes and lit windows above, the crowd glowing below', sky: { top: ['tinta', 0.7], horizon: ['tinta', 1.3], bottom: ['tinta', 0.8] } },   // AD#5: the night square, a low warm haze below
  tronc:   { tones: ['porcellana', 'pedra-llum', 'tinta-ombra'], accent: 'or', light: 'porcellana', shadow: 'tinta-ombra', ink: 'os', luma: 0.2, dark: true,
    story: 'The castell under the festival spots: porcelain where light falls, blue night and fog elsewhere', sky: { top: ['tinta', 0.75], horizon: ['tinta', 1.7], bottom: ['tinta', 0.8] } },
  pom:     { tones: ['nit-alta', 'blau-hora', 'lluna'], accent: 'or', light: 'lluna', shadow: 'nit-alta', ink: 'os', luma: 0.12, dark: true,
    story: 'The silence: the square goes out so one light is seen', sky: { top: ['nit-alta', 0.6], horizon: ['nit-alta', 1.25], bottom: ['nit-alta', 0.6] } },
  crown:   { tones: ['or-clar', 'crema', 'bronze'], accent: 'os', light: 'crema', shadow: 'bronze', ink: 'os', luma: 0.3, dark: true,
    story: 'A burst of gold inside the night', sky: { top: ['tinta', 0.9], horizon: ['bronze', 0.9], bottom: ['tinta', 0.9] } },
  festa:   { tones: ['or-clar', 'crema', 'bronze'], accent: 'os', light: 'crema', shadow: 'bronze', ink: 'os', luma: 0.3, dark: true,
    story: 'The resonance: gold that rings in the night', sky: { top: ['tinta', 0.9], horizon: ['bronze', 0.8], bottom: ['tinta', 0.9] } },
  baixada: { tones: ['alba-rosa', 'alba-blau', 'albergínia'], accent: 'or', accentK: 0.6, light: 'alba-blau', shadow: 'albergínia', ink: 'os', luma: 0.22, dark: true,
    story: 'The blue hour before dawn (AD plan B): the night square, the horizon turning rose, the lamps going out', sky: { top: ['tinta', 1.1], horizon: ['alba-rosa', 0.5], bottom: ['tinta', 0.9] } },
  fall:    { tones: ['cendra', 'brasa', 'tinta'], accent: 'brasa', light: 'cendra', shadow: 'tinta', ink: 'os', luma: 0.20, dark: true,
    story: 'Ash and embers', sky: { top: ['cendra', 0.45], horizon: ['cendra', 0.75], bottom: ['tinta', 1.0] } },
  acta:    { tones: ['cal', 'tinta-text', 'ombra'], accent: 'or', light: 'cal', shadow: 'ombra', ink: 'tinta-text', luma: 0.45, dark: false,
    story: 'The lime wall in the morning light, written', sky: { top: ['cal', 0.72], horizon: ['cal', 0.9], bottom: ['ombra', 1.0] } },
};

// ---- conversions (no THREE needed)
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function hex(name) { const h = TOK[name]; if (!h) throw new Error('palette: unknown token "' + name + '"'); return h; }
export function srgb(name) { const h = hex(name).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); }
export function lin(name, k = 1) { return srgb(name).map((c) => s2l(c) * k); }
export function color(THREE, name) { return new THREE.Color(hex(name)); }   // THREE.Color takes sRGB hex and stores linear (colour management on)
// a [token, gain] pair (or a token name) → linear RGB
export function linOf(t) { return Array.isArray(t) ? lin(t[0], t[1] ?? 1) : lin(t); }
// the luminance of a token (linear, Rec. 709)
export function lum(name) { const [r, g, b] = lin(name); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// ---- achievement: the same gold everywhere
export const ACH = { token: 'or', hex: TOK.or, lin: lin('or'), srgb: srgb('or') };

// precomputed linear arrays per chapter (so a part can do vec3(...PAL.tronc.lin.light))
for (const [k, p] of Object.entries(PAL)) {
  p.name = k;
  p.lin = { tones: p.tones.map((t) => lin(t)), accent: lin(p.accent, p.accentK ?? 1), light: lin(p.light), shadow: lin(p.shadow), ink: lin(p.ink),
    ach: ACH.lin, sky: { top: linOf(p.sky.top), horizon: linOf(p.sky.horizon), bottom: linOf(p.sky.bottom) } };
}
export const BLOCKS = Object.keys(PAL);
export function chapter(block) { return PAL[block] || PAL.wait; }

// ---- for the host (Tech/QA): the same shape as res-obra3d's PAL { warm, cool, air, thread } (linear), derived from the tokens, so the
// host can swap its table for `import { HOST_PAL } from '../ressonancia/scenes3d/palette.js'` (warm = the chapter's warm light, cool =
// its cool light, air = the dust's tint (small), thread = the guiding thread = the chapter's light tone; gold only where gold is meant).
const norm = (a, k = 1) => { const m = Math.max(a[0], a[1], a[2], 1e-4); return a.map((c) => (c / m) * k); };
const HP = {
  wait:    ['cal-fanal', 'pedra-nit', 'pedra-nit', 'os'],
  intro:   ['fanal', 'blau-plaça', 'blau-plaça', 'cal-fanal'],
  brasa:   ['flama', 'brasa', 'brasa', 'flama'],
  pinya:   ['cal-foc', 'pedra-llum', 'terracota', 'cal-foc'],
  tronc:   ['pedra-llum', 'lluna', 'pedra-llum', 'porcellana'],
  pom:     ['or-clar', 'lluna', 'blau-hora', 'lluna'],
  crown:   ['or-clar', 'crema', 'or-clar', 'or'],
  festa:   ['or-clar', 'crema', 'or-clar', 'or'],
  baixada: ['alba-rosa', 'alba-blau', 'alba-rosa', 'alba-rosa'],
  fall:    ['brasa', 'cendra', 'cendra', 'cendra'],
  acta:    ['cal', 'lluna', 'cal', 'cal'],
};
export const HOST_PAL = Object.fromEntries(Object.entries(HP).map(([k, [w, c, a, t]]) => [k, {
  warm: norm(lin(w)), cool: norm(lin(c)), air: norm(lin(a), 0.006), thread: norm(lin(t)) }]));
