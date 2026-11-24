# VIS2 — notas

## T-056 · Intro: la mano enciende el farol · Brasa: el relevo (24-11)

Hoja: `vis2/t056-sheet.jpg` (9 filas: plaza estudio 0/4 manos, obra intro 0 manos WebGL2 / 4 manos WebGPU, brasa estudio relevo
solo / asistido / 4 manos, obra brasa relevo 0 manos WebGPU / WebGL2). Comprobado con `check.mjs` (copia con ventana de 60 s en mi
scratchpad: la obra pasa de 15 s), silencioso, **0 errores de consola en las 14 pasadas**, WebGPU y WebGL2.
Respaldo: `plaza.T056.js.bak`, `brasa3d.T056.js.bak` (+ `res-3d-study/parts/*.T056.json.bak`).

### Intro — `plaza.js`
- Lee los nombres de SCO2 (ENT › T-055): evento `'lamp:<muro>'`; posición de `S.lamps[]` (las de este paso) o `S.lamp` (la última);
  admite también `{ type: 'lamp', wall, s }`. El farol elegido = el aún apagado más cercano por ángulo visto desde el ojo (≤ ~70°),
  y se enciende ya (el mismo chisporroteo de gas; charco en el adoquín mojado y reflejo salen del mismo uniforme). Encendido se queda.
- Sin manos: el ritmo de siempre (8–22 s). Un paso nuevo (el reloj vuelve atrás) restaura el horario. Se deja de escuchar a los 46 s (rotura).
- Estudio: sin `state`, una mano que aterriza hace de evento. Parámetro `handLamp` (bool, por defecto sí). Lab: `__plaza.lit()`, `byHand()`.

### Brasa — `brasa3d.js`
- El relevo lee `S.relay` sólo con `brasaStage === 'relay'` y `!done` (SCO2 crea `relay` siempre: fuera de la etapa no dibuja nada).
- **Un diable** (reservado: 4 últimas ranuras, las manos/olas no las cogen) corre al pie del muro (2,6 m tras él, `relayD`) siguiendo
  `relay.s` con aritmética circular (esquinas y costura P3|P4 continuas); la marcha sale de su velocidad. Un poco mayor y más brillante.
- `'relay:jump'` (o un salto de `s` > 1 m) → **salto en arco** corto (0,4–0,8 s, altura según distancia), chispas al despegar, en el arco
  y al caer (+ onda en el líquido).
- `'corner'` (y el cruce propio, con antirrebote 2,5 s) → **llamarada** en la esquina (chorro + lecho).
- **Estela**: cada celda del perímetro por la que pasa (también las saltadas) queda encendida en el lecho y suelta brasas: se ve la
  vuelta recorrida. Vuelta entera (`'relay:lap'`, `lap ≥ 1` o cobertura 97 %) → la estela entera llamea. Tras el relevo se apaga en ~10 s.
- **Asistido** (`relay.assist`): 3 diables (2 con > 4 personas) salen de ±4–6 m, corren hacia él y le acompañan; se van al acabar.
- **Altura → visual**: el chorro de la llegada sale bajo y corto con la mano baja (niños) y alto con la mano alta; además una mano quieta
  mantiene una **columna de chispas** que sube del lecho bajo ella y cuya cima se ve a la altura de la mano en el muro (`column`).
- Estudio: `relay` (doble de la partitura: corre a 1,3 m/s, una mano por delante a ≤ 2,5 m se lo lleva), `relayAssist`, `relayD`,
  `trail`, `column`. Lab: `__brasa.relay()`.
- Intacto: una gota de cromo por muro, sin tejas flotantes, olas, llamada, despertar.

### Para la sala esta noche
- `relay.y` (altura a la que dibujarlo) no se usa: el diable vive en el suelo de la plaza; ponerlo a la altura de la mano exigiría
  hundirlo o elevarlo y se lee peor. Si se quiere, se ajusta `relayD` (más cerca = más grande y más bajo en el muro).
- Con muchas manos la Brasa ya es densa (diables de las manos + olas + relevo): si se lee recargada, bajar `column` a 0,5.
