# Cuaderno de 3D-PO

## Dónde quedé
T-003 `lab/experiments/ressonancia/scenes3d/parts/pom3d.js` + `lab/experiments/res-3d-study/parts/pom3d.json`. Entregado 22:40 (espera QA).

### Qué es
IV. Pom de dalt — Valor. La sala SUBE: el grupo `world` se hunde (`world.position.y = -(A-1.6)`), el ojo pasa de 1,6 m sobre el
suelo de la plaza a `height` (32 m por defecto) con `A = 1.6 + (H-1.6)·(1-(1-p)^1.6)` (sube deprisa al principio: las fachadas pasan
en el primer escalador, los tejados en el segundo, el cielo y las nubes en el tercero).
- **Cúpula** (fija, no se hunde): cielo azul-negro, dos capas de estrellas, luna sobre el mar, la sierra de Collserola con luces;
  por debajo del horizonte el suelo se calcula por rayo desde la altura del ojo (exacto, con paralaje real): suelo de la plaza con
  los charcos de las farolas, calles que brillan entre tejados, mar de luces (casco antiguo irregular, Eixample en rejilla a 45°),
  costa con el puerto y el mar oscuro con el camino de la luna. Neblina por distancia.
- **Ciudad**: plaza de cuatro lados (fachadas a 18 m, 13–18 m de alto, ventanas encendidas por hash, tiendas, farolas que bañan
  fachadas) y casco antiguo hasta 235 m (≈ 500 edificios instanciados, tejados a dos aguas de terracota, terrazas planas,
  ≈ 1200 chimeneas, 6 campanarios con campanario iluminado y aguja). Todo sin luces reales: sombreado propio (luna, cielo,
  resplandor cálido de la calle en las plantas bajas).
- **Nubes de fibras**: 18 nubes, cada una miles de segmentos de línea de 1 px que siguen la superficie de lóbulos elipsoidales
  (azul/violeta, borde cálido por la silueta y por debajo) y goteos verticales de 1–12 m que se apagan hacia abajo; giran
  despacio alrededor de la sala (viento), respiran y tiemblan con `restless`.
- **Motas**: 3500 puntos entre 6 y 40 m envueltos en altura: pasan hacia abajo al subir (paralaje cercano).
- **Las tres luces**: torre de brasas (cuerpos de partículas, piso a piso hasta la cima) más allá de cada muro de la estructura
  (`state.walls`, a 9,5 m). La luz `climber` sube en `climb`: una vuelta alrededor de la torre de `lightWall` y un arco hasta la
  torre siguiente (mismo reparto que el score: `seg = floor(climb·n)`), deja un hilo de oro (analítico: el camino precomputado,
  revelado hasta donde está ella; se rehace sólo si cambia la estructura o la altura). Baliza en la torre de `nextWall` donde va
  a llegar. Las que ya llegaron quedan quietas y tenues. `restless`: parpadeo, temblor del hilo, titubeo (sigue más lento y
  retrocede un poco), ráfaga de viento, nubes que tiemblan. `arrived:<n>`: campana de luz (anillo que se abre) y el hilo se aviva;
  la última: la enxaneta levanta la mano (trazo de oro vertical) y el viento y las estrellas se calman (aliento contenido).
- **Manos** (capa en el plano del muro, coordenada de perímetro continua): mano quieta = halo azul que crece en 2 s, corazón de oro,
  estrellitas que se reúnen; manos quietas a < 2 m unidas por líneas de constelación; mano que se mueve = ondas en el aire.
- **arrive**: torre de trencadís (cerámica esmaltada, ~4000 teselas) en cada muro de la estructura; se abre de arriba abajo y las
  teselas vuelan hacia arriba convirtiéndose en estrellas y estelas de fibra; la noche aparece (`uWorld`).
- **leave**: la noche se rompe en ~2000 fragmentos (icosfera de 11 m alrededor del ojo, triángulos irregulares) que llevan la imagen
  del cielo y de la ciudad de su dirección original (estrellas y luces dentro), grietas de oro, brillos de espejo al girar; derivan,
  estallan en oro y se apagan. La rotura empieza en la luz de la enxaneta, que crece (la corona sigue).

### Cómo lee el estado
`input.state`: `progress`, `climber`, `climb`, `restless`, `walls[]` (orden), `floors` (altura de la torre de cerámica), `phase`
('reward' = arriba). `input.events`: `arrived:<n>`. `input.arrive` / `input.leave`. Sin `input.state` (estudio): sustituto desde
parámetros (`progress` del host → climber/climb; `walls`, `restless`, `arrive`, `leave`, `cycle` = subida automática en bucle).
Nota: `lightWall`/`nextWall` se derivan del `climb` igual que en el score; el parámetro `lightWall` del estudio no se usa.

