/* ============================================================
   Fluid Lab — WebGL Fluid Simulation (Alma Digital Studio)
   ------------------------------------------------------------
   Extraído tal cual del fondo de `Alma Digital Portfolio/index.html`
   (líneas 1971–3538). Base: fork de PavelDoGreat/WebGL-Fluid-Simulation.

   Únicos cambios respecto al original, para poder experimentar:
   - Los multiplicadores de color hardcodeados pasaron a `config`:
       0.119 → COLOR_INTENSITY    (generateColor)
       0.162 → POINTER_INTENSITY  (splatPointer)
       0.097 → EMITTER_INTENSITY  (auto-emitters)
   - La paleta vive en `PALETTE` (antes estaba inline en generateColor)
   - Los auto-emitters se crean con `buildEmitters(n)` para poder
     cambiar la cantidad en caliente
   - Se expone `window.FluidLab` para el panel de control
   ============================================================ */

/* ------------------------------------------------------------
   VEATION Touch port (experiences/alma-fluid)
   Upstream: PavelDoGreat/WebGL-Fluid-Simulation, MIT (see LICENSE-fluid.txt).
   Differences from the website fluid, all needed for a wall-sized strip:
   - A module instead of a page script: no DOM listeners, no requestAnimationFrame, no window globals.
     createFluid(gl, opts) returns an object; the experience feeds it touches and calls step()/render().
   - Any aspect ratio (a room strip is ~8:1): simulation and dye textures follow the canvas aspect, splat
     radii are in units of the canvas HEIGHT (so they look the same on any width), emitters spread over the width.
   - Optional horizontal wrap (opts.wrapX) for rooms whose walls close a loop: REPEAT on x for velocity, dye,
     pressure and divergence; splats wrap around the seam.
   - Splats are added with additive blending into the current texture, limited by a scissor box, instead of a
     full-texture ping-pong pass: the dye texture of a strip is millions of pixels and a room has many splats.
   - The curl/vorticity passes only run when CONFIG.CURL > 0 (the website uses 0, where they change nothing).
   - Bloom, sunrays, shading, screenshots and the WebGL1 fallback are dropped (all off on the website).
   - Uniform locations are looked up once, nothing is allocated per frame.
   The look (PALETTE, colour intensities, emitters, dissipation, background) is the website's.
   ------------------------------------------------------------ */

// The website's settings (those that matter here)
export const CONFIG = {
  COLOR_INTENSITY: 0.119,   // global multiplier of generateColor
  POINTER_INTENSITY: 0.162, // multiplier of a pointer splat's dye
  EMITTER_INTENSITY: 0.097, // multiplier of the auto-emitters' dye
  SIM_RESOLUTION: 128,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 8,
  CURL: 0,
  SPLAT_RADIUS: 0.9,        // website value; see EMITTER_SIGMA for what it means on a strip
  SPLAT_FORCE: 1200,
  VELOCITY_DISSIPATION: 0.999,
  DENSITY_DISSIPATION: 0.999,
  BACK_COLOR: { r: 173, g: 200, b: 237 },
  REF_ASPECT: 16 / 9,       // the aspect the website's splat radius was tuned on
  // The room's ambience (not the website's numbers): bigger, softer emitters that always keep the whole strip moving
  EMITTER_SIZE_GAIN: 1,     // x the website's emitter sigma (EMITTER_SIGMA) at emitterSize 1: the website's own size
  EMITTER_FLOW: 0.15,       // an emitter's push: the website's value
};

/**
 * How many emitters a strip gets. `perScreen` is the count for one 16:9 screen (the website's density, 12); a strip that is
 * 4.5 screens wide gets 4.5 times as many, so every screen-width of wall looks like the website.
 */
export function emitterCount(perScreen, aspect) {
  return Math.max(0, Math.round(Math.max(0, perScreen) * Math.max(aspect, 0.1) / CONFIG.REF_ASPECT));
}

// Splat sigma (gaussian, in canvas heights) of the website's emitters: sqrt(0.009 * 16/9 / 2)
export const EMITTER_SIGMA = Math.sqrt((CONFIG.SPLAT_RADIUS / 100) * CONFIG.REF_ASPECT / 2);

