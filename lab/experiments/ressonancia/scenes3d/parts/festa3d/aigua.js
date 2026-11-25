// Ressonància — festa3d › «aigua» (T-068 v2 → T-071 LIQ «agua brillante»): la ressonància = THE WALLS ARE WATER.
// Vicente 25-11: «más elegante y 3D, como resonancias y vibración de agua… algo bien fluido y 3D» (refs 05 / 06: few wide glossy
// concentric rings, rounded crests, big soft silver / lavender highlights sliding over them) · «que el muro sea de agua, y los relieves y
// texturas sean 3D con profundidad» · «más que gotas, que las manos e interactividad del público causen un movimiento de ondas en el agua».
// (The T-068 v2 pool in perspective is in aigua.T071.js.bak.)
//
// The surface: each wall is a vertical sheet of glossy liquid ~0.2 m behind the wall plane (the room box scaled about the eye by K, so
// every point sits exactly behind the wall point it is seen through: a hand at (x, y) touches the water THERE, 1:1), continuous round
// the four walls: one field on perimeter s × height y, periodic in s (no seam anywhere). Near each corner (≤ 0.6 m) the surface's normal
// turns smoothly from the wall's to the radial one, so the two walls' liquid meets in one rounded, seamless fold.
// The solver: h_tt = c² ∇²h − γ h_t (9-point Laplacian, ping-pong float targets, 40 cells/m, c 0.9 m/s, absorbing floor and ceiling).
//   The relief is REAL: the sheet is displaced along its normal (≤ ~7 cm, soft-clipped: rounded crests, never spikes), and the normals come
//   from a cubic B-spline read of the slope field (C² smooth: no facets, no stair-steps).
// The hands MOVE the water (not drops): a landing is a soft push (a wide dimple that opens into 2–3 long rings) · a hand that moves pushes a
//   WAKE — a bow wave in front, a trough behind, trailing V waves — driven along its path every frame, ∝ its speed (capped 1.2 m/s) · a
//   resting hand is a gentle 2.2 Hz source (λ ≈ 40 cm) · several people: their wakes and rings run round the room and interfere. A small jet
//   (a column + a droplet out of the wall, 0.5 s) is only an accent, at most one every 2 s. The hand's soft dot on the wall.
// The look per pixel: Fresnel (F0 0.12, stylised glossy liquid; strong where the walls are seen obliquely and on tilted crests) × a soft
//   STUDIO behind the viewer (a gradient sky, eight large soft panels lavender / silver / ice-blue at different heights, a soft ceiling
//   light, a dim floor) — the reflections flow and bend over every ring — + the DEPTH inside: the eye ray refracts (IOR 1.33) down to a bed
//   0.55 m behind the surface, lit by soft caustics (from the field's curvature) and two slow layers of deep light, under a violet-indigo
//   body. No grid, no lines.
// Resonance = GOLD LIGHT, never lines: a warm-gold panel in the studio that only resonant crests reflect — standing rings round held hands
//   with R (cell 42 → 32 cm, ≤ 1.2 cm, 2 Hz), crests between two near hands (< 1.8 m), the bloom's mode, the echo's collision.
// R (state.resonance): travelling waves damped (−50 % at R = 1), standing rings rise · echo (state.fronts): two packets of 3 crests (λ 45 cm)
//   run along the walls both ways from the hand and collide at the opposite wall (≤ 2 people: right round, home) with a 0.3 s gold flash ·
//   call (state.call): tok-tok-TOK = straight vertical fronts, λ 60 cm at 3 m/s from the group's centre; two cover a wall, the TOK the room,
//   twice as high · bloom: the whole room enters ONE mode in 0.8 s (concentric rings round each wall's centre at 1.5 m, blended across the
//   corners), 3 cm, every crest gold; holds (±5 %), breaks into rings in 1.5 s.
// 0 hands: a slow swell (±5 mm) and one faint push a wall every 5–7 s. Cost: the solver (1103 × 150 texels, 2 sub-steps) + one mesh per
// wall + ≤ 8 jet instances; no compute, nothing allocated per frame.
const MAXH = 16, MAXI = 16, MAXE = 4, MAXC = 4, MAXJ = 4;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));

