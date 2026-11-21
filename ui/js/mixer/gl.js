// The room output's mixer on the GPU (WebGL2): every layer is a texture; they are composed, bottom → top, into an FBO the
// size of the room's image (the render size: the profile's canvas × the output's scale — 7196×912 in XR Lab), which is
// then presented on the page's canvas: 1:1 for Spout, fitted for a display. MEDIA-SERVER.md §4.5, measured in
// MEDIA-SERVER-MEDIDAS.md (§3, §8.2).
//
// - Premultiplied alpha everywhere: sources are uploaded premultiplied (UNPACK_PREMULTIPLY_ALPHA_WEBGL), the shader
//   multiplies colour AND alpha by the layer's opacity, and the four blends are fixed-function — the same results as the
//   CSS mix-blend-mode the DOM output used (on an opaque backdrop):
//     normal   ONE, ONE_MINUS_SRC_ALPHA        Cb·(1−a) + Cs·a
//     add      ONE, ONE                        Cb + Cs·a                (CSS plus-lighter: clamped)
//     screen   ONE, ONE_MINUS_SRC_COLOR        Cb + Cs·a·(1−Cb)
//     multiply DST_COLOR, ONE_MINUS_SRC_ALPHA  Cb·(1 − a + Cs·a)
// - Orientation: textures and the FBO hold the image TOP ROW FIRST (what texSubImage2D(canvas) uploads without
//   UNPACK_FLIP_Y_WEBGL); only the presentation flips, because a canvas' GL row 0 is its bottom. A pixel (x, y) of the
//   room's image (y from the top) is texel (x, y) of the FBO.
// - Uploads are direct texSubImage2D(source) — never createImageBitmap, never readPixels or gl.finish in the hot path
//   (both measured: they only add a task hop or make the CPU wait 4–12 ms). readFbo() is for the tests.

export const BLENDS = ['normal', 'screen', 'add', 'multiply'];

const VS = `#version 300 es
uniform vec4 uDst; // destination in clip space: x0, y0, x1, y1
uniform vec4 uSrc; // source in texture coordinates: u0, v0, u1, v1
out vec2 vUv;
void main() {
  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vUv = mix(uSrc.xy, uSrc.zw, q);
  gl_Position = vec4(mix(uDst.xy, uDst.zw, q), 0.0, 1.0);
}`;

