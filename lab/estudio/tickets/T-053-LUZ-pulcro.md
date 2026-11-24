# T-053 — LUZ · Pasada «elegante y pulcra» por capítulos (ARTE-3, sistema de T-048)

Dueño: LUZ · Encargo del director, 24-11 · Brief aprobado: `experiments/ressonancia/ARTE-3.md`; sistema: `scenes3d/PARTS.md` › «What the room gives since T-048».

## Qué (pulido, NO rediseño: cada universo conserva su identidad y todas sus interacciones)
Capítulo a capítulo, en este orden: festa (inicio de la corona turbio → luminoso y limpio), fall3d (intent recargado), pinya, brasa,
baixada, umbral (aprobado: toque mínimo).
- la receta de luz única (cálida arriba, filo frío, relleno bajo) y un halo suave detrás del protagonista de cada muro;
- fuera glitch / pixel-sort / ruido y el brillo emisivo excesivo;
- menos elementos donde se lee recargado (un protagonista por muro, con aire);
- las manos iluminan los bordes cercanos (`room.flash`);
- zonas tranquilas (texto ±1,6 m × 1,75–2,2 m; botón ±0,9 m × 0,9–1,6 m ≤ 35 %) y los 0,4 m exteriores de cada muro, en calma.

## Archivos (míos en este ticket)
`scenes3d/parts/brasa3d.js`, `pinya3d.js` (+ `pinya3d/`), `festa3d.js`, `baixada3d.js`, `umbral3d.js` (+ `umbral3d/`), `fall3d.js`.
No: pom3d, actatext (POV), tronc3d (TRON), score/sound (POS), room3d/guide3d. Notas: `estudio/notas/LUZ.md`.

## Respaldo / volver atrás
`<parte>.T053.js.bak` junto a cada archivo (y `pinya3d/body.T053.js.bak`): `cp X.T053.js.bak X.js`.

## Prueba
1 mano, `/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0` y `res-3d-study`, `check.mjs` (silencioso), WebGPU + WebGL2,
0 errores. Hoja antes/después por capítulo en `notas/LUZ.md`. Sin commits; aviso al director tras cada capítulo. Estabilidad primero
(Beltrán prueba en sala 25-11 08:45).
