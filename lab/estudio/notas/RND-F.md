# Cuaderno de RND-F (render) — T-037

Archivos míos: `ressonancia/scenes3d/room3d.js`, `ressonancia/scenes3d/PARTS.md`. Respaldos: `room3d.ARTE2b.js.bak`, `PARTS.ARTE2b.md.bak`
(la versión de INT de las 13:20). Capturas y sondas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/rndf/`
(abajo, `rndf/`). Arnés: `rndf/shot.sh <nombre> "a=<de>&b=<a>&m=<mix congelado>&o=<origen>&acc=1" [calidad] [webgl2]` + `rndf/ev.js`.

## Dónde estoy
**Terminado y sin tocar más (entregado a QA).** Los tres objetivos hechos; 0 errores WebGPU y WebGL2 (saltos por todos los bloques,
cambio natural de QA, rotura de la intro). Pendiente de otros: QA mide fps (transición y TAA frente a MSAA); INT decide si pasa
`aa: 'taa'` por defecto en calidad alta tras esa medida. Volver atrás: `cp room3d.ARTE2b.js.bak room3d.js`.

## 1. La transición por teselas, rehecha (primer hito)
Antes / después a mitad de transición (pinya→pom, pom→crown, tronc→pom; mix congelado 0,5 / 0,5 / 0,4): **`rndf/sheet-before-after.png`**
(filas impares = versión de INT, pares = la nueva). Más: `rndf/sheet-a.png` (brasa→pinya a mix 0,2 / 0,45 / 0,7, pom→crown, intro→brasa),
`rndf/c1.png`, `rndf/c2.png` (recortes a tamaño de captura), `rndf/acc-bp-045.png` (con acentos de capítulo: naranja → turquesa).

Qué es ahora (un solo pase de pantalla, ~9 lecturas de textura por píxel; la de INT hacía ~21):
- **Árbol cuádruple estático** 0,9 · 0,45 · 0,22 · 0,11 m por azar (el collage de tamaños de las refs. 13/14); número entero de celdas
  en x: envuelve en P3|P4. Como una losa enrasada es invisible, no hay saltos al subdividir.
- **Una ola**: frente en cuña (la media altura va delante) desde `origin` en los dos sentidos; mismos tiempos que INT (ventana 0,3 de
  mix por losa; `MOVES` sin tocar; el pico sigue a mitad).
- **Relieve con la perspectiva de la sala**: cada losa se hunde en el muro (hasta ~0,45 m, proporcional a su tamaño: cubos) y se
  dibuja como una caja real vista desde el ojo: punto de fuga por muro (el pie del ojo en cada muro), así que cada losa se desplaza
  distinto y enseña las paredes de su hueco (paralaje). Paredes = el borde de la imagen estirado en profundidad (el vóxel de las
  refs.), iluminadas desde arriba (repisas claras, dinteles oscuros: la luz principal de la biblia), más oscuras al fondo; el dintel
  da sombra sobre la cara.
- **La losa gira** (eje vertical u horizontal, con escorzo): mundo viejo en una cara, nuevo en la otra. Mientras gira es **espejo**:
  refleja `room.envMap` (PMREM, rugosidad 0,14), un **destello especular** HDR ~2,3 la barre, y la mitad de las losas son espejo todo
  el vuelo (nota de arte «más cara, menos marco»). Canto con película fina siempre. Cara con exposición +1,2 en vuelo.
- **Luz por las grietas**: detrás de la losa que gira se ve el mundo nuevo, y luz iridiscente (`#8FE3FF → #F2A6C8 → #F6D47A`, teñida
  por el color del mundo que llega en esa celda) se derrama por el canto y sube por las paredes del hueco — también sobre negro.
  Con `setTiles({ accentFrom, accentTo })` la luz va del acento del capítulo que se va al del que llega (lo pasa el anfitrión).
- ***Pixel sorting***: bandas de 4 o 14 px, 0,3–1,2 m, rampa ordenada claro → oscuro con los colores de la imagen, sólo donde hay
  color que arrastrar (nunca una banda oscura) y sólo donde pasa el frente.
- `room.tileFront(muro)` 0..1: cuánto ha pasado la ola por el centro de ese muro (para que GUI meta el texto nuevo al pasar).
- El pase de teselas se **calienta al crear la sala** (su pipeline se construía en el primer frame de la primera transición).

### El «corte a negro» de QA (T-028 FALLA) — causa: el anfitrión, no el pase
`stripOut` tiene la imagen (sonda con `globalThis.__rdbg = 'out'`: luma 44 durante el cambio). Lo que pasa: si el cambio de bloque
llega con la transición anterior aún en marcha (ritmo 14 de QA: Brasa dura menos que la transición), la parte saliente conserva
`e.came = true` → `pass('out')` la oculta (`!(state === 'in' || e.came)`) y `pass('in')` también (estado 'out'): no está en ningún
mundo. Prueba: misma sonda de QA forzando `came = false` en las partes 'out' → luma 40 → 35–40 en el cambio (antes 45 → 1,7):
`rndf/nat3.js` (registro: `brasa:out … h`), `rndf/nat4.js` (con el arreglo simulado). Arreglo de una palabra en `experience.js`
(INT): `e.came = false` donde la parte pasa a 'out'.
Otra cosa del anfitrión vista con la sonda de luma por saltos (`rndf/luma.js`, tronc→pom): en un **salto** (no en un cambio natural)
la parte saliente se va en 1,2 s antes de que llegue la ola (`e.outAt < tr.at`), y hay ~1 s casi negro (luma 8 → 1,6) antes del pico.

