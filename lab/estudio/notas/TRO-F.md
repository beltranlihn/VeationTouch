# TRO-F · T-032 · III. Tronc (relevo de 3D-FE, 24-11)

Archivos: `scenes3d/parts/tronc3d.js` (respaldo `tronc3d.TROF.js.bak`), `res-3d-study/parts/tronc3d.json` (respaldo `.TROF.bak`).
Capturas en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/`.

## Hito 1 — primer paso visible (13:47)
Construyo sobre el motor y los pisos de 3D-FE (física, API, maqueta blanca); cambio el **encuadre y la composición**.
- **Antes / después** (pisos 5, tira entera): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/m1_before_after.png` · un muro a tamaño real: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/h_f5_w1.png`.
- **Encuadre**: escala de la torre 3,0 → 1,7; en el muro se ven 4–5 pisos apilados (antes 1–2). El piso en formación queda a ~3,1 m en el muro; la sala sube con cada piso. La base es una isla de roca oscura (#2A2622, bloques irregulares) que flota: la subida empieza por debajo de 0.
- **Collage (ref. 9)** detrás de cada piso: UNA placa grande (cromo líquido que ondula; cada tercer piso, un muro de trencadís en voronoi con esmalte que destella), un panel de neón (lima o cian, píxeles ordenados) que ilumina a sus vecinos, marcos de línea fina y líneas largas. Los pisos ya no giran sin fin: oscilan ±15°, la composición se mantiene.
- **Luz**: principal desde lo alto del centro de la sala (cada muro ve su torre iluminada desde el público y desde arriba), yeso con albedo 0,72, **oscuro abajo y luz arriba** (el filo turquesa sigue dibujando las siluetas en la zona oscura). El destello y la mano tiñen de ámbar, no suman blanco. Sin franja ámbar de horizonte.
- **Zonas tranquilas** (texto ±1,6 m × 1,75–2,2 m; botón ±0,9 m × 0,9–1,6 m), medidas en captura (pisos 5, estudio): media 9–13 %, p95 24–36 % (`luma.py`).
- **Fuera**: cubos blancos sueltos (cerca, medio, lejos), humo al pie; el humo queda sólo detrás de cada torre, al 60 %.

## Hito 2 — entregado a QA (13:58)
Rondas de ARTE atendidas (14:00, 14:20, r3) y peticiones de GUI, 3D-PO y 3D-PI. Sin errores de consola en WebGPU y WebGL2, en el estudio (pisos 1–9, lean, weak, premio, arrive/leave 0,5, colapso, ciclo) y en la obra (`index.html` salto a tronc en los dos motores; `review.html?from=tronc`).

**Qué se ve**
- Por muro del castell, un ensamblaje vertical que domina el cuadro: 4–5 pisos a la vez, cada uno un fragmento de Barcelona en yeso (maqueta blanca) con su collage: UNA placa grande (cromo líquido que ondula, o muro de trencadís cada tercer piso), un panel de neón lima/cian que ilumina a sus vecinos (luz horneada por instancia), marcos de línea fina, un cinturón de teselas pequeñas. Las placas están a profundidades distintas (0,5–1,5 m entre una y otra): con la subida se deslizan unas sobre otras.
- Luz: oscuro abajo, luz arriba (`uFall`, alturas de mundo 3,5 → 5,3 m), un poco más de luz con cada piso; filo turquesa en todas las siluetas; reflejo cálido en el cromo (la esfera del aro ya no está muerta); humo sólo detrás de la silueta de la torre.
- Lejos: torres de otras colles sólo como siluetas negras con filo, altas (acompañan toda la subida). Chimeneas de Gaudí ×2 (dos en vez de tres).
- Premio: las torres retroceden 16 m (antes 28), toda la torre se ilumina (+30 %) y se apaga de arriba abajo a partir de 4,5 s.

**Pulso, encaje, equilibrio, mano** (medido con `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/num.js`, WebGPU; WebGL2 igual en encaje y mano)
- Pulso: con cada golpe la torre entera se hunde **10 cm** y rebota, una ola de luz sube por los últimos pisos (destello 0,55) y el piso en formación «respira» (se recoge un 34 % hacia el golpe, lo más cerrado justo en él).
- Encaje: el piso vuela a su sitio en **0,75 s**, la torre se hunde **24 cm** y rebota, destello ámbar y un aro de luz que se abre durante 1,1 s (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/lock_board.png`).
- Equilibrio: lean ±1 → 6,5–7° con muelle; en 2,5 s se sueltan ~490 piezas (caen hacia la sala, rebotan en los pisos), y vuelven todas a los ~5 s de enderezar (`ret.js`: 492 → 0). Con lean 0,5 se sueltan ~50 por segundo entre 4 torres (bajé la tasa un 40 %): no vacía la torre.
- Mano: respuesta en el primer frame (**10–22 ms**), el piso de detrás se bambolea 6,6°, se tiñe de ámbar y lanza 3–5 piezas (14 contando sus grupos) hacia arriba y hacia la sala; las piezas libres se mantienen iluminadas mientras caen.
- Sala: sube con cada piso (≤ 0,35 m/s); la isla de la base flota y la subida empieza en −4,5 m.

