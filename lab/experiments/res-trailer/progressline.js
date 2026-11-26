// res-trailer — PROGRESS LINE (26-11, Beltrán: «en las etapas interactivas, una línea de tiempo abajo al centro, en los pies, de un tercio
// del muro: una línea con un círculo que va marcando cuánto hemos avanzado en dicha etapa»). On every wall, centred, near the floor: a
// fine track a third of the wall long, the part already done a little brighter, and a small dot at the front. Drawn in the room's
// overlay (over the picture). It fades in with an interactive stage and out when it ends; the dot eases (never jumps).
//   const line = createProgressLine({ THREE, room }); every frame: line.update(dt, progress)   (progress 0..1, or null = hidden)
export function createProgressLine({ THREE, room }) {
  const up = new THREE.Vector3(0, 1, 0), Y = 0.22, TH = 0.011, DOT = 0.042, INK = 0xdcdcdc;
  const mat = (o) => new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: o, depthTest: false, depthWrite: false });
  const mTrack = mat(0), mDone = mat(0), mDot = mat(0);
  const W = room.walls.map((w) => {
    const L = w.width / 3, g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, up, w.normal));
    g.position.copy(w.centre).addScaledVector(w.normal, 0.03).setY(Y);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(L, TH), mTrack);
    const done = new THREE.Mesh(new THREE.PlaneGeometry(1, TH * 1.6), mDone);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(DOT, 32), mDot);
    for (const m of [track, done, dot]) { m.renderOrder = 48; m.frustumCulled = false; g.add(m); }
    g.visible = false; room.overlay.add(g);
    return { L, g, done, dot };
  });
  let a = 0, v = 0;
  return {
    update(dt, p) {
      const on = p != null && isFinite(p);
      a += ((on ? 1 : 0) - a) * (1 - Math.exp(-dt * (on ? 1.2 : 2)));
      if (on) v += (Math.max(0, Math.min(1, p)) - v) * (1 - Math.exp(-dt * 2.5)); else if (a < 0.01) v = 0;
      mTrack.opacity = 0.3 * a; mDone.opacity = 0.65 * a; mDot.opacity = 0.85 * a;
      for (const s of W) {
        s.g.visible = a > 0.004;
        const x0 = -s.L / 2, len = Math.max(1e-4, v * s.L);
        s.done.scale.x = len; s.done.position.x = x0 + len / 2; s.dot.position.x = x0 + v * s.L;
      }
    },
  };
}
