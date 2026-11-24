# T-048 — SIS · El sistema común «elegante y pulcro» (ARTE-3 §1–§3)

Dueño: SIS · Brief aprobado por Vicente: `experiments/ressonancia/ARTE-3.md` §1–§3 (+ refs `ressonancia/refs/saltmere/`) · 24-11.

## Qué
1. **room3d.js**: bloom a la mitad (criterio del florecimiento de DECISIONES 24-11 00:00 intacto: es la luz de la escena, no el bloom);
   sin glitch ni pixel-sorting fuera de la transición de teselas; ayudas documentadas para **la única receta de luz** (principal cálida
   amplia desde arriba, filo frío, relleno bajo) y para el **halo radial suave** detrás del objeto protagonista; **fondo degradado por
   bloque** (nunca negro puro: la versión profunda del color del capítulo, notas/ARTE.md §2) expuesto a partes y host.
2. **La mano es una linterna**: room3d publica cada frame las manos como luces (posición en el plano del muro, radio ~0,9 m, suave)
   como uniforms/API que cualquier material lee; guide3d lo usa ya: filos de anillo, placas de texto y gráfica fina se iluminan cerca de
   una mano, también al otro lado de una esquina.
3. **Capa de gráfica fina** en guide3d (cada muro, 1 px a la resolución de la sala, acento del capítulo al ~40 %): regla vertical con
   marcas en el borde de cada muro (banda 0,9–1,6 m), cruces «+» en las esquinas de la zona de juego, etiquetas mono (`II · PINYA`,
   `P1`, `1,25 m`), rejilla de puntos tenue detrás de las zonas tranquilas (≤ 35 % de luminancia).
4. **Tipografía**: serif de cartelas intacta; familia mono para etiquetas/datos (Geist Mono, OFL, autoalojada); revelado nuevo de
   borroso a nítido palabra a palabra (~60 ms), en lugar del ensamblaje por teselas en las instrucciones.

## Archivos (míos en este ticket)
`scenes3d/room3d.js`, `scenes3d/guide3d.js`, `scenes3d/typo3d.js`, `scenes3d/PARTS.md`, `scenes3d/parts/atmos.js`,
`res-obra3d/experience.js` (sólo el cableado). Notas: `estudio/notas/SIS.md`. Nada de las partes de capítulo (tronc3d, pom3d, pinya3d,
festa3d, baixada3d, brasa3d): si deben adoptar algo, API en PARTS.md y aviso al director.

## Respaldo / volver atrás
`<nombre>.T048.js.bak` (y `PARTS.T048.md.bak`) junto a cada archivo: `cp X.T048.js.bak X.js`.

## Prueba
`node lab/tools/check.mjs "/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0" --shot … --delay …` sin errores en WebGPU
y WebGL2 (`renderer=webgl2`); hoja de contactos antes/después (wait, brasa, pinya, pom, festa, bajada con una mano) en `notas/SIS.md`.
Silencioso, sin medir fps, sin commits. La guía enseña exactamente lo que mide score.js (sólo cambia su aspecto).
