# GUI — notas (T-027 · texto en español con tipografía 3D; botones 3D)

## 24-11 · primera versión visible (adelantada; 13:00)

**Qué hay**
- `scenes3d/typo3d.js` (nuevo): atlas SDF construido al cargar desde canvas (transformada de distancia euclídea propia, método de
  Felzenszwalb, el de tiny-sdf; 2048 × ~1000, 3 familias × ~190 glifos). Cada glifo = instancia de una rejilla de 4 × 4 teselas.
  Movimiento en el vertex shader: llegada por teselas que vuelan desde delante del muro, giran y encajan (de izquierda a derecha con
  azar), tracking que se abre, iridiscencia en vuelo, barrido de luz al quedar y suave cada 9 s; salida que se rompe hacia arriba.
  Halo oscuro pegado a la letra (del propio SDF) + placa elíptica muy suave: se lee sobre cualquier universo sin parecer HUD.
  API: `typo.text()`, `typo.slot()` (la línea que cambia: la vieja se rompe, luego llega la nueva), `typo.onWalls()`.
  Módulo con *top-level await* (fuentes + atlas antes de que arranque la obra): no hay parpadeo de fuente.
- Fuentes OFL autoalojadas en `scenes3d/fonts/` (`SOURCES.md`, `OFL.txt`, `Geist-OFL.txt`): Instrument Serif regular + itálica
  (github.com/google/fonts, 70 KB c/u) y Geist 400/500 (copiadas de `ui/fonts/`).
- `guide3d.js` reescrito (misma API para INT: `createGuide`, `update(dt,{state,hands,time,on,acta,hold,pace})`, `lines`, `CARDS`):
  - **Cartelas de cine**: romano pequeño espaciado · nombre grande en serif · valor en itálica sobre una línea fina
    («III · Tronc — Equilibrio»). Coronación «V · Coronado · 3 de 7»; fiesta «La plaza es vuestra»; caída «Ha caído — Quedan las brasas».
  - **Instrucción** en Geist, frase y contador en versalitas espaciadas; se atenúa (×0,45) cuando el grupo ya lo hace (pinya: muros
    sostenidos; tronc: los muros del castell con sus dos lados; pom: manos en el muro de la luz; baixada).
  - **Botones-objeto**: anillo de vidrio iridiscente (toro con película fina en TSL, reflejo y especular falsos, sin pase de
    transmisión) flotando 4 cm tras el plano del muro, mano dibujada en luz (contorno), disco oscuro suave. Mano cerca → se enciende y
    gira (respuesta ~70 ms, ease 14–16/s). Progreso = 28 teselas de cerámica con la paleta del capítulo (ARTE-2 §3) que vuelan y
    encajan una a una con destello; al completarse estallan con el vidrio. Tronc: aro de luz que se cierra y enciende el vidrio al
    llegar. Pom: quieto y respira. El anillo llega/se va por segmentos.
  - **Inicio (espera)**: el anillo se ensambla con `state.reveal` (si falta = 1), se llena con `state.start`; la frase «Poned las manos
    sobre el muro / para empezar» aparece cuando reveal > 0,75 y se va al empezar.
- `parts/introtext.js`: lema por muro (Fuerza / Equilibrio / Valor / Seny en serif, el catalán pequeño) y «Ressonància» + «Poned las
  manos sobre el muro», todo con el ensamblaje por teselas en el reloj de la intro.
- `parts/actatext.js`: acta en español con la nueva tipografía («3 de 7» en serif, DESCARREGAT espaciado, glosa en itálica, valores
  Fuerza/Equilibrio/Valor/Seny con el catalán pequeño, «14 manos · 22 s de quietud», la frase final, créditos «Con el apoyo de la
  Generalitat de Catalunya»); barras igual que antes. `res-3d-study/parts/actatext.json` (castell, outcome).
- `res-obra3d/review.html`: voz **Español** por defecto (primera en el selector); inglés seleccionable.
- Respaldos: `guide3d.ARTE2.js.bak`, `introtext.ARTE2.js.bak`, `actatext.ARTE2.js.bak`, `review.ARTE2.html.bak`.

