// Ressonància — the whole work in 3D. The score (../ressonancia/score.js) walks the pass from the wait to the acta; every block shows
// its universe as a set of 3D PARTS (../ressonancia/scenes3d/parts, contract in PARTS.md) in the CAVE of room3d.js; over them, the
// guide (../ressonancia/scenes3d/guide3d.js): hand targets and the words on the walls.
//
// Block → parts (a chapter part that is not on disk yet is replaced by a stand-in made of the parts that are):
//   wait     umbral3d alone                                          stand-in: brasa3d (embers, progress 0.05) + atmos, else atmos
//   intro    plaza + atmos + castell + introtext, on the intro's clock (input.t = state.t)
//   brasa    brasa3d + atmos                                         stand-in: atmos
//   pinya    pinya3d + atmos                                         stand-in: castell (the pinya alone, rising with each wall's fill)
//   tronc    tronc3d + atmos (T-032)          stand-in: plaza (reassembling) + castell on the castell's walls, floor by floor, leaning
//            with lean[w], trembling with weak[w], a warm flash on each floor + atmos
//   pom      pom3d                                                   stand-in: plaza + castell (the pom de dalt climbs) + atmos
//   crown, festa   festa3d                                           stand-in: plaza + castell crowned + atmos
//   baixada  plaza + castell (coming down floor by floor) + atmos
//   fall     the castell dissolves (~6 s) and the square shatters (whatever of them is there)
//   acta     actatext + atmos
// Transitions (T-028): the tile transition, the global eye and the guiding thread (see 'the transition' below) over the parts' own
// crossing (fragmentation is the work's language): a part that comes in gets input.arrive 0 → 1 over 4 s, a part that goes gets
// input.leave 0 → 1 over 4 s and is hidden (and no longer updated) once gone; the two cross. Parts without arrive/leave use their
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
import { setSink, canEmit } from '../ressonancia/scenes3d/emit.js';
import { createTargets3D } from '../ressonancia/scenes3d/targets3d.js';   // 05-plan §2.6: the hold-targets of S.targets, drawn
import { overrides as tuneOverrides, applyTimes } from '../ressonancia/tuning.js';   // T-052: the score's thresholds as live params

const vt = await connectExperience();
setSink(vt);                                                       // P0: the viewer instance (vt.sink 'viewer') renders and listens, never posts
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const q = new URLSearchParams(location.search);
const P = Object.assign({ jump: 'none', pace: 1, guide: true, bloom: 0.6, exposure: 1, quality: 'high', renderer: 'auto', tiles: true, eye: true, aa: 'auto', mode: 'auto', tuning: 'lab', warmSets: true, prewarmRT: true }, vt.params);   // T-057: warmSets / prewarmRT (see 'pre-warming'), false = as before
// T-052 «modo sala»: in the room (mode 'room', or 'auto' inside the app, which opens the page with ?run=1) the lab's URL switches are
// ignored, so a stray ?q3 / ?parts / ?tiles can never reach the walls. Read at load: changing `mode` needs a reload (Stop / Play).
const LAB = P.mode === 'lab' || (P.mode !== 'room' && !q.has('run'));
if (LAB) {
  if (q.get('tiles') === '0') P.tiles = false;                    // lab: ?tiles=0 the old crossing, ?eye=0 no global eye, ?aa=taa
  if (q.get('eye') === '0') P.eye = false;
  if (q.get('aa')) P.aa = q.get('aa');
  if (q.get('q3')) P.quality = q.get('q3');                        // lab only (review.html): the 3D quality from the URL
}
const QS = { low: 0.6, medium: 0.8, high: 1 }, DENS = { low: 0.4, medium: 0.6, high: 1 };
const LT = { start: performance.now() }; const lt = (k) => { LT[k] = Math.round(performance.now() - LT.start); };   // T-057: load phases (ms), window.__obra.load
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', bloom: { strength: P.bloom }, exposure: P.exposure, renderScale: QS[P.quality] ?? 1, samples: P.quality === 'high' ? 2 : 0, aa: P.aa === 'auto' ? (P.quality === 'high' ? 'taa' : 'msaa') : P.aa });   // aa 'auto': TAA at high (RND-F's variance-clipped TAA), MSAA below — switch the default after QA's fps window   // MSAA 2 at high (T-011, DECISIONES 23:26; was 4)
lt('room'); const NW = room.walls.length;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
const TR = 4;                                                      // a part's arrive / leave, s (5 before T-028: the tiles carry the change now)

