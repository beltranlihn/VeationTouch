# Cuaderno de 3D-BR

## 03:52 — fall3d intent: el castell del grupo a plena luz; la «estrella de la enxaneta» no es de fall3d; respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fall3d.v5.js`
- La reunión del castell ya llega a su luz normal casi al instante (antes, cada partícula a media luz hasta llegar), y en intent el castell
  conserva toda su luz hasta que empieza a deshacerse (el oscurecimiento tras la grieta, añadido a las 03:45 para carregat, también
  apagaba el castell de intent justo al formarse). Carregat sin cambios.
- **La estrella blanca en P4** (banda de la guía P4 73–84 de +1 a +4,5 s) es la luz de la enxaneta de **pom3d** que sigue mientras Pom se va,
  junto con sus esquirlas doradas: con `&parts=castell,fall3d` (sin pom3d) no hay estrella y la banda del texto (1,8–2,4 m) queda en 10–37
  de media. **Para 3D-PO / INT:** apagar la luz de la enxaneta de pom3d al salir hacia `fall`.
Evidencia: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/intent_board.png` (obra, +1 / 2,5 / 3,5 / 4,5 s), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/ionly_board.png` (sin pom3d). Sin errores.

## 03:45 — fall3d carregat: la banda de la guía tras «IT FELL» (pedido tras PASA de QA); respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fall3d.v4.js`
Lo que subía la banda (P1 hasta 117 a +3 s) no era sólo el charco: era la pinya bajando, cuyas partículas brillaban más al caer (×1,3), y
el charco (muchas partículas sumándose en el mismo sitio). Cambios: al caer se apagan (×0,6), en el suelo se esparcen 0,3–1,2 m hacia
fuera y brillan mucho menos (charco bajo y ancho), y tras la grieta la luz del castell empieza a irse (al 50 % entre 1,2 y 2,8 s de guion).
t = 0 sigue siendo el castell de castell.js (traspaso sin salto).
Banda 0,9–1,6 m, 40 % central, en `res-obra3d` (baixada → fall carregat):
- obra completa: +2,5 / +3,0 / +3,5 / +4,0 s → P4 38 / 49 / 33 / 25 · P1 62 / 65 / 38 / 28 (antes P1 81–117 a +2,5–3,0 s);
- sólo castell + fall3d (`&parts=castell,fall3d`, la guía encendida): t 0 P1 61 (el castell entregado) · +2,5 / +3,0 / +3,5 s → P1 35 / 49 / 22,
  P4 26 / 38 / 19: **lo de fall3d queda ≤ 49**; los ~15 que faltan en P1 de la obra completa son las farolas de la plaza junto al texto
  (plaza, no mío) durante ~0,5 s.
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/cpool_board.png` (obra, +2,5 / 3 / 3,5 / 4 s), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/only_*.png`. Sin errores.

## 03:36 — T-024: el rastro (FALLA de QA 03:29); respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T024.js`
Causa: la cinta salía sólo si la velocidad del sensor (`vx`) pasaba de 0,2 m/s; con manos colocadas paso a paso (el método de QA, y a veces
el sensor real) esa velocidad es 0 y no salía nada. Ahora la cinta sigue la **distancia que la mano recorre de verdad** (≈ 4 brasas por cm,
repartidas por el tramo recorrido): brasas más gruesas que cuelgan casi quietas, oro al pasar la mano, rojo después, ceniza gris al final
(2–3,2 s).
Re-check con el método de QA (`capture.py`, su `--js`: 41 `put` cada 50 ms de 1,5 a 3,5 m en P1 a 1,2 m, progress 0,6, sin ola):
zona 1,2–2,9 m sobre P1 1,5–3,5 m → **5,31 % de píxeles > 60** (QA midió 0,01 %; control sin mano 0,01 %); franja del camino 1,05–1,45 m
→ 27 % (control 1,8 %). Cinta visible de punta a punta: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t024/drag_qa_board.png` (arriba con arrastre, abajo control),
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t024/drag_qa_strip.png`. Sin errores.

