# Ressonància — plaza3d: the night square of the intro, generated in Blender (headless).
#
#   blender -b --factory-startup --python plaza_gen.py -- --out <dir> [--trees 1] [--render 0.5] [--blend <file.blend>]
#
# Stage 1 (this file today): the grey BLOCKOUT — masses, openings, lamps, the church and the chapel, the four castells as proxies —
# built in the exact geometry of the room (room3d.js): the eye at the centre at 1.6 m, four walls, one off-axis (Kooima) view per
# wall. Writes plaza.glb (three.js coordinates: the glTF exporter maps Blender (x, y, z) → (x, z, −y), which is room3d's frame),
# plaza_meta.json (eye, walls, castells, lamps) and, with --render, Cycles previews of what each wall shows.
#
# Design rules (Beltrán, 26-11): an OLD square (no cafés, chairs, umbrellas, planters); nothing tall in front of the castells (one at
# the centre of every wall, 8.5 m beyond it) and the building behind each castell is LOW so its top stands against the night sky;
# nothing vertical on the room's corners (the image folds there): the streets leave the square at the corners; stained glass lit
# from inside (a Gothic church on P2, a chapel on P3); soft edges (bevels everywhere).
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(arg('--out', os.path.join(os.path.dirname(__file__), 'out')))
TREES = arg('--trees', '0') == '1'
RENDER = float(arg('--render', '0'))
BLEND = arg('--blend', '')
LOOK = arg('--look', '0') == '1'          # look-dev: Poly Haven models, Cycles materials, night light
DETAIL = LOOK or arg('--detail', '0') == '1'
CAMS = [int(c) for c in arg('--cams', '0,1,2,3').split(',')]
os.makedirs(OUT, exist_ok=True)
for _ob in list(bpy.data.objects): bpy.data.objects.remove(_ob, do_unlink=True)

# ------------------------------------------------------------------------------------------------ the room (room3d.js, XR Lab)
# Walls in profile (strip) order P4, P1, P2, P3; widths from profiles/xrlab.json; projected height 3.75 m (Beltrán, 21-11).
WALLS = [('P4', 7.33, 1912), ('P1', 6.483, 1692), ('P2', 7.353, 1920), ('P3', 6.411, 1672)]
H_WALL, EYE_H = 3.75, 1.6
A = (WALLS[0][1] + WALLS[2][1]) / 2           # walls 0 and 2 (P4, P2)
B = (WALLS[1][1] + WALLS[3][1]) / 2           # walls 1 and 3 (P1, P3)
Z = Vector((0, 0, 1))
# Blender coordinates (z up). three (x, y, z) = Blender (x, z, −y).
SIDES = [  # centre, right (seen from inside), normal (into the room)
    (Vector((0, B / 2, 0)), Vector((1, 0, 0)), Vector((0, -1, 0))),
    (Vector((A / 2, 0, 0)), Vector((0, -1, 0)), Vector((-1, 0, 0))),
    (Vector((0, -B / 2, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0))),
    (Vector((-A / 2, 0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0))),
]
EYE = Vector((0, 0, EYE_H))
PUSH = 8.5                                     # castell: wall centre − normal · 8.5 (res-trailer, intro)
D = [17.5 if (-(c.dot(n))) < 3.4 else 18.5 for c, t, n in SIDES]   # eye → facade line, as the old plaza
SW, LS = 5.0, 22.0                             # street width at the corners, street length

class Frame:
    def __init__(self, o, t, n): self.o, self.t, self.n = o.copy(), t.copy(), n.copy()
    def p(self, u, v, w): return self.o + self.t * u + self.n * w + Z * v
def side_frame(k, extra=0.0):
    c, t, n = SIDES[k]
    return Frame(-n * (D[k] + extra), t, n)

# ------------------------------------------------------------------------------------------------ materials (blockout)
def mat(name, col, rough=0.7, emit=None, strength=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*col, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emit:
        bs.inputs['Emission Color'].default_value = (*emit, 1)
        bs.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bs.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*col, 1)
    return m
M = {
    'stone': mat('stone', (0.42, 0.40, 0.38), 0.75),
    'stone2': mat('stone_dressed', (0.50, 0.48, 0.45), 0.7),
    'church': mat('church_stone', (0.36, 0.34, 0.32), 0.8),
    'dark': mat('interior', (0.035, 0.033, 0.03), 0.9),
    'iron': mat('iron', (0.02, 0.02, 0.02), 0.5, metal=0.6),
    'wood': mat('wood', (0.06, 0.045, 0.035), 0.7),
    'glass': mat('glass_dark', (0.01, 0.012, 0.016), 0.15),
    'lit': mat('window_lit', (0.2, 0.12, 0.06), 0.4, emit=(1.0, 0.62, 0.32), strength=2.2),
    'lamp': mat('lamp_glass', (1, 0.8, 0.6), 0.3, emit=(1.0, 0.66, 0.36), strength=25),
    'roof': mat('roof', (0.16, 0.09, 0.07), 0.8),
    'floor': mat('floor', (0.13, 0.13, 0.135), 0.32),
    'vitrall': mat('stained_glass', (0.05, 0.05, 0.08), 0.3, emit=(0.22, 0.34, 0.95), strength=3.0),
    'vitrall2': mat('stained_glass_ruby', (0.08, 0.02, 0.02), 0.3, emit=(0.85, 0.16, 0.12), strength=2.5),
    'tree': mat('tree', (0.10, 0.11, 0.07), 0.9),
    'shutter': mat('shutter', (0.16, 0.22, 0.18), 0.7),
    'leak': mat('leak', (0.1, 0.09, 0.08), 0.6),
    'castell': mat('castell_proxy', (0.7, 0.8, 0.95), 0.5, emit=(0.7, 0.82, 1.0), strength=0.9, alpha=0.55),
}
M['castell'].surface_render_method = 'BLENDED' if hasattr(M['castell'], 'surface_render_method') else None

# ------------------------------------------------------------------------------------------------ geometry accumulation
COLL = {}
def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); COLL[name] = c
    return COLL[name]

class Acc:
    """One bmesh per (group, material); turned into objects at the end."""
    def __init__(self): self.b = {}
    def bm(self, group, m):
        key = (group, m)
        if key not in self.b: self.b[key] = bmesh.new()
        return self.b[key]
ACC = Acc()