// ------------------------------------------------------------------------------------------------ the parts
const NAMES = ['umbral3d', 'atmos', 'plaza', 'castell', 'tronc3d', 'fall3d', 'introtext', 'actatext', 'brasa3d', 'pinya3d', 'pom3d', 'festa3d', 'baixada3d'];
const CHAPTERS = new Set(['umbral3d', 'brasa3d', 'pinya3d', 'pom3d', 'festa3d', 'baixada3d', 'fall3d', 'tronc3d']);
const parts = {}, byName = {}, list = [];
const only = LAB ? q.get('parts') : null;                                       // lab: ?parts=plaza,castell loads only those
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
    if (name === 'pinya3d') params.density = DENS[P.quality] ?? 1;
    if (name === 'baixada3d') params.town = false;                // the real square (plaza, silhouette) is the town behind the dawn   // 3D-PI: fewer points at medium / low
    if (name === 'fall3d') params.duration = TIMES.fall;           // its 15 s script rescaled to the score's fall
    const t0p = performance.now(); const part = (await import(src.href)).create({ THREE, TSL, room, params, parts: byName }); LT['part:' + name] = Math.round(performance.now() - t0p);
    // every part hangs from a rig of the host: the global eye moves the rigs (T-028), and the tile passes show / hide them
    const rig = new THREE.Group(); rig.name = 'rig:' + name; rig.add(part.object); room.scene.add(rig);
    part.object.visible = false;
    const lights = []; part.object.traverse((o) => { if (o.isPointLight) lights.push(o); });
    // A part's moon / sky lights (directional, hemisphere) stay in the scene for good, at intensity 0 while the part is gone: when the
    // scene's set of lights changes, every lit material is rebuilt (the square's 17 cost ~40 ms on EVERY appearance, not just the first)
    const steady = [];
    part.object.traverse((o) => { if (o.isDirectionalLight || o.isHemisphereLight) steady.push(o); });
    for (const l of steady) { room.scene.attach(l); if (l.target) room.scene.attach(l.target); l.userData.hostIntensity = l.intensity; }
    const e = { name, rig, part, params, lights, steady, base: { ...params }, state: 'off', arrive: 0, leave: 0, home: 'wait', clock: 0, progress: 0, fallK: 0 };
    parts[name] = e; byName[name] = part; list.push(e);
  } catch (err) { console.warn(`res-obra3d: part "${name}" failed to load (${err.message}); skipped`); }
}
const has = (n) => !!parts[n];
// T-057: a steady light is dimmed to 0 while its part is gone and given back its intensity when the part comes back (parts that set the
// intensity once, e.g. a room.lightRecipe().group, stayed dark after their first exit). The value kept is the last one > 0 the light had.
function steadyOff(e) { for (const l of e.steady) { if (l.intensity > 0) l.userData.hostIntensity = l.intensity; l.intensity = 0; } }
function steadyOn(e) { for (const l of e.steady) if (l.intensity === 0 && l.userData.hostIntensity != null) l.intensity = l.userData.hostIntensity; }
lt('parts'); const guide = createGuide({ THREE, TSL, room, fine: LAB && q.get('fine') === '1' });   // lab ?fine=1: the instrument graphics (rulers, «P4», «1,25 m»); never in the room
room.overlay.add(guide.object);
const targets3d = createTargets3D({ THREE, TSL, room }); room.overlay.add(targets3d.object);   // over the image, like the guide (the rules: ../ressonancia/targets.js)   // T-028: the guide is drawn over the final image (after the tiles: the words never break); its materials are depthTest-free
// compile every material once, now, so a universe arriving later does not stall the room
// T-057 (prewarmRT): into the strip's format — with no target, compileAsync built pipelines for the canvas that no frame uses
const toStrip = async (fn) => { const rt0 = room.renderer.getRenderTarget(); if (P.prewarmRT !== false) room.renderer.setRenderTarget(room.strip); try { return await fn(); } finally { room.renderer.setRenderTarget(rt0); } };
try { for (const e of list) e.part.object.visible = true; await toStrip(() => room.renderer.compileAsync(room.scene, room.walls[0].camera)); } catch (err) { console.info('res-obra3d: precompile skipped (' + err.message + ')'); }
for (const e of list) e.part.object.visible = false;
lt('compile');

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
const tell = (o) => { if (!canEmit()) return; try { bc?.postMessage({ type: 'ctl', ...o }); } catch { /* a closed channel: carry on alone */ } };
// A jump made on this page (the 'Go to' parameter, the lab's checks, the review page) goes to the sound piece too: while the sound leads,
// a local jump alone was overwritten by the sound's next state (25 ms later) and the picture only changed when the sound's own score
// got there — the "3–4 s" lag of the audits. The sound applies a ctl jump within ~0.2 s.
{ const raw = score.jump; score.jump = (b) => { raw(b); tell({ jump: b }); }; }
let lastJump = 'none';
const doJump = () => { if (P.jump !== lastJump) { lastJump = P.jump; if (P.jump && P.jump !== 'none') score.jump(P.jump); } };
// T-052: the thresholds (params `tuning` + `t.<block>.<field>`, ressonancia/tuning.js) go LIVE into this page's score and, over the
// channel, into the sound piece's score (which leads): { type: 'ctl', times } on every change and every 1 s (a sound started later
// picks them up). The score reads T.<block>.<field> on every step: no reload.
let tuned = tuneOverrides(P);
const tune = () => { tuned = tuneOverrides(P); const n = applyTimes(score.times, tuned, TIMES); if (n) { console.info('res-obra3d: thresholds', JSON.stringify(Object.fromEntries(Object.entries(tuned).filter(([, v]) => v != null)))); tell({ times: tuned }); } };
vt.on('params', (p) => { Object.assign(P, p); room.setBloom({ strength: P.bloom }); room.renderer.toneMappingExposure = P.exposure; tune(); doJump(); });
tune();
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
const upPool = Array.from({ length: 32 }, () => ({ stroke: null })), shPool = Array.from({ length: 32 }, () => ({ stroke: null, wall: 0, dx: 0, y: 0, vx: 0, vy: 0, size: 0, s: 0, speed: 0 }));
// T-040 (PLAN-INTERACCION): per hand for the score — dx (m from the wall's centre), y (m from the floor), vx / vy (m/s along the wall /
// up), size (m), s (m along the perimeter: the wall's start + u × width, continuous round the room), speed (m/s)
const wallStart = []; { let acc = 0; for (const w of room.walls) { wallStart.push(acc); acc += w.width; } }
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
    if (scoreHands.length < shPool.length) { const o = shPool[scoreHands.length]; o.stroke = c; o.wall = h.wall; o.dx = (h.u - 0.5) * w.width; o.y = h.v * w.height; o.vx = h.vx; o.vy = h.vy; o.size = h.size || 0; o.s = wallStart[h.wall] + h.u * w.width; o.speed = Math.hypot(h.vx, h.vy); scoreHands.push(o); }
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
    case 'wait': return has('umbral3d') ? ['umbral3d'] :   // the threshold (ENT, T-026) has its own floor, horizon and lights
                         has('brasa3d') ? ['brasa3d', 'atmos'] : ['atmos'];
    case 'intro': return ['plaza', 'atmos', 'castell', 'introtext'];
    case 'brasa': return has('brasa3d') ? ['brasa3d', 'atmos'] : ['atmos'];
    case 'pinya': return has('pinya3d') ? ['pinya3d', 'atmos'] : ['castell', 'atmos'];
    case 'tronc': return has('tronc3d') ? ['tronc3d', 'atmos'] : ['plaza', 'castell', 'atmos'];   // T-032 (3D-FE): the assemblage tower carries its own light bodies
    case 'baixada':                                                  // 3D-FE: the group's tower (tronc3d) is brought down floor by floor (3D-PO, takeFloor)
      if (has('tronc3d')) return has('baixada3d') ? ['plaza', 'tronc3d', 'baixada3d'] : ['tronc3d', 'atmos'];   // plaza as a black silhouette against 3D-PO's dawn (far layer)   // director 24-11: no night square over the dawn; 3D-PO hides tronc3d's floors itself
      return has('baixada3d') ? ['plaza', 'castell', 'baixada3d', 'atmos'] : ['plaza', 'castell', 'atmos'];
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