## 03:20 — la caída dentro de la obra (hallazgo del álbum, T-023); respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fall3d.v3.js`
Comprobado en `res-obra3d` (jump baixada → todos sueltan → `fall` carregat; jump pom → `fall` intent), capturas a la escala de la sala.
- **El traspaso está bien** (no es del host): a +0,3 s fall3d muestra el castell de la baixada (2 muros de la estructura, P4 y P1; castell.js
  apagado). **El cuadro «casi vacío» era mío:** con `duration` 12 toda la torre carregat caía entre ~2 y ~4 s y quedaban 7 s de suelo y polvo.
  Ahora carregat **se hunde piso a piso desde la base en ~5 s** (la parte alta baja mientras espera su turno) y las brasas del suelo duran
  algo más: a +3,5 s media torre en pie hundiéndose en una lluvia de luz; a +5,8 s sigue cayendo. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/carregat_board2.png`
  (+0,3 / +3,5 / +5,8 s; antes: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/carregat_board.png`).
- **Intent desde Pom en la obra:** +0,3 s la ciudad de Pom se rompe; +1 s el castell del grupo (5 pisos de tronc, de 7 pisos; muros de la
  estructura) se reúne de fragmentos en el negro; +2,5 s completo; +4,5 s la mitad alta lanzada a un lado. El host le daba a fall3d un
  fundido de llegada de 5 s (el castell se reunía a media luz): ahora en intent la reunión ES la llegada (visible del todo en cuanto llega).
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/obrafall/intent_board.png` (+0,3 / +1 / +2,5 / +4,5 s). Sin errores en ninguna captura.
- Nada que pedir a INT.

## 00:15 — T-024 la interacción contra el guion (correfoc); respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T020.js`
Estudio, `?lidar` (10 Hz, 150 ms tarde, lecturas perdidas), manos a 0,5–1 m/s, progress 0,6. Hallazgos y arreglos:
- **+100 ms: una bola blanca** donde aterriza la mano: no era el destello del muro sino ~900 chispas saliendo del mismo punto en el mismo
  frame (aditivo + bloom). Ahora la fuente es un **chorro de 0,6 s** desde la mano hacia el mundo (un «chorro», como dice el guion),
  más un estallido pequeño inmediato; chispas oro-naranja que se enfrían a rojo (calor 2,3 → 1,75; goteo 1,9 → 1,5); el destello en el
  muro, naranja y pequeño. Con `?lidar` la mano aparece a los ~150 ms (el retraso del playback, a propósito): por eso +100 ms aún no muestra
  nada en el tablero; la latencia real (`latency.js` de QA, sin el retraso): **46 ms WebGPU, 43 ms WebGL2, 1 frame**.
- **Una mano, tres diablos:** con LiDAR la mano vuelve con otro trazo (el `up` del viejo llega ~0,3 s tarde) y eso volvía a lanzar la fuente
  y un diablo. Ahora una llegada a < 0,6 m y < 0,8 s de una mano que se fue, o a < 0,35 m de una mano que sigue en el muro, es la misma
  mano: ni fuente nueva ni diablo nuevo. Arrastre de 2 s: 1 diablo (antes 3).
- **El rastro:** una mano arrastrada deja una cinta de brasas lentas que cuelgan donde pasó, bajan y se apagan (2,2–3,4 s).
- **10 manos** guionizadas a 0,5–1 m/s: animado pero no un muro de chispas. **15 manos** (instrumento y pines de QA): los relevos de ola en
  multitud sólo con < 4 diablos; P4 48–54 · P1 20–21 · P2 44–45 · P3 28–31 (≤ 60) en 3 corridas.