**Evidencia** (`notas/caps-gui/`; `c-*` recortes a tamaño real de un muro, `s-*` la tira a 1800 px)
- `c-card-tronc.png` — cartela «III · Tronc — Equilibrio» (WebGPU, escala 1).
- `c-intro-assembling.png` — el título llegando por teselas (iridiscencia en vuelo); `c-intro-title.png` — ya en su sitio.
- `c-pinya-line-button.png` — instrucción + botón de vidrio con teselas de progreso.
- `c-pinya-burst.png` — muro completo: las teselas estallan.
- `c-tronc-both-sides.png` — Tronc con los dos lados (instrucción partida, dos anillos, «QUARTS · PISO 4»).
- `c-pom.png` — Pom: anillo quieto, «Quietos. Llevad su luz / ENXANETA».
- `c-wait-reveal.png` — la espera con reveal 0,64 (anillo a medio ensamblar entre las teselas de umbral3d).
- `c-acta-value.png` — valor del acta.
- `s-tronc-webgl2.png` — la cartela en WebGL2.
Sin errores de consola en WebGPU ni WebGL2 (obra, `?parts=atmos`, estudio de introtext y actatext). Los estados de tronc/pom/burst
se forzaron congelando la partitura desde `--eval-file` (scripts en el scratchpad). No he medido fps (QA).

**Observaciones**
- Una vez (~12:55) apareció en la obra completa `THREE.TSL: this.bNode.getNodeType is not a function` (MathNode) y no se repitió en 6
  corridas más, ni con `?parts=atmos` (sólo la guía). Sospecho de una parte en edición en ese momento; si QA lo ve, que me lo pase.
- La primera captura de la obra a veces cae en el *warm-up* de INT (todo visible a la vez): no es un error.

**Falta (hacia las 18:00)**
- Pase completo natural (review.html) mirando cada cruce de textos; `fall` y `festa` sin ver todavía.
- Ajustes finos con Vicente/QA: tamaño de la instrucción, brillo del vidrio en Pom, tracking del romano.
- Eventos de sonido sugeridos a ENT (ola 2): `'ui:lock'` (cada tesela que encaja: muro, u), `'ui:burst'` (botón completo).

## 24-11 · segunda vuelta de botones (pedido del director, ~13:05)
- **Mano**: una sola línea de grosor uniforme (8 px a 512, ≈ 2 px en el muro), dedos como trazos abiertos un poco abiertos en
  abanico, palma y pulgar en una línea, muñeca abierta; halo muy suave. Ya no es un contorno de clip-art.
- **Anillo**: toro de vidrio con cuerpo (tubo 3,2 cm, 18 × 144 segmentos); sombreado propio en TSL con `room.envMap`
  (`pmremTexture`): reflejo con Fresnel de Schlick + el entorno visto refractado a través del tubo (ior 1,45, rugosidad 0,25,
  algo más oscuro y frío); iridiscencia de película fina sólo en el borde rasante; se calienta con la mano, el pulso o al sostener.
  Sin `envMap` cae a un degradado. (No hay transmisión real: la guía se dibuja en `room.overlay`, sin el mundo detrás.)
- **Teselas**: 12 en vez de 28, el doble de altas (6,2 cm); cada una llega mientras se llena su parte y espera fuera de su sitio
  semitransparente; al completarse **encaja de golpe** con un pequeño salto de escala y un destello corto (el «clic»).
- **Instrucción**: 0,13 em (antes 0,15), alfa 0,8; contador 0,066 em, alfa 0,58: por debajo de la cartela.
- Evidencia: `caps-gui/c-button-v2.png`.
- **Error TSL MathNode** (`this.bNode.getNodeType is not a function`): no se reproduce en 10 corridas posteriores (mismo URL, obra
  entera y sólo guía). Ese patrón sale cuando una función matemática de TSL recibe un argumento que no es nodo (p. ej. `undefined`
  de un archivo a medio guardar). En ese minuto se guardó `parts/castell.js` (12:54:52, otro dueño); la guía, sola con atmos, nunca
  lo dio. Lo doy por un archivo ajeno en edición; si vuelve, lo reproduzco con `?parts=` hasta aislar la parte.

