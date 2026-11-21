// The Advanced Output's last step on the GPU (MEDIA-SERVER.md §5): the mixer's image (the FBO, the content canvas at the
// render size) drawn onto the output page's canvas once per SLICE — its input rectangle of the canvas to its output region
// of a screen (a rect, a corner pin or a grid mesh: engine/media/screens.js › sliceMesh), flips included — and, above
// every slice, each screen's TEST CARD (border, diagonals, name and resolution, the slices' outlines and names, colour
// bars), drawn in screen space: it checks the cable and the Fx4, not the content. The calibration grid is a layer of the
// FBO, so it goes through the slices and lands on the wall exactly where the content will.
//
// plan = { bg, screens: [{ id, view: [x, y, w, h] (canvas px, y from the top), sx, sy (canvas px per screen px),
//          slices: [{ id, mesh }], card: texture | null }] }

const VS = `#version 300 es
in vec2 aPos;       // screen px
in vec2 aUv;        // texture coordinates of the source (0..1, y from the top: how the FBO holds the image)
uniform vec4 uView; // where the screen is on the canvas: x, y (px, from the top), sx, sy (canvas px per screen px)
uniform vec2 uCanvas;
out vec2 vUv;
void main() {
  vec2 p = uView.xy + aPos * uView.zw;
  vUv = aUv;
  gl_Position = vec4(p.x / uCanvas.x * 2.0 - 1.0, 1.0 - p.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uOpaque;
out vec4 o;
void main() { vec4 c = texture(uTex, vUv); c.a = max(c.a, uOpaque); o = c; }`;

/** The slices' presenter on the mixer's context (ui/js/mixer/gl.js). */
export function createScreensPresenter(mixer) {
  const gl = mixer.gl;
  let P = null, gen = -1;
  const bufs = new WeakMap(); // mesh → { vao, buf, count } (made again after a lost context: `gen`)
  const quad = new Map();     // "w×h" → a mesh covering a screen (the test card)

  function build() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`screens shader: ${gl.getShaderInfoLog(s)}`); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUv');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`screens program: ${gl.getProgramInfoLog(p)}`);
    const u = (n) => gl.getUniformLocation(p, n);
    P = { p, uView: u('uView'), uCanvas: u('uCanvas'), uTex: u('uTex'), uOpaque: u('uOpaque') };
    gen = mixer.generation;
  }

  function vaoOf(mesh) {
    let b = bufs.get(mesh);
    if (b && b.gen === mixer.generation) return b;
    const data = new Float32Array(mesh.count * 4);
    for (let i = 0; i < mesh.count; i++) { data[i * 4] = mesh.pos[i * 2]; data[i * 4 + 1] = mesh.pos[i * 2 + 1]; data[i * 4 + 2] = mesh.uv[i * 2]; data[i * 4 + 3] = mesh.uv[i * 2 + 1]; }
    const vao = gl.createVertexArray(), buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    b = { vao, buf, count: mesh.count, gen: mixer.generation };
    bufs.set(mesh, b);
    return b;
  }

  function quadOf(w, h) {
    const k = `${w}x${h}`;
    let m = quad.get(k);
    if (!m) {
      m = { count: 6, pos: new Float32Array([0, 0, w, 0, w, h, 0, 0, w, h, 0, h]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]) };
      quad.set(k, m);
    }
    return m;
  }

  const pr = {
    view: null,
    /** The slices of every screen, then the test cards, onto the canvas (black screens on `bg` grey around them). */
    present(plan) {
      if (mixer.lost) return;
      if (!P || gen !== mixer.generation) build();
      const cw = gl.canvas.width, ch = gl.canvas.height, bg = plan?.bg ?? 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(bg, bg, bg, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P.p);
      gl.uniform2f(P.uCanvas, cw, ch);
      gl.uniform1i(P.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (const s of plan?.screens || []) {
        const [x, y, w, h] = s.view;
        // the screen itself is black (the gaps between slices, the margins of a quadrant)
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.round(x), Math.round(ch - y - h), Math.round(w), Math.round(h));
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(P.uView, x, y, s.sx, s.sy);
        gl.disable(gl.BLEND);
        gl.uniform1f(P.uOpaque, 1);
        gl.bindTexture(gl.TEXTURE_2D, mixer.fbo.tex);
        for (const sl of s.slices) { const b = vaoOf(sl.mesh); gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.count); }
        if (s.card) { // premultiplied (uploaded so by mixer.upload): normal blend over the slices
          gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(P.uOpaque, 0);
          gl.bindTexture(gl.TEXTURE_2D, s.card);
          const b = vaoOf(quadOf(s.screen.width, s.screen.height)); gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.count);
          gl.disable(gl.BLEND);
        }
        gl.disable(gl.SCISSOR_TEST);
      }
      gl.bindVertexArray(null);
      pr.view = { canvas: [cw, ch], screens: (plan?.screens || []).map((s) => ({ id: s.id, view: s.view, sx: s.sx, sy: s.sy, slices: s.slices.map((x) => x.id), card: !!s.card })) };
    },
    /** TESTS ONLY (it makes the CPU wait): RGBA bytes of a rectangle of the presented canvas, y from the top. */
    read(x, y, w = 1, h = 1) {
      const out = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(x, gl.canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      // rows come bottom-up: flip them so row 0 is the top
      const row = w * 4, flip = new Uint8Array(out.length);
      for (let j = 0; j < h; j++) flip.set(out.subarray((h - 1 - j) * row, (h - j) * row), j * row);
      return flip;
    },
  };
  return pr;
}

