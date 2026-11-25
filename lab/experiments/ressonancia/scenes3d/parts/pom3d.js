// Ressonància — part «pom3d»: IV. Pom de dalt — Valor (STUDIO NIGHT 25-11, plan 05 M5; director's direction after the Art Director's
// review #4; contract ../PARTS.md). The previous Pom (a city of white circuit lines) is in git (a383d25 and before).
//
// THE POM IS THE RAISED TOWER ITSELF in the almost-dark square (plaza + tronc3d in 'top' mode draw them; palette 05 §2.7, Pom: nit-alta
// · blau-hora · lluna, luma ~0.12). This part is only what happens ON the tower:
// - the climbers: the dosos (two), the acotxador, the enxaneta — SMALL particle figures (../bodykit.js, child scale, a cool lluna key and back,
//   monochrome) that climb the trunk of the tower, on its face towards the room, at the axis tronc3d gives (trunk(floor, tower));
// - ONE light of `or` that rises with them (in the climber's raised hand), the soft halo behind it; the only warm thing of strength;
// - a relay handoff (the score lifts her +12 %) = a visible JUMP up the tower (and across to the tower of the light's wall, if it is
//   another); a slip (the climb going down: a broken silence, a falter) = a SLIDE down with a trail of dust;
// - the silence: the tower breathes in half-dark (a veil of cool haze in front of it, pulsing slowly);
// - l'aleta: the enxaneta's particles turn gold (the crown: the only gold on a body), her raised arm sends a ray up; visitors' hands that
//   rise send gold rays up their walls;
// - a few subtle strata of haze far behind, and cool motes drifting down as she climbs (the sense of height);
// - hands (on the wall plane): a soft cool glow, brighter when still (no rings, no reticles); the hand that holds the light: gold.
// Nothing hangs above the visitors that is not on the tower. Without tronc3d (study page) a ghost tower stands in for its geometry.