## 24-11 · tercera vuelta (notas de ARTE 13:10 + textos de ENT; 13:20) — entregado a QA
**Tipografía (ARTE §6)**
- Sin halo de neón: tinta hueso `#F2EEE6` al 92 % (lineal 0,76/0,73/0,68, bajo el umbral del bloom); secundarias al 60 %; el halo
  oscuro del SDF más corto. La única riqueza: el barrido de película fina y la iridiscencia de las teselas en vuelo.
- Movimiento: 35 ms de desfase por letra, cada letra 0,9 s con `easeOutExpo`, tracking +12 % → 0; salida 0,5 s; el romano entra
  0,2 s antes que el nombre; el filete se dibuja del centro hacia fuera en 0,6 s; el valor en itálica **sube desde detrás de su línea
  base** (máscara), no aparece por opacidad. La duración de cada texto se calcula de su número de letras (`text.dur`).
- Tamaños: título de obra 0,68 em (mayúscula ≈ 0,46 m); cartela 0,46 em (≈ 0,31 m); instrucción 0,15 em (≈ 0,10 m); etiquetas
  Geist en versalitas espaciadas (+16 %) 0,082 em (≈ 5,6 cm).
- **Instrucción: una sola pieza centrada** (bloque a 1,98 m: primera línea ≈ 2,05 m, etiqueta debajo). Fuera la frase partida del
  Tronc: «Mantened la torre recta» / «LOS DOS LADOS · QUARTS · PISO 4».
**Botón (ARTE §7)**: toro de vidrio r 0,23 m, sección 2,2 cm: reflejo del entorno con Fresnel + entorno refractado (ior 1,45) +
película fina sólo en el borde + **un** reflejo nítido que se desplaza despacio; en reposo el borde late cada 2,4 s (no en el Tronc,
que tiene su pulso). Disco interior de vidrio esmerilado oscuro al 35 %; mano en línea limpia de ~6 mm al 85 % (sin resplandor).
20 teselas de ~6 × 4 cm que encajan de golpe (salto de escala + destello corto) y estallan al completar.
**Textos acordados con ENT** (voz): espera antes de la revelación «Tocad. Jugad con la sala.»; revelado «Sostened el anillo para
empezar»; bajada «Acompañadlo» / «PISO A PISO».

**Pase natural** (review.html, 6 personas, calidad media, ritmo ×4, en silencio; corredor propio en el scratchpad que captura cada
1,5 s): de la espera a la intro siguiente sin textos superpuestos; cada cartela sale antes de que entre la instrucción; el título de la
intro se rompe al llegar Brasa (con ritmo ×4 la cartela de Brasa casi no llega a verse: a ritmo 1 tiene ~4,5 s). Hoja:
`caps-gui/pass2-sheet.png`. Evidencia del botón y la línea: `c3-pinya-button-line.png`, `c3-tronc-one-line.png`,
`c3-wait-revealed-webgl2.png` (WebGL2).
**Errores vistos en el pase, ninguno de la guía**: `ReferenceError: step is not defined "tronc3d.js:469"` (al cargar; archivo de 3D-FE
en edición) y, en el primer pase, `Render pipeline creation failed … fragment input variables 17 > 16` (un MeshBasicNodeMaterial con
`front_facing`, es decir, de doble cara y con normales: ninguno de los míos lo es desde el cambio a FrontSide; no se repitió en el
segundo pase). La guía sola (`?parts=atmos`) y los estados forzados de wait/pinya/tronc/pom/burst: 0 errores en WebGPU y WebGL2.
El error MathNode de las 12:55 no se ha vuelto a ver en 13 corridas.

