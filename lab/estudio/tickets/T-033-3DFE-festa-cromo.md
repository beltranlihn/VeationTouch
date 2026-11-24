# T-033 · 3D-FE · coronación y ressonància: una placa de CROMO Y VIDRIO (ARTE-2 §3, ola 2)

- **Dueño:** 3D-FE · **Revisa:** QA · **Archivos:** `parts/festa3d.js` (respaldo `festa3d.ARTE2.js.bak`), `res-3d-study/parts/festa3d.json`
  (respaldo `.ARTE2.bak`), `notas/3D-FE.md`, mi fila de TABLERO.
- **Paleta:** oro, blanco, iridiscencia. **Materia:** la placa que resuena deja de ser sólo luz de oro sobre negro:
  1. **Cromo oscuro**: la placa es un espejo que ondula con el campo. El relieve (gradiente del campo) dobla la normal y la placa refleja la noche
     de la sala (`room.envMap`, PMREM de INT). En reposo es un espejo negro casi apagado; con la resonancia, el reflejo sube.
  2. **Vidrio**: encima, una retícula de teselas de vidrio de unos 0,3 m (trencadís de vidrio, filas al tresbolillo con algo de irregularidad).
     Sus aristas finas recogen el reflejo, con una película fina que pasa por rosa, oro y turquesa, y se encienden con la resonancia.
  3. La arena de oro, la filigrana, las figuras de Chladni, las bandas *pixel-sort* al máximo, la coronación y la floración siguen igual,
     encima del cromo y del vidrio.
- **Parámetros nuevos:** `chrome` (0,35), `glass` (1), `bend` (0,35).
- **Corte seguro:** cada capa es un sumando que se puede poner a 0. **Volver atrás:** `cp festa3d.ARTE2.js.bak festa3d.js`.
- **Prueba:** estudio con resonancia 0 / 0,5 / 1 y coronación 0,6; la banda de la guía (0,9–1,6 m) legible y sin destellos; costura P3|P4
  continua; WebGPU y WebGL2 sin errores; en la obra (`review.html?from=festa`). fps: QA.

## Pasa a 3D-BR (24-11, cambio de plan del director) — lo añadido
- Placa: espejo en toda la superficie, `bend` 1,0, entorno de estudio propio (oro pálido, luz cenital, contraluz lila); `room.envMap` sólo
  como capa tenue teñida (sin manchas rosas); curvas de oro ×0,3.
- **Interacción física:** 140 piezas de vidrio y cromo sobre la placa: traquetean con la resonancia, la mano las lanza, caen, rebotan y
  hacen sonar la placa (impulso en el campo + `fxImpact`); floración y coronación las lanzan todas.
- **Movimiento de sala:** nube lejana de esquirlas (9–34 m) que baja (la sala flota, ≤ 0,12 m/s) y gira (≤ 2°/s) con la resonancia.
- Volver atrás: `festa3d.ARTE2.js.bak` (antes de T-033) o `scratchpad/brasa3d/t033/festa3d.3DFE-handover.js` (lo de 3D-FE).
- Prueba: `notas/3D-BR.md` › 13:30.
