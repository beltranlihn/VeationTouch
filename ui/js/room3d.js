// 3D view of the room (Live › 3D): the walls standing on the floor in plan (`wall.turn` = corner to the next wall),
// each one showing its part of the content, its zones and masks; the live touches, the sensors and the LiDAR points
// on top. Read-only except the virtual hand, which touches the wall under the pointer. Own WebGL2, no dependency
// (the same approach as VEATION's room view).
//   drag = orbit · right-drag / Shift-drag / two fingers = pan · wheel / pinch = zoom · double-click = reset
// Walls are single-sided (they face into the room), so from outside the near walls disappear and you look inside
// like a doll's house; their outlines stay.

import { store } from './conn.js';
import { roomPlan, shapeOutline, densify, apply as applyM } from '/shared/geometry.js';
import { canvasZoneOnWall } from './shapes.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const rgba = (hex, a = 1) => { const n = parseInt(hex.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ small mat4 / vec3 (column-major)

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

// ------------------------------------------------------------------ GL helpers

const VS_TEX = `#version 300 es
in vec3 a_pos; in vec2 a_uv; uniform mat4 u_vp; out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_vp * vec4(a_pos, 1.0); }`;
const FS_TEX = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha; out vec4 o;
void main() { o = texture(u_tex, v_uv) * u_alpha; }`;
// solids, lines, points and discs (q.z = 1: a disc with a brighter rim, q.xy in −1…1)
const VS_COL = `#version 300 es
in vec3 a_pos; in vec4 a_col; in vec3 a_q; uniform mat4 u_vp; uniform float u_ps; out vec4 v_col; out vec3 v_q;
void main() { v_col = a_col; v_q = a_q; gl_Position = u_vp * vec4(a_pos, 1.0); gl_PointSize = u_ps; }`;
const FS_COL = `#version 300 es
precision mediump float; in vec4 v_col; in vec3 v_q; out vec4 o;
void main() {
  float a = v_col.a;
  if (v_q.z > 0.5) { float d = length(v_q.xy); if (d > 1.0) discard; a *= mix(0.45, 1.0, smoothstep(0.68, 0.85, d)) * (1.0 - smoothstep(0.93, 1.0, d)); }
  o = vec4(v_col.rgb * a, a);
}`;

function program(gl, vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** Growable vertex list for the colour program: pos3 col4 q3. */
class Batch {
  constructor() { this.a = new Float32Array(4096); this.n = 0; }
  clear() { this.n = 0; }
  v(p, c, q = [0, 0, 0]) {
    if (this.n + 10 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const a = this.a; let k = this.n;
    a[k++] = p[0]; a[k++] = p[1]; a[k++] = p[2]; a[k++] = c[0]; a[k++] = c[1]; a[k++] = c[2]; a[k++] = c[3]; a[k++] = q[0]; a[k++] = q[1]; a[k++] = q[2];
    this.n = k;
  }
  line(p, q, c) { this.v(p, c); this.v(q, c); }
  /** Quad p0 p1 p2 p3 (counter-clockwise as seen from the front) as two triangles. */
  quad(p0, p1, p2, p3, c, disc = false) {
    const z = disc ? 1 : 0;
    this.v(p0, c, [-1, -1, z]); this.v(p1, c, [1, -1, z]); this.v(p2, c, [1, 1, z]);
    this.v(p0, c, [-1, -1, z]); this.v(p2, c, [1, 1, z]); this.v(p3, c, [-1, 1, z]);
  }
  get count() { return this.n / 10; }
}

// ------------------------------------------------------------------ the view

export class Room3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{hand:(wallId:string,x:number,y:number,phase:string,id:string)=>void, ws:object}} hooks
   *        ws = the 2D workspace (tool, showPoints, showContent are shared with it)
   */
  constructor(canvas, hooks) {
    this.c = canvas;
    this.hooks = hooks;
    this.active = false;
    this.cam = null;            // {yaw, pitch, dist, target:[x,y,z]}
    this.walls = new Map();     // wall id → {tex, cv, key}
    this.pointers = new Map();
    this.ok = this._init();
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    canvas.addEventListener('webglcontextrestored', () => { this.walls.clear(); this.ok = this._init(); });
    this._bind();
    new ResizeObserver(() => this._resize()).observe(canvas);
  }

  _init() {
    const gl = this.c.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
    if (!gl) return false;
    this.gl = gl;
    try {
      this.pTex = program(gl, VS_TEX, FS_TEX);
      this.pCol = program(gl, VS_COL, FS_COL);
    } catch (e) { console.error(e); return false; }
    this.bufTex = gl.createBuffer();
    this.bufCol = gl.createBuffer();
    this.vaoTex = gl.createVertexArray();
    gl.bindVertexArray(this.vaoTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTex);
    const lt = (n) => gl.getAttribLocation(this.pTex, n);
    gl.enableVertexAttribArray(lt('a_pos')); gl.vertexAttribPointer(lt('a_pos'), 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(lt('a_uv')); gl.vertexAttribPointer(lt('a_uv'), 2, gl.FLOAT, false, 20, 12);
    this.vaoCol = gl.createVertexArray();
    gl.bindVertexArray(this.vaoCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    const lc = (n) => gl.getAttribLocation(this.pCol, n);
    gl.enableVertexAttribArray(lc('a_pos')); gl.vertexAttribPointer(lc('a_pos'), 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(lc('a_col')); gl.vertexAttribPointer(lc('a_col'), 4, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(lc('a_q')); gl.vertexAttribPointer(lc('a_q'), 3, gl.FLOAT, false, 40, 28);
    gl.bindVertexArray(null);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.colors = { live: css('--live') || '#4FC3E8', attn: css('--attn') || '#E5B567', danger: css('--danger') || '#E06C6C', ok: css('--ok-ink') || '#7FC4A2', bg: css('--well-deep') || '#0d0d0d' };
    this.batch = new Batch();
    return true;
  }

  get P() { return store.state?.profile; }

  setActive(on) {
    if (on && !this.ok) return false;
    this.active = on;
    this.c.hidden = !on;
    if (on) { this._resize(); if (!this.cam) this.reset(); this._loop(); }
    return true;
  }

  _loop() {
    if (!this.active) return;
    try { this.draw(); } catch (e) { console.error(e); }
    requestAnimationFrame(() => this._loop());
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = Math.max(1, Math.round(r.width * dpr)); this.c.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
  }

  /** Frame the whole room from above, at three-quarters. */
  reset() {
    const plan = this._plan();
    let ext = 4, hMax = 3;
    if (plan.length) {
      const xs = plan.flatMap((o) => [o.p0[0], o.p0[0] + o.dir[0] * o.width]), ys = plan.flatMap((o) => [o.p0[1], o.p0[1] + o.dir[1] * o.width]);
      ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 2);
      hMax = Math.max(...plan.map((o) => o.height));
    }
    this.cam = { yaw: -0.55, pitch: 0.62, dist: ext * 1.95, target: [0, hMax * 0.3, 0], inside: false };
    this.hooks.changed?.();
  }

  /** Stand in the middle of the room at eye height and look around. */
  inside() {
    const hMax = Math.max(2, ...this._plan().map((o) => o.height));
    this.cam = { yaw: this.cam?.yaw ?? 0, pitch: 0.05, dist: 0.05, target: [0, Math.min(1.6, hMax * 0.5), 0], inside: true };
    this.hooks.changed?.();
  }

  // plan (x east, y north) → world (x, height, −y)
  _plan() {
    const P = this.P;
    if (!P) return [];
    // the data is one continuous surface: a room that (almost) closes is drawn closed — measured widths never
    // match to the centimetre, and a gap at one corner would read as a wall that is not joined
    if (this._planFor !== P.walls) { this._planFor = P.walls; this._planCache = roomPlan(P.walls, { close: true }); }
    return this._planCache;
  }
  static W(o, x, y, off = 0) { return [o.p0[0] + o.dir[0] * x + o.normal[0] * off, y, -(o.p0[1] + o.dir[1] * x + o.normal[1] * off)]; }

  _eye() {
    const c = this.cam;
    return [c.target[0] + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.target[1] + c.dist * Math.sin(c.pitch), c.target[2] + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw)];
  }

  _viewProj() {
    const eye = this._eye();
    const proj = perspective(this.cam.inside ? 1.15 : 0.75, (this.w || 1) / (this.h || 1), 0.03, 400);
    return { vp: mul(proj, lookAt(eye, this.cam.target, [0, 1, 0])), eye };
  }

  // ------------------------------------------------------------------ wall textures (content, zones, masks)

  _underlay() {
    const u = store.state?.underlay?.url;
    if (!this.hooks.ws.showContent || !u) return null;
    if (this._ulUrl !== u) { this._ulUrl = u; this._ul = null; const img = new Image(); img.onload = () => { if (this._ulUrl === u) this._ul = img; }; img.src = u; }
    return this._ul;
  }

  _wallTexture(w) {
    const gl = this.gl, P = this.P;
    const ul = this._underlay();
    const live = store.live?.zones || {};
    const zones = P.zones.filter((z) => (z.space === 'canvas' ? (z.walls || []).includes(w.id) : z.wallId === w.id));
    const key = JSON.stringify([w.width, w.height, w.name, w.enabled, w.masks, w.mapping, w.pixelRect, zones, zones.map((z) => !!live[z.id]?.active), ul ? this._ulUrl : null]);
    let t = this.walls.get(w.id);
    if (t && t.key === key) return t.tex;
    if (!t) { t = { tex: gl.createTexture(), cv: document.createElement('canvas') }; this.walls.set(w.id, t); }
    t.key = key;
    const W = 1024, H = clamp(Math.round((W * w.height) / w.width), 64, 1024);
    const cv = t.cv; cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const sx = W / w.width, sy = H / w.height, X = (x) => x * sx, Y = (y) => H - y * sy;
    g.fillStyle = w.enabled ? '#262626' : '#1b1b1b'; g.fillRect(0, 0, W, H);
    if (ul) { const P2 = this.P, r = w.pixelRect, kx = ul.naturalWidth / P2.canvas.width, ky = ul.naturalHeight / P2.canvas.height; g.globalAlpha = 0.85; g.drawImage(ul, r.x * kx, r.y * ky, r.w * kx, r.h * ky, 0, 0, W, H); g.globalAlpha = 1; }
    // 0.5 m grid, whole metres stronger
    for (let x = 0.5; x < w.width; x += 0.5) { g.strokeStyle = x % 1 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'; g.lineWidth = x % 1 ? 1 : 2; g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let y = 0.5; y < w.height; y += 0.5) { g.strokeStyle = y % 1 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'; g.lineWidth = y % 1 ? 1 : 2; g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
    const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); };
    // masks: hatched red (ignored areas)
    for (const m of w.masks) {
      path(shapeOutline(m));
      g.save(); g.clip(); g.fillStyle = 'rgba(224,108,108,0.14)'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(224,108,108,0.45)'; g.lineWidth = 2;
      for (let k = -H; k < W; k += 14) { g.beginPath(); g.moveTo(k, H); g.lineTo(k + H, 0); g.stroke(); }
      g.restore();
      path(shapeOutline(m)); g.setLineDash([8, 6]); g.strokeStyle = 'rgba(224,108,108,0.85)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    }
    // zones: amber, filled while active; canvas zones dashed
    for (const z of zones) {
      const pts = z.space === 'canvas' ? canvasZoneOnWall(z, w) : densify(shapeOutline(z, 64), 0.1);
      const on = !!live[z.id]?.active;
      path(pts);
      g.fillStyle = on ? 'rgba(229,181,103,0.38)' : 'rgba(229,181,103,0.10)'; g.fill();
      g.strokeStyle = z.enabled === false ? 'rgba(229,181,103,0.4)' : this.colors.attn; g.lineWidth = on ? 4 : 2.5;
      if (z.space === 'canvas') g.setLineDash([14, 9]);
      g.stroke(); g.setLineDash([]);
      const xs = pts.map((p) => X(p[0])), ys = pts.map((p) => Y(p[1]));
      g.fillStyle = this.colors.attn; g.font = '600 22px Geist, system-ui'; g.textBaseline = 'top';
      g.fillText(z.name, clamp(Math.min(...xs), 0, W - 40) + 8, clamp(Math.min(...ys), 0, H - 30) + 6);
    }
    // wall id, low in a corner (readable from inside, never over the content centre)
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 34px Geist, system-ui'; g.textBaseline = 'bottom';
    g.fillText(w.id, 14, H - 10);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '500 20px Geist, system-ui';
    g.fillText(`${w.name} · ${w.width.toFixed(2)} × ${w.height.toFixed(2)} m`, 14 + g.measureText(w.id).width * 1.75 + 14, H - 14);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);

    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t.tex;
  }

  // ------------------------------------------------------------------ drawing

  draw() {
    const gl = this.gl, P = this.P;
    if (!this.ok || !P || !this.cam) return;
    for (const id of [...this.walls.keys()]) if (!P.walls.some((w) => w.id === id)) { gl.deleteTexture(this.walls.get(id).tex); this.walls.delete(id); }
    gl.viewport(0, 0, this.c.width, this.c.height);
    const bg = rgba(this.colors.bg.startsWith('#') ? this.colors.bg : '#0d0d0d');
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const { vp, eye } = this._viewProj();
    const plan = this._plan();
    const wallOf = new Map(P.walls.map((w) => [w.id, w]));
    const C = this.colors, B = this.batch;

    // floor: a dark slab under the room and a 1 m grid
    const xs = plan.flatMap((o) => [o.p0[0], o.p0[0] + o.dir[0] * o.width]), ys = plan.flatMap((o) => [o.p0[1], o.p0[1] + o.dir[1] * o.width]);
    const m = 1.5, x0 = Math.min(...xs, 0) - m, x1 = Math.max(...xs, 0) + m, y0 = Math.min(...ys, 0) - m, y1 = Math.max(...ys, 0) + m;
    B.clear();
    B.quad([x0, 0, -y0], [x1, 0, -y0], [x1, 0, -y1], [x0, 0, -y1], [0.085, 0.085, 0.085, 1]);
    this._drawCol(vp, gl.TRIANGLES, false);
    B.clear();
    const grid = [1, 1, 1, 0.05];
    for (let x = Math.ceil(x0); x <= x1; x++) B.line([x, 0.001, -y0], [x, 0.001, -y1], grid);
    for (let y = Math.ceil(y0); y <= y1; y++) B.line([x0, 0.001, -y], [x1, 0.001, -y], grid);
    this._drawCol(vp, gl.LINES, false);

    // walls: textured, one-sided (seen from inside the room)
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    gl.useProgram(this.pTex);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pTex, 'u_vp'), false, vp);
    gl.uniform1i(gl.getUniformLocation(this.pTex, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(this.pTex, 'u_alpha'), 1);
    gl.bindVertexArray(this.vaoTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTex);
    gl.activeTexture(gl.TEXTURE0);
    for (const o of plan) {
      const w = wallOf.get(o.id);
      const bl = Room3D.W(o, 0, 0), br = Room3D.W(o, o.width, 0), tr = Room3D.W(o, o.width, o.height), tl = Room3D.W(o, 0, o.height);
      const v = new Float32Array([...bl, 0, 1, ...br, 1, 1, ...tr, 1, 0, ...bl, 0, 1, ...tr, 1, 0, ...tl, 0, 0]);
      gl.bindTexture(gl.TEXTURE_2D, this._wallTexture(w));
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // touches and sensors: discs just in front of their wall (culled with it)
    B.clear();
    const live = store.live?.walls || {};
    const st = store.status?.sensors || {};
    for (const o of plan) {
      const w = wallOf.get(o.id);
      for (const [, x, y, size, coast] of live[o.id] || []) {
        const r = Math.max(0.09, size / 2 + 0.03), off = 0.012; // a little larger than the hand: readable at room scale
        B.quad(Room3D.W(o, x - r, y - r, off), Room3D.W(o, x + r, y - r, off), Room3D.W(o, x + r, y + r, off), Room3D.W(o, x - r, y + r, off), rgba(C.live, coast ? 0.45 : 0.95), true);
      }
      for (const s of P.sensors.filter((q) => q.wallId === o.id)) {
        const [sx, sy] = s.calibration?.matrix ? applyM(s.calibration.matrix, 0, 0) : [s.pose.x, s.pose.y];
        const state = st[s.id]?.state;
        const col = !s.enabled ? '#6D6D6D' : state === 'scanning' ? C.ok : state === 'offline' || state === 'error' ? C.danger : C.attn;
        const r = 0.09, off = (w.planeOffset || 0.02) + 0.02;
        B.quad(Room3D.W(o, sx - r, sy - r, off), Room3D.W(o, sx + r, sy - r, off), Room3D.W(o, sx + r, sy + r, off), Room3D.W(o, sx - r, sy + r, off), rgba(col, 1), true);
      }
    }
    gl.depthMask(false);
    this._drawCol(vp, gl.TRIANGLES, true);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);

    // outlines (always visible: they keep the shape of the room when the near walls are culled), scan-plane fans
    B.clear();
    for (const o of plan) {
      const w = wallOf.get(o.id);
      const c = w.enabled ? [1, 1, 1, 0.42] : [1, 1, 1, 0.18];
      const bl = Room3D.W(o, 0, 0), br = Room3D.W(o, o.width, 0), tr = Room3D.W(o, o.width, o.height), tl = Room3D.W(o, 0, o.height);
      B.line(bl, br, c); B.line(br, tr, c); B.line(tr, tl, c); B.line(tl, bl, c);
    }
    this._drawCol(vp, gl.LINES, false);

    // LiDAR points, in each sensor's scan plane
    if (this.hooks.ws.showPoints && store.viz?.size) {
      B.clear();
      const fg = rgba('#E0E0E0', 0.95), bgc = [0.6, 0.6, 0.6, 0.35];
      for (const [, v] of store.viz) {
        const o = plan.find((q) => q.id === v.wallId);
        const w = o && wallOf.get(o.id);
        if (!o || !this._facing(o, eye)) continue; // like the wall itself: hidden when seen from behind
        const off = (w.planeOffset || 0.02), pts = v.pts;
        for (let k = 0; k < pts.length; k += 3) B.v(Room3D.W(o, pts[k], pts[k + 1], off), pts[k + 2] === 1 ? fg : bgc);
      }
      this._drawCol(vp, gl.POINTS, false, 2 * this.dpr);
    }
  }

  /** Is the inner face of this wall towards the camera? */
  _facing(o, eye) {
    const p0 = Room3D.W(o, 0, 0);
    return dot(sub(eye, p0), [o.normal[0], 0, -o.normal[1]]) > 0;
  }

  _drawCol(vp, mode, depthTested, pointSize = 1) {
    const gl = this.gl, B = this.batch;
    if (!B.count) return;
    gl.useProgram(this.pCol);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pCol, 'u_vp'), false, vp);
    gl.uniform1f(gl.getUniformLocation(this.pCol, 'u_ps'), pointSize);
    gl.bindVertexArray(this.vaoCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, B.a.subarray(0, B.n), gl.DYNAMIC_DRAW);
    void depthTested;
    gl.drawArrays(mode, 0, B.count);
  }

  // ------------------------------------------------------------------ picking (virtual hand)

  /** The wall point under a screen position: {wallId, x, y} (front faces only, the nearest). */
  pick(px, py) {
    const P = this.P;
    if (!P || !this.cam) return null;
    const { eye } = this._viewProj();
    // ray through the pixel: rebuild it from the camera basis (no matrix inverse needed)
    const c = this.cam, fov = c.inside ? 1.15 : 0.75, aspect = (this.w || 1) / (this.h || 1);
    const z = norm(sub(eye, c.target)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    const t = Math.tan(fov / 2), nx = (2 * px) / this.w - 1, ny = 1 - (2 * py) / this.h;
    const dir = norm(add(add(scale(x, nx * t * aspect), scale(y, ny * t)), scale(z, -1)));
    let best = null;
    for (const o of this._plan()) {
      const n = [o.normal[0], 0, -o.normal[1]], p0 = Room3D.W(o, 0, 0);
      const den = dot(dir, n);
      if (den >= -1e-6) continue; // hitting the back of the wall (seen from outside)
      const tt = dot(sub(p0, eye), n) / den;
      if (tt <= 0 || (best && tt >= best.t)) continue;
      const hit = add(eye, scale(dir, tt));
      const d = [o.dir[0], 0, -o.dir[1]];
      const wx = dot(sub(hit, p0), d) / dot(d, d), wy = hit[1]; // |dir| ≈ 1 (exactly 1 unless the loop was closed)
      if (wx >= 0 && wx <= o.width && wy >= 0 && wy <= o.height) best = { t: tt, wallId: o.id, x: wx, y: wy };
    }
    return best;
  }

  // ------------------------------------------------------------------ input

  _bind() {
    const c = this.c;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { e.preventDefault(); this._zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    c.addEventListener('dblclick', () => this.reset());
    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      if (e.isPrimary) this.pointers.clear();
      const p = { x: e.offsetX, y: e.offsetY, pan: e.button === 2 || e.shiftKey || e.ctrlKey, hand: null };
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1 && this.hooks.ws.tool === 'hand') {
        const hit = this.pick(e.offsetX, e.offsetY);
        if (hit) { p.hand = { id: `ui3d${e.pointerId}`, wallId: hit.wallId }; this.hooks.hand(hit.wallId, hit.x, hit.y, 'down', p.hand.id); }
      }
      if (this.pointers.size === 2) for (const q of this.pointers.values()) if (q.hand) { this.hooks.hand(q.hand.wallId, 0, 0, 'up', q.hand.id); q.hand = null; }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.cam) return;
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.offsetX; p.y = e.offsetY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0 && after > 0) this._zoom(before / after);
        this._pan(dx / 2, dy / 2);
        return;
      }
      p.x = e.offsetX; p.y = e.offsetY;
      if (p.hand) {
        const hit = this.pick(e.offsetX, e.offsetY);
        if (hit && hit.wallId === p.hand.wallId) this.hooks.hand(hit.wallId, hit.x, hit.y, 'move', p.hand.id);
        else if (hit) { this.hooks.hand(p.hand.wallId, 0, 0, 'up', p.hand.id); p.hand.wallId = hit.wallId; this.hooks.hand(hit.wallId, hit.x, hit.y, 'down', p.hand.id); }
        return;
      }
      if (p.pan) this._pan(dx, dy);
      else { this.cam.yaw -= dx * 0.006; this.cam.pitch = clamp(this.cam.pitch + dy * 0.005, this.cam.inside ? -0.9 : 0.03, 1.5); }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (p?.hand) this.hooks.hand(p.hand.wallId, 0, 0, 'up', p.hand.id);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  _zoom(k) {
    const c = this.cam;
    if (c.inside) { c.dist = clamp(c.dist * k, 0.05, 60); if (c.dist > 0.6) { c.inside = false; this.hooks.changed?.(); } return; }
    c.dist = clamp(c.dist * k, 0.6, 120);
  }

  _pan(dx, dy) {
    const c = this.cam, eye = this._eye();
    const z = norm(sub(eye, c.target)), x = norm(cross([0, 1, 0], z));
    const k = (c.dist * 0.0018) * (this.cam.inside ? 4 : 1);
    // horizontal drag slides along the floor, vertical drag raises / lowers the target
    c.target = add(c.target, add(scale(x, -dx * k), [0, dy * k, 0]));
    c.target[1] = clamp(c.target[1], 0, 6);
  }
}
