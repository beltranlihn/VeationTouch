// What a wall shows WHILE a calibration or verification runs, on top of the static pattern (grid, targets): where the hand
// is, the ring that fills while it holds, the capture radius, "waiting", the distance still to go, and the flash that
// answers a capture. Shared by the room output (ui/js/output.js, on its own small canvas layer) and the projection page.
//
// Everything is drawn through two callbacks so a page keeps its own coordinate system:
//   pt(x, y)         wall metres → the page's drawing units (through the wall's mapping)
//   mark(x, y, r)    "I drew inside this circle" — the output page clears only those rectangles next frame (dirty rects)
//
// Session snapshot fields used (all optional — an engine that does not send one simply shows less):
//   index, phase ('waiting' | 'holding' | 'release' | 'done'), progress 0..1, armed, captureRadiusM, near {x, y, distM},
//   flash {kind: 'accept' | 'retry', index, ageMs} (present for 1.5 s), targets[{x, y}]

export const AMBER = '#E5B567', CYAN = '#4FC3E8';
export const RETRY = '#E06C6C'; // the app's "danger" ink: a capture that must be repeated
export const FLASH_MS = 1500;

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** The raw detections of the wall being calibrated, as cyan discs with their size (what the sensors see of the hand). */
export function drawHands(g, hands, { pt, pm, lw, mark }) {
  for (const [x, y, size] of hands || []) {
    const [px, py] = pt(x, y), rad = Math.max(0.05, (size || 0) / 2 + 0.02) * pm;
    g.fillStyle = 'rgba(79,195,232,0.35)'; g.strokeStyle = CYAN; g.lineWidth = lw(5);
    g.beginPath(); g.arc(px, py, rad, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = CYAN; g.beginPath(); g.arc(px, py, Math.max(lw(3), pm * 0.012), 0, TAU); g.fill();
    mark(px, py, rad + lw(5));
  }
}

/**
 * The current target's live feedback. `kind` 'calib' | 'verify' sets the size of the target ring (the same as the static
 * pattern's: the grid layer draws the ring and number, this draws what moves).
 */
export function drawSessionFeedback(g, sess, kind, { pt, pm, lw, mark, textPx }) {
  const R = pm * (kind === 'verify' ? 0.1 : 0.14);
  const tgt = sess.targets?.[sess.index];
  const live = tgt && sess.phase !== 'done';
  if (live) {
    const [x, y] = pt(tgt.x, tgt.y);
    // the capture radius: where a hand counts for this target
    if (sess.captureRadiusM > 0) {
      const rr = sess.captureRadiusM * pm;
      g.fillStyle = 'rgba(229,181,103,0.06)'; g.strokeStyle = 'rgba(229,181,103,0.4)'; g.lineWidth = lw(3);
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.stroke();
      mark(x, y, rr + lw(3));
    }
    // the ring that fills while the hand holds (full while releasing)
    const p = sess.phase === 'release' ? 1 : clamp01(sess.progress);
    if (p > 0) {
      g.strokeStyle = AMBER; g.lineWidth = lw(11); g.lineCap = 'butt';
      g.beginPath(); g.arc(x, y, R * 1.35, -Math.PI / 2, -Math.PI / 2 + p * TAU); g.stroke();
      mark(x, y, R * 1.35 + lw(11));
    }
    // the hand is on its way: how far it still is
    if (sess.near && Number.isFinite(sess.near.x) && sess.near.distM > (sess.captureRadiusM || 0)) {
      const [nx, ny] = pt(sess.near.x, sess.near.y);
      g.strokeStyle = 'rgba(229,181,103,0.55)'; g.lineWidth = lw(3); g.setLineDash([lw(10), lw(10)]);
      g.beginPath(); g.moveTo(nx, ny); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `600 ${Math.round(textPx)}px Geist, system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const label = `${Math.round(sess.near.distM * 100)} cm`;
      g.fillText(label, (nx + x) / 2 + textPx * 0.3, (ny + y) / 2 - textPx * 0.3);
      mark((nx + x) / 2, (ny + y) / 2, Math.hypot(nx - x, ny - y) / 2 + textPx * 5);
    }
    // not taking captures yet (the previous hand is still on the wall, or the system is settling)
    const msg = sess.phase === 'release' ? 'RELEASE' : sess.armed === false ? 'WAITING' : '';
    if (msg) {
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `600 ${Math.round(textPx * 1.4)}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(msg, x, y + R * 3.6);
      g.textAlign = 'left';
      mark(x, y + R * 3.1, R * 3.4);
    }
  }
  // the answer to a capture: cyan = accepted, red = repeat. It sits on the target it was about (the index may have moved on)
  const f = sess.flash, ft = f && sess.targets?.[f.index];
  if (ft) {
    const age = clamp01((f.ageMs || 0) / FLASH_MS), a = 1 - age, [x, y] = pt(ft.x, ft.y), rad = R * (1.1 + age * 1.8);
    const col = f.kind === 'retry' ? RETRY : CYAN;
    g.globalAlpha = a * 0.28; g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = lw(10); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    mark(x, y, rad + lw(10));
  }
}
