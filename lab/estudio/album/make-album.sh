#!/usr/bin/env bash
# LAB ONLY — the album of Ressonància 3D: ONE hero capture per block, from res-obra3d/review.html with the virtual audience (people=6).
# Each capture: the review's two-row strip (P4 · P1 above, P2 · P3 below), 1600 px wide, PNG ≤ 2 MB, lab/estudio/album/NN-block.png.
# Usage (from the repo root or anywhere):  bash lab/estudio/album/make-album.sh [only-these-names…]   e.g. … 05-tronc 08-festa
# How: one hidden check window per capture (silent, ≤ 15 s): click start, score.jump(<block>), optionally set the score's clock /
# floors / outcome to reach the block's best moment, wait, capture. Carregat is played from the baixada (all hands let go). Do not run it during a GPU-MEDICIÓN freeze.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; OUT="$ROOT/lab/estudio/album"; TMP="${TMPDIR:-/tmp}/res-album.$$"; mkdir -p "$TMP"
cd "$ROOT"
# name | block | JS run right after the jump (S = score.state) | seconds to wait before the capture | extra URL query (optional)
SHOTS=(
  "01-wait|wait||2.5"
  "02-intro|intro|S.t = 47;|6.5"
  "03-brasa|brasa||7"
  "04-pinya|pinya|o.score.times.pinya.hold = 1e9; S.t = 20; S.tp = 14; S.phase = 'play'; S.fill.fill(0.9);|8"
  "05-tronc|tronc|S.t = 60; S.tp = 54; S.phase = 'play'; S.floors = 7; S.floorProgress = 0.6;|8"
  "06-pom|pom||9"
  "07-crown|crown|S.t = 9;|7"
  "08-festa|festa||10"
  "09-baixada|baixada||8"
  "10-fall-intent|fall|0|6"
  "11-fall-carregat|baixada|o.score.times.baixada.empty = 2.5; await w(1200); const st = window.__labRoom.stage; st.put = () => {}; for (let i = 0; i < 15; i++) for (const k of ['a', 'b']) st.lift('auto' + i + k); for (let i = 0; i < 100 && S.block !== 'fall'; i++) await w(100);|1.2|&params=%7B%22pace%22%3A3%7D"
  "12-acta|acta|S.t = 1;|7"
)
want=" $* "
for row in "${SHOTS[@]}"; do
  IFS='|' read -r name block js wait query <<< "$row"
  if [ $# -gt 0 ] && [[ "$want" != *" $name "* ]]; then continue; fi
  pre=""; post="$js"
  if [ "$block" = "fall" ]; then pre="S.outcome = 'intent'; S.floors = Math.max(S.floors, 6);"; post=""; fi   # intent: the castell falls before the crown (jump)
  # carregat is played, not jumped: from the baixada everyone lets go, the castell falls with its crown (the score's own rule; its 6 s of emptiness shortened to 2.5 s to fit the 15 s window)
  cat > "$TMP/e.js" <<JS
const w = (ms) => new Promise((r) => setTimeout(r, ms));
while (!window.__obra || !window.__labRoom?.stage) await w(100);
await w(400); document.getElementById('start')?.click(); await w(300);
const o = window.__obra, S = o.score.state;
${pre}
o.score.jump('${block}');
await w(300);
${post}
await w(${wait} * 1000);
return JSON.stringify({ block: S.block, t: Math.round(S.t * 10) / 10, outcome: S.outcome, floors: S.floors });
JS
  res=$(node lab/tools/check.mjs "/experiments/res-obra3d/review.html?people=6&from=wait&demo=0${query:-}" --delay 300 --eval-file "$TMP/e.js" --shot "$TMP/raw.png" --size 1800x900 2>&1 | tail -1)
  errs=$(echo "$res" | grep -o '"errors":\[[^]]*\]'); r=$(echo "$res" | grep -o '"result":.*' | cut -c1-140)
  if [ -f "$TMP/raw.png" ]; then
    python3 - "$TMP/raw.png" "$OUT/$name.png" <<'PY'
import sys, os
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB').crop((96, 8, 1704, 834)); im = im.resize((1600, round(im.size[1] * 1600 / im.size[0])), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)
if os.path.getsize(sys.argv[2]) > 2_000_000: im.quantize(256).save(sys.argv[2], optimize=True)
PY
    rm -f "$TMP/raw.png"; echo "$name  $errs  $r"
  else echo "$name  FAILED  $res" | cut -c1-200; fi
done
rm -rf "$TMP"
