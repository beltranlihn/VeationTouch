// Ressonància — part «festa3d»: V. L'aleta (the crown, 25 s) and la ressonància (free, ~65 s). Contract: ../PARTS.md.
//
// What it draws
//   The plate   a luminous surface standing `depth` m behind the four walls (a radial copy of the wall planes from the eye, so at rest
//               every point sits exactly behind the wall point it is seen through, and the four planes meet at the corners). Its
//               relief and its light come from a WAVE FIELD: a 2D wave equation over perimeter × height (periodic round the room,
//               reflecting at floor and top), solved on the GPU in two float render targets (ping-pong, a few sub-steps a frame,
//               CFL ≤ 0.5), as in the 2D festa.js: damping, viscosity, a faint spring, soft clip above a knee and drives that hush
//               where the plate already rings (2 people: clear rings; 15: it seethes but stays bounded).
//               Light: gold contour filigree on the levels of the local amplitude (constant line width, ≤ 6 nested lines), relief
//               glints from the slope (pearl, a touch of thin-film iridescence), a deep castell-red haze where waves have been,
//               the nodal lines when the room orders itself.
//   The sand    ~600 000 GPU particles (compute; WebGPU and WebGL2) lying on the plate: they hop where it vibrates and slide down
//               the amplitude towards the nodes, so standing figures gather the sand into Chladni lines, seen in depth (they ride
//               the relief and hop off it towards the room).
//   Shards      night fragments (dark mirror) that burst into gold on arrival; gold shards that fall on leaving.
// Hands (input.downs / input.hands, ON the wall planes → field coordinates): a landing hand kicks the field the same frame (a ring
//   of gold that runs round the room, crosses the others and interferes), a resting hand drives gently (its own frequency, locking
//   onto the room's mode as the resonance grows), a dragged hand pushes a wake.
// The hidden rule: R = input.state.resonance (the score; in the study a stand-in with the score's own rule) + params.resonance.
//   As R rises: two near-degenerate modes of the room are driven (ordered Chladni-like figures), the sand gathers on the nodes,
//   light climbs the walls, gold goes white-gold, and the image breaks into ORDERED BANDS (pixel-sorted runs, slit-scan streaks:
//   gold, pearl, rare iridescent). 'bloom' (event, or params.bloomNow: the study host already owns «bloom») → ~4.2 s of a total ordered figure, then it relaxes.
// The crown (state.block 'crown', state.t 0–25; params.crown overrides): 0–1.2 the enxaneta's point at the top of wall 0 · 1.2–5 a
//   flash of gold runs round the top of the four walls both ways and meets opposite · 4.5–13 the night breaks open into light, cell
//   by cell from the top (cracks of gold, warm white behind) · 6–19 a slow rain of gold in depth · 16–20 the held breath (the rain
//   hangs, the light holds) · 20 released: a wavefront falls from the top round the whole room, the rain settles into sand, the
//   light exhales into the resonance.
// arrive: night shards drift in from the dark, burst into gold, their particles fly onto the plate; the plate opens cell by cell.
// leave: the field freezes (0–0.15), then the sand and gold shards fall slowly like rain; the plate goes dark cell by cell.
// Read-only: part.resonance (what is shown, 0..1), part.bloom (0..1).
const MAXH = 16, MAXI = 16, MAXM = 4, MAXS = 32;
const NP_GPU = 600000, NP_GL = 300000, NSH = 2400;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function create({ THREE, TSL, room, params }) {
  const P = params || {};
  const num = (k, d) => { const v = Number(P[k]); return Number.isFinite(v) ? v : d; };
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionWorld, positionLocal, uv, texture,
    vec2, vec3, vec4, float, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, floor, fract, pow, dot, cross,
    normalize, length, select, sign, tanh, step, cameraWorldMatrix, Discard, vertexIndex, atan,
  } = TSL;
  const object = new THREE.Group(); object.name = 'festa3d';
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const GL = room.backend === 'webgl2', NP = GL ? NP_GL : NP_GPU;      // WebGL2 (the fallback) carries half the sand, a little brighter

  // ------------------------------------------------------------------ the room → the field (perimeter s × height y)
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const HG = Math.max(...walls.map((w) => w.height));
  const X0 = walls[0].width / 2;
  const CPM = 30, GH = Math.round(HG * CPM), DX = HG / GH, GW = Math.round(PER / DX);
  const TX = 1 / GW, TY = 1 / GH;
  const dW = walls.map((w) => Math.max(1, -new THREE.Vector3().subVectors(w.pa, eye).dot(w.normal)));
  const pxM = walls[0].height / walls[0].rect.h;
  let depth = num('depth', 1.1);
  const K = dW.map((d) => (d + depth) / d);                         // radial scale wall → plate (fixed at creation)

  // ------------------------------------------------------------------ uniforms
  const U = {
    time: uniform(0), dt: uniform(0), frame: uniform(0), c2: uniform(1), gam: uniform(0.7), clip: uniform(0.6), tau: uniform(0),
    ceil: uniform(2.6), kick: uniform(0), eavg: uniform(0.02), wake: uniform(260), visc: uniform(7), modeCap: uniform(0.1),
    nH: uniform(0, 'int'), nI: uniform(0, 'int'), nM: uniform(0, 'int'), lineY: uniform(3), lineK: uniform(0), iw: uniform(0.03), still: uniform(0.7), derA: uniform(1), rmsK: uniform(0),
    // look
    gain: uniform(1), Ve: uniform(0), bloom: uniform(0), stepL: uniform(0.02), lineW: uniform(0.0065), sand: uniform(0), bandK: uniform(0),
    relief: uniform(0.35), haze: uniform(0.5), nHU: uniform(0, 'int'),
    // crown
    front: uniform(0), head: uniform(0), flash: uniform(0), ring: uniform(0), open: uniform(0), swell: uniform(0), crownOn: uniform(0), cells: uniform(1), solo: uniform(1),
    peakS0: uniform(0), peakFront: uniform(0), peakEnv: uniform(0), peakOpen: uniform(0), duck: uniform(1), washY: uniform(-1), washK: uniform(0), fill: uniform(0),
    rain: uniform(0), hold: uniform(0), respawn: uniform(0),
    // arrive / leave
    arrive: uniform(1), leave: uniform(0), freeze: uniform(0), sandAmt: uniform(1), sandGlow: uniform(1),
  };
  const HA = [], HB = [], IMP = [], MA = [], MB = [], HU = [], HV = [];
  for (let i = 0; i < MAXH; i++) { HA.push(new THREE.Vector4()); HB.push(new THREE.Vector4()); HU.push(new THREE.Vector4()); HV.push(new THREE.Vector4()); }
  for (let i = 0; i < MAXI; i++) IMP.push(new THREE.Vector4());
  for (let i = 0; i < MAXM; i++) { MA.push(new THREE.Vector4()); MB.push(new THREE.Vector4()); }
  const uHA = uniformArray(HA, 'vec4'), uHB = uniformArray(HB, 'vec4'), uImp = uniformArray(IMP, 'vec4');
  const uMA = uniformArray(MA, 'vec4'), uMB = uniformArray(MB, 'vec4'), uHU = uniformArray(HU, 'vec4'), uHV = uniformArray(HV, 'vec4');

  const wrapd = (d) => d.sub(floor(d.div(PER).add(0.5)).mul(PER));
  const wrapS = (s) => s.sub(floor(s.div(PER)).mul(PER));
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const ROSE = vec3(1.0, 0.8, 0.82), ICE = vec3(0.8, 0.9, 1.0);
  const GOLD = vec3(1.0, 0.56, 0.17), GOLD2 = vec3(1.0, 0.68, 0.32), HOT = vec3(1.0, 0.84, 0.6), WHITE = vec3(1.0, 0.93, 0.8), PEARL = vec3(0.86, 0.9, 1.0);

  // ------------------------------------------------------------------ the field: two float targets, ping-pong
  const mkRT = (type, filter) => {
    const rt = new THREE.RenderTarget(GW, GH, { type, depthBuffer: false, minFilter: filter, magFilter: filter, generateMipmaps: false });
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.minFilter = filter; rt.texture.magFilter = filter; rt.texture.generateMipmaps = false;
    return rt;
  };
  const sim = [mkRT(THREE.FloatType, THREE.NearestFilter), mkRT(THREE.FloatType, THREE.NearestFilter)];
  const der = mkRT(THREE.HalfFloatType, THREE.LinearFilter), derB = mkRT(THREE.HalfFloatType, THREE.NearestFilter);
  let sc = 0, cleared = false;

  const simTex = texture(sim[0].texture);
  const simFrag = Fn(() => {
    const q = uv();
    const at = (i, j) => simTex.sample(q.add(vec2(i * TX, j * TY)));
    const s = simTex.sample(q);
    const L = at(-1, 0), R = at(1, 0), Uu = at(0, 1), D = at(0, -1);
    const ul = at(-1, 1), ur = at(1, 1), dl = at(-1, -1), dr = at(1, -1);
    const h0 = s.x;
    const lap = L.x.add(R.x).add(Uu.x).add(D.x).mul(4).add(ul.x.add(ur.x).add(dl.x).add(dr.x)).sub(h0.mul(20)).div(6);
    const acc = U.c2.mul(lap).sub(h0.mul(1.5)).toVar();
    const aloc = sqrt(max(s.z.mul(2), 0));
    const hush = float(1).div(aloc.mul(aloc).div(0.05).add(1));
    acc.addAssign(U.visc.mul(L.y.add(R.y).add(Uu.y).add(D.y).sub(s.y.mul(4))));
    const p = q.mul(vec2(PER, HG));
    Loop(U.nH, ({ i }) => {
      const A = uHA.element(i), B = uHB.element(i);
      const qq = vec2(wrapd(p.x.sub(A.x)), p.y.sub(A.y)), r2 = dot(qq, qq);
      If(r2.lessThan(B.w.mul(B.w).mul(16)), () => {
      const g = exp(r2.negate().div(B.w.mul(B.w)));
      acc.addAssign(g.mul(A.z.mul(hush).mul(sin(A.w.add(B.z.mul(U.tau)))).add(U.wake.mul(dot(qq, B.xy)).div(B.w))));
      });
    });
    const reg = clamp(float(1).sub(aloc.div(U.modeCap)), 0, 1);
    Loop(U.nM, ({ i }) => {
      const M = uMA.element(i), Mb = uMB.element(i);
      acc.addAssign(reg.mul(M.z).mul(cos(M.x.mul(p.x).add(Mb.x))).mul(cos(M.y.mul(p.y))).mul(sin(M.w.mul(U.tau).add(Mb.y))));
    });
    const sponge = smoothstep(U.ceil.sub(0.15), U.ceil.add(0.45), p.y).mul(7);
    const v = s.y.add(U.dt.mul(acc.sub(U.gam.add(sponge).add(max(aloc.sub(0.4), 0).mul(4)).mul(s.y)))).toVar();
    If(U.kick.greaterThan(0.5), () => {
      Loop(U.nI, ({ i }) => {
        const I = uImp.element(i), qq = vec2(wrapd(p.x.sub(I.x)), p.y.sub(I.y)), r2 = dot(qq, qq), w2 = I.w.mul(I.w);
        v.addAssign(I.z.mul(exp(r2.negate().div(w2)).sub(exp(r2.negate().div(w2.mul(4))).mul(0.25))));
      });
      const dyl = p.y.sub(U.lineY), d2 = dyl.mul(dyl);
      v.addAssign(U.lineK.mul(exp(d2.negate().div(0.04)).sub(exp(d2.negate().div(0.16)).mul(0.5))));
    });
    const h = h0.add(U.dt.mul(v)).toVar();
    const kn = U.clip.mul(0.6), ah = abs(h);
    If(ah.greaterThan(kn), () => { h.assign(sign(h).mul(kn.add(U.clip.sub(kn).mul(tanh(ah.sub(kn).div(U.clip.sub(kn))))))); });
    return vec4(h, v, mix(s.z, h.mul(h), U.eavg), 1);
  });
  const simMat = new THREE.NodeMaterial(); simMat.fragmentNode = simFrag(); simMat.depthTest = false; simMat.depthWrite = false;
  const simQuad = new THREE.QuadMesh(simMat);

  // derived: (q, A, e, h), smoothed, filterable. A = sqrt(h² + (v/ω)²) the phase-free amplitude; q = mix(h, A, still)
  const derTex = texture(sim[0].texture);
  // A: the phase-free amplitude; when several frequencies ring at once (high resonance, bloom) the running rms, which cannot beat
  const derPrev = texture(der.texture), derCopyTex = texture(derB.texture);
  const derFrag = Fn(() => {
    const q = uv();
    const Q = (i, j) => { const s = derTex.sample(q.add(vec2(i * TX, j * TY))); const A = mix(sqrt(s.x.mul(s.x).add(s.y.mul(s.y).mul(U.iw.mul(U.iw)))), sqrt(max(s.z.mul(2), 0)), U.rmsK); const Ac = min(A, 0.75), qc = clamp(mix(s.x, Ac, U.still), -0.75, 0.75); return vec4(qc, Ac, s.z, qc); };
    const now = Q(0, 0).mul(0.5).add(Q(1, 0).add(Q(-1, 0)).add(Q(0, 1)).add(Q(0, -1)).mul(0.125));
    return mix(derPrev.sample(q), now, U.derA);          // a short temporal average when the room resonates: no per-frame shimmer
  });
  const derMat = new THREE.NodeMaterial(); derMat.fragmentNode = derFrag(); derMat.depthTest = false; derMat.depthWrite = false;
  const derQuad = new THREE.QuadMesh(derMat);
  const copyMat = new THREE.NodeMaterial(); copyMat.fragmentNode = derCopyTex.sample(uv()); copyMat.depthTest = false; copyMat.depthWrite = false;
  const copyQuad = new THREE.QuadMesh(copyMat);
  const field = texture(der.texture);
  const fieldUV = (s, y) => vec2(s.div(PER), clamp(y.div(HG), 0.002, 0.998));

  // ------------------------------------------------------------------ band function (ordered pixel-sorted runs)
  const NB = Math.round(PER / 0.045), BW = PER / NB, NBL = Math.round(PER / 0.85), BL = PER / NBL;
  const bandOf = (s) => {
    const c = floor(s.div(BW)), blk = floor(s.div(BL));
    const hb = hash12(vec2(c.sub(floor(c.div(NB)).mul(NB)), 7.0)), hk = hash12(vec2(blk.sub(floor(blk.div(NBL)).mul(NBL)), 3.0));
    const hk1 = hk.mul(0.94).add(0.06);                                 // threshold never below 0.06: at bandK 0 no block is active
    const act = smoothstep(hk1.sub(0.06), hk1, U.bandK.mul(0.32)).mul(step(0.3, hb));
    return vec3(act, hb, hk);
  };

  // ------------------------------------------------------------------ cells (the crown's opening, arrival and leaving)
  const NCX = Math.round(PER / 0.62), CS = PER / NCX;
  const voro = (s, y) => {
    const wx = sin(y.mul(1.9).add(s.mul(6.2832 * 11 / PER))).mul(0.32).add(sin(y.mul(4.3).sub(s.mul(6.2832 * 29 / PER))).mul(0.12));
    const wy = sin(s.mul(6.2832 * 17 / PER).add(y.mul(1.1))).mul(0.3).add(sin(s.mul(6.2832 * 41 / PER).sub(y.mul(2.7))).mul(0.1));
    const p = vec2(s.div(CS).add(wx), y.div(CS).add(wy)), ip = floor(p), fp = fract(p);
    const d1 = float(8).toVar(), d2 = float(8).toVar(), id = float(0).toVar(), cy = float(0).toVar();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = ip.add(vec2(i, j)), cx = c.x.sub(floor(c.x.div(NCX)).mul(NCX));
      const hx = hash12(vec2(cx, c.y)), hy = hash12(vec2(c.y.add(17.0), cx.add(5.0)));
      const o = vec2(i, j).add(vec2(hx, hy).mul(0.8).add(0.1)).sub(fp), dd = dot(o, o);
      If(dd.lessThan(d1), () => { d2.assign(d1); d1.assign(dd); id.assign(hash12(vec2(cx.add(31.0), c.y.mul(1.7)))); cy.assign(c.y.add(hy)); })
        .ElseIf(dd.lessThan(d2), () => { d2.assign(dd); });
    }
    return vec3(sqrt(d2).sub(sqrt(d1)).mul(CS), id, cy.mul(CS));
  };

  // ------------------------------------------------------------------ the plate (one grid mesh per wall)
  const plateMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const aF = attribute('aF', 'vec4'), aN = attribute('aN', 'vec3');
  plateMat.positionNode = Fn(() => {
    const d = field.sample(fieldUV(wrapS(aF.x), aF.y)).level(0);
    const fall = U.leave.sub(0.15).max(0).mul(1.6);
    const edge = smoothstep(0.0, 0.4, attribute('aE', 'float'));          // no relief at the corners: the two walls' planes displace differently
    return positionLocal.add(aN.mul(clamp(d.w, -0.6, 0.6).mul(U.relief).mul(float(1).sub(U.leave)).mul(edge))).sub(vec3(0, fall.mul(fall).mul(0.0), 0));
  })();
  const vF = varying(aF), vN = varying(aN);
  plateMat.colorNode = Fn(() => {
    If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
    const s = wrapS(vF.x), y = vF.y, dc = vF.z;
    // ordered bands: inside an active band the field is read at the top of a run (a pixel-sorted streak) and graded down
    const bd = bandOf(s), act = bd.x, hb = bd.y, hk = bd.z;
    const Lr = hb.mul(0.8).add(0.4).mul(U.bandK.mul(0.5).add(0.5)), off = fract(hb.mul(7.3));
    const yT = floor(y.div(Lr).add(off)).add(1).sub(off).mul(Lr), tr = clamp(yT.sub(y).div(Lr), 0, 1);
    const yS = y;
    const sS = s;
    const q0 = fieldUV(sS, yS);
    const D = field.sample(q0), Dr = field.sample(q0.add(vec2(TX, 0))), Dl = field.sample(q0.sub(vec2(TX, 0)));
    const Du = field.sample(q0.add(vec2(0, TY))), Dd = field.sample(q0.sub(vec2(0, TY)));
    const gq = vec2(Dr.x.sub(Dl.x), Du.x.sub(Dd.x)).div(2 * DX), gA = vec2(Dr.y.sub(Dl.y), Du.y.sub(Dd.y)).div(2 * DX);
    const gh = vec2(Dr.w.sub(Dl.w), Du.w.sub(Dd.w)).div(2 * DX);
    const hb0 = D.x, Aa = D.y, e = D.z;
    const gold = mix(GOLD, GOLD2, U.Ve), hot = mix(HOT, WHITE, U.Ve);
    // contour filigree
    const gm = length(gq).add(1e-5), f = hb0.div(U.stepL), dl = abs(fract(f).sub(0.5)).mul(U.stepL).div(gm);
    const crowd = smoothstep(U.lineW.mul(1.5), U.lineW.mul(6), U.stepL.div(gm));
    const lvl = min(abs(hb0).div(0.3), 1);
    const w2 = U.lineW.mul(U.lineW);
    const line = exp(dl.mul(dl).negate().div(w2)).mul(crowd), halo = exp(dl.mul(dl).negate().div(w2.mul(9))).mul(crowd).mul(0.08);
    const lb = line.add(halo).mul(lvl.mul(lvl).mul(1.1).add(0.75)).mul(smoothstep(0.9, 1.45, abs(f))).mul(float(1).sub(smoothstep(5, 8, abs(f))));
    // Chladni nodes: where the figure stands still
    const ga = length(gA).add(1e-5), dz = Aa.div(ga);
    const sandL = exp(dz.mul(dz).negate().div(w2.mul(3))).mul(smoothstep(U.lineW.mul(1.5), U.lineW.mul(5), U.stepL.div(ga))).mul(smoothstep(0.3, 1.2, ga.mul(0.5).div(U.stepL))).mul(U.sand);
    const col = mix(gold, hot, smoothstep(0.45, 0.95, lvl)).mul(lb).mul(U.gain).mul(0.55).add(hot.mul(sandL).mul(U.gain).mul(0.5)).toVar();
    // relief: the slope catches a light from above; a pearl, faintly iridescent sheen on the crests
    const slope = length(gh), lit = gh.y.mul(0.8).add(gh.x.mul(0.25));
    const ndv = clamp(slope.mul(0.25), 0, 1);
    const irid = mix(ROSE, ICE, sin(ndv.mul(9.0).add(hb0.mul(6))).mul(0.5).add(0.5));
    const sheen = mix(PEARL, irid, U.Ve.mul(0.3).add(0.08));
    col.addAssign(sheen.mul(smoothstep(0.4, 4.0, slope).mul(0.05).add(clamp(lit, 0, 3).mul(0.012))).mul(U.gain));
    col.addAssign(gold.mul(smoothstep(0.25, 1.0, lvl)).mul(0.07).mul(U.bloom));
    // castell red, far behind: where waves have been
    col.addAssign(vec3(0.13, 0.012, 0.008).mul(float(1).sub(exp(e.mul(U.haze).negate()))).mul(U.Ve.mul(0.65).add(0.35)));
    col.addAssign(vec3(0.05, 0.004, 0.003).mul(exp(y.negate().div(0.6))).mul(sin(U.time.mul(0.31).add(s.mul(6.2832 * 3 / PER))).mul(0.4).add(0.6)));
    // light climbs with the resonance
    col.mulAssign(smoothstep(U.ceil.add(1.3), U.ceil.sub(0.9), y).mul(0.85).add(0.15).mul(smoothstep(0.0, 0.2, y)));   // the light climbs softly: no black band at the top
    // bands: graded runs, gold / pearl / a rare iridescent hue
    const kb = fract(hk.mul(13.7));                                       // one colour per block: white-gold, pearl, rarely rose or ice
    const pal = select(kb.lessThan(0.55), vec3(1.0, 0.72, 0.38), select(kb.lessThan(0.85), vec3(1.0, 0.84, 0.62), select(kb.lessThan(0.93), ROSE, vec3(0.9, 0.82, 0.7))));   // warm golds, rarely rose: never grey
    const runG = mix(float(1.1), float(0.55), pow(tr, 0.8));
    col.assign(mix(col, col.mul(pal).mul(runG).mul(1.2), act));   // a band tints and grades the local lines: never a flat slab   // a band carries the smooth amplitude, not the thin lines: no strobing runs
    // hands: a warm light under each palm, a flash when it lands
    Loop(U.nHU, ({ i }) => {
      const h = uHU.element(i), qq = vec2(wrapd(s.sub(h.x)), y.sub(h.y)), r2 = dot(qq, qq);
      col.addAssign(vec3(1.0, 0.78, 0.48).mul(h.z).mul(exp(r2.negate().div(0.003)).mul(0.5).add(exp(r2.negate().div(0.04)).mul(0.05))));
      col.addAssign(vec3(1.0, 0.9, 0.72).mul(h.w).mul(exp(r2.negate().div(0.005)).mul(1.0).add(exp(r2.negate().div(0.08)).mul(0.14))));
      // the solo bloom: a resting hand slowly opens a rosette of fine gold round itself (six petals, turning very slowly)
      const hv = uHV.element(i), age = hv.x, k = hv.y.mul(U.solo);
      If(k.greaterThan(0.001).and(r2.lessThan(1.2)), () => {
        const rr = sqrt(r2.add(1e-6)), th = atan(qq.y, qq.x);
        const R0 = float(0.1).add(float(0.62).mul(float(1).sub(exp(age.mul(-0.35)))));
        const pet = cos(th.mul(6).add(age.mul(0.12))).mul(0.5).add(0.5), pet2 = cos(th.mul(12).sub(age.mul(0.07))).mul(0.5).add(0.5);
        const Rp = R0.mul(pet.mul(0.18).add(0.82)), Rq = R0.mul(0.58).mul(pet2.mul(0.12).add(0.88));
        const w2 = U.lineW.mul(U.lineW).mul(1.2);
        const l1 = exp(rr.sub(Rp).mul(rr.sub(Rp)).negate().div(w2)), l2 = exp(rr.sub(Rq).mul(rr.sub(Rq)).negate().div(w2)).mul(0.55);
        const veil = exp(rr.sub(Rp).mul(rr.sub(Rp)).negate().div(0.006)).mul(0.035);
        const grow = smoothstep(0.25, 1.6, age);
        col.addAssign(mix(GOLD2, HOT, pet).mul(l1.add(l2).add(veil)).mul(k).mul(grow).mul(0.9));
      });
    });
    // the peak owns its moment: the field, its bands and the hands' light step back to ~30 % while it lasts
    col.mulAssign(U.duck);
    // the crown: the line of gold round the top, its heads and their meeting, and the night opening cell by cell into light
    const cell = vec3(1, 0.5, 0).toVar();
    If(U.cells.greaterThan(0.5), () => { cell.assign(voro(s, y)); });
    const cOn = U.crownOn;
    If(cOn.greaterThan(0.001), () => {
      const dy = y.sub(HG - 0.16), dx = abs(wrapd(s.sub(X0)));
      const vis = float(1).sub(smoothstep(U.front.sub(0.3), U.front.add(0.04), dx));
      col.addAssign(GOLD2.mul(exp(dy.mul(dy).negate().div(2 * 0.008 * 0.008)).mul(2.0).add(exp(dy.mul(dy).negate().div(2 * 0.15 * 0.15)).mul(0.12)).mul(vis).mul(U.ring)));
      const hd = dx.sub(U.front), r2 = hd.mul(hd).add(dy.mul(dy));
      col.addAssign(WHITE.mul(U.head.mul(exp(r2.negate().div(2 * 0.03 * 0.03)).mul(8).add(exp(r2.negate().div(2 * 0.3 * 0.3)).mul(0.3)))));
      const fx = wrapd(s.sub(X0 + PER / 2)), f2 = fx.mul(fx).add(dy.mul(dy));
      col.addAssign(WHITE.mul(U.flash.mul(exp(f2.negate().div(2 * 0.06 * 0.06)).mul(6).add(exp(f2.negate().div(2 * 0.9 * 0.9)).mul(0.5)))));
      const delay = clamp(float(HG).sub(cell.z).div(HG), 0, 1).mul(0.72).add(cell.y.mul(0.22));
      const op = clamp(U.open.sub(delay).div(0.1), 0, 1);
      const cw = cell.y.mul(cell.y).mul(0.022).add(0.006), keep = step(0.72, cell.y);       // a few cracks stay as fine threads
      const crack = exp(cell.x.mul(cell.x).negate().div(cw.mul(cw))).mul(smoothstep(0.0, 0.25, op)).mul(float(1.3).sub(op.mul(float(1.25).sub(keep.mul(0.35)))))
        .mul(fract(cell.y.mul(7.1)).mul(0.8).add(0.4));
      const band = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.45));
      const leak = exp(cell.x.negate().div(cell.y.mul(0.05).add(0.012)));                    // light leaking in from the cracks
      const inner = mix(vec3(0.9, 0.42, 0.1), WHITE, smoothstep(0.7, 1.0, y.div(HG))).mul(leak.mul(0.3).add(pow(y.div(HG), 3.0).mul(0.08)).add(0.004))
        .mul(op).mul(U.swell).mul(band).mul(cell.y.mul(0.7).add(0.3));
      col.addAssign(GOLD2.mul(crack).mul(1.3).mul(U.swell.mul(0.6).add(0.4)).add(inner).mul(cOn));
      // the towers are crowned: where the castells stand (each wall's centre, high up) a crown of gold ~0.85 m wide is drawn in light as the
      // flash passes — a double band and five points, a pearl on each — breathing slowly until the light settles
      const CP = [[-0.42, 0.0], [-0.36, 0.24], [-0.27, 0.08], [-0.18, 0.33], [-0.09, 0.1], [0.0, 0.44], [0.09, 0.1], [0.18, 0.33], [0.27, 0.08], [0.36, 0.24], [0.42, 0.0]];
      for (let w = 0; w < NW; w++) {
        const sw = cum[w] + walls[w].width / 2, dw = Math.abs(((sw - X0 + PER / 2) % PER + PER) % PER - PER / 2);
        const lit = smoothstep(dw - 0.3, dw + 0.6, U.front).mul(cOn);
        If(lit.greaterThan(0.001), () => {
          const qx = wrapd(s.sub(sw)), qy = y.sub(HG - 0.78);
          const dmin = float(9).toVar();
          for (let k = 0; k < CP.length - 1; k++) {
            const [ax, ay] = CP[k], [bx, by] = CP[k + 1], ex = bx - ax, ey = by - ay, ll = ex * ex + ey * ey;
            const px = qx.sub(ax), py = qy.sub(ay), t = clamp(px.mul(ex).add(py.mul(ey)).div(ll), 0, 1);
            const ddx = px.sub(t.mul(ex)), ddy = py.sub(t.mul(ey));
            dmin.assign(min(dmin, ddx.mul(ddx).add(ddy.mul(ddy))));
          }
          const inBand = step(abs(qx), 0.42);
          const b1 = qy, b2 = qy.add(0.07);
          const bands = exp(b1.mul(b1).negate().div(2 * 0.008 * 0.008)).add(exp(b2.mul(b2).negate().div(2 * 0.008 * 0.008)).mul(0.8)).mul(inBand);
          const outline = exp(dmin.negate().div(2 * 0.008 * 0.008)).add(bands).mul(1.6).add(exp(dmin.negate().div(2 * 0.05 * 0.05)).mul(0.12));
          let pearls = float(0);
          for (const k of [1, 3, 5, 7, 9]) { const ddx = qx.sub(CP[k][0]), ddy = qy.sub(CP[k][1] + 0.025); pearls = pearls.add(exp(ddx.mul(ddx).add(ddy.mul(ddy)).negate().div(2 * 0.018 * 0.018))); }
          const hx = qx, hy = qy.sub(0.18), halo = exp(hx.mul(hx).add(hy.mul(hy)).negate().div(2 * 0.45 * 0.45)).mul(0.06);
          const breathe = sin(U.time.mul(1.1).add(w * 1.7)).mul(0.1).add(0.9);
          col.addAssign(mix(GOLD2, HOT, 0.4).mul(outline).add(WHITE.mul(pearls.mul(2.2))).add(GOLD2.mul(halo)).mul(lit).mul(breathe).mul(U.swell.mul(0.5).add(0.6)));
        });
      }
      // ... and for the first time the whole room fills with light: a warm wash, brighter high up, the guide band spared
      const bandF = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.5));
      // gold with depth: castell red at the base, gold in the middle, warm white high up; the cells' edges catch the light, the plate's relief too
      const yh = y.div(HG);
      const fillC = mix(mix(vec3(0.42, 0.06, 0.03), vec3(1.0, 0.52, 0.16), smoothstep(0.05, 0.45, yh)), vec3(1.0, 0.76, 0.44), smoothstep(0.55, 1.0, yh));   // gold, not beige
      const facet = leak.mul(1.1).add(0.35).mul(smoothstep(0.02, 0.3, Aa).mul(0.5).add(0.75));
      col.addAssign(fillC.mul(pow(yh, 1.5).mul(0.34).add(0.03)).mul(facet).mul(U.fill).mul(bandF).mul(cOn));
    });
    // the group's peak: a crack of light runs both ways round the room from where the hands are, meets opposite, and the plate
    // opens from it like the crown (cells, light leaking from the cracks), then closes again
    If(U.peakEnv.greaterThan(0.001), () => {
      const yC = float(2.15).add(sin(s.mul(6.2832 * 5 / PER).add(0.7)).mul(0.16)).add(sin(s.mul(6.2832 * 23 / PER).add(2.1)).mul(0.05)).add(sin(s.mul(6.2832 * 61 / PER)).mul(0.018));
      const dyc = y.sub(yC), dx = abs(wrapd(s.sub(U.peakS0)));
      const reached = float(1).sub(smoothstep(U.peakFront.sub(0.4), U.peakFront.add(0.02), dx));
      const headD = dx.sub(U.peakFront), hr2 = headD.mul(headD).add(dyc.mul(dyc));
      const crackL = exp(dyc.mul(dyc).negate().div(2 * 0.007 * 0.007)).mul(1.6).add(exp(dyc.mul(dyc).negate().div(2 * 0.09 * 0.09)).mul(0.06));
      col.addAssign(HOT.mul(crackL.mul(reached).add(exp(hr2.negate().div(2 * 0.05 * 0.05)).mul(2.5).mul(step(dx, U.peakFront.add(0.1))).mul(step(U.peakFront, PER / 2)))).mul(U.peakEnv));
      const delay = abs(dyc).mul(0.75).add(cell.y.mul(0.3)).add(dx.div(PER).mul(0.6));   // cells open only near the crack (≤ ~0,6 m above and below)
      const op = clamp(U.peakOpen.sub(delay).div(0.12), 0, 1);
      const cw = cell.y.mul(cell.y).mul(0.02).add(0.005);
      const crk = exp(cell.x.mul(cell.x).negate().div(cw.mul(cw))).mul(smoothstep(0.0, 0.3, op)).mul(float(1.1).sub(op.mul(0.85))).mul(fract(cell.y.mul(7.1)).mul(0.8).add(0.4));
      const leak = exp(cell.x.negate().div(cell.y.mul(0.04).add(0.01))).mul(0.12).mul(op);
      const band = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.5));
      col.addAssign(GOLD2.mul(crk.mul(0.6)).add(mix(vec3(0.9, 0.42, 0.1), WHITE, smoothstep(1.6, 2.6, y)).mul(leak)).mul(U.peakEnv).mul(band));
    });
    // the room blooms once: a warm wash rises from the floor up all four walls (a bright rim at its front), holds, settles
    If(U.washK.greaterThan(0.001), () => {
      const below = smoothstep(U.washY.add(0.05), U.washY.sub(0.6), y);
      const dyw = y.sub(U.washY);
      const bandW = float(1).sub(exp(dc.mul(dc).negate().div(0.8)).mul(smoothstep(0.75, 1.0, y)).mul(smoothstep(1.75, 1.5, y)).mul(0.45));
      const yh = y.div(HG);
      const warm = mix(mix(vec3(0.42, 0.06, 0.03), vec3(1.0, 0.52, 0.16), smoothstep(0.05, 0.45, yh)), vec3(1.0, 0.76, 0.44), smoothstep(0.55, 1.0, yh));   // gold, not beige
      const figure = smoothstep(0.02, 0.3, Aa).mul(0.7).add(0.6);                 // the organised figure catches the light
      col.addAssign(warm.mul(below.mul(pow(yh, 1.3).mul(0.34).add(0.05)).mul(figure).add(exp(dyw.mul(dyw).negate().div(0.012)).mul(0.5).mul(step(U.washY, HG + 0.2)))).mul(U.washK).mul(bandW));
    });
    // arrival: the plate opens cell by cell; leaving: it goes dark cell by cell (a last glint on the cracks)
    // arrival: cells light from the top down as the gold fragments land; leaving: every cell goes at once (a little scatter), all gone
    // by leave 0.6, and the whole plate fades with them
    const app = clamp(U.arrive.sub(float(HG).sub(y).div(HG).mul(0.45)).sub(cell.y.mul(0.15)).sub(0.25).div(0.18), 0, 1);
    const gone = clamp(U.leave.sub(cell.y.mul(0.3).add(0.06)).div(0.16), 0, 1).max(smoothstep(0.3, 0.6, U.leave));
    const edgeG = exp(cell.x.mul(cell.x).negate().div(0.0002)).mul(app.mul(float(1).sub(app)).add(gone.mul(float(1).sub(gone))).mul(4)).mul(GOLD2).mul(0.25);
    return vec4(col.mul(app).mul(float(1).sub(gone)).add(edgeG), 1);
  })();

  const _v = new THREE.Vector3();
  walls.forEach((w, wi) => {
    const nx = Math.max(40, Math.round(w.width / 0.03)), ny = Math.max(20, Math.round(w.height / 0.035));
    const m = 0.03, pos = [], af = [], an = [], ae = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = -m + (1 + 2 * m) * (i / nx), v = -0.03 + 1.06 * (j / ny);
      room.wallPoint(wi, u, v, _v); _v.sub(eye).multiplyScalar(K[wi]).add(eye);
      pos.push(_v.x, _v.y, _v.z);
      af.push(cum[wi] + u * w.width, v * w.height, (u - 0.5) * w.width, wi);
      an.push(w.normal.x, w.normal.y, w.normal.z);
      ae.push(Math.max(0, Math.min(u, 1 - u)) * w.width);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(af, 4));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(an, 3));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(ae, 1));
    g.setIndex(idx); g.computeBoundingSphere(); g.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(g, plateMat); mesh.renderOrder = 1;
    object.add(mesh);
  });

  // ------------------------------------------------------------------ plate point in the world (TSL)
  const platePoint = (s, y, off) => {
    const base = vec3(0).toVar(), nrm = vec3(0).toVar(), kk = float(1).toVar(), dd = float(1).toVar();
    for (let w = 0; w < NW; w++) {
      const W = walls[w];
      If(s.greaterThanEqual(cum[w] - 1e-4), () => {
        const t = s.sub(cum[w]);
        base.assign(vec3(t.mul(W.right.x).add(W.pa.x), y, t.mul(W.right.z).add(W.pa.z)));
        nrm.assign(vec3(W.normal.x, W.normal.y, W.normal.z)); kk.assign(K[w]); dd.assign(dW[w]);
      });
    }
    const E = vec3(eye.x, eye.y, eye.z);
    return { p: E.add(base.sub(E).mul(kk)).add(nrm.mul(off)), n: nrm, d: dd };
  };
  // where a night fragment floats (arrival), analytic so the shards and their particles agree
  const scatterPos = (j, t) => {
    const a = hash12(vec2(j, 1.3)).mul(6.2832).add(t.mul(0.02)), R = hash12(vec2(j, 2.7)).mul(6).add(5.5), y = hash12(vec2(j, 4.1)).mul(4.4).add(0.3);
    return vec3(cos(a).mul(R), y.add(sin(t.mul(0.3).add(j)).mul(0.15)), sin(a).mul(R));
  };

  // ------------------------------------------------------------------ the sand (GPU compute)
  const SEED = new Float32Array(NP * 4), S0 = new Float32Array(NP * 4);
  { const r = rng(23); for (let i = 0; i < NP; i++) { for (let k = 0; k < 4; k++) SEED[i * 4 + k] = r(); S0[i * 4] = r() * PER; S0[i * 4 + 1] = 0.03 + r() * (HG - 0.06); } }
  const bSeed = instancedArray(SEED, 'vec4').setPBO(true).toReadOnly();
  const bS = instancedArray(S0, 'vec4');               // s, y, vs, vy
  const bX = instancedArray(NP, 'vec4');               // offset along the normal (- = deeper), its velocity, heat, -
  const bP = instancedArray(NP, 'vec4');               // world position, size
  const bC = instancedArray(NP, 'vec4');               // radiance, stretch
  const sandStep = Fn(() => {
    const sd = bSeed.element(instanceIndex), st = bS.element(instanceIndex).toVar(), x = bX.element(instanceIndex).toVar();
    const dt = U.dt.mul(float(1).sub(U.freeze));
    const s = st.x, y = st.y;
    const q = fieldUV(s, y);
    const D = field.sample(q).level(0), Dx = field.sample(q.add(vec2(TX, 0))).level(0), Dy = field.sample(q.add(vec2(0, TY))).level(0);
    const A = D.y, gA = vec2(Dx.y.sub(A), Dy.y.sub(A)).div(DX);
    const r1 = hash13(vec3(sd.x.mul(997), sd.y.mul(613), U.frame)), r2 = hash13(vec3(sd.z.mul(911), U.frame.add(17), sd.w.mul(577)));
    const jit = vec2(r1.sub(0.5), r2.sub(0.5));
    const rainP = U.rain.mul(step(sd.w, 0.09));                  // only ~9 % of the grains become the rain of gold: drops, not noise
    const sandW = float(1).sub(rainP);
    // sand: hop where it vibrates, slide down the amplitude towards the nodes
    const acc = gA.div(length(gA).add(1.5)).mul(-4.5).mul(U.sand.mul(1.5).add(0.6)).add(jit.mul(A.mul(25).add(0.9))).sub(st.zw.mul(4.0)).mul(sandW);   // a bounded drift to the nodes and a steady diffusion: lines of sand, never a solid bar
    // rain: fall slowly, drift, hang while the breath is held
    const fallV = sd.x.mul(0.25).add(0.18).mul(float(1).sub(U.hold));
    const rainA = vec2(sin(U.time.mul(0.4).add(sd.y.mul(40))).mul(0.05), fallV.negate()).sub(st.zw).mul(2.0);
    const vel = st.zw.add(acc.add(rainA.mul(rainP)).mul(dt)).toVar();
    const ns = wrapS(s.add(vel.x.mul(dt))), ny = y.add(vel.y.mul(dt)).toVar();
    If(ny.lessThan(0.02), () => {
      If(U.respawn.greaterThan(0.5).and(rainP.greaterThan(0.5)), () => { ny.assign(float(HG + 0.15).add(sd.z.mul(0.6))); }).Else(() => { ny.assign(0.02); vel.y.assign(abs(vel.y).mul(0.3)); });
    });
    If(ny.greaterThan(HG - 0.02).and(rainP.lessThan(0.5)), () => { ny.assign(float(HG - 0.08).sub(sd.z.mul(0.5))); vel.y.assign(abs(vel.y).negate().mul(0.3)); });
    // depth: rain lives in a deep volume behind the plate; sand lies on it
    const tz = mix(float(0), sd.z.mul(2.6).add(0.15).negate(), rainP);
    const nz = x.x.add(tz.sub(x.x).mul(min(dt.mul(0.9), 1)));
    const heat = x.z.mul(exp(dt.mul(-1.2))).add(A.mul(dt).mul(3)).toVar();
    // hands warm the sand near them
    heat.assign(min(heat, 2));
    bS.element(instanceIndex).assign(vec4(ns, ny, vel));
    bX.element(instanceIndex).assign(vec4(nz, 0, heat, 0));

    // ---- where it is seen
    const hop = A.mul(0.05).mul(sin(U.time.mul(sd.y.mul(1.5).add(1.5)).add(sd.x.mul(40))).mul(0.5).add(0.5)).mul(sandW);   // a slow, small lift (was a fast hop: per-frame speckle)
    const pp = platePoint(ns, ny, D.w.mul(U.relief).mul(sandW).add(hop).add(nz));
    const pos = pp.p.toVar();
    // arrival: from the night fragments
    const j = floor(sd.w.mul(NSH));
    const b = hash12(vec2(j, 9.1)).mul(0.45).add(0.1);
    const k = smoothstep(b, b.add(0.35), U.arrive);
    const fromTop = pp.p.add(vec3(sd.x.sub(0.5).mul(0.6), sd.y.mul(3.0).add(2.6), sd.z.sub(0.5).mul(0.6))).sub(pp.n.mul(sd.z.mul(1.5).add(0.5)));
    pos.assign(mix(fromTop, pos, k.mul(k).mul(float(3).sub(k.mul(2)))));
    const burst = smoothstep(b.sub(0.03), b, U.arrive).mul(float(1).sub(k));
    // leaving: a held moment, then a slow fall of gold
    const tau = max(U.leave.sub(0.06).sub(sd.x.mul(0.3)), 0).mul(5.0);
    pos.subAssign(vec3(0, tau.mul(tau).mul(sd.y.mul(0.5).add(0.12)).add(tau.mul(sd.z.mul(0.3))), 0));   // each grain its own start and fall: no sheet
    pos.subAssign(pp.n.mul(tau.mul(0.15)));
    const fadeL = float(1).sub(smoothstep(0.3, 0.7, U.leave));
    // light
    const bd = bandOf(ns), str = bd.x.mul(U.bandK).mul(sd.y.mul(8).add(4));
    const glow = float(0.16).add(A.mul(0.6)).add(heat.mul(0.12)).mul(U.sandGlow).mul(smoothstep(U.ceil.add(1.0), U.ceil.sub(0.6), ny)).mul(float(1).sub(U.fill.mul(U.crownOn).mul(0.75)));   // low contrast: the grain reads as metal, not noise
    const c = mix(mix(vec3(1.0, 0.7, 0.36), vec3(1.0, 0.9, 0.75), U.Ve), PEARL, sd.z.mul(0.3)).mul(glow).mul(sandW)
      .add(mix(GOLD2, WHITE, sd.y).mul(rainP).mul(sd.x.mul(2.5).add(1.0)))
      .add(GOLD2.mul(burst.mul(3))).mul(fadeL).mul(step(sd.y, U.sandAmt));
    const toP = pos.sub(vec3(eye.x, eye.y, eye.z)), dperp = dot(toP, pp.n.negate()).max(0.5);
    const pix = dperp.mul(pxM).div(pp.d);
    const Dm = max(pix.mul(1.6), float(0.004).add(sd.x.mul(0.004)));
    const spx = Dm.div(pix);
    const E = c.div(spx.mul(spx)).mul(float(1).add(rainP.mul(1.5)));
    const inside = abs(pos.x).lessThan(Math.abs(walls[1 % NW].centre.x) - 0.02).and(abs(pos.z).lessThan(Math.abs(walls[0].centre.z) - 0.02));
    bP.element(instanceIndex).assign(vec4(pos, select(inside, float(0), Dm)));
    bC.element(instanceIndex).assign(vec4(E, str.add(rainP.mul(sd.z.mul(6).add(2)))));
  });
  const sandCompute = sandStep().compute(NP);
  const sm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pA = bP.toAttribute(), cA = bC.toAttribute();
  sm.positionNode = pA.xyz;
  sm.scaleNode = vec2(pA.w, pA.w.mul(cA.w.add(1)));
  const vCol = varying(cA.xyz.div(cA.w.add(1)));
  sm.colorNode = Fn(() => { const r = length(uv().sub(0.5)).mul(2.0); return vec4(vCol.mul(exp(r.mul(r).mul(-4.5))), 1); })();
  const sand = new THREE.Sprite(sm); sand.count = NP; sand.frustumCulled = false; sand.renderOrder = 2;
  object.add(sand);

  // ------------------------------------------------------------------ shards: night mirrors (arrival), gold (leaving)
  const shardG = new THREE.BufferGeometry();
  shardG.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.87, -0.5, 0, 0.87, -0.5, 0], 3));
  const shG = new THREE.InstancedBufferGeometry().copy(shardG); shG.instanceCount = NSH;
  const shM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(float(1).sub(cos(a)))));
  const vShC = varying(vec3(0));
  shM.positionNode = Fn(() => {
    const j = float(instanceIndex);
    const h1 = hash12(vec2(j, 9.1)), h2 = hash12(vec2(j, 3.3)), h3 = hash12(vec2(j, 5.7));
    const axis = normalize(vec3(h1.sub(0.5), h2.sub(0.5), h3.sub(0.5)).add(vec3(0, 0.001, 0)));
    const size = h2.mul(0.12).add(0.05);
    // arrival
    const b = h1.mul(0.45).add(0.1);
    const aVis = float(1).sub(smoothstep(b.sub(0.01), b.add(0.04), U.arrive)).mul(step(0.001, float(1).sub(U.arrive)));
    const ang = U.time.mul(h3.mul(0.5).add(0.15)).add(j);
    const local = rotA(positionLocal.mul(size), axis, ang);
    const s = h3.mul(PER), y = h2.mul(HG);
    const pp = platePoint(s, y, float(0));
    const ka = smoothstep(b.sub(0.3), b, U.arrive), ke = ka.mul(ka).mul(float(3).sub(ka.mul(2)));
    const start = pp.p.add(vec3(0, h1.mul(3.0).add(2.8), 0)).sub(pp.n.mul(h3.mul(1.8).add(0.6)));
    const angA = float(1).sub(ke).mul(h3.mul(4).add(2)).add(ang.mul(0.2));
    const pa = mix(start, pp.p, ke).add(rotA(positionLocal.mul(size), axis, angA));
    const n = rotA(vec3(0, 0, 1), axis, angA);
    // leaving
    const tau = max(U.leave.sub(0.08).sub(h1.mul(0.12)), 0).mul(5.0);
    const lVis = step(0.001, tau).mul(float(1).sub(smoothstep(0.55, 0.8, U.leave)));
    const ang2 = tau.mul(h3.mul(1.5).add(0.4));
    const pl = pp.p.add(rotA(positionLocal.mul(size.mul(0.8)), axis, ang2)).sub(vec3(0, tau.mul(tau).mul(0.2).add(tau.mul(0.06)), 0)).sub(pp.n.mul(tau.mul(0.12)));
    const n2 = rotA(vec3(0, 0, 1), axis, ang2);
    const useL = step(0.001, U.leave);
    const P = mix(pa, pl, useL), N = mix(n, n2, useL);
    const V = normalize(P.sub(vec3(eye.x, eye.y, eye.z)));
    const R = V.sub(N.mul(dot(V, N).mul(2)));
    const glint = pow(max(dot(R, normalize(vec3(0.3, 1, 0.2))), 0), 24).mul(3).add(pow(max(abs(dot(R, normalize(vec3(-0.5, 0.2, 0.8)))), 0), 60).mul(1.5));
    const night = GOLD2.mul(glint.mul(1.2).add(0.05)).add(GOLD2.mul(smoothstep(b.sub(0.05), b, U.arrive).mul(2.5)));   // gold fragments that catch the light, a soft flash as each lands
    const goldS = GOLD2.mul(glint.add(0.06)).mul(1.4);
    vShC.assign(mix(night.mul(aVis), goldS.mul(lVis), useL));
    return P.add(vec3(0, -1000, 0).mul(float(1).sub(max(aVis.mul(float(1).sub(useL)), lVis.mul(useL)))));
  })();
  shM.colorNode = vec4(vShC, 1);
  const shards = new THREE.Mesh(shG, shM); shards.frustumCulled = false; shards.renderOrder = 3;
  object.add(shards);

  // ------------------------------------------------------------------ the room's modes (exact grid eigenvalues)
  const lam = (kx, ky) => { const a = Math.cos(kx * DX), b = Math.cos(ky * DX); return -(8 * a + 8 * b + 4 * a * b - 20) / (6 * DX * DX); };
  const mr = rng(7);
  function pickPair(lambda) {
    const k0 = 2 * Math.PI / lambda, list = [];
    for (let m = 1; m <= 7; m++) for (let n = 2; n <= 90; n++) {
      const kx = 2 * Math.PI * n / PER, ky = m * Math.PI / HG, k = Math.sqrt(lam(kx, ky));
      if (Math.abs(k / k0 - 1) < 0.08) list.push({ n, m, kx, ky, k });
    }
    let best = null, bs = 1e9;
    for (const A of list) for (const B of list) {
      if (A.m >= B.m) continue;
      const s2 = Math.abs(A.k - B.k) / k0 + 0.25 * Math.abs((A.k + B.k) / 2 / k0 - 1) + (A.n % 4 ? 0.004 : 0) + (B.n % 4 ? 0.004 : 0);
      if (s2 < bs) { bs = s2; best = [A, B]; }
    }
    return (best || list.slice(0, 2)).map((M) => ({ ...M, px: mr() * 6.2832, pt: mr() * 6.2832 }));
  }
  const ORDER = pickPair(1.15), BLOOMM = pickPair(0.72);
  const MODES = [...ORDER, ...BLOOMM].slice(0, MAXM);

  // ------------------------------------------------------------------ CPU state (preallocated)
  const sStroke = new Array(MAXS).fill(null), sT0 = new Float64Array(MAXS), sPh = new Float64Array(MAXS), sSeen = new Int32Array(MAXS), sOwn = new Float64Array(MAXS);
  const RECENT = 64, recT = new Float64Array(RECENT).fill(-1e9); let recI = 0;
  let time = 0, frame = 0, Rown = 0, Rs = 0, bloomT = -1, bloomEnv = 0, Ve = 0, modeT = 0, autoWait = 0.8, lastCT = -1, lastBloomP = !!P.bloomNow;
  let nI = 0, cluster = 0, clusterAt = -1e9, gam = 0.7, c = 3.6;
  const impulse = (s, y, amp, sigma = Math.max(0.11, 3.5 * DX)) => { if (nI >= MAXI) return; IMP[nI].set(((s % PER) + PER) % PER, y, amp, sigma); nI++; };
  const fieldOf = (h) => { const w = walls[h.wall]; return [cum[h.wall] + h.u * w.width, h.v * w.height]; };
  let peakT = -1, peakS0 = X0;
  const swellM = (t) => (Math.pow(1.5, Math.min(5.5, Math.max(0, t))) - 1) / (Math.pow(1.5, 5.5) - 1);   // 0 → 1 in 5.5 s, ×1.5 a second
  let washDone = false, washOn = false;                // the room blooms in full only once per pass; later blooms are the crack alone
  function triggerBloom() { if (bloomT < 0) bloomT = 0; if (peakT < 0) { peakT = 0; peakS0 = handCentre(); washOn = !washDone; washDone = true; } }
  function handCentre() {                     // circular mean of the hands' perimeter positions (wall 0's centre if none)
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < U.nHU.value; i++) { const a = HU[i].x / PER * 2 * Math.PI; cx += Math.cos(a); cy += Math.sin(a); n++; }
    if (!n || Math.hypot(cx, cy) < 1e-3) return X0;
    return ((Math.atan2(cy, cx) / (2 * Math.PI)) * PER + PER) % PER;
  }

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20);
    time += dt; frame++; nI = 0;
    const st = input.state, ev = input.events;
    // ---- which moment: the crown's clock, or the resonance
    let cT;
    if (st) cT = st.block === 'crown' ? st.t : 99;
    else if (P.mode === 'crown') cT = num('crown', 0) > 0 ? num('crown', 0) * 25 : (input.t ?? 0);
    else cT = 99;
    if (!st || st.block === 'crown' || (input.arrive ?? 1) < 0.5) washDone = false;   // a new pass (the study: every trigger)
    if (ev) for (let i = 0; i < ev.length; i++) { if (ev[i] === 'bloom') triggerBloom(); else if (ev[i] === 'crown') lastCT = -1; }
    if (P.bloomNow === true && !lastBloomP) triggerBloom();
    lastBloomP = !!P.bloomNow;
    const arrive = st ? (input.arrive ?? 1) : num('arrive', 1), leave = st ? (input.leave ?? 0) : num('leave', 0);
    const freeze = ss(0.0, 0.15, leave);

    // ---- hands → field
    const hands = input.hands || [];
    for (let i = 0; i < MAXS; i++) sSeen[i] = 0;
    let nh = 0, driving = 0;
    const lockW = c * ORDER[0].k, lock = clamp01((Rs - 0.3) / 0.55);
    for (const h of hands) {
      let k = -1; for (let i = 0; i < MAXS; i++) if (sStroke[i] === h.stroke) { k = i; break; }
      if (k < 0) { for (let i = 0; i < MAXS; i++) if (sStroke[i] == null) { k = i; break; } if (k < 0) continue; sStroke[k] = h.stroke; sT0[k] = time; sPh[k] = 0; sOwn[k] = 2 * Math.PI * (2.6 + 1.4 * ((k * 0.6180339) % 1)); }
      sSeen[k] = 1;
      const age = time - sT0[k], sp = Math.hypot(h.vx || 0, h.vy || 0);
      const w = sOwn[k] + (lockW - sOwn[k]) * lock;
      sPh[k] = (sPh[k] + w * dt) % (2 * Math.PI * 64);
      const rest = clamp01((age - 0.25) / 0.6) * clamp01(1 - sp / 0.5);
      if (rest > 0.5) driving++;
      if (nh < MAXH) {
        const [fs, fy] = fieldOf(h);
        HA[nh].set(fs, fy, 600 * rest * (1 - 0.6 * lock), sPh[k]);
        { const vx = h.vx || 0, vy = h.vy || 0, sp = Math.hypot(vx, vy), k = sp > 1 ? 1 / sp : 1; HB[nh].set(vx * k, vy * k, w, 0.09); }
        HU[nh].set(fs, fy, 1, Math.exp(-age * 2.2) * Math.min(1, age * 30 + 0.35));   // the landing glow: at once, then a soft decay (no strobe) HV[nh].set(age, rest, 0, 0);
        nh++;
      }
    }
    for (let i = 0; i < MAXS; i++) if (!sSeen[i]) sStroke[i] = null;
    const quiet = 1 / Math.sqrt(Math.max(1, driving / 3));
    for (let i = 0; i < nh; i++) HA[i].z *= quiet;
    const downs = input.downs || [];
    const loud = 1 / Math.sqrt(Math.max(1, downs.length / 3));
    for (const d of downs) {
      let together = 0; for (let i = 0; i < RECENT; i++) { const a = time - recT[i]; if (a < 0.5) together += 1 - a / 0.5; }
      recT[recI] = time; recI = (recI + 1) % RECENT;
      const [fs, fy] = fieldOf(d);
      impulse(fs, fy, 1000 * (1 + 0.4 * Math.min(3, together)) * loud * (1 - freeze));
    }
    // ---- the hidden rule: the score's resonance, or (study) a stand-in with the score's own rule
    let Rin;
    if (st) Rin = st.resonance || 0;
    else {
      if (downs.length) { if (time - clusterAt <= 0.5) cluster += downs.length; else { clusterAt = time; cluster = downs.length; } const people = Math.max(2, Math.ceil(hands.length / 1.6)); Rown += cluster >= 2 ? (0.2 * downs.length) / people * num('sensitivity', 1) : 0.01; }
      Rown = Math.min(1.2, Math.max(0, Rown + dt * (0.004 * Math.min(12, hands.length) - 0.05)));
      if (Rown >= 1 && bloomT < 0) { triggerBloom(); Rown = 0.3; }
      Rin = Rown;
    }
    const crownK = cT < 25 ? 0 : 1;
    const R = clamp01((Rin + num('resonance', 0)) * crownK);
    Rs += (R - Rs) * (1 - Math.exp(-dt * (R > Rs ? 1.4 : 0.6)));
    if (bloomT >= 0) {
      bloomT += dt;
      bloomEnv = swellM(bloomT) * (1 - ss(5.5, 7.0, bloomT));     // a geometric swell (≤ ×2 a second in the room's light), released by 7 s
      if (bloomT > 7.2) { bloomT = -1; bloomEnv = 0; }
    }
    Ve = Math.max(Rs, bloomEnv);

    // ---- auto (study only): gentle self-impulses when fewer than two hands
    if (!st && P.auto !== false && hands.length < 2 && leave < 0.1) {
      autoWait -= dt;
      if (autoWait <= 0) { impulse(Math.random() * PER, 0.85 + Math.random() * 1.6, 800 * (1 - 0.4 * Rs)); autoWait = 1.0 + Math.random() * 1.8 - 0.5 * Rs; }
    }

    // ---- the crown
    const cross = (x) => lastCT < x && cT >= x;
    if (cross(1.2)) impulse(X0, HG - 0.35, 1400, 0.16);
    if (cross(5.2)) impulse(X0 + PER / 2, HG - 0.35, 1400, 0.16);
    U.lineK.value = cross(20.1) ? 140 : 0; U.lineY.value = HG - 0.35;
    lastCT = cT;
    const inCrown = cT < 26;
    U.crownOn.value = inCrown ? 1 - ss(23, 26, cT) : 0;
    // the group's peak (with the bloom): the crack runs at 5.5 m/s both ways, the plate opens from it, holds, closes
    let pEnv = 0, pOpen = 0, pFront = 0, wY = -1, wK = 0;
    if (peakT >= 0) {
      peakT += dt;
      pFront = Math.min(PER / 2 + 0.6, peakT * 5.5);                       // ~2.5 s round the room
      pEnv = ss(0, 1.0, peakT) * (1 - ss(5.6, 7.4, peakT));
      if (washOn) { wY = -0.3 + (HG + 0.9) * smoother((peakT - 0.3) / 4.5); wK = 0.4 * swellM(peakT - 0.3) * (1 - ss(5.6, 7.2, peakT)); }   // the wash: the same geometric swell, calm by ~7.5 s
      pOpen = 0.95 * swellM(peakT - 0.3);              // the plate opens round the crack, not everywhere
      if (peakT > 7.6) peakT = -1;
      if (peakT >= 0 && peakT < dt * 1.5) { U.lineK.value = 40; U.lineY.value = 2.15; }
    }
    // duck: the field and the hands' light fall to ~30 % (~22 % in a crowd) under the peak; the bands wait
    const crowd = clamp01((nh - 4) / 11);
    const crackOnly = peakT >= 0 ? 1 - swellM(peakT) : 0;              // the crack owns the first moment; then the organised figure returns
    U.duck.value = 1 - pEnv * crackOnly * (0.7 + 0.08 * crowd);
    U.washY.value = wY; U.washK.value = wK;
    if (leave > 0) { const lk = 1 - ss(0, 0.25, leave); pEnv *= lk; wK *= lk; U.washK.value = wK; }   // leaving: no peak, no wash
    U.peakEnv.value = pEnv; U.peakOpen.value = pOpen; U.peakFront.value = pFront; U.peakS0.value = peakS0;
    U.solo.value = 1 / (1 + 0.35 * Math.max(0, nh - 1));                     // the rosettes stay a solo gift: fainter in a crowd
    U.cells.value = (inCrown || arrive < 1 || leave > 0 || pEnv > 0) ? 1 : 0;
    U.front.value = (PER / 2 + 0.4) * smoother((cT - 1.2) / 3.8);
    U.head.value = ss(0.0, 1.0, cT) * (1 - ss(4.8, 5.6, cT));
    U.flash.value = ss(4.8, 5.2, cT) * (1 - ss(5.2, 8.5, cT));
    U.ring.value = 0.7 * ss(1.0, 1.4, cT) * (1 - ss(5.6, 9, cT));
    U.open.value = 1.1 * smoother((cT - 4.5) / 8.5);
    U.swell.value = ss(4.5, 16, cT) * (1 - 0.9 * ss(20.2, 24.5, cT));
    U.fill.value = ss(9, 15, cT) * (1 - 0.85 * ss(20.2, 24.5, cT));               // the first time the room fills with light
    U.rain.value = inCrown ? ss(6, 9, cT) * (1 - ss(20.2, 23.5, cT)) : 0;
    U.hold.value = ss(16.5, 18.5, cT) * (1 - ss(20.0, 20.6, cT));
    U.respawn.value = cT < 17 ? 1 : 0;

    // ---- the plate's physics
    c = Math.min(8, Math.max(1.5, num('speed', 3.6)));
    const ring = Math.min(8, Math.max(0.5, num('ring', 3)));
    gam = 2 / ring * (1 + 0.9 * Rs); gam += (2 / 1.4 - gam) * 0.6 * bloomEnv;
    const ceil = 2.2 + (HG + 0.5 - 2.2) * (Ve * Ve * (3 - 2 * Ve));
    const ceilC = inCrown ? HG + 0.6 : ceil;
    const order = clamp01((Rs - 0.25) / 0.75);
    const modeCap = 0.05 + 1.3 * (0.3 * order ** 1.2 + 0.34 * bloomEnv);
    for (let i = 0; i < MODES.length; i++) {
      const M = MODES[i], bm = i >= ORDER.length;
      const target = bm ? 0.12 * bloomEnv : 0.3 * order ** 1.2 + 0.34 * bloomEnv;
      MA[i].set(M.kx, M.ky, target * Math.max(gam, 0.25) * c * M.k, c * M.k);
      MB[i].set(M.px, (M.pt + c * M.k * modeT) % (2 * Math.PI * 1000), 0, 0);
    }
    modeT += dt * (1 - freeze);
    U.c2.value = c * c / (DX * DX); U.gam.value = gam; U.clip.value = Math.min(2, Math.max(0.1, num('clip', 0.6)));
    U.ceil.value = ceilC; U.modeCap.value = modeCap; U.nH.value = nh; U.nI.value = nI; U.nM.value = MODES.length;
    U.iw.value = 1 / lockW;
    // the resonating room stands still in its figure: the live phase fades out and the field is averaged over ~0.12 s (rings stay crisp
    // at low resonance, where nothing oscillates in place)
    U.still.value = Math.min(1, 0.7 + 0.3 * Ve);
    U.rmsK.value = clamp01(Math.max(bloomEnv * 1.5, (Ve - 0.5) * 2));
    U.derA.value = 1 - Math.exp(-dt / Math.max(0.004, num('smooth', 0.12) * Ve));
    const sub = Math.max(1, Math.ceil(c * dt / (0.5 * DX))), dts = dt / sub * (1 - freeze);
    U.dt.value = dts; U.eavg.value = 1 - Math.exp(-dts / 0.35);
    const r = room.renderer;
    if (!cleared) { cleared = true; }
    for (let i = 0; i < sub; i++) {
      U.tau.value = i * dts; U.kick.value = i === 0 ? 1 : 0;
      simTex.value = sim[sc].texture; r.setRenderTarget(sim[1 - sc]); simQuad.render(r); sc = 1 - sc;
    }
    U.kick.value = 0; U.lineK.value = 0;
    derTex.value = sim[sc].texture; r.setRenderTarget(derB); derQuad.render(r);
    r.setRenderTarget(der); copyQuad.render(r);
    r.setRenderTarget(null);

    // ---- look
    U.time.value = time % 3000; U.frame.value = frame % 997; U.Ve.value = Ve; U.bloom.value = bloomEnv;
    U.gain.value = Math.max(0, num('glow', 1)) * (1 + 0.25 * Ve + 0.4 * bloomEnv) * (inCrown ? 1 + 0.5 * U.swell.value : 1);
    U.stepL.value = (0.013 + 0.014 * Ve + 0.025 * bloomEnv) / Math.min(3, Math.max(0.3, num('lines', 1)));
    U.lineW.value = 0.0045 * K[0] * Math.sqrt(Math.max(1, 0.0041 / pxM) * 1) * 1.15;
    U.sand.value = 1.4 * bloomEnv + 0.5 * order * order;
    U.bandK.value = Math.min(1, (ss(0.8, 1.0, Rs) * 0.8 + 0.4 * bloomEnv) * Math.max(0, num('bands', 1))) * (1 - U.peakEnv.value);   // no bands under the peak
    U.relief.value = Math.max(0, num('relief', 0.35));
    U.nHU.value = nh;
    U.arrive.value = arrive; U.leave.value = leave; U.freeze.value = freeze;
    U.sandAmt.value = Math.min(1, Math.max(0, num('sand', 1)));
    U.sandGlow.value = Math.max(0, num('sandGlow', 1)) * (1 + 0.5 * bloomEnv) * (GL ? 1.4 : 1) * U.duck.value;
    r.compute(sandCompute);
  }

  return {
    object,
    update,
    get resonance() { return Rs; },
    get bloom() { return bloomEnv; },
    setParams() { /* read live */ },
    dispose() {
      for (const t of [...sim, der, derB]) t.dispose();
      plateMat.dispose(); sm.dispose(); shM.dispose(); shG.dispose(); simMat.dispose(); derMat.dispose();
      object.traverse((o) => { if (o.isMesh && o.geometry !== shG) o.geometry.dispose(); });
      for (const b of [bSeed, bS, bX, bP, bC]) b.value?.dispose?.();
    },
  };
}
