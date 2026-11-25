// Ressonància — 3D part «fall3d»: the castell falls (contract: ../PARTS.md; GUION.md › Pom de dalt «si falla» = intent, La bajada
// «si todos sueltan» = carregat). T-036 (ola «Arte 2»): the fall re-made for the new world. Previous version (castell.js particles):
// fall3d.ARTE2.js.bak.
//
// The castell is now the assemblage tower of tronc3d (3D-FE). fall3d DIRECTS its fall and adds what makes it physical and final:
//   · which tower: carregat (from the bajada) — the tower on screen (ctx.parts.tronc3d, when the host shows it): fall3d calls its
//     collapse({ mode, duration }) at once. intent (after the Pom, no tower on screen) and the study — a PRIVATE tronc3d (never the
//     host's), built with the group's floors on the structure's walls, assembles from its fragments in the first 1.5 s (tronc3d's own
//     arrival), then collapses in what is left of the fall.
//   · tronc3d's script (rescaled): tremor · the crack (a flash at the floor that gives) · intent: the upper half leans and comes apart
//     from the top down; carregat: the floors let go from the bottom up and it sinks into itself · everything fades to black.
//   · on top, fall3d's own matter: every floor that lets go throws big SHARDS of glazed ceramic (irregular broken plates, terracotta
//     body, clearcoat glaze on the room's environment) that fall with gravity, spin, and land on what still stands (intent: the top of
//     the last standing floor) or on the square (carregat, when the plaza is there) — a hard landing BREAKS a shard into 3 small
//     tesserae that bounce and settle; every landing raises DUST (soft, warm grey, rising slowly, thinning). Each piece cools from a hot
//     gold edge to dark. Sound: 'ceramic' 'floor' / 'break' (ENT › Ola 2).
//   · the end: dust and shards thin out, and from duration − 3 s everything goes to black, slowly: ready for the acta.
// Study (?part=fall3d): params outcome, duration, floors, walls, arrive, leave, light; the host's t is the fall's clock (Run the clock).
import { canEmit } from '../emit.js';                 // only the room instance posts to the sound (the viewer would double every hit)
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the tronc's palette (art bible §2, linear): terracotta and glaze
const GLZ = [[0.55, 0.20, 0.08], [0.64, 0.28, 0.12], [0.03, 0.10, 0.48], [0.04, 0.32, 0.34], [0.78, 0.52, 0.07], [0.85, 0.82, 0.72], [0.42, 0.14, 0.06]];
const TOWER_D = 6.5;   // tronc3d: the towers stand 6.5 m beyond their walls
const OWN_TURN = 0.56;

