// Projection output: drawn in OUTPUT-CANVAS pixels (e.g. 3840×2400), scaled to the window.
// Modes: off (black) · identify (walls, grid, ids — checks the pixel layout) · debug (touches).
// While a calibration runs, its targets are drawn on top whatever the mode.

import { store, on, connect } from './conn.js';

const c = document.getElementById('c');
const g = c.getContext('2d');
const AMBER = '#E5B567', CYAN = '#4FC3E8', GREEN = '#7FC4A2';
let pulse = 0;

function resize() {
  const dpr = devicePixelRatio || 1;
  c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize);
resize();

function frame(t) {
  pulse = t / 1000;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const S = store.state;
  if (!S) return;
  const P = S.profile;
  const mode = S.projection?.mode || 'off';
  const calib = store.status?.calib;
  if (mode === 'off' && !calib) return;
  // canvas pixels → window: stretch to fill (the window IS the output canvas)
  g.setTransform(c.width / P.canvas.width, 0, 0, c.height / P.canvas.height, 0, 0);

  for (const w of P.walls) {
    const r = w.pixelRect;
    const X = (x) => r.x + (x / w.width) * r.w;
    const Y = (y) => r.y + (1 - y / w.height) * r.h;
    const pxPerM = r.h / w.height;

    if (mode === 'identify') {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      for (let x = 0.5; x < w.width; x += 0.5) line(X(x), r.y, X(x), r.y + r.h);
      for (let y = 0.5; y < w.height; y += 0.5) line(r.x, Y(y), r.x + r.w, Y(y));
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      g.fillStyle = '#fff';
      g.font = `600 ${Math.round(pxPerM * 0.4)}px Geist, system-ui`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(w.id, r.x + r.w / 2, r.y + r.h / 2 - pxPerM * 0.25);
      g.font = `500 ${Math.round(pxPerM * 0.14)}px Geist, system-ui`;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(`${w.name} · ${w.width} × ${w.height} m · ${r.w}×${r.h} px`, r.x + r.w / 2, r.y + r.h / 2 + pxPerM * 0.2);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      for (const z of P.zones.filter((z) => z.wallId === w.id)) {
        g.strokeStyle = AMBER; g.lineWidth = 3;
        g.strokeRect(X(Math.min(z.rect.x0, z.rect.x1)), Y(Math.max(z.rect.y0, z.rect.y1)), Math.abs(z.rect.x1 - z.rect.x0) * (r.w / w.width), Math.abs(z.rect.y1 - z.rect.y0) * pxPerM);
      }
    }

    if (mode === 'debug' || mode === 'identify') {
      for (const [id, x, y, size, coast] of store.live?.walls?.[w.id] || []) {
        const rad = Math.max(0.05, size / 2 + 0.02) * pxPerM;
        g.fillStyle = coast ? 'rgba(79,195,232,0.25)' : 'rgba(79,195,232,0.55)';
        g.strokeStyle = CYAN; g.lineWidth = 4;
        g.beginPath(); g.arc(X(x), Y(y), rad, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.font = `600 ${Math.round(pxPerM * 0.07)}px Geist, system-ui`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(id), X(x), Y(y));
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      }
    }

    if (calib && calib.wallId === w.id) {
      calib.targets.forEach((t, k) => {
        const cur = k === calib.index && calib.phase !== 'done';
        const done = t.captured.length > 0;
        const x = X(t.x), y = Y(t.y);
        if (cur) {
          const R = pxPerM * 0.14;
          const breathe = 1 + 0.08 * Math.sin(pulse * 4);
          g.strokeStyle = calib.phase === 'release' ? GREEN : AMBER;
          g.lineWidth = 6;
          g.beginPath(); g.arc(x, y, R * breathe, 0, Math.PI * 2); g.stroke();
          g.lineWidth = 3;
          line(x - R * 1.8, y, x - R * 0.4, y); line(x + R * 0.4, y, x + R * 1.8, y);
          line(x, y - R * 1.8, x, y - R * 0.4); line(x, y + R * 0.4, x, y + R * 1.8);
          const p = calib.phase === 'release' ? 1 : calib.progress;
          if (p > 0) {
            g.lineWidth = 12;
            g.beginPath(); g.arc(x, y, R * 1.35, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
          }
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.font = `500 ${Math.round(pxPerM * 0.075)}px Geist, system-ui`;
          g.textAlign = 'center';
          g.fillText(calib.phase === 'release' ? 'Release' : 'Touch and hold', x, y + R * 2.4);
          g.textAlign = 'left';
        } else {
          g.strokeStyle = done ? GREEN : 'rgba(255,255,255,0.35)';
          g.lineWidth = 3;
          const R = pxPerM * 0.045;
          g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
        }
      });
    }
  }
}

function line(x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

on('state', () => {});
connect();
