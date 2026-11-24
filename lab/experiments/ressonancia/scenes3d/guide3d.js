// Ressonància — the guide in 3D (the whole work's host, res-obra3d): where the hands go and what the walls say.
//
//   const guide = createGuide({ THREE, TSL, room });   room.scene.add(guide.object);
//   guide.update(dt, { state, hands, time, on, castell });   // every frame; state = the score's state; on = the "guide" parameter
//
// Targets: a ring (60 cm) with a hand icon, centred at 1.25 m on the wall plane (2 cm behind it, so it is exact for every visitor),
// a soft dark disc under it so it reads over any universe, the pulse ring closing on it in Tronc, a progress arc round it. Wait: one
// per wall; Pinya: 1–3 per wall (state.buttons); Tronc: one per castell wall, two (both sides) once state.balance; Pom: the light's
// wall bright, the next one half; Baixada: one per castell wall.
// Text: the chapter card (~2.15 m) and the instruction line (~1.92 m) on canvas textures, on the walls (from Tronc on, only the
// castell's walls), cross-fading when the words change, each on a soft dark plate. The wording is res-obra's (lines(), CARDS).
// Nothing is allocated per frame: every mesh is made once; a texture is redrawn only when its words change.
import { FLOOR_NAMES, CLIMBERS } from '../score.js';

export const CARDS = { brasa: ['I · Brasa', 'Awakening'], pinya: ['II · Pinya', 'Strength · Força'], tronc: ['III · Tronc', 'Balance · Equilibri'], pom: ['IV · Pom de dalt', 'Courage · Valor'] };
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const HAND_Y = 1.25, R = 0.3, MAXT = 16, HALF = R * 3.1;        // target radius (m), quads 2·HALF wide (the pulse starts at 3 R)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));

/** The words for now: { card: [title, small] } or { line: [title, small] } or {} — as res-obra/experience.js › lines(). */
export function lines(S, acta) {
  const b = S.block;
  if (S.phase === 'title' && CARDS[b]) return { card: CARDS[b] };
  if (b === 'wait') return { line: ['Place your hands on the wall', 'to begin'] };
  if (b === 'brasa') return S.phase === 'reward' ? {} : { line: S.touched < Math.min(8, S.people) && S.waves === 0 ? ['Touch the wall', ''] : ['Now, all together', `${Math.min(3, S.waves)} of 3`] };
  if (b === 'pinya') { let full = 0; for (const f of S.fill) if (f >= 1) full++; return S.phase === 'reward' ? { line: ['The circle is closed', ''] } : { line: ['Hold the circles', `${Math.min(full, S.needWalls)} of ${S.needWalls} walls`] }; }
  if (b === 'tronc') return S.phase === 'reward' ? {} : { line: [S.balance ? 'Keep it straight: hold both sides' : 'Press on the beat', S.floors ? `${FLOOR_NAMES[S.floors - 1]} · floor ${S.floors}` : ''] };
  if (b === 'pom') return { line: ['Hold still', CLIMBERS[S.climber] || ''] };
  if (b === 'crown') return S.t > 3 && S.t < 14 ? { card: ['Crowned', acta?.castell || ''] } : {};
  if (b === 'festa') return S.t < 7 ? { card: ['The square is yours', ''] } : {};
  if (b === 'baixada') return { line: ['Stay. Bring it down', 'floor by floor'] };
  if (b === 'fall') return S.t > 2 ? { card: ['It fell', 'The embers remain'] } : {};
  return {};
}

