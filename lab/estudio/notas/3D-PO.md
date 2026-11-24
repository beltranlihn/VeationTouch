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

## 24-11 13:05 — T-031 Pom: el Eixample como ciudad de líneas (primera versión visible + integrada)
Ticket `tickets/T-031-3DPO-ciudad-lineas.md`. Respaldo del Pom de ayer: `parts/pom3d.ARTE2.js.bak` y `res-3d-study/parts/pom3d.json.ARTE2.bak`.
`pom3d.js` reescrito entero (la plaza de noche, las torres de cuerpos, las nubes y la torre de cerámica de llegada ya no están).
- **Cañón vertical**: 9 torres de líneas (≈ 114 cajas instanciadas, un draw) en anillo a 12–15 m del eje, 44–78 m de alto, escalonadas con
  terrazas, repisas-jardín hacia la sala y puentes entre vecinas (nunca cruzan la sala). Caras negras opacas; líneas en el sombreado con
  anchura constante en píxeles (aristas, forjados dobles, ventanas, aletas de vidrio, pistas de circuito; se funden a su media lejos: sin moiré).
- **Jardines de oro**: 107 jardines (≈ 16 k puntos: hojas verde oscuro, tallos, copas-paraguas de oro) en terrazas, repisas, coronas y al pie.
- **El Eixample**: 16 manzanas octogonales instanciadas cerca (anillo con chaflanes, patio, azoteas con jardines de oro) y más allá la cúpula
  trazada por rayo (manzanas, chaflanes, patios dorados, la Diagonal, la costa y el mar con líneas, Collserola como contorno, estrellas).
- **La subida**: muelle crítico sobre la altura (1,6 → 90 m; acel. ≤ 1,2 m/s², vel. ≤ 4 m/s) y giro de 45° repartido en la subida con tope
  3 °/s (medido con bucle de 12 s: 2,05 °/s; `window.__pom3d.maxYawRate`). Mueve sólo mi grupo `world`/`city` (rig de INT intacto).
- **Escaladores**: mástiles de líneas (3 raíles, anillo cada 1,35 m = un piso) frente a cada muro de la estructura; luz, hilo, baliza,
  campanas y la mano de la enxaneta como antes.
- **Interacción física** (mismo frame): mano quieta → el jardín al que apunta (≤ 28°, ≤ 45 m) florece en ~1 s y suelta pétalos que planean
  y giran cañón abajo, más unos pétalos desde la propia mano; mano que aterriza → ráfaga de 8 teselas; mano que se mueve (> 0,3 m/s, velocidad
  propia del trazo si el sensor no la da) → teselas de línea que caen con gravedad 9,8, giro y destello, y las teselas cercanas se desprenden.
  CPU: 260 teselas ambiente + 1300 libres, un draw call.
- **Tres profundidades**: teselas a 0,2–1 m tras el muro (bajan con la subida), cañón, ciudad/mar/cielo.
- **Llegada/salida**: la misma malla de fragmentos con la imagen de la ciudad; al salir los fragmentos CAEN (estamos altos), grietas blancas.
- Eventos para el sonido (ola 2, no emitidos): `fx:fall` (muro, u, fuerza) al soltar teselas; `fx:bloom` (muro, u) al abrirse un jardín.
- Parámetros (`pom3d.json`): climber, climb, restless, arrive, leave, fallLeave, walls, cycle, height (0 = 90 m), spin (°), lines, gardens, tiles, stars, gold.
Evidencia (2400×560, sin errores WebGPU; WebGL2 `gl04`, `h15gl`): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/board-v1.png` (p 0 · p 0,4 · p 1 · 4 manos quietas · mano en
movimiento), sueltas `p0.png`, `p0.25`, `p0.4.png`, `p0.75.png`, `p1.png`, `h4.png` (jardines en flor), `hmove.png` (teselas cayendo),
`board1.png` (WebGL2 p 0,4 · leave 0,4 · arrive 0,5), `h15gl.png` (15 manos, WebGL2), `obra-pom.png` (en la obra: `res-obra3d/index.html`
con jump pom, guía «Quietos. Llevad su luz» legible, sin errores).
Banda de la guía (media 0,9–1,6 m, ±0,6 m del centro, captura 2400): p0 52/20/20/26 · p0,4 20/47/49/32 · p0,75 41/66/41/39 (66 = la luz que sube)
· p1 40/10/42/38 · 4 manos quietas hasta 93 en el muro con el jardín en flor detrás de la mano (respuesta de la mano; vigilar). fps: SIN MEDIR.
Pendiente / segunda pasada: teselas como vidrio físico con `room.envMap`; jardines más frondosos (ref. 11); pasar por QA la banda con manos.

## T-031 pulido (pedido del director): vidrio, jardines, jerarquía de línea — a QA
Copia previa: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/pom3d.v1.js`.
- **Teselas → esquirlas de vidrio físico**: `MeshPhysicalNodeMaterial` (clear-coat, iridiscencia, `room.envMap` ×3,5), polígono irregular con
  canto blanco (u oro) por `fwidth`, proporciones variadas; menos, más grandes (9–47 cm) y **en racimos** (un panel que se suelta: 9 piezas al
  aterrizar la mano, ~3 racimos/s de 3–5 al moverla, con un empuje común y algo de divergencia). Ambiente: 150 esquirlas en racimos sueltos tras el muro.
  Un draw (InstancedMesh, matrices por frame; ranuras libres a escala 0). Los pétalos siguen en su malla aditiva.
