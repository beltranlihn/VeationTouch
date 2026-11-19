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
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'experiences', 'alma-fluid');
let electronPath = null;
try { electronPath = (await import('electron')).default; } catch { /* not installed: page tests are skipped */ }
const opt = { skip: !electronPath && 'electron is not installed' };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain' };

/** A tiny static server for experiences/: the stand-in runtime answers for /experiences/runtime.js. */
function serve(realRuntime = false) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = decodeURIComponent(url.pathname);
      if (file === '/experiences/runtime.js' && !realRuntime) file = '/experiences/alma-fluid/dev-runtime.js';
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
  const gl = vt.gl, W = vt.size.width, H = vt.size.height; // gl is null when the page draws with WebGPU
  const cv = document.getElementById('c');
  let rc = null, rg = null;
  // pixels of a region (canvas coordinates, y down) as RGBA bytes — call it in the same task as the frame.
  // WebGL: readPixels. WebGPU: the canvas drawn into a 2D canvas (valid only in the task of the draw).
  const read = (x, y, w, h) => {
    if (gl) {
      const a = new Uint8Array(w * h * 4), out = new Array(w * h * 4);
      gl.readPixels(x, H - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a);
      for (let j = 0; j < h; j++) for (let i = 0; i < w * 4; i++) out[j * w * 4 + i] = a[(h - 1 - j) * w * 4 + i]; // GL rows run bottom-up: return them top row first, like the 2D canvas
      return out;
    }
    if (!rc) { rc = document.createElement('canvas'); rc.width = W; rc.height = H; rg = rc.getContext('2d', { willReadFrequently: true }); }
    rg.drawImage(cv, 0, 0);
    return Array.from(rg.getImageData(x, y, w, h).data);
  };
  const dev = () => window.__almaFluid;
  // mean absolute distance from the website's background colour over a region (0..255)
  const BG = [173, 200, 237];
  const deviation = (x, y, w, h) => { const p = read(x, y, w, h); let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - BG[0]) + Math.abs(p[i + 1] - BG[1]) + Math.abs(p[i + 2] - BG[2]); return s / (p.length / 4) / 3; };
  const sumDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) s += Math.abs(a[i] - b[i]); return s; };
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  // pixels that are almost white in a wall's centre region (the white wordmark over the pale blue liquid)
  const white = (id) => { const w = vt.walls.find((x) => x.id === id).rect; const p = read(w.x + Math.round(w.w * 0.15), Math.round(H * 0.2), Math.round(w.w * 0.7), Math.round(H * 0.6)); let n = 0; for (let i = 0; i < p.length; i += 4) if (p[i] > 235 && p[i + 1] > 235 && p[i + 2] > 235) n++; return n; };
  const touch = (type, id, x, y, extra = {}) => vt.emit('touch', { type, id, wallId: 'P1', x, y, vx: 0, vy: 0, size: 30, ...extra });
