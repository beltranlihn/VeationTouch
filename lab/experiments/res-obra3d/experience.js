// Ressonància — the whole work in 3D. The score (../ressonancia/score.js) walks the pass from the wait to the acta; every block shows
// its universe as a set of 3D PARTS (../ressonancia/scenes3d/parts, contract in PARTS.md) in the CAVE of room3d.js; over them, the
// guide (../ressonancia/scenes3d/guide3d.js): hand targets and the words on the walls.
//
// Block → parts (a chapter part that is not on disk yet is replaced by a stand-in made of the parts that are):
//   wait     brasa3d (embers, progress 0.05) + atmos                 stand-in: atmos
//   intro    plaza + atmos + castell + introtext, on the intro's clock (input.t = state.t)
//   brasa    brasa3d + atmos                                         stand-in: atmos
//   pinya    pinya3d + atmos                                         stand-in: castell (the pinya alone, rising with each wall's fill)
//   tronc    plaza at rest (it arrives by reassembling: shatter 1 → 0) + castell on the castell's walls only, built floor by floor,
//            leaning with lean[w], trembling with weak[w], a warm flash on each floor + atmos
//   pom      pom3d                                                   stand-in: plaza + castell (the pom de dalt climbs) + atmos
//   crown, festa   festa3d                                           stand-in: plaza + castell crowned + atmos
//   baixada  plaza + castell (coming down floor by floor) + atmos
//   fall     the castell dissolves (~6 s) and the square shatters (whatever of them is there)
//   acta     actatext + atmos
// Transitions (fragmentation is the work's language): a part that comes in gets input.arrive 0 → 1 over ~5 s, a part that goes gets
// input.leave 0 → 1 over ~5 s and is hidden (and no longer updated) once gone; the two cross. Parts without arrive/leave use their
// own means: plaza `shatter`, castell `build`/`dissolve`, atmos its amounts, introtext its own fade.
//
// The score: the sound piece leads when it is there (it posts its state on BroadcastChannel('ressonancia'); LOCAL WORKAROUND, as in
// res-obra: the runtime has no channel between a visual piece and its sound piece); with nothing arriving this page runs its own.
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../ressonancia/scenes3d/room3d.js';
import { createScore, TIMES } from '../ressonancia/score.js';
import { createGuide } from '../ressonancia/scenes3d/guide3d.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const q = new URLSearchParams(location.search);
const P = Object.assign({ jump: 'none', pace: 1, guide: true, bloom: 0.6, exposure: 1, quality: 'high', renderer: 'auto' }, vt.params);
if (q.get('q3')) P.quality = q.get('q3');                          // lab only (review.html): the 3D quality from the URL
const QS = { low: 0.6, medium: 0.8, high: 1 }, DENS = { low: 0.4, medium: 0.6, high: 1 };
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', bloom: { strength: P.bloom }, exposure: P.exposure, renderScale: QS[P.quality] ?? 1, samples: P.quality === 'high' ? 2 : 0 });   // MSAA 2 at high (T-011, DECISIONES 23:26; was 4)
const NW = room.walls.length;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
const TR = 5;                                                      // a transition, s

