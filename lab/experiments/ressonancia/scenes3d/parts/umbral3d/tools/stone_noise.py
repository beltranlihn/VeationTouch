# umbral3d — the stones' per-pixel detail BAKED (studio 26-11, OPTIMIZAR-60FPS: four 3D noises a pixel were ~60 % of the mosaic's GPU
# time). One tileable texture covering the same 1 / STONE_SCALE m (= 0.1818 m) as stone-detail.png, sampled with the same per-stone
# plane coordinates, holding what umbral3d.js computed every frame with mx_noise_float at the same frequencies:
#   R  grain   0.6·n(260/m) + 0.4·n(70/m), stored ·0.5 + 0.5           (was TSL.mx_noise_float(gp·260)·0.6 + (gp·70)·0.4)
#   G  veins   smoothstep(0.06, 0, |n(38/m)|)                            (was ·0.16 in the shader: kept there)
#   B  mottle  smoothstep(−0.25, 0.55, n(11/m))
# n = band-limited periodic noise with Perlin-like spectrum and spread (std 0.25), whole cycles per tile so it tiles exactly.
#   python -I stone_noise.py <out.png>
import sys, numpy as np
from PIL import Image
N, TILE = 768, 1 / 5.5
rng = np.random.default_rng(26)
fx = np.fft.fftfreq(N)[:, None] * N; fy = np.fft.fftfreq(N)[None, :] * N          # cycles per tile
fr = np.sqrt(fx * fx + fy * fy) + 1e-9
def noise(per_m):                                                                    # a Perlin-like octave: a band one octave wide round f
    f = max(1.0, round(per_m * TILE))
    k = np.exp(-((np.log(fr) - np.log(f)) ** 2) / (2 * 0.35 ** 2))
    n = np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * k).real
    return n / n.std() * 0.25
ss = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
grain = 0.6 * noise(260) + 0.4 * noise(70)
veins = ss(0.06, 0.0, np.abs(noise(38)))
mott = ss(-0.25, 0.55, noise(11))
img = np.stack([np.clip(grain * 0.5 + 0.5, 0, 1), veins, mott, np.ones_like(mott)], -1)
Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA').save(sys.argv[1], optimize=True)
print('grain', grain.min().round(2), grain.max().round(2), 'veins mean', veins.mean().round(3), 'mott mean', mott.mean().round(3))
