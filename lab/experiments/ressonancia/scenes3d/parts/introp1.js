// Ressonància — part "introp1" (contract: ../PARTS.md): the trailer intro's 2D layer, to Beltrán's art (studio 26-11, «BaseIntro2/3»:
// Resonnancia Asset/Prev). The 3D castells of particles and the square of points are other parts; this one only draws on two walls:
//   P1 (the wall that explains), left of the central castell: the STACKED title (./introp1/title-stacked.png, his «Titulo Horizontal»:
//     «Ressonància / el castell que aixequem junts» over the three logos and their labels);
//   P1, right of the central castell: the STAGES — five thin horizontal lines, each with its name small above its right end, at the
//     height of the castell it names (CORREFOC at the bottom … L'ALETA at the top); each lights when the voice names it;
//   P3 (the back wall): the HORIZONTAL title, the entrance's own (./umbral3d/title.png), at mid height;
//   the trailer state: a rounded, translucent grey FRAME round the stages this trailer climbs; the others dim.
// Everything sits ON the wall planes (1.2 cm towards the public; the walls' cameras map it 1 : 1 to the strip), one canvas texture per
// piece drawn once (the words when the font is in), the motion in uniforms only. Unlit white at ~0.8, under the bloom's threshold.
//
// Clock: input.t (the intro block's seconds; the recorded English voice). Positions are metres ON each wall: x from the wall's LEFT
// edge, y from the floor (x measured on his art, the strip at 261 px/m across and 912 px = 3.75 m up; the stages' heights on the trailer's castell).
//   params.introp1 = { beats: { title, list, stages: [5], preview, close }, reach, stack: { wall, x, y }, title: { wall, x, y },
//                      list: { wall, x, ys: [5, bottom → top], size }, frame: { alpha } }
//   or the study's flat keys 'introp1.title' … (see res-3d-study/parts/introp1.json).
// The closing (block 'acta'): params.mode = 'outro', params.outroDur (s), input.t from 0; params.introp1.outro = { line, thanks, gone,
//   lineAt: { wall, x, y }, thanksAt: { wall, x, y } } (flat: 'introp1.outroLine', 'outroThanks', 'outroGone', 'outroX/Y', 'thanksX/Y').
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

const PPM = 512;                                 // canvas px per metre (the strip has ~261: 2× for clean lines and type)
const PXM_X = 261, PXM_Y = 912 / 3.75;           // the art's own scale (pictures drawn 1 : 1 to the strip)
const LW = 2 / 261;                              // a line: 2 strip px, as in the art
const INK = 0.8;                                 // white under the bloom's threshold (0.88 haloed the big title)
const NAMES = ['CORREFOC', 'PINYA', 'TRONC', 'POM DE DALT', 'L’ALETA'];   // bottom → top
// the recorded voice (v-trl-*.mp3, s from the intro block's start): «Welcome» 17; the stages line 28.5, each floor on its phrase
// (pauses in v-trl-stages.mp3: «fire» 0.9, «then the pinya» 3.7, «the tronc» 6.3, «the pom de dalt» 8.5, «and l'aleta» 10.9);
// «Tonight, in this trailer» 43.5; «Put your hands on the wall» 50.5; the correfoc at 55
const DEF = {
  title: 17, list: 28.5, stages: [29.4, 32.2, 34.8, 37.0, 39.4], preview: 43.5, close: 50.5, reach: 3,
  stack: { wall: 'P1', x: 1.32, y: 1.896 }, horiz: { wall: 'P3', x: 3.272, y: 1.865 },
  // the lines' heights: the middle of each part of the trailer's explaining castell (castells3d 146219a: embers 0.36–0.87 m, pinya 0.9–1.24,
  // tronc 1.25–2.65, pom de dalt 2.65–3.1, enxaneta 3.1–3.72); l'aleta capped at 3.15 so its name stays under the subtitles (from 3.245 m)
  listWall: 'P1', listX: 4.471, listW: 1.04, ys: [0.55, 1.0, 1.95, 2.85, 3.15], size: 0.1,
  frameAlpha: 0.035,   // the frame: his ~25 % grey over the dark; in the trailer's exposure 0.07 read as a light grey box (director 26-11)
};

