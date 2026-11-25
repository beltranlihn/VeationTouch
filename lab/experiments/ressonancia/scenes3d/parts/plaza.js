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
//   T-056: a hand on a wall (score event 'lamp' {wall, s}) lights the nearest unlit fanal at once; without hands, the old pace.
// Review overrides: params.reveal (0..1 = the 8–25 s lighting) and params.shatter (0..1 = 46–70 s) replace the clock when > 0.
//
// How it is built (draw calls and cost): four sides, each merged into 4 meshes (stone, iron/wood, glass, mirror shards) so every
// wall's camera culls the far sides; floor and sky are one mesh each. Every vertex carries its FRAGMENT (centre + seed): the break
// is a vertex-stage displacement and rotation (no CPU work per frame). Light: 16 point lights (the fanals), moon + hemisphere, no
// shadows; the haze is an analytic single-scattering fog computed from the eye (the same for the four cameras, so no seam at the
// corners): each lamp gets its volumetric halo for free. Wet floor: real specular + streaky fake reflections of every lamp.
// STUDIO NIGHT 25-11 (VFX V8, plan 05 §2.7–2.8, D5b): THE LIT SQUARE. In Pinya and Tronc (input.state.block, or params.lit 0..1 with
// params.litBlock) the same square turns to plaza light: lime facades (palette `cal-foc` / `porcellana`) under a low raking key with
// REAL cast shadows (room.keyShadow: arcades and porches in shadow, the facades' shadows across the slabs), a cool sky fill, dry pale
// slabs, the room's sky (room.sky) above and a thin air that grows with distance (never a veil on the foreground). No break while lit.
// THE FESTIVAL NIGHT (VFX 25-11, Beltrán ~02:30 — overrides the lit day for Pinya and Tronc): the square at night, lit like a castell
// night: four warm stage SPOTS from high on the sides, one per castell wall, aimed at the tower's foot (6.5 m beyond the wall) — warm
// pools on the wet paving, spill on the facades, and their SHAFTS visible in the haze (additive cones); far facades sink into the
// room's blue air, the fanals and the windows warm, deep shadows elsewhere. params.fest 0..1 (study) or block pinya / tronc.
// BRASA (VFX 25-11): in block 'brasa' the square is the night of fire — the fanals almost out, the sky the room's smoky dark, and up to
// NFI fires (part.setFires(list, posOf, kOf), fed by brasa3d's hand-lit fires) light the facades and slabs in flame colour, with their glow
// in the air.
import { lin as palLin } from '../palette.js';
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
  const uSkyTint = uniform(new THREE.Vector3(1, 1, 1));               // params.skyTint [r, g, b]: the host's colour script (T-034)
  const uWin = uniform(1), uStars = uniform(1), uTR = uniform(0), uDark = uniform(1);
  const uMoonDir = uniform(new THREE.Vector3(0.55, 0.62, 0.56).normalize());
  const lampVec = Array.from({ length: NL }, () => new THREE.Vector4());
  const uLamps = uniformArray(lampVec, 'vec4');
  // VFX perf 25-11: the per-pixel light loops run over COMPACTED arrays (only the lights that are on, brightest first) with a live count,
  // so a dark lamp, an absent hand or a cold fire costs nothing (was: every loop over every slot, every pixel, four walls).
  const lampVecC = Array.from({ length: NL }, () => new THREE.Vector4(0, -50, 0, 0)), uLampsC = uniformArray(lampVecC, 'vec4');
  const uNL = uniform(0, 'int'), uNHL = uniform(0, 'int'), uNFI = uniform(0, 'int');
  const LOOP = (n) => n;   // Loop(uniformInt, …) as festa / atmos do (the object form failed: «Uniform null»)
  const LC = vec3(1.0, 0.6, 0.3);
  const NSP = 8, spotP = Array.from({ length: NSP }, () => new THREE.Vector4(0, -50, 0, 0)), spotD = Array.from({ length: NSP }, () => new THREE.Vector4(0, -1, 0, 0.95));
  const uSpotP = uniformArray(spotP, 'vec4'), uSpotD = uniformArray(spotD, 'vec4'), uFest = uniform(0);
  const uSpotC = uniform(new THREE.Vector3(...palLin('cal-fanal'))), SPC = uSpotC;   // the stage light: warm lime (tronc) · warmer fire-lime (pinya)
  const uNSP = uniform(0, 'int');
  // VFX 25-11 (free touch, D3): every hand on a wall opens a warm pool of lamp light 0.8 m behind it — on the paving (≥ 1 m), the near
  // stone and in the air — growing in ~0.4 s, staying a few seconds after the hand goes. Not in the Brasa (there the hand lights fire).
  const NHL = 6, hlVec = Array.from({ length: NHL }, () => new THREE.Vector4(0, -50, 0, 0)), uHL = uniformArray(hlVec, 'vec4');
  const HLC = vec3(...palLin('cal-fanal')).mul(0.7).add(vec3(...palLin('fanal')).mul(0.3));
  const NFI = 8, fireVec = Array.from({ length: NFI }, () => new THREE.Vector4(0, -50, 0, 0)), uFires = uniformArray(fireVec, 'vec4');
  const FC = vec3(...palLin('flama')).mul(1.0).add(vec3(...palLin('brasa')).mul(0.4));   // the colour of the fire's light (palette tokens)
  const uDawn = uniform(0);
  const uNightK = uniform(0), uBlue = uniform(0), uArr = uniform(0), uPom = uniform(0), uShaftK = uniform(1), uPinya = uniform(0), uCrown = uniform(0);
  const tlVec = Array.from({ length: 4 }, () => new THREE.Vector4(0, -50, 0, 0)), uTL = uniformArray(tlVec, 'vec4'), TLC = vec3(...palLin('or')).mul(1.1);
  // AD#8 the crown as an event: uTLR = the gold pool's radius (m, grows from the tower's foot), uPulse = the two fronts of the light wave
  // that runs round the four walls (horizontal unit directions from the eye, xz · xz), uPulseK its strength
  const uTLR = uniform(1), uPulse = uniform(new THREE.Vector4(0, -1, 0, -1)), uPulseK = uniform(0);
  const LOWHAZE = vec3(...palLin('terracota')).mul(0.16).add(vec3(...palLin('cal-foc')).mul(0.05));   // pinya: the warm smoke of the bonfires                                         // brasa: 1 = the room's dark sky instead of the moonlit one
  // VFX V8: the lit square (0 = the night square … 1 = plaza light). Tones from palette.js (nobody writes a hex)
  const uDay = uniform(0), uDayTone = uniform(new THREE.Vector3(...palLin('porcellana'))), uDayFloor = uniform(new THREE.Vector3(...palLin('pedra-llum'))), uDayAir = uniform(0.015);
  const roomSky = room.sky ? room.sky : () => vec3(0.02, 0.025, 0.04);

  // ------------------------------------------------------------------------------------------------ TSL helpers
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(cos(a).oneMinus())));
  const aFrag = attribute('aFrag', 'vec4'), aInfo = attribute('aInfo', 'vec4'), aExt = attribute('aExt', 'vec4'), aCol = attribute('color', 'vec3');
  // VFX 25-11: the break is staggered in depth — the nearest stone goes first, the far square after (and re-forms in the same order)
  const fragDelay = (F) => F.w.mul(0.34).add(0.06).add(clamp(F.y.div(16), 0, 1).oneMinus().mul(0.2)).add(clamp(length(F.xz).sub(14.0).div(30.0), 0, 1).mul(0.22));
  const fragProg = (F) => clamp(uS.sub(fragDelay(F)).div(0.6), 0, 4);
  const cpuDelay = (sd, cy) => sd * 0.34 + 0.06 + (1 - Math.min(1, Math.max(0, cy / 16))) * 0.2 + 0.11;   // (the lamps: mid-depth on average)

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
    // (AD 25-11: while the square RE-FORMS — uArr — no glass panes and no lingering glinters: nothing floats in the sky)
    let sc = max(smoothstep(fadeAt.add(0.35), fadeAt, uS), step(0.93, r3).mul(smoothstep(2.6, 2.0, uS)).mul(float(1).sub(uArr)));
    if (mirror) sc = sc.mul(float(1).sub(uArr)).mul(smoothstep(d.sub(0.02), d.add(0.12), uS)).mul(max(smoothstep(fadeAt.add(0.6), fadeAt.add(0.2), uS), step(0.7, r3).mul(smoothstep(2.6, 2.1, uS))));
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
    return g.mul(uSkyTint).add(vec3(0.75, 0.8, 1.0).mul(halo)).add(vec3(star)).add(vec3(0.55, 0.6, 0.75).mul(cloud).mul(uSkyTint)).mul(uSky);
  };
  // what a mirror-like surface at Pw sees along R: the dark square, the facades (until they break), the sky, and the lamps
  const envRefl = (R, Pw, sharp) => Fn(() => {
    const fac = vec3(0.016, 0.011, 0.007).mul(uRev).mul(uDark);
    const flo = vec3(0.005, 0.004, 0.0035).mul(uRev).mul(uDark);
    const c = mix(fac, skyCol(R, false), smoothstep(uHorizon.sub(0.05), uHorizon.add(0.05), R.y)).toVar();
    c.assign(mix(flo, c, smoothstep(-0.04, 0.04, R.y)));
    Loop(LOOP(uNL), ({ i }) => {
      const L = uLampsC.element(i);
      const Dl = normalize(L.xyz.sub(Pw));
      const cd = dot(R, Dl);
      If(cd.greaterThan(0.9), () => { c.addAssign(LC.mul(L.w.mul(pow(cd, sharp).mul(40).add(pow(cd, 30).mul(0.08))))); });
    });
    return c;
  })();
  // analytic single scattering from the eye: moonlit haze plus every lamp's volumetric glow (the same for the four cameras)
  const fogOut = Fn(() => {
    const E = cameraPosition, Pw = positionWorld;
    const Vv = Pw.sub(E), dist = length(Vv), dir = Vv.div(dist);
    const Ls = min(dist, 90.0);
    const n = sin(Pw.x.mul(0.13).add(uTime.mul(0.07)).add(sin(Pw.z.mul(0.09).sub(uTime.mul(0.05))).mul(2.0))).mul(sin(Pw.z.mul(0.11).add(Pw.y.mul(0.2)).sub(uTime.mul(0.04)).add(sin(Pw.x.mul(0.07)).mul(1.7))));
    const sig = uFog.mul(n.mul(0.5).add(1.0));
    const Tr = exp(sig.mul(Ls).negate()).toVar();
    const md = max(dot(dir, uMoonDir), 0);
    // (festival / Brasa: the moonlit veil goes — the haze lives in the beams and the far blue, never a milky wall; AD 25-11)
    const col = output.toVar();
    const ins = vec3(0.012, 0.016, 0.026).mul(uSky).mul(md.mul(md).mul(2.5).add(0.8)).mul(Tr.oneMinus()).mul(float(1).sub(max(uFest, uNightK).mul(0.85))).toVar();
    If(uGlow.greaterThan(0.001), () => {
      Loop(LOOP(uNL), ({ i }) => {
        const L = uLampsC.element(i);
        const rel = L.xyz.sub(E), s0 = dot(rel, dir);
        const h2 = dot(rel, rel).sub(s0.mul(s0));
        If(h2.lessThan(16.0).and(L.w.greaterThan(0.001)), () => {
          const h = sqrt(max(h2, 0.01));
          const integ = atan(Ls.sub(s0).div(h)).sub(atan(s0.negate().div(h))).div(h);
          ins.addAssign(LC.mul(L.w.mul(integ).mul(sig).mul(uGlow).mul(0.9).mul(smoothstep(16.0, 5.0, h2))));
        });
      });
    });
    Loop(LOOP(uNHL), ({ i }) => {                                            // the hands' light in the haze
      const L = uHL.element(i);
      const rel = L.xyz.sub(E), s0 = dot(rel, dir), h2 = dot(rel, rel).sub(s0.mul(s0));
      If(L.w.greaterThan(0.002).and(h2.lessThan(16.0)), () => {
        const h = sqrt(max(h2, 0.02));
        const integ = atan(Ls.sub(s0).div(h)).sub(atan(s0.negate().div(h))).div(h);
        ins.addAssign(HLC.mul(L.w.mul(integ).mul(0.0022)));
      });
    });
    Loop(LOOP(uNFI), ({ i }) => {                                            // the fires' glow in the smoke
      const L = uFires.element(i);
      const rel = L.xyz.sub(E), s0 = dot(rel, dir), h2 = dot(rel, rel).sub(s0.mul(s0));
      If(L.w.greaterThan(0.002).and(h2.lessThan(36.0)), () => {
        const h = sqrt(max(h2, 0.02));
        const integ = atan(Ls.sub(s0).div(h)).sub(atan(s0.negate().div(h))).div(h);
        ins.addAssign(FC.mul(L.w.mul(integ).mul(0.0035).mul(max(uNightK, uPinya))));
      });
    });
    // AD#7: the gold comes FROM the tower (uTL: its light, spilling with falloff, its glow in the haze), never a global fog; behind the
    // tower (Tronc and crown) the square is darkened ~45 % — a spot vignette — so the tower in its beam is the brightest thing
    const dH = normalize(vec3(dir.x, 0, dir.z));
    let near = float(0);
    for (const w of room.walls) { const n = new THREE.Vector3(-w.normal.x, 0, -w.normal.z).normalize(); near = max(near, smoothstep(0.955, 0.995, dot(dH, vec3(n.x, 0, n.z)))); }
    const behindTower = near.mul(smoothstep(6.0, 9.0, dist)).mul(uFest).mul(0.65);   // AD#9: the architecture behind the tower −65 %
    col.assign(vec4(col.rgb.mul(float(1).sub(behindTower)), col.a));
    If(uPulseK.greaterThan(0.001), () => {                         // the wave of light round the room (crosses the seam: it is a direction)
      const a1 = dot(dH.xz, uPulse.xy), a2 = dot(dH.xz, uPulse.zw);
      const band = exp(float(1).sub(a1).div(-0.0025)).add(exp(float(1).sub(a2).div(-0.0025)));
      ins.addAssign(TLC.mul(band.mul(uPulseK).mul(0.55).mul(smoothstep(0.0, 1.0, Pw.y)).mul(float(1).sub(smoothstep(4.0, 9.0, Pw.y)))));
    });
    If(uCrown.greaterThan(0.01), () => {
      Loop(4, ({ i }) => {
        const L = uTL.element(i);
        const rel = L.xyz.sub(E), s0 = dot(rel, dir), h2 = dot(rel, rel).sub(s0.mul(s0));
        const h = sqrt(max(h2, 0.05));
        const integ = atan(Ls.sub(s0).div(h)).sub(atan(s0.negate().div(h))).div(h);
        ins.addAssign(TLC.mul(L.w.mul(integ).mul(0.006)));
      });
    });
    // BAJADA (AD#12): the alba-rosa climbs the upper facades with the chapter (the floor stays cold)
    ins.addAssign(vec3(...palLin('alba-rosa')).mul(smoothstep(2.0, 11.0, Pw.y)).mul(uDawn).mul(0.22));
    // PINYA (AD#5): a low heavy warm haze that swallows the square up to ~2 m — above it only silhouettes and lit windows
    If(uPinya.greaterThan(0.01), () => {
      const low = smoothstep(2.6, 0.2, Pw.y), thick = float(1).sub(exp(max(dist.sub(4.0), 0).mul(-0.11)));
      const hk = low.mul(thick).mul(uPinya).mul(0.92);
      ins.assign(ins.mul(float(1).sub(hk)).add(LOWHAZE.mul(hk)));
      Tr.assign(Tr.mul(float(1).sub(hk)));
    });   // festival: the far square sinks into the room's blue air
    // VFX V8: in the lit square the air is the room's sky in that direction, thin near the walls and growing with distance
    const Td = exp(max(dist.sub(9.0), 0).mul(uDayAir).negate());
    const dayC = col.rgb.mul(Td).add(roomSky(dir).mul(float(1).sub(Td)));
    return vec4(mix(col.rgb.mul(Tr).add(ins), dayC, uDay), col.a);
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
  const uPool = uniform(1);
  const uNight = uniform(0), uReach = uniform(1);                    // params.reach: the lamps' radius (× 15 m)                                          // params.night: the blue of the night on stone outside the lamp pools
  const NAVY = vec3(0.0103, 0.0232, 0.0844);                         // #1B2A52 in linear (ARTE-2 §3, the intro's night blue)
  const nightOn = (albedo, lampAcc) => NAVY.mul(uNight).mul(dot(albedo, vec3(0.3, 0.55, 0.15)).mul(1.2).add(0.3).min(0.8))
    .mul(float(1).sub(smoothstep(0.0, 0.12, dot(lampAcc, vec3(0.3, 0.55, 0.15))))).mul(uRev).mul(uDark);                                           // params.pool: the lamps' pools on stone (T-034 light pass: 1.25 in the work)
  const lampLight = (albedo, rough, metal, nV, Pw) => Fn(() => {
    const acc = vec3(0).toVar();
    const Nw = normalize(nV.transformDirection(cameraWorldMatrix));
    const Vw = normalize(cameraPosition.sub(Pw));
    const a2 = max(rough.mul(rough), 0.003);
    const shin = float(2).div(a2.mul(a2)).sub(2).min(700);
    const f0 = mix(vec3(0.04), albedo, metal);
    const kd = albedo.mul(float(1).sub(metal)).mul(1 / Math.PI);
    If(uFest.greaterThan(0.001), () => {
      Loop(LOOP(uNSP), ({ i }) => {                                   // VFX 25-11: the festival's stage spots (compacted)
        const L = uSpotP.element(i), Dd = uSpotD.element(i);
        const Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv), Ld = Lv.mul(d2.inverseSqrt());
        const along = dot(Pw.sub(L.xyz), Dd.xyz);
        const cone = smoothstep(Dd.w, Dd.w.add(0.035), dot(Ld.negate(), Dd.xyz)).mul(smoothstep(22.0, 15.0, along));   // stops past the tower: no light ellipse on the facade behind
        const ndl = max(dot(Nw, Ld), 0);
        const H = normalize(Ld.add(Vw)), spec = f0.mul(pow(max(dot(Nw, H), 0), shin).mul(shin.add(8).mul(1 / (8 * Math.PI))));
        acc.addAssign(SPC.mul(L.w.mul(uFest).mul(cone).div(d2.add(1.0))).mul(ndl).mul(kd.add(spec)));
      });
    });
    If(uCrown.greaterThan(0.01), () => {
      Loop(4, ({ i }) => {                                            // AD#7: the crowned tower's gold light on the floor and facades
        const L = uTL.element(i), Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv), Ld = Lv.mul(d2.inverseSqrt()), ndl = max(dot(Nw, Ld), 0);
        const Hh = normalize(Ld.add(Vw)), sp = f0.mul(pow(max(dot(Nw, Hh), 0), shin).mul(shin.add(8).mul(1 / (8 * Math.PI))));
        const hd = length(Pw.xz.sub(L.xz)), pool = smoothstep(uTLR, uTLR.mul(0.55), hd);   // the pool spreads from the foot
        acc.addAssign(TLC.mul(L.w.mul(40).div(d2.add(1.5))).mul(ndl).mul(kd.add(sp.mul(1.5))).mul(pool));
      });
    });
    Loop(LOOP(uNHL), ({ i }) => {                                            // VFX 25-11: the hands' own light
      const L = uHL.element(i);
      const Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv);
      If(L.w.greaterThan(0.002).and(d2.lessThan(400.0)), () => {
        const Ld = Lv.mul(d2.inverseSqrt()), ndl = max(dot(Nw, Ld), 0);
        const H = normalize(Ld.add(Vw)), spec = f0.mul(pow(max(dot(Nw, H), 0), shin).mul(shin.add(8).mul(1 / (8 * Math.PI))));
        acc.addAssign(HLC.mul(L.w.mul(14).div(d2.add(0.4))).mul(ndl).mul(kd.add(spec)).mul(smoothstep(400.0, 30.0, d2)));
      });
    });
    Loop(LOOP(uNFI), ({ i }) => {                                            // VFX 25-11: the hand-lit fires of the Brasa, flickering
      const L = uFires.element(i);
      const Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv);
      If(L.w.greaterThan(0.002).and(d2.lessThan(900.0)), () => {
        const Ld = Lv.mul(d2.inverseSqrt()), ndl = max(dot(Nw, Ld), 0);
        const fl = sin(uTime.mul(11.0).add(L.x.mul(3.1))).mul(sin(uTime.mul(7.3).add(L.z.mul(2.3)))).mul(0.18).add(0.9);
        const Hf = normalize(Ld.add(Vw)), specF = f0.mul(pow(max(dot(Nw, Hf), 0), shin).mul(shin.add(8).mul(1 / (8 * Math.PI))));   // embers mirrored in the wet stone
        acc.addAssign(FC.mul(L.w.mul(26).mul(fl).div(d2.add(0.6))).mul(ndl).mul(kd.add(specF.mul(1.5))).mul(smoothstep(900.0, 60.0, d2)).mul(smoothstep(9.0, 1.5, Pw.y)));   // the facades fall to night upwards
      });
    });
    Loop(LOOP(uNL), ({ i }) => {
      const L = uLampsC.element(i);
      const Lv = L.xyz.sub(Pw), d2 = dot(Lv, Lv);
      If(d2.lessThan(LR2).and(L.w.greaterThan(0.001)), () => {
        const Ld = Lv.mul(d2.inverseSqrt());
        const ndl = max(dot(Nw, Ld), 0);
        const win = pow(clamp(float(1).sub(d2.div(uReach.mul(LR2))), 0, 1), 2);   // uReach < 1: tighter pools, the night between them
        const E = L.w.mul(26).mul(uPool).div(d2.add(0.25)).mul(win).mul(ndl);
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
  // T-034: the square's OWN environment (room.captureEnvironment): black at first, captured from the eye at rest (the host calls
  // captureEnv() during its warm-up, the square at t = 30): wet slabs, glass, iron and the mirror shards reflect the real square.
  // The hand-made reflections (sky in the glass, lamp streaks on the floor) stay, weaker (uFake), for the crispness the 256 px map lacks.
  // CC0 detail (Poly Haven, ../assets/cc0/SOURCES.md): real sandstone grain on the facades, worn stone slabs on the floor — as
  // detail over the procedural pattern (albedo × the map's deviation from its mean, roughness bias), so the square keeps its design
  const tl = new THREE.TextureLoader();
  const cc0 = (name, map, srgb) => { const t = tl.load(new URL(`../assets/cc0/${name}/${name}_${map}_1k.jpg`, import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const texWall = cc0('sandstone_cracks', 'diff', true), texWallR = cc0('sandstone_cracks', 'rough', false);
  const texSlab = cc0('large_sandstone_blocks', 'diff', true), texSlabR = cc0('large_sandstone_blocks', 'rough', false);
  const { texture: tex } = TSL;
  const uDetail = uniform(1);                                          // params.detail (0 = the procedural surfaces alone)
  const envRT = room.captureEnvironment ? room.captureEnvironment(new THREE.Scene()) : null, envMats = [];
  const uFake = uniform(envRT ? 0.45 : 1);
  // params.silhouette (0..1, the baixada's dawn): the square drawn pure black, unlit, with a thin warm rim on what faces the east
  // (P1, where the dawn is) — the sky and the floor are hidden, so the part behind (3D-PO's dawn sky) shows through. Far layer only.
  const uSil = uniform(0);
  const eastW = room.walls.find((w) => w.id === 'P1') || room.walls[0];
  const uEast = uniform(eastW.normal.clone().negate());
  const silOut = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const edge = pow(float(1).sub(abs(dot(N, V))), 4), toE = max(dot(N, uEast), 0);
    // VFX 25-11: albergínia in the dawn air (aerial perspective towards the room's sky), never black cardboard; the warm rim stays
    const dv = positionWorld.sub(cameraPosition), dd = length(dv), air = float(1).sub(exp(dd.mul(-0.022))).mul(0.85);
    const base = mix(vec3(...palLin('albergínia', 0.55)), roomSky(dv.div(dd)), air);
    return vec4(base.add(vec3(...palLin('alba-rosa')).mul(edge.mul(toE).mul(0.45))), 1);
  });
  function finish(m, shatterKind) {
    if (shatterKind !== undefined) m.positionNode = shatterPos(shatterKind); m.fog = false; m.outputNode = mix(fogOut(), silOut(), uSil);
    if (envRT && m.isMeshStandardNodeMaterial) { m.envMap = envRT.texture; m.envMapIntensity = 1; envMats.push(m); }
    return m;
  }
  function captureEnv() { if (envRT) room.captureEnvironment(room.scene, { renderTarget: envRT }); return !!envRT; }

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
    const dW = tex(texWall, uvm.mul(0.55)).rgb, dWl = dot(dW, vec3(0.3, 0.55, 0.15));
    const detailW = mix(vec3(1), dW.div(max(dWl, 0.05)).mul(dWl.div(0.42)).clamp(0.4, 1.8), uDetail.mul(0.6));   // ~0.42: the map's mean luma
    const albedo = base.mul(grain.mul(0.12).add(0.95)).mul(float(1).sub(streak.mul(0.28))).mul(mix(1, 0.6, damp)).mul(big.mul(0.12).add(0.94)).mul(detailW);
    const height = joint.mul(-0.012).mul(isA.add(isS.mul(peel))).add(grain.mul(0.0025)).add(peel.mul(-0.003).mul(isS)).add(bh.mul(0.004).mul(isA));
    const p = fragProg(aFrag);
    const isMirror = step(fract(aFrag.w.mul(131.3)), uMirror).mul(smoothstep(0.05, 0.5, p));
    const sAlb = mix(albedo, vec3(0.02), isMirror), sRough = mix(float(0.9).sub(damp.mul(0.45)).sub(isD.mul(0.1)).add(tex(texWallR, uvm.mul(0.55)).r.sub(0.6).mul(0.3).mul(uDetail)).clamp(0.2, 1), float(0.05), isMirror);
    const sN = bumpN(height.mul(float(1).sub(isMirror)), 1.0);
    // under the moon the stone loses its sodium warmth (it is the lamps that make it warm): the lit-by-sky albedo goes cool grey at night,
    // the lamps' own light below still sees the warm stone
    const sCool = mix(sAlb, vec3(dot(sAlb, vec3(0.3, 0.55, 0.15))).mul(vec3(0.55, 0.8, 1.45)), uNight.mul(0.85));
    const sDay = sAlb.div(max(dot(sAlb, vec3(0.3, 0.55, 0.15)), 0.02)).mul(0.24).mul(uDayTone);   // lime-washed: the stone's own variation, the chapter's tone
    m.colorNode = mix(sCool, sDay, uDay.mul(float(1).sub(isMirror))); m.roughnessNode = sRough; m.metalnessNode = isMirror; m.normalNode = sN;
    const R = reflectVector;
    const mirE = Fn(() => { const e = vec3(0).toVar(); If(isMirror.greaterThan(0.001), () => { e.assign(envRefl(R, Pw, 900).add(vec3(0.75, 0.82, 1.0).mul(pow(max(dot(R, uMoonDir), 0), 24).mul(1.6).mul(uRev))).mul(isMirror).mul(0.85)); }); return e; })();
    const sLamp = lampLight(sAlb, sRough, isMirror, sN, Pw);
    m.emissiveNode = mirE.add(sLamp).add(nightOn(sAlb, sLamp).mul(float(1).sub(isMirror))).mul(float(1).sub(uDay.mul(0.8)));
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
    const dLamp = lampLight(dAlb, dRough, aInfo.z, dN, Pw);
    m.emissiveNode = vec3(1.0, 0.55, 0.22).mul(lit).mul(on).mul(louv.oneMinus().mul(isL)).mul(2.2).mul(uWin).mul(smoothstep(0.4, 0.0, p)).add(dLamp).add(nightOn(dAlb, dLamp));
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
    const winE = interior.mul(warm).mul(litR.mul(0.6).add(0.55)).mul(litOn).mul(life).mul(mix(0.7, 0.75, isShop)).mul(uWin);   // AD#12: no flat white shop windows (was 1.1–1.6)
    const dimRoom = surf.mul(0.006).mul(uRev);                       // unlit rooms: almost black, a hint of depth
    // the rose: twelve petals, rings, deep blue and red with amber, faintly lit from inside
    const rq = vec2(uvm.x.sub(aExt.x), uvm.y.sub(aExt.y)), rr0 = length(rq).div(aExt.z), ra = atan(rq.y, rq.x);
    const pet = abs(cos(ra.mul(6))), petals = smoothstep(0.55, 0.9, pet.mul(0.6).add(rr0.mul(0.5)));
    const lead = smoothstep(0.03, 0.0, abs(fract(rr0.mul(5)).sub(0.5)).sub(0.45).abs()).add(smoothstep(0.92, 1.0, abs(cos(ra.mul(24)))).mul(step(0.35, rr0)));
    const rcol = mix(mix(vec3(0.05, 0.09, 0.42), vec3(0.5, 0.07, 0.05), petals), vec3(1.0, 0.6, 0.22), smoothstep(0.3, 0.0, rr0).add(mx_noise_float(vec3(uvm.mul(1.7), 4.0)).mul(0.25)).clamp(0, 1));
    const roseE = rcol.mul(float(1).sub(clamp(lead, 0, 1).mul(0.85))).mul(mx_noise_float(vec3(uvm.mul(3), 0)).mul(0.3).add(0.8)).mul(0.3).mul(smoothstep(22, 24, uTR)).mul(uWin);
    // the lanterns: as bright as their lamp right now
    const lampW = uLamps.element(aInfo.y.toInt()).w;
    const lampE = vec3(1.0, 0.58, 0.28).mul(lampW).mul(6.5);        // QA 24-11: a warm core, not a burnt-white globe (was ×14, paler)
    const R = reflectVector;
    const fr = mix(fresnel(dot(V.negate(), N), float(0.04)), float(0.85), smoothstep(0.0, 0.5, p));
    const refl = envRefl(R, Pw, 1500).mul(fr).mul(uFake);
    m.colorNode = vec3(0.01);
    m.roughnessNode = float(0.06);
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
    m.emissiveNode = envRefl(R, Pw, 2500).mul(uFake).add(vec3(0.75, 0.82, 1.0).mul(sheen)).mul(fr).mul(tintT).mul(1.1);
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
    const fuv = vec2(fu.mul(len), fv.mul(rowW)).add(vec2(hash12(vec2(col, row)).mul(3.0), hash12(vec2(row, col)).mul(3.0))).mul(0.6);   // a different piece of stone on every slab
    const dS = tex(texSlab, fuv).rgb, dSl = dot(dS, vec3(0.3, 0.55, 0.15));
    const detailS = mix(vec3(1), dS.div(max(dSl, 0.05)).mul(dSl.div(0.4)).clamp(0.4, 1.8), uDetail.mul(0.7));
    const albedo = mix(c1, c2, sh).mul(grain.mul(0.25).add(0.9)).mul(mix(1, 0.45, joint)).mul(mix(1, 0.5, wet)).mul(wear.mul(0.1).add(1)).mul(detailS);
    const tilt = vec2(hash12(vec2(col, row)).sub(0.5), hash12(vec2(row, col.add(5.0))).sub(0.5)).mul(0.006);
    const height = smoothstep(0.035, 0.0, edge).mul(-0.0025).add(fu.mul(len).mul(tilt.x)).add(fv.mul(rowW).mul(tilt.y)).add(grain.mul(0.0018).mul(float(1).sub(wet)));
    const fRough = mix(float(0.62).add(grain.mul(0.12)).add(tex(texSlabR, fuv).r.sub(0.6).mul(0.35).mul(uDetail)).clamp(0.3, 1), float(0.07), wet);
    const fN = bumpN(height, 1.0);
    const fDay = albedo.div(max(dot(albedo, vec3(0.3, 0.55, 0.15)), 0.01)).mul(0.16).mul(uDayFloor).mul(mix(1, 0.6, joint));
    m.colorNode = mix(albedo, fDay, uDay); m.roughnessNode = mix(fRough, max(fRough, 0.55), uDay); m.metalnessNode = float(0); m.normalNode = fN;
    // fake reflections: what a puddle sees (facades, sky), and a long streak under every lamp
    const V = viewDir();
    const R = vec3(V.x, V.y.negate(), V.z);
    const fr = fresnel(V.y.negate(), float(0.03));
    const Rh = normalize(R.xz);
    const refl = Fn(() => {
    const rf = mix(vec3(0.012, 0.009, 0.006).mul(uRev).mul(uDark), skyCol(R, false), smoothstep(uHorizon.sub(0.05), uHorizon.add(0.05), R.y)).toVar();
    const ripple = mx_noise_float(vec3(W.x.mul(2.0), uTime.mul(0.15), W.y.mul(2.0))).mul(0.012);
    Loop(LOOP(uNL), ({ i }) => {
      const L = uLampsC.element(i);
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
    m.emissiveNode = refl.mul(fr).mul(wet.mul(0.9).add(0.1)).mul(uFake.mul(0.5).add(0.5)).add(lampLight(albedo, fRough, float(0), fN, Pw)).mul(float(1).sub(uDay.mul(0.85)));
    // VFX 25-11 (Brasa): embers glow in the JOINTS of the paving round every hand-lit fire (not confetti on top)
    const ember = Fn(() => {
      const e = float(0).toVar();
      If(uNightK.greaterThan(0.01), () => {
        Loop(LOOP(uNFI), ({ i }) => { const L = uFires.element(i); If(L.w.greaterThan(0.002), () => { const d = Pw.xz.sub(L.xz); e.addAssign(L.w.mul(exp(dot(d, d).mul(-0.7)))); }); });
      });
      const fl = mx_noise_float(vec3(W.x.mul(2.0), uTime.mul(0.6), W.y.mul(2.0))).mul(0.5).add(0.6);
      const some = smoothstep(0.35, 0.75, mx_noise_float(vec3(W.x.mul(0.9), 2.3, W.y.mul(0.9))).mul(0.5).add(0.5));   // only some joints hold embers
      return FC.mul(smoothstep(0.003, 0.009, edge).oneMinus()).mul(min(e, 1.2)).mul(fl).mul(some).mul(uNightK).mul(0.6);
    })();
    m.emissiveNode = m.emissiveNode.add(ember.mul(0.0));   // AD 25-11: glowing joints read as Tron — the embers live in the wet stone's reflection instead
    return finish(m);
  })();

  const skyMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const dS = normalize(positionWorld.sub(cameraPosition));
    const dawnSky = mix(vec3(...palLin('alba-rosa')).mul(0.75), vec3(...palLin('alba-blau')).mul(0.45), smoothstep(0.02, 0.55, dS.y));
    m.colorNode = mix(mix(skyCol(dS), roomSky(dS), max(max(max(uDay, uNightK), max(uFest.mul(0.85), uBlue)), uPom)), dawnSky, uDawn);   // AD#12: the dawn climbs the sky over the bajada
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
    mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true;   // VFX V7: the lit square's key shadow
    object.add(mesh);
    return mesh;
  }
  let verts = 0;
  for (let s = 0; s < NS; s++) {
    for (const [k, mat] of [['stone', stoneMat], ['detail', detailMat], ['glass', glassMat], ['mirror', mirrorMat]]) { verts += B[k][s].p.length / 3; mkMesh(B[k][s], mat); }
  }
  for (const k in B) B[k].length = 0;
  const floorGeo = new THREE.PlaneGeometry(160, 160); floorGeo.rotateX(-Math.PI / 2); geos.push(floorGeo);
  const floor0 = new THREE.Mesh(floorGeo, floorMat); floor0.matrixAutoUpdate = false; floor0.receiveShadow = true; object.add(floor0);
  const skyGeo = new THREE.SphereGeometry(300, 48, 24); geos.push(skyGeo);
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.matrixAutoUpdate = false; sky.renderOrder = -10; sky.frustumCulled = false; object.add(sky);

  // lights: the fanals, the moon, the sky's ambient
  for (const L of lamps) { L.light.layers.set(31); object.add(L.light); }   // read by the atmos part; the renderer skips layer 31
  const moon = new THREE.DirectionalLight(new THREE.Color(0.58, 0.72, 1.0), 0);   // a cool moon against the sodium lamps
  moon.position.copy(uMoonDir.value).multiplyScalar(50); object.add(moon); object.add(moon.target);
  // VFX V7/V8: the moon is also the lit square's key, with the room's one shadow map (updated once per frame, not ×4 walls)
  const keyS = room.keyShadow ? room.keyShadow(moon, { extent: 34, far: 140, static: true }) : null;   // VFX perf: a static map
  let shadowKey = '';
  const moonDay = new THREE.Vector3(), moonNight = uMoonDir.value.clone(), _kc = new THREE.Color(), _md = new THREE.Vector3();
  const LIT = { pinya: { dir: [-0.55, 0.42, -0.72], tone: 'cal-foc', floor: 'pedra-llum', key: 'cal-foc', k: 4.2, fill: 0.45, air: 0.01, lamps: 0.6 },
                tronc: { dir: [0.45, 0.85, -0.35], tone: 'porcellana', floor: 'pedra-llum', key: 'porcellana', k: 5.0, fill: 0.5, air: 0.008, lamps: 0.12 } };
  for (const c of Object.values(LIT)) { c.toneL = palLin(c.tone); c.floorL = palLin(c.floor); c.keyL = palLin(c.key); }
  let crT = 0, dustK = 0, festaT = 0; const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  let dayK = 0, litCfg = LIT.tronc, nightK = 0, festK = 0, blueK = 0, blueProg = 0, pomK = 0, pinK = 0, crK = 0;
  // the pinya's bonfires: two low fires on each side of each wall's crowd (5 m beyond the wall), on the paving
  const pinFires = []; for (const w of room.walls) for (const sd of [-1.9, 1.9]) { const p = w.centre.clone().addScaledVector(w.normal, -4.6).addScaledVector(w.right, sd); p.y = -0.2; pinFires.push({ p, k: 0.55 + 0.1 * Math.abs(sd) / 1.9 }); }

  const hl = Array.from({ length: NHL }, () => ({ stroke: null, k: 0, seen: false, last: -99, pos: new THREE.Vector3(0, -50, 0) }));
  function stepHandLights(dt, time, hands, on) {
    for (const H of hl) H.seen = false;
    if (on) for (const h of hands || []) {
      if (h.ended) continue;
      let H = hl.find((x) => x.stroke === h.stroke && x.stroke !== null);
      if (!H) { H = hl.find((x) => x.stroke === null) || hl.reduce((a, b) => (a.k < b.k ? a : b)); H.stroke = h.stroke; H.k = Math.min(H.k, 0.05); }
      H.seen = true; H.last = time;
      const n = h.normal || room.walls[h.wall]?.normal; _hp.copy(h.pos); if (n) _hp.addScaledVector(n, -0.8); _hp.y = Math.max(0.5, h.pos.y - 0.2);
      if (H.pos.y < -10) H.pos.copy(_hp); else H.pos.lerp(_hp, 1 - Math.exp(-dt / 0.25));
    }
    for (let i = 0; i < NHL; i++) {
      const H = hl[i], tgt = H.seen ? 1 : 0;
      H.k += (tgt - H.k) * (1 - Math.exp(-dt / (H.seen ? 0.18 : 1.6)));   // in ~0.4 s, out over ~4 s
      if (!H.seen && H.k < 0.01) { H.stroke = null; H.k = 0; }
      hlVec[i].set(H.pos.x, H.pos.y, H.pos.z, H.k);
    }
    hl.sort((a, b) => b.k - a.k); let n = 0; for (let i = 0; i < NHL; i++) { hlVec[i].set(hl[i].pos.x, hl[i].pos.y, hl[i].pos.z, hl[i].k); if (hl[i].k > 0.01) n = i + 1; } uNHL.value = n;
  }
  const _hp = new THREE.Vector3(), _ord = Array.from({ length: NL }, (_, i) => i);
  // the festival spots: per castell wall, from 13 m up and 5 m to one side (alternating), 3 m beyond the tower, aimed at its foot
  const SPOT_K = 1100, SPOT_A = 15 * Math.PI / 180;   // (the pools: a stage pool, not a floodlit floor — AD m-tronc)
  const shafts = new THREE.Group(); shafts.name = 'plaza:shafts'; object.add(shafts);
  const uDust = uniform(0);
  {
    const ND = 4000, dm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const { instanceIndex, hash: hsh } = TSL;
    const id = float(instanceIndex), tw = id.mod(4.0), r1 = hsh(id.mul(1.37)), r2 = hsh(id.mul(2.71).add(5.0)), r3 = hsh(id.mul(4.13).add(9.0));
    const T4 = [0, 1, 2, 3].map((i) => { const w = room.walls[i % room.walls.length]; return w.centre.clone().addScaledVector(w.normal, -2.3); });
    const tx = select(tw.lessThan(0.5), float(T4[0].x), select(tw.lessThan(1.5), float(T4[1].x), select(tw.lessThan(2.5), float(T4[2].x), float(T4[3].x))));
    const tz = select(tw.lessThan(0.5), float(T4[0].z), select(tw.lessThan(1.5), float(T4[1].z), select(tw.lessThan(2.5), float(T4[2].z), float(T4[3].z))));
    const fall = fract(uTime.mul(r1.mul(0.05).add(0.035)).add(r2));          // 0 at the top … 1 on the floor, ~20–30 s a fall
    const ang = uTime.mul(0.4).add(r3.mul(6.283)), rad = fall.mul(0.8).add(0.1).mul(r2.mul(0.7).add(0.3));   // AD#9: a denser column above each tower
    dm.positionNode = vec3(tx.add(cos(ang).mul(rad)), mix(float(6.2), float(0.05), fall), tz.add(sin(ang).mul(rad)));
    dm.scaleNode = vec2(0.025).mul(r3.mul(0.8).add(0.6));
    const tw2 = sin(uTime.mul(r1.mul(5.0).add(2.0)).add(r3.mul(40.0))).mul(0.5).add(0.5);
    dm.colorNode = Fn(() => { const q = length(uv().sub(0.5)).mul(2.0); return vec4(TLC.mul(exp(q.mul(q).mul(-5.0))).mul(tw2.mul(1.6).add(0.4)).mul(uDust).mul(2.5), 1); })();
    const dust = new THREE.Sprite(dm); dust.count = ND; dust.frustumCulled = false; dust.renderOrder = 7; object.add(dust);
  }
  {
    const coneG = new THREE.CylinderGeometry(0.15, 1, 1, 40, 1, true).translate(0, -0.5, 0);   // apex at 0, opening down to y = -1
    for (let i = 0; i < NSP; i++) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      // AD#11: a VOLUMETRIC gaussian beam, the same from any angle — the distance between the view ray and the beam's axis, against the
      // beam's radius there (the old Fresnel core turned narrow cones into hard-edged bright slabs)
      const bS = uniform(new THREE.Vector3()), bD = uniform(new THREE.Vector3(0, -1, 0)), bT = uniform(0.05), bL = uniform(10);
      const E0 = cameraPosition, Vr = normalize(positionWorld.sub(E0)), w0 = E0.sub(bS);
      const bb = dot(Vr, bD), dd = dot(Vr, w0), ee = dot(bD, w0), den = max(float(1).sub(bb.mul(bb)), 1e-4);
      const sc = bb.mul(ee).sub(dd).div(den), tc = ee.sub(bb.mul(dd)).div(den);
      const rr = length(E0.add(Vr.mul(sc)).sub(bS.add(bD.mul(tc)))), Rb = max(tc.mul(bT), 0.05);
      const prof = exp(rr.div(Rb).pow(2).mul(-2.2)).mul(smoothstep(0.0, 1.5, tc)).mul(float(1).sub(smoothstep(bL.mul(0.8), bL, tc))).mul(mix(1.0, 0.5, clamp(tc.div(bL), 0, 1)));
      const breathe = sin(uTime.mul(0.35).add(i * 1.7)).mul(0.12).add(0.88);
      m.colorNode = SPC.mul(prof).mul(uFest).mul(0.05).mul(uShaftK).mul(breathe);
      m.userData.beam = { bS, bD, bT, bL };
      const cone = new THREE.Mesh(coneG, m); cone.renderOrder = 6; cone.frustumCulled = false;
      shafts.add(cone);
    }
  }
  // aim the spots at the towers' foot: tronc3d.towerD (2.3 m beyond the wall since M3), read when it is there
  let spotTD = -1;
  const _sf = new THREE.Vector3(), _ss = new THREE.Vector3(), _sd = new THREE.Vector3(), _yN = new THREE.Vector3(0, -1, 0);
  // two looks (director 25-11: four stages in the same square must read different):
  //   'tronc' — the tower in CROSSED spotlights: two narrow beams per wall from high left and right, crossing over the tower
  //   'pinya' — the festival crowd: one broad warm wash per wall, lower and from the front side, a wide pool on the paving
  let spotMode = '';
  const _gold = new THREE.Vector3(...palLin('or')).multiplyScalar(1.15);
  const PINYA_C = palLin('cal-foc').map((c, i) => c * 0.75 + palLin('fanal')[i] * 0.25), TRONC_C = palLin('cal-fanal');
  function placeSpots(td, mode = 'tronc') {
    const key = td + mode; if (key === spotTD) return; spotTD = key; spotMode = mode;
    const crown = mode === 'crown'; if (crown) mode = 'tronc';
    const nw = room.walls.length, cross = mode === 'tronc', n = cross ? Math.min(NSP, nw * 2) : Math.min(NSP, nw);
    const A = (cross ? 8 : 18) * Math.PI / 180, AV = (cross ? 3.2 : 8) * Math.PI / 180;   // the light cone · the VISIBLE shaft (a narrow core)
    for (let i = 0; i < NSP; i++) {
      const c = shafts.children[i];
      if (i >= n) { spotP[i].w = 0; c.visible = false; continue; }
      const w = room.walls[i % nw], side = cross ? (i < nw ? -1 : 1) : (i % 2 ? 1 : -1);
      _sf.copy(w.centre).addScaledVector(w.normal, -td); _sf.y = cross ? 3.2 : 0.6;                       // tronc: the beams cross over the tower
      _ss.copy(_sf).addScaledVector(w.right, side * (cross ? 5.0 : 3.0)).addScaledVector(w.normal, cross ? -4.0 : -1.0); _ss.y = cross ? 13.0 : 9.0;
      _sd.copy(_sf).sub(_ss).normalize();
      spotP[i].set(_ss.x, _ss.y, _ss.z, (cross ? SPOT_K * 1.6 : SPOT_K * 1.4) * (crown ? 1.4 : 1));   // the beams read by their shafts (×2), the pools stay small spotD[i].set(_sd.x, _sd.y, _sd.z, Math.cos(A));
      const len = _ss.distanceTo(_sf) * (cross ? 1.12 : 1.05), rad = len * Math.tan(AV);   // the shaft ends at the tower (past it, the cone came towards the eye: a veil)
      c.visible = true; c.position.copy(_ss); c.quaternion.setFromUnitVectors(_yN, _sd); c.scale.set(rad * 2.5, len, rad * 2.5);   // the mesh only holds the volume
      const bm = c.material.userData.beam; if (bm) { bm.bS.value.copy(_ss); bm.bD.value.copy(_sd); bm.bT.value = Math.tan(AV); bm.bL.value = len; }
    }
    uNSP.value = n; uSpotC.value.fromArray(cross ? TRONC_C : PINYA_C); uShaftK.value = cross ? 2.2 : 1.0;
  }
  placeSpots(2.3);
  // VFX 25-11: the Brasa's fires light the square. setFires(list, posOf(item) → Vector3, kOf(item) → 0..~1.2); the first NFI count
  function setFires(list, posOf, kOf) {
    let n = 0;
    for (let i = 0; i < NFI; i++) { const it = list && list[i]; if (it) { const p = posOf(it); fireVec[i].set(p.x, p.y + 0.5, p.z, Math.max(0, kOf(it))); if (fireVec[i].w > 0.003) n = i + 1; } else fireVec[i].w = 0; }
    uNFI.value = n;
  }
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
  // ---- T-056: a hand lights the nearest fanal (score event 'lamp' {wall, s}; study: a hand landing). Once lit, a lamp stays lit.
  for (const L of lamps) L.t00 = L.t0;
  const RW = room.walls || [], RCUM = []; let RPER = 0; for (const w of RW) { RCUM.push(RPER); RPER += w.width; }
  const _lp = new THREE.Vector3();
  let prevT = -1, lampsLitByHand = 0;
  function evLamp(e) {                                                // 'lamp' | 'lamp:<wall>[:<s>]' | { type|name: 'lamp', wall, s }
    if (typeof e === 'string') { if (e !== 'lamp' && !e.startsWith('lamp:')) return null; const a = e.split(':'); return { wall: a[1] !== undefined ? +a[1] : NaN, s: a[2] !== undefined ? +a[2] : NaN }; }
    if (e && typeof e === 'object' && (e.type ?? e.name ?? e.e ?? e.event) === 'lamp') return { wall: +(e.wall ?? e.w ?? NaN), s: +(e.s ?? NaN) };
    return null;
  }
  function wallPoint(wall, s, out) {                                  // a point at 1.2 m on the wall (perimeter s, or the wall's centre)
    if (!RW.length || !(RPER > 0)) return false;
    let w = Number.isFinite(wall) && RW[wall] ? wall : -1, u;
    if (Number.isFinite(s)) {
      const sp = ((s % RPER) + RPER) % RPER;
      if (w < 0 || sp < RCUM[w] - 0.5 || sp > RCUM[w] + RW[w].width + 0.5) { w = RW.length - 1; for (let i = 0; i < RW.length; i++) if (sp < RCUM[i] + RW[i].width) { w = i; break; } }
      u = Math.min(RW[w].width, Math.max(0, sp - RCUM[w]));
    } else if (w >= 0) u = RW[w].width / 2; else return false;
    const W = RW[w]; out.set(W.pa.x + W.right.x * u, 1.2, W.pa.z + W.right.z * u); return true;
  }
  function lightNear(wall, s, tR) {
    if (!wallPoint(wall, s, _lp)) return -1;
    const eye = room.eye || { x: 0, z: 0 }, a0 = Math.atan2(_lp.x - eye.x, _lp.z - eye.z);
    let bi = -1, bd = 1.25;                                           // ≤ ~70° from the hand, seen from the eye
    for (let i = 0; i < NL; i++) {
      const L = lamps[i]; if (L.t0 <= tR) continue;                    // already lit (or lighting)
      let d = Math.atan2(L.pos.x - eye.x, L.pos.z - eye.z) - a0; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi >= 0) { lamps[bi].t0 = tR + 0.02; lampsLitByHand++; }
    return bi;
  }
  function update(dt, input) {
    let t = input.t ?? 0; const time = input.time ?? 0;
    const pr = input.params || P;
    // VFX V8: lit in pinya / tronc (or params.lit), eased ≈ 1.5 s; while lit the square is whole and fully revealed
    const blk = input.state?.block, cfg = LIT[blk] || null;
    if (cfg) litCfg = cfg; else if (pr.litBlock && LIT[pr.litBlock]) litCfg = LIT[pr.litBlock];
    const dayT = input.state ? 0 : Math.max(0, Math.min(1, +pr.lit || 0));   // Beltrán 25-11: no daylight in the work (the study can still show it)
    const festT = (blk === 'tronc' || blk === 'crown' || blk === 'festa') ? 1 : input.state ? 0 : Math.max(0, Math.min(1, +pr.fest || 0));
    festK += (festT - festK) * Math.min(1, dt * 1.2); if (Math.abs(festT - festK) < 1e-3) festK = festT;
    dayK += (dayT - dayK) * Math.min(1, dt * 1.6); if (Math.abs(dayT - dayK) < 1e-3) dayK = dayT;
    if (dayK > 0.001 || festK > 0.001 || blueK > 0.001 || pomK > 0.001 || pinK > 0.001 || crK > 0.001) t = Math.max(30, Math.min(t, 45));
    const rv = +pr.reveal || 0, shv = +pr.shatter || 0;   // the host drives the break / re-assembly at chapter changes (arrive 1 → 0, leave 0 → 1)
    const tR = rv > 0 ? 8 + 17 * Math.min(1, rv) : shv > 0 ? Math.max(t, 30) : t;
    const tS = shv > 0 ? 46 + 24 * Math.min(1, shv) : pr.noBreak ? Math.min(t, 45.99) : t;   // noBreak: the host breaks it into image tiles instead (T-034)
    const S = tS < 46 ? 0 : tS < 58 ? (tS - 46) / 12 : Math.min(2.6, 1 + ((tS - 58) / 12) * 1.25);
    const reveal = sm((tR - 8) / 17);
    const dark = 1 - 0.85 * sm((S - 0.55) / 1.5);
    if ((S > 0) !== grown) { grown = S > 0; for (const g of geos) if (g.userData.r0) g.boundingSphere.radius = g.userData.r0 + (grown ? 14 : 0); }
    uT.value = t; uTime.value = time; uS.value = S; uTR.value = tR; uRev.value = reveal; uDark.value = dark;
    uSky.value = reveal * (1 - 0.55 * sm((S - 0.7) / 1.5)) * (pr.sky ?? 1);
    uHorizon.value = 0.55 - 0.53 * sm((S - 0.25) / 0.8);
    uFog.value = (pr.haze ?? 1) * 0.0065;   // AD#5: the square's own fog −60 % (the haze lives in the beams)
    uGlow.value = pr.glow ?? 1;
    uLit.value = pr.windows ?? 0.45;
    uWet.value = pr.wet ?? 0.75;
    uDrift.value = pr.drift ?? 1;
    uMirror.value = pr.mirror ?? 0.45;
    uWin.value = (pr.windowGlow ?? 1);
    uStars.value = pr.stars ?? 1;
    blueK += ((blk === 'baixada' && pr.blueHour !== false ? 1 : 0) - blueK) * Math.min(1, dt * 1.2);   // AD plan B: the blue hour, not a silhouette
    const silK = blueK > 0.5 ? 0 : Math.max(0, Math.min(1, pr.silhouette ?? 0)); uSil.value = silK; sky.visible = silK < 0.5; floor0.visible = silK < 0.5; object.position.y = -(pr.silDrop ?? 0) * silK;   // params.silDrop (m): the silhouette sinks so its rooftops sit low on the walls, the sky above
    if (Array.isArray(pr.skyTint)) uSkyTint.value.fromArray(pr.skyTint); else uSkyTint.value.set(1, 1, 1);
    const envK = (pr.env ?? 1) * reveal * dark; for (const m of envMats) m.envMapIntensity = envK;
    const moonK = (pr.moon ?? 1) * reveal * dark;
    moon.intensity = 0.32 * moonK * (pr.moonKey ?? 1); hemi.intensity = 0.55 * moonK * (1 + 0.45 * ((pr.moonKey ?? 1) - 1));   // the moon's key also fills the shadows with a cool sky
    if (keyS) { const k = `${moon.position.x.toFixed(2)},${moon.position.y.toFixed(2)},${moon.position.z.toFixed(2)},${uS.value.toFixed(3)},${object.position.y.toFixed(2)},${object.visible}`; if (k !== shadowKey) { shadowKey = k; keyS.dirty(); } }
    uBlue.value = blueK;
    uArr.value = (input.leave ?? 0) < 0.01 && (input.arrive ?? 1) < 0.999 ? 1 : 0;
    pinK += (((blk === 'pinya' || (!input.state && pr.pinya)) ? 1 : 0) - pinK) * Math.min(1, dt * 1.2); uPinya.value = pinK;
    festaT = blk === 'festa' ? festaT + dt : 0;   // festa = «after the coronation»: the gold still in the air, fading over ~20 s to a warm night
    const crTgt = (blk === 'crown' || (!input.state && pr.crown)) ? 1 : blk === 'festa' ? 0.3 + 0.4 * (1 - smooth01(festaT / 20)) : 0;
    crK += (crTgt - crK) * Math.min(1, dt * 0.9); uCrown.value = crK;
    if (pinK > 0.01) { moon.intensity *= 1 - 0.7 * pinK; hemi.intensity *= 1 - 0.6 * pinK; uWin.value = Math.max(uWin.value, pinK); uStars.value *= 1 - 0.7 * pinK; }
    if (pinK > 0.5 && !(nightK > 0.5)) setFires(pinFires, (F) => F.p, (F) => F.k * pinK * (0.85 + 0.15 * Math.sin(time * (2.1 + F.k) + F.k * 9)));   // the crowd's bonfires
    else if (pinK > 0.01 && pinK <= 0.5 && !(nightK > 0.5)) setFires(null);
    // POM (AD 25-11): the tower in the square at its darkest — lamps almost out, few windows, the room's deep sky, a faint haze
    pomK += (((blk === 'pom' || (!input.state && pr.pom)) ? 1 : 0) - pomK) * Math.min(1, dt * 1.2); uPom.value = pomK;
    if (pomK > 0.01) { uWin.value *= 1 - 0.75 * pomK; uStars.value *= 1 - 0.5 * pomK; moon.intensity *= 1 - 0.6 * pomK; hemi.intensity *= 1 - 0.6 * pomK; uFog.value = Math.max(uFog.value, 0.008 * pomK); }
    if (nightK > 0.01) { moon.color.setRGB(0.36, 0.35, 0.36); moon.intensity *= 1 - 0.6 * nightK; hemi.color.setRGB(0.2, 0.2, 0.24); hemi.intensity *= 1 - 0.5 * nightK; }   // Brasa (AD#5): only the fire gives colour
    if (blueK > 0.5) { const pg = Math.max(0, Math.min(1, Math.max(input.state?.progress ?? 0, (input.state?.t ?? 0) / 45)));   // AD#14: the lamps go out visibly over the chapter (by time too) object.position.y = 0; sky.visible = true; floor0.visible = true; uWin.value *= 0.7 - 0.5 * pg; uStars.value *= 0.4 * (1 - pg);
      hemi.color.setRGB(0.42, 0.55, 0.95); hemi.groundColor.setRGB(0.18, 0.14, 0.2); hemi.intensity = Math.max(hemi.intensity, 0.55 + 0.35 * pg); moon.color.setRGB(0.95, 0.7, 0.7); moon.intensity = Math.max(moon.intensity, 0.35 + 0.3 * pg); blueProg = pg; } else blueProg = 0;
    uDawn.value = blueK * smooth01((blueProg - 0.1) / 0.85);   // the blue hour: a cool sky fill, a rose dawn key;   // the lamps go out as the tower comes down
    uDay.value = dayK; uFest.value = festK; shafts.visible = festK > 0.002 && room.quality !== 'low';
    stepHandLights(dt, time, input.hands, nightK < 0.5 && uSil.value < 0.5 && (pr.handLight ?? true) !== false);
    if (festK > 0) placeSpots(+(ctx.parts?.tronc3d?.towerD ?? 2.3) || 2.3, blk === 'crown' || blk === 'festa' ? 'crown' : 'tronc');
    if (crK > 0.01) { uSpotC.value.lerp(_gold, crK); uShaftK.value = 2.2 + 1.2 * crK; uWin.value = Math.max(uWin.value, 0.9); crT += dt;
      const climb = smooth01((crT - 0.4) / 3.6), spread = smooth01((crT - 1.5) / 7);   // the gold climbs the tower in ~3.6 s, then the pool spreads
      for (let i = 0; i < 4; i++) { const w = room.walls[i % room.walls.length], td = +(ctx.parts?.tronc3d?.towerD ?? 2.3) || 2.3; tlVec[i].set(w.centre.x - w.normal.x * td, 0.4 + 3.4 * climb, w.centre.z - w.normal.z * td, crK * (0.25 + 0.75 * climb)); }
      uTLR.value = 1.2 + 9 * spread;
      // the PULSE at the top: two fronts from wall 0's centre both ways round the room, ~3 s to meet opposite
      const pp = (crT - 4.0) / 3.0, w0 = room.walls[0], a0 = Math.atan2(-w0.normal.z, -w0.normal.x);
      if (blk === 'crown' && pp > 0 && pp < 1.15) { const ph = Math.min(1, pp) * Math.PI; uPulse.value.set(Math.cos(a0 + ph), Math.sin(a0 + ph), Math.cos(a0 - ph), Math.sin(a0 - ph)); uPulseK.value = crK * Math.sin(Math.min(1, pp / 1.15) * Math.PI) ; } else uPulseK.value = 0;
      dustK = crK * smooth01((crT - 4.0) / 1.5) * (1 - smooth01((crT - 15) / 4));
      uWin.value *= 0.35; moon.intensity *= 0.35; hemi.intensity *= 0.35;   // the square dims ~65 % (AD#9): the gold towers are the light
    } else { crT = 0; dustK = 0; uPulseK.value = 0; for (const v of tlVec) v.w = 0; }
    uDust.value = dustK;   // CORONATION (AD#5): gold light bathes the tower, the facades and the haze
    if (festK > 0) {                                                  // the festival night: the square's own night, richer and deeper
      uWin.value = Math.max(uWin.value, festK * 0.9); uFog.value = Math.max(uFog.value, 0.0065); uWet.value = Math.max(uWet.value, 0.8);
      uSky.value = Math.max(uSky.value, festK);   // (AD#6: no moon / sky / env boost — they were the milky veil; the night grade is the Pinya's)
    }
    nightK += (((blk === 'brasa' || (!input.state && pr.brasa)) ? 1 : 0) - nightK) * Math.min(1, dt * 1.5); uNightK.value = nightK;
    if (nightK > 0) { uStars.value *= 0.3; uWin.value *= 1 - 0.5 * nightK; moon.intensity *= 1 - 0.4 * nightK; hemi.intensity *= 1 - 0.45 * nightK; for (const m of envMats) m.envMapIntensity *= 1 - 0.6 * nightK; }
    if (dayK > 0) {
      uDayTone.value.fromArray(litCfg.toneL); uDayFloor.value.fromArray(litCfg.floorL); uDayAir.value = litCfg.air;
      moonDay.fromArray(litCfg.dir).normalize(); _md.copy(moonNight).lerp(moonDay, dayK).normalize(); moon.position.copy(_md).multiplyScalar(60);
      const kc = litCfg.keyL, km = Math.max(kc[0], kc[1], kc[2], 1e-3); _kc.setRGB(kc[0] / km, kc[1] / km, kc[2] / km);
      moon.color.setRGB(0.58, 0.72, 1.0).lerp(_kc, dayK); hemi.groundColor.setRGB(0.25, 0.17, 0.1).lerp(_kc, dayK * 0.5);
      moon.intensity += (litCfg.k - moon.intensity) * dayK; hemi.intensity += (litCfg.fill - hemi.intensity) * dayK;
      uWet.value *= 1 - 0.85 * dayK; uStars.value *= 1 - dayK; uWin.value *= 1 - 0.75 * dayK; uGlow.value *= 1 - 0.8 * dayK; uFog.value *= 1 - dayK;
      for (const m of envMats) m.envMapIntensity = envK * (1 - 0.6 * dayK);
    } else { moon.position.copy(moonNight).multiplyScalar(50); moon.color.setRGB(0.58, 0.72, 1.0); hemi.groundColor.setRGB(0.25, 0.17, 0.1); }
    uPool.value = pr.pool ?? 1; uDetail.value = pr.detail ?? 1; uNight.value = pr.night ?? 0; uReach.value = pr.reach ?? 1;
    // T-056: hands light lamps early; a new pass (the clock went back) restores the old schedule
    if (tR < prevT - 1) for (const L of lamps) L.t0 = L.t00;
    prevT = tR;
    if ((pr.handLamp ?? true) !== false && tR < 46) {
      // T-055 (SCO2): event 'lamp:<wall>' per landing hand; payload S.lamps[] (this step's) / S.lamp (the last) = { wall, s, dx, y, at, n }
      let nEv = 0; const evs = [];
      if (input.events) for (const e of input.events) { const ev = evLamp(e); if (ev) { nEv++; evs.push(ev); } }
      if (nEv) {
        const St = input.state, list = St && Array.isArray(St.lamps) && St.lamps.length ? St.lamps.slice(-nEv) : St && St.lamp && nEv === 1 ? [St.lamp] : null;
        if (list) for (const o of list) lightNear(+o.wall, +o.s, tR); else for (const ev of evs) lightNear(ev.wall, ev.s, tR);
      }
      if (!input.state) for (const h of input.downs || []) lightNear(h.wall, RCUM[h.wall] !== undefined ? RCUM[h.wall] + (h.u ?? 0.5) * RW[h.wall].width : NaN, tR);   // the study's stand-in
    }
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
      const v = on * br * fl * L.base * (1 + (pr.handWarm ?? 0.5) * 0.6 * L.warm) * LK * (1 - (1 - (litCfg.lamps ?? 1)) * dayK) * (1 - 0.85 * nightK) * (1 - blueK * smooth01((blueProg * 1.2 - ((i * 0.618) % 1) * 0.95) / 0.08)) * (1 - 0.35 * blueK) * (1 - 0.88 * pomK) * (1 - 0.55 * pinK) * (1 - 0.75 * crK) * (blk === 'festa' ? 0.7 : 1);
      L.light.intensity = v * 26;
      lampVec[i].set(L.pos.x, L.pos.y, L.pos.z, v);
    }
    { let n = 0; const cap = room.quality === 'low' ? 4 : room.quality === 'medium' ? 8 : NL;
      _ord.sort((a, b) => lampVec[b].w - lampVec[a].w);
      for (const i of _ord) { if (n >= cap || lampVec[i].w < 0.01) break; lampVecC[n++].copy(lampVec[i]); }
      uNL.value = n; }
  }
  function setParams() { /* parameters are read live in update() */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of [stoneMat, detailMat, glassMat, mirrorMat, floorMat, skyMat]) m.dispose(); }
  if (typeof window !== 'undefined') window.__plaza = { lamps: NL, verts, meshes: object.children.length, lit: () => lamps.filter((L) => L.t0 <= prevT).length, byHand: () => lampsLitByHand };   // lab checks only
  // part.spots (for Modelado's lighting): pos[i] = (x, y, z, intensity), dir[i] = (x, y, z, cos of the cone), count(), on() 0..1, mode()
  const spots = { pos: spotP, dir: spotD, count: () => uNSP.value, on: () => uFest.value, mode: () => spotMode, color: uSpotC.value };
  // textObstacles() (Narrativa 25-11): the square's lamps as seen on the walls — [{ wall, x, half: 0.35, y0: 0, y1: 3 }] (x m from the wall's
  // centre along it). The lamps do not move: computed once (the posts project where the eye's ray to them crosses the wall).
  let _obst = null;
  function textObstacles() {
    if (_obst) return uSil.value > 0.5 ? [] : _obst;
    _obst = [];
    for (const L of lamps) {
      const ex = L.pos.x - room.eye.x, ez = L.pos.z - room.eye.z; let best = -1, bt = Infinity, bx = 0;
      room.walls.forEach((w, i) => { const den = -(ex * w.normal.x + ez * w.normal.z); if (den <= 1e-4) return; const dd = -((w.pa.x - room.eye.x) * w.normal.x + (w.pa.z - room.eye.z) * w.normal.z), t = dd / den;
        const x = (room.eye.x + ex * t - w.centre.x) * w.right.x + (room.eye.z + ez * t - w.centre.z) * w.right.z;
        if (t > 0 && t < bt && Math.abs(x) <= w.width / 2 + 0.01) { bt = t; best = i; bx = x; } });
      if (best >= 0) _obst.push({ wall: best, x: bx, half: 0.35, y0: 0, y1: 3, kind: 'lamp' });
    }
    return _obst;
  }
  return { object, update, setParams, dispose, captureEnv, setFires, spots, textObstacles };
}
