# Ola «Arte 2» — brief común (24-11, desde las 12:45)

Léelo entero antes de tocar nada. Después lee tu ticket y `ESTUDIO.md` (reglas del estudio).

## 1. Qué pidió Vicente (sus palabras, 24-11)
- «La estética está mucho mejor, funciona bien. Pero creo que puede mejorar, verse aún más pro a nivel 3D, o si no también verse
  más artístico y con una propuesta más identitaria.»
- «Las transiciones creo que pueden ser más fluidas y mejores.»
- «Los textos dejémoslos en español, y agreguémoslos de manera más moderna, una mejor tipografía y con algo de motion graphics…
  los botones e instrucciones pueden ser 3D, más elegantes y modernos.»
- «Tengamos en cuenta las interactividades que sean atractivas en 3D, más que sólo mover partículas. Cosas que sean visualmente
  impactantes y atractivas… como tocar cosas y que caigan, etc. Y luego pensar en movimientos que hagan la sala interesante, me
  gustó la escena en que nos elevamos al cielo… va a generar un efecto interesante en la sala.»
- «La parte de acceso, de entrada… antes del vídeo de intro… tiene que ser algo muy interactivo, libre, muy rico de ver y pro…
  para poder mostrar el despliegue de la sala… y que en esa interactividad se revele el botón de start… y al presionarlo pasamos
  a la intro.»
