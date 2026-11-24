# Cuaderno de 3D-PI

## Dónde quedé
Parada limpia (límite de uso). Todo funciona y sin errores en la última comprobación (WebGPU y WebGL2):
- `pinya3d.js` + `pinya3d/body.js` = T-016 (materia) + brazos de dos tramos (re-arreglo de T-012). Respaldos por etapa en `parts/pinya3d/*.bak`.
- `actatext.js` = T-022 (llega por fragmentos de luz). Respaldo de INT en `parts/actatext/actatext.INT.js.bak`.
- Álbum T-023: primera tanda hecha (`lab/estudio/album/`, script `make-album.sh`).
Pendiente: QA del re-arreglo de brazos y del acta; auditoría natural de transiciones sin jump (era a las 03:00); tanda final del
álbum (era a las 06:00); mirar la pinya con muros llenos (masa pareja, figura tapada por el botón de la guía).

## Informe T-002 — `pinya3d` (II. Pinya · Força · cuerpo y tierra)

**Qué es.** Detrás de cada muro, una multitud de figuras de arcilla y porcelana sin esmaltar (292 cuerpos, mallas reales
instanciadas) en 4 anillos concéntricos alrededor de la sala (radios 6,0–7,95 m: 2,5–4,5 m tras el centro de cada muro), sobre
terrazas de tierra que suben (0,42 m por anillo), todos mirando al centro de la sala. Respiran (4 s dentro, 6 s fuera).
Al principio oscuros y dormidos.

**Cuerpos.** Procedurales: cápsulas y elipsoides sobre un esqueleto con IK (como `castell.js`), horneados en TRES poses con la misma
topología (dormido: encorvado, cabeza baja, manos en la espalda del de delante · despierto: erguido, brazos arriba, palmas empujando
hacia la sala · rotllana: brazos alzados y enlazados como en la sardana). Dos complexiones (5 664 vértices cada una). El vertex shader
mezcla poses por instancia, añade respiración, inclinación hacia la mano, el paso lateral de la sardana y la fragmentación.
Sombreado propio (TSL, MeshBasicNodeMaterial): luz envolvente desde lo alto de la sala, borde de perla, brillo bajo la piel (rojo
profundo en el borde grueso, oro donde la piel te mira), cara interior de los fragmentos = porcelana blanca con destellos.
Todos los buffers entrelazados (1 de vértice + 1 de instancia): WebGPU sólo admite 8 buffers de vértice.

**Manos.** Al instante (mismo frame): un resplandor cálido al otro lado del muro bajo la mano, y la multitud detrás se enciende
(subida ~35 ms de constante) y se inclina. Después una figura sale de la oscuridad (pool de 12 «pressers», manos detalladas con
dedos) y en ~2,2 s apoya su palma de arcilla en la mano del visitante, sobre el plano del muro (dos poses de presión, baja 1,0 m y
alta 1,72 m, mezcladas por la altura de la mano); al contacto el calor corre de la palma por el brazo a todo el cuerpo. Sin mano:
se queda 1,2 s y vuelve a la oscuridad. Manos a < 0,5 m en el mismo muro comparten figura.

**`input.state` / `events`.** `fill[w]` despierta el muro w anillo tras anillo (delante y centro primero; cada cuerpo sabe por qué
muro se ve, con su `u`). `'wall:<i>'` = pulso cálido profundo por los cuerpos de ese muro, de delante atrás. `closed` → todos a la
pose de rotllana (la ola de cambio recorre la sala desde el muro 0), los anillos giran (sentidos alternos, paso lateral) y las
respiraciones se sincronizan; `'close'` = una ola de luz que da la vuelta. Fase `reward` de pinya (y bloques posteriores): la
arcilla se seca (más pálida, mate), se para el giro y se abren grietas que brillan con colores de esmalte (cobalto, turquesa, oro):
el trencadís que viene. Sin `input.state` (estudio): parámetros.

**arrive / leave.** Cada cuerpo está cortado en ~26 fragmentos irregulares (Voronoi sobre su superficie, sin cruzar de miembro a
miembro sin penalización); cada vértice lleva el centro y la semilla de su fragmento: todo en el vertex shader. `leave`: los
fragmentos suben y se alejan girando (arcilla fuera, porcelana dentro, destellos), arriba primero, y se encogen en la oscuridad.
`arrive`: fragmentos de ceniza (oscuros, bordes de brasa) llegan desde abajo y alrededor girando y encajan, de abajo arriba,
calentándose. Ambos ~1,9× de rango con retardos por fragmento, por altura y por cuerpo.

**Parámetros (estudio):** fill, closed, dry, arrive, leave, glow, light, breath, press (bool). `progress` no se usa.

**fps:** no medido (regla: sólo mide QA). Comprobaciones funcionales: WebGPU y WebGL2 (`renderer=webgl2`) sin errores; estado del score simulado (`wall:0`, fase reward → grietas) sin errores.