Tableros: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t024/touch_drag_board.png` (toque +0,1 / +0,5 / +1,5 s y arrastre), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t024/groups_board.png` (4 manos WebGL2, 10 manos);
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/qa15/h15_t024_*_meta.json`. Todas las capturas `errors: []`.

## 00:08 — T-020 (la espera), techo de 15 manos con el instrumento de QA, fall3d intent desde Pom, T-022 (mis dos líneas)
Respaldos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T017time.js` (antes de T-020), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fall3d.v2.js` (antes de intent).
**Error mío encontrado y corregido:** en el techo de grupo (23:31) un comentario `//` se tragó el resto de una línea: `U.haze`, `U.smoke`
(y luego `U.wait`/`U.breath`) no se escribían (quedaban en su valor por defecto: el humo y la bruma iban siempre a 1, el parámetro no
mandaba). Ya escritos.
**T-020 la espera** (`state.block === 'wait'`; estudio: param `wait`). El lecho se estrecha a una franja fina lejana (9–10 m tras los muros)
que el muro muestra a 1,06–1,19 m: una línea de brasas continua alrededor de toda la sala; respira en 6 s (0,35 → 1, con una ola lenta que
recorre la línea), atenuada al 45 % detrás de cada anillo de botón; sin llamas, esquirlas, humo ni diablos; de vez en cuando una brasa
sube de la línea; una mano la enciende al instante en su sitio (calor del campo + destello en el plano del muro) con un chorro pequeño.
La salida de la espera conserva la espera (el part guarda el último bloque que sirvió; ver T-022).
Medida con `capture.py` de QA en `res-obra3d` (guía encendida, `pace` 0,001 para que el score no salga de la espera, disparo en el máximo
y el mínimo de la respiración):
- brasa3d sola (`&parts=brasa3d`): muro bajo luma 15 = **96,7–97,2 %** en los 4 muros (máx. y mín.); línea en la costura P3|P4: salto 1,4
  frente a 1,6 dentro de P3 (continua); pico de la línea 136–155 (máx.) / 45 (mín.); mano a +100 ms: luz local y chispas; WebGL2 igual.
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/wait/wb_board.png` (máx., mín., mano, WebGL2), `wb_*_strip.png`.
- obra completa (con atmos): 53–56 % bajo luma 15: **lo que rompe la oscuridad es atmos** (las lámparas de muestra cálidas y la bruma
  parda en lo alto), no brasa3d: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/wait/wait_board.png`. **Para INT**: en la espera, atmos sin lámparas de muestra (`demoLamps` false) y
  con poca bruma, o la espera no será «oscuridad casi total».
**Techo de 15 manos con el instrumento de QA** (`capture.py`, sus 15 pines, progress 1, disparo a +2,5 s). Reproducido antes del cambio:
P4 103 · P1 65 · P2 85 · P3 52. Causas: el lecho (con 15 manos y olas) ocupa el tercio bajo de la banda, y hasta 9 diablos. Cambios: el
calor del lecho escala con la multitud (0,6 con 15 manos; 1 con 1–4), con muchas manos 2 diablos de mano como máximo y los relevos de ola
sólo si bailan < 6, diablos y chispas de ola más tenues en multitud. Después (3 corridas): **P4 52–56 · P1 20–22 · P2 45–51 · P3 29–34**
(≤ 60). 1 mano igual que antes. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/qa15/h15_before_after.png`, `h15_v3_*_meta.json`.
**fall3d intent desde Pom** (DECISIONES 23:52): para intent no se lee el castell en pantalla (no lo hay en Pom): una instancia privada de
`castell.js` con los pisos del GRUPO (`acta.floors` / `stats.maxFloors`; tronc = pisos − 2, 4–7; quatre si `structure` 4), en los muros de la
estructura, se reúne de fragmentos que giran y caen en su sitio durante 1,5 s, y después corre el guion en lo que queda de `duration`
(12 → 10,5 s). carregat sigue leyendo el castell en pantalla. Tablero (duration 12, floors 7): t = 0 negro · 0,75 reuniéndose · 1,5
completo · 3 quieto · 6 cayendo · 9 polvo · 12 negro: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/board_intent12.png`; WebGL2 t 0,75 `fall/i12_gl.png`. Sin errores.
**T-022 (1) intro→brasa:** brasa enciende un resplandor rojo tenue en todo el anillo al llegar (~0,4 s) y después tramo a tramo (umbrales
más tempranos). arrive 0,07 / 0,14 (0,35 / 0,7 s): 837 / 2 904 px de luma > 25 (antes 321 / 1 972). `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t022/arr_board.png`.
**T-022 (2) brasa→pinya:** en `res-obra3d` la rampa de salida es normal (leave 0,3 a 1,5 s, 0,65 a 3 s; la parte visible): **la causa no
está en la obra**. Era brasa3d: al salir leía el estado del bloque siguiente (pinya: progress 0) y se apagaba; y tras su premio (frío,
contraído) las esquirlas subían como ceniza oscura. Ahora guarda el último bloque/fase que sirvió y usa el progress del host (congelado al
salir), y cada esquirla se suelta como brasa viva que se enfría al subir; más motas. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t022/bp_board.png` (obra, +0/1,5/3 s),
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t022/lv_board.png` (estudio desde reward: +0 / 1,5 / 3 s). La salida sigue pasando la comprobación de QA (leave 0,6: 1,8–3 m 17 214 px
frente a 1,15–1,8 m 8 428; 0,85 casi negro).