## 24-11 · cuarta vuelta (13:30): acta como final tipográfico, botón ronda 3, auditoría de legibilidad, review en español
**Acta** (`parts/actatext.js`): «3 de 7» en serif; «descarregat» en itálica que sube sobre sus filetes; debajo, una cinta de seis
filetes de color (uno por capítulo: Brasa, Pinya, Tronc, Pom, Corona, Bajada; biblia §2) que se dibuja del centro hacia fuera; glosa en
versalitas. Valores con su nombre catalán grande (Força / Equilibri / Valor / Seny) y el castellano pequeño; la barra son 22 teselas
de cerámica del color del capítulo que enseñó el valor (Pinya, Tronc, Pom, Bajada): los huecos se dibujan de izquierda a derecha,
cada tesela llega, espera encima de su hueco y encaja de golpe con un destello; el número cuenta a la vez. La frase final es la de la
voz: «Este ha sido vuestro castell.» / «Cuando los cuerpos resuenan juntos, / nace la cultura.». Capturas `caps-gui/c4-acta-{4,15.4,29}.png`
(WebGPU y WebGL2, sin errores).
**Botón ronda 3**: disco `#0E1016` al 55 %; toro de 3 cm de sección con reflejo HDR ×2; la **mano de trencadís**: palma + 5 dedos =
6 teselas de vidrio con junta, que se encienden desde el corazón hacia el borde, una tras otra (la palma primero) al acercar y sostener
la mano; en reposo sólo brillan los corazones y el canto. `caps-gui/c4-button-rest-held.png` (reposo · sostenido).
**review.html**: tarjeta de inicio en español (título, etiquetas, botones, notas, nombres de los bloques). El «VOLUME» de arriba a la
derecha y las etiquetas de la barra inferior («chapter card»…) son del arnés y de `res-obra/autopilot.js`, no míos.

**Auditoría de legibilidad** sobre los fondos nuevos (`caps-gui/audit-readability.png`: Brasa, Pinya, Tronc, Pom, Festa, Bajada):
- Brasa, Pinya, Festa: se lee bien; nada que hacer.
- **Tronc**: la frase cae sobre bloques blancos muy brillantes y fibras de la torre (está en el centro del muro): placa ya al 60 %
  (petición de ARTE), **no basta** sobre blanco quemado. Propuesta: pedir a 3D-FE una zona tranquila en el centro del muro entre 1,75 y
  2,2 m (nada claro detrás de las letras; la torre puede ir más alta o más lejos ahí), o subir yo la placa al 75 % sólo en Tronc.
- **Pom**: la etiqueta «ENXANETA» compite con las líneas blancas: placa al 60 % también en Pom (hecho). Si no basta, pedir a 3D-PO
  líneas ≤ 45 % detrás de la banda del texto.
- **Bajada**: el texto se lee; el **botón se pierde** sobre bloques blancos que pasan por detrás (banda 0,9–1,6 m). El disco al 55 %
  ayuda; propuesta: pedir al dueño de `baixada3d` la columna del botón (±0,9 m, 0,9–1,6 m) sin piezas claras.

## 24-11 · 13:40 · ajuste fino de la mano (ARTE ronda 4: tipografía y botón aprobados)
Dedos como cápsulas de punta redonda abiertos en abanico, pulgar hacia el lado, palma redondeada: cada tesela es una forma blanda y su
corazón encendido es redondo (adiós al «stop» cuadrado). `caps-gui/c5-hand-round.png` (reposo · sostenido). Placa al 60 % en Tronc/Pom
(no 75 %). En espera de tronc3d/baixada3d (~17:30) para repetir la auditoría de legibilidad con las zonas tranquilas nuevas.
- 13:45 · **Texto tras la ola de teselas**: `typo.slot.step(…, { gate })` retrasa por muro la llegada de las palabras nuevas hasta que
  `gate(w)` se abre, +0,3 s; la guía usa `room.tileFront(w) >= 1` (contrato SUPUESTO hasta que RND-F lo documente en PARTS.md; si
  no existe, todos los muros entran a la vez, como ahora). Probado con un `tileFront` falso (muros a 0,5 s): retrasos 0,7 · 1,2 · 1,7 · 2,2 s.
- 13:50 · **Espera**: la instrucción pasa a ser la inscripción del dintel del umbral de ENT-F: una línea centrada a 2,12 m (sólo en
  `wait`; se recoloca sólo cuando no hay palabras a la vista). El anillo de inicio sigue en el centro del muro a 1,25 m, el mismo centro
  que el anillo de ENT-F (r 0,42, `notas/ENT-F.md`). Ojo: ENT-F.md dice «la clave del arco está a 2,6 m»; el director, 1,95 m. Si la
  clave está a 2,6 m, 2,12 m cae dentro del arco y no encima: que ENT-F lo confirme.
  Evidencia: `caps-gui/c6-wait-lintel.png` (inscripción sobre el arco, anillo concéntrico al de ENT-F).
