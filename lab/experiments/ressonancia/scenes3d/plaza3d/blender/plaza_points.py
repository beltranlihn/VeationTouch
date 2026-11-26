# Ressonància — plaza3d: the square as a POINT CLOUD, for LA TORRE (the camera rises by a wall up past the roofs, so the
# baked panorama of the intro does not apply there; the tower session draws these points with its own particle material).
#
#   blender -b --factory-startup --python plaza_points.py -- --look 1 --out <tmp> --points <dir> [--n 400000]
#
# Runs after plaza_gen.py (same model: houses, church, chapel, Megascans / Poly Haven pieces), samples the evaluated surfaces:
#   - area sampling with a low, even density, weighted by kind: detail (mouldings, iron, windows, lamps, Gothic pieces) ×3,
#     facades ×1.4, building bodies, naves and roofs ×0.25, the floor of the square ×0.22 (only inside the square and the street mouths);
#   - plus points along the sharp edges (window and arch outlines, cornices, balconies) so the architecture reads;
#   - colour = an albedo per material lit by the square's lamps (inverse square, no shadows) + moon + sky, tone-mapped;
#     windows, stained glass and lamp glass are emissive (flag in A).
# Output (three.js / room3d coordinates, metres, y up, the room's centre on the floor at the origin, eye at (0, 1.6, 0)):
#   points.bin  = Float32 xyz × N, then Uint8 rgba × N        points.json = layout + scale + where the facades are
import bpy, bmesh, json, math, os, sys, runpy
import numpy as np
from mathutils import Vector

# build the model (same generator, same arguments after --)
G = runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plaza_gen.py'), run_name='plaza_gen')
LIGHTS, SIDES, WALLS, D, PUSH, three = G['LIGHTS'], G['SIDES'], G['WALLS'], G['D'], G['PUSH'], G['three']
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def a(name, default): return argv[argv.index(name) + 1] if name in argv else default
DST = os.path.abspath(a('--points', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'parts', 'plaza3d')))
NTOT = int(a('--n', '400000'))
EDGE_FRAC = 0.22
rng = np.random.default_rng(20261126)
os.makedirs(DST, exist_ok=True)

# the model library collections are only instanced: exclude the originals (they sit at the origin)
for c in bpy.data.collections:
    if c.name.startswith('lib_') or c.name in ('castells', 'cutters'):
        lc = bpy.context.view_layer.layer_collection.children.get(c.name)
        if lc: lc.exclude = True
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------------------ material → (albedo, kind, emissive)
def srgb(c): return np.array(c, dtype=np.float32)
ALB = {
    'stone': ((0.56, 0.47, 0.38), 'face', 0), 'stone_dressed': ((0.64, 0.55, 0.43), 'detail', 0), 'church_stone': ((0.5, 0.44, 0.38), 'face', 0),
    'interior': ((0.05, 0.04, 0.035), 'plain', 0), 'iron': ((0.06, 0.06, 0.065), 'detail', 0), 'wood': ((0.16, 0.1, 0.06), 'detail', 0),
    'glass_dark': ((0.05, 0.06, 0.08), 'detail', 0), 'window_lit': ((1.0, 0.62, 0.3), 'detail', 1), 'lamp_glass': ((1.0, 0.75, 0.45), 'detail', 2),
    'roof': ((0.42, 0.22, 0.15), 'plain', 0), 'floor': ((0.3, 0.28, 0.27), 'floor', 0), 'shutter': ((0.22, 0.3, 0.24), 'detail', 0),
    'stained_glass': ((0.15, 0.3, 1.0), 'detail', 3), 'stained_glass_ruby': ((1.0, 0.2, 0.15), 'detail', 3),
}
def lookup(mname):
    if mname in ALB: return ALB[mname]
    if mname.startswith('fab_'): return ((0.55, 0.5, 0.44), 'detail', 0)
    if mname.endswith('_bulb') or mname.endswith('_lamp'): return ((1.0, 0.78, 0.5), 'detail', 2)
    if mname.endswith('_glass'): return ((1.0, 0.7, 0.4), 'detail', 2)
    if 'lamp' in mname or 'lantern' in mname: return ((0.07, 0.07, 0.07), 'detail', 0)
    if 'door' in mname: return ((0.2, 0.13, 0.08), 'detail', 0)
    return ((0.5, 0.45, 0.4), 'detail', 0)
WEIGHT = {'detail': 3.0, 'face': 1.4, 'plain': 0.25, 'floor': 0.22}
SKIP = ('leak', 'castell_proxy', 'haze')
FACE_PREFIX = ('S', 'church_facade', 'chapel', 'bell_tower')

