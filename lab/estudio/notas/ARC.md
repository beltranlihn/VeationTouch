# ARC — notas (T-058 punto 2: los arcos del umbral)

## Estado (25-11, 15:10)
Módulo nuevo `ressonancia/scenes3d/parts/umbral3d/arches.js` → `createArches(ctx, { walls, env, door, depth })` →
`{ object, update(dt, { reveal, start, arrive, leave, push }), dispose, info }`. ENT ya lo monta en `umbral3d.js` (import dinámico,
`door: { A, H, P }`; el módulo acepta mayúsculas y minúsculas). Sin errores en WebGPU ni WebGL2 (0 y 4 manos). `npm run check` verde.
No he tocado `umbral3d.js`.

## Qué es
- Un perfil barrido a lo largo de la curva de la puerta de umbral3d (`y = H·(1 − |x/A|^P)` sobre el muro), proyectada desde el ojo a
  0,62–1,02 m tras cada muro: visto desde el centro, el canto interior trasero ES la puerta (3,5 cm por dentro) y el rim tapa el
  corte irregular del mosaico.
- Perfil (40 cm de fondo): canto trasero redondo r 2 cm · intradós abierto 15° hacia la sala · banda de trencadís de 22 cm (teselas
  Voronoi de ~3 cm, junta hueso 2,8 mm, bandas en chevron cobalto / aqua / ámbar / jade, ref 01) · bocel de oro de 1,5 cm (#C9A45C,
  metal 0,6, el único metal) · rim de estuco con canto r 5,5 cm y 16 cm de frente (ref 05) · retranqueo y segundo canto r 3 cm.
- Estuco arena (#C9AE8E → #F6EEE0 alrededor de #EADBC4), rugosidad 0,86, Perlin a dos escalas (manchas ~15 cm, grano ~6 mm, bump
  ≤ 1 mm por derivadas de pantalla), AO horneado en el intradós, en la esquina del retranqueo y hacia el suelo; suelo de valor
  #8A6F58. Sombra de contacto suave bajo cada pie.
- Vida: en reposo la banda es pastel (azul niebla, aqua pálido, oro arena, jade pálido); con `reveal` toma su esmalte; un brillo lento
  la recorre cada 18 s; los cantos del rim recogen la luz de las manos (`room.flash`, ×0,09). En la clave (detrás del texto, muro
  > 1,5 m) la banda pasa a hueso/crema.
- `arrive` / `push` / `leave`: los arcos crecen desde el suelo y entran 2,8·push m hacia la sala, como hacían los `frames`.

## Coste
1 malla para los 4 arcos (≈57k triángulos, 29k vértices, un material) + 1 malla de sombras (16 tri): 2 draw calls por cámara de muro.
Sin luces nuevas, sin texturas, sin sombras, nada por frame salvo 6 uniforms. Fragmento: Voronoi 3×3 + 2 Perlin + bump.

## Medidas reales (vs ARTE-ENTRADA)
La puerta de ENT hoy: **1,80 m de luz × 1,95 m de alto en el plano del muro** (A 0,9, H 1,95, P 4,5: una superelipse de hombros
redondos, proporción 1,08, no una parábola 1,6). El arco físico, a ~1 m tras el muro: ≈ 2,2 m de luz × 2,05 m. Si ENT cambia a la
proporción del spec (p. ej. A 0,75, H 2,4, P 2), el arco la sigue solo: lee `door`. Ojo: una clave a 2,3–2,5 m entra de lleno en la
zona del texto (1,75–2,2 m); por eso la banda va a hueso arriba.

## Capturas
`album3/a1-arch.png` (tira), `album3/a2-arch-close.png` (P1 a escala 1).

## Riesgos
- ENT lo carga con `import()` dinámico: el material compila en el primer frame que se ve (PARTS.md «no first-frame work»).
- El azul pastel tira a lavanda bajo la luz cálida; el aliasing de la junta a escala 0,5 se compensa promediando (16 % de junta).

## Ronda 2 (25-11, 15:45) — respaldo `parts/umbral3d/arches.T058b.js.bak`
- Sigue la puerta nueva de ENT (A 0,725 · H 1,95 · P 2,2: casi catenaria, base 1,45 m) sin tocar nada: verificado en captura. El módulo
  acepta además `door.f(x)` (la función exacta del corte) o `type: 'catenary'`.
- Banda: teselas Voronoi de 2–4 cm con junta #F2EBDD de ≥ 1 px y bisel oscuro por pieza (se leen piezas, no camuflaje); ~70 % paleta de
  reposo (hueso, crema, arena, verde agua, azul niebla, salvia) y ~30 % esmalte en tres hilos finos a lo largo del arco (aqua, cobalto
  ralo, ámbar). Sin morado: era el suelo de valor aplicado por canal (max con #8A6F58 → malva); ahora es un suelo de luminancia.
- AO: intradós −38 % hacia el canto trasero (≈ #C9AE8E); sombra de contacto de 30 cm (0,62 de opacidad en el pie).
- Bocel de oro Ø 1,8 cm, 1 cm saliente, con brillo propio donde mira a la luz principal: se ve como oro a escala de sala.
- Pie: zócalo de 9 cm (el perfil se hincha 2,4 cm con escocia suave) y enterrado 5 cm. Derrame del intradós 20° (antes 15°).
- Coste: 2 draw calls, ~64k triángulos. Sin errores en WebGPU ni WebGL2 (4 manos). `npm run check` verde.
- Riesgo para ENT: con la puerta nueva, a 1,25 m el hueco interior del arco mide ±0,42 m y el anillo de teselas llega a 0,48 m: el
  anillo (en el plano del muro, delante) pisa las jambas unos 6 cm por lado.

## Ronda 3 (25-11, 16:00) — arco frontal; respaldo `parts/umbral3d/arches.T058c.js.bak`
- `frontal: true` (por defecto): el fondo del arco sigue los rayos del ojo (el intradós se ve de canto: sin lados que se alejan), la
  cara de estuco queda de frente a la vista y la banda de trencadís pasa a esa cara (15 cm, teselas de 2–4 cm que ahora se leen como
  piezas; aqua junto al hueco, ámbar fuera, cobalto ralo en medio), y el bocel de oro va entre el canto interior y la banda. La curva
  de referencia es el canto interior delantero: el pie de la puerta (y = 0 en el muro) cae en el suelo justo detrás del muro, así que
  los pies quedan en el borde inferior del muro (zócalo + 5 cm enterrado). Sombra de contacto delante del pie.
- Parámetros para ENT: `depth` (m tras el muro de la cara delantera; 0,12 por defecto en frontal), `thickness` (0,40), `door` (A/H/P o
  `f(x)`). `frontal: false` vuelve al arco de la ronda 2.
- Capturas con la puerta T-058b de ENT (A 0,725 · H 1,95 · P 2,2; ENT todavía no ha cambiado la puerta): `album3/a1-arch.png`,
  `a2-arch-close.png`. Sin errores en WebGPU y WebGL2 (4 manos); ≈55k triángulos, 2 draw calls; `npm run check` en verde.
- Pendiente: recapturar cuando ENT pase la profundidad y el plano nuevos de la puerta.
