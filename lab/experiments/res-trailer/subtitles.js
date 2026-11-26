// res-trailer — SUBTITLES (studio 26-11, Beltrán: «subtítulos arriba, en un rectángulo redondeado negro al 45 %, en inglés, al centro arriba de
// cada muro, en mayúsculas», Instrument Serif). The sound piece says which voice line it speaks ({ type: 'sub', name, in, dur } on the
// 'ressonancia' channel); the English text of that line (ressonancia-sound/audio/voice-lines-v3.json, the stage directions in [ ] taken out)
// is shown on every wall at once, top centre, for the line's length. One canvas texture shared by the four walls, redrawn only when the
// line changes; the planes live in the room's overlay (drawn over the image, no depth).
//   const subs = createSubtitles({ THREE, TSL, room }); subs.say(name, delay, dur); subs.clear(); subs.update(dt) every frame
export function createSubtitles({ THREE, TSL, room }) {
  const CW = 2048, CH = 128, PW = 4.6, PH = (PW * CH) / CW, FROM_TOP = 0.36;   // the plane (m); its centre 0.36 m under each wall's top
  const lines = {};
  fetch(new URL('../ressonancia-sound/audio/voice-lines-v3.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => {
    for (const [k, v] of Object.entries(j?.lines || {})) lines[k] = String(v).replace(/\[[^\]]*\]/g, '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }).catch(() => {});
  const font = new FontFace('Instrument Serif', `url(${new URL('../ressonancia/scenes3d/fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`);
  let fontReady = false; font.load().then((f) => { try { document.fonts.add(f); } catch { /* lab */ } fontReady = true; }).catch(() => { fontReady = true; });
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const uA = TSL.uniform(0), m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
  const t = TSL.texture(tex); m.colorNode = t.rgb; m.opacityNode = t.a.mul(uA);
  const up = new THREE.Vector3(0, 1, 0), planes = room.walls.map((w) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), m);
    p.position.copy(w.centre).addScaledVector(w.normal, 0.02).setY((w.height || 3.75) - FROM_TOP);
    p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, up, w.normal)); p.renderOrder = 50; p.frustumCulled = false;
    room.overlay.add(p); return p;
  });
  function draw(text) {
    g.clearRect(0, 0, CW, CH); if (!text) { tex.needsUpdate = true; return; }
    let px = 50; g.font = `${px}px "Instrument Serif", Georgia, serif`;
    let tw = g.measureText(text).width; if (tw > CW - 120) { px = Math.floor(px * (CW - 120) / tw); g.font = `${px}px "Instrument Serif", Georgia, serif`; tw = g.measureText(text).width; }
    const bw = tw + px * 1.7, bh = Math.min(CH - 4, px * 2.1), x0 = (CW - bw) / 2, y0 = (CH - bh) / 2, r = bh * 0.38;   // a pill with air round the words (Beltrán's reference)
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(x0, y0, bw, bh, r); g.fill();
    g.fillStyle = '#F2F2F2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, CW / 2, CH / 2 + px * 0.04);
    tex.needsUpdate = true;
  }
  let cur = null, pending = null, k = 0, until = 0, clock = 0;
  return {
    planes, canvas: cv,
    say(name, delay = 0, dur = 3) { const text = lines[name]; if (!text) return; pending = { text, at: clock + delay, until: clock + delay + dur + 0.4 }; },
    clear() { pending = null; until = clock; },
    update(dt) {
      clock += dt;
      if (pending && clock >= pending.at && fontReady) { if (pending.text !== cur) { cur = pending.text; draw(cur); } until = pending.until; pending = null; }
      const to = clock < until ? 1 : 0; k += (to - k) * Math.min(1, dt * (to ? 8 : 4)); uA.value = k;
      if (k < 0.002 && cur && !pending) { cur = null; draw(null); }
    },
  };
}
