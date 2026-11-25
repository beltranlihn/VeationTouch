// Ressonància — typography in 3D (T-027, ARTE-2 §5): words made of glyph-tiles on the wall planes, with motion.
//
//   import { typo } from './typo3d.js';          // the module waits for its fonts and builds its atlas once (top-level await)
//   const t = typo.text({ placements: [{ position, quaternion }, …], renderOrder });   // one mesh per placement (usually a wall)
//   t.set(items)  or  t.setFor(i, items)        // re-layout only when the words change
//   t.U.asm.value = 0..1   (assemble)   t.U.out.value = 0..1 (break)   t.U.sweep / sweepK (light sweep)   t.alpha[i] = per placement
//   const s = typo.slot({ placements, … });  s.want(key, items); s.step(dt, { gain, hold, mask(i) })   // a cross-fading line of words
//
// items: [{ text, font: 'serif' | 'italic' | 'sans', size (em, m), y (m, centre of the line's caps), track (em), alpha, color [r,g,b]
//          (linear, may exceed 1), edge (0.5 = the font's weight; higher = thinner), align ('center' | 'left' | 'right'), x (m),
//          rules (m: a hairline on each side of the words), upper }]
//
// The glyphs come from a signed-distance-field atlas built here at load from canvas (own code: two-pass Euclidean distance
// transform, Felzenszwalb & Huttenlocher — the method of tiny-sdf), so they are crisp at any size on the 7196 × 912 room and can be
// thinned or haloed in the shader. Each glyph is an instance of a 4 × 4 grid of tiles; the motion lives in the vertex shader:
//   arrive (asm 0 → 1): tiles fly in from scattered offsets in front of the wall, turning, and lock into the letter, left to right
//                       with a little chance; the tracking opens from tight to its final width; bright and iridescent in flight
//   sweep:              a band of warm light crosses the words once they stand (and again, softly, every few seconds)
//   leave (out 0 → 1):  the tiles break off, drift up and apart, turning, and thin out
//   T-048 (ARTE-3 §3): item.reveal = 'blur' — no tiles: each WORD comes from out of focus to sharp, 60 ms after the previous one
//                       (0.75 s, easeOutExpo, tracking +3 % → 0) and leaves the same way (0.5 s). The instructions and labels use it;
//                       the chapter cards keep their tiles. font 'mono' (Geist Mono) for labels and data. text({ flash: room.flash }):
//                       the words and the plate's edge catch a hand's light («la mano es una linterna»).
// Fonts (OFL, self-hosted, ./fonts/SOURCES.md): Instrument Serif (titles, italic for values), Geist (instructions), Geist Mono (labels).
// TSL node materials: WebGPU and WebGL2. Nothing is allocated per frame.
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

const { attribute, uniform, varying, texture, fwidth, vec2, vec3, vec4, float, clamp, smoothstep, fract, sin, cos, exp, max, mix, uv, step, select, positionGeometry } = TSL;

// ------------------------------------------------------------------------------------------------ fonts
const FAM = { serif: 'RessSerif', italic: 'RessSerifItalic', sans: 'RessGeist', mono: 'RessGeistMono' };
const FALLBACK = { serif: 'Georgia, "Times New Roman", serif', italic: 'Georgia, serif', sans: 'Geist, "Segoe UI", system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, Menlo, monospace' };
const FILES = [['RessSerif', 'InstrumentSerif-Regular.ttf'], ['RessSerifItalic', 'InstrumentSerif-Italic.ttf'], ['RessGeist', 'geist-400.woff2'], ['RessGeistMono', 'geistmono-400.woff2']];
await Promise.all(FILES.map(async ([name, file]) => {
  try {
    const f = new FontFace(name, `url("${new URL('./fonts/' + file, import.meta.url).href}")`);
    await f.load(); document.fonts.add(f);
  } catch (err) { console.info(`typo3d: font ${file} not loaded (${err.message}); a system font stands in`); }
}));
const fontOf = (font) => `${F}px ${FAM[font] || FAM.sans}, ${FALLBACK[font] || FALLBACK.sans}`;

