# Cuaderno de INT

## Dónde quedé
**Parada segura (pausa por límite de uso):** todo funciona, 0 errores en las últimas comprobaciones. T-005, T-022 (mi parte) y T-025
hechos y aceptados. Abierto: el coste de la PRIMERA aparición de la plaza (20–40 ms de render, causa sin encontrar); el salto pom→fall
lo resuelve 3D-BR en fall3d. Nada a medias en los archivos.

T-005 `lab/experiments/res-obra3d/` (la obra entera en 3D). Hecho:
- `experience.js`: score (sigue a `ressonancia-sound` por BroadcastChannel o corre el suyo), `jump`/`pace`, `window.__obra = { score, following, parts, room, guide, fps }`;
  bloque → partes con entrada/salida cruzadas de 5 s (`input.arrive`/`input.leave`), partes ocultas y sin `update` cuando se han ido;
  sustitutos para capítulos ausentes (pinya → castell sólo pinya, pom/festa → plaza + castell); plaza llega/sale por `shatter`, castell
  por muro (`buildPer`/`disPer`/`tilt`), atmos por sus cantidades, introtext por su fundido; `t = 69` a atmos fuera de la intro;
  precompilación de todos los materiales al cargar (listo en ~1,3 s).
- `../ressonancia/scenes3d/guide3d.js`: dianas (anillo 60 cm + mano, 1,25 m, 2 cm tras el muro, disco oscuro, pulso que se cierra,
  arco), carteles y línea con la redacción de res-obra, en texturas de canvas con placa oscura, fundido cruzado al cambiar.
- `../ressonancia/scenes3d/parts/actatext.js`: acta 3D (castell «2 de 7», resultado en catalán + glosa inglesa, cuatro valores con barras,
  una por muro, línea de manos/silencio, frase final, créditos), línea de tiempo 0–40 s sobre `state.t`.
- `parts/castell.js`: opciones por muro `buildPer[]`, `disPer[]`, `show[]`, `tilt[]` (sin ellas, igual que antes; copia previa en el
  scratchpad `int/castell.js.bak`).
- `review.html`: la obra 3D sola con `../res-obra/autopilot.js`.
- Mapeo del castell: build = pinya (6,2/total) → tronco completo con `(floors + floorProgress)/9` en Tronc; pom de dalt con el progreso
  del pom (sustituto); baixada de lleno a pinya con `floors/maxFloors`. Inclinación −lean·7°, temblor ∝ weak/3, destello ×1,9 en 'floor'.
  Fuera de la intro el castell va a `light` ×1,5 (sobre la plaza encendida se leía débil).

## Pruebas (22:20–22:25, M1 Max, WebGPU, calidad low, ventana oculta)
- Pase por saltos en dos ventanas (wait→tronc, pom→acta): todos los bloques, partes que entran/salen como se espera, 0 errores.
- `review.html?people=6&from=tronc&q3=low&pace=4`: 0 errores, autopilot funciona, fader de volumen visible.
- Capturas mirados (scratchpad `int/`): wait, brasa, pinya, tronc, pom, crown, festa, baixada, fall, acta, intro.
  Ajuste tras mirarlas: placas de texto más oscuras (0,74) — sobre la arena de festa3d «2 de 7» casi no se leía.
- Un prueba de pase completo en una sola ventana no cabe en 15 s (≈ 80 s a ritmo 8): se cubre por tramos con `&from=`.

## Hallazgos y trampas
- `state[0]` de 'on' y 'off' es la misma letra: en los logs uso el estado entero.
- Un 'fall' saltado desde 'wait' no tiene plaza ni castell que romper (fallSet = lo que estaba): correcto.
- `setFromUnitVectors(z, normal)` gira 180° alrededor de un eje arbitrario cuando la normal es −z: la guía usa `makeBasis(right, up, normal)`.

## Traspasos a otros roles
- 3D-PO: `pom3d.js` registró una vez «Vertex buffer count (11) exceeds the maximum number of vertex buffers (8)» (WebGPU; 10 atributos
  + position); en la sala (WebGPU) puede fallar ese material. Juntar atributos en vec4.
- QA: capturas en el scratchpad `int/`; fps sin medir (sin turno).

## Hito 2 (22:44–22:55): los cuatro capítulos integrados
- brasa3d, pinya3d, pom3d, festa3d cargan solos (el anfitrión los carga si existen; si no, sustitutos). festa3d PASA (QA).
- Pase completo con público virtual por tramos (review.html, `&from=` cada bloque, ritmo 8, calidad low, 10 ventanas): wait→intro→brasa→
  pinya→tronc→pom→crown→festa→baixada→acta→wait, 0 errores de consola; más un salto en calidad high (wait, pom, fall, acta): 0 errores
  (el error de vertex buffers de pom3d ya no sale).
- Arreglos tras mirar capturas: el título RESSONÀNCIA de la intro se va en ~1,5 s (se quedaba debajo de la línea de Brasa); el acta
  ya no relee el score reiniciado al irse (mostraba «0 de 0») y se va desde t = 40 (todo fundido); placas de texto más oscuras.
- Capturas en el scratchpad `int/` (r-*.png, sheet2.png, sheet3.png, r-acta2.png).
- Para el director (arte, no lo toco): en Tronc/baixada el castell se lee como una columna fina y lejana (el `fit` lo empuja para que
  quepa la enxaneta); la pinya queda detrás de las dianas. Si se quiere más presencia: `distance`/`fit`/`tiers` en castell.
