# Ressonància — the correfoc's four FOGUERES, v2 (26-11-2026): real scanned burnt wood (Quixel Megascans, Fab) instead of the
# procedural logs of v1 (Beltrán: «las primeras dos se ven re feas, busca algo ya hecho mejor»), to the Interactive Director's spec:
#   P4 «pira»       a tower of crossed burnt logs, ~1.6 m high, open inside, a bed of charcoal at its foot
#   P1 «Sant Joan»  a long low bonfire ~3 m: burnt logs and charcoal heaped as at the Sant Joan verbena
#   P2 «brasero»    a wrought-iron bowl on a tripod (~1 m), riveted, with burnt wood and charcoal inside
#   P3 «corona»     a ring of stones (Ø ~1.6 m) with burnt logs laid round in a circle and embers in the middle
#
#   blender -b --factory-startup --python fire_bases2.py -- --out <dir> [--dst <brasa3d/fogueres>] [--photo 1]
#
# Each foguera: ONE mesh (≤ 8 k triangles) and ONE material baked to 1k JPGs — charcoal albedo, roughness, normal and the EMBER
# mask (emissive: glowing cracks, hotter low down; the runtime raises it with the fire's level). Plus its FIRE SOURCES (empties in
# Blender, a list in the JSON): where each flame is born — position, size (w, h, d, metres) and direction — for Personaje's
# volumetric flames and sparks. Written to <dst>: <name>.glb (study), <name>.bin + <name>.json (runtime, layout as the devil's
# diable2: little-endian f32 position / normal / uv, u16|u32 index), <name>_{albedo,normal,rough,emit}.jpg.
# Frame (glTF / three): metres, Y up, front +Z, origin = centre of the base on the floor. The flame's heart at ~1.2 m matches the
# dark bake (plaza_bake.py --mode dark --fogh 1.2): place each at its wall's centre − normal · 3.3 m.
# Sources: Quixel Megascans via Fab (Burnt Log vcsaeeyfa, Burnt Tree Log vdpgbhfva, Burnt Firewood Pack tkvmbanva / udyjbjxva;
# Quixel content licence — the raw scans stay out of git, only these baked derivatives ship), Poly Haven CC0 (stone_fire_pit,
# burned_ground_01) and ../../assets/cc0 (rusty_metal_02).
import bpy, bmesh, json, math, os, sys, random, struct
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def a(name, default): return argv[argv.index(name) + 1] if name in argv else default
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, 'assets_src'); FAB = os.path.join(SRC, 'fab')
CC0 = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'cc0'))
OUT = os.path.abspath(a('--out', os.path.join(HERE, 'out_fire2'))); os.makedirs(OUT, exist_ok=True)
DST = os.path.abspath(a('--dst', os.path.join(HERE, '..', '..', 'parts', 'brasa3d', 'fogueres'))); os.makedirs(DST, exist_ok=True)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
sc = bpy.context.scene
rng = random.Random(1126)
Z = Vector((0, 0, 1))

# ------------------------------------------------------------------------------------------------ node helpers
def nodes(m):
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], out.inputs['Surface'])
    return nt, bs
def img(nt, path, nc=False, vec=None, box=False):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True)
    if nc: n.image.colorspace_settings.name = 'Non-Color'
    if box: n.projection = 'BOX'; n.projection_blend = 0.3
    if vec is not None: nt.links.new(vec, n.inputs['Vector'])
    return n
def mr(nt, x, a0, a1, b0, b1):
    n = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(x, n.inputs['Value'])
    for k, v in zip(('From Min', 'From Max', 'To Min', 'To Max'), (a0, a1, b0, b1)): n.inputs[k].default_value = v
    return n.outputs['Result']