// ------------------------------------------------------------------------------------------------ the colour script (ARTE-2 §3)
// One palette per block, eased: `warm` the light of the chapter (dust, the line, the hands' heat), `cool` its night, `air` the haze's
// own colour, `thread` the accent the guiding thread carries. The all-amber night is the intro's alone now.
const PAL = {
  wait: { warm: [1.0, 0.42, 0.18], cool: [0.35, 0.40, 0.62], air: [0.0016, 0.0016, 0.0024], thread: [1.0, 0.42, 0.16], shape: 'point' },
  intro: { warm: [1.0, 0.62, 0.32], cool: [0.55, 0.66, 1.0], air: [0.0035, 0.0058, 0.0125], thread: [1.0, 0.66, 0.34], shape: 'point' },
  brasa: { warm: [1.0, 0.36, 0.12], cool: [0.62, 0.48, 0.55], air: [0.0080, 0.0030, 0.0022], thread: [1.0, 0.34, 0.10], shape: 'point' },
  pinya: { warm: [1.0, 0.46, 0.38], cool: [0.30, 0.95, 0.90], air: [0.0018, 0.0070, 0.0080], thread: [0.35, 1.0, 0.92], shape: 'point' },
  tronc: { warm: [0.95, 0.52, 0.30], cool: [0.70, 0.80, 0.95], air: [0.0050, 0.0040, 0.0040], thread: [0.95, 0.55, 0.32], shape: 'tile' },
  pom: { warm: [1.0, 0.82, 0.45], cool: [0.86, 0.90, 1.0], air: [0.0030, 0.0032, 0.0040], thread: [0.95, 0.96, 1.0], shape: 'line' },
  crown: { warm: [1.0, 0.85, 0.55], cool: [0.90, 0.85, 1.0], air: [0.0040, 0.0036, 0.0050], thread: [1.0, 0.86, 0.5], shape: 'line' },
  festa: { warm: [1.0, 0.85, 0.55], cool: [0.90, 0.85, 1.0], air: [0.0040, 0.0036, 0.0050], thread: [1.0, 0.86, 0.5], shape: 'tile' },
  baixada: { warm: [1.0, 0.66, 0.76], cool: [0.62, 0.95, 0.90], air: [0.0080, 0.0060, 0.0100], thread: [1.0, 0.72, 0.85], shape: 'point' },
  fall: { warm: [0.92, 0.62, 0.62], cool: [0.60, 0.62, 0.82], air: [0.0040, 0.0035, 0.0055], thread: [0.9, 0.75, 0.85], shape: 'tile' },
  acta: { warm: [0.92, 0.92, 0.96], cool: [0.50, 0.55, 0.70], air: [0.0010, 0.0010, 0.0014], thread: [0.95, 0.95, 1.0], shape: 'line' },
};
const ONE3 = [1, 1, 1];
const INTRO_SKY = [1.15, 1.45, 2.1];   // the intro's sky: a cool blue-silver night against the sodium lamps (warm/cool split)
const STINT = { baixada: [3.2, 1.7, 2.4], fall: [2.2, 1.4, 2.0] };   // the square's night sky × this (baixada: a dawn coming, rose and lilac)
const CTINT = { baixada: [0.95, 1.12, 2.6], fall: [0.95, 1.05, 2.2], pinya: [0.6, 1.5, 3.2] };   // the castell's gold × this (baixada: dawn pink; pinya stand-in: turquoise)
const pal = { warm: [...PAL.wait.warm], cool: [...PAL.wait.cool], air: [...PAL.wait.air], tint: [1, 1, 1], sky: [1, 1, 1], line: [...PAL.wait.thread], lineK: 0, halo: 1 };
// the horizon line of atmos (QA 24-11: no amber band outside the intro): the intro's own, full; elsewhere thin (no soft band) in the
// block's accent, dimmer; the acta keeps a fine white line; the wait has none
const LINEK = { intro: 1, acta: 0.3 };   // elsewhere: no line (QA/director 24-11: the amber band at ~1.3 m in tronc)
function easePal(dt) { const T = PAL[S.block] || PAL.intro, C = CTINT[S.block] || ONE3; for (const k of ['warm', 'cool', 'air']) for (let i = 0; i < 3; i++) pal[k][i] = ease(pal[k][i], T[k][i], dt, 0.6); const K = STINT[S.block] || ONE3; const lk = LINEK[S.block] ?? 0; pal.lineK = ease(pal.lineK, lk, dt, 0.8); pal.halo = ease(pal.halo, S.block === 'intro' ? 1 : 0, dt, 0.8); for (let i = 0; i < 3; i++) pal.line[i] = ease(pal.line[i], T.thread[i], dt, 0.6); for (let i = 0; i < 3; i++) { pal.tint[i] = ease(pal.tint[i], C[i], dt, 0.6); pal.sky[i] = ease(pal.sky[i], K[i], dt, 0.4); } }

