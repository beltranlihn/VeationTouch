# La salida de la sala a 60 fps — medición en el servidor de Barcelona XR Lab (26-11-2026, 01:30–02:00)

**Rama:** `fix/salida-sala-60fps` (desde `main` ea7cf5c, el que usa la sala). **Sólo documentación:** esta noche no hay un cambio
pequeño y seguro que lleve la sala a 60 fps estables (ver §4). Como pedía el encargo, se entrega lo medido y la recomendación.

**Probado con:** `main` ea7cf5c + el laboratorio `lab/ressonancia-trailer` **55952b4** integrado con `scripts/integrate-lab.mjs`
(sin commitear), bloque «Entrance» (`jump: wait`), calidad High, `mosaic: image`, escala 1, salida directa a DISPLAY6 (Advanced
Output con los 4 recortes de «Palo Alto Final»), ventana principal minimizada, nadie mirando la vista previa.
**GPU:** RTX A6000 con «HW Power Brake Slowdown» activo: el reloj salta entre **150 y 450 MHz** (máx. normal ~2100).

## 1. Cómo se midió

- **fps de la obra y de la salida:** `/ws/ui` (state.experience.fps, state.output.fps), cada 2 s.
- **Tiempos de la ventana de salida:** `window.__out.stats.timing` (ui/js/output.js) por el protocolo de DevTools. La app se arrancó
  con `--remote-debugging-port=9223`, sólo para medir. Da:
  - fps de composición;
  - distribución del tiempo entre fotogramas (`gapMs`);
  - CPU por composición;
  - GPU de la copia de la capa de la obra (`copy`) y de componer + presentar (`compose`), con timer queries, 1 de cada 4 fotogramas.
- **fps propio de la obra:** `__obra.fps()` dentro del iframe.
- **Reloj y uso de la GPU:** `nvidia-smi`, cada segundo, durante cada medición.

## 2. Resultados

| Configuración | fps salida (media) | Entre fotogramas p50 / p95 / máx (ms) | GPU copia p50 / p95 (ms) | GPU componer+presentar p50 / p95 (ms) | CPU (ms) | Reloj medio (MHz) | Uso GPU |
|---|---|---|---|---|---|---|---|
| Base, salida directa | 50,7–52,4 | 16,7 / 26–50 / 52–59 | 0,8–1,8 / ~3 | **3,3 / 14–15** | 0,1–0,3 | 194–428 | 64–92 % |
| Base, capa «media» apagada (vacía) | 51,3 | 16,8 / 31,6 / 55,5 | 1,9 / 3,0 | 3,4 / 13,2 | 0,1–0,3 | 260 | 66 % |
| Base, salida por Spout (medido antes, sin `stats`) | ~55 | — | — | — | — | 328 | 80 % |
| Base, escala de salida 0,5 (medido antes) | 56,6 | — | — | — | — | 371 | 36 % |
| **Obra sola: `__vtLayerFrame` anulado unos segundos** (sin copia ni composición) | — (la salida se congela) | — | — | — | — | 450 | 92 % |
| → fps propio de la obra en ese rato | **55–59** | | | | | | |

Lectura:

1. **La mayoría de los fotogramas llegan a tiempo** (mediana 16,7 ms). La media cae a ~51 porque una parte se va a 2–3 vsync (p95
   26–50 ms): son fotogramas perdidos, no un ritmo uniformemente lento.
2. **La CPU no cuenta** (0,1–0,3 ms por composición) y **la copia es barata** (mediana 1–2 ms; no hay lectura a CPU).
3. **Componer + presentar** cuesta ~3,3 ms de mediana con picos de ~14 ms. Esto incluye:
   - la mezcla en un FBO de 7196×912;
   - los 4 recortes a la ventana de 3840×2400;
   - con la GPU compartida, probablemente también la espera tras el trabajo de la obra (las timer queries de WebGL miden tiempo de
     la GPU, no sólo de este contexto).
4. **Quitando la cadena de salida, la obra sola sube a 55–59 fps, pero tampoco se queda en 60**, con la GPU al 92 % a 450 MHz.
   - La cadena de salida le quita ~5–8 fps.
   - Aun sin ella, con el freno, la GPU no da 60 estables con esta obra.
5. La capa «media» vacía no cuesta nada. Spout (~55) y la escala 0,5 (56,6) tampoco llegan a 60.

