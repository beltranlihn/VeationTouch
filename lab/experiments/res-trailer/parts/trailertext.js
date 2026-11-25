// Ressonància trailer — part "trailertext" (contract: ../../ressonancia/PARTS.md): the presentation layer. Title, the written trailer,
// the work's data, the closing line, credits and logos, ON the walls, in Vicente's 3D type (../../ressonancia/scenes3d/typo3d.js): every
// line assembles from glyph-tiles (the trencadís) and breaks into tiles when it goes.
//
// Clock: input.t = the trailer's clock (s); input.segments = [[block, start], …] from the host (wait, intro, brasa, festa, end).
//   the square (45 s):    presenters → «Ressonància» + subtitle → four lines, one per wall
//   the correfoc (53 s):  the written trailer, wall after wall → the work's data, two sets of four
//   the resonance (62 s): the closing line on every wall → credits, one per wall → logos and support
// Texts: TEXT[lang] below (es by default, en, ca). Everything that is a fact to confirm (names, roles, dates) is in CREDITS / DATA.
import { typo } from '../../ressonancia/scenes3d/typo3d.js';

const INK = [0.78, 0.75, 0.70], SOFT = [0.70, 0.67, 0.62], GOLD = [0.95, 0.80, 0.52];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const TEXT = {
  es: {
    presents: ['Barcelona XR Lab  ×  Alma Digital Studio', 'presentan'],
    title: 'Ressonància', subtitle: 'una obra inmersiva e interactiva sobre los castells',
    four: ['Un castell no lo levanta nadie solo.', 'Lo levantan cientos de manos.', 'Fuerza, equilibrio, valor y seny.', 'Esta vez, el castell sois vosotros.'],
    trailer: ['Diez minutos. Cuatro muros. Un solo cuerpo.', 'Vuestras manos encienden el fuego del correfoc,', 'levantan la pinya y sostienen el tronc,', 'callan para que suba el pom de dalt, y coronan.'],
    data: [[['Duración', '10 minutos'], ['Público', 'de 2 a 15 personas'], ['Sala', '4 muros · 360 grados'], ['Interacción', 'las manos sobre el muro']],
           [['Sonido', 'voz y música en 4.1'], ['Tecnología', 'VEATION Touch · LiDAR'], ['Lugar', 'Barcelona XR Lab'], ['Lema', 'Força, equilibri, valor i seny']]],
    closing: ['Cuando los cuerpos resuenan juntos,', 'nace la cultura.'],
    credits: [['Una obra de', 'Vicente Manzano'], ['Dirección creativa', 'Alma Digital Studio'], ['Producción', 'Barcelona XR Lab'], ['Tecnología interactiva', 'VEATION Touch']],
    support: 'Con el apoyo de la Generalitat de Catalunya',
  },
  en: {
    presents: ['Barcelona XR Lab  ×  Alma Digital Studio', 'present'],
    title: 'Ressonància', subtitle: 'an immersive, interactive work about the castells',
    four: ['No one raises a castell alone.', 'Hundreds of hands raise it.', 'Strength, balance, courage and good sense.', 'This time, you are the castell.'],
    trailer: ['Ten minutes. Four walls. One body.', 'Your hands light the fire of the correfoc,', 'raise the pinya and hold the tronc,', 'fall silent so the pom de dalt can climb, and crown it.'],
    data: [[['Length', '10 minutes'], ['Audience', '2 to 15 people'], ['Room', '4 walls · 360 degrees'], ['Interaction', 'hands on the wall']],
           [['Sound', 'voice and music in 4.1'], ['Technology', 'VEATION Touch · LiDAR'], ['Venue', 'Barcelona XR Lab'], ['Motto', 'Força, equilibri, valor i seny']]],
    closing: ['When bodies resonate together,', 'culture is born.'],
    credits: [['A work by', 'Vicente Manzano'], ['Creative direction', 'Alma Digital Studio'], ['Production', 'Barcelona XR Lab'], ['Interactive technology', 'VEATION Touch']],
    support: 'With the support of the Generalitat de Catalunya',
  },
  ca: {
    presents: ['Barcelona XR Lab  ×  Alma Digital Studio', 'presenten'],
    title: 'Ressonància', subtitle: 'una obra immersiva i interactiva sobre els castells',
    four: ['Un castell no l’aixeca ningú sol.', 'L’aixequen centenars de mans.', 'Força, equilibri, valor i seny.', 'Aquest cop, el castell sou vosaltres.'],
    trailer: ['Deu minuts. Quatre murs. Un sol cos.', 'Les vostres mans encenen el foc del correfoc,', 'aixequen la pinya i sostenen el tronc,', 'callen perquè pugi el pom de dalt, i coronen.'],
    data: [[['Durada', '10 minuts'], ['Públic', 'de 2 a 15 persones'], ['Sala', '4 murs · 360 graus'], ['Interacció', 'les mans sobre el mur']],
           [['So', 'veu i música en 4.1'], ['Tecnologia', 'VEATION Touch · LiDAR'], ['Lloc', 'Barcelona XR Lab'], ['Lema', 'Força, equilibri, valor i seny']]],
    closing: ['Quan els cossos ressonen junts,', 'neix la cultura.'],
    credits: [['Una obra de', 'Vicente Manzano'], ['Direcció creativa', 'Alma Digital Studio'], ['Producció', 'Barcelona XR Lab'], ['Tecnologia interactiva', 'VEATION Touch']],
    support: 'Amb el suport de la Generalitat de Catalunya',
  },
};