// ------------------------------------------------------------------------------------------------ the parts
const NAMES = ['atmos', 'plaza', 'castell', 'tronc3d', 'fall3d', 'introtext', 'actatext', 'brasa3d', 'pinya3d', 'pom3d', 'festa3d', 'baixada3d'];
const CHAPTERS = new Set(['brasa3d', 'pinya3d', 'pom3d', 'festa3d', 'baixada3d', 'fall3d', 'tronc3d']);
const parts = {}, byName = {}, list = [];
const only = q.get('parts');                                       // lab: ?parts=plaza,castell loads only those
async function exists(url) { try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; } }
for (const name of NAMES) {
  if (only && !only.split(',').includes(name)) continue;
  const src = new URL(`../ressonancia/scenes3d/parts/${name}.js`, import.meta.url);
  if (CHAPTERS.has(name) && !(await exists(src))) { console.info(`res-obra3d: part "${name}" is not there yet; its stand-in plays`); continue; }
  try {
    const params = {};
    const defsUrl = new URL(`../res-3d-study/parts/${name}.json`, import.meta.url);
    const defs = (await exists(defsUrl)) ? await fetch(defsUrl).then((r) => r.json()).catch(() => []) : [];
    for (const d of defs) params[d.key] = d.default;
    if (name === 'atmos') params.demoLamps = false;                // the square's own lamps light the dust
    if (name === 'plaza') params.glow = 0.3;                       // atmos draws the lamps' glow in the air too
    if (name === 'castell') params.density = DENS[P.quality] ?? 1;
    if (name === 'fall3d') params.duration = TIMES.fall;           // its 15 s script rescaled to the score's fall
    const part = (await import(src.href)).create({ THREE, TSL, room, params, parts: byName });
    part.object.visible = false; room.scene.add(part.object);
    const lights = []; part.object.traverse((o) => { if (o.isPointLight) lights.push(o); });
    // A part's moon / sky lights (directional, hemisphere) stay in the scene for good, at intensity 0 while the part is gone: when the
    // scene's set of lights changes, every lit material is rebuilt (the square's 17 cost ~40 ms on EVERY appearance, not just the first)
    const steady = [];
    part.object.traverse((o) => { if (o.isDirectionalLight || o.isHemisphereLight) steady.push(o); });
    for (const l of steady) { room.scene.attach(l); if (l.target) room.scene.attach(l.target); }
    const e = { name, part, params, lights, steady, base: { ...params }, state: 'off', arrive: 0, leave: 0, home: 'wait', clock: 0, progress: 0, fallK: 0 };
    parts[name] = e; byName[name] = part; list.push(e);
  } catch (err) { console.warn(`res-obra3d: part "${name}" failed to load (${err.message}); skipped`); }
}
const has = (n) => !!parts[n];
const guide = createGuide({ THREE, TSL, room });
room.scene.add(guide.object);
// compile every material once, now, so a universe arriving later does not stall the room
try { for (const e of list) e.part.object.visible = true; await room.renderer.compileAsync(room.scene, room.walls[0].camera); } catch (err) { console.info('res-obra3d: precompile skipped (' + err.message + ')'); }
for (const e of list) e.part.object.visible = false;

// ------------------------------------------------------------------------------------------------ the score: led by the sound piece, or its own
const score = createScore(NW), S = score.state;
const link = { at: -1e9, ts: 0, pace: 1, beat: 0, events: [], acta: null, told: 0 };
const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null;
if (bc) bc.onmessage = (ev) => {
  const m = ev.data; if (m?.type !== 'state' || !m.s || !('block' in m.s)) return;
  const { events, ...s } = m.s; Object.assign(S, s);
  link.events.push(...(events || [])); link.at = performance.now(); link.ts = m.ts; link.pace = m.pace || 1; link.beat = s.beat; link.acta = m.acta;
};
const following = () => performance.now() - link.at < 700;
const tell = (o) => { try { bc?.postMessage({ type: 'ctl', ...o }); } catch { /* a closed channel: carry on alone */ } };
// A jump made on this page (the 'Go to' parameter, the lab's checks, the review page) goes to the sound piece too: while the sound leads,
// a local jump alone was overwritten by the sound's next state (25 ms later) and the picture only changed when the sound's own score
// got there — the "3–4 s" lag of the audits. The sound applies a ctl jump within ~0.2 s.
{ const raw = score.jump; score.jump = (b) => { raw(b); tell({ jump: b }); }; }
let lastJump = 'none';
const doJump = () => { if (P.jump !== lastJump) { lastJump = P.jump; if (P.jump && P.jump !== 'none') score.jump(P.jump); } };
vt.on('params', (p) => { Object.assign(P, p); room.setBloom({ strength: P.bloom }); room.renderer.toneMappingExposure = P.exposure; doJump(); });
doJump();

