# T-052 — TUN · Sesión en la sala: umbrales en vivo + guía de prueba

Dueño: TUN · Pedido por el director · 24-11 · Para: Beltrán en la sala, 25-11 a las 08:45 (S2E real, 4.1).

## Qué
1. **Afinado en vivo sin código.** Los umbrales de `score.js › TIMES` que hay que fijar en la sala, como parámetros del operador
   (panel P / tarjeta de la app): claves `t.<bloque>.<campo>` en `res-obra3d/manifest.json`. Tabla y presets en
   `ressonancia/tuning.js` (copia idéntica en `ressonancia-sound/tuning.js`). Se aplican EN VIVO a `score.times` (la partitura lee
   `T.<bloque>.<campo>` en cada paso) y el host los manda al sonido por el BroadcastChannel (`ctl { times }`, cada cambio y cada 1 s).
   Preset `tuning`: `lab` (los valores de la partitura) / `sala` (arranque tolerante: oclusión, temblor y latencia del S2E). Un
   parámetro movido a mano (distinto de su valor por defecto) manda sobre el preset.
2. **`lab/PRUEBA-SALA.md`**: cómo cargar la obra en la app, emparejar imagen y sonido, lista bloque a bloque, riesgos, «si algo falla».
3. **Modo sala**: parámetro `mode` (auto / sala / lab): en sala la página ignora los interruptores de URL del laboratorio
   (`?q3 ?tiles ?eye ?aa ?parts`); `auto` = sala cuando la abre la app (`?run=1`).

## Archivos (míos)
`ressonancia/tuning.js` (nuevo), `ressonancia-sound/tuning.js` (nuevo, copia), `res-obra3d/experience.js`, `res-obra3d/manifest.json`,
`lab/PRUEBA-SALA.md` (nuevo). **No toco** `score.js` ni `sound.js` (POS): el parche de `sound.js` está en `notas/TUN.md` › «Parche sound.js».

## Respaldo / volver atrás
`cp res-obra3d/experience.T052.js.bak res-obra3d/experience.js` · `cp res-obra3d/manifest.T052.json.bak res-obra3d/manifest.json` ·
`cp estudio/TURNO.T052.bak estudio/TURNO.md` (sólo el número). Los archivos nuevos se borran sin más.

## Prueba
`node lab/tools/check.mjs "/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0" --delay 8000` → 0 errores; en el
navegador, P → mover `t.tronc.rise` y comprobar `__obra.score.times.tronc.rise` sin recargar. Silencioso. Sin commits.
