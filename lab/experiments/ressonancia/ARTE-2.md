# Ressonància — arte 2: más 3D, más identidad (propuesta para aprobar)

24-11-2026 · Vicente, con Claude · sobre el álbum de anoche (`lab/estudio/album/`) y las 7 referencias nuevas.

## 1. Diagnóstico honesto del álbum

Lo que funciona: cada capítulo tiene su lógica, la obra es continua y la fragmentación ya es la firma.

Lo que todavía no es «pro» ni propio:

1. **Una sola paleta en toda la obra.** Ámbar y oro sobre negro de la espera al acta. Diez minutos del mismo color cansan, y los
   universos no se distinguen tanto como dice el guion.
2. **Tres capítulos en la misma plaza.** Tronc, Pom (al empezar) y bajada se ven como la plaza de noche de la intro: el público
   siente que vuelve al mismo sitio.
3. **Materiales pobres.** Casi todo es emisivo con bloom: brilla, pero no hay vidrio, cromo, reflejos, refracción ni iridiscencia.
   Es eso lo que hace que una imagen 3D parezca de Unreal o de Blender.
4. **Todo a una sola profundidad.** Las cosas viven en una franja a 4–8 m del muro. Falta primer plano (fragmentos casi en el
   muro), plano medio y fondo lejano: la sensación de volumen nace de esas capas.
5. **El texto y los botones son interfaz.** Mayúsculas en una sans con resplandor y anillos planos: se leen, pero parecen un HUD,
   no parte de la obra.
6. **Las transiciones son locales.** Cada parte se va a su manera mientras la otra llega; no hay un gesto común que atraviese la
   sala entera, y por eso se notan los cortes.

## 2. Lo que dicen las referencias

| | Referencia | Lo que tomamos |
|---|---|---|
| 1 | Arquitectura de cromo líquido con flores | **materia física**: cromo, vidrio, reflejos; lo orgánico (flores, enredaderas) creciendo sobre lo duro |
| 2 | Collage de objetos flotando sobre negro | **la torre como ensamblaje vertical** de objetos heterogéneos (roca, esferas de cromo, escaleras, malla, humo) con paneles rectangulares de textura |
| 3 | Torre de fibras, puntos y cubos de datos | **la torre como organismo**: un eje vertical del que salen fibras y raíces; nubes de puntos turquesa y coral |
| 4 | Ciudad de líneas de circuito con jardines luminosos | **la ciudad como dibujo de líneas**, vertical, negra, con vegetación que brilla |
| 5 | Invernaderos verticales en collage | color **pastel de amanecer**, vidrio, tuberías, el *pixel sorting* como veladura |
| 6, 7 | Habitaciones rotas en píxeles y bloques | **la memoria de un lugar que se rompe en teselas**, con fugas de luz iridiscente |

Tres hilos comunes: **torres hechas de fragmentos**, **materia física y brillante (cromo, vidrio, iridiscencia)** y **lo digital
que rompe la imagen en teselas** (píxeles, bloques, bandas).

## 3. La propuesta: «trencadís digital»

Gaudí rompía cerámica y la volvía a juntar en otra forma; el *glitch* de las referencias rompe la imagen en teselas y la reordena.
**Es el mismo gesto.** Ese es el sello que ninguna otra obra tiene: Barcelona y lo digital en una sola idea.

- **El mundo entero está hecho de teselas.** Cada universo puede romperse en piezas (de cerámica, de cromo, de píxel) y la
  resonancia del grupo las vuelve a juntar. La fragmentación deja de ser sólo la transición: es la materia de la obra.
- **El castell es un ensamblaje vertical** (refs. 2 y 3): no una torre de cuerpos literal, sino una torre de fragmentos de la
  ciudad (trencadís, balcones de hierro, esferas de cromo, flores, fuego, cuerpos de puntos) que el grupo apila piso a piso.
- **Un guion de color**, como en cine: cada capítulo con su paleta, y un arco de la noche al amanecer.

| Bloque | Paleta | Materia |
|---|---|---|
| Espera | negro, un hilo de brasa | una sola tesela de cromo que gira en el vacío |
| Intro | azul noche, ámbar de farol | la plaza que se rompe en teselas de píxel e iridiscencia (refs. 6, 7) |
| I. Brasa | rojo y naranja sobre **cromo líquido** | el fuego del correfoc reflejado en un suelo de metal líquido que ondula con cada mano (ref. 1) |
| II. Pinya | **turquesa y coral** | cuerpos de **nube de puntos y fibras** (ref. 3): raíces que unen a la multitud y crecen hacia cada mano. Adiós al maniquí |
| III. Tronc | terracota, esmalte, cromo | **la torre-ensamblaje** (ref. 2) sube en el vacío: cada piso, un fragmento distinto de la ciudad |
| IV. Pom | blanco línea sobre negro, jardines dorados | **el Eixample como dibujo de circuito** (ref. 4): la sala sube por un cañón de líneas con azoteas que florecen |
| V. Coronación + ressonància | oro, blanco, iridiscencia | una placa de **cromo y vidrio** que resuena; la arena de oro dibuja las figuras; al máximo, *pixel sorting* en bandas |
| Bajada | **pastel de amanecer**: rosa, lila, aguamarina | lluvia de vidrio de colores; donde una mano la recoge, crece una flor (ref. 5) |
| Acta | negro y una línea de color de cada capítulo | tipografía cinética en español |

