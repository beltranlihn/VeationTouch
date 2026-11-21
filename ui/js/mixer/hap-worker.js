// A HAP decode worker of the room output (MEDIA-SERVER.md §3.1). Ported from VEATION (Immersive Studio Pro ·
// hap-worker.js, same owner; decision in its docs/adr/adr-0012-proxy-live-hap.md). One frame travels its whole way here
// but the last step:
//   disk (fs, no IPC) → HAP sample → Snappy → compressed texture in THIS worker's WebGL → RGBA → ImageBitmap
// and the output page only copies the ImageBitmap into the clip's texture (GPU → GPU, ~0.1 ms). The decoding code is the
// engine's own (/shared/mov.js and /shared/hap.js = engine/media/mov.js, hap.js): one implementation of the format.
//
// A MODULE worker with Node: the output window has `nodeIntegrationInWorker` (app/output-window.cjs) because
// `fetch(file://)` fails in Electron's workers and a custom protocol costs ~200 ms per 4 MB (measured in VEATION) —
// `require('fs')` exists only here. That window never leaves our server (its navigation guard).
//
// Messages (ONE frame in flight per worker: ui/js/mixer/hap-pool.js guarantees it):
//   {t:'init', req}               → {t:'init', req, ok, s3tc, err}
//   {t:'info', req, path}         → {t:'info', req, ix:{fourcc, width, height, count, fps, dur, pts}} | {t:'err', req, msg}
//   {t:'frame', req, path, idx}   → {t:'frame', req, idx, bm, w, h, alpha, tR, tD, tU}         | {t:'err', req, idx, msg}
//   {t:'still', req, path}        → {t:'still', req, bm, w, h, reduced} | {t:'err', req, msg}  (a still image, decoded whole: png, jpeg, webp, gif, bmp, avif)
//   {t:'close', req, path}        → {t:'close', req}  (Windows cannot rename over an open file)
//   {t:'closeall', req}           → {t:'closeall', req}  (every descriptor; sent before the pool terminates a worker)
// Errors start with a code (`read:` the disk failed — a drive pulled out, a file cut short; the format's own codes from
// mov.js / hap.js: no-moov, mov-bad, not-hap, hapm, not-supported, hap-bad, snappy; `no-node:`, `no-webgl2:`, `no-s3tc:`).
//
// ORIENTATION (measured, not assumed): row 0 of a HAP texture is the TOP of the image (VEATION measured it). This
// worker's canvas shows GL row 0 at its BOTTOM, and the ImageBitmap is the canvas as shown; the mixer's textures hold
// the image TOP ROW FIRST (ui/js/mixer/gl.js: texSubImage2D without UNPACK_FLIP_Y_WEBGL, which does not act on an
// ImageBitmap anyway). So the draw below FLIPS (1 − v): the canvas shows the image the right way up, and the bitmap
// uploads top row first. VEATION draws without the flip because its textures are bottom-row-first.
// tests/hap-player.test.mjs reads the clip's corner markers back from the mixer's image (without the flip: upside down).
// HAP Alpha leaves PREMULTIPLIED (the mixer's convention); HAP Q's scaled YCoCg is turned into RGB here.

import { movIndex } from '/shared/mov.js';
import { hapDecode, hapFormat, textureBytes } from '/shared/hap.js';
import { sniffKind, imageInfo, reducedSize } from '/shared/sniff.js';

let fs = null, nodeErr = '';
try { fs = require('fs'); } catch (e) { nodeErr = `no-node: the output window's workers have no Node (${e?.message || e})`; }

const codeOf = (e) => (/^[a-z0-9-]+:/.test(String(e?.message || e)) ? String(e.message || e) : `read: ${e?.message || e}`);

// ---------------------------------------------------------------------------------------------- open files

