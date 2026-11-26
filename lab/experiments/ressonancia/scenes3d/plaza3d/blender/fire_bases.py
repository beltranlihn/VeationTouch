# Ressonància — the correfoc's four FOGUERA BASES (for brasa3d, asked by Personaje on Beltrán's behalf, 26-11-2026).
#
#   blender -b --factory-startup --python fire_bases.py -- --out <dir> [--photo 1] [--export 1]
#
# P4 «pira»: a log-cabin tower (1.0 × 1.0 × ~0.95 m), open inside, kindling and a bed of embers at its foot (flame root y ≈ 0.2).
# P1 «Sant Joan»: a long low pile (2.6 × 0.7 × ~0.6 m) of logs, dry branches (Poly Haven) on top, embers along its foot.
# P2 «brasero»: a wrought-iron bowl on three legs (rim 0.85 m, Ø 1.1 m), full of glowing coals (flame root y ≈ 0.7).
# P3 «anella»: Poly Haven's stone_fire_pit scaled to Ø ≈ 2.1 m, sooted inside, a bed of embers in the middle.
# Each base: one mesh, ≤ 10 k triangles, one material with 1k JPG maps baked in Cycles (charcoal albedo, roughness, normal,
# and the EMBER mask as the emissive texture, which the runtime scales with the fire's level). glTF: metres, Y up, origin at
# the centre of the base on the floor, front towards +Z (Blender −Y). Sources: Poly Haven, CC0 (pine_bark, burned_ground_01,
# stone_fire_pit, dry_branches_medium_01) and ../../assets/cc0 (rusty_metal_02).
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def a(name, default): return argv[argv.index(name) + 1] if name in argv else default
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, 'assets_src')
CC0 = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'cc0'))
OUT = os.path.abspath(a('--out', os.path.join(HERE, 'out_fire'))); os.makedirs(OUT, exist_ok=True)
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
sc = bpy.context.scene
rng = random.Random(20261126)
Z = Vector((0, 0, 1))

# ------------------------------------------------------------------------------------------------ source materials (for baking)
def nodes(m):
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], out.inputs['Surface'])
    return nt, bs
def img(nt, path, nc=False, vec=None):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True)
    if nc: n.image.colorspace_settings.name = 'Non-Color'
    if vec is not None: nt.links.new(vec, n.inputs['Vector'])
    return n
