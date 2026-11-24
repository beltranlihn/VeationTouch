// Ressonància — part «tronc3d»: III. Tronc — Equilibri — the castell as a VERTICAL ASSEMBLAGE of fragments of the city
// (ARTE-2 §3 «trencadís digital»; ref 9, the collage of floating objects, and ref 10). Contract: ../PARTS.md; GUION.md › III.
// Built by 3D-FE (T-032), taken over by TRO-F (24-11): notes in lab/estudio/notas/TRO-F.md. Backups: tronc3d.TROF.js.bak (3D-FE's last),
// tronc3d.ARTE2.js.bak (the morning's).
//
// Behind every castell wall (state.walls; alone: the first `walls`), 6.5 m beyond the wall, a tower floats in the void: an island of dark
// rock and NINE FLOORS = the score's nine floors, each a fragment of Barcelona in «white maquette» plaster with accents of terracotta,
// glazed trencadís, chrome and neon (façana, banc, balcó, esfera, testos, tribuna, gent, xemeneies, rosassa), and behind each one its
// COLLAGE: one big plate (liquid chrome that ripples, or a wall of trencadís), a neon panel that lights its neighbours, hairline frames,
// a belt of small tesserae. Scale 1.7: four or five floors stand in the frame at once.
//   · the frame: the forming floor sits at ~3.1 m on the wall; the room RISES with every floor (this part's own group goes down, ≤ 0.35 m/s).
//     Light: a key from high over the middle of the room, DARK BELOW / LIGHT ABOVE (uFall, world heights): the guide's quiet zones (text
//     1.75–2.2 m, buttons 0.9–1.6 m at the wall's centre) stay under ~35 %; the turquoise rim still draws the silhouettes down there.
//   · the pulse: the forming floor (floorProgress) hovers scattered round its slot and BREATHES with the drum (tightest on the beat); the
//     tower dips on every beat and a wave of light climbs its last floors. When the floor is fixed it falls into place with WEIGHT (the
//     tower sinks and rebounds), a flash and a ring of light.
//   · the balance: lean[w] (±7°) is a damped spring (it overshoots and sways); weak[w] trembles it. Tilted, the LOOSE pieces let go,
//     slide along the decks in the tilted gravity, fall towards the room, bounce on the floors below, spin, and are lost in the void; once
//     the tower has stood straight ~2 s they fly home.
//   · a hand that lands on a wall knocks the floor behind it (ray eye → hand → tower): the floor wobbles, takes an amber tint and throws
//     3–5 pieces up and out; the tesserae next to the hand (0–1 m behind the wall) are thrown, spinning, and fall. Same frame.
//   · three depths: tesserae 0–1 m behind the walls · the towers at 6.5 m · far: the towers of other colles as black silhouettes (24–38 m)
//     and debris in the void.
//   · arrive: every piece flies in from scattered fragments, the bottom first; leave: they part, rise and go out. Reward: the towers draw
//     back (the whole assemblage is seen once), then the light goes out from the top down.
//   · outside its own block (baixada, fall) only the floors are drawn (the decor fades in ~1 s): the others take them with takeFloor.
// Matter: own TSL shading (no scene lights): plaster, terracotta, glaze, chrome, iron, gold, glass, trencadís (voronoi), liquid chrome,
// with room.envMap + a procedural environment. All pieces are instances of 11 geometries; the rigid-body physics runs on the CPU
// (≈ 8500 instances, ~1 ms per update; floors far below the frame are written one frame in four; no allocation per frame).
// API (kept from T-032, used by fall3d and baixada3d): collapse({ mode, duration }), restore(), collapsing, takeFloor(i, { tower, hide }),
// giveFloor(i, tower), levels(), impacts, rise. Sound: impacts → 'fx:impact' on the work's BroadcastChannel (notas/ENT.md).

const TAU = Math.PI * 2;
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// geometries and kinds of matter
const G_BOX = 0, G_SPH = 1, G_POT = 2, G_TILE = 3, G_CONE = 4, G_TOR = 5, G_GLASS = 6, G_SMOKE = 7, G_PANEL = 8, G_SHARD = 9, G_FIBRE = 10, NG = 11;
const K_STONE = 0, K_TERRA = 1, K_GLAZE = 2, K_CHROME = 3, K_IRON = 4, K_GOLD = 5, K_EMIT = 6, K_PETAL = 7, K_GLASS = 8, K_BODY = 9, K_SHARD = 10, K_PANOT = 11, K_BLIND = 12, K_MOSAIC = 13, K_LIQUID = 14;
// linear colours
const C = {
  stone: [0.70, 0.67, 0.60], stone2: [0.68, 0.65, 0.59], stone3: [0.66, 0.63, 0.57], white: [0.72, 0.69, 0.62], rock: [0.030, 0.026, 0.022], rock2: [0.045, 0.038, 0.032],   // «white maquette» (ART round 2): bone plaster #F1ECE2
  terra: [0.55, 0.20, 0.08], terra2: [0.64, 0.28, 0.12], terra3: [0.42, 0.14, 0.06],
  chrome: [0.95, 0.95, 1.0], gold: [1.0, 0.70, 0.36], iron: [0.07, 0.065, 0.07],
  leaf: [0.08, 0.26, 0.08], warm: [1.0, 0.62, 0.32],
};
const GLAZE = [[0.03, 0.10, 0.48], [0.04, 0.32, 0.34], [0.78, 0.52, 0.07], [0.80, 0.78, 0.70], [0.10, 0.32, 0.09], [0.62, 0.07, 0.04], [0.72, 0.30, 0.10], [0.85, 0.82, 0.72]];
const PETALS = [[0.85, 0.32, 0.42], [0.92, 0.88, 0.80], [0.80, 0.12, 0.08], [0.95, 0.50, 0.12], [0.75, 0.40, 0.70]];

