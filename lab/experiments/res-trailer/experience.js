// Ressonància — the trailer (res-trailer). A copy of res-obra3d's host (below, unchanged unless marked «TRAILER») that plays a fixed
// ~3-minute presentation instead of the whole pass: the entrance mosaic (umbral3d) breaks → the night square with the title and the written
// trailer → the correfoc (brasa3d) with the work's data → the resonance (festa3d) with the closing line, credits and logos → back to the
// entrance. Vicente's universes are imported from ../ressonancia unchanged; the presentation layer is ./parts/trailertext.js (his
// typo3d.js, tiles that assemble and break). Hands keep every universe's own response (embers, sparks, ripples); the guide is off.
// The trailer's clock: TRAILER (below) — block per segment, the score held in the segment's block.
//
// (res-obra3d's own header follows.) The score (../ressonancia/score.js) walks the pass from the wait to the acta; every block shows
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
import { createSimVisitors } from './simvisitors.js';
import { createScore, TIMES } from '../ressonancia/score.js';
import { createGuide } from '../ressonancia/scenes3d/guide3d.js';
import { createSubtitles } from './subtitles.js';
import { createHints } from './hints.js';
import { overrides as tuneOverrides, applyTimes } from '../ressonancia/tuning.js';   // T-052: the score's thresholds as live params

const vt = await connectExperience();
// 26-11: simulated visitors for the room test without people (param sim.visitors, 0 = off): their hands join the real ones
const SIM = createSimVisitors(vt);
{ const real = vt.hands.bind(vt); vt.hands = () => { const r = real(); return SIM.out.length ? r.concat(SIM.out) : r; }; }
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const q = new URLSearchParams(location.search);
const P = Object.assign({ jump: 'none', pace: 1, guide: false, lang: 'ca', bloom: 0.6, exposure: 1, quality: 'high', renderer: 'auto', tiles: false, eye: true, aa: 'auto', mode: 'auto', tuning: 'lab', warmSets: true, prewarmRT: true, entranceFirst: false }, vt.params);   // T-057: warmSets / prewarmRT (see 'pre-warming'), false = as before · T-065: entranceFirst (see 'entrance first'), false = as before
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
// ------------------------------------------------------------------------------------------------ the parts (their files)
// TRAILER: only the universes the trailer shows, plus its presentation layer (./parts/trailertext.js)
const NAMES = ['umbral3d', 'atmos', 'plaza', 'plaza3d', 'castell', 'castells3d', 'introp1', 'brasa3d', 'pinya3d2', 'torre3d', 'festa3d', 'trailertext'];   // 26-11: + the tower (climb onto the castell)   // studio 26-11: + the pinya v2 (a being for every hand)
const CHAPTERS = new Set(['umbral3d', 'brasa3d', 'pinya3d2', 'torre3d', 'festa3d']);
const OWN = new Set(['trailertext']);
const ALIAS = { plazaDark: 'plaza3d' };                                          // 26-11: a second square, the correfoc's dark bake (params.dark)                                           // TRAILER: parts of this folder, not of ../ressonancia
const only = LAB ? q.get('parts') : null;                                       // lab: ?parts=plaza,castell loads only those
// T-065 (LOAD): every part's module and defaults are fetched at once, while the renderer starts (they were fetched one part after
// another — HEAD, HEAD, defaults, import: 13 × 4 round trips, seconds when the machine is busy or the sound piece loads its files)
const loads = new Map();
for (const name of NAMES) {
  if (only && !only.split(',').includes(name)) continue;
  const file = ALIAS[name] || name;
  const src = new URL(OWN.has(name) ? `./parts/${file}.js` : `../ressonancia/scenes3d/parts/${file}.js`, import.meta.url).href;
  const defsUrl = new URL(`../res-3d-study/parts/${file}.json`, import.meta.url).href;
  loads.set(name, Promise.all([import(src).then((mod) => ({ mod }), (err) => ({ err })), OWN.has(name) ? Promise.resolve([]) : fetch(defsUrl).then((r) => (r.ok ? r.json() : [])).catch(() => [])]));
}
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', bloom: { strength: P.bloom }, exposure: P.exposure, renderScale: (+P.renderScale > 0 ? +P.renderScale : null) ?? QS[P.quality] ?? 1,   /* 26-11: renderScale > 0 overrides Quality's (0.85–0.9 keep High's look on the projectors) */ samples: P.quality === 'high' ? 2 : 0, aa: P.aa === 'auto' ? (P.quality === 'high' ? 'taa' : 'msaa') : P.aa });   // aa 'auto': TAA at high (RND-F's variance-clipped TAA), MSAA below — switch the default after QA's fps window   // MSAA 2 at high (T-011, DECISIONES 23:26; was 4)
lt('room'); const NW = room.walls.length;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (cur, to, dt, rate) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
const TR = 4;                                                      // a part's arrive / leave, s (5 before T-028: the tiles carry the change now)