// ------------------------------------------------------------------------------------------------ the SDF atlas
const F = 64, BUF = 8, RAD = 8, AW = 2048, INF = 1e20;
const CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'ÀÁÈÉÍÏÒÓÚÜÑÇàáèéíïòóúüñç·—–«»¡¿’‘“”…×ŀĿ';
const RULE = '─';                                            // a hairline, stretched to any width
function edt1d(f, d, v, z, n) {
  v[0] = 0; z[0] = -INF; z[1] = INF; let k = 0;
  for (let q = 1; q < n; q++) {
    let s;
    do { const r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (2 * q - 2 * r); } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
const T1 = { f: new Float64Array(512), d: new Float64Array(512), v: new Int32Array(512), z: new Float64Array(513) };
function edt2d(g, w, h) {
  const { f, d, v, z } = T1;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1d(f, d, v, z, h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1d(f, d, v, z, w); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
}
const scv = document.createElement('canvas'); scv.width = scv.height = 256;
const sg = scv.getContext('2d', { willReadFrequently: true });
const mcv = document.createElement('canvas').getContext('2d');   // measuring (kerning)
const glyphs = new Map(), cells = [];
function rasterise(font, ch) {
  const key = font + ':' + ch;
  let adv, L, R, A, D;
  sg.font = fontOf(font);
  if (ch === RULE) { adv = F; L = 0; R = F; A = Math.round(F * 0.3); D = -Math.round(F * 0.3) + 3; }
  else { const m = sg.measureText(ch); adv = m.width; L = Math.ceil(m.actualBoundingBoxLeft); R = Math.ceil(m.actualBoundingBoxRight); A = Math.ceil(m.actualBoundingBoxAscent); D = Math.ceil(m.actualBoundingBoxDescent); }
  const gw = L + R, gh = A + D;
  if (ch === ' ' || gw <= 0 || gh <= 0) { glyphs.set(key, { adv, w: 0 }); return; }
  const w = gw + 2 * BUF, h = gh + 2 * BUF;
  sg.clearRect(0, 0, w, h); sg.fillStyle = '#fff'; sg.textBaseline = 'alphabetic';
  if (ch === RULE) sg.fillRect(BUF, BUF, F, 3); else sg.fillText(ch, BUF + L, BUF + A);
  const img = sg.getImageData(0, 0, w, h).data;
  const n = w * h, outer = new Float64Array(n), inner = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = img[i * 4 + 3] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; } else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const o = Math.max(0, 0.5 - a), q = Math.max(0, a - 0.5); outer[i] = o * o; inner[i] = q * q; }
  }
  edt2d(outer, w, h); edt2d(inner, w, h);
  const sdf = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const dd = outer[i] - inner[i]; sdf[i] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - dd / (2 * RAD)))); }
  const g = { adv, w, h, L, A, x: 0, y: 0 };
  glyphs.set(key, g); cells.push({ g, sdf });
}
for (const font of ['serif', 'italic', 'sans', 'mono']) for (const ch of CHARS) rasterise(font, ch);
rasterise('sans', RULE);
// shelf packing
cells.sort((a, b) => b.g.h - a.g.h);
let px = 0, py = 0, rowH = 0;
for (const { g } of cells) { if (px + g.w > AW) { px = 0; py += rowH + 1; rowH = 0; } g.x = px; g.y = py; px += g.w + 1; rowH = Math.max(rowH, g.h); }
const AH = Math.ceil((py + rowH + 1) / 64) * 64;
const adata = new Uint8Array(AW * AH * 4);
for (const { g, sdf } of cells) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const o = ((g.y + y) * AW + g.x + x) * 4; const v = sdf[y * g.w + x]; adata[o] = v; adata[o + 1] = v; adata[o + 2] = v; adata[o + 3] = 255; }
const atlas = new THREE.DataTexture(adata, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType);
atlas.colorSpace = THREE.NoColorSpace; atlas.magFilter = THREE.LinearFilter; atlas.minFilter = THREE.LinearMipmapLinearFilter;
atlas.generateMipmaps = true; atlas.flipY = false; atlas.needsUpdate = true;

