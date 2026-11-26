# Ressonància — plaza3d: encode the baked panorama (plaza_bake.py's EXR passes) into the runtime files of parts/plaza3d/bake/.
#
#   blender -b --factory-startup --python plaza_bake_encode.py -- --out <bake tmp dir> [--bake <dst>] [--slices 4]
#
# beauty_<k>.png  linear HDR radiance in RGBM (rgb = (c / (m · R))^(1/2.2), a = m, R = 8): four vertical slices of the panorama
# light_<j>.png   half resolution: the SHARE of four light groups each (RGBA) in the beauty's luminance; the runtime relights
#                 as beauty · Σ_i k_i · share_i (all k = 1 gives the beauty back exactly)
# depth.png       half resolution: ray length from the eye, 16 bits in R·256 + G (metres = value / 65535 · 400); B = 255 on the floor
# bake.json       sizes, the angular frame, the groups (name, kind, side, lamp position) and which texture/channel holds each
import bpy, glob, json, math, os, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def a(name, default): return argv[argv.index(name) + 1] if name in argv else default
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(a('--out', os.path.join(HERE, 'out_bake'))); PASSES = os.path.join(OUT, 'passes')
DST = os.path.abspath(a('--bake', os.path.join(HERE, '..', '..', 'parts', 'plaza3d', 'bake'))); os.makedirs(DST, exist_ok=True)
SLICES = int(a('--slices', '4')); R = 8.0; DMAX = 400.0
meta = json.load(open(os.path.join(OUT, 'bake_meta.json')))

def load(prefix):
    fs = sorted(glob.glob(os.path.join(PASSES, prefix + '*.exr')))
    fs = [f for f in fs if os.path.basename(f)[len(prefix):len(prefix) + 1] in '0123456789.']
    if not fs: raise SystemExit('missing pass ' + prefix)
    img = bpy.data.images.load(fs[-1]); W, H = img.size
    px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(H, W, 4)[::-1]           # top row first

def save(name, arr):
    """arr: H × W × 4 floats in 0..1, top row first → 8-bit PNG, no colour transform."""
    H, W = arr.shape[:2]
    img = bpy.data.images.new(name, W, H, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(DST, name); img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    return os.path.getsize(os.path.join(DST, name))

def half(x):
    H, W = x.shape[:2]
    return x[:H // 2 * 2, :W // 2 * 2].reshape(H // 2, 2, W // 2, 2, -1).mean((1, 3))

lum = lambda c: c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722
beauty = load('beauty')[..., :3]
H, W = beauty.shape[:2]
# ---- beauty: RGBM, four slices
m = np.clip(beauty.max(-1) / R, 1 / 255, 1); m = np.ceil(m * 255) / 255
rgbm = np.concatenate([np.clip(beauty / (m[..., None] * R), 0, 1) ** (1 / 2.2), m[..., None]], -1)
sizes = {}
sw = W // SLICES
for k in range(SLICES): sizes[f'beauty_{k}.png'] = save(f'beauty_{k}.png', rgbm[:, k * sw:(k + 1) * sw])
# ---- the dark bake (correfoc): ADDITIVE layers, exact — the base is the sky alone, each fire its own RGBM layer (half size)
groups = meta['groups']
if meta.get('mode') == 'dark':
    sky = load('lg_sky')[..., :3]
    m = np.clip(sky.max(-1) / R, 1 / 255, 1); m = np.ceil(m * 255) / 255
    rgbm = np.concatenate([np.clip(sky / (m[..., None] * R), 0, 1) ** (1 / 2.2), m[..., None]], -1)
    for k in range(SLICES): sizes[f'beauty_{k}.png'] = save(f'beauty_{k}.png', rgbm[:, k * sw:(k + 1) * sw])
    fires = [g for g in groups if g['kind'] == 'fire']
    for g in fires:
        f = half(load('lg_' + g['name'])[..., :3])
        m = np.clip(f.max(-1) / R, 1 / 255, 1); m = np.ceil(m * 255) / 255
        name = f"{g['name']}.png"; sizes[name] = save(name, np.concatenate([np.clip(f / (m[..., None] * R), 0, 1) ** (1 / 2.2), m[..., None]], -1))
        g['file'] = name
    groups = [g for g in groups if g['kind'] in ('sky', 'fire')]
    Ls = None
else:
    Ls = []
if Ls is not None:
  # ---- light shares (half resolution)
  for g in groups: Ls.append(np.maximum(lum(half(load('lg_' + g['name'])[..., :3])), 0))
  tot = np.maximum(sum(Ls), 1e-6)
  shares = [l / tot for l in Ls]
  keep = [i for i, sh in enumerate(shares) if float(sh.max()) > 2e-3]          # drop groups that light nothing (e.g. off in the dark bake)
  groups = [groups[i] for i in keep]; shares = [shares[i] for i in keep]
  texmap = []
  for j in range(0, len(shares), 4):
      pack = shares[j:j + 4] + [np.zeros_like(tot)] * (4 - len(shares[j:j + 4]))
      name = f'light_{j // 4}.png'; sizes[name] = save(name, np.stack(pack, -1))
      for c, g in enumerate(groups[j:j + 4]): g['tex'] = j // 4; g['ch'] = 'rgba'[c]
# ---- depth + floor mask (half resolution)
dep = load('depth')[..., 0]; idx = load('index')[..., 0]
dh = half(np.minimum(dep, DMAX)[..., None])[..., 0]; fh = half((np.abs(idx - 1) < 0.5).astype(np.float32)[..., None])[..., 0]
q = np.round(np.clip(dh / DMAX, 0, 1) * 65535).astype(np.int64)
sizes['depth.png'] = save('depth.png', np.stack([(q >> 8) / 255.0, (q & 255) / 255.0, fh, np.ones_like(fh)], -1))
out = {**{k: meta[k] for k in ('latMin', 'latMax', 'eye', 'forward', 'note')}, 'mode': meta.get('mode', 'intro'), 'width': W, 'height': H, 'slices': SLICES,
       'rgbmRange': R, 'additive': meta.get('mode') == 'dark', 'rgbGamma': 2.2, 'depthMax': DMAX, 'lightSize': [W // 2, H // 2], 'groups': groups,
       'files': sizes, 'depthStats': {'p5': float(np.percentile(dep[dep < DMAX], 5)), 'p50': float(np.percentile(dep[dep < DMAX], 50))}}
json.dump(out, open(os.path.join(DST, 'bake.json'), 'w'), indent=1)
print('ENCODED', DST, {k: round(v / 1e6, 2) for k, v in sizes.items()}, 'depth p5/p50', out['depthStats'])
