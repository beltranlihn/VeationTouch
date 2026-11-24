# T-015 · 3D-PO · La bajada — Seny: «Luz que llueve» (parte nueva `baixada3d`)

- **Dueño:** 3D-PO · **Revisa:** QA · **Integra:** INT (en `res-obra3d`, junto a plaza + castell) · **Plazo:** 02:00
- **Archivos (sólo estos):** `lab/experiments/ressonancia/scenes3d/parts/baixada3d.js`, `lab/experiments/res-3d-study/parts/baixada3d.json`,
  `lab/estudio/notas/3D-PO.md`. No se tocan castell.js, las demás partes ni res-obra3d.
- **Guion:** GUION.md › «La bajada — Seny»: el castell se deshace piso a piso en una lluvia lenta de color; cada fragmento cae y se apaga
  en las manos. Guía: «Stay. Bring it down, floor by floor.» (la dibuja el host).

## Qué lee
`input.state`: `floors` (pisos que quedan), `stats.maxFloors`/`floors` al empezar, `walls[]` (estructura), `held[]`, `block`
('baixada' | 'fall'), `outcome` ('carregat'). `input.events`: `down` (un piso baja), `fall` (cae: carregat). `input.arrive/leave`.
Sin estado (estudio): `floors` (−1 = desde progress), `maxFloors`, `cycle` (bajada automática), `fall`, `walls`, `arrive`, `leave`.

## Cómo
1. Lluvia analítica en el vértice (sin compute, igual en WebGPU y WebGL2): ~24 k gotas, cada una con su columna (perímetro s, profundidad
   tras el muro 0,05–2,5 m), altura de salida, velocidad 1–1,5 m/s y fase; su ciclo k da el instante de salida t0; la emisión en t0 es
   una ráfaga por cada `down` (historial de bajadas en un uniform) + un goteo base: lo que cae es el piso que baja. Color por piso (paleta
   del trencadís, del oro al violeta) según cuántas bajadas había en t0.
2. Manos: cada gota cercana al plano del muro (profundidad < 0,6 m) que pasa por una mano (|Δs| < 0,22 m) se detiene a su altura, brilla
   (destello 0,4 s) y se apaga. Sin manos cae al suelo y se apaga con un charco breve.
3. Respuesta < 100 ms: anillo cálido al aterrizar la mano y halo mientras sostiene (sprites en el plano del muro, como pom3d).
4. Caída (carregat): todo el castell suelta sus fragmentos a la vez, con gravedad, sin manos que los paren.
5. arrive: las gotas se ensamblan desde fragmentos dispersos que giran y se cierran en columnas; leave: dejan de caer, suben y se
   separan como polvo y se apagan.

## Pruebas (PASA)
Tableros a 0, 2 y 8 manos y uno con floors = 0; costura P3→P4 sin corte; WebGPU y WebGL2 sin errores; fps lo mide QA.
Corte seguro: 1+2+3 (lluvia + manos), después 4, después 5.