- Trampa: `node --check` sobre un .js fuera de un paquete "type: module" no detecta errores; copiar a .mjs para comprobar.

## Encargo 23:40 (hecho 22:54): decisiones de arte + bloom en la costura
- Tronc/baixada: castell a 6,5 m y `fit` apagado fuera de la intro (`setParams` al cambiar de modo; la intro conserva su colocación),
  luz ×1,75 (el destello de 'floor' sigue). Con 8 pisos la cima sale por arriba del muro. P2/P3 (sin estructura) quedan como plaza quieta.
- Acta: «2 de 7» 0,40 m de altura de mayúscula, DESCARREGAT 0,11, frase final 0,20, tinta cálida (255,226,186), placas 0,72, ganancia 1,85;
  la plaza apaga lámparas, cielo y ventanas en la primera mitad de su salida (las palabras del bloque siguiente se leen ya).
- Título de la intro sobre Brasa: confirmado en captura (`intro2brasa.png`: a los 3 s de Brasa sólo la cartela «I · BRASA»).
- room3d.js (ahora mío; copia en scratchpad `int/room3d.js.bak`): el bloom se repite en x (RepeatWrapping en el bright y en los 5+5
  niveles de blur de BloomNode). Prueba con una esfera HDR a 8 cm de la costura, luma media de las 3 columnas de cada borde:
  antes P4-lado 100 vs P3-lado 8 (luz en P4) y 6 vs 116 (luz en P3); después 84 vs 79 y 81 vs 89. La prueba sabe fallar (antes falla).
- Re-humo: saltos por todos los bloques en calidad high, review por tramos tronc y baixada→acta→wait, res-intro3d: 0 errores.
- Capturas: `tronc2.png`, `tronc8.png`, `acta8.png`, `acta29.png`, `intro2brasa.png`, `sheet4.png`, `seamA-*.png` / `seamB-*.png`.

## Robustez (23:00–23:15): LiDAR, arranque, abandono, carga
- LiDAR (`review.html?lidar`, público virtual, por bloque; comparado con el modo directo):
  - Hallazgo: con la sensación LiDAR aparece un trazo NUEVO en el mismo sitio (≤ 2 cm) de uno que el runtime aún sostiene: la misma
    mano dos veces → un falso aterrizaje (ola en Brasa, golpe en Tronc, destello en las partes) y una mano de más. Arreglo en el
    anfitrión: un trazo nuevo a ≤ 10 cm de uno vivo en el mismo muro se pliega en él (mismo id para el score, sin 'down').
    Pom: aterrizajes 18 → 13 para 9 manos quietas; baixada 13 para 9.
  - Trampa probada y descartada: coser huecos más anchos (0,35 m / 0,6 s) se comía los golpes reales de Tronc (levantar y volver al
    mismo sitio 0,3 s después): 0 aterrizajes en Tronc. Quitado. Ahora Tronc con LiDAR: 6 pulsos, pisos 0→3 en 8 s (= directo).
  - `room3d.hands()` da ahora `ended` (el sensor la ha perdido; el runtime la sostiene en su ventana) — sin uso en el anfitrión por ahora.
  - Dianas: held medio 0,83 (Tronc), 0,96 (Pom), 0,97 (baixada) con LiDAR; sin parpadeo (el held se suaviza). Brasa con LiDAR llega a
    reward (olas cuentan).
- Arranque (sala vacía, `demo=0`, LiDAR): a 2,5 s de cargar ya están las 4 dianas y «Place your hands on the wall / to begin»;
  dos manos en P4 y P1 → la intro arranca 4 s después (3 s de rampa; una pérdida breve no la para). Captura `start.png`.
- Abandono: desde Pinya y desde Tronc sin manos, a ritmo 8: vuelve a la espera a los 45 s de score, las partes salen cruzadas
  (castell se disuelve, plaza se rompe, brasa3d llega), 0 errores. Captura `aband-tronc.png`.
- Carga: todas las partes se crean al cargar (pinya3d nuevo incluido, síncrono) y se precompilan: página lista en ~2,5 s; nada se crea
  en una transición.
- Re-humo de todos los bloques: 0 errores. Hoja de capturas: `sheet5.png`.

## Guía legible en todos los universos (23:20–23:45)
Medida: captura 3600×460 por bloque en el momento en que la guía se ve (`demo=0`, calidad medium); por muro, en la banda del texto
(±1,6 m × ±0,14 m de la línea a 1,92 m / ±0,22 m de la cartela a 2,15 m): texto = percentil 98,5 de luma, fondo = mediana; anillo =
luma media del anillo (r 0,30 m) frente a un anillo de fondo a 0,62 m. Script: scratchpad `int/contrast.py`; runner `int/gpass.sh`.
- Antes (texto ×1,45 HDR, placa 0,74): tronc 2,5–2,8, festa 2,8, baixada 2,7–3,3, crown 1,9–2,0 (< 3).
- Causa encontrada: la placa oscura SÍ oscurecía, pero el propio texto (×1,45, por encima del umbral de bloom 0,75) florecía y su halo
  de bloom levantaba la banda (fondo con guía 83 vs 67 sin guía en Tronc). Arreglo: el texto a ×0,85 (justo bajo el umbral), placa 0,8,
  halo oscuro que abraza las letras (las mismas palabras en negro, desenfocadas como UNA imagen: nunca una caja), peso 400, anillos de
  2 cm (se leen a 3–6 m), disco bajo la diana 0,6. Alfa por `opacityNode`.
