# ENT-F — notas (T-026, la entrada «umbral»: la parte visual, desde las 13:15 del 24-11)

Relevo a ENT en lo visual (ENT conserva sonido y partitura). Archivos míos: `ressonancia/scenes3d/parts/umbral3d.js` (+ `parts/umbral3d/`),
`res-3d-study/parts/umbral3d.json`, estas notas y las celdas de T-026 en `TABLERO.md`. Respaldo de lo de ENT: `parts/umbral3d.ARTE2b.js.bak`
(volver = copiarlo encima; su v1 sigue en `parts/umbral3d/umbral3d.v1.js.bak`).

## Estado (24-11, 14:00) — ENTREGADO A QA: he dejado de editar
Sin errores de consola en WebGPU ni WebGL2, en el estudio (`res-3d-study/?part=umbral3d`: reposo, 4 manos, 8 manos + LiDAR, revelado,
`arrive`/`leave`) y en la obra (`res-obra3d/review.html`, 6 personas, medium y high/webgl2, espera y salto a la intro).
No he medido fps (sólo QA). No he descargado nada (todo generado; no uso la biblioteca CC0 compartida).
Aprobada por la dirección de arte (ronda 3); sus tres retoques están hechos (clave del arco a 1,95 m, jamba de oro irregular, faro más bajo).

## Antes / después
- Antes (ENT, 13:10): `parts/umbral3d/shots/after-01-idle-strip.png`, `after-02b-play-P2P3.png`, `after-03-revealed-wall-P1.png`.
- Después (ENT-F): `parts/umbral3d/shots/`
  - `f-01-idle-strip.png` — sin manos, la tira de los 4 muros: la serpentina de trencadís en hueso / grafito / espejo, los cuatro umbrales.
  - `f-02-play-P2P3.png`, `f-02b-play-P4P1.png` — 4 manos virtuales: rosetas que toman color por familias, piezas cayendo hacia el público.
  - `f-03-revealed-P4P1.png` — `reveal 1`, `start 0,4`: la sala entera en color, anillos de resonancia, el anillo del botón dentro del umbral.
  - `f-04a-touch-0.35s.png`, `f-04b-touch-1.1s.png` — +0,35 s y +1,1 s tras un toque (piezas en el aire; la roseta ya en color, esquirlas en el suelo).
  - `f-05-webgl2-play-strip.png` — WebGL2, 4 manos.
  - `f-06-obra-wait-6people.png` — en la obra (`res-obra3d/review.html`, 6 personas, medium), con el texto de GUI.
  - `f-07-obra-start-pass-0.9s.png`, `f-08-obra-start-tiles-1.8s.png` — el paso por las puertas al empezar (+0,9 s) y las teselas de INT (+1,8 s).

## Qué es ahora
**La serpentina** (la protagonista): UN muro continuo de trencadís de verdad que da la vuelta a la sala a 5,3–10 m del ojo (el banco de Gaudí
hecho ola: se acerca y se aleja, se inclina sobre el público, se deshace en esquirlas flotantes en la cresta). ~3.300 piezas, ninguna
igual (mosaico de Voronoi sobre la superficie: esquirlas de 10–20 cm en el muro, medianas y 37 «madres» de 40–45 cm con sus pétalos
alrededor: las **rosetas**), cada una una pieza gruesa con chaflán, canto de terracota, cara algo abombada e inclinada 2–4,5°, asentada
en un lecho de mortero `#3A3632` con junta de ≈ 1 cm en el muro. Una sola malla (410 k vértices); una textura flotante de 64×52 lleva
giro, alzada, luz y escala de cada pieza (muelles y olas en CPU, la pose en el vértice). Su imagen invertida bajo un suelo negro
brillante es el reflejo.
- **En reposo:** hueso `#F1ECE2` (bajado para no quemar), grafito `#1A1B20` y ≈ 1/6 de espejo. **El color sólo aparece al tocar**: cada
  pieza da una vuelta ENTERA sobre sí misma (se despega del lecho, gira en el aire y vuelve a encajar en su propio hueco) y su cara pasa a
  esmalte. **Familias por roseta** (una por capítulo, no arcoíris): brasa (naranja/rojo/rojo oscuro), pinya (coral/turquesa/teal), tronc
  (ocre/cobalto/terracota), pom (oro/blanco/azul profundo), amanecer (melocotón/rosa/lila). El color se queda 40–100 s (más cuanto
  más `reveal`): la sala se va coloreando con el juego.
- **Interacciones** (respuesta en el mismo frame):
  1. **Posar la mano** → ola desde el punto (da la vuelta a la sala), el color se extiende por SU roseta desde la mano, y **9 piezas se
     sueltan en espiral** (13 si se toca el corazón de la roseta): saltan hacia el público, caen (0,55 g), rebotan, algunas **se rompen**
     en 5–7 esquirlas, patinan sobre el suelo espejo y a los 3–6 s **vuelven volando a su sitio, ya en color**.
  2. **Mover la mano** → pinta: las piezas bajo ella giran a color; al entrar en otra roseta, esa también se enciende.
  3. **Sostener 0,6 s** → **cascada**: la columna de piezas sobre la mano se suelta en cadena hacia arriba (14 piezas, 0,17 s por metro).
  4. **Varias manos** → donde se cruzan dos frentes de ola las piezas giran y **se les enciende el canto** (iridiscente): líneas de luz
     que se mueven (interferencia).
  5. **`reveal = 1`** → **resonancia**: anillos concéntricos de piezas hueso con el canto encendido, sobre campo de color, que se cierran
     despacio sobre cada botón.
  6. Los **móviles** cercanos (0,3–0,9 m tras el muro, 2 por muro, a los lados: madres de 0,4–0,85 m de espejo, hueso o vidrio + 2–3
     medianas) se balancean, giran, caen y se rompen como antes (código de ENT), y enseñan su esmalte 22 s al tocarlos.