export function createGuide({ THREE, TSL, room }) {
  const { uniform, uv, vec2, vec3, vec4, float, smoothstep, exp, length, atan, fract, step, texture, select, clamp: tclamp, max } = TSL;
  const object = new THREE.Group(); object.name = 'guide';
  const NW = room.walls.length;
  const basis = room.walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)));
  // premultiplied "over": the plate darkens what is behind, the light adds (out = src.rgb + dst·(1 − src.a))
  const over = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false };

  // ------------------------------------------------------------------ the hand icon (drawn once)
  const hcv = document.createElement('canvas'); hcv.width = hcv.height = 256;
  {
    const g = hcv.getContext('2d'), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    g.fillStyle = '#fff'; rr(84, 118, 96, 96, 30);
    [[84, 72, 62], [108, 52, 82], [132, 58, 76], [156, 78, 58]].forEach(([x, y, h]) => rr(x, y, 21, h + 20, 10.5));
    g.save(); g.translate(86, 168); g.rotate(-0.95); rr(-10, -62, 22, 70, 11); g.restore();
  }
  const handTex = new THREE.CanvasTexture(hcv); handTex.colorSpace = THREE.NoColorSpace; handTex.wrapS = handTex.wrapT = THREE.ClampToEdgeWrapping;

  // ------------------------------------------------------------------ targets: a pool of quads, each with its own uniforms
  const tgeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const targets = [];
  for (let i = 0; i < MAXT; i++) {
    const U = { vis: uniform(0), held: uniform(0), beat: uniform(0), arc: uniform(0), icon: uniform(1), soft: uniform(0) };
    const d = uv().sub(0.5).mul(HALF * 2), r = length(d), lw = float(0.018);   // ~2 cm: the ring reads from across the room (3–6 m)
    const ring = smoothstep(lw, 0, r.sub(R).abs()).mul(U.held.mul(0.5).add(0.5));
    const fill = exp(r.mul(r).negate().div(0.6 * R * R)).mul(U.held).mul(0.18);
    const bR = U.beat.mul(R);
    const beat = select(U.beat.greaterThan(0), smoothstep(lw, 0, r.sub(bR).abs()).mul(float(1).sub(smoothstep(1, 3, U.beat))).mul(0.85), float(0));
    const ang = fract(atan(d.x, d.y).div(6.2831853).add(1));
    const arc = smoothstep(lw.mul(1.8), 0, r.sub(R + 0.04).abs()).mul(step(ang, U.arc)).mul(step(0.002, U.arc));
    const huv = d.div(R * 1.5).mul(0.5).add(0.5);
    const inside = step(0, huv.x).mul(step(huv.x, 1)).mul(step(0, huv.y)).mul(step(huv.y, 1));
    const hand = texture(handTex, tclamp(huv, vec2(0), vec2(1))).a.mul(inside).mul(U.icon);
    // soft (Pinya, Tronc, baixada: the figures stand right behind the button): the halo, the fill, the icon and the dark disc drop
    // to ~30 %; the thin stroke and its progress stay
    const keep = float(1).sub(U.soft.mul(0.7));
    const light = ring.mul(0.9).add(fill.mul(keep)).add(beat).add(arc.mul(1.3)).add(hand.mul(0.42).mul(keep)).mul(U.vis);
    const shade = float(1).sub(smoothstep(R * 0.9, R * 1.7, r)).mul(0.6).mul(keep).mul(U.vis);
    const m = new THREE.MeshBasicNodeMaterial(over);
    m.colorNode = vec3(1.0, 0.9, 0.74).mul(light).mul(1.25); m.opacityNode = max(shade, 0);   // alpha through opacityNode: a vec4 colorNode's alpha did not reach the blend
    const mesh = new THREE.Mesh(tgeo, m); mesh.renderOrder = 20; mesh.visible = false;
    object.add(mesh);
    targets.push({ mesh, U, held: 0 });
  }

  // ------------------------------------------------------------------ text: two layers (card, line), each two canvases cross-fading
  const PX = 300;                                                     // texture px per metre (the room: ~261)
  function makeLayer(wM, hM, y, renderOrder, xOff = 0, align = 'center') {
    const bufs = [0, 1].map(() => {
      const cv = document.createElement('canvas'); cv.width = Math.round(wM * PX); cv.height = Math.round(hM * PX);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.premultiplyAlpha = false;
      const meshes = room.walls.map((w, wi) => {
        const U = { a: uniform(0) };
        const s = texture(tex, uv());
        const m = new THREE.MeshBasicNodeMaterial(over);
        m.colorNode = s.rgb.mul(s.a).mul(1.05).mul(U.a); m.opacityNode = s.a.mul(U.a);   // just under the bloom threshold: a glowing word lifts the dark it sits on
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), m);
        mesh.position.copy(w.centre).addScaledVector(w.right, xOff).setY(y).addScaledVector(w.normal, -0.02);
        mesh.quaternion.copy(basis[wi]); mesh.renderOrder = renderOrder; mesh.visible = false;
        object.add(mesh);
        return { mesh, U };
      });
      return { cv, g: cv.getContext('2d'), tex, meshes, key: '', a: 0 };
    });
    return { bufs, cur: 0, want: '', wantLines: null, wallA: new Float32Array(NW), wM, hM, align };
  }
