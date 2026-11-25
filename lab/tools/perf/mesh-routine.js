window.__runAlbum = async (dir, tag) => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = window.__prog = { dir, done: [], err: null, state: 'loading' };
  try {
    for (let i = 0; i < 150 && !(window.__obra && window.__obra.bg && window.__obra.bg.ready); i++) await w(1000);
    await w(12000);
    const room = window.__obra.room, list = [];
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    room.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite) || !shown(o)) return;
      const g = o.geometry, idx = g?.index ? g.index.count : (g?.attributes?.position?.count || 0);
      const inst = o.count ?? g?.instanceCount ?? 1;
      const m = o.material || {};
      list.push({ name: (o.name || '') + ' <' + (o.parent?.name || '') + '>', type: o.type, verts: idx, inst: inst === Infinity ? -1 : inst, work: idx * (inst > 0 && inst !== Infinity ? inst : 1), cull: o.frustumCulled, reactive: o.layers.isEnabled(30), mat: m.type, transp: !!m.transparent, blend: m.blending });
    });
    list.sort((a, b) => b.work - a.work);
    P.done.push({ file: tag, fps: 0, top: list.slice(0, 12), n: list.length });
    P.state = 'done';
  } catch (e) { P.err = String(e && e.stack || e); P.state = 'error'; }
};
