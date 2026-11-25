# Ressonància entrance (studio 25-11, Beltrán) — the stones of «Finales/Mosaico.png» (7196 × 1094: the 912 visible rows + 91 above and below),
# as drawn: every drawn stone (lbl2.npy, see seg_new.py) becomes polygons — crumbs join a neighbour, stones over SPLIT_D are cut into
# ~TARGET_D pieces along their own shape (small stones: the touch shows). Stones run on across the wall corners and across the P3 → P4
# seam (no straight joint at a corner). The openings are the picture's transparent parts. Colours: On = the picture, OFF = his
# «Prueba OFF» transform (fitted on the first pair, off_map.npy). Writes story-stones.json, mosaic-on.jpg, mosaic-off.jpg, a preview.
#   python -I stones_build2.py <Prueba Mosaic dir> <out dir> <preview.png>
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2
from skimage import measure

D, OD, PREV = sys.argv[1], sys.argv[2], sys.argv[3]
WALLS = [(0, 1912, 7.33), (1912, 1692, 6.483), (3604, 1920, 7.353), (5524, 1672, 6.411)]   # x px, w px, width m (P4 P1 P2 P3)
TOP, VIS, HM = 91, 912, 3.75                       # the visible band: rows 91 … 1003 = 3.75 m … 0 m
PY = VIS / HM                                      # 243.2 px / m up
PX = sum(w[1] for w in WALLS) / sum(w[2] for w in WALLS)   # 260.9 px / m across (each wall within 0.1 %)
SPLIT_D, TARGET_D, CRUMB_D, MIN_D = 0.10, 0.07, 0.03, 0.018

L = np.load(D + '/lbl2.npy').astype(np.int64)
IMG = sys.argv[4] if len(sys.argv) > 4 else D + '/Finales/Mosaico.png'   # (the picture: a 4th argument, else «Finales/Mosaico.png»)
im = np.asarray(Image.open(IMG)).astype(np.float64)
ON = im[..., :3]; HOLE = im[..., 3] < 128
Wm = np.load(D + '/off_map.npy'); o = ON / 255
OFF = np.clip(np.concatenate([o, o ** 2, np.ones(o.shape[:2] + (1,))], -1) @ Wm, 0, 1) * 255
H, W = L.shape
area_px = lambda d: np.pi * (d / 2) ** 2 * PX * PY

class UF:
    def __init__(s, n): s.p = np.arange(n)
    def f(s, a):
        while s.p[a] != a: s.p[a] = s.p[s.p[a]]; a = s.p[a]
        return a
def compact(L):
    m = L >= 0; u, inv = np.unique(L[m], return_inverse=True); out = np.full(L.shape, -1, np.int64); out[m] = inv; return out
def stats(L):
    m = L >= 0; n = L.max() + 1; cnt = np.bincount(L[m], minlength=n)
    col = np.stack([np.bincount(L[m], ON[..., k][m], minlength=n) for k in range(3)], -1) / np.maximum(cnt, 1)[:, None]
    return n, cnt, col
def pairs(L):                                       # neighbouring labels, the seam included (x wraps)
    a = np.concatenate([L.ravel(), L[:-1].ravel()]); b = np.concatenate([np.roll(L, -1, 1).ravel(), L[1:].ravel()])
    ok = (a != b) & (a >= 0) & (b >= 0); return a[ok], b[ok]
L = compact(L)
# 1. the seam: a stone cut by the picture's edge is one stone (both halves alike, sharing a long border)
n, cnt, col = stats(L)
a, b = L[:, W - 1], L[:, 0]; ok = (a >= 0) & (b >= 0); a, b = a[ok], b[ok]
k, kc = np.unique(a * n + b, return_counts=True); u, v = k // n, k % n
uf = UF(n); joined = 0
for i in np.argsort(-kc):
    if kc[i] < 4 or np.linalg.norm(col[u[i]] - col[v[i]]) > 45: continue
    ru, rv = uf.f(u[i]), uf.f(v[i])
    if ru != rv: uf.p[ru] = rv; joined += 1
