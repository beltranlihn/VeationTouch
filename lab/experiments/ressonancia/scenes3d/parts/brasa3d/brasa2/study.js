// Ressonància — brasa v2 study: the new correfoc level (../brasa2.js) alone on the room's strip (7196×912, the 4 walls and their
// cameras), mounted the way the host mounts a part: update(dt, input) with PARTS.md's hands { stroke, wall, y, s, u }.
//   A hand (a click on the strip) calls a correfoc there; held, it dances; let go, it runs and feeds the fires it passes. A sliding
//   hand trails fire. In the one-wall view (F) the pointer is the hand (Alt+drag pans). The opening plays from the start.
//   Keys: 1–4 feed that fire · N a correfoc on the wall on screen · K the boom (all fires to 0.8) · Z restart (the opening again)
//         X leave as the host does (the exit to dust) · E enter again (the entry from the dust) · T the dust's tint → cold
//   URL: ?lv=0.5 (all fires at a level, no opening) · ?lv=0,0.3,0.6,1 (each) · ?intro=0 · ?t=<s> (start the block's clock there)
//   window.__b2 = { part, input }  for the lab's checks
import { connectExperience } from '/experiences/runtime.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createRoom3D } from '../../../room3d.js';
import { createBrasa2 } from '../brasa2.js';
import { createBrasaSound } from '../brasa2-sound.js';

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
  // the host's transitions, simulated: X leave (1.5 s ramp; the dust lingers), E enter again (the entry from the dust), T the tint → cold
  if (e.key === 'x' || e.key === 'X') leaving = true;
  if (e.key === 'e' || e.key === 'E') { leaving = false; input.leave = 0; part.reset(); t0 = time; }
  if (e.key === 't' || e.key === 'T') params.tint = params.tint ? null : [0.45, 0.66, 1.0];
});

// the fire's sound (../brasa2-sound.js) on a stereo stand-in of the work's audio host (P4 left … P3 right, like the lab's 4.1 preview);
// it starts on the first click (the browser wants a gesture). ?mute: none.
let snd = null;
function startSound() {
  if (snd || Q.has('mute')) return;
  const ctx = new AudioContext({ sampleRate: 48000 }), master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const wallInput = (id, u = 0.5) => {
    const wi = Math.max(0, walls.findIndex((w) => w.id === id)), g = ctx.createGain(), p = ctx.createStereoPanner();
    const pan = (uu) => Math.max(-1, Math.min(1, ((cum[wi] + uu * walls[wi].width) / PER) * 2 - 1));
    p.pan.value = pan(u); g.connect(p); p.connect(master);
    return { node: g, setPosition(uu) { p.pan.setTargetAtTime(pan(uu), ctx.currentTime, 0.05); }, disconnect() { try { g.disconnect(); p.disconnect(); } catch { /* gone */ } } };
  };
  const subF = ctx.createBiquadFilter(); subF.type = 'lowpass'; subF.frequency.value = 120; subF.connect(master);
  snd = createBrasaSound({ ctx, walls: walls.map((w) => ({ id: w.id })), wallInput, roomInput: () => master, subInput: () => subF });
  // (lab) a peak meter on the output: window.__b2.peak() → dBFS of the loudest sample since the last call
  const an = ctx.createAnalyser(); an.fftSize = 2048; master.connect(an); const buf = new Float32Array(an.fftSize); let pk = 0;
  setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) pk = Math.max(pk, Math.abs(v)); }, 20);
  window.__b2.snd = snd; window.__b2.ctx = ctx; window.__b2.peak = () => { const d = 20 * Math.log10(Math.max(pk, 1e-6)); pk = 0; return +d.toFixed(1); };
}
addEventListener('pointerdown', startSound, true); addEventListener('keydown', startSound, true);

let time = 0, t0 = -(Number(Q.get('t')) || 0), leaving = Q.has('leave');
const input = { time: 0, t: 0, arrive: 1, leave: 0, hands: [], state: { block: 'brasa' } };
vt.loop((dt) => {
  dt = Math.min(dt, 0.05); time += dt;
  input.time = time; input.t = time - t0; input.state.t = time - t0; input.hands = gatherHands();
  if (leaving) input.leave = Math.min(1, input.leave + dt / 1.5);
  part.update(dt, input);
  snd?.update(dt, part.sound());
  for (const ev of part.events) if (Q.has('log')) console.log('[brasa2]', ev, JSON.stringify(part.progress()));
  room.render(dt);
}, canvas);
window.__b2 = { part, input, room };
