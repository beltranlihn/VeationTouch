// Projection output: drawn in OUTPUT-CANVAS pixels (e.g. 3840×2400), scaled to the window.
// Every wall is drawn THROUGH ITS MAPPING (rect or corner pin), so what the operator sees on the
// physical wall is exactly where touches will land.
// Modes: off (black) · identify (mapping pattern: grid, ids, zones) · debug (touches).
// While a calibration runs, its targets are drawn on top whatever the mode. While the remote's walk test is open,
// every wall shows what the outputs send — the white touch discs of the Texture rasteriser — with the zones.

import { store, on, connect } from './conn.js';
import { uvToCanvas } from './workspace.js';
import { shapeOutline, densify } from '/shared/geometry.js';
import { TouchMask, wallPattern } from '/shared/mask.js';
import { drawHands, drawSessionFeedback } from './feedback.js';

const c = document.getElementById('c');
const g = c.getContext('2d');
const AMBER = '#E5B567', CYAN = '#4FC3E8'; // (cyan = live and accepted; amber = attention)
const noMark = () => {};
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

/**
 * The pixel map of a wall: the metre grid carried through its mapping (0.5 m thin, 1 m thick with its number), the
 * outline, centre cross, corner marks and the wall id. The geometry is wallPattern() of mask.js — the Texture outputs
 * rasterise the very same lines.
 */
function drawGrid(w) {
  const pat = wallPattern(w);
  g.lineJoin = 'round';
  for (const l of pat.lines) { g.strokeStyle = l.major ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'; g.lineWidth = l.major ? 4 : 1.5; polyline(l.pts); }
  g.strokeStyle = '#fff'; g.lineWidth = 5; poly(pat.outline); g.stroke();
  g.lineWidth = 8; for (const k of pat.corners) polyline(k);
  g.lineWidth = 4; for (const k of pat.cross) polyline(k);
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = `600 ${Math.round(pat.textPx)}px Geist, system-ui`; g.textAlign = 'left';
  for (const l of pat.lines) if (l.label) g.fillText(l.label.text, l.label.at[0], l.label.at[1]);
  g.font = `600 ${Math.round(pat.textPx * 2)}px Geist, system-ui`; g.textAlign = 'center';
  g.fillText(w.id, pat.id.at[0], pat.id.at[1]);
  g.textAlign = 'left';
}
function polyline(pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }

/** A zone outline (already in canvas px): amber, filled while the zone is active. */
function drawZone(z, pts) {
  poly(pts);
  if (store.live?.zones?.[z.id]?.active) { g.fillStyle = 'rgba(229,181,103,0.28)'; g.fill(); }
  g.strokeStyle = AMBER; g.lineWidth = 3; g.stroke();
}

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const S = store.state;
  if (!S) return;
  const P = S.profile;
  const mode = S.projection?.mode || 'off';
  const calib = store.status?.calib;
  const fit = S.projection?.fit;
  const fitWall = fit && P.walls.find((w) => w.id === fit.wallId && w.mapping?.mode === 'grid');
  const walk = !!S.projection?.walk && !calib && !fitWall;
  const grid = !!S.grid; // the metre grid (pixel map), whatever the mode
  if (mode === 'off' && !calib && !fitWall && !walk && !grid) return;
  g.setTransform(c.width / P.canvas.width, 0, 0, c.height / P.canvas.height, 0, 0);
  if (walk) { drawWalk(P); if (grid) P.walls.forEach(drawGrid); return; }

  for (const w of P.walls) {
    if (grid) drawGrid(w);
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
      for (const z of P.zones.filter((q) => q.space !== 'canvas' && q.wallId === w.id)) {
        // the outline is split into short pieces so it bends with a grid mapping
        drawZone(z, densify(shapeOutline(z, 48), 0.1).map(([x, y]) => Pt(x, y)));
      }
    }
  }
  // canvas zones live in output pixels already (they may span walls)
  if (mode === 'identify') for (const z of P.zones.filter((q) => q.space === 'canvas')) drawZone(z, shapeOutline(z, 64));

  for (const w of P.walls) {
    const Pt = (x, y) => uvToCanvas(w, x / w.width, 1 - y / w.height);
    const pxPerM = w.pixelRect.h / w.height;

    if ((mode === 'debug' || mode === 'identify') && w !== fitWall) {
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
          g.strokeStyle = calib.phase === 'release' ? CYAN : AMBER;
          g.lineWidth = 6;
          g.beginPath(); g.arc(x, y, R * breathe, 0, Math.PI * 2); g.stroke();
          g.lineWidth = 3;
          line([x - R * 1.8, y], [x - R * 0.4, y]); line([x + R * 0.4, y], [x + R * 1.8, y]);
          line([x, y - R * 1.8], [x, y - R * 0.4]); line([x, y + R * 0.4], [x, y + R * 1.8]);
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.font = `500 ${Math.round(pxPerM * 0.075)}px Geist, system-ui`;
          g.textAlign = 'center';
          g.fillText(calib.phase === 'release' ? 'Release' : `Touch and hold · ${k + 1}/${calib.targets.length}`, x, y + R * 2.4);
          g.textAlign = 'left';
        } else {
          g.strokeStyle = done ? CYAN : 'rgba(255,255,255,0.35)';
          g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, pxPerM * 0.045, 0, Math.PI * 2); g.stroke();
        }
      });
      // what moves: the raw detections (the hand), the filling ring, the capture radius, the flash
      const fo = { pt: Pt, pm: pxPerM, lw: (px) => px, mark: noMark, textPx: pxPerM * 0.12 };
      drawHands(g, store.live?.calibHands?.[w.id], fo);
      drawSessionFeedback(g, calib, 'calib', fo);
    }

    // verification: check points, and where the tracked touch really landed + its error
    const ver = store.status?.verify;
    if (ver && ver.wallId === w.id) {
      ver.targets.forEach((t, k) => {
        const [x, y] = Pt(t.x, t.y);
        const cur = k === ver.index && ver.phase !== 'done';
        g.strokeStyle = cur ? (ver.phase === 'release' ? CYAN : AMBER) : t.errMm !== null ? CYAN : 'rgba(255,255,255,0.35)';
        g.lineWidth = cur ? 6 : 3;
        const R = pxPerM * (cur ? 0.1 : 0.04);
        g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
        if (t.measured) {
          const [mx, my] = Pt(t.measured[0], t.measured[1]);
          g.fillStyle = CYAN; g.beginPath(); g.arc(mx, my, pxPerM * 0.02, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `500 ${Math.round(pxPerM * 0.06)}px Geist, system-ui`; g.textAlign = 'center';
          g.fillText(`${t.errMm} mm`, x, y + pxPerM * 0.16); g.textAlign = 'left';
        }
      });
      drawSessionFeedback(g, ver, 'verify', { pt: Pt, pm: pxPerM, lw: (px) => px, mark: noMark, textPx: pxPerM * 0.12 });
    }
  }
  if (fitWall) drawFit(fitWall, fit.node);
}

