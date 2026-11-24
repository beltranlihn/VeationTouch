# T-013 · 3D-BR · Brasa: pulido (esquirlas que caen, humo en columnas)

- **Dueño:** 3D-BR · **Verifica:** QA · **Archivos:** sólo `lab/experiments/ressonancia/scenes3d/parts/brasa3d.js`
  (+ `notas/3D-BR.md`). Respaldo previo: scratchpad `brasa3d/brasa3d.T009.js`; tableros «antes»: `before_sweep_board.png`,
  `before_smoke_board.png` en la misma carpeta.
- **Congelación:** código ya; capturas sólo después de las 23:50 (QA mide brasa3d).
- **Puntos de corte seguros:** 1 y 2 son independientes (bloque de esquirlas / bloque de humo + su CPU); cualquiera puede quedar como en T-009.

## 1. Las esquirlas que caen se ven antes de aterrizar
- Mientras caen (0 < k < 1) prenden poco a poco: un **borde de brasa** sólo en los cantos (calor ∝ smoothstep(0,3; 1; k), tope ~0,45:
  rojo oscuro → naranja justo antes de tocar el suelo), y destellos de luna algo más fuertes en la cara espejo mientras giran.
- **Estela**: la CPU conoce la caída de 200 esquirlas (las de las bocanadas); cada frame emite 3 chispas cortas (vida 0,4–0,8 s, casi
  sin velocidad, se apagan rojas) para 8 de las que están cayendo, en rueda: estelas finas y dispersas, no un chorro.
- Tono: nada blanco al caer; el blanco queda para el destello del aterrizaje.
- **Prueba:** barrido arrive 0→1 en 5 s (`sweep_arrive_*.js`), tablero antes/después a 1 / 2,5 / 4,5 s; PASA si a 1 s se ven esquirlas
  cayendo (luma > 25 por encima de 1,3 m en el muro) y sigue sin errores; bocanadas > 100.

## 2. Humo en columnas
- 24 **columnas** (la CPU las coloca en tramos calientes del anillo y las recoloca al acabar su vida de 12–20 s, con fundido); los 6 000
  sprites se reparten entre ellas: suben por la columna, se ensanchan con la altura, el viento las inclina y se disuelven arriba.
- Fuerza de cada columna ∝ calor local (nivel + brasas despertadas) × envolvente; reward más denso; leave 0; parámetro `smoke` igual.
- **Prueba:** tablero antes/después (progress 1, `smoke` 1 y 0; reward); PASA si se distinguen columnas separadas por oscuro y la banda
  de la guía no sube más de ~3 de luma media.

## Siempre
`leavecheck.sh` sigue pasando (leave 0,6: grueso a 1,8–3 m; 0,85 casi negro); sin errores en WebGPU y WebGL2.
