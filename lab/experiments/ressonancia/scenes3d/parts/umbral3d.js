// Ressonància — «umbral», the threshold (block 'wait'): the first impression and the showcase of the room. See ../PARTS.md.
//
// T-058 (25-11, ENT) «ARENA Y VIDRIO»: from night to a soft sand noon (lab/estudio/ARTE-ENTRADA.md). A sanctuary of light ceramic.
// T-058c (Vicente, live): THE SHELL (the hero, was the serpentine): one continuous wall of FINE TRENCADÍS that follows the room 0.6 m
// behind every wall (a rounded rectangle; its foot meets the sand ~0.2 m above each wall's bottom edge), rises straight to 2.3 m and leans
// in as a vault, so the walls show mosaic from bottom to top and the sky only through the four PORTALS (frontal, from the floor: ARC's
// umbral3d/arches.js, mounted 0.12–0.52 m behind each wall; DOOR_A 0.8 / H 1.95 / P 2.2). It no longer turns. ~11,300 broken pieces, no two
// alike (a Voronoi mosaic on the surface, sized by height: ~6 cm on the wall in the band the hands reach, ~10 cm above 2.2 m, ~15 cm in the vault, 96 rosette
// "mothers" of 12–18 cm, 40 % of them round medallions with the fine pieces fitted round them, ref 02), each a thin bevelled shard on
// a continuous bone-white grout. Every piece has two faces: at rest LIGHT CERAMIC in patches of 0.4–1.2 m (bone, cream, sand 70 %;
// pale aqua, mist blue, sage, clay 30 %); behind, the saturated GLAZE (cobalt, turquoise, sea green,
// amber, orange, coral — ref 01, in rings round each rosette's heart). COLOUR ONLY APPEARS WHERE THE PUBLIC PLAYS, and stays a while.
//   a hand lands     its pieces flip at once (< 1 frame), a WAVE runs out from it over the mosaic (each piece lifts 3–6 cm, turns
//                    showing its glaze and seats again), and the nearest pieces are KNOCKED OUT in a spiral: they fall, bounce, break,
//                    skate on the sand, and later fly back to their place (what breaks is put back together);
//   a hand moves     it paints: the pieces under it turn to colour;
//   a hand stays     (0.6 s) the CASCADE: the column above it lets go in a chain, from the hand up towards the crest;
//   several hands    their waves cross: where two fronts meet the pieces spin and their bevels catch a warm light (interference);
//   reveal = 1       RESONANCE: the whole room settles into a Chladni figure — rings of light pieces on a field of colour.
// The room moves: the serpentine turns round the public (1°/s), the far world (sand sky, dunes and terraces, a few far vaults in the
// haze — no stars, no embers) turns the other way and breathes. The floor is sand with terraces and a contact shadow under the wave.
// The mobiles on threads and the far arcs of shards are OFF (ART: nothing floats, no vertical lines; MOBILES = true brings them back).
// THE REVEAL (score.js, block 'wait': state.reveal 0..1, state.start 0..1): a MEDALLION FRAME of two rows of contiguous ~3 cm tiles
// (r 0.31–0.39 m, flush, bone / cream / old gold on a grout bed) flies in round the centre of every wall at 1.25 m, round GUI's glass
// button (r ≤ 0.28), inside the door; start turns its rows against each other and lights it a little; 'start' blows it apart.
// T-058b (ART «CASI»): the key light is an overhead spot (14 m above the centre: ~33° grazing on every wall), the grout sits just under
// the faces, ±8 % value per piece; restraint — a touch colours ~1.1–1.4 m round the hand inside its rosette, 30 % of the pieces stay
// pastel, colour lasts 6–8 s; the resonance colours a third of its rings (≈ 23 % of the wall); idle play is a soft wave only (no colour,
// no fall, nothing off the wall before anyone touches); the door is a near-parabola (base 1.45 m, height 1.95 m).
// Alone (res-3d-study) the part runs its own copy of the score from the hands (params reveal/start = -1).
// Sound: physical impacts go to the sound piece on BroadcastChannel('ressonancia') as
//   { type: 'fx', fx: 'impact', wall, u (0..1 along the wall), strength (0..1), mat ('ceramic'|'chrome'|'glass'), kind ('hit'|'floor'|'break'|'hook') }
// (≤ 16 a second). How it is drawn: the mosaic is ONE mesh (position, normal, id/face per vertex; ~0.85 M vertices); a static float
// texture carries each piece's centre, axis, normal, glaze and rest colour, a live float texture its turn, lift, light and scale
// (springs and waves on the CPU, the pose in the vertex stage). No floor reflection (was a second copy of the mosaic), no shadows.
import { createScore } from '../../score.js';
import { createStory } from './umbral3d/story.js';   // studio 25-11: the continuous story the tiles carry
// studio 25-11 (Beltrán): THE MOSAIC IS HIS PICTURE — «Prueba On / OFF» (7196 × 912, the room strip) measured shard by shard
// (lab: watershed on the drawn grout lines, ~7300 shards, ~11 cm): each becomes one tile, at its place, resting in its OFF colour
// (desaturated sand) and turning to its On colour where a hand plays. SHARDS = null (no file) → the procedural mosaic, as before.
// studio 25-11 (Beltrán: «que las piedras acompañen y creen la imagen, como un dibujo hecho con piedras»): STONES = the stones AS DRAWN
// in the picture, one polygon each (umbral3d/story-stones.json, see its note) — preferred; story-shards.json (k-means sites) is the fallback
const getJSON = (f) => fetch(new URL(f, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const STONES = await getJSON('./umbral3d/story-stones.json');
const SHARDS = STONES || await getJSON('./umbral3d/story-shards.json');

const NOBACK = (() => { try { return new URLSearchParams(location.search).has('pnoback'); } catch { return false; } })();   // ?pnoback (lab, measuring only)
const GROUT_H = 0.008, ORGANIC = true, STONE_SCALE = 5.5, ARCH_FRAME = false, WK_DOOR = true, STORY = false, STORY_REST = 0.82, MEDALLIONS = false, HR = 0.78 * 1.3, HR2 = HR * HR;   /* studio 26-11 (Beltrán: «el rango de la mano un 30 % más»): ×1.3 */   // HR: studio 25-11 (Beltrán: «el radio de interacción de la mano, bájalo un poco»): every hand reach × 0.78   // studio 25-11: MEDALLIONS = true brings back the round medallions and the missing pieces   // T-066: the grout bed's height over the pieces' foot (m); the pieces' joints are cut to it

export function create(ctx) {
  const { THREE, TSL, room, params } = ctx;
  const walls = room.walls, NW = walls.length, eye = room.eye;
  const object = new THREE.Group();          // the fixed world: the mobiles, the floor, the ring, the falling pieces
  const hero = new THREE.Group();            // the serpentine (turns round the public)
  const world = new THREE.Group();           // the far world (turns the other way, breathes)
  object.add(hero, world);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 20261124;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rr = (a, b) => a + rnd() * (b - a);
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
  const UP = new THREE.Vector3(0, 1, 0);
  const G = 5.4;                             // gravity, slow (0.65 g): falls read at room scale and feel dreamt

  // the palette (linear). T-058 «arena y vidrio»: at rest LIGHT CERAMIC — bone, cream, sand, pale aqua, mist blue, sage, clay (refs 07–10), a
  // glossy glaze; behind every piece the SATURATED glaze (ref 01: cobalt, turquoise, ochre, orange, coral), shown only where the public plays
  const BONE = [0.905, 0.847, 0.753], GRAPHITE = [0.716, 0.546, 0.352], GOLD = [0.584, 0.371, 0.107];   // bone #F4EDE1, (the darkest rest tone, now) sand #DCC3A0, old gold #C9A45C
  const PASTEL = [   // ART (ARTE-ENTRADA.md a): bone 30 % · cream 22 · sand 18 · pale aqua 12 · mist blue 10 · sage 5 · clay rose 3
    [0.905, 0.847, 0.753], [0.831, 0.716, 0.539], [0.716, 0.546, 0.352], [0.624, 0.768, 0.687], [0.584, 0.687, 0.776], [0.558, 0.624, 0.423], [0.791, 0.584, 0.503],
  ];
  // the glaze behind the pieces (ref 01; ART: cobalt #1F3FA8, turquoise #1FA39A, sea green #35B88A, amber #E0A22B, orange #E8662A, coral #E5574B;
  // cold 60 %), by FAMILIES — one per rosette: [heart, first ring, outer ring, accent]
  const C_COB = [0.02, 0.065, 0.479], C_TUR = [0.014, 0.366, 0.323], C_GRN = [0.036, 0.479, 0.254], C_AMB = [0.745, 0.361, 0.024], C_ORA = [0.807, 0.133, 0.023], C_COR = [0.784, 0.095, 0.07];
  const FAMILY = [   // T-058b (ART): cobalt #2748B8; over the five families ~67 % cool, ~13 % amber, ~20 % orange + coral
    [C_COR, C_TUR, C_AMB, C_COB],
    [C_TUR, C_COB, C_GRN, C_AMB],
    [C_AMB, C_COB, C_TUR, C_COR],
    [C_ORA, C_GRN, C_COB, C_AMB],
    [C_GRN, C_TUR, C_COR, C_COB],
  ];
  const GLAZE = FAMILY.map((f) => f[1]);

  // ------------------------------------------------------------------------------------------- environment (to reflect)
  // The threshold's OWN environment, pre-filtered by the room (room.captureEnvironment): silver-grey and clear above, dark below, a thin
  // warm horizon, a few soft panels of light (art bible §2, «Espera»: gris plata) — neutral, so bone reads as bone and the mirrors as
  // metal whatever the shared sky of the work is doing. Falls back to room.envMap.
  let envRT = null;
  try {
    const { Fn: F_, normalize: nz, positionLocal: pl, vec3: v3, mix: mx, smoothstep: ss, exp: ex } = TSL;
    const es = new THREE.Scene(), sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    sky.colorNode = F_(() => { const y = nz(pl).y; return mx(v3(0.55, 0.42, 0.28), v3(1.05, 0.95, 0.82), ss(-0.15, 0.7, y)).add(v3(0.9, 0.72, 0.5).mul(ex(y.div(0.12).pow(2).negate())).mul(0.25)); })();   // T-058: a sand noon (cream above, warm sand below)
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), sky));
    const pg = new THREE.PlaneGeometry(1, 1);
    for (const [col, a, y, w, h] of [[[4.0, 3.7, 3.2], 0.95, 26, 14, 10], [[1.6, 1.55, 1.45], 3.4, 16, 20, 6], [[1.3, 1.35, 1.45], 5.2, 12, 14, 6]]) {   // a soft sun, two pale panels of sky
      const m = new THREE.Mesh(pg, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide }));
      m.position.set(Math.cos(a) * 30, y, Math.sin(a) * 30); m.scale.set(w, h, 1); m.lookAt(0, y, 0); es.add(m);
    }
    envRT = room.captureEnvironment ? room.captureEnvironment(es, { sigma: 0.03, position: new THREE.Vector3(0, 0, 0) }) : null;
    es.traverse((o) => { if (o.isMesh) { o.material.dispose(); } }); pg.dispose();
  } catch (err) { envRT = null; console.info('umbral3d: own environment skipped (' + err.message + ')'); }
  const env = envRT?.texture || room.envMap || null;

  // the crackle of an old glaze: a tileable Voronoi of thin grooves, as a normal map (made once; for the big near pieces)
  const crackle = (() => {
    const N = 256, C = 9, pts = [];
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + rr(0.1, 0.9)) / C, (j + rr(0.1, 0.9)) / C]);
    const hgt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N, v = (y + 0.5) / N, ci = Math.floor(u * C), cj = Math.floor(v * C);
      let f1 = 9, f2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + C) % C, jj = (cj + dj + C) % C, p = pts[jj * C + ii];
        const px = p[0] + Math.floor((ci + di) / C), py = p[1] + Math.floor((cj + dj) / C);
        const dx = px - u, dy = py - v, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      hgt[y * N + x] = 1 - Math.exp(-(f2 - f1) * 55);
    }
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)], hy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
      let nx = -hx * 2.2, ny = -hy * 2.2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * N + x) * 4; data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 2] = (nz * 0.5 + 0.5) * 255; data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.6);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  })();

  // =========================================================================================== THE SHELL (T-058c; was the serpentine)
  // Vicente (25-11): the mosaic starts low, right behind each wall, and covers the walls upward completely, leaning in as a vault. The
  // surface follows the room: a rounded rectangle OFF m behind the walls (its foot meets the sand ~0.2 m above each wall's bottom edge),
  // straight up to YS, then curving in (a circle of radius RV) — the sky shows only through the four portals. Fixed to the room (no turn).
  // Its own parameters: cu = metres along (θ = cu / RM, closed: 0..LL), cy = v = metres along the profile from the foot (= height up to YS).
  const RM = 4.6, LL = Math.PI * 2 * RM, YTOP = 5.3, OFF = 0.6, YS = 1.95, RV = 2.2;   // YTOP 5.3 (was 4.4): the lower curl must still close over the walls' top   // studio 25-11 (Beltrán): the curl into the vault starts lower and rounder (was YS 2.3, RV 3.0)
  // studio 25-11 (Beltrán: «el manto de mosaicos debe llegar al piso… el piso no lo tomes como piso, que siga hacia abajo»): the shell no
  // longer stands on the sand — it goes straight on DOWN below the floor (to −SHIFT m; the eye sees it down to ~−0.3 m through each wall's
  // bottom edge), and the floor is cut where the shell is (see the floor). v (the profile's own length) starts SHIFT below the floor.
  const SHIFT = 0.6, VTOP = YTOP + SHIFT;
  const wrapU = (d) => d - Math.round(d / LL) * LL;
  const WK = walls.map((w) => ({ nx: w.normal.x, nz: w.normal.z, k: -((w.centre.x - eye.x) * w.normal.x + (w.centre.z - eye.z) * w.normal.z) }));
  const HMAX = Math.max(...walls.map((w) => w.height));
  function wallD(th) {                         // the distance from the eye to the walls along θ, corners rounded (a p-norm of the facing walls)
    const ux = Math.cos(th), uz = Math.sin(th); let a = 0;
    for (const q of WK) { const dn = -(ux * q.nx + uz * q.nz); if (dn > 0) a += (dn / q.k) ** 8; }
    return a > 0 ? a ** (-1 / 8) : 5;
  }
  const yUp = (u) => (u <= YS ? u : YS + RV * Math.sin(Math.min(1.5, (u - YS) / RV)));                 // the wall and the vault (u = v − SHIFT)
  const yOf = (v) => yUp(v - SHIFT);
  const vOf = (y) => (y <= YS ? y : YS + RV * Math.asin(Math.min(1, (y - YS) / RV))) + SHIFT;
  function surfR0(th, v) { const u = v - SHIFT; return wallD(th) + OFF - (u <= YS ? 0 : RV * (1 - Math.cos(Math.min(1.5, (u - YS) / RV)))); }
  // studio 25-11 (Beltrán: «orgánico, sin marco»): THE REVEAL — round each opening the mosaic itself curves back into the hole, like a
  // thick wall of trencadís: within REVEAL_W of the opening's edge (metres on the wall) the shell goes REVEAL_D deeper, steepest at the edge
  const REVEAL_D = 0.12, REVEAL_W = 0.42, REVEAL_GLOW = 0.5;
  function surfR(th, v) {
    const r0 = surfR0(th, v); if (!WK_DOOR) return r0;
    const px = r0 * Math.cos(th) - eye.x, py = yOf(v) - eye.y, pz = r0 * Math.sin(th) - eye.z;
    for (const w of walls) {
      const dn = px * w.normal.x + py * w.normal.y + pz * w.normal.z; if (dn > -1e-4) continue;
      const t = ((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z) / dn; if (t <= 0 || t > 1.0001) continue;
      const xs = (eye.x + px * t - w.centre.x) * w.right.x + (eye.z + pz * t - w.centre.z) * w.right.z, y = eye.y + py * t;
      if (Math.abs(xs) > w.width / 2 + 0.01) continue;
      const d = openD(w.index, xs, y);
      if (d >= REVEAL_W) return r0;
      const k = 1 - Math.max(0, d) / REVEAL_W; return r0 + REVEAL_D * k * k;
    }
    return r0;
  }
  const surfP = (cu, v, out) => { const th = cu / RM, r = surfR(th, v); return out.set(r * Math.cos(th), yOf(v), r * Math.sin(th)); };
  const ARCH = [];                          // (no openings baked in the mosaic: the thresholds are cut where the walls' centres look, see doorK)
  function archF() { return 9; }
  function crest() { return VTOP; }
  const DOOR_A = 0.85, DOOR_H = 2.5, DOOR_P = 1.45;   // studio 25-11 (Beltrán, ref «correfoc»): a taller, pointed opening cut in the mosaic (was 0.8 / 1.95 / 2.2 with a stucco frame)   // T-058c: half base span, height, shape — y = H·(1 − |x/A|^P), metres ON THE WALL: a near-parabola, base 1.6 m, apex the narrowest; the start ring (r 0.31–0.39 at 1.25 m) sits inside with ≥ 7 cm to the jambs; the guide's words go above
  // studio 25-11 (Beltrán): the openings are the picture's own transparent parts (STONES.openings: a round window at 1.26 m on P4, P2, P3,
  // a wide one for the title on P1) — rounded rectangles in metres on the wall; without them, the old pointed door at every wall's centre
  const OPEN = (STONES?.openings || []).map(([wi, cx, cy, hw, hh, rc]) => {             // (from his picture's walls to this room's: widths and height may differ)
    const kx = walls[wi].width / (STONES.walls?.[wi]?.[2] || walls[wi].width), ky = (walls[wi].height || 3.75) / 3.75;
    return { wi, cx: cx * kx, cy: cy * ky, hw: hw * kx, hh: hh * ky, rc: Math.min(rc * Math.min(kx, ky), hw * kx, hh * ky) };
  });
  function openD(wi, xs, y) {                 // signed distance (m) to the openings of wall wi (xs from the wall's centre, y from the floor): < 0 inside
    if (!OPEN.length) { const x = Math.abs(xs); return y < DOOR_H ? x - DOOR_A * Math.pow(Math.max(0, 1 - y / DOOR_H), 1 / DOOR_P) : Math.hypot(x, y - DOOR_H); }
    let d = 1e9;
    for (const o of OPEN) {
      if (o.wi !== wi) continue;
      const qx = Math.abs(xs - (o.cx - walls[wi].width / 2)) - (o.hw - o.rc), qy = Math.abs(y - o.cy) - (o.hh - o.rc);
      d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - o.rc);
    }
    return d;
  }
  function openHalfW(wi, xs, y) {             // the opening of wall wi nearest xs at height y: [its centre (from the wall's centre), its half width there]
    let best = null, bd = 1e9;
    for (const o of OPEN) { if (o.wi !== wi) continue; const c = o.cx - walls[wi].width / 2, dd = Math.abs(xs - c); if (dd < bd) { bd = dd; best = o; } }
    if (!best) return null;
    const c = best.cx - walls[wi].width / 2, e = Math.abs(y - best.cy) - (best.hh - best.rc);
    return [c, e <= 0 ? best.hw : best.hw - best.rc + Math.sqrt(Math.max(0, best.rc * best.rc - e * e))];
  }

  // ---- the mosaic (T-058): FINE trencadís. Poisson sites whose size follows the height (fine in the band the hands reach, larger above,
  // where nobody reaches) → Voronoi cells → thin bevelled shards. Measured on the wall (the serpentine is ~2.2× farther than the wall):
  // ~3–5 cm pieces in the hand band, 8–12 cm above, a few rosette "mothers" (some ROUND medallions, ref 02) of 12–18 cm.
  const cells = [];
  let heroGeo;
  const BS = 0.25, BW = Math.ceil(LL / BS), BH = Math.ceil(VTOP / BS) + 1, RIMAX = 0.3, PT = 5;
  {
    const bucket = Array.from({ length: BW * BH }, () => []);
    const bxOf = (cu) => ((Math.floor((cu / LL) * BW) % BW) + BW) % BW, byOf = (y) => Math.min(BH - 1, Math.max(0, Math.floor(y / BS)));
    const sites = [];
    const fits = (cu, y, ri) => {
      const bx = Math.floor((cu / LL) * BW), by = byOf(y), reach = Math.ceil((ri + RIMAX) / 2 / BS);
      for (let j = Math.max(0, by - reach); j <= Math.min(BH - 1, by + reach); j++) for (let i = bx - reach; i <= bx + reach; i++) {
        for (const k of bucket[j * BW + ((i % BW) + BW) % BW]) { const s = sites[k], du = wrapU(cu - s.cu), dy = y - s.y, m = (ri + s.ri) / 2; if (du * du + dy * dy < m * m) return false; }
      }
      return true;
    };
    const put = (cu, y, ri, mother) => { const s = { cu, y, ri, mother, round: false, Rm: 0 }; sites.push(s); bucket[byOf(y) * BW + bxOf(cu)].push(sites.length - 1); return s; };
    const seen = (cu, v) => { const th = cu / RM; return (yOf(v) - eye.y) / surfR(th, v) < (HMAX + 0.12 - eye.y) / wallD(th); };   // above what the walls show: no piece
    const inDoor = (cu, v) => {                                                        // deep inside a portal (the door only ever widens): no piece
      const th = cu / RM, r = surfR(th, v), px = r * Math.cos(th) - eye.x, py = yOf(v) - eye.y, pz = r * Math.sin(th) - eye.z;
      for (const w of walls) {
        const dn = px * w.normal.x + py * w.normal.y + pz * w.normal.z; if (dn > -1e-4) continue;
        const t = ((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z) / dn; if (t <= 0 || t > 1) continue;
        const xs = (eye.x + px * t - w.centre.x) * w.right.x + (eye.z + pz * t - w.centre.z) * w.right.z, y = eye.y + py * t;
        if (Math.abs(xs) < w.width / 2 && openD(w.index, xs, y) < -0.1) return true;
      }
      return false;
    };
    const IW = (w) => (STONES?.walls?.[w.index]?.[2] || w.width);                     // the wall's width in his picture (m)
    const toShell = (w, xm, ym, out) => {                                              // a point of the picture (m on wall w) → where the eye sees it on the shell
      for (let g = 0; g < 4 && xm > IW(w); g++) { xm -= IW(w); w = walls[(w.index + 1) % walls.length]; }   // a stone running on past the corner
      for (let g = 0; g < 4 && xm < 0; g++) { w = walls[(w.index + walls.length - 1) % walls.length]; xm += IW(w); }
      const xw = (xm / IW(w)) * w.width - w.width / 2, py = (ym / 3.75) * w.height;      // the picture's wall → this room's wall (widths may differ); 3.75 m high
      const px = w.centre.x + w.right.x * xw, pz = w.centre.z + w.right.z * xw;
      const dx = px - eye.x, dy = py - eye.y, dz = pz - eye.z, dh = Math.hypot(dx, dz) || 1e-3, th = Math.atan2(dz, dx);
      let t = 1, v = eye.y + SHIFT; for (let k = 0; k < 8; k++) { t = surfR(th, v) / dh; v = clamp(vOf(eye.y + t * dy), 0, VTOP + 0.6); }   // (past the crest: the top stones run on, as the shards' cells did)
      if (Math.abs(t * dh - surfR(th, v)) > 1e-3) {                                      // up in the vault the iteration does not settle (the shell turns faster than the ray): bisect
        let lo = 0.02, hi = 8;
        for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2, vm = clamp(vOf(eye.y + m * dy), 0, VTOP + 0.6); if (m * dh - surfR(th, vm) > 0) hi = m; else lo = m; }
        t = (lo + hi) / 2; v = clamp(vOf(eye.y + t * dy), 0, VTOP + 0.6);
      }
      out[0] = ((th * RM) % LL + LL) % LL; out[1] = v; out[2] = t; return out;
    };
    const tsP = [0, 0, 0];
    const IMG = STONES?.image || [7196, 1094, 91, 912], PERIM = walls.reduce((a, w) => a + w.width, 0), wallStart = walls.map((w, i) => walls.slice(0, i).reduce((a, q) => a + q.width, 0));
    if (SHARDS) for (const a of SHARDS.stones || SHARDS.shards) {                    // his stones (or shards), from the wall into the shell
      const w = walls[a[0]]; if (!w) continue;
      const [cu, v, t] = toShell(w, a[1], a[2], tsP);
      if (!STONES && inDoor(cu, v)) continue;                                          // (the stones are already cut by the portals)
      const st = put(cu, v, Math.max(0.025, a[3] * t), false); st.on = [a[4], a[5], a[6]]; st.off = [a[7], a[8], a[9]];
      if (STONES) { st.wl = w; st.wx = a[1]; st.wy = a[2]; st.wp = a[10]; }
    }
    if (SHARDS && !STONES && WK_DOOR) for (let wi = 0; wi < walls.length; wi++) {   // studio 25-11: the opening's lip — a row of small shards along its edge
      const w = walls[wi];
      for (let side = -1; side <= 1; side += 2) for (let y = 0.05; y < DOOR_H + 0.1; y += 0.075) {
        const xa = y < DOOR_H ? DOOR_A * Math.pow(Math.max(0, 1 - y / DOOR_H), 1 / DOOR_P) : 0, xw = side * (xa + 0.05);
        const px = w.centre.x + w.right.x * xw, pz = w.centre.z + w.right.z * xw, dx = px - eye.x, dy = y - eye.y, dz = pz - eye.z, dh = Math.hypot(dx, dz) || 1e-3, th = Math.atan2(dz, dx);
        let t = 1, v = eye.y + SHIFT; for (let k = 0; k < 8; k++) { t = surfR(th, v) / dh; v = clamp(vOf(eye.y + t * dy), 0, VTOP); }
        const cu = ((th * RM) % LL + LL) % LL; if (!fits(cu, v, 0.045)) continue;
        const st = put(cu, v, 0.04 * t, false); st.lip = true;
      }
    }
    for (let t = 0, n = 0; !SHARDS && t < 6000 && n < 96; t++) {     // the mothers first (rosette hearts), 40 % of them round medallions
      const cu = rr(0, LL), y = rr(0.35, 3.2) + SHIFT;
      if (!seen(cu, y) || inDoor(cu, y) || !fits(cu, y, 0.5)) continue;
      const s = put(cu, y, rr(0.2, 0.24), true); n++;
      if (rnd() < 0.4 && MEDALLIONS) { s.round = true; s.Rm = rr(0.05, 0.065); }   // studio 25-11 (Beltrán): no round medallions — all mosaic
    }
    // the size: ~0.08 m (physical) up to 2.9 m (on the wall: up to ~2.2 m), growing to ~0.2 m at the top; zones a little finer / coarser
    const fine = (cu, v) => { const y = yOf(v); return (0.06 + 0.05 * smooth(1.95, 2.6, y) + 0.06 * smooth(2.9, 3.9, v)) * (0.9 + 0.2 * (0.5 + 0.5 * Math.sin(cu * (4 / RM) + 1.3 * Math.sin(v * 0.7)))); };   // T-058c: ~6 cm on the wall in the hands' band, ~10 cm above 2.2 m, ~15 cm in the vault
    for (let t = 0; !SHARDS && t < 600000 && sites.length < 12600; t++) { const cu = rr(0, LL), y = rr(0.0, VTOP); if (!seen(cu, y) || inDoor(cu, y)) continue; const ri = fine(cu, y); if (fits(cu, y, ri)) put(cu, y, ri, false); }

    // Voronoi: clip an octagon round each site by the bisectors of its neighbours (periodic in cu); against a round medallion the
    // neighbour grows up to the medallion's rim (a tangent cut), so the fine pieces fit round it as in ref 02
    const pwOf = (q) => {                                                               // a site's weight (power diagram), fixed by where it is
      if (q.pw === undefined) { const h = Math.sin(q.cu * 127.1 + q.y * 311.7) * 43758.5453, u = h - Math.floor(h), r = q.ri || 0.04; q.pw = (u * 2 - 1) * 0.5 * 4 * r * r; }
      return q.pw;
    };
    const clip = (poly, mx, my, nx, ny) => {     // keep the side where (p − m)·n ≤ 0
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
      }
      return out;
    };
    const pos = [], nor = [], inf = [], piece = [], uvs = [];
    const P0 = new THREE.Vector3(), Pu = new THREE.Vector3(), Pv = new THREE.Vector3(), Nn = new THREE.Vector3(), Tu = new THREE.Vector3(), Tv = new THREE.Vector3();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), ax = new THREE.Vector3();
    let mothers = sites.filter((q) => q.mother); if (!mothers.length) mothers = sites.filter((q, i) => i % 80 === 0); /* studio 25-11: his shards have no mothers — every 80th is a rosette's heart for the colour waves (geometry unchanged) */ mothers.forEach((q, i) => { q.fam = i % 5; });
    // the rest colour by PATCHES of 0.4–1.2 m (ART: 70 % sand-bone, 30 % cool pastel / clay): two smooth fields, periodic round the room
    const fW = (cu, y) => Math.sin(cu * (17 / RM) + 1.3 * Math.sin(y * 1.9)) + 0.8 * Math.sin(y * 2.7 + cu * (7 / RM) + 2) + 0.5 * Math.sin(cu * (25 / RM) - y * 3.1);
    const fC = (cu, y) => Math.sin(cu * (13 / RM) + 2.1 + 1.1 * Math.sin(y * 1.3 + cu * (3 / RM))) + 0.7 * Math.sin(y * 2.1 - cu * (9 / RM) + 0.4);
    const fK = (cu, y) => Math.sin(cu * (5 / RM) + y * 0.9) + 0.6 * Math.sin(cu * (11 / RM) - y * 1.7 + 1);
    for (const s of sites) {
      const H = crest(s.cu), af = archF(s.cu, s.y);
      if (af < 0) continue;                                                             // an arch: open
      let loose = 0;
      if (s.y > H && !s.wp) { continue; }   // T-058b (ART): nothing off the wall at rest   // ART: (almost) nothing floats at rest
      else if (!s.mother && (rnd() < 0.002 && MEDALLIONS || (H - s.y < 0.12 && rnd() < 0))) continue;   // studio 25-11: no missing pieces either (rnd() still drawn: same layout)   // T-069 (ART): no ragged crest any more (its holes read as white gaps); rnd() still drawn: same layout   // a missing piece; a ragged crest
      const R0 = s.mother ? 0.34 : SHARDS ? s.ri * 1.9 + 0.06 : s.ri * 1.25 + 0.03;   // his shards: room to meet their neighbours (no gaps)
      let poly = []; const a0 = rr(0, 6.28);
      const imgPts = [];
      if (s.wp) for (let k = 0; k < s.wp.length; k += 2) {                              // a drawn stone: its own outline
        const xm = s.wx + s.wp[k] / 1000, ym = s.wy + s.wp[k + 1] / 1000; toShell(s.wl, xm, ym, tsP);
        poly.push([wrapU(tsP[0] - s.cu), tsP[1] - s.y]);
        const iw = STONES.walls?.[s.wl.index]; imgPts.push([iw ? (iw[0] + (xm / iw[2]) * iw[1]) / IMG[0] : (wallStart[s.wl.index] + xm) / PERIM, (IMG[2] + IMG[3] - ym * IMG[3] / 3.75) / IMG[1]]);   // where the vertex is in his picture
      }
      else for (let k = 0; k < 8; k++) poly.push([Math.cos(a0 + k * 0.7854) * R0, Math.sin(a0 + k * 0.7854) * R0]);
      const rawPoly = poly.map((p) => p.slice());                                        // (before any clip: the picture fit needs every vertex)
      const bx = Math.floor((s.cu / LL) * BW), by = byOf(s.y), reach = Math.ceil((2 * R0) / BS), RR = 4 * R0 * R0;
      for (let j = Math.max(0, by - reach); !s.wp && j <= Math.min(BH - 1, by + reach) && poly.length > 2; j++) for (let i = bx - reach; i <= bx + reach; i++) {
        for (const k of bucket[j * BW + ((i % BW) + BW) % BW]) {
          const o = sites[k]; if (o === s) continue;
          const dx = wrapU(o.cu - s.cu), dy = o.y - s.y, dd = dx * dx + dy * dy; if (dd > RR) continue;
          let kk = 0.5; if (o.round) { const d = Math.sqrt(dd); kk = Math.max(0.5, (d - o.Rm - 0.005) / d); }
          else if (ORGANIC && SHARDS) kk = clamp(0.5 + (pwOf(s) - pwOf(o)) / (2 * dd), 0.2, 0.8);   // studio 25-11 (ref. stone mosaic): a power diagram — stones of uneven size
          poly = clip(poly, dx * kk, dy * kk, dx, dy); if (poly.length < 3) break;
        }
      }
      if (s.round) for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; poly = poly.length > 2 ? clip(poly, Math.cos(a) * s.Rm, Math.sin(a) * s.Rm, Math.cos(a), Math.sin(a)) : poly; }
      poly = clip(poly, 0, 0.006 - s.y, 0, -1);                                          // the floor
      if (poly.length < 3) continue;
      let area = 0, gx = 0, gy = 0;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1]; area += c; gx += (a[0] + b[0]) * c; gy += (a[1] + b[1]) * c; }
      area /= 2; if (Math.abs(area) < 0.0005) continue;
      gx /= 6 * area; gy /= 6 * area; if (area < 0) poly.reverse();
      const cu = s.cu + gx, cy = s.y + gy;
      let rad = 0; for (const p of poly) { p[0] -= gx; p[1] -= gy; rad = Math.max(rad, Math.hypot(p[0], p[1])); }
      let uvA = null;                                                                    // the piece's local plane → his picture (least squares, affine)
      if (imgPts.length >= 3) {
        const M = [0, 0, 0, 0, 0, 0, 0, 0, 0], Ru = [0, 0, 0], Rv = [0, 0, 0];
        imgPts.forEach((q, k) => { const a = [rawPoly[k][0] - gx, rawPoly[k][1] - gy, 1]; for (let r = 0; r < 3; r++) { for (let c2 = 0; c2 < 3; c2++) M[r * 3 + c2] += a[r] * a[c2]; Ru[r] += a[r] * q[0]; Rv[r] += a[r] * q[1]; } });
        const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
        if (Math.abs(det) > 1e-18) {
          const inv = [M[4] * M[8] - M[5] * M[7], M[2] * M[7] - M[1] * M[8], M[1] * M[5] - M[2] * M[4], M[5] * M[6] - M[3] * M[8], M[0] * M[8] - M[2] * M[6], M[2] * M[3] - M[0] * M[5], M[3] * M[7] - M[4] * M[6], M[1] * M[6] - M[0] * M[7], M[0] * M[4] - M[1] * M[3]].map((x) => x / det);
          const sol = (R) => [0, 1, 2].map((r) => inv[r * 3] * R[0] + inv[r * 3 + 1] * R[1] + inv[r * 3 + 2] * R[2]);
          uvA = [sol(Ru), sol(Rv)];
        }
      }
      const uvOf = (p) => (uvA ? [uvA[0][0] * p[0] + uvA[0][1] * p[1] + uvA[0][2], uvA[1][0] * p[0] + uvA[1][1] * p[1] + uvA[1][2]] : [0, 0]);
      if (ORGANIC && poly.length >= 3 && !s.wp) {                                       // studio 25-11 (Beltrán: «debe ser más piedras», ref. tumbled stone mosaic): broken (a drawn stone keeps its own smooth outline)
        const sm = [];                                                                  // straight edges with worn corners (a small corner cut), each edge a little bitten in
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const k = Math.min(0.22, 0.012 / Math.max(L, 1e-4)), bite = rr(0, 0.0035) / Math.max(Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 1e-3), m = rr(0.35, 0.65);
          sm.push([a[0] * (1 - k) + b[0] * k, a[1] * (1 - k) + b[1] * k]);
          if (L > 0.035) sm.push([(a[0] * (1 - m) + b[0] * m) * (1 - bite), (a[1] * (1 - m) + b[1] * m) * (1 - bite)]);
          sm.push([a[0] * k + b[0] * (1 - k), a[1] * k + b[1] * (1 - k)]);
        }
        poly = sm;
      }
      // the frame of the surface at the piece
      surfP(cu, cy, P0); surfP(cu + 0.05, cy, Pu); surfP(cu, cy + 0.05, Pv);
      Tu.subVectors(Pu, P0).multiplyScalar(20); Tv.subVectors(Pv, P0).multiplyScalar(20);
      Nn.crossVectors(Tu, Tv).normalize(); if (P0.y < 0.12 && Math.abs(Nn.y) > 0.7 ? Nn.y < 0 : Nn.x * P0.x + Nn.z * P0.z > 0) Nn.negate();      // towards the public (on the floor skirt: up; the vault keeps facing down)
      // what it is: kind (0 ceramic, 1 pearl glaze, 2 old-gold glaze: a fine vein through the mosaic) — no metal (ART: the arch's gold is the only metal)
      const u = rnd(), vein = Math.abs(Math.sin(cu * (2 / RM) * 1.25 + 1.7 * Math.sin(cy * 0.55 + cu * (1 / RM))));
      const kind = s.mother ? (s.round ? 0 : u < 0.3 ? 1 : 0) : (u < 0.03 ? 1 : 0);   // T-058b: no gold vein (it read as dark ochre specks)
      // its rosette: the nearest mother piece; its glaze: the rosette's family, in rings round the heart
      let ros = 0, rd = 1e9; mothers.forEach((M, k) => { const d = Math.hypot(wrapU(cu - M.cu), cy - M.y) * (1 + 0.22 * Math.sin(cu * 3.1 + k * 1.7) * Math.sin(cy * 2.6 + k * 0.9)); if (d < rd) { rd = d; ros = k; } });   // wavy borders between rosettes (not straight Voronoi edges)
      const fam = FAMILY[mothers[ros].fam], bandN = Math.floor(rd / 0.42 + rnd() * 0.3);
      let col = s.mother ? fam[0] : rnd() < 0.06 ? fam[3] : bandN % 3 === 0 ? fam[1] : bandN % 3 === 1 ? fam[2] : fam[0];
      if (kind === 2) col = GOLD;
      const id = cells.length, idRnd = rnd();
      const inAx = rr(-0.7, 0.7);                                                        // the axis of its turn: in the surface, near the vertical
      ax.copy(Tv).normalize().multiplyScalar(Math.cos(inAx)).addScaledVector(e1.copy(Tu).normalize(), Math.sin(inAx)).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1.copy(Tu).normalize(), e2.crossVectors(Nn, e1).normalize(), Nn));
      const cell = { vis: s.wp ? s.wy > 0.03 && s.wy < 3.72 : true, wi: s.wl ? s.wl.index : 0, cu, cy, rad, loose, kind, col, ros, rd, c: P0.clone(), n: Nn.clone(), q, mother: s.mother, on: s.on, off: s.off, lip: !!s.lip, round: s.round, over: loose ? (cy - H) / 0.6 : 0, r1: idRnd, r2: rnd(), keep: rnd() < 0.3, th: cu / RM, ax: ax.clone(), rest: null, w: fW(cu, cy), cC: fC(cu, cy), k: fK(cu, cy) };
      cells.push(cell);
      // the shard: inset for the joint (see GROUT_H), thin (~1.5 cm), a bevel that catches the light; tilted a little
      // T-066: the grout bed sits 8 mm up (GROUT_H): the foot is widened below it (hidden) so that at the grout line the joint is
      // 2.5 mm (3 mm round a mother) everywhere, whatever the piece's thickness: no pools of grout, nothing floats
      // ORGANIC (studio 25-11, ref. tumbled natural stone): a thick slab (1.8–2.6 cm) with a flat face and a worn, rounded edge — the edge
      // in two steps (foot → shoulder at 65 % of the height → face), its width varying vertex by vertex (chipped); wider joints that vary
      const n = poly.length, thick = s.mother ? 0.024 : ORGANIC ? rr(0.018, 0.026) : 0.014 + rr(0, 0.006), ch = Math.min(ORGANIC ? 0.009 : 0.007, thick * 0.6);
      const gap = (s.mother ? 0.0015 : ORGANIC ? rr(0.0022, 0.0042) : 0.00125) - (ORGANIC ? (GROUT_H / (thick * 0.65)) * ch * 0.3 : (GROUT_H / thick) * ch * 1.1);
      const tiltA = rr(0, 6.28), tiltK = loose ? 0 : rr(0.02, 0.06), tx = Math.cos(tiltA) * tiltK, ty = Math.sin(tiltA) * tiltK;
      // a drawn stone may be concave (a horn, an arm): its insets follow its own edges (mitred offset), not the way to its centre
      const inset = (pp, d) => pp.map((p, i) => {
        const a = pp[(i + pp.length - 1) % pp.length], b = pp[(i + 1) % pp.length], dv = typeof d === 'number' ? d : d[i];
        let n1x = -(p[1] - a[1]), n1y = p[0] - a[0], n2x = -(b[1] - p[1]), n2y = b[0] - p[0];          // inward normals (counter-clockwise)
        const l1 = Math.hypot(n1x, n1y) || 1, l2 = Math.hypot(n2x, n2y) || 1; n1x /= l1; n1y /= l1; n2x /= l2; n2y /= l2;
        let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
        const k = dv / Math.max(0.45, mx * n1x + my * n1y); return [p[0] + mx * k, p[1] + my * k];
      });
      const radial = (pp, d, lo) => pp.map((p, i) => { const l = Math.hypot(p[0], p[1]) || 1, k = Math.max(lo, 1 - (typeof d === 'number' ? d : d[i]) / l); return [p[0] * k, p[1] * k]; });
      const O = s.wp ? inset(poly, gap) : radial(poly, gap, 0.45);
      const chV = O.map(() => (ORGANIC ? ch * rr(0.55, 1.45) : ch * 1.1));
      const T = s.wp ? inset(O, chV) : radial(O, chV, 0.5);
      const M = s.wp ? inset(O, chV.map((c) => c * 0.3)) : radial(O, chV.map((c) => c * 0.3), 0.5);
      const hM = thick * 0.65, hT = O.map(() => thick + (ORGANIC ? rr(-0.0012, 0.0012) : 0));   // the face not quite level: a split stone
      const W = (p, h, out) => out.copy(P0).addScaledVector(Tu, p[0]).addScaledVector(Tv, p[1]).addScaledVector(Nn, h + (h > 0.001 ? p[0] * tx + p[1] * ty : 0));
      const tri = (pa, ha, pb, hb, pc, hc, face, wantOut, dome) => {
        W(pa, ha, va); W(pb, hb, vb); W(pc, hc, vc);
        fn.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); if (fn.lengthSq() < 1e-14) return; fn.normalize();
        let flip;
        if (Array.isArray(wantOut)) flip = fn.dot(e1.copy(Tu).multiplyScalar(wantOut[0]).addScaledVector(Tv, wantOut[1])) < 0;   // the edge's own outward side
        else if (wantOut) { e1.copy(va).add(vb).add(vc).multiplyScalar(1 / 3).sub(P0).addScaledVector(Nn, -thick * 0.5); flip = fn.dot(e1) < 0; }
        else flip = fn.dot(Nn) * (face === 1 ? -1 : 1) < 0;
        const q2 = flip ? [pa, pc, pb] : [pa, pb, pc];
        if (flip) { fn.negate(); const t = vb.x, t2 = vb.y, t3 = vb.z; vb.copy(vc); vc.set(t, t2, t3); }
        for (const q of q2) { const w2 = uvOf(q); uvs.push(w2[0], w2[1]); }
        for (const v of [va, vb, vc]) {
          pos.push(v.x, v.y, v.z);
          if (dome && v !== va) { e1.subVectors(v, va).normalize().multiplyScalar(dome).add(fn).normalize(); nor.push(e1.x, e1.y, e1.z); } else nor.push(fn.x, fn.y, fn.z);   // a face a little domed (hand-made): the sheen slides over it
          inf.push(id, face);
        }
      };
      const Z = [0, 0];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (ORGANIC && !s.mother) {
          const out = s.wp ? [poly[j][1] - poly[i][1], poly[i][0] - poly[j][0]] : true;
          if (!s.wp) tri(Z, thick + 0.0008, T[i], hT[i], T[j], hT[j], 0, false, 0.1);                     // the face: flat, barely eased (a drawn stone: below)
          tri(T[i], hT[i], M[i], hM, M[j], hM, 2, out); tri(T[i], hT[i], M[j], hM, T[j], hT[j], 2, out);   // the worn shoulder
          tri(M[i], hM, O[i], 0, O[j], 0, 3, out); tri(M[i], hM, O[j], 0, M[j], hM, 3, out);             // the split side down to the grout (face 3: raw stone)
        } else {
          tri(Z, thick, T[i], thick, T[j], thick, 0, false, s.round ? 0.3 : 0.14);          // the face (a medallion is domed)
          tri(T[i], thick, O[i], 0, O[j], 0, 2, true); tri(T[i], thick, O[j], 0, T[j], thick, 2, true);   // the bevel down to the grout
        }
        if (!s.wp && !NOBACK) tri(Z, 0, O[j], 0, O[i], 0, 1, false);                     // the back (the glaze)   (?pnoback: lab, measuring only)
      }
      if (s.wp) {                                                                         // a drawn stone (maybe concave): face and back by ear-cutting
        const ft = THREE.ShapeUtils.triangulateShape(T.map((p) => new THREE.Vector2(p[0], p[1])), []);
        for (const [a, b, c] of ft) tri(T[a], hT[a], T[b], hT[b], T[c], hT[c], 0, false, 0);
        const bt = NOBACK ? [] : THREE.ShapeUtils.triangulateShape(O.map((p) => new THREE.Vector2(p[0], p[1])), []);
        for (const [a, b, c] of bt) tri(O[a], 0, O[c], 0, O[b], 0, 1, false);
      }
    }
    // the rest colours by rank (exact shares): warm field → bone 30 · cream 22 · sand 18 (of all); cool patches (30 %) → aqua 12 · mist 10 · sage 5 · clay 3
    const NCc = cells.length, byC = cells.map((c, i) => i).sort((a, b) => cells[a].cC - cells[b].cC), coolFrom = Math.floor(NCc * 0.7);
    const warm = byC.slice(0, coolFrom).sort((a, b) => cells[a].w - cells[b].w), cool = byC.slice(coolFrom).sort((a, b) => cells[a].k - cells[b].k);
    warm.forEach((i, r) => { const q = r / warm.length; cells[i].rest = q < 0.30 / 0.7 ? PASTEL[0] : q < 0.52 / 0.7 ? PASTEL[1] : PASTEL[2]; });
    cool.forEach((i, r) => { const q = r / cool.length; cells[i].rest = q < 0.4 ? PASTEL[3] : q < 0.733 ? PASTEL[4] : q < 0.9 ? PASTEL[5] : PASTEL[6]; });
    // studio 25-11 (Beltrán: «que el mosaico cuente la historia, de manera muy abstracta, como un continuo»): every tile takes the colour of
    // the story map where the eye sees it on the walls — at rest the scene is only intuited (STORY_REST of it over the pastel), a hand
    // turns the tile to its glaze, which is the story's own colour in full
    if (STORY) {
      const story = createStory(walls); try { window.__story = story.canvas; } catch { /* lab only */ } const wn = walls.map((w) => ({ c: w.centre, n: w.normal, r: w.right, half: w.width / 2, k: (w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z }));
      for (const c of cells) {
        const dx = c.c.x - eye.x, dy = c.c.y - eye.y, dz = c.c.z - eye.z;
        for (let wi = 0; wi < wn.length; wi++) {
          const q = wn[wi], dn = dx * q.n.x + dy * q.n.y + dz * q.n.z; if (dn > -1e-4) continue;
          const t = q.k / dn; if (t <= 0 || t > 1.0001) continue;
          const hx = eye.x + dx * t, hy = eye.y + dy * t, hz = eye.z + dz * t, x = (hx - q.c.x) * q.r.x + (hz - q.c.z) * q.r.z;
          if (x < -q.half - 0.01 || x > q.half + 0.01) continue;
          const col = story.at(story.start[wi] + x + q.half, hy);
          c.col = [col[0] * 1.08, col[1] * 1.08, col[2] * 1.08];
          c.rest = [c.rest[0] + (col[0] - c.rest[0]) * STORY_REST, c.rest[1] + (col[1] - c.rest[1]) * STORY_REST, c.rest[2] + (col[2] - c.rest[2]) * STORY_REST];
          break;
        }
      }
    }
    if (SHARDS) for (const c of cells) if (c.on) { c.col = c.on; c.rest = c.off; } else if (c.lip) { c.rest = [0.74, 0.6, 0.42]; c.col = [0.95, 0.62, 0.28]; }
    // studio 25-11: how near the opening's edge each piece is (0 far … 1 at the edge): the reveal's warm light (row 3, w)
    if (WK_DOOR) for (const c of cells) {
      let k = 0; const dx = c.c.x - eye.x, dy = c.c.y - eye.y, dz = c.c.z - eye.z;
      for (const w of walls) {
        const dn = dx * w.normal.x + dy * w.normal.y + dz * w.normal.z; if (dn > -1e-4) continue;
        const t = ((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z) / dn; if (t <= 0 || t > 1.0001) continue;
        const xs = (eye.x + dx * t - w.centre.x) * w.right.x + (eye.z + dz * t - w.centre.z) * w.right.z, y = eye.y + dy * t;
        if (Math.abs(xs) > w.width / 2 + 0.01) continue;
        const d = openD(w.index, xs, y);
        k = Math.max(0, 1 - Math.max(0, d) / 0.38); break;
      }
      c.edge = k * k;
    }   // studio 25-11: his colours, On when played, OFF at rest
    for (const c of cells) { if (c.kind === 2) c.rest = GOLD; /* T-069: a pearl piece keeps its patch's colour at rest (its grey-white #DCD6CC read as a hole in the grout) */ if (c.round) c.rest = c.r1 < 0.5 ? PASTEL[3] : PASTEL[4]; }
    // per piece, static (a float texture, PT rows per piece): centre + rnd, turn axis + kind, normal + mother, glaze, rest
    const TW0 = 128, TH0 = Math.max(1, Math.ceil(NCc / TW0)), pd = new Float32Array(TW0 * TH0 * PT * 4);
    cells.forEach((c, i) => {
      const x = i % TW0, y = Math.floor(i / TW0), tone = 0.92 + 0.16 * c.r2, hue = (c.r1 - 0.5) * 0.04;
      const rows = [[c.c.x, c.c.y, c.c.z, c.r1], [c.ax.x, c.ax.y, c.ax.z, c.kind], [c.n.x, c.n.y, c.n.z, c.mother ? 1 : 0], [c.col[0], c.col[1], c.col[2], c.edge || 0], [c.rest[0] * tone * (1 + hue), c.rest[1] * tone, c.rest[2] * tone * (1 - hue), 0]];
      rows.forEach((r, k) => pd.set(r, ((y * PT + k) * TW0 + x) * 4));
    });
    var pieceTex = new THREE.DataTexture(pd, TW0, TH0 * PT, THREE.RGBAFormat, THREE.FloatType);
    pieceTex.magFilter = pieceTex.minFilter = THREE.NearestFilter; pieceTex.generateMipmaps = false; pieceTex.needsUpdate = true;
    heroGeo = new THREE.BufferGeometry();
    heroGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); heroGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    heroGeo.setAttribute('aInf', new THREE.BufferAttribute(new Float32Array(inf), 2)); heroGeo.setAttribute('aUV', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    heroGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 16);
    try { if (new URLSearchParams(location.search).has('pidx')) {   // ?pidx (lab, measuring only): how many vertices are exact duplicates (what an index would save)
      const P = heroGeo.attributes.position.array, N = heroGeo.attributes.normal.array, I = heroGeo.attributes.aInf.array, U = heroGeo.attributes.aUV.array, seen = new Set();
      for (let v = 0; v < P.length / 3; v++) seen.add(`${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]},${N[v * 3]},${N[v * 3 + 1]},${N[v * 3 + 2]},${I[v * 2]},${I[v * 2 + 1]},${U[v * 2]},${U[v * 2 + 1]}`);
      console.error(`PIDX vertices ${P.length / 3} unique ${seen.size} cells ${cells.length}`);
    } } catch { /* no location */ }
  }
  const NC = cells.length, TW = 128, TH = Math.max(1, Math.ceil(NC / TW));
  // per piece, live: turn and its speed, colour (until when), light, gone (fallen), last crossing
  // studio 25-11 (Beltrán, after webgpu.toys/myriad) — THE WIND (experiment; WIND = false = as before): a moving hand is a gust, not a touch.
  // The tiles near it come off their bed and slide WITH the hand (its velocity, in the shell's own (cu, v) metres), leaving a wake; the air
  // has turbulence (their paths curl); each one tilts with its speed and goes back on its own spring (its own stiffness and damping: they
  // overshoot a little and settle one after another). Behind a tile away from its bed: the night (the hole mask). Offsets live in
  // offTex (du, dv, dn metres; w unused), applied in the vertex stage along the piece's own tangents.
  const WIND = true, W_SIG2 = 2 * 0.29 * 0.29, W_GAIN = 5.5, W_MAX = 0.55;
  const offData = new Float32Array(TW * TH * 4), offTex = new THREE.DataTexture(offData, TW, TH, THREE.RGBAFormat, THREE.FloatType);
  offTex.magFilter = offTex.minFilter = THREE.NearestFilter; offTex.generateMipmaps = false; offTex.needsUpdate = true;
  const wOff = new Float32Array(NC * 3), wVel = new Float32Array(NC * 3), wOn = new Uint8Array(NC);
  let windDirty = false;
  const sleep = new Uint8Array(NC), HL2 = LL / 2, SH2 = LL * 0.37, CU = Float64Array.from(cells, (c) => c.cu), CY = Float64Array.from(cells, (c) => c.cy);
  const paintAt = new Float32Array(NC).fill(-9);   // studio 25-11: when a piece was last painted from rest
  const rub = new Float32Array(NC);                // studio 25-11: how much a hand has rubbed this piece (the more, the more fall, the wider)
  // studio 26-11 (Beltrán, the narrative of the entrance): the room starts desaturated; where the public touches, the picture stays in
  // colour — they have uncovered that word. Painted stones still play (they move, fall, come back) but come back painted. When a share
  // PAINT_OPEN of the visible mosaic is painted, the buttons open (the host turns paint() into the score's reveal) and a wave runs
  // round the room from the last stone painted, painting what was left. A new pass of the entrance starts desaturated again.
  // studio 26-11 (Beltrán: «un círculo grande que se iba achicando alrededor de cada botón… una fuerza que iba dando vuelta los mosaicos»):
  // the rings are FORCES in the stones, not lines: a narrow band of stones turning (RING_TURN rad at its crest, BAND_W m wide) that moves —
  // closing in on every round window when the room opens (dB: each stone's distance to its nearest button), opening from the button
  // round the room while a hand charges it
  let dB = null, dBr = null, R0W = 0; const WIN_V = 2.2, CHARGE_V = 1.6, BAND_W = 0.3, RING_TURN = 1.15;
  const PERSIST = true, WAVE_V = 2.6, UP_FROM = 1.7, UP_K = 5;                         // UP: above 1.7 m a hand paints upward much farther (×6 at 2.1 m)
  let paintedN = 0, lastPaint = -1, waveT0 = -1, waveS = 0, lastHandT = 0;
  // studio 26-11 (Beltrán: «el anillo que recorre la sala cuando se activa, que suceda una vez más»): WAVE_PASSES fronts, one after the
  // other; the first paints what was left, the next ones only turn every stone as they pass (all is painted by then)
  const WAVE_PASSES = 2, WAVE_GAP = 0.8, wavePass = new Uint8Array(NC);
  // studio 26-11 (Beltrán: «si se empieza a pintar y pasa más de 1 minuto sin que nadie pinte, vuelve todo a 0»): no hand on the walls for
  // RESET_AFTER s → every painted stone goes back to rest, staggered over ~3 s (not one flash), and the buttons close again
  const RESET_AFTER = Math.max(5, Number(params?.resetAfter) || 60);
  const phi = new Float32Array(NC), vphi = new Float32Array(NC), colT = new Float32Array(NC).fill(-1), glow = new Float32Array(NC), gone = new Uint8Array(NC), resT = new Float32Array(NC).fill(-9);
  const stData = new Float32Array(TW * TH * 4);
  const stTex = new THREE.DataTexture(stData, TW, TH, THREE.RGBAFormat, THREE.FloatType);
  stTex.magFilter = stTex.minFilter = THREE.NearestFilter; stTex.generateMipmaps = false; stTex.needsUpdate = true;
  // studio 25-11 (Beltrán: «al dar vuelta las baldosas, detrás de ellas se debe ver azul noche»): where a piece lifts, turns or is gone,
  // the bed behind it shows the NIGHT; at rest the joints stay bone. A low-res mask over (cu, v), stamped each frame by the moving pieces.
  const MW = 768, MH = Math.ceil(VTOP / 0.04), maskData = new Uint8Array(MW * MH);
  const maskTex = new THREE.DataTexture(maskData, MW, MH, THREE.RedFormat, THREE.UnsignedByteType);
  maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter; maskTex.generateMipmaps = false; maskTex.wrapS = THREE.RepeatWrapping; maskTex.needsUpdate = true;
  let maskDirty = true;
  function stampHole(cu, v, r, a) {
    if (a < 0.04) return;
    const A = Math.min(255, Math.round(a * 255)), x0 = (cu / LL) * MW, y0 = (v / VTOP) * MH, rx = Math.max(1, (r / LL) * MW), ry = Math.max(1, (r / VTOP) * MH);
    for (let y = Math.max(0, Math.floor(y0 - ry)); y <= Math.min(MH - 1, Math.ceil(y0 + ry)); y++) for (let xx = Math.floor(x0 - rx); xx <= Math.ceil(x0 + rx); xx++) {
      const dx = (xx - x0) / rx, dy = (y - y0) / ry; if (dx * dx + dy * dy > 1) continue;
      const k = y * MW + (((xx % MW) + MW) % MW); if (maskData[k] < A) maskData[k] = A;
    }
    maskDirty = true;
  }

  const { Fn, attribute, uniform, varying, textureLoad, ivec2, int, float, vec3, vec4, modelWorldMatrix, normalize, mix, step, sin, cos, cross, dot, floor, mod, exp, abs, smoothstep, max, positionLocal, normalLocal, positionWorld, instancedBufferAttribute, fract } = TSL;
  const uBed = uniform(1), uPush = uniform(0), uDoor = uniform(1), PUSH = 1.4;
  // studio 25-11 (Beltrán: «el movimiento constante del mural debe ser un curl noise, ahora se ve como una ola de izquierda a derecha»): the idle
  // life is a CURL field on the GPU — every piece drifts in its own plane along the curl of a slow noise potential (divergence-free: eddies,
  // no direction of travel) and leans with the potential itself. Two layers drifting against each other, so the eddies form and dissolve.
  // lab measuring switches (studio 26-11, OPTIMIZAR-60FPS; nothing changes without them): ?pflat = the stones' face with no per-pixel
  // detail (noise, stone texture), ?pnohero = no mosaic, ?pnoidle = no curl motion
  const PQ = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } })();
  const IDLE_CURL = !PQ.has('pnoidle'), uIdleT = uniform(0), IDLE_F = 0.75, IDLE_AMP = 0.011, IDLE_TILT = 0.085, IDLE_LIFT = 0.004;
  const IDLE_WAVES = [];                                                                // [kx, ky, kz (1/m), ω (rad/s), phase, amplitude]: 6 directions, slow, no net drift
  { let sd = 91; const rq = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6; i++) { const th = (i / 6) * Math.PI + rq() * 0.4, el = (rq() - 0.5) * 1.2, f = IDLE_F * (0.7 + rq() * 0.9), sgn = i % 2 ? -1 : 1;
      IDLE_WAVES.push([Math.cos(th) * Math.cos(el) * f * 6.283, Math.sin(el) * f * 6.283, Math.sin(th) * Math.cos(el) * f * 6.283, sgn * (0.25 + rq() * 0.25), rq() * 6.283, 0.42]); } }
  const GROUT_BONE = float(0);   // studio 25-11 (Beltrán: «todavía se ve el fondo lechoso por detrás»): the whole bed is the night (1 = bone joints at rest, as before)
  const HAND_POOL = 0, HAND_LIGHT = 0;   // studio 25-11 (Beltrán: «quita la luz que genera la mano y las partículas»): pool and light off (Vicente's light was 2.0); motion only
  const uHandP = Array.from({ length: 6 }, () => uniform(new THREE.Vector4(0, -9, 0, 0)));
  const STONE_K = 1;
  // studio 26-11 (Beltrán: «la versión con la textura se ve mucho mejor»): his picture printed on the stones by default; params.mosaic = 'stone'
  // (or ?mosaic=stone) = one colour per stone
  const MOSAIC_TEX = (() => { let q = null; try { q = new URLSearchParams(location.search).get('mosaic'); } catch { /* no location */ } return q || params?.mosaic || 'image'; })();
  // studio 26-11 (Beltrán: «la parte de atrás está demasiado blanca, que sea más beige, y con variaciones: unas más oscuras, otras más
  // claras, para que se note que son piezas distintas»): a warmer beige (linear ≈ #BFA37E) that each stone shifts on its own (rawOf)
  const UNPAINTED = true, RAW_STONE = vec3(0.52, 0.366, 0.21);
  const texLoad = (f) => { const t = new THREE.TextureLoader().load(new URL(f, import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const texOn = STONES && MOSAIC_TEX === 'image' ? texLoad('./umbral3d/mosaic-on.jpg') : null, texOff = STONES && MOSAIC_TEX === 'image' ? texLoad('./umbral3d/mosaic-off.jpg') : null;   // (only when used)   // studio 25-11: how much stone texture (0 = the plain glaze)
  const stoneTex = new THREE.TextureLoader().load(new URL('./umbral3d/stone-detail.png', import.meta.url).href);
  // studio 26-11 (OPTIMIZAR-60FPS, measured: the four per-pixel 3D noises were ~60 % of the mosaic's GPU time): the same detail BAKED
  // in a tileable texture read in the stone's own plane (umbral3d/tools/stone_noise.py: grain, veins, mottle at the same frequencies).
  // ?pnoise3d (lab) = the computed noises, to compare.
  const NOISE3D = PQ.has('pnoise3d');
  const noiseTex = new THREE.TextureLoader().load(new URL('./umbral3d/stone-noise.png', import.meta.url).href);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.colorSpace = THREE.NoColorSpace; noiseTex.anisotropy = 4;
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.colorSpace = THREE.NoColorSpace; stoneTex.anisotropy = 4;   // studio 25-11: the hands' points on the mosaic (w = strength)   // T-058c: 'start' closes the shell 1.4 m in (was 2.8 with the far serpentine)
  // THE THRESHOLDS: at the centre of every wall the mosaic opens in a tall arch (Gaudí's: straight jambs, a pointed round head) — cut
  // where the wall LOOKS, not in the mosaic: the serpentine turns and its pieces fold away as they reach the door and grow back past it.
  // (DOOR_A / DOOR_H / DOOR_P: see THE SHELL above; T-058b had A 0.725: half base span, height, shape — y = H·(1 − |x/A|^P), metres ON THE WALL: a near-catenary (P 2 = a parabola), base 1.45 m, apex the narrowest (was 0.9 / 4.5: a flat lintel). The start ring (r 0.31–0.39 at 1.25 m) sits inside; the guide's words go above
  const E3 = vec3(eye.x, eye.y, eye.z);
  function doorK(wc) {                        // 1 = there, 0 = inside a door (wc: the piece's centre in the world)
    let k = float(1);
    const jit = fract(sin(dot(floor(wc.mul(9)), vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).sub(0.5).mul(0.24).mul(uPush.div(PUSH));   // QA: on 'start' the widening door frays piece by piece (±0.12 m), not a cardboard cut
    for (const w of walls) {
      const d = wc.sub(E3), dn = dot(d, vec3(w.normal.x, w.normal.y, w.normal.z));
      const t = float((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z).div(dn.min(-0.0001));
      const hp = E3.add(d.mul(t));
      const xs = dot(hp.sub(vec3(w.centre.x, w.centre.y, w.centre.z)), vec3(w.right.x, w.right.y, w.right.z));
      if (OPEN.length) {                                                                 // studio 25-11: his openings (rounded rectangles, see openD)
        let sd = float(9);
        for (const o of OPEN) if (o.wi === w.index) {
          const qx = abs(xs.sub(o.cx - w.width / 2)).add(jit).div(uDoor).sub(o.hw - o.rc), qy = abs(hp.y.sub(o.cy)).div(uDoor).sub(o.hh - o.rc);
          sd = TSL.min(sd, TSL.length(TSL.vec2(TSL.max(qx, 0), TSL.max(qy, 0))).add(TSL.min(TSL.max(qx, qy), 0)).sub(o.rc));
        }
        k = k.mul(max(smoothstep(-0.02, 0.005, sd), step(-0.0001, dn)));
        continue;
      }
      const x = abs(xs).add(jit).div(uDoor), y = hp.y.div(uDoor);
      const edge = y.sub(float(DOOR_H).mul(float(1).sub(x.div(DOOR_A).min(1).pow(DOOR_P))));
      k = k.mul(max(max(WK_DOOR ? smoothstep(-0.02, 0.005, edge) : smoothstep(-0.03, 0.2, edge), step(DOOR_A, x)), step(-0.0001, dn)));   // studio 25-11: no frame — the pieces at the opening keep their full size (no slivers)
    }
    return k;
  }
  // the quiet zones of every wall (art bible §4): behind the guide's words (±1.6 m × 1.75–2.2 m) and round the button (±0.9 m × 0.9–1.6 m)
  function quietOf(p) {
    let quiet = float(0);
    for (const w of walls) {
      const d = p.sub(E3), dn = dot(d, vec3(w.normal.x, w.normal.y, w.normal.z));
      const t = float((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z).div(dn.min(-0.0001));
      const hp = E3.add(d.mul(t)), x = abs(dot(hp.sub(vec3(w.centre.x, w.centre.y, w.centre.z)), vec3(w.right.x, w.right.y, w.right.z))), y = hp.y;
      const words = smoothstep(2.2, 1.6, x).mul(smoothstep(1.6, 1.85, y)).mul(smoothstep(2.7, 2.4, y));
      const button = smoothstep(1.35, 0.9, x).mul(smoothstep(0.6, 0.9, y)).mul(smoothstep(1.9, 1.6, y));
      quiet = max(quiet, max(words, button).mul(step(dn, -0.0001)));
    }
    return quiet;
  }
  const LUMW = vec3(0.2126, 0.7152, 0.0722), CALM = vec3(...PASTEL[0]);
  const rotA = (v, a, c, s) => v.mul(c).add(cross(a, v).mul(s)).add(a.mul(dot(a, v)).mul(float(1).sub(c)));
  function heroMaterial() {
    // studio 25-11 (Beltrán: «cerámica mate, no brillante, que se note un grano; que no sean reflectivas, si no pesa mucho»): diffuse only
    // (Lambert: no environment, no clearcoat, no specular), the grain of fired clay in the colour (two octaves of noise in the piece's own
    // frame, so it stays on the piece when it turns)
    const m = new THREE.MeshLambertNodeMaterial();
    const aInf_ = attribute('aInf', 'vec2'), id = aInf_.x, ix = int(mod(id, TW)), iy = int(floor(id.div(TW)));
    const ld = (k) => textureLoad(pieceTex, ivec2(ix, iy.mul(PT).add(k)));
    const st = textureLoad(stTex, ivec2(ix, iy));      // turn, lift, light (+8 = the glaze shows), scale
    if (PQ.has('pvtx0')) m.positionNode = positionLocal; else   // ?pvtx0 (lab, measuring only): no per-piece vertex work — the ceiling of item 1
    m.positionNode = Fn(() => {
      const d0 = ld(0), aC_ = d0.xyz, aAx_ = ld(1).xyz, aN_ = ld(2).xyz;
      const th_ = normalize(vec3(aN_.z, 0, aN_.x.negate()).add(vec3(1e-5, 0, 0))), tv_ = cross(aN_, th_);
      let idle = vec3(0), idleA = float(0);
      if (IDLE_CURL) {                                                                   // the curl field at the piece's centre (the same for all its vertices)
        // the potential: a few plane waves in different directions and speeds (their interference makes eddies that form and dissolve;
        // analytic gradient — cheap enough for every vertex of ~29,000 stones)
        let p0 = float(0), grad = vec3(0);
        for (const [kx, ky, kz, w, ph, a] of IDLE_WAVES) {
          const arg = aC_.x.mul(kx).add(aC_.y.mul(ky)).add(aC_.z.mul(kz)).add(uIdleT.mul(w)).add(ph);
          p0 = p0.add(sin(arg).mul(a)); grad = grad.add(vec3(kx, ky, kz).mul(cos(arg).mul(a)));
        }
        idle = th_.mul(dot(grad, tv_)).sub(tv_.mul(dot(grad, th_))).mul(IDLE_AMP / (IDLE_F * 6.283 * 1.6)).add(aN_.mul(p0.mul(IDLE_LIFT)));
        idleA = p0.mul(IDLE_TILT);
      }
      const ang = st.x.add(idleA), c = cos(ang), s = sin(ang);
      const wc = modelWorldMatrix.mul(vec4(aC_, 1)).xyz;
      const local = positionLocal.sub(aC_).mul(st.w).mul(PQ.has('pnodoor') ? float(1) : doorK(wc));   // ?pnodoor (lab, measuring only)
      normalLocal.assign(rotA(normalLocal, aAx_, c, s));
      const inward = normalize(vec3(aC_.x, 0, aC_.z)).mul(uPush.negate());          // 'start': the world closes in round the eye
      const ow = textureLoad(offTex, ivec2(ix, iy));
      const wind = th_.mul(ow.x).add(tv_.mul(ow.y)).add(aN_.mul(ow.z));                // studio 25-11: the wind's offset (sign of th_ fixed on the CPU)
      return aC_.add(rotA(local, aAx_, c, s)).add(aN_.mul(st.y)).add(inward).add(wind).add(idle.mul(st.w));
    })();
    const vEdge = varying(ld(3).w), face = aInf_.y, vKind = varying(ld(1).w), r = varying(ld(0).w), vGl = varying(ld(3).xyz), vRest = varying(ld(4).xyz), packed = varying(st.z);
    const top = float(1).sub(step(0.5, face)), back = step(0.5, face).mul(float(1).sub(step(1.5, face))), side = step(1.5, face);
    const shoulder = step(1.5, face).mul(float(1).sub(step(2.5, face))), split = step(2.5, face);   // studio 25-11: the glaze wraps the worn shoulder; the split side is raw
    const kPearl = step(0.5, vKind).mul(float(1).sub(step(1.5, vKind)));
    // a piece turns a WHOLE turn to change colour (so it seats again in its own outline): its two faces swap what they show at the
    // half turn, when the public sees the other one. kc = 1: the face shows the glaze
    const kc = step(6, packed), g = packed.sub(kc.mul(8));
    // studio 25-11 (Beltrán): MOSAIC_TEX = 'image' — every stone carries ITS part of his picture (mosaic-off.jpg at rest, mosaic-on.jpg played),
    // fixed to the stone (it turns with it); 'stone' — each stone one colour, his picture's mean there
    // studio 26-11 (Beltrán: «el desaturado debe ser mucho más, para que se note el cambio entre un estado y otro»): the rest state keeps
    // only REST_SAT of its colour, towards a warm sand grey of the same lightness (params.restSat; 0 = grey, 1 = his OFF picture as it is)
    const REST_SAT = Math.min(1, Math.max(0, Number(params?.restSat ?? 0.15))), SAND = vec3(1.06, 1.0, 0.88);
    const desat = (c) => (REST_SAT >= 1 ? c : mix(SAND.mul(dot(c, LUMW)), c, REST_SAT));
    let topCol = mix(desat(vRest), vGl, kc);
    if (MOSAIC_TEX === 'image' && STONES) { const uv = varying(attribute('aUV', 'vec2')); topCol = mix(desat(TSL.texture(texOff, uv).rgb), TSL.texture(texOn, uv).rgb, kc); }
    // studio 25-11 (Beltrán: «por detrás se van a ver de arcilla o de piedra, están pintadas por adelante nomás»): back and sides are raw stone
    const rk = fract(r.mul(7.137)), rw = fract(r.mul(3.71));                              // this stone's own beige: 0.74–1.12 of the light, a touch warmer or cooler
    const RAW = RAW_STONE.mul(rk.mul(0.38).add(0.74)).mul(vec3(rw.mul(0.08).add(0.96), 1, float(1.04).sub(rw.mul(0.1))));
    const backCol = UNPAINTED ? RAW : mix(vGl, vRest, kc);
    const quiet = STORY || SHARDS ? float(0) : quietOf(positionWorld);   // studio 25-11: the story runs through (the trailer has no guide words on the entrance)
    const body = vec3(0.86, 0.8, 0.7);                                                  // the fired body on the bevel: light, it draws every piece
    let col = topCol.mul(top).add(backCol.mul(back)).add(UNPAINTED ? topCol.mul(0.82).mul(shoulder).add(RAW.mul(split)) : mix(topCol, body, ORGANIC ? 0.25 : 0.55).mul(side));   // ORGANIC: a stone is the same stone through
    col = mix(col, CALM.mul(dot(col, LUMW).div(dot(CALM, LUMW)).mul(0.35).add(0.65)), quiet.mul(0.75));   // the quiet zones: only bone / cream, calm
    const gp = varying(positionLocal.sub(ld(0).xyz));                                     // the piece's own frame (before its turn)
    // studio 25-11 (Beltrán: «textura de piedra»): a tileable stone detail (umbral3d/stone-detail.png: relief slopes, mottling, crackle) in the
    // piece's own plane; the relief is read against the overhead key (lighter where the stone faces up)
    const vNp = varying(ld(2).xyz), th2 = normalize(vec3(vNp.z, 0, vNp.x.negate()).add(vec3(1e-5, 0, 0))), tv2 = cross(vNp, th2);
    const sUV = TSL.vec2(dot(gp, th2), dot(gp, tv2)).mul(STONE_SCALE).add(TSL.vec2(ld(0).w.mul(17.3), ld(0).w.mul(9.1)));
    const stone = TSL.texture(stoneTex, sUV);
    const FLAT = PQ.has('pflat');
    const nz = TSL.texture(noiseTex, sUV.add(TSL.vec2(0.37, 0.61)));                     // the baked detail (R grain, G veins, B mottle)
    const grain = FLAT ? float(0) : !NOISE3D ? nz.x.mul(2).sub(1) : TSL.mx_noise_float(gp.mul(260)).mul(0.6).add(TSL.mx_noise_float(gp.mul(70)).mul(0.4));   // ≈ 4 mm and 1.5 cm grain
    col = col.mul(grain.mul(ORGANIC ? 0.14 : 0.09).add(1)).mul(side.mul(ORGANIC ? -0.14 : 0.06).add(0.97));   // ORGANIC: the split sides a little darker, rougher
    const faceK = ORGANIC ? float(1) : float(1).sub(side);
    if (!FLAT) col = col.mul(mix(float(1), stone.z.mul(0.55).add(0.73).mul(stone.w.mul(0.4).add(0.6)).mul(stone.y.sub(0.5).mul(0.9).add(1)), faceK.mul(STONE_K)));   // mottling × crackle × relief
    if (!FLAT && !NOISE3D) col = col.mul(float(1).sub(nz.y.mul(0.16))).mul(mix(float(0.9), float(1.04), nz.z));
    if (!FLAT && NOISE3D) { const vein = TSL.mx_noise_float(gp.mul(vec3(38, 38, 38)).add(vec3(r, r.mul(2.3), 0))), vl = smoothstep(0.06, 0.0, abs(vein)).mul(0.16);   // studio 25-11: stone veins
    const mott = smoothstep(-0.25, 0.55, TSL.mx_noise_float(gp.mul(11).add(vec3(r.mul(7), 0, 0))));                                       // and a second tone within the piece
    col = col.mul(float(1).sub(vl)).mul(mix(float(0.9), float(1.04), mott)); }
    m.colorNode = col;
    const fill = col.mul(0.28);                                                             // studio 25-11: the light the environment gave, as a flat fill (matte, cheap)
    const glazed = UNPAINTED ? top.mul(kc) : top.mul(kc).add(back.mul(float(1).sub(kc)));                          // the side showing the glaze
    // the light of a crossing: the bevels light up (thin, warm-white — no neon); the glaze holds a breath of its own light (≤ 0.15)
    let pool = float(0);                                                                    // studio 25-11: where a hand is, the mosaic warms at once
    // perf/servidor-mosaico (26-11, measured in the room's A6000: −0.39 ms of the walls, ~6 %): the pool is off (HAND_POOL = 0) and was
    // multiplied by 0 — six exp() per pixel for nothing. Built only when it is on; the image is the same to the bit.
    if (HAND_POOL && !PQ.has('pnopool')) for (const u of uHandP) { const d = positionWorld.sub(u.xyz); pool = pool.add(exp(dot(d, d).mul(-1 / (2 * 0.32 * 0.32))).mul(u.w)); }   // ?pnopool (lab, measuring only)
    m.emissiveNode = vec3(1.0, 0.92, 0.78).mul(side.mul(0.3).add(top.add(back).mul(0.03))).mul(g).add(vGl.mul(glazed.mul(0.07))).mul(float(1).sub(quiet))
      .add(HAND_POOL ? vec3(1.0, 0.72, 0.42).mul(col).mul(pool.min(1.4).mul(HAND_POOL)) : vec3(0)).add(fill).add(vec3(1.0, 0.55, 0.22).mul(vEdge).mul(REVEAL_GLOW));   // studio 25-11: the reveal glows warm at the opening (ref «correfoc»)
    return m;
  }
  // studio 26-11 (OPTIMIZAR-60FPS, measured: the mosaic was ~70 % of the GPU time, drawn whole by each of the four wall cameras):
  // the mosaic in SECTORS round the room, each one on the layers of the walls whose view can reach it (room.WALL_LAYER0 + wall), so
  // every camera draws about a quarter of it. The image is the same: a wall's frustum is bounded by vertical planes through the eye and
  // its edges, so a sector outside that wedge (plus a margin for the pieces' motion) can never show on it. The shell does not turn.
  const heroMat = heroMaterial(), heroMesh = new THREE.Group(); hero.add(heroMesh); if (PQ.has('pnohero')) heroMesh.visible = false;
  const heroParts = [];
  {
    const SECT = Number(PQ.get('psect')) || 48, MARGIN = 0.16, TAU = Math.PI * 2;        // ?psect=N (lab, measuring only)                                   // 7.5° sectors; 0.16 rad ≈ 0.7 m at 4.6 m: wind, lift, a falling piece's first moment
    const P = heroGeo.attributes.position.array, N = heroGeo.attributes.normal.array, I = heroGeo.attributes.aInf.array, UVa = heroGeo.attributes.aUV.array;
    const azOf = (x, z) => Math.atan2(z - eye.z, x - eye.x);
    const secOfCell = new Int16Array(cells.length);
    cells.forEach((c, i) => { secOfCell[i] = Math.floor((((azOf(c.c.x, c.c.z) / TAU) % 1 + 1) % 1) * SECT) % SECT; });
    const VN = P.length / 3, count = new Int32Array(SECT);
    for (let v = 0; v < VN; v += 3) count[secOfCell[I[v * 2] | 0]] += 3;
    const out = Array.from({ length: SECT }, (_, k) => ({ p: new Float32Array(count[k] * 3), n: new Float32Array(count[k] * 3), i: new Float32Array(count[k] * 2), u: new Float32Array(count[k] * 2), at: 0, lo: Infinity, hi: -Infinity, mid: ((k + 0.5) / SECT) * TAU }));
    for (let v = 0; v < VN; v++) {
      const o = out[secOfCell[I[v * 2] | 0]], a = o.at++;
      o.p.set(P.subarray(v * 3, v * 3 + 3), a * 3); o.n.set(N.subarray(v * 3, v * 3 + 3), a * 3); o.i.set(I.subarray(v * 2, v * 2 + 2), a * 2); o.u.set(UVa.subarray(v * 2, v * 2 + 2), a * 2);
      let d = azOf(P[v * 3], P[v * 3 + 2]) - o.mid; d -= Math.round(d / TAU) * TAU; if (d < o.lo) o.lo = d; if (d > o.hi) o.hi = d;   // the sector's real reach (a stone may cross its edge)
    }
    const wedge = walls.map((w) => { const a = endA(w, -1), b = endA(w, 1); let d = b - a; d -= Math.round(d / TAU) * TAU; return d >= 0 ? [a, d] : [b, -d]; });   // [start, span]
    function endA(w, sg) { return azOf(w.centre.x + w.right.x * sg * w.width / 2, w.centre.z + w.right.z * sg * w.width / 2); }
    const WL0 = room.WALL_LAYER0;
    for (const o of out) {
      if (!o.at) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(o.n, 3));
      g.setAttribute('aInf', new THREE.BufferAttribute(o.i, 2)); g.setAttribute('aUV', new THREE.BufferAttribute(o.u, 2));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 16);
      const m = new THREE.Mesh(g, heroMat); m.frustumCulled = false; heroMesh.add(m); heroParts.push(m);
      if (WL0 == null || PQ.has('pnosect')) continue;                                    // (an older room, or ?pnosect: every wall draws everything, as before)
      m.layers.disableAll();
      walls.forEach((w, wi) => {
        const [s0, sp] = wedge[wi]; let c = o.mid - (s0 + sp / 2); c -= Math.round(c / TAU) * TAU;   // the sector's reach vs the wall's wedge, both ± margin
        const lo = c + o.lo - MARGIN, hi = c + o.hi + MARGIN;
        if (hi >= -sp / 2 && lo <= sp / 2) m.layers.enable(WL0 + wi);
      });
    }
    try { window.__heroSectors = heroParts.map((m) => [m.geometry.attributes.position.count, m.layers.mask >>> 20]); } catch { /* lab only */ }
  }
  // the GROUT: one continuous surface just behind the pieces, bone-white and matte (ART: #F2EBDD); it shows in the joints and where a piece
  // has fallen; cut by the doors per pixel, it dissolves in patches as the part comes and goes
  const groutMesh = (() => {
    const NU = 380, NV = 96, P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3(), N = new THREE.Vector3(), pos = new Float32Array((NU + 1) * (NV + 1) * 3), nor = new Float32Array(pos.length), idx = [];
    const uvG = new Float32Array((NU + 1) * (NV + 1) * 2);
    for (let i = 0; i <= NU; i++) {
      const cu = (i / NU) * LL, top = crest(cu) - 0.03;   // T-069: up to the ragged crest (was −0.12: the sky showed in its gaps)
      for (let j = 0; j <= NV; j++) {
        const y = (j / NV) * top; surfP(cu, y, P); surfP(cu + 0.05, y, Q); surfP(cu, y + 0.05, R);
        N.crossVectors(Q.sub(P), R.sub(P)).normalize(); if (P.y < 0.12 && Math.abs(N.y) > 0.7 ? N.y < 0 : N.x * P.x + N.z * P.z > 0) N.negate();
        const o = (i * (NV + 1) + j) * 3; P.addScaledVector(N, GROUT_H - 0.03 * smooth(2.2, 3.0, y));   // T-069: up the vault the big flat pieces' corners sink under the curved bed: it drops 3 cm there (no grout over them) · T-058b/T-066: the bed 8 mm up the bevels, the joint 2.5 mm wide there and sunk under the faces; the
        pos[o] = P.x; pos[o + 1] = P.y; pos[o + 2] = P.z; nor[o] = N.x; nor[o + 1] = N.y; nor[o + 2] = N.z;   // write was lost in a comment: no grout, the sky showed through
        uvG[(i * (NV + 1) + j) * 2] = cu / LL; uvG[(i * (NV + 1) + j) * 2 + 1] = y / VTOP;   // studio 25-11: (cu, v) for the night mask
        if (i < NU && j < NV) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvG, 2)); g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });   // unlit: the joint is in the pieces' shade anyway (and it is cheap)
    m.positionNode = positionLocal.add(normalize(vec3(positionLocal.x, 0, positionLocal.z)).mul(uPush.negate()));
    const pw = positionWorld, hsh = fract(sin(dot(floor(pw.xz.mul(3.0)).add(floor(pw.y.mul(3.0))), vec3(12.9898, 78.233, 37.719).xy)).mul(43758.5453));
    m.colorNode = Fn(() => { TSL.If(doorK(pw).mul(step(hsh, uBed.mul(1.02))).lessThan(0.5), () => { TSL.Discard(); }); return mix(vec3(0.012, 0.022, 0.066), vec3(0.765, 0.606, 0.418), GROUT_BONE.mul(float(1).sub(max(TSL.texture(maskTex, TSL.uv()).r.mul(1.6).min(1), smoothstep(0.98, 0.6, uBed))))); })();   // studio 25-11: while the mosaic assembles (or goes) the bed is night, never sand   // #D9CFBE on screen (ACES-inverted; unlit) — T-066: exact (×0.8 gave #CFC3B0)   // (no alphaTest: its MSAA path breaks the WGSL at scale 1)
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  })();
  hero.add(groutMesh);
  // studio 26-11 (Beltrán: «hay que agregar el título»): the title in the P1 window (umbral3d/title.png, «Resonnancia Asset/Final/1x/Titulo.png»:
  // white text and logos on transparent, drawn at the strip's own scale — 1036 × 237 px of the 7196 × 1094 picture). A plane ON the wall,
  // centred in the wide opening, 1 cm towards the public: the wall's camera maps it 1 : 1 to the strip. Its white sits just under
  // the tone mapping (0.9: under the bloom's threshold, no halo).
  const uTitleK = uniform(1);                                                          // the title fades when the mosaic falls (CLEAR)
  const titleMesh = (() => {
    const o = OPEN.find((q) => q.hw / q.hh >= 1.4); if (!o) return null;
    const w = walls[o.wi], pw = STONES?.walls?.[o.wi], kx = pw ? w.width / pw[2] : 1, ky = (w.height || 3.75) / 3.75;
    const pxm = pw ? pw[1] / pw[2] : 261, W = (1036 / pxm) * kx, H = (237 / (912 / 3.75)) * ky;
    const tex = new THREE.TextureLoader().load(new URL('./umbral3d/title.png', import.meta.url).href);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const t = TSL.texture(tex); m.colorNode = t.rgb.mul(0.9); m.opacityNode = t.a.mul(uTitleK);   // (Beltrán: «sácale el bloom»): below the bloom's threshold
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m);
    mesh.position.copy(w.centre).addScaledVector(w.right, o.cx - w.width / 2).addScaledVector(w.normal, 0.01); mesh.position.y = o.cy;
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal)); mesh.renderOrder = 5;
    object.add(mesh); return mesh;
  })();

  // ---- THE BUTTONS (studio 26-11, Beltrán's references): once the room is open, rings close in on every round window (big, animating
  // inwards, fading at its edge) round a hand and «Col·loca la teva mà». A hand IN the circle: the rings, the hand and the words go, a soft
  // white disc fills the window, and a RING grows from it round the room at the waves' speed, turning the stones as it passes. Let go
  // before it has gone round: it vanishes and the charge is lost. When the rings (one alone, or several together) have covered the whole
  // room: CLEAR — every stone falls (animated, with sound), the title fades, the room is left night blue with its dust.
  const ROUND = OPEN.filter((q) => q.hw / q.hh < 1.4), RING_SIZE = 3.4, HAND_TXT = 'Col·loca la teva mà';
  const btns = ROUND.map((o) => {
    const w = walls[o.wi], cx = o.cx - w.width / 2, r = Math.min(o.hw, o.hh), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, new THREE.Vector3(0, 1, 0), w.normal));
    const at = (dz) => new THREE.Vector3().copy(w.centre).addScaledVector(w.right, cx).addScaledVector(w.normal, dz).setY(o.cy);
    // the rings: one quad, four rings of constant width drawn by distance (radius uniforms), each fading in big and out at the edge
    const uR = [uniform(9), uniform(9), uniform(9), uniform(9)], uA = [uniform(0), uniform(0), uniform(0), uniform(0)];
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const rr_ = TSL.length(TSL.uv().sub(0.5).mul(RING_SIZE));
    let ringA = float(0); for (let j = 0; j < 4; j++) ringA = ringA.add(float(1).sub(smoothstep(0.006, 0.011, abs(rr_.sub(uR[j])))).mul(uA[j]));
    rm.colorNode = vec3(0.9); rm.opacityNode = ringA.min(1).mul(step(r + 0.005, rr_));   // never over the window itself
    const rings = new THREE.Mesh(new THREE.PlaneGeometry(RING_SIZE, RING_SIZE), rm); rings.position.copy(at(0.015)); rings.quaternion.copy(q); rings.renderOrder = 6; object.add(rings);
    // the hand and the words (a canvas: Mano.png + Instrument Serif)
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const ht = new THREE.CanvasTexture(cv); ht.colorSpace = THREE.SRGBColorSpace; ht.anisotropy = 4;
    const uHand = uniform(0), hm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const htx = TSL.texture(ht); hm.colorNode = htx.rgb.mul(0.88); hm.opacityNode = htx.a.mul(uHand);
    const hand = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.9, r * 1.9), hm); hand.position.copy(at(0.016)); hand.quaternion.copy(q); hand.renderOrder = 7; object.add(hand);
    // the soft white disc while a hand holds
    const uGlow = uniform(0), gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const gr = TSL.length(TSL.uv().sub(0.5)).mul(2.2 * r * 1.15);
    gm.colorNode = mix(vec3(0.86), vec3(0.5, 0.52, 0.58), smoothstep(r * 0.25, r * 1.02, gr)); gm.opacityNode = float(1).sub(smoothstep(r * 0.6, r * 1.03, gr)).mul(0.95).mul(uGlow);
    const glowD = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * r * 1.15, 2.2 * r * 1.15), gm); glowD.position.copy(at(0.017)); glowD.quaternion.copy(q); glowD.renderOrder = 8; object.add(glowD);
    return { o, w, cx, r, cu: 0, cv: 0, pulse: -1, uR, uA, uHand, uGlow, cv, ht, hold: false, offT: 0, t0: -1, gen: 0, R: 0, seen: null, show: 0, glow: 0 };
  });
  { // the hand picture and the words, once the font and the PNG are in
    const img = new Image(); img.src = new URL('./umbral3d/hand.png', import.meta.url).href;
    const font = new FontFace('Instrument Serif', `url(${new URL('../fonts/InstrumentSerif-Regular.ttf', import.meta.url).href})`);
    Promise.all([img.decode(), font.load().then((f) => { try { document.fonts.add(f); } catch { /* lab */ } })]).then(() => {
      for (const b of btns) {
        const g = b.cv.getContext('2d'); g.clearRect(0, 0, 512, 512);
        const hh = 190, hw = (img.width / img.height) * hh; g.drawImage(img, 256 - hw / 2, 112, hw, hh);
        g.fillStyle = '#FFFFFF'; g.font = '46px "Instrument Serif"'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(HAND_TXT, 256, 372);
        b.ht.needsUpdate = true;
      }
    }).catch((e) => console.info('umbral3d: the button picture skipped (' + e.message + ')'));
  }
  let clearT0 = -1, chargeCov = 0, wasOpen = false;
  const events = [];   // studio 26-11: this frame's events for the host / sound ('open' the buttons appear, 'charge:<w>' / 'uncharge:<w>' a hand in a circle, 'cleared' the mosaic falls)
  const fallDelay = new Float32Array(NC);
  function coverOf() {                                                                // the share of the perimeter the charge rings cover now
    const iv = [];
    for (const b of btns) if (b.t0 >= 0) { const h = Math.min(LL / 2, b.R), a = ((b.cu - h) % LL + LL) % LL; if (a + 2 * h <= LL) iv.push([a, a + 2 * h]); else { iv.push([a, LL]); iv.push([0, a + 2 * h - LL]); } }
    if (!iv.length) return 0;
    iv.sort((p, q) => p[0] - q[0]); let tot = 0, [s0, e0] = iv[0];
    for (let k = 1; k < iv.length; k++) { if (iv[k][0] <= e0) e0 = Math.max(e0, iv[k][1]); else { tot += e0 - s0; [s0, e0] = iv[k]; } }
    return Math.min(1, (tot + e0 - s0) / LL);
  }

  // waves on the mosaic: the idle shimmer goes round for ever; hands launch rings
  const PULSES = 20, pulses = Array.from({ length: PULSES }, () => ({ on: false, s: 0, y: 0, t0: 0, amp: 1, speed: 2.6, reach: 0, hold: 0, ros: -1 }));
  let pulseNext = 0;
  const pa = new Int32Array(PULSES), paR = new Float32Array(PULSES), paMax = new Float32Array(PULSES), paMin2 = new Float32Array(PULSES), paAmp = new Float32Array(PULSES);
  const visN = Math.max(1, cells.reduce((a, c) => a + (c.vis && !c.loose ? 1 : 0), 0));
  // studio 26-11 (Beltrán: «mínimo por muro, un 25 % en cada uno»): the share is counted per wall too; paint().share = the LEAST painted wall's
  const visW = new Int32Array(NW), paintedW = new Int32Array(NW);
  for (const c of cells) if (c.vis && !c.loose) visW[c.wi]++;
  function paintCell(i) { if (colT[i] === Infinity) return; colT[i] = Infinity; if (cells[i].vis && !cells[i].loose) { paintedN++; paintedW[cells[i].wi]++; } lastPaint = i; }
  function resetPaint() { colT.fill(-1); paintedN = 0; paintedW.fill(0); lastPaint = -1; waveT0 = -1; lastHandT = time; wavePass.fill(0);
    if (clearT0 >= 0) { offData.fill(0); windDirty = true; } clearT0 = -1; chargeCov = 0; for (const b of btns) { b.t0 = -1; b.show = b.glow = 0; } }
  function unpaint() { for (let i = 0; i < NC; i++) if (colT[i] === Infinity) colT[i] = time + rnd() * 3; paintedN = 0; paintedW.fill(0); lastPaint = -1; waveT0 = -1; wavePass.fill(0); }
  function launch(s, y, amp, speed, reach, hold, ros = -1) { const p = pulses[pulseNext]; p.ros = ros; pulseNext = (pulseNext + 1) % PULSES; p.on = true; p.s = s; p.y = y; p.t0 = time; p.amp = amp; p.speed = speed; p.reach = reach; p.hold = hold; }
  // a point on a wall → the piece of the serpentine drawn there (the ray from the eye through the hand)
  const hit = { cu: 0, cy: 0, p: new THREE.Vector3() };
  function surfHit(pos) {
    const dx = pos.x - eye.x, dy = pos.y - eye.y, dz = pos.z - eye.z, dh = Math.hypot(dx, dz) || 1e-3, th = Math.atan2(dz, dx) + hero.rotation.y;
    let t = 0, v = eye.y;
    for (let i = 0; i < 6; i++) { t = surfR(th, v) / dh; v = clamp(vOf(eye.y + t * dy), 0, VTOP); }
    hit.cu = ((th * RM) % LL + LL) % LL; hit.cy = v;
    hit.p.set(eye.x + dx * t, eye.y + dy * t, eye.z + dz * t);
    return hit;
  }
  // studio 25-11 (the wind): which way a wall's «right» runs in cu (+1 / −1)
  const wallSgn = walls.map((w) => { const P = new THREE.Vector3().copy(w.centre).setY(1.3); surfHit(P); const a = hit.cu; surfHit(P.addScaledVector(w.right, 0.2)); const d = hit.cu - a; return d - Math.round(d / LL) * LL >= 0 ? 1 : -1; });

  // =========================================================================================== loose shards (instanced): mobiles, fallen pieces, far arcs
  // tile geometry: an irregular polygon, extruded thick with a rounded bevel, bent like a piece of a vase; group 0 = the face, 1 = back and sides
  function tileGeo(n, thick, curve, shapeIn = null) {
    const s = shapeIn || new THREE.Shape();
    if (!shapeIn) for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rr(-0.3, 0.3) * (3 / n), r = rr(0.36, 0.54); const x = Math.cos(a) * r, y = Math.sin(a) * r * rr(0.7, 1); if (k) s.lineTo(x, y); else s.moveTo(x, y); }
    const g0 = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.5, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 3, curveSegments: 1 });
    g0.center();
    const src = g0.index ? g0.toNonIndexed() : g0;
    const Pp = src.attributes.position.array, Nn = src.attributes.normal.array, Uu = src.attributes.uv.array, nt = Pp.length / 9;
    const front = [], back = [];
    for (let t = 0; t < nt; t++) ((Nn[t * 9 + 2] + Nn[t * 9 + 5] + Nn[t * 9 + 8]) / 3 > 0.3 ? front : back).push(t);
    const order = front.concat(back), pos = new Float32Array(nt * 9), nor = new Float32Array(nt * 9), uvs = new Float32Array(nt * 6);
    order.forEach((t, k) => {
      for (let v = 0; v < 3; v++) {
        const i = t * 9 + v * 3, o = k * 9 + v * 3, x = Pp[i], y = Pp[i + 1];
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = Pp[i + 2] + curve * (x * x + y * y);
        let nx = Nn[i] - 2 * curve * x * Nn[i + 2], ny = Nn[i + 1] - 2 * curve * y * Nn[i + 2], nz = Nn[i + 2]; const l = Math.hypot(nx, ny, nz) || 1;
        nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
        uvs[k * 6 + v * 2] = Uu[t * 6 + v * 2]; uvs[k * 6 + v * 2 + 1] = Uu[t * 6 + v * 2 + 1];
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.addGroup(0, front.length * 3, 0); g.addGroup(front.length * 3, back.length * 3, 1);
    g.computeBoundingSphere(); g0.dispose(); if (src !== g0) src.dispose();
    return g;
  }
  // kinds: 0 glazed face / mirror back, 1 mirror on both faces, 2 iridescent glass
  const MAT_NAME = ['ceramic', 'chrome', 'glass'];
  const MESHDEF = [[0, 6, 0.1, 0.16], [0, 5, 0.11, 0.22], [0, 7, 0.09, 0.12], [1, 5, 0.08, 0.2], [1, 6, 0.08, 0.14], [2, 7, 0.06, 0.1]];   // kind, sides, thickness, curve
  const byKind = [0, 1, 2].map((k) => MESHDEF.map((d, i) => (d[0] === k ? i : -1)).filter((i) => i >= 0));
  const counts = MESHDEF.map(() => 0), shards = [];
  function shard(role, kind, size, aspect = rr(0.78, 1.25)) {
    const mi = byKind[kind][Math.floor(rnd() * byKind[kind].length)];
    const s = { role, kind, mesh: mi, idx: counts[mi]++, sc: new THREE.Vector3(size * aspect, size / aspect, size), p: new THREE.Vector3(), q: new THREE.Quaternion(), rollQ: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rr(0, 6.28)), color: [...BONE], base: BONE, glaze: GLAZE[Math.floor(rnd() * 5)], tintT: -1, tintK: 0 };
    shards.push(s); return s;
  }
  const faceQ = walls.map((w) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.right, UP, w.normal)));
  const looseBody = () => ({ state: 0, v: new THREE.Vector3(), w: new THREE.Vector3(), flat: new THREE.Quaternion(), timer: 0, landed: false, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), spinAxis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize() });

  // ---- 0.3–0.9 m behind each wall: mobiles of big pieces on threads (the layer of parallax; what the hand hits directly). T-058: OFF by
  // default (ARTE-ENTRADA: no floating shards, no vertical lines); the code stays for a rollback (MOBILES = true)
  const MOBILES = false;
  const band = [];
  function hanging(w, x, y, d, size, kind, mother) {
    const s = shard('band', kind, size);
    Object.assign(s, looseBody(), {
      wall: w.index, hx: x, hy: y, hd: d, top: w.height + 0.4, L: w.height + 0.4 - y, mother,
      ax: 0, az: 0, vax: 0, vaz: 0, yaw: 0, vyaw: 0, baseYaw: rr(-0.5, 0.5), tilt: rr(-0.25, 0.25), turn: rr(0.04, 0.12) * (rnd() < 0.5 ? -1 : 1),
      lastHit: -9, lastHitBurst: -9, hits: 0, arriveAt: rr(0, 0.55), leaveAt: rr(0, 0.45), out: new THREE.Vector3(),
    });
    if (kind === 0) { s.base = rnd() < 0.72 ? BONE : GRAPHITE; s.color = [...s.base]; }
    s.out.copy(w.normal).multiplyScalar(-1).addScaledVector(w.right, rr(-0.6, 0.6)).normalize();
    band.push(s);
  }
  const motherKind = () => { const u = rnd(); return u < 0.5 ? 1 : u < 0.85 ? 0 : 2; };
  if (MOBILES) for (const w of walls) {        // one mobile at each side of the wall (T-058: off — ART: nothing floats, no vertical threads)
    const half = w.width / 2;
    for (const side of [-1, 1]) {
      const cx = side * rr(2.62, Math.max(2.64, half - 0.62)), d0 = rr(0.45, 0.8);
      hanging(w, cx, rr(2.3, 2.9), d0, rr(0.6, 0.85), motherKind(), true);                                    // the mother piece, high
      if (rnd() < 0.75) hanging(w, clamp(cx + side * rr(0.3, 0.6), -half + 0.35, half - 0.35), rr(1.5, 1.95), d0 - rr(0.1, 0.25), rr(0.38, 0.52), motherKind(), true);
      const n = Math.round(rr(2, 3.4));
      for (let i = 0; i < n; i++) {
        const x = clamp(cx + gauss() * 0.45, -half + 0.2, half - 0.2), y = rr(0.75, 1.5);
        if (Math.abs(x) < 1.9) continue;
        hanging(w, x, y, clamp(d0 + rr(-0.35, 0.1), 0.22, 0.9), rr(0.17, 0.3), rnd() < 0.3 ? 1 : rnd() < 0.12 ? 2 : 0, false);
      }
    }
  }

  // ---- the pool of fallen pieces of the serpentine (a glazed face, a mirror back)
  const NB = 320, bodies = [];
  for (let i = 0; i < NB; i++) { const s = shard('body', 0, 0.4); Object.assign(s, looseBody(), { cell: -1 }); bodies.push(s); }
  // pieces waiting their turn to let go (the chain of a cascade)
  const QN = 200, queue = Array.from({ length: QN }, () => ({ on: false, cell: 0, at: 0, power: 1 }));

  // ---- 13–21 m: arcs of big shards that turn with the far world
  const mid = [];
  if (MOBILES) for (const [R, y, n, dir, ph] of [[12.5, 1.9, 24, 1, 0.4], [16.5, 5.0, 22, -1, 2.1], [21, 8.5, 22, 1, 4.0]]) for (let i = 0; i < n; i++) {   // T-058: off with the mobiles
    const a = (i / n) * Math.PI * 2 + rr(-0.08, 0.08);
    if (Math.sin(a * 3 + ph) < -0.2) continue;
    const s = shard('mid', rnd() < 0.6 ? 1 : rnd() < 0.2 ? 2 : 0, rr(0.7, 1.9));
    Object.assign(s, { R: R + rr(-0.8, 0.8), y: y + rr(-0.8, 0.8), a, dir, axis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), spin: rr(0.05, 0.2), ph: rr(0, 6.28), arriveAt: rr(0, 0.6) });
    if (s.kind === 0) { s.base = rnd() < 0.6 ? BONE : GRAPHITE; s.color = [...s.base]; }
    mid.push(s);
  }

  // ---- materials and meshes of the loose shards
  const mirrorM = new THREE.MeshLambertNodeMaterial({ color: new THREE.Color(0.86, 0.8, 0.7) });
  { const hk = fract(sin(float(TSL.instanceIndex).mul(12.9898)).mul(43758.5453)); mirrorM.colorNode = RAW_STONE.mul(hk.mul(0.38).add(0.74)); }   // studio 26-11 (Beltrán: «cuando caen se ven más blancos por detrás»): the fallen pieces' backs = the stones' varied beige   // studio 25-11: matte, diffuse only   // T-058: the back of a piece is its fired body (cream, matte) — no mirror
  function glazeMat(attr, glowU) {
    const m = new THREE.MeshLambertNodeMaterial({ color: 0xffffff });   // studio 25-11: matte ceramic (was physical, clearcoat, environment)
    m.colorNode = vec3(instancedBufferAttribute(attr));
    if (glowU) m.emissiveNode = vec3(instancedBufferAttribute(attr)).mul(glowU);
    return m;
  }
  const glassM = new THREE.MeshPhysicalNodeMaterial({ color: 0xdfe6ff, roughness: 0.04, metalness: 0.35, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [200, 600], envMap: env, envMapIntensity: 1.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const glazeAttrs = counts.map((c) => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, c) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const meshes = MESHDEF.map(([kind, n, thick, curve], i) => {
    const m = kind === 2 ? [glassM, glassM] : kind === 1 ? [mirrorM, mirrorM] : [glazeMat(glazeAttrs[i]), mirrorM];
    const mesh = new THREE.InstancedMesh(tileGeo(n, thick, curve), m, Math.max(1, counts[i]));
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.renderOrder = kind === 2 ? 3 : 0; mesh.count = counts[i];   // an unused kind draws nothing
    object.add(mesh); return mesh;
  });
  const paint = (s) => { glazeAttrs[s.mesh].setXYZ(s.idx, s.color[0], s.color[1], s.color[2]); glazeAttrs[s.mesh].needsUpdate = true; };
  for (const s of shards) glazeAttrs[s.mesh].setXYZ(s.idx, s.color[0], s.color[1], s.color[2]);
  // chips: what a broken piece becomes
  const CHIPS = 96, chips = [];
  const chipAttr = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const chipMesh = new THREE.InstancedMesh(tileGeo(4, 0.14, 0.15), [glazeMat(chipAttr), mirrorM], CHIPS);
  chipMesh.frustumCulled = false; chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.add(chipMesh); room.reactive?.(chipMesh);   // T-070: the knocked-out pieces fly fast: no TAA ghost
  for (let i = 0; i < CHIPS; i++) chips.push({ on: false, owner: null, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 0.04, rest: false, from: new THREE.Vector3() });

  // threads of the mobiles (collapsed when a piece is not hanging)
  const threadPos = new Float32Array(Math.max(1, band.length) * 6);
  const threadGeo = new THREE.BufferGeometry(); threadGeo.setAttribute('position', new THREE.BufferAttribute(threadPos, 3).setUsage(THREE.DynamicDrawUsage));
  const threadMat = new THREE.LineBasicNodeMaterial({ color: new THREE.Color(0.5, 0.36, 0.25), transparent: true, opacity: 0.3, depthWrite: false });
  const threads = new THREE.LineSegments(threadGeo, threadMat); threads.frustumCulled = false; threads.visible = band.length > 0; object.add(threads);

  // ---- the ring that becomes the start button (T-058b): a MEDALLION FRAME round GUI's glass button (r ≤ 0.30), flush with the wall —
  // two rows of CONTIGUOUS tiles (slightly tapered, ~3 × 3.7 cm, 3 mm joints) on a grout bed, r 0.31–0.39 m; bone and cream with one in
  // eight in old gold. They fly in with the reveal and lock in place, the inner row first; start turns the rows against each other and
  // lights the frame a little; 'start' blows it apart.
  const RING_ROWS = [0.3295, 0.3705], RING_W = 0.037, RING_STEP = 0.032, RING_K = 0.11, RING_Y = OPEN.find((o) => o.hw / o.hh < 1.4)?.cy ?? 1.25,   /* studio 26-11: at the picture's round windows (MosaicEtapa1: 1.51 m) */ RING_D = 0.012, RING_R = 0.35;   // T-058b: inside the parabolic door (±0.42 m at 1.25 m), ≥ 3 cm of air round GUI's glass (r 0.28)
  const ring = [], uRing = uniform(0); let ringZeroed = false, ringTick = 0;
  const RING_TOTAL = NW * RING_ROWS.reduce((a, r) => a + Math.round((2 * Math.PI * r) / RING_STEP), 0);
  const ringAttr = new THREE.InstancedBufferAttribute(new Float32Array(RING_TOTAL * 3), 3);
  const trap = new THREE.Shape(); trap.moveTo(-0.5, -0.5); trap.lineTo(0.5, -0.5); trap.lineTo(0.5 * (1 + RING_K), 0.5); trap.lineTo(-0.5 * (1 + RING_K), 0.5); trap.closePath();
  const ringMesh = new THREE.InstancedMesh(tileGeo(4, 0.25, 0.02, trap), [glazeMat(ringAttr, uRing), mirrorM], RING_TOTAL);
  ringMesh.frustumCulled = false; ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.add(ringMesh);
  // the frame's bed: a flush annulus of grout (0.309–0.391 m) the tiles seat on — it comes with the reveal, so the frame reads as one piece
  const ringWall = walls.map(() => 0);   // studio 26-11 (Beltrán: «saca los anillos que marcan el botón, ya daré la referencia»): no ring (was: round the round windows)
  const ringBeds = walls.map((w) => {
    const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.765 * 0.9, 0.606 * 0.9, 0.418 * 0.9), transparent: true, opacity: 0, depthWrite: false });   // #D9CFBE-ish joint
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.309, 0.391, 128, 1), m);
    mesh.position.copy(w.centre).addScaledVector(w.normal, -RING_D - 0.004); mesh.position.y = RING_Y; mesh.quaternion.copy(faceQ[w.index]); mesh.frustumCulled = false; object.add(mesh); return mesh;
  });
  for (const w of walls) RING_ROWS.forEach((rr_, row) => {
    const n = Math.round((2 * Math.PI * rr_) / RING_STEP), off = rr(0, 1), L = ((2 * Math.PI * rr_) / n - 0.003) / (1 + RING_K / 2);
    for (let k = 0; k < n; k++) {
      const u = rnd(), col = u < 0.125 ? GOLD : u < 0.6 ? PASTEL[0] : PASTEL[1];
      const far = new THREE.Vector3().copy(w.centre).addScaledVector(w.right, rr(-w.width * 0.4, w.width * 0.4)).addScaledVector(w.normal, -rr(0.8, 2.6)).setY(rr(0.4, 3.0));
      ringAttr.setXYZ(ring.length, col[0] * rr(0.96, 1.04), col[1] * rr(0.96, 1.04), col[2] * rr(0.96, 1.04));
      ring.push({ wall: w.index, k, r: rr_, sc: new THREE.Vector3(L * rr(0.97, 1.0), RING_W * rr(0.96, 1.0), 0.01), a0: ((k + off) / n) * Math.PI * 2, roll: rr(-0.015, 0.015), at: row * 0.15 + (k / n) * 0.45 + rr(0, 0.05), far, ph: rr(0, 6.28), axis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), spin: rr(0.2, 0.6), ex: new THREE.Vector3(rr(-1, 1), rr(-0.4, 1), 0) });
    }
  });

  // ---- the floor (T-058): SAND in the light of noon — the room's floor, then terraces that step away in soft curves (ref 04), with a
  // soft contact shadow at the foot of the serpentine (it turns: the shadow follows). Lit (the key rakes the terrace lips).
  const uHeroRot = uniform(0), uFar = uniform(1);
  // T-058b (ART): unlit, its values ACES-inverted so the screen shows them: sand #D9BC98, three soft terraces whose shadow is #CFAE88,
  // the contact shadow the same tone (never darker), melting into the horizon's #E9D2B4
  const ACES_SAND = [0.018, 0.026, 0.062], ACES_SHADE = [0.010, 0.015, 0.038], ACES_HORIZON = [0.030, 0.045, 0.105];   // studio 25-11 (Beltrán: «sin arena, todo el fondo azulado»): a night-blue ground (was sand #D9BC98 / #CFAE88 / #E9D2B4)
  const floorMesh = (() => {
    const { atan, length: len } = TSL;
    const m = new THREE.MeshBasicNodeMaterial({ fog: false });
    const pw = positionWorld, r = len(pw.xz), th = atan(pw.z, pw.x), ths = th.sub(uHeroRot);
    const ux = TSL.cos(th), uz = sin(th); let pn = float(0);
    for (const q of WK) pn = pn.add(max(ux.mul(-q.nx).add(uz.mul(-q.nz)), 0).div(q.k).pow(8));
    const Rs = pn.max(1e-6).pow(-1 / 8).add(OFF);                                       // the shell's foot (T-058c)
    const rw = r.add(sin(th.mul(3).add(r.mul(0.21))).mul(0.6)).add(sin(th.mul(7).add(1.3)).mul(0.2));
    let shade = float(0);
    for (const R0 of [10.8, 14.2, 18.5]) { const d = rw.sub(R0); shade = max(shade, smoothstep(-0.05, 0.12, d).mul(smoothstep(0.75, 0.12, d))); }   // a soft step: shade just past each lip
    const contact = exp(r.sub(Rs).div(0.5).pow(2).negate()).mul(step(r, Rs.add(0.2)));
    const grain = fract(sin(dot(floor(pw.xz.mul(40)), vec3(12.9898, 78.233, 0).xy)).mul(43758.5453)).sub(0.5).mul(0.03);
    const col = mix(vec3(...ACES_SAND), vec3(...ACES_SHADE), max(shade.mul(0.85), contact.mul(0.8))).mul(grain.add(1));
    m.colorNode = Fn(() => { TSL.If(r.lessThan(Rs.add(0.05)), () => { TSL.Discard(); }); return mix(col, vec3(...ACES_HORIZON), smoothstep(22, 58, r).mul(0.85)).mul(uFar); })();   // studio 25-11: no floor inside the shell (it goes on down)
    return new THREE.Mesh(new THREE.CircleGeometry(60, 96), m);
  })();
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = 0.0; object.add(floorMesh);
  const HX = Math.max(...walls.map((w) => Math.abs(w.centre.x))) + 0.18, HZ = Math.max(...walls.map((w) => Math.abs(w.centre.z))) + 0.18;

  // ---- the jambs of the four thresholds (until T-058): gold tiles set on edge round the opening, 0.7–1.3 m behind each wall. T-058: the
  // arches are ARC's (umbral3d/arches.js, loaded below); the old jambs stay behind a flag for a rollback (useOldJambs). The groups (frames)
  // are kept either way: they carry the 'start' push and the arrival scale.
  const useOldJambs = false;
  // (old) a splayed reveal of gold tiles set on edge, 0.7–1.3 m behind each
  // wall, exactly round the opening as the eye sees it, with a thread of embers along its inner rim
  const frames = walls.map((w) => {
    const dw = -((w.centre.x - eye.x) * w.normal.x + (w.centre.z - eye.z) * w.normal.z);
    const Pd = (x, sc, depth, out) => out.copy(w.centre).addScaledVector(w.right, x * DOOR_A * sc).setY(DOOR_H * sc * (1 - Math.abs(x) ** DOOR_P)).sub(eye).multiplyScalar((dw + depth) / dw).add(eye);
    const xs = [];                                                                       // stations at equal steps ALONG the arch
    { const dense = [], acc = [0], t = new THREE.Vector3(), u = new THREE.Vector3(); for (let k = 0; k <= 600; k++) dense.push(-1 + k / 300);
      for (let k = 1; k <= 600; k++) acc.push(acc[k - 1] + Pd(dense[k], 1, 1, t).distanceTo(Pd(dense[k - 1], 1, 1, u)));
      const SEG = 52; let j = 0; for (let k = 0; k <= SEG * 8; k++) { const want = (k / (SEG * 8)) * acc[600]; while (j < 599 && acc[j + 1] < want) j++; xs.push(dense[j] + (dense[j + 1] - dense[j]) * ((want - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]))); } }
    const pos = [], nor = [], col = [], rim = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    const ref = new THREE.Vector3().copy(w.centre).setY(1.2).sub(eye).multiplyScalar((dw + 1) / dw).add(eye);
    const quad = (a, b, c, d, tone) => {
      n.crossVectors(e.subVectors(b, a), D2.subVectors(d, a)).normalize(); if (n.dot(e.subVectors(ref, a)) < 0) n.negate();
      const warm = rr(-0.08, 0.08), cr = (GOLD[0] + warm * 0.2) * tone, cg = (GOLD[1] - warm) * tone, cb = GOLD[2] * tone * rr(0.6, 1.6);
      for (const p of [a, b, c, a, c, d]) { pos.push(p.x, Math.max(p.y, 0), p.z); nor.push(n.x, n.y, n.z); col.push(cr, cg, cb); }
    };
    const D2 = new THREE.Vector3(), M1 = new THREE.Vector3(), M2 = new THREE.Vector3();
    for (let k = 0; k < 52 * 8 - 2;) {                                                   // broken gold tiles of uneven length, some split across the depth of the jamb
      const len = Math.min(52 * 8 - k, Math.round(rr(3, 11))), x0 = xs[k], x1 = xs[k + Math.max(1, len - 1)]; k += len;
      Pd(x0, 1.08, 0.7, A); Pd(x1, 1.08, 0.7, B); Pd(x1, 0.91, 1.3, C); Pd(x0, 0.91, 1.3, D);
      if (Math.max(A.y, B.y) < 0.02) continue;
      const yw = DOOR_H * (1 - Math.abs((x0 + x1) / 2) ** DOOR_P), quietK = 1 - 0.55 * smooth(1.6, 1.85, yw);   // darker towards the words above
      if (rnd() < 0.4) { const u = rr(0.35, 0.65), g2 = 0.04; M1.lerpVectors(B, C, u - g2); M2.lerpVectors(A, D, u - g2); quad(A.clone(), B.clone(), M1.clone(), M2.clone(), rr(0.5, 1.2) * quietK); M1.lerpVectors(B, C, u + g2); M2.lerpVectors(A, D, u + g2); quad(M2.clone(), M1.clone(), C.clone(), D.clone(), rr(0.5, 1.2) * quietK); }
      else quad(A, B, C, D, rr(0.5, 1.2) * quietK);
    }
    for (let k = 0; k <= 52 * 8; k += 2) { Pd(xs[k], 0.91, 1.3, A); if (A.y > 0) rim.push(A.clone()); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const jambM = new THREE.MeshPhysicalNodeMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1.1, side: THREE.DoubleSide });
    jambM.emissiveNode = attribute('color', 'vec3').mul(0.2);                           // the gold holds its own light (the reveal faces the door, away from the lighthouse)
    const jamb = new THREE.Mesh(g, jambM);
    const emberRim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 160, 0.012, 5, false), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.4, 0.56, 0.12) }));
    // the group scales about the foot of the door (it grows from the floor when the part arrives)
    const foot = new THREE.Vector3().copy(w.centre).setY(0).sub(eye).multiplyScalar((dw + 1) / dw).add(eye); foot.y = 0;
    const grp = new THREE.Group(), pivot = new THREE.Group(); pivot.position.copy(foot);
    if (useOldJambs) for (const m of [jamb, emberRim]) { m.position.copy(foot).negate(); m.frustumCulled = false; pivot.add(m); } else { g.dispose(); jambM.dispose(); emberRim.geometry.dispose(); emberRim.material.dispose(); }
    grp.add(pivot); grp.userData.pivot = pivot; object.add(grp); return grp;
  });

  // ---- T-058: the four 3D arches are ARC's module (umbral3d/arches.js: createArches(ctx, { walls, env }) → { object, update(dt, state), dispose }).
  // Loaded if it is there (until then the doors are open cuts in the mosaic); it hangs from our object (the host's rig moves it with us).
  let arches = null, arcErr = false;
  const arcState = { arrive: 0, leave: 0, push: 0, reveal: 0, start: 0, time: 0, hands: [], doorA: DOOR_A, doorH: DOOR_H, doorP: DOOR_P };
  {
    const url = new URL('./umbral3d/arches.js', import.meta.url).href;
    fetch(url, { method: 'HEAD' }).then((r) => (r.ok ? import(url) : null)).then((mod) => {
      if (!mod?.createArches || !ARCH_FRAME) return;   // studio 25-11 (Beltrán): no frame — the opening is cut in the mosaic itself
      arches = mod.createArches(ctx, { walls, env, door: { A: DOOR_A, H: DOOR_H, P: DOOR_P }, depth: 0.04, thickness: 0.4, frontal: true }); if (arches?.object) object.add(arches.object);   // T-058c: the arch 0.12–0.52 m behind each wall, in front of the shell (OFF 0.6 m)
    }).catch((err) => { arcErr = String(err.message); console.info('umbral3d: arches not loaded (' + err.message + ')'); });
  }

  // ---- far (T-058): a PASTEL SAND noon — a creamy sky (#F3E6D3 above → #E9D2B4 at the horizon → #D9BC98 below), warm haze, low dunes and
  // terraces far away, a few vaults of sand stone in the haze (ref 04 / 03). Low contrast, high value: it never competes with the mosaic.
  // (No stars, no embers: the old glints / ember thread are gone.)
  const SKY_GAIN = 0.88;   // (the bloom adds a little to what is this bright)
  const uSkyK = uniform(1);   // (26-11 QA) the flat night fades with the leave: no flat blue band under the incoming square
  const skyMesh = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    m.colorNode = Fn(() => {
      const d = normalize(positionLocal), y = d.y;
      // studio 25-11 (Beltrán: «detrás del portal, un azul plano con unas motas de polvo»): one flat night blue, nothing else
      return vec3(0.012, 0.022, 0.066).mul(uSkyK);   // studio 26-11 (Beltrán: «que sean iguales, el oscuro me gusta más»): the joints' night (groutMesh) is this same blue
    })();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), m); mesh.renderOrder = -900; mesh.frustumCulled = false; return mesh;
  })();
  world.add(skyMesh);
  // studio 25-11: a few motes of dust in the night behind the portals, drifting slowly (one draw, no compute)
  // studio 26-11 (Beltrán: «más partículas detrás del título» · «que no giren, que sólo existan partículas detrás de cada ventana»): the motes
  // live ONLY in the night seen through each opening — points of the window carried back 6.5–16 m along the eye's ray — and are fixed (they
  // drift a little in place, they do not turn round the room). The title's wide window gets most of them; each round one, DUST_ROUND.
  // 26-11 later (Beltrán: «se quedará toda la sala azul, así que las partículas deben existir en todo el entorno»): DUST_ROOM more all round,
  // fixed as well (they show where the mosaic has gone)
  const DUST_WIDE = 900, DUST_ROUND = 160, DUST_ROOM = 1100, uDustT = uniform(0), uDustK = uniform(0);
  const dustOpen = OPEN.length ? OPEN : [{ wi: 1 % NW, cx: walls[1 % NW].width / 2, cy: 1.9, hw: 2.2, hh: 0.6 }];
  const DUST_N = DUST_ROOM + dustOpen.reduce((a, o) => a + (o.hw / o.hh >= 1.4 ? DUST_WIDE : DUST_ROUND), 0), dustP = new Float32Array(DUST_N * 4);
  { let i = 0;
    for (; i < DUST_ROOM; i++) { const a = rr(0, Math.PI * 2), r = rr(6.5, 16), y = rr(-0.6, 6); dustP.set([eye.x + Math.cos(a) * r, y, eye.z + Math.sin(a) * r, rnd()], i * 4); }
    for (const o of dustOpen) {
      const w = walls[o.wi], d = Math.abs((w.centre.x - eye.x) * w.normal.x + (w.centre.z - eye.z) * w.normal.z) || 3.2;   // the eye → the wall
      const cx = o.cx - w.width / 2, n = o.hw / o.hh >= 1.4 ? DUST_WIDE : DUST_ROUND;
      for (let j = 0; j < n; j++, i++) {
        const r = rr(6.5, 16), k = r / d, u = cx + rr(-1.1, 1.1) * o.hw, v = o.cy + rr(-1.15, 1.15) * o.hh;   // a point of the window, carried back to r
        const x = eye.x + (w.centre.x + w.right.x * u - eye.x) * k, z = eye.z + (w.centre.z + w.right.z * u - eye.z) * k, y = eye.y + (v - eye.y) * k;
        dustP.set([x, y, z, rnd()], i * 4);
      }
    } }
  function dustSprite(arr, n, parent) {
    const dAttr = new THREE.InstancedBufferAttribute(arr, 4), ip = TSL.instancedBufferAttribute(dAttr);
    const dm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false });
    dm.positionNode = ip.xyz.add(vec3(sin(uDustT.mul(0.11).add(ip.w.mul(40))).mul(0.6), sin(uDustT.mul(0.07).add(ip.w.mul(17))).mul(0.45), cos(uDustT.mul(0.09).add(ip.w.mul(29))).mul(0.6)));
    dm.scaleNode = TSL.vec2(0.035, 0.035).mul(ip.w.mul(0.9).add(0.5));   // studio 26-11 (Beltrán: «las partículas de atrás más pequeñas»): half (was 0.07)
    dm.colorNode = Fn(() => { const r = TSL.length(TSL.uv().sub(0.5)).mul(2), gs = exp(r.mul(r).mul(-4.5)); return vec4(vec3(0.62, 0.66, 0.82).mul(gs).mul(ip.w.mul(0.5).add(0.25)).mul(uDustK), 1); })();
    const dust = new THREE.Sprite(dm); dust.count = n; dust.frustumCulled = false; dust.renderOrder = -800; parent.add(dust); return dust;
  }
  dustSprite(dustP, DUST_N, object);                                               // fixed (not in the turning far world)
  const HAZE = vec3(0.022, 0.030, 0.070);   // studio 25-11: a night haze (was the sand noon's #EFDCC3)
  // dunes and terraces: rings of soft ridges, lit on their crests, hazier with distance
  function ridgeRing(R, h0, amp, seedK, hazeK) {
    const N = 320, pos = new Float32Array((N + 1) * 2 * 3), uvs = new Float32Array((N + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, h = h0 + amp * (0.55 + 0.25 * Math.sin(3 * a + seedK) + 0.15 * Math.sin(7 * a + seedK * 2.3) + 0.08 * Math.sin(13 * a + seedK * 0.7));
      const rr2 = R + 1.5 * Math.sin(5 * a + seedK);
      pos.set([Math.cos(a) * rr2, -0.5, Math.sin(a) * rr2, Math.cos(a) * rr2, h, Math.sin(a) * rr2], i * 6); uvs.set([i / N, 0, i / N, 1], i * 4);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    const v = TSL.uv().y, terr = fract(v.mul(4.5)), line = exp(terr.mul(terr).div(-0.004)).mul(0.12);
    m.colorNode = mix(mix(vec3(0.010, 0.012, 0.022), vec3(0.050, 0.060, 0.110), smoothstep(0.0, 0.95, v)).mul(float(1).sub(line)), HAZE, hazeK).mul(uFar);   // studio 25-11: dunes at night, moonlit crests
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  }
  const hazes = [ridgeRing(56, 2.5, 7, 0.4, 0.62), ridgeRing(38, 0.8, 3.2, 2.1, 0.42), ridgeRing(24, 0.1, 1.2, 4.2, 0.25)];
  for (const h of hazes) world.add(h);
  // a few far vaults of sand stone (parabolic ribs), half lost in the haze
  {
    const { normalWorld } = TSL;
    const vm = new THREE.MeshBasicNodeMaterial({ fog: false });
    const lit = dot(normalWorld, vec3(0.42, 0.62, 0.66).normalize()).mul(0.5).add(0.5);
    vm.colorNode = mix(mix(vec3(0.012, 0.014, 0.026), vec3(0.09, 0.10, 0.17), lit), HAZE, 0.45).mul(uFar);   // studio 25-11: the far vaults in the night
    for (const [a, R, H, A] of [[0.5, 30, 8.5, 3.4], [1.25, 33, 10, 4.2], [2.6, 29, 7.5, 3.0], [3.7, 34, 11, 4.4], [4.6, 31, 8, 3.2], [5.6, 35, 9.5, 3.9]]) {
      const pts = []; for (let k = 0; k <= 40; k++) { const x = -1.08 + (2.16 * k) / 40; pts.push(new THREE.Vector3(x * A, H * (1 - x * x), 0)); }
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.32 + H * 0.03, 8, false), vm);
      mesh.position.set(Math.cos(a) * R, -0.3, Math.sin(a) * R); mesh.lookAt(0, -0.3, 0); mesh.rotateY(Math.PI / 2 + rr(-0.5, 0.5)); world.add(mesh); hazes.push(mesh);
    }
  }
  // the near haze: a warm veil that thickens with distance (normal blending — the old additive blue haze is gone)
  for (const [R, H, a] of [[15, 14, 0.2], [26, 20, 0.3]]) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
    const y = TSL.uv().y; m.colorNode = HAZE.mul(uFar); m.opacityNode = exp(y.mul(-2.6)).mul(a).mul(uFar);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), m); mesh.position.y = H / 2 - 0.2; mesh.renderOrder = 2; world.add(mesh); hazes.push(mesh);
  }

  // ---- light: a zenith key, the LIGHTHOUSE that goes round the room, ember backlights behind the wall, the hands
  // T-058 (ART b): noon, soft — a warm key at ~52° elevation, raking; a cream / sand hemisphere fill (key:fill ≈ 2.5:1); no lighthouse, no embers
  const KEYS = { key: 0.3, fill: 0.45, spot: 1.3 };   // T-058b: the overhead spot is the key; the directional only a breath of sun
  const hemi = new THREE.HemisphereLight(0xf7ebdd, 0xe2c7a3, 1.0); object.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(4.2, 9.5, 6.0); object.add(key);
  const beam = new THREE.SpotLight(0xfff0dc, 0, 0, 0.5, 1, 0);   // cone 0.72 → 0.5 rad (24-11, ENT): the beam no longer washes the near mosaic beam.position.set(0, 5.2, 0); object.add(beam, beam.target);
  const beam2 = new THREE.SpotLight(0xfff1dc, 0, 0, 1.2, 0.25, 0); beam2.position.set(0, 7.5, 0); beam2.target.position.set(0, 0, 0); object.add(beam2, beam2.target);   // T-058b/c: THE KEY — from 7.5 m above the room's centre it reaches the near shell at ~30–35° (grazing): each tile shows a lit upper bevel and a shaded lower one
  const rims = [0, 1, 2].map((i) => { const l = new THREE.PointLight(0xdce8f0, 0, 15, 1.2); l.userData.a = (i / 3) * Math.PI * 2 + 0.4; world.add(l); return l; });
  const HL = 4, handLights = Array.from({ length: HL }, () => { const l = new THREE.PointLight(0xffd9b0, 0, 3.6, 1.6); object.add(l); return l; });

  // ------------------------------------------------------------------------------------------- sound: impacts on the channel
  let bc = null;
  try { bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { bc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxWindow = 0, fxCount = 0, fxSent = 0;
  const loc = { wall: 0, u: 0.5, x: 0, y: 0 };
  function locate(p) {                        // a point of the world → the wall it is drawn on, and where along it (the ray from the eye)
    let best = 1e9; loc.wall = 0; loc.u = 0.5;
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
    for (const w of walls) {
      const dn = dx * w.normal.x + dy * w.normal.y + dz * w.normal.z; if (dn > -1e-4) continue;
      const t = ((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z) / dn;
      if (t > 0 && t < best) { best = t; loc.wall = w.index; loc.x = (eye.x + dx * t - w.centre.x) * w.right.x + (eye.z + dz * t - w.centre.z) * w.right.z; loc.y = eye.y + dy * t; loc.u = clamp(0.5 + loc.x / w.width, 0, 1); }
    }
    return loc;
  }
  function fx(kind, p, strength, mat) {
    if (!bc || fxCount >= 16) return;
    fxCount++; fxSent++; locate(p);
    fxMsg.wall = loc.wall; fxMsg.u = loc.u; fxMsg.strength = clamp(strength, 0, 1); fxMsg.mat = MAT_NAME[mat] || 'ceramic'; fxMsg.kind = kind;
    try { bc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }

  // ------------------------------------------------------------------------------------------- temporaries (no allocation per frame)
  const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _hq = new THREE.Quaternion(), _v3 = new THREE.Vector3();

  function hangPose(s, outP, outQ) {
    const w = walls[s.wall];
    outP.copy(w.centre).addScaledVector(w.right, s.hx + s.L * Math.sin(s.ax)).addScaledVector(w.normal, -(s.hd + s.L * Math.sin(s.az)));
    outP.y = s.top - s.L * Math.cos(s.ax) * Math.cos(s.az);
    outQ.setFromAxisAngle(UP, s.baseYaw + s.yaw).premultiply(_q2.setFromAxisAngle(w.right, s.tilt)).multiply(faceQ[s.wall]).multiply(s.rollQ);
    outQ.premultiply(_q2.setFromAxisAngle(w.normal, s.ax)).premultiply(_q2.setFromAxisAngle(w.right, -s.az));
  }
  function cellPose(i, outP, outQ) { const c = cells[i]; outP.copy(c.c).applyAxisAngle(UP, hero.rotation.y); outQ.copy(_hq).multiply(c.q); }
  const homePose = (s, outP, outQ) => (s.role === 'band' ? hangPose(s, outP, outQ) : cellPose(s.cell, outP, outQ));
  function keepOut(s, p, v) {                 // loose things stay behind the walls (the mobiles' pieces: behind their own wall, before the serpentine)
    if (s.role === 'band') {
      const wl = walls[s.wall], d = _v2.subVectors(p, wl.centre).dot(wl.normal);
      if (d > -0.08) { p.addScaledVector(wl.normal, -0.08 - d); const vn = v.dot(wl.normal); if (vn > 0) v.addScaledVector(wl.normal, -1.6 * vn); }
      const x = _v2.subVectors(p, wl.centre).dot(wl.right), half = wl.width / 2 - 0.1;
      if (Math.abs(x) > half) { p.addScaledVector(wl.right, Math.sign(x) * half - x); const vr = v.dot(wl.right); if (vr * x > 0) v.addScaledVector(wl.right, -1.5 * vr); }
      if (d < -1.5) { p.addScaledVector(wl.normal, -1.5 - d); const vn = v.dot(wl.normal); if (vn < 0) v.addScaledVector(wl.normal, -1.5 * vn); }
    } else if (Math.abs(p.x) < HX && Math.abs(p.z) < HZ) {
      if (HX - Math.abs(p.x) < HZ - Math.abs(p.z)) { const sg = Math.sign(p.x) || 1; p.x = sg * HX; if (v.x * sg < 0) v.x *= -0.5; }
      else { const sg = Math.sign(p.z) || 1; p.z = sg * HZ; if (v.z * sg < 0) v.z *= -0.5; }
    }
  }
  function integrateFree(p, v, q, w, dt, s, hh) {
    v.y -= G * dt; v.multiplyScalar(Math.exp(-0.12 * dt)); p.addScaledVector(v, dt);
    const sp = w.length(); if (sp > 1e-4) q.premultiply(_q.setFromAxisAngle(_v.copy(w).divideScalar(sp), sp * dt));
    keepOut(s, p, v);
    return p.y < hh;
  }
  function breakTile(s, speed) {
    s.state = 3; s.timer = rr(4, 6.5);
    let n = 0; const want = s.sc.x > 0.45 ? 7 : 5;
    for (let i = 0; i < CHIPS; i++) {
      const c = chips[i]; if (c.on) continue;
      c.on = true; c.owner = s; c.rest = false; c.p.copy(s.p); c.p.y = 0.03;
      c.v.set(rr(-1, 1), 0, rr(-1, 1)).normalize().multiplyScalar(rr(0.6, 2.0) * Math.min(1.4, speed / 4)); c.v.y = rr(0.8, 2.2) * Math.min(1.3, speed / 4);
      c.w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(14); c.q.copy(s.q); c.s = s.sc.x * rr(0.3, 0.48);
      chipAttr.setXYZ(i, s.color[0], s.color[1], s.color[2]);
      if (++n >= want) break;
    }
    chipAttr.needsUpdate = true;
  }
  // a loose piece (states: 1 falling, 2 at rest, 3 at rest in chips, 4 / 5 going home — 5: its chips gather first); true when it is home
  const LOOSE_DROP = 0.55, BREAK_CHIPS = false;
  function stepLoose(s, dt) {
    if (s.state === 1) {
      const hh = s.sc.z * 0.1 + 0.008 - LOOSE_DROP;   // studio 25-11 (Beltrán): they fall ~0.5 m below what the camera sees, so they never pile up on screen
      if (integrateFree(s.p, s.v, s.q, s.w, dt, s, hh)) {
        const iv = -s.v.y;
        s.p.y = hh;
        if (BREAK_CHIPS && iv > 4.3 && rnd() < 0.62) { fx('break', s.p, clamp(iv / 7, 0.5, 1), s.kind); breakTile(s, iv); }   // studio 25-11: no chips (particles) — a fallen tile just goes
        else {
          if (iv > 0.5) fx('floor', s.p, clamp(iv / 6, 0.08, 1), s.kind);
          if (!s.landed) { s.landed = true; s.flat.setFromUnitVectors(_v.set(0, 0, 1), rnd() < 0.7 ? UP : _v2.set(0, -1, 0)).premultiply(_q.setFromAxisAngle(UP, rr(0, 6.28))); }
          s.v.y = iv * 0.38; s.v.x *= 0.86; s.v.z *= 0.86; s.w.multiplyScalar(0.55); if (iv > 1) s.w.addScaledVector(_v.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)), iv * 1.2);
        }
      }
      if (s.state === 1 && s.landed && s.p.y <= hh + 0.02 && Math.abs(s.v.y) < 0.45) {       // skating on the gloss, settling
        s.v.y = 0; s.p.y = hh; s.v.multiplyScalar(Math.exp(-dt * 0.85)); s.w.multiplyScalar(Math.exp(-dt * 5)); s.q.slerp(s.flat, 1 - Math.exp(-dt * 7));
        if (s.v.lengthSq() < 0.006) { s.state = 2; s.timer = rr(3, 6); s.landed = false; }
      }
    } else if (s.state === 2 || s.state === 3) {
      s.timer -= dt * (1 + 2 * revealV);
      if (s.timer <= 0) { s.state = s.state === 3 ? 5 : 4; s.timer = 0; s.from.copy(s.p); s.fromQ.copy(s.q); if (s.role === 'band') { s.ax = rr(-0.1, 0.1); s.az = 0; s.vax = 0; s.vaz = 0; s.yaw = 0; s.vyaw = rr(-2, 2); } }
    } else if (s.state === 4 || s.state === 5) {
      s.timer += dt;
      const gatherT = s.state === 5 ? 0.9 : 0, k = smooth(0, 1, (s.timer - gatherT) / 2.4);
      homePose(s, _v, _q);
      s.p.lerpVectors(s.from, _v, k * k * (3 - 2 * k)); s.p.y += Math.sin(k * Math.PI) * 0.7;
      s.q.slerpQuaternions(s.fromQ, _q, k).premultiply(_q2.setFromAxisAngle(s.spinAxis, (1 - k) * 6));
      if (s.timer - gatherT >= 2.4) { s.state = 0; fx('hook', s.p, 0.12, s.kind); return true; }
    }
    return false;
  }
  function hitBand(s, dirX, power, fresh, t) {
    s.lastHit = t; s.hits = t - s.lastHitBurst < 4 ? s.hits + 1 : 1; s.lastHitBurst = t;
    const heavy = s.mother ? 0.55 : 1;
    s.vax += dirX * (0.5 + 0.9 * power) / Math.sqrt(s.L) * heavy; s.vaz += (0.35 + 0.8 * power) / Math.sqrt(s.L) * heavy;
    s.vyaw += (rnd() < 0.5 ? -1 : 1) * (3 + 8 * power) * heavy;
    s.tintT = t + 22;                                                                   // touched: it shows its glaze for a while
    hangPose(s, _v, _q); fx('hit', _v, 0.25 + 0.5 * power, s.kind);
    if (fresh && (s.hits >= 2 || rnd() < (s.mother ? 0.3 : 0.45) + 0.25 * power)) {
      const w = walls[s.wall];
      s.state = 1; s.timer = 0; s.landed = false;
      s.v.copy(w.right).multiplyScalar(dirX * rr(0.4, 1.2) + s.vax * s.L * 0.6).addScaledVector(w.normal, -(rr(0.5, 1.3) + s.vaz * s.L * 0.6)); s.v.y = rr(0.6, 1.8);
      s.w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize().multiplyScalar(rr(3, 9) * (s.mother ? 0.6 : 1));
    }
  }
  // a piece of the serpentine lets go: it leaves its bed (the dark mortar shows) and becomes a body that falls towards the public
  function letGo(i, power) {
    if (gone[i] || cells[i].loose) return false;
    cellPose(i, _v, _q); locate(_v);                                                    // folded away in a door: nothing to fall
    if (openD(loc.wall, loc.x / uDoor.value, loc.y / uDoor.value) < 0.1) return false;
    let b = null; for (const s of bodies) if (s.state === 0 && s.cell < 0) { b = s; break; }
    if (!b) return false;
    const c = cells[i];
    gone[i] = 1; goneN++; b.cell = i; b.state = 1; b.timer = 0; b.landed = false;
    cellPose(i, b.p, b.q); 
    const size = clamp(c.rad * 2.1, 0.06, 0.42); b.sc.set(size * rr(0.85, 1.15), size * rr(0.85, 1.15), size * 0.45);
    _v.copy(c.n).applyAxisAngle(UP, hero.rotation.y);                                   // towards the public
    b.p.addScaledVector(_v, 0.12);
    b.v.copy(_v).multiplyScalar(rr(0.3, 0.8) * power).add(_v2.set(rr(-0.5, 0.5), rr(0.6, 1.6) * power, rr(-0.5, 0.5)));   // T-058c: a short drop in front of the shell   // out of the wall, up and towards the public: it grows as it comes
    b.w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize().multiplyScalar(rr(3, 9));
    b.color[0] = c.col[0]; b.color[1] = c.col[1]; b.color[2] = c.col[2]; paint(b);
    return true;
  }
  function later(i, at, power) { for (const e of queue) if (!e.on) { e.on = true; e.cell = i; e.at = at; e.power = power; return; } }
  // the cascade: the column above a point lets go in a chain, from the point up to the crest
  function cascade(cu, cy, t) {
    let n = 0;
    if (goneN > 200) return 0;
    for (let i = 0; i < NC && n < 30; i++) {
      const c = cells[i]; if (gone[i] || c.loose || c.cy < cy - 0.35) continue;
      const du = Math.abs(wrapU(c.cu - cu)); if (du > 0.34 + (c.mother ? 0.12 : 0)) continue;
      if (rnd() < 0.2) continue;
      later(i, t + Math.max(0, c.cy - cy) * 0.12 + rr(0, 0.05), 0.8 + 0.4 * rnd()); n++;
    }
    return n;
  }
  // the piece of the mosaic nearest a point (-1: none within 1.6 m)
  const nearC = new Map();   // stroke → { cu, cy, i }: the last nearest() of each hand
  function nearest(cu, cy) {
    let best = 2.56, bi = -1;
    for (let i = 0; i < NC; i++) { const c = cells[i]; if (c.loose) continue; const du = wrapU(c.cu - cu), dy = c.cy - cy, d = du * du + dy * dy - (c.mother ? 0.12 : 0); if (d < best) { best = d; bi = i; } }
    return bi;
  }
  // a knock: the pieces round a point let go in a SPIRAL, from the point outwards (a rosette comes undone petal by petal)
  const spiralI = new Int32Array(64), spiralK = new Float32Array(64);
  function knock(cu, cy, r, max_, power, t) {
    if (goneN > 220) return 0;
    let n = 0;
    for (let i = 0; i < NC && n < 64; i++) {
      const c = cells[i]; if (gone[i] || c.loose) continue;
      const du = wrapU(c.cu - cu), dy = c.cy - cy, dd = du * du + dy * dy; if (dd > r * r) continue;
      spiralI[n] = i; spiralK[n] = Math.sqrt(dd) / r + ((Math.atan2(dy, du) / 6.2832 + 1) % 1) * 0.3; n++;
    }
    let done = 0;
    for (let k = 0; k < max_ && k < n; k++) {                                            // the next along the spiral, max_ times
      let b = -1, bk = 9; for (let j = 0; j < n; j++) if (spiralK[j] < bk) { bk = spiralK[j]; b = j; }
      if (b < 0) break; spiralK[b] = 99;
      if (k === 0) { if (letGo(spiralI[b], power)) done++; } else { later(spiralI[b], t + k * 0.03, power); done++; }
    }
    return done;
  }

  // a hand lands on the serpentine (surfHit done): the wave, the colour through its rosette, and pieces come down in a spiral
  function land(pos, under, hold) {
    const ros = under >= 0 ? cells[under].ros : -1, onHeart = under >= 0 && cells[under].mother;
    launch(hit.cu, hit.cy, 1, 2.6, 7, hold, ros);
    if (knock(hit.cu, hit.cy, (onHeart ? 0.7 : 0.5) * HR, onHeart ? 20 : 13, 1, time)) fx('hit', pos, onHeart ? 0.9 : 0.6, 0);
  }

  // ------------------------------------------------------------------------------------------- the stand-in score (study page)
  let own = null, ownAfter = 0;
  const ownHands = Array.from({ length: 32 }, () => ({ stroke: null, wall: 0, dx: 0, speed: 0 })), ownList = [];

  // ------------------------------------------------------------------------------------------- state
  let time = 0, emptyT = 99, ghostAt = 2.5, rot = 0, heroRot = 0, ringSpin = 0, exploded = -1, revealV = 0, startV = 0, idleC = 0, wasRevealed = false, figT0 = -1, figK = 0, cascades = 0, crossings = 0, goneN = 0, pushV = 0, wasWait = true;
  const figAt = Array.from({ length: NW }, () => ({ cu: 0, cy: 0 }));
  const MAXH = 12, hhy = new Float32Array(MAXH), hcu = new Float32Array(MAXH), hcy = new Float32Array(MAXH), hfresh = new Uint8Array(MAXH), hsp = new Float32Array(MAXH), hvu = new Float32Array(MAXH), hvv = new Float32Array(MAXH);   // hsp: studio 25-11, the hand's speed (m/s)
  const HOLD = Array.from({ length: 16 }, () => ({ stroke: null, seen: -9, t0: 0, cu: 0, cy: 0, next: 0, ros: -1, lu: 0, lv: 0 }));
  function holdOf(stroke) {
    let free = null;
    for (const h of HOLD) { if (h.stroke === stroke) return h; if (!free && (h.stroke === null || time - h.seen > 1)) free = h; }
    if (free) { free.stroke = stroke; free.t0 = time; free.next = 0.6; free.cu = -99; free.ros = -1; }
    return free;
  }

  function update(dt, input) {
    dt = Math.min(dt, 0.05); time += dt;
    const P = input.params || params || {};
    const hands = input.hands || [], downs = input.downs || [];
    const S = input.state;
    const arrive = S ? num(input.arrive, 1) : num(P.arrive, 1), leave = S ? num(input.leave, 0) : num(P.leave, 0);
    const motion = num(P.motion, 1);
    fxWindow += dt; if (fxWindow > 1) { fxWindow = 0; fxCount = 0; }

    // ---- reveal / start: from the score, or the study's own score, or fixed values
    let reveal, start, startEv = false;
    if (S) {
      reveal = S.block === 'wait' ? num(S.reveal, 0) : 1; start = S.block === 'wait' ? num(S.start, 0) : 1;
      if (input.events) for (const e of input.events) if (e === 'start') startEv = true;
      // the host's tiles carry the change of block (its `leave` waits behind them): the way out starts the moment the block is no longer
      // 'wait' — also on a jump — and is forgotten when the part comes back
      if (S.block !== 'wait' && wasWait && exploded < 0) startEv = true;
      if (S.block === 'wait' && !wasWait) { exploded = -1; pushV = 0; resetPaint(); }
      wasWait = S.block === 'wait';
    } else if (num(P.reveal, -1) >= 0) { reveal = P.reveal; start = Math.max(0, num(P.start, 0)); }
    else {
      if (!own) own = createScore(NW);
      ownList.length = 0;
      for (const h of hands) { if (ownList.length >= ownHands.length) break; const o = ownHands[ownList.length]; o.stroke = h.stroke; o.wall = h.wall; o.dx = (h.u - 0.5) * walls[h.wall].width; o.speed = Math.hypot(h.vx, h.vy); ownList.push(o); }
      if (own.state.block !== 'wait') { ownAfter += dt; if (ownAfter > 7) { own.jump('wait'); ownAfter = 0; exploded = -1; } }
      own.step(dt, own.state.block === 'wait' ? ownList : []);
      for (const e of own.state.events) if (e === 'start') startEv = true;
      own.state.events.length = 0;
      reveal = own.state.block === 'wait' ? own.state.reveal : 1; start = own.state.block === 'wait' ? own.state.start : 1;
      if (num(P.start, -1) >= 0) start = P.start;
    }
    if (PERSIST && reveal >= 0.999 && waveT0 < 0 && (!S || S.block === 'wait')) { waveT0 = time; waveS = lastPaint >= 0 ? CU[lastPaint] : CU[0] || 0; }
    revealV += (reveal - revealV) * (1 - Math.exp(-dt * 2.5)); startV += (start - startV) * (1 - Math.exp(-dt * 6));
    const playing = arrive > 0.6 && leave < 0.3;

    // ---- the room moves: the serpentine turns round the public, the far world the other way, and breathes
    hero.rotation.y = heroRot;   // T-058c: the shell follows the room — it no longer turns (the far world still does)
    _hq.setFromAxisAngle(UP, heroRot);
    rot -= dt * 0.011 * motion; world.rotation.y = rot; world.position.y = Math.sin(time * (Math.PI * 2 / 26)) * 0.3 * motion;
    const ba = time * (Math.PI * 2 / 26);                                               // the lighthouse: two lights, once round the room every 26 s
    beam.target.position.set(Math.cos(ba) * 9, 2.2, Math.sin(ba) * 9);

    // ---- the reveal is whole: resonance (the figure spreads from the four buttons); 'start': the biggest wave
    if (reveal >= 1 && !wasRevealed && playing) {
      figT0 = time;
      for (let i = 0; i < NW; i++) { const w = walls[i]; surfHit(_v.copy(w.centre).setY(RING_Y)); figAt[i].cu = hit.cu; figAt[i].cy = hit.cy; if (!PERSIST) launch(hit.cu, hit.cy, 0.9, 3.4, 0, 0); }   // (26-11: with the rings closing on the windows, no outward pulses)
    }
    if (reveal < 1) figT0 = -1;
    wasRevealed = reveal >= 1 && (wasRevealed || playing);   // (T-058c: a reveal reached while the part was still arriving starts the figure once it plays)
    if (startEv) { exploded = 0; for (let i = 0; i < NW; i++) { surfHit(_v.copy(walls[i].centre).setY(RING_Y)); launch(hit.cu, hit.cy, 1.6, 5, 99, 30); } }
    if (exploded >= 0) exploded += dt;
    // 'start' (and the way out): the world closes in round the eye, eased, 2.5 s — every wall walks through its own door
    const pushT = Math.max(exploded >= 0 ? smooth(0, 2.5, exploded) : 0, smooth(0, 0.7, leave));
    pushV += (pushT - pushV) * (1 - Math.exp(-dt * (pushT > pushV ? 30 : 1.2)));
    uPush.value = PUSH * pushV; uDoor.value = 1 + 3.2 * pushV * pushV;
    for (let i = 0; i < NW; i++) { const d = frames[i], k = 1 - smooth(0.75, 1, Math.max(pushV, leave)); d.position.copy(walls[i].normal).multiplyScalar(PUSH * pushV); d.userData.pivot.scale.setScalar(Math.max(0.001, smooth(0.3, 0.9, arrive) * k)); d.visible = arrive * k > 0.01; }
    const hold = 7;                                                                     // T-058b (ART): a touched piece goes back to rest in 6–8 s

    // ---- hands: light, waves, knocks, cascades; the mobiles
    emptyT = hands.length ? 0 : emptyT + dt;
    let nh = 0;
    for (let i = 0; i < HL; i++) { const l = handLights[i]; if (!hands[i]) l.intensity *= Math.exp(-dt * 4); }
    for (let i = 0; i < uHandP.length; i++) if (!hands[i] || !playing) uHandP[i].value.w *= Math.exp(-dt * 3);   // a lifted hand's warmth fades in ~0.6 s
    if (playing) {
      for (const h of hands) {
        const w = walls[h.wall], hx = _v.subVectors(h.pos, w.centre).dot(w.right), hy = h.pos.y;
        const fresh = downs.includes(h), speed = Math.hypot(h.vx, h.vy);
        // a hand in the threshold (there is no mosaic there) plays the edge of the door nearest to it
        const oh = OPEN.length ? openHalfW(h.wall, hx, hy) : [0, hy < DOOR_H ? DOOR_A * Math.pow(1 - hy / DOOR_H, 1 / DOOR_P) : 0];
        if (oh && openD(h.wall, hx, hy) < 0.12) surfHit(_v3.copy(h.pos).addScaledVector(w.right, oh[0] + (hx < oh[0] ? -1 : 1) * (oh[1] + 0.38) - hx)); else surfHit(h.pos);
        if (nh < MAXH) { hhy[nh] = hy; hcu[nh] = hit.cu; hcy[nh] = hit.cy; hfresh[nh] = fresh ? 1 : 0; hsp[nh] = speed; hvu[nh] = h.vx * wallSgn[h.wall] * 1.15; hvv[nh] = h.vy * 1.15; nh++; }
        if (nh <= HL) { const l = handLights[nh - 1]; l.position.copy(hit.p).multiplyScalar(0.9); l.position.y = hit.p.y + 0.15; l.intensity += (HAND_LIGHT * arrive * (1 - leave) - l.intensity) * (1 - Math.exp(-dt * 18)); }   // studio 25-11: brighter (was 2.0)
        if (nh <= uHandP.length) { const U = uHandP[nh - 1].value; U.set(hit.p.x, hit.p.y, hit.p.z, U.w + ((fresh ? 1.4 : 1) * arrive * (1 - leave) - U.w) * (1 - Math.exp(-dt * 25))); }
        // (26-11 perf) nearest() scans every stone (~0.6 ms): a hand that has moved < 3 cm keeps its stone (the result is the same piece)
        let nc = nearC.get(h.stroke); if (!nc) { nc = { cu: 1e9, cy: 1e9, i: -1 }; nearC.set(h.stroke, nc); if (nearC.size > 64) nearC.clear(); }
        { const du = wrapU(hit.cu - nc.cu), dv = hit.cy - nc.cy; if (du * du + dv * dv > 0.0009 || (nc.i >= 0 && cells[nc.i].loose)) { nc.i = nearest(hit.cu, hit.cy); nc.cu = hit.cu; nc.cy = hit.cy; } }
        const under = nc.i, ros = under >= 0 ? cells[under].ros : -1;
        // QA (T-058c): the LiDAR may drop a still hand and give it a new stroke ~every 2 s — a landing within ~0.15 m (on the wall) of a hand
        // that left < 0.5 s ago is the same hand: no new wave, knock or sound, and it keeps that hand's hold
        let reland = null;
        if (fresh) for (const o of HOLD) { if (o.stroke === null || o.stroke === h.stroke || time - o.seen > 0.5 || time - o.seen < dt * 1.5) continue; const du = wrapU(hit.cu - o.lu), dv = hit.cy - o.lv; if (du * du + dv * dv < 0.05) { reland = o; break; } }
        if (fresh && !reland) land(h.pos, under, hold);
        if (reland && nh > 0) hfresh[nh - 1] = 0;
        const hd = holdOf(h.stroke);
        if (hd && reland && hd !== reland) { hd.t0 = reland.t0; hd.next = reland.next; hd.cu = reland.cu; hd.cy = reland.cy; hd.ros = reland.ros; reland.stroke = null; }
        if (hd) { hd.lu = hit.cu; hd.lv = hit.cy; }
        if (hd) {
          if (!fresh && ros >= 0 && ros !== hd.ros) launch(hit.cu, hit.cy, 0.55, 2.6, 7, hold, ros);   // it moves into another rosette: that one takes colour too
          hd.ros = ros;
          const du = wrapU(hit.cu - hd.cu), dy = hit.cy - hd.cy;
          if (du * du + dy * dy > 0.2) { hd.cu = hit.cu; hd.cy = hit.cy; hd.t0 = time; hd.next = 0.6; }   // it moved (in the serpentine's own frame, which turns): start again
          else if (time - hd.t0 > hd.next) { hd.next += 3.5; hd.cu = hit.cu; if (cascade(hit.cu, hit.cy, time)) { cascades++; launch(hit.cu, hit.cy, 0.7, 3.2, 0, 0); fx('hit', h.pos, 0.9, 0); } }
          hd.seen = time;
        }
        for (const s of band) {
          if (s.wall !== h.wall || s.state !== 0) continue;
          const tx = s.hx + s.L * Math.sin(s.ax), r = 0.26 + s.sc.x * 0.5, dx = tx - hx, dy = s.p.y - hy;
          if (dx * dx + dy * dy > r * r) continue;
          if (fresh) hitBand(s, dx >= 0 ? 1 : -1, 1, true, time);
          else if (time - s.lastHit > 0.45 && speed > 0.12) hitBand(s, Math.sign(h.vx || dx) || 1, clamp(speed / 1.2, 0, 1) * 0.7, false, time);
        }
      }
    }
    // ---- the idle loop: nobody there → a ghost hand plays now and then (a bloom of colour, sometimes a cascade, a mobile that swings)
    if (emptyT > 3 && playing) {
      ghostAt -= dt;
      if (ghostAt <= 0) {
        ghostAt = rr(2.6, 5.2);
        const cu = rr(0, LL), cy = rr(0.7, 2.6), u = rnd();
        const under = nearest(cu, cy);
        if (under >= 0 && cy < crest(cu)) {
          launch(cu, cy, 0.5, 2.2, 0, 0);                                            // T-058b (ART): the idle play is a soft wave — no colour, no fall
          surfP(cu, cy, _v).applyAxisAngle(UP, heroRot);
        }
        const s = band[Math.floor(rnd() * band.length)];
        if (s && s.state === 0 && u > 0.5) { s.vax += rr(-0.5, 0.5); s.vyaw += rr(-3, 3); }
      }
    }
    // ---- the chain: pieces whose turn has come let go
    for (const e of queue) if (e.on && time >= e.at) { e.on = false; if (letGo(e.cell, e.power) && rnd() < 0.3) { cellPose(e.cell, _v, _q); fx('hit', _v, 0.3, 0); } }

    // ---- the mosaic: every piece follows the waves on a spring; colour where the play has been; light where waves cross
    idleC = (idleC + dt * 1.5) % LL; uIdleT.value = time;
    for (const p of pulses) if (p.on) { const age = time - p.t0; if (age > LL / 2 / p.speed + 2.5 || p.amp * Math.exp(-age / 7) < 0.03) p.on = false; }
    // studio 26-11 (Beltrán: «cuando se activa la sala, el anillo que recorre la sala debe suceder una sola vez»): with the narrative (PERSIST) the
    // opening is ONE pass — the wave that paints the rest and the four pulses from the buttons — not the figure's endless rings round them
    const figOn = !PERSIST && figT0 >= 0 && arrive > 0.6, figR = figOn ? (time - figT0) * 4.2 : 0, figPh = time * 0.55;
    if (figOn) for (let k = 0; k < NW; k++) { surfHit(_v.copy(walls[k].centre).setY(RING_Y)); figAt[k].cu = hit.cu; figAt[k].cy = hit.cy; }   // the serpentine turns: the figure stays on the buttons
    figK += ((figOn ? 1 : 0) - figK) * (1 - Math.exp(-dt * 1.5));
    let npa = 0; const settled = arrive >= 1 && leave <= 0;
    for (let k = 0; k < PULSES; k++) { const p = pulses[k]; if (!p.on) continue; const age = time - p.t0, r = p.speed * age, amp = p.amp * Math.exp(-age / 7); if (amp < 0.004) continue; /* (26-11 perf) a spent pulse (its bump ≤ 0.004 → ≤ 0.1°) no longer keeps ~10k stones awake */ pa[npa++] = k; paR[k] = r; paMax[k] = r + 1.43; paMin2[k] = r > 1.43 ? (r - 1.43) * (r - 1.43) : 0; paAmp[k] = amp; }
    const kSpring = 30, cSpring = 6.2, glowDecay = Math.exp(-dt * 1.3), startGlow = PERSIST ? 0 : startV * 0.7 + (exploded >= 0 && exploded < 2 ? Math.sin(exploded * Math.PI / 2) * 0.8 : 0);   // (26-11: the charge lights nothing white — «trazos blancos de la nada»)
    if (nh > 0) lastHandT = time;
    if (PERSIST && paintedN > 0 && time - lastHandT > RESET_AFTER && (!S || S.block === 'wait') && clearT0 < 0 && !btns.some((b) => b.t0 >= 0)) unpaint();
    // ---- the buttons and the charge (see THE BUTTONS)
    events.length = 0;
    const openNow = PERSIST && waveT0 >= 0 && time - waveT0 > (dB ? R0W / WIN_V - 0.4 : 1.2) && (!S || S.block === 'wait') && clearT0 < 0;
    if (openNow && !wasOpen) events.push('open'); wasOpen = openNow;
    for (const b of btns) {
      if (!b.seen) { surfHit(_v.copy(b.w.centre).addScaledVector(b.w.right, b.cx).setY(b.o.cy)); b.cu = hit.cu; b.cv = hit.cy; b.seen = new Uint16Array(NC); }
      let inside = false;
      if (openNow && playing) for (const h of hands) {
        if (h.wall !== b.w.index) continue;
        const hx = _v2.subVectors(h.pos, b.w.centre).dot(b.w.right) - b.cx, hy = h.pos.y - b.o.cy;
        if (hx * hx + hy * hy < (b.r + 0.12) * (b.r + 0.12)) { inside = true; break; }
      }
      if (inside) { b.offT = 0; if (b.t0 < 0) { b.t0 = time; b.gen = (b.gen % 65000) + 1; events.push('charge:' + b.w.index); } }   // studio 26-11 (Beltrán): the ring is BORN at the button and spreads (a band of turning stones, below)
      else if (b.t0 >= 0 && (b.offT += dt) > 0.35) { events.push('uncharge:' + b.w.index); if (b.pulse >= 0) { const p = pulses[b.pulse]; if (p.t0 === b.t0) p.on = false; b.pulse = -1; } b.t0 = -1; }   // let go (0.35 s of grace): the ring and its charge are lost
      b.R = b.t0 >= 0 ? (time - b.t0) * CHARGE_V : 0;   // (26-11: the same band as the opening, slower)
      const showTo = openNow && b.t0 < 0 ? 1 : 0, glowTo = b.t0 >= 0 ? 1 : 0;
      b.show += (showTo - b.show) * Math.min(1, dt * 3.5); b.glow += (glowTo - b.glow) * Math.min(1, dt * 5);
      for (let j = 0; j < 4; j++) {
        // studio 26-11 (Beltrán: «parten muy grandes; un poco más pequeños, apagándose siempre al llegar a la ventana»): from ~0.6 m outside
        // the window's edge, closing in, and each one goes out exactly as it reaches the edge
        const ph = (time * 0.4 + j / 4) % 1, rad = b.r + 0.02 + 0.6 * Math.pow(1 - ph, 1.25);
        b.uR[j].value = rad; b.uA[j].value = smooth(0, 0.2, ph) * smooth(0.02, 0.14, rad - b.r) * b.show * 0.9;
      }
      b.uHand.value = b.show * (0.88 + 0.12 * Math.sin(time * 2.2)); b.uGlow.value = b.glow;
    }
    if (!dB && btns.length && btns.every((b) => b.seen)) {                            // once: every stone's distance to its nearest button
      dB = new Float32Array(NC); dBr = new Float32Array(NC); let mx = 0;
      for (let i = 0; i < NC; i++) {
        let best = 1e9, br = 0.4;
        for (const b of btns) { let d = CU[i] - b.cu; if (d > HL2) d -= LL; else if (d < -HL2) d += LL; const e = Math.hypot(d, CY[i] - b.cv); if (e < best) { best = e; br = b.r; } }
        dB[i] = best; dBr[i] = br; if (!cells[i].loose && cells[i].vis && best > mx) mx = best;
      }
      R0W = mx + 0.4;
    }
    chargeCov = clearT0 < 0 ? coverOf() : 1;
    if (clearT0 < 0 && chargeCov >= 0.999) { events.push('cleared'); clearT0 = time; for (let i = 0; i < NC; i++) fallDelay[i] = rnd() * rnd() * 1.4; for (const b of btns) b.t0 = -1; }
    uTitleK.value = clearT0 >= 0 ? 1 - smooth(clearT0 + 0.2, clearT0 + 1.8, time) : 1;
    const bedK = smooth(0, 0.45, arrive) * (1 - smooth(0.35, 1, leave));
    uBed.value = bedK * (clearT0 >= 0 ? 1 - smooth(clearT0 + 0.6, clearT0 + 2.6, time) : 1);   // studio 26-11: CLEAR — the joints' bed crumbles away too: the night and all its dust
    if (maskDirty) { maskData.fill(0); maskDirty = false; maskTex.needsUpdate = true; }
    for (let i = 0; i < NC; i++) {
      const c = cells[i], o = i * 4;
      let target, lift, sc = 1, turn, kc = 0;
      if (c.loose) {                                                                    // the crest dissolves: these float, turning slowly
        turn = time * (0.12 + c.r1 * 0.3) * (c.r2 < 0.5 ? -1 : 1) + c.r1 * 6.28;
        lift = 0.15 + c.over * (0.5 + c.r2) + Math.sin(time * 0.31 + c.r1 * 6.28) * 0.12; sc = 1 - 0.55 * c.over;
      } else {
        const cu_ = CU[i], cy_ = CY[i];
        if (clearT0 >= 0 && time - clearT0 > fallDelay[i]) {                             // CLEAR: every stone lets go at its own moment (until then it lives on as it was)
          const tc = time - clearT0 - fallDelay[i], oo = i * 4;
          offData[oo] = Math.sin(c.r1 * 40) * 0.25 * tc; offData[oo + 1] = -3.2 * tc * tc; offData[oo + 2] = 0.35 * tc; wOn[i] = 0; windDirty = true;
          if (tc < dt * 1.5 && rnd() < 0.08) fx('hit', c.c, 0.55 + 0.3 * c.r2, 0);
          stData[o] = (phi[i] * 2 + tc * 7 * (c.r2 < 0.5 ? -1 : 1)) % 6.2831853; stData[o + 2] = colT[i] > time ? 8 : 0;   // (the lift it had stays: no jump) stData[o + 3] = tc < 1.6 ? 1 : 0;
          continue;
        }
        if (rub[i] > 0) rub[i] *= Math.exp(-dt * 0.25);
        let ds = IDLE_CURL ? 1e9 : cu_ - cy_ * 0.6 - idleC, sh = 0;                   // the idle shimmer: two soft bands going round (IDLE_CURL: off — the curl field moves them on the GPU)
        if (ds < -HL2) ds += LL; if (ds < -HL2) ds += LL; if (ds > HL2) ds -= LL;
        if (ds > -3.6 && ds < 3.6) { const u = 1 - (ds * ds) / 12.96; sh = u * u * u; }
        ds = IDLE_CURL ? 1e9 : cu_ + cy_ * 0.4 + idleC * 0.6 - SH2; if (ds < -HL2) ds += LL; if (ds < -HL2) ds += LL; if (ds > HL2) ds -= LL; if (ds > HL2) ds -= LL;
        if (ds > -3 && ds < 3) { const u = 1 - (ds * ds) / 9; sh += 0.7 * u * u * u; }
        let bump = 0, n = 0, rg = 0;
        for (let q = 0; q < npa; q++) {                                                 // (T-058: only the live pulses, and a cheap reject before the root)
          const k = pa[q], p = pulses[k], rMax = paMax[k], dy = cy_ - p.y; if (dy > rMax || dy < -rMax) continue;
          let d = cu_ - p.s; if (d > HL2) d -= LL; else if (d < -HL2) d += LL; if (d > rMax || d < -rMax) continue;
          const dd = d * d + dy * dy; if (dd > rMax * rMax || dd < paMin2[k]) continue;
          const dist = Math.sqrt(dd), x = (dist - paR[k]) / 0.55;
          if (x > -2.6 && x < 2.6) {
            const b = paAmp[k] * Math.exp(-x * x); bump += b; if (b > 0.6) n++;
            if (p.hold > 0 && !c.keep && dist < p.reach && dist < (1.1 + 0.3 * c.r1) * HR && (p.ros < 0 || p.ros === c.ros || dist < (0.7 + 0.3 * c.r1) * HR) && x < 0.3 && b > 0.1 && colT[i] < time + p.hold) colT[i] = time + p.hold * (0.75 + 0.5 * c.r2);   // T-058b: ~1.1–1.4 m round the hand, 30 % stay pastel
          }
        }
        for (let k = 0; k < nh; k++) {                                                   // under a hand: at once
          let d = cu_ - hcu[k]; if (d > HL2) d -= LL; else if (d < -HL2) d += LL; if (d * d > 0.36 * HR2) continue;   /* (26-11 perf) beyond every reach below (wind 0.36, paint 0.3 × HR²) */ const dy = cy_ - hcy[k], dd = d * d + dy * dy;
          if (WIND && dd < 0.36 * HR2 && hsp[k] > 0.05 && !gone[i]) {                        // the gust: along the hand's own motion
            const f = Math.exp(-dd / W_SIG2) * W_GAIN * Math.min(1.4, hsp[k]) * (0.7 + 0.6 * c.r1) * dt, o3 = i * 3;
            wVel[o3] += hvu[k] * f; wVel[o3 + 1] += hvv[k] * f; wVel[o3 + 2] += Math.hypot(hvu[k], hvv[k]) * f * 0.35; wOn[i] = 1;
          }
          if (dd >= 0.3 * HR2 && hhy[k] > UP_FROM && dy > 0) {                            // above 1.7 m the hand's colour reaches up the wall
            const up = 1 + UP_K * Math.min(1, (hhy[k] - UP_FROM) / 0.4), dyu = dy / up;
            if (d * d + dyu * dyu < 0.3 * HR2 && colT[i] <= time) { paintCell(i); if (hfresh[k] || hsp[k] > 0.08) vphi[i] += 4; }
          }
          if (dd < 0.3 * HR2) {
            // studio 25-11 (Beltrán, the SECOND INTENSITY): a hand passing again over pieces it already painted (painted ≥ 1.2 s ago) brings
            // them down — they fall to the floor, and later fly back to their bed at rest (see the return below), unless touched again
            const painted = colT[i] > time;
            // the more a hand rubs the same place, the more falls: each piece keeps the rubbing (a moving hand near it), which widens the
            // reach (0.37 m → 0.6 m) and speeds the fall; it fades in ~4 s once the hand has gone
            if (painted && hsp[k] > 0.08) rub[i] = Math.min(3, rub[i] + dt * (1 - dd / (0.3 * HR2)) * (0.6 + hsp[k]));
            const R2 = (0.14 + 0.22 * Math.min(1, rub[i] / 1.5)) * HR2;
            if (painted && !gone[i] && !c.mother && time - paintAt[i] > 1.2 && hsp[k] > 0.08 && dd < R2 && goneN < 260 && rnd() < dt * (4 + 8 * rub[i])) letGo(i, 0.9);
            if (!painted) paintAt[i] = time;
            if (PERSIST) paintCell(i); else if (!c.keep) colT[i] = time + hold * (0.75 + 0.5 * c.r2); if (hfresh[k]) { vphi[i] += 5; }   /* studio 25-11: no glow under a landing hand (was glow 1.0), motion only */
          }
        }
        if (waveT0 >= 0 && !gone[i] && dB) {                                            // the rings that open the buttons: closing in on each window, painting what was left (then once more)
          const d0 = dB[i], T1 = R0W / WIN_V + WAVE_GAP;
          for (let p = 0; p < WAVE_PASSES; p++) {
            const Rin = R0W - (time - waveT0 - p * T1) * WIN_V; if (Rin > R0W + 0.5) continue;
            if (Rin <= d0) { if (colT[i] <= time) paintCell(i); if (wavePass[i] < p + 1) wavePass[i] = p + 1; }
            const x = (d0 - Rin) / BAND_W; if (x > -3 && x < 3) { const k = Math.exp(-x * x) * smooth(dBr[i], dBr[i] + 0.6, Rin); if (k > rg) rg = k; }   // it goes out at the window
          }
        } else if (waveT0 >= 0 && !gone[i]) {                                            // (no round windows: the old wave along the room)
          let dw = cu_ - waveS; if (dw > HL2) dw -= LL; else if (dw < -HL2) dw += LL; dw = Math.abs(dw);
          if (colT[i] <= time && dw < (time - waveT0) * WAVE_V) { paintCell(i); wavePass[i] = 1; vphi[i] += 5 * (c.r2 < 0.5 ? -1 : 1); }   // (26-11: no glow — it whitened the backs)
          for (let p = Math.max(1, wavePass[i]); p < WAVE_PASSES; p++) {
            const tp = time - waveT0 - p * (HL2 / WAVE_V + WAVE_GAP);
            if (tp > 0 && dw < tp * WAVE_V) { wavePass[i] = p + 1; vphi[i] += 5 * (c.r2 < 0.5 ? -1 : 1); }
          }
        }
        for (const b of btns) if (b.t0 >= 0) {                                         // a charge ring: from the button, round the room (a band, not a disc)
          let db = cu_ - b.cu; if (db > HL2) db -= LL; else if (db < -HL2) db += LL; if (db > b.R + 1 || db < -b.R - 1) continue;
          const e = Math.sqrt(db * db + (cy_ - b.cv) * (cy_ - b.cv)), x = (e - b.R) / BAND_W;
          if (x > -3 && x < 3) { const k = Math.exp(-x * x) * smooth(b.r, b.r + 0.4, b.R) * (1 - smooth(HL2 - 1.5, HL2 + 0.5, b.R)); if (k > rg) rg = k; }
        }
        if (n >= 2 && time - resT[i] > 3) { resT[i] = time; glow[i] = 1.1; vphi[i] += 6 * (c.r2 < 0.5 ? -1 : 1); crossings++; }   // two fronts meet here
        let col = colT[i] > time ? 1 : 0, g = startGlow * (0.4 + 0.6 * c.r1);
        if (figOn) {                                                                    // resonance: the figure
          let fd = 1e9, f = 0;
          for (let k = 0; k < NW; k++) { let d = cu_ - figAt[k].cu; if (d > HL2) d -= LL; else if (d < -HL2) d += LL; const dy = cy_ - figAt[k].cy, e2 = d * d + dy * dy; if (e2 < fd) fd = e2; }
          fd = Math.sqrt(fd); f = Math.cos(fd * 2.4 + figPh);                           // rings round the nearest button, closing slowly on it
          if (fd < figR) { if (f > 0.82 && !c.mother) { col = 0; g += 0.5; } else if (f < -0.5 + 0.3 * (c.r1 - 0.5) && !c.keep) col = 1; }   // T-058b: a third of the rings in colour (≈ 23 % of the wall), thin lit lines, the rest at rest
        }
        if (g > glow[i]) glow[i] += (g - glow[i]) * Math.min(1, dt * 6);
        // asleep (T-058, ~14k pieces): nothing moves it and it is home — its last pose stays in the texture, skip it
        if (WIND && wOn[i]) {                                                          // springs home on its own stiffness, through curling air
          const o3 = i * 3, ks = 6 + 6 * c.r2, cs = 2.4 + 1.4 * c.r1;
          let ux = wOff[o3], uy = wOff[o3 + 1], uz = wOff[o3 + 2], vx = wVel[o3], vy = wVel[o3 + 1], vz = wVel[o3 + 2];
          const sp = Math.hypot(vx, vy), tq = time * 0.9 + c.r1 * 6.28;
          vx += (-ks * ux - cs * vx + sp * 2.2 * Math.sin(uy * 7 + tq) ) * dt;           // curl-like turbulence, only while it travels
          vy += (-ks * uy - cs * vy + sp * 2.2 * Math.cos(ux * 7 - tq * 1.3)) * dt;
          vz += (-ks * 1.6 * uz - cs * vz) * dt;
          ux += vx * dt; uy += vy * dt; uz += vz * dt;
          const L = Math.hypot(ux, uy); if (L > W_MAX) { ux *= W_MAX / L; uy *= W_MAX / L; }
          if (uz < 0) { uz = 0; if (vz < 0) vz = 0; } if (uz > 0.25) uz = 0.25;
          wOff[o3] = ux; wOff[o3 + 1] = uy; wOff[o3 + 2] = uz; wVel[o3] = vx; wVel[o3 + 1] = vy; wVel[o3 + 2] = vz;
          const oo = i * 4; offData[oo] = ux; offData[oo + 1] = uy; offData[oo + 2] = uz; windDirty = true;
          if (ux * ux + uy * uy + uz * uz < 1e-7 && vx * vx + vy * vy + vz * vz < 1e-6) { wOn[i] = 0; wOff.fill(0, o3, o3 + 3); wVel.fill(0, o3, o3 + 3); offData[oo] = offData[oo + 1] = offData[oo + 2] = 0; }
        }
        if (settled && !figOn && sh === 0 && bump < 0.003 && rg < 0.003 && g === 0 && glow[i] < 0.002 && !gone[i] && !wOn[i]) {
          const tg = col * Math.PI, e = phi[i] - tg;
          if (e < 0.003 && e > -0.003 && vphi[i] < 0.004 && vphi[i] > -0.004) {   /* (26-11 perf) a little looser: more stones sleep; the snap home is < 0.2° */
            if (!sleep[i]) { sleep[i] = 1; phi[i] = tg; vphi[i] = 0; glow[i] = 0; stData[o] = (tg * 2) % 6.2831853; stData[o + 1] = 0; stData[o + 2] = col ? 8 : 0; stData[o + 3] = 1; }
            continue;
          }
        }
        sleep[i] = 0;
        target = col * Math.PI + sh * 0.06 + Math.min(bump, 1.3) * 0.36 + rg * RING_TURN * (c.r2 < 0.5 ? -1 : 1);   // T-066: the idle shimmer turns a piece ≤ 7° (was 23°: the joints opened, the vault floated)
        vphi[i] += (kSpring * (target - phi[i]) - cSpring * vphi[i]) * dt; phi[i] += vphi[i] * dt;
        turn = phi[i] * 2; kc = phi[i] > 1.5708 ? 8 : 0;
        lift = Math.abs(Math.sin(phi[i])) * Math.min(0.07, c.rad * 1.1) + bump * 0.05 + rg * 0.05 + sh * 0.008;   // ART: relief at rest ≤ 1.5 cm; a touched piece comes out 3–6 cm
      }
      glow[i] *= glowDecay;
      // it comes (a sweep round the room: every piece flies to its bed, turning) and goes (breaks away, towards the public and up)
      const aAt = settled ? 0 : 0.5 * ((c.th / (Math.PI * 2) + c.r1 * 0.22) % 1), ka = settled ? 1 : smooth(aAt, aAt + 0.42, arrive), kl = settled ? 0 : smooth(c.r2 * 0.45, c.r2 * 0.45 + 0.5, leave);
      if (ka < 1 || kl > 0) { lift += (1 - ka) * (1 - ka) * 0.5 + kl * kl * 0.5; /* T-058c: a short flight (the shell is near the wall) */ turn += (1 - ka) * 5 + kl * 4 * (c.r1 - 0.5) * 2; sc *= ka * (1 - kl); }
      if (gone[i]) sc = 0;
      if (WIND && wOn[i]) { const o3 = i * 3; turn += Math.min(1.3, Math.hypot(wVel[o3], wVel[o3 + 1]) * 1.6) * (c.r1 < 0.5 ? -1 : 1); }   // it tilts with its speed
      stData[o] = turn % 6.2831853; stData[o + 1] = lift; stData[o + 2] = Math.min(glow[i], 3.5) + kc; stData[o + 3] = sc;
      if (WIND && wOn[i]) { const o3 = i * 3; stampHole(CU[i], CY[i], c.rad * 1.35, smooth(0.015, 0.06, Math.hypot(wOff[o3], wOff[o3 + 1]) + wOff[o3 + 2])); }
      if (!c.loose) {   // studio 25-11: the night behind — (26-11 perf) the same test as stampHole's own early-out (a < 0.04), without the call, smooth or sin for the ~24k stones at rest
        const ht = turn * 0.5, hr = ht - Math.PI * Math.round(ht / Math.PI);
        if (sc < 0.96 || lift > 0.012 || hr > 0.0444 || hr < -0.0444) stampHole(CU[i], CY[i], c.rad * 1.35, Math.max(1 - sc, smooth(0.012, 0.04, lift), Math.abs(Math.sin(ht)) * 0.9));
      }
    }
    stTex.needsUpdate = true; if (maskDirty) maskTex.needsUpdate = true; if (windDirty) { offTex.needsUpdate = true; windDirty = false; }

    // ---- the fallen pieces of the serpentine
    const vis0 = arrive * (1 - smooth(0, 0.6, leave));
    for (const b of bodies) {
      if (b.cell < 0) { meshes[b.mesh].setMatrixAt(b.idx, _m.makeScale(0, 0, 0)); continue; }
      if (stepLoose(b, dt)) { const i = b.cell; b.cell = -1; gone[i] = 0; goneN--; vphi[i] += 6; if (!PERSIST) colT[i] = time; /* studio 25-11: it came back reset, at rest; 26-11: painted stays painted (PERSIST) */ meshes[b.mesh].setMatrixAt(b.idx, _m.makeScale(0, 0, 0)); continue; }
      let vis = vis0; if (b.state === 3) vis = 0; if (b.state === 5) vis *= smooth(0.6, 1.4, b.timer);
      _s.copy(b.sc).multiplyScalar(vis);
      meshes[b.mesh].setMatrixAt(b.idx, _m.compose(b.p, b.q, _s));
    }

    // ---- the mobiles: pendulums, falls, rests, rises
    let ti = 0;
    for (const s of band) {
      const w = walls[s.wall];
      if (s.state === 0) {
        const om = G / s.L;
        s.vax += (-om * Math.sin(s.ax) - 0.3 * s.vax) * dt; s.vaz += (-om * Math.sin(s.az) - 0.3 * s.vaz) * dt;
        s.ax += s.vax * dt; s.az += s.vaz * dt; s.ax = clamp(s.ax, -0.22, 0.22); s.az = clamp(s.az, -0.12, 0.5);   // short swings: a hanging piece never reaches the words
        s.vyaw += (-0.5 * s.yaw - 0.3 * s.vyaw) * dt; s.yaw += s.vyaw * dt; s.baseYaw += s.turn * dt;     // it turns slowly on its thread: the mirror sweeps the room
        hangPose(s, s.p, s.q);
      } else stepLoose(s, dt);
      if (s.kind === 0) {                                                               // its glaze shows while the touch lasts
        const want = s.tintT > time ? 1 : 0;
        if (Math.abs(want - s.tintK) > 0.002) { s.tintK += (want - s.tintK) * (1 - Math.exp(-dt * (want ? 9 : 0.8))); for (let k = 0; k < 3; k++) s.color[k] = s.base[k] + (s.glaze[k] - s.base[k]) * s.tintK; paint(s); }
      }
      const ka = smooth(s.arriveAt, s.arriveAt + 0.45, arrive), kl = smooth(s.leaveAt, s.leaveAt + 0.5, leave);
      let vis = ka * (1 - kl);
      if (s.state === 3) vis = 0;
      if (s.state === 5) vis *= smooth(0.6, 1.4, s.timer);
      _v.copy(s.p); _v.y += (1 - ka) * (1 - ka) * 2.8; _v.addScaledVector(s.out, kl * kl * 2.5); _v.y += kl * 2.2;
      _q.copy(s.q); if (kl > 0) _q.premultiply(_q2.setFromAxisAngle(s.spinAxis, kl * 5));
      _s.copy(s.sc).multiplyScalar(vis > 0.001 ? Math.sqrt(vis) : 0);
      meshes[s.mesh].setMatrixAt(s.idx, _m.compose(_v, _q, _s));
      const o = ti * 6; ti++;
      if (s.state === 0 && vis > 0.01 && kl < 0.01) {          // leaving: the threads let go first
        _v2.copy(w.centre).addScaledVector(w.right, s.hx).addScaledVector(w.normal, -s.hd); _v2.y = s.top + (1 - ka) * 2.8;
        threadPos[o] = _v2.x; threadPos[o + 1] = _v2.y; threadPos[o + 2] = _v2.z; threadPos[o + 3] = _v.x; threadPos[o + 4] = _v.y + s.sc.y * 0.4; threadPos[o + 5] = _v.z;
      } else { threadPos[o] = threadPos[o + 3] = s.p.x; threadPos[o + 1] = threadPos[o + 4] = 50; threadPos[o + 2] = threadPos[o + 5] = s.p.z; }
    }
    threadGeo.attributes.position.needsUpdate = true;
    threadMat.opacity = 0.12 * arrive * (1 - leave);   // T-053 (ARTE r5): the threads at 40 %

    // ---- chips
    for (let i = 0; i < CHIPS; i++) {
      const c = chips[i];
      if (!c.on) { chipMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const s = c.owner;
      if (s.state === 3) {
        if (!c.rest) {
          const hh = c.s * 0.1 + 0.004 - LOOSE_DROP;   // studio 25-11: the chips too, below the camera
          if (integrateFree(c.p, c.v, c.q, c.w, dt, s, hh)) { c.p.y = hh; if (-c.v.y > 0.6) { c.v.y *= -0.3; c.v.x *= 0.8; c.v.z *= 0.8; c.w.multiplyScalar(0.5); } else { c.v.y = 0; c.v.multiplyScalar(Math.exp(-dt * 1.4)); c.w.multiplyScalar(Math.exp(-dt * 6)); if (c.v.lengthSq() < 0.002) { c.rest = true; c.from.copy(c.p); } } }
        }
        _s.setScalar(c.s * (1 - smooth(0, 1, leave)));
      } else if (s.state === 5) {                                 // the chips gather into the piece
        if (!c.rest) { c.rest = true; c.from.copy(c.p); }
        const k = smooth(0, 0.9, s.timer);
        c.p.lerpVectors(c.from, s.from, k); c.p.y += Math.sin(k * Math.PI) * 0.15;
        _s.setScalar(c.s * (1 - k));
        if (k >= 1) c.on = false;
      } else { c.on = false; _s.setScalar(0); }
      chipMesh.setMatrixAt(i, _m.compose(c.p, c.q, _s));
    }
    chipMesh.instanceMatrix.needsUpdate = true;

    // ---- the ring: tiles fly in from the dark and lock round the button; start turns and lights it; 'start' blows it apart
    const startK = PERSIST ? 0 : startV;   // (26-11: the charge is the ring of stones only)
    ringSpin += dt * (0.05 + startK * 2.2);
    const ex = exploded >= 0 ? smooth(0, 2.2, exploded) : 0;
    const ringOff = revealV < 0.0005 || arrive <= 0 || leave >= 0.9 || ex >= 1;         // nothing of the frame shows: zero it once, then skip (T-058: ~1,400 tiles)
    const ringCalm = revealV > 0.999 && startV < 0.03 && ex === 0 && settled; ringTick = (ringTick + 1) % 4;   // locked and slow: its pose at 15 Hz is enough
    if ((ringOff && ringZeroed) || (ringCalm && ringTick)) { /* nothing new */ } else for (let i = 0; i < ring.length; i++) {
      const s = ring[i], w = walls[s.wall], k = smooth(s.at, s.at + 0.3, revealV);
      _v.copy(s.far); _v.y += Math.sin(time * 0.3 + s.ph) * 0.25; _v.addScaledVector(w.right, Math.cos(time * 0.21 + s.ph) * 0.3);
      _q.setFromAxisAngle(s.axis, time * s.spin + s.ph);
      const a = s.a0 + ringSpin * (s.r < 0.35 ? 1 : -0.6);                                   // start: the rows turn against each other, like a lock
      _v2.copy(w.centre).addScaledVector(w.right, Math.cos(a) * s.r).addScaledVector(w.normal, -RING_D); _v2.y = RING_Y + Math.sin(a) * s.r;
      _q2.setFromAxisAngle(w.normal, a - Math.PI / 2 + s.roll).multiply(faceQ[s.wall]);   // local x along the row, local y outwards (the taper widens outwards)
      _v.lerp(_v2, k); _v.y += Math.sin(k * Math.PI) * 0.35; _q.slerp(_q2, k);
      if (ex > 0) { _v.addScaledVector(w.right, s.ex.x * ex * 2.4).addScaledVector(w.normal, -ex * 1.5); _v.y += s.ex.y * ex * 2 + ex * ex * 0.5; _q.premultiply(_q2.setFromAxisAngle(s.axis, ex * 8)); }
      const vis = smooth(0, 0.5, arrive) * (1 - smooth(0.2, 0.9, leave)) * (1 - smooth(0.4, 1, ex)) * smooth(0, 0.25, k + (revealV > 0.02 ? 0.12 : 0)) * ringWall[s.wall];   // studio 25-11: no ring on the title's wall
      _s.copy(s.sc).multiplyScalar(vis);
      ringMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    }
    if (!(ringOff && ringZeroed) && !(ringCalm && ringTick)) ringMesh.instanceMatrix.needsUpdate = true;
    ringZeroed = ringOff;
    { const k = smooth(0.15, 0.75, revealV) * smooth(0, 0.5, arrive) * (1 - smooth(0.2, 0.9, leave)) * (1 - smooth(0.1, 0.6, ex)); ringBeds.forEach((b, wi) => { b.material.opacity = 0.9 * k; b.visible = k > 0.005 && ringWall[wi] > 0; }); }
    uRing.value = arrive * (1 - leave) * (smooth(0.6, 1, revealV) * 0.04 + startK * 0.14) * (1 - ex) + (ex > 0 && ex < 1 ? Math.sin(ex * Math.PI) * 0.4 : 0);   // ART: emissive ≤ 0.15 (the flash of 'start' a breath more)

    // ---- far arcs (they turn with the far world)
    for (const s of mid) {
      const a = s.a - rot + time * 0.012 * s.dir * motion;
      _v.set(Math.cos(a) * s.R, s.y + world.position.y + Math.sin(time * 0.17 + s.ph) * 0.3, Math.sin(a) * s.R);
      _q.setFromAxisAngle(s.axis, time * s.spin + s.ph);
      const ka = smooth(s.arriveAt, s.arriveAt + 0.4, arrive), kl = smooth(0.1, 0.9, leave);
      _v.y += (1 - ka) * -3 + kl * kl * 6;
      _s.copy(s.sc).multiplyScalar(ka * (1 - kl));
      meshes[s.mesh].setMatrixAt(s.idx, _m.compose(_v, _q, _s));
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;

    // ---- the far world and the light come and go with the part
    const farK = arrive * (1 - leave);
    for (const h of hazes) h.visible = false; skyMesh.visible = true; uSkyK.value = 1 - smooth(0.3, 1, leave);   // studio 25-11: no dunes, vaults or haze; the flat night always (the room's sand background never shows)
    floorMesh.visible = false; uHeroRot.value = heroRot; uDustT.value = time; uDustK.value = farK * (clearT0 >= 0 ? 1 - smooth(clearT0 + 0.5, clearT0 + 2.5, time) : 1);   // (26-11: at CLEAR the square's own dust — atmos — takes over)
    hemi.intensity = KEYS.fill * farK; key.intensity = KEYS.key * farK; beam.intensity = 0; beam2.intensity = KEYS.spot * farK;   // T-058: no lighthouse (kept as lights at 0: the set of lights must not change)
    for (const l of rims) { l.position.set(Math.cos(l.userData.a) * 12.5, 1.2, Math.sin(l.userData.a) * 12.5); l.intensity = 0; }
    if (arches) { arcState.arrive = arrive; arcState.leave = leave; arcState.push = pushV; arcState.reveal = revealV; arcState.start = startV; arcState.time = time; arcState.hands = hands; try { arches.update(dt, arcState); } catch (err) { if (!arcErr) { arcErr = true; console.info('umbral3d: arches.update skipped (' + err.message + ')'); } } }
  }

  return {
    object,
    update,
    setParams() { /* read live from params */ },
    paint: () => { let m = 1; const walls_ = []; for (let w = 0; w < NW; w++) if (visW[w] > 0) { const k = paintedW[w] / visW[w]; walls_.push(+k.toFixed(3)); m = Math.min(m, k); } return { share: m, total: paintedN / visN, walls: walls_, painted: paintedN, of: visN, wave: waveT0 >= 0 }; },
    events,
    charge: () => ({ cover: chargeCov, cleared: clearT0 >= 0, clearedFor: clearT0 >= 0 ? time - clearT0 : 0, holding: btns.filter((b) => b.t0 >= 0).length }),   // studio 26-11
    wavePasses: () => { const n = [0, 0, 0]; for (const v of wavePass) n[Math.min(2, v)]++; return n; },   // lab: stones by passes received   // studio 26-11: how much of the picture is uncovered
    touch(wall, x, y) { const w = walls[wall]; surfHit(_v2.copy(w.centre).addScaledVector(w.right, x).setY(y)); land(_v2, nearest(hit.cu, hit.cy), 40); },   // lab checks only: a landing at a point of a wall (x from its centre, y from the floor, m)
    debug: () => ({ arches: arches ? (arches.info || true) : arcErr ? 'error' : 'none', env: envRT ? 'own' : room.envMap ? 'room' : 'none', pieces: NC, verts: heroGeo.attributes.position.count, mothers: cells.filter((c) => c.mother).length, loose: cells.filter((c) => c.loose).length, band: band.length, mid: mid.length, gone: gone.reduce((a, b) => a + b, 0), falling: bodies.filter((s) => s.state === 1).length + band.filter((s) => s.state === 1).length, resting: bodies.filter((s) => s.state >= 2).length, chips: chips.filter((c) => c.on).length, pulses: pulses.filter((p) => p.on).length, coloured: colT.reduce((a, t) => a + (t > time ? 1 : 0), 0), glazed: phi.reduce((a, v) => a + (v > 1.5708 ? 1 : 0), 0), asleep: sleep.reduce((a, v) => a + v, 0), cascades, crossings, figure: figT0 >= 0, fxSent, reveal: revealV, start: startV }),
    dispose() {
      try { bc?.close(); } catch { /* closed */ }
      for (const m of meshes) m.dispose?.();
      heroGeo.dispose(); for (const m of heroParts) m.geometry.dispose(); stTex.dispose(); pieceTex.dispose(); envRT?.dispose?.(); crackle.dispose(); try { arches?.dispose?.(); } catch { /* gone */ }
    },
  };
}