- **Jardines más frondosos**: ≈ 28 k puntos (montículos con volumen, follaje que cuelga hacia la sala, copas de oro), hojas nítidas.
  **La luz de oro se derrama sobre las líneas**: cada caja conoce sus dos jardines más cercanos; las líneas cercanas se tiñen de oro y se
  avivan, y crece con la floración (una mano quieta enciende la fachada de alrededor).
- **Jerarquía de línea**: aristas estructurales gruesas (2,6 px, 0,8, con un halo de 8 px), forjados finos (1 px), detalle en pelo (0,6 px, tenue).
- Sin errores WebGPU/WebGL2 (`qgl.png`) ni en la obra (`obra-pom2.png`). Tablero: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/board3.png` (mano en movimiento con racimos de vidrio ·
  4 manos quietas con jardines en flor y fachada dorada). Banda de la guía: sin manos 11–65 (q0 P4 65: aristas + jardines al pie); **con 4 manos
  quietas 61–85** (respuesta de la mano: halo + jardín en flor + derrame); QA decide si hay que bajarlo.

## T-031 pulido 2 (notas de ARTE 13:10) + sonido — a QA
Copia previa: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/pom3d.v2.js`.
1. **Tres grosores**: aristas/siluetas 2,8 px al 90 % · forjados y ventanas 1,5 px al 45 % · trazas de circuito 1,5 px al 22 % · manzanas lejanas al ~25 %. Nada < 1,5 px.
2. **Buses de circuito**: 3–5 trazas paralelas por la fachada interior desde la terraza, un quiebro a 45°, pastillas (anillos) en los extremos;
   **pulsos de oro** que suben por ellas hacia los jardines a 1,5 m/s. Jardines mayores (umbelas de 1,2–3 m, crema `#FFF2D0` y oro) que
   **florecen al paso de la luz** del escalador (y con la mano quieta).
3. **Cuadraditos −75 %**: 36 esquirlas de vidrio cerca (≈ 9 por muro, 6–14 cm); las de la interacción siguen en racimos.
4. **Cañón cercano con rendija**: 8 torres (2 por muro, a ±35° del centro, 9,4–11 m del ojo ≈ 6–7,5 m tras el muro, 50–82 m de alto) con una
   rendija de cielo en el centro de cada muro donde está el mástil (TR 6,4 m). Giro de la subida: 90° (las rendijas vuelven a los muros arriba;
   tope 3 °/s). **Arriba, el Eixample como placa de circuito**: manzanas con línea doble, cruces-chaflán con pastillas (anillos), patios de oro, la Diagonal.
5. **Luz del escalador**: estrella pequeña y nítida (0,42 m de billboard con núcleo fino y 4 puntas) en vez de sol borroso.
6. **Sonido (ola 2, snippet de ENT)**: `fxImpact(wall, u, …, 'line', 'hit')` en cada racimo que suelta la mano; `fxAt(p, 0.3, 'line', 'floor')`
   cuando una esquirla cruza el suelo del cañón (≤ 1 cada 0,3 s); `fxAt(jardín, …, 'petal', 'bloom')` al abrirse un jardín (≤ 1 por jardín cada 2 s). Tope 16/s.