// a logo image → a white-on-transparent CanvasTexture, cropped to its ink. `cut`: rectangles (fractions) to clear first.
async function logoTexture(THREE, url, { invert = false, cut = [] } = {}) {
  const img = new Image(); img.src = url; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  for (const [x0, y0, x1, y1] of cut) g.clearRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
  const d = g.getImageData(0, 0, W, H), p = d.data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const lum = (p[i] + p[i + 1] + p[i + 2]) / 765;
    const a = (p[i + 3] / 255) * (invert ? 1 - lum : lum);          // white ink on transparent (a black logo: its darkness is the ink)
    p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = Math.round(a * 255);
    if (a > 0.1) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  g.putImageData(d, 0, 0);
  const pad = 4, cw = Math.max(1, maxX - minX + 1 + pad * 2), ch = Math.max(1, maxY - minY + 1 + pad * 2);
  const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(c, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
  const tex = new THREE.CanvasTexture(o); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: cw / ch };
}

export function create({ THREE, room }) {
  const object = new THREE.Group(); object.name = 'trailertext';
  const NW = room.walls.length;
  const one = (y, opts = {}) => room.walls.map((w, i) => typo.text({ placements: [typo.onWalls(room, y)[i]], renderOrder: 10, plate: 0.42, spread: 2.1, depth: 0.4, ...opts }));
  const all = (y, opts = {}) => typo.text({ placements: typo.onWalls(room, y), renderOrder: 10, plate: 0.42, spread: 2.1, depth: 0.42, ...opts });
  const L = {};
  // the square
  L.presents = all(1.9, { plate: 0.3 });
  L.title = all(2.05, { plate: 0.38, depth: 0.45 });
  L.subtitle = all(1.45, { plate: 0.3 });
  L.four = one(1.75);
  // the correfoc
  L.trailer = one(1.8, { plate: 0.5 });
  L.data = [one(1.7, { plate: 0.5 }), one(1.7, { plate: 0.5 })];
  // the resonance (bright gold behind: darker plates)
  L.closing = all(1.85, { plate: 0.62 });
  L.credits = one(1.75, { plate: 0.62 });
  L.support = all(0.95, { plate: 0.55 });
  const texts = [L.presents, L.title, L.subtitle, ...L.four, ...L.trailer, ...L.data[0], ...L.data[1], L.closing, ...L.credits, L.support];
  for (const t of texts) { t.alpha.fill(1); object.add(t.object); }

  let lang = '';
  function layout(code) {
    const T = TEXT[code] || TEXT.es; lang = code;
    L.presents.set([{ text: T.presents[0], font: 'mono', size: 0.11, y: 0.12, track: 0.32, color: INK, upper: true, reveal: 'blur' }, { text: T.presents[1], font: 'italic', size: 0.16, y: -0.18, track: 0.02, color: SOFT, reveal: 'blur' }]);
    L.title.set([{ text: T.title, font: 'serif', size: 0.78, y: 0, track: 0.02, color: INK }]);
    L.subtitle.set([{ text: T.subtitle, font: 'italic', size: 0.2, y: 0, track: 0.01, color: SOFT, reveal: 'blur' }]);
    L.four.forEach((t, i) => t.set([{ text: T.four[i % T.four.length], font: 'serif', size: 0.27, y: 0, track: 0.01, color: INK }]));
    L.trailer.forEach((t, i) => t.set([{ text: T.trailer[i % T.trailer.length], font: 'serif', size: 0.24, y: 0, track: 0.01, color: INK }]));
    L.data.forEach((set, k) => set.forEach((t, i) => { const [lab, val] = T.data[k][i % 4]; t.set([{ text: lab, font: 'mono', size: 0.09, y: 0.3, track: 0.36, color: SOFT, upper: true, reveal: 'blur', rules: 0.35 }, { text: val, font: 'serif', size: 0.3, y: -0.02, track: 0.01, color: INK }]); }));
    L.closing.set([{ text: T.closing[0], font: 'serif', size: 0.34, y: 0.22, track: 0.01, color: INK }, { text: T.closing[1], font: 'italic', size: 0.42, y: -0.28, track: 0.01, color: GOLD }]);
    L.credits.forEach((t, i) => { const [lab, val] = T.credits[i % 4]; t.set([{ text: lab, font: 'mono', size: 0.09, y: 0.3, track: 0.36, color: SOFT, upper: true, reveal: 'blur' }, { text: val, font: 'serif', size: 0.34, y: -0.02, track: 0.01, color: INK }]); });
    L.support.set([{ text: T.support, font: 'mono', size: 0.1, y: 0, track: 0.3, color: SOFT, upper: true, reveal: 'blur' }]);
  }
  layout('es');

  // ---- logos: one pair per wall (Alma Digital Studio · Barcelona XR Lab), white, on the wall plane
  const logos = [];
  const logoMats = [];
  const place = (mesh, i, x, y) => { const pl = typo.onWalls(room, y, x)[i]; mesh.position.copy(pl.position); mesh.quaternion.copy(pl.quaternion); };
  (async () => {
    try {
      const [alma, xr] = await Promise.all([
        logoTexture(THREE, new URL('../assets/alma-digital-white.png', import.meta.url).href),
        // the lab's logo as delivered carries a «PALO ALTO» line (its sister lab): cleared here, bottom right
        logoTexture(THREE, new URL('../assets/barcelona-xr-lab-black.png', import.meta.url).href, { invert: true, cut: [[0.62, 0.55, 1, 1]] }),
      ]);
      for (const [lg, h, x] of [[alma, 0.3, -1.4], [xr, 0.42, 1.4]]) {
        const mat = new THREE.MeshBasicMaterial({ map: lg.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, color: new THREE.Color(...INK) });
        logoMats.push(mat);
        const geo = new THREE.PlaneGeometry(h * lg.aspect, h);
        room.walls.forEach((w, i) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = 11; m.frustumCulled = false; place(m, i, x, 1.55); m.visible = false; object.add(m); logos.push(m); });
      }
    } catch (err) { console.info('trailertext: logos skipped (' + err.message + ')'); }
  })();

  // a text's life on the clock: assemble from s, stand, break from e; the light sweep crosses once it stands
  function drive(txt, t, s, e, outDur = 0.8, gain = 1) {
    txt.U.asm.value = clamp01((t - s) / txt.dur); txt.U.out.value = clamp01((t - e) / outDur);
    const since = t - s - txt.dur * 0.8; txt.U.sweep.value = -0.25 + since * 0.8; txt.U.sweepK.value = since > 0 && since < 2.5 ? 1 : 0;
    txt.apply(t >= s - 0.05 && t < e + outDur + 0.1 ? gain : 0);
  }
  return {
    object,
    update(dt, input) {
      const t = input.t, SG = input.segments || [];
      if (input.lang && input.lang !== lang) layout(input.lang);
      typo.setTime(input.time ?? t);
      const at = (b) => (SG.find((x) => x[0] === b) || [b, 1e9])[1];
      const s1 = at('intro'), s2 = at('brasa'), s3 = at('festa'), s4 = at('end');
      const g = 1 - clamp01((input.leave ?? 0) * 3);                // leaving the room: everything gone fast
      // the square
      drive(L.presents, t, s1 + 3, s1 + 9.5, 0.8, g);
      drive(L.title, t, s1 + 11, s1 + 26, 1.2, g);
      drive(L.subtitle, t, s1 + 14, s1 + 26, 0.8, g);
      L.four.forEach((x, i) => drive(x, t, s1 + 28 + i * 1.6, s1 + 42, 0.9, g));
      // the correfoc
      L.trailer.forEach((x, i) => drive(x, t, s2 + 5 + i * 3.5, s2 + 23, 0.9, g));
      L.data[0].forEach((x, i) => drive(x, t, s2 + 25 + i * 0.8, s2 + 36.5, 0.8, g));
      L.data[1].forEach((x, i) => drive(x, t, s2 + 38 + i * 0.8, s2 + 50, 0.8, g));
      // the resonance
      drive(L.closing, t, s3 + 6, s3 + 23, 1.0, g);
      L.credits.forEach((x, i) => drive(x, t, s3 + 25 + i * 1.2, s3 + 44, 0.8, g));
      // logos and support: fade in s3+46, out by s4-2
      const la = clamp01((t - (s3 + 46)) / 2.5) * (1 - clamp01((t - (s4 - 4.5)) / 2)) * g;
      for (const m of logoMats) m.opacity = la * 0.92;
      for (const m of logos) m.visible = la > 0.002;
      drive(L.support, t, s3 + 48, s4 - 4.5, 1.2, g);
    },
    dispose() { for (const t of texts) t.dispose(); for (const m of logoMats) { m.map?.dispose(); m.dispose(); } },
  };
}
