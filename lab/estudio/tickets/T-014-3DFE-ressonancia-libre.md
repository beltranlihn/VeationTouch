# T-014 · 3D-FE · la ressonància libre: deleite en solitario y pico de grupo

- **Dueño:** 3D-FE · **Archivo:** sólo `scenes3d/parts/festa3d.js` · **Respaldo:** `scratchpad/festa3d/festa3d.T-014-before.js`
- **Palabras de Vicente:** «la más libre … impactante y entretenido sin mucha instrucción». Tono de la casa: oscuro, elegante,
  misterioso, sin destellos.

## Qué se hace
1. **Deleite en solitario.** Una mano al llegar: anillo de oro y destello bajo la palma en el mismo frame (ya existía, < 100 ms). Nuevo:
   si se queda quieta, abre despacio una **roseta** de oro fino a su alrededor (seis pétalos y un anillo interior de doce, radio que
   crece de 0,1 a ~0,7 m en ~6 s, giro muy lento). Con muchas manos las rosetas se atenúan (1 / (1 + 0,35·(n−1))): son el regalo del solo.
2. **Pico de grupo.** Con el `bloom` del score (manos que aterrizan juntas → resonance 1 → evento 'bloom'; en el estudio la regla
   sustituta o `bloomNow`): además del bloom ya existente, una **grieta de luz** nace en el centro circular de las manos, corre en los
   dos sentidos a 9 m/s a ~2,15 m (encima de la banda de la guía), da la vuelta completa cruzando P3→P4 y se encuentra enfrente
   (~1,5 s); un frente de onda horizontal sale de ella; y la placa **se abre como la coronación** desde la grieta (celdas oscuras, luz
   que entra por las grietas), aguanta y se cierra (~6,5 s en total, subida 0,35 s: sin destellos).

## Criterio de PASA
- Tableros con 1 / 4 / 15 manos mostrando el pico; con 1 mano, también la roseta sin pico.
- El pico cruza P3→P4 sin corte (recorte de la costura).
- Resonancia 0 en P2 limpia (el control de T-010b).
- Sin errores en WebGPU y WebGL2.

## Pruebas (después de la congelación de las 23:50)
`check.mjs` res-3d-study `part=festa3d`, `demo=0` (15 manos: `group=8` + 7 fijas), eval `peak1.js / peak4.js / peak7.js / solo.js`
en `scratchpad/festa3d/`, capturas 7196×912; costura = últimos 400 px + primeros 400 px juntos.

## Puntos de corte seguros
Roseta (independiente) · grieta (independiente) · apertura de celdas desde la grieta (se puede quitar dejando la grieta).
