# Ressonància — «brasa»: diable v2, the fire creature in a hooded robe (ref: "Turnaround de criatura ígnea con túnica").
# Builds the model, its 36-bone rig and its skin weights from code, so it can be regenerated without the UI:
#
#   blender --background --factory-startup --python build_diable2.py -- [--render] [--export] [--forca]
#
#   --export   writes diable2.bin + diable2.json (the runtime's compact skinned mesh, three.js coords: y up, front +z)
#              and diable2.glb (armature + skinned mesh, for the studio)
#   --render   writes turnaround.png (front, 3/4, profile, back, like the reference) with EEVEE
#   --forca    adds the forca to the render
#
# Units: metres, 1.75 m to the crown, 1.87 m to the hood's peak. Blender coords: z up, the devil faces -y, its left is +x.
# Per-vertex data (attributes, also in the .bin):
#   mat    0 charcoal body · 1 robe · 2 hood · 3 thorn / feather · 4 flame · 5 medallion · 6 forca · 7 carretilla · 8 snout · 9 claw
#   glow   0..1 fixed self-light (the hem's band, the medallion's hexagon)
#   tip    0..1 along a thorn / flame tongue (0 root … 1 tip)
#   layer  flame layer 0 red · 1 orange · 2 amber · 3 cream; on other parts a per-piece random seed (0..1)

import bpy, bmesh, math, random, json, struct, os, sys
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER, EXPORT, FORCA = '--render' in ARGS, '--export' in ARGS, '--forca' in ARGS
rnd = random.Random(7)
for _o in list(bpy.data.objects): bpy.data.objects.remove(_o)          # the factory scene's cube, camera and light
V = Vector

# ------------------------------------------------------------------------------------------------ geometry accumulator
class Geo:
    def __init__(self):
        self.v, self.f, self.smooth = [], [], []
        self.attr = {'mat': [], 'glow': [], 'tip': [], 'layer': []}
        self.bind = []          # per vertex: None (weights from the bones by distance) or a tag (see 8.)
    def add_vert(self, p, mat, glow=0.0, tip=0.0, layer=0.0, bind=None):
        self.v.append(V(p)); self.attr['mat'].append(mat); self.attr['glow'].append(glow)
        self.attr['tip'].append(tip); self.attr['layer'].append(layer); self.bind.append(bind)
        return len(self.v) - 1
    def add_face(self, idx, smooth=True):
        self.f.append(tuple(idx)); self.smooth.append(smooth)

G = Geo()

def frame_from(d, ref=V((0, 0, 1))):
    d = d.normalized()
    r = ref - d * ref.dot(d)
    if r.length < 1e-5: r = V((1, 0, 0)) - d * d.x
    r.normalize(); s = d.cross(r)
    return d, r, s

def bezier(P, t):
    a, b, c, d = P
    u = 1 - t
    return a * (u * u * u) + b * (3 * u * u * t) + c * (3 * u * t * t) + d * (t * t * t)

# a tube along a polyline; mod(t, th) scales the radius, zoff(t, th) shifts a ring's points in z (a tilted opening)
def tube(path, rx, ry, n, mat, ref=V((1, 0, 0)), mod=None, zoff=None, glow=None, tip=None, layer=0.0, cap_end=False, smooth=True, bind=None):
    rings = []
    m = len(path)
    for i, c in enumerate(path):
        d = (path[min(i + 1, m - 1)] - path[max(i - 1, 0)])
        d, a, b = frame_from(d, ref)
        ring = []
        t = i / (m - 1)
        for k in range(n):
            th = 2 * math.pi * k / n
            f = mod(t, th) if mod else 1.0
            p = c + a * (math.cos(th) * rx[i] * f) + b * (math.sin(th) * ry[i] * f)
            if zoff: p.z += zoff(t, th)
            ring.append(G.add_vert(p, mat, glow[i] if glow else 0.0, tip[i] if tip else t, layer, bind))
        rings.append(ring)
    for i in range(m - 1):
        for k in range(n):
            k2 = (k + 1) % n
            G.add_face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), smooth)
    if cap_end:
        e = G.add_vert(path[-1], mat, glow[-1] if glow else 0.0, 1.0, layer, bind)
        for k in range(n): G.add_face((rings[-1][k], rings[-1][(k + 1) % n], e), smooth)
    return rings

# a spike / nail (n sides) from base point p along dir; bends towards `bend` over its length (3 rings: base, mid, tip)
def spike(p, d, length, r0, mat, n=5, side=None, flat=1.0, layer=0.0, glow=0.0, bind=None, bend=None, smooth=True):
    d0, a, b = frame_from(d, side if side is not None else V((0, 0, 1)))
    mid = p + d0 * (length * 0.5) + ((bend * (length * 0.12)) if bend is not None else V())
    tipP = p + d0 * length + ((bend * (length * 0.4)) if bend is not None else V())
    rings = []
    for (c, r, tt) in ((p - d0 * r0 * 0.6, r0, 0.0), (mid, r0 * 0.55, 0.5)):
        ring = []
        for k in range(n):
            th = 2 * math.pi * (k + 0.5) / n
            ring.append(G.add_vert(c + a * (math.cos(th) * r) + b * (math.sin(th) * r * flat), mat, glow, tt, layer, bind))
        rings.append(ring)
    t = G.add_vert(tipP, mat, glow, 1.0, layer, bind)
    for k in range(n):
        k2 = (k + 1) % n
        G.add_face((rings[0][k], rings[0][k2], rings[1][k2], rings[1][k]), smooth)
        G.add_face((rings[1][k], rings[1][k2], t), smooth)

# a feather: a flat leaf from `root` along d, curling out along `out` (5 verts, 3 faces), tip glows
def leaf(root, d, out, length, width, curl, mat, layer=0.0, bind=None):
    d = d.normalized(); side = d.cross(out).normalized()
    mid = root + d * (length * 0.45) + out * (curl * 0.25)
    tp = root + d * length + out * curl
    r0 = G.add_vert(root - side * (width * 0.3), mat, 0, 0.0, layer, bind); r1 = G.add_vert(root + side * (width * 0.3), mat, 0, 0.0, layer, bind)
    m0 = G.add_vert(mid - side * width, mat, 0, 0.45, layer, bind); m1 = G.add_vert(mid + side * width, mat, 0, 0.45, layer, bind)
    t = G.add_vert(tp, mat, 0, 1.0, layer, bind)
    G.add_face((r0, r1, m1, m0), True); G.add_face((m0, m1, t), True)

