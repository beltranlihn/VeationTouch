# Ressonància — plaza3d: BAKE the intro's square as one 360° panorama from the room's eye, split by light so the runtime can
# relight it (lamps one by one, windows, stained glass) in a single full-screen pass.
#
#   blender -b --factory-startup --python plaza_bake.py -- --look 1 --out <tmp> [--width 8192] [--samples 384] [--stage all]
#        (plus plaza_gen's look arguments: --sky --lamps --haze --exposure ...)
#
# Stage "render": Cycles renders the equirectangular panorama with one LIGHT GROUP per lamp (and per wall's lanterns, the
# arcades, the lit windows, the stained glass, the lamp glass, the sky); the compositor denoises every group with the beauty's
# albedo and normal and writes each one, the depth and the object index as single EXRs in <out>/passes/.
# Stage "encode" (plaza_bake_encode.py, system Python + numpy + Pillow) turns those EXRs into the runtime files.
# The panorama is equirectangular: column u ↔ azimuth around the eye (u = 0.5 straight at side 0 = P4), row v ↔ elevation
# from LAT_MAX (top row) to LAT_MIN (bottom row).
import bpy, json, math, os, sys, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
G = runpy.run_path(os.path.join(HERE, 'plaza_gen.py'), run_name='plaza_gen')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def a(name, default): return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(a('--out', os.path.join(HERE, 'out_bake'))); PASSES = os.path.join(OUT, 'passes'); os.makedirs(PASSES, exist_ok=True)
WIDTH = int(a('--width', '8192')); LAT_MIN, LAT_MAX = -30.0, 40.0
HEIGHT = int(round(WIDTH * (LAT_MAX - LAT_MIN) / 360.0))
SAMPLES = int(a('--samples', '384'))
MODE = a('--mode', 'intro')          # intro | dark (the correfoc: lamps and windows off, four fogueres)
FOG_D = float(a('--fogd', '3.3'))    # foguera: this far beyond each wall's centre (brasa3d/foguera.js FOG_D)
FOG_H = float(a('--fogh', '1.2'))    # its light's height above the floor
FOG_W = float(a('--fogw', '2600'))   # its power (W)
FOGUERES = os.path.abspath(a('--fogueres', os.path.join(HERE, '..', '..', 'parts', 'brasa3d', 'fogueres')))   # the modelled bases (fire_bases2.py)
FOG_FILE = ['foguera_P4_pira', 'foguera_P1_santjoan', 'foguera_P2_brasero', 'foguera_P3_corona']                # strip order P4 P1 P2 P3
FOG_SOOT = {'foguera_P3_corona': 0.45}                                                                       # albedo × soot
FOG_POW = {'foguera_P2_brasero': 0.8, 'foguera_P3_corona': 0.6}                                               # power × fuel size
EMBER_K = float(a('--embers', '3.0'))                                                                          # ember emission in the bake
LIGHTS, EYE, three, SIDES, WALLS = G['LIGHTS'], G['EYE'], G['three'], G['SIDES'], G['WALLS']
sc = bpy.context.scene; vl = bpy.context.view_layer

def side_of(p):
    """The side of the square a point is on: the wall whose outward direction is closest to it, seen from the eye."""
    v = (p - EYE); v.z = 0; v.normalize()
    return max(range(4), key=lambda k: (-SIDES[k][2]).dot(v))

