# T-012 · 3D-PI · Pulido de pinya3d: carga sin bloqueo, brazos, piernas y manos

- **Dueño:** 3D-PI · **Origen:** entrega T-007 (cuerpos de porcelana) · **Plazo:** 01:00
- **Archivos (sólo estos):** `lab/experiments/ressonancia/scenes3d/parts/pinya3d.js`, `.../parts/pinya3d/body.js`, `lab/estudio/notas/3D-PI.md`.
- **Respaldo:** `parts/pinya3d/pinya3d.T-007.js.bak`, `parts/pinya3d/body.T-007.js.bak`.

## Tareas
1. **El horneado no bloquea.** `bakeBody` pasa a ser un generador que cede cada pocos miles de operaciones; `create()` sólo
   prepara lo barato (multitud, suelo, resplandores, materiales) y devuelve; `update()` avanza los horneados con un presupuesto de
   ~8 ms por frame (figura que aprieta primero, después los 4 tipos de la multitud), y cada tipo crea sus mallas al terminar.
   Meta: `create()` < 50 ms; todos los cuerpos listos en < 3 s a 60 fps. `window.__pinya3d` expone `createMs` y `readyMs`.
2. **Brazos alzados que no parezcan antenas a 3–6 m:** antebrazo y brazo más gruesos, codo doblado en las poses despiertas (manos
   más cerca de la cabeza, polo del codo hacia fuera), mano con masa (palma + pulgar).
3. **Piernas y pies con forma:** muslo con masa del cuádriceps, pantorrilla (elipsoide detrás de la tibia), tobillo fino, pie como
   masa (no un cono).

## Criterio de PASA
- Captura de detalle a 3–6 m comparada con `v2_press_zoom.png`: brazos y piernas se leen como miembros, no varillas.
- Sin errores en WebGPU ni WebGL2.
- Banda de la guía 0,9–1,6 m sin cambios (fill 1 ≈ 36–37, closed ≈ 50–52, dormidos ≈ 3; tolerancia ±5).
- `createMs` < 50, `readyMs` < 3000.

## Cómo probar (fuera de congelaciones)
`node lab/tools/check.mjs "/experiences/res-3d-study/index.html?part=pinya3d&capture&demo=0&scale=1&params=<json>" --delay 6000 --shot <scratch>/v3_x.png --size 7196x912`
con los mismos estados que T-007 (dormidos, fill 0,6/1, closed, 4 manos fijas, leave, arrive, estado simulado, WebGL2) y `luma.py` sobre las capturas.

## Puntos de corte seguros
Tarea 1 sola ya se puede entregar; después 2 y 3 son cambios de primitivas en `bodyPrims` (cada uno reversible por separado).
