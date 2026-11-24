# Cuaderno de POV

## T-051 — Pom: tres subidas · Acta: la huella (24-11) — a QA
Respaldos: `parts/pom3d.T051.js.bak`, `parts/actatext.T051.js.bak`, `guide3d.T051.js.bak`, `res-3d-study/parts/{pom3d,actatext}.json.T051.bak`.
Cableado a POS (ENT › T-050): `pomStage`, `pomHolder/pomFrom/pomFly/pomFalter/pomThread[]/pomHandoff`, `pomGust`, eventos `gust:*`, `hush:break:*`;
`prints[]` `{ wall, dx, y }`, `printOpen`. Sin estado (estudio): sustituto con las mismas reglas (parámetro `stage` en pom3d.json; `prints`, `lang` en actatext.json).

**Pom (pom3d)** — se conservan la subida de 90 m, la ciudad de líneas, l'aleta (enxaneta + rayos).
- *relay*: la luz de oro (núcleo, aire, anillo de 1 px que respira, cruz fina) bajo la mano que la tiene; vuela en arco (1,5 s, por las
  esquinas, cresta ≤ 1,72 m: nunca en la zona del texto) dibujando el HILO detrás; cada mano que la llevó = una estrella; anillo al posarse.
  Titubeo: parpadea, el anillo se rompe, tiembla, vuelve. Los corazones de oro de las demás manos bajan (la luz es EL oro); sin
  constelaciones automáticas entre manos (el hilo es la constelación). El hilo queda al 40 % en el aliento y al 18 % en el silencio.
- *breath*: racha (`pomGust`/`gust:*`) = las líneas se doblan (onda que viaja, más arriba y lejos), la ciudad se sacude, las teselas
  cercanas vuelan de lado, la luz se balancea y se agarra.
- *silence*: líneas ×0,4, motas −80 %, pétalos −85 %, sólo su hilo; la luz más pequeña con una estela fina vertical; `hush:break` = un
  anillo pequeño (30 %) y una onda mínima en las líneas.
- Halo de la receta compartida (`room.makeHalo`) detrás de la luz que sube.
- ARTE ronda 5: sin el halo de 8 px de las aristas; líneas blancas ×0,6 (mástiles de la luz compensados); ventanas 35 %; zonas quietas
  al 30 % (`colDim` 0,7); constelaciones del cielo al 30 % (ya eran 1,5 px).

**Acta (actatext)** — «Dejad vuestra mano» (EN «Leave your hand», `lang`) a 1,18 m, borroso→nítido, 3–15 s (`printOpen`), se va al posarse
la primera huella. Huella de oro (palma + 5 dedos, izquierda/derecha, se forma desde la palma, canto brillante) bajo la mano; 1,6 s
después vuela al ANILLO alrededor del castell (elipse 1,95 × 0,68 m a 2,25 m; segundo anillo si > 40 por muro), dedos al centro,
re-espaciado uniforme según llegan; quedan hasta el final; anillo punteado tenue donde irán; luz que recorre el anillo desde 24 s.
El castell se queda hasta 24,6 s; «N manos» (mono) a 1,18 m 12–24,6 s; frase final más pequeña dentro del anillo; créditos.
Valores = 4 instrumentos por muro (bisel metálico con la receta de luz y el filo frío, esfera oscura, marcas de 1 px, arco del valor en el
color del capítulo, aguja con rebote); giran hacia una mano cercana. ARTE r5: bloque ×1,6 (r 0,19 m), cifra en mono 0,22, etiqueta mono 0,13.

**guide3d**: Pom por `pomStage`: relay «Quietos» (hasta aprenderlo), breath «Contened el aliento», silence sin palabras (sólo el nombre).
La guía no tiene juego EN: la línea EN del acta vive en actatext (`lang`).

**Pendiente / no mío:** «la línea de 1,25 m al 30 %» del acta = `LINEK.acta` (0,6 → 0,3) en `res-obra3d/experience.js` (INT). 

### Evidencia (0 errores de consola; WebGPU y WebGL2)
Hoja: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/t051/sheet-t051.png`
(relevo 4 manos estudio · 1 mano · 4 manos en la obra con la partitura de POS [hilo 2, 1 relevo] · aliento con racha · silencio ·
acta 30 huellas + diales · acta en la obra 4 manos [4 huellas posadas] · acta 0 manos). WebGL2: `acta-gl.png`, `relay-gl.png` (misma carpeta).
Racha medida: `gust` 0,69 con una mano moviéndose en el aliento. Scripts: `t051/pins.js` (estudio), `t051/obra.js` (obra, salto + pace por el canal).