// Alma Digital Studio — paleta oficial (los duplicados son pesos: más
// entradas del mismo color = más probabilidad de salir sorteado)
export const PALETTE = [
  { r: 53,  g: 48,  b: 160 }, // #3530a0 — índigo profundo
  { r: 53,  g: 48,  b: 160 }, // #3530a0 — índigo (doble peso)
  { r: 53,  g: 48,  b: 160 }, // #3530a0 — índigo (triple peso)
  { r: 222, g: 121, b: 255 }, // #de79ff — rosa brillante
  { r: 130, g: 130, b: 255 }, // #8282ff — periwinkle
  { r: 251, g: 194, b: 255 }, // #fbc2ff — rosa suave
  { r: 154, g: 62,  b: 199 }, // #9a3ec7 — púrpura medio
  { r: 154, g: 62,  b: 199 }, // #9a3ec7 — púrpura (doble peso)
  { r: 130, g: 130, b: 255 }, // #8282ff — periwinkle (doble peso)
  { r: 222, g: 121, b: 255 }, // #de79ff — rosa (doble peso)
];

const jitter = () => (Math.random() - 0.5) * 12;
const c8 = (v) => Math.max(0, Math.min(255, v)) / 255;

/** A random palette colour (with the website's jitter and COLOR_INTENSITY) written into out[0..2]. */
export function generateColor(out, base = null) {
  const b = base || PALETTE[Math.floor(Math.random() * PALETTE.length)];
  out[0] = c8(b.r + jitter()) * CONFIG.COLOR_INTENSITY;
  out[1] = c8(b.g + jitter()) * CONFIG.COLOR_INTENSITY;
  out[2] = c8(b.b + jitter()) * CONFIG.COLOR_INTENSITY;
  return out;
}

/* ------------------------------------------------------------
   Auto-emitters: slow organic drifters that keep the background alive
   ------------------------------------------------------------ */

/**
 * `count` emitters spread over the strip; existing ones in `prev` are kept (the count changes live).
 * Positions are in uv (0..1 over the whole canvas).
 */