// ------------------------------------------------------------------------------------------------ hands
// The runtime stitches a hand the sensor loses for a moment (≤ 0.3 m / 300 ms). What can still happen under the real sensor (10 Hz,
// dropped readings, a new tracker id after a cut): a NEW stroke appears at the very spot of one the runtime still holds (coasting),
// i.e. the same hand twice. It would count as a fresh landing (a wave in Brasa, a press in Tronc, a flash in a part) and as two hands.
// So a new stroke within 10 cm of a live one on the same wall is folded into it (same id for the score, no 'down'). Nothing wider:
// a real lift-and-press on the beat lands on the same spot ~0.3 s later and MUST count (stitching gaps here broke Tronc's presses).
const DUP_M = 0.1;
const known = new Set(), now = new Set(), downs = [], ups = [], scoreHands = [];
const alias = new Map(), last = new Map();                         // raw stroke → canonical · canonical → { wall, x, y }
const upPool = Array.from({ length: 32 }, () => ({ stroke: null })), shPool = Array.from({ length: 32 }, () => ({ stroke: null, wall: 0, dx: 0, speed: 0 }));
const handStats = { downs: 0, ups: 0, stitched: 0 };               // lab checks
function readHands() {
  const hs = room.hands(); downs.length = 0; ups.length = 0; scoreHands.length = 0; now.clear();
  for (const h of hs) {
    const w = room.walls[h.wall], x = h.u * w.width, y = h.pos.y;
    let c = alias.get(h.stroke);
    if (c === undefined) {
      c = h.stroke;
      for (const k of known) { const L = last.get(k); if (L && L.wall === h.wall && Math.abs(L.x - x) < DUP_M && Math.abs(L.y - y) < DUP_M) { c = k; handStats.stitched++; break; } }
      alias.set(h.stroke, c);
      if (c === h.stroke && !known.has(c)) { downs.push(h); handStats.downs++; }
    }
    if (now.has(c)) continue;                                       // the duplicate's twin is already counted this frame
    now.add(c);
    let L = last.get(c); if (!L) { L = { wall: 0, x: 0, y: 0 }; last.set(c, L); } L.wall = h.wall; L.x = x; L.y = y;
    if (scoreHands.length < shPool.length) { const o = shPool[scoreHands.length]; o.stroke = c; o.wall = h.wall; o.dx = (h.u - 0.5) * w.width; o.speed = Math.hypot(h.vx, h.vy); scoreHands.push(o); }
  }
  for (const s of known) if (!now.has(s)) { last.delete(s); if (ups.length < upPool.length) { const u = upPool[ups.length]; u.stroke = s; ups.push(u); handStats.ups++; } }
  if (alias.size > 64) for (const [raw, c] of alias) if (!now.has(c)) alias.delete(raw);
  known.clear(); for (const s of now) known.add(s);
  return hs;
}

// ------------------------------------------------------------------------------------------------ which parts, block by block
let fallSet = ['atmos'];
function wanted(b) {
  switch (b) {
    case 'wait': return has('brasa3d') ? ['brasa3d', 'atmos'] : ['atmos'];
    case 'intro': return ['plaza', 'atmos', 'castell', 'introtext'];
    case 'brasa': return has('brasa3d') ? ['brasa3d', 'atmos'] : ['atmos'];
    case 'pinya': return has('pinya3d') ? ['pinya3d', 'atmos'] : ['castell', 'atmos'];
    case 'tronc': return has('tronc3d') ? ['plaza', 'castell', 'tronc3d', 'atmos'] : ['plaza', 'castell', 'atmos'];
    case 'baixada': return has('baixada3d') ? ['plaza', 'castell', 'baixada3d', 'atmos'] : ['plaza', 'castell', 'atmos'];
    case 'pom': return has('pom3d') ? ['pom3d'] : ['plaza', 'castell', 'atmos'];
    case 'crown': case 'festa': return has('festa3d') ? ['festa3d'] : ['plaza', 'castell', 'atmos'];
    case 'fall': return fallSet;
    case 'acta': return ['actatext', 'atmos'];
    default: return ['atmos'];
  }
}

