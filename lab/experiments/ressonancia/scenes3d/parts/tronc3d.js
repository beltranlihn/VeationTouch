// Ressonància — part «tronc3d»: III. Tronc — Equilibri — the universe of STONE AND CERAMIC (contract: ../PARTS.md; GUION.md › III).
//
// The castell's FAIXES become trencadís: each tier of the castell part's tronc, when the group has fixed it, wears its sash as a mosaic
// skin of broken glazed ceramic on the real bodies — irregular shards (each a polygon of its own), dark grout between them (gaps: the
// figure shows through), every shard glazed at its own angle (it catches the light its own way, and glints when its face turns to the
// eye). The colour climbs the tower: stone and bone at the baixos, ochre and sand, terracotta, red at the top. While a tier is forming
// its shards hover near the bodies, turning, closing in; when it is fixed they fly home and lock with a flash. At the reward the
// trencadís goes out from the top down (the night opens above: the Pom). The bodies are the castell part's own: its tronc is rebuilt
// here with the same skeleton and the same seed (kind and tiers read from castell's stats: people / top), and every frame the belts
// copy the world matrix of the castell's group for their wall, so they lean with lean[w] and tremble with weak[w] exactly as it does.
// Score floors (1–9) → castell tiers: tier j is fixed when (floors + floorProgress)·T/9 ≥ j + 1 (as res-obra3d builds the castell).
// Alone (res-3d-study): kind/tiers from params, placed by the chapters' rule (6.5 m beyond the wall), lean/weak from params.
// arrive: the fixed tiers' shards fly in from scattered fragments; leave: they rise, part and go out. All motion in the vertex stage.
// ---------------------------------------------------------------------------------------------------------------- bodies
// The body kit below (vector helpers, two-bone IK, skeleton, the surface segments and their sampling) is copied from parts/castell.js
// (owner: INT; not imported so that castell.js stays untouched), used here to find the castell's real bodies (their sashes) tier by tier.
// ---------------------------------------------------------------------------------------------------------------- small vector kit
const V = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const UP = V(0, 1, 0);
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// two-bone IK: root A, target T, lengths l1 l2, pole direction p → [joint, end]
function ik(A, T, l1, l2, p) {
  const d0 = sub(T, A), D = len(d0) || 1e-4, dir = mul(d0, 1 / D);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let b = sub(p, mul(dir, dot(p, dir))); if (len(b) < 1e-4) b = cross(dir, [1, 0, 0]); b = norm(b);
  return [add(madd(A, dir, a), mul(b, h)), madd(A, dir, d)];
}