### Parámetros (pom3d.json)
climber, climb, lightWall, restless, arrive, leave, walls, cycle, height, clouds, fibres (al recargar), city, stars, wind, gold, lamps.
`progress` ya está en el manifiesto del estudio (no se duplica).

### Evidencia (22:39, sin errores, WebGPU salvo s6)
Capturas 2400×560 en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pom3d/`: `s1-start.png` (p 0,12: fachadas), `s2-roofs.png` (p 0,55, 4 manos fijas: tejados, nubes,
torres de brasas, luz en la torre, halos), `s3-top.png` (p 1: arriba, la enxaneta en la cima), `s4-leave.png` (leave 0,45),
`s5-arrive.png` (arrive 0,45), `s6-webgl2.png` (WebGL2, p 0,55). fps: SIN MEDIR (sólo QA mide).
Arreglo pedido por INT: «Vertex buffer count 11 > 8» → los edificios instanciados ya no llevan `uv` y sus dos vec4 por instancia
van intercalados en UN búfer (position, normal, instanceMatrix, aI = 4 búferes). Comprobado sin errores en WebGPU.

## Hallazgos y trampas
- Un quad instanciado sin atributo `uv`: `uv()` lee cero en silencio → todo invisible (o negro con mezcla normal). Usar
  `varying(positionGeometry.xy)`.
- En TSL, `.toVar()` fuera de un `Fn()` y `assign` fuera de `Fn()` fallan (el segundo con error; el primero en silencio).
- El cielo/suelo por rayo en la cúpula evita geometría de ciudad lejana: el suelo lejano tiene paralaje exacto con la altura.

## Lo que le falta al host
- `input.state.order` (el orden de muros del score es privado: lo reconstruyo de `walls[]`; si el score lo cambia, divergiría).
- La altura del castell (pisos) sólo sirve para la torre de cerámica de llegada; la cima del Pom es la del ojo final (surreal).

## Traspasos a otros roles
- INT: pasar `input.state`, `input.events`, `input.arrive`, `input.leave` como en PARTS.md; nada más.

## 23:12 — arreglo de la salida (FALLA de QA en T-003)
Causa: las grietas eran bandas de 5 % del triángulo (≈ 3–4 px) en ~2000 triángulos a la vez, a ×1,6 de oro, más el estallido dorado de
TODOS los fragmentos y el brillo de espejo ancho: con el bloom, beis en toda la sala.
Arreglo (sólo la malla de salida en `pom3d.js`): grietas de ≈ 1,2 px (anchura por `fwidth` de la baricéntrica), ×0,55, que se
propagan desde la luz de la enxaneta; la imagen del fragmento es la noche (oscura) y se apaga al alejarse; brillo de espejo breve
por fragmento (pow 80 × sin); sólo 1 de cada 4 fragmentos estalla en oro (×1,4, breve); la luz de la enxaneta crece menos en la
salida; vértices de la icosfera con más ruido (0,85 m).
Medida con `qa/capture.py` (banda de la guía, media por muro P4/P1/P2/P3): leave 0,02: 23/21/18/33 · 0,06: 23/20/18/31 ·
0,12: 27/19/21/37 · 0,3: 33/28/29/23 · 0,5: 19/28/17/23 · 0,8: 1/11/2/9. Todas ≤ 60 y saltos ≤ 10. Sin errores.
Capturas: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/pom3d/leave/` (`l<L>_strip.png`, `_meta.json`, `board.png` = 0,06/0,12/0,3/0,5).

## 23:3x — T-008 paso 0: coste por mano acotado (entregado, falta medida de QA)
La capa de manos a muro completo (cada píxel de los 4 muros recorría todas las manos, líneas y ondas) se sustituye por sprites
instanciados en el plano del muro, sólo del tamaño de su influencia: mano = cuadrado de 2,4 m (halo, corazón, estrellas reunidas),
onda = 2·radio, línea de constelación = cinta de 12 cm (partida en la esquina si las manos están en muros vecinos). Un solo draw call,
sin bucles en el fragmento. Un halo que cruza una esquina se dibuja también en el muro vecino (plano extendido): continuo en la
costura P3→P4 (luma a 5 px de cada lado igual ±4). Copia de seguridad de T-003: scratchpad/pom3d/pom3d.t003.js.
Evidencia: 15 manos fijas sin errores en WebGPU (`scratchpad/pom3d/h15.png`, 7196×912; `h15s.png`; costura `seam.png`) y WebGL2
(`h15gl.png`). Coste: lo mide QA (objetivo ≤ 8 ms con 15 manos).

