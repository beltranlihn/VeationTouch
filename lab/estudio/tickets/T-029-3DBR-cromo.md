# T-029 · 3D-BR · I. Brasa: el fuego del correfoc sobre cromo líquido

- **Dueño:** 3D-BR · **Verifica:** QA · **Archivos:** `ressonancia/scenes3d/parts/brasa3d.js` (+ carpeta `parts/brasa3d/` si hiciera falta),
  `res-3d-study/parts/brasa3d.json`, `notas/3D-BR.md`, mi fila de `TABLERO.md`. Respaldo: `parts/brasa3d.ARTE2.js.bak` (antes del primer cambio).
- **Brief:** `OLA-ARTE2.md` §2 (tres exigencias) · `ARTE-2.md` §3 (I. Brasa: rojo y naranja sobre cromo líquido, ref. 8).

## Qué se hace
1. **Suelo de cromo líquido** (todo el suelo del mundo, desde dentro de la sala hasta 30 m): metal líquido con ondulación lenta grande
   (ruido) + **ondas** de fuentes analíticas (≤ 24 a la vez: cada caída, cada gota, el paso de las olas de fuego). Reflejo de verdad:
   - **geometría espejo**: las llamas, chispas, diablos, teselas y gotas se dibujan una segunda vez reflejadas en el plano del líquido,
     desplazadas por la pendiente de las ondas en ese punto (el reflejo ondula). Es geometría del mundo: continua en las esquinas y en
     P3|P4 sin nada de pantalla;
   - **entorno**: el rayo reflejado de cada píxel se corta con el anillo de fuego (cilindro alrededor del ojo) y lee su calor en ese punto
     del perímetro (el resplandor ancho, roto por las ondas); cielo oscuro arriba.
   El anillo de brasas pasa a ser **brasas flotando sobre el cromo** (manchas del lecho; entre ellas, metal).
2. **Interacción física — el trencadís en llamas:** teselas de cerámica vidriada (rojo óxido, naranja, crema, algo de oro) flotan a
   0,2–1,2 m tras el muro, a la altura de las manos, girando despacio (**capa cercana**). Una mano que llega (o arrastra) las **desprende**:
   prenden, saltan hacia el mundo con giro, caen con gravedad, **chocan con el cromo** (salpicadura: corona de chispas, corona de gotas de
   cromo, onda), **rebotan** una vez, flotan, se enderezan y **se hunden** apagándose. Cascada: la mano desprende la más cercana al instante
   (< 1 frame) y las vecinas con retraso según la distancia. Si no hay tesela a mano, nace una en la mano y cae. Las olas de fuego tiran
   las teselas a su paso (una cascada que da la vuelta a la sala). Las teselas vuelven a aparecer (se ensamblan de chispas) a los 3–6 s.
3. **Tres profundidades:** teselas y chispas 0–1 m tras el muro · fuego, diablos y anillo 3–10 m · **fondo lejano**: monolitos de cromo
   fundido a 25–45 m que sólo atrapan el resplandor del fuego (y se reflejan en el líquido).
4. **Movimiento de sala:** la sala **se hunde hacia el líquido** a medida que el anillo despierta (el grupo del mundo sube hasta `sink`
   0,45 m con el progreso y el `awake`; velocidad ≤ 3 cm/s, aceleraciones suaves); el fondo lejano gira muy despacio alrededor (≤ 1,5°/s).
   En la espera no hay hundimiento.
5. **Llegada / salida por fragmentación:** se conservan las esquirlas; además el líquido aparece con `arrive` y las teselas se ensamblan; en
   `leave` las teselas suben y se separan girando, el líquido se apaga.
6. **Se conserva:** chispas, chorro del correfoc, rastro, diablos, olas, `awake`, `reward`, la espera (cromo casi apagado), techo de grupo.

## Pasos y punto seguro de corte
1. Respaldo → 2. suelo de cromo + ondas (corte seguro 1: ya se ve el cromo) → 3. geometría espejo (llamas, chispas, diablos) →
4. teselas físicas + gotas + salpicaduras (corte seguro 2: interacción) → 5. hundimiento + fondo lejano → 6. capturas en el estudio
(15:30) → 7. obra `review.html?from=brasa`, WebGPU y WebGL2 sin errores, a QA (18:00).
**Volver atrás:** copiar `brasa3d.ARTE2.js.bak` sobre `brasa3d.js` (el JSON nuevo sólo añade parámetros: compatible).

## Prueba
- Estudio `?part=brasa3d`: progress 0 / 0,6 / 1 + awake; un toque (+0,1 / +0,5 / +1,5 s: tesela desprendida, choque, salpicadura);
  4 manos; una ola; costura P3|P4 con una tesela cayendo junto a la esquina; WebGL2 (`renderer: webgl2`) sin errores.
- Obra `res-obra3d/review.html?from=brasa`: llegada intro→brasa y salida brasa→pinya, sin errores.
- Banda de la guía 0,9–1,6 m legible (el cromo lejano refleja cielo oscuro). Sin medir fps (QA).
- Eventos de sonido propuestos (ola 2, canal de ENT): `'fx:impact'` {muro, u, fuerza} al chocar una tesela con el cromo; `'fx:drop'` gotas.