def mul(nt, x, y):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'
    for i, v in enumerate((x, y)):
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]
def ember(nt, bs, coord, crack_scale, width, hot_lo, ztop, dark=None, gain=1.0):
    """Glowing cracks (Voronoi edges) where a slow noise is hot, fading upwards; optionally only where the albedo is dark (charcoal)."""
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = crack_scale
    nt.links.new(coord, vo.inputs['Vector'])
    m = mr(nt, vo.outputs['Distance'], 0.0, width, 1.0, 0.0)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.4; nz.inputs['Detail'].default_value = 4; nt.links.new(coord, nz.inputs['Vector'])
    m = mul(nt, m, mr(nt, nz.outputs['Fac'], hot_lo, hot_lo + 0.08, 0.0, 1.0))
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(coord, sep.inputs[0])
    m = mul(nt, m, mr(nt, sep.outputs['Z'], 0.0, ztop, 1.0, 0.0))
    if dark is not None:
        bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(dark, bw.inputs[0]); m = mul(nt, m, mr(nt, bw.outputs[0], 0.04, 0.16, 1.0, 0.0))
    m = mul(nt, m, gain)
    ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(m, ramp.inputs[0]); cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = (0, 0, 0, 1)
    e1 = cr.elements.new(0.3); e1.color = (0.32, 0.03, 0.0, 1)
    cr.elements[1].position = 1.0; cr.elements[1].color = (1.0, 0.36, 0.06, 1)
    nt.links.new(ramp.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0

# ------------------------------------------------------------------------------------------------ scanned pieces: import once, decimate, own material
LIB = {}
def scan(key, target_tris, ember_args=(14.0, 0.03, 0.5, 0.7), tint=(1, 1, 1)):
    """A Megascans FBX (assets_src/fab/<key>/mesh.fbx + 2K maps): every piece decimated to ~target_tris, its scan material + embers."""
    if key in LIB: return LIB[key]
    folder = os.path.join(FAB, key)
    before = set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=os.path.join(folder, 'mesh.fbx'))
    pieces = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    m = bpy.data.materials.new('src_' + key); nt, bs = nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord'); uvv = tc.outputs['UV']
    d = img(nt, os.path.join(folder, '2K_BaseColor.jpg'), vec=uvv)
    tn = nt.nodes.new('ShaderNodeMix'); tn.data_type = 'RGBA'; tn.blend_type = 'MULTIPLY'; tn.inputs[0].default_value = 1
    nt.links.new(d.outputs['Color'], tn.inputs[6]); tn.inputs[7].default_value = (*tint, 1)
    nt.links.new(tn.outputs[2], bs.inputs['Base Color'])
    nt.links.new(img(nt, os.path.join(folder, '2K_Roughness.jpg'), True, uvv).outputs['Color'], bs.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(img(nt, os.path.join(folder, '2K_Normal.jpg'), True, uvv).outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    ember(nt, bs, tc.outputs['Object'], *ember_args, dark=d.outputs['Color'])
    out = []
    for o in pieces:
        for o2 in bpy.data.objects: o2.select_set(False)
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n > target_tris:
            dm = o.modifiers.new('dec', 'DECIMATE'); dm.ratio = target_tris / n; bpy.ops.object.modifier_apply(modifier='dec')
        o.data.materials.clear(); o.data.materials.append(m)
        if o.data.uv_layers: o.data.uv_layers[0].name = 'UVMap'
        o.hide_render = True; o.hide_viewport = True
        out.append(o)
    LIB[key] = out
    return out

def place(src, M4, name):
    o = src.copy(); o.data = src.data.copy(); o.name = name; sc.collection.objects.link(o)
    o.hide_render = False; o.hide_viewport = False; o.matrix_world = M4
    return o

def log_matrix(p0, p1, diam, src_len, src_diam, roll=None):
    """A matrix laying a log scanned along X (length src_len, diameter src_diam) from p0 to p1 with diameter diam."""
    d = (p1 - p0); L = d.length; x = d.normalized()
    y = x.cross(Z) if abs(x.z) < 0.95 else Vector((0, 1, 0)); y.normalize(); z = x.cross(y).normalized()
    r = rng.uniform(0, math.tau) if roll is None else roll
    R = Matrix.Rotation(r, 4, x)
    sx, sd = L / src_len, diam / src_diam
    M = Matrix(((x.x * sx, y.x * sd, z.x * sd, 0), (x.y * sx, y.y * sd, z.y * sd, 0), (x.z * sx, y.z * sd, z.z * sd, 0), (0, 0, 0, 1)))
    M = R @ M; M.translation = (p0 + p1) / 2
    return M

def chunk_matrix(c, s, rot=None):
    M = Matrix.Diagonal((s, s, s, 1))
    M = (Matrix.Rotation(rng.uniform(0, math.tau), 4, 'Z') @ Matrix.Rotation(rng.uniform(-0.6, 0.6), 4, 'X')) @ M if rot is None else rot @ M
    M.translation = c; return M

SOURCES = {}
def source(base, kind, pos, size, direction=(0, 0, 1)):
    """A fire source (Blender coords): an empty for the .blend and an entry for the JSON (three coords)."""
    e = bpy.data.objects.new(f'{base}_fire_{kind}{len(SOURCES.get(base, []))}', None); sc.collection.objects.link(e)
    e.empty_display_type = 'CUBE'; e.location = pos; e.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    t3 = lambda v: [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]
    SOURCES.setdefault(base, []).append({'kind': kind, 'pos': t3(pos), 'size': [round(s, 3) for s in size], 'dir': t3(direction)})

# ------------------------------------------------------------------------------------------------ iron and stones (P2 / P3)
def mat_iron(inner=False):
    m = bpy.data.materials.new('src_iron_inner' if inner else 'src_iron'); nt, bs = nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.5, 1.5, 1.5); nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    P = lambda k: os.path.join(CC0, 'rusty_metal_02', f'rusty_metal_02_{k}_1k.jpg')
    d = img(nt, P('diff'), vec=mp.outputs[0], box=True); r = img(nt, P('rough'), True, mp.outputs[0], box=True)
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
    nt.links.new(d.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (0.12, 0.1, 0.09, 1)
    nt.links.new(mx.outputs[2], bs.inputs['Base Color']); nt.links.new(r.outputs['Color'], bs.inputs['Roughness']); bs.inputs['Metallic'].default_value = 0.6
    if inner:
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
        g = mr(nt, sep.outputs['Z'], 0.9, 0.7, 0.0, 0.4)
        ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(g, ramp.inputs[0]); ramp.color_ramp.elements[0].color = (0, 0, 0, 1); ramp.color_ramp.elements[1].color = (1.0, 0.36, 0.06, 1)
        nt.links.new(ramp.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0
    return m

def new_obj(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    return ob

def bar(name, p0, p1, r, mat, seg=6):
    bm = bmesh.new(); res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=(p1 - p0).length)
    q = (p1 - p0).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4(); q.translation = (p0 + p1) / 2
    bmesh.ops.transform(bm, matrix=q, verts=bm.verts)
    return new_obj(name, bm, mat)

def rivet(name, c, n, mat):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.014)
    for v in bm.verts: v.co = c + Vector((v.co.x, v.co.y, v.co.z * 0.6))
    return new_obj(name, bm, mat)

# ------------------------------------------------------------------------------------------------ the four fogueres
def pira():
    logs = scan('btlog', 300); obs = []
    big = logs[0]; L0, D0 = 0.9, 0.16
    n_layers, diam = 6, 0.22
    for k in range(n_layers):
        z = diam * 0.5 + k * diam * 0.78
        for s in (-1, 1):
            off = s * 0.44
            if k % 2 == 0: p0, p1 = Vector((-0.58, off, z)), Vector((0.58, off, z))
            else: p0, p1 = Vector((off, -0.58, z)), Vector((off, 0.58, z))
            j = Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 0)); tilt = Vector((0, 0, rng.uniform(-0.02, 0.02)))
            obs.append(place(big, log_matrix(p0 + j - tilt, p1 + j + tilt, diam * rng.uniform(0.9, 1.1), L0, D0), f'pira_log{k}{s}'))
    for i in range(9):                                                     # a cone of logs leaning in, inside the crib: the heart of the pira
        a_ = math.tau * i / 9 + rng.uniform(-0.15, 0.15); d = Vector((math.cos(a_), math.sin(a_), 0))
        p0 = d * rng.uniform(0.3, 0.38) + Z * 0.02; p1 = d * 0.05 + Z * rng.uniform(1.45, 1.62)
        obs.append(place(big, log_matrix(p0, p1, rng.uniform(0.12, 0.15), L0, D0), f'pira_cone{i}'))
    ch = scan('bfp_udyj', 160, (10.0, 0.05, 0.38, 1.0)) + scan('bfp_tkvm', 200, (10.0, 0.05, 0.4, 1.0))
    for i in range(10):                                                    # charcoal at the foot, open in the middle
        a_ = rng.random() * math.tau; r_ = rng.uniform(0.05, 0.4)
        obs.append(place(rng.choice(ch), chunk_matrix(Vector((math.cos(a_) * r_, math.sin(a_) * r_, 0.03)), rng.uniform(1.1, 1.7)), f'pira_ch{i}'))
    source('pira', 'flame', Vector((0, 0, 0.2)), (0.8, 2.4, 0.8))
    source('pira', 'embers', Vector((0, 0, 0.05)), (0.8, 0.12, 0.8))
    return 'foguera_P4_pira', obs