const TOWER_D = 6.5;      // m beyond the wall
const BASE_Y = -1.1;      // the plinth's foot (tower-local 0) in the part's frame
const TS = 1.7;           // the tower's scale (the levels below are drawn at 1; a floor ≈ 1.5 m wide at 1)
const GAP = 0.2 * TS;     // the air between two floors

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const {
    Fn, uniform, attribute, varying, vec2, vec3, vec4, float, positionGeometry, normalGeometry, positionWorld, cameraPosition, normalize,
    mix, smoothstep, clamp, max, min, pow, dot, cross, reflect, sin, cos, abs, If, exp, floor, fract, select, mx_noise_float, pmremTexture, length, atan, step, texture,
  } = TSL;
  const walls = room.walls, NW = walls.length;
  const R = rng(20261124);

  // -------------------------------------------------------------------------------------------- the pieces (CPU records)
  // piece: { g (geometry), slot, layer ('tower' | 'near' | 'far'), tw (tower), lv (level), home [x,y,z] (level frame; near/far: part
  //   frame), hq (Quaternion, level frame), s [sx,sy,sz], k (kind), col [r,g,b], glow, loose, grp, scat [x,y,z] (unit-ish), seed,
  //   st (0 home · 1 free · 2 lost · 3 returning), p (Vector3, tower frame when free), v, q (Quaternion), w (Vector3), t0, from (Vector3) }
  const pieces = [], counts = new Array(NG).fill(0);
  const eul = new THREE.Euler();
  function add(o) {
    const pc = {
      g: o.g, slot: counts[o.g]++, layer: o.layer || 'tower', tw: o.tw ?? -1, lv: o.lv ?? -1, home: o.home, hq: new THREE.Quaternion().setFromEuler(eul.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')),
      s: o.s, k: o.k, col: o.col, glow: o.glow ?? 0, loose: !!o.loose, grp: o.grp ?? -1,
      scat: [R() * 2 - 1, R() * 2 - 1, R() * 2 - 1], seed: R(), st: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
      t0: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), rest: 0, knock: 0,
      ao: (o.layer || 'tower') === 'tower' && o.k !== K_EMIT && o.k !== K_BODY && o.k !== K_GLASS ? 0.35 + 0.65 * smooth(0, 0.22 * TS, o.home[1]) : 1,   // contact shadow at the foot of every floor
    };
    pieces.push(pc); return pc;
  }
  let grpId = 0;
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const jit = (c, a = 0.12) => { const k = 1 + (R() - 0.5) * 2 * a; return [c[0] * k, c[1] * k, c[2] * k]; };

  // ---- the levels: h (height), deck (height of the surface things rest on), r (its radius), spin (rad/s), build(tw, lv, push)
  // pieces of Barcelona (ART: «fragments of the city, not primitives»): every floor a cluster 2–3 m wide, OFF the axis and counterweighted by
  // what is on its other side (the tower stands by balance: that is the chapter). Units ×TS (2.1) = metres.
  const TER = [0.70, 0.67, 0.60], BISC = [0.70, 0.67, 0.60], STUC = [0.72, 0.69, 0.62], CEM = [0.69, 0.66, 0.59];   // plaster everywhere; terracotta only on pots, bricks, tiles (~15 %)
  const GLZ = [[0.016, 0.06, 0.43], [0.025, 0.48, 0.43], [0.77, 0.37, 0.025], [0.88, 0.84, 0.76], [0.016, 0.06, 0.43], [0.025, 0.48, 0.43]];   // cobalt, turquoise, ochre, white (ART §2)
  const shard = (T, x, y, z, s, col, o = {}) => T({ g: G_SHARD, home: [x, y, z], ry: o.ry ?? R() * TAU, rx: o.rx ?? (R() - 0.5) * 0.35, rz: o.rz ?? (R() - 0.5) * 0.35, s: [s, s * 0.09, s * (0.7 + R() * 0.5)], k: K_SHARD, col: o.col ?? jit(col, 0.12), loose: o.loose });
  const panot = (T, x, y, z, w, d, o = {}) => T({ g: G_BOX, home: [x, y, z], ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, s: [w, 0.06, d], k: K_PANOT, col: jit(CEM, 0.06), loose: o.loose });
  const plant = (T, x, y, z, g, n = 22) => {                          // a plant of light points (an umbel, like the Pom's gardens)
    for (let j = 0; j < 3; j++) { const b = (j / 3) * TAU + R(); T({ g: G_BOX, home: [x + Math.cos(b) * 0.03, y + 0.07, z + Math.sin(b) * 0.03], rz: Math.cos(b) * 0.3, rx: Math.sin(b) * 0.3, s: [0.008, 0.14, 0.008], k: K_EMIT, col: [0.35, 0.42, 0.2], glow: 0.6, loose: true, grp: g }); }
    n = Math.round(n * 0.6);
    for (let j = 0; j < n; j++) { const ct = 0.25 + R() * 0.75, st = Math.sqrt(1 - ct * ct), ph = R() * TAU, r = 0.09 + R() * 0.08;
      T({ g: G_BOX, home: [x + st * Math.cos(ph) * r, y + 0.13 + ct * r * 0.8, z + st * Math.sin(ph) * r], rx: R() * 3, ry: R() * 3, s: [0.018, 0.018, 0.018], k: K_EMIT, col: R() < 0.6 ? [1.0, 0.66, 0.2] : [1.0, 0.9, 0.65], glow: 1.6 + R() * 1.2, loose: true, grp: g }); }
  };
  const farol = (T, x, y, z) => {                                       // a Barcelona street lamp: iron pole, arm, a glass lantern with its flame
    T({ g: G_POT, home: [x, y + 0.5, z], s: [0.05, 1.0, 0.05], k: K_IRON, col: C.iron });
    T({ g: G_SPH, home: [x, y + 0.02, z], s: [0.12, 0.08, 0.12], k: K_IRON, col: C.iron });
    T({ g: G_BOX, home: [x + 0.1, y + 1.0, z], rz: -0.25, s: [0.24, 0.022, 0.022], k: K_IRON, col: C.iron });
    T({ g: G_GLASS, home: [x + 0.22, y + 0.9, z], s: [0.11, 0.17, 0.11], k: K_GLASS, col: [1, 0.9, 0.75] });
    T({ g: G_CONE, home: [x + 0.22, y + 1.02, z], s: [0.15, 0.08, 0.15], k: K_IRON, col: C.iron });
    T({ g: G_SPH, home: [x + 0.22, y + 0.9, z], s: [0.05, 0.07, 0.05], k: K_EMIT, col: [1.0, 0.7, 0.36], glow: 3.0 });
  };
  const LEVELS = [
    { name: 'pedra', h: 0.78, deck: 0.78, r: 1.25, spin: 0.0, build(T) {               // the base: rubble of stone, a paving of panots on top
      // a floating island of dark stone #2A2622 (ART 14:00): irregular blocks, wide on top, tapering down into the void
      for (let i = 0; i < 22; i++) { const d = i / 21, a = i * 2.4 + R() * 0.5, rr = (1 - d) * (0.25 + R() * 0.85) + 0.05, sz = (0.5 + R() * 0.45) * (1 - d * 0.55);
        T({ g: G_SHARD, home: [Math.cos(a) * rr, 0.42 - d * 1.9 + (R() - 0.5) * 0.15, Math.sin(a) * rr * 0.8], ry: R() * TAU, rx: (R() - 0.5) * 0.7, rz: (R() - 0.5) * 0.7, s: [sz * 1.5, sz * (0.7 + R() * 0.5), sz * 1.3], k: K_STONE, col: jit(R() < 0.75 ? C.rock : C.rock2, 0.2) }); }
      panot(T, 0.12, 0.72, -0.05, 1.5, 1.2, { ry: 0.2 });
      for (let i = 0; i < 6; i++) { const a = R() * TAU, rr = 0.2 + R() * 0.6; panot(T, Math.cos(a) * rr, 0.77, Math.sin(a) * rr, 0.13, 0.13, { ry: R() * TAU, rx: (R() - 0.5) * 0.2, loose: true }); }
      for (let i = 0; i < 6; i++) { const a = R() * TAU, rr = 0.3 + R() * 0.6, s = 0.07 + R() * 0.08;
        T({ g: G_SHARD, home: [Math.cos(a) * rr, 0.78 + s * 0.3, Math.sin(a) * rr], ry: R() * TAU, s: [s * 1.6, s * 0.9, s * 1.3], k: K_STONE, col: jit(C.rock2, 0.1), loose: true }); }
    } },
    { name: 'façana', h: 1.05, deck: 0.08, r: 1.05, spin: 0.025, build(T) {             // a piece of façade with its persianes, counterweighted by bricks
      const o = -0.35;
      T({ g: G_BOX, home: [o + 0.05, 0.04, 0.05], s: [1.5, 0.08, 0.75], k: K_STONE, col: C.white });
      T({ g: G_BOX, home: [o, 0.55, -0.12], s: [1.25, 0.95, 0.16], k: K_STONE, col: jit(STUC, 0.05) });
      T({ g: G_BOX, home: [o, 1.04, -0.08], s: [1.32, 0.06, 0.24], k: K_STONE, col: C.white });                    // cornice
      for (const [wx, open] of [[-0.27, 0], [0.27, 1]]) {
        T({ g: G_BOX, home: [o + wx, 0.52, -0.035], s: [0.38, 0.64, 0.02], k: K_IRON, col: [0.02, 0.02, 0.025] });   // the window's dark
        T({ g: G_BOX, home: [o + wx, 0.52, -0.02], s: [0.44, 0.7, 0.03], k: K_STONE, col: C.white });                  // its frame (behind)
        if (!open) T({ g: G_BOX, home: [o + wx, 0.52, 0.0], s: [0.36, 0.62, 0.025], k: K_BLIND, col: [0.70, 0.67, 0.60] });
        else { T({ g: G_BOX, home: [o + wx - 0.13, 0.52, 0.12], ry: 1.0, s: [0.18, 0.62, 0.025], k: K_BLIND, col: [0.70, 0.67, 0.60] }); T({ g: G_BOX, home: [o + wx + 0.13, 0.52, 0.12], ry: -1.0, s: [0.18, 0.62, 0.025], k: K_BLIND, col: [0.70, 0.67, 0.60] });
          T({ g: G_SPH, home: [o + wx, 0.5, -0.06], s: [0.12, 0.16, 0.04], k: K_EMIT, col: [1.0, 0.62, 0.3], glow: 1.4 }); }   // someone's lamp inside
      }
      for (let i = 0; i <= 12; i++) T({ g: G_BOX, home: [o - 0.6 + i * 0.1, 0.25, 0.4], s: [0.016, 0.34, 0.016], k: K_IRON, col: C.iron });
      T({ g: G_BOX, home: [o, 0.42, 0.4], s: [1.24, 0.03, 0.035], k: K_IRON, col: C.iron });
      // the counterweight: a stack of bricks and a pot on the other side
      for (let c = 0; c < 4; c++) for (let i = 0; i < 3 - (c > 1 ? 1 : 0); i++) T({ g: G_BOX, home: [0.55 + i * 0.17 - c * 0.04, 0.12 + c * 0.1, 0.1 + (c % 2) * 0.05], ry: (R() - 0.5) * 0.15, s: [0.16, 0.09, 0.08], k: K_TERRA, col: jit(pick([C.terra, C.terra2, C.terra3])), loose: c === 3 });
      const g = grpId++;
      T({ g: G_POT, home: [0.62, 0.62, 0.1], s: [0.2, 0.22, 0.2], k: K_TERRA, col: jit(C.terra2), loose: true, grp: g });
      plant(T, 0.62, 0.72, 0.1, g, 16);
    } },
    { name: 'banc', h: 0.55, deck: 0.36, r: 1.1, spin: -0.03, build(T) {                // the serpentine bench of Park Güell, all trencadís
      const o = 0.3, N = 14;
      for (let i = 0; i < N; i++) { const x = o - 0.75 + (i / (N - 1)) * 1.5, z = Math.sin((i / (N - 1)) * Math.PI * 2.2) * 0.28, dz = Math.cos((i / (N - 1)) * Math.PI * 2.2) * 0.28 * Math.PI * 2.2 / 1.5;
        const ry = -Math.atan(dz);
        T({ g: G_BOX, home: [x, 0.18, z], ry, s: [0.14, 0.34, 0.28], k: K_TERRA, col: TER });
        T({ g: G_SPH, home: [x, 0.36, z - 0.08], ry, s: [0.15, 0.09, 0.1], k: K_TERRA, col: TER });                     // the rounded back
        for (let j = 0; j < 7; j++) shard(T, x + (R() - 0.5) * 0.12, 0.35 + (R() - 0.5) * 0.02, z + (R() - 0.5) * 0.24, 0.07 + R() * 0.05, pick(GLZ), { rx: (R() - 0.5) * 0.15, rz: (R() - 0.5) * 0.15, loose: j === 0 && R() < 0.5 });
        for (let j = 0; j < 4; j++) shard(T, x + (R() - 0.5) * 0.1, 0.06 + R() * 0.26, z + 0.15, 0.06 + R() * 0.04, pick(GLZ), { rx: Math.PI / 2 + (R() - 0.5) * 0.3, ry: ry });
      }
      // the counterweight: a tilted slab of panots and a chrome ball on it
      panot(T, -0.62, 0.05, 0.0, 0.7, 0.6, { rz: 0.12, ry: 0.4 });
      T({ g: G_SPH, home: [-0.7, 0.24, 0.05], s: [0.3, 0.3, 0.3], k: K_CHROME, col: C.chrome, loose: true });
    } },
    { name: 'balcó', h: 1.15, deck: 0.1, r: 1.1, spin: 0.03, build(T) {                  // a wrought-iron balcony with pots, and a street lamp at its end
      const o = -0.25;
      T({ g: G_BOX, home: [o, 0.05, 0], s: [1.6, 0.1, 1.0], k: K_STONE, col: C.white });
      T({ g: G_BOX, home: [o, -0.04, 0], s: [1.45, 0.06, 0.85], k: K_STONE, col: C.stone2 });
      const bar = (x, z) => T({ g: G_BOX, home: [o + x, 0.5, z], s: [0.02, 0.8, 0.02], k: K_IRON, col: C.iron });
      for (let i = 0; i <= 13; i++) bar(-0.76 + i * 0.117, 0.46);
      for (let i = 1; i <= 7; i++) { bar(-0.76, 0.46 - i * 0.13); bar(0.76, 0.46 - i * 0.13); }
      T({ g: G_BOX, home: [o, 0.91, 0.46], s: [1.56, 0.05, 0.06], k: K_IRON, col: C.iron }); T({ g: G_BOX, home: [o, 0.2, 0.46], s: [1.52, 0.03, 0.03], k: K_IRON, col: C.iron });
      T({ g: G_BOX, home: [o - 0.76, 0.91, 0], s: [0.06, 0.05, 0.94], k: K_IRON, col: C.iron }); T({ g: G_BOX, home: [o + 0.76, 0.91, 0], s: [0.06, 0.05, 0.94], k: K_IRON, col: C.iron });
      for (let i = 0; i < 6; i++) T({ g: G_TOR, home: [o - 0.62 + i * 0.25, 0.55, 0.46], rx: Math.PI / 2, s: [0.2, 0.2, 0.2], k: K_IRON, col: C.iron });
      for (let i = 0; i < 3; i++) { const g = grpId++, x = o - 0.45 + i * 0.42, z = -0.15 + R() * 0.25;
        T({ g: G_POT, home: [x, 0.22, z], s: [0.2, 0.22, 0.2], k: K_TERRA, col: jit(C.terra2), loose: true, grp: g });
        plant(T, x, 0.32, z, g, 16);
      }
      farol(T, 0.78, 0.0, 0.25);
    } },
    { name: 'esfera', h: 1.45, deck: 1.4, r: 0.4, spin: 0.05, build(T) {                // the chrome sphere, counterweighted by a rose window
      const o = 0.38;
      T({ g: G_SPH, home: [o, 0.72, 0], s: [1.3, 1.3, 1.3], k: K_CHROME, col: C.chrome });
      T({ g: G_TOR, home: [o, 0.72, 0], rx: 0.35, rz: 0.2, s: [1.75, 1.75, 1.75], k: K_GOLD, col: C.gold });
      for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU + R() * 0.1, rr = 1.02 + R() * 0.1; shard(T, o + Math.cos(a) * rr * 0.9, 0.72 + Math.sin(a) * 0.22, Math.sin(a) * rr * 0.9, 0.07 + R() * 0.04, pick(GLZ), { rx: 0.35 }); }
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, s = 0.08 + R() * 0.14;
        T({ g: G_SPH, home: [o + Math.cos(a) * 0.95, 0.3 + R() * 0.9, Math.sin(a) * 0.95], s: [s, s, s], k: i % 3 === 0 ? K_GOLD : K_CHROME, col: i % 3 === 0 ? C.gold : C.chrome, loose: true }); }
      // the counterweight: a broken plaster column with its capital, lying across
      T({ g: G_POT, home: [-0.7, 0.18, 0], rz: Math.PI / 2, ry: 0.3, s: [0.32, 0.9, 0.32], k: K_STONE, col: C.white });
      T({ g: G_BOX, home: [-0.7, 0.42, 0.05], ry: 0.5, s: [0.42, 0.14, 0.42], k: K_STONE, col: C.white });
      T({ g: G_POT, home: [-0.72, 0.62, 0.05], s: [0.3, 0.26, 0.3], k: K_STONE, col: C.white });
    } },
    { name: 'testos', h: 1.0, deck: 0.07, r: 1.1, spin: -0.035, build(T) {             // pots of flowers on panots, a spiral stair going up beside them
      const o = -0.25;
      panot(T, o, 0.03, 0, 1.4, 1.2);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3, x = o + Math.cos(a) * 0.42, z = Math.sin(a) * 0.38, g = grpId++, sc = 0.9 + R() * 0.3;
        T({ g: G_POT, home: [x, 0.06 + 0.17 * sc, z], s: [0.3 * sc, 0.34 * sc, 0.3 * sc], k: K_TERRA, col: jit(pick([C.terra, C.terra2])), loose: true, grp: g });
        const top = 0.06 + 0.34 * sc;
        plant(T, x, top, z, g, 26);
      }
      // the spiral stair (iron), the counterweight
      const sx = 0.75;
      T({ g: G_POT, home: [sx, 0.5, 0], s: [0.04, 1.0, 0.04], k: K_IRON, col: C.iron });
      for (let i = 0; i < 12; i++) { const a = i * 0.55; T({ g: G_BOX, home: [sx + Math.cos(a) * 0.17, 0.06 + i * 0.08, Math.sin(a) * 0.17], ry: -a, s: [0.32, 0.02, 0.12], k: K_IRON, col: C.iron }); }
      for (let i = 0; i < 12; i++) { const a = i * 0.55 + 0.27; T({ g: G_BOX, home: [sx + Math.cos(a) * 0.33, 0.35 + i * 0.08, Math.sin(a) * 0.33], ry: -a + Math.PI / 2, rz: 0.4, s: [0.2, 0.015, 0.015], k: K_IRON, col: C.iron }); }
    } },
    { name: 'tribuna', h: 1.05, deck: 0.98, r: 0.6, spin: 0.04, build(T) {               // an Eixample bay window: glass and iron on a stone corbel, a lamp inside
      const o = 0.28;
      T({ g: G_BOX, home: [o, 0.06, 0.05], s: [1.15, 0.12, 0.7], k: K_STONE, col: C.white });
      T({ g: G_BOX, home: [o, -0.05, 0.0], s: [0.9, 0.1, 0.5], k: K_STONE, col: C.stone2 });
      T({ g: G_BOX, home: [o, 0.5, -0.24], s: [1.15, 0.85, 0.08], k: K_STONE, col: jit(STUC, 0.05) });
      T({ g: G_GLASS, home: [o, 0.5, 0.36], s: [0.62, 0.72, 0.02], k: K_GLASS, col: [0.7, 0.85, 1] });
      T({ g: G_GLASS, home: [o - 0.45, 0.5, 0.1], ry: 1.0, s: [0.52, 0.72, 0.02], k: K_GLASS, col: [0.7, 0.85, 1] });
      T({ g: G_GLASS, home: [o + 0.45, 0.5, 0.1], ry: -1.0, s: [0.52, 0.72, 0.02], k: K_GLASS, col: [0.7, 0.85, 1] });
      for (const [x, z] of [[-0.31, 0.36], [0.31, 0.36], [-0.58, -0.12], [0.58, -0.12], [0, 0.36]]) T({ g: G_BOX, home: [o + x, 0.5, z], s: [0.03, 0.76, 0.03], k: K_IRON, col: C.iron });
      for (const y of [0.14, 0.86, 0.6]) { T({ g: G_BOX, home: [o, y, 0.36], s: [0.64, 0.025, 0.03], k: K_IRON, col: C.iron }); }
      T({ g: G_BOX, home: [o, 0.92, 0.07], s: [1.25, 0.06, 0.72], k: K_IRON, col: [0.16, 0.17, 0.18] });            // a zinc roof
      T({ g: G_SPH, home: [o, 0.48, 0.0], s: [0.16, 0.16, 0.16], k: K_EMIT, col: [1.0, 0.7, 0.4], glow: 2.2 });
      for (let i = 0; i < 3; i++) { const s = 0.08 + R() * 0.05; T({ g: G_BOX, home: [o - 0.3 + i * 0.28, 0.95 + s / 2, 0.1], ry: R() * TAU, s: [s, s, s], k: K_CHROME, col: C.chrome, loose: true }); }
      // counterweight: roof tiles hanging on the other side
      for (let i = 0; i < 5; i++) T({ g: G_POT, home: [-0.62 - (i % 2) * 0.12, 0.25 + i * 0.12, -0.1 + (i % 3) * 0.12], rz: Math.PI / 2 + (R() - 0.5) * 0.3, ry: R() * 0.5, s: [0.13, 0.32, 0.07], k: K_TERRA, col: jit(C.terra), loose: i > 2 });
    } },
    { name: 'gent', h: 1.1, deck: 1.05, r: 1.1, spin: -0.04, build(T) {                  // a wide ring of the Pinya's people, made of points
      const o = 0.0, n = 9, R0 = 0.82;
      T({ g: G_TOR, home: [o, 0.02, 0], s: [2.0, 2.0, 2.0], k: K_IRON, col: C.iron });
      T({ g: G_SHARD, home: [o, -0.02, 0], s: [1.9, 0.05, 1.9], k: K_STONE, col: C.white });
      const pt = (x, y, z) => T({ g: G_BOX, home: [x, y, z], rx: R() * 3, ry: R() * 3, s: [0.024, 0.024, 0.024], k: K_EMIT, col: R() < 0.72 ? [0.03, 0.65, 0.56] : [1.0, 0.16, 0.1], glow: 1.4 + R() * 1.4 });
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, cx = o + Math.cos(a) * R0, cz = Math.sin(a) * R0;
        for (let k = 0; k < 36; k++) { const ct = 2 * R() - 1, st = Math.sqrt(1 - ct * ct), ph = R() * TAU; pt(cx + st * Math.cos(ph) * 0.12, 0.54 + ct * 0.3, cz + st * Math.sin(ph) * 0.09); }
        for (let k = 0; k < 10; k++) { const ct = 2 * R() - 1, st = Math.sqrt(1 - ct * ct), ph = R() * TAU; pt(cx + st * Math.cos(ph) * 0.075, 0.95 + ct * 0.09, cz + st * Math.sin(ph) * 0.075); }
        const b = ((i + 1) / n) * TAU, nx = o + Math.cos(b) * R0, nz = Math.sin(b) * R0;
        for (let k = 0; k < 7; k++) { const t = k / 6; pt(cx + (nx - cx) * t, 0.78 + Math.sin(t * Math.PI) * 0.04, cz + (nz - cz) * t); }
      }
    } },
    { name: 'xemeneies', h: 2.15, deck: 2.1, r: 1.0, spin: 0.05, build(T) {              // three of Gaudí's twisted chimneys, plaster and trencadís
      const chim = (o, oz, H, w0, pal) => {
        const n = 8;
        for (let i = 0; i < n; i++) { const y = (i + 0.5) * H / n, w = w0 * (1 - 0.35 * i / n) * (1 + 0.12 * Math.sin(i * 1.3)), tw = i * 0.32;
          T({ g: G_BOX, home: [o, y, oz], ry: tw, s: [w, H / n * 1.02, w], k: K_TERRA, col: jit(C.terra2, 0.08) });            // terracotta, twisting
          for (let f = 0; f < 4; f++) { const a = tw + f * Math.PI / 2, nx = Math.sin(a), nz = Math.cos(a);
            for (let j = 0; j < 2; j++) { const u = (j - 0.5) * w * 0.4; shard(T, o + nx * w * 0.52 + Math.cos(a) * u, y + (R() - 0.5) * H / n * 0.5, oz + nz * w * 0.52 - Math.sin(a) * u, w * (0.28 + R() * 0.12), pick(pal), { rx: Math.PI / 2, ry: a, rz: (R() - 0.5) * 0.4, loose: i > 4 && R() < 0.2 }); } }
        }
        for (let j = 0; j < 3; j++) T({ g: G_BOX, home: [o, H + 0.05 + j * 0.07, oz], ry: (n + j) * 0.32, s: [w0 * (0.62 - j * 0.14), 0.07, w0 * (0.62 - j * 0.14)], k: K_TERRA, col: C.terra });   // the cap: the twist goes on, narrowing
        T({ g: G_SPH, home: [o, H + 0.3, oz], s: [w0 * 0.18, w0 * 0.18, w0 * 0.18], k: K_CHROME, col: C.chrome });
      };
      chim(-0.5, 0.05, 1.95, 0.8, [GLZ[0], GLZ[1], GLZ[2], GLZ[3]]);
      chim(0.62, -0.1, 1.4, 0.6, [GLZ[1], GLZ[3], GLZ[2], GLZ[0]]);
      T({ g: G_BOX, home: [0.03, 0.03, 0], s: [2.2, 0.06, 0.8], k: K_STONE, col: C.white });
    } },
    { name: 'rosassa', h: 1.7, deck: 1.6, r: 0.5, spin: -0.04, build(T) {                // the top: a great rose window lit from within, the enxaneta's light above it
      const ry = 0.85, R1 = 0.72;
      T({ g: G_BOX, home: [0, 0.05, 0], s: [1.9, 0.1, 0.5], k: K_STONE, col: C.white });
      T({ g: G_TOR, home: [0, ry, 0], s: [R1 * 2.1, R1 * 2.1, R1 * 2.6], k: K_STONE, col: C.white });
      T({ g: G_TOR, home: [0, ry, 0], s: [R1 * 0.7, R1 * 0.7, R1 * 1.6], k: K_STONE, col: C.white });
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, c = Math.cos(a), sn = Math.sin(a);
        T({ g: G_BOX, home: [c * R1 * 0.62, ry + sn * R1 * 0.62, 0], rz: a, s: [R1 * 0.75, 0.03, 0.05], k: K_STONE, col: C.white });       // the tracery
        T({ g: G_SHARD, home: [Math.cos(a + 0.2) * R1 * 0.62, ry + Math.sin(a + 0.2) * R1 * 0.62, -0.02], rx: Math.PI / 2, ry: 0, rz: a, s: [0.22, 0.012, 0.14], k: K_EMIT, col: pick([[0.1, 0.22, 0.95], [0.95, 0.55, 0.06], [0.95, 0.3, 0.4], [0.05, 0.65, 0.6]]), glow: 1.6 }); }
      T({ g: G_SPH, home: [0, ry, 0], s: [0.16, 0.16, 0.08], k: K_GOLD, col: C.gold });
      // the finial and the enxaneta's light
      T({ g: G_SPH, home: [0, ry + R1 * 1.1 + 0.08, 0], s: [0.18, 0.16, 0.18], k: K_SHARD, col: GLZ[2] });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; T({ g: G_BOX, home: [Math.cos(a) * 0.1, ry + R1 * 1.1 + 0.22, Math.sin(a) * 0.1], ry: -a, s: [0.18, 0.04, 0.04], k: K_GOLD, col: C.gold }); }
      T({ g: G_SPH, home: [0, ry + R1 * 1.1 + 0.32, 0], s: [0.09, 0.09, 0.09], k: K_EMIT, col: [1.0, 0.85, 0.6], glow: 3.5 });
      // a little counterweight of trencadís at its feet
      for (let i = 0; i < 9; i++) shard(T, -0.7 + R() * 0.3, 0.12 + R() * 0.05, (R() - 0.5) * 0.3, 0.08 + R() * 0.05, pick(GLZ), { loose: true });
    } },
  ];
  const NL = LEVELS.length;   // plinth + 9 floors
  { let y = 0; for (const L of LEVELS) { L.h *= TS; L.deck *= TS; L.r *= TS; L.base = y; y += L.h + GAP; } }
  const TOWER_H = LEVELS[NL - 1].base + LEVELS[NL - 1].h;
  const FORM_Y = 6.0, RISE0 = LEVELS[1].base + LEVELS[1].h * 0.5 + BASE_Y - FORM_Y;

  // ---- the towers (one per wall; shown on the structure's walls)
  const towers = walls.map((w, tw) => {
    const tower = { w, tw, on: false, formed: 0, colTilt: 0, brk: 1, theta: 0, omega: 0, dip: 0, dipV: 0, straightT: 0, levels: [], lastFloors: 0, base: new THREE.Vector3(), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), yaw: Math.atan2(w.normal.x, w.normal.z), shown: 0 };
    tower.base.copy(w.centre).addScaledVector(w.normal, -TOWER_D).setY(BASE_Y);
    for (let lv = 0; lv < NL; lv++) {
      const st = { spin: 0, spin0: (R() - 0.5) * 0.36, ax: 0, az: 0, vax: 0, vaz: 0, flash: 0, lockT: -99, fromK: 1, glow: 0, O: new THREE.Vector3(), Q: new THREE.Quaternion() };
      tower.levels.push(st);
      const T = (o) => add({ ...o, home: o.home.map((x) => x * TS), s: o.s.map((x) => x * TS), tw, lv, layer: 'tower' });
      const n0 = pieces.length;
      LEVELS[lv].build(T);
      if (lv > 0) backdrop(T, lv, tw);
      // the small grain (1 : 3 : 9): a belt of tesserae clinging round the floor and a comet of them trailing from its heavy side —
      // glaze, a few chrome and terracotta bits; one in three is loose (they are the first to slide and fall). Every floor ≥ 150 pieces
      // (the baixada, T-035, rebuilds each floor in glass from takeFloor and needs that many).
      { const Ld = LEVELS[lv], hU = Ld.h / TS, rU = Math.min(1.35, Math.max(0.8, Ld.r / TS)), side = (lv + tw) % 2 ? 1 : -1;
        for (let i = pieces.length - n0; i < 152; i++) {
          const comet = R() < 0.4, a = R() * TAU, sz = 0.03 + R() * R() * 0.07;
          const rr = comet ? rU * (0.9 + R() * 1.5) : rU * (0.75 + R() * 0.45), x = comet ? side * rr : Math.cos(a) * rr, z = comet ? (R() - 0.5) * 0.9 : Math.sin(a) * rr * 0.8;
          const y = comet ? hU * (0.15 + R() * 0.7) + (rr - rU) * 0.25 * (R() - 0.3) : (lv ? R() * hU : 0.3 + R() * 0.5), x9 = R();
          if (lv === 0 && x9 < 0.5) T({ g: G_SHARD, home: [x, y - 0.6 * R(), z], rx: R() * TAU, ry: R() * TAU, s: [sz * 2.2, sz * 1.4, sz * 1.8], k: K_STONE, col: jit(C.rock2, 0.2), loose: R() < 0.3 });
          else if (x9 < 0.72) T({ g: G_SHARD, home: [x, y, z], rx: R() * TAU, ry: R() * TAU, rz: R() * TAU, s: [sz, sz * 0.12, sz * (0.7 + R() * 0.5)], k: K_SHARD, col: jit(pick(GLZ), 0.12), loose: R() < 0.33 });
          else if (x9 < 0.86) T({ g: G_BOX, home: [x, y, z], rx: R() * TAU, ry: R() * TAU, s: [sz * 0.6, sz * 0.6, sz * 0.6], k: K_CHROME, col: C.chrome, loose: R() < 0.33 });
          else T({ g: G_BOX, home: [x, y, z], rx: R() * TAU, ry: R() * TAU, s: [sz, sz * 0.45, sz * 0.7], k: K_TERRA, col: jit(C.terra2), loose: R() < 0.33 });
        } }
      // a bundle of bone fibres hanging from the floor's belly like roots (ref 10)
      { const fb = add({ g: G_FIBRE, home: [0, (lv ? 0.02 : -0.6) * TS, 0], ry: R() * TAU, s: lv ? [TS, (0.9 + R() * 0.9) * TS, TS] : [TS * 1.3, TS * 3.2, TS * 1.3], k: K_EMIT, col: [0.87, 0.69, 0.55], glow: 0.35, tw, lv, layer: 'tower' }); fb.fibre = true; }
    }
    tower.ringT = 9; tower.ringLv = -1; add({ g: G_TOR, layer: 'fx', tw, home: [0, 0, 0], rx: Math.PI / 2, s: [1, 1, 1], k: K_EMIT, col: [1.0, 0.6, 0.28], glow: 2.4 });   // the ring of the blow when a floor locks
    // debris CLUSTERS orbiting the tower (composition, not confetti): a few big pieces, more medium, many small, dense at the core
    const lvs = [1, 3, 4, 5, 6, 8].sort(() => R() - 0.5).slice(0, 4);
    for (const lv of lvs) {
      const a = R() * TAU, r = (1.5 + R() * 0.9) * TS, y = LEVELS[lv].h * (0.2 + R() * 0.6);
      cluster((o) => add({ ...o, tw, lv, layer: 'tower' }), [Math.cos(a) * r, y, Math.sin(a) * r], a, 1.0 * TS, [2, 6, 18], 1.0 * TS);
    }
    // smoke round the foot (ref 9): soft wisps, they do not turn with the plinth (it does not turn)
    for (let i = 0; i < 0; i++) { const a = R() * TAU, r = (0.4 + R() * 1.8) * TS, sz = (1.4 + R() * 1.6) * TS;
      const pc = add({ g: G_SMOKE, home: [Math.cos(a) * r, (-0.9 + R() * 1.6) * TS, Math.sin(a) * r], s: [sz * 1.4, sz, 1], k: 0, col: R() < 0.5 ? [0.6, 0.22, 0.08] : [0.06, 0.4, 0.45], glow: R() * 10, tw, lv: 0, layer: 'tower' }); pc.smoke = true; }
    // a column of lit smoke BEHIND the tower (ART §3): teal low, warm half-way up
    for (let i = 0; i < 12; i++) { const y = (-2.0 + i * 1.25) * TS, sz = (1.35 + R() * 0.5) * TS, hk = i / 11;
      const c = (hk < 0.35 ? [0.06, 0.42, 0.46] : hk < 0.75 ? [0.36, 0.14, 0.06] : [0.32, 0.14, 0.12]).map((x) => x * 0.6);
      const pc = add({ g: G_SMOKE, home: [(R() - 0.5) * 0.35 * TS, y, -(1.9 + R() * 0.4) * TS], s: [sz, sz * 1.5, 1], k: 0, col: c, glow: R() * 10, tw, lv: 0, layer: 'tower' }); pc.smoke = true;
      // the veil (ART-O r4): two more wisps either side that draw the wide silhouette out of the black (teal low, rust half-way, 12–15 %)
      for (const sd of [-1, 1]) { const q = add({ g: G_SMOKE, home: [sd * (2.0 + R() * 0.8) * TS, y + R() * TS, -(1.2 + R() * 0.6) * TS], s: [sz * 1.2, sz * 1.6, 1], k: 0, col: c.map((x) => x * 0.8), glow: R() * 10, tw, lv: 0, layer: 'tower' }); q.smoke = true; } }
    // neon panels near the tower (ref 9): lime or cyan, pixel-sorted
    for (let i = 0; i < 3; i++) { const a = R() * TAU, r = (1.4 + R() * 0.6) * TS, lv = 1 + Math.floor(R() * 8);
      add({ g: G_PANEL, home: [Math.cos(a) * r, LEVELS[lv].h * R(), Math.sin(a) * r], ry: -a + Math.PI / 2 + (R() - 0.5) * 0.6, s: [0.3, 0.8, 1], k: 0, col: R() < 0.5 ? [0.82, 0.89, 0.2] : [0.27, 0.69, 1.0], glow: R() * 10, tw, lv, layer: 'tower' }); }
    return tower;
  });

  // the COLLAGE behind every floor (ref 9): flat plates standing behind and beside the fragment — a wall of trencadís, a plate of liquid
  // chrome, a panel of terracotta light — a neon bar, a hairline frame, a long hairline. They make each floor a wide, composed image.
  function backdrop(T, lv, tw) {
    const s = ((lv + tw) % 2 ? 1 : -1), H = LEVELS[lv].h, yc = H * 0.5;
    // ONE big plate per floor (ART 14:20): moving liquid chrome; every third floor a wall of trencadís instead
    const w = 1.6 + R() * 0.45, h = Math.max(1.5, H * (1.15 + R() * 0.3)), x = s * (1.75 + R() * 0.45),   // ART-O r4: a cantilever 0.8–1.2 m on the wall, alternating floor to floor
      cw = 0.45 + R() * 0.2, z = -(0.75 + (lv % 2) * 0.55 + R() * 0.3);
    if ((lv + tw) % 3 === 0) T({ g: G_BOX, home: [x, yc + 0.1, z], ry: -s * 0.16, s: [w, h, 0.05], k: K_MOSAIC, col: [[0.016, 0.06, 0.43], [0.025, 0.48, 0.43], [0.77, 0.37, 0.025]][(lv + tw) % 3 + (lv % 2) > 2 ? 0 : (lv + tw) % 3 + (lv % 2)] });
    else T({ g: G_BOX, home: [x, yc + 0.05, z], ry: -s * 0.2, s: [w, h, 0.04], k: K_LIQUID, col: lv % 2 ? [0.95, 0.95, 1.0] : [1.0, 0.74, 0.52] });
    // the counterweight on the other side: a heavy chrome ball (or a plaster block), the floor visibly balanced
    if (lv % 2) T({ g: G_SPH, home: [-s * (1.45 + R() * 0.2), yc - H * 0.15, -0.2], s: [cw, cw, cw], k: K_CHROME, col: C.chrome });
    else T({ g: G_BOX, home: [-s * (1.4 + R() * 0.2), yc - H * 0.2, -0.15], ry: R(), s: [cw * 1.3, cw, cw], k: K_STONE, col: C.white });
    // the floor's LIGHT: a neon panel of sorted pixels, lime or cyan, on the other side — it lights its neighbours (see neon below)
    { const lime = (lv + tw) % 2 === 0, c = lime ? [0.82, 0.89, 0.2] : [0.27, 0.69, 1.0], k = 1.3 + 0.12 * lv;
      const p = T({ g: G_PANEL, home: [-s * (1.7 + R() * 0.35), yc + (R() - 0.4) * H * 0.3, 0.25 + ((lv + 1) % 2) * 0.45 + R() * 0.25], ry: s * 0.3, s: [0.32 + R() * 0.12, 0.95 + R() * 0.4, 1], k: 0, col: [c[0] * k, c[1] * k, c[2] * k], glow: R() * 10 });
      p.neon = c; }
    // a hairline frame (bone), a rectangle drawn in the air round part of the floor; and, every third floor, a long hairline across
    const ln = (x0, y0, z0, lx, ly) => T({ g: G_BOX, home: [x0, y0, z0], s: [Math.max(lx, 0.012), Math.max(ly, 0.012), 0.012], k: K_EMIT, col: [0.87, 0.80, 0.68], glow: 0.55 });
    { const fw = 1.3 + R() * 0.9, fh = H * (0.7 + R() * 0.5), fx = -s * (0.5 + R() * 0.7), fy = yc + (R() - 0.3) * 0.3, fz = 0.6 + (lv % 3) * 0.3 + R() * 0.2;
      ln(fx, fy - fh / 2, fz, fw, 0); ln(fx, fy + fh / 2, fz, fw, 0); ln(fx - fw / 2, fy, fz, 0, fh); ln(fx + fw / 2, fy, fz, 0, fh); }
    if (lv % 3 === 1) ln(s * 0.6, H * (0.2 + R() * 0.6), -0.4, 5.5, 0);
    if (lv % 3 === 2) ln(-s * (1.9 + R() * 0.4), yc + 0.6, -0.2, 0, 3.2);
  }

  // a cluster: n = [big, medium, small] pieces round centre c (tangent direction a: the cluster stretches along its orbit), scale k
  function cluster(push, c, a, k, n, spread) {
    const tx = -Math.sin(a), tz = Math.cos(a);
    const g = () => (R() + R() + R() - 1.5) / 1.5;            // ~gaussian in -1..1
    const sizes = [[0.22, 0.45], [0.06, 0.14], [0.015, 0.045]], spr = [0.25, 0.55, 0.85];
    for (let band = 0; band < 3; band++) for (let i = 0; i < n[band]; i++) {
      const sz = (sizes[band][0] + R() * (sizes[band][1] - sizes[band][0])) * k, t = g() * spr[band] * spread * 1.4, h = g() * spr[band] * spread * 0.6, d = g() * spr[band] * spread * 0.5;
      const home = [c[0] + tx * t + Math.cos(a) * d, c[1] + h, c[2] + tz * t + Math.sin(a) * d];
      push({ ...kit(sz, band, true), home, rx: R() * TAU, ry: R() * TAU, rz: R() * TAU });
    }
  }
  // one piece of the city at size sz (band 0 big, 1 medium, 2 small)
  function kit(sz, band, noWhite) {
    let x = R(); if (noWhite) x = band === 0 ? 0.3 + x * 0.55 : x * 0.58;
    if (band === 0) {
      if (x < 0.3) return { g: G_BOX, s: [sz * (1.1 + R() * 0.6), sz * (0.6 + R() * 0.4), sz * (0.8 + R() * 0.4)], k: K_STONE, col: C.white };   // a block of plaster
      if (x < 0.5) return { g: G_SPH, s: [sz, sz, sz], k: K_CHROME, col: C.chrome };
      if (x < 0.7) return { g: G_SHARD, s: [sz * 1.2, sz * 0.1, sz], k: K_SHARD, col: pick(GLZ) };                                        // a big shard of glazed tile
      if (x < 0.85) return { g: G_GLASS, s: [sz, sz, sz], k: K_GLASS, col: [0.7, 0.85, 1] };
      return { g: G_BOX, s: [sz * 1.2, sz * 0.07, sz], k: K_PANOT, col: jit(CEM, 0.06) };                                              // a broken slab of panots
    }
    if (x < 0.4) return { g: G_SHARD, s: [sz, sz * 0.12, sz * (0.7 + R() * 0.5)], k: K_SHARD, col: jit(pick(GLZ), 0.12) };
    if (x < 0.58) return { g: G_BOX, s: [sz * 0.8, sz * 0.8, sz * 0.8], k: K_CHROME, col: C.chrome };
    if (x < 0.78) return { g: G_BOX, s: [sz, sz * 0.4, sz * 0.75], k: R() < 0.4 ? K_TERRA : K_STONE, col: R() < 0.4 ? jit(C.terra2) : C.white };
    if (x < 0.88) return { g: G_BOX, s: [sz * 0.15, sz * 2.4, sz * 0.15], k: K_IRON, col: C.iron };
    if (x < 0.95) return { g: G_SPH, s: [sz * 0.7, sz * 0.7, sz * 0.7], k: K_GOLD, col: C.gold };
    return { g: G_BOX, s: [sz, sz, sz], k: K_STONE, col: C.white };
  }

  // ---- near: a few clusters of tesserae and collage panels 0.1–1 m behind each wall, away from the guide's column at the centre
  const near = [];
  walls.forEach((w, wi) => {
    const putNear = (o, u, y, d) => {
      const home = [w.centre.x + w.right.x * u - w.normal.x * d, y, w.centre.z + w.right.z * u - w.normal.z * d];
      const pc = add({ ...o, layer: 'near', home }); pc.u = u; pc.wall = wi; pc.p.set(home[0], home[1], home[2]); near.push(pc); return pc;
    };
    const half = w.width / 2;
    for (let i = 0; i < 18; i++) {                                         // ≤ 8 in view at a time, 8–30 cm (ART §4): they give the parallax
      const side = i % 2 ? 1 : -1, u = side * (1.3 + R() * (half - 1.6)), y = -1 + i * 0.95 + R() * 0.6, sz = R() < 0.25 ? 0.2 + R() * 0.1 : 0.08 + R() * 0.08;
      putNear({ ...kit(sz, 1, true), rx: R() * TAU, ry: R() * TAU, rz: R() * TAU }, u, y, 0.2 + R() * 0.75);
    }
    { const side = R() < 0.5 ? 1 : -1; putNear({ g: G_PANEL, s: [0.3, 0.8, 1], k: 0, col: R() < 0.5 ? [0.82, 0.89, 0.2] : [0.27, 0.69, 1.0], glow: R() * 10, ry: Math.atan2(w.normal.x, w.normal.z) + (R() - 0.5) * 0.5, rz: (R() - 0.5) * 0.1 }, side * (1.5 + R() * (half - 2.0)), 2.6 + R() * 6, 0.5 + R() * 0.4); }
  });

  // ---- mid: a medium cluster beyond EVERY wall (7–9 m), off the centre, so no wall stays empty (ART §4)
  walls.forEach((w) => {
    for (let c = 0; c < 0; c++) {
      const side = c === 2 ? (R() < 0.5 ? 1 : -1) : c ? 1 : -1, u = side * (2.4 + R() * 1.6), d = 8 + R() * 3, y = c === 2 ? 7 + R() * 6 : 0.5 + R() * 4.5;
      const cx = w.centre.x + w.right.x * u - w.normal.x * d, cz = w.centre.z + w.right.z * u - w.normal.z * d, a = Math.atan2(cz, cx) + Math.PI / 2;
      cluster((o) => { const pc = add({ ...o, layer: 'far' }); pc.far = 14; return pc; }, [cx, y, cz], a, 2.6, [2, 6, 18], 1.6);
    }
    // the towers of other colles, far away, in silhouette (25–40 m)
    for (let k = 0; k < 2; k++) {
      const u = (k ? 1 : -1) * (5 + R() * 6), d = 24 + R() * 14, x0 = w.centre.x + w.right.x * u - w.normal.x * d, z0 = w.centre.z + w.right.z * u - w.normal.z * d;
      // only a SILHOUETTE (ART): matte black, the same off-balance profile (a wide slab, a ball, a thin neck…), tall enough for the whole rise
      let y = -9, off = 0;
      for (let i = 0; i < 12; i++) { const h = 1.6 + R() * 2.2, wd = 1.0 + R() * 1.8; off = (i % 2 ? 1 : -1) * (0.4 + R() * 1.1);   // cantilevers, alternating
        const pc = add({ g: G_BOX, layer: 'far', home: [x0 + w.right.x * off, y + h / 2, z0 + w.right.z * off], ry: Math.atan2(w.normal.x, w.normal.z) + (R() - 0.5) * 0.3, s: [wd, h, wd * 0.7], k: K_STONE, col: [0.002, 0.002, 0.0025] }); pc.far = d; pc.still = true; pc.silhouette = true; y += h + 0.05; }
      { const pc = add({ g: G_SPH, layer: 'far', home: [x0 + w.right.x * off, y + 0.3, z0 + w.right.z * off], s: [0.25, 0.25, 0.25], k: K_EMIT, col: [1.0, 0.8, 0.55], glow: 3.0 }); pc.far = d; pc.still = true; }   // the enxaneta's light
    }
  });

  // ---- far: clouds of city debris in the void (big slabs, a few balls and beams, a haze of embers), dark space between them
  for (let cl = 0; cl < 4; cl++) {
    const a = (cl / 6) * TAU + R() * 0.6, r = 30 + R() * 22, y0 = -8 + R() * 30;
    const c = [Math.cos(a) * r, y0, Math.sin(a) * r];
    const g = () => (R() + R() + R() - 1.5) / 1.5;
    for (let i = 0; i < 16; i++) {
      const band = i < 3 ? 0 : 1, sz = band === 0 ? 2 + R() * 2.5 : 0.4 + R() * 0.9, o = kit(sz, band, true);
      const pc = add({ ...o, layer: 'far', home: [c[0] + g() * 6, c[1] + g() * 4, c[2] + g() * 6], rx: R() * TAU, ry: R() * TAU, rz: R() * TAU }); pc.far = r;
    }
    for (let i = 0; i < 30; i++) {
      const s2 = 0.05 + R() * 0.1;
      const pc = add({ g: G_BOX, layer: 'far', home: [c[0] + g() * 9, c[1] + g() * 6, c[2] + g() * 9], rx: R() * TAU, ry: R() * TAU, s: [s2, s2, s2], k: K_EMIT, col: R() < 0.7 ? [0.9, 0.42, 0.2] : [0.3, 0.7, 0.75], glow: 0.5 + R() * 0.9 });
      pc.far = r; pc.dust = true;
    }
  }

  // -------------------------------------------------------------------------------------------- GPU: one instanced mesh per geometry
  const bases = [
    new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.5, 32, 16), new THREE.CylinderGeometry(0.5, 0.36, 1, 20, 1, false),
    new THREE.CylinderGeometry(0.5, 0.5, 1, 6), new THREE.ConeGeometry(0.5, 1, 24), new THREE.TorusGeometry(0.5, 0.035, 8, 64), new THREE.BoxGeometry(1, 1, 1),
    new THREE.PlaneGeometry(1, 1), new THREE.PlaneGeometry(1, 1), shardGeometry(), fibreGeometry(),
  ];
  // a broken plate: an irregular 7-sided slab with a bevel that catches the light (ART §1), ~1 across, 1 thick (scaled thin)
  function shardGeometry() {
    const r = rng(7), pts = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + (r() - 0.5) * 0.55, rr = 0.33 + r() * 0.19; pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.06, bevelSegments: 2, steps: 1 });
    g.center(); g.rotateX(-Math.PI / 2); return g;
  }
  // a bundle of 40 curved fibres hanging from y = 0 down to ~ -1 (two crossed ribbons each, so they read from every wall)
  function fibreGeometry() {
    const r = rng(11), pos = [], nrm = [], idx = [], SEG = 10, W = 0.012;
    for (let f = 0; f < 40; f++) {
      const a = r() * TAU, r0 = 0.12 + r() * 0.6, L = 0.45 + r() * 0.55, sw = 0.08 + r() * 0.12, ph = r() * TAU, dr = (r() - 0.5) * 0.3;
      for (const [ex, ez, nx, nz] of [[1, 0, 0, 1], [0, 1, 1, 0]]) {
        const v0 = pos.length / 3;
        for (let i = 0; i <= SEG; i++) {
          const t = i / SEG, rr = r0 + dr * t, x = Math.cos(a) * rr + Math.sin(t * 3.0 + ph) * sw * t, z = Math.sin(a) * rr + Math.cos(t * 2.3 + ph) * sw * t, y = -L * t;
          pos.push(x - ex * W / 2, y, z - ez * W / 2, x + ex * W / 2, y, z + ez * W / 2); nrm.push(nx, 0, nz, nx, 0, nz);
          if (i < SEG) { const b = v0 + i * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx); return g;
  }
  const uGain = uniform(1), uTime = uniform(0), uDecor = uniform(1);
  const object = new THREE.Group(); object.name = 'tronc3d';
  const world = new THREE.Group(); object.add(world);          // the room's rise moves this group
  const meshes = [];
  for (let g = 0; g < NG; g++) {
    const n = counts[g]; if (!n) { meshes.push(null); continue; }
    const geo = new THREE.InstancedBufferGeometry(); const b = bases[g];
    geo.setAttribute('position', b.getAttribute('position')); geo.setAttribute('normal', b.getAttribute('normal')); geo.setIndex(b.getIndex());
    const mk = (name, size, dyn) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); if (dyn) a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    const A = { iP: mk('iP', 3, true), iQ: mk('iQ', 4, true), iS: mk('iS', 4, true), iC: mk('iC', 4, false), iD: mk('iD', 4, true), iN: mk('iN', 3, false) };
    geo.instanceCount = n;
    const mesh = new THREE.Mesh(geo, g === G_GLASS ? glassMaterial() : g === G_SMOKE ? smokeMaterial() : g === G_PANEL ? panelMaterial() : solidMaterial());
    if (g === G_FIBRE) mesh.material.side = THREE.DoubleSide;
    mesh.frustumCulled = false; mesh.renderOrder = g === G_GLASS ? 12 : g === G_SMOKE ? 13 : 10; world.add(mesh);
    meshes.push({ mesh, A, n });
  }
  for (const pc of pieces) { const A = meshes[pc.g].A, i = pc.slot; A.iC.array.set([pc.col[0], pc.col[1], pc.col[2], pc.k + Math.min(pc.glow, 9.9) * 0.0 ], i * 4); A.iS.array[i * 4 + 3] = pc.glow; }
  // every floor's neon panel lights the pieces round it (a baked point light: colour × 1 / (1 + d²), per instance)
  { const neon = new Map(); for (const pc of pieces) if (pc.neon) neon.set(pc.tw * 16 + pc.lv, pc);
    for (const pc of pieces) { if (pc.layer !== 'tower' || pc.neon) continue; const n = neon.get(pc.tw * 16 + pc.lv); if (!n) continue;
      const dx = (pc.home[0] - n.home[0]) / TS, dy = (pc.home[1] - n.home[1]) / TS, dz = (pc.home[2] - n.home[2]) / TS, wgt = 1.5 / (1 + (dx * dx + dy * dy + dz * dz) / 0.55);
      meshes[pc.g].A.iN.array.set([n.neon[0] * wgt, n.neon[1] * wgt, n.neon[2] * wgt], pc.slot * 3); } }
  for (const m of meshes) if (m) m.A.iC.needsUpdate = true;

  // ---- shading (TSL)
  function vertexCommon(m) {
    const iP = attribute('iP', 'vec3'), iQ = attribute('iQ', 'vec4'), iS = attribute('iS', 'vec4');
    const rot = (v) => v.add(cross(iQ.xyz, cross(iQ.xyz, v).add(v.mul(iQ.w))).mul(2));
    m.positionNode = iP.add(rot(positionGeometry.mul(iS.xyz)));
    return { nW: varying(normalize(rot(normalGeometry.div(iS.xyz)))), lp: varying(positionGeometry), nL: varying(normalGeometry) };
  }
  // the environment: INT's pre-filtered night (room.envMap, T-028) when there is one, plus a procedural one of our own: a dark void,
  // a thin warm horizon, a soft top light, tall window panels (the collage's light boxes)
  const envMap = room.envMap || null;
  const envProc = (Rv) => {
    const y = Rv.y;
    const horizon = exp(abs(y).mul(-9.0)).mul(vec3(0.40, 0.14, 0.06));
    const top = smoothstep(0.55, 0.95, y).mul(vec3(0.85, 0.9, 0.95)).mul(1.3);
    const pan = smoothstep(0.55, 0.62, sin(Rv.x.mul(6.0).add(0.7)).mul(sin(Rv.z.mul(4.0).add(1.9)))).mul(smoothstep(0.02, 0.12, y)).mul(smoothstep(0.55, 0.4, y));
    const teal = smoothstep(0.62, 0.7, sin(Rv.x.mul(3.0).add(2.1)).mul(sin(Rv.z.mul(5.0)))).mul(smoothstep(-0.1, 0.1, y)).mul(smoothstep(0.45, 0.25, y));
    const below = smoothstep(0.0, -0.7, y).mul(vec3(0.01, 0.02, 0.035));
    return vec3(0.004, 0.005, 0.008).add(horizon).add(top).add(pan.mul(vec3(1.0, 0.72, 0.48)).mul(1.6)).add(teal.mul(vec3(0.2, 0.7, 0.75))).add(below);
  };
  const env = (Rv, rough) => (envMap ? envProc(Rv).mul(0.55).add(pmremTexture(envMap, Rv, rough).mul(0.9)) : envProc(Rv));
  // the guide's quiet zones (ART-O r4): seen from the eye, a point is drawn on the wall that faces it most; inside the text box (±1.6 m ×
  // 1.75–2.2 m) and the button column (±0.9 m × 0.9–1.6 m) its light is halved and held under ~35 % after tone mapping
  const quietK = (Pw) => {
    const e = room.eye, d = Pw.sub(vec3(e.x, e.y, e.z));
    let best = float(-1e9), qu = float(0), qv = float(0);
    for (const w of walls) {
      const den = dot(d, vec3(-w.normal.x, 0, -w.normal.z)), dW = Math.max(0.5, -((w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z));
      const t = float(dW).div(max(den, 1e-3)), Q = vec3(e.x, e.y, e.z).add(d.mul(t));
      const uu = dot(Q.sub(vec3(w.centre.x, 0, w.centre.z)), vec3(w.right.x, 0, w.right.z)), better = den.greaterThan(best);
      qu = select(better, uu, qu); qv = select(better, Q.y, qv); best = max(best, den);
    }
    const au = abs(qu);
    const text = float(1).sub(smoothstep(1.6, 1.85, au)).mul(smoothstep(1.6, 1.75, qv)).mul(float(1).sub(smoothstep(2.2, 2.35, qv)));
    const btn = float(1).sub(smoothstep(0.9, 1.1, au)).mul(smoothstep(0.75, 0.9, qv)).mul(float(1).sub(smoothstep(1.6, 1.75, qv)));
    return max(text, btn);
  };
  const hush = (c) => { const q = quietK(positionWorld); return mix(c, min(c.mul(0.5), vec3(0.14)), q); };
  const KEY = vec3(1.0, 0.80, 0.60).mul(1.75), RIM = vec3(0.03, 0.65, 0.56).mul(1.6);   // ART round 2: key ×2, shadows near black   // warm key #FFD2A0 from above, turquoise back light #2ED3C6 (ART §2–3)
  // depth falloff: far below the eye the world goes into the dark
  const uFall = uniform(new THREE.Vector2(3.5, 5.3));   // world heights between which the light comes up (dark below the guide's text, light above: ART 14:00)
  const falloff = () => mix(float(0.085), float(1.15), smoothstep(uFall.x, uFall.y, positionWorld.y));
  // CC0 maps (Poly Haven, the shared library ../assets/cc0/, SOURCES.md there): sandstone, terracotta, rusted iron, the rusted shutter
  const TL = new THREE.TextureLoader();
  const cc0 = (name, srgb) => { const t = TL.load(new URL(`../assets/cc0/${name}`, import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const TX = { crackN: cc0('sandstone_cracks/sandstone_cracks_nor_gl_1k.jpg') };   // «white maquette»: the only map left is the glaze's crackle (normal)
  function solidMaterial() {
    const m = new THREE.MeshBasicNodeMaterial();
    const { nW, lp, nL } = vertexCommon(m);
    const iC = attribute('iC', 'vec4'), iD = attribute('iD', 'vec4'), iS = attribute('iS', 'vec4');
    const vC = varying(iC), vD = varying(iD), vG = varying(iS.w), vO = varying(positionGeometry.mul(iS.xyz)), iSv = varying(iS.xyz), vN = varying(attribute('iN', 'vec3'));
    const vQ = varying(attribute('iQ', 'vec4'));
    m.colorNode = Fn(() => {
      const k = vC.w, p = vO;
      // the CC0 maps, projected on the piece's dominant axis (sampled up here: uniform control flow)
      const an = abs(nL), dx = an.x.greaterThan(max(an.y, an.z)), dy = an.y.greaterThan(an.z);
      const uvP = select(dx, p.zy, select(dy, p.xz, p.xy));
      const T1 = select(dx, vec3(0, 0, 1), vec3(1, 0, 0)), T2 = select(dx, vec3(0, 1, 0), select(dy, vec3(0, 0, 1), vec3(0, 1, 0)));
      const uvS = lp.xy.add(0.5);
      const cN = texture(TX.crackN, uvP.div(0.35)).xyz;
      const isS = k.lessThan(0.5), isT = k.greaterThan(0.5).and(k.lessThan(1.5)), isI = k.greaterThan(3.5).and(k.lessThan(4.5)), isB = k.greaterThan(11.5);
      const isG = k.greaterThan(1.5).and(k.lessThan(2.5)).or(k.greaterThan(9.5).and(k.lessThan(10.5)));
      const texN = cN.mul(2).sub(1);
      const useTex = select(isG, float(1), float(0));
      const qv = vQ, rotF = (v) => v.add(cross(qv.xyz, cross(qv.xyz, v).add(v.mul(qv.w))).mul(2));
      const pertW = rotF(T1.mul(texN.x).add(T2.mul(texN.y))).mul(useTex).mul(0.6);
      // procedural surface (no texture files): per matter a frequency and a bump, grain in the albedo, crackle in the glaze, rust on the iron
      const fq = select(k.lessThan(0.5), float(4.5), select(k.lessThan(1.5), float(15.0), select(k.lessThan(2.5), float(3.0), select(k.lessThan(3.5), float(1.5), float(8.0)))));
      const amp = select(k.lessThan(0.5), float(0.38), select(k.lessThan(1.5), float(0.16), select(k.lessThan(2.5), float(0.07), select(k.lessThan(3.5), float(0.025), select(k.lessThan(4.5), float(0.22), float(0.03))))));
      const q = p.mul(fq);
      const nA = mx_noise_float(q), nB = mx_noise_float(q.add(vec3(13.1, 7.3, 3.7))), nC = mx_noise_float(q.add(vec3(27.7, 19.1, 5.3)));
      const N = normalize(normalize(nW).add(vec3(nA, nB, nC).mul(amp).mul(select(isS.or(isT).or(isB), float(0), float(1))).mul(float(1).sub(useTex.mul(0.8)))).add(pertW)), V = normalize(cameraPosition.sub(positionWorld));
      // the key: a lamp high over the middle of the room (ART §3) — every wall sees its tower lit from above, from the public's side, a little from the left
      const hx = positionWorld.xz, hr = max(length(hx), 0.001), inw = hx.div(hr).negate();
      const L = normalize(vec3(inw.x.mul(0.62).sub(inw.y.mul(0.5)), 1.15, inw.y.mul(0.62).add(inw.x.mul(0.5))));
      const ndl = max(dot(N, L), 0), ndv = max(dot(N, V), 0), fres = pow(float(1).sub(ndv), 5);
      const H = normalize(L.add(V)), ndh = max(dot(N, H), 0);
      const amb = N.y.mul(0.5).add(0.5).mul(0.025).add(0.004), bounce = vec3(0);   // undersides dark: shadow between the floors
      const rim = pow(float(1).sub(ndv), 2.5).mul(smoothstep(-0.2, 0.6, dot(N, normalize(V.negate().add(vec3(0, 0.7, 0))))));
      const big = mx_noise_float(p.mul(1.7).add(vec3(5.1)));
      const crack = smoothstep(0.045, 0.0, abs(mx_noise_float(p.mul(10.0).add(vec3(2.2)))));       // the glaze's crackle (ridged noise)
      const rust = smoothstep(0.0, 0.45, mx_noise_float(p.mul(5.0)).add(big.mul(0.4)));
      const grain = nA.mul(0.5).add(0.5);
      const base = vC.xyz.mul(select(k.lessThan(1.5), grain.mul(0.45).add(0.75).mul(big.mul(0.25).add(1.0)), float(1))).toVar();
      If(k.greaterThan(1.5).and(k.lessThan(2.5)), () => { base.assign(base.mul(float(1).sub(crack.mul(0.65)))); });
      If(k.greaterThan(3.5).and(k.lessThan(4.5)), () => { base.assign(mix(base, vec3(0.20, 0.075, 0.03).mul(grain.mul(0.6).add(0.6)), rust)); });
      If(isS.or(isT).or(isB).or(isI), () => { base.assign(vC.xyz); });               // the maquette: flat matter, no grain (light does the work)
      const col = vec3(0).toVar();
      const diffuse = base.mul(KEY.mul(ndl.mul(1.05)).add(ndv.mul(0.12)).add(amb)).add(base.mul(bounce));
      const rimL = RIM.mul(rim);
      If(k.lessThan(1.5), () => {                                              // stone, terracotta: matte, a faint sheen
        col.assign(diffuse.add(env(reflect(V.negate(), N), 0.8).mul(fres).mul(0.1)).add(pow(ndh, 18).mul(0.04)).add(rimL.mul(0.55)));
      }).ElseIf(k.lessThan(2.5), () => {                                       // glaze: colour + a sharp highlight + fresnel reflection, dull in the cracks
        const gl = float(1).sub(crack.mul(0.8));
        col.assign(diffuse.mul(0.85).add(env(reflect(V.negate(), N), 0.12).mul(fres.mul(0.85).add(0.05)).mul(gl)).add(KEY.mul(pow(ndh, 140).mul(2.4)).mul(gl)).add(rimL.mul(0.6)));
      }).ElseIf(k.lessThan(3.5), () => {                                       // chrome: the world in it
        col.assign(env(reflect(V.negate(), N), 0.02).mul(vC.xyz).mul(1.0).add(KEY.mul(pow(ndh, 260).mul(5.0))).add(rimL.mul(0.5)));
      }).ElseIf(k.lessThan(4.5), () => {                                       // wrought iron, rusting: dark, glints where it is clean
        col.assign(base.mul(KEY.mul(ndl.mul(0.8)).add(amb)).add(env(reflect(V.negate(), N), 0.4).mul(float(0.25).mul(float(1).sub(rust.mul(0.6))))).add(pow(ndh, 70).mul(float(1.0).mul(float(1).sub(rust.mul(0.6))))).add(rimL.mul(0.7)));
      }).ElseIf(k.lessThan(5.5), () => {                                       // gold
        col.assign(env(reflect(V.negate(), N), 0.08).mul(base).mul(1.1).add(base.mul(ndl.mul(0.1))).add(pow(ndh, 120).mul(vec3(3.0, 2.2, 1.2))).add(rimL.mul(0.4)));
      }).ElseIf(k.lessThan(6.5), () => {                                       // light: cores, fibres, dust
        col.assign(vC.xyz.mul(vG).mul(ndv.mul(0.45).add(0.55)).add(fres.mul(vC.xyz).mul(vG).mul(0.6)));
      }).ElseIf(k.lessThan(7.5), () => {                                       // petals: satin, a little light of their own
        col.assign(diffuse.add(base.mul(0.15)).add(pow(ndh, 30).mul(0.3)).add(env(reflect(V.negate(), N), 0.3).mul(fres).mul(0.2)).add(rimL.mul(0.5)));
      }).ElseIf(k.lessThan(9.5), () => {                                       // the light bodies: a warm core with depth, a rim of teal and gold
        const core = vC.xyz.mul(vG).mul(pow(ndv, 2.2).mul(0.9).add(0.04));
        const r2 = pow(float(1).sub(ndv), 2.0);
        col.assign(core.add(vec3(1.0, 0.7, 0.35).mul(pow(r2, 2.0)).mul(vG).mul(0.9)).add(RIM.mul(r2).mul(1.4)).add(vC.xyz.mul(ndl.mul(0.05))));
      }).ElseIf(k.lessThan(10.5), () => {                                      // a shard of glazed tile: glaze on the face (crackle, clearcoat), biscuit on the edges and back
        const face = smoothstep(0.55, 0.85, abs(nL.y)).mul(step(0.0, nL.y));
        const gl = float(1).sub(crack.mul(0.75));
        const glaze = vC.xyz.mul(float(1).sub(crack.mul(0.6))).mul(KEY.mul(ndl.mul(0.9)).add(amb)).add(env(reflect(V.negate(), N), 0.08).mul(fres.mul(0.9).add(0.06)).mul(gl)).add(KEY.mul(pow(ndh, 160).mul(2.6)).mul(gl));
        const bisc = vec3(0.47, 0.10, 0.045).mul(grain.mul(0.4).add(0.8)).mul(KEY.mul(ndl).add(amb)).add(pow(ndh, 40).mul(0.35));   // the bevel catches a glint
        col.assign(mix(bisc, glaze, face).add(rimL.mul(0.7)));
      }).ElseIf(k.lessThan(11.5), () => {                                      // panot: the Barcelona paving slab, the four-petal flower in relief
        const c = fract(lp.xz.mul(vec2(iS.x, iS.z).div(0.42))).sub(0.5), r = length(c), an = atan(c.y, c.x);
        const petal = smoothstep(0.03, 0.0, abs(r.sub(cos(an.mul(4)).mul(0.07).add(0.21))));
        const ring = smoothstep(0.03, 0.0, abs(length(abs(c).sub(0.5)).sub(0.2)));
        const joint = smoothstep(0.46, 0.49, max(abs(c.x), abs(c.y)));
        const top = smoothstep(0.5, 0.8, nL.y);
        const groove = clamp(petal.add(ring).add(joint), 0, 1).mul(top);
        const cb = base.mul(float(1).sub(groove.mul(0.55)));
        col.assign(cb.mul(KEY.mul(ndl.mul(1.0)).add(amb)).add(pow(ndh, 22).mul(0.05)).add(rimL.mul(0.5)));
      }).ElseIf(k.lessThan(12.5), () => {                                      // persiana: the slatted blind
        const f = fract(lp.y.mul(16)), slat = smoothstep(0.0, 0.12, f).mul(smoothstep(1.0, 0.85, f));
        const Ns = normalize(N.add(vec3(0, f.sub(0.5).mul(0.9), 0)));
        const ls = max(dot(Ns, L), 0);
        col.assign(base.mul(grain.mul(0.3).add(0.85)).mul(KEY.mul(ls).add(amb)).mul(slat.mul(0.8).add(0.2)).add(pow(max(dot(Ns, H), 0), 30).mul(0.12)).add(rimL.mul(0.5)));
      }).ElseIf(k.lessThan(13.5), () => {                                      // a wall of TRENCADÍS: broken glazed tesserae (voronoi), dark grout, every piece tilted its own way → it glitters
        const uvm = lp.xy.mul(iSv.xy).div(0.075 * TS).add(vC.xy.mul(37.0));
        const cell = floor(uvm), f = fract(uvm);
        const d1 = float(9).toVar(), d2 = float(9).toVar(), id = float(0).toVar();
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const c2 = cell.add(vec2(ox, oy)), hA = fract(sin(dot(c2, vec2(127.1, 311.7))).mul(43758.5453)), hB = fract(sin(dot(c2, vec2(269.5, 183.3))).mul(43758.5453));
          const d = length(vec2(ox, oy).add(vec2(hA, hB).mul(0.85)).add(0.075).sub(f)).toVar();
          If(d.lessThan(d1), () => { d2.assign(d1); d1.assign(d); id.assign(hA.add(hB.mul(0.37))); }).ElseIf(d.lessThan(d2), () => { d2.assign(d); });
        }
        const idf = fract(id.mul(7.13)), tone = fract(id.mul(3.71));
        const grout = smoothstep(0.02, 0.07, d2.sub(d1));
        const tcol = select(idf.lessThan(0.68), vC.xyz, select(idf.lessThan(0.84), vec3(0.62, 0.60, 0.54), select(idf.lessThan(0.93), vec3(0.77, 0.37, 0.025), select(idf.lessThan(0.97), vec3(0.016, 0.06, 0.43), vec3(0.025, 0.48, 0.43))))).mul(tone.mul(0.7).add(0.55));
        const Nt = normalize(N.add(rotF(vec3(idf.sub(0.5), tone.sub(0.5), 0)).mul(0.5)));
        const nl = max(dot(Nt, L), 0), nh = max(dot(Nt, H), 0), fr = pow(float(1).sub(max(dot(Nt, V), 0)), 5);
        const glz = tcol.mul(KEY.mul(nl.mul(0.9)).add(0.03)).add(env(reflect(V.negate(), Nt), 0.1).mul(fr.mul(0.8).add(0.07))).add(KEY.mul(pow(nh, 90).mul(2.2)));
        col.assign(mix(vec3(0.012, 0.011, 0.01), glz, grout).add(rimL.mul(0.4)));
      }).Else(() => {                                                          // LIQUID chrome: a plate of metal that ripples slowly; the world swims in it (ref 9)
        const qn = vec3(lp.xy.mul(iSv.xy).mul(1.15), uTime.mul(0.06).add(vC.x.mul(9.0)));
        const w1 = mx_noise_float(qn), w2 = mx_noise_float(qn.add(vec3(7.7, 3.1, 1.3))), w3 = mx_noise_float(qn.mul(2.3).add(vec3(1.7, 9.2, 4.4)));
        const Nl = normalize(N.add(rotF(vec3(w1.add(w3.mul(0.4)), w2.add(w3.mul(0.4)), 0)).mul(1.5)));
        const Rl = reflect(V.negate(), Nl), nh = max(dot(Nl, H), 0);
        const band = sin(Rl.y.mul(9.0).add(w1.mul(3.0))).mul(0.5).add(0.5);                       // the flow lines of a liquid mirror
        const liq = min(env(Rl, 0.02).mul(0.8), vec3(0.9)).add(mix(vec3(0.02, 0.10, 0.11), vec3(0.75, 0.36, 0.16), band).mul(0.35)).add(mix(vec3(0.0), vec3(0.8, 0.85, 0.9), smoothstep(0.86, 0.98, band)).mul(0.3));
        col.assign(liq.mul(vC.xyz).mul(0.8).add(KEY.mul(pow(nh, 300).mul(1.2))).add(rimL.mul(0.5)));
      });
      If(k.lessThan(5.5).or(k.greaterThan(9.5)), () => { col.addAssign(mix(vC.xyz, vec3(0.6), select(k.greaterThan(2.5).and(k.lessThan(3.5)).or(k.greaterThan(12.5)), float(0.8), float(0.15))).mul(vN).mul(ndv.mul(0.6).add(0.4))); });   // the floor's neon on it
      // iD: x flash, y brightness (reward / far haze), z touch glow
      // a thin turquoise rim on every silhouette (1.5–2 px): the grazing band of the fresnel
      const Rc = reflect(V.negate(), N), warm = vec3(1.0, 0.56, 0.26).mul(pow(max(dot(Rc, normalize(L.add(vec3(0, -0.45, 0)))), 0), 14).mul(0.9).add(smoothstep(0.25, -0.35, Rc.y).mul(smoothstep(-0.9, -0.35, Rc.y)).mul(0.22))).mul(select(k.greaterThan(2.5).and(k.lessThan(3.5)), float(1), float(0)));   // chrome: a warm lamp and the warm floor of the square live in it (ART r3)
      const fo = falloff(), edge = RIM.mul(smoothstep(0.82, 0.97, float(1).sub(ndv))).mul(1.2).mul(select(k.lessThan(5.5).or(k.greaterThan(6.5).and(k.lessThan(8.5))).or(k.greaterThan(9.5)), float(1), float(0)));   // in the dark below, the turquoise filo still draws every silhouette
      const lit = col.mul(fo).add(edge.mul(max(fo, 0.55))).add(warm.mul(max(fo, 0.22))).mul(vD.y).mul(vD.w).mul(mix(vec3(1), vec3(1.25, 0.86, 0.5), clamp(vD.x.mul(0.8).add(vD.z.mul(0.45)), 0, 1))).mul(vD.x.mul(0.35).add(1));   // a flash / a held hand TINT the matter amber (never add white)   // a flash / a held hand brighten the floor's own matter (no white wash)
      return vec4(hush(lit).mul(uGain), 1);
    })();
    m.fog = false;
    return m;
  }
  function glassMaterial() {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const { nW, lp } = vertexCommon(m);
    const iD = attribute('iD', 'vec4'), vD = varying(iD);
    m.colorNode = Fn(() => {
      const N = normalize(nW), V = normalize(cameraPosition.sub(positionWorld));
      const ndv = abs(dot(N, V)), fres = pow(float(1).sub(ndv), 3);
      const Rv = reflect(V.negate(), N), E = env(Rv, 0.03);
      const a = abs(lp).mul(2);                                                // 0 at the centre, 1 at a face
      const e1 = smoothstep(0.93, 0.99, a.x).mul(smoothstep(0.93, 0.99, a.y)), e2 = smoothstep(0.93, 0.99, a.y).mul(smoothstep(0.93, 0.99, a.z)), e3 = smoothstep(0.93, 0.99, a.x).mul(smoothstep(0.93, 0.99, a.z));
      const edge = clamp(e1.add(e2).add(e3), 0, 1);
      // a thin film: the grazing reflection runs through rose, gold and teal
      const film = vec3(0.5).add(cos(vec3(0, 2.1, 4.2).add(ndv.mul(7.0))).mul(0.5));
      const col = E.mul(fres.mul(0.85).add(0.035)).mul(mix(vec3(1), film, 0.6)).add(vec3(0.4, 0.7, 0.8).mul(0.02)).add(vec3(0.9, 0.95, 1.0).mul(edge).mul(0.5)).add(RIM.mul(fres).mul(0.3));
      return vec4(hush(col.mul(vD.y).mul(falloff()).mul(vD.x.mul(0.8).add(1))).mul(uGain), 1);
    })();
    m.fog = false;
    return m;
  }
  // smoke wisps (billboards facing the eye): fractal noise in a soft disc, additive, very faint
  function smokeMaterial() {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const { lp } = vertexCommon(m);
    const iC = attribute('iC', 'vec4'), iD = attribute('iD', 'vec4'), iS = attribute('iS', 'vec4');
    const vC = varying(iC), vD = varying(iD), vG = varying(iS.w);
    m.colorNode = Fn(() => {
      const uv = lp.xy, r = length(uv.mul(vec2(1, 1.3))).mul(2);
      const q = vec3(uv.mul(2.2), vG.add(uTime.mul(0.04)));
      const n = mx_noise_float(q).add(mx_noise_float(q.mul(2.3)).mul(0.5)).mul(0.6).add(0.5);
      const a = smoothstep(1.0, 0.25, r).mul(smoothstep(0.35, 0.9, n));
      return vec4(hush(vC.xyz.mul(a).mul(0.5).mul(vD.y)).mul(uGain), 1);
    })();
    m.fog = false;
    return m;
  }
  // collage panels (ref 9): a rectangle of pixel-sorted strips — columns of colour of different lengths, a few shifted blocks, a thin frame
  function panelMaterial() {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const { lp } = vertexCommon(m);
    const iC = attribute('iC', 'vec4'), iD = attribute('iD', 'vec4'), iS = attribute('iS', 'vec4');
    const vC = varying(iC), vD = varying(iD), vG = varying(iS.w);
    const h1 = (x) => fract(sin(x.mul(12.9898)).mul(43758.5453));
    m.colorNode = Fn(() => {
      const u = lp.x.add(0.5), v = lp.y.add(0.5);
      const row = floor(v.mul(9)), shift = select(h1(row.add(vG.mul(3.1))).greaterThan(0.75), h1(row.add(vG)).mul(0.3), float(0));
      const colI = floor(fract(u.add(shift)).mul(28)), hc = h1(colI.add(vG.mul(7.3)));
      const len = hc.mul(0.8).add(0.1), on = smoothstep(len, len.add(0.03), v);   // the sorted run: from the top of the column down to len
      const tint = mix(vC.xyz, vec3(0.9, 0.85, 0.75), h1(colI.add(31.0)).mul(0.5)).mul(h1(colI.add(vG)).mul(0.6).add(0.4));
      const grad = mix(tint.mul(0.25), tint, v);
      const frame = float(1).sub(smoothstep(0.0, 0.02, u).mul(smoothstep(1.0, 0.98, u)).mul(smoothstep(0.0, 0.02, v)).mul(smoothstep(1.0, 0.98, v)));
      const c = grad.mul(on.mul(0.85).add(0.08)).add(vec3(0.9, 0.85, 0.75).mul(frame).mul(0.5));
      return vec4(hush(c.mul(0.7).mul(vD.y).mul(falloff()).mul(vD.x.mul(0.6).add(1))).mul(uGain), 1);
    })();
    m.fog = false;
    return m;
  }

  // the void behind everything: a deep gradient — teal-blue night above, a thin warm line at the horizon, black below
  {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const d = varying(normalize(positionGeometry));
    m.colorNode = Fn(() => {
      const y = d.y;
      const c = mix(vec3(0.0008, 0.0012, 0.002), vec3(0.003, 0.012, 0.02), smoothstep(-0.3, 0.9, y));   // no amber horizon: the void is teal-black (ART-2 §3)
      return vec4(c.mul(uGain).mul(uDecor), 1);
    })();
    m.fog = false;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), m); sky.renderOrder = -5; sky.frustumCulled = false; object.add(sky);
  }

  // -------------------------------------------------------------------------------------------- T-041 · LIFT AND LEVEL: the band of shoulders
  // On every castell wall, just behind the wall plane, a horizontal band of light at the height of the hands: a bone line and a row of glazed
  // shards («the shoulders»). It follows the median height of the hands on that wall (state.yMed[w]), tilts with yR − yL (the two sides of the
  // tower), rises ~60 cm with the phrase and, at the top, the floor locks into the tower (the existing lock: weight + flash). It lives in the
  // ROOM frame (not the rising world). Alone (study): params lift (bool), level (yL − yR, m), cycle (floors go up one per phrase).
  const PHRASE = 4.8, BAND_W = 2.6, _vb = new THREE.Vector3(), _vs = new THREE.Vector3();
  const bands = walls.map((w, wi) => {
    const g = new THREE.Group(); g.name = 'band' + wi; g.visible = false; object.add(g);
    const U = { k: uniform(0), flash: uniform(0) };
    const lineM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    lineM.colorNode = vec4(vec3(1.0, 0.86, 0.66).mul(U.k.mul(1.3).add(U.flash.mul(2.5))), 1);
    const line = new THREE.Mesh(new THREE.BoxGeometry(BAND_W, 0.014, 0.014), lineM); g.add(line);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(BAND_W * 1.05, 0.22), (() => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const uvv = varying(positionGeometry); m.colorNode = vec4(vec3(1.0, 0.62, 0.3).mul(exp(uvv.y.mul(uvv.y).negate().div(0.0025))).mul(smoothstep(BAND_W * 0.53, BAND_W * 0.35, abs(uvv.x))).mul(U.k.mul(0.35).add(U.flash.mul(0.8))), 1); return m; })());
    g.add(glow);
    const N = 18, tileM = new THREE.MeshBasicNodeMaterial();
    const ic = attribute('instanceColor', 'vec3'), nrm = normalize(TSL.normalWorld ?? vec3(0, 0, 1));
    tileM.colorNode = Fn(() => { const V = normalize(cameraPosition.sub(positionWorld)), ndv = abs(dot(nrm, V)); return vec4(ic.mul(ndv.mul(0.6).add(0.9)).add(vec3(1.0, 0.9, 0.75).mul(pow(ndv, 30.0).mul(0.6))).mul(U.k.mul(1.1).add(U.flash.mul(1.6))), 1); })();
    const tiles = new THREE.InstancedMesh(bases[G_SHARD], tileM, N); tiles.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), cc = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const x = -BAND_W / 2 + (i + 0.5) * BAND_W / N + (R() - 0.5) * 0.04, s = 0.13 + R() * 0.05;
      e4.set(Math.PI / 2 + (R() - 0.5) * 0.3, (R() - 0.5) * 0.3, (R() - 0.5) * 0.5); q4.setFromEuler(e4);
      m4.compose(_vb.set(x, (R() - 0.5) * 0.04, 0.01), q4, _vs.set(s, s * 0.1, s * (0.6 + R() * 0.3))); tiles.setMatrixAt(i, m4);
      const c = pick(GLZ); tiles.setColorAt(i, cc.setRGB(c[0], c[1], c[2]));
    }
    g.add(tiles);
    return { g, U, w, y: 0.95, tilt: 0, vy: 0 };
  });

  // «la plaça»: on the walls with no tower the band is faint; lifting there sends a CURRENT of light along the foot of the walls (0.25 m, just
  // behind them) to the nearest tower, which lights at its base when it arrives (it counts half, in the score)
  const PER = [], perim = (() => { let a = 0; for (const w of walls) { PER.push(a); a += w.width; } return a; })();
  const streaks = Array.from({ length: 6 }, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const U = { k: uniform(0) }, uvv = varying(positionGeometry);
    m.colorNode = vec4(vec3(1.0, 0.66, 0.32).mul(smoothstep(0.5, -0.5, uvv.x).mul(exp(uvv.y.mul(uvv.y).negate().div(0.02)))).mul(U.k.mul(2.2)), 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.09), m); mesh.visible = false; mesh.frustumCulled = false; object.add(mesh);
    return { mesh, U, on: false, s: 0, s1: 0, dir: 1, to: 0 };
  });
  const wallAt = (sp) => { sp = ((sp % perim) + perim) % perim; for (let i = walls.length - 1; i >= 0; i--) if (sp >= PER[i]) return [i, (sp - PER[i]) / walls[i].width]; return [0, 0]; };
  const plazaPrev = walls.map(() => 0), plazaCool = walls.map(() => 0);
  function sendCurrent(from, to) {
    const st = streaks.find((x) => !x.on); if (!st) return;
    const s0 = PER[from] + walls[from].width / 2, s1 = PER[to] + walls[to].width / 2;
    let d = s1 - s0; if (d > perim / 2) d -= perim; if (d < -perim / 2) d += perim;
    Object.assign(st, { on: true, s: s0, s1: s0 + d, dir: Math.sign(d) || 1, to }); st.mesh.visible = true;
  }

  // -------------------------------------------------------------------------------------------- per-frame state
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _ax = new THREE.Vector3();
  const YAXIS = new THREE.Vector3(0, 1, 0), ZAXIS = new THREE.Vector3(0, 0, 1), _eye = new THREE.Vector3(), _m4 = new THREE.Matrix4();
  const G = 6.5;                       // a dreamt gravity, with weight (ART §5)
  let decor = 1, wasIn = true, frame = 0, snapNext = false;
  const lone = () => !!ctx.parts && Object.keys(ctx.parts).length === 0;   // fall3d's private tower (parts: {}): floors only
  let beat = 0, beatPrev = 0, pulseT = 9, lockRingT = 9;
  let wobWall = -1, liftHold = 0, liftOn = false, liftP = 0, wob = { on: false, t: 0, side: 1, lv: -1, end: '' }, slip = { lv: -1, t: 0 }, wobPrev = false, standDrop = 0;
  let pull = 0, time = 0, rise = 0, riseV = 0, floorsPrev = -1, reward = 0, rewardT = 0;
  const impacts = [], impactPool = Array.from({ length: 32 }, () => ({ wall: 0, u: 0.5, force: 0 }));
  function impact(wall, u, force, mat, kind) {
    if (impacts.length < impactPool.length) { const o = impactPool[impacts.length]; o.wall = wall; o.u = u; o.force = force; impacts.push(o); }
    if (mat) fxImpact(wall, u, force, mat, kind);
  }
  // ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0, slideT = 0;
  function fxImpact(wall, u, strength, mat, kind) {                // wall: room.walls index · u: 0..1 along it · strength: 0..1
    if (!fxBc || fxN >= 16) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }

  function startSlip(lv) {                                            // T-041: the wobble is lost, the top floor falls (it does not collapse the tower)
    if (lv < 1) return; slip.lv = lv; slip.t = time;
    for (const t of towers) { if (!t.on) continue; const L = t.levels[lv]; L.flash = 1; t.lastFloors = Math.min(t.lastFloors, lv - 1);
      for (const pc of pieces) { if (pc.tw !== t.tw || pc.lv !== lv || pc.st !== 0 || pc.smoke) continue;
        homeInTower(t, pc, pc.p); pc.q.copy(L.Qt).multiply(pc.hq); pc.v.set(wob.side * (0.8 + R() * 1.6), 0.4 + R() * 1.2, 0.6 + R() * 1.0); pc.w.set((R() - 0.5) * 5, (R() - 0.5) * 5, (R() - 0.5) * 5); pc.st = 1; pc.rest = 0; }
      impact(t.tw, 0.5, 1, 'stone', 'hit'); }
  }
  function resetTower(t) {
    t.theta = 0; t.omega = 0; t.dip = 0; t.dipV = 0;
    for (const L of t.levels) { L.ax = L.az = L.vax = L.vaz = 0; L.flash = 0; L.lockT = -99; }
    for (const pc of pieces) if (pc.tw === t.tw) { pc.st = 0; pc.knock = 0; }
  }
  // tower frame → part frame (the `world` group)
  function towerFrame(t) {
    _e.set(0, t.yaw, 0, 'YXZ'); t.q.setFromEuler(_e); _q.setFromAxisAngle(ZAXIS, t.theta); t.q.multiply(_q); t.qi.copy(t.q).invert();
  }
  function toPart(t, p, out) { return out.copy(p).applyQuaternion(t.q).add(t.base); }
  function toTower(t, p, out) { return out.copy(p).sub(t.base).applyQuaternion(t.qi); }
  function homeInTower(t, pc, out) { const L = t.levels[pc.lv]; return out.set(pc.home[0], pc.home[1], pc.home[2]).applyQuaternion(L.Qt).add(L.Ot); }

  function detach(t, pc, vx, vy, vz) {
    const L = t.levels[pc.lv];
    const list = pc.grp >= 0 ? pieces.filter((o) => o.grp === pc.grp && o.tw === pc.tw) : [pc];   // (rare: only on detach)
    for (const o of list) {
      if (o.st !== 0) continue;
      homeInTower(t, o, o.p); o.q.copy(L.Qt).multiply(o.hq);
      o.v.set(vx + (R() - 0.5) * 0.25, vy + R() * 0.2, vz + (R() - 0.5) * 0.25);
      // the floor's own turning carries the piece
      o.v.x += -o.p.z * LEVELS[o.lv].spin * 0.8; o.v.z += o.p.x * LEVELS[o.lv].spin * 0.8;
      o.w.set((R() - 0.5) * 3, (R() - 0.5) * 3, (R() - 0.5) * 3); o.st = 1; o.rest = 0;
    }
  }

  let lastKnock = -2;
  let hitU = 0.5;
  function knockTower(t, hit, strength) {   // hit: tower frame
    let best = -1;
    for (let lv = 0; lv < NL; lv++) { const Ld = LEVELS[lv], b = Ld.base; if (hit.y >= b - GAP * 0.5 - 0.25 && hit.y <= b + Ld.h + GAP * 0.5 + 0.25) { best = lv; if (hit.y <= b + Ld.h) break; } }
    if (best < 0 || best > t.formed) { lastKnock = -1; return; }
    lastKnock = best;
    const far = Math.abs(hit.x) > LEVELS[best].r + 2.5;   // a hand far from the tower still shakes its floor, more softly
    if (far) strength *= 0.6;
    const L = t.levels[best], side = hit.x >= 0 ? 1 : -1;
    L.vaz += -side * 0.9 * strength; L.vax += -0.6 * strength; L.flash = Math.min(1, L.flash + 0.55); L.glow = 1;
    let n = 3 + Math.floor(R() * 3);
    const cand = [];
    for (const pc of pieces) if (pc.tw === t.tw && pc.lv === best && pc.loose && pc.st === 0) cand.push(pc);
    cand.sort((a, b) => Math.abs(a.home[0] - hit.x) - Math.abs(b.home[0] - hit.x));
    for (const pc of cand) { if (n-- <= 0) break; detach(t, pc, side * 0.6 + (R() - 0.5) * 0.9, 1.6 + R() * 1.2, 0.8 + R() * 1.2); }   // knocked: up and out, towards the room
    impact(t.tw, hitU, 0.7 * strength, 'ceramic', 'hit');
  }

  // -------------------------------------------------------------------------------------------- update
  function update(dt, input) {
    dt = Math.min(Math.max(dt || 1 / 60, 0), 0.05);
    time = input.time ?? time + dt; uTime.value = time;
    impacts.length = 0; fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; } slideT -= dt;
    const pr = input.params || P, S = input.state || null;
    if (!S && pr.collapse && pr.collapse !== 'off' && !col.on && floorsPrev >= 0 && time > 2) collapse({ mode: pr.collapse, duration: pr.collapseDur ?? 15 });   // study
    if (!S && (!pr.collapse || pr.collapse === 'off') && col.on) restore();
    uGain.value = (pr.gain ?? 1) * (col.on ? 1 - smooth(col.dur - 2.5, col.dur, col.t) : 1);   // the collapse ends in the dark
    // ---- the score (or the study's stand-in)
    let floors, prog, structure, rewarding;
    if (S) { floors = S.floors || 0; prog = S.floorProgress || 0; rewarding = S.phase === 'reward' && S.block === 'tronc'; structure = S.walls; }
    else {
      if (pr.cycle > 0) { const c = (time % pr.cycle) / pr.cycle, x = c * 10.5; floors = Math.min(9, Math.floor(x)); prog = x - Math.floor(x); }
      else { floors = pr.floors >= 0 ? Math.round(pr.floors) : Math.round(9 * clamp01(input.progress ?? pr.progress ?? 0)); prog = pr.floorProgress ?? 0.4; }
      rewarding = !!pr.reward; structure = null;
    }
    // ---- T-041 lift and level: in lift mode the floor's progress is the band's rise (score: state.yMed …; alone: a stand-in phrase of 4.8 s)
    liftOn = S ? (Array.isArray(S.yMed) && pr.lift !== false) : pr.lift !== false;
    let phraseK = 0;
    if (liftOn && !S) {
      const ph = (time % PHRASE) / PHRASE;                                // gather 0–0.2 · rise 0.2–0.72 · lock and hold 0.72–1
      phraseK = smooth(0.2, 0.72, ph);
      if (pr.cycle > 0) floors = Math.min(9, Math.floor((time % (PHRASE * 10)) / PHRASE));
      prog = phraseK;
    }
    if (!S) floors -= standDrop;
    floors = Math.max(0, Math.min(9, floors | 0)); if (floors >= 9) prog = 0;
    if (liftOn && S && Array.isArray(S.liftK)) {                          // ENT (T-041): liftK[w] 0..1, how far each wall rose in this phrase
      let sum = 0, n = 0; for (let w = 0; w < S.liftK.length; w++) if (!S.walls || S.walls[w]) { sum += S.liftK[w] || 0; n++; }
      const target = n ? sum / n : 0, held = S.phrase === 'lock' ? Math.max(liftHold, target) : target;
      liftHold = S.phrase === 'gather' ? target : held; liftP = held;
    } else liftP = liftOn ? prog : 0;
    // ---- the pulse (score: beat 0..1, 0 at the drum; alone: a free pulse every 2.4 s)
    beatPrev = beat; beat = S ? (S.beat || 0) : (pr.pulse === false ? 0.5 : (time % 2.4) / 2.4);
    const playing = S ? S.block === 'tronc' && S.phase === 'play' : !pr.reward && pr.pulse !== false;
    let pulsed = playing && floors < 9 && ((input.events && input.events.includes && input.events.includes('pulse')) || (beat < beatPrev - 0.5));
    pulseT += dt; lockRingT += dt; if (pulsed) pulseT = 0;
    // the forming floor breathes with the drum: it gathers towards the beat, is tightest ON it, and lets go after
    const breath = playing && !liftOn ? 1 - 0.34 * Math.max(Math.exp(-beat * 7), smooth(0.62, 1, beat)) : 1;
    // outside the tronc (pom, baixada, fall…) the tower keeps the floors the group reached; while it collapses, too
    const inTronc = !S || S.block === 'tronc';
    // outside its own block (baixada, fall: the floors are taken and redrawn in glass, T-035/T-036) only the floors are drawn: the decor
    // — near tesserae, far towers and debris, smoke, the void, the lock ring — fades out in ~1 s. Also with the study parameter decor: false.
    { const want = inTronc && pr.decor !== false && !(!S && lone()) ? 1 : 0; decor += (want - decor) * (1 - Math.exp(-dt * 4)); if (Math.abs(want - decor) < 0.004) decor = want; uDecor.value = decor; }
    frame++;
    if (S && inTronc && !wasIn && col.on) restore();   // a new pass: the tower that fell stands again (3D-PI, T-036)
    if (col.on) { floors = col.floors; prog = 0; rewarding = false; }
    else if (!inTronc) { floors = keepFloors; prog = 0; rewarding = false; }
    else keepFloors = floors;
    if (col.on) col.t += dt;
    const arrive = S ? (input.arrive ?? 1) : (input.arrive ?? pr.arrive ?? 1);
    const leave = S ? (input.leave ?? 0) : (input.leave ?? pr.leave ?? 0);
    reward += ((rewarding ? 1 : 0) - reward) * (1 - Math.exp(-dt * 0.5));
    rewardT = rewarding ? rewardT + dt : 0;
    const nw = Math.max(1, Math.min(NW, Math.round(pr.walls ?? NW)));
    const reset = floors < floorsPrev - (liftOn ? 1 : 0) && inTronc && !col.on;
    if (floors === floorsPrev - 1 && liftOn && inTronc && !col.on && slip.lv < 0) startSlip(floorsPrev);   // the wobble was lost: the top floor goes

    // ---- the rise: the room climbs beside the tower, following the forming floor; it goes on at the reward and while leaving
    const fl = Math.min(NL - 1, floors + 1), riseOn = (pr.rise ?? 1);
    const formY = liftOn ? 1.0 : FORM_Y;                                   // T-041 (album 2): in lift mode the forming floor lives in the LOWER half, at the hands (~1.4 m on the wall)
    let target = (LEVELS[fl].base + LEVELS[fl].h * 0.5 + BASE_Y - formY) * riseOn + RISE0 * (1 - riseOn);   // the forming floor at ~3.1 m on the wall, above the guide's text; the tower's island floats: the rise starts below 0
    // the reward: the towers draw back (~28 m) and the room settles at their middle, once, so the whole tower is seen
    pull += ((rewarding || (leave > 0 && pull > 0.01) ? 1 : 0) - pull) * (1 - Math.exp(-dt * 0.6));
    if (pull > 0.001) target = target + (TOWER_H * 0.42 + BASE_Y - 1.0 - target) * smooth(0, 1, pull);
    if (!inTronc || col.on) target = rise;                                      // the rise belongs to the tronc
    if (leave > 0 && pull < 0.01) target = Math.max(target, rise + 3);
    if (reset || floorsPrev < 0 || (inTronc && !wasIn) || snapNext) { rise = target; riseV = 0; snapNext = false; }
    wasIn = inTronc;
    if (S && inTronc) for (const t of towers) for (const L of t.levels) L.taken = false;   // in its own block the tower is always its own (a takeFloor left over from the baixada must not hide it)
    { const vmax = 0.35, acc = 0.25, want = Math.max(-vmax, Math.min(vmax, (target - rise) * 0.6)); riseV += Math.max(-acc * dt, Math.min(acc * dt, want - riseV)); rise += riseV * dt; }
    world.position.y = -rise;
    // ---- T-041 the currents of la plaça (room frame, along the foot of the walls)
    for (const st of streaks) {
      if (!st.on) continue;
      st.s += st.dir * 5.5 * dt; st.U.k.value = Math.min(1, st.U.k.value + dt * 6);
      const done = st.dir > 0 ? st.s >= st.s1 : st.s <= st.s1;
      const [wi, u] = wallAt(done ? st.s1 : st.s), w = walls[wi];
      room.wallPoint(wi, Math.min(1, Math.max(0, u)), 0.25 / w.height, _v); _v.addScaledVector(w.normal, -0.1);
      st.mesh.position.copy(_v); _e.set(0, Math.atan2(w.normal.x, w.normal.z), 0, 'YXZ'); st.mesh.quaternion.setFromEuler(_e); st.mesh.scale.x = st.dir;
      if (done) { st.on = false; st.mesh.visible = false; st.U.k.value = 0; const t = towers[st.to]; if (t && t.on) { t.levels[0].flash = Math.max(t.levels[0].flash, 0.8); t.levels[1].flash = Math.max(t.levels[1].flash, 0.4); } if (bands[st.to]) bands[st.to].U.flash.value = 0.7; }
    }
    // ---- T-041 the bands of shoulders (room frame)
    for (let wi = 0; wi < bands.length; wi++) {
      const b = bands[wi], w = walls[wi], hasT = structure ? !!structure[wi] : wi < nw, onT = inTronc && liftOn && !col.on, kWant = onT ? (hasT ? 1 : 0.3) : 0;
      let yM, dLR;
      if (S && Array.isArray(S.band)) { yM = S.band[wi] || 0.9; const yl = S.yL?.[wi] || 0, yr = S.yR?.[wi] || 0; dLR = yl && yr ? yl - yr : 0; }
      else if (S) { yM = S.yMed?.[wi] || 0; const yl = S.yL?.[wi] || 0, yr = S.yR?.[wi] || 0; dLR = yl && yr ? yl - yr : 0; if (!yM) yM = 0.95 + 0.35 * liftP; }   // no hands: it waits at the shoulders, a little lifted by the phrase
      else { yM = 0.95 + 0.6 * liftP; dLR = pr.level ?? 0; }
      yM = Math.min(2.1, Math.max(0.6, yM || 0.95));
      b.vy += ((yM - b.y) * 60 - b.vy * 14) * dt; b.y += b.vy * dt;           // follows the hands with no added delay (a stiff spring)
      b.tilt += (Math.max(-0.3, Math.min(0.3, Math.atan2(dLR, BAND_W * 0.6))) - b.tilt) * (1 - Math.exp(-dt * 10));
      const kk = b.U.k.value + (kWant - b.U.k.value) * (1 - Math.exp(-dt * 3));
      // la plaça: a lift on a wall with no tower sends a current to the nearest tower (score: rise[w] crosses 0.18 m; alone: each phrase's rise)
      if (onT && !hasT) {
        const rv = S ? (S.rise?.[wi] || 0) : liftP; plazaCool[wi] -= dt;
        if (rv > (S ? 0.18 : 0.5) && plazaPrev[wi] <= (S ? 0.18 : 0.5) && plazaCool[wi] <= 0) {
          let best = -1, bd = 1e9; for (let j = 0; j < walls.length; j++) { const hj = structure ? !!structure[j] : j < nw; if (!hj) continue; let d = Math.abs((PER[j] + walls[j].width / 2) - (PER[wi] + w.width / 2)); d = Math.min(d, perim - d); if (d < bd) { bd = d; best = j; } }
          if (best >= 0) { sendCurrent(wi, best); plazaCool[wi] = 1.2; b.U.flash.value = 0.6; }
        }
        plazaPrev[wi] = rv;
      }
      b.U.k.value = kk; b.g.visible = kk > 0.01;
      b.U.flash.value *= Math.exp(-dt * 3);
      b.g.position.copy(w.centre).addScaledVector(w.normal, -0.12).setY(b.y);
      _e.set(0, Math.atan2(w.normal.x, w.normal.z), -b.tilt, 'YXZ'); b.g.quaternion.setFromEuler(_e);
    }
    { const pk = smooth(0, 1, pull); uFall.value.set(3.5 - 40 * pk, 5.3 - 30 * pk); }   // drawn back (reward), the whole tower is lit

    // ---- T-041 the wobble (penultimate floor): events 'wobble' → the tower leans to one side, the floor cracks, the base lights; 'steady' →
    // it settles with a deep blow; 'slip' → the top floor falls (the score takes one floor away). Alone: params wobble (bool) + wobbleEnd.
    { const ev = input.events || [], has = (x) => ev.includes && ev.includes(x);
      let start = has('wobble'), steady = has('steady'), slipE = has('slip');
      if (!S) { const on = !!pr.wobble; if (on && !wobPrev) { start = true; standDrop = 0; } wobPrev = on; if (wob.on && wob.t > 5) { if ((pr.wobbleEnd || 'steady') === 'slip') slipE = true; else steady = true; } if (!on && standDrop && slip.lv < 0) standDrop = 0; }
      if (S) { const on = (S.wobble || 0) > 0; if (on && !wob.on) start = true; if (!on && wob.on && !steady && !slipE) wob.on = false; }
      if (start && !wob.on && inTronc) { wob.on = true; wob.t = 0; wob.side = R() < 0.5 ? -1 : 1; wob.lv = floors;
        for (const t of towers) if (t.on && (!S || t.tw === S.wobbleWall)) { t.levels[Math.max(1, floors)].flash = 1; impact(t.tw, 0.5, 0.9, 'ceramic', 'break'); } }
      if (wob.on) wob.t += dt;
      if (steady && (wob.on || S)) { const ww = wob.on ? (S ? S.wobbleWall : -1) : -1; wob.on = false; for (const t of towers) if (t.on && (ww < 0 || !S || t.tw === wobWall)) { t.dipV -= 5.5; for (let lv = 0; lv <= floors; lv++) t.levels[lv].flash = Math.max(t.levels[lv].flash, 0.55); impact(t.tw, 0.5, 1, 'stone', 'floor'); } }
      if (slipE && (wob.on || S)) { wob.on = false; if (!S) standDrop = 1; else if (slip.lv < 0) startSlip(floors); }
      if (slip.lv >= 0 && time - slip.t > 2.6) { for (const pc of pieces) if (pc.lv === slip.lv && pc.layer === 'tower' && (pc.st === 1 || pc.st === 2)) pc.st = 0; slip.lv = -1; }
    }

    if (S && (S.wobbleWall ?? -1) >= 0) wobWall = S.wobbleWall;
    // ---- per tower
    for (const t of towers) {
      const on = structure ? !!structure[t.tw] : t.tw < nw;
      t.on = on;
      if (!on) continue;
      if (reset) resetTower(t);
      t.ringT += dt; if (pulsed && !liftOn) t.dipV -= 1.5;                    // the drum: the whole tower takes the beat
      t.formed = floors;                              // levels 0..floors are fixed (level 0 = the plinth, always)
      // a new floor locks: weight + flash
      if (floors > t.lastFloors) for (let lv = t.lastFloors + 1; lv <= floors; lv++) { const L = t.levels[lv]; L.lockT = time; L.fromK = Math.pow(1 - clamp01(lv === floors ? Math.max(prog, 0.55) : 0.9), 1.5); }
      t.lastFloors = floors;
      // the lean: a damped spring towards lean·7°, weak trembles it
      let lean = S ? (S.lean?.[t.tw] || 0) : (pr.lean ?? 0) * (t.tw % 2 ? -1 : 1);
      let weak = S ? (S.weak?.[t.tw] || 0) : (pr.weak ?? 0);
      if (liftOn && !S) lean = clamp01(Math.abs(pr.level ?? 0) / 0.35) * Math.sign(pr.level ?? 0);   // stand-in: lean from the two sides' heights (yL − yR)
      if (wob.on && (!S || t.tw === wobWall)) { if (!S) lean = wob.side * smooth(0, 1.2, wob.t) * 0.9; weak = 3; t.levels[0].glow = 1; t.levels[0].flash = Math.max(t.levels[0].flash, 0.25 + 0.2 * Math.sin(time * 9)); }   // the foot lights: hands there   // the tower goes to one side, trembles, its foot lights
      if (!inTronc || col.on) { lean = 0; weak = 0; }
      if (col.on) collapseStep(t, dt);
      t.weak = weak;
      const tgt = col.on ? t.colTilt : -lean * 0.122 * (1 - reward * 0.6);
      const k = 5.0, c = 1.3;
      t.omega += ((tgt - t.theta) * k - t.omega * c) * dt + (weak / 3) * (Math.sin(time * 17.3 + t.tw) * 0.9 + Math.sin(time * 29.1 + t.tw * 2) * 0.6) * 0.09 * dt * 60 * dt;
      t.theta += t.omega * dt;
      t.dipV += (-t.dip * 60 - t.dipV * 7) * dt; t.dip += t.dipV * dt;
      t.dist = TOWER_D + 16 * smooth(0, 1, pull); t.base.copy(t.w.centre).addScaledVector(t.w.normal, -t.dist).setY(BASE_Y);
      towerFrame(t);
      const tilt = Math.abs(t.theta);
      t.straightT = tilt < 0.03 && weak < 0.5 ? t.straightT + dt : 0;
      // the levels' frames (tower frame): float, turn, wobble
      for (let lv = 0; lv < NL; lv++) {
        const L = t.levels[lv], Ld = LEVELS[lv];
        L.spin = L.spin0 + Math.sin(time * 0.11 + lv * 1.9 + t.tw) * 0.26;   // the floors turn a little, back and forth: the composition holds, the volume shows
        const hk = lv / (NL - 1);
        const tr = (weak / 3) * 0.02 * hk;
        L.vax += (-L.ax * 40 - L.vax * 3.2) * dt + tr * Math.sin(time * 23 + lv * 1.7) * 60 * dt;
        L.vaz += (-L.az * 40 - L.vaz * 3.2) * dt + tr * Math.sin(time * 19 + lv * 2.3) * 60 * dt;
        L.ax += L.vax * dt; L.az += L.vaz * dt;
        L.flash *= Math.exp(-dt * 2.6); L.glow *= Math.exp(-dt * 1.5);
        if (pulseT < 1.2 && lv <= floors + 1 && lv >= floors - 3) { const wv = Math.exp(-Math.pow((floors + 1 - lv) - (0.9 - pulseT) * 5, 2) * 1.6) * 0.55; if (wv > L.flash) L.flash = wv; }   // a wave of light climbs the last floors after every beat, and reaches the forming one
        const age = time - L.lockT;
        if (age >= 0 && age < 0.75 && age + dt >= 0.75) {             // landed: the tower takes the weight
          t.dipV -= 3.4 + lv * 0.05; L.flash = 1; t.omega += (R() - 0.5) * 0.05; t.ringLv = lv; t.ringT = 0;
          impact(t.tw, 0.5, 0.8);
          if (bands[t.tw]) bands[t.tw].U.flash.value = 1;
          for (let j = Math.max(0, lv - 2); j < lv; j++) t.levels[j].flash = Math.max(t.levels[j].flash, 0.3);
        }
        const bob = Math.sin(time * 0.7 + lv * 1.3 + t.tw) * 0.025;
        _e.set(L.ax, 0, L.az, 'XYZ'); L.Qt = L.Qt || new THREE.Quaternion(); L.Qt.setFromEuler(_e); _q.setFromAxisAngle(YAXIS, L.spin); L.Qt.multiply(_q);
        L.Ot = L.Ot || new THREE.Vector3(); L.Ot.set(0, Ld.base + bob + t.dip * (0.3 + 0.7 * hk), 0);
        // part frame
        L.O.copy(L.Ot).applyQuaternion(t.q).add(t.base); L.Q.copy(t.q).multiply(L.Qt);
      }
      // loose pieces let go when the tower tilts or trembles
      const rate = Math.max(0, tilt - 0.035) * 0.55 + Math.max(0, weak - 0.5) * 0.012;   // per second: at full lean ~1 piece in 5 lets go each second
      if (rate > 0 && reward < 0.5 && leave === 0 && !col.on) for (const pc of pieces) {
        if (pc.tw !== t.tw || !pc.loose || pc.st !== 0 || pc.lv > floors || pc.lv === 0 && tilt < 0.08) continue;
        if (R() < rate * dt * (0.3 + 0.7 * pc.lv / NL)) detach(t, pc, Math.sign(-t.theta) * 0.5, 0.2, 0.5 + R() * 0.9);
      }
    }

    // ---- hands: a landing knocks the floor behind the hand, and throws the near tesserae
    const downs = input.downs || [];
    for (const h of downs) {
      if (!h || !h.pos) continue;
      const wi = h.wall ?? 0, w = walls[wi], t = towers[wi];
      if (t && t.on) {
        _v.copy(w.centre).sub(room.eye); const dW = Math.max(0.5, -_v.dot(w.normal));
        _v.copy(h.pos).sub(room.eye).multiplyScalar((dW + (t.dist ?? TOWER_D)) / dW).add(room.eye); _v.y += rise;          // part frame
        hitU = h.u ?? 0.5; toTower(t, _v, _v2); knockTower(t, _v2, 1);
      }
      for (const pc of near) {
        if (pc.wall !== wi || pc.st !== 0) continue;
        const dx = pc.p.x - h.pos.x, dy = pc.p.y - rise - h.pos.y, dz = pc.p.z - h.pos.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.75 * 0.75) continue;
        const f = 1.4 * (1 - Math.sqrt(d2) / 0.75) + 0.4;
        pc.v.set(-w.normal.x * f * 1.3 + dx * 2.5, 1.0 + R() * 1.2 + dy * 1.5, -w.normal.z * f * 1.3 + dz * 2.5);
        pc.w.set((R() - 0.5) * 14, (R() - 0.5) * 14, (R() - 0.5) * 14); pc.st = 1; pc.t0 = time;
      }
      impact(wi, h.u ?? 0.5, 0.3);
    }
    // a held hand: the floor behind it glows a little
    for (const h of input.hands || []) {
      const wi = h.wall ?? 0, w = walls[wi], t = towers[wi]; if (!t || !t.on || !h.pos) continue;
      _v.copy(w.centre).sub(room.eye); const dW = Math.max(0.5, -_v.dot(w.normal));
      _v.copy(h.pos).sub(room.eye).multiplyScalar((dW + (t.dist ?? TOWER_D)) / dW).add(room.eye); _v.y += rise; toTower(t, _v, _v2);
      for (let lv = 0; lv <= t.formed; lv++) { const Ld = LEVELS[lv]; if (_v2.y >= Ld.base - 0.2 && _v2.y <= Ld.base + Ld.h + 0.2) t.levels[lv].glow = Math.max(t.levels[lv].glow, 0.6); }
    }

    // ---- write the instances
    const ar = smooth(0, 1, arrive), lvK = leave;
    for (const m of meshes) if (m) { /* nothing: written below */ }
    for (const pc of pieces) {
      const M = meshes[pc.g], i = pc.slot, A = M.A, P3 = A.iP.array, Q4 = A.iQ.array, S4 = A.iS.array, D4 = A.iD.array;
      let sc = 1, flash = 0, bright = 1, glow = 0;
      if (pc.layer === 'tower') {
        const t = towers[pc.tw];
        if (!t.on || pc.lv > Math.min(NL - 1, floors + (inTronc && !col.on ? 1 : 0)) || t.levels[pc.lv].taken) { S4[i * 4] = S4[i * 4 + 1] = S4[i * 4 + 2] = 0; P3[i * 3 + 1] = -999; continue; }
        // floors far below the frame are written one frame in four (they are out of sight until the reward draws the tower back)
        if (pc.st === 0 && pc.lv < floors - 4 && pull < 0.001 && ar >= 1 && lvK === 0 && !col.on && ((frame + i) & 3) && !reset) continue;
        const L = t.levels[pc.lv], Ld = LEVELS[pc.lv];
        const hk = Ld.base / TOWER_H;
        if (pc.st === 0) {
          // home: in its level, unless the level is still forming or locking in
          let sK = 0;
          const forming = pc.lv === floors + 1;
          const age = time - L.lockT;
          if (forming) sK = (Math.pow(1 - prog, 1.5) * 1.0 + 0.16) * breath;
          else if (age >= 0 && age < 0.75) { const e = age / 0.75; sK = L.fromK * (1 - e * e) + 0.12 * (1 - e); }
          _v.set(pc.home[0], pc.home[1], pc.home[2]);
          if (forming && liftOn) { sK *= 0.35; _v.y -= (1 - liftP) * 1.1; }   // T-041: the floor comes up on the hands
          if (sK > 0) {
            const sw = sK * 2.2 * (pc.seed - 0.5) + time * 0.25 * sK;               // a slow swirl around the slot
            const cs = Math.cos(sw), sn = Math.sin(sw), x = _v.x * cs - _v.z * sn, z = _v.x * sn + _v.z * cs;
            _v.set(x + pc.scat[0] * sK * 1.4, _v.y + pc.scat[1] * sK * 0.8 + Math.sin(time * 1.3 + pc.seed * 9) * 0.05 * sK, z + pc.scat[2] * sK * 1.4);
            _q2.setFromAxisAngle(_ax.set(pc.scat[2], pc.scat[0], pc.scat[1]).normalize(), sK * (3 + pc.seed * 4) + time * sK * 0.6);
          } else _q2.identity();
          if (forming) { bright = 0.55 + 0.45 * prog; sc = 0.35 + 0.65 * smooth(0, 0.4, prog + 0.1); }
          if (pc.fibre) { sc = forming ? 0 : smooth(0.6, 2.2, age); _q2.identity(); }   // the fibres grow once the floor is in place
          if (pc.smoke) _v.y += Math.sin(time * 0.15 + pc.seed * 20) * 0.3;
          _v.applyQuaternion(L.Q).add(L.O);
          _q.copy(L.Q).multiply(pc.hq).multiply(_q2);
          if (pc.smoke) { _eye.copy(room.eye); _eye.y += rise; _m4.lookAt(_eye, _v, YAXIS); _q.setFromRotationMatrix(_m4); _q2.setFromAxisAngle(ZAXIS, time * 0.03 * (pc.seed - 0.5) + pc.seed * 6); _q.multiply(_q2); }
        } else if (pc.st === 1 || pc.st === 3) {
          if (pc.st === 1) {
            // free: rigid body in the tower frame, gravity tilted with the tower
            const gx = -G * Math.sin(t.theta), gy = -G * Math.cos(t.theta);
            pc.v.x += gx * dt; pc.v.y += gy * dt;
            const py = pc.p.y;
            pc.p.addScaledVector(pc.v, dt);
            const rr = Math.max(pc.s[0], pc.s[1], pc.s[2]) * 0.3;
            for (let lv = Math.min(t.formed, NL - 1); lv >= 0; lv--) {
              if (t.levels[lv].gone || t.levels[lv].taken) continue;
              const Dk = LEVELS[lv], top = t.levels[lv].Ot.y + Dk.deck;
              if (py - rr >= top - 0.02 && pc.p.y - rr < top && pc.p.x * pc.p.x + pc.p.z * pc.p.z < Dk.r * Dk.r) {
                pc.p.y = top + rr;
                if (pc.v.y < -0.9) { impact(t.tw, 0.5 + pc.p.x / t.w.width, Math.min(1, -pc.v.y / 5), 'stone', 'floor'); pc.v.y = -pc.v.y * 0.38; pc.rest = 0; pc.w.multiplyScalar(0.6).add(_ax.set((R() - 0.5) * 6, (R() - 0.5) * 6, (R() - 0.5) * 6)); }
                else { pc.v.y = 0; pc.rest += dt; { const sp = Math.hypot(pc.v.x, pc.v.z); if (sp > 0.25 && slideT <= 0) { slideT = 0.34; fxImpact(t.tw, 0.5 + pc.p.x / t.w.width, Math.min(1, sp / 2), 'stone', 'slide'); } } const fr = Math.exp(-dt * (tilt(t) > 0.03 ? 0.6 : 4)); pc.v.x *= fr; pc.v.z *= fr; pc.w.multiplyScalar(Math.exp(-dt * 3)); }
                // the deck turns: it carries what rests on it
                const s = Dk.spin; pc.p.x += -pc.p.z * s * dt; pc.p.z += pc.p.x * s * dt;
                break;
              }
            }
            const wl = pc.w.length(); if (wl > 1e-4) { _q2.setFromAxisAngle(_ax.copy(pc.w).multiplyScalar(1 / wl), wl * dt); pc.q.premultiply(_q2); }
            if (pc.p.y < -7) { pc.st = 2; }
          } else {
            // returning home: an arc from where it was
            const e = clamp01((time - pc.t0) / 1.3), ee = e * e * (3 - 2 * e);
            homeInTower(t, pc, _v2);
            pc.p.copy(pc.from).lerp(_v2, ee); pc.p.y += Math.sin(e * Math.PI) * 0.8;
            _q.copy(L.Qt).multiply(pc.hq); pc.q.copy(pc.fromQ).slerp(_q, ee);
            if (e >= 1) { pc.st = 0; L.flash = Math.max(L.flash, 0.35); if (R() < 0.15) fxImpact(t.tw, 0.5 + pc.p.x / t.w.width, 0.5, 'ceramic', 'lock'); }
          }
          toPart(t, pc.p, _v); _q.copy(t.q).multiply(pc.q);
          if (pc.p.y < -4) sc = smooth(-7, -4, pc.p.y);
        } else {
          // lost in the void: comes back when the tower has stood straight a while (QA T-032: decided HERE, before the continue)
          if (t.straightT > 2 && reward < 0.5 && !col.on) { homeInTower(t, pc, pc.from); pc.from.y = -6; pc.q.copy(t.levels[pc.lv].Qt).multiply(pc.hq); pc.fromQ.copy(pc.q); pc.t0 = time + pc.seed * 0.6; pc.st = 3; }
          S4[i * 4] = S4[i * 4 + 1] = S4[i * 4 + 2] = 0; P3[i * 3 + 1] = -999;
          continue;
        }
        if (pc.st === 1 && pc.rest > 3.5 && t.straightT > 2 && reward < 0.5 && !col.on) { // what rests on a deck goes home too
          { pc.from.copy(pc.p); pc.fromQ.copy(pc.q); pc.t0 = time + pc.seed * 0.6; pc.st = 3; }
        }
        flash = L.flash * (0.7 + 0.3 * pc.seed); glow = L.glow; bright *= 0.9 + 0.025 * pc.lv;   // a little more light with every floor
        // reward: the light goes out from the top down
        bright *= 1 - 0.75 * smooth(1 - hk - 0.15, 1 - hk + 0.05, smooth(4.5, 10, rewardT) * 1.15) * (1 + 0.3 * pull);
        // arrive / leave: fragmentation, the bottom first in, the top first out
        const aK = 1 - smooth(0, 1, (ar * 1.6 - hk * 0.6 - pc.seed * 0.15) * 1.2 + 0.0);
        const lK = smooth(0, 1, (lvK * 1.7 - (1 - hk) * 0.4 - pc.seed * 0.3) * 1.3);
        if (aK > 0 || lK > 0) {
          const off = aK * 7 + lK * 6;
          _v.x += pc.scat[0] * off; _v.y += pc.scat[1] * off * 0.6 + lK * lK * 4; _v.z += pc.scat[2] * off;
          _q2.setFromAxisAngle(_ax.set(pc.scat[1], pc.scat[2], pc.scat[0]).normalize(), (aK + lK) * 6); _q.multiply(_q2);
          sc *= (1 - aK * 0.6) * (1 - smooth(0.6, 1, lK)); bright *= 1 + lK * 0.4;
        }
      } else if (pc.layer === 'fx') {
        const t = towers[pc.tw], a = t.ringT / 1.1;
        if (!t.on || a >= 1 || t.ringLv < 0) { S4[i * 4] = S4[i * 4 + 1] = S4[i * 4 + 2] = 0; P3[i * 3 + 1] = -999; continue; }
        const L = t.levels[t.ringLv], r = (0.8 + (1 - (1 - a) * (1 - a)) * 4.2) * TS;
        _v.copy(L.O); _q.copy(L.Q).multiply(pc.hq); pc.s[0] = pc.s[1] = r; pc.s[2] = TS * 2.2 * (1 - a); bright = (1 - a) * (1 - a);
      } else if (pc.layer === 'near') {
        const w = walls[pc.wall];
        if (pc.st === 1) {
          pc.v.y -= G * 0.8 * dt; pc.p.addScaledVector(pc.v, dt);
          const wl = pc.w.length(); if (wl > 1e-4) { _q2.setFromAxisAngle(_ax.copy(pc.w).multiplyScalar(1 / wl), wl * dt); pc.q.premultiply(_q2); }
          if (pc.p.y - rise < -1.5 || time - pc.t0 > 6) { pc.st = 3; pc.t0 = time; pc.p.set(pc.home[0], pc.home[1], pc.home[2]); }
          _v.copy(pc.p); _q.copy(pc.q);
        } else {
          if (pc.st === 3) { sc = smooth(0, 2.0, time - pc.t0); if (sc >= 1) pc.st = 0; }
          const b = time * (0.15 + pc.seed * 0.2) + pc.seed * 20;
          _v.set(pc.home[0], pc.home[1] + Math.sin(b) * 0.06, pc.home[2]);
          pc.p.copy(_v);
          _q2.setFromAxisAngle(_ax.set(pc.scat[0], pc.scat[1], pc.scat[2]).normalize(), b * 0.8); _q.copy(pc.hq).multiply(_q2); pc.q.copy(_q);
          // out of the guide's band (wall centre, 0.6–2.5 m)
          const yr = pc.p.y - rise, u = pc.u;
          const band = smooth(0.85, 1.25, Math.abs(u)) + (1 - smooth(0.3, 0.6, yr)) + smooth(2.5, 2.8, yr);
          sc *= Math.min(1, band);
        }
        const aK = 1 - smooth(0, 1, ar * 1.5 - pc.seed * 0.5), lK = smooth(0, 1, lvK * 1.5 - pc.seed * 0.5);
        if (aK > 0 || lK > 0) { const off = (aK + lK) * 1.5; _v.x -= w.normal.x * off; _v.z -= w.normal.z * off; _v.y += lK * 2; sc *= 1 - Math.max(aK, lK); }
        bright = 0.75;
        void w;
      } else {
        // far: slow turning in the void, hazed by distance
        const b = time * (0.03 + pc.seed * 0.05) + pc.seed * 30;
        _v.set(pc.home[0], pc.home[1] + Math.sin(b) * 0.4, pc.home[2]);
        if (pc.still) { _v.y = pc.home[1]; _q2.identity(); } else _q2.setFromAxisAngle(_ax.set(pc.scat[0], pc.scat[1], pc.scat[2]).normalize(), b);
        _q.copy(pc.hq).multiply(_q2);
        bright = (pc.dust ? 0.5 : pc.silhouette ? 0.4 : 0.85) * Math.exp(-(pc.far - 20) / 55) * (0.25 + 0.75 * ar) * (1 - lvK * 0.7);
        if (pc.dust) sc = 0.6 + 0.4 * Math.sin(time * 0.8 + pc.seed * 40);
      }
      if (pc.layer !== 'tower' || pc.smoke) { bright *= decor; if (decor < 0.01) sc = 0; }
      P3[i * 3] = _v.x; P3[i * 3 + 1] = _v.y; P3[i * 3 + 2] = _v.z;
      Q4[i * 4] = _q.x; Q4[i * 4 + 1] = _q.y; Q4[i * 4 + 2] = _q.z; Q4[i * 4 + 3] = _q.w;
      S4[i * 4] = pc.s[0] * sc; S4[i * 4 + 1] = pc.s[1] * sc; S4[i * 4 + 2] = pc.s[2] * sc;
      D4[i * 4] = flash; D4[i * 4 + 1] = bright; D4[i * 4 + 2] = glow; D4[i * 4 + 3] = pc.st === 1 && pc.layer === 'tower' && !col.on ? 2.2 : pc.ao;
    }
    for (const m of meshes) if (m) { m.A.iP.needsUpdate = true; m.A.iQ.needsUpdate = true; m.A.iS.needsUpdate = true; m.A.iD.needsUpdate = true; }
    floorsPrev = floors;
  }
  const tilt = (t) => Math.abs(t.theta);

  // -------------------------------------------------------------------------------------------- the collapse (fall3d / baixada call it)
  // collapse({ mode: 'intent' | 'carregat', duration = 15 }): the script of fall3d (GUION › Pom «si falla», La bajada «si todos
  // sueltan»), on this tower, rescaled to `duration` (s):
  //   0–1.6   a tremor grows · 1.6–2.4 the crack: a flash at the floor that gives (intent: ~2/3 up; carregat: the first floor)
  //   intent  2.4–4 the upper part leans to one side, then from 3 s the floors from the top down to the crack let go (every piece, thrown
  //           out in an arc to that side), the rest stands; carregat: from 3 s the floors let go from the bottom up, the tower sinks into
  //           itself. Every piece falls with gravity, bounces on what is still standing, spins, is lost in the void.
  //   ~duration-2.5 → duration: everything fades to black (ready for the acta).
  // While it runs the score no longer moves the tower (no rise, no lean, nothing goes home). restore() undoes it (rehearsal jumps).
  const col = { on: false, t: 0, mode: 'intent', dur: 15, floors: 0, side: 1 };
  let keepFloors = 0;
  function collapse(opt = {}) {
    col.on = true; col.t = 0; col.mode = opt.mode === 'carregat' ? 'carregat' : 'intent'; col.dur = Math.max(4, opt.duration ?? 15);
    col.floors = keepFloors; col.side = R() < 0.5 ? -1 : 1;
    for (const t of towers) { t.colTilt = 0; t.brk = col.mode === 'intent' ? Math.max(1, Math.round(t.formed * 0.62)) : 1; t.cracked = false; for (const L of t.levels) L.gone = false; }
  }
  function restore() { col.on = false; for (const t of towers) { t.colTilt = 0; for (const L of t.levels) { L.gone = false; L.taken = false; } } for (const pc of pieces) if (pc.layer === 'tower') pc.st = 0; }
  function collapseStep(t, dt) {
    const k = col.dur / 15, ct = col.t / k, intent = col.mode === 'intent';      // ct: the script's own clock (s of the 15 s script)
    const amp = smooth(0, 1.6, ct) * (ct < 9 ? 1 : 0);
    t.omega += (Math.sin(time * 31 + t.tw) + Math.sin(time * 17.7)) * amp * 0.012 * dt * 60;
    for (const L of t.levels) { L.vax += (R() - 0.5) * amp * 0.5 * dt * 60 * 0.02; L.vaz += (R() - 0.5) * amp * 0.5 * dt * 60 * 0.02; }
    if (!t.cracked && ct >= 1.6) { t.cracked = true; t.levels[t.brk].flash = 1; if (t.brk > 0) t.levels[t.brk - 1].flash = 0.6; impact(t.tw, 0.5, 1, 'stone', 'hit'); }
    t.colTilt = intent ? col.side * 0.11 * smooth(2.4, 4.0, ct) : 0;
    for (let lv = 0; lv <= t.formed; lv++) {
      const L = t.levels[lv]; if (L.gone || L.taken) continue;
      const at = intent ? (lv >= t.brk ? 3 + (t.formed - lv) * 0.45 : 99) : 3 + lv * 0.3;
      if (ct < at) continue;
      L.gone = true; L.flash = Math.max(L.flash, 0.5);
      const hk = lv / (NL - 1);
      for (const pc of pieces) {
        if (pc.tw !== t.tw || pc.lv !== lv || pc.st !== 0 || pc.smoke) continue;
        homeInTower(t, pc, pc.p); pc.q.copy(L.Qt).multiply(pc.hq);
        if (intent) pc.v.set(col.side * (1.2 + R() * 2.2) * (0.5 + hk), 0.8 + R() * 2.2, (R() - 0.5) * 1.6);
        else pc.v.set((R() - 0.5) * 0.6, -0.4 - R() * 0.8, (R() - 0.5) * 0.6);
        pc.w.set((R() - 0.5) * 4, (R() - 0.5) * 4, (R() - 0.5) * 4); pc.st = 1; pc.rest = 0;
      }
    }
  }
  // takeFloor(i, { tower = -1 (all), hide = true }) → the pieces of floor i (0 = the plinth, 1..9 the score's floors) as they are now, in
  // WORLD coordinates: [{ tower, x, y, z, q: [x,y,z,w], sx, sy, sz (m), r, g, b (linear), kind, geo }]; with hide the floor is no longer
  // drawn here (the caller draws it from then on, e.g. the baixada bringing the tower down floor by floor). giveFloor(i, tower) shows it again.
  const KIND = ['stone', 'terracotta', 'glaze', 'chrome', 'iron', 'gold', 'light', 'petal', 'glass', 'body', 'glaze', 'stone', 'stone', 'glaze', 'chrome'], GEO = ['box', 'sphere', 'pot', 'tile', 'cone', 'torus', 'glass', 'smoke', 'panel', 'tile', 'fibre'];
  function takeFloor(i, opt = {}) {
    const tower = opt.tower ?? -1, hide = opt.hide !== false, out = [];
    world.updateMatrixWorld(true);
    const m = world.matrixWorld, v = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const pc of pieces) {
      if (pc.layer !== 'tower' || pc.lv !== i || pc.smoke || (tower >= 0 && pc.tw !== tower) || !towers[pc.tw].on) continue;
      const A = meshes[pc.g].A, k = pc.slot;
      if (A.iP.array[k * 3 + 1] < -900 || A.iS.array[k * 4] === 0) continue;
      v.fromArray(A.iP.array, k * 3).applyMatrix4(m); q.fromArray(A.iQ.array, k * 4);
      out.push({ tower: pc.tw, x: v.x, y: v.y, z: v.z, q: [q.x, q.y, q.z, q.w], sx: A.iS.array[k * 4], sy: A.iS.array[k * 4 + 1], sz: A.iS.array[k * 4 + 2], r: pc.col[0], g: pc.col[1], b: pc.col[2], kind: KIND[pc.k] ?? 'other', geo: GEO[pc.g] });
    }
    if (hide) for (const t of towers) if (tower < 0 || t.tw === tower) t.levels[i].taken = true;
    return out;
  }
  function giveFloor(i, tower = -1) { for (const t of towers) if (tower < 0 || t.tw === tower) t.levels[i].taken = false; }
  // levels(): per shown tower, its floors as they stand: [{ tower, built (0..9), floors: [{ i, name, y (world, centre), h, taken, gone }] }]
  function levels() {
    world.updateMatrixWorld(true);
    return towers.filter((t) => t.on).map((t) => ({ tower: t.tw, built: t.formed, floors: t.levels.map((L, i) => ({ i, name: LEVELS[i].name, y: L.O.y + world.matrixWorld.elements[13] + LEVELS[i].h / 2, h: LEVELS[i].h, taken: !!L.taken, gone: !!L.gone })) }));
  }

  function setParams() { /* read live */ }
  function dispose() { try { fxBc?.close(); } catch { /* closed */ } for (const m of meshes) if (m) { m.mesh.geometry.dispose(); m.mesh.material.dispose(); } for (const b of bases) b.dispose(); }
  const api = {
    object, update, setParams, dispose, impacts,
    get rise() { return rise; },
    get lift() { return { on: liftOn, p: liftP, currents: streaks.filter((x) => x.on).length, wobble: wob.on, wobbleT: wob.t, slip: slip.lv, bands: bands.map((b) => ({ y: +b.y.toFixed(3), tilt: +b.tilt.toFixed(3), k: +b.U.k.value.toFixed(2) })) }; },
    collapse, restore, takeFloor, giveFloor, levels,
    get collapsing() { return { on: col.on, t: col.t, mode: col.mode, duration: col.dur }; },
  };
  if (typeof window !== 'undefined') window.__tronc3d = {
    get pieces() { return pieces.length; }, get counts() { return counts.slice(); }, get rise() { return rise; }, impacts, get lastKnock() { return lastKnock; },
    get pulse() { return { beat, pulseT }; },
    get towers() { return towers.map((t) => ({ dip: +t.dip.toFixed(4), ringT: +t.ringT.toFixed(2), wob: +(Math.max(...t.levels.map((L) => Math.hypot(L.ax, L.az))) * 57.3).toFixed(2), flash: +Math.max(...t.levels.map((L) => L.flash)).toFixed(2), on: t.on, theta: +t.theta.toFixed(4), free: pieces.filter((p) => p.tw === t.tw && p.st === 1).length, lost: pieces.filter((p) => p.tw === t.tw && p.st === 2).length })); },
    collapse, restore, takeFloor, giveFloor, levels, get collapsing() { return api.collapsing; },
    snap() { snapNext = true; },   // checks only: put the room at once where the rise is going
  };
  return api;
}