export function create(ctx) {
  const { THREE, TSL, room } = ctx;
  const P = ctx.params || {};
  const { attribute, uniform, varying, vec3, vec4, float, vec2: vec2c, exp, dot, mix, smoothstep, select, modelViewMatrix, cameraProjectionMatrix, positionGeometry, uv } = TSL;
  const object = new THREE.Group(); object.name = 'fall3d';
  const walls = room.walls, NW = walls.length;
  const uEnd = uniform(1), uTime = uniform(0), uGain = uniform(1);
  const R = rng(1926);

  // ------------------------------------------------------------------------------------------------ the private tower (intent, study)
  let own = null;
  const ownP = { floors: 7, floorProgress: 0, cycle: 0, lean: 0, weak: 0, reward: false, walls: NW, rise: 1, arrive: 0, leave: 0, gain: 1, collapse: 'off', collapseDur: 10.5 };
  const ownIn = { time: 0, t: 0, dt: 0, progress: 0, hands: [], downs: [], ups: [], params: ownP, arrive: 0, leave: 0 };
  // AD 25-11 (album: «the old plaster mannequins in a grey void»): no private tower any more — without the host's tower on screen the
  // fall is a COLLAPSE OF DUST where the tower stood, in the night square. (The private tronc3d instance built the rejected bodies.)
  if (P.ownTower === true) import('./tronc3d.js').then((m) => {
    const keep = typeof window !== 'undefined' ? window.__tronc3d : undefined;   // the host's debug handle stays the host's
    own = m.create({ THREE, TSL, room, params: ownP, parts: {} });
    if (typeof window !== 'undefined' && keep) window.__tronc3d = keep;
    own.object.visible = false; own.object.rotation.y = OWN_TURN; object.add(own.object);
  }).catch(() => { own = null; });

  // ------------------------------------------------------------------------------------------------ shards (glazed ceramic, physical)
  function shardGeo(seed) {
    const r = rng(seed), n = 4 + Math.floor(r() * 3), sh = new THREE.Shape();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.9, rad = 0.32 + r() * 0.2; const x = Math.cos(a) * rad, y = Math.sin(a) * rad * (0.7 + r() * 0.4); if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
    g.translate(0, 0, -0.04); g.computeVertexNormals();
    return g;
  }
  const NGEO = 3, PER = 220;
  const heatA = [], meshes = [];
  for (let k = 0; k < NGEO; k++) {
    const g = shardGeo(31 + k * 7);
    const ha = new THREE.InstancedBufferAttribute(new Float32Array(PER), 1); ha.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aHeat', ha); heatA.push(ha);
    const heat = attribute('aHeat', 'float');
    // own shading (the glaze needs light to read): a key light from above, a cool rim (the bevel), a glaze highlight; the hot edge of a
    // fresh break burns gold → ember → dark (the instance colour tints it all: terracotta, cobalt, turquoise, ochre, white)
    const m = new THREE.MeshBasicNodeMaterial();
    const nW = TSL.normalWorld, nV = TSL.normalView, key = TSL.max(nW.y, 0).mul(0.55).add(0.1), rim = TSL.pow(float(1).sub(nV.z.abs()), 3);
    const spec = TSL.pow(TSL.max(TSL.dot(TSL.reflect(TSL.positionViewDirection.negate(), nV), vec3(0, 0.8, 0.6).normalize()), 0), 24);
    m.colorNode = vec3(key).add(rim.mul(0.5)).add(spec.mul(0.9)).add(mix(vec3(1.0, 0.22, 0.05), vec3(1.0, 0.72, 0.36), smoothstep(0.4, 1.0, heat)).mul(heat.mul(heat)).mul(3.0)).mul(uGain).mul(uEnd);
    m.fog = false;
    const im = new THREE.InstancedMesh(g, m, PER); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PER; i++) im.setColorAt(i, new THREE.Color(0, 0, 0));
    object.add(im); meshes.push(im);
  }
  const shards = [];
  for (let k = 0; k < NGEO; k++) for (let i = 0; i < PER; i++) shards.push({ mesh: meshes[k], geo: k, i, on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), size: 0, small: false, heat: 0, rest: 0, land: -1e9, tw: 0, col: GLZ[0], seed: R() });
  let nextShard = 0;
  function spawn(p, v, size, small, tw, heat, col) {
    if (P.shards !== true) return null;   // director 25-11: no solid shards (the tower dissolves into dust: tronc3d's fall); dust, light and embers only
    for (let n = 0; n < shards.length; n++) {
      const s = shards[(nextShard + n) % shards.length];
      if (s.on) continue;
      nextShard = (nextShard + n + 1) % shards.length;
      s.on = true; s.p.copy(p); s.v.copy(v); s.size = size; s.small = small; s.tw = tw; s.heat = heat; s.rest = 0; s.col = col;
      s.q.setFromEuler(eul.set(R() * 6, R() * 6, R() * 6)); s.w.set((R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 9);
      return s;
    }
    return null;
  }
  const eul = new THREE.Euler();

  // ------------------------------------------------------------------------------------------------ dust: soft puffs that rise and thin
  const ND = 220;
  const dA = new THREE.InstancedBufferAttribute(new Float32Array(ND * 4), 4), dB = new THREE.InstancedBufferAttribute(new Float32Array(ND * 4), 4);
  dA.setUsage(THREE.DynamicDrawUsage); dB.setUsage(THREE.DynamicDrawUsage);
  const dGeo = new THREE.InstancedBufferGeometry();
  dGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  dGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  dGeo.setIndex([0, 1, 2, 0, 2, 3]); dGeo.setAttribute('dA', dA); dGeo.setAttribute('dB', dB); dGeo.instanceCount = ND;
  {
    const a = attribute('dA', 'vec4'), b = attribute('dB', 'vec4');   // a: xyz, radius · b: alpha, seed, warm, -
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mv = modelViewMatrix.mul(vec4(a.xyz, 1));
    m.vertexNode = select(b.x.greaterThan(0.001), cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(a.w)), mv.z, mv.w)), vec4(0, 0, 2, 1));
    const vB = varying(b), q = uv().sub(0.5).mul(2), r2 = dot(q, q);
    const lump = TSL.sin(q.x.mul(5).add(vB.y.mul(40))).mul(TSL.sin(q.y.mul(4).sub(vB.y.mul(23)))).mul(0.25).add(0.75);
    m.colorNode = mix(vec3(0.32, 0.36, 0.38), vec3(0.6, 0.42, 0.3), vB.z).mul(exp(r2.mul(-3.2))).mul(lump).mul(vB.x).mul(0.03).mul(uGain).mul(uEnd);
    m.fog = false;
    const dm = new THREE.Mesh(dGeo, m); dm.frustumCulled = false; dm.renderOrder = 6; object.add(dm);
  }
  const dust = []; for (let i = 0; i < ND; i++) dust.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, r1: 0, t: 0, life: 1, a: 0, seed: R(), warm: R() });
  let nextDust = 0;
  function puff(p, n, big) {
    for (let k = 0; k < n; k++) {
      const d = dust[nextDust]; nextDust = (nextDust + 1) % ND;
      d.on = true; d.t = 0; d.life = 4 + R() * 4 * (big ? 1.5 : 1); d.p.copy(p); d.p.x += (R() - 0.5) * 0.4; d.p.z += (R() - 0.5) * 0.4;
      d.v.set((R() - 0.5) * 0.5, 0.12 + R() * 0.25, (R() - 0.5) * 0.5); d.r = 0.08 + R() * 0.1; d.r1 = (big ? 0.9 : 0.45) + R() * 0.4; d.a = 0.6 + R() * 0.4;
    }
  }

  // ------------------------------------------------------------------------------------------------ the night (art 14:30)
  // a blue night round the whole room (additive: it never hides the world it replaces), embers rising from where the tower stood on
  // every wall, and warm pools of lamp light on the ground; all of it goes out with the end of the fall
  const uVis = uniform(1);
  {
    const g = new THREE.SphereGeometry(70, 32, 16), m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = TSL.normalize(TSL.positionLocal), y = d.y;
    m.colorNode = mix(vec3(0.011, 0.019, 0.052), vec3(0.002, 0.004, 0.014), smoothstep(-0.05, 0.6, y)).add(vec3(0.03, 0.022, 0.03).mul(TSL.pow(float(1).sub(y.abs()), 10))).mul(uVis).mul(uEnd);
    m.fog = false;
    const dome = new THREE.Mesh(g, m); dome.frustumCulled = false; dome.renderOrder = -10; object.add(dome);
  }
  {   // embers: 1800 sparks rising slowly from the four walls' feet, flickering, cooling as they climb
    const N = 1800, A = new Float32Array(N * 4 * 8), idx = new Uint32Array(N * 6), C = [[-1, -1], [1, -1], [1, 1], [-1, 1]], re = rng(77);
    for (let k = 0; k < N; k++) {
      const w = walls[k % NW], u = (re() - 0.5) * 1.6, dep = 3 + re() * 9;
      const x = w.centre.x + w.right.x * u * (w.width / 2 + dep * 0.9) - w.normal.x * dep, z = w.centre.z + w.right.z * u * (w.width / 2 + dep * 0.9) - w.normal.z * dep;
      const rnd = re(), sp = 0.15 + re() * 0.35;
      for (let q = 0; q < 4; q++) A.set([x, -0.5 + re() * 0.2, z, C[q][0], C[q][1], rnd, sp, re()], (k * 4 + q) * 8);
      const b = k * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], k * 6);
    }
    const ib = new THREE.InterleavedBuffer(A, 8), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('aE', new THREE.InterleavedBufferAttribute(ib, 4, 3)); g.setAttribute('aE2', new THREE.InterleavedBufferAttribute(ib, 1, 7));
    const pos = attribute('position', 'vec3'), e = attribute('aE', 'vec4'), e2 = attribute('aE2', 'float');
    const life = TSL.fract(uTime.mul(e.w.mul(0.12)).add(e.z)), hgt = life.mul(e.w.mul(14).add(3));
    const p = pos.add(vec3(TSL.sin(uTime.mul(0.7).add(e.z.mul(40))).mul(0.4).mul(life), hgt, TSL.cos(uTime.mul(0.6).add(e.z.mul(23))).mul(0.4).mul(life)));
    const mv = modelViewMatrix.mul(vec4(p, 1));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(vec2c(e.x, e.y).mul(0.045)), mv.z, mv.w));
    const vL = varying(life), vR = varying(e2), q = uv().sub(0.5).mul(2), rr = dot(q, q);
    const flick = TSL.pow(TSL.sin(uTime.mul(vR.mul(9).add(4)).add(vR.mul(60))).mul(0.5).add(0.5), 3).mul(0.7).add(0.3);
    m.colorNode = mix(vec3(1.0, 0.62, 0.25), vec3(0.8, 0.12, 0.03), smoothstep(0.2, 0.9, vL)).mul(exp(rr.mul(-5))).mul(flick).mul(float(1).sub(smoothstep(0.6, 1.0, vL))).mul(smoothstep(0.0, 0.05, vL)).mul(2.6).mul(uVis).mul(uEnd);
    m.fog = false;
    const em = new THREE.Mesh(g, m); em.frustumCulled = false; em.renderOrder = 7; object.add(em);
  }
  {   // lamp pools: three warm pools of light on the ground beyond every wall (the square's lamps, still lit)
    const N = NW * 3, g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const q = uv().sub(0.5).mul(2), rr = dot(q, q);
    m.colorNode = vec3(1.0, 0.55, 0.24).mul(exp(rr.mul(-4.5))).mul(float(1).sub(smoothstep(0.8, 1.0, rr))).mul(0.09).mul(uVis).mul(uEnd);
    m.fog = false;
    const im = new THREE.InstancedMesh(g, m, N); im.frustumCulled = false; im.renderOrder = 2;
    const M = new THREE.Matrix4(), rp = rng(5);
    for (let k = 0; k < N; k++) { const w = walls[Math.floor(k / 3)], u = ((k % 3) - 1) * 0.42 * w.width, dep = 2.5 + rp() * 3.5, sz = 3.5 + rp() * 2.5;
      M.makeScale(sz, 1, sz).setPosition(w.centre.x + w.right.x * u - w.normal.x * dep, 0.01, w.centre.z + w.right.z * u - w.normal.z * dep); im.setMatrixAt(k, M); }
    object.add(im);
  }

  // ------------------------------------------------------------------------------------------------ sound (ENT › Ola 2)
  let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
  const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
  let fxN = 0, fxT = 0;
  function fxImpact(wall, u, strength, mat, kind) {
    if (!fxBc || fxN >= 16 || !canEmit()) return; fxN++;
    fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
    try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
  }
  const fxP = new THREE.Vector3();
  function fxAt(pl, strength, mat, kind) {   // pl: a point in this part's frame
    fxP.copy(pl).applyMatrix4(object.matrixWorld);
    const W = walls, e = room.eye, dx = fxP.x - e.x, dz = fxP.z - e.z; let wi = 0, best = -Infinity;
    for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
    const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
    fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
  }

  // ------------------------------------------------------------------------------------------------ the fall's state
  const inv = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  const towerBase0 = walls.map((w) => w.centre.clone().addScaledVector(w.normal, -(ctx.parts?.tronc3d?.towerD ?? TOWER_D)));   // world (x, z): the real tower (2.3 m since M3)
  // the private towers are turned 32° round the room so that each stands beside the words, not behind them (biblia §4 quiet zones)
  const towerBaseOwn = towerBase0.map((b) => new THREE.Vector3(b.x * Math.cos(OWN_TURN) + b.z * Math.sin(OWN_TURN), 0, -b.x * Math.sin(OWN_TURN) + b.z * Math.cos(OWN_TURN)));
  let towerBase = towerBase0;
  const spawned = walls.map(() => new Uint8Array(12)), landY = new Float32Array(NW).fill(-1e9);
  let src = null, srcOwn = false, started = false, clock = -1, prevBlock = '', lastT = 0, levelsAt = -1, outcome = 'intent', floorsGroup = 7, ended = false;
  const G = 7.5;
  let brkAt = -9;

  function begin(intent, dur, S) {
    started = true; ended = false;
    for (const f of spawned) f.fill(0);
    for (const s of shards) s.on = false; for (const d of dust) d.on = false;
    const host = ctx.parts?.tronc3d, glass = ctx.parts?.baixada3d;
    const hostShown = !!(host && host.collapse && host.object && host.object.visible && host.object.parent);
    glassFall = !intent && !!(glass && glass.object && glass.object.visible); towerBase = towerBase0; dustFall = false;
    if (glassFall) {                                   // carregat from the bajada: baixada3d's glass tower IS the castell and lets go
      src = host && host.levels ? host : null; srcOwn = false;   // on its own; the tronc tower it hid must stay hidden (no second tower)
      veilAt = 0;
    } else if (hostShown) {                                   // carregat (or any fall with the tower on screen): this tower falls
      src = host; srcOwn = false;
      if (!host.collapsing?.on) host.collapse({ mode: intent ? 'intent' : 'carregat', duration: dur });
    } else if (P.ownTower === true) {                  // (old: the group's tower, assembled here — only on request)
      src = own; srcOwn = true; towerBase = towerBaseOwn;
      framed = false;
    } else {                                           // no tower on screen: a collapse of dust where it stood
      src = null; srcOwn = false; dustFall = true; veilAt = 0;
    }
    void S;
  }
  // frame the private tower for its fall: tronc3d's room rise follows the forming floor; here it is scaled so that (intent) the stump
  // that stays (the top of the floor under the crack) sits at the foot of the walls, and the floors that fall come down through the
  // whole height of the walls; (carregat) the top of the tower at ~6.5 m. A reset (floors 9 → N) makes tronc3d jump to the new rise.
  let framed = false, glassFall = false, veilAt = -1, dustFall = false;
  function frame(intent, n) {
    ownP.collapse = 'off'; ownP.rise = 1; ownP.floors = n; ownIn.time = 0; ownIn.arrive = 0;
    own.update(0.016, ownIn);
    const T = own.levels()[0]; if (!T) return;
    const r0 = own.rise, brk = intent ? Math.max(1, Math.round(n * 0.62)) : 1, f = T.floors;
    const want = intent ? (f[brk - 1].y + f[brk - 1].h / 2) - -0.6 : (f[n].y + f[n].h / 2) - 6.5;   // how much more the room must rise
    ownP.rise = r0 > 0.01 ? Math.max(0, (r0 + want) / r0) : 1;
    ownP.floors = 9; own.update(0.016, ownIn); ownP.floors = n; own.update(0.016, ownIn);
    framed = true;
  }
  function end() {
    started = false; clock = -1;
    if (own) { ownP.collapse = 'off'; own.object.visible = false; }
  }

  function update(dt, input) {
    dt = Math.min(0.05, Math.max(0, dt || 0.016));
    fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
    const S = input.state, time = input.time ?? 0;
    uTime.value = time % 1000;
    const arrive = clamp01(input.arrive ?? (P.arrive ?? 1)), leave = clamp01(input.leave ?? (P.leave ?? 0));
    const dur = Math.max(6, Number(P.duration) || 15);
    // ---- the clock of the fall
    let t;
    if (S) {
      if (S.block === 'fall' && prevBlock !== 'fall') { clock = 0; outcome = S.outcome || 'intent'; floorsGroup = input.acta?.floors || S.stats?.maxFloors || S.floors || 7; ownP.walls = NW; begin(outcome !== 'carregat', dur, S); }
      prevBlock = S.block;
      if (clock >= 0) clock += dt;
      t = S.block === 'fall' ? S.t : clock;
      if (S.block !== 'fall' && leave >= 0.999) end();
    } else {
      t = input.t ?? 0;
      outcome = P.outcome || 'intent'; floorsGroup = Number(P.floors) || 7; ownP.walls = Math.max(1, Math.min(NW, Math.round(P.walls ?? NW)));
      if (!started || t < lastT - 0.25) begin(true, dur, null);   // the study: a private tower always (outcome sets its mode); a clock jump restarts
      lastT = t;
    }
    if (!started) { object.visible = false; return; }
    object.visible = arrive * (1 - leave) > 0.001 || srcOwn;
    const intent = outcome !== 'carregat';
    uGain.value = Number(P.light ?? 1) * (1 - leave); uVis.value = Math.min(arrive, 1) * (1 - leave);
    uEnd.value = 1 - smooth(dur - 3.2, dur - 0.4, t);
    // ---- the private tower: assemble (1.5 s), then collapse in the rest
    const TA = 1.5;
    if (srcOwn && !own) return;   // still loading
    if (srcOwn) {
      if (src !== own) src = own;
      own.object.visible = true;
      ownP.floors = Math.max(2, Math.min(9, Math.round(floorsGroup)));
      ownP.collapse = t >= TA ? (intent ? 'intent' : 'carregat') : 'off'; ownP.collapseDur = Math.max(4, dur - TA);
      ownP.gain = uGain.value;
      ownIn.time = t + 0.5; ownIn.t = t; ownIn.dt = dt;   // tronc3d (study mode) starts its collapse when time > 2, i.e. t > 1.5
      ownIn.arrive = Math.min(arrive, smooth(0, TA, t)); ownIn.leave = leave;
      if (!framed) { const keep = ownP.collapse; frame(intent, ownP.floors); ownP.collapse = keep; }
      own.update(dt, ownIn);
    }
    object.updateMatrixWorld(); inv.copy(object.matrixWorld).invert();

    // ---- carregat from the bajada: the glass tower falls by itself (baixada3d); here the tronc stays hidden and a veil of dust rises
    if (dustFall && t < 7 && time - veilAt > 0.08) {   // the dust collapse: puffs falling down the tower's height, then settling
      veilAt = time;
      for (let w = 0; w < NW; w++) {
        const b = towerBase[w], a = R() * Math.PI * 2, rr = R() * 1.6, hgt = Math.max(0.2, 7 * (1 - t / 6)) * R();
        tmpV.set(b.x + Math.cos(a) * rr, hgt, b.z + Math.sin(a) * rr).applyMatrix4(inv); puff(tmpV, 1, true);
      }
    }
    if (glassFall) {
      const host = ctx.parts?.tronc3d;
      if (host?.takeFloor && !ctx.parts?.baixada3d?.object?.visible) for (let i = 0; i <= 9; i++) host.takeFloor(i, { hide: true });   // once the bajada has given its floors back
      if (t < 5 && time - veilAt > 0.12) {
        veilAt = time;
        for (let w = 0; w < NW; w++) {
          const b = towerBase[w], a = R() * Math.PI * 2, rr = R() * 2.4;
          tmpV.set(b.x + Math.cos(a) * rr, R() * 1.5, b.z + Math.sin(a) * rr).applyMatrix4(inv); puff(tmpV, 1, true);
        }
      }
    }
    // ---- the floors that let go throw their shards (polled at 10 Hz from tronc3d.levels(): world heights)
    if (!glassFall && src && src.levels && time - levelsAt > 0.1) {
      levelsAt = time;
      const plazaY = ctx.parts?.plaza?.object?.visible ? 0 : -1e9;
      for (const T of src.levels()) {
        const tw = T.tower; if (tw >= NW) continue;
        let top = -1e9;
        for (const f of T.floors) if (f.i <= T.built && !f.gone && !f.taken) top = Math.max(top, f.y + f.h / 2);
        landY[tw] = Math.max(top, plazaY);
        for (const f of T.floors) {
          if (!f.gone || spawned[tw][f.i] || f.i > T.built) continue;
          spawned[tw][f.i] = 1;
          const b = towerBase[tw], n = 14 + Math.floor(f.h * 10);
          for (let k = 0; k < n; k++) {
            const a = R() * Math.PI * 2, rr = 0.4 + R() * 1.6;
            tmpV.set(b.x + Math.cos(a) * rr, f.y + (R() - 0.5) * f.h, b.z + Math.sin(a) * rr).applyMatrix4(inv);
            const out = intent ? 0.5 + R() * 1.3 : 0.3 + R() * 0.6;
            tmpV2.set(Math.cos(a) * out, intent ? 0.6 + R() * 2.2 : -0.3 - R() * 0.6, Math.sin(a) * out);
            spawn(tmpV, tmpV2, 0.3 + Math.pow(R(), 1.5) * 0.5, false, tw, 1, GLZ[Math.floor(R() * GLZ.length)]);
          }
          tmpV.set(b.x, f.y, b.z).applyMatrix4(inv); puff(tmpV, 2, false); fxAt(tmpV, 0.9, 'stone', 'break');
        }
      }
    }

    // ---- shards: gravity, spin, landing (a hard landing breaks a big one into three), settle, cool
    for (const s of shards) {
      if (!s.on) continue;
      s.heat = Math.max(0, s.heat - dt * 0.45);
      if (s.rest < 1) {
        s.v.y -= G * dt; s.p.addScaledVector(s.v, dt);
        tmpV.copy(s.p).applyMatrix4(object.matrixWorld);
        const b = towerBase[s.tw], onTop = Math.hypot(tmpV.x - b.x, tmpV.z - b.z) < 3.2, gy = onTop || landY[s.tw] <= -1e8 + 1 ? landY[s.tw] : Math.max(-1e9, ctx.parts?.plaza?.object?.visible ? 0 : -1e9);
        const hs = s.size * 0.06;
        if (gy > -1e8 && tmpV.y - hs < gy && s.v.y < 0) {
          const force = -s.v.y;
          tmpV.y = gy + hs; s.p.copy(tmpV).applyMatrix4(inv);
          if (!s.small && force > 2.2) {                 // breaks: three tesserae, a puff
            s.on = false;
            for (let k = 0; k < 3; k++) { tmpV2.set((R() - 0.5) * 2.4, force * (0.25 + R() * 0.2), (R() - 0.5) * 2.4); spawn(s.p, tmpV2, s.size * (0.4 + R() * 0.15), true, s.tw, Math.max(s.heat, 0.7), s.col); }
            puff(s.p, 2, false); if (time - brkAt > 0.34) { brkAt = time; fxAt(s.p, Math.min(1, force / 7), 'ceramic', 'break'); }
            continue;
          }
          if (force > 1.2) { puff(s.p, 1, false); fxAt(s.p, Math.min(1, (force - 1.2) / 4), 'ceramic', 'floor'); }
          s.v.y = force * 0.35; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.55);
          if (force < 0.8) { s.rest = 1; s.v.set(0, 0, 0); s.w.set(0, 0, 0); }
        }
        if (tmpV.y < -40) { s.on = false; continue; }
        const wl = s.w.length(); if (wl > 1e-4) { tmpQ.setFromAxisAngle(tmpV2.copy(s.w).multiplyScalar(1 / wl), wl * dt); s.q.premultiply(tmpQ); }
      }
    }
    for (let k = 0; k < NGEO; k++) {
      const im = meshes[k], ha = heatA[k].array;
      for (let i = 0; i < PER; i++) {
        const s = shards[k * PER + i];
        if (!s.on) { tmpM.makeScale(0, 0, 0); im.setMatrixAt(i, tmpM); ha[i] = 0; continue; }
        const sc = s.size * uEnd.value;
        tmpM.compose(s.p, s.q, tmpS.set(sc, sc, sc)); im.setMatrixAt(i, tmpM);
        tmpC.setRGB(s.col[0], s.col[1], s.col[2]); im.setColorAt(i, tmpC); ha[i] = s.heat;
      }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; heatA[k].needsUpdate = true;
    }
    // ---- dust
    const da = dA.array, db = dB.array;
    for (let i = 0; i < ND; i++) {
      const d = dust[i];
      if (d.on) { d.t += dt; if (d.t > d.life) d.on = false; }
      if (!d.on) { db[i * 4] = 0; continue; }
      const k = d.t / d.life;
      d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.max(0, 1 - dt * 0.4)); d.v.y += dt * 0.02;
      da[i * 4] = d.p.x; da[i * 4 + 1] = d.p.y; da[i * 4 + 2] = d.p.z; da[i * 4 + 3] = d.r + (d.r1 - d.r) * Math.sqrt(k);
      db[i * 4] = d.a * smooth(0, 0.08, k) * (1 - smooth(0.35, 1, k)); db[i * 4 + 1] = d.seed; db[i * 4 + 2] = d.warm;
    }
    dA.needsUpdate = true; dB.needsUpdate = true;
  }

  if (typeof window !== 'undefined') window.__fall3d = { get shards() { return shards.filter((s) => s.on).length; }, get dust() { return dust.filter((d) => d.on).length; }, get src() { return srcOwn ? 'own' : src ? 'host' : null; }, get own() { return !!own; }, get ownApi() { return own; }, ownP, ownIn };
  return {
    object,
    update,
    setParams(p) { if (p && p !== P) Object.assign(P, p); },
    dispose() { try { fxBc?.close(); } catch { /* closed */ } for (const im of meshes) { im.geometry.dispose(); im.material.dispose(); } dGeo.dispose(); own?.dispose?.(); },
  };
}