- Después (texto/fondo, muros con texto): wait 209 · brasa cartela 27–71 · brasa 41–52 · pinya 34–41 · tronc 5,0–6,2 · pom 6,6–13,7 ·
  crown 8,0–9,0 (P2 2,9: oro de la corona detrás en ese instante) · festa 54–72 · fall 42–71. Baixada se rehace con el encargo siguiente.
  Anillos: 150–199 sobre fondo 25–93. Intro y acta no llevan guía (sus textos son introtext/actatext).
- Contact sheet: `int/g-*.png`; números en `int/gpass-final.txt`.

## Tirones en las transiciones (23:28–23:40)
- Medida (ventana oculta, ruidosa; peor intervalo entre frames 1,5 s tras cada salto, más el tiempo de CPU por paso): en frío
  intro 338 · brasa 302 · festa 627 ms (compilación al primer uso).
- 1) Calentamiento al cargar: cada parte se actualiza una vez y TODA la escena (también las mallas ocultas de la guía y del acta) se
  dibuja en dos estados (reposo t 30 y rotura t 52) con `compileAsync` antes del bucle. 2) El halo del texto se dibujaba con sombra
  por letra (decenas de ms en cada cambio de línea, p. ej. «floor 3»): ahora una sola imagen. Con eso: intro 45 · brasa 20 · pinya 77→53
  · tronc 55 · pom 54 (pom3d update 32) · crown 23 · festa 23 · baixada 54 · fall 32 · acta 19 · wait 35.
- Lo que queda: la PRIMERA aparición de la plaza cuesta ~20–40 ms de render (repetida: < 4 ms); no es la luz (las farolas están en
  la capa 31) ni la rotura; sin causa encontrada aún. pom3d gasta ~30 ms en su primer update (de 3D-PO). Objetivo ≤ 20 ms no alcanzado
  en la plaza; para QA: medir con su instrumento.

## fall3d integrado (T-017 v2 de 3D-BR) — 23:46
- En 'fall': fall3d en lugar del castell que se disuelve. En el mismo fotograma en que empieza la caída, fall3d entra con arrive = 1 y
  castell.js se oculta (sin disolver, sin fundido); fall3d lee las torres de castell.js (`ctx.parts.castell`) con el build que tienen.
  `params.duration = TIMES.fall` (12). El resultado lo lee de `state.outcome`. La plaza se sigue rompiendo como antes.
- Relevo (capturas 0,5 s antes / 0,3 s después, `int/sheet-fall.png`):
  - desde la baixada (carregat): la misma torre en el mismo sitio; sin salto. Bien.
  - desde el pom (intent): HAY salto: en el pom se ve la torre de pom3d (otra geometría) y al caer aparece la de castell.js (con el build
    que dejó la última vez que se vio; en un salto directo al pom, sólo una pinya). Es de 3D-BR / 3D-PO (qué torre cae después del pom);
    el anfitrión no puede arreglarlo sin una de las dos partes.
- (Las notas de esto van aquí y no en notas/3D-BR.md: un solo escritor por archivo.)

## T-022, mis líneas (código 23:47–23:55; capturas después de las 00:10)
- Hallazgo de la auditoría: con el sonido mandando, un `jump` tarda 3–4 s en cambiar el bloque (el estado viene del sonido). Varias
  «tardanzas» de la hoja (el texto de espera a +1,5 s, la plaza «intacta» a +3 s en tronc→pom) son ese retraso, no el cruce.
- (1) wait→intro: la línea de espera se apaga con la rampa de inicio (1 − start²): cuando el pase arranca ya no está.
- (2) tronc→pom: la plaza empieza a romperse en el primer instante de su salida (1 − (1 − leave)², antes smooth: el primer cuarto
  apenas temblaba); las farolas mueren con sus piedras (el apagado rápido sólo hacia el acta). El corte a +4 s que queda es la cúpula
  opaca de pom3d al llegar (3D-PO).
- (3) pom→crown: pom3d recibe leave 0→1 en 5 s (el anfitrión lo hace igual para todas); su aspecto al irse es de pom3d.
- (4) crown→festa: un texto a la vez: el nuevo entra sólo cuando el viejo ha salido (vale para tarjetas y líneas).
- (5) festa→baixada: el mundo de la bajada (plaza, castell, baixada3d) empieza a montarse 2,2 s después, cuando la arena de festa ya
  se ha roto: sin el borde vertical de dos mundos a media pared.
- pom→fall (intent, DECISIONES 23:52): fall3d llega como siempre (monta el castell del grupo) mientras pom3d sale; castell.js oculto.
  Desde la baixada (carregat), relevo en el mismo fotograma.
- Baixada (encargo 23:47): plaza de noche (farolas y halo 40 %, cielo 30 %, ventanas 40 %, luna 35 %, bruma 30 %), atmos al 30 %
  (polvo, bruma, bokeh; manos remueven a la mitad), castell entra ya construido cayendo desde sus estelas.

## 00:00–00:15
- Baixada medida (review, 6 personas, `int/dark.py`: % de la pared por debajo de luma 15): con 40 % / 30 % → 17 %; final (farolas 18 %,
  halo 18 %, cielo 15 %, luna 12 %, ventanas 15 %, bruma 20 %; atmos 22 %, remover con las manos a la mitad) → 61 %, mediana 12.
  `int/r-baixada8.png`, `int/bx-crop.png`.
- Cruces (index sin sonido, por saltos, `int/x-*.png`): crown→festa a +1,5 s crown 0,00 / festa 0,61 (uno tras otro); inicio de Tronc a
  5,5 s: título 1,00 y la línea esperando; festa→baixada a +3 s: la bajada en 0,16 (empieza tras 2,2 s).
