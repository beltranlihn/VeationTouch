// Ressonància — «umbral»: the four THRESHOLD ARCHES (block 'wait'). Owner: ARC (T-058 point 2). Imported by ../umbral3d.js (ENT).
//
// What it is (T-058c: FRONTAL by default, see `frontal`; the profile notes below are the T-058b intrados version): four Gaudí arches with real volume, one behind the centre of every wall, framing the door that umbral3d cuts in the
// serpentine. Each is a swept profile along the door's own curve (y = h·(1 − |x/a|^p), metres ON THE WALL PLANE, the same constants
// umbral3d uses in doorK; or door.f(x) / a catenary, see `door` below): seen from the eye its inner back edge IS the door (a hair inside it, so the mosaic's shrinking pieces at the
// cut are hidden), and its rim covers the ragged cut around it. The profile (world metres, 40 cm deep): a small round on the back edge,
// a splayed intrados (20°) with a 22 cm band of fine trencadís (2–4 cm tesserae, joints #F2EBDD; ~70 % rest palette, ~30 % glaze in three fine rows of aqua / cobalt / amber along the arch —
// ref 01) and a 1.5 cm gold bead (the only metal) on its front edge, a fat rounded stucco rim (r 5.5 cm, 16 cm face — ref 05), a step
// back and a second, smaller round; the foot swells into a 9 cm plinth with a soft cove and is buried 5 cm. Sand stucco (#EADBC4, light #F6EEE0, shadow #C9AE8E, matte, procedural grain and mottling) with
// baked occlusion (the intrados −38 % towards its back edge, the step's corner, the foot; a luminance floor of #8A6F58), and a 30 cm
// contact shadow on the floor round each foot. The gold bead has its own glint where it faces the key. Quiet life: the glaze rows sit a
// little veiled at rest and take their full colour as `reveal` grows; a slow sheen runs along the band (every 18 s); near the crown
// (behind the guide's words) the band is rest palette only.
//
// API
//   const arches = createArches(ctx, { walls, env, door, depth });
//     ctx    { THREE (three/webgpu), TSL (three/tsl), room }         (room.eye; room.flash if present: the rims catch the hands' light)
//     walls  room.walls (default ctx.room.walls)                     env    a pre-filtered env texture (umbral3d's own `env`) or null
//     door   { a: 0.9, h: 1.95, p: 4.5 } (or { A, H, P }) — umbral3d's DOOR_A, DOOR_H, DOOR_P (pass them, so the arch follows the opening if ENT changes it);
//            optional f(x) → y (metres on the wall: the exact function the mosaic's cut uses) or type: 'catenary' with k (sag, default 2)
//     depth  metres behind each wall plane of the arch's FRONT face (default 0.12 frontal / 0.62 not); thickness 0.40 (its depth)
//     frontal true (T-058c, default): the arch faces the eye — depth along the eye's rays, face square to the view, the trencadís band on
//            the face, feet on the wall's bottom edge (the reference curve is the FRONT inner edge, so the door's foot at y = 0 on the
//            wall lands on the floor right behind the wall). false: the T-058b arch (splayed intrados, band inside it).
//   → { object, update(dt, state), dispose, info }
//     update(dt, { reveal 0..1, start 0..1, arrive 0..1, leave 0..1, push 0..1 })   (all optional; defaults 0 / 0 / 1 / 0 / 0)
//       arrive: the arches grow from the floor (as the old jambs: smooth(0.3, 0.9, arrive)); push (umbral3d's pushV, 'start' / the way
//       out): they come 2.8·push m into the room and shrink away once push or leave pass 0.75 — exactly what the old `frames` did.
//     info   { span, height, spanWorld, heightWorld, verts, tris, drawCalls }  (span/height as seen on the wall; world size of the arch)
//
// How ENT mounts it (umbral3d.js already does this through a dynamic import since T-058; the static form is):
//   import { createArches } from './umbral3d/arches.js';
//   const arches = createArches({ THREE, TSL, room }, { walls, env, door: { a: DOOR_A, h: DOOR_H, p: DOOR_P } });
//   object.add(arches.object);
//   // in update(), after pushV is computed:  arches.update(dt, { reveal: revealV, start: startV, arrive, leave, push: pushV });
//   // in dispose (if any):                   arches.dispose();
//
// Cost: ONE mesh for all four arches (one material, ~60k triangles) + ONE mesh for the eight contact shadows (transparent, 16 tris):
// two draw calls per wall camera; no lights, no textures, no shadows, nothing allocated per frame (update writes 6 uniforms). The
// fragment work is a 3×3 Voronoi (the band), two Perlin samples (the stucco) and a screen-derivative bump; WebGPU and WebGL2.

