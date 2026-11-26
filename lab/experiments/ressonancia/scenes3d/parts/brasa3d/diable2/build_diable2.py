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
        self.bind = []          # per vertex: None (weights computed later from the body) or a fixed {bone: w}
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

# a tube along a polyline: rings[i] = (centre, rx, ry, radial_fn or None); n segments round; per-ring attributes
def tube(path, rx, ry, n, mat, ref=V((1, 0, 0)), mod=None, glow=None, tip=None, layer=0.0, cap_end=False, smooth=True, bind=None):
    rings = []
    m = len(path)
    for i, c in enumerate(path):
        d = (path[min(i + 1, m - 1)] - path[max(i - 1, 0)])
        d, a, b = frame_from(d, ref)
        ring = []
        for k in range(n):
            th = 2 * math.pi * k / n
            f = mod(i / (m - 1), th) if mod else 1.0
            p = c + a * (math.cos(th) * rx[i] * f) + b * (math.sin(th) * ry[i] * f)
            ring.append(G.add_vert(p, mat, glow[i] if glow else 0.0, tip[i] if tip else i / (m - 1), layer, bind))
        rings.append(ring)
    for i in range(m - 1):
        for k in range(n):
            k2 = (k + 1) % n
            G.add_face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), smooth)
    if cap_end:
        e = G.add_vert(path[-1], mat, glow[-1] if glow else 0.0, 1.0, layer, bind)
        for k in range(n): G.add_face((rings[-1][k], rings[-1][(k + 1) % n], e), smooth)
    return rings

# a pyramid spike (n sides) from base point p along dir, flattened by `flat` across `side`
def spike(p, d, length, r0, mat, n=4, side=None, flat=1.0, layer=0.0, glow=0.0, bind=None):
    d, a, b = frame_from(d, side if side is not None else V((0, 0, 1)))
    base = []
    for k in range(n):
        th = 2 * math.pi * (k + 0.5) / n
        q = p + a * (math.cos(th) * r0) + b * (math.sin(th) * r0 * flat) - d * r0 * 0.6
        base.append(G.add_vert(q, mat, glow, 0.0, layer, bind))
    t = G.add_vert(p + d * length, mat, glow, 1.0, layer, bind)
    for k in range(n): G.add_face((base[k], base[(k + 1) % n], t), False)

def ellipsoid(c, r, mat, nu=14, nv=9, layer=0.0, bind=None):
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
# nodes: name → (position, (rx, ry))
N = {}
E = []
def node(name, p, r, parent=None):
    N[name] = (V(p), r)
    if parent: E.append((parent, name))

