// Ressonància — the guide in 3D (the whole work's host, res-obra3d): where the hands go and what the walls say. T-027 (ARTE-2 §5–6).
//
//   const guide = createGuide({ THREE, TSL, room });   room.scene.add(guide.object);
//   guide.update(dt, { state, hands, time, on, acta, hold, pace });   // every frame; state = the score's state; on = the "guide" parameter
//
// Targets are OBJECTS: a floating ring of iridescent glass on the wall plane (centred at 1.25 m), the hand drawn in light inside it,
// a soft dark disc under it so it reads over any universe. A hand approaching lights it and turns it (answer < 100 ms); holding fills
// its progress with ceramic tiles that fly in and lock one by one (trencadís); when the progress is complete the tiles and the glass
// burst into fragments. Tronc: the pulse is a ring of light closing on the glass (it flashes when it lands). Pom: the ring stays still
// and breathes. The ring assembles from its own segments when it comes (and breaks when it goes); in the wait it assembles as the
// public's play reveals it (state.reveal, 0..1 — missing = 1) and fills with state.start.
// Positions and rules as before: wait one per wall; Pinya 1–3 per wall (state.buttons); Tronc one per castell wall, two (both sides)
// once state.balance; Pom the light's wall bright, the next one half; Baixada one per castell wall.
// Words (typo3d.js): the chapter card like a film title (small roman numeral, big serif name, the value in italic on a hairline) at
// ~2.15 m, and the instruction (Geist) at ~1.92 m, on the walls (from Tronc on, only the castell's walls); old words break before new
// ones assemble; the instruction dims once the group is already doing it. Everything in Spanish; casteller words in Catalan.
// T-048 (SIS, ARTE-3 §3): the instructions come into focus word by word (typo3d 'blur'); rims, plates and words catch the hands' light (room.flash).
// Nothing is allocated per frame: every mesh is made once; words are laid out only when they change.
// STUDIO 25-11 (05-plan N5, D7): the words follow cues.js (the script's table) and the room's scale — the instruction (consigna) is
// ONE line centred at 1.62 m with capitals of 0.18 m (<= 22 characters; two lines beside the castell), set like Vicente's chapter card
// (Instrument Serif on its hairlines: the work's one type system), its label (a climber's name) above it in the italic at 0.14 m;
// each wall places it beside the chapter's hero (SPOTS / HERO_HALF) and above the targets it refers to, never on one;
// the chapter card is centred at 1.95 m and the consigna waits for it to leave; the ink is the chapter's (palette.js PAL[b].ink:
// bone on the dark chapters, dark ink on the light ones). NO backing plates (director 25-11: they read as dirty patches on the wall):
// legibility comes from the ink, the size and a tight soft glyph halo. The consigna steps aside from the chapter's hero object
// (CONSIGNA_X: the brasa's drop, the tower).
// N6 (25-11): the consigna is at 100 % on the wall that calls (S.focus) and enters there first; the other walls carry a 30 % echo,
// 0.6 s later. ACHIEVEMENTS (cues.js kind 'ach' with a text): a word in gold (palette ACH) 0.35 m above the achievement's point, or
// on the castell's walls / all walls, 2.5 s, then it breaks into tiles. The floors' names rise with the tower (0.9 → 2.0 m) and fall
// with it in the baixada; a floor lost breaks its name. The fine instrument layer (rulers, «+», grid, «P4», «1,25 m») and the mono labels are
// GONE. The rings are drawn by targets3d.js (Tech/QA) from S.targets: the guide draws none (option rings: true brings them back as a
// fallback only).
import { FLOOR_NAMES, CLIMBERS } from '../score.js';
import { CUES, cueKey, resolve, FLOOR_NAME } from '../cues.js';
import { typo, OVER } from './typo3d.js';
import { chapter, ACH } from './palette.js';
const CT = (k) => (CUES[k] && typeof CUES[k].text === 'string' ? CUES[k].text : '');   // a cue's text (the table wins)

// [numeral, name, value]
export const CARDS = { brasa: ['I', 'Brasa', 'El despertar'], pinya: ['II', 'Pinya', 'Fuerza'], tronc: ['III', 'Tronc', 'Equilibrio'], pom: ['IV', 'Pom de dalt', 'Valor'] };
const HAND_Y = 1.25, R = 0.23, MAXT = 16, HALF = R * 3.4, NSEG = 24, NTILE = 20, TUBE = 0.015;   // ARTE §7: torus r 0.23 m; section 3 cm (ARTE round 3)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));

// T-043 (PLAN-INTERACCION.md): each interactive block teaches ONE verb. state.learned[verb] (ENT, T-038) says the group has it;
// until the score publishes it, the guide keeps a stand-in (15 s of play with hands on the wall).
export const VERBS = { brasa: 'tocar', pinya: 'juntar', tronc: 'subir', pom: 'quietos', aleta: 'alzar', baixada: 'bajar' };
// the ghost hands' gesture for each verb ('base': the Tronc's wobble, hands down to the tower's foot)
// the guide teaches EXACTLY what score.js measures: subir follows the Tronc's phrase (S.phraseT), bajar goes up then down ≥ 0.40 m
export const GESTURES = { tocar: 'tap', juntar: 'gather', subir: 'phrase', quietos: 'still', alzar: 'raise', bajar: 'updown', base: 'lower' };
export const CARD_S = 4;                       // the chapter card stays 4 s (the play goes on under it)
const verbOf = (S) => (S.block === 'pom' && S.phase === 'aleta' ? VERBS.aleta : VERBS[S.block]);
/** The words for now: { card: [numeral, name, value] } or { line: [invitation, label] } or {}. No counters anywhere; an invitation
 *  has ≤ 3 words and leaves once the verb is learned; the real floor and climber names stay as the label. */