## 23:45 — T-017 v2 (pedido del director: el traspaso sin salto, la grieta como línea, `duration`)
Respaldo de la v1 (torres propias de esquirlas): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fall3d.v1.js`.
**El traspaso.** `fall3d` ya no tiene torres propias: dibuja **el castell de `castell.js`** — su geometría (las mismas partículas y su
oclusor de profundidad), en sus sitios (la matriz de cada grupo: espejo de los muros 1 y 3 y `tilt` incluidos), con el `build` que tenía
cada torre al empezar la caída (congelado) y con su misma luz (oro abajo, perla arriba, silueta brillante, lado lejano tenue; la
respiración se detiene en el primer segundo). Fuente: `ctx.parts.castell` en `res-obra3d`; en el estudio, una instancia privada de
`castell.js` (importada, nunca añadida a la escena, sólo leída) con los ajustes de los capítulos (6,5 m, sin fit, `light` 1,75). No toco
`castell.js`.
Comparación t = 0 contra `castell.js` solo con esos ajustes (build 1): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/handover.png` (izquierda castell, derecha fall3d); diferencia
media de luma en la tira 0,91 (medias 8,19 / 8,09; el resto es el charco de luz del suelo de castell.js, que fall3d no dibuja). No he
comparado con `review.html?from=baixada` (no lo abrí); misma geometría y misma matriz: el traspaso debería ser exacto con `parts.castell`.
**Para INT:** en el bloque `fall`, mostrar `fall3d` y ocultar `castell.js` en el mismo frame (sin su disolución `fallK`); `castell` debe
seguir creado (oculto), porque `fall3d` lo lee. `duration: 12` (TIMES.fall) o subir TIMES.fall a 15; no toco `score.js`. `light` por
defecto 1,75 = el castell en los capítulos.
**La grieta** es una línea: intent, fisura fina vertical por la cara que mira a la sala, del pom a la mitad del tronc (1,6–2,35 s);
carregat, línea horizontal por los hombros de la pinya; blanca-oro, queda tenue hasta que se suelta. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/crack_intent.png` (2,0 y 2,3 s),
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/fix_board.png`.
**Caída:** cada partícula del castell cae con gravedad (estela corta), toca el suelo, se enfría a brasa y se apaga (en el suelo más tenue).
Polvo lento después. Negro a 15 s.
**Evidencia** (todas `errors: []`): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/board_intent.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/board_carregat.png` (t = 0/2/5/9/13/15); costura con `shift` 9 m (el castell
del estudio a caballo de P3|P4, intent t = 5): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/seam_fall.png`, salto de luma en la costura 23,5 frente a 21,6 entre dos columnas dentro
de P3; WebGL2 t = 5: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/webgl2_t5.png`.
**Sin medir:** fps (mismas partículas que `castell.js`, que deja de dibujarse; + 4 000 motas).

## 23:40 — T-017 entregado: `parts/fall3d.js` (+ `res-3d-study/parts/fall3d.json`)
**Qué es.** Una torre de fragmentos por muro de la estructura (`state.walls`; las 4 si no hay), donde `castell.js` pone sus castells
(mismo cálculo de distancia: cabe en la ventana): figuras sugeridas por esquirlas cálidas — pinya de tres anillos inclinada hacia
dentro, tronc de `floors` pisos de tres con los brazos en los hombros vecinos, pom de dalt (dosos, acotxador, enxaneta). Oro abajo,
perla arriba (la luz del castell). ~6 300 esquirlas por torre en un solo dibujo instanciado + 4 000 motas de polvo (aditivo). Todo el
movimiento es de forma cerrada en el vértice sobre el reloj del guion: cualquier instante se muestra exacto, nada se simula, nada se
asigna por frame.
**Guion (15 s).** 0–2 quietud (temblor apenas visible) · 1,6–3,5 la grieta: línea de luz por la cara que mira a la sala y un destello
donde cede (intent: arriba; carregat: en la pinya) · 3–9 el derrumbe: intent — la mitad alta se vence a un lado y la torre se deshace
de arriba abajo, las esquirlas altas en arco; carregat — cede la base y la torre se hunde en vertical, una lluvia de esquirlas · al
tocar el suelo rebotan apenas, un destello mínimo y se apagan (brasa → oscuro) una a una · 9–13 polvo lento que sube y se aclara ·
13–15 negro total.
**Contrato.** Lee `input.state.block/.t/.outcome/.walls/.stats.maxFloors` y `input.acta.floors`; el evento `fall` arranca un reloj propio
si no hay `state.t`. arrive / leave: fundido. Estudio: `outcome`, `floors`, `towers`, `duration`, `arrive`, `leave`, `shift` (sólo
pruebas: desliza las torres por su muro) y el `t` del host (con «Run the clock» apagado, un instante congelado).
**Aviso a INT / director:** `score.js` tiene `TIMES.fall = 12`; la secuencia está escrita para 15 s. O se sube `TIMES.fall` a 15, o INT
pasa `duration: 12` (el guion se comprime). No toco `score.js`.
**Evidencia** (todas `errors: []`):
- tableros a t = 0/2/5/9/13/15: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/board_intent.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/board_carregat.png` (muro P1 recortado); tiras completas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/intent_<t>.png`,
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/carregat_<t>.png`.
- costura P3|P4 (`shift` 17 m para llevar una torre a la esquina; intent t = 0 y 5): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/seam_fall.png`; a t = 5 las esquirlas lanzadas
  cruzan la costura; salto de luma a través de la costura 4,55 = salto entre dos columnas dentro de P3 4,38.
- WebGL2 t = 5: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/fall/webgl2_t5.png`, backend webgl2, sin errores.
**Sin medir:** fps (25 000 esquirlas + 4 000 motas; estimo poco coste, es una sola llamada de dibujo cada uno).
**Débil:** la línea de la grieta es fina y se lee más el destello que la línea; las figuras se leen como figuras a la distancia de la
torre (~15 m), no de cerca; con `floors` alto la torre es estrecha y alta (como la del castell).