lut = np.array([uf.f(i) for i in range(n)]); m = L >= 0; L[m] = lut[L[m]]; L = compact(L)
# 2. crumbs join the neighbour they share most border with (of a near colour)
for it in range(5):
    n, cnt, col = stats(L)
    small = (cnt > 0) & (cnt < area_px(CRUMB_D))
    if not small.any(): break
    a, b = pairs(L); a, b = np.concatenate([a, b]), np.concatenate([b, a])
    keys, kc = np.unique(a * n + b, return_counts=True); u, v = keys // n, keys % n
    sel = small[u]; u, v, kc = u[sel], v[sel], kc[sel]
    score = kc / (1 + np.linalg.norm(col[u] - col[v], axis=1) / 25) * (cnt[v] >= cnt[u])
    order = np.lexsort((-score, u)); u, v, score = u[order], v[order], score[order]
    first = np.r_[True, u[1:] != u[:-1]]
    lut = np.arange(n); good = first & (score > 0); lut[u[good]] = v[good]
    for _ in range(8): lut = lut[lut]
    m = L >= 0; L[m] = lut[L[m]]
L = compact(L)
# 3. pixels of each stone, x unwrapped across the seam
n, cnt, col = stats(L)
m = L >= 0; ys, xs = np.nonzero(m); ls = L[m]
order = np.argsort(ls, kind='stable'); ys, xs, ls = ys[order], xs[order], ls[order]
starts = np.r_[0, np.cumsum(cnt)]
def pix(r):
    y, x = ys[starts[r]:starts[r + 1]], xs[starts[r]:starts[r + 1]].astype(np.float64)
    if x.max() - x.min() > W / 2: x = np.where(x < W / 2, x + W, x)
    return y, x
# 4. the large ones are cut into ~TARGET_D pieces along their own shape (k-means in metres)
pieces = []                                          # (y px array, x px array, colour on, colour off)
for r in range(n):
    if cnt[r] == 0: continue
    y, x = pix(r)
    if cnt[r] >= area_px(SPLIT_D):
        k = max(2, int(round(cnt[r] / (area_px(TARGET_D) * 1.02))))
        P = np.stack([x / PX, y / PY], -1)
        _, lab = kmeans2(P, k, minit='++', seed=r)
        for j in range(k):
            s = lab == j
            if s.any(): pieces.append((y[s], x[s]))
    else: pieces.append((y, x))
lin = lambda c: np.round((c / 255.0) ** 2.2, 4)
xi = lambda x: np.mod(x.astype(np.int64), W)
# 5. each piece → a smooth polygon, in metres on the wall of its centre (its outline may run on into the next wall)
stones = []; dropped = 0; out_lbl = np.full(L.shape, -1, np.int64)
for pi, (y, x) in enumerate(pieces):
    if len(y) < area_px(MIN_D): dropped += 1; continue
    y0, x0 = y.min(), int(x.min()); pad = 3
    mask = np.zeros((y.max() - y0 + 1 + 2 * pad, int(x.max()) - x0 + 1 + 2 * pad)); mask[y - y0 + pad, x.astype(np.int64) - x0 + pad] = 1
    cs = measure.find_contours(ndi.gaussian_filter(mask, 1.0), 0.5)
    if not cs: dropped += 1; continue
    c = measure.approximate_polygon(max(cs, key=len), 0.6)[:-1]
    if len(c) < 3: dropped += 1; continue
    px_ = c[:, 1] - pad + x0 + 0.5; py_ = c[:, 0] - pad + y0 + 0.5
    xm_ = px_ / PX; ym_ = (TOP + VIS - py_) / PY       # metres: x along the strip (unwrapped), y from the floor
    A2 = xm_ * np.roll(ym_, -1) - np.roll(xm_, -1) * ym_; A = A2.sum() / 2
    if abs(A) < 1e-5: dropped += 1; continue
    cx = ((xm_ + np.roll(xm_, -1)) * A2).sum() / (6 * A); cy = ((ym_ + np.roll(ym_, -1)) * A2).sum() / (6 * A)
    if A < 0: xm_, ym_ = xm_[::-1], ym_[::-1]
    cpx = (cx * PX) % W; wi = max(i for i, w in enumerate(WALLS) if w[0] <= cpx); wx0, wp, wm = WALLS[wi]
    cxw = (cpx - wx0) / wp * wm
    rel = np.round(np.stack([xm_ - cx, ym_ - cy], -1).ravel() * 1000).astype(int).tolist()
    on = ON[y, xi(x)].mean(0); off = OFF[y, xi(x)].mean(0)
    stones.append([wi, round(float(cxw), 4), round(float(cy), 4), round(float(np.sqrt(abs(A) / np.pi)), 4), *lin(on).tolist(), *lin(off).tolist(), rel])
    out_lbl[y, xi(x)] = len(stones) - 1
