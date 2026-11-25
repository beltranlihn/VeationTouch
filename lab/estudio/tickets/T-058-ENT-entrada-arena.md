# T-058 · Entrada «arena y vidrio» (bloque `wait`) — brief de arte

25-11-2026 · director · pedido de Vicente, parte por parte, empezando por la entrada:

> «Los arcos pueden ser más elegantes y 3D. La visual en general puede ser un poco más detallada y los azulejos más pequeños, para
> que al interactuar desde cerca se vean mejor. El botón con la mano, hay que dejarlo mucho más moderno y elegante. Tipo liquid
> glass, y con la estética de la última página con los skills que te mandé [Saltmere]. El espacio amplio que está en el fondo puede
> ser más color arena pastel.»

Referencias (12 imágenes): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/refs-entrada/ref01…ref12.webp`
— 01 trencadís en bandas (ámbar, verde agua, cobalto, juntas blancas) · 02 trencadís fino con medallones de cerámica · 03 arcos
orgánicos de mosaico, cielo azul y desierto de arena · **04 bóvedas de piedra arena con incrustaciones de trencadís, gente en un
suelo de terrazas: la referencia principal del espacio** · 05 patio Gaudí, bordes blancos redondeados que enmarcan mosaico ·
06 escamas cerámicas (Casa Batlló) · 07–08 hexágonos de papel en relieve, pasteles · 09–10 conos cerámicos pasteles · 11 hexágonos
verdes · 12 muro cinético de cubos. Saltmere: `lab/experiments/ressonancia/refs/saltmere/*.md` y `ARTE-3.md`.
Estado actual: `lab/estudio/album3/01-wait-idle.png`, `02-wait-revealed.png` (oscuro, piezas grandes y toscas, arcos planos dorados).

## Dirección

**De noche a mediodía de arena.** La entrada deja de ser un hueco negro con astillas: es un **santuario de cerámica a pleno día
suave**. Aire claro, luz cálida y difusa, sombras suaves, sin negro puro. Contención Saltmere: un acento, mucho aire, gráfica fina.

1. **El espacio del fondo** (lo que se ve por los arcos y por encima de la serpentina): **arena pastel**. Cielo de degradado
   cremoso (`#F3E6D3` arriba → `#E9D2B4` en el horizonte → `#D9BC98` en el suelo lejano), bruma cálida, terrazas/dunas suaves
   de arena a lo lejos (ref 04 y 03), quizá un par de bóvedas lejanas en piedra arena. Nada de estrellas, ni fondo azul noche,
   ni brasas. El fondo nunca compite con el primer plano: bajo contraste, alto valor.
2. **Los arcos** (los cuatro umbrales): de cinta dorada plana a **arquitectura**. Arco parabólico de Gaudí con **volumen real**:
   intradós profundo (30–50 cm de grosor), borde redondeado de **piedra/estuco arena-blanco** (ref 04, 05) que enmarca el mosaico,
   con un filete fino de trencadís dorado o una banda de mosaico en el intradós (ref 01). Que se lea a 5–10 m: luz rasante que
   modela la curva, oclusión suave en el interior, sombra de contacto en el suelo.
3. **Los azulejos**: **más pequeños y más detalle**. Hoy hay ~2.500 piezas de 10–60 cm; pasar a **trencadís fino**: la mayoría de
   **3–8 cm** de cara visible, «madres» como mucho de 15–20 cm, juntas finas claras (lechada blanca hueso, ref 01/02), cantos
   biselados que atrapan luz. Orden de 8.000–15.000 piezas (mide: el límite lo pone el presupuesto, ver PASA). Algunos medallones
   redondos de cerámica (ref 02) y zonas de escamas (ref 06) como acento, pocas.
   **Color en reposo**: deja de ser grafito/hueso oscuro → **cerámica clara**: blanco hueso, crema, arena, verde agua muy pálido,
   azul niebla (los pasteles de ref 07–10), esmalte con brillo. **El juego sigue revelando el esmalte saturado** (cobalto, turquesa,
   ocre, naranja, coral: ref 01) — se mantiene la idea «el color aparece donde juega el público».
4. **Detalle de cerca**: el visitante está a 0,3–1 m del muro. Se tiene que ver la junta, el bisel, la variación del esmalte,
   la grieta fina (ya hay un mapa de craquelado: úsalo en las piezas pequeñas también, barato).

## Reparto (un escritor por archivo)

| Ticket | Agente | Archivos | Qué |
|---|---|---|---|
| **T-058** | ENT (Opus) | `scenes3d/parts/umbral3d.js` (+ `umbral3d/` si existe) y **sólo las entradas `wait`** de `PALETTE` y `ENV_PRESETS` en `scenes3d/room3d.js` | fondo arena, arcos 3D, trencadís fino, reposo pastel, anillo de teselas alrededor del botón refinado (piezas finas, como el marco de un medallón, a ras de muro) |
| **T-059** | GUI (Opus) | `scenes3d/guide3d.js` (+ `typo3d.js` si hace falta) | el botón de vidrio líquido, la mano, el progreso, las etiquetas y la tinta del texto del bloque `wait` sobre fondo claro |

Frontera física entre los dos: el vidrio de GUI vive dentro de **r ≤ 0,30 m** alrededor de (centro del muro, 1,25 m); el anillo de
teselas de ENT entre **0,36 y 0,55 m**. Si ENT cambia `RING_R` o `RING_Y`, avisa al director.

## PASA (los dos)

- Captura `check.mjs` del bloque `wait` en reposo y revelado, comparada con ref 04 / 01 / 05: se lee **claro, arena, cerámica fina, arcos con volumen**.
- Toca de cerca (una mano fija): las piezas pequeñas se voltean/caen y se ve el esmalte; respuesta < 100 ms.
- 0, 1 y 4 manos y **L**: sin errores (`"errors":[]`). Costura P3→P4 sin corte.
- Zonas tranquilas (texto ±1,6 m × 1,75–2,2 m; botón ±0,9 m × 0,9–1,6 m) siguen tranquilas: el botón y el texto se leen.
- Rendimiento: nadie mide fps salvo QA; pero no subas el coste de `wait` más de ~1,5× (un InstancedMesh, el pose en vértice, sin
  sombras por pieza). Si las 15.000 piezas cuestan de más, quédate en 8.000.
- Respaldo antes de tocar (`<archivo>.T058.js.bak` / `.T059.js.bak`), `npm run check` en verde, `GUION.md`/`NOTES.md` si cambia algo
  que describen. **No commitear**: el director commitea.