- **Los umbrales:** en el centro de cada muro el mosaico se abre en un arco a escala humana (1,8 m de ancho en la base × 1,95 m de clave;
  `y = 1,95·(1 − |x/0,9|^4,5)`: es lo más estrecho en que cabe el anillo r 0,42), cortado *donde mira el muro*, no en el mosaico: la serpentina gira y sus piezas se pliegan
  al llegar a la puerta y vuelven a crecer al otro lado. Jamba abocinada de teselas de oro rotas e irregulares, puestas de canto (0,7–1,3 m tras el muro) con
  un hilo de brasa en el borde interior. Detrás: noche azul, destellos, la línea de brasa del horizonte. **El anillo del botón flota
  dentro** (centro del muro, 1,25 m; r 0,42; teselas hueso `#F1ECE2` / oro `#F6C65B` con reverso de espejo).
- **Movimiento de sala:** la serpentina gira alrededor del público a 1°/s (en 6 min ha pasado entera por delante de cada visitante), el
  mundo lejano gira al revés (0,63°/s) y respira ±0,3 m; dos luces de faro dan la vuelta a la sala cada 26 s (el brillo recorre los
  cuatro muros). **Al empezar** (`'start'` o cualquier salida del bloque `wait`): **paso radial por las puertas** — el mundo se cierra
  2,8 m alrededor del ojo en 2,5 s con suavizado y las cuatro puertas crecen y pasan por los cuatro muros a la vez. Arranca al cambiar
  de bloque (el `leave` del host espera detrás de las teselas de INT).
- **Sin manos:** cada 2,6–5,2 s una «mano fantasma» toca en algún sitio: florece una roseta (16 s), caen piezas o una cascada; olas
  lentas de brillo recorren el muro; los móviles giran sobre su hilo.
- **Zonas quietas** (biblia §4): texto ±1,6 m × 1,75–2,2 m y botón ±0,9 m × 0,9–1,6 m → el mosaico ahí va ×0,4 de albedo (sombra suave
  alrededor del umbral) y las teselas de la jamba ×0,38 en la banda del texto; ningún móvil cuelga a menos de 1,9 m del centro; sus
  balanceos están limitados (±0,22 rad).
- **Sonido** (canal `fx:impact`, sin cambios de contrato): `hit` al posar la mano / cascada, `floor` en cada rebote, `break` al romperse,
  `hook` al volver a su sitio; `mat` cerámica / cromo / vidrio; muro y `u` por el rayo desde el ojo; ≤ 16 por segundo.

## Para GUI
- Anillo de la parte: r 0,42 m, centro del muro a 1,25 m, 12 cm tras el plano; **hueso `#F1ECE2` y oro `#F6C65B`** (lineal 0,66/0,63/0,57 y
  0,86/0,50/0,09), reverso de cromo. El botón (r ≈ 0,3) queda dentro; detrás hay noche (< 10 % de luminancia).
- Texto: la clave del arco está a 1,95 m y la frase va encima, a 2,12 m, como inscripción del dintel (ya se ve así en la obra,
  `f-06`); el mosaico va ×0,4 de albedo en la caja ±1,6 m × 1,6–2,7 m (vale también para 1,75–2,2 m).

## Para INT / RND
- La parte no toca cámara ni `scene.environment`. **Entorno propio** para sus materiales (`room.captureEnvironment` de una escena
  pequeña: gris plata arriba, oscuro abajo, horizonte cálido fino, paneles suaves — biblia §2 «Espera»); con el `room.envMap` nuevo
  (HDRI, preset `wait` con la mitad inferior teñida de brasa) el hueso se volvía terracota. Si falla, cae a `room.envMap`. En `'start'` mueve su propio mundo (uniforme `uPush`).
- Luces propias: hemisférica, direccional cenital, 2 focos (el faro), 3 puntuales de contraluz brasa (giran con el mundo lejano),
  4 de mano. Siempre las mismas (no cambia el número).

## Para QA (palancas si los fps no llegan; no he medido)
Coste: la serpentina 410 k vértices × 2 (reflejo) × 4 muros, material físico con 11 luces; ~330 instancias sueltas; 380 destellos.
Por orden de ahorro: (1) `heroRefl.visible = false` (quita el reflejo: −50 % de vértices del muro); (2) quitar `rims` y `beam2`;
(3) menos piezas: `fine()` 0,135 → 0,17 (≈ 2.300 piezas).
`window.__study3d.part.debug()` da conteos; `part.touch(muro, x, y)` hace un toque en un punto (sólo para comprobaciones).

## Qué falta
- fps (QA). Escuchar los impactos (nadie; ahora caen ~9 piezas por toque: puede hacer falta bajar el nivel de `floor` en el sonido — ENT).
- Segunda pasada posible: craquelado CC0 en la cara del esmalte (hoy la cara es lisa y abombada), reflejo en el suelo de las piezas
  caídas, que las esquirlas caídas monten el anillo del botón.
- La regla `reveal` y el sonido son de ENT y no los he tocado: con ~9 piezas por toque el canal `fx:impact` va a su tope (16/s) con grupos.
