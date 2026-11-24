# FES-F — T-033 · capítulo V: coronación y LA RESSONÀNCIA (festa3d), relevo de 3D-BR

`SPF` = `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/fesf/`
Respaldo de lo recibido (r2 de 3D-BR): `experiments/ressonancia/scenes3d/parts/festa3d.FESF.js.bak` (volver atrás = copiarlo sobre `festa3d.js`).

## 24-11 · entrega a QA — metal líquido de oro blanco que refleja la verbena
**Antes** (`scratchpad/brasa3d/t033/n_board.png`, `SPF/before_r06.png`: media de luma 78 con resonancia 0,6; cromo pardo-negro, manchas
blancas de estudio, mandalas de disco oscuro). **Después**: `SPF/g_board.png` (resonancia 0,05 · 0,6 con dos manos · 1 · en la obra:
coronación 9 s · ressonància 9 s), `SPF/e_sheet2.png` (coronación 6 / 15 / 22 s · WebGL2), `SPF/f_tap_crop.png` (una mano lanza la esfera grande).

Qué cambia (motor intacto: campo de ondas en GPU, arena por compute, línea de tiempo de la coronación, floración, llegada/salida):
- **El metal refleja una VERBENA** (`envT`, procedural, igual en WebGPU y WebGL2): tres guirnaldas de bombillas cálidas (#FFD9A0, alguna
  coral y lila) en catenaria alrededor de la sala, cielo oro pálido arriba, lila abajo, horizonte claro con costura oscura (el mordiente
  del cromo). Sobre el relieve las bombillas se estiran en rosarios de luz. Fuera los paneles blancos de estudio, la bruma roja y el velo pardo.
- **Oleaje propio** del metal (5 ondas de 0,55–3,1 m, periódicas alrededor de la sala, parámetro `swell`): hay metal líquido aunque nadie
  toque; las ondas del grupo se suman. Crestas oro, valles lila; la luz resbala por las pendientes.
- **Zonas tranquilas sin agujero rectangular**: un «remanso» por muro (superelipse 3,6 × 1,7 m alrededor de texto y botón, que se funde en
  ~1 m) donde el metal conserva el relieve en clave baja y lila; el techo de luminancia se aplica en el propio sombreado (placa y arena),
  el velo negro queda al 12 %. Luma media / p95 en estudio: res 0,05 → texto 17–18 / 19–23, botón 17–20 / 25–33 · res 0,6 + 2 manos →
  34–37 / 61–73, 36–40 / 78–93 · res 1 → 58–60 / 78–89, 49–54 / 75–91 (objetivo p95 ≤ 89: en el límite en el botón con manos encima).
- **El mandala es la sala**: uno por muro, centrado en el remanso (el botón queda en su corazón), cada muro su modo (6, 8, 5, 12 pétalos y
  paso de anillo distinto); crece con el orden del grupo (Ø 1,2 → 3,2 m, `U.mr`) y al máximo un friso de Chladni (dos modos cruzados,
  periódico en el perímetro) une los cuatro en una figura continua. Arena de oro HDR en las líneas nodales; el metal bajo la figura es oro más hondo.
- **Esferas con jerarquía** (por muro: 1 de Ø 0,6 m con su aro de oro, 2 de Ø 0,3 m, 10 cuentas; fuera de las zonas tranquilas): cada
  toque lanza siempre la esfera grande más cercana de ese muro (y todo lo que esté a < 0,75 m), en arco y girando; cae, bota (0,6), abre
  un anillo en el campo y **salpica** las cuentas de alrededor; **estela de arena** bajo la esfera en vuelo; sombra de contacto en la placa.
  `fx:impact` igual que antes (`'chrome'`, `'hit'`, ≤ 16/s).
- **La luz sube** con la resonancia (`ceil` 2,5 m → techo) y el nivel del metal 0,8 → 1. **Floración** (una por pase): medida en estudio
  (`SPF/bloom.js`, res 0,9): luma media 104 → baja a 50 (la grieta) → 145 a los 5,5 s (≤ ×1,2/s) → 115 a los 7 s; 0,1 % de píxeles a 255.
- **Movimiento de sala**: la fiesta reflejada gira alrededor (1–3,5 °/s según la resonancia), sube y baja despacio (±0,035 de horizonte), la
  parte flota ±7 cm; la nube lejana de esquirlas sigue girando y hundiéndose.
- **Coronación**: destello, apertura por celdas y cáustico dorado como estaban; el metal se queda al 20 % al principio y sube con el
  llenado; la lluvia de oro se retira del remanso. Iconos de corona borrados del código.
- Parámetros nuevos en `res-3d-study/parts/festa3d.json`: `swell` (1), `mandala` (1). `quiet` ahora = fuerza del techo del remanso.

**Comprobado**: sin errores de consola en estudio WebGPU y WebGL2 (`"errors":[]` en todas las capturas) y en la obra
(`review.html?from=festa` → `festa play 9.5 s`, `from=crown` → `crown play`, calidad media). No he medido fps (QA).
**Sin verificar / pendiente**: 15 manos a la vez (sólo probé 2); llegada/salida (`arrive`/`leave`) no recapturadas tras el cambio (código
sin tocar salvo el brillo); el paso completo crown → festa → baixada en la obra; coste: el sombreado de la placa suma ~3 evaluaciones del
oleaje y 3 guirnaldas por píxel, y la arena un bucle de 12 esferas por grano — pedir medición. A resonancia 1 el botón roza el 35 %.