// ------------------------------------------------------------------------------------------------ the castell, per wall
const castellE = parts.castell;
const bp = new Float32Array(NW), dp = new Float32Array(NW), tl = new Float32Array(NW), tilt = new Float32Array(NW), bpOut = [], dpOut = [], tlOut = [];
for (let w = 0; w < NW; w++) { bpOut.push(0); dpOut.push(0); tlOut.push(0); }
let flash = 0;
function castellStages() {                                          // build fractions where the pinya ends and the tronc is complete
  const T = Math.round(clamp(castellE?.params.tiers ?? 5, 4, 7)), total = 6.2 + (T - 1) * 1.8 + 6.2;
  return [6.2 / total, (6.2 + (T - 2) * 1.8 + 2.8) / total];
}
function driveCastell(e, dt, time, events) {
  const p = e.params;
  // the placement: the intro's (far, fit so the enxaneta stays in the window) or the chapters' (6.5 m, no fit: big and close, the top
  // goes beyond the top of the walls as the floors rise; the Pom de dalt then lifts us there)
  const near = e.home !== 'intro';
  if (near !== e.near) { e.near = near; p.distance = near ? 6.5 : (e.base.distance ?? 8.5); p.fit = near ? false : (e.base.fit ?? true); e.part.setParams?.(p); }
  if (!near) { p.buildPer = null; p.disPer = null; p.tilt = null; p.light = e.base.light ?? 1; p.floorGlow = 1; return; }
  const [PB, TE] = castellStages(), b = e.home;
  for (let w = 0; w < NW; w++) {
    const sw = !!S.walls[w];
    let target = bp[w], tlt = 0;
    if (b === S.block) {                                            // while it serves the current block; frozen while it leaves
      if (b === 'pinya') target = PB * (S.phase === 'reward' ? (sw ? 1 : 0) : smooth(S.fill[w]));
      else if (b === 'tronc') { target = sw ? PB + (TE - PB) * Math.min(1, (S.floors + S.floorProgress) / 9) : 0; tlt = sw ? -S.lean[w] * 0.122 : 0; }
      else if (b === 'pom') target = sw ? TE + (1 - TE) * S.progress : 0;
      else if (b === 'crown' || b === 'festa') target = sw ? 1 : 0;
      else if (b === 'baixada') target = sw ? PB + (1 - PB) * (S.floors / Math.max(1, S.stats.maxFloors)) : 0;
    }
    bp[w] = e.state === 'in' && b === 'baixada' ? target : ease(bp[w], target, dt, 1.1);   // in the baixada it comes in built (see d below)
    tl[w] = ease(tl[w], tlt, dt, 2.5);
    const shake = b === 'tronc' && sw ? (S.weak[w] / 3) * 0.014 * Math.sin(time * 23 + w * 3.1) * Math.sin(time * 9.7 + w) : 0;
    let d = e.state === 'out' ? smooth(e.leave) : e.state === 'in' && b === 'baixada' ? 1 - smooth(e.arrive) : 0;   // baixada: its streaks fall back into the tower
    if (b === 'fall') { if (S.block === 'fall') e.fallK = clamp(S.t / 6, 0, 1); d = Math.max(d, sw || bp[w] > 0.01 ? e.fallK : 0); }
    bpOut[w] = bp[w] < 0.002 ? 0 : bp[w]; dpOut[w] = d; tlOut[w] = tl[w] + shake;
  }
  for (const ev of events) if (ev === 'floor') flash = 1;
  flash *= Math.exp(-dt * 1.8);
  p.buildPer = bpOut; p.disPer = dpOut; p.tilt = tlOut; p.light = (e.base.light ?? 1) * 1.75 * (1 + 0.9 * flash); p.floorGlow = 0.35;   // outside the intro the castell is the protagonist: a little brighter over the lit square
}