# ---- the look (materials, sky, fog, lights), exactly as the wall renders
G['look_materials'](); G['look_world'](sc)
if MODE == 'intro': G['look_lights'](sc)
else:
    # the square with its lights off: no lamps, no lit rooms, no glowing glass; the moon only
    def kill_emission(m):
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.bl_idname == 'ShaderNodeBsdfPrincipled':
                    es = n.inputs['Emission Strength']
                    for l in list(es.links): m.node_tree.links.remove(l)
                    es.default_value = 0.0
    for m in bpy.data.materials:
        if m.name in ('window_lit', 'lamp_glass', 'stained_glass', 'stained_glass_ruby') or m.name.endswith(('_bulb', '_lamp', '_glass')):
            kill_emission(m)
    moon_ = bpy.data.objects.get('moon')
    if moon_: moon_.data.energy *= float(a('--moon', '0.5'))
    import json as _json
    from mathutils import Matrix as _M
    _DM = {}
    def decal_mat(kind):
        """scorch: matte ash, dark, ragged edge · puddle: still black water, a mirror fading out raggedly."""
        if kind in _DM: return _DM[kind]
        m = bpy.data.materials.new(f'decal_{kind}'); m.use_nodes = True; nt_ = m.node_tree; nt_.nodes.clear()
        N_ = lambda tp: nt_.nodes.new(tp)
        out = N_('ShaderNodeOutputMaterial'); mix = N_('ShaderNodeMixShader'); tr = N_('ShaderNodeBsdfTransparent'); bs = N_('ShaderNodeBsdfPrincipled')
        tc = N_('ShaderNodeTexCoord'); ln = N_('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
        nz = N_('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.6 if kind == 'scorch' else 1.6; nz.inputs['Detail'].default_value = 4.0
        ad = N_('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'; ad.inputs[1].default_value = 0.3 if kind == 'scorch' else 0.55
        sub = N_('ShaderNodeMath'); sub.operation = 'SUBTRACT'
        mr = N_('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
        mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = (0.62, 1.0) if kind == 'scorch' else (0.3, 1.0)
        mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1.0, 0.0
        L_ = nt_.links.new
        L_(tc.outputs['Object'], ln.inputs[0]); L_(tc.outputs['Object'], nz.inputs['Vector'])
        L_(nz.outputs['Fac'], ad.inputs[0]); ad.inputs[2].default_value = 0.0
        L_(ln.outputs['Value'], sub.inputs[0]); sub.inputs[1].default_value = -0.0
        add2 = N_('ShaderNodeMath'); add2.operation = 'ADD'; L_(sub.outputs[0], add2.inputs[0]); L_(ad.outputs[0], add2.inputs[1])
        off = N_('ShaderNodeMath'); off.operation = 'SUBTRACT'; L_(add2.outputs[0], off.inputs[0]); off.inputs[1].default_value = ad.inputs[1].default_value * 0.5
        L_(off.outputs[0], mr.inputs['Value'])
        if kind == 'scorch':
            bs.inputs['Base Color'].default_value = (0.016, 0.014, 0.013, 1); bs.inputs['Roughness'].default_value = 0.92
        else:
            bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.014, 1); bs.inputs['Roughness'].default_value = 0.025
        L_(mr.outputs['Result'], mix.inputs['Fac']); L_(tr.outputs[0], mix.inputs[1]); L_(bs.outputs[0], mix.inputs[2]); L_(mix.outputs[0], out.inputs['Surface'])
        _DM[kind] = m; return m
    def ground_decal(name, site, theta, rx, ry, z, kind):
        NSEG = 72
        vs = [(0, 0, 0)] + [(math.cos(2 * math.pi * i / NSEG), math.sin(2 * math.pi * i / NSEG), 0) for i in range(NSEG)]
        fs_ = [(0, 1 + i, 1 + (i + 1) % NSEG) for i in range(NSEG)]
        me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs_); me.update()
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.data.materials.append(decal_mat(kind))
        ob.location = (site.x, site.y, z); ob.rotation_euler = (0, 0, theta); ob.scale = (rx, ry, 1)
        ob.visible_shadow = False; ob.pass_index = 1
        return ob
    for k, (c, t, n) in enumerate(SIDES):
        site = c - n * FOG_D; site.z = 0
        theta = math.atan2(n.x, -n.y)                                    # the model's front (glTF +Z = Blender −Y) towards the eye
        R_ = _M.Rotation(theta, 4, 'Z')
        glb = os.path.join(FOGUERES, FOG_FILE[k] + '.glb'); meta_ = os.path.join(FOGUERES, FOG_FILE[k] + '.json')
        flames = []
        if os.path.exists(glb):
            before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=glb)
            for ob in [o for o in bpy.data.objects if o not in before]:
                if ob.parent is None: ob.matrix_world = _M.Translation(site) @ R_ @ ob.matrix_world
                if ob.type == 'MESH':
                    ob.name = f'base_{WALLS[k][0]}'; ob.pass_index = 2
                    for sl in ob.material_slots:
                        bs_ = sl.material.node_tree.nodes.get('Principled BSDF') if sl.material and sl.material.use_nodes else None
                        if bs_:
                            bs_.inputs['Emission Strength'].default_value = EMBER_K
                            soot = FOG_SOOT.get(FOG_FILE[k], 1.0)            # fire-pit stones are blackened by soot
                            if soot < 1.0 and bs_.inputs['Base Color'].is_linked:
                                nt_ = sl.material.node_tree; src = bs_.inputs['Base Color'].links[0].from_socket
                                mu = nt_.nodes.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; mu.inputs[0].default_value = 1
                                mu.inputs[7].default_value = (soot, soot, soot, 1)
                                nt_.links.new(src, mu.inputs[6]); nt_.links.new(mu.outputs[2], bs_.inputs['Base Color'])
            fm = _json.load(open(meta_)); fs = fm.get('fireSources', [])
            bb = fm.get('bbox', {'min': [-0.6, 0, -0.6], 'max': [0.6, 1, 0.6]})
            # the light sits INSIDE the flame's body (a third of its height), one per foguera, two along a long pile: the base and
            # its legs occlude it (shadow under and behind the base, the legs' lines), and nothing sits a hand from the fuel
            # (the P3 ring had nine lights 0.33 m up against its stones: blown out to white)
            fl_ = [f_ for f_ in fs if f_['kind'] == 'flame']
            if fl_:
                xs = [f_['pos'][0] for f_ in fl_]
                sets = [fl_] if max(xs) - min(xs) < 1.0 else [[f_ for f_ in fl_ if f_['pos'][0] < 0], [f_ for f_ in fl_ if f_['pos'][0] >= 0]]
                for st in sets:
                    cx = sum(f_['pos'][0] for f_ in st) / len(st); cz = sum(f_['pos'][2] for f_ in st) / len(st)
                    y0 = sum(f_['pos'][1] for f_ in st) / len(st); h = max(f_['size'][1] for f_ in st); w = max(f_['size'][0] for f_ in st)
                    lp = Vector((cx, -cz, max(y0 + 0.35 * h, bb['max'][1] + 0.15)))   # never buried in the fuel (the P4 crib is 1.6 m)
                    flames.append((site + (R_ @ lp.to_4d()).to_3d(), min(0.18, 0.25 * w)))
            # the ground under it: a tight matte scorch ring (the contact, darker than the lit wet floor) and a wider puddle that
            # mirrors the base. Both a few mm over the floor, never coplanar with it.
            rx = max(-bb['min'][0], bb['max'][0]); ry = max(-bb['min'][2], bb['max'][2])
            if FOG_FILE[k].endswith('brasero'): rx = ry = 0.5                # the ash fallen under the bowl, between the feet
            ground_decal(f'scorch_{WALLS[k][0]}', site, theta, rx * 1.12, ry * 1.12, 0.004, 'scorch')
            ground_decal(f'puddle_{WALLS[k][0]}', site, theta, rx + 1.3, ry + 1.3, 0.002, 'puddle')
        if not flames: flames = [(site + Vector((0, 0, FOG_H)), 0.2)]
        for j, (fp, rad) in enumerate(flames):
            ld = bpy.data.lights.new(f'fire_{WALLS[k][0]}_{j}', 'POINT'); ld.energy = FOG_W * FOG_POW.get(FOG_FILE[k], 1.0) / len(flames); ld.shadow_soft_size = rad
            ld.color = (1.0, 0.42, 0.12)                                 # ≈ 1800–1900 K
            lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo); lo.location = fp
