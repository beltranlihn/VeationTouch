// The room, unrolled: every wall side by side at the same metric scale (like VEATION's
// room strip). Draws live LiDAR points, detections, touches, zones, masks, sensors and
// calibration targets. Pointer input: pan/zoom, pick, draw a rectangle, virtual hands.

import { store } from './conn.js';

const GAP = 0.6; // metres between walls in the strip
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function applyM(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

export class RoomView {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { s: 80, ox: 40, oy: 40 }; // px per metre, offset
    this.fitted = false;
    this.showPoints = true;
    this.mode = 'select';          // select | draw | hand
    this.selection = null;         // {kind:'wall'|'sensor'|'zone', id}
    this.onPick = () => {};
    this.onDraw = () => {};        // (wallId, rect) when a rectangle is drawn
    this.onHand = () => {};        // (wallId, x, y, phase, pointerId)
    this.drawRect = null;
    this.pointers = new Map();
    this.colors = { live: css('--live'), attn: css('--attn'), danger: css('--danger'), ok: css('--ok-ink') };
    this._bind();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  layout() {
    const walls = store.state?.profile?.walls || [];
    let x = 0;
    return walls.map((w) => { const r = { wall: w, x0: x }; x += w.width + GAP; return r; });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fitted) this.fit();
  }

  fit() {
    const L = this.layout();
    if (!L.length || !this.w) return;
    const totalW = L.at(-1).x0 + L.at(-1).wall.width;
    const maxH = Math.max(...L.map((l) => l.wall.height)) + 0.9; // room for the sensors above
    const pad = 28;
    const s = Math.min((this.w - pad * 2) / totalW, (this.h - pad * 2 - 18) / maxH);
    this.view.s = Math.max(5, s);
    this.view.ox = (this.w - totalW * this.view.s) / 2;
    this.view.oy = this.h - (this.h - maxH * this.view.s) / 2 - 6;
    this.fitted = true;
  }

  // strip metres → screen px (y up in metres, down on screen)
  sx(x) { return this.view.ox + x * this.view.s; }
  sy(y) { return this.view.oy - y * this.view.s; }
  toWorld(px, py) { return [(px - this.view.ox) / this.view.s, (this.view.oy - py) / this.view.s]; }

  /** Screen point → {wall, x, y} in wall metres (or null). */
  hitWall(px, py, margin = 0) {
    const [X, Y] = this.toWorld(px, py);
    for (const l of this.layout()) {
      const x = X - l.x0;
      if (x >= -margin && x <= l.wall.width + margin && Y >= -margin && Y <= l.wall.height + 1.0) return { wall: l.wall, x, y: Y };
    }
    return null;
  }

  sensorOrigin(s) {
    if (s.calibration?.matrix) return applyM(s.calibration.matrix, 0, 0);
    return [s.pose.x, s.pose.y];
  }

  // ------------------------------------------------------------------ input

  _bind() {
    const c = this.c;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * 0.0015);
      this._zoomAt(e.offsetX, e.offsetY, k);
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('dblclick', () => this.fit());
  }

  _zoomAt(px, py, k) {
    const s2 = Math.min(2000, Math.max(5, this.view.s * k));
    const kk = s2 / this.view.s;
    this.view.ox = px - (px - this.view.ox) * kk;
    this.view.oy = py - (py - this.view.oy) * kk;
    this.view.s = s2;
  }

  _down(e) {
    this.c.setPointerCapture(e.pointerId);
    const p = { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, moved: false, action: null };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) { // pinch: cancel single-pointer actions
      for (const q of this.pointers.values()) {
        if (q.action === 'hand') this.onHand(q.wallId, 0, 0, 'up', q.handId);
        q.action = 'pinch';
      }
      this.drawRect = null;
      return;
    }
    const hit = this.hitWall(e.offsetX, e.offsetY);
    if (this.mode === 'hand' && hit && hit.y <= hit.wall.height) {
      p.action = 'hand'; p.wallId = hit.wall.id; p.handId = `ui${e.pointerId}`;
      this.onHand(hit.wall.id, hit.x, hit.y, 'down', p.handId);
    } else if (this.mode === 'draw' && hit) {
      p.action = 'draw';
      this.drawRect = { wallId: hit.wall.id, x0: hit.x, y0: hit.y, x1: hit.x, y1: hit.y };
    } else p.action = 'pan';
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    if (Math.hypot(e.offsetX - p.x0, e.offsetY - p.y0) > 4) p.moved = true;
    if (p.action === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.offsetX; p.y = e.offsetY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 0) this._zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, after / before);
      this.view.ox += dx / 2; this.view.oy += dy / 2;
      return;
    }
    p.x = e.offsetX; p.y = e.offsetY;
    if (p.action === 'pan') { this.view.ox += dx; this.view.oy += dy; }
    else if (p.action === 'hand') {
      const l = this.layout().find((q) => q.wall.id === p.wallId);
      const [X, Y] = this.toWorld(e.offsetX, e.offsetY);
      this.onHand(p.wallId, Math.max(0, Math.min(l.wall.width, X - l.x0)), Math.max(0, Math.min(l.wall.height, Y)), 'move', p.handId);
    } else if (p.action === 'draw' && this.drawRect) {
      const l = this.layout().find((q) => q.wall.id === this.drawRect.wallId);
      const [X, Y] = this.toWorld(e.offsetX, e.offsetY);
      this.drawRect.x1 = Math.max(0, Math.min(l.wall.width, X - l.x0));
      this.drawRect.y1 = Math.max(0, Math.min(l.wall.height, Y));
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (p.action === 'hand') this.onHand(p.wallId, 0, 0, 'up', p.handId);
    if (p.action === 'draw' && this.drawRect) {
      const r = this.drawRect; this.drawRect = null;
      if (Math.abs(r.x1 - r.x0) > 0.05 && Math.abs(r.y1 - r.y0) > 0.05) {
        this.onDraw(r.wallId, { x0: round(Math.min(r.x0, r.x1)), y0: round(Math.min(r.y0, r.y1)), x1: round(Math.max(r.x0, r.x1)), y1: round(Math.max(r.y0, r.y1)) });
      }
    }
    if ((p.action === 'pan' || p.action === 'draw') && !p.moved) this._pick(e.offsetX, e.offsetY);
  }

  _pick(px, py) {
    const P = store.state?.profile;
    if (!P) return;
    const L = this.layout();
    // sensors first (small targets), then zones, then walls
    for (const s of P.sensors) {
      const l = L.find((q) => q.wall.id === s.wallId);
      if (!l) continue;
      const [ox, oy] = this.sensorOrigin(s);
      if (Math.hypot(this.sx(l.x0 + ox) - px, this.sy(oy) - py) < 16) return this.onPick({ kind: 'sensor', id: s.id });
    }
    const hit = this.hitWall(px, py);
    if (!hit) return this.onPick(null);
    const z = P.zones.find((z) => z.wallId === hit.wall.id && hit.x >= Math.min(z.rect.x0, z.rect.x1) && hit.x <= Math.max(z.rect.x0, z.rect.x1) && hit.y >= Math.min(z.rect.y0, z.rect.y1) && hit.y <= Math.max(z.rect.y0, z.rect.y1));
    if (z) return this.onPick({ kind: 'zone', id: z.id });
    this.onPick({ kind: 'wall', id: hit.wall.id });
  }

  // ------------------------------------------------------------------ drawing

  draw() {
    const ctx = this.ctx, P = store.state?.profile;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!P) return;
    if (!this.fitted) this.fit();
    const L = this.layout();
    const s = this.view.s;
    const C = this.colors;
    const live = store.live?.walls || {};
    const calib = store.status?.calib;

    for (const l of L) {
      const w = l.wall;
      const X = (x) => this.sx(l.x0 + x), Y = (y) => this.sy(y);
      const sel = this.selection?.kind === 'wall' && this.selection.id === w.id;
      // wall surface
      ctx.fillStyle = '#161616';
      ctx.fillRect(X(0), Y(w.height), w.width * s, w.height * s);
      // grid 0.5 m
      ctx.lineWidth = 1;
      for (let gx = 0.5; gx < w.width; gx += 0.5) { ctx.strokeStyle = gx % 1 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)'; line(ctx, X(gx), Y(0), X(gx), Y(w.height)); }
      for (let gy = 0.5; gy < w.height; gy += 0.5) { ctx.strokeStyle = gy % 1 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)'; line(ctx, X(0), Y(gy), X(w.width), Y(gy)); }
      ctx.strokeStyle = sel ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.strokeRect(X(0) + 0.5, Y(w.height) + 0.5, w.width * s, w.height * s);
      // floor line
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      line(ctx, X(-0.2), Y(0), X(w.width + 0.2), Y(0));
      // label
      ctx.fillStyle = w.enabled ? '#B8B8B8' : '#6D6D6D';
      ctx.font = '500 11px Geist, system-ui';
      ctx.textBaseline = 'top';
      ctx.fillText(`${w.id}  ${w.name}`, X(0), Y(0) + 6);
      ctx.fillStyle = '#6D6D6D';
      ctx.fillText(`${w.width.toFixed(2)} × ${w.height.toFixed(2)} m`, X(0), Y(0) + 20);
      const count = (live[w.id] || []).length;
      if (count) { ctx.fillStyle = C.live; ctx.textAlign = 'right'; ctx.fillText(`${count} touch${count > 1 ? 'es' : ''}`, X(w.width), Y(0) + 20); ctx.textAlign = 'left'; }

      // masks
      for (const m of w.masks) {
        ctx.fillStyle = 'rgba(224,108,108,0.10)';
        ctx.strokeStyle = 'rgba(224,108,108,0.45)';
        const rx = X(Math.min(m.x0, m.x1)), ry = Y(Math.max(m.y0, m.y1)), rw = Math.abs(m.x1 - m.x0) * s, rh = Math.abs(m.y1 - m.y0) * s;
        ctx.fillRect(rx, ry, rw, rh); ctx.setLineDash([4, 3]); ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh); ctx.setLineDash([]);
      }
      // zones
      for (const z of P.zones.filter((z) => z.wallId === w.id)) {
        const st = store.live?.zones?.[z.id];
        const r = z.rect;
        const rx = X(Math.min(r.x0, r.x1)), ry = Y(Math.max(r.y0, r.y1)), rw = Math.abs(r.x1 - r.x0) * s, rh = Math.abs(r.y1 - r.y0) * s;
        const zsel = this.selection?.kind === 'zone' && this.selection.id === z.id;
        ctx.fillStyle = st?.active ? 'rgba(229,181,103,0.18)' : 'rgba(229,181,103,0.05)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = z.enabled ? C.attn : 'rgba(229,181,103,0.35)';
        ctx.lineWidth = zsel ? 2 : 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
        ctx.fillStyle = C.attn;
        ctx.font = '500 10px Geist, system-ui';
        ctx.fillText(`${z.name}${st?.count ? ` · ${st.count}` : ''}`, rx + 4, ry + 4);
      }
    }

    // points
    if (this.showPoints) {
      for (const [sid, v] of store.viz) {
        const l = L.find((q) => q.wall.id === v.wallId);
        if (!l) continue;
        const pts = v.pts;
        for (let k = 0; k < pts.length; k += 3) {
          const cls = pts[k + 2];
          ctx.fillStyle = cls === 1 ? '#E0E0E0' : cls === 0 ? 'rgba(140,140,140,0.35)' : 'rgba(109,109,109,0.22)';
          const px = this.sx(l.x0 + pts[k]), py = this.sy(pts[k + 1]);
          if (px < -2 || py < -2 || px > this.w + 2 || py > this.h + 2) continue;
          const r = cls === 1 ? 1.6 : 1.1;
          ctx.fillRect(px - r / 2, py - r / 2, r, r);
        }
        ctx.strokeStyle = 'rgba(79,195,232,0.6)';
        for (const [x, y, size] of v.det || []) circle(ctx, this.sx(l.x0 + x), this.sy(y), Math.max(3, (size / 2) * s), false);
        ctx.strokeStyle = 'rgba(224,108,108,0.8)';
        for (const [x, y, size] of v.rejected || []) { ctx.setLineDash([3, 3]); circle(ctx, this.sx(l.x0 + x), this.sy(y), Math.max(5, (size / 2) * s), false); ctx.setLineDash([]); }
      }
    }

    // sensors
    for (const sn of P.sensors) {
      const l = L.find((q) => q.wall.id === sn.wallId);
      if (!l) continue;
      const [ox, oy] = this.sensorOrigin(sn);
      const px = this.sx(l.x0 + ox), py = this.sy(oy);
      const st = store.status?.sensors?.[sn.id];
      const color = !sn.enabled ? '#6D6D6D' : st?.state === 'scanning' ? C.ok : st?.state === 'offline' || st?.state === 'error' ? C.danger : C.attn;
      const sel = this.selection?.kind === 'sensor' && this.selection.id === sn.id;
      ctx.fillStyle = '#262626';
      ctx.strokeStyle = sel ? '#fff' : color;
      ctx.lineWidth = sel ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#B8B8B8';
      ctx.font = '500 10px Geist, system-ui';
      ctx.textBaseline = 'bottom';
      ctx.fillText(sn.id, px + 10, py - 4);
      ctx.textBaseline = 'top';
    }

    // calibration targets
    if (calib) {
      const l = L.find((q) => q.wall.id === calib.wallId);
      if (l) {
        calib.targets.forEach((t, k) => {
          const px = this.sx(l.x0 + t.x), py = this.sy(t.y);
          const cur = k === calib.index && calib.phase !== 'done';
          const done = t.captured.length > 0;
          ctx.strokeStyle = cur ? C.attn : done ? C.ok : 'rgba(255,255,255,0.35)';
          ctx.lineWidth = cur ? 2 : 1;
          circle(ctx, px, py, cur ? 12 : 7, false);
          line(ctx, px - 16, py, px + 16, py); line(ctx, px, py - 16, px, py + 16);
          if (cur && calib.progress > 0) {
            ctx.strokeStyle = C.attn; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(px, py, 18, -Math.PI / 2, -Math.PI / 2 + calib.progress * Math.PI * 2); ctx.stroke();
          }
          ctx.fillStyle = '#8C8C8C'; ctx.font = '500 10px Geist, system-ui';
          ctx.fillText(String(k + 1), px + 9, py + 6);
        });
      }
    }

    // touches
    for (const l of L) {
      for (const [id, x, y, size, coast] of live[l.wall.id] || []) {
        const px = this.sx(l.x0 + x), py = this.sy(y);
        const r = Math.max(6, (Math.max(size, 0.06) / 2) * s);
        ctx.fillStyle = coast ? 'rgba(79,195,232,0.15)' : 'rgba(79,195,232,0.35)';
        ctx.strokeStyle = C.live; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '600 10px Geist, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(id), px, py);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      }
    }

    // rectangle being drawn
    if (this.drawRect) {
      const l = L.find((q) => q.wall.id === this.drawRect.wallId);
      const r = this.drawRect;
      ctx.strokeStyle = C.attn; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(this.sx(l.x0 + Math.min(r.x0, r.x1)), this.sy(Math.max(r.y0, r.y1)), Math.abs(r.x1 - r.x0) * s, Math.abs(r.y1 - r.y0) * s);
      ctx.setLineDash([]);
    }
  }
}

function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); }
const round = (v) => Math.round(v * 1000) / 1000;