## 23:31 — techo de grupo (pedido del director tras PASA de T-001/T-009; respaldo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T013.js`)
Con n > 4 manos cada mano da 4/n de su respuesta (fuente, goteo, brasas despertadas; el destello en el muro con √(4/n)); 1–4 manos
igual que antes. Diablos de mano: como mucho 5 vivos (los relevos de ola aparte). Medida (progress 1, banda de la guía 0,9–1,6 m,
40 % central de cada muro, media / p99): 1 mano 27,8–47,5 / 153–205; **15 manos 36,1–65,1 / 174–235** (QA medía 83–124 / 229–243 antes).
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/cap_board.png` (arriba 1 mano, abajo 15), `h1.png`, `h15.png`. Sin errores.

## 23:30 — T-013 entregado (sólo `brasa3d.js`; respaldo previo `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T009.js`)
1. **Esquirlas visibles al caer**: mientras caen prenden por los cantos (rojo oscuro → naranja al acercarse al suelo; nunca blanco antes
   del destello de aterrizaje), destellos de luna algo más fuertes al girar, y una estela fina: cada frame 3 chispas cortas y moribundas
   para 8 de las esquirlas que caen (en rueda, de las 200 que la CPU sigue). Barrido de arrive: a 1 s, 653 px de luma > 25 por encima de
   1,3 m (antes casi 0); bocanadas 200. Antes/después: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t013_arrive_ba.png` (arriba antes, abajo después; brillo ×1,6 para ver).
2. **Humo en columnas**: 24 columnas que la CPU coloca en tramos calientes y recoloca al acabar su vida de 12–20 s (fundido); los sprites
   suben por ellas, se ensanchan, se inclinan con un viento lento y se disuelven. `smoke` igual. Banda de la guía con/sin humo: 27,0 / 26,3
   (+0,7). Antes/después: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t013_smoke_ba.png` (izquierda antes, derecha después; filas: humo 1, humo 0, reward; brillo ×2,2).
3. **Coste** (QA midió 91 fps-eq tras T-009, 135 antes): sin medir yo. Recortes: las losas ya no evalúan ruido por vértice (mancha
   estática por esquirla en vez de `livePatch`: 2 400 × 84 vértices × 4 vistas); humo 6 000 → 3 500 sprites; las estelas reutilizan el
   búfer de chispas y los emisores (≤ 8 por frame, sólo durante arrive). Ningún dibujo nuevo.
- Salida (`leavecheck.sh`): leave 0,6 → 1,15–1,8 m: 1 864 · 1,8–3 m: 6 025 · > 3 m: 1 590, máx. 239; 0,85 casi negro. Pasa.
- WebGL2: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/t013_gl.png`, backend webgl2, sin errores. Todas las capturas `errors: []`.

