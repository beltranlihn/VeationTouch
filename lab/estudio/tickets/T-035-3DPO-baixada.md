# T-035 · 3D-PO · La bajada — Seny — «la bajada al amanecer» (parte `baixada3d`, rehecha)

- **Dueño:** 3D-PO · **Revisa:** QA · **Integra:** INT (mapeo del bloque baixada) · **Hitos:** visible ~17:15, integrada a QA ~19:15 (desplazados 45 min por la ronda 2 de Pom)
- **Archivos:** `ressonancia/scenes3d/parts/baixada3d.js`, `res-3d-study/parts/baixada3d.json`, `notas/3D-PO.md`, mi fila de TABLERO.
  Respaldo: `baixada3d.ARTE2.js.bak`, `baixada3d.json.ARTE2.bak`.
- **Referencias:** ARTE-2 §3 fila «Bajada» (pastel de amanecer, lluvia de vidrio, flor donde la mano recoge), ref. 12 (invernaderos verticales),
  notas/ARTE.md §2 (paleta: fondo `#2A2140` → `#F3B9B0`, rosa, lila, aguamarina, melocotón, blanco sol).

## La imagen y el gesto
- Amanecer: el único fondo claro de la obra (cielo lila arriba, melocotón en el horizonte, sol a punto de salir, mar aguamarina, la ciudad en bruma lila).
- El castell = **torre de vidrio de colores** tras cada muro de la estructura: cada piso, un anillo de esquirlas (vidrio físico: clear-coat,
  iridiscencia, `room.envMap`) que gira despacio; color por piso (melocotón en la base → rosa, lila, aguamarina, perla… → blanco sol arriba).
- **La bajada:** la sala está en lo alto de la torre y **baja con ella**: cada `down` el anillo de arriba se suelta y el ojo baja un piso
  (muelle crítico, ≤ 1,1 m/s, sin saltos). Invernaderos de vidrio (16–45 m) y la ciudad suben alrededor. El sol sube un poco.
- **Física:** las esquirlas del anillo caen como **lluvia lenta de vidrio** (gravedad; vidrio plano que planea: lento en vertical, llevado
  hacia la sala, aleteo, giro) + un goteo desde arriba mientras queden pisos. **Mano sostenida:** la esquirla que pasa por la mano (vista a
  través del muro) **se para, destella y crece una FLOR** en el muro (su color; más capturas, flor mayor). **Sin mano:** cae al suelo y **se
  rompe** en 3–5 astillas que rebotan y quedan brillando al pie de las torres (el campo de vidrio donde aterrizamos al final).
- **Caída (carregat):** toda la torre se suelta a la vez, pesada; el color se apaga.
- Tres profundidades: astillas a 0,2–1 m tras el muro (≈ 8 por muro) · torres y lluvia (≈ 6–7 m tras el muro) · invernaderos, ciudad, mar, cielo.
- arrive: las esquirlas vuelan a sus anillos y el cielo entra por celdas; leave: los anillos se abren y suben.
- Sonido (snippet de ENT): recogida `glass/hit`, flor `petal/bloom`, rotura cercana `glass/floor` (≤ 4/s).

## Pasos · corte seguro · vuelta atrás
1. Respaldo. 2. Cielo/suelo + invernaderos + torres + bajada → **corte seguro 1**. 3. Física (lluvia, recogida, flores, rotura). 4. Caída,
llegada/salida. 5. json, capturas, WebGL2. 6. Integración: pedir a INT `baixada → ['baixada3d']` (sin plaza, castell ni atmos: la parte trae
su mundo). **Volver:** `cp baixada3d.ARTE2.js.bak baixada3d.js` (y el json).

## Prueba (QA)
Estudio `?part=baixada3d` con floors 7/4/1/0, ciclo automático, 4 manos fijas (flores), caída; WebGPU y WebGL2 sin errores; la bajada sin
saltos (`__baixada3d.maxV` ≤ 1,1 m/s); banda de la guía legible sobre fondo claro (lo decide GUI/QA). fps: QA.