export function buildEmitters(count, aspect, prev = []) {
  const n = Math.max(0, Math.round(count));
  const cols = Math.max(1, Math.round(Math.sqrt(n * Math.max(aspect, 0.1))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out = prev.slice(0, n);
  for (let i = out.length; i < n; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const em = {
      // one per column cell, jittered inside it: the whole strip is covered, ends included (a room has no "edge" to keep clear)
      x: (col + 0.5 + (Math.random() - 0.5) * 0.8) / cols,
      y: (rows > 1 ? row / (rows - 1) : 0.5) * 0.8 + 0.1 + (Math.random() - 0.5) * 0.15,
      angle: Math.random() * Math.PI * 2,
      angleSpeed: (Math.random() * 0.04 + 0.01) * (Math.random() < 0.5 ? 1 : -1),
      speed: 0.006 + Math.random() * 0.006,
      color: generateColor(new Float32Array(3)),
      colorTimer: 0,
      colorInterval: 3 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
    };
    out.push(em);
  }
  return out;
}

/**
 * Move and emit. `emit(x, y, dx, dy, r, g, b, sigma)` is fluid.splat. `wrapX`: the strip is a loop.
 * `time` is the running clock in seconds.
 */
export function updateAutoEmitters(emitters, dt, time, speedScale, aspect, wrapX, emit, look = null) {
  const wobbleT = time * 0.06;
  const xScale = CONFIG.REF_ASPECT / Math.max(aspect, 0.1); // drift is isotropic in pixels, not in uv
  const ambience = look && look.ambience != null ? look.ambience : 1; // strength of the wash (colour and push)
  const sigma = EMITTER_SIGMA * CONFIG.EMITTER_SIZE_GAIN * (look && look.size != null ? look.size : 1);
  const k = CONFIG.EMITTER_INTENSITY * ambience;
  for (let i = 0; i < emitters.length; i++) {
    const em = emitters[i];
    em.angle += em.angleSpeed * dt;
    const wobble = Math.sin(em.phase + wobbleT) * 0.3;
    const speed = em.speed * speedScale;
    em.x += Math.cos(em.angle + wobble) * speed * dt * xScale;
    em.y += Math.sin(em.angle + wobble) * speed * dt;

    if (wrapX) {
      em.x -= Math.floor(em.x);
    } else {
      if (em.x < 0.05) { em.x = 0.05; em.angle = Math.PI - em.angle; }
      if (em.x > 0.95) { em.x = 0.95; em.angle = Math.PI - em.angle; }
    }
    if (em.y < 0.05) { em.y = 0.05; em.angle = -em.angle; }
    if (em.y > 0.95) { em.y = 0.95; em.angle = -em.angle; }

    em.colorTimer += dt;
    if (em.colorTimer >= em.colorInterval) {
      em.colorTimer = 0;
      generateColor(em.color);
    }

    // a soft splat — the colour is scaled down to avoid burn
    const push = CONFIG.SPLAT_FORCE * CONFIG.EMITTER_FLOW * ambience;
    emit(em.x, em.y, Math.cos(em.angle) * speed * push, Math.sin(em.angle) * speed * push, em.color[0] * k, em.color[1] * k, em.color[2] * k, sigma);
  }
}

/* ------------------------------------------------------------
   Shaders (the website's, GLSL ES 1.00 — valid in WebGL2)
   ------------------------------------------------------------ */

const baseVertexSource = `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const copySource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`;

const clearSource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`;

// Display: the website's drawColor(BACK_COLOR) + drawDisplay (rgb = dye, a = max channel) in one pass,
// plus the website's dithering texture (±1/255) against banding in the dark gradients.
const displaySource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec3 backColor;
    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float a = max(c.r, max(c.g, c.b));
        float noise = texture2D(uDithering, vUv * ditherScale).r * 2.0 - 1.0;
        gl_FragColor = vec4(c + backColor * (1.0 - a) + noise / 255.0, 1.0);
    }
`;

// Additive splat (blended into the target): the gaussian only. With WRAP_X the x distance goes the short way
// round the seam.
const splatSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    uniform float wrapX;
    uniform float tintW;
    void main () {
        vec2 p = vUv - point.xy;
        p.x -= wrapX * floor(p.x + 0.5);
        p.x *= aspectRatio;
        float g = exp(-dot(p, p) / radius);
        // tintW 0: the plain additive splat. tintW > 0 (a tint, blended ONE / ONE_MINUS_SRC_ALPHA): colour = target * w, alpha = w
        gl_FragColor = vec4(g * color, g * tintW);
    }
`;

const advectionSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
    }
`;

const divergenceSource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
    #ifndef WRAP_X
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
    #endif
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`;

const curlSource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`;

const vorticitySource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

const pressureSource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`;

const gradientSubtractSource = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

/* ------------------------------------------------------------
   The fluid
   ------------------------------------------------------------ */

/**
 * @param gl    WebGL2 context (the canvas is exactly the render size)
 * @param opts  { width, height (canvas px), wrapX (bool), dyeShort (dye short side, px), simShort (simulation short side, default CONFIG.SIM_RESOLUTION) }
 */
export function createFluid(gl, opts) {
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) throw new Error('WebGL2 is required');
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_float_blend');
  const wrapX = !!opts.wrapX;
  const W = opts.width, H = opts.height;
  const aspect = W / H;
  const HALF = gl.HALF_FLOAT;

  const fmt = (internal, format, fallback) => {
    const probe = supportRender(gl, internal, format, HALF);
    return probe ? { internalFormat: internal, format } : fallback;
  };
  const formatRGBA = fmt(gl.RGBA16F, gl.RGBA, null);
  if (!formatRGBA) throw new Error('Half-float render targets are not supported');
  const formatRG = fmt(gl.RG16F, gl.RG, formatRGBA);
  const formatR = fmt(gl.R16F, gl.RED, formatRG);

  // ---- programs (uniform locations are looked up once) ----
  const vertex = compile(gl, gl.VERTEX_SHADER, baseVertexSource);
  const mk = (src, defs) => makeProgram(gl, vertex, compile(gl, gl.FRAGMENT_SHADER, src, defs));
  const P = {
    copy: mk(copySource), clear: mk(clearSource), display: mk(displaySource), splat: mk(splatSource),
    advection: mk(advectionSource), divergence: mk(divergenceSource, wrapX ? ['WRAP_X'] : null),
    curl: mk(curlSource), vorticity: mk(vorticitySource), pressure: mk(pressureSource), gradient: mk(gradientSubtractSource),
  };

  // ---- full-screen quad (attribute 0) ----
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const blit = (target) => {
    if (target == null) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.width, target.height); }
    draw();
  };

  // ---- textures ----
  const wrapS = wrapX ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  function createFBO(w, h, f, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internalFormat, w, h, 0, f.format, HALF, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
      dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); },
    };
  }
  function createDoubleFBO(w, h, f, filter) {
    let a = createFBO(w, h, f, filter), b = createFBO(w, h, f, filter);
    return {
      width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
      get read() { return a; }, set read(v) { a = v; },
      get write() { return b; }, set write(v) { b = v; },
      swap() { const t = a; a = b; b = t; },
      dispose() { a.dispose(); b.dispose(); },
    };
  }
  // a new size keeps what is in the old texture (stretched), as the website's resize does; `gain` rescales the values
  // (velocity is in simulation texels/s, so a finer simulation grid needs proportionally larger numbers)
  function resizeDouble(target, w, h, f, filter, gain = 1) {
    if (target.width === w && target.height === h) return target;
    const next = createDoubleFBO(w, h, f, filter);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    if (gain === 1) {
      P.copy.bind();
      gl.uniform1i(P.copy.u.uTexture, target.read.attach(0));
    } else {
      P.clear.bind();
      gl.uniform1i(P.clear.u.uTexture, target.read.attach(0));
      gl.uniform1f(P.clear.u.value, gain);
    }
    blit(next.read);
    target.dispose();
    return next;
  }

  // ---- resolutions: the textures follow the canvas aspect (a strip is ~8:1) ----
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  function resolution(short, cap) {
    let s = Math.max(16, Math.round(short));
    if (cap) s = Math.min(s, Math.round(Math.min(W, H)));
    let w, h;
    if (W >= H) { h = s; w = Math.round(s * aspect); } else { w = s; h = Math.round(s / aspect); }
    const over = Math.max(w, h) / maxTex;
    if (over > 1) { w = Math.floor(w / over); h = Math.floor(h / over); }
    return { width: Math.max(2, w), height: Math.max(2, h) };
  }

  let dye = null, velocity = null, divergence = null, curl = null, pressure = null;
  let simShort = opts.simShort || CONFIG.SIM_RESOLUTION;
  let simRes = resolution(simShort, false);

  function init(dyeShort, nextSimShort = simShort) {
    const dyeRes = resolution(dyeShort, true); // never finer than the canvas itself
    const linear = gl.LINEAR, nearest = gl.NEAREST;
    gl.disable(gl.BLEND);
    dye = dye ? resizeDouble(dye, dyeRes.width, dyeRes.height, formatRGBA, linear) : createDoubleFBO(dyeRes.width, dyeRes.height, formatRGBA, linear);
    const nextSim = resolution(nextSimShort, false);
    if (!velocity) velocity = createDoubleFBO(nextSim.width, nextSim.height, formatRG, linear);
    else if (nextSim.width !== simRes.width || nextSim.height !== simRes.height) {
      velocity = resizeDouble(velocity, nextSim.width, nextSim.height, formatRG, linear, nextSim.height / simRes.height);
      divergence.dispose(); curl.dispose(); pressure.dispose();
      divergence = null;
    }
    simShort = nextSimShort;
    simRes = nextSim;
    if (!divergence) {
      divergence = createFBO(simRes.width, simRes.height, formatR, nearest);
      curl = createFBO(simRes.width, simRes.height, formatR, nearest);
      pressure = createDoubleFBO(simRes.width, simRes.height, formatR, nearest);
    }
  }
  init(opts.dyeShort || 512);
  // velocities are given in texels of the 128-texel reference simulation: a finer grid scales them to move the liquid alike
  const velGain = () => simRes.height / resolution(CONFIG.SIM_RESOLUTION, false).height;

  // ---- the dithering texture (the website's), loaded later ----
  const dither = { texture: gl.createTexture(), width: 1, height: 1 };
  gl.bindTexture(gl.TEXTURE_2D, dither.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128])); // neutral until loaded

  // ---- splat: additive, only inside the splat's box ----
  function splatBox(target, x, y, d) {
    const w = target.width, h = target.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    const y0 = Math.max(0, Math.floor((y - d) * h)), y1 = Math.min(h, Math.ceil((y + d) * h));
    if (y1 <= y0) return;
    const hx = Math.ceil(d * h) + 1; // texels are square, so d (canvas heights) is d*h texels on both axes
    const cx = x * w;
    const x0 = Math.floor(cx) - hx, x1 = Math.ceil(cx) + hx;
    if (wrapX && x1 - x0 < w) {
      scissorDraw(Math.max(0, x0), y0, Math.min(w, x1), y1);
      if (x0 < 0) scissorDraw(w + x0, y0, w, y1);
      if (x1 > w) scissorDraw(0, y0, x1 - w, y1);
    } else {
      scissorDraw(Math.max(0, x0), y0, Math.min(w, x1), y1);
    }
  }
  function scissorDraw(x0, y0, x1, y1) {
    if (x1 <= x0 || y1 <= y0) return;
    gl.scissor(x0, y0, x1 - x0, y1 - y0);
    draw();
  }

  const api = {
    width: W, height: H, aspect,
    get simWidth() { return simRes.width; }, get simHeight() { return simRes.height; },
    get dyeWidth() { return dye.width; }, get dyeHeight() { return dye.height; },
    wrapX,

    /** Change the dye resolution (short side, px) and optionally the simulation's; the content is kept. */
    setQuality(dyeShort, simShortNext) { init(dyeShort, simShortNext || simShort); },

    /** The dithering image arrived. */
    setDither(image) {
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, dither.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      dither.width = image.naturalWidth || image.width || 1;
      dither.height = image.naturalHeight || image.height || 1;
    },

    /**
     * Add a splat. x, y: uv (0..1, y up). dx, dy: velocity in simulation texels/s. r, g, b: dye.
     * sigma: gaussian width in canvas heights.
     */
    splat(x, y, dx, dy, r, g, b, sigma) {
      if (wrapX) x -= Math.floor(x);
      else if (x < -0.5 || x > 1.5) return;
      gl.bindVertexArray(vao);
      const radius = 2 * sigma * sigma;
      const d = Math.sqrt(8 * radius); // e^-8 at the box edge
      P.splat.bind();
      gl.uniform1f(P.splat.u.aspectRatio, aspect);
      gl.uniform2f(P.splat.u.point, x, y);
      gl.uniform1f(P.splat.u.radius, radius);
      gl.uniform1f(P.splat.u.wrapX, wrapX ? 1 : 0);
      gl.uniform1f(P.splat.u.tintW, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.SCISSOR_TEST);
      const vg = velGain();
      gl.uniform3f(P.splat.u.color, dx * vg, dy * vg, 0);
      splatBox(velocity.read, x, y, d);
      gl.uniform3f(P.splat.u.color, r, g, b);
      splatBox(dye.read, x, y, d);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
    },

    /**
     * Tint the dye: pull it toward the colour (r, g, b: dye, as for splat) by w (0..1) at the centre of a gaussian splat,
     * dye' = mix(dye, target, w * gaussian). One small scissored draw with blend ONE / ONE_MINUS_SRC_ALPHA; the velocity is untouched.
     */
    tint(x, y, r, g, b, w, sigma) {
      if (!(w > 0)) return;
      if (wrapX) x -= Math.floor(x);
      else if (x < -0.5 || x > 1.5) return;
      w = Math.min(w, 1);
      gl.bindVertexArray(vao);
      const radius = 2 * sigma * sigma;
      const d = Math.sqrt(8 * radius);
      P.splat.bind();
      gl.uniform1f(P.splat.u.aspectRatio, aspect);
      gl.uniform2f(P.splat.u.point, x, y);
      gl.uniform1f(P.splat.u.radius, radius);
      gl.uniform1f(P.splat.u.wrapX, wrapX ? 1 : 0);
      gl.uniform1f(P.splat.u.tintW, w);
      gl.uniform3f(P.splat.u.color, r * w, g * w, b * w);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.SCISSOR_TEST);
      splatBox(dye.read, x, y, d);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
    },

    /** Advance the simulation by dt seconds. */
    step(dt, dyeDissipation = CONFIG.DENSITY_DISSIPATION, velocityDissipation = CONFIG.VELOCITY_DISSIPATION) {
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);

      if (CONFIG.CURL > 0) {
        P.curl.bind();
        gl.uniform2f(P.curl.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.curl.u.uVelocity, velocity.read.attach(0));
        blit(curl);

        P.vorticity.bind();
        gl.uniform2f(P.vorticity.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.vorticity.u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(P.vorticity.u.uCurl, curl.attach(1));
        gl.uniform1f(P.vorticity.u.curl, CONFIG.CURL);
        gl.uniform1f(P.vorticity.u.dt, dt);
        blit(velocity.write);
        velocity.swap();
      }

      P.divergence.bind();
      gl.uniform2f(P.divergence.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(P.divergence.u.uVelocity, velocity.read.attach(0));
      blit(divergence);

      P.clear.bind();
      gl.uniform1i(P.clear.u.uTexture, pressure.read.attach(0));
      gl.uniform1f(P.clear.u.value, CONFIG.PRESSURE);
      blit(pressure.write);
      pressure.swap();

      P.pressure.bind();
      gl.uniform2f(P.pressure.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(P.pressure.u.uDivergence, divergence.attach(0));
      for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(P.pressure.u.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      P.gradient.bind();
      gl.uniform2f(P.gradient.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(P.gradient.u.uPressure, pressure.read.attach(0));
      gl.uniform1i(P.gradient.u.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      P.advection.bind();
      gl.uniform2f(P.advection.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      const vId = velocity.read.attach(0);
      gl.uniform1i(P.advection.u.uVelocity, vId);
      gl.uniform1i(P.advection.u.uSource, vId);
      gl.uniform1f(P.advection.u.dt, dt);
      gl.uniform1f(P.advection.u.dissipation, velocityDissipation);
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(P.advection.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(P.advection.u.uSource, dye.read.attach(1));
      gl.uniform1f(P.advection.u.dissipation, dyeDissipation);
      blit(dye.write);
      dye.swap();
    },

    /** Draw the liquid over the website's background colour into the default framebuffer. */
    render() {
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      P.display.bind();
      gl.uniform1i(P.display.u.uTexture, dye.read.attach(0));
      gl.uniform1i(P.display.u.uDithering, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dither.texture);
      gl.uniform2f(P.display.u.ditherScale, gl.drawingBufferWidth / dither.width, gl.drawingBufferHeight / dither.height);
      const bc = CONFIG.BACK_COLOR;
      gl.uniform3f(P.display.u.backColor, bc.r / 255, bc.g / 255, bc.b / 255);
      blit(null);
    },

    /** Zero everything (a fresh liquid). */
    clear() {
      for (const t of [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.width, t.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },

    /** Free the GPU resources (the context is kept). */
    dispose() {
      if (gl.isContextLost()) return;
      dye.dispose(); velocity.dispose(); pressure.dispose(); divergence.dispose(); curl.dispose();
      gl.deleteTexture(dither.texture);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      for (const p of Object.values(P)) gl.deleteProgram(p.program);
    },
  };
  return api;
}

/* ------------------------------------------------------------ helpers */

function supportRender(gl, internalFormat, format, type) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(texture);
  return ok;
}

function compile(gl, type, source, defines) {
  const src = (defines ? defines.map((d) => `#define ${d}\n`).join('') : '') + source;
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

function makeProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program error: ${gl.getProgramInfoLog(program)}`);
  const u = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(program, i).name;
    u[name] = gl.getUniformLocation(program, name);
  }
  return { program, u, bind() { gl.useProgram(program); } };
}