const scratch = (() => { const cv = document.createElement('canvas'); cv.width = Math.round(5.6 * PX); cv.height = Math.round(1.0 * PX); return { cv, g: cv.getContext('2d') }; })();
  const card = makeLayer(5.6, 1.0, 2.15, 22), line = makeLayer(5.0, 0.72, 1.92, 21);
  // Tronc with both sides: the instruction split to either side of the tower (it stands at the wall's centre), each half over its button
  const SPLIT_GAP = 0.32, SPLIT_W = 3.0;
  const lineL = makeLayer(SPLIT_W, 0.72, 1.92, 21, -(SPLIT_GAP + SPLIT_W / 2), 'right'), lineR = makeLayer(SPLIT_W, 0.72, 1.92, 21, SPLIT_GAP + SPLIT_W / 2, 'left');

  function draw(buf, L, kind, align = 'center') {          // L = [title, small]; a soft dark plate, then the words
    const { cv, g } = buf, W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    if (!L) return;
    const big = kind === 'card' ? 0.24 : 0.15, small = kind === 'card' ? 0.1 : 0.09, track1 = kind === 'card' ? 0.2 : 0.16, track2 = kind === 'card' ? 0.08 : 0.05;
    const dy = kind === 'card' ? 0.36 : 0.24, alpha2 = kind === 'card' ? 0.85 : 0.88, plate = kind === 'card' ? 0.8 : 0.8;    // dark enough to read over the brightest universe (the festa's sand)
    const items = [{ text: L[0].toUpperCase(), size: big, track: track1, y: L[1] ? dy * 0.42 : 0, alpha: 1, weight: 400 }];
    if (L[1]) items.push({ text: L[1], size: small, track: track2, y: -dy * 0.58, alpha: alpha2, weight: 400 });
    // measure, to size the plate
    let maxW = 0;
    for (const it of items) {
      let size = it.size * PX * 1.38; g.font = `${it.weight} ${size}px ${FONT}`;
      const chars = [...it.text], tr = it.track * size;
      let tw = chars.reduce((a, ch) => a + g.measureText(ch).width + tr, -tr);
      if (tw > W * 0.86) { const k = (W * 0.86) / tw; size *= k; tw *= k; }
      it.px = size; it.tw = tw; it.chars = chars; maxW = Math.max(maxW, tw);
    }
    // the plate: an elongated soft dark ellipse (radial gradient, scaled)
    const margin = 0.06 * PX, xOf = (tw) => (align === 'right' ? W - margin - tw : align === 'left' ? margin : (W - tw) / 2);
    const pw = Math.min(W, maxW + 0.7 * PX), ph = H, pcx = align === 'right' ? W - margin - maxW / 2 : align === 'left' ? margin + maxW / 2 : W / 2;
    g.save(); g.translate(pcx, H / 2); g.scale(pw / 2, ph / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(0,0,0,${plate})`); gr.addColorStop(0.6, `rgba(0,0,0,${plate * 0.92})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
    g.textBaseline = 'middle';
    // a halo that hugs the letters: the same words in black, blurred, under the light ones (a local darkening, never a box). The black
    // words are drawn once into a scratch canvas and blurred as ONE image (a shadow per glyph cost tens of ms per change)
    const sg = scratch.g; sg.clearRect(0, 0, W, H); sg.textBaseline = 'middle'; sg.fillStyle = '#000';
    const glyphs = (ctx) => { for (const it of items) { ctx.font = `${it.weight} ${it.px}px ${FONT}`; let x = xOf(it.tw); const y = H / 2 - it.y * PX, tr = it.track * it.px; for (const ch of it.chars) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + tr; } } };
    glyphs(sg);
    const blur = items[0].px;
    g.save(); g.shadowColor = 'rgba(0,0,0,1)';
    g.shadowBlur = blur * 0.7; g.drawImage(scratch.cv, 0, 0);
    g.shadowBlur = blur * 0.3; g.drawImage(scratch.cv, 0, 0);
    g.restore();
    for (const it of items) {
      g.font = `${it.weight} ${it.px}px ${FONT}`; g.fillStyle = `rgba(255,240,222,${it.alpha})`;
      let x = xOf(it.tw); const y = H / 2 - it.y * PX, tr = it.track * it.px;
      for (const ch of it.chars) { g.fillText(ch, x, y); x += g.measureText(ch).width + tr; }
    }
  }
  // set what a layer should say (null = nothing); called every frame, cheap when nothing changed
  function want(layer, L, kind) {
    const key = L ? L[0] + '|' + (L[1] || '') : '';
    if (key === layer.want) return;
    layer.want = key; layer.wantLines = L;
  }
  function stepLayer(layer, kind, dt, wallMask, fadeIn, fadeOut, gain = 1, hold = false) {
    const A = layer.bufs[layer.cur], B = layer.bufs[1 - layer.cur];
    if (layer.want !== A.key) {
      // the current one goes; when it is (almost) gone, or empty, the new words come in on the other buffer
      if (B.key !== layer.want) { draw(B, layer.wantLines, kind, layer.align); B.tex.needsUpdate = true; B.key = layer.want; B.a = 0; }
      layer.cur = 1 - layer.cur;
    }
    const cur = layer.bufs[layer.cur], old = layer.bufs[1 - layer.cur];
    old.a = Math.max(0, old.a - dt / fadeOut);
    // one text at a time: the new words come in only once the old ones are gone (two cards never sit on each other)
    cur.a = cur.key ? (old.a < 0.04 && !hold ? Math.min(1, cur.a + dt / fadeIn) : cur.a) : Math.max(0, cur.a - dt / fadeOut);
    for (let w = 0; w < NW; w++) layer.wallA[w] = ease(layer.wallA[w], wallMask(w) ? 1 : 0, dt, 3);
    for (const buf of layer.bufs) {
      const k = buf.a * buf.a * (3 - 2 * buf.a) * gain;
      for (let w = 0; w < NW; w++) { const v = k * layer.wallA[w]; buf.meshes[w].U.a.value = v; buf.meshes[w].mesh.visible = v > 0.002; }
    }
  }

  // ------------------------------------------------------------------ per frame
  let guideA = 0, guideKey = '', nT = 0;
  const _p = new THREE.Vector3();
  const near = (hands, wi, off) => { for (const h of hands) if (h.wall === wi && Math.abs((h.u - 0.5) * room.walls[wi].width - off) < 0.55 && Math.abs(h.pos.y - HAND_Y) < 0.75) return true; return false; };
  let softNow = 0;
  function put(wi, off, vis, held, beat, arc, dt, time) {
    if (nT >= MAXT) return;
    const T = targets[nT++], w = room.walls[wi];
    T.held = ease(T.held, held ? 1 : 0, dt, held ? 12 : 3);
    _p.copy(w.centre).addScaledVector(w.right, off).setY(HAND_Y).addScaledVector(w.normal, -0.02);
    T.mesh.position.copy(_p); T.mesh.quaternion.copy(basis[wi]);
    T.U.vis.value = vis * guideA; T.U.held.value = T.held; T.U.beat.value = beat; T.U.arc.value = arc;
    T.U.icon.value = (1 - T.held * 0.75) * (0.82 + 0.18 * Math.sin(time * 1.6 + nT));
    T.U.soft.value = softNow;
    T.mesh.visible = vis * guideA > 0.004;
  }
  let structureOnly = false; const inS = [];
  function update(dt, { state: S, hands = [], time = 0, on = true, acta = null, hold = false, pace = 1 }) {
    const dtT = dt * Math.max(1, pace);   // the words' fades follow the score's clock: at a fast rehearsal pace a card still reaches full   // hold: the host's own words are still on the walls (the intro's title)
    const b = S.block, playing = S.phase !== 'title';
    const key = b + '|' + (b === 'tronc' ? +S.balance : 0) + '|' + S.buttons;
    const wantT = on && playing && (b === 'wait' || b === 'pinya' || b === 'tronc' || b === 'pom' || b === 'baixada') && !(b === 'tronc' && S.phase === 'reward');
    if (key !== guideKey) { guideA = ease(guideA, 0, dt, 8); if (guideA < 0.03) { guideKey = key; for (const T of targets) T.held = 0; } } else guideA = ease(guideA, wantT ? 1 : 0, dt, 3);
    const gb = guideKey.slice(0, guideKey.indexOf('|'));
    nT = 0;
    softNow = gb === 'pinya' || gb === 'tronc' || gb === 'baixada' ? 1 : 0;
    const walls = S.walls || [];
    for (let w = 0; w < NW; w++) {
      const sw = !!walls[w];
      if (gb === 'wait') put(w, 0, 1, S.count[w] > 0, 0, S.start, dt, time);
      else if (gb === 'pinya') { const offs = S.buttons >= 3 ? 3 : S.buttons === 2 ? 2 : 1; for (let k = 0; k < offs; k++) { const o = offs === 3 ? (k - 1) * 1.1 : offs === 2 ? (k ? 0.7 : -0.7) : 0; put(w, o, 1, near(hands, w, o), 0, S.fill[w], dt, time); } }
      else if (gb === 'tronc' && sw) { const beat = 1 + (1 - S.beat) * 2; if (S.balance) { put(w, -0.65, 1, S.left[w] && near(hands, w, -0.65), beat, S.floorProgress, dt, time); put(w, 0.65, 1, S.right[w] && near(hands, w, 0.65), beat, S.floorProgress, dt, time); } else put(w, 0, 1, S.count[w] > 0, beat, S.floorProgress, dt, time); }
      else if (gb === 'pom' && sw) put(w, 0, w === S.lightWall ? 1 : w === S.nextWall ? 0.8 : 0.4, S.count[w] > 0, 0, w === S.lightWall ? S.climb : 0, dt, time);
      else if (gb === 'baixada' && sw) put(w, 0, 1, S.count[w] > 0, 0, 0, dt, time);
    }
    for (let i = nT; i < MAXT; i++) { targets[i].mesh.visible = false; targets[i].held = 0; }

    // the words; from the Tronc on, the instructions belong to the walls that carry the castell
    const g = on ? lines(S, acta) : {};
    structureOnly = (b === 'tronc' || b === 'pom' || b === 'baixada') && S.structure > 0 && S.structure < NW;
    for (let w = 0; w < NW; w++) inS[w] = !!walls[w];
    const split = b === 'tronc' && S.balance && g.line;
    want(card, g.card || null, 'card'); want(line, split ? null : g.line || null, 'line');
    want(lineL, split ? ['Keep it straight', ''] : null, 'line'); want(lineR, split ? ['Hold both sides', g.line[1]] : null, 'line');
    stepLayer(card, 'card', dtT, () => true, 1.2, 0.8, 1, hold);
    // the wait's words thin out as the hands start the pass (gone when it starts), instead of lingering into the intro
    const startK = b === 'wait' ? 1 - Math.min(1, S.start || 0) * Math.min(1, S.start || 0) : 1;
    // and the instruction waits for the chapter's title to have gone ("III · TRONC" never sits on "PRESS ON THE BEAT")
    const cardUp = card.bufs[0].a > 0.04 || card.bufs[1].a > 0.04;
    const halfUp = lineL.bufs[0].a > 0.04 || lineL.bufs[1].a > 0.04;
    stepLayer(line, 'line', dtT, (w) => !structureOnly || inS[w], 0.6, 0.4, startK, cardUp || halfUp);
    const lineUp = line.bufs[0].a > 0.04 || line.bufs[1].a > 0.04;   // the whole line leaves before its halves come (and back)
    stepLayer(lineL, 'line', dtT, (w) => !structureOnly || inS[w], 0.6, 0.4, 1, cardUp || lineUp);
    stepLayer(lineR, 'line', dtT, (w) => !structureOnly || inS[w], 0.6, 0.4, 1, cardUp || lineUp);
  }
  function dispose() {
    tgeo.dispose(); handTex.dispose();
    for (const T of targets) T.mesh.material.dispose();
    for (const L of [card, line, lineL, lineR]) for (const b of L.bufs) { b.tex.dispose(); for (const m of b.meshes) { m.mesh.geometry.dispose(); m.mesh.material.dispose(); } }
  }
  return { object, update, dispose, targets, layers: { card, line } };
}
