# FES — T-068 · la ressonància = «camps» (festa3d/camps.js)

`SPF` = `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa/`
Respaldos: `scenes3d/parts/festa3d.T068.js.bak`, `res-3d-study/parts/festa3d.json.T068.bak`. Sin commit.

## 25-11 · entrega (spec ARTE-RESSONANCIA.md)
- **Nuevo módulo** `scenes3d/parts/festa3d/camps.js`, montado por `festa3d.js` sólo en el bloque `festa` (y en el estudio, modo festa).
  La **coronación no cambia** (mismo código). Al llegar desde la corona, el mundo viejo hace su propia salida en 2,2 s (el oro baja)
  mientras entran los hilos; luego se oculta y **no se actualiza** (sin sim de ondas, sin los 600 k de arena, sin cromo ni confeti).
  Vuelta atrás: `useOldFesta: true` (nuevo parámetro en `res-3d-study/parts/festa3d.json`, por defecto false).
- **Qué se ve** (números en la cabecera de camps.js): fondo tinta #0A0F1E→#131A33 (#1B2444 en el bloom); plano 0 = isolíneas
  (6→9 por mano, r = 8/14/22/32/44/58/74/92/112 cm, respiran ±8 % a 0,25 Hz), nodo Ø3 cm + cruz 6 cm, oro sólo en el puente entre dos
  manos; membrana a 0,6 m = rejilla 12 cm con lente (≤10 cm) y hundimiento real ≤0,5 m (σ 0,45, rebote al soltar, 0,6 s de estela);
  fondo 3 m = rejilla 25 cm con media deformación; líneas de campo = 12 arcos circulares por pareja (cada mano con su vecina más
  cercana < 2,5 m) que bajan 0,8 m en profundidad; fantasmas (2/muro, 25 %) tras 3 s sin nadie. Paralaje: cada plano profundo dibuja
  su rejilla con un punto de vista virtual por muro que sigue a la gente de ese muro (deriva lenta si no hay nadie).
- **Coste**: frame completo sin vsync (Electron, WebGPU, 7196×912 escala 1, 4 manos): **6,0 ms mediana** vs **12,8 ms** la festa
  vieja (misma prueba con `useOldFesta`). Sin render targets ni compute; nada se asigna por frame.
- **Pruebas**: obra (`jump festa`, manos fijas 0/1/4/6, ciclo completo free→echo→call→bloom con R hasta 1), corona→festa, costura
  P3→P4 con L, WebGL2 (`renderer: webgl2`, idéntico), estudio (grupo 1 y 4): `"errors":[]`. `npm run check` 90/90.
  Álbum: `album3/r1-ress-one.png`, `r2-ress-group.png` (6 manos, R 1), `r3-ress-bloom.png`, `r4-ress-close.png`.
  Luminancia media (pantalla) ≈ 0,065 (0–1 mano) · 0,11 (grupo, R 1) · 0,12 (llamada) · 0,125 (bloom).

## Mapeo eco / llamada a la partitura (ART no leyó score.js) — diferencias
- **Eco**: el frente de la partitura no tiene posición; sale de la mano que aterrizó en su muro (o la más cercana; centro si fantasma).
  Lo dibujo como DOS cuerpos discontinuos que salen en ambos sentidos y se encuentran en el muro opuesto a los `travel` s (≤2 personas:
  dan la vuelta y vuelven a casa, como la partitura). Al llegar, la rejilla cede la mitad que con una mano. El `ghost` de la sala va al 60 %.
- **Llamada**: tok-tok-TOK por las horas reales de `state.call` (`at`, `gap`); la partitura siempre pone `call.from = 0`, así que el origen
  de los frentes es el **centro del grupo de manos** (muro 0 si no hay nadie). Hay 4 llamadas (no una), cada una con sus 3 frentes.
- **Bloom**: dura `max(4, min(8, bloomDur))` s (la partitura da 4–8 s según cuán juntos estuvieron), no 4 s fijos; el bloque termina
  al acabar el bloom, así que la relajación de las aristas coincide con la salida.

## Pendiente / para ART y el director
- **Bloom de post 0,15 / umbral 0,9** (spec): vive en `experience.js › BLOOM` (no lo toco). Los hilos están por debajo del umbral.
- Zonas tranquilas: texto sin isolíneas (spec); en la zona del **botón** las isolíneas de las manos quedan al 60 % (si no, una mano en
  el centro del muro a 1,25 m no tendría anillos: el camino en solitario lo necesita). Decidir.
