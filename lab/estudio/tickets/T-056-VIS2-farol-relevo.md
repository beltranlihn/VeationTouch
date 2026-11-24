# T-056 — VIS2 · Intro: la mano enciende el farol · Brasa: el relevo del diable

Dueño: VIS2 · Encargo del director, 24-11 · Propuesta de interacción §4.1 y §4.2; estilo ARTE-3 (contención, una receta, héroe + halo,
sin glitch); LUZ T-053 (una gota de cromo por muro, sin tejas flotantes: se conserva).

## Qué
1. `plaza.js` — evento `lamp` {wall, s} (de SCO2, T-055): el fanal más cercano (por ángulo desde el ojo, de los aún apagados) se
   enciende ya, antes de su hora (charco en el adoquín mojado y reflejo: salen solos del mismo uniforme). Sin manos, el ritmo de
   siempre (8–22 s). Encendido, se queda.
2. `brasa3d.js` — estado `relay` {s, lap, holderWall}, eventos `relay:jump` {from, to} y `corner` (SCO2, T-055): un diable de fuego
   corre al pie del muro siguiendo `relay.s` (continuo en esquinas y en la costura P3|P4), salta en arco corto a la siguiente mano, una
   llamarada en cada esquina, una estela de brasas en el lecho marca la vuelta recorrida; con ayuda (`assist`), 2–3 diables más corren
   a buscarlo. Altura de la mano → altura del chorro, clara.

## Archivos (míos)
`scenes3d/parts/plaza.js`, `scenes3d/parts/brasa3d.js`, `res-3d-study/parts/plaza.json`, `res-3d-study/parts/brasa3d.json`.
No: score.js (SCO2), room3d, guide3d, sound. Notas: `estudio/notas/VIS2.md`.

## Respaldo / volver atrás
`plaza.T056.js.bak`, `brasa3d.T056.js.bak`, `plaza.T056.json.bak`, `brasa3d.T056.json.bak`: `cp X.T056.js.bak X.js`.

## Prueba
0, 1 y 4 manos en `/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0` (intro y brasa) y en `res-3d-study`,
`check.mjs` silencioso, WebGPU + WebGL2, 0 errores. Hoja de contacto en `notas/VIS2.md`. Sin commits. Estabilidad primero (sala esta noche).