- tronc3d (T-021) integrado en Tronc. Acta: atmos sin farolas (lampGain 0), motas 15 %, sin bruma. Las PointLight de una parte oculta
  se ocultan (atmos lee toda PointLight con `.visible`, aunque su parte esté oculta: las farolas de la plaza seguían encendiendo el polvo).
- Pendiente de decidir: en Tronc, la nube de polvo calentado por las manos + la pinya florece y lava la línea de texto pese a la placa.

## Tronc «Piedra y cerámica» (00:20)
- Plaza en Tronc al 20 % (farolas, halo, cielo, luna, ventanas, bruma), atmos al 20 %, remover con las manos ×0,3, charco de luz bajo la
  pinya ×0,35 (nuevo `params.floorGlow` en castell.js, por defecto 1; la intro intacta).
- Medida (review, 6 personas, piso 5, `int/r-tronc6.png`, `int/tr-crop2.png`): 56,7 % de la pared bajo luma 15 (mediana 13); banda
  de la guía: media 56 (P4) / 55 (P1), texto p98 196. Antes (`r-tronc3d.png`): 1–2 % y la línea ilegible.

## 00:30 — Tronc partido y espera a oscuras
- Tronc con los dos lados: la instrucción se parte a ambos lados de la torre («KEEP IT STRAIGHT» a la izquierda, alineado hacia la torre;
  «HOLD BOTH SIDES» + el piso a la derecha), 32 cm libres a cada lado del centro; las mitades esperan a que la línea entera (o la
  cartela) se haya ido, y al revés. Texto ×1,05 (blanco cálido, antes ×0,85 se veía gris). `int/split-wait.png` (arriba).
- Espera: atmos sin farolas ni bruma, motas al 8 %: 93,2 % de la pared bajo luma 15 con la guía encendida (`int/wait2.png`, abajo).

## T-022 cierre: intro→brasa natural (00:45)
- Intro dejada correr hasta su final (t 67 → 70 → Brasa): a +1 s de Brasa ya está la cartela «I · BRASA», las brasas llegan por
  fragmentos y no hay hueco negro; el título RESSONÀNCIA ya no está. `int/intro-brasa.png`.

## T-025 — la página de Vicente (00:50)
- `res-obra3d/review.html`: la tarjeta de inicio es un selector con el estilo del laboratorio (tokens VEATION, chips, sin deslizadores):
  capítulo de inicio (wait … acta), voz EN / ES (`soundParams.lang`), personas 2 / 6 / 15, calidad medium / high, y un botón. Los valores
  por defecto son los parámetros de la URL (los enlaces siguen valiendo). Si se cambia algo (o falta `?sound`), el botón dice «Apply and get
  ready»: recarga con los parámetros nuevos (la audiencia, la calidad y la voz se leen al cargar) y luego un clic empieza (el navegador
  exige un clic para el sonido). El botón espera a que la obra y la audiencia estén listas («Loading…»). `int/chooser.png`.
  Probado: cambiar chips no arranca; con todo igual, el botón arranca el pase en Tronc siguiendo al sonido con voz ES.
- El retraso de 3–4 s en los saltos: NO era el sonido (un `ctl jump` se aplica en 13–208 ms; mide `int/evlag.js`). Era que un salto hecho
  SÓLO en la página visual (`window.__obra.score.jump`, como hacían las auditorías) lo pisaba el siguiente estado del sonido (25 ms
  después): la imagen volvía atrás y sólo cambiaba cuando el score del sonido llegaba solo. Arreglo en `experience.js`: todo salto local
  se manda también al sonido. Ahora el salto local se queda (pinya, tronc, festa: el bloque se mantiene, < 0,35 s medido con margen).
  sound.js y score.js sin tocar (score.js idéntico en las dos carpetas, comprobado con diff).

## 03:15–03:25 (reanudación)
- QA FALLA intro→brasa (título sobre la cartela): el título RESSONÀNCIA se va en ~0,6 s de su salida (antes ~1,4 s) y la cartela de
  Brasa espera a que se haya ido (`guide.update({ hold })` mientras introtext sale). Pase natural (ritmo 4): con la salida al 9 % la
  cartela está a 0, al 19 % entra (0,17) y el título ya no está. `int/ibn-*.png`, `int/ib-*.png`.
- Álbum 05-tronc: la cima saliendo por arriba es la decisión del director de las 23:00 (castell a 6,5 m, sin `fit`: el Pom de dalt nos
  sube allí). La guía sobre la base: en Pinya, Tronc y baixada las dianas quedan «suaves» (halo, relleno, icono y disco oscuro al 30 %; el
  trazo fino y su arco se quedan) y el polvo que calientan las manos ×0,3 también en Pinya. `int/soft.png`, `int/soft2.png`.
  En Pinya queda una nube brillante alrededor de la diana sostenida: parece la respuesta a la mano de pinya3d (3D-PI), no la guía.
- Álbum 11-fall-carregat casi vacío: es el momento de la captura, no fall3d. El álbum SALTA a 'fall' desde nada: el castell no estaba en
  pantalla, así que fall3d llega por su entrada normal (5 s) leyendo un castell sin construir. En un pase natural desde la baixada el
  relevo muestra la torre entera (`int/sheet-fall.png`). Para el álbum: capturar la caída carregat desde la baixada (sin manos 6 s).