// ---------------------------------------------------------------------------------------------------------------- one body
// spec: { f (facing, horizontal unit), s (scale), lean (rad, forward), head (rad, extra pitch), feet [L, R] ankle targets,
//         hands [L, R] wrist targets, elbow (pole), knee (pole), hipLift (extra pelvis height), child }
function skeleton(sp) {
  const s = sp.s, f = norm(sp.f), side = norm(cross(f, UP));         // side = the person's right
  const lean = sp.lean || 0, sd = norm(add(mul(UP, Math.cos(lean)), mul(f, Math.sin(lean))));
  const [fl, fr] = sp.feet, mid = lerp(fl, fr, 0.5);
  const lat = Math.max(0, len(sub(fl, fr)) / 2 - 0.09 * s), reach = 0.85 * s * (sp.bend ?? 0.97);
  const pelvis = sp.pelvis || add(mid, V(0, Math.sqrt(Math.max(0.04 * s * s, reach * reach - lat * lat)) + 0.03 * s + (sp.hipLift || 0), 0));
  const TL = 0.52 * s, S = (t) => madd(pelvis, sd, t * TL);
  const hd = norm(add(mul(UP, Math.cos(lean + (sp.head || 0))), mul(f, Math.sin(lean + (sp.head || 0)))));
  const neck = S(1), shC = S(0.86), shW = (sp.child ? 0.17 : 0.185) * s;
  const shL = madd(shC, side, -shW), shR = madd(shC, side, shW);
  const hL = madd(madd(pelvis, side, -0.09 * s), sd, -0.03 * s), hR = madd(madd(pelvis, side, 0.09 * s), sd, -0.03 * s);
  const kp = sp.knee || add(f, mul(UP, 0.1));
  const [kL, aL] = ik(hL, fl, 0.43 * s, 0.42 * s, add(kp, mul(side, -0.25)));
  const [kR, aR] = ik(hR, fr, 0.43 * s, 0.42 * s, add(kp, mul(side, 0.25)));
  const ep = sp.elbow || add(mul(UP, -1), mul(f, -0.3));
  const [eL, wL] = ik(shL, sp.hands[0], 0.29 * s, 0.26 * s, add(ep, mul(side, -0.6)));
  const [eR, wR] = ik(shR, sp.hands[1], 0.29 * s, 0.26 * s, add(ep, mul(side, 0.6)));
  const hsc = sp.child ? 1.22 : 1;
  const foot = (a) => madd(madd(a, f, 0.15 * s), UP, -0.045 * s);
  return {
    s, f, side, sd, hd, pelvis, S, neck, neckTop: madd(neck, hd, 0.06 * s), headC: madd(neck, hd, (0.06 + 0.1 * hsc) * s), hsc,
    shL, shR, hL, hR, kL, kR, aL, aR, eL, eR, wL, wR,
    hnL: madd(wL, norm(sub(wL, eL)), 0.16 * s), hnR: madd(wR, norm(sub(wR, eR)), 0.16 * s), tL: foot(aL), tR: foot(aR),
  };
}

