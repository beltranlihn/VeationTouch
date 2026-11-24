# T-016 · 3D-PI · Materia: cuerpos oscuros, contacto con el suelo, manos y caderas

- **Dueño:** 3D-PI · **Origen:** T-012 (la multitud aún se lee como maniquíes de plástico; la figura delantera es naranja uniforme y flota) · **Plazo:** 01:30
- **Archivos:** `parts/pinya3d.js`, `parts/pinya3d/body.js`, `lab/estudio/notas/3D-PI.md`. Respaldos: `parts/pinya3d/*.T-012.js.bak`.

## Tareas
1. **Materia oscura.** El calor deja de teñir toda la piel: sólo el borde (perla rasante) y el punto donde aprieta la mano. El calor
   nace en la palma y en el pecho y se apaga con la distancia (no hay una capa uniforme); en la multitud, el calor de la mano se
   concentra en las siluetas y en las partes finas, no en las caras frontales del tronco.
2. **Contacto con el suelo.** Una sombra de contacto (disco oscuro suave bajo cada figura que aprieta) y una bruma baja cálida, a
   ras de las terrazas, que recoge los pies; el suelo junto al muro (y = 0) con un mínimo de luz bajo la figura que aprieta.
3. **Manos y caderas.** Manos de la multitud con dedos juntos insinuados (palma con volumen y cuatro dedos como una masa redondeada
   más el pulgar), no palas planas; caderas más redondas (glúteos y crestas ilíacas suavizados).

## Criterio de PASA
- Mismo encuadre que `cmp_press.png`.
- Luma media del tronco de la figura más brillante ≤ 60 % del valor de T-012; la luma del borde y de la mano que aprieta se mantiene.
- Banda de la guía ±5 respecto a T-012; sin errores en WebGPU y WebGL2.

## Cómo probar
Mismos estados que T-012 (`batch3`); medir la luma del tronco en un recorte fijo de la figura delantera (v3_press, x≈2730–2830,
y≈620–760 a 7196×912) y del brillo de la mano (máximo en un recorte de 60 px alrededor de la mano).