# ------------------------------------------------------------------------------------------------ gather triangles (evaluated, instances realised)
dg = bpy.context.evaluated_depsgraph_get()
tris = []      # per object chunk: (A, B, C (n×3 each, Blender coords), normals, area, matidx→info list)
edges = []     # (P0, P1) arrays
for inst in dg.object_instances:
    ob = inst.object
    if ob.type != 'MESH': continue
    if any(s in ob.name for s in SKIP): continue
    me = ob.to_mesh()
    if me is None or len(me.polygons) == 0: ob.to_mesh_clear(); continue
    M = np.array(inst.matrix_world, dtype=np.float64)
    me.calc_loop_triangles()
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    co = co @ M[:3, :3].T + M[:3, 3]
    nt = len(me.loop_triangles)
    vi = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', vi); vi = vi.reshape(-1, 3)
    mi = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('material_index', mi)
    mats = [(s.material.name if s.material else '') for s in ob.material_slots] or ['']
    if any(s in m for m in mats for s in SKIP): ob.to_mesh_clear(); continue
    info = [lookup(mats[min(i, len(mats) - 1)]) for i in range(max(1, len(mats)))]
    A, B, C = co[vi[:, 0]], co[vi[:, 1]], co[vi[:, 2]]
    cr = np.cross(B - A, C - A); area = 0.5 * np.linalg.norm(cr, axis=1); nrm = cr / np.maximum(2 * area[:, None], 1e-12)
    is_face = ob.name.startswith(FACE_PREFIX) and not ob.name.startswith(('square_', 'streets_'))
    kinds = []
    for i in range(nt):
        alb, kind, em = info[min(mi[i], len(info) - 1)]
        if is_face and kind == 'detail' and em == 0: kind = 'face'
        if not is_face and kind == 'face' and ob.name.startswith(('square_', 'streets_')): kind = 'plain'   # bodies, naves, chimneys
        kinds.append((alb, kind, em))
    keep = area > 1e-7
    # the floor: only the square and the street mouths
    tris.append((A[keep], B[keep], C[keep], nrm[keep], area[keep], [k for k, ok in zip(kinds, keep) if ok]))
    # sharp edges of facades and details: outlines of openings, cornices, balconies
    if is_face or ob.name.startswith(('square_stone2', 'square_iron', 'streets_stone2', 'square_church')) or inst.is_instance:
        bm = bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table()
        P0, P1 = [], []
        for e in bm.edges:
            lf = e.link_faces
            if len(lf) == 2 and lf[0].normal.angle(lf[1].normal, 0) < 0.6: continue
            P0.append(e.verts[0].co[:]); P1.append(e.verts[1].co[:])
        bm.free()
        if P0:
            P0 = np.array(P0) @ M[:3, :3].T + M[:3, 3]; P1 = np.array(P1) @ M[:3, :3].T + M[:3, 3]
            edges.append((P0, P1))
    ob.to_mesh_clear()

A = np.concatenate([t[0] for t in tris]); B = np.concatenate([t[1] for t in tris]); C = np.concatenate([t[2] for t in tris])
NRM = np.concatenate([t[3] for t in tris]); AREA = np.concatenate([t[4] for t in tris]); KIND = [k for t in tris for k in t[5]]
alb = np.array([k[0] for k in KIND], dtype=np.float32); emv = np.array([k[2] for k in KIND], dtype=np.uint8)
w = np.array([WEIGHT[k[1]] for k in KIND])
isfloor = np.array([k[1] == 'floor' for k in KIND]); w[isfloor] = 0          # the floor is sampled analytically below
FLOOR_HALF = 25.0
# ------------------------------------------------------------------------------------------------ area samples
n_area = int(NTOT * (1 - EDGE_FRAC))
floor_w = (2 * FLOOR_HALF) ** 2 * WEIGHT['floor']
n_floor = int(NTOT * 0.06); n_area -= n_floor
lam = AREA * w; lam = lam / lam.sum() * n_area
cnt = np.floor(lam + rng.random(len(lam))).astype(np.int64)
idx = np.repeat(np.arange(len(cnt)), cnt)
r1, r2 = rng.random(len(idx)), rng.random(len(idx)); s1 = np.sqrt(r1)
P = A[idx] * (1 - s1)[:, None] + B[idx] * (s1 * (1 - r2))[:, None] + C[idx] * (s1 * r2)[:, None]
PN = NRM[idx]; PA = alb[idx]; PE = emv[idx]
Fp = np.stack([rng.uniform(-FLOOR_HALF, FLOOR_HALF, n_floor), rng.uniform(-FLOOR_HALF, FLOOR_HALF, n_floor), np.zeros(n_floor)], 1)
P = np.concatenate([P, Fp]); PN = np.concatenate([PN, np.tile([[0, 0, 1.0]], (n_floor, 1))])
PA = np.concatenate([PA, np.tile(np.array([ALB['floor'][0]], np.float32), (n_floor, 1))]); PE = np.concatenate([PE, np.zeros(n_floor, np.uint8)])
# ------------------------------------------------------------------------------------------------ edge samples
E0 = np.concatenate([e[0] for e in edges]); E1 = np.concatenate([e[1] for e in edges])
L = np.linalg.norm(E1 - E0, axis=1)
ec = (E0 + E1) / 2
okE = (np.abs(ec[:, 0]) < 60) & (np.abs(ec[:, 1]) < 60)
E0, E1, L = E0[okE], E1[okE], L[okE]
n_edge = NTOT - len(P)
le = L / L.sum() * n_edge
ce = np.floor(le + rng.random(len(le))).astype(np.int64)
ie = np.repeat(np.arange(len(ce)), ce); t = rng.random(len(ie))
PE_pos = E0[ie] + (E1[ie] - E0[ie]) * t[:, None]
P = np.concatenate([P, PE_pos]); PN = np.concatenate([PN, np.zeros_like(PE_pos)])
PA = np.concatenate([PA, np.tile(np.array([[0.7, 0.62, 0.5]], np.float32), (len(PE_pos), 1))]); PE = np.concatenate([PE, np.zeros(len(PE_pos), np.uint8)])
# ------------------------------------------------------------------------------------------------ light: the square's lamps + moon + sky
Lp = np.array([[l[0].x, l[0].y, l[0].z] for l in LIGHTS]); Lw = np.array([l[1] for l in LIGHTS])
E = np.zeros(len(P))
for k in range(0, len(Lp)):
    d = Lp[k] - P; r2_ = np.maximum((d * d).sum(1), 0.25); dn = d / np.sqrt(r2_)[:, None]
    cosv = np.where((PN != 0).any(1), np.clip((PN * dn).sum(1), 0, 1), 0.6)
    E += Lw[k] * cosv / (4 * math.pi * r2_)