- 14:27 · **Acta (ARTE ronda 4)**: el bloque del castell baja a 2,30 m (no se corta arriba; cinta 1,80, glosa 1,66); la cinta de seis
  colores se dibuja segmento a segmento (cada uno de izquierda a derecha, 1,8 s en total); el número va pegado al final de su barra,
  en serif 0,11 em con la mayúscula centrada en la barra. Sin capturas: ventana de GPU de QA hasta las 14:45; las tomo después.
  Capturas tras la ventana de QA: `caps-gui/c6-acta-fixes.png` (t 2,6 cinta a medio dibujar · t 4 · t 15,4 barra y número); sin errores.

## 24-11 · T-043 aparcado (orden del director, ~14:55)
- Ticket escrito (`tickets/T-043-GUI-guia.md`). El trabajo empezado (manos fantasma, escalera con sustituto de `learned`, líneas sin
  contadores, cartela de 4 s, aleta sin texto) **no está probado**: lo guardé en `scenes3d/guide3d.T043-wip.js.bak` y devolví
  `guide3d.js` al estado entregado (con los arreglos del acta, el dintel de la espera y la puerta de la ola), para no dejar código sin
  comprobar en la obra. Para retomarlo: `cp guide3d.T043-wip.js.bak guide3d.js` y probar con estados forzados.
- Bucle de espera en segundo plano (tronc3d/baixada3d) detenido. La auditoría de legibilidad sobre esas dos partes queda pendiente
  hasta nueva orden.

## 24-11 · T-043 reanudado (~15:10): la guía sigue a los gestos nuevos
`guide3d.js` = el WIP (`guide3d.T043-wip.js.bak`) + los cambios de hoy; respaldo del estado anterior `guide3d.preT043.js.bak`.
**Textos exactos** (para que ENT grabe las voces):
| Bloque | Invitación (se va al aprender) | Etiqueta (se queda) |
|---|---|---|
| Espera | «Tocad. Jugad con la sala.» → revelado «Sostened el anillo para empezar» | — |
| Brasa | «Tocad el muro» → aprendido: «Ahora, juntos» (hasta la 3.ª ola) | — |
| Pinya | «Buscad un círculo y sostenedlo» (como hoy; sin contador) | — |
| Tronc | «Levantad» | nombre real del piso (BAIXOS, SEGONS…) |
| Tronc, temblor (`wobble > 0`) | «Sujetad la base» | el piso |
| Pom | «Quietos» | DOSOS / ACOTXADOR / ENXANETA |
| L'aleta (`pom`, fase `aleta`) | sin texto; manos fantasma subiendo bajo la enxaneta | — |
| Coronación | cartela «V · Coronado · 3 de 7» | — |
| Bajada | «Bajadlo despacio» | el piso, bajando |
Sin contadores en ningún bloque. Cartela de capítulo: 4 s.
**Manos fantasma** (`guide.ghost(wall, gesture, strength)`; gestos `tap · gather · rise · lower · base · still · raise`): 2 por muro,
la mano de trencadís en luz sobre el plano del muro, junto a la primera mano real del muro (o en el anillo). Fuerza: 1 al enseñar
(cartela + 10 s), luego `state.assist` (o, sin él, 0,25 → 0,7 con el tiempo), 0 al aprender; temblor del Tronc: `base` en el muro
que tiembla; l'aleta: `raise` lento en el centro de cada muro. Un `ghost()` externo manda 0,5 s sobre el de la guía.
**Aprender**: `state.learned[verbo]` (verbos `tocar · sostener · subir · quietos · alzar · bajar`) en cuanto la partitura publica
alguno; hasta entonces, sustituto: 15 s de juego con manos. Al aprender, el anillo se rompe y la invitación se va.
**Ola de teselas**: cada muro recibe su texto nuevo cuando `room.tileFront(w)` = 1, +0,3 s (contrato ya en PARTS.md).
Evidencia: `caps-gui/c7-t043-tronc-wobble-aleta.png` (Levantad / Sujetad la base / l'aleta sin texto). Sin errores WebGPU ni WebGL2
(obra entera saltando al Tronc con público virtual). Pendiente: un pase natural completo (cuando el director lo pida).
- ~15:25 · **Arreglo**: el anillo no se disolvía porque yo buscaba `learned[verbo]` (subir, quietos…) y la partitura usa el nombre del
  bloque (`learned.pinya / tronc / pom / aleta / baixada`, ENT T-042). Ahora lee esas claves; la Brasa (sin clave) sigue con el reloj.
  En la Pinya la palma es la diana desde el principio: el anillo sólo enseña durante la cartela y 6 s de juego y se disuelve.
  Prueba en la obra (estado forzado): `learned.tronc = true` → anillos rotos en < 4,5 s; sin errores.

## 24-11 · lote de la guía tras la prueba de Beltrán (análisis §5: #7 #11d #12 #13 #14 #17 #18 #19 #21) — ~15:45
Regla: la guía enseña EXACTAMENTE lo que mide `score.js`. Respaldos: `guide3d.T045.js.bak`, `parts/introtext.T045.js.bak`.
- #7 intro: fuera «Poned las manos sobre el muro» (sólo «Ressonància»).
- #12 bajada: sin anillo; mano fantasma `updown` 1,0 → 1,6 → 1,0 m (baja 0,60 m a ~0,34 m/s, ciclo 5 s) junto a la mano real.
- #13 Tronc: fuera el anillo de pulso de 2,4 s; mano fantasma `phrase` guiada por `S.phraseT` (baja a recibir en `gather`, sube en
  `rise`, quieta arriba en `lock`). La banda es de 3D-FE / TRO-F.