Evidencia (sin errores WebGPU; WebGL2 `s2`): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/board5.png` (p 0,15 con 4 manos quietas · p 0,3 WebGL2 con racimo cayendo · p 0,6 saliendo del
cañón · p 1 la placa de circuito). Banda (0,9–1,6 m): sin manos 22–64; **con 4 manos quietas 74–149** (P3: jardín en flor en una repisa justo
detrás de la mano + derrame dorado). QA: si es demasiado, bajo la floración de los jardines que caen en la banda.

## T-031 ronda 2 de ARTE (la cima) — a QA
Copia previa: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/pom3d.v3.js`. Sin modelos externos (plantas procedurales).
1. **Cima = placa de circuito encendida**: patios de oro hasta el horizonte (el oro se pierde en la neblina 3× más despacio que las líneas),
   azoteas-jardín en el 55 % de las manzanas, la **Diagonal como traza gruesa** (eje 3 px + dos pares de raíles) con **pulsos de oro** que la
   recorren; **constelaciones como trazas** con pastillas (anillos) y un punto de oro en cada nodo, entre 6° y ~55° de elevación.
2. **Capa de neblina dorada** (4 m de grosor) a la altura que alcanza el ojo en p 0,6: se cruza como un velo (≈ 0,88 dentro) y desde arriba
   queda abajo (≤ 55 %) dando la altura. Exacta para una losa horizontal en todos los materiales (cúpula, cañón, manzanas, jardines, buses). Parámetro `haze`.
3. **Capa cercana arriba**: 6 pétalos por muro suben con nosotros (0,3–0,8 m tras el muro) desde p ≈ 0,45.
4. **Jardines como siluetas**: tallo doblado, dos hojas y los radios de la umbela en línea fina crema-oro; flores en las puntas (6–12 cm,
   floración ×1,3 como mucho: sin blancos quemados > 15 cm).
5. Estrella de la enxaneta sin halo de sol en la corona.
Evidencia (sin errores; WebGL2 en p 0,85): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/board7.png` (p 0,2 con 4 manos quietas · p 0,62 en la neblina · p 0,85 sobre la placa),
`u1.png` (cima). Banda: con 4 manos 76–88 (antes 74–149) · en la neblina 57–78 · cima 39–62.

## T-031 últimos toques (ARTE board7 + GUI) — Pom ENTREGADO a QA (dejo de editar)
- Neblina: oro pálido `#FFE9B8`, densa bajo el horizonte y clara arriba, con 4 haces verticales de luz. **Centro de la bruma = progreso 0,60**
  (la altura del ojo en p 0,6; coincide con el sonido de ENT).
- Constelaciones con jerarquía: el cielo en súper-celdas 6×3: vacías (30 %), una PEQUEÑA en un rincón 2×2 (40 %) o una GRANDE en toda la
  celda (30 %); las trazas sólo unen nodos de la misma súper-celda: 2–3 grandes y varias pequeñas por muro, cielo vacío entre ellas.
- Manzanas «gofre» al 25 %: sin rejilla de ventanas (forjados + circuito o losa).
- **Columna del botón libre** (GUI): en el centro de cada muro, 0,9–2,2 m ±0,9 m, las líneas, la cúpula, los jardines, los buses y los cables
  (mástil incluido) se atenúan al 50 % con bordes suaves (`colDim()`, según el muro que mira cada cámara). La luz del escalador no se atenúa.