## 3. Hipótesis del encargo, una por una

| # | Hipótesis | Resultado |
|---|---|---|
| 1 | Cadena en serie (obra → copia → mezcla → presentación) | **En parte.** La cadena cuesta ~5–8 fps, pero la copia es barata: la mayor parte es componer + presentar y la espera de la GPU compartida. Aunque se elimine por completo, la obra sola se queda en 55–59 con esta GPU frenada. |
| 2 | Dos `requestAnimationFrame` desacoplados | **No parece.** La salida la manda la obra (`driver: "experience"`, `expCalls == expFrames`), en la misma tarea en que dibuja; el bucle propio de la página no compone. Los fotogramas perdidos coinciden con la GPU llena. |
| 3 | Los recortes repiten trabajo | No medido por separado esta noche. Son 4 recortes de un FBO ya compuesto: la presentación lee 7196×912 y escribe 3840×2400 una vez. |
| 4 | Error de consola `writeBuffer … parameter 1 is not of type 'GPUBuffer'` | **Viene de la obra, no de VEATION.** Sale igual en el arnés del laboratorio (`lab/tools/perf/run-uncapped.cjs`), sin la app. Es el backend WebGPU de three r187 escribiendo en un búfer aún no creado o ya liberado. → Para el estudio. |

## 4. Por qué no hay arreglo esta noche

- El objetivo «60 estables, mínimo ≥ 55» no se alcanza ni con la obra **sola** (sin salida) en esta GPU: 55–59 con picos abajo.
  Ningún cambio en `ui/js/output.js` puede dar más que eso.
- Lo que sí se podría ganar en la salida (~5–8 fps) pide cambios en el corazón de la mezcla (ver §5). Probarlos bien y pasar
  `npm test` antes del estreno no es razonable. Para el estreno vale más la sala estable a ~51 que un arreglo sin probar.

## 5. Propuesto para después del estreno (por orden de ganancia probable)

1. **El freno de la GPU** (hardware: fuente, conectores PCIe auxiliares de la placa ASUS WRX80E-SAGE SE, BIOS 0701). Con la A6000 a
   ~1800–2100 MHz en vez de 150–450 todo esto tendría margen de sobra. Es lo primero.
2. **Presentar la obra sin la mezcla cuando es la única capa visible** (opaca, opacidad 1, sin fundido ni apagón):
   - que el presentador de pantallas lea directamente la textura subida de la obra y se salte el FBO de 7196×912;
   - una pasada completa menos por fotograma.
   - Cambio acotado en `output.js` (`compose`) y `ui/js/mixer/screens.js`, con prueba en `tests/output.test.mjs` y `tests/screens.test.mjs`.
3. **Componer con el fotograma anterior de la obra** (doble búfer: un fotograma de latencia):
   - la obra copia su resultado a una segunda textura propia (runtime) y la salida sube la anterior;
   - así la subida no espera a que la obra termine en la GPU.
   - Requiere tocar `experiences/runtime.js`.
4. **Una mezcla en WebGPU** que comparta la textura de la obra sin copia entre APIs. Es la solución de fondo, y la más grande.
5. **Medir con la vista previa cerrada siempre.** La vista previa (`startPreview`, `capturePage`) cuesta ~15 fps cuando alguien mira
   el panel Output (medido la noche del 25).

## 6. La sala

- Durante la medición corrió `Desktop\VEATION-Fix-base` (`main` ea7cf5c + lab 55952b4, sin cambios de software).
- Al terminar se vuelve a dejar la versión que había antes, `Desktop\VEATION-Perf` (`main` ea7cf5c + lab de `perf/servidor-mosaico`):
  la sala no cambia sin el visto bueno del equipo.
- **Para pasar la sala a la obra 55952b4** (la nueva narrativa de la entrada) cuando el equipo lo diga: cerrar VEATION y abrir
  `Desktop\VEATION-Fix-base\VEATION Touch.exe` desde el Explorador (no desde una consola de Claude). Usa los mismos datos de
  `%APPDATA%\VEATION Touch`.
- **Volver:** cerrar y abrir `Desktop\VEATION-Perf\VEATION Touch.exe` (o `Desktop\VEATION-Trailer\…`, la de la noche del 25).
- Durante una función: ventana de VEATION minimizada, salida directa, Resolume cerrado.
