# T-007 · 3D-PI · Cuerpos de porcelana y arcilla (no maniquíes)

- **Dueño:** 3D-PI · **Origen:** entrega T-002 (`pinya3d`): los cuerpos se leen como personas, pero como maniquíes de primitivas.
- **Archivos (sólo estos):** `lab/experiments/ressonancia/scenes3d/parts/pinya3d.js`, opcionalmente un módulo hermano
  `scenes3d/parts/pinya3d/body.js` (generador de cuerpo, sin dependencias), `lab/experiments/res-3d-study/parts/pinya3d.json`,
  `lab/estudio/notas/3D-PI.md`.
- **Respaldo antes de empezar:** copia `pinya3d.js` → `scenes3d/parts/pinya3d/pinya3d.T-002.js.bak` (no se carga; es la versión que PASA/FALLA en QA).

## Criterio de PASA
1. A 3–6 m del muro, un cuerpo se lee como **una sola superficie continua** (sin anillos de elipsoides ni juntas en hombro, cadera,
   codo): figurilla de arcilla o porcelana esculpida, no maniquí articulado. Se compara con captura de T-002 en el mismo encuadre.
2. Material: luz envolvente + borde de perla + brillo bajo la piel. La parte gruesa (tronco) más profunda y roja; las partes finas
   (dedos, orejas, borde de hombros) más translúcidas.
3. Rendimiento: cada vista dibuja sólo sus cuerpos. QA mide en su turno: ≥ 50 fps WebGPU a escala 1 con la parte sola (M1 Max), y no peor que T-002.
4. No se rompe nada de T-002: poses (dormido/despierto/rotllana/presión), fragmentación (arrive/leave), grietas, manos < 100 ms,
   WebGL2, `input.state`/eventos.

## Pasos (cada uno es un punto de corte seguro: al acabar cualquiera, la parte funciona y se puede entregar)

**Paso 1 — Cuerpo único por SDF + surface nets (en la carga, CPU).** *Lo que más se nota.*
- En `body.js`: SDF del cuerpo en pose de reposo (pose A abierta) = unión suave (`smin` polinómico, k ≈ 4–6 cm en el tronco,
  2–3 cm en las articulaciones) de las mismas primitivas que T-002 (elipsoides de pelvis/tronco/hombros/cabeza, cápsulas cónicas de miembros).
- Malla: *surface nets* sobre una rejilla (3 cm para la multitud, 1,8 cm para los «pressers»), vértice proyectado a la superficie
  con 2 pasos de Newton; normales = gradiente del SDF. Las manos detalladas de los «pressers» se generan aparte (rejilla de 4–5 mm)
  y se unen al antebrazo.
- **Skinning en la carga:** cada vértice se liga a 2–3 huesos (peso = exp(−(dᵢ − d_min)/2,5 cm) sobre la distancia a cada primitiva).
  Cada pose (A/B/C y las de presión) = transformación rígida reposo→pose de cada hueso (marco: eje del segmento + polo del codo/rodilla).
  Así las tres poses comparten topología y el vertex shader de T-002 las mezcla igual que hoy.
- Fragmentos: Voronoi sobre esta malla; vértices duplicados **sólo** en los bordes de fragmento (geometría indexada: ~1,3× vértices,
  no 3×). Mismos atributos `aSh`/`aAux` que hoy → el shader no cambia.
- Presupuesto: ≤ 2 500 vértices por cuerpo de multitud (hoy son 5 664 sin indexar), ≤ 9 000 por «presser».
- Si la carga pasa de ~400 ms: bajar la resolución de la rejilla o hornear una vez y guardar en caché en memoria (sin archivos).

**Paso 2 — Material de porcelana y arcilla.**
- AO horneado por vértice (5 muestras del SDF a lo largo de la normal) → axilas, cuello, entrepierna.
- «Grosor» horneado por vértice (distancia al eje del hueso / radio) → translucidez: brillo bajo la piel y SSS de contraluz
  `pow(saturate(dot(V, −L + N·0,3)), 3)` en rojo cálido, más fuerte en lo fino.
- Moteado de arcilla por vértice (ruido 3D en la carga) en vez de ruido en el fragment shader (cero coste por píxel).
- Brillo de porcelana suave (Blinn, exponente ~40, 0,1) que desaparece al secarse (`dry`).

**Paso 3 — Culling por sector.**
- Instancias agrupadas por (banda de anillos, sector de 45°): `Group` por banda que gira con `rotation.y` (la rotllana sale del
  shader al objeto), y un `Mesh` por sector con su propia `InstancedBufferGeometry` (comparte el buffer de vértices) y su
  `boundingSphere` → el frustum de cada muro descarta ~3/4 de los cuerpos. Unos 2 builds × 3 bandas × 8 sectores = 48 meshes.
- `frustumCulled = false` sólo mientras los fragmentos vuelan (`leave > 0` o `arrive < 1`).
- LOD opcional: las bandas del fondo con la malla de 4 cm.

**Paso 4 (si hay tiempo) — Vida.** Dos variantes de pose dormida (cabeza apoyada en el hombro de delante / brazos cruzados) y paso
de sardana con dos poses de pierna en vez de levantar el pie.

## Cómo probar
- Funcional (libre, fuera de congelaciones): `node lab/tools/check.mjs "/experiences/res-3d-study/index.html?part=pinya3d&capture&demo=0&scale=1&params=<json>" --delay 6000 --shot <scratch>/x.png --size 7196x912`
  con `fill` 0 / 0,6 / 1+`closed` 1, `leave` 0,45, `arrive` 0,55, manos fijas (`--eval-file` con los 4 Shift+clic a 1,25 m), el
  estado simulado del score (envolver `__study3d.part.update` e inyectar `state`/`events`), y `renderer: "webgl2"`. `errors` vacío.
- Visual: recorte a resolución completa del mismo encuadre que T-002 (`press_zoom`, `fill` 0,6) lado a lado: sin juntas, volumen continuo.
- Números: `window.__pinya3d` (vértices por cuerpo, cuerpos) y, en el turno de QA, fps WebGPU/WebGL2 a escala 1. Yo no mido.
- Tiempo de carga: `performance.now()` alrededor del horneado, anotado en `notas/3D-PI.md`.

## Riesgos
- Surface nets + skinning: estiramiento en hombros con brazos arriba (pose B/C) → reposo en pose A con brazos a ~35°, y pesos
  limitados a huesos vecinos. Si se ve mal, recurso: mantener las primitivas en los brazos y usar el SDF sólo en el tronco, la cabeza y la pelvis.
- La geometría indexada cambia el cálculo de grietas (`aAux.x`): marcar 0 los vértices duplicados en el borde.
