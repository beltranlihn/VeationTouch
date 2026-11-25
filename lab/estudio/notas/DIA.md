# DIA — notas (T-064: los correfocs esculpidos)

## Estado (25-11, 16:15)
Módulo nuevo `ressonancia/scenes3d/parts/brasa3d/diables.js` → `createDiables({ THREE, TSL, room, world, U, mirP, CHROME, fireRamp,
emit, MAXD, ringPoint })` → `{ meshes, update(dt, time, slots), root(i, out), joint(i, j, out), count, info, dispose }` (la API que
pasó el director; añadidos `ringPoint` y `CHROME`). **Sin montar**: lo monta BRA en `brasa3d.js` detrás de una bandera; el fragmento
de montaje está en la cabecera del módulo. No he tocado `brasa3d.js`. `npm run check` verde (90/90); `"errors":[]` en WebGPU y WebGL2
(cerca, baile, relevo, ciclo nacer/deshacerse, 14 diables a la vez), 60 fps en la comprobación a `?scale=1`.

Página de estudio (sólo el módulo + agua negra con espejo simple + un pozo de chispas por CPU con la firma de `emit`):
`/experiences/ressonancia/scenes3d/parts/brasa3d/diables/study.html?mode=close|dance|run|cycle` (`&gl=1` WebGL2, `&k=0.5` / `&dis=0.5`
congela el ensamblado / la disolución, `&n=14`). Capturas: `album3/d1-diable-close.png` (uno de cerca, escala 1) y
`album3/d2-diables-run.png` (arriba el relevo corriendo a 3 m/s, abajo tres bailando).

## Qué es (ARTE-BRASA §c)
- **Cuerpo**: 26 cápsulas cónicas sobre un esqueleto de 30 articulaciones (CPU; IK de dos huesos copiada de brasa3d): tronco
  inclinado 12°, capucha con pico, dos cuernos de 14 cm en dos tramos que se calientan hacia la punta, ojos de brasa rasgados,
  casaca hasta media pierna (bajo abierto), brazos, piernas, pies. Carbón `#23201E`, filo frío `#9FB4C8`, luz de su propio fuego
  (carretillas arriba, anillo abajo) y vetas finas de lava. Forca de 2,1 m a 60–75° (más alta en el giro), en V con dos puntas;
  carretillas Ø 8 cm al blanco.
- **Agujas** (ref 07/08): 3 000 por figura, de 3–5 cm (más largas en hombros, brazos y capucha), peinadas hacia arriba y hacia atrás
  con la carrera, `#B3260E → #FF7A1A → #FFD27A`; aditivas, ≥ 1,2 px, ocultas detrás del cuerpo (profundidad): se lee volumen.
- **Lenguas de papel**: 7 por figura × 4 capas anidadas (rojo, naranja, ámbar, crema; 2 cm entre capas), 28–45 cm, en hombros,
  capucha y casaca; se desprende una cada ~0,6 s, sube 0,6 m girando y se apaga a granate en 1,2 s; vuelve a crecer. Mates, bajo el
  umbral del bloom.
- **Partículas** (~30 % de la luz): 240 brasas que suben del cuerpo + 200 chispas cercanas de las carretillas (analíticas,
  compensadas por la velocidad: se quedan en el mundo). El paraguas largo de chispas (cono 120° hacia abajo, 1,2–1,6 m, rebote) va
  por las chispas GPU de BRA vía `emit`: 2 emisores por diable cada ~2 frames, ~190 chispas vivas por carretilla; destello de 6
  chispas largas al empezar a deshacerse.
- **Movimiento**: pasos saltados (2 saltos/s a 1,4 m/s; cadencia y apoyo según la velocidad, fase de vuelo al correr), **pies
  plantados** en el mundo (medido: 0,01 mm/frame de deslizamiento bailando, 0,4 mm/frame corriendo a 3 m/s), rebote de pelvis,
  balanceo, hombros contra los pasos, orientación suavizada desde la velocidad real, giro completo cada 4–5 s con la forca en alto,
  piernas recogidas en el salto del relevo (`slot.hop`).
