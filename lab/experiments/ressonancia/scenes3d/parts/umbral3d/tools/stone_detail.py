"""
bake_stone.py - tileable tumbled-travertine detail texture + Cycles example render.

Run (headless):
  blender -b --factory-startup --python bake_stone.py -- [bake|render|all] [outdir]

Stage "bake"   : builds the periodic height / mottling / pore / vein fields (numpy, FFT-filtered noise so every
                 field is exactly periodic), packs stone-detail.png (RGBA 768x768 8-bit), stone-detail-preview.png,
                 stone-detail-tiled-2x2.png, stone-height.npy (relief in cm, used by the render).
Stage "render" : builds 8 sculpted stones in Blender (bevelled slabs, voxel remeshed, real vertex displacement
                 from the height field, chipped shoulders), shades them with stone-detail.png and renders
                 stone-render.png with Cycles (64 spp, denoised).

Channel layout of stone-detail.png (image row 0 = TOP when viewed; +Y = UP in the viewed image):
  R,G : tangent-space normal X / Y slopes, 0.5 = flat (R up where the surface faces +X, G where it faces +Y)
  B   : tonal mottling, 1 light .. 0 dark
  A   : pores / veins darkening, 1 none .. 0 deepest
Texture covers 18 cm x 18 cm (768 px => 42.67 px/cm, 1 mm = 4.27 px).
"""
import sys, os, math, struct
import numpy as np

N = 768
TILE_CM = 18.0
PX_CM = TILE_CM / N
SEED = 7

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
STAGE = argv[0] if argv else 'all'
OUT = argv[1] if len(argv) > 1 else os.path.dirname(os.path.abspath(__file__))


# ----------------------------------------------------------------------------------------------- helpers
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


_fy = np.fft.fftfreq(N)[:, None] * N
_fx = np.fft.rfftfreq(N)[None, :] * N
_fr = np.sqrt(_fx ** 2 + _fy ** 2)


def fft_noise(rng, fc, sigma_oct=0.6, aniso=None):
    """Exactly periodic noise, band-passed around fc cycles/tile, normalised to mean 0 std 1.
    aniso=(angle_rad, stretch): stretch>1 elongates features along `angle`."""
    w = rng.standard_normal((N, N))
    W = np.fft.rfft2(w)
    if aniso is not None:
        a, s = aniso
        u = _fx * math.cos(a) + _fy * math.sin(a)
        v = -_fx * math.sin(a) + _fy * math.cos(a)
        fr = np.sqrt((u * s) ** 2 + v ** 2)
    else:
        fr = _fr
    amp = np.exp(-0.5 * (np.log(np.maximum(fr, 1e-6) / fc) / (sigma_oct * math.log(2))) ** 2)
    amp[0, 0] = 0
    n = np.fft.irfft2(W * amp, s=(N, N))
    return (n - n.mean()) / n.std()


def blerp(arr, fx, fy):
    """periodic bilinear sample of arr[y,x] at pixel coords (fx, fy)"""
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int)
    tx = fx - x0; ty = fy - y0
    x0 %= N; y0 %= N; x1 = (x0 + 1) % N; y1 = (y0 + 1) % N
    return (arr[y0, x0] * (1 - tx) * (1 - ty) + arr[y0, x1] * tx * (1 - ty) +
            arr[y1, x0] * (1 - tx) * ty + arr[y1, x1] * tx * ty)


def pct(a, q):
    return float(np.percentile(a, q))


