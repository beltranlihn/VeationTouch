// Ressonància — the guide in 3D (the whole work's host, res-obra3d): where the hands go and what the walls say. T-027 (ARTE-2 §5–6).
//
//   const guide = createGuide({ THREE, TSL, room });   room.scene.add(guide.object);
//   guide.update(dt, { state, hands, time, on, acta, hold, pace });   // every frame; state = the score's state; on = the "guide" parameter
//
// Targets are OBJECTS. T-059 (ARTE-ENTRADA, Saltmere skills): a LIQUID-GLASS LENS on the wall plane (r 0.28 m, centred at 1.25 m; all of
// it inside r ≤ 0.30 m, ENT's tile ring lives at 0.36–0.55 m): one quad per target with analytic normals (flat top, slight dome, a
// 2.5 cm round bevel) → the scene's tones bent through the bevel (on sand; the env on a deep ground), Fresnel reflection, the key light's
// crescent on the upper bevel and an inner shade below, a thin white rim that catches the nearest hand's light (room.flash, the
// gradient-border-flashlight), and a contact shadow #8A6F58 on the wall. The hand is a 2–3 px fine line (ink #2E2A26 on a light ground,
// bone on a deep one). Progress = the instrument: a 3 px cobalt #1F3FA8 arc on the rim with a bead at its head, ticks every 10° on the
// bezel taking the glaze as it passes (no label: QA, it did not read at room distance), a quiet liquid glaze filling
// from the rim. A hand landing sends a ring through the glass from its point at once (< 100 ms) and the lens leans towards it (±0.25 rad,
// 3d-feature-objects). Complete → a seismic ripple with contour lines (interactive-topography), then the glass goes to grains from the
// centre outwards (hover-particle-dissolve: glass and grains share ONE erosion function at the rest position). It condenses from grains
// as the public's play reveals it (state.reveal) and fills with state.start. Pom: still, breathing. Light/deep look follows the ground:
// uLite = 1 in the wait when room.PALETTE.wait is light (ENT T-058); then the wait's words are ink #2E2A26 on a pale veil, no sweep.
// Positions and rules as before: wait one per wall; Pinya 1–3 per wall (state.buttons); Tronc one per castell wall, two (both sides)
// once state.balance; Pom the light's wall bright, the next one half; Baixada one per castell wall.
// Words (typo3d.js): the chapter card like a film title (small roman numeral, big serif name, the value in italic on a hairline) at
// ~2.15 m, and the instruction (Geist) at ~1.92 m, on the walls (from Tronc on, only the castell's walls); old words break before new
// ones assemble; the instruction dims once the group is already doing it. Everything in Spanish; casteller words in Catalan.
// T-048 (SIS, ARTE-3 §3): the instructions come into focus word by word (typo3d 'blur'), labels in Geist Mono; the fine graphics layer
// (rulers, «+», dotted grid, mono labels) in the chapter's accent; rims, plates, words and graphics catch the hands' light (room.flash).
// Nothing is allocated per frame: every mesh is made once; words are laid out only when they change.
import { FLOOR_NAMES, CLIMBERS } from '../score.js';
import { typo, OVER } from './typo3d.js';