def santjoan():
    big = scan('blog', 340)[0]; mid = scan('btlog', 250)[0]; obs = []
    rows = [(0.11, [-0.3, -0.1, 0.1, 0.3]), (0.3, [-0.2, 0.0, 0.2]), (0.48, [-0.1, 0.1]), (0.64, [0.0])]
    for zi, (z, ys) in enumerate(rows):
        x = -1.4 + rng.uniform(0, 0.15)
        while x < 1.2:
            Lg = rng.uniform(0.85, 1.2); x1 = min(1.45, x + Lg)
            y = rng.choice(ys); dz = rng.uniform(-0.03, 0.03)
            p0 = Vector((x, y + rng.uniform(-0.06, 0.06), z + dz)); p1 = Vector((x1, y + rng.uniform(-0.08, 0.08), z - dz))
            obs.append(place(mid, log_matrix(p0, p1, rng.uniform(0.17, 0.22), 0.9, 0.16), f'sj_m{zi}_{x:.2f}'))
            x = x1 - rng.uniform(0.15, 0.35)
    for i in range(2):                                                     # gnarled burnt branches over the top
        x = -0.6 + i * 1.2 + rng.uniform(-0.15, 0.15)
        p0 = Vector((x - 0.7, rng.uniform(-0.2, 0.2), 0.62)); p1 = Vector((x + 0.7, rng.uniform(-0.2, 0.2), 0.7))
        obs.append(place(big, log_matrix(p0, p1, 0.14, 1.63, 0.29), f'sj_br{i}'))
    for i in range(3):                                                     # a few logs leaning across the heap
        x = rng.uniform(-1.2, 1.2); s = rng.choice((-1, 1))
        p0 = Vector((x - 0.25, s * 0.42, 0.05)); p1 = Vector((x + 0.25, -s * 0.05, 0.55))
        obs.append(place(mid, log_matrix(p0, p1, 0.12, 0.9, 0.16), f'sj_lean{i}'))
    ch = scan('bfp_udyj', 160, (10.0, 0.05, 0.38, 1.0)) + scan('bfp_tkvm', 200, (10.0, 0.05, 0.4, 1.0))
    for i in range(14):
        c = Vector((rng.uniform(-1.45, 1.45), rng.choice((-1, 1)) * rng.uniform(0.32, 0.45), 0.03))
        obs.append(place(rng.choice(ch), chunk_matrix(c, rng.uniform(1.0, 1.6)), f'sj_ch{i}'))
    for x in (-1.1, -0.37, 0.37, 1.1): source('santjoan', 'flame', Vector((x, 0, 0.3)), (0.75, 1.6, 0.6))
    source('santjoan', 'embers', Vector((0, 0, 0.05)), (3.0, 0.12, 0.8))
    return 'foguera_P1_santjoan', obs