export function lines(S, acta, learned = false, warn = '') {
  const b = S.block;
  // the chapter card is a LAYER (the score listens under it): 4 s, high, and the invitation of the play is already there below it
  const cardNow = S.phase === 'title' && CARDS[b] && S.tp < CARD_S ? CARDS[b] : null;
  const out = linesPlay(S, acta, false, warn);   // 25-11: the consigna stays while its stage asks (it dims when the group is doing it; «learned» no longer hides it)
  if (cardNow) out.card = cardNow;
  return out;
}
function linesPlay(S, acta, learned, warn) {
  const b = S.block;
  if (warn === 'fall') return { line: ['Manos al muro', ''] };      // the score warns before a fall / before giving up (analysis #19)
  if (warn === 'abandon') return { line: ['Volved al muro', ''] };
  if (b === 'wait') return { line: (S.reveal ?? 1) >= 1 ? [CT('reveal'), ''] : ['Jugad con la sala', ''] };   // the voice: «Tocad. Jugad con la sala.»
  if (b === 'brasa') return S.phase === 'reward' ? {} : S.brasaStage === 'call' ? (learned ? {} : { line: [CT('stage:brasa:call'), ''] }) : S.brasaStage === 'relay' ? { line: [CT('relay:start'), ''] } : { line: [CT('title:brasa'), ''] };   // by the score's stage (#18)
  if (b === 'pinya') return S.phase === 'reward' || learned ? {} : { line: [S.pinyaStage === 'pack' ? CT('stage:pinya:pack') : CT('title:pinya'), ''] };
  if (b === 'tronc') {
    if (S.phase === 'reward') return {};
    const fl = '';   // 25-11: the floor's name is the achievement layer's (it rises with the tower); no label over the consigna
    if (S.wobble > 0) return { line: [CT('wobble'), fl] };            // the tower trembles: hands to its foot
    if (S.focus && S.focus.kind === 'lean') return { line: [CT('ach:lean'), fl] };
    return { line: [learned ? '' : CT('title:tronc'), fl] };
  }
  if (b === 'pom') {
    if (S.phase === 'aleta') return { line: [CT('aleta'), ''] };     // «Levantad la mano» (05-plan §3.4)
    // T-051 (POV): three climbs — the relay asks for still hands; the breath holds it; the silence: her name only
    if (S.pomStage === 'breath') return { line: [CT('climber:1'), ''] };   // Art Director 25-11: few words in the Pom (names: the achievement layer)
    if (S.pomStage === 'silence') return { line: [CT('climber:2'), ''] };
    return { line: [learned ? '' : CT('pom:play'), ''] };
  }
  // the acta's wall line («Dejad vuestra mano», 3–15 s) is drawn by parts/actatext (it sits under the castell, the ring of prints round it)
  if (b === 'crown') return S.t > 3 && S.t < 14 ? { card: ['V', 'Coronado', acta?.castell ? inWords(acta.castell) : "L'aleta"] } : {};   // «Tres de siete»
  if (b === 'festa') return S.t < 7 ? { card: ['', CT('block:festa'), ''] } : S.festaStage === 'echo' ? { line: [S.focus && S.focus.kind === 'echo' ? CT('focus:echo') : CT('stage:festa:echo'), ''] } : S.festaStage === 'call' ? { line: [CT('stage:festa:call'), ''] } : {};
  if (b === 'baixada') return S.baixadaStage === 'free' ? { line: [CT('stage:baixada:free'), ''] } : { line: [learned ? '' : CT('block:baixada'), ''] };   // the free coda asks nothing   // the floors' names go down in the achievement layer
  if (b === 'fall') return S.t > 2 ? { card: ['', 'Ha caído', 'Quedan las brasas'] } : {};
  return {};
}
// ink: the chapter's (palette.js): bone at 90 % on the dark chapters (under the bloom's threshold), dark ink on the light ones
const inkOf = (b) => { const c = chapter(b); return c.dark === false ? c.lin.ink.slice() : c.lin.ink.map((v) => v * 0.9); };
let INK = inkOf('wait'), INK_A = 0.92;   // light chapters: the darkest ink at full opacity (director 25-11: ≥ 4.5:1)
export const TEXT = { line: 1.62, lineCap: 0.18, labelCap: 0.14, card: 1.95, max: 22 };   // D7 (05-plan §3): metres; caps = 0.667 x size
// the consigna's offset along the wall (m from its centre) where the chapter has a hero object at the centre: the text stands beside it
const CONSIGNA_X = { brasa: -1.75, tronc: -2.0, baixada: -2.0 };   // ±2.7 hit the plaza's lamp posts and the corners of the narrow walls
// where the consigna may stand on a wall (m from its centre), in order of preference: beside the chapter's hero, never on a target
// (S.targets): each wall takes the candidate farthest from its targets (only while its words are not up: words never slide in view)
const HERO_HALF = { tronc: 1.3, baixada: 1.3, pom: 0.8, wait: 1.25 };   // wait: the doorway arch at every wall's centre   // the tower stands at the centre of the castell's walls: the text keeps out of it
const SPOTS = { brasa: [-1.75, -2.5, 1.9, 2.5], tronc: [-2.0, 2.0, -2.6, 2.6], baixada: [-2.0, 2.0, -2.6, 2.6], other: [0, -1.7, 1.7, -2.5, 2.5] };
// the card: the numeral first (0.2 s ahead), the name (caps ≈ 0.31 m), the hairline drawn from the centre out, the value rising
// from behind its baseline
function cardItems(C) {
  const it = [];
  if (C[0]) it.push({ text: C[0], font: 'sans', size: 0.1, y: 0.4, track: 0.5, alpha: 0.6, color: INK, edge: 0.47 });
  it.push({ text: C[1], font: 'serif', size: C[1].length > 14 ? 0.38 : 0.46, y: 0.04, track: 0.01, color: INK, delay: 0.2 });
  if (C[2]) it.push({ text: C[2], font: 'italic', size: 0.17, y: -0.3, track: 0.015, rules: 0.5, alpha: 0.85, color: INK, rise: true, delay: 0.35 });
  return it;
}
// the instruction: ONE centred line (caps 0.18 m, <= 22 characters) at 1.62 m; the label (a name) ABOVE it at ~1.95 m (the targets live at 0.9–1.4 m), caps 0.14 m, Geist too
let WRAP = false, CAP = TEXT.lineCap;
const NUM_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
const inWords = (c) => { const t = String(c).replace(/\d+/g, (d) => NUM_ES[+d] ?? d); return t.charAt(0).toUpperCase() + t.slice(1); };   // «3 de 7» → «Tres de siete»
// Art Director 25-11: per chapter — the brasa above the fire figure and its sparks (1.8 m); the tower's chapters lower and larger,
// beside the castell; the Pom low and quiet beside the tower in the dark
const LINE_Y = { brasa: 1.8, pinya: 2.02, tronc: 1.58, baixada: 1.58, pom: 1.45 };   // pinya: clear above the crowd's heads (1.6–1.75 m), Art Director 25-11
const LINE_CAP = { tronc: 0.22, baixada: 0.22 };
const splitLine = (t) => { const mid = t.length / 2; let k = -1, d = 1e9; for (let i = 0; i < t.length; i++) if (t[i] === ' ' && Math.abs(i - mid) < d) { d = Math.abs(i - mid); k = i; } return [t.slice(0, k), t.slice(k + 1)]; };
const longest = (t) => (WRAP && t && t.length > 14 && t.indexOf(' ') > 0 ? Math.max(...splitLine(t).map((x) => x.length)) : (t || '').length);
const lineItems = (L) => {
  const it = [];
  // T-048: the words come into focus one by one (typo3d reveal 'blur', 60 ms per word)
  // Art Director 25-11: Vicente's card IS the type system — the consigna in Instrument Serif, on the card's hairlines; the label in
  // its italic. Caps 0.18 m (Instrument Serif caps ≈ 0.70 em).
  // beside the castell (WRAP) a long consigna goes on two lines, the hairlines on the first: it fits between the tower and the corner
  const two = WRAP && L[0] && L[0].length > 14 && L[0].indexOf(' ') > 0 ? splitLine(L[0]) : null;
  if (two) { it.push({ text: two[0], font: 'serif', size: CAP / 0.7, y: CAP * 0.72, track: 0.015, alpha: INK_A, color: INK, rules: 0.32, reveal: 'blur' }); it.push({ text: two[1], font: 'serif', size: CAP / 0.7, y: -CAP * 0.72, track: 0.015, alpha: INK_A, color: INK, reveal: 'blur', delay: 0.1 }); }
  else if (L[0]) it.push({ text: L[0], font: 'serif', size: CAP / 0.7, y: 0, track: 0.015, alpha: INK_A, color: INK, rules: 0.32, reveal: 'blur' });
  if (L[1]) it.push({ text: L[1], font: 'italic', size: TEXT.labelCap / 0.7, y: L[0] ? 0.34 : 0, track: 0.02, alpha: INK_A * 0.9, color: INK, delay: 0.15, reveal: 'blur' });
  return it;
};

// chapter palettes for the progress tiles and the glass's tint (ARTE-2 §3)
const PALETTES = {
  wait: [[1.0, 0.45, 0.18], [0.75, 0.78, 0.82], [1.0, 0.7, 0.35]],
  pinya: [[0.2, 0.85, 0.8], [1.0, 0.45, 0.38], [0.85, 0.95, 0.92]],
  tronc: [[0.85, 0.38, 0.2], [0.18, 0.4, 0.85], [0.95, 0.9, 0.8]],
  pom: [[1.0, 0.82, 0.45], [0.92, 0.94, 1.0], [1.0, 0.7, 0.3]],
  baixada: [[1.0, 0.62, 0.75], [0.7, 0.6, 1.0], [0.5, 0.95, 0.85]],
};