// ------------------------------------------------------------------------------------------------ the transition (T-028)
// On a block change where some part leaves: ~3.8 s of tiles (room3d composes the outgoing world's image and the incoming one's), the
// global eye moves both worlds with one gesture, and the guiding thread crosses from one to the other over the storm of tiles.
// Per destination: dur (s), the tiles' origin (0..1 round the strip), the eye's move (metres; yaw in degrees, ≤ 8° in all ⇒ ≤ 3.5°/s).
const MOVES = {
  intro: { dur: 4.2, move: [0, 0.4, 0], yaw: 0 },               // a gentle lift: the threshold itself is umbral3d's radial pass (ENT-F)
  brasa: { dur: 3.8, move: [0, -1.2, 0], yaw: 0 },          // we sink to the embers' ground
  pinya: { dur: 3.8, move: [0, 0, 0], yaw: 7 },             // the room turns into the crowd
  tronc: { dur: 3.8, move: [0, 1.0, -0.4], yaw: 0 },        // up, the tower begins
  pom: { dur: 4.0, move: [0, 2.2, 0], yaw: -5 },            // up and turning: the climb (Vicente's favourite)
  crown: { dur: 3.6, move: [0, 1.4, 0], yaw: 0 },
  festa: { dur: 3.4, move: [0, 0, 0], yaw: 6 },
  baixada: { dur: 4.2, move: [0, -1.6, 0], yaw: 0 },        // the way down
  fall: { dur: 2.6, move: [0, -0.8, 0], yaw: 0 },           // a short, hard break on the impact
  acta: { dur: 4.0, move: [0, 0, 0.8], yaw: 0 },            // we step back from it all
  wait: { dur: 4.0, move: [0, -0.6, 0], yaw: -4 },
};
const tr = { on: false, t: 0, dur: 3.8, delay: 0.15, from: 'wait', to: 'wait', mv: MOVES.wait, pending: false, origin: 0.25 };
const smoother = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
const _ax = new THREE.Vector3(0, 1, 0);
function placeRig(rig, s, mv) {              // s: the share of the move this world is offset by (−1 … +1)
  const y = (mv.yaw * Math.PI / 180) * s;
  rig.rotation.set(0, y, 0);
  rig.position.set(mv.move[0] * s, mv.move[1] * s, mv.move[2] * s);
  // turn about the vertical axis through the eye
  const ex = room.eye.x, ez = room.eye.z, c = Math.cos(y), sn = Math.sin(y);
  rig.position.x += ex - (c * ex + sn * ez); rig.position.z += ez - (-sn * ex + c * ez);
}
function startTransition(from, to) {
  tr.on = true; tr.t = 0; tr.at = time; tr.from = from; tr.to = to; tr.mv = MOVES[to] || MOVES.wait; tr.dur = tr.mv.dur;
  tr.origin = (Math.random() * 4 | 0) * 0.25 + 0.125;                  // the front starts at the centre of one wall
  room.setTiles({ on: P.tiles !== false, seed: Math.random() * 100, origin: tr.origin, origins: 1, mix: 0, amount: 1, accentFrom: (PAL[from] || PAL.intro).thread, accentTo: (PAL[to] || PAL.intro).thread });
  thread.begin(from, to);
}
function stepTransition(dt) {
  if (!tr.on) return;
  tr.t += dt;
  const k = clamp((tr.t - tr.delay) / tr.dur, 0, 1);
  room.setTiles({ mix: smoother(k) });
  const m = P.eye === false ? 1 : smoother(tr.t / (tr.dur + tr.delay + 0.6));   // the eye's move (a little longer than the tiles)
  for (const e of list) {
    if (e.state === 'out') placeRig(e.rig, -m, tr.mv);
    else if (e.state === 'in' || (e.state === 'on' && e.came)) placeRig(e.rig, 1 - m, tr.mv);
    else if (e.state === 'on') placeRig(e.rig, 0, tr.mv);
    // a part that has gone ('off') keeps its last pose while hidden: no snap (QA 24-11); it is put back at the next arrival
  }
  thread.update(dt, k);
  if (k >= 1 && m >= 1) { tr.on = false; room.setTiles({ on: false }); for (const e of list) { if (e.state !== 'off') placeRig(e.rig, 0, tr.mv); e.came = false; } thread.end(); }
}
function pass(which) {                       // room.render's hook: the outgoing world, then the incoming one (shared parts in both)
  for (const e of list) e.rig.visible = !e.torn && (which === 'out' ? !(e.state === 'in' || e.came) : e.state !== 'out');
}
// T-034: the intro's square tears into image tiles (46–57 s), the same language as the transitions: the 'out' world is everything,
// the 'in' world everything but the square; once torn the square stays hidden until it is gone or comes back.
const intro = { seed: 37.1 };
function passIntro(which) { for (const e of list) e.rig.visible = !e.torn && (which === 'out' || e.name !== 'plaza'); }
function stepIntroBreak() {
  const pl = parts.plaza; if (!pl) return null;
  if (pl.state === 'off' || pl.state === 'in') pl.torn = false;
  if (tr.on || P.tiles === false || pl.home !== 'intro' || S.block !== 'intro' || pl.torn) return null;
  const k = clamp((S.t - 46.3) / 11.5, 0, 1);
  if (k <= 0) return null;
  if (k >= 1) { pl.torn = true; room.setTiles({ on: false }); return null; }
  room.setTiles({ on: true, mix: smoother(k), amount: 1.5, origin: 0.125, origins: 4, seed: intro.seed, accentFrom: PAL.intro.thread, accentTo: PAL.intro.cool });   // amber lamps → night blue in the cracks   // slabs fly further than in a block change
  return passIntro;
}

