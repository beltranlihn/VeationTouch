# Ressonància — plaza3d: fetch the CC0 sources the Blender generator uses (Poly Haven, CC0 1.0 — https://polyhaven.com/license).
# They are SOURCES for the offline render/bake only (nothing of them is loaded by the room at run time), so they stay out of git:
#   python fetch_assets.py            → blender/assets_src/<id>/...
# Authorised by Beltrán 26-11-2026 («Puedes buscar librerías en internet con materiales y modelos si te sirve»).
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, 'assets_src')
UA = {'User-Agent': 'plaza3d-fetch'}
TEXTURES = {  # id: resolution
    'monastery_stone_floor': '2k',   # the square: irregular worn flagstones
    'sandstone_blocks_08': '2k',     # dressed ashlar (palaces, arcades)
    'old_sandstone_02': '2k',        # rough old sandstone (ground floors, the church)
    'yellow_plaster': '2k',          # old stucco houses
    'worn_shutter': '2k',            # louvred shutters (persianes)
}
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor_gl', 'Rough': 'rough', 'Displacement': 'disp'}
MODELS = ['street_lamp_01', 'street_lamp_02', 'large_castle_door', 'lantern_chandelier_01']
HDRIS = {'qwantani_night_puresky': '2k'}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: return r.read()
def save(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url); open(path, 'wb').write(data); return len(data)

total = 0
for tid, res in TEXTURES.items():
    j = json.loads(get(f'https://api.polyhaven.com/files/{tid}'))
    for key, short in MAPS.items():
        f = j[key][res]['jpg']
        total += save(f['url'], os.path.join(DST, tid, f'{tid}_{short}_{res}.jpg'))
for mid in MODELS:
    j = json.loads(get(f'https://api.polyhaven.com/files/{mid}'))
    g = j['gltf']['1k']['gltf']
    total += save(g['url'], os.path.join(DST, mid, os.path.basename(g['url'])))
    for rel, f in g.get('include', {}).items():
        total += save(f['url'], os.path.join(DST, mid, rel))
for hid, res in HDRIS.items():
    j = json.loads(get(f'https://api.polyhaven.com/files/{hid}'))
    f = j['hdri'][res]['hdr']
    total += save(f['url'], os.path.join(DST, hid, os.path.basename(f['url'])))
print(f'fetched {total / 1e6:.1f} MB into {DST}')