def brasero():
    I, In = mat_iron(), mat_iron(True); obs = []
    prof = [(0.14, 0.62), (0.32, 0.66), (0.47, 0.76), (0.55, 0.86), (0.57, 0.9)]
    seg = 32
    def lathe(name, pr, mat, inset=0.0, flip=False):
        bm = bmesh.new()
        rings = [[bm.verts.new(((r - inset) * math.cos(math.tau * i / seg), (r - inset) * math.sin(math.tau * i / seg), z + (0.012 if inset else 0))) for i in range(seg)] for r, z in pr]
        for k in range(len(pr) - 1):
            for i in range(seg):
                i2 = (i + 1) % seg; q = (rings[k][i], rings[k][i2], rings[k + 1][i2], rings[k + 1][i])
                bm.faces.new(q[::-1] if flip else q)
        bm.faces.new(rings[0] if flip else rings[0][::-1])
        return new_obj(name, bm, mat)
    obs.append(lathe('bras_bowl', prof, I)); obs.append(lathe('bras_inner', prof, In, inset=0.024, flip=True))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.575, minor_radius=0.024, major_segments=40, minor_segments=8, location=(0, 0, 0.905))
    t = bpy.context.active_object; t.data.materials.append(I); obs.append(t)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.015, major_segments=32, minor_segments=6, location=(0, 0, 0.3))
    t = bpy.context.active_object; t.data.materials.append(I); obs.append(t)
    for k in range(3):                                                      # the tripod: forged legs with a scroll foot
        a_ = math.tau * k / 3 - math.pi / 2; d = Vector((math.cos(a_), math.sin(a_), 0))
        pts = [d * 0.34 + Z * 0.7, d * 0.36 + Z * 0.45, d * 0.42 + Z * 0.2, d * 0.52 + Z * 0.03]
        for j in range(len(pts) - 1): obs.append(bar(f'bras_leg{k}{j}', pts[j], pts[j + 1], 0.022, I))
        bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.012, major_segments=12, minor_segments=5, location=d * 0.57 + Z * 0.05, rotation=(math.pi / 2, 0, a_ + math.pi / 2))
        t = bpy.context.active_object; t.data.materials.append(I); obs.append(t)
        for z_, rr in ((0.7, 0.4), (0.3, 0.36)): obs.append(rivet(f'bras_rv{k}{z_}', d * rr + Z * z_, d, I))
    for i in range(16):                                                     # rivets round the rim band
        a_ = math.tau * i / 16; obs.append(rivet(f'bras_rim{i}', Vector((math.cos(a_) * 0.57, math.sin(a_) * 0.57, 0.86)), None, I))
    mid = scan('btlog', 300)[0]
    ch = scan('bfp_udyj', 160, (10.0, 0.05, 0.38, 1.4)) + scan('bfp_tkvm', 200, (10.0, 0.05, 0.4, 1.4))
    for i in range(4):                                                      # burnt wood inside, poking over the rim
        a_ = rng.random() * math.tau; d = Vector((math.cos(a_), math.sin(a_), 0))
        p0 = d * -0.25 + Z * 0.74; p1 = d * 0.42 + Z * rng.uniform(0.86, 1.0)
        obs.append(place(mid, log_matrix(p0, p1, 0.1, 0.9, 0.16), f'bras_wood{i}'))
    for i in range(12):
        a_ = rng.random() * math.tau; r_ = rng.uniform(0.0, 0.38)
        obs.append(place(rng.choice(ch), chunk_matrix(Vector((math.cos(a_) * r_, math.sin(a_) * r_, 0.74)), rng.uniform(1.2, 1.8)), f'bras_ch{i}'))
    source('brasero', 'flame', Vector((0, 0, 0.78)), (0.9, 1.6, 0.9))
    source('brasero', 'embers', Vector((0, 0, 0.76)), (0.9, 0.1, 0.9))
    return 'foguera_P2_brasero', obs

