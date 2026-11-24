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
