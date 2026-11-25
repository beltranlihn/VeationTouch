# Fonts of the 3D work (typo3d.js)

| File | Family | Licence | Source | Size |
|---|---|---|---|---|
| InstrumentSerif-Regular.ttf | Instrument Serif (titles) | SIL OFL 1.1 (`OFL.txt`) | github.com/google/fonts › ofl/instrumentserif (24-11-2026) | 70 KB |
| InstrumentSerif-Italic.ttf | Instrument Serif Italic (the values on the chapter cards) | SIL OFL 1.1 (`OFL.txt`) | idem | 72 KB |
| geist-400.woff2, geist-500.woff2 | Geist (instructions) | SIL OFL 1.1 (`Geist-OFL.txt`) | copied from the repo's `ui/fonts/` (licence `licenses/Geist-OFL.txt`) | 13 KB each |

Loaded locally with `FontFace` (no network at run time). The signed-distance-field atlas is built from them at load by
`typo3d.js` (own code: a two-pass Euclidean distance transform, Felzenszwalb & Huttenlocher 2012 — the method tiny-sdf uses).

| geistmono-400.woff2 | Geist Mono (labels and data: `II · PINYA`, `P1`, `1,25 m`; T-048) | SIL OFL 1.1 (`GeistMono-OFL.txt`) | github.com/vercel/geist-font › fonts/GeistMono/webfonts/GeistMono-Regular.woff2 (24-11-2026); licence from github.com/google/fonts › ofl/geistmono/OFL.txt | 50 KB |
