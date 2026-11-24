// Ressonància — the Intro in 3D (La plaça), 70 s, assembled from parts (../ressonancia/scenes3d/parts, contract in PARTS.md):
//   plaza (the square round the room) · atmos (dust, haze, the line of light) · castell (four towers of light) · introtext (the words).
// One clock, `t`, drives them all; it loops every 80 s in the lab (10 s of dark between passes). A part that fails to load is skipped
// with a warning: the others play.
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../ressonancia/scenes3d/room3d.js';

const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const P = { t: 0, loop: true, renderer: 'auto', bloom: 0.6, exposure: 1, ...vt.params };
const QS = { low: 0.6, medium: 0.8, high: 1 };
const room = await createRoom3D(vt, canvas, { forceWebGL: P.renderer === 'webgl2', bloom: { strength: P.bloom }, exposure: P.exposure, renderScale: QS[P.quality] ?? 0.8, samples: P.quality === 'high' ? 4 : 0 });
const parts = [], byName = {};
const only = new URLSearchParams(location.search).get('parts');   // lab: ?parts=plaza,atmos loads only those (to measure)
for (const name of (only ? only.split(',') : ['plaza', 'atmos', 'castell', 'introtext'])) {
  try {
    const params = {};
    const defs = await fetch(new URL(`../res-3d-study/parts/${name}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const d of defs) params[d.key] = d.default;
    if (name === 'atmos') params.demoLamps = false;           // the square's own lamps light the dust
    if (name === 'plaza') params.glow = 0.3;                  // atmos draws the lamps' glow in the air too: no doubled halos
    if (name === 'castell') params.density = ({ low: 0.4, medium: 0.6, high: 1 })[P.quality] ?? 1;   // the room (RTX 6000 Ada): all the particles; a laptop: fewer
    try { const o = JSON.parse(new URLSearchParams(location.search).get('partParams') || '{}')[name]; if (o) Object.assign(params, o); } catch { /* lab: per-part overrides */ }
    const part = (await import(`../ressonancia/scenes3d/parts/${name}.js`)).create({ THREE, TSL, room, params, parts: byName });
    room.scene.add(part.object); parts.push({ name, part, params }); byName[name] = part;
  } catch (e) { console.warn(`res-intro3d: part "${name}" is not ready (${e.message}); skipped`); }
}
let t = P.t, lastStart = P.t;
vt.on('params', (p) => { Object.assign(P, p); room.setBloom({ strength: P.bloom }); room.renderer.toneMappingExposure = P.exposure; if (P.t !== lastStart) { lastStart = P.t; t = P.t; } });
const known = new Set(), downs = [], ups = [], input = { time: 0, t: 0, dt: 0, progress: 0, hands: [], downs, ups, params: P };
let time = 0, frames = 0, f0 = performance.now(), fps = 0;
vt.loop((dt) => {
  time += dt; t += dt; if (P.loop && t > 80) t = 0;
  const hs = room.hands(); downs.length = 0; ups.length = 0;
  const now = new Set(hs.map((h) => h.stroke));
  for (const h of hs) if (!known.has(h.stroke)) downs.push(h);
  for (const s of known) if (!now.has(s)) ups.push({ stroke: s });
  known.clear(); for (const s of now) known.add(s);
  Object.assign(input, { time, t, dt, hands: hs });
  for (const p of parts) { input.params = p.params; p.part.update(dt, input); }
  room.render(dt);
  frames++; const n = performance.now(); if (n - f0 > 1000) { fps = (frames * 1000) / (n - f0); frames = 0; f0 = n; }
}, canvas);
window.__intro3d = { room, parts, fps: () => fps, t: () => t };   // for the lab's checks only
