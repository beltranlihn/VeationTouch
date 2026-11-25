// Ressonància — part "actatext" (contract: ../PARTS.md): the closing, l'acta, ON the walls, in 3D type (../typo3d.js). In Spanish;
// casteller words in Catalan. T-051 (POV, propuesta §4.10 «la huella», ARTE-3): the acta is SIGNED with the hands.
//   · «3 de 7» in serif, «descarregat» in italic rising on its hairlines, the chapters' ribbon, the gloss (the castell stays to ~24.6 s)
//   · from 3 s «Dejad vuestra mano» (blur → sharp) under it; it goes when the first print lands
//   · THE HANDPRINT: a hand resting ~3 s on the wall leaves a GOLD PRINT there (formed from the palm out), which then glides to a RING
//     round the castell — the pinya seen from the bell tower: fingers to the centre, the ring re-spaced evenly as it fills. The prints
//     STAY to the end. A faint dotted ring shows where they will go. state.prints[] (POS, T-050) when the score gives it; else the hands.
//   · the four values as four small INSTRUMENTS (3d-feature-objects): a metal bezel lit by the room's one light recipe, a dark face with
//     1 px ticks, the value's arc lit in the colour of the chapter that taught it, a needle that settles; no numbers. They turn a little
//     towards a near hand. Two each side of the ring, on every wall.
//   · «N manos · S s de quietud» (mono) where the gloss was; the voice's last line, smaller, inside the ring; the credits.
// Timeline on input.state.t (or input.t; 40 s). input.acta (score.acta()) gives the content. input.arrive gates; input.leave breaks all.
// Study: params.castell / outcome / values / prints (stand-in prints) stand in.
// STUDIO 25-11 (05-plan N8, §3.6): «Tres de siete» in words, capitals 0.46 m, centred at 2.05 m (was 2.46); the outcome's gloss and a
// LINE OF STORY above it («Levantado por N manos» · «La colla ayudó en M pisos»), capitals 0.12 m; «Dejad vuestra mano» capitals
// 0.18 m at 1.45 m (was 0.08 at 1.18), from 3 to 22 s (it dims to half once the first print lands); no backing plates; no mono.
// The ink is the acta's (palette.js: dark ink when the acta is the lit lime wall, bone while it is dark).
import { typo } from '../typo3d.js';
import { chapter } from '../palette.js';
// STUDIO 25-11, Art Director #13: no dials — the four values are a typographic record (one line of serif small caps under the
// outcome: «FORÇA 35 · EQUILIBRI 12 · VALOR 8 · SENY 28», 60 % ink, a value of 0 not shown); the story lines at capitals 0.18 m;
// the prints are GOLD HANDPRINTS at real size that STAY WHERE THEY WERE LEFT (no ring, no glide).

const VALUES = [['forca', 'Força'], ['equilibri', 'Equilibri'], ['valor', 'Valor'], ['seny', 'Seny']];
const OUTCOME = { descarregat: ['descarregat', 'levantado, coronado y bajado sin caer'], carregat: ['carregat', 'coronado, y después cayó'], intent: ['intent', 'cayó antes de la corona'] };
const SENTENCE = ['Este ha sido vuestro castell.', 'Cuando los cuerpos resuenan juntos,', 'nace la cultura.'];   // the voice: v-cierre-final
const CREDITS = ['Ressonància', 'Barcelona XR Lab × Alma Digital Studio', 'Con el apoyo de la Generalitat de Catalunya'];
const INVITE = { es: 'Dejad vuestra mano', en: 'Leave your hand' };
const ACTA = chapter('acta'), INK = ACTA.dark === false ? ACTA.lin.ink.slice() : [0.76, 0.73, 0.68], SOFT = INK;
const NUM = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
const words = (c) => { const t = String(c).replace(/\d+/g, (d) => NUM[+d] ?? d); return t.charAt(0).toUpperCase() + t.slice(1); };   // «3 de 7» → «Tres de siete»
const CHAPTER = [[1.0, 0.14, 0.014], [0.027, 0.65, 0.56], [0.55, 0.12, 0.04], [0.85, 0.89, 1.0], [0.92, 0.56, 0.1], [0.93, 0.47, 0.56]];
const VALUE_COL = [CHAPTER[1], CHAPTER[2], CHAPTER[3], CHAPTER[5]];      // Força = Pinya, Equilibri = Tronc, Valor = Pom, Seny = the descent
const Y = { castell: 1.89, ribbon: 1.5, gloss: 2.64, sentence: 2.2, credits: 2.2, invite: 1.1, values: 1.36 };   // castell: its name's caps centred at 2.05 m; outcome 1.62; values 1.36; invite 1.1
// the ring of prints (wall-local metres): centre, two rings; the dials: x, y per value (two each side, inside the walls' free edge)
const RING = { y: 2.05, rx: [1.95, 2.22], ry: [0.68, 0.87], cap: [40, 48] };
const DIAL = { r: 0.19, pos: [[-2.58, 2.72], [-2.58, 1.72], [2.58, 2.72], [2.58, 1.72]] };   // ART r5: each value block ×1.6
const PRINT_H = 0.15, STILL_S = 3.0, MAXP = 160, NSLOT = 34;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const env = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t > c ? 1 - smooth((t - c) / (d - c)) : 1);
const TAU = Math.PI * 2;

