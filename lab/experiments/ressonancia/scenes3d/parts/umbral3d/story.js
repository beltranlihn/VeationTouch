// Ressonància — umbral3d / story (studio 25-11, Beltrán): the mosaic tells the work, abstractly. ONE continuous composition round the
// room (perimeter metres s from P4's left edge, height y from the floor), drawn once at load on a 2D canvas: a river of colour bands that
// never breaks (Gaudí's serpentine bench), its palette travelling round the room (fire → coral and turquoise → sand and ochre → gold →
// night blue → back to fire), and FIGURES that are only denser places of the same flow — the correfoc's devils and their sparks on P4,
// the sparks scattering into the heads of the pinya on P1, its linked arms becoming the bands. Each tile takes the colour at its centre:
// broken into shards, the figures read from afar and dissolve up close. (P2 / P3 carry the flow only, for now: the test is P4 → P1.)
//   const story = createStory(walls)   → story.at(s, y) = [r, g, b] linear
const K = 50;                                  // px per metre of the map
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const PAL = [                                   // [s centre (m), four tones] — blended between neighbours
  [3.6, ['#2A1A17', '#8E2B1C', '#C9531F', '#E8A15A']],      // P4: charcoal, deep red, ember, flame
  [10.5, ['#1F5D5E', '#2E8C86', '#D9734F', '#E8C9A0']],     // P1: deep teal, turquoise, coral, sand
  [17.5, ['#B9663A', '#D49A55', '#E6C38D', '#F1E2C3']],     // P2: terracotta, ochre, sand, bone
  [24.4, ['#16224A', '#2C3E7A', '#C9A04E', '#E9D6A8']],     // P3: night, cobalt, old gold, pale gold
];
export function createStory(walls) {
  const widths = walls.map((w) => w.width), P = widths.reduce((a, b) => a + b, 0), H = 4.2;
  const start = []; { let a = 0; for (const w of widths) { start.push(a); a += w; } }
  const W = Math.ceil(P * K), Hp = Math.ceil(H * K);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hp;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const X = (s) => s * K, Y = (y) => (H - y) * K;
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const tones = PAL.map((p) => p[1].map(hex));
  function palAt(s) {                           // the four tones at s, blended round the ring
    const n = PAL.length; let i = n - 1; for (let k = 0; k < n; k++) if (s >= PAL[k][0]) i = k;
    const ss = s < PAL[0][0] ? s + P : s, a = PAL[i][0], b = i + 1 < n ? PAL[i + 1][0] : PAL[0][0] + P;
    const t = Math.min(1, Math.max(0, ((ss - a) / (b - a) - 0.5) / 0.45 + 0.5)), sm = t * t * (3 - 2 * t);
    return tones[i].map((c, k) => lerp3(c, tones[(i + 1) % n][k], sm));
  }
  // 1. the river: bands that wave along the whole perimeter (periodic in s: no seam at P3 → P4)
  const img = g.createImageData(W, Hp), d = img.data, TAU = Math.PI * 2;
  for (let px = 0; px < W; px++) {
    const s = px / K, th = (s / P) * TAU, T = palAt(s);
    for (let py = 0; py < Hp; py++) {
      const y = H - py / K;
      const f = y + 0.42 * Math.sin(th * 6 + y * 0.7) + 0.16 * Math.sin(th * 13 - y * 1.1) + 0.06 * Math.sin(th * 29 + 1.3);   // long soft ribbons
      const band = Math.floor(f / 0.62 + 100) % 4, mix = 0.5 + 0.5 * Math.sin(th * 5 + f * 2.1);
      const c = band === 0 ? T[3] : band === 1 ? lerp3(T[2], T[3], 0.35 * mix) : band === 2 ? T[1] : lerp3(T[0], T[1], 0.45 * mix);
      const o = (py * W + px) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 2. P4 — the correfoc: two devils with the forca raised towards the portal, the carretilles bursting
  const s4 = start[0], w4 = widths[0];
  function burst(cx, cy, r) {                   // a carretilla: rays and sparks, pale gold → ember
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + (i % 3) * 0.07, l = r * (0.55 + 0.45 * ((i * 37) % 11) / 10);
      g.strokeStyle = i % 2 ? '#F6D9A0' : '#EFA552'; g.lineWidth = (0.018 + 0.012 * (i % 3)) * K;
      g.beginPath(); g.moveTo(X(cx + Math.cos(a) * r * 0.12), Y(cy + Math.sin(a) * r * 0.12)); g.lineTo(X(cx + Math.cos(a) * l), Y(cy + Math.sin(a) * l)); g.stroke();
    }
    g.fillStyle = '#FBE7BE'; g.beginPath(); g.arc(X(cx), Y(cy), 0.12 * K, 0, TAU); g.fill();
  }
  function devil(cx, dir) {                     // a standing devil, ~2.2 m, horns, a raised forca (dir: which way it faces)
    g.fillStyle = '#21140F'; g.strokeStyle = '#21140F'; g.lineCap = 'round';
    g.beginPath(); g.ellipse(X(cx), Y(1.05), 0.36 * K, 0.95 * K, dir * 0.08, 0, TAU); g.fill();              // body and coat
    g.beginPath(); g.ellipse(X(cx + dir * 0.05), Y(2.05), 0.2 * K, 0.24 * K, 0, 0, TAU); g.fill();         // head
    for (const h of [-1, 1]) { g.beginPath(); g.moveTo(X(cx + h * 0.08), Y(2.22)); g.quadraticCurveTo(X(cx + h * 0.24), Y(2.4), X(cx + h * 0.2), Y(2.58)); g.lineTo(X(cx + h * 0.13), Y(2.27)); g.fill(); }   // horns
    g.lineWidth = 0.1 * K; g.beginPath(); g.moveTo(X(cx - dir * 0.15), Y(1.5)); g.lineTo(X(cx + dir * 0.45), Y(2.25)); g.stroke();   // the arm
    g.lineWidth = 0.07 * K; g.beginPath(); g.moveTo(X(cx + dir * 0.2), Y(1.6)); g.lineTo(X(cx + dir * 0.85), Y(2.45)); g.stroke();   // the forca
    g.lineWidth = 0.12 * K; g.beginPath(); g.moveTo(X(cx - 0.15), Y(0.3)); g.lineTo(X(cx - 0.3), Y(0)); g.moveTo(X(cx + 0.15), Y(0.3)); g.lineTo(X(cx + 0.32), Y(0)); g.stroke();   // legs
    burst(cx + dir * 0.85, 2.45, 0.62);
  }
  devil(s4 + 1.55, 1); devil(s4 + w4 - 1.55, -1);
  // 3. the sparks scatter towards the corner and, on P1, become heads: dots growing in size and turning teal / coral
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s1 = start[1], w1 = widths[1];
  for (let i = 0; i < 260; i++) {
    const k = rnd(), s = s4 + w4 - 1.2 + k * 3.4, y = 0.6 + rnd() * 2.6, r = (0.025 + 0.06 * k * k) * K;
    g.fillStyle = k < 0.45 ? (rnd() < 0.5 ? '#F6D9A0' : '#EFA552') : k < 0.75 ? '#D9734F' : '#2E8C86';
    g.beginPath(); g.arc(X(s), Y(y), r, 0, TAU); g.fill();
  }
  // 4. P1 — the pinya: rows of heads and bodies pressed together, their arms one waving band that links them all
  const cx1 = s1 + w1 / 2;
  for (const [row, y0, n, sc, cols] of [[0, 1.95, 15, 0.85, ['#1F5D5E', '#D9734F', '#2E8C86', '#8E3B2A']], [1, 1.45, 17, 1, ['#2E8C86', '#1F5D5E', '#D9734F', '#B95A3E']], [2, 0.9, 19, 1.12, ['#D9734F', '#2E8C86', '#1F5D5E', '#C46A44']]]) {
    for (let i = 0; i < n; i++) {
      const s = s1 + 0.35 + ((i + 0.5 * (row % 2)) / n) * (w1 - 0.7); if (Math.abs(s - cx1) < 0.95) continue;
      const y = y0 + 0.06 * Math.sin(i * 1.7 + row);
      g.fillStyle = cols[(i + row) % 4];
      g.beginPath(); g.ellipse(X(s), Y(y - 0.42 * sc), 0.2 * K * sc, 0.34 * K * sc, 0, 0, TAU); g.fill();   // body
      g.beginPath(); g.arc(X(s), Y(y), 0.13 * K * sc, 0, TAU); g.fill();                                 // head
    }
    g.strokeStyle = row === 1 ? '#E8C9A0' : '#D9B07E'; g.lineWidth = 0.09 * K; g.lineCap = 'round';      // the linked arms
    g.beginPath();
    let first = true;
    for (let s = s1 + 0.2; s <= s1 + w1 - 0.2; s += 0.05) { const y = y0 - 0.2 + 0.09 * Math.sin((s - s1) * 4.2 + row * 1.3); if (first) { g.moveTo(X(s), Y(y)); first = false; } else g.lineTo(X(s), Y(y)); }
    g.stroke();
  }
  const data = g.getImageData(0, 0, W, Hp).data, lin = (v) => Math.pow(v / 255, 2.2);
  return {
    perimeter: P, start, canvas: cv,
    at(s, y) {
      const px = Math.min(W - 1, Math.max(0, Math.round((((s % P) + P) % P) * K))), py = Math.min(Hp - 1, Math.max(0, Math.round((H - y) * K)));
      const o = (py * W + px) * 4; return [lin(data[o]), lin(data[o + 1]), lin(data[o + 2])];
    },
  };
}