// ------------------------------------------------------------------------------------------------ the parts
// T-065 (LOAD), entrance first: every part is still CREATED before the loop (a part's create is synchronous — the square alone takes
// 0.3 s — and would stall the entrance if it ran during the wait), but only the entrance (umbral3d, atmos, the guide) is compiled and
// warmed before the first frame; the others are compiled a few meshes per frame while the wait plays (bgWarm, below), and until they
// are the start ring holds and a jump waits. entranceFirst: false = as before (everything compiled and warmed before the loop).
const EF = P.entranceFirst !== false;
const ENTRY = new Set(['umbral3d', 'atmos']);
const parts = {}, byName = {}, list = [];
for (const [name, pr] of loads) {
  const [{ mod, err }, defs] = await pr;
  if (!mod) {
    if (CHAPTERS.has(name)) console.info(`res-obra3d: part "${name}" is not there yet (${err?.message}); its stand-in plays`);
    else console.warn(`res-obra3d: part "${name}" failed to load (${err?.message}); skipped`);
    continue;
  }
  try {
    const params = {};
    for (const d of Array.isArray(defs) ? defs : []) params[d.key] = d.default;
    if (name === 'umbral3d') { params.mosaic = P.mosaic || 'image'; params.resetAfter = P['trailer.resetAfter'] ?? 60; params.restSat = P.restSat ?? 0.15; }   // studio 25-11: the entrance's stones — one colour each, or his picture printed on them
    if (name === 'brasa3d') { params.devil2 = P.devil2 !== false; params.fons = !parts.plaza3d || P.plaza3d === false; }   // the baked dark square replaces brasa v2's stand-in (fons)   // studio 26-11: the correfoc devil v3 (reload to change)
    if (name === 'atmos') params.demoLamps = false;                // the square's own lamps light the dust
    if (name === 'plaza') params.glow = 0.3;
    if (name === 'torre3d' && parts.plaza3d && P.plaza3d !== false) params.backdrop = false;   // the trailer's one square stands behind the tower                       // atmos draws the lamps' glow in the air too
    if (name === 'castell') params.density = DENS[P.quality] ?? 1;
    if (name === 'castells3d') { params.quality = P['castells.quality'] && P['castells.quality'] !== 'auto' ? P['castells.quality'] : P.quality;   /* 26-11: the intro's castells on their own quality (room: medium ≈ +8 fps) */ if (P['castells.density'] != null) params.density = P['castells.density']; }   // 26-11: medium → half the points
    if (name === 'pinya3d') params.density = DENS[P.quality] ?? 1;
    if (name === 'baixada3d') params.town = false;                // the real square (plaza, silhouette) is the town behind the dawn   // 3D-PI: fewer points at medium / low
    if (name === 'fall3d') params.duration = TIMES.fall;           // its 15 s script rescaled to the score's fall
    const t0p = performance.now(); const part = mod.create({ THREE, TSL, room, params, parts: byName }); LT['part:' + name] = Math.round(performance.now() - t0p);
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
  } catch (err) { console.warn(`res-obra3d: part "${name}" failed to load (${err.message}); skipped`, err.stack); }
}
const has = (n) => !!parts[n];
// T-057: a steady light is dimmed to 0 while its part is gone and given back its intensity when the part comes back (parts that set the
// intensity once, e.g. a room.lightRecipe().group, stayed dark after their first exit). The value kept is the last one > 0 the light had.
function steadyOff(e) { for (const l of e.steady) { if (l.intensity > 0) l.userData.hostIntensity = l.intensity; l.intensity = 0; } }
function steadyOn(e) { for (const l of e.steady) if (l.intensity === 0 && l.userData.hostIntensity != null) l.intensity = l.userData.hostIntensity; }
// ------------------------------------------------------------------------------------------------ T-060 (TRN): the light of the wait
// The wait is a bright sand noon (ARTE-ENTRADA); every block after it is night. Leaving it is never a cut: over ~2.9 s the outgoing
// threshold goes through a warm dusk — its far sky towards #C98F6A, then the intro's night blue —, its sun and fill redden and sink, and
// last of all the whole threshold fades: the glazed pieces the public revealed (they carry their own glaze light) are the last to go.
// Two multiply shells (one draw per wall each, and only while the ramp runs) hang from the threshold's rig, so the tile passes apply
// them to the OUTGOING world only: the night coming in through the slabs is untouched. `far` is depth-tested at 11.5 m (sky, haze,
// dunes, far floor; the serpentine at 5–10 m is lit and goes down with its lights); `all` covers the whole threshold. Uniforms only.
// Bloom per block (ART: the noon's whites keep their relief): the wait 0.07 on screen with threshold 1.0; the night's bloom comes back
// only once the noon has gone (dusk.t ≥ 2.3 s), so no halo ever blooms over the sand.
const BLOOM = { wait: { strength: 0.14, threshold: 1.0 }, festa: { strength: 0.3, threshold: 0.9 } };   // Vicente 25-11 (aigua): soft bloom in the festa          // strength in the host's scale: room3d applies × 0.5 (BLOOM_K) → 0.07
const bloomTo = (b) => BLOOM[b] || { strength: P.bloom, threshold: 0.85 };
const bloomNow = { ...bloomTo('wait') };
const linC = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const SAND = linC('#F3E6D3'), DUSK = linC('#C98F6A').map((v, i) => v / SAND[i]), NIGHT = linC('#1B2A52').map((v, i) => (6.4 * v) / SAND[i]);   // far shell: sand sky × this = #C98F6A / the intro's night blue (its hue: the darkness is the `all` shell's)
const NEAR = DUSK.map(Math.sqrt);                                  // the near world (floor, unlit glaze) takes half the dusk's stops: it warms with the sky
const GONE = [0.05, 0.055, 0.08];   /* (26-11 QA) a little higher: never a black room */
const DUSK_LIFT = LAB && q.get('dlift') ? q.get('dlift').split(',').map(Number) : [0.25, 0.7];   // (26-11 QA) the `all` shell lifts over this span of the intro's arrive (lab: ?dlift=a,b)                                  // the whole threshold at the end of the ramp (a cool dark, ≈ the intro's level)
const geo = (a, b, k) => a * Math.pow(b / a, k);                  // in stops: an exposure ramp, not a linear fade
const dusk = { t: -1, T: 2.9, far: null, all: null, lights: [], warm: { key: new THREE.Color('#FF9C5A'), sky: new THREE.Color('#E8A070'), ground: new THREE.Color('#6E4636') } };
function duskShell(r, depthTest, order) {
  const col = TSL.uniform(new THREE.Vector3(1, 1, 1));
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, depthTest, fog: false, toneMapped: false });
  m.colorNode = col;
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.ZeroFactor; m.blendDst = THREE.SrcColorFactor;   // dst × col
  m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), m);
  mesh.name = 'host:dusk'; mesh.renderOrder = order; mesh.frustumCulled = false; mesh.position.copy(room.eye);
  return { mesh, col };
}
if (parts.umbral3d) {
  const U = parts.umbral3d;
  dusk.far = duskShell(11.5, true, 9000); dusk.all = duskShell(1.5, false, 9001);
  U.rig.add(dusk.far.mesh, dusk.all.mesh);                         // visible now: compiled with the rest below; hidden from the first frame
  for (const l of U.steady) dusk.lights.push({ l, color: l.color.clone(), ground: l.groundColor ? l.groundColor.clone() : null });
}
function duskEnd() {
  if (!dusk.far) return;
  dusk.far.mesh.visible = false; dusk.all.mesh.visible = false; dusk.far.col.value.set(1, 1, 1); dusk.all.col.value.set(1, 1, 1);
  if (dusk.t >= 0) for (const d of dusk.lights) { d.l.color.copy(d.color); if (d.ground) d.l.groundColor.copy(d.ground); }
  dusk.t = -1;
}
// after the parts' update (umbral3d sets its lights' intensity every frame) and before the render
function stepDusk(dt) {
  const U = parts.umbral3d;
  if (!dusk.far || !U || S.block === 'wait' || U.state === 'off') { if (dusk.t >= 0 || dusk.far?.mesh.visible) duskEnd(); return; }
  dusk.t = dusk.t < 0 ? 0 : dusk.t + dt;
  const t = dusk.t, a = smooth(t / 1.0), b = smooth((t - 1.2) / 1.4), c = smooth((t - 1.0) / 1.9);   // dusk 0–1 s · the sky's hue to night 1.2–2.6 s · everything down 1–2.9 s (sky never darker than the ground)
  const f = dusk.far.col.value, g = dusk.all.col.value;
  f.set(geo(geo(1, NEAR[0], a), NIGHT[0], b), geo(geo(1, NEAR[1], a), NIGHT[1], b), geo(geo(1, NEAR[2], a), NIGHT[2], b));   // × the `all` shell's NEAR: the sky = #C98F6A at the dusk
  g.set(geo(geo(1, NEAR[0], a), GONE[0], c), geo(geo(1, NEAR[1], a), GONE[1], c), geo(geo(1, NEAR[2], a), GONE[2], c));
  // (26-11 QA) the `all` shell darkens EVERYTHING drawn before it, the intro's square too: as the threshold's own stones have faded with
  // its leave (≤ 5 % from 0.75), the shell lifts back to 1, so the intro's world rises out of the dusk instead of ~2 s of black
  // (26-11 QA, tiles off) with no tile pass the shell also covers the INCOMING world: it lifts with the intro's arrive too (plaza3d's,
  // else atmos'), DUSK_LIFT[0] → [1] of it (≈ +1.0 … +2.8 s at TR 4 s); `far` stays, so the noon's sky never comes back
  { const I = parts.plaza3d && parts.plaza3d.state !== 'off' ? parts.plaza3d : parts.atmos;
    const k = Math.max(smooth(((U.leave || 0) - 0.75) / 0.25), I && I.state !== 'off' && I.state !== 'out' ? smooth(((I.arrive ?? 0) - DUSK_LIFT[0]) / (DUSK_LIFT[1] - DUSK_LIFT[0])) : 0);
    if (k > 0) g.set(g.x + (1 - g.x) * k, g.y + (1 - g.y) * k, g.z + (1 - g.z) * k); }
  dusk.far.mesh.visible = t > 0; dusk.all.mesh.visible = t > 0;
  const gl = geo(1, 0.5, a) * (1 - smooth((t - 0.9) / 1.1));      // the sun and the fill: ×0.5 at the dusk, out by 2.0 s (the ground darkens with the sky, not after it)
  for (const d of dusk.lights) {
    d.l.intensity *= gl;
    if (d.ground) { d.l.color.copy(d.color).lerp(dusk.warm.sky, a); d.l.groundColor.copy(d.ground).lerp(dusk.warm.ground, a); }
    else d.l.color.copy(d.color).lerp(dusk.warm.key, a);
  }
}
function stepBloom(dt) {
  const hold = S.block !== 'wait' && dusk.t >= 0 && dusk.t < 2.3;  // the noon's soft bloom until the threshold is dark
  const g = hold ? BLOOM.wait : bloomTo(S.block), r = S.block === 'wait' ? 8 : 2.5;
  bloomNow.strength = ease(bloomNow.strength, g.strength, dt, r); bloomNow.threshold = ease(bloomNow.threshold, g.threshold, dt, r);
  room.setBloom(bloomNow);
}
room.setBloom(bloomNow);
const hints = createHints({ THREE, TSL, room });   // 26-11: a hand and a few words per wall, until someone does it there
const subs = createSubtitles({ THREE, TSL, room }); try { window.__subs = subs; } catch { /* no window */ }                     // studio 26-11: English subtitles over every wall (subtitles.js)
const TITLE_WALL = 1;                                                // studio 25-11 (Beltrán): P1 opens a window for the title — no start ring there
// studio 26-11 (Beltrán: «subí los círculos donde se tendrá que apretar»): the start button sits in the picture's round windows, at
// 1.51 m of its 3.75 m (MosaicEtapa1_1094.png) — the same fraction of each wall's height here; a hand counts within 0.5 m of the
// circle's centre. The SOUND piece runs its own score (it leads): it gets the same button over the channel (ctl.button, every 1 s).
const BUTTON_V = 1.511 / 3.75, BUTTON = { noButton: [TITLE_WALL], y: room.walls.map((w) => +(BUTTON_V * (w.height || 3.75)).toFixed(3)), r: 0.5 };
lt('parts'); const guide = createGuide({ THREE, TSL, room, studio: P.mode === 'lab', noTarget: [TITLE_WALL], handY: BUTTON.y[0] });   // T-069 (Vicente 25-11): rulers and wall IDs only in mode 'lab'
room.overlay.add(guide.object);   // T-028: the guide is drawn over the final image (after the tiles: the words never break); its materials are depthTest-free
// compile every material once, now, so a universe arriving later does not stall the room
// T-057 (prewarmRT): into the strip's format — with no target, compileAsync built pipelines for the canvas that no frame uses
const toStrip = async (fn) => { const rt0 = room.renderer.getRenderTarget(); if (P.prewarmRT !== false) room.renderer.setRenderTarget(room.strip); try { return await fn(); } finally { room.renderer.setRenderTarget(rt0); } };
try { for (const e of list) e.part.object.visible = !EF || ENTRY.has(e.name); await toStrip(() => room.renderer.compileAsync(room.scene, room.walls[0].camera)); } catch (err) { console.info('res-obra3d: precompile skipped (' + err.message + ')'); }
for (const e of list) e.part.object.visible = false;
lt('compile');

