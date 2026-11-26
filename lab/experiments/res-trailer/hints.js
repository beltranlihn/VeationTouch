// res-trailer — HINTS (studio 26-11, Beltrán): besides each stage's teaching opening (the voice + a beam of light), a small hand and
// two or three words on the walls, inviting to touch or to hold. On a wall where someone has done it, the hint goes and stays away; it
// comes back only when nobody has done it there for a while. Drawn in the room's overlay (over the picture, no depth).
// Made like the intro's words (introp1): the hand is a hand of LIGHT POINTS (sampled from the guide's hand picture, each point
// twinkling on its own, the whole breathing slowly); the words are Instrument Serif at a size that reads at 4–6 m; both come IN out of
// focus along a soft front and rise a few cm into place, and LEAVE blurring upwards. A «hold» hint has a fine ring round the hand that
// fills, clockwise from the top, while a hand stays on that wall (done when it closes).
//   const hints = createHints({ THREE, TSL, room }); every frame: hints.update(dt, time, { block, t, hands, downs, cfg })
//   cfg = { text, walls: [indices], from (s into the block), idle (s), y (m, the hint's centre), dx (m from the wall's centre),
//           hold (s a hand must stay to count, 0 = a touch) } or null
export function createHints({ THREE, TSL, room }) {
  const { uniform, texture, uv, float, clamp, vec2, vec3, sin, fract, floor, length, atan, smoothstep, abs, max } = TSL;
  const PPM = 512, INK = 0.82;
  const HAND_H = 0.22, HAND_W = (HAND_H * 252) / 345, HAND_Y = 0.07;        // the hand above the hint's centre …
  const TXT = 0.12, TXT_W = 1.7, TXT_H = 0.2, TXT_Y = -0.15;                // … the words under it (0.12 m type: caps ~8 cm, 4–6 m)
  const RING_R = 0.17, RING_S = 0.42;                                       // the hold ring round the hand
  const IN_S = 2.4, OUT_S = 1.5;

  const fontF = new FontFace('Hint Serif', `url(${new URL('../ressonancia/scenes3d/fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`);
  let fontReady = false; fontF.load().then((f) => { try { document.fonts.add(f); } catch { /* lab */ } }).catch(() => {}).finally(() => { fontReady = true; });

  const uT = uniform(0);
  const hash1 = (x) => fract(sin(x.mul(12.9898)).mul(43758.5453));
  // the organic piece (as introp1): a soft front along the piece; where it passes, the spot comes in from out of focus and from a little
  // below; `out` runs it again: blur, drift up, thin away. White: the colour is constant, the shape is the alpha.
  function pieceMat(tex, wm, hm, { wipe = 'x', soft = 0.5, blur = 0.025, riseIn = 0.03, riseOut = 0.07, twinkle = false, seed = 0 } = {}) {
    const U = { a: uniform(0), rev: uniform(0), out: uniform(0), l: uniform(0), r: uniform(1) };
    const st = uv();
    const c0 = wipe === 'x' ? st.x : st.y;
    const c = clamp(c0.sub(U.l).div(U.r.sub(U.l).max(1e-3)), 0, 1);
    const front = (k) => { const v = clamp(k.mul(1 + soft).sub(c).div(soft), 0, 1); return v.mul(v).mul(float(3).sub(v.mul(2))); };
    const kin = front(U.rev), kout = front(U.out);
    const fog = clamp(float(1).sub(kin).add(kout), 0, 1);
    const dy = kout.mul(riseOut).sub(float(1).sub(kin).mul(riseIn)).div(hm);
    const su = vec2(st.x, st.y.sub(dy));
    const rx = fog.mul(blur / wm), ry = fog.mul(blur / hm);
    const tap = (ox, oy) => texture(tex, vec2(su.x.add(ox), su.y.add(oy))).a;
    let A = tap(0, 0).mul(2);
    for (let k = 0; k < 8; k++) { const a1 = (k / 8) * Math.PI * 2, a2 = a1 + Math.PI / 8; A = A.add(tap(rx.mul(Math.cos(a1)), ry.mul(Math.sin(a1)))).add(tap(rx.mul(0.5 * Math.cos(a2)), ry.mul(0.5 * Math.sin(a2))).mul(1.5)); }
    A = A.div(22);
    if (twinkle) { const cell = floor(st.x.mul(wm / 0.012)).add(floor(st.y.mul(hm / 0.012)).mul(57)).add(seed); A = A.mul(float(0.72).add(sin(uT.mul(1.6).add(hash1(cell).mul(6.283))).mul(0.28))); }
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    m.colorNode = vec3(INK, INK, INK); m.opacityNode = A.mul(U.a).mul(kin).mul(float(1).sub(kout));
    return { m, U };
  }
  // the hold ring: a fine track and its fill (clockwise from the top, soft head), coming and going with the hint
  function ringMat() {
    const U = { a: uniform(0), fill: uniform(0), done: uniform(0) };
    const p = uv().sub(0.5).mul(RING_S), r = length(p), lw = 2.2 / 261;
    const ring = smoothstep(lw, lw * 0.35, abs(r.sub(RING_R)));
    const ang = fract(atan(p.x, p.y).div(Math.PI * 2).add(1));               // 0 at the top, growing clockwise
    const fillK = smoothstep(U.fill.add(0.012), U.fill.sub(0.012), ang).mul(clamp(U.fill.mul(40), 0, 1));
    const glow = smoothstep(lw * 6, 0, abs(r.sub(RING_R).sub(U.done.mul(0.12)))).mul(U.done.mul(float(1).sub(U.done)).mul(2.5));   // a soft breath outwards when it closes
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    m.colorNode = vec3(INK, INK, INK); m.opacityNode = max(ring.mul(float(0.16).add(fillK.mul(0.74))), glow.mul(0.5)).mul(U.a);
    return { m, U };
  }
  function canvasTex(wm, hm) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(wm * PPM); cv.height = Math.ceil(hm * PPM);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return { cv, g: cv.getContext('2d'), tex };
  }

  // ---- the hand of points (one texture for every wall)
  const handC = canvasTex(HAND_W + 0.04, HAND_H + 0.04);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data, sp = 0.0095, R = 0.0034, H = handC.cv.height / PPM, W = handC.cv.width / PPM;
    let seed = 91; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const hg = handC.g; hg.clearRect(0, 0, handC.cv.width, handC.cv.height); hg.fillStyle = '#fff';
    for (let y = 0; y < HAND_H; y += sp) for (let x = 0; x < HAND_W; x += sp) {
      const jx = x + (rnd() - 0.5) * sp * 0.5, jy = y + (rnd() - 0.5) * sp * 0.5;
      const px = Math.min(img.width - 1, Math.max(0, Math.floor((jx / HAND_W) * img.width))), py = Math.min(img.height - 1, Math.max(0, Math.floor((1 - jy / HAND_H) * img.height)));
      if (d[(py * img.width + px) * 4 + 3] < 140) continue;
      hg.globalAlpha = 0.7 + rnd() * 0.3; hg.beginPath(); hg.arc((jx + (W - HAND_W) / 2) * PPM, (H - (jy + (H - HAND_H) / 2)) * PPM, R * PPM, 0, 6.283); hg.fill();
    }
    hg.globalAlpha = 1; handC.tex.needsUpdate = true;
  };
  img.src = new URL('../ressonancia/scenes3d/parts/umbral3d/hand.png', import.meta.url).href;

  const up = new THREE.Vector3(0, 1, 0), NW = room.walls.length;
  const W = room.walls.map((w, i) => {
    const group = new THREE.Group(); group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, up, w.normal)); group.visible = false;
    const mk = (mat, wm, hm, y) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), mat); mesh.position.set(0, y, 0); mesh.renderOrder = 49; mesh.frustumCulled = false; group.add(mesh); return mesh; };
    const hand = pieceMat(handC.tex, handC.cv.width / PPM, handC.cv.height / PPM, { wipe: 'y', soft: 0.7, blur: 0.03, riseIn: 0.03, riseOut: 0.07, twinkle: true, seed: 13 * i });
    const txt = canvasTex(TXT_W, TXT_H), word = pieceMat(txt.tex, TXT_W, TXT_H, { wipe: 'x', soft: 0.55, blur: 0.025, riseIn: 0.025, riseOut: 0.07 });
    const ring = ringMat();
    mk(hand.m, handC.cv.width / PPM, handC.cv.height / PPM, HAND_Y); mk(word.m, TXT_W, TXT_H, TXT_Y); mk(ring.m, RING_S, RING_S, HAND_Y);
    room.overlay.add(group);
    return { w, group, hand, word, ring, txt, text: null, want: null, phase: 'off', p: 0, last: -1e9, holdFrom: new Map(), fill: 0, done: 0 };
  });
  function draw(s, text) {
    const g = s.txt.g, Wc = s.txt.cv.width, Hc = s.txt.cv.height; g.clearRect(0, 0, Wc, Hc);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${Math.round(TXT * PPM)}px "Hint Serif", Georgia, serif`;
    g.letterSpacing = `${(0.015 * TXT * PPM).toFixed(1)}px`; g.fillText(text, Wc / 2, Hc / 2);
    const tw = g.measureText(text).width; s.word.U.l.value = Math.max(0, (Wc - tw) / 2 / Wc - 0.01); s.word.U.r.value = Math.min(1, (Wc + tw) / 2 / Wc + 0.01);
    s.txt.tex.needsUpdate = true; s.text = text;
  }
  let block = null;
  return {
    update(dt, time, { block: b, t, hands, downs, cfg }) {
      uT.value = time;
      if (b !== block) { block = b; for (const s of W) { s.last = -1e9; s.holdFrom.clear(); } }
      // what counts as «done» on a wall: a hand landing (touch), or a hand staying cfg.hold s (hold)
      for (const s of W) s.fill = 0;
      if (cfg) {
        if (!cfg.hold) for (const h of downs || []) if (W[h.wall]) W[h.wall].last = time;
        if (cfg.hold) {
          const seen = new Set();
          for (const h of hands || []) {
            const s = W[h.wall]; if (!s) continue; seen.add(h.stroke);
            if (!s.holdFrom.has(h.stroke)) s.holdFrom.set(h.stroke, time);
            const k = (time - s.holdFrom.get(h.stroke)) / cfg.hold; s.fill = Math.max(s.fill, Math.min(1, k));
            if (k >= 1 && s.phase !== 'out') { s.last = time; s.done = 1e-3; }
          }
          for (const s of W) for (const k of [...s.holdFrom.keys()]) if (!seen.has(k)) s.holdFrom.delete(k);
        }
      }
      for (let i = 0; i < NW; i++) {
        const s = W[i], on = !!cfg && cfg.walls.includes(i) && t >= (cfg.from ?? 0) && time - s.last > (cfg.idle ?? 15);
        const want = on && fontReady ? cfg.text : null;
        // phases: off → in (resolving) → on → out (leaving) → off; new words while shown: out, then in with them
        if (want && (s.phase === 'off' || (s.phase === 'out' && s.p >= 1))) { if (s.text !== want) draw(s, want); s.phase = 'in'; s.p = 0; s.done = 0; }
        else if ((!want || want !== s.text) && (s.phase === 'in' || s.phase === 'on')) { s.phase = 'out'; s.p = 0; }
        if (s.phase === 'in') { s.p += dt / IN_S; if (s.p >= 1) { s.p = 1; s.phase = 'on'; } }
        else if (s.phase === 'out') { s.p += dt / OUT_S; if (s.p >= 1) { s.p = 1; if (!want) s.phase = 'off'; } }
        if (on) s.group.position.copy(s.w.centre).addScaledVector(s.w.normal, 0.025).addScaledVector(s.w.right, cfg.dx ?? 0).setY(cfg.y ?? 1.25);
        const rev = s.phase === 'in' ? s.p : s.phase === 'off' ? 0 : 1, out = s.phase === 'out' ? s.p : 0;
        const breath = 0.88 + 0.12 * Math.sin(time * 1.3 + i * 1.7);
        s.hand.U.a.value = breath; s.hand.U.rev.value = rev; s.hand.U.out.value = Math.min(1, out * 1.15);
        s.word.U.a.value = 1; s.word.U.rev.value = Math.max(0, rev * 1.2 - 0.2); s.word.U.out.value = out;
        // the ring: only for a hold; fills with the longest hand on that wall, breathes out once when it closes
        if (s.done > 0) s.done = Math.min(1, s.done + dt / 1.2);
        const ringOn = cfg?.hold ? (s.phase === 'in' ? s.p : s.phase === 'on' ? 1 : s.phase === 'out' ? 1 - s.p : 0) : 0;
        s.ring.U.a.value = ringOn; s.ring.U.fill.value = s.done > 0 ? 1 : s.fill; s.ring.U.done.value = s.done;
        s.group.visible = s.phase !== 'off';
      }
    },
  };
}
