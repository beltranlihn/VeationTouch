# SIS — el sistema común (T-048, ARTE-3 §1–§3)

## Hito 1 · 24-11 ~19:40 — antes / después

Hoja de contactos (6 bloques × antes | después, la tira entera, una mano en P1 a 1,30 m): `notas/sis/t048-before-after-strip.jpg`.
Muro 1 a tamaño real (mismo orden): `notas/sis/t048-before-after-wall1.jpg`. La linterna cruzando la esquina P3|P1 (mano a 12 cm de la
esquina: las dos reglas se encienden): `notas/sis/t048-flash-corner.jpg`. WebGL2: `notas/sis/t048-webgl2-pinya.jpg`.
Arnés (estados forzados + mano falsa): `notas/sis/shoot.sh`, `head.js`, `<bloque>.js`, `sheet.py` (sin `sound=`: el sonido lidera el estado).

Qué cambia en la imagen:
- **Gráfica fina** en los 4 muros, 1 px, acento del capítulo (~40 %): reglas en los bordes con la banda 0,9–1,6 marcada, «+» en las esquinas
  de la zona de juego, rejilla de puntos tenue detrás de las zonas tranquilas, etiquetas mono (`II · PINYA`, `P4`, `0,90 · 1,25 m · 1,60`).
  Se ilumina cerca de la mano, también en el muro vecino.
- **Instrucciones** de borroso a nítido palabra a palabra (60 ms), etiqueta en Geist Mono; cartelas con teselas (aprobadas) intactas.
- **Bloom a la mitad** (se nota en el sol de la bajada, el anillo y los destellos de Brasa: menos neblina).
- **Fondo** nunca #000: degradado profundo del capítulo (se ve en Brasa: arriba rojo muy oscuro). Las partes con cielo propio no cambian.
- Anillo: el filo más cercano a la mano coge su luz (acento + cálido).

Comprobaciones: 0 errores en WebGPU y WebGL2 (`?sound=ressonancia-sound&demo=0`, y `params={"renderer":"webgl2"}`); los 6 bloques forzados
sin errores. Sin medir fps. La lógica de la guía (qué enseña, cuándo, dónde) no se ha tocado: sólo su aspecto.

## API para las partes (PARTS.md «since T-048»)
`room.lightRecipe()` + `R.rim()` / `room.rimNode()`, `room.makeHalo()` + `room.placeHalo()`, `room.flash(positionNode)`,
`room.PALETTE[block]`, `room.setBackground()`; typo3d `reveal: 'blur'`, font `'mono'`, `text({ flash })`.

## Pendiente / notas
- Las partes de capítulo aún no usan la receta de luz ni el halo (no son mías): adoptarlo es trabajo de cada dueño.
- `atmos.js` sin cambios (no hacía falta para este hito).
- Respaldo: `*.T048.js.bak` junto a cada archivo (room3d, guide3d, typo3d, atmos, experience; `PARTS.T048.md.bak`).
