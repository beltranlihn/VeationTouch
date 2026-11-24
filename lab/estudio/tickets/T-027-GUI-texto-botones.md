# T-027 — GUI · Texto en español con tipografía 3D y motion graphics; botones 3D

Dueño: GUI · Ola «Arte 2» (24-11) · Brief: `OLA-ARTE2.md` §1, §5, §6 · Dirección: `ARTE-2.md` §5–6.

## Qué
1. **Todo el texto visible en español (España)**; las palabras castelleras en catalán (pinya, tronc, pom de dalt, enxaneta, dosos,
   acotxador, descarregat, carregat, intent, Baixos/Segons/Terços…). Guía, cartelas, intro, acta.
2. **`scenes3d/typo3d.js`** (nuevo): tipografía 3D por glifo, instanciada. Atlas SDF construido al cargar desde canvas (transformada
   de distancia euclídea propia, estilo tiny-sdf, código nuestro), dos familias OFL autoalojadas en `scenes3d/fonts/`:
   *Instrument Serif* (títulos) + *Geist* (instrucciones, ya en `ui/fonts/`). Movimiento: los glifos llegan ensamblándose desde
   teselas, el tracking se abre, barrido de luz, salida que se rompe en fragmentos. TSL (WebGPU y WebGL2).
3. **Cartelas de cine**: romano pequeño · nombre grande en serif · valor sobre una línea fina («III · Tronc — Equilibrio»).
   Instrucción más pequeña con el mismo movimiento; se atenúa cuando el grupo ya lo hace.
4. **Botones-objeto**: anillo de vidrio iridiscente flotando en el muro, mano dibujada en luz dentro; se enciende y gira al
   acercarse la mano; el progreso se llena con teselas que encajan una a una; al completarse estalla en fragmentos. Tronc: aro de
   luz que se cierra sobre el vidrio. Pom: quieto, respira. Mismas posiciones/reglas que hoy. Franja 0,9–1,6 m legible, respuesta < 100 ms.
5. **Botón de inicio** (espera): se ensambla con `state.reveal` (0..1; si falta = 1) y se llena con `state.start`.
6. `introtext.js` y `actatext.js` al nuevo sistema y en español; `res-obra3d/review.html`: voz «Español» por defecto (inglés seleccionable).

## Archivos (sólo estos)
`ressonancia/scenes3d/guide3d.js` · `ressonancia/scenes3d/typo3d.js` (nuevo) · `ressonancia/scenes3d/fonts/` (nuevo) ·
`scenes3d/parts/introtext.js` · `scenes3d/parts/actatext.js` (+ sus .json) · `res-obra3d/review.html` · `notas/GUI.md` · mi fila del TABLERO.

## Pasos
1. Respaldos: `guide3d.ARTE2.js.bak`, `introtext.ARTE2.js.bak`, `actatext.ARTE2.js.bak`, `review.ARTE2.html.bak`.
2. Fuentes: Instrument Serif (Regular + Italic) de github.com/google/fonts (ofl/instrumentserif) + OFL.txt; Geist copiada de `ui/fonts/` + OFL.
3. `typo3d.js`: atlas SDF (FontFace → canvas → EDT) · layout (tracking, kerning por medida de pares) · `createText()` con un
   InstancedMesh por bloque (un quad por glifo, atributos: rect del atlas, posición, semilla) · uniforms de animación (asm, out,
   sweep, track) → todo en el vertex/fragment TSL. Sin asignación por frame; el texto se re-maqueta sólo cuando cambian las palabras.
4. `guide3d.js`: misma API (`createGuide`, `lines`, `CARDS`, `update(dt,{state,hands,time,on,acta,hold,pace})`), texto con typo3d,
   botones-objeto (anillo de vidrio: geometría toro + material físico/iridiscente barato en TSL, mano en luz, teselas de progreso).
5. Página de estudio para revisar sin el pase: `res-obra3d/review.html?from=<bloque>` (y capturas con `check.mjs`).
6. `introtext.js`, `actatext.js` con typo3d y en español.
7. Integración en la obra; WebGPU y WebGL2 sin errores; capturas en `notas/GUI.md`; entrega a QA.

## Punto seguro de corte
Tras el paso 4 la guía nueva funciona sola; si algo falla en intro/acta se quedan las versiones de respaldo. Cada archivo es
independiente: se puede revertir uno sin los otros.

## Cómo volver atrás
`cp X.ARTE2.js.bak X.js` (guide3d, introtext, actatext) y `review.ARTE2.html.bak → review.html`. `typo3d.js` y `fonts/` son nuevos:
si no se importan, no hacen nada.

## Prueba
`node lab/tools/check.mjs "/experiences/res-obra3d/review.html?from=tronc…" --shot … --delay …` en WebGPU y con `renderer: webgl2`:
sin errores de consola; capturas mirando cartela, instrucción y botones en wait (reveal/start), pinya, tronc (pulso y dos lados),
pom, intro (lema y título) y acta. No mido fps (QA).
