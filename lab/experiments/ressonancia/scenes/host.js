// Ressonància — the scene host for STUDY pages. One scene (a visual universe of the piece) runs alone on the room strip so its
// look can be reviewed in the lab. The final piece will host the same scene modules, one per chapter, behind the same contract.
//
//   import { runStudy } from '../ressonancia/scenes/host.js';
//   import { create } from '../ressonancia/scenes/<name>.js';
//   runStudy(create);
//
// THE SCENE CONTRACT
//   export function create(env) -> { step(dt, input), draw(target), setParams?(P), dispose?() }
//   env    { gl, vt, HDR, room: { perimeter, height } (m), walls: [{ id, index, x0, width, centre }] (m along the room),
//            size: { w, h } (px of the scene target), pxPerM, VS (a fullscreen-triangle vertex shader with `out vec2 vUv`, y up),
//            HEAD (the GLSL version + precision lines), program(vs, fs) -> { p, u }, target(w, h, { float32? }) -> { tex, fbo, w, h },
//            quad() (draws the fullscreen triangle), roundM(d) (the short way round the room, metres), params (the live parameters) }
//   input  { time, dt, hands, downs, ups, progress, params }
//            hands: [{ stroke, wall (index), x (m round the room), y (m from the floor), u, v (0..1, v up), vx, vy (m/s),
//                      s (0..1: eased presence; a lifted hand fades for ~1.5 s with on = false), on, age (s) }]  — at most 32
//            downs / ups: the hands that landed / left this frame ({ stroke, wall, x, y, u, v })
//            progress: 0..1, the chapter's progress (in a study: the "progress" parameter; in the piece: the director)
//   draw(target): render LINEAR HDR colour into `target` (bind target.fbo, viewport target.w x target.h). The host adds bloom,
//            the tone map (1 - exp(-c * 1.15 * brightness), gamma 2.2) and grain. Black is black: the room is dark.
// Rules: sizes in METRES; everything periodic round the room (x wraps at room.perimeter: no seam between the last wall and the
// first); no allocation per frame; no readPixels; WebGL2 only; no assets, no libraries; any text shown is English.
import { connectExperience } from '/experiences/runtime.js';