def math_(nt, op, a_, b_=None):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    for i, x in enumerate((a_, b_)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: nt.links.new(x, n.inputs[i])
    return n.outputs[0]
def mr(nt, x, a0, a1, b0, b1):
    n = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(x, n.inputs['Value'])
    for k, v in zip(('From Min', 'From Max', 'To Min', 'To Max'), (a0, a1, b0, b1)): n.inputs[k].default_value = v
    return n.outputs['Result']
def ember_mask(nt, coord, crack_scale, hot_scale, hot_lo, ztop, width=0.022):
    """Glowing cracks: a Voronoi crack network, kept where a slow noise is hot, fading upwards."""
    mp = nt.nodes.new('ShaderNodeMapping'); nt.links.new(coord, mp.inputs['Vector'])
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = crack_scale
    nt.links.new(mp.outputs[0], vo.inputs['Vector'])
    cr = mr(nt, vo.outputs['Distance'], 0.0, width, 1.0, 0.0)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = hot_scale; nz.inputs['Detail'].default_value = 4
    nt.links.new(mp.outputs[0], nz.inputs['Vector'])
    hot = mr(nt, nz.outputs['Fac'], hot_lo, hot_lo + 0.08, 0.0, 1.0)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(coord, sep.inputs[0])
    low = mr(nt, sep.outputs['Z'], 0.0, ztop, 1.0, 0.0)
    return math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', cr, hot), low)
def ember_color(nt, mask, bs):
    """Orange to yellow with heat; the mask goes to the emission (baked as the emissive texture)."""
    ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(mask, ramp.inputs[0]); cr_ = ramp.color_ramp
    cr_.elements[0].position = 0.0; cr_.elements[0].color = (0, 0, 0, 1)
    e1 = cr_.elements.new(0.3); e1.color = (0.32, 0.03, 0.0, 1)
    cr_.elements[1].position = 1.0; cr_.elements[1].color = (1.0, 0.36, 0.06, 1)
    nt.links.new(ramp.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0

M = {}
def mat_wood():
    m = bpy.data.materials.new('src_charred_wood'); nt, bs = nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord'); uvv = tc.outputs['UV']
    P = lambda k: os.path.join(SRC, 'pine_bark', f'pine_bark_{k}_1k.jpg')
    d = img(nt, P('diff'), vec=uvv); r = img(nt, P('rough'), True, uvv); n = img(nt, P('nor_gl'), True, uvv)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
    nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (0.07, 0.06, 0.055, 1)   # charred
    nt.links.new(mix.outputs[2], bs.inputs['Base Color']); nt.links.new(r.outputs['Color'], bs.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    ember_color(nt, ember_mask(nt, tc.outputs['Object'], 16.0, 2.6, 0.6, 0.55), bs)
    return m
def mat_coal():
    m = bpy.data.materials.new('src_coal'); nt, bs = nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    P = lambda k: os.path.join(SRC, 'burned_ground_01', f'burned_ground_01_{k}_1k.jpg')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.5, 2.5, 2.5); nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    d = img(nt, P('diff'), vec=mp.outputs[0]); r = img(nt, P('rough'), True, mp.outputs[0])
    for t_ in (d, r): t_.projection = 'BOX'; t_.projection_blend = 0.3
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
    nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (0.12, 0.11, 0.1, 1)
    nt.links.new(mix.outputs[2], bs.inputs['Base Color']); nt.links.new(r.outputs['Color'], bs.inputs['Roughness'])
    ember_color(nt, ember_mask(nt, tc.outputs['Object'], 10.0, 3.0, 0.4, 1.2, 0.045), bs)
    return m
def mat_iron(inner=False):
    m = bpy.data.materials.new('src_iron_inner' if inner else 'src_iron'); nt, bs = nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    P = lambda k: os.path.join(CC0, 'rusty_metal_02', f'rusty_metal_02_{k}_1k.jpg')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.5, 1.5, 1.5); nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    d = img(nt, P('diff'), vec=mp.outputs[0]); r = img(nt, P('rough'), True, mp.outputs[0])
    for t_ in (d, r): t_.projection = 'BOX'; t_.projection_blend = 0.3
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
    nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (0.12, 0.1, 0.09, 1)      # blackened iron
    nt.links.new(mix.outputs[2], bs.inputs['Base Color']); nt.links.new(r.outputs['Color'], bs.inputs['Roughness'])
    if inner:   # the inner rim glows faintly, hotter towards the coals
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
        g = mr(nt, sep.outputs['Z'], 0.86, 0.66, 0.0, 0.45)
        ember_color(nt, g, bs)
    return m

# ------------------------------------------------------------------------------------------------ geometry helpers
def new_obj(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob

def log(name, p0, p1, r, mat, seg=12, rings=6, wobble=0.012, cap_char=True):
    """A rough log from p0 to p1 (radius r): a cylinder with a slight bend and bumpy bark, UVs round × along."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    axis = (p1 - p0); L = axis.length; d = axis.normalized()
    side = d.cross(Z if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized(); up = d.cross(side).normalized()
    bend = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.02 * L
    seed = rng.random() * 100
    rings_v = []
    for j in range(rings + 1):
        t = j / rings; c = p0 + axis * t + bend * math.sin(math.pi * t)
        rr = r * (1 + 0.08 * math.sin(t * 7 + seed)) * (0.92 if j in (0, rings) else 1.0)
        ring = []
        for i in range(seg):
            a_ = 2 * math.pi * i / seg
            o = side * math.cos(a_) + up * math.sin(a_)
            q = c + o * rr
            q += o * wobble * noise.noise(q * 9 + Vector((seed, 0, 0)))
            ring.append(bm.verts.new(q))
        rings_v.append(ring)
    for j in range(rings):
        for i in range(seg):
            i2 = (i + 1) % seg
            f = bm.faces.new((rings_v[j][i], rings_v[j][i2], rings_v[j + 1][i2], rings_v[j + 1][i]))
            for lp, (u_, v_) in zip(f.loops, ((i / seg, j / rings), ((i + 1) / seg, j / rings), ((i + 1) / seg, (j + 1) / rings), (i / seg, (j + 1) / rings))):
                lp[uv].uv = (u_, v_ * L / (2 * math.pi * r) * 0.5)
    for j, rev in ((0, True), (rings, False)):
        vs = rings_v[j][::-1] if rev else rings_v[j]
        f = bm.faces.new(vs)
        for lp in f.loops: lp[uv].uv = (0.5 + 0.0 * lp.vert.co.x, 0.5)
    return new_obj(name, bm, mat)

def lump(name, c, s, mat, sub=1):
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    seed = rng.random() * 50
    for v in res['verts']:
        k = 1 + 0.55 * noise.noise(v.co * 2.3 + Vector((seed, seed, 0))) + 0.25 * noise.noise(v.co * 6.1 + Vector((0, seed, seed)))
        v.co = Vector((v.co.x * s.x, v.co.y * s.y, v.co.z * s.z)) * k + c
    return new_obj(name, bm, mat)

def coal_bed(prefix, centre, radius, n, h, mat, sx=1.0):
    obs = []
    for i in range(n):
        a_ = rng.random() * 2 * math.pi; rr = radius * math.sqrt(rng.random())
        c = centre + Vector((math.cos(a_) * rr * sx, math.sin(a_) * rr, rng.uniform(0, h)))
        s = rng.uniform(0.03, 0.075); obs.append(lump(f'{prefix}_coal{i}', c, Vector((s * rng.uniform(1.0, 1.8), s, s * rng.uniform(0.45, 0.8))), mat))
    return obs

def import_gltf(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def join(name, obs):
    for o in bpy.data.objects: o.select_set(False)
    meshes = [o for o in obs if o.type == 'MESH']
    for o in meshes: o.select_set(True)
    others = [o.name for o in obs if o.type != 'MESH']
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes: o.parent = None if o.parent is None else o.parent
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    if ob.parent is not None:
        mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for n in others:
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    return ob

# ------------------------------------------------------------------------------------------------ the four bases
def base_pira():
    W, C = mat_wood(), mat_coal(); obs = []
    n_layers, r = 7, 0.065
    for k in range(n_layers):
        z = r + k * (2 * r * 0.92)
        for s in (-1, 1):
            off = s * (0.5 - r * 1.2)
            if k % 2 == 0: p0, p1 = Vector((-0.53, off, z)), Vector((0.53, off, z))
            else: p0, p1 = Vector((off, -0.53, z)), Vector((off, 0.53, z))
            j = Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0))
            obs.append(log(f'pira_log{k}{s}', p0 + j, p1 + j, r * rng.uniform(0.85, 1.1), W))
    for i in range(7):                                                    # kindling crossing the foot, open in the middle
        a_ = rng.random() * math.pi; d = Vector((math.cos(a_), math.sin(a_), 0))
        c = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0.04))
        obs.append(log(f'pira_stick{i}', c - d * 0.32, c + d * 0.32 + Z * 0.05, 0.022, W, seg=7, rings=3))
    obs += coal_bed('pira', Vector((0, 0, 0.02)), 0.36, 26, 0.06, C)
    return join('base_P4_pira', obs)

def base_santjoan():
    W, C = mat_wood(), mat_coal(); obs = []
    rows = [(0.07, [-0.24, -0.08, 0.08, 0.24]), (0.2, [-0.16, 0.0, 0.16]), (0.33, [-0.08, 0.08]), (0.45, [0.0])]
    for zi, (z, ys) in enumerate(rows):
        x = -1.25
        while x < 1.15:
            Lg = rng.uniform(0.9, 1.4); x1 = min(1.3, x + Lg)
            for y in ys:
                j = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.025, 0.025), rng.uniform(-0.01, 0.01)))
                obs.append(log(f'sj_log{zi}_{x:.1f}_{y:.2f}', Vector((x, y, z)) + j, Vector((x1, y + rng.uniform(-0.04, 0.04), z)) + j, rng.uniform(0.055, 0.075), W, seg=10, rings=5))
            x = x1 - rng.uniform(0.0, 0.12)
    br = import_gltf(os.path.join(SRC, 'dry_branches_medium_01', 'dry_branches_medium_01_1k.gltf'))
    for o in br:
        if o.type != 'MESH': continue
        o.scale = (2.2, 0.55, 0.45); o.location = (0, 0, 0.42); o.rotation_euler = (0, 0, math.radians(90))
        dm = o.modifiers.new('dec', 'DECIMATE'); dm.ratio = 0.24
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.modifier_apply(modifier='dec')
        o.data.materials.clear(); o.data.materials.append(W)
    obs += br
    obs += coal_bed('sj', Vector((0, 0, 0.0)), 0.42, 30, 0.05, C, sx=3.2)
    return join('base_P1_santjoan', obs)

def base_brasero():
    I, In, C = mat_iron(), mat_iron(True), mat_coal(); obs = []
    # the bowl: a lathe profile (outer then inner), rolled rim
    prof = [(0.12, 0.56), (0.3, 0.6), (0.45, 0.7), (0.53, 0.8), (0.555, 0.85)]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap'); seg = 36
    def ringv(r, z): return [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
    outer = [ringv(r, z) for r, z in prof]
    def band(A, Bv, flip=False):
        for i in range(seg):
            i2 = (i + 1) % seg; q = (A[i], A[i2], Bv[i2], Bv[i])
            bm.faces.new(q[::-1] if flip else q)
    for k in range(len(prof) - 1): band(outer[k], outer[k + 1])
    bm.faces.new(outer[0][::-1])
    bowl = new_obj('bras_bowl', bm, I); obs.append(bowl)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    inner = [[bm.verts.new((r - 0.022) * Vector((math.cos(2 * math.pi * i / seg), math.sin(2 * math.pi * i / seg), 0)) + Vector((0, 0, z + 0.01))) for i in range(seg)] for r, z in prof]
    for k in range(len(prof) - 1):
        for i in range(seg):
            i2 = (i + 1) % seg; bm.faces.new((inner[k][i], inner[k + 1][i], inner[k + 1][i2], inner[k][i2]))
    bm.faces.new(inner[0])
    obs.append(new_obj('bras_inner', bm, In))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.555, minor_radius=0.022, major_segments=40, minor_segments=8, location=(0, 0, 0.855))
    obs.append(bpy.context.active_object); bpy.context.active_object.data.materials.append(I)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.43, minor_radius=0.014, major_segments=36, minor_segments=6, location=(0, 0, 0.22))
    obs.append(bpy.context.active_object); bpy.context.active_object.data.materials.append(I)
    for k in range(3):                                                   # three legs, curving out to scrolled feet
        a_ = 2 * math.pi * k / 3 - math.pi / 2
        d = Vector((math.cos(a_), math.sin(a_), 0))
        pts = [d * 0.36 + Z * 0.64, d * 0.42 + Z * 0.42, d * 0.47 + Z * 0.18, d * 0.56 + Z * 0.04]
        for j in range(len(pts) - 1): obs.append(log(f'bras_leg{k}{j}', pts[j], pts[j + 1], 0.02, I, seg=6, rings=2, wobble=0.0))
        obs.append(lump(f'bras_foot{k}', d * 0.6 + Z * 0.02, Vector((0.05, 0.05, 0.02)), I, sub=1))
    obs += coal_bed('bras', Vector((0, 0, 0.66)), 0.45, 46, 0.1, C)
    return join('base_P2_brasero', obs)

def base_anella():
    C, W = mat_coal(), mat_wood(); obs = []
    pit = import_gltf(os.path.join(SRC, 'stone_fire_pit', 'stone_fire_pit_1k.gltf'))
    for o in pit:
        if o.type == 'MESH':
            o.scale = (1.45, 1.45, 1.2)
            for s in o.material_slots:                                   # soot the stones towards the inside
                m = s.material; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
                if not bs or not bs.inputs['Base Color'].is_linked: continue
                src = bs.inputs['Base Color'].links[0].from_socket
                tc = nt.nodes.new('ShaderNodeTexCoord'); vl = nt.nodes.new('ShaderNodeVectorMath'); vl.operation = 'LENGTH'
                nt.links.new(tc.outputs['Object'], vl.inputs[0])
                soot = mr(nt, vl.outputs['Value'], 0.45, 0.72, 0.18, 1.0)
                mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
                nt.links.new(src, mx.inputs[6]); nt.links.new(soot, mx.inputs[7]); nt.links.new(mx.outputs[2], bs.inputs['Base Color'])
    obs += pit
    obs += coal_bed('an', Vector((0, 0, 0.02)), 0.62, 40, 0.07, C)
    for i in range(5):                                                   # a few charred stubs among the embers
        a_ = rng.random() * 2 * math.pi; d = Vector((math.cos(a_), math.sin(a_), 0)); c = d * rng.uniform(0.1, 0.45) + Z * 0.06
        obs.append(log(f'an_stub{i}', c - d * 0.18, c + d * 0.18 + Z * 0.06, 0.045, W, seg=8, rings=3))
    return join('base_P3_anella', obs)

# ------------------------------------------------------------------------------------------------ bake one base into 1k maps
def setup_gpu():
    sc.render.engine = 'CYCLES'
    pr = bpy.context.preferences.addons['cycles'].preferences
    for dt in ('OPTIX', 'CUDA'):
        try:
            pr.compute_device_type = dt; pr.get_devices()
            if any(d.type == dt for d in pr.devices): break
        except Exception: pass
    for d in pr.devices: d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
setup_gpu()

def bake(ob, size=1024):
    me = ob.data
    if 'UVMap' not in me.uv_layers: me.uv_layers.new(name='UVMap')
    bk = me.uv_layers.new(name='bake'); me.uv_layers['UVMap'].active_render = True; me.uv_layers.active = bk
    for o in bpy.data.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    imgs = {}
    for kind, nc in (('diff', False), ('rough', True), ('normal', True), ('emit', False)):
        im = bpy.data.images.new(f'{ob.name}_{kind}', size, size); im.colorspace_settings.name = 'Non-Color' if nc else 'sRGB'
        if kind == 'normal': im.generated_color = (0.5, 0.5, 1, 1)
        imgs[kind] = im
    targets = []
    for s in ob.material_slots:
        nt = s.material.node_tree; t = nt.nodes.new('ShaderNodeTexImage'); targets.append((nt, t))
    sc.cycles.samples = 4; sc.render.bake.margin = 6; sc.render.bake.use_clear = True
    for kind, btype, kw in (('diff', 'DIFFUSE', {'pass_filter': {'COLOR'}}), ('rough', 'ROUGHNESS', {}), ('normal', 'NORMAL', {}), ('emit', 'EMIT', {})):
        for nt, t in targets: t.image = imgs[kind]; nt.nodes.active = t
        bpy.ops.object.bake(type=btype, **kw)
        path = os.path.join(OUT, f'{ob.name}_{kind}.jpg')
        imgs[kind].filepath_raw = path; imgs[kind].file_format = 'JPEG'; imgs[kind].save()
    for nt, t in targets: nt.nodes.remove(t)
    # the final material: the baked maps only, on the 'bake' UVs
    fm = bpy.data.materials.new(ob.name + '_mat'); nt, bs = nodes(fm)
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
    def tex(kind):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = imgs[kind]; nt.links.new(uvn.outputs['UV'], n.inputs['Vector']); return n
    nt.links.new(tex('diff').outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(tex('rough').outputs['Color'], bs.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'bake'; nt.links.new(tex('normal').outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    nt.links.new(tex('emit').outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0
    me.materials.clear(); me.materials.append(fm)
    me.uv_layers.remove(me.uv_layers['UVMap']); me.uv_layers['bake'].active_render = True
    return fm

bases = []
for fn, x in ((base_pira, -4.5), (base_santjoan, -1.5), (base_brasero, 1.5), (base_anella, 4.5)):
    ob = fn()
    bpy.context.view_layer.update()
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('BASE', ob.name, 'tris', tris, 'dims', [round(v, 2) for v in ob.dimensions])
    bases.append((ob, x))

for ob, x in bases: bake(ob)

if a('--export', '1') == '1':
    for ob, x in bases:
        for o in bpy.data.objects: o.select_set(False)
        ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, ob.name + '.glb'), export_format='GLB', use_selection=True,
                                  export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True)
        print('EXPORTED', ob.name, os.path.getsize(os.path.join(OUT, ob.name + '.glb')))

if a('--photo', '1') == '1':
    # the four in a row, at night, lit from their fire (a warm light at each flame's root) and their embers glowing
    for ob, x in bases: ob.location.x = x
    roots = {'base_P4_pira': 0.25, 'base_P1_santjoan': 0.25, 'base_P2_brasero': 0.78, 'base_P3_anella': 0.2}
    for ob, x in bases:
        for s in ob.material_slots: s.material.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.6
        ld = bpy.data.lights.new('fire_' + ob.name, 'POINT'); ld.energy = 120; ld.color = (1.0, 0.45, 0.14); ld.shadow_soft_size = 0.25
        lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo); lo.location = (x, 0, roots[ob.name] + 0.35)
    fm_ = bpy.data.materials.new('floor'); nt_, bs_ = nodes(fm_); bs_.inputs['Base Color'].default_value = (0.03, 0.028, 0.026, 1); bs_.inputs['Roughness'].default_value = 0.35
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12); fl = new_obj('floor', bm, fm_)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.005, 0.01, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.location = (0, -8.6, 2.3); cam.rotation_euler = (math.radians(79), 0, 0); cam.data.lens = 24; sc.camera = cam
    sc.cycles.samples = 128; sc.cycles.use_denoising = True; sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x = 1800; sc.render.resolution_y = 620; sc.render.filepath = os.path.join(OUT, 'bases_photo.png')
    bpy.ops.render.render(write_still=True)
    print('PHOTO', sc.render.filepath)
print('DONE')
