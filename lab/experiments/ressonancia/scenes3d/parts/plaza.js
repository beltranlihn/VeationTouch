// Ressonància — part «plaza»: the room becomes a square of Barcelona's old town at night, seen from its middle.
// Contract: ../PARTS.md. Everything is procedural (no assets): stone facades all round (sandstone ashlar and old stucco, arcades,
// balconies with wrought-iron railings, shutters and blinds, lit rooms with depth), a Gothic church with its rose window and bell
// tower, four streets leaving from the corners, worn damp slabs, gas-style fanals, a deep moonlit sky and a haze lit by the lamps.
//
// Choreography on input.t (the intro's clock, s):
//   0–8    black.
//   8–22   the lamps light one by one round the room, from the direction of room.walls[0] both ways, meeting opposite at ~22 s
//          (in step with the line of light another part draws round the walls); moonlight and sky rise until 25 s; windows follow.
//   25–46  the square at rest: haze drifts, a window flickers, one lights late, one goes out.
//   46–58  it breaks: a vibration, then the facades come apart into floating panes of stone and mirror that drift up and apart.
//   58–70  the fragments thin out into the dark; a few keep glinting.
// Review overrides: params.reveal (0..1 = the 8–25 s lighting) and params.shatter (0..1 = 46–70 s) replace the clock when > 0.
//
// How it is built (draw calls and cost): four sides, each merged into 4 meshes (stone, iron/wood, glass, mirror shards) so every
// wall's camera culls the far sides; floor and sky are one mesh each. Every vertex carries its FRAGMENT (centre + seed): the break
// is a vertex-stage displacement and rotation (no CPU work per frame). Light: 16 point lights (the fanals), moon + hemisphere, no
// shadows; the haze is an analytic single-scattering fog computed from the eye (the same for the four cameras, so no seam at the
// corners): each lamp gets its volumetric halo for free. Wet floor: real specular + streaky fake reflections of every lamp.
export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, uniformArray, attribute, vec2, vec3, vec4, float, positionWorld, positionLocal, normalLocal, normalView, normalWorld,
    positionView, cameraPosition, mix, smoothstep, clamp, sin, cos, fract, floor, abs, max, min, pow, exp, length, normalize, dot,
    cross, mx_noise_float, mx_fractal_noise_float, uv, Loop, If, output, select, atan, sqrt, step, reflectVector, sign, cameraWorldMatrix,
  } = TSL;

  // ------------------------------------------------------------------------------------------------ seeded randomness
  let seed = 20261123;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
  const UP = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------------------------------------------ the room → the square
  const walls = room.walls, NW = walls.length;
  const NS = 4;                                                       // the square has four sides (one per wall in the lab room)
  const D = [], side = [];
  for (let k = 0; k < NS; k++) {
    const w = walls[k % NW];
    const dw = -w.centre.dot(w.normal);                               // eye-to-wall distance (3.2–3.7 m)
    D.push(dw < 3.4 ? 17.5 : 18.5);
    side.push({ n: w.normal.clone(), t: w.right.clone() });
  }
  const SW = 4.6, LS = 24;                                            // street width, street length visible from the square
  const frame = (o, t, n) => ({ o: o.clone(), t: t.clone(), n: n.clone() });
  const sideFrame = (k, extra = 0) => frame(side[k].n.clone().multiplyScalar(-(D[k] + extra)), side[k].t, side[k].n);

  // where a direction from the eye meets the walls, as a strip position: 0 at the centre of walls[0], 1 on the opposite side
  const perim = walls.reduce((a, w) => a + w.width, 0);
  const _q = new THREE.Vector3(), _d = new THREE.Vector3();
  function stripS(x, z) {
    _d.set(x - room.eye.x, 0, z - room.eye.z).normalize();
    let acc = 0, best = 0, bestT = Infinity;
    for (const w of walls) {
      const denom = _d.dot(w.normal);
      if (denom < -1e-6) {
        const tt = (w.centre.clone().sub(room.eye.clone().setY(0)).dot(w.normal)) / denom;
        _q.copy(room.eye).setY(0).addScaledVector(_d, tt);
        const along = _q.clone().sub(w.pa).dot(w.right);
        if (tt > 0 && tt < bestT && along >= -0.01 && along <= w.width + 0.01) { bestT = tt; best = acc + along; }
      }
      acc += w.width;
    }
    const s0 = walls[0].width / 2;
    let d = (best - s0) % perim; if (d < 0) d += perim;
    return Math.min(d, perim - d) / (perim / 2);
  }
  const lightTime = (x, z) => 8 + 14 * stripS(x, z);                 // when the line of light passes this direction

  // ------------------------------------------------------------------------------------------------ geometry accumulation
  const GB = () => ({ p: [], n: [], uv: [], c: [], f: [], i: [], e: [] });
  const B = { stone: [], detail: [], glass: [], mirror: [] };
  for (const k in B) for (let s = 0; s < NS; s++) B[k].push(GB());
  const St = { side: 0, frag: [0, 0, 0, 0.5], info: [0, 0, 0, 0], ext: [0, 0, 0, 0], col: [1, 1, 1] };
  const W3 = (F, u, v, w) => [F.o.x + F.t.x * u + F.n.x * w, F.o.y + v + F.t.y * u + F.n.y * w, F.o.z + F.t.z * u + F.n.z * w];
  function vert(b, x, y, z, nx, ny, nz, a, c, ao) {
    b.p.push(x, y, z); b.n.push(nx, ny, nz); b.uv.push(a, c);
    b.c.push(St.col[0] * ao, St.col[1] * ao, St.col[2] * ao); b.f.push(...St.frag); b.i.push(...St.info); b.e.push(...St.ext);
  }
  // a quad in frame-local coordinates (u along the facade, v up, w towards the square); nl = local normal [nt, nu, nn]
  function quad(mat, F, q, nl, uvs, ao = 1) {
    const b = B[mat][St.side];
    const nx = F.t.x * nl[0] + F.n.x * nl[2], ny = nl[1] + F.t.y * nl[0], nz = F.t.z * nl[0] + F.n.z * nl[2];
    const pts = q.map((p) => W3(F, p[0], p[1], p[2]));
    for (const k of [0, 1, 2, 0, 2, 3]) vert(b, ...pts[k], nx, ny, nz, uvs[k][0], uvs[k][1], ao);
  }
  // an axis-aligned box in the frame: u0..u1 (along), v0..v1 (up), w0..w1 (out of the facade). UVs in metres. Baked AO by face.
  function box(mat, F, u0, u1, v0, v1, w0, w1, skipBack = false, noCaps = false) {
    quad(mat, F, [[u0, v0, w1], [u1, v0, w1], [u1, v1, w1], [u0, v1, w1]], [0, 0, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], 1);
    if (!skipBack) quad(mat, F, [[u1, v0, w0], [u0, v0, w0], [u0, v1, w0], [u1, v1, w0]], [0, 0, -1], [[u1, v0], [u0, v0], [u0, v1], [u1, v1]], 0.7);
    quad(mat, F, [[u1, v0, w1], [u1, v0, w0], [u1, v1, w0], [u1, v1, w1]], [1, 0, 0], [[w1, v0], [w0, v0], [w0, v1], [w1, v1]], 0.82);
    quad(mat, F, [[u0, v0, w0], [u0, v0, w1], [u0, v1, w1], [u0, v1, w0]], [-1, 0, 0], [[w0, v0], [w1, v0], [w1, v1], [w0, v1]], 0.82);
    if (!noCaps) quad(mat, F, [[u0, v1, w1], [u1, v1, w1], [u1, v1, w0], [u0, v1, w0]], [0, 1, 0], [[u0, w1], [u1, w1], [u1, w0], [u0, w0]], 1);
    if (!noCaps) quad(mat, F, [[u0, v0, w0], [u1, v0, w0], [u1, v0, w1], [u0, v0, w1]], [0, -1, 0], [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], 0.55);
  }
  const bar = (mat, F, u0, u1, v0, v1, w0, w1) => box(mat, F, u0, u1, v0, v1, w0, w1, false, true);   // thin vertical bar: no caps
  // a moulding: a profile [[w, v], ...] (from the wall, out and around, back to the wall) swept along u0..u1, with end caps
  function sweep(mat, F, prof, u0, u1, vBase, wBase = 0) {
    let acc = vBase;
    for (let k = 0; k < prof.length - 1; k++) {
      const [w0, v0] = prof[k], [w1, v1] = prof[k + 1];
      const dw = w1 - w0, dv = v1 - v0, L = Math.hypot(dw, dv) || 1e-6;
      const ao = dv < -0.001 || (dw > 0.001 && Math.abs(dv) < 0.001) ? 0.6 : 1;
      quad(mat, F, [[u0, vBase + v0, wBase + w0], [u1, vBase + v0, wBase + w0], [u1, vBase + v1, wBase + w1], [u0, vBase + v1, wBase + w1]],
        [0, -dw / L, dv / L], [[u0, acc], [u1, acc], [u1, acc + L], [u0, acc + L]], ao);
      acc += L;
    }
    const contour = prof.map(([w, v]) => new THREE.Vector2(w, v));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const b = B[mat][St.side];
    for (const [ia, ib, ic] of tris) {
      for (const [uu, sgn] of [[u0, -1], [u1, 1]]) {
        const A = prof[ia], Bp = prof[ib], C = prof[ic];
        const cr = (Bp[0] - A[0]) * (C[1] - A[1]) - (Bp[1] - A[1]) * (C[0] - A[0]);   // orientation in (w, v)
        // the cap at u1 faces +t: in (w, v) seen from +t, w grows to the LEFT, so a CCW-in-(w,v) triangle must be reversed there
        const order = (cr > 0) === (sgn < 0) ? [A, Bp, C] : [A, C, Bp];
        for (const p of order) { const q = W3(F, uu, vBase + p[1], wBase + p[0]); vert(b, ...q, F.t.x * sgn, F.t.y * sgn, F.t.z * sgn, p[0], vBase + p[1], 0.85); }
      }
    }
  }
  // any BufferGeometry, transformed by a matrix (positions in metres; uv kept as given)
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  function addGeo(mat, geo, m, ao = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    _nm.getNormalMatrix(m);
    const b = B[mat][St.side];
    for (let k = 0; k < pa.count; k++) {
      _v.fromBufferAttribute(pa, k).applyMatrix4(m); _n.fromBufferAttribute(na, k).applyMatrix3(_nm).normalize();
      vert(b, _v.x, _v.y, _v.z, _n.x, _n.y, _n.z, ua ? ua.getX(k) : 0, ua ? ua.getY(k) : 0, ao);
    }
    geo.dispose(); if (g !== geo) g.dispose();
  }
  const _m4 = new THREE.Matrix4(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
  function fmat(F, u, v, w) { const p = W3(F, u, v, w); return _m4.makeBasis(F.t, UP, F.n).setPosition(p[0], p[1], p[2]); }
  // the fragment every following vertex belongs to (centre in world space + a seed)
  function frag(F, u, v, w = 0) { const c = W3(F, u, v, w); St.frag = [c[0], c[1], c[2], rnd()]; return St.frag; }
  const fragW = (x, y, z) => { St.frag = [x, y, z, rnd()]; return St.frag; };

  // shapes for openings (u, v points from the left springing over the top to the right springing)
  function archTop(a, b, vs, kind, seg = 14) {
    const pts = [], half = (b - a) / 2, cx = (a + b) / 2;
    if (kind === 'flat') { pts.push([a, vs], [b, vs]); return pts; }
    if (kind === 'round') { for (let k = 0; k <= seg; k++) { const t = Math.PI - (k / seg) * Math.PI; pts.push([cx + half * Math.cos(t), vs + half * Math.sin(t)]); } return pts; }
    if (kind === 'segment') { const rise = half * 0.32, R = (half * half + rise * rise) / (2 * rise), cy = vs + rise - R, a0 = Math.asin(half / R);
      for (let k = 0; k <= seg; k++) { const t = -a0 + (k / seg) * 2 * a0; pts.push([cx + R * Math.sin(t), cy + R * Math.cos(t)]); } return pts; }
    // pointed (drop) arch: two arcs of radius 0.78·span
    const span = b - a, R = span * 0.78;
    const left = [], right = [];
    // left arc: centre (a + R, vs), from angle π to the apex; right arc: centre (b − R, vs), from the apex to 0
    const thA = Math.acos((cx - (a + R)) / R);                         // angle of the apex seen from the left arc's centre
    for (let k = 0; k <= seg; k++) { const t = Math.PI - (k / seg) * (Math.PI - thA); left.push([a + R + R * Math.cos(t), vs + R * Math.sin(t)]); }
    for (let k = 1; k <= seg; k++) { const t = (Math.PI - thA) - (k / seg) * (Math.PI - thA); right.push([b - R + R * Math.cos(t), vs + R * Math.sin(t)]); }
    return left.concat(right);
  }
  // a wall panel u0..u1 × v0..v1 with an opening from the floor (v0) up to an arch: a U-shaped outline, extruded (w from -depth to 0)
  function openingPanel(F, u0, u1, v0, v1, a, b, vs, kind, depth) {
    const pts = [[u0, v0], [a, v0], ...archTop(a, b, vs, kind), [b, v0], [u1, v0], [u1, v1], [u0, v1]];
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 8 });
    addGeo('stone', g, fmat(F, 0, 0, -depth));
  }
  function closedShape(mat, F, pts, w, depth = 0) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = depth > 0 ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(shape);
    addGeo(mat, g, fmat(F, 0, 0, w - depth));
  }
  // a plain stone wall split into fragments of about `cell` metres
  function wallGrid(F, u0, u1, v0, v1, w0, w1, cell = 2.2) {
    const nu = Math.max(1, Math.round((u1 - u0) / cell)), nv = Math.max(1, Math.round((v1 - v0) / cell));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = u0 + ((u1 - u0) * i) / nu, b = u0 + ((u1 - u0) * (i + 1)) / nu, c = v0 + ((v1 - v0) * j) / nv, d = v0 + ((v1 - v0) * (j + 1)) / nv;
      frag(F, (a + b) / 2, (c + d) / 2); box('stone', F, a, b, c, d, w0, w1);
    }
  }

  // ------------------------------------------------------------------------------------------------ palettes
  const STONE = ['#a38b68', '#9d876a', '#ad9471', '#978571', '#a69276'];
  const STUCCO = ['#c49a63', '#cdb08a', '#b98a5c', '#c8b998', '#b5a387', '#bf9468', '#a99c86'];
  const SHUT = ['#3e5a48', '#4d6152', '#5b4434', '#6f746c', '#425a5e', '#7a6a52'];
  const FRAMES = ['#d9d2c2', '#cfc6b2', '#3b2c20', '#2e3a33'];
  const IRON = lin('#151413');
  const INTERIOR = ['#ffb26b', '#ffc489', '#ff9f55', '#ffd2a0', '#ffbf7a', '#f6c7a0'];
  const T_INFO = { ashlar: 0, stucco: 1, dressed: 2 };
  const stoneInfo = (type, tintHex, k = 1) => { St.info = [type, rnd() * 100, 0, 0]; St.col = lin(tintHex, k); };
  const detailInfo = (hex, pattern, rough, metal, leak = 0, onT = 0) => { St.info = [pattern, rough, metal, leak]; St.ext = [onT, rnd(), 0, 0]; St.col = lin(hex); };
  const ironInfo = () => { St.info = [0, 0.55, 0.7, 0]; St.ext = [0, 0, 0, 0]; St.col = IRON; };

  const roomTime = (x, z) => lightTime(x, z) + (rnd() < 0.85 ? rr(0.6, 5) : rr(5, 16));   // a room lights after the lamp line passes
  const windows = [];                                                  // for the timing of the rooms' lights
  const bayEdges = [];                                                 // for the wall lanterns: [{side, F, u, v}]

  // ------------------------------------------------------------------------------------------------ one window unit
  function windowUnit(F, uc, sill, ow, wh, o) {
    // o: { balcony: 0 | depth, balcW, hood, surround (tint), skin, shut, frames, lit, attic }
    const a = uc - ow / 2, b = uc + ow / 2, top = sill + wh;
    const fc = frag(F, uc, sill + wh / 2, 0.2);
    o.onT = roomTime(fc[0], fc[2]);
    // stone surround (dressed), a little proud of the wall
    stoneInfo(T_INFO.dressed, o.surround);
    const sw = o.attic ? 0.1 : 0.16;
    box('stone', F, a - sw, a, sill, top + sw, 0, 0.035); box('stone', F, b, b + sw, sill, top + sw, 0, 0.035);
    box('stone', F, a, b, top, top + sw, 0, 0.035);
    if (o.hood) {                                                      // a small cornice over the principal floor's windows
      box('stone', F, a - sw, b + sw, top + sw, top + sw + 0.22, 0, 0.05);
      sweep('stone', F, [[0, 0], [0.06, 0], [0.09, 0.04], [0.14, 0.07], [0.16, 0.12], [0.16, 0.16], [0, 0.16]], a - sw - 0.12, b + sw + 0.12, top + sw + 0.22);
    }
    if (!o.balcony) {                                                  // a plain sill
      box('stone', F, a - sw - 0.05, b + sw + 0.05, sill - 0.09, sill, 0, 0.09);
    }
    // the window: frame and glass in the reveal, at w ≈ −0.3
    const wg = -0.3;
    St.info = [0, o.lit, o.onT, rnd()]; St.ext = [uc, sill + wh / 2, ow / 2, wh / 2]; St.col = lin(pick(INTERIOR));
    quad('glass', F, [[a, sill, wg], [b, sill, wg], [b, top, wg], [a, top, wg]], [0, 0, 1], [[a, sill], [b, sill], [b, top], [a, top]]);
    windows.push({ lit: o.lit });
    detailInfo(o.frames, 0, 0.6, 0);
    const fw = 0.06;
    box('detail', F, a, a + fw, sill, top, wg - 0.03, wg + 0.04); box('detail', F, b - fw, b, sill, top, wg - 0.03, wg + 0.04);
    box('detail', F, a, b, top - fw, top, wg - 0.03, wg + 0.04); box('detail', F, a, b, sill, sill + 0.09, wg - 0.03, wg + 0.05);
    if (!o.attic) {
      bar('detail', F, uc - 0.03, uc + 0.03, sill, top, wg - 0.02, wg + 0.035);   // meeting stiles
      const ft = top - Math.min(0.5, wh * 0.2);
      box('detail', F, a, b, ft - 0.03, ft + 0.03, wg - 0.02, wg + 0.035);        // transom under the fanlight
      for (let k = 1; k <= 2; k++) { const y = sill + ((ft - sill) * k) / 3; box('detail', F, a, b, y - 0.012, y + 0.012, wg - 0.005, wg + 0.02); }
    }
    // shutters: open leaves against the facade, closed leaves in the opening, or a roll-down blind partly lowered
    const sh = o.shut;
    if (sh === 'open' || sh === 'half') {
      detailInfo(o.shutCol, 1, 0.7, 0);
      const lw = ow / 2;
      box('detail', F, a - sw - lw, a - sw - 0.01, sill + 0.02, top - 0.02, 0.04, 0.075);
      if (sh === 'open') box('detail', F, b + sw + 0.01, b + sw + lw, sill + 0.02, top - 0.02, 0.04, 0.075);
      else { detailInfo(o.shutCol, 1, 0.7, 0, o.lit, o.onT); box('detail', F, uc, b, sill + 0.02, top - 0.02, wg + 0.06, wg + 0.1); }
    } else if (sh === 'closed') {
      detailInfo(o.shutCol, 1, 0.7, 0, o.lit, o.onT);
      box('detail', F, a, b, sill + 0.02, top - 0.02, wg + 0.06, wg + 0.1);
    } else if (sh === 'blind') {
      detailInfo(o.shutCol, 1, 0.75, 0, o.lit, o.onT);
      const f = rr(0.25, 0.85);
      box('detail', F, a + 0.02, b - 0.02, top - (wh - 0.05) * f, top - 0.02, -0.1, -0.07);
      box('detail', F, a - 0.02, b + 0.02, top - (wh - 0.05) * f - 0.05, top - (wh - 0.05) * f, -0.12, -0.05);
    }
    // the balcony: a moulded stone slab on corbels and a wrought-iron railing
    if (o.balcony) {
      const bd = o.balcony, ba = uc - o.balcW / 2, bb = uc + o.balcW / 2;
      stoneInfo(T_INFO.dressed, o.surround);
      box('stone', F, ba, bb, sill - 0.13, sill, 0, bd);
      sweep('stone', F, [[0, 0], [0.04, 0], [0.04, 0.03], [0.07, 0.06], [0.07, 0.14], [0, 0.14]], ba - 0.03, bb + 0.03, sill - 0.27, bd - 0.04);
      for (const cu of [ba + 0.18, bb - 0.18]) {
        box('stone', F, cu - 0.08, cu + 0.08, sill - 0.42, sill - 0.13, 0, bd * 0.75);
        box('stone', F, cu - 0.07, cu + 0.07, sill - 0.62, sill - 0.42, 0, bd * 0.4);
      }
      ironInfo();
      const rh = sill + 1.02, w1 = bd - 0.05;
      box('detail', F, ba + 0.03, bb - 0.03, rh - 0.035, rh, w1 - 0.025, w1 + 0.025);              // handrail
      box('detail', F, ba + 0.03, bb - 0.03, sill + 0.04, sill + 0.07, w1 - 0.012, w1 + 0.012);     // bottom bar
      box('detail', F, ba + 0.03, bb - 0.03, sill + 0.17, sill + 0.19, w1 - 0.01, w1 + 0.01);       // band
      box('detail', F, ba + 0.03, bb - 0.03, rh - 0.17, rh - 0.15, w1 - 0.01, w1 + 0.01);
      const nb = Math.round((bb - ba - 0.06) / 0.11);
      for (let k = 0; k <= nb; k++) { const x = ba + 0.03 + ((bb - ba - 0.06) * k) / nb; bar('detail', F, x - 0.007, x + 0.007, sill + 0.04, rh - 0.03, w1 - 0.007, w1 + 0.007); }
      for (const x of [ba + 0.03, bb - 0.03]) {                         // returns to the wall
        box('detail', F, x - 0.02, x + 0.02, rh - 0.035, rh, 0, w1);
        const ns = Math.round(w1 / 0.11);
        for (let k = 0; k < ns; k++) { const z = (w1 * k) / ns; bar('detail', F, x - 0.007, x + 0.007, sill + 0.04, rh - 0.03, z - 0.007, z + 0.007); }
      }
      // pots of geraniums now and then
      if (rnd() < 0.3) {
        const np = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < np; k++) {
          const x = rr(ba + 0.2, bb - 0.2), z = rr(0.12, bd - 0.2);
          detailInfo('#8a4a2e', 0, 0.8, 0); box('detail', F, x - 0.09, x + 0.09, sill, sill + 0.17, z - 0.08, z + 0.08);
          detailInfo(pick(['#1f3a1c', '#2a4423', '#3a2a24']), 4, 0.8, 0);
          const g = new THREE.IcosahedronGeometry(rr(0.13, 0.2), 1); g.scale(1.3, 0.8, 1.1);
          addGeo('detail', g, fmat(F, x, sill + 0.28, z));
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ one building
  // sp: { h0, n, hs, bays, ground: 'arcade' | 'mixed' | 'doors', skin: 'ashlar' | 'stucco', tint, top: 'cornice' | 'balustrade' | 'eave',
  //       balc: 'cont' | 'single', attic }
  function building(F, u0, u1, sp, opts = {}) {
    const bays = sp.bays, bw = (u1 - u0) / bays, T = 0.55;
    const tint = sp.tint, dressed = sp.dressed || '#b7a58a';
    const skin = sp.skin === 'ashlar' ? T_INFO.ashlar : T_INFO.stucco;
    const storeys = [];
    let v = sp.h0;
    for (let s = 0; s < sp.n; s++) { const h = sp.attic && s === sp.n - 1 ? 2.3 : sp.hs - s * 0.12; storeys.push([v, h]); v += h; }
    const top = v;
    const shutCol = pick(SHUT), frames = pick(FRAMES);
    // ---- ground floor
    const H0 = sp.h0;
    for (let b = 0; b < bays; b++) {
      const a0 = u0 + b * bw, a1 = a0 + bw, uc = (a0 + a1) / 2;
      frag(F, uc, H0 / 2, -0.3);
      if (sp.ground === 'arcade') {
        const ow = bw - 0.85, vs = H0 - 0.45 - ow / 2;
        stoneInfo(T_INFO.dressed, dressed);
        openingPanel(F, a0, a1, 0, H0, uc - ow / 2, uc + ow / 2, vs, 'round', 0.7);
        box('stone', F, a0, a1, H0 - 0.12, H0 + 0.05, -3.9, -0.7);                      // the arcade's ceiling
        stoneInfo(skin, tint);
        box('stone', F, a0, a1, 0, H0, -4.3, -3.9);                                       // its back wall
        // a shopfront or a door in the back wall
        const sa = uc - (bw - 1.3) / 2, sb = uc + (bw - 1.3) / 2;
        const lit = rnd() < 0.6 ? rr(0.5, 1) : 0;
        { const c = W3(F, uc, 1.5, 0); St.info = [1, lit, roomTime(c[0], c[2]), rnd()]; } St.ext = [uc, 1.55, (sb - sa) / 2, 1.45]; St.col = lin(pick(INTERIOR));
        quad('glass', F, [[sa, 0.1, -3.88], [sb, 0.1, -3.88], [sb, 3.0, -3.88], [sa, 3.0, -3.88]], [0, 0, 1], [[sa, 0.1], [sb, 0.1], [sb, 3.0], [sa, 3.0]]);
        windows.push({ lit, shop: true });
        detailInfo('#2a211b', 0, 0.5, 0.3);
        box('detail', F, sa - 0.08, sa, 0, 3.08, -3.9, -3.8); box('detail', F, sb, sb + 0.08, 0, 3.08, -3.9, -3.8);
        box('detail', F, sa, sb, 3.0, 3.08, -3.9, -3.8); box('detail', F, sa, sb, 0, 0.35, -3.9, -3.82);
        box('detail', F, uc - 0.03, uc + 0.03, 0.35, 3.0, -3.9, -3.83);
        if (lit === 0) { detailInfo('#55585a', 3, 0.55, 0.6); box('detail', F, sa, sb, rr(0.1, 1.6), 3.0, -3.8, -3.76); }
      } else {
        const kind = sp.ground === 'doors' || (b % 2 === 1 && rnd() < 0.7) ? 'door' : 'shop';
        const ow = kind === 'door' ? Math.min(2.1, bw - 1.2) : Math.min(bw - 1.0, 2.6);
        const oh = kind === 'door' ? Math.min(3.5, H0 - 0.8) : Math.min(3.3, H0 - 0.9);
        const arch = kind === 'door' ? (rnd() < 0.5 ? 'round' : 'segment') : (rnd() < 0.5 ? 'flat' : 'segment');
        const vs = arch === 'round' ? oh - ow / 2 : arch === 'segment' ? oh - ow * 0.16 : oh;
        stoneInfo(skin, tint);
        openingPanel(F, a0, a1, 0, H0, uc - ow / 2, uc + ow / 2, vs, arch, T);
        stoneInfo(T_INFO.dressed, dressed, 0.85);
        box('stone', F, a0, uc - ow / 2 - 0.02, 0, 0.62, 0, 0.05); box('stone', F, uc + ow / 2 + 0.02, a1, 0, 0.62, 0, 0.05);   // plinth
        const outline = [[uc - ow / 2, 0], ...archTop(uc - ow / 2, uc + ow / 2, vs, arch), [uc + ow / 2, 0]];
        if (kind === 'door') {
          detailInfo(pick(['#3b2618', '#2e2119', '#41301f', '#28302a']), 2, 0.75, 0);
          closedShape('detail', F, outline, -0.38, 0.08);
        } else {
          const lit = rnd() < 0.45 ? rr(0.4, 1) : 0;
          { const c = W3(F, uc, 1.5, 0); St.info = [1, lit, roomTime(c[0], c[2]), rnd()]; } St.ext = [uc, oh / 2, ow / 2, oh / 2]; St.col = lin(pick(INTERIOR));
          closedShape('glass', F, outline, -0.36);
          windows.push({ lit, shop: true });
          detailInfo('#231d18', 0, 0.5, 0.3);
          box('detail', F, uc - ow / 2, uc + ow / 2, 0, 0.5, -0.4, -0.33);
          box('detail', F, uc - 0.035, uc + 0.035, 0.5, vs, -0.4, -0.34);
          box('detail', F, uc - ow / 2, uc + ow / 2, vs - 0.04, vs + 0.02, -0.4, -0.34);
          if (lit === 0 || rnd() < 0.3) { detailInfo('#5d6062', 3, 0.5, 0.6); box('detail', F, uc - ow / 2, uc + ow / 2, rr(0.05, 1.8), vs, -0.3, -0.26); }
        }
      }
      bayEdges.push({ F, u: a0, v: H0, side: St.side });
    }
    bayEdges.push({ F, u: u1, v: H0, side: St.side });
    // ---- the impost cornice over the ground floor
    for (let b = 0; b < bays; b++) {
      const a0 = u0 + b * bw; frag(F, a0 + bw / 2, H0, 0.1); stoneInfo(T_INFO.dressed, dressed);
      sweep('stone', F, [[0, 0], [0.05, 0], [0.05, 0.05], [0.11, 0.09], [0.15, 0.15], [0.15, 0.24], [0, 0.24]], a0, a0 + bw, H0 - 0.08);
    }
    // ---- upper storeys
    storeys.forEach(([v0, hs], s) => {
      const attic = sp.attic && s === sp.n - 1;
      for (let b = 0; b < bays; b++) {
        const a0 = u0 + b * bw, a1 = a0 + bw, uc = (a0 + a1) / 2;
        const ow = attic ? 0.8 : Math.min(1.42, Math.max(1.05, bw * 0.38));
        const door = !attic && (s === 0 || rnd() < 0.8);
        const wh = attic ? 0.95 : door ? Math.min(hs - 0.75, 2.75 - s * 0.12) : 1.55;
        const sill = v0 + (attic ? 0.75 : door ? 0.16 : 0.95);
        // the wall around the opening, in fragments
        stoneInfo(skin, tint);
        const lt = sill + wh;
        for (const [pa, pb] of [[a0, uc - ow / 2], [uc + ow / 2, a1]]) {
          const vm = v0 + hs * rr(0.4, 0.6);
          frag(F, (pa + pb) / 2, (v0 + vm) / 2); box('stone', F, pa, pb, v0, vm, -T, 0);
          frag(F, (pa + pb) / 2, (vm + v0 + hs) / 2); box('stone', F, pa, pb, vm, v0 + hs, -T, 0);
        }
        frag(F, uc, (lt + v0 + hs) / 2); box('stone', F, uc - ow / 2, uc + ow / 2, lt, v0 + hs, -T, 0);
        if (sill > v0 + 0.01) { frag(F, uc, (v0 + sill) / 2); box('stone', F, uc - ow / 2, uc + ow / 2, v0, sill, -T, 0); }
        // window
        const lit = rnd() < 0.55 ? rr(0.25, 1) : 0;
        const r = rnd();
        const shut = attic ? (r < 0.5 ? 'none' : 'closed') : r < 0.3 ? 'open' : r < 0.5 ? 'blind' : r < 0.62 ? 'closed' : r < 0.72 ? 'half' : 'none';
        const cont = sp.balc === 'cont' && s === 0;
        windowUnit(F, uc, sill, ow, wh, {
          balcony: door ? (s === 0 ? rr(0.62, 0.8) : rr(0.42, 0.58)) : 0, balcW: cont ? bw - 0.08 : ow + 0.75, hood: s === 0 && sp.hood !== false && !attic,
          surround: dressed, shut, shutCol: shutCol, frames, lit, onT: 0, attic,
        });
      }
      // string course at the floor line
      if (s > 0) for (let b = 0; b < bays; b++) {
        const a0 = u0 + b * bw; frag(F, a0 + bw / 2, v0, 0.05); stoneInfo(T_INFO.dressed, dressed, 0.95);
        sweep('stone', F, [[0, 0], [0.06, 0], [0.06, 0.1], [0, 0.1]], a0, a0 + bw, v0 - 0.02);
      }
    });
    // ---- the top: a cornice and a parapet, a balustrade or a tiled eave
    for (let b = 0; b < bays; b++) {
      const a0 = u0 + b * bw, a1 = a0 + bw, uc = (a0 + a1) / 2;
      frag(F, uc, top + 0.5, 0.2);
      stoneInfo(T_INFO.dressed, dressed);
      if (sp.top === 'eave') {
        detailInfo('#7c3f26', 5, 0.8, 0);
        for (let k = 0; k < 3; k++) box('detail', F, a0, a1, top + k * 0.09, top + k * 0.09 + 0.07, 0, 0.14 + k * 0.14);
        const g = new THREE.PlaneGeometry(bw, 2.4); g.rotateX(-Math.PI / 2 - 0.38); g.translate(0, 0.45, -0.75);
        addGeo('detail', g, fmat(F, uc, top + 0.25, 0.4));
      } else {
        sweep('stone', F, [[0, 0], [0.05, 0], [0.05, 0.08], [0.12, 0.12], [0.18, 0.2], [0.22, 0.22], [0.22, 0.27], [0.48, 0.33], [0.55, 0.38], [0.55, 0.46], [0.5, 0.48], [0, 0.48]], a0, a1, top);
        for (let k = 0; k < Math.floor(bw / 0.3); k++) { const x = a0 + 0.15 + k * 0.3; box('stone', F, x - 0.06, x + 0.06, top + 0.12, top + 0.22, 0, 0.2); }   // dentils
        if (sp.top === 'balustrade') {
          box('stone', F, a0, a1, top + 0.48, top + 0.62, -0.35, 0.05);
          box('stone', F, a0, a1, top + 1.28, top + 1.4, -0.38, 0.08);
          box('stone', F, a0, a0 + 0.36, top + 0.62, top + 1.28, -0.33, 0.03);
          const nb = Math.floor((bw - 0.5) / 0.26);
          for (let k = 0; k < nb; k++) {
            const x = a0 + 0.36 + ((bw - 0.36) * (k + 0.5)) / nb;
            const g = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.05], [0.09, 0.2], [0.05, 0.45], [0.06, 0.6], [0.07, 0.66], [0, 0.66]].map(([x0, y0]) => new THREE.Vector2(x0, y0)), 6);
            addGeo('stone', g, fmat(F, x, top + 0.62, -0.14));
          }
        } else {
          stoneInfo(skin, tint);
          box('stone', F, a0, a1, top + 0.48, top + 1.15, -0.3, -0.02);
          stoneInfo(T_INFO.dressed, dressed);
          box('stone', F, a0 - 0.01, a1 + 0.01, top + 1.15, top + 1.25, -0.34, 0.03);
        }
      }
    }
    // chimneys and a water tank sometimes, behind the parapet, against the sky
    if (rnd() < 0.6) { const x = rr(u0 + 1, u1 - 1); frag(F, x, top + 1.5, -3); stoneInfo(T_INFO.stucco, '#8e7f6c'); box('stone', F, x - 0.35, x + 0.35, top, top + rr(1.6, 2.6), -3.4, -2.7); }
    // ---- quoins at both edges, a downpipe, cables
    stoneInfo(T_INFO.dressed, dressed, 1.04);
    for (const [eu, dir] of [[u0, 1], [u1, -1]]) {
      let y = sp.ground === 'arcade' ? H0 + 0.2 : 0.62, alt = false;
      while (y < top - 0.3) {
        const h = 0.42, wq = alt ? 0.36 : 0.62;
        frag(F, eu + dir * wq / 2, y + h / 2, 0.02);
        box('stone', F, dir > 0 ? eu : eu - wq, dir > 0 ? eu + wq : eu, y + 0.008, y + h - 0.008, 0, 0.022);
        y += h; alt = !alt;
      }
    }
    if (!opts.noPipe) {
      St.info = [0, 0.45, 0.75, 0]; St.col = lin('#646a6c'); St.ext = [0, 0, 0, 0];
      const x = u1 - 0.18;
      frag(F, x, top / 2, 0.12);
      const g = new THREE.CylinderGeometry(0.055, 0.055, top - 0.3, 8, 1, true); addGeo('detail', g, fmat(F, x, (top - 0.3) / 2 + 0.3, 0.12));
      for (let y = 1.2; y < top; y += 2.2) box('detail', F, x - 0.07, x + 0.07, y, y + 0.05, 0, 0.18);
    }
    if (rnd() < 0.7) { St.info = [0, 0.7, 0.1, 0]; St.col = lin('#0d0d0d'); const y = H0 + rr(0.25, 0.4); frag(F, (u0 + u1) / 2, y, 0.05); box('detail', F, u0, u1, y, y + 0.014, 0.05, 0.064); }
    return top;
  }

  // ------------------------------------------------------------------------------------------------ the church (side 2)
  function church(k, ua, ub, setback) {
    St.side = k;
    const F = sideFrame(k, setback);
    const tint = '#a08a6c', dressed = '#b49e7e';
    // returns of the neighbours down to the church line
    for (const [u, dir] of [[ua, 1], [ub, -1]]) {
      const Fr = { o: new THREE.Vector3(...W3(sideFrame(k), u, 0, 0)), t: side[k].n.clone().multiplyScalar(dir), n: side[k].t.clone().multiplyScalar(dir) };
      Fr.t.crossVectors(UP, Fr.n);
      stoneInfo(T_INFO.ashlar, tint, 0.95);
      const u0 = Math.min(0, -setback * Fr.t.dot(side[k].n) * 0) , len = setback;
      const s0 = Fr.t.dot(side[k].n) > 0 ? 0 : -len, s1 = s0 + len;
      wallGrid(Fr, s0 + (s0 < 0 ? 0 : 0), s1, 0, 16, -0.6, 0, 2.4); void u0;
    }
    // bell tower on the left, nave facade on the right
    const tw0 = ua, tw1 = ua + 5.6, nv0 = tw1, nv1 = ub;
    stoneInfo(T_INFO.ashlar, tint);
    for (let y = 0; y < 36; y += 2.4) { frag(F, (tw0 + tw1) / 2, y + 1.2, -2.5); box('stone', F, tw0, tw1, y, y + 2.4, -5.5, 0.7); }
    stoneInfo(T_INFO.dressed, dressed);
    for (const x of [tw0 + 0.35, tw1 - 0.35]) for (let y = 0; y < 30; y += 3) { frag(F, x, y + 1.5, 0.9); box('stone', F, x - 0.45, x + 0.45, y, y + 3, 0.6, y < 9 ? 1.25 : 0.95); }
    for (const y of [6.5, 12.5]) {                                     // lancets in the tower
      frag(F, (tw0 + tw1) / 2, y + 1.4, 0.72); stoneInfo(T_INFO.dressed, dressed);
      const c = (tw0 + tw1) / 2, pts = [[c - 0.45, y], ...archTop(c - 0.45, c + 0.45, y + 2.2, 'pointed'), [c + 0.45, y]];
      closedShape('stone', F, pts.map(([a, b]) => [a < c ? a - 0.18 : a + 0.18, b < y + 0.1 ? b - 0.18 : b + 0.12]), 0.75, 0.04);
      detailInfo('#050505', 0, 0.9, 0); closedShape('detail', F, pts, 0.8);
    }
    sweep('stone', F, [[0, 0], [0.1, 0], [0.1, 0.12], [0.25, 0.25], [0.25, 0.4], [0, 0.4]], tw0, tw1, 16, 0.7);
    // nave facade: ashlar in fragments with a portal panel and a rose panel
    const cx = (nv0 + nv1) / 2 + 0.4, portalW = 5.0, vsP = 4.0, roseV = 11.2, roseR = 2.85;
    stoneInfo(T_INFO.ashlar, tint);
    const pa = cx - 2.9, pb = cx + 2.9;
    frag(F, cx, 4, 0);
    openingPanel(F, pa, pb, 0, 8.2, cx - portalW / 2, cx + portalW / 2, vsP, 'pointed', 0.9);
    wallGrid(F, nv0, pa, 0, 8.2, -0.9, 0, 2.2); wallGrid(F, pb, nv1, 0, 8.2, -0.9, 0, 2.2);
    // rose panel: a rectangle with a round hole
    {
      const ra = cx - 3.4, rb = cx + 3.4, rv0 = 8.2, rv1 = 14.4;
      frag(F, cx, roseV, 0);
      const shape = new THREE.Shape([[ra, rv0], [rb, rv0], [rb, rv1], [ra, rv1]].map(([x, y]) => new THREE.Vector2(x, y)));
      const hole = new THREE.Path(); hole.absarc(cx, roseV, roseR, 0, Math.PI * 2, false); shape.holes.push(hole);
      addGeo('stone', new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 48 }), fmat(F, 0, 0, -0.9));
      wallGrid(F, nv0, ra, rv0, rv1, -0.9, 0, 2.2); wallGrid(F, rb, nv1, rv0, rv1, -0.9, 0, 2.2);
      wallGrid(F, nv0, nv1, rv1, 24, -0.9, 0, 2.6);
      // mouldings round the rose
      stoneInfo(T_INFO.dressed, dressed);
      for (const [r0, r1, w0, w1] of [[roseR, roseR + 0.42, 0, 0.18], [roseR - 0.12, roseR + 0.02, -0.3, 0.02]]) {
        frag(F, cx, roseV, 0.1);
        const s = new THREE.Shape(); s.absarc(cx, roseV, r1, 0, Math.PI * 2, false);
        const h = new THREE.Path(); h.absarc(cx, roseV, r0, 0, Math.PI * 2, true); s.holes.push(h);
        addGeo('stone', new THREE.ExtrudeGeometry(s, { depth: w1 - w0, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 48 }), fmat(F, 0, 0, w0));
      }
      // tracery: radial mullions and an inner ring, in stone, in front of the glass
      const nM = 12;
      for (let i = 0; i < nM; i++) {
        const a = (i / nM) * Math.PI * 2, rm = (roseR + 0.55) / 2;
        const g = new THREE.BoxGeometry(0.1, roseR - 0.55, 0.16); g.rotateZ(a - Math.PI / 2); g.translate(Math.cos(a) * rm, Math.sin(a) * rm, 0);
        addGeo('stone', g, fmat(F, cx, roseV, -0.45));
      }
      const ring = new THREE.TorusGeometry(0.55, 0.07, 6, 32); addGeo('stone', ring, fmat(F, cx, roseV, -0.45));
      const ring2 = new THREE.TorusGeometry(1.75, 0.05, 6, 48); addGeo('stone', ring2, fmat(F, cx, roseV, -0.45));
      St.info = [2, 1, 0, rnd()]; St.ext = [cx, roseV, roseR, roseR]; St.col = lin('#ffb070');
      const disc = new THREE.CircleGeometry(roseR + 0.05, 48); disc.translate(cx, roseV, 0);
      { const uvA = disc.attributes.uv, pA = disc.attributes.position; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getX(i), pA.getY(i)); }
      addGeo('glass', disc, fmat(F, 0, 0, -0.55));
      windows.push({ lit: 1, rose: true });
    }
    // the portal: archivolts stepping in, little columns, a tympanum and the door
    stoneInfo(T_INFO.dressed, dressed);
    for (let r = 0; r < 4; r++) {
      const ho = portalW / 2 - r * 0.28, hi = ho - 0.28, w1 = -0.9 - r * 0.28, w0 = w1 - 0.28;
      frag(F, cx, vsP, w1);
      const pts = [[cx - ho, 0], ...archTop(cx - ho, cx + ho, vsP, 'pointed'), [cx + ho, 0], [cx + hi, 0], ...archTop(cx - hi, cx + hi, vsP, 'pointed').reverse(), [cx - hi, 0]];
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      addGeo('stone', new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 12 }), fmat(F, 0, 0, w0));
      for (const x of [cx - hi - 0.02, cx + hi + 0.02]) { const g = new THREE.CylinderGeometry(0.085, 0.1, vsP - 0.3, 10); addGeo('stone', g, fmat(F, x, (vsP - 0.3) / 2 + 0.3, w0 + 0.12)); }
    }
    const hd = portalW / 2 - 4 * 0.28, wd = -0.9 - 4 * 0.28;
    frag(F, cx, vsP + 1, wd);
    closedShape('stone', F, [[cx - hd, vsP - 0.2], ...archTop(cx - hd, cx + hd, vsP, 'pointed'), [cx + hd, vsP - 0.2]], wd, 0.2);
    detailInfo('#2c1c12', 2, 0.7, 0);
    closedShape('detail', F, [[cx - hd, 0], [cx + hd, 0], [cx + hd, vsP - 0.2], [cx - hd, vsP - 0.2]], wd - 0.05, 0.1);
    // buttresses with set-offs
    stoneInfo(T_INFO.ashlar, tint, 0.97);
    for (const x of [nv0 + 0.5, nv1 - 0.55]) {
      for (const [y0, y1, d] of [[0, 4, 1.3], [4, 9, 1.05], [9, 15, 0.8], [15, 22, 0.55]]) { frag(F, x, (y0 + y1) / 2, d / 2); box('stone', F, x - 0.55, x + 0.55, y0, y1, -0.9, d); }
      stoneInfo(T_INFO.dressed, dressed);
      for (const [y, d] of [[4, 1.3], [9, 1.05], [15, 0.8]]) { frag(F, x, y, d); sweep('stone', F, [[0, 0], [d + 0.06, 0], [d + 0.06, 0.08], [0, 0.42]], x - 0.6, x + 0.6, y, 0); }
      stoneInfo(T_INFO.ashlar, tint, 0.97);
    }
    // a frieze of small blind arches at the top of the visible facade
    stoneInfo(T_INFO.dressed, dressed);
    frag(F, cx, 14.6, 0.1); sweep('stone', F, [[0, 0], [0.12, 0], [0.12, 0.14], [0.2, 0.22], [0.2, 0.3], [0, 0.3]], nv0 + 1.1, nv1 - 1.1, 14.4);
    // steps
    stoneInfo(T_INFO.dressed, '#8f8676');
    for (let s = 0; s < 3; s++) { frag(F, (nv0 + nv1) / 2, 0.1, 1 + s); box('stone', F, nv0 - 0.2, nv1 + 0.2, 0, 0.15 * (3 - s), 0, 0.45 * (s + 1) + 0.3); }
    return { F, cx };
  }

  // ------------------------------------------------------------------------------------------------ lamps
  const lamps = [];                                                    // { pos, t0, light, d (fragment break delay), side }
  const LAMP_COL = new THREE.Color(1.0, 0.6, 0.3);
  function lantern(F, u, v, w, sc, idx) {
    St.info = [3, idx, 0, rnd()]; St.ext = [0, 0, 0, 0]; St.col = [1, 0.75, 0.5];
    const g = new THREE.CylinderGeometry(0.16 * sc, 0.11 * sc, 0.42 * sc, 6, 1, true); addGeo('glass', g, fmat(F, u, v, w));
    ironInfo();
    addGeo('detail', new THREE.ConeGeometry(0.25 * sc, 0.2 * sc, 6), fmat(F, u, v + 0.31 * sc, w));
    addGeo('detail', new THREE.CylinderGeometry(0.2 * sc, 0.2 * sc, 0.04 * sc, 6), fmat(F, u, v + 0.21 * sc, w));
    addGeo('detail', new THREE.SphereGeometry(0.045 * sc, 8, 6), fmat(F, u, v + 0.45 * sc, w));
    addGeo('detail', new THREE.CylinderGeometry(0.12 * sc, 0.05 * sc, 0.1 * sc, 6), fmat(F, u, v - 0.26 * sc, w));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6, r = 0.135 * sc;
      const gb = new THREE.BoxGeometry(0.018, 0.44 * sc, 0.018); gb.rotateZ(Math.sign(Math.cos(a)) * 0); gb.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
      addGeo('detail', gb, fmat(F, u, v, w));
    }
  }
  function addLamp(pos, strength, k) {
    const idx = lamps.length;
    const light = new THREE.PointLight(LAMP_COL, 0, 32, 2);
    light.position.copy(pos);
    lamps.push({ pos: pos.clone(), base: strength, t0: lightTime(pos.x, pos.z), light, seed: St.frag[3], cy: St.frag[1], side: k, warm: 0, on: 0 });
    return idx;
  }
  function wallLantern(k, F, u, v) {
    St.side = k;
    frag(F, u, v, 0.6);
    const pos = new THREE.Vector3(...W3(F, u, v - 0.12, 0.78));
    const idx = addLamp(pos, 1.0, k);
    ironInfo();
    const c = new THREE.CubicBezierCurve3(new THREE.Vector3(0, -0.55, 0.02), new THREE.Vector3(0, -0.1, 0.1), new THREE.Vector3(0, 0.35, 0.3), new THREE.Vector3(0, 0.38, 0.78));
    addGeo('detail', new THREE.TubeGeometry(c, 16, 0.022, 6), fmat(F, u, v, 0));
    addGeo('detail', new THREE.TorusGeometry(0.11, 0.012, 5, 16, Math.PI * 1.6), fmat(F, u, v - 0.05, 0.22).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
    box('detail', F, u - 0.08, u + 0.08, v - 0.7, v - 0.4, 0, 0.03);
    box('detail', F, u - 0.012, u + 0.012, v + 0.1, v + 0.38, 0.76, 0.8);
    lantern(F, u, v - 0.12, 0.78, 1.0, idx);
  }
  function standingLamp(x, z) {
    const dir = new THREE.Vector3(x, 0, z).normalize();
    let k = 0, best = -2; for (let s = 0; s < NS; s++) { const d = -side[s].n.dot(dir); if (d > best) { best = d; k = s; } }
    St.side = k;
    const F = { o: new THREE.Vector3(x, 0, z), t: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, 1) };
    fragW(x, 1.5, z);
    ironInfo();
    addGeo('detail', new THREE.CylinderGeometry(0.3, 0.36, 0.5, 8), fmat(F, 0, 0.25, 0));
    const prof = [[0.24, 0.5], [0.2, 0.6], [0.14, 0.75], [0.13, 1.0], [0.1, 1.1], [0.085, 3.3], [0.12, 3.38], [0.12, 3.46], [0.07, 3.55], [0, 3.6]];
    addGeo('detail', new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 12), fmat(F, 0, 0, 0));
    fragW(x, 3.9, z);
    const pos = new THREE.Vector3(x, 3.95, z);
    const idx = addLamp(pos, 1.6, k);
    ironInfo();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      const c = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 3.45, 0), new THREE.Vector3(ca * 0.3, 3.4, sa * 0.3), new THREE.Vector3(ca * 0.6, 3.45, sa * 0.6), new THREE.Vector3(ca * 0.66, 3.72, sa * 0.66));
      addGeo('detail', new THREE.TubeGeometry(c, 14, 0.022, 6), fmat(F, 0, 0, 0));
      addGeo('detail', new THREE.TorusGeometry(0.09, 0.01, 5, 14, Math.PI * 1.5), fmat(F, ca * 0.25, 3.33, sa * 0.25).multiply(new THREE.Matrix4().makeRotationY(-a)));
      lantern(F, ca * 0.66, 3.97, sa * 0.66, 0.85, idx);
    }
    lantern(F, 0, 3.95, 0, 0.95, idx);
  }

  // ------------------------------------------------------------------------------------------------ build the square
  const tops = [];
  const plazaSpecs = [
    // side 0 (walls[0]) — four houses, stucco and stone, one of them low so the roofline meets the sky
    [{ w: 9.0, h0: 4.6, n: 3, hs: 3.4, bays: 3, ground: 'mixed', skin: 'stucco', top: 'cornice', balc: 'cont' },
      { w: 8.0, h0: 4.3, n: 2, hs: 3.3, bays: 2, ground: 'mixed', skin: 'ashlar', top: 'balustrade', balc: 'single' },
      { w: 9.5, h0: 4.8, n: 3, hs: 3.5, bays: 3, ground: 'mixed', skin: 'stucco', top: 'eave', balc: 'cont', attic: false },
      { w: 6.0, h0: 4.4, n: 2, hs: 3.2, bays: 2, ground: 'doors', skin: 'stucco', top: 'cornice', balc: 'single' }],
    // side 1 — the arcaded side (porxos), like the squares of the old town
    [{ w: 15.0, h0: 5.0, n: 2, hs: 3.4, bays: 4, ground: 'arcade', skin: 'ashlar', top: 'balustrade', balc: 'cont', dressed: '#bba889' },
      { w: 9.0, h0: 5.0, n: 2, hs: 3.4, bays: 3, ground: 'arcade', skin: 'stucco', top: 'cornice', balc: 'cont' },
      { w: 6.0, h0: 4.4, n: 3, hs: 3.2, bays: 2, ground: 'mixed', skin: 'stucco', top: 'eave', balc: 'single' }],
    // side 2 — the church in the middle, set back; houses either side
    [{ w: 10.0, h0: 4.5, n: 3, hs: 3.4, bays: 3, ground: 'mixed', skin: 'stucco', top: 'cornice', balc: 'cont' },
      { church: true, w: 16.0 },
      { w: 6.4, h0: 4.4, n: 3, hs: 3.3, bays: 2, ground: 'doors', skin: 'ashlar', top: 'cornice', balc: 'single' }],
    // side 3
    [{ w: 7.5, h0: 4.4, n: 2, hs: 3.3, bays: 2, ground: 'mixed', skin: 'stucco', top: 'eave', balc: 'single' },
      { w: 10.5, h0: 4.7, n: 3, hs: 3.5, bays: 3, ground: 'mixed', skin: 'ashlar', top: 'balustrade', balc: 'cont' },
      { w: 8.0, h0: 4.5, n: 2, hs: 3.4, bays: 2, ground: 'mixed', skin: 'stucco', top: 'cornice', balc: 'cont' },
      { w: 6.0, h0: 4.3, n: 3, hs: 3.1, bays: 2, ground: 'doors', skin: 'stucco', top: 'cornice', balc: 'single', attic: true }],
  ];
  const finishSpec = (sp) => ({ tint: sp.skin === 'ashlar' ? pick(STONE) : pick(STUCCO), dressed: sp.dressed || pick(['#b5a385', '#ab9a7e', '#bcae93']), ...sp });
  let churchInfo = null;
  for (let k = 0; k < NS; k++) {
    St.side = k;
    const F = sideFrame(k);
    const uA = -D[(k + NS - 1) % NS], uB = D[(k + 1) % NS] - SW;
    const specs = plazaSpecs[k], total = specs.reduce((a, s) => a + s.w, 0), sc = (uB - uA) / total;
    let u = uA;
    for (const sp of specs) {
      const w = sp.w * sc;
      if (sp.church) { churchInfo = church(k, u, u + w, 3.5); St.side = k; }
      else tops.push(building(F, u, u + w, finishSpec(sp)));
      u += w;
    }
    // the street leaving the square at the left corner: this side's facade goes on into it
    const st = [{ w: 11, h0: 4.2, n: 3, hs: 3.2, bays: 3, ground: 'doors', skin: 'stucco', top: 'cornice', balc: 'single' },
      { w: 13, h0: 4.4, n: 3, hs: 3.3, bays: 4, ground: 'mixed', skin: pick(['stucco', 'ashlar']), top: pick(['cornice', 'eave']), balc: 'single' }];
    building(F, uA - LS, uA - LS + 11, finishSpec(st[1]));
    building(F, uA - LS + 11, uA, finishSpec(st[0]));
    // the street's other wall: the side of this side's last house, running away from the square
    const Fs = { o: new THREE.Vector3(...W3(F, uB, 0, 0)), n: side[k].t.clone(), t: new THREE.Vector3() };
    Fs.t.crossVectors(UP, Fs.n);
    building(Fs, 0.55, LS * 0.5, finishSpec({ h0: 4.3, n: 3, hs: 3.2, bays: 3, ground: 'doors', skin: 'stucco', top: 'cornice', balc: 'single' }), { noPipe: true });
    building(Fs, LS * 0.5, LS + 2, finishSpec({ h0: 4.2, n: 3, hs: 3.3, bays: 3, ground: 'mixed', skin: 'stucco', top: 'eave', balc: 'single' }));
    // the end of the street: a house across it
    const Fe = sideFrame(k, LS + 2);
    building(Fe, uB - 4, uB + SW + 4, finishSpec({ h0: 4.3, n: 3, hs: 3.3, bays: 3, ground: 'doors', skin: 'stucco', top: 'cornice', balc: 'single' }));
    // lamps: two lanterns on this side's facade, one down the street
    const targets = [uA + (uB - uA) * 0.22, uA + (uB - uA) * 0.78];
    for (const tu of targets) {
      let best = null;
      for (const e of bayEdges) if (e.side === k && e.F.o.equals(F.o) && e.u > uA + 1 && e.u < uB - 1 && (!best || Math.abs(e.u - tu) < Math.abs(best.u - tu))) best = e;
      if (k === 2 && churchInfo && best && Math.abs(best.u) < 9) continue;
      if (best) wallLantern(k, F, best.u, best.v - 0.55);
    }
    wallLantern(k, Fs, LS * 0.5, 4.0);
  }
  // the church gets its own lanterns either side of the portal
  if (churchInfo) wallLantern(2, churchInfo.F, churchInfo.cx - 3.7, 3.9);
  // standing fanals on the diagonals of the square, between the castells' places
  for (const [sx, sz] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) standingLamp(sx * 8.6, sz * 8.3);
  const NL = lamps.length;

  // ------------------------------------------------------------------------------------------------ mirror shards (appear when it breaks)
  for (let k = 0; k < NS; k++) {
    St.side = k;
    const F = sideFrame(k);
    const uA = -D[(k + NS - 1) % NS], uB = D[(k + 1) % NS] - SW;
    for (let i = 0; i < 150; i++) {
      const u = rr(uA - 6, uB), v = rr(0.6, 14), sz = rr(0.25, 1.15) * (rnd() < 0.15 ? 1.8 : 1);
      const w = k === 2 && Math.abs(u) < 8 ? -3.4 : rr(0.05, 0.4);
      frag(F, u, v, w);
      St.info = [0, 0, 0, 0]; St.ext = [0, 0, 0, 0]; St.col = [1, 1, 1];
      const a = rr(0.3, 0.7) * sz, b = rr(0.3, 0.7) * sz, j = () => rr(-0.25, 0.25) * sz;
      quad('mirror', F, [[u - a + j(), v - b + j(), w], [u + a + j(), v - b + j(), w], [u + a + j(), v + b + j(), w], [u - a + j(), v + b + j(), w]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }

  // ------------------------------------------------------------------------------------------------ uniforms
  const uT = uniform(0), uTime = uniform(0), uS = uniform(0), uRev = uniform(0), uSky = uniform(0), uHorizon = uniform(0.55);
  const uFog = uniform(0.018), uGlow = uniform(1), uLit = uniform(0.45), uWet = uniform(0.75), uDrift = uniform(1), uMirror = uniform(0.45);
  const uWin = uniform(1), uStars = uniform(1), uTR = uniform(0), uDark = uniform(1);
  const uMoonDir = uniform(new THREE.Vector3(0.55, 0.62, 0.56).normalize());
  const lampVec = Array.from({ length: NL }, () => new THREE.Vector4());
  const uLamps = uniformArray(lampVec, 'vec4');
  const LC = vec3(1.0, 0.6, 0.3);

  // ------------------------------------------------------------------------------------------------ TSL helpers
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(cos(a).oneMinus())));
  const aFrag = attribute('aFrag', 'vec4'), aInfo = attribute('aInfo', 'vec4'), aExt = attribute('aExt', 'vec4'), aCol = attribute('color', 'vec3');
  const fragDelay = (F) => F.w.mul(0.42).add(0.08).add(clamp(F.y.div(16), 0, 1).oneMinus().mul(0.25));
  const fragProg = (F) => clamp(uS.sub(fragDelay(F)).div(0.6), 0, 4);
  const cpuDelay = (sd, cy) => sd * 0.42 + 0.08 + (1 - Math.min(1, Math.max(0, cy / 16))) * 0.25;

  // the break, in the vertex stage: vibration, then each fragment drifts up and apart, turning; later most shrink away
  const shatterPos = (mirror) => Fn(() => {
    const res = (mirror ? aFrag.xyz : positionLocal).toVar();
    If(uS.greaterThan(0.0001), () => {
    const c = aFrag.xyz, sd = aFrag.w;
    const r1 = fract(sd.mul(17.23)), r2 = fract(sd.mul(41.71)), r3 = fract(sd.mul(73.13)), r4 = fract(sd.mul(131.3)), r5 = fract(sd.mul(197.9));
    const d = fragDelay(aFrag);
    const p = fragProg(aFrag);
    const pre = smoothstep(d.sub(0.1), d, uS).mul(smoothstep(d.add(0.1), d, uS));
    const out = normalize(vec3(c.x, 0, c.z).add(vec3(0.001, 0, 0)));
    const tng = vec3(out.z.negate(), 0, out.x);
    const axis = normalize(vec3(r1.sub(0.5), r2.sub(0.5), r3.sub(0.5)).add(vec3(0.0, 0.001, 0.0)));
    const ang = p.mul(r4.mul(1.3).add(0.25)).mul(sign(r5.sub(0.5)));
    const fadeAt = r2.mul(0.85).add(0.95);
    let sc = max(smoothstep(fadeAt.add(0.35), fadeAt, uS), step(0.93, r3).mul(smoothstep(2.6, 2.0, uS)));
    if (mirror) sc = sc.mul(smoothstep(d.sub(0.02), d.add(0.12), uS)).mul(max(smoothstep(fadeAt.add(0.6), fadeAt.add(0.2), uS), step(0.7, r3).mul(smoothstep(2.6, 2.1, uS))));
    const local = positionLocal.sub(c).mul(sc);
    const rotated = rotA(local, axis, ang);
    normalLocal.assign(rotA(normalLocal, axis, ang));
    const jit = vec3(sin(uTime.mul(53).add(sd.mul(90))), sin(uTime.mul(61).add(sd.mul(37))), sin(uTime.mul(47).add(sd.mul(11)))).mul(pre.mul(0.03));
    const rise = p.mul(p).mul(0.35).add(p.mul(0.85)).mul(r1.mul(0.9).add(0.45));
    const wob = vec3(sin(uTime.mul(0.37).add(sd.mul(40))), sin(uTime.mul(0.29).add(sd.mul(23))), sin(uTime.mul(0.33).add(sd.mul(57)))).mul(min(p, 1).mul(0.18));
    const disp = vec3(0, rise, 0).add(out.mul(p.mul(r2.mul(2.0).sub(1.15)))).add(tng.mul(p.mul(r3.sub(0.5)).mul(1.8))).mul(uDrift).add(wob);
    res.assign(c.add(rotated).add(disp).add(jit));
    });
    return res;
  })();

  // the night sky (also what the mirrors and wet stone reflect)
  const skyCol = (dr, clouds = true) => {
    const y = dr.y;
    const g = mix(vec3(0.016, 0.022, 0.04), vec3(0.0012, 0.002, 0.0055), pow(clamp(y, 0, 1), 0.45));
    const md = max(dot(dr, uMoonDir), 0);
    const halo = pow(md, 10).mul(0.05).add(pow(md, 120).mul(0.25)).add(smoothstep(0.99955, 0.9997, md).mul(4));
    const sp = dr.mul(230), cell = floor(sp), h = hash13(cell), f = fract(sp).sub(0.5);
    const tw = sin(uTime.mul(h.mul(3).add(1)).add(h.mul(60))).mul(0.35).add(0.65);
    const star = step(0.9955, h).mul(smoothstep(0.42, 0.0, length(f))).mul(tw).mul(smoothstep(0.03, 0.3, y)).mul(h.sub(0.9955).mul(200).add(0.3)).mul(uStars);
    const cl = !clouds ? float(0) : mx_fractal_noise_float(vec3(dr.x.mul(2.2), dr.y.mul(9), dr.z.mul(2.2)).add(vec3(uTime.mul(0.003), 0, uTime.mul(0.002))), 4, 2.0, 0.55);
    const cloud = smoothstep(0.05, 0.7, cl).mul(pow(md, 2).mul(0.05).add(0.006)).mul(smoothstep(0.0, 0.25, y));
    return g.add(vec3(0.75, 0.8, 1.0).mul(halo)).add(vec3(star)).add(vec3(0.55, 0.6, 0.75).mul(cloud)).mul(uSky);
  };
  // what a mirror-like surface at Pw sees along R: the dark square, the facades (until they break), the sky, and the lamps
  const envRefl = (R, Pw, sharp) => Fn(() => {
    const fac = vec3(0.016, 0.011, 0.007).mul(uRev).mul(uDark);
    const flo = vec3(0.005, 0.004, 0.0035).mul(uRev).mul(uDark);
    const c = mix(fac, skyCol(R, false), smoothstep(uHorizon.sub(0.05), uHorizon.add(0.05), R.y)).toVar();
    c.assign(mix(flo, c, smoothstep(-0.04, 0.04, R.y)));
    Loop(NL, ({ i }) => {
      const L = uLamps.element(i);
      const Dl = normalize(L.xyz.sub(Pw));
      const cd = dot(R, Dl);
      If(cd.greaterThan(0.9), () => { c.addAssign(LC.mul(L.w.mul(pow(cd, sharp).mul(40).add(pow(cd, 30).mul(0.08))))); });
    });
    return c;
  })();
  // analytic single scattering from the eye: moonlit haze plus every lamp's volumetric glow (the same for the four cameras)
  const fogOut = Fn(() => {
    const col = output;
    const E = cameraPosition, Pw = positionWorld;
    const Vv = Pw.sub(E), dist = length(Vv), dir = Vv.div(dist);
    const Ls = min(dist, 90.0);
    const n = sin(Pw.x.mul(0.13).add(uTime.mul(0.07)).add(sin(Pw.z.mul(0.09).sub(uTime.mul(0.05))).mul(2.0))).mul(sin(Pw.z.mul(0.11).add(Pw.y.mul(0.2)).sub(uTime.mul(0.04)).add(sin(Pw.x.mul(0.07)).mul(1.7))));
    const sig = uFog.mul(n.mul(0.5).add(1.0));
    const Tr = exp(sig.mul(Ls).negate());
    const md = max(dot(dir, uMoonDir), 0);
    const ins = vec3(0.012, 0.016, 0.026).mul(uSky).mul(md.mul(md).mul(2.5).add(0.8)).mul(Tr.oneMinus()).toVar();
    If(uGlow.greaterThan(0.001), () => {
      Loop(NL, ({ i }) => {
        const L = uLamps.element(i);
        const rel = L.xyz.sub(E), s0 = dot(rel, dir);
        const h2 = dot(rel, rel).sub(s0.mul(s0));
        If(h2.lessThan(16.0).and(L.w.greaterThan(0.001)), () => {
          const h = sqrt(max(h2, 0.01));
          const integ = atan(Ls.sub(s0).div(h)).sub(atan(s0.negate().div(h))).div(h);
          ins.addAssign(LC.mul(L.w.mul(integ).mul(sig).mul(uGlow).mul(0.9).mul(smoothstep(16.0, 5.0, h2))));
        });
      });
    });
    return vec4(col.rgb.mul(Tr).add(ins), col.a);
  });
  // bump from a procedural height (Mikkelsen's surface gradient, screen-space derivatives)
  const bumpN = (h, scale) => {
    const dpx = positionView.dFdx(), dpy = positionView.dFdy(), N = normalView;
    const R1 = cross(dpy, N), R2 = cross(N, dpx), det = dot(dpx, R1);
    const grad = sign(det).mul(h.dFdx().mul(scale).mul(R1).add(h.dFdy().mul(scale).mul(R2)));
    return normalize(abs(det).mul(N).sub(grad));
  };
  // the fanals, lit by hand: each pixel only pays for the lamps within reach (three's PointLights would cost all 16 everywhere)
  const LR2 = 15.0 * 15.0;
  const lampLight = (albedo, rough, metal, nV, Pw) => Fn(() => {
    const acc = vec3(0).toVar();
    const Nw = normalize(nV.transformDirection(cameraWorldMatrix));
    const Vw = normalize(cameraPosition.sub(Pw));
    const a2 = max(rough.mul(rough), 0.003);
    const shin = float(2).div(a2.mul(a2)).sub(2).min(700);
    const f0 = mix(vec3(0.04), albedo, metal);
    const kd = albedo.mul(float(1).sub(metal)).mul(1 / Math.PI);
    Loop(NL, ({ i }) => {
      const L = uLamps.element(i);
      const Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv);
      If(d2.lessThan(LR2).and(L.w.greaterThan(0.001)), () => {
        const Ld = Lv.mul(d2.inverseSqrt());
        const ndl = max(dot(Nw, Ld), 0);
        const win = pow(clamp(float(1).sub(d2.div(LR2)), 0, 1), 2);
        const E = L.w.mul(26).div(d2.add(0.25)).mul(win).mul(ndl);
        const H = normalize(Ld.add(Vw));
        const spec = f0.mul(pow(max(dot(Nw, H), 0), shin).mul(shin.add(8).mul(1 / (8 * Math.PI))));
        acc.addAssign(LC.mul(E).mul(kd.add(spec)));
      });
    });
    return acc;
  })();
  const fresnel = (cosT, f0) => f0.add(float(1).sub(f0).mul(pow(float(1).sub(clamp(cosT, 0, 1)), 5)));
  const viewDir = () => normalize(positionWorld.sub(cameraPosition));

  // ------------------------------------------------------------------------------------------------ materials
  function finish(m, shatterKind) { if (shatterKind !== undefined) m.positionNode = shatterPos(shatterKind); m.fog = false; m.outputNode = fogOut(); return m; }

  // stone: ashlar courses, old stucco with patches, dressed mouldings; noise colour, grime streaks, rising damp; mirror when broken
  const stoneMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial();
    const uvm = uv(), Pw = positionWorld, type = aInfo.x, bseed = aInfo.y;
    const ch = float(0.42), row = floor(uvm.y.div(ch)), rh = hash12(vec2(row, bseed));
    const bl = rh.mul(0.4).add(0.72), bx = uvm.x.add(rh.mul(3.1)).div(bl), col = floor(bx);
    const fu = fract(bx), fv = fract(uvm.y.div(ch));
    const edge = min(min(fu, fu.oneMinus()).mul(bl), min(fv, fv.oneMinus()).mul(ch));
    const joint = smoothstep(0.016, 0.005, edge);
    const bh = hash12(vec2(col.add(bseed), row));
    const grain = mx_noise_float(Pw.mul(3.1)).add(mx_noise_float(Pw.mul(11.0)).mul(0.4));
    const big = mx_fractal_noise_float(Pw.mul(0.33).add(vec3(bseed, 0, 0)), 2, 2.0, 0.5);
    const hz = Pw.x.add(Pw.z);
    const streak = smoothstep(0.1, 0.65, mx_noise_float(vec3(hz.mul(2.2), Pw.y.mul(0.11), bseed)));
    const damp = smoothstep(float(1.5).add(big.mul(0.6)), 0.15, Pw.y);
    const isA = step(type, 0.5), isS = step(0.5, type).mul(step(type, 1.5)), isD = step(1.5, type);
    const tint = aCol;
    const blockCol = tint.mul(bh.mul(0.3).add(0.8)).mul(mix(vec3(1), vec3(0.92, 0.95, 1.0), hash12(vec2(row, col)).mul(0.6)));
    const ashlar = mix(blockCol, tint.mul(vec3(0.78, 0.76, 0.72)), joint);
    const peel = smoothstep(0.32, 0.4, big.mul(0.6).add(mx_noise_float(Pw.mul(1.3).add(vec3(0, bseed, 0))).mul(0.5)));
    const stucco = mix(tint.mul(big.mul(0.15).add(0.95)), tint.mul(vec3(0.62, 0.55, 0.5)).mul(mix(1, 0.75, joint)), peel);
    const dressedC = tint.mul(grain.mul(0.06).add(0.97));
    const base = ashlar.mul(isA).add(stucco.mul(isS)).add(dressedC.mul(isD));
    const albedo = base.mul(grain.mul(0.12).add(0.95)).mul(float(1).sub(streak.mul(0.28))).mul(mix(1, 0.6, damp)).mul(big.mul(0.12).add(0.94));
    const height = joint.mul(-0.012).mul(isA.add(isS.mul(peel))).add(grain.mul(0.0025)).add(peel.mul(-0.003).mul(isS)).add(bh.mul(0.004).mul(isA));
    const p = fragProg(aFrag);
    const isMirror = step(fract(aFrag.w.mul(131.3)), uMirror).mul(smoothstep(0.05, 0.5, p));
    const sAlb = mix(albedo, vec3(0.02), isMirror), sRough = mix(float(0.9).sub(damp.mul(0.45)).sub(isD.mul(0.1)), float(0.05), isMirror);
    const sN = bumpN(height.mul(float(1).sub(isMirror)), 1.0);
    m.colorNode = sAlb; m.roughnessNode = sRough; m.metalnessNode = isMirror; m.normalNode = sN;
    const R = reflectVector;
    const mirE = Fn(() => { const e = vec3(0).toVar(); If(isMirror.greaterThan(0.001), () => { e.assign(envRefl(R, Pw, 900).add(vec3(0.75, 0.82, 1.0).mul(pow(max(dot(R, uMoonDir), 0), 24).mul(1.6).mul(uRev))).mul(isMirror).mul(0.85)); }); return e; })();
    m.emissiveNode = mirE.add(lampLight(sAlb, sRough, isMirror, sN, Pw));
    return finish(m, false);
  })();

  // iron, painted wood, frames, doors, blinds, tiles, leaves: albedo from the vertex colour, pattern from aInfo.x
  const detailMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial();
    const uvm = uv(), Pw = positionWorld, pat = aInfo.x;
    const n1 = mx_fractal_noise_float(Pw.mul(5.0), 2, 2.0, 0.5);
    const isL = step(0.5, pat).mul(step(pat, 1.5)), isDoor = step(1.5, pat).mul(step(pat, 2.5)), isR = step(2.5, pat).mul(step(pat, 3.5)), isLeaf = step(3.5, pat).mul(step(pat, 4.5)), isTile = step(4.5, pat);
    const slat = fract(uvm.y.div(0.055));
    const louv = smoothstep(0.0, 0.15, slat).mul(smoothstep(1.0, 0.8, slat));
    const panel = fract(uvm.x.div(0.45)), pv = fract(uvm.y.div(0.8));
    const pan = smoothstep(0.0, 0.08, panel).mul(smoothstep(1.0, 0.92, panel)).mul(smoothstep(0.0, 0.06, pv)).mul(smoothstep(1.0, 0.94, pv));
    const rib = fract(uvm.y.div(0.09));
    const ribs = sin(rib.mul(6.2832)).mul(0.5).add(0.5);
    const tile = fract(uvm.x.div(0.22));
    const tiles = sin(tile.mul(6.2832)).mul(0.5).add(0.5);
    const shade = float(1).sub(isL.mul(louv.oneMinus().mul(0.55))).sub(isDoor.mul(pan.oneMinus().mul(0.3))).sub(isR.mul(ribs.mul(0.25))).sub(isTile.mul(tiles.mul(0.35)));
    const dAlb = aCol.mul(shade).mul(n1.mul(0.18).add(0.92)).mul(float(1).add(isLeaf.mul(n1.mul(0.6))));
    const dRough = clamp(aInfo.y.add(n1.mul(0.1)), 0.15, 1);
    m.colorNode = dAlb; m.roughnessNode = dRough; m.metalnessNode = aInfo.z;
    const height = isL.mul(louv.mul(0.006)).add(isDoor.mul(pan.mul(0.01))).add(isR.mul(ribs.mul(0.004))).add(isTile.mul(tiles.mul(0.02))).add(n1.mul(0.0008));
    const dN = bumpN(height, 1.0);
    m.normalNode = dN;
    // light leaking between the slats of closed shutters and blinds of lit rooms
    const lit = step(aExt.y, uLit).mul(aInfo.w);
    const on = smoothstep(aExt.x, aExt.x.add(0.8), uTR);
    const p = fragProg(aFrag);
    m.emissiveNode = vec3(1.0, 0.55, 0.22).mul(lit).mul(on).mul(louv.oneMinus().mul(isL)).mul(2.2).mul(uWin).mul(smoothstep(0.4, 0.0, p)).add(lampLight(dAlb, dRough, aInfo.z, dN, Pw));
    return finish(m, false);
  })();

  // glass: rooms behind the windows (interior mapping: walls, ceiling, a lamp), shops, the rose window, the lanterns
  const glassMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial();
    const kind = aInfo.x, litR = aInfo.y, sd = aInfo.w;
    const isWin = step(kind, 1.5), isShop = step(0.5, kind).mul(step(kind, 1.5)), isRose = step(1.5, kind).mul(step(kind, 2.5)), isLamp = step(2.5, kind);
    const Pw = positionWorld, V = viewDir(), N = normalize(normalWorld);
    const T = normalize(cross(vec3(0, 1, 0), N).add(vec3(0.0001, 0, 0)));
    const dv = vec3(dot(V, T), V.y, max(dot(V, N.negate()), 0.02));
    const uvm = uv();
    const p0 = vec3(uvm.x.sub(aExt.x), uvm.y.sub(aExt.y), 0);
    const RW = aExt.z.add(mix(1.3, 2.6, isShop)), CY = aExt.w.add(0.5), FY = aExt.w.add(mix(0.25, 0.05, isShop)).negate(), RD = mix(3.2, 5.0, fract(sd.mul(7.7)));
    const tx = sign(dv.x).mul(RW).sub(p0.x).div(dv.x.add(sign(dv.x).mul(0.0001)));
    const ty = select(dv.y.greaterThan(0), CY.sub(p0.y), FY.sub(p0.y)).div(dv.y.add(sign(dv.y).mul(0.0001)).add(0.00001));
    const tz = RD.div(dv.z);
    const th = min(min(abs(tx), abs(ty)), tz);
    const hit = p0.add(dv.mul(th));
    const onBack = step(tz, th.add(0.001)), onY = step(abs(ty), th.add(0.001)).mul(float(1).sub(onBack)), onX = float(1).sub(onBack).sub(onY).max(0);
    const lp = vec3(fract(sd.mul(3.3)).sub(0.5).mul(RW), CY.sub(0.45), RD.mul(0.45));
    const ld = length(hit.sub(lp));
    const illum = float(1.0).div(ld.mul(ld).mul(0.55).add(0.35));
    const isCeil = onY.mul(step(0, dv.y));
    const wallC = mix(vec3(0.62, 0.5, 0.38), vec3(0.45, 0.42, 0.4), fract(sd.mul(13.1)));
    const floorC = vec3(0.32, 0.2, 0.12).mul(fract(hit.x.mul(1.6).add(hit.z.mul(0.1))).mul(0.25).add(0.8));
    // a picture or a shelf on the back wall
    const pic = step(abs(hit.x.sub(fract(sd.mul(5.1)).sub(0.5))), 0.35).mul(step(abs(hit.y.sub(0.25)), 0.25)).mul(onBack);
    const surf = mix(mix(wallC, floorC, onY.mul(float(1).sub(isCeil))), wallC.mul(1.15), isCeil).mul(float(1).sub(pic.mul(0.6)));
    // the lamp itself, seen along the ray
    const rayCl = length(cross(lp.sub(p0), normalize(dv)));
    const bulb = exp(rayCl.mul(rayCl).mul(-90)).mul(3.0).add(exp(rayCl.mul(rayCl).mul(-6)).mul(0.25));
    const curtain = step(0.45, fract(sd.mul(19.3))).mul(smoothstep(0.3, 0.62, abs(p0.x).div(aExt.z))).mul(sin(p0.x.mul(70).add(mx_noise_float(vec3(p0.x.mul(8), p0.y.mul(0.6), sd)).mul(3))).mul(0.15).add(0.75));
    const interior = mix(surf.mul(illum).add(vec3(bulb)), vec3(0.85, 0.7, 0.55).mul(0.55), curtain.mul(0.9));
    const litOn = step(litR.mul(0.999), uLit).mul(step(0.001, litR)).mul(smoothstep(aInfo.z, aInfo.z.add(0.5), uTR));
    // subtle life: one room flickers (a television), one switches on late, one goes out
    const tv = step(0.985, sd).mul(mx_noise_float(vec3(uTime.mul(6), sd.mul(9), 0)).mul(0.5).add(0.6));
    const late = step(0.97, sd).mul(step(sd, 0.985)).mul(smoothstep(33, 33.5, uT).oneMinus());
    const out = step(0.955, sd).mul(step(sd, 0.97)).mul(smoothstep(39, 39.4, uT));
    const life = float(1).sub(late).sub(out).max(0).mul(float(1).add(tv.mul(0.5)));
    const tvTint = mix(vec3(1), vec3(0.55, 0.7, 1.4), step(0.985, sd));
    const warm = aCol.mul(tvTint);
    const p = fragProg(aFrag);
    const alive = smoothstep(0.35, 0.0, p);
    const winE = interior.mul(warm).mul(litR.mul(0.6).add(0.55)).mul(litOn).mul(life).mul(mix(1.1, 1.6, isShop)).mul(uWin);
    const dimRoom = surf.mul(0.006).mul(uRev);                       // unlit rooms: almost black, a hint of depth
    // the rose: twelve petals, rings, deep blue and red with amber, faintly lit from inside
    const rq = vec2(uvm.x.sub(aExt.x), uvm.y.sub(aExt.y)), rr0 = length(rq).div(aExt.z), ra = atan(rq.y, rq.x);
    const pet = abs(cos(ra.mul(6))), petals = smoothstep(0.55, 0.9, pet.mul(0.6).add(rr0.mul(0.5)));
    const lead = smoothstep(0.03, 0.0, abs(fract(rr0.mul(5)).sub(0.5)).sub(0.45).abs()).add(smoothstep(0.92, 1.0, abs(cos(ra.mul(24)))).mul(step(0.35, rr0)));
    const rcol = mix(mix(vec3(0.05, 0.09, 0.42), vec3(0.5, 0.07, 0.05), petals), vec3(1.0, 0.6, 0.22), smoothstep(0.3, 0.0, rr0).add(mx_noise_float(vec3(uvm.mul(1.7), 4.0)).mul(0.25)).clamp(0, 1));
    const roseE = rcol.mul(float(1).sub(clamp(lead, 0, 1).mul(0.85))).mul(mx_noise_float(vec3(uvm.mul(3), 0)).mul(0.3).add(0.8)).mul(0.3).mul(smoothstep(22, 24, uTR)).mul(uWin);
    // the lanterns: as bright as their lamp right now
    const lampW = uLamps.element(aInfo.y.toInt()).w;
    const lampE = vec3(1.0, 0.7, 0.42).mul(lampW).mul(14);
    const R = reflectVector;
    const fr = mix(fresnel(dot(V.negate(), N), float(0.04)), float(0.85), smoothstep(0.0, 0.5, p));
    const refl = envRefl(R, Pw, 1500).mul(fr);
    m.colorNode = vec3(0.01);
    m.roughnessNode = float(0.12);
    m.metalnessNode = float(0);
    m.emissiveNode = winE.add(dimRoom).mul(isWin).mul(alive).add(roseE.mul(isRose).mul(alive)).add(lampE.mul(isLamp)).add(refl.mul(float(1).sub(isLamp)));
    return finish(m, false);
  })();

  // mirror shards: born when the facade breaks, they float and reflect the sky and the dying lamps
  const mirrorMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    const R = reflectVector, Pw = positionWorld;
    const V = viewDir();
    const fr = fresnel(abs(dot(V.negate(), normalize(normalWorld))), float(0.6));
    const tintT = mix(vec3(0.9, 0.95, 1.05), vec3(1.05, 0.97, 0.9), fr);   // a faint pearl cast
    m.colorNode = vec3(0.03);
    m.roughnessNode = float(0.04);
    m.metalnessNode = float(1);
    const sheen = pow(max(dot(R, uMoonDir), 0), 24).mul(2.2).add(pow(max(dot(R, uMoonDir), 0), 3).mul(0.05)).mul(uRev);   // glints of the moon as the panes turn
    m.emissiveNode = envRefl(R, Pw, 2500).add(vec3(0.75, 0.82, 1.0).mul(sheen)).mul(fr).mul(tintT).mul(1.1);
    return finish(m, true);
  })();

  // the square's floor: worn slabs, wet joints and puddles, streaky reflections of every lamp
  const floorMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial();
    const Pw = positionWorld, W = Pw.xz;
    const rowW = float(0.62), row = floor(W.y.div(rowW)), rh = hash12(vec2(row, 3.3)), len = rh.mul(0.65).add(0.8);
    const sx = W.x.add(rh.mul(5.0)).div(len), col = floor(sx), fu = fract(sx), fv = fract(W.y.div(rowW));
    const edge = min(min(fu, fu.oneMinus()).mul(len), min(fv, fv.oneMinus()).mul(rowW));
    const joint = smoothstep(0.014, 0.004, edge);
    const sh = hash12(vec2(col, row.add(17.0)));
    const grain = mx_noise_float(vec3(W.x.mul(4.0), 0.5, W.y.mul(4.0)));
    const big = mx_fractal_noise_float(vec3(W.x.mul(0.16), 1.7, W.y.mul(0.16)), 2, 2.0, 0.5);
    const wear = mx_noise_float(vec3(W.x.mul(0.9), 3.1, W.y.mul(0.9)));
    const wet = clamp(smoothstep(-0.12, 0.22, big).add(joint.mul(0.6)).add(smoothstep(0.3, 0.6, wear).mul(0.3)), 0, 1).mul(uWet);
    const c1 = vec3(0.105, 0.092, 0.078), c2 = vec3(0.135, 0.125, 0.112);
    const albedo = mix(c1, c2, sh).mul(grain.mul(0.25).add(0.9)).mul(mix(1, 0.45, joint)).mul(mix(1, 0.5, wet)).mul(wear.mul(0.1).add(1));
    const tilt = vec2(hash12(vec2(col, row)).sub(0.5), hash12(vec2(row, col.add(5.0))).sub(0.5)).mul(0.006);
    const height = smoothstep(0.035, 0.0, edge).mul(-0.0025).add(fu.mul(len).mul(tilt.x)).add(fv.mul(rowW).mul(tilt.y)).add(grain.mul(0.0018).mul(float(1).sub(wet)));
    const fRough = mix(float(0.62).add(grain.mul(0.12)), float(0.07), wet);
    const fN = bumpN(height, 1.0);
    m.colorNode = albedo; m.roughnessNode = fRough; m.metalnessNode = float(0); m.normalNode = fN;
    // fake reflections: what a puddle sees (facades, sky), and a long streak under every lamp
    const V = viewDir();
    const R = vec3(V.x, V.y.negate(), V.z);
    const fr = fresnel(V.y.negate(), float(0.03));
    const Rh = normalize(R.xz);
    const refl = Fn(() => {
    const rf = mix(vec3(0.012, 0.009, 0.006).mul(uRev).mul(uDark), skyCol(R, false), smoothstep(uHorizon.sub(0.05), uHorizon.add(0.05), R.y)).toVar();
    const ripple = mx_noise_float(vec3(W.x.mul(2.0), uTime.mul(0.15), W.y.mul(2.0))).mul(0.012);
    Loop(NL, ({ i }) => {
      const L = uLamps.element(i);
      const Dl = normalize(L.xyz.sub(Pw));
      const ca = dot(Rh, normalize(Dl.xz));
      If(ca.greaterThan(0.998).and(L.w.greaterThan(0.001)), () => {
        const dh = float(1).sub(ca).max(0);
        const dvv = R.y.sub(Dl.y).add(ripple);
        const s = exp(dh.mul(-5000)).mul(exp(dvv.mul(dvv).mul(-55)));
        rf.addAssign(LC.mul(L.w.mul(s).mul(1.6)));
      });
    });
      return rf;
    })();
    m.emissiveNode = refl.mul(fr).mul(wet.mul(0.9).add(0.1)).add(lampLight(albedo, fRough, float(0), fN, Pw));
    return finish(m);
  })();

  const skyMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    m.colorNode = skyCol(normalize(positionWorld.sub(cameraPosition)));
    return finish(m);
  })();

  // ------------------------------------------------------------------------------------------------ meshes
  const object = new THREE.Group();
  object.name = 'plaza';
  const geos = [];
  function mkMesh(gb, mat) {
    if (!gb.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gb.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(gb.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(gb.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(gb.c, 3));
    g.setAttribute('aFrag', new THREE.Float32BufferAttribute(gb.f, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(gb.i, 4));
    g.setAttribute('aExt', new THREE.Float32BufferAttribute(gb.e, 4));
    g.computeBoundingSphere();
    // the break moves fragments far from where they were built: grow the bounds so culling never clips them
    g.userData.r0 = g.boundingSphere.radius;
    geos.push(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    object.add(mesh);
    return mesh;
  }
  let verts = 0;
  for (let s = 0; s < NS; s++) {
    for (const [k, mat] of [['stone', stoneMat], ['detail', detailMat], ['glass', glassMat], ['mirror', mirrorMat]]) { verts += B[k][s].p.length / 3; mkMesh(B[k][s], mat); }
  }
  for (const k in B) B[k].length = 0;
  const floorGeo = new THREE.PlaneGeometry(160, 160); floorGeo.rotateX(-Math.PI / 2); geos.push(floorGeo);
  const floor0 = new THREE.Mesh(floorGeo, floorMat); floor0.matrixAutoUpdate = false; object.add(floor0);
  const skyGeo = new THREE.SphereGeometry(300, 48, 24); geos.push(skyGeo);
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.matrixAutoUpdate = false; sky.renderOrder = -10; sky.frustumCulled = false; object.add(sky);

  // lights: the fanals, the moon, the sky's ambient
  for (const L of lamps) { L.light.layers.set(31); object.add(L.light); }   // read by the atmos part; the renderer skips layer 31
  const moon = new THREE.DirectionalLight(new THREE.Color(0.62, 0.72, 1.0), 0);
  moon.position.copy(uMoonDir.value).multiplyScalar(50); object.add(moon); object.add(moon.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.35, 0.45, 0.75), new THREE.Color(0.25, 0.17, 0.1), 0);
  object.add(hemi);

  // ------------------------------------------------------------------------------------------------ the clock
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const lampD = lamps.map((L) => cpuDelay(L.seed, L.cy));
  function ignite(dt0, i, time) {                                    // a gas mantle catching: a sputter, then steady
    if (dt0 <= 0) return 0;
    const ramp = sm(dt0 / 0.9);
    const sput = dt0 < 1.4 ? 0.65 + 0.35 * Math.sin(dt0 * 37 + i) * Math.sin(dt0 * 23.7 + i * 3) : 1;
    return ramp * sput * (0.97 + 0.03 * Math.sin(time * 7.3 + i * 1.7) * Math.sin(time * 3.1 + i));
  }
  const handNear = new Float32Array(NL);
  let grown = true;
  function update(dt, input) {
    const t = input.t ?? 0, time = input.time ?? 0;
    const pr = input.params || P;
    const rv = +pr.reveal || 0, shv = +pr.shatter || 0;
    const tR = rv > 0 ? 8 + 17 * Math.min(1, rv) : shv > 0 ? Math.max(t, 30) : t;
    const tS = shv > 0 ? 46 + 24 * Math.min(1, shv) : t;
    const S = tS < 46 ? 0 : tS < 58 ? (tS - 46) / 12 : Math.min(2.6, 1 + ((tS - 58) / 12) * 1.25);
    const reveal = sm((tR - 8) / 17);
    const dark = 1 - 0.85 * sm((S - 0.55) / 1.5);
    if ((S > 0) !== grown) { grown = S > 0; for (const g of geos) if (g.userData.r0) g.boundingSphere.radius = g.userData.r0 + (grown ? 14 : 0); }
    uT.value = t; uTime.value = time; uS.value = S; uTR.value = tR; uRev.value = reveal; uDark.value = dark;
    uSky.value = reveal * (1 - 0.55 * sm((S - 0.7) / 1.5)) * (pr.sky ?? 1);
    uHorizon.value = 0.55 - 0.53 * sm((S - 0.25) / 0.8);
    uFog.value = (pr.haze ?? 1) * 0.016;
    uGlow.value = pr.glow ?? 1;
    uLit.value = pr.windows ?? 0.45;
    uWet.value = pr.wet ?? 0.75;
    uDrift.value = pr.drift ?? 1;
    uMirror.value = pr.mirror ?? 0.45;
    uWin.value = (pr.windowGlow ?? 1);
    uStars.value = pr.stars ?? 1;
    const moonK = (pr.moon ?? 1) * reveal * dark;
    moon.intensity = 0.32 * moonK; hemi.intensity = 0.55 * moonK;
    // hands warm the nearest lamp a little
    handNear.fill(0);
    if ((pr.handWarm ?? 0.5) > 0) for (const h of input.hands || []) {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < NL; i++) { const dd = lamps[i].pos.distanceToSquared(h.pos); if (dd < bd) { bd = dd; bi = i; } }
      if (bi >= 0) handNear[bi] = 1;
    }
    const k = Math.min(1, dt * 2.5), LK = pr.lamps ?? 1;
    for (let i = 0; i < NL; i++) {
      const L = lamps[i];
      L.warm += (handNear[i] - L.warm) * k;
      const on = ignite(tR - L.t0, i, time);
      const br = 1 - sm((S - lampD[i] + 0.06) / 0.22);                // it dies when its stone breaks, with a last flicker
      const fl = S > lampD[i] - 0.1 && br > 0.02 ? 0.6 + 0.4 * Math.sin(time * 41 + i) : 1;
      const v = on * br * fl * L.base * (1 + (pr.handWarm ?? 0.5) * 0.6 * L.warm) * LK;
      L.light.intensity = v * 26;
      lampVec[i].set(L.pos.x, L.pos.y, L.pos.z, v);
    }
  }
  function setParams() { /* parameters are read live in update() */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of [stoneMat, detailMat, glassMat, mirrorMat, floorMat, skyMat]) m.dispose(); }
  if (typeof window !== 'undefined') window.__plaza = { lamps: NL, verts, meshes: object.children.length };   // lab checks only
  return { object, update, setParams, dispose };
}