## El coste de la plaza al aparecer — encontrado (03:25)
- Causa: la luna (DirectionalLight) y el cielo (HemisphereLight) de la plaza viven dentro de su objeto. Al ocultar/mostrar la plaza cambia
  el conjunto de luces de la escena, y three.js reconstruye todos los materiales iluminados (los 17 MeshStandard de la plaza): ~37–40 ms
  en CADA aparición, no sólo la primera (medido: render de la primera imagen 40 / 36,5 ms en dos apariciones seguidas).
- Arreglo (anfitrión): esas luces se pasan a la escena al cargar y se quedan siempre, con intensidad 0 mientras la parte no está (la
  plaza las vuelve a encender en su update). Ahora mostrar la plaza: 0,8 ms.
- Tirones de transición (peor intervalo entre frames, ventana oculta, ruidosa): intro 18 · brasa 19 · pinya 28 (pinya3d update 11) ·
  tronc 21–33 · pom 38 (pom3d 8) · crown 50 (sin paso de CPU > 4 ms: GPU o ruido) · festa 18 · baixada 20 · fall 19 · acta 19 · wait 19.
  Descartado antes: compilación al primer uso (el calentamiento ya la cubre), la rotura (shatter), las farolas (capa 31).

## 03:30 — luces y calor de las manos en Pinya
- Revisado: ninguna otra parte añade luces de three.js (pom3d, festa3d, pinya3d, tronc3d, baixada3d, fall3d: luz dentro del shader).
  Las PointLight de brasa3d y de las farolas están en la capa 31: three.js no las cuenta para el render (proyección con `layers.test`),
  así que ocultarlas no cambia el conjunto de luces. Con la luna y el cielo fijos, el conjunto ya no cambia nunca. Crown 50 / pom 38 no
  son luces: en crown ningún paso de CPU pasa de 4 ms (GPU o ruido de la ventana oculta); en pom, el primer update de pom3d ~8 ms.
- Pinya: el calor de las manos de atmos, apagado en Pinya (stir 0; antes ×0,3): la nube alrededor del botón sostenido desaparece y se ve
  la figura. `int/soft4.png` (antes `soft3.png` a ×0,1, `soft2.png` a ×0,3).

## 04:15 — festa→baixada
- La bajada empieza a montarse a 0,9 s de la salida de la festa (antes 2,2 s): con la festa ya oscura a ~1,5 s, ahora se cruzan.
  Capturas con público (review, salto festa→baixada): +0,5 / +1,2 / +2 s, sin hueco negro (los fragmentos de la festa siguen arriba
  mientras la plaza empieza a llegar). `int/fb-sheet.png`. (Una prueba sin manos cae a 'fall' al instante: la baixada sin manos 6 s se cae.)

## 04:45 — Pinya: el cielo sin estática
- En Pinya, atmos con motas al 25 % y sin bruma (el álbum 04-pinya mostraba las motas como estática de televisión). `int/pinya-motes.png`.

## 05:00 — «CROWNED» gris en el humo final de QA
- Causa: el humo corre a ritmo ×8 y los fundidos del texto eran en tiempo real (1,2 s): la tarjeta de la corona (t 3–14 del score = 1,4 s
  reales a ×8) no llegaba a verse entera. Ahora los fundidos del texto siguen el reloj del score (`guide.update({ pace })`). A ritmo 1
  y a ×8 la tarjeta está entera, blanco cálido con su halo: texto/fondo 4,5–5,3 (P2 3,4 a ritmo 1). `int/crown-crop.png`.

## T-028 — transiciones por teselas, ojo global, hilo, render, guion de color (24-11, 12:45–13:20)
Ticket: `tickets/T-028-INT-transiciones.md`. Capturas en `scratchpad/int/t028/`. Respaldos: `*.ARTE2.js.bak` (room3d, experience,
atmos, castell) y `PARTS.ARTE2.md.bak`.
- **room3d.js**: segunda tira HDR (`stripOut`) + pase de composición por teselas (árbol cuádruple ~0,45 m / ½ / ¼, número entero en x:
  envuelve en P3|P4; cada bloque se despega, encoge, se desplaza con un trozo de imagen vecina, se voltea con filo iridiscente — más
  fuerte donde la imagen es clara — y encaja en el mundo nuevo; bandas de *pixel sorting* sólo donde hay bloques en vuelo).
  `room.overlay` (escena sin profundidad dibujada tras las teselas), `room.envMap` (PMREM de una noche con paneles de luz) +
  `useEnvironment(k)`, TAA opcional (`opt.aa = 'taa'`: jitter Halton por muro + historia recortada 3×3; sin errores, suaviza el
  centelleo de las estrellas; MSAA sigue por defecto hasta que QA mida). API documentada en `PARTS.md` y la cabecera.
- **experience.js**: cada parte cuelga de un `rig`; al cambiar de bloque con alguna parte saliendo: teselas 2,6–4,2 s (tabla `MOVES`),
  origen en el centro de un muro al azar; el ojo global mueve mundo saliente y entrante con un solo gesto (subir en tronc/pom/crown,
  bajar en brasa/baixada/fall, girar en pinya/festa, retroceder en el acta; medido pinya→pom: 2,2 m y 5° en 4,3 s, pico 0,8 m/s y
  1,8°/s; todo vuelve a identidad). `TR` 5 → 4 s. Hilo conductor (uno por muro, en el overlay, 1,5 m a la derecha del centro del
  muro): punto/tesela/línea según bloque, pasa por tesela en el pico, color del acento saliente al entrante. La guía va en
  `room.overlay` (sus materiales ya eran depthTest false): el texto nunca se rompe con las teselas. Interruptores `?tiles=0`,
  `?eye=0`, `?aa=taa`.