def ellipsoid(c, r, mat, nu=16, nv=10, layer=0.0, bind=None):
    idx = []
    top = G.add_vert(c + V((0, 0, r[2])), mat, 0, 0, layer, bind); bot = G.add_vert(c - V((0, 0, r[2])), mat, 0, 0, layer, bind)
    for j in range(1, nv):
        ph = math.pi * j / nv; row = []
        for k in range(nu):
            th = 2 * math.pi * k / nu
            row.append(G.add_vert(c + V((math.sin(ph) * math.cos(th) * r[0], math.sin(ph) * math.sin(th) * r[1], math.cos(ph) * r[2])), mat, 0, 0, layer, bind))
        idx.append(row)
    for k in range(nu):
        k2 = (k + 1) % nu
        G.add_face((top, idx[0][k], idx[0][k2])); G.add_face((bot, idx[-1][k2], idx[-1][k]))
        for j in range(nv - 2): G.add_face((idx[j][k], idx[j + 1][k], idx[j + 1][k2], idx[j][k2]))

# ------------------------------------------------------------------------------------------------ 1. the body (skin modifier graph)
# the rest pose (z up, front -y): hunched, the head forward, the arms hanging with the elbows bent
JP = {'pelvis': (0, 0.01, 0.90), 'waist': (0, 0.0, 1.02), 'chest': (0, -0.022, 1.17), 'neck': (0, -0.058, 1.315), 'head': (0, -0.075, 1.43)}
for s_, L_ in ((1, 'L'), (-1, 'R')):
    JP['clav' + L_] = (s_ * 0.07, -0.03, 1.262); JP['sho' + L_] = (s_ * 0.148, -0.022, 1.262)
    JP['elb' + L_] = (s_ * 0.212, 0.04, 1.015); JP['wri' + L_] = (s_ * 0.238, -0.05, 0.788); JP['palm' + L_] = (s_ * 0.248, -0.068, 0.738)
N = {}
E = []
def node(name, p, r, parent=None):
    N[name] = (V(p), r)
    if parent: E.append((parent, name))
lerp = lambda a, b, t: V(a) + (V(b) - V(a)) * t
node('pelvis', JP['pelvis'], (0.08, 0.065))
node('waist', JP['waist'], (0.066, 0.054), 'pelvis')
node('chest', JP['chest'], (0.09, 0.07), 'waist')
node('neck', JP['neck'], (0.036, 0.036), 'chest')
node('headc', JP['head'], (0.05, 0.05), 'neck')
for s, L in ((1, 'L'), (-1, 'R')):
    node('clav' + L, JP['clav' + L], (0.044, 0.04), 'chest')
    node('sho' + L, JP['sho' + L], (0.046, 0.044), 'clav' + L)                       # a little mass on the shoulder
    node('uam' + L, lerp(JP['sho' + L], JP['elb' + L], 0.45), (0.033, 0.032), 'sho' + L)
    node('elb' + L, JP['elb' + L], (0.029, 0.029), 'uam' + L)
    node('fam' + L, lerp(JP['elb' + L], JP['wri' + L], 0.35), (0.032, 0.03), 'elb' + L)   # the forearm's belly
    node('wri' + L, JP['wri' + L], (0.018, 0.017), 'fam' + L)
    node('palm' + L, JP['palm' + L], (0.027, 0.014), 'wri' + L)
    node('hip' + L, (s * 0.09, 0.0, 0.86), (0.04, 0.04), 'pelvis')          # (thighs thin: never seen, the robe stays outside)
    node('kne' + L, (s * 0.135, -0.025, 0.47), (0.037, 0.036), 'hip' + L)
    node('shm' + L, (s * 0.15, 0.0, 0.29), (0.031, 0.031), 'kne' + L)
    node('ank' + L, (s * 0.165, 0.02, 0.10), (0.032, 0.03), 'shm' + L)
    node('heel' + L, (s * 0.165, 0.03, 0.05), (0.025, 0.023), 'ank' + L)
    # a bird-like foot: three long toes forward, one back (nails added on the tips)
    for ti, dx in enumerate((-0.045, 0.0, 0.045)):
        a = V((s * 0.165 + s * dx * 0.4, -0.03, 0.035))
        b = a + V((s * dx, -0.07, -0.012))
        node(f't{ti}a{L}', a, (0.015, 0.013), 'heel' + L)
        node(f't{ti}b{L}', b, (0.009, 0.008), f't{ti}a{L}')
    node('tbk' + L, (s * 0.165, 0.075, 0.02), (0.009, 0.008), 'heel' + L)