node('pelvis', (0, 0.0, 0.90), (0.085, 0.07))
node('waist', (0, 0.005, 1.05), (0.07, 0.058), 'pelvis')
node('chest', (0, 0.01, 1.19), (0.078, 0.062), 'waist')
node('neck', (0, 0.0, 1.31), (0.042, 0.042), 'chest')
node('headc', (0, -0.02, 1.40), (0.07, 0.075), 'neck')
for s, L in ((1, 'L'), (-1, 'R')):
    node('clav' + L, (s * 0.085, 0.01, 1.265), (0.048, 0.042), 'chest')
    node('sho' + L, (s * 0.155, 0.012, 1.28), (0.04, 0.038), 'clav' + L)
    node('elb' + L, (s * 0.265, 0.02, 1.025), (0.028, 0.028), 'sho' + L)
    node('wri' + L, (s * 0.325, 0.0, 0.775), (0.022, 0.02), 'elb' + L)
    node('palm' + L, (s * 0.345, -0.012, 0.725), (0.028, 0.014), 'wri' + L)
    # three long fingers and a thumb (claws are added on the tips)
    for fi, (dx, dy) in enumerate(((0.012, -0.022), (0.0, 0.0), (-0.01, 0.02))):
        a = V((s * (0.35 + dx * 0.5), -0.014 + dy, 0.70))
        b = a + V((s * 0.012 + s * dx, -0.012 + dy * 0.4, -0.045))
        c = b + V((s * 0.004, -0.02, -0.035))
        node(f'f{fi}a{L}', a, (0.009, 0.008), 'palm' + L)
        node(f'f{fi}b{L}', b, (0.007, 0.006), f'f{fi}a{L}')
        node(f'f{fi}c{L}', c, (0.005, 0.0045), f'f{fi}b{L}')
    node('thu' + L, (s * 0.33, -0.04, 0.71), (0.007, 0.006), 'palm' + L)
    node('thub' + L, (s * 0.325, -0.06, 0.68), (0.005, 0.0045), 'thu' + L)
    node('hip' + L, (s * 0.09, 0.0, 0.86), (0.04, 0.04), 'pelvis')          # (thighs thin: never seen, the robe stays outside)
    node('kne' + L, (s * 0.135, -0.025, 0.47), (0.03, 0.03), 'hip' + L)
    node('ank' + L, (s * 0.165, 0.02, 0.10), (0.026, 0.026), 'kne' + L)
    node('heel' + L, (s * 0.165, 0.03, 0.05), (0.024, 0.022), 'ank' + L)
    # a bird-like foot: three long toes forward, one back
    for ti, dx in enumerate((-0.045, 0.0, 0.045)):
        a = V((s * 0.165 + s * dx * 0.4, -0.03, 0.035))
        b = a + V((s * dx, -0.07, -0.012))
        node(f't{ti}a{L}', a, (0.014, 0.012), 'heel' + L)
        node(f't{ti}b{L}', b, (0.008, 0.007), f't{ti}a{L}')
    node('tbk' + L, (s * 0.165, 0.075, 0.02), (0.008, 0.007), 'heel' + L)

