// Ressonància — part "actatext" (contract: ../PARTS.md): the closing, l'acta, as words and four bars ON the walls, in 3D.
// The 2D version is ../../scenes/acta.js; the dust and the dim horizon are atmos' (the host passes it t = 69).
// Timeline on input.state.t (or input.t; 40 s):
//   0.2–15   the group's castell as the colles write it (assembled from light by ~2.4 s), on every wall: "3 de 7"; under it the outcome in Catalan, letter-spaced
//            (DESCARREGAT / CARREGAT / INTENT), and a small English gloss (it leaves at ~12)
//   12–26    the four values, one per wall (Força / Equilibri / Valor / Seny with Strength / Balance / Courage / Good sense small):
//            a thin gold track draws itself, then deep red fills it to the value over 2.5 s; walls 2 s apart
//   17–26    above them, small: "14 hands · 22 s of silence"
//   25–33    one sentence on every wall, large and calm: "When bodies resonate together, / culture is born."
//   33.5–40  the credits, small and wide
// input.acta (score.acta()) gives the content. T-022 (3D-PI): every plate ASSEMBLES from fragments of light — the type is cut in 2.2 cm
// cells that fly in from scattered offsets, each on its own delay, bright gold in flight, settling into the warm type — and breaks
// the same way when it goes (the cells drift up). The castell line starts at once and reads by ~2.5 s (it used to wait 4 s and
// ride the host's slow 5 s arrive). input.arrive only gates (full by ~1.7 s); input.leave breaks everything. Words are drawn into canvas textures (redrawn only when the content changes), on planes 2 cm behind the
// wall planes, each with a soft dark plate. Nothing is allocated per frame. Study: params.t (s) and params.castell / outcome stand in.
const VALUES = [['forca', 'Força', 'STRENGTH'], ['equilibri', 'Equilibri', 'BALANCE'], ['valor', 'Valor', 'COURAGE'], ['seny', 'Seny', 'GOOD SENSE']];
const OUTCOME = { descarregat: ['DESCARREGAT', 'raised, crowned and brought down'], carregat: ['CARREGAT', 'crowned, and then it fell'], intent: ['INTENT', 'it fell before the crown'] };
const SENTENCE = ['When bodies resonate together,', 'culture is born.'];
const CREDITS = ['RESSONÀNCIA', 'Barcelona XR Lab × Alma Digital Studio', 'With the support of the Generalitat de Catalunya'];
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const Y = { castell: 2.42, gloss: 1.86, stat: 2.3, label: 1.86, bar: 1.62, sentence: 2.15, credits: 2.1 };
const BAR_W = 2.2, BAR_H = 0.034;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const env = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t > c ? 1 - smooth((t - c) / (d - c)) : 1);