- **Nacer / irse**: las agujas vuelan desde las brasas del suelo, el cuerpo se construye de los pies hacia arriba tras un frente
  incandescente (15 % de la altura), las lenguas crecen; al irse, el frente baja desde los cuernos, todas las lenguas se sueltan y
  las agujas suben en chispas.
- **Reflejo**: todo pasa también por `mirP` de BRA; lo sólido como copia transparente (0,6 · `U.refl`, tinte `CHROME`) para que
  se dibuje encima del suelo (que no escribe profundidad), lo luminoso aditivo.

## Coste
8 draw calls por cámara de muro (4 + 4 en el espejo). A 14 diables: ~45k quads + ~37k triángulos (×2 con el espejo); hoy eran 63k
quads aditivos ×2. Uniforms: 462 vec4 (30 articulaciones + 3 por diable). CPU: una pose por diable, sin asignar memoria por frame.
Sin compute ni texturas: WebGPU y WebGL2 iguales.

## Para BRA (montaje)
- BRA conserva spawn, vida, `k`/`dis`, `s`, relevo, calor del lecho; quita `pose()`, `JV`, `DS`, `devilMesh` y el bucle de las
  carretillas; llama `DIA.update(dt, time, devils)` una vez por frame después de `stepRelay`.
- Las ranuras pueden llevar `born` (semilla) y `style` (0 forca adelante, 1 forca por encima de la cabeza).
- `window.__brasa.roots`: usar `DIA.root(i, v)`.
- El espejo usa `transparent: true` en las piezas sólidas: si BRA cambia el suelo para que escriba profundidad, hay que revisarlo.

## Pendiente / a juzgar por ART
- Verlo montado con el agua, la foguera y la plaza de BRA (aquí el fondo es negro y el agua es un espejo plano).
- Profundidad virtual: la fija BRA (`slot.d`); la especificación pide 1,5–2,5 m.
- Las vetas de lava del cuerpo y la densidad de agujas son los dos mandos de «limpio» si ART lo ve cargado.

## Ronda de pulido T-064b (25-11, tras el CASI de ART) — respaldo `brasa3d/diables.T064b.js.bak`
1. **Sin pelaje**: agujas 3 000 → 1 800 (−40 %), 2–3 cm, **peinadas hacia abajo** a lo largo del cuerpo (tangente de bajada + eje del
   miembro hacia abajo, casi pegadas a la superficie), pocas en la ropa; cada una un poco más brillante.
2. **Vetas**: la mitad de densidad (ruido ×3,2 → ×2,3) y de **1 px** a cualquier distancia (`fwidth`); ninguna en la ropa.
3. **Ropa**: capucha honda con volumen (r 15,5 cm, pico 20 cm arriba y 15 cm atrás) y **faldón hasta media espinilla** (r 15 → 25 cm,
   bajo abierto), tela con pliegues, ribete de brasa en el bajo (sólo por fuera: el reflejo no ve un disco).
4. **Carretillas**: Ø 8 cm, `#FFE9B0`, cinco radios que giran 3,5 vueltas/s, ≤ 1,5 HDR (antes 2,6 entera: bola de bloom).
   **Figura más luminosa** (~×1,5): carbón ×1,5, luz de su propio fuego ×1,7, filo ×1,5, lenguas ×1,35; cuerpo opaco (opacidad 1).
- Visto también montado en la escena de BRA (`res-3d-study?part=brasa3d&group=4`, sólo lectura): se leen figuras con capucha y faldón
  con la forca, sobre la plaza. `"errors":[]` en WebGPU y WebGL2 (cerca, baile, relevo, ciclo, 14 diables); `npm run check` verde.
  `album3/d1-diable-close.png` y `d2-diables-run.png` recapturados.