- **Guion de color** (`PAL`): warm/cool/air por bloque a atmos (nuevos params `warm`, `cool`, `air`), `tint` a castell (rosa de
  amanecer en la bajada). **Pedidos atendidos**: Tronc = tronc3d + atmos (3D-FE, T-032); `wait` = umbral3d solo (ENT, T-026).
- Pruebas: saltos por todos los bloques en WebGPU y WebGL2 (`seq.js`), wait→intro→acta→wait, review.html desde la espera: 0 errores.
  Capturas: `sheet-tp.png` (tronc→pom a +0,7/1,5/2,3/3,3 s), `sheet2.png` (pom→crown +1,3/+2,2; intro→brasa +1,6), `sheet3.png`
  (pom→crown 3600 px + tronc→pom en WebGL2), `seam.png` (costura P3|P4 en plena transición: las teselas la cruzan sin corte),
  `aa-compare.png` (MSAA arriba / TAA abajo), `review-wait.png`.
- Pendiente: medir fps en transición (dos pasadas de escena ~4 s: QA); el golpe del sonido en el pico de las teselas (~1,6–2 s tras
  el cambio; hoy el sonido no tiene un golpe común de transición: ENT); el entorno sólo lo usan las partes que lo pidan.

## T-028 2.ª pasada (notas del director y de arte) + T-034 plaza de la intro (13:20–)
Capturas en `scratchpad/int/t034/`.
- **Teselas que llevan la imagen** (room3d): losas en árbol cuádruple (grandes lejos del frente, mitades/cuartos donde pasa), cada losa
  con su imagen ampliada y desplazada (paralaje), bisel claro arriba-izquierda / sombra abajo-derecha en sus propios colores; en la
  grieta nunca un agujero negro: la imagen de la losa estirada hasta el borde de su celda, en su sombra; luz iridiscente por la grieta
  sólo donde hay luz; vetas verticales de *pixel sorting* con los colores de la imagen. Una sola ola: media sala en ~0,42 × duración
  (≈ 1,6 s en 3,8 s). Mientras hay teselas el mundo saliente se queda entero hasta que el 60 % de sus losas ha girado (luego se va en
  1,5 s) y el entrante se monta en 1,6 s: las losas llevan imágenes, no restos de fundidos. `sheet-v4.png`, `sheet-v5.png`.
  Límite honesto: el negro que queda es el de los mundos mismos (pom, festa, brasa al empezar son casi negros: 75–78 % bajo luma 8
  en `v5-*`); con un mundo iluminado (la plaza) la ola no deja negro (`v4-tear.png`).
- **WebGL2**: el `clear()` de un destino tras pintar otro sólo limpiaba el último viewport (en las pasadas de teselas se acumulaban
  capas aditivas hasta el blanco: `dbg.png`). Ahora en WebGL2 cada muro se limpia en su propio render (autoClear con tijera); WebGPU
  sigue limpiando una vez. Verificado (`dbgc.png`, `sheet-v3.png`).
- **T-034** (`tickets/T-034-INT-plaza-intro.md`): la plaza tiene su **propio entorno** (`room.captureEnvironment`, nuevo en room3d):
  se captura en el calentamiento, la plaza sola en reposo (t 30) desde el ojo; losas mojadas, vidrio (rugosidad 0,06), hierro y
  espejos reflejan la plaza real (los reflejos hechos a mano siguen, más suaves). La **rotura de 46 s** ya no son paneles flotantes:
  la plaza se queda entera (`params.noBreak`) y el anfitrión la rasga en losas de imagen (46,3 → 57,8 s, misma composición, losas
  ×1,5) sobre el aire y el título; luego se oculta. Cielo de la plaza con tinte del guion de color (`skyTint`: alba rosa-lila en la
  bajada). `sheet-intro.png` (reposo), `v4-tear.png`, `v3-tear-webgl2.png`.
- **Línea del horizonte** (QA): fuera de la intro, fina (sin banda), en el acento del bloque y al 35 %; acta blanca fina; espera sin
  línea. `tronc-line.png`.
- **Pedidos**: Tronc = tronc3d + atmos; baixada = plaza + tronc3d (+ baixada3d) + atmos y tronc3d se queda en la caída (fall3d lo
  colapsa); pinya3d recibe `density`; umbral3d solo en la espera. fall3d ya no es mío (3D-PI).
- Duraciones de las transiciones SIN cambios (`MOVES`): `TILE_DUR` de ENT sigue valiendo; el pico de la ola sigue en ~mitad.
- Visto de paso: un error transitorio de tronc3d (`step is not defined`, tronc3d.js:469) en una carga; en las siguientes, 0 errores.
- **HDRI de Poly Haven: NO descargado.** La autorización llegó por el director, y mis reglas exigen que la descarga la confirme Vicente
  en su chat (nombre, origen, tamaño). Mientras, `room.envMap` sigue siendo el generado; para la plata fría de Brasa basta con
  regenerarlo con un tinte (pendiente).
- Pruebas finales: saltos por todos los bloques (ritmo 1,3 s) en WebGPU y WebGL2, review desde pinya: 0 errores.

