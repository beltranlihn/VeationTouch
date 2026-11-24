# Cuaderno de TRON

## T-049 · Tronc = el castell como escultura de porcelana (24-11)

### Hito 1 — primera escultura visible
- **Antes / después** (muro P1, estudio, pisos 4, quints formándose):
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tron/m1_before_after.png`
- Obra (salto a tronc, WebGPU, 60 fps-eq en la captura, 0 errores):
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tron/o1.png`
- **Qué es.** `parts/tronc3d/sculpt.js`: la disposición de `castell.js` (3 de 9 amb folre: pinya de 3 anillos 10/16/22, folre de 10,
  tronc de tres × 6, dosos, acotxador, enxaneta; 80 personas) como SDF (elipsoides + conos redondeados, smin dentro del cuerpo y más
  apretado entre cuerpos del piso) → surface nets por piso, AO / faixa / ruido / altura horneados por vértice, granos por área.
  Se construye **una vez por página en un module worker** (`sculpt-worker.js`, ~2,8 s fuera del hilo principal; en el hilo principal
  por pasos de 7 ms si no hay Worker). ~240 k vértices y ~60 k granos por torre; la misma geometría en los 4 muros.
- Pisos = niveles del score: 0 PINYA · 1 BAIXOS · 2 SEGONS (+folre) · 3 TERÇOS · 4 QUARTS · 5 QUINTS · 6 SISENS · 7 DOSOS · 8 ACOTXADOR · 9 ENXANETA.
- Escala 2,5, a 6,5 m tras el muro; el piso que se forma se ve a ~2,5 m (sobre el texto); la banda de hombros a la altura de las manos.
- Luz propia (TSL, sin luces de escena): llave cálida de arriba con caída hacia abajo (pool), filo frío, relleno bajo, hemisferio;
  faixes en trencadís esmaltado (celdas 3D + junta, brillo). Fondo gris azulado propio + `room.makeHalo` (SIS) detrás del piso alto.
  `room.flash` en los filos y en el labio de los agujeros. Velo en las zonas tranquilas.
- La regla de pisos es **parte de la escultura** (una vara de medir a la profundidad de la torre, sube con ella; Geist Mono), no la
  del guía (SIS: reglas en los bordes; la mía queda a −1,6 m del eje, fuera de los 0,4 m de borde).
- Zonas tranquilas (estudio, pisos 4): texto 32–33 % (p95 68–70), botón 30–31 % (p95 60). Obra: muro con torre 27 % / 32–35 %.

### Pendiente tras el hito 1
Verificar tocar (pincel), inclinación, grieta, slip, colapso (fall3d) y takeFloor (baixada) en vivo; WebGL2; 4 manos; afinar el
aspecto de los granos del piso en formación (aún se leen como nube) y el modelado de la porcelana.