## 23:20 — T-009 entregado (los 5 pasos; todo en `brasa3d.js` + `smoke` en el JSON)
Respaldo antes de empezar: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/brasa3d.T001-leavefix.js`. Ninguna captura con errores de consola; WebGL2 comprobado tras el humo (backend "webgl2").
1. **Esquirlas = losas**: prisma hexagonal biselado (84 vértices, normales planas), contorno irregular por esquina e instancia, grosor
   14–24 % del tamaño. Cara superior espejo (destellos de luna y del fuego de abajo), cara inferior y cantos de arenisca oscura con
   grano, iluminada por la luna y en cálido por el lecho; línea fina de luz en los cantos al girar (fresnel). El calor entra por los
   cantos (×1,3) antes que por la cara espejo (×0,75). Movimiento de salida sin cambios. Recortes: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/s1_zoom.png` (salida ×2 con brillo
   aumentado; juego), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/s1_board.png`.
2. **Diablos a paso humano**: velocidad en m/s del suelo de la plaza (no del muro); zancada y cadencia según la velocidad; un giro
   completo con salto de vez en cuando. Cada frente de ola deja un relevo de diablos cada 4 m de perímetro (2,6 s de vida, 2,6–3,4 m/s);
   `MAXD` 14. Medido (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/speed.js`, raíz de cada diablo en 2,5 s y 0,8 s): mano 0,71 / 1,0 m/s; ola 2,37–2,96 m/s (4 diablos de ola
   vivos). Tira: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/s2_wave.png` (`s2_small.png`).
3. **Humo**: 6 000 sprites grandes, mezcla normal, velo pardo oscuro lit en cálido desde abajo, sube 3–8 m donde hay calor, más en reward,
   0 con leave; textura de ruido en la opacidad. Parámetro `smoke` (0–2; 0 no dibuja). Banda de la guía (P1, 0,9–1,6 m) con/sin humo:
   media 27,6 / 25,5, p99 160 / 149: no le quita lectura. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/smoke_board.png` (con, sin, reward).
4. **Barrido de arrive 0→1 en 5 s** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/sweep_arrive_*.js`): 1 s (0,20): primeras esquirlas aterrizan con destello; 2,5 s (0,50): tramos
   del anillo prendidos; 4,5 s (0,90): anillo entero; bocanadas 190–200 (> 100). Leave 0→1 en 5 s: a 2,5 s suben; a 5,3 s `visible:false`,
   negro. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/sweep_board.png`. Nuevo en `__brasa`: `puffs()`, `roots()` (sólo comprobaciones).
5. **Ola por la costura P3→P4** (dos manos fijadas en x 0,905 y 0,965 de la tira, ola automática): a 1 s un diablo está justo sobre la
   costura y sus chispas, el lecho y las llamas siguen sin corte ni duplicado; a 2 s los dos corredores a cada lado. `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/seam_board.png`
   (borde derecho de P3 | borde izquierdo de P4, separador de 4 px mío). Trampa: dos pines a < ~100 px se anulan (el 2.º Shift+clic quita el 1.º).
- **Regresión de la salida** (`leavecheck.sh`, tras todo T-009): leave 0,6 → 1,15–1,8 m: 1 813 · 1,8–3 m: 6 465 · > 3 m: 1 220, luma máx. 245;
  0,85 → casi negro. Sigue pasando el criterio de QA.
- **Sin medir**: fps tras T-009 (humo + losas + 14 diablos); estimo < +1 ms. Pendiente del turno de QA.
- **Débil**: las esquirlas que caen en arrive son casi invisibles hasta que aterrizan (piedra oscura de noche); el humo es sutil, más velo
  que columnas.