**Capturas** (7196×912 salvo indicación):
- dormidos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_asleep.png`
- manos apretando (4 manos fijas a 1,25 m): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_press.png` (detalle: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/press_zoom.png`)
- círculo cerrado (rotllana, banda de luz que gira): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_closed.png`
- leave a mitad (0,45): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_leave.png` · arrive a mitad (0,55): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_arrive.png`
- estado del score (fill 1/0,55/0,2/0,8, `wall:0`, reward → secado y grietas): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_state.png`
- WebGL2 con manos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/f_webgl2.png` (2400×560)

**Lo que le falta al host:** nada imprescindible. Útil: (1) que el estudio pase un `input.state` simulado o un modo «score» para
probar eventos sin la obra entera; (2) `room.hands()` no da `ended`/`size`: la figura no sabe si la mano es de niño o adulto.

**Puntos débiles.** Cuerpos de primitivas: costuras visibles entre elipsoides (se leen como figurillas/maniquíes de arcilla, no
como cuerpos esculpidos); sin oclusión ambiental; las figuras «presser» atraviesan a veces la multitud al salir; el paso de la
sardana es un levantamiento simple de pierna; el suelo/terrazas son casi negros; sin culling por sector (las 4 vistas dibujan los
292 cuerpos: ~1,65 M vértices por vista).

## Hallazgos y trampas
- WebGPU: máximo 8 vertex buffers → entrelazar atributos (InterleavedBuffer + InstancedInterleavedBuffer).
- Elipsoide con base [hx, fd, pn] de determinante negativo invierte el winding: la cara «frontal» sale como porcelana.

## Traspasos a otros roles
- INT: la parte lee `input.state.fill/closed/block/phase/tp` y eventos `wall:<i>`, `close`; `arrive`/`leave` 0..1.

## T-007 — cuerpos de porcelana (sobre la FALLA de T-002)
Respaldo de T-002: `scenes3d/parts/pinya3d/pinya3d.T-002.js.bak`. Nuevo: `scenes3d/parts/pinya3d/body.js` (generador) y `pinya3d.js` reescrito.
- **Cuerpo único**: SDF (elipsoides + conos redondeados, smin suave en el tronco y ajustado en las uniones) → surface nets (2,8 cm
  multitud, 2 cm figura que aprieta) → skinning en la carga a 15 huesos → 3 poses con una topología. Cabeza sin rostro con nariz,
  mandíbula y arco de cejas. Manos de la figura que aprieta: SDF propio a 4,5 mm (dedos y pulgar). Horneado: AO, grosor (translucidez),
  moteado, fragmentos (duplicados sólo en los bordes = grietas), peso de cabeza. Horneado total ≈ 1,2 s al crear la parte.
- **Variedad**: 2 complexiones × 2 juegos de poses = 4 tipos; por cuerpo altura 0,9–1,07, anchura 0,93–1,07, giro de cabeza ±26°,
  fase de respiración, tono. **Densidad**: 5 anillos, 458 cuerpos, 0,47 m hombro con hombro, filas al tresbolillo, terrazas 0,3 m.
- **Luz**: casi sin luz general; borde de perla rasante desde arriba; calor bajo la piel (rojo profundo donde es grueso, oro donde es
  fino), fuerte sólo donde hay manos; la masa se pierde abajo en la sombra (los pies no flotan). Con fill 1 el calor es un parpadeo
  bajo por cuerpo; cerrado, una banda de calor que gira.
- **Culling por sector**: 2 bandas (Group que gira) × 8 sectores × 4 tipos = 64 mallas con su esfera; cada muro dibuja las suyas
  (se desactiva mientras vuelan los fragmentos).
- **Banda de la guía 0,9–1,6 m (media / p99, los 4 muros, 7196×912)**: dormidos 3/24 · fill 0,6 33–34/97–101 · **fill 1 36–37/94–97**
  (meta ≤ 60) · **closed 50–52/150–154** (meta ≤ 80) · 4 manos 18–23/170–176 · leave 0,45 28–31/148–151 · arrive 0,5 39–40/127–129 ·
  estado del score con reward/grietas 36–39/139–140 · WebGL2 fill 0,6 + 4 manos 43–46/173–181.
- **Sin errores** en WebGPU y WebGL2 (9 capturas + estado simulado con `wall:0` y reward). fps: lo mide QA.
- **Capturas**: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v2_asleep.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v2_press.png` (detalle `v2_press_zoom.png`), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v2_closed.png`, `v2_fill1.png`, `v2_fill06.png`,
  `v2_leave.png`, `v2_arrive.png`, `v2_state.png`, `v2_webgl2.png` (mismo directorio).
- **Pendiente / débil**: los brazos alzados de la pose despierta parecen antenas a distancia; las piernas siguen siendo cilindros
  lisos; el horneado de 1,2 s bloquea el hilo al crear la parte (INT debe crearla antes de la transición, no durante); no hay pies
  ni manos con detalle en la multitud.

## T-012 — pulido (entregado 23:27)
Respaldos: `parts/pinya3d/pinya3d.T-007.js.bak`, `parts/pinya3d/body.T-007.js.bak`.
- **Brazos**: brazo y antebrazo más gruesos, con masa de bíceps/deltoides y de antebrazo; poses despiertas con el codo doblado
  (manos más cerca de la cabeza); mano con palma y pulgar. A 3–6 m ya no se leen como antenas (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v3_fill_zoom.png`).
- **Piernas y pies**: masa de muslo, pantorrilla detrás de la tibia, tobillo fino, pie como masa (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/cmp_press.png`: arriba T-007, abajo T-012).
- **Carga**: el horneado es un generador avanzado en `update()` (8 ms por frame; ningún paso > 10 ms); SDF ×2,3 más rápido (salta
  primitivas a > 12 cm). Medido en las capturas: `create()` 2 ms (WebGPU) / 4 ms (WebGL2); todos los cuerpos listos en 2,0 s / 3,1 s.
- **Banda de la guía (media / p99)**: dormidos 3/25 · fill 1 33–35/91–95 · closed 49–53/142–149 · 4 manos 17–22/165–170 · leave 0,45
  24–28/149–152 · estado con reward 36–43/138–142 · WebGL2 fill 0,6 + 4 manos 47–51/171–180. Sin cambios respecto a T-007 (±5).
- **Sin errores** en WebGPU y WebGL2. Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v3_*.png`.
- **Débil**: las manos de la multitud son palas planas; las caderas todavía algo cuadradas.

## T-016 — materia (entregado 23:35)
Respaldos: `parts/pinya3d/pinya3d.T-012.js.bak`, `parts/pinya3d/body.T-012.js.bak`.
- **Materia oscura**: el calor bajo la piel sale en la silueta y en las partes finas (porcelana a contraluz); las caras que te miran
  quedan oscuras. En la figura que aprieta, el calor nace en la palma y se apaga con la distancia (exp −3,2/m), sin piel uniforme.
  Un brillo fino de perla atrapa el borde (pow(1−n·v, 7), sobre todo en las caras que miran a la luz de arriba).
- **Suelo**: el suelo se veía culled (la Lathe miraba hacia abajo): ahora es de dos caras, oscuro, y bajo cada figura que aprieta hay
  un charco de luz cálida con una sombra de contacto suave en los pies. Ya no flotan.
- **Manos y caderas**: mano de la multitud = palma + dedos juntos algo curvados + pulgar; caderas con glúteos y crestas redondeadas.
- **Medidas (mismo encuadre que cmp_press; recorte 2100–3500 × 250–912)**: tronco de la figura delantera, luma media 93 → **52 (56 %)**;
  máximo de la mano que aprieta 224 → 228; p99 de la figura 192 → 186.
- **Banda de la guía (media)**: fill 1 33–34 (T-012 33–35) · closed 46–49 (49–53) · 4 manos 15–18 (17–22) · dormidos 4 (3) ·
  WebGL2 fill 0,6 + 4 manos 41–44 (47–51, −6: un punto fuera de ±5, más oscuro).
- Sin errores en WebGPU ni WebGL2. Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/cmp_press2.png` (arriba T-012, abajo T-016), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v4b_press_zoom.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v4b_*.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v4_*.png`.

## T-019 — auditoría de transiciones (sólo lectura; 23:46)
Método: `res-obra3d/review.html?people=6&from=<bloque>` en `check.mjs` (1800×900, vista en dos filas P4·P1 / P2·P3). Clic en el
inicio, 4,5–6 s para que el mundo de origen termine de llegar (2,5 s en la espera), `score.jump(<siguiente>)` y captura a +0 / +1,5 / +3 / +5 s
(una ventana por captura: cada fotograma es un pase distinto, el público virtual no es idéntico entre ellos). Hojas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t019/sheet_<de>-<a>.png`.
Limitación: el salto con `jump` corta el bloque de origen donde esté (p. ej. la intro en su t ≈ 4 s, que es negra por diseño), no al final de su
recorrido natural; las transiciones naturales (intro a t = 70, pom después de la tercera subida) deberían verificarse en un pase completo.

| Cruce | ¿Se lee como fragmentación? | Problema | Dueño del arreglo |
|---|---|---|---|
| wait → intro | A medias: las brasas de la espera se dispersan en motas | El texto de la guía sigue 1,5 s sobre un mundo que ya se va; luego negro (la intro es negra 0–8 s por diseño) | INT (guía: retirar el texto de espera al empezar) |
| intro → brasa | Sí desde +3 s: esquirlas rojas que caen y el lecho que prende por tramos | Hueco negro ~2 s (+0 y +1,5 casi negros); medido con la intro cortada en su fase negra, hay que repetirlo a t = 70 | 3D-BR (llegada más temprana) · INT (repetir a t = 70) |
| brasa → pinya | Sí la llegada: los cuerpos se montan con fragmentos de arcilla | Brasa no se rompe: a +1,5 s ya no está (coincide con la FALLA de QA en su salida) | 3D-BR (salida por fragmentos) |
| pinya → tronc | Sí: la pinya estalla en piezas que suben y la plaza se recompone con paneles que caen | A +3 s ambos mundos a la vez (piezas de la pinya sobre el horizonte de la plaza), breve y aceptable | — (vigilar) |
| tronc → pom | No: la plaza no se rompe; entre +3 y +5 s cambia a la ciudad de pom de golpe (con algunos cristales cayendo) | Corte duro hacia +4 s | INT (salida de la plaza en este cruce) · 3D-PO (llegada que se vea antes) |
| pom → crown | No: la ciudad de pom no se rompe; a +3 s una red de triángulos dorados cubre los 4 muros | Corte duro entre +1,5 y +3 s; la red parece geometría de depuración más que una llegada | 3D-FE (llegada de la coronación) · INT (salida de pom) |
| crown → festa | No: dos mundos de oro casi iguales que se funden | Los textos «CROWNED · 2 de 7» y «THE SQUARE IS YOURS» se superponen a +3 s (empaste) | INT (guía: un texto sale antes de que entre el otro) · 3D-FE |
| festa → baixada | A medias: llegan triángulos y paneles | Borde vertical duro a +3 s (media pared festa, media baixada, en P4 y P2) y a +5 s las curvas de festa sobre el castell (empaste) | 3D-FE (salida de festa) · INT |
| baixada → acta | Sí: la plaza se rompe en paneles de piedra y espejo que vuelan; el castell baja | El acta aún no aparece a +5 s (llegada lenta, no es un error) | — |
| fall → acta | No: «IT FELL» desaparece a +1,5 s y queda sólo polvo hasta +5 s, cuando aparece «2 de 7» sin fragmentos | Hueco casi negro ~3 s | INT (acta: llegada por fragmentos, antes) |

Sin errores de consola en las 40 capturas. Sin destellos bruscos.

## T-022 — el acta llega por fragmentos de luz (00:02)
Dueño de `scenes3d/parts/actatext.js` desde las 23:50. Respaldo de la versión de INT: `parts/actatext/actatext.INT.js.bak`. Textos y datos de `acta()` sin cambios.
- Cada placa de texto se monta con fragmentos de luz: el texto se corta en celdas de 2,2 cm que entran desde posiciones dispersas, cada
  una con su retardo, doradas y brillantes en vuelo, y se asientan en el tipo cálido; al irse se rompen igual (las celdas suben).
- La línea del castell («2 de 7» + resultado) empieza a t = 0,2 s (antes 4 s) y se lee hacia 2,4 s; la glosa entra a 1,6–3,6 s.
  `input.arrive` sólo abre la puerta (completa en ~1,7 s), ya no estira la entrada a 5 s; `input.leave` rompe el texto en luz.
- Evidencia: estudio `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t022/sheet_study.png` (t 0,6 / 1,2 / 2,5 / 5); obra fall→acta `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t022/sheet_obra2.png` (+0,8 s ya hay fragmentos,
  +4 s legible); baixada→acta `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t022/dbg.png` (+3,2 s legible, la plaza aún rompiéndose). Sin errores.
- Pendiente: la repetición natural de la auditoría (pase completo, sin jump) a las 03:00.

## T-012 (re-arreglo de los brazos, sobre la FALLA de QA) (00:10)
Respaldos: `parts/pinya3d/*.T-016.js.bak`.
- Causa de la S: los bultos de músculo a lo largo del brazo y una mezcla de skinning ancha (2,2 cm) que redondeaba el codo; además las
  poses despiertas tenían el codo a 76–108° (brazo en «cactus»).
- Arreglo: brazo y antebrazo como dos conos rectos (antebrazo más fino) con casquete de deltoides en el hombro y bola de codo; unión
  suave del brazo 1,2 cm (antes 3); skinning de brazos y manos con caída de 0,7 cm (antes 2,2); el hombro sube cuando la mano pasa de
  su altura + 20 cm. Codos medidos en las poses despiertas: 36–60° (complexión A) y 50–59° (B); alturas de mano distintas por tipo
  (1,52–1,95 m).
- Evidencia: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/cmp_arms.png` (arriba T-016, abajo intermedio), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v5_fill_zoom.png` (final: dos tramos con codo, sin S),
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v5_closed_zoom.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/v5_press_zoom.png`. Banda de la guía: fill 1 32 · closed 46–49 · 4 manos 14–17 (sin cambios). Sin errores WebGPU/WebGL2.

## T-023 — álbum (primera tanda, 00:14)
Script reutilizable: `lab/estudio/album/make-album.sh [nombres…]` (una ventana oculta y muda por captura: clic de inicio, `score.jump`,
ajusta el reloj, los pisos o el resultado del score para el mejor momento, espera y captura la vista en dos filas; 1600 px, ≤ 2 MB). No
lanzarlo durante una congelación de GPU. Salida: `lab/estudio/album/NN-bloque.png` (12 imágenes, 0,6–1,9 MB, sin errores).
Momentos: espera 2,5 s · intro t 53 (la plaza rompiéndose) · brasa t 7 (olas) · pinya t 28 con los muros llenos · tronc 8 pisos · pom t 9 ·
coronación t 16 · festa t 10 · baixada t 8 · caída intent y carregat t 6 · acta t 8.

**Lo que se ve roto o feo** (segunda auditoría visual):
- 05-tronc (INT / castell): con 7–8 pisos el pom de dalt sale por arriba del muro (cortado), y «KEEP IT STRAIGHT / HOLD BOTH SIDES» queda
  encima de la base del castell; en la tarjeta de capítulo el título tapa el tronc.
- 06-pom (3D-PO): edificios planos de caja con textura uniforme y luz plana; se leen como maqueta de videojuego al lado de la plaza de la intro.
- 07-crown (3D-FE): lavado beis de pared entera (ruido + curvas de oro a toda la altura); la corona dibujada parece un icono.
- 08-festa (3D-FE): franja negra horizontal con un «raíl» en lo alto de los cuatro muros, que corta la imagen; el resto bien.
- 11-fall-carregat (INT / fall3d): casi vacío; no se distingue de intent (el castell coronado que cae no se ve en la caída).
- 04-pinya (3D-PI, mío): con los muros llenos la masa se ilumina bastante pareja de lejos; la figura que aprieta queda tapada por el
  resplandor del botón de la guía. Lo reviso en la tanda final.
- 01, 02, 03, 09, 10, 12: bien (la plaza rompiéndose en la intro y el acta son de las mejores).
Tanda final: a las 06:00, con `bash lab/estudio/album/make-album.sh`.

## 03:15 — pinya con los muros llenos: luz local, masa oscura
Respaldo: `parts/pinya3d/pinya3d.T-012b.js.bak`. Con fill 1 ya no se enciende toda la masa: cada cuerpo «arde» por turnos
(una brasa lenta, potencia 6 de un seno con fase propia: pocos a la vez), el resto queda oscuro; el borde de perla y el brillo fino
se escalan con el calor de cada cuerpo. La luz fuerte es la de las manos (figura que aprieta + cuerpos cercanos + charco en el suelo).
Banda: fill 1 21–27 (antes 32) · closed 42–47 · fill 1 + 4 manos 31–35. Sin errores. Comparación: scratchpad `.../pinya3d/cmp_even.png`
(arriba antes, en medio ahora, abajo ahora con una mano). El anillo de la guía sobre la figura: propuesta a INT por el director
(halo al ~30 % mientras se sostiene en pinya, o anillo 0,45 m más abajo); guide3d no lo toco.

## 03:25 — luz de la mano ajustada · carregat del álbum jugado desde la baixada
- El resplandor inmediato de pinya3d detrás de la mano pasa de 0,55 m a 0,28 m de radio y baja de intensidad: la luz nace en la palma
  (`.../pinya3d/v7_press_zoom.png`). La nube de chispas alrededor del botón en la obra (int/soft2.png) NO es de pinya3d (pinya3d no tiene
  partículas): es el calor de mano de **atmos** (las motas detrás de una mano se encienden): INT, que configura atmos por bloque, puede bajar
  ese calor en pinya.
- `make-album.sh`: 11-fall-carregat ya no salta a 'fall'. Desde la baixada todos sueltan (`stage.put` desactivado y manos levantadas)
  y el score aplica su propia regla de muro vacío (acortada a 2,5 s y a ritmo ×3 para caber en la ventana de 15 s): el castell
  coronado cae y la plaza se rompe. Columna nueva opcional en el script: una query extra por fila. También `&demo=0` en todas las filas.

## T-022 · auditoría natural (04:00–04:13): un pase completo sin jump
Herramienta: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/pass/pass.mjs` (misma mecánica que check.mjs: ventana oculta y MUDA, pero larga): `review.html?people=6&from=wait`, el
público virtual juega el pase entero; en cada cambio de bloque, capturas a +0 / +1,5 / +3 / +5 s. Pase: 559 s de la espera al acta
(descarregat, 9 pisos) y de vuelta a la espera; 0 errores. Hojas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/pass/run1/sheet_<NN>_<de>-<a>.png`. Sin caída en este pase (salió descarregat): fall→acta
sólo se ha visto con salto (T-019) y en el álbum (carregat jugado desde la baixada).

| Cruce | ¿Fragmentación? | Lo que queda | Dueño |
|---|---|---|---|
| wait → intro | Sí: las brasas de la espera se dispersan en motas; luego el negro de la intro (diseño) | — | — |
| intro → brasa (t = 70) | Sí: el título se va, el lecho prende por tramos con esquirlas rojas desde +1,5 s; sin hueco | — | — (arreglado) |
| brasa → pinya | Sí: la brasa sube en esquirlas rojas y los cuerpos se montan con fragmentos de arcilla | — | — (arreglado) |
| pinya → tronc | Sí: la pinya estalla en piezas, la plaza se recompone con paneles | +1,5–3 s masa de piezas brillante a la altura de la guía (breve) | 3D-PI (vigilar) |
| tronc → pom | Sí ahora: la plaza se rompe en esquirlas triangulares y la ciudad de pom llega | A +3 s un tercer aspecto (cielo azul con líneas de constelación) antes de la ciudad | 3D-PO (menor) |
| pom → crown | Sí: la ciudad se rompe en triángulos y llega el oro | A +5 s un raíl de luz blanca en lo alto de los 4 muros | 3D-FE |
| crown → festa | Continuidad (los dos mundos son de oro), textos ya sin superponerse | Barras blancas planas («cometas») dentro de los círculos, parecen un artefacto | 3D-FE |
| festa → baixada | Sí: festa se rompe en triángulos dorados | A +3 s casi negro (~1–2 s) antes de que llegue la plaza; el pico de festa justo antes es un lavado beis de pared entera (QA) | 3D-FE · INT |
| baixada → acta | Sí: la plaza se rompe, el castell se deshace, el acta se monta en luz y se lee a +3 s | El acta se monta encima del castell que aún baja (+1,5 s), algo cargado | — (aceptable) |
| acta → wait | Sí: el texto se rompe, las brasas de la espera se montan | — | — |

## T-023 — tanda final del álbum (04:43)
12 imágenes en `lab/estudio/album/` (0,6–2,0 MB, 1600 px), sin errores; carregat jugado desde la baixada. Mirada final:
- Bien: 01 espera · 02 intro (la plaza rompiéndose, «STRENGTH · Força») · 03 brasa · 06 pom · 08 festa (ya sin raíl ni lavado) · 09 baixada ·
  10 intent · 11 carregat (el castell cae y la plaza se rompe) · 12 acta.
- 05-tronc: con 8 pisos el castell sigue saliendo por arriba del muro y la guía «KEEP IT STRAIGHT / HOLD BOTH SIDES» está sobre su base (INT / castell).
- 07-crown: sigue el lavado de oro de pared entera (3D-FE).
- 04-pinya (mío): en la obra la multitud se ve más pareja y clara que en la pinya3d sola (allí oscura con brasas). Sospecha: el
  álbum fuerza fill 0,9 con dos muros sostenidos (las manos encienden su zona) más la neblina de atmos; no lo he podido aislar
  esta noche. Primer paso para mañana: capturar la obra en pinya con `light/glow` de la parte y atmos apagado para separar.

## 04:50 — por qué 04-pinya salía pareja en la obra (causa y arreglo)
Diagnóstico en la obra (review.html, mismo llenado y manos; scratchpad `.../pinya3d/diag/`): los params que pasa res-obra3d son los
defaults del json (light 1, glow 1), exposición 1 y bloom 0,6, igual que en el estudio; atmos suma ~3 de luma. La causa es el ESTADO:
el álbum forzaba fill 0,9 con dos muros sostenidos y el score **cerraba el círculo** (closed 0,93) durante la captura. El estado
cerrado (rotllana) encendía a todos: 4 bandas de calor anchas alrededor del anillo más la pose despierta. Sin cierre (pinya.hold
anulado), la misma escena ya se ve como cmp_even: oscura con brasas.
Arreglos, todos en pinya3d/álbum (nada para INT):
- Cerrado: UNA sola mancha de calor estrecha que recorre el anillo (sin(a − 0,55 t), potencia 16), el resto oscuro; las manos
  encienden sólo los cuerpos justo detrás (gaussiana 0,45 m², caída por fila 0,75).
- `make-album.sh` 04-pinya: anula el cierre del score (`pinya.hold = 1e9`) para retratar la pinya jugándose, no la rotllana.
Banda en la obra (fila de arriba / abajo): antes 65 / 50 · ahora cerrado 58 / 38 · sin cerrar 52 / 41. 04-pinya.png rehecho.
Respaldo: `parts/pinya3d/pinya3d.0445.js.bak`. Sin errores.


## T-030 — Pinya de puntos y fibras, turquesa y coral (24-11, 12:45–13:05)
Ticket `tickets/T-030-3DPI-fibras.md`. Respaldos: `parts/pinya3d/pinya3d.ARTE2.js.bak`, `body.ARTE2.js.bak` (body.js no ha cambiado),
`pinya3d.ARTE2.json.bak`. Volver atrás = copiar esos tres a su sitio.

**Qué hay ahora** (`parts/pinya3d.js` reescrito sobre el mismo kit de cuerpo: esqueleto, 3 poses, fragmentos, anillos, terrazas, estado del score):
- **Cuerpos de nube de puntos**: 1 600 puntos por cuerpo muestreados en la superficie horneada (3 poses, normal, fragmento), discos
  instanciados por cuerpo (458 cuerpos, mismo culling por sectores), tamaño en metros con mínimo de 1 px. Turquesa con motas coral,
  borde (silueta) más brillante, centelleo de algunos puntos; el calor (mano, pulso, rotllana) es coral. Adiós a la arcilla.
- **Fibras del cuerpo**: 14 por cuerpo a lo largo de las cadenas de huesos (pie→cabeza, mano→cuello, cruces), cintas aditivas finas
  (≥ 1 px, energía conservada si se adelgazan), un pulso lento las recorre. **Raíces** en las terrazas: cada pie atado a dos vecinos,
  y raíces de la primera fila que avanzan hacia la sala.
- **Interacción física 1 — cubos de datos**: 200 cubos de alambre y teselas de cromo iridiscente (con `room.envMap` de T-028; sin él,
  esmalte plano) flotan a 0,1–1,1 m tras los muros (0,25–2,5 m de alto) + 110 sobre la multitud. La mano (mismo frame) suelta los que
  tiene a < 0,7 m en el plano del muro: caen con gravedad (7,8 m/s²), giran, rebotan en el suelo y en los peldaños de las terrazas
  (restitución 0,42, rozamiento), se posan y a los 5–8 s suben girando a su sitio. Una mano que se mueve barre los que roza. Cuando un
  muro se llena (`wall:<i>`) sus cubos llueven en cascada a lo largo del muro.
- **Interacción física 2 — el haz de fibras**: al llegar la mano, destello coral en la palma y 30 fibras brotan de ella hacia la
  multitud (en 0,8 s) y se anclan en los 5 cuerpos más cercanos y en la tierra; sostenida, el haz **se tensa** (se endereza, tiembla,
  un pulso corre hacia la palma) y los cuerpos enganchados **se inclinan con su peso** sobre los pies y **se elevan** 16 cm (muelle
  amortiguado: al soltar se balancean de vuelta). Charco coral en la rejilla del suelo bajo la mano.
- **Tres profundidades**: cubos 0–1 m tras el muro · multitud 5,9–8 m · nubes lejanas de 42 000 puntos (turquesa con hebras coral) a
  19–34 m, con giro propio más lento (paralaje).
- **Movimiento de sala** (sólo mi `object`): con el llenado medio la multitud sube alrededor de la sala hasta +0,5 m (≤ 5 cm/s);
  al cerrarse el círculo toda la pinya gira a ≤ 3°/s con aceleración suave (las bandas giran además ±1,7°/s: máximo ≈ 4,7°/s),
  y se para suave en el premio.
- **Premio (reward / bloques siguientes)**: los puntos se vuelven teselas cuadradas esmaltadas (cobalto, turquesa, coral, oro): el trencadís.
- **arrive/leave**: los puntos vuelan por fragmentos (más tenues que antes y se apagan pronto, para no tapar la banda de la guía),
  las fibras crecen/se retiran, los cubos se ensamblan/dispersan, las nubes se desvanecen.
- Con T-028: las normales de la mano se pasan por la inversa de la matriz del mundo (correcto bajo el rig del host).

**Parámetros (estudio)**: fill, closed, dry (teselas), arrive, leave, glow (calor coral), light, breath, density (0,3–1 de los
puntos), move (movimiento de sala), fibres, cubes. `res-3d-study/parts/pinya3d.json` actualizado.

**Comprobaciones** (sin errores de consola en todas; fps no medidos, regla de QA):
- Estudio WebGPU: dormidos, fill 0,6, 4 manos fijas a +0,15/0,7/1,5/4,5 s (cubos cayendo: 32/18/3/0), cerrado, leave 0,45,
  arrive 0,55, teselas. Estudio WebGL2 con manos: igual (20 cubos cayendo a 0,7 s).
- Obra (`res-obra3d/review.html?people=6`, salto a pinya): llegada (teselas de INT), juego con fill 1/0,72/0,16/0,66, cierre,
  salida a tronc a +0 y +3,2 s (a +3,2 s ya no queda nada de la pinya). WebGPU y `renderer: webgl2` sin errores.

**Capturas:**
- manos a 0,7 s (cubos cayendo, haz de fibras, charco): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/t700_p1.png` · detalle `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/t700_zoom.png`
- manos sostenidas 4,5 s (haz tenso, cuerpos inclinados): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/t4500_p1.png`
- círculo cerrado (rotllana coral, tesela de cromo): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/closed_p1.png`
- la obra jugando la pinya (4 muros): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/obra/play.png` · cerrando: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/obra/closed.png` · WebGL2: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/obra/play_gl2.png`
- hoja de estados (dormido · cerrado · leave · arrive · teselas · WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/sheet1.png`

**Para INT (petición, no bloquea):** `res-obra3d/experience.js` l. 64 pasa `density` sólo a castell; si se añade
`if (name === 'pinya3d') params.density = DENS[P.quality] ?? 1;` la calidad media/baja aligera los puntos (drawRange, sin coste).

**Eventos para sonido (ola 2)**: la parte expone `impacts` (en el objeto devuelto y en `window.__pinya3d.impacts`): por frame, los
cubos que golpean el suelo con fuerza > 1,2 m/s → `'fx:impact'` (muro, u, fuerza). Otros candidatos: `'fx:bundle'` al brotar el
haz (mano, muro, u) y `'fx:taut'` cuando se tensa.

**Lo que falta / riesgos:** la multitud con fill alto en la obra es densa y luminosa detrás del texto de la guía (1,8–2,4 m):
mirar con GUI/QA; coste de 458 × 1 600 puntos + 6 400 fibras sin medir (QA), `density` es la palanca; los cubos tras el muro a veces
caen dentro de la multitud (atraviesan cuerpos); las fibras del haz no esquivan cuerpos.

## T-030 · pulido (director 13:05 + dirección de arte 13:10) — 13:20
Respaldos intermedios: `parts/pinya3d/pinya3d.T030a.js.bak` (primera versión), `pinya3d.T030b.js.bak` (antes de la dirección de arte).
- **Primera fila** a lo largo de cada muro, 1,25–1,9 m detrás, a tamaño real (cabezas ≈ 1,65 m en el muro), 3 200 puntos por cuerpo; no gira
  con la rotllana (grupo contra-girado), se queda junto a su muro. Detrás, 5 anillos con huecos (7 %), alturas 0,84–1,1, filas desordenadas,
  y **bruma teal #0E5F66** con la profundidad y en las piernas (≈ 30 % de contraste al fondo).
- **Zona tranquila del texto**: puntos y fibras se apagan un 70 % en la banda 1,75–2,5 m × centro del muro (en la vista de cada muro, la banda
  es fija en NDC), y las cabezas cerca del centro bajan un 10 %.
- **Fibras de agarre color hueso #F0D9C4** (7–14 mm) de hombro a hombro y del brazo a la espalda del vecino, en la primera fila (por muro) y en
  el primer anillo (cerrado alrededor de la sala); cerca de una mano engordan y se vuelven coral, el radio crece al tensarse; nudos rojos
  #E23B2E en los hombros; al cerrar el círculo una **trenza de luz** recorre el anillo. Las fibras propias de cada cuerpo pasan a turquesa.
- **Haz de la mano**: sale del pecho (o de los pies) de los 5 cuerpos enganchados de la primera fila, primero hacia la sala (ya no atraviesa
  cuerpos), y llega a la palma. Inclinación 10–15 cm (no más), elevación 6 cm, **onda de apretón a 0,8 m/s** por la multitud.
- **Al soltar**: los cuerpos que estaban enganchados **se desgranan como arena** (caen, rebotan en la rejilla, vuelven a subir en 3,2 s).
- **Cubos**: cerca sólo 8 piezas por muro (8–30 cm, teselas de cromo iridiscente turquesa/blanco/coral/rojo), la mitad junto al botón;
  rebotan contra las piernas de la primera fila (plano a 1,18 m) y no atraviesan el muro. Los cubos de alambre **con un punto dentro**
  sólo en una rejilla ordenada a 17 m. 
- **El cielo: una sola forma**: un toro en espiral de 56 000 puntos (8 m, a 12,5 m entre los muros 0 y 1, a 7 m de alto) girando 3°/s;
  nubes lejanas tenues a 28–45 m.
- Paleta de la biblia (§2): turquesa #2ED3C6, coral #FF6F59, teal, hueso, rojo. La sala sube ≤ 0,3 m (antes 0,5).
- **Sonido (ola 2)**: snippet de ENT dentro: cubo que golpea el suelo > 1,2 m/s → `fxImpact(muro, u, fuerza, 'ceramic'|'wire', 'floor')`;
  cubo que vuelve a su sitio → `fxAt(p, 0.4, …, 'lock')`; ≤ 16/s; canal cerrado en dispose.
- Arreglo: el material de puntos pasaba de 16 entradas de fragmento en la obra (error de pipeline WebGPU) → varyings empaquetados.
- Comprobado: estudio WebGPU (fill 1, manos a 0,7 / 4,5 s, cerrado) y WebGL2 con manos; obra `review.html?people=6` saltando a pinya,
  WebGPU y WebGL2: 0 errores. Con la máquina cargada el horneado tarda 7–9 s (readyMs) y la carga de la obra 5–7 s.
- Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/q_sheet.png` (fill 1 · manos 0,7 s · cerrado, muro P1), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/q_t4500_p1.png` (haz tenso, agarres coral),
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/obra/q0.png` (obra, 4 muros), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/q_gl2_p1.png` (WebGL2).
- Assets CC0: no hacen falta para la pinya (todo procedural).

## T-030 · dirección de arte, ronda 2 (13:40) + zonas tranquilas (14:00)
Respaldo previo: `parts/pinya3d/pinya3d.T030c.js.bak`.
- **Muros sin manos ya no negros**: luz de calma por cuerpo (canal i2.z; el paso de la sardana pasa a un uniform): primera fila ~60 %,
  turquesa pleno, anillos de atrás menos; **una respiración recorre la sala en 12 s** (de muro a muro).
- **Brazo de galaxia** en vez del toro: 70 000 puntos, 5 hebras trenzadas, a 14–19 m y 6–10 m de alto, rodea la sala entera (lo ven
  los cuatro muros), gira con la sala; tenue (0,04): nunca más brillante que el nudo de la mano. Fin del techo quemado.
- **Cuerdas**: cada agarre es un haz de 6 hebras trenzadas (radio 9 mm, 2,5 vueltas/m) de hombro a hombro + 5 hebras del brazo a la
  espalda del vecino; cuelgan (7 cm) y **se tensan rectas** al sostener; base hueso más tenue, coral fuerte cerca de la mano.
- **4 posturas de pinya** (una por tipo de cuerpo): brazos sobre los hombros de los vecinos · manos en la espalda del de delante con la
  cabeza baja · brazos arriba sosteniendo · un brazo sobre el hombro y el otro empujando.
- **Teselas cercanas biseladas** (plato roto irregular de 5 lados, bisel 2,5 cm que coge la luz) en lugar de cajas.
- **Zonas tranquilas** (biblia §4): texto ±1,6 m × 1,72–2,3 m (−72 %) y botón ±0,9 m × 0,88–1,62 m (−85 %), en puntos, fibras y cuerdas
  (el haz y el destello de la mano no se apagan: son la respuesta). Medida en estudio fill 1 antes del −85 %: texto p99 56–77/255 (≤ 89 ✓),
  botón p99 111–137 (✗) → zonas a plena fuerza DENTRO de los límites (borde suave por fuera), −85 % en el botón, cuerdas también, las 4
  teselas «del botón» pasan a 0,97–1,3 m del centro (fuera de la zona; la mano en el botón las tira con radio 1,15 m). Medido (estudio,
  p99 de luma /255, 35 % = 89): fill 1 texto 45–64, botón 50–56 ✓ · cerrado texto 41–90, botón 47–93 (P1 en el límite: la banda de la
  rotllana que pasa) · con manos el botón sube (es la respuesta de la mano: haz y destello, no se apagan). Herramienta: scratchpad
  `pinya3d/a2/zones.py`. WebGL2 con manos: 0 errores.
- **Arreglo (INT 14:10)**: el suelo de terrazas era opaco y oscuro y tapaba el mundo saliente en los primeros frames de la llegada → ahora es
  aditivo y sin profundidad (sólo su rejilla de luz). Estudio con arrive 0,05: 0 errores.

## T-036 — la caída re-hecha (fall3d) · 14:15
Ticket `tickets/T-036-3DPI-caida.md`. Respaldos `parts/fall3d.ARTE2.js.bak`, `res-3d-study/parts/fall3d.json.ARTE2.bak`.
- **Qué torre cae**: intent (tras el Pom) y el estudio → una **tronc3d privada** de fall3d (pisos del grupo, muros de la estructura), girada
  32° alrededor de la sala para que quede al lado de las palabras (zona tranquila) y encuadrada con la subida de tronc3d escalada: el muñón
  que queda al pie del muro y los pisos que caen atraviesan toda la altura. Se ensambla desde sus fragmentos en 1,5 s y cae en el resto con el
  guion de tronc3d.collapse (temblor, grieta, la mitad de arriba se inclina y se deshace de arriba abajo, fundido a negro).
  carregat desde la bajada → la torre de vidrio de **baixada3d es el castell** y se suelta sola; fall3d mantiene oculta la tronc3d del host
  (takeFloor cada frame después de que la bajada la devuelve: si no, reaparecería una segunda torre) y levanta un **velo de polvo** al pie.
  Con la tronc3d del host visible (sin baixada3d) → `collapse({ mode, duration })` del host.
- **Encima, materia de fall3d**: cada piso que se suelta lanza esquirlas grandes de cerámica esmaltada (platos rotos irregulares con bisel,
  paleta del Tronc: terracota, cobalto, turquesa, ocre, blanco), con gravedad, giro, aterrizaje sobre lo que sigue en pie; un golpe fuerte las
  **parte en 3 teselas** que rebotan; cada golpe levanta polvo (cálido-gris, sube y se aclara); el borde recién roto arde oro → brasa → negro.
  Desde duración − 3,2 s todo se va a negro. Sonido: piso que se parte `stone/break`, esquirlas `ceramic/floor`, `ceramic/break` (≤ 3/s);
  las piezas de la torre ya las hace sonar tronc3d.
- Comprobado: estudio WebGPU (t 1–11,5) y WebGL2; obra intent desde pom (WebGPU, pace 1 y 2) y carregat desde tronc→baixada: 0 errores.
  La obra en WebGL2 con la máquina cargada pasa del límite de 15 s de check.mjs (no es un error de la parte).
- Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/ksheet.png` (estudio t = 2 · 5 · 8 · 11,5), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/hpair.png` (esquirlas volando y posadas en el muñón, t = 4 / 6),
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/o_intent60.png` (obra intent, pace 2, antes del giro de 32°), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/o_carregat3.png` (obra carregat).
- **Pedidos (vía director)**: (1) 3D-FE: `tronc3d.collapse()` deja `col.on` hasta `restore()`; que tronc3d haga `restore()` al volver su
  bloque 'tronc' o al resetear (fall3d no recibe updates cuando se va) — si no, el pase siguiente arranca «cayendo». (2) 3D-PO: que baixada3d
  no devuelva los pisos de tronc3d si el bloque es 'fall' (hoy los devuelve al irse y fall3d los vuelve a ocultar al frame siguiente: puede
  verse 1 frame). (3) 3D-FE: zonas tranquilas en tronc3d (en la caída la torre del host está detrás de «Ha caído»).
- Falta: pulir con QA (tamaño/brillo de las esquirlas en la obra, lectura del polvo), captura de la obra con la torre girada.

## T-030 · segunda pasada física (QA 14:20: «tocar da luz coral, no masa») — 13:45
- **La mano suelta MASA**: cada toque hace que los cuerpos enganchados den un **tirón** hacia la mano (impulso en el muelle) y **sacude
  7 piezas** de cromo/esmalte de 15–40 cm (platos rotos biselados) que salen volando de sus pechos hacia la sala, caen, rebotan en el suelo
  y en los peldaños, ruedan, se posan 4–6 s y se funden de vuelta. Sostenida: cada 1,3 s el agarre vuelve a tirar (los cuerpos se
  tambalean) y caen 2 más. Al llenarse un muro: 6 piezas de su primera fila. **Al cerrarse el círculo: cascada** alrededor de toda la
  sala (una pieza de cada dos cuerpos de la primera fila en 2,5 s). Pool de 96. Las 8 teselas cercanas por muro siguen (radio de la mano 1,15 m).
- Medida (estudio, 4 manos): a 0,7 s **34 piezas cayendo** (28 sueltas + teselas); a 1,5 s 35; cerrado: 50 sueltas en la cascada.
  WebGL2 igual. Obra (salto a pinya): 0 errores, 30 cayendo con el público virtual.
- Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/L_pair.png` (0,7 s y 1,5 s junto a la mano), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/L_closed_s.png` (cascada), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/obra/L0.png` no (ver `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/obra/L0.png`).

## 13:55 — ronda 3 de arte (Pinya aprobada) + la caída en la obra
- Pinya: menos teselas pastel en el suelo — las piezas sueltas son turquesa 55 %, coral 25 %, rojo 10 %, blanco 10 %; reposan 2,2–3,6 s
  (antes 4–6,5) y salen 6 por toque (antes 7).
- Caída en la obra (intent desde el Pom, `review.html?people=6&params={"pace":2}`, 0 errores): la torre privada ya está **al lado** de
  «Ha caído», no detrás: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/obra_fall_2.png` (t ≈ 6,8 s del score: con pace 2 la física va a tiempo real, así que es el principio del
  derrumbe) y `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/obra_fall_1.png` (t ≈ 5). Con pace 1 la ventana de 15 s de check.mjs no llega al derrumbe completo; la secuencia
  entera está en el estudio: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/ksheet.png`.

## ~14:50 — ronda 4 de arte
Respaldos: `parts/pinya3d/pinya3d.T030d.js.bak`, `parts/fall3d.T036a.js.bak`.
- **Pinya**: fuera las teselas flotantes del suelo (0 por muro) y la rejilla de cubos de alambre; las piezas que suelta la mano son esmalte
  saturado (turquesa / coral / rojo, sin película iridiscente ni blanco) y ya no se queman a blanco (brillo máx. 1,3). 4 manos: 31 cayendo
  a 1,5 s; WebGL2 0 errores. Captura `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/a2/P4_crop.png`.
- **Caída**: en los **cuatro muros** (la torre privada usa todos los muros, no sólo la estructura; el velo de polvo de carregat también);
  **noche azul** (cúpula aditiva: nunca tapa el mundo que sustituye), **brasas** que suben desde el pie de cada torre y **charcos de luz
  de farol** (3 por muro) en el suelo; todo se apaga con el final. Estudio y obra (intent, pace 2): 0 errores.
  Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/nsheet.png` (estudio t = 2 / 6), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/fall/obra_fall_3.png` (obra, 4 muros).
- **No es mío (para INT)**: los «dorsos blancos planos» de los fragmentos de `o_carregat3` son las esquirlas de la plaza (`plaza.js`);
  el «grano / ruido» es el grano del postproceso de `room3d.js` o las motas de `atmos`.

## 15:00 — T-044 aparcado (director)
Ticket escrito (`tickets/T-044-3DPI-juntarse.md`). Empecé el sustituto (figuras de palma con dedos, seguir ≤ 0,3 m/s, huecos oscuros, baixos
que suben, balanceo) pero **sin probar**: está guardado aparte en `parts/pinya3d/pinya3d.T044-wip.js.bak` y `pinya3d.js` vuelve al estado
aprobado de la ronda 4 (= `pinya3d.T044.js.bak`). Para retomarlo: copiar el wip encima y probar (2 manos en P1 separadas 1,5 m, arrastrar).

## T-044 · retomado (director) — sustituto funcionando
Respaldo del estado aprobado: `parts/pinya3d/pinya3d.T044b.js.bak` (volver = copiarlo encima).
- **Palma con palma = la diana**: en cada muro una figura de puntos (con dedos) espera con la palma abierta en el centro a 1,25 m,
  respirando. Una mano a < 0,9 m la toma; si cae en otro sitio sale otra figura de la primera fila (pool 12) y apoya su palma (0,9 s).
- **Seguir**: en contacto (< 0,2 m) la figura se desliza hacia el centro del muro a ≤ 0,3 m/s (`slide`) y la palma con ella; las palmas de un
  muro se ordenan hombro con hombro (0,5 m). Si la mano se queda atrás, la figura **espera 1,6 s, vuelve a buscarla y tira otra vez**.
- **Huecos**: con manos en un muro, la primera fila y el primer anillo sólo se encienden detrás de cada palma (gaussiana 0,55 m): donde falta
  gente quedan agujeros oscuros; juntas, las luces se funden (y las cuerdas pasan el coral de cuerpo a cuerpo).
- **Apretar → baixos**: muro apretado (sustituto: ≥ `packN` manos en ≤ 1,5 m; o evento `pack:w`) → los 3 cuerpos centrales de su primera
  fila suben 0,45 m en ~2,5 s y la multitud se balancea; con `need` muros apretados, toda la sala.
- **Score**: aún no hay campos de Pinya de ENT en `notas/ENT.md` (sólo el paso 0: `span[w]` = ancho total de manos en los 2 m más densos,
  que NO uso como «apretado» hasta que ENT defina el umbral). La parte ya escucha `pack:<w>`; falta `palm` y el fill por span → cablear
  cuando aparezcan.
- Pruebas: estudio (una mano fija a −1 m y otra arrastrada desde +1 m hacia el centro): la arrastrada llega a +0,25 con contacto 1; la fija
  tira y espera (contacto 1 en su sitio); apretado 0,87, balanceo 0,26. Obra (`review.html?people=6`, el piloto reúne manos en P4):
  palmas en P4 −0,27 / 0,24 / 0,42 y P1 0, apretado P4 0,8; WebGPU 0 errores.
- Hoja de contactos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t044/t044_sheet.png` (arriba: obra a +3,5 s y +5,5 s; abajo: estudio, dos palmas juntándose y los baixos arriba).
- Pendiente: WebGL2 de esta versión; quitar el anillo de la guía en la Pinya (GUI); cablear los campos de ENT.
- **Cableado a ENT (T-042)** (respaldo previo `pinya3d.T044c.js.bak`): con partitura, apretado = `state.pack[w]` / `packed[w]` (+ `pack:w`);
  en `pinyaStage === 'palm'` las figuras no se deslizan (sólo palma con palma), en `'pack'` sí; `assist` (la red) va cerrando los
  huecos oscuros; los baixos suben con el cierre del círculo (`closed`). Sin partitura (estudio) sigue el sustituto por separación de manos.
  Obra con el piloto (salto a pinya, t 22 s): stage pack, pack [1,1,0,0], learned.pinya true, palmas en P4 −0,27/−0,11/0,25/0,32 y P1 0;
  WebGPU y WebGL2 0 errores. Hoja actualizada `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pinya3d/t044/t044_sheet.png` (arriba WebGPU y WebGL2 en la obra; abajo estudio).
  **El anillo de la guía sigue visible** sobre la palma en los cuatro muros con `learned.pinya = true` (GUI).