## Luz de la plaza de la intro (tras el traspaso de room3d/PARTS a RND-F)
- `plaza.js`: detalle CC0 de la biblioteca compartida (`assets/cc0/`, Poly Haven): grano de `sandstone_cracks` en las fachadas y
  `large_sandstone_blocks` en las losas (un trozo distinto por losa), como detalle sobre el diseño procedural (albedo × desviación del
  mapa, sesgo de rugosidad); `params.detail` (0 = sólo procedural). Charcos de luz de las farolas `params.pool` (1,15 en la intro),
  luna más fría (0,55/0,68/1,0) y más fuerte en la intro (`params.moonKey` 2,2), ventanas encendidas 55 % en la intro. Fuera de la
  intro todo vuelve a 1. `sheet-light.png` (WebGPU arriba, WebGL2 en medio, detalle abajo), `light2-crop.png`; 0 errores.
- Honesto: la luna fría apenas se lee frente al sodio; si arte quiere más azul, subir `moonKey` o enfriar el cielo de la plaza.
- Pendiente: pase natural baixada→fall con tronc3d (espera a 3D-PO/3D-PI) y la elección de entorno por bloque cuando RND-F la exponga.
  No vuelvo a tocar room3d.js ni PARTS.md.

## 13:30 — azul de la noche, hilo, saltos de rig, umbral, álbum 2
- Plaza intro: frío/cálido. Piedra iluminada por el cielo desaturada hacia gris frío (`params.night`, la luz de las farolas sigue
  viendo la piedra cálida), emisivo azul noche #1B2A52 fuera de los charcos, charcos más cerrados (`reach` 0,4, `pool` 1,5), cielo de
  la intro más frío (`skyTint` 1,15/1,45/2,1), luna 0,58/0,72/1,0. Fachada alta medida (56,54,75) (antes ~(120,70,40) ámbar);
  `scratchpad/int/t034/light10-crop.png`. Polvo de atmos a la mitad en la intro (se leía como nieve).
- Hilo conductor: núcleo ~6 cm sin halo, ≤ ~1 en HDR (nada de rombo quemado), apagado mientras hay cartela (`phase === 'title'`).
- QA «rig salta 37° / 16 m/s a +2,35 s»: era la parte que sale al apagarse (vuelta a identidad estando oculta). Ahora una parte
  apagada conserva su pose y se recoloca al volver a llegar. Traza tronc→pom y wait→intro: velocidad máx. 0,9 m/s, sin saltos.
- wait→intro: el ojo avanza 2,5 m hacia walls[0] (por la puerta de ENT-F en ese muro; en los otros muros se lee como avance
  lateral/retroceso: un solo traslado no puede cruzar las cuatro puertas a la vez). 4,8 s, pico 0,9 m/s.
- Álbum 2: `estudio/album/make-album2.sh` (24 tomas: espera idle/revelada, intro reposo/rasgado, capítulos, cruces a mitad de
  tesela t1–t9, corona, festa, bajada, caída intent/carregat, acta) → `estudio/album2/` + `00-contact.png`. Ensayo con 3 tomas
  (03-intro-rest, 04-intro-tear, t3-brasa-pinya): 0 errores. El pase completo, cuando lo diga el director (~18:00).
- 13:40: wait→intro vuelve a un ascenso suave (0,4 m), sin avance (decisión del director: el paso del umbral es radial en umbral3d, ENT-F). T-034 entregado en TABLERO.

## 14:00 — corte a negro (QA T-028) y baixada
- Causa (hallada por RND-F): una parte que sale en mitad de otra transición conservaba `came` → ni en el mundo 'out' ni en el 'in'.
  Arreglado (`e.came = false` al salir). Acentos de las losas pasados a room3d (`accentFrom/accentTo` = hilo de cada bloque).
- `tr_nat.js` (review, ritmo 14) tras el arreglo: baixada→acta WebGPU 95 → 82 (antes 84 → 0,3); brasa→pinya WebGPU 40,6 → 35,3
  (antes 45,6 → 0,7); WebGL2 brasa→pinya 39,8 → 34,3. Caída máx. 14 %.
- Con `tiles:false` sigue la caída 46 → 15 en brasa→pinya: NO es del anfitrión. Aislado: con brasa3d sola no cae (34 → 36); con
  pinya3d presente cae en un frame aunque brasa3d reciba leave 0 y el estado congelado ⇒ pinya3d al llegar (arrive ≈ 0) tapa la escena
  (algo opaco/oscuro con profundidad). Para 3D-PI. Con teselas no se ve (mundos en pasadas separadas).
- baixada = tronc3d + baixada3d (sin plaza ni atmos), pedido del director. Pase natural baixada→acta: 0 errores, sin corte.
  (baixada→fall natural pendiente: el público virtual no suelta en este pase.)
- Visto de paso: `festa3d.js:744 iridP is not defined` en una carga WebGL2 (3D-FE, en curso).
- 14:10 — `releaseTronc()` de baixada3d al empezar un pase nuevo (wait/intro). Pase natural baixada→fall (carregat: el público
  virtual suelta, `empty` 2,5 s, ritmo 3): baixada → fall carregat a +0,8 s, tronc3d se queda (in → on), fall3d entra, baixada3d sale,
  0 errores. Captura `scratchpad/int/t034/carregat.png` (losas a media ola en P1, torre de vidrio del alba cayendo).
  Acentos de `setTiles` = `PAL[block].thread` (RGB lineal 0..1). `room.setEnvironment(block)`: existe en room3d pero aún no en
  PARTS.md; lo engancho al documentarse.