### Hito 2 — terminado (24-11)
Evidencias en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tron/`:
`final_w1.png` (estudio, quints reuniéndose en granos) · `h2_w1.png` (dos manos: la cabeza y un costado deshechos en granos) ·
`l1_w1.png` (lean 1: inclina ~7° y suelta un chorro de granos por el lado que cae) · `w2_w1.png` (temblor: grieta fina y luminosa) ·
`rw_w1.png` (premio: retrocede, toda la escultura y la vara de nombres) · `g1_w1.png` / `o4gl_a.png` (WebGL2) · `o4.png`, `o4s.png`
(obra con 4 manos, con y sin sonido) · `bx_w1.png` (baixada) · `fa_w1.png` (caída).
- **Tocar:** respuesta en el primer frame medido (**18 ms**); el rayo ojo → mano se traza sobre el SDF (sphere tracing, sin malla de
  picking); si roza a < 0,32 m de la superficie, pincel atenuado. Pincel 0,22 m-castell (≈ 17 cm en el muro), 16/8/4 por s.
- **Levantar:** el piso que se forma se reúne de granos con retrasos propios (crece la densidad y sube con la fase/banda); al encajar,
  flash + impacto y la porcelana aparece de abajo arriba en ~1,1 s (la disolución al revés). Sin `yMed` (score antiguo): el piso nuevo
  se solidifica igual, sin granos previos.
- **Inclinar:** muelle amortiguado hacia lean·7°; `shed` ≤ 0,75: chorro de granos por el lado que cae (bucle de caída y vuelta); recta,
  vuelven. **Temblor:** grieta en el piso alto (`wobble`), `steady` la cierra en 0,8 s, `slip` deshace ese piso en granos que caen
  (2,6 s) y vuelve a formarse en la banda.
- **Muros sin torre:** granos por el pie del muro hacia la torre más cercana; una mano los levanta; un `lift` (rise > 0,18 m) manda una
  ráfaga de 60 que ilumina la base al llegar. La banda en esos muros se va a las manos y destella blanca en las elevaciones contadas
  (lo de PAR, rehecho).
- **API intacta:** `collapse/restore/collapsing` (los pisos estallan en granos: intent hacia un lado desde la grieta, carregat de abajo
  arriba; fundido final), `takeFloor` (≈ 250 granos por piso y torre como piezas `tile`, `kind` 'stone'/'glaze'), `giveFloor`,
  `levels()` (y y h reales de la escultura), `impacts`/`fx:impact`, `rise`. Obra: baixada tomó 1794 piezas en modo 'tronc' (6 pisos);
  caída: `collapse` del host + 349 esquirlas de fall3d. fall3d crea su propia instancia: comparte la escultura (caché del módulo).
- **Zonas tranquilas** (estudio pisos 4): texto 31–32 %, botón 29–30 %; obra (1 muro de estructura, 4 manos): ≤ 33,5 %.
- **Coste** (no medido por QA): 4 torres × (240 k vértices sólidos + 60 k granos), culling por piso; sólo los pisos visibles. El
  build va en un worker (2,8 s). La obra mostraba 60 fps-eq en las capturas (WebGPU y WebGL2), sin medición fiable.

**Débil / pendiente**
- Las caras son óvalos lisos (porcelana tipo maniquí): se podría añadir nariz/ceja como en `pinya3d/body.js`.
- El piso en formación, a medio subir, se lee como nube; bien al final (las figuras salen de los granos).
- La caída de los granos en el colapso es rápida para la cámara que no sube: QA debería verla en vivo.
- No probado con **L** (LiDAR) ni a `?scale=1` en el portátil de la sala. No toqué PARTS.md (la API no cambió de firma).
- Volver atrás: `cp parts/tronc3d.T049.js.bak parts/tronc3d.js` y `cp res-3d-study/parts/tronc3d.T049.json.bak res-3d-study/parts/tronc3d.json`
  (la carpeta `parts/tronc3d/` sólo la usa la versión nueva).

## T-054 · pulido (24-11, noche) — respaldos `*.T054.js.bak` / `tronc3d.T054.json.bak`
Capturas en el scratchpad `tron/`: `forming_sheet.png` (lift 0,2 · 0,4 · 0,7), `p5_w1.png` (final, lift 0,4), `p5gl.png` (WebGL2), `ld1.png` / `ld4.png` (LiDAR).
1. **Cabeza** (`sculpt.js`): cráneo algo más estrecho, mandíbula y mentón, el plano de la ceja y un apunte de nariz (cono): lee como
   cabeza esculpida, no óvalo. En la pinya (rejilla 3,4 cm) la nariz casi no se resuelve: a propósito, lejos.
2. **Piso en formación**: los granos van a la silueta pronto (retraso por grano 0–0,3 de la fase, llegan en 0,32); a 40 % ya se leen
   las figuras de cintura arriba; el piso entero sube el último tramo con la banda. Parámetro de estudio `liftAt` para fijarlo.
3. **Zonas tranquilas**: una sola zona de sombra suave (±1,6 m × suelo–2,25 m, bordes 0,25–0,35 m) × `quiet` (0,84, parámetro) + caída
   de la llave hacia abajo; el filo frío sobrevive a la sombra (siluetas). Estudio: texto 25 % (**p95 33–34 %**), botón 19 % (**p95 29–30 %**).
   En la obra el p95 del botón (~70 %) lo ponen las dianas del guía, no la escultura. Coste estético: los pisos bajo 2,25 m se ven gris
   porcelana en sombra y la luz queda arriba (el piso nuevo); si Beltrán lo quiere más blanco, bajar `quiet` a ~0,7 (p95 ≈ 40 %).
4. **`room.lightRecipe`**: no lo adopto. Mis materiales son `MeshBasicNodeMaterial` con la receta en ~30 operaciones TSL; pasar a
   materiales iluminados (PointLight + hemisferio + alphaTest) costaría más por fragmento y no se vería mejor. La receta es la misma.
5. **LiDAR (L)**, obra, manos fijadas por el arnés: 1 mano → primera respuesta 230–310 ms (10 Hz + 150 ms de reproducción), el pincel
   no cae (mín 0,96 de 1); 4 manos → 1,72–2,25 en la torre con 2 manos, 58–60 fps-eq. Arreglo: cada pincel aguanta 0,3 s tras la última
   lectura y suelta a 0,6 s; un trazo nuevo que cae donde estaba otro hereda su hueco sin sonido nuevo ni parpadeo.
- baixada (1787 piezas, modo tronc) y caída (collapse + esquirlas de fall3d) siguen bien; WebGL2 en el estudio sin errores; la obra en
  WebGL2 no cupo en los 15 s de check.mjs con la máquina cargada (load 18), ya probada en T-049.
