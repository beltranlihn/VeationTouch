// Ressonància — part «pom3d»: IV. Pom de dalt — Valor — «the Eixample as a city drawn in circuit lines» (ARTE-2 §3, ref. 11;
// contract: ../PARTS.md; ticket: lab/estudio/tickets/T-031-3DPO-ciudad-lineas.md). The previous Pom (the night square, T-003…T-023)
// is kept whole in pom3d.ARTE2.js.bak.
//
// White line on black, gardens of gold. The room stands at the bottom of a VERTICAL CANYON: the heart of an Eixample block turned
// into a ring of surreal towers 45–78 m tall (black volumes whose edges, floors, windows and circuit traces are drawn as fine white
// lines of constant pixel width), stepping back in terraces where gardens glow gold, with garden shelves and bridges across the void.
// THE RISE: as the three lights climb, the world sinks (group `world`) and turns slowly (≤ 2°/s): the eye goes from 1.6 m to `height`
// (90 m) through the canyon and out above it, where the whole Eixample spreads in lines — octagonal blocks with their chamfers,
// courtyards of gold, the Diagonal, the black sea with lines of light, Collserola as a contour — and the sky opens.
// The height is a damped spring on the score's climb (smooth acceleration, no jumps when the light slips back).
//
// Three depths: (a) small circuit tiles floating 0.2–1 m behind the wall plane, streaming down as the room rises; (b) the canyon,
// 6–20 m beyond the walls; (c) the city, the sea and the sky (instanced blocks near, a ray-cast ground beyond: exact parallax).
//
// The climbers (dosos, acotxador, enxaneta): gold lights that climb in turn a MAST of white lines beyond each wall of the castell's
// structure (state.walls), spiralling once round it and arcing to the next (the score's order), leaving a gold thread; a beacon on the
// next; 'arrived:<n>' = a bell of light; the last raises her hand. restless = the light flickers and slips.
// Physical interaction (response in the same frame): a STILL hand makes the garden it points at bloom — the gold flowers open and
// shed petals that glide, turning, down the canyon; a MOVING (or landing) hand shakes loose line tiles that FALL with gravity,
// spinning and glinting, into the depth below. Hands also keep the stillness halo on the wall plane.
// arrive / leave: the night assembles from / breaks into shards (an icosphere round the eye carrying the city's image).
// Alone (res-3d-study, no input.state) a stand-in state comes from params: progress → climber/climb; walls; restless; arrive; leave; cycle.

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, positionWorld, positionGeometry, normalGeometry,
    cameraPosition, cameraProjectionMatrix, modelViewMatrix, mix, smoothstep, clamp, sin, cos, fract, floor, abs,
    max, min, pow, exp, length, normalize, dot, cross, mx_noise_float, If, select, step, fwidth, mod, cameraWorldMatrix,
    Discard, sqrt, atan,
  } = TSL;

  // -------------------------------------------------------------------------------------------- helpers
  function rng(s) { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const sm = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
  const TAU = Math.PI * 2;
  const walls = room.walls, NW = walls.length, EYE = room.eye.clone();
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const hash12 = (p) => { const q = fract(vec3(p.x, p.y, p.x).mul(0.1031)); const p3 = q.add(dot(q, q.yzx.add(33.33))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const hash13 = (p) => { const q = fract(p.mul(0.1031)); const p3 = q.add(dot(q, q.zyx.add(31.32))); return fract(p3.x.add(p3.y).mul(p3.z)); };
  const rotA = (v, k, a) => v.mul(cos(a)).add(cross(k, v).mul(sin(a))).add(k.mul(dot(k, v).mul(cos(a).oneMinus())));
  // an anti-aliased line of ~px pixels at distance d (fw = metres per pixel)
  const lineAA = (d, fw, px) => float(1).sub(smoothstep(fw.mul(px * 0.5), fw.mul(px * 0.5 + 1.0), d));
  // periodic lines every `per` m; fades to its mean coverage when the pattern gets finer than a few pixels (no moiré)
  const plines = (x, per, fw, px) => {
    const d = abs(fract(x.div(per).add(0.5)).sub(0.5)).mul(per);
    const ln = lineAA(d, fw, px), fade = smoothstep(per * 0.06, per * 0.25, fw);
    return mix(ln, min(fw.mul(px + 1).div(per), 0.5).mul(0.25), fade);
  };
  // circuit traces on a 2D surface: long rows/columns broken per cell, pads where they meet
  const circuit = (p, cs, fw) => {
    const g = p.div(cs), c = floor(g), f = fract(g);
    const ty = hash12(vec2(c.y, 17.0)).mul(0.6).add(0.2), tx = hash12(vec2(c.x, 41.0)).mul(0.6).add(0.2);
    const onH = step(0.38, hash12(c)), onV = step(0.62, hash12(c.add(7.3)));
    const fwc = fw.div(cs);
    const h = lineAA(abs(f.y.sub(ty)), fwc, 1.1).mul(onH), v = lineAA(abs(f.x.sub(tx)), fwc, 1.1).mul(onV);
    const pd = length(f.sub(vec2(tx, ty))), pad = lineAA(abs(pd.sub(0.05)), fwc, 1.1).mul(step(0.7, hash12(c.add(3.1)))).mul(max(onH, onV));
    const fade = smoothstep(cs * 0.04, cs * 0.18, fw);
    return mix(max(max(h, v), pad), float(0.12), fade);
  };

  // -------------------------------------------------------------------------------------------- uniforms
  const uTime = uniform(0), uA = uniform(1.6), uLift = uniform(0), uWorld = uniform(1), uShiver = uniform(0), uLeave = uniform(0);
  const uArrive = uniform(1), uStars = uniform(1), uLines = uniform(1), uGard = uniform(1), uGold = uniform(1), uQ = uniform(0);
  const uBell = uniform(0), uCalm = uniform(0), uYawCS = uniform(new THREE.Vector2(1, 0));
  const SEA = new THREE.Vector2(0.7, 0.714).normalize(), uSea = uniform(SEA);        // the sea lies towards +x+z (city frame)
  const DIAG = new THREE.Vector2(Math.cos(2.1), Math.sin(2.1)), DIAG_D = 235;        // the Diagonal: normal and offset (city frame)
  const uDiag = uniform(DIAG);
  const GOLD = vec3(1.0, 0.66, 0.28), WHITE = vec3(0.86, 0.9, 1.0);
  const PITCH = 133.3, BA = 56.5, BCUT = 98.9, BIN = 31.5, BCUTI = 52.0;            // Cerdà's block: 113 m, chamfers, courtyard
  const HAZE = vec3(0.0035, 0.0045, 0.0085);

  // -------------------------------------------------------------------------------------------- groups
  const object = new THREE.Group(); object.name = 'pom3d';
  const world = new THREE.Group(); object.add(world);             // everything that sinks
  const city = new THREE.Group(); world.add(city);                 // …and turns (the climbers' masts do not turn: they stay at their walls)
  const geos = [], mats = [];

  // THE QUIET ZONES (GUI / ARTE): at each wall's centre nothing behind the text or the button brighter than ~35 %: colDim(k) is 1
  // elsewhere and 1 − k there. The wall is the one this camera looks through (its z axis is the wall's normal).
  const colDim = (strength = 0.6) => {
    const V = positionWorld.sub(cameraPosition), camZ = cameraWorldMatrix.element(2).xyz;
    let de = float(3.5), cr = float(0), rx = float(1), rz = float(0);
    for (const w of walls) {
      const n = w.normal, dw = -((w.centre.x - EYE.x) * n.x + (w.centre.z - EYE.z) * n.z), cw = (w.centre.x - EYE.x) * w.right.x + (w.centre.z - EYE.z) * w.right.z;
      const m = step(0.999, dot(camZ, vec3(n.x, n.y, n.z)));
      de = mix(de, float(dw), m); cr = mix(cr, float(cw), m); rx = mix(rx, float(w.right.x), m); rz = mix(rz, float(w.right.z), m);
    }
    const k = dot(V, camZ).negate(), t = de.div(max(k, 0.01));
    const u = V.x.mul(rx).add(V.z.mul(rz)).mul(t).sub(cr), h = V.y.mul(t).add(cameraPosition.y);
    // two QUIET ZONES (rule of 24-11): the text ±1.6 m × 1.75–2.2 m and the button ±0.9 m × 0.9–1.6 m, soft edges of ~0.2 m
    // a soft super-gaussian lobe (no corners, it reads as light falling off, never as a plate): full over the button and the text's
    // middle, ~0.6 at the text's ends
    const gu = u.div(2.1), gh = h.sub(1.6).div(0.85);
    const inCol = exp(gu.mul(gu).mul(gu.mul(gu)).add(gh.mul(gh).mul(gh.mul(gh))).negate()).mul(step(0.0, k));
    return float(1).sub(inCol.mul(strength));
  };
  // -------------------------------------------------------------------------------------------- the dome: sky above, ground below
  // The ground is ray-cast from the eye at altitude uA, in the city's frame (the dome does not turn; the ray does): the canyon's floor
  // (a circuit board with garden beds), the Eixample's blocks (roof plane at 22 m, outlines, roof gardens), streets, courtyards of
  // gold, the Diagonal, the coast and the sea. Geometry nearer than the dome covers it where it exists.
  const blockSDF = (q, a, cut) => max(max(q.x, q.y).sub(a), q.x.add(q.y).sub(cut).mul(0.7071));
  const cellOf = (P) => floor(P.div(PITCH).add(0.5));
  const cellOpen = (cc) => {                                         // 1 = no block here (the canyon, the Diagonal, the sea)
    const c = cc.mul(PITCH);
    const centre = step(length(cc), 0.5);
    const diag = step(abs(dot(c, uDiag).sub(DIAG_D)), 70.0);
    const sea = step(560.0, dot(c, uSea));
    return max(max(centre, diag), sea);
  };
  const lightDots = (Q, spacing, prob, fp, seed) => {
    const g = Q.div(spacing), c = floor(g), f = fract(g);
    const jit = vec2(hash12(c.add(seed)), hash12(c.add(seed + 7.7))).mul(0.6).add(0.2);
    const d = length(f.sub(jit)).mul(spacing);
    const r = max(fp.mul(0.8), spacing * 0.06);
    const on = step(float(1 - prob), hash12(c.add(seed + 3.1)));
    const k = float(spacing * 0.06).div(r);
    return on.mul(k.mul(k)).mul(exp(d.mul(d).div(r.mul(r)).negate()));
  };
  const toCity = (d) => { const c = uYawCS.x, s = uYawCS.y; return vec2(d.x.mul(c).sub(d.y.mul(s)), d.x.mul(s).add(d.y.mul(c))); };
  const skyCol = Fn(([dir]) => {
    const y = dir.y, L = toCity(dir.xz);
    const g = mix(vec3(0.006, 0.008, 0.016), vec3(0.0004, 0.0006, 0.0014), pow(clamp(y, 0, 1), 0.4)).add(HAZE.mul(exp(max(y, 0).div(0.05).negate())));
    const star = (scale, th, gain) => {
      const sp = dir.mul(scale), cell = floor(sp), h = hash13(cell), f = fract(sp).sub(0.5);
      const tw = sin(uTime.mul(h.mul(2.0).add(0.5).mul(uCalm.mul(-0.7).add(1))).add(h.mul(60))).mul(0.3).add(0.7);
      return step(th, h).mul(smoothstep(0.42, 0.0, length(f))).mul(tw).mul(h.sub(th).div(1 - th).pow(3).mul(gain).add(0.12));
    };
    const s = star(240, 0.993, 2.6).add(star(480, 0.986, 0.5).mul(0.5));
    // Collserola: a contour of white line on the land side, with a few gold points; the Tibidabo's needle
    const az = normalize(L.add(vec2(0.0001, 0))), land = smoothstep(0.1, -0.35, dot(az, uSea));
    const ridge = sin(L.x.mul(3.0)).mul(0.5).add(sin(L.y.mul(5.0).add(1.3)).mul(0.3)).add(mx_noise_float(vec3(L.mul(9.0), 1.0)).mul(0.25)).mul(0.02).add(0.04).mul(land);
    const below = step(y, ridge).mul(step(-0.001, y));
    const fwy = fwidth(y).add(0.00001);
    const contour = lineAA(abs(y.sub(ridge)), fwy, 1.3).mul(land).mul(0.22).add(lineAA(abs(y.sub(ridge.mul(0.62))), fwy, 1.0).mul(land).mul(0.06));
    const mtLights = step(0.9975, hash13(floor(dir.mul(700)))).mul(below);
    const starsOn = s.mul(smoothstep(0.0, 0.1, y)).mul(uStars).mul(below.oneMinus());
    // CONSTELLATIONS drawn as circuit traces (ARTE round 2): nodes on a grid of the sky (azimuth × elevation, 48 around), each joined to
    // its right / upper neighbour by a trace, a pad (ring) and a star at each node; only above 6° and fading towards the zenith
    const azA = atan(L.y, L.x).div(TAU).mul(48.0), elv = y.div(0.13);
    const P2 = vec2(azA, elv), cc0 = floor(P2), fwc = length(fwidth(P2)).add(0.0005);
    const node = (c) => c.add(vec2(hash12(vec2(mod(c.x, 48.0), c.y)), hash12(vec2(mod(c.x, 48.0), c.y.add(17.0)))).mul(0.6).add(0.2));
    // hierarchy (ARTE): the sky in super-cells of 6 × 3; each is empty (30 %), holds a SMALL constellation in a 2 × 2 corner (40 %) or a BIG
    // one over all of it (30 %): 2–3 big ones and 6–8 small ones per wall, empty sky between; traces join only nodes of the same super-cell
    const sup = (c) => floor(vec2(mod(c.x, 48.0), c.y).div(vec2(6.0, 3.0)));
    const has = (c) => {
      const sc = sup(c), h = hash12(sc.add(vec2(11.0, 3.0))), lc = vec2(mod(c.x, 48.0), c.y).sub(sc.mul(vec2(6.0, 3.0)));
      const ox = floor(hash12(sc.add(vec2(2.0, 9.0))).mul(4.0)), oy = floor(hash12(sc.add(vec2(5.0, 1.0))).mul(1.99));
      const small = step(ox, lc.x).mul(step(lc.x, ox.add(1.0))).mul(step(oy, lc.y)).mul(step(lc.y, oy.add(1.0)));
      const area = select(h.lessThan(0.3), float(0), select(h.lessThan(0.7), small, float(1)));
      return step(0.45, hash12(vec2(mod(c.x, 48.0).add(5.0), c.y.mul(1.7)))).mul(area);
    };
    const same = (a, b) => step(length(sup(a).sub(sup(b))), 0.01);
    const segD = (p, a, b) => { const pa = p.sub(a), ba = b.sub(a), h = clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1); return length(pa.sub(ba.mul(h))); };
    const tr = float(0).toVar(), pads = float(0).toVar(), nd = float(0).toVar();
    for (const ox of [-1, 0]) for (const oy of [-1, 0]) {
      const c = cc0.add(vec2(ox, oy)), a = node(c), hA = has(c);
      const cR = c.add(vec2(1, 0)), cU = c.add(vec2(0, 1));
      const eR = hA.mul(has(cR)).mul(same(c, cR)).mul(step(0.2, hash12(c.add(vec2(3.3, 1.1))))), eU = hA.mul(has(cU)).mul(same(c, cU)).mul(step(0.45, hash12(c.add(vec2(7.7, 2.2)))));
      tr.assign(max(tr, lineAA(segD(P2, a, node(cR)), fwc, 1.5).mul(eR)));
      tr.assign(max(tr, lineAA(segD(P2, a, node(cU)), fwc, 1.5).mul(eU)));
    }
    { const a = node(cc0), hA = has(cc0), dA = length(P2.sub(a)); pads.assign(lineAA(abs(dA.sub(0.07)), fwc, 1.5).mul(hA)); nd.assign(smoothstep(fwc.mul(2.0), 0.0, dA).mul(hA)); }
    const skyK = smoothstep(0.08, 0.16, y).mul(smoothstep(0.95, 0.6, y)).mul(below.oneMinus()).mul(uStars);
    const consts = WHITE.mul(tr.mul(0.16).add(pads.mul(0.3))).add(GOLD.mul(nd.mul(1.6))).mul(skyK);
    return mix(g.add(vec3(starsOn)), HAZE.mul(0.4), below).add(WHITE.mul(contour.mul(uLines))).add(GOLD.mul(mtLights.mul(0.6))).add(consts);
  });
  const groundCol = Fn(([dir]) => {
    const ny = max(dir.y.negate(), 0.0004), L = toCity(dir.xz);
    const t = uA.div(ny), Pg = L.mul(t);
    const fp = length(fwidth(Pg)).add(0.001);
    const c = vec3(0).toVar();
    // the roofs: a plane at 22 m — a ray that meets it over a block's ring sees a roof
    const tr = max(uA.sub(22.0), 0.0).div(ny), Pr = L.mul(tr);
    const qr = abs(Pr.sub(cellOf(Pr).mul(PITCH)));
    const onRoof = step(22.5, uA).mul(step(blockSDF(qr, BA, BCUT), 0.0)).mul(step(0.0, blockSDF(qr, BIN, BCUTI))).mul(cellOpen(cellOf(Pr)).oneMinus());
    const fr = length(fwidth(Pr)).add(0.001);
    const roofLine = max(max(lineAA(abs(blockSDF(qr, BA, BCUT)), fr, 1.5), lineAA(abs(blockSDF(qr, BA - 2.2, BCUT - 4.4)), fr, 1.5).mul(0.6)), lineAA(abs(blockSDF(qr, BIN, BCUTI)), fr, 1.5).mul(0.7));   // double outline: a circuit board
    const party = plines(select(qr.x.greaterThan(qr.y), Pr.y, Pr.x), 14.0, fr, 1.0).mul(0.35);
    const roofGarden = lightDots(Pr, 3.6, 0.6, fr, 4.0).mul(2.0).add(0.01).mul(step(0.55, hash12(cellOf(Pr).add(9.1))));
    const roofC = WHITE.mul(roofLine.mul(0.42).add(party.mul(0.3)).mul(uLines)).add(vec3(0.002));
    const roofG = GOLD.mul(roofGarden.mul(1.4).add(0.03).mul(step(0.45, hash12(cellOf(Pr).add(9.1)))).mul(uGard));
    // the ground: streets, courtyards, the canyon's floor, the Diagonal, the sea
    const cc = cellOf(Pg), q = abs(Pg.sub(cc.mul(PITCH))), open = cellOpen(cc);
    const dOut = blockSDF(q, BA, BCUT), dIn = blockSDF(q, BIN, BCUTI);
    const inRing = step(dOut, 0.0).mul(step(0.0, dIn)).mul(open.oneMinus());           // a facade (the ray went between roofs)
    const inYard = step(dIn, 0.0).mul(open.oneMinus());
    const dC = length(q.sub(PITCH / 2));                                 // the chamfered crossings: a pad (ring) at each
    const streetC = WHITE.mul(lineAA(abs(dOut), fp, 1.5).mul(0.35).add(lineAA(abs(dOut.sub(3.5)), fp, 1.5).mul(0.2)).add(lineAA(abs(dC.sub(6.0)), fp, 1.5).mul(0.3)).add(lineAA(abs(dC.sub(3.0)), fp, 1.5).mul(0.15)).mul(uLines))
      ;
    const streetG = GOLD.mul(lightDots(Pg, 9.0, 0.35, fp, 2.0).mul(0.5).mul(step(0.0, dOut)));   // the plane trees' lamps along the streets
    const yardC = vec3(0.004, 0.012, 0.006).add(WHITE.mul(lineAA(abs(dIn), fp, 1.5).mul(0.3).add(circuit(Pg, 6.0, fp).mul(0.1)).mul(uLines)));
    const yardG = GOLD.mul(lightDots(Pg, 4.0, 0.7, fp, 6.0).mul(3.0).add(smoothstep(0.0, -10.0, dIn).mul(0.16)).add(0.05).mul(uGard));   // courtyards of gold
    const facC = WHITE.mul(plines(t, 3.3, fp, 1.0).mul(0.08).mul(uLines)).add(vec3(0.0015));
    // the canyon's floor (the centre block) and the Diagonal: a circuit board with garden beds
    const boardC = WHITE.mul(circuit(Pg, 1.7, fp).mul(0.22).mul(uLines));
    const boardG = GOLD.mul(lightDots(Pg, 4.0, 0.3, fp, 12.0).mul(1.2).mul(uGard));
    // the Diagonal: a THICK trace (a centre line and two pairs of rails) with gold pulses running along it
    const dd = dot(Pg, uDiag).sub(DIAG_D), alongD = dot(Pg, vec2(uDiag.y.negate(), uDiag.x)), inDiag = step(abs(dd), 34.0);
    const rails = lineAA(abs(dd), fp, 3.0).mul(0.6).add(lineAA(abs(abs(dd).sub(5.0)), fp, 2.0).mul(0.4)).add(lineAA(abs(abs(dd).sub(11.0)), fp, 1.5).mul(0.25));
    const ph = fract(alongD.add(uTime.mul(28.0)).div(160.0)).mul(160.0), dpulse = exp(ph.mul(-0.06)).mul(lineAA(abs(dd), fp, 4.0).add(lineAA(abs(abs(dd).sub(5.0)), fp, 2.0).mul(0.5)));
    const diagC = WHITE.mul(rails.mul(uLines)), diagG = GOLD.mul(dpulse.mul(2.4).mul(uGold));
    const along = dot(Pg, uSea), coast = mx_noise_float(vec3(Pg.mul(0.004), 2.0)).mul(40).add(620);
    const sea = smoothstep(coast.sub(4), coast.add(4), along);
    const seaLines = plines(along.add(sin(Pg.x.mul(0.01).add(uTime.mul(0.1))).mul(3.0)), 9.0, fp, 1.0).mul(0.12).mul(smoothstep(-0.3, 0.6, mx_noise_float(vec3(Pg.mul(0.01), uTime.mul(0.05)))));
    const seaC = vec3(0.0006, 0.0009, 0.0018).add(WHITE.mul(seaLines.add(lineAA(abs(along.sub(coast)), fp, 1.5).mul(0.4)).mul(uLines)));
    const landC = select(open.greaterThan(0.5), boardC, select(inRing.greaterThan(0.5), facC, select(inYard.greaterThan(0.5), yardC, streetC)));
    const landG = select(open.greaterThan(0.5), boardG, select(inRing.greaterThan(0.5), vec3(0), select(inYard.greaterThan(0.5), yardG, streetG)));
    const lc = mix(landC, seaC, sea).mul(inDiag.oneMinus()).add(diagC.mul(inDiag).mul(sea.oneMinus()));
    const lg = mix(landG, vec3(0), sea).mul(inDiag.oneMinus()).add(diagG.mul(inDiag).mul(sea.oneMinus()));
    c.assign(select(onRoof.greaterThan(0.5), roofC, lc));
    const gold = select(onRoof.greaterThan(0.5), roofG, lg);
    const fog = exp(t.mul(-0.0022)).mul(0.9).add(0.1), fogG = exp(t.mul(-0.0007));   // the gold carries to the horizon; the lines sink into the haze
    return mix(HAZE, c, fog).add(gold.mul(fogG));
  });
  // THE GOLDEN HAZE (ARTE round 2): a layer of lit haze 4 m thick at the height the room reaches at p ≈ 0.6; the room crosses it (a veil of
  // ~1.5–3 s) and comes out above the whole city; from above it lies below and gives the height. hazeA(): how much of it lies between the
  // eye and this fragment (exact for a horizontal slab), plus the veil while the eye is inside.
  const uHazeY = uniform(-1e4), uHazeK = uniform(1);
  const HZC = vec3(1.0, 0.81, 0.48).mul(0.2);                              // pale gold #FFE9B8
  const hazeA = () => {
    const y0 = cameraPosition.y, y1 = positionWorld.y, lo = uHazeY.sub(2.0), hi = uHazeY.add(2.0);
    const ov = max(min(max(y0, y1), hi).sub(max(min(y0, y1), lo)), 0.0), dy = abs(y1.sub(y0)).add(0.01);
    const dist = length(positionWorld.sub(cameraPosition));
    const path = min(ov.div(dy), 1.0).mul(dist);
    const tex = mx_noise_float(vec3(positionWorld.xz.mul(0.04), uTime.mul(0.05))).mul(0.35).add(0.75);
    const inside = smoothstep(2.6, 0.4, abs(y0.sub(uHazeY)));
    const vy = positionWorld.y.sub(y0).div(dist.add(0.001)), below = mix(float(0.18), float(1), smoothstep(0.03, -0.12, vy));   // dense below the horizon, clear above
    return max(float(1).sub(exp(path.mul(-0.03).mul(tex))).mul(0.6).mul(below), inside.mul(0.85)).mul(uHazeK).mul(uWorld);
  };
  const hazeCol = () => {
    // 3–4 vertical SHAFTS of light through the veil (fixed directions of the city, they turn with it)
    const d = normalize(positionWorld.sub(cameraPosition)), az = atan(toCity(d.xz).y, toCity(d.xz).x);
    const shaft = (a0, w) => exp(abs(sin(az.sub(a0).mul(0.5))).div(w).pow(2).negate());
    const sh = shaft(0.4, 0.05).add(shaft(1.9, 0.035)).add(shaft(3.3, 0.06)).add(shaft(4.9, 0.04));
    return HZC.mul(mx_noise_float(vec3(positionWorld.xz.mul(0.02), uTime.mul(0.03))).mul(0.25).add(0.85)).mul(sh.mul(1.4).add(1));
  };
  const domeCol = Fn(([dir]) => mix(groundCol(dir), skyCol(dir), smoothstep(-0.003, 0.003, dir.y)));
  const uDomeIn = uniform(1);
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true });
  domeMat.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const cell = floor(dir.mul(9.0)), h = hash13(cell.add(vec3(3.1, 7.7, 1.3)));
    const a = smoothstep(h.mul(0.75), h.mul(0.75).add(0.12), uDomeIn);
    return vec4(mix(domeCol(dir).mul(uWorld.mul(0.85).add(0.15)), hazeCol(), hazeA()).mul(colDim(0.65)), a);
  })();
  domeMat.fog = false; mats.push(domeMat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(330, 64, 32), domeMat);
  geos.push(dome.geometry); dome.position.copy(EYE); dome.renderOrder = -10; dome.frustumCulled = false; object.add(dome);

  // -------------------------------------------------------------------------------------------- line shading for black volumes
  // u, v: metres along a face (v = height); dEdge: metres to the face's nearest edge; style: 0 windows, 1 glass fins, 2 circuit, 3 slab
  const faceLines = (u, v, dEdge, style, fw, top) => {
    // hierarchy: structural edges thick and bright (2.8 px), floors fine (1 px), detail hairline (0.6 px) and dim
    // ARTE: three weights — silhouettes and edges 2.8 px at 90 % · floors and windows 1.5 px at 45 % · circuit traces 1.5 px at 22 %
    const edge = lineAA(dEdge, fw, 2.8).mul(0.9).add(lineAA(dEdge, fw, 8.0).mul(0.04));
    const floors = max(plines(v, 3.3, fw, 1.5), plines(v.add(0.32), 3.3, fw, 1.5).mul(0.5));   // the slab: two lines
    // windows: an outline in each bay; a few lit (cool white), rare gold
    const g = vec2(u.div(2.4), v.div(3.3)), cl = floor(g), f = fract(g);
    const wx = abs(f.x.sub(0.5)), wy = abs(f.y.sub(0.52));
    const fwx = fw.div(2.4), fwy = fw.div(3.3);
    const rect = max(lineAA(abs(wx.sub(0.27)), fwx, 1.5).mul(step(wy, 0.29)), lineAA(abs(wy.sub(0.28)), fwy, 1.5).mul(step(wx, 0.28)));
    const inside = step(wx, 0.27).mul(step(wy, 0.28)), hh = hash12(cl.add(vec2(5.0, 3.0)));
    const winFade = smoothstep(0.06, 0.2, fwx).oneMinus();
    const win = rect.mul(0.45).mul(winFade).add(float(0.015).mul(winFade.oneMinus()));
    const lit = inside.mul(step(0.9, hh)).mul(0.035);
    const warm = inside.mul(step(0.975, hh)).mul(0.55);
    const fins = plines(u, 0.9, fw, 1.5).mul(0.22).add(plines(u, 4.5, fw, 1.5).mul(0.45)).add(floors.mul(0.45));
    const circ = circuit(vec2(u, v), 1.9, fw).mul(0.22).add(floors.mul(0.45));
    const slab = plines(u, 1.2, fw, 1.0).mul(0.08);
    const body = select(style.lessThan(0.5), floors.mul(0.45).add(win).add(lit), select(style.lessThan(1.5), fins, select(style.lessThan(2.5), circ, slab)));
    const topPat = plines(u, 1.2, fw, 1.5).mul(0.06).add(plines(v, 1.2, fw, 1.5).mul(0.06));
    const w = select(top.greaterThan(0.5), topPat, body).add(edge);
    return vec4(w, warm, 0, 0);
  };
  const fogK = (d) => exp(d.mul(-0.0045)).mul(0.85).add(0.15);

  // -------------------------------------------------------------------------------------------- the canyon: towers, shelves, bridges
  const boxes = [], gardens = [], busList = [], plantSegs = [];   // busList: polylines on the facades [[x,y,z,s]…] (s = metres from the garden)
  {
    // ARTE (13:10): tall and CLOSE buildings at the sides of each wall (4–8 m beyond it) with a slit of sky in the middle, where the
    // climbers' mast stands (the city turns a quarter during the rise: the slits come back to the walls at the top)
    const r = rng(31), NT = 2 * NW, wallAng = (w) => Math.atan2(-walls[w].normal.z, -walls[w].normal.x);
    const towers = [];
    for (let t = 0; t < NT; t++) {
      const ang = wallAng(t >> 1) + ((t & 1) ? 0.62 : -0.62) + (r() - 0.5) * 0.08, rIn = 9.4 + r() * 1.6, W = 6.5 + r() * 3, D = 8 + r() * 6, H = 50 + r() * 32;
      const tw = { ang, segs: [] }; towers.push(tw);
      let y = 0, off = (r() - 0.5) * 2, set = 0, w = W, style = Math.floor(r() * 3);
      while (y < H - 2.5) {
        let h = 5 + r() * 8; if (y + h > H) h = H - y;
        const ca = Math.cos(ang), sa = Math.sin(ang), rr = rIn + set + D / 2;
        const cx = ca * rr - sa * off, cz = sa * rr + ca * off, rot = Math.PI / 2 - ang;
        boxes.push([cx, y + h / 2, cz, rot, w, h, D, style]);
        tw.segs.push({ y0: y, y1: y + h, rin: rIn + set, off, w });
        // circuit BUSES (ARTE): 3–5 parallel traces down the inner facade from the terrace above, a 45° jog, pads at the end
        if (h > 4 && r() < 0.75) {
          const n = 3 + Math.floor(r() * 3), sp = 0.2, rin = rIn + set - 0.035, ca2 = Math.cos(ang), sa2 = Math.sin(ang);
          const lim = w / 2 - 0.4 - n * sp, u0 = off + (r() - 0.5) * 2 * Math.max(0, lim) * 0.8, J = (r() < 0.5 ? -1 : 1) * (0.8 + r() * 1.6);
          const L1 = 1 + r() * (h * 0.35), L3 = 1 + r() * (h * 0.35);
          for (let k = 0; k < n; k++) {
            const uk = u0 + (k - (n - 1) / 2) * sp, ujog = Math.max(off - w / 2 + 0.3, Math.min(off + w / 2 - 0.3, uk + J));
            const yA = y + h - 0.25, yB = yA - L1, yC = yB - Math.abs(ujog - uk), yD = Math.max(y + 0.4, yC - L3);
            const P = (u, yy) => [ca2 * rin - sa2 * u, yy, sa2 * rin + ca2 * u];
            const pts = [[uk, yA], [uk, yB], [ujog, yC], [ujog, yD]];
            const line = []; let sacc = 0;
            for (let q = 0; q < pts.length; q++) { if (q) sacc += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); const xyz = P(pts[q][0], pts[q][1]); line.push([xyz[0], xyz[1], xyz[2], sacc]); }
            busList.push({ line, pad: P(ujog, yD - 0.08), padA: P(uk, yA + 0.08), ca: ca2, sa: sa2, seed: r() });
          }
        }
        const nset = r() < 0.6 ? set + 0.8 + r() * 2.6 : set;
        const nw = Math.max(5, w * (0.8 + r() * 0.25)), noff = off + (r() - 0.5) * 2.4;
        if (nset - set > 0.7) gardens.push({ x: ca * (rIn + set + (nset - set) / 2) - sa * off, y: y + h, z: sa * (rIn + set + (nset - set) / 2) + ca * off, ang, tl: w * 0.9, rl: nset - set, kind: 0 });
        else if (r() < 0.5) gardens.push({ x: ca * (rIn + set + D / 2) - sa * off, y: y + h, z: sa * (rIn + set + D / 2) + ca * off, ang, tl: w * 0.5, rl: D * 0.3, kind: 1 });
        if (r() < 0.3) style = Math.floor(r() * 3);
        set = nset; w = nw; off = noff; y += h;
      }
      // the top: a garden crowns the tower
      const s = tw.segs[tw.segs.length - 1], ca = Math.cos(ang), sa = Math.sin(ang);
      gardens.push({ x: ca * (s.rin + D / 2) - sa * s.off, y: s.y1, z: sa * (s.rin + D / 2) + ca * s.off, ang, tl: s.w * 0.8, rl: D * 0.7, kind: 2 });
      // a garden bed at its foot, on the canyon's floor
      gardens.push({ x: ca * (rIn - 1.2) - sa * tw.segs[0].off, y: 0, z: sa * (rIn - 1.2) + ca * tw.segs[0].off, ang, tl: W * 0.7, rl: 1.6, kind: 4 });
      // garden shelves: thin slabs out of the inner face, towards the room
      const ns = 3 + Math.floor(r() * 3);
      for (let k = 0; k < ns; k++) {
        const sg = tw.segs[Math.floor(r() * tw.segs.length)], y = sg.y0 + 2 + r() * Math.max(0.5, sg.y1 - sg.y0 - 3);
        const out = 0.8 + r() * 0.8, wd = 2.5 + r() * 3, o2 = sg.off + (r() - 0.5) * (sg.w - wd) * 0.8, rr = sg.rin - out / 2;
        const cx = ca * rr - sa * o2, cz = sa * rr + ca * o2;
        boxes.push([cx, y, cz, Math.PI / 2 - ang, wd, 0.35, out, 3]);
        gardens.push({ x: cx, y: y + 0.18, z: cz, ang, tl: wd * 0.9, rl: out * 0.8, kind: 3 });
      }
    }
    // bridges between neighbouring towers (chords, never across the room)
    for (let t = 0; t < NT; t++) {
      const a = towers[t], b = towers[(t + 1) % NT];
      for (let k = 0; k < 2; k++) {
        if (r() < 0.55) continue;
        const y = 6 + r() * 40, sa = a.segs.find((s) => y >= s.y0 && y < s.y1), sb = b.segs.find((s) => y >= s.y0 && y < s.y1);
        if (!sa || !sb) continue;
        const ra = sa.rin + 1.5, rb = sb.rin + 1.5;
        const ax = Math.cos(a.ang) * ra - Math.sin(a.ang) * (sa.off + sa.w * 0.45), az = Math.sin(a.ang) * ra + Math.cos(a.ang) * (sa.off + sa.w * 0.45);
        const bx = Math.cos(b.ang) * rb - Math.sin(b.ang) * (sb.off - sb.w * 0.45), bz = Math.sin(b.ang) * rb + Math.cos(b.ang) * (sb.off - sb.w * 0.45);
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
        if (L < 1.5) continue;
        boxes.push([(ax + bx) / 2, y, (az + bz) / 2, Math.atan2(-dz / L, dx / L), L + 1.2, 0.55, 1.7, 3]);
      }
    }
  }
  const NBOX = boxes.length;
  const bloomV = Array.from({ length: 128 }, () => new THREE.Vector4()), uBloom = uniformArray(bloomV, 'vec4');
  {
    const g0 = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(g0.index); g.setAttribute('position', g0.attributes.position); g.setAttribute('normal', g0.attributes.normal);
    const bA = new Float32Array(NBOX * 4), bB = new Float32Array(NBOX * 4);
    boxes.forEach((b, i) => { bA.set([b[0], b[1], b[2], b[3]], i * 4); bB.set([b[4], b[5], b[6], b[7]], i * 4); });
    g.setAttribute('bA', new THREE.InstancedBufferAttribute(bA, 4)); g.setAttribute('bB', new THREE.InstancedBufferAttribute(bB, 4));
    // the warm light of the gardens spills onto the lines: each box knows its two nearest gardens (≤ 16 m from its surface)
    const g1 = new Float32Array(NBOX * 4), g2 = new Float32Array(NBOX * 4), NG0 = Math.min(128, gardens.length);
    boxes.forEach((b, i) => {
      const near = [];
      for (let k = 0; k < NG0; k++) { const G = gardens[k]; const dx = Math.max(0, Math.abs(G.x - b[0]) - Math.max(b[4], b[6]) / 2), dy = Math.max(0, Math.abs(G.y - b[1]) - b[5] / 2), dz = Math.max(0, Math.abs(G.z - b[2]) - Math.max(b[4], b[6]) / 2); const d = Math.hypot(dx, dy, dz); if (d < 16) near.push([d, k]); }
      near.sort((a, c) => a[0] - c[0]);
      for (const [arr, j] of [[g1, 0], [g2, 1]]) { const k = near[j]?.[1]; if (k == null) arr.set([0, -1e4, 0, 0], i * 4); else arr.set([gardens[k].x, gardens[k].y + 0.8, gardens[k].z, k], i * 4); }
    });
    g.setAttribute('bG1', new THREE.InstancedBufferAttribute(g1, 4)); g.setAttribute('bG2', new THREE.InstancedBufferAttribute(g2, 4));
    g.instanceCount = NBOX; geos.push(g, g0);
    const m = new THREE.MeshBasicNodeMaterial();
    const A = attribute('bA', 'vec4'), Bv = attribute('bB', 'vec4');
    const lp = positionGeometry.mul(Bv.xyz), c = cos(A.w), s = sin(A.w);
    m.positionNode = vec3(lp.x.mul(c).add(lp.z.mul(s)), lp.y, lp.z.mul(c).sub(lp.x.mul(s))).add(A.xyz);
    const vLP = varying(lp), vN = varying(normalGeometry), vSZ = varying(Bv), vY = varying(lp.y.add(A.y));
    const vP = varying(vec3(lp.x.mul(c).add(lp.z.mul(s)), lp.y, lp.z.mul(c).sub(lp.x.mul(s))).add(A.xyz)), vG1 = varying(attribute('bG1', 'vec4')), vG2 = varying(attribute('bG2', 'vec4'));
    m.colorNode = Fn(() => {
      const an = abs(vN), d = vSZ.xyz.mul(0.5).sub(abs(vLP));
      const big = float(1e4);
      const dE = min(min(select(an.x.greaterThan(0.5), big, d.x), select(an.y.greaterThan(0.5), big, d.y)), select(an.z.greaterThan(0.5), big, d.z));
      const fw = length(fwidth(vLP)).mul(0.75).add(0.0005);
      const top = an.y;
      const u = select(an.x.greaterThan(0.5), vLP.z.add(vSZ.z.mul(0.5)), vLP.x.add(vSZ.x.mul(0.5)));
      const v = select(top.greaterThan(0.5), vLP.z.add(vSZ.z.mul(0.5)), vY);
      const L = faceLines(u, v, dE, vSZ.w, fw, top);
      const dist = length(positionWorld.sub(cameraPosition));
      const k = fogK(dist).mul(uWorld);
      const base = vec3(0.0016, 0.0018, 0.0024).mul(vN.y.mul(0.3).add(1));
      const spill = (G) => { const d = vP.sub(G.xyz), b = uBloom.element(max(G.w, 0.0).toInt()).x, r2 = b.mul(18).add(14); return exp(dot(d, d).div(r2).negate()).mul(b.mul(0.5).add(0.5)); };
      const warmK = min(spill(vG1).add(spill(vG2)).mul(uGard), 1.6);
      const ink = mix(WHITE, GOLD.mul(1.25), min(warmK, 1.0)).mul(warmK.mul(0.7).add(1));
      return vec4(mix(base.add(ink.mul(L.x.mul(uLines))).add(GOLD.mul(L.y)).add(GOLD.mul(warmK.mul(0.022))).mul(k).add(HAZE.mul(float(1).sub(fogK(dist)).mul(uWorld))), hazeCol(), hazeA()).mul(colDim(0.65)), 1);
    })();
    m.fog = false; mats.push(m);
    var canyon = new THREE.Mesh(g, m); canyon.frustumCulled = false; city.add(canyon);
  }

  // -------------------------------------------------------------------------------------------- the Eixample: blocks (instanced, near)
  // one block = a chamfered ring (outer facade, courtyard facade, roof), height per instance; beyond ~300 m the dome draws them
  const blocks = [];
  {
    const r = rng(5);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      if (i === 0 && j === 0) continue;
      const cx = i * PITCH, cz = j * PITCH;
      if (Math.hypot(cx, cz) > 2.25 * PITCH) continue;
      if (Math.abs(cx * DIAG.x + cz * DIAG.y - DIAG_D) < 70) continue;
      if (cx * SEA.x + cz * SEA.y > 560) continue;
      blocks.push([cx, cz, 18 + r() * 8, r()]);
    }
    const contour = (a, leg) => { const b = a - leg; return [[a, -b], [a, b], [b, a], [-b, a], [-a, b], [-a, -b], [-b, -a], [b, -a]]; };
    const O = contour(BA, BA * 2 - BCUT), I = contour(BIN, BIN * 2 - BCUTI);
    const pos = [], nrm = [], ue = [], idx = [];
    const quad = (p0, p1, p2, p3, n, u0, u1, L, kind) => {
      const b = pos.length / 3;
      for (const [p, uu, vv] of [[p0, u0, 0], [p1, u1, 0], [p2, u1, 1], [p3, u0, 1]]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); ue.push(uu, vv, L, kind); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const [C, kind, sgn] of [[O, 0, 1], [I, 1, -1]]) {
      for (let k = 0; k < 8; k++) {
        const a = C[k], b = C[(k + 1) % 8], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = (b[1] - a[1]) / L * sgn, nz = -(b[0] - a[0]) / L * sgn;
        if (sgn > 0) quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 1, b[1]], [a[0], 1, a[1]], [nx, 0, nz], 0, L, L, kind);
        else quad([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], 1, a[1]], [b[0], 1, b[1]], [nx, 0, nz], 0, L, L, kind);
      }
    }
    for (let k = 0; k < 8; k++) {                                    // the roof ring
      const a = O[k], b = O[(k + 1) % 8], c = I[(k + 1) % 8], d = I[k];
      quad([a[0], 1, a[1]], [d[0], 1, d[1]], [c[0], 1, c[1]], [b[0], 1, b[1]], [0, 1, 0], 0, 0, 0, 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(ue, 4)); g.setIndex(idx);
    const bI = new Float32Array(blocks.length * 4); blocks.forEach((b, i) => bI.set(b, i * 4));
    g.setAttribute('aI', new THREE.InstancedBufferAttribute(bI, 4)); g.instanceCount = blocks.length; geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial();
    const I4 = attribute('aI', 'vec4'), E = attribute('aE', 'vec4');
    m.positionNode = vec3(positionGeometry.x.add(I4.x), positionGeometry.y.mul(I4.z), positionGeometry.z.add(I4.y));
    const vE = varying(E), vH = varying(I4.z), vSeed = varying(I4.w), vL = varying(positionGeometry.xz), vY = varying(positionGeometry.y.mul(I4.z));
    m.colorNode = Fn(() => {
      const kind = vE.w, u = vE.x, Lr = vE.z;
      const fwU = fwidth(u).add(fwidth(vY)).add(0.0005);
      const col = vec3(0).toVar();
      If(kind.lessThan(1.5), () => {
        const dE = min(min(u, Lr.sub(u)), min(vY, vH.sub(vY)));
        const L = faceLines(u, vY, dE, select(vSeed.lessThan(0.5), float(3), float(2)), fwU, float(0));
        col.assign(WHITE.mul(L.x.mul(uLines).mul(0.25)).add(GOLD.mul(L.y.mul(0.6))));
      }).Else(() => {
        const q = abs(vL), fr = length(fwidth(vL)).add(0.0005);
        const ln = max(max(lineAA(abs(blockSDF(q, BA, BCUT)), fr, 2.0), lineAA(abs(blockSDF(q, BA - 2.2, BCUT - 4.4)), fr, 1.5).mul(0.6)), lineAA(abs(blockSDF(q, BIN, BCUTI)), fr, 1.5).mul(0.7)).mul(0.6);
        const party = plines(select(q.x.greaterThan(q.y), vL.y, vL.x), 14.0, fr, 1.0).mul(0.16);
        const gardensOn = step(0.55, vSeed);
        const dots = lightDots(vL, 3.6, 0.6, fr, 4.0).mul(gardensOn).mul(3.0).add(gardensOn.mul(0.012)).mul(uGard);
        col.assign(WHITE.mul(ln.add(party).add(circuit(vL, 5.0, fr).mul(0.08)).mul(uLines)).add(GOLD.mul(dots)).add(vec3(0.003, 0.008, 0.004).mul(gardensOn)));
      });
      const dist = length(positionWorld.sub(cameraPosition)), f = exp(dist.mul(-0.0055));
      return vec4(mix(col.add(vec3(0.0015)).mul(f).add(HAZE.mul(f.oneMinus())).mul(uWorld), hazeCol(), hazeA()).mul(colDim(0.65)), 1);
    })();
    m.fog = false; mats.push(m);
    var blockMesh = new THREE.Mesh(g, m); blockMesh.frustumCulled = false; city.add(blockMesh);
  }

  // -------------------------------------------------------------------------------------------- billboards (glows)
  // aP = (x, y, z, size m), aC = (r, g, b, kind) — kind 0 soft dot, 1 star, 2 ring (bell), 3 vertical streak
  function billboards(n, parent, opt = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const aP = new Float32Array(n * 4), aC = new Float32Array(n * 4);
    const AP = new THREE.InstancedBufferAttribute(aP, 4), AC = new THREE.InstancedBufferAttribute(aC, 4);
    AP.setUsage(THREE.DynamicDrawUsage); AC.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('bbP', AP); g.setAttribute('bbC', AC); g.instanceCount = n;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: opt.depthTest !== false, blending: THREE.AdditiveBlending });
    const p4 = attribute('bbP', 'vec4'), c4 = attribute('bbC', 'vec4');
    const mv = modelViewMatrix.mul(vec4(p4.xyz, 1));
    m.vertexNode = select(p4.w.greaterThan(0.0001), cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(p4.w)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const vC = varying(c4.xyz.mul(uWorld.mul(0.8).add(0.2))), vK = varying(c4.w), vQ = varying(positionGeometry.xy);
    m.colorNode = Fn(() => {
      const q = vQ, r2 = dot(q, q), r = sqrt(r2);
      const dotK = exp(r2.mul(-9));
      const starK = exp(r2.mul(-900)).mul(8).add(exp(r2.mul(-60)).mul(0.6)).add(exp(r.mul(-6)).mul(0.08))
        .add(exp(abs(q.y).mul(-160)).mul(exp(abs(q.x).mul(-5))).mul(0.35)).add(exp(abs(q.x).mul(-160)).mul(exp(abs(q.y).mul(-7))).mul(0.25));
      const ringK = exp(r.sub(0.8).div(0.06).pow(2).negate()).add(exp(r2.mul(-4)).mul(0.15));
      const streakK = exp(q.x.mul(q.x).mul(-300)).mul(smoothstep(1.0, 0.2, abs(q.y)));
      const k = vK;
      const f = select(k.lessThan(0.5), dotK, select(k.lessThan(1.5), starK, select(k.lessThan(2.5), ringK, streakK)));
      return vec4(vC.mul(f), 1);
    })();
    m.fog = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; parent.add(mesh); geos.push(g); mats.push(m);
    return { mesh, g, aP, aC, AP, AC, set(i, x, y, z, s, r, gg, b, k) { aP[i * 4] = x; aP[i * 4 + 1] = y; aP[i * 4 + 2] = z; aP[i * 4 + 3] = s; aC[i * 4] = r; aC[i * 4 + 1] = gg; aC[i * 4 + 2] = b; aC[i * 4 + 3] = k; } };
  }

  // -------------------------------------------------------------------------------------------- the gardens (gold, they bloom)
  // Points on the terraces: leaves (dark green soft dots), stems (thin streaks) and gold blossoms in umbrella caps. Each point knows its
  // garden: uBloom[g].x (0..1) opens it — blossoms swell and brighten, the leaves catch the light.
  const NGD = Math.min(128, gardens.length);
  {
    const r = rng(71), list = [];
    for (let gi = 0; gi < NGD; gi++) {
      const G = gardens[gi], ca = Math.cos(G.ang), sa = Math.sin(G.ang), tx = -sa, tz = ca;
      const area = G.tl * G.rl, nL = Math.min(300, Math.round(30 + area * 10)), nT = Math.max(3, Math.min(18, Math.round(area / 2)));
      for (let k = 0; k < nL; k++) {
        // foliage in mounds (volume), some of it hanging over the edge towards the room; the tops catch the gold
        const hang = G.kind !== 2 && G.kind !== 4 && r() < 0.3;
        const a = (r() - 0.5) * G.tl, b = hang ? -G.rl / 2 - r() * 0.3 : (r() - 0.5) * G.rl;
        const mound = Math.sin(Math.PI * (0.5 + a / Math.max(G.tl, 0.1))) * (0.6 + 0.4 * Math.sin(a * 1.7 + gi));
        const h = hang ? -Math.pow(r(), 1.4) * 2.6 : Math.pow(r(), 1.2) * (G.kind === 2 ? 2.4 : 1.4) * (0.5 + mound * 0.8);
        const gr = 0.3 + r() * 0.45, lit = clamp01(h / 1.6) * r();
        list.push([G.x + tx * a + ca * b, G.y + h + 0.1, G.z + tz * a + sa * b, 0.07 + r() * 0.14, 1.4 * (0.010 + 0.05 * lit) * gr, 1.4 * (0.045 + 0.03 * lit) * gr, 1.4 * (0.018 + 0.006 * lit) * gr, 0, gi, r()]);
      }
      for (let k = 0; k < nT; k++) {
        const a = (r() - 0.5) * G.tl * 0.85, b = (r() - 0.5) * G.rl * 0.7, H = 1.0 + r() * (G.kind === 2 ? 3.2 : 2.0), x = G.x + tx * a + ca * b, z = G.z + tz * a + sa * b;
        // the plant as a SILHOUETTE (ARTE round 2): a bent stem and the umbel's spokes as fine lines (built below as wires), blossoms at the tips
        { const bx = (r() - 0.5) * 0.4, bz = (r() - 0.5) * 0.4; plantSegs.push([x, G.y, z, x + bx, G.y + H * 0.55, z + bz], [x + bx, G.y + H * 0.55, z + bz, x, G.y + H - 0.1, z]);
          for (let lf = 0; lf < 2; lf++) { const la = r() * TAU, ly = G.y + H * (0.2 + r() * 0.3); plantSegs.push([x + bx * 0.4, ly, z + bz * 0.4, x + bx * 0.4 + Math.cos(la) * 0.5, ly + 0.35, z + bz * 0.4 + Math.sin(la) * 0.5]); } }
        const cap = 0.6 + r() * 0.9, nb = 12 + Math.floor(r() * 15), warm = r();
        for (let j = 0; j < nb; j++) {
          const th = r() * TAU, ph = r() * 1.2, rr = cap * Math.sin(ph) + 0.05;
          const cb = (0.35 + r() * 0.65), white = warm > 0.45;   // umbels of cream white #FFF2D0 with a gold glow, and gold ones
          plantSegs.push([x, G.y + H - 0.1, z, x + Math.cos(th) * rr, G.y + H + cap * Math.cos(ph) * 0.45, z + Math.sin(th) * rr]);
          list.push([x + Math.cos(th) * rr, G.y + H + cap * Math.cos(ph) * 0.45, z + Math.sin(th) * rr, 0.06 + r() * 0.06,
            (white ? 1.0 : 1.0) * cb, (white ? 0.9 : 0.62) * cb, (white ? 0.66 : 0.22) * cb, 1, gi, r()]);
        }
      }
    }
    const n = list.length;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const aP = new Float32Array(n * 4), aC = new Float32Array(n * 4), aX = new Float32Array(n * 4);
    list.forEach((s, i) => { aP.set([s[0], s[1], s[2], s[3]], i * 4); aC.set([s[4], s[5], s[6], s[7]], i * 4); aX.set([s[8], s[9], 0, 0], i * 4); });
    g.setAttribute('gP', new THREE.InstancedBufferAttribute(aP, 4)); g.setAttribute('gC', new THREE.InstancedBufferAttribute(aC, 4)); g.setAttribute('gX', new THREE.InstancedBufferAttribute(aX, 4));
    g.instanceCount = n; geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p4 = attribute('gP', 'vec4'), c4 = attribute('gC', 'vec4'), x4 = attribute('gX', 'vec4');
    const bl = uBloom.element(x4.x.toInt()).x, sd = x4.y, kind = c4.w;
    const sway = sin(uTime.mul(sd.mul(0.8).add(0.6)).add(sd.mul(40))).mul(0.04).mul(bl.mul(2).add(1));
    const isBl = step(0.5, kind).mul(step(kind, 1.5));
    const pos = p4.xyz.add(vec3(sway, isBl.mul(bl).mul(0.12), sway.mul(0.7)));
    const size = p4.w.mul(float(1).add(isBl.mul(bl).mul(0.3)));
    const mv = modelViewMatrix.mul(vec4(pos, 1));
    const stretch = select(kind.greaterThan(1.5), vec2(0.02, 1), vec2(1, 1));
    m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(stretch).mul(size)), mv.z, mv.w));
    const breathe = sin(uTime.mul(0.7).add(sd.mul(30))).mul(0.15).add(0.85);
    const gain = select(kind.lessThan(0.5), bl.mul(1.5).add(1), select(kind.lessThan(1.5), bl.mul(1.2).add(0.55).mul(breathe), bl.mul(1.5).add(0.4)));
    const vC = varying(c4.xyz.mul(gain).mul(uGard).mul(uWorld)), vQ = varying(positionGeometry.xy), vK = varying(kind);
    m.colorNode = Fn(() => {
      const r2 = dot(vQ, vQ);
      const f = select(vK.lessThan(0.5), exp(r2.mul(-7)), select(vK.lessThan(1.5), exp(r2.mul(-14)).mul(1.2).add(exp(r2.mul(-2.5)).mul(0.12)), exp(vQ.x.mul(vQ.x).mul(-3)).mul(smoothstep(1.0, 0.7, abs(vQ.y)))));
      return vec4(vC.mul(f).mul(float(1).sub(hazeA())).mul(colDim()), 1);
    })();
    m.fog = false; mats.push(m);
    var gardenMesh = new THREE.Mesh(g, m); gardenMesh.frustumCulled = false; city.add(gardenMesh);
    var gardenPoints = n;
  }
  const bloom = new Float32Array(128), bloomT = new Float32Array(128);

  // -------------------------------------------------------------------------------------------- wires (static white lines as ribbons)
  // segments (a.xyz, intensity) (b.xyz, kind 0 white / 1 gold); ≥ ~1 px wide, gaussian profile
  function wires(cap, parent) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(cap * 4), b = new Float32Array(cap * 4);
    const AA = new THREE.InstancedBufferAttribute(a, 4), BB = new THREE.InstancedBufferAttribute(b, 4);
    g.setAttribute('wA', AA); g.setAttribute('wB', BB); g.instanceCount = 0; geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const A = attribute('wA', 'vec4'), Bq = attribute('wB', 'vec4');
    const va = modelViewMatrix.mul(vec4(A.xyz, 1)), vb = modelViewMatrix.mul(vec4(Bq.xyz, 1));
    const v = mix(va, vb, positionGeometry.x);
    const d = normalize(vb.xy.sub(va.xy).add(vec2(0.00001, 0))), perp = vec2(d.y.negate(), d.x);
    const w = max(float(0.006), v.z.negate().mul(0.0011));
    m.vertexNode = cameraProjectionMatrix.mul(vec4(v.xy.add(perp.mul(w).mul(positionGeometry.y)), v.z, v.w));
    const dist = v.z.negate();
    const vI = varying(A.w.mul(exp(dist.mul(-0.004)).mul(0.85).add(0.15)).mul(uWorld)), vS = varying(positionGeometry.y), vK = varying(Bq.w);
    m.colorNode = Fn(() => vec4(mix(WHITE.mul(uLines), GOLD.mul(uGold), vK).mul(vI).mul(exp(vS.mul(vS).mul(-2.2))).mul(colDim()), 1))();
    m.fog = false; mats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; parent.add(mesh);
    let n = 0;
    return { mesh, g, reset() { n = 0; }, add(ax, ay, az, bx, by, bz, I, k = 0) { if (n >= cap) return; a.set([ax, ay, az, I], n * 4); b.set([bx, by, bz, k], n * 4); n++; }, done() { g.instanceCount = n; AA.needsUpdate = true; BB.needsUpdate = true; } };
  }
  // the BUSES with gold pulses running up them towards the gardens (1.5 m/s): wires with an arc length
  {
    let nseg = 0; for (const b of busList) nseg += (b.line.length - 1) + 16;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(nseg * 4), b = new Float32Array(nseg * 4), c = new Float32Array(nseg * 4);
    let n = 0;
    const seg = (p, q, s0, s1, seed, pad) => { a.set([p[0], p[1], p[2], s0], n * 4); b.set([q[0], q[1], q[2], s1], n * 4); c.set([seed, pad, 0, 0], n * 4); n++; };
    for (const B of busList) {
      for (let k = 1; k < B.line.length; k++) seg(B.line[k - 1], B.line[k], B.line[k - 1][3], B.line[k][3], B.seed, 0);
      for (const [cen, s0] of [[B.pad, B.line[B.line.length - 1][3] + 0.1], [B.padA, 0]]) for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU, R = 0.065, tx = -B.sa, tz = B.ca;
        seg([cen[0] + tx * Math.cos(a0) * R, cen[1] + Math.sin(a0) * R, cen[2] + tz * Math.cos(a0) * R], [cen[0] + tx * Math.cos(a1) * R, cen[1] + Math.sin(a1) * R, cen[2] + tz * Math.cos(a1) * R], s0, s0, B.seed, 1);
      }
    }
    g.setAttribute('bsA', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('bsB', new THREE.InstancedBufferAttribute(b, 4)); g.setAttribute('bsC', new THREE.InstancedBufferAttribute(c, 4));
    g.instanceCount = n; geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const A = attribute('bsA', 'vec4'), Bq = attribute('bsB', 'vec4'), C = attribute('bsC', 'vec4');
    const va = modelViewMatrix.mul(vec4(A.xyz, 1)), vb = modelViewMatrix.mul(vec4(Bq.xyz, 1));
    const v = mix(va, vb, positionGeometry.x);
    const d = normalize(vb.xy.sub(va.xy).add(vec2(0.00001, 0))), perp = vec2(d.y.negate(), d.x);
    const w = max(float(0.007), v.z.negate().mul(0.0015));
    m.vertexNode = cameraProjectionMatrix.mul(vec4(v.xy.add(perp.mul(w).mul(positionGeometry.y)), v.z, v.w));
    const vS = varying(mix(A.w, Bq.w, positionGeometry.x)), vSd = varying(C.x), vPad = varying(C.y), vY = varying(positionGeometry.y), vZ = varying(v.z.negate());
    m.colorNode = Fn(() => {
      const per = float(5.0).add(vSd.mul(4.0));
      const ph = fract(vS.add(uTime.mul(1.5)).add(vSd.mul(17.0)).div(per)).mul(per);          // 0 at a pulse's head, which runs to s = 0
      const pulse = exp(ph.mul(-2.6)).mul(step(0.0, ph)).mul(float(1).sub(vPad));
      const fade = exp(vZ.mul(-0.004)).mul(0.85).add(0.15);
      const prof = exp(vY.mul(vY).mul(-2.2));
      return vec4(WHITE.mul(uLines.mul(0.34)).add(GOLD.mul(pulse.mul(2.6).mul(uGold))).mul(prof).mul(fade).mul(uWorld).mul(float(1).sub(hazeA())).mul(colDim()), 1);
    })();
    m.fog = false; mats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; city.add(mesh);
  }
  // the canyon's own wires: horizontal circuit lines in the void between towers, cables down the facades
  {
    const r = rng(19), W = wires(1400, city);
    for (let k = 0; k < 70; k++) {                                   // chords in the void at radius ≥ 10.5 m
      const a0 = r() * TAU, span = 0.35 + r() * 0.7, y = r() * 75, rad = 10.5 + r() * 6;
      let pa = [Math.cos(a0) * rad, Math.sin(a0) * rad];
      const nSeg = 6;
      for (let s = 1; s <= nSeg; s++) {
        const a = a0 + span * s / nSeg, pb = [Math.cos(a) * rad, Math.sin(a) * rad];
        W.add(pa[0], y, pa[1], pb[0], y, pb[1], 0.22 + r() * 0.12); pa = pb;
      }
      if (r() < 0.5) { const a = a0 + span; W.add(Math.cos(a) * rad, y, Math.sin(a) * rad, Math.cos(a) * rad, y - 2 - r() * 6, Math.sin(a) * rad, 0.18); }
    }
    W.done();
  }

  // -------------------------------------------------------------------------------------------- the climb: masts, path, threads
  const climb = { order: [0, 1, 2, 3], A1: 90, built: '' };
  const TR = 6.4, NEAR = 0.7, FT = 0.72;
  const TOPR = [2.3, 2.8, 3.3], RSTART = -1.1;
  const towerAng = (w) => Math.atan2(-walls[w].normal.z, -walls[w].normal.x);
  const Aof = (p) => 1.6 + (climb.A1 - 1.6) * (1 - Math.pow(1 - clamp01(p), 1.6));
  const ease = (t) => t * t * (3 - 2 * t);
  function pathPos(i, c, out) {
    const o = climb.order, n = o.length, sf = c * n, k = Math.min(n - 1, Math.floor(sf)), f = sf - k;
    const y = Aof((i + c) / 3) + RSTART + (TOPR[i] - RSTART) * (0.3 * c + 0.7 * ease(c));
    const th = towerAng(o[k]);
    if (k < n - 1 && f > FT) {
      const g = (f - FT) / (1 - FT), th2 = towerAng(o[k + 1]);
      let d = th2 - th; while (d <= 0) d += TAU;
      const a = th + d * ease(g), rad = TR - NEAR - 0.8 * Math.sin(Math.PI * g);
      out.set(Math.cos(a) * rad, y + 0.25 * Math.sin(Math.PI * g), Math.sin(a) * rad);
    } else {
      const g = k < n - 1 ? f / FT : f;
      const phi = th + Math.PI + g * TAU;
      out.set(Math.cos(th) * TR + Math.cos(phi) * NEAR, y, Math.sin(th) * TR + Math.sin(phi) * NEAR);
    }
    return out;
  }
  const NSEG = 700;
  const thrGeo = new THREE.InstancedBufferGeometry();
  thrGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); thrGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const tA = new Float32Array(3 * NSEG * 4), tB = new Float32Array(3 * NSEG * 4);
  const TA = new THREE.InstancedBufferAttribute(tA, 4), TB = new THREE.InstancedBufferAttribute(tB, 4);
  thrGeo.setAttribute('aA', TA); thrGeo.setAttribute('aB', TB); thrGeo.instanceCount = 3 * NSEG; geos.push(thrGeo);
  const thrMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const A = attribute('aA', 'vec4'), Bq = attribute('aB', 'vec4');
    const q0 = A.w, q1 = Bq.w, vis = clamp(uQ.sub(q0).div(q1.sub(q0)), 0, 1);
    const tremble = vec3(sin(uTime.mul(23).add(q0.mul(40))), sin(uTime.mul(19).add(q0.mul(33))), 0).mul(uShiver.mul(0.02));
    const pa = A.xyz.add(tremble), pb = mix(A.xyz, Bq.xyz, vis).add(tremble);
    const va = modelViewMatrix.mul(vec4(pa, 1)), vb = modelViewMatrix.mul(vec4(pb, 1));
    const v = mix(va, vb, positionGeometry.x);
    const d = normalize(vb.xy.sub(va.xy).add(vec2(0.00001, 0))), perp = vec2(d.y.negate(), d.x);
    const w = max(float(0.008), v.z.negate().mul(0.0012));
    const clip = cameraProjectionMatrix.mul(vec4(v.xy.add(perp.mul(w).mul(positionGeometry.y)), v.z, v.w));
    thrMat.vertexNode = select(uQ.greaterThan(q0), clip, vec4(0, 0, 2, 1));
    const fresh = exp(uQ.sub(q1).max(0).mul(-25)).mul(2.0).add(1);
    const shimmer = sin(q0.mul(900).sub(uTime.mul(1.2))).mul(0.2).add(0.8);
    const vI = varying(fresh.mul(shimmer).mul(uBell.mul(1.5).add(1)).mul(uGold).mul(uWorld).mul(0.55));
    const vSd = varying(positionGeometry.y);
    thrMat.colorNode = Fn(() => vec4(GOLD.mul(vI).mul(exp(vSd.mul(vSd).mul(-2.2))).mul(1.1), 1))();
    thrMat.fog = false; mats.push(thrMat);
  }
  const threads = new THREE.Mesh(thrGeo, thrMat); threads.frustumCulled = false; world.add(threads);
  const masts = wires(4 * 420, world);
  { const W = wires(plantSegs.length + 4, city); for (const q of plantSegs) W.add(q[0], q[1], q[2], q[3], q[4], q[5], 0.5, 0.55); W.done(); }
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function build() {
    const key = climb.order.join(',') + '|' + climb.A1;
    if (key === climb.built) return; climb.built = key;
    for (let i = 0; i < 3; i++) for (let s = 0; s < NSEG; s++) {
      const c0 = s / NSEG, c1 = (s + 1) / NSEG, k = (i * NSEG + s) * 4;
      pathPos(i, c0, _v); pathPos(i, c1, _w);
      tA[k] = _v.x; tA[k + 1] = _v.y; tA[k + 2] = _v.z; tA[k + 3] = i + c0;
      tB[k] = _w.x; tB[k + 1] = _w.y; tB[k + 2] = _w.z; tB[k + 3] = i + c1;
    }
    TA.needsUpdate = true; TB.needsUpdate = true;
    // the masts: three rails, rings every 1.35 m (a castell's floor), a diagonal brace per ring — a castell drawn as a circuit
    masts.reset();
    const top = climb.A1 + TOPR[2] + 1.5, R = 0.42;
    for (const w of climb.order) {
      const th = towerAng(w), cx = Math.cos(th) * TR, cz = Math.sin(th) * TR;
      for (let y = -3; y < top; y += 1.35) {
        const y2 = Math.min(top, y + 1.35);
        for (let k = 0; k < 3; k++) {
          const a = th + k * TAU / 3, b = a + TAU / 3;
          masts.add(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R, cx + Math.cos(a) * R, y2, cz + Math.sin(a) * R, 0.30);
          masts.add(cx + Math.cos(a) * R, y2, cz + Math.sin(a) * R, cx + Math.cos(b) * R, y2, cz + Math.sin(b) * R, 0.16);
        }
        const k = Math.floor((y + 3) / 1.35) % 3, a = th + k * TAU / 3, b = a + TAU / 3;
        masts.add(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R, cx + Math.cos(b) * R, y2, cz + Math.sin(b) * R, 0.09);
      }
    }
    masts.done();
  }
  // dynamic glows: 3 climbers, beacon, 4 bells, the enxaneta's hand
  const glows = billboards(9, world, { depthTest: false });
  glows.mesh.renderOrder = 8;

  // -------------------------------------------------------------------------------------------- tiles and petals (physics, one draw)
  // NA ambient circuit tiles hang 0.2–1 m behind the wall planes (wrapped in height: they stream down as the room rises); the rest is a
  // pool of falling tiles (gravity, spin) and petals (they glide). Positions in the room's frame; the world's sinking and turning are
  // applied to the free ones each frame. tP = (x, y, z, size) · tR = (axis xyz, angle) · tK = (kind, alpha, seed, -)
  // kinds: 0 line tile, 1 gold tile, 2 gold petal, 3 white petal, 4 leaf
  const NA = 36, NF = 1300, NT = NA + NF;
  const tPa = new Float32Array(NT * 4), tRa = new Float32Array(NT * 4), tKa = new Float32Array(NT * 4);
  const TPA = new THREE.InstancedBufferAttribute(tPa, 4), TRA = new THREE.InstancedBufferAttribute(tRa, 4), TKA = new THREE.InstancedBufferAttribute(tKa, 4);
  for (const a of [TPA, TRA, TKA]) a.setUsage(THREE.DynamicDrawUsage);
  {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('tP', TPA); g.setAttribute('tR', TRA); g.setAttribute('tK', TKA); g.instanceCount = NT; geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const p4 = attribute('tP', 'vec4'), r4 = attribute('tR', 'vec4'), k4 = attribute('tK', 'vec4');
    const axis = normalize(r4.xyz.add(vec3(0, 0.0001, 0))), kind = k4.x;
    const petal = step(1.5, kind);
    const q = positionGeometry.xy.mul(vec2(1, mix(float(1), float(0.55), petal)));
    const local = rotA(vec3(q.mul(p4.w), 0), axis, r4.w);
    m.positionNode = select(k4.y.greaterThan(0.002), p4.xyz.add(local), vec3(0, -1e4, 0));
    const vN = varying(rotA(vec3(0, 0, 1), axis, r4.w)), vQ = varying(positionGeometry.xy), vK = varying(kind), vA = varying(k4.y), vSd = varying(k4.z);
    m.colorNode = Fn(() => {
      const V = normalize(positionWorld.sub(cameraPosition));
      const facing = abs(dot(vN, V));
      const glint = pow(facing, 140).mul(0.6);
      const out = vec4(0).toVar();
      If(vK.lessThan(1.5), () => {
        // a tile: black glass, a white edge, a circuit mark; gold tiles have a gold edge
        const e = max(abs(vQ.x), abs(vQ.y)), fw = fwidth(e).add(0.0001);
        const edge = float(1).sub(smoothstep(0.86, fw.mul(2.0).add(0.86), e)).mul(smoothstep(float(0.86).sub(fw.mul(2.5)), 0.86, e));
        const ty = fract(vSd.mul(13.1)).mul(1.2).sub(0.6), mark = float(1).sub(smoothstep(fw.mul(1.0), fw.mul(2.2), abs(vQ.y.sub(ty)))).mul(step(vQ.x, fract(vSd.mul(7.7)).mul(1.2).sub(0.4)));
        const pad = float(1).sub(smoothstep(0.08, fw.mul(2).add(0.08), length(vQ.sub(vec2(fract(vSd.mul(7.7)).mul(1.2).sub(0.4), ty)))));
        const lineC = select(vK.lessThan(0.5), WHITE.mul(uLines), GOLD.mul(1.4));
        const c = lineC.mul(edge.mul(0.55).add(mark.add(pad).mul(0.28))).add(WHITE.mul(glint.mul(0.5))).add(vec3(0.004, 0.005, 0.008));
        const inside = step(e, 0.92);
        out.assign(vec4(c, inside.mul(vA).mul(0.92)));
      }).Else(() => {
        const r2 = dot(vQ, vQ);
        const col = select(vK.lessThan(2.5), GOLD.mul(1.6), select(vK.lessThan(3.5), vec3(1.0, 0.95, 0.85).mul(1.3), vec3(0.03, 0.11, 0.04)));
        const a = exp(r2.mul(-2.8)).mul(step(r2, 1.0));
        out.assign(vec4(col.mul(float(0.7).add(glint.mul(0.4))), a.mul(vA)));
      });
      return out;
    })();
    m.fog = false; mats.push(m);
    var tileMesh = new THREE.Mesh(g, m); tileMesh.frustumCulled = false; tileMesh.renderOrder = 6; object.add(tileMesh);
  }
  // GLASS SHARDS (T-031 polish): the line tiles (kinds 0, 1: ambient and falling) are drawn as physical glass — irregular flat shards
  // with a clear-coat, thin-film iridescence and the host's night environment (room.envMap) in their reflections, a fine white (or gold)
  // line round their rim. Same slots as the tile buffers (index i); a slot not in use has scale 0.
  const shardMesh = (() => {
    const r = rng(404), n = 7, pos = [0, 0, 0], rim = [0], nrm = [0, 0, 1], idx = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU + (r() - 0.5) * 0.6, rr = 0.55 + r() * 0.45; pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0); rim.push(1); nrm.push(0, 0, 1); }
    for (let k = 0; k < n; k++) idx.push(0, 1 + k, 1 + ((k + 1) % n));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('rim', new THREE.Float32BufferAttribute(rim, 1)); g.setIndex(idx);
    geos.push(g);
    const m = new THREE.MeshPhysicalNodeMaterial({ color: 0x06080c, metalness: 0.55, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.9, iridescenceIOR: 1.45, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (room.envMap) { m.envMap = room.envMap; m.envMapIntensity = 3.5; }
    const K = varying(attribute('sK', 'vec4')), vR = varying(attribute('rim', 'float'));
    const edge = smoothstep(float(1).sub(fwidth(vR).mul(1.8)), 1.0, vR);
    m.emissiveNode = mix(WHITE.mul(uLines), GOLD.mul(1.5), K.y).mul(edge.mul(1.15).add(0.02)).mul(K.x);
    m.opacityNode = K.x.mul(edge.mul(0.4).add(0.6));
    m.fog = false; mats.push(m);
    const mesh = new THREE.InstancedMesh(g, m, NT); mesh.frustumCulled = false; mesh.renderOrder = 6;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const sKa = new Float32Array(NT * 4), SK = new THREE.InstancedBufferAttribute(sKa, 4); SK.setUsage(THREE.DynamicDrawUsage); g.setAttribute('sK', SK);
    object.add(mesh);
    return { mesh, sKa, SK };
  })();
  const _m4 = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _ax = new THREE.Vector3(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function setShard(i, x, y, z, ax, ay, az, an, size, seed, alpha, gold) {
    if (alpha <= 0.002) { shardMesh.mesh.setMatrixAt(i, _zero); shardMesh.sKa[i * 4] = 0; return; }
    _ax.set(ax, ay, az); if (_ax.lengthSq() < 1e-6) _ax.set(0, 1, 0); _ax.normalize();
    _qt.setFromAxisAngle(_ax, an); _ps.set(x, y, z);
    const f1 = (seed * 7.31) % 1, f2 = (seed * 13.7) % 1;
    _sc.set(size * (0.55 + 0.6 * f1), size * (0.45 + 0.6 * f2), 1);
    _m4.compose(_ps, _qt, _sc); shardMesh.mesh.setMatrixAt(i, _m4);
    shardMesh.sKa[i * 4] = alpha; shardMesh.sKa[i * 4 + 1] = gold;
  }
  for (let i = 0; i < NT; i++) shardMesh.mesh.setMatrixAt(i, _zero);
  // ambient shards: in loose clusters (a panel half come apart) behind the walls — (wall, u, depth, y0, size, seed, axis, spin)
  const amb = [], SPAN = 9, YMIN = -2.2;
  { const r = rng(91); let cw = 0, cu = 0, cd = 0, cy = 0, left = 0;
    for (let i = 0; i < NA; i++) {
      if (left <= 0) { cw = Math.floor(r() * NW); cu = 0.05 + r() * 0.9; cd = 0.25 + r() * 0.65; cy = r() * SPAN; left = 1 + Math.floor(r() * 3); }
      left--; const ax = [r() - 0.5, r() - 0.5, 2 + r()];
      amb.push({ w: cw, u: cu + (r() - 0.5) * 0.12, d: cd + (r() - 0.5) * 0.15, y0: cy + (r() - 0.5) * 0.5, size: 0.06 + r() * 0.08, seed: r(), ax, a0: r() * TAU, sp: (r() - 0.5) * 0.4, gold: r() < 0.08, hide: 0 });
    } }
  // free particles
  const F = { x: new Float32Array(NF), y: new Float32Array(NF), z: new Float32Array(NF), vx: new Float32Array(NF), vy: new Float32Array(NF), vz: new Float32Array(NF),
    ax: new Float32Array(NF), ay: new Float32Array(NF), az: new Float32Array(NF), an: new Float32Array(NF), av: new Float32Array(NF), s: new Float32Array(NF),
    k: new Float32Array(NF), life: new Float32Array(NF), max: new Float32Array(NF), sd: new Float32Array(NF) };
  let fNext = 0, rs = 12345;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  function spawn(kind, x, y, z, vx, vy, vz, size, life) {
    let i = -1;
    for (let n = 0; n < NF; n++) { const j = (fNext + n) % NF; if (F.life[j] >= F.max[j]) { i = j; break; } }
    if (i < 0) { i = fNext; }                                        // all busy: the oldest slot in turn
    fNext = (i + 1) % NF;
    F.x[i] = x; F.y[i] = y; F.z[i] = z; F.vx[i] = vx; F.vy[i] = vy; F.vz[i] = vz;
    F.ax[i] = rnd() - 0.5; F.ay[i] = rnd() - 0.5; F.az[i] = rnd() - 0.5; F.an[i] = rnd() * TAU; F.av[i] = (kind < 2 ? 2 + rnd() * 5 : 1 + rnd() * 2.5) * (rnd() < 0.5 ? -1 : 1);
    F.s[i] = size; F.k[i] = kind; F.life[i] = 0; F.max[i] = life; F.sd[i] = rnd();
  }
  const _h = new THREE.Vector3(), _q = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function ambPos(a, lift, out) {
    const w = walls[a.w];
    const y = YMIN + (((a.y0 - lift) % SPAN) + SPAN) % SPAN;
    return out.copy(w.pa).addScaledVector(w.right, a.u * w.width).setY(y).addScaledVector(w.normal, -a.d);
  }

  // -------------------------------------------------------------------------------------------- the hands, on the wall planes
  // One instanced sprite per element (T-008 step 0): kind 0 a hand (halo, gold heart, gathered stars), kind 1 a ripple, kind 2 a
  // constellation line between still hands < 2 m apart. Each sprite carries its wall's normal: a camera draws only its own wall's.
  const MAXH = 16, MAXS = 24, MAXR = 16, NSP = (MAXH + MAXR) * 2 + MAXS * 2 + MAXH + 4;   // + l'aleta: rays, the enxanetes
  const HV = Array.from({ length: MAXH }, () => new THREE.Vector4()), SV = Array.from({ length: MAXS }, () => new THREE.Vector4()), SW = Array.from({ length: MAXS }, () => new THREE.Vector4()), RV = Array.from({ length: MAXR }, () => new THREE.Vector4());
  const spG = new THREE.InstancedBufferGeometry();
  spG.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); spG.setIndex([0, 1, 2, 0, 2, 3]);
  const sA = new Float32Array(NSP * 4), sB = new Float32Array(NSP * 4), sN = new Float32Array(NSP * 4), sD = new Float32Array(NSP * 4);
  const SA = new THREE.InstancedBufferAttribute(sA, 4), SB = new THREE.InstancedBufferAttribute(sB, 4), SN = new THREE.InstancedBufferAttribute(sN, 4), SD = new THREE.InstancedBufferAttribute(sD, 4);
  for (const a of [SA, SB, SN, SD]) a.setUsage(THREE.DynamicDrawUsage);
  spG.setAttribute('hA', SA); spG.setAttribute('hB', SB); spG.setAttribute('hN', SN); spG.setAttribute('hD', SD); spG.instanceCount = 0; geos.push(spG);
  {
    const A = attribute('hA', 'vec4'), Bx = attribute('hB', 'vec4'), Nn = attribute('hN', 'vec4'), D = attribute('hD', 'vec4');
    const ax = Bx.xyz, nrm = Nn.xyz, upv = cross(nrm, ax);
    const q = positionGeometry.xy, lx = q.x.mul(Bx.w), ly = q.y.mul(Nn.w);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.positionNode = A.xyz.add(ax.mul(lx)).add(upv.mul(ly)).add(nrm.mul(-0.004));
    const vL = varying(vec2(lx, ly)), vK = varying(A.w), vD = varying(D), vN = varying(nrm), vH = varying(q.x.mul(0.5).add(0.5));
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const c = vec3(0).toVar(), d2 = dot(vL, vL);
      If(vK.lessThan(0.5), () => {
        const st = vD.x.mul(vD.x).mul(float(3).sub(vD.x.mul(2))), pres = vD.y;
        const r = st.mul(0.32).add(0.16);
        c.addAssign(vec3(0.17, 0.16, 0.14).mul(pres.mul(st.mul(0.65).add(0.35))).mul(exp(d2.div(r.mul(r)).negate())).mul(0.5));
        c.addAssign(GOLD.mul(st.mul(pres).mul(exp(d2.mul(-1100))).mul(1.4)));
        // a fine square of line round a still hand (the circuit answers): it draws itself as stillness grows
        const sq = max(abs(vL.x), abs(vL.y)), fw = fwidth(sq).add(0.0001), side = st.mul(0.16).add(0.1);
        c.addAssign(WHITE.mul(float(1).sub(smoothstep(fw, fw.mul(2.5), abs(sq.sub(side)))).mul(st.mul(pres).mul(0.14))));
        const P2 = vec2(vD.z.add(vL.x), vD.w.add(vL.y)), cell = floor(P2.div(0.07)), hsh = hash12(cell), f = fract(P2.div(0.07)).sub(0.5);
        const spark = step(0.9, hsh).mul(exp(dot(f, f).mul(-120))).mul(sin(uTime.mul(hsh.mul(3).add(1)).add(hsh.mul(50))).mul(0.4).add(0.6));
        c.addAssign(vec3(1.0, 0.85, 0.6).mul(spark.mul(pres.mul(st).mul(exp(d2.mul(-1.6)))).mul(1.0)));
      }).ElseIf(vK.lessThan(1.5), () => {
        const age = vD.x, dist = sqrt(d2), rad = age.mul(0.8).add(0.1), life = exp(age.mul(-1.4)).mul(vD.y);
        c.addAssign(WHITE.mul(exp(dist.sub(rad).div(age.mul(0.03).add(0.015)).pow(2).negate()).mul(life).mul(0.12)));
      }).ElseIf(vK.lessThan(2.5), () => {
        const d = abs(vL.y);
        c.addAssign(GOLD.mul(vD.x).mul(exp(d.mul(d).mul(-90000)).mul(0.9).add(exp(d.mul(-40)).mul(0.04))).mul(sin(vH.mul(30).sub(uTime.mul(0.8))).mul(0.25).add(0.75)));
      }).ElseIf(vK.lessThan(3.5), () => {
        // L'ALETA: a gold RAY climbing the wall from a raised hand to the top (vD.x reveal 0..1 from the bottom, vD.y strength,
        // vD.z half width (m), vD.w half height (m))
        const yn = vL.y.add(vD.w).div(vD.w.mul(2)), ax2 = abs(vL.x);
        const core = exp(ax2.div(vD.z.mul(0.35)).pow(2).negate()).add(exp(ax2.div(vD.z).negate()).mul(0.25));
        const shown = smoothstep(vD.x.add(0.02), vD.x.sub(0.02), yn), head = exp(yn.sub(vD.x).div(0.03).pow(2).negate()).mul(step(vD.x, 0.99));
        const flow = sin(yn.mul(40).sub(uTime.mul(6))).mul(0.15).add(0.85);
        c.addAssign(GOLD.mul(core.mul(shown).mul(flow).mul(1.3).add(head.mul(exp(ax2.mul(-12))).mul(2.0))).mul(vD.y));
      }).Else(() => {
        // L'ALETA: the enxaneta's light-silhouette at the top of the wall (head, body, legs, an arm that rises with vD.x)
        const P = vL, fw = fwidth(P.x).add(0.0005);
        const seg = (a, b) => { const pa = P.sub(a), ba = b.sub(a), h = clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1); return length(pa.sub(ba.mul(h))); };
        const ang = mix(float(-1.9), float(1.45), vD.x), sh = vec2(0.035, 0.12), hand = sh.add(vec2(cos(ang), sin(ang)).mul(0.2));
        let d = abs(length(P.sub(vec2(0, 0.25))).sub(0.06));
        d = min(d, seg(vec2(0, 0.17), vec2(0, -0.1)));
        d = min(d, min(seg(vec2(0, -0.1), vec2(-0.07, -0.38)), seg(vec2(0, -0.1), vec2(0.07, -0.38))));
        d = min(d, seg(vec2(-0.035, 0.12), vec2(-0.12, -0.06)));
        d = min(d, seg(sh, hand));
        const line = float(1).sub(smoothstep(fw.mul(1.2), fw.mul(2.6), d)), glow = exp(d.mul(-28)).mul(0.35);
        const palm = exp(length(P.sub(hand)).mul(-30)).mul(vD.x).mul(1.5);
        c.addAssign(GOLD.mul(line.mul(1.4).add(glow).add(palm)).mul(vD.y));
      });
      return vec4(c.mul(uWorld.mul(0.7).add(0.3)), 1);
    })();
    m.fog = false; mats.push(m);
    var handSprites = new THREE.Mesh(spG, m); handSprites.frustumCulled = false; handSprites.renderOrder = 9; object.add(handSprites);
  }
  const wallAt = (s) => { s = ((s % PER) + PER) % PER; for (let i = NW - 1; i >= 0; i--) if (s >= cum[i]) return i; return 0; };
  const onWall = (wi, s, y, out) => { const w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER); return out.copy(w.pa).addScaledVector(w.right, ds + w.width / 2).setY(y); };
  function roundSprite(kind, s, y, R, d0, d1, d2, d3) {
    const wi = wallAt(s), w = walls[wi]; let ds = s - (cum[wi] + w.width / 2); ds -= PER * Math.round(ds / PER);
    for (let n = 0; n < 2; n++) {
      const k = n === 0 ? wi : ds < 0 ? (wi + NW - 1) % NW : (wi + 1) % NW;
      if (n === 1 && Math.abs(ds) < w.width / 2 - R) break;
      onWall(k, s, y, _a); const r = walls[k].right; sprite(kind, _a.x, _a.y, _a.z, r.x, r.y, r.z, R, k, R, d0, d1, d2, d3);
    }
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  let nSp = 0;
  function sprite(kind, cx, cy, cz, axx, axy, axz, half, wi, halfH, d0, d1, d2, d3) {
    if (nSp >= NSP) return;
    const k = nSp * 4, n = walls[wi].normal;
    sA[k] = cx; sA[k + 1] = cy; sA[k + 2] = cz; sA[k + 3] = kind;
    sB[k] = axx; sB[k + 1] = axy; sB[k + 2] = axz; sB[k + 3] = half;
    sN[k] = n.x; sN[k + 1] = n.y; sN[k + 2] = n.z; sN[k + 3] = halfH;
    sD[k] = d0; sD[k + 1] = d1; sD[k + 2] = d2; sD[k + 3] = d3; nSp++;
  }
  function lineSprite(wi, s1, y1, s2, y2, wgt) {
    onWall(wi, s1, y1, _a); onWall(wi, s2, y2, _b); _d.subVectors(_b, _a); const L = _d.length(); if (L < 0.01) return; _d.multiplyScalar(1 / L);
    sprite(2, (_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2, _d.x, _d.y, _d.z, L / 2, wi, 0.06, wgt, 0, 0, 0);
  }
  function fillHands(nH, nS, nR) {
    nSp = 0;
    for (let i = 0; i < nH; i++) { const h = HV[i]; roundSprite(0, h.x, h.y, 1.2, h.w, h.z, h.x, h.y); }
    for (let i = 0; i < nR; i++) { const rp = RV[i]; roundSprite(1, rp.x, rp.y, rp.z * 0.8 + 0.35, rp.z, rp.w, 0, 0); }
    for (let i = 0; i < nS; i++) {
      const sg = SV[i], w1 = wallAt(sg.x), w2 = wallAt(sg.z), wgt = SW[i].x;
      if (w1 === w2) { lineSprite(w1, sg.x, sg.y, sg.z, sg.w, wgt); continue; }
      const fwd = sg.z > sg.x, cs = fwd ? cum[w1] + walls[w1].width : cum[w1];
      const t = (cs - sg.x) / (sg.z - sg.x), yc = sg.y + (sg.w - sg.y) * t;
      lineSprite(w1, sg.x, sg.y, cs - (fwd ? 0.0005 : -0.0005), yc, wgt);
      lineSprite(w2, ((cs % PER) + PER) % PER + (fwd ? 0.0005 : -0.0005), yc, sg.z, sg.w, wgt);
    }
    spG.instanceCount = nSp;
    for (const a of [SA, SB, SN, SD]) a.needsUpdate = true;
  }

  // -------------------------------------------------------------------------------------------- arrive / leave: the night in shards
  const uBreak = uniform(new THREE.Vector3(0, 0.3, -1).normalize());
  const uFallLeave = uniform(0);
  {
    const ico = new THREE.IcosahedronGeometry(11, 9), pa = ico.attributes.position, n = pa.count;
    const jit = (x, y, z) => { const k = Math.round(x * 97) * 73856093 ^ Math.round(y * 97) * 19349663 ^ Math.round(z * 97) * 83492791; const r = rng(k); return [(r() - 0.5) * 0.85, (r() - 0.5) * 0.85, (r() - 0.5) * 0.85]; };
    const pos = new Float32Array(n * 3), cen = new Float32Array(n * 4), bar = new Float32Array(n * 3), r = rng(8);
    for (let t = 0; t < n; t += 3) {
      let cx = 0, cy = 0, cz = 0; const sd = r();
      for (let k = 0; k < 3; k++) { const x = pa.getX(t + k), y = pa.getY(t + k), z = pa.getZ(t + k), j = jit(x, y, z); pos.set([x + j[0], y + j[1], z + j[2]], (t + k) * 3); cx += x / 3; cy += y / 3; cz += z / 3; bar[(t + k) * 3 + k] = 1; }
      for (let k = 0; k < 3; k++) cen.set([cx, cy, cz, sd], (t + k) * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.BufferAttribute(cen, 4)); g.setAttribute('aBar', new THREE.BufferAttribute(bar, 3));
    ico.dispose(); geos.push(g);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const C = attribute('aC', 'vec4'), cdir = normalize(C.xyz), sd = C.w;
    const delay = float(1).sub(dot(cdir, uBreak)).mul(0.2).add(sd.mul(0.14));
    const kL = clamp(uLeave.sub(0.1).sub(delay).div(0.46), 0, 1);
    const kA = clamp(float(1).sub(uArrive.add(0.14).sub(delay.mul(0.6)).div(0.45)), 0, 1);
    const k = max(kL, select(uArrive.lessThan(0.999), kA, float(0)));
    const axis = normalize(vec3(fract(sd.mul(17.3)).sub(0.5), fract(sd.mul(41.7)).sub(0.5), fract(sd.mul(73.1)).sub(0.5)).add(vec3(0, 0.001, 0)));
    const ang = k.mul(fract(sd.mul(131.0)).mul(2.5).add(0.6));
    const shrink = smoothstep(0.95, 0.6, k);
    const local = rotA(positionGeometry.sub(C.xyz).mul(shrink), axis, ang);
    // leaving, the shards FALL (we are high): they drop and turn into the depth; arriving, they rise into place
    m.positionNode = C.xyz.mul(float(1).add(k.mul(0.35))).add(vec3(0, k.mul(k).mul(fract(sd.mul(9.1)).mul(9).add(4)).negate(), 0)).add(local);
    const vDir = varying(normalize(positionGeometry)), vK = varying(k), vBar = varying(attribute('aBar', 'vec3')), vD = varying(delay), vSd = varying(fract(sd.mul(57.3)));
    const vN = varying(rotA(cdir, axis, ang));
    m.colorNode = Fn(() => {
      const img = domeCol(vDir).mul(float(1).sub(vK.mul(0.6)));
      const r0 = fract(vSd.mul(13.7)), r1 = fract(vSd.mul(29.3)), r2 = fract(vSd.mul(51.1));
      const ex = select(r0.lessThan(0.3), vBar.x, float(1)), ey = select(r1.lessThan(0.25), vBar.y, float(1)), ez = select(r2.lessThan(0.2), vBar.z, float(1));
      const edge = min(min(ex, ey), ez);
      const line = float(1).sub(smoothstep(0.0, fwidth(vBar.x.add(vBar.y)).mul(0.9), edge));
      const seedsNear = max(max(step(0.93, fract(vSd.mul(7.1))), smoothstep(0.55, 0.0, vD)), float(0));
      const spread = max(smoothstep(vD.mul(0.9).add(0.02), vD.mul(0.9).add(0.12), uLeave).mul(seedsNear.mul(0.6).add(0.4)), smoothstep(0.35, 0.15, vK).mul(step(uArrive, 0.999)).mul(smoothstep(0.95, 0.7, uArrive)).mul(0.25));
      const crack = line.mul(spread).mul(smoothstep(0.6, 0.15, vK)).mul(0.55);
      const V = normalize(positionWorld.sub(cameraPosition)), Rr = V.sub(vN.mul(dot(V, vN).mul(2)));
      const sheen = pow(max(dot(Rr, uBreak), 0), 80).mul(sin(vK.mul(3.1416))).mul(0.9);
      const burst = smoothstep(0.55, 0.7, vK).mul(smoothstep(0.9, 0.72, vK)).mul(step(vSd, 0.25)).mul(step(0.001, uLeave));
      const inBand = smoothstep(-0.30, -0.20, V.y).mul(smoothstep(0.08, 0.0, V.y));
      const goldK = float(1).sub(uFallLeave).mul(float(1).sub(inBand.mul(0.75)));
      // the cracks are white line (the city's ink); gold only where the crown's light breaks through
      const col = img.mul(float(1).sub(burst.mul(goldK))).mul(float(1).sub(inBand.mul(0.3))).add(WHITE.mul(crack.mul(float(1).sub(uFallLeave.mul(0.6))))).add(GOLD.mul(sheen.add(burst.mul(1.4)).mul(goldK)));
      const alpha = max(smoothstep(0.02, 0.32, uLeave), step(uArrive, 0.999).mul(smoothstep(1.0, 0.82, uArrive))).mul(smoothstep(1.0, 0.8, vK));
      return vec4(col, alpha);
    })();
    m.fog = false; mats.push(m);
    var leaveMesh = new THREE.Mesh(g, m); leaveMesh.position.copy(EYE); leaveMesh.frustumCulled = false; leaveMesh.renderOrder = 7; leaveMesh.visible = false; object.add(leaveMesh);
  }

  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {                // wall: room.walls index · u: 0..1 along it · strength: 0..1
    if (!fxBc || fxN >= 16) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }
  function fxAt(p, strength, mat, kind) {                         // the same from a world point (the wall it is seen through from the eye)
    const W = room.walls, e = room.eye, dx = p.x - e.x, dz = p.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
  }
  const bloomSnd = new Float32Array(128).fill(-99), _fx = new THREE.Vector3();
  let floorSnd = 0;

  // -------------------------------------------------------------------------------------------- per frame
  const pool = Array.from({ length: 32 }, () => ({ stroke: null, vs: 0, still: 0, emit: 0, seen: 0, s: 0, y: 0, fall: 0, petal: 0, garden: -1 }));
  const rip = Array.from({ length: MAXR }, () => ({ s: 0, y: 0, age: 99, amp: 0 }));
  const bells = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, age: 99 }));
  const addRip = (s, y, a) => { let b = rip[0]; for (const r of rip) if (r.age > b.age) b = r; b.s = s; b.y = y; b.age = 0; b.amp = a; };
  let aletaT = 0, frame = 0, qShown = -1, agit = 0, raise = 0, prevQ = 0, crownK = 0;
  let Acur = -1, Avel = 0, yaw = 0, prevLift = 0, prevYaw = 0, maxYawRate = 0, maxAcc = 0, falls = 0, blooms = 0;
  const _p = new THREE.Vector3(), order = [];
  const gW = new Float32Array(NGD * 3), lightP = new THREE.Vector3(); let lightOn = 0;                                // the gardens' centres in the room's frame (per frame)
  function burstTiles(h, n, speed) {
    const w = walls[h.wall];
    // a CLUSTER: the pieces of one panel come apart together (tight, a shared push, a little divergence), sizes from chips to plates
    const off = 0.3 + rnd() * 0.5, out = 0.7 + rnd() * 1.0 + speed * 0.5, up = 0.5 + rnd() * 1.2 + (h.vy || 0) * 0.3, side = (h.vx || 0) * 0.5 + (rnd() - 0.5) * 0.6;
    const gold = rnd() < 0.15;
    fxImpact(h.wall, h.u, Math.min(1, 0.3 + n * 0.05 + speed * 0.2), 'line', 'hit');
    for (let k = 0; k < n; k++) {
      const sx = (rnd() - 0.5) * 0.5, sy = (rnd() - 0.5) * 0.45, o2 = off + (rnd() - 0.5) * 0.15;
      _q.copy(h.pos).addScaledVector(w.normal, -o2).addScaledVector(w.right, sx); _q.y += sy;
      const dv = 0.35;
      spawn(gold && rnd() < 0.6 ? 1 : 0, _q.x, _q.y, _q.z,
        -w.normal.x * out + w.right.x * (side + sx * 1.2 + (rnd() - 0.5) * dv), up + sy * 1.2 + (rnd() - 0.5) * dv, -w.normal.z * out + w.right.z * (side + sx * 1.2 + (rnd() - 0.5) * dv),
        0.09 + Math.pow(rnd(), 1.6) * 0.38, 7);
    }
    falls += n;
  }
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    const time = input.time ?? 0, pr = input.params || P, S = input.state || null;
    uTime.value = time;
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    // ---- the state (the score's, or a stand-in)
    let progress, climber, cl, restless = false;
    order.length = 0;
    if (S && Array.isArray(S.walls)) for (let w = 0; w < S.walls.length && w < NW; w++) if (S.walls[w]) order.push(w);
    if (!order.length) { const nw = Math.max(2, Math.min(NW, Math.round(pr.walls ?? NW))); for (let w = 0; w < nw; w++) order.push(w); }
    if (S) { progress = S.progress ?? 0; climber = S.climber ?? 0; cl = S.climb ?? 0; restless = !!S.restless; }
    else {
      progress = (pr.cycle > 0) ? ((time % pr.cycle) / pr.cycle) : (input.progress ?? pr.progress ?? 0);
      climber = pr.climber >= 0 ? Math.round(pr.climber) : Math.min(2, Math.floor(progress * 3));
      cl = pr.climb >= 0 ? pr.climb : clamp01(progress * 3 - climber);
      if (pr.climber >= 0 || pr.climb >= 0) progress = (climber + cl) / 3;
      restless = !!pr.restless;
    }
    climb.A1 = pr.height > 0 ? Math.max(30, Math.min(120, pr.height)) : 90;   // metres (0 = 90 m); below 30 m there is no rise (and the haze would sit at the eye): clamped
    if (order.join(',') !== climb.order.join(',')) climb.order = order.slice();
    build();
    // ---- agitation, hesitation, the shown climb
    agit += ((restless ? 1 : 0) - agit) * (1 - Math.exp(-dt * (restless ? 6 : 1.2)));
    const q = Math.min(3, climber + cl);
    if (qShown < 0 || Math.abs(q - qShown) > 0.6) qShown = q;
    else { qShown += (q - qShown) * (1 - Math.exp(-dt * 2.5 * (1 - 0.85 * agit))); qShown = Math.max(0, qShown - agit * 0.004 * dt); }
    const done = qShown >= 2.995 || (S && S.phase === 'reward');
    // ---- THE RISE: a critically damped spring on the height (smooth acceleration, never a jump), and a slow turn with it
    const At = Aof(qShown / 3);
    if (Acur < 0) { Acur = At; Avel = 0; }
    else {
      const om = 1.1, acc = om * om * (At - Acur) - 2 * om * Avel;
      const accC = Math.max(-1.2, Math.min(1.2, acc));
      Avel = Math.max(-4, Math.min(4, Avel + accC * dt)); Acur += Avel * dt; maxAcc = Math.max(maxAcc, Math.abs(accC));
    }
    const A = Acur + 0.03 * Math.sin(time * 0.9) * (1 - crownK);
    const lift = A - 1.6;
    uA.value = A; uLift.value = lift; world.position.y = -lift;
    uHazeY.value = Aof(0.6) - lift;                                 // the layer's middle in the room's frame (the eye's height at p 0.6)
    uHazeK.value = pr.haze ?? 1;
    const spin = ((pr.spin ?? 90) * Math.PI) / 180;
    const yawT = spin * clamp01(lift / (climb.A1 - 1.6));
    const yr = (3 * Math.PI / 180) * dt;                               // the turn never exceeds 3°/s (comfort limit 6°/s)
    yaw = frame <= 1 ? yawT : yaw + Math.max(-yr, Math.min(yr, yawT - yaw)); city.rotation.y = yaw; uYawCS.value.set(Math.cos(yaw), Math.sin(yaw));
    if (frame > 2 && dt > 0) maxYawRate = Math.max(maxYawRate, Math.abs(yaw - prevYaw) / dt * 180 / Math.PI);
    const dLift = lift - prevLift, dYaw = yaw - prevYaw; prevLift = lift; prevYaw = yaw;
    uQ.value = qShown;
    // ---- arrivals: the bell of light
    const events = input.events;
    const ring = (n) => { let b = bells[0]; for (const x of bells) if (x.age > b.age) b = x; pathPos(n, 1, _p); b.x = _p.x; b.y = _p.y; b.z = _p.z; b.age = 0; uBell.value = 1; if (n === 2) raise = Math.max(raise, 0.001); };
    if (S && events) { for (const e of events) if (typeof e === 'string' && e.startsWith('arrived:')) ring(+e.slice(8) || 0); }
    else if (!S) { if (Math.floor(qShown) > Math.floor(prevQ) && qShown - prevQ < 0.5) ring(Math.floor(qShown) - 1); if (qShown >= 2.995 && prevQ < 2.995) ring(2); }
    prevQ = qShown;
    if (done) raise = Math.max(raise, 0.001);
    if (qShown < 2.9 && !done) raise = 0;
    if (raise > 0) raise = Math.min(1, raise + dt / 2.2);
    uBell.value = Math.max(0, uBell.value - dt * 0.6);
    crownK += ((raise > 0 ? 1 : 0) - crownK) * (1 - Math.exp(-dt * 0.6));
    uCalm.value = crownK;
    // ---- arrive / leave
    const arrive = input.arrive ?? (S ? 1 : pr.arrive ?? 1), leave = input.leave ?? (S ? 0 : pr.leave ?? 0);
    uArrive.value = arrive; uLeave.value = leave;
    leaveMesh.visible = leave > 0.001 || arrive < 0.999;
    uDomeIn.value = Math.min(1, Math.max(0, (arrive - 0.1) / 0.6));
    dome.visible = arrive > 0.1;
    const fallLeave = leave > 0 && (S ? (S.block === 'fall' || S.outcome === 'intent') : !!pr.fallLeave);
    uFallLeave.value = fallLeave ? 1 : 0;
    uWorld.value = sm((arrive - 0.45) / 0.45) * (1 - sm((leave - 0.05) / 0.35));
    canyon.visible = blockMesh.visible = uWorld.value > 0.02;   // opaque black volumes: not before they show
    uStars.value = pr.stars ?? 1; uLines.value = pr.lines ?? 1; uGard.value = pr.gardens ?? 1; uGold.value = pr.gold ?? 1;
    uShiver.value = agit;
    // ---- the gardens in the room's frame (for the hands)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let g = 0; g < NGD; g++) { const G = gardens[g]; gW[g * 3] = G.x * cy + G.z * sy; gW[g * 3 + 1] = G.y - lift; gW[g * 3 + 2] = -G.x * sy + G.z * cy; bloomT[g] = 0; }
    // ---- the light's passing makes the gardens near it bloom (the reward of the climb)
    if (lightOn) for (let g = 0; g < NGD; g++) { const d = Math.hypot(gW[g * 3] - lightP.x, gW[g * 3 + 1] - (lightP.y - lift), gW[g * 3 + 2] - lightP.z); if (d < 7) bloomT[g] = Math.max(bloomT[g], sm(1 - d / 7)); }
    // ---- hands: stillness blooms a garden; movement shakes tiles loose
    const hands = input.hands || [];
    let nH = 0, moving = 0;
    const tilesK = pr.tiles ?? 1;
    for (const h of hands) {
      let st = null; for (const p of pool) if (p.stroke === h.stroke) { st = p; break; }
      const s = cum[h.wall] + h.u * walls[h.wall].width;
      if (!st) { st = pool.find((p) => p.seen !== frame - 1 && p.seen !== frame) || pool[0]; st.stroke = h.stroke; st.vs = 0; st.s = s; st.y = h.pos.y; st.still = 0; st.emit = 0; st.fall = 0; st.petal = 0; st.garden = -1; addRip(s, h.pos.y, 0.35); if (uWorld.value > 0.2) burstTiles(h, Math.round(9 * tilesK), 0); }
      // speed: the sensor's, or our own from the stroke's path (smoothed over ~0.15 s)
      { let ds = s - st.s; ds -= PER * Math.round(ds / PER); const v = Math.hypot(ds, h.pos.y - st.y) / Math.max(dt, 1e-3); st.vs += (v - st.vs) * (1 - Math.exp(-dt / 0.15)); }
      st.seen = frame; st.s = s; st.y = h.pos.y;
      const sp = Math.max(Math.hypot(h.vx || 0, h.vy || 0), st.vs);
      if (sp > 0.3) {
        st.still = Math.max(0, st.still - dt * 4); moving++;
        st.emit -= dt; if (st.emit <= 0) { addRip(st.s, st.y, Math.min(1, 0.4 + sp)); st.emit = 0.45; }
        if (uWorld.value > 0.2) {
          st.fall += dt * 3.2 * Math.min(1.5, sp / 0.5) * tilesK;            // ~3 clusters a second of 3–5 pieces
          if (st.fall >= 1) { st.fall -= 1; burstTiles(h, 3 + Math.floor(rnd() * 3), sp); }
          // ambient tiles near the hand come loose and fall too
          for (const a of amb) {
            if (a.hide > time || a.w !== h.wall) continue;
            ambPos(a, lift, _h); if (_h.distanceToSquared(h.pos) > 1.2) continue;
            a.hide = time + 5 + rnd() * 4;
            spawn(a.gold ? 1 : 0, _h.x, _h.y, _h.z, -walls[a.w].normal.x * (0.6 + rnd()), 0.3 + rnd() * 0.8, -walls[a.w].normal.z * (0.6 + rnd()), a.size, 7); falls++;
          }
        }
      } else st.still = Math.min(1, st.still + dt / 2);
      // stillness: the garden it points at (≤ 28° off, nearest in angle, weighted to the near ones) opens
      if (st.still > 0.3 && uWorld.value > 0.2) {
        _h.copy(h.pos).sub(EYE).normalize();
        let best = -1, bs = Math.cos(0.5);
        for (let g = 0; g < NGD; g++) {
          const dx = gW[g * 3] - EYE.x, dy = gW[g * 3 + 1] - EYE.y, dz = gW[g * 3 + 2] - EYE.z, L = Math.hypot(dx, dy, dz);
          if (L > 45) continue;
          const c = (dx * _h.x + dy * _h.y + dz * _h.z) / L - L * 0.0015;
          if (c > bs) { bs = c; best = g; }
        }
        if (best >= 0) { bloomT[best] = Math.max(bloomT[best], sm((st.still - 0.3) / 0.5)); if (st.garden !== best) { st.garden = best; blooms++; } }
        // petals from the hand itself, a few (the answer is always there, even with no garden in view)
        st.petal += dt * 3 * st.still;
        while (st.petal >= 1) {
          st.petal -= 1; const w = walls[h.wall];
          _q.copy(h.pos).addScaledVector(w.normal, -(0.3 + rnd() * 0.5)).addScaledVector(w.right, (rnd() - 0.5) * 0.5); _q.y += 0.2 + rnd() * 0.4;
          spawn(rnd() < 0.75 ? 2 : 3, _q.x, _q.y, _q.z, -w.normal.x * 0.2, 0.1, -w.normal.z * 0.2, 0.025 + rnd() * 0.03, 8);
        }
      }
      if (nH < MAXH) { HV[nH].set(st.s, st.y, 1, st.still); nH++; }
    }
    for (const p of pool) if (p.seen !== frame) p.stroke = null;
    let nS = 0;
    for (let i = 0; i < nH && nS < MAXS; i++) for (let j = i + 1; j < nH && nS < MAXS; j++) {
      const si = HV[i].w, sj = HV[j].w; if (si < 0.3 || sj < 0.3) continue;
      let dx = HV[j].x - HV[i].x; dx -= PER * Math.round(dx / PER); const dy = HV[j].y - HV[i].y, d = Math.hypot(dx, dy); if (d > 2) continue;
      SV[nS].set(HV[i].x, HV[i].y, HV[i].x + dx, HV[j].y); const f = (Math.min(si, sj) - 0.3) / 0.7; SW[nS].set(f * f * (1 - Math.pow(d / 2, 3)) * 0.5, 0, 0, 0); nS++;
    }
    let nR = 0; for (const r of rip) { r.age += dt; if (r.age < 3.5 && nR < MAXR) { RV[nR].set(r.s, r.y, r.age, r.amp); nR++; } }
    fillHands(nH, nS, nR);
    // ---- L'ALETA (T-042, ENT's T-039): phase 'aleta' of the pom (8 s after the reward). The enxaneta raises her hand at the top of every
    // structure wall; each visitor hand that rose ≥ 0.28 m from its baseline (state.strokes: y0, rise), or is above 1.6 m, sends a gold ray
    // up the wall to the top, wider the more hands rose (aletaHands; aletaWidth when the crown comes). Study: params.aleta (0..1, −1 off).
    {
      let ak = -1, share = 0;
      if (S) { if (S.phase === 'aleta') { ak = clamp01((S.tp ?? 0) / 10); share = Math.max(S.aletaHands ?? 0, S.aletaWidth ?? 0); } }
      else if ((pr.aleta ?? -1) >= 0) ak = clamp01(pr.aleta);
      aletaT = ak >= 0 ? aletaT + dt : 0;
      if (ak >= 0) {
        let raised = 0;
        for (const h of hands) {
          const st = pool.find((p) => p.stroke === h.stroke); if (!st) continue;
          // T-047 (#15, B-07): the part's OWN baseline per hand — its height when the window opened (or when it landed, if later), as the
          // score measures it (score.js › aleta: rise 0.28 m above that, or > 1.6 m after 2 s). Never S.strokes: the sound's stroke ids
          // are not the image's, and so.rise follows a 6 s baseline (a raised and held hand would lose its ray).
          if (st.alY0 == null) st.alY0 = h.pos.y;
          const up = h.pos.y - st.alY0 >= 0.28 || (h.pos.y > 1.6 && aletaT >= 2);
          st.ray = Math.max(0, Math.min(1, (st.ray || 0) + (up ? dt / 0.8 : -dt / 1.5)));
          if (up) raised++;
        }
        if (!S) share = hands.length ? raised / hands.length : 0;
        const halfW = 0.04 + 0.11 * share;
        for (const h of hands) {
          const st = pool.find((p) => p.stroke === h.stroke); if (!st || !(st.ray > 0)) continue;
          const w = walls[h.wall], top = w.height, y0 = h.pos.y, hh = Math.max(0.05, (top - y0) / 2);
          _a.copy(w.pa).addScaledVector(w.right, h.u * w.width).setY(y0 + hh);
          sprite(3, _a.x, _a.y, _a.z, w.right.x, w.right.y, w.right.z, halfW * 3, h.wall, hh, sm(st.ray), 1, halfW, hh);
        }
        const raise = sm((aletaT - 0.4) / 1.5), show = sm(aletaT / 0.6);
        for (const wi of climb.order) { const w = walls[wi]; _a.copy(w.pa).addScaledVector(w.right, w.width / 2).setY(w.height - 0.55); sprite(4, _a.x, _a.y, _a.z, w.right.x, w.right.y, w.right.z, 0.5, wi, 0.5, raise, show * (pr.gold ?? 1), 0, 0); }
        spG.instanceCount = nSp; for (const a of [SA, SB, SN, SD]) a.needsUpdate = true;
      } else for (const p of pool) { p.alY0 = null; p.ray = 0; }
    }
    if (!S && moving) restless = true;
    // ---- the gardens: bloom follows stillness (opens in ~1 s, closes in ~5 s); open gardens shed petals
    for (let g = 0; g < NGD; g++) {
      const t = bloomT[g], b = bloom[g];
      bloom[g] = b + (t - b) * (1 - Math.exp(-dt * (t > b ? 2.2 : 0.35)));
      bloomV[g].x = bloom[g];
      if (bloom[g] > 0.5 && b <= 0.5 && time - bloomSnd[g] > 2) { bloomSnd[g] = time; _fx.set(gW[g * 3], gW[g * 3 + 1], gW[g * 3 + 2]); fxAt(_fx, Math.min(1, 0.4 + t * 0.5), 'petal', 'bloom'); }
      if (bloom[g] > 0.15 && rnd() < dt * 14 * bloom[g]) {
        const G = gardens[g];
        const a = (rnd() - 0.5) * G.tl, ca = Math.cos(G.ang), sa = Math.sin(G.ang);
        const lx = G.x - sa * a, lz = G.z + ca * a, ly = G.y + 1 + rnd() * 2;
        spawn(rnd() < 0.7 ? 2 : rnd() < 0.6 ? 3 : 4, lx * cy + lz * sy, ly - lift, -lx * sy + lz * cy, -ca * 0.6 * (rnd() + 0.3), 0.2, -sa * 0.6 * (rnd() + 0.3), 0.04 + rnd() * 0.05, 14);
      }
    }
    // ---- physics of the free particles (the world's sink and turn applied: they live in it)
    const cd = Math.cos(dYaw), sd = Math.sin(dYaw);
    let alive = 0;
    for (let i = 0; i < NF; i++) {
      const o = (NA + i) * 4;
      if (F.life[i] >= F.max[i]) { tKa[o + 1] = 0; if (F.k[i] < 2 && F.max[i] > 0) { setShard(NA + i, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0); F.max[i] = -1; F.life[i] = 0; } continue; }
      F.life[i] += dt;
      const k = F.k[i];
      let x = F.x[i] * cd + F.z[i] * sd, z = -F.x[i] * sd + F.z[i] * cd, y = F.y[i] - dLift;
      if (k < 2) {                                                   // a tile: gravity, a little air
        F.vy[i] -= 9.8 * dt; const dr = Math.exp(-dt * 0.08); F.vx[i] *= dr; F.vy[i] *= dr; F.vz[i] *= dr;
      } else {                                                       // a petal: it glides, swings, turns
        F.vy[i] += (-1.1 - F.vy[i] * 1.6) * dt;
        const sw = Math.sin(F.life[i] * (1.3 + F.sd[i]) + F.sd[i] * 30) * 0.6;
        F.vx[i] += (sw * (z > 0 ? 1 : -1) * 0.3 - F.vx[i] * 0.4) * dt; F.vz[i] += (-sw * (x > 0 ? 1 : -1) * 0.3 - F.vz[i] * 0.4) * dt;
      }
      x += F.vx[i] * dt; y += F.vy[i] * dt; z += F.vz[i] * dt;
      // nothing comes into the room: a particle that drifts inside the walls' square is pushed back out
      const rr = Math.hypot(x, z);
      if (rr < 3.9) { const f = 3.9 / Math.max(rr, 0.01); x *= f; z *= f; }
      if (k < 2 && F.y[i] > -lift && y <= -lift && time - floorSnd > 0.3) { floorSnd = time; _fx.set(x, y, z); fxAt(_fx, 0.3, 'line', 'floor'); }
      F.x[i] = x; F.y[i] = y; F.z[i] = z;
      F.an[i] += F.av[i] * dt;
      if (y < EYE.y - 70) F.life[i] = F.max[i];
      const L = F.life[i] / F.max[i];
      const a = Math.min(1, F.life[i] * 8) * (1 - sm((L - 0.75) / 0.25)) * uWorld.value;
      tPa[o] = x; tPa[o + 1] = y; tPa[o + 2] = z; tPa[o + 3] = F.s[i];
      tRa[o] = F.ax[i]; tRa[o + 1] = F.ay[i]; tRa[o + 2] = F.az[i]; tRa[o + 3] = F.an[i];
      if (k < 2) { tKa[o + 1] = 0; setShard(NA + i, x, y, z, F.ax[i], F.ay[i], F.az[i], F.an[i], F.s[i], F.sd[i], a, k); }
      else { tKa[o] = k; tKa[o + 1] = a; tKa[o + 2] = F.sd[i]; }
      alive++;
    }
    // ---- ambient tiles: hung behind the walls, streaming down with the rise
    const ak = (pr.tiles ?? 1) > 0 ? uWorld.value : 0;
    for (let i = 0; i < NA; i++) {
      const a = amb[i], o = i * 4;
      ambPos(a, lift, _h);
      const yy = (_h.y - YMIN) / SPAN, edge = sm(yy / 0.12) * sm((1 - yy) / 0.12);
      const back = a.hide > time ? 0 : sm((time - a.hide) / 1.5);
      tPa[o] = _h.x; tPa[o + 1] = _h.y; tPa[o + 2] = _h.z; tPa[o + 3] = a.size;
      tRa[o] = a.ax[0]; tRa[o + 1] = a.ax[1]; tRa[o + 2] = a.ax[2]; tRa[o + 3] = a.a0 + time * a.sp;
      tKa[o + 1] = 0; setShard(i, _h.x, _h.y, _h.z, a.ax[0], a.ax[1], a.ax[2], a.a0 + time * a.sp, a.size, a.seed, edge * back * ak, a.gold ? 1 : 0);
      // up top, petals rise WITH us (ARTE round 2): ≤ 6 per wall in the near layer, gold and cream, swaying, 0.3–0.8 m behind the wall
      if (i < 6 * NW) {
        const w = walls[i % NW], hs = (a.seed * 7.13) % 1, yy2 = 0.4 + (((hs + time * 0.035) % 1) + 1) % 1 * 2.9;
        _q.copy(w.pa).addScaledVector(w.right, (0.08 + 0.84 * ((a.seed * 3.7) % 1)) * w.width + Math.sin(time * 0.5 + i) * 0.15).setY(yy2).addScaledVector(w.normal, -(0.3 + 0.5 * hs));
        const k2 = sm((qShown / 3 - 0.45) / 0.15) * sm((yy2 - 0.4) / 0.4) * sm((3.3 - yy2) / 0.4) * uWorld.value;
        tPa[o] = _q.x; tPa[o + 1] = _q.y; tPa[o + 2] = _q.z; tPa[o + 3] = 0.05 + 0.03 * hs;
        tRa[o] = 0.3; tRa[o + 1] = 1; tRa[o + 2] = 0.2; tRa[o + 3] = time * (0.6 + hs) + i;
        tKa[o] = i % 3 ? 2 : 3; tKa[o + 1] = k2; tKa[o + 2] = a.seed;
      }
    }
    TPA.needsUpdate = true; TRA.needsUpdate = true; TKA.needsUpdate = true; shardMesh.mesh.instanceMatrix.needsUpdate = true; shardMesh.SK.needsUpdate = true;
    // ---- the lights
    const ci = Math.min(2, Math.floor(qShown)), cc = Math.min(1, qShown - ci);
    const flick = 1 - agit * 0.65 * (0.5 + 0.5 * Math.sin(time * 21 + 3 * Math.sin(time * 6.3)));
    for (let i = 0; i < 3; i++) {
      if (i < ci) { pathPos(i, 1, _p); const b = 0.35 * (0.85 + 0.15 * Math.sin(time * 1.3 + i)); glows.set(i, _p.x, _p.y, _p.z, 0.3, 1.0 * b * 2.4, 0.8 * b * 2.4, 0.5 * b * 2.4, 1); }
      else if (i === ci) {
        pathPos(i, cc, _p); _p.x += agit * 0.02 * Math.sin(time * 17); _p.y += agit * 0.02 * Math.sin(time * 13);
        const b = flick * (0.9 + 0.1 * Math.sin(time * 1.3)) * (fallLeave ? 1 - sm(leave / 0.2) : 1 + crownK * 0.35 + leave * 1.0) * (pr.gold ?? 1);
        glows.set(i, _p.x, _p.y, _p.z, 0.42 + 0.12 * crownK + leave * 0.6, 1.0 * b * 3.2, 0.8 * b * 3.2, 0.5 * b * 3.2, 1); lightP.copy(_p); lightOn = 1;
      } else glows.set(i, 0, 0, 0, 0, 0, 0, 0, 1);
    }
    {
      const n = climb.order.length, sf = cc * n, k = Math.min(n - 1, Math.floor(sf)), f = sf - k;
      let b = 0;
      if (k < n - 1 && !done) { b = sm((f - 0.4) / 0.32) * (1 - sm((f - 0.92) / 0.08)); pathPos(ci, (k + 1) / n, _p); }
      if (b === 0) glows.set(3, 0, 0, 0, 0, 0, 0, 0, 0); else glows.set(3, _p.x, _p.y, _p.z, 1.6, 0.5 * b, 0.32 * b, 0.12 * b, 0);
    }
    for (let j = 0; j < 4; j++) { const bl = bells[j]; bl.age += dt; const a = bl.age, L = a < 3 ? (1 - a / 3) : 0; glows.set(4 + j, bl.x, bl.y, bl.z, L > 0 ? 0.4 + a * 1.6 : 0, 1.0 * L * 1.2, 0.7 * L * 1.2, 0.35 * L * 1.2, 2); }
    if (raise > 0) { pathPos(2, 1, _p); const h = sm(raise) * 0.32; glows.set(8, _p.x, _p.y + h + 0.05, _p.z, Math.max(0.01, h), 2.4 * sm(raise), 1.6 * sm(raise), 0.7 * sm(raise), 3); }
    else glows.set(8, 0, 0, 0, 0, 0, 0, 0, 3);
    if (fallLeave) { const kf = 1 - sm(leave / 0.2); for (let i = 0; i < 9; i++) for (let c = 0; c < 3; c++) glows.aC[i * 4 + c] *= kf; }
    glows.AP.needsUpdate = true; glows.AC.needsUpdate = true;
    pathPos(2, 1, _p); _p.y -= lift; uBreak.value.copy(_p).sub(EYE).normalize();
    if (stats) { stats.A = A; stats.maxYawRate = maxYawRate; stats.maxAcc = maxAcc; stats.falls = falls; stats.blooms = blooms; stats.alive = alive; stats.yawDeg = yaw * 180 / Math.PI; }
  }
  build();
  function setParams() { /* read live in update() */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); try { fxBc?.close(); } catch { /* closed */ } }
  const stats = typeof window !== 'undefined' ? (window.__pom3d = { boxes: NBOX, blocks: blocks.length, gardens: NGD, gardenPoints, A: 0, maxYawRate: 0, maxAcc: 0, falls: 0, blooms: 0, alive: 0, yawDeg: 0 }) : null;
  return { object, update, setParams, dispose };
}