const files = new Map(); // path → { fd, v (the video index), used }
function open(path) {
  let f = files.get(path);
  if (!f) {
    if (!fs) throw new Error(nodeErr);
    let fd;
    try { fd = fs.openSync(path, 'r'); } catch (e) { throw new Error(`read: ${e.code === 'ENOENT' ? 'the file is not there' : e.message}`); }
    try {
      const size = fs.fstatSync(fd).size;
      const read = (o, l) => { const n = Math.max(0, Math.min(l, size - o)), b = Buffer.alloc(n); if (n && fs.readSync(fd, b, 0, n, o) !== n) throw new Error('read: short read'); return b; };
      const ix = movIndex(read, size);
      if (!ix.video) throw new Error('not-hap: no video track');
      hapFormat(ix.video.fourcc); // a coded error for anything but Hap1 / Hap5 / HapY
      f = { fd, v: ix.video, used: 0 };
    } catch (e) { try { fs.closeSync(fd); } catch { /* closed */ } throw new Error(codeOf(e)); }
    files.set(path, f);
    if (files.size > 24) { // one descriptor per clip in use; the ones not asked for in a while are closed
      const old = [...files.entries()].sort((a, b) => a[1].used - b[1].used)[0];
      if (old && old[0] !== path) forget(old[0]);
    }
  }
  f.used = performance.now();
  return f;
}
function forget(path) {
  const f = files.get(path);
  if (f) { try { fs.closeSync(f.fd); } catch { /* closed */ } files.delete(path); }
}

// ---------------------------------------------------------------------------------------------- this worker's WebGL

let cv = null, gl = null, S3 = null, prog = null, uMode = null, uScale = null, vao = null, glErr = '';
const ctex = new Map(); // format|width|height → compressed texture (texStorage2D)
function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
function startGL() {
  if (gl && !gl.isContextLost()) return true;
  ctex.clear(); gl = null; prog = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') { glErr = 'no-offscreen: OffscreenCanvas is not available'; return false; }
    cv = new OffscreenCanvas(4, 4);
    gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) { glErr = 'no-webgl2: WebGL2 is not available in the worker'; return false; }
    S3 = gl.getExtension('WEBGL_compressed_texture_s3tc');
    if (!S3) { glErr = 'no-s3tc: the GPU does not offer WEBGL_compressed_texture_s3tc'; return false; }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es
out vec2 v; void main(){ vec2 q=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); v=q; gl_Position=vec4(q*2.0-1.0,0.0,1.0); }`));
    // mode 0 = DXT1 opaque · 1 = DXT5, which leaves PREMULTIPLIED · 2 = HAP Q (scaled YCoCg; Vidvox ScaledCoCgYToRGBA, rewritten)
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; in vec2 v; uniform sampler2D s; uniform int mode; uniform vec2 sc; out vec4 o;
void main(){ vec4 c=texture(s, vec2(v.x, 1.0-v.y)*sc);
  if(mode==2){ float k=c.b*(255.0/8.0)+1.0; float co=(c.r-128.0/255.0)/k, cg=(c.g-128.0/255.0)/k, y=c.a; o=vec4(y+co-cg, y+cg, y-co-cg, 1.0); }
  else if(mode==1) o=vec4(c.rgb*c.a, c.a);
  else o=vec4(c.rgb, 1.0); }`));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    prog = p; uMode = gl.getUniformLocation(p, 'mode'); uScale = gl.getUniformLocation(p, 'sc'); vao = gl.createVertexArray();
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glErr = 'ctx-lost: the worker lost its GPU context'; });
    return true;
  } catch (e) { glErr = String(e?.message || e); gl = null; return false; }
}
function texComp(fmt, tw, th) {
  const k = `${fmt}|${tw}|${th}`; let t = ctex.get(k); if (t) return t;
  if (ctex.size >= 3) { const [k0, t0] = ctex.entries().next().value; try { gl.deleteTexture(t0); } catch { /* lost */ } ctex.delete(k0); }
  t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, tw, th);
  // NEAREST: the canvas is the image's size, each pixel reads its texel (filtering would mix YCoCg across blocks)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  ctex.set(k, t); return t;
}

// ---------------------------------------------------------------------------------------------- one frame

