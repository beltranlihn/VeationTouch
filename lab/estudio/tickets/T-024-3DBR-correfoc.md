# T-024 · 3D-BR · Brasa: la interacción contra el guion (correfoc)

- **Dueño:** 3D-BR · **Verifica:** QA · **Archivo:** sólo `parts/brasa3d.js` (+ `notas/3D-BR.md`).
- **Guion (GUION › I. Brasa):** «cada toque levanta un chorro de chispas que suben y caen; al arrastrar, un rastro. Negro, rojo y naranja.»
- **Condiciones de prueba:** estudio (`res-3d-study?part=brasa3d`), `?lidar` (10 Hz, 150 ms tarde, lecturas perdidas), manos a paso humano
  (0,5–1 m/s), solo, 4 y 10 manos; progress 0,6.
- **Pasos:** 1) un toque: tablero a +0,1 / +0,5 / +1,5 s (el chorro sube, cae, se apaga); 2) un arrastre de 2 s a 0,7 m/s (el rastro);
  3) 4 manos (grupo virtual) y 10 manos guionizadas a 0,5–1 m/s (elegante, no un muro de chispas); 4) latencia con `latency.js` de QA
  (< 100 ms); 5) el techo de 15 manos sigue (`capture.py` de QA, ≤ 60 de media en la banda de la guía); 6) WebGPU y WebGL2 sin errores.
- **Arreglos sólo si alguno falla**; corte seguro: cada ajuste es local (emisión por mano / multitud).