- La fusión de dos manos ocurre a ~1,8 m con los anillos de 58 cm (2,35 m con 74 cm, R ≥ 0,33), no a 2,5 m: a 2,5 m el grupo entero
  quedaba rodeado de anillos de varios metros. Las líneas de campo sí se encienden < 2,5 m.
- Bloom: dentro de las celdas quedan hilos curvos (la rejilla apiñándose hacia las aristas) más visibles que el 10 % pedido; las
  aristas duplicadas a 0,6 m se ven punteadas (al 40 %). Sin hilo vertical por vértice (prisma) todavía.
- Sonido: un `fx` 'wire' 'hit' por mano que aterriza (≤16/s); eco/llamada/bloom suenan ya por la partitura.
- Sin `room.reactive` (todo son hilos finos estáticos o lentos).

## 25-11 (tarde) · v2 «aigua»: un estanque (ARTE v2 + refs 05/06 de Vicente)
- **Por defecto la ressonància es `festa3d/aigua.js`.** Para volver atrás, `festaLook: 'camps'` (los hilos v1, tal cual) o
  `useOldFesta: true` (la festa anterior a T-068); los dos parámetros están en `res-3d-study/parts/festa3d.json`.
  Respaldos: `camps.T068b.js.bak` y `festa3d.T068b.js.bak`. La corona no cambia.
- **La vista**: un estanque horizontal a y = 0,8 m (0,8 m bajo el ojo) alrededor de toda la sala. Cada muro lo muestra alejándose
  hasta un horizonte suave en ~1,4–1,5 m (bruma de 7 a 18 m), con el cielo tinta encima. «Tocas el agua que ves»: el rayo del ojo
  que pasa por la mano cae al agua (de 1,25 a 10 m).
- **El solucionador**: la ecuación de onda de la placa vieja, escrita en una rejilla log-polar centrada en el ojo (768 × ~380, θ × ln r,
  de 1,15 a 24 m). Es conforme: los anillos siguen redondos y θ es periódico, así que no hay costura en ningún sitio. Con c ∝ r
  (1,2 m/s a 4 m) el tamaño de un anillo en pantalla no depende de la distancia: el agua cercana se ve nítida y la lejana, suave.
- **El aspecto**: relieve real (malla polar desplazada, hasta 3 cm × r/4), Fresnel F0 0,03 y reflejos de un estudio suave (cúpula,
  seis paneles grandes plata/lavanda que giran despacio, una banda). Cuerpo índigo con luz en las crestas. El lecho, 0,6 m por debajo,
  se ve refractado, con la rejilla de 12 cm al 15 % curvada por el agua y cáusticas. Contornos de 1 px en hueso (~10 %) y el nodo
  de la mano en el muro.
- **Interacción**: una mano que aterriza es una gota (paquete de anillos); una mano sostenida, una fuente de 3 Hz. Si dos manos están
  a menos de 1,8 m, las crestas entre ellas llevan un borde oro fino. R amortigua las ondas viajeras y levanta ondas estacionarias.
  El eco son dos paquetes que chocan en el muro opuesto con un destello oro. La llamada son frentes rectos de λ 40 cm a 3 m/s. El bloom
  es un modo único en toda la sala.
- **Cambios frente a ART v2 (por las refs o por legibilidad)**:
  - Estanque en lugar de «muro de agua» (lo pidió Vicente).
  - La onda de Faraday son anillos estacionarios alrededor de cada mano sostenida que interfieren entre sí, no franjas →
    cuadros → hexágonos: la retícula uniforme sobre todo el estanque se leía como plástico de burbujas.
  - El bloom son anillos estacionarios concéntricos alrededor del centro de la sala (cada uno un círculo completo, sin costura),
    ondulados 110 veces por vuelta. Las líneas nodales de oro van a 1 px y al 30 %, no a 2 px al 100 %: llenas formaban una malla.
  - El oro sale anaranjado en pantalla; hay que revisarlo con ART.
- **Coste**: 6,2 ms de mediana por frame completo, contra 6,0 ms de camps y 12,8 ms de la festa vieja.
- **Pruebas**: `"errors":[]` en la obra (WebGPU y WebGL2), en el estudio y en la obra entera; `npm run check` 90/90.
  Luminancia media en pantalla 0,08–0,10: por debajo del objetivo de ART (0,10–0,16).
  Álbum: `r1`–`r4` sobrescritos y `r5-ress-water-close.png`.
- **Pendiente**:
  - Con R alta la luminancia sigue algo baja.
  - Los paquetes del eco no se distinguen en la tira completa (sí en el código y en los recuentos).
  - No hay corona de gota (el chorro de la ref05).
  - Las manos por encima de ~1,5 m caen lejos, al borde de la bruma.