let rb = null, out = null; // buffers reused: no allocation per frame once running
function frame(m) {
  const f = open(m.path), v = f.v, idx = m.idx | 0;
  if (idx < 0 || idx >= v.count) throw new Error(`hap-bad: frame ${idx} beyond the end of the file`);
  const t0 = performance.now();
  const size = v.sizes[idx];
  if (!rb || rb.length < size) rb = Buffer.allocUnsafeSlow(Math.ceil(size * 1.25));
  let got;
  try { got = fs.readSync(f.fd, rb, 0, size, v.offsets[idx]); } catch (e) { forget(m.path); throw new Error(`read: ${e.code || ''} ${e.message}`.trim()); }
  if (got !== size) { forget(m.path); throw new Error('read: short read (the file was cut short or its drive removed)'); }
  const t1 = performance.now();
  const F = hapFormat(v.fourcc), W = v.width, H = v.height, tw = (W + 3) & ~3, th = (H + 3) & ~3;
  const need = textureBytes(W, H, F.blockBytes);
  if (!out || out.length < need) out = new Uint8Array(need);
  const r = hapDecode(rb, 0, size, out);
  if (r.len !== need) throw new Error(`hap-bad: texture of ${r.len} bytes; expected ${need}`);
  const t2 = performance.now();
  if (!startGL()) throw new Error(glErr || 'no-webgl2: no WebGL');
  const fmt = r.fmt === 'dxt1' ? S3.COMPRESSED_RGB_S3TC_DXT1_EXT : S3.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  const t = texComp(fmt, tw, th);
  gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.compressedTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tw, th, fmt, out.subarray(0, r.len));
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(prog);
  gl.uniform1i(uMode, r.fmt === 'ycocg' ? 2 : r.fmt === 'dxt5' ? 1 : 0); gl.uniform2f(uScale, W / tw, H / th);
  gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  const bm = cv.transferToImageBitmap();
  const t3 = performance.now();
  return { bm, w: W, h: H, alpha: r.fmt === 'dxt5', tR: t1 - t0, tD: t2 - t1, tU: t3 - t2 };
}

// ---------------------------------------------------------------------------------------------- a still image

/**
 * The picture of an image file as an ImageBitmap, upright (EXIF orientation applied), premultiplied (the mixer's
 * convention) and no larger than the GPU's texture (16384 px) or 64 Mpx: a larger one is reduced here, once. An animated
 * GIF / WebP / APNG gives its first frame (createImageBitmap's rule).
 */
async function still(m) {
  if (!fs) throw new Error(nodeErr);
  let data;
  try { data = fs.readFileSync(m.path); } catch (e) { throw new Error(`read: ${e.code === 'ENOENT' ? 'the file is not there' : e.message}`); }
  const sn = sniffKind(data.subarray(0, 64));
  if (sn.kind !== 'image') throw new Error('not-image: the file is not a picture Chromium reads');
  const info = imageInfo(data.subarray(0, Math.min(data.length, 1 << 20)), sn.format, sn.brand);
  const red = info ? reducedSize(info.width, info.height) : null;
  const bm = await createImageBitmap(new Blob([data]), { imageOrientation: 'from-image', premultiplyAlpha: 'premultiply', colorSpaceConversion: 'default', ...(red ? { resizeWidth: red.width, resizeHeight: red.height, resizeQuality: 'high' } : {}) });
  return { bm, w: bm.width, h: bm.height, reduced: !!red };
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.t === 'init') { const ok = !!fs && startGL(); postMessage({ t: 'init', req: m.req, ok, s3tc: !!S3, err: ok ? '' : (fs ? glErr : nodeErr) }); return; }
    if (m.t === 'info') {
      const v = open(m.path).v;
      postMessage({ t: 'info', req: m.req, ix: { fourcc: v.fourcc, width: v.width, height: v.height, count: v.count, fps: v.fps, dur: v.dur, pts: v.pts } });
      return;
    }
    if (m.t === 'frame') { const r = frame(m); postMessage({ t: 'frame', req: m.req, idx: m.idx, ...r }, [r.bm]); return; }
    if (m.t === 'still') { const r = await still(m); postMessage({ t: 'still', req: m.req, ...r }, [r.bm]); return; }
    if (m.t === 'closeall') { for (const k of [...files.keys()]) forget(k); postMessage({ t: 'closeall', req: m.req }); return; }
    if (m.t === 'close') { forget(m.path); postMessage({ t: 'close', req: m.req }); return; }
  } catch (err) { postMessage({ t: 'err', req: m.req, idx: m.idx, msg: codeOf(err) }); }
};
