// A stand-in for /experiences/runtime.js, ONLY for tests/reel.test.mjs (served in its place): the Reel page in a hidden
// Electron window with a room, hands and clips the test controls. Same shape as the real API (connectExperience → canvas,
// size, walls with metres / pxPerM / masks, closedLoop, params, on, hands, loop, media), plus helpers:
//   window.__vtDev.frame(dt, count)   run frames (a hidden window paints none: the test drives them)
//   window.__vtDev.emit('touch', {type: 'down' | 'move' | 'up', id, wallId, x, y})   hands (exactly these: no playback)
//   window.__vtDev.media.fire(type, e)   a media event ('started' / 'ended' / 'error' / 'slots')
//   window.__vtDev.media.calls        what the page asked: ['play', clipId, opt] · ['stop', opt] · ['preload', id]
//   window.__vtDev.setParams({...})
// Query: ?room=<json {canvas: {width, height}, walls: [{id, name, rect, width, height, pxPerM, masks}]}>&closed=1
//        &params=<json>&slots=<json {reel, projects}>&play=ok|reject|auto   (auto: 'started' follows each play at once)
const q = new URLSearchParams(location.search);
const json = (k, d) => { try { return q.has(k) ? JSON.parse(q.get(k)) : d; } catch { return d; } };

export async function connectExperience() {
  const manifest = await (await fetch(new URL('./manifest.json', location.href))).json();
  const room = json('room', null);
  const walls = room.walls.map((w) => ({ masks: [], ...w }));
  const params = {};
  for (const p of manifest.params) params[p.key] = p.default;
  Object.assign(params, json('params', {}));
  const slots = json('slots', { reel: null, projects: [] });

  const handlers = {};
  const on = (name, fn) => { (handlers[name] ||= new Set()).add(fn); return () => handlers[name].delete(fn); };
  const fire = (name, e) => { for (const fn of handlers[name] || []) fn(e); };
  const down = new Map();
  let frameFn = null, seq = 0;
  const playMode = q.get('play') || 'ok';

  const mediaSubs = {};
  const media = {
    available: false, calls: [],
    slot: (k) => (k in slots ? slots[k] : null),
    slots: () => slots,
    on(type, fn) { (mediaSubs[type] ||= new Set()).add(fn); return () => mediaSubs[type].delete(fn); },
    async play(ref, opt = {}) {
      const id = typeof ref === 'object' ? ref.id : ref;
      media.calls.push(['play', id, opt]);
      if (playMode === 'reject') throw new Error('the file is missing');
      const playId = `p${++seq}`;
      if (playMode === 'auto') setTimeout(() => media.fire('started', { playId, clipId: id }), 0);
      return { playId, startAt: null };
    },
    async stop(opt = {}) { media.calls.push(['stop', opt]); return {}; },
    async preload(ref) { media.calls.push(['preload', typeof ref === 'object' ? ref.id : ref]); return {}; },
    state: () => ({ playing: false, held: false, playId: null, clipId: null, position: 0, duration: 0 }),
    fire(type, e) {
      if (type === 'slots') Object.assign(slots, e);
      for (const fn of mediaSubs[type] || []) fn(type === 'slots' ? slots : e);
    },
    get lastPlayId() { return `p${seq}`; },
  };

  const vt = {
    canvas: { ...room.canvas }, scale: 1, size: { ...room.canvas }, walls, closedLoop: q.get('closed') === '1',
    params, sink: 'browser', fit: 'fit', fps: 60, standalone: true, id: 'reel', media,
    on,
    toPx: (id, xm, ym) => { const w = walls.find((x) => x.id === id) || walls[0]; return [w.rect.x + (xm / w.width) * w.rect.w, w.rect.y + (1 - ym / w.height) * w.rect.h]; },
    touches: () => [...down.values()],
    hands: () => [...down.values()].map((t) => ({ ...t })),
    loop: (fn, src) => { frameFn = fn; vt.gl = src; },
    frame(dt = 1 / 60, count = 1) { for (let i = 0; i < count; i++) frameFn(dt); },
    emit(name, e) {
      if (name === 'touch') {
        if (e.type === 'up') down.delete(e.id);
        else down.set(e.id, { id: e.id, stroke: e.stroke ?? e.id, wallId: e.wallId, x: e.x, y: e.y, vx: 0, vy: 0, size: e.size || 20, ended: !!e.ended });
      }
      fire(name, e);
    },
    setParams(p) { Object.assign(params, p); fire('params', params); },
    get ready() { return !!frameFn; },
  };
  window.__vtDev = vt;
  return vt;
}