def corona():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'stone_fire_pit', 'stone_fire_pit_1k.gltf'))
    pit = [o for o in bpy.data.objects if o not in before]
    obs = []
    for o in pit:
        if o.type != 'MESH': continue
        o.scale = (1.1, 1.1, 1.05)
        for s in o.material_slots:                                          # soot the stones inside
            m = s.material; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
            if not bs or not bs.inputs['Base Color'].is_linked: continue
            src = bs.inputs['Base Color'].links[0].from_socket
            tc = nt.nodes.new('ShaderNodeTexCoord'); vl = nt.nodes.new('ShaderNodeVectorMath'); vl.operation = 'LENGTH'; nt.links.new(tc.outputs['Object'], vl.inputs[0])
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
            nt.links.new(src, mx.inputs[6]); nt.links.new(mr(nt, vl.outputs['Value'], 0.4, 0.66, 0.15, 1.0), mx.inputs[7]); nt.links.new(mx.outputs[2], bs.inputs['Base Color'])
        obs.append(o)
    mid = scan('btlog', 300)[0]
    for i in range(8):                                                      # burnt logs laid round in a circle, pointing in
        a_ = math.tau * i / 8 + rng.uniform(-0.15, 0.15); d = Vector((math.cos(a_), math.sin(a_), 0))
        p0 = d * 0.52 + Z * 0.08; p1 = d * 0.12 + Z * 0.2
        obs.append(place(mid, log_matrix(p0, p1, 0.11, 0.9, 0.16), f'cor_log{i}'))
    ch = scan('bfp_udyj', 140, (10.0, 0.05, 0.36, 1.0)) + scan('bfp_tkvm', 180, (10.0, 0.05, 0.4, 1.0))
    for i in range(14):
        a_ = rng.random() * math.tau; r_ = rng.uniform(0.0, 0.42)
        obs.append(place(rng.choice(ch), chunk_matrix(Vector((math.cos(a_) * r_, math.sin(a_) * r_, 0.03)), rng.uniform(1.0, 1.6)), f'cor_ch{i}'))
    for i in range(8):
        a_ = math.tau * (i + 0.5) / 8; source('corona', 'flame', Vector((math.cos(a_) * 0.32, math.sin(a_) * 0.32, 0.12)), (0.25, 0.7, 0.25))
    source('corona', 'flame', Vector((0, 0, 0.15)), (0.5, 1.2, 0.5))
    source('corona', 'embers', Vector((0, 0, 0.05)), (1.0, 0.1, 1.0))
    return 'foguera_P3_corona', obs

