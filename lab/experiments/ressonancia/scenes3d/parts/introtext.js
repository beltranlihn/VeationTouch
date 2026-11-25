// Ressonància — part "introtext" (contract: ../PARTS.md): the intro's words ON the walls, in 3D type (../typo3d.js, T-027).
// One text per wall, 2 cm behind the wall plane, so the words sit exactly on the wall for every visitor. Each word ASSEMBLES from
// glyph-tiles that fly in and lock (tracking opening, a light sweep) and BREAKS into tiles that drift up when it goes.
// Timeline on input.t (the intro, 70 s): 53–64 the motto, one wall after another, 2 s apart (Fuerza · Equilibrio · Valor · Seny, the
// Catalan under each); 63.8–79 «Ressonància» on every wall (the host sends t = 76 → 79 as it leaves). No «put your hands on the wall» here: nothing
// counts until the Brasa (analysis #7), and the Brasa says it.
// 25-11: the Catalan word in the card's italic on its hairlines (the work's one type system), no plates.
import { typo } from '../typo3d.js';

const MOTTO = [['Fuerza', 'força'], ['Equilibrio', 'equilibri'], ['Valor', 'valor'], ['Seny', 'seny']];
const INK = [0.76, 0.73, 0.68], SOFT = [0.76, 0.73, 0.68];   // bone #F2EEE6 at 92 %, under the bloom's threshold: no neon
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function create({ THREE, room }) {
  const object = new THREE.Group(); object.name = 'introtext';
  const walls = typo.onWalls(room, 2.0);
  const motto = room.walls.map((w, i) => {
    const t = typo.text({ placements: [walls[i]], renderOrder: 10, plate: 0, spread: 2.2, depth: 0.4 });
    const [es, ca] = MOTTO[i % MOTTO.length];
    t.set([{ text: es, font: 'serif', size: 0.5, y: 0.1, track: 0.01, color: INK }, { text: ca, font: 'italic', size: 0.17, y: -0.3, track: 0.02, alpha: 0.85, color: SOFT, rules: 0.4, rise: true }]);
    t.alpha[0] = 1; object.add(t.object);
    return t;
  });
  const title = typo.text({ placements: typo.onWalls(room, 2.05), renderOrder: 10, plate: 0, spread: 2.0, depth: 0.45 });
  title.set([{ text: 'Ressonància', font: 'serif', size: 0.68, y: 0.14, track: 0.02, color: INK }]);
  title.alpha.fill(1); object.add(title.object);
  // a word's life on the intro's clock: assemble from s (35 ms a letter, 0.9 s each), stand, break from e; the sweep crosses once it stands
  function drive(t, txt, s, e, outDur = 0.6) {
    const inDur = txt.dur;
    txt.U.asm.value = clamp01((t - s) / inDur); txt.U.out.value = clamp01((t - e) / outDur);
    const since = t - s - inDur * 0.8; txt.U.sweep.value = -0.25 + since * 0.8; txt.U.sweepK.value = since > 0 && since < 2.5 ? 1 : 0;
    txt.apply(1);
  }
  return {
    object,
    update(dt, input) {
      const t = input.t;
      typo.setTime(input.time ?? t);
      motto.forEach((m, i) => { const s = 53 + i * 2; drive(t, m, s, s + 3.6); });
      drive(t, title, 63.8, 76, 1.2);
    },
    dispose() { for (const m of motto) m.dispose(); title.dispose(); },
  };
}
