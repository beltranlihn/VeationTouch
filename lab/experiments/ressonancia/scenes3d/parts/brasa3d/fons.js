// Ressonància — brasa3d / fons (T-063, ARTE-BRASA §f): «la plaça», the background that replaces the chrome drops.
//
// A Catalan village square at night in four cut-out silhouette planes, 12 / 16 / 20 / 26 m beyond the walls, all round the room:
//   1 · porxos — an arcade (round arches, the pattern runs on across the corners), plain wall behind the foguera and the text
//   2 · façades of three storeys, cornices 2.3–2.6 m (apparent on the wall), balcony slabs with a comb of bars, one side street a wall
//   3 · stepped roofs, gables and chimneys
//   4 · a low roof line and ONE bell tower in the room (wall P1, apparent 2.85 m); above it the sky #1A0F0B → #0B0807 (never #000)
// Every shape is drawn in the wall's APPARENT coordinates (metres on the wall: X along the perimeter, Y from the floor), so arcades,
// cornices and the tower keep their heights on every wall whatever its distance. Charcoal #23201E → #110E0D, lit only from below by
// the ember ring (heat field + level: plane 1 100 %, 2 55 %, 3 25 %, 4 a cold rim 0.2 on its profile): orange cut edges on the
// undersides of arches, balconies and cornices; 4 lit windows in the whole room (#F2B23A, 40 %, ±10 % at 0.3 Hz). The call's TOK
// raises its light ×2.5 for 0.4 s. The water reflects only the orange edges and the windows, stretched ×1.75, 40 %, broken by the
// swell, fading before the islet. Static; one opaque draw + one additive mirror draw; nothing per frame but uniforms.

const PLANES = [12, 16, 20, 26];
const TOPS = [2.06, 2.68, 2.82, 3.95];     // apparent height each plane's strip reaches (the last one carries the sky)

