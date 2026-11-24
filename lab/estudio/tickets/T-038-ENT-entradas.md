# T-038 · ENT · Entradas nuevas de la partitura (paso 0 del plan de interacción) + T-039 l'aleta (paso 1, lado score/sonido)

- **Dueño:** ENT · **Verifica:** QA · **Aprobado por Vicente:** `ressonancia/PLAN-INTERACCION.md` (respuesta a la propuesta §8.1–8.3).
- **Archivos:** `ressonancia/score.js` y su copia idéntica `ressonancia-sound/score.js` (respaldo `score.INTERAC.bak` en las dos
  carpetas), `ressonancia-sound/sound.js` (+ NOTES), `res-obra/autopilot.js` (el público virtual, mío desde hoy), `ressonancia/GUION.md`
  (sólo la sección de entradas y l'aleta). `PARTS.md` es de INT: le paso el texto por el director. El host visual (`res-obra3d`) lo
  adapta INT (T-040).

## Paso 0 — entradas
1. `score.step(dt, hands)`: cada mano `{ stroke, wall, dx, y (m desde el suelo), vx, vy (m/s), size (m), s (m en el perímetro), speed }`;
   `dx` y `speed` se mantienen (compatibilidad). Sin `y` la partitura funciona como hoy.
2. Estado nuevo: por muro `yMed[w]`, `yL[w]`, `yR[w]` (mediana de altura: todas, lado izquierdo, lado derecho), `span[w]` (anchura total
   de manos dentro de la ventana de 2 m más densa), `rise[w]` (media de lo que han subido las manos desde su línea base); por trazo,
   línea base `y0` (al aterrizar, sigue despacio) y desplazamiento en 1 s (`hand(stroke)`); `learned{}` y `assist` (0..1).
3. `sound.js` construye los mismos campos con `vt.hands()` (`y = v × altura`, `size`, `s`, `vx/vy` del propio trazo).
4. **Pom, quietud robusta:** quieto = desplazamiento filtrado < 0,15 m en 1 s (`TIMES.pom.still`), no velocidad instantánea; un trazo
   perdido es ausente (linger), no inquieto.
5. Público virtual: subir (30–60 cm a 0,3–0,45 m/s), bajar, juntarse hacia el centro del muro, alzar una mano ≥ 30 cm.
- **Pruebas que saben fallar:** (a) la obra pasa igual que hoy con el público de hoy: tiempos de bloque ±5 % (simulación en node con la
  partitura vieja y la nueva); (b) `y` medida ±2 cm en el arnés (mano fija a altura conocida, leída del estado del sonido); (c) Pom con
  temblor del sensor (±3 cm a 10 Hz) no se pone inquieto; con movimiento real, sí.

## Paso 1 — l'aleta (T-039, lado score + sonido)
- Tras el premio del Pom, fase `aleta` (8 s, `TIMES.aleta = { window: 8, rise: 0.28, quorum: 0.6, within: 2 }`): cuenta cada mano que
  sube ≥ 0,28 m desde su altura al abrirse la ventana (o desde su aterrizaje si llega después) o que pasa de 1,6 m. Corona cuando la
  mayoría (≥ 60 %) de las manos presentes ha subido dentro de 2 s, o al acabar la ventana (siempre corona). Evento `'aleta'` con
  `aletaHands` (fracción que subió) y `aletaWidth` (0..1: más ancho cuantas más y antes), luego `'crown'` como hoy.
- Sonido: una subida que crece bajo la ventana; el golpe de la coronación cae en el disparo.
- **Prueba:** con manos quietas corona a los 8 s y estrecho; con manos que suben, antes y más ancho.

## Punto seguro de corte / volver atrás
- Cada paso deja la obra recorrible. Volver: copiar `score.INTERAC.bak` encima de las dos copias de `score.js`; `sound.js` tiene sus
  respaldos (`sound.ARTE2.js.bak`) y los cambios están marcados.
