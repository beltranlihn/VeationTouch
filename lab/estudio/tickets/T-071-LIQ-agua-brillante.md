# T-071 · LIQ · agua brillante — la ressonància: el muro es agua

25-11-2026 · LIQ (render) · pedido por Vicente vía director. Sin commit.

**Archivo:** `scenes3d/parts/festa3d/aigua.js` (reescrito; montaje en `festa3d.js` sin cambios). Respaldo: `festa3d/aigua.T071.js.bak`
(el estanque T-068 v2). Vuelta atrás intacta: `festaLook: 'camps'`, `useOldFesta: true`. Corona sin tocar.

**Qué cambió** (tres pasadas de Vicente: «más elegante y 3D» → «que el muro sea de agua» → «que las manos muevan el agua, más que gotas»):
- Cada muro es una lámina de líquido brillante ~0,2 m detrás del plano (la caja de la sala escalada desde el ojo: toque 1:1), un solo
  campo perímetro × altura, periódico: sin costura. En las esquinas la normal gira suave a la radial: un pliegue redondo, no un corte.
- Solver propio (ecuación de onda, 40 celdas/m, c 0,9 m/s), relieve REAL (malla desplazada, recorte suave ≤ 7 cm), normales por B-spline
  cúbica (sin facetas ni escalones). λ 40–60 cm.
- Manos: aterrizar = empuje suave que abre 2–3 anillos largos; mano que se mueve = ESTELA (onda de proa + valle + V) ∝ velocidad (tope
  1,2 m/s); mano quieta = fuente suave 1,6 Hz; oleaje lento siempre vivo. Chorro sólo como acento (máx. 1 cada 2 s).
- Luz: estudio suave detrás del público (cajas de luz arriba, tira abajo, degradado violeta); el agua quieta refleja la banda oscura y las
  crestas inclinadas encienden las cajas: brillos plata/lavanda que se deslizan por los anillos. Profundidad: refracción a un lecho a 0,55 m
  con cáusticas suaves. Sin rejilla, sin contornos, sin líneas.
- Resonancia = luz oro (un panel cálido que sólo reflejan las crestas resonantes), nunca líneas. Eco / llamada / bloom con la misma
  semántica de partitura (paquetes a lo largo de los muros, frentes verticales, modo de anillos concéntricos por muro).

**Medidas:** WebGPU 5,9 ms mediana (4 manos, sin vsync), WebGL2 5,4 ms (antes 6,2). Luminancia media en pantalla: 0,16 una mano ·
0,20 grupo R 1 · 0,24 bloom. `"errors":[]` (obra entera, WebGPU y WebGL2); `npm run check` 90/90.
Álbum: `album3/r1`–`r5` sobrescritos + `r6-ress-wake.png` (estela).

**Pendiente:** el chorro casi no se lee desde el ojo (diminuto, revisar); con 4–6 manos quietas la interferencia aún forma «ojos»
grumosos; leve banda en las esquinas; oro algo caqui tras ACES; una mano sola queda en 0,16 de luminancia (objetivo 0,18).

## T-071b (ronda 3, director) · nitidez y contraste
Respaldo `festa3d/aigua.T071b.js.bak`. Cada luz del estudio tiene ahora un NÚCLEO caliente (casi blanco, borde nítido, ~1–2°) dentro de
un halo suave, más dos anillos finos de luz (arriba y abajo) que dibujan rayas brillantes sobre las crestas; la banda que refleja el agua
quieta es tinta oscura (valles oscuros, crestas encendidas). Campo a 56 celdas/m. Oro = #E8B85A lineal, sólo como reflejo caliente de las
crestas resonantes (el cuerpo ya no se tiñe: fuera el caqui). Fuentes en reposo más pequeñas (σ 6 cm), más suaves y con fase aleatoria;
la estela conserva su huella de 9 cm. Oleaje lento de 1–1,5 cm en tres longitudes (0,95 / 1,45 / 2,3 m) siempre en marcha. Fresnel según
la normal del MURO (la esquina ya no se oscurece) y pliegue de esquina de 1,4 m.
Medidas: WebGPU 5,9 ms, WebGL2 5,5 ms; luminancia 0,15 reposo / una mano · 0,15 grupo · 0,21 bloom; `"errors":[]`; check 90/90.
Pendiente: el reposo aún enseña halos blandos (los paneles suaves + las capas profundas del lecho); el chorro sigue sin leerse;
la luminancia quedó en 0,15 (por debajo de 0,18) al priorizar el contraste.
