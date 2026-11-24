# PAR — notas

## T-047 · respuestas locales por mano (24-11)
Respaldos: `scenes3d/parts/<parte>.T047.js.bak` (tronc3d, pom3d, pinya3d, festa3d, baixada3d, brasa3d). Hoja: `notas/par-t047/t047-sheet.png`;
scripts de prueba (`--eval-file`) en `notas/par-t047/*.js` (`pre.js` + uno por bloque; `?n=` manos). Todas las pruebas con
`?sound=ressonancia-sound&demo=0` (manda el sonido, `following` true), silenciosas, WebGPU y WebGL2, **0 errores de consola**; 0 manos en los 6
bloques × 2 backends.

- **#11c tronc3d** (hecho ANTES de la orden del director de parar tronc3d; queda funcionando, el nuevo Tronc de porcelana puede tirarlo):
  en un muro sin torre, al posar la mano la banda de la plaça se desliza bajo las manos (`ox`), se enciende un punto bajo la mano
  (`U.hx/hk` en línea y halo) y sale al instante un pulso de luz por el pie del muro DESDE la mano hasta la torre más cercana (que lo recibe en
  su base). Levantar ahí (rise > 0,18) manda otro pulso desde la mano. Prueba: 1 mano en P1 → pulso y punto el mismo fotograma.
- **#20 tronc3d**: el evento `'lift'` destella la banda en blanco bajo las manos (muros con `lifters`). Prueba 4 manos: `lift` ×2, destello 0,9.
  `lift.bands[]` expone `spot/ox/flash` para checks. (El nuevo agente del Tronc debe conservar o rehacer #11c/#20.)
- **#15 pom3d**: l'aleta ya no busca `S.strokes` por `stroke`; base propia por mano = altura al abrir la ventana (o al posarse), sube ≥ 0,28 m
  o > 1,6 m tras 2 s (como `score.js › aleta`); ventana 10 s. Prueba: 2 de 4 alzan y mantienen → 2 rayos; 1 mano → corona.
- **#16 pinya3d**: seguir la palma hasta 0,35 m (espera hasta 0,6 m); `NPR` 18 (12) → mano nº 13–18 con palma (16 manos → 16 palmas;
  coste: 6 nubes de 2600 puntos más). Prueba: mano que va 0,28 m detrás de su palma → la palma se desliza 2,39 → 1,48 m, `pack` 1.
- **#21 festa3d**: **el frente del score NO trae `u`/posición** (ENT T-045: «`fronts[].u` no (es de festa3d, #21)»); la parte fija el
  origen por `id` al primer avistamiento: el último aterrizaje en ese muro (≤ 0,6 s) o la mano de ese muro más cercana al centro; centro si
  no hay (y siempre para `ghost`). Máx. 4 frentes (los más nuevos). Valle oscuro (×0,35 del oro) alrededor de una cresta blanca. `solo`
  (to = from): el frente da la vuelta entera y vuelve a la mano en los 3 s. `part.fronts` para checks.
- **#12 baixada3d**: la banda espera ARRIBA (1,6 m, respirando) hasta que una mano del muro llega a ≥ 1,4 m (o la partitura ya ve un
  descenso, `lowerK` > 0,15, no en 1,5 s tras un `lower`); tomada, sigue la mediana de las manos del muro (mismo fotograma); tras cada
  `lower` o 1,5 s sin manos vuelve arriba. Prueba: 1,62 esperando → tomada a 1,64 → baja a 1,29 → `lower` → 1,62 otra vez.
- **#20 baixada3d**: el halo de la mano se estira hacia abajo con su propio descenso (desde su punto más alto / 0,35 m).
- **#20 brasa3d**: un aterrizaje dentro de la ventana que cuenta (primer tok → TOK + 0,7 s, cualquier muro) lanza además chispas BLANCAS
  que suben despacio (calor ≥ 2,9 = blanco en el shader; ningún otro emisor pasa de 2,5). Prueba: fuera de ventana 0; en el TOK 1 y 4.
  `window.__brasa.white()` cuenta.
- Notas: con `?sound` los saltos se prueban con `params={"jump":…,"pace":N}` y luego `ctl pace:1` por el BroadcastChannel. Nadie ha visto esto
  en la sala ni con LiDAR real (L); fps sin medir.