`;

// `raw`: the real runtime.js is served and the script gets no prelude (tests of the runtime itself)
async function inPage(script, query = '', renderer = null, { raw = false } = {}) {
  if (renderer) query += `&renderer=${renderer}`;
  const { server, port } = await serve(raw);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alma-fluid-'));
  const file = path.join(tmp, 'script.js');
  fs.writeFileSync(file, (raw ? '' : PRELUDE) + script);
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

// Every page test runs on both renderers. WebGPU tests are skipped, with the reason, when the hidden window has no adapter.
const gpuOk = electronPath ? await inPage('return !!navigator.gpu && !!(await navigator.gpu.requestAdapter());', 'walls=1').catch(() => false) : false;
const optFor = (renderer) => (renderer === 'webgpu' ? { skip: !electronPath ? 'electron is not installed' : !gpuOk && 'WebGPU is not available in the hidden Electron window (no adapter)' } : opt);
function pageTest(name, fn) {
  for (const renderer of ['webgl2', 'webgpu']) test(`${name} [${renderer}]`, optFor(renderer), () => fn((script, query = '') => inPage(script, query, renderer), renderer));
}

/* ------------------------------------------------------------------ the package itself (no browser) */

test('alma-fluid: manifest, assets and licence are in place', () => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.id, 'alma-fluid');
  assert.equal(m.name, 'Alma liquid');
  assert.equal(m.entry, 'index.html');
  assert.deepEqual(m.params.map((p) => p.key), ['turbulence', 'touchIntensity', 'touchPresence', 'touchColor', 'emitters', 'emitterSpeed', 'ambience', 'emitterSize', 'fade', 'quality', 'renderer', 'wrap', 'logo', 'logoWall', 'logoStyle', 'logoSize', 'breathing']);
  const q = m.params.find((p) => p.key === 'quality');
  assert.deepEqual(q.options.map(([v]) => v), ['low', 'medium', 'high', 'ultra'], 'ultra = the liquid at the output resolution');
  assert.equal(q.default, 'medium');
  const rr = m.params.find((p) => p.key === 'renderer');
  assert.deepEqual(rr.options.map(([v]) => v), ['auto', 'webgpu', 'webgl2']);
  assert.equal(rr.default, 'auto');
  const amb = m.params.find((p) => p.key === 'ambience'), esz = m.params.find((p) => p.key === 'emitterSize');
  assert.deepEqual([amb.min, amb.max, amb.default], [0, 2, 1]);
  assert.deepEqual([esz.min, esz.max, esz.default], [0.5, 2, 1]);
  assert.equal(m.params.find((p) => p.key === 'wrap').default, 'auto', '360° follows the room unless the operator says otherwise');
  for (const p of m.params) {
    assert.ok(['number', 'select', 'bool', 'wall'].includes(p.type), `${p.key}: type ${p.type}`);
    assert.ok(p.label && /^[\x20-\x7e]+$/.test(p.label), `${p.key}: English label`);
    if (p.type === 'number') assert.ok(p.default >= p.min && p.default <= p.max && p.step > 0, `${p.key}: default inside its range`);
    if (p.type === 'select') assert.ok(p.options.some(([v]) => v === p.default), `${p.key}: default is one of the options`);
  }
  assert.equal(m.params.find((p) => p.key === 'emitters').max, 24);
  assert.equal(m.params.find((p) => p.key === 'logoWall').default, null);
  for (const f of ['index.html', 'fluid.js', 'fluid-webgpu.js', 'experience.js', 'logo.js', 'logo-webgpu.js', 'LICENSE-fluid.txt', 'assets/logo-wordmark.png', 'assets/logo-blob.png', 'assets/LDR_LLL1_0.png']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} exists`);
  }
  assert.match(fs.readFileSync(path.join(dir, 'LICENSE-fluid.txt'), 'utf8'), /MIT License[\s\S]*Pavel Dobryakov/);
  assert.match(fs.readFileSync(path.join(dir, 'fluid.js'), 'utf8'), /PavelDoGreat\/WebGL-Fluid-Simulation/);
  // the fluid listens to nothing itself: input comes from the runtime
  for (const f of ['fluid.js', 'fluid-webgpu.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/addEventListener|requestAnimationFrame|window\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), `${f} has no DOM listeners, rAF or window globals`);
  }
  assert.match(fs.readFileSync(path.join(dir, 'fluid-webgpu.js'), 'utf8'), /from '\.\/fluid\.js'/, 'the WebGPU fluid reuses fluid.js\'s CONFIG instead of copying it');
});

/* ------------------------------------------------------------------ the page */