for c in bpy.data.collections:
    if c.name.startswith('lib_') or c.name == 'castells':
        lc = vl.layer_collection.children.get(c.name)
        if lc: lc.exclude = True

# ---- light groups
groups = []
def lg(name, kind, pos=None, side=None):
    if name not in [g['name'] for g in groups]:
        vl.lightgroups.add(name=name); groups.append({'name': name, 'kind': kind, 'pos': pos, 'side': side})
    return name
sc.world.lightgroup = lg('sky', 'sky')
moon = bpy.data.objects.get('moon')
if moon: moon.lightgroup = 'sky'
nf = 0
for ob in list(sc.collection.objects):
    if ob.type != 'LIGHT' or ob.name == 'moon': continue
    kind = ob.name.split('_')[0]
    if kind == 'fire':
        k = side_of(ob.location); ob.lightgroup = lg(f'fire_{WALLS[k][0]}', 'fire', three(ob.location), WALLS[k][0]); continue
    if kind == 'fanal':
        k = side_of(ob.location); ob.lightgroup = lg(f'fanal{nf}', 'fanal', three(ob.location), WALLS[k][0]); nf += 1
    elif kind == 'wall':
        k = side_of(ob.location); ob.lightgroup = lg(f'wall_{WALLS[k][0]}', 'wall', None, WALLS[k][0])
    else:
        k = side_of(ob.location); ob.lightgroup = lg(f'arcade_{WALLS[k][0]}', 'arcade', None, WALLS[k][0])
for ob in bpy.data.objects:
    if ob.type != 'MESH': continue
    if MODE != 'intro':
        if ob.name.startswith('floor'): ob.pass_index = 1
        if ob.name.startswith('base_'): ob.lightgroup = lg(f'embers_{ob.name[5:]}', 'embers', None, ob.name[5:])
        continue                                         # the dark square: nothing else of it emits — the sky, the fires, the embers
    if ob.name.endswith('_lit'):
        k = ob.name[6] if ob.name.startswith('square') and ob.name[6].isdigit() else None
        side = WALLS[int(k)][0] if k is not None else 'streets'
        ob.lightgroup = lg(f'windows_{side}', 'windows', None, side)
    elif 'vitrall' in ob.name: ob.lightgroup = lg('stained', 'stained')
    if ob.name.startswith('floor'): ob.pass_index = 1