- #14 espera: el anillo se enciende sólo con manos a |dx| ≤ 0,55 m (la prueba del score).
- #17 Pinya: «Juntaos» (se va con `learned.pinya`); mano fantasma `gather` (dos manos hacia el centro).
- #18 Brasa: por `brasaStage`: `spark` «Tocad el muro»; `call` «Con el tambor» hasta `learned.brasa`; la mano fantasma cae en el TOK
  (`call.at`) en los muros que llaman (`from`, `to`; `to = −1` = los cuatro).
- #21 ressonància: en cada frente (`fronts[]`), mano fantasma `tap` en el muro de llegada desde 0,8 s antes de `arrive`.
- #11d: en Tronc / Pom / bajada, los muros fuera de la estructura llevan «Ayudad desde aquí» (hasta aprender), su anillo (Tronc,
  Pom) y sus manos fantasma.
- #19 avisos: `state.warn` ('fall' | 'abandon') o los eventos `warn:fall` / `warn:abandon` → «Manos al muro» / «Volved al muro» en
  los cuatro muros, con el barrido latiendo y las manos fantasma latiendo. **Petición a INT**: pasar `events: frameEvents` a
  `guide.update(...)` (hoy no le llegan eventos; con `state.warn` ya funciona).
- Pruebas: `index.html?sound=ressonancia-sound&demo=0` con 0, 1 y 4 manos (`group`) saltando a wait, brasa, pinya, tronc, baixada y
  festa: 0 errores; estados forzados (Tronc fuera de estructura, bajada con mano, llamada de la Brasa, aviso de caída) en WebGPU y
  WebGL2 sin errores: `caps-gui/c8-guide-batch.png`.
Textos nuevos (para voces): «Juntaos» · «Con el tambor» · «Ayudad desde aquí» · «Manos al muro» · «Volved al muro».
- ~16:00 · **Cartela como capa**: la cartela (4 s) sube a 2,68 m y la invitación, el anillo y la mano fantasma del juego aparecen
  debajo desde el primer segundo (ya no esperan a que se vaya). **Avisos**: Pom forzado sin manos con `state.warn = 'fall'` →
  «Manos al muro» en los cuatro muros con el pulso, WebGPU y WebGL2 sin errores. Respaldo `guide3d.T046.js.bak`. Evidencia:
  `caps-gui/c9-card-layer.png`, `c9-warn-pom.png`.

