// Ressonància — part "actatext" (contract: ../PARTS.md): the closing, l'acta, the work's typographic finale ON the walls, in 3D type
// (../typo3d.js, T-027: every line ASSEMBLES from glyph-tiles and BREAKS into tiles). In Spanish; casteller words in Catalan.
// Black and type, with one line of colour per chapter (art bible, notas/ARTE.md §2). The dust and the dim horizon are atmos'.
// Timeline on input.state.t (or input.t; 40 s):
//   0.2–14   «3 de 7» in serif, «descarregat» in italic rising on its hairlines, the six chapters' colours as a ribbon drawn from
//            the centre out, and a small gloss in Spanish (to ~11.6)
//   12–24.6  the four values, one per wall (Força / Equilibri / Valor / Seny, the Spanish under it): the bar's slots draw themselves,
//            then its ceramic tiles (the colour of the chapter that taught the value) come in and snap home one by one while the
//            number counts up; walls 2 s apart
//   17–24.6  above them, small: «14 MANOS · 22 S DE QUIETUD»
//   25–32.6  the voice's last line: «Este ha sido vuestro castell.» / «Cuando los cuerpos resuenan juntos, / nace la cultura.»
//   33.5–40  the credits
// input.acta (score.acta()) gives the content; texts are laid out only when it changes (the numbers, when their integer changes).
// input.arrive only gates; input.leave breaks everything. Study: params.castell / outcome / values stand in.
import { typo } from '../typo3d.js';

const VALUES = [['forca', 'Força', 'Fuerza'], ['equilibri', 'Equilibri', 'Equilibrio'], ['valor', 'Valor', 'Valor'], ['seny', 'Seny', 'Sensatez']];
const OUTCOME = { descarregat: ['descarregat', 'levantado, coronado y bajado sin caer'], carregat: ['carregat', 'coronado, y después cayó'], intent: ['intent', 'cayó antes de la corona'] };
const SENTENCE = ['Este ha sido vuestro castell.', 'Cuando los cuerpos resuenan juntos,', 'nace la cultura.'];   // the voice: v-cierre-final
const CREDITS = ['Ressonància', 'Barcelona XR Lab × Alma Digital Studio', 'Con el apoyo de la Generalitat de Catalunya'];
const INK = [0.76, 0.73, 0.68], SOFT = [0.76, 0.73, 0.68];   // bone #F2EEE6 at 92 % (secondary lines at 60 %), under the bloom: no neon
// one colour line per chapter (art bible §2, Acta row): Brasa · Pinya · Tronc · Pom · Corona · Bajada (linear)
const CHAPTER = [[1.0, 0.14, 0.014], [0.027, 0.65, 0.56], [0.55, 0.12, 0.04], [0.85, 0.89, 1.0], [0.92, 0.56, 0.1], [0.93, 0.47, 0.56]];
// each value's bar takes the colour of the chapter that taught it: Força = Pinya, Equilibri = Tronc, Valor = Pom, Seny = the descent
const VALUE_COL = [CHAPTER[1], CHAPTER[2], CHAPTER[3], CHAPTER[5]];
const Y = { castell: 2.3, ribbon: 1.8, gloss: 1.66, stat: 2.32, label: 1.9, bar: 1.62, sentence: 2.08, credits: 2.1 };
const BAR_W = 2.2, NB = 22, TILE_H = 0.05;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const env = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t > c ? 1 - smooth((t - c) / (d - c)) : 1);