/**
 * Fit (from the calibration remote): the wall's mesh, every point, the chosen one ringed, and each touch as a cyan
 * ring — where the system sees the hand. The operator moves the point until the ring sits under the hand.
 */
function drawFit(w, node) {
  const m = w.mapping, nx = m.us.length;
  const pxPerM = w.pixelRect.h / w.height;
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  g.strokeStyle = 'rgba(229,181,103,0.6)'; g.lineWidth = 2;
  for (let j = 0; j < m.vs.length; j++) path(m.points.slice(j * nx, j * nx + nx));
  for (let i = 0; i < nx; i++) path(m.vs.map((_, j) => m.points[j * nx + i]));
  g.fillStyle = AMBER;
  for (const [x, y] of m.points) { g.beginPath(); g.arc(x, y, pxPerM * 0.035, 0, Math.PI * 2); g.fill(); }
  if (node != null && m.points[node]) {
    const [x, y] = m.points[node];
    const R = pxPerM * 0.11;
    g.strokeStyle = '#fff'; g.lineWidth = 5;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    line([x - R * 1.7, y], [x - R * 0.45, y]); line([x + R * 0.45, y], [x + R * 1.7, y]);
    line([x, y - R * 1.7], [x, y - R * 0.45]); line([x, y + R * 0.45], [x, y + R * 1.7]);
  }
  for (const [, x, y, size] of store.live?.walls?.[w.id] || []) {
    const [px, py] = uvToCanvas(w, x / w.width, 1 - y / w.height);
    const rad = Math.max(0.05, size / 2 + 0.02) * pxPerM;
    g.strokeStyle = CYAN; g.lineWidth = 6;
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.stroke();
    g.fillStyle = CYAN; g.beginPath(); g.arc(px, py, pxPerM * 0.012, 0, Math.PI * 2); g.fill();
  }
}

/** Walk test: the touch discs exactly as the first Texture output draws them (or its defaults), zones on top. */
const walkMask = new TouchMask();
const walkOff = document.createElement('canvas');
let walkImg = null, walkT = null;
function drawWalk(P) {
  const o = P.outputs.find((x) => x.type === 'texture' && x.enabled) || P.outputs.find((x) => x.type === 'texture')
    || { radius: 0.08, softness: 0.5, trailMs: 250, sizeMode: 'fixed', scale: 0.25 };
  const scale = Math.min(0.25, o.scale || 0.25); // the projection only needs to show it, not to send it
  const w = Math.max(16, Math.round(P.canvas.width * scale)), h = Math.max(16, Math.round(P.canvas.height * scale));
  if (walkMask.resize(w, h)) { walkOff.width = w; walkOff.height = h; walkImg = new ImageData(w, h); walkT = null; }
  const L = store.live, now = L?.t ?? 0;
  const dt = walkT === null || now < walkT ? 33 : Math.min(1000, now - walkT);
  walkT = now;
  const walls = P.walls.map((wall) => ({ wall, touches: (L?.walls?.[wall.id] || []).map(([, x, y, size]) => ({ x, y, size })) }));
  walkMask.render(walls, o, scale, dt);
  const m = walkMask.mask, d = walkImg.data;
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = m[i]; }
  walkOff.getContext('2d').putImageData(walkImg, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(walkOff, 0, 0, P.canvas.width, P.canvas.height);
  // the walls' outlines, faint: where each wall's content is
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
  for (const wl of P.walls) {
    const Pt = (x, y) => uvToCanvas(wl, x / wl.width, 1 - y / wl.height);
    poly(densify([[0, wl.height], [wl.width, wl.height], [wl.width, 0], [0, 0]], 0.25).map(([x, y]) => Pt(x, y))); g.stroke();
    for (const z of P.zones.filter((q) => q.space !== 'canvas' && q.wallId === wl.id)) drawZone(z, densify(shapeOutline(z, 48), 0.1).map(([x, y]) => Pt(x, y)));
  }
  for (const z of P.zones.filter((q) => q.space === 'canvas')) drawZone(z, shapeOutline(z, 64));
}

window.__proj = { draw }; // UI tests: a hidden window paints no frames, they draw on demand
on('state', () => {});
connect();
window.__vtStarted?.(); // the startup guard (boot-guard.js) stands down
