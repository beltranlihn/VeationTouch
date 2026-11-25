// VEATION Touch lab — LabKit. One classic script (no modules, no dependencies) shared by the standalone prototypes
// (<script src="../../harness/kit.js">, works from a double click) and by the dev runtime (harness/runtime.js).
//
//   LabKit.ROOM                       the room: the strip, the 4 walls in metres and pixels, the human-scale numbers
//   LabKit.createStage(opt)           mouse = touch, Shift+click pins a hand, virtual hands at human speed, overlay (F),
//                                     body scale (B), help (H), keys, HUD, parameter faders
//   LabKit.createRoomAudio(opt)       a simulated 4.1 room (4 wall channels + sub) with the SOUND-API.md `audio` shape + meters
//
// Everything here is development tooling: it is NOT part of the software and never ships to the room.
(function (root) {
  'use strict';

  // ------------------------------------------------------------------------------------------------ the room
  // Barcelona XR Lab: 4 walls closing a circle, ONE strip 7196 x 912 px, P4 | P1 | P2 | P3 left to right; P3 wraps into P4.
  const STRIP = { width: 7196, height: 912 };
  const WALLS = [
    { id: 'P4', name: 'Pantalla 4', width: 7.33, x: 0, w: 1912 },
    { id: 'P1', name: 'Pantalla 1', width: 6.483, x: 1912, w: 1692 },
    { id: 'P2', name: 'Pantalla 2', width: 7.353, x: 3604, w: 1920 },
    { id: 'P3', name: 'Pantalla 3', width: 6.411, x: 5524, w: 1672 },
  ];
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  // The projected image is 3.75 m tall (being confirmed; profiles/xrlab.json still says 3.5). One constant: ?wallH=3.5 tests the other.
  const WALL_H = Number(q.get('wallH')) > 0 ? Number(q.get('wallH')) : 3.75;
  const PERIMETER = WALLS.reduce((a, w) => a + w.width, 0);
  const ROOM = {
    name: 'Barcelona XR Lab', strip: STRIP, walls: WALLS, wallHeight: WALL_H, perimeter: PERIMETER, closedLoop: true,
    // human scale (the director's rule)
    human: { reach: [0.8, 2.0], reachChild: [0.6, 1.4], verticalMax: 3.0, spot: 1.6, handSpeed: 1.0, target: 0.4, adult: 1.7, child: 1.2 },
    audio: { channels: ['P4', 'P1', 'P2', 'P3', 'SUB'] },
    wall: (id) => WALLS.find((w) => w.id === id) || null,
    /** strip fraction s (0..1, wraps) and top-down fraction t (0 = top) → { wallId, u, v, xm, ym } (u 0..1 along the wall, v 0..1 up from the floor, metres) */
    locate(s, t) {
      const px = (((s % 1) + 1) % 1) * STRIP.width;
      const w = WALLS.find((k) => px >= k.x && px < k.x + k.w) || WALLS[WALLS.length - 1];
      const u = Math.min(1, Math.max(0, (px - w.x) / w.w)), v = Math.min(1, Math.max(0, 1 - t));
      return { wallId: w.id, u, v, xm: u * w.width, ym: v * WALL_H };
    },
    /** wall id, metres along it (x), metres up (y) → strip fractions { s, t } */
    toStrip(wallId, xm, ym) {
      const w = WALLS.find((k) => k.id === wallId) || WALLS[0];
      return { s: (w.x + (xm / w.width) * w.w) / STRIP.width, t: 1 - ym / WALL_H };
    },
    /** metres along the whole perimeter (P4 start = 0, wraps) → { wall, x metres in that wall } */
    perim(pm) {
      let m = ((pm % PERIMETER) + PERIMETER) % PERIMETER;
      for (const w of WALLS) { if (m < w.width) return { wallId: w.id, xm: m }; m -= w.width; }
      return { wallId: WALLS[0].id, xm: 0 };
    },
  };

  // ------------------------------------------------------------------------------------------------ small helpers
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // the LISTENING volume (lab only): one value for every simulated room of the page, after its limiter, kept in this browser.
  // It is what the person at the laptop turns; it says nothing about the piece's levels (the meters do).
  const VOL_KEY = 'lab.volume';
  let VOLUME = 0.5;
  try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 1) VOLUME = v; } catch { /* no storage */ }
  const volRooms = new Set(), volViews = new Set();
  function setVolume(v) {
    VOLUME = Math.round(clamp(v, 0, 1) * 100) / 100;
    try { localStorage.setItem(VOL_KEY, String(VOLUME)); } catch { /* no storage */ }
    for (const r of volRooms) r.applyVolume(); for (const f of volViews) f(VOLUME);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (k) => k * k * (3 - 2 * k);
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };

  const STYLE = `
  :root { --bg:#111111; --s1:#1B1B1B; --s2:#262626; --ink:#E0E0E0; --ink2:#B8B8B8; --live:#4FC3E8; --warn:#E5B567; }
  .lk-hud { position:fixed; left:16px; top:14px; pointer-events:none; letter-spacing:.14em; text-transform:uppercase; font:10px/1.5 Geist,"Segoe UI",system-ui,sans-serif; color:#B8B8B8; opacity:.8; z-index:2147483600; transition:opacity .8s; }
  .lk-hud b { color:#E0E0E0; font-weight:500; }
  .lk-hint { position:fixed; left:16px; bottom:14px; pointer-events:none; font:11px/1.45 Geist,"Segoe UI",system-ui,sans-serif; color:#B8B8B8; opacity:.6; z-index:2147483600; transition:opacity 1.2s; }
  .lk-help, .lk-params { position:fixed; right:16px; top:14px; width:300px; padding:14px 16px; background:rgba(17,17,17,.86); border:1px solid #262626; border-radius:6px; display:none; backdrop-filter:blur(8px); z-index:2147483601; font:12px/1.45 Geist,"Segoe UI",system-ui,sans-serif; color:#B8B8B8; -webkit-user-select:none; user-select:none; }
  .lk-params { right:auto; left:16px; top:64px; width:320px; max-height:70vh; overflow:auto; }
  .lk-help h4, .lk-params h4 { margin:0 0 8px; font-weight:500; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#E5B567; }
  .lk-help div.r { display:flex; justify-content:space-between; gap:12px; padding:2px 0; }
  .lk-help kbd { font:inherit; color:#4FC3E8; }
  .lk-row { display:grid; grid-template-columns:104px 1fr 58px; gap:10px; align-items:center; padding:5px 0; }
  .lk-row label { font-size:11px; color:#B8B8B8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lk-fader { position:relative; height:18px; cursor:ew-resize; touch-action:none; }
  .lk-fader i { position:absolute; left:0; right:0; top:7px; height:3px; background:#262626; }
  .lk-fader b { position:absolute; left:0; top:7px; height:3px; background:#E0E0E0; }
  .lk-val { width:100%; box-sizing:border-box; background:#1B1B1B; color:#E0E0E0; border:1px solid #262626; border-radius:3px; padding:2px 5px; font:11px Geist,"Segoe UI",system-ui,sans-serif; text-align:right; }
  .lk-sel { grid-column:2 / 4; background:#1B1B1B; color:#E0E0E0; border:1px solid #262626; border-radius:3px; padding:3px 5px; font:11px Geist,"Segoe UI",system-ui,sans-serif; }
  .lk-tog { grid-column:2 / 4; text-align:left; cursor:pointer; color:#E0E0E0; font-size:11px; }
  .lk-tog span { display:inline-block; width:26px; height:3px; margin-right:8px; vertical-align:middle; background:#262626; }
  .lk-tog.on span { background:#4FC3E8; }
  .lk-vol { position:fixed; right:16px; top:12px; width:200px; display:grid; grid-template-columns:52px 1fr 40px; gap:8px; align-items:center; padding:4px 10px; background:rgba(17,17,17,.7); border:1px solid #262626; border-radius:6px; z-index:2147483602; font:10px/1.4 Geist,"Segoe UI",system-ui,sans-serif; color:#B8B8B8; letter-spacing:.12em; text-transform:uppercase; }
  .lk-vol span:last-child { text-align:right; color:#E0E0E0; letter-spacing:0; }
  body.lk-capture .lk-hud, body.lk-capture .lk-hint, body.lk-capture .lk-help, body.lk-capture .lk-params, body.lk-capture .lk-vol { display:none !important; }
  `;

  // ------------------------------------------------------------------------------------------------ the stage
  /**
   * opt: { title, fixedStrip (the page's strip is where view() says; F only toggles the overlay), view: () => {x,y,w,h} in CSS px,
   *   backdrop (paint the strip: pages with no picture of their own), help: [[key, text]], demo (default true), onSound, onKey(k, e),
   *   onChange (hands changed) }
   * Reserved keys: F overlay / strip · B body scale · H help · D demo hands · G demo group size · R remove pinned hands ·
   *   L lidar feel (the runtime reads stage.lidar) · S sound on/off (onSound) · P parameters panel · C cursor visible.
   * Hands: stage.hands() → [{ id, s, t, wallId, u, v, xm, ym, size (m), pinned, demo }]; s = strip fraction (0..1, wraps),
   *   t = top-down fraction (0 = top of the image), v = 0..1 up from the floor, xm / ym metres on the wall.
   *   Events: stage.on('down' | 'move' | 'up', fn).
   */
  function createStage(opt = {}) {
    const CAPTURE = q.has('capture');
    if (CAPTURE) document.body.classList.add('lk-capture');
    const st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    const rnd = mulberry(q.has('seed') ? Number(q.get('seed')) : (Date.now() ^ 0x9e3779b9));
    const S = {
      overlay: !CAPTURE && (opt.fixedStrip ? q.get('overlay') !== '0' : q.has('strip')),
      strip: !!opt.fixedStrip || q.has('strip'), body: q.has('body'), help: false, demo: opt.demo !== false && q.get('demo') !== '0' && !document.documentElement.hasAttribute('data-lk-nodemo'),   // <html data-lk-nodemo>: a page can switch the demo hands off
      group: Math.max(1, Number(q.get('group')) || 1), lidar: q.has('lidar'), soundOn: true, fps: 60, cursor: true,
    };
    const hands = new Map(); let seq = 1, pinSeq = 1, lastInput = performance.now(), levels = null;
    const subs = { down: new Set(), move: new Set(), up: new Set() };
    const fire = (type, h) => { for (const fn of subs[type]) { try { fn(h); } catch (e) { console.error(e); } } opt.onChange?.(); };

    // ---- layout
    const rect = () => {
      if (opt.view) return opt.view();
      const W = innerWidth, H = innerHeight;
      if (!S.strip) return { x: 0, y: 0, w: W, h: H };
      const h = Math.min(H, W / (STRIP.width / STRIP.height));
      return { x: 0, y: (H - h) / 2, w: h * (STRIP.width / STRIP.height), h };
    };
    const metrics = () => { const r = rect(); return { r, kyM: r.h / WALL_H, kxS: r.w / STRIP.width }; };

    // ---- hands
    function place(h, s, t) {
      h.s = ((s % 1) + 1) % 1; h.t = clamp(t, 0, 1);
      Object.assign(h, ROOM.locate(h.s, h.t));
    }
    function addHand(key, s, t, o = {}) {
      const h = { id: seq++, key, size: 0.12, pinned: !!o.pinned, demo: !!o.demo };
      place(h, s, t); hands.set(key, h); fire('down', h); return h;
    }
    function moveHand(key, s, t) { const h = hands.get(key); if (!h) return; place(h, s, t); fire('move', h); }
    function releaseHand(key) { const h = hands.get(key); if (!h) return; hands.delete(key); fire('up', h); }
    const fromEvent = (e) => { const { r } = metrics(); const s = (e.clientX - r.x) / r.w, t = (e.clientY - r.y) / r.h; return { s, t, ok: s >= 0 && s <= 1 && t >= 0 && t <= 1 }; };

    addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('.lk-help,.lk-params,.lk-vol')) return;
      lastInput = performance.now(); onFirstGesture();
      if (e.target.closest?.('[data-lk-ignore]')) return;              // a page that maps its own pointer to hands (review rows, the 3D room)
      const p = fromEvent(e); if (!p.ok) return;
      if (e.shiftKey) { // pin / unpin
        let hit = null, bd = 1e9;
        for (const h of hands.values()) { if (!h.pinned) continue; const d = Math.hypot(wrapD(h.s - p.s) * PERIMETER, (h.t - p.t) * WALL_H); if (d < bd) { bd = d; hit = h; } }
        if (hit && bd < 0.45) releaseHand(hit.key); else addHand('pin' + (pinSeq++), p.s, p.t, { pinned: true });
        return;
      }
      if (HOVER && e.pointerType === 'mouse') return;                  // ?hover: the mouse is already a hand while it is over the strip
      releaseDemo(); addHand('p' + e.pointerId, p.s, p.t);
    });
    // ?hover (25-11, Beltrán): the mouse is a hand just by passing over the strip, as a hand near the wall in the room (no click); left
    // still over a target it is a still hand; leaving the strip (or the window) lifts it. Touch and pen keep press = hand.
    const HOVER = q.has('hover');
    addEventListener('pointermove', (e) => {
      const key = 'p' + e.pointerId;
      if (HOVER && e.pointerType === 'mouse' && !e.target.closest?.('.lk-help,.lk-params,.lk-vol,[data-lk-ignore]')) {
        const p = fromEvent(e); lastInput = performance.now();
        if (!p.ok) { releaseHand(key); return; }
        if (hands.has(key)) moveHand(key, p.s, p.t); else { releaseDemo(); addHand(key, p.s, p.t); }
        return;
      }
      if (!hands.has(key)) return;
      lastInput = performance.now(); const p = fromEvent(e); moveHand(key, p.s, p.t);
    });
    const up = (e) => { if (HOVER && e.pointerType === 'mouse') return; lastInput = performance.now(); releaseHand('p' + e.pointerId); };
    addEventListener('pointerup', up); addEventListener('pointercancel', (e) => releaseHand('p' + e.pointerId));
    document.addEventListener('pointerleave', (e) => { if (HOVER) releaseHand('p' + e.pointerId); });
    addEventListener('blur', () => { if (HOVER) for (const k of [...hands.keys()]) if (k.startsWith('p') && !k.startsWith('pin')) releaseHand(k); });
    function wrapD(d) { return d - Math.round(d); }

    // ---- virtual hands at human speed (a hand: ≤ 1 m/s; a walker's sweep 0.7 m/s; rests of 1–4 s). Group size with G.
    const demoHands = Array.from({ length: 8 }, (_, i) => ({ key: 'demo' + i, wait: 0.2 + i * 0.7, act: null }));
    function releaseDemo() { for (const d of demoHands) { if (d.act) { releaseHand(d.key); d.act = null; d.wait = 1 + rnd() * 2; } } }
    function demoStep(dt, on) {
      for (let i = 0; i < demoHands.length; i++) {
        const d = demoHands[i];
        if (!on || i >= S.group) { if (d.act) { releaseHand(d.key); d.act = null; } continue; }
        if (d.act) {
          const A = d.act; A.t += dt; const k = clamp(A.t / A.dur, 0, 1), e = A.ease ? smooth(k) : k;
          const wob = A.wob * Math.sin(k * Math.PI * 2 + A.ph);
          const pm = A.pm0 + A.dx * e, ym = clamp(A.ym0 + A.dy * e + wob, 0.45, 2.3);
          const loc = ROOM.perim(pm), p = ROOM.toStrip(loc.wallId, loc.xm, ym);
          moveHand(d.key, p.s, p.t);
          if (k >= 1) { releaseHand(d.key); d.act = null; d.wait = 1 + rnd() * 3; }
          continue;
        }
        d.wait -= dt; if (d.wait > 0) continue;
        const r = rnd(), pm0 = rnd() * PERIMETER, ym0 = 0.95 + rnd() * 0.85; let A;
        if (r < 0.4) A = { dx: 0, dy: 0, dur: 0.6 + rnd() * 2, ease: false, wob: 0.02 };                                                    // a held touch
        else if (r < 0.85) { const len = 0.4 + rnd() * 1.0, ang = (rnd() - 0.5) * 1.2, dur = len / (0.25 + rnd() * 0.3); A = { dx: Math.cos(ang) * len * (rnd() < 0.5 ? -1 : 1), dy: Math.sin(ang) * len * 0.6, dur, ease: true, wob: 0.04 }; } // a stroke
        else { const len = 2.5 + rnd() * 3, dir = rnd() < 0.5 ? -1 : 1; A = { dx: dir * len, dy: 0, dur: len / 0.7, ease: false, wob: 0.05 }; } // a walker's sweep
        let start = pm0;
        if (r >= 0.85 && rnd() < 0.5) start = (PERIMETER - 1.5 + rnd()) % PERIMETER; // starts near the end of P3: crosses P3 → P4
        Object.assign(A, { t: 0, pm0: start, ym0, ph: rnd() * 6.28 });
        d.act = A;
        const loc = ROOM.perim(start), p = ROOM.toStrip(loc.wallId, loc.xm, ym0);
        addHand(d.key, p.s, p.t, { demo: true });
      }
    }

    // ---- keys
    const keyfns = [];
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '')) return;
      const k = e.key.toLowerCase(); lastInput = performance.now();
      if (k === 'f') { if (opt.fixedStrip) S.overlay = !S.overlay; else { S.strip = !S.strip; S.overlay = S.strip; opt.onLayout?.(); } }
      else if (k === 'b') S.body = !S.body;
      else if (k === 'h') { S.help = !S.help; helpEl.style.display = S.help ? 'block' : 'none'; }
      else if (k === 'd') { S.demo = !S.demo; if (!S.demo) releaseDemo(); }
      else if (k === 'g') { S.group = S.group === 1 ? 2 : S.group === 2 ? 4 : S.group === 4 ? 8 : 1; }
      else if (k === 'r') { for (const h of [...hands.values()]) if (h.pinned) releaseHand(h.key); }
      else if (k === 'l') { S.lidar = !S.lidar; opt.onLidar?.(S.lidar); }
      else if (k === 's') { S.soundOn = !S.soundOn; opt.onSound?.(S.soundOn); }
      else if (k === '-' || k === '_') setVolume(VOLUME - 0.05);
      else if (k === '=' || k === '+') setVolume(VOLUME + 0.05);
      else if (k === 'p') { if (paramsEl) paramsEl.style.display = paramsEl.style.display === 'block' ? 'none' : 'block'; }
      else if (k === 'c') { S.cursor = !S.cursor; document.documentElement.style.cursor = S.cursor ? '' : 'none'; }
      else { opt.onKey?.(k, e); for (const fn of keyfns) fn(k, e); }
    });

    // ---- DOM: HUD, hint, help, overlay canvas
    const hud = el('div'); hud.className = 'lk-hud'; document.body.appendChild(hud);
    const hint = el('div'); hint.className = 'lk-hint'; document.body.appendChild(hint);
    hint.innerHTML = (opt.hint || 'Click = a hand') + ' &nbsp;·&nbsp; Shift+click pins a hand &nbsp;·&nbsp; F room &nbsp;·&nbsp; B body scale &nbsp;·&nbsp; H help';
    const helpEl = el('div'); helpEl.className = 'lk-help'; document.body.appendChild(helpEl);
    const keysList = [['Click / drag', 'a hand (touch)'], ['Shift + click', 'pin a hand · again to remove'], ['F', opt.fixedStrip ? 'room overlay on / off' : 'room strip / full window'], ['B', 'body scale: 1.70 m adult, child, reach'],
      ['D', 'virtual hands at human speed'], ['G', 'virtual group: 1 · 2 · 4 · 8'], ['R', 'remove pinned hands'], ['L', 'LiDAR feel: 10 Hz, 150 ms late, missed readings'],
      ['S', 'sound on / off'], ['- / +', 'listening volume (also the fader, top right)'], ['P', 'parameters'], ['C', 'cursor on / off'], ...(opt.help || [])];
    helpEl.innerHTML = '<h4>Controls</h4>' + keysList.map(([a, b]) => `<div class="r"><span><kbd>${a}</kbd></span><span>${b}</span></div>`).join('') +
      '<div style="margin-top:8px;font-size:11px">With no input for 4 s the virtual hands play. The surface wraps: P3 continues into P4.</div>';
    const volEl = el('div'); volEl.className = 'lk-vol'; volEl.title = 'Listening volume ( - / + )';
    volEl.innerHTML = '<span>Volume</span><div class="lk-fader"><i></i><b></b></div><span></span>'; document.body.appendChild(volEl);
    const volFader = volEl.children[1], volVal = volEl.children[2];
    const paintVol = (v) => { volFader.lastChild.style.width = v * 100 + '%'; volVal.textContent = Math.round(v * 100) + '%'; };
    volViews.add(paintVol); paintVol(VOLUME);
    volFader.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); volFader.setPointerCapture(e.pointerId);
      const at = (ev) => { const b = volFader.getBoundingClientRect(); setVolume((ev.clientX - b.left) / b.width); };
      at(e); const mv = (ev) => at(ev); volFader.addEventListener('pointermove', mv);
      volFader.addEventListener('pointerup', () => volFader.removeEventListener('pointermove', mv), { once: true });
    });
    const cv = el('canvas', 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483500'); document.body.appendChild(cv);
    const g = cv.getContext('2d'); let dpr = 1;
    const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); };
    addEventListener('resize', fit); fit();
    document.documentElement.style.touchAction = 'none'; document.body.style.touchAction = 'none';

    let paramsEl = null;
    let gesture = false; const gestureFns = [];
    function onFirstGesture() { if (gesture) return; gesture = true; hint.style.opacity = 0; for (const f of gestureFns) { try { f(); } catch (e) { console.error(e); } } }

    // ---- drawing
    const AMBER = '229,181,103', CYAN = '79,195,232';
    function label(txt, x, y, color, align) { g.fillStyle = color; g.textAlign = align || 'center'; g.fillText(txt, x, y); }
    function drawOverlay(r) {
      g.save(); g.font = '10px Geist, "Segoe UI", system-ui, sans-serif';
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(r.x, r.y + .5); g.lineTo(r.x + r.w, r.y + .5); g.moveTo(r.x, r.y + r.h - .5); g.lineTo(r.x + r.w, r.y + r.h - .5); g.stroke();
      WALLS.forEach((w, i) => {
        const x0 = r.x + (w.x / STRIP.width) * r.w, x1 = r.x + ((w.x + w.w) / STRIP.width) * r.w;
        if (i > 0) { g.strokeStyle = `rgba(${AMBER},.55)`; g.beginPath(); g.moveTo(x0 + .5, r.y - 10); g.lineTo(x0 + .5, r.y + r.h + 10); g.stroke(); }
        label(`${w.id}  ·  ${w.width.toFixed(2)} m`, (x0 + x1) / 2, r.y - 12, `rgb(${AMBER})`);
      });
      label('← P3 continues here (seamless wrap)', r.x + 4, r.y + r.h + 24, 'rgba(184,184,184,.8)', 'left');
      label(`${STRIP.width} × ${STRIP.height} · wraps to P4 →`, r.x + r.w - 4, r.y + r.h + 24, 'rgba(184,184,184,.8)', 'right');
      g.restore();
    }
    function drawHands(r) {
      g.save();
      for (const h of hands.values()) {
        const x = r.x + h.s * r.w, y = r.y + h.t * r.h, rad = Math.max(5, (h.size / WALL_H) * r.h);
        g.strokeStyle = `rgba(${CYAN},${h.pinned ? .95 : .6})`; g.lineWidth = 1.2;
        g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.stroke();
        if (h.pinned) { g.beginPath(); g.arc(x, y, 1.6, 0, 6.2832); g.fillStyle = `rgb(${CYAN})`; g.fill(); }
      }
      g.restore();
    }
    function figure(x, floor, hM, kx, ky, handY) { // a stylised person standing at x (px), true metres on both axes
      g.beginPath();
      const hd = 0.105 * hM / 1.7;
      g.ellipse(x, floor - (hM - hd - 0.02) * ky, hd * kx, hd * ky, 0, 0, 6.2832);
      const sh = floor - hM * 0.82 * ky, hip = floor - hM * 0.53 * ky, wd = 0.2 * hM / 1.7 * kx;
      g.moveTo(x - wd, sh); g.lineTo(x + wd, sh); g.lineTo(x + wd * 0.8, hip); g.lineTo(x - wd * 0.8, hip); g.closePath();
      g.moveTo(x - wd * 0.45, hip); g.lineTo(x - wd * 0.45, floor); g.moveTo(x + wd * 0.45, hip); g.lineTo(x + wd * 0.45, floor);
      g.moveTo(x + wd, sh + 3); g.lineTo(x + wd * 1.9, floor - handY * ky);   // the arm reaching the wall
      g.stroke();
      g.beginPath(); g.arc(x + wd * 1.9, floor - handY * ky, 0.05 * Math.min(kx, ky) * 1.0 + 3, 0, 6.2832); g.strokeStyle = `rgba(${CYAN},.9)`; g.stroke();
    }
    function drawBody(r) {
      const { kyM } = metrics(); g.save(); g.font = '10px Geist, "Segoe UI", system-ui, sans-serif'; g.lineWidth = 1.2;
      const H = ROOM.human;
      WALLS.forEach((w) => {
        const x0 = r.x + (w.x / STRIP.width) * r.w, ww = (w.w / STRIP.width) * r.w, kx = ww / w.width, ky = kyM, floor = r.y + r.h;
        const band = (a, b, col, dash, txt, right) => {
          g.fillStyle = `rgba(${col},.06)`; g.fillRect(x0, floor - b * ky, ww, (b - a) * ky);
          g.strokeStyle = `rgba(${col},.55)`; g.setLineDash(dash);
          g.beginPath(); g.moveTo(x0, floor - a * ky); g.lineTo(x0 + ww, floor - a * ky); g.moveTo(x0, floor - b * ky); g.lineTo(x0 + ww, floor - b * ky); g.stroke(); g.setLineDash([]);
          label(txt, right ? x0 + ww - 6 : x0 + 6, floor - b * ky - 4, `rgba(${col},.95)`, right ? 'right' : 'left');
        };
        band(H.reach[0], H.reach[1], AMBER, [5, 4], 'adult reach 0.8 – 2.0 m', false);
        band(H.reachChild[0], H.reachChild[1], CYAN, [2, 3], 'children 0.6 – 1.4 m', true);
        g.strokeStyle = `rgba(${AMBER},.7)`; g.setLineDash([2, 5]); g.beginPath(); g.moveTo(x0, floor - H.verticalMax * ky); g.lineTo(x0 + ww, floor - H.verticalMax * ky); g.stroke(); g.setLineDash([]);
        label('3.0 m · top of vertical mappings', x0 + ww / 2, floor - H.verticalMax * ky - 4, `rgba(${AMBER},.9)`);
        g.strokeStyle = 'rgba(224,224,224,.6)';
        figure(x0 + ww * 0.22, floor, H.adult, kx, ky, 1.3); label('1.70 m', x0 + ww * 0.22, floor + 14, 'rgba(224,224,224,.8)');
        figure(x0 + ww * 0.55, floor, H.child, kx, ky, 0.95); label('child 1.20 m', x0 + ww * 0.55, floor + 14, 'rgba(224,224,224,.8)');
        const tx = x0 + ww * 0.82, ts = H.target; g.strokeStyle = `rgba(${CYAN},.7)`; g.strokeRect(tx - ts * kx / 2, floor - 1.3 * ky - ts * ky / 2, ts * kx, ts * ky); label('40 cm target', tx, floor - 1.3 * ky + ts * ky / 2 + 12, `rgba(${CYAN},.9)`);
        const sx = x0 + ww * 0.22; g.strokeStyle = 'rgba(184,184,184,.6)'; g.beginPath(); g.moveTo(sx - H.spot / 2 * kx, floor - 6); g.lineTo(sx + H.spot / 2 * kx, floor - 6); g.stroke(); label('one spot ≈ 1.6 m', sx, floor - 10, 'rgba(184,184,184,.85)');
      });
      g.restore();
    }
    function drawMeters() {
      if (!levels) return; const L = levels(); const W = innerWidth, H = innerHeight;
      g.save(); g.font = '9px Geist, "Segoe UI", system-ui, sans-serif';
      L.forEach((m, i) => {
        const x = W - 16 - (L.length - i) * 26 + 10, base = H - 34, hh = 26 * Math.sqrt(clamp(m.level, 0, 1));
        g.fillStyle = '#262626'; g.fillRect(x, base - 26, 3, 26);
        g.fillStyle = m.id === 'SUB' ? `rgb(${AMBER})` : '#E0E0E0'; g.fillRect(x, base - hh, 3, hh);
        g.fillStyle = 'rgba(184,184,184,.8)'; g.textAlign = 'center'; g.fillText(m.id, x + 1.5, base + 12);
      });
      g.restore();
    }
    let frames = 0, tFps = performance.now();
    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
      if (CAPTURE) return;
      const r = rect();
      if (opt.backdrop) { // a page with no picture of its own: the strip as a dark panel with a 0.5 m grid
        g.fillStyle = '#0b0d10'; g.fillRect(r.x, r.y, r.w, r.h);
        const ky = r.h / WALL_H; g.strokeStyle = 'rgba(255,255,255,.035)'; g.beginPath();
        for (let m = 0.5; m < WALL_H; m += 0.5) { const y = r.y + r.h - m * ky; g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); } g.stroke();
      }
      if (S.overlay || opt.backdrop) drawOverlay(r);
      if (S.overlay) drawHands(r);
      if (S.body) drawBody(r);
      drawMeters();
      const mode = S.lidar ? 'LiDAR feel' : 'direct';
      hud.innerHTML = `<b>${opt.title || 'Experiment'}</b> &nbsp;·&nbsp; ${hands.size} hand${hands.size === 1 ? '' : 's'} &nbsp;·&nbsp; ${S.fps.toFixed(0)} fps &nbsp;·&nbsp; ${mode}${S.demo ? ` &nbsp;·&nbsp; demo ×${S.group}` : ''}${S.soundOn ? '' : ' &nbsp;·&nbsp; muted'}`;
    }

    // ---- API
    const stage = {
      ROOM, state: S, rect, rnd,
      get lidar() { return S.lidar; }, get soundOn() { return S.soundOn; }, get overlay() { return S.overlay; },
      hands: () => [...hands.values()],
      /** lab tools (simulations): put a scripted hand by key at s (strip fraction) / t (top-down fraction), or lift it */
      put(key, s, t) { if (hands.has(key)) moveHand(key, s, t); else { addHand(key, s, t); lastInput = performance.now(); } },
      lift(key) { releaseHand(key); },
      on(type, fn) { subs[type].add(fn); return () => subs[type].delete(fn); },
      onKey(fn) { keyfns.push(fn); },
      onGesture(fn) { if (gesture) fn(); else gestureFns.push(fn); },
      /** call once per frame with dt (seconds): advances the virtual hands, draws the overlay, measures fps */
      step(dt) {
        const idle = performance.now() - lastInput > 4000;
        demoStep(dt, S.demo && idle && !CAPTURE_NODEMO);
        frames++; const now = performance.now(); if (now - tFps > 500) { S.fps = (frames * 1000) / (now - tFps); frames = 0; tFps = now; }
        draw();
        if (hands.size && now - lastInput < 1500) hint.style.opacity = 0;
      },
      addMeters(fn) { levels = fn; },
      /** a parameters panel: defs = manifest `params` ([{key,label,type:'number'|'select'|'bool',min,max,step,default,options}]), values = the live object */
      params(defs, values, onChange) {
        if (paramsEl) paramsEl.remove();
        paramsEl = el('div'); paramsEl.className = 'lk-params'; paramsEl.innerHTML = '<h4>Parameters · P</h4>'; document.body.appendChild(paramsEl);
        for (const d of defs) {
          const row = el('div'); row.className = 'lk-row';
          const lab = el('label', '', d.label || d.key); row.appendChild(lab);
          const set = (v) => { values[d.key] = v; onChange?.(d.key, v, values); };
          if (d.type === 'number') {
            const f = el('div'); f.className = 'lk-fader'; f.innerHTML = '<i></i><b></b>';
            const val = el('input'); val.className = 'lk-val';
            const min = d.min ?? 0, max = d.max ?? 1, step = d.step || (max - min) / 100;
            const paint = () => { f.lastChild.style.width = ((values[d.key] - min) / (max - min || 1)) * 100 + '%'; val.value = String(Math.round(values[d.key] * 1000) / 1000) + (d.unit ? ' ' + d.unit : ''); };
            const apply = (v) => { v = clamp(Math.round(v / step) * step, min, max); set(Number(v.toFixed(6))); paint(); };
            f.addEventListener('pointerdown', (e) => { f.setPointerCapture(e.pointerId); const mv = (ev) => { const b = f.getBoundingClientRect(); apply(min + clamp((ev.clientX - b.left) / b.width, 0, 1) * (max - min)); }; mv(e); f.onpointermove = mv; f.onpointerup = () => { f.onpointermove = null; }; });
            val.addEventListener('change', () => { const n = parseFloat(val.value); if (Number.isFinite(n)) apply(n); else paint(); });
            row.appendChild(f); row.appendChild(val); paint();
          } else if (d.type === 'select') {
            const s = el('select'); s.className = 'lk-sel';
            for (const [v, t] of (d.options || [])) { const o = el('option', '', t); o.value = v; s.appendChild(o); }
            s.value = values[d.key]; s.onchange = () => set(s.value); row.appendChild(s);
          } else if (d.type === 'bool') {
            const t = el('div'); t.className = 'lk-tog' + (values[d.key] ? ' on' : ''); t.innerHTML = '<span></span>' + (values[d.key] ? 'on' : 'off');
            t.onclick = () => { set(!values[d.key]); t.className = 'lk-tog' + (values[d.key] ? ' on' : ''); t.innerHTML = '<span></span>' + (values[d.key] ? 'on' : 'off'); };
            row.appendChild(t);
          } else continue;
          paramsEl.appendChild(row);
        }
        return paramsEl;
      },
    };
    const CAPTURE_NODEMO = false;
    return stage;
  }

  // ------------------------------------------------------------------------------------------------ a simulated 4.1 room
  /**
   * The `audio` object of experiences/SOUND-API.md over a stereo preview of the room: 4 wall channels (P4 P1 P2 P3, one speaker
   * each) and a sub (everything below ~110 Hz). Meters per channel (stage.addMeters(room.levels)). The limiter is a compressor
   * at -6 dB: a piece that is too loud shows here. The preview pans the walls P4 left … P3 right: it tells you WHICH wall sounds,
   * not how the real speakers will sound.
   */
  function createRoomAudio(opt = {}) {
    const AC = root.AudioContext || root.webkitAudioContext;
    const ctx = new AC({ sampleRate: 48000, latencyHint: 'interactive' });
    const master = ctx.createGain(); master.gain.value = opt.master ?? 0.8;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    const vol = ctx.createGain(); vol.gain.value = VOLUME * VOLUME;               // a squared law: the fader feels even
    master.connect(lim); lim.connect(vol); vol.connect(ctx.destination);
    volRooms.add({ applyVolume() { vol.gain.setTargetAtTime(VOLUME * VOLUME, ctx.currentTime, 0.03); } });
    const analyser = () => { const a = ctx.createAnalyser(); a.fftSize = 1024; return a; };
    const subSum = ctx.createGain(); const lp1 = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter();
    for (const f of [lp1, lp2]) { f.type = 'lowpass'; f.frequency.value = 110; f.Q.value = 0.707; }
    const subBus = ctx.createGain(), subAn = analyser(); subSum.connect(lp1); lp1.connect(lp2); lp2.connect(subBus); subBus.connect(subAn); subBus.connect(master);
    const pans = { P4: -0.8, P1: -0.3, P2: 0.3, P3: 0.8 }, bus = {}, an = {};
    for (const w of WALLS) {
      const b = ctx.createGain(), hp = ctx.createBiquadFilter(), pn = ctx.createStereoPanner(), a = analyser();
      hp.type = 'highpass'; hp.frequency.value = 70; pn.pan.value = pans[w.id];
      b.connect(hp); hp.connect(a); hp.connect(pn); pn.connect(master); hp.connect(subSum);
      bus[w.id] = b; an[w.id] = a;
    }
    const buf = new Float32Array(1024);
    const peak = (a) => { a.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; } return m; };
    const smoothL = {}; const ids = ['P4', 'P1', 'P2', 'P3', 'SUB'];
    const audio = {
      ctx,
      walls: WALLS.map((w) => ({ id: w.id, name: w.name, speakers: 1 })),
      wallInput(wallId, u = 0.5) {
        const node = ctx.createGain(); let pos = u;
        if (bus[wallId]) node.connect(bus[wallId]);
        return { node, setPosition(v) { pos = v; }, get position() { return pos; }, disconnect() { try { node.disconnect(); } catch { /* gone */ } } };
      },
      roomInput() { const n = ctx.createGain(); n.gain.value = 0.7; for (const w of WALLS) n.connect(bus[w.id]); return n; },
      subInput() { const n = ctx.createGain(); n.connect(subSum); return n; },
    };
    return {
      audio, ctx, master,
      resume() { return ctx.state === 'running' ? Promise.resolve() : ctx.resume(); },
      setOn(on) { master.gain.setTargetAtTime(on ? (opt.master ?? 0.8) : 0, ctx.currentTime, 0.05); },
      levels() {
        return ids.map((id) => { const p = peak(id === 'SUB' ? subAn : an[id]); smoothL[id] = Math.max(p, (smoothL[id] || 0) * 0.92); return { id, level: smoothL[id] }; });
      },
      /** the same buffer, for pieces that want an impulse response of their own */
      noise(seconds = 2) { const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; },
    };
  }

  root.LabKit = { ROOM, createStage, createRoomAudio, util: { clamp, lerp, smooth, mulberry } };
})(typeof window !== 'undefined' ? window : globalThis);