export function create({ THREE, TSL, room, params = {} }) {
  const { uniform, uv, vec2, vec3, float, smoothstep, step, max, min, exp, sin, cos, attribute, positionGeometry, select, mix, clamp } = TSL;
  const object = new THREE.Group(); object.name = 'actatext';
  const NW = room.walls.length;
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const over = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false };
  const place = (mesh, wi, y) => { const w = room.walls[wi]; mesh.position.copy(w.centre).setY(y).addScaledVector(w.normal, -0.02); mesh.quaternion.copy(basis[wi]); mesh.renderOrder = 12; mesh.visible = false; mesh.frustumCulled = false; object.add(mesh); };

  // ---- the words: one text per line of the acta (on every wall), and one per wall for the values and their numbers
  const T = (y, opt = {}) => { const t = typo.text({ placements: typo.onWalls(room, y), renderOrder: 12, ...opt }); object.add(t.object); return { t, prev: 0 }; };
  const castellT = T(Y.castell, { plate: 0.5 }), glossT = T(Y.gloss, { plate: 0.35 }), statT = T(Y.stat, { plate: 0.3 }), sentT = T(Y.sentence, { plate: 0.55, depth: 0.45 }), credT = T(Y.credits, { plate: 0.35 });
  const valT = room.walls.map((w, i) => { const t = typo.text({ placements: [typo.onWalls(room, Y.label)[i]], renderOrder: 12, plate: 0.3 }); object.add(t.object); return { t, prev: 0 }; });
  const numT = room.walls.map((w, i) => { const t = typo.text({ placements: [typo.onWalls(room, Y.bar, BAR_W / 2 + 0.07)[i]], renderOrder: 12, plate: 0, max: 8 }); object.add(t.object); return { t, prev: 0, shown: -1 }; });
  sentT.t.set([{ text: SENTENCE[0], font: 'italic', size: 0.17, y: 0.44, track: 0.015, alpha: 0.75, color: INK, rise: true },
    { text: SENTENCE[1], font: 'serif', size: 0.3, y: 0.08, track: 0.01, color: INK, delay: 0.6 }, { text: SENTENCE[2], font: 'italic', size: 0.3, y: -0.3, track: 0.01, color: INK, rise: true, delay: 0.9 }]);
  credT.t.set([{ text: CREDITS[0], font: 'serif', size: 0.2, y: 0.22, track: 0.04, color: INK }, { text: CREDITS[1], font: 'sans', size: 0.09, y: -0.04, track: 0.1, alpha: 0.75, color: SOFT }, { text: CREDITS[2], font: 'sans', size: 0.082, y: -0.22, track: 0.16, alpha: 0.6, color: SOFT, upper: true, edge: 0.47 }]);
  room.walls.forEach((_, i) => { const [, ca, es] = VALUES[i % 4]; valT[i].t.set([{ text: ca, font: 'serif', size: 0.24, y: 0.1, track: 0.02, color: INK }, { text: es, font: 'sans', size: 0.082, y: -0.17, track: 0.16, alpha: 0.6, color: SOFT, upper: true, edge: 0.47, delay: 0.2 }]); });
  const mats = [], geos = [];

  // ---- the chapters' ribbon under the castell: six short hairlines of colour, drawn one after another (the order of the night)
  const RIB_W = 1.5, ribGeo = new THREE.PlaneGeometry(RIB_W + 0.1, 0.05); geos.push(ribGeo);
  const ribbons = room.walls.map((w, i) => {
    const U = { grow: uniform(0), a: uniform(0) };
    const x = uv().x.sub(0.5).mul(RIB_W + 0.1), y = uv().y.sub(0.5).mul(0.05), u = x.div(RIB_W).add(0.5);
    const seg = u.mul(6).floor().clamp(0, 5), f = u.mul(6).fract();
    let col = vec3(...CHAPTER[0]);
    for (let k = 1; k < 6; k++) col = select(seg.greaterThan(k - 0.5), vec3(...CHAPTER[k]), col);
    const inside = step(0, u).mul(step(u, 1)).mul(smoothstep(0.0, 0.04, f)).mul(smoothstep(1.0, 0.96, f));
    const line = smoothstep(0.0042, 0.0022, y.abs()).mul(inside).mul(step(f, U.grow.mul(6).sub(seg)));   // segment by segment, each drawn left to right
    const m = new THREE.MeshBasicNodeMaterial(over);
    m.colorNode = col.mul(line).mul(1.1).mul(U.a); m.opacityNode = line.mul(U.a);
    const mesh = new THREE.Mesh(ribGeo, m); place(mesh, i, Y.ribbon); mats.push(m);
    return { mesh, U };
  });

  // ---- the bars: NB ceramic tiles per value. The slots draw themselves left to right (ghosts); as the value fills, each tile comes in
  // from above, waits just off its slot and SNAPS home with a flash; the number at the end counts up with them
  const tileGeo = new THREE.InstancedBufferGeometry();
  tileGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  tileGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  { const a = new Float32Array(NB * 4); for (let i = 0; i < NB; i++) { const h = (k) => ((Math.sin((i + 1) * (12.9898 + k * 7.3) + k) * 43758.5453) % 1 + 1) % 1; a[i * 4] = i; a[i * 4 + 1] = h(1); a[i * 4 + 2] = h(2); a[i * 4 + 3] = h(3); } tileGeo.setAttribute('aI', new THREE.InstancedBufferAttribute(a, 4)); }
  tileGeo.instanceCount = NB; geos.push(tileGeo);
  const bars = room.walls.map((w, i) => {
    const U = { track: uniform(0), fill: uniform(0), a: uniform(0) };
    const I = attribute('aI', 'vec4'), idx = I.x, r1 = I.y, r2 = I.z, r3 = I.w, pg = positionGeometry;
    const lock = clamp(U.fill.mul(NB).sub(idx), 0, 1), snapped = step(0.999, lock);
    const e = mix(float(1).sub(exp(lock.mul(-5.0))).mul(0.85), float(1), snapped), ie = float(1).sub(e);
    const since = U.fill.mul(NB).sub(idx).sub(1.0), pop = exp(max(since, 0).mul(-6.0)).mul(snapped);
    const slotX = idx.add(0.5).div(NB).sub(0.5).mul(BAR_W), tw = float(BAR_W / NB * 0.86).mul(r1.mul(0.1).add(0.95)), th = float(TILE_H).mul(r2.mul(0.2).add(0.9));
    const jit = vec2(sin(r3.mul(40.0).add(pg.x.mul(7.0)).add(pg.y.mul(13.0))), cos(r2.mul(31.0).add(pg.x.mul(11.0)))).mul(0.06);
    const loc0 = pg.xy.add(jit).mul(vec2(tw, th)).mul(pop.mul(0.2).add(1.0));
    const ang = ie.mul(step(0.001, lock)).mul(r2.sub(0.5).mul(2.4));
    const loc = vec2(loc0.x.mul(cos(ang)).sub(loc0.y.mul(sin(ang))), loc0.x.mul(sin(ang)).add(loc0.y.mul(cos(ang))));
    const ghost = step(slotX.add(BAR_W / 2), U.track.mul(BAR_W)).mul(float(1).sub(step(0.001, lock)));
    const m = new THREE.MeshBasicNodeMaterial(over);
    const flying = ie.mul(step(0.001, lock));   // a ghost slot stays home; a tile on its way hovers just above it
    m.positionNode = vec3(vec2(slotX, flying.mul(r1.mul(0.03).add(0.05))).add(vec2(flying.mul(r3.sub(0.5)).mul(0.06), 0)).add(loc), flying.mul(0.15));
    const q = uv(), edge = min(min(q.x, float(1).sub(q.x)), min(q.y, float(1).sub(q.y)));
    const glaze = smoothstep(0.0, 0.14, edge).mul(0.45).add(0.55).add(smoothstep(0.6, 1.0, q.y).mul(0.25));
    const rim = float(1).sub(smoothstep(0.0, 0.08, edge));
    const base = vec3(...VALUE_COL[i % 4]).mul(r2.mul(0.35).add(0.75));
    const tileVis = step(0.001, lock).mul(snapped.mul(0.4).add(0.6));
    const col = base.mul(glaze).mul(tileVis).add(vec3(1.0, 0.92, 0.8).mul(pop.mul(1.4)).mul(tileVis)).add(vec3(...INK).mul(rim).mul(ghost).mul(0.35));
    m.colorNode = col.mul(U.a); m.opacityNode = max(tileVis.mul(0.95), rim.mul(ghost).mul(0.35)).mul(U.a);
    const mesh = new THREE.Mesh(tileGeo, m); place(mesh, i, Y.bar); mats.push(m);
    return { mesh, U };
  });

  let contentKey = '';
  const values = new Float32Array(NW);
  function content(acta) {
    const castell = acta?.castell || params.castell || '3 de 7', outcome = acta?.outcome || params.outcome || 'descarregat';
    const hands = acta?.hands ?? 0, still = acta?.stillS ?? 0;
    const key = castell + '|' + outcome + '|' + hands + '|' + still;
    for (let i = 0; i < NW; i++) values[i] = clamp01(acta?.values?.[VALUES[i % 4][0]] ?? params.values?.[i % 4] ?? 0.6);
    if (key === contentKey) return;
    contentKey = key;
    const O = OUTCOME[outcome] || OUTCOME.descarregat;
    // «3 de 7 · descarregat» as the colles write it: the castell in serif, the outcome in italic rising on its hairlines
    castellT.t.set([{ text: castell, font: 'serif', size: 0.66, y: 0.16, track: 0.01, color: INK }, { text: O[0], font: 'italic', size: 0.2, y: -0.38, track: 0.02, alpha: 0.9, color: INK, rules: 0.45, rise: true, delay: 0.5 }]);
    glossT.t.set([{ text: O[1], font: 'sans', size: 0.082, y: 0, track: 0.16, alpha: 0.6, color: SOFT, upper: true, edge: 0.47 }]);
    statT.t.set([{ text: `${hands} ${hands === 1 ? 'mano' : 'manos'} · ${still} s de quietud`, font: 'sans', size: 0.082, y: 0, track: 0.16, alpha: 0.6, color: SOFT, upper: true, edge: 0.47 }]);
  }
  // v: the line's envelope (0..1). It assembles while v rises and breaks while it falls; k (the host's gate) multiplies the light.
  function set(o, v, k, dt = 1 / 60) {
    const U = o.t.U;
    if (v > o.prev + 1e-4) { U.asm.value = v; U.out.value = 0; } else if (v < o.prev - 1e-4) { U.asm.value = 1; U.out.value = 1 - v; }
    if (v <= 0.001) { U.asm.value = 0; U.out.value = 0; }
    o.prev = v;
    const since = U.out.value === 0 && U.asm.value >= 1 ? (o.since = (o.since || 0) + dt) : (o.since = 0);
    U.sweep.value = -0.25 + since * 0.8; U.sweepK.value = since > 0 && since < 2.5 ? 1 : 0;
    o.t.alpha.fill(k); o.t.apply(1);
  }

  function update(dt, input) {
    const S = input.state, t = S && S.block === 'acta' ? S.t : (input.t ?? params.t ?? 0);
    typo.setTime(input.time ?? t);
    content(input.acta);
    const lv = input.leave ?? 0, k = smooth(Math.min(1, (input.arrive ?? 1) * 3)) * (lv > 0 ? 1 - smooth((lv - 0.4) / 0.6) : 1);
    const brk = 1 - clamp01(lv * 1.6);                           // leaving: the type breaks into tiles first
    set(castellT, env(t, 0.2, 2.6, 13.5, 14.2) * brk, k, dt);
    set(glossT, env(t, 2.4, 4.2, 11, 11.6) * brk, k, dt);
    set(statT, env(t, 17, 19, 24, 24.6) * brk, k, dt);
    set(sentT, env(t, 25, 28, 31.8, 32.6) * brk, k, dt);
    set(credT, env(t, 33.5, 35, 38.8, 39.6) * brk, k, dt);
    for (let i = 0; i < NW; i++) {
      const rb = ribbons[i]; rb.U.grow.value = clamp01((t - 1.6) / 1.8) * (1 - smooth((t - 13.2) / 0.6)) * brk; rb.U.a.value = k; rb.mesh.visible = rb.U.grow.value > 0.001 && k > 0.002;
      const s0 = 12 + 2 * i;
      set(valT[i], env(t, s0, s0 + 1.5, 24, 24.6) * brk, k, dt);
      const b = bars[i], f = clamp01((t - (s0 + 1.8)) / 2.8), fe = 1 - Math.pow(1 - f, 2);
      b.U.track.value = smooth((t - (s0 + 0.5)) / 1.2); b.U.fill.value = fe * values[i];
      b.U.a.value = k * env(t, s0 + 0.4, s0 + 0.8, 24, 24.6) * brk; b.mesh.visible = b.U.a.value > 0.002;
      // the number counts up with the tiles (re-laid out only when its integer changes)
      const N = numT[i], pct = Math.round(fe * values[i] * 100);
      if (pct !== N.shown) { N.shown = pct; N.t.set([{ text: String(pct), font: 'serif', size: 0.11, y: 0.005, track: 0.01, color: INK, align: 'left' }]); }   // caps centred on the bar
      set(N, (t > s0 + 1.8 ? 1 : 0) * env(t, s0, s0 + 0.01, 24, 24.6) * brk, k, dt);
    }
  }
  function dispose() { for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); for (const o of [castellT, glossT, statT, sentT, credT, ...valT, ...numT]) o.t.dispose(); }
  return { object, update, dispose };
}
