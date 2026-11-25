// Ressonància — 3D part "atmos": the AIR of the night square, and the horizon line drawn round the room (contract: ../PARTS.md).
//
// What it draws
//   Dust      300 000 motes in the volume behind the walls, from the wall planes out to ~21 m. A GPU compute pass (TSL; on WebGL2
//             three.js runs it as transform feedback) moves them and lights them once per frame; the four wall views only draw
//             them (instanced sprites). A mote lives in eye-centred coordinates (angle round the room, depth behind the wall,
//             height fraction of what the walls can see at that distance), so its slow drift round the square can never carry it
//             into the room. On top of that "home" it carries a displacement + velocity (a spring back home) and a heat.
//             Light: a cool ambient night, a high moon (forward scattering: motes towards the moon glint more), every registered
//             warm lamp (1/d²), the horizon line and its two drawing points, and the heat a hand (or a passing drawing point)
//             leaves. Depth: near the walls a layer of fine motes and a few big soft out-of-focus discs (bokeh); far away tiny
//             ones, never smaller than ~1.5 px (their energy is spread, not lost: no crawling sub-pixel sparkles).
//   Hands     input.hands are ON the wall planes: the motes just behind a hand are pushed away, turned round the hand's axis and
//             dragged along by its movement (a wake), and they glow warm at once; the heat fades over a few seconds.
//   The wall  one quad per wall lying on the wall plane (3 mm behind it): the horizon line at 1.25 m, its drawing points and the
//             flash where they meet, a faint warm glow under each hand, and the haze of the night as an analytic in-scattering
//             along each eye ray: a cool blue-black veil, the moon's halo, and the glow of every lamp in the air (closed-form
//             integral of 1/d² along the ray). The perimeter coordinate s is continuous across the corners and the strip's ends.
//
// Choreography on input.t (the intro's clock, 70 s)
//   0–1 black · 1–8 the dust and the night air fade in · 8–22 the line is drawn from the centre of wall 0 both ways round the
//   room, a bright point at each end (the dust warms as they pass) · ~22 the ends meet on the far side: a soft flash · 22–46 the line
//   holds, dimming a little by 34 · 46–53 it dims to ~20 %, the dust thickens a little (the square breaks into dust) · 53–70 holds.
//
// API for the other parts' lamps
//   part.addLight(position: Vector3, color: Color|hex, intensity) → handle { position, color, intensity, remove() } (live: change
//   the handle's fields any time). Every THREE.PointLight in room.scene is also picked up automatically (rescanned twice a second;
//   light.userData.atmos === false opts out). Up to 16 lights in all. Intensity is three.js' (candela-ish): a 30 cd lamp at 2 m
//   gives a mote a warm boost of ~0.25 at lampGain 1.
//
// Params (ctx.params, live): dust (amount), haze, line (brightness), lineT (draw progress override 0..1 when > 0), lineY (m),
//   stir, lampGain, moon, bokeh, demoLamps (the study only: a ring of stand-in lamps lighting up 8–25 s, as the square will).
const MAXH = 16, MAXL = 16;
const N_FAR = 210000, N_NEAR = 90000, N = N_FAR + N_NEAR;
const R_MAX = 21;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoother = (v) => { const s = clamp01(v); return s * s * s * (s * (s * 6 - 15) + 10); };
const ss = (a, b, v) => smoother((v - a) / (b - a));
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function create({ THREE, TSL, room, params }) {
  const P = params;
  const {
    Fn, uniform, uniformArray, instancedArray, instanceIndex, attribute, varying, positionWorld, uv,
    vec2, vec3, vec4, float, If, Loop, sin, cos, exp, mix, clamp, smoothstep, max, min, abs, sqrt, atan, floor, fract, pow,
    dot, cross, normalize, length, inverseSqrt, select, cameraWorldMatrix, Discard,
  } = TSL;
  const object = new THREE.Group();
  object.name = 'atmos';
  const walls = room.walls, NW = walls.length;

  // ------------------------------------------------------------------ the room, baked as constants
  const cum = []; let PER = 0;
  for (const w of walls) { cum.push(PER); PER += w.width; }
  const X0 = walls[0].width / 2;                                   // the line is lit at the centre of wall 0
  // half extents of the room (rectangle: wall 0 faces -z, wall 1 +x); fall back on the mean apothem for other rooms
  const ax = NW === 4 ? Math.abs(walls[1].centre.x) : 3.5, bz = NW === 4 ? Math.abs(walls[0].centre.z) : 3.5;
  const w0 = walls[0];
  const pxM = w0.height / w0.rect.h;                               // metres per pixel on the wall plane
  const dWall0 = Math.max(1, -new THREE.Vector3().subVectors(w0.pa, room.eye).dot(w0.normal));
  const PX_ANG = pxM / dWall0;                                     // radians per pixel (about)

  // ------------------------------------------------------------------ uniforms
  const U = {
    time: uniform(0), dt: uniform(1 / 60), eye: uniform(room.eye.clone()),
    lvl: uniform(0), amount: uniform(1), haze: uniform(0), moon: uniform(1), bokeh: uniform(1), stir: uniform(1), lampGain: uniform(1),
    lineY: uniform(1.25), line: uniform(0), head: uniform(0), front: uniform(0), flash: uniform(0),
    nH: uniform(0, 'int'), nL: uniform(0, 'int'),
  };
  const HP = [], HN = [], HV = [], LP = [], LC = [];
  for (let i = 0; i < MAXH; i++) { HP.push(new THREE.Vector4()); HN.push(new THREE.Vector4()); HV.push(new THREE.Vector4()); }
  for (let i = 0; i < MAXL; i++) { LP.push(new THREE.Vector4()); LC.push(new THREE.Vector4()); }
  const uHP = uniformArray(HP, 'vec4'), uHN = uniformArray(HN, 'vec4'), uHV = uniformArray(HV, 'vec4');
  const uLP = uniformArray(LP, 'vec4'), uLC = uniformArray(LC, 'vec4');
  const MOON = new THREE.Vector3(-0.38, 0.8, 0.46).normalize();
  const moonDir = vec3(MOON.x, MOON.y, MOON.z);
  // the colour script (T-028): params.warm / cool / air ([r, g, b], live; the host eases them block by block). Defaults: the intro's night.
  const uWarm = uniform(new THREE.Vector3(1.0, 0.62, 0.32)), uCool = uniform(new THREE.Vector3(0.55, 0.66, 1.0)), uAir = uniform(new THREE.Vector3(0.0035, 0.0058, 0.0125));
  const COOL = uCool, WARM = uWarm, WARM2 = mix(uWarm, vec3(1.0), 0.4);
  const uLineCol = uniform(new THREE.Vector3(1.0, 0.62, 0.32)), uLineHalo = uniform(1);   // params.lineColor [r,g,b], params.lineHalo (0..1: the soft band round the line)

  const wrapS = (x) => x.sub(floor(x.div(PER).add(0.5)).mul(PER));   // signed perimeter distance in [-PER/2, PER/2]

  // ------------------------------------------------------------------ the motes (static seeds)
  const A = new Float32Array(N * 4), B = new Float32Array(N * 4);
  {
    const r = rng(11);
    for (let i = 0; i < N; i++) {
      const near = i >= N_FAR;
      let d;
      if (near) d = 0.02 + 1.4 * Math.pow(r(), 1.6);
      else { const R = Math.sqrt(16 + (R_MAX * R_MAX - 16) * r()); d = Math.max(0.15, R - 3.7); }
      A[i * 4] = r() * Math.PI * 2; A[i * 4 + 1] = d; A[i * 4 + 2] = r(); A[i * 4 + 3] = r();
      const bok = near && r() < 0.045 ? 1 : 0;
      B[i * 4] = r(); B[i * 4 + 1] = r(); B[i * 4 + 2] = bok; B[i * 4 + 3] = r();
    }
  }
  const bufA = instancedArray(A, 'vec4').setPBO(true).toReadOnly(), bufB = instancedArray(B, 'vec4').setPBO(true).toReadOnly();   // read-only: on WebGL2 only 4 buffers may be written (transform feedback)
  const bufD = instancedArray(N, 'vec4');                          // displacement xyz, heat
  const bufV = instancedArray(N, 'vec4');                          // velocity xyz
  const bufP = instancedArray(N, 'vec4');                          // world position, sprite diameter (0 = hidden)
  const bufC = instancedArray(N, 'vec4');                          // peak radiance rgb, bokeh

  const step = Fn(() => {
    const a = bufA.element(instanceIndex), b = bufB.element(instanceIndex);
    const sd = a.w, t = U.time, dt = U.dt;
    // ---- home: drifting round the square, never inside the room
    const r0 = a.y.add(3.8);
    const th = a.x.add(t.mul(float(0.012).add(b.y.mul(0.03))).div(r0)).add(sin(t.mul(0.05).add(sd.mul(40.0))).mul(0.02).div(r0));
    const c = cos(th), s = sin(th);
    const wd = min(float(ax).div(max(abs(c), 1e-4)), float(bz).div(max(abs(s), 1e-4)));
    const rr = wd.add(a.y).add(sin(t.mul(float(0.07).add(b.w.mul(0.08))).add(sd.mul(17.0))).mul(a.y.mul(0.02).add(0.015)));
    const f = fract(a.z.add(t.mul(b.w.sub(0.55).mul(0.0035))));
    const edge = smoothstep(0.0, 0.05, f).mul(smoothstep(1.0, 0.95, f));
    const ymin = max(0.02, float(1.6).sub(rr.mul(0.6))), ymax = float(1.6).add(rr.mul(0.78));
    const wob = rr.mul(0.008).add(0.02);
    const home = vec3(c.mul(rr).add(sin(t.mul(0.11).add(sd.mul(53.0))).mul(wob)), mix(ymin, ymax, f).add(sin(t.mul(0.09).add(sd.mul(29.0))).mul(wob)), s.mul(rr).add(cos(t.mul(0.1).add(sd.mul(71.0))).mul(wob)));

    // ---- the stir: hands push, turn and drag the motes; they glow
    const dsp = bufD.element(instanceIndex).toVar(), vel = bufV.element(instanceIndex).xyz.toVar();
    const p = home.add(dsp.xyz).toVar();
    const force = vec3(0).toVar(), heat = dsp.w.toVar();
    Loop(U.nH, ({ i }) => {
      const hp = uHP.element(i), hn = uHN.element(i).xyz, hv = uHV.element(i).xyz;
      const rel = p.sub(hp.xyz), r2 = dot(rel, rel);
      const k = exp(r2.div(-2 * 0.34 * 0.34)).mul(hp.w);
      const n = rel.mul(inverseSqrt(r2.add(1e-4)));
      force.addAssign(n.mul(2.2).add(cross(hn, n).mul(2.6)).add(hv.mul(3.5)).mul(k).mul(U.stir));
      heat.addAssign(k.mul(dt).mul(14.0).mul(min(U.stir, 1.5)));
    });
    vel.addAssign(force.sub(dsp.xyz.mul(1.1)).mul(dt));
    vel.mulAssign(exp(dt.mul(-1.5)));
    const nd = dsp.xyz.add(vel.mul(dt)).toVar();
    const ndl = length(nd);
    If(ndl.greaterThan(1.6), () => { nd.mulAssign(float(1.6).div(ndl)); });
    p.assign(home.add(nd));

    // ---- the horizon line: nearest point of the line (on the wall planes), its perimeter coordinate
    const best = float(1e6).toVar(), bs = float(0).toVar();
    for (let w = 0; w < NW; w++) {
      const W = walls[w];
      const u = clamp(dot(p.xz.sub(vec2(W.pa.x, W.pa.z)), vec2(W.right.x, W.right.z)), 0, W.width);
      const q = vec2(W.pa.x, W.pa.z).add(vec2(W.right.x, W.right.z).mul(u));
      const d2 = dot(p.xz.sub(q), p.xz.sub(q));
      If(d2.lessThan(best), () => { best.assign(d2); bs.assign(u.add(cum[w])); });
    }
    const dy = p.y.sub(U.lineY), dl2 = best.add(dy.mul(dy));
    const dx = abs(wrapS(bs.sub(X0)));
    const vis = float(1).sub(smoothstep(U.front.sub(0.3), U.front.add(0.05), dx));
    const lineL = U.line.mul(vis).mul(exp(dl2.div(-2 * 0.2 * 0.2)).mul(2.2).add(exp(dl2.div(-2 * 0.7 * 0.7)).mul(0.35)));
    const hd = dx.sub(min(U.front, PER / 2));
    const headL = U.head.mul(exp(hd.mul(hd).add(dl2).div(-2 * 0.5 * 0.5))).mul(3.0);
    const fx = wrapS(bs.sub(X0 + PER / 2));
    const flashL = U.flash.mul(exp(fx.mul(fx).add(dl2).div(-2 * 1.4 * 1.4))).mul(2.0);
    heat.addAssign(headL.mul(dt).mul(0.12));
    heat.assign(clamp(heat.mul(exp(dt.mul(-0.6))), 0, 2));

    // ---- light
    const toP = p.sub(U.eye), dist = length(toP), vdir = toP.div(dist);
    const cm = dot(vdir, moonDir);
    const g = 0.6, mie = float(1 - g * g).div(pow(float(1 + g * g).sub(cm.mul(2 * g)), 1.5)).mul(0.08);
    const lamp = vec3(0).toVar();
    Loop(U.nL, ({ i }) => {
      const L = uLP.element(i), d = L.xyz.sub(p);
      lamp.addAssign(uLC.element(i).xyz.mul(L.w.div(dot(d, d).add(0.35))));
    });
    const tw = sin(t.mul(float(0.4).add(b.y.mul(1.1))).add(sd.mul(31.0))).mul(0.45).add(0.55);
    const glint = select(b.w.greaterThan(0.86), pow(max(0.0, sin(t.mul(float(0.22).add(b.x.mul(0.5))).add(sd.mul(53.0)))), 24.0).mul(4.0), float(0));
    const warmth = lineL.add(headL).add(flashL).add(heat.mul(heat).mul(2.2).add(heat.mul(2.0)));
    const light = COOL.mul(float(0.45).add(mie.mul(U.moon).mul(2.0))).add(WARM.mul(warmth)).add(lamp.mul(U.lampGain.mul(0.12)));

    // ---- size and energy
    const isNear = sd.greaterThan(-1.0).and(a.y.lessThan(1.45)).and(b.z.lessThan(0.5));
    const bok = b.z.mul(U.bokeh.greaterThan(0.01).select(1.0, 0.0));
    const D0 = select(b.z.greaterThan(0.5), float(0.022).add(b.x.mul(0.05)), select(isNear, float(0.003).add(b.x.mul(0.004)), float(0.006).add(b.x.mul(b.x).mul(0.012))));
    const pix = dist.mul(PX_ANG);
    const D = max(D0.mul(heat.mul(0.6).add(1.0)), pix.mul(heat.mul(0.5).add(1.6)));
    const spx = D.div(pix);
    const flux = select(b.z.greaterThan(0.5), float(0.5).mul(U.bokeh), float(0.05).add(b.x.mul(0.09)))
      .mul(tw.add(glint).add(heat.mul(0.8))).mul(heat.mul(0.8).add(1.0)).div(float(1).add(dist.mul(dist).mul(0.008)));
    const norm = mix(float(0.1745), float(0.5), bok);
    // amount: a fraction of the motes when < 1, brighter when > 1
    const shown = sd.lessThan(U.amount).select(1.0, 0.0).mul(max(U.amount, 1.0));
    const inside = abs(p.x).lessThan(ax - 0.01).and(abs(p.z).lessThan(bz - 0.01)).or(p.y.lessThan(0.0));
    const E = flux.mul(edge).mul(U.lvl).mul(shown).div(norm.mul(spx).mul(spx));
    const hidden = inside.or(E.lessThan(1e-5));

    bufD.element(instanceIndex).assign(vec4(nd, heat));
    bufV.element(instanceIndex).assign(vec4(vel, 0));
    bufP.element(instanceIndex).assign(vec4(p, select(hidden, float(0), D)));
    bufC.element(instanceIndex).assign(vec4(light.mul(E), bok));
  });
  const computeNode = step().compute(N);

  // ------------------------------------------------------------------ the motes, drawn
  const mm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
  const pa4 = bufP.toAttribute(), ca4 = bufC.toAttribute();
  mm.positionNode = pa4.xyz;
  mm.scaleNode = vec2(pa4.w, pa4.w);
  const vCol = varying(ca4.xyz), vBok = varying(ca4.w);
  mm.colorNode = Fn(() => {
    const r = length(uv().sub(0.5)).mul(2.0);
    const gauss = exp(r.mul(r).mul(-4.5));
    const disc = smoothstep(1.0, 0.72, r).mul(r.mul(r).mul(0.5).add(0.5));
    return vec4(vCol.mul(mix(gauss, disc, vBok)), 1.0);
  })();
  const motes = new THREE.Sprite(mm);
  motes.count = N; motes.frustumCulled = false; motes.renderOrder = 2;
  object.add(motes);

  // ------------------------------------------------------------------ the wall layer: the line, the hands' glow, the haze
  const pos = [], sAt = [], nAt = [], idx = [];
  const _v = new THREE.Vector3();
  walls.forEach((w, i) => {
    // a little wider than the wall (the rooms' corners need not meet to the millimetre); each camera keeps only its own wall's quad
    const o = pos.length / 3, back = -0.003, m = 0.06 / w.width;
    for (const [uu, vv] of [[-m, -0.02], [1 + m, -0.02], [1 + m, 1.02], [-m, 1.02]]) {
      room.wallPoint(i, uu, vv, _v).addScaledVector(w.normal, back);
      pos.push(_v.x, _v.y, _v.z); sAt.push(cum[i] + uu * w.width); nAt.push(w.normal.x, w.normal.y, w.normal.z);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute('aS', new THREE.Float32BufferAttribute(sAt, 1));
  wg.setAttribute('aN', new THREE.Float32BufferAttribute(nAt, 3));
  wg.setIndex(idx);
  const wm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const vS = varying(attribute('aS', 'float')), vN = varying(attribute('aN', 'vec3'));
  wm.colorNode = Fn(() => {
    If(dot(cameraWorldMatrix.element(2).xyz, vN).lessThan(0.999), () => { Discard(); });   // the camera looks along -normal of ITS wall
    const Pw = positionWorld, y = Pw.y;
    const toP = Pw.sub(U.eye), tw = length(toP), dir = toP.div(tw);
    const c = vec3(0).toVar();
    // the night air: a cool veil, denser low and towards the horizon, and the moon's halo
    const low = float(1).sub(clamp(dir.y.mul(1.6), 0, 1));
    const cm = dot(dir, moonDir);
    const g = 0.72, mie = float(1 - g * g).div(pow(float(1 + g * g).sub(cm.mul(2 * g)), 1.5));
    c.addAssign(vec3(uAir).mul(low.mul(0.8).add(0.45)).add(COOL.mul(mie.mul(0.0018).mul(U.moon))).mul(U.haze));
    // the lamps in the air: closed form of the 1/d² glow along the eye ray, up to just past the lamp
    const lh = vec3(0).toVar();
    If(U.haze.mul(U.lampGain).greaterThan(0.002), () => {   // VFX perf: no loop where the haze is off (pinya, acta, wait)
      Loop(U.nL, ({ i }) => {
        const L = uLP.element(i), Lr = L.xyz.sub(U.eye);
        const tc = dot(Lr, dir), h = sqrt(max(dot(Lr, Lr).sub(tc.mul(tc)), 0.04));
        const I = atan(float(1.5).div(h)).sub(atan(tw.sub(tc).div(h))).div(h);
        lh.addAssign(uLC.element(i).xyz.mul(L.w.mul(max(I, 0.0))));
      });
      });
    c.addAssign(lh.mul(U.haze.mul(U.lampGain).mul(0.0009)));
    // the horizon line
    const dy = y.sub(U.lineY), dx = abs(wrapS(vS.sub(X0)));
    const sc = Math.max(0.0022, 0.55 * pxM);
    const vis = float(1).sub(smoothstep(U.front.sub(0.28), U.front.add(0.03), dx));
    const along = sin(vS.mul(6.2832 * 7 / PER).add(U.time.mul(0.35))).mul(sin(vS.mul(6.2832 * 3 / PER).sub(U.time.mul(0.21)))).mul(0.14).add(0.86);
    const Lp = exp(dy.mul(dy).div(-2 * sc * sc)).mul(2.6 * 0.0022 / sc)
      .add(exp(dy.mul(dy).div(-2 * 0.016 * 0.016)).mul(0.07).mul(uLineHalo)).add(exp(dy.mul(dy).div(-2 * 0.25 * 0.25)).mul(0.008).mul(uLineHalo));
    c.addAssign(vec3(uLineCol).mul(Lp.mul(vis).mul(along).mul(U.line)));
    const hd = dx.sub(min(U.front, PER / 2)), r2 = hd.mul(hd).add(dy.mul(dy));
    c.addAssign(WARM2.mul(U.head.mul(exp(r2.div(-2 * 0.010 * 0.010)).mul(2.5).add(exp(r2.div(-2 * 0.07 * 0.07)).mul(0.18)).add(exp(r2.div(-2 * 0.45 * 0.45)).mul(0.02)))));
    const fx = wrapS(vS.sub(X0 + PER / 2)), f2 = fx.mul(fx).add(dy.mul(dy));
    c.addAssign(WARM2.mul(U.flash.mul(exp(f2.div(-2 * 0.05 * 0.05)).mul(1.6).add(exp(f2.div(-2 * 0.6 * 0.6)).mul(0.08)))));
    // a hand: a faint warm glow where it touches
    Loop(U.nH, ({ i }) => {
      const hp = uHP.element(i), d = Pw.sub(hp.xyz);
      c.addAssign(WARM.mul(hp.w.mul(U.stir).mul(exp(dot(d, d).div(-2 * 0.2 * 0.2)).mul(0.035))));
    });
    return vec4(c, 1.0);
  })();
  const wallLayer = new THREE.Mesh(wg, wm);
  wallLayer.frustumCulled = false; wallLayer.renderOrder = 3;
  object.add(wallLayer);

  // ------------------------------------------------------------------ lights: registered by hand, or found in the scene
  const manual = [];
  function addLight(position, color = 0xffb070, intensity = 10) {
    const h = { position: position?.isVector3 ? position : new THREE.Vector3().copy(position || {}), color: color?.isColor ? color : new THREE.Color(color), intensity, remove() { const k = manual.indexOf(h); if (k >= 0) manual.splice(k, 1); } };
    manual.push(h);
    return h;
  }
  const found = [];
  const collect = (o) => { if (o.isPointLight && o.userData.atmos !== false && found.length < MAXL) found.push(o); };
  let scanClock = 1e9;
  const _wp = new THREE.Vector3();

  // the study's stand-in lamps (demoLamps): warm points on a ring of facades, lighting one after another between 8 and 25 s
  const demo = [];
  {
    const r = rng(5), lampMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1, 0.7, 0.4) });
    const lampGeo = new THREE.SphereGeometry(0.09, 12, 8);
    for (let k = 0; k < 10; k++) {
      const th = (k / 10) * Math.PI * 2 + 0.3 + (r() - 0.5) * 0.25, R = 13 + r() * 4;
      const p = new THREE.Vector3(Math.cos(th) * R, 4.0 + r() * 0.8, Math.sin(th) * R);
      const mat = lampMat.clone(); const m = new THREE.Mesh(lampGeo, mat); m.position.copy(p); m.visible = false;
      object.add(m);
      demo.push({ mesh: m, mat, h: { position: p, color: new THREE.Color(1.0, 0.6, 0.3), intensity: 0 }, on: 8 + (k / 10) * 16 + r() * 1.2 });
    }
  }

  // ------------------------------------------------------------------ per frame
  const _r = new THREE.Vector3();
  function update(dt, input) {
    const t = input.t ?? 0;
    dt = Math.min(Math.max(dt || 1 / 60, 0), 1 / 20);
    U.time.value = (input.time ?? 0) % 3000; U.dt.value = dt; U.eye.value.copy(room.eye);
    // choreography
    const lt = Number(P.lineT) || 0;
    U.lvl.value = ss(1.0, 8.0, t) * (1 + 0.25 * ss(47, 55, t));
    const bn = room.background?.name; U.moon.value *= (bn === 'tronc' || bn === 'pinya' || bn === 'pom' || bn === 'brasa') ? 0.15 : 1;   // AD 25-11: no milky moon veil in the night chapters   // AD 25-11: no milky moon veil in the night chapters
    U.amount.value = Math.max(0, Number(P.dust ?? 1)) * (room.quality === 'low' ? 0.35 : room.quality === 'medium' ? 0.6 : 1) * (bn === 'pom' ? 0.2 : bn === 'tronc' ? 0.35 : 1);   // VFX perf 25-11; pom / tronc: a few motes, not snow
    U.haze.value = ss(0.5, 7.0, t) * Math.max(0, Number(P.haze ?? 1));
    U.moon.value = Number(P.moon ?? 1); U.bokeh.value = Number(P.bokeh ?? 1) * ((room.background?.name === 'pom') ? 0.15 : 1);   // AD#11: no white flare-like discs in the Pom U.stir.value = Number(P.stir ?? 1);
    if (Array.isArray(P.warm)) uWarm.value.fromArray(P.warm);
    if (Array.isArray(P.cool)) uCool.value.fromArray(P.cool);
    if (Array.isArray(P.air)) uAir.value.fromArray(P.air);
    if (Array.isArray(P.lineColor)) uLineCol.value.fromArray(P.lineColor); else uLineCol.value.copy(uWarm.value);
    uLineHalo.value = P.lineHalo ?? 1;
    U.lampGain.value = Number(P.lampGain ?? 1); U.lineY.value = Number(P.lineY) || 1.25;
    const lineB = Math.max(0, Number(P.line ?? 1));
    const prog = lt > 0 ? clamp01(lt) : smoother((t - 8.6) / 13.4);
    U.front.value = (PER / 2 + 0.4) * prog;
    const lineOn = lt > 0 ? 1 : ss(8.0, 9.2, t);
    U.line.value = lineOn * (1 - 0.2 * ss(24, 34, t)) * (1 - 0.8 * ss(46, 53, t)) * lineB;
    U.head.value = (lt > 0 ? (lt < 1 ? 1 : 0) : ss(8.0, 9.0, t) * (1 - ss(22.2, 25.5, t))) * lineB;
    U.flash.value = (lt > 0 ? 0 : ss(21.3, 22.1, t) * (1 - ss(22.1, 26.0, t))) * lineB;

    // hands
    let nh = 0;
    for (const h of input.hands || []) {
      if (nh >= MAXH) break;
      const w = walls[h.wall];
      HP[nh].set(h.pos.x, h.pos.y, h.pos.z, 1); HN[nh].set(h.normal.x, h.normal.y, h.normal.z, 0);
      _r.copy(w.right).multiplyScalar(h.vx || 0); _r.y += h.vy || 0;
      const sp = _r.length(); if (sp > 3) _r.multiplyScalar(3 / sp);
      HV[nh].set(_r.x, _r.y, _r.z, 0); nh++;
    }
    U.nH.value = nh;

    // lights
    scanClock += dt;
    if (scanClock > 0.5) { scanClock = 0; found.length = 0; room.scene.traverse(collect); }
    let nl = 0;
    const put = (p, col, I) => { if (nl >= MAXL || !(I > 0)) return; LP[nl].set(p.x, p.y, p.z, I); LC[nl].set(col.r, col.g, col.b, 0); nl++; };
    for (const l of found) { if (l.visible) { l.getWorldPosition(_wp); put(_wp, l.color, l.intensity); } }
    for (const h of manual) put(h.position, h.color, h.intensity);
    const demoOn = !!P.demoLamps;
    for (const d of demo) {
      const k = demoOn ? ss(d.on, d.on + 1.6, t) * (1 - 0.15 * ss(46, 56, t)) : 0;
      const fl = k > 0 && k < 1 ? 0.75 + 0.25 * Math.sin(t * 37 + d.on * 9) : 1;
      d.h.intensity = 40 * k * fl;
      d.mesh.visible = k > 0.001; d.mat.color.setRGB(9 * k * fl, 5.2 * k * fl, 2.4 * k * fl);
      put(d.h.position, d.h.color, d.h.intensity);
    }
    U.nL.value = nl;

    room.renderer.compute(computeNode);
  }

  return {
    object,
    update,
    addLight,
    removeLight(h) { h?.remove?.(); },
    setParams() { /* read live from params in update */ },
    dispose() {
      mm.dispose(); wm.dispose(); wg.dispose();
      for (const d of demo) d.mat.dispose();
      demo[0]?.mesh.geometry.dispose();
      for (const b of [bufA, bufB, bufD, bufV, bufP, bufC]) b.value?.dispose?.();
    },
  };
}
