// Ressonància — part "introtext" (contract: ../PARTS.md): the intro's words ON the walls, in 3D.
// One plane per wall, just behind the wall plane, so the text sits exactly on the wall for every visitor. Words drawn once into
// canvas textures (twice the wall's pixel density), additive, warm white, bright enough to bloom a little.
// Timeline on input.t (the intro, 70 s): 53–64 the motto, one wall after another, 2 s apart (STRENGTH / Força · BALANCE / Equilibri ·
// COURAGE / Valor · GOOD SENSE / Seny); 63.8–70 RESSONÀNCIA on every wall, then "Put your hands on the wall".
const MOTTO = [['STRENGTH', 'Força'], ['BALANCE', 'Equilibri'], ['COURAGE', 'Valor'], ['GOOD SENSE', 'Seny']];
const FONT = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const env = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t > c ? 1 - smooth((t - c) / (d - c)) : 1);

export function create({ THREE, room }) {
  const object = new THREE.Group();
  const PX = 520;                                          // texture px per metre
  function plate(lines, wM, hM) {                         // [{ text, size (cap height m), y (m from the plate's centre), weight, track, alpha }]
    const cv = document.createElement('canvas'); cv.width = Math.round(wM * PX); cv.height = Math.round(hM * PX);
    const g = cv.getContext('2d'); g.textBaseline = 'middle';
    for (const L of lines) {
      let size = L.size * PX * 1.38; g.font = `${L.weight || 300} ${size}px ${FONT}`;
      const tr = (L.track || 0) * size, chars = [...L.text];
      let tw = chars.reduce((a, ch) => a + g.measureText(ch).width + tr, -tr);
      if (tw > cv.width * 0.94) { const k = (cv.width * 0.94) / tw; size *= k; g.font = `${L.weight || 300} ${size}px ${FONT}`; tw *= k; }
      let x = (cv.width - tw) / 2; const y = cv.height / 2 - L.y * PX;
      g.fillStyle = `rgba(255,240,222,${L.alpha ?? 1})`;
      for (const ch of chars) { g.fillText(ch, x, y); x += g.measureText(ch).width + (L.track || 0) * size; }
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }
  const mats = [];
  function place(w, tex, wM, hM, yM) {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.5, 1.38), fog: false, toneMapped: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), m);
    mesh.position.copy(w.centre).setY(yM).addScaledVector(w.normal, -0.02);   // 2 cm behind the wall: on it, for everyone
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), w.normal);
    mesh.renderOrder = 10; object.add(mesh); mats.push(m);
    return m;
  }
  const motto = room.walls.map((w, i) => { const [en, ca] = MOTTO[i % MOTTO.length]; return place(w, plate([{ text: en, size: 0.22, y: 0.12, track: 0.32 }, { text: ca, size: 0.1, y: -0.26, track: 0.12, alpha: 0.75 }], 4.4, 1.1), 4.4, 1.1, 2.0); });
  const title = room.walls.map((w) => place(w, plate([{ text: 'RESSONÀNCIA', size: 0.24, y: 0.1, track: 0.42, weight: 200 }, { text: 'Put your hands on the wall', size: 0.075, y: -0.3, track: 0.08, alpha: 0.8 }], 5.2, 1.1), 5.2, 1.1, 2.05));
  return {
    object,
    update(dt, input) {
      const t = input.t;
      motto.forEach((m, i) => { const s = 53 + i * 2; m.opacity = env(t, s, s + 1.5, s + 3.5, s + 5); });
      title.forEach((m) => { m.opacity = env(t, 63.8, 66.4, 76, 79); });
    },
    dispose() { for (const m of mats) { m.map.dispose(); m.dispose(); } },
  };
}