def build_body():
    names = list(N.keys())
    me = bpy.data.meshes.new('body_graph')
    me.from_pydata([N[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
    ob = bpy.data.objects.new('body_graph', me); bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('Skin', 'SKIN'); sk.branch_smoothing = 0.6
    for i, n in enumerate(names):
        me.skin_vertices[0].data[i].radius = N[n][1]
        me.skin_vertices[0].data[i].use_root = (n == 'pelvis')
    sd = ob.modifiers.new('Sub', 'SUBSURF'); sd.levels = 1; sd.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    base = len(G.v)
    for v in m2.vertices: G.add_vert(v.co.copy(), 0, 0, 0, rnd.random())
    for p in m2.polygons: G.add_face(tuple(base + i for i in p.vertices), True)
    body_faces = [(tuple(base + i for i in p.vertices), p.area) for p in m2.polygons]
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me); bpy.data.meshes.remove(m2)
    return body_faces

BODY_FACES = build_body()
BODY_END = len(G.v)

# ------------------------------------------------------------------------------------------------ 1b. hands: four long curved fingers with nails, a thumb
def build_hands():
    for s, L in ((1, 'L'), (-1, 'R')):
        P = V(JP['palm' + L]); bd = ('hand' + L,)
        for fi, dx in enumerate((0.017, 0.006, -0.005, -0.015)):
            ln = (0.036, 0.04, 0.038, 0.032)[fi]
            a = P + V((s * dx, -0.004 - 0.002 * fi, -0.018))
            dirs = [V((s * dx * 1.6, -0.12, -1)), V((s * dx * 1.2, -0.42, -0.9)), V((s * dx * 0.5, -0.85, -0.55))]
            path = [a]
            for k, dd in enumerate(dirs): path.append(path[-1] + dd.normalized() * ln * (1.0, 0.85, 0.7)[k])
            tube(path, [0.0078, 0.007, 0.006, 0.0048], [0.0068, 0.006, 0.0052, 0.0042], 6, 0, ref=V((0, 1, 0)), bind=bd, layer=rnd.random())
            spike(path[-1], V((s * dx * 0.3, -0.9, -0.3)), 0.034, 0.0048, 9, n=5, bend=V((0, 0, -1)), bind=bd)
        a = P + V((-s * 0.016, -0.02, -0.004))
        path = [a, a + V((-s * 0.012, -0.022, -0.02)), a + V((-s * 0.016, -0.04, -0.045))]
        tube(path, [0.0075, 0.0065, 0.0052], [0.0065, 0.0058, 0.0046], 6, 0, ref=V((0, 0, 1)), bind=bd, layer=rnd.random())
        spike(path[-1], V((0, -0.7, -0.5)), 0.026, 0.0044, 9, n=5, bend=V((0, 0, -1)), bind=bd)
        # the toes' nails
        for ti in range(3):
            a, b = N[f't{ti}a{L}'][0], N[f't{ti}b{L}'][0]
            spike(b, (b - a).normalized() + V((0, 0, -0.35)), 0.042, 0.007, 9, n=5, bend=V((0, 0, -1)), bind=('rigid', b))
        spike(N['tbk' + L][0], V((0, 1, -0.4)), 0.03, 0.006, 9, n=5, bind=('rigid', N['tbk' + L][0]))
build_hands()

# ------------------------------------------------------------------------------------------------ 2. the robe: a bell from the waist to mid-shin, with volume, fall and soft folds
Z_TOP = Z_WAIST = 1.02; Z_HEM = 0.355
def robe_r(z):
    """(rx, ry, y offset) of the robe at height z (no folds)"""
    t = max(0.0, min(1.0, (Z_WAIST - z) / (Z_WAIST - Z_HEM)))
    rx = 0.082 + 0.218 * (0.55 * t + 0.45 * t ** 2.2) + 0.02 * math.sin(math.pi * t)
    return rx, rx * (0.84 - 0.14 * t), 0.004 + 0.035 * t
ROBE_N, ROBE_R = 48, 22
PH = [rnd.random() * 6.28 for _ in range(4)]
def robe_fold(t, th):
    return 1 + t ** 1.3 * (0.05 * math.sin(6 * th + PH[0]) + 0.025 * math.sin(11 * th + PH[1]) + 0.015 * math.sin(3 * th + PH[2]))
def robe_hemz(t, th):
    # the hem: a soft wave, a little longer at the back
    return t ** 4 * (0.012 * math.sin(6 * th + PH[0] + 0.6) - 0.014 * (1 + math.sin(th)) * 0.5)
def build_robe():
    rings = []
    for i in range(ROBE_R + 1):
        u = 1 - (1 - i / ROBE_R) ** 1.3                                   # rings closer near the hem
        z0 = Z_TOP + (Z_HEM - Z_TOP) * u
        rx, ry, yo = robe_r(z0)
        t = max(0.0, (Z_WAIST - z0) / (Z_WAIST - Z_HEM))
        g = max(0.0, (t - 0.8) / 0.2) ** 1.8                             # the hem's glow fades up into the cloth
        ring = []
        for k in range(ROBE_N):
            th = 2 * math.pi * k / ROBE_N
            f = robe_fold(t, th)
            p = V((math.cos(th) * rx * f, yo + math.sin(th) * ry * f, z0 + robe_hemz(t, th)))
            ring.append(G.add_vert(p, 1, g, t, th / (2 * math.pi), ('robe', th, t)))
        rings.append(ring)
    # the hem: a rolled edge (outside lip + inside) so the band reads from below
    for (dz, sc, gg) in ((-0.007, 1.01, 1.0), (0.03, 0.965, 0.7)):
        rx, ry, yo = robe_r(Z_HEM); ring = []
        for k in range(ROBE_N):
            th = 2 * math.pi * k / ROBE_N
            f = robe_fold(1.0, th)
            p = V((math.cos(th) * rx * f * sc, yo + math.sin(th) * ry * f * sc, Z_HEM + dz + robe_hemz(1.0, th)))
            ring.append(G.add_vert(p, 1, gg, 1.0, th / (2 * math.pi), ('robe', th, 1.0)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(ROBE_N):
            k2 = (k + 1) % ROBE_N
            G.add_face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), True)
build_robe()

# ------------------------------------------------------------------------------------------------ 3. the head: the skull and the snout readable under a shorter hood whose tip bends back
SKULL_C = V(JP['head'])
ellipsoid(SKULL_C, (0.068, 0.074, 0.07), 0, nu=18, nv=11, layer=0.7, bind=('head',))
ellipsoid(V((0, -0.168, 1.398)), (0.06, 0.072, 0.056), 8, nu=16, nv=10, layer=0.3, bind=('head',))      # the face: a round snout
HOOD_P = [V((0, -0.045, 1.425)), V((0, -0.03, 1.58)), V((0, 0.03, 1.71)), V((0, 0.17, 1.785))]
HOOD_M = 17
def build_hood():
    path = [bezier(HOOD_P, i / (HOOD_M - 1)) for i in range(HOOD_M)]
    rx = [0.108 * (1 - i / (HOOD_M - 1)) ** 0.85 * (1 + 0.18 * math.sin(math.pi * i / (HOOD_M - 1)) * (1 - i / (HOOD_M - 1))) + 0.0025 for i in range(HOOD_M)]
    ry = [r * 1.08 for r in rx]
    # the opening tilts: its front edge rises over the brow, its back sits low on the nape
    zo = lambda t, th: -0.04 * (1 - t) ** 2.5 * math.sin(th)
    tube(path, rx, ry, 24, 2, ref=V((1, 0, 0)), zoff=zo, layer=0.5, cap_end=True, bind=('hood',))
    # the turned-back brim inside the opening (thickness)
    p2 = [HOOD_P[0] + V((0, 0, -0.003)), HOOD_P[0] + V((0, 0, 0.045))]
    tube(p2, [0.11, 0.096], [0.118, 0.103], 24, 2, ref=V((1, 0, 0)), zoff=lambda t, th: -0.04 * math.sin(th), tip=[0.0, 0.05], layer=0.5, bind=('hood',))
build_hood()

# ------------------------------------------------------------------------------------------------ 4. the mantle of ember feathers over the shoulders and the chest
MANTLE = [(1.37, 0.06, 0.056, -0.06), (1.335, 0.1, 0.082, -0.055), (1.295, 0.146, 0.098, -0.048), (1.255, 0.178, 0.104, -0.04),
          (1.215, 0.192, 0.104, -0.032), (1.175, 0.192, 0.1, -0.026), (1.14, 0.186, 0.097, -0.022)]
def mantle_pt(j, th, out=0.0):
    z, rx, ry, yo = MANTLE[j]
    return V((math.cos(th) * (rx + out), yo + math.sin(th) * (ry + out * 0.7), z))
def build_mantle():
    path = [V((0, m[3], m[0])) for m in MANTLE]
    tube(path, [m[1] for m in MANTLE], [m[2] for m in MANTLE], 32, 3, ref=V((1, 0, 0)), tip=[0.0] * len(MANTLE), layer=0.6, bind=('mantle',))
    # layered feathers, longer and looser towards the bottom, overlapping like a ruff
    for j in range(1, len(MANTLE)):
        n = 20 + 3 * j
        for k in range(n):
            th = 2 * math.pi * (k + 0.5 * (j % 2)) / n + rnd.uniform(-0.1, 0.1)
            p = mantle_pt(j, th, 0.004)
            q = mantle_pt(min(j + 1, len(MANTLE) - 1), th, 0.004) if j < len(MANTLE) - 1 else p + V((math.cos(th) * 0.02, math.sin(th) * 0.012, -0.04))
            out = V((math.cos(th), math.sin(th) * 0.75, 0.15)).normalized()
            d = (q - p).normalized() * 0.8 + out * rnd.uniform(0.1, 0.45) + V((rnd.uniform(-0.15, 0.15), 0, -0.35))
            p = p + V((0, 0, rnd.uniform(-0.012, 0.012)))
            ln = (0.05 + 0.011 * j) * rnd.uniform(0.7, 1.4)
            leaf(p, d, out, ln, 0.008 + 0.001 * j, rnd.uniform(0.006, 0.02) + 0.002 * j, 3, layer=rnd.random(), bind=('mantle',))
build_mantle()

def inside_robe(p, pad=0.01):
    if p.z > Z_TOP + 0.01 or p.z < Z_HEM - 0.005: return False
    rx, ry, yo = robe_r(min(max(p.z, Z_HEM), Z_TOP))
    return (p.x / (rx + pad)) ** 2 + ((p.y - yo) / (ry + pad)) ** 2 < 1.0

def build_thorns():
    # small spikes on the arms and the shins (not under the mantle, the robe or on the hands and feet)
    faces = []
    for (idx, area) in BODY_FACES:
        c = sum((G.v[i] for i in idx), V()) / len(idx)
        if inside_robe(c, 0.03) or c.z > 1.2 or (c.z > 1.12 and abs(c.x) < 0.2): continue
        if abs(c.x) > 0.2 and c.z < 0.77: continue
        if c.z < 0.07: continue
        faces.append((idx, area, c))
    tot = sum(a for _, a, _ in faces)
    for _ in range(110):
        x = rnd.random() * tot; acc = 0
        for idx, area, c in faces:
            acc += area
            if acc >= x: break
        a, b, cc = G.v[idx[0]], G.v[idx[1]], G.v[idx[2]]
        u, v = rnd.random(), rnd.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        p = a + (b - a) * u + (cc - a) * v
        nrm = (b - a).cross(cc - a).normalized()
        d = nrm * 1.1 + V((0, 0, -0.8)) + V((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
        spike(p - nrm * 0.004, d, rnd.uniform(0.014, 0.026), rnd.uniform(0.0055, 0.008), 3, n=4, layer=rnd.random(), bind=('rigid', p.copy()))
build_thorns()

# ------------------------------------------------------------------------------------------------ 5. flames: thin crests where the ears would be, two small shoulder tufts
def flame_tuft(base, axis, fan, length, n_tongues, spread, bind, seed, width):
    r = random.Random(seed)
    axis = axis.normalized(); fan = (fan - axis * fan.dot(axis)).normalized(); nrm = axis.cross(fan)
    for k in range(n_tongues):
        a = -spread + 2 * spread * (k / (n_tongues - 1)) + r.uniform(-0.06, 0.06)
        d = (axis * math.cos(a) + fan * math.sin(a) + nrm * r.uniform(-0.3, 0.3)).normalized()
        ln = length * (0.55 + 0.45 * math.cos(a * 2.2)) * r.uniform(0.85, 1.1)
        tw, sd = r.uniform(-0.25, 0.25), r.random()
        side = d.cross(nrm).normalized(); side = (side * math.cos(tw) + nrm * math.sin(tw)).normalized()
        rows = []
        for j in range(8):
            t = j / 7
            c = base + d * (ln * t) + V((0, 0, 1)) * (ln * 0.22 * t * t) + side * (ln * 0.04 * math.sin(math.pi * 1.6 * t + sd * 6))
            w = width * ((t / 0.25) ** 0.6 if t < 0.25 else ((1 - t) / 0.75) ** 1.6) + 0.0006
            rows.append((G.add_vert(c - side * w, 4, 0, t, sd, bind), G.add_vert(c + side * w, 4, 0, t, sd, bind)))
        for j in range(7):
            G.add_face((rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0]), True)
for s in (1, -1):
    flame_tuft(V((s * 0.092, -0.02, 1.5)), V((s * 0.78, 0.12, 0.6)), V((0, 0, 1)), 0.2, 5, 0.3, ('head',), 11 + s, 0.02)
    flame_tuft(V((s * 0.135, 0.045, 1.305)), V((s * 0.45, 0.5, 0.75)), V((0, 1, 0)), 0.1, 3, 0.32, ('clav' + ('L' if s > 0 else 'R'),), 21 + s, 0.012)

# ------------------------------------------------------------------------------------------------ 6. the belt at the waist and the medallion on it (front, the devil's right)
BELT = (0.09, 0.075, 0.0, 1.02)                                  # rx, ry, y offset, z
def build_belt():
    rx, ry, yo, z = BELT
    tube([V((0, yo, z - 0.022)), V((0, yo, z)), V((0, yo, z + 0.024))], [rx * 1.0, rx * 1.02, rx * 0.97], [ry, ry * 1.02, ry * 0.97], 28, 1,
         ref=V((1, 0, 0)), glow=[0, 0, 0], tip=[0, 0, 0], layer=0.4, bind=('belt',))
build_belt()
def build_medallion():
    rx, ry, yo, z = BELT
    x = -0.05; y = yo - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2))
    c = V((x, y - 0.006, z)); nrm = V((x / rx ** 2, (y - yo) / ry ** 2, 0)).normalized()
    d, a, b = frame_from(nrm, V((0, 0, 1)))
    n = 16; R = 0.048; T = 0.012
    back = [G.add_vert(c + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * R, 5, 0, 0, 0.2, ('belt',)) for k in range(n)]
    front = [G.add_vert(c + d * T + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * R * 0.94, 5, 0, 0, 0.2, ('belt',)) for k in range(n)]
    ctr = G.add_vert(c + d * T, 5, 0, 0, 0.2, ('belt',))
    for k in range(n):
        k2 = (k + 1) % n
        G.add_face((back[k], back[k2], front[k2], front[k]), False); G.add_face((front[k], front[k2], ctr), False)
    ro, ri, h = 0.036, 0.027, 0.004
    pts = lambda r, z: [G.add_vert(c + d * (T + z) + (a * math.cos(math.pi / 3 * k + math.pi / 6) + b * math.sin(math.pi / 3 * k + math.pi / 6)) * r, 5, 1.0, 0, 0.2, ('belt',)) for k in range(6)]
    o0, o1, i1, i0 = pts(ro, 0), pts(ro, h), pts(ri, h), pts(ri, 0)
    for k in range(6):
        k2 = (k + 1) % 6
        G.add_face((o0[k], o0[k2], o1[k2], o1[k]), False); G.add_face((o1[k], o1[k2], i1[k2], i1[k]), False); G.add_face((i1[k], i1[k2], i0[k2], i0[k]), False)
build_medallion()
MAIN_END = len(G.v)

# ------------------------------------------------------------------------------------------------ 7. the forca (rest: upright at the right side, foot at y 0; the bar along +x)
FORCA_FOOT, FORCA_LEN = V((-0.5, 0.0, 0.0)), 2.1
def build_forca():
    b = ('forca',)
    top = FORCA_FOOT + V((0, 0, FORCA_LEN))
    tube([FORCA_FOOT, FORCA_FOOT + V((0, 0, FORCA_LEN * 0.5)), top], [0.017, 0.016, 0.015], [0.017, 0.016, 0.015], 6, 6, ref=V((1, 0, 0)), smooth=True, bind=b)
    for s in (1, -1):
        tipP = top + V((s * 0.3, 0, 0.12))
        mid = top + V((s * 0.18, 0, 0.0))
        tube([top, mid, tipP], [0.013, 0.012, 0.011], [0.013, 0.012, 0.011], 6, 6, ref=V((0, 1, 0)), smooth=True, bind=b)
        ax = (tipP - mid).normalized()
        tube([tipP - ax * 0.012, tipP + ax * 0.012], [0.04, 0.04], [0.04, 0.04], 12, 7, ref=V((0, 1, 0)), cap_end=True, smooth=False, bind=b)
build_forca()

print('verts', len(G.v), 'faces', len(G.f))

# ------------------------------------------------------------------------------------------------ 8. the rig (36 bones) and the weights
def bl(n, h, t, p): return (n, V(h), V(t), p)
BONES = [
    bl('pelvis', (0, 0.0, 0.88), JP['waist'], None),
    bl('spine', JP['waist'], JP['chest'], 'pelvis'),
    bl('chest', JP['chest'], JP['neck'], 'spine'),
    bl('neck', JP['neck'], JP['head'], 'chest'),
    bl('head', JP['head'], (0, -0.06, 1.52), 'neck'),
    bl('hood1', (0, -0.03, 1.52), (0, 0.0, 1.66), 'head'),
    bl('hood2', (0, 0.0, 1.66), (0, 0.17, 1.785), 'hood1'),
]
for s, L in ((1, 'L'), (-1, 'R')):
    BONES += [
        bl('clav' + L, (s * 0.02, -0.03, 1.25), JP['sho' + L], 'chest'),
        bl('uarm' + L, JP['sho' + L], JP['elb' + L], 'clav' + L),
        bl('farm' + L, JP['elb' + L], JP['wri' + L], 'uarm' + L),
        bl('hand' + L, JP['wri' + L], V(JP['palm' + L]) + V((s * 0.01, -0.07, -0.15)), 'farm' + L),
        bl('thigh' + L, (s * 0.09, 0.0, 0.86), (s * 0.135, -0.025, 0.47), 'pelvis'),
        bl('shin' + L, (s * 0.135, -0.025, 0.47), (s * 0.165, 0.02, 0.10), 'thigh' + L),
        bl('foot' + L, (s * 0.165, 0.02, 0.10), (s * 0.165, -0.03, 0.035), 'shin' + L),
        bl('toe' + L, (s * 0.165, -0.03, 0.035), (s * 0.165, -0.13, 0.015), 'foot' + L),
    ]
ROBE_CH = 6
for k in range(ROBE_CH):
    th = 2 * math.pi * k / ROBE_CH - math.pi / 2          # chain 0 at the front (-y)
    def rp(z, sc=1.0):
        rx, ry, yo = robe_r(z); return (math.cos(th) * rx * sc, yo + math.sin(th) * ry * sc, z)
    BONES += [bl(f'robe{k}a', rp(0.99, 0.9), rp(0.68), 'pelvis'), bl(f'robe{k}b', rp(0.68), rp(Z_HEM), f'robe{k}a')]
BONES.append(bl('forca', FORCA_FOOT, FORCA_FOOT + V((0, 0, FORCA_LEN)), None))
BI = {b[0]: i for i, b in enumerate(BONES)}
assert len(BONES) == 36, len(BONES)

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t

LIMB = {'L': ('clavL', 'uarmL', 'farmL', 'handL', 'thighL', 'shinL', 'footL', 'toeL'), 'R': ('clavR', 'uarmR', 'farmR', 'handR', 'thighR', 'shinR', 'footR', 'toeR')}
CORE = ('pelvis', 'spine', 'chest', 'neck', 'head')
def body_weights(p):
    cands = list(CORE)
    if p.x > 0.02: cands += LIMB['L']
    elif p.x < -0.02: cands += LIMB['R']
    else: cands += LIMB['L'] + LIMB['R']
    ds = []
    for n in cands:
        _, h, t, _ = BONES[BI[n]]
        d, _ = seg_dist(p, h, t)
        if n in CORE and abs(p.x) > 0.13: d += 0.05
        ds.append((d, n))
    ds.sort()
    w = [(1.0 / (d + 0.012) ** 4, n) for d, n in ds[:3]]
    tot = sum(x for x, _ in w)
    out = {n: x / tot for x, n in w if x / tot > 0.04}
    s = sum(out.values()); return {k: v / s for k, v in out.items()}

def robe_weights(th, t):
    a = (th + math.pi / 2) % (2 * math.pi) / (2 * math.pi / ROBE_CH)
    k0 = int(a) % ROBE_CH; k1 = (k0 + 1) % ROBE_CH; f = a - int(a)
    seg = 'a' if t < 0.48 else 'b'
    hard = min(1.0, t * 1.8)                                     # stiff at the waist
    out = {'pelvis': 1 - hard}
    for k, wk in ((k0, 1 - f), (k1, f)):
        out[f'robe{k}{seg}'] = out.get(f'robe{k}{seg}', 0) + hard * wk
    return out

def smooth01(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

W = [body_weights(G.v[i]) if i < BODY_END else None for i in range(len(G.v))]
import mathutils.kdtree as KD
kd = KD.KDTree(BODY_END)
for i in range(BODY_END): kd.insert(G.v[i], i)
kd.balance()
for i in range(BODY_END, len(G.v)):
    bd = G.bind[i]; p = G.v[i]
    if bd is None:
        _, j, _ = kd.find(p); W[i] = dict(W[j])
    elif bd[0] == 'rigid':
        _, j, _ = kd.find(bd[1]); W[i] = dict(W[j])
    elif bd[0] == 'belt':
        W[i] = {'pelvis': 0.45, 'spine': 0.55}
    elif bd[0] == 'robe':
        W[i] = robe_weights(bd[1], bd[2])
    elif bd[0] == 'mantle':
        a = smooth01(0.06, 0.17, abs(p.x)); up = smooth01(1.2, 1.33, p.z)
        w = {'chest': (1 - a) * (1 - up * 0.5), 'neck': (1 - a) * up * 0.5}
        if a > 0: w['clavL' if p.x > 0 else 'clavR'] = a
        W[i] = w
    elif bd[0] == 'hood':
        t = G.attr['tip'][i]
        if t < 0.2: W[i] = {'head': 1.0}
        elif t < 0.45: f = (t - 0.2) / 0.25; W[i] = {'head': 1 - f, 'hood1': f}
        elif t < 0.6: W[i] = {'hood1': 1.0}
        else: f = min(1.0, (t - 0.6) / 0.25); W[i] = {'hood1': 1 - f, 'hood2': f}
    else:
        W[i] = {bd[0]: 1.0}

# ------------------------------------------------------------------------------------------------ 9. the Blender mesh, rig and material
def make_mesh():
    me = bpy.data.meshes.new('diable2')
    me.from_pydata([tuple(v) for v in G.v], [], G.f)
    me.polygons.foreach_set('use_smooth', G.smooth)
    for k, arr in G.attr.items():
        a = me.attributes.new(k, 'FLOAT', 'POINT'); a.data.foreach_set('value', arr)
    me.validate(); me.update()
    me.set_sharp_from_angle(angle=math.radians(75))
    return me

ME = make_mesh()
OB = bpy.data.objects.new('Diable2', ME); bpy.context.scene.collection.objects.link(OB)

arm = bpy.data.armatures.new('Diable2Rig'); AR = bpy.data.objects.new('Diable2Rig', arm)
bpy.context.scene.collection.objects.link(AR)
bpy.context.view_layer.objects.active = AR; AR.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, p in BONES:
    eb = arm.edit_bones.new(n); eb.head, eb.tail = h, t; eb.roll = 0
    if p: eb.parent = arm.edit_bones[p]; eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for n, *_ in BONES: OB.vertex_groups.new(name=n)
for i, w in enumerate(W):
    for n, x in w.items(): OB.vertex_groups[n].add([i], x, 'REPLACE')
OB.parent = AR
OB.modifiers.new('Armature', 'ARMATURE').object = AR

def make_material():
    m = bpy.data.materials.new('Diable2'); m.use_nodes = True
    nt = m.node_tree; nd = nt.nodes; ln = nt.links
    for x in list(nd): nd.remove(x)
    out = nd.new('ShaderNodeOutputMaterial'); bsdf = nd.new('ShaderNodeBsdfPrincipled')
    ln.new(bsdf.outputs[0], out.inputs[0])
    def attr(name):
        a = nd.new('ShaderNodeAttribute'); a.attribute_name = name; return a.outputs['Fac']
    def math_(op, a, b=None, c=None):
        n = nd.new('ShaderNodeMath'); n.operation = op
        for k, x in enumerate((a, b, c)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[k].default_value = x
            else: ln.new(x, n.inputs[k])
        return n.outputs[0]
    def is_mat(k): return math_('COMPARE', attr('mat'), float(k), 0.5)
    def rgb(c):
        n = nd.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n.outputs[0]
    def mix(fac, a, b):
        n = nd.new('ShaderNodeMix'); n.data_type = 'RGBA'
        ln.new(fac, n.inputs['Factor']) if not isinstance(fac, float) else None
        if isinstance(fac, float): n.inputs['Factor'].default_value = fac
        ln.new(a, n.inputs[6]); ln.new(b, n.inputs[7]); return n.outputs[2]
    def scale(c, f):
        n = nd.new('ShaderNodeVectorMath'); n.operation = 'SCALE'; ln.new(c, n.inputs[0])
        if isinstance(f, float): n.inputs['Scale'].default_value = f
        else: ln.new(f, n.inputs['Scale'])
        return n.outputs[0]
    def add(a, b):
        n = nd.new('ShaderNodeVectorMath'); n.operation = 'ADD'; ln.new(a, n.inputs[0]); ln.new(b, n.inputs[1]); return n.outputs[0]
    lin = lambda h: tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))
    char, cloth = rgb(lin('2c150d')), rgb(lin('3a1810'))
    base = mix(math_('MAXIMUM', is_mat(1), is_mat(2)), char, cloth)
    # flames: layered colours, matte self-lit
    cr = nd.new('ShaderNodeValToRGB'); ln.new(attr('tip'), cr.inputs[0]); el = cr.color_ramp.elements
    el[0].position, el[0].color = 0.0, (*lin('f4e3c8'), 1); el[1].position, el[1].color = 0.85, (*lin('b3170e'), 1)
    for pos, h in ((0.22, 'f2b23a'), (0.45, 'ee6a1f'), (0.65, 'c8281a')): e = el.new(pos); e.color = (*lin(h), 1)
    fl = cr.outputs[0]
    isF = is_mat(4)
    base = mix(isF, base, fl)
    ln.new(base, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.75
    # emission: the sparks (teardrop dashes, a 3D cell pattern stretched along z), the hem, the hexagon, the thorn tips, the flames
    tc = nd.new('ShaderNodeTexCoord'); mp = nd.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (34, 34, 6)
    ln.new(tc.outputs['Object'], mp.inputs[0])
    vo = nd.new('ShaderNodeTexVoronoi'); vo.feature = 'F1'; ln.new(mp.outputs[0], vo.inputs['Vector']); vo.inputs['Randomness'].default_value = 0.9
    mr = nd.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.12, 0.22
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1.0, 0.0
    ln.new(vo.outputs['Distance'], mr.inputs['Value']); dash = mr.outputs[0]
    sep = nd.new('ShaderNodeSeparateColor'); ln.new(vo.outputs['Color'], sep.inputs[0])
    sxyz = nd.new('ShaderNodeSeparateXYZ'); ln.new(tc.outputs['Object'], sxyz.inputs[0])
    zz = sxyz.outputs['Z']
    mr2 = nd.new('ShaderNodeMapRange'); mr2.interpolation_type = 'SMOOTHSTEP'; ln.new(zz, mr2.inputs['Value'])
    mr2.inputs['From Min'].default_value, mr2.inputs['From Max'].default_value = 0.5, 1.3
    mr2.inputs['To Min'].default_value, mr2.inputs['To Max'].default_value = 0.8, 0.45      # the threshold: denser up high
    dash = math_('MULTIPLY', dash, math_('GREATER_THAN', sep.outputs[0], mr2.outputs[0]))
    mr3 = nd.new('ShaderNodeMapRange'); mr3.interpolation_type = 'SMOOTHSTEP'; ln.new(zz, mr3.inputs['Value'])
    mr3.inputs['From Min'].default_value, mr3.inputs['From Max'].default_value = 0.85, 0.36
    mr3.inputs['To Min'].default_value, mr3.inputs['To Max'].default_value = 0.0, 1.0      # the robe's inner glow, rising to the hem
    inner = math_('MULTIPLY', mr3.outputs[0], is_mat(1))
    mr4 = nd.new('ShaderNodeMapRange'); mr4.interpolation_type = 'SMOOTHSTEP'; ln.new(zz, mr4.inputs['Value'])
    mr4.inputs['From Min'].default_value, mr4.inputs['From Max'].default_value = 0.35, 1.25
    mr4.inputs['To Min'].default_value, mr4.inputs['To Max'].default_value = 0.35, 1.0      # the drips cool towards the bottom
    dash = math_('MULTIPLY', dash, mr4.outputs[0])
    notF = math_('SUBTRACT', 1.0, math_('MAXIMUM', isF, math_('MAXIMUM', is_mat(5), math_('MAXIMUM', is_mat(9), is_mat(8)))))
    spk = math_('MULTIPLY', dash, notF)
    tipg = math_('MULTIPLY', math_('POWER', attr('tip'), 5.0), math_('MAXIMUM', is_mat(3), is_mat(9)))
    lava = rgb(lin('ff7a1a')); core = rgb(lin('ffd27a'))
    em = scale(lava, math_('ADD', math_('MULTIPLY', spk, 5.0), math_('MULTIPLY', tipg, 2.2)))
    em = add(em, scale(rgb(lin('d8460e')), math_('MULTIPLY', attr('glow'), 1.25)))
    em = add(em, scale(fl, math_('MULTIPLY', isF, 0.9)))
    em = add(em, scale(rgb(lin('c8401a')), math_('MULTIPLY', inner, 0.1)))
    ln.new(em, bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
    return m
OB.data.materials.append(make_material())

# ------------------------------------------------------------------------------------------------ 10. export (three.js coords: x, z, -y)
def to3(p): return (p.x, p.z, -p.y)
def export():
    dg = bpy.context.evaluated_depsgraph_get()
    me = OB.data
    me.calc_loop_triangles()
    cn = me.corner_normals
    keymap, pos, nrm, att, skn, idx = {}, [], [], [], [], []
    names = [b[0] for b in BONES]
    for lt in me.loop_triangles:
        tri = []
        for li in lt.loops:
            vi = me.loops[li].vertex_index
            n = cn[li].vector
            key = (vi, round(n.x, 3), round(n.y, 3), round(n.z, 3))
            if key not in keymap:
                keymap[key] = len(pos)
                pos.append(to3(me.vertices[vi].co)); nrm.append(to3(n))
                att.append((G.attr['mat'][vi], G.attr['glow'][vi], G.attr['tip'][vi], G.attr['layer'][vi]))
                w = sorted(W[vi].items(), key=lambda x: -x[1])[:4]
                while len(w) < 4: w.append((names[0], 0.0))
                s = sum(x for _, x in w) or 1
                skn.append(([BI[n_] for n_, _ in w], [x / s for _, x in w]))
            tri.append(keymap[key])
        # three.js wants counter-clockwise front faces in its coords: the swap (x, z, -y) is a rotation, winding is kept
        idx += tri
    nv = len(pos)
    blob = bytearray()
    def put(arr, fmt):
        nonlocal blob
        off = len(blob); blob += struct.pack('<%d%s' % (len(arr), fmt), *arr)
        while len(blob) % 4: blob += b'\0'
        return off
    layout = {}
    layout['position'] = [put([c for p in pos for c in p], 'f'), 3, 'f32']
    layout['normal'] = [put([c for p in nrm for c in p], 'f'), 3, 'f32']
    layout['aAttr'] = [put([c for a in att for c in a], 'f'), 4, 'f32']
    layout['aSkI'] = [put([c for s in skn for c in s[0]], 'B'), 4, 'u8']
    layout['aSkW'] = [put([c for s in skn for c in s[1]], 'f'), 4, 'f32']
    big = nv > 65535
    layout['index'] = [put(idx, 'I' if big else 'H'), 1, 'u32' if big else 'u16']
    with open(os.path.join(HERE, 'diable2.bin'), 'wb') as f: f.write(blob)
    bones = [{'name': n, 'head': to3(h), 'tail': to3(t), 'parent': BI[p] if p else -1} for n, h, t, p in BONES]
    meta = {'version': 1, 'units': 'm', 'up': 'y', 'front': '+z', 'height': 1.75, 'crown': 1.875,
            'vertexCount': nv, 'indexCount': len(idx), 'triangles': len(idx) // 3, 'layout': layout, 'bones': bones,
            'mat': ['body', 'robe', 'hood', 'thorn', 'flame', 'medallion', 'forca', 'carretilla', 'snout', 'claw'],
            'forca': {'foot': to3(FORCA_FOOT), 'length': FORCA_LEN, 'prongs': [to3(FORCA_FOOT + V((s * 0.3, 0, FORCA_LEN + 0.12))) for s in (-1, 1)]}}
    with open(os.path.join(HERE, 'diable2.json'), 'w') as f: json.dump(meta, f, indent=1)
    print('EXPORT verts', nv, 'tris', len(idx) // 3, 'bytes', len(blob))
    try:
        bpy.ops.object.select_all(action='DESELECT'); OB.select_set(True); AR.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'diable2.glb'), use_selection=True, export_skins=True, export_animations=False, export_attributes=True)
    except Exception as e:
        print('GLB export failed:', e)

if EXPORT: export()

# ------------------------------------------------------------------------------------------------ 11. turnaround render
def render():
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 1536, 1024
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [x.identifier for x in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    sc.view_settings.look = 'None'
    try:
        sc.eevee.use_bloom = True
    except Exception: pass
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.012, 0.010, 0.009, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1
    if not FORCA:
        # the reference has no forca: drop its faces from the render's copy
        bm = bmesh.new(); bm.from_mesh(OB.data)
        lay = bm.verts.layers.float.get('mat')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[lay] > 5.5 and v[lay] < 7.5], context='VERTS')
        m2 = bpy.data.meshes.new('diable2_view'); bm.to_mesh(m2); bm.free()
        m2.materials.append(OB.data.materials[0]); OB.data = m2
    # four linked copies: front, 3/4, profile, back (the reference's order); the devil faces -y, the camera looks +y
    xs = (-1.35, -0.45, 0.45, 1.35); rots = (0, -40, -90, 180)
    obs = [OB]
    for k in range(1, 4):
        o = OB.copy(); o.data = OB.data; o.parent = None; sc.collection.objects.link(o)
        o.modifiers.clear(); obs.append(o)
    OB.parent = None; OB.modifiers.clear()
    for o, x, r in zip(obs, xs, rots):
        o.location = (x, 0, 0); o.rotation_euler = (0, 0, math.radians(r))
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 3.9
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0, -10, 0.93); co.rotation_euler = (math.radians(90), 0, 0)
    def light(kind, loc, energy, color, size=1.0, rot=None):
        l = bpy.data.lights.new(kind + str(len(bpy.data.lights)), kind); l.energy = energy; l.color = color
        if hasattr(l, 'size'): l.size = size
        o = bpy.data.objects.new(l.name, l); sc.collection.objects.link(o); o.location = loc; o.visible_camera = False
        if rot: o.rotation_euler = [math.radians(a) for a in rot]
        return o
    studio = [light('AREA', (-3, -6, 4), 900, (1.0, 0.55, 0.3), 6, (55, 0, -25)),
              light('AREA', (4, -3, 1), 300, (1.0, 0.45, 0.2), 4, (75, 0, 50)),
              light('AREA', (0, 5, 3), 500, (0.75, 0.8, 0.9), 5, (-60, 0, 0)),
              light('AREA', (0, -4, -0.5), 120, (1.0, 0.4, 0.15), 6, (100, 0, 0))]
    sc.render.filepath = os.path.join(HERE, 'turnaround.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', sc.render.filepath)
    # the room's light: a warm glow from the ember bed below, a faint cold rim from behind, the carretilles above
    for o in studio: o.hide_render = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.003, 0.003, 1)
    light('AREA', (0, -2.2, -0.6), 900, (1.0, 0.36, 0.1), 7, (115, 0, 0))
    light('AREA', (0, 0, -0.4), 250, (1.0, 0.3, 0.08), 5, (180, 0, 0))
    light('AREA', (0, 5, 2.5), 120, (0.62, 0.7, 0.8), 5, (-60, 0, 0))
    light('POINT', (0, -1.5, 2.6), 60, (1.0, 0.85, 0.6))
    sc.render.filepath = os.path.join(HERE, 'turnaround-warm.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', sc.render.filepath)

if RENDER: render()