const kernCache = new Map();
function kern(font, a, b) {
  if (a === RULE || b === RULE || a === ' ' || b === ' ') return 0;
  const k = font + a + b; let v = kernCache.get(k);
  if (v === undefined) { mcv.font = fontOf(font); v = mcv.measureText(a + b).width - mcv.measureText(a).width - mcv.measureText(b).width; if (Math.abs(v) < 0.05) v = 0; kernCache.set(k, v); }
  return v;
}
const glyph = (font, ch) => glyphs.get(font + ':' + ch) || glyphs.get(font + ':' + ch.normalize('NFD')[0]) || glyphs.get(font + ':?');

// ------------------------------------------------------------------------------------------------ layout
const REC = 16, STAGGER = 0.035, GLYPH_IN = 0.9, WORD = 0.06, BLUR_IN = 0.75;   // T-048: blur → sharp, 60 ms between words, each in 0.75 s          // 35 ms between letters, each one lands in 0.9 s (easeOutExpo)                                                   // floats per glyph record
const recs = new Float32Array(400 * REC);                         // scratch (layout is not per frame)
/** Lays items out; fills `recs`; returns { n, minX, maxX, minY, maxY }. */
function layout(items) {
  let n = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, word = 0;
  items.forEach((it, li) => {
    if (!it || (!it.text && !it.rules)) return;
    const font = it.font || 'sans', s = it.size / F, tr = (it.track || 0) * F;
    const text = it.upper ? it.text.toUpperCase() : (it.text || '');
    const seq = [];
    if (it.rules) seq.push(RULE, ' ', ' ');
    for (const ch of text) seq.push(ch);
    if (it.rules) seq.push(' ', ' ', RULE);
    // advances (px)
    const xs = []; let pen = 0, prev = null;
    for (const ch of seq) {
      const g = ch === RULE ? glyphs.get('sans:' + RULE) : glyph(font, ch);
      if (prev) pen += kern(font, prev, ch) + tr;
      xs.push(pen);
      pen += ch === RULE ? it.rules / s : g ? g.adv : F * 0.3;
      prev = ch;
    }
    const width = pen * s, cx0 = it.x || 0;
    const left = it.align === 'left' ? cx0 : it.align === 'right' ? cx0 - width : cx0 - width / 2, lineC = left + width / 2;
    const base = (it.y || 0) - it.size * 0.34;                    // y = the centre of the caps (cap height ≈ 0.68 em)
    const col = it.color || [1, 0.95, 0.88], blur = it.reveal === 'blur';
    let prevSp = true;
    seq.forEach((ch, i) => {
      const isRule = ch === RULE, g = isRule ? glyphs.get('sans:' + RULE) : glyph(font, ch);
      const sp = ch === ' ' || isRule; if (!sp && prevSp) word++; prevSp = sp;   // words counted across the block's lines
      if (!g || !g.w || n >= 400) return;
      const sx = isRule ? it.rules / F : s, sy = s;
      const wM = g.w * sx, hM = g.h * sy;
      const lx = left + xs[i] * s - (isRule ? BUF * sx : (g.L + BUF) * s);
      const top = base + (g.A + BUF) * sy;
      const cx = lx + wM / 2, cy = top - hM / 2, o = n * REC;
      recs[o] = cx; recs[o + 1] = cy; recs[o + 2] = wM; recs[o + 3] = hM;
      recs[o + 4] = g.x / AW; recs[o + 5] = g.y / AH; recs[o + 6] = g.w / AW; recs[o + 7] = g.h / AH;
      const kind = isRule ? 2 : blur ? 3 : it.rise ? 1 : 0;   // 0 tiles fly in · 1 rises from behind its baseline · 2 a hairline drawn from the centre out · 3 blur → sharp, word by word (T-048)
      recs[o + 8] = li; recs[o + 9] = blur ? (Math.max(0, word - 1) * WORD + (it.delay || 0)) / STAGGER : n + (it.delay || 0) / STAGGER; recs[o + 10] = cx - lineC; recs[o + 11] = Math.min(0.999, it.alpha ?? 1) + kind * 10;
      recs[o + 12] = col[0]; recs[o + 13] = col[1]; recs[o + 14] = col[2]; recs[o + 15] = it.edge ?? 0.5;
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx + wM); minY = Math.min(minY, cy - hM / 2); maxY = Math.max(maxY, cy + hM / 2);
      n++;
    });
  });
  // order: left to right across the block, a little by line
  const span = Math.max(1e-3, maxX - minX), nl = Math.max(1, items.length);
  for (let i = 0; i < n; i++) { const o = i * REC; recs[o + 8] = ((recs[o] - minX) / span) * 0.85 + (recs[o + 8] / nl) * 0.15; }
  let last = 0; for (let i = 0; i < n; i++) last = Math.max(last, recs[i * REC + 9]);
  return { n, minX, maxX, minY, maxY, dur: last * STAGGER + GLYPH_IN + 0.15 };   // (blur glyphs land in BLUR_IN < GLYPH_IN: the same bound holds)
}