export function create({ THREE, TSL, room, params = {} }) {
  const { Fn, If, Discard, uniform, uv, vec2, vec3, vec4, float, smoothstep, step, max, min, exp, sin, cos, abs, length, dot, fwidth, atan, clamp, select,
    attribute, varying, positionGeometry, cameraWorldMatrix, positionWorld, mix } = TSL;
  const object = new THREE.Group(); object.name = 'actatext';
  const NW = room.walls.length;
  const UP = new THREE.Vector3(0, 1, 0);
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, UP, w.normal)));
  const over = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false };
  const place = (mesh, wi, y) => { const w = room.walls[wi]; mesh.position.copy(w.centre).setY(y).addScaledVector(w.normal, -0.02); mesh.quaternion.copy(basis[wi]); mesh.renderOrder = 12; mesh.visible = false; mesh.frustumCulled = false; object.add(mesh); };
  const wallPt = (wi, x, y, back, out) => out.copy(room.walls[wi].centre).addScaledVector(room.walls[wi].right, x).setY(y).addScaledVector(room.walls[wi].normal, -back);
  const flash = room.flash ? room.flash : null;
  const mats = [], geos = [];

  // ---- the words
  const T = (y, opt = {}, x = 0) => { const t = typo.text({ placements: typo.onWalls(room, y, x), renderOrder: 12, ...opt }); object.add(t.object); return { t, prev: 0 }; };
  const castellT = T(Y.castell, { plate: 0 }), glossT = T(Y.gloss, { plate: 0 }), statT = T(Y.gloss, { plate: 0 }), sentT = T(Y.sentence, { plate: 0, depth: 0.45 }), credT = T(Y.credits, { plate: 0 });
  const inviteT = T(Y.invite, { plate: 0, flash });
  const valuesT = T(Y.values, { plate: 0, halo: 0.2 });
  const labelT = DIAL.pos.map(([x, y]) => T(y - DIAL.r - 0.37, { plate: 0, max: 16, flash }, x));
  const numT = DIAL.pos.map(([x, y]) => { const o = T(y - DIAL.r - 0.16, { plate: 0, max: 8 }, x); o.shown = -1; return o; });   // ART r5: the figure, in mono, ×2
  sentT.t.set([{ text: SENTENCE[0], font: 'italic', size: 0.13, y: 0.36, track: 0.015, alpha: 0.75, color: INK, rise: true },
    { text: SENTENCE[1], font: 'serif', size: 0.21, y: 0.07, track: 0.01, color: INK, delay: 0.6 }, { text: SENTENCE[2], font: 'italic', size: 0.21, y: -0.2, track: 0.01, color: INK, rise: true, delay: 0.9 }]);
  credT.t.set([{ text: CREDITS[0], font: 'serif', size: 0.2, y: 0.22, track: 0.04, color: INK }, { text: CREDITS[1], font: 'sans', size: 0.09, y: -0.04, track: 0.1, alpha: 0.75, color: SOFT }, { text: CREDITS[2], font: 'sans', size: 0.082, y: -0.22, track: 0.16, alpha: 0.6, color: SOFT, upper: true, edge: 0.47 }]);
  const lang = params.lang === 'en' ? 'en' : 'es';
  inviteT.t.set([{ text: INVITE[lang], font: 'serif', size: 0.18 / 0.7, y: 0, track: 0.015, alpha: 1, color: INK, rules: 0.32, reveal: 'blur' }]);   // the card's serif on its hairlines
  let labelKey = '';

  // ---- the chapters' ribbon under the castell
  const RIB_W = 1.5, ribGeo = new THREE.PlaneGeometry(RIB_W + 0.1, 0.05); geos.push(ribGeo);
  const ribbons = room.walls.map((w, i) => {
    const U = { grow: uniform(0), a: uniform(0) };
    const x = uv().x.sub(0.5).mul(RIB_W + 0.1), y = uv().y.sub(0.5).mul(0.05), u = x.div(RIB_W).add(0.5);
    const seg = u.mul(6).floor().clamp(0, 5), f = u.mul(6).fract();
    let col = vec3(...CHAPTER[0]);
    for (let k = 1; k < 6; k++) col = select(seg.greaterThan(k - 0.5), vec3(...CHAPTER[k]), col);
    const inside = step(0, u).mul(step(u, 1)).mul(smoothstep(0.0, 0.04, f)).mul(smoothstep(1.0, 0.96, f));
    const line = smoothstep(0.0042, 0.0022, y.abs()).mul(inside).mul(step(f, U.grow.mul(6).sub(seg)));
    const m = new THREE.MeshBasicNodeMaterial(over);
    m.colorNode = col.mul(line).mul(1.1).mul(U.a); m.opacityNode = line.mul(U.a);
    const mesh = new THREE.Mesh(ribGeo, m); place(mesh, i, Y.ribbon); mats.push(m);
    return { mesh, U };
  });

  // ---- THE PRINTS: one instanced draw. Per instance: pA (centre xyz, kind 0 print / 1 slot dot), pB (wall right xyz, angle),
  // pN (wall normal xyz, half size m), pD (form 0..1, pop, seed, alpha). A camera draws only its own wall's.
  const NI = MAXP + NSLOT * NW;
  const piG = new THREE.InstancedBufferGeometry();
  piG.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); piG.setIndex([0, 1, 2, 0, 2, 3]);
  const pAa = new Float32Array(NI * 4), pBa = new Float32Array(NI * 4), pNa = new Float32Array(NI * 4), pDa = new Float32Array(NI * 4);
  const PA = new THREE.InstancedBufferAttribute(pAa, 4), PB = new THREE.InstancedBufferAttribute(pBa, 4), PN = new THREE.InstancedBufferAttribute(pNa, 4), PD = new THREE.InstancedBufferAttribute(pDa, 4);
  for (const a of [PA, PB, PN, PD]) a.setUsage(THREE.DynamicDrawUsage);
  piG.setAttribute('pA', PA); piG.setAttribute('pB', PB); piG.setAttribute('pN', PN); piG.setAttribute('pD', PD); piG.instanceCount = 0; geos.push(piG);
  const uPK = uniform(0);   // the prints' gate
  {
    const A = attribute('pA', 'vec4'), B = attribute('pB', 'vec4'), N = attribute('pN', 'vec4'), D = attribute('pD', 'vec4');
    const ca = cos(B.w), sa = sin(B.w), q = positionGeometry.xy;
    const lx = q.x.mul(ca).sub(q.y.mul(sa)).mul(N.w), ly = q.x.mul(sa).add(q.y.mul(ca)).mul(N.w);
    // 25-11 (AD #13): gold LEAF over the lit lime wall — premultiplied «over» (additive light vanished on a light wall)
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false });
    m.positionNode = A.xyz.add(B.xyz.mul(lx)).add(vec3(0, 1, 0).mul(ly));
    const vQ = varying(q), vK = varying(A.w), vD = varying(D), vN = varying(N.xyz), vA = varying(B.w), vW = varying(positionWorld);
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const c = vec3(0).toVar(), cov = float(0).toVar();
      If(vK.lessThan(0.5), () => {
        // a hand, in units of the half size (fingers along +y): palm + five capsules, smooth union; mirrored for a left hand
        const mir = select(vD.z.greaterThan(0.5), float(-1), float(1)), sd = vD.z.mul(17.0).fract();
        const P = vec2(vQ.x.mul(mir), vQ.y);
        const cap = (a, b, r) => { const pa = P.sub(a), ba = b.sub(a), h = clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1); return length(pa.sub(ba.mul(h))).sub(r); };
        const sp = sd.sub(0.5).mul(0.12);
        const bx = abs(P.x).sub(0.27), by = abs(P.y.add(0.38)).sub(0.27);
        const palm = length(vec2(max(bx, 0), max(by, 0))).add(min(max(bx, by), 0)).sub(0.12);
        const sm = (a, b) => { const h = clamp(float(0.5).add(b.sub(a).mul(0.5 / 0.07)), 0, 1); return mix(b, a, h).sub(h.mul(h.oneMinus()).mul(0.07)); };
        let d = palm;
        d = sm(d, cap(vec2(-0.21, -0.08), vec2(float(-0.29).sub(sp), 0.52), 0.07));
        d = sm(d, cap(vec2(-0.07, -0.05), vec2(-0.08, 0.7), 0.074));
        d = sm(d, cap(vec2(0.07, -0.07), vec2(float(0.12).add(sp), 0.6), 0.07));
        d = sm(d, cap(vec2(0.2, -0.12), vec2(float(0.32).add(sp.mul(2)), 0.36), 0.06));
        d = sm(d, cap(vec2(-0.27, -0.46), vec2(float(-0.64).sub(sp), -0.06), 0.08));
        const fw = fwidth(d).add(0.0001);
        // it forms from the palm out (form 0 → 1), the edge of the ink a little brighter as it spreads
        const rr = length(P.sub(vec2(0, -0.3))), front = vD.x.mul(1.35);
        const reveal = float(1).sub(smoothstep(front.sub(0.12), front, rr));
        const fill = float(1).sub(smoothstep(fw.negate(), fw, d));
        const rim = float(1).sub(smoothstep(fw.mul(0.6), fw.mul(1.8), abs(d.add(fw.mul(0.8)))));
        const ridge = float(1).sub(rr.mul(0.45)).max(0.4);   // gold leaf: denser at the palm, thinner to the fingertips
        const wet = exp(rr.sub(front).div(0.06).pow(2).negate()).mul(step(vD.x, 0.99)).mul(fill);
        const g = vec3(0.62, 0.38, 0.1);   // old gold leaf (linear): reads on the lime
        cov.assign(fill.mul(ridge.mul(0.55).add(0.3)).max(rim).mul(reveal).min(1));
        c.addAssign(g.mul(cov).add(vec3(0.9, 0.62, 0.25).mul(rim.mul(0.35).add(wet.mul(0.5))).mul(reveal)));
        c.addAssign(vec3(1.0, 0.78, 0.45).mul(fill.mul(vD.y).mul(0.6)));
        const lamp = flash ? flash(vW) : float(0);
        c.addAssign(vec3(1.0, 0.82, 0.55).mul(rim.mul(lamp).mul(0.6)));
      }).Else(() => {
        // a slot of the ring: a dot, faint
        const r2 = dot(vQ, vQ);
        c.addAssign(vec3(0.95, 0.72, 0.4).mul(exp(r2.mul(-4.0))).mul(1.3));
      });
      return vec4(c.mul(vD.w).mul(uPK), cov.mul(vD.w).mul(uPK));
    })();
    mats.push(m);
    var printMesh = new THREE.Mesh(piG, m); printMesh.frustumCulled = false; printMesh.renderOrder = 11; object.add(printMesh);
  }
  // the ring's arc-length table (fraction f 0..1 round the ellipse → angle), per ring; angle 0 = right, counter-clockwise
  const RT = RING.rx.map((rx, k) => {
    const ry = RING.ry[k], N = 720, L = [0]; let acc = 0;
    for (let i = 1; i <= N; i++) { const a0 = ((i - 1) / N) * TAU, a1 = (i / N) * TAU; acc += Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), ry * (Math.sin(a1) - Math.sin(a0))); L.push(acc); }
    const ang = (f) => { f = ((f % 1) + 1) % 1; const s = f * acc; let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] < s) lo = mid; else hi = mid; } return ((lo + (s - L[lo]) / Math.max(1e-6, L[hi] - L[lo])) / N) * TAU; };
    const frac = (a) => { a = ((a % TAU) + TAU) % TAU; const i = Math.min(N - 1, Math.floor((a / TAU) * N)); return L[i] / acc; };
    return { rx, ry, len: acc, ang, frac };
  });
  const slotDot = (k, f) => { const a = RT[0].ang(f); return [RT[0].rx * Math.cos(a), RING.y + RT[0].ry * Math.sin(a)]; };

  // ---- THE DIALS (3d-feature-objects): bezel (lit metal), face (dark enamel, 1 px ticks, the value's arc, needle, hub)
  const recipe = room.lightRecipe ? room.lightRecipe({ warm: 0xFFE0BC, cool: 0x9FB4D8, key: 2.0, fill: 0.08 }) : null;
  if (recipe) object.add(recipe.group);
  const faceGeo = new THREE.CircleGeometry(DIAL.r, 96), bezGeo = new THREE.TorusGeometry(DIAL.r + 0.005, 0.011, 16, 96), backGeo = new THREE.CylinderGeometry(DIAL.r + 0.004, DIAL.r + 0.01, 0.02, 64, 1, true);
  geos.push(faceGeo, bezGeo, backGeo);
  const dialU = VALUES.map(() => ({ v: uniform(0), a: uniform(0), lit: uniform(0) }));
  const faceMats = VALUES.map((_, k) => {
    const U = dialU[k], col = vec3(...VALUE_COL[k]);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    m.colorNode = Fn(() => {
      const p = uv().sub(0.5).mul(2), r = length(p), fw = fwidth(r).add(0.0001);
      // gauge angle g 0..1 runs clockwise from lower-left (225°) to lower-right (-45°)
      const th = atan(p.y, p.x), raw = float(225 / 360).sub(th.div(TAU)), g = raw.sub(raw.floor()).mul(360 / 270);
      const inArc = step(g, 1.0);
      const tick = (n, r0, r1, wpx) => { const gg = g.mul(n), dd = abs(gg.sub(gg.round())).div(n).mul(270 / 360).mul(TAU).mul(r); return float(1).sub(smoothstep(fw.mul(wpx * 0.5), fw.mul(wpx * 0.5 + 1), dd)).mul(step(r0, r)).mul(step(r, r1)).mul(inArc); };
      const minor = tick(27, 0.78, 0.86, 1), major = tick(3, 0.72, 0.88, 1.3);
      const ringL = (rad, wpx) => float(1).sub(smoothstep(fw.mul(wpx * 0.5), fw.mul(wpx * 0.5 + 1), abs(r.sub(rad))));
      const track = ringL(0.94, 1).mul(inArc);
      const val = U.v, lit = track.mul(step(g, val)), head = exp(g.sub(val).div(0.012).pow(2).negate()).mul(ringL(0.94, 3)).mul(inArc);
      // the needle: a 1 px line from the hub to r 0.8 at the value's angle, and its short tail
      const na = float(225 / 360).sub(val.mul(270 / 360)).mul(TAU), nd = vec2(cos(na), sin(na));
      const along = dot(p, nd), perp = abs(p.x.mul(nd.y).sub(p.y.mul(nd.x)));
      const fwp = fwidth(perp).add(0.0001);
      const needle = float(1).sub(smoothstep(fwp.mul(0.7), fwp.mul(1.9), perp)).mul(step(-0.16, along)).mul(step(along, 0.8));
      const hub = ringL(0.07, 1).add(float(1).sub(smoothstep(0.025, 0.035, r)).mul(0.6));
      const face = vec3(0.010, 0.010, 0.013).mul(float(1).sub(r.mul(0.35)));
      const ink = vec3(...INK);
      const c = face.add(ink.mul(minor.mul(0.32).add(major.mul(0.55)).add(track.mul(0.16)))).add(col.mul(lit.mul(1.15).add(head.mul(0.8)))).add(vec3(1.0, 0.8, 0.5).mul(needle.mul(0.95).add(hub.mul(0.7))));
      return vec4(c.mul(U.a), step(r, 1.0).mul(U.a).mul(0.92));
    })();
    mats.push(m); return m;
  });
  const bezMats = VALUES.map((_, k) => {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x8a8378, metalness: 0.9, roughness: 0.32, transparent: true, depthWrite: false });
    const rim = recipe ? recipe.rim(0.55, 3) : vec3(0);
    const lamp = flash ? flash(positionWorld) : float(0);
    m.emissiveNode = rim.add(vec3(...VALUE_COL[k]).mul(dialU[k].lit.mul(0.12))).add(vec3(1.0, 0.82, 0.55).mul(lamp.mul(0.5)));
    m.opacityNode = dialU[k].a;
    if (room.envMap) { m.envMap = room.envMap; m.envMapIntensity = 0.8; }
    mats.push(m); return m;
  });
  const backMat = new THREE.MeshStandardNodeMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.5, transparent: true, depthWrite: false, side: THREE.DoubleSide }); mats.push(backMat);
  const uDialA = uniform(0); backMat.opacityNode = uDialA;
  const dials = [];
  room.walls.forEach((w, wi) => DIAL.pos.forEach(([x, y], k) => {
    const pivot = new THREE.Group(), tilt = new THREE.Group();
    wallPt(wi, x, y, 0.05, pivot.position); pivot.quaternion.copy(basis[wi]);
    const face = new THREE.Mesh(faceGeo, faceMats[k]); face.position.z = 0.004; face.renderOrder = 12;
    const bez = new THREE.Mesh(bezGeo, bezMats[k]); bez.position.z = 0.005; bez.renderOrder = 13;
    const back = new THREE.Mesh(backGeo, backMat); back.rotation.x = Math.PI / 2; back.position.z = -0.006; back.renderOrder = 11;
    tilt.add(back, face, bez); pivot.add(tilt); object.add(pivot);
    for (const o of [face, bez, back]) o.frustumCulled = false;
    pivot.visible = false;
    dials.push({ wi, k, x, y, pivot, tilt, yaw: 0, pitch: 0 });
  }));

  // ---- content
  let contentKey = '';
  const values = new Float32Array(4);
  let handsN = 0;
  function content(acta, nPrints, S) {
    const castell = words(acta?.castell || params.castell || '3 de 7'), outcome = acta?.outcome || params.outcome || 'descarregat';
    const hands = Math.max(acta?.hands ?? 0, nPrints), colla = (S && S.castell && S.castell.floorsColla) || 0;
    handsN = hands;
    const key = castell + '|' + outcome + '|' + hands + '|' + colla;
    for (let k = 0; k < 4; k++) values[k] = clamp01(acta?.values?.[VALUES[k][0]] ?? params.values?.[k] ?? [0.82, 0.64, 0.71, 0.58][k]);
    if (key === contentKey) return;
    contentKey = key;
    const O = OUTCOME[outcome] || OUTCOME.descarregat;
    castellT.t.set([{ text: castell, font: 'serif', size: 0.46 / 0.667, y: 0.16, track: 0.01, color: INK }, { text: O[0], font: 'italic', size: 0.2, y: -0.27, track: 0.02, alpha: 0.95, color: INK, rules: 0.45, rise: true, delay: 0.5 }]);
    glossT.t.set([{ text: O[1].charAt(0).toUpperCase() + O[1].slice(1), font: 'italic', size: 0.18 / 0.7, y: 0, track: 0.015, alpha: 0.92, color: SOFT }]);
    // the line of story: who raised it, and what the colla did (D2: the help is named)
    const story = [hands > 0 ? `Levantado por ${hands} ${hands === 1 ? 'mano' : 'manos'}` : 'Levantado por vuestras manos'];
    if (colla > 0) story.push(`La colla ayudó en ${colla} ${colla === 1 ? 'piso' : 'pisos'}`);
    statT.t.set(story.map((text, i) => ({ text, font: 'italic', size: 0.18 / 0.7, y: story.length > 1 ? (i ? -0.16 : 0.16) : 0, track: 0.03, alpha: 0.9, color: SOFT, reveal: 'blur', delay: i * 0.3 })));
    const rec = VALUES.map(([, name], q) => [name, Math.round(values[q] * 100)]).filter(([, v]) => v > 0).map(([name, v]) => `${name.toUpperCase()} ${v}`).join('  ·  ');
    valuesT.t.set(rec ? [{ text: rec, font: 'serif', size: 0.14 / 0.7, y: 0, track: 0.06, alpha: 0.8, color: INK }] : []);
    const lk = values.join(',');
    if (lk !== labelKey) { labelKey = lk; for (let k = 0; k < 4; k++) labelT[k].t.set([{ text: VALUES[k][1], font: 'sans', size: 0.13, y: 0, track: 0.14, alpha: 0.35 + 0.6 * values[k], color: INK, upper: true, reveal: 'blur' }]); }
  }
  function set(o, v, k, dt = 1 / 60) {
    const U = o.t.U;
    if (v > o.prev + 1e-4) { U.asm.value = v; U.out.value = 0; } else if (v < o.prev - 1e-4) { U.asm.value = 1; U.out.value = 1 - v; }
    if (v <= 0.001) { U.asm.value = 0; U.out.value = 0; }
    o.prev = v;
    const since = U.out.value === 0 && U.asm.value >= 1 ? (o.since = (o.since || 0) + dt) : (o.since = 0);
    U.sweep.value = -0.25 + since * 0.8; U.sweepK.value = since > 0 && since < 2.5 ? 1 : 0;
    o.t.alpha.fill(k); o.t.apply(1);
  }

  // ---- the prints' state
  const prints = [];                          // { id, wall, x, y, a, s, born, form, pop, seed, mir, ring, pref, tx, ty, ta, landed }
  const track = new Map();                    // stroke → { x, y, still, v, printed, seen }
  let firstLand = -1, frame = 0, lastT = -1, srcPrintsN = 0;
  const _v = new THREE.Vector3();
  function addPrint(id, wall, x, y, t, seed) {
    if (prints.length >= MAXP) return;
    const ax = x, ay = y - RING.y, pref = RT[0].frac(Math.atan2(ay / RING.ry[0], ax / RING.rx[0]));
    prints.push({ id, wall, x, y, a: 0, s: 1, born: t, form: 0, pop: 0, seed, mir: x < 0 ? 1 : 0, ring: 0, pref, tx: x, ty: y, ta: 0, landed: false, sweep: 0 });
  }
  function layoutRing() {
    return;   // 25-11 (AD #13): the prints stay where they were left
    // per wall: the prints that have left the hand join the ring, sorted by where they came from, spaced evenly, rotated to fit
    for (let wi = 0; wi < NW; wi++) {
      const L = prints.filter((p) => p.wall === wi);
      L.sort((a, b) => a.born - b.born);
      const rings = [L.slice(0, RING.cap[0]), L.slice(RING.cap[0], RING.cap[0] + RING.cap[1])];
      rings.forEach((R, k) => {
        if (!R.length) return;
        R.sort((a, b) => a.pref - b.pref);
        const n = R.length;
        // the offset that keeps each print nearest the place it came from (circular mean)
        let sx = 0, sy = 0; R.forEach((p, i) => { const d = (p.pref - i / n) * TAU; sx += Math.cos(d); sy += Math.sin(d); });
        const f0 = Math.atan2(sy, sx) / TAU;
        R.forEach((p, i) => {
          const a = RT[k].ang(f0 + i / n);
          p.ring = k; p.tx = RT[k].rx * Math.cos(a); p.ty = RING.y + RT[k].ry * Math.sin(a);
          p.ta = Math.atan2(p.tx, RING.y - p.ty);   // fingers to the centre: the local +y turned to (centre − print)
        });
      });
    }
  }

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    const S = input.state, t = S && S.block === 'acta' ? S.t : (input.t ?? params.t ?? 0);
    typo.setTime(input.time ?? t);
    if (t < lastT - 1) { prints.length = 0; track.clear(); firstLand = -1; }      // a new acta (or the study's clock went back)
    lastT = t;
    const lv = input.leave ?? 0, k = smooth(Math.min(1, (input.arrive ?? 1) * 3)) * (lv > 0 ? 1 - smooth((lv - 0.4) / 0.6) : 1);
    const brk = 1 - clamp01(lv * 1.6);
    const open = t >= STILL_S;                                       // prints from ~3 s

    // ---- prints: from the score (state.prints, POS T-050) or from the hands resting ~3 s (stand-in)
    let changed = false;
    const src = Array.isArray(S?.prints) ? S.prints : null;
    if (src) {
      if (src.length < srcPrintsN) { prints.length = 0; changed = true; }
      for (let i = srcPrintsN > src.length ? 0 : srcPrintsN; i < src.length; i++) {
        const q = src[i]; if (!q) continue;
        let wi = typeof q.wall === 'string' ? Math.max(0, room.walls.findIndex((w) => w.id === q.wall)) : (q.wall ?? 0), x = 0, y = q.y ?? q.pos?.y ?? 1.25;
        if (!room.walls[wi]) wi = 0;
        if (q.dx != null) x = q.dx;                                       // POS T-050: { wall, dx, y, s, size, t }
        else if (q.u != null) x = (q.u - 0.5) * room.walls[wi].width;
        else if (q.pos) { const w = room.walls[wi]; x = _v.copy(q.pos).sub(w.centre).dot(w.right); }
        else if (q.x != null) x = q.x;
        addPrint(q.id ?? i, wi, x, y, t, ((i * 0.618 + 0.17) % 1)); changed = true;
      }
      srcPrintsN = src.length;
    } else if (open && lv <= 0) {
      for (const h of input.hands || []) {
        const w = room.walls[h.wall]; if (!w) continue;
        const x = (h.u - 0.5) * w.width, y = h.pos.y;
        let s = track.get(h.stroke);
        if (!s) { s = { x, y, still: 0, v: 0, printed: false, seen: frame }; track.set(h.stroke, s); }
        const v = Math.hypot(x - s.x, y - s.y) / Math.max(dt, 1e-3);
        s.v += (Math.max(v, Math.hypot(h.vx || 0, h.vy || 0)) - s.v) * (1 - Math.exp(-dt / 0.15));
        s.x = x; s.y = y; s.seen = frame;
        s.still = s.v < 0.25 ? s.still + dt : Math.max(0, s.still - dt * 3);
        if (!s.printed && s.still >= STILL_S) { s.printed = true; addPrint(h.stroke, h.wall, x, y, t, ((prints.length * 0.618 + 0.17) % 1)); changed = true; }
      }
      for (const [key, s] of track) if (s.seen !== frame) track.delete(key);
    }
    // study: stand-in prints spread round the walls (params.prints = how many)
    if (!src && (params.prints ?? 0) > 0 && !prints.length && open) {
      const n = Math.min(MAXP, params.prints | 0);
      for (let i = 0; i < n; i++) { const wi = i % NW, w = room.walls[wi], r = ((i * 0.754877) % 1); addPrint('fake' + i, wi, (r - 0.5) * (w.width - 1.4), 0.95 + ((i * 0.5698) % 1) * 0.75, t - 4 - (i % 7) * 0.4, (i * 0.618) % 1); }
      changed = true;
    }
    if (changed) layoutRing();
    content(input.acta, prints.length, input.state);

    // ---- prints: form (0.7 s), hold under the hand (0.9 s), glide to the ring, land (pop), rest; the ring re-spaces as it fills
    let n = 0;
    const put = (kind, wi, x, y, ang, half, form, pop, seed, alpha) => {
      if (n >= NI) return;
      const w = room.walls[wi], o = n * 4; wallPt(wi, x, y, 0.012, _v);
      pAa[o] = _v.x; pAa[o + 1] = _v.y; pAa[o + 2] = _v.z; pAa[o + 3] = kind;
      pBa[o] = w.right.x; pBa[o + 1] = w.right.y; pBa[o + 2] = w.right.z; pBa[o + 3] = ang;
      pNa[o] = w.normal.x; pNa[o + 1] = w.normal.y; pNa[o + 2] = w.normal.z; pNa[o + 3] = half;
      pDa[o] = form; pDa[o + 1] = pop; pDa[o + 2] = seed; pDa[o + 3] = alpha; n++;
    };
    const ringK = env(t, 2.2, 4.5, 39.2, 40) * brk;
    const filled = new Float32Array(NW);
    for (const p of prints) {
      const age = t - p.born;
      p.form = clamp01(age / 0.7);
      if (age > 1.6) {
        const r = 1 - Math.exp(-dt * (p.landed ? 1.6 : 2.4));
        p.x += (p.tx - p.x) * r; p.y += (p.ty - p.y) * r;
        let da = p.ta - p.a; da = Math.atan2(Math.sin(da), Math.cos(da)); p.a += da * r;
        p.s += (1 - p.s) * r;
        if (!p.landed && Math.hypot(p.tx - p.x, p.ty - p.y) < 0.03) { p.landed = true; p.pop = 1; if (firstLand < 0) firstLand = t; }
      } else if (age > 0.7) { p.y += dt * 0.02; }
      p.pop = Math.max(0, p.pop - dt / 0.8);
      if (p.landed) filled[p.wall]++;
      // after the castell leaves, a slow light runs round each wall's ring (the photo): a soft brightening per print
      const sweep = t > 24 ? Math.pow(Math.max(0, Math.cos(((t * 0.35) - Math.atan2(p.y - RING.y, p.x) / TAU) * TAU)), 24) * 0.35 : 0;
      put(0, p.wall, p.x, p.y, p.a, PRINT_H * p.s, p.form, Math.max(p.pop, sweep), p.mir ? 0.55 + p.seed * 0.4 : p.seed * 0.45, 1);   // seed > 0.5 = a left hand (mirrored)
    }
    // the dotted ring where the prints go (faint; a dot goes out under a landed print)
    for (let wi = 0; wi < NW; wi++) {
      const dotA = 0;   // no ring of slots (the prints stay where they were left)
      for (let i = 0; i < NSLOT; i++) { const [x, y] = slotDot(0, i / NSLOT); put(1, wi, x, y, 0, 0.02, 1, 0, 0, dotA); }
    }
    piG.instanceCount = n; for (const a of [PA, PB, PN, PD]) a.needsUpdate = true;
    uPK.value = k * ringK; printMesh.visible = uPK.value > 0.002 && n > 0;

    // ---- the words
    const landed = firstLand >= 0 && t > firstLand;
    set(castellT, env(t, 0.2, 2.6, 24, 24.6) * brk, k, dt);
    set(glossT, env(t, 2.4, 4.2, 11, 11.6) * brk, k, dt);   // above the castell, then the line of story in its place (12–24 s)
    const inv = Math.min(S && S.printOpen != null && S.block === 'acta' ? (S.printOpen ? env(t, 3.0, 4.0, 99, 100) : (t > 3.5 ? 0 : 0)) : env(t, 3.0, 4.0, 21.4, 22), landed ? 1 - 0.2 * smooth((t - firstLand) / 0.6) : 1) * brk;   // 3–22 s; a little dimmer once a print lands
    set(inviteT, inv, k, dt);
    set(statT, env(t, 12, 13.5, 24, 24.6) * brk, k, dt);
    set(valuesT, env(t, 12.5, 14, 31.8, 32.6) * brk, k, dt);   // the values: a typographic record under the outcome
    set(sentT, env(t, 25, 28, 31.8, 32.6) * brk, k, dt);
    set(credT, env(t, 33.5, 35, 38.8, 39.6) * brk, k, dt);
    for (let i = 0; i < NW; i++) { const rb = ribbons[i]; rb.U.grow.value = clamp01((t - 1.6) / 1.8) * (1 - smooth((t - 13.2) / 0.6)) * brk; rb.U.a.value = k; rb.mesh.visible = rb.U.grow.value > 0.001 && k > 0.002; }

    // ---- the dials: each comes in (bezel and ticks), then its needle swings to the value and settles (a little overshoot)
    let anyDial = 0;
    for (let q = 0; q < 4; q++) {
      const s0 = 12 + q * 0.7, a = 0, U = dialU[q];   // AD #13: no dials
      const f = clamp01((t - (s0 + 0.6)) / 2.4), sw = f >= 1 ? 1 : 1 - Math.exp(-f * 5) * Math.cos(f * 7.5);
      U.a.value = a; U.v.value = clamp01(values[q] * sw); U.lit.value = a * values[q];
      set(labelT[q], 0, k, dt);
      const N = numT[q], pct = Math.round(U.v.value * 100);
      if (pct !== N.shown) { N.shown = pct; N.t.set([{ text: String(pct), font: 'sans', size: 0.22, y: 0, track: 0.02, color: INK, alpha: 0.85 }]); }
      set(N, 0, k, dt);
      anyDial = Math.max(anyDial, a);
    }
    uDialA.value = anyDial * 0.9;
    const hands = input.hands || [];
    for (const D of dials) {
      D.pivot.visible = dialU[D.k].a.value > 0.002;
      if (!D.pivot.visible) continue;
      // turn a little towards the nearest hand on its wall (within 1.6 m), else settle; a faint idle breath
      let ty = 0, tp = 0, best = 1.6;
      for (const h of hands) {
        if (h.wall !== D.wi) continue;
        const w = room.walls[D.wi], hx = (h.u - 0.5) * w.width, d = Math.hypot(hx - D.x, h.pos.y - D.y);
        if (d < best) { best = d; ty = Math.max(-0.55, Math.min(0.55, (hx - D.x) * 0.6)); tp = Math.max(-0.4, Math.min(0.4, -(h.pos.y - D.y) * 0.6)); }
      }
      const tm = input.time ?? t;
      ty += 0.04 * Math.sin(tm * 0.31 + D.k * 1.7 + D.wi); tp += 0.03 * Math.sin(tm * 0.23 + D.k * 2.3);
      const r = 1 - Math.exp(-dt * 10);
      D.yaw += (ty - D.yaw) * r; D.pitch += (tp - D.pitch) * r;
      D.tilt.rotation.set(D.pitch, D.yaw, 0);
    }
    if (recipe) recipe.group.visible = anyDial > 0.002;
    if (typeof window !== 'undefined') window.__acta = { prints: prints.length, landed: prints.filter((p) => p.landed).length, firstLand, t };
  }
  function dispose() { for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); for (const o of [castellT, glossT, statT, sentT, credT, inviteT, valuesT, ...labelT, ...numT]) o.t.dispose(); }
  return { object, update, dispose };
}