// ------------------------------------------------------------------------------------------------ the frame
let prevBlock = '';
let time = 0, frames = 0, f0 = performance.now(), fps = 0, lastBlock = '', actaAt = -1, acta = score.acta();
const frameEvents = [];
const prof = { m: {}, max(k, v) { if (!(this.m[k] >= v)) this.m[k] = v; }, reset() { this.m = {}; } };   // lab: the slowest CPU time per step since reset
const input = { time: 0, t: 0, dt: 0, progress: 0, hands: [], downs, ups, params: null, state: S, events: frameEvents, arrive: 1, leave: 0, acta };
function frame(dt) {
  time += dt;
  const hs = readHands();
  frameEvents.length = 0;
  if (following()) {
    if (S.block === 'tronc') S.beat = (link.beat + (((Date.now() - link.ts) / 1000) * link.pace) / score.times.tronc.period) % 1;   // between two messages the pulse keeps moving
    if (time - link.told > 1) { link.told = time; tell({ pace: P.pace || 1 }); }
    frameEvents.push(...link.events.splice(0));
  } else { score.step(dt * (P.pace || 1), scoreHands); frameEvents.push(...S.events); S.events.length = 0; }
  if ((time - actaAt > 0.5 || S.block !== lastBlock) && S.block !== 'wait' && S.block !== 'intro') { actaAt = time; acta = link.acta && following() ? link.acta : score.acta(); }   // kept through the wait: the acta leaving must not read a reset score
  if (S.block !== lastBlock) {
    prevBlock = lastBlock;
    if (S.block === 'fall') {
      fallSet = ['atmos']; for (const n of ['plaza', 'castell']) if (parts[n] && (parts[n].state === 'on' || parts[n].state === 'in')) fallSet.push(n);
      const F = parts.fall3d, C = parts.castell;
      if (F) {
        // fall3d IS the castell from this frame on (it reads castell.js' own towers, at the build they have now): it takes over at
        // once, and castell.js is hidden at once — no fade, no dissolve, so there is no jump at the handover
        fallSet = fallSet.filter((n) => n !== 'castell'); fallSet.push('fall3d');
        if (C && C.state !== 'off') {           // from the baixada: the castell on screen becomes fall3d in this frame
          F.state = 'on'; F.arrive = 1; F.leave = 0; F.home = 'fall'; F.clock = 0; F.part.object.visible = true;
          C.state = 'off'; C.arrive = 0; C.leave = 1; C.part.object.visible = false;
        }                                       // from the pom (intent): fall3d arrives as usual (it assembles the group's castell) while pom3d leaves
      }
    }
    lastBlock = S.block;
  }

  // who comes, who goes
  const W = wanted(S.block);
  for (const e of list) {
    if (W.includes(e.name)) {
      if (e.home !== S.block) { e.home = S.block; e.fallK = 0; }
      if (e.state === 'off') { for (const l of e.lights) l.visible = true; e.state = 'in'; e.arrive = 0; e.leave = 0; e.clock = 0; e.wait = S.block === 'baixada' && prevBlock === 'festa' ? 0.9 : 0; e.part.object.visible = true; }   // festa→baixada: the festa is dark by ~1.5 s, the bajada starts at 0.9 s so the two cross
      else if (e.state === 'out') { e.state = 'in'; e.arrive = 1 - e.leave; e.leave = 0; }
    } else if (e.state === 'on' || e.state === 'in') { e.leave = 1 - e.arrive; e.arrive = 1; e.state = 'out'; }
    if (e.state === 'in') { if (e.wait > 0) e.wait -= dt; else { e.arrive = Math.min(1, e.arrive + dt / TR); if (e.arrive >= 1) e.state = 'on'; } }
    else if (e.state === 'out') { e.leave = Math.min(1, e.leave + dt / TR); if (e.leave >= 1) { e.state = 'off'; e.part.object.visible = false; for (const l of e.lights) l.visible = false; for (const l of e.steady) l.intensity = 0; } }
  }

  // drive the active parts
  Object.assign(input, { time, dt, hands: hs, acta });
  for (const e of list) {
    if (e.state === 'off') continue;
    const p = e.params, k = e.arrive * (1 - e.leave), serving = e.home === S.block;
    e.clock += dt;
    let t = S.t;
    if (serving && e.name !== 'atmos') e.progress = S.block === 'wait' ? 0.05 : S.progress;
    if (e.name === 'atmos') {
      t = S.block === 'intro' && serving ? S.t : 69;
      e.mood = ease(e.mood ?? 1, e.home === 'baixada' ? 0.22 : e.home === 'tronc' ? 0.2 : e.home === 'acta' ? 0.15 : e.home === 'wait' ? 0.08 : e.home === 'pinya' ? 0.25 : 1, dt, 1.2);   // the wait: almost total dark, a line of embers   // the acta: black and typography   // the baixada: the air clears so the falling light reads
      for (const key of ['dust', 'haze', 'line']) p[key] = (e.base[key] ?? 1) * smooth(k) * (key === 'line' ? 1 : e.mood);
      p.bokeh = (e.base.bokeh ?? 1) * e.mood;
      e.acta = ease(e.acta ?? 0, e.home === 'acta' || e.home === 'wait' ? 1 : 0, dt, 1.2);   // acta and wait: no lamps in the air, no haze
      e.noHaze = ease(e.noHaze ?? 0, e.home === 'pinya' ? 1 : 0, dt, 1.2); p.haze *= 1 - e.noHaze;   // pinya: no haze (the motes read as static)
      if (e.acta > 0.001) { p.haze *= 1 - e.acta; p.lampGain = (e.base.lampGain ?? 1) * (1 - e.acta); } else p.lampGain = e.base.lampGain ?? 1;
      e.stirK = ease(e.stirK ?? 1, e.home === 'pinya' ? 0 : e.home === 'tronc' ? 0.3 : e.home === 'baixada' ? 0.5 : 1, dt, 1.2);   // where figures stand behind the buttons, the hands' warm dust is softer
      p.stir = (e.base.stir ?? 1) * e.stirK;   // hands still stir it, less: the warm swirls were the bright cloud by the targets
    } else if (e.name === 'plaza') {
      if (e.home === 'intro') { t = S.block === 'intro' ? S.t : 70; p.shatter = 0; p.reveal = 0; p.lamps = e.base.lamps ?? 1; p.sky = e.base.sky ?? 1; p.windows = e.base.windows ?? 0.45; p.glow = e.base.glow ?? 0.3; p.haze = e.base.haze ?? 1; p.moon = e.base.moon ?? 1; e.mood = 1; }
      else {
        t = 30;
        let sh = e.state === 'in' ? 1 - smooth(e.arrive) : e.state === 'out' ? 1 - (1 - e.leave) * (1 - e.leave) : 0;   // leaving: it starts breaking at once
        if (e.home === 'fall') { if (S.block === 'fall') e.fallK = clamp(S.t / 9, 0, 1); sh = Math.max(sh, e.fallK); }
        p.shatter = sh; p.reveal = 0;
        const dim = e.state === 'out' && S.block === 'acta' ? 1 - smooth(Math.min(1, e.leave * 2)) : 1;   // its light goes first: the next universe's words read at once
        e.mood = ease(e.mood ?? 1, e.home === 'baixada' || e.home === 'fall' ? 0.18 : e.home === 'tronc' ? 0.2 : 1, dt, 1.2);   // tronc: stone and ceramic, the castell the brightest thing   // the baixada: the square goes into night
        const night = (e.mood - 0.18) / 0.82;   // 0 in the baixada's night … 1 elsewhere
        p.lamps = (e.base.lamps ?? 1) * dim * e.mood; p.sky = (e.base.sky ?? 1) * dim * (0.15 + 0.85 * night); p.windows = (e.base.windows ?? 0.45) * dim * (0.15 + 0.85 * night); p.moon = (e.base.moon ?? 1) * (0.12 + 0.88 * night);
        p.glow = (e.base.glow ?? 0.3) * e.mood; p.haze = (e.base.haze ?? 1) * (0.2 + 0.8 * night);
      }
    } else if (e.name === 'actatext') t = serving ? S.t : 40;
    else if (e.name === 'introtext') t = S.block === 'intro' && serving ? S.t : 76 + 3 * Math.min(1, e.leave * 8);   // the title goes in ~1.5 s: it must not sit under Brasa's card
    else if (e.name === 'castell') { if (e.home === 'intro') t = S.block === 'intro' ? S.t : 70; driveCastell(e, dt, time, frameEvents); }
    input.t = t; input.progress = e.progress; input.params = p; input.arrive = e.arrive; input.leave = e.leave;
    const p0 = performance.now(); e.part.update(dt, input); prof.max(e.name, performance.now() - p0);
  }
  let p1 = performance.now(); guide.update(dt, { state: S, hands: hs, time, on: P.guide !== false, acta, pace: following() ? link.pace : (P.pace || 1), hold: !!parts.introtext && parts.introtext.state !== 'off' && S.block !== 'intro' && parts.introtext.leave < 0.15 }); prof.max('guide', performance.now() - p1);
  p1 = performance.now(); room.render(dt); prof.max('render', performance.now() - p1);
  frames++; const n = performance.now(); if (n - f0 > 1000) { fps = (frames * 1000) / (n - f0); frames = 0; f0 = n; }
}