## 23:15 — arreglo de la salida (FALLA de QA en T-001)
Causa: la subida era ~1 m en el mundo; a 9–10 m del ojo eso es ~0,3 m en el muro (parecían quietas), el giro era < 1 rad y el brillo
de espejo era bajo. Cambio (sólo el bloque de esquirlas de `brasa3d.js`): suben 2–5 m (a leave 0,6 el grueso a 1,8–3 m en el muro),
derivan un poco hacia la sala y se separan a lo largo del anillo, giran sin parar desde que se levantan, y la cara de espejo da
destellos breves de la luna y del fuego de abajo (más fuertes mientras suben); se adelgazan hasta 0 a ~0,9. Además (no bloqueante):
techo del calor más bajo para grupos (`soft = raw/(1+0,6·raw)`).
Comprobación (`scratchpad/brasa3d/leavecheck.sh`, 7196×912, progress 0,6, sin errores en las cuatro): píxeles con luma ≥ 25 por altura
en el muro, sin contar el lecho (< 1,15 m) — leave 0,35: 1,15–1,8 m 8 584 · 1,8–3 m 5 084 · > 3 m 574; leave 0,6: 2 377 · **7 161** ·
2 332, luma máx. 241; leave 0,7: 227 · 4 280 · 1 339; leave 0,85: 3 · 102 · 219 (casi negro). Hoja (muro P1):
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/leave_board.png`;
tiras `leave_0.35.png`, `leave_0.6.png`, `leave_0.7.png`, `leave_0.85.png` en la misma carpeta.
Sigue pendiente (T-009): las esquirlas son planas (de cerca, algo de confeti).

## Dónde quedé (23-11, 22:30) — T-001 entregado, pendiente de QA y del turno de GPU

Archivos (sólo estos): `lab/experiments/ressonancia/scenes3d/parts/brasa3d.js`, `lab/experiments/res-3d-study/parts/brasa3d.json`.

**Qué es.** I. Brasa en 3D: la noche y el fuego despertando alrededor de la sala.
- **Anillo de brasas**: un lecho de carbones en el suelo de la plaza, 4–8 m detrás de los muros, continuo en esquinas y en P3→P4
  (malla radial desde el ojo). Ruido en coordenadas de mundo (terrones, grietas incandescentes, costra de ceniza), respira. Calor =
  nivel del capítulo (progress) + campo de calor 1-D de 512 celdas alrededor del perímetro (manos, olas; textura RGBA8) + llamarada
  de `awake`. Progress 0: sólo algunas manchas vivas, rojo oscuro; 1: anillo entero con llamas bajas (36 000 sprites analíticos).
  Techo suave del calor: diez manos no lo blanquean.
- **Toque = correfoc**: en el mismo frame del `down`, una fuente de ~940 chispas sale del plano del muro HACIA el mundo (cómputo GPU
  TSL, 131 072 chispas, anillo de 64 emisores por frame): arco con gravedad y arrastre, rebote en el suelo, se enfrían blanco-oro →
  naranja → rojo; un destello cálido en el muro bajo la mano (< 1 frame) y las brasas de delante se despiertan. Mano quieta: goteo;
  mano arrastrada: estela que hereda su velocidad.
- **Diables**: hasta 10 figuras de fuego (esqueleto procedural por diablo, piernas por IK de dos huesos, cuernos sugeridos, una forca
  con dos carretilles que giran y escupen chispas), dibujadas como ~4 500 partículas sobre cápsulas, cada una una lengua de llama que
  sube. Nacen de las brasas donde aterriza una mano (una por sitio), corren alrededor 7–10 s y se deshacen hacia arriba en chispas.
  Dos por cada ola, corriendo con sus frentes.
- **'wave'**: desde la media circular de las manos aterrizadas en 1,2 s, dos frentes de fuego a 3 m/s en ambos sentidos (llamarada en
  el lecho, chispas, un diablo en cada frente) hasta encontrarse enfrente: estallido. **'awake'**: todo el anillo llamea y una columna
  lenta de chispas flotantes sube alrededor durante ~8 s.
- **reward** (phase): el anillo se contrae hacia cuatro hogueras (una por muro) y se enfría en ceniza y tierra cálida (umbría, para
  la arcilla de Pinya).
- **arrive** (fragmentación): 2 400 esquirlas oscuras (piedra/espejo, como las de la plaza) cuelgan arriba, caen girando y se
  ENCIENDEN al aterrizar (destello + bocanada de chispas); el tramo del anillo bajo ellas prende a la vez (el mismo ruido periódico
  decide cuándo prende cada tramo). Luego quedan en el lecho como carbones grandes.
- **leave**: el lecho se enfría, las esquirlas se levantan como brasa y ceniza, girando, con brillos de espejo, suben, se separan y se
  adelgazan; motas de brasa suben de todo el anillo; los diablos se deshacen.
- Luces: 4 PointLights en capa 31 (atmos las lee; el render no las paga).

**Cómo lee al host.** `input.state.progress` y `.phase`; `input.events` 'wave' / 'awake'; `input.arrive`, `input.leave`;
`input.hands` / `input.downs`. Sin `input.state` (estudio): progress del host, `params.arrive/leave/phase`, `wave`/`awake` por flanco
de subida, `waveEvery` (olas automáticas), `autoWave` (dos manos en 0,9 s hacen ola, como el score).

**Parámetros** (`res-3d-study/parts/brasa3d.json`): arrive, leave, phase, wave, awake, autoWave, waveEvery, waveSpeed, sparks, heat,
flames, devils, haze.

**Evidencia** (todas sin errores de consola, `scale=1`):
- progress 0, sin manos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/brasa3d/p0.png`
- fuentes + ola (4 manos fijas, 7196×912; result: 6 diablos, 1 ola): `.../scratchpad/brasa3d/fountain.png` (recorte: `fcrop.png`)
- awake (progress 1): `.../scratchpad/brasa3d/awake.png`
- leave 0,45: `.../scratchpad/brasa3d/leave.png` · arrive 0,45: `.../scratchpad/brasa3d/arrive.png`
- 4 manos de grupo, progress 0,6: `.../scratchpad/brasa3d/a.png`
- WebGL2 (`renderer=webgl2`, backend devuelto "webgl2", sin errores): `.../scratchpad/brasa3d/webgl2.png`
- hoja de contacto: `.../scratchpad/brasa3d/sheet.png`, `sheet2.png`