Evidencia: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/board8.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t035/b5.png` (fila 1). Banda: p 0,3 16–41 · p 0,62 34–50 · p 1 23–41 · WebGL2 24–44. Sin errores.
Ciclo de 40 s: giro máx. 3,0 °/s (tope), aceleración 1,2 m/s².

## T-035 baixada3d — la bajada al amanecer: primera versión (estudio) — a QA; falta el mapeo de INT
Ticket `tickets/T-035-3DPO-baixada.md`. Respaldo `baixada3d.ARTE2.js.bak` (+ json).
- Amanecer (paleta ARTE §2): cielo lila → melocotón, sol a punto de salir (sube al bajar), nubes de vetas rosas, mar aguamarina con camino
  del sol, ciudad en bruma lila con la retícula en rosa pálido; 12 invernaderos de vidrio «barato» (lo de detrás teñido + cielo reflejado + marco perla) a 24–60 m.
- Castell = torre de vidrio de colores (4 anillos × 17 esquirlas por piso, Ø 5 m → 3,6 m, piso 3,6 m; vidrio físico con `room.envMap`) a
  8,6 m del ojo, **26° a la derecha del centro de cada muro** (columna del botón y texto libres). La sala baja con ella: el ojo 1,6 pisos por
  debajo de la cima (la torre llena el muro); muelle ≤ 1,1 m/s.
- Física: `down` suelta el anillo de arriba (lluvia de vidrio que planea hacia el objetivo del muro: terminal 2,6 m/s, deriva lateral) +
  goteo de esquirlas pequeñas. Mano sostenida: la esquirla vista a través de la mano (≤ 0,5 m) se para, destella y **crece una flor** en el
  muro (5–7 pétalos, su color; más capturas = flor mayor). Sin mano: al suelo, **se rompe** en 3–5 astillas que rebotan y quedan (≤ 45 s).
  Caída (carregat / salida a 'fall'): toda la torre a la vez, pesada, el color se apaga.
- Capa cercana: 8 astillas por muro a 0,2–1 m. arrive: las esquirlas vuelan a sus anillos y el cielo entra por celdas; leave: se abren y suben.
- Si `tronc3d` está en la escena, esconde sus pisos (`takeFloor(i, {hide})`) mientras dura la bajada y los devuelve al irse.
- Sonido: recogida `glass/hit`, flor `petal/bloom`, rotura `glass/floor` (≤ 4/s).
Evidencia (sin errores WebGPU y WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t035/b4.png` (ciclo con 4 manos: lluvia aguamarina, flores rosas · floors 2 WebGL2),
`b5.png` (ciclo · floors 5), `b2.png` (caída, llegada 0,5). Contadores ciclo 40 s + 4 manos: 72–106 recogidas, 4 flores, maxV 1,1.
Banda: fondo claro (amanecer) 105–165 — es el único bloque claro; el texto de GUI debe ir oscuro o con placa aquí.
**En la obra** (jump baixada): sin errores, mis torres se ven, pero el mapeo actual es `['plaza', 'tronc3d', 'baixada3d', 'atmos']`: la plaza
de noche tapa el amanecer. **Pedido a INT:** `baixada → ['baixada3d']` (o `['tronc3d', 'baixada3d']` si quieren el hilo con la torre: la escondo yo).
(El negro a los ~14 s del salto era la transición a 'fall': sin manos, carregat; correcto.)

## T-035 v2 (ARTE «todavía no»: vaporwave) + zonas quietas (regla nueva) — a QA
Copia previa: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t035/baixada3d.v1.js` (y `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t031/pom3d.v4.js` para Pom).
1. **Fuera la rejilla**: el suelo es AGUA sobre losa mojada que refleja el cielo (Fresnel, ondas lentas) con bruma rosa baja; invernaderos casi
   sin marco (vidrio que deja ver lo de detrás).
2. **Vidrio de verdad**: casi incoloro (4 de cada 5 claras, 1 de 5 con el color de su piso), refleja el cielo del amanecer con Fresnel, canto
   brillante con película fina, transparente; sin brillo propio (sólo destella la recogida).
   **La torre = el castell del Tronc hecho vidrio**: con `tronc3d.takeFloor(i, {hide})` tomo sus piezas (posición, tamaño, giro) y las dibujo
   como vidrio; cada `down` suelta el piso de arriba (y el ojo baja 4 m bajo la cima del piso más alto que queda). Al irse, `giveFloor`.
   Si el tronc apenas se construyó (< 150 piezas, p. ej. un salto de ensayo) se devuelven y dibujo mis anillos de vidrio (como en el estudio).
3. **Cielo con un este**: el sol justo bajo el horizonte en UN muro (EAST_WALL = P1, 0,8 rad a la derecha de su centro, fuera de la zona del
   texto), nubes iluminadas desde abajo de ese lado, vetas de *pixel sort* finas en el cielo bajo. **Flores de vidrio**: roseta de 6–9
   esquirlas en cometa (vidrio claro, canto brillante, 1 de 3 teñida, corazón de astillas).
4. **Zonas quietas** (texto ±1,6 m × 1,75–2,2 m, botón ±0,9 m × 0,9–1,6 m): un lóbulo súper-gaussiano suave (sin esquinas: se lee como luz que
   cae, no como placa) que atenúa cúpula, invernaderos y vidrio al 25 % en el centro (Bajada) y al 35 % (Pom: líneas, cúpula, jardines, buses, cables).
Evidencia (sin errores WebGPU/WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t035/b7.png` (ciclo 40 s con 4 manos: torres de vidrio claro, flores de vidrio, lluvia · floors 2 WebGL2).
Banda: sin manos 25–65 (P1, el muro del sol, 65), con manos 59–88. Obra (salto a baixada): sin errores; mapeo ya sin plaza; con un tronc sin
construir → anillos propios.
**Pendiente de INT/TRO-F:** en la obra se veían además las «torres de otras colles» y teselas sueltas de tronc3d (no son tomables con takeFloor):
si molestan, que tronc3d las esconda mientras baixada3d tiene sus pisos, o que el mapeo deje tronc3d sólo como fuente (sin dibujar).

