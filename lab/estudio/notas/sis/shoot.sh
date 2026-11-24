#!/bin/zsh
# usage: shoot.sh <tag> [extra query]   → <tag>-<block>.png
cd "/Users/vicentemanzano/Desktop/INTERACTIVE EXPERIENCES/VeationTouch"
D=/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/sis
for b in ${=BLOCKS:-wait brasa pinya pom festa baixada}; do
  node lab/tools/check.mjs "/experiences/res-obra3d/index.html?demo=0$2" --shot $D/$1-$b.png --delay ${DELAY:-5000} --size 7196x912 --eval-file $D/$b.js | cut -c1-400
done