## 25-11 · T-059 · el botón de vidrio líquido (bloque `wait`) — ~15:30
Respaldos: `guide3d.T059.js.bak`, `typo3d.T059.js.bak`. Spec: `ARTE-ENTRADA.md` §a/§c (ART).
- **Fuera** el toro iridiscente, las teselas de progreso y la mano de trencadís en luz. **Dentro** una lente de vidrio líquido r 0,28 m
  (todo dentro de r ≤ 0,30; el anillo de ENT queda en 0,36–0,55): un quad por diana con normales analíticas (bisel redondo 4,5 cm),
  refracción del entorno por el bisel (separación cromática casi nula: ART prohíbe la aberración), Fresnel, media luna de luz arriba y
  sombra interior abajo, filo blanco que coge la luz de la mano (`room.flash`) y sombra de contacto `#8A6F58` ≤ 25 %.
- Mano: trazo fino de 2–3 px (ancho en metros), tinta `#2E2A26` sobre claro, hueso sobre los universos oscuros. Sin relleno.
- Progreso: arco cobalto `#1F3FA8` de 3 px en el borde con una perla en la cabeza, marcas cada 10° en el bisel (40 % → 100 % al pasar),
  etiqueta Geist Mono «MANTENED» → «NN %» (sólo en wait), glaseado líquido discreto desde el borde. Al tocar: onda desde el punto de la
  mano en < 100 ms y la lente se inclina hacia ella. Al completar: onda sísmica con curvas de nivel y la lente se deshace en granos del
  centro hacia fuera (misma función de erosión para vidrio y granos); se condensa de granos con `state.reveal`.
- Tono claro/oscuro automático: `uLite = 1` en wait cuando `room.PALETTE.wait` es claro (ENT); el texto del wait pasa a tinta `#2E2A26`
  sobre un velo pálido (nuevo `U.plateCol` en typo3d), sin halo ni barrido de color. Contraste tinta/arena ≈ 9:1.
- Pinya / Tronc / Pom / bajada siguen con la misma familia (glaseado = paleta del capítulo, disco oscuro debajo); lógica de put() igual.
- Pruebas: obra entera WebGPU y WebGL2, wait en reposo / revelado / 1 mano / 2 manos a mitad / 4 manos + L / inicio (estallido), Pinya,
  Tronc, Pom con 4 manos + L: `"errors":[]` salvo un `writeBuffer` en Pom que ya salía con la guía anterior (A/B hecho; no es de la guía).
  Capturas: `album3/b1-button-rest.png`, `b2-button-hold.png`, `b3-button-close.png`.
- **Texto (propuesta al director, sin grabar voces):** el objeto ya no es un anillo → «Sostened el vidrio para empezar» o «Mantened la
  mano en el círculo». La partitura mide una mano a |dx| ≤ 0,55 m del centro del muro (cualquier altura): ambas siguen siendo verdad.
- **Ronda 2 (ART: CASI)** — respaldo `guide3d.T059b.js.bak` / `typo3d.T059b.js.bak`; texto del director intacto («Mantened la mano en
  el círculo»). Vidrio: en suelo claro el bisel ya no muestra el env gris-lila sino los tonos de la escena (degradado de fondo de la sala,
  invertido por la lente), tinte #EAF2F4 al 14 %, borde aparente 2,5 cm, arco especular blanco de 60° arriba a la izquierda; relleno
  líquido al 10 %. Mano: un trazo de ~2,5 px, dedos de ancho constante, 45 % del diámetro. Etiqueta mono #6B5F52 con mayúsculas ≈ 3 cm.
  Marcas cada 10° más anchas (cobalto 40 % → 100 %). Sombra #8A6F58 ≤ 25 %, desplazada 1 cm, sin AO apilado. Texto del wait en medium.
  WebGPU y WebGL2 (4 manos + L) sin errores; `npm run check` 90/90. La media luna oscura bajo el anillo de teselas es de ENT, no del vidrio.
