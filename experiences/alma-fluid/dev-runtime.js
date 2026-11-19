// A stand-in for /experiences/runtime.js, ONLY for testing and for opening the experience by hand without the
// engine (the tests serve it in place of the real runtime). Same shape as the real API:
//   connectExperience() → { canvas, scale, size, walls, toPx, closedLoop, params, on, touches, loop, sink, fit, standalone }
// Configure through the query string: ?walls=4&ww=200&wh=120&closed=1&params={"emitters":0}&raf=1
//   raf=1 runs the loop on requestAnimationFrame and turns the pointer into a touch (manual use);
//   without it a test drives the frames: window.__vtDev.frame(dt), .emit('touch', {...}), .setParams({...}).
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

export async function connectExperience() {
  const manifest = await (await fetch(new URL('./manifest.json', location.href))).json();
  const n = num('walls', 4), ww = num('ww', 200), wh = num('wh', 120);
  const scale = num('scale', 1);
  const walls = Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}`, name: `Wall ${i + 1}`, rect: { x: i * ww, y: 0, w: ww, h: wh } }));
  const params = {};
  for (const p of manifest.params) params[p.key] = p.default;
  Object.assign(params, q.has('params') ? JSON.parse(q.get('params')) : {});

  const handlers = { params: [], touch: [] };
  const down = new Map();
  let frameFn = null;
  const vt = {
    canvas: { width: n * ww / scale, height: wh / scale },
    scale,
    size: { width: n * ww, height: wh },
    walls,
    toPx: (id, xm, ym) => { const w = walls.find((x) => x.id === id) || walls[0]; return [w.rect.x + xm, w.rect.y + ym]; },
    closedLoop: q.get('closed') === '1',
    params,
    on: (name, fn) => { (handlers[name] ||= []).push(fn); },
    touches: () => [...down.values()],
    loop: (fn, gl) => { frameFn = fn; vt.gl = gl; if (q.get('raf') === '1') { let last = performance.now(); const tick = (t) => { fn((t - last) / 1000); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } },
    sink: 'browser',
    fit: 'fit',
    standalone: true,
    // test and manual helpers
    emit(name, payload) {
      if (name === 'touch') { if (payload.type === 'up') down.delete(payload.id); else down.set(payload.id, { id: payload.id, wallId: payload.wallId, x: payload.x, y: payload.y, size: payload.size }); }
      for (const fn of handlers[name] || []) fn(payload);
    },
    setParams(p) { Object.assign(params, p); for (const fn of handlers.params) fn(params); },
    frame(dt = 1 / 60, count = 1) { for (let i = 0; i < count; i++) frameFn(dt); },
    get ready() { return !!frameFn; },
  };
  window.__vtDev = vt;

  if (q.get('raf') === '1') {
    const el = document.getElementById('c');
    const wallAt = (x) => (walls.find((w) => x >= w.rect.x && x < w.rect.x + w.rect.w) || walls[0]).id;
    const pos = (e) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * vt.size.width, (e.clientY - r.top) / r.height * vt.size.height]; };
    let last = null;
    el.addEventListener('pointerdown', (e) => { const [x, y] = pos(e); last = [x, y, performance.now()]; vt.emit('touch', { type: 'down', id: 1, wallId: wallAt(x), x, y, vx: 0, vy: 0, size: 30 }); });
    el.addEventListener('pointermove', (e) => { if (!last) return; const [x, y] = pos(e); const now = performance.now(); const dt = Math.max(0.001, (now - last[2]) / 1000); vt.emit('touch', { type: 'move', id: 1, wallId: wallAt(x), x, y, vx: (x - last[0]) / dt, vy: (y - last[1]) / dt, size: 30 }); last = [x, y, now]; });
    window.addEventListener('pointerup', () => { if (last) vt.emit('touch', { type: 'up', id: 1, wallId: walls[0].id, x: last[0], y: last[1], vx: 0, vy: 0, size: 30 }); last = null; });
  }
  return vt;
}