# 6. the openings (transparent): wall, centre x / y (m), half width / height (m), corner radius (m)
hl, hn = ndi.label(HOLE); openings = []
for i, sl in enumerate(ndi.find_objects(hl)):
    if (hl[sl] == i + 1).sum() < 2000: continue
    x0, x1, y0, y1 = sl[1].start, sl[1].stop, sl[0].start, sl[0].stop
    cxp = (x0 + x1) / 2; wi = max(j for j, w in enumerate(WALLS) if w[0] <= cxp); wx0, wp, wm = WALLS[wi]
    hw, hh = (x1 - x0) / 2 / PX, (y1 - y0) / 2 / PY
    fill = (hl[sl] == i + 1).mean()                 # 0.785 an ellipse, ~1 a rectangle: the corner radius from the missing area
    rc = min(hw, hh) if fill < 0.8 else float(np.sqrt(max(0, (1 - fill) * 4 * hw * hh / (4 - np.pi))))
    openings.append([wi, round((cxp - wx0) / wp * wm, 4), round((TOP + VIS - (y0 + y1) / 2) / PY, 4), round(hw, 4), round(hh, 4), round(rc, 4)])
json.dump({'note': 'Ressonància entrance (studio 25-11, Beltrán): the stones DRAWN in his «Finales/Mosaico.png» (7196 x 1094; rows 91–1003 = the 3.75 m on screen), '
           'one polygon each — crumbs joined, stones over 10 cm cut into ~7 cm along their own shape; they run on across the corners and the P3 → P4 seam. '
           'stones: [wall P4 P1 P2 P3 (of the centre), centre x m from that wall\'s left, y m from the floor, equivalent radius m, On rgb, OFF rgb (linear), '
           'outline relative to the centre in mm (x, y, …, counter-clockwise; x may run past the wall\'s edge into the next)]. '
           'openings: [wall, centre x m, centre y m, half width m, half height m, corner radius m] (the picture\'s transparent parts). '
           'mosaic-on.jpg / mosaic-off.jpg: the picture and its rest state (rows as above).',
           'image': [W, H, TOP, VIS], 'walls': [list(w) for w in WALLS], 'openings': openings, 'stones': stones}, open(OD + '/story-stones.json', 'w'), separators=(',', ':'))
night = np.array([10, 18, 48.0])
for nm, img in (('mosaic-on.jpg', ON), ('mosaic-off.jpg', OFF)):
    q = img.copy(); q[HOLE] = night; Image.fromarray(q.astype(np.uint8)).save(OD + '/' + nm, quality=88, subsampling=0)
d = 2 * np.array([s[3] for s in stones]) * 100
print('seam joins', joined, 'stones', len(stones), 'dropped', dropped, 'diam cm', np.percentile(d, [5, 25, 50, 75, 95]).round(1), 'verts', np.mean([len(s[-1]) / 2 for s in stones]).round(1))
print('openings', openings)
n2 = len(stones); colr = np.array([[s[4], s[5], s[6]] for s in stones]) ** (1 / 2.2) * 255
img = np.where(out_lbl[..., None] >= 0, colr[np.maximum(out_lbl, 0)], night)
e = (out_lbl != np.roll(out_lbl, 1, 0)) | (out_lbl != np.roll(out_lbl, 1, 1)); img[e] = [18, 22, 48]
Image.fromarray(img.astype(np.uint8)).save(PREV)
