# BRA · T-063 Brasa «fuego esculpido» (25-11-2026)

- Nuevo: `scenes3d/parts/brasa3d/foguera.js` (foguera de capas de papel + islote de terrazas con veta de lava + pulsos de curvas de nivel),
  `brasa3d/fons.js` (la plaça: 4 planos recortados, campanario en P1, 4 ventanas, cielo propio), curvas de nivel finas en el agua (suelo de brasa3d).
  Diables de DIA montados (`useOldDevils=false`; `true` = los de partículas).
- Fuera (por defecto, con interruptor): jarrones de cromo (`vases`), llamas de sprite (`flames`), humo (`smoke`), sprites de neblina
  (`hazeSprites`), polvo de fondo (`dust`); brasas y fichas ≤ 6 cm (`oldShards` / `oldTiles` = antiguas). Se mantienen: agua negra con
  reflejos, anillo de brasas, chispas, ola, relevo, llamada, mensajes fx al sonido, zonas tranquilas, costura P3→P4.
- Interruptores de las piezas nuevas: `foguera`, `fons`, `fogHalo`, `contours` (false = apagado).
- Comprobado: estudio WebGPU + WebGL2 (0/1/4 manos, llamada, relevo) y obra completa desde brasa (entranceFirst por defecto y false):
  `"errors":[]`; `npm run check` 90/90. Los errores WebGPU de la primera prueba en la obra no se reproducen tras 709c4f9 (cada pieza
  sola y todas juntas: limpio).
- Desvíos de ARTE-BRASA: la foguera mide 1,5 m aparentes contando su reflejo (con el ápice ≤ 1,65 m no cabe de otro modo); ventanas
  9×13 cm aparentes (20×30 era más alto que una planta); sin profundidad de campo (no hay post). El velo de zona tranquila atenúa la
  foguera (está detrás del botón). El icono de mano (crema, 2 px) es de guide3d.
- Pendiente: capturas f1–f3 hechas en la página de estudio (no en la obra); QA de fps.

## T-063b (pulido, 25-11)
- Foguera rehecha como relieve de 10 láminas apiladas en profundidad (5 cm), canto de 2,5 cm, lenguas en S; granate detrás → crema delante.
  A 0,9 m tras el muro y 1,5 m a la derecha del centro (fuera del eje del botón); ≈ 1,15–1,2 m en el muro, ápice ≈ 1,6 m.
  El islote va detrás de ella (no la tapa); la veta (#FF7A1A, núcleo #FFD27A, 6–12 cm) sigue por el agua hasta el anillo.
- Bandas naranjas del agua al 50 % (`waterGlow`), curvas de nivel más finas y tenues, cantos del islote ≤ 0,6 (fuera del bloom), tejados sin dientes.
- Bug corregido: el «hundimiento» (`sink`) quedaba fijo en 0,5 (la obra lo leía de brasa3d.json); ahora 0,2 y vuelve a depender del nivel.
- El polvo/estrellas que aún se ve en el bloque brasa es de atmos.js (300 000 motas), no de brasa3d.
- f1–f3 capturadas desde la obra completa (index.html, jump brasa). `"errors":[]` en la obra y en el estudio WebGL2; `npm run check` 90/90.

## T-063c (último ajuste, 25-11)
- Plaça: porxos ×2, fachadas ×1,5 (tope 0,08), canto naranja de los arcos al 60 %: se lee «plaza con porches».
- Foguera a 1,6 m tras el muro, islote detrás (borde delantero ≥ 1,3 m): ≈ 45 cm de reflejo bajo el islote; la foguera queda ≈ 1,05–1,1 m
  en el muro (con el ápice ≤ 1,65 m, «≥ 1,2 m de alto» y «≥ 40 cm de reflejo» no caben a la vez: se priorizó el reflejo).
- brasa3d.json: `flames` y `smoke` por defecto 0 (la obra lee estos valores: las llamas de sprite y el humo seguían encendidos en la obra).
- Puntos en el cielo: son el polvo de atmos. En res-obra3d/experience.js:558 `p.dust *= e.dustK;` quedó dentro del comentario (no se ejecuta).