// ------------------------------------------------------------------------------------------------ the glyph-tile geometry
const TILES = 4;
const tilePos = [], tileT = [];
for (let ty = 0; ty < TILES; ty++) for (let tx = 0; tx < TILES; tx++) {
  const x0 = tx / TILES, x1 = (tx + 1) / TILES, y0 = ty / TILES, y1 = (ty + 1) / TILES, r = fract1((tx * 7 + ty * 13) * 0.6180339 + 0.17);
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]) { tilePos.push(x, y, 0); tileT.push((tx + 0.5) / TILES, (ty + 0.5) / TILES, r); }
}
function fract1(v) { return v - Math.floor(v); }
const tilePosAttr = new THREE.Float32BufferAttribute(tilePos, 3), tileTAttr = new THREE.Float32BufferAttribute(tileT, 3);

// premultiplied "over": the halo darkens what is behind, the light adds (out = src.rgb + dst·(1 − src.a))
export const OVER = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false };
const uTime = uniform(0);
const hash = (x) => fract(sin(x.mul(12.9898).add(4.1414)).mul(43758.5453));
const rot2 = (v, a) => vec2(v.x.mul(cos(a)).sub(v.y.mul(sin(a))), v.x.mul(sin(a)).add(v.y.mul(cos(a))));

function makeMaterial(U, a, lag, flash) {
  const G = attribute('aG', 'vec4'), Uv = attribute('aU', 'vec4'), M = attribute('aM', 'vec4'), C = attribute('aC', 'vec4'), T = attribute('aT', 'vec3');
  const pg = positionGeometry, wh = G.zw, order = M.x, idx = M.y, lineOff = M.z, tr = T.z;
  const kind = M.w.div(10).floor(), alpha = M.w.sub(kind.mul(10)), tiles = select(kind.lessThan(0.5), float(1), float(0));
  const rise = select(kind.sub(1).abs().lessThan(0.5), float(1), float(0)), rule = select(kind.sub(2).abs().lessThan(0.5), float(1), float(0));
  const blurK = select(kind.greaterThan(2.5), float(1), float(0));   // T-048: words that come into focus (no motion of their own)
  const seed = fract(idx.mul(0.6180339).add(0.17));
  const h1 = hash(seed.mul(91.7).add(tr.mul(17.3))), h2 = hash(seed.mul(37.1).add(tr.mul(53.9)).add(3.0)), h3 = hash(seed.mul(13.3).add(tr.mul(71.1)).add(7.0));
  // arrive (U.asm 0..1 over U.dur s): each letter 35 ms after the previous, its tiles a little scattered, in 0.9 s, easeOutExpo
  const ts = U.asm.mul(U.dur).sub(lag).sub(idx.mul(STAGGER)).sub(tr.mul(0.12).mul(tiles));
  const kin = clamp(ts.div(select(rule.greaterThan(0.5), float(0.6), select(blurK.greaterThan(0.5), float(BLUR_IN), float(GLYPH_IN)))), 0, 1);
  const e = float(1).sub(exp(kin.mul(-6.93))).div(0.999).min(1.0), ie = float(1).sub(e);
  // leave (0.5 s): tiles break off, drift up and apart
  const kout = clamp(U.out.mul(1.5).sub(order.mul(0.3).add(tr.mul(0.2))), 0, 1), eo = kout.mul(kout).mul(float(1).sub(blurK));
  const bo = clamp(U.out.mul(1.6).sub(order.mul(0.25)), 0, 1).mul(blurK);   // blur words leave the same way they came: out of focus
  const spread = wh.y.mul(U.spread).mul(tiles);
  const tileC = T.xy.sub(0.5).mul(wh), rel = pg.xy.sub(T.xy).mul(wh);
  const spin = ie.mul(h3.sub(0.5).mul(5.0)).mul(tiles).add(eo.mul(h1.sub(0.5).mul(7.0)));
  const sc = mix(float(0.25), float(1), e.max(float(1).sub(tiles))).mul(float(1).sub(eo.mul(0.75)));
  const offIn = vec2(h1.sub(0.5).mul(1.6), h2.sub(0.5).mul(1.1)).mul(spread).mul(ie);
  const offOut = vec2(h1.sub(0.5).mul(0.7), h2.mul(1.2).add(0.5)).mul(wh.y.mul(U.spread)).mul(eo);
  const open = lineOff.mul(select(blurK.greaterThan(0.5), float(0.03), float(0.12))).mul(ie).mul(float(1).sub(rule));   // tracking +12 % closing to 0 (blur: +3 %)
  let xy = G.xy.add(vec2(open, 0)).add(tileC.mul(mix(float(1.25), float(1), e.max(float(1).sub(tiles))))).add(rot2(rel.mul(sc), spin)).add(offIn).add(offOut);
  // the value rises from behind its own baseline; the hairline grows from its inner end (the card's centre) outwards
  xy = xy.sub(vec2(0, wh.y.mul(ie).mul(rise)));
  const pivot = G.x.sub(lineOff.sign().mul(wh.x).mul(0.5));
  xy = vec2(mix(xy.x, pivot.add(xy.x.sub(pivot).mul(e)), rule), xy.y);
  const z = ie.mul(U.depth).mul(h2.add(0.4)).mul(tiles).add(eo.mul(U.depth).mul(h3.mul(0.8).add(0.2)));
  const vis = mix(clamp(kin.mul(8.0), 0, 1).max(rule.mul(step(0.0001, kin))).mul(float(1).sub(smoothstep(0.55, 1.0, kout))),
    smoothstep(0.0, 0.55, kin).mul(float(1).sub(smoothstep(0.2, 1.0, bo))), blurK);
  const blurAmt = ie.max(bo).mul(blurK).mul(0.32);                            // SDF units: ~10 px of the 64 px glyph at the start, 0 when it stands
  const m = new THREE.MeshBasicNodeMaterial(OVER);
  m.positionNode = vec3(xy, z);
  const vUV = varying(vec2(Uv.x.add(pg.x.mul(Uv.z)), Uv.y.add(float(1).sub(pg.y).mul(Uv.w))));
  const vVis = varying(vis.mul(alpha)), vFl = varying(e.mul(ie).mul(4.0).mul(tiles).add(eo.mul(float(1).sub(eo)).mul(2.4))), vOrd = varying(order);
  const vCol = varying(C.xyz), vEdge = varying(C.w), vBlur = varying(blurAmt);
  const vMask = varying(xy.y.sub(G.y.sub(wh.y.mul(0.5))).mul(rise).add(float(1).sub(rise)));   // > 0 above the baseline mask
  const d = texture(atlas, vUV).r;
  const aa = max(fwidth(d).mul(0.75), float(0.004)).add(vBlur);
  const ink = smoothstep(vEdge.sub(aa), vEdge.add(aa), d).mul(step(0.0, vMask)).mul(float(1).sub(vBlur.mul(1.4)));   // out of focus: wider and fainter
  const halo = smoothstep(0.25, vEdge, d).mul(U.halo).mul(step(0.0, vMask));
  // the one luxury: a thin-film sweep across the words as they stand (and the iridescence of the tiles in flight)
  const sw = vOrd.sub(U.sweep), glow = exp(sw.mul(sw).mul(-260.0)).mul(U.sweepK);
  const iri = vec3(0.5).add(vec3(0.5).mul(cos(vec3(0.0, 0.33, 0.67).add(vOrd.mul(0.8)).add(uTime.mul(0.12)).mul(6.2831853))));
  // T-048: «la mano es una linterna» — the words brighten a little near a hand (room.flash), never past the bloom threshold
  const lamp = flash ? flash(TSL.positionWorld).mul(0.22) : float(0);
  const col = vCol.mul(lamp.add(1)).add(iri.mul(glow).mul(0.45)).add(iri.mul(vFl).mul(0.9));
  m.colorNode = col.mul(ink).mul(vVis).mul(a);
  m.opacityNode = max(ink, halo).mul(vVis).mul(a);
  return m;
}
// the soft dark plate under a block of words (legibility over a bright universe, never a box)
const PLATE_F = 0.8;   // T-069: the plate's feather (m)
function makePlate(U, a, flash) {
  const m = new THREE.MeshBasicNodeMaterial(OVER);
  const q = uv().sub(0.5).mul(2.0), r = q.x.mul(q.x).add(q.y.mul(q.y));
  // T-069 (ART: it read as a black rectangle): a rounded box round the words feathered over 0.8 m (metres from its size), ≤ 50 %
  const sz = uniform(new THREE.Vector2(1, 1)), pmm = uv().sub(0.5).mul(sz), hi = sz.mul(0.5).sub(PLATE_F);
  const dq = TSL.max(TSL.abs(pmm).sub(hi), 0), dPl = TSL.length(dq), fea = float(1).sub(smoothstep(0, PLATE_F, dPl));
  const k = clamp(U.asm.mul(1.6), 0, 1).mul(float(1).sub(clamp(U.out.mul(1.4), 0, 1)));
  // T-048: the plate's soft edge catches a hand's light (gradient-border-flashlight): a faint warm band near r ≈ 0.75, only near a hand
  const lamp = flash ? flash(TSL.positionWorld) : float(0);
  const band = exp(r.sub(0.72).mul(r.sub(0.72)).mul(-60.0));
  const op = fea.mul(fea).mul(TSL.min(U.plate, 0.5)).mul(k).mul(a);
  m.colorNode = U.lamp.mul(band.mul(lamp).mul(0.05)).mul(k).mul(a).add(U.plateCol.mul(op));   // T-059: plateCol (0 = the dark plate; a cream = a pale veil on a light ground)
  m.opacityNode = op; m.userData.sz = sz;
  return m;
}