# ----------------------------------------------------------------------------------------------- field synthesis
def build_fields():
    rng = np.random.default_rng(SEED)
    bed = math.radians(6.3)                       # bedding direction (bands run along x, slightly tilted)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)

    # undulation of a honed / tumbled face + fine tumble grain (height in "px units", scaled later)
    h = 3.0 * fft_noise(rng, 3.0, 0.7) + 1.1 * fft_noise(rng, 8.5, 0.6) + 0.35 * fft_noise(rng, 30, 0.6)
    h += 0.5 * fft_noise(rng, 6, 0.6, aniso=(bed, 3.0))        # faint bedding-aligned ridges

    vein_dark = np.zeros((N, N))      # 0..1 darkening of veins / cracks
    crack_h = np.zeros((N, N))        # tiny groove along cracks (px units)

    def walk(length, sigma, k, groove, base_ang, wander):
        x, y = rng.uniform(0, N, 2)
        ang = base_ang + rng.normal(0, 0.35)
        drift = 0.0
        step = 0.7
        hw = int(math.ceil(3 * sigma)) + 1
        for _ in range(int(length / step)):
            drift = 0.985 * drift + rng.normal(0, wander)
            ang += drift
            x += math.cos(ang) * step; y += math.sin(ang) * step
            xi, yi = int(round(x)), int(round(y))
            ax = np.arange(xi - hw, xi + hw + 1); ay = np.arange(yi - hw, yi + hw + 1)
            dx = (ax - x)[None, :]; dy = (ay - y)[:, None]
            g = np.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
            ix = np.ix_(ay % N, ax % N)
            vein_dark[ix] = np.maximum(vein_dark[ix], k * g)
            if groove > 0:
                crack_h[ix] = np.minimum(crack_h[ix], -groove * g)

    for _ in range(5):        # faint wandering veins
        walk(rng.uniform(260, 620), rng.uniform(0.8, 1.35), rng.uniform(0.28, 0.5), 0.0, bed, 0.0035)
    for _ in range(4):        # hairline cracks
        walk(rng.uniform(120, 340), 0.6, rng.uniform(0.3, 0.45), 0.5, bed + rng.normal(0, 0.9), 0.012)

    # pores: clustered, elongated along the bedding direction
    dens = fft_noise(rng, 4.0, 0.7) + 0.5 * fft_noise(rng, 11, 0.6)
    dens = smoothstep(0.1, 1.6, dens)
    pore_s = np.zeros((N, N)); pore_a = np.zeros((N, N)); pore_h = np.zeros((N, N))
    A_target = 0.95

    def stamp(cx, cy, rmaj, rmin, ang, depth, strength):
        hw = int(math.ceil(rmaj * 1.5)) + 2
        xi, yi = int(math.floor(cx)), int(math.floor(cy))
        ax = np.arange(xi - hw, xi + hw + 1); ay = np.arange(yi - hw, yi + hw + 1)
        dx = (ax - cx)[None, :]; dy = (ay - cy)[:, None]
        c, s = math.cos(ang), math.sin(ang)
        u = (dx * c + dy * s) / rmaj; v = (-dx * s + dy * c) / rmin
        r = np.sqrt(u * u + v * v)
        th = np.arctan2(v, u)
        f1, f2 = rng.uniform(0, 6.28, 2)
        reff = r / (1 + 0.2 * np.cos(2 * th + f1) + 0.14 * np.cos(3 * th + f2))
        s_ = smoothstep(0.0, 0.42, 1 - reff)                  # flat floor, soft rim
        bowl = np.clip(1 - reff * reff, 0, 1)
        ix = np.ix_(ay % N, ax % N)
        pore_s[ix] = np.maximum(pore_s[ix], s_)
        pore_a[ix] = np.maximum(pore_a[ix], strength * s_)
        pore_h[ix] = np.maximum(pore_h[ix], depth * (0.35 * s_ + 0.65 * bowl))

    A = 1 - vein_dark
    tries = 0; count = 0
    while A.mean() > A_target and tries < 60000:
        tries += 1
        if count % 25 == 0:
            A = 1 - np.maximum(vein_dark, pore_a)
        cx, cy = rng.uniform(0, N, 2)
        if rng.random() > dens[int(cy), int(cx)] ** 1.2 + 0.015:
            continue
        rmaj = 2.0 + 8.0 * rng.random() ** 2.4                # lengths 4 .. 20 px
        asp = rng.uniform(1.5, 3.4)
        rmin = max(1.0, rmaj / asp)
        ang = bed + rng.normal(0, 0.22)
        stamp(cx, cy, rmaj, rmin, ang, depth=rmin * rng.uniform(0.7, 1.5), strength=rng.uniform(0.5, 0.98))
        count += 1
    A = 1 - np.maximum(vein_dark, pore_a)

    # B: tonal mottling = clouds + faint bedding bands, pores darker
    cloud = (0.55 * fft_noise(rng, 2.5, 0.7) + 0.5 * fft_noise(rng, 6, 0.7) + 0.3 * fft_noise(rng, 16, 0.6) +
             0.12 * fft_noise(rng, 70, 0.6))
    cloud /= cloud.std()
    warp = 2.2 * fft_noise(rng, 3.0, 0.7)
    band_amp = 0.5 + 0.5 * smoothstep(-1, 1, fft_noise(rng, 2.0, 0.7))
    ph1 = 2 * math.pi * (1 * xx / N + 9 * yy / N) + warp              # integer wave numbers => periodic
    ph2 = 2 * math.pi * (2 * xx / N + 14 * yy / N) + 1.7 * warp + 1.3
    bands = band_amp * (0.65 * np.sin(ph1) + 0.35 * np.sin(ph2))
    B = 0.62 + 0.085 * cloud + 0.045 * bands + 0.02 * fft_noise(rng, 120, 0.6)
    B -= 0.07 * vein_dark
    pore_tone = 0.22 + 0.12 * smoothstep(0, 1, fft_noise(rng, 20, 0.6) * 0.5 + 0.5)
    B = B * (1 - pore_s) + pore_tone * pore_s
    B = np.clip(B, 0, 1)

    h = h - pore_h + crack_h
    return dict(h=h, B=B, A=A, npores=count)


