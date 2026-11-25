# T-069 — PUL · guía en sala, velo, mano, bóveda y sombra del arco

Dueño: PUL · Encargo del director (notas de ART), 25-11. Estado: **hecho** (sin commit).
Respaldos `.T069.js.bak`: `guide3d`, `typo3d`, `parts/umbral3d`, `parts/umbral3d/arches`.

1. **Gráficos de instrumento (guide3d).** Nueva opción `createGuide({ …, studio = false })`. Sin `studio` (la sala): sólo la etiqueta
   del capítulo y las «+» al 25 %; fuera reglas, cifras, marcas, filetes, rejilla e IDs P1–P4. Con `studio: true`, todo como antes.
   **Para el director:** en `res-obra3d/experience.js` pasar `createGuide({ THREE, TSL, room, studio: LAB })` si queréis las reglas en
   el laboratorio (hoy no se pasa nada → en todas partes se ve el aspecto de sala). Para un modo calibración, pasar ahí ese flag.
2. **Velo del texto (typo3d).** Caja redondeada alrededor de las palabras, difuminada 0,8 m (en metros), máximo 50 % (cap en el
   material: también limita el 60–75 % de Tronc/Pom/baixada). Medido en la Brasa: sin bordes, caída suave.
3. **Mano en universos oscuros.** Las manos fantasma (el «guante blanco») y la mano de la lente usan el mismo trazo único de la entrada
   (campo de distancias): crema #F4E3C8, 2 px; en la arena siguen en tinta #2E2A26, 2,5 px.
4. **Bóveda (umbral3d).** Los «huecos blancos» eran la lechada que tapaba las esquinas de las piezas grandes y planas (la curva de la
   bóveda las hunde bajo la cama). La cama baja 3 cm a partir de 2,2 m y tiene 96 filas en lugar de 48: la bóveda queda cerrada.
   Además, las piezas perla conservan en reposo el color de su mancha (su gris-blanco se leía como un hueco), la cama llega hasta la
   cresta y ya no faltan piezas en la cresta (mismo trazado: se sigue sacando el mismo número aleatorio).
5. **Sombra de contacto del arco.** #B89A78 en pantalla (invertido de ACES) al 40 %, sólo en los 15 cm junto al zócalo.

Pruebas: `npm run check` 90/90; `check45.mjs` `"errors":[]` en wait y brasa (`params={"jump":"brasa"}`), WebGPU y WebGL2, con 0/1/4 manos + L.
Capturas: `album3/e1-wait-idle.png`, `e3-wait-close.png`, `a2-arch-close.png`, `g1-brasa-guide.png` (tira entera de la Brasa).
Riesgo: el velo puede oscurecer algo más del 50 % por la curva de tono (ACES) en negros profundos; el parámetro sí queda en 0,5.