// the torso as a loft of ellipses along the spine: [t, half-width, half-depth]
const LOFT = [[-0.14, 0.135, 0.10], [0.0, 0.165, 0.115], [0.2, 0.14, 0.10], [0.45, 0.15, 0.11], [0.7, 0.172, 0.12], [0.86, 0.19, 0.10], [1.0, 0.07, 0.06]];
function loftR(t) {
  for (let i = 1; i < LOFT.length; i++) if (t <= LOFT[i][0]) { const a = LOFT[i - 1], b = LOFT[i], k = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  return [LOFT[LOFT.length - 1][1], LOFT[LOFT.length - 1][2]];
}
// segments: [kind, a, b, rA, rB, weight(area, at scale 1), energy]   kinds: 'torso', 'cap' (capsule), 'ell' (ellipsoid), 'sph'
const SEGS = [
  ['torso', null, null, 0, 0, 0.56, 1],
  ['pelvis', null, null, 0, 0, 0.10, 0.9],
  ['cap', 'neck', 'neckTop', 0.05, 0.045, 0.02, 0.9],
  ['head', null, null, 0, 0, 0.30, 1.5],
  ['cap', 'shL', 'eL', 0.052, 0.04, 0.085, 1], ['cap', 'shR', 'eR', 0.052, 0.04, 0.085, 1],
  ['cap', 'eL', 'wL', 0.04, 0.03, 0.06, 1.05], ['cap', 'eR', 'wR', 0.04, 0.03, 0.06, 1.05],
  ['cap', 'wL', 'hnL', 0.032, 0.022, 0.025, 1.3], ['cap', 'wR', 'hnR', 0.032, 0.022, 0.025, 1.3],
  ['cap', 'hL', 'kL', 0.085, 0.055, 0.16, 0.95], ['cap', 'hR', 'kR', 0.085, 0.055, 0.16, 0.95],
  ['cap', 'kL', 'aL', 0.055, 0.036, 0.11, 0.95], ['cap', 'kR', 'aR', 0.055, 0.036, 0.11, 0.95],
  ['cap', 'aL', 'tL', 0.04, 0.03, 0.03, 0.9], ['cap', 'aR', 'tR', 0.04, 0.03, 0.03, 0.9],
  ['sph', 'shL', null, 0.058, 0, 0.06, 1.4], ['sph', 'shR', null, 0.058, 0, 0.06, 1.4],
];
const SEGW = SEGS.reduce((a, g) => a + g[5], 0);

function evalSample(k, rec, out, onorm) {      // rec = [seg, u1, u2, u3]; writes position and normal
  const g = SEGS[rec[0]], s = k.s, u1 = rec[1], u2 = rec[2], th = u2 * 6.283185;
  let p, n;
  if (g[0] === 'torso') {
    const t = -0.14 + u1 * 1.14, [rx, rz] = loftR(t), c = k.S(t), dp = norm(cross(k.sd, k.side));
    const cx = Math.cos(th), cz = Math.sin(th);
    p = add(c, add(mul(k.side, rx * s * cx), mul(dp, rz * s * cz)));
    n = norm(add(mul(k.side, cx / rx), mul(dp, cz / rz)));
  } else if (g[0] === 'pelvis' || g[0] === 'head') {
    const ct = 2 * u1 - 1, st = Math.sqrt(1 - ct * ct), d = [st * Math.cos(th), ct, st * Math.sin(th)];
    const ax = g[0] === 'head' ? k.hd : k.sd, dp = norm(cross(ax, k.side));
    const r = g[0] === 'head' ? [0.078 * k.hsc, 0.112 * k.hsc, 0.095 * k.hsc] : [0.16, 0.1, 0.12];
    const c = g[0] === 'head' ? k.headC : k.S(-0.07);
    p = add(c, add(add(mul(k.side, d[0] * r[0] * s), mul(ax, d[1] * r[1] * s)), mul(dp, d[2] * r[2] * s)));
    n = norm(add(add(mul(k.side, d[0] / r[0]), mul(ax, d[1] / r[1])), mul(dp, d[2] / r[2])));
  } else if (g[0] === 'sph') {
    const ct = 2 * u1 - 1, st = Math.sqrt(1 - ct * ct); n = [st * Math.cos(th), ct, st * Math.sin(th)];
    p = madd(k[g[1]], n, g[3] * s);
  } else {                                       // capsule with round caps
    const A = k[g[1]], B = k[g[2]], ab = sub(B, A), L = len(ab) || 1e-4, ax = mul(ab, 1 / L);
    let e1 = cross(ax, UP); if (len(e1) < 0.1) e1 = cross(ax, [1, 0, 0]); e1 = norm(e1); const e2 = cross(ax, e1);
    const rA = g[3] * s, rB = g[4] * s, capA = rA * rA * 2, capB = rB * rB * 2, cyl = L * (rA + rB);
    const pick = rec[3] * (capA + capB + cyl);
    if (pick < cyl) {
      const t = u1, r = rA + (rB - rA) * t, cx = Math.cos(th), cz = Math.sin(th);
      n = add(mul(e1, cx), mul(e2, cz)); p = add(madd(A, ab, t), mul(n, r));
    } else {
      const atA = pick < cyl + capA, ct = u1, st = Math.sqrt(1 - ct * ct);
      n = add(add(mul(e1, st * Math.cos(th)), mul(e2, st * Math.sin(th))), mul(ax, atA ? -ct : ct));
      p = madd(atA ? A : B, n, atA ? rA : rB);
    }
  }
  out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; onorm[0] = n[0]; onorm[1] = n[1]; onorm[2] = n[2];
  return g[6] * (g[0] === 'torso' && rec[1] > 0.11 && rec[1] < 0.3 ? 0.42 / g[6] : 1);   // the sash: a darker band
}


const cross3 = cross;   // (create() shadows cross/dot with TSL's)

// the castell part's tronc (same rng, same skeleton calls in the same order: same bodies). Returns, per tier, its bodies' skeletons.
function troncBodies(kind, tiers) {
  const seed = 1234 + tiers * 7 + (kind === 'quatre' ? 99 : 0);
  const r = rng(seed), n = kind === 'quatre' ? 4 : 3, R = n === 4 ? 0.36 : 0.31, ang0 = n === 4 ? Math.PI / 4 : Math.PI / 2;
  const tierScale = (L) => [1.05, 1.0, 0.97, 0.94, 0.92, 0.9, 0.88][L] ?? 0.88;
  const tronc = [];
  for (let L = 0; L < tiers; L++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const a = ang0 + (j * 2 * Math.PI) / n, f = V(Math.cos(a), 0, Math.sin(a)), side = norm(cross(f, UP)), s = tierScale(L) * (0.98 + r() * 0.04);
      let feet;
      if (L === 0) { const c = mul(f, R + 0.02); feet = [add(madd(c, side, -0.15), V(0, 0.075 * s, 0)), add(madd(c, side, 0.15), V(0, 0.075 * s, 0))]; }
      else { const b = tronc[L - 1][j]; feet = [madd(add(b.shL, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, 0.035), madd(add(b.shR, V(0, 0.07 * b.s + 0.07 * s, 0)), b.side, -0.035)]; }
      row.push(skeleton({ f, s, lean: L === 0 ? -0.04 : 0.02, head: L === 0 ? 0.15 : -0.05, feet, hands: [V(), V()], bend: L === 0 ? 0.93 : 0.96 }));
    }
    tronc.push(row);
  }
  return tronc;
}

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, int, positionGeometry, positionWorld, cameraPosition, normalize,
    mix, smoothstep, clamp, sin, cos, fract, abs, max, min, pow, exp, dot, cross, select, step, modelWorldMatrix, If, Discard,
  } = TSL;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const walls = room.walls, NW = walls.length;
  // the palette from the bottom of the tronc to its top (linear): stone, bone, pale ochre, sand, light terracotta, terracotta, deep terracotta, red, deep red
  const PAL = [[0.42, 0.39, 0.34], [0.72, 0.68, 0.58], [0.74, 0.60, 0.38], [0.70, 0.52, 0.30], [0.72, 0.38, 0.20], [0.62, 0.26, 0.12], [0.52, 0.18, 0.08], [0.58, 0.09, 0.05], [0.42, 0.04, 0.03]];
  const uPal = uniformArray(PAL.map((c) => new THREE.Vector4(c[0], c[1], c[2], 1)), 'vec4');
  const uTime = uniform(0), uArrive = uniform(1), uLeave = uniform(0), uGain = uniform(1), uT = uniform(5);

  // -------------------------------------------------------------------------------------------- the shards, on the real sashes
  let geo = null, NS = 0, built = '', towers = [];
  function build(kind, tiers) {
    const key = kind + '|' + tiers; if (key === built) return; built = key;
    const tronc = troncBodies(kind, tiers), r = rng(77 + tiers);
    const A = [], B = [], C = [], D = [];
    tronc.forEach((row, L) => row.forEach((k) => {
      const dp = norm(cross3(k.sd, k.side));                         // the body's depth axis (front/back)
      const s = k.s, rows = 5, cols = 24;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        if (r() < 0.12) continue;                                  // a missing piece now and then
        const t = 0.0 + ((i + 0.5 + (r() - 0.5) * 0.35) / rows) * 0.5, th = ((j + (i % 2) * 0.5 + (r() - 0.5) * 0.4) / cols) * Math.PI * 2;
        const [rx, rz] = loftR(t), c = k.S(t), cx = Math.cos(th), cz = Math.sin(th);
        const p = add(c, add(mul(k.side, rx * s * 1.12 * cx), mul(dp, rz * s * 1.12 * cz)));
        const nrm = norm(add(mul(k.side, cx / rx), mul(dp, cz / rz)));
        A.push(p[0], p[1], p[2], L); B.push(nrm[0], nrm[1], nrm[2], 0.03 + r() * 0.022); C.push(r(), r(), r(), r()); D.push(k.sd[0], k.sd[1], k.sd[2], r());
      }
    }));
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [name, arr] of [['tA', A], ['tB', B], ['tC', C], ['tD', D]]) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), 4));
    NS = A.length / 4; g.instanceCount = NS;
    if (geo) geo.dispose();
    geo = g;
    for (const t of towers) t.mesh.geometry = geo;
    uT.value = tiers;
  }

  function makeMaterial(U) {
    // drawn after the castell's additive light (transparent queue, renderOrder 10, opaque pixels): the mosaic sits ON the glowing bodies
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: true });
    const a = attribute('tA', 'vec4'), b = attribute('tB', 'vec4'), c = attribute('tC', 'vec4'), d = attribute('tD', 'vec4');
    const home = a.xyz, L = a.w, n = b.xyz, half = b.w, upB = d.xyz;
    const fixed = step(L.add(0.5), U.built), forming = step(U.built.sub(0.5), L).mul(step(L, U.built.add(0.5)));
    const lockAge = select(L.greaterThan(U.built.sub(1.5)), U.time.sub(U.fixT), float(99));
    const fly = select(fixed.greaterThan(0.5), smoothstep(0.0, 1.3, lockAge.sub(c.x.mul(0.35))), U.prog.mul(0.55).mul(forming));
    const away = float(1).sub(clamp(fly, 0, 1));
    const t = normalize(cross(upB, n).add(vec3(0.0001, 0, 0))), up = normalize(cross(n, t));
    const scat = vec3(c.y.sub(0.5), c.z.sub(0.3), c.w.sub(0.5)).mul(1.4).add(n.mul(c.x.mul(1.2).add(0.4)));
    const lv = uLeave, arr = float(1).sub(uArrive);
    const outK = away.add(arr.mul(arr).mul(2.5)).add(lv.mul(lv).mul(3.0));
    const spin = outK.mul(c.y.mul(5).add(1.5)).add(away.mul(U.time.mul(c.z.add(0.3))));
    const axis = normalize(vec3(c.z.sub(0.5), c.w.sub(0.5), c.x.sub(0.5)).add(vec3(0, 0.001, 0)));
    const rot = (v) => v.mul(cos(spin)).add(cross(axis, v).mul(sin(spin))).add(axis.mul(dot(axis, v).mul(float(1).sub(cos(spin)))));
    // glazed at its own angle: each piece's face tilted a little off the body's surface
    const tilt = n.add(t.mul(c.y.sub(0.5).mul(0.7))).add(up.mul(c.z.sub(0.5).mul(0.7)));
    const tq = rot(t), uq = rot(up), nq = rot(normalize(tilt));
    const q = positionGeometry.xy;
    const P0 = home.add(scat.mul(outK)).add(vec3(0, lv.mul(lv).mul(c.x.mul(3).add(1.5)), 0)).add(n.mul(0.004));
    const vis = select(fixed.greaterThan(0.5), float(1), forming.mul(U.prog.mul(0.8).add(0.1)));
    const shown = vis.mul(smoothstep(0.0, 0.35, uArrive)).mul(smoothstep(1.0, 0.7, lv));
    m.positionNode = select(shown.greaterThan(0.002), P0.add(tq.mul(q.x.mul(half))).add(uq.mul(q.y.mul(half.mul(c.w.mul(0.5).add(0.75))))), vec3(0, -1000, 0));
    // colour: the tronc's height (tier / T) picks the palette; a white or cobalt piece now and then
    const fi = clamp(L.div(max(uT.sub(1), 1)).mul(8.0).add(c.w.sub(0.5).mul(0.8)), 0, 8);
    const base = mix(uPal.element(int(fi)).xyz, uPal.element(int(min(fi.add(1), 8))).xyz, fract(fi)).mul(c.x.mul(0.45).add(0.75));
    // the low tiers: glazed stone colours too (warm grey, ivory, ochre speckle), not a flat white; the odd cobalt or green tile on every
    // tier; the tower darker at the foot than at the top
    const lowC = select(c.y.lessThan(0.4), vec3(0.30, 0.27, 0.23), select(c.y.lessThan(0.75), vec3(0.55, 0.50, 0.40), vec3(0.50, 0.36, 0.16))).mul(c.x.mul(0.5).add(0.7));
    const speck = step(0.8, fract(c.w.mul(37.0))).mul(0.25);
    const mixed = mix(lowC.mul(float(1).sub(speck)), base, smoothstep(2.2, 3.6, fi));
    const accent = select(c.z.lessThan(0.05), vec3(0.06, 0.14, 0.45), select(c.z.lessThan(0.09), vec3(0.08, 0.28, 0.16), select(c.z.lessThan(0.12), vec3(0.66, 0.63, 0.55), mixed)));
    const col = accent.mul(mix(float(0.68), float(1.0), L.div(max(uT.sub(1), 1))));
    const dark = smoothstep(L.div(max(uT, 1)).negate().add(1.0).sub(0.15), L.div(max(uT, 1)).negate().add(1.0), U.out);   // the reward: from the top down
    const flash = select(fixed.greaterThan(0.5), exp(lockAge.sub(c.x.mul(0.35)).sub(1.2).max(0).mul(-3.0)).mul(step(0.999, fly)), float(0));
    const vN = varying(modelWorldMatrix.mul(vec4(nq, 0)).xyz), vC = varying(col), vF = varying(flash), vQ = varying(q), vS = varying(c);
    const vV = varying(shown.mul(float(1).sub(dark.mul(0.93))));
    m.colorNode = Fn(() => {
      // an irregular piece: the quad cut by three half-planes of its own (gaps between pieces = the grout, the body shows through)
      const s = vS, a1 = s.w.mul(6.283);
      const d1 = dot(vQ, vec2(cos(a1), sin(a1))), d2 = dot(vQ, vec2(cos(a1.add(2.1)), sin(a1.add(2.1)))), d3 = dot(vQ, vec2(cos(a1.add(4.3)), sin(a1.add(4.3))));
      const lim = s.x.mul(0.25).add(0.62);
      If(max(max(d1, d2), d3).greaterThan(lim).or(max(abs(vQ.x), abs(vQ.y)).greaterThan(0.92)), () => { Discard(); });
      const N = normalize(vN), V = normalize(cameraPosition.sub(positionWorld)), Nf = select(dot(N, V).lessThan(0), N.negate(), N);
      const Lw = normalize(V.add(vec3(0, 0.9, 0)).add(vec3(0.3, 0, 0.2)));          // the square's light, from the room's side and above
      const lam = max(dot(Nf, Lw), 0).mul(0.6).add(0.28);
      const face = pow(max(dot(Nf, V), 0), 60).mul(1.3);                              // a glint when its face turns to the eye
      const R = Nf.mul(dot(Nf, Lw).mul(2)).sub(Lw), spec = pow(max(dot(R, V), 0), 50).mul(0.6);
      const edge = smoothstep(lim.sub(0.08), lim, max(max(d1, d2), d3)).mul(0.25);  // a slightly darker rim (the glaze thins at the break)
      const colr = vC.mul(lam).mul(float(1).sub(edge)).add(vec3(1.0, 0.94, 0.85).mul(face.add(spec))).add(vec3(1.0, 0.75, 0.45).mul(vF.mul(0.7)));
      return vec4(colr.mul(vV).mul(uGain).mul(1.25), 1);
    })();
    m.fog = false;
    return m;
  }

  // -------------------------------------------------------------------------------------------- one belt set per wall
  const object = new THREE.Group(); object.name = 'tronc3d';
  build(P.kind === 'quatre' ? 'quatre' : 'tres', Math.round(Math.min(7, Math.max(4, P.tiers ?? 5))));
  towers = walls.map((w) => {
    const U = { built: uniform(0), prog: uniform(0), fixT: uniform(-99), out: uniform(0), time: uTime };
    const mesh = new THREE.Mesh(geo, makeMaterial(U));
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 10; object.add(mesh);
    return { U, mesh, wall: w, lastBuilt: 0 };
  });
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  function placeSelf(t, tilt) {                                        // the chapters' castell rule: 6.5 m beyond the wall, facing the room
    const w = t.wall;
    _p.copy(w.centre).addScaledVector(w.normal, -6.5).setY(0);
    _e.set(0, Math.atan2(w.normal.x, w.normal.z), tilt);
    _q.setFromEuler(_e); _m.compose(_p, _q, _s); t.mesh.matrix.copy(_m); t.mesh.matrixWorldNeedsUpdate = true;
  }
  // kind and tiers of the castell part's castell, from its people count (pinya 54/57 + tronc T·n + pom 4)
  function castellShape(cp) {
    const pp = cp?.stats?.people || 0;
    for (let T = 4; T <= 7; T++) { if (pp === 58 + 3 * T) return ['tres', T]; if (pp === 61 + 4 * T) return ['quatre', T]; }
    return null;
  }

  // -------------------------------------------------------------------------------------------- per frame
  let time = 0, prevTiersBuilt = -1;
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1);
    time = input.time ?? time + dt; uTime.value = time;
    const pr = input.params || P, S = input.state || null;
    const cp = ctx.parts?.castell;
    const shape = castellShape(cp) || [pr.kind === 'quatre' ? 'quatre' : 'tres', Math.round(Math.min(7, Math.max(4, pr.tiers ?? 5)))];
    build(shape[0], shape[1]);
    const T = shape[1];
    let floors, prog, reward, structure;
    if (S) { floors = S.floors || 0; prog = S.floorProgress || 0; reward = S.phase === 'reward' && S.block === 'tronc'; structure = S.walls; }
    else {
      if (pr.cycle > 0) { const c = (time % pr.cycle) / pr.cycle, x = c * 10.5; floors = Math.min(9, Math.floor(x)); prog = x - Math.floor(x); }
      else { floors = pr.floors >= 0 ? Math.round(pr.floors) : Math.round(9 * clamp01(input.progress ?? pr.progress ?? 0)); prog = pr.floorProgress ?? 0.4; }
      reward = !!pr.reward; structure = null;
    }
    // score floors → castell tiers
    const x = Math.min(T, ((floors + (floors >= 9 ? 0 : prog)) * T) / 9), tb = Math.floor(x + 1e-6), tp = x - tb;
    uArrive.value = S ? (input.arrive ?? 1) : (input.arrive ?? pr.arrive ?? 1);
    uLeave.value = S ? (input.leave ?? 0) : (input.leave ?? pr.leave ?? 0);
    uGain.value = pr.gain ?? 1;
    const nw = Math.max(2, Math.min(NW, Math.round(pr.walls ?? NW)));
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i], on = structure ? !!structure[i] : i < nw;
      t.mesh.visible = on && !!geo;
      if (!on) continue;
      if (tb > t.lastBuilt) t.U.fixT.value = time;
      t.lastBuilt = tb;
      t.U.built.value = tb; t.U.prog.value = tp;
      t.U.out.value += ((reward ? 1 : 0) - t.U.out.value) * (1 - Math.exp(-dt * 0.45));
      if (cp?.castells?.[i]?.grp) { const g = cp.castells[i].grp; g.updateMatrixWorld(); t.mesh.matrix.copy(g.matrixWorld); t.mesh.matrixWorldNeedsUpdate = true; }
      else {
        const lean = S ? (S.lean?.[i] || 0) : (pr.lean ?? 0) * (i % 2 ? -1 : 1), weak = S ? (S.weak?.[i] || 0) : (pr.weak ?? 0);
        const shake = (weak / 3) * 0.014 * Math.sin(time * 23 + i * 3.1) * Math.sin(time * 9.7 + i);
        placeSelf(t, -lean * 0.122 + shake);
      }
    }
    if (prevTiersBuilt > tb) for (const t of towers) t.lastBuilt = tb;   // a reset (rehearsal jump back)
    prevTiersBuilt = tb;
  }
  function setParams() { /* read live */ }
  function dispose() { geo?.dispose(); for (const t of towers) t.mesh.material.dispose(); }
  if (typeof window !== 'undefined') window.__tronc3d = { get shards() { return NS; }, get shape() { return built; } };
  return { object, update, setParams, dispose };
}