function text({ placements, renderOrder = 20, max = 160, spread = 2.0, depth = 0.3, halo = 0.4, plate = 0.45, flash = null } = {}) {
  const U = { dur: uniform(1.5), asm: uniform(0), out: uniform(0), sweep: uniform(-1), sweepK: uniform(0), spread: uniform(spread), depth: uniform(depth), halo: uniform(halo), plate: uniform(plate),
    lamp: uniform(new THREE.Vector3(1, 0.86, 0.66)), plateCol: uniform(new THREE.Vector3(0, 0, 0)) };   // T-048: the colour a hand's light gives the plate's edge (the chapter's accent)
  const plateGeo = new THREE.PlaneGeometry(1, 1);
  const P = placements.map((pl) => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', tilePosAttr); geo.setAttribute('aT', tileTAttr);
    const arr = { aG: new Float32Array(max * 4), aU: new Float32Array(max * 4), aM: new Float32Array(max * 4), aC: new Float32Array(max * 4) };
    for (const k in arr) { const at = new THREE.InstancedBufferAttribute(arr[k], 4); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at); }
    geo.instanceCount = 0;
    const a = uniform(0), lag = uniform(0);   // lag: this placement's words start that many seconds later (the tile wave)
    const mesh = new THREE.Mesh(geo, makeMaterial(U, a, lag, flash));
    mesh.frustumCulled = false; mesh.renderOrder = renderOrder; mesh.visible = false;
    mesh.position.copy(pl.position); mesh.quaternion.copy(pl.quaternion);
    const pm = new THREE.Mesh(plateGeo, makePlate(U, a, flash));
    pm.frustumCulled = false; pm.renderOrder = renderOrder - 1; pm.visible = false;
    pm.position.copy(pl.position); pm.quaternion.copy(pl.quaternion);
    return { mesh, plate: pm, geo, arr, a, lag, n: 0 };
  });
  const object = new THREE.Group();
  for (const p of P) object.add(p.plate, p.mesh);
  const alpha = new Float32Array(P.length), lags = new Float32Array(P.length);
  function fill(p, L) {
    const { aG, aU, aM, aC } = p.arr;
    for (let i = 0; i < L.n; i++) {
      const o = i * REC, j = i * 4;
      aG[j] = recs[o]; aG[j + 1] = recs[o + 1]; aG[j + 2] = recs[o + 2]; aG[j + 3] = recs[o + 3];
      aU[j] = recs[o + 4]; aU[j + 1] = recs[o + 5]; aU[j + 2] = recs[o + 6]; aU[j + 3] = recs[o + 7];
      aM[j] = recs[o + 8]; aM[j + 1] = recs[o + 9]; aM[j + 2] = recs[o + 10]; aM[j + 3] = recs[o + 11];
      aC[j] = recs[o + 12]; aC[j + 1] = recs[o + 13]; aC[j + 2] = recs[o + 14]; aC[j + 3] = recs[o + 15];
    }
    for (const k of ['aG', 'aU', 'aM', 'aC']) p.geo.getAttribute(k).needsUpdate = true;
    p.geo.instanceCount = p.n = Math.min(L.n, max);
    // the plate: an ellipse a little larger than the words
    if (L.n) {
      const w = L.maxX - L.minX, h = L.maxY - L.minY;
      const pw = w + 0.2 + 2 * PLATE_F, ph = h + 0.16 + 2 * PLATE_F;                // T-069: the words' box + 0.8 m of feather each side
      p.plate.scale.set(pw, ph, 1); p.plate.material.userData.sz.value.set(pw, ph);
      p.plate.position.copy(p.mesh.position);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.mesh.quaternion);
      p.plate.position.addScaledVector(right, (L.minX + L.maxX) / 2).y += (L.minY + L.maxY) / 2;
    }
  }
  return {
    object, U, alpha, lags, P,
    get dur() { return U.dur.value; },
    set(items) { const L = layout(items || []); for (const p of P) fill(p, L); U.dur.value = Math.max(0.5, L.dur); },
    setFor(i, items) { const L = layout(items || []); fill(P[i], L); U.dur.value = Math.max(U.dur.value, L.dur); },
    /** apply the per-placement alphas (× gain) and hide what is gone */
    apply(gain = 1) {
      const live = U.asm.value > 0.001 && U.out.value < 0.999;
      for (let i = 0; i < P.length; i++) { const v = alpha[i] * gain; P[i].a.value = v; P[i].lag.value = lags[i]; const on = live && v > 0.002 && P[i].n > 0; P[i].mesh.visible = on; P[i].plate.visible = on && U.plate.value > 0; }
    },
    dispose() { plateGeo.dispose(); for (const p of P) { p.geo.dispose(); p.mesh.material.dispose(); p.plate.material.dispose(); } },
  };
}

