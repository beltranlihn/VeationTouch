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
    for k, (c, t, n) in enumerate(SIDES):
        p = c - n * FOG_D; p.z = FOG_H
        ld = bpy.data.lights.new(f'fire_{WALLS[k][0]}', 'POINT'); ld.energy = FOG_W; ld.shadow_soft_size = 0.35
        ld.color = (1.0, 0.42, 0.12)                                     # ≈ 1800–1900 K
        lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo); lo.location = p
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
        continue                                         # the dark square: nothing of it emits, only the sky and the fires
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