export function create({ THREE, TSL, room, params = {} }) {
  const { uniform, uv, vec2, vec3, vec4, float, smoothstep, step, texture, max, exp, floor, fract, sin, dot, clamp, select, mix } = TSL;
  const object = new THREE.Group(); object.name = 'actatext';
  const NW = room.walls.length, PX = 300;
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  const over = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false };

  // ---- a text plate: one canvas, one texture, shown on one or all walls
  function plate(wM, hM) {
    const cv = document.createElement('canvas'); cv.width = Math.round(wM * PX); cv.height = Math.round(hM * PX);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.premultiplyAlpha = false;
    return { cv, g: cv.getContext('2d'), tex, wM, hM, key: null };
  }
  function draw(p, items, shade = 0.5) {     // items: [{ text, size (cap m), y (m from centre), track, alpha, weight }]
    const { cv, g } = p, W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    let maxW = 0;
    for (const it of items) {
      let size = it.size * PX * 1.38; g.font = `${it.weight || 300} ${size}px ${FONT}`;
      const chars = [...it.text], tr = (it.track || 0) * size;
      let tw = chars.reduce((a, ch) => a + g.measureText(ch).width + tr, -tr);
      if (tw > W * 0.9) { const k = (W * 0.9) / tw; size *= k; tw *= k; }
      it.px = size; it.tw = tw; it.chars = chars; maxW = Math.max(maxW, tw);
    }
    if (shade > 0) {
      g.save(); g.translate(W / 2, H / 2); g.scale(Math.min(W, maxW + 0.8 * PX) / 2, H / 2);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(0,0,0,${shade})`); gr.addColorStop(0.55, `rgba(0,0,0,${shade * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.textBaseline = 'middle';
    for (const it of items) {
      g.font = `${it.weight || 300} ${it.px}px ${FONT}`; g.fillStyle = `rgba(255,226,186,${it.alpha ?? 1})`;   // warm
      let x = (W - it.tw) / 2; const y = H / 2 - it.y * PX, tr = (it.track || 0) * it.px;
      for (const ch of it.chars) { g.fillText(ch, x, y); x += g.measureText(ch).width + tr; }
    }
    p.tex.needsUpdate = true;
  }
  const mats = [], geos = [];
  function place(p, wi, yM) {                // a mesh of plate p on wall wi at height yM; returns its opacity uniform
    // a = the host's gate; asm = how assembled the type is (0 scattered … 1 whole); out = 1 while it breaks (cells drift up)
    const a = uniform(0), asm = uniform(0), out = uniform(0);
    const P = uv().mul(vec2(p.wM, p.hM)), cell = floor(P.div(0.022));
    const hash = (o) => fract(sin(dot(cell.add(o), vec2(12.9898, 78.233))).mul(43758.5453));
    const h1 = hash(0), h2 = hash(17.3), h3 = hash(41.9);
    const q = clamp(asm.mul(1.6).sub(h1.mul(0.6)), 0, 1), e = q.mul(q).mul(float(3).sub(q.mul(2)));
    const dirIn = vec2(h2.sub(0.5).mul(0.7), h3.sub(0.5).mul(0.5)), dirOut = vec2(h2.sub(0.5).mul(0.3), h3.mul(0.35).add(0.15));
    const off = select(out.greaterThan(0.5), dirOut, dirIn).mul(float(1).sub(e));
    const s = texture(p.tex, uv().add(off.div(vec2(p.wM, p.hM))));
    const ink = s.a.mul(e), flight = e.mul(float(1).sub(e)).mul(4);                       // bright while the fragment flies
    const m = new THREE.MeshBasicNodeMaterial(over);
    m.colorNode = s.rgb.mul(ink).mul(1.85).add(vec3(1.0, 0.74, 0.4).mul(s.a).mul(flight).mul(0.9)).mul(a);
    m.opacityNode = max(ink, s.a.mul(flight).mul(0.45)).mul(a);   // alpha through opacityNode (see guide3d.js)
    const geo = new THREE.PlaneGeometry(p.wM, p.hM), mesh = new THREE.Mesh(geo, m), w = room.walls[wi];
    mesh.position.copy(w.centre).setY(yM).addScaledVector(w.normal, -0.02); mesh.quaternion.copy(basis[wi]);
    mesh.renderOrder = 12; mesh.visible = false; object.add(mesh); mats.push(m); geos.push(geo);
    return { a, asm, out, mesh, prev: 0 };
  }
  const castellP = plate(5.8, 1.15), glossP = plate(5.0, 0.32), statP = plate(4.4, 0.3), sentP = plate(6.2, 1.25), credP = plate(6.0, 1.0);
  const valP = room.walls.map(() => plate(3.0, 0.55));
  const W = room.walls.map((w, i) => ({
    castell: place(castellP, i, Y.castell), gloss: place(glossP, i, Y.gloss), stat: place(statP, i, Y.stat),
    sent: place(sentP, i, Y.sentence), cred: place(credP, i, Y.credits), val: place(valP[i], i, Y.label),
  }));
  // the static plates
  draw(sentP, [{ text: SENTENCE[0], size: 0.2, y: 0.2, track: 0.04, weight: 300 }, { text: SENTENCE[1], size: 0.2, y: -0.22, track: 0.04, weight: 300 }], 0.72);
  draw(credP, [{ text: CREDITS[0], size: 0.1, y: 0.22, track: 0.5, weight: 300 }, { text: CREDITS[1], size: 0.06, y: -0.02, track: 0.12, alpha: 0.85 }, { text: CREDITS[2], size: 0.045, y: -0.2, track: 0.1, alpha: 0.7 }], 0.4);
  room.walls.forEach((_, i) => { const [, ca, en] = VALUES[i % 4]; draw(valP[i], [{ text: ca, size: 0.1, y: 0.1, track: 0.14, weight: 300 }, { text: en, size: 0.045, y: -0.13, track: 0.2, alpha: 0.7 }], 0.4); });

  // ---- the bars: a thin gold track drawing itself, deep red filling it
  const barGeo = new THREE.PlaneGeometry(BAR_W + 0.2, 0.2); geos.push(barGeo);
  const bars = room.walls.map((w, i) => {
    const U = { track: uniform(0), fill: uniform(0), a: uniform(0), head: uniform(0) };
    const x = uv().x.mul(BAR_W + 0.2).sub(0.1), y = uv().y.sub(0.5).mul(0.2);          // metres: x from the bar's left end
    const inX = step(0, x).mul(step(x, U.track.mul(BAR_W)));
    const line = smoothstep(0.004, 0.0015, y.abs()).mul(inX);                            // the gold track, ~3 mm
    const inF = step(0, x).mul(step(x, U.fill.mul(BAR_W)));
    const fillB = smoothstep(BAR_H * 0.5 + 0.003, BAR_H * 0.5 - 0.002, y.abs()).mul(inF);
    const dx = x.sub(U.fill.mul(BAR_W)), headG = exp(dx.mul(dx).add(y.mul(y)).mul(-900)).mul(U.head);
    const shade = float(1).sub(smoothstep(0.03, 0.1, y.abs())).mul(step(-0.1, x)).mul(step(x, BAR_W + 0.1)).mul(0.4);
    const col = vec3(1.0, 0.72, 0.36).mul(line.mul(1.4)).add(vec3(0.62, 0.07, 0.05).mul(fillB.mul(1.6))).add(vec3(1.0, 0.45, 0.25).mul(headG));
    const m = new THREE.MeshBasicNodeMaterial(over);
    m.colorNode = col.mul(U.a); m.opacityNode = max(shade, fillB.mul(0.9)).mul(U.a);
    const mesh = new THREE.Mesh(barGeo, m);
    mesh.position.copy(w.centre).setY(Y.bar).addScaledVector(w.normal, -0.02); mesh.quaternion.copy(basis[i]);
    mesh.renderOrder = 12; mesh.visible = false; object.add(mesh); mats.push(m);
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
    draw(castellP, [{ text: castell, size: 0.4, y: 0.16, track: 0.08, weight: 300 }, { text: O[0], size: 0.11, y: -0.36, track: 0.5, alpha: 0.95 }], 0.72);
    draw(glossP, [{ text: O[1], size: 0.065, y: 0, track: 0.08, alpha: 0.85 }], 0.6);
    draw(statP, [{ text: `${hands} ${hands === 1 ? "hand" : "hands"} · ${still} s of silence`, size: 0.055, y: 0, track: 0.1, alpha: 0.8 }], 0.35);
  }
  // v: the plate's envelope (0..1). It assembles while v rises and breaks while it falls; the host's gate k multiplies the light.
  const set = (o, v, k) => { if (v > o.prev + 1e-4) o.out.value = 0; else if (v < o.prev - 1e-4) o.out.value = 1; o.prev = v; o.asm.value = v; o.a.value = k; o.mesh.visible = v > 0.002 && k > 0.002; };

  function update(dt, input) {
    const S = input.state, t = S && S.block === 'acta' ? S.t : (input.t ?? params.t ?? 0);
    content(input.acta);
    const lv = input.leave ?? 0, k = smooth(Math.min(1, (input.arrive ?? 1) * 3)) * (lv > 0 ? 1 - smooth((lv - 0.4) / 0.6) : 1);
    for (let i = 0; i < NW; i++) {
      const w = W[i], s0 = 12 + 2 * i;
      const brk = 1 - clamp01(lv * 1.6);                         // leaving: the type breaks into light first
      set(w.castell, env(t, 0.2, 2.4, 13.5, 15.5) * brk, k);
      set(w.gloss, env(t, 1.6, 3.6, 11, 12.5) * brk, k);
      set(w.val, env(t, s0, s0 + 1.5, 24, 26) * brk, k);
      set(w.stat, env(t, 17, 19, 24, 26) * brk, k);
      set(w.sent, env(t, 25, 27.5, 31.5, 33) * brk, k);
      set(w.cred, env(t, 33.5, 35, 38.5, 40) * brk, k);
      const b = bars[i], f = smooth((t - (s0 + 1.8)) / 2.5);
      b.U.track.value = smooth((t - (s0 + 0.5)) / 1.2); b.U.fill.value = f * values[i];
      b.U.head.value = f > 0 && f < 1 ? Math.sin(f * Math.PI) : 0;
      b.U.a.value = k * env(t, s0 + 0.4, s0 + 0.8, 24, 26); b.mesh.visible = b.U.a.value > 0.002;
    }
  }
  function dispose() { for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); for (const p of [castellP, glossP, statP, sentP, credP, ...valP]) p.tex.dispose(); }
  return { object, update, dispose };
}
