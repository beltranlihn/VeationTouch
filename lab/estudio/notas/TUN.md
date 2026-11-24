# TUN — notas (T-052, sesión en la sala)

## Qué hay (24-11)
- `experiments/ressonancia/tuning.js` (+ copia idéntica `ressonancia-sound/tuning.js`): tabla `TUNE` (37 umbrales de `TIMES`),
  `PRESETS` (`lab` = la partitura tal cual · `sala` = arranque tolerante), `overrides(P)`, `applyTimes(T, ov, TIMES)`, `manifestParams()`.
- `res-obra3d/manifest.json`: + `mode` + `tuning` + `t.<ruta>` (46 parámetros de 64). Generado con `manifestParams()`; si cambia la
  tabla, regenerar (ver el comentario de `manifestParams`).
- `res-obra3d/experience.js`: `tune()` aplica los umbrales a `score.times` al cargar y en cada `params` (en vivo, sin recargar) y los manda
  al sonido: `ctl { times }` en cada cambio y cada 1 s junto al `pace`. `__obra.tuned()` da los efectivos; consola: `res-obra3d: thresholds {…}`.
- Regla de valor efectivo: valor del operador si difiere del defecto del manifiesto → si no, el del preset → si no, el `TIMES` de la
  partitura (así un cambio posterior de `TIMES` en score.js no lo tapa un defecto viejo del manifiesto). `null` en `times` = volver al de la partitura.
- Verificado en el arnés (check.mjs --eval): `t.tronc.rise` 0.33 → 0.2 al instante; con `tuning=sala` el valor movido a mano manda
  (0.2) y el resto toma el preset (`pom.still` 0.22, `pinya.pack` 0.45/0.8); de vuelta a `lab` todo vuelve (0.33 / 0.15 / 0.55/0.9);
  el canal llevó `ctl.times`. 0 errores de consola.
- Fuera de alcance sin tocar score.js: la zona «near» de la Pinya (1,8 m → 3 m del centro, l. ~295) y los umbrales fijos 0,15 m de
  «base» en Tronc (l. ~370) están escritos en el código, no en `TIMES`. Si la sala los pide, POS los pasa a `TIMES.pinya.near` /
  `TIMES.tronc.base` y se añaden dos filas a `TUNE`.

## Parche sound.js (para POS cuando termine T-050) — SIN APLICAR
Sin esto, en la sala los umbrales del panel sólo mandan cuando la imagen corre sola: **con el sonido en marcha manda la partitura del
sonido**. Dos cambios en `ressonancia-sound/sound.js` (y nada en su manifiesto: un solo panel, el de la pieza visual):

1. Línea 30:
```diff
-import { createScore } from './score.js';
+import { createScore, TIMES } from './score.js';
+import { applyTimes } from './tuning.js';   // T-052: the visual piece sends the room's thresholds (ctl.times)
```
2. En el `bc.onmessage` (hoy l. ~1022), al final de la rama `ctl`:
```diff
-if (m?.type !== 'ctl') return; if (m.pace > 0) pace = Math.min(32, m.pace); if (m.jump) score.jump(m.jump); };
+if (m?.type !== 'ctl') return; if (m.pace > 0) pace = Math.min(32, m.pace); if (m.jump) score.jump(m.jump); if (m.times && typeof m.times === 'object') { try { applyTimes(T, m.times, TIMES); } catch (e) { console.error('ressonancia-sound: times', e); } } };
```
(`T = score.times` ya existe en la l. 110.) Comentario de cabecera (l. 9): `{ type: 'ctl', pace?, jump?, times? }`.
Prueba: `/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0`, P → `t.aleta.quorum` = 0.3, saltar a `crown` y ver que
corona antes; o en consola de la página del sonido (si se expone) `score.times.aleta.quorum`.

Alternativa (no recomendada): parámetros `t.*` también en el manifiesto del sonido con `applyTimes(T, overrides(P), TIMES)` en
`setParams`; dos paneles que pueden discrepar. El canal ya existe y ya lleva `pace`/`jump`.