**Zonas tranquilas** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/luma.py`, % de 255; texto ±1,6 m × 1,75–2,2 m · botón ±0,9 m × 0,9–1,6 m)
- Estudio, pisos 5: texto 7–10 % (p95 24–29 %), botón 10–11 % (p95 24–28 %). Pisos 1, 4, 7, 9 y lean: medias 3–14 %, p95 ≤ 37 %.
- Obra sin guía (pisos 4): texto 10 % (p95 27 %), botón 8–9 % (p95 26 %). El instante del encaje sube el p95 a ~34–36 %.

**Fuera de su bloque / API** (sin cambios de firma: `collapse`, `restore`, `collapsing`, `takeFloor`, `giveFloor`, `levels`, `impacts`, `rise`)
- Con `state.block !== 'tronc'` sólo se dibujan los pisos (lo que da `takeFloor`); el decorado (teselas cercanas, siluetas y escombros lejanos, humo, el vacío de fondo, el aro del encaje) se apaga en ~1 s. También con el parámetro de estudio `decor: false` y en la torre privada de fall3d (la reconozco por `parts: {}`; 3D-PI puede pasar `decor: false` para dejarlo explícito).
- Cada piso tiene ≥ 150 piezas (153–488; antes 36–190). `takeFloor` devuelve además las placas del collage del piso; las materias nuevas salen como `kind` 'glaze' (trencadís) y 'chrome' (cromo líquido), `geo` 'tile' para las esquirlas.
- Al volver el bloque tronc tras un `collapse()`, la torre hace `restore()` sola. En el colapso las piezas libres no llevan realce (zonas tranquilas en «Ha caído»).
- En su bloque la torre ignora y limpia los `taken`: al cargar la obra con salto a tronc, baixada3d dejaba los 10 pisos tomados y la torre no se veía (**aviso para 3D-PO**).
- fall3d conserva su `TOWER_D = 6,5` (no lo cambié). La escala de la torre sí cambió (3,0 → 1,7): fall3d encuadra con `levels()` y `rise`, que siguen valiendo, pero conviene que 3D-PI mire su encuadre.

**Coste** (no mido fps): 8544 instancias (antes ~8000; el mínimo de 150 piezas por piso las sube), pero el bucle salta los pisos ocultos y escribe 1 de cada 4 frames los que quedan bajo el cuadro: `update` = 0,7 ms (2 pisos) – 1,1 ms (9 pisos) de CPU en el M1 Max (`cpu.js`). El sombreado tiene dos ramas nuevas (voronoi del trencadís, 9 celdas; cromo líquido, 3 ruidos), sólo en los píxeles de esas placas. La página de estudio está lista en ~0,4 s. En la obra con WebGL2 la carga pasa de 8 s en la comprobación (no sé cuánto es de tronc): pendiente de QA.

**Capturas finales**: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/z_f5_w1.png` (un muro, pisos 5) · `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/y_board.png` (pisos 4 · 7 · lean · premio) · `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/j_board.png` (piso 9 y premio) · `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/lock_board.png` (encaje a 0,4 · 0,8 · 1,0 · 1,5 s) · `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/z_obra_w.png` (obra) · `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/trof/i_board.png` (incluye WebGL2).

**Débil / pendiente**
- El pulso y la respiración del piso en formación no los he visto en movimiento, sólo en números y capturas sueltas: QA debería mirarlos en vivo.
- En la obra la línea ámbar horizontal a ~1,3 m sigue (es de atmos, INT), y la imagen sale algo más caliente que en el estudio.
- Las piezas de «gent» siguen siendo 488 cajitas por torre; pasar a Points ahorraría ~1400 instancias.
- Volver atrás: `cp tronc3d.TROF.js.bak tronc3d.js` y `cp tronc3d.json.TROF.bak tronc3d.json`.
