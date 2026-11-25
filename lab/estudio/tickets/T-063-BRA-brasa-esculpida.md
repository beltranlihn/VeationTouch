# T-063 · Brasa «fuego esculpido» — brief

25-11-2026 · director · pedido de Vicente (después de la entrada, sólo la Brasa):

> «Va muy bien, me gusta la reflexión en el agua, y las brasas; los correfocs pueden ser un poco más detallados y elegantes y 3D,
> pero van bien. Quisiera ver si le podemos dar un elemento más 3D y limpio a la escena en general.» (+ 8 referencias de estética,
> técnica e iluminación)

Referencias: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/refs-brasa/ref01…ref08.webp`
— 01 llama de papel cortado en capas (rojo, naranja, ámbar) sobre negro, con salpicaduras · 02 relieve topográfico en capas gris
carbón con una veta de lava naranja · 03 llamas de papel en capas sobre roca negra perforada · 04 escultura-rosa de llamas en capas
(crema, rojo, ámbar) sobre peana, luz de museo · 05 capas topográficas blancas/naranjas con perforaciones · 06 curvas de nivel
finas que brillan en naranja sobre negro (skill interactive-topography) · 07–08 campos de agujas/partículas densos que forman una
ola de fuego, profundidad de campo.
Estado actual: `lab/estudio/album3/05-brasa.png`, `v1-brasa-call.png` (agua negra con reflejos — SE QUEDA —, brasas, chispas,
diables de partículas, jarrones de cromo, mucho polvo/estrellas, «Tocad el muro»).

## Dirección (el director de arte la precisa en `lab/estudio/ARTE-BRASA.md`)

- **Se queda:** el agua negra con reflejos, el anillo de brasas, las chispas, la interacción (chispa → relevo del diable alrededor
  de la sala → llamada tok-tok-TOK), el sonido.
- **Más 3D y limpio:** fuera el polvo/estrellas de fondo y el ruido; un **elemento escultórico** protagonista: fuego como **capas
  esculpidas** (papel/cerámica cortada, ref 01/03/04) y **relieve topográfico en capas** con veta de lava (ref 02/05), curvas de
  nivel que se encienden (ref 06), quizá un campo de agujas que respira con el calor (ref 07/08). Luz de museo: llave cálida,
  filo, sombras suaves, profundidad de campo sugerida. Contención Saltmere: un protagonista por muro, aire alrededor.
- **Correfocs (diables):** más detallados, elegantes y 3D: figura legible (cuerpo con volumen, no sólo una nube de partículas), la
  forca con las carretillas, llamas en capas que se desprenden del cuerpo, chispas finas.

## Reparto (un escritor por archivo)

| Ticket | Agente | Archivos | Qué |
|---|---|---|---|
| T-063 | BRA (Opus) | `scenes3d/parts/brasa3d.js` (+ `brasa3d/` salvo `diables.js`) | escena: fondo limpio, relieve en capas/curvas de nivel, escultura de fuego en capas, luz; integra `diables.js` al final |
| T-064 | DIA (Opus) | nuevo `scenes3d/parts/brasa3d/diables.js` | los correfocs nuevos, con una API que BRA monta (como `umbral3d/arches.js`) |
| — | ART (Fable) | `lab/estudio/ARTE-BRASA.md` | la especificación con valores, y el juicio de las capturas |

## PASA

- Capturas del bloque `brasa` (reposo, chispa, relevo, llamada) comparadas con las referencias: se lee **esculpido, 3D, limpio**.
- Toda mano recibe respuesta < 100 ms; 0, 1 y 4 manos y **L** sin errores; costura P3→P4 sin corte; zonas tranquilas legibles.
- Coste ≤ el actual (QA mide); sin asignar memoria por frame; WebGPU y WebGL2.
- Respaldos `.T063.js.bak`; `npm run check` en verde; no commitear.
