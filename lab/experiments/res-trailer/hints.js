// res-trailer — HINTS (studio 26-11, Beltrán): besides each stage's teaching opening (the voice + a beam of light), a small hand
// silhouette and two or three words on the walls, inviting to touch or to hold. On a wall where someone has done it, the hint goes and
// stays away; it comes back only when nobody has done it there for a while. Drawn in the room's overlay (over the picture, no depth),
// one canvas per wall-state, redrawn only when its words change.
//   const hints = createHints({ THREE, TSL, room }); every frame: hints.update(dt, time, { block, t, hands, downs, cfg })
//   cfg = { text, walls: [indices], from (s into the block), idle (s), y (m), hold (s a hand must stay to count, 0 = a touch) } or null
export function createHints({ THREE, TSL, room }) {
  const CW = 640, CH = 400, PW = 0.62, PH = (PW * CH) / CW;
  const font = new FontFace('Instrument Serif', `url(${new URL('../ressonancia/scenes3d/fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`);
  let fontReady = false; font.load().then((f) => { try { document.fonts.add(f); } catch { /* lab */ } fontReady = true; }).catch(() => { fontReady = true; });
  const img = new Image(); let imgReady = false; img.onload = () => { imgReady = true; }; img.src = new URL('../ressonancia/scenes3d/parts/umbral3d/hand.png', import.meta.url).href;
  const up = new THREE.Vector3(0, 1, 0), NW = room.walls.length;
  const W = room.walls.map((w) => {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const uA = TSL.uniform(0), m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    const tx = TSL.texture(tex); m.colorNode = tx.rgb.mul(0.85); m.opacityNode = tx.a.mul(uA);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), m);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, up, w.normal)); mesh.renderOrder = 49; mesh.frustumCulled = false; mesh.visible = false;
    room.overlay.add(mesh);
    return { w, cv, g: cv.getContext('2d'), tex, uA, mesh, text: null, k: 0, last: -1e9, holdFrom: new Map() };
  });
  function draw(s, text) {
    const g = s.g; g.clearRect(0, 0, CW, CH);
    if (imgReady) { const h = 190, w = (h * img.width) / img.height; g.globalAlpha = 0.95; g.drawImage(img, (CW - w) / 2, 18, w, h); g.globalAlpha = 1; }
    g.fillStyle = '#F2F2F2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '62px "Instrument Serif", Georgia, serif';
    g.fillText(text, CW / 2, 290);
    s.tex.needsUpdate = true; s.text = text;
  }
  let block = null;
  return {
    update(dt, time, { block: b, t, hands, downs, cfg }) {
      if (b !== block) { block = b; for (const s of W) { s.last = -1e9; s.holdFrom.clear(); } }
      // what counts as «done» on a wall: a hand landing (touch), or a hand staying cfg.hold s (hold)
      if (cfg) {
        if (!cfg.hold) for (const h of downs || []) if (W[h.wall]) W[h.wall].last = time;
        if (cfg.hold) {
          const seen = new Set();
          for (const h of hands || []) { const s = W[h.wall]; if (!s) continue; seen.add(h.stroke); if (!s.holdFrom.has(h.stroke)) s.holdFrom.set(h.stroke, time); else if (time - s.holdFrom.get(h.stroke) >= cfg.hold) s.last = time; }
          for (const s of W) for (const k of [...s.holdFrom.keys()]) if (!seen.has(k)) s.holdFrom.delete(k);
        }
      }
      for (let i = 0; i < NW; i++) {
        const s = W[i], on = !!cfg && cfg.walls.includes(i) && t >= (cfg.from ?? 0) && time - s.last > (cfg.idle ?? 15);
        if (on && fontReady && s.text !== cfg.text) draw(s, cfg.text);
        if (on) { s.mesh.position.copy(s.w.centre).addScaledVector(s.w.normal, 0.025).addScaledVector(s.w.right, cfg.dx ?? 0).setY(cfg.y ?? 1.25); }
        s.k += ((on && s.text ? 1 : 0) - s.k) * Math.min(1, dt * (on ? 1.6 : 3.5));                  // in slowly, out quicker
        s.uA.value = s.k * (0.82 + 0.18 * Math.sin(time * 1.9 + i)); s.mesh.visible = s.k > 0.003;
      }
    },
  };
}