def build_body():
    names = list(N.keys())
    me = bpy.data.meshes.new('body_graph')
    me.from_pydata([N[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
    ob = bpy.data.objects.new('body_graph', me); bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('Skin', 'SKIN'); sk.branch_smoothing = 0.5
    for i, n in enumerate(names):
        me.skin_vertices[0].data[i].radius = N[n][1]
        me.skin_vertices[0].data[i].use_root = (n == 'pelvis')
    sd = ob.modifiers.new('Sub', 'SUBSURF'); sd.levels = 1; sd.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m2 = bpy.data.meshes.new_from_object(ev)
    base = len(G.v)
    for v in m2.vertices: G.add_vert(v.co.copy(), 0, 0, 0, rnd.random())
    for p in m2.polygons: G.add_face(tuple(base + i for i in p.vertices), True)
    body_faces = [(tuple(base + i for i in p.vertices), p.area) for p in m2.polygons]
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me); bpy.data.meshes.remove(m2)
    return body_faces

BODY_FACES = build_body()
BODY_END = len(G.v)

# claws on the fingers and the toes
for L in ('L', 'R'):
    s = 1 if L == 'L' else -1
    for fi in range(3):
        b, c = N[f'f{fi}b{L}'][0], N[f'f{fi}c{L}'][0]
        d = (c - b).normalized() + V((0, -0.2, -0.4))
        spike(c, d, 0.04, 0.005, 9, n=5, side=V((s, 0, 0)))
    spike(N['thub' + L][0], V((0, -0.6, -0.6)), 0.03, 0.0045, 9, n=5)
    for ti in range(3):
        a, b = N[f't{ti}a{L}'][0], N[f't{ti}b{L}'][0]
        d = (b - a).normalized() + V((0, 0, -0.5))
        spike(b, d, 0.04, 0.007, 9, n=5, side=V((0, 0, 1)))
    spike(N['tbk' + L][0], V((0, 1, -0.4)), 0.03, 0.006, 9, n=5)

# ------------------------------------------------------------------------------------------------ 2. the robe (a bell to mid-shin)
Z_TOP, Z_WAIST, Z_HEM = 1.27, 1.04, 0.355
def robe_r(z):
    """(rx, ry, y offset) of the robe at height z"""
    if z >= Z_WAIST:
        t = (Z_TOP - z) / (Z_TOP - Z_WAIST)
        rx = 0.094 + 0.012 * t
        return rx, rx * 0.8, 0.008
    t = (Z_WAIST - z) / (Z_WAIST - Z_HEM)
    rx = 0.106 + 0.2 * (t ** 1.5)
    return rx, rx * (0.8 - 0.13 * t), 0.008 + 0.025 * t

ROBE_N, ROBE_R = 36, 16
def build_robe():
    zs = [Z_TOP + (Z_HEM - Z_TOP) * (i / ROBE_R) ** 0.92 for i in range(ROBE_R + 1)]
    seeds = [rnd.random() * 6.28 for _ in range(4)]
    rings = []
    for i, z in enumerate(zs):
        rx, ry, yo = robe_r(z)
        t = max(0.0, (Z_WAIST - z) / (Z_WAIST - Z_HEM))
        ring = []
        for k in range(ROBE_N):
            th = 2 * math.pi * k / ROBE_N
            fold = 1 + (0.045 * math.sin(7 * th + seeds[0] + 1.3 * t) + 0.02 * math.sin(13 * th + seeds[1])) * t ** 1.4
            p = V((math.cos(th) * rx * fold, yo + math.sin(th) * ry * fold, z))
            g = 1.0 if z < Z_HEM + 0.035 else 0.0
            ring.append(G.add_vert(p, 1, g, t, th / (2 * math.pi), ('robe', th, t)))
        rings.append(ring)
    # the hem: a thin rolled edge (outside lip + inside) so the band reads from below
    for (dz, sc) in ((-0.008, 1.012), (0.03, 0.965)):
        z = Z_HEM + dz; rx, ry, yo = robe_r(Z_HEM); ring = []
        for k in range(ROBE_N):
            th = 2 * math.pi * k / ROBE_N
            fold = 1 + (0.045 * math.sin(7 * th + seeds[0] + 1.3) + 0.02 * math.sin(13 * th + seeds[1]))
            p = V((math.cos(th) * rx * fold * sc, yo + math.sin(th) * ry * fold * sc, z))
            ring.append(G.add_vert(p, 1, 1.0, 1.0, th / (2 * math.pi), ('robe', th, 1.0)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(ROBE_N):
            k2 = (k + 1) % ROBE_N
            G.add_face((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]), True)
build_robe()

# ------------------------------------------------------------------------------------------------ 3. the hood (a tall cone leaning back) and the snout
HOOD_B, HOOD_T = V((0, 0.025, 1.335)), V((0, 0.13, 1.875))
def hood_pt(t):
    c = V((0, 0.03, 1.62))
    return (1 - t) ** 2 * HOOD_B + 2 * (1 - t) * t * c + t * t * HOOD_T
def build_hood():
    m = 15
    path = [hood_pt(i / (m - 1)) for i in range(m)]
    rx = [0.128 * (1 - i / (m - 1)) ** 0.95 * (1 + 0.12 * math.sin(math.pi * i / (m - 1))) + 0.002 for i in range(m)]
    ry = [r * 1.06 for r in rx]
    # a slight crease down the front and the back
    mod = lambda t, th: 1 - 0.05 * (1 - t) * max(0, math.cos(2 * (th + math.pi / 2))) ** 8
    tube(path, rx, ry, 20, 2, ref=V((1, 0, 0)), mod=mod, layer=0.5, cap_end=True, bind=('hood',))
    # the turned-back brim inside the opening (thickness)
    path2 = [HOOD_B + V((0, 0, -0.004)), HOOD_B + V((0, 0, 0.05))]
    tube(path2, [0.13, 0.112], [0.137, 0.118], 20, 2, ref=V((1, 0, 0)), layer=0.5, bind=('hood',))
build_hood()
ellipsoid(V((0, -0.122, 1.375)), (0.066, 0.074, 0.062), 8, layer=0.3)          # the round snout under the hood

# ------------------------------------------------------------------------------------------------ 4. the collar of ember feathers and the thorns
def build_collar():
    rows = ((0.085, 1.345, 20, 0.08), (0.12, 1.31, 24, 0.105), (0.155, 1.275, 28, 0.12), (0.185, 1.24, 26, 0.11), (0.15, 1.2, 22, 0.08))
    for ri, (r, z, n, ln) in enumerate(rows):
        for k in range(n):
            th = 2 * math.pi * (k + 0.5 * (ri % 2)) / n + rnd.uniform(-0.08, 0.08)
            # wider across the shoulders, shallower front/back
            ex = 1.0 + 0.35 * abs(math.cos(th)) * (ri / 3)
            p = V((math.cos(th) * r * ex, 0.005 + math.sin(th) * r * 0.78, z + rnd.uniform(-0.01, 0.01)))
            out = V((math.cos(th), math.sin(th) * 0.8, 0)).normalized()
            d = out * 0.55 + V((0, 0, -1.0))
            L = ln * rnd.uniform(0.75, 1.25)
            spike(p, d, L, 0.02, 3, n=4, side=out, flat=0.3, layer=rnd.random())
build_collar()

def inside_robe(p, pad=0.01):
    if p.z > Z_TOP + 0.01 or p.z < Z_HEM - 0.005: return False
    rx, ry, yo = robe_r(min(max(p.z, Z_HEM), Z_TOP))
    return (p.x / (rx + pad)) ** 2 + ((p.y - yo) / (ry + pad)) ** 2 < 1.0

def build_thorns():
    # area-weighted samples on the visible body (arms, shins), combed down the limb
    faces = []
    for (idx, area) in BODY_FACES:
        c = sum((G.v[i] for i in idx), V()) / len(idx)
        if inside_robe(c, 0.03) or c.z > 1.33: continue
        if abs(c.x) > 0.315 and c.z < 0.76: continue            # not on the hands
        if c.z < 0.06: continue                                 # not on the feet
        faces.append((idx, area, c))
    tot = sum(a for _, a, _ in faces)
    n = 120
    for _ in range(n):
        x = rnd.random() * tot; acc = 0
        for idx, area, c in faces:
            acc += area
            if acc >= x: break
        a, b, cc = G.v[idx[0]], G.v[idx[1]], G.v[idx[2]]
        u, v = rnd.random(), rnd.random()
        if u + v > 1: u, v = 1 - u, 1 - v
        p = a + (b - a) * u + (cc - a) * v
        nrm = (b - a).cross(cc - a).normalized()
        if nrm.dot(p - V((0, 0, p.z))) < 0 and abs(p.x) < 0.05: nrm = -nrm
        d = nrm * 1.1 + V((0, 0, -0.8)) + V((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
        spike(p - nrm * 0.004, d, rnd.uniform(0.016, 0.03), rnd.uniform(0.007, 0.01), 3, n=4, layer=rnd.random())
build_thorns()

# ------------------------------------------------------------------------------------------------ 5. flames: the horn crests on the hood and two shoulder tufts
LAYER_SC = (1.0,)
def flame_tuft(base, axis, fan, length, n_tongues, spread, bind, seed, width=0.04):
    r = random.Random(seed)
    axis = axis.normalized(); fan = (fan - axis * fan.dot(axis)).normalized(); nrm = axis.cross(fan)
    tongues = []
    for k in range(n_tongues):
        a = -spread + 2 * spread * (k / (n_tongues - 1)) + r.uniform(-0.08, 0.08)
        depth = r.uniform(-0.6, 0.6)
        d = (axis * math.cos(a) + fan * math.sin(a) + nrm * depth).normalized()
        ln = length * (0.62 + 0.38 * math.cos(a * 1.1)) * r.uniform(0.85, 1.1)
        tongues.append((d, ln, r.uniform(-0.25, 0.25), r.random()))
    for li, sc in enumerate(LAYER_SC):
        off = nrm * (-0.004 * li)
        for (d, ln, tw, sd) in tongues:
            ln2 = ln * sc
            side = d.cross(nrm).normalized()
            side = (side * math.cos(tw) + nrm * math.sin(tw)).normalized()
            segs = 7; rows = []
            for j in range(segs + 1):
                t = j / segs
                # curling up towards the tip
                c = base + off + d * (ln2 * t) + V((0, 0, 1)) * (ln2 * 0.25 * t * t) + side * (ln2 * 0.06 * math.sin(math.pi * 1.6 * t + sd * 6))
                w = width * sc * ((t / 0.3) ** 0.55 if t < 0.3 else ((1 - t) / 0.7) ** 1.25) + 0.0008
                rows.append((G.add_vert(c - side * w, 4, 0, t, sd, bind), G.add_vert(c + side * w, 4, 0, t, sd, bind)))
            for j in range(segs):
                G.add_face((rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0]), False)

for s in (1, -1):
    base = V((s * 0.058, 0.045, 1.595))
    flame_tuft(base, V((s * 0.66, 0.05, 0.75)), V((0, 0, 1)), 0.3, 6, 0.6, ('hood1',), 11 + s, 0.05)
    flame_tuft(V((s * 0.16, 0.045, 1.285)), V((s * 0.55, 0.45, 0.7)), V((0, 1, 0)), 0.14, 4, 0.55, ('clav' + ('L' if s > 0 else 'R'),), 21 + s, 0.028)

# ------------------------------------------------------------------------------------------------ 6. the medallion at the waist
def build_medallion():
    rx, ry, yo = robe_r(1.035)
    x = -0.062; y = yo - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2))
    c = V((x, y - 0.006, 1.035)); nrm = V((x / rx ** 2, (y - yo) / ry ** 2, 0)).normalized()
    d, a, b = frame_from(nrm, V((0, 0, 1)))
    n = 16; R = 0.052; T = 0.012
    back = [G.add_vert(c + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * R, 5, 0, 0, 0.2) for k in range(n)]
    front = [G.add_vert(c + d * T + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * R * 0.94, 5, 0, 0, 0.2) for k in range(n)]
    ctr = G.add_vert(c + d * T, 5, 0, 0, 0.2)
    for k in range(n):
        k2 = (k + 1) % n
        G.add_face((back[k], back[k2], front[k2], front[k]), False); G.add_face((front[k], front[k2], ctr), False)
    # the raised hexagon outline (glowing)
    ro, ri, h = 0.036, 0.027, 0.004
    pts = lambda r, z: [G.add_vert(c + d * (T + z) + (a * math.cos(math.pi / 3 * k + math.pi / 6) + b * math.sin(math.pi / 3 * k + math.pi / 6)) * r, 5, 1.0, 0, 0.2) for k in range(6)]
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
        # the carretilla: a small wheel on the prong's tip, its axis along the prong
        ax = (tipP - mid).normalized()
        tube([tipP - ax * 0.012, tipP + ax * 0.012], [0.04, 0.04], [0.04, 0.04], 12, 7, ref=V((0, 1, 0)), cap_end=True, smooth=False, bind=b)
build_forca()

print('verts', len(G.v), 'faces', len(G.f))

# ------------------------------------------------------------------------------------------------ 8. the rig (36 bones)
# (name, head, tail, parent)
def bl(n, h, t, p): return (n, V(h), V(t), p)
BONES = [
    bl('pelvis', (0, 0.0, 0.88), (0, 0.004, 1.05), None),
    bl('spine', (0, 0.004, 1.05), (0, 0.01, 1.19), 'pelvis'),
    bl('chest', (0, 0.01, 1.19), (0, 0.0, 1.31), 'spine'),
    bl('neck', (0, 0.0, 1.31), (0, -0.015, 1.385), 'chest'),
    bl('head', (0, -0.015, 1.385), (0, 0.02, 1.50), 'neck'),
    bl('hood1', (0, 0.02, 1.50), (0, 0.055, 1.68), 'head'),
    bl('hood2', (0, 0.055, 1.68), (0, 0.13, 1.875), 'hood1'),
]
for s, L in ((1, 'L'), (-1, 'R')):
    BONES += [
        bl('clav' + L, (s * 0.02, 0.01, 1.255), (s * 0.155, 0.012, 1.28), 'chest'),
        bl('uarm' + L, (s * 0.155, 0.012, 1.28), (s * 0.265, 0.02, 1.025), 'clav' + L),
        bl('farm' + L, (s * 0.265, 0.02, 1.025), (s * 0.325, 0.0, 0.775), 'uarm' + L),
        bl('hand' + L, (s * 0.325, 0.0, 0.775), (s * 0.355, -0.035, 0.63), 'farm' + L),
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
    BONES += [bl(f'robe{k}a', rp(1.0, 0.9), rp(0.68), 'pelvis'), bl(f'robe{k}b', rp(0.68), rp(Z_HEM), f'robe{k}a')]
BONES.append(bl('forca', FORCA_FOOT, FORCA_FOOT + V((0, 0, FORCA_LEN)), None))
BI = {b[0]: i for i, b in enumerate(BONES)}
assert len(BONES) == 36, len(BONES)

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t

# which bones a body vertex may bind to (by region, so a hand never takes the thigh)
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
        # the torso bones reach less into the limbs, the arm bones less into the chest
        if n in CORE and abs(p.x) > 0.13: d += 0.05
        ds.append((d, n))
    ds.sort()
    best = ds[:3]
    w = [(1.0 / (d + 0.012) ** 4, n) for d, n in best]
    tot = sum(x for x, _ in w)
    out = {}
    for x, n in w:
        if x / tot > 0.04: out[n] = x / tot
    s = sum(out.values()); return {k: v / s for k, v in out.items()}

def robe_weights(th, t):
    # th: angle round the robe (0 = +x), t: 0 at the waist … 1 at the hem (above the waist: the torso)
    if t <= 0.0:
        return {'chest': 0.5, 'spine': 0.5} if True else {}
    a = (th + math.pi / 2) % (2 * math.pi) / (2 * math.pi / ROBE_CH)
    k0 = int(a) % ROBE_CH; k1 = (k0 + 1) % ROBE_CH; f = a - int(a)
    seg = 'a' if t < 0.48 else 'b'
    hard = min(1.0, t * 1.8)                                     # stiff at the waist
    out = {'pelvis': 1 - hard}
    for k, wk in ((k0, 1 - f), (k1, f)):
        out[f'robe{k}{seg}'] = out.get(f'robe{k}{seg}', 0) + hard * wk
    return out

W = []
body_bind_cache = {}
for i, p in enumerate(G.v):
    bd = G.bind[i]
    if bd is None:
        w = body_weights(p)
    elif bd[0] == 'robe':
        th, t = bd[1], bd[2]
        zt = p.z
        if zt > Z_WAIST: w = {'spine': 0.55, 'chest': 0.45} if zt > 1.12 else {'pelvis': 0.3, 'spine': 0.7}
        else: w = robe_weights(th, t)
    elif bd[0] == 'hood':
        t = max(0.0, min(1.0, (p.z - HOOD_B.z) / (HOOD_T.z - HOOD_B.z)))
        if t < 0.25: w = {'head': 1.0}
        elif t < 0.5: f = (t - 0.25) / 0.25; w = {'head': 1 - f, 'hood1': f}
        elif t < 0.65: w = {'hood1': 1.0}
        else: f = min(1.0, (t - 0.65) / 0.2); w = {'hood1': 1 - f, 'hood2': f}
    else:
        w = {bd[0]: 1.0}
    W.append(w)

# spikes, claws, the snout, the collar, the medallion: rigid to their root's body weights (nearest body vertex)
import mathutils.kdtree as KD
kd = KD.KDTree(BODY_END)
for i in range(BODY_END): kd.insert(G.v[i], i)
kd.balance()
mat = G.attr['mat']
i = BODY_END
# group vertices into pieces by consecutive faces is overkill: rebind per vertex by nearest body vertex, except tagged
for i in range(BODY_END, MAIN_END):
    if G.bind[i] is not None: continue
    m_ = mat[i]
    p = G.v[i]
    if m_ == 8:                                                   # the snout follows the head
        W[i] = {'head': 1.0}; continue
    if m_ == 5:                                                   # the medallion sits on the robe at the waist
        W[i] = {'pelvis': 0.4, 'spine': 0.6}; continue
    _, j, _ = kd.find(p)
    W[i] = dict(W[j])
# claws/thorns: make each spike rigid (all of its vertices take its base's weights) — spikes are 5 or 6 consecutive verts,
# so bind each face's vertices to the weights of its first vertex
for fi, f in enumerate(G.f):
    if not G.smooth[fi] and mat[f[0]] in (3, 9):
        w0 = W[f[0]]
        for v in f: W[v] = w0

# ------------------------------------------------------------------------------------------------ 9. the Blender mesh, rig and material
def make_mesh():
    me = bpy.data.meshes.new('diable2')
    me.from_pydata([tuple(v) for v in G.v], [], G.f)
    me.polygons.foreach_set('use_smooth', G.smooth)
    for k, arr in G.attr.items():
        a = me.attributes.new(k, 'FLOAT', 'POINT'); a.data.foreach_set('value', arr)
    me.validate(); me.update()
    me.set_sharp_from_angle(angle=math.radians(50))
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
    char, cloth = rgb(lin('3a1d12')), rgb(lin('4a2214'))
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
    tc = nd.new('ShaderNodeTexCoord'); mp = nd.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (42, 42, 6)
    ln.new(tc.outputs['Object'], mp.inputs[0])
    vo = nd.new('ShaderNodeTexVoronoi'); vo.feature = 'F1'; ln.new(mp.outputs[0], vo.inputs['Vector']); vo.inputs['Randomness'].default_value = 0.9
    mr = nd.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.1, 0.24
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1.0, 0.0
    ln.new(vo.outputs['Distance'], mr.inputs['Value']); dash = mr.outputs[0]
    sep = nd.new('ShaderNodeSeparateColor'); ln.new(vo.outputs['Color'], sep.inputs[0])
    dash = math_('MULTIPLY', dash, math_('GREATER_THAN', sep.outputs[0], 0.72))
    notF = math_('SUBTRACT', 1.0, math_('MAXIMUM', isF, math_('MAXIMUM', is_mat(5), is_mat(9))))
    spk = math_('MULTIPLY', dash, notF)
    tipg = math_('MULTIPLY', math_('POWER', attr('tip'), 2.5), math_('MAXIMUM', is_mat(3), is_mat(9)))
    lava = rgb(lin('ff7a1a')); core = rgb(lin('ffd27a'))
    em = scale(lava, math_('ADD', math_('MULTIPLY', spk, 3.0), math_('MULTIPLY', tipg, 1.6)))
    em = add(em, scale(rgb(lin('f05a14')), math_('MULTIPLY', attr('glow'), 1.8)))
    em = add(em, scale(fl, math_('MULTIPLY', isF, 0.9)))
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
    light('AREA', (-3, -6, 4), 900, (1.0, 0.55, 0.3), 6, (55, 0, -25))
    light('AREA', (4, -3, 1), 300, (1.0, 0.45, 0.2), 4, (75, 0, 50))
    light('AREA', (0, 5, 3), 500, (0.75, 0.8, 0.9), 5, (-60, 0, 0))
    light('AREA', (0, -4, -0.5), 120, (1.0, 0.4, 0.15), 6, (100, 0, 0))
    sc.render.filepath = os.path.join(HERE, 'turnaround.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', sc.render.filepath)

if RENDER: render()