lit = PA * (np.array([1.0, 0.64, 0.36]) * E[:, None] * 2.2 + np.array([0.3, 0.3, 0.36]))
lit = lit / (1 + lit)
lit[PE == 1] = PA[PE == 1] * 0.95
lit[PE == 2] = PA[PE == 2]
# stained glass: deep blue cells with ruby and amber accents (a hash of the position, cells of ~0.5 m)
sg = PE == 3
if sg.any():
    cell = np.floor(P[sg] / 0.5).astype(np.int64); hsh = ((cell[:, 0] * 73856093) ^ (cell[:, 1] * 19349663) ^ (cell[:, 2] * 83492791)) % 1000 / 1000
    pal = np.array([[0.1, 0.2, 0.95], [0.08, 0.14, 0.7], [0.85, 0.08, 0.07], [0.95, 0.6, 0.1]])
    lit[sg] = pal[np.digitize(hsh, [0.55, 0.78, 0.92])]
srgbv = np.clip(lit, 0, 1) ** (1 / 2.2)
rgba = np.concatenate([(srgbv * 255 + 0.5).astype(np.uint8), np.where(PE == 0, 0, np.where(PE == 1, 160, 255)).astype(np.uint8)[:, None]], 1)
# Blender (x, y, z) → three (x, z, −y)
xyz = np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1).astype(np.float32)
order = rng.permutation(len(xyz))            # shuffled: any prefix is an even, lower-density subset
xyz, rgba = xyz[order], rgba[order]
with open(os.path.join(DST, 'points.bin'), 'wb') as f: f.write(xyz.tobytes()); f.write(rgba.tobytes())
facades = []
for k in range(4):
    c, tt, n = SIDES[k]
    facades.append({'wall': WALLS[k][0], 'normal_into_room': three(n), 'facade_distance_from_centre_m': D[k],
                    'wall_distance_from_centre_m': round(-c.dot(n), 3), 'castell_base': three(c - n * PUSH)})
meta = {
    'format': 'points.bin = Float32 xyz (count × 3), then Uint8 rgba (count × 4); little-endian',
    'count': int(len(xyz)), 'bytesPosition': int(xyz.nbytes), 'bytesColor': int(rgba.nbytes),
    'coords': 'three.js / room3d: metres, y up; origin = centre of the room on the floor (the eye is at (0, 1.6, 0))',
    'shuffled': 'yes: the first k points are an even subset (use a prefix for a lower density)',
    'alpha': '0 = lit surface; 160 = lit window (emissive); 255 = stained glass or lamp glass (emissive, brightest)',
    'bbox': {'min': xyz.min(0).round(2).tolist(), 'max': xyz.max(0).round(2).tolist()},
    'facades': facades, 'streets': 'leave the square at the four corners of the room (5 m wide, 22 m long)',
    'heights_m': {'low building behind each castell (cornice / top of balustrade)': '8.6 / 10.0 (P4, P1), 8.2 / 9.6 (P3), 8.2 (P2)',
                  'houses (3 upper floors)': 'cornice ≈ 14.7 (15.2 arcaded P1), eaves and chimneys to ≈ 18', 'church': 'gable 24.5, bell tower 34',
                  'chapel': 'gable 16.7', 'lamps': 'standing lamp heads ≈ 4.3, wall lanterns ≈ 3.3–4.0'},
    'lamps': [three(l[0]) for l in LIGHTS],
    'source': 'lab/experiments/ressonancia/scenes3d/plaza3d/blender/plaza_points.py (after plaza_gen.py --look 1)',
}
with open(os.path.join(DST, 'points.json'), 'w', encoding='utf-8') as f: json.dump(meta, f, indent=1, ensure_ascii=False)
print('POINTS', len(xyz), 'floor', n_floor, 'edges', len(PE_pos), 'MB', round((xyz.nbytes + rgba.nbytes) / 1e6, 2), DST)
