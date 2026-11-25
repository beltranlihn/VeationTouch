// An example part (see ../PARTS.md): a warm light on every hand, on the wall plane.
export function create({ THREE, room }) {
  const object = new THREE.Group(), lights = [];
  for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffc890, 0, 5, 2); object.add(l); lights.push(l); }
  return {
    object,
    update(dt, input) { lights.forEach((l, i) => { const h = input.hands[i]; if (h) { l.position.copy(h.pos).addScaledVector(h.normal, -0.3); l.intensity = 6; } else l.intensity *= 0.9; }); },
  };
}