def pack(fields):
    h = fields['h']
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    pooled = np.abs(np.concatenate([gx.ravel(), gy.ravel()]))
    c = 0.35 / np.percentile(pooled, 99)              # R-0.5 = c * (-dh/dx)
    R = np.clip(0.5 - c * gx, 0, 1)
    G = np.clip(0.5 - c * gy, 0, 1)
    h_phys_px = 2 * c * h                              # R-0.5 ~ 0.5*slope  => physical slope = 2c*dh_px
    rgba = np.stack([R, G, fields['B'], fields['A']], -1)   # row 0 = BOTTOM (bpy order, y up)
    return rgba, h_phys_px


# ----------------------------------------------------------------------------------------------- image IO via bpy
def bpy_save_rgba(path, arr):
    """arr float 0..1 (H,W,4), row 0 = bottom. Writes an 8-bit RGBA PNG, no colour transform, straight alpha."""
    import bpy
    H, W, _ = arr.shape
    q = np.round(np.clip(arr, 0, 1) * 255).astype(np.uint8)
    img = bpy.data.images.new('tmp_' + os.path.basename(path), W, H, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'
    img.pixels.foreach_set((q.astype(np.float32) / 255.0).ravel())
    img.file_format = 'PNG'
    img.filepath_raw = path
    img.save()
    bpy.data.images.remove(img)


def bpy_load_rgba_u8(path):
    import bpy
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'
    W, H = img.size
    a = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return np.round(a.reshape(H, W, 4) * 255).astype(np.uint8)


def png_header(path):
    with open(path, 'rb') as f:
        d = f.read(33)
    return struct.unpack('>IIBB', d[16:26])      # w, h, bit depth, colour type (6 = RGBA)


def stats(name, a):
    return '%s mean=%.3f p1=%.3f p99=%.3f min=%.3f max=%.3f' % (name, a.mean(), pct(a, 1), pct(a, 99), a.min(), a.max())


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


# ----------------------------------------------------------------------------------------------- bake stage
def stage_bake():
    os.makedirs(OUT, exist_ok=True)
    f = build_fields()
    rgba, hphys = pack(f)
    p = os.path.join(OUT, 'stone-detail.png')
    bpy_save_rgba(p, rgba)
    np.save(os.path.join(OUT, 'stone-height.npy'), (hphys * PX_CM).astype(np.float32))   # relief in cm

    u8 = bpy_load_rgba_u8(p)                       # read back what was really written
    print('PNG header (w,h,bitdepth,colortype):', png_header(p), ' pores placed:', f['npores'])
    names = 'RGBA'
    for i in range(4):
        print(stats(names[i], u8[..., i] / 255.0))
    rr = u8[..., 0] / 255.0 - 0.5; gg = u8[..., 1] / 255.0 - 0.5
    print('R/G pooled |.-0.5| p99 = %.3f ; |R-.5| p99 %.3f ; |G-.5| p99 %.3f' % (
        pct(np.abs(np.concatenate([rr.ravel(), gg.ravel()])), 99), pct(np.abs(rr), 99), pct(np.abs(gg), 99)))
    t = u8.astype(np.float64)
    for i in range(4):
        ch = t[..., i]
        print('tile check %s: seam |dx|=%.3f (typical neighbour step %.3f)  seam |dy|=%.3f (typical %.3f)' % (
            names[i], np.abs(ch[:, 0] - ch[:, -1]).mean(), np.abs(ch[:, 1:] - ch[:, :-1]).mean(),
            np.abs(ch[0, :] - ch[-1, :]).mean(), np.abs(ch[1:, :] - ch[:-1, :]).mean()))

    G_, B_, A_ = [u8[..., i] / 255.0 for i in (1, 2, 3)]
    base = srgb_to_lin(np.array([0xCB, 0xBB, 0xA4]) / 255.0)
    k = (0.73 + 0.55 * B_) * (0.6 + 0.4 * A_) * (1 + 0.9 * (G_ - 0.5))
    col = lin_to_srgb(base[None, None, :] * k[..., None] * 0.95)
    prev = np.concatenate([col, np.ones((N, N, 1))], -1)
    bpy_save_rgba(os.path.join(OUT, 'stone-detail-preview.png'), prev)
    bpy_save_rgba(os.path.join(OUT, 'stone-detail-tiled-2x2.png'), np.tile(prev, (2, 2, 1)))
    sheet = np.concatenate([np.repeat(u8[..., i:i + 1] / 255.0, 3, -1) for i in range(4)], 1)
    bpy_save_rgba(os.path.join(OUT, 'stone-detail-channels.png'),
                  np.concatenate([sheet, np.ones((N, N * 4, 1))], -1))


# ----------------------------------------------------------------------------------------------- render stage
def stage_render():
    import bpy, bmesh
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = np.random.default_rng(11)
    hcm = np.load(os.path.join(OUT, 'stone-height.npy')).astype(np.float64)       # cm
    chip = fft_noise(np.random.default_rng(99), 12.0, 0.6)                         # chip noise (~1.5 cm)
    grain = fft_noise(np.random.default_rng(98), 70.0, 0.6)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'

    img = bpy.data.images.load(os.path.join(OUT, 'stone-detail.png'))
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'

    def srgb_col(hexs):
        c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        return tuple(float(x) for x in srgb_to_lin(c)) + (1.0,)

    mat = bpy.data.materials.new('stone')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.extension = 'REPEAT'; tex.interpolation = 'Linear'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], sep.inputs['Color'])

    def mnode(op, a=None, b=None, c=None):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    kB = mnode('MULTIPLY_ADD', sep.outputs['Blue'], 0.55, 0.73)
    kA = mnode('MULTIPLY_ADD', tex.outputs['Alpha'], 0.4, 0.6)
    k = mnode('MULTIPLY', kB, kA)
    scale = nt.nodes.new('ShaderNodeVectorMath'); scale.operation = 'SCALE'
    scale.inputs['Vector'].default_value = srgb_col('#CBBBA4')[:3]
    nt.links.new(k, scale.inputs['Scale'])
    nt.links.new(scale.outputs['Vector'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.72
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.35
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    gmat = bpy.data.materials.new('grout')
    gmat.use_nodes = True
    gb = gmat.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = srgb_col('#141C32')
    gb.inputs['Roughness'].default_value = 0.95

    def make_stone(idx, cx, cy):
        n = int(rng.integers(5, 8))
        ang = (np.arange(n) + rng.uniform(-0.28, 0.28, n)) * 2 * math.pi / n
        rad = rng.uniform(3.0, 3.9, n)
        bm = bmesh.new()
        vs = [bm.verts.new((rad[i] * math.cos(ang[i]), rad[i] * math.sin(ang[i]), 0)) for i in range(n)]
        face = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[face])
        ext = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=ext, vec=(0, 0, -1.2))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new('stone%d' % idx)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('stone%d' % idx, me)
        scene.collection.objects.link(ob)
        for o in bpy.context.selected_objects:
            o.select_set(False)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bev = ob.modifiers.new('bevel', 'BEVEL')
        bev.width = 0.42; bev.segments = 3; bev.profile = 0.62; bev.limit_method = 'NONE'
        rem = ob.modifiers.new('remesh', 'REMESH')
        rem.mode = 'VOXEL'; rem.voxel_size = 0.05; rem.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier='bevel')
        bpy.ops.object.modifier_apply(modifier='remesh')
        me = ob.data
        nv = len(me.vertices)
        co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(nv, 3)
        nm = np.empty(nv * 3); me.vertex_normals.foreach_get('vector', nm); nm = nm.reshape(nv, 3)
        th = rng.uniform(0, 2 * math.pi)
        ox, oy = rng.uniform(0, TILE_CM, 2)
        c, s = math.cos(th), math.sin(th)
        u = (co[:, 0] * c - co[:, 1] * s + ox) / PX_CM      # px coords in the tile
        v = (co[:, 0] * s + co[:, 1] * c + oy) / PX_CM
        top = smoothstep(0.6, 0.97, nm[:, 2])
        h = blerp(hcm, u, v)
        sh = smoothstep(0.03, 0.4, 1 - nm[:, 2]) * (1 - smoothstep(0.85, 0.99, 1 - nm[:, 2])) * (nm[:, 2] > -0.2)
        cn = blerp(chip, u * 0.9 + 100, v * 0.9 + 40)
        gn = blerp(grain, u + 300, v + 200)
        d = h * top
        d += sh * (0.025 * cn + 0.006 * gn) - sh * 0.06 * smoothstep(0.5, 1.6, cn)      # worn shoulder + chips
        d += (1 - top) * (nm[:, 2] < 0.5) * 0.007 * gn                                  # rough split sides
        co = co + nm * d[:, None]
        me.vertices.foreach_set('co', co.ravel())
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', li)
        uvs = np.stack([u / N, v / N], -1)[li]
        uvl.data.foreach_set('uv', uvs.ravel())
        bpy.ops.object.shade_smooth()
        me.materials.append(mat)
        ob.location = (cx, cy, 0)
        ob.rotation_euler = (math.radians(rng.normal(0, 1.2)), math.radians(rng.normal(0, 1.2)), rng.uniform(0, 6.28))
        return ob

    idx = 0; cell = 8.4
    for r_ in range(2):
        for c_ in range(4):
            cx = (c_ - 1.5) * cell + (r_ % 2) * 0.9 + rng.uniform(-0.5, 0.5)
            cy = (r_ - 0.5) * cell + rng.uniform(-0.5, 0.5)
            make_stone(idx, cx, cy); idx += 1

    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -0.75))
    bpy.context.active_object.data.materials.append(gmat)

    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 50; cam_d.clip_start = 1; cam_d.clip_end = 400
    cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
    tilt = math.radians(14); dist = 56
    cam.location = (0, -dist * math.sin(tilt), dist * math.cos(tilt))
    cam.rotation_euler = (tilt, 0, 0)
    scene.camera = cam

    sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 3.2; sun_d.angle = math.radians(7)
    sun_d.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new('sun', sun_d); scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(48), 0, math.radians(-35))     # light from top-left

    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.35, 0.4, 0.55, 1); bg.inputs['Strength'].default_value = 0.45

    scene.render.filepath = os.path.join(OUT, 'stone-render.png')
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print('render written', scene.render.filepath)


if STAGE in ('bake', 'all'):
    stage_bake()
if STAGE in ('render', 'all'):
    stage_render()
