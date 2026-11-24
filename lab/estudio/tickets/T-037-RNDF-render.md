# T-037 — RND-F · Render: transición por teselas al nivel de las refs. 13/14, entorno HDRI, calidad de imagen

Fuente: director 24-11 13:35; Vicente («las transiciones creo que pueden ser más fluidas y mejores»); `ARTE-2.md` §4 y §7;
`notas/ARTE.md` (biblia §3, §7 y la nota a INT de las 13:10 + la de las 13:40: «una ola de espejos, no agujeros»).
Dueño: RND-F (relevo de INT en estos dos archivos). Archivos: `ressonancia/scenes3d/room3d.js`, `ressonancia/scenes3d/PARTS.md`,
`notas/RND-F.md`, este ticket, fila T-037 del tablero. Respaldos: `room3d.ARTE2b.js.bak`, `PARTS.ARTE2b.md.bak`.
Lo que necesite del anfitrión (`experience.js`) se lo pido al director.

## Pasos (cada uno es un punto seguro de corte: el archivo queda funcionando)
1. **La transición** (pase de composición de `room3d.js`, misma API `setTiles`/`render(dt, pass)`, mismas duraciones `MOVES`):
   a. cada tesela es una **losa con profundidad real**: se hunde en el muro (0,1–0,45 m) con la perspectiva del ojo de la sala (punto
      de fuga por muro: paralaje distinto en cada tesela), se ven las paredes del hueco con los colores de la imagen estirados
      (el «voxel» de las refs.), iluminadas desde arriba (la luz principal de la biblia) y en sombra abajo;
   b. la losa **gira** (eje vertical u horizontal) con el mundo viejo en una cara y el nuevo en la otra: **refleja `room.envMap`** al
      girar y lanza un **destello especular** HDR 2–3; película fina en el canto siempre;
   c. **luz iridiscente por las grietas** (`#8FE3FF → #F2A6C8 → #F6D47A`) también sobre negro, teñida por el mundo que llega;
   d. árbol cuádruple estático 0,9 · 0,45 · 0,22 · 0,11 m (sin saltos al subdividir), **una ola** con frente en cuña;
   e. *pixel sorting* vertical de verdad (rampa ordenada de los colores de la imagen) en el frente, 0,3–1,2 m;
   f. coste: menos muestras de textura que la versión de INT (≈ 9 frente a ≈ 21 por píxel).
2. **Entorno**: `room.envMap` desde HDRI (PMREM) — `rooftop_night_1k.hdr` y `kloppenheim_07_puresky_1k.hdr` de la biblioteca CC0 —
   con el generado de reserva; `room.setEnvironment(bloque | { hdri, tint, top, bottom, intensity })` re-hornea en la MISMA textura
   (las partes no cambian nada); tabla por bloque según el guion de color (plata fría arriba en Brasa). Documentado en PARTS.md.
3. **Calidad**: TAA frente a MSAA con capturas (líneas del Pom, fibras de la Pinya) y decisión; GTAO / sombras de contacto: sólo si
   compensan y no rompen la costura; acabado (grano que no levanta el negro; sin viñeta por muro); bloom como luz, no niebla.
4. WebGPU y WebGL2, costura P3|P4, 0 errores; notas y entrega a QA.

## Cómo volver atrás
`cp room3d.ARTE2b.js.bak room3d.js` (la versión de INT de las 13:20). `?tiles=0` apaga la transición por teselas en el anfitrión.

## Prueba
`node lab/tools/check.mjs "/experiences/res-obra3d/index.html?capture&demo=0&params=…" --eval-file <salto y mix congelado> --shot …`
a mitad de transición (mix 0,3 / 0,5 / 0,7) en pinya→pom, pom→crown, intro→brasa (mundos negros) y tronc→pom, antes/después;
costura (recorte de los dos bordes de la tira unidos); WebGL2 con `"renderer":"webgl2"`; % de píxeles bajo luma 8 en el frente.
No mido fps (QA). Capturas en `scratchpad/rndf/`.

## Hitos
13:55 ticket · 15:30 primera versión visible (antes/después) · 17:30 terminado y a QA.

## Estado
Hecho y entregado a QA (los cuatro pasos). Detalle, evidencia y lo que queda para QA / INT: `notas/RND-F.md`.
