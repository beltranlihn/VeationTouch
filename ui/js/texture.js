// A Texture output shown full screen: the touch mask of one output (`/texture?o=<id>`), drawn by the engine's own
// rasteriser (/shared/mask.js) from the live touches with that output's settings, filling the window — keeping the
// canvas proportions (fit) or not (stretch). The desktop app opens it on the display chosen in Outputs › Texture;
// any browser can open it too (F11 for full screen). Pure black and white: nothing else is ever drawn.

import { store, on, connect } from './conn.js';
import { TouchMask } from '/shared/mask.js';

const id = new URLSearchParams(location.search).get('o');
const c = document.getElementById('c');
const g = c.getContext('2d');
const mask = new TouchMask();
const off = document.createElement('canvas');
const og = off.getContext('2d');
let img = null, lastT = null;

function output() {
  const o = store.state?.profile.outputs.find((x) => x.id === id);
  return o?.type === 'texture' ? o : null;
}

function resize() {
  const dpr = devicePixelRatio || 1;
  c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
  draw();
}
addEventListener('resize', resize);

/** A new frame of the mask for each live message (≈30 Hz), at most at the output's own rate. */
function frame() {
  const P = store.state?.profile, o = output(), L = store.live;
  if (!P || !o || !L) return;
  const w = Math.max(16, Math.round(P.canvas.width * o.scale)), h = Math.max(16, Math.round(P.canvas.height * o.scale));
  if (mask.resize(w, h)) {
    off.width = w; off.height = h;
    img = new ImageData(w, h);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    lastT = null;
  }
  if (lastT !== null && L.t >= lastT && L.t - lastT < 1000 / o.rateHz - 2) return;
  const dt = lastT === null || L.t < lastT ? 33 : Math.min(1000, L.t - lastT);
  lastT = L.t;
  const walls = P.walls.filter((x) => !o.walls.length || o.walls.includes(x.id))
    .map((wall) => ({ wall, touches: (L.walls?.[wall.id] || []).map(([, x, y, size]) => ({ x, y, size })) }));
  if (mask.render(walls, o, o.scale, dt)) {
    const m = mask.mask, d = img.data;
    for (let i = 0, j = 0; i < m.length; i++, j += 4) { const v = m[i]; d[j] = v; d[j + 1] = v; d[j + 2] = v; }
    og.putImageData(img, 0, 0);
  }
  draw();
}

function draw() {
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const o = output();
  if (!o || !o.enabled || !img) return;
  let x = 0, y = 0, w = c.width, h = c.height;
  if (o.fit !== 'stretch') { // the canvas proportions, centred, black around
    const k = Math.min(c.width / off.width, c.height / off.height);
    w = off.width * k; h = off.height * k; x = (c.width - w) / 2; y = (c.height - h) / 2;
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(off, x, y, w, h);
}

window.__tex = { frame, draw }; // UI tests: a hidden window paints no frames
on('live', frame);
on('state', draw);
resize();
connect();
