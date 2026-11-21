// Output › Screens: the two stages of the Advanced Output (MEDIA-SERVER.md §5.2), each a Canvas 2D view.
//   Input  — the content canvas (the walls as labelled rectangles, the content underlay under them) with the selected
//            screen's slices: each one's input rectangle; drag the selected one to move it, its corners to resize it.
//   Output — the screen as a labelled rectangle at its real resolution, with its slices: drag to move, the corners to
//            resize (rect) or pin them (corner pin), the nodes (grid). Snaps to the screen's edges, halves and quarters
//            and to the other slices (MadMapper / Watchout; ±8 px on screen).
// Hovering a slice lights it in both stages. Nothing is sent while dragging: one edit (one undo step) on release.

import { store } from '../conn.js';
import { sliceInput, outputCorners, outputBounds, snapRect, snapValue, snapTargets } from '/shared/media/screens.js';

const INK = '#E0E0E0', INK3 = '#8C8C8C', DIM = 'rgba(255,255,255,0.16)', PAD = 18, HANDLE = 5;

/**
 * One stage. `A` is the deck's state (outputview/screens.js): P(), screen(), slice(), sliceById(), select(), commit(),
 * hover, temp (the slice being dragged), lastStage.
 */
export function createStage(kind, A) {
  const el = document.createElement('canvas');
  el.className = 'ao-canvas';
  el.dataset.stage = kind;
  const g = el.getContext('2d');
  let tf = { k: 1, ox: 0, oy: 0 }, drag = null;
  const st = { el, kind };

  const content = () => (kind === 'input' ? { width: A.P().canvas.width, height: A.P().canvas.height } : A.screen());
  const S = (x, y) => [tf.ox + x * tf.k, tf.oy + y * tf.k];
  const back = (px, py) => [(px - tf.ox) / tf.k, (py - tf.oy) / tf.k];
  const live = (sl) => (A.temp && A.temp.id === sl.id ? A.temp : sl);
  /** A slice's outline in this stage (content px). */
  const outline = (sl) => {
    if (kind === 'output') return outputCorners(sl.output);
    const r = sliceInput(sl, A.P());
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  };
  /** The handles of the selected slice: corners (rect, input, corner pin) or the mesh's nodes (grid). */
  const handles = (sl) => (kind === 'output' && sl.output.mode === 'grid' ? sl.output.points : outline(sl));

  function fitView() {
    const c = content();
    if (!c) return;
    const cw = el.width / (devicePixelRatio || 1), ch = el.height / (devicePixelRatio || 1);
    const k = Math.max(1e-4, Math.min((cw - PAD * 2) / c.width, (ch - PAD * 2) / c.height));
    tf = { k, ox: (cw - c.width * k) / 2, oy: (ch - c.height * k) / 2 };
  }

  function poly(pts, close = true) {
    g.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = S(x, y); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
    if (close) g.closePath();
  }

  st.draw = () => {
    const dpr = devicePixelRatio || 1, cw = el.width / dpr, ch = el.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const P = A.P(), c = content();
    if (!P || !c) {
      g.fillStyle = INK3; g.font = '11px Geist, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(kind === 'output' ? 'Add a screen, or start from a template' : '', cw / 2, ch / 2);
      return;
    }
    if (!drag) fitView();
    const [x0, y0] = S(0, 0), [x1, y1] = S(c.width, c.height);
    g.fillStyle = '#000'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const ul = kind === 'input' ? A.underlay() : null;
    if (ul) { g.globalAlpha = 0.55; g.drawImage(ul, x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1; }
    g.lineWidth = 1;
    if (kind === 'output') {
      // the halves and quarters the slices snap to (the Fx4's quadrants are the halves)
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      for (const f of [0.25, 0.75]) { poly([[c.width * f, 0], [c.width * f, c.height]], false); g.stroke(); poly([[0, c.height * f], [c.width, c.height * f]], false); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      poly([[c.width / 2, 0], [c.width / 2, c.height]], false); g.stroke(); poly([[0, c.height / 2], [c.width, c.height / 2]], false); g.stroke();
    } else {
      // the walls where the content has them (the Mapping)
      g.font = '600 10px Geist, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      for (const w of P.walls) {
        const r = w.pixelRect;
        g.strokeStyle = DIM; poly([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]); g.stroke();
        const [a, b] = S(r.x, r.y); g.fillStyle = INK3; g.fillText(w.id, a + 4, b + 4);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    // the slices (of the selected screen), the selected one last, in ink, with its handles
    const sc = A.screen(), sel = A.slice();
    const list = (sc?.slices || []).map(live);
    for (const sl of list) {
      const on = sel && sl.id === sel.id, hov = A.hover === sl.id;
      const pts = outline(sl);
      g.fillStyle = on ? 'rgba(224,224,224,0.10)' : hov ? 'rgba(224,224,224,0.07)' : 'rgba(224,224,224,0.035)';
      poly(pts); g.fill();
      g.strokeStyle = on ? INK : hov ? '#B8B8B8' : 'rgba(184,184,184,0.55)'; g.lineWidth = on ? 1.5 : 1;
      if (!sl.enabled) g.setLineDash([4, 3]);
      poly(pts); g.stroke(); g.setLineDash([]);
      if (kind === 'output' && sl.output.mode === 'grid') { g.strokeStyle = 'rgba(184,184,184,0.35)'; gridLines(sl.output); }
      const [a, b] = S(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])));
      g.fillStyle = on ? INK : '#B8B8B8'; g.font = '600 11px Geist, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(`${sl.name}${sl.flipH ? ' ⇋' : ''}${sl.flipV ? ' ⇵' : ''}`, a + 5, b + 4);
      if (kind === 'output') {
        const ob = outputBounds(sl.output);
        g.fillStyle = INK3; g.font = '10px Geist, system-ui, sans-serif';
        g.fillText(`${Math.round(ob.w)}×${Math.round(ob.h)} @ ${Math.round(ob.x)}, ${Math.round(ob.y)}`, a + 5, b + 18);
      }
      if (on) for (const [hx, hy] of handles(sl)) { const [p, q] = S(hx, hy); g.fillStyle = '#111'; g.fillRect(p - HANDLE, q - HANDLE, HANDLE * 2, HANDLE * 2); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(p - HANDLE + 0.5, q - HANDLE + 0.5, HANDLE * 2 - 1, HANDLE * 2 - 1); }
    }
    // the stage's label: what it is, at what size
    g.fillStyle = INK3; g.font = '10px Geist, system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText(kind === 'output' ? `${sc.name} · ${sc.width}×${sc.height}` : `Canvas · ${c.width}×${c.height}`, x1, y0 - 3);
  };

  function gridLines(o) {
    const nx = o.us.length;
    for (let j = 0; j < o.vs.length; j++) { poly(o.points.slice(j * nx, j * nx + nx), false); g.stroke(); }
    for (let i = 0; i < nx; i++) { poly(o.vs.map((_, j) => o.points[j * nx + i]), false); g.stroke(); }
  }

  // ---------------------------------------------------------------------------------------- interaction

  const inside = (x, y, pts) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };

  function hit(px, py) {
    const sc = A.screen(), sel = A.slice();
    if (!sc) return null;
    if (sel) {
      const hs = handles(live(sel));
      for (let i = 0; i < hs.length; i++) { const [a, b] = S(hs[i][0], hs[i][1]); if (Math.abs(a - px) <= HANDLE + 3 && Math.abs(b - py) <= HANDLE + 3) return { slice: sel, handle: i }; }
    }
    const [x, y] = back(px, py);
    for (const sl of [...sc.slices].reverse()) if (inside(x, y, outline(live(sl)))) return { slice: sl, handle: -1 };
    return null;
  }

  const others = (sl) => (A.screen()?.slices || []).filter((x) => x.id !== sl.id).map((x) => outputBounds(x.output));

  function moved(px, py, free) {
    const d = drag, P = A.P(), [x, y] = back(px, py), dx = x - d.x, dy = y - d.y;
    const s = structuredClone(d.orig), tol = 8 / tf.k;
    const sn = (v, size, extra) => (free ? v : snapValue(v, snapTargets(size, extra), tol));
    if (kind === 'input') {
      const c = P.canvas, r = { ...sliceInput(d.orig, P) };
      const ex = P.walls.flatMap((w) => [w.pixelRect.x, w.pixelRect.x + w.pixelRect.w]), ey = P.walls.flatMap((w) => [w.pixelRect.y, w.pixelRect.y + w.pixelRect.h]);
      if (d.handle < 0) { r.x = Math.round(sn(r.x + dx, c.width, ex)); r.y = Math.round(sn(r.y + dy, c.height, ey)); }
      else {
        const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], opp = pts[(d.handle + 2) % 4];
        const nx = sn(pts[d.handle][0] + dx, c.width, ex), ny = sn(pts[d.handle][1] + dy, c.height, ey);
        r.x = Math.round(Math.min(nx, opp[0])); r.y = Math.round(Math.min(ny, opp[1]));
        r.w = Math.max(1, Math.round(Math.abs(nx - opp[0]))); r.h = Math.max(1, Math.round(Math.abs(ny - opp[1])));
      }
      r.x = Math.max(0, Math.min(c.width - 1, r.x)); r.y = Math.max(0, Math.min(c.height - 1, r.y));
      r.w = Math.min(r.w, c.width - r.x); r.h = Math.min(r.h, c.height - r.y);
      s.input = r;
      return s;
    }
    const sc = A.screen(), o = s.output, ex = others(d.orig);
    const exX = ex.flatMap((b) => [b.x, b.x + b.w]), exY = ex.flatMap((b) => [b.y, b.y + b.h]);
    if (o.mode === 'rect') {
      const r0 = d.orig.output.rect;
      if (d.handle < 0) o.rect = free ? { ...r0, x: Math.round(r0.x + dx), y: Math.round(r0.y + dy) } : snapRect({ ...r0, x: r0.x + dx, y: r0.y + dy }, sc, ex, tol);
      else {
        const pts = [[r0.x, r0.y], [r0.x + r0.w, r0.y], [r0.x + r0.w, r0.y + r0.h], [r0.x, r0.y + r0.h]], opp = pts[(d.handle + 2) % 4];
        const nx = sn(pts[d.handle][0] + dx, sc.width, exX), ny = sn(pts[d.handle][1] + dy, sc.height, exY);
        o.rect = { x: Math.round(Math.min(nx, opp[0])), y: Math.round(Math.min(ny, opp[1])), w: Math.max(1, Math.round(Math.abs(nx - opp[0]))), h: Math.max(1, Math.round(Math.abs(ny - opp[1]))) };
      }
      return s;
    }
    const pts = o.mode === 'grid' ? o.points : o.corners, src = d.orig.output.mode === 'grid' ? d.orig.output.points : d.orig.output.corners;
    const r1 = (v) => Math.round(v * 10) / 10;
    if (d.handle < 0) pts.forEach((p, i) => { p[0] = r1(src[i][0] + dx); p[1] = r1(src[i][1] + dy); });
    else pts[d.handle] = [r1(sn(src[d.handle][0] + dx, sc.width, exX)), r1(sn(src[d.handle][1] + dy, sc.height, exY))];
    return s;
  }

  el.addEventListener('pointerdown', (e) => {
    A.lastStage = kind; A.focus = true;
    const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const h = hit(px, py);
    if (!h) { A.select(A.screen()?.id ?? null, null); return; }
    if (A.slice()?.id !== h.slice.id) A.select(A.screen().id, h.slice.id);
    if (store.state?.locked) return;
    const [x, y] = back(px, py);
    drag = { orig: structuredClone(h.slice), handle: h.handle, x, y, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (!drag) {
      const h = hit(px, py), id = h?.slice.id ?? null;
      el.style.cursor = h ? (h.handle >= 0 ? 'crosshair' : 'move') : 'default';
      if (A.hover !== id) { A.hover = id; A.redraw(); }
      return;
    }
    drag.moved = true;
    A.temp = moved(px, py, e.altKey); // Alt: no snapping
    A.redraw(true);
  });
  const end = () => {
    if (!drag) return;
    const t = A.temp, was = drag;
    drag = null;
    if (was.moved && t) A.commit(t, kind === 'input' ? 'move slice input' : was.handle >= 0 ? 'reshape slice' : 'move slice');
    else { A.temp = null; A.redraw(); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { if (!drag && A.hover) { A.hover = null; A.redraw(); } });

  st.resize = () => {
    const r = el.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    st.draw();
  };
  st.dragging = () => !!drag;
  return st;
}
