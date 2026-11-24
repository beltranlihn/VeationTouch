# T-042 · 3D-PO · L'aleta (pom3d) y la bajada = bajar (baixada3d)

- **Dueño:** 3D-PO · **Revisa:** QA · **Depende de:** ENT (campos de la partitura, T-038/T-039) · **Integra:** INT (T-040)
- **Plan aprobado por Vicente:** `ressonancia/PLAN-INTERACCION.md` §2 pasos 1 y 3 (propuesta §4.6 y §4.8).
- **Archivos:** `parts/pom3d.js`, `parts/baixada3d.js`, sus `.json`, `notas/3D-PO.md`, mi fila de TABLERO.
- Todo detrás de parámetros hasta que lleguen los campos de ENT; con `input.state` se usan los campos del score en cuanto existan.

## (a) L'aleta en pom3d
- Cuándo: fase `aleta` (`state.phase === 'aleta'` o `state.block === 'aleta'`; ventana de 8 s tras el premio del Pom). Estudio: `aleta` (0..1 = progreso
  de la ventana, −1 = apagado).
- Arriba de cada muro de la estructura (≈ 3,1 m, centro del muro) aparece la **silueta de luz de la enxaneta** (cabeza, cuerpo, piernas) y
  **levanta la mano** en 1,5 s.
- Cada mano del público que **sube ≥ 0,28 m** sobre su línea base (o pasa de 1,6 m) lanza un **rayo de oro** que trepa por el muro hasta
  arriba (0,8 s), más ancho cuantas más manos alzadas. Fuente: `state.aletaHands` (lista de trazos alzados) cuando ENT lo publique; mientras,
  línea base propia por trazo (`input.hands`: la y mínima de su primer 0,6 s).
- Respuesta en el mismo frame; nada en las zonas quietas salvo el rayo (que es la respuesta de la mano).

## (b) Bajada = bajar en baixada3d
- En cada muro de la estructura una **banda de vidrio** aparece arriba (≈ 1,7 m, o a la altura de las manos) y **sigue `state.yMed[w]`**
  (mediana de alturas de las manos en ese muro) hacia abajo, hasta ≈ 0,8 m, donde **se rompe en esquirlas de color** que caen (la recogida
  de siempre las atrapa) y la torre suelta su piso (`down` del score, lado ENT).
- Bajada suave (≤ 0,4 m/s): limpia. Brusca: **cruje** (grietas en la banda) y derrama esquirlas al momento.
- Estudio: `lower` (activar); sin score, la banda sigue la mediana de las manos del muro (o baja sola si no hay manos) y cada rotura baja un piso.

## Pruebas
Estudio pom3d `aleta` 0/0,3/1 con 4 manos fijas y una que sube; baixada3d `lower` con manos que bajan despacio y deprisa; WebGPU y WebGL2
sin errores; obra sin errores con los campos de ENT cuando lleguen. fps: QA.
- **Estado:** HECHO (24-11 ~15:10), entregado a QA; notas/3D-PO.md › T-042.