/**
 * The mixer's image (the content canvas) at w × h, RGBA, top row first — for the room's monitor while the window shows
 * the screens (a capture of it would be the Fx4's layout, not the canvas). One small blit on the GPU, then a readback of
 * w × h only (640 × 81 in XR Lab), once a second: never the 26 MB of the whole image.
 */
export function snapshot(mixer, w, h) {
  const gl = mixer.gl;
  let s = mixer._snap;
  if (!s || s.w !== w || s.h !== h || s.gen !== mixer.generation) {
    const tex = mixer.texture(w, h), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    s = mixer._snap = { w, h, fb, tex, gen: mixer.generation };
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mixer.fbo.fb);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fb);
  gl.blitFramebuffer(0, 0, mixer.width, mixer.height, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  const out = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out); // (the FBO's row 0 is the image's top)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}

const BARS = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
const AMBER = '#E5B567';

/**
 * A screen's test card on a 2D canvas of its resolution, transparent where it draws nothing (the slices show through):
 * a 1 px border on the screen's edge, the diagonals, the halves (the Fx4's quadrants), a centred circle, the name and the
 * resolution, the colour bars, and each slice's outline and name (amber: what to aim at).
 * @param {CanvasRenderingContext2D} g @param {{name, width, height}} screen @param {{name, corners: number[][]}[]} slices
 */
export function drawTestCard(g, screen, slices) {
  const W = screen.width, H = screen.height, u = Math.max(1, Math.round(Math.min(W, H) / 600));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  // halves (the quadrants of a splitter) and the diagonals
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = u;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2 * u;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H); g.moveTo(W, 0); g.lineTo(0, H); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 4, 0, Math.PI * 2); g.stroke();
  // name and resolution, the colour bars under them
  const text = `${screen.name} · ${W}×${H}`;
  g.font = `600 ${Math.round(56 * u)}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(text).width + 40 * u, th = 90 * u;
  g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(W / 2 - tw / 2, H / 2 - th - 10 * u, tw, th);
  g.fillStyle = '#ffffff'; g.fillText(text, W / 2, H / 2 - th / 2 - 10 * u);
  const bw = Math.round(W / 3 / BARS.length), bh = Math.round(H / 14), bx = Math.round(W / 2 - (bw * BARS.length) / 2), by = Math.round(H / 2 + 10 * u);
  BARS.forEach((c, i) => { g.fillStyle = c; g.fillRect(bx + i * bw, by, bw, bh); });
  // the slices: outline and name (last but the border: above the bars and the title)
  g.strokeStyle = AMBER; g.fillStyle = AMBER; g.lineWidth = 3 * u;
  g.font = `600 ${Math.round(28 * u)}px Geist, system-ui, sans-serif`; g.textBaseline = 'top'; g.textAlign = 'left';
  for (const s of slices) {
    const c = s.corners;
    g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    g.fillText(s.name, c[0][0] + 10 * u, c[0][1] + 10 * u);
  }
  // the border: exactly the screen's outermost pixels
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
}
