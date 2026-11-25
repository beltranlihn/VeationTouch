// Ressonància — festa3d › «camps» (T-068): la ressonància as a membrane of fine threads. Spec: lab/estudio/ARTE-RESSONANCIA.md.
//
// Lines only (no surfaces, particles or metal), constant width on screen (fwidth antialias), on an ink-blue night of its own:
//   plane 0     (at the wall)   the hands' isolines, 6 → 9 rings a hand at r = 8, 14, 22, 32, 44, 58, 74, 92, 112 cm (r_k = k²+5k+8),
//               breathing ±8 % at 0.25 Hz (0.3 s later ring by ring). Field Φ = Σ (w/r)^1.5, ρ = Φ^(−2/3): one hand alone has exact
//               circles (ρ = r/w: on release w springs to 0 with one bounce and the rings fold into the node); two hands' 58 cm rings
//               join at ~1.8 m (74 cm ones at 2.35 m); a group is ringed as a whole. 1.5 m off the nearest body the rings fade to 40 %.
//               Gold only where two hands' fields are equal and both near (the bridge). Nodes (Ø 3 cm dot + 6 cm cross); the echo's
//               dashed cobalt rings (4/4 px); the bloom's gold cell edges (2 px).
//   membrane    (0.6 m behind)  the room's 12 cm grid: each body pushes it aside as a lens (≤ 10 cm in plane, 0.6 s behind a moving
//               hand) and sinks it (≤ 0.5 m, real geometry along the wall's normal, σ 0.45 m); R: 13 → 27 % (below isolines and field
//               lines), crooked (±3 cm) → straight, gold on R × 40 % of the crossings inside the field; the call's fronts run along it
//               (2 px, 60 %); at the bloom it tenses (no lens, no noise) and fades to 5 % under the cells (one per hand + hashed seeds,
//               ~28 a wall: gold 2 px edges at the wall; grid, isolines and field lines ≤ 10 %).
//   background  (3 m behind)    a 25 cm grid at half the deformation, cooler and fainter.
//   arcs        the field lines: each hand to its nearest hand within 2.5 m (a chain, not a web), 12 circular arcs a pair (the
//               exact field lines of a 2D ± pair), dipping 0.8 m into the depth between the two nodes (native 1 px lines, cobalt).
//   ghosts      nobody for 3 s: 2 bodies a wall drift at 0.2 m/s with rings at 25 % (an invitation); gone as soon as a hand lands.
//   backdrop    #0A0F1E above → #131A33 below (→ #1B2444 in the bloom), a radial copy of the walls 12 m away.
// Depth reads by perspective (the sink and the arcs move along each wall's normal), by attenuation (−25 % a metre, cooling to #B9C2DC)
// and by parallax: each deep plane draws its threads in its own true-metre coordinates shifted by a virtual viewpoint that follows the
// people on that wall (and drifts slowly when nobody is there), so the planes slide past each other as people walk.
// All in perimeter coordinates (s round the room, periodic: continuous over P3 → P4); field quantities in the wall's coordinates, the
// threads in each plane's own; everything is evaluated per pixel from uniform arrays (≤ 16 hands, 8 echo bodies, 8 ghosts, 4 fronts).
// Interaction contract: input.state.resonance (R, eased 1.2 s) · 'bloom' (event: crystallise 0–0.8 s, hold, relax the last 0.8 s of
//   max(4, min(8, state.bloomDur)) s; the ink lifts to #1B2444) · state.fronts (the echo: each front = two bodies leaving the touched
//   point both ways round, meeting at the far wall after `travel` s — solo: right round and home; on arrival the grid there gives way
//   half as much as for a hand) · state.call (tok-tok-TOK: three straight fronts at 3 m/s from the group's centre; the first two cover
//   that wall, the TOK the room) · arrive / leave (threads draw in / thin out by 0.5 m tiles; gone by leave 0.35) · hands → fx
//   ('wire' hit on landing). Study stand-ins: params.resonance / bloomNow / echo / call, the score's own R rule.
// Cost: 4 full-wall planes (backdrop, background, membrane, plane 0) + ~7 k line segments; no render targets, no compute; nothing
//   allocated per frame (Voronoi only while the bloom runs).
const MAXB = 16, MAXE = 8, MAXG = 8, MAXC = 4, MAXP = 12, ARCS = 12, SEG = 24;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
const lin = (hex) => [0, 2, 4].map((i) => { const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

export function createCamps({ THREE, TSL, room, params, fx }) {
  const P = params || {};
  const num = (k, d) => { const v = Number(P[k]); return Number.isFinite(v) ? v : d; };
  const { Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, int, If, Loop, sin, cos, exp, mix, clamp, smoothstep,
    max, min, abs, sqrt, floor, fract, pow, dot, length, fwidth, atan, step, Discard, cameraWorldMatrix } = TSL;
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const HG = Math.max(...walls.map((w) => w.height));
  const dW = walls.map((w) => Math.max(1, -new THREE.Vector3().subVectors(w.pa, eye).dot(w.normal)));
  const dMean = dW.reduce((a, b) => a + b, 0) / NW;
  const EY = eye.y;

  const object = new THREE.Group(); object.name = 'festa3d:camps';

  // ------------------------------------------------------------------ colours (linear)
  const BONE = vec3(...lin('#F2EBDD')), BONEC = vec3(...lin('#B9C2DC')), COB = vec3(...lin('#5B7CFF')), GOLD = vec3(...lin('#E8B85A'));
  // T-068b: the backdrop and the gold are given in the linear values that come out of the host's ACES as the spec's sRGB (#0A0F1E,
  // #131A33, #1B2444, #E8B85A; the plain sRGB→linear values came out #000007 / #000019 / #040F32 / cream #DEC474)
  const BG_T = [0.0115, 0.01535, 0.03055], BG_B = [0.01889, 0.02493, 0.05484], BG_X = [0.0262, 0.03476, 0.07779];
  const GOLDE = vec3(0.9628, 0.3804, 0.0558);

  // ------------------------------------------------------------------ uniforms
  const U = {
    time: uniform(0), R: uniform(0), vis: uniform(0), bloomK: uniform(0), edgeA: uniform(0), beat: uniform(1), bgB: uniform(0),
    nB: uniform(0, 'int'), nE: uniform(0, 'int'), nG: uniform(0, 'int'), nC: uniform(0, 'int'), N: uniform(6), breath: uniform(1),
    idle: uniform(0), noise: uniform(1), arrive: uniform(1), leave: uniform(0), lensK: uniform(1),
  };
  const v4 = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(new THREE.Vector4()); return a; };
  const B0 = v4(MAXB), B1 = v4(MAXB), E0 = v4(MAXE), G0 = v4(MAXG), CF = v4(MAXC), OFF = v4(NW), PA = v4(MAXP), PK = v4(MAXP);
  const uB0 = uniformArray(B0, 'vec4'), uB1 = uniformArray(B1, 'vec4'), uE0 = uniformArray(E0, 'vec4'), uG0 = uniformArray(G0, 'vec4');
  const uCF = uniformArray(CF, 'vec4'), uOFF = uniformArray(OFF, 'vec4'), uPA = uniformArray(PA, 'vec4'), uPK = uniformArray(PK, 'vec4');
  // B0[i] = (s, y, isoWeight, nodeAlpha) — the hand as it is now (rings, node)
  // B1[i] = (lagS, lagY, lens (spring: overshoots below 0 on release), sink) — the deformation, 0.6 s behind a moving hand
  // E0[i] = (s, y, ringWeight, lens) — echo bodies (dashed rings; lens only on arrival) · G0[i] = (s, y, weight, 0) — idle ghosts
  // CF[i] = (s0, run (m), maxRun, alpha) — the call's straight fronts · OFF[w] = (membrane Δs, Δy, background Δs, Δy) — parallax
  // PA[p] = (sA, yA, sB (unwrapped), yB), PK[p] = (alpha, 0, 0, 0) — field-line pairs

  // ------------------------------------------------------------------ helpers (TSL)
  const wrapd = (d) => d.sub(floor(d.div(PER).add(0.5)).mul(PER));
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  // a thread of `wpx` px on the iso-level of coordinate c at spacing h (coverage, constant on screen; fades before it would moiré)
  const lineH = (c, h, wpx) => {
    const f = c.div(h), d = abs(fract(f.add(0.5)).sub(0.5)), fw = fwidth(f).max(1e-5);
    return clamp(float(wpx).mul(0.5).add(0.5).sub(d.div(fw)), 0, 1).mul(min(float(wpx), 1)).mul(smoothstep(0.32, 0.18, fw));
  };
  const lineAt = (d, fw, wpx) => clamp(float(wpx).mul(0.5).add(0.5).sub(abs(d).div(fw.max(1e-6))), 0, 1).mul(min(float(wpx), 1));
  // the quiet zones at each wall's centre (director's rule): text ±1.6 m × 1.75–2.2 m, button ±0.9 m × 0.9–1.6 m, soft 0.2 m
  const box = (dx, y, hx, y0, y1, soft = 0.2) => smoothstep(soft, 0.0, max(abs(dx).sub(hx), max(y.sub(y1), float(y0).sub(y))).max(0));
  const qText = (dx, y, soft) => box(dx, y, 1.6, 1.75, 2.2, soft), qBtn = (dx, y, soft) => box(dx, y, 0.9, 0.9, 1.6, soft);
  // ring index k for a «radius» ρ (m): r_k = k² + 5k + 8 cm  →  8, 14, 22, 32, 44, 58, 74, 92, 112
  const kOf = (rho) => sqrt(rho.mul(400).sub(7).max(0)).sub(5).mul(0.5);
  const EPS2 = 0.0004;                                               // (2 cm)²: the potential's core
  // arrival / leaving: the threads draw in and thin out block by block (0.5 m tiles: the work's signature, quietly)
  const reveal = (p) => {
    const h = hash12(floor(p.div(0.5)).add(vec2(3.1, 7.7)));
    return smoothstep(h.mul(0.7), h.mul(0.7).add(0.3), U.arrive).mul(float(1).sub(smoothstep(h.mul(0.6), h.mul(0.6).add(0.4), U.leave))).mul(U.vis);
  };

  // ------------------------------------------------------------------ the lens (in plane) and the field Φ of the hands at seen point p
  const lensOf = (p, k) => {                                         // displacement (m) of the threads at p: away from every body
    const D = vec2(0).toVar();
    const add = (c, a) => {
      const d = vec2(wrapd(p.x.sub(c.x)), p.y.sub(c.y)), r2 = dot(d, d).add(1e-6), r = sqrt(r2);
      // f(r) = (r/σ)·e^{(1 − r²/σ²)/2}: 0 at the body, 1 at σ = 0.45 m, gone by ~1.5 m
      D.addAssign(d.div(r).mul(r.div(0.45).mul(exp(float(0.5).sub(r2.div(0.405))))).mul(a));
    };
    Loop(U.nB, ({ i }) => { const b = uB1.element(i); add(b.xy, b.z.mul(0.10)); });
    Loop(U.nE, ({ i }) => { const e = uE0.element(i); add(e.xy, e.w.mul(0.10)); });
    Loop(U.nG, ({ i }) => { const g = uG0.element(i); add(g.xy, g.z.mul(0.035)); });
    return D.mul(k).mul(U.lensK);
  };
  // the Voronoi of the bloom at p: (edge distance (m), F1 (m)) and the vector from p to the nearest seed
  const NCX = Math.max(8, Math.round(PER / 0.95)), NCY = Math.max(2, Math.round(HG / 0.95)), CX = PER / NCX, CY = HG / NCY;
  const voronoi = (p) => {
    const fa = float(1e9).toVar(), fb = float(1e9).toVar(), va = vec2(0).toVar(), vb = vec2(0).toVar();
    const take = (v) => {
      const f = dot(v, v);
      If(f.lessThan(fa), () => { fb.assign(fa); vb.assign(va); fa.assign(f); va.assign(v); }).ElseIf(f.lessThan(fb), () => { fb.assign(f); vb.assign(v); });
    };
    const ci = floor(p.x.div(CX)), cj = floor(p.y.div(CY));
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ii = ci.add(di), jj = cj.add(dj), iw = ii.sub(floor(ii.div(NCX)).mul(NCX));
      const h1 = hash12(vec2(iw, jj).add(0.37)), h2 = hash12(vec2(iw, jj).add(vec2(17.1, 3.3)));
      const sd = vec2(iw.add(h1.mul(0.7).add(0.15)).mul(CX), jj.add(h2.mul(0.7).add(0.15)).mul(CY));
      take(vec2(wrapd(sd.x.sub(p.x)), sd.y.sub(p.y)));
    }
    Loop(U.nB, ({ i }) => { const b = uB0.element(i); If(b.w.greaterThan(0.5), () => { take(vec2(wrapd(b.x.sub(p.x)), b.y.sub(p.y))); }); });
    const e = dot(vb, vb).sub(dot(va, va)).div(length(vb.sub(va)).mul(2).max(1e-4));
    return { e, f1: sqrt(fa), va };
  };

  // ------------------------------------------------------------------ geometry: radial copies of the walls (one grid per wall)
  const _v = new THREE.Vector3();
  function planeGeo(depth, nx, ny) {
    const pos = [], sy = [], aw = [], idx = [];
    walls.forEach((w, wi) => {
      const K = (dW[wi] + depth) / dW[wi], o = pos.length / 3;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny;
        room.wallPoint(wi, u, v, _v); _v.sub(eye).multiplyScalar(K).add(eye);
        pos.push(_v.x, _v.y, _v.z); sy.push(cum[wi] + u * w.width, v * w.height); aw.push(wi, cum[wi] + w.width / 2, Math.min(u, 1 - u) * w.width);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = o + j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(sy, 2));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 3)); g.setIndex(idx);
    return g;
  }
  const mkMat = (blend) => new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: blend ?? THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ownWall = (n) => { If(dot(cameraWorldMatrix.element(2).xyz, n).lessThan(0.999), () => { Discard(); }); };
  const NRM = walls.map((w) => w.normal.clone());
  const nrmOf = (wi) => { const n = vec3(0).toVar(); for (let w = 0; w < NW; w++) If(wi.equal(w), () => { n.assign(vec3(NRM[w].x, NRM[w].y, NRM[w].z)); }); return n; };
  const meshes = [];
  const addMesh = (g, m, order) => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = order; object.add(me); meshes.push(me); return me; };

  // ---- the backdrop (ink blue), 12 m away
  {
    const m = mkMat(THREE.NormalBlending);
    const q = varying(attribute('aS', 'vec2')), wv = varying(attribute('aW', 'vec3'));
    m.colorNode = Fn(() => {
      const t = clamp(q.y.div(HG), 0, 1);
      const c = mix(vec3(...BG_B), vec3(...BG_T), smoothstep(0, 1, t));
      return mix(c, vec3(...BG_X), U.bgB);
    })();
    m.opacityNode = U.vis.mul(float(1).sub(smoothstep(0.35, 1.0, U.leave)));
    m.fog = false;
    void wv;
    addMesh(planeGeo(12, 1, 1), m, -5);
  }

  // ---- the background grid (3 m): 25 cm in its own metres, half the deformation, cool and faint
  const DB = 3.0, KB = (dMean + DB) / dMean, HB = 0.25, HBX = (PER * KB) / Math.round((PER * KB) / HB);
  {
    const m = mkMat();
    const q = varying(attribute('aS', 'vec2')), wv = varying(attribute('aW', 'vec3'));
    m.colorNode = Fn(() => {
      const wi = int(wv.x); ownWall(nrmOf(wi));
      const p = q, o = uOFF.element(wi);
      const nz = vec2(sin(p.y.mul(2.3).add(sin(p.x.mul(2 * Math.PI * Math.round(PER / 2.1) / PER).add(U.time.mul(0.13))).mul(1.4)).add(U.time.mul(0.09))),
        sin(p.x.mul(2 * Math.PI * Math.round(PER / 2.9) / PER).add(sin(p.y.mul(1.7).add(U.time.mul(0.11))).mul(1.2)))).mul(0.03).mul(U.noise);
      const w = p.sub(lensOf(p, 0.5)).add(nz).sub(o.zw);
      const mm = vec2(w.x.mul(KB), w.y.sub(EY).mul(KB).add(EY));
      const L = max(lineH(mm.x, HBX, 1), lineH(mm.y, HB, 1));
      const qa = mix(float(1), float(0.4), max(qText(wv.y.negate().add(p.x), p.y), qBtn(wv.y.negate().add(p.x), p.y)));
      const a = L.mul(mix(0.05, 0.08, U.R)).mul(float(1).sub(U.bloomK.mul(0.6))).mul(qa).mul(reveal(p)).mul(U.beat);
      return vec4(mix(BONEC, BONE, 0.15).mul(a), 1);
    })();
    m.fog = false;
    addMesh(planeGeo(DB, 1, 1), m, 1);
  }

  // ---- the membrane (0.6 m, sinking to 1.1 m under each body): the room's grid
  const DM = 0.6, KM = (dMean + DM) / dMean, HM = 0.12, HMX = (PER * KM) / Math.round((PER * KM) / HM);
  {
    const m = mkMat();
    const aS = attribute('aS', 'vec2'), aW = attribute('aW', 'vec3');
    const sinkAt = (p, edge) => {
      const z = float(0).toVar();
      Loop(U.nB, ({ i }) => { const b = uB1.element(i); const d = vec2(wrapd(p.x.sub(b.x)), p.y.sub(b.y)); z.addAssign(b.w.mul(exp(dot(d, d).negate().div(0.405)))); });
      Loop(U.nE, ({ i }) => { const e = uE0.element(i); const d = vec2(wrapd(p.x.sub(e.x)), p.y.sub(e.y)); z.addAssign(e.w.mul(0.5).mul(exp(dot(d, d).negate().div(0.405)))); });
      return clamp(z, -0.15, 1).mul(0.5).mul(smoothstep(0.0, 0.45, edge));     // ≤ 0.5 m; flat at the corners (the two walls' normals differ)
    };
    const sinkV = sinkAt(aS, aW.z);
    m.positionNode = Fn(() => TSL.positionLocal.sub(nrmOf(int(aW.x)).mul(sinkV)))();
    const q = varying(aS), wv = varying(aW), vSink = varying(sinkV);
    m.colorNode = Fn(() => {
      const wi = int(wv.x); ownWall(nrmOf(wi));
      const p = q, o = uOFF.element(wi);
      const nz = vec2(sin(p.y.mul(3.1).add(sin(p.x.mul(2 * Math.PI * Math.round(PER / 1.7) / PER).add(U.time.mul(0.17))).mul(1.3)).add(U.time.mul(0.12))),
        sin(p.x.mul(2 * Math.PI * Math.round(PER / 2.3) / PER).add(sin(p.y.mul(2.2).add(U.time.mul(0.15))).mul(1.1)))).mul(0.03).mul(U.noise);
      const br = vec2(0, sin(U.time.mul(2 * Math.PI * 0.15).add(p.x.mul(2 * Math.PI * Math.round(PER / 6) / PER))).mul(0.01).mul(U.idle));
      const w = p.sub(lensOf(p, 1)).add(nz).add(br).toVar();
      // the bloom: the grid tenses (lens and noise go) and fades to 5 %; the cells are drawn at the wall alone (T-068b: the threads
      // crowding onto the edges read as dirty curves, the doubled edge as a dotted line)
      const ws = w.sub(o.xy);
      const mm = vec2(ws.x.mul(KM), ws.y.sub(EY).mul(KM).add(EY));
      // the call: a straight front at 3 m/s; behind it, for 0.3 s (0.9 m), the threads go to 2 px and full strength
      const hl = float(0).toVar(), fl = float(0).toVar();
      Loop(U.nC, ({ i }) => {
        const c = uCF.element(i), ad = abs(wrapd(p.x.sub(c.x))), behind = c.y.sub(ad);
        If(ad.lessThan(c.z), () => {
          hl.assign(max(hl, smoothstep(0.9, 0.0, behind).mul(step(0.0, behind)).mul(c.w).mul(float(1).sub(U.bloomK))));
          fl.assign(max(fl, lineAt(behind, fwidth(p.x), 1).mul(c.w).mul(float(1).sub(U.bloomK))));
        });
      });
      const wpx = hl.add(1);
      const Lx = lineH(mm.x, HMX, wpx), Ly = lineH(mm.y, HM, wpx), L = max(Lx, Ly);
      // T-068b: below the isolines and the field lines — on screen ≈ 30 % at mid R, ≤ 45 % at R = 1; bloom 5 %; quiet zones ≤ 8 %
      const dx = p.x.sub(wv.y), quiet = max(qText(dx, p.y), qBtn(dx, p.y));
      const base = mix(mix(0.13, 0.27, U.R), 0.05, U.bloomK), aG = mix(base, min(base, 0.08), quiet);
      const a = mix(aG, 0.6, hl);
      // gold: R × 40 % of the crossings inside the field (where a hand's rings are)
      let rho;
      {
        const phi = float(1e-6).toVar();
        Loop(U.nB, ({ i }) => { const b = uB0.element(i); const d = vec2(wrapd(p.x.sub(b.x)), p.y.sub(b.y)); phi.addAssign(pow(b.z, 1.5).mul(pow(dot(d, d).add(EPS2), -0.75))); });
        rho = pow(phi, -2 / 3);
      }
      const cell = floor(vec2(mm.x.div(HMX), mm.y.div(HM)).add(0.5));
      const inF = smoothstep(1.3, 0.9, rho);
      const goldX = step(hash12(cell.add(5.5)), U.R.mul(0.4)).mul(inF).mul(Lx.mul(Ly));
      const depth = vSink.add(DM), att = float(1).sub(depth.mul(0.25)).max(0.3);
      const col = mix(mix(BONE, BONEC, depth.mul(0.6).min(1)), GOLD, goldX).mul(L.mul(a).mul(att)).add(BONE.mul(fl.mul(0.5)));
      return vec4(col.mul(reveal(p)).mul(U.beat), 1);
    })();
    m.fog = false;
    // the membrane's real geometry: ~10 cm cells (the sink is a vertex displacement)
    const pos = [], sy = [], aw = [], idx = [];
    walls.forEach((w, wi) => {
      const K = (dW[wi] + DM) / dW[wi], o = pos.length / 3, NX = Math.max(8, Math.round(w.width / 0.1)), NY = Math.max(8, Math.round(w.height / 0.1));
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NY;
        room.wallPoint(wi, u, v, _v); _v.sub(eye).multiplyScalar(K).add(eye);
        pos.push(_v.x, _v.y, _v.z); sy.push(cum[wi] + u * w.width, v * w.height); aw.push(wi, cum[wi] + w.width / 2, Math.min(u, 1 - u) * w.width);
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = o + j * (NX + 1) + i; idx.push(a, a + 1, a + NX + 2, a, a + NX + 2, a + NX + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(sy, 2));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 3)); g.setIndex(idx);
    addMesh(g, m, 2);
  }

  // ---- plane 0 (at the wall): isolines, nodes, the echo, the bloom's edges
  {
    const m = mkMat();
    const q = varying(attribute('aS', 'vec2')), wv = varying(attribute('aW', 'vec3'));
    m.colorNode = Fn(() => {
      const wi = int(wv.x); ownWall(nrmOf(wi));
      const p = q, px = fwidth(p.x).max(1e-5);
      // the hands' field (and the idle ghosts'): Φ = Σ w·(r² + ε²)^−0.4 → ρ = the radius one hand alone would need for it
      const phi = float(1e-6).toVar(), phA = float(0).toVar(), g1 = float(0).toVar(), g2 = float(0).toVar(), node = float(0).toVar(), rn = float(1e-30).toVar();
      Loop(U.nB, ({ i }) => {
        const b = uB0.element(i), d = vec2(wrapd(p.x.sub(b.x)), p.y.sub(b.y)), r2 = dot(d, d), r = sqrt(r2), g = pow(b.z, 1.5).mul(pow(r2.add(EPS2), -0.75));
        phi.addAssign(g); phA.addAssign(g); rn.addAssign(exp(r.div(b.z).div(-0.05)));
        If(g.greaterThan(g1), () => { g2.assign(g1); g1.assign(g); }).ElseIf(g.greaterThan(g2), () => { g2.assign(g); });
        // the node: Ø 3 cm dot + a 6 cm cross, bone
        const dotA = clamp(float(0.015).sub(r).div(px).add(0.5), 0, 1);
        const crs = max(lineAt(d.x, px, 1).mul(step(abs(d.y), 0.03)), lineAt(d.y, px, 1).mul(step(abs(d.x), 0.03)));
        node.assign(max(node, max(dotA, crs).mul(b.w)));
      });
      Loop(U.nG, ({ i }) => { const g0 = uG0.element(i), d = vec2(wrapd(p.x.sub(g0.x)), p.y.sub(g0.y)), r = sqrt(dot(d, d)), g = pow(g0.z, 1.5).mul(pow(dot(d, d).add(EPS2), -0.75)); phi.addAssign(g); phA.addAssign(g.mul(0.25)); rn.addAssign(exp(r.div(g0.z.max(1e-3)).div(-0.05))); });
      rn.assign(TSL.log(rn).mul(-0.05));                               // a soft minimum of r/w (no crease between two hands)
      // Φ = Σ (w/r)^1.5 → ρ = Φ^(−2/3) (one hand: ρ = r/w; two hands' 58 cm rings join at 1.8 m, the 74 cm ones at 2.35 m; a group of 6 is
      // ringed at ~3.3 × its rings, not 6 ×) and the inner rings stay the hand's own circles
      // (T-068b: no blend with r/w any more — it made small closed islands between hands; at p = 1.5 the inner rings barely move)
      const rho = pow(phi, -2 / 3);
      const k0 = kOf(rho);
      const rb = rho.div(sin(U.time.mul(2 * Math.PI * 0.25).sub(k0.mul(2 * Math.PI * 0.25 * 0.3))).mul(0.08).mul(U.breath).add(1));
      const kk = kOf(rb), n = floor(kk.add(0.5));
      const iso = lineAt(kk.sub(n), fwidth(kk), 1.0).mul(step(0, n)).mul(clamp(U.N.sub(n), 0, 1)).mul(step(0.012, rb))
        .mul(mix(float(1), float(0.4), smoothstep(1.5, 2.1, rn)));   // 1.5 m off the nearest body the outer rings fade to 40 %
      const al = phA.div(phi);                                         // ghosts' rings at 25 %
      const gold = smoothstep(0.45, 0.95, g2.div(g1.max(1e-6))).mul(smoothstep(0.3, 1.0, g2));   // bone → gold → bone along the neck (~0.5 m) where two hands' fields meet
      const dx = p.x.sub(wv.y), qt = qText(dx, p.y, 0.3), qb = qBtn(dx, p.y, 0.3);
      const qIso = float(1).sub(qt).mul(mix(float(1), mix(float(0), float(0.6), smoothstep(0.3, 0.9, al)), qb));   // text: none · button: hands 60 %, ghosts none · 0.3 m fades
      let col = mix(BONE, GOLDE, gold).mul(iso.mul(0.85).mul(al).mul(qIso).mul(float(1).sub(U.bloomK.mul(0.9))));
      col = col.add(BONE.mul(node.mul(0.95)));
      // the echo: dashed cobalt rings (4 / 4 px) round each travelling body, 4 rings
      If(U.nE.greaterThan(0), () => {
        const pe = float(1e-6).toVar(), nr = float(1e9).toVar(), nv = vec2(0).toVar();
        Loop(U.nE, ({ i }) => { const e = uE0.element(i), d = vec2(wrapd(p.x.sub(e.x)), p.y.sub(e.y)), r2 = dot(d, d); pe.addAssign(pow(e.z, 1.5).mul(pow(r2.add(EPS2), -0.75))); If(r2.lessThan(nr), () => { nr.assign(r2); nv.assign(d); }); });
        const re = pow(pe, -2 / 3), ke = kOf(re), ne = floor(ke.add(0.5));
        const dash = step(0.5, fract(atan(nv.y, nv.x).mul(sqrt(nr)).div(px.mul(8))));
        const ring = lineAt(ke.sub(ne), fwidth(ke), 1.5).mul(step(0, ne)).mul(step(ne, 3.5)).mul(dash).mul(float(1).sub(qt));
        col.addAssign(COB.mul(ring.mul(0.75).mul(float(1).sub(U.bloomK.mul(0.9)))));
      });
      // the bloom: gold cell edges, 2 px
      If(U.bloomK.greaterThan(0.001), () => { const V = voronoi(p); col.addAssign(GOLDE.mul(lineAt(V.e, fwidth(V.e), 1.4).mul(U.edgeA))); });
      return vec4(col.mul(reveal(p)).mul(U.beat), 1);
    })();
    m.fog = false;
    addMesh(planeGeo(0.01, 1, 1), m, 4);
  }

  // ---- the field lines: 12 circular arcs a pair (2D ± pair: the field lines are circles through both charges), dipping 0.8 m
  {
    const N = MAXP * ARCS * SEG * 2, aP = new Float32Array(N), aZ = new Float32Array(N * 2), aU = new Float32Array(N), pos = new Float32Array(N * 3);
    const ANG = [8, 20, 33, 47, 62, 78];
    const zOf = (al, u) => {                                          // z(u) = (1 − e^{−2iαu}) / (1 − e^{−2iα}): 0 → 1 on a circular arc
      const nr = 1 - Math.cos(2 * al * u), ni = Math.sin(2 * al * u), dr = 1 - Math.cos(2 * al), di = Math.sin(2 * al), dd = dr * dr + di * di;
      return [(nr * dr + ni * di) / dd, (ni * dr - nr * di) / dd];
    };
    let n = 0;
    for (let p = 0; p < MAXP; p++) for (let a = 0; a < ARCS; a++) {
      const al = (ANG[a >> 1] * Math.PI / 180) * (a & 1 ? -1 : 1);
      for (let s = 0; s < SEG; s++) for (const u of [s / SEG, (s + 1) / SEG]) { const z = zOf(al, u); aP[n] = p; aZ[n * 2] = z[0]; aZ[n * 2 + 1] = z[1]; aU[n] = u; n++; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(aP, 1));
    g.setAttribute('aZ', new THREE.BufferAttribute(aZ, 2)); g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    const m = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const ip = int(attribute('aP', 'float')), z = attribute('aZ', 'vec2'), u = attribute('aU', 'float');
    const A = uPA.element(ip), K = uPK.element(ip);
    const dd = vec2(A.z.sub(A.x), A.w.sub(A.y));
    const s0 = A.x.add(dd.x.mul(z.x)).sub(dd.y.mul(z.y)), y0 = A.y.add(dd.x.mul(z.y)).add(dd.y.mul(z.x));
    const dep = sin(u.mul(Math.PI)).mul(0.8).mul(smoothstep(0.3, 1.2, length(dd)));
    m.positionNode = Fn(() => {
      const s = s0.sub(floor(s0.div(PER)).mul(PER)), out = vec3(0).toVar();
      for (let w = 0; w < NW; w++) {
        const W = walls[w];
        If(s.greaterThanEqual(cum[w] - 1e-4), () => {
          const t = s.sub(cum[w]);
          out.assign(vec3(t.mul(W.right.x).add(W.pa.x), y0, t.mul(W.right.z).add(W.pa.z)).sub(vec3(W.normal.x, W.normal.y, W.normal.z).mul(dep)));
        });
      }
      return out;
    })();
    const va = varying(K.x.mul(float(1).sub(dep.mul(0.25))));
    m.colorNode = COB.mul(0.5);
    m.opacityNode = va.mul(U.vis).mul(float(1).sub(U.bloomK.mul(0.92))).mul(float(1).sub(smoothstep(0.0, 0.35, U.leave)));
    m.fog = false;
    const lines = new THREE.LineSegments(g, m); lines.frustumCulled = false; lines.renderOrder = 3; object.add(lines); meshes.push(lines);
  }

  // ------------------------------------------------------------------ CPU state (preallocated)
  const slot = []; for (let i = 0; i < MAXB; i++) slot.push({ stroke: null, alive: false, s: 0, y: 0, ls: 0, ly: 0, env: 0, vel: 0, rel: 0, wall: 0, u: 0 });
  const nn = new Int32Array(MAXB), pairA = new Float32Array(MAXB * MAXB), pick = new Int32Array(MAXP * 2), pickA = new Float32Array(MAXP);
  const echo = []; for (let i = 0; i < 4; i++) echo.push({ id: -1, s0: 0, y0: 1.25, D: 0, u: 0, a: 0, ghost: false });
  const arrivals = []; for (let i = 0; i < 4; i++) arrivals.push({ s: 0, y: 1.25, t: 99 }); let arrI = 0;
  const fr = []; for (let i = 0; i < MAXC; i++) fr.push({ on: false, s0: 0, t0: 0, max: 0 }); let frI = 0;
  const V = new Float32Array(NW * 2), lastDown = []; for (let i = 0; i < 8; i++) lastDown.push({ wall: -1, u: 0.5, y: 1.25, t: -9 }); let ldI = 0;
  const frontS = new Map(), frontU = new Map();
  let lastAliveT = -9, time = 0, Rs = 0, Rown = 0, cluster = 0, clusterAt = -9, bloomT = -1, bloomD = 4, idleK = 1, lastClock = -1, callS0 = -1, lastBloomP = false, lastCallN = -1;
  const recT = new Float32Array(8); let recI = 0;
  const wrap = (d) => d - Math.floor(d / PER + 0.5) * PER;
  const wrapS = (s) => ((s % PER) + PER) % PER;
  const sOf = (h) => cum[h.wall] + h.u * walls[h.wall].width, yOf = (h) => h.v * walls[h.wall].height;
  function handCentre() {
    let cx = 0, cy = 0, n = 0;
    for (const o of slot) if (o.alive) { const a = o.s / PER * 2 * Math.PI; cx += Math.cos(a); cy += Math.sin(a); n++; }
    if (!n || Math.hypot(cx, cy) < 1e-3) return cum[0] + walls[0].width / 2;
    return wrapS((Math.atan2(cy, cx) / (2 * Math.PI)) * PER);
  }
  function frontS0(f, input) {
    let s0 = frontS.get(f.id);
    if (s0 !== undefined) return s0;
    const wf = f.from % NW; let bu = -1, by = 1.25, bt = -9;
    if (!f.ghost) {
      for (const o of lastDown) if (o.wall === wf && time - o.t <= 0.6 && o.t > bt) { bt = o.t; bu = o.u; by = o.y; }
      if (bu < 0) { let bd = 1e9; for (const h of input.hands || []) if (h.wall === wf) { const d = Math.abs(h.u - 0.5); if (d < bd) { bd = d; bu = h.u; by = h.v * walls[wf].height; } } }
    }
    s0 = cum[wf] + (bu >= 0 ? bu : 0.5) * walls[wf].width;
    if (frontS.size > 24) frontS.clear();
    frontS.set(f.id, s0); frontS.set(-f.id - 1, by);
    return s0;
  }
  function triggerBloom(st) { if (bloomT < 0 || bloomT > bloomD - 0.8) { bloomT = 0; bloomD = st && st.bloomDur >= 4 ? Math.min(8, st.bloomDur) : 4; } }

  function update(dt, input, vis) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20); time += dt;
    const st = input.state, ev = input.events, hands = input.hands || [], downs = input.downs || [];
    const arrive = st ? (input.arrive ?? 1) : num('arrive', 1), leave = st ? (input.leave ?? 0) : num('leave', 0);
    // ---- hands → bodies (slots keyed by stroke): immediate on landing, a damped spring (one bounce) on release, the lens lags 0.3 s
    for (const o of slot) o.alive = false;
    for (const h of hands) {
      if (h.ended) continue;
      let k = -1; for (let i = 0; i < MAXB; i++) if (slot[i].stroke === h.stroke) { k = i; break; }
      if (k < 0) { for (let i = 0; i < MAXB; i++) if (slot[i].stroke == null) { k = i; break; } if (k < 0) continue; const o = slot[k]; o.stroke = h.stroke; o.s = o.ls = sOf(h); o.y = o.ly = yOf(h); o.env = 0; o.vel = 0; for (let j = 0; j < MAXB; j++) { pairA[k * MAXB + j] = 0; pairA[j * MAXB + k] = 0; } }
      const o = slot[k];
      o.alive = true; o.s = sOf(h); o.y = yOf(h); o.rel = 0; o.wall = h.wall; o.u = h.u;
    }
    const kl = 1 - Math.exp(-dt / 0.3), W0 = 2 * Math.PI / 0.95, Z = 0.32;
    let nAlive = 0;
    for (const o of slot) {
      if (o.stroke == null) continue;
      if (o.alive) { nAlive++; o.env += (1 - o.env) * (1 - Math.exp(-dt / 0.035)); o.vel = 0; }
      else { o.rel += dt; o.vel += (-W0 * W0 * o.env - 2 * Z * W0 * o.vel) * dt; o.env += o.vel * dt; if (o.rel > 1.6 && Math.abs(o.env) < 0.01) { o.stroke = null; o.env = 0; } }
      o.ls += wrap(o.s - o.ls) * kl; o.ly += (o.y - o.ly) * kl;
    }
    for (const d of downs) {
      const L = lastDown[ldI++ % 8]; L.wall = d.wall; L.u = d.u ?? 0.5; L.y = yOf(d); L.t = time;
      let together = 0; for (let i = 0; i < 8; i++) { const a = time - recT[i]; if (a < 0.5) together += 1 - a / 0.5; }
      recT[recI] = time; recI = (recI + 1) % 8;
      fx?.(d.wall, d.u ?? 0.5, 0.45 + 0.15 * Math.min(3, together), 'wire', 'hit');
    }
    // ---- R: the score's (the work), or the study's stand-in with the score's own rule
    let Rin;
    if (st) Rin = st.resonance || 0;
    else {
      if (downs.length) { if (time - clusterAt <= 0.5) cluster += downs.length; else { clusterAt = time; cluster = downs.length; } const people = Math.max(2, Math.ceil(hands.length / 1.6)); Rown += cluster >= 2 ? (0.2 * downs.length) / people : 0.01; }
      Rown = Math.min(1.2, Math.max(0, Rown + dt * (0.004 * Math.min(12, hands.length) - 0.03)));
      if (Rown >= 1 && bloomT < 0) { triggerBloom(null); Rown = 0.3; }
      Rin = Rown;
    }
    const R = clamp01(Rin + num('resonance', 0));
    Rs += (R - Rs) * (1 - Math.exp(-dt / 1.2));
    // ---- the bloom
    if (ev) for (let i = 0; i < ev.length; i++) if (ev[i] === 'bloom') triggerBloom(st);
    if (P.bloomNow === true && !lastBloomP) triggerBloom(null);
    lastBloomP = P.bloomNow === true;
    let bK = 0, hold = 0;
    if (bloomT >= 0) {
      bloomT += dt;
      bK = ss(0, 0.8, bloomT) * (1 - ss(bloomD - 0.8, bloomD, bloomT)); hold = ss(0.6, 0.8, bloomT) * (1 - ss(bloomD - 0.8, bloomD - 0.6, bloomT));
      if (bloomT > bloomD) bloomT = -1;
    }
    // ---- ghosts (nobody there: 2 a wall drift at 0.2 m/s and invite)
    if (nAlive) lastAliveT = time;
    idleK += ((time - lastAliveT > 3 ? 1 : 0) - idleK) * (1 - Math.exp(-dt / (nAlive ? 0.6 : 2.0)));
    let nG = 0;
    if (idleK > 0.05) for (let w = 0; w < NW && nG < MAXG; w++) for (let j = 0; j < 2 && nG < MAXG; j++) {
      const ph = w * 1.7 + j * 3.1, A = walls[w].width * 0.3;
      G0[nG++].set(cum[w] + walls[w].width / 2 + A * Math.sin(time * 0.2 / A + ph), 1.3 + 0.45 * Math.sin(time * 0.07 + ph * 1.3), idleK * (1 - bK), 0);
    }
    // ---- the echo: each front of the score = two bodies leaving the touched point both ways round, meeting at the far wall after
    //      travel s (solo: right round, back home); on arrival the grid there deforms half as much as for a hand
    let nE = 0;
    {
      let k = 0;
      if (st && st.block === 'festa' && st.fronts) {
        const F = st.fronts;
        for (let i = F.length - 1; i >= 0 && k < 4; i--) {
          const f = F[i], u = ((st.clock ?? 0) - f.at) / Math.max(0.1, f.arrive - f.at), s0 = frontS0(f, input), y0 = frontS.get(-f.id - 1) ?? 1.25;
          const E = echo[k++]; E.s0 = s0; E.y0 = y0; E.D = f.to === f.from ? PER / 2 : PER / 2; E.u = u; E.a = (f.ghost ? 0.6 : 1); E.ghost = !!f.ghost;
          const pu = frontU.get(f.id) ?? -1; frontU.set(f.id, u); if (frontU.size > 24) frontU.clear();
          if (pu < 1 && u >= 1) { const A = arrivals[arrI++ % 4]; A.s = wrapS(s0 + PER / 2); A.y = 1.25; A.t = 0; }
        }
      } else if (!st && num('echo', 0) > 0) {
        const u = (time % 4) / 3, E = echo[k++]; E.s0 = cum[1 % NW] + walls[1 % NW].width / 2; E.y0 = 1.25; E.D = PER / 2; E.u = u; E.a = 1;
        if (u >= 1 && u - dt / 3 < 1) { const A = arrivals[arrI++ % 4]; A.s = wrapS(E.s0 + PER / 2); A.y = 1.25; A.t = 0; }
      }
      for (let i = 0; i < k; i++) {
        const E = echo[i], u = Math.min(1, Math.max(0, E.u)), a = E.a * smoother(E.u / 0.06) * (1 - smoother((E.u - 1) / 0.12)) * (1 - bK);
        if (a < 0.01) continue;
        const y = E.y0 + (1.25 - E.y0) * smoother(u);
        if (nE < MAXE) E0[nE++].set(wrapS(E.s0 + u * E.D), y, a, 0);
        if (nE < MAXE) E0[nE++].set(wrapS(E.s0 - u * E.D), y, a, 0);
      }
      for (const A of arrivals) {
        A.t += dt; if (A.t > 1.6 || nE >= MAXE) continue;
        const e = 0.5 * Math.min(1, A.t / 0.1) * Math.exp(-A.t / 0.45) * Math.cos(A.t * 2.6);
        E0[nE++].set(A.s, A.y, 0, e);
      }
    }
    // ---- the call: tok-tok-TOK → three straight fronts at 3 m/s from the group's centre; the first two cover a wall, the third the room
    {
      let toks = null, gap = 0.8, at = 0, clock = time;
      if (st && st.block === 'festa' && st.festaStage === 'call' && st.call && st.call.n > 0) { at = st.call.at; gap = st.call.gap || 0.8; clock = st.clock ?? time; toks = true; if (st.call.n !== lastCallN) { lastCallN = st.call.n; callS0 = -1; } }
      else if (!st && num('call', 0) > 0) { const c = Math.floor(time / 4) * 4; at = c + 2.4; gap = 0.8; toks = true; }
      if (toks && lastClock >= 0) for (let kk = 0; kk < 3; kk++) {
        const T = at - (2 - kk) * gap;
        if (lastClock < T && clock >= T) {
          if (kk === 0 || callS0 < 0) callS0 = handCentre();
          const w = walls.findIndex((_, i) => callS0 >= cum[i] && callS0 < cum[i] + walls[i].width);
          const F = fr[frI++ % MAXC]; F.on = true; F.s0 = callS0; F.t0 = time; F.max = kk < 2 ? walls[Math.max(0, w)].width / 2 : PER / 2;
        }
      }
      lastClock = toks ? clock : -1;
    }
    let nC = 0;
    for (const F of fr) { if (!F.on) continue; const run = 3 * (time - F.t0); if (run > F.max + 1) { F.on = false; continue; } CF[nC++].set(F.s0, run, F.max, 1 - smoother((run - F.max) / 1)); }
    // ---- bodies → uniforms
    let nB = 0;
    for (const o of slot) {
      if (o.stroke == null) continue;
      const iso = Math.max(0, o.env) * (o.alive ? 1 : Math.max(0, 1 - o.rel / 0.6)), node = o.alive ? 1 : Math.max(0, 1 - o.rel / 0.3);
      B0[nB].set(o.s, o.y, Math.max(1e-4, iso), node);
      B1[nB].set(o.ls, o.ly, o.env * (1 - 0.5 * bK), o.env * (1 - 0.6 * bK));
      nB++;
    }
    // ---- field-line pairs: hands < 2.5 m apart; each pair eases in / out in 0.5 s; the 12 strongest drawn
    for (let i = 0; i < MAXB; i++) { nn[i] = -1; if (!slot[i].alive) continue; let bd = 2.5; for (let j = 0; j < MAXB; j++) { if (j === i || !slot[j].alive) continue; const d = Math.hypot(wrap(slot[j].s - slot[i].s), slot[j].y - slot[i].y); if (d < bd && d > 0.12) { bd = d; nn[i] = j; } } }
    for (let i = 0; i < MAXB; i++) for (let j = i + 1; j < MAXB; j++) {       // each hand to its nearest within 2.5 m: a chain, not a web
      const ix = i * MAXB + j, tgt = nn[i] === j || nn[j] === i ? 1 : 0;
      pairA[ix] += (tgt > pairA[ix] ? 1 : -1) * dt / 0.5; pairA[ix] = clamp01(pairA[ix]);
    }
    let nP = 0;
    pickA.fill(0);
    for (let i = 0; i < MAXB; i++) for (let j = i + 1; j < MAXB; j++) {
      const v = pairA[i * MAXB + j]; if (v < 0.01) continue;
      let at = -1; if (nP < MAXP) at = nP++; else { let lo = 0; for (let q = 1; q < MAXP; q++) if (pickA[q] < pickA[lo]) lo = q; if (v > pickA[lo]) at = lo; }
      if (at >= 0) { pickA[at] = v; pick[at * 2] = i; pick[at * 2 + 1] = j; }
    }
    for (let p = 0; p < MAXP; p++) {
      if (p >= nP) { PK[p].set(0, 0, 0, 0); continue; }
      const a = slot[pick[p * 2]], b = slot[pick[p * 2 + 1]];
      PA[p].set(a.s, a.y, a.s + wrap(b.s - a.s), b.y); PK[p].set(smoother(pickA[p]), 0, 0, 0);
    }
    // ---- parallax: a virtual viewpoint per wall, following the people on it (slow drift when nobody is there)
    for (let w = 0; w < NW; w++) {
      let sx = 0, sy = 0, n = 0;
      for (const o of slot) if (o.alive && o.wall === w) { sx += o.s - (cum[w] + walls[w].width / 2); sy += o.y; n++; }
      const tx = n ? Math.max(-2, Math.min(2, 0.6 * sx / n)) : 0.35 * Math.sin(time * 0.05 + w * 1.7), ty = n ? 0.4 * (sy / n - 1.4) : 0.1 * Math.sin(time * 0.037 + w);
      const k = 1 - Math.exp(-dt / 1.5);
      V[w * 2] += (tx - V[w * 2]) * k; V[w * 2 + 1] += (ty - V[w * 2 + 1]) * k;
      OFF[w].set(V[w * 2] * DM / (1.6 + DM), V[w * 2 + 1] * DM / (1.6 + DM), V[w * 2] * DB / (1.6 + DB), V[w * 2 + 1] * DB / (1.6 + DB));
    }
    // ---- look
    U.time.value = time % 2000; U.R.value = Rs; U.vis.value = vis; U.arrive.value = arrive; U.leave.value = leave;
    U.nB.value = nB; U.nE.value = nE; U.nG.value = nG; U.nC.value = nC;
    U.N.value = 6 + 3 * Rs; U.breath.value = 1 - 0.8 * bK; U.idle.value = idleK; U.noise.value = (1 - Rs) * (1 - bK);
    U.bloomK.value = bK; U.edgeA.value = ss(0.1, 0.8, bloomT < 0 ? 0 : bloomT) * (1 - ss(bloomD - 0.8, bloomD - 0.1, bloomT < 0 ? 0 : bloomT)) * (bloomT < 0 ? 0 : 1);
    U.beat.value = 1 + 0.02 * hold * Math.sin(time * 2 * Math.PI * 1.0); U.bgB.value = bK; U.lensK.value = 1 - bK;
  }

  return {
    object, update,
    get resonance() { return Rs; },
    get bloom() { return U.bloomK.value; },
    get counts() { return { bodies: U.nB.value, echo: U.nE.value, ghosts: U.nG.value, fronts: U.nC.value, pairs: PK.filter((v) => v.x > 0.01).length }; },
    get debug() { return { B0: B0.slice(0, U.nB.value).map((v) => v.toArray().map((x) => +x.toFixed(3))), E0: E0.slice(0, U.nE.value).map((v) => v.toArray().map((x) => +x.toFixed(3))) }; },   // lab checks only
    dispose() { for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); } },
  };
}
