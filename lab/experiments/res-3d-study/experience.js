// Ressonància — 3D study host: one part (../ressonancia/scenes3d/parts/<name>.js, contract in scenes3d/PARTS.md) alone on the room.
//   ?part=<name>    which part (default: plaza)
// The part's own parameters come from ./parts/<name>.json and join the panel (P). `t` is the sequence clock: it runs from the
// "Study: sequence time" parameter when "Run the clock" is on, or stays where the parameter puts it.
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../ressonancia/scenes3d/room3d.js';
import { setSink } from '../ressonancia/scenes3d/emit.js';

const name = (new URLSearchParams(location.search).get('part') || 'plaza').replace(/[^a-z0-9_-]/gi, '');
const vt = await connectExperience();
setSink(vt);                                                       // the parts post impacts to the sound only from the room instance, never from the viewer
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const extra = await fetch(new URL(`./parts/${name}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
const P = { progress: 0, t: 0, run: true, renderer: 'auto', eye: 1.6, bloom: 0.6, exposure: 1, ...Object.fromEntries(extra.map((d) => [d.key, d.default])), ...vt.params };
try { const q = new URLSearchParams(location.search).get('params'); if (q) Object.assign(P, JSON.parse(q)); } catch { /* ignore */ }
if (extra.length && window.__labRoom?.stage) {   // lab only: the part's parameters join the panel
  const defs = [...(await fetch(new URL('./manifest.json', import.meta.url)).then((r) => r.json())).params, ...extra];
  window.__labRoom.stage.params(defs, P, () => { onParams(); });
}
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', eyeHeight: P.eye, bloom: { strength: P.bloom }, exposure: P.exposure });
const mod = await import(`../ressonancia/scenes3d/parts/${name}.js`);
const part = mod.create({ THREE, TSL, room, params: P });
room.scene.add(part.object);
let seqT = P.t, lastT = P.t;
function onParams() { room.setEye(P.eye); room.setBloom({ strength: P.bloom }); room.renderer.toneMappingExposure = P.exposure; if (P.t !== lastT) { lastT = P.t; seqT = P.t; } part.setParams?.(P); }
vt.on('params', (p) => { Object.assign(P, p); onParams(); });

const known = new Set(), downs = [], ups = [], input = { time: 0, t: 0, dt: 0, progress: 0, hands: [], downs, ups, params: P };
let time = 0, frames = 0, f0 = performance.now(), fps = 0;
vt.loop((dt) => {
  time += dt; if (P.run) seqT += dt;
  const hs = room.hands(); downs.length = 0; ups.length = 0;
  const now = new Set(hs.map((h) => h.stroke));
  for (const h of hs) if (!known.has(h.stroke)) downs.push(h);
  for (const s of known) if (!now.has(s)) ups.push({ stroke: s });
  known.clear(); for (const s of now) known.add(s);
  Object.assign(input, { time, t: seqT, dt, progress: Math.min(1, Math.max(0, P.progress)), hands: hs });
  part.update(dt, input);
  room.render(dt);
  frames++; const n = performance.now(); if (n - f0 > 1000) { fps = (frames * 1000) / (n - f0); frames = 0; f0 = n; }
}, canvas);
window.__study3d = { room, part, P, fps: () => fps, seq: () => seqT };   // for the lab's checks only
