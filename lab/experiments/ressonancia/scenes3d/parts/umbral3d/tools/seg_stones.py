# Segment the drawn stones of «Finales/Mosaico.png» (7196 × 1094, transparent openings): the grout is a thin LIGHT line → ridge filter,
# watershed from the stones' hearts. Writes lbl2.npy (-1 = opening) and a check crop.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import filters, segmentation, feature, morphology
D = sys.argv[1]; S = sys.argv[2]
IMG = sys.argv[4] if len(sys.argv) > 4 else D + '/Finales/Mosaico.png'   # (the picture: a 4th argument, else «Finales/Mosaico.png»)
im = np.asarray(Image.open(IMG)).astype(np.float64)
rgb, a = im[..., :3] / 255, im[..., 3]
hole = a < 128
L = rgb @ np.array([0.299, 0.587, 0.114])
L[hole] = 0
loc = L - ndi.gaussian_filter(L, 3.0)                                 # lighter than around
rid = filters.sato(L, sigmas=[1.0, 1.6], black_ridges=False)
g = rid / np.percentile(rid[~hole], 99.5) + np.clip(loc, 0, None) * 4
grout = (g > np.percentile(g[~hole], 80)) & ~hole
grout = morphology.remove_small_objects(grout, 12)
dist = ndi.distance_transform_edt(~grout & ~hole)
pk = feature.peak_local_max(ndi.gaussian_filter(dist, 1.0), min_distance=6, threshold_abs=2.5, labels=(~hole).astype(int), exclude_border=False)
mk = np.zeros(L.shape, np.int64); mk[pk[:, 0], pk[:, 1]] = np.arange(1, len(pk) + 1)
lbl = segmentation.watershed(-dist + g * 3, mk, mask=~hole)
lbl = lbl.astype(np.int64) - 1; lbl[hole] = -1
np.save(D + '/lbl2.npy', lbl.astype(np.int32))
n = lbl.max() + 1; cnt = np.bincount(lbl[lbl >= 0], minlength=n)
d = np.sqrt(cnt / np.pi) * 2 / 255 * 100
print('stones', n, 'diam cm', np.percentile(d, [5, 25, 50, 75, 95]).round(1))
x0, y0 = 700, 550
crop = lbl[y0:y0 + 300, x0:x0 + 500]; img = (rgb[y0:y0 + 300, x0:x0 + 500] * 255).copy()
e = (crop != np.roll(crop, 1, 0)) | (crop != np.roll(crop, 1, 1)); img[e] = [0, 255, 255]
Image.fromarray(img.astype(np.uint8)).resize((1000, 600), Image.NEAREST).save(S + 'seg-zoom.png')
