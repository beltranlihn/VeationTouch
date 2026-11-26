// Ressonància — brasa v2 study: the new correfoc level (../brasa2.js) alone on the room's strip (7196×912, the 4 walls and their
// cameras), mounted the way the host mounts a part: update(dt, input) with PARTS.md's hands { stroke, wall, y, s, u }.
//   A hand (a click on the strip) calls a correfoc there; held, it dances; let go, it runs and feeds the fires it passes. A sliding
//   hand trails fire. In the one-wall view (F) the pointer is the hand (Alt+drag pans). The opening plays from the start.
//   Keys: 1–4 feed that fire · N a correfoc on the wall on screen · K the boom (all fires to 0.8) · Z restart (the opening again)
//   URL: ?lv=0.5 (all fires at a level, no opening) · ?lv=0,0.3,0.6,1 (each) · ?intro=0 · ?t=<s> (start the block's clock there)
//   window.__b2 = { part, input }  for the lab's checks
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../../../room3d.js';
import { createBrasa2 } from '../brasa2.js';

const Q = new URLSearchParams(location.search);
const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const room = await createRoom3D(vt, canvas, { forceWebGL: Q.get('gl') === '1', eyeHeight: 1.6, bloom: { strength: 0.35 }, exposure: 1 });
room.setBackground?.('brasa'); room.setEnvironment?.('brasa');
const params = { introOn: Q.get('intro') !== '0' && !Q.has('lv') };
const part = createBrasa2({ THREE, TSL, room, params });
room.scene.add(part.object);
const walls = room.walls, cum = []; let PER = 0; for (const w of walls) { cum.push(PER); PER += w.width; }
if (Q.has('lv')) { const v = Q.get('lv').split(',').map(Number); for (let i = 0; i < 4; i++) part.debug.setLevel(i, v[Math.min(i, v.length - 1)]); }

// hands: the lab's (strip view) or the pointer (one wall large) → PARTS.md's shape
let ptr = null, ptrN = 0;
addEventListener('pointerdown', (e) => {
  if ((window.__labRoom?.zoom | 0) === 0 || e.button !== 0 || e.altKey || e.shiftKey) return;
  if (e.target.closest?.('.lk-help,.lk-params,.lk-vol')) return;
  if (window.__labRoom) window.__labRoom.drag = null;
  ptr = { id: 'ptr' + ptrN++, x: e.clientX, y: e.clientY };
}, true);
addEventListener('pointermove', (e) => { if (ptr) { ptr.x = e.clientX; ptr.y = e.clientY; } }, true);
addEventListener('pointerup', () => { ptr = null; }, true); addEventListener('pointercancel', () => { ptr = null; }, true);
function handAt(id, px, py) {
  const wi = vt.walls.findIndex((w) => px >= w.rect.x && px < w.rect.x + w.rect.w); if (wi < 0) return null;
  const w = vt.walls[wi], u = (px - w.rect.x) / w.rect.w, y = Math.max(0.05, (1 - (py - w.rect.y) / w.rect.h) * walls[wi].height);
  return { stroke: id, wall: wi, u, y, s: cum[wi] + u * walls[wi].width };
}
function gatherHands() {
  const out = [];
  if ((window.__labRoom?.zoom | 0) === 0) for (const h of vt.hands()) { const o = handAt(h.stroke, h.x, h.y); if (o) out.push(o); }
  else if (ptr) {
    const r = canvas.getBoundingClientRect();
    if (r.width) { const o = handAt(ptr.id, ((ptr.x - r.left) / r.width) * vt.size.width, ((ptr.y - r.top) / r.height) * vt.size.height); if (o) out.push(o); }
  }
  return out;
}
addEventListener('keydown', (e) => {
  const k = '1234'.indexOf(e.key); if (k >= 0) part.debug.feed(k);
  if (e.key === 'n' || e.key === 'N') { const z = window.__labRoom?.zoom | 0, wi = z > 0 ? z - 1 : Math.floor(Math.random() * walls.length); part.debug.devil(cum[wi] + (0.15 + 0.7 * Math.random()) * walls[wi].width); }
  if (e.key === 'k' || e.key === 'K') for (let i = 0; i < 4; i++) part.debug.setLevel(i, 0.8);
  if (e.key === 'z' || e.key === 'Z') { part.reset(); t0 = time; }
});

let time = 0, t0 = -(Number(Q.get('t')) || 0);
const input = { time: 0, t: 0, arrive: 1, leave: 0, hands: [], state: { block: 'brasa' } };
vt.loop((dt) => {
  dt = Math.min(dt, 0.05); time += dt;
  input.time = time; input.t = time - t0; input.state.t = time - t0; input.hands = gatherHands();
  part.update(dt, input);
  for (const ev of part.events) if (Q.has('log')) console.log('[brasa2]', ev, JSON.stringify(part.progress()));
  room.render(dt);
}, canvas);
window.__b2 = { part, input, room };