// [numeral, name, value]
export const CARDS = { brasa: ['I', 'Brasa', 'El despertar'], pinya: ['II', 'Pinya', 'Fuerza'], tronc: ['III', 'Tronc', 'Equilibrio'], pom: ['IV', 'Pom de dalt', 'Valor'] };
const HAND_Y = 1.25, MAXT = 16;
// T-059 (ARTE-ENTRADA §c): the liquid-glass lens r 0.28 m (Ø 0.56) with a 2.5 cm round bevel; the 3 px cobalt arc on its rim (r 0.2875),
// the ticks every 10° on the bezel inside the edge; everything inside r ≤ 0.30 m (ENT's tile ring is at 0.36–0.55 m)
const RL = 0.28, BEV = 0.025, RA = 0.2875, ARC_HW = 0.0057, RT0 = 0.238, RT1 = 0.25, TICK_HW = 0.0024, LQ = 0.30, GLYPH = 0.39, LINE_HW = 0.0048, NGRAIN = 720;
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
  const out = linesPlay(S, acta, learned, warn);
  if (cardNow) out.card = cardNow;
  return out;
}
function linesPlay(S, acta, learned, warn) {
  const b = S.block;
  if (warn === 'fall') return { line: ['Manos al muro', ''] };      // the score warns before a fall / before giving up (analysis #19)
  if (warn === 'abandon') return { line: ['Volved al muro', ''] };
  if (b === 'wait') return { line: (S.reveal ?? 1) >= 1 ? ['Mantened la mano en el círculo', ''] : ['Tocad. Jugad con la sala.', ''] };   // strings agreed with ENT (voice)
  if (b === 'brasa') return S.phase === 'reward' ? {} : S.brasaStage === 'call' ? (learned ? {} : { line: ['Con el tambor', ''] }) : S.brasaStage === 'relay' ? { line: ['Pasad el fuego', ''] } : { line: ['Tocad el muro', ''] };   // by the score's stage (#18)
  if (b === 'pinya') return S.phase === 'reward' || learned ? {} : { line: ['Juntaos', ''] };   // follow the palm to the centre, pack together (#17)
  if (b === 'tronc') {
    if (S.phase === 'reward') return {};
    const fl = S.floors ? FLOOR_NAMES[S.floors - 1] : '';
    if (S.wobble > 0) return { line: ['Sujetad la base', fl] };          // the tower trembles: hands to its foot
    return { line: [learned ? '' : 'Levantad', fl] };
  }
  if (b === 'pom') {                                                 // l'aleta: no words
    if (S.phase === 'aleta') return {};
    // T-051 (POV): three climbs (state.pomStage, POS T-050) — the relay asks for still hands; the breath holds it; the silence has no words
    if (S.pomStage === 'breath') return { line: ['Contened el aliento', CLIMBERS[S.climber] || ''] };
    if (S.pomStage === 'silence') return { line: ['', CLIMBERS[S.climber] || ''] };
    return { line: [learned ? '' : 'Quietos', CLIMBERS[S.climber] || ''] };
  }
  // the acta's wall line («Dejad vuestra mano», 3–15 s) is drawn by parts/actatext (it sits under the castell, the ring of prints round it)
  if (b === 'crown') return S.t > 3 && S.t < 14 ? { card: ['V', 'Coronado', acta?.castell || "L'aleta"] } : {};
  if (b === 'festa') return S.t < 7 ? { card: ['', 'La plaza es vuestra', ''] } : {};
  if (b === 'baixada') return { line: [learned ? '' : 'Bajadlo despacio', S.floors ? FLOOR_NAMES[S.floors - 1] : ''] };   // the floors' names going down
  if (b === 'fall') return S.t > 2 ? { card: ['', 'Ha caído', 'Quedan las brasas'] } : {};
  return {};
}
// ink: bone #F2EEE6 at 92 %, kept under the bloom's threshold (no neon halo; the luxury is the thin-film sweep and the tiles)
const INK = [0.76, 0.73, 0.68];
// the card: the numeral first (0.2 s ahead), the name (caps ≈ 0.31 m), the hairline drawn from the centre out, the value rising
// from behind its baseline
function cardItems(C) {
  const it = [];
  if (C[0]) it.push({ text: C[0], font: 'sans', size: 0.1, y: 0.4, track: 0.5, alpha: 0.6, color: INK, edge: 0.47 });
  it.push({ text: C[1], font: 'serif', size: C[1].length > 14 ? 0.38 : 0.46, y: 0.04, track: 0.01, color: INK, delay: 0.2 });
  if (C[2]) it.push({ text: C[2], font: 'italic', size: 0.17, y: -0.3, track: 0.015, rules: 0.5, alpha: 0.85, color: INK, rise: true, delay: 0.35 });
  return it;
}
// the instruction: ONE centred piece (caps ≈ 0.10 m, ≤ 28 characters), the second idea under it as a label in small caps
// T-059: on a light ground (the sand entrance) the words are ink #2E2A26 and the mono label #6B5F52 (ARTE-ENTRADA: contrast ≥ 7:1, never white)
const INK_D = [0.0273, 0.0232, 0.0185], LABEL_D = [0.147, 0.115, 0.084];
const lineItems = (L, dark = false) => {
  const it = [], ink = dark ? INK_D : INK;
  // T-048: the words come into focus one by one (typo3d reveal 'blur', 60 ms per word); the label under them in Geist Mono caps
  if (L[0]) it.push({ text: L[0], font: 'sans', size: 0.15, y: L[1] ? 0.07 : 0, track: 0.02, alpha: dark ? 1 : 0.88, color: ink, edge: dark ? 0.43 : 0.5, reveal: 'blur' });   // round 2: medium on sand
  if (L[1]) it.push({ text: L[1], font: 'mono', size: 0.082, y: -0.15, track: 0.14, alpha: dark ? 1 : 0.6, color: dark ? LABEL_D : ink, upper: true, edge: 0.48, delay: 0.15, reveal: 'blur' });
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

export function createGuide({ THREE, TSL, room }) {
  const { pmremTexture, refract, cross, uniform, uv, vec2, vec3, vec4, atan, float, smoothstep, exp, length, step, texture, select, clamp: tclamp, max, min, cos, sin, abs, pow, dot, normalize, reflect, attribute, positionGeometry, positionLocal, normalWorld, positionWorld, cameraPosition, mix, fract } = TSL;
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

  // ------------------------------------------------------------------ T-059: the liquid-glass lens (one family for every target)
  // The hand as a FINE LINE: the open hand's silhouette (palm + five round-tipped fingers, the same design as the trencadís hand),
  // filled once at 512 px and blurred (3 px): the 0.5 level of that soft field is the outline, drawn in the shader as a hairline
  // with a width in metres (2–3 px of the room, ARTE-ENTRADA), no fill.
  const LN = 512, lcv = document.createElement('canvas'); lcv.width = lcv.height = LN;
  {
    const big = document.createElement('canvas'); big.width = big.height = 512;
    const g = big.getContext('2d'); g.fillStyle = '#fff';
    const capsule = (bx, by, len, w, a) => { g.save(); g.translate(bx, by); g.rotate(a); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -len + w / 2); g.arc(0, -len + w / 2, w / 2, Math.PI, 0); g.lineTo(w / 2, 0); g.arc(0, 0, w / 2, 0, Math.PI); g.closePath(); g.fill(); g.restore(); };
    g.beginPath(); g.roundRect(184, 282, 156, 182, [64, 64, 86, 86]); g.fill();                    // palm
    capsule(204, 352, 128, 28, -0.95);                                                              // thumb
    capsule(210, 292, 150, 28, -0.24); capsule(254, 284, 172, 28, -0.07); capsule(296, 290, 156, 28, 0.11); capsule(334, 308, 114, 28, 0.32);
    const out = lcv.getContext('2d', { willReadFrequently: true });
    out.fillStyle = '#000'; out.fillRect(0, 0, LN, LN); out.filter = 'blur(3px)'; out.drawImage(big, 0, 0, LN, LN); out.filter = 'none';
  }
  const lineTex = new THREE.CanvasTexture(lcv); lineTex.colorSpace = THREE.NoColorSpace; lineTex.wrapS = lineTex.wrapT = THREE.ClampToEdgeWrapping;

  // shared geometry: the lens and the instrument (one quad), its contact shadow (one quad), its grains (instanced quads)
  const lensGeo = new THREE.PlaneGeometry(LQ * 2, LQ * 2), shadowGeo = new THREE.PlaneGeometry(0.8, 0.8);
  const grainGeo = (() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const a = new Float32Array(NGRAIN * 4);
    for (let i = 0; i < NGRAIN; i++) { const h = (k) => ((Math.sin((i + 1) * (12.9898 + k * 7.3) + k * 3.1) * 43758.5453) % 1 + 1) % 1; a[i * 4] = h(1); a[i * 4 + 1] = h(2); a[i * 4 + 2] = h(3); a[i * 4 + 3] = h(4); }
    g.setAttribute('aG', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = NGRAIN;
    return g;
  })();
  // the ONE erosion function, evaluated at a point's REST position by both the glass and its grains (hover-particle-dissolve):
  // a 9 mm cell hash; eA (assemble: the centre condenses first, the rim last), eB (the burst: the seismic front releases it outwards)
  const cellHash = (p) => { const c = TSL.floor(p.mul(110)); return fract(sin(dot(c, vec2(12.9898, 78.233))).mul(43758.5453)); };
  const erosion = (p, U) => {
    const h = cellHash(p), rr = length(p).div(RL);
    const eA = h.mul(0.55).add(rr.mul(0.45)), kA = U.asm.mul(1.08);
    const eB = rr.mul(0.7).add(h.mul(0.3)), kB = U.burst.mul(1.45).sub(0.3);
    return { h, eA, kA, eB, kB };
  };
  const env = (dir, rough) => (room.envMap ? pmremTexture(room.envMap, dir, float(rough)).rgb : mix(vec3(0.02, 0.025, 0.05), vec3(0.5, 0.42, 0.36), smoothstep(-0.2, 0.9, dir.y)));
  // the look of the block (eased): uLite 1 = a light ground (the sand entrance: ink, contact shadow), 0 = a deep universe (bone,
  // a dark disc under the glass); uInk the glyph / label / ticks; uGlaze the liquid and the arc of light
  const uLabel = uniform(new THREE.Vector3(0.147, 0.115, 0.084)), uLite = uniform(0), uInk = uniform(new THREE.Vector3(0.62, 0.6, 0.56)), uGlaze = uniform(new THREE.Vector3(0.03, 0.11, 0.62));
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ targets: a pool, each with its own uniforms
  const targets = [];
  for (let i = 0; i < MAXT; i++) {
    const U = { asm: uniform(0), held: uniform(0), hot: uniform(0), arc: uniform(0), burst: uniform(0), soft: uniform(0), still: uniform(0), seed: uniform(i * 0.137),
      hp: uniform(new THREE.Vector2(0, 0)), tap: uniform(9) };
    const group = new THREE.Group(); group.visible = false;
    const breathe = float(1).add(sin(uTime.mul(0.9).add(U.seed.mul(9.0))).mul(0.02).mul(U.still));
    const RLb = float(RL).mul(breathe);
    const fade = float(1).sub(U.soft.mul(0.3));

    // --- the contact shadow on the wall (a light ground), or the soft dark disc that lets it read over a deep universe
    {
      const p = uv().sub(0.5).mul(0.8), r = length(p), ps = length(p.sub(vec2(0, -0.01)));
      const out = max(ps.sub(RLb), float(0));
      const soft = exp(out.mul(out).div(-2 * 0.024 * 0.024));                      // the penumbra, a little below (light from above)
      const ao = exp(max(r.sub(RLb), float(0)).div(-0.006)).mul(0.22).mul(float(1).sub(smoothstep(RL - 0.01, RL, r).oneMinus()));
      const under = float(1).sub(smoothstep(RLb.sub(0.004), RLb, r));
      const lite = soft.max(under).mul(0.25);   // ART: #8A6F58 at 25 %, offset 1 cm (no AO stacked on it)
      const dark = under.mul(0.5).add(float(1).sub(smoothstep(RLb, RLb.mul(1.5), r)).mul(0.12));
      const k = smoothstep(0.35, 0.95, U.asm).mul(float(1).sub(smoothstep(0.1, 0.6, U.burst))).mul(fade);
      const a = mix(dark, lite, uLite).mul(k);
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = mix(vec3(0.004, 0.005, 0.008), vec3(0.254, 0.159, 0.098), uLite).mul(a); m.opacityNode = a;   // #8A6F58 (ART: the scene's value floor)
      const mesh = new THREE.Mesh(shadowGeo, m); mesh.renderOrder = 19; group.add(mesh);
    }
    const ring = new THREE.Group(); group.add(ring);                                           // the lens tilts towards a hand
    // --- the lens and the instrument round it
    {
      const p = uv().sub(0.5).mul(LQ * 2), r = length(p), dirR = p.div(max(r, float(1e-4)));
      const fw = max(TSL.fwidth(r), float(1e-4));
      const f = fract(atan(p.x, p.y).div(TAU).add(1));                                         // 0 at the top, clockwise
      const E = erosion(p, U);
      const solid = step(E.eA, E.kA).mul(step(E.kB, E.eB));
      const inside = float(1).sub(smoothstep(RLb.sub(fw), RLb.add(fw), r));
      // the lens's surface: a flat top with a slight dome and a round bevel of BEV m; slope → normal (local, z out of the wall)
      const t = tclamp(float(1).sub(RLb.sub(r).div(BEV)), 0, 1);
      let slope = t.div(TSL.sqrt(max(float(1).sub(t.mul(t)), float(0.03)))).min(5.0).add(r.div(RL).mul(0.12));
      // the seismic ripple at completion (interactive-topography): a front from the centre past the rim in ~0.9 s
      const front = U.burst.mul(0.42), dfr = r.sub(front);
      const quake = sin(dfr.mul(150)).mul(exp(dfr.mul(dfr).mul(-1400))).mul(float(1).sub(smoothstep(0.6, 1.0, U.burst))).mul(step(0.0001, U.burst));
      slope = slope.add(quake.mul(1.4));
      // the touch: a ring in the glass from the hand's point, at once (< 100 ms), fading in ~1 s
      const dh = p.sub(U.hp), rh = length(dh), dtp = rh.sub(U.tap.mul(0.32));
      const touch = sin(dtp.mul(140)).mul(exp(dtp.mul(dtp).mul(-1800))).mul(exp(U.tap.mul(-2.2))).mul(0.9);
      const nl = normalize(vec3(dirR.mul(slope).add(dh.div(max(rh, float(1e-4))).mul(touch)), 1));
      const N = normalize(TSL.modelWorldMatrix.mul(vec4(nl, 0)).xyz), V = normalize(cameraPosition.sub(positionWorld));
      const ndv = abs(dot(N, V)), g1 = float(1).sub(ndv), F = g1.mul(g1).mul(g1).mul(g1).mul(g1).mul(0.96).add(0.04);
      // refraction with a slight chromatic split (three IORs), the env reflected; the key light from above (the room's one recipe)
      const I = V.negate();
      const refr = vec3(env(refract(I, N, float(1 / 1.43)), 0.2).r, env(refract(I, N, float(1 / 1.45)), 0.2).g, env(refract(I, N, float(1 / 1.47)), 0.2).b);
      const refl = env(reflect(I, N), 0.06);
      const Lk = normalize(vec3(-0.25, 0.85, 0.6)), shade = dot(nl, Lk).mul(0.5).add(0.5);
      const H = normalize(V.add(normalize(TSL.modelWorldMatrix.mul(vec4(Lk, 0)).xyz)));
      const spec = pow(max(dot(N, H), 0), 90.0);
      const edge = smoothstep(0.0, 1.0, t);
      // layer by layer, premultiplied (c: colour × alpha, a: coverage)
      let c = vec3(0), a = float(0);
      const over = (col, al) => { c = col.mul(al).add(c.mul(float(1).sub(al))); a = al.add(a.mul(float(1).sub(al))); };
      // 1. the body: frosted, almost clear in the middle; the bevel shows the world bent through it (a light ground: milk and sand;
      //    a deep universe: dark glass, as before)
      const frost = mix(vec3(0.006, 0.007, 0.01), vec3(0.82, 0.89, 0.905), uLite);   // #EAF2F4 at 14 % on a light ground
      // round 2 (ART): no grey env in the glass on a light ground — a cheap refraction of the SCENE's tones: the room's background
      // gradient (sand below, cream above), sampled at the height the bevel looks to (flipped, as a lens does), a touch brighter
      const bgk = tclamp(float(0.5).add(positionWorld.y.sub(HAND_Y).div(0.9)).sub(nl.y.mul(1.6)), 0, 1);
      const sceneT = room.background ? mix(room.background.bottom, room.background.top, bgk).mul(room.background.gain).mul(1.04) : refr;
      const bent = mix(refr, sceneT, uLite);
      const bodyA = mix(mix(float(0.5), float(0.14), uLite), mix(float(0.75), float(0.7), uLite), edge.mul(edge)).mul(inside);
      const body = mix(frost, bent.mul(mix(float(1.1), float(1.0), uLite)), edge.mul(0.9)).mul(shade.mul(mix(float(0.35), float(0.18), uLite)).add(mix(float(0.75), float(0.9), uLite)));
      over(body, bodyA);
      // 2. the liquid glaze, filling from the rim inwards as the hold grows, its meniscus trembling
      const lvl = U.arc, wob = sin(atan(p.x, p.y).mul(5).add(uTime.mul(1.7))).mul(0.004).add(sin(atan(p.x, p.y).mul(9).sub(uTime.mul(2.3))).mul(0.0025)).mul(lvl.mul(float(1).sub(lvl)).mul(4));
      const mr = RLb.mul(float(1).sub(lvl)).add(wob);
      const wet = smoothstep(mr.sub(fw), mr.add(fw), r).mul(inside).mul(step(0.002, lvl));
      const glazeC = uGlaze.mul(shade.mul(0.45).add(0.7)).add(refr.mul(0.08));
      over(glazeC, wet.mul(mix(float(0.45), float(0.1), uLite)));   // quiet: the arc is the signal (ART)
      const men = tclamp(float(1).sub(abs(r.sub(mr)).div(fw.mul(1.2))), 0, 1).mul(inside).mul(step(0.002, lvl)).mul(step(lvl, 0.995));
      c = c.add(vec3(1.0, 0.98, 0.95).mul(men).mul(0.25));
      // 3. the hand: a fine line, softly embossed; ink on a light ground, bone on a deep one; it warms to the glaze under a hand
      const huv = p.div(GLYPH).add(vec2(0.5, 0.47)), gIn = step(0, huv.x).mul(step(huv.x, 1)).mul(step(0, huv.y)).mul(step(huv.y, 1));
      const gv = texture(lineTex, tclamp(huv, vec2(0), vec2(1))).r.mul(gIn);
      const gfw = max(TSL.fwidth(gv), float(1e-4)), gd = abs(gv.sub(0.5)).mul(fw).div(gfw);    // ≈ metres from the outline
      const ghw = max(float(LINE_HW), fw.mul(0.75));
      const gline = float(1).sub(smoothstep(ghw.sub(fw.mul(0.5)), ghw.add(fw.mul(0.5)), gd)).mul(step(0.02, gv));
      const inkC = mix(uInk, uGlaze.mul(0.8), U.hot.mul(0.55).add(U.held.mul(0.25)).min(0.7));
      over(inkC, gline.mul(0.92).mul(inside));
      // 5. light: the soft key highlight on the upper bevel, a broad sheen, the env's Fresnel, the thin bright rim (inside the edge)
      //    with the dark hairline that draws the edge on a light ground; the rim nearest a hand catches its light (the flashlight)
      const lamp = room.flash ? room.flash(positionWorld) : float(0);
      const sheen = exp(length(p.sub(vec2(-0.07, 0.11)).mul(vec2(1.0, 1.7))).mul(length(p.sub(vec2(-0.07, 0.11)).mul(vec2(1.0, 1.7)))).mul(-90.0)).mul(0.07);
      c = c.add(vec3(spec.mul(edge.mul(0.8).add(0.2)).mul(0.85).add(sheen)).mul(inside)).add(refl.mul(F).mul(mix(float(0.5), float(0.12), uLite)).mul(inside));
      const rimIn = tclamp(float(1).sub(abs(r.sub(RLb.sub(0.0035))).div(fw.mul(1.1))), 0, 1);
      const rimUp = dirR.y.mul(0.35).add(0.65).mul(dirR.x.mul(-0.2).add(1));
      const rimL = rimIn.mul(rimUp.mul(0.5).add(lamp.mul(0.8)).add(U.hot.mul(0.15)));
      c = c.add(mix(vec3(1.0, 0.97, 0.92), uGlaze.mul(0.6).add(0.5), lamp.mul(0.4).min(0.4)).mul(rimL));
      const rimOut = tclamp(float(1).sub(abs(r.sub(RLb.add(0.0012))).div(fw.mul(0.9))), 0, 1);
      over(vec3(0.05, 0.04, 0.035), rimOut.mul(uLite).mul(0.35));
      // the contour lines of the quake, riding the front inside the glass (thin, in the glaze)
      const cont = tclamp(float(1).sub(abs(fract(dfr.mul(1 / 0.022)).sub(0.5)).mul(0.022).div(fw.mul(0.8))), 0, 1).mul(step(dfr, 0)).mul(exp(dfr.mul(12))).mul(step(0.0001, U.burst)).mul(float(1).sub(smoothstep(0.5, 1.0, U.burst)));
      over(uGlaze.add(0.15), cont.mul(inside).mul(0.6));
      // the thickness on a light ground: the bevel darkens on the side away from the key (an inner shade) and a crescent of light
      // rides the upper-left bevel (the liquid-glass read); both follow the tilt (nl) and the ripples
      const bevBand = smoothstep(0.15, 0.6, t).mul(float(1).sub(smoothstep(0.92, 1.0, t))).mul(inside);
      const away = tclamp(dot(dirR, vec2(0.3, -0.95)), 0, 1);
      over(vec3(0.33, 0.27, 0.22), bevBand.mul(away).mul(0.22).mul(uLite));
      // the white specular arc: 60° centred top-left (135°), soft ends, on the outer half of the bevel
      const toward = smoothstep(0.82, 0.93, dot(dirR, vec2(-0.7071, 0.7071)));                 // ≈ ±30° about the centre
      const specBand = smoothstep(RLb.sub(BEV), RLb.sub(BEV * 0.55), r).mul(float(1).sub(smoothstep(RLb.sub(0.0035), RLb.sub(0.0005), r)));
      over(vec3(1.0, 1.0, 1.0), specBand.mul(toward).mul(mix(float(0.45), float(0.8), uLite)));   // the 60° white arc (ART), opaque white on sand
      const glass = solid.mul(smoothstep(0.0, 0.25, U.asm));
      c = c.mul(glass); a = a.mul(glass);
      // 6. the instrument round the glass: a faint track, the arc of light (1–1.5 px) filling clockwise from the top with a bright
      //    head, and fine ticks every 5° (longer every 30°) that take the glaze as the arc passes them
      const instr = smoothstep(0.75, 1.0, U.asm).mul(float(1).sub(smoothstep(0.2, 0.7, U.burst)));
      const track = tclamp(float(1).sub(abs(r.sub(RA)).div(fw.mul(0.75))), 0, 1);
      const on = step(f, lvl).mul(step(0.002, lvl));
      over(uGlaze, track.mul(0.22).mul(instr));
      const ahw = max(float(ARC_HW), fw.mul(0.75));
      const arcL = float(1).sub(smoothstep(ahw.sub(fw.mul(0.5)), ahw.add(fw.mul(0.5)), abs(r.sub(RA)))).mul(on);
      over(uGlaze, arcL.mul(0.95).mul(instr));
      const headD = length(p.sub(vec2(sin(lvl.mul(TAU)), cos(lvl.mul(TAU))).mul(RA)));
      const head = exp(headD.mul(headD).mul(-60000)).mul(step(0.002, lvl)).mul(step(lvl, 0.998));
      over(uGlaze, head.mul(instr).mul(0.9));                                                   // the head: a cobalt bead, no glow
      const td = abs(fract(f.mul(36).add(0.5)).sub(0.5)).div(36).mul(TAU).mul(r);
      const major = step(abs(fract(f.mul(12).add(0.5)).sub(0.5)), 0.5 / 36 * 12 * 0.6);
      const t0 = select(major.greaterThan(0.5), float(RT0 - 0.01), float(RT0));
      const thw = max(float(TICK_HW), fw.mul(0.6)), tick = float(1).sub(smoothstep(thw.sub(fw.mul(0.5)), thw.add(fw.mul(0.5)), td)).mul(step(t0, r)).mul(step(r, float(RT1)));
      const tickOn = step(f, lvl).mul(step(0.002, lvl));
      over(uGlaze, tick.mul(mix(float(0.4), float(1.0), tickOn)).mul(instr).mul(inside.max(0.5)));
      // the flashlight on the ticks and the track too (the instrument's edge near a hand)
      c = c.add(mix(vec3(1.0, 0.95, 0.88), uGlaze, 0.3).mul(lamp.mul(0.35)).mul(track.add(tick)).mul(instr));
      const vis = fade;
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.colorNode = c.mul(vis); m.opacityNode = a.mul(vis);
      const mesh = new THREE.Mesh(lensGeo, m); mesh.renderOrder = 21; mesh.frustumCulled = false; ring.add(mesh);
    }
    // --- the grains: where the glass is not (yet / any more) solid, its grains hang near their homes (assemble: scattered, drawing in;
    //     the burst: released by the seismic front, drifting outwards and up, thinning out)
    let grains;
    {
      const G = attribute('aG', 'vec4');
      const rr = TSL.sqrt(G.x).mul(RL * 0.995), ang = G.y.mul(TAU), home = vec2(cos(ang), sin(ang)).mul(rr);
      const E = erosion(home, U);
      const dA = E.eA.sub(E.kA), dB = E.kB.sub(E.eB);
      const rnd = vec2(G.z.sub(0.5), G.w.sub(0.5)).normalize();
      const far = select(G.z.lessThan(0.65), float(0.35), select(G.z.lessThan(0.91), float(0.8), float(1.6)));   // 65 % close, 26 % drift, 9 % far
      const dirO = home.div(max(rr, float(1e-3)));
      const offA = rnd.mul(max(dA, float(0)).mul(far).mul(0.9)).add(vec2(0, max(dA, float(0)).mul(0.25)));
      const tB = max(dB, float(0));
      const offB = dirO.mul(0.6).add(rnd.mul(0.5)).mul(tB.mul(far).mul(0.9)).add(vec2(0, tB.mul(tB).mul(0.35)));
      const aA = step(0, dA).mul(float(1).sub(smoothstep(0.05, 0.45, dA))).mul(step(0.001, U.asm));
      const aB = step(0, dB).mul(float(1).sub(smoothstep(0.1, 0.75, dB))).mul(step(0.0001, U.burst));
      const sz = float(0.007).add(G.w.mul(0.005));
      const m = new THREE.MeshBasicNodeMaterial(OVER);
      m.positionNode = vec3(home.add(offA).add(offB).add(positionGeometry.xy.mul(sz)), max(dA, float(0)).mul(0.1).add(tB.mul(0.15)));
      const q = uv().sub(0.5), dot2 = float(1).sub(smoothstep(0.25, 0.5, length(q)));
      const glint = step(0.78, G.x.mul(7.31).fract());
      const col = mix(mix(uInk, mix(uGlaze, vec3(0.55, 0.62, 0.85), 0.3), step(0.004, U.arc).max(step(0.0001, aB)).mul(0.9)), mix(uLabel, vec3(1.0, 0.95, 0.85), float(1).sub(uLite)), glint);
      const al = aA.max(aB).mul(dot2).mul(mix(float(0.85), float(0.7), uLite)).mul(fade);
      m.colorNode = col.mul(al); m.opacityNode = al.mul(mix(float(0.4), float(1), uLite));
      grains = new THREE.Mesh(grainGeo, m); grains.renderOrder = 22; grains.frustumCulled = false; grains.visible = false; ring.add(grains);
    }
    object.add(group);
    targets.push({ group, ring, grains, U, held: 0, hot: 0, asm: 0, arcPrev: 0, burst: 0, turn: 0, tilt: 0, used: false, wasHot: false, tap: 9, hx: 0, hy: 0 });
  }

  // ------------------------------------------------------------------ the words
  const card = typo.slot({ placements: typo.onWalls(room, 2.68),   // high: the play's invitation stands under it from the first second
    renderOrder: 24, outDur: 0.5, plate: 0.5, flash: room.flash });
  // the instruction: one centred piece, its first line's caps at ~2.05 m, the label under it (always between 1.75 and 2.15 m)
  const line = typo.slot({ placements: typo.onWalls(room, 1.98), renderOrder: 23, outDur: 0.5, plate: 0.45, spread: 2.4, flash: room.flash });
  object.add(card.object, line.object);

  // ------------------------------------------------------------------ T-048: the fine graphics (ARTE-3 §3, «gráfica de instrumento»)
  // On every wall, 1 px lines in the chapter's accent at ~40 %: a vertical ruler at each edge of the wall (0.22 m in, ticks every 5 cm
  // pointing inwards, the hands' band 0.9–1.6 m marked by a second hairline and long ticks at 0.90 / 1.25 / 1.60), «+» marks at the
  // corners of the play zone (±0.9 m × 0.9–1.6 m), a faint dotted grid (10 cm) behind the two quiet zones, and small mono labels
  // (`II · PINYA`, `P1`, `1,25 m`) that come into focus word by word. All of it brightens near a hand (room.flash), across a corner too.
  // One plane per wall, procedural (fwidth-antialiased: 1 px at the room's resolution whatever the render scale); additive, ≤ 0.5 HDR.
  const FINE = { a: 0, label: '', out: 0, asm: 0, want: '' };
  const fineA = uniform(0);
  const fineObj = new THREE.Group(); fineObj.name = 'guide:fine'; object.add(fineObj);
  const EDGE = 0.22, ZX = 0.9, ZY0 = 0.9, ZY1 = 1.6;
  room.walls.forEach((w, wi) => {
    const Wm = w.width, Hm = Math.min(w.height, 2.9);
    const m = new THREE.MeshBasicNodeMaterial(OVER);
    const q = uv(), x = q.x.sub(0.5).mul(Wm), y = q.y.mul(Hm);                    // metres: x from the wall's centre, y from the floor
    const fx = max(TSL.fwidth(x), float(1e-4)), fy = max(TSL.fwidth(y), float(1e-4));
    const hair = (d, f) => tclamp(float(1).sub(abs(d).div(f)), 0, 1);           // a 1 px line at distance d (m) from it
    const inR = (v, a, b) => step(a, v).mul(step(v, b));
    // the two rulers: e = distance from the wall's edge (m), inwards
    const e = min(x.add(Wm / 2), float(Wm / 2).sub(x));
    const spine = hair(e.sub(EDGE), fx).mul(inR(y, 0.5, 2.3)).mul(mix(float(0.55), float(1), inR(y, ZY0, ZY1)));
    const band = hair(e.sub(EDGE + 0.014), fx).mul(inR(y, ZY0, ZY1)).mul(0.8);
    const t5 = abs(fract(y.div(0.05).add(0.5)).sub(0.5)).mul(0.05), t10 = abs(fract(y.div(0.1).add(0.5)).sub(0.5)).mul(0.1);
    const key = min(min(abs(y.sub(ZY0)), abs(y.sub(1.25))), abs(y.sub(ZY1)));
    const tl = select(key.lessThan(0.004), float(0.12), select(t10.lessThan(0.004), float(0.055), float(0.028)));   // tick length (m)
    const tickY = select(key.lessThan(0.004), key, select(t10.lessThan(0.004), t10, t5));
    const ticks = hair(tickY, fy).mul(step(EDGE, e)).mul(step(e, tl.add(EDGE))).mul(inR(y, 0.5, 2.3)).mul(select(key.lessThan(0.004), float(1), float(0.7)));
    // «+» at the play zone's corners
    const cx = abs(abs(x).sub(ZX)), cy = min(abs(y.sub(ZY0)), abs(y.sub(ZY1)));
    const plus = hair(cx, fx).mul(step(cy, 0.045)).max(hair(cy, fy).mul(step(cx, 0.045)));
    // the dotted grid behind the quiet zones (text ±1.6 × 1.75–2.2, button ±0.9 × 0.9–1.6), softly faded at their edges
    const gx = fract(x.div(0.1).add(0.5)).sub(0.5).mul(0.1), gy = fract(y.div(0.1).add(0.5)).sub(0.5).mul(0.1);
    const dot = tclamp(float(1.3).sub(length(vec2(gx.div(fx), gy.div(fy)))), 0, 1);
    const zT = smoothstep(1.6, 1.3, abs(x)).mul(smoothstep(1.7, 1.8, y)).mul(smoothstep(2.25, 2.15, y));
    const zB = smoothstep(0.9, 0.6, abs(x)).mul(smoothstep(0.85, 0.95, y)).mul(smoothstep(1.65, 1.55, y)).mul(smoothstep(0.3, 0.45, length(vec2(x, y.sub(1.25)))));   // not inside the ring
    const grid = dot.mul(zT.max(zB)).mul(0.45);
    const lamp = room.flash ? room.flash(positionWorld) : float(0);
    const k = spine.add(band).add(ticks).add(plus.mul(0.9)).min(1).mul(0.16).add(grid.mul(0.07));
    m.colorNode = ACC.mul(k).mul(lamp.mul(2.2).add(1)).mul(fineA);
    m.opacityNode = float(0);                                                     // pure light (premultiplied «over»: adds)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Wm, Hm), m);
    mesh.position.copy(w.centre).setY(Hm / 2).addScaledVector(w.normal, -0.05); mesh.quaternion.copy(basis[wi]);
    mesh.renderOrder = 18; mesh.frustumCulled = false; fineObj.add(mesh);
  });
  // the labels: per wall (each its own width), Geist Mono caps, focus in word by word
  const fineText = typo.text({ placements: room.walls.map((w, wi) => ({ position: w.centre.clone().addScaledVector(w.normal, -0.05), quaternion: basis[wi] })), renderOrder: 18, plate: 0, halo: 0, flash: room.flash });
  object.add(fineText.object);
  const LABELS = { wait: 'UMBRAL', intro: 'LA PLAÇA', brasa: 'I · BRASA', pinya: 'II · PINYA', tronc: 'III · TRONC', pom: 'IV · POM DE DALT', crown: 'V · CORONA', festa: 'V · LA PLAÇA', baixada: 'VI · BAIXADA', fall: 'CAIGUDA', acta: 'ACTA' };
  const wallName = (w, wi) => (typeof w.id === 'string' && /^P\d/i.test(w.id) ? w.id.toUpperCase() : 'P' + (wi + 1));
  function fineItems(wi, label, acc) {
    const w = room.walls[wi], xl = -w.width / 2 + EDGE + 0.17, xr = w.width / 2 - EDGE - 0.17;
    const c = [0.3 * (0.6 + 0.4 * acc[0]), 0.3 * (0.6 + 0.4 * acc[1]), 0.3 * (0.6 + 0.4 * acc[2])];   // ink tinted by the accent, ~40 %
    const L = (text, x, y, align, alpha = 1, delay = 0, upper = true) => ({ text, font: 'mono', size: 0.08, y, x, align, track: 0.08, alpha, color: c, edge: 0.48, upper, reveal: 'blur', delay });
    return [L(label, xl, 2.42, 'left'), L(wallName(w, wi), xr, 2.42, 'right', 0.85, 0.12), L('1,25 m', xl, 1.25, 'left', 0.9, 0.24, false),
      L('0,90', xl, ZY0, 'left', 0.55, 0.3), L('1,60', xl, ZY1, 'left', 0.55, 0.3)];
  }
  function stepFine(dt, b, on) {
    const want = on && b !== 'intro' && b !== 'wait' ? (LABELS[b] || '') : '';   // art round 5: none in the wait, half in the pom
    FINE.a = ease(FINE.a, want ? (b === 'pom' ? 0.5 : 1) : 0, dt, 1.5); fineA.value = FINE.a; fineObj.visible = FINE.a > 0.003;
    if (want !== FINE.label) {                                                    // the old labels go out of focus, then the new come in
      FINE.out = Math.min(1, FINE.out + dt / 0.5);
      if (!FINE.label || FINE.out >= 1) {
        FINE.label = want; FINE.out = 0; FINE.asm = 0;
        if (want) { const acc = accentOf(b); for (let i = 0; i < NW; i++) fineText.setFor(i, fineItems(i, want, acc)); }
      }
    } else if (want) FINE.asm = Math.min(1, FINE.asm + dt / Math.max(0.5, fineText.dur));
    fineText.U.asm.value = FINE.asm; fineText.U.out.value = FINE.out;
    for (let i = 0; i < NW; i++) fineText.alpha[i] = FINE.label ? FINE.a : 0;
    fineText.apply(1);
  }

  // ------------------------------------------------------------------ per frame
  let guideA = 0, guideKey = '', nT = 0, softNow = 0, stillNow = 0, time0 = 0, revealNow = 1, liteNow = 0;
  const near = (hands, wi, off) => { for (const h of hands) if (h.wall === wi && Math.abs((h.u - 0.5) * room.walls[wi].width - off) < 0.55 && Math.abs(h.pos.y - HAND_Y) < 0.75) return true; return false; };
  let handsNow = [];
  function put(wi, off, vis, held, hot, beat, arc, dt) {   // (beat: kept in the signature; no block sends a pulse any more, #13)
    if (nT >= MAXT) return;
    const T = targets[nT++], w = room.walls[wi], U = T.U;
    T.held = ease(T.held, held ? 1 : 0, dt, held ? 14 : 3);
    T.hot = ease(T.hot, hot || held ? 1 : 0, dt, hot ? 16 : 2.5);
    vis *= 1 - learnedK;
    const bursting = T.burst > 0 && T.burst < 1;                 // while it bursts, the glass is the burst's (the block may already be leaving)
    if (!bursting) T.asm = ease(T.asm, vis * guideA * revealNow, dt, 2.2);
    if (vis * guideA * revealNow > T.asm && T.asm > 0.97) T.asm = vis * guideA * revealNow;
    // the burst: the progress has just completed (the seismic ripple, then the glass goes to grains)
    if (arc >= 0.999 && T.arcPrev < 0.999 && T.burst === 0) T.burst = 0.001;
    if (T.burst > 0 && T.burst < 1) T.burst = Math.min(1, T.burst + dt / 1.6);
    if (arc < 0.95) T.burst = 0;
    T.arcPrev = arc;
    T.group.position.copy(w.centre).addScaledVector(w.right, off).setY(HAND_Y).addScaledVector(w.normal, -0.04);
    T.group.quaternion.copy(basis[wi]);
    // the nearest hand, in the lens's own metres: the touch ring starts where it lands (< 100 ms), the lens leans towards it
    let best = 0.62, hx = 0, hy = 0;
    for (const h of handsNow) { if (h.wall !== wi) continue; const x = (h.u - 0.5) * w.width - off, y = h.pos.y - HAND_Y, d = Math.hypot(x, y); if (d < best) { best = d; hx = x; hy = y; } }
    const isHot = best < 0.62;
    if (isHot && !T.wasHot) { T.tap = 0; T.hx = clamp(hx, -RL, RL); T.hy = clamp(hy, -RL, RL); }
    T.wasHot = isHot; T.tap = Math.min(9, T.tap + dt);
    // 3d-feature-objects: it turns TOWARDS the hand (±0.25 rad), smoothed at 10/s, and drifts a hair at rest (the Pom: still)
    const turnTo = stillNow ? 0 : T.hot * clamp(hx / 0.35, -1, 1) * 0.25 + 0.03 * Math.sin(time0 * 0.37 + nT * 1.3);
    const tiltTo = stillNow ? 0 : -T.hot * clamp(hy / 0.35, -1, 1) * 0.2 + 0.025 * Math.cos(time0 * 0.29 + nT);
    T.turn = ease(T.turn, turnTo, dt, 10); T.tilt = ease(T.tilt, tiltTo, dt, 10);
    T.ring.rotation.set(T.tilt, T.turn, 0);
    U.asm.value = T.asm; U.held.value = T.held; U.hot.value = T.hot; U.arc.value = arc; U.burst.value = T.burst;
    U.soft.value = softNow; U.still.value = stillNow; U.tap.value = T.tap; U.hp.value.set(T.hx, T.hy);
    T.group.visible = T.asm > 0.004 || (T.burst > 0 && T.burst < 1);
    T.grains.visible = (T.asm > 0.002 && T.asm < 0.999) || (T.burst > 0 && T.burst < 1);
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
  const lineOut = typo.slot({ placements: typo.onWalls(room, 1.98), renderOrder: 23, outDur: 0.5, plate: 0.45, flash: room.flash });
  object.add(lineOut.object);
  const nearX = (hands, wi) => { for (const h of hands) if (h.wall === wi && Math.abs((h.u - 0.5) * room.walls[wi].width) <= 0.55) return true; return false; };   // the score's test for the start ring
  let structureOnly = false; const inS = [];
  // the new chapter's words enter on a wall once the host's tile wave has passed it (+0.3 s, in typo3d's slot). room.tileFront(wall)
  // is INT/RND-F's (T-028); until it exists (or when it does not answer a number) every wall is open at once.
  // ASSUMED contract (to confirm against PARTS.md when it lands): tileFront(w) >= 1 once the front has passed wall w.
  const waveGate = (w) => { if (typeof room.tileFront !== 'function') return true; const f = room.tileFront(w); return !(typeof f === 'number') || f >= 1; };
  const lumOf = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : 0);
  const waitIsLight = () => { const P = room.PALETTE && room.PALETTE.wait; return !!P && (lumOf(P.top) + lumOf(P.bottom)) / 2 > 0.2; };
  function update(dt, { state: S, hands = [], time = 0, on = true, acta = null, hold = false, pace = 1, events = null }) {
    // warnings (#19): the score's state.warn ('fall' | 'abandon') or its events 'warn:fall' / 'warn:abandon' (if the host passes events)
    if (events) for (const e of events) if (e === 'warn:fall' || e === 'warn:abandon') { warnKind = e.slice(5); warnUntil = time + 4; }
    const warn = S.warn || (time < warnUntil ? warnKind : '');
    const dtT = dt * Math.max(1, pace);   // the words' motion follows the score's clock: at a fast rehearsal pace a card still lands
    time0 = time; uTime.value = time; typo.setTime(time);
    const b = S.block, playing = S.phase !== 'title';
    const key = b + '|' + (b === 'tronc' ? +S.balance : 0) + '|' + S.buttons;
    const wantT = on && (b === 'wait' || b === 'pinya' || b === 'tronc' || b === 'pom') && !(b === 'tronc' && S.phase === 'reward') && S.phase !== 'aleta';   // l'aleta: no ring, only the ghost hands rising
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
    stepFine(dtT, b, on);
    nT = 0;
    for (const T of targets) T.used = false;
    softNow = gb === 'pinya' || gb === 'tronc' || gb === 'baixada' ? 1 : 0;
    // T-059: the lens's look follows the ground. The wait is light when its palette is (ENT, T-058: pastel sand); read every frame
    handsNow = hands;
    const liteTo = gb === 'wait' && waitIsLight() ? 1 : 0;
    liteNow = ease(liteNow, liteTo, dt, 2); uLite.value = liteNow; 
    { const ink = [0.0273 + (0.62 - 0.0273) * (1 - liteNow), 0.0232 + (0.6 - 0.0232) * (1 - liteNow), 0.0185 + (0.56 - 0.0185) * (1 - liteNow)];
      uInk.value.set(ink[0], ink[1], ink[2]);
      const gz = gb === 'wait' ? [0.0137, 0.0497, 0.392] : palNow[0];                  // cobalt #1F3FA8 in the wait; the chapter's glaze after
      uGlaze.value.set(gz[0], gz[1], gz[2]); }
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
    stepGhosts(dt);
    // the targets not placed this frame break where they were
    for (let i = nT; i < MAXT; i++) {
      const T = targets[i]; T.held = 0;
      if (T.burst > 0 && T.burst < 1) { T.burst = Math.min(1, T.burst + dt / 1.6); T.U.burst.value = T.burst; } else T.asm = ease(T.asm, 0, dt, 4);
      T.U.asm.value = T.asm;
      T.group.visible = T.asm > 0.004 || (T.burst > 0 && T.burst < 1); T.grains.visible = T.group.visible;
    }

    // the words; from the Tronc on, the instructions belong to the walls that carry the castell
    const g = on ? lines(S, acta, learnedNow, warn) : {};
    structureOnly = (b === 'tronc' || b === 'pom' || b === 'baixada') && S.structure > 0 && S.structure < NW;
    for (let w = 0; w < NW; w++) inS[w] = !!walls[w];
    card.want(g.card ? 'c|' + g.card.join('|') : '', g.card ? cardItems(g.card) : null);
    const L = g.line && (g.line[0] || g.line[1]) ? g.line : null;   // (an empty invitation with a label: the floor's / climber's name alone)
    const darkInk = b === 'wait' && waitIsLight();
    line.want(L ? 'l|' + L.join('|') + (darkInk ? '|d' : '') : '', L ? lineItems(L, darkInk) : null);
    // readability (audit 24-11): the dark plates under the words are stronger where the world behind is busy (Tronc, Pom: 60 %)
    const plateK = b === 'baixada' ? 0.75 : b === 'tronc' || b === 'pom' ? 0.6 : null;   // art round 5b: 75 % in the baixada only   // art round 5: baixada too (white porcelain behind)
    for (const t of card.texts) t.U.plate.value = plateK ?? 0.5;
    for (const t of line.texts) { t.U.plate.value = darkInk ? 0.2 : plateK ?? 0.45; t.U.halo.value = darkInk ? 0 : 0.4; t.U.plateCol.value.set(darkInk ? 0.86 : 0, darkInk ? 0.8 : 0, darkInk ? 0.7 : 0); }   // T-059: a pale veil, not a dark plate, on sand
    card.step(dtT, { hold, gate: waveGate });
    // the wait's words come with the button (reveal) and thin out as the hands start the pass
    const st = b === 'wait' ? Math.min(1, S.start || 0) : 0;
    let gain = b === 'wait' ? 1 - st * st : 1;   // the invitation to play before the reveal, the ring's line after it
    // and the instruction dims once the group is already doing it
    let doing = 0;
    if (b === 'pinya' && S.phase === 'play') { let h = 0; for (let w = 0; w < NW; w++) if (S.count[w] > 0) h++; doing = clamp(h / Math.max(1, S.needWalls), 0, 1); }
    else if (b === 'tronc' && S.phase === 'play') { let need = 0, ok = 0; for (let w = 0; w < NW; w++) if (walls[w]) { need++; if (S.balance ? S.left[w] && S.right[w] : S.count[w] > 0) ok++; } doing = need ? ok / need : 0; }
    else if (b === 'pom') doing = S.lightWall >= 0 && S.count[S.lightWall] > 0 && !S.restless ? 1 : 0;
    else if (b === 'baixada') { let need = 0, ok = 0; for (let w = 0; w < NW; w++) if (walls[w]) { need++; if (S.count[w] > 0) ok++; } doing = need ? ok / need : 0; }
    gain *= 1 - 0.55 * doing;
    const cardUp = card.up;
    const mask = (w) => !!warn || !structureOnly || inS[w];   // a warning goes on every wall
    // the wait: the instruction is the lintel inscription of ENT-F's doorway (keystone ~1.95 m): one line centred at 2.12 m. It moves
    // only while no words are up (never slides in view)
    if (!line.up) line.object.position.y = b === 'wait' ? 2.12 - 1.98 : (b === 'tronc' && S.phase !== 'title') || b === 'baixada' ? 2.30 - 1.98 : 0;   // art round 5 (not under Tronc's card: there the 60 % plate): above the porcelain in tronc / baixada
    if (!lineOut.up) lineOut.object.position.y = (b === 'tronc' && S.phase !== 'title') || b === 'baixada' ? 2.30 - 1.98 : 0;
    line.step(dtT, { gain: warn ? 1 : gain, hold, mask, gate: waveGate });
    if (darkInk) for (const t of line.texts) t.U.sweepK.value = 0;   // T-059: no thin-film sweep over ink (it read as a coloured word on sand)
    if (warn) for (const t of line.texts) { t.U.sweepK.value = 1; t.U.sweep.value = ((time0 * 0.9) % 1.6) - 0.3; }   // the warning pulses
    // the walls outside the structure: «Ayudad desde aquí» (they count at 50 %), while the structure's walls carry the invitation
    const outOn = on && structureOnly && !warn && S.phase !== 'reward' && !learnedNow && (b === 'tronc' || b === 'pom' || b === 'baixada');
    lineOut.want(outOn ? 'o|ayudad' : '', outOn ? lineItems(['Ayudad desde aquí', '']) : null);
    for (const t of lineOut.texts) t.U.plate.value = plateK ?? 0.45;
    lineOut.step(dtT, { gain, hold, mask: (w) => !inS[w], gate: waveGate });
  }
  function dispose() {
    lensGeo.dispose(); shadowGeo.dispose(); grainGeo.dispose(); lineTex.dispose(); handTex.dispose(); gq.dispose(); for (const G of ghosts) for (const H of G.h) H.mesh.material.dispose();
    for (const T of targets) T.group.traverse((o) => { if (o.material) o.material.dispose(); });
    for (const s of [card, line, lineOut]) s.dispose(); fineText.dispose(); fineObj.traverse((o) => { if (o.material) { o.material.dispose(); o.geometry.dispose(); } });
  }
  return { object, update, dispose, ghost, targets, layers: { card, line, fine: fineText }, get learned() { return learnedNow; } };
}
