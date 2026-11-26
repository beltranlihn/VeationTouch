// Simulated visitors (26-11, for the room test without people): N visitors walk round the room and touch the walls like people do —
// taps, slow drags (0.25–0.7 m/s, which paint the mosaic and stir the particles), holds of 1.5–5 s — at human heights (adults
// 0.9–1.75 m, one in six a child 0.7–1.3 m). When the host passes a target (the entrance's buttons, the tower's places, her golden
// point) some of them go there and hold it, as a visitor who follows the hint would. Off by default (param sim.visitors = 0): a test
// tool only, it adds hands to vt.hands() in the runtime's own shape and never replaces the real ones.
//
// API: const sim = createSimVisitors(vt);  sim.update(t, dt, { n, target })  each frame;  sim.out = this frame's hands (vt.hands()
// shape: { id, stroke, trackerId, wallId, x, y, vx, vy, size, ended } in render px);  sim.sound() = { h: [{ stroke, wallId, u, v, size }],
// d: [this frame's downs] } for the sound piece (it cannot see these hands otherwise).
// target: null | { walls: [wall indices], dx (m from the wall's centre) | null, y (m) | null, hold (s), p (share of the visitors that go) }

export function createSimVisitors(vt, { seed = 7 } = {}) {
  const W = vt.walls, NW = W.length, start = []; let per = 0;
  for (const w of W) { start.push(per); per += w.width; }
  let rs = seed >>> 0;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd();
  const circ = (d) => ((d + per / 2) % per + per) % per - per / 2;
  const wrap = (s) => ((s % per) + per) % per;
  const wallAt = (s) => { s = wrap(s); for (let i = NW - 1; i >= 0; i--) if (s >= start[i]) return i; return 0; };
  const vis = [], out = [], snd = [], downs = [];
  let strokeN = 0;

  function plan(v, t, tg) {
    const hy = () => (v.kid ? R(0.7, 1.3) : R(0.9, 1.75));
    let a;
    if (tg && tg.walls?.length && rnd() < (tg.p ?? 0.5)) {
      const wi = tg.walls[Math.floor(rnd() * tg.walls.length)] % NW;
      const dx = tg.dx == null ? R(-W[wi].width / 2 + 0.6, W[wi].width / 2 - 0.6) : tg.dx + R(-0.1, 0.1);
      const y = tg.y == null ? hy() : tg.y + R(-0.08, 0.08);
      a = { kind: 'hold', s: start[wi] + W[wi].width / 2 + dx, y, dur: (tg.hold ?? 2) + R(0.6, 2.5) };
    } else {
      const r = rnd(), s = v.s + R(-3.5, 3.5);
      if (r < 0.3) a = { kind: 'tap', s, y: hy(), dur: R(0.35, 1.1) };
      else if (r < 0.75) a = { kind: 'drag', s, y: hy(), dur: R(2, 6), dir: rnd() < 0.5 ? -1 : 1, sp: R(0.25, 0.7), ph: R(0, 6.28), amp: R(0.08, 0.3) };
      else a = { kind: 'hold', s, y: hy(), dur: R(1.5, 5) };
    }
    const walk = Math.abs(circ(a.s - v.s)) / R(0.8, 1.2);
    a.t0 = t + walk + R(0.2, 0.9); a.t1 = a.t0 + a.dur;
    v.act = a; v.s = a.s; v.stroke = 0;
  }

  function update(t, dt, { n = 0, target = null } = {}) {
    n = Math.max(0, Math.min(16, Math.round(n || 0)));
    while (vis.length < n) vis.push({ s: R(0, per), kid: rnd() < 1 / 6, act: null, stroke: 0, px: 0, py: 0, rest: t + R(0, 2.5) });
    if (vis.length > n) vis.length = n;
    out.length = 0; snd.length = 0; downs.length = 0;
    for (const v of vis) {
      if (!v.act) { if (t >= v.rest) plan(v, t, target); continue; }
      const a = v.act;
      if (t >= a.t1) { v.act = null; v.stroke = 0; v.rest = t + R(0.8, 3.5); continue; }
      if (t < a.t0) continue;                                    // walking there: no hand on the wall yet
      const tau = t - a.t0;
      let s = a.s, y = a.y;
      if (a.kind === 'drag') {
        s = a.s + a.dir * a.sp * (tau < 0.6 ? tau * tau / 1.2 : tau - 0.3);   // a hand eases into its movement
        y = a.y + a.amp * Math.sin(a.ph + tau * 0.9) - a.amp * Math.sin(a.ph);
      } else { s += 0.006 * Math.sin(tau * 7.3 + a.y * 9); y += 0.006 * Math.sin(tau * 5.1 + a.s); }   // a held hand trembles a little
      const wi = wallAt(s), w = W[wi], xm = wrap(s) - start[wi];
      y = Math.max(0.5, Math.min(Math.min(2.05, (w.height || 3.5) - 0.2), y));
      const [x, py] = vt.toPx(w.id, xm, y);
      const fresh = !v.stroke;
      if (fresh) { v.stroke = 900000 + (++strokeN % 90000); v.px = x; v.py = py; }
      let dxp = x - v.px; const SW = vt.size?.width || 7196; if (vt.closedLoop) dxp = ((dxp + SW / 2) % SW + SW) % SW - SW / 2;
      const k = dt > 0 ? 1 / dt : 0, size = 0.09 * (w.pxPerM || 261);
      out.push({ id: v.stroke, stroke: v.stroke, trackerId: v.stroke, wallId: w.id, x, y: py, vx: dxp * k, vy: (py - v.py) * k, size, ended: false });
      v.px = x; v.py = py;
      const sh = { stroke: v.stroke, wallId: w.id, u: xm / w.width, v: y / (w.height || 3.5), size: 0.09 };
      snd.push(sh); if (fresh) downs.push(sh);
    }
  }
  return { update, out, sound: () => ({ h: snd, d: downs }), get count() { return vis.length; } };
}