### Comprobado
- 0 errores de consola en todas las capturas (WebGPU); WebGL2 `rndf/n2-tp-05-gl2.png` 0 errores, misma imagen.
- Costura P3|P4 con el frente saliendo de ella (`o=0.02`): `rndf/seam-join.png` (los dos bordes de la tira unidos; la rejilla cruza
  sin corte). Salto medio a través de la costura 17,7 frente a p95 16,5 / máx. 60 dentro del muro (la costura cae en un borde de celda).

### Pedidos atendidos después del primer hito
- **Arte («más cara, menos marco»; acentos de capítulo)**: la mitad de las losas son espejo todo el vuelo, la cara gana exposición
  sólo donde la imagen es oscura, marco de película fina a la mitad; `accentFrom` / `accentTo` (INT ya los pasa).
- **INT: varios frentes** — `setTiles({ origins: 4, origin: 0.125 })`: un frente por muro, todos a la vez (la rotura de la intro a los
  46 s: `rndf/tear-045.png`, `rndf/n4-tp-03.png`). Se queda puesto hasta que se cambie (`origins: 1` en los cambios de capítulo).
- **El corte a negro**: INT puso `e.came = false`; sonda natural de QA ahora 41 → 36–40 → 51 (`rndf/nat-final.png`), sin negro.
- Sonda de luma por salto pom→crown: mín. 19, pico 66, final 30–44 (según el momento de la corona), mayor paso entre frames 3,4;
  sin hueco > 32 ms en esa ventana (no es medida de fps: es de QA).

## 2. Entorno desde HDRI, por bloque
`room.setEnvironment(bloque)` re-hornea `room.envMap` EN LA MISMA textura (las partes no cambian nada) con `rooftop_night_1k.hdr`
(«night») y `kloppenheim_07_puresky_1k.hdr` («sky») de la biblioteca CC0 + el generado de INT («g»), desaturado, teñido y con una
rampa vertical frío-claro arriba / cálido abajo según el guion de color. Tabla `ENV_PRESETS` en `room3d.js`; API en `PARTS.md`.
- Esferas de cromo de prueba (izquierda rugosidad 0,04; derecha 0,35) con cada preset: **`rndf/sheet-envballs.png`** (de arriba abajo:
  generated, wait, intro, brasa, pinya, tronc, pom, festa, baixada). Brasa: plata fría `#9FB4D8` arriba, brasa abajo (subida tras la
  primera prueba: `rndf/eb-brasa.png`). WebGL2: mismo horneado, 0 errores.
- El horneado (un PMREM) ocurre dentro del siguiente `render()`; durante una transición espera al pico de la ola (mix ≥ 0,5). Los
  HDRI se cargan en segundo plano al arrancar; si falta un archivo se usa el generado con los colores del preset.
- Bloques enteros con su preset frente al generado (pom, pinya, tronc, baixada): `rndf/sheet-env-blocks.png` — nada se quema; el
  cambio es sutil porque varias partes usan sobre todo su propio entorno/shader. brasa3d no usa `room.envMap` (su cromo es propio):
  para que el cielo plata salga del HDRI, 3D-BR tendría que leer `room.envMap` en su suelo.

## 3. Calidad de imagen
- **TAA frente a MSAA ×2 (decisión: TAA es mejor; propongo `aa: 'taa'` por defecto en alta cuando QA confirme el coste).**
  Evidencia a 7196×912, recortes ×2: `rndf/aa-pom-compare.png` (arriba MSAA: las líneas finas en diagonal del Pom salen a trazos;
  abajo TAA: continuas). La TAA de INT emborronaba las nubes de puntos en movimiento (`rndf/aa-pinya-compare.png`, abajo: la parte
  alta de la Pinya arrastrada). Arreglo: recorte por varianza (historia dentro de media ± 1 σ del 3×3) y respuesta más rápida donde
  la historia discrepa → `rndf/aa-taa2.png` (Pinya limpia arriba, líneas del Pom igual de continuas abajo). En transición:
  `rndf/aa-tr-taa2-sheet.png` (fila 1). WebGL2 + TAA: 0 errores, imagen correcta (`rndf/gl2t-taa.png`). El valor por defecto lo pone
  el anfitrión (`P.aa`): hoy sigue 'msaa'.
- **Bloom como luz**: radio 0,6 → 0,4 y umbral 0,75 → 0,85 por defecto (el anfitrión sólo pasa la fuerza). `rndf/sheet-bloom.png`
  (pares 0,6/0,75 frente a 0,3/0,9 en brasa, pom, crown): líneas más nítidas, menos velo. Me quedé en un punto intermedio.
- **Acabado**: grano que sigue a la luz (un tercio en negros, entero en medios; 1,5/255). **Sin viñeta**: por muro dibujaría cuatro
  marcos alrededor del público y rompería las esquinas.
- **GTAO: no.** En espacio de pantalla sobre una tira de cuatro vistas, el muestreo cruza de un muro al vecino (otra proyección):
  halos justo en las esquinas, donde la sala debe ser continua; pide normales en MRT en todas las partes y casi todo es emisivo o
  puntos. La sombra de contacto la hace mejor cada parte en su shader (franja oscura de 2–5 cm, biblia §3).

## Trampas
- Las capturas en WebGL2 tardan ~9 s en cargar: con el límite de 15 s de `check.mjs` hay que acortar las esperas (`w1=500&w2=1300`).
- Un `Inf` de una parte × 0 en la composición da NaN y el bloom lo extiende a toda la tira: las lecturas del pase van acotadas (`safe`).
- `select(...)` de TSL evalúa las dos ramas: cada textura «elegida» son dos lecturas.
