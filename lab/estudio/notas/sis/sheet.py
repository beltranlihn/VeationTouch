import sys
from PIL import Image, ImageDraw
# sheet.py out.png tagA tagB ...  → rows per block, columns per tag
out, tags = sys.argv[1], sys.argv[2:]
blocks = ['wait', 'brasa', 'pinya', 'pom', 'festa', 'baixada']
W = 1800; h = int(W * 912 / 7196)
im = Image.new('RGB', (W * len(tags), (h + 18) * len(blocks)), (20, 20, 22))
d = ImageDraw.Draw(im)
for r, b in enumerate(blocks):
    for c, t in enumerate(tags):
        try: s = Image.open(f'{t}-{b}.png').convert('RGB').resize((W, h), Image.LANCZOS)
        except Exception: continue
        im.paste(s, (c * W, r * (h + 18) + 18)); d.text((c * W + 6, r * (h + 18) + 3), f'{t} · {b}', fill=(220, 220, 220))
im.save(out)