export function createGuide({ THREE, TSL, room, fine = false, rings = false, ghosts: ghostsOn = false }) {   // ghosts: the teaching hand glyphs (off: the targets teach, no hand icon on the walls)   // fine: ignored (the instrument layer is gone, 25-11); rings: true = the old rings as a fallback
  const { pmremTexture, refract, cross, uniform, uv, vec2, vec3, float, smoothstep, exp, length, step, texture, select, clamp: tclamp, max, min, cos, sin, abs, pow, dot, normalize, reflect, attribute, positionGeometry, positionLocal, normalWorld, positionWorld, cameraPosition, mix, fract } = TSL;
  const object = new THREE.Group(); object.name = 'guide';
  const NW = room.walls.length;
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const uTime = uniform(0);
  const PAL = [uniform(new THREE.Color(1, 0.5, 0.2)), uniform(new THREE.Color(0.8, 0.8, 0.8)), uniform(new THREE.Color(1, 0.7, 0.35))];
  const palNow = PALETTES.wait.map((c) => c.slice());
  // T-048: the chapter's accent (room.PALETTE, notas/ARTE.md §2), eased: the fine graphics, the hands' light on rims and plates
  const ACC = uniform(new THREE.Vector3(1, 0.42, 0.18)), accNow = [1, 0.42, 0.18];
  const accentOf = (b) => (room.PALETTE && room.PALETTE[b] ? room.PALETTE[b].accent : [1, 0.42, 0.18]);

  // ------------------------------------------------------------------ the trencadís hand (the work's icon): palm + five fingers =
  // six glass tiles with grout between them. One texture, three channels: R = the tiles, G = which tile (0..5, to light them one after
  // another), B = how deep inside its tile a pixel is (0 at the edge … 1 at the heart: they light from the inside out). 256 px, once.
  const HN = 256, hcv = document.createElement('canvas'); hcv.width = hcv.height = HN;
  {
    const k = HN / 512;
    // round-tipped fingers fanned out, the thumb opening to the side, a rounded palm: every tile is a soft shape, so its lit heart is
    // round too (ARTE round 4). Each tile: [centre x, y, draw(g) in 512-px design space]
    const capsule = (bx, by, len, w, a) => { const ex = bx + Math.sin(a) * len, ey = by - Math.cos(a) * len; return [(bx + ex) / 2, (by + ey) / 2, (g) => { g.save(); g.translate(bx, by); g.rotate(a); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -len + w / 2); g.arc(0, -len + w / 2, w / 2, Math.PI, 0); g.lineTo(w / 2, 0); g.arc(0, 0, w / 2, 0, Math.PI); g.closePath(); g.fill(); g.restore(); }]; };
    const TILES = [
      [262, 372, (g) => { g.beginPath(); g.roundRect(182, 286, 160, 176, [70, 70, 80, 80]); g.fill(); }],   // palm
      capsule(196, 336, 120, 36, -1.0),                                                                    // thumb
      capsule(214, 268, 142, 33, -0.2),                                                                    // index
      capsule(256, 262, 160, 34, -0.05),                                                                   // middle
      capsule(298, 268, 146, 32, 0.1),                                                                     // ring
      capsule(332, 286, 108, 28, 0.27),                                                                    // little
    ];
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = HN; return c.getContext('2d', { willReadFrequently: true }); };
    const gm = mk(), gi = mk(), gd = mk();
    const tile = (g, T, sc) => { const [cx, cy, draw] = T; g.save(); g.scale(k, k); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy); draw(g); g.restore(); };
    gd.globalCompositeOperation = 'lighter';
    TILES.forEach((T, t) => {
      gm.fillStyle = '#fff'; tile(gm, T, 0.93);                                                    // a little inset: the grout
      gi.fillStyle = `rgb(${Math.round((t / 5) * 255)},0,0)`; tile(gi, T, 0.93);
      gd.fillStyle = 'rgba(255,255,255,0.1)'; for (let j = 0; j < 10; j++) tile(gd, T, 0.93 * (1 - j * 0.095));
    });
    const M = gm.getImageData(0, 0, HN, HN).data, I = gi.getImageData(0, 0, HN, HN).data, D = gd.getImageData(0, 0, HN, HN).data;
    const out = hcv.getContext('2d'), img = out.createImageData(HN, HN);
    for (let j = 0; j < HN * HN * 4; j += 4) { img.data[j] = M[j + 3]; img.data[j + 1] = I[j]; img.data[j + 2] = D[j + 3]; img.data[j + 3] = 255; }
    out.putImageData(img, 0, 0);
  }
  const handTex = new THREE.CanvasTexture(hcv); handTex.colorSpace = THREE.NoColorSpace; handTex.wrapS = handTex.wrapT = THREE.ClampToEdgeWrapping;

  // ------------------------------------------------------------------ shared geometry
  // the glass ring: a torus cut in NSEG segments (each vertex knows its segment's direction and a hash: it assembles and bursts by segments)
  const ringGeo = (() => {
    const g = new THREE.TorusGeometry(R, TUBE, 18, NSEG * 6).toNonIndexed();
    const p = g.getAttribute('position'), n = p.count, seg = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const k = Math.floor(((Math.atan2(cy, cx) / (Math.PI * 2) + 1) % 1) * NSEG), a = ((k + 0.5) / NSEG) * Math.PI * 2;
      const h = ((Math.sin(k * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
      for (let j = 0; j < 3; j++) { seg[(i + j) * 3] = Math.cos(a); seg[(i + j) * 3 + 1] = Math.sin(a); seg[(i + j) * 3 + 2] = h; }
    }
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 3));
    return g;
  })();
  const discGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const tileGeo = (() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const a = new Float32Array(NTILE * 4);
    for (let i = 0; i < NTILE; i++) { const h = (k) => ((Math.sin((i + 1) * (12.9898 + k * 7.3) + k) * 43758.5453) % 1 + 1) % 1; a[i * 4] = i; a[i * 4 + 1] = h(1); a[i * 4 + 2] = h(2); a[i * 4 + 3] = h(3); }
    g.setAttribute('aI', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = NTILE;
    return g;
  })();

  // ------------------------------------------------------------------ targets: a pool, each with its own uniforms
  const ease3 = (k) => float(1).sub(float(1).sub(k).mul(float(1).sub(k)).mul(float(1).sub(k)));
  const targets = [];
  for (let i = 0; i < MAXT; i++) {
    const U = { asm: uniform(0), held: uniform(0), hot: uniform(0), beat: uniform(0), arc: uniform(0), burst: uniform(0), soft: uniform(0), still: uniform(0), icon: uniform(1), seed: uniform(i * 0.137) };
    const group = new THREE.Group(); group.visible = false;

    // --- the dark disc, the hand in light, the held glow, the pulse ring
    {
      const d = uv().sub(0.5).mul(HALF * 2), r = length(d), lw = float(0.016);
      const keep = float(1).sub(U.soft.mul(0.65));
      const vis = smoothstep(0.2, 0.9, U.asm).mul(float(1).sub(U.burst.mul(0.6)));
      const fill = exp(r.mul(r).negate().div(0.5 * R * R)).mul(U.held.mul(0.16).add(U.hot.mul(0.06)));
      const bR = U.beat.mul(R);
      const beat = select(U.beat.greaterThan(0), smoothstep(lw, 0, r.sub(bR).abs()).mul(float(1).sub(smoothstep(1, 3, U.beat))).mul(0.9), float(0));
      const huv = d.div(R * 1.02).mul(0.5).add(0.5).add(vec2(0, -0.04));   // the hand inside the ring
      const inside = step(0, huv.x).mul(step(huv.x, 1)).mul(step(0, huv.y)).mul(step(huv.y, 1));
      const hs = texture(handTex, tclamp(huv, vec2(0), vec2(1))), tileM = hs.r.mul(inside), tileId = hs.g.mul(5), depth = hs.b;
      // each tile lights from its heart outwards, one after another (palm first), as a hand comes and holds; at rest a soft glow
      const L = U.held.mul(0.75).add(U.hot.mul(0.35)).add(0.18).mul(1.6).sub(tileId.mul(0.08));
      const lit = smoothstep(float(1).sub(L), float(1.25).sub(L), depth);
      const edgeG = smoothstep(0.35, 0.0, depth).mul(tileM);                                       // the glass's edge catches light
      const hand = tileM.mul(lit.mul(0.85).add(0.12)).add(edgeG.mul(0.35)).mul(U.icon);
      // the disc inside the glass: dark glass #0E1016 at 55 % (ARTE round 3), the trencadís hand lit inside it
      const inDisc = float(1).sub(smoothstep(R * 0.97, R * 1.02, r));
      const frost = vec3(0.0044, 0.0052, 0.0075).mul(inDisc);
      const light = fill.mul(keep).add(beat).add(hand.mul(keep.mul(0.5).add(0.5))).mul(vis);
      const shade = inDisc.mul(0.55).add(float(1).sub(smoothstep(R, R * 1.5, r)).mul(0.12)).mul(vis);
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = vec3(0.82, 0.79, 0.74).mul(0.8).mul(light)   /* art round 5: bone at 80 % */.add(frost.mul(vis)); m.opacityNode = max(shade, 0);
      const mesh = new THREE.Mesh(discGeo, m); mesh.renderOrder = 19; group.add(mesh);
    }
    // --- the glass ring
    const ring = new THREE.Group(); group.add(ring);
    {
      const S3 = attribute('aSeg', 'vec3'), dir = vec3(S3.x, S3.y, 0), h = S3.z;
      const kin = tclamp(U.asm.mul(1.7).sub(h.mul(0.7)), 0, 1), e = ease3(kin), ie = float(1).sub(e);
      const bk = tclamp(U.burst.mul(1.5).sub(h.mul(0.5)), 0, 1);
      const off = dir.mul(ie.mul(h.mul(0.35).add(0.18))).add(vec3(0, ie.mul(h.sub(0.5)).mul(0.3), ie.mul(h.mul(0.3).add(0.15))))
        .add(dir.mul(bk.mul(h.mul(0.5).add(0.25)))).add(vec3(0, bk.mul(bk).mul(0.25), bk.mul(0.2)));
      const breathe = float(1).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.025).mul(U.still));
      const m = new THREE.MeshBasicNodeMaterial({ ...OVER, side: THREE.FrontSide });
      m.positionNode = positionLocal.mul(breathe).add(off);
      // glass with thickness: the environment reflected (Fresnel) and seen refracted through the tube, a little darker and tinted;
      // a soft thin-film iridescence only at the grazing rim; it brightens when a hand comes, holds, or the pulse lands
      const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
      const ndv = abs(dot(N, V)), g1 = float(1).sub(ndv), F = g1.mul(g1).mul(g1).mul(g1).mul(g1).mul(0.96).add(0.04);
      const Rf = reflect(V.negate(), N), Tf = refract(V.negate(), N, float(1 / 1.45));
      const env = (dir, rough) => (room.envMap ? pmremTexture(room.envMap, dir, float(rough)).rgb : mix(vec3(0.02, 0.025, 0.05), vec3(0.5, 0.42, 0.36), smoothstep(-0.2, 0.9, dir.y)));
      const glow = U.held.mul(1.0).add(U.hot.mul(0.4)).add(smoothstep(1.35, 1.0, U.beat).mul(step(0.5, U.beat)).mul(0.8))
        .add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.5).add(0.5).mul(0.3).mul(U.still)).add(bk.mul(1.2));
      const rim = smoothstep(0.55, 0.95, g1);
      // ONE sharp reflection that travels slowly round the ring, and at rest a soft pulse of the rim every 2.4 s
      const side = normalize(cross(V, vec3(0, 1, 0)).add(vec3(0.0001, 0, 0)));
      const Lw = normalize(V.mul(0.7).add(vec3(0, 0.75, 0)).add(side.mul(sin(uTime.mul(0.35).add(U.seed.mul(17.0))).mul(0.7))));
      const hl = pow(max(dot(N, normalize(V.add(Lw))), 0), 220.0).mul(2.6);
      const restPulse = exp(fract(uTime.div(2.4)).mul(-4.0)).mul(0.5).mul(float(1).sub(step(0.5, U.beat))).mul(float(1).sub(U.held));
      const film = vec3(0.5).add(vec3(0.5).mul(cos(vec3(0.0, 0.33, 0.67).add(g1.mul(1.2)).add(h.mul(0.15)).add(uTime.mul(0.05)).mul(6.2831853))));
      const refl = env(Rf, 0.04).mul(4.4), refr = env(Tf, 0.25).mul(vec3(0.75, 0.85, 0.95)).mul(0.9);
      const vis = step(0.001, kin).mul(float(1).sub(smoothstep(0.6, 1.0, bk))).mul(float(1).sub(U.soft.mul(0.2)));
      const warm = vec3(1.0, 0.86, 0.66).mul(glow).mul(float(0.12).add(rim.mul(0.5)));
      // T-048 «la mano es una linterna»: the rim nearest a hand catches its light (room.flash: also a hand on the next wall, at a corner)
      const lampR = room.flash ? room.flash(positionWorld) : float(0);
      const col = mix(refr, refl, F).add(film.mul(rim).mul(0.3)).add(warm).add(vec3(hl)).add(vec3(1.0, 0.92, 0.82).mul(rim).mul(restPulse)).add(PAL[0].mul(glow).mul(0.06))
        .add(mix(vec3(1.0, 0.9, 0.78), ACC, 0.5).mul(lampR).mul(rim.mul(0.55).add(0.08)));
      m.colorNode = col.mul(vis).mul(e.mul(0.7).add(0.3)); m.opacityNode = F.mul(0.5).add(0.45).add(rim.mul(0.15)).add(hl.mul(0.3)).min(1.0).mul(vis);
      const mesh = new THREE.Mesh(ringGeo, m); mesh.renderOrder = 21; mesh.frustumCulled = false; ring.add(mesh);
    }
    // --- the progress: ceramic tiles locking into a ring just outside the glass
    {
      const I = attribute('aI', 'vec4'), idx = I.x, r1 = I.y, r2 = I.z, r3 = I.w;
      const ang = float(Math.PI / 2).sub(idx.add(0.5).div(NTILE).mul(Math.PI * 2));
      const cr = cos(ang), sr = sin(ang), rad = float(R + TUBE + 0.04);
      // a tile comes in while its share of the progress fills and waits just off its slot (e ≤ 0.82); it SNAPS home when the share is full
      const lock = tclamp(U.arc.mul(NTILE).sub(idx), 0, 1), snapped = step(0.999, lock), e = mix(ease3(tclamp(lock.mul(1.25), 0, 1)).mul(0.82), float(1), snapped), ie = float(1).sub(e);
      const bk = tclamp(U.burst.mul(1.5).sub(r1.mul(0.5)), 0, 1);
      const w = rad.mul(Math.PI * 2 / NTILE * 0.8 * 0.6).mul(r1.mul(0.12).add(0.92))   // art round 5: segments at 60 % width
     , hh = float(0.04).mul(r2.mul(0.25).add(0.88));
      const pg = positionGeometry;
      const jit = vec2(sin(r3.mul(40.0).add(pg.x.mul(7.0)).add(pg.y.mul(13.0))), cos(r2.mul(31.0).add(pg.x.mul(11.0)).add(pg.y.mul(5.0)))).mul(0.07);
      const since = U.arc.mul(NTILE).sub(idx).sub(1.0), pop = exp(max(since, 0).mul(-9.0)).mul(snapped);
      const loc0 = pg.xy.add(jit).mul(vec2(w, hh)).mul(pop.mul(0.18).add(1.0));
      const spin = ie.mul(r2.sub(0.5).mul(7.0)).add(bk.mul(r3.sub(0.5).mul(10.0))).add(ang.sub(Math.PI / 2));
      const loc = vec2(loc0.x.mul(cos(spin)).sub(loc0.y.mul(sin(spin))), loc0.x.mul(sin(spin)).add(loc0.y.mul(cos(spin)))).mul(float(1).sub(bk.mul(0.6)));
      const slot = vec2(cr, sr).mul(rad), tng = vec2(sr.negate(), cr);
      const p2 = slot.mul(float(1).add(ie.mul(r1.add(0.8))).add(bk.mul(r2.mul(1.5).add(1.0)))).add(tng.mul(ie.mul(r3.sub(0.5)).mul(0.5))).add(vec2(0, bk.mul(bk).mul(0.35)));
      const z = ie.mul(r2.mul(0.3).add(0.15)).add(bk.mul(r3).mul(0.3));
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.positionNode = vec3(p2.add(loc), z);
      const pal = select(r1.lessThan(0.34), PAL[0], select(r1.lessThan(0.67), PAL[1], PAL[2])).mul(r2.mul(0.5).add(0.7));
      const flash = pop.mul(1.6).add(exp(max(since, 0).mul(-1.2)).mul(snapped).mul(0.35));
      const q = uv(), edge = min(min(q.x, float(1).sub(q.x)), min(q.y, float(1).sub(q.y)));
      const glaze = smoothstep(0.0, 0.16, edge).mul(0.45).add(0.55).add(smoothstep(0.55, 1.0, q.y).mul(0.3));
      const vis = step(0.001, lock).mul(float(1).sub(smoothstep(0.55, 1.0, bk))).mul(smoothstep(0.3, 0.9, U.asm)).mul(snapped.mul(0.45).add(0.55));
      m.colorNode = pal.mul(glaze).mul(0.85).add(vec3(1.0, 0.9, 0.75).mul(flash)).mul(vis);
      m.opacityNode = vis.mul(0.95);
      const mesh = new THREE.Mesh(tileGeo, m); mesh.renderOrder = 22; mesh.frustumCulled = false; group.add(mesh);
    }
    object.add(group);
    targets.push({ group, ring, U, held: 0, hot: 0, asm: 0, arcPrev: 0, burst: 0, turn: 0, tilt: 0, used: false });
  }

  // ------------------------------------------------------------------ the words
  const card = typo.slot({ placements: typo.onWalls(room, TEXT.card),   // centred at 1.95 m (D7: <= 2.1 m); the consigna waits for it
    renderOrder: 24, outDur: 0.5, plate: 0, halo: 0.3, flash: room.flash });
  // the instruction: one centred line at 1.62 m (caps 0.18 m), the label above it at ~1.95 m
  const line = typo.slot({ placements: typo.onWalls(room, TEXT.line), renderOrder: 23, outDur: 0.5, plate: 0, halo: 0.3, spread: 2.4, flash: room.flash });
  // move a slot's words along each wall (only while nothing is up: words never slide in view)
  const lineBase = typo.onWalls(room, TEXT.line), rightOf = room.walls.map((w) => w.right.clone());
  let lineY = TEXT.line; const cardBase = typo.onWalls(room, TEXT.card);
  const placeX = (sl, x) => { for (const t of sl.texts) t.P.forEach((P, w) => { const xx = typeof x === 'number' ? x : x[w]; if (sl === line) lineCurX[w] = xx; P.mesh.position.copy(lineBase[w].position).addScaledVector(rightOf[w], xx).setY(lineY); }); };
  // N7: the consigna TRAVELS with the Brasa's relay — on the devil's wall it follows the fire along the wall (eased, never past the
  // corners); the other walls keep their place. lineS0: where each wall starts along the perimeter (the score's s).
  const lineS0 = []; { let a = 0; for (const w of room.walls) { lineS0.push(a); a += w.width; } }
  const lineX = new Float32Array(room.walls.length), lineXT = new Float32Array(room.walls.length), spotXs = new Float32Array(room.walls.length);
  // how far (m) the words at x on wall w stay from everything in their band: the calling point, the parts' obstacles, the targets
  function gapAt(S, b, w, x, half, T) {
    const Wd = room.walls[w].width; let gap = 9;
    if (S.focus && S.focus.wall === w && typeof S.focus.s === 'number') gap = Math.abs(S.focus.s - lineS0[w] - Wd / 2 - x) - half - (b === 'pom' ? 1.6 : 0.9);   // the calling point (the pom's light bursts wide, the devil)
    for (const o of OBST) { if (o.wall !== w || (o.y1 ?? 3) < lineY - CAP * 1.3 - 0.05 || (o.y0 ?? 0) > lineY + CAP * 1.3) continue; gap = Math.min(gap, Math.abs((o.x || 0) - x) - half - (o.half || 0.5)); }
    for (const g of T) { if (g.wall !== w) continue; const gx = typeof g.dx === 'number' ? g.dx : g.s - lineS0[w] - Wd / 2; if ((g.y || 1.2) + (g.r || 0.22) < lineY - CAP * 1.3 - 0.05) continue; gap = Math.min(gap, Math.abs(gx - x) - half - (g.r || 0.22)); }
    return gap;
  }
  // the words stand still; when something comes into them on the calling wall (sparks, a figure) and a clear spot exists, they leave
  // and come back there (≥ 4 s apart) — never sliding through the scene
  const lineCurX = new Float32Array(room.walls.length); let lineNonce = 0, replaceAt = -9;
  function blocked(S, b, text, time) {
    if (!line.up || time - replaceAt < 4) return false;
    const T = Array.isArray(S.targets) ? S.targets : [], half = 0.4 + longest(text) * 0.2 * CAP;
    for (let w = 0; w < NW; w++) {
      if (S.focus && S.focus.wall >= 0 && w !== S.focus.wall) continue;
      if (gapAt(S, b, w, lineCurX[w], half, T) < -0.1) { const nx = spotX(S, b, text)[w]; if (Math.abs(nx - lineCurX[w]) > 0.5 && gapAt(S, b, w, nx, half, T) > 0.2) { replaceAt = time; return true; } }
    }
    return false;
  }
  function spotX(S, b, text) {
    const cand = SPOTS[b] || SPOTS.other, half = 0.4 + longest(text) * 0.2 * CAP   /* serif: ≈ 0.4 × caps a character (half of it), + the hairlines */, T = Array.isArray(S.targets) ? S.targets : [];
    for (let w = 0; w < NW; w++) {
      const Wd = room.walls[w].width; let best = cand[0], bs = -1e9;
      // Art Director 25-11: the consigna stands ABOVE the targets it refers to (their centre on this wall), when they live under its band
      let sx = 0, sn = 0; for (const g of T) { if (g.wall !== w || (g.y || 1.2) + (g.r || 0.22) >= lineY - CAP * 1.3 - 0.05) continue; sx += typeof g.dx === 'number' ? g.dx : g.s - lineS0[w] - Wd / 2; sn++; }
      const near = sn ? [clamp(sx / sn, -Wd / 2 + half + 0.45, Wd / 2 - half - 0.45)] : [];
      const all = near.length ? near.concat(cand) : cand;
      for (let k = 0; k < all.length; k++) {
        let x = clamp(all[k], -Wd / 2 + half + 0.45, Wd / 2 - half - 0.45);
        const hh = HERO_HALF[b] ? HERO_HALF[b] + half : 0;   // the castell stands at the room's centre: seen at the centre of EVERY wall
        if (hh && Math.abs(x) < hh) x = clamp((x < 0 || (x === 0 && k % 2 === 0) ? -1 : 1) * hh, -Wd / 2 + half + 0.45, Wd / 2 - half - 0.45);
        const gap = gapAt(S, b, w, x, half, T);
        const sc = Math.min(gap, 0.4) - k * 0.05 + (near.length && k === 0 ? 0.3 : 0);   // clear of every target that reaches the text's band; above its own targets first
        if (sc > bs) { bs = sc; best = x; }
      }
      spotXs[w] = best;
    }
    return spotXs;
  } let travelOn = false, travelS = 0, travelDir = 1;
  object.add(card.object, line.object);

  // ------------------------------------------------------------------ per frame
  let guideA = 0, guideKey = '', nT = 0, softNow = 0, stillNow = 0, time0 = 0, revealNow = 1;
  const near = (hands, wi, off) => { for (const h of hands) if (h.wall === wi && Math.abs((h.u - 0.5) * room.walls[wi].width - off) < 0.55 && Math.abs(h.pos.y - HAND_Y) < 0.75) return true; return false; };
  function put(wi, off, vis, held, hot, beat, arc, dt) {
    if (nT >= MAXT) return;
    const T = targets[nT++], w = room.walls[wi], U = T.U;
    T.held = ease(T.held, held ? 1 : 0, dt, held ? 14 : 3);
    T.hot = ease(T.hot, hot || held ? 1 : 0, dt, hot ? 16 : 2.5);
    vis *= 1 - learnedK;
    T.asm = ease(T.asm, vis * guideA * revealNow, dt, 2.2);
    if (vis * guideA * revealNow > T.asm && T.asm > 0.97) T.asm = vis * guideA * revealNow;
    // the burst: the progress has just completed
    if (arc >= 0.999 && T.arcPrev < 0.999 && T.burst === 0) T.burst = 0.001;
    if (T.burst > 0 && T.burst < 1) T.burst = Math.min(1, T.burst + dt / 1.4);
    if (arc < 0.95) T.burst = 0;
    T.arcPrev = arc;
    T.group.position.copy(w.centre).addScaledVector(w.right, off).setY(HAND_Y).addScaledVector(w.normal, -0.04);
    T.group.quaternion.copy(basis[wi]);
    // it turns when a hand comes (not in the Pom: there it stays still and breathes)
    const turnTo = stillNow ? 0 : T.hot * (0.42 * Math.sin(time0 * 1.7 + nT)) + 0.06 * Math.sin(time0 * 0.37 + nT * 1.3);
    const tiltTo = stillNow ? 0 : T.hot * 0.22 * Math.cos(time0 * 1.3 + nT) + 0.04 * Math.cos(time0 * 0.29 + nT);
    T.turn = ease(T.turn, turnTo, dt, 10); T.tilt = ease(T.tilt, tiltTo, dt, 10);
    T.ring.rotation.set(T.tilt, T.turn, 0);
    U.asm.value = T.asm; U.held.value = T.held; U.hot.value = T.hot; U.beat.value = beat; U.arc.value = arc; U.burst.value = T.burst;
    U.soft.value = softNow; U.still.value = stillNow;
    U.icon.value = (1 - T.held * 0.6) * (0.82 + 0.18 * Math.sin(time0 * 1.6 + nT));
    T.group.visible = T.asm > 0.004;
    T.used = true;
  }
  // ------------------------------------------------------------------ ghost hands (T-043): hands of light on the wall plane that
  // perform the gesture beside the real hands. Two per wall (the second only for 'gather'). guide.ghost(wall, gesture, strength) sets
  // what a wall's ghost does (strength 0..1 eases in/out); the guide drives it itself from the state (see update) and a part or the
  // host may call it too (its call holds for 0.5 s over the guide's own). Gestures: 'tap' (press in), 'gather' (two hands sliding to
  // the centre), 'rise' (up 45 cm), 'lower' (down 45 cm), 'still' (held, breathing), 'raise' (one hand up 80 cm, slowly).
  const GHOST = 0.34, gq = new THREE.PlaneGeometry(GHOST, GHOST);
  const ghosts = room.walls.map((w, wi) => {
    const mk = () => {
      const a = uniform(0), hs = texture(handTex, uv()), mask = hs.r, depth = hs.b;
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = vec3(0.82, 0.8, 0.76).mul(mask.mul(depth.mul(0.7).add(0.3))).mul(a); m.opacityNode = mask.mul(0.3).mul(a);
      const mesh = new THREE.Mesh(gq, m); mesh.renderOrder = 23; mesh.visible = false; mesh.quaternion.copy(basis[wi]); object.add(mesh);
      return { mesh, a };
    };
    return { want: 'still', wantS: 0, gesture: 'still', s: 0, ph: Math.random(), extAt: -1e9, anchor: 0, phraseT: 0, tapDt: 9, h: [mk(), mk()] };
  });
  function ghost(wall, gesture, strength = 1) { const G = ghosts[wall]; if (!G) return; G.want = gesture; G.wantS = clamp(strength, 0, 1); G.extAt = time0; }
  const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function stepGhosts(dt) {
    for (let wi = 0; wi < NW; wi++) {
      const G = ghosts[wi], w = room.walls[wi];
      if (G.want !== G.gesture) { G.s = ease(G.s, 0, dt, 6); if (G.s < 0.02) { G.gesture = G.want; G.ph = 0; } } else G.s = ease(G.s, G.wantS, dt, 2);
      const T = G.gesture === 'raise' ? 6 : G.gesture === 'updown' ? 5 : 3.2; G.ph = (G.ph + dt / T) % 1;
      const ph = G.ph, env = sstep(ph / 0.15) * (1 - sstep((ph - 0.8) / 0.2)), e = sstep((ph - 0.15) / 0.5);
      for (let k = 0; k < 2; k++) {
        const H = G.h[k];
        let x = G.anchor, y = HAND_Y, sc = 1, a = env;
        if (G.gesture === 'tap') { sc = 1 - 0.14 * Math.sin(Math.PI * clamp((ph - 0.3) / 0.2, 0, 1)); a = 1 - sstep((ph - 0.85) / 0.15) * 0.3; }
        else if (G.gesture === 'rise') y = 1.1 + 0.45 * e;
        else if (G.gesture === 'lower') y = 1.55 - 0.45 * e;
        else if (G.gesture === 'base') y = 1.3 - 0.5 * e;             // down to the tower's foot (< 0.95 m)
        else if (G.gesture === 'raise') y = 1.2 + 0.8 * e;
        else if (G.gesture === 'phrase') {                            // the Tronc's phrase (4.8 s): down to receive, up, hold
          const p = G.phraseT; a = 1;
          y = p < 0.25 ? 1.5 - 0.45 * sstep(p / 0.25) : p < 0.75 ? 1.05 + 0.45 * sstep((p - 0.25) / 0.5) : 1.5;
        } else if (G.gesture === 'updown') {                          // the descent: go up to take it (1.0 → 1.6), then bring it down (≥ 0.40 m, slowly)
          y = ph < 0.1 ? 1.0 : ph < 0.35 ? 1.0 + 0.6 * sstep((ph - 0.1) / 0.25) : ph < 0.5 ? 1.6 : 1.6 - 0.6 * sstep((ph - 0.5) / 0.35);
          a = sstep(ph / 0.08) * (1 - sstep((ph - 0.9) / 0.1));
        } else if (G.gesture === 'tapAt') {                           // land on the beat: visible from 0.8 s before the moment, presses at it
          const d = G.tapDt; a = sstep((d + 0.8) / 0.3) * (1 - sstep((d - 0.15) / 0.3));
          sc = 1 - 0.16 * Math.max(0, 1 - Math.abs(d) / 0.15);
        }
        else if (G.gesture === 'still') { a = 0.75 + 0.25 * Math.sin(time0 * 0.8 + wi); }
        else if (G.gesture === 'gather') { x = (k ? 1 : -1) * (0.9 - 0.72 * e); }
        if (k === 1 && G.gesture !== 'gather') a = 0;
        const v = a * G.s;
        H.a.value = v; H.mesh.visible = v > 0.003;
        if (H.mesh.visible) { H.mesh.position.copy(w.centre).addScaledVector(w.right, x).setY(y).addScaledVector(w.normal, -0.03); H.mesh.scale.setScalar(sc); }
      }
    }
  }
  // the learned stand-in (until state.learned exists): 15 s of play with hands on the wall
  const SCORE_KEYS = new Set(['brasa', 'pinya', 'tronc', 'pom', 'aleta', 'baixada', 'festa']);
  let learnBlock = '', learnT = 0, learnedNow = false, learnedK = 0, playT = 0;
  function learning(S, dt) {
    const lb = S.block + (S.phase === 'aleta' ? ':aleta' : ''); if (lb !== learnBlock) { learnBlock = lb; learnT = 0; playT = 0; }
    const verb = verbOf(S);
    if (S.phase === 'play' || S.phase === 'aleta') { playT += dt; if (S.hands > 0) learnT += dt; }
    // the score's keys are the block names (ENT: learned.brasa / pinya / tronc / pom / aleta / baixada / festa)
    const L = S.learned && typeof S.learned === 'object' ? S.learned : null, key = S.block === 'pom' && S.phase === 'aleta' ? 'aleta' : S.block;
    learnedNow = !!verb && (SCORE_KEYS.has(key) && L ? !!L[key] : learnT >= 15);
    return verb;
  }
  let warnKind = '', warnUntil = -1;
  // walls outside the castell's structure still have a role (#11d): their own line
  const lineOut = typo.slot({ placements: typo.onWalls(room, TEXT.line), renderOrder: 23, outDur: 0.5, plate: 0, halo: 0.3, flash: room.flash });
  object.add(lineOut.object);
  // ------------------------------------------------------------------ N6: the achievement layer
  const achSlot = typo.slot({ placements: typo.onWalls(room, 0), renderOrder: 25, outDur: 0.6, plate: 0, halo: 0.35, flash: room.flash });
  object.add(achSlot.object);
  const achBase = typo.onWalls(room, 0), achRight = room.walls.map((w) => w.right.clone()), achS0 = [];
  { let a = 0; for (const w of room.walls) { achS0.push(a); a += w.width; } }
  const ACH_X = 2.3;                                       // the castell's walls: the word beside the tower (the other side of the consigna)
  let achShow = null, achPend = null, achUntil = -1, achKey = '', achN = 0, structAt = -1;
  const achMask = new Float32Array(NW), achX = new Float32Array(NW), achY = new Float32Array(NW);
  function achieve(S, ev, time) {
    if (ev === 'ach:close') structAt = time + 2.2;                     // the structure's name follows «El círculo se ha cerrado»
    const k = ev === 'struct' ? 'struct' : cueKey(ev, S); if (!k) return;
    const r = resolve(k, S); if (!r) return;
    const c = r.cue;
    if (c.breakFloor) { if (achShow && achShow.floor) { achPend = null; achUntil = time; } return; }   // a lost floor: its name breaks
    if (c.kind !== 'ach' || !r.text) return;
    const text = String(r.text), cap = Math.max(c.cap || 0, 0.18), floor = !!c.rise;   // 0.18 m: 0.14 was lost at room scale (capture 25-11)
    const a = S.ach || {}, walls = (S.castell && S.castell.walls && S.castell.walls.length) ? S.castell.walls : null;
    achMask.fill(0);
    if (c.place === 'ach' && a.wall >= 0 && a.wall < NW) {
      const w = a.wall, W = room.walls[w];
      achMask[w] = 1; achX[w] = clamp((typeof a.s === 'number' ? a.s - achS0[w] : W.width / 2) - W.width / 2, -W.width / 2 + 1, W.width / 2 - 1);
      achY[w] = clamp((a.y || 1.4) + 0.35, 1.2, 2.1);
    } else {
      const on = c.place === 'structure' && walls ? walls : [...Array(NW).keys()];
      const n = typeof r.n === 'number' ? r.n : 0;
      for (const w of on) { achMask[w] = 1; achX[w] = floor || c.place === 'structure' ? ACH_X : 0; achY[w] = floor ? 0.9 + clamp((n - 1) / 8, 0, 1) * 1.1 : c.place === 'structure' ? 1.95 : 1.95; }
    }
    achPend = { key: k + '|' + (++achN), items: [{ text, font: 'serif', size: cap / 0.667, y: 0, track: 0.02, color: ACH.lin.slice(), alpha: 1, edge: 0.5 }], mask: achMask.slice(), x: achX.slice(), y: achY.slice(), floor };
  }
  function stepAch(dt, S, events, time) {
    if (events) for (const e of events) if (e.startsWith('ach:') || e.startsWith('assist:on:') || e === 'relay:assist') achieve(S, e, time);
    if (structAt >= 0 && time >= structAt) { structAt = -1; achieve(S, 'struct', time); }
    if (achPend && achShow && achKey) { achKey = ''; }                // a new word: the old one breaks first
    if (achShow && time >= achUntil && achKey) achKey = '';           // 2.5 s, then it breaks into tiles
    if (achPend && !achSlot.up) {                                      // never slides in view: placed while nothing is up
      achShow = achPend; achPend = null; achKey = achShow.key; achUntil = time + 2.5;
      for (const t of achSlot.texts) t.P.forEach((P, w) => { P.mesh.position.copy(achBase[w].position).addScaledVector(achRight[w], achShow.x[w]).setY(achShow.y[w]); });
    }
    achSlot.want(achKey, achKey && achShow ? achShow.items : null);
    for (const t of achSlot.texts) t.U.halo.value = chapter(S.block).dark === false ? 0.65 : 0.35;   // gold over light: a darker halo
    achSlot.step(dt, { mask: (w) => (achShow ? achShow.mask[w] : 0) });
  }
  const nearX = (hands, wi) => { for (const h of hands) if (h.wall === wi && Math.abs((h.u - 0.5) * room.walls[wi].width) <= 0.55) return true; return false; };   // the score's test for the start ring
  let structureOnly = false; const inS = [];
  // the new chapter's words enter on a wall once the host's tile wave has passed it (+0.3 s, in typo3d's slot). room.tileFront(wall)
  // is INT/RND-F's (T-028); until it exists (or when it does not answer a number) every wall is open at once.
  // ASSUMED contract (to confirm against PARTS.md when it lands): tileFront(w) >= 1 once the front has passed wall w.
  const waveGate = (w) => { if (typeof room.tileFront !== 'function') return true; const f = room.tileFront(w); return !(typeof f === 'number') || f >= 1; };
  // obstacles (optional, from the host): [{ wall, x (m from the wall's centre), half (m), y0, y1 (m from the floor) }] — the parts'
  // heroes this frame (bodies, tower, particle bursts): the consigna treats them like targets (Art Director 25-11)
  let OBST = [];
  function update(dt, { state: S, hands = [], time = 0, on = true, acta = null, hold = false, pace = 1, events = null, obstacles = null }) {
    OBST = Array.isArray(obstacles) ? obstacles : [];
    // warnings (#19): the score's state.warn ('fall' | 'abandon') or its events 'warn:fall' / 'warn:abandon' (if the host passes events)
    if (events) for (const e of events) if (e === 'warn:fall' || e === 'warn:abandon') { warnKind = e.slice(5); warnUntil = time + 4; }
    const warn = S.warn || (time < warnUntil ? warnKind : '');
    const dtT = dt * Math.max(1, pace);   // the words' motion follows the score's clock: at a fast rehearsal pace a card still lands
    time0 = time; uTime.value = time; typo.setTime(time);
    const b = S.block, playing = S.phase !== 'title';
    const key = b + '|' + (b === 'tronc' ? +S.balance : 0) + '|' + S.buttons;
    const ringsNow = rings === true;   // targets3d.js draws S.targets (25-11)
    const wantT = on && ringsNow && (b === 'wait' || b === 'pinya' || b === 'tronc' || b === 'pom') && !(b === 'tronc' && S.phase === 'reward') && S.phase !== 'aleta';   // l'aleta: no ring, only the ghost hands rising
    if (key !== guideKey) { guideA = ease(guideA, 0, dt, 5); let gone = true; for (const T of targets) if (T.used && T.asm > 0.04) gone = false; if (guideA < 0.03 && gone) { guideKey = key; for (const T of targets) { T.held = 0; T.burst = 0; T.arcPrev = 0; } } } else guideA = ease(guideA, wantT ? 1 : 0, dt, 3);
    const gb = guideKey.slice(0, guideKey.indexOf('|'));
    const verb = learning(S, dt);
    // the teaching ladder: the ring teaches when a block starts and DISSOLVES into the universe's own target once the verb is learned
    // Pinya: the palm figure is the target from the start; the ring is only a brief teaching hint (the card and 6 s of play)
    learnedK = ease(learnedK, gb !== 'wait' && (learnedNow || (gb === 'pinya' && S.phase !== 'title' && playT > 6)) ? 1 : 0, dt, 2.5);
    revealNow = gb === 'wait' ? clamp(S.reveal ?? 1, 0, 1) : 1;
    // the chapter's palette for the tiles and the glass
    const pal = PALETTES[gb] || PALETTES.wait;
    for (let k = 0; k < 3; k++) { for (let c = 0; c < 3; c++) palNow[k][c] = ease(palNow[k][c], pal[k][c], dt, 2); PAL[k].value.setRGB(palNow[k][0], palNow[k][1], palNow[k][2]); }
    { const a = accentOf(b); for (let c = 0; c < 3; c++) accNow[c] = ease(accNow[c], a[c], dt, 1.5); ACC.value.set(accNow[0], accNow[1], accNow[2]);
      for (const sl of [card, line, lineOut]) for (const t of sl.texts) t.U.lamp.value.set(0.5 + 0.5 * accNow[0], 0.5 + 0.5 * accNow[1], 0.5 + 0.5 * accNow[2]); }
    INK = inkOf(b); const lightCh = chapter(b).dark === false; INK_A = lightCh ? 1 : 0.92; WRAP = !!HERO_HALF[b]; CAP = LINE_CAP[b] || TEXT.lineCap; if (!line.up) lineY = LINE_Y[b] || TEXT.line;   // the next words laid out take the chapter's ink
    nT = 0;
    for (const T of targets) T.used = false;
    softNow = gb === 'pinya' || gb === 'tronc' || gb === 'baixada' ? 1 : 0;
    stillNow = gb === 'pom' ? 1 : 0;
    const walls = S.walls || [];
    for (let w = 0; w < NW; w++) {
      const sw = !!walls[w];
      if (gb === 'wait') put(w, 0, 1, nearX(hands, w) && revealNow >= 1, near(hands, w, 0), 0, S.start || 0, dt);   // lit only where the score counts (#14)
      else if (gb === 'pinya') { const offs = S.buttons >= 3 ? 3 : S.buttons === 2 ? 2 : 1; for (let k = 0; k < offs; k++) { const o = offs === 3 ? (k - 1) * 1.1 : offs === 2 ? (k ? 0.7 : -0.7) : 0; const nh = near(hands, w, o); put(w, o, 1, nh, nh, 0, S.fill[w], dt); } }
      else if (gb === 'tronc') { const beat = 0;   // no 2.4 s pulse ring: the Tronc is lift and level (#13); off the structure the ring teaches too (#11d)
        if (!sw) { put(w, 0, 0.6, S.count[w] > 0, near(hands, w, 0), beat, 0, dt); continue; } if (S.balance) { put(w, -0.65, 1, S.left[w] && near(hands, w, -0.65), near(hands, w, -0.65), beat, S.floorProgress, dt); put(w, 0.65, 1, S.right[w] && near(hands, w, 0.65), near(hands, w, 0.65), beat, S.floorProgress, dt); } else put(w, 0, 1, S.count[w] > 0, near(hands, w, 0), beat, S.floorProgress, dt); }
      else if (gb === 'pom') put(w, 0, !sw ? 0.4 : w === S.lightWall ? 1 : w === S.nextWall ? 0.8 : 0.4, S.count[w] > 0, near(hands, w, 0), 0, w === S.lightWall ? S.climb : 0, dt);
    }
    // the ghost hands: teaching at the start of the block (in the ring, or beside a real hand), then help that grows while the group has
    // not got it (state.assist when the score gives it), gone once learned. L'aleta: hands rising slowly under the enxaneta, always.
    if (verb && on) {
      const teach = S.phase === 'title' || playT < 10;
      const assist = S.assist ?? (0.25 + 0.45 * clamp((playT - 20) / 20, 0, 1));
      const aleta = verb === 'alzar', wob = b === 'tronc' && S.wobble > 0;
      const sG = aleta || wob ? 0.85 : learnedNow ? 0 : teach ? 1 : assist;
      for (let w = 0; w < NW; w++) {
        if (time0 - ghosts[w].extAt < 0.5) continue;                 // a part / the host asked for this wall
        const mine = true;                                           // every wall (#11d)
        let anchor = 0;                                              // beside the first real hand on the wall (towards the centre)
        for (const h of hands) if (h.wall === w) { const xm = (h.u - 0.5) * room.walls[w].width; anchor = xm + (xm > 0 ? -0.45 : 0.45); break; }
        ghosts[w].anchor = ease(ghosts[w].anchor, anchor, dt, 2);
        const g = wob ? (w === S.wobbleWall ? 'base' : null) : GESTURES[verb];
        ghosts[w].want = g || ghosts[w].want; ghosts[w].wantS = mine && g ? sG : 0;
        if (aleta || wob) ghosts[w].anchor = 0;                  // under the enxaneta / at the tower's foot: the wall's centre
        ghosts[w].phraseT = S.phraseT ?? 0;
        if (b === 'brasa' && S.brasaStage === 'call' && S.call) {   // the call: a hand lands on the TOK on the calling walls
          const C = S.call, on2 = C.to === -1 || w === C.from || w === C.to;
          ghosts[w].want = 'tapAt'; ghosts[w].tapDt = (S.clock ?? 0) - C.at; ghosts[w].wantS = on2 && !learnedNow ? 1 : 0; ghosts[w].anchor = 0;
        }
      }
    } else if (b === 'festa' && on) {                                  // the echo (#21): on the arrival wall, a hand lands 0.8 s before the front
      for (let w = 0; w < NW; w++) { if (time0 - ghosts[w].extAt < 0.5) continue; ghosts[w].want = 'tapAt'; ghosts[w].wantS = 0; ghosts[w].anchor = 0; ghosts[w].tapDt = 9; }
      for (const f of S.fronts || []) { const G = ghosts[f.to]; if (!G || time0 - G.extAt < 0.5) continue; const d = (S.clock ?? 0) - f.arrive; if (d > -0.8 && d < 0.5 && Math.abs(d) < Math.abs(G.tapDt)) { G.tapDt = d; G.wantS = f.ghost ? 0.6 : 0.9; } }
    } else for (let w = 0; w < NW; w++) if (time0 - ghosts[w].extAt >= 0.5) ghosts[w].wantS = 0;
    if (warn) for (let w = 0; w < NW; w++) if (time0 - ghosts[w].extAt >= 0.5) { ghosts[w].want = 'still'; ghosts[w].wantS = 0.6 + 0.4 * Math.abs(Math.sin(time0 * 3)); ghosts[w].anchor = 0; }   // the visual pulse of a warning
    if (!ghostsOn) for (let w = 0; w < NW; w++) ghosts[w].wantS = 0;   // 25-11: no hand glyph in the room
    stepGhosts(dt);
    // the targets not placed this frame break where they were
    for (let i = nT; i < MAXT; i++) { const T = targets[i]; T.asm = ease(T.asm, 0, dt, 4); T.U.asm.value = T.asm; T.group.visible = T.asm > 0.004; T.held = 0; }

    // the words; from the Tronc on, the instructions belong to the walls that carry the castell
    const g = on ? lines(S, acta, learnedNow, warn) : {};
    structureOnly = (b === 'tronc' || b === 'pom' || b === 'baixada') && S.structure > 0 && S.structure < NW;
    for (let w = 0; w < NW; w++) inS[w] = !!walls[w];
    card.want(g.card ? 'c|' + g.card.join('|') : '', g.card ? cardItems(g.card) : null);
    const L = g.line && (g.line[0] || g.line[1]) ? g.line : null;   // (an empty invitation with a label: the floor's / climber's name alone)
    if (L && !(b === 'brasa' && S.brasaStage === 'relay') && blocked(S, b, L[0], time)) lineNonce++;
    line.want(L ? 'l|' + lineNonce + '|' + (S.stage || '') + '|' + L.join('|') : '', L ? lineItems(L) : null);   // a consigna lives within its stage
    // 25-11: no plates; a tight soft halo (lighter on the light chapters, where the ink is dark)
    for (const sl of [card, line, lineOut]) for (const t of sl.texts) { t.U.plate.value = 0; t.U.halo.value = lightCh ? 0.2 : (chapter(b).luma || 0) > 0.25 ? 0.55 : 0.3; }   // bone over a lit plaza (crown, festa): a fuller soft shadow under the letters
    if (!card.up) { for (const t of card.texts) t.P.forEach((P, w) => { const side = b === 'crown' ? Math.min(2.1, room.walls[w].width / 2 - 1.7) : 0; P.mesh.position.copy(cardBase[w].position).addScaledVector(rightOf[w], side); }); }   // beside the crowned castell (seen at the centre of every wall), never across a corner (the P3→P4 seam)
    { let fwc = S.focus && S.focus.wall >= 0 && S.focus.wall < NW ? S.focus.wall : -1;   // no calling wall yet: the wall with the most hands
      if (fwc < 0 && Array.isArray(S.count)) { let best = 0; S.count.forEach((c, w) => { if (c > best) { best = c; fwc = w; } }); }   // the card too: 100 % on the wall that calls, 30 % elsewhere
      card.step(dtT, { hold, gate: waveGate, mask: fwc >= 0 ? (w) => (w === fwc ? 1 : 0.3) : null, lead: fwc >= 0 ? (w) => (w === fwc ? 0 : 0.6) : null }); }
    // the wait's words come with the button (reveal) and thin out as the hands start the pass
    const st = b === 'wait' ? Math.min(1, S.start || 0) : 0;
    let gain = b === 'wait' ? 1 - st * st : 1;   // the invitation to play before the reveal, the ring's line after it
    // and the instruction dims once the group is already doing it
    let doing = 0;
    if (b === 'pinya' && S.phase === 'play') { let h = 0; for (let w = 0; w < NW; w++) if (S.count[w] > 0) h++; doing = clamp(h / Math.max(1, S.needWalls), 0, 1); }
    else if (b === 'tronc' && S.phase === 'play') { let need = 0, ok = 0; for (let w = 0; w < NW; w++) if (walls[w]) { need++; if (S.balance ? S.left[w] && S.right[w] : S.count[w] > 0) ok++; } doing = need ? ok / need : 0; }
    else if (b === 'pom') doing = S.lightWall >= 0 && S.count[S.lightWall] > 0 && !S.restless ? 1 : 0;
    else if (b === 'baixada') { let need = 0, ok = 0; for (let w = 0; w < NW; w++) if (walls[w]) { need++; if (S.count[w] > 0) ok++; } doing = need ? ok / need : 0; }
    gain *= 1 - 0.2 * doing;   // the words stay clear while the group does it (Art Director 25-11: «faint»)
    const cardUp = card.up;
    // N6: the wall that calls carries the consigna at 100 % and first; the others an echo at 30 %, 0.6 s later (not for the calls to
    // all, l'aleta, the wait's invitation or a warning)
    let fw = S.focus && S.focus.wall >= 0 && S.focus.wall < NW ? S.focus.wall : -1;   // no calling wall: the wall with the most hands
    if (fw < 0 && Array.isArray(S.count)) { let best = 0; S.count.forEach((c, w) => { if (c > best) { best = c; fw = w; } }); }
    const allCall = !!warn || (b === 'brasa' && S.brasaStage === 'call') || (b === 'festa' && S.festaStage === 'call') || (b === 'wait' && (S.reveal ?? 1) < 1);
    const focusOn = fw >= 0 && !allCall;
    const mask = (w) => (!!warn || S.phase === 'aleta' || !structureOnly || inS[w] ? (focusOn && w !== fw ? 0.3 : 1) : 0);   // a warning and l'aleta go on every wall
    const lead = focusOn ? (w) => (w === fw ? 0 : 0.6) : null;
    // the wait: the instruction is the lintel inscription of ENT-F's doorway (keystone ~1.95 m): one line centred at 2.12 m. It moves
    // only while no words are up (never slides in view)
    // 25-11: the consigna stands at 1.62 m everywhere (D7), beside the chapter's hero, and waits while the chapter card is up
    const travel = b === 'brasa' && S.brasaStage === 'relay' && S.focus && S.focus.kind === 'relay' && S.focus.wall >= 0 && S.focus.wall < NW && typeof S.focus.s === 'number';
    if (travel) {
      for (let w = 0; w < NW; w++) lineXT[w] = CONSIGNA_X[b] || 0;
      const ds = S.focus.s - travelS; if (Math.abs(ds) > 0.02 && Math.abs(ds) < 3) travelDir = Math.sign(ds); travelS = S.focus.s;   // the relay runs both ways
      const fw2 = S.focus.wall, Wd = room.walls[fw2].width; lineXT[fw2] = clamp(S.focus.s - lineS0[fw2] - Wd / 2 - 1.9 * travelDir, -Wd / 2 + 1.1, Wd / 2 - 1.1);   // it FOLLOWS the fire (behind it): the devil runs ahead, never into the words
      if (!travelOn) { lineX.set(lineXT); travelOn = true; }
      for (let w = 0; w < NW; w++) lineX[w] = ease(lineX[w], lineXT[w], dt, 2.2);
      placeX(line, lineX);
    } else { travelOn = false; if (!line.up) placeX(line, spotX(S, b, L ? L[0] : '')); }
    if (!lineOut.up) placeX(lineOut, spotX(S, b, 'Levantad los bloques'));
    line.step(dtT, { gain: warn ? 1 : gain, hold: hold || (cardUp && !warn), mask, gate: waveGate, lead });
    stepAch(dtT, S, events, time);
    if (warn) for (const t of line.texts) { t.U.sweepK.value = 1; t.U.sweep.value = ((time0 * 0.9) % 1.6) - 0.3; }   // the warning pulses
    // the walls outside the structure: «Ayudad desde aquí» (they count at 50 %), while the structure's walls carry the invitation
    // the walls outside the structure carry their line ONLY in the stages that ask for every wall's hands (a consigna lives within its stage)
    const outOn = on && structureOnly && !warn && S.phase === 'play' && (S.stage === 'tronc:lift' || S.stage === 'pom:relay' || S.stage === 'baixada:lower');
    const outWord = b === 'tronc' ? CUES['title:tronc'].others : 'Sostened la luz';   // the Tronc's targets are blocks; elsewhere the target is «la luz»
    lineOut.want(outOn ? 'o|' + (S.stage || '') + '|' + outWord : '', outOn ? lineItems([outWord, '']) : null);
    lineOut.step(dtT, { gain, hold: hold || cardUp, mask: (w) => !inS[w], gate: waveGate });
  }
  function dispose() {
    ringGeo.dispose(); discGeo.dispose(); tileGeo.dispose(); handTex.dispose(); gq.dispose(); for (const G of ghosts) for (const H of G.h) H.mesh.material.dispose();
    for (const T of targets) T.group.traverse((o) => { if (o.material) o.material.dispose(); });
    for (const s of [card, line, lineOut, achSlot]) s.dispose();
  }
  return { object, update, dispose, ghost, targets, layers: { card, line, ach: achSlot }, get learned() { return learnedNow; } };
}