## 23:13 — T-008 paso 1 (torres a altura de castell): probado y RETENIDO, decide el director
Probé torres de 5–9 pisos (pisos × 1,35 + pom ≈ 7–13 m) con el ojo subiendo sólo hasta la cima + 2,6 m (≈ 12–15 m) para que las luces
sigan en ventana, y bajé la plaza a 9,5–13 m y el casco a 8–15 m. Resultado (`scratchpad/pom3d/fboard.png`, p 0,05/0,3/0,45/0,75/1):
las fachadas de la plaza siguen tapando casi todo y desaparece lo que QA elogió (los tejados alrededor, la ciudad abajo, el mar,
las nubes cerca). Geometría: con el ojo a 32 m, una cima de 12 m a 9,5 m queda a −64° (la ventana baja sólo hasta −25°): la luz no
se vería. No hay solución que tenga a la vez castell a escala, luces en ventana y vértigo de 32 m, salvo castells lejos (≥ 55 m,
dentro de la ciudad). Devuelto al comportamiento de T-003 (torres hasta la cima del ojo, surrealistas); copia del intento:
`scratchpad/pom3d/pom3d.step1-castell-height.js`. Queda el parámetro `floors` (sólo para la torre de cerámica de llegada) y `height` 0 = 32 m.

## 23:16 — T-008 paso 4: fibras sin parpadeo (entregado, falta medida de QA)
Las fibras (LineSegments de 1 px) pasan a cintas instanciadas de ≈ 1,8 px con perfil gaussiano (anchura proporcional a la distancia:
nunca más finas que su píxel; medio píxel de casquete en cada extremo), misma energía. Cuatro atributos por segmento (≤ 8 búferes).
También el hilo de oro: ≥ 1 px a cada lado con perfil gaussiano (antes se veía a trazos a 1,2 px). Copia previa: scratchpad/pom3d/pom3d.step0.js.
Evidencia: `scratchpad/pom3d/rib.png` (7196×912), `ribc.png` (recorte), `ribgl.png` (WebGL2, restless), `thrc.png` (hilo continuo).
Sin errores WebGPU ni WebGL2. La comparación de ruido entre fotogramas (criterio del ticket) la hace QA.

## 23:18 — T-008 pasos 2 y 3 (entregados; WebGL2 pendiente tras la congelación)
- Decisión del director (23:20): paso 1 descartado, se quedan las torres surrealistas de T-003.
- **Paso 2, torres como cuerpos**: kit de cuerpos copiado de `parts/castell.js` (helpers, IK, esqueleto, segmentos y muestreo; comentario
  de atribución; castell.js intacto) + `buildTower(n, tiers)`: tronc de 3/4 por piso con brazos en los hombros de los vecinos y una niña
  arriba, tantos pisos como hagan falta para llegar a la cima (27 con 4 por piso). ≈ 420 partículas por persona (≈ 37 k por torre),
  brasa con silueta más brillante vista desde el ojo. Construcción 24 ms en CPU (sólo al cambiar la estructura).
  Evidencia: `scratchpad/pom3d/b3c.png` (cabezas, hombros, brazos enlazados, piernas), `b2c.png`.
- **Paso 3, fachadas con relieve** (sólo la plaza): imposta sobre la planta baja, cornisa, balcones de piedra con baranda de hierro
  forjado (barrotes por `discard`) en cada vano del piso principal y en parte de los superiores, sobre la misma rejilla de ventanas del
  shader. Instanciados (2 draw calls, ≤ 8 búferes). Evidencia: `scratchpad/pom3d/b1c.png`.
- Sin errores en WebGPU (b1, b2, b3). Falta: captura WebGL2 de estos pasos (tras 23:50) y la medida de QA.

## 23:20 — paso 2 retocado (pedido del director)
Contornos: muestreo de la cabeza ×2,3 y de los hombros ×3, energía de silueta `0.07 + 1.9·rim³` (interior casi apagado, lado de atrás
0,12), brillo ×1,4; separación entre figuras del piso: radio 0,31→0,40 (tres) / 0,36→0,46 (quatre). En el recorte se cuentan las
cabezas (anillos) de cada piso. Evidencia: `scratchpad/pom3d/b4c.png` (antes `b3c.png`). WebGL2 tras las 23:50.

