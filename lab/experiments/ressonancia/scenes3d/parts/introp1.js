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
  const { uniform, texture, uv, float, clamp } = TSL;
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

  // one material for every piece: alpha and a wipe (x from the right end = from the label towards the castell, or y from the bottom)
  const pieces = [];
  function piece(tex, wm, hm, { wipe = null, order = 0, tint = INK } = {}) {
    const U = { a: uniform(0), rev: uniform(1) };
    const t = texture(tex), st = uv();
    const coord = wipe === 'x' ? float(1).sub(st.x) : wipe === 'y' ? st.y : null;
    const rv = coord ? clamp(U.rev.mul(1.04).sub(coord).div(0.04), 0, 1) : float(1);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    m.colorNode = t.rgb.mul(tint); m.opacityNode = t.a.mul(U.a).mul(rv);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), m);
    mesh.renderOrder = 60 + order; mesh.frustumCulled = false; mesh.visible = false;
    const p = { mesh, U, wm, hm }; pieces.push(p); return p;
  }
  const place = (p, w, x, y) => { board(w).add(p.mesh); p.mesh.position.set(x, y, 0); };
  const set = (p, a, rev = 1) => { p.U.a.value = a; p.U.rev.value = rev; p.mesh.visible = a > 0.002 && rev > 0.001; };
  function canvasTex(wm, hm) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(wm * PPM); cv.height = Math.ceil(hm * PPM);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return { cv, g: cv.getContext('2d'), tex };
  }
  function imageTex(url) { const t = new THREE.TextureLoader().load(new URL(url, import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

  // ---- the two titles (his pictures, 1 : 1 to the strip)
  const stack = piece(imageTex('./introp1/title-stacked.png'), 527 / PXM_X, 290 / PXM_Y, { order: 2 });
  const horiz = piece(imageTex('./umbral3d/title.png'), 1036 / PXM_X, 237 / PXM_Y, { order: 2 });

  // ---- the stages: per stage a line (wiped from its right end towards the castell) and its name above the right end
  const TXT_H = 0.16, LINE_H = 0.03, SW = DEF.listW + 0.02;
  const stages = NAMES.map((name) => {
    const line = canvasTex(SW, LINE_H), txt = canvasTex(SW, TXT_H);
    return { name, line, txt, L: piece(line.tex, SW, LINE_H, { wipe: 'x', order: 4 }), T: piece(txt.tex, SW, TXT_H, { order: 5 }), on: 0 };
  });
  let frame = null;                               // the trailer's frame (drawn when the layout is known)

  let fontReady = false;
  const font = new FontFace('IP1 Serif Roman', `url(${new URL('../fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`);
  font.load().then((f) => { try { document.fonts.add(f); } catch { /* lab */ } }).catch(() => {}).finally(() => { fontReady = true; drawStages(); });

  // ---- configuration (live): beats, positions
  const C = { title: 0, list: 0, stages: [0, 0, 0, 0, 0], preview: 0, close: 0, reach: 3, stack: {}, horiz: {}, listWall: 'P1', listX: 0, ys: [0, 0, 0, 0, 0], size: DEF.size, frameAlpha: 0 };
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
  }
  let layoutKey = '', drawnSize = -1;
  function layout() {                             // only when a position changes (the operator / the director tuning it)
    const key = `${C.stack.wall}|${C.stack.x}|${C.stack.y}|${C.horiz.wall}|${C.horiz.x}|${C.horiz.y}|${C.listWall}|${C.listX}|${C.ys.join(',')}|${C.reach}`;
    if (C.size !== drawnSize && fontReady) drawStages();
    if (key === layoutKey) return; layoutKey = key;
    place(stack, wallOf(C.stack.wall, 1), C.stack.x, C.stack.y);
    place(horiz, wallOf(C.horiz.wall, 3), C.horiz.x, C.horiz.y);
    const lw = wallOf(C.listWall, 1), cx = C.listX + SW / 2 - 0.01;
    stages.forEach((s, i) => { place(s.L, lw, cx, C.ys[i]); place(s.T, lw, cx, C.ys[i] + TXT_H / 2 + 0.012); });
    drawFrame(lw);
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
      t.fillText(s.name, (0.01 + DEF.listW - 0.022) * PPM, TH - 0.006 * PPM);   // its right end just inside the line's, a little above it
      s.txt.tex.needsUpdate = true;
    }
  }
  function drawFrame(lw) {                        // round the stages this trailer climbs (his art: from above the top one's name to under the lowest line)
    if (frame) { frame.mesh.parent?.remove(frame.mesh); frame.mesh.geometry.dispose(); frame.mesh.material.dispose(); frame.tex.dispose(); pieces.splice(pieces.indexOf(frame), 1); frame = null; }
    if (C.reach < 1) return;
    const top = C.ys[C.reach - 1] + 0.297, bot = C.ys[0] - 0.078, x0 = C.listX - 0.065, x1 = C.listX + DEF.listW + 0.111;
    const wm = x1 - x0, hm = top - bot, R = 0.085, c = canvasTex(wm, hm);
    c.g.fillStyle = '#fff'; c.g.beginPath(); c.g.roundRect(0, 0, wm * PPM, hm * PPM, R * PPM); c.g.fill(); c.tex.needsUpdate = true;
    frame = piece(c.tex, wm, hm, { wipe: 'y', order: 3, tint: 1 }); frame.tex = c.tex;
    board(lw).add(frame.mesh); frame.mesh.position.set((x0 + x1) / 2, (top + bot) / 2, -0.001);
  }
  readCfg(); layout();

  return {
    object,
    setParams() { readCfg(); layout(); },
    update(dt, input) {
      readCfg(); layout();
      const t = input.t ?? 0, master = (input.arrive ?? 1) * (1 - (input.leave ?? 0)) * (1 - ease((t - C.close) / 3));
      // the two titles: an elegant fade at «Welcome»
      const ti = ease((t - C.title) / 2.2);
      set(stack, master * ti); set(horiz, master * ti);
      // the stages: the lines draw in one after another from the bottom (dim); each lights with its name when the voice says it;
      // in the trailer state the ones not climbed go down
      const pv = ease((t - C.preview) / 1.2);
      stages.forEach((s, i) => {
        const named = t >= C.stages[i] ? 1 : 0;
        s.on += (named - s.on) * Math.min(1, dt * 4);
        const out = i >= C.reach ? 1 - 0.62 * pv : 1;
        set(s.L, master * out * (0.32 + 0.58 * s.on), ease((t - C.list - i * 0.22) / 0.9));
        set(s.T, master * out * ease((t - C.stages[i]) / 0.6));
      });
      if (frame) set(frame, master * C.frameAlpha * pv, ease((t - C.preview) / 1.0));
    },
    dispose() { for (const p of pieces) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); } },
  };
}
