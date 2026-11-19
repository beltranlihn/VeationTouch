// The Alma Digital logo, drawn after the liquid as white "screen" light over it (like the website's
// mix-blend-mode: screen layers). Two cropped layers of the studio's 1920x1080 artwork:
//   logo-wordmark.png  the "alma ◎ digital" wordmark with its tagline (white)
//   logo-blob.png      the purple 3D blob behind it
// Both crops keep their position in the original artwork so the two layers line up (LAYOUT, source px).

export const LAYOUT = {
  wordmark: { x: 648, y: 422, w: 675, h: 296 },
  blob: { x: 424, y: 63, w: 1003, h: 952 },
};

const VERTEX = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  uniform vec4 rect; // clip-space x0, y0 (bottom), x1, y1 (top)
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(mix(rect.xy, rect.zw, vUv), 0.0, 1.0);
  }
`;
const FRAGMENT = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float alpha;
  void main () {
    gl_FragColor = vec4(texture2D(uTexture, vUv).rgb * alpha, 0.0); // the textures are premultiplied
  }
`;

/**
 * @param gl      WebGL2 context
 * @param baseUrl where logo-wordmark.png and logo-blob.png live (ends with /)
 * @returns {{ ready: Promise<void>, draw, dispose }}
 */
export function createLogo(gl, baseUrl) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Logo shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, sh(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, sh(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Logo program: ${gl.getProgramInfoLog(program)}`);
  const uRect = gl.getUniformLocation(program, 'rect');
  const uAlpha = gl.getUniformLocation(program, 'alpha');
  const uTexture = gl.getUniformLocation(program, 'uTexture');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const tex = { wordmark: null, blob: null };
  let disposed = false;

  const load = async (name, file) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = baseUrl + file;
    await img.decode();
    if (disposed || gl.isContextLost()) return;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    tex[name] = t;
  };
  const ready = Promise.all([load('wordmark', 'logo-wordmark.png'), load('blob', 'logo-blob.png')]).then(() => {});

  // one layer: source rect (artwork px) → destination px rect, then the clip rect
  function layer(texture, L, cSX, cSY, cx, cy, s, W, H) {
    if (!texture) return;
    const x = cx + (L.x - cSX) * s, y = cy + (L.y - cSY) * s, w = L.w * s, h = L.h * s;
    gl.uniform4f(uRect, x / W * 2 - 1, 1 - (y + h) / H * 2, (x + w) / W * 2 - 1, 1 - y / H * 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTexture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    ready,
    /**
     * Draw the logo centred on (cx, cy) (render px, y down) in a W x H canvas.
     * targetH: height of the composition in px (the wordmark with its tagline, or the whole blob art when withBlob);
     * maxW: it is scaled down to fit this width; scale: extra factor (breathing); alpha: 0..1.
     * Returns the drawn rect through `out` ({x, y, w, h}) when given.
     */
    draw(W, H, cx, cy, targetH, maxW, scale, alpha, withBlob, out = null) {
      if (alpha <= 0.001) return;
      const base = withBlob ? LAYOUT.blob : LAYOUT.wordmark;
      let s = targetH / base.h;
      if (base.w * s > maxW) s = maxW / base.w;
      s *= scale;
      const cSX = base.x + base.w / 2, cSY = base.y + base.h / 2;
      if (out) { out.w = base.w * s; out.h = base.h * s; out.x = cx - out.w / 2; out.y = cy - out.h / 2; }
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // screen: src + dst * (1 - src)
      gl.uniform1f(uAlpha, alpha);
      if (withBlob) layer(tex.blob, LAYOUT.blob, cSX, cSY, cx, cy, s, W, H);
      layer(tex.wordmark, LAYOUT.wordmark, cSX, cSY, cx, cy, s, W, H);
      gl.disable(gl.BLEND);
    },
    dispose() {
      disposed = true;
      if (gl.isContextLost()) return;
      gl.deleteTexture(tex.wordmark); gl.deleteTexture(tex.blob);
      gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteProgram(program);
    },
  };
}
