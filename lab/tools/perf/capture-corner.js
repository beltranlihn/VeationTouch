window.__runAlbum = async (dir, tag) => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = window.__prog = { dir, done: [], err: null, state: 'loading' };
  try {
    for (let i = 0; i < 150 && !(window.__obra && window.__obra.bg && window.__obra.bg.ready); i++) await w(1000);
    await w(6000);
    const src = document.getElementById('c');
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = src.captureStream(30); await v.play();
    const X0 = 1662, WW = 500;   // the P4 | P1 corner
    const grab = async (file, label) => {
      await w(150);
      const k = src.width / 7196, c = document.createElement('canvas'); c.width = 1600; c.height = Math.round(1600 * src.height / (WW * k)) + 26;
      const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(v, X0 * k, 0, WW * k, src.height, 0, 26, 1600, c.height - 26);
      g.fillStyle = '#B8B8B8'; g.font = '14px Segoe UI, sans-serif'; g.fillText(label, 8, 18);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await fetch('/__save?f=' + encodeURIComponent(dir + '/' + file), { method: 'POST', body: blob });
      P.done.push({ file, fps: Math.round(window.__obra.fps()) });
    };
    await grab('1-reposo.png', `Esquina P4 | P1 · ${tag}`);
    { const c = document.createElement('canvas'); c.width = 1600; c.height = 800; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(v, X0 + 250, 330, 800, 400, 0, 0, 1600, 800);
      const b = await new Promise((r) => c.toBlob(r, 'image/png')); await fetch('/__save?f=' + encodeURIComponent(dir + '/0-detalle.png'), { method: 'POST', body: b }); }
    const b = src.getBoundingClientRect(), sx = (X0 + 380) / 7196, ty = 1 - 1.3 / 3.75;
    const ev = (x) => window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: b.left + b.width * x, clientY: b.top + b.height * ty, bubbles: true }));
    ev(sx); await w(350);
    await grab('2-mano-llega.png', `P1 · la mano llega (0,35 s) · ${tag}`);
    for (let i = 0; i < 12; i++) { ev(sx + (i % 2) * 0.00005); await w(200); }
    await grab('3-mano-quieta.png', `P1 · la mano quieta 2,5 s · ${tag}`);
    P.state = 'done';
  } catch (e) { P.err = String(e && e.stack || e); P.state = 'error'; }
};