for c in bpy.data.collections:                       # the lamp models' glass and bulbs (shared by all their instances)
    if MODE == 'intro' and c.name.startswith('lib_') and ('lamp' in c.name or 'lantern' in c.name):
        for ob in c.objects: ob.lightgroup = lg('lampglass', 'lampglass')
print('GROUPS', [g['name'] for g in groups])

# ---- the panoramic camera at the eye, forward = side 0 (P4), up = z
cam = bpy.data.cameras.new('pano'); cam.type = 'PANO'
cam.panorama_type = 'EQUIRECTANGULAR'
cam.latitude_min, cam.latitude_max = math.radians(LAT_MIN), math.radians(LAT_MAX)
cam.longitude_min, cam.longitude_max = math.radians(-180), math.radians(180)
cam.clip_start, cam.clip_end = 0.05, 400
co = bpy.data.objects.new('pano', cam); sc.collection.objects.link(co); co.location = EYE
co.rotation_euler = (-SIDES[0][2]).to_track_quat('-Z', 'Y').to_euler()
sc.camera = co

# ---- render settings
sc.render.engine = 'CYCLES'
pr = bpy.context.preferences.addons['cycles'].preferences
for dt in ('OPTIX', 'CUDA'):
    try:
        pr.compute_device_type = dt; pr.get_devices()
        if any(d.type == dt for d in pr.devices): break
    except Exception: pass
for d in pr.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.volume_step_rate = 3.0
sc.cycles.use_auto_tile = True; sc.cycles.tile_size = 1024
try: sc.render.compositor_device = 'CPU'     # 22 light groups denoised at 8k: on a shared 8 GB GPU the compositor ran out (crash)
except Exception as e: print('compositor device?', e)
sc.render.resolution_x = WIDTH; sc.render.resolution_y = HEIGHT; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0.0
vl.use_pass_z = True; vl.use_pass_object_index = True; vl.cycles.denoising_store_passes = True
sc.render.use_compositing = True

# ---- compositor: denoise every light group with the beauty's albedo / normal, write each pass as an EXR
ng = bpy.data.node_groups.new('bake', 'CompositorNodeTree'); sc.compositing_node_group = ng
rl = ng.nodes.new('CompositorNodeRLayers'); rl.scene = sc
fo = ng.nodes.new('CompositorNodeOutputFile'); fo.directory = PASSES; fo.file_name = ''
fo.format.media_type = 'IMAGE'; fo.format.file_format = 'OPEN_EXR'; fo.format.color_depth = '32'; fo.format.exr_codec = 'ZIP'
fo.save_as_render = False
outs = {s.name: s for s in rl.outputs if s.enabled}
print('RL OUTPUTS', list(outs))
alb, nrm = outs.get('Denoising Albedo'), outs.get('Denoising Normal')
def write(name, sock, kind='RGBA', denoise=True):
    it = fo.file_output_items.new(kind, name)
    src = sock
    if denoise and alb is not None:
        dn = ng.nodes.new('CompositorNodeDenoise')
        ng.links.new(sock, dn.inputs['Image']); ng.links.new(alb, dn.inputs['Albedo']); ng.links.new(nrm, dn.inputs['Normal'])
        src = dn.outputs['Image']
    ng.links.new(src, fo.inputs[name])
write('beauty', outs['Image'], denoise=False)                  # already denoised by Cycles
for g in groups:
    s = outs.get('Combined_' + g['name'])
    if s is None: print('MISSING PASS', g['name']); continue
    write('lg_' + g['name'], s)
write('depth', outs['Depth'], 'FLOAT', denoise=False)
write('index', outs['Object Index'], 'FLOAT', denoise=False)
comp = ng.nodes.new('CompositorNodeComposite') if 'CompositorNodeComposite' in dir(bpy.types) else None
if comp: ng.links.new(outs['Image'], comp.inputs[0])

bpy.ops.render.render(write_still=False)
meta = {'mode': MODE, 'width': WIDTH, 'height': HEIGHT, 'latMin': LAT_MIN, 'latMax': LAT_MAX, 'eye': three(EYE), 'groups': groups,
        'forward': three(-SIDES[0][2]), 'note': 'u = 0.5 looks along forward (side 0 = P4); row 0 = latMax'}
json.dump(meta, open(os.path.join(OUT, 'bake_meta.json'), 'w'), indent=1)
print('BAKED', OUT, WIDTH, HEIGHT, len(groups), 'groups')