import { canEmit } from '../emit.js';
import { lin } from '../palette.js';
import { createBodies } from '../bodykit.js';

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const { Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, positionGeometry, cameraPosition, cameraProjectionMatrix,
    modelViewMatrix, mix, smoothstep, sin, cos, abs, max, min, exp, pow, normalize, dot, cross, length, fract, floor, clamp, If, Discard, select, cameraWorldMatrix, mod, sqrt } = TSL;

  // -------------------------------------------------------------------------------------------- helpers
  function rng(s) { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = rng(9031);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const sm = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
  const TAU = Math.PI * 2;
  const walls = room.walls, NW = walls.length, EYE = room.eye.clone();
  const cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
  const wrapS = (s) => ((s % PER) + PER) % PER;
  const wallAt = (s) => { s = wrapS(s); for (let i = NW - 1; i >= 0; i--) if (s >= cum[i]) return i; return 0; };
  const cdS = (a, b) => { let d = wrapS(a - b); if (d > PER / 2) d -= PER; return d; };

  // palette (05 §2.7, Pom) — linear RGB
  const BLAU = lin('blau-hora'), LLUNA = lin('lluna'), OR = lin('or');
  const v3 = (a, k = 1) => vec3(a[0] * k, a[1] * k, a[2] * k);
  const GOLD = v3(OR), COOL = v3(LLUNA), DEEP = v3(BLAU);

  // -------------------------------------------------------------------------------------------- uniforms, groups
  const uTime = uniform(0), uLift = uniform(0), uCityY = uniform(0), uWorld = uniform(1), uA = uniform(1.6);
  const uStrata = uniform(1), uGust = uniform(0);
  const object = new THREE.Group(); object.name = 'pom3d';
  const city = new THREE.Group(); object.add(city);                // the far strata: they sink as she climbs (×CITYK)
  const CITYK = 2;
  const geos = [], mats = [];
  const quad = () => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); geos.push(g); return g; };
  const inst = (g, name, arr, n, dyn) => { const a = new THREE.InstancedBufferAttribute(arr, n); if (dyn) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
  const addMat = (m) => { m.fog = false; mats.push(m); return m; };
  const camL = cameraPosition.sub(vec3(0, uCityY, 0));             // the camera in the strata's frame
  const minPx = (vz, px) => vz.negate().mul(0.00105 * px);         // ~1 px at scale 1 ≈ 0.00105 rad on a wall's camera


  // strata: broad vertical bands of cold light, cylindrical billboards (they turn round their own axis to face the eye)
  const NST = 150;
  {
    const g = quad(), aP = new Float32Array(NST * 4), aQ = new Float32Array(NST * 4);
    for (let i = 0; i < NST; i++) {
      const a = rnd() * TAU, r = 12 + Math.pow(rnd(), 0.7) * 75, h = 6 + rnd() * 26, y = -20 + rnd() * 70;
      const wmin = r * 0.00105 * 7;                                   // ≥ 7 px wide at scale 1
      aP.set([Math.cos(a) * r, y, Math.sin(a) * r, Math.max(wmin, 0.25 + rnd() * 1.4)], i * 4);
      aQ.set([h, rnd() * TAU, (0.5 + rnd()) * (r < 25 ? 0.6 : 1), rnd()], i * 4);
    }
    inst(g, 'sP', aP, 4); inst(g, 'sQ', aQ, 4); g.instanceCount = NST;
    const m = addMat(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const p = attribute('sP', 'vec4'), q = attribute('sQ', 'vec4');
    const toC = vec3(p.x.sub(camL.x), 0, p.z.sub(camL.z)), side = normalize(vec3(toC.z.negate(), 0, toC.x));
    m.positionNode = p.xyz.add(side.mul(positionGeometry.x.mul(p.w))).add(vec3(0, positionGeometry.y.mul(q.x.mul(0.5)), 0));
    const vQ = varying(positionGeometry.xy), vS = varying(q);
    m.colorNode = Fn(() => {
      const x = vQ.x, y = vQ.y, prof = exp(x.mul(x).mul(-4.5)), ends = smoothstep(1.0, 0.35, abs(y)).mul(y.mul(0.35).add(0.65));
      const breath = sin(uTime.mul(0.22).add(vS.y)).mul(0.25).add(0.75), flow = sin(y.mul(3.0).add(uTime.mul(0.35)).add(vS.y.mul(3))).mul(0.12).add(0.88);
      const col = mix(DEEP.mul(0.9), COOL.mul(0.6), vS.w);
      return vec4(col.mul(prof.mul(ends).mul(breath).mul(flow).mul(vS.z).mul(0.022).mul(uStrata).mul(uWorld)), 1);
    })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -5; city.add(mesh);
  }
  // near motes: cool dust 1–5 m behind the walls, streaming down as the room rises (the sense of climbing)
  const NMO = 500;
  {
    const g = quad(), aP = new Float32Array(NMO * 4);
    for (let i = 0; i < NMO; i++) { const s = rnd() * PER, back = 1 + Math.pow(rnd(), 1.5) * 5, w = walls[wallAt(s)], u = (s - cum[wallAt(s)]) / w.width; const x = w.pa.x + w.right.x * u * w.width - w.normal.x * back, z = w.pa.z + w.right.z * u * w.width - w.normal.z * back; aP.set([x, rnd() * 14, z, 0.012 + rnd() * 0.02], i * 4); }
    inst(g, 'mP', aP, 4); g.instanceCount = NMO;
    const m = addMat(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const p = attribute('mP', 'vec4');
    const yy = mod(p.y.sub(uLift.mul(1.0)).sub(uTime.mul(0.05)), 14).add(uA.sub(7));
    const wob = vec3(sin(uTime.mul(0.4).add(p.y.mul(7))).mul(0.08).add(uGust.mul(sin(uTime.mul(5).add(p.x)).mul(0.25))), 0, cos(uTime.mul(0.33).add(p.y.mul(5))).mul(0.08));
    const mv = modelViewMatrix.mul(vec4(vec3(p.x, yy.sub(uA).add(1.6), p.z).add(wob), 1));
    m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(max(p.w, minPx(mv.z, 2.2)))), mv.z, mv.w));
    const vQ = varying(positionGeometry.xy), vY = varying(yy.sub(uA));
    m.colorNode = Fn(() => { const r2 = dot(vQ, vQ), edge = smoothstep(7, 4.5, abs(vY)); return vec4(COOL.mul(exp(r2.mul(-3.5))).mul(edge).mul(0.035).mul(uWorld), 1); })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; object.add(mesh);
  }

  // -------------------------------------------------------------------------------------------- the climbers (the studio's splat bodies)
  const NCL = 4;                                                    // dosos ×2, acotxador, enxaneta
  const kitC = createBodies({ THREE, TSL, room, max: NCL, builds: [2], lods: [0], seed: 31, blend: 'add' });
  object.add(kitC.object);
  kitC.setColors({ shirt: ['lluna', 1.0], skin: ['lluna', 0.75], trousers: ['blau-hora', 1.0], faixa: ['blau-hora', 1.3], hair: ['nit-alta', 1.2], glow: 'or' });
  kitC.setSplat({ key: 0.8, lit: ['lluna', 0.62], half: ['blau-hora', 0.6], amb: ['nit-alta', 0.5], rim: ['lluna', 0.35], opacity: 0.62, glow: 0.6 });   // cool lluna key (AD #5: only the gold light is warm), cool back, monochrome; gold only at the crown


  // -------------------------------------------------------------------------------------------- glows (room frame): the light, the strand, rays
  // gP = (x, y, z, size m), gC = (r, g, b, kind) — kind 0 soft dot, 1 vertical ray (size = half width, gC.w − 1 → half height)
  const NG = 96;
  const gP = new Float32Array(NG * 4), gC = new Float32Array(NG * 4), gH = new Float32Array(NG);
  let nG = 0;
  const glow = (x, y, z, s, r, g, b, kind = 0, hh = 0) => { if (nG >= NG) return; const o = nG * 4; gP[o] = x; gP[o + 1] = y; gP[o + 2] = z; gP[o + 3] = s; gC[o] = r; gC[o + 1] = g; gC[o + 2] = b; gC[o + 3] = kind + Math.min(0.99, hh / 40); nG++; };
  let GPA, GCA, gGeo;
  {
    const g = gGeo = quad(); GPA = inst(g, 'gP', gP, 4, true); GCA = inst(g, 'gC', gC, 4, true); g.instanceCount = 0;
    const m = addMat(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    const p = attribute('gP', 'vec4'), c = attribute('gC', 'vec4'), kind = c.w.floor(), hh = fract(c.w).mul(40);
    const mv = modelViewMatrix.mul(vec4(p.xyz, 1));
    const q = positionGeometry.xy, sx = max(p.w, minPx(mv.z, 3)), sy = select(kind.greaterThan(0.5), hh, sx);
    m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(vec2(q.x.mul(sx), q.y.mul(sy).add(select(kind.greaterThan(0.5), hh, float(0))))), mv.z, mv.w));
    const vQ = varying(q), vC = varying(c.xyz), vK = varying(kind);
    m.colorNode = Fn(() => {
      const d2 = dot(vQ, vQ), dotK = exp(d2.mul(-5)).add(exp(d2.mul(-60)).mul(0.8));
      const ray = exp(vQ.x.mul(vQ.x).mul(-6)).mul(smoothstep(1.0, -0.6, vQ.y)).mul(smoothstep(-1.0, -0.85, vQ.y)).mul(sin(vQ.y.mul(14).sub(uTime.mul(5))).mul(0.12).add(0.88));
      return vec4(vC.mul(select(vK.greaterThan(0.5), ray, dotK)), 1);
    })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; object.add(mesh);
  }
  const halo = room.makeHalo && room.placeHalo ? room.makeHalo({ color: [OR[0], OR[1], OR[2]], radius: 2.0, intensity: 0 }) : null;
  if (halo) object.add(halo.mesh);

  // -------------------------------------------------------------------------------------------- the hands, on the wall planes
  // per hand a wall-aligned sprite (a camera draws only its own wall's): kind 0 the soft glow (x = stillness, y = presence),
  // 1 a ring (x = age), 2 the gold of the hand that holds the light (x = strength), 3 l'aleta's ray up the wall (x reveal, y strength, z half width)
  const NHS = 64;
  const hA = new Float32Array(NHS * 4), hB = new Float32Array(NHS * 4), hD = new Float32Array(NHS * 4);
  let nHS = 0, HAA, HBA, HDA, hGeo;
  function hsprite(kind, wi, u, y, half, halfH, d0, d1, d2) {
    if (nHS >= NHS) return; const w = walls[wi], o = nHS * 4;
    const x = w.pa.x + w.right.x * u * w.width + w.normal.x * 0.004, z = w.pa.z + w.right.z * u * w.width + w.normal.z * 0.004;
    hA[o] = x; hA[o + 1] = y; hA[o + 2] = z; hA[o + 3] = kind; hB[o] = wi; hB[o + 1] = half; hB[o + 2] = halfH; hB[o + 3] = 0; hD[o] = d0; hD[o + 1] = d1; hD[o + 2] = d2; hD[o + 3] = 0; nHS++;
  }
  {
    const g = hGeo = quad(); HAA = inst(g, 'hA', hA, 4, true); HBA = inst(g, 'hB', hB, 4, true); HDA = inst(g, 'hD', hD, 4, true); g.instanceCount = 0;
    const WR = walls.map((w) => new THREE.Vector4(w.right.x, w.right.y, w.right.z, 0)), WN = walls.map((w) => new THREE.Vector4(w.normal.x, w.normal.y, w.normal.z, 0));
    const uWR = uniformArray(WR, 'vec4'), uWN = uniformArray(WN, 'vec4');
    const A = attribute('hA', 'vec4'), Bv = attribute('hB', 'vec4'), D = attribute('hD', 'vec4');
    const wi = Bv.x.toInt(), ax = uWR.element(wi).xyz, nrm = uWN.element(wi).xyz;
    const q = positionGeometry.xy, lx = q.x.mul(Bv.y), ly = q.y.mul(Bv.z);
    const m = addMat(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.positionNode = A.xyz.add(ax.mul(lx)).add(vec3(0, ly, 0));
    const vL = varying(vec2(lx, ly)), vK = varying(A.w), vD = varying(D), vN = varying(nrm), vH = varying(Bv.zy);
    m.colorNode = Fn(() => {
      If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });
      const c = vec3(0).toVar(), d2 = dot(vL, vL), r = sqrt(d2);
      If(vK.lessThan(0.5), () => {
        const st = vD.x, k = vD.y, rad = st.mul(0.08).add(0.17);
        c.addAssign(COOL.mul(exp(d2.div(rad.mul(rad)).negate()).mul(st.mul(0.16).add(0.07)).mul(k)));
        c.addAssign(COOL.mul(exp(d2.mul(-900)).mul(0.22).mul(k)));
      }).ElseIf(vK.lessThan(1.5), () => {
        const age = vD.x, rad = age.mul(0.55).add(0.08), life = exp(age.mul(-2.2));
        c.addAssign(COOL.mul(exp(r.sub(rad).div(age.mul(0.04).add(0.018)).pow(2).negate()).mul(life).mul(0.32)));
      }).ElseIf(vK.lessThan(2.5), () => {
        c.addAssign(GOLD.mul(exp(d2.mul(-1600)).mul(2.0).add(exp(d2.mul(-60)).mul(0.35)).add(exp(d2.mul(-9)).mul(0.08))).mul(vD.x));
      }).Else(() => {
        const hh = vH.x, yn = vL.y.add(hh).div(hh.mul(2)), ax2 = abs(vL.x), wd = vD.z;
        const core = exp(ax2.div(wd.mul(0.35)).pow(2).negate()).add(exp(ax2.div(wd).negate()).mul(0.25));
        const shown = smoothstep(vD.x.add(0.03), vD.x.sub(0.03), yn), flow = sin(yn.mul(40).sub(uTime.mul(6))).mul(0.15).add(0.85);
        c.addAssign(GOLD.mul(core.mul(shown).mul(flow).mul(smoothstep(1.0, 0.75, yn)).mul(1.2)).mul(vD.y));
      });
      return vec4(c.mul(uWorld.mul(0.7).add(0.3)), 1);
    })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; object.add(mesh);
  }

  // -------------------------------------------------------------------------------------------- falling motes (shed by a slide or a moving hand)
  const NFM = 240, FM = { x: new Float32Array(NFM), y: new Float32Array(NFM), z: new Float32Array(NFM), vx: new Float32Array(NFM), vy: new Float32Array(NFM), vz: new Float32Array(NFM), life: new Float32Array(NFM), gold: new Uint8Array(NFM) };
  let fmNext = 0;
  function shed(x, y, z, n, gold, spread = 0.3) {   // room frame
    for (let k = 0; k < n; k++) { const i = fmNext; fmNext = (fmNext + 1) % NFM; FM.x[i] = x + (rnd() - 0.5) * spread; FM.y[i] = y + (rnd() - 0.5) * spread; FM.z[i] = z + (rnd() - 0.5) * spread; FM.vx[i] = (rnd() - 0.5) * 0.4; FM.vy[i] = -0.1 - rnd() * 0.4; FM.vz[i] = (rnd() - 0.5) * 0.4; FM.life[i] = 2.5 + rnd() * 2; FM.gold[i] = gold ? 1 : 0; }
  }

  // ---- sound: physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'petal', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = clamp01(u); fxMsg.strength = clamp01(strength); fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }

  // -------------------------------------------------------------------------------------------- the tower (tronc3d's, or a ghost)
  // trunk(floor, tower) → { x, z, y (feet, world), yRest, r, h }; the ghost: a tower 1.25 m behind the wall's centre, floors of 1.34 m
  const tronc = () => { const t = ctx.parts && ctx.parts.tronc3d; return t && typeof t.trunk === 'function' ? t : null; };
  const ghost = { x: 0, z: 0, y: 0, yRest: 0, r: 0.42, h: 1.34, tower: 0 };
  function trunkAt(floor, wi) {
    const T = tronc();
    if (T) { const q = T.trunk(floor, wi); if (q) return q; }
    const w = walls[wi]; ghost.x = w.centre.x - w.normal.x * 1.25; ghost.z = w.centre.z - w.normal.z * 1.25; ghost.yRest = ghost.y = (Math.max(1, floor) - 1) * 1.34; ghost.tower = wi;
    return ghost;
  }
  const builtOf = [];                                              // the floors each tower on screen has built (tronc3d)
  function shownTowers() {
    const T = tronc(); if (!T || typeof T.levels !== 'function') return null;
    try { const L = T.levels(); for (const l of L) builtOf[l.tower] = l.built; return L.map((l) => l.tower); } catch { return null; }
  }

  // -------------------------------------------------------------------------------------------- state
  const pool = Array.from({ length: 32 }, () => ({ stroke: null, seen: -1, still: 0, vs: 0, s: 0, y: 0, age: 9, ray: 0, alY0: null, shed: 0 }));
  let frame = 0, climbY = -1, climbV = 0, lastClimber = -1, leap = 0, slide = 0, prevRaw = 0, gust = 0, aletaT = 0, raiseK = 0, goldK = 0;
  // the text placer's obstacles (host: textObstacles()): every climber and the light, as seen on the wall plane from the eye
  const OB = Array.from({ length: NCL + 1 }, () => ({ wall: 0, x: 0, half: 0, y0: 0, y1: 0 })), obs = [];
  function onWallPlane(wi, p, out) {   // the point where the eye's ray to p crosses wall wi's plane → out (x from its centre, y)
    const w = walls[wi], n = w.normal, dx = p.x - EYE.x, dy = p.y - EYE.y, dz = p.z - EYE.z;
    const den = n.x * dx + n.z * dz, t = den < -1e-6 ? (n.x * (w.centre.x - EYE.x) + n.z * (w.centre.z - EYE.z)) / den : 1;
    const X = EYE.x + dx * t, Y = EYE.y + dy * t, Z = EYE.z + dz * t;
    out.x = (X - w.centre.x) * w.right.x + (Z - w.centre.z) * w.right.z; out.y = Y; return out;
  }
  const _o0 = { x: 0, y: 0 }, _o1 = { x: 0, y: 0 };
  function obstacle(wi, p, h, half) {
    if (obs.length >= OB.length) return;
    onWallPlane(wi, p, _o0); _h.copy(p); _h.y += h; onWallPlane(wi, _h, _o1);
    const o = OB[obs.length]; o.wall = wi; o.x = _o0.x; o.half = half; o.y0 = Math.min(_o0.y, _o1.y) - 0.1; o.y1 = Math.max(_o0.y, _o1.y) + 0.1; obs.push(o);
  }
  let splatKey = '', towerW = -1, hopFrom = -1, hopT = 1, standinW = 1, standinT = 0, focusSent = null;
  const arrivedW = [0, 0, 0];                                       // the tower where each climber arrived
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
  // the feet heights (REST frame: the tower not risen) of each climber's floor: the dosos stand on the top of the tronc (F − 2), the
  // acotxador on them (F − 1), the enxaneta at the top (F); she starts at the pinya's shoulders (floor 1)
  const restOf = (wi, f) => trunkAt(f, wi).yRest;
  const stats = typeof window !== 'undefined' ? (window.__pom3d = { figures: NCL, splats: () => kitC.splatCount, climbY: 0, leap: 0, slide: 0, stage: '', tower: -1 }) : null;

  // the climber's place on the tower of wall wi, at rest-height y: on the face of the trunk towards the room, `side` m across it
  function onTower(wi, yRest, side, out) {
    const T = tronc(), rise = T ? T.rise || 0 : 0;
    const f = Math.max(1, Math.min(9, Math.floor(yRest / 1.34) + 1)), q = trunkAt(f, wi), w = walls[wi];
    const r = (q.r || 0.42) + 0.22;
    out.set(q.x + w.normal.x * r + w.right.x * side, yRest - rise, q.z + w.normal.z * r + w.right.z * side);
    return out;
  }

  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.1); frame++;
    const time = input.time ?? 0, pr = input.params || P, S = input.state || null, events = input.events || [];
    uTime.value = time;
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    // ---- the state: the score's, or a stand-in
    let climber, cl, restless = false, stage, holder = null, phase = 'play', lightWall = -1;
    const F = Math.max(5, Math.min(9, Math.round(S ? (S.castell?.floors || S.floors || 7) : (pr.floors ?? 7))));
    if (S) {
      climber = Math.min(2, S.climber ?? 0); cl = clamp01(S.climb ?? 0); restless = !!S.restless; stage = S.pomStage || 'relay'; phase = S.phase || 'play';
      if (S.pomHolder && typeof S.pomHolder.s === 'number') holder = S.pomHolder;
      lightWall = holder ? wallAt(holder.s) : (S.lightWall ?? -1);
    } else {
      const progress = pr.cycle > 0 ? (time % pr.cycle) / pr.cycle : (input.progress ?? pr.progress ?? 0);
      climber = pr.climber >= 0 ? Math.round(pr.climber) : Math.min(2, Math.floor(progress * 3));
      cl = pr.climb >= 0 ? pr.climb : clamp01(progress * 3 - climber);
      restless = !!pr.restless; stage = ['relay', 'breath', 'silence'][climber];
      standinT += dt; if (standinT > 5) { standinT = 0; if (stage === 'relay') standinW = (standinW + 1 + Math.floor(rnd() * 2)) % NW; }
      lightWall = standinW;
      holder = stage === 'relay' ? { s: cum[standinW] + walls[standinW].width * 0.35, y: 1.3 } : null;
      if ((pr.aleta ?? -1) >= 0) phase = 'aleta';
    }
    // the towers on screen: the light's wall if it has one, else the nearest that does
    const shown = shownTowers();
    let want = lightWall >= 0 ? lightWall : towerW >= 0 ? towerW : 0;
    if (shown && shown.length && !shown.includes(want)) { let best = shown[0], bd = 99; for (const t of shown) { const d = Math.min((t - want + NW) % NW, (want - t + NW) % NW); if (d < bd) { bd = d; best = t; } } want = best; }
    if (towerW < 0) towerW = want;
    if (want !== towerW && phase === 'play') { hopFrom = towerW; towerW = want; hopT = 0; leap = 1; }   // the light went to another tower: she leaps across
    hopT = Math.min(1, hopT + dt / 1.2);
    // ---- arrive / leave
    const arrive = input.arrive ?? (S ? 1 : pr.arrive ?? 1), leave = input.leave ?? (S ? 0 : pr.leave ?? 0);
    const fallLeave = leave > 0 && (S ? (S.block === 'fall' || S.outcome === 'intent') : !!pr.fallLeave);
    const dis = Math.max(1 - sm((arrive - 0.15) / 0.75), sm((leave - 0.05) / 0.8));
    uWorld.value = sm((arrive - 0.05) / 0.5) * (1 - sm((leave - 0.3) / 0.6));
    uStrata.value = pr.strata ?? 1;
    // ---- the climber's height (rest frame) on her segment, by S.climb; a jump up is a LEAP, a drop is a SLIDE
    const Fb = builtOf[towerW] > 0 ? Math.max(3, Math.min(9, builtOf[towerW])) : F;   // the tower as it stands on screen
    const yTop = [restOf(towerW, Fb - 2), restOf(towerW, Fb - 1), restOf(towerW, Fb)];
    const y0 = climber === 0 ? restOf(towerW, 2) : yTop[climber - 1] - 0.6, y1 = yTop[climber];
    const done = phase === 'reward' || phase === 'aleta' || (S && S.block && S.block !== 'pom' && S.block !== 'fall');
    const rawY = done ? yTop[2] : y0 + (y1 - y0) * cl;
    if (climber !== lastClimber) {                                 // a new climber: the last one stays at her floor, she starts below
      if (lastClimber >= 0 && lastClimber < 3) arrivedW[lastClimber] = towerW;
      climbY = lastClimber < 0 ? rawY : Math.max(0, rawY - 0.3);
      lastClimber = climber; climbV = 0;
    }
    const dRaw = rawY - prevRaw; prevRaw = rawY;
    if (dRaw > 0.12) leap = 1;                                       // the score lifted her at once (a handoff): she leaps
    if (dRaw < -0.02) slide = Math.min(1, slide + 0.6);              // she lost some: she slides
    for (const e of events) { if (typeof e !== 'string') continue; if (e.startsWith('gust')) gust = Math.max(gust, 0.9); else if (e.startsWith('hush:break')) slide = 1; }
    if (S && S.pomGust > 0) gust = Math.max(gust, Math.min(1, S.pomGust));
    gust = Math.max(0, gust - dt * 0.5); uGust.value = gust * gust;
    { const om = leap > 0 ? 7 : 2.2, acc = om * om * (rawY - climbY) - 2 * om * climbV; climbV += acc * dt; climbY += climbV * dt; }
    leap = Math.max(0, leap - dt / 0.9); slide = Math.max(0, slide - dt / 1.2);
    // the tower frames her: the height where she is lands in the reach band (tronc3d 'top' mode lowers the world ≤ 0.30 m/s)
    { const T = tronc(); if (T && typeof T.setFocusY === 'function' && (!S || S.block === 'pom')) { const fy = Math.round((climbY + 0.55) * 20) / 20; if (fy !== focusSent) { focusSent = fy; T.setFocusY(fy); } } }
    const T0 = tronc(), rise = T0 ? T0.rise || 0 : 0;
    uLift.value = climbY; uA.value = 1.6; uCityY.value = -climbY * CITYK; city.position.y = -climbY * CITYK;
    // ---- l'aleta / the crown
    const aleta = phase === 'aleta' || (S && S.block === 'crown');
    aletaT = aleta ? aletaT + dt : 0;
    raiseK += ((aleta ? 1 : 0) - raiseK) * (1 - Math.exp(-dt * 1.4));
    goldK += ((aleta || phase === 'reward' ? 1 : 0) - goldK) * (1 - Math.exp(-dt * 0.8));
    // ---- the climbers
    const gait = time * (restless ? 4.0 : 2.0), sw = 0.5 + 0.5 * Math.sin(gait);   // carry ↔ raise while she climbs: the arms reach in turn
    const climbing = Math.abs(climbV) > 0.03 || (cl > 0.01 && cl < 0.99 && phase === 'play');
    const form = 1 - dis, fmode = fallLeave ? 'dust' : 'gather';
    let haveLight = false;
    obs.length = 0;
    for (let k = 0; k < NCL; k++) {
      const who = k < 2 ? 0 : k - 1;
      const sc = k === 3 ? 0.6 : k === 2 ? 0.68 : 0.76;
      if (who > climber && !done) { kitC.hide(k); continue; }
      const active = who === climber && !done;
      const wi = active ? towerW : arrivedW[who] ?? towerW, side = k === 0 ? -0.24 : k === 1 ? 0.24 : 0;
      const y = active ? climbY : yTop[who];
      onTower(wi, Math.max(0.06, y), side, _a);
      if (active && hopT < 1 && hopFrom >= 0) {                     // the leap across to the light's tower: an arc
        onTower(hopFrom, Math.max(0.06, y), side, _p0); const u = sm(hopT); _a.lerpVectors(_p0, _a, u); _a.y += Math.sin(Math.PI * u) * 0.5;
      }
      if (active && gust > 0.05) _a.addScaledVector(walls[wi].right, gust * 0.12 * Math.sin(time * 6));
      const sl = active ? slide : 0;
      let pose = 'lock', pose2 = 'lock', mx = 0;
      if (active && climbing) { pose = 'carry'; pose2 = 'raise'; mx = sw * (1 - 0.6 * sl); }
      else if (who === 1) { pose = 'carry'; pose2 = 'carry'; }       // the acotxador crouches over the dosos
      else if (who === 2) { pose = 'stand'; pose2 = 'raise'; }
      if (active && leap > 0) { pose = 'carry'; pose2 = 'raise'; mx = Math.max(mx, Math.sin(Math.PI * clamp01(1 - leap)) * 0.5 + 0.5); }
      if (k === 3 && raiseK > 0.01) { pose = 'stand'; pose2 = 'raise'; mx = raiseK; }
      const w = walls[wi];
      kitC.set(k, { pos: [_a.x, _a.y, _a.z], yaw: Math.atan2(w.normal.x, w.normal.z) + Math.PI, pose, pose2, mix: mx, scale: sc,   // she faces the tower (her back to us)
        glow: k === 3 ? goldK * 0.85 : 0, form: Math.min(form, 1 - sl * 0.3), fmode: sl > 0.05 ? 'dust' : fmode, tint: [1, 1, 1], lod: 'near' });
      if (active && sl > 0.3 && rnd() < dt * 30) shed(_a.x, _a.y + 0.6 * sc, _a.z, 2, false, 0.35);
      obstacle(wi, _a, 1.75 * sc, 0.32);
      if (active || (k === 3 && raiseK > 0.01)) { _b.copy(_a).addScaledVector(w.normal, 0.05); _b.y += 1.72 * sc; haveLight = true; }   // her raised hand: the light
    }
    { const sk = stage === 'silence' ? 'silence' : 'gold'; if (sk !== splatKey) { splatKey = sk; kitC.setSplat(sk === 'gold' ? { lit: 'or', half: 'bronze', amb: 'tinta' } : { lit: 'lluna', half: 'blau-hora', amb: 'tinta' }); } }   // Modelado's sheet3: lit by the gold light; the silence in lluna
    kitC.update(dt);
    if (haveLight && obs.length < OB.length) { _p1.copy(_b); _p1.y -= 0.35; obstacle(towerW, _p1, 0.7, 0.45); }   // the light's burst
    if (!haveLight) _b.set(0, -99, 0);
    // ---- the light: one gold light in the climber's raised hand (relay: bright; breath and silence: quieter); the halo behind it
    const relayK = stage === 'relay' ? 1 : stage === 'breath' ? 0.7 : 0.5;
    const flick = restless ? 0.8 + 0.2 * Math.sin(time * 21) : 1;
    const lightW = (haveLight ? 1 : 0) * uWorld.value * flick * (phase === 'reward' ? 1.25 : 1) * (pr.gold ?? 1) * (fallLeave ? 1 - sm(leave / 0.3) : 1);
    nG = 0;
    glow(_b.x, _b.y, _b.z, 0.07 + 0.03 * relayK, OR[0] * 2.4 * lightW, OR[1] * 2.4 * lightW, OR[2] * 2.4 * lightW);
    glow(_b.x, _b.y, _b.z, 0.45, OR[0] * 0.28 * lightW * relayK, OR[1] * 0.28 * lightW * relayK, OR[2] * 0.28 * lightW * relayK);
    // AD #8: the silence fills the room — on every other wall a faint echo of the climbing light at the same height, on that wall's
    // tower (or where it would stand: 1.25 m behind the wall's centre), breathing slowly; never more than a reflection in the air
    if (haveLight) for (let wi = 0; wi < NW; wi++) {
      if (wi === towerW) continue;
      const w = walls[wi], q = trunkAt(1, wi), br = 0.75 + 0.25 * Math.sin(time * 0.9 + wi * 1.7), k = lightW * br;
      const ex = q.x + w.normal.x * ((q.r || 0.42) + 0.25), ez = q.z + w.normal.z * ((q.r || 0.42) + 0.25);
      glow(ex, _b.y, ez, 0.85, OR[0] * 0.07 * k, OR[1] * 0.07 * k, OR[2] * 0.07 * k);
      glow(ex, _b.y, ez, 0.05, OR[0] * 0.45 * k, OR[1] * 0.45 * k, OR[2] * 0.45 * k);
    }
    if (halo) { room.placeHalo(halo, _b, 1.2); halo.set({ intensity: 0.12 * lightW * (0.6 + 0.4 * relayK) }); }
    // the strand: from the hand that holds the light (on the wall) to her hand, a few gold motes drifting along a soft arc
    let holderHand = null;
    if (holder && stage === 'relay' && phase === 'play' && haveLight) {
      let bd = 0.8; for (const h of input.hands || []) { const s = cum[h.wall] + h.u * walls[h.wall].width, d = Math.hypot(cdS(s, holder.s), h.pos.y - (holder.y ?? h.pos.y)); if (d < bd) { bd = d; holderHand = h; } }
      if (holderHand) {
        const hx = holderHand.pos, n = 14;
        for (let i = 0; i < n; i++) {
          const t = ((i + time * 0.3) % n) / n, mx2 = hx.x + (_b.x - hx.x) * t, mz = hx.z + (_b.z - hx.z) * t, my = hx.y + (_b.y - hx.y) * t + Math.sin(Math.PI * t) * 0.25;
          const k = (Math.sin(Math.PI * t) * 0.6 + 0.4) * lightW;
          glow(mx2, my, mz, 0.018, OR[0] * 0.7 * k, OR[1] * 0.7 * k, OR[2] * 0.7 * k);
        }
      }
    }
    // l'aleta: her arm sends a ray of gold up into the night
    if (raiseK > 0.02) { const k = sm(raiseK) * uWorld.value; glow(_b.x, _b.y, _b.z, 0.06, OR[0] * 1.4 * k, OR[1] * 1.4 * k, OR[2] * 1.4 * k, 1, 2.5 + 7 * sm(aletaT / 2.5)); }
    // falling dust (a slide) and the motes the hands shed (room frame)
    for (let i = 0; i < NFM; i++) {
      if (FM.life[i] <= 0) continue;
      FM.life[i] -= dt; FM.vy[i] -= 0.6 * dt; FM.x[i] += FM.vx[i] * dt; FM.y[i] += FM.vy[i] * dt; FM.z[i] += FM.vz[i] * dt;
      const a = Math.min(1, FM.life[i] / 1.5) * uWorld.value, c = FM.gold[i] ? OR : LLUNA, k = FM.gold[i] ? 0.6 : 0.18;
      glow(FM.x[i], FM.y[i], FM.z[i], 0.016, c[0] * k * a, c[1] * k * a, c[2] * k * a);
    }
    gGeo.instanceCount = nG; GPA.needsUpdate = true; GCA.needsUpdate = true;

    // ---- the hands
    nHS = 0;
    const hands = input.hands || [];
    let raised = 0;
    for (const h of hands) {
      let st = null; for (const p of pool) if (p.stroke === h.stroke) { st = p; break; }
      const s = cum[h.wall] + h.u * walls[h.wall].width;
      if (!st) {
        st = pool.find((p) => p.seen < frame - 1) || pool[0]; Object.assign(st, { stroke: h.stroke, still: 0, vs: 0, s, y: h.pos.y, age: 0, ray: 0, alY0: null, shed: 0 });
        fxImpact(h.wall, h.u, 0.35, 'petal', 'touch');
      }
      { let ds = cdS(s, st.s); const v = Math.hypot(ds, h.pos.y - st.y) / Math.max(dt, 1e-3); st.vs += (v - st.vs) * (1 - Math.exp(-dt / 0.15)); }
      st.seen = frame; st.s = s; st.y = h.pos.y; st.age += dt;
      const sp = Math.max(Math.hypot(h.vx || 0, h.vy || 0), st.vs);
      if (sp > 0.3) { st.still = Math.max(0, st.still - dt * 4); st.shed += dt * 6; while (st.shed >= 1) { st.shed -= 1; _h.copy(h.pos).addScaledVector(walls[h.wall].normal, -0.3); shed(_h.x, _h.y, _h.z, 1, false, 0.25); } }
      else st.still = Math.min(1, st.still + dt / 1.5);
      hsprite(0, h.wall, h.u, h.pos.y, 0.5, 0.5, st.still, 1, 0);
      if (h === holderHand) hsprite(2, h.wall, h.u, h.pos.y, 0.6, 0.6, lightW, 0, 0);
      // l'aleta: a hand that rose ≥ 0.28 m from where it was when the window opened, or above 1.6 m after 2 s, sends a ray up its wall
      if (aleta) {
        if (st.alY0 == null) st.alY0 = h.pos.y;
        const up = h.pos.y - st.alY0 >= 0.28 || (h.pos.y > 1.6 && aletaT >= 2);
        st.ray = clamp01(st.ray + (up ? dt / 0.8 : -dt / 1.5)); if (up) raised++;
      } else { st.alY0 = null; st.ray = 0; }
    }
    if (aleta) {
      const share = S ? Math.max(S.aletaHands ?? 0, S.aletaWidth ?? 0) : hands.length ? raised / hands.length : 0, halfW = 0.04 + 0.11 * share;
      for (const h of hands) { const st = pool.find((p) => p.stroke === h.stroke); if (!st || !(st.ray > 0)) continue; const w = walls[h.wall], hh = Math.max(0.05, (w.height - h.pos.y) / 2); hsprite(3, h.wall, h.u, h.pos.y + hh, halfW * 3, hh, sm(st.ray), 1, halfW); }
    }
    for (const p of pool) if (p.seen !== frame) p.stroke = null;
    hGeo.instanceCount = nHS; HAA.needsUpdate = true; HBA.needsUpdate = true; HDA.needsUpdate = true;
    if (stats) { stats.climbY = climbY; stats.leap = leap; stats.slide = slide; stats.stage = stage; stats.floors = F; stats.tower = towerW; stats.rise = rise; }
  }
  function setParams() { /* read live in update() */ }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); kitC.dispose(); try { fxBc?.close(); } catch { /* closed */ } }
  // [{ wall, x (m from the wall's centre), half (m), y0, y1 (m from the floor) }] this frame — read it, do not keep it
  const textObstacles = () => obs;
  return { object, update, setParams, dispose, textObstacles };
}
