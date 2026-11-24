#!/usr/bin/env bash
# LAB ONLY — «álbum 3» (24-11, after the interaction plan's 7 steps; medium quality, 6 people) — from «álbum 2» of Ressonància 3D (wave «Arte 2», 24-11): the NEW work at its key moments, from res-obra3d/review.html with the
# virtual audience (people=6): wait (idle + revealed), intro (square at rest + mid-tear), every chapter in play, every transition
# mid-tile, crown, festa at high resonance, baixada, fall (intent + carregat), acta. Plus a contact sheet (album2/00-contact.png).
# Each capture: the review's two-row strip (P4 · P1 above, P2 · P3 below), 1600 px wide, PNG ≤ 2 MB, lab/estudio/album2/NN-name.png.
# Usage:  bash lab/estudio/album/make-album2.sh [only-these-names…]      e.g. … 03-intro-rest t-brasa-pinya
#         bash lab/estudio/album/make-album2.sh --sheet                   only rebuild the contact sheet
# One hidden check window per capture (silent, ≤ 15 s). Do not run it during a GPU-MEDICIÓN freeze. INT 24-11.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; OUT="$ROOT/lab/estudio/album3"; TMP="${TMPDIR:-/tmp}/res-album3.$$"; mkdir -p "$TMP" "$OUT"
cd "$ROOT"
# name | block to jump to | JS run right after the jump (o = __obra, S = score.state, w = sleep) | seconds before the capture | extra query
SKIP='o.tr.t = 99;'   # end the tile transition of the jump itself at once (the shot is about the block, not the crossing)
SHOTS=(
  "01-wait-idle|wait|$SKIP|2.5|&people=1"
  "02-wait-revealed|wait|$SKIP S.reveal = 1;|3"
  "03-intro-rest|intro|$SKIP S.t = 32;|3"
  "04-intro-tear|intro|$SKIP S.t = 49;|2.5"
  "05-brasa|brasa|$SKIP|7"
  "06-pinya|pinya|$SKIP o.score.times.pinya.hold = 1e9; S.t = 20; S.tp = 14; S.phase = 'play'; S.fill.fill(0.9);|8"
  "07-tronc|tronc|$SKIP S.t = 60; S.tp = 54; S.phase = 'play'; S.floors = 7; S.floorProgress = 0.6;|8"
  "08-pom|pom|$SKIP|9"
  "09-crown|crown|$SKIP S.t = 9;|7"
  "10-festa-resonance|festa|$SKIP S.t = 40; S.resonance = 1;|8"
  "11-baixada|baixada|$SKIP|6"
  "12-fall-intent|fall||6"
  "13-fall-carregat|baixada|$SKIP o.score.times.baixada.empty = 2.5; await w(1200); const st = window.__labRoom.stage; st.put = () => {}; for (let i = 0; i < 15; i++) for (const k of ['a', 'b']) st.lift('auto' + i + k); for (let i = 0; i < 100 && S.block !== 'fall'; i++) await w(100);|1.2|&params=%7B%22pace%22%3A3%7D"
  "14-acta|acta|$SKIP S.t = 1;|7"
  # the new verbs (PLAN-INTERACCION): each chapter in play with the virtual audience
  "v1-brasa-call|brasa|$SKIP S.t = 10; S.tp = 4; S.phase = 'play';|7"
  "v2-pinya-packing|pinya|$SKIP o.score.times.pinya.hold = 1e9; S.t = 20; S.tp = 14; S.phase = 'play'; S.fill.fill(0.7);|6"
  "v3-tronc-lift|tronc|$SKIP S.t = 40; S.tp = 34; S.phase = 'play'; S.floors = 4; S.floorProgress = 0.5;|7"
  "v4-pom-still|pom|$SKIP S.t = 20; S.tp = 14; S.phase = 'play';|6"
  "v5-aleta|pom|$SKIP S.t = 60; S.phase = 'aleta'; S.tp = 0;|3"
  "v6-festa-echo|festa|$SKIP S.t = 20;|7"
  "v7-baixada-lower|baixada|$SKIP S.t = 8;|5"
  # transitions, mid-tile (~1.6 s after the change; the wave's peak)
  "t1-wait-intro|wait|$SKIP await w(2500); o.score.jump('intro');|1.6"
  "t2-intro-brasa|intro|$SKIP S.t = 40; await w(1800); o.score.jump('brasa');|2.1"
  "t3-brasa-pinya|brasa|$SKIP await w(4000); o.score.jump('pinya');|2.1"
  "t4-pinya-tronc|pinya|$SKIP S.t = 20; S.tp = 14; S.phase = 'play'; S.fill.fill(0.9); await w(4000); o.score.jump('tronc');|2.1"
  "t5-tronc-pom|tronc|$SKIP S.t = 60; S.tp = 54; S.phase = 'play'; S.floors = 7; await w(4000); o.score.jump('pom');|2.1"
  "t6-pom-crown|pom|$SKIP await w(4000); o.score.jump('crown');|2.1"
  "t7-festa-baixada|festa|$SKIP await w(4000); o.score.jump('baixada');|2.1"
  "t8-baixada-fall|baixada|$SKIP await w(4000); o.score.jump('fall');|1.2"
  "t9-fall-acta|fall|$SKIP await w(4000); o.score.jump('acta');|2.1"
)
want=" $* "
if [ "${1:-}" != "--sheet" ]; then
for row in "${SHOTS[@]}"; do
  IFS='|' read -r name block js wait query <<< "$row"
  if [ $# -gt 0 ] && [[ "$want" != *" $name "* ]]; then continue; fi
  pre=""
  if [ "$name" = "12-fall-intent" ]; then pre="S.outcome = 'intent'; S.floors = Math.max(S.floors, 6);"; fi   # intent: the castell falls before the crown
  cat > "$TMP/e.js" <<JS
const w = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await w(100);
await w(400); document.getElementById('start')?.click(); await w(300);
const o = window.__obra, S = o.score.state;
${pre}
o.score.jump('${block}');
await w(300);
${js}
await w(${wait} * 1000);
return JSON.stringify({ block: S.block, t: Math.round(S.t * 10) / 10, tiles: o.tr.on ? +o.room.tiles.mix.value.toFixed(2) : null, outcome: S.outcome });
JS
  rm -f "$TMP/raw.png"
  res=$(node lab/tools/check.mjs "/experiments/res-obra3d/review.html?people=6&from=wait&demo=0&q3=medium${query:-}" --delay 300 --eval-file "$TMP/e.js" --shot "$TMP/raw.png" --size 1800x900 2>&1 | tail -1)
  errs=$(echo "$res" | grep -o '"errors":\[[^]]*\]' | cut -c1-160); r=$(echo "$res" | grep -o '"result":.*' | cut -c1-140)
  if [ -f "$TMP/raw.png" ]; then
    python3 - "$TMP/raw.png" "$OUT/$name.png" <<'PY'
import sys, os
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB').crop((96, 8, 1704, 834)); im = im.resize((1600, round(im.size[1] * 1600 / im.size[0])), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)
if os.path.getsize(sys.argv[2]) > 2_000_000: im.quantize(256).save(sys.argv[2], optimize=True)
PY
    echo "$name  $errs  $r"
  else echo "$name  FAILED  $res" | cut -c1-200; fi
done
fi
# the contact sheet: every capture of album2 in name order, 3 per row, labelled
python3 - "$OUT" <<'PY'
import sys, os, glob
from PIL import Image, ImageDraw
out = sys.argv[1]; fs = sorted(f for f in glob.glob(os.path.join(out, '*.png')) if not os.path.basename(f).startswith('00-'))
if not fs: sys.exit(0)
TW = 520; ims = []
for f in fs:
    im = Image.open(f).convert('RGB'); ims.append((os.path.basename(f)[:-4], im.resize((TW, round(im.size[1] * TW / im.size[0])))))
TH = max(i.size[1] for _, i in ims) + 22; cols = 3; rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * TW + (cols + 1) * 8, rows * TH + (rows + 1) * 8), (17, 17, 17)); d = ImageDraw.Draw(sheet)
for k, (n, im) in enumerate(ims):
    x = 8 + (k % cols) * (TW + 8); y = 8 + (k // cols) * (TH + 8)
    sheet.paste(im, (x, y + 20)); d.text((x + 2, y + 4), n, fill=(224, 224, 224))
sheet.save(os.path.join(out, '00-contact.png'), optimize=True); print('contact sheet:', len(ims), 'captures')
PY
rm -rf "$TMP"