# ------------------------------------------------------------------------------------------------ join, bake (1k), export
sc.render.engine = 'CYCLES'
pr = bpy.context.preferences.addons['cycles'].preferences
for dt in ('OPTIX', 'CUDA'):
    try:
        pr.compute_device_type = dt; pr.get_devices()
        if any(d.type == dt for d in pr.devices): break
    except Exception: pass
for d in pr.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'

def join(name, obs):
    for o in bpy.data.objects: o.select_set(False)
    meshes = [o for o in obs if o.type == 'MESH']
    for o in meshes:
        o.select_set(True)
        if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers[0].name = 'UVMap'
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    if ob.parent is not None:
        mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob

def bake(ob, size=1024):
    me = ob.data
    bk = me.uv_layers.new(name='bake'); me.uv_layers['UVMap'].active_render = True; me.uv_layers.active = bk
    for o in bpy.data.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.008)
    bpy.ops.object.mode_set(mode='OBJECT')
    imgs = {}
    for kind, nc in (('albedo', False), ('rough', True), ('normal', True), ('emit', False)):
        im = bpy.data.images.new(f'{ob.name}_{kind}', size, size); im.colorspace_settings.name = 'Non-Color' if nc else 'sRGB'
        if kind == 'normal': im.generated_color = (0.5, 0.5, 1, 1)
        imgs[kind] = im
    targets = []
    for s in ob.material_slots:
        nt = s.material.node_tree; t = nt.nodes.new('ShaderNodeTexImage'); targets.append((nt, t))
    sc.cycles.samples = 4; sc.render.bake.margin = 6; sc.render.bake.use_clear = True
    for kind, btype, kw in (('albedo', 'DIFFUSE', {'pass_filter': {'COLOR'}}), ('rough', 'ROUGHNESS', {}), ('normal', 'NORMAL', {}), ('emit', 'EMIT', {})):
        for nt, t in targets: t.image = imgs[kind]; nt.nodes.active = t
        bpy.ops.object.bake(type=btype, **kw)
        imgs[kind].filepath_raw = os.path.join(DST, f'{ob.name}_{kind}.jpg'); imgs[kind].file_format = 'JPEG'; imgs[kind].save()
    for nt, t in targets: nt.nodes.remove(t)
    fm = bpy.data.materials.new(ob.name + '_mat'); nt, bs = nodes(fm)
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
    def tex(kind):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = imgs[kind]; nt.links.new(uvn.outputs['UV'], n.inputs['Vector']); return n
    nt.links.new(tex('albedo').outputs['Color'], bs.inputs['Base Color']); nt.links.new(tex('rough').outputs['Color'], bs.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'bake'; nt.links.new(tex('normal').outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    nt.links.new(tex('emit').outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0
    me.materials.clear(); me.materials.append(fm)
    me.uv_layers.remove(me.uv_layers['UVMap']); me.uv_layers['bake'].active_render = True

def write_bin(ob, key):
    """<name>.bin + <name>.json: f32 position (3), normal (3), uv (2), u16/u32 index — three's frame (x, z, −y)."""
    me = ob.data; me.calc_loop_triangles()
    uvl = me.uv_layers['bake'].data
    verts, idx, cache = [], [], {}
    for tri in me.loop_triangles:
        for li in tri.loops:
            l = me.loops[li]; v = me.vertices[l.vertex_index]; uv = uvl[li].uv
            n = me.corner_normals[li].vector if hasattr(me, 'corner_normals') else l.normal
            key_ = (l.vertex_index, round(uv.x, 5), round(uv.y, 5), round(n.x, 3), round(n.y, 3), round(n.z, 3))
            if key_ not in cache:
                cache[key_] = len(verts); verts.append((v.co.x, v.co.z, -v.co.y, n.x, n.z, -n.y, uv.x, 1 - uv.y))
            idx.append(cache[key_])
    nv = len(verts); big = nv > 65535
    pos = b''.join(struct.pack('<3f', *v[0:3]) for v in verts); nor = b''.join(struct.pack('<3f', *v[3:6]) for v in verts)
    uvb = b''.join(struct.pack('<2f', *v[6:8]) for v in verts); ib = struct.pack(f"<{len(idx)}{'I' if big else 'H'}", *idx)
    o0 = 0; o1 = o0 + len(pos); o2 = o1 + len(nor); o3 = o2 + len(uvb)
    open(os.path.join(DST, ob.name + '.bin'), 'wb').write(pos + nor + uvb + ib)
    lo = [v[0:3] for v in verts]
    meta = {'version': 1, 'units': 'm', 'up': 'y', 'front': '+z', 'vertexCount': nv, 'indexCount': len(idx), 'triangles': len(idx) // 3,
            'layout': {'position': [o0, 3, 'f32'], 'normal': [o1, 3, 'f32'], 'uv': [o2, 2, 'f32'], 'index': [o3, 1, 'u32' if big else 'u16']},
            'bbox': {'min': [round(min(p[i] for p in lo), 3) for i in range(3)], 'max': [round(max(p[i] for p in lo), 3) for i in range(3)]},
            'maps': {k: f'{ob.name}_{k}.jpg' for k in ('albedo', 'normal', 'rough', 'emit')},
            'maps_note': 'albedo sRGB · normal tangent-space (OpenGL, +Y) · roughness linear · emit = the ember mask (sRGB orange; scale it with the fire level)',
            'fireSources': SOURCES.get(key, []),
            'fireSources_note': 'pos = where a flame is born (m, this frame); size = [w, h, d] of its box (h upwards along dir); kind flame | embers',
            'sources': 'Quixel Megascans via Fab (Burnt Log, Burnt Tree Log, Burnt Firewood Pack ×2; Quixel content licence), Poly Haven CC0 (stone_fire_pit), CC0 rusty_metal_02; generated by plaza3d/blender/fire_bases2.py'}
    json.dump(meta, open(os.path.join(DST, ob.name + '.json'), 'w'), indent=1)
    return meta

results = []
for fn in (pira, santjoan, brasero, corona):
    name, obs = fn()
    key = name.split('_')[-1]
    ob = join(name, obs)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('BASE', name, 'tris', tris, 'dims', [round(v, 2) for v in ob.dimensions])
    results.append((ob, key))
for ob, key in results: bake(ob)
for ob, key in results:
    for o in bpy.data.objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(DST, ob.name + '.glb'), export_format='GLB', use_selection=True, export_image_format='JPEG',
                              export_jpeg_quality=88, export_yup=True, export_apply=True)
    m = write_bin(ob, key)
    print('EXPORTED', ob.name, m['triangles'], 'tris', len(m['fireSources']), 'sources')

if a('--photo', '1') == '1':
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in [r[0] for r in results]: o.hide_render = True
    fm_ = bpy.data.materials.new('floor'); nt_, bs_ = nodes(fm_); bs_.inputs['Base Color'].default_value = (0.035, 0.032, 0.03, 1); bs_.inputs['Roughness'].default_value = 0.3
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=8); new_obj('floor', bm, fm_)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bgn = w.node_tree.nodes['Background']; bgn.inputs['Color'].default_value = (0.006, 0.008, 0.016, 1)
    moon = bpy.data.lights.new('moon', 'SUN'); moon.energy = 0.6; moon.color = (0.6, 0.7, 1.0); moon.angle = 0.05
    mo = bpy.data.objects.new('moon', moon); sc.collection.objects.link(mo); mo.rotation_euler = (math.radians(55), 0, math.radians(-35))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 35
    sc.cycles.samples = 96; sc.cycles.use_denoising = True; sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x = 900; sc.render.resolution_y = 600
    for ob, key in results:
        others = [r[0] for r in results if r[0] is not ob]
        for o in others: o.hide_render = True
        ob.hide_render = False
        dims = ob.dimensions; span = max(dims.x, dims.z * 1.6, 1.2)
        cam.location = (0, -span * 1.55, dims.z * 0.62 + 0.25); cam.rotation_euler = (math.radians(82), 0, 0)
        lights = []
        for s_ in SOURCES[key]:
            if s_['kind'] != 'flame': continue
            p = s_['pos']; ld = bpy.data.lights.new('f', 'POINT'); ld.energy = 90 / max(1, len(SOURCES[key]) - 1); ld.color = (1.0, 0.45, 0.14); ld.shadow_soft_size = 0.25
            lo = bpy.data.objects.new('f', ld); sc.collection.objects.link(lo); lo.location = (p[0], -p[2], p[1] + 0.3); lights.append(lo)
        for state, em, fire in (('off', 0.0, False), ('lit', 1.4, True)):
            ob.material_slots[0].material.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = em
            for lo in lights: lo.hide_render = not fire
            mo.hide_render = fire; bgn.inputs['Strength'].default_value = 3.0 if not fire else 0.6
            sc.render.filepath = os.path.join(OUT, f'{ob.name}_{state}.png'); bpy.ops.render.render(write_still=True)
        for lo in lights: bpy.data.objects.remove(lo, do_unlink=True)
    print('PHOTO', OUT)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'fogueres.blend'))
print('DONE')