- 14:20 — `room.setEnvironment?.(S.block)` en cada cambio de bloque (y en el primer frame), con try. Carregat natural en WebGL2 y WebGPU: 0 errores, tronc3d in → on, fall3d entra.
- 14:35 — QA T-034: farolillos con núcleo cálido y pequeño (×6,5, 1,0/0,58/0,28; antes ×14 casi blanco). Rasgado de la intro con las
  losas nuevas de RND-F y acentos ámbar → azul noche: lleva la imagen de la plaza (`t034/nt-sheet.png`, t 50,9: P4/P1/P3 rasgándose,
  P2 aún entera). Con un único `origin` la ola no puede empezar en los cuatro muros a la vez: pido a RND-F un frente múltiple
  (`origins: 4`, uno por centro de muro) vía director. acta→wait natural (ritmo 14): el texto del acta sale en ~3,5 s de la espera
  (retenido hasta el 60 % de la ola y luego 1,5 s); no reproduzco los 9 s de QA.
- 14:50 — Rasgado de la intro con `origins: 4` (cuatro frentes desde el centro de cada muro, a la vez; `t034/o4.png`, t 49,1). Cada cambio de capítulo vuelve a `origins: 1` (comprobado: intro→brasa, una sola ola, frentes [0,0,0,0,42]).
- 15:00 — plaza `params.silhouette`: la plaza negra pura sin luz (cielo y suelo ocultos), un filo cálido tenue en lo que mira a P1 (el alba). baixada = plaza (silueta) + tronc3d + baixada3d; baixada3d `town = false`. WebGPU y WebGL2: 0 errores (`t034/sil-sheet.png`). Ojo: a 17 m las fachadas llenan casi toda la altura de los muros; el cielo del alba sólo se ve por arriba y entre las calles.
- 15:10 — silueta hundida (`silDrop` 13,5 m): azoteas a ~35 % de la altura del muro, el campanario más alto en P2, el cielo del alba domina (`t034/sil2.png`, con 12 m). 0 errores.
- 15:20 — (1) salto: las partes que salen sólo se van rápido si salieron > 1 s antes de esta transición (antes, un salto con el sonido mandando podía dar dos cambios seguidos y soltar la saliente en 1,2 s). (2) La línea ámbar a ~1,3 m en Tronc era la línea del horizonte de atmos (al 35 % con el acento terracota): ahora sólo existe en la intro y en el acta (`t034/tronc-noline.png`). (3) `aa: 'auto'` = TAA en calidad alta, MSAA debajo; el valor por defecto sigue 'msaa' hasta la ventana de fps de QA.

## 14:30–14:45 — tras la ventana de QA
- `aa` por defecto 'auto' (TAA en calidad alta, MSAA debajo): QA midió el mismo coste.
- Tirón de transición: la parte que llega fría (tronc3d: ~100 ms de render en su primer frame; sus pipelines no salen del
  calentamiento de carga). Nuevo: 1,5 s después de entrar en cada bloque (fuera de transición) se compilan las partes del bloque
  siguiente probable (`NEXT`, `compileAsync` con la parte visible sólo durante la llamada síncrona). Medido (ventana oculta, ruidoso):
  primer render de tronc 100 → 15–42 ms; pom sigue en ~60 ms el primer frame; huecos entre frames 50–80 ms en transición (GPU con dos
  pasadas en el M1): que QA vuelva a medir.
- T-040: por mano al score `{ stroke, wall, dx, y, vx, vy, size, s, speed }` (room3d.hands() da ahora `size` en m).
- Álbum 2 lanzado (24 tomas).
- 14:55 — Teselas, ronda de arte 4 (room3d vuelve a INT): jerarquía de áreas grande:media:pequeña ≈ 9:3:1 (antes ~70 % pequeñas),
  cada losa gira 3–12° (no da la vuelta: cambia de imagen con un fundido corto en lo alto del giro), menos espejos, destello suave,
  sin halo en los marcos (el bisel es la imagen iluminada), la luz sólo en ALGUNAS grietas y desigual a lo largo de ellas, las paredes
  del hueco con una traza mínima. Antes/después: `scratchpad/int/tiles-r4.png` → `tiles-r4c.png`. Respaldo `room3d.INT2.js.bak`.
  PARTS.md: estado nuevo de ENT (T-038/T-039) y campos de mano (T-040).

## T-045 — visor 3D de la sala (`res-obra3d/sala3d.html` + `sala3d.js`)
- La obra corre igual que en review.html (tarjeta de inicio, público virtual, sonido, fader); la tira del lienzo (su propio
  captureStream, como la vista 2D) se mapea cada frame sobre los cuatro muros de un modelo de la sala hecho como room3d (anchos y
  alturas reales, orden del perfil, esquinas unidas). Visor three r187 en WebGL2 en su propio lienzo.
- «Dentro» (ojo en el centro a 1,6 m; arrastrar mira 360°, rueda 60–100°) y «Fuera» (órbita; muros sólo por su cara interior);
  botón y tecla V. Personas de escala (1,65–1,72 m y un niño 1,2 m), suelo oscuro, etiquetas P1–P4.
- Manos: clic en un muro = mano 0,8 s; Mayús + arrastrar (o botón «Mano», tecla M) = mano que sigue al puntero; van por
  `stage.put/lift` del arnés (s = fracción de la tira, t = 1 − altura).
- Comprobado: 0 errores (obra WebGPU y WebGL2), `scratchpad/int/t045/dentro2.png` (esquina, Pom continuo), `fuera-gl2.png`,
  `hand.png` (mano puesta desde el 3D en P4 a 0,72 m → la brasa responde; `vt.hands()` la muestra en P4 478,368).