// one shader for every layer: a texture (or a crossfade of two, mix(A, B, t) on premultiplied colour) × opacity
const FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;     // 0: A only … 1: B only
uniform float uOpacity;
uniform float uOpaque;  // 1: the source has no transparency (the experience is shown on black, as its page was)
out vec4 o;
void main() {
  vec4 c = texture(uA, vUv);
  if (uMix > 0.0) c = mix(c, texture(uB, vUv), uMix);
  c.a = max(c.a, uOpaque);
  o = c * uOpacity;
}`;

function blendOf(gl, mode) {
  switch (mode) {
    case 'add': return [gl.ONE, gl.ONE, gl.ONE, gl.ONE];
    case 'screen': return [gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
    case 'multiply': return [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
    default: return [gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
  }
}

/** GPU time per step (EXT_disjoint_timer_query_webgl2): one query open at a time, results read when ready, never waited for. */
function makeTimers(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [], res = {}, KEEP = 240;
  let open = null;
  return {
    res,
    begin(tag) { if (open) return; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = { q, tag }; },
    end() { if (!open) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); open = null; },
    poll() {
      while (pending.length) {
        const { q, tag } = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        pending.shift(); gl.deleteQuery(q);
        if (disjoint) continue;
        const a = (res[tag] ||= []);
        a.push(ns / 1e6);
        if (a.length > KEEP) a.splice(0, a.length - KEEP);
      }
    },
    drop() { for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); gl.deleteQuery(open.q); open = null; } },
  };
}

/**
 * The mixer on `canvas` for a room image of width × height. Null when this browser has no WebGL2.
 * @param {HTMLCanvasElement} canvas
 * @param {{width: number, height: number}} size
 */
export function createMixer(canvas, { width, height }) {
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl2', attrs);
  if (!gl) return null;
  const W = width, H = height;
  const restoredFns = new Set();
  let P = null, fbo = null, black = null, timers = null;

  const m = {
    gl, canvas, width: W, height: H,
    lost: false,
    /** +1 every time the context is restored after a loss: every texture made before is gone (make them again). */
    generation: 0,
    /** GPU ms per step (copy, compose…), the newest last — when the extension is there. */
    get gpu() { return timers?.res || null; },
    timers: () => timers,
  };

  function build() {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`mixer shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`mixer program: ${gl.getProgramInfoLog(p)}`);
    const u = (n) => gl.getUniformLocation(p, n);
    P = { p, uDst: u('uDst'), uSrc: u('uSrc'), uA: u('uA'), uB: u('uB'), uMix: u('uMix'), uOpacity: u('uOpacity'), uOpaque: u('uOpaque'), vao: gl.createVertexArray() };
    gl.useProgram(P.p); gl.uniform1i(P.uA, 0); gl.uniform1i(P.uB, 1);
    // the room's image
    const tex = m.texture(W, H);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.viewport(0, 0, W, H); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fbo = { fb, tex };
    black = m.texture(1, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    timers = makeTimers(gl);
    m.fbo = fbo;
  }

  /**
   * A texture of w × h (RGBA8, linear, clamped) on this context. `mips`: with all its levels and trilinear filtering — for a still
   * image, uploaded once (`upload(…, {mips: true})` makes the levels): a 12 000 px photo shown at 7196 px would alias without them.
   */
  m.texture = (w, h, { mips = false } = {}) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const W = Math.max(1, w | 0), H = Math.max(1, h | 0);
    gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(Math.max(W, H))) + 1 : 1, gl.RGBA8, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  m.deleteTexture = (t) => { if (t && !m.lost) gl.deleteTexture(t); };

  /**
   * Copy `source` (a canvas — WebGL, WebGPU or 2D —, an ImageBitmap, ImageData…) into `tex`, top row first, premultiplied.
   * A WebGL/WebGPU canvas must be copied in the task that drew it: once presented its drawing buffer is empty.
   * `pixels` with w, h: raw RGBA bytes instead.
   */
  m.upload = (tex, source, w, h, { mips = false } = {}) => {
    if (m.lost) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (ArrayBuffer.isView(source)) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  };

  /** GPU timing around a step (tag) — measured only when asked (`on`): the stats sample one frame in a few. */
  m.time = (tag, on, fn) => { if (on && timers) { timers.begin(tag); fn(); timers.end(); } else fn(); };
  m.pollTimers = () => { if (!m.lost) timers?.poll(); };

  /** Draw one layer into the bound target (tw × th px). d: {tex, texB?, mix?, opacity, blend, opaque?, src?, dst?}. */
  function draw(d, tw, th) {
    const [x, y, w, h] = d.dst || [0, 0, tw, th];
    const s = d.src || [0, 0, 1, 1];
    const [sf, df, sa, da] = blendOf(gl, d.blend);
    gl.blendFuncSeparate(sf, df, sa, da);
    gl.uniform4f(P.uDst, (x / tw) * 2 - 1, (y / th) * 2 - 1, ((x + w) / tw) * 2 - 1, ((y + h) / th) * 2 - 1);
    gl.uniform4f(P.uSrc, s[0], s[1], s[2], s[3]);
    gl.uniform1f(P.uOpacity, Math.max(0, Math.min(1, d.opacity ?? 1)));
    gl.uniform1f(P.uOpaque, d.opaque ? 1 : 0);
    const mx = d.texB && d.mix > 0 ? Math.min(1, d.mix) : 0;
    gl.uniform1f(P.uMix, mx);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mx > 0 ? d.texB : black);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Compose the room's image into the FBO: black, then each draw bottom → top (rects in FBO pixels, y from the top),
   * then the blackout (`fade` 0..1: how far it has gone to black).
   */
  m.compose = (draws, { fade = 0 } = {}) => {
    if (m.lost) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(P.p); gl.bindVertexArray(P.vao);
    gl.enable(gl.BLEND);
    if (fade < 1) for (const d of draws) if (d.tex && (d.opacity ?? 1) > 0) draw(d, W, H);
    if (fade > 0) draw({ tex: black, opacity: fade, blend: 'normal' }, W, H);
    gl.disable(gl.BLEND);
  };

  /**
   * The FBO onto the canvas. `fit`: 'pinned' (1:1, top-left: the Spout window), 'fit' (whole, centred, black around) or
   * 'stretch' (fills the canvas). The canvas is sized by the page (its pixels = what is presented).
   */
  m.present = (fit = 'pinned') => {
    if (m.lost) return;
    const cw = canvas.width, ch = canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    let rect = [0, 0, cw, ch];
    if (fit === 'pinned') rect = [0, ch - H, W, H]; // top-left, 1:1 (GL rows start at the bottom)
    else if (fit === 'fit') {
      const k = Math.min(cw / W, ch / H), w = W * k, h = H * k;
      rect = [(cw - w) / 2, (ch - h) / 2, w, h];
    }
    if (rect[0] !== 0 || rect[1] !== 0 || rect[2] !== cw || rect[3] !== ch) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.useProgram(P.p); gl.bindVertexArray(P.vao);
    gl.disable(gl.BLEND);
    // flipped: the FBO's row 0 (the image's top) goes to the canvas' top
    draw({ tex: fbo.tex, opacity: 1, opaque: true, blend: 'normal', src: [0, 1, 1, 0], dst: rect }, cw, ch);
    m.view = { fit, rect: [rect[0], ch - rect[1] - rect[3], rect[2], rect[3]], canvas: [cw, ch] }; // rect from the top
  };

  /** TESTS ONLY (it makes the CPU wait for the GPU): RGBA bytes of a rectangle of the room's image, y from the top. */
  m.readFbo = (x, y, w = 1, h = 1) => {
    const out = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  };

  /** Called after a lost context comes back (every texture is to be made again: see `generation`). */
  m.onRestored = (fn) => { restoredFns.add(fn); return () => restoredFns.delete(fn); };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); m.lost = true; timers?.drop?.(); timers = null; });
  canvas.addEventListener('webglcontextrestored', () => {
    m.lost = false; m.generation++;
    build();
    for (const fn of restoredFns) { try { fn(m); } catch (err) { console.error(err); } }
  });

  build();
  return m;
}