def add_prism(bm, F, pts, w0, w1):
    """A prism: a closed (u, v) outline (CCW seen from the square) extruded from w0 to w1 (w towards the square)."""
    front = [bm.verts.new(F.p(u, v, w1)) for u, v in pts]
    back = [bm.verts.new(F.p(u, v, w0)) for u, v in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([back[i], back[j], front[j], front[i]])

def rect(a, b, v0, v1): return [(a, v0), (b, v0), (b, v1), (a, v1)]
def add_box(bm, F, u0, u1, v0, v1, w0, w1): add_prism(bm, F, rect(u0, u1, v0, v1), w0, w1)

def arch(a, b, v0, vs, kind='round', seg=14):
    """Opening outline from the floor v0: straight jambs up to the springing vs, then a round / pointed / segmental head."""
    cx, half = (a + b) / 2, (b - a) / 2
    pts = [(a, v0), (b, v0)]
    if kind == 'flat':
        return pts + [(b, vs), (a, vs)]
    if kind == 'round':
        for k in range(seg + 1):
            t = (k / seg) * math.pi
            pts.append((cx + half * math.cos(t), vs + half * math.sin(t)))
        return pts
    if kind == 'segment':
        rise = half * 0.3; R = (half * half + rise * rise) / (2 * rise); cy = vs + rise - R; a0 = math.asin(half / R)
        for k in range(seg + 1):
            t = a0 - (k / seg) * 2 * a0
            pts.append((cx + R * math.sin(t), cy + R * math.cos(t)))
        return pts
    # pointed (Gothic): two arcs of radius 0.85 · span
    span = b - a; R = span * 0.85
    thA = math.acos((cx - (b - R)) / R)            # angle of the apex seen from the right arc's centre (b − R, vs)
    right, left = [], []
    for k in range(seg + 1):                       # from the right springing (b, vs) up to the apex: centre (b − R, vs)
        t = (k / seg) * thA
        right.append(((b - R) + R * math.cos(t), vs + R * math.sin(t)))
    for k in range(1, seg + 1):                    # from the apex down to the left springing (a, vs): centre (a + R, vs)
        t = math.pi - thA + (k / seg) * thA
        left.append(((a + R) + R * math.cos(t), vs + R * math.sin(t)))
    return pts + right + left

def circle(cu, cv, r, seg=32):
    return [(cu + r * math.cos(2 * math.pi * k / seg), cv + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]

# ------------------------------------------------------------------------------------------------ walls with openings (boolean)
BUILDINGS = []
def wall_with_openings(name, F, outline, w0, w1, cuts, m='stone', group='square', exact=False):
    """A wall slab (outline extruded w0..w1) minus the cutters (list of (outline, cw0, cw1)); bevelled, so no edge is hard."""
    bm = bmesh.new(); add_prism(bm, F, outline, w0, w1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll(group).objects.link(ob); ob.data.materials.append(M[m])
    if cuts:
        bc = bmesh.new()
        for pts, cw0, cw1 in cuts: add_prism(bc, F, pts, cw0, cw1)
        bmesh.ops.recalc_face_normals(bc, faces=bc.faces)
        mc = bpy.data.meshes.new(name + '_cut'); bc.to_mesh(mc); bc.free()
        oc = bpy.data.objects.new(name + '_cut', mc); coll('cutters').objects.link(oc)
        oc.hide_render = True; oc.hide_viewport = True
        md = ob.modifiers.new('openings', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = oc
        if exact: md.solver = 'EXACT'; md.use_self = True          # overlapping cutters (stepped portals, rose rings)
        else: md.solver = 'MANIFOLD' if 'MANIFOLD' in [i.identifier for i in md.bl_rna.properties['solver'].enum_items] else 'EXACT'
    bv = ob.modifiers.new('soft', 'BEVEL'); bv.width = 0.025; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)
    bv.harden_normals = False
    BUILDINGS.append(ob)
    return ob

RNG_SEED = [20261126]
def rnd():
    s = RNG_SEED[0] = (RNG_SEED[0] * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff

LAMPS = []            # {pos (three coords), kind} — for the viewer and the runtime (which lamp lights when)
LIGHTS = []           # Cycles lights: (position (Blender), power W, radius m, kind)
def three(v): return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]

# ------------------------------------------------------------------------------------------------ CC0 models (Poly Haven), instanced
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets_src')
LIB = {}
def lib(mid):
    """Import a Poly Haven glTF once into its own collection (excluded from the view layer later); returns (collection, bulb centre)."""
    if mid in LIB: return LIB[mid]
    c = bpy.data.collections.new('lib_' + mid); bpy.context.scene.collection.children.link(c)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, mid, f'{mid}_1k.gltf'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
        if 'lamp' in mid or 'lantern' in mid: o.visible_shadow = False      # the light sits inside the lantern: let it out
    bpy.context.view_layer.update()
    bulb, n = Vector(), 0
    for o in new:
        if o.type != 'MESH' or not o.material_slots: continue
        for p in o.data.polygons:
            m = o.material_slots[p.material_index].material
            mname = m.name if m else ''
            if 'bulb' in mname or mname.endswith('_lamp'):
                bulb += o.matrix_world @ p.center; n += 1
    LIB[mid] = (c, bulb / max(n, 1))
    return LIB[mid]

def model_matrix(F, u, v, w, s=1.0, flip=False):
    """Model axes → frame: X → t, −Y → n (out of the wall, towards the square), Z → up."""
    t = -F.t if flip else F.t; y = F.n if flip else -F.n
    M4 = Matrix(((t.x * s, y.x * s, 0, 0), (t.y * s, y.y * s, 0, 0), (0, 0, s, 0), (0, 0, 0, 1)))
    M4.translation = F.p(u, v, w)
    return M4

def instance(mid, M4, group='square', light=None):
    c, bulb = lib(mid)
    e = bpy.data.objects.new(f'{mid}_{len(bpy.data.objects)}', None)
    e.instance_type = 'COLLECTION'; e.instance_collection = c; e.matrix_world = M4
    coll(group).objects.link(e)
    if light: LIGHTS.append((M4 @ bulb, light[0], light[1], light[2]))
    return M4 @ bulb

def wall_lantern(F, u, v, group, power=110):
    if LOOK:
        p = instance('street_lamp_02', model_matrix(F, u, v, 0.0), group, (power, 0.08, 'wall'))
    else:
        bm = ACC.bm(group, 'iron'); add_box(bm, F, u - 0.03, u + 0.03, v + 0.2, v + 0.6, 0, 0.45)
        bl = ACC.bm(group, 'lamp'); add_box(bl, F, u - 0.13, u + 0.13, v - 0.15, v + 0.2, 0.32, 0.58)
        p = F.p(u, v, 0.45)
    LAMPS.append({'pos': three(p), 'kind': 'wall'})

# ------------------------------------------------------------------------------------------------ detail kit
def steps(bm, F, u0, u1, v, prof):
    """A moulding as stacked boxes: prof = [(dv0, dv1, w_out), ...] from v; the ends return to the wall."""
    for dv0, dv1, wo in prof: add_box(bm, F, u0 - wo * 0.6, u1 + wo * 0.6, v + dv0, v + dv1, 0, wo)

def voussoirs(bm, F, cu, r, vs, n=13, depth=0.42, proud=0.05):
    for k in range(n):
        a0, a1 = math.pi * k / n + 0.004, math.pi * (k + 1) / n - 0.004
        key = k == n // 2
        R = r + (depth + 0.12 if key else depth)
        pts = [(cu + r * math.cos(a0), vs + r * math.sin(a0)), (cu + R * math.cos(a0), vs + R * math.sin(a0)),
               (cu + R * math.cos(a1), vs + R * math.sin(a1)), (cu + r * math.cos(a1), vs + r * math.sin(a1))]
        add_prism(bm, F, pts, 0, proud + (0.04 if key else 0))

def corbel(bm, F, u, v, w, width=0.16):
    for i, (h, d) in enumerate([(0.12, w), (0.12, w * 0.72), (0.14, w * 0.45)]):
        vv = v - 0.12 * i - h; add_box(bm, F, u - width / 2, u + width / 2, vv, vv + h, 0, d)

def baluster(bm, F, u, v0, h, w):
    for (r0, r1, a, b) in [(0.07, 0.07, 0.0, 0.12), (0.055, 0.09, 0.12, 0.42), (0.09, 0.045, 0.42, 0.82), (0.07, 0.07, 0.82, 1.0)]:
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r0, radius2=r1, depth=(b - a) * h)
        c = F.p(u, v0 + (a + b) / 2 * h, w)
        for vv in res['verts']: vv.co += c

def window_carpentry(bm_wood, bm_glass, F, a, b, v0, v1, w, lit_bm=None):
    """Frame, meeting stiles, transom and glazing bars of an old casement window, set back at w."""
    fw = 0.065
    for x0, x1 in ((a, a + fw), (b - fw, b), ((a + b) / 2 - 0.03, (a + b) / 2 + 0.03)):
        add_box(bm_wood, F, x0, x1, v0, v1, w - 0.03, w + 0.03)
    add_box(bm_wood, F, a, b, v1 - fw, v1, w - 0.03, w + 0.03); add_box(bm_wood, F, a, b, v0, v0 + 0.1, w - 0.03, w + 0.04)
    vt = v1 - min(0.55, (v1 - v0) * 0.22)
    add_box(bm_wood, F, a, b, vt - 0.03, vt + 0.03, w - 0.03, w + 0.03)
    n = max(2, round((vt - v0) / 0.42))
    for i in range(1, n):
        y = v0 + (vt - v0) * i / n; add_box(bm_wood, F, a, b, y - 0.012, y + 0.012, w - 0.01, w + 0.02)
    add_box(lit_bm or bm_glass, F, a, b, v0, v1, w - 0.04, w - 0.035)

def shutters(bm, F, a, b, v0, v1, mode):
    lw = (b - a) / 2
    if mode in ('open', 'one'):
        add_box(bm, F, a - 0.2 - lw, a - 0.2, v0 + 0.04, v1 - 0.02, 0.05, 0.085)
    if mode == 'open':
        add_box(bm, F, b + 0.2, b + 0.2 + lw, v0 + 0.04, v1 - 0.02, 0.05, 0.085)
    if mode in ('one', 'closed'):
        add_box(bm, F, (a + b) / 2, b, v0 + 0.02, v1 - 0.02, -0.2, -0.16)
    if mode == 'closed':
        add_box(bm, F, a, (a + b) / 2, v0 + 0.02, v1 - 0.02, -0.2, -0.16)

# ------------------------------------------------------------------------------------------------ a house
def house(name, F, u0, u1, sp, group='square'):
    """sp: h0 (ground floor), n (upper floors), hs (storey), bays, ground 'arcade'|'doors', top 'cornice'|'eave'|'balustrade',
    balc 'cont'|'single'|'none', lit (fraction of lit rooms), skin 'stone' (stucco) | 'stone2' (ashlar)"""
    bays, h0, n, hs = sp['bays'], sp['h0'], sp['n'], sp['hs']
    bw = (u1 - u0) / bays
    H = h0 + n * hs
    T = 0.6
    cuts = []
    dark, glass, lit, iron, wood, st, sh = (ACC.bm(group, k) for k in ('dark', 'glass', 'lit', 'iron', 'wood', 'stone2', 'shutter'))
    rough = ACC.bm(group, 'church')
    # ---- ground floor
    for b in range(bays):
        a0 = u0 + b * bw; a1 = a0 + bw; uc = (a0 + a1) / 2
        if sp['ground'] == 'arcade':
            ow = bw - 0.95; vs = h0 - 0.75 - ow / 2
            cuts.append((arch(uc - ow / 2, uc + ow / 2, -0.1, vs, 'round'), -T - 0.1, 0.1))
            add_box(dark, F, a0, a1, 0, h0, -4.3, -4.0)                                   # the arcade's back wall
            add_box(st, F, a0, a1, h0 - 0.35, h0 - 0.05, -4.0, -T)                         # its ceiling
            if DETAIL:
                voussoirs(st, F, uc, ow / 2, vs)
                for pu in (a0, a1):                                                        # pier faces: pilaster, impost, plinth
                    add_box(st, F, pu - 0.3, pu + 0.3, 0, vs, 0, 0.06)
                    add_box(st, F, pu - 0.38, pu + 0.38, vs - 0.24, vs, 0, 0.12)
                    add_box(rough, F, pu - 0.36, pu + 0.36, 0, 0.45, 0, 0.1)
                # the back of the bay: a lit shopfront with small panes, or an old door with a lit fanlight
                if rnd() < 0.6:
                    window_carpentry(wood, glass, F, uc - 0.95, uc + 0.95, 0.5, 3.1, -3.92, lit)
                    add_box(wood, F, uc - 1.05, uc + 1.05, 0, 0.5, -3.97, -3.88)
                else:
                    if LOOK: instance('large_castle_door', model_matrix(F, uc, 0, -3.95, 0.82), group)
                    else: add_box(wood, F, uc - 0.8, uc + 0.8, 0.0, 2.4, -3.99, -3.95)
                    add_prism(lit, F, arch(uc - 0.8, uc + 0.8, 2.45, 2.45, 'round'), -3.99, -3.97)
                # a lantern hangs from the arcade's ceiling
                if LOOK: instance('lantern_chandelier_01', model_matrix(F, uc, h0 - 0.35, -2.1, 0.9), group, (70, 0.06, 'arcade'))
                if b % 2 == 0 and b > 0: wall_lantern(F, a0, 3.4, group)                    # a lantern on every other pier
            else:
                add_box(lit if rnd() < 0.55 else wood, F, uc - 0.85, uc + 0.85, 0.05, 2.9, -3.99, -3.95)
                if b % 2 == 0 and b > 0: wall_lantern(F, a0, 3.1, group)
        else:
            door = (b % 2 == 1) or sp['ground'] == 'doors'
            ow = min(2.05, bw - 1.3) if door else min(2.0, bw - 1.2)
            oh = min(3.5, h0 - 0.8)
            kind = 'round' if door else 'segment'
            vs = oh - ow / 2 if kind == 'round' else oh - ow * 0.15
            cuts.append((arch(uc - ow / 2, uc + ow / 2, -0.1, vs, kind), -T - 0.1, 0.1))
            if DETAIL and kind == 'round': voussoirs(st, F, uc, ow / 2, vs, n=11, depth=0.36)
            if door:
                if LOOK:
                    sc = ow / 2.05
                    instance('large_castle_door', model_matrix(F, uc, 0, -0.5, sc), group)
                    if vs + ow / 2 > 2.95 * sc + 0.05:
                        add_prism(lit if rnd() < 0.6 else glass, F, arch(uc - ow / 2, uc + ow / 2, 2.95 * sc, max(vs, 2.95 * sc), kind), -0.56, -0.54)
                else: add_prism(wood, F, arch(uc - ow / 2, uc + ow / 2, 0, vs, kind), -0.5, -0.42)
            else:
                if DETAIL: window_carpentry(wood, glass, F, uc - ow / 2, uc + ow / 2, 0.7, vs, -0.36, lit if rnd() < 0.4 else None)
                else: add_prism(lit if rnd() < 0.35 else glass, F, arch(uc - ow / 2, uc + ow / 2, 0.6, vs, kind), -0.42, -0.4)
                add_box(st, F, uc - ow / 2, uc + ow / 2, 0, 0.7 if DETAIL else 0.6, -0.42, -0.3)
                if DETAIL:                                                                    # an iron grille
                    for k in range(1, int(ow / 0.14)):
                        x = uc - ow / 2 + k * 0.14; add_box(iron, F, x - 0.01, x + 0.01, 0.7, vs, -0.16, -0.14)
            if DETAIL: add_box(rough, F, a0, a1, 0, 0.55, 0, 0.06)                           # a worn plinth
    if DETAIL and sp['ground'] != 'arcade':
        for k in range(1, bays):                                                              # wall lanterns between bays
            if k % 2 == 1: wall_lantern(F, u0 + k * bw, 3.3, group)
    # the impost cornice over the ground floor
    if DETAIL: steps(st, F, u0, u1, h0 - 0.12, [(0, 0.1, 0.06), (0.1, 0.2, 0.12), (0.2, 0.3, 0.18), (0.3, 0.36, 0.12)])
    else: add_box(st, F, u0, u1, h0 - 0.1, h0 + 0.18, 0, 0.16)
    # ---- upper storeys
    shut_mode = ['open', 'open', 'one', 'closed', 'none']
    for s in range(n):
        v0 = h0 + s * hs
        if s > 0:
            if DETAIL: steps(st, F, u0, u1, v0 - 0.06, [(0, 0.12, 0.06), (0.12, 0.18, 0.1)])
            else: add_box(st, F, u0, u1, v0 - 0.04, v0 + 0.1, 0, 0.08)
        for b in range(bays):
            uc = u0 + (b + 0.5) * bw
            ow = min(1.3, max(1.0, bw * 0.34))
            balc = sp['balc'] != 'none' and (s == 0 or rnd() < 0.6)
            sill = v0 + (0.15 if balc else 0.95); wh = min(hs - 0.85, 2.55) if balc else 1.45
            top = sill + wh
            cuts.append((rect(uc - ow / 2, uc + ow / 2, sill, top), -T - 0.1, 0.1))
            is_lit = rnd() < sp.get('lit', 0.2)
            if DETAIL:
                window_carpentry(wood, glass, F, uc - ow / 2, uc + ow / 2, sill, top, -0.3, lit if is_lit else None)
                add_box(dark, F, uc - ow / 2, uc + ow / 2, sill, top, -0.6, -0.58)              # the room behind
                sw_ = 0.17                                                                       # architrave surround
                add_box(st, F, uc - ow / 2 - sw_, uc - ow / 2, sill, top + sw_, 0, 0.05)
                add_box(st, F, uc + ow / 2, uc + ow / 2 + sw_, sill, top + sw_, 0, 0.05)
                add_box(st, F, uc - ow / 2 - sw_, uc + ow / 2 + sw_, top, top + sw_, 0, 0.05)
                if s == 0:                                                                       # the principal floor's hood
                    steps(st, F, uc - ow / 2 - sw_ - 0.05, uc + ow / 2 + sw_ + 0.05, top + sw_, [(0, 0.22, 0.04), (0.22, 0.3, 0.12), (0.3, 0.38, 0.2)])
                    for cu_ in (uc - ow / 2 - sw_ - 0.02, uc + ow / 2 + sw_ + 0.02): corbel(st, F, cu_, top + sw_ + 0.22, 0.14, 0.12)
                shutters(sh, F, uc - ow / 2 - sw_, uc + ow / 2 + sw_, sill, top, shut_mode[int(rnd() * len(shut_mode))])
            else:
                add_box(lit if is_lit else glass, F, uc - ow / 2, uc + ow / 2, sill, top, -0.36, -0.34)
                add_box(st, F, uc - ow / 2 - 0.14, uc + ow / 2 + 0.14, top, top + 0.16, 0, 0.04)
            if balc:
                cont = sp['balc'] == 'cont' and s == 0
                ba, bb = (u0 + b * bw + 0.06, u0 + (b + 1) * bw - 0.06) if cont else (uc - ow / 2 - 0.45, uc + ow / 2 + 0.45)
                bd = 0.72 if s == 0 else 0.5
                add_box(st, F, ba, bb, sill - 0.14, sill, 0, bd)
                if DETAIL:
                    add_box(st, F, ba - 0.03, bb + 0.03, sill - 0.22, sill - 0.14, 0, bd + 0.03)
                    add_box(st, F, ba + 0.02, bb - 0.02, sill - 0.3, sill - 0.22, 0, bd - 0.04)
                    for cu_ in ([ba + 0.25, bb - 0.25] if not cont else [ba + 0.25, (ba + bb) / 2, bb - 0.25]):
                        corbel(st, F, cu_, sill - 0.3, bd * 0.85)
                rh = sill + 1.0; wr = bd - 0.05
                add_box(iron, F, ba, bb, rh - 0.045, rh, wr - 0.03, wr + 0.02)                 # handrail
                add_box(iron, F, ba, bb, sill + 0.06, sill + 0.09, wr - 0.012, wr + 0.012)
                add_box(iron, F, ba, bb, rh - 0.2, rh - 0.18, wr - 0.01, wr + 0.01)
                k = 0; x = ba + 0.06
                while x < bb - 0.04:                                                             # balusters, a heavier one now and then
                    t_ = 0.009 if k % 4 else 0.014
                    add_box(iron, F, x - t_, x + t_, sill + 0.06, rh - 0.04, wr - t_, wr + t_); x += 0.11; k += 1
                leak(F, ba + 0.05, bb - 0.05, sill - 0.3, rr(0.9, 2.6), group)
                for x in (ba, bb):
                    add_box(iron, F, x - 0.012, x + 0.012, sill, rh, 0, wr)
                    zz = 0.11
                    while zz < wr: add_box(iron, F, x - 0.008, x + 0.008, sill + 0.06, rh - 0.04, zz - 0.008, zz + 0.008); zz += 0.11
            else:
                add_box(st, F, uc - ow / 2 - 0.12, uc + ow / 2 + 0.12, sill - 0.1, sill, 0, 0.12)
                if rnd() < 0.7: leak(F, uc - ow / 2 - 0.05, uc + ow / 2 + 0.05, sill - 0.1, rr(0.6, 1.8), group)
                if DETAIL: corbel(st, F, uc - ow / 2, sill - 0.1, 0.1, 0.1); corbel(st, F, uc + ow / 2, sill - 0.1, 0.1, 0.1)
    # ---- the top
    top = sp['top']
    x = u0 + rr(0.1, 0.8)
    while x < u1 - 0.5:                                                                          # streaks under the cornice
        wd = rr(0.5, 1.6)
        if rnd() < 0.6: leak(F, x, min(u1, x + wd), H - 0.4, rr(0.8, 3.2), group)
        x += wd + rr(0.2, 1.2)
    if DETAIL:
        steps(st, F, u0, u1, H - 0.4, [(0, 0.32, 0.03), (0.32, 0.4, 0.1), (0.4, 0.5, 0.16)])        # frieze and bed moulding
        x = u0 + 0.3
        while x < u1 - 0.2: add_box(st, F, x - 0.06, x + 0.06, H - 0.02, H + 0.14, 0.12, 0.4); x += 0.55   # modillions
        steps(st, F, u0, u1, H + 0.1, [(0.04, 0.24, 0.48), (0.24, 0.32, 0.54), (0.32, 0.4, 0.44)])     # the corona
    else:
        add_box(st, F, u0, u1, H, H + 0.45, 0, 0.45 if top != 'eave' else 0.2)
    if top == 'balustrade':
        add_box(st, F, u0, u1, H + 0.45, H + 0.62, 0, 0.32)
        if DETAIL:
            x = u0 + 0.2; i = 0
            while x < u1 - 0.15:
                if i % 9 == 8: add_box(st, F, x - 0.13, x + 0.13, H + 0.62, H + 1.3, 0.04, 0.3)          # a pier every few
                else: baluster(st, F, x, H + 0.62, 0.68, 0.17)
                x += 0.27; i += 1
        else:
            for k in range(int((u1 - u0) / 0.32)):
                x = u0 + 0.16 + k * 0.32; add_box(st, F, x - 0.06, x + 0.06, H + 0.6, H + 1.25, 0.08, 0.24)
        add_box(st, F, u0, u1, H + 1.28, H + 1.42, 0, 0.32)
    elif top == 'eave':
        rf = ACC.bm(group, 'roof')
        a, b = F.p(u0, H + 0.4, 0.75), F.p(u1, H + 0.4, 0.75)
        c, d = F.p(u1, H + 3.0, -4.75), F.p(u0, H + 3.0, -4.75)
        vs_ = [rf.verts.new(x) for x in (a, b, c, d)]; rf.faces.new(vs_)
        vs2 = [rf.verts.new(x - Z * 0.14) for x in (a, b, c, d)]; rf.faces.new(list(reversed(vs2)))
        if DETAIL:                                                                                # rafter ends under the eave
            x = u0 + 0.2
            while x < u1: add_box(wood, F, x - 0.05, x + 0.05, H + 0.12, H + 0.26, 0, 0.7); x += 0.45
    if rnd() < 0.6:
        cu = u0 + (u1 - u0) * (0.2 + 0.6 * rnd())
        add_box(ACC.bm(group, 'stone'), F, cu - 0.35, cu + 0.35, H, H + 2.6, -3.5, -2.8)
        add_box(st, F, cu - 0.42, cu + 0.42, H + 2.6, H + 2.75, -3.57, -2.73)
    wall_with_openings(name, F, rect(u0, u1, 0, H + 0.02), -T, 0, cuts, sp.get('skin', 'stone'), group)
    # the building's body behind the facade (a real block seen from an angle; the arcade keeps its gallery free)
    body = sp.get('body', 9.5)
    if sp['ground'] == 'arcade':
        add_box(ACC.bm(group, 'stone'), F, u0, u1, 0, h0, -body, -4.3)
        add_box(ACC.bm(group, 'stone'), F, u0, u1, h0 - 0.35, H, -body, -T - 0.01)
    else:
        add_box(ACC.bm(group, 'stone'), F, u0, u1, 0, H, -body, -T - 0.01)
    return H

# ------------------------------------------------------------------------------------------------ the Gothic church (P2) and its bell tower
def church(F, u0, u1, group='square'):
    cu = (u0 + u1) / 2; Hc = 18.0; apex = 24.5
    outline = [(u0, 0), (u1, 0), (u1, Hc), (cu, apex), (u0, Hc)]
    cuts = []
    # portal: three stepped pointed arches (the archivolts)
    if LOOK:
        cuts.append((arch(cu - 1.75, cu + 1.75, -0.1, 3.4, 'pointed'), -1.6, 0.1))
    else:
        for i, (hw, w0) in enumerate([(2.45, -0.35), (2.0, -0.7), (1.6, -1.6)]):
            cuts.append((arch(cu - hw, cu + hw, -0.1, 4.6 + (2 - i) * 0.25, 'pointed'), w0, 0.1))
    # the rose window, stepped
    for r, w0 in [(2.45, -0.3), (2.1, -1.6)]:
        cuts.append((circle(cu, 9.7, r), w0, 0.1))
    # two narrow lancets either side of the rose
    for du in (-3.0, 3.0):
        cuts.append((arch(cu + du - 0.45, cu + du + 0.45, 7.4, 10.6, 'pointed'), -1.6, 0.1))
    wall_with_openings('church_facade', F, outline, -1.4, 0, cuts, 'church', group, exact=True)
    if LOOK:
        instance_fbx('door01', model_matrix(F, cu, 0, 0.05, 1.9), group)
        add_prism(ACC.bm(group, 'wood'), F, arch(cu - 1.75, cu + 1.75, 0, 3.4, 'pointed'), -1.3, -1.2)
        add_box(ACC.bm(group, 'lit'), F, cu - 0.04, cu + 0.04, 0.05, 3.2, -1.21, -1.19)              # light through the doors' gap
    else:
        add_prism(ACC.bm(group, 'wood'), F, arch(cu - 1.6, cu + 1.6, 0, 4.6, 'pointed'), -1.3, -1.2)
        add_box(ACC.bm(group, 'stone2'), F, cu - 1.6, cu + 1.6, 3.4, 3.65, -1.3, -1.1)
    # the stained glass, lit from inside
    rose = ACC.bm(group, 'vitrall'); add_prism(rose, F, circle(cu, 9.7, 2.15), -1.25, -1.2)
    tracery = ACC.bm(group, 'church')
    for k in range(12):                                                         # rose tracery: spokes + a ring
        a = k * math.pi / 6
        p0 = (cu + 0.5 * math.cos(a), 9.7 + 0.5 * math.sin(a)); p1 = (cu + 2.1 * math.cos(a), 9.7 + 2.1 * math.sin(a))
        dx, dy = (p1[1] - p0[1]) * 0.04 / 2.0, -(p1[0] - p0[0]) * 0.04 / 2.0
        add_prism(tracery, F, [(p0[0] - dx, p0[1] - dy), (p1[0] - dx, p1[1] - dy), (p1[0] + dx, p1[1] + dy), (p0[0] + dx, p0[1] + dy)], -1.2, -1.1)
    ring = circle(cu, 9.7, 0.55, 20)
    add_prism(tracery, F, ring, -1.2, -1.1)
    for du in (-3.0, 3.0):
        add_prism(ACC.bm(group, 'vitrall2'), F, arch(cu + du - 0.45, cu + du + 0.45, 7.4, 10.6, 'pointed'), -1.25, -1.2)
    # buttresses with set-offs
    for bu in (u0 + 0.6, u1 - 0.6):
        add_box(ACC.bm(group, 'church'), F, bu - 0.6, bu + 0.6, 0, 9.0, 0, 1.6)
        add_box(ACC.bm(group, 'church'), F, bu - 0.5, bu + 0.5, 9.0, 15.0, 0, 1.0)
        add_box(ACC.bm(group, 'church'), F, bu - 0.4, bu + 0.4, 15.0, 19.5, 0, 0.6)
    # a string course and a gallery band under the gable
    add_box(ACC.bm(group, 'stone2'), F, u0, u1, 6.2, 6.45, 0, 0.18)
    add_box(ACC.bm(group, 'stone2'), F, u0, u1, Hc - 0.3, Hc, 0, 0.3)
    # the nave behind (so the facade is not a card)
    add_box(ACC.bm(group, 'church'), F, u0 + 0.5, u1 - 0.5, 0, 21.0, -24, -1.41)
    # lanterns either side of the portal
    wall_lantern(F, cu - 3.4, 3.6, group); wall_lantern(F, cu + 3.4, 3.6, group)

def bell_tower(F, u0, u1, group='square'):
    Hb = 34.0; d = u1 - u0
    cuts = []
    for v in (14.0, 24.0):
        cuts.append((arch(u0 + d / 2 - 0.5, u0 + d / 2 + 0.5, v, v + 2.6, 'pointed'), -1.3, 0.1))
    for du in (-0.9, 0.9):
        cuts.append((arch(u0 + d / 2 + du - 0.5, u0 + d / 2 + du + 0.5, 28.0, 31.0, 'pointed'), -d, 0.1))
    if LOOK:
        cw = u0 + d / 2; sc_ = min(1.0, (d - 0.1) / 3.0)
        cuts.append((rect(cw - 0.8 * sc_, cw + 0.8 * sc_, 5.5 + 0.55 * sc_, 5.5 + 3.3 * sc_), -1.3, 0.1))
        instance_fbx('win02', model_matrix(F, cw, 5.5, 0.02, sc_), group)
        add_box(ACC.bm(group, 'vitrall'), F, cw - 0.9 * sc_, cw + 0.9 * sc_, 5.5 + 0.5 * sc_, 5.5 + 3.4 * sc_, -1.0, -0.98)
    wall_with_openings('bell_tower', F, rect(u0, u1, 0, Hb), -d, 0, cuts, 'church', group, exact=True)
    add_box(ACC.bm(group, 'church'), F, u0 - 0.15, u1 + 0.15, Hb, Hb + 0.6, -d - 0.15, 0.15)

# ------------------------------------------------------------------------------------------------ the chapel (P3): tall lancets of stained glass
def chapel(F, u0, u1, group='square'):
    Hc = 13.5; cu = (u0 + u1) / 2
    if LOOK:
        # Megascans Gothic pieces: a pointed portal and two tall two-light windows with stained glass behind
        dw, dsp = 0.8, 1.9
        cuts = [(arch(cu - dw, cu + dw, -0.1, dsp, 'pointed'), -1.3, 0.1)]
        lanc = [cu - 1.45, cu + 1.45]; ws = 2.3
        for lu in lanc: cuts.append((rect(lu - 0.85, lu + 0.85, 5.2, 8.95), -1.3, 0.1))
    else:
        dw, dsp = 1.0, 3.2
        cuts = [(arch(cu - dw, cu + dw, -0.1, dsp, 'pointed'), -1.3, 0.1)]
        lanc = [cu - 1.9, cu + 1.9]
        for lu in lanc: cuts.append((arch(lu - 0.55, lu + 0.55, 4.6, 10.2, 'pointed'), -1.3, 0.1))
    wall_with_openings('chapel', F, [(u0, 0), (u1, 0), (u1, Hc), (cu, Hc + 3.2), (u0, Hc)], -1.1, 0, cuts, 'church', group, exact=True)
    add_prism(ACC.bm(group, 'wood'), F, arch(cu - dw, cu + dw, 0, dsp, 'pointed'), -1.0, -0.9)
    for i, lu in enumerate(lanc):
        vm = 'vitrall' if i == 0 else 'vitrall2'
        if LOOK:
            instance_fbx('win08', model_matrix(F, lu, 5.0, 0.02, ws), group)
            add_box(ACC.bm(group, vm), F, lu - 0.95, lu + 0.95, 5.1, 9.0, -0.95, -0.9)
        else:
            add_prism(ACC.bm(group, vm), F, arch(lu - 0.55, lu + 0.55, 4.6, 10.2, 'pointed'), -0.95, -0.9)
            add_box(ACC.bm(group, 'church'), F, lu - 0.03, lu + 0.03, 4.6, 10.6, -0.9, -0.85)          # mullion
    if LOOK: instance_fbx('door01', model_matrix(F, cu, 0, 0.03, 1.05), group)
    for bu in (u0 + 0.4, u1 - 0.4):
        add_box(ACC.bm(group, 'church'), F, bu - 0.4, bu + 0.4, 0, 11.0, 0, 1.1)
    add_box(ACC.bm(group, 'church'), F, u0, u1, 0, Hc, -16, -1.11)
    leak(F, u0 + 0.9, u1 - 0.9, Hc - 0.2, 5.0, group)
    wall_lantern(F, cu - 2.9, 3.2, group)

# ------------------------------------------------------------------------------------------------ a standing fanal (cast iron, three lanterns)
def fanal(pos, group='square'):
    if LOOK:
        F = Frame(pos, Vector((1, 0, 0)), Vector((0, -1, 0)))
        p = instance('street_lamp_01', model_matrix(F, 0, 0, 0, 1.12), group, (240, 0.1, 'fanal'))
        LAMPS.append({'pos': three(p), 'kind': 'fanal'}); return
    F = Frame(pos, Vector((1, 0, 0)), Vector((0, 1, 0)))
    ir = ACC.bm(group, 'iron')
    add_box(ir, F, -0.22, 0.22, 0, 0.5, -0.22, 0.22)               # base
    add_box(ir, F, -0.08, 0.08, 0.5, 3.9, -0.08, 0.08)             # column
    lg = ACC.bm(group, 'lamp')
    for k in range(3):
        a = k * 2 * math.pi / 3
        x, y = 0.55 * math.cos(a), 0.55 * math.sin(a)
        add_box(ir, F, min(0, x) - 0.02, max(0, x) + 0.02, 3.85, 3.92, min(0, y) - 0.02, max(0, y) + 0.02)   # arm
        add_box(lg, F, x - 0.13, x + 0.13, 3.9, 4.35, y - 0.13, y + 0.13)
        add_box(ir, F, x - 0.16, x + 0.16, 4.35, 4.45, y - 0.16, y + 0.16)
    add_box(lg, F, -0.14, 0.14, 4.2, 4.7, -0.14, 0.14)
    LAMPS.append({'pos': three(pos + Z * 4.3), 'kind': 'fanal'})

def tree(pos, group='square'):
    F = Frame(pos, Vector((1, 0, 0)), Vector((0, 1, 0)))
    add_box(ACC.bm(group, 'tree'), F, -0.22, 0.22, 0, 5.0, -0.22, 0.22)
    bm = ACC.bm(group, 'tree')
    r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=3.2)
    for v in r['verts']:
        v.co.z *= 0.7; v.co += pos + Z * 7.2

# ------------------------------------------------------------------------------------------------ the castells (proxies, not exported to the final)
CASTELLS = []
def castell_proxy(k):
    c, t, n = SIDES[k]
    base = c - n * PUSH
    CASTELLS.append({'wall': WALLS[k][0], 'pos': three(base)})
    bm = ACC.bm('castells', 'castell')
    for r, h0, h1 in [(2.7, 0, 1.6), (2.0, 1.6, 2.9), (1.2, 2.9, 4.2)]:
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r * 0.92, depth=h1 - h0)
        for v in res['verts']: v.co += base + Z * ((h0 + h1) / 2)
    tiers = 5
    for i in range(tiers):
        h0 = 4.2 + i * 0.95; r = 0.8 - i * 0.04
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r * 0.95, depth=0.85)
        for v in res['verts']: v.co += base + Z * (h0 + 0.42)
    res = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.25)
    for v in res['verts']: v.co += base + Z * (4.2 + tiers * 0.95 + 0.4)