// ------------------------------------------------------------------------------------------------ the score: led by the sound piece, or its own
const score = createScore(NW, { noButton: BUTTON.noButton, buttonY: BUTTON.y, buttonR: BUTTON.r }), S = score.state;
const link = { at: -1e9, ts: 0, pace: 1, beat: 0, events: [], acta: null, told: 0 };
const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null;
if (bc) bc.onmessage = (ev) => {
  const m = ev.data;
  if (m?.type === 'sub') { if (m.name) subs?.say(m.name, m.in || 0, m.dur || 3); else subs?.clear(); return; }   // studio 26-11: the voice's subtitles
  if (m?.type !== 'state' || !m.s || !('block' in m.s)) return;
  const { events, ...s } = m.s; Object.assign(S, s);
  link.events.push(...(events || [])); link.at = performance.now(); link.ts = m.ts; link.pace = m.pace || 1; link.beat = s.beat; link.acta = m.acta;
};
const following = () => performance.now() - link.at < 700;
const tell = (o) => { try { bc?.postMessage({ type: 'ctl', ...o }); } catch { /* a closed channel: carry on alone */ } };
// A jump made on this page (the 'Go to' parameter, the lab's checks, the review page) goes to the sound piece too: while the sound leads,
// a local jump alone was overwritten by the sound's next state (25 ms later) and the picture only changed when the sound's own score
// got there — the "3–4 s" lag of the audits. The sound applies a ctl jump within ~0.2 s.
// T-065: until the chapters are compiled (bgWarm) a jump waits (the last one asked is made then) and the start ring holds: the ring's
// time is 600 s, here and in the sound piece (ctl times), so a hand on the button barely moves it; the real time comes back when ready.
const bg = { ready: !EF, jump: null, HOLD: 600, slow: [] };   // slow: the background steps > 30 ms (lab)
{ const raw = score.jump; score.jump = (b) => { if (!bg.ready) { bg.jump = b; return; } raw(b); tell({ jump: b }); }; }
let lastJump = 'none';
const doJump = () => { if (P.jump !== lastJump) { lastJump = P.jump; if (P.jump && P.jump !== 'none') score.jump(P.jump); } };
// T-052: the thresholds (params `tuning` + `t.<block>.<field>`, ressonancia/tuning.js) go LIVE into this page's score and, over the
// channel, into the sound piece's score (which leads): { type: 'ctl', times } on every change and every 1 s (a sound started later
// picks them up). The score reads T.<block>.<field> on every step: no reload.
let tuned = tuneOverrides(P);
const timesNow = () => (bg.ready ? tuned : { ...tuned, start: bg.HOLD });
const tune = () => { tuned = tuneOverrides(P); const n = applyTimes(score.times, timesNow(), TIMES); if (n) { console.info('res-obra3d: thresholds', JSON.stringify(Object.fromEntries(Object.entries(tuned).filter(([, v]) => v != null)))); tell({ times: timesNow() }); } };
vt.on('params', (p) => { Object.assign(P, p); room.renderer.toneMappingExposure = P.exposure; tune(); doJump(); });
tune();
doJump();