## 23:27 — pom3d final (brasas ×1,4) y WebGL2
WebGPU y WebGL2 sin errores, misma imagen: `scratchpad/pom3d/final.png` / `final_c.png` (recorte de una torre), `finalgl.png` /
`finalgl_c.png`. QA midió 95/93/93 fps-eq con 0/4/15 manos (el paso 0 quitó el coste por mano).

## 23:32 — T-015 baixada3d (entregado, falta medida de QA)
Parte nueva `scenes3d/parts/baixada3d.js` + `res-3d-study/parts/baixada3d.json` (ticket `tickets/T-015-3DPO-baixada.md`).
- Lluvia de color analítica en el vértice (24 k fragmentos, sin compute ni subidas por frame): cada `down` suelta una ráfaga del color
  de ese piso (paleta del trencadís por piso), 1–1,5 m/s, concentrada delante de cada castell (centro de cada muro de la estructura) y
  algo por toda la sala; detrás del muro empujada RADIALMENTE desde el ojo (las esquinas quedan cubiertas).
- Manos: los fragmentos cercanos al plano del muro que pasan por una mano se paran a su altura, destellan y se apagan; sin manos caen
  y se apagan en un charco breve en el suelo. Anillo cálido al aterrizar (mismo frame) y halo que crece al sostener; en esquinas el
  sprite se dibuja en los dos muros (costura P3→P4 continua: `h8_seam.png`).
- floors 0: la lluvia se apaga a los 2,5 s. Caída (`block 'fall'`/`outcome 'carregat'`, estudio `fall`+`fallDelay`): todos los
  fragmentos a la vez con gravedad, sin manos que los paren.
- arrive: fragmentos de oro dispersos que convergen en las columnas; leave: suben, se separan y se apagan.
- Lee `state.floors`, `stats.maxFloors`, `walls[]`, `block`, `outcome`, eventos `down`/`fall`, `input.arrive/leave`, `input.hands`.
Evidencia (sin errores WebGPU y WebGL2): `scratchpad/baixada/board.png` (filas: 0 manos, 2 manos, 8 manos, floors 0, caída,
arrive 0,4, leave 0,5, WebGL2), `h8s.png`, `h8_seam.png`, `*_meta.json`.

## 23:43 — T-015 rehecho según las notas de arte del director
- La lluvia sale DEL castell: ~150 fragmentos por castell (piezas planas que giran y voltean: núcleo cálido, borde del color del piso,
  paleta del castell —oro, ámbar, terracota, rojo, perla, blanco; sin rosas ni magentas—) que caen desde la altura del piso que baja,
  alrededor del eje de cada castell (posición tomada de `ctx.parts.castell.castells[i].grp` y `stats.top`; si no está, la misma regla de
  colocación), derivando un poco hacia la sala; cada uno arrastra 22 motas de polvo (su mismo camino un poco más tarde). La mano los coge
  por PROYECCIÓN: donde el fragmento se ve a través del plano del muro y cruza la altura de la mano, se para, destella y se apaga.
- Caída: colapso pesado que se oscurece (brasas que se apagan), ya no una banda brillante. Corregido un error de signo que hacía
  estallar de brillo los fragmentos caídos al suelo (`exp(+…)`).
- Luma < 15 del área (part sola, estudio): 0 manos 98,1 % · 2 manos 97,6 % · 8 manos 94,9 % · floors 0 99,9 % · caída 99,6 % · arrive 98,8 %
  · leave 98,2 % · WebGL2 98,2 %. Tablero `scratchpad/baixada/board.png`.
- Compuesto real (`res-obra3d/index.html?b=baixada&group=8`, eval de INT): `scratchpad/baixada/comps.png`, `compc.png`: los fragmentos caen
  del castell encendido, la mano los recoge. AVISO: en el compuesto la plaza iluminada + la nieve de atmos + el brillo de las manos de
  otra parte dejan el muro lejos del 60 % negro: eso no es de baixada3d (decisión de INT/director: bajar plaza/atmos en este bloque).

## 23:43 — pom3d, nota de QA de la salida (no bloqueante) hecha
La ciudad y las nubes ya no desaparecen de golpe: el mundo se apaga entre leave 0,05 y 0,40 y los fragmentos aparecen entre 0,02 y 0,32
(la noche se vacía poco a poco en las teselas). Banda de la guía ≤ 37 en 0,06–0,5; sin errores. `scratchpad/pom3d/leave2/board.png`.

