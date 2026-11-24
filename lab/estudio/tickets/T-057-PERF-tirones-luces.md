# T-057 — PERF · Tirones en los cambios de bloque + luces «steady» que no vuelven

Dueño: PERF · Encargo del director, 24-11 (Beltrán prueba en sala esta noche: estabilidad primero).

## Qué
1. **Tirón al cambiar de bloque** (QA: 56–87 ms en M1 Max, objetivo ≤ 30 ms). Medir qué cuesta en los primeros frames de la parte que
   entra y quitarlo, un cambio cada vez y detrás de un parámetro.
2. **Luces steady** (direccional / hemisférica movidas a la escena): el anfitrión las ponía a 0 al irse la parte y no las devolvía.

## Archivos (míos en este ticket)
`res-obra3d/experience.js`, `ressonancia/scenes3d/room3d.js`, `ressonancia/scenes3d/PARTS.md`. No: partes, score, sound, guide3d.

## Respaldo / volver atrás
`res-obra3d/experience.T057.js.bak`, `scenes3d/PARTS.T057.md.bak` (room3d.js no se tocó): `cp X.T057.js.bak X.js`.
Sin restaurar: parámetros `warmSets: false` (sin calentar los juegos de luces) y `prewarmRT: false` (precompilación como antes).

## Prueba
Sonda `scratchpad/perf/probe.js` (= qa/hitch.js + qué hizo el frame lento: CPU, pipelines/buffers creados, cocciones de entorno),
control positivo (espera ocupada de 300 ms → se mide ≥ 300), antes/después con los parámetros en el mismo código. `check.mjs`
WebGPU + WebGL2 0 errores, silencioso.

## Resultado (24-11, 22:10) — PERF
**Causa**: (1) los shaders de todo material iluminado dependen del juego exacto de luces que ve el render (por luz); el calentamiento
de la carga lo dibujaba con TODAS las luces encendidas (las de umbral3d y del acta incluidas), así que el juego real de los capítulos
(sin ellas) se compilaba en el primer frame de cada parte; (2) la precompilación del bloque siguiente compilaba para el formato del
lienzo (sin render target), no para la tira HDR: no servía. Arreglos en `experience.js`: precompilar en la tira (`prewarmRT`), un pase
de teselas en la carga (stripOut, comp, hilo conductor) y los juegos de luces que faltan compilados en segundo plano durante la espera
(`warmSets`, sólo WebGPU: en WebGL2 bloquea ~200 ms). Luces steady: se guardan y devuelven (prueba `perf/steady.js`: actatext 0,08 en las
dos visitas; con el anfitrión anterior 0 siempre).
**Medidas** (`perf/probe.js`, M1 Max, 7196×912 media, GPU compartida con QA: others 1–2; control 300 ms → 351). Frame del corte, CPU de
render / pipelines creados, antes → después: wait→intro 98/14 → 41/9 · intro→brasa 41/5 → 26/0 · brasa→pinya 78/12 → 16/3 ·
pinya→tronc 140/16 → 30/4 · tronc→pom 135/18 → 48/6 · pom→crown 102/16 → 0 · festa→baixada 83/14 → 0 · baixada→acta 64/14 → 28/0.
Hueco máx. 7 s: 118/72/113/160/149/117/99/79 → 60/67/62/45/63/44/49/46 (crown→festa 29 → 23); lo que queda > 30 son frames sin trabajo
de CPU (GPU compartida). Carga hasta el bucle: 4,6 s (igual que antes; el calentamiento síncrono de juegos costaba 12 s y se pasó a segundo
plano, ~7 s durante la espera, hueco máx. 50 ms).
**Queda**: plaza en intro (9 pipelines), pom3d / pinya3d crean 2–3 materiales al llegar, guide3d 1 malla del overlay (no son míos).