export function createAigua({ THREE, TSL, room, params, fx }) {
  const P = params || {};
  const num = (k, d) => { const v = Number(P[k]); return Number.isFinite(v) ? v : d; };
  const { Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, If, Loop, sin, cos, exp, mix, clamp, smoothstep,
    max, abs, sqrt, floor, fract, pow, dot, length, normalize, reflect, refract, cross, fwidth, texture, uv, tanh, sign, step } = TSL;
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const EX = eye.x, EY = eye.y, EZ = eye.z, EYE = vec3(EX, EY, EZ);
  const object = new THREE.Group(); object.name = 'festa3d:aigua';

  // ------------------------------------------------------------------ the room → the field (perimeter s × height y, metres)
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const HG = Math.max(...walls.map((w) => w.height));
  const CPM = 56, GH = Math.round(HG * CPM), DX = HG / GH, GW = Math.round(PER / DX), TX = 1 / GW, TY = 1 / GH;
  const CW = 0.9, HOLD_HZ = 1.6, KNEE = 0.035, BEDD = 0.55;
  const dW = walls.map((w) => Math.max(1, -new THREE.Vector3().subVectors(w.pa, eye).dot(w.normal)));
  const dMin = Math.min(...dW), K = (dMin + num('waterDepth', 0.2)) / dMin;     // ONE scale about the eye: the box stays a box (corners meet)
  const mkRT = (type, filter) => {
    const rt = new THREE.RenderTarget(GW, GH, { type, depthBuffer: false, minFilter: filter, magFilter: filter, generateMipmaps: false });
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping; return rt;
  };
  const sim = [mkRT(THREE.FloatType, THREE.NearestFilter), mkRT(THREE.FloatType, THREE.NearestFilter)];
  const der = mkRT(THREE.HalfFloatType, THREE.LinearFilter);
  let sc = 0;

  const U = {
    time: uniform(0), tau: uniform(0), dt: uniform(0), gam: uniform(0.5), kick: uniform(0), nH: uniform(0, 'int'), nI: uniform(0, 'int'),
    nE: uniform(0, 'int'), nC: uniform(0, 'int'), R: uniform(0), fA: uniform(0), fCell: uniform(0.42),
    bA: uniform(0), vis: uniform(1), arrive: uniform(1), leave: uniform(0), breath: uniform(1), glow: uniform(1), wake: uniform(1),
  };
  const v4 = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(new THREE.Vector4()); return a; };
  // HA[i] = (s, y, amplitude (resting source), phase) · HB[i] = (vs, vy (m/s, smoothed), speed, 0) · IMP[i] = (s, y, amplitude, radius)
  // EC[i] = (s0, y0, run (m), alpha) echo pairs · EC2[i] = (flash 0..1, …) · CF[i] = (s0, 0, run (m), max run (m)) · CF2[i] = (amp, …)
  const HA = v4(MAXH), HB = v4(MAXH), IMP = v4(MAXI), EC = v4(MAXE), EC2 = v4(MAXE), CF = v4(MAXC), CF2 = v4(MAXC);
  const uHA = uniformArray(HA, 'vec4'), uHB = uniformArray(HB, 'vec4'), uImp = uniformArray(IMP, 'vec4'), uEC = uniformArray(EC, 'vec4'), uEC2 = uniformArray(EC2, 'vec4');
  const uCF = uniformArray(CF, 'vec4'), uCF2 = uniformArray(CF2, 'vec4');
  const TAU = 2 * Math.PI;
  const wrapd = (d) => d.sub(floor(d.div(PER).add(0.5)).mul(PER));        // a difference in s, the short way round
  const wrapS = (s) => s.sub(floor(s.div(PER)).mul(PER));
  const fUV = (s, y) => vec2(wrapS(s).div(PER), clamp(y.div(HG), 0.002, 0.998));

  // ---- the wave equation (ping-pong)
  const simTex = texture(sim[0].texture);
  const simMat = new THREE.NodeMaterial(); simMat.depthTest = false; simMat.depthWrite = false;
  simMat.fragmentNode = Fn(() => {
    const q = uv(), at = (i, j) => simTex.sample(q.add(vec2(i * TX, j * TY)));
    const s = simTex.sample(q), h0 = s.x;
    const L = at(-1, 0), Rr = at(1, 0), Uu = at(0, 1), D = at(0, -1), ul = at(-1, 1), ur = at(1, 1), dl = at(-1, -1), dr = at(1, -1);
    const lap = L.x.add(Rr.x).add(Uu.x).add(D.x).mul(4).add(ul.x.add(ur.x).add(dl.x).add(dr.x)).sub(h0.mul(20)).div(6);
    const p = q.mul(vec2(PER, HG));
    const acc = lap.mul(CW * CW / (DX * DX)).toVar();
    // the hands IN the water: a resting hand = a gentle source; a moving hand = a wake (a dipole along its velocity: bow wave in front,
    // trough behind) and a pressure dimple ∝ speed. σ 9 cm.
    Loop(U.nH, ({ i }) => {
      const A = uHA.element(i), B = uHB.element(i), d = vec2(wrapd(p.x.sub(A.x)), p.y.sub(A.y)), r2 = dot(d, d);
      If(r2.lessThan(0.16), () => {
        const g = exp(r2.negate().div(0.0036)), gw = exp(r2.negate().div(0.0081));    // the resting source σ 6 cm; the wake σ 9 cm
        acc.addAssign(g.mul(A.z.mul(sin(A.w.add(U.tau.mul(TAU * HOLD_HZ))))).add(gw.mul(dot(d, B.xy).mul(260).sub(B.z.mul(9))).mul(U.wake)));
      });
    });
    const sponge = smoothstep(HG - 0.35, HG, p.y).mul(5).add(smoothstep(0.3, 0.0, p.y).mul(5));
    const v = s.y.add(U.dt.mul(acc.sub(U.gam.add(sponge).mul(s.y)))).toVar();
    If(U.kick.greaterThan(0.5), () => {             // a landing: a soft push (a wide dimple with a gentle rim), not a drop's packet
      Loop(U.nI, ({ i }) => {
        const I = uImp.element(i), d = vec2(wrapd(p.x.sub(I.x)), p.y.sub(I.y)), r2 = dot(d, d), w2 = I.w.mul(I.w);
        If(r2.lessThan(w2.mul(12)), () => { v.subAssign(I.z.mul(exp(r2.negate().div(w2)).sub(exp(r2.negate().div(w2.mul(3))).mul(0.3)))); });
      });
    });
    const h = h0.add(U.dt.mul(v)).toVar();
    const ah = abs(h);
    If(ah.greaterThan(KNEE), () => { h.assign(sign(h).mul(tanh(ah.sub(KNEE).div(KNEE)).mul(KNEE).add(KNEE))); });   // soft clip ≤ 7 cm: rounded
    return vec4(h, v, 0, 1);
  })();
  const simQuad = new THREE.QuadMesh(simMat);
  // ---- derived: (h, ∂h/∂s, ∂h/∂y, ∇²h) from a lightly smoothed height (3 × 3 binomial), filterable
  const derTex = texture(sim[0].texture);
  const derMat = new THREE.NodeMaterial(); derMat.depthTest = false; derMat.depthWrite = false;
  derMat.fragmentNode = Fn(() => {
    const q = uv(), H = (i, j) => derTex.sample(q.add(vec2(i * TX, j * TY))).x;
    const B = (i, j) => H(i, j).mul(4).add(H(i - 1, j).add(H(i + 1, j)).add(H(i, j - 1)).add(H(i, j + 1)).mul(2))
      .add(H(i - 1, j - 1).add(H(i + 1, j - 1)).add(H(i - 1, j + 1)).add(H(i + 1, j + 1))).div(16);
    const h0 = B(0, 0), l = B(-1, 0), rr = B(1, 0), u = B(0, 1), d = B(0, -1);
    return vec4(h0, rr.sub(l).div(2 * DX), u.sub(d).div(2 * DX), l.add(rr).add(u).add(d).sub(h0.mul(4)).div(DX * DX));
  })();
  const derQuad = new THREE.QuadMesh(derMat);
  const field = texture(der.texture);
  const SZ = vec2(GW, GH);
  const fieldC = (q) => {                            // a cubic B-spline read (4 bilinear taps): C² smooth heights and slopes
    const st = q.mul(SZ).sub(0.5), i = floor(st), f = st.sub(i), f2 = f.mul(f), f3 = f2.mul(f);
    const w0 = f3.negate().add(f2.mul(3)).sub(f.mul(3)).add(1).div(6), w1 = f3.mul(3).sub(f2.mul(6)).add(4).div(6);
    const w2 = f3.mul(-3).add(f2.mul(3)).add(f.mul(3)).add(1).div(6), w3 = f3.div(6);
    const g0 = w0.add(w1), g1 = w2.add(w3);
    const p0 = i.add(w1.div(g0)).sub(0.5).div(SZ), p1 = i.add(w3.div(g1)).add(1.5).div(SZ);
    const a = field.sample(vec2(p0.x, p0.y)).level(0), b = field.sample(vec2(p1.x, p0.y)).level(0);
    const c = field.sample(vec2(p0.x, p1.y)).level(0), d = field.sample(vec2(p1.x, p1.y)).level(0);
    return mix(mix(a, b, g1.x), mix(c, d, g1.x), g1.y);
  };

  // ------------------------------------------------------------------ the analytic layers (s, y in metres)
  const faraday = (s, y) => {                        // standing rings round each held hand, interfering between people → (height, pattern, presence)
    const S = float(0).toVar(), wsum = float(0).toVar();
    Loop(U.nH, ({ i }) => {
      const A = uHA.element(i), dx = wrapd(s.sub(A.x)), dy = y.sub(A.y), d = sqrt(dx.mul(dx).add(dy.mul(dy))), e = exp(d.mul(d).negate().div(1.2));
      S.addAssign(cos(d.mul(TAU).div(U.fCell)).mul(e)); wsum.addAssign(e);
    });
    const Sn = S.div(wsum.max(1).sqrt());
    return vec3(Sn.mul(U.fA).mul(cos(U.time.mul(TAU * 2.0)).mul(0.35).add(0.65)), Sn, smoothstep(0.05, 0.4, wsum));
  };
  const WC = walls.map((w, i) => cum[i] + w.width / 2), KB = TAU / 0.45;
  const bloomM = (s, y) => {                         // one mode: concentric rings round each wall's centre (1.5 m), blended at the corners
    let S = float(0), W = float(0);
    for (const c of WC) { const dx = wrapd(s.sub(c)), dy = y.sub(1.5), d = sqrt(dx.mul(dx).add(dy.mul(dy))), e = exp(dx.mul(dx).negate().div(4.0)); S = S.add(cos(d.mul(KB)).mul(e)); W = W.add(e); }
    const Sn = S.div(W);
    return vec2(Sn.mul(U.bA), Sn);
  };
  const packets = (s, y) => {                        // echo packets and call fronts (heights) + the echo's gold flash
    const hh = float(0).toVar(), fl = float(0).toVar();
    Loop(U.nE, ({ i }) => {
      const E = uEC.element(i), E2 = uEC2.element(i);
      const vert = exp(y.sub(E.y).mul(y.sub(E.y)).negate().div(0.5));
      for (const sg of [1, -1]) {
        const a = wrapd(s.sub(E.x.add(E.z.mul(sg))));
        hh.addAssign(exp(a.mul(a).negate().div(0.2)).mul(cos(a.mul(TAU / 0.45))).mul(vert).mul(E.w).mul(0.02));
      }
      const af = wrapd(s.sub(E.x.add(E.z)));
      fl.addAssign(exp(af.mul(af).negate().div(0.4)).mul(vert).mul(E2.x));
    });
    Loop(U.nC, ({ i }) => {
      const C = uCF.element(i), C2 = uCF2.element(i), ds = wrapd(s.sub(C.x));
      for (const sg of [1, -1]) {
        const a = ds.mul(sg).sub(C.z);                                       // signed distance (m) behind the front
        hh.addAssign(exp(a.mul(a).negate().div(0.25)).mul(cos(a.mul(TAU / 0.6))).mul(C2.x).mul(step(abs(ds), C.w)));
      }
    });
    return vec2(hh, fl);
  };
  const KS1 = TAU * Math.round(PER / 2.3) / PER, KS2 = TAU * Math.round(PER / 1.7) / PER;   // periodic round the room
  const breathe = (s, y) => sin(s.mul(KS1).add(y.mul(1.1)).add(U.time.mul(0.29))).mul(sin(s.mul(KS2).sub(y.mul(0.8)).sub(U.time.mul(0.21)))).mul(0.005).mul(U.breath);
  // long swells that run along the walls (both ways, λ 1.4–2.3 m, ~1 cm): the water is never still
  const KW1 = TAU * Math.round(PER / 1.45) / PER, KW2 = TAU * Math.round(PER / 2.3) / PER;
  const KW3 = TAU * Math.round(PER / 0.95) / PER;
  const swell = (s, y) => sin(s.mul(KW1).sub(U.time.mul(KW1 * 0.55)).add(sin(y.mul(0.9).add(U.time.mul(0.13))).mul(1.2))).mul(0.011)
    .add(sin(s.mul(KW2).add(U.time.mul(KW2 * 0.4)).add(y.mul(0.6))).mul(0.009))
    .add(sin(s.mul(KW3).sub(U.time.mul(KW3 * 0.32)).add(y.mul(2.3))).mul(0.0035)).mul(smoothstep(0.0, 0.6, y)).mul(U.breath);
  const hAn = (s, y) => faraday(s, y).x.add(bloomM(s, y).x).add(packets(s, y).x).add(breathe(s, y)).add(swell(s, y));

  // ------------------------------------------------------------------ the studio the water reflects (behind / above / below the viewer)
  const SIL = vec3(0.80, 0.86, 0.98), LAV = vec3(0.62, 0.52, 1.0), ICE = vec3(0.55, 0.75, 1.0), GOLD = vec3(0.807, 0.479, 0.102);   // GOLD = #E8B85A (linear)
  // T-071b: every light has a HOT CORE (near-white, crisp edge) inside a soft falloff; the band a flat wall reflects is dark ink-blue,
  // so troughs read dark and crests catch thin bright streaks (refs 05 / 06). Effective roughness ~0.05: edges of ~1–2°.
  const studio = (Rd) => {
    const el = Rd.y, az = TSL.atan(Rd.z, Rd.x);
    const c0 = mix(mix(vec3(0.006, 0.007, 0.024), vec3(0.026, 0.023, 0.068), smoothstep(-0.6, 0.0, el)), vec3(0.011, 0.012, 0.038), smoothstep(0.0, 0.55, el))
      .add(vec3(0.022, 0.019, 0.055).mul(exp(el.mul(el).negate().div(0.01))));                                      // ink floor → horizon → ink
    // tall panels in the flat band: a soft falloff + a narrow hot core (the still water shows them as calm columns of light)
    const a = az.div(TAU / 8), id = floor(a.add(0.5)), sec = a.sub(id);
    const h1 = fract(sin(id.mul(12.9898)).mul(43758.55)), h2 = fract(sin(id.mul(78.233)).mul(24634.63));
    const tint = mix(mix(LAV, SIL, fract(id.mul(0.5)).mul(2)), ICE, step(0.7, h2).mul(0.6));
    const ey = abs(el.sub(h2.mul(0.2).sub(0.05)));
    const cw = h1.mul(0.05).add(0.06), midS = float(1).sub(smoothstep(cw, cw.add(0.14), abs(sec))).mul(float(1).sub(smoothstep(0.14, 0.32, ey)));
    const midC = float(1).sub(smoothstep(cw.mul(0.8), cw, abs(sec))).mul(float(1).sub(smoothstep(0.16, 0.19, ey)));
    // softboxes overhead (only tilted crests reach them): crisp near-white cores in a soft glow
    const a2 = az.div(TAU / 6).add(0.25), id2 = floor(a2.add(0.5)), sec2 = a2.sub(id2), h3 = fract(sin(id2.mul(39.17)).mul(15731.7));
    const hw = h3.mul(0.1).add(0.14);
    const boxS = float(1).sub(smoothstep(hw, hw.add(0.25), abs(sec2))).mul(smoothstep(0.36, 0.52, el)).mul(float(1).sub(smoothstep(0.9, 0.99, el)));
    const boxC = float(1).sub(smoothstep(hw.mul(0.85), hw, abs(sec2))).mul(smoothstep(0.54, 0.565, el)).mul(float(1).sub(smoothstep(0.80, 0.825, el)));
    const tint2 = mix(SIL, mix(LAV, ICE, h3), h3.mul(0.5));
    // two thin hot rings of light (above and below): the long thin streaks that ride the crests
    const ringU = exp(el.sub(0.64).mul(el.sub(0.64)).negate().div(0.0005)).mul(sin(az.mul(5).add(0.4)).mul(0.35).add(0.65));
    const ringD = exp(el.add(0.6).mul(el.add(0.6)).negate().div(0.0008)).mul(sin(az.mul(3).add(1.1)).mul(0.3).add(0.7));
    const strip = smoothstep(-0.36, -0.52, el).mul(float(1).sub(smoothstep(-0.72, -0.86, el)));
    return c0.add(tint.mul(midS.mul(0.10).add(midC.mul(0.16)).mul(h1.mul(0.4).add(0.8))))
      .add(tint2.mul(boxS.mul(0.45).add(boxC.mul(2.4)).mul(h3.mul(0.4).add(0.8)).mul(U.glow)))
      .add(SIL.mul(ringU.mul(2.6))).add(mix(LAV, ICE, 0.5).mul(ringD.mul(1.6).add(strip.mul(0.18))));
  };
  // the warm-gold panel, lit only by resonance: a hot thin core and a soft glow, between the horizon and the softboxes
  const goldL = (Rd) => exp(Rd.y.sub(0.46).mul(Rd.y.sub(0.46)).negate().div(0.0012)).mul(3.0).add(smoothstep(0.24, 0.38, Rd.y).mul(float(1).sub(smoothstep(0.52, 0.62, Rd.y))).mul(0.35));

  // ------------------------------------------------------------------ the water (one mesh per wall, displaced along its normal)
  const alphaN = () => U.vis.mul(float(1).sub(smoothstep(0.0, 0.4, U.leave))).mul(smoothstep(0.0, 0.6, U.arrive));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide });
  const aF = attribute('aF', 'vec2'), aN = attribute('aN', 'vec3'), aW = attribute('aW', 'vec3');
  const reliefK = num('relief', 1.0);
  m.positionNode = Fn(() => {
    const d = field.sample(fUV(aF.x, aF.y)).level(0).x.add(hAn(aF.x, aF.y));
    return TSL.positionLocal.add(aN.mul(d.mul(reliefK)));
  })();
  const vF = varying(aF), vN = varying(aN), vW = varying(aW);
  m.colorNode = Fn(() => {
    const s = vF.x, y = vF.y, Nb = normalize(vN), Tb = normalize(cross(vec3(0, 1, 0), Nb)), Bb = vec3(0, 1, 0);
    const F = fieldC(fUV(s, y));
    const e = 0.02, hs1 = hAn(s.add(e), y), hs0 = hAn(s.sub(e), y), hy1 = hAn(s, y.add(e)), hy0 = hAn(s, y.sub(e));
    const gx = F.y.add(hs1.sub(hs0).div(2 * e)), gy = F.z.add(hy1.sub(hy0).div(2 * e));
    const n = normalize(Nb.sub(Tb.mul(gx.mul(reliefK))).sub(Bb.mul(gy.mul(reliefK))));
    const Pw = TSL.positionWorld, V = normalize(Pw.sub(EYE));
    // Fresnel from the WALL's own normal (+ the slopes): the corner, which faces the eye, is no darker than the wall beside it
    const ng = normalize(normalize(vW).sub(Tb.mul(gx.mul(reliefK))).sub(Bb.mul(gy.mul(reliefK))));
    const cosT = clamp(dot(ng, V.negate()), 0, 1);
    const fr = float(0.10).add(pow(float(1).sub(cosT), 2.5).mul(0.9));
    const Rf = reflect(V, n);
    const hT = F.x.add(hAn(s, y));
    // resonance → the gold panel lights up for these crests
    const Fd = faraday(s, y), Bm = bloomM(s, y), Pk = packets(s, y);
    const g1 = float(0).toVar(), g2 = float(0).toVar();
    Loop(U.nH, ({ i }) => { const A = uHA.element(i), dx = wrapd(s.sub(A.x)), dy = y.sub(A.y), g = exp(dx.mul(dx).add(dy.mul(dy)).negate().div(0.8)); If(g.greaterThan(g1), () => { g2.assign(g1); g1.assign(g); }).ElseIf(g.greaterThan(g2), () => { g2.assign(g); }); });
    const crestUp = smoothstep(0.0, 0.01, hT);
    const res = max(max(Fd.z.mul(smoothstep(0.2, 1.0, U.R)), smoothstep(0.15, 0.6, sqrt(g1.mul(g2))).mul(float(1).sub(smoothstep(0.8, 0.98, g1))).mul(0.6)),
      max(smoothstep(0.0, 0.02, U.bA).mul(smoothstep(-0.2, 0.6, Bm.y)), Pk.y.mul(1.4)));
    const refl = studio(Rf).add(GOLD.mul(goldL(Rf).mul(res)));
    const reflS = refl.mul(2.0).div(refl.mul(0.2).add(1));            // a gentle shoulder: hot cores stay hot, never clipped
    // the depth inside: refract to the bed (0.55 m behind), soft caustics from the curvature, two slow deep layers, the indigo body
    const Tr = refract(V, n, 1 / 1.33), tb = float(BEDD).div(dot(Tr, Nb.negate()).max(0.25)), dl = Tr.mul(tb);
    const sb = s.add(dot(dl, Tb)), yb = y.add(dl.y);
    const Fb = field.sample(fUV(sb, yb)).level(0);
    const caus = pow(clamp(float(1).div(float(1).add(Fb.w.mul(0.03)).max(0.3)), 0, 2.5), 2);
    const deep1 = sin(sb.mul(TAU * Math.round(PER / 6) / PER).add(yb.mul(0.7)).add(U.time.mul(0.07))).mul(sin(sb.mul(TAU * Math.round(PER / 4.5) / PER).sub(yb.mul(0.5)).sub(U.time.mul(0.05)))).mul(0.5).add(0.5);
    const deep2 = sin(sb.mul(TAU * Math.round(PER / 3.2) / PER).sub(yb.mul(1.2)).add(U.time.mul(0.11))).mul(0.5).add(0.5);
    const bed = vec3(0.30, 0.30, 0.62).mul(caus.mul(0.045)).add(vec3(0.016, 0.014, 0.050).mul(deep1)).add(vec3(0.006, 0.010, 0.026).mul(deep2.mul(deep1)))
      .mul(smoothstep(-0.2, 1.8, yb).mul(0.5).add(0.6));
    const crest = smoothstep(0.0, 1.0, F.w.negate().mul(0.03)).add(crestUp.mul(0.5));
    const body = mix(vec3(0.008, 0.008, 0.028), bed, 0.8).mul(1.4).add(vec3(0.014, 0.012, 0.055).mul(crest));
    const col = body.mul(float(1).sub(fr)).add(reflS.mul(fr));
    return vec4(col, alphaN());
  })();
  m.fog = false;
  const _v = new THREE.Vector3(), _r = new THREE.Vector3();
  walls.forEach((w, wi) => {
    const nx = Math.max(60, Math.round(w.width / 0.025)), ny = Math.max(40, Math.round(w.height / 0.025));
    const pos = [], af = [], an = [], aw = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = -0.02 + 1.04 * (j / ny);
      room.wallPoint(wi, u, v, _v); _v.sub(eye).multiplyScalar(K).add(eye);
      pos.push(_v.x, _v.y, _v.z);
      af.push(cum[wi] + u * w.width, v * w.height);
      // the normal: the wall's, turning to the radial one (towards the eye's axis) within 0.6 m of a corner: one seamless fold
      const dc = Math.min(u, 1 - u) * w.width, k = 1 - ss(0, 1.4, dc);
      _r.set(EX - _v.x, 0, EZ - _v.z).normalize();
      _r.lerp(w.normal, 1 - k).normalize(); an.push(_r.x, _r.y, _r.z); aw.push(w.normal.x, w.normal.y, w.normal.z);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(af, 2));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(an, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 3));
    g.setIndex(idx); g.computeBoundingSphere(); g.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; object.add(mesh);
  });
  // ---- the jets (a small accent): a column and a droplet out of the wall, the same glossy liquid
  const jets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true, depthTest: true }), MAXJ * 2);
  {
    const jm = jets.material, Pw = TSL.positionWorld, V = normalize(Pw.sub(EYE)), n = normalize(TSL.normalWorld);
    const cosT = clamp(dot(n, V.negate()), 0, 1), fr = float(0.1).add(pow(float(1).sub(cosT), 3).mul(0.9));
    const refl = studio(reflect(V, n)), reflS = refl.mul(1.4).div(refl.mul(0.2).add(1));
    jm.colorNode = vec3(0.09, 0.08, 0.24).mul(float(1).sub(fr)).add(reflS.mul(fr).mul(1.5)).add(SIL.mul(pow(float(1).sub(cosT), 2).mul(0.35))).add(SIL.mul(smoothstep(0.3, 0.8, n.y).mul(0.25)));
    jm.opacityNode = alphaN(); jm.fog = false;
    jets.frustumCulled = false; jets.renderOrder = 3; jets.count = 0; object.add(jets);
    room.reactive?.(jets);                                  // small and fast: no TAA trail
  }
  // ---- the hand nodes, on the wall (a soft Ø 3 cm dot, bone 50 %)
  const nodes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), MAXH);
  {
    const nm = nodes.material, q = uv().sub(0.5).mul(0.08), px = fwidth(q.x).max(1e-5);
    const dotA = clamp(float(0.014).sub(length(q)).div(px).add(0.5), 0, 1).add(exp(dot(q, q).negate().div(0.0004)).mul(0.25));
    nm.colorNode = vec3(0.80, 0.84, 0.94).mul(dotA.mul(0.5)).mul(U.vis); nm.fog = false;
    nodes.frustumCulled = false; nodes.renderOrder = 6; nodes.count = 0; object.add(nodes);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------------ CPU state (preallocated)
  const slot = []; for (let i = 0; i < MAXH; i++) slot.push({ stroke: null, seen: false, ph: 0, t0: 0, s: 0, y: 0, vs: 0, vy: 0, ps: 0, py: 0 });
  let time = 0, nI = 0, Rs = 0, Rown = 0, cluster = 0, clusterAt = -9, bloomT = -1, bloomD = 6, lastBloomP = false, lastClock = -1, lastCallN = -1;
  let ghostT = 2, lastJet = -9;
  const frontU = new Map(), frontA = new Map(), flashT = new Float32Array(MAXE).fill(9);
  const fr = []; for (let i = 0; i < MAXC; i++) fr.push({ on: false, s0: 0, t0: 0, max: 0, amp: 0 }); let frI = 0;
  const lastDown = []; for (let i = 0; i < 8; i++) lastDown.push({ wall: -1, s: 0, y: 0, t: -9 }); let ldI = 0;
  const jet = []; for (let i = 0; i < MAXJ; i++) jet.push({ on: false, t: 0, p: new THREE.Vector3(), n: new THREE.Vector3(), q: new THREE.Quaternion(), s: 0, y: 0, back: false }); let jI = 0;
  const sOf = (h) => cum[h.wall] + clamp01(h.u ?? 0.5) * walls[h.wall].width;
  const yOf = (h) => clamp01(h.v ?? 0.4) * walls[h.wall].height;
  const wrapP = (d) => d - PER * Math.floor(d / PER + 0.5);
  const impulse = (s, y, a, w) => { if (nI < MAXI) IMP[nI++].set(s, y, a, w); };
  function groupS() { let cx = 0, cz = 0, n = 0; for (const o of slot) if (o.stroke != null) { cx += Math.cos(o.s / PER * TAU); cz += Math.sin(o.s / PER * TAU); n++; } return n ? ((Math.atan2(cz, cx) / TAU) * PER + PER) % PER : WC[0]; }
  function startJet(d) {                              // where the hand is, on the water's surface, along the wall's normal
    const J = jet[jI++ % MAXJ], w = walls[d.wall];
    room.wallPoint(d.wall, clamp01(d.u ?? 0.5), clamp01(d.v ?? 0.4), J.p); J.p.sub(eye).multiplyScalar(K).add(eye);
    J.n.copy(w.normal).addScaledVector(_y, 0.75).normalize(); J.q.setFromUnitVectors(_y, J.n);   // out of the wall and up: it reads as a jet from the eye J.on = true; J.t = 0; J.back = false; J.s = sOf(d); J.y = yOf(d);
  }

  function update(dt, input, vis) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20); time += dt; nI = 0;
    const st = input.state, ev = input.events, hands = input.hands || [], downs = input.downs || [];
    const arrive = st ? (input.arrive ?? 1) : num('arrive', 1), leave = st ? (input.leave ?? 0) : num('leave', 0);
    // ---- R (the score's; the study: its own rule)
    let Rin;
    if (st) Rin = st.resonance || 0;
    else {
      if (downs.length) { if (time - clusterAt <= 0.5) cluster += downs.length; else { clusterAt = time; cluster = downs.length; } Rown += cluster >= 2 ? 0.2 * downs.length / Math.max(2, Math.ceil(hands.length / 1.6)) : 0.01; }
      Rown = Math.min(1.2, Math.max(0, Rown + dt * (0.004 * Math.min(12, hands.length) - 0.03))); Rin = Rown;
    }
    Rs += (clamp01(Rin + num('resonance', 0)) - Rs) * (1 - Math.exp(-dt / 1.2));
    if (ev) for (let i = 0; i < ev.length; i++) if (ev[i] === 'bloom') { bloomT = 0; bloomD = st && st.bloomDur >= 4 ? Math.min(8, st.bloomDur) : 6; }
    if (P.bloomNow === true && !lastBloomP) { bloomT = 0; bloomD = 6; } lastBloomP = P.bloomNow === true;
    let bK = 0, hold = 0;
    if (bloomT >= 0) { bloomT += dt; bK = ss(0, 0.8, bloomT) * (1 - ss(bloomD - 1.5, bloomD, bloomT)); hold = ss(0.6, 0.8, bloomT) * (1 - ss(bloomD - 1.6, bloomD - 1.4, bloomT)); if (bloomT > bloomD) bloomT = -1; }
    // ---- landings: a soft push that starts the waves (+ a small jet, at most one every 2 s)
    for (const d of downs) {
      const s = sOf(d), y = yOf(d);
      impulse(s, y, 8 * (1 - 0.6 * bK), 0.13);
      if (time - lastJet > 2) { lastJet = time; startJet(d); }
      const L = lastDown[ldI++ % 8]; L.wall = d.wall; L.s = s; L.y = y; L.t = time;
      fx?.(d.wall, d.u ?? 0.5, 0.5, 'glass', 'hit');
    }
    // ---- hands in the water: velocity from their path (smoothed), a wake ∝ speed, a gentle source when resting
    for (const o of slot) o.seen = false;
    let nH = 0, nAlive = 0;
    for (const h of hands) {
      if (h.ended) continue;
      let k = -1; for (let i = 0; i < MAXH; i++) if (slot[i].stroke === h.stroke) { k = i; break; }
      const s = sOf(h), y = yOf(h);
      if (k < 0) { for (let i = 0; i < MAXH; i++) if (slot[i].stroke == null) { k = i; break; } if (k < 0) continue; const o = slot[k]; o.stroke = h.stroke; o.t0 = time; o.ph = Math.random() * TAU; o.vs = 0; o.vy = 0; o.ps = s; o.py = y; }
      const o = slot[k]; o.seen = true; nAlive++;
      const ivs = wrapP(s - o.ps) / dt, ivy = (y - o.py) / dt; o.ps = s; o.py = y;
      const a = 1 - Math.exp(-dt / 0.12); o.vs += (Math.max(-3, Math.min(3, ivs)) - o.vs) * a; o.vy += (Math.max(-3, Math.min(3, ivy)) - o.vy) * a;
      let sp = Math.hypot(o.vs, o.vy); const cap = Math.min(1, 1.2 / Math.max(1e-6, sp)); sp = Math.min(sp, 1.2);
      o.s = s; o.y = y; o.ph = (o.ph + TAU * HOLD_HZ * dt) % (TAU * 1000);
      const rest = clamp01((time - o.t0 - 0.4) / 1.0) * (1 - ss(0.08, 0.35, sp));     // the source rings only while the hand rests
      HA[nH].set(s, y, 40 * rest * (1 - 0.8 * bK) / Math.sqrt(Math.max(1, hands.length / 3)), o.ph);
      HB[nH].set(o.vs * cap, o.vy * cap, sp, 0);
      _p.copy(h.pos).addScaledVector(h.normal || walls[h.wall].normal, 0.01); _q.setFromUnitVectors(_z, walls[h.wall].normal);
      _s.set(1, 1, 1); _m.compose(_p, _q, _s); nodes.setMatrixAt(nH, _m);
      nH++;
    }
    for (const o of slot) if (!o.seen) o.stroke = null;
    nodes.count = nH; nodes.instanceMatrix.needsUpdate = true;
    // ---- nobody: one faint push a wall every 5–7 s
    if (!nAlive && leave < 0.1) { ghostT -= dt; if (ghostT <= 0) { const w = Math.floor(Math.random() * NW); impulse(cum[w] + walls[w].width * (0.2 + 0.6 * Math.random()), 0.8 + Math.random() * 1.6, 2.5, 0.15); ghostT = (5 + Math.random() * 2) / NW; } }
    // ---- the jets: a column out of the wall (0.06 → 0.45 s) that throws a droplet; the droplet falls back in with a small ring
    let nJ = 0;
    for (const J of jet) {
      if (!J.on) continue;
      J.t += dt; const t = J.t, g = 12;
      const tc = (t - 0.06) / 0.4;
      if (tc > 0 && tc < 1) {
        const hc = 0.22 * Math.sin(Math.PI * Math.min(1, tc * 1.25)) * (1 - 0.25 * tc), rc = 0.034 * (1 - 0.4 * tc);
        if (hc > 0.004) { _p.copy(J.p).addScaledVector(J.n, hc * 0.5 - 0.006); _s.set(rc, hc * 0.5 + rc * 0.3, rc); _m.compose(_p, J.q, _s); jets.setMatrixAt(nJ++, _m); }
      }
      const td = t - 0.2, v0 = Math.sqrt(2 * g * 0.1);
      if (td > 0) {
        const hd = 0.19 + v0 * td - 0.5 * g * td * td;
        if (hd > 0) { const rd = 0.03; _p.copy(J.p).addScaledVector(J.n, hd); _s.set(rd, rd * (1 + Math.min(0.5, Math.abs(v0 - g * td) * 0.1)), rd); _m.compose(_p, J.q, _s); jets.setMatrixAt(nJ++, _m); }
        else if (!J.back) { J.back = true; impulse(J.s, J.y, 1.5, 0.06); }
      }
      if (t > 1.2) J.on = false;
    }
    jets.count = nJ; jets.instanceMatrix.needsUpdate = true;
    // ---- echo: two packets from the hand, both ways along the walls, colliding at the opposite wall (≤ 2 people: right round, home)
    let nE = 0;
    if (st && st.block === 'festa' && st.fronts) {
      const F = st.fronts;
      for (let i = F.length - 1; i >= 0 && nE < MAXE; i--) {
        const f = F[i], u = ((st.clock ?? 0) - f.at) / Math.max(0.1, f.arrive - f.at);
        let s0 = frontA.get(f.id);
        if (s0 === undefined) {
          let bs = 0, by = 1.3, bt = -9; for (const L of lastDown) if (L.wall === f.from % NW && time - L.t < 0.6 && L.t > bt) { bt = L.t; bs = L.s; by = L.y; }
          s0 = bt > -9 ? bs : WC[f.from % NW];
          if (frontA.size > 48) frontA.clear(); frontA.set(f.id, s0); frontA.set(-f.id - 1, bt > -9 ? by : 1.3);
        }
        const y0 = frontA.get(-f.id - 1) ?? 1.3;
        const pu = frontU.get(f.id) ?? -1; frontU.set(f.id, u); if (frontU.size > 48) frontU.clear();
        if (pu < 1 && u >= 1) flashT[nE] = 0;
        const al = (f.ghost ? 0.6 : 1) * smoother(u / 0.05) * (1 - smoother((u - 1) / 0.15));
        EC[nE].set(s0, y0, Math.min(1, Math.max(0, u)) * (f.to === f.from ? PER : PER / 2), al);
        EC2[nE].set(flashT[nE] < 0.3 ? Math.sin(Math.PI * flashT[nE] / 0.3) : 0, 0, 0, 0);
        nE++;
      }
    } else if (!st && num('echo', 0) > 0) {
      const u = (time % 4) / 3; if (u >= 1 && u - dt / 3 < 1) flashT[0] = 0;
      EC[0].set(WC[1 % NW], 1.3, Math.min(1, u) * PER / 2, smoother(u / 0.05) * (1 - smoother((u - 1) / 0.15)));
      EC2[0].set(flashT[0] < 0.3 ? Math.sin(Math.PI * flashT[0] / 0.3) : 0, 0, 0, 0); nE = 1;
    }
    for (let i = 0; i < MAXE; i++) flashT[i] += dt;
    // ---- the call: tok-tok-TOK → straight vertical fronts (λ 60 cm, 3 m/s) from the group's centre; 2 cover a wall, the TOK the room
    {
      let toks = false, at = 0, gap = 0.8, clock = time;
      if (st && st.block === 'festa' && st.festaStage === 'call' && st.call && st.call.n > 0) { toks = true; at = st.call.at; gap = st.call.gap || 0.8; clock = st.clock ?? time; if (st.call.n !== lastCallN) lastCallN = st.call.n; }
      else if (!st && num('call', 0) > 0) { toks = true; at = Math.floor(time / 4) * 4 + 2.4; }
      if (toks && lastClock >= 0) for (let k = 0; k < 3; k++) {
        const T = at - (2 - k) * gap;
        if (lastClock < T && clock >= T) { const F = fr[frI++ % MAXC]; F.on = true; F.s0 = groupS(); F.t0 = time; F.max = k < 2 ? 3.6 : PER / 2; F.amp = k < 2 ? 0.012 : 0.024; }
      }
      lastClock = toks ? clock : -1;
    }
    let nC = 0;
    for (const F of fr) { if (!F.on) continue; const run = 3 * (time - F.t0); if (run > F.max + 1) { F.on = false; continue; } CF[nC].set(F.s0, 0, run, F.max); CF2[nC].set(F.amp * (1 - smoother((run - F.max) / 1)), 0, 0, 0); nC++; }
    // ---- the solver
    const sub = Math.max(1, Math.ceil(CW * dt / (0.45 * DX))), dts = dt / sub * (1 - ss(0, 0.2, leave));
    U.gam.value = (0.42 + 0.4 * Rs) * (1 + 1.5 * bK);           // R damps the travelling waves (−50 % ≈ twice the damping)
    U.dt.value = dts; U.nH.value = nH; U.nI.value = nI; U.wake.value = 1 - 0.7 * bK;
    const r = room.renderer;
    for (let i = 0; i < sub; i++) {
      U.tau.value = i * dts;
      U.kick.value = i === 0 ? 1 : 0; simTex.value = sim[sc].texture; r.setRenderTarget(sim[1 - sc]); simQuad.render(r); sc = 1 - sc;
    }
    derTex.value = sim[sc].texture; r.setRenderTarget(der); derQuad.render(r); r.setRenderTarget(null);
    // ---- the standing waves
    const Rf = ss(0.25, 0.95, Rs) * (1 - bK);
    U.fA.value = 0.012 * Rf; U.fCell.value = 0.42 - 0.10 * ss(0.3, 1, Rs);
    U.bA.value = 0.03 * bK * (1 + 0.05 * hold * Math.sin(time * TAU * 2));
    U.breath.value = 1 - bK; U.glow.value = 1 + 0.25 * bK;
    U.time.value = time % 1000; U.R.value = Rs; U.vis.value = vis; U.arrive.value = arrive; U.leave.value = leave; U.nE.value = nE; U.nC.value = nC;
  }
  return {
    object, update,
    get resonance() { return Rs; }, get bloom() { return U.bA.value / 0.03; },
    get counts() { return { hands: U.nH.value, echo: U.nE.value, fronts: U.nC.value, faraday: +U.fA.value.toFixed(4), bloomA: +U.bA.value.toFixed(4), jets: jets.count }; },
    dispose() { for (const t of [...sim, der]) t.dispose(); simMat.dispose(); derMat.dispose(); object.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); },
  };
}
