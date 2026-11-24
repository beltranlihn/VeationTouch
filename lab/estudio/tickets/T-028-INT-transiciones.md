# T-028 — INT · Transiciones por teselas, hilo conductor, ojo global, render y guion de color

Fuente: `OLA-ARTE2.md` (§1 palabras de Vicente, §6 contratos), `ressonancia/ARTE-2.md` §3, §4, §7; refs. 13/14 (habitaciones rotas en
píxeles). Dueño: INT. Archivos (sólo estos): `res-obra3d/experience.js`, `ressonancia/scenes3d/room3d.js`, `parts/atmos.js`,
`parts/plaza.js`, `parts/castell.js`, `parts/fall3d.js`, `res-obra3d/NOTES.md`, `scenes3d/PARTS.md`, `res-3d-study/` (salvo .json ajenos).

## Pasos (en orden de prioridad; cada uno es un punto seguro de corte)
1. **Teselación en pantalla (room3d + anfitrión).** `room3d` gana una segunda tira HDR (`stripOut`) y un pase de composición antes del
   bloom: un campo de teselas en árbol cuádruple (bloques de ~128/64/32 px, enteros en x para que la costura P3|P4 envuelva) más bandas
   horizontales de *pixel sorting*. Cada tesela tiene su hora de cambio (un frente que recorre la sala desde un origen + azar): se
   despega, se encoge y se desplaza mostrando la imagen saliente, deja ver la entrante detrás, se da la vuelta con un filo iridiscente y
   encaja en el universo nuevo. API: `room.render(dt, pass)` con `pass('out'|'in')` del anfitrión para mostrar cada mundo;
   `room.setTiles({ mix, amount, origin, seed })`. El anfitrión: al cambiar de bloque, si alguna parte sale, ~3,8 s de teselas; las
   partes que salen sólo en la pasada `out`, las que entran en la `in`, las compartidas (atmos) y la guía en las dos. `TR` 5 → 4 s.
2. **Ojo global**: cada parte cuelga de un grupo `rig` del anfitrión; en la transición el mundo saliente y el entrante se mueven con
   un solo movimiento (subir, avanzar, girar ≤ 6°, velocidad máx. ≤ 6°/s, aceleración suave); al final todo vuelve a la identidad.
   Las partes compartidas no se mueven.
3. **Hilo conductor**: un objeto del anfitrión (uno por muro) dibujado en las dos pasadas, por encima de la tormenta de teselas:
   nace en el mundo saliente, se acerca al muro en el pico y se adentra en el nuevo, cambiando de forma (brasa → punto → tesela →
   línea) y de color (del acento saliente al entrante).
4. **Guion de color** (ARTE-2 §3): tabla de paleta por bloque en el anfitrión (fondo, acento, frío); atmos recibe `tint`/`warm`/`cool`
   y deja el ámbar fuera de la espera, la intro y Brasa. Plaza y castell siguen el acento del bloque.
5. **Render**: mapa de entorno generado (PMREM de una escena nocturna con tiras de luz de la paleta) expuesto como
   `room.envMap` / `room.useEnvironment(intensity)`; TAA propio (jitter por muro + historia con recorte de vecindad, envuelve la
   costura) como `aa: 'taa'` si aguanta; MSAA sigue por defecto si no. Documentado en `PARTS.md`.
6. **Cableado de las partes nuevas** a medida que lleguen (umbral3d en `wait`, castell/fall3d para 3D-FE).

## Cómo volver atrás
Respaldo antes de tocar: `room3d.ARTE2.js.bak`, `experience.ARTE2.js.bak`, `atmos.ARTE2.js.bak` junto a cada archivo. Interruptor sin
código: `params.tiles = false` (o `?tiles=0`) apaga la teselación y vuelve al cruce de siempre; `params.eye = false` apaga el ojo.

## Prueba
- `res-obra3d/index.html` con saltos (brasa→pinya, pinya→tronc, tronc→pom, baixada→fall, fall→acta): capturas a +0,6 / +1,4 / +2,2 /
  +3,2 s del cambio en `scratchpad/int/t028/`, y continuidad en la costura P3|P4 (recorte).
- 0 errores de consola en WebGPU y en WebGL2 (`renderer: webgl2`), en `index.html` y `review.html`. Sin medir fps (QA).
- Hitos: 15:30 primera teselación visible con capturas en `notas/INT.md`; 18:00 integrado y a QA.