/** A line of words that changes: the old words break, then the new ones assemble (never two on top of each other). */
function slot({ placements, outDur = 0.5, ...opt } = {}) {
  const T = [text({ placements, ...opt }), text({ placements, ...opt })];
  const object = new THREE.Group(); object.add(T[0].object, T[1].object);
  const st = T.map(() => ({ key: '', asm: 0, out: 0, since: 0 }));
  const wallA = new Float32Array(placements.length), lagS = new Float32Array(placements.length), held = new Uint8Array(placements.length);
  let cur = 0, wantKey = '', wantItems = null, gainNow = 1;
  return {
    object, texts: T,
    want(key, items) { if (key !== wantKey) { wantKey = key; wantItems = items; } },
    get up() { return st[0].asm * (1 - st[0].out) > 0.04 || st[1].asm * (1 - st[1].out) > 0.04; },
    // gate(i): may the new words start on placement i yet? (the host's tile wave has passed that wall). A wall held back starts
    // 0.3 s after its gate opens; the others are not delayed.
    step(dt, { gain = 1, hold = false, mask = null, gate = null } = {}) {
      const c = st[cur];
      if (c.key !== wantKey) {
        if (c.key && c.out < 1) c.out = Math.min(1, c.out + dt / outDur);
        if (!c.key || c.out >= 1 || c.asm < 0.02) {
          c.key = ''; c.asm = 0; c.out = 0;
          cur = 1 - cur; const nx = st[cur];
          nx.key = wantKey; nx.asm = 0; nx.out = 0; nx.since = 0;
          if (wantKey) T[cur].set(wantItems);
          lagS.fill(0); held.fill(0);
        }
      }
      const n = st[cur];
      let maxLag = 0;
      if (n.key && !hold) {
        for (let w = 0; w < lagS.length; w++) {
          if (held[w] !== 2) { if (gate && !gate(w)) { held[w] = 1; lagS[w] += dt; } else if (held[w] === 1) { lagS[w] += 0.3; held[w] = 2; } else if (n.asm * T[cur].dur > lagS[w]) held[w] = 2; }
          maxLag = Math.max(maxLag, lagS[w]);
        }
        n.asm = Math.min(1 + maxLag / T[cur].dur, n.asm + dt / T[cur].dur); if (n.asm > 0.7) n.since += dt;
      }
      T[cur].lags.set(lagS);
      gainNow += (gain - gainNow) * (1 - Math.exp(-dt * 2.5));
      for (let w = 0; w < wallA.length; w++) wallA[w] += ((mask ? (mask(w) ? 1 : 0) : 1) - wallA[w]) * (1 - Math.exp(-dt * 3));
      for (let i = 0; i < 2; i++) {
        const s = st[i], t = T[i];
        t.U.asm.value = s.asm; t.U.out.value = i === cur ? s.out : Math.max(s.out, s.key ? 0 : 1);
        // the sweep: once as the words stand, then softly every 9 s
        const sw = i === cur ? s.since : 0, cyc = sw < 2 ? sw : (sw - 2) % 9;
        t.U.sweep.value = -0.25 + cyc * 0.8; t.U.sweepK.value = sw < 2 ? 1 : 0.45;
        for (let w = 0; w < wallA.length; w++) t.alpha[w] = wallA[w];
        t.apply(gainNow);
      }
    },
    dispose() { T[0].dispose(); T[1].dispose(); },
  };
}

/** Placements on the room's walls: centred on each wall at height y, `back` m behind the wall plane, offset x along it. */
function onWalls(room, y, x = 0, back = 0.02) {
  return room.walls.map((w) => ({
    position: w.centre.clone().addScaledVector(w.right, x).setY(y).addScaledVector(w.normal, -back),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)),
  }));
}

export const typo = { text, slot, onWalls, atlas, setTime: (t) => { uTime.value = t; }, size: [AW, AH], glyphs: glyphs.size };
