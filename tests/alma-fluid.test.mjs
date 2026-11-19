// "Alma liquid" experience (experiences/alma-fluid): the real page in a hidden Electron window (tests/ui/runner.cjs),
// with the stand-in runtime (experiences/alma-fluid/dev-runtime.js) served in place of /experiences/runtime.js.
// The page's frames are driven by the test (a hidden window paints no frames) and the pixels are read with readPixels
// in the same task as the frame. Small canvas (4 walls of 200 x 120) because WebGL may run on SwiftShader.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'experiences', 'alma-fluid');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain' };

/** A tiny static server for experiences/: the stand-in runtime answers for /experiences/runtime.js. */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = decodeURIComponent(url.pathname);
      if (file === '/experiences/runtime.js') file = '/experiences/alma-fluid/dev-runtime.js';
      const abs = path.join(root, file);
      if (!file.startsWith('/experiences/') || !abs.startsWith(path.join(root, 'experiences')) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// every page script starts with this: wait for the experience, then helpers to drive frames and read pixels
const PRELUDE = `
  const vt = await (async () => { for (let k = 0; k < 200; k++) { if (window.__vtDev && window.__vtDev.ready && window.__almaFluid && window.__almaFluid.ready) return window.__vtDev; await new Promise((r) => setTimeout(r, 50)); } throw new Error('the experience did not start'); })();
  const gl = vt.gl, W = vt.size.width, H = vt.size.height;
  // pixels of a region (canvas coordinates, y down) as RGBA bytes — call it in the same task as the frame
  const read = (x, y, w, h) => { const a = new Uint8Array(w * h * 4); gl.readPixels(x, H - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a); return Array.from(a); };
  const sumDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) s += Math.abs(a[i] - b[i]); return s; };
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  // pixels that are almost white in a wall's centre region (the white wordmark over the pale blue liquid)
  const white = (id) => { const w = vt.walls.find((x) => x.id === id).rect; const p = read(w.x + Math.round(w.w * 0.15), Math.round(H * 0.2), Math.round(w.w * 0.7), Math.round(H * 0.6)); let n = 0; for (let i = 0; i < p.length; i += 4) if (p[i] > 235 && p[i + 1] > 235 && p[i + 2] > 235) n++; return n; };
  const touch = (type, id, x, y, extra = {}) => vt.emit('touch', { type, id, wallId: 'P1', x, y, vx: 0, vy: 0, size: 30, ...extra });
`;

async function inPage(script, query = '') {
  const { server, port } = await serve();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alma-fluid-'));
  const file = path.join(tmp, 'script.js');
  fs.writeFileSync(file, PRELUDE + script);
  try {
    const args = [path.join(root, 'tests', 'ui', 'runner.cjs'), `--url=http://127.0.0.1:${port}/experiences/alma-fluid/index.html?${query}`, `--script=${file}`, '--wait=load'];
    const outText = await new Promise((resolve, reject) => {
      const p = spawn(electronPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('error', reject);
      p.on('exit', () => resolve(buf));
    });
    const line = outText.split('\n').find((l) => l.startsWith('UI-RESULT ') || l.startsWith('UI-ERROR '));
    if (!line) throw new Error(`no result from the runner: ${outText.slice(0, 500)}`);
    const data = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (line.startsWith('UI-ERROR')) throw new Error(`page script failed: ${data.message} ${JSON.stringify(data.errors || [])}`);
    assert.deepEqual(data.errors, [], `page errors: ${data.errors.join(' | ')}`);
    return data.result;
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const asQuery = (o) => `params=${encodeURIComponent(JSON.stringify(o))}`;

/* ------------------------------------------------------------------ the package itself (no browser) */

test('alma-fluid: manifest, assets and licence are in place', () => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.id, 'alma-fluid');
  assert.equal(m.name, 'Alma liquid');
  assert.equal(m.entry, 'index.html');
  assert.deepEqual(m.params.map((p) => p.key), ['turbulence', 'touchColor', 'emitters', 'emitterSpeed', 'fade', 'quality', 'wrap', 'logo', 'logoWall', 'logoStyle', 'logoSize', 'breathing']);
  assert.equal(m.params.find((p) => p.key === 'wrap').default, 'auto', '360° follows the room unless the operator says otherwise');
  for (const p of m.params) {
    assert.ok(['number', 'select', 'bool', 'wall'].includes(p.type), `${p.key}: type ${p.type}`);
    assert.ok(p.label && /^[\x20-\x7e]+$/.test(p.label), `${p.key}: English label`);
    if (p.type === 'number') assert.ok(p.default >= p.min && p.default <= p.max && p.step > 0, `${p.key}: default inside its range`);
    if (p.type === 'select') assert.ok(p.options.some(([v]) => v === p.default), `${p.key}: default is one of the options`);
  }
  assert.equal(m.params.find((p) => p.key === 'emitters').max, 24);
  assert.equal(m.params.find((p) => p.key === 'logoWall').default, null);
  for (const f of ['index.html', 'fluid.js', 'experience.js', 'logo.js', 'LICENSE-fluid.txt', 'assets/logo-wordmark.png', 'assets/logo-blob.png', 'assets/LDR_LLL1_0.png']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} exists`);
  }
  assert.match(fs.readFileSync(path.join(dir, 'LICENSE-fluid.txt'), 'utf8'), /MIT License[\s\S]*Pavel Dobryakov/);
  assert.match(fs.readFileSync(path.join(dir, 'fluid.js'), 'utf8'), /PavelDoGreat\/WebGL-Fluid-Simulation/);
  // the fluid listens to nothing itself: input comes from the runtime
  const src = fs.readFileSync(path.join(dir, 'fluid.js'), 'utf8');
  assert.ok(!/addEventListener|requestAnimationFrame|window\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'fluid.js has no DOM listeners, rAF or window globals');
});

/* ------------------------------------------------------------------ the page */

test('alma-fluid: frames render at the requested size, in the website\'s colours', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 60, 3);
    const px = read(10, 10, 20, 20);
    const mean = [0, 1, 2].map((c) => px.filter((_, i) => i % 4 === c).reduce((a, b) => a + b, 0) / (px.length / 4));
    const cv = document.getElementById('c');
    return { cw: cv.width, ch: cv.height, dw: gl.drawingBufferWidth, dh: gl.drawingBufferHeight, W, H, mean, ctxAttrs: gl.getContextAttributes() };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  assert.deepEqual([r.cw, r.ch, r.dw, r.dh], [800, 120, 800, 120], 'the canvas and its drawing buffer are exactly vt.size');
  assert.equal(r.ctxAttrs.preserveDrawingBuffer, false);
  // empty liquid = the website's background colour (173, 200, 237), not black
  assert.ok(Math.abs(r.mean[0] - 173) < 3 && Math.abs(r.mean[1] - 200) < 3 && Math.abs(r.mean[2] - 237) < 3, `background ${r.mean}`);
});

test('alma-fluid: a touch down stirs the liquid right there and nowhere far from it', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 60, 5);
    const near = [270, 30, 60, 60], far = [680, 30, 60, 60];
    const before = [read(...near), read(...far)];
    vt.frame(1 / 60, 4); // control: no touch, nothing changes
    const control = [read(...near), read(...far)];
    touch('down', 1, 300, 60, { wallId: 'P2' });
    vt.frame(1 / 60, 4);
    const after = [read(...near), read(...far)];
    return { controlNear: sumDiff(before[0], control[0]), nearChange: sumDiff(before[0], after[0]), nearMax: maxDiff(before[0], after[0]), farChange: sumDiff(before[1], after[1]), pixels: 60 * 60 };`,
    `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  assert.equal(r.controlNear, 0, 'without a touch the empty liquid does not change');
  assert.ok(r.nearChange > r.pixels * 3, `pixels near the touch changed (${r.nearChange})`);
  assert.ok(r.nearMax > 20, `...visibly (max channel change ${r.nearMax})`);
  assert.equal(r.farChange, 0, 'pixels far from the touch did not');
});

test('alma-fluid: moving and holding a touch keep stirring', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 60, 5);
    touch('down', 1, 100, 60); vt.frame(1 / 60, 6);
    const a = read(0, 0, 400, 120);
    for (let k = 1; k <= 8; k++) { touch('move', 1, 100 + k * 12, 60, { vx: 720, vy: 0 }); vt.frame(1 / 60); }
    const b = read(0, 0, 400, 120);
    // a trail along the motion: the pixels between the start and the end changed
    const trail = sumDiff(read(130, 40, 40, 40), a.length ? readFrom(a, 130, 40, 40, 40) : []);
    function readFrom(buf, x, y, w, h) { const o = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = ((y + j) * 400 + x + i) * 4; o.push(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]); } return o; }
    // held still: a swirl every SWIRL_PERIOD changes the picture although the touch does not move
    const c0 = read(0, 0, 400, 120);
    vt.frame(0.03, 40); // 1.2 s still
    const c1 = read(0, 0, 400, 120);
    return { moved: sumDiff(a, b), trail, still: sumDiff(c0, c1) };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  assert.ok(r.moved > 5000, `moving changes the picture (${r.moved})`);
  assert.ok(r.trail > 1000, `a trail along the motion (${r.trail})`);
  assert.ok(r.still > 2000, `a held-still touch keeps swirling (${r.still})`);
});

test('alma-fluid: the logo fades in on the chosen wall (the first by default) and not on the others', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 30, 3);
    const early = white('P1');
    vt.frame(1 / 30, 110); // > 3 s
    return { early, p1: white('P1'), p2: white('P2'), p3: white('P3'), p4: white('P4') };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0 })}`);
  assert.ok(r.p1 > 25, `wordmark pixels on P1 (${r.p1})`);
  assert.deepEqual([r.p2, r.p3, r.p4], [0, 0, 0], 'no white on the other walls');
  assert.ok(r.early < r.p1 / 2, `it fades in (${r.early} after 3 frames, ${r.p1} after 3 s)`);
});

test('alma-fluid: changing "Logo wall" moves the logo, switching "Logo" off removes it', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 30, 110);
    const first = { p1: white('P1'), p3: white('P3') };
    vt.setParams({ logoWall: 'P3' });
    vt.frame(1 / 30, 2);
    const moved = { p1: white('P1'), p3: white('P3') };
    vt.setParams({ logo: false });
    vt.frame(1 / 30, 60); // fades out in 1.2 s
    const off = { p1: white('P1'), p3: white('P3') };
    vt.setParams({ logo: true, logoStyle: 'blob', logoWall: 'P2' });
    vt.frame(1 / 30, 110);
    return { first, moved, off, blobP2: white('P2') };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0 })}`);
  assert.ok(r.first.p1 > 25 && r.first.p3 === 0, 'on P1 at first');
  assert.ok(r.moved.p3 > 25 && r.moved.p1 === 0, 'on P3 after the change');
  assert.deepEqual([r.off.p1, r.off.p3], [0, 0], 'gone when off');
  assert.ok(r.blobP2 > 25, 'the wordmark + blob style draws on P2');
});

test('alma-fluid: with a closed loop a splat at the left edge also colours the far right edge', opt, async () => {
  const script = `
    vt.frame(1 / 60, 5);
    const edge = [W - 8, 30, 8, 60];
    const before = read(...edge);
    touch('down', 1, 2, 60, { wallId: 'P1', size: 40 });
    vt.frame(1 / 60, 4);
    return { right: sumDiff(before, read(...edge)), closed: vt.closedLoop };`;
  const q = (closed) => `walls=4&ww=200&wh=120&closed=${closed}&${asQuery({ emitters: 0, logo: false })}`;
  const loop = await inPage(script, q(1));
  const open = await inPage(script, q(0));
  assert.equal(loop.closed, true);
  assert.ok(loop.right > 8 * 60 * 3 * 3, `the right edge is coloured through the seam (${loop.right})`);
  assert.equal(open.right, 0, 'without a closed loop the right edge is untouched');
});

test('alma-fluid: 360° — the seam between the last wall and the first is invisible, and a hand crossing it is one short stroke', opt, async () => {
  const script = `
    // liquid everywhere (emitters) and a hand going round the corner: last wall → first wall
    vt.frame(1 / 60, 90);
    const mid0 = read(W / 2 - 60, 10, 120, 100);
    touch('down', 7, W - 30, 60, { wallId: 'P4' });
    vt.frame(1 / 60, 2);
    for (let k = 1; k <= 6; k++) { const x = (W - 30 + k * 10) % W; touch('move', 7, x, 60, { wallId: x < 200 ? 'P1' : 'P4', vx: 600, vy: 0 }); vt.frame(1 / 60); }
    vt.frame(1 / 60, 20);
    const col = (x) => read(x, 0, 1, H);
    const step = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) s += Math.abs(a[i] - b[i]); return s / (H * 3); };
    const seam = step(col(W - 1), col(0));
    const inner = []; for (const x of [100, 250, 400, 550, 700]) inner.push(step(col(x - 1), col(x)));
    // with no emitters, anything coloured in the middle of the strip (the wall opposite the corner) was drawn by
    // the crossing hand: a stroke across the whole strip instead of a step round the corner
    // (any change at all: the splats of a stroke spread over 8 steps are faint)
    const midSpread = sumDiff(mid0, read(W / 2 - 60, 10, 120, 100));
    return { seam, inner, closed: vt.closedLoop, midSpread };`;
  const loop = await inPage(script, `walls=4&ww=200&wh=120&closed=1&${asQuery({ emitters: 12, logo: false })}`);
  const open = await inPage(script, `walls=4&ww=200&wh=120&closed=0&${asQuery({ emitters: 12, logo: false })}`);
  const still = await inPage(script, `walls=4&ww=200&wh=120&closed=1&${asQuery({ emitters: 0, logo: false })}`);
  const innerMax = Math.max(...loop.inner);
  assert.equal(loop.closed, true);
  assert.ok(loop.seam <= innerMax * 2 + 1, `the seam steps no more than the liquid does elsewhere (seam ${loop.seam.toFixed(2)}, inside up to ${innerMax.toFixed(2)})`);
  assert.ok(open.seam > loop.seam, `with two ends the edges are independent (open seam ${open.seam.toFixed(2)} vs loop ${loop.seam.toFixed(2)})`);
  assert.equal(still.midSpread, 0, 'crossing the seam does not draw a stroke across the strip');
});

test('alma-fluid: params change live (emitters, quality) and the liquid survives a lost WebGL context', opt, async () => {
  const r = await inPage(`
    vt.frame(1 / 60, 60);
    const withEmitters = sumDiff(read(0, 0, W, H), new Array(W * H * 4).fill(0).map((_, i) => (i % 4 === 0 ? 173 : i % 4 === 1 ? 200 : i % 4 === 2 ? 237 : 255)));
    vt.setParams({ quality: 'high', emitters: 24, emitterSpeed: 2, fade: 2, turbulence: 2, touchColor: 'pink' });
    vt.frame(1 / 60, 5);
    touch('down', 1, 500, 60, { wallId: 'P3' }); vt.frame(1 / 60, 3);
    const ext = gl.getExtension('WEBGL_lose_context');
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 100));
    vt.frame(1 / 60, 2); // while lost: must not throw
    ext.restoreContext();
    for (let k = 0; k < 60 && gl.isContextLost(); k++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300)); // rebuilt
    for (let k = 0; k < 100 && !window.__almaFluid.ready; k++) await new Promise((r) => setTimeout(r, 50));
    vt.frame(1 / 30, 110);
    const px = read(10, 10, 20, 20);
    return { withEmitters, lost: gl.isContextLost(), r: px[0], g: px[1], logo: white('P1') };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 12 })}`);
  assert.ok(r.withEmitters > 100000, `emitters tint the liquid (${r.withEmitters})`);
  assert.equal(r.lost, false);
  assert.ok(r.r > 100 && r.g > 100, `drawing again after the restore (${r.r},${r.g})`);
  assert.ok(r.logo > 25, 'the logo is back after the restore');
});