pageTest('alma-fluid: frames render at the requested size, in the website\'s colours', async (inPage, renderer) => {
  const r = await inPage(`
    vt.frame(1 / 60, 3);
    const px = read(10, 10, 20, 20);
    const mean = [0, 1, 2].map((c) => px.filter((_, i) => i % 4 === c).reduce((a, b) => a + b, 0) / (px.length / 4));
    return { cw: cv.width, ch: cv.height, dw: gl ? gl.drawingBufferWidth : cv.width, dh: gl ? gl.drawingBufferHeight : cv.height, W, H, mean, backend: dev().renderer, preserve: gl ? gl.getContextAttributes().preserveDrawingBuffer : false };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  assert.equal(r.backend, renderer, 'the page runs on the requested renderer');
  assert.deepEqual([r.cw, r.ch, r.dw, r.dh], [800, 120, 800, 120], 'the canvas and its drawing buffer are exactly vt.size');
  assert.equal(r.preserve, false);
  // empty liquid = the website's background colour (173, 200, 237), not black
  assert.ok(Math.abs(r.mean[0] - 173) < 3 && Math.abs(r.mean[1] - 200) < 3 && Math.abs(r.mean[2] - 237) < 3, `background ${r.mean}`);
});

pageTest('alma-fluid: a hand that rests is felt right there (Touch presence), moving stirs it more, and nothing far from it changes', async (inPage) => {
  const script = `
    vt.frame(1 / 60, 5);
    const near = [270, 30, 60, 60], far = [680, 30, 60, 60];
    const before = [read(...near), read(...far)];
    vt.frame(1 / 60, 4); // control: no touch, nothing changes
    const control = [read(...near), read(...far)];
    touch('down', 1, 290, 60, { wallId: 'P2' });
    vt.frame(1 / 60, 6); // a hand that only rests: a soft blot of its colour, then a gentle breath
    const rested = read(...near);
    for (let k = 1; k <= 4; k++) { touch('move', 1, 290 + k * 5, 60, { wallId: 'P2' }); vt.frame(1 / 60, 3); }
    const after = [read(...near), read(...far)];
    return { controlNear: sumDiff(before[0], control[0]), restedChange: sumDiff(before[0], rested), nearChange: sumDiff(before[0], after[0]), nearMax: maxDiff(before[0], after[0]), farChange: sumDiff(before[1], after[1]), pixels: 60 * 60 };`;
  const r = await inPage(script, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  const web = await inPage(script, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false, touchPresence: 0 })}`);
  assert.equal(r.controlNear, 0, 'without a touch the empty liquid does not change');
  assert.ok(r.restedChange > r.pixels, `a hand that only rests is felt: its colour under it (${r.restedChange})`);
  assert.equal(web.restedChange, 0, 'with Touch presence 0 a resting hand paints nothing, as the website pointer');
  assert.ok(r.nearChange > r.pixels, `pixels near the moving hand changed (${r.nearChange})`);
  assert.ok(r.nearMax > 3, `...visibly (max channel change ${r.nearMax})`);
  assert.equal(r.farChange, 0, 'pixels far from the touch did not');
});