## 4. Cómo se hace «más 3D» (técnica)

- **Materiales físicos** de Three.js: vidrio con transmisión, cromo con *clearcoat*, iridiscencia (película fina), con un mapa de
  entorno para que haya algo que reflejar.
- **Reflejos e iluminación** en pantalla: reflejos (SSR) sobre suelos de cromo y agua, oclusión ambiental (GTAO), luz volumétrica.
- **Antialias temporal (TRAA)** en vez de MSAA: bordes finos y estables en líneas y fibras.
- **Tres capas de profundidad en cada capítulo**: teselas flotando casi en el muro (0–1 m), el universo (3–10 m) y un fondo lejano.
- **Modelos y texturas CC0** (Poly Haven: plantas, flores, materiales) en glTF comprimido, dentro de cada parte.
- La sala tiene una RTX 6000 Ada: hay margen. En el portátil se revisa en calidad media.

## 5. Textos en español, con tipografía y movimiento

- **Todo el texto en español** (decisión de Vicente, 24-11); las palabras castelleras, en catalán (*pinya, tronc, pom de dalt,
  enxaneta, descarregat*). Propongo también **la voz en español por defecto** (ya está grabada, voz Mía Evans).
- **Tipografía:** un serif de display contemporáneo para los títulos (por ejemplo *Instrument Serif* o *Fraunces*, licencia OFL)
  con una grotesca fina para las instrucciones (*Geist*, la de VEATION). Fuentes dentro de la obra, sin red.
- **Texto en 3D, letra a letra:** cada letra es una pieza del mundo. Llega como teselas que se ensamblan, con tracking que se
  abre, un barrido de luz y una salida que se rompe. Nítido a cualquier tamaño (campo de distancia), sobre el plano del muro.
- **Cartelas de capítulo** como títulos de cine: número romano pequeño, nombre grande en serif, el valor en una línea fina.

## 6. Botones e instrucciones en 3D

- El botón de mano pasa a ser un **objeto**: un anillo de vidrio iridiscente que flota en el muro, con la mano dibujada en luz dentro.
- Al acercar la mano el anillo **se ilumina y gira**; al sostenerlo, el progreso **se llena con teselas** que encajan una a una
  (el trencadís otra vez), y al completarse estalla en fragmentos.
- En el Tronc el pulso es un aro de luz que se cierra sobre el vidrio; en el Pom, el anillo se queda quieto y respira.
- La instrucción aparece con el mismo movimiento que las cartelas, más pequeña, y se apaga cuando el grupo ya lo hace.

## 7. Transiciones más fluidas: un solo gesto para toda la sala

- **La teselación**: durante unos 4 s la imagen entera de la sala se rompe en teselas (bloques y bandas de píxel, como las refs.
  6 y 7) que se desordenan, dejan ver el universo siguiente y se vuelven a juntar en él. Se hace sobre la imagen final, así que
  es igual de fluida en los cuatro muros y no depende de cada parte.
- **Un hilo conductor**: algo cruza de un capítulo al siguiente (una brasa que se vuelve punto, un punto que se vuelve tesela, una
  tesela que se vuelve línea). La vista no salta: sigue a ese objeto.
- **La cámara se mueve**: en el cambio, el ojo avanza, sube o gira levemente. En un CAVE, mover el ojo es mover el mundo entero
  alrededor del público.
- **El sonido manda el ritmo**: la teselación cae sobre el golpe de la transición, que ya está compuesto.

## 8. Plan y plazos (hoy martes 24 → jueves 26)

Por capas, para que cada noche haya una obra entera que enseñar.

**Hoy (base común, 4 agentes en paralelo):**
1. Textos en español + sistema de tipografía 3D con movimiento.
2. Botones 3D de vidrio con progreso de teselas.
3. La transición por teselación + el hilo conductor + el movimiento de cámara.
4. Materiales físicos, reflejos y TRAA en la sala 3D, y el guion de color en la atmósfera.

**Mañana miércoles (los universos, en paralelo):** Pinya de puntos y fibras · Tronc torre-ensamblaje · Pom ciudad de líneas ·
Brasa sobre cromo líquido · ressonància de cromo y vidrio · bajada al amanecer.

**Jueves:** pulido, rendimiento y pruebas. Si algo no llega, se queda la versión de hoy: nada se rompe.

## 9. Lo que necesito que decidas

1. **¿Apruebas la dirección «trencadís digital»?** Incluye renovar universos, no sólo pulirlos (Pinya de puntos y fibras, Pom
   ciudad de líneas, bajada al amanecer). *Alternativa:* mantener los universos de hoy y subirles sólo materiales, color y texto.
2. **¿La voz también en español por defecto?** *Por defecto: sí* (la inglesa queda en el selector).
3. **¿Modelos y texturas CC0 de fuera** (flores, plantas, materiales)? *Por defecto: sí*, pequeños y dentro de la obra.
