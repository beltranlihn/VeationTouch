# T-031 · 3D-PO · IV. Pom de dalt — el Eixample como ciudad de líneas, y la subida

- **Dueño:** 3D-PO · **Revisa:** QA · **Integra:** INT (la obra ya carga `pom3d` en el bloque pom) · **Plazos:** primera versión visible 15:30, integrada 18:00
- **Archivos (sólo estos):** `ressonancia/scenes3d/parts/pom3d.js` (+ carpeta `parts/pom3d/` si hiciera falta), `res-3d-study/parts/pom3d.json`,
  `lab/estudio/notas/3D-PO.md`, mi fila de `TABLERO.md`. Respaldo previo: `parts/pom3d.ARTE2.js.bak` (el Pom de ayer, entero).
- **Referencia:** imagen 11 (ciudad vertical de líneas blancas de circuito sobre negro, jardines que brillan en las terrazas); ARTE-2 §3 fila IV.
  Paleta: **blanco línea sobre negro, jardines de oro** (y un verde muy oscuro de hoja). Nada de plaza de noche, nada de ámbar de farol.

## La imagen
1. **Abajo (0–20 % de la subida):** la sala está en el fondo de un **patio de manzana del Eixample convertido en cañón vertical**: un anillo
   octogonal (chaflanes) de torres de líneas a 8–14 m del ojo, escalonadas, con voladizos, puentes de circuito que cruzan el vacío y
   terrazas con jardines. Las caras son negras; las líneas (aristas, forjados, ventanas, pistas de circuito) se dibujan en el sombreado
   con anchura constante en píxeles (sin parpadeo).
2. **La subida (lo que más le gustó a Vicente):** el mundo (`world`) se hunde de 1,6 m a ~90 m de altura del ojo, con **aceleración suave**
   (muelle crítico sobre la altura objetivo: nunca saltos aunque `climb` retroceda), y gira despacio en espiral (≤ 2 °/s, tope 6 °/s).
   El cañón pasa por los muros: forjados, puentes y jardines bajan; las teselas cercanas bajan más deprisa (paralaje).
3. **Arriba (≥ 70 %):** se sale por encima de las torres: el **Eixample entero en líneas** — cientos de manzanas octogonales con sus
   chaflanes, patios interiores con jardines de oro, la Diagonal cortando la retícula, el mar negro con líneas de horizonte al sureste,
   Collserola como una línea al noroeste, el cielo abierto (negro, estrellas finas, líneas horizontales de circuito muy tenues).
4. **Tres profundidades:** (a) teselas de circuito flotando a 0,2–1 m detrás del muro (cuadraditos negros con canto blanco, alguna de oro),
   envueltas en altura: pasan hacia abajo durante la subida; (b) el cañón a 3–10 m tras el muro; (c) la ciudad lejana, el mar y el cielo.

## Las luces (se conservan)
Dosos, acotxador, enxaneta: luces de oro que suben por pistas de circuito verticales de la fachada del cañón frente a cada muro de la
estructura (orden del score: `lightWall` → `nextWall`), dejando un hilo de oro; baliza en la siguiente; `arrived:n` = anillo de luz;
la última levanta la mano. `restless`: titubeo, parpadeo, temblor (como ahora). Regla de quietud intacta (la decide el score).

## Interacción física (respuesta < 100 ms)
- **Mano quieta (≥ 0,6 s):** el jardín de la terraza más cercana en esa dirección **florece** (las flores de oro se abren y se encienden) y
  suelta **pétalos** que caen planeando, girando, con viento, hacia el fondo del cañón. Además el halo de quietud en el muro (como ahora, en oro y blanco).
- **Mano que se mueve / aterriza:** **se desprenden teselas de línea** del plano cercano: caen con gravedad (9,8 m/s²), giran sobre sí
  mismas, destellan al mirar al ojo y se pierden en la profundidad (estamos altos: caen varios segundos). Al aterrizar una mano, una
  pequeña ráfaga inmediata (el mismo frame).
- Física en CPU (≤ 1500 instancias, búferes reutilizados, sin asignar por frame); un solo draw call para teselas y pétalos.
- Eventos para el sonido (ola 2, sólo anotados): `fx:fall` (muro, u, fuerza), `fx:bloom` (muro, u).

## Llegada / salida
Se conserva la malla de fragmentos (icosfera alrededor del ojo) de la llegada y la salida, ahora con la imagen de la ciudad de líneas;
más corta si INT lo pide (su teselación de pantalla va encima). La torre de cerámica de llegada se retira (era la plaza).

## Pasos y punto seguro de corte
1. Respaldo `pom3d.ARTE2.js.bak`. 2. Ciudad lejana + cielo + mar (instanciado) y la subida con muelle → **corte seguro 1** (se ve la ciudad).
3. Cañón cercano con terrazas, puentes y jardines. 4. Luces/hilos sobre el cañón. 5. Teselas cercanas + física (caer, pétalos, floración).
6. Llegada/salida con la nueva imagen. 7. json, capturas, WebGL2, integración en `res-obra3d/review.html&from=pom`.
**Volver atrás:** `cp pom3d.ARTE2.js.bak pom3d.js` (y el json de `pom3d.json.ARTE2.bak`).

## Prueba (para QA)
- Estudio `?part=pom3d` con progress 0 / 0,35 / 0,7 / 1, con 4 manos fijas y con manos moviéndose; WebGPU y WebGL2 sin errores.
- La subida: sin saltos con `climb` que retrocede; giro ≤ 6 °/s (lo registra `window.__pom3d.maxYawRate`).
- Banda de la guía (0,9–1,6 m en el centro de cada muro) legible: líneas tenues ahí, nada cegador.
- Obra: `res-obra3d/review.html&from=pom` con llegada y salida sin errores. fps: los mide QA.