- «Tratemos de avanzar lo más que podamos hoy. No esperar a mañana o jueves.»
- Aprobó la dirección de `lab/experiments/ressonancia/ARTE-2.md` («trencadís digital»): **léela**. Las referencias están descritas
  allí (§2); las imágenes, en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/images/8.jpg … 14.webp`
  (8 cromo líquido con flores · 9 collage de objetos flotando · 10 torre de fibras y cubos · 11 ciudad de líneas con jardines ·
  12 invernaderos verticales · 13 y 14 habitaciones rotas en píxeles). Míralas.

## 2. Las tres exigencias para TODOS los universos
1. **Más 3D de verdad**: materia física (vidrio con transmisión, cromo, iridiscencia, reflejos), no sólo emisivo + bloom; **tres
   capas de profundidad** (teselas a 0–1 m del muro, el universo a 3–10 m, un fondo lejano); la paleta de tu capítulo según el
   guion de color de ARTE-2 §3 (se acabó el ámbar en todo).
2. **Al menos una interacción FÍSICA e impactante en 3D**, además de las partículas: objetos con masa que la mano toca y que
   **caen, ruedan, se rompen, se balancean, se encienden** (con gravedad, rebote y giro creíbles), con respuesta < 100 ms.
   Tocar tiene que dar ganas de volver a tocar.
3. **Al menos un movimiento de sala**: el mundo entero se mueve alrededor del público (subir, bajar, girar, avanzar), lento y
   suave, sin mareo (aceleraciones suaves; giros ≤ 6°/s; nada de sacudidas). Vicente adora la subida al cielo del Pom. En un CAVE
   mover el ojo = mover el mundo: **mueve el grupo de tu propia parte**, no la cámara (la cámara global es de INT).

## 3. Reglas de esta ola
- **Un solo escritor por archivo.** Mapa de dueños en §5. Si necesitas un cambio en un archivo ajeno, pídeselo al director.
- **Respaldo antes de reemplazar** un archivo grande: `nombre.ARTE2.js.bak` junto a él (no se commitean). Nada se borra.
- **Assets externos permitidos** (Vicente, 24-11): sólo CC0 (Poly Haven, ambientCG) y fuentes OFL (github.com/google/fonts),
  pequeños, dentro de la carpeta de tu parte (`parts/<nombre>/`) con `LICENSE.txt`/`SOURCES.md` (origen, licencia, tamaño).
  Nada de CDN en tiempo de ejecución: todo local. glTF comprimido si puedes. Tope orientativo: 15 MB por parte.
- **Three.js r187** vendorizado (import map de las páginas). Contrato de partes: `scenes3d/PARTS.md`. Sin asignar memoria por frame.
- **Silencio**: ninguna comprobación suena (nunca `LAB_AUDIBLE`).
- **Sólo QA mide fps.** Tú verificas con capturas (`node lab/tools/check.mjs … --shot …`) y sin errores de consola en WebGPU y
  WebGL2 (`renderer: webgl2`). Presupuesto orientativo: en el M1 Max, calidad media ≥ 45 fps-eq; la sala (RTX 6000 Ada) es mucho
  más rápida, así que calidad alta puede ser bastante más cara.
- **Sin commits.** El director commitea al final del día.
- Tu parte debe seguir funcionando **sola** en `res-3d-study/index.html?part=<nombre>` (estado sustituto desde parámetros) y en la
  obra (`res-obra3d/review.html`).
- **Toda palabra visible en español** (las castelleras en catalán). El texto de la guía lo dibuja GUI, no tu parte.

## 4. Hitos (hoy)
| Hora | Qué |
|---|---|
| 13:15 | tu ticket `tickets/T-0NN-<SIGLA>-<tema>.md` escrito (pasos, archivos, punto seguro de corte, cómo volver atrás, prueba) |
| 15:30 | **primera versión visible** en tu página de estudio, con 2–3 capturas en `notas/<SIGLA>.md` y aviso al director (≤ 3 líneas) |
| 18:00 | versión integrada en la obra, sin errores; entregada a QA |
| 20:30 | segunda pasada tras el veredicto de QA |
Si vas antes, avisa: hay más trabajo (ola 2: bajada al amanecer, festa de cromo y vidrio, acta, sonidos de las interacciones nuevas).

## 5. Equipo y dueños de archivos (rutas desde `lab/experiments/`)
| Sigla | Ticket | Archivos que escribe |
|---|---|---|
| ENT | T-026 Entrada, visual (de vuelta de ENT-F, 14:40) | `ressonancia/scenes3d/parts/umbral3d.js` (+ carpeta), `res-3d-study/parts/umbral3d.json` |
| ENT | T-026 Entrada: partitura y sonido | `ressonancia/score.js` (bloque `wait` y lo mínimo para el botón revelado) **y su copia idéntica** `ressonancia-sound/score.js`, todo `ressonancia-sound/` (sonidos de la entrada, voz en español por defecto) |
| GUI | T-027 Texto y botones 3D | `ressonancia/scenes3d/guide3d.js`, `ressonancia/scenes3d/typo3d.js` (nuevo), `ressonancia/scenes3d/fonts/`, `parts/introtext.js`, `parts/actatext.js` (+ sus .json), `res-obra3d/review.html` |
| INT | T-037 Render y teselas (de vuelta de RND-F, 14:40) | `ressonancia/scenes3d/room3d.js`, `PARTS.md` |
| INT | T-028/T-034 Integración, cámara, intro | `res-obra3d/experience.js`, `parts/atmos.js`, `parts/plaza.js`, `parts/castell.js`, `res-obra3d/NOTES.md`, `res-3d-study/` (salvo los .json de otros) |
| 3D-BR | T-029 Brasa sobre cromo líquido | `parts/brasa3d.js` (+ carpeta, .json) |
| 3D-BR | T-033 Coronación y ressonància (de vuelta de FES-F, 14:40) | `parts/festa3d.js` (+ carpeta, .json) |
| 3D-PI | T-030 Pinya de puntos y fibras · T-036 la caída | `parts/pinya3d.js`, `parts/pinya3d/` (+ .json) · `parts/fall3d.js` (+ .json) |
| 3D-PO | T-031 Pom: ciudad de líneas y la subida · T-035 bajada al amanecer | `parts/pom3d.js` (+ carpeta, .json) · `parts/baixada3d.js` (+ carpeta, .json) |
| 3D-FE | T-032 Tronc (de vuelta de TRO-F, 14:40) | `parts/tronc3d.js` (+ carpeta, .json) |
| 3D-FE | (Tronc entregado a TRO-F) | — |
| QA | veredictos | `notas/QA.md` y sus herramientas en el scratchpad |
Todos: tu `notas/<SIGLA>.md` y tus filas de `TABLERO.md`.

## 6. Contratos entre piezas (léelos si te tocan)
- **El botón de inicio revelado (ENT ↔ GUI ↔ INT).** La partitura expone en el bloque `wait`: `state.reveal` (0..1, cuánto se ha
  revelado el botón por la interacción del público) y `state.start` (0..1, el anillo de inicio llenándose). El pase sólo puede
  empezar con `reveal >= 1`. ENT decide la regla (qué interacción revela y cuánto), GUI dibuja el botón según `reveal` (aparece
  ensamblándose) y `start`; la parte `umbral3d` puede además dibujar la revelación en su mundo (p. ej. las piezas se juntan donde
  aparecerá el botón). Posición del botón: la de siempre (centro de cada muro, 1,25 m) salvo que ENT y GUI acuerden otra vía el
  director.
- **Movimiento de sala.** Cada parte mueve su propio mundo. INT es dueño de la cámara global (el ojo) y del movimiento durante las
  transiciones.
- **Transición por teselación (INT).** INT compone la imagen saliente y la entrante en pantalla con teselas; las partes siguen
  recibiendo `arrive`/`leave` y deben seguir haciéndolos bonitos, pero más cortos o más sutiles si INT lo pide.
- **Eventos de la parte para el sonido** (ola 2): si tu interacción física necesita sonido (impactos), anota en tus notas qué
  eventos emitiría (`'fx:impact'` con muro, u, fuerza) — el canal lo diseña ENT.

## 7. Reglas añadidas durante la ola
- **13:40 · `entregado` sólo cuando dejas de editar.** QA encontró tres errores de archivos a medio escribir porque se seguía editando
  después de marcar `entregado`. Si vuelves a tocar el archivo, pon la fila otra vez en `en curso` y avisa.
- **13:40 · Ventana de GPU-MEDICIÓN 15:40–16:00** (QA mide). De 15:40 a 16:00 nadie abre `check.mjs`: se trabaja en código.
- **13:45 · Dos zonas tranquilas en el centro de cada muro** (ARTE, biblia §4): texto (±1,6 m × 1,75–2,2 m) y botón (±0,9 m × 0,9–1,6 m):
  detrás, nada por encima del 35 % de luminancia. La placa del texto se queda al 60 %: la lectura se arregla en el fondo, no con placa.