## 00:03 — T-021 tronc3d (entregado) · glint de baixada3d · T-022 llegada de pom3d
- **tronc3d** (`scenes3d/parts/tronc3d.js`, `res-3d-study/parts/tronc3d.json`, ticket `tickets/T-021-3DPO-tronc.md`): cada piso fijado recibe
  su FAIXA de trencadís (≈ 120 teselas esmaltadas orientadas en un cinturón alrededor de los cuerpos de ese piso; alguna blanca o cobalto),
  color por piso de la piedra y el hueso a la terracota y al rojo. El piso que se forma (`floorProgress`) tiene sus teselas flotando cerca,
  girando, cada vez más cerca; al fijarse vuelan a su sitio y encajan con un destello. Sigue al castell copiando cada frame la matriz del
  grupo del castell de su muro (`ctx.parts.castell.castells[w].grp`: inclinación por lean[w], temblor por weak[w], posición, altura por
  `stats.top`); sin castell, misma regla de colocación (6,5 m) e inclinación/temblor desde params. Premio: se apaga de arriba abajo.
  arrive/leave por fragmentos. Evidencia (sin errores WebGPU y WebGL2): `scratchpad/tronc/board.png` (floors 1, 3, 6, 9, lean, reward),
  `weak_strip.png`, `gl_strip.png`, `seam_seam.png`, `f9c.png`.
- **baixada3d glint**: destello breve cuando la cara de la tesela mira al ojo. `scratchpad/baixada/glintc.png`; WebGL2 `glintgl_*` sin errores.
- **pom3d llegada (T-022)**: las teselas de la noche (la misma malla de la salida) vuelan hacia dentro desde dispersas desde arrive ≈ 0,1
  (+0,5 s), encajan hacia 0,5–0,7 con grietas de oro tenues, y el mundo (ciudad, nubes) aparece a través de ellas de 0,45 a 0,9; la torre de
  trencadís de llegada se dibuja delante. Banda de la guía 12–32. `scratchpad/pom3d/arrive/board.png` (0,1/0,2/0,35/0,5/0,7/0,9), WebGL2 sin errores.

## 00:15 — T-021 rehecho (notas de arte) · pom3d: cúpula por fragmentos y sin parón al llegar
- **tronc3d v2**: las faixes son ahora el MOSAICO sobre los cuerpos reales del castell: el tronc del castell se reconstruye aquí con el
  mismo esqueleto y la misma semilla (kit de cuerpos copiado de castell.js; tipo y pisos leídos de `castell.stats.people`), y cada cuerpo
  lleva en su faja (torso t 0–0,5) ~110 teselas irregulares (cada una un polígono propio por descarte: juntas oscuras, el cuerpo se ve
  entre ellas), esmaltadas cada una con su ángulo (brillo propio, destello cuando su cara mira al ojo, borde algo más oscuro). Los
  cinturones se alinean con los pisos REALES del castell (piso j fijo cuando (floors+floorProgress)·T/9 ≥ j+1, como res-obra3d lo
  construye). Se dibuja después de la luz aditiva del castell (transparent, renderOrder 10) para que el mosaico se lea sobre los cuerpos.
  Se mantienen la subida de color y el apagado de arriba abajo. Evidencia: `scratchpad/tronc/board.png` (f1, f3, f6, f9, lean, reward,
  weak, quatre-7), `gl_strip.png`, `seam_seam.png`; compuesto real `scratchpad/tronc/compc.png` (res-obra3d, floors 8). Sin errores.
  Bug encontrado: dentro de create() `cross`/`dot` son los de TSL (sombra del kit): las posiciones salían NaN; usado `cross3`.
- **pom3d (INT)**: (1) la cúpula ya no aparece opaca de golpe: transparente, entra por celdas del cielo desde arrive 0,1 (`uDomeIn`), y los
  bloques opacos de la ciudad no se dibujan hasta que se ven (uWorld > 0,02). (2) el parón del primer update: los cuerpos de las torres se
  construyen una vez por tipo (caché, calentados al cargar), las brasas y las teselas de llegada se reescriben en su sitio (sin geometría
  ni material nuevos: sin compilar shaders), y los caminos de reconstrucción se calientan al cargar: un cambio de estructura cuesta ahora
  6–14 ms (antes ~30). `scratchpad/pom3d/arrive/board2.png`, WebGL2 sin errores.

