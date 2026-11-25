// Ressonància — «umbral», the threshold (block 'wait'): the first impression and the showcase of the room. See ../PARTS.md.
//
// THE SERPENTINE (the hero): one continuous wall of real TRENCADÍS that winds round the whole room, 5–10 m from the eye — Gaudí's bench
// become a wave: it comes near and goes away, leans over the public like a wave about to break, is pierced by parabolic ARCHES (the
// thresholds: the deep world is seen through them) and dissolves at its crest into shards that float away. ~2,500 broken pieces, no two
// alike (a Voronoi mosaic on the surface: tiny chips, middle pieces and plate-sized "mothers", 1 : 3 : 9), each a thick bevelled shard
// of red clay seated on a dark bed with a wide joint. Every piece has two faces: at rest BONE, GRAPHITE or MIRROR; behind, the GLAZE
// (cobalt, turquoise, ochre, blood, rose, in fields and medallions). COLOUR ONLY APPEARS WHERE THE PUBLIC PLAYS — and it stays a while:
// the room is coloured by the group, and that colour is the reveal.
//   a hand lands     its pieces flip at once (< 1 frame), a WAVE runs out from it over the mosaic (each piece peels off its bed, turns in
//                    the air showing its glaze, and seats again), and the nearest pieces are KNOCKED OUT: they fall, bounce, break, skate
//                    on the black mirror of the floor, and later fly back to their place (what breaks is put back together);
//   a hand moves     it paints: the pieces under it turn to colour;
//   a hand stays     (0.6 s) the CASCADE: the whole column above it lets go in a chain, from the hand up to the crest;
//   several hands    their waves cross: where two fronts meet the pieces spin and their edges LIGHT — the crossings draw moving lines of
//                    light on the wall (interference: the title of the work);
//   reveal = 1       RESONANCE: the whole room settles into a Chladni figure — lines of white pieces with lit edges on a field of colour.
// Nearer (0.3–0.9 m behind each wall): a few MOBILES of big pieces on threads (mirror, bone, glass; 0.4–0.85 m) that swing, turn, fall
// and break under the hands — the parallax layer. Farther (13–45 m): arcs of big mirror shards, glints, haze, a thread of embers.
// The room moves: the serpentine turns round the public (1°/s — in six minutes the whole wall has passed by every visitor), the far
// world turns the other way and breathes; a lighthouse beam goes round the room every 24 s and its glints cross the four walls.
// THE REVEAL (score.js, block 'wait': state.reveal 0..1, state.start 0..1): small glazed tiles fly from the dark and lock into a ring
// round the centre of every wall at 1.25 m (where GUI draws the start button); start turns and lights the ring; 'start' blows it apart
// and sends the biggest wave. Alone (res-3d-study) the part runs its own copy of the score from the hands (params reveal/start = -1).
// Sound: physical impacts go to the sound piece on BroadcastChannel('ressonancia') as
//   { type: 'fx', fx: 'impact', wall, u (0..1 along the wall), strength (0..1), mat ('ceramic'|'chrome'|'glass'), kind ('hit'|'floor'|'break'|'hook') }
// (≤ 16 a second). How it is drawn: the mosaic is ONE mesh; a small float texture carries each piece's turn, lift, light and scale
// (springs and waves on the CPU, the pose in the vertex stage). Its mirror image under a black gloss is the floor's reflection.
import { lin as palLin } from '../palette.js';
import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
import { createScore } from '../../score.js';

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

  // the palette (linear): at rest bone, graphite, chrome; the glaze behind every piece — the colours of the chapters to come
  const BONE = [0.66, 0.63, 0.57], GRAPHITE = [0.022, 0.023, 0.026], GOLD = [0.86, 0.5, 0.09];   // bone #F1ECE2 (kept under the bloom), graphite #1A1B20, gold #F6C65B
  // the glaze behind the pieces, by FAMILIES — one per rosette, the colours of the chapters to come: [heart, first ring, outer ring, accent]
  // VFX 25-11 (palette.js, D4b): the families from the palette of the work — no coral / turquoise / cobalt / lilac / aquamarine
  const FAMILY = [
    [palLin('flama'), palLin('brasa'), palLin('carbó', 3), palLin('cal-fanal')],              // brasa: flame, ember, coal · lantern
    [palLin('cal-foc'), palLin('terracota'), palLin('ombra'), palLin('faixa')],                // pinya: lime-fire, terracotta, shadow · sash
    [palLin('porcellana', 0.85), palLin('pedra-llum'), palLin('tinta-ombra', 2), palLin('or')], // tronc: porcelain, stone, blue shadow · gold
    [palLin('or-clar'), palLin('lluna', 0.8), palLin('nit-alta', 2), palLin('or')],             // pom: pale gold, moon, high night
    [palLin('alba-rosa'), palLin('alba-blau'), palLin('albergínia', 1.5), palLin('or-clar')],   // dawn: rose, dawn blue, aubergine · pale gold
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
    sky.colorNode = F_(() => { const y = nz(pl).y; return mx(v3(0.01, 0.01, 0.012), v3(0.085, 0.092, 0.105), ss(-0.1, 0.9, y)).add(v3(0.8, 0.26, 0.07).mul(ex(y.add(0.02).div(0.05).pow(2).negate())).mul(0.45)); })();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), sky));
    const pg = new THREE.PlaneGeometry(1, 1);
    for (const [col, a, y, w, h] of [[[2.6, 2.7, 2.9], 0.3, 22, 26, 6], [[1.5, 1.7, 2.1], 3.4, 16, 16, 4], [[2.4, 2.2, 1.9], 1.7, 8, 6, 7], [[1.7, 1.85, 2.2], 4.6, 7, 5, 8], [[1.5, 0.9, 0.5], 5.6, 2.5, 8, 2]]) {
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

  // =========================================================================================== THE SERPENTINE
  // The surface, in its own parameters: cu = metres along (θ = cu / RM, closed: 0..LL), cy = metres up.
  const RM = 7.5, LL = Math.PI * 2 * RM, YTOP = 8.8;
  const wrapU = (d) => d - Math.round(d / LL) * LL;
  function surfR(th, y) {
    const R = 7.7 + 1.45 * Math.sin(3 * th + 0.6) + 0.65 * Math.sin(5 * th + 2.0) + 0.3 * Math.sin(8 * th + 4.0);
    const lean = 0.45 + 1.15 * Math.sin(2 * th + 1.0), k = y / 6;
    return Math.max(5.35, R - lean * k * k);
  }
  const surfP = (cu, y, out) => { const th = cu / RM, r = surfR(th, y); return out.set(r * Math.cos(th), y, r * Math.sin(th)); };
  const ARCH = [];                          // (no openings baked in the mosaic: the thresholds are cut where the walls' centres look, see doorK)
  function archF(cu, y) {                     // < 0 inside an arch (a parabola: Gaudí's arch); small and positive on its rim
    let f = 9;
    for (const A of ARCH) { const du = wrapU(cu - A.cu); if (Math.abs(du) < A.a + 0.6) f = Math.min(f, y - A.h * (1 - (du / A.a) * (du / A.a))); }
    return f;
  }
  function crest(cu) {
    const th = cu / RM;
    let H = 4.7 + 1.7 * Math.sin(2 * th + 0.3) + 0.9 * Math.sin(5 * th + 1.1) + 0.3 * Math.sin(13 * th + 0.5);
    for (const A of ARCH) { const du = wrapU(cu - A.cu); H = Math.max(H, (A.h + 1.1) * Math.exp(-(du * du) / (A.a * A.a * 2.2))); }
    return H;
  }

  // ---- the mosaic: Poisson sites of three sizes → Voronoi cells → shards
  const cells = [];
  let heroGeo;
  {
    const BW = Math.ceil(LL), BH = Math.ceil(YTOP) + 1, bucket = Array.from({ length: BW * BH }, () => []);
    const bOf = (cu, y) => (Math.min(BH - 1, Math.max(0, Math.floor(y))) * BW + ((Math.floor((cu / LL) * BW) % BW) + BW) % BW);
    const sites = [];
    const fits = (cu, y, ri) => {
      const bx = Math.floor((cu / LL) * BW), by = Math.floor(y), reach = Math.ceil((ri + 1.6) / 2) + 1;
      for (let j = Math.max(0, by - reach); j <= Math.min(BH - 1, by + reach); j++) for (let i = bx - reach; i <= bx + reach; i++) {
        for (const k of bucket[j * BW + ((i % BW) + BW) % BW]) { const s = sites[k], du = wrapU(cu - s.cu), dy = y - s.y, m = (ri + s.ri) / 2; if (du * du + dy * dy < m * m) return false; }
      }
      return true;
    };
    const put = (cu, y, ri, mother) => { sites.push({ cu, y, ri, mother }); bucket[bOf(cu, y)].push(sites.length - 1); };
    for (let t = 0, n = 0; t < 4000 && n < 44; t++) {     // the mothers first: plate-sized pieces, inside the wall, clear of the arches
      const cu = rr(0, LL), y = rr(0.9, 5.6);
      if (y > crest(cu) - 0.8 || archF(cu, y) < 0.7 || !fits(cu, y, 2.3)) continue;
      put(cu, y, rr(1.25, 1.65), true); n++;
    }
    const fine = (cu, y) => 0.135 + 0.2 * (0.5 + 0.5 * Math.sin(cu * 0.42 + 1.3 * Math.sin(y * 0.6))) * (0.6 + 0.4 * Math.sin(cu * 0.13 + y * 0.9 + 2));
    for (let t = 0; t < 320000; t++) { const cu = rr(0, LL), y = rr(0.03, YTOP), ri = fine(cu, y); if (fits(cu, y, ri)) put(cu, y, ri, false); }

    // Voronoi: clip a big octagon round each site by the bisectors of its neighbours (periodic in cu)
    const clip = (poly, mx, my, nx, ny) => {     // keep the side where (p − m)·n ≤ 0
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
      }
      return out;
    };
    const pos = [], nor = [], aC = [], aAx = [], aN = [], aCol = [], aInf = [];
    const P0 = new THREE.Vector3(), Pu = new THREE.Vector3(), Pv = new THREE.Vector3(), Nn = new THREE.Vector3(), Tu = new THREE.Vector3(), Tv = new THREE.Vector3();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), ax = new THREE.Vector3();
    const mothers = sites.filter((q) => q.mother); mothers.forEach((q, i) => { q.fam = i % 5; });
    for (const s of sites) {
      const H = crest(s.cu), af = archF(s.cu, s.y);
      if (af < 0) continue;                                                             // an arch: open
      let loose = 0;
      if (s.y > H) { if (s.mother || s.y > H + 1.9 || rnd() > 0.17 * (1 - (s.y - H) / 1.9)) continue; loose = 1; }   // T-053 (ARTE r5): the shards floating off the crest at half (was 0.34)
      else if (!s.mother && (rnd() < 0.018 || (H - s.y < 0.45 && rnd() < 0.3))) continue;   // a missing piece; a ragged crest
      let poly = []; const a0 = rr(0, 6.28);
      for (let k = 0; k < 8; k++) poly.push([Math.cos(a0 + k * 0.7854) * 1.0, Math.sin(a0 + k * 0.7854) * 1.0]);
      const bx = Math.floor((s.cu / LL) * BW), by = Math.floor(s.y);
      for (let j = Math.max(0, by - 3); j <= Math.min(BH - 1, by + 3) && poly.length > 2; j++) for (let i = bx - 3; i <= bx + 3; i++) {
        for (const k of bucket[j * BW + ((i % BW) + BW) % BW]) {
          const o = sites[k]; if (o === s) continue;
          const dx = wrapU(o.cu - s.cu), dy = o.y - s.y; if (dx * dx + dy * dy > 4.4) continue;
          poly = clip(poly, dx / 2, dy / 2, dx, dy); if (poly.length < 3) break;
        }
      }
      poly = clip(poly, 0, 0.012 - s.y, 0, -1);                                         // the floor
      if (poly.length < 3) continue;
      let area = 0, gx = 0, gy = 0;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1]; area += c; gx += (a[0] + b[0]) * c; gy += (a[1] + b[1]) * c; }
      area /= 2; if (Math.abs(area) < 0.012) continue;
      gx /= 6 * area; gy /= 6 * area; if (area < 0) poly.reverse();
      const cu = s.cu + gx, cy = s.y + gy;
      let rad = 0; for (const p of poly) { p[0] -= gx; p[1] -= gy; rad = Math.max(rad, Math.hypot(p[0], p[1])); }
      // the frame of the surface at the piece
      surfP(cu, cy, P0); surfP(cu + 0.05, cy, Pu); surfP(cu, cy + 0.05, Pv);
      Tu.subVectors(Pu, P0).multiplyScalar(20); Tv.subVectors(Pv, P0).multiplyScalar(20);
      Nn.crossVectors(Tu, Tv).normalize(); if (Nn.x * P0.x + Nn.z * P0.z > 0) Nn.negate();      // towards the public
      // what it is: kind at rest (0 bone, 1 mirror, 2 graphite) and its glaze
      const u = rnd(), vein = Math.abs(Math.sin(cu * 0.31 + 1.7 * Math.sin(cy * 0.55 + cu * 0.07)));
      let kind = s.mother ? (u < 0.4 ? 1 : 0) : (vein < 0.06 ? 1 : u < 0.07 ? 1 : u < 0.2 ? 2 : 0);
      // its rosette: the nearest mother piece; its glaze: the rosette's family, in rings round the heart
      let ros = 0, rd = 1e9; mothers.forEach((M, k) => { const d = Math.hypot(wrapU(cu - M.cu), cy - M.y); if (d < rd) { rd = d; ros = k; } });
      const fam = FAMILY[mothers[ros].fam], bandN = Math.floor(rd / 0.62 + rnd() * 0.3);
      let col = s.mother ? fam[0] : rnd() < 0.08 ? fam[3] : bandN % 3 === 0 ? fam[1] : bandN % 3 === 1 ? fam[2] : fam[0];
      if (loose) { col = rnd() < 0.5 ? BONE : GRAPHITE; kind = rnd() < 0.3 ? 1 : 0; }
      const tone = rr(0.78, 1.12), id = cells.length, idRnd = rnd();
      const inAx = rr(-0.7, 0.7);                                                        // the axis of its turn: in the surface, near the vertical
      ax.copy(Tv).normalize().multiplyScalar(Math.cos(inAx)).addScaledVector(e1.copy(Tu).normalize(), Math.sin(inAx)).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1.copy(Tu).normalize(), e2.crossVectors(Nn, e1).normalize(), Nn));
      cells.push({ cu, cy, rad, loose, kind, col, ros, rd, c: P0.clone(), n: Nn.clone(), q, mother: s.mother, over: loose ? (cy - H) / 1.9 : 0, r1: idRnd, r2: rnd(), th: cu / RM });
      // the shard: inset for the joint, thick, with a chamfer that catches the light; tilted a little (no two pieces lie alike)
      const gap = s.mother ? 0.013 : 0.009, n = poly.length, thick = (s.mother ? 0.06 : 0.036) + rr(0, 0.018), ch = Math.min(0.016, thick * 0.4);
      const tiltA = rr(0, 6.28), tiltK = loose ? 0 : rr(0.035, 0.08), tx = Math.cos(tiltA) * tiltK, ty = Math.sin(tiltA) * tiltK;
      const O = poly.map((p) => { const l = Math.hypot(p[0], p[1]) || 1, k = Math.max(0.45, 1 - (gap * 1.25) / l); return [p[0] * k, p[1] * k]; });
      const T = O.map((p) => { const l = Math.hypot(p[0], p[1]) || 1, k = Math.max(0.5, 1 - (ch * 1.2) / l); return [p[0] * k, p[1] * k]; });
      const W = (p, h, out) => out.copy(P0).addScaledVector(Tu, p[0]).addScaledVector(Tv, p[1]).addScaledVector(Nn, h + (h > 0.001 ? p[0] * tx + p[1] * ty : 0));
      const tri = (pa, ha, pb, hb, pc, hc, face, wantOut, dome) => {
        W(pa, ha, va); W(pb, hb, vb); W(pc, hc, vc);
        fn.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); if (fn.lengthSq() < 1e-12) return; fn.normalize();
        // orient: the top faces the public, the back faces away, the sides face out from the centre
        let flip;
        if (wantOut) { e1.copy(va).add(vb).add(vc).multiplyScalar(1 / 3).sub(P0).addScaledVector(Nn, -thick * 0.5); flip = fn.dot(e1) < 0; }
        else flip = fn.dot(Nn) * (face === 1 ? -1 : 1) < 0;
        if (flip) { fn.negate(); const t = vb.x, t2 = vb.y, t3 = vb.z; vb.copy(vc); vc.set(t, t2, t3); }
        for (const v of [va, vb, vc]) {
          pos.push(v.x, v.y, v.z);
          if (dome && v !== va) { e1.subVectors(v, va).normalize().multiplyScalar(dome).add(fn).normalize(); nor.push(e1.x, e1.y, e1.z); } else nor.push(fn.x, fn.y, fn.z);   // a face a little domed (hand-made): the sheen slides over it
          aC.push(P0.x, P0.y, P0.z); aAx.push(ax.x, ax.y, ax.z); aN.push(Nn.x, Nn.y, Nn.z); aCol.push(col[0] * tone, col[1] * tone, col[2] * tone); aInf.push(id, face, kind, idRnd);
        }
      };
      const Z = [0, 0];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri(Z, thick, T[i], thick, T[j], thick, 0, false, kind === 1 ? 0.05 : 0.16);            // the face
        tri(T[i], thick, O[i], thick - ch, O[j], thick - ch, 0, true); tri(T[i], thick, O[j], thick - ch, T[j], thick, 0, true);   // its chamfer
        tri(O[i], thick - ch, O[i], 0, O[j], 0, 2, true); tri(O[i], thick - ch, O[j], 0, O[j], thick - ch, 2, true);             // the broken side (red clay)
        tri(Z, 0, O[j], 0, O[i], 0, 1, false);                                           // the back (the glaze)
      }
      if (!loose) {                                                                      // its bed: the dark mortar, exactly on the surface
        const B = poly.map((p) => { surfP(cu + p[0] * 1.02, cy + p[1] * 1.02, Pu); return Pu.clone().addScaledVector(Nn, -0.03); });
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n; va.copy(P0).addScaledVector(Nn, -0.03); vb.copy(B[i]); vc.copy(B[j]);
          fn.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)).normalize(); if (fn.dot(Nn) < 0) { const t = vb.clone(); vb.copy(vc); vc.copy(t); }
          for (const v of [va, vb, vc]) { pos.push(v.x, v.y, v.z); nor.push(Nn.x, Nn.y, Nn.z); aC.push(P0.x, P0.y - 0.03 * Nn.y, P0.z); aAx.push(0, 1, 0); aN.push(Nn.x, Nn.y, Nn.z); aCol.push(0, 0, 0); aInf.push(id, 3, 0, idRnd); }
        }
      }
    }
    heroGeo = new THREE.BufferGeometry();
    const A = (name, arr, n) => heroGeo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(arr), n));
    A('position', pos, 3); A('normal', nor, 3); A('aC', aC, 3); A('aAx', aAx, 3); A('aN', aN, 3); A('aCol', aCol, 3); A('aInf', aInf, 4);
    heroGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 16);
  }
  const NC = cells.length, TW = 64, TH = Math.max(1, Math.ceil(NC / TW));
  // per piece, live: turn and its speed, colour (until when), light, gone (fallen), last crossing
  const phi = new Float32Array(NC), vphi = new Float32Array(NC), colT = new Float32Array(NC).fill(-1), glow = new Float32Array(NC), gone = new Uint8Array(NC), resT = new Float32Array(NC).fill(-9);
  const stData = new Uint16Array(TW * TH * 4), toH = THREE.DataUtils.toHalfFloat;
  const stTex = new THREE.DataTexture(stData, TW, TH, THREE.RGBAFormat, THREE.HalfFloatType);
  stTex.magFilter = stTex.minFilter = THREE.NearestFilter; stTex.generateMipmaps = false; stTex.needsUpdate = true;

  const { Fn, attribute, uniform, varying, textureLoad, ivec2, int, float, vec3, vec4, modelWorldMatrix, normalize, mix, step, sin, cos, cross, dot, floor, mod, exp, abs, smoothstep, max, positionLocal, normalLocal, positionWorld, instancedBufferAttribute } = TSL;
  const uBed = uniform(1), uPush = uniform(0), uDoor = uniform(1);
  // THE THRESHOLDS: at the centre of every wall the mosaic opens in a tall arch (Gaudí's: straight jambs, a pointed round head) — cut
  // where the wall LOOKS, not in the mosaic: the serpentine turns and its pieces fold away as they reach the door and grow back past it.
  const DOOR_A = 0.9, DOOR_H = 1.95, DOOR_P = 4.5;   // half width, height (the keystone: a door at human scale) and roundness — y = H·(1 − |x/A|^P), metres ON THE WALL (the start ring, r 0.42 at 1.25 m, floats inside; the guide's words go above, as a lintel)
  const E3 = vec3(eye.x, eye.y, eye.z);
  function doorK(wc) {                        // 1 = there, 0 = inside a door (wc: the piece's centre in the world)
    let k = float(1);
    for (const w of walls) {
      const d = wc.sub(E3), dn = dot(d, vec3(w.normal.x, w.normal.y, w.normal.z));
      const t = float((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z).div(dn.min(-0.0001));
      const hp = E3.add(d.mul(t));
      const x = abs(dot(hp.sub(vec3(w.centre.x, w.centre.y, w.centre.z)), vec3(w.right.x, w.right.y, w.right.z))).div(uDoor), y = hp.y.div(uDoor);
      const edge = y.sub(float(DOOR_H).mul(float(1).sub(x.div(DOOR_A).min(1).pow(DOOR_P))));
      k = k.mul(max(max(smoothstep(-0.03, 0.2, edge), step(DOOR_A, x)), step(-0.0001, dn)));
    }
    return k;
  }
  function heroMaterial(reflection) {
    const m = new THREE.MeshPhysicalNodeMaterial({ envMap: env, envMapIntensity: reflection ? 0.35 : 0.7 });
    const aC_ = attribute('aC', 'vec3'), aAx_ = attribute('aAx', 'vec3'), aN_ = attribute('aN', 'vec3'), aCol_ = attribute('aCol', 'vec3'), aInf_ = attribute('aInf', 'vec4');
    const st = textureLoad(stTex, ivec2(int(mod(aInf_.x, TW)), int(floor(aInf_.x.div(TW)))));      // turn, lift, light, scale
    const bed = step(2.5, aInf_.y);
    const rotA = (v, a, c, s) => v.mul(c).add(cross(a, v).mul(s)).add(a.mul(dot(a, v)).mul(float(1).sub(c)));
    m.positionNode = Fn(() => {
      const ang = st.x.mul(float(1).sub(bed)), c = cos(ang), s = sin(ang);
      const wc0 = modelWorldMatrix.mul(vec4(aC_, 1)).xyz, wc = reflection ? vec3(wc0.x, wc0.y.negate(), wc0.z) : wc0;
      const local = positionLocal.sub(aC_).mul(mix(st.w, uBed, bed)).mul(doorK(wc));
      normalLocal.assign(rotA(normalLocal, aAx_, c, s));
      // 'start': the world closes in round the eye — the four doors come to the walls and pass them
      const inward = normalize(vec3(aC_.x, 0, aC_.z)).mul(uPush.negate());
      return aC_.add(rotA(local, aAx_, c, s)).add(aN_.mul(st.y.mul(float(1).sub(bed)))).add(inward);
    })();
    const face = aInf_.y, kind = aInf_.z, r = aInf_.w;
    const top = float(1).sub(step(0.5, face)), back = step(0.5, face).mul(float(1).sub(step(1.5, face))), side = step(1.5, face).mul(float(1).sub(step(2.5, face)));
    const kMir = step(0.5, kind).mul(float(1).sub(step(1.5, kind))), kGra = step(1.5, kind);
    const bone = vec3(...BONE).mul(r.mul(0.42).add(0.74));
    const restCol = mix(mix(bone, vec3(0.93, 0.94, 0.96), kMir), vec3(...GRAPHITE), kGra);
    // a piece turns a WHOLE turn to change colour (so it seats again in its own outline): its two faces swap what they show at the
    // half turn, when the public sees the other one. kc = 1: the face shows the glaze
    const packed = varying(st.z), kc = step(6, packed), g = packed.sub(kc.mul(8));
    const topCol = mix(restCol, aCol_, kc), backCol = mix(aCol_, restCol, kc);
    const topMir = kMir.mul(float(1).sub(kc)), backMir = kMir.mul(kc);
    // the quiet zones of every wall (art bible §4): behind the guide's words (±1.6 m × 1.75–2.2 m) and round the button (±0.9 m ×
    // 0.9–1.6 m) the mosaic stays in half shadow — a soft shade round the threshold, on whichever wall this fragment is seen
    let quiet = float(0);
    if (!reflection) for (const w of walls) {
      const d = positionWorld.sub(E3), dn = dot(d, vec3(w.normal.x, w.normal.y, w.normal.z));
      const t = float((w.centre.x - eye.x) * w.normal.x + (w.centre.y - eye.y) * w.normal.y + (w.centre.z - eye.z) * w.normal.z).div(dn.min(-0.0001));
      const hp = E3.add(d.mul(t)), x = abs(dot(hp.sub(vec3(w.centre.x, w.centre.y, w.centre.z)), vec3(w.right.x, w.right.y, w.right.z))), y = hp.y;
      const words = smoothstep(2.2, 1.6, x).mul(smoothstep(1.6, 1.85, y)).mul(smoothstep(2.7, 2.4, y));   // the words: a lintel inscription at 2.12 m (also fine at 1.75–2.2)
      const button = smoothstep(1.35, 0.9, x).mul(smoothstep(0.6, 0.9, y)).mul(smoothstep(1.9, 1.6, y));
      quiet = max(quiet, max(words, button).mul(step(dn, -0.0001)));
    }
    const dim = float(1).sub(quiet.mul(0.6)).mul(mix(float(0.75), float(1), kc));   // T-053 (ARTE r5): the mosaic at rest ×0.75 (the played colour stays full)
    const fade = reflection ? exp(positionWorld.y.mul(0.42)).mul(0.6) : float(1);
    m.colorNode = topCol.mul(top).add(backCol.mul(back)).add(vec3(0.42, 0.15, 0.065).mul(side)).add(vec3(0.042, 0.037, 0.032).mul(bed)).mul(dim).mul(fade);
    m.metalnessNode = top.mul(topMir).add(back.mul(backMir));
    m.roughnessNode = top.mul(mix(mix(float(0.28), float(0.2), kc), float(0.13), topMir)).add(back.mul(mix(float(0.28), float(0.13), backMir))).add(side.mul(0.85)).add(bed.mul(0.92));
    if (!reflection) { m.clearcoatNode = top.mul(float(1).sub(topMir)).mul(mix(float(0.22), float(1), kc)).add(back.mul(float(1).sub(backMir))); m.clearcoatRoughnessNode = float(0.045); }
    // the light of a crossing: the broken edges light up (thin: only they bloom), iridescent; the faces barely
    const iri = mix(mix(vec3(0.27, 0.77, 1.0), vec3(0.89, 0.38, 0.58), smoothstep(0.2, 0.55, r)), vec3(0.95, 0.68, 0.2), smoothstep(0.55, 0.9, r));
    m.emissiveNode = iri.mul(side.mul(1.5).add(top.add(back).mul(0.04))).mul(g).add(aCol_.mul(top.mul(kc).mul(0.15))).mul(dim).mul(fade);   // + the glaze holds a little light of its own: the colour reads wherever the lighthouse is
    return m;
  }
  const heroMesh = new THREE.Mesh(heroGeo, heroMaterial(false)); heroMesh.frustumCulled = false; hero.add(heroMesh);
  const heroRefl = new THREE.Mesh(heroGeo, heroMaterial(true)); heroRefl.frustumCulled = false; heroRefl.scale.y = -1; hero.add(heroRefl);

  // waves on the mosaic: the idle shimmer goes round for ever; hands launch rings
  const PULSES = 20, pulses = Array.from({ length: PULSES }, () => ({ on: false, s: 0, y: 0, t0: 0, amp: 1, speed: 2.6, reach: 0, hold: 0, ros: -1 }));
  let pulseNext = 0;
  function launch(s, y, amp, speed, reach, hold, ros = -1) { const p = pulses[pulseNext]; p.ros = ros; pulseNext = (pulseNext + 1) % PULSES; p.on = true; p.s = s; p.y = y; p.t0 = time; p.amp = amp; p.speed = speed; p.reach = reach; p.hold = hold; }
  // a point on a wall → the piece of the serpentine drawn there (the ray from the eye through the hand)
  const hit = { cu: 0, cy: 0, p: new THREE.Vector3() };
  function surfHit(pos) {
    const dx = pos.x - eye.x, dy = pos.y - eye.y, dz = pos.z - eye.z, dh = Math.hypot(dx, dz) || 1e-3, th = Math.atan2(dz, dx) + hero.rotation.y;
    let t = RM / dh, y = eye.y;
    for (let i = 0; i < 5; i++) { y = clamp(eye.y + t * dy, 0, YTOP); t = surfR(th, y) / dh; }
    hit.cu = ((th * RM) % LL + LL) % LL; hit.cy = clamp(eye.y + t * dy, 0, YTOP);
    hit.p.set(eye.x + dx * t, hit.cy, eye.z + dz * t);
    return hit;
  }

  // =========================================================================================== loose shards (instanced): mobiles, fallen pieces, far arcs
  // tile geometry: an irregular polygon, extruded thick with a rounded bevel, bent like a piece of a vase; group 0 = the face, 1 = back and sides
  function tileGeo(n, thick, curve) {
    const s = new THREE.Shape();
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rr(-0.3, 0.3) * (3 / n), r = rr(0.36, 0.54); const x = Math.cos(a) * r, y = Math.sin(a) * r * rr(0.7, 1); if (k) s.lineTo(x, y); else s.moveTo(x, y); }
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

  // ---- 0.3–0.9 m behind each wall: mobiles of big pieces on threads (the layer of parallax; what the hand hits directly)
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
  const motherKind = () => 0;   // AD#12: a resting mosaic — bone / graphite only (no chrome or glass gems)
  for (const w of walls) {                    // one mobile at each side of the wall: the middle (the threshold, the guide's words ±1.6 m, the button) stays clear
    const half = w.width / 2;
    for (const side of [-1, 1]) {
      const cx = side * rr(2.62, Math.max(2.64, half - 0.62)), d0 = rr(0.45, 0.8);
      hanging(w, cx, rr(2.3, 2.9), d0, rr(0.6, 0.85), motherKind(), true);                                    // the mother piece, high
      if (false) hanging(w, clamp(cx + side * rr(0.3, 0.6), -half + 0.35, half - 0.35), rr(1.5, 1.95), d0 - rr(0.1, 0.25), rr(0.38, 0.52), motherKind(), true);
      const n = 0;   // AD#12: fewer moving parts
      for (let i = 0; i < n; i++) {
        const x = clamp(cx + gauss() * 0.45, -half + 0.2, half - 0.2), y = rr(0.75, 1.5);
        if (Math.abs(x) < 1.9) continue;
        hanging(w, x, y, clamp(d0 + rr(-0.35, 0.1), 0.22, 0.9), rr(0.17, 0.3), rnd() < 0.3 ? 1 : rnd() < 0.12 ? 2 : 0, false);
      }
    }
  }

  // ---- the pool of fallen pieces of the serpentine (a glazed face, a mirror back)
  const NB = 220, bodies = [];
  for (let i = 0; i < NB; i++) { const s = shard('body', 0, 0.4); Object.assign(s, looseBody(), { cell: -1 }); bodies.push(s); }
  // pieces waiting their turn to let go (the chain of a cascade)
  const QN = 200, queue = Array.from({ length: QN }, () => ({ on: false, cell: 0, at: 0, power: 1 }));

  // ---- 13–21 m: arcs of big shards that turn with the far world
  const mid = [];
  for (const [R, y, n, dir, ph] of [[12.5, 1.9, 24, 1, 0.4], [16.5, 5.0, 22, -1, 2.1], [21, 8.5, 22, 1, 4.0]]) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(-0.08, 0.08);
    if (Math.sin(a * 3 + ph) < -0.2) continue;
    if (rnd() < 0.5) continue;   // AD#12: half the far arcs, ceramic only
    const s = shard('mid', 0, rr(0.7, 1.9));
    Object.assign(s, { R: R + rr(-0.8, 0.8), y: y + rr(-0.8, 0.8), a, dir, axis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), spin: rr(0.05, 0.2), ph: rr(0, 6.28), arriveAt: rr(0, 0.6) });
    if (s.kind === 0) { s.base = rnd() < 0.6 ? BONE : GRAPHITE; s.color = [...s.base]; }
    mid.push(s);
  }

  // ---- materials and meshes of the loose shards
  const mirrorM = new THREE.MeshPhysicalNodeMaterial({ color: 0xf2f3f6, metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: 1.0 });   // a soft mirror: the lighthouse leaves a sheen on it, not a burnt core
  function glazeMat(attr, glowU) {
    const m = new THREE.MeshPhysicalNodeMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: crackle, normalScale: new THREE.Vector2(0.5, 0.5), envMap: env, envMapIntensity: 1.0 });
    m.colorNode = vec3(instancedBufferAttribute(attr));
    if (glowU) m.emissiveNode = vec3(instancedBufferAttribute(attr)).mul(glowU);
    return m;
  }
  const glassM = new THREE.MeshPhysicalNodeMaterial({ color: 0xdfe6ff, roughness: 0.04, metalness: 0.35, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [200, 600], envMap: env, envMapIntensity: 1.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const glazeAttrs = counts.map((c) => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, c) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const meshes = MESHDEF.map(([kind, n, thick, curve], i) => {
    const m = kind === 2 ? [glassM, glassM] : kind === 1 ? [mirrorM, mirrorM] : [glazeMat(glazeAttrs[i]), mirrorM];
    const mesh = new THREE.InstancedMesh(tileGeo(n, thick, curve), m, Math.max(1, counts[i]));
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.renderOrder = kind === 2 ? 3 : 0;
    object.add(mesh); return mesh;
  });
  const paint = (s) => { glazeAttrs[s.mesh].setXYZ(s.idx, s.color[0], s.color[1], s.color[2]); glazeAttrs[s.mesh].needsUpdate = true; };
  for (const s of shards) glazeAttrs[s.mesh].setXYZ(s.idx, s.color[0], s.color[1], s.color[2]);
  // chips: what a broken piece becomes
  const CHIPS = 96, chips = [];
  const chipAttr = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const chipMesh = new THREE.InstancedMesh(tileGeo(4, 0.14, 0.15), [glazeMat(chipAttr), mirrorM], CHIPS);
  chipMesh.frustumCulled = false; chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.add(chipMesh);
  for (let i = 0; i < CHIPS; i++) chips.push({ on: false, owner: null, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 0.04, rest: false, from: new THREE.Vector3() });

  // threads of the mobiles (collapsed when a piece is not hanging)
  const threadPos = new Float32Array(band.length * 6);
  const threadGeo = new THREE.BufferGeometry(); threadGeo.setAttribute('position', new THREE.BufferAttribute(threadPos, 3).setUsage(THREE.DynamicDrawUsage));
  const threadMat = new THREE.LineBasicNodeMaterial({ color: new THREE.Color(0.5, 0.36, 0.25), transparent: true, opacity: 0.3, depthWrite: false });
  const threads = new THREE.LineSegments(threadGeo, threadMat); threads.frustumCulled = false; object.add(threads);

  // ---- the ring that becomes the start button: 30 glazed tiles per wall (the colours of the play)
  const RING_N = 30, RING_R = 0.42, RING_Y = 1.25, RING_D = 0.12;
  const ring = [], uRing = uniform(0);
  const ringAttr = new THREE.InstancedBufferAttribute(new Float32Array(NW * RING_N * 3), 3);
  const ringMesh = new THREE.InstancedMesh(tileGeo(5, 0.11, 0.2), [glazeMat(ringAttr, uRing), mirrorM], NW * RING_N);
  ringMesh.frustumCulled = false; ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.add(ringMesh);
  for (const w of walls) for (let k = 0; k < RING_N; k++) {
    const size = rr(0.12, 0.17), aspect = rr(1.0, 1.6), col = k % 3 === 1 ? GOLD : k % 3 === 2 ? [0.8, 0.78, 0.72] : BONE;
    const far = new THREE.Vector3().copy(w.centre).addScaledVector(w.right, rr(-w.width * 0.45, w.width * 0.45)).addScaledVector(w.normal, -rr(1.2, 3.2)).setY(rr(0.3, 3.4));
    ringAttr.setXYZ(ring.length, col[0], col[1], col[2]);
    ring.push({ wall: w.index, k, sc: new THREE.Vector3(size * aspect, size / aspect, size), a0: (k / RING_N) * Math.PI * 2, at: (k / RING_N) * 0.62 + rr(0, 0.06), far, ph: rr(0, 6.28), axis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), spin: rr(0.2, 0.6), ex: new THREE.Vector3(rr(-1, 1), rr(-0.4, 1), 0) });
  }

  // ---- the floor: a black gloss; the serpentine's mirror image shows through it
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(60, 72), new THREE.MeshBasicNodeMaterial({ color: 0x010101, transparent: true, opacity: 0.7, depthWrite: false }));
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = 0.001; floorMesh.renderOrder = 1; object.add(floorMesh);
  const HX = Math.max(...walls.map((w) => Math.abs(w.centre.x))) + 0.18, HZ = Math.max(...walls.map((w) => Math.abs(w.centre.z))) + 0.18;

  // ---- the jambs of the four thresholds: the wall's own edge — a splayed reveal of gold tiles set on edge, 0.7–1.3 m behind each
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
    for (const m of [jamb, emberRim]) { m.position.copy(foot).negate(); m.frustumCulled = false; pivot.add(m); }
    grp.add(pivot); grp.userData.pivot = pivot; object.add(grp); return grp;
  });

  // ---- far: glints, layers of haze, the thread of embers
  const FAR = 380, farMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }), FAR);
  farMesh.frustumCulled = false; world.add(farMesh);
  {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    for (let i = 0; i < FAR; i++) {
      const a = rr(0, Math.PI * 2), R = rr(22, 46), y = rr(0.5, 22) * rr(0.3, 1);
      p.set(Math.cos(a) * R, y, Math.sin(a) * R); q.setFromEuler(e.set(rr(0, 6), rr(0, 6), rr(0, 6))); const k = rr(0.04, 0.15) * (R / 25); s.set(k, k * rr(0.5, 2), k);
      farMesh.setMatrixAt(i, m.compose(p, q, s));
      const b = rr(0.08, 0.6) ** 2 * 2.2; if (rnd() < 0.18) c.setRGB(b * 1.2, b * 0.5, b * 0.22); else c.setRGB(b * 0.8, b * 0.88, b);
      farMesh.setColorAt(i, c);
    }
    farMesh.instanceMatrix.needsUpdate = true; farMesh.instanceColor.needsUpdate = true;
  }
  const ember = new THREE.Mesh(new THREE.TorusGeometry(38, 0.03, 6, 256), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.6, 0.62, 0.13) }));
  ember.rotation.x = Math.PI / 2; ember.position.y = 0.25; world.add(ember);
  const hazes = [];
  {
    const { uv } = TSL;
    for (const [R, H, cr, cg, cb, a, band_] of [[12, 12, 0.14, 0.28, 1.0, 0.022, 0], [19, 16, 0.14, 0.28, 1.0, 0.032, 0], [30, 22, 0.14, 0.28, 1.0, 0.05, 0], [40, 10, 1, 0.36, 0.1, 0.15, 1]]) {
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const y = uv().y;
      m.colorNode = band_ ? vec3(cr, cg, cb).mul(exp(y.sub(0.04).div(0.02).pow(2).negate()).mul(a * 2).add(exp(y.sub(0.04).div(0.2).pow(2).negate()).mul(a * 0.5)))
        : vec3(cr, cg, cb).mul(exp(y.mul(-3.2)).mul(a));
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), m); mesh.position.y = H / 2 - 0.1; world.add(mesh); hazes.push(mesh);
      if (band_) { const refl = new THREE.Mesh(mesh.geometry, m); refl.scale.y = -1; refl.position.y = -(H / 2 - 0.1); world.add(refl); hazes.push(refl); }   // the horizon's glow, mirrored in the gloss of the floor
    }
  }

  // ---- light: a zenith key, the LIGHTHOUSE that goes round the room, ember backlights behind the wall, the hands
  const hemi = new THREE.HemisphereLight(0xa8a49c, 0x0a0806, 0.34); object.add(hemi);
  const key = new THREE.DirectionalLight(0xffe6cc, 0.9); key.position.set(0.5, 10, 0.3); object.add(key);
  const beam = new THREE.SpotLight(0xfff0dc, 0, 0, 0.5, 1, 0);   // cone 0.72 → 0.5 rad (24-11, ENT): the beam no longer washes the near mosaic beam.position.set(0, 5.2, 0); object.add(beam, beam.target);
  const beam2 = new THREE.SpotLight(0xffeedd, 0, 0, 0.55, 1, 0); beam2.position.set(0, 0.9, 0); object.add(beam2, beam2.target);   // the second, cool and low: it rakes the relief from below
  const rims = [0, 1, 2].map((i) => { const l = new THREE.PointLight(0xff6b2e, 0, 15, 1.2); l.userData.a = (i / 3) * Math.PI * 2 + 0.4; world.add(l); return l; });
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
    if (!bc || fxCount >= 16 || !canEmit()) return;
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
  function stepLoose(s, dt) {
    if (s.state === 1) {
      const hh = s.sc.z * 0.1 + 0.008;
      if (integrateFree(s.p, s.v, s.q, s.w, dt, s, hh)) {
        const iv = -s.v.y;
        s.p.y = hh;
        if (iv > 4.3 && rnd() < 0.62) { fx('break', s.p, clamp(iv / 7, 0.5, 1), s.kind); breakTile(s, iv); }
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
    { const x = Math.abs(loc.x) / uDoor.value, y = loc.y / uDoor.value; if (x < DOOR_A && y < DOOR_H * (1 - (x / DOOR_A) ** DOOR_P) + 0.1) return false; }
    let b = null; for (const s of bodies) if (s.state === 0 && s.cell < 0) { b = s; break; }
    if (!b) return false;
    const c = cells[i];
    gone[i] = 1; goneN++; b.cell = i; b.state = 1; b.timer = 0; b.landed = false;
    cellPose(i, b.p, b.q); 
    const size = clamp(c.rad * 2.0, 0.2, 1.3); b.sc.set(size * rr(0.85, 1.15), size * rr(0.85, 1.15), Math.min(size, 0.55));
    _v.copy(c.n).applyAxisAngle(UP, hero.rotation.y);                                   // towards the public
    b.p.addScaledVector(_v, 0.12);
    b.v.copy(_v).multiplyScalar(rr(1.5, 3.3) * power).add(_v2.set(rr(-0.8, 0.8), rr(1.1, 2.7) * power, rr(-0.8, 0.8)));   // out of the wall, up and towards the public: it grows as it comes
    b.w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize().multiplyScalar(rr(3, 9));
    b.color[0] = c.col[0]; b.color[1] = c.col[1]; b.color[2] = c.col[2]; paint(b);
    return true;
  }
  function later(i, at, power) { for (const e of queue) if (!e.on) { e.on = true; e.cell = i; e.at = at; e.power = power; return; } }
  // the cascade: the column above a point lets go in a chain, from the point up to the crest
  function cascade(cu, cy, t) {
    let n = 0;
    if (goneN > 90) return 0;
    for (let i = 0; i < NC && n < 14; i++) {
      const c = cells[i]; if (gone[i] || c.loose || c.cy < cy - 0.35) continue;
      const du = Math.abs(wrapU(c.cu - cu)); if (du > 0.46 + (c.mother ? 0.3 : 0)) continue;
      if (rnd() < 0.2) continue;
      later(i, t + Math.max(0, c.cy - cy) * 0.17 + rr(0, 0.06), 0.8 + 0.4 * rnd()); n++;
    }
    return n;
  }
  // the piece of the mosaic nearest a point (-1: none within 1.6 m)
  function nearest(cu, cy) {
    let best = 2.56, bi = -1;
    for (let i = 0; i < NC; i++) { const c = cells[i]; if (c.loose) continue; const du = wrapU(c.cu - cu), dy = c.cy - cy, d = du * du + dy * dy - (c.mother ? 0.12 : 0); if (d < best) { best = d; bi = i; } }
    return bi;
  }
  // a knock: the pieces round a point let go in a SPIRAL, from the point outwards (a rosette comes undone petal by petal)
  const spiralI = new Int32Array(64), spiralK = new Float32Array(64);
  function knock(cu, cy, r, max_, power, t) {
    if (goneN > 100) return 0;
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
      if (k === 0) { if (letGo(spiralI[b], power)) done++; } else { later(spiralI[b], t + k * 0.045, power); done++; }
    }
    return done;
  }

  // a hand lands on the serpentine (surfHit done): the wave, the colour through its rosette, and pieces come down in a spiral
  function land(pos, under, hold) {
    const ros = under >= 0 ? cells[under].ros : -1, onHeart = under >= 0 && cells[under].mother;
    launch(hit.cu, hit.cy, 1, 2.6, 7, hold, ros);
    if (knock(hit.cu, hit.cy, onHeart ? 1.25 : 0.9, onHeart ? 13 : 9, 1, time)) fx('hit', pos, onHeart ? 0.9 : 0.6, 0);
  }

  // ------------------------------------------------------------------------------------------- the stand-in score (study page)
  let own = null, ownAfter = 0;
  const ownHands = Array.from({ length: 32 }, () => ({ stroke: null, wall: 0, dx: 0, speed: 0 })), ownList = [];

  // ------------------------------------------------------------------------------------------- state
  let time = 0, emptyT = 99, ghostAt = 2.5, rot = 0, heroRot = 0, ringSpin = 0, exploded = -1, revealV = 0, startV = 0, idleC = 0, wasRevealed = false, figT0 = -1, figK = 0, cascades = 0, crossings = 0, goneN = 0, pushV = 0, wasWait = true;
  const figAt = Array.from({ length: NW }, () => ({ cu: 0, cy: 0 }));
  const MAXH = 12, hcu = new Float32Array(MAXH), hcy = new Float32Array(MAXH), hfresh = new Uint8Array(MAXH);
  const HOLD = Array.from({ length: 16 }, () => ({ stroke: null, seen: 0, t0: 0, cu: 0, cy: 0, next: 0, ros: -1 }));
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
      if (S.block === 'wait' && !wasWait) { exploded = -1; pushV = 0; }
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
    revealV += (reveal - revealV) * (1 - Math.exp(-dt * 2.5)); startV += (start - startV) * (1 - Math.exp(-dt * 6));
    const playing = arrive > 0.6 && leave < 0.3;

    // ---- the room moves: the serpentine turns round the public, the far world the other way, and breathes
    heroRot += dt * 0.0175 * motion; hero.rotation.y = heroRot; _hq.setFromAxisAngle(UP, heroRot);
    rot -= dt * 0.011 * motion; world.rotation.y = rot; world.position.y = Math.sin(time * (Math.PI * 2 / 26)) * 0.3 * motion;
    const ba = time * (Math.PI * 2 / 26);                                               // the lighthouse: two lights, once round the room every 26 s
    beam.target.position.set(Math.cos(ba) * 9, 2.2, Math.sin(ba) * 9); beam2.target.position.set(Math.cos(ba + 2.5) * 9, 3.4, Math.sin(ba + 2.5) * 9);

    // ---- the reveal is whole: resonance (the figure spreads from the four buttons); 'start': the biggest wave
    if (reveal >= 1 && !wasRevealed && playing) {
      figT0 = time;
      for (let i = 0; i < NW; i++) { const w = walls[i]; surfHit(_v.copy(w.centre).setY(RING_Y)); figAt[i].cu = hit.cu; figAt[i].cy = hit.cy; launch(hit.cu, hit.cy, 0.9, 3.4, 0, 0); }
    }
    if (reveal < 1) figT0 = -1;
    wasRevealed = reveal >= 1;
    if (startEv) { exploded = 0; for (let i = 0; i < NW; i++) { surfHit(_v.copy(walls[i].centre).setY(RING_Y)); launch(hit.cu, hit.cy, 1.6, 5, 99, 30); } }
    if (exploded >= 0) exploded += dt;
    // 'start' (and the way out): the world closes in round the eye, eased, 2.5 s — every wall walks through its own door
    const pushT = Math.max(exploded >= 0 ? smooth(0, 2.5, exploded) : 0, smooth(0, 0.7, leave));
    pushV += (pushT - pushV) * (1 - Math.exp(-dt * (pushT > pushV ? 30 : 1.2)));
    uPush.value = 2.8 * pushV; uDoor.value = 1 + 3.2 * pushV * pushV;
    for (let i = 0; i < NW; i++) { const d = frames[i], k = 1 - smooth(0.75, 1, Math.max(pushV, leave)); d.position.copy(walls[i].normal).multiplyScalar(2.8 * pushV); d.userData.pivot.scale.setScalar(Math.max(0.001, smooth(0.3, 0.9, arrive) * k)); d.visible = arrive * k > 0.01; }
    const hold = 40 + 60 * revealV;                                                     // how long a touched piece keeps its colour

    // ---- hands: light, waves, knocks, cascades; the mobiles
    emptyT = hands.length ? 0 : emptyT + dt;
    let nh = 0;
    for (let i = 0; i < HL; i++) { const l = handLights[i]; if (!hands[i]) l.intensity *= Math.exp(-dt * 4); }
    if (playing) {
      for (const h of hands) {
        const w = walls[h.wall], hx = _v.subVectors(h.pos, w.centre).dot(w.right), hy = h.pos.y;
        const fresh = downs.includes(h), speed = Math.hypot(h.vx, h.vy);
        // a hand in the threshold (there is no mosaic there) plays the edge of the door nearest to it
        const da = hy < DOOR_H ? DOOR_A * Math.pow(1 - hy / DOOR_H, 1 / DOOR_P) : 0;
        if (Math.abs(hx) < da + 0.12) surfHit(_v3.copy(h.pos).addScaledVector(w.right, (hx < 0 ? -1 : 1) * (da + 0.38) - hx)); else surfHit(h.pos);
        if (nh < MAXH) { hcu[nh] = hit.cu; hcy[nh] = hit.cy; hfresh[nh] = fresh ? 1 : 0; nh++; }
        if (nh <= HL) { const l = handLights[nh - 1]; l.position.copy(hit.p).multiplyScalar(0.9).setY(hit.cy + 0.15); l.intensity += (2.0 * arrive * (1 - leave) - l.intensity) * (1 - Math.exp(-dt * 18)); }
        const under = nearest(hit.cu, hit.cy), ros = under >= 0 ? cells[under].ros : -1;
        if (fresh) land(h.pos, under, hold);
        const hd = holdOf(h.stroke);
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
          launch(cu, cy, 0.9, 2.2, 7, 16, cells[under].ros);
          surfP(cu, cy, _v).applyAxisAngle(UP, heroRot);
          if (u < 0.25) { if (cascade(cu, cy, time)) fx('hit', _v, 0.5, 0); } else if (u < 0.7) { if (knock(cu, cy, 0.8, 6, 0.8, time)) fx('hit', _v, 0.3, 0); }
        }
        const s = band[Math.floor(rnd() * band.length)];
        if (s.state === 0 && u > 0.5) { s.vax += rr(-0.5, 0.5); s.vyaw += rr(-3, 3); }
      }
    }
    // ---- the chain: pieces whose turn has come let go
    for (const e of queue) if (e.on && time >= e.at) { e.on = false; if (letGo(e.cell, e.power) && rnd() < 0.3) { cellPose(e.cell, _v, _q); fx('hit', _v, 0.3, 0); } }

    // ---- the mosaic: every piece follows the waves on a spring; colour where the play has been; light where waves cross
    idleC = (idleC + dt * 1.5) % LL;
    for (const p of pulses) if (p.on) { const age = time - p.t0; if (age > LL / 2 / p.speed + 2.5 || p.amp * Math.exp(-age / 7) < 0.03) p.on = false; }
    const figOn = figT0 >= 0 && arrive > 0.6, figR = figOn ? (time - figT0) * 4.2 : 0, figPh = time * 0.55;
    if (figOn) for (let k = 0; k < NW; k++) { surfHit(_v.copy(walls[k].centre).setY(RING_Y)); figAt[k].cu = hit.cu; figAt[k].cy = hit.cy; }   // the serpentine turns: the figure stays on the buttons
    figK += ((figOn ? 1 : 0) - figK) * (1 - Math.exp(-dt * 1.5));
    const kSpring = 30, cSpring = 6.2, glowDecay = Math.exp(-dt * 1.3), startGlow = startV * 0.7 + (exploded >= 0 && exploded < 2 ? Math.sin(exploded * Math.PI / 2) * 0.8 : 0);
    const bedK = smooth(0, 0.45, arrive) * (1 - smooth(0.35, 1, leave));
    uBed.value = bedK;
    for (let i = 0; i < NC; i++) {
      const c = cells[i], o = i * 4;
      let target, lift, sc = 1, turn, kc = 0;
      if (c.loose) {                                                                    // the crest dissolves: these float, turning slowly
        turn = time * (0.12 + c.r1 * 0.3) * (c.r2 < 0.5 ? -1 : 1) + c.r1 * 6.28;
        lift = 0.15 + c.over * (0.5 + c.r2) + Math.sin(time * 0.31 + c.r1 * 6.28) * 0.12; sc = 1 - 0.55 * c.over;
      } else {
        let ds = wrapU(c.cu - c.cy * 0.6 - idleC), sh = Math.exp(-(ds * ds) / 3.2);
        ds = wrapU(c.cu + c.cy * 0.4 + idleC * 0.6 - LL * 0.37); sh += 0.7 * Math.exp(-(ds * ds) / 2.2);
        let bump = 0, n = 0;
        for (let k = 0; k < PULSES; k++) {
          const p = pulses[k]; if (!p.on) continue;
          const d = wrapU(c.cu - p.s), dy = c.cy - p.y, dist = Math.sqrt(d * d + dy * dy), age = time - p.t0, r = p.speed * age, x = (dist - r) / 0.55;
          if (x > -2.6 && x < 2.6) {
            const b = p.amp * Math.exp(-x * x) * Math.exp(-age / 7); bump += b; if (b > 0.6) n++;
            if (p.hold > 0 && dist < p.reach && (p.ros < 0 || p.ros === c.ros) && x < 0.3 && b > 0.1 && colT[i] < time + p.hold) colT[i] = time + p.hold * (0.75 + 0.5 * c.r2);
          }
        }
        for (let k = 0; k < nh; k++) {                                                   // under a hand: at once
          const d = wrapU(c.cu - hcu[k]), dy = c.cy - hcy[k], dd = d * d + dy * dy;
          if (dd < 0.3) { colT[i] = time + hold * (0.75 + 0.5 * c.r2); if (hfresh[k]) { glow[i] = Math.max(glow[i], 1.0 * (1 - dd / 0.3)); vphi[i] += 5; } }
        }
        if (n >= 2 && time - resT[i] > 3) { resT[i] = time; glow[i] = 1.1; vphi[i] += 6 * (c.r2 < 0.5 ? -1 : 1); crossings++; }   // two fronts meet here
        let col = colT[i] > time ? 1 : 0, g = startGlow * (0.4 + 0.6 * c.r1);
        if (figOn) {                                                                    // resonance: the figure
          let fd = 1e9, f = 0;
          for (let k = 0; k < NW; k++) { const d = wrapU(c.cu - figAt[k].cu), dy = c.cy - figAt[k].cy; fd = Math.min(fd, d * d + dy * dy); }
          fd = Math.sqrt(fd); f = Math.cos(fd * 2.4 + figPh);                           // rings round the nearest button, closing slowly on it
          if (fd < figR) { if (f > 0.45 && !c.mother) { col = 0; g += 0.9; } else col = 1; }
        }
        if (g > glow[i]) glow[i] += (g - glow[i]) * Math.min(1, dt * 6);
        target = col * Math.PI + sh * 0.2 + Math.min(bump, 1.3) * 0.36;
        vphi[i] += (kSpring * (target - phi[i]) - cSpring * vphi[i]) * dt; phi[i] += vphi[i] * dt;
        turn = phi[i] * 2; kc = phi[i] > 1.5708 ? 8 : 0;
        lift = Math.abs(Math.sin(phi[i])) * c.rad * 0.95 + bump * 0.1 + sh * 0.04;
      }
      glow[i] *= glowDecay;
      // it comes (a sweep round the room: every piece flies to its bed, turning) and goes (breaks away, towards the public and up)
      const aAt = 0.5 * ((c.th / (Math.PI * 2) + c.r1 * 0.22) % 1), ka = smooth(aAt, aAt + 0.42, arrive), kl = smooth(c.r2 * 0.45, c.r2 * 0.45 + 0.5, leave);
      if (ka < 1 || kl > 0) { lift += (1 - ka) * (1 - ka) * 1.5 + kl * kl * 1.6; turn += (1 - ka) * 5 + kl * 4 * (c.r1 - 0.5) * 2; sc *= ka * (1 - kl); }
      if (gone[i]) sc = 0;
      stData[o] = toH(turn % 6.2831853); stData[o + 1] = toH(lift); stData[o + 2] = toH(Math.min(glow[i], 3.5) + kc); stData[o + 3] = toH(sc);
    }
    stTex.needsUpdate = true;

    // ---- the fallen pieces of the serpentine
    const vis0 = arrive * (1 - smooth(0, 0.6, leave));
    for (const b of bodies) {
      if (b.cell < 0) { meshes[b.mesh].setMatrixAt(b.idx, _m.makeScale(0, 0, 0)); continue; }
      if (stepLoose(b, dt)) { const i = b.cell; b.cell = -1; gone[i] = 0; goneN--; glow[i] = 1.4; vphi[i] += 6; colT[i] = Math.max(colT[i], time + hold); meshes[b.mesh].setMatrixAt(b.idx, _m.makeScale(0, 0, 0)); continue; }
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
    threadMat.opacity = 0.0;   // AD#12: no vertical threads

    // ---- chips
    for (let i = 0; i < CHIPS; i++) {
      const c = chips[i];
      if (!c.on) { chipMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const s = c.owner;
      if (s.state === 3) {
        if (!c.rest) {
          const hh = c.s * 0.1 + 0.004;
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
    ringSpin += dt * (0.05 + startV * 2.2);
    const ex = exploded >= 0 ? smooth(0, 2.2, exploded) : 0;
    for (let i = 0; i < ring.length; i++) {
      const s = ring[i], w = walls[s.wall], k = smooth(s.at, s.at + 0.32, revealV);
      _v.copy(s.far); _v.y += Math.sin(time * 0.3 + s.ph) * 0.25; _v.addScaledVector(w.right, Math.cos(time * 0.21 + s.ph) * 0.3);
      _q.setFromAxisAngle(s.axis, time * s.spin + s.ph);
      const a = s.a0 + ringSpin;
      _v2.copy(w.centre).addScaledVector(w.right, Math.cos(a) * RING_R).addScaledVector(w.normal, -RING_D); _v2.y = RING_Y + Math.sin(a) * RING_R;
      _q2.setFromAxisAngle(w.normal, a + Math.PI / 2).multiply(faceQ[s.wall]);
      _v.lerp(_v2, k); _v.y += Math.sin(k * Math.PI) * 0.5; _q.slerp(_q2, k);
      if (ex > 0) { _v.addScaledVector(w.right, s.ex.x * ex * 2.4).addScaledVector(w.normal, -ex * 1.5); _v.y += s.ex.y * ex * 2 + ex * ex * 0.5; _q.premultiply(_q2.setFromAxisAngle(s.axis, ex * 8)); }
      const vis = smooth(0, 0.5, arrive) * (1 - smooth(0.2, 0.9, leave)) * (1 - smooth(0.4, 1, ex)) * smooth(0, 0.25, k + (revealV > 0.02 ? 0.12 : 0));
      _s.copy(s.sc).multiplyScalar(vis);
      ringMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    }
    ringMesh.instanceMatrix.needsUpdate = true;
    uRing.value = arrive * (1 - leave) * (smooth(0.6, 1, revealV) * 0.25 + startV * 1.3) * (1 - ex) + (ex > 0 && ex < 1 ? Math.sin(ex * Math.PI) * 2.5 : 0);

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
    ember.material.color.setRGB(2.6 * farK, 0.62 * farK, 0.13 * farK);
    farMesh.visible = farK > 0.01; for (const h of hazes) h.visible = farK > 0.01;
    floorMesh.material.opacity = 0.7 * smooth(0, 0.3, farK); floorMesh.visible = farK > 0.005; heroRefl.visible = farK > 0.05;
    hemi.intensity = 0.46 * farK; key.intensity = 1.25 * farK; beam.intensity = 0.5 * farK; beam2.intensity = 0.45 * farK;   // T-053 (ARTE r5): the mosaic at rest ×0.75, the lighthouse capped (≈ 1.5 m of near-white tiles in P3)   // capped: near the walls the lighthouse leaves a sheen, not a white patch
    for (const l of rims) { l.position.set(Math.cos(l.userData.a) * 12.5, 1.2, Math.sin(l.userData.a) * 12.5); l.intensity = 5 * farK; }
  }

  return {
    object,
    update,
    setParams() { /* read live from params */ },
    touch(wall, x, y) { const w = walls[wall]; surfHit(_v2.copy(w.centre).addScaledVector(w.right, x).setY(y)); land(_v2, nearest(hit.cu, hit.cy), 40); },   // lab checks only: a landing at a point of a wall (x from its centre, y from the floor, m)
    debug: () => ({ env: envRT ? 'own' : room.envMap ? 'room' : 'none', pieces: NC, verts: heroGeo.attributes.position.count, mothers: cells.filter((c) => c.mother).length, loose: cells.filter((c) => c.loose).length, band: band.length, mid: mid.length, gone: gone.reduce((a, b) => a + b, 0), falling: bodies.filter((s) => s.state === 1).length + band.filter((s) => s.state === 1).length, resting: bodies.filter((s) => s.state >= 2).length, chips: chips.filter((c) => c.on).length, pulses: pulses.filter((p) => p.on).length, coloured: colT.reduce((a, t) => a + (t > time ? 1 : 0), 0), cascades, crossings, figure: figT0 >= 0, fxSent, reveal: revealV, start: startV }),
    dispose() {
      try { bc?.close(); } catch { /* closed */ }
      for (const m of meshes) m.dispose?.();
      heroGeo.dispose(); stTex.dispose(); envRT?.dispose?.(); crackle.dispose();
    },
  };
}