export function create({ THREE, TSL, room, params = {} }) {
  const { uniform, texture, uv, float, clamp, vec2, vec3, exp } = TSL;
  const object = new THREE.Group(); object.name = 'introp1';
  const up = new THREE.Vector3(0, 1, 0);
  const wallOf = (id, fallback) => room.walls.find((q) => q.id === id) || room.walls[fallback] || room.walls[0];
  const boards = new Map();
  function board(w) {                             // a wall's own frame: x from its LEFT edge, y from the floor
    if (boards.has(w)) return boards.get(w);
    const b = new THREE.Group();
    b.position.copy(w.centre).addScaledVector(w.normal, 0.012).addScaledVector(w.right, -w.width / 2);
    b.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, up, w.normal));
    object.add(b); boards.set(w, b); return b;
  }

  // one ORGANIC material for every piece (studio 26-11, Beltrán: «todo lo que suceda con textos y líneas, que sea animado, orgánico»):
  // a soft front travels along the piece (`wipe`: 'x' left → right, 'xr' right → left, 'y' bottom → up; within [l, r] of it), and where
  // it passes every spot comes IN out of focus and from a little below, and settles sharp — letters resolve one after another, a line
  // grows with a feathered tip. `out` runs the same front again: the spot blurs, drifts up and thins away. `gp`/`gk`: a glint that
  // travels along the piece (a line, when its stage is named). The pieces are white: the colour is constant, the shape is the alpha.
  const pieces = [];
  function piece(tex, wm, hm, { wipe = null, soft = 0.35, blur = 0.02, riseIn = 0.025, riseOut = 0.06, order = 0, tint = INK, glint = false } = {}) {
    const U = { a: uniform(0), rev: uniform(1), out: uniform(0), l: uniform(0), r: uniform(1), gp: uniform(-2), gk: uniform(0) };
    const st = uv();
    const c0 = wipe === 'x' ? st.x : wipe === 'xr' ? float(1).sub(st.x) : wipe === 'y' ? st.y : float(0.5);
    const c = clamp(c0.sub(U.l).div(U.r.sub(U.l).max(1e-3)), 0, 1);
    const front = (k) => { const v = clamp(k.mul(1 + soft).sub(c).div(soft), 0, 1); return v.mul(v).mul(float(3).sub(v.mul(2))); };
    const kin = front(U.rev), kout = front(U.out);
    const fog = clamp(float(1).sub(kin).add(kout), 0, 1);                       // 0 = sharp, 1 = out of focus
    const dy = kout.mul(riseOut).sub(float(1).sub(kin).mul(riseIn)).div(hm);   // comes up from below, leaves upwards
    const su = vec2(st.x, st.y.sub(dy));
    // out of focus: two rings of 8 taps (the inner one turned half a step) — a soft disc, not doubled copies
    const rx = fog.mul(blur / wm), ry = fog.mul(blur / hm);
    const tap = (ox, oy) => texture(tex, vec2(su.x.add(ox), su.y.add(oy))).a;
    let A = tap(0, 0).mul(2);
    for (let k = 0; k < 8; k++) {
      const a1 = (k / 8) * Math.PI * 2, a2 = a1 + Math.PI / 8;
      A = A.add(tap(rx.mul(Math.cos(a1)), ry.mul(Math.sin(a1)))).add(tap(rx.mul(0.5 * Math.cos(a2)), ry.mul(0.5 * Math.sin(a2))).mul(1.5));
    }
    A = A.div(2 + 8 + 12);
    let col = vec3(tint, tint, tint);
    if (glint) col = col.add(exp(c0.sub(U.gp).div(0.045).pow(2).negate()).mul(U.gk).mul(0.5));   // a brighter bead running along the line
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    m.colorNode = col; m.opacityNode = A.mul(U.a).mul(kin).mul(float(1).sub(kout));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), m);
    mesh.renderOrder = 60 + order; mesh.frustumCulled = false; mesh.visible = false;
    const p = { mesh, U, wm, hm }; pieces.push(p); return p;
  }
  const place = (p, w, x, y) => { board(w).add(p.mesh); p.mesh.position.set(x, y, 0); };
  const set = (p, a, rev = 1, out = 0) => { p.U.a.value = a; p.U.rev.value = rev; p.U.out.value = out; p.mesh.visible = a > 0.002 && rev > 0.001 && out < 0.999; };
  const easeOut = (v) => { v = clamp01(v); return 1 - (1 - v) * (1 - v) * (1 - v); };
  function canvasTex(wm, hm) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(wm * PPM); cv.height = Math.ceil(hm * PPM);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return { cv, g: cv.getContext('2d'), tex };
  }
  function imageTex(url) { const t = new THREE.TextureLoader().load(new URL(url, import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

  // ---- the two titles (his pictures, 1 : 1 to the strip)
  // (they resolve from out of focus left → right, slowly, rising a few cm; they leave upwards)
  const TITLE = { wipe: 'x', soft: 0.7, blur: 0.04, riseIn: 0.035, riseOut: 0.09, order: 2 };
  const stack = piece(imageTex('./introp1/title-stacked.png'), 527 / PXM_X, 290 / PXM_Y, TITLE);
  const horiz = piece(imageTex('./umbral3d/title.png'), 1036 / PXM_X, 237 / PXM_Y, TITLE);

  // ---- the stages: per stage a line (wiped from its right end towards the castell) and its name above the right end
  const TXT_H = 0.16, LINE_H = 0.03, SW = DEF.listW + 0.02;
  const stages = NAMES.map((name) => {
    const line = canvasTex(SW, LINE_H), txt = canvasTex(SW, TXT_H);
    return { name, line, txt, on: 0,
      L: piece(line.tex, SW, LINE_H, { wipe: 'xr', soft: 0.22, blur: 0.01, riseIn: 0, riseOut: 0.05, order: 4, glint: true }),   // grows from its name towards the castell, a feathered tip
      T: piece(txt.tex, SW, TXT_H, { wipe: 'x', soft: 0.55, blur: 0.022, riseIn: 0.022, riseOut: 0.06, order: 5 }) };   // letters resolve one after another
  });
  let frame = null;                               // the trailer's frame (drawn when the layout is known)

  // ---- THE CLOSING (studio 26-11, Beltrán: «on one wall the line, and on another something like "Thank you for joining
  // Ressonància"», not big: inside the square, like the intro's stages). params.mode = 'outro' (the host, block 'acta'), its own clock
  // from 0, params.outroDur s long: P1 «When bodies resonate together, / culture is born.» (the second line in italic, as in the old
  // card) at the stacked title's subtitle scale, centred on P1's window; P3 «Thank you for joining Ressonància», one line, smaller.
  const OUT = { size: 0.15, gap: 0.2, thanks: 0.105, W: 3.8, H: 0.26, TW: 3.2, TH: 0.2 };
  const OUTRO_P = { wipe: 'x', soft: 0.6, blur: 0.035, riseIn: 0.03, riseOut: 0.08 };
  const outro = [
    { text: 'When bodies resonate together,', italic: false, size: OUT.size, c: canvasTex(OUT.W, OUT.H) },
    { text: 'culture is born.', italic: true, size: OUT.size, c: canvasTex(OUT.W, OUT.H) },
    { text: 'Thank you for joining Ressonància', italic: false, size: OUT.thanks, c: canvasTex(OUT.TW, OUT.TH) },
  ].map((o) => ({ ...o, p: piece(o.c.tex, o.c.cv.width / PPM, o.c.cv.height / PPM, { ...OUTRO_P, order: 6 }) }));
  function drawOutro() {
    for (const o of outro) {
      const g = o.c.g, W = o.c.cv.width, H = o.c.cv.height; g.clearRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '0px';
      g.font = `${o.italic ? 'italic ' : ''}${Math.round(o.size * PPM)}px "${o.italic ? 'IP1 Serif Italic' : 'IP1 Serif Roman'}", Georgia, serif`;
      g.fillText(o.text, W / 2, H / 2); const tw = g.measureText(o.text).width;
      o.p.U.l.value = Math.max(0, (W - tw) / 2 / W - 0.01); o.p.U.r.value = Math.min(1, (W + tw) / 2 / W + 0.01);   // the front runs over the words only
      o.c.tex.needsUpdate = true;
    }
  }

  let fontReady = false;
  const fonts = [new FontFace('IP1 Serif Roman', `url(${new URL('../fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`),
    new FontFace('IP1 Serif Italic', `url(${new URL('../fonts/InstrumentSerif-Italic.ttf', import.meta.url).href})`)];
  Promise.all(fonts.map((f) => f.load().then((ff) => { try { document.fonts.add(ff); } catch { /* lab */ } }).catch(() => {}))).then(() => { fontReady = true; drawStages(); drawOutro(); });

  // ---- configuration (live): beats, positions
  const C = { title: 0, list: 0, stages: [0, 0, 0, 0, 0], preview: 0, close: 0, reach: 3, stack: {}, horiz: {}, listWall: 'P1', listX: 0, ys: [0, 0, 0, 0, 0], size: DEF.size, frameAlpha: 0,
    outro: false, outroDur: 18, outroLine: 4, outroThanks: 7, line: {}, thanks: {} };
  function readCfg() {
    const o = params.introp1 || {}, b = o.beats || {};
    const q = (k, d) => { const v = params['introp1.' + k]; return v !== undefined && v !== null && v !== '' && Number.isFinite(+v) ? +v : d; };
    C.title = b.title ?? q('title', DEF.title); C.list = b.list ?? q('list', DEF.list);
    const st = Array.isArray(b.stages) ? b.stages : null;
    for (let i = 0; i < 5; i++) C.stages[i] = st ? (st[i] ?? st[st.length - 1] + 2.5 * (i - st.length + 1)) : q('s' + (i + 1), DEF.stages[i]);
    C.preview = b.preview ?? q('preview', DEF.preview); C.close = b.close ?? q('close', DEF.close);
    C.reach = Math.max(0, Math.min(5, Math.round(o.reach ?? q('reach', DEF.reach))));
    C.stack.wall = o.stack?.wall ?? DEF.stack.wall; C.stack.x = o.stack?.x ?? q('stackX', DEF.stack.x); C.stack.y = o.stack?.y ?? q('stackY', DEF.stack.y);
    C.horiz.wall = o.title?.wall ?? DEF.horiz.wall; C.horiz.x = o.title?.x ?? q('titleX', DEF.horiz.x); C.horiz.y = o.title?.y ?? q('titleY', DEF.horiz.y);
    C.listWall = o.list?.wall ?? DEF.listWall; C.listX = o.list?.x ?? q('listX', DEF.listX);
    for (let i = 0; i < 5; i++) C.ys[i] = o.list?.ys?.[i] ?? q('y' + (i + 1), DEF.ys[i]);
    C.size = o.list?.size ?? q('size', DEF.size); C.frameAlpha = o.frame?.alpha ?? q('frameAlpha', DEF.frameAlpha);
    const ob = o.outro || {};
    C.outro = (params.mode ?? params['introp1.mode']) === 'outro'; C.outroDur = +(params.outroDur ?? q('outroDur', 18)) || 18;
    C.outroLine = ob.line ?? q('outroLine', 4); C.outroThanks = ob.thanks ?? q('outroThanks', 7); C.outroGone = ob.gone ?? q('outroGone', null);
    C.line.wall = ob.lineAt?.wall ?? 'P1'; C.line.x = ob.lineAt?.x ?? q('outroX', NaN); C.line.y = ob.lineAt?.y ?? q('outroY', 1.88);
    C.thanks.wall = ob.thanksAt?.wall ?? 'P3'; C.thanks.x = ob.thanksAt?.x ?? q('thanksX', NaN); C.thanks.y = ob.thanksAt?.y ?? q('thanksY', 1.87);
  }
  let layoutKey = '', drawnSize = -1;
  function layout() {                             // only when a position changes (the operator / the director tuning it)
    const key = `${C.stack.wall}|${C.stack.x}|${C.stack.y}|${C.horiz.wall}|${C.horiz.x}|${C.horiz.y}|${C.listWall}|${C.listX}|${C.ys.join(',')}|${C.reach}|${C.line.wall}|${C.line.x}|${C.line.y}|${C.thanks.wall}|${C.thanks.x}|${C.thanks.y}`;
    if (C.size !== drawnSize && fontReady) drawStages();
    if (key === layoutKey) return; layoutKey = key;
    place(stack, wallOf(C.stack.wall, 1), C.stack.x, C.stack.y);
    place(horiz, wallOf(C.horiz.wall, 3), C.horiz.x, C.horiz.y);
    const lw = wallOf(C.listWall, 1), cx = C.listX + SW / 2 - 0.01;
    stages.forEach((s, i) => { place(s.L, lw, cx, C.ys[i]); place(s.T, lw, cx, C.ys[i] + TXT_H / 2 + 0.012); });
    drawFrame(lw);
    // the closing: P1's line centred on the mosaic's wide window (3.28 m of 6.48 on the art), P3's thanks on its wall's centre
    const w1 = wallOf(C.line.wall, 1), x1 = Number.isFinite(C.line.x) ? C.line.x : 3.2817 * (w1.width / 6.483);
    place(outro[0].p, w1, x1, C.line.y + OUT.gap / 2); place(outro[1].p, w1, x1, C.line.y - OUT.gap / 2);
    const w3 = wallOf(C.thanks.wall, 3); place(outro[2].p, w3, Number.isFinite(C.thanks.x) ? C.thanks.x : w3.width / 2, C.thanks.y);
  }
  function drawStages() {
    drawnSize = C.size;
    for (const s of stages) {
      const g = s.line.g, W = s.line.cv.width, H = s.line.cv.height; g.clearRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.fillRect(0.01 * PPM, H / 2 - (LW * PPM) / 2, DEF.listW * PPM, LW * PPM); s.line.tex.needsUpdate = true;
      if (!fontReady) continue;
      const t = s.txt.g, TW = s.txt.cv.width, TH = s.txt.cv.height; t.clearRect(0, 0, TW, TH);
      t.fillStyle = '#fff'; t.textAlign = 'right'; t.textBaseline = 'alphabetic';
      t.font = `${Math.round(C.size * PPM)}px "IP1 Serif Roman", Georgia, serif`; t.letterSpacing = `${(0.02 * C.size * PPM).toFixed(1)}px`;
      const rx = (0.01 + DEF.listW - 0.022) * PPM; t.fillText(s.name, rx, TH - 0.006 * PPM);   // its right end just inside the line's, a little above it
      const tw = t.measureText(s.name).width; s.T.U.l.value = Math.max(0, (rx - tw) / TW - 0.01); s.T.U.r.value = Math.min(1, rx / TW + 0.01);   // the front runs over the word only
      s.txt.tex.needsUpdate = true;
    }
  }
  function drawFrame(lw) {                        // round the stages this trailer climbs (his art: from above the top one's name to under the lowest line)
    if (frame) { frame.mesh.parent?.remove(frame.mesh); frame.mesh.geometry.dispose(); frame.mesh.material.dispose(); frame.tex.dispose(); pieces.splice(pieces.indexOf(frame), 1); frame = null; }
    if (C.reach < 1) return;
    const top = C.ys[C.reach - 1] + 0.297, bot = C.ys[0] - 0.078, x0 = C.listX - 0.065, x1 = C.listX + DEF.listW + 0.111;
    const wm = x1 - x0, hm = top - bot, R = 0.085, c = canvasTex(wm, hm);
    c.g.fillStyle = '#fff'; c.g.beginPath(); c.g.roundRect(0, 0, wm * PPM, hm * PPM, R * PPM); c.g.fill(); c.tex.needsUpdate = true;
    frame = piece(c.tex, wm, hm, { wipe: 'y', soft: 0.8, blur: 0.07, riseIn: 0.05, riseOut: 0.08, order: 3, tint: 1 }); frame.tex = c.tex;   // rises like a mist
    board(lw).add(frame.mesh); frame.mesh.position.set((x0 + x1) / 2, (top + bot) / 2, -0.001);
  }
  readCfg(); layout();

  return {
    object,
    setParams() { readCfg(); layout(); },
    update(dt, input) {
      readCfg(); layout();
      const t = input.t ?? 0, time = input.time ?? t, master = (input.arrive ?? 1) * (1 - (input.leave ?? 0));
      if (C.outro) {                                                          // the closing: only its words (the intro's pieces stay hidden)
        for (const p of pieces) set(p, 0);
        const goneBy = C.outroGone ?? C.outroDur - 3, end = (d) => clamp01((t - (goneBy - 2.7) - d) / 2.2);   // all gone by outroDur − 3; then the square alone, then black
        set(outro[0].p, master, clamp01((t - C.outroLine) / 3.0), end(0));
        set(outro[1].p, master, clamp01((t - C.outroLine - 0.9) / 3.0), end(0.25));
        set(outro[2].p, master * 0.9, clamp01((t - C.outroThanks) / 3.0), end(0.5));
        return;
      }
      for (const o of outro) set(o.p, 0);
      const outOf = (d) => clamp01((t - C.close - d) / 2.4);                  // the exit: every piece blurs, drifts up and thins, in turn
      // the two titles resolve at «Welcome» (P1 first, P3 half a second later: the room turns to it)
      set(stack, master, clamp01((t - C.title) / 3.0), outOf(0.6));
      set(horiz, master, clamp01((t - C.title - 0.5) / 3.0), outOf(0.9));
      // the stages: the lines grow one after another from the bottom (dim, breathing); each brightens with a bead of light running
      // along it towards the castell, and its name resolves, when the voice says it; in the trailer state the ones not climbed recede
      const pv = ease((t - C.preview) / 1.6);
      stages.forEach((s, i) => {
        const named = t >= C.stages[i] ? 1 : 0;
        s.on += (named - s.on) * Math.min(1, dt * 2.2);
        const recede = i >= C.reach ? 1 - 0.62 * pv : 1, breath = 0.94 + 0.06 * Math.sin(time * 0.7 + i * 1.7);
        set(s.L, master * recede * breath * (0.3 + 0.6 * s.on), easeOut((t - C.list - i * 0.28) / 1.7), outOf(i * 0.12));
        const g = (t - C.stages[i]) / 1.4; s.L.U.gp.value = -0.1 + g * 1.25; s.L.U.gk.value = g > 0 && g < 1 ? Math.sin(Math.PI * g) : 0;
        set(s.T, master * recede, clamp01((t - C.stages[i] - 0.1) / 1.3), outOf(0.1 + i * 0.12));
      });
      if (frame) set(frame, master * C.frameAlpha, clamp01((t - C.preview) / 2.2), outOf(0.3));
    },
    dispose() { for (const p of pieces) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); } },
  };
}
