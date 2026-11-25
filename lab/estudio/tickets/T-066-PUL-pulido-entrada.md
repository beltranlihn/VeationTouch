# T-066 — PUL · pulido de la entrada (bloque `wait`)

Dueño: PUL · Encargo del director con las notas de ART, 25-11. Estado: **hecho** (sin commit).
Respaldos: `parts/umbral3d.T066.js.bak`, `parts/umbral3d/arches.T066.js.bak`, `guide3d.T066.js.bak`.

## Qué cambió
1. **Junta (umbral3d.js).** Causa real: la escritura de vértices de la lechada estaba dentro de un comentario (T-058b) → la malla de
   lechada era degenerada y por las juntas se veía el cielo (el «crema que brilla»). Arreglado; lechada a 8 mm sobre el pie de las piezas
   (`GROUT_H`) y cada pieza cortada a esa altura para dar **2,5 mm de junta** (3 mm junto a una madre) sea cual sea su grosor. Color
   exacto `#D9CFBE` en pantalla (antes ×0,8 → `#CFC3B0`). El brillo idle giraba las piezas hasta 23° y abría la bóveda arriba a la
   derecha: ahora ≤ 7°.
2. **Arco (arches.js).** Intradós −35 % (antes −38 %; el suelo de luminancia `#8A6F58` sigue). Sombra de contacto de 30 cm
   **`#C9AE8E` en pantalla** (valor invertido de ACES, como la arena), opacidad 0,9 en el pie.
3. **Botón (guide3d.js, sólo wait).** (a) Mano rediseñada como pictograma (dedos de 2,7 cm, ≥ 2,2 cm entre ellos) dibujada desde un
   **campo de distancias** (EDT exacto): UN trazo de 2,5 px, ancho constante, tinta `#2E2A26` siempre sobre arena, sin relleno ni
   sombreado. (b) Tinte `#EAF2F4` invertido de ACES (antes salía gris `#DCDFDF`), sin oscurecer el disco, glaseado al 3,5 % sobre arena
   (al 10 % el cobalto daba malva), sombra del bisel fría, banda fría en el bisel (borde de 2,5 cm), arco especular blanco de 60° pleno
   arriba a la izquierda y el filo blanco atenuado abajo a la derecha. (c) Marcas cobalto más anchas (≈ 1,8 px) y algo más largas,
   40 % → 100 % al pasar. (d) El texto del wait ya estaba en medium (`edge` 0,43): sin cambio.

## Pruebas
`npm run check` 90/90. `check45.mjs` con `"errors":[]` en WebGPU y WebGL2 (0 → 1 → 4 manos + L). Recapturas en `album3/`:
`e1-wait-idle.png`, `e3-wait-close.png`, `a2-arch-close.png` (P1 a escala 1), `b3-button-close.png` (escala 1, a mitad del sostén,
×3,7). Medido: vidrio (210,199,188) frente a la arena (217,188,152) — más frío, no rosa; pie del arco (202,174,141) = `#C9AE8E`.

## Pendiente / riesgo
- Tinte del vidrio puesto al 9 % del valor HDR (≈ 14 % en pantalla según la zona); si ART lo quiere más lechoso, subir `bodyA` en lite.
- Donde la bóveda tiene huecos de piezas (cresta irregular, piezas que faltan) ahora se ve lechada, no cielo.
