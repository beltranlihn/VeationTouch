// LAB ONLY — the review page's 3D layer (review.html). While the score is in the Intro, the 3D intro (La plaça: plaza, atmos,
// castell, introtext — ../ressonancia/scenes3d/parts) plays on its own canvas, on the score's clock, over the 2D work; it fades in
// as the intro starts and out into Brasa. Everything else is the 2D work as it is (res-obra). It reuses the work's own `vt` (same
// hands, same walls) and the score that the sound piece leads, so the picture, the sound and the virtual audience stay together.
// Not part of the piece: once every chapter is 3D, the work becomes one 3D page.
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../ressonancia/scenes3d/room3d.js';

const q = new URLSearchParams(location.search);
const QUALITY = q.get('q3') || 'medium';                       // the room: high · a laptop: medium (default here) or low
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__vtDev || !window.__obra) await wait(100);
const vt = window.__vtDev, { score } = window.__obra, S = score.state;

const c3 = document.createElement('canvas'); c3.id = 'c3';
c3.width = vt.size.width; c3.height = vt.size.height;
Object.assign(c3.style, { position: 'fixed', left: '0', top: '0', width: '10px', height: '10px', opacity: '0', pointerEvents: 'none' });
document.body.appendChild(c3);
const QS = { low: 0.6, medium: 0.8, high: 1 };
const room = await createRoom3D(vt, c3, { forceWebGL: q.get('renderer') === 'webgl2', bloom: { strength: 0.6 }, renderScale: QS[QUALITY] ?? 0.8, samples: QUALITY === 'high' ? 4 : 0 });
const parts = [], byName = {};
for (const name of ['plaza', 'atmos', 'castell', 'introtext']) {
  try {
    const params = {};
    const defs = await fetch(new URL(`../res-3d-study/parts/${name}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const d of defs) params[d.key] = d.default;
    if (name === 'atmos') params.demoLamps = false;
    if (name === 'plaza') params.glow = 0.3;
    if (name === 'castell') params.density = ({ low: 0.4, medium: 0.6, high: 1 })[QUALITY] ?? 0.6;
    const part = (await import(`../ressonancia/scenes3d/parts/${name}.js`)).create({ THREE, TSL, room, params, parts: byName });
    room.scene.add(part.object); parts.push({ name, part, params }); byName[name] = part;
  } catch (e) { console.warn(`review3d: part "${name}" is not ready (${e.message}); skipped`); }
}

// the 3D stream joins every row of the view, over the 2D one
const stream = c3.captureStream(30);
const overlays = [];
function attach() {
  for (const row of document.querySelectorAll('#view .row')) {
    if (row.querySelector('video.v3')) continue;
    const base = row.querySelector('video');
    const v = document.createElement('video'); v.className = 'v3'; v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = stream;
    v.style.position = 'absolute'; v.style.top = '0'; v.style.opacity = '0';
    base.after(v); v.play().catch(() => {}); overlays.push({ v, base });
  }
}

const known = new Set(), downs = [], ups = [], input = { time: 0, t: 0, dt: 0, progress: 0, hands: [], downs, ups, params: null };
let last = performance.now(), time = 0, t = 0, alpha = 0;
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
  attach();
  const intro = S.block === 'intro';
  if (intro) t = S.t; else if (alpha > 0.001) t += dt;                       // after the intro the 3D keeps time while it fades
  alpha += ((intro ? 1 : 0) - alpha) * (1 - Math.exp(-dt * (intro ? 2.2 : 2.6)));   // out in ~1.5 s: the intro's title must not linger over Brasa's card
  if (alpha > 0.003 || intro) {
    const hs = room.hands(); downs.length = 0; ups.length = 0;
    const cur = new Set(hs.map((h) => h.stroke));
    for (const h of hs) if (!known.has(h.stroke)) downs.push(h);
    for (const s of known) if (!cur.has(s)) ups.push({ stroke: s });
    known.clear(); for (const s of cur) known.add(s);
    Object.assign(input, { time, t, dt, hands: hs });
    for (const p of parts) { input.params = p.params; p.part.update(dt, input); }
    room.render(dt);
  }
  for (const o of overlays) { o.v.style.left = o.base.style.left; o.v.style.height = o.base.style.height; o.v.style.width = o.base.style.width; o.v.style.opacity = String(alpha); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__review3d = { room, parts, alpha: () => alpha, t: () => t };   // for the lab's checks only