## T-031 nota de QA (cima beige) — corregido
Causa: la captura «top» usó `height: 1`, que el parámetro leía como «ojo final a 1 m». Con eso no hay subida y la capa de bruma (a la altura
de p 0,6) caía sobre el ojo, de ahí el velo beige. Ahora `height` se limita a 30–120 m (0 = 90 m). Para la cima basta con progress 1, o
`cycle`. Con `{"progress":1,"height":1}` se ve el cañón a 30 m, sin velo; en la cima (progress 1) la bruma queda 20 m por debajo.
Banda 24–41 en ambos casos, sin errores. Capturas: `scratchpad/t031/qa_h1.png`, `qa_p1.png`.

## T-035 pedido de 3D-PI (fall3d): no devolver los pisos al salir hacia la caída — hecho
Al salir hacia `fall` (bloque fall u outcome carregat/intent) baixada3d ya NO llama a `giveFloor`: los pisos siguen tomados (fall3d decide).
Se devuelven con `parts.baixada3d.releaseTronc()` (nuevo; **INT: llamarlo al empezar un pase**) o solos cuando baixada3d vuelve a llegar
(nuevo pase). Al salir hacia otro sitio (acta, descarregat) se devuelven como antes. Sin errores (estudio y obra).
- (TRO-F) baixada3d sólo toma los pisos con `state.block === 'baixada'` (nunca en la precarga, al cargar ni en un salto a otro bloque), y los
  devuelve en cuanto el bloque no es baixada ni fall (o no hay score). Comprobado: salto a tronc → 0 pisos tomados; salto a baixada → modo tronc. Sin errores.

## T-035 v3 (nota de QA + ARTE ronda 3) — a QA
Copia previa: `scratchpad/t035/baixada3d.v2.js`.
- **Cielo limpio y luminoso**: `#2A2140` en el cenit → lila `#B9A3E8` → rosa `#F3B9B0` en el horizonte → `#FFF6E0` hacia el este (P1).
  El sol es sólo un resplandor bajo el horizonte (sin disco) y las nubes son MÁS CLARAS que el cielo (iluminadas desde abajo al este).
  La bruma queda sólo abajo y lejos, sobre el agua.
- **Fuera los bloques rosas**: vuelve la plaza de la intro (cuatro lados a 18 m, campanario, el casco antiguo más lejos) a contraluz, como
  siluetas violeta oscuro con un borde cálido del lado del este y pocas ventanas encendidas, pequeñas.
- **El vidrio curva el horizonte**: cada esquirla deja ver lo de detrás doblado por su cara, refleja el cielo (Fresnel), tiene canto y un
  destello hacia el este.
- **La recogida se ve**: la esquirla se agranda ×1,4 y destella en el color de su piso, y se abre un anillo de luz en la mano (0,7 s).
  **Flores de vidrio** de 0,5–0,64 m (0,9 m como mucho con varias recogidas), 6–9 pétalos teñidos por su piso. Se abren en 1,4 s con un
  pequeño rebote y más brillo, y **SE QUEDAN** (hasta 64): un jardín de vidrio a lo largo de la banda de las manos como última imagen. Se apagan al salir hacia el acta.
Evidencia (sin errores WebGPU/WebGL2): `scratchpad/t035/b9.png` (ciclo de 40 s con 4 manos · 3 pisos), `b8.png` (incluye WebGL2).
Banda: sin manos 5–14 (siluetas) · 1 piso en WebGL2 30–40 · con 4 manos y destellos 54–87 (≤ 89).
- (director) Las cajas de la plaza son ahora siluetas negras puras (sin caras iluminadas, bordes ni ventanas); sólo el casco lejano se funde
  con el cielo bajo. Nuevo parámetro `town` (por defecto activado): ponerlo a false cuando `plaza.js` dibuje la plaza en modo silueta (INT).
  Sin errores en WebGPU ni WebGL2; banda 1–6 sin manos. Captura: `scratchpad/t035/f5gl.png`.

