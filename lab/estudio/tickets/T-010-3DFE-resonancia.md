# T-010 · 3D-FE · festa3d: bandas más calmas, grietas menos regulares, WebGL2 ≥ 50 fps con 15 manos

- **Dueño:** 3D-FE · **Depende de:** veredicto de QA sobre T-004 (no se toca la pieza hasta entonces)
- **Archivos:** sólo `lab/experiments/ressonancia/scenes3d/parts/festa3d.js` y `lab/experiments/res-3d-study/parts/festa3d.json`
- **Respaldo:** antes de empezar, copiar `festa3d.js` a `scratchpad/festa3d/festa3d.T-004.js` (la versión que pasó QA)
- **Punto de partida (QA):** WebGPU 112 fps-eq (93 con 15 manos); WebGL2 49 fps-eq con 15 manos

## Criterio de PASA
1. WebGL2, `scale=1`, 15 manos (group=8 + 7 fijadas con Shift+clic): **≥ 50 fps** medidos con turno GPU; WebGPU no baja de 90.
2. Resonancia 0,9 y bloom: las bandas se leen como **pocos grupos ordenados** (≤ ~30 % del perímetro), sin bloques oscuros
   ni parpadeo; la figura de Chladni sigue legible entre ellas. Captura comparada con `high.png` / `bloom.png` de T-004.
3. Coronación (crown 0,3 / 0,6 / 0,8): grietas de tamaño y brillo **irregulares** (varias escalas, que se abren por ramas desde
   arriba), sin malla uniforme de celdas; la banda 0,9–1,6 m sigue sin luz cegadora.
4. `errors: []` en las dos rutas; llegada/salida sin cambios visibles respecto a T-004.

## Pasos (en orden de valor; cada uno es un punto de corte seguro)

### 1. WebGL2 ≥ 50 fps (lo primero: es el único criterio duro)
Hipótesis del coste en WebGL2 (verificar con un turno de GPU antes de tocar):
- a) el compute de 600k partículas como transform feedback + 600k sprites × 4 vistas;
- b) los bucles por mano (`Loop(nH)`) en el shader de simulación × sub-pasos y en el compute (`Loop(nHU)` por partícula);
- c) la placa a pantalla completa con ~10 lecturas de textura + Voronoi 3×3 por píxel aunque la coronación esté apagada.
Cambios, de menos a más invasivo:
1. **Cantidad por backend**: `NP` = 600k en WebGPU, 300k en WebGL2 (`room.backend`), con `sandGlow` compensado ×1,4 para
   que la densidad aparente no cambie. Parámetro `quality` (low/medium/high → 150k/300k/600k).
2. **Quitar el bucle de manos del compute**: el calor de la arena junto a la mano sale ya de la amplitud del campo; quitar
   `Loop(U.nHU)` del compute (15 manos × 600k = 9 M evaluaciones por frame).
3. **Voronoi sólo cuando hace falta**: calcular `voro()` dentro de un `If` (crownOn > 0 o arrive < 1 o leave > 0); en la
   ressonància libre no se evalúa.
4. **Manos en la simulación**: limitar el drive a un radio (`If(r2 < 16σ²)`) para que 15 manos no cuesten 15 exp por celda y
   sub-paso; limitar los sub-pasos a 4.
5. Si aún no llega: la placa en WebGL2 con 3 lecturas (gradiente por diferencias hacia delante en lugar de centradas).
Prueba: turno GPU, `renderer=webgl2`, 15 manos, fps tras 8 s; repetir en WebGPU. Corte seguro tras cada sub-paso.

### 2. Bandas más calmas
- Menos bloques activos y agrupados: `act = step(hk, bandK*0.3)`; bandas de anchura variable (2–8 cm) dentro de un bloque,
  pero un solo color por bloque (oro, perla, o raramente irisado) → orden en vez de ruido.
- Carreras más largas y suaves: `Lr` 0,4–1,2 m, gradiente `runG` de 1,1 a 0,55 sin negro; sin desplazamiento horizontal.
- Entrada/salida suave de cada bloque: `act` como `smoothstep` en el tiempo (el bloque aparece en 1,5 s), no un escalón.
- Estelas de arena sólo en bloques activos y con estiramiento ≤ 6.
Prueba: capturas resonancia 0,6 / 0,9 / bloom, comparadas con T-004.

### 3. Grietas menos regulares en la coronación
- Voronoi a dos escalas (0,9 m y 0,3 m): las grietas grandes abren primero, las pequeñas sólo cerca del frente que baja.
- Brillo de grieta por celda (hash) y por distancia al frente; grosor variable; la mayoría de grietas se apagan del todo al
  abrirse (`1.0 - op`), sólo ~20 % quedan como hilo fino.
- Retardo de apertura con ruido de baja frecuencia (ramas que bajan) en vez de sólo altura + hash.
Prueba: capturas crown 0,3 / 0,6 / 0,8.

## Qué NO se toca
El contrato (`create/update/resonance/bloom`), los nombres de parámetros (`bloomNow` incluido), la lectura de `input.state`,
la física de la onda (sólo su coste), llegada y salida.

## Tiempo estimado
Paso 1: 45 min (+ dos turnos de GPU) · paso 2: 30 min · paso 3: 30 min.