// ------------------------------------------------------------------------------------------------ the guiding thread (T-028)
// One small thing per wall, drawn in room.overlay (over the tiles, so it never breaks): it is born in the outgoing world (~8 m
// away), comes to ~4.2 m at the peak of the tiles and goes deep into the new world, turning from the old chapter's shape into a
// tile at the peak (the trencadís) and into the new chapter's shape, its colour from the old accent to the new.
const thread = (() => {
  const { uniform, uv, vec2, vec3, vec4, float, Fn, length, max, abs, exp, smoothstep, cos, sin, min } = TSL;
  const U = { col: uniform(new THREE.Color(1, 0.5, 0.2)), a: uniform(0), wP: uniform(1), wT: uniform(0), wL: uniform(0), spin: uniform(0), ext: vec2(1.6, 0.6) };
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(U.ext).toVar();                         // metres on the quad
    const c = cos(U.spin), s = sin(U.spin), r = vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
    const box = (q, b, rr) => length(max(abs(q).sub(b), vec2(0))).sub(rr);
    const dP = length(p).sub(0.012), dT = box(r, vec2(0.03, 0.03), 0.003), dL = box(p, vec2(0.6, 0.003), 0.002);   // art 24-11: a ~6 cm core, no halo blob
    const d = dP.mul(U.wP).add(dT.mul(U.wT)).add(dL.mul(U.wL));
    const core = smoothstep(0.003, -0.003, d), glow = exp(max(d, float(0)).mul(-1 / 0.006)).mul(0.25);
    const edge = smoothstep(0.012, 0.0, abs(d)).mul(U.wT).mul(0.8);        // the tile's rim catches the light
    return vec4(vec3(U.col).mul(core.mul(0.9).add(glow).add(edge)).mul(U.a), 1);   // ≤ ~1 in HDR: no burnt-white bloom
  })();
  const geo = new THREE.PlaneGeometry(1.6, 0.6), meshes = [];
  for (const w of room.walls) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 10; meshes.push(m); }
  const SH = { point: [1, 0, 0], tile: [0, 1, 0], line: [0, 0, 1] };
  const c0 = new THREE.Color(), c1 = new THREE.Color(), wA = [1, 0, 0], wB = [1, 0, 0];
  let on = false; const _d = new THREE.Vector3();
  return {
    meshes,
    begin(from, to) {
      const A = PAL[from] || PAL.intro, B = PAL[to] || PAL.intro;
      c0.setRGB(...A.thread); c1.setRGB(...B.thread); wA.splice(0, 3, ...SH[A.shape]); wB.splice(0, 3, ...SH[B.shape]);
      if (!on) { for (const m of meshes) { room.overlay.add(m); m.visible = true; } on = true; }
    },
    update(dt, k) {
      // the path: far in the old world → close at the peak → deep into the new
      const depth = k < 0.5 ? 8.5 - 4.3 * smoother(k * 2) : 4.2 + 7 * smoother((k - 0.5) * 2);
      const y = k < 0.5 ? 1.95 - 0.35 * smoother(k * 2) : 1.6 - 0.1 * smoother((k - 0.5) * 2);   // as seen on the wall plane
      // held off the wall's centre (the card and the hand target live there): ~1.6 m to one side on the wall, at ~1.5–1.9 m height
      room.walls.forEach((w, i) => {
        const m = meshes[i], dw = Math.max(0.5, -w.normal.dot(_d.subVectors(w.centre, room.eye)));   // eye → wall distance
        const sx = (1.5 + 0.25 * Math.sin(k * Math.PI * 1.5)) * depth / dw, sy = (y - room.eye.y) * depth / dw;
        m.position.copy(room.eye).addScaledVector(w.normal, -depth).addScaledVector(w.right, sx); m.position.y = room.eye.y + sy;
        m.quaternion.copy(w.camera.quaternion);
      });
      const toTile = 1 - Math.abs(k - 0.5) * 2;                            // 0 at the ends, 1 at the peak
      const tw = smoother(toTile * 1.6), wf = k < 0.5 ? wA : wB;
      U.wP.value = wf[0] * (1 - tw); U.wT.value = wf[1] * (1 - tw) + tw; U.wL.value = wf[2] * (1 - tw);
      U.col.value.copy(c0).lerp(c1, smoother((k - 0.3) / 0.4));
      thread.card = ease(thread.card ?? 0, S.phase === 'title' ? 0 : 1, dt, 4);   // off while a chapter card is on the walls
      U.a.value = smoother(k / 0.12) * (1 - smoother((k - 0.82) / 0.18)) * thread.card;
      U.spin.value += dt * (0.25 + 0.9 * toTile);
    },
    end() { if (!on) return; for (const m of meshes) { m.visible = false; room.overlay.remove(m); } on = false; U.a.value = 0; },
  };
})();