// Warm-up: compileAsync only knows what is visible and does not run the parts' compute passes, so the first time a universe (or a
// card, a target, the acta's words) appeared the renderer still built pipelines in that frame (QA: 31–70 ms per transition; a cold
// first pass much more). Here every part is updated once and the whole scene — every object forced visible, the guide's and the
// acta's hidden meshes included — is rendered twice before the loop starts; then everything goes back as it was.
async function warmUp() {
  const wi = { time: 0, t: 30, dt: 1 / 60, progress: 0.5, hands: [], downs: [], ups: [], params: null, state: S, events: [], arrive: 1, leave: 0, acta: score.acta() };
  const saved = [];
  for (const e of list) e.part.object.visible = true;
  // two states: at rest (t 30) and breaking / arriving (t 52, the square's shatter at half): some parts switch what they draw
  // and once more without the square: its moon and sky light change every material's light set (a render object per light set)
  for (const [tw, sh, noSquare] of [[30, 0, false], [52, 0.5, false], [30, 0, true]]) {
    wi.t = tw;
    for (const e of list) { wi.params = e.params; const s0 = e.params.shatter; if (e.name === 'plaza') e.params.shatter = sh; try { e.part.update(1 / 60, wi); } catch (err) { console.info(`res-obra3d: warm-up of "${e.name}" skipped (${err.message})`); } if (e.name === 'plaza') e.params.shatter = s0; }
    saved.length = 0;
    room.scene.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    if (noSquare && parts.plaza) parts.plaza.part.object.visible = false;
    try { await room.renderer.compileAsync(room.scene, room.walls[0].camera); } catch { /* render below compiles too */ }
    for (let k = 0; k < 6; k++) { room.render(1 / 60); await new Promise((r) => requestAnimationFrame(r)); }
    for (let i = 0; i < saved.length; i += 2) saved[i].visible = saved[i + 1];
  }
  for (const e of list) { e.part.object.visible = false; for (const l of e.lights) l.visible = false; for (const l of e.steady) l.intensity = 0; }
}
try { await warmUp(); } catch (err) { console.info('res-obra3d: warm-up skipped (' + err.message + ')'); }

window.__obra = { score, following, parts, room, guide, handStats, prof, fps: () => fps };   // for the lab's checks (and res-obra/autopilot.js) only
vt.loop(frame, canvas);