pageTest('alma-fluid: moving and holding a touch keep stirring', async (inPage) => {
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

pageTest('alma-fluid: the logo fades in on the chosen wall (the first by default) and not on the others', async (inPage) => {
  const r = await inPage(`
    vt.frame(1 / 30, 3);
    const early = white('P1');
    vt.frame(1 / 30, 110); // > 3 s
    return { early, p1: white('P1'), p2: white('P2'), p3: white('P3'), p4: white('P4') };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0 })}`);
  assert.ok(r.p1 > 25, `wordmark pixels on P1 (${r.p1})`);
  assert.deepEqual([r.p2, r.p3, r.p4], [0, 0, 0], 'no white on the other walls');
  assert.ok(r.early < r.p1 / 2, `it fades in (${r.early} after 3 frames, ${r.p1} after 3 s)`);
});

pageTest('alma-fluid: changing "Logo wall" moves the logo, switching "Logo" off removes it', async (inPage) => {
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

pageTest('alma-fluid: with a closed loop a splat at the left edge also colours the far right edge', async (inPage) => {
  const script = `
    vt.frame(1 / 60, 5);
    const edge = [W - 8, 30, 8, 60];
    const before = read(...edge);
    touch('down', 1, 14, 60, { wallId: 'P1', size: 40 });
    for (let k = 1; k <= 4; k++) { touch('move', 1, 14 - k * 3, 60, { wallId: 'P1' }); vt.frame(1 / 60, 3); }
    vt.frame(1 / 60, 4);
    return { right: sumDiff(before, read(...edge)), closed: vt.closedLoop };`;
  const q = (closed) => `walls=4&ww=200&wh=120&closed=${closed}&${asQuery({ emitters: 0, logo: false })}`;
  const loop = await inPage(script, q(1));
  const open = await inPage(script, q(0));
  assert.equal(loop.closed, true);
  assert.ok(loop.right > 8 * 60, `the right edge is coloured through the seam (${loop.right})`);
  assert.equal(open.right, 0, 'without a closed loop the right edge is untouched');
});

pageTest('alma-fluid: 360° — the seam between the last wall and the first is invisible, and a hand crossing it is one short stroke', async (inPage) => {
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
  assert.equal(still.midSpread, 0, 'crossing the seam does not draw a stroke across the strip');
});

pageTest('alma-fluid: params change live (emitters, quality) and the liquid survives a lost WebGL context / WebGPU device', async (inPage) => {
  const r = await inPage(`
    vt.frame(1 / 60, 60);
    const withEmitters = sumDiff(read(0, 0, W, H), new Array(W * H * 4).fill(0).map((_, i) => (i % 4 === 0 ? 173 : i % 4 === 1 ? 200 : i % 4 === 2 ? 237 : 255)));
    vt.setParams({ quality: 'high', emitters: 24, emitterSpeed: 2, fade: 2, turbulence: 2, touchColor: 'pink' });
    vt.frame(1 / 60, 5);
    touch('down', 1, 500, 60, { wallId: 'P3' }); vt.frame(1 / 60, 3);
    let lost = false;
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 100));
      vt.frame(1 / 60, 2); // while lost: must not throw
      ext.restoreContext();
      for (let k = 0; k < 60 && gl.isContextLost(); k++) await new Promise((r) => setTimeout(r, 50));
      lost = gl.isContextLost();
    } else {
      // WebGPU: the device is destroyed (as a driver reset would); the page must ask for a new one and rebuild
      const old = dev().gpu.device;
      old.destroy();
      await new Promise((r) => setTimeout(r, 100));
      vt.frame(1 / 60, 2); // while lost: must not throw
      for (let k = 0; k < 100 && dev().gpu.device === old; k++) await new Promise((r) => setTimeout(r, 50));
      lost = dev().gpu.device === old;
    }
    await new Promise((r) => setTimeout(r, 300)); // rebuilt
    for (let k = 0; k < 100 && !window.__almaFluid.ready; k++) await new Promise((r) => setTimeout(r, 50));
    vt.frame(1 / 30, 110);
    const px = read(10, 10, 20, 20);
    return { withEmitters, lost, r: px[0], g: px[1], logo: white('P1') };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 12 })}`);
  assert.ok(r.withEmitters > 100000, `emitters tint the liquid (${r.withEmitters})`);
  assert.equal(r.lost, false);
  assert.ok(r.r > 100 && r.g > 100, `drawing again after the restore (${r.r},${r.g})`);
  assert.ok(r.logo > 25, 'the logo is back after the restore');
});

/* ------------------------------------------------------------------ the ambience: the room is never still */

test('alma-fluid: the emitter count follows the strip\'s aspect (the website\'s density per 16:9 screen)', async () => {
  const { emitterCount } = await import(pathToFileURL(path.join(dir, 'fluid.js')).href);
  assert.equal(emitterCount(12, 16 / 9), 12, 'one 16:9 screen = the website\'s 12');
  assert.equal(emitterCount(12, 7196 / 912), 53, 'the XR Lab strip (4.4 screens) gets 4.4 times as many');
  assert.equal(emitterCount(24, 32 / 9), 48);
  assert.equal(emitterCount(0, 8), 0);
  assert.ok(emitterCount(12, 1) < 12, 'a squarer canvas gets fewer');
});

pageTest('alma-fluid: the emitters on the page scale with the canvas aspect and follow the parameter', async (inPage) => {
  const r = await inPage(`
    const strip = dev().emitterCount;
    vt.setParams({ emitters: 24 });
    vt.frame(1 / 60, 1);
    const doubled = dev().emitterCount;
    vt.setParams({ emitters: 0 });
    vt.frame(1 / 60, 1);
    return { strip, doubled, none: dev().emitterCount };`, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`);
  const screen = await inPage('return dev().emitterCount;', `walls=1&ww=213&wh=120&${asQuery({ logo: false })}`); // 1.775: one screen
  assert.equal(r.strip, 45, '12 per screen x (800 / 120) / (16 / 9)');
  assert.equal(r.doubled, 90);
  assert.equal(r.none, 0);
  assert.equal(screen, 12, 'a 16:9 canvas gets the plain count');
});

// Shared by the next two tests. Mean absolute distance from the background colour is deviation() in the prelude.
const AMBIENT = `
  vt.frame(1 / 30, 120); // 4 s: the wash has built up (it also starts warm)
  const walls = vt.walls.map((w) => w.rect);
  const first = walls.map((w) => read(w.x, 0, w.w, H));
  vt.frame(1 / 30, 3);
  const second = walls.map((w) => read(w.x, 0, w.w, H));
  const perPx = (a, b) => sumDiff(a, b) / (a.length / 4) / 3; // mean change per channel
  return {
    wall: walls.map((w) => deviation(w.x, 0, w.w, H)),
    half: walls.flatMap((w) => [deviation(w.x, 0, w.w / 2, H), deviation(w.x + w.w / 2, 0, w.w / 2, H)]),
    moving: first.map((a, i) => perPx(a, second[i])),
    all: deviation(0, 0, W, H),
  };`;

pageTest('alma-fluid: with no touches every wall has liquid that keeps moving, and the wash stays subtle', async (inPage) => {
  for (const closed of [1, 0]) {
    const r = await inPage(AMBIENT, `walls=4&ww=200&wh=120&closed=${closed}&${asQuery({ logo: false })}`);
    const tag = `(${closed ? 'closed room' : 'open strip'}: ${JSON.stringify(r)})`;
    for (const d of r.wall) assert.ok(d > 2, `no wall is just background ${tag}`); // (the website's emitters: a gentle wash; blank < 1.5)
    for (const d of r.half) assert.ok(d > 1.5, `no half wall is empty ${tag}`);
    for (const m of r.moving) assert.ok(m > 0.01, `the liquid on every wall changes from frame to frame ${tag}`); // (blank and still = exactly 0)
    assert.ok(r.all < 20, `...and the wash is subtle (${r.all.toFixed(1)} of 255 from the background) ${tag}`);
  }
  // control: no emitters = a blank, still room, so the checks above can fail
  const blank = await inPage(AMBIENT, `walls=4&ww=200&wh=120&closed=1&${asQuery({ logo: false, emitters: 0 })}`);
  assert.ok(blank.wall.every((d) => d < 1.5) && blank.moving.every((m) => m === 0), 'without emitters the room is blank and still');
  // "Ambience" is the strength: more of it, more colour
  const strong = await inPage(AMBIENT, `walls=4&ww=200&wh=120&closed=1&${asQuery({ logo: false, ambience: 2 })}`);
  const normal = await inPage(AMBIENT, `walls=4&ww=200&wh=120&closed=1&${asQuery({ logo: false })}`);
  assert.ok(strong.all > normal.all * 1.3, `Ambience 2 is stronger than 1 (${strong.all.toFixed(1)} vs ${normal.all.toFixed(1)})`);
});

pageTest('alma-fluid: a hand sweeping the wall adds colour over the ambient wash, along its way', async (inPage) => {
  const r = await inPage(`
    vt.frame(1 / 30, 120);
    const ambient = deviation(0, 0, W, H);
    const region = [380, 30, 60, 60];
    const before = deviation(...region);
    const band0 = deviation(410, 40, 160, 40);
    touch('down', 1, 410, 60, { wallId: 'P3' });
    // a hand sweeping along the wall, as on the website: one pointer event every 33 ms
    for (let k = 1; k <= 16; k++) { touch('move', 1, 410 + k * 10, 60, { wallId: 'P3' }); vt.frame(1 / 60, 2); }
    const stroke = deviation(410, 40, 160, 40);
    touch('up', 1, 490, 60, { wallId: 'P3' });
    return { ambient, before, stroke, band0 };`, `walls=4&ww=200&wh=120&closed=1&${asQuery({ logo: false })}`);
  const level = Math.max(r.ambient, r.before);
  assert.ok(r.ambient < 20, `the wash is subtle (${r.ambient.toFixed(1)})`);
  // the website's pointer is gentle (its own values, by request): it adds colour where it goes, it does not shout
  assert.ok(r.stroke > r.band0 + 0.5, `the sweep adds colour along its way (${r.band0.toFixed(1)} → ${r.stroke.toFixed(1)}, wash ${level.toFixed(1)})`);
});

pageTest('alma-fluid: "Touch intensity" sets how much colour a hand paints (default 3 x the website pointer)', async (inPage) => {
  const sweep = `
    vt.frame(1 / 30, 10);
    const band0 = deviation(410, 40, 160, 40);
    touch('down', 1, 410, 60, { wallId: 'P3' });
    for (let k = 1; k <= 16; k++) { touch('move', 1, 410 + k * 10, 60, { wallId: 'P3' }); vt.frame(1 / 60, 2); }
    return { paint: deviation(410, 40, 160, 40) - band0 };`;
  // one fixed colour (the palette is random per stroke) and the touch's own presence off: only the intensity changes
  const q = (v) => `walls=4&ww=200&wh=120&closed=1&${asQuery({ logo: false, emitters: 0, touchColor: 'purple', touchPresence: 0, ...(v == null ? {} : { touchIntensity: v }) })}`;
  const one = await inPage(sweep, q(1)), dflt = await inPage(sweep, q(null)), four = await inPage(sweep, q(4));
  assert.ok(one.paint > 0, `a hand paints at 1 (${one.paint.toFixed(2)})`);
  assert.ok(dflt.paint > one.paint * 1.5, `the default (3) paints more than the website pointer (${dflt.paint.toFixed(2)} vs ${one.paint.toFixed(2)})`);
  assert.ok(four.paint > dflt.paint * 1.1, `4 paints more than 3 (${four.paint.toFixed(2)} vs ${dflt.paint.toFixed(2)})`);
});

pageTest('alma-fluid: a hand read at 10 Hz (the sensors) still draws one continuous stroke — the hand is smoothed every frame', async (inPage) => {
  const r = await inPage(`
    vt.frame(1 / 60, 5);
    const f = dev().fluid, xs = [];
    const real = f.splat.bind(f);
    f.splat = (x, y, dx, dy, ...rest) => { if (dx || dy) xs.push(x * W); return real(x, y, dx, dy, ...rest); };
    touch('down', 1, 100, 60, { wallId: 'P1' });
    vt.frame(1 / 60, 2);
    // the readings of a hand moving right at 300 px/s, as the engine gives them: a new one every 100 ms (6 frames)
    for (let k = 1; k <= 8; k++) { touch('move', 1, 100 + k * 30, 60, { wallId: 'P1', vx: 300, vy: 0 }); vt.frame(1 / 60, 6); }
    f.splat = real;
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    return { n: xs.length, maxGap: Math.max(...gaps), first: xs[0], last: xs[xs.length - 1] };`, `walls=4&ww=200&wh=120&${asQuery({ emitters: 0, logo: false })}`);
  assert.ok(r.n >= 20, `the moving hand splats along the way, not only at the readings (${r.n} splats for 8 readings)`);
  assert.ok(r.maxGap < 20, `no jump between splats (largest ${r.maxGap.toFixed(1)} px; the readings are 30 px apart)`);
  assert.ok(r.last > 300, `and it keeps up with the hand (${r.last.toFixed(0)} px, last reading 340)`);
});

/* ------------------------------------------------------------------ quality and renderer */

pageTest('alma-fluid: Quality "ultra" simulates at the output\'s resolution, and the liquid moves as far as at "high"', async (inPage) => {
  const move = `
    // one splat that pushes its own dye to the right (straight on the fluid: the experience's touches are not involved)
    const f = dev().fluid;
    const cx = () => { const p = read(0, 0, W, H); let s = 0, m = 0; for (let i = 0; i < p.length; i += 4) { const d = Math.abs(p[i] - BG[0]) + Math.abs(p[i + 1] - BG[1]) + Math.abs(p[i + 2] - BG[2]); if (d > 6) { s += (d - 6) * ((i / 4) % W); m += d - 6; } } return s / m; };
    f.splat(0.25, 0.5, 60, 0, 0.12, 0.05, 0.1, 0.12);
    f.step(1 / 60, 0, 0); f.render();
    const a = cx();
    for (let i = 0; i < 30; i++) f.step(1 / 60, 0.2, 0.999);
    f.render();
    return { shift: cx() - a, sim: f.simHeight, dye: f.dyeHeight, simW: f.simWidth };`;
  const q = (quality) => `walls=4&ww=200&wh=120&${asQuery({ logo: false, emitters: 0, quality })}`;
  const high = await inPage(move, q('high'));
  const ultra = await inPage(move, q('ultra'));
  assert.equal(high.sim, 128);
  assert.equal(ultra.sim, 256, 'ultra: a 256-texel simulation');
  assert.equal(ultra.dye, 120, 'ultra: the dye is the render height (here 120 px)');
  assert.equal(ultra.simW, Math.round(256 * 800 / 120), 'the grid keeps the canvas aspect');
  assert.ok(high.shift > 6, `the push carried the dye (${high.shift.toFixed(1)} px)`);
  // velocities are in simulation texels: without rescaling for the finer grid the liquid would move half as far
  const ratio = ultra.shift / high.shift;
  assert.ok(ratio > 0.8 && ratio < 1.25, `ultra moves the liquid as far as high (${ultra.shift.toFixed(1)} vs ${high.shift.toFixed(1)} px)`);
  // switching live keeps the liquid and rebuilds the grid
  const live = await inPage(`
    vt.frame(1 / 60, 30);
    const before = deviation(0, 0, W, H);
    vt.setParams({ quality: 'ultra' }); vt.frame(1 / 60, 3);
    const up = { sim: dev().fluid.simHeight, dev: deviation(0, 0, W, H) };
    vt.setParams({ quality: 'low' }); vt.frame(1 / 60, 3);
    return { before, up, down: dev().fluid.simHeight };`, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`);
  assert.equal(live.up.sim, 256);
  assert.equal(live.down, 128);
  assert.ok(live.up.dev > live.before * 0.5, `the liquid survives a quality change (${live.before.toFixed(1)} -> ${live.up.dev.toFixed(1)})`);
});

const gpuTest = (name, fn) => test(name, optFor('webgpu'), fn);

gpuTest('alma-fluid: "auto" picks WebGPU when the machine has it; "webgl2" forces WebGL2; a change of renderer reloads the page', async () => {
  const probe = 'return { renderer: dev().renderer, gl: !!vt.gl, device: !!(dev().gpu && dev().gpu.device) };';
  const auto = await inPage(probe, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`); // no renderer given: the manifest default
  assert.deepEqual(auto, { renderer: 'webgpu', gl: false, device: true }, 'auto = WebGPU');
  const forced = await inPage(probe, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`, 'webgl2');
  assert.deepEqual(forced, { renderer: 'webgl2', gl: true, device: false }, 'webgl2 stays on WebGL2');
  const reloads = `
    let n = 0;
    dev().reload = () => { n++; };
    vt.setParams({ turbulence: 2 }); vt.frame(1 / 60, 1);
    const unrelated = n;
    vt.setParams({ renderer: dev().renderer === 'webgpu' ? 'webgl2' : 'webgpu' }); vt.frame(1 / 60, 1);
    return { unrelated, afterChange: n };`;
  assert.deepEqual(await inPage(reloads, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`), { unrelated: 0, afterChange: 1 }, 'only a renderer change asks for a reload');
  const sameAgain = await inPage(`
    let n = 0; dev().reload = () => { n++; };
    vt.setParams({ renderer: 'auto' }); vt.frame(1 / 60, 1);
    return n;`, `walls=4&ww=200&wh=120&${asQuery({ logo: false })}`);
  assert.equal(sameAgain, 0, 'auto on a page already on WebGPU does not reload');
});

gpuTest('alma-fluid: WebGPU draws what WebGL2 draws (liquid, touches, logo, upright) to within a fraction of a level', async () => {
  // the same touches with the same "random" numbers on both renderers; the picture is compared in 8 x 8 cells
  const script = `
    let seed = 12345;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    vt.frame(1 / 30, 4);
    touch('down', 1, 300, 50, { wallId: 'P2' });
    vt.frame(1 / 60, 6);
    for (let k = 1; k <= 10; k++) { touch('move', 1, 300 + k * 9, 50 + k * 3, { wallId: 'P2', vx: 540, vy: 180 }); vt.frame(1 / 60); }
    touch('down', 2, 700, 80, { wallId: 'P4' });
    vt.frame(1 / 60, 20);
    vt.frame(1 / 30, 110); // the logo is fully in
    const p = read(0, 0, W, H), cells = [];
    for (let cy = 0; cy < H; cy += 8) for (let cx = 0; cx < W; cx += 8) {
      let s = [0, 0, 0];
      for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) for (let c = 0; c < 3; c++) s[c] += p[(y * W + x) * 4 + c];
      cells.push(...s.map((v) => v / 64));
    }
    return cells;`;
  const q = `walls=4&ww=200&wh=120&${asQuery({ emitters: 0 })}`;
  const a = await inPage(script, q, 'webgl2');
  const b = await inPage(script, q, 'webgpu');
  assert.equal(a.length, b.length);
  let max = 0, sum = 0, lit = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); max = Math.max(max, d); sum += d; if (Math.abs(a[i] - [173, 200, 237][i % 3]) > 8) lit++; }
  assert.ok(lit > 30, `the scene has something in it (${lit} cells away from the background)`);
  assert.ok(sum / a.length < 0.5 && max < 3, `same picture on both renderers (mean difference ${(sum / a.length).toFixed(2)}, worst cell ${max.toFixed(1)} of 255)`);
});

/* ------------------------------------------------------------------ the runtime takes a WebGPU canvas */

gpuTest('runtime: vt.frame accepts a WebGPU canvas — the CPU Spout path sends its pixels top row first; preview and viewer capture work', async () => {
  // the REAL runtime (standalone, a fake Spout bridge); a known picture: red top half, blue bottom half
  const script = `
    const rt = await import('/experiences/runtime.js');
    const vt = await rt.connectExperience();
    const sent = [];
    window.vtOut.send = (u8, w, h, flipY) => { if (w === 64) sent.push({ w, h, flipY, bytes: u8.length, first: Array.from(u8.slice(0, 4)), last: Array.from(u8.slice(u8.length - 4)) }); return true; };
    vt.sink = 'spout';
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu'), format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const code = '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); return vec4f(p * 2.0 - 1.0, 0.0, 1.0); } @fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f { if (fp.y < 16.0) { return vec4f(1.0, 0.0, 0.0, 1.0); } return vec4f(0.0, 0.0, 1.0, 1.0); }';
    const mod = device.createShaderModule({ code });
    const pipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] } });
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(pipe); pass.draw(3); pass.end();
    device.queue.submit([enc.finish()]);
    vt.frame(canvas);                              // same task as the submit
    const bitmap = await createImageBitmap(canvas); // what the viewer does
    // the same picture on a WebGL canvas: rows run bottom-up there, and the runtime says so
    const gcanvas = document.createElement('canvas'); gcanvas.width = 64; gcanvas.height = 32;
    const gl2 = gcanvas.getContext('webgl2');
    gl2.enable(gl2.SCISSOR_TEST);
    gl2.scissor(0, 0, 64, 16); gl2.clearColor(0, 0, 1, 1); gl2.clear(gl2.COLOR_BUFFER_BIT); // bottom half blue
    gl2.scissor(0, 16, 64, 16); gl2.clearColor(1, 0, 0, 1); gl2.clear(gl2.COLOR_BUFFER_BIT); // top half red
    vt.frame(gl2);
    return { sent, bitmap: [bitmap.width, bitmap.height] };`;
  const r = await inPage(script, 'standalone=1&fakeOut=1', null, { raw: true });
  assert.equal(r.sent.length, 2, 'one frame per canvas');
  const [s, g] = r.sent;
  assert.deepEqual([s.w, s.h, s.bytes, s.flipY], [64, 32, 64 * 32 * 4, false], 'RGBA, top row first: no flip');
  assert.ok(s.first[0] > 200 && s.first[2] < 50, `the first pixel is the top (red): ${s.first}`);
  assert.ok(s.last[2] > 200 && s.last[0] < 50, `the last pixel is the bottom (blue): ${s.last}`);
  assert.equal(g.flipY, true, 'WebGL canvases keep the bottom-up read');
  assert.ok(g.first[2] > 200 && g.first[0] < 50, `...and start with the bottom row (blue): ${g.first}`);
  assert.deepEqual(r.bitmap, [64, 32], 'createImageBitmap takes the canvas');
});