## T-035 ronda 4 de ARTE — a QA
Copia previa: `scratchpad/t035/baixada3d.v3.js`.
1. `town=false` desde el host: aplicado (en la obra no se ven mis cajas; la plaza en silueta es de INT).
2. Fuera los «neumáticos». Con anillos propios: 1–2 torres (el primer muro de la estructura y el tercero) con silueta de castell asimétrica:
   cada piso con su radio y un arco abierto (55–95 %), en voladizo sobre el de abajo (deriva ±1,5 m) y esquirlas en jerarquía 1 : 3 : 9
   (1,1–1,5 m · 0,6–0,85 m · 0,3–0,45 m). Con el castell real de tronc3d se usan sus pisos (takeFloor) sólo si es un castell de verdad
   (≥ 150 piezas y ≥ 3 pisos sobre la base). Si no, anillos.
3. Muro este (P1) luminoso en melocotón, el resplandor del sol bajo su horizonte; todas las esquirlas algo teñidas por su piso (1 de cada 5, del todo).
   La recogida destella con menos fuerza (la esquirla crece como mucho hasta 0,7 m).
Sin errores (estudio WebGPU/WebGL2, obra). Capturas: `scratchpad/t035/b11.png` (ciclo con 4 manos · 6 pisos), `obra5.png` (en la obra:
plaza en silueta + torre de vidrio + cielo). Banda: sin manos 45–66 · con 4 manos y destellos 56–101 (pico pasajero en P2).

## T-035 tope del destello en las zonas quietas — hecho · T-042 aparcado
El anillo de destello de la recogida (y su núcleo) se atenúa con `colDim(0.55)` dentro de las zonas quietas; la esquirla recogida ya lo
hacía (`colDim(0.7)`). Sin errores. La medida con 4 manos está en la línea de abajo. T-042 (l'aleta + bajar): ticket escrito
(`tickets/T-042-3DPO-aleta-bajar.md`), **aparcado por el director**: no hay código empezado (pom3d y baixada3d sin cambios por T-042).
Medida con 4 manos (ciclo de 40 s): 56–107; el pico (P4) lo dan la flor y el halo de la propia mano, que están delante, no detrás.

## T-042 hecho: l'aleta (pom3d) y la bajada = bajar (baixada3d) — probado en la obra con el público virtual
- **pom3d, l'aleta**: en la fase `aleta` del Pom, arriba de cada muro de la estructura la silueta de luz de la enxaneta (cabeza, cuerpo,
  piernas) **levanta la mano** en 1,5 s. Cada mano del público con `rise ≥ 0,28 m` o `y > 1,6 m` (de `state.strokes`) lanza un **rayo de
  oro** que trepa por el muro hasta arriba en 0,8 s, más ancho cuanto mayor es `aletaHands` / `aletaWidth`. Estudio: parámetro `aleta` (−1 = apagado).
- **baixada3d, la banda**: en cada muro de la estructura, una **banda de vidrio** a la altura de las manos (`state.band[w]`). En `lower` se
  **rompe** en 22 esquirlas del color del piso, que caen (y la recogida las atrapa: flores). En `crack` se **agrieta** y derrama esquirlas
  (34 si la rotura es brusca). Al soltar un piso, la torre lo suelta (`down`, como antes). Estudio: parámetro `lower`.
- **Prueba en la obra** (`review.html`, el público virtual del autopilot, 6 personas):
  - L'aleta: salto al Pom, fuerzo el final de la subida y la ventana se abre; a los 5,2 s, `aletaHands` 0,5 y dos rayos y dos enxanetas
    (castell en 2 muros). El ojo seguía abajo porque la subida se forzó.
  - Bajada: a los 8,8 s, un descenso hecho (7 → 5 pisos), bandas a 1,4–1,55 m siguiendo las manos, 75 recogidas y flores.
  - 0 errores.
- Hoja de contactos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t042/sheet-t042.png` (arriba l'aleta, abajo la bajada). Me detengo aquí.