# ------------------------------------------------------------------------------------------------ look-dev (Cycles): materials, night, fog
CC0 = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'cc0'))

class NT:
    """Small node-tree builder for a material."""
    def __init__(self, m):
        m.use_nodes = True; self.nt = m.node_tree; self.nt.nodes.clear()
        self.out = self.node('ShaderNodeOutputMaterial'); self.bs = self.node('ShaderNodeBsdfPrincipled')
        self.link(self.bs.outputs[0], self.out.inputs['Surface'])
        self.tc = self.node('ShaderNodeTexCoord')
    def node(self, t, **kw):
        n = self.nt.nodes.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def link(self, a, b): self.nt.links.new(a, b)
    def mapping(self, scale):
        mp = self.node('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale if isinstance(scale, tuple) else (scale,) * 3
        self.link(self.tc.outputs['Object'], mp.inputs['Vector']); return mp.outputs[0]
    def img(self, path, vec, non_color=False):
        n = self.node('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True)
        if non_color: n.image.colorspace_settings.name = 'Non-Color'
        n.projection = 'BOX'; n.projection_blend = 0.3; self.link(vec, n.inputs['Vector']); return n.outputs['Color']
    def math(self, op, a, b=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: self.link(x, n.inputs[i])
        return n.outputs[0]
    def maprange(self, x, a, b, c, d):
        n = self.node('ShaderNodeMapRange'); self.link(x, n.inputs['Value'])
        for k, v in zip(('From Min', 'From Max', 'To Min', 'To Max'), (a, b, c, d)): n.inputs[k].default_value = v
        return n.outputs['Result']
    def mixc(self, a, b, mode='MULTIPLY', fac=1.0):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=mode, clamp_result=False)
        if isinstance(fac, (int, float)): n.inputs[0].default_value = fac
        else: self.link(fac, n.inputs[0])
        for i, x in ((6, a), (7, b)):
            if isinstance(x, tuple): n.inputs[i].default_value = (*x, 1)
            else: self.link(x, n.inputs[i])
        return n.outputs[2]
    def mixf(self, a, b, fac):
        n = self.node('ShaderNodeMix', data_type='FLOAT')
        for i, x in ((0, fac), (2, a), (3, b)):
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: self.link(x, n.inputs[i])
        return n.outputs[0]
    def ramp(self, x, stops, interp='LINEAR'):
        n = self.node('ShaderNodeValToRGB'); self.link(x, n.inputs[0]); cr = n.color_ramp; cr.interpolation = interp
        while len(cr.elements) < len(stops): cr.elements.new(0.5)
        for e, (p, c) in zip(cr.elements, stops): e.position = p; e.color = (*c, 1) if len(c) == 3 else c
        return n.outputs['Color']
    def noise(self, vec, scale, detail=6.0, rough=0.55):
        n = self.node('ShaderNodeTexNoise'); self.link(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']

def pbr(m, prefix, res, size, tint=(1, 1, 1), jitter=(0.02, 0.14), grime=0.45, damp=0.35, bump=0.4, rough_mul=1.0, floor=False):
    T = NT(m); bs = T.bs
    vec = T.mapping(1.0 / size)
    diff = T.img(f'{prefix}diff_{res}.jpg', vec); nor = T.img(f'{prefix}nor_gl_{res}.jpg', vec, True)
    rough = T.img(f'{prefix}rough_{res}.jpg', vec, True)
    disp = T.img(f'{prefix}disp_{res}.jpg', vec, True) if os.path.exists(f'{prefix}disp_{res}.jpg') else None
    col = T.mixc(diff, tint)
    # per-object variation (each building is its own object)
    oi = T.node('ShaderNodeObjectInfo')
    hsv = T.node('ShaderNodeHueSaturation'); T.link(col, hsv.inputs['Color'])
    T.link(T.maprange(oi.outputs['Random'], 0, 1, 0.5 - jitter[0], 0.5 + jitter[0]), hsv.inputs['Hue'])
    T.link(T.maprange(oi.outputs['Random'], 0, 1, 1 - jitter[1], 1 + jitter[1] * 0.6), hsv.inputs['Value'])
    col = hsv.outputs['Color']
    pos = T.tc.outputs['Object']
    if grime > 0:   # rain streaks: noise stretched along z
        mp2 = T.node('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (1.4, 1.4, 0.16); T.link(pos, mp2.inputs['Vector'])
        g = T.ramp(T.noise(mp2.outputs[0], 2.2, 8.0, 0.6), [(0.42, (1, 1, 1)), (0.72, (1 - grime, 1 - grime * 0.95, 1 - grime * 0.9))])
        col = T.mixc(col, g)
    if damp > 0:    # rising damp and dirt near the ground
        sep = T.node('ShaderNodeSeparateXYZ'); T.link(pos, sep.inputs[0])
        jit = T.math('MULTIPLY', T.noise(T.mapping(0.6), 1.0, 3.0), 0.6)
        col = T.mixc(col, T.maprange(T.math('ADD', sep.outputs['Z'], jit), 0.15, 1.4, 1 - damp, 1.0))
    ao = T.node('ShaderNodeAmbientOcclusion', only_local=True); ao.inputs['Distance'].default_value = 0.45
    col = T.mixc(col, T.maprange(ao.outputs['AO'], 0, 1, 0.35, 1.0))
    r = T.math('MULTIPLY', T.maprange(rough, 0, 1, 0, 1), rough_mul, True)
    nm = T.node('ShaderNodeNormalMap'); T.link(nor, nm.inputs['Color']); nm.inputs['Strength'].default_value = 1.0
    nrm = nm.outputs['Normal']
    if floor:
        # wet stone: puddles where the noise says so and in the low parts of the slabs; dark, glossy, flat
        pud = T.ramp(T.noise(T.mapping(0.22), 1.0, 4.0, 0.5), [(0.38, (0.25, 0.25, 0.25)), (0.52, (1, 1, 1))])
        low = T.maprange(disp, 0.22, 0.42, 0.8, 0.0) if disp else 0.0
        wet = T.math('MAXIMUM', pud, low) if disp else pud
        col = T.mixc(col, T.mixc((0.78, 0.78, 0.78), (0.42, 0.42, 0.44), 'MIX', wet))
        r = T.mixf(T.math('MULTIPLY', r, 0.55), 0.035, wet)
        T.link(wet, bs.inputs['Coat Weight']); bs.inputs['Coat Roughness'].default_value = 0.015
        bstr = T.mixf(bump, 0.02, wet)
    else:
        bstr = bump
    if disp:
        bp = T.node('ShaderNodeBump'); T.link(disp, bp.inputs['Height']); T.link(nrm, bp.inputs['Normal'])
        bp.inputs['Distance'].default_value = 0.03
        if isinstance(bstr, (int, float)): bp.inputs['Strength'].default_value = bstr
        else: T.link(bstr, bp.inputs['Strength'])
        nrm = bp.outputs['Normal']
    T.link(col, bs.inputs['Base Color']); T.link(r, bs.inputs['Roughness']); T.link(nrm, bs.inputs['Normal'])
    if floor: T.link(nrm, bs.inputs['Coat Normal'])

def emissive(m, color, strength, base=(0.02, 0.02, 0.02), vary=0.0):
    T = NT(m); T.bs.inputs['Base Color'].default_value = (*base, 1); T.bs.inputs['Roughness'].default_value = 0.25
    T.bs.inputs['Emission Color'].default_value = (*color, 1)
    if vary > 0: T.link(T.maprange(T.noise(T.mapping(0.9), 1.0, 2.0), 0.3, 0.7, strength * (1 - vary), strength * (1 + vary)), T.bs.inputs['Emission Strength'])
    else: T.bs.inputs['Emission Strength'].default_value = strength

def stained(m, stops, strength):
    T = NT(m); vec = T.mapping((1.6, 1.6, 0.9))
    v = T.node('ShaderNodeTexVoronoi'); T.link(vec, v.inputs['Vector'])
    e = T.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); T.link(vec, e.inputs['Vector'])
    sep = T.node('ShaderNodeSeparateColor'); T.link(v.outputs['Color'], sep.inputs[0])
    col = T.ramp(sep.outputs[0], stops, 'CONSTANT')
    lead = T.maprange(e.outputs['Distance'], 0.02, 0.06, 0.0, 1.0)
    T.bs.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1); T.bs.inputs['Roughness'].default_value = 0.2
    T.link(col, T.bs.inputs['Emission Color']); T.link(T.math('MULTIPLY', lead, strength), T.bs.inputs['Emission Strength'])

def plain(m, col, rough, metal=0.0, spec=0.5):
    T = NT(m); T.bs.inputs['Base Color'].default_value = (*col, 1); T.bs.inputs['Roughness'].default_value = rough
    T.bs.inputs['Metallic'].default_value = metal; T.bs.inputs['Specular IOR Level'].default_value = spec

def wood(m):
    T = NT(m); mp = T.node('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.0, 2.0, 0.25); T.link(T.tc.outputs['Object'], mp.inputs['Vector'])
    T.link(T.ramp(T.noise(mp.outputs[0], 6.0, 10.0, 0.62), [(0.3, (0.035, 0.02, 0.012)), (0.7, (0.1, 0.06, 0.032))]), T.bs.inputs['Base Color'])
    T.bs.inputs['Roughness'].default_value = 0.62

def look_materials():
    PH = lambda tid: os.path.join(ASSETS, tid, f'{tid}_')
    pbr(M['stone2'], PH('sandstone_blocks_08'), '2k', 2.4, (1.0, 0.9, 0.76), grime=0.5)
    pbr(M['stone'], PH('yellow_plaster'), '2k', 3.0, (0.86, 0.76, 0.7), jitter=(0.025, 0.16), grime=0.5, bump=0.25)
    pbr(M['church'], PH('old_sandstone_02'), '2k', 2.6, (0.82, 0.78, 0.74), grime=0.55, bump=0.5)
    pbr(M['floor'], PH('monastery_stone_floor'), '2k', 2.8, (0.8, 0.74, 0.68), jitter=(0, 0), grime=0, damp=0, bump=0.6, floor=True)
    pbr(M['shutter'], PH('worn_shutter'), '2k', 1.3, (0.42, 0.52, 0.44), jitter=(0.08, 0.25), grime=0.2, damp=0, bump=0.3)
    roof = os.path.join(CC0, 'clay_roof_tiles_02', 'clay_roof_tiles_02_')
    pbr(M['roof'], roof, '1k', 2.0, (0.7, 0.55, 0.5), grime=0.4, damp=0, bump=0.3)
    emissive(M['lit'], (1.0, 0.38, 0.12), 1.1, base=(0.05, 0.03, 0.02), vary=0.8)
    emissive(M['lamp'], (1.0, 0.55, 0.25), 40.0)
    stained(M['vitrall'], [(0.0, (0.03, 0.07, 0.55)), (0.35, (0.06, 0.14, 0.8)), (0.62, (0.02, 0.05, 0.4)), (0.78, (0.7, 0.04, 0.05)), (0.88, (0.9, 0.5, 0.06)), (0.95, (0.05, 0.35, 0.18))], 3.0)
    stained(M['vitrall2'], [(0.0, (0.55, 0.03, 0.05)), (0.4, (0.75, 0.05, 0.04)), (0.66, (0.04, 0.08, 0.6)), (0.84, (0.9, 0.5, 0.06)), (0.94, (0.35, 0.02, 0.06))], 3.5)
    plain(M['glass'], (0.008, 0.009, 0.012), 0.05, spec=0.7)
    plain(M['dark'], (0.02, 0.018, 0.016), 0.9)
    plain(M['iron'], (0.025, 0.025, 0.028), 0.42, metal=0.6)
    wood(M['wood'])
    leak_material(M['leak'])
    # the Poly Haven lamps: the bulbs light, the glass glows warm
    for mm in bpy.data.materials:
        if mm.name.endswith('_bulb') or mm.name.endswith('_lamp'):
            emissive(mm, (1.0, 0.55, 0.25), 60.0, base=(1, 0.8, 0.6))
        elif mm.name.endswith('_glass') and mm.use_nodes:
            bs = mm.node_tree.nodes.get('Principled BSDF')
            if bs: bs.inputs['Emission Color'].default_value = (1.0, 0.6, 0.3, 1); bs.inputs['Emission Strength'].default_value = 3.0

def look_world(sc):
    w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(ASSETS, 'qwantani_night_puresky', 'qwantani_night_puresky_2k.hdr'))
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
    mix.inputs[7].default_value = (0.55, 0.65, 1.0, 1)
    nt.links.new(env.outputs['Color'], mix.inputs[6]); nt.links.new(mix.outputs[2], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = float(arg('--sky', '0.35'))
    sun = bpy.data.lights.new('moon', 'SUN'); sun.energy = 0.2; sun.color = (0.55, 0.62, 1.0); sun.angle = math.radians(0.6)
    so = bpy.data.objects.new('moon', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(52), 0, math.radians(-30))
    # the wet floor and the glass see a dimmer sky (no blue sheen at the street mouths)
    lp = nt.nodes.new('ShaderNodeLightPath'); ms = nt.nodes.new('ShaderNodeMath'); ms.operation = 'MULTIPLY_ADD'
    ms.inputs[1].default_value = -float(arg('--sky', '0.35')) * 0.8; ms.inputs[2].default_value = float(arg('--sky', '0.35'))
    nt.links.new(lp.outputs['Is Glossy Ray'], ms.inputs[0]); nt.links.new(ms.outputs[0], bg.inputs['Strength'])
    # organic fog: low mist that pools in banks and thins in clearings, its top undulating; a faint high veil for depth
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * 160, v.co.y * 160, (v.co.z + 0.5) * 40))
    me = bpy.data.meshes.new('haze'); bm.to_mesh(me); bm.free()
    hz = bpy.data.objects.new('haze', me); sc.collection.objects.link(hz)
    m = bpy.data.materials.new('haze'); m.use_nodes = True; t = m.node_tree; t.nodes.clear()
    def N(tp, **kw):
        n = t.nodes.new(tp)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def M(op, x, y=None, z=None):
        n = N('ShaderNodeMath', operation=op)
        for i, v in enumerate((x, y, z)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: t.links.new(v, n.inputs[i])
        return n.outputs[0]
    def noise(scale_xyz, sc_, detail, offset=(0, 0, 0)):
        mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale_xyz; mp.inputs['Location'].default_value = offset
        t.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = sc_; nz.inputs['Detail'].default_value = detail
        nz.inputs['Roughness'].default_value = 0.55; t.links.new(mp.outputs[0], nz.inputs['Vector']); return nz.outputs['Fac']
    def mr(x, a0, a1, b0, b1):
        n = N('ShaderNodeMapRange'); t.links.new(x, n.inputs['Value'])
        for k, v in zip(('From Min', 'From Max', 'To Min', 'To Max'), (a0, a1, b0, b1)): n.inputs[k].default_value = v
        return n.outputs['Result']
    out = N('ShaderNodeOutputMaterial'); vol = N('ShaderNodeVolumePrincipled')
    tc = N('ShaderNodeTexCoord'); sep = N('ShaderNodeSeparateXYZ'); t.links.new(tc.outputs['Object'], sep.inputs[0])
    dens = float(arg('--haze', '0.02'))
    zt = M('SUBTRACT', sep.outputs['Z'], mr(noise((1, 1, 1), 0.09, 2.0, (3, 7, 0)), 0.3, 0.7, -0.6, 1.4))   # undulating top
    low = M('EXPONENT', M('MULTIPLY', M('MAXIMUM', zt, 0.0), -1 / 1.3))
    banks = mr(noise((1, 1, 1.6), 0.07, 3.0), 0.36, 0.64, 0.0, 2.2)                                      # banks and clearings
    wisps = mr(noise((1, 1, 2.5), 0.45, 4.0, (11, 5, 0)), 0.3, 0.7, 0.45, 1.35)                          # wisps
    veil = M('MULTIPLY', M('EXPONENT', M('MULTIPLY', sep.outputs['Z'], -1 / 14.0)), dens * 0.07)
    d = M('MULTIPLY_ADD', M('MULTIPLY', M('MULTIPLY', low, banks), wisps), dens, veil)
    t.links.new(d, vol.inputs['Density'])
    vol.inputs['Color'].default_value = (0.86, 0.83, 0.82, 1); vol.inputs['Anisotropy'].default_value = 0.55
    t.links.new(vol.outputs[0], out.inputs['Volume'])
    hz.data.materials.append(m)

def look_lights(sc):
    for i, (p, W, r, kind) in enumerate(LIGHTS):
        ld = bpy.data.lights.new(f'{kind}_{i}', 'POINT'); ld.energy = W * float(arg('--lamps', '1')); ld.shadow_soft_size = r
        ld.color = (1.0, 0.64, 0.36)
        lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo); lo.location = p


# ------------------------------------------------------------------------------------------------ Quixel Megascans (Fab) models
def rr(a, b): return a + (b - a) * rnd()

def lib_fbx(key, tint=(1.0, 0.9, 0.78), sat=0.5):
    """A Megascans FBX (assets_src/fab/<key>/mesh.fbx + 2K maps): x centred, front face at y = 0 (depth towards +y), base at z = 0."""
    if key in LIB: return LIB[key]
    folder = os.path.join(ASSETS, 'fab', key)
    c = bpy.data.collections.new('lib_' + key); bpy.context.scene.collection.children.link(c)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(folder, 'mesh.fbx'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(k) for o in new if o.type == 'MESH' for k in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    shift = Vector(((mn.x + mx.x) / 2, mn.y, mn.z))
    for o in new:
        if o.parent is None: o.location -= shift
    m = bpy.data.materials.new('fab_' + key); T = NT(m); uvv = T.tc.outputs['UV']
    def im(name, nc=False):
        n = T.node('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(folder, name), check_existing=True)
        if nc: n.image.colorspace_settings.name = 'Non-Color'
        T.link(uvv, n.inputs['Vector']); return n.outputs['Color']
    hsv = T.node('ShaderNodeHueSaturation'); T.link(im('2K_BaseColor.jpg'), hsv.inputs['Color']); hsv.inputs['Saturation'].default_value = sat
    col = T.mixc(T.mixc(hsv.outputs['Color'], tint), im('2K_AO.jpg', True))
    T.link(col, T.bs.inputs['Base Color']); T.link(im('2K_Roughness.jpg', True), T.bs.inputs['Roughness'])
    bp = T.node('ShaderNodeBump'); T.link(im('2K_Bump.jpg', True), bp.inputs['Height']); bp.inputs['Strength'].default_value = 0.5
    bp.inputs['Distance'].default_value = 0.01; T.link(bp.outputs['Normal'], T.bs.inputs['Normal'])
    for o in new:
        if o.type == 'MESH':
            for i in range(len(o.data.materials)): o.data.materials[i] = m
            if not o.data.materials: o.data.materials.append(m)
    LIB[key] = (c, Vector())
    return LIB[key]

def instance_fbx(key, M4, group='square'):
    c, _ = lib_fbx(key)
    e = bpy.data.objects.new(f'{key}_{len(bpy.data.objects)}', None)
    e.instance_type = 'COLLECTION'; e.instance_collection = c; e.matrix_world = M4
    coll(group).objects.link(e)

# ------------------------------------------------------------------------------------------------ leak streaks (Megascans decal), on the facade
def leak(F, u0, u1, v_top, h, group='square', w=0.004):
    if not LOOK or u1 - u0 < 0.15 or h < 0.2: return
    bm = ACC.bm(group, 'leak'); uv = bm.loops.layers.uv.verify()
    ox = rnd() * 0.6; uw = (u1 - u0) / 2.2; vh = min(1.0, h / 2.6)
    vs = [bm.verts.new(F.p(u, v, w)) for u, v in ((u0, v_top - h), (u1, v_top - h), (u1, v_top), (u0, v_top))]
    f = bm.faces.new(vs)
    for loop, (a, b) in zip(f.loops, ((ox, 1 - vh), (ox + uw, 1 - vh), (ox + uw, 1.0), (ox, 1.0))): loop[uv].uv = (a, b)

def leak_material(m):
    T = NT(m); folder = os.path.join(ASSETS, 'fab', 'leak01')
    def im(name, nc=False):
        n = T.node('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(folder, name), check_existing=True)
        n.extension = 'REPEAT'
        if nc: n.image.colorspace_settings.name = 'Non-Color'
        T.link(T.tc.outputs['UV'], n.inputs['Vector']); return n.outputs['Color']
    T.link(T.mixc(im('2K_BaseColor.jpg'), (0.16, 0.14, 0.12)), T.bs.inputs['Base Color'])
    T.bs.inputs['Roughness'].default_value = 0.4
    op = im('2K_Opacity.jpg', True)
    T.link(T.math('MULTIPLY', T.math('POWER', op, 1.4), float(arg('--leak', '0.95'))), T.bs.inputs['Alpha'])
    if arg('--leakdbg', '0') == '1': T.bs.inputs['Emission Color'].default_value = (1, 0, 0, 1); T.link(op, T.bs.inputs['Emission Strength'])

# ------------------------------------------------------------------------------------------------ the square
# Each side: segments (u0, u1, builder) on its facade line, u along the side seen from inside, 0 = behind its castell.
# Extents: side k runs u ∈ [−D[k−1], D[k+1] − SW] (the street leaves at its right end).
def ext(k): return -D[(k - 1) % 4], D[(k + 1) % 4] - SW

def H_(**kw):
    d = dict(h0=4.6, n=3, hs=3.35, bays=3, ground='doors', top='cornice', balc='single', lit=0.2, skin='stone')
    d.update(kw); return d

LOW = 5.4   # half-width of the low, quiet building behind each castell

LAYOUT = {
    0: [  # P4
        ('h', -99, -11.5, H_(n=3, bays=3, top='eave', skin='stone')),
        ('h', -11.5, -LOW, H_(n=3, bays=2, top='cornice', balc='cont', skin='stone2')),
        ('h', -LOW, LOW, H_(h0=5.0, n=1, hs=3.6, bays=4, ground='arcade', top='balustrade', balc='cont', lit=0.15, skin='stone2')),
        ('h', LOW, 99, H_(n=3, bays=3, top='cornice', skin='stone')),
    ],
    1: [  # P1 — the arcaded side (porxos)
        ('h', -99, -LOW, H_(h0=5.0, n=3, hs=3.4, bays=4, ground='arcade', top='cornice', balc='cont', lit=0.32, skin='stone2')),
        ('h', -LOW, LOW, H_(h0=5.0, n=1, hs=3.6, bays=4, ground='arcade', top='balustrade', balc='cont', lit=0.1, skin='stone2')),
        ('h', LOW, 99, H_(h0=5.0, n=3, hs=3.4, bays=3, ground='arcade', top='eave', balc='single', lit=0.32, skin='stone2')),
    ],
    2: [  # P2 — the church to the left of the castell
        ('tower', -99, -15.6, None),
        ('church', -15.6, -LOW - 0.6, None),
        ('h', -LOW, LOW, H_(h0=4.6, n=1, hs=3.6, bays=3, ground='doors', top='cornice', balc='single', lit=0.1, skin='stone')),
        ('h', LOW, 99, H_(n=3, bays=3, top='eave', skin='stone')),
    ],
    3: [  # P3 — houses and the chapel
        ('h', -99, -11.0, H_(n=3, bays=2, top='cornice', balc='cont', skin='stone2')),
        ('h', -11.0, -LOW, H_(n=3, bays=2, top='eave', skin='stone')),
        ('h', -LOW, LOW, H_(h0=4.6, n=1, hs=3.6, bays=3, ground='doors', top='balustrade', balc='single', lit=0.1, skin='stone2')),
        ('chapel', LOW + 0.4, 99, None),
    ],
}

for k in range(4):
    F = side_frame(k); ua, ub = ext(k)
    grp = f'square{k}'                     # one set of objects per side: the bake gives each side its own light groups
    for kind, a, b, sp in LAYOUT[k]:
        a, b = max(a, ua), min(b, ub)
        if kind == 'h': house(f'S{k}_{a:+.0f}', F, a, b, sp, grp)
        elif kind == 'church': church(F, a, b, grp)
        elif kind == 'tower': bell_tower(F, a, b, grp)
        elif kind == 'chapel': chapel(F, a, b, grp)
    # the street leaving at the LEFT corner of this side: this facade goes on into it
    house(f'S{k}_st1', F, ua - LS, ua - LS * 0.5, H_(n=3, bays=3, top='eave', lit=0.25), 'streets')
    house(f'S{k}_st2', F, ua - LS * 0.5, ua, H_(n=3, bays=3, top='cornice', lit=0.25), 'streets')
    # the other wall of that street: the flank of side k−1's last house, running away from the square
    kp = (k - 1) % 4; Fp = side_frame(kp); _, ubp = ext(kp)
    o = Fp.p(ubp, 0, 0); ns = Fp.t.copy(); ts = (-ns).cross(Z)
    sgn = 1 if ts.dot(-Fp.n) > 0 else -1
    Fs = Frame(o, ts * sgn, ns)
    # build it with u growing away from the square (ts·sgn points outward)
    house(f'S{k}_fl1', Fs, 9.6, LS * 0.6, H_(n=3, bays=3, top='cornice', lit=0.2), 'streets')
    house(f'S{k}_fl2', Fs, LS * 0.6, LS + 1, H_(n=3, bays=3, top='eave', lit=0.2), 'streets')
    # the end of the street: a house across it
    Fe = side_frame(kp, LS)
    house(f'S{k}_end', Fe, ubp - 4, ubp + SW + 4, H_(n=3, bays=3, top='cornice', lit=0.3), 'streets')
    wall_lantern(Fs, LS * 0.6, 4.0, 'streets')

# fanals: two per side, at ±22–27° from the castell (never on the castell, never on a corner)
for k in range(4):
    F = side_frame(k)
    for u in ((-6.0, 6.0) if TREES else (-7.5, 7.5)):
        fanal(F.p(u, 0, 3.0 if not TREES else 2.5))
    if TREES:
        for u in (-8.8, 8.8):
            tree(F.p(u, 0, 4.6), 'trees')
for k in range(4): castell_proxy(k)

# the floor of the square (one big plane; the slabs come in the next stage)
bmf = ACC.bm('floor', 'floor')
vs = [bmf.verts.new(Vector((x, y, 0))) for x, y in ((-120, -120), (120, -120), (120, 120), (-120, 120))]
bmf.faces.new(vs)

# ------------------------------------------------------------------------------------------------ objects from the accumulators
for (group, m), bm in ACC.b.items():
    me = bpy.data.meshes.new(f'{group}_{m}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f'{group}_{m}', me); coll(group).objects.link(ob); ob.data.materials.append(M[m])
    if m in ('stone', 'stone2', 'church'):
        bv = ob.modifiers.new('soft', 'BEVEL'); bv.width = 0.02; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)

# ------------------------------------------------------------------------------------------------ meta (for the viewer and the later stages)
meta = {
    'eye': [0, EYE_H, 0], 'wallHeight': H_WALL,
    'walls': [], 'castells': CASTELLS, 'lamps': LAMPS, 'D': D, 'trees': TREES,
}
for k, (wid, width, px) in enumerate(WALLS):
    c, t, n = SIDES[k]
    half = (A if k % 2 == 0 else B) / 2
    meta['walls'].append({'id': wid, 'px': px, 'width': half * 2, 'centre': three(c), 'right': three(t), 'normal': three(n)})
with open(os.path.join(OUT, 'plaza_meta.json'), 'w') as f: json.dump(meta, f, indent=1)

# ------------------------------------------------------------------------------------------------ export (glb, three.js coordinates)
bpy.context.view_layer.update()
if not LOOK:
    for ob in bpy.data.objects: ob.select_set(False)
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and not ob.hide_render: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'plaza.glb'), export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT', export_extras=False)

# ------------------------------------------------------------------------------------------------ Cycles renders of the wall views
if RENDER > 0:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences
        for dt in ('OPTIX', 'CUDA'):
            try:
                pr.compute_device_type = dt; pr.get_devices()
                if any(d.type == dt for d in pr.devices): break
            except Exception: pass
        for d in pr.devices: d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'
    except Exception as e: print('GPU?', e)
    sc.cycles.samples = int(arg('--samples', '160')); sc.cycles.use_denoising = True
    sc.cycles.volume_step_rate = 3.0
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.view_settings.exposure = float(arg('--exposure', '0.0'))
    if LOOK:
        look_materials(); look_world(sc); look_lights(sc)
        for c in bpy.data.collections:                      # the model library is only instanced
            if c.name.startswith('lib_'):
                lc = bpy.context.view_layer.layer_collection.children.get(c.name)
                if lc: lc.exclude = True
        cc = bpy.data.collections.get('castells')
        if cc and arg('--castells', '0') != '1':
            for ob in cc.objects: ob.hide_render = True
    else:
        w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True
        bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.012, 0.016, 0.032, 1); bg.inputs['Strength'].default_value = 1.0
        for i, L in enumerate(LAMPS):
            x, y, z = L['pos']; p = Vector((x, -z, y))
            ld = bpy.data.lights.new(f'L{i}', 'POINT'); ld.energy = 260 if L['kind'] == 'fanal' else 90; ld.color = (1.0, 0.6, 0.3); ld.shadow_soft_size = 0.2
            lo = bpy.data.objects.new(f'L{i}', ld); sc.collection.objects.link(lo); lo.location = p
    shots = []
    for k in CAMS:
        wid, width, px = WALLS[k]
        c, t, n = SIDES[k]
        half = (A if k % 2 == 0 else B) / 2; d = -c.dot(n)
        cam = bpy.data.cameras.new(f'cam_{wid}'); cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36
        cam.lens = 36 * d / (2 * half); cam.shift_y = (H_WALL / 2 - EYE_H) / (2 * half); cam.clip_start = 0.05; cam.clip_end = 400
        co = bpy.data.objects.new(f'cam_{wid}', cam); sc.collection.objects.link(co); co.location = EYE
        co.rotation_euler = (-n).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co
        ppm = 261 * RENDER
        sc.render.resolution_x = round(2 * half * ppm); sc.render.resolution_y = round(H_WALL * ppm); sc.render.resolution_percentage = 100
        sc.render.filepath = os.path.join(OUT, f'wall_{k}_{wid}.png')
        bpy.ops.render.render(write_still=True)
        shots.append(sc.render.filepath)
    print('RENDERED', shots)
if BLEND: bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
print('DONE', OUT)