## Dónde quedé (00:16, parada por límite de uso)
Todo en estado seguro y funcionando (sin cambios a medias; sintaxis OK; últimas capturas sin errores WebGPU/WebGL2):
- `pom3d.js`: T-003 + T-008 (pasos 0, 2, 3, 4) + salida v2 + llegada por fragmentos (T-022) + cúpula por celdas + sin parón. PASA de QA hasta salida v2; lo de después (llegada, cúpula, parón) espera QA.
- `baixada3d.js` (T-015 v2 + destello): aceptado por el director; el compuesto espera que INT atenúe plaza/atmos.
- `tronc3d.js` (T-021 v2): entregado, espera QA.
Pendiente: veredictos de QA; nada empezado sin terminar.

## 03:19 — T-023 (álbum): la ciudad de pom3d con volumen y detalle
Copia previa: `scratchpad/pom3d/pom3d.pre-t023.js`. Cambios (sólo pom3d.js):
- Fachadas: ventanas hundidas (sombra bajo el dintel y en una jamba), marco de piedra labrada, habitaciones encendidas con cortina y
  cruz de carpintería, persianas cerradas de lamas (verdes o marrones) y persianas a medio bajar en algunas encendidas; planta baja con
  arcos (tiendas encendidas tenues con degradado, puertas de madera), sillares en la planta baja, imposta y friso, manchas bajo los
  alféizares, grano de estuco/piedra, pie más oscuro. Lejos se promedia (sin parpadeo). Campanarios: sólo el campanario iluminado.
- Azoteas: pretil alrededor de cada terrado, casetas de escalera y depósitos de agua, baldosa de terrado con juntas; tejas en las cubiertas.
- Señas de Barcelona: una cúpula de plomo con nervios sobre tambor con ventanas encendidas y linterna (lado de tierra); los chaflanes del
  Eixample en el suelo trazado por rayo (los cruces se abren en octógono); la línea del mar con el puerto ya estaba.
- Sin errores (WebGPU). Evidencia: `scratchpad/pom3d/t023/c005.png` (fachada de la plaza de cerca), `c1.png` (tejados desde arriba),
  `s05.png`, `s1.png`. Coste: lo mide QA (≈ +1100 cajas instanciadas y algo más de ALU en el sombreado de fachada).
- 03:21 — profundidad aérea: los bloques cercanos más oscuros y nítidos (×0,72 a < 15 m → ×1 a 90 m) y la ciudad lejana se hunde en
  la MISMA neblina cálida-azul del suelo trazado por rayo (niebla 0,0085/m): ya no hay siluetas grises iguales cerca y lejos.
  `scratchpad/pom3d/t023/c1b.png`. WebGL2 sin errores (`gl_meta.json`, backend webgl2).

## 03:27 — T-021 franjas bajas · grietas de la salida de pom3d
- tronc3d: los pisos bajos ya no salen blancos y planos: gris cálido, marfil y ocre con moteado, alguna tesela cobalto o verde en
  todos los pisos, destello por tesela, y la torre más oscura al pie (×0,68) que arriba. Compuesto: `scratchpad/tronc/comp2c.png`. Copia: `tronc/tronc3d.v2.js`.
- pom3d salida: las grietas ya no son la red de todas las aristas (parecía geometría de depuración): cada tesela conserva sólo algunas
  de sus aristas (al azar), se extienden despacio desde la luz de la enxaneta y unos pocos puntos, y la mayor parte de la noche queda
  oscura. Banda de la guía ≤ 41 (0,06/0,15/0,3/0,5). `scratchpad/pom3d/leave3/board.png`. Copia previa: `pom3d/pom3d.pre-cracks.js`.

## 03:52 — pom3d: salida hacia la caída (intent)
Cuando Pom sale hacia la caída (`state.block 'fall'` u `outcome 'intent'`; estudio `fallLeave`): la luz de la enxaneta y todas las luces de
oro se apagan en ~1 s (leave 0–0,2), sin estallidos de oro y grietas atenuadas. En cualquier salida, las teselas quedan tenues en la banda de
la guía (rayos justo bajo el horizonte del ojo = 0,9–1,6 m en el muro). Banda (media por muro) en caída: 0,1 ≤ 34 · 0,2 ≤ 20 · 0,4 ≤ 13 · 0,6 ≤ 10;
hacia la corona 0,4 ≤ 14. Sin errores. `scratchpad/pom3d/fallleave/`. Copia previa: `pom3d/pom3d.pre-fallleave.js`.
