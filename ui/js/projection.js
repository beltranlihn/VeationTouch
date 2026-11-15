// Projection output: drawn in OUTPUT-CANVAS pixels (e.g. 3840×2400), scaled to the window.
// Every wall is drawn THROUGH ITS MAPPING (rect or corner pin), so what the operator sees on the
// physical wall is exactly where touches will land.
// Modes: off (black) · identify (mapping pattern: grid, ids, zones) · debug (touches).
// While a calibration runs, its targets are drawn on top whatever the mode.

import { store, on, connect } from './conn.js';
import { uvToCanvas } from './workspace.js';

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

function frame(t) { pulse = t / 1000; draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

function poly(pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
function line([x0, y0], [x1, y1]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

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
  g.setTransform(c.width / P.canvas.width, 0, 0, c.height / P.canvas.height, 0, 0);

  for (const w of P.walls) {
    const Pt = (x, y) => uvToCanvas(w, x / w.width, 1 - y / w.height);
    const pxPerM = w.pixelRect.h / w.height;
    const corners = [Pt(0, w.height), Pt(w.width, w.height), Pt(w.width, 0), Pt(0, 0)];

    if (mode === 'identify') {
      const grid = w.mapping?.mode === 'grid';
      const N = grid ? 24 : 1;
      const pl = (fn) => { g.beginPath(); for (let k = 0; k <= N; k++) { const [x, y] = fn(k / N); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5;
      for (let x = 0.5; x < w.width; x += 0.5) pl((t) => Pt(x, t * w.height));
      for (let y = 0.5; y < w.height; y += 0.5) pl((t) => Pt(t * w.width, y));
      g.strokeStyle = '#fff'; g.lineWidth = 5;
      pl((t) => Pt(t * w.width, w.height)); pl((t) => Pt(w.width, w.height * (1 - t))); pl((t) => Pt(w.width * (1 - t), 0)); pl((t) => Pt(0, t * w.height));
      if (grid) { // mesh nodes: what the operator drags from the tablet
        g.fillStyle = AMBER;
        for (const [x, y] of w.mapping.points) { g.beginPath(); g.arc(x, y, pxPerM * 0.03, 0, Math.PI * 2); g.fill(); }
      }
      // corner markers: the operator aligns these with the physical corners of the wall
      g.strokeStyle = AMBER; g.lineWidth = 6;
      for (const [x, y] of corners) { g.beginPath(); g.arc(x, y, pxPerM * 0.06, 0, Math.PI * 2); g.stroke(); }
      const [cx, cy] = Pt(w.width / 2, w.height / 2);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `600 ${Math.round(pxPerM * 0.4)}px Geist, system-ui`;
      g.fillText(w.id, cx, cy - pxPerM * 0.25);
      g.font = `500 ${Math.round(pxPerM * 0.13)}px Geist, system-ui`;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(`${w.name} · ${w.width} × ${w.height} m${w.mapping?.mode === 'corners' ? ' · corner pin' : ''}`, cx, cy + pxPerM * 0.2);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      for (const z of P.zones.filter((q) => q.wallId === w.id)) {
        const r = z.rect;
        g.strokeStyle = AMBER; g.lineWidth = 3;
        poly([Pt(r.x0, r.y1), Pt(r.x1, r.y1), Pt(r.x1, r.y0), Pt(r.x0, r.y0)]); g.stroke();
      }
    }

    if (mode === 'debug' || mode === 'identify') {
      for (const [id, x, y, size, coast] of store.live?.walls?.[w.id] || []) {
        const [px, py] = Pt(x, y);
        const rad = Math.max(0.05, size / 2 + 0.02) * pxPerM;
        g.fillStyle = coast ? 'rgba(79,195,232,0.25)' : 'rgba(79,195,232,0.55)';
        g.strokeStyle = CYAN; g.lineWidth = 4;
        g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.font = `600 ${Math.round(pxPerM * 0.07)}px Geist, system-ui`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(id), px, py);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      }
    }

    if (calib && calib.wallId === w.id) {
      calib.targets.forEach((t, k) => {
        const cur = k === calib.index && calib.phase !== 'done';
        const done = t.captured.length > 0;
        const [x, y] = Pt(t.x, t.y);
        if (cur) {
          const R = pxPerM * 0.14;
          const breathe = 1 + 0.08 * Math.sin(pulse * 4);
          g.strokeStyle = calib.phase === 'release' ? GREEN : AMBER;
          g.lineWidth = 6;
          g.beginPath(); g.arc(x, y, R * breathe, 0, Math.PI * 2); g.stroke();
          g.lineWidth = 3;
          line([x - R * 1.8, y], [x - R * 0.4, y]); line([x + R * 0.4, y], [x + R * 1.8, y]);
          line([x, y - R * 1.8], [x, y - R * 0.4]); line([x, y + R * 0.4], [x, y + R * 1.8]);
          const p = calib.phase === 'release' ? 1 : calib.progress;
          if (p > 0) { g.lineWidth = 12; g.beginPath(); g.arc(x, y, R * 1.35, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke(); }
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.font = `500 ${Math.round(pxPerM * 0.075)}px Geist, system-ui`;
          g.textAlign = 'center';
          g.fillText(calib.phase === 'release' ? 'Release' : `Touch and hold · ${k + 1}/${calib.targets.length}`, x, y + R * 2.4);
          g.textAlign = 'left';
        } else {
          g.strokeStyle = done ? GREEN : 'rgba(255,255,255,0.35)';
          g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, pxPerM * 0.045, 0, Math.PI * 2); g.stroke();
        }
      });
    }

    // verification: check points, and where the tracked touch really landed + its error
    const ver = store.status?.verify;
    if (ver && ver.wallId === w.id) {
      ver.targets.forEach((t, k) => {
        const [x, y] = Pt(t.x, t.y);
        const cur = k === ver.index && ver.phase !== 'done';
        g.strokeStyle = cur ? (ver.phase === 'release' ? GREEN : AMBER) : t.errMm !== null ? GREEN : 'rgba(255,255,255,0.35)';
        g.lineWidth = cur ? 6 : 3;
        const R = pxPerM * (cur ? 0.1 : 0.04);
        g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
        if (cur && ver.progress > 0) { g.lineWidth = 10; g.beginPath(); g.arc(x, y, R * 1.4, -Math.PI / 2, -Math.PI / 2 + ver.progress * Math.PI * 2); g.stroke(); }
        if (t.measured) {
          const [mx, my] = Pt(t.measured[0], t.measured[1]);
          g.fillStyle = CYAN; g.beginPath(); g.arc(mx, my, pxPerM * 0.02, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `500 ${Math.round(pxPerM * 0.06)}px Geist, system-ui`; g.textAlign = 'center';
          g.fillText(`${t.errMm} mm`, x, y + pxPerM * 0.16); g.textAlign = 'left';
        }
      });
    }
  }
}

on('state', () => {});
connect();