export function createArches(ctx, opt = {}) {
  const { THREE, TSL, room } = ctx;
  const walls = opt.walls || room.walls;
  const env = opt.env !== undefined ? opt.env : (room.envMap || null);
  const eye = opt.eye || room.eye;
  const door = opt.door || {};
  const DA = door.a ?? door.A ?? 0.9, DH = door.h ?? door.H ?? 1.95, DP = door.p ?? door.P ?? 4.5;
  // the door's shape, normalised: g(u) = y / H at u = |x| / A (g(0) = 1, g(1) = 0, decreasing). door.f(x) (metres → metres, the same
  // function the mosaic's cut uses) wins; else door.type 'catenary' (k: its sag, default 2): y = H·(cosh k − cosh(k·u)) / (cosh k − 1);
  // else the superellipse y = H·(1 − u^P) (umbral3d until T-058).
  const CK = door.k ?? 2;
  const g = typeof door.f === 'function' ? (u) => door.f(u * DA) / DH
    : door.type === 'catenary' ? (u) => (Math.cosh(CK) - Math.cosh(CK * u)) / (Math.cosh(CK) - 1)
    : (u) => 1 - u ** DP;
  const gInv = (v) => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (g(m) > v) lo = m; else hi = m; } return (lo + hi) / 2; };
  // frontal (default since T-058c, Vicente: «que se sienta que están de frente»): the arch FACES THE EYE — its depth runs along the
  // eye's rays (the intrados is seen edge-on from the centre: no receding sides), its front face is square to the view, the trencadís
  // band lies on that face, and the feet stand on the wall's bottom edge. frontal: false = the T-058b arch (a splayed intrados seen
  // from the room, the band inside it), at `depth` behind the wall measured along the wall normal.
  const FRONTAL = opt.frontal ?? true;
  const D_FRONT = opt.depth ?? (FRONTAL ? 0.12 : 0.62), DEPTH = opt.thickness ?? 0.40, D_BACK = D_FRONT + DEPTH;
  const SPLAY = FRONTAL ? 0 : Math.tan((20 * Math.PI) / 180);   // T-058b: the intrados opened 20° towards the room
  const INSET = 0.035;                                   // the inner silhouette sits this far inside the door (metres on the wall)
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------------------------------- the profile (o outward, z towards the room)
  // a closed polygon with rounded corners; z = 0 is the back plane, z = DEPTH the front. Region of each point: 0 stucco, 1 intrados, 2 gold.
  // the band's span in its own coordinate (z on the intrados; o on the front face when frontal) and the gold bead beside it
  const BAND0 = FRONTAL ? 0.09 : 0.06, BAND1 = FRONTAL ? 0.235 : 0.278, BEAD0 = FRONTAL ? 0.061 : 0.282, BEAD1 = FRONTAL ? 0.079 : 0.3, BEAD_R = 0.009;
  const oi = (z) => SPLAY * z;                           // the intrados (splayed: wider towards the room)
  const RIM = FRONTAL ? 0.30 : 0.16, STEP_Z = DEPTH - (FRONTAL ? 0.08 : 0.075), STEP_O = FRONTAL ? 0.05 : 0.06;
  const corners = [
    { o: oi(0), z: 0, r: 0.02 },                           // A back inner edge
    { o: oi(DEPTH), z: DEPTH, r: 0.055 },                  // B front inner edge: the fat round of the rim
    { o: oi(DEPTH) + RIM, z: DEPTH, r: 0.05 },             // C front outer edge
    { o: oi(DEPTH) + RIM, z: STEP_Z, r: 0.012 },           // D the step (concave)
    { o: oi(DEPTH) + RIM + STEP_O, z: STEP_Z, r: 0.03 },   // E the second, smaller round
    { o: oi(DEPTH) + RIM + STEP_O, z: 0, r: 0.008 },       // F back outer edge
  ];
  const prof = [];                                       // { o, z, reg }
  {
    const n = corners.length, arcs = [];
    for (let i = 0; i < n; i++) {
      const p = corners[(i + n - 1) % n], c = corners[i], q = corners[(i + 1) % n];
      let d1o = c.o - p.o, d1z = c.z - p.z; const l1 = Math.hypot(d1o, d1z); d1o /= l1; d1z /= l1;
      let d2o = q.o - c.o, d2z = q.z - c.z; const l2 = Math.hypot(d2o, d2z); d2o /= l2; d2z /= l2;
      const turn = Math.acos(Math.max(-1, Math.min(1, d1o * d2o + d1z * d2z)));
      const t = c.r * Math.tan(turn / 2);
      const s = { o: c.o - d1o * t, z: c.z - d1z * t }, e = { o: c.o + d2o * t, z: c.z + d2z * t };
      const cross = d1o * d2z - d1z * d2o;               // < 0: right turn (convex, the polygon runs clockwise)
      const no = cross < 0 ? d1z : -d1z, nz = cross < 0 ? -d1o : d1o;   // from s towards the arc's centre
      const cc = { o: s.o + no * c.r, z: s.z + nz * c.r };
      const a0 = Math.atan2(s.z - cc.z, s.o - cc.o); let a1 = Math.atan2(e.z - cc.z, e.o - cc.o);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const N = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 11)));
      const pts = []; for (let k = 0; k <= N; k++) { const a = a0 + (da * k) / N; pts.push({ o: cc.o + Math.cos(a) * c.r, z: cc.z + Math.sin(a) * c.r, reg: 0 }); }
      arcs.push(pts);
    }
    for (let i = 0; i < n; i++) {
      for (const p of arcs[i]) prof.push(p);
      if (FRONTAL && i === 1) {                          // B → C: the front face, with the gold bead and the band's edges
        const oB = arcs[1][arcs[1].length - 1].o, oC = arcs[2][0].o, zf = DEPTH;
        if (BEAD0 - 0.004 > oB + 1e-4) prof.push({ o: BEAD0 - 0.004, z: zf, reg: 1, bu: BEAD0 - 0.004 });
        for (let k = 0; k <= 8; k++) {                   // the bead: a half round proud of the face (Ø 1.8 cm, 1 cm proud)
          const a = (k / 8) * Math.PI, oc = (BEAD0 + BEAD1) / 2, o = oc - Math.cos(a) * BEAD_R;
          prof.push({ o, z: zf + Math.sin(a) * BEAD_R * 1.15, reg: 2, bu: o });
        }
        for (let o = BEAD1 + 0.004; o < oC - 1e-4; o = o < BAND0 ? BAND0 : o + 0.03) prof.push({ o, z: zf, reg: 1, bu: o });
      }
      if (!FRONTAL && i === 0) {                         // A → B: the intrados run, with the band's edges and the gold bead
        const zA = arcs[0][arcs[0].length - 1].z, zB = arcs[1][0].z;
        const zs = [];
        for (let z = zA; z < BAND0; z += 0.02) zs.push(z);
        for (let z = BAND0; z < BEAD0 - 0.003; z += 0.03) zs.push(z);
        zs.push(BEAD0 - 0.003);
        for (const z of zs) if (z > zA + 1e-4) prof.push({ o: oi(z), z, reg: 1, bu: z });
        for (let k = 0; k <= 8; k++) {                   // the bead: a half round proud of the intrados (Ø 1.8 cm, 1 cm proud)
          const a = (k / 8) * Math.PI, zc = (BEAD0 + BEAD1) / 2;
          prof.push({ o: oi(zc - Math.cos(a) * BEAD_R) - Math.sin(a) * BEAD_R * 1.15, z: zc - Math.cos(a) * BEAD_R, reg: 2, bu: zc - Math.cos(a) * BEAD_R });
        }
        for (let z = BEAD1 + 0.003; z < zB - 1e-4; z += 0.02) prof.push({ o: oi(z), z, reg: 1, bu: z });
      }
    }
    // normals (outward: the left normal of the clockwise polygon) and baked occlusion
    const K = prof.length, D = corners[3];
    for (let i = 0; i < K; i++) {
      const a = prof[(i + K - 1) % K], b = prof[(i + 1) % K];
      let to = b.o - a.o, tz = b.z - a.z; const l = Math.hypot(to, tz) || 1; to /= l; tz /= l;
      const p = prof[i]; p.no = -tz; p.nz = to;
      let ao = 1;
      if (p.bu === undefined) p.bu = -1;
      if ((!FRONTAL && p.reg >= 1) || (p.o < oi(p.z) + 0.004 && p.z > 0.01 && p.z < DEPTH - 0.04)) ao = 0.65 + 0.35 * smooth(0.02, DEPTH - 0.06, p.z);   // deep in the intrados (T-066: −35 %, ART; the luminance floor keeps it ≥ #8A6F58)
      ao *= 1 - 0.32 * Math.exp(-Math.hypot(p.o - D.o, p.z - D.z) / 0.03);                                                     // the step's corner
      if (p.z < 0.004 && p.no < 0.5) ao *= 0.75;                                                                                // the back (unseen)
      if (p.no > 0.7 && p.z < STEP_Z - 0.02) ao *= 0.88;                                                                         // the outer side
      p.ao = ao;
    }
  }
  const K = prof.length;

  // ------------------------------------------------------------------------------------------- the sweep, wall by wall
  const pos = [], nor = [], aInfo = [], aMisc = [], aFoot = [], aDir = [], idx = [];
  const shPos = [], shUV = [], shFoot = [], shDir = [], shIdx = [];
  const C = new THREE.Vector3(), Pt = new THREE.Vector3(), Tn = new THREE.Vector3(), No = new THREE.Vector3(), Zw = new THREE.Vector3(), V = new THREE.Vector3(), AX = new THREE.Vector3();
  const A2 = DA - INSET, H2 = DH - INSET;
  let spanW = 0, heightW = 0;
  for (const w of walls) {
    const dw = -((w.centre.x - eye.x) * w.normal.x + (w.centre.z - eye.z) * w.normal.z);
    const kb = (dw + (FRONTAL ? D_FRONT : D_BACK)) / dw;   // the reference curve: the front face's inner edge (frontal) or the back edge
    const wallPt = (t, out) => { const xd = t * A2, yd = H2 * g(Math.abs(t)); return out.copy(w.centre).addScaledVector(w.right, xd).setY(yd).sub(eye).multiplyScalar(kb).add(eye); };
    // the foot: where the reference curve meets the floor (t where world y = 0)
    const yFloor = eye.y * (1 - 1 / kb);                 // wall-plane height that projects to the floor at the reference depth
    const tF = Math.min(0.999, gInv(Math.max(0, yFloor / H2)));
    // stations along the back curve, from foot to foot: every 4.5 cm, every 1.2 cm over the last 18 cm of each foot (the plinth)
    const dense = [], acc = [0], ND = 1200;
    for (let k = 0; k <= ND; k++) dense.push(-tF + (2 * tF * k) / ND);
    const P0 = new THREE.Vector3(), P1 = new THREE.Vector3();
    for (let k = 1; k <= ND; k++) acc.push(acc[k - 1] + wallPt(dense[k], P0).distanceTo(wallPt(dense[k - 1], P1)));
    const L = acc[ND], FOOTL = Math.min(0.18, acc[ND] / 4), wants = [], ts = [];
    { const nf = Math.ceil(FOOTL / 0.012), nm = Math.max(8, Math.round((L - 2 * FOOTL) / 0.045));
      for (let i = 0; i < nf; i++) wants.push((i / nf) * FOOTL);
      for (let i = 0; i < nm; i++) wants.push(FOOTL + (i / nm) * (L - 2 * FOOTL));
      for (let i = 0; i <= nf; i++) wants.push(L - FOOTL + (i / nf) * FOOTL); }
    const M = wants.length - 1;
    for (let m = 0, j = 0; m <= M; m++) { const want = wants[m]; while (j < ND - 1 && acc[j + 1] < want) j++; ts.push(dense[j] + (dense[j + 1] - dense[j]) * ((want - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]))); }
    Zw.copy(w.normal);
    AX.copy(w.centre).setY(H2 * 0.45).sub(eye).multiplyScalar(kb).add(eye);   // a point inside the opening (to orient "outward")
    const foot = new THREE.Vector3().copy(w.centre).sub(eye).multiplyScalar((dw + D_FRONT + DEPTH / 2) / dw).add(eye); foot.y = 0;
    spanW = Math.max(spanW, wallPt(-tF, P0).distanceTo(wallPt(tF, P1))); heightW = Math.max(heightW, wallPt(0, P0).y);
    const base = pos.length / 3;
    for (let m = 0; m <= M; m++) {
      const t = ts[m]; wallPt(t, C);
      const tA = ts[Math.max(0, m - 1)], tB = ts[Math.min(M, m + 1)];
      Tn.subVectors(wallPt(tB, P0), wallPt(tA, P1)).normalize();
      if (FRONTAL) Zw.subVectors(eye, C).normalize();    // depth along the eye's ray: the face is square to the view
      No.crossVectors(Tn, Zw).normalize(); if (No.dot(V.subVectors(C, AX)) < 0) No.negate();
      if (!FRONTAL && (m === 0 || m === M)) No.copy(w.right).multiplyScalar(t < 0 ? -1 : 1);   // the feet: plumb
      const yd = H2 * g(Math.abs(t));
      const quiet = smooth(1.5, 1.75, yd);               // behind the guide's words (on the wall, 1.75–2.2 m): bone / cream
      const sArc = wants[m];
      const floorAO = 0.55 + 0.45 * smooth(0, 0.6, C.y);
      const plinth = 0.024 * (1 - smooth(0.07, 0.105, C.y));   // the plinth: the foot swells 2.4 cm over its last 9 cm, with a soft cove
      for (let k = 0; k < K; k++) {
        const p = prof[k];
        Pt.copy(C).addScaledVector(No, p.o + p.no * plinth).addScaledVector(Zw, p.z - (FRONTAL ? DEPTH : 0) + p.nz * plinth);   // z = 0 is the back
        if (m === 0 || m === M) Pt.y = -0.05;                // buried 5 cm in the sand
        else if (Pt.y < -0.05) Pt.y = -0.05;                 // (frontal: the deep part of a foot runs under the floor along the ray)
        const n = V.copy(No).multiplyScalar(p.no).addScaledVector(Zw, p.nz).normalize();
        pos.push(Pt.x, Pt.y, Pt.z); nor.push(n.x, n.y, n.z);
        aInfo.push(sArc, p.bu, p.reg, Math.max(0.5, p.ao * floorAO));
        aMisc.push(quiet, sArc / L, p.z);
        aFoot.push(foot.x, foot.y, foot.z); aDir.push(w.normal.x, w.normal.y, w.normal.z);
      }
    }
    // indices (the winding checked once against the normals)
    let flip = false;
    {
      const i0 = base + 1, i1 = base + K + 1, i2 = base + 2;
      const ax = pos[i1 * 3] - pos[i0 * 3], ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1], az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
      const bx = pos[i2 * 3] - pos[i0 * 3], by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1], bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
      const gx = ay * bz - az * by, gy = az * bx - ax * bz, gz = ax * by - ay * bx;
      flip = gx * nor[i0 * 3] + gy * nor[i0 * 3 + 1] + gz * nor[i0 * 3 + 2] < 0;
    }
    for (let m = 0; m < M; m++) for (let k = 0; k < K; k++) {
      const a = base + m * K + k, b = base + (m + 1) * K + k, c = base + (m + 1) * K + ((k + 1) % K), d = base + m * K + ((k + 1) % K);
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    // contact shadows: one soft rounded rectangle on the floor under each foot (footprint + 30 cm)
    for (const sg of [-1, 1]) {
      wallPt(sg * tF, C); C.y = 0;
      const oMid = (corners[4].o) / 2, hz = FRONTAL ? 0.1 : DEPTH / 2;
      const cx = C.clone().addScaledVector(w.right, sg * oMid).addScaledVector(w.normal, FRONTAL ? -0.08 : DEPTH / 2);
      const hu = oMid + 0.32, hv = hz + 0.32, b0 = shPos.length / 3;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const q = cx.clone().addScaledVector(w.right, u * hu).addScaledVector(w.normal, v * hv);
        shPos.push(q.x, 0.004, q.z); shUV.push(u * hu, v * hv, hu - 0.32, hv - 0.32); shFoot.push(foot.x, 0, foot.z); shDir.push(w.normal.x, w.normal.y, w.normal.z);
      }
      shIdx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const F = (arr) => new Float32Array(arr);
  geo.setAttribute('position', new THREE.BufferAttribute(F(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(F(nor), 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(F(aInfo), 4)); geo.setAttribute('aMisc', new THREE.BufferAttribute(F(aMisc), 3));
  geo.setAttribute('aFoot', new THREE.BufferAttribute(F(aFoot), 3)); geo.setAttribute('aDir', new THREE.BufferAttribute(F(aDir), 3));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.computeVertexNormals();                            // smooth normals from the real surface (the plinth's cove included)
  geo.computeBoundingSphere();

  // ------------------------------------------------------------------------------------------- the material (one for stucco, band and gold)
  const { Fn, attribute, uniform, varying, float, vec2, vec3, vec4, mix, smoothstep, step, abs, floor, fract, sin, dot, max, min, clamp, exp, length, mod,
    positionGeometry, positionView, normalView, faceDirection, fwidth } = TSL;
  const uGrow = uniform(1), uPush = uniform(0), uReveal = uniform(0), uSweep = uniform(-1), uStart = uniform(0), uVis = uniform(1);
  const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const ST_LIGHT = lin('#F6EEE0'), ST_SHADOW = lin('#C9AE8E'), FLOOR_C = lin('#8A6F58'), GROUT = lin('#F2EBDD'), GOLD = lin('#C9A45C');
  const COBALT = lin('#2F7DB0'), AQUA = lin('#1FA39A'), JADE = lin('#35B88A'), AMBER = lin('#E0A22B'), BONE = lin('#F4EDE1'), CREAM = lin('#EBDCC2');
  const noise = TSL.mx_noise_float || null;

  const grow = (p) => attribute('aFoot', 'vec3').add(p.sub(attribute('aFoot', 'vec3')).mul(uGrow)).add(attribute('aDir', 'vec3').mul(uPush));

  const mat = new THREE.MeshStandardNodeMaterial({ envMap: env, envMapIntensity: 0.55 });
  mat.positionNode = grow(TSL.positionLocal);
  const info = attribute('aInfo', 'vec4'), misc = attribute('aMisc', 'vec3');
  const S = info.x, Z = info.y, reg = varying(info.z), AO = info.w, quiet = misc.x, sN = misc.y, PZ = misc.z;   // Z: the band's coordinate
  const P = varying(positionGeometry);

  // stucco: two scales of Perlin (mottling ~15 cm, grain ~6 mm)
  const n1 = noise ? noise(P.mul(6.5)) : sin(P.x.mul(23).add(sin(P.y.mul(17)))).mul(0.5);
  const n2 = noise ? noise(P.mul(160)) : sin(P.x.mul(400).add(P.y.mul(377)).add(P.z.mul(311))).mul(0.5);
  const stucco = mix(ST_SHADOW, ST_LIGHT, clamp(float(0.6).add(n1.mul(0.2)).add(n2.mul(0.09)), 0, 1));

  // the band: Voronoi tesserae on (s, z) in metres, ~3 cm
  const isRun = step(0.5, reg).mul(float(1).sub(step(1.5, reg)));
  const inBand = isRun.mul(smoothstep(BAND0 - 0.002, BAND0 + 0.002, Z)).mul(float(1).sub(smoothstep(BAND1 - 0.002, BAND1 + 0.002, Z)));
  const isGold = step(1.5, reg);
  const CELL = 0.032, q = vec2(S, Z).div(CELL), qi = floor(q), qf = fract(q);   // tesserae of 2–4 cm
  const h2 = (c) => fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))).mul(43758.5453));
  let f1 = float(9), f2 = float(9), cid = vec2(0, 0);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gg = vec2(i, j), c = qi.add(gg), o = h2(c).mul(0.8).add(0.1), d = length(gg.add(o).sub(qf));
    const closer = step(d, f1);
    f2 = mix(min(f2, d), f1, closer); cid = mix(cid, c, closer); f1 = min(f1, d);
  }
  const edge = f2.sub(f1).mul(CELL * 0.5);              // metres to the joint (approx.)
  const fw = length(vec2(fwidth(S), fwidth(Z))).max(1e-5);
  const GR = 0.0013;                                      // half the joint (2.6 mm) — never thinner than ~1 px, so every tile is drawn
  const GRw = clamp(fw.mul(0.7), GR, 0.005);
  const groutSharp = float(1).sub(smoothstep(GRw.sub(fw.mul(0.5)), GRw.add(fw.mul(0.5)), edge));
  const grout = mix(groutSharp, float(0.2), smoothstep(CELL / 6, CELL / 3, fw));
  const bevel = mix(float(0.74), float(1), smoothstep(GRw, GRw.add(fw).add(0.005), edge));   // each tile's edge turns from the light
  const hc = h2(cid.add(17.3)), ht = h2(cid.add(3.7)), cellS = cid.x.add(0.5).mul(CELL), cellZ = cid.y.add(0.5).mul(CELL);
  // ~70 % the rest palette (ARTE-ENTRADA a: bone 30 · cream 22 · sand 18 · water green 12 · mist blue 10 · sage 8), ~30 % glaze
  // (ref 01: aqua, cobalt, amber); behind the words (the crown) only the rest palette
  const u = hc.y;
  let restC = mix(lin('#F4EDE1'), lin('#EBDCC2'), step(0.30, u)); restC = mix(restC, lin('#DCC3A0'), step(0.52, u)); restC = mix(restC, lin('#CFE3D8'), step(0.70, u));
  restC = mix(restC, lin('#C9D8E4'), step(0.82, u)); restC = mix(restC, lin('#C5CFAE'), step(0.92, u));
  // the glaze runs in three fine lines ALONG the arch (rows of tiles, jittered: trencadís, not print): aqua, a sparse blue, amber
  const row = (n) => step(abs(cid.y.sub(n)), 0.5);
  const R0 = Math.floor(BAND0 / CELL) + 1, RN = Math.floor(BAND1 / CELL) - 1;
  const r1 = row(R0), r3 = row(RN), r2 = row(Math.round((R0 + RN) / 2)).mul(step(hc.x, 0.4)).mul(float(1).sub(r3)).mul(float(1).sub(r1));
  const glazeF = AQUA.mul(r1).add(COBALT.mul(r2)).add(AMBER.mul(r3));
  const inG = r1.add(r2).add(r3).min(1).mul(float(1).sub(step(0.5, quiet)));
  const glazeNow = mix(mix(glazeF, CREAM, 0.12), glazeF, uReveal.mul(0.8).add(uStart.mul(0.2)).min(1));
  const tess = mix(restC, glazeNow, inG).mul(ht.x.mul(0.1).add(0.95)).mul(bevel);
  const bandCol = mix(tess, GROUT, grout);

  const albedo = mix(mix(stucco, bandCol, inBand), GOLD, isGold);
  // the floor of value (#8A6F58) is a floor of LUMINANCE, not per channel (a per-channel max turned the cobalt mauve)
  const lum = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722)), c0 = albedo.mul(AO);
  mat.colorNode = c0.mul(max(float(1), lum(FLOOR_C).div(max(lum(c0), 1e-4))));
  mat.roughnessNode = mix(mix(float(0.86), mix(float(0.24).add(hc.x.mul(0.1)), float(0.95), grout), inBand), float(0.3), isGold);
  mat.metalnessNode = isGold.mul(0.6);

  // bump: stucco grain (≤ 0.6 mm), tesserae a hair tilted, the joint sunk 1 mm (faded where it would alias)
  const tilt = h2(cid.add(5.1)).sub(0.5).mul(0.07);
  const hBand = smoothstep(0, 0.0035, edge.sub(GR)).mul(0.001).add(dot(vec2(S, Z).sub(vec2(cellS, cellZ)), tilt)).mul(float(1).sub(smoothstep(0.004, 0.012, fw)));
  const H = mix(n2.mul(0.0005).add(n1.mul(0.001)), hBand, inBand);
  mat.normalNode = Fn(() => {
    const dHx = H.dFdx(), dHy = H.dFdy();
    const sx = positionView.dFdx().normalize(), sy = positionView.dFdy().normalize(), nv = normalView;
    const r1 = sy.cross(nv), r2 = nv.cross(sx), det = sx.dot(r1).mul(faceDirection);
    const grad = det.sign().mul(dHx.mul(r1).add(dHy.mul(r2)));
    return det.abs().mul(nv).sub(grad).normalize();
  })();

  // a little light of its own (so the shade never falls below the floor of value), the band's slow sheen, the hands' light on the rims
  const sheen = exp(sN.sub(uSweep).div(0.045).pow(2).negate()).mul(inBand).mul(float(1).sub(grout)).mul(uReveal.mul(0.06).add(0.035));
  // the gold bead: its own glint where it faces the key (from above and from the room), so the 1.5 cm filet reads as metal at 5–10 m
  const kDir = TSL.normalize(vec3(0, 0.8, 0).add(attribute('aDir', 'vec3').mul(0.6)));
  const glint = max(dot(TSL.normalWorld, kDir), 0).pow(14).mul(0.55).add(0.1).mul(isGold);
  const rimMask = step(reg, 0.5).mul(step(DEPTH - 0.09, PZ));
  const flash = room?.flash ? room.flash(TSL.positionWorld) : float(0);
  mat.emissiveNode = albedo.mul(0.045).add(lin('#FFE6B0').mul(glint)).add(tess.mul(sheen)).add(lin('#FFE2B8').mul(flash.mul(rimMask).mul(0)))   /* studio 25-11 (Beltrán): no hand light on the rims (was 0.09) */.mul(uVis);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;

  // contact shadows
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(F(shPos), 3)); sgeo.setAttribute('aRect', new THREE.BufferAttribute(F(shUV), 4));
  sgeo.setAttribute('aFoot', new THREE.BufferAttribute(F(shFoot), 3)); sgeo.setAttribute('aDir', new THREE.BufferAttribute(F(shDir), 3));
  sgeo.setIndex(shIdx); sgeo.computeBoundingSphere();
  const smat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  smat.positionNode = grow(TSL.positionLocal);
  { const r = attribute('aRect', 'vec4'), dq = max(abs(r.xy).sub(r.zw), 0), d = length(dq);
    smat.colorNode = vec3(0.403, 0.255, 0.148);                                    // T-069 (ART): #B89A78 ON SCREEN (ACES-inverted, unlit, like the sand floor)
    smat.opacityNode = float(1).sub(smoothstep(0.0, 0.15, d)).mul(0.4).mul(uVis); }   // 40 % only in the 15 cm next to the plinth
  const shadow = new THREE.Mesh(sgeo, smat); shadow.frustumCulled = false; shadow.renderOrder = 2;

  const object = new THREE.Group(); object.name = 'umbral3d.arches';
  object.add(mesh);   // studio 25-11 (Beltrán): no floor shadow — on the night ground its sand tone read as a beam of light behind each foot

  // ------------------------------------------------------------------------------------------- life
  let time = 0, rv = 0;
  function update(dt, st = {}) {
    dt = Math.min(dt || 0, 0.1); time += dt;
    const reveal = st.reveal ?? 0, start = st.start ?? 0, arrive = st.arrive ?? 1, leave = st.leave ?? 0, push = st.push ?? 0;
    rv += (reveal - rv) * (1 - Math.exp(-dt * 1.2));
    uReveal.value = rv; uStart.value = start;
    const k = 1 - smooth(0.75, 1, Math.max(push, leave)), g = smooth(0.3, 0.9, arrive) * k;
    uGrow.value = Math.max(0.001, g); uPush.value = 2.8 * push;
    uVis.value = 1;
    object.visible = arrive * k > 0.01;
    const ph = (time % 18) / 18; uSweep.value = -0.2 + ph * 1.6;       // the sheen: once along every arch in ~11 s, then a rest
  }
  update(0, {});

  return {
    object,
    update,
    dispose() { geo.dispose(); mat.dispose(); sgeo.dispose(); smat.dispose(); object.removeFromParent(); },
    info: { span: 2 * DA, height: DH, spanWorld: +spanW.toFixed(3), heightWorld: +heightW.toFixed(3), verts: pos.length / 3, tris: idx.length / 3, drawCalls: 2 },
  };
}