// ------------------------------------------------------------------------------------------------ pre-warming the next universe
// QA 24-11: a part arriving cold stalled its first frame (tronc3d: ~100 ms; its pipelines are not all there after the load warm-up).
// 1.5 s into every block (and outside a transition) the parts of the likely next block(s) that are not on screen are compiled, made
// visible only for the synchronous part of compileAsync (no frame sees them). Cheap when already compiled.
const NEXT = { wait: ['intro'], intro: ['brasa'], brasa: ['pinya'], pinya: ['tronc'], tronc: ['pom'], pom: ['crown', 'fall'], crown: ['festa'], festa: ['baixada'], baixada: ['fall', 'acta'], fall: ['acta'], acta: ['wait'] };
const prewarm = { block: '', busy: false };
// the background light-set warm-up (warmSetsLater, below): running from the first frame until it ends; `done` resolves then (lab scripts:
// `await __obra.warm.done` before jumping, or the picture waits for it)
let warmEnd = () => {};
const warmLater = { running: P.warmSets !== false && room.backend === 'webgpu', held: '', done: null };
warmLater.done = warmLater.running ? new Promise((r) => { warmEnd = r; }) : Promise.resolve();
function prewarmNext() {
  if (prewarm.busy || prewarm.block === S.block || tr.on || S.t < 1.5) return;
  prewarm.block = S.block; prewarm.busy = true;
  const names = new Set(); for (const b of NEXT[S.block] || []) for (const n of (b === 'fall' ? ['fall3d', 'atmos'] : wanted(b))) names.add(n);
  (async () => {
    for (const n of names) {
      const e = parts[n]; if (!e || e.state !== 'off') continue;
      const v0 = e.part.object.visible, r0 = e.rig.visible;
      e.part.object.visible = true; e.rig.visible = true;
      // T-057: compile for the strip (HDR, its sample count): with no target set, compileAsync built pipelines for the canvas' format,
      // which the real frame could not use (it built its own, synchronously, in the first frame the part was seen)
      const rt0 = room.renderer.getRenderTarget(); if (P.prewarmRT !== false) room.renderer.setRenderTarget(room.strip);
      let pr = null; try { pr = room.renderer.compileAsync(e.rig, room.walls[0].camera, room.scene); } catch { /* the first real frame compiles */ }
      room.renderer.setRenderTarget(rt0);
      e.part.object.visible = v0; e.rig.visible = r0;
      try { await pr; } catch { /* idem */ }
    }
    prewarm.busy = false;
  })();
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
    if (time - link.told > 1) { link.told = time; tell({ pace: P.pace || 1, times: tuned }); }
    frameEvents.push(...link.events.splice(0));
  } else { score.step(dt * (P.pace || 1), scoreHands); frameEvents.push(...S.events); S.events.length = 0; }
  if ((time - actaAt > 0.5 || S.block !== lastBlock) && S.block !== 'wait' && S.block !== 'intro') { actaAt = time; acta = link.acta && following() ? link.acta : score.acta(); }   // kept through the wait: the acta leaving must not read a reset score
  // Studio 24-11 (T-057 race): while the light sets warm up in the background (≤ ~10 s after load), a part shown for the first time
  // raced the async compile of its own bindings (console: «writeBuffer … not of type GPUBuffer») and stalled ~2.5 s. A jump (Go to)
  // in that window changes the score at once (the sound follows) but the PICTURE holds the block it shows until the warm-up ends.
  const VB = warmLater.running && lastBlock !== '' ? lastBlock : S.block;
  if (VB !== S.block && warmLater.held !== S.block) { warmLater.held = S.block; console.info(`res-obra3d: «${S.block}» is shown once the light-set warm-up ends (the score is already there)`); }
  const changed = VB !== lastBlock && lastBlock !== '', fromBlock = lastBlock;
  if (VB !== lastBlock) {
    prevBlock = lastBlock;
    try { room.setEnvironment?.(VB); } catch (err) { console.info('res-obra3d: setEnvironment skipped (' + err.message + ')'); }   // RND-F: the shared envMap per block (HDRI / tint), re-baked in place
    room.setBackground?.(VB);                                  // T-048 (SIS): the block's deep background gradient (never #000), eased in room3d
    if ((VB === 'wait' || VB === 'intro') && parts.baixada3d?.part.releaseTronc) { try { parts.baixada3d.part.releaseTronc(); } catch (err) { console.info('res-obra3d: releaseTronc skipped (' + err.message + ')'); } }   // 3D-PO: a new pass gives the tower's floors back to tronc3d
    if (VB === 'fall') {
      fallSet = ['atmos']; for (const n of ['plaza', 'castell', 'tronc3d']) if (parts[n] && (parts[n].state === 'on' || parts[n].state === 'in')) fallSet.push(n);   // tronc3d: fall3d (3D-PI) calls its collapse()
      const F = parts.fall3d, C = parts.castell;
      if (F) {
        // fall3d IS the castell from this frame on (it reads castell.js' own towers, at the build they have now): it takes over at
        // once, and castell.js is hidden at once — no fade, no dissolve, so there is no jump at the handover
        fallSet = fallSet.filter((n) => n !== 'castell'); fallSet.push('fall3d');
        if (C && C.state !== 'off') {           // from the baixada: the castell on screen becomes fall3d in this frame
          F.state = 'on'; F.arrive = 1; F.leave = 0; F.home = 'fall'; F.clock = 0; F.part.object.visible = true; steadyOn(F);
          C.state = 'off'; C.arrive = 0; C.leave = 1; C.part.object.visible = false; steadyOff(C);
        }                                       // from the pom (intent): fall3d arrives as usual (it assembles the group's castell) while pom3d leaves
      }
    }
    lastBlock = VB;
  }

  // who comes, who goes
  const W = wanted(VB);
  const tk = tr.on && P.tiles !== false ? room.tiles.mix.value : -1;
  for (const e of list) {
    if (W.includes(e.name)) {
      if (e.home !== VB) { e.home = VB; e.fallK = 0; }
      if (e.state === 'off') { for (const l of e.lights) l.visible = true; placeRig(e.rig, 0, tr.mv); e.state = 'in'; e.came = true; e.arrive = 0; e.leave = 0; e.clock = 0; steadyOn(e); e.wait = VB === 'baixada' && prevBlock === 'festa' ? 0.9 : 0; e.part.object.visible = true; }   // festa→baixada: the festa is dark by ~1.5 s, the bajada starts at 0.9 s so the two cross
      else if (e.state === 'out') { e.state = 'in'; e.came = true; e.arrive = 1 - e.leave; e.leave = 0; }
    } else if (e.state === 'on' || e.state === 'in') { e.leave = 1 - e.arrive; e.arrive = 1; e.state = 'out'; e.outAt = time; e.came = false; }   // came: a part arriving in an unfinished transition must not stay in the 'in' world (RND-F 24-11: else it is in neither)
    // while the tiles carry a change, the slabs must carry IMAGES: the new world assembles fast (it is revealed slab by slab) and the old
    // one stays whole until most of its slabs have turned (then it breaks, quickly, under the last of them); a part left over from an
    // earlier change (rapid jumps) goes quickly; the acta's words never linger over the threshold (QA 24-11): 1.2 s, no hold
    if (e.state === 'in') { if (e.wait > 0) e.wait -= dt; else { e.arrive = Math.min(1, e.arrive + dt / (tk >= 0 ? 1.6 : TR)); if (e.arrive >= 1) e.state = 'on'; } }
    else if (e.state === 'out') { e.leave = Math.min(1, e.leave + (e.name === 'actatext' ? dt / 1.2 : tk < 0 ? dt / TR : e.outAt < tr.at - 1.0 ? dt / 1.2 : tk < 0.6 ? 0 : dt / 1.5)); if (e.leave >= 1) { e.state = 'off'; e.part.object.visible = false; for (const l of e.lights) l.visible = false; steadyOff(e); } }
  }

  if (changed) {
    if ((P.tiles !== false || P.eye !== false) && list.some((e) => e.state === 'out')) startTransition(fromBlock, VB);
    else if (!tr.on) for (const e of list) e.came = false;
  }
  stepTransition(dt);
  easePal(dt);
  prewarmNext();

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
      e.dustK = ease(e.dustK ?? 1, e.home === 'intro' ? 0.5 : 1, dt, 1.2); p.dust *= e.dustK;   // art 24-11: in the square at half (it read as snow)
      p.bokeh = (e.base.bokeh ?? 1) * e.mood;
      e.acta = ease(e.acta ?? 0, e.home === 'acta' || e.home === 'wait' ? 1 : 0, dt, 1.2);   // acta and wait: no lamps in the air, no haze
      e.noHaze = ease(e.noHaze ?? 0, e.home === 'pinya' ? 1 : 0, dt, 1.2); p.haze *= 1 - e.noHaze;   // pinya: no haze (the motes read as static)
      if (e.acta > 0.001) { p.haze *= 1 - e.acta; p.lampGain = (e.base.lampGain ?? 1) * (1 - e.acta); } else p.lampGain = e.base.lampGain ?? 1;
      e.stirK = ease(e.stirK ?? 1, e.home === 'pinya' ? 0 : e.home === 'tronc' ? 0.3 : e.home === 'baixada' ? 0.5 : 1, dt, 1.2);   // where figures stand behind the buttons, the hands' warm dust is softer
      p.stir = (e.base.stir ?? 1) * e.stirK;
      p.warm = pal.warm; p.cool = pal.cool; p.air = pal.air;   // the colour script
      p.lineColor = pal.line; p.lineHalo = pal.halo; p.line *= pal.lineK;   // hands still stir it, less: the warm swirls were the bright cloud by the targets
    } else if (e.name === 'plaza') {
      if (e.home === 'intro') { t = S.block === 'intro' ? S.t : 70; p.noBreak = P.tiles !== false; p.skyTint = INTRO_SKY; p.silhouette = 0; p.shatter = 0; p.reveal = 0; p.lamps = e.base.lamps ?? 1; p.sky = e.base.sky ?? 1; p.windows = Math.max(0.55, e.base.windows ?? 0.45); p.pool = 1.5; p.moonKey = 1.0; p.night = 1; p.reach = 0.4; p.glow = e.base.glow ?? 0.3; p.haze = e.base.haze ?? 1; p.moon = e.base.moon ?? 1; e.mood = 1; }
      else {
        t = 30; p.noBreak = false; p.skyTint = pal.sky; p.silhouette = e.home === 'baixada' || e.home === 'fall' ? 1 : 0; p.silDrop = 13.5;   // director 24-11: rooftops at ~30–40 % of the wall, the dawn sky dominates p.pool = 1; p.moonKey = 1; p.night = 0; p.reach = 1;
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
    else if (e.name === 'castell') { p.tint = pal.tint; if (e.home === 'intro') t = S.block === 'intro' ? S.t : 70; driveCastell(e, dt, time, frameEvents); }
    input.t = t; input.progress = e.progress; input.params = p; input.arrive = e.arrive; input.leave = e.leave;
    const p0 = performance.now(); e.part.update(dt, input); prof.max(e.name, performance.now() - p0);
  }
  let p1 = performance.now(); guide.update(dt, { state: S, hands: hs, events: frameEvents, time, on: P.guide !== false, acta, pace: following() ? link.pace : (P.pace || 1), hold: !!parts.introtext && parts.introtext.state !== 'off' && S.block !== 'intro' && parts.introtext.leave < 0.15 }); prof.max('guide', performance.now() - p1);
  targets3d.update(dt, { targets: S.targets, block: S.block, time, on: P.guide !== false });
  p1 = performance.now(); const ib = stepIntroBreak();
  for (const e of list) e.rig.visible = !e.torn;
  room.render(dt, tr.on ? pass : ib); if (tr.on || ib) for (const e of list) e.rig.visible = !e.torn; prof.max('render', performance.now() - p1);
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
    room.overlay.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    if (noSquare && parts.plaza) parts.plaza.part.object.visible = false;
    try { await toStrip(() => room.renderer.compileAsync(room.scene, room.walls[0].camera)); } catch { /* render below compiles too */ }
    for (let k = 0; k < 6; k++) { room.render(1 / 60); await new Promise((r) => requestAnimationFrame(r)); }
    for (let i = 0; i < saved.length; i += 2) saved[i].visible = saved[i + 1];
  }
  lt('warm:states');
  // T-057: the set of lights the renderer sees changes with the parts that carry lights of their own on the render layers (umbral3d's
  // rims, hand lights and beams; the acta's key): every lit material keys its shaders on that set (by light), so a set the warm-up never
  // drew was compiled in the first frame it appeared — every block change after the wait (the warm-up above draws all lights at once).
  // Here (load, cheap): two frames through the tile pass with everything shown — the tiles' outgoing strip, the composition target and
  // the guiding thread (it joins the overlay only in a transition). The other light sets: warmSetsLater(), once the wait is on screen.
  if (P.warmSets !== false) {
    for (const m of thread.meshes) room.overlay.add(m);
    saved.length = 0;
    room.scene.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    room.overlay.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    room.setTiles({ on: true, mix: 0.5 });
    for (let k = 0; k < 2; k++) { room.render(1 / 60, () => {}); await new Promise((r) => requestAnimationFrame(r)); }
    room.setTiles({ on: false, mix: 0 });
    for (let i = 0; i < saved.length; i += 2) saved[i].visible = saved[i + 1];
    for (const m of thread.meshes) { room.overlay.remove(m); m.visible = false; }
  }
  lt('warm:sets');
  // the square's own environment (T-034): captured once, the square alone at rest (t 30), from the eye
  const pl = parts.plaza;
  if (pl?.part.captureEnv) {
    for (const e of list) { e.rig.visible = e === pl; e.part.object.visible = e === pl; }
    wi.t = 30; wi.params = pl.params; pl.part.update(1 / 60, wi);
    try { pl.part.captureEnv(); } catch (err) { console.info('res-obra3d: square environment skipped (' + err.message + ')'); }
    for (const e of list) e.rig.visible = true;
  }
  for (const e of list) { e.part.object.visible = false; for (const l of e.lights) l.visible = false; steadyOff(e); }
}
lt('pre-warmup'); try { await warmUp(); } catch (err) { console.info('res-obra3d: warm-up skipped (' + err.message + ')'); }