export function createFons({ THREE, TSL, room, U, world, ringPoint, heatSample, mirP, eye }) {
  const {
    Fn, uniform, attribute, varying, vec3, vec4, float, sin, exp, mix, clamp, smoothstep, max, min, abs, floor, fract, select, step,
    positionWorld, cameraPosition, fwidth, Discard, If, pow,
  } = TSL;
  const walls = room.walls, NW = walls.length;
  const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const towerWall = Math.max(0, walls.findIndex((w) => w.id === 'P1'));
  const uTok = uniform(0);

  // ---- geometry: per plane, per wall, a vertical strip (columns every 5 cm), static positions; attributes carry the apparent frame
  const pos = [], aP = [], aQ = [], idx = [];
  const _v = new THREE.Vector3(), ey = eye.y || 1.6;
  PLANES.forEach((D, p) => {
    walls.forEach((w, wi) => {
      const n = Math.max(8, Math.round(w.width / 0.05)), o = pos.length / 3;
      for (let c = 0; c <= n; c++) {
        const u = (w.width * c) / n, s = cum[wi] + u;
        const tw = ringPoint(s, D, _v), k = tw / (tw + D);
        const yTop = ey + (TOPS[p] - ey) / k;
        for (const y of [0, yTop]) { pos.push(_v.x, y, _v.z); aP.push(s, u - w.width / 2, k, p); aQ.push(wi, y > 0 ? 1 : 0); }
      }
      for (let c = 0; c < n; c++) { const a = o + c * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 4));
  geo.setAttribute('aQ', new THREE.Float32BufferAttribute(aQ, 2));
  geo.setIndex(idx);

  // ---- the silhouettes (1 = solid), in apparent metres. X: perimeter m, xc: from the wall's centre, Y: height on the wall, Yg: the plane's foot
  const hash = (n) => fract(sin(n.mul(12.9898).add(4.1)).mul(43758.5453));
  const plain = (xc, half) => step(half, abs(xc));                                  // 0 near the wall's centre (the foguera, the text)
  const archOpen = (X, xc, Y, Yg) => {
    const P1 = 0.74, rA = 0.25, Ys = Yg.add(0.3);
    const dx = fract(X.div(P1)).sub(0.5).mul(P1);
    const inArch = abs(dx).lessThan(rA).and(Y.lessThan(Ys).or(dx.mul(dx).add(Y.sub(Ys).mul(Y.sub(Ys))).lessThan(rA * rA)));
    return select(inArch, float(1), float(0)).mul(plain(xc, 1.7));
  };
  const solid1 = (X, xc, Y, Yg) => step(Y, 2.0).mul(float(1).sub(archOpen(X, xc, Y, Yg)));
  const corn2 = (X, xc) => {
    const b = floor(X.div(1.45).add(0.3)), hb = hash(b);
    return mix(float(2.38), float(2.3).add(hb.mul(0.3)), plain(xc, 1.7));
  };
  const street = (xc, wi) => select(abs(xc.sub(select(fract(wi.mul(0.5)).greaterThan(0.25), float(-2.2), float(2.2)))).lessThan(0.23), float(1), float(0));
  const solid2 = (X, xc, Y, wi) => {
    const top = corn2(X, xc);
    return step(Y, top).mul(float(1).sub(street(xc, wi)));   // T-063b: no parapet teeth
  };
  const solid3 = (X, xc, Y) => {
    const b = floor(X.div(1.1).add(0.55)), hb = hash(b.add(7.0)), dx = fract(X.div(1.1).add(0.55)).sub(0.5).mul(1.1);
    const top = float(2.44).add(hb.mul(0.2));
    const gable = top.sub(max(abs(dx).sub(0.08), 0).mul(0.38));
    const flat = top.sub(0.06);
    const roof = select(hb.greaterThan(0.45), gable, flat);
    const chim = step(0.62, hash(b.add(3.0))).mul(step(abs(dx.sub(0.22)), 0.025)).mul(step(Y, top.add(0.05)));
    return max(step(Y, roof), chim);
  };
  const solid4 = (X, xc, Y, wi) => {
    const roofs = float(2.47).add(sin(X.mul(2.1)).mul(0.03)).add(sin(X.mul(0.9).add(1.3)).mul(0.02));   // T-063b: a smooth roof line
    const isT = select(abs(wi.sub(towerWall)).lessThan(0.5), float(1), float(0));
    const tx = xc.sub(2.35), aw = abs(tx);
    const shaft = step(aw, 0.11).mul(step(Y, 2.72));
    const spire = step(aw, max(float(2.86).sub(Y), 0).mul(0.85)).mul(step(Y, 2.86));
    const belfry = step(aw, 0.045).mul(step(2.6, Y)).mul(step(Y, 2.67)).add(step(aw, 0.045).mul(step(tx.mul(tx).add(Y.sub(2.67).mul(Y.sub(2.67))), 0.045 * 0.045)));
    const tower = max(shaft, spire).mul(float(1).sub(min(belfry, 1.0))).mul(isT);
    return max(step(Y, roofs), tower);
  };
  const solidP = (p, X, xc, Y, Yg, wi) => select(p.lessThan(0.5), solid1(X, xc, Y, Yg),
    select(p.lessThan(1.5), solid2(X, xc, Y, wi), select(p.lessThan(2.5), solid3(X, xc, Y), solid4(X, xc, Y, wi))));
  // relief inside the façades (plane 2): balcony slabs with a comb of bars — the slab's underside catches the fire
  const balcony = (X, xc, Y, Yg) => {
    const b = floor(X.div(0.36)), bx = fract(X.div(0.36)).sub(0.5).mul(0.36);
    const on = step(abs(bx), 0.11).mul(plain(xc, 1.7)).mul(step(0.25, hash(b.add(11.0))));
    const lv = Y.sub(Yg).div(float(2.4).sub(Yg));
    const fl = fract(lv.mul(3.0)), slab = step(0.66, fl).mul(step(fl, 0.672));
    const bars = step(0.672, fl).mul(step(fl, 0.73)).mul(step(fract(X.div(0.014)), 0.35));
    return vec4(slab.mul(on), bars.mul(on), on, fl);
  };
  // the 4 windows of the room (plane 2, the top storey, ≥ 2 m from the foguera)
  const windowAt = (xc, Y, wi) => {
    const wx = select(fract(wi.mul(0.5)).greaterThan(0.25), float(2.75), float(-2.6));
    const dx = xc.sub(wx), dy = Y.sub(2.2);
    return step(abs(dx), 0.045).mul(step(abs(dy), 0.065)).mul(step(wi, NW - 0.5));
  };

  const SKY0 = lin('#1A0F0B'), SKY1 = lin('#0B0807');
  const PC = [lin('#23201E'), lin('#1C1917'), lin('#161312'), lin('#110E0D')];
  const pcol = (p) => select(p.lessThan(0.5), PC[0], select(p.lessThan(1.5), PC[1], select(p.lessThan(2.5), PC[2], PC[3])));
  const plightK = (p) => select(p.lessThan(0.5), float(1), select(p.lessThan(1.5), float(0.55), select(p.lessThan(2.5), float(0.25), float(0))));
  const EDGE0 = lin('#B3260E'), EDGE1 = lin('#FF7A1A'), WIN = lin('#F2B23A'), COLD = lin('#9FB4C8');
  const fireK = (s) => {                                                       // the ring's light on the square: level + heat field + the call
    const hs = heatSample(s, false);
    return float(0.45).add(U.level.mul(0.45)).add(hs.r.mul(1.6)).add(hs.g.mul(2.2)).add(U.awake.mul(0.4)).mul(float(1).sub(U.cool.mul(0.6))).mul(uTok.mul(1.5).add(1));
  };

  const meshes = [];
  for (const mirror of [false, true]) {
    const m = mirror
      ? new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const A = attribute('aP', 'vec4'), Q = attribute('aQ', 'vec2');
    const pl = attribute('position', 'vec3');
    if (mirror) { const mp = mirP(pl); m.positionNode = vec3(mp.x, mp.y.mul(1.75), mp.z); }
    const vS = varying(A.x), vXc = varying(A.y), vK = varying(A.z), vP = varying(A.w), vW = varying(Q.x), vY0 = varying(pl.y);
    m.colorNode = Fn(() => {
      const ey0 = cameraPosition.y;
      const Y = ey0.add(vY0.add(U.lift).sub(ey0).mul(vK));                     // apparent height of the (unmirrored) point
      const Yg = ey0.add(U.lift.sub(ey0).mul(vK));
      const X = vS, xc = vXc, p = vP.add(0.001).floor(), wi = vW.add(0.001).floor();
      const sol = solidP(p, X, xc, Y, Yg, wi);
      const d = fwidth(Y).mul(1.6);
      const solBelow = solidP(p, X, xc, Y.sub(d), Yg, wi);
      const solAbove = solidP(p, X, xc, Y.add(d), Yg, wi);
      const under = sol.mul(float(1).sub(solBelow));                          // an underside edge: lit by the fire below
      const topEdge = sol.mul(float(1).sub(solAbove));                         // a top edge: the cold rim of the far plane
      const fk = fireK(X).mul(plightK(p));
      const bal = select(p.equal(1), balcony(X, xc, Y, Yg), vec4(0, 0, 0, 0));
      const balUnder = bal.x.mul(float(1).sub(step(0.66, fract(Y.sub(d).sub(Yg).div(float(2.4).sub(Yg)).mul(3.0)))));
      const edgeK = max(under, balUnder.mul(0.8)).mul(fk);
      const edge = mix(EDGE0, EDGE1, smoothstep(0.6, 1.6, fk)).mul(min(edgeK, 1.0)).mul(0.6).mul(select(p.lessThan(0.5), float(1), float(0.5)));   // T-063c: the arches' rim at 60 %
      const win = select(p.equal(1), windowAt(xc, Y, wi), float(0)).mul(sol);
      const flick = sin(U.time.mul(1.885).add(wi.mul(2.1))).mul(0.1).add(0.9);
      const winC = WIN.mul(win).mul(0.4).mul(flick).mul(0.35);
      const vis = smoothstep(0.2, 0.7, U.arrive).mul(float(1).sub(smoothstep(0.15, 0.6, U.leave))).mul(float(1).sub(U.wait));
      if (mirror) {
        // only the lit edges and the windows, fading before the islet (where the water is seen closer than ~5–8 m beyond the wall)
        const Ym = ey0.add(positionWorld.y.sub(ey0).mul(vK));
        const near = smoothstep(ey0.mul(0.37), ey0.mul(0.3), ey0.sub(Ym));
        const c = edge.mul(1.2).add(winC.mul(1.5)).mul(0.4).mul(near).mul(U.refl).mul(vis);
        If(sol.lessThan(0.5).and(p.lessThan(3.5)), () => { Discard(); });
        return c;
      }
      If(sol.lessThan(0.5).and(p.lessThan(2.5)), () => { Discard(); });
      // the charcoal planes, lit from below (stronger at the foot), the relief of balconies a shade lighter
      const lift = exp(Y.sub(Yg).div(-0.35)).mul(fk).mul(0.012).mul(select(p.lessThan(0.5), float(2), float(1)));
      const relief = bal.y.mul(0.004).add(bal.z.mul(0.002));
      const pK = select(p.lessThan(0.5), float(2), select(p.lessThan(1.5), float(1.5), float(1)));   // T-063c: porxos ×2, façades ×1.5
      const body = min(pcol(p).mul(0.55).mul(pK).add(EDGE1.mul(lift)).add(relief), vec3(0.08, 0.08, 0.08));
      const cold = COLD.mul(topEdge).mul(0.2).mul(0.12).mul(select(p.equal(3), float(1), float(0.25)));
      const plane = body.add(edge).add(winC).add(cold);
      const sky = mix(SKY0, SKY1, smoothstep(1.65, 3.6, Y)).mul(0.9);
      return mix(sky, plane, sol).mul(vis).add(sky.mul(float(1).sub(vis)).mul(select(p.equal(3), float(1), float(0))).mul(float(1).sub(U.wait)));
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = mirror ? -1 : 0;
    world.add(mesh); meshes.push(mesh);
  }
  let tok = 0;
  return {
    meshes,
    update(dt, tokNow) { tok = Math.max(tokNow ? 1 : 0, tok - dt / 0.4); uTok.value = Math.max(0, tok); },
    dispose() { geo.dispose(); for (const m of meshes) m.material.dispose(); },
  };
}