// ------------------------------------------------------------------------------------------------ TRAILER: the clock
// One clock (TT, s) drives the whole trailer; it runs only once the chapters are compiled (bg.ready). Segments: the entrance mosaic
// (preroll) → the square: title and written trailer → the correfoc: the work's data → the resonance: closing line, credits, logos →
// back to the entrance, and again. The score is held in the segment's block: if it moves on by itself (a group finishing a chapter's
// play early), a move into the NEXT segment's block jumps the clock there; any other move is put back.
const TRL = { tt: 0, seg: -1, jumpedAt: -9, loops: 0 };
const segments = () => {
  const pre = P['trailer.preroll'] ?? 12, title = 55, fire = parts.brasa3d?.part?.sound ? (P['trailer.brasaMax'] ?? 150) : 53, res = 62;   // 26-11: the correfoc v2 lasts until its storm (at most trailer.brasaMax s)   // 26-11: the new intro script ends at ~52.6 s   // title 50: the intro's 4th line (41 s, ~5.4 s) ends before the correfoc
  // studio 26-11 (Beltrán): the PINYA after the correfoc — not timed: it lasts until the room is full and the beings have let go (the
  // part's fill().done), at most trailer.pinyaMax s; trailer.pinya = false leaves it out
  const pin = P['trailer.pinya'] === false || !has('pinya3d2') ? 0 : (P['trailer.pinyaMax'] ?? 180);
  const SG = [['wait', 0], ['intro', pre], ['brasa', pre + title]];
  if (pin) SG.push(['pinya', pre + title + fire]);
  const tow = P['trailer.torre'] === false || !has('torre3d') ? 0 : (P['trailer.torreMax'] ?? 240);   // the tower: until its golden ending is done
  if (tow) SG.push(['tronc', pre + title + fire + pin]);
  // studio 26-11 (Beltrán: «ya no vamos a hacer créditos»): after the tower's golden ending the room goes back to the mosaic (the
  // entrance assembles again); trailer.credits = true brings the credits back
  // … and closes on a poetic line (26-11, Beltrán): the square of particles and the castells again, «When bodies resonate together,
  // culture is born» on one wall, «Thank you for joining Ressonància» on another, the voice, then black and the mosaic (score block 'acta')
  const out = P['trailer.outro'] === 0 ? 0 : (P['trailer.outro'] ?? 18), e0 = pre + title + fire + pin + tow;
  if (P['trailer.credits'] === true) SG.push(['festa', e0], ['end', e0 + res]);
  else { if (out) SG.push(['acta', e0]); SG.push(['end', e0 + (out || (tow ? 0 : 8))]); }
  return SG;
};
function trailerStep(dt) {
  if (!bg.ready) return;
  const SG = segments();
  if (P.jump && P.jump !== 'none') {                               // rehearsal: the held block's segment plays on a loop
    const k = SG.findIndex((s) => s[0] === P.jump); if (k < 0) return;
    const a = SG[k][1], b = SG[k + 1] ? SG[k + 1][1] : a + 30;
    TRL.tt = TRL.tt < a || TRL.tt >= b ? a : TRL.tt + dt; TRL.seg = k; return;
  }
  TRL.tt += dt;
  // studio 26-11 (Beltrán, the narrative): the entrance is not timed — it lasts until the public, having uncovered enough of the picture
  // (paintOpen), holds a button (the score moves to 'intro' and the trailer follows, below). trailer.waitButton = false: the preroll timer
  if (P['trailer.waitButton'] !== false && S.block === 'wait' && TRL.seg <= 0 && TRL.tt > SG[1][1] - 0.05) TRL.tt = SG[1][1] - 0.05;
  { const k = SG.findIndex((g) => g[0] === 'pinya'), pt = parts.pinya3d2?.part;   // the pinya ends when its part is done
    if (k > 0 && TRL.seg === k && S.block === 'pinya' && pt?.fill && pt.fill().done && TRL.tt < SG[k + 1][1]) TRL.tt = SG[k + 1][1]; }
  { const k = SG.findIndex((g) => g[0] === 'brasa');   // the correfoc v2 ends when its storm has filled the room
    if (k > 0 && TRL.seg === k && S.block === 'brasa' && link.stormFull && TRL.tt < SG[k + 1][1]) TRL.tt = SG[k + 1][1]; }
  { const k = SG.findIndex((g) => g[0] === 'tronc'), pt = parts.torre3d?.part;   // and the tower when its golden ending is done
    if (k > 0 && TRL.seg === k && S.block === 'tronc' && pt?.progress && pt.progress().done && TRL.tt < SG[k + 1][1]) TRL.tt = SG[k + 1][1]; }
  if (TRL.tt >= SG[SG.length - 1][1]) { TRL.tt = 0; TRL.loops++; }
  let i = 0; while (i + 1 < SG.length - 1 && TRL.tt >= SG[i + 1][1]) i++;
  const want = SG[i][0];
  if (i !== TRL.seg) { TRL.seg = i; TRL.jumpedAt = time; if (S.block !== want) score.jump(want); return; }
  if (S.block !== want && time - TRL.jumpedAt > 1.5) {
    const next = SG[i + 1] && SG[i + 1][0];
    if (S.block === next) { TRL.tt = SG[i + 1][1]; TRL.seg = i + 1; }   // the room moved on by itself: the trailer follows
    else { TRL.jumpedAt = time; score.jump(want); }
  }
}

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
// TRAILER: the trailer's blocks; the presentation layer stays on from the square to the resonance (it never crosses a tile pass)
const SQ = () => has('plaza3d') && P.plaza3d !== false;   // the one square of the trailer (intro → correfoc → pinya)
function wanted(b) {
  const T = has('trailertext') ? ['trailertext'] : [];
  switch (b) {
    case 'wait': return has('umbral3d') ? (parts.umbral3d?.part?.charge?.().cleared ? ['umbral3d', 'atmos'] : ['umbral3d']) : ['atmos'];   // studio 26-11 (Beltrán): once the mosaic falls, the square's air is already there behind it
    case 'intro': return [SQ() ? 'plaza3d' : 'plaza', 'atmos', has('castells3d') && P.castells3d !== false ? 'castells3d' : 'castell', ...(has('introp1') ? ['introp1'] : []), ...T];   // 26-11: the new baked square (plaza3d) and the castells of particles at many depths (castells3d); = false: the old ones
    case 'brasa': return has('brasa3d') ? ['brasa3d', ...(SQ() ? ['plaza3d'] : []), 'atmos', ...T] : ['atmos', ...T];   // 26-11: the SAME square goes on (Beltrán: «dentro del mismo mundo»)
    case 'pinya': return has('pinya3d2') ? ['pinya3d2', ...(SQ() ? ['plaza3d'] : []), 'atmos', ...T] : ['atmos', ...T];
    case 'acta': return [...(SQ() ? ['plaza3d'] : []), ...(has('castells3d') ? ['castells3d'] : []), ...(has('introp1') && P['trailer.outroText'] !== false ? ['introp1'] : []), 'atmos'];   // the closing (its words: introp1's outro mode, once Título delivers it)   // studio 26-11: the pinya v2
    case 'tronc': return has('torre3d') ? ['torre3d', ...(SQ() ? ['plaza3d'] : []), 'atmos', ...T] : ['atmos', ...T];   // 26-11: the same square, as points sinking behind the tower   // studio 26-11: the tower (score block 'tronc')
    case 'festa': case 'crown': return has('festa3d') ? ['festa3d', 'atmos', ...T] :   // (26-11: the dust stays through the credits)
                                    ['plaza', 'castell', 'atmos', ...T];
    default: return ['atmos', ...T];
  }
}
function wantedObra(b) {                                            // res-obra3d's map, kept for reference (unused here)
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
  pinya: { warm: [1.0, 0.27, 0.19], cool: [0.50, 0.58, 0.72], air: [0.0030, 0.0036, 0.0060], thread: [0.89, 0.23, 0.18], shape: 'point' },   // studio 26-11: pinya v2 — cold blue-grey dust, the red of its net (was turquoise)
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
  tr.delay = from === 'wait' ? 1.0 : 0.15;                              // T-060: out of the noon the slabs wait 1 s: the dusk falls first, they carry dusk → night
  tr.origin = (Math.random() * 4 | 0) * 0.25 + 0.125;                  // the front starts at the centre of one wall
  room.setTiles({ on: P.tiles === true, seed: Math.random() * 100, origin: tr.origin, origins: 1, mix: 0, amount: 1, accentFrom: (PAL[from] || PAL.intro).thread, accentTo: (PAL[to] || PAL.intro).thread });
  if (P.tiles === true) thread.begin(from, to);   // 26-11 (Beltrán: «transiciones súper orgánicas, con disolución de partículas»): no slabs, no thread — every part comes and goes as particles
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
  if (P.tiles === true) thread.update(dt, k);
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
  if (tr.on || P.tiles !== true || pl.home !== 'intro' || S.block !== 'intro' || pl.torn) return null;
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
// the simulated visitors' targets: what a visitor who follows the hint would hold (the entrance's buttons once the walls are painted,
// the tower's places on the other walls, her golden point at 1.2 m); elsewhere they just touch, drag and hold where they stand
function simTarget() {
  if (S.block === 'wait') { const pt = parts.umbral3d?.part?.paint?.(); return { walls: [0, 1, 2, 3], dx: 0, y: 1.5, hold: 3.5, p: pt && pt.share >= (P.paintOpen ?? 0.25) ? 0.55 : 0.04 }; }
  if (S.block === 'tronc') { const g = parts.torre3d?.part?.progress?.() || {}; if (g.ending > 0) return null; return g.ready ? { walls: [0, 2, 3], dx: 0, y: 1.2, hold: 2.5, p: 0.6 } : { walls: [0, 2, 3], dx: null, y: null, hold: 2, p: 0.6 }; }
  return null;
}
function frame(dt) {
  time += dt;
  { const n = +P['sim.visitors'] || 0;
    if (n || SIM.count) { SIM.update(time, dt, { n, target: simTarget() }); try { bc?.postMessage({ type: 'sim', ...SIM.sound() }); } catch { /* alone */ } } }
  const hs = readHands();
  frameEvents.length = 0;
  trailerStep(dt);                                                  // TRAILER
  if (following()) {
    if (S.block === 'tronc') S.beat = (link.beat + (((Date.now() - link.ts) / 1000) * link.pace) / score.times.tronc.period) % 1;   // between two messages the pulse keeps moving
    if (time - link.told > 1) { link.told = time; tell({ pace: P.pace || 1, times: timesNow(), lang: P.lang, button: BUTTON, intro: 'trailer' }); }   // TRAILER: lang — the voice speaks the trailer's language
    frameEvents.push(...link.events.splice(0));
  } else { score.step(dt * (P.pace || 1), scoreHands); frameEvents.push(...S.events); S.events.length = 0; }
  if ((time - actaAt > 0.5 || S.block !== lastBlock) && S.block !== 'wait' && S.block !== 'intro') { actaAt = time; acta = link.acta && following() ? link.acta : score.acta(); }   // kept through the wait: the acta leaving must not read a reset score
  const changed = S.block !== lastBlock && lastBlock !== '', fromBlock = lastBlock;
  if (S.block !== lastBlock) {
    prevBlock = lastBlock;
    try { room.setEnvironment?.(S.block); } catch (err) { console.info('res-obra3d: setEnvironment skipped (' + err.message + ')'); }   // RND-F: the shared envMap per block (HDRI / tint), re-baked in place
    room.setBackground?.(S.block === 'wait' && has('umbral3d') ? { bottom: [0.012, 0.022, 0.066], top: [0.012, 0.022, 0.066], gain: 1 } : S.block);   // 26-11 QA: the mosaic comes back over its own night blue, never a flash of sand                                  // T-048 (SIS): the block's deep background gradient (never #000), eased in room3d
    if ((S.block === 'wait' || S.block === 'intro') && parts.baixada3d?.part.releaseTronc) { try { parts.baixada3d.part.releaseTronc(); } catch (err) { console.info('res-obra3d: releaseTronc skipped (' + err.message + ')'); } }   // 3D-PO: a new pass gives the tower's floors back to tronc3d
    if (S.block === 'fall') {
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
    lastBlock = S.block;
  }

  // who comes, who goes
  const W = wanted(S.block);
  const tk = tr.on && P.tiles === true ? room.tiles.mix.value : -1;
  for (const e of list) {
    if (W.includes(e.name)) {
      if (e.home !== S.block) { e.home = S.block; e.fallK = 0; if ((e.name === 'pinya3d2' && S.block === 'pinya') || (e.name === 'torre3d' && S.block === 'tronc') || (e.name === 'brasa3d' && S.block === 'brasa')) { e.part.reset?.(); if (e.name === 'brasa3d') link.stormFull = false; } }   // (26-11: every pass starts an empty room)
      if (e.state === 'off') { for (const l of e.lights) l.visible = true; placeRig(e.rig, 0, tr.mv); e.state = 'in'; e.came = true; e.arrive = 0; e.leave = 0; e.clock = 0; steadyOn(e); e.wait = S.block === 'baixada' && prevBlock === 'festa' ? 0.9 : 0; e.part.object.visible = true; }   // festa→baixada: the festa is dark by ~1.5 s, the bajada starts at 0.9 s so the two cross
      else if (e.state === 'out') { e.state = 'in'; e.came = true; e.arrive = 1 - e.leave; e.leave = 0; }
    } else if (e.state === 'on' || e.state === 'in') { e.leave = 1 - e.arrive; e.arrive = 1; e.state = 'out'; e.outAt = time; e.came = false; }   // came: a part arriving in an unfinished transition must not stay in the 'in' world (RND-F 24-11: else it is in neither)
    // while the tiles carry a change, the slabs must carry IMAGES: the new world assembles fast (it is revealed slab by slab) and the old
    // one stays whole until most of its slabs have turned (then it breaks, quickly, under the last of them); a part left over from an
    // earlier change (rapid jumps) goes quickly; the acta's words never linger over the threshold (QA 24-11): 1.2 s, no hold
    if (e.state === 'in') { if (e.wait > 0) e.wait -= dt; else { e.arrive = Math.min(1, e.arrive + dt / (tk >= 0 ? 1.6 : TR)); if (e.arrive >= 1) e.state = 'on'; } }
    else if (e.state === 'out') { e.leave = Math.min(1, e.leave + (e.name === 'actatext' ? dt / 1.2 : tk < 0 ? dt / TR : e.outAt < tr.at - 1.0 ? dt / 1.2 : tk < 0.6 ? 0 : dt / 1.5)); if (e.leave >= 1 && !e.part.lingering) { e.state = 'off';   /* 26-11: a part whose dust still floats (part.lingering) keeps playing */ e.part.object.visible = false; for (const l of e.lights) l.visible = false; steadyOff(e); } }
  }

  if (changed) {
    if ((P.tiles === true || P.eye !== false) && list.some((e) => e.state === 'out')) startTransition(fromBlock, S.block);
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
      // studio 26-11 (Beltrán: «las partículas que quedan visibles al caerse el muro deben ser las mismas que hay al inicio de la
      // animación siguiente»): in the entrance, atmos only comes once the mosaic has fallen, and it comes as the square's air (intro's mood,
      // dust and haze, no line); lvlFloor keeps it full when the square's clock starts at 0, so the motes go on without a blink
      const early = e.home === 'wait' && has('umbral3d');
      if (early) { t = 0; if (!e.carry) { e.mood = 1; e.dustK = 0.5; e.acta = 0; } e.carry = 1; } else if (e.home !== 'intro' && e.home !== 'acta') e.carry = 0;   // it arrives already as the square's air (no ease from the acta's dark)
      // 26-11 (Beltrán: «la sala nunca se puede ver de un color plano»): the closing keeps the intro's full air of motes (not the acta's black)
      const look = early || e.home === 'acta' ? 'intro' : e.home;
      e.mood = ease(e.mood ?? 1, look === 'baixada' ? 0.22 : look === 'tronc' ? 0.2 : look === 'acta' ? 0.15 : look === 'wait' ? 0.08 : look === 'pinya' ? 0.25 : 1, dt, 1.2);   // the wait: almost total dark, a line of embers   // the acta: black and typography   // the baixada: the air clears so the falling light reads
      for (const key of ['dust', 'haze', 'line']) p[key] = (e.base[key] ?? 1) * smooth(k) * (key === 'line' ? 1 : e.mood);
      e.dustK = ease(e.dustK ?? 1, look === 'intro' ? 0.5 : e.home === 'brasa' ? 0 : 1, dt, 1.2); p.dust *= e.dustK;   // Vicente 25-11 (ARTE-BRASA): no motes in the Brasa, only sparks (in res-obra3d the multiply ended up inside the comment)   // art 24-11: in the square at half (it read as snow)
      p.bokeh = (e.base.bokeh ?? 1) * e.mood;
      e.acta = ease(e.acta ?? 0, look === 'acta' || look === 'wait' ? 1 : 0, dt, 1.2);   // acta and wait: no lamps in the air, no haze
      e.noHaze = ease(e.noHaze ?? 0, e.home === 'pinya' ? 1 : 0, dt, 1.2); p.haze *= 1 - e.noHaze;   // pinya: no haze (the motes read as static)
      if (e.acta > 0.001) { p.haze *= 1 - e.acta; p.lampGain = (e.base.lampGain ?? 1) * (1 - e.acta); } else p.lampGain = e.base.lampGain ?? 1;
      e.stirK = ease(e.stirK ?? 1, e.home === 'pinya' ? 0.4 : e.home === 'tronc' ? 0.3 : e.home === 'baixada' ? 0.5 : 1, dt, 1.2);   // where figures stand behind the buttons, the hands' warm dust is softer
      p.stir = (e.base.stir ?? 1) * e.stirK;
      p.warm = pal.warm; p.cool = pal.cool; p.air = pal.air;   // the colour script
      p.lineColor = pal.line; p.lineHalo = pal.halo; p.line *= pal.lineK; if (early || (e.home === 'intro' && has('plaza3d') && P.plaza3d !== false)) p.line = 0;   // (26-11: the new intro has no horizon line)
      p.lvlFloor = e.carry ? 1 : 0;   // hands still stir it, less: the warm swirls were the bright cloud by the targets
    } else if (e.name === 'plaza') {
      if (e.home === 'intro') { t = S.block === 'intro' ? S.t : 70; p.noBreak = P.tiles === true; p.skyTint = INTRO_SKY; p.silhouette = 0; p.shatter = 0; p.reveal = 0; p.lamps = e.base.lamps ?? 1; p.sky = e.base.sky ?? 1; p.windows = Math.max(0.55, e.base.windows ?? 0.45); p.pool = 1.5; p.moonKey = 1.0; p.night = 1; p.reach = 0.4; p.glow = e.base.glow ?? 0.3; p.haze = e.base.haze ?? 1; p.moon = e.base.moon ?? 1; e.mood = 1; }
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
    } else if (e.name === 'plaza3d') {
      // studio 26-11 (Beltrán's intro): the square condenses out of the dust with the first lines (1.5–14 s), becomes points again on
      // «Welcome to Ressonància» (17–19 s) and stays a square of particles behind the castells and the titles, then lifts away (50.5–55 s)
      // … and it stays the SAME square after the intro (26-11): the correfoc darkens it (dark, its fires light it), the pinya keeps it as
      // faint points; its parameters ease inside the part (params.ease), so a block may set them at once; reveal / shatter are the clock
      const sm = (a, b, x) => smooth((x - a) / (b - a));
      if (e.home === 'intro') {
        t = serving ? S.t : 60; const back = sm(17, 19, t);
        p.reveal = sm(1.5, 14, t) * (1 - 0.45 * back); p.dark = 0; p.occlude = 1;
        p.pointGain = 0.05 + ((P['intro.pointGain'] ?? 0.4) - 0.05) * back; p.breathe = back; p.cool = 0.5 * back;
      } else if (e.home === 'brasa') {
        const k = sm(0.5, 5.5, serving ? S.t : 9);                    // the particles of the intro turn into the dark square of the fires
        p.dark = 1; p.reveal = 0.55 + 0.45 * k; p.pointGain = 0.4 * (1 - k) + 0.05 * k; p.breathe = 1 - k; p.cool = 0.5;
      } else if (e.home === 'pinya') {   // (26-11 QA) the correfoc's light dies with its dust, over ~4 s, not in one frame
        const k = 1 - smooth((serving ? S.t : 9) / 4.5);
        p.dark = 1; p.reveal = 0.55 + 0.45 * k; p.pointGain = 0.1; p.breathe = 1; p.cool = 0.6;   /* (QA) reveal isn't eased in the part: the lit plate fades with the fires */ p.fires = (e.lastFires || [0, 0, 0, 0]).map((f) => f * k); p.lit = (e.lastLit || 0) * k; }
      if (e.home === 'tronc') {   // the tower: points only, no occluder, moved down with the tower's world (its plazaSink parallax)
        const g = parts.torre3d?.part?.progress?.() || {};
        p.dark = 1; p.reveal = 0.55; p.occlude = 0; p.pointGain = 0.35; p.breathe = 1; p.cool = 0.5; p.fires = [0, 0, 0, 0]; p.lit = 0;
        e.part.object.position.y = (g.worldY || 0) * (1 + (g.plazaSink ?? 0.35));
      } else e.part.object.position.y = 0;
      const D = P['trailer.outro'] ?? 18;
      if (e.home === 'acta') { const ta = serving ? S.t : 0; p.dark = 0; p.reveal = 0.55; p.occlude = parts.torre3d && parts.torre3d.state !== 'off' ? 0 : 1;   /* (QA) no occluder while the tower's gold dust still leaves */ p.pointGain = 0.35 + 0.05 * sm(0, 3, ta); p.breathe = 1; p.cool = 0.5; p.fires = [0, 0, 0, 0]; p.lit = 0; p.shatter = Math.max(e.leave || 0, sm(D - 5, D - 1.5, ta)); }
      else p.shatter = e.leave || 0;
    } else if (e.name === 'castells3d' || e.name === 'introp1') {
      if (e.home === 'acta') { t = serving ? S.t : 0; p.mode = 'outro'; p.outroDur = P['trailer.outro'] ?? 18; }   // the closing: its own clock and mode
      else { t = S.block === 'intro' && serving ? S.t : 60; p.mode = 'intro'; }
    }   // its build, stages and end ride the intro's clock
    else if (e.name === 'actatext') t = serving ? S.t : 40;
    else if (e.name === 'trailertext') { t = TRL.tt; input.segments = segments(); input.lang = P.lang; }   // TRAILER: its own clock
    else if (e.name === 'introtext') t = S.block === 'intro' && serving ? S.t : 76 + 3 * Math.min(1, e.leave * 8);   // the title goes in ~1.5 s: it must not sit under Brasa's card
    else if (e.name === 'brasa3d') p.tint = e.state === 'out' ? (PAL[S.block] || PAL.pinya).cool : null;   // its dust cools to the next block's air
    else if (e.name === 'castell') { p.tint = pal.tint; if (e.home === 'intro') t = S.block === 'intro' ? S.t : 70; driveCastell(e, dt, time, frameEvents); }
    input.t = t; input.progress = e.progress; input.params = p; input.arrive = e.arrive; input.leave = e.leave;
    const p0 = performance.now(); e.part.update(dt, input); prof.max(e.name, performance.now() - p0);
  }
  // studio 26-11: the share of the entrance's picture uncovered opens the buttons — this score's reveal and the sound's (it leads)
  { const pt = parts.umbral3d?.part?.paint?.();
    if (pt) { const rv = Math.min(1, pt.share / Math.max(0.01, P.paintOpen ?? 0.25));   // share = the LEAST painted wall's (26-11: «mínimo por muro, un 25 % en cada uno») score.setReveal(rv);
      if (Math.abs(rv - (link.rvSent ?? -1)) > 0.01 || time - (link.rvAt ?? -9) > 1) { link.rvSent = rv; link.rvAt = time; tell({ reveal: rv }); } }
    // studio 26-11: the START is the charge ring round the room (umbral3d: one hand in a circle, or several) — this score's and the sound's
    // (its start tone rises with it); once the mosaic has fallen (CLEAR) and the room has stayed blue CLEAR_HOLD s, the trailer goes on
    // studio 26-11: the pinya v2 says how full the room is — this score's and the sound's pinya hold on it (they never end it themselves)
    const pf = S.block === 'pinya' ? parts.pinya3d2?.part?.fill?.() : null;
    if (pf) { score.setFill(pf.total); if (Math.abs(pf.total - (link.fiSent ?? -1)) > 0.01 || time - (link.fiAt ?? -9) > 1) { link.fiSent = pf.total; link.fiAt = time; tell({ fill: pf.total }); }
      const k = pf.total; room.setBackground?.({ bottom: [0.0035 + 0.006 * k, 0.0045 + 0.0015 * k, 0.008], top: [0.008 + 0.01 * k, 0.011 + 0.002 * k, 0.02 - 0.004 * k], gain: 1 }); }   // the part's dark, warming with the fill
    // the tower: its climbers (and the golden charge) hold both scores' tronc; «hold the golden light» when it is ready for it
    // the correfoc v2: its fires hold both scores' brasa, light the dark square (plazaDark), feed the fire's sound; its storm ends it
    const bp = S.block === 'brasa' ? parts.brasa3d?.part : null;
    if (bp?.progress) { const g = bp.progress(), ev = bp.events || [];
      if (ev.includes('storm:full')) link.stormFull = true;
      score.setFill(g.total ?? 0); if (Math.abs((g.total ?? 0) - (link.fiSent ?? -1)) > 0.01 || time - (link.fiAt ?? -9) > 1) { link.fiSent = g.total ?? 0; link.fiAt = time; tell({ fill: g.total ?? 0 }); }
      const pd = parts.plaza3d; if (pd && pd.home === 'brasa') { const k = 1 - 0.6 * (g.storm || 0); pd.params.fires = (g.fires || [0, 0, 0, 0]).map((f) => f * k); pd.params.lit = (g.boom || 0) * k; pd.lastFires = pd.params.fires.slice(); pd.lastLit = pd.params.lit; }
      if (bp.sound) try { bc?.postMessage({ type: 'brasa', s: bp.sound() }); } catch { /* alone */ } }
    const tp = S.block === 'tronc' ? parts.torre3d?.part : null;
    if (tp?.progress) { const g = tp.progress(), v = Math.min(1, 0.9 * (g.needed ? g.climbers / g.needed : 0) + 0.1 * (g.charge || 0));
      score.setFill(v); if (Math.abs(v - (link.fiSent ?? -1)) > 0.01 || time - (link.fiAt ?? -9) > 1) { link.fiSent = v; link.fiAt = time; tell({ fill: v }); }
      if ((tp.events || []).includes('aleta:ready')) tell({ say: 'v-torre-gold' }); }
    const ch = parts.umbral3d?.part?.charge?.();
    if (ch && S.block === 'wait') {
      const st = ch.cleared ? (ch.clearedFor >= (P['trailer.clearHold'] ?? 6) ? 1 : 0.999) : Math.min(0.998, ch.cover);
      score.setStart(st);
      if (Math.abs(st - (link.stSent ?? -1)) > 0.01 || st >= 1 || time - (link.stAt ?? -9) > 1) { link.stSent = st; link.stAt = time; tell({ start: st }); }
    } }
  // studio 26-11 (Beltrán: «la interactividad funciona cuando es sinestésica»): every part's events of this frame go to the sound piece
  // ({ type: 'ev', part, block, ev: [...] }), and its progress about 4× a second ({ type: 'st', part, block, p }), so every touch, birth,
  // climb, tier, feed, boom and ending can sound
  for (const e of list) {
    if (e.state === 'off' || !e.part) continue;
    const ev = e.part.events; if (ev && ev.length) try { bc?.postMessage({ type: 'ev', part: e.name, block: S.block, ev: ev.slice(0, 32) }); } catch { /* alone */ }
    if (time - (e.stAt ?? -9) > 0.25) { e.stAt = time; const pr = e.part.progress?.() ?? e.part.fill?.() ?? (e.part.charge ? { ...e.part.charge(), paint: e.part.paint?.() } : null); if (pr) try { bc?.postMessage({ type: 'st', part: e.name, block: S.block, p: pr }); } catch { /* alone */ } }
  }
  // studio 26-11 (Beltrán): the hints per wall — after each stage's opening, a hand and two or three words; gone on a wall once someone
  // does it there, back after `idle` s with nobody doing it on that wall (P['trailer.hints'] = false: none)
  { let cfg = null;
    if (P['trailer.hints'] !== false) {
      if (S.block === 'brasa') cfg = { text: 'Touch the wall', walls: [0, 1, 2, 3], from: 12, idle: 15, y: 1.25, dx: -1.8 };   // beside the fire, not on it
      else if (S.block === 'pinya') cfg = { text: 'Touch the wall', walls: [0, 1, 2, 3], from: 11, idle: 15, y: 1.35, dx: -1.8 };   // beside the opening's beings
      else if (S.block === 'tronc') { const g = parts.torre3d?.part?.progress?.() || {};
        cfg = g.ending > 0 ? null : g.ready ? { text: 'Hold the light', walls: [0, 2, 3], from: 0, idle: 10, y: 1.75, hold: 1 } : { text: 'Hold your hand', walls: [0, 2, 3], from: 9.5, idle: 15, y: 1.75, hold: 1.5 }; }
    }
    hints.update(dt, time, { block: S.block, t: S.t || 0, hands: hs, downs, cfg }); }
  subs.update(dt);
  let p1 = performance.now(); guide.update(dt, { state: S, hands: hs, events: frameEvents, time, on: P.guide !== false, acta, pace: following() ? link.pace : (P.pace || 1), hold: !!parts.introtext && parts.introtext.state !== 'off' && S.block !== 'intro' && parts.introtext.leave < 0.15 }); prof.max('guide', performance.now() - p1);
  p1 = performance.now(); const ib = stepIntroBreak();
  for (const e of list) e.rig.visible = !e.torn;
  stepDusk(dt); stepBloom(dt);                                      // T-060: the wait's light out, the bloom per block
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
  const first = (e) => !EF || ENTRY.has(e.name);                    // T-065: entrance first — only the entrance's parts here, the rest in bgWarm
  const hideRest = () => { for (const e of list) if (!first(e)) e.rig.visible = false; };   // after a traverse that saved every visibility
  for (const e of list) e.part.object.visible = first(e);
  // 26-11 QA: with entranceFirst off, bgWarm() never runs — bake the bodies here (castells3d, pinya3d2, torre3d), before the states
  // loop, so the compiles below see their meshes (no stall when their block arrives); the load is longer by the bake time
  if (!EF) for (const e of list) {
    const baked = () => { const r = e.part.progress?.()?.readyMs ?? globalThis['__' + e.name]?.readyMs; return r == null || r > 0; };
    wi.params = e.params; wi.t = 30;
    for (let kb = 0; kb < 900 && !baked(); kb++) { try { e.part.update(1 / 60, wi); } catch { break; } await new Promise((r) => setTimeout(r, 0)); }
  }
  // two states: at rest (t 30) and breaking / arriving (t 52, the square's shatter at half): some parts switch what they draw
  // and once more without the square: its moon and sky light change every material's light set (a render object per light set)
  for (const [tw, sh, noSquare] of (EF ? [[30, 0, false], [52, 0.5, false]] : [[30, 0, false], [52, 0.5, false], [30, 0, true]])) {
    wi.t = tw;
    for (const e of list) { if (!first(e)) continue; wi.params = e.params; const s0 = e.params.shatter; if (e.name === 'plaza') e.params.shatter = sh; try { e.part.update(1 / 60, wi); } catch (err) { console.info(`res-obra3d: warm-up of "${e.name}" skipped (${err.message})`); } if (e.name === 'plaza') e.params.shatter = s0; }
    saved.length = 0;
    room.scene.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    room.overlay.traverse((o) => { saved.push(o, o.visible); o.visible = true; });
    hideRest();
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
    hideRest();
    room.setTiles({ on: true, mix: 0.5 });
    for (let k = 0; k < 2; k++) { room.render(1 / 60, () => {}); await new Promise((r) => requestAnimationFrame(r)); }
    room.setTiles({ on: false, mix: 0 });
    for (let i = 0; i < saved.length; i += 2) saved[i].visible = saved[i + 1];
    for (const m of thread.meshes) { room.overlay.remove(m); m.visible = false; }
  }
  lt('warm:sets');
  // the square's own environment (T-034): captured once, the square alone at rest (t 30), from the eye
  const pl = parts.plaza;
  if (pl?.part.captureEnv && !EF) {                                  // T-065: entrance first → bgWarm captures it, once the square is compiled
    for (const e of list) { e.rig.visible = e === pl; e.part.object.visible = e === pl; }
    wi.t = 30; wi.params = pl.params; pl.part.update(1 / 60, wi);
    try { pl.part.captureEnv(); } catch (err) { console.info('res-obra3d: square environment skipped (' + err.message + ')'); }
    for (const e of list) e.rig.visible = true;
  }
  for (const e of list) { e.part.object.visible = false; for (const l of e.lights) l.visible = false; steadyOff(e); }
}
lt('pre-warmup'); try { await warmUp(); } catch (err) { console.info('res-obra3d: warm-up skipped (' + err.message + ')'); }

window.__obra = { trailer: TRL, segments, load: LT, bg, dusk, bloom: bloomNow, tr, pal, score, tuned: () => tuned, lab: LAB, following, parts, room, guide, handStats, prof, fps: () => fps };   // for the lab's checks (and res-obra/autopilot.js) only
lt('loop'); vt.loop(frame, canvas);
const loopAt = performance.now();

// ------------------------------------------------------------------------------------------------ T-065: the background compiles
// `objs` compiled one by one (compileAsync(object, cam, room.scene): the object and its children, with the scene's lights), with the
// whole scene shown, frustum culling off and `setup()` applied for the synchronous part of the calls only (no frame sees it): after
// ~`budget` ms of calls the next frame is drawn first, so the entrance keeps its frames. Into the strip's format (T-057 prewarmRT), on a
// camera of its own (its own render list). Returns the longest synchronous step (ms).
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const drawable = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
// the drawables under `root` with no drawable above them (compileAsync takes an object's children too): each object compiled ONCE —
// compiling one again in a later frame, after its part changed its material, disposed a render object whose binding buffers a frame
// still used (WebGPU errors)
function tops(root) { const out = []; (function walk(o) { if (drawable(o)) { out.push(o); return; } for (const c of o.children) walk(c); })(root); return out; }
async function compileChunked(objs, cam, setup = null, budget = 8, tag = '') {
  const all = []; room.scene.traverse((o) => all.push(o));
  const vis = new Array(all.length), cull = new Array(all.length);
  let i = 0, worst = 0;
  while (i < objs.length) {
    const t0 = performance.now();
    for (let k = 0; k < all.length; k++) { const o = all[k]; vis[k] = o.visible; cull[k] = o.frustumCulled; o.visible = true; o.frustumCulled = false; }
    const rt0 = room.renderer.getRenderTarget(), prs = [];
    try {
      setup?.();
      if (P.prewarmRT !== false) room.renderer.setRenderTarget(room.strip);
      while (i < objs.length && performance.now() - t0 < budget) {
        try { prs.push(room.renderer.compileAsync(objs[i], cam, room.scene).catch(() => {})); } catch { /* the first real frame compiles */ }
        i++;
      }
    } finally {
      room.renderer.setRenderTarget(rt0);
      for (let k = 0; k < all.length; k++) { all[k].visible = vis[k]; all[k].frustumCulled = cull[k]; }
    }
    const dt0 = performance.now() - t0; worst = Math.max(worst, dt0); if (dt0 > 30) bg.slow.push([tag + ':compile', Math.round(dt0)]);
    await Promise.all(prs);                                          // one chunk's pipelines at a time: a backlog of GPU compiles held the frames back
    await nextFrame();
  }
  return worst;
}
// Entrance first: what warmUp() did for every part, done for the chapters while the wait plays — each part updated once (the square
// also breaking: it switches what it draws), its meshes compiled a few per frame, then the square's own environment. Then the start
// ring gets its real time back and a jump asked meanwhile is made.
async function bgWarm() {
  const t0 = performance.now(), cam = room.walls[0].camera.clone();
  const wi = { time: 0, t: 30, dt: 1 / 60, progress: 0.5, hands: [], downs: [], ups: [], params: null, state: S, events: [], arrive: 1, leave: 0, acta: score.acta() };
  let worst = 0;
  while (prewarm.busy) await nextFrame();
  prewarm.busy = true;                                               // the next-block pre-warm waits for this
  try {
    for (const e of list) {
      if (ENTRY.has(e.name)) continue;
      for (const [tw, sh] of [[30, 0]]) {                            // one state (at rest): see tops()
        if (e.state === 'off') {                                     // (a part already on screen — a sound piece far into its pass — is left alone)
          const u0 = performance.now(); wi.t = tw; wi.params = e.params; const s0 = e.params.shatter; if (e.name === 'plaza') e.params.shatter = sh;
          try { e.part.update(1 / 60, wi); } catch (err) { console.info(`res-obra3d: warm-up of "${e.name}" skipped (${err.message})`); }
          // 26-11 QA: castells3d, pinya3d2 and torre3d bake their bodies a few ms per update and only then make their meshes — let them
          // finish here (during the mosaic) so the compile below sees them, instead of a stall when the block arrives
          const baked = () => { const r = e.part.progress?.()?.readyMs ?? globalThis['__' + e.name]?.readyMs; return r == null || r > 0; };
          for (let kb = 0; kb < 900 && !baked(); kb++) { await nextFrame(); try { e.part.update(1 / 60, wi); } catch { break; } }
          if (e.name === 'plaza') e.params.shatter = s0;
          const du = performance.now() - u0; worst = Math.max(worst, du); if (du > 30) bg.slow.push([e.name + ':update', Math.round(du)]);
          await nextFrame();
        }
        const objs = tops(e.part.object);
        worst = Math.max(worst, await compileChunked(objs, cam, null, 8, e.name));
      }
    }
    // the square's own environment (T-034): captured once, the square alone at rest (t 30), from the eye, its lights as at load
    const pl = parts.plaza;
    if (pl?.part.captureEnv && pl.state === 'off') {
      const c0 = performance.now(), keep = list.map((e) => [e.rig.visible, e.part.object.visible]), lv = pl.lights.map((l) => l.visible);
      const steady = list.flatMap((e) => e.steady.map((l) => [l, l.intensity]));
      for (const e of list) { e.rig.visible = e === pl; e.part.object.visible = e === pl; }
      for (const l of pl.lights) l.visible = true;
      for (const [l] of steady) if (l.userData.hostIntensity != null) l.intensity = l.userData.hostIntensity;
      try { wi.t = 30; wi.params = pl.params; pl.part.update(1 / 60, wi); pl.part.captureEnv(); } catch (err) { console.info('res-obra3d: square environment skipped (' + err.message + ')'); }
      finally {
        list.forEach((e, k) => { e.rig.visible = keep[k][0]; e.part.object.visible = keep[k][1]; });
        pl.lights.forEach((l, k) => { l.visible = lv[k]; });
        for (const [l, v] of steady) l.intensity = v;
      }
      const dc = performance.now() - c0; worst = Math.max(worst, dc); if (dc > 30) bg.slow.push(['plaza:env', Math.round(dc)]);
    }
  } finally { prewarm.busy = false; }
  bg.worst = Math.round(worst);
  console.info(`res-obra3d: chapters compiled in the background, ${Math.round(performance.now() - t0)} ms (longest step ${bg.worst} ms)`);
}
function bgDone() {
  if (bg.ready) return;
  bg.ready = true; lt('ready');
  tune();                                                            // the start ring's real time, here and in the sound piece
  if (bg.jump) { const b = bg.jump; bg.jump = null; score.jump(b); }
}

// T-057 (warmSets): the light sets the load did not draw, compiled in the background while the wait plays (~2.5 s each on the M1 Max;
// the wait lasts ≥ 18 s). The chapters' set (no carrier lit) first, then the acta's, then the wait's alone. Each compile runs on a camera
// of its own (its own render list, so the frames drawn meanwhile do not change the lights it compiles with) into the strip's format; the
// scene is shown / the lights set only for the synchronous part of the call (no frame sees it). Pipelines and shaders are shared by
// every camera and target with the same format, so the walls' real frames find them built. T-065: after the chapters' background
// compile and ≥ 3 s of entrance. (Not chunked per object: compiling the live entrance's objects one by one made WebGPU errors —
// a binding buffer destroyed while a frame used it.)
async function warmSetsLater() {
  if (P.warmSets === false || room.backend !== 'webgpu') return;   // WebGL2: its compiles block the main thread (a 200 ms hitch in the wait): as before
  const t0 = performance.now(), cam = room.walls[0].camera.clone();
  const lit = (o) => o.isLight && !o.isDirectionalLight && !o.isHemisphereLight;
  const carriers = list.filter((e) => { let n = 0; e.part.object.traverse((o) => { if (lit(o) && o.layers.test(cam.layers)) n++; }); return n > 0; });
  const lightsOf = (e) => { const L = []; e.part.object.traverse((o) => { if (lit(o)) L.push(o); }); return L; };
  const full = (1 << carriers.length) - 1, order = [];
  for (let n = 0; n < carriers.length; n++) for (let m = 0; m < full; m++) if (popcount(m) === n) order.push(m);   // fewest lights first; all lit: done at load
  function popcount(m) { let c = 0; for (; m; m &= m - 1) c++; return c; }
  while (prewarm.busy) await sleep(100);
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
      await sleep(250);
    }
    lt('warm:setsLater');
    console.info(`res-obra3d: warmed ${order.length + 1} light sets (${carriers.map((e) => e.name).join(', ') || 'none'}), ${Math.round(performance.now() - t0)} ms in the background`);
  } finally { prewarm.busy = false; }
}
(async () => {
  if (EF) {
    await sleep(500);
    try { await bgWarm(); } catch (err) { console.info('res-obra3d: background warm-up skipped (' + err.message + ')'); } finally { bgDone(); }
  }
  const rest = 3000 - (performance.now() - loopAt); if (rest > 0) await sleep(rest);   // the light sets: after ≥ 3 s of entrance
  await warmSetsLater();
})().catch((err) => console.info('res-obra3d: light-set warm-up skipped (' + err.message + ')'));