window.__obra = { load: LT, tr, pal, score, warm: warmLater, targets3d, tuned: () => tuned, lab: LAB, following, parts, room, guide, handStats, prof, fps: () => fps };   // for the lab's checks (and res-obra/autopilot.js) only
lt('loop'); vt.loop(frame, canvas);

// T-057 (warmSets): the light sets the load did not draw, compiled in the background while the wait plays (~2.5 s each on the M1 Max;
// the wait lasts ≥ 18 s). The chapters' set (no carrier lit) first, then the acta's, then the wait's alone. Each compile runs on a camera
// of its own (its own render list, so the frames drawn meanwhile do not change the lights it compiles with) into the strip's format; the
// scene is shown / the lights set only for the synchronous part of the call (no frame sees it). Pipelines and shaders are shared by
// every camera and target with the same format, so the walls' real frames find them built.
async function warmSetsLater() {
  if (!warmLater.running) return;   // warmSets false, or WebGL2 (its compiles block the main thread: a 200 ms hitch in the wait): as before
  // a block other than the wait already on screen (a Go to stored in the profile, applied at load): its parts must not be warmed
  // under it (the race above). Skipped: the sets compile when first seen, as before T-057
  if (lastBlock && lastBlock !== 'wait') { warmLater.running = false; warmEnd(); console.info(`res-obra3d: light-set warm-up skipped (the page started in «${lastBlock}»)`); return; }
  const t0 = performance.now(), cam = room.walls[0].camera.clone();
  const lit = (o) => o.isLight && !o.isDirectionalLight && !o.isHemisphereLight;
  const carriers = list.filter((e) => { let n = 0; e.part.object.traverse((o) => { if (lit(o) && o.layers.test(cam.layers)) n++; }); return n > 0; });
  const lightsOf = (e) => { const L = []; e.part.object.traverse((o) => { if (lit(o)) L.push(o); }); return L; };
  const full = (1 << carriers.length) - 1, order = [];
  for (let n = 0; n < carriers.length; n++) for (let m = 0; m < full; m++) if (popcount(m) === n) order.push(m);   // fewest lights first; all lit: done at load
  function popcount(m) { let c = 0; for (; m; m &= m - 1) c++; return c; }
  while (prewarm.busy) await new Promise((r) => setTimeout(r, 100));
  prewarm.busy = true;                                               // the next-block pre-warm waits for this
  try {
    for (const mask of order) {
      const saved = [], culled = [];
      room.scene.traverse((o) => { saved.push(o, o.visible); o.visible = true; if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });   // one camera, every wall's objects
      carriers.forEach((e, i) => { for (const l of lightsOf(e)) l.visible = !!(mask & (1 << i)); });
      const rt0 = room.renderer.getRenderTarget(); room.renderer.setRenderTarget(room.strip);
      let pr = null; try { pr = room.renderer.compileAsync(room.scene, cam); } catch { /* the first real frame compiles */ }
      room.renderer.setRenderTarget(rt0);
      for (let i = 0; i < saved.length; i += 2) saved[i].visible = saved[i + 1];
      for (const o of culled) o.frustumCulled = true;
      try { await pr; } catch { /* idem */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    lt('warm:setsLater');
    console.info(`res-obra3d: warmed ${order.length + 1} light sets (${carriers.map((e) => e.name).join(', ') || 'none'}), ${Math.round(performance.now() - t0)} ms in the background`);
  } finally { prewarm.busy = false; }
}
setTimeout(() => { warmSetsLater().catch((err) => console.info('res-obra3d: light-set warm-up skipped (' + err.message + ')')).finally(() => { warmLater.running = false; warmEnd(); }); }, 500);