export async function runStudy(create) {
  const vt = await connectExperience();
  const canvas = document.getElementById('c');
  canvas.width = vt.size.width; canvas.height = vt.size.height;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) { document.body.textContent = 'WebGL2 is not available on this machine.'; throw new Error('WebGL2 is not available'); }
  const HDR = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const P = Object.assign({ progress: 0, brightness: 1, bloom: 1, quality: 'high' }, vt.params);
  const QUALITY = { low: 0.5, medium: 0.75, high: 1 };

  const HEAD = '#version 300 es\nprecision highp float; precision highp int;\n';
  const VS = HEAD + 'out vec2 vUv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';
  function program(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const full = gl.getActiveUniform(p, i).name; u[full.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, full); }
    return { p, u };
  }
  function target(w, h, o = {}) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    const f32 = o.float32 && HDR;
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? (f32 ? gl.RGBA32F : gl.RGBA16F) : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? (f32 ? gl.FLOAT : gl.HALF_FLOAT) : gl.UNSIGNED_BYTE, null);
    const filter = o.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);   // REPEAT in x: the seam is not a seam
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  const vao = gl.createVertexArray();
  const quad = () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); };

  const room = { perimeter: vt.walls.reduce((a, w) => a + w.width, 0) || 27.6, height: vt.walls.reduce((a, w) => Math.max(a, w.height), 0) || 3.5 };
  const walls = vt.walls.map((w, index) => { const x0 = (w.rect.x / vt.size.width) * room.perimeter, width = (w.rect.w / vt.size.width) * room.perimeter; return { id: w.id, index, x0, width, centre: x0 + width / 2 }; });
  const wallIndex = new Map(vt.walls.map((w, i) => [w.id, i]));
  const roundM = (d) => d - room.perimeter * Math.round(d / room.perimeter);
  const k = QUALITY[P.quality] || 1, sw = Math.max(64, Math.round(vt.size.width * k)), sh = Math.max(16, Math.round(vt.size.height * k));
  const q = (d) => [Math.max(16, Math.round(sw / d)), Math.max(4, Math.round(sh / d))];
  const T = { scene: target(sw, sh), b1a: target(...q(4)), b1b: target(...q(4)), b2a: target(...q(16)), b2b: target(...q(16)) };

  const brightP = program(VS, HEAD + `uniform sampler2D uTex; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
void main(){ vec3 c = (texture(uTex, vUv + uTexel * vec2(-1.0,-1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,-1.0)).rgb + texture(uTex, vUv + uTexel * vec2(-1.0,1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(0.18, 0.95, l), 1.0); }`);
  const blurP = program(VS, HEAD + `uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846154).rgb + texture(uTex, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2307692).rgb + texture(uTex, vUv - uDir * 3.2307692).rgb) * 0.0702703; o = vec4(c, 1.0); }`);
  const finalP = program(VS, HEAD + `uniform sampler2D uScene, uB1, uB2; uniform float uBright, uBloom, uTime; in vec2 vUv; out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){ vec3 c = texture(uScene, vUv).rgb + (texture(uB1, vUv).rgb * 0.40 + texture(uB2, vUv).rgb * 0.55) * uBloom;
  c = 1.0 - exp(-max(c, 0.0) * 1.15 * uBright); c = pow(c, vec3(1.0 / 2.2)); c += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0; o = vec4(c, 1.0); }`);

  const env = { gl, vt, HDR, room, walls, size: { w: sw, h: sh }, pxPerM: sh / room.height, VS, HEAD, program, target, quad, roundM, params: P };
  const scene = create(env);
  vt.on('params', (p) => { Object.assign(P, p); scene.setParams?.(P); });

  // hands: eased presence, metres, velocity; a lifted hand lingers (on = false) while it fades
  const MAXH = 32, known = new Map(), hands = [], downs = [], ups = [];
  let time = 0;
  function frame(dt) {
    time += dt; downs.length = 0; ups.length = 0;
    for (const h of known.values()) h.live = false;
    for (const r of vt.hands()) {
      const u = r.x / vt.size.width, v = 1 - r.y / vt.size.height, x = u * room.perimeter, y = v * room.height;
      let h = known.get(r.stroke);
      if (!h) { if (known.size >= MAXH) continue; h = { stroke: r.stroke, wall: 0, x, y, u, v, vx: 0, vy: 0, s: 0, on: true, age: 0, live: true }; known.set(r.stroke, h); downs.push(h); }
      const ppm = vt.walls[wallIndex.get(r.wallId) ?? 0]?.pxPerM || 261;
      h.wall = wallIndex.get(r.wallId) ?? 0; h.x = x; h.y = y; h.u = u; h.v = v; h.vx = (r.vx || 0) / ppm; h.vy = -(r.vy || 0) / ppm; h.live = true; h.on = true;
    }
    hands.length = 0;
    for (const [key, h] of known) {
      if (!h.live && h.on) { h.on = false; h.vx = 0; h.vy = 0; ups.push(h); }
      h.age += dt; h.s += ((h.on ? 1 : 0) - h.s) * (1 - Math.exp(-dt * (h.on ? 14 : 2.2)));
      if (!h.on && h.s < 0.01) { known.delete(key); continue; }
      hands.push(h);
    }
    scene.step(dt, { time, dt, hands, downs, ups, progress: Math.min(1, Math.max(0, P.progress || 0)), params: P });
    gl.disable(gl.BLEND);
    scene.draw(T.scene);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const pass = (prog, dst, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null); gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height); gl.useProgram(prog.p); setup(prog.u); quad(); };
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    pass(brightP, T.b1a, (u) => { bind(0, T.scene.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / T.scene.w, 1 / T.scene.h); });
    const blur = (src, dst, dx, dy) => pass(blurP, dst, (u) => { bind(0, src.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, dx / src.w, dy / src.h); });
    blur(T.b1a, T.b1b, 1, 0); blur(T.b1b, T.b1a, 0, 1); blur(T.b1a, T.b2a, 2, 0); blur(T.b2a, T.b2b, 1, 0); blur(T.b2b, T.b2a, 0, 1);
    pass(finalP, null, (u) => { bind(0, T.scene.tex); bind(1, T.b1a.tex); bind(2, T.b2a.tex); gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uB1, 1); gl.uniform1i(u.uB2, 2); gl.uniform1f(u.uBright, P.brightness); gl.uniform1f(u.uBloom, P.bloom); gl.uniform1f(u.uTime, time); });
  }
  window.__study = { env, scene, hands: () => hands };   // for the lab's checks only
  vt.loop(frame, gl);
}