**fps: NO medido** (no tengo turno GPU-MEDICIÓN). Coste esperado: 1 cómputo de 131k partículas × ≤ 64 emisores, ~255k sprites
aditivos (36k llamas, 45k diablo, 131k chispas, 2,4k esquirlas) × 4 vistas, un suelo con 4 ruidos por píxel. Si no llega a 50 fps en
el M1 Max: bajar `NF` (llamas) y el fractal del suelo primero.

## Hallazgos y trampas
- El primer intento saturaba a blanco con manos de grupo y olas: el calor sumaba sin techo. Ahora `soft = raw/(1+0,45·raw)`.
- La compilación de shaders se come 2–3 s del `--delay`: para capturar `awake` hay que dispararlo por `--eval` tras cargar
  (`window.__study3d.P.awake = true`), no por URL.
- El lecho cae en el muro a ~0,85–1,1 m (geometría: suelo a 8–12 m del ojo): justo debajo de la banda 0,9–1,6 m; con progress 1 es una
  línea viva pero no ciega (pico ~1,2 HDR; las olas llegan a ~3 un instante).

## Puntos débiles
- Las esquirlas en reposo y al caer son cuadriláteros irregulares planos: de cerca leen algo «confeti»; mejor con un borde de grosor.
- Los diablos de ola corren a 3 m/s en el muro (≈ 8 m/s en el mundo): zancadas largas, más salto que carrera.
- No hay humo (el aditivo no oscurece); el aire cálido es una neblina analítica en el plano del muro.
- `arrive` probado en estático (0,45) y no en barrido continuo de 5 s; las bocanadas de aterrizaje sólo salen con arrive creciente.

## Traspasos a otros roles
- **INT**: el part espera `input.events` como array de strings y `input.state.phase`. Para que la ola salga del sitio correcto, los
  `downs` de esa ventana deben llegar en `input.downs` (la media circular se hace dentro). Lo que falta en el host: nada obligatorio;
  sería útil `input.events` con datos (p. ej. `{type:'wave', s}`) en vez de sólo el nombre.
- **QA**: medir fps solo (WebGPU y `renderer=webgl2`) con turno; comprobar costura P3→P4 con una ola (cruza el borde de la tira).
