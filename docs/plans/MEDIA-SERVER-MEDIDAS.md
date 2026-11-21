# VEATION Touch como media server — medidas de la fase F0

> **Tipo:** medidas (fase F0 de `docs/plans/MEDIA-SERVER.md`). **Fecha:** 2026-11-21, de 01:37 a 01:58.
> **Máquina:** portátil de desarrollo con RTX 4060 Laptop. **Todas las cifras están medidas con Unreal abierto** (otro equipo
> lo usaba a la vez; §2 dice qué le hace eso a cada cifra). **Estado:** cifras reales de esta máquina; falta repetirlas en
> el servidor de XR Lab con la sonda del anexo (§10).
> Sustituye las estimaciones de §3.4 del plan y decide el diseño del mezclador (§4.5, riesgos R1 y R2).

---

## 1. Resumen y decisión

**Decisión: (a), el mezclador como en §4.5**, con la experiencia en su renderer automático (WebGPU en Alma liquid). Ni la
copia del lienzo de la experiencia ni la ventana visible de 3840×2400 dan problemas en esta máquina. En todas las pasadas
con la ventana visible el mezclador compuso a 60,00 fps sin un solo hueco de más de 17,4 ms, también con dos clips en
fundido. El plan B (R2) no hace falta. Fijar el renderer `webgl2` de Alma liquid (opción b) queda como palanca medida y
barata (§8.1), no como regla.

| Qué | Medido (con Unreal abierto) | Estimado en el plan |
|---|---|---|
| Copia del lienzo **WebGPU** → textura WebGL2, 7196×912 | **0,3–2,4 ms** p50 en la línea de tiempo de la GPU dentro de la composición completa (p95 1,4–3,0); 3,6 ms en la prueba aislada con la GPU a ~580 MHz. De eso, ~1 ms es trabajo; el resto, espera de sincronización. Hilo principal: 0,04 ms | incógnita; umbral de 3 ms |
| Copia del lienzo **WebGL2** → textura WebGL2 | **0,12–0,36 ms** p50 | — |
| HAP (Hap1) 7196×912 a 60 fps, 4 workers | **60/60** fotogramas por segundo, retraso 0; Snappy **9,8 ms**, lectura 0,5, subida 0,2: **~11 ms por fotograma** en un worker | 5–8 ms |
| HAP Q (HapY) a 60 fps | **60/60**, retraso 0; Snappy **17,2 ms**: **~20 ms por fotograma**, así que necesita ≥ 2 workers | 9–16 ms |
| Ventana visible 3840×2400: Alma liquid + 1 HAP + 4 slices | **60,00 fps**; huecos p99 16,9 ms, máximo 17,0; GPU al 35 % | — |
| Lo mismo con dos clips HAP en fundido | **60,00 fps**, máximo 17,2 ms; los dos clips a 60,0/s | — |
| Fuera de pantalla → Spout 7196×912 con el mezclador + HAP | **60,00 fps** de composición; 59,99 fotogramas/s enviados al emisor; `sendShared` 0,18 ms | — |
| Memoria de vídeo: experiencia + mezclador + 1 capa | **+1,2–1,3 GB** (+0,4 GB por la segunda capa) | < 0,6 GB con dos capas |
| Disco NVMe sin caché de Windows | 3,1 GB/s: **0,55 ms** por fotograma HAP, 1,0 ms por fotograma HAP Q | 1–2 / 2–4 ms |

**Lo que cambia en el plan** (detalle en §8):
1. **Snappy cuesta de 3 a 6 veces lo estimado** con material colorido, porque la fusión de rachas que hizo rápido el
   material de domo de VEATION (70 % de bloques negros) apenas actúa aquí. HAP sigue cabiendo de sobra; HAP Q a 60 fps
   necesita dos workers por capa.
2. **La ventana de petición acotada de `driveHAP` es imprescindible.** Un primer intento sin ella decodificaba 93–134
   fotogramas por segundo, llevó la memoria de vídeo a 6,9 GB en dos segundos y hundió la página a 12–20 fps.
3. **El cabezal del clip tiene que salir del instante del fotograma** (el de `requestAnimationFrame`, con medio fotograma
   de margen), no de `performance.now()` en el momento de componer. Con el instante del fotograma: 60,0 fotogramas
   nuevos por segundo y ningún salto. Con `performance.now()`: 58,5/s en una de las dos capas, con saltos y repeticiones.
4. **La memoria de vídeo por capa es mayor que la estimada**: hay que corregir §3.4.

---

## 2. Máquina y condiciones de medida

| | |
|---|---|
| CPU | Intel Core i9-13980HX, 24 hilos |
| RAM | 31,6 GB (unos 9 GB libres al empezar) |
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU, 8 GB (8188 MiB), controlador 32.0.16.2124. Optimus con una Intel UHD, pero las dos pantallas y Chromium van por la NVIDIA |
| Disco | NVMe Samsung MZVL21T0HCLR, 1 TB |
| Pantallas | interna 1920×1200 a 120 Hz; externa 1920×1080 a **60 Hz** (la principal). Todas las pruebas con ventana visible van en la de 60 Hz |
| Software | Electron 44.7.0 del repo (Chromium 152.0.7977.130). WebGL = ANGLE sobre Direct3D 11 (NVIDIA). WebGPU = adaptador NVIDIA «lovelace», formato preferido `bgra8unorm`. `EXT_disjoint_timer_query_webgl2` y `WEBGL_compressed_texture_s3tc` disponibles. Composición de Chromium por GPU (`gpu_compositing: enabled`) |

**Unreal abierto.** Unreal Editor estuvo abierto todo el tiempo (de 4,7 a 7 GB de RAM; 2,2–2,6 GB de memoria de vídeo).
Su uso de la GPU fue a rachas: entre 1 y 6 % cuando estaba en reposo y entre 36 y 43 % cuando trabajaba. La tabla de §7
dice en qué estado estaba en cada pasada. Qué le hace eso a las cifras:
- **Los fps y los huecos son conservadores.** La GPU se reparte por tiempo entre procesos: si aun así no se perdió ningún
  fotograma, con la misma GPU para ella sola tampoco debería perderse.
- **Los milisegundos por pasada dependen del reloj de la GPU, y el reloj depende de Unreal.** Con Unreal en reposo nuestra
  carga es tan ligera que la GPU no sube de estado (P3/P4, de 420 a 1000 MHz) y cada pasada tarda más. Con Unreal
  trabajando, la GPU está en P0 (1,3–1,9 GHz, memoria a 8 GHz) y la misma copia baja de 2,4 a 0,7–0,9 ms. Entre una
  situación y otra las cifras en ms varían de 2 a 3 veces. Los ms con Unreal en reposo son los peores de esta máquina.
- **El tanto por ciento de uso de la GPU incluye a Unreal** y se mide sobre el reloj de ese momento: sirve para ver
  margen, no para restar costes.
- **La CPU también se comparte**: Snappy puede salir un poco peor que en una máquina sola.

**Método.**
- Una pasada = un Electron de sonda (`--force-device-scale-factor=1`, así un píxel CSS es un píxel de pantalla), de 30 s
  como mucho (las de composición: 3 s de calentamiento y 18 s de medida). Una sola a la vez. Al terminar, la sonda cierra su ventana, lee
  `nvidia-smi` y sale; el lanzador comprueba que no queda ningún `electron.exe` suyo. Ninguna pasada dejó procesos.
- Antes de cada pasada: `nvidia-smi`. Si hubiera tenido menos de 2 GB libres o más del 80 % de uso, la pasada se saltaba
  (no pasó nunca). Durante la pasada: `nvidia-smi` cada 500 ms, y la sonda se corta sola si la memoria de vídeo se acerca
  al total (guarda añadida tras el primer intento HAP, §4).
- **Tiempos de GPU**: consultas `TIME_ELAPSED` de `EXT_disjoint_timer_query_webgl2` alrededor de cada paso del mezclador.
  Miden la línea de tiempo del contexto WebGL, **esperas incluidas**. **Tiempos de CPU**: `performance.now()`.
  **Cadencia**: instantes de `requestAnimationFrame` y de cada composición; «hueco» = tiempo entre dos fotogramas.
- `gl.finish()` **no bloquea** en Chromium (medido: 0,0 ms). Para hacer esperar a la CPU hay que leer un píxel con
  `readPixels`.
- La experiencia es la **Alma liquid real** (`experiences/alma-fluid`, sin tocar), con los ajustes de XR Lab: 7196×912,
  calidad `ultra`, logo en P1, sala cerrada (360°) y tres manos sintéticas moviéndose por P1, P2 y P3. Un runtime de
  sustitución (`probe-runtime.js`) le da la misma API que `experiences/runtime.js` en modo capa. Su bucle es el del runtime
  real y, en la misma tarea en que la pieza dibuja, llama a `parent.__vtLayerFrame(canvas, t)` como pide §4.5.
- Todo el código de la sonda está en el anexo A. Los resultados en bruto (un JSON por pasada) quedaron en el scratchpad
  de la sesión.

---

## 3. Punto 1 — copia del lienzo de la experiencia a una textura WebGL2 (7196×912)

**Montaje.** Una ventana visible de 3840×2400 (como en §5). Dentro, el iframe de Alma liquid a 7196×912 y, encima, el
lienzo WebGL2 del «mezclador», que en cada fotograma de la experiencia hace
`texSubImage2D(TEXTURE_2D, 0, 0, 0, RGBA, UNSIGNED_BYTE, canvas)` sobre una textura `RGBA8` (`texStorage2D`) y la dibuja
reducida. Una sola página y una sola pasada por renderer, por fases:

| Fase | Qué hace el mezclador en cada fotograma de la experiencia |
|---|---|
| `none` | nada: la experiencia sola |
| `copy` | la copia + un dibujo pequeño de la textura; tiempo de GPU de los dos |
| `detail` | la copia, una **segunda** copia del mismo lienzo (ya listo) y una copia GL→GL de 7196×912 con un cuadrilátero, cada una con su tiempo de GPU |
| `sync` | la copia seguida de un `readPixels` de un píxel: la CPU espera hasta que la copia está hecha |
| `bitmap` | `createImageBitmap(canvas)` y luego `texSubImage2D(bitmap)`, el camino del visor, para comparar |

**Cadencia y uso de la GPU** (la experiencia en todas las fases; Unreal en reposo):

| Renderer | Fase | fps de la experiencia | Hueco máximo | GPU (media) | Reloj GPU |
|---|---|---|---|---|---|
| WebGPU | `none` | 60,00 | 17,0 ms | 25,7 % | 686 MHz |
| WebGPU | `copy` | 60,00 | 16,9 ms | 35,9 % | 578 MHz |
| WebGPU | `detail` | 60,00 | 16,9 ms | 38,0 % | 735 MHz |
| WebGL2 | `none` | 60,00 | 16,9 ms | 24,8 % | 568 MHz |
| WebGL2 | `copy` | 60,00 | 17,0 ms | 34,9 % | 420 MHz |
| WebGL2 | `detail` | 60,00 | 17,0 ms | 41,0 % | 450 MHz |

**Tiempos** (p50 / p95, ms):

| | Lienzo WebGPU | Lienzo WebGL2 |
|---|---|---|
| Llamada a `texSubImage2D(canvas)` en el hilo principal | 0,04 de media / 0,1 | 0,02 / 0,1 |
| GPU: la copia (fase `copy`) | **3,62 / 4,23** | **0,36 / 0,37** |
| GPU: la copia (fase `detail`) | 2,78 / 3,35 | 0,29 / 0,37 |
| GPU: segunda copia del mismo lienzo, ya listo | **0,99 / 1,14** | 0,29 / 0,37 |
| GPU: copia GL→GL de 7196×912 con un cuadrilátero (referencia) | 0,20 / 0,75 | 0,30 / 0,37 |
| GPU: lo mismo dentro de la composición completa (§5, §6) | **0,32–2,43 / 1,42–2,99** | 0,12–0,23 / 0,26–0,46 |
| `createImageBitmap(canvas)`: hasta que se resuelve / subida en GPU | 0,3 / 3,09 | 0,0 / 0,31 |
| CPU esperando la copia con `readPixels` (fase `sync`) | 11,1 / 13,6 | 4,4 / 5,4 |

**Lectura.**
- El lienzo WebGPU (Dawn) y el contexto WebGL (ANGLE/D3D11) son dispositivos distintos. Para copiar, la cola GL espera a
  que Dawn termine el fotograma y la copia pasa por una imagen compartida. El trabajo de verdad es la segunda copia, ~1 ms
  (frente a 0,2–0,3 ms de una copia GL→GL del mismo tamaño). El resto de los 2,8–3,6 ms es **espera**: no ocupa la GPU y
  baja con el reloj (0,7–0,9 ms con la GPU en P0, §5).
- El lienzo WebGL2 cuesta lo mismo que una copia GL→GL: 0,3 ms.
- El hilo principal no paga nada (la llamada es asíncrona), y **en ninguna fase se perdió un fotograma**.
- La subida de ~10 puntos de uso de GPU entre `none` y `copy` sale igual con WebGL2, cuya copia cuesta 0,36 ms. No es la
  copia: es que la ventana pasa a tener un lienzo más que cambia en cada fotograma y que hay que componer.
- `createImageBitmap` no mejora nada (3,1 ms de GPU con WebGPU) y añade un salto de tarea: hay que copiar directamente.
- Hacer esperar a la CPU por la copia cuesta 4–12 ms. Eso no es coste, es la latencia del proceso GPU, pero **nunca debe
  estar en el camino de un fotograma**.
- La copia llega bien: los píxeles leídos de la textura tienen el color del líquido (p. ej. `175, 195, 238`), no negro.

**Criterio (b) del plan («si la copia WebGPU cuesta más de 3 ms»).** En la composición real, la copia queda por debajo:
0,3–2,4 ms p50 y 1,4–3,0 ms p95. Sólo la prueba aislada, con la GPU en su reloj más bajo, da 3,6 ms p50. Y aun así es
sobre todo espera y no costó fotogramas. **No se cumple la condición de (b).**

---

## 4. Punto 2 — el worker HAP de VEATION, tal cual

**Montaje.**
- `hap-worker.js` copiado de `Immersive Studio Pro` sin cambiar una línea. Corre en workers con Node
  (`nodeIntegrationInWorker: true`, `sandbox: false`), como en el ADR-0012 de VEATION.
- 4 workers: el `hapNW()` de VEATION en esta máquina da max(2, min(4, 24 >> 2)) = 4.
- El planificador reproduce el de `driveHAP`: una petición en vuelo por worker; ventana de petición desde el cabezal más la
  latencia medida (L = ⌈latencia·fps⌉, como mucho 12) y K fotogramas más (K = máx(2, mín(8, ⌈fps·0,12⌉ + 1))); el que llega
  tarde pero es más nuevo se enseña; los viejos se cierran.
- El hilo principal sube cada `ImageBitmap` con `texSubImage2D` a una textura 7196×912 y la dibuja. El cabezal sale del
  instante de `requestAnimationFrame`.
- Ventana visible de 1920×300, en la pantalla de 60 Hz.

**Archivos de prueba** (sintéticos, generados aquí y borrados al terminar):
- 7196×912 y 180 fotogramas. Ruido suave animado (fbm de 4 octavas con paleta de color) con regiones oscuras, de modo que
  Snappy encuentre material parecido al real: ni negro ni plano.
- Empaquetado con las funciones de VEATION copiadas literalmente (`snappyCompress`, `hapSection`, `hapFrame`, `movBuild`,
  `movFtyp`) en 4 trozos por fotograma, como exporta VEATION. El DXT se codifica en CPU con un codificador propio de la
  sonda (VEATION lo hace en GPU), con la misma disposición de bloques.
- **Hap1**: 2,28 MB por fotograma = 2,78 bits/px (el 69,5 % del DXT1 sin comprimir); 410 MB en total.
- **HapY**: 4,73 MB por fotograma = 5,77 bits/px (el 72 %); 852 MB en total.
- Los dos caen dentro del «material real» de §3.4 (2,6–3,4 y 4,9–6,3 bits/px).

**Resultados** (6 s de medida por velocidad, tras 1 s de arranque; Unreal en reposo):

| | Entregados/s | Nuevos en pantalla/s | Retraso (fotogramas) | Petición → `ImageBitmap` | Lectura | Snappy | Subida en el worker | Subida en el hilo principal (GPU) |
|---|---|---|---|---|---|---|---|---|
| Hap1 a 30 | 30,0 | 30,0 | 0 siempre | 10,8 / 12,3 ms | 0,4 / 0,6 | **10,0 / 11,4** | 0,3 / 0,4 | 2,0 / 2,4 |
| Hap1 a 60 | 60,0 | 60,0 | 0 siempre | 10,7 / 12,2 ms | 0,5 / 0,7 | **9,8 / 11,3** | 0,2 / 0,4 | 0,3 / 1,0 |
| HapY a 30 | 30,0 | 30,0 | 0 siempre | 17,9 / 19,6 ms | 0,9 / 1,3 | **15,4 / 17,5** | 0,8 / 1,5 | 0,3 / 2,3 |
| HapY a 60 | 60,2 | 60,0 | 0 siempre | 20,0 / 24,0 ms | 1,1 / 1,9 | **17,2 / 21,3** | 1,0 / 1,7 | 1,0 / 1,4 |

(p50 / p95 en ms; «retraso» = cabezal − fotograma en pantalla, la misma medida de `docs/PROXY-LIVE.md` de VEATION.)
- Página a 60,00 fps en las cuatro; los fotogramas nuevos llegan con huecos de 33,3 ms (a 30) o 16,7 ms (a 60): como
  mucho 33,6 ms a 30 y 17,8 ms a 60.
- En caché, como mucho 6 (a 30) y 10 (a 60) `ImageBitmap`.
- Memoria de vídeo: +0,6 GB (Hap1) y +0,7 GB (HapY) con los 4 workers.
- Ningún error.

**Disco.** La lectura del worker (`fs.readSync`) vino de la caché de Windows, porque los archivos se acababan de escribir.
Sin caché (`FILE_FLAG_NO_BUFFERING`, `disk.ps1`), el NVMe da **3,1 GB/s en bloques de 2,3 MB (0,55 ms p50, 0,61 p95)** y
**4,6 GB/s en bloques de 4,7 MB (1,0 ms p50)**. Casi lo mismo: con un NVMe, el disco no limita.

**Comparación con §3.4.**

| Paso, por fotograma de 7196×912 | Estimado HAP | Medido HAP | Estimado HAP Q | Medido HAP Q |
|---|---|---|---|---|
| Lectura | 1–2 ms | 0,4–0,5 (sin caché: 0,55) | 2–4 ms | 0,9–1,1 (sin caché: 1,0) |
| Snappy en JS | 1,6–3 ms | **9,8–10,0** | 3–6 ms | **15,4–17,6** |
| Subida comprimida en el worker | 2–3 ms | 0,2–0,3 | 4–6 ms | 0,8–1,0 (p95 8,6 dentro de la composición completa) |
| Copia `ImageBitmap` → textura | 0,1 ms | 0,1–2,0 de GPU (según el reloj); 0,0 de CPU | 0,1 ms | 0,1–1,0 de GPU |
| **Total en el worker** | **5–8 ms** | **~11 ms** | **9–16 ms** | **~19–20 ms** |

- **Snappy** cuesta 3–6 veces lo estimado. La estimación escalaba la cifra de VEATION, medida con material de domo donde el
  70 % de los bytes son bloques negros repetidos. Ahí la fusión de rachas convierte miles de copias en unas pocas. Con
  material colorido (y degradados reales) Snappy emite muchas etiquetas cortas y el bucle en JS paga cada una. **Depende
  del material**: con el contenido de verdad puede salir mejor o peor.
- La **subida comprimida** cuesta 10 veces menos de lo estimado. El proceso GPU estaba descargado y 3,3/6,6 MB por fotograma
  caben en sus búferes de transferencia. Dentro de la composición completa, HapY ya enseña algún pico (p95 8,6 ms, máximo
  12,7): es el techo del proceso GPU asomando.
- **Capacidad de los workers.** Una capa HAP a 60 fps ocupa ~0,65 s de worker por segundo y una HAP Q ~1,2 s. **HAP Q a 60
  no cabe en un worker solo** (17 ms > 16,7 ms) y necesita dos alternándose. Con 4 workers caben, por CPU, unas 5 capas
  HAP o 3 HAP Q a 60. No se midieron más de dos capas a la vez.

**Aviso para F6, medido.** El primer intento de la sonda pedía fotogramas sin límite por delante del cabezal (cada worker
libre pedía el siguiente). Resultado en dos segundos: 93–134 fotogramas decodificados por segundo, la memoria de vídeo de
2,4 a **6,9 GB** (de 8 GB, con Unreal al lado) y la página a 12–20 fps. Con la ventana acotada de `driveHAP`
(L + K fotogramas por delante) todo fue como en la tabla. **Esa ventana no es una optimización: sin ella el reproductor se
come la memoria de vídeo.**

---

## 5. Punto 3 — una ventana visible de 3840×2400: Alma liquid + una capa HAP + 4 slices

**¿Una ventana visible más grande que la pantalla recibe `requestAnimationFrame` al ritmo del vsync en Windows? Sí.**
Qué se hizo exactamente:
- Una ventana sin marco de **3840×2400 de contenido**, colocada en (1760, 600) sobre la pantalla externa de 60 Hz, que
  mide 1920×1080. Así sólo se ven 160×480 px en la esquina derecha y no se tapa la pantalla del otro equipo; el resto queda
  fuera.
- `focusable: false` y `showInactive()`, para no quitarle el foco a nadie.
- Windows acepta el tamaño: el área de contenido mide 3840×2400 y `innerWidth`×`innerHeight` = 3840×2400.
- Repintando un lienzo WebGL de 3840×2400 entero en cada fotograma: **60,00 fps, huecos p50 16,7 ms y máximo 16,9 ms**
  durante 4,5 s.
- Por eso no hizo falta medir fuera de pantalla a 3840×2400 ni a tamaño de pantalla.
- Matiz: el DWM sólo compone la parte visible. En el servidor la ventana cubrirá entera la pantalla del Fx4 (sin bordes,
  quizá con *independent flip*), que no debería ser peor.

**Montaje de la composición** (`composite.js`, una página = una ventana de salida, como §4.5):
1. En cada fotograma de la experiencia (`__vtLayerFrame`): la copia de su lienzo a una textura (§3).
2. El reproductor HAP da su fotograma y se sube con `texSubImage2D(ImageBitmap)`.
3. FBO de contenido 7196×912: la experiencia (sin mezcla) y encima el clip con mezcla normal premultiplicada al 60 %.
   Con dos clips, el segundo encima al 50 %.
4. Salida 3840×2400: negro y los 4 slices del Fx4 (x = 0/1912/3604/5524, anchos 1912/1692/1920/1672, alto 912), uno por
   cuadrante de 1920×1200, a 1:1 y centrados.

Hap1 a 60 fps con el archivo de §4.

| Pasada | Renderer de la experiencia | Clips | Reloj del clip | Unreal | Composición | Huecos p50 / p95 / p99 / máx | > 18 ms | Clips nuevos/s, retraso |
|---|---|---|---|---|---|---|---|---|
| `comp-vis-webgpu` | WebGPU | 1 Hap1 | `now` | reposo | **60,00 fps** | 16,7 / 16,8 / 16,9 / 17,0 | 0 de 1079 | 60/s, 0 |
| `comp-vis-webgl2` | WebGL2 | 1 Hap1 | `now` | reposo | **60,00 fps** | 16,7 / 16,8 / 16,9 / 17,1 | 0 de 1079 | 60/s, 0 |
| `comp-vis-webgpu-fade` | WebGPU | 2 Hap1 (2+2 workers) | `now` | activo | **60,00 fps** | 16,7 / 16,8 / 16,9 / 17,2 | 0 de 1079 | **58,5/s** y 60/s, 0 |
| `comp-vis-webgpu-fade-vsync` | WebGPU | 2 Hap1 | `vsync` | activo | **60,00 fps** | 16,7 / 16,8 / 17,0 / 17,4 | 0 de 1080 | **44/s** y 44/s, 0 |
| `comp-vis-webgpu-fade-frame` | WebGPU | 2 Hap1 | `frame` | activo | **60,00 fps** | 16,7 / 16,8 / 16,9 / 17,2 | 0 de 1079 | **60,0/s** y **60,0/s**, 0 |
| `comp-vis-webgpu-hapy` | WebGPU | 1 HapY | `frame` | activo a ratos | **60,00 fps** | 16,7 / 16,9 / 17,0 / 17,2 | 0 de 1079 | 60,0/s, 0 |

Tiempos de GPU por paso (p50 / p95, ms) y uso:

| Pasada | Copia experiencia | Subida clip(s) | FBO: experiencia | FBO: clip(s) | 4 slices | CPU del paso completo | GPU media (máx), reloj | Memoria de vídeo máx. (+ sobre la de antes) |
|---|---|---|---|---|---|---|---|---|
| `comp-vis-webgpu` | 2,43 / 2,84 | 0,17 / 0,19 | 0,54 / 0,59 | 0,17 / 0,19 | 0,17 / 0,51 | 0,1 / 0,2 | 36,7 % (40), 910 MHz | 3,61 GB (+1,23) |
| `comp-vis-webgl2` | 0,23 / 0,26 | 0,23 / 0,26 | 0,25 / 0,28 | 0,23 / 0,25 | 0,24 / 0,27 | 0,1 / 0,2 | 34,1 % (53), 667 MHz | 3,61 GB (+1,24) |
| `comp-vis-webgpu-fade` | 0,88 / 1,70 | 0,10 + 0,09 | 0,12 / 1,07 | 0,31 + 0,09 | 0,08 / 0,08 | 0,1 / 0,2 | 38,6 % (40), 1,79 GHz P0 | 3,93 GB (+1,53) |
| `comp-vis-webgpu-fade-frame` | 0,69 / 2,23 | 0,10 + 0,09 | 0,11 / 0,41 | 0,29 + 0,09 | 0,08 / 0,09 | 0,1 / 0,2 | 36,9 % (45), 1,81 GHz P0 | 3,97 GB (+1,67) |
| `comp-vis-webgpu-hapy` | 1,49 / 2,99 | 0,11 / 0,36 | 0,13 / 0,14 | 0,35 / 1,30 | 0,10 / 0,12 | 0,1 / 0,2 | 38,0 % (41), 1,47 GHz P0 | 3,56 GB (+1,26) |

- **El mezclador entero cuesta 1,2–3,5 ms de GPU por fotograma**, la mayor parte en la copia WebGPU; con WebGL2, 1,2 ms.
  Componer y recortar slices es barato, como predecía §3.4. La experiencia sigue siendo lo caro, y aun con ella y Unreal la
  GPU no pasó del 53 %.
- Latencia de los clips: Hap1 10,4–11,4 ms p50 (p95 11,5–13,1); HapY 20,5 ms (p95 27,6). Siempre con retraso 0.
- Las pasadas con reloj `now` (aquí y en §6) contaban los clips durante 0,2 s de más: los tomaba después de cerrar la
  medida. Sus cifras de clips ya están corregidas en las tablas. La sonda del anexo ya no tiene ese fallo.

**El reloj del clip (importa para F6).** Se probaron tres orígenes para el cabezal del clip, con el mismo fundido de dos
capas:
- `now`: `performance.now()` en el momento de componer, que va detrás del dibujo de la experiencia y tiembla con él. Una
  capa salió a 58,5 fotogramas nuevos por segundo, con saltos y repeticiones; la otra, a 60. Depende de dónde caiga la
  frontera entre fotogramas del clip respecto al vsync.
- `frame`: el instante de `requestAnimationFrame` del fotograma que se compone, que el runtime pasa en
  `__vtLayerFrame(canvas, t)`, con el arranque del clip a medio fotograma de los vsync. Las dos capas, **60,0/s exactos**,
  con huecos de 16,7 ms (máximo 17,1) y ningún salto.
- `vsync`: el último instante de `requestAnimationFrame` de la propia página. En esa pasada salió a 44/s, con un 26 % de
  fotogramas repetidos. En la pasada `frame` se comprobó que ese instante coincide con el del fotograma de la experiencia
  en los 1080 casos (la página corre su `requestAnimationFrame` antes que el iframe, en el mismo fotograma), así que **no
  se encontró la causa** en el tiempo de F0.

La conclusión práctica está en §8.2 (punto 2) y §8.3 (punto 3).

---

## 6. Punto 4 — la misma composición fuera de pantalla hacia Spout (el camino actual)

**Montaje.**
- Como `app/main.js` › `applyOutputWindow`: ventana fuera de pantalla de 7196×912, `offscreen: { useSharedTexture: true }`,
  `setFrameRate(60)`.
- En cada `paint`, el proceso principal pasa el handle NT de la textura compartida a `sendShared` del addon del repo
  (`native/spout-send/dsp_spout.node`) con un emisor «VT F0 probe <pid>», mide la llamada y suelta la textura.
- `spout-dom` es la página de hoy (el iframe solo, compuesto por Chromium, sin mezclador).
- Las otras dos llevan el mezclador con la experiencia y un clip Hap1 a 60, con el FBO 1:1 en un lienzo de 7196×912.

| Pasada | Unreal | Composición en la página | Fotogramas al emisor | Huecos entre `paint` (proceso principal) p50 / p95 / p99 / máx | `sendShared` p50 / p95 | Copia experiencia (GPU) | GPU media (máx), reloj | Memoria de vídeo máx. (+) |
|---|---|---|---|---|---|---|---|---|
| `spout-dom-webgpu` (hoy) | reposo | 60,00 fps (iframe; máx 18,6 ms) | 59,99/s | 16,6 / 19,1 / 20,6 / 26,4 | 0,17 / 0,24 ms | — | 32,1 % (52), 773 MHz | 2,80 GB (+0,42) |
| `spout-mixer-webgpu` | reposo | 60,00 fps (máx 18,2 ms) | 59,99/s | 16,7 / 19,7 / 21,1 / 25,4 | 0,18 / 0,26 ms | 1,76 / 1,93 | 35,8 % (42), 954 MHz | 3,67 GB (+1,29) |
| `spout-mixer-webgl2` | activo (36 %) | 60,00 fps (máx 19,6 ms) | 60,01/s | 16,6 / 19,0 / 20,3 / 22,8 | 0,22 / 0,32 ms | 0,12 / 0,46 | 37,5 % (45), 1,28 GHz P0 | 3,71 GB (+1,33) |

- Se envían **7196×912 BGRA** a 60/s en las tres. Falló un `sendShared` por pasada (error −2), de unos 1290. No se leyó
  la imagen con un receptor: eso ya lo comprueba `tests/spout.test.mjs`.
- La cadencia fuera de pantalla es algo más irregular que en la ventana visible: la marca un temporizador
  (`setFrameRate`), no el vsync, y los huecos entre `paint` llevan además el viaje IPC al proceso principal. **Pasa igual
  con la página de hoy**: el mezclador no la empeora.
- El clip HAP, a 60/s con retraso 0 en las dos pasadas con mezclador.

---

## 7. Estado de la máquina en cada pasada

`nvidia-smi` antes de lanzar y después de que el proceso saliera; «durante» = media (máximo) de las muestras cada 500 ms
dentro de la pasada. Memoria de vídeo usada de 8188 MiB.

| Hora | Pasada | Antes: memoria, uso | Durante: uso medio (máx), reloj medio, memoria máx. | Después: memoria, uso |
|---|---|---|---|---|
| 01:37 | `env-visible-3840` | 2505 MiB, 4 % | 10 % (14), 820 MHz, 2785 MiB | 2581 MiB, 4 % |
| 01:40 | `copy-webgpu` | 2580 MiB, 5 % | 32 % (44), 769 MHz, 3053 MiB | 2579 MiB, 3 % |
| 01:40 | `copy-webgl2` | 2580 MiB, 3 % | 31 % (59), 554 MHz, 3111 MiB | 2579 MiB, 3 % |
| 01:43 | `hap-hap1` | 2380 MiB, 3 % | 15 % (28), 779 MHz, 2978 MiB | 2379 MiB, 1 % |
| 01:43 | `hap-hapy` | 2380 MiB, 5 % | 23 % (72), 794 MHz, 3106 MiB | 2390 MiB, 6 % |
| 01:45 | `comp-vis-webgpu` | 2379 MiB, 4 % | 35 % (40), 1010 MHz, 3613 MiB | 2384 MiB, 3 % |
| 01:45 | `comp-vis-webgl2` | 2380 MiB, 2 % | 33 % (53), 770 MHz, 3616 MiB | 2377 MiB, 4 % |
| 01:46 | `spout-mixer-webgpu` | 2380 MiB, 3 % | 35 % (42), 1018 MHz, 3672 MiB | 2378 MiB, 9 % |
| 01:46 | `spout-dom-webgpu` | 2380 MiB, 1 % | 31 % (52), 835 MHz, 2802 MiB | 2377 MiB, 24 % |
| 01:47 | `spout-mixer-webgl2` | 2380 MiB, **36 %** | 37 % (45), 1323 MHz, 3705 MiB | 2394 MiB, 22 % |
| 01:48 | `comp-vis-webgpu-fade` | 2396 MiB, **41 %** | 38 % (40), 1828 MHz, 3926 MiB | 2396 MiB, 18 % |
| 01:49 | `comp-vis-webgpu-fade-vsync` | 2509 MiB, **40 %** | 37 % (41), 1880 MHz, 4009 MiB | 2523 MiB, 18 % |
| 01:50 | `comp-vis-webgpu-fade-frame` | 2298 MiB, **39 %** | 37 % (45), 1859 MHz, 3966 MiB | 2296 MiB, 21 % |
| 01:52 | `comp-vis-webgpu-hapy` | 2299 MiB, 2 % | 37 % (41), 1553 MHz, 3555 MiB | 2232 MiB, 22 % |

- Entre 2,2 y 2,6 GB de memoria y el uso de «antes» son de Unreal; los 18–24 % de «después» con nuestra sonda ya cerrada
  también son suyos.
- En las pasadas de la tabla, la memoria de vídeo total (Unreal incluido) no pasó de 4,0 GB de 8. La excepción fue el
  primer intento HAP sin ventana acotada (6,9 GB, §4), que no está en la tabla: se repitió corregido con el mismo nombre.
- Unreal siguió abierto y respondiendo al terminar.

---

## 8. Decisión y lo que cambia para F5 y F6

### 8.1 La decisión: (a)

| Opción | Condición del plan | Lo medido | |
|---|---|---|---|
| **(a) mezclador como en §4.5** | la copia WebGPU cuesta ≤ 3 ms y la ventana visible aguanta | copia 0,3–2,4 ms p50 en la composición real (~1 ms de trabajo); 60,00 fps sin huecos en todas las pasadas | **elegida** |
| (b) fijar `webgl2` en Alma liquid con mezclador | la copia WebGPU cuesta > 3 ms | sólo en la prueba aislada con la GPU al mínimo (3,6 ms p50), y sin perder fotogramas | queda como palanca |
| (c) plan B (R2) | la ventana visible de 3840×2400 no mantiene 60 fps | la mantiene con experiencia + 1 o 2 clips + slices, con Unreal compartiendo la GPU | no hace falta |

**Por qué (a) y no (b).** Con WebGL2 la copia cuesta 10 veces menos, pero lo que se ahorra es sobre todo espera, que no ocupa
la GPU ni costó un solo fotograma. Además no se aisló lo que cuesta *la propia experiencia* en cada renderer: el uso de la
GPU con la experiencia sola salió igual dentro del ruido (25,7 % con WebGPU, 24,8 % con WebGL2, a relojes distintos).
Fijar el renderer cambia la pieza por una ganancia que aquí no se ve.

**(b) queda como palanca barata.** El parámetro `renderer` ya existe en el manifiesto, las dos versiones dibujan lo mismo
(prueba de `tests/alma-fluid.test.mjs`) y cambiarlo recarga la página. Si en el servidor la estadística del mezclador
(§8.2) enseña la copia por encima de 3 ms p95 **y** fotogramas perdidos, se fija `webgl2` cuando hay mezclador.

**R1 y R2.** No se materializan en esta máquina: R1 (copia cara) queda en ~1 ms de trabajo más espera; R2 (ventana
visible), en 60,00 fps. Hay que confirmarlo en el servidor de XR Lab (§10).

### 8.2 F5 — el mezclador

1. **Componer dentro de `__vtLayerFrame`, no en el `requestAnimationFrame` de la página.**
   - Medido: la página corre su `requestAnimationFrame` *antes* que el del iframe, en el mismo fotograma (1080 de 1080).
     Si el mezclador compusiera en el suyo, enseñaría siempre el fotograma anterior de la experiencia.
   - Su `requestAnimationFrame` queda para cuando no hay experiencia, o cuando ésta lleva más de 2 fotogramas sin llamar.
2. **`frameOut` en modo capa pasa también el instante del fotograma**: `parent.__vtLayerFrame(canvas, t)`, con `t` el de
   `requestAnimationFrame` del runtime. El mezclador y el reloj de los clips usan ese instante (§8.3). La sonda lo hace
   así.
3. **La copia, directa:** `texSubImage2D(canvas)` sobre una textura `texStorage2D(RGBA8)` de 7196×912, sin
   `UNPACK_FLIP_Y_WEBGL`. El volteo va en las coordenadas del sombreador. Ni `createImageBitmap` (no gana y añade un salto
   de tarea) ni nada que haga esperar a la CPU (`readPixels` = 4–12 ms de espera). `gl.finish()` no sirve para sincronizar
   ni para medir: en Chromium no bloquea. **No se midió** la copia con `UNPACK_FLIP_Y_WEBGL`.
4. **Estadísticas del mezclador con las consultas de tiempo de GPU** (`EXT_disjoint_timer_query_webgl2` está disponible):
   ms de GPU por paso (copia, subidas, composición, slices) y cadencia de composición, en `window.__out.stats` y en el
   informe de salud. Es lo que dirá en el servidor si hace falta la palanca (b).
5. **Corregir el presupuesto de memoria de §3.4.** Experiencia + mezclador + 1 capa = +1,2–1,3 GB sobre la máquina en
   reposo; cada capa más, +0,4 GB; la página de hoy, +0,4 GB. Lo estimado eran < 0,6 GB con dos capas. Entran: texturas de
   7196×912 para la experiencia, cada clip y el FBO; el lienzo de 3840×2400; el lienzo de la experiencia y su simulación; y
   los contextos de los 4 workers.

### 8.3 F6 — el reproductor HAP

1. **Portar la ventana de petición acotada de `driveHAP`, literal, con su prueba.**
   - L = ⌈latencia·fps⌉ (≤ 12) y K = máx(2, mín(8, ⌈fps·0,12⌉ + 1)).
   - La prueba: la caché nunca pasa de L + K + nº de workers `ImageBitmap`.
   - *Sabe fallar*: sin la ventana, la caché crece sin límite (medido: 6,9 GB en 2 s).
2. **Presupuesto de CPU real:** ~11 ms por fotograma HAP y ~20 ms por HAP Q a 7196×912 en este i9. Con `hapNW()` = 4 vale
   para el caso de XR Lab (1–2 capas).
   - HAP Q a 60 necesita **dos workers por capa**: el reparto por coste (`hapReparto`) tiene que poder darle dos.
   - Como Snappy depende del material, la importación debería decodificar un fotograma del clip en Node y avisar si pasa
     de ~14 ms (HAP) o ~28 ms (HAP Q) por fotograma: sería no caber a 60 con margen. En Node la cifra es la misma que en el
     worker: 10 ms medidos para este Hap1.
3. **El reloj del clip.**
   - El cabezal sale del instante del fotograma que se compone (punto 2 de §8.2) y el arranque del clip se coloca a medio
     fotograma de los vsync. Así salió 60,0/60,0 sin saltos.
   - Con `performance.now()` en el momento de componer hubo saltos (58,5/s), y la variante con el instante de la propia
     página dio 44/s sin causa encontrada. Por eso, además: **cuando la velocidad del clip y la de la salida coinciden
     (±0,5 %), avanzar exactamente un fotograma del clip por fotograma de salida** y corregir poco a poco la deriva
     respecto al reloj del motor (D5), en lugar de redondear un reloj continuo en cada fotograma.
   - Prueba que **cuente fotogramas repetidos y saltados por segundo** en un clip de 60 sobre una salida de 60. *Falla si*
     el cabezal se calcula con `performance.now()` a la hora de componer.
4. **HAP Q en fundido no está medido.** La subida comprimida de HapY dentro de la composición completa ya da picos (p95
   8,6 ms, máximo 12,7). Dos capas HAP Q a 60 pueden tocar el techo del proceso GPU. R3 sigue abierto para ese caso: la
   recomendación de entregar en HAP se mantiene.
5. **Disco:** con NVMe no limita (0,55 ms por fotograma HAP sin caché). Un SATA (~0,5 GB/s) tardaría ~4,6 ms por fotograma
   HAP y ~9,5 ms por HAP Q: una capa vale, pero dos HAP Q a 60 (≈ 570 MB/s) no. La recomendación de SSD de §3.4 sigue.

### 8.4 Correcciones a §3.4 del plan

- **Decodificación y subida.** Total por fotograma en el worker: **HAP ~11 ms, HAP Q ~19–20 ms** (estimado 5–8 y 9–16).
  Snappy 9,8–10 ms y 15,4–17,6 ms con material de 2,8 y 5,8 bits/px. Subida comprimida 0,2–1 ms. Lectura 0,4–1,1 ms.
- **Memoria de vídeo:** +1,2–1,3 GB con experiencia + mezclador + 1 capa, +0,4 GB por capa más.
- **Composición:** el mezclador entero, 1–3,5 ms de GPU por fotograma en una RTX 4060 de portátil compartida.

---

## 9. Qué no se midió

- **El servidor de XR Lab** (§10): todo lo de aquí es el portátil.
- **Pasadas de 60 s**: el límite de este encargo era de 30 s por pasada (18 s de medida). Para huecos raros (uno cada
  minuto) hace falta más tiempo: en el servidor se puede alargar con `measure=` en la URL de la sonda.
- **La ventana fuera de pantalla de 3840×2400** (plan B): no hizo falta, porque la visible funciona.
- **Una pantalla de 120 Hz**: todo fue a 60 Hz. A 120 Hz el runtime deja la experiencia en 60, y el mezclador, si compone
  en `__vtLayerFrame`, también.
- **Dos capas HAP Q** a la vez; más de dos capas de cualquier tipo.
- **Material real**: los HAP son sintéticos, aunque calibrados a los bits/px del «material real» del plan.
- **El coste de la propia experiencia en GPU** con cada renderer: sólo el uso total de la GPU.
- **La copia con `UNPACK_FLIP_Y_WEBGL`**.
- **Lectura sin caché *durante* la reproducción**: se midió el disco aparte.

---

## 10. Repetirlo en el servidor de XR Lab

La sonda entera está en el anexo A y se extrae de este documento. No toca el repo: corre en una carpeta aparte y sólo
lee `experiences/alma-fluid`, `native/spout-send/dsp_spout.node` y el Electron de `node_modules`.

**Requisitos:**
- Windows con GPU NVIDIA (`nvidia-smi` en el PATH).
- Node ≥ 20 en el PATH. Lo usan el generador de HAP y el resumen.
- El repo con `npm install` hecho (Electron 44.7.0 en `node_modules`).
- 1,3 GB libres en el disco de la carpeta de la sonda.
- **VEATION Touch cerrado** (ni `npm start` ni el motor): la GPU tiene que ser sólo de la sonda.
- **Las pasadas visibles ponen imágenes de prueba en la pantalla que se elija durante ~4 min.** Si es la del Fx4, salen
  por los proyectores: hacerlo con la sala vacía.

**Pasos** (PowerShell):
1. Copiar el bloque `extract.cjs` del anexo A en un archivo y extraer la sonda en una carpeta fuera del repo:
   `node extract.cjs <repo>\docs\plans\MEDIA-SERVER-MEDIDAS.md $env:TEMP\vt-f0` (escribe 15 archivos).
2. Ver las pantallas:
   `powershell -ExecutionPolicy Bypass -File $env:TEMP\vt-f0\run-all.ps1 -Repo <repo> -List`.
   Abre unos 6 s una ventana pequeña de 400×300 en (0, 0) e imprime las pantallas con su `bounds`, escala y frecuencia.
3. Elegir la de 3840×2400 (la entrada del Fx4) y lanzar la secuencia con su esquina:
   `powershell -ExecutionPolicy Bypass -File $env:TEMP\vt-f0\run-all.ps1 -Repo <repo> -X <bounds.x> -Y <bounds.y>`.
   - Unos 8 minutos: genera los dos HAP (~40 s); hace 12 pasadas de ≤ 30 s, una a una, con 5 s de pausa; mide el disco; y
     borra los HAP al final (`-Keep` para conservarlos).
   - Si la GPU está ocupada (menos de 2 GB libres o más del 80 % de uso), cada pasada se salta sola y lo dice.
   - Si la pantalla elegida tiene escala distinta de 100 %, da igual: la sonda fuerza la escala 1.
4. Devolver `$env:TEMP\vt-f0\results\summary.txt`. Lleva, por pasada, `nvidia-smi` antes, durante y después, y el resumen
   de cifras; los JSON completos están al lado. Con eso se completa este documento con una columna «servidor».

**Qué mirar primero en el resumen:**
- `composite.fps` y `bins` de las pasadas `comp-vis-*`: 60 fps y nada por encima de 18 ms.
- `gpuMs.expCopy` p95: por debajo de 3 ms; si no, palanca (b).
- `hap.shownPerS` = 60 y `delayFrames.max` = 0.
- `paintCadence` de las `spout-*`.

---

## Anexo A. La sonda (código)

Quince archivos. Cada bloque va precedido de un comentario `<!-- f0-file: nombre -->`, que es lo que lee `extract.cjs`.
- `hap-worker.js` es una copia literal del de VEATION (`Immersive Studio Pro`).
- `gen-hap.mjs` lleva copiadas literalmente sus funciones de empaquetado HAP, Snappy y `.mov`, más un codificador DXT en
  CPU propio de la sonda.
- Lo demás es código de la sonda, sólo para medir. No es código de producto ni va en la app.

| Archivo | Qué es |
|---|---|
| `extract.cjs` | extrae estos bloques a una carpeta |
| `run-all.ps1` | la secuencia completa (o `-List` para ver las pantallas) |
| `run.ps1` | una pasada: comprueba la GPU, lanza un Electron, espera, comprueba que no queda nada |
| `probe-main.cjs` | proceso principal de la sonda: servidor local, ventana (visible, fuera de pantalla o hacia Spout), `nvidia-smi`, resultados |
| `probe-preload.cjs` | puente página → proceso principal |
| `probe-runtime.js` | sustituto de `experiences/runtime.js` en modo capa con la sala de XR Lab |
| `lib.js` | estadística, WebGL2 mínimo, consultas de tiempo de GPU y el planificador HAP de `driveHAP` |
| `env.js` | pantallas, GPU y ritmo de `requestAnimationFrame` de la ventana |
| `copy.js` | punto 1 |
| `hap.js` | punto 2 |
| `composite.js` | puntos 3 y 4 |
| `hap-worker.js` | el worker de VEATION, sin cambios |
| `gen-hap.mjs` | genera los HAP sintéticos |
| `disk.ps1` | lectura del disco sin caché |
| `show.cjs` | resume un resultado |

<!-- f0-file: extract.cjs -->
````js
// Extracts the F0 probe from docs/plans/MEDIA-SERVER-MEDIDAS.md into a folder (outside the repo).
// usage: node extract.cjs <path to MEDIA-SERVER-MEDIDAS.md> <output folder>
const fs = require('fs'), path = require('path');
const [doc, out] = process.argv.slice(2);
const md = fs.readFileSync(doc, 'utf8').replace(/\r\n/g, '\n');
const re = /<!-- f0-file: ([\w.-]+) -->\n\x60{4}\w*\n([\s\S]*?)\n\x60{4}\n/g;
fs.mkdirSync(out, { recursive: true });
let m, n = 0;
while ((m = re.exec(md))) { fs.writeFileSync(path.join(out, m[1]), m[2] + '\n'); n++; }
console.log(`${n} files written to ${out}`);
````

<!-- f0-file: run-all.ps1 -->
````powershell
# F0 probe - the whole measurement sequence of docs/plans/MEDIA-SERVER-MEDIDAS.md, one Electron run at a time (<= 30 s each).
#   powershell -ExecutionPolicy Bypass -File run-all.ps1 -Repo <VEATION Touch repo> -List            (displays only)
#   powershell -ExecutionPolicy Bypass -File run-all.ps1 -Repo <repo> -X <x> -Y <y> [-Keep]
# -X/-Y: where the 3840x2400 visible window goes (the top-left of the Fx4 display on the server; on a laptop, a point near
# the right edge of a 60 Hz display so the window is mostly off screen). -Keep keeps the synthetic HAP files (1.3 GB).
param([string]$Repo = (Get-Location).Path, [int]$X = 0, [int]$Y = 0, [switch]$List, [switch]$Keep)
$ErrorActionPreference = 'Continue'
$f0 = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:VT_REPO = $Repo
$run = Join-Path $f0 'run.ps1'
if ($List) {
  & $run env-list env visible 400 300 "--x=$X" "--y=$Y" --max=9000
  node -e "const r=require(process.argv[1]); console.log(JSON.stringify(r.result && r.result.info.displays, null, 1))" (Join-Path $f0 'results\env-list.json')
  exit 0
}
New-Item -ItemType Directory -Force (Join-Path $f0 'media') | Out-Null
$hap1 = Join-Path $f0 'media\synth-hap1.mov'; $hapy = Join-Path $f0 'media\synth-hapy.mov'
Push-Location $f0
if (-not (Test-Path $hap1)) { node gen-hap.mjs hap 180 media/synth-hap1.mov 4 4 0.3 }
if (-not (Test-Path $hapy)) { node gen-hap.mjs hapq 180 media/synth-hapy.mov 4 4 0.3 }
Pop-Location
$vis = @("--x=$X", "--y=$Y", '--max=29500')
$steps = @(
  @('env-visible-3840', 'env', 'visible', 3840, 2400, $vis),
  @('copy-webgpu', 'copy', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgpu'))),
  @('copy-webgl2', 'copy', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgl2'))),
  @('hap-hap1', 'hap', 'visible', 1920, 300, ($vis + @('--q=file=synth-hap1.mov&workers=4'))),
  @('hap-hapy', 'hap', 'visible', 1920, 300, ($vis + @('--q=file=synth-hapy.mov&workers=4'))),
  @('comp-vis-webgpu', 'composite', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgpu&hap=synth-hap1.mov&out=slices&clock=frame'))),
  @('comp-vis-webgl2', 'composite', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgl2&hap=synth-hap1.mov&out=slices&clock=frame'))),
  @('comp-vis-webgpu-fade', 'composite', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgpu&hap=synth-hap1.mov&workers=2&hap2=synth-hap1.mov&workers2=2&out=slices&clock=frame'))),
  @('comp-vis-webgpu-hapy', 'composite', 'visible', 3840, 2400, ($vis + @('--q=renderer=webgpu&hap=synth-hapy.mov&workers=4&out=slices&clock=frame'))),
  @('spout-dom-webgpu', 'composite', 'osr-spout', 7196, 912, @('--max=29500', '--q=renderer=webgpu&hap=none&mixer=0&out=content')),
  @('spout-mixer-webgpu', 'composite', 'osr-spout', 7196, 912, @('--max=29500', '--q=renderer=webgpu&hap=synth-hap1.mov&out=content&clock=frame')),
  @('spout-mixer-webgl2', 'composite', 'osr-spout', 7196, 912, @('--max=29500', '--q=renderer=webgl2&hap=synth-hap1.mov&out=content&clock=frame'))
)
$summary = Join-Path $f0 'results\summary.txt'
"F0 probe on $env:COMPUTERNAME, $(Get-Date -Format s)" | Out-File -Encoding utf8 $summary
(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader) | Out-File -Append -Encoding utf8 $summary
foreach ($s in $steps) {
  $a = @($s[0], $s[1], $s[2], $s[3], $s[4]) + $s[5]
  & $run @a | Tee-Object -Append -FilePath $summary
  node (Join-Path $f0 'show.cjs') $s[0] | Out-File -Append -Encoding utf8 $summary
  Start-Sleep -Seconds 5   # let the GPU settle between runs
}
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $f0 'disk.ps1') $hapy | Tee-Object -Append -FilePath $summary
if (-not $Keep) { Remove-Item -Force $hap1, $hapy -ErrorAction SilentlyContinue; "synthetic HAP files deleted" }
"done: $summary"
````

<!-- f0-file: run.ps1 -->
````powershell
# F0 probe runner: ONE Electron run, hard limit, then a check that none of OUR Electron processes is left.
# usage: powershell -File run.ps1 <run-name> <page> <win> <w> <h> [extra args...]   (repo: $env:VT_REPO, default the current folder)
param([string]$Run, [string]$Page, [string]$Win, [int]$W, [int]$H, [Parameter(ValueFromRemainingArguments=$true)]$Rest)
$f0 = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = if ($env:VT_REPO) { $env:VT_REPO } else { (Get-Location).Path }
$el = Join-Path $repo "node_modules\electron\dist\electron.exe"
$g = (nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits).Split(',') | ForEach-Object { [int]$_.Trim() }
"[$Run] before: VRAM $($g[0]) of $($g[1]) MiB, GPU $($g[2]) %"
# a shared GPU: wait for less than 80 % use and at least 2 GB free (on the 8 GB laptop: 6 GB used at most)
if (($g[1] - $g[0]) -lt 2044 -or $g[2] -gt 80) { "SKIP: the GPU is busy (less than 2 GB free or more than 80 % use)"; exit 2 }
$args2 = @("`"$f0\probe-main.cjs`"", "`"--repo=$repo`"", "--run=$Run", "--page=$Page", "--win=$Win", "--w=$W", "--h=$H") + $Rest
$p = Start-Process -FilePath $el -ArgumentList $args2 -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit(40000)) { "the probe did not exit in 40 s: stopping OUR process tree $($p.Id)"; taskkill /PID $p.Id /T /F | Out-Null }
Start-Sleep -Milliseconds 800
$left = @(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $el })
"[$Run] exit: $($p.HasExited) code $($p.ExitCode); our electron processes left: $($left.Count)"
"[$Run] after: " + (nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits)
````

<!-- f0-file: probe-main.cjs -->
````js
// F0 probe — Electron main script. ONE run per launch, hard-capped, then it exits by itself.
//   electron.exe probe-main.cjs --repo=<VEATION Touch repo> --run=<name> --page=<copy|hap|composite|env> --win=<visible|osr|osr-spout>
//                --w=.. --h=.. [--x=.. --y=..] [--q=<query string>] [--max=<ms>]
// Serves (127.0.0.1, random port): /experiences/runtime.js -> probe-runtime.js (stand-in runtime, same API),
// /experiences/* -> the repo's experiences (the REAL alma-fluid), /probe/* -> this folder.
// Writes results/<run>.json with the page's numbers, the GPU samples (nvidia-smi every 500 ms) and, for osr-spout, the paints.
'use strict';
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const HERE = __dirname;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REPO = arg('repo', process.env.VT_REPO || process.cwd()); // the VEATION Touch repo (its experiences/ and native/)
const RUN = arg('run', 'probe'), PAGE = arg('page', 'env'), WIN = arg('win', 'visible');
const W = +arg('w', 1280), H = +arg('h', 720), MAX = Math.min(30000, +arg('max', 28000)), Q = arg('q', '');
const FPS = +arg('fps', 60);
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });

app.commandLine.appendSwitch('force-device-scale-factor', '1'); // 1 CSS px = 1 device px: sizes are exact
app.disableDomainBlockingFor3DAPIs?.();

const T0 = Date.now();
const gpu = { samples: [], before: null, after: null };
const smi = () => { try { return execFileSync('nvidia-smi', ['--query-gpu=name,memory.used,memory.total,utilization.gpu,clocks.gr,power.draw', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim(); } catch (e) { return String(e.message); } };
gpu.before = smi();
const VRAM_TOTAL = +(gpu.before.split(',')[2] || 8192); // MiB
const VRAM_GUARD = VRAM_TOTAL - 1280;              // the run ends itself if the GPU gets this full (others share it)
const sampler = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,clocks.gr,power.draw,clocks.mem,pstate', '--format=csv,noheader,nounits', '-lms', '500'], { windowsHide: true });
sampler.stdout.on('data', (b) => { for (const l of String(b).split(/\r?\n/)) if (l.trim()) { const [u, m, c, p, mc, ps] = l.split(',').map((s) => s.trim()); gpu.samples.push({ t: Date.now(), util: +u, memMiB: +m, clk: +c, w: +p, mclk: +mc, ps }); if (+m > VRAM_GUARD) finish(null, `VRAM guard: ${m} of ${VRAM_TOTAL} MiB`); } });

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
function resolve(u) {
  const p = decodeURIComponent(new URL(u, 'http://x').pathname);
  if (p === '/experiences/runtime.js') return path.join(HERE, 'probe-runtime.js');
  if (p.startsWith('/experiences/')) return path.join(REPO, p);
  if (p.startsWith('/probe/')) return path.join(HERE, p.slice(7));
  return null;
}
const SHELL = (page) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas,iframe{position:absolute;left:0;top:0;border:0;display:block}</style></head><body><script type="module" src="./${page}.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const shell = /^\/probe\/(\w+)\.html/.exec(req.url);
  if (shell) { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(SHELL(shell[1])); return; }
  const f = resolve(req.url);
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

let win = null, finished = false;
const consoleLines = [];
const paints = { n: 0, t: [], sendMs: [], ok: 0, bad: 0, lastErr: 0, rect: null, fmt: null };
let spout = null;

function finish(result, why) {
  if (finished) return; finished = true;
  try { sampler.kill(); } catch { /* gone */ }
  if (spout) { try { spout.stop(); } catch { /* ignore */ } }
  const gpuAfterWait = () => {
    gpu.after = smi();
    const out = { run: RUN, page: PAGE, win: WIN, size: [W, H], q: Q, why, wallMs: Date.now() - T0, startedAt: T0, gpu, paints: WIN === 'osr-spout' ? summarisePaints() : undefined, result, console: consoleLines.slice(-80) };
    fs.writeFileSync(path.join(HERE, 'results', `${RUN}.json`), JSON.stringify(out, null, 1));
    process.stdout.write(`PROBE-DONE ${RUN} ${why}\n`);
    app.exit(0);
  };
  gpu.featureEnd = app.getGPUFeatureStatus();
  try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
  setTimeout(gpuAfterWait, 1500); // the "after" reading once our windows are gone
}

function summarisePaints() {
  const t = paints.t, gaps = []; for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1]);
  return { n: paints.n, ok: paints.ok, bad: paints.bad, lastErr: paints.lastErr, rect: paints.rect, fmt: paints.fmt, t: t, sendMs: paints.sendMs };
}

ipcMain.on('probe-done', (_e, r) => finish(r, 'done'));
ipcMain.on('probe-log', (_e, s) => consoleLines.push(String(s).slice(0, 400)));
ipcMain.handle('probe-info', async () => ({
  run: RUN, page: PAGE, win: WIN, w: W, h: H, q: Q, max: MAX, t0: T0,
  displays: screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, size: d.size, scaleFactor: d.scaleFactor, displayFrequency: d.displayFrequency, internal: d.internal })),
  gpuFeature: app.getGPUFeatureStatus(),
  gpuInfo: await app.getGPUInfo('basic').catch((e) => String(e)),
  winContent: win && !win.isDestroyed() ? win.getContentBounds() : null,
  electron: process.versions.electron, chrome: process.versions.chrome,
}));
ipcMain.handle('probe-now', () => Date.now());
ipcMain.handle('probe-paints', () => ({ n: paints.n, ok: paints.ok, bad: paints.bad }));

app.whenReady().then(() => {
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const web = { preload: path.join(HERE, 'probe-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, nodeIntegrationInWorker: true, backgroundThrottling: false, zoomFactor: 1, spellcheck: false };
    const common = { frame: false, backgroundColor: '#000000', skipTaskbar: true, autoHideMenuBar: true, useContentSize: true, focusable: false, show: false, enableLargerThanScreen: true };
    if (WIN === 'visible') {
      const x = +arg('x', 0), y = +arg('y', 0);
      win = new BrowserWindow({ ...common, x, y, width: W, height: H, webPreferences: web });
      win.setContentBounds({ x, y, width: W, height: H });
      win.once('ready-to-show', () => { win.showInactive(); win.setContentBounds({ x, y, width: W, height: H }); });
    } else {
      const shared = WIN === 'osr-spout' || arg('shared', '0') === '1';
      win = new BrowserWindow({ ...common, width: W, height: H, webPreferences: { ...web, offscreen: shared ? { useSharedTexture: true } : true } });
      win.webContents.setFrameRate(FPS);
      win.setContentSize(W, H);
      if (WIN === 'osr-spout') {
        spout = require(path.join(REPO, 'native', 'spout-send', 'dsp_spout.node'));
        const started = spout.start(`VT F0 probe ${process.pid}`);
        consoleLines.push(`spout start: ${started}`);
      }
      win.webContents.on('paint', (e) => {
        paints.n++; paints.t.push(performance.timeOrigin + performance.now()); // epoch ms, sub-ms
        const tex = e.texture;
        if (!tex) return;
        try {
          if (spout) {
            const ti = tex.textureInfo || {}; const r = ti.contentRect || ti.visibleRect || { x: 0, y: 0, width: W, height: H };
            paints.rect = r; paints.fmt = ti.pixelFormat;
            const a = performance.now();
            const ok = spout.sendShared(ti.handle?.ntHandle || ti.sharedTextureHandle, r.x | 0, r.y | 0, r.width | 0, r.height | 0);
            paints.sendMs.push(performance.now() - a);
            if (ok) paints.ok++; else { paints.bad++; paints.lastErr = spout.sharedError?.(); }
          }
        } finally { try { tex.release(); } catch { /* released */ } }
      });
    }
    win.webContents.on('console-message', (...a) => { const m = a[0]?.message ?? a[2]; consoleLines.push(`[console] ${String(m).slice(0, 300)}`); });
    win.webContents.on('render-process-gone', (_e, d) => finish(null, `renderer gone: ${d.reason}`));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.loadURL(`http://127.0.0.1:${port}/probe/${PAGE}.html?${Q}`);
    setTimeout(() => finish(null, 'timeout'), MAX);
  });
});
app.on('window-all-closed', () => { /* finish() exits */ });
````

<!-- f0-file: probe-preload.cjs -->
````js
// F0 probe preload: the page reports its numbers to the probe's main process.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('probe', {
  done: (r) => ipcRenderer.send('probe-done', r),
  log: (s) => ipcRenderer.send('probe-log', s),
  info: () => ipcRenderer.invoke('probe-info'),
  now: () => ipcRenderer.invoke('probe-now'),
  paints: () => ipcRenderer.invoke('probe-paints'),
  mediaDir: __dirname.split('\\').join('/') + '/media/',
});
````

<!-- f0-file: probe-runtime.js -->
````js
// F0 probe: stand-in for /experiences/runtime.js in LAYER mode, as the mixer of plan §4.5 would see it.
// Same API shape as the real runtime (connectExperience → vt), the XR Lab room (7196x912, P4 P1 P2 P3, closed loop),
// the XR Lab parameters (quality ultra, logo on P1), three synthetic hands moving on P1/P2/P3.
// The loop is the real runtime's (rAF, a display faster than 60 Hz skips frames); after each frame it calls
// parent.__vtLayerFrame(canvas) IN THE SAME TASK as the draw (§4.5), and records how long each part took.
const q = new URLSearchParams(location.search);

export async function connectExperience() {
  const manifest = await (await fetch(new URL('./manifest.json', location.href))).json();
  const W = 7196, H = 912;
  const walls = [['P4', 0, 1912], ['P1', 1912, 1692], ['P2', 3604, 1920], ['P3', 5524, 1672]].map(([id, x, w]) => ({ id, name: id, rect: { x, y: 0, w, h: H } }));
  const params = {};
  for (const p of manifest.params) params[p.key] = p.default;
  Object.assign(params, { quality: 'ultra', logoWall: 'P1' }, q.has('params') ? JSON.parse(q.get('params')) : {});
  if (q.has('renderer')) params.renderer = q.get('renderer');
  const nh = q.has('hands') ? +q.get('hands') : 3;
  const hands = () => {
    const t = performance.now() / 1000, out = [];
    for (let i = 0; i < nh; i++) { const w = walls[1 + (i % 3)]; out.push({ id: i + 1, stroke: i + 1, wallId: w.id, x: w.rect.x + w.rect.w * (0.5 + 0.32 * Math.cos(t * 0.8 + i)), y: H * (0.5 + 0.3 * Math.sin(t * 1.1 + i * 2)), vx: 0, vy: 0, size: 30, ended: false }); }
    return out;
  };
  const vt = {
    canvas: { width: W, height: H }, scale: 1, size: { width: W, height: H }, walls, closedLoop: true,
    params, sink: 'layer', fit: 'fit', fps: 60, standalone: false, id: 'alma-fluid',
    on() { return () => {}; }, emit() {},
    toPx: (id, xm, ym) => { const w = walls.find((x) => x.id === id) || walls[0]; return [w.rect.x + xm, w.rect.y + ym]; },
    touches: hands, hands,
    loop: (fn, src) => runLoop(vt, fn, src),
    frame: () => {},
  };
  return vt;
}

// what the parent reads: one entry per drawn frame
const S = (window.__probeStats = { t: [], fnMs: [], hookMs: [], renderer: null, started: performance.now() });

function runLoop(vt, fn, src) {
  const isGl = typeof src.drawingBufferWidth === 'number', canvas = isGl ? src.canvas : src;
  S.renderer = isGl ? 'webgl2' : 'webgpu';
  let last = performance.now();
  const every = 1000 / (vt.fps || 60);
  const step = (now) => {
    requestAnimationFrame(step);
    if (now - last < every - 2) return; // a display faster than the target rate (the real runtime's rule)
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const a = performance.now();
    fn(dt);
    const b = performance.now();
    try { window.parent.__vtLayerFrame?.(canvas, now); } catch (e) { S.err = String(e?.message || e); }
    const c = performance.now();
    S.t.push(a); S.fnMs.push(b - a); S.hookMs.push(c - b);
  };
  requestAnimationFrame(step);
}
````

<!-- f0-file: lib.js -->
````js
// F0 probe: shared helpers — statistics, a tiny WebGL2 layer, GPU timer queries, and a HAP source that drives
// VEATION's hap-worker.js exactly as its player does (one request in flight per worker, request window = playhead +
// measured latency, "late but newer is shown", older ones closed).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function pct(arr, p) { if (!arr.length) return null; const s = Float64Array.from(arr).sort(); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(2); }
export function summary(arr) {
  if (!arr.length) return { n: 0 };
  let sum = 0, mx = -Infinity; for (const x of arr) { sum += x; if (x > mx) mx = x; }
  return { n: arr.length, mean: +(sum / arr.length).toFixed(2), p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: +mx.toFixed(2) };
}
export function gapsOf(ts) { const g = []; for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]); return g; }
/** fps over the window and the distribution of the gaps between frames (ms). */
export function cadence(ts) {
  if (ts.length < 2) return { frames: ts.length };
  const g = gapsOf(ts), dur = (ts[ts.length - 1] - ts[0]) / 1000;
  const bins = { 'le18': 0, '18to25': 0, '25to34': 0, '34to50': 0, 'gt50': 0 };
  for (const x of g) { if (x <= 18) bins.le18++; else if (x <= 25) bins['18to25']++; else if (x <= 34) bins['25to34']++; else if (x <= 50) bins['34to50']++; else bins.gt50++; }
  return { frames: ts.length, seconds: +dur.toFixed(2), fps: +((ts.length - 1) / dur).toFixed(2), gap: summary(g), bins };
}
/** indices of the entries of `ts` inside [a, b) */
export const idxIn = (ts, a, b) => { const r = []; for (let i = 0; i < ts.length; i++) if (ts[i] >= a && ts[i] < b) r.push(i); return r; };

// ------------------------------------------------------------------ WebGL2
export const VS = `#version 300 es
uniform vec4 uDst; uniform vec4 uSrc; out vec2 v;
void main(){ vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)); v = mix(uSrc.xy, uSrc.zw, q); gl_Position = vec4(mix(uDst.xy, uDst.zw, q), 0.0, 1.0); }`;
export const FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D s; uniform float uA; out vec4 o; void main(){ o = texture(s, v) * uA; }`;
export function program(gl, vs = VS, fs = FS) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return { p, uDst: gl.getUniformLocation(p, 'uDst'), uSrc: gl.getUniformLocation(p, 'uSrc'), uA: gl.getUniformLocation(p, 'uA'), s: gl.getUniformLocation(p, 's'), vao: gl.createVertexArray() };
}
export function texture(gl, w, h) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
export function target(gl, w, h) { const tex = texture(gl, w, h), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { tex, fb, w, h }; }
/** Draw texture `tex` (source rect in uv) into the bound framebuffer's pixel rect [x,y,w,h] of a (fw x fh) target. */
export function quad(gl, P, tex, src, dst, fw, fh, alpha = 1) {
  gl.useProgram(P.p); gl.bindVertexArray(P.vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.s, 0);
  const [x, y, w, h] = dst; gl.uniform4f(P.uDst, (x / fw) * 2 - 1, (y / fh) * 2 - 1, ((x + w) / fw) * 2 - 1, ((y + h) / fh) * 2 - 1);
  gl.uniform4f(P.uSrc, src[0], src[1], src[2], src[3]); gl.uniform1f(P.uA, alpha);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
export function timers(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [], res = {};
  let open = null;
  return {
    res,
    begin(tag) { if (open) return; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = { q, tag }; },
    end() { if (!open) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); open = null; },
    poll() {
      while (pending.length) {
        const { q, tag } = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        pending.shift(); gl.deleteQuery(q);
        if (!disjoint) (res[tag] ||= []).push(ns / 1e6);
      }
    },
  };
}

// ------------------------------------------------------------------ HAP (VEATION's worker, unchanged)
export class HapSource {
  constructor(path, nWorkers, fps) { this.path = path; this.n = nWorkers; this.fps = fps; this.workers = []; this.cache = new Map(); this.shown = -1; this.lat = 30; this.reqT = new Map(); this.pend = new Set(); this.ventana = 8; this.s = { arrive: [], latency: [], tR: [], tD: [], tU: [], late: 0, errors: [], shownT: [], delay: [], delayT: [], upMs: [] }; }
  async init() {
    const call = (w, m) => new Promise((res) => { w.once = res; w.w.postMessage(m); });
    for (let i = 0; i < this.n; i++) {
      const w = { w: new Worker('/probe/hap-worker.js'), busy: false, i, once: null };
      w.w.onmessage = (e) => { if (w.once) { const f = w.once; w.once = null; f(e.data); } else this.onFrame(w, e.data); };
      w.w.onerror = (e) => this.s.errors.push(String(e.message || e));
      this.workers.push(w);
    }
    this.initReplies = await Promise.all(this.workers.map((w, i) => call(w, { t: 'init', req: -1 - i })));
    const info = await call(this.workers[0], { t: 'info', req: -100, path: this.path });
    if (info.t !== 'info') throw new Error(`hap info: ${info.msg}`);
    this.ix = info.ix;
    return this;
  }
  start(now, fps = this.fps) { this.fps = fps; this.t0 = now; this.shown = -1; for (const [, c] of this.cache) c.bm.close(); this.cache.clear(); this.lastHead = -1; }
  head(now) { return Math.floor(((now - this.t0) / 1000) * this.fps); }
  pump(now) {
    if (this.t0 == null) return;
    // VEATION's driveHAP window: K frames ahead, starting at playhead + L (the frames the playhead moves while one arrives)
    const head = this.head(now), fps = this.fps;
    const K = Math.max(2, Math.min(8, Math.ceil(fps * 0.12) + 1));
    const L = Math.min(12, Math.ceil((this.lat * fps) / 1000));
    this.ventana = L + K;
    for (const w of this.workers) {
      if (w.busy) continue;
      let pick = null;
      for (let k = 0; k <= K; k++) { const j = head + L + k; if (!this.cache.has(j) && !this.pend.has(j) && j > this.shown) { pick = j; break; } }
      if (pick == null) break;
      this.pend.add(pick); w.busy = true; this.reqT.set(pick, performance.now());
      w.w.postMessage({ t: 'frame', req: pick, path: this.path, idx: pick % this.ix.count });
    }
  }
  onFrame(w, m) {
    w.busy = false;
    const now = performance.now();
    if (m.t === 'frame') {
      const t = this.reqT.get(m.req); this.reqT.delete(m.req); this.pend.delete(m.req);
      const L = now - t; this.s.latency.push(L); this.lat += (L - this.lat) * 0.2;
      this.s.arrive.push(now); this.s.tR.push(m.tR); this.s.tD.push(m.tD); this.s.tU.push(m.tU);
      if (m.req <= this.shown) { m.bm.close(); this.s.late++; }
      else if (m.req - this.head(now) > this.ventana) { m.bm.close(); this.s.outside = (this.s.outside || 0) + 1; } // not this trajectory's
      else this.cache.set(m.req, { bm: m.bm, num: m.req });
    } else if (m.t === 'err') { this.s.errors.push(m.msg); this.pend.delete(m.req); }
    this.pump(now);
  }
  /** The frame to show now: the newest cached one at or before the playhead (null = keep the last). Records the delay. */
  take(now) {
    const head = this.head(now);
    let best = null;
    for (const [k, c] of this.cache) if (k <= head && (!best || k > best.num)) best = c;
    if (best && best.num > this.shown) {
      for (const [k, c] of this.cache) if (k <= best.num) { if (c !== best) c.bm.close(); this.cache.delete(k); }
      this.shown = best.num; this.s.shownT.push(now);
    } else best = null;
    if (head !== this.lastHead) { this.lastHead = head; if (this.shown >= 0) { this.s.delay.push(head - this.shown); this.s.delayT.push(now); } }
    this.pump(now);
    return best;
  }
  upload(gl, tex, c) {
    const a = performance.now();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, c.bm);
    c.bm.close();
    this.s.upMs.push(performance.now() - a);
  }
  close() { for (const w of this.workers) w.w.terminate(); for (const [, c] of this.cache) c.bm.close(); this.cache.clear(); }
}
````

<!-- f0-file: env.js -->
````js
// F0 probe: the machine — displays, GPU, WebGPU adapter, timer queries — and whether THIS window gets vsync rAF
// while it repaints its whole canvas every frame (a window larger than the screen, mostly off it).
import { cadence, sleep } from './lib.js';
const info = await window.probe.info();
const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; document.body.append(c);
const gl = c.getContext('webgl2', { alpha: false, antialias: false });
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const out = { info, inner: [innerWidth, innerHeight], dpr: devicePixelRatio, visibility: document.visibilityState,
  webgl: { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'), s3tc: !!gl.getExtension('WEBGL_compressed_texture_s3tc'), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) } };
try { const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }); out.webgpu = a ? { info: a.info ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description } : null, maxTex: a.limits.maxTextureDimension2D, preferred: navigator.gpu.getPreferredCanvasFormat() } : null; } catch (e) { out.webgpu = String(e); }
const ts = []; let k = 0;
const f = (t) => { ts.push(t); k++; gl.clearColor((k % 60) / 60, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT); if (ts.length < 2000) requestAnimationFrame(f); };
requestAnimationFrame(f);
await sleep(5000);
out.raf = cadence(ts.slice(30));
out.canvas = [c.width, c.height, gl.drawingBufferWidth, gl.drawingBufferHeight];
window.probe.done(out);
````

<!-- f0-file: copy.js -->
````js
// F0 probe 1: the cost of copying the experience's canvas (the REAL Alma liquid, 7196x912, XR Lab settings) into a
// WebGL2 texture of the parent page, in the same task as the draw (plan §4.5: parent.__vtLayerFrame(canvas) →
// texSubImage2D(canvas)). ?renderer=webgpu|webgl2. Phases (one page, one run):
//   none   — the experience alone (the hook does nothing)
//   copy   — texSubImage2D(canvas) every frame + a small draw of the texture (GPU timer queries around both)
//   detail — GPU timers on: the copy, a SECOND copy of the same (now ready) canvas, and a plain GL quad copy of 7196x912
//   sync   — the copy followed by a 1-pixel readPixels (Chromium's gl.finish() does not block): the CPU waits for it
//   bitmap — createImageBitmap(canvas) → texSubImage2D(bitmap) (the viewer's path), for comparison
import { cadence, summary, sleep, program, texture, target, quad, timers, idxIn } from './lib.js';

const q = new URLSearchParams(location.search);
const R = q.get('renderer') || 'webgpu', W = 7196, H = 912;
const DUR = { warm: +(q.get('warm') || 3000), none: +(q.get('none') || 5000), copy: +(q.get('copy') || 5000), detail: +(q.get('detail') || 3000), sync: +(q.get('sync') || 3000), bitmap: +(q.get('bitmap') || 3000) };

const ifr = document.createElement('iframe');
ifr.style.width = `${W}px`; ifr.style.height = `${H}px`; ifr.style.zIndex = '1';
ifr.src = `/experiences/alma-fluid/index.html?renderer=${R}&hands=${q.get('hands') || 3}`;
document.body.append(ifr);
const mix = document.createElement('canvas');
mix.width = 1920; mix.height = 243; mix.style.width = '1920px'; mix.style.height = '243px'; mix.style.zIndex = '2';
document.body.append(mix);
const gl = mix.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
const P = program(gl), T = timers(gl);
const tex = texture(gl, W, H), texB = texture(gl, W, H);

const fbA = target(gl, W, H), fbB = target(gl, W, H), px1 = new Uint8Array(4);
const read1 = (fb) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fb); gl.readPixels(W - 1, H - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };

const rafT = []; (function f(t) { rafT.push(t); requestAnimationFrame(f); })(performance.now());

let phase = 'boot';
const rec = { copyCall: [], drawCall: [], syncWaitCopy: [], syncCopy: [], syncRtt: [], bmResolve: [], bmUpload: [], bmErr: 0, phaseT: {}, phaseEpoch: {} };
const copy = (t, canvas) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas); };
const show = (t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, mix.width, mix.height); quad(gl, P, t, [0, 0, 1, 1], [0, 0, mix.width, mix.height], mix.width, mix.height); };

window.__vtLayerFrame = (canvas) => {
  if (phase === 'copy') {
    T?.poll();
    const a = performance.now();
    T?.begin('copy'); copy(tex, canvas); T?.end();
    const b = performance.now();
    T?.begin('draw'); show(tex); T?.end();
    rec.copyCall.push(b - a); rec.drawCall.push(performance.now() - b);
  } else if (phase === 'detail') {
    T?.poll();
    T?.begin('d_copy1'); copy(tex, canvas); T?.end();
    T?.begin('d_copy2'); copy(texB, canvas); T?.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA.fb); gl.viewport(0, 0, W, H);
    T?.begin('d_quad'); quad(gl, P, texB, [0, 0, 1, 1], [0, 0, W, H], W, H); T?.end();
    show(tex);
  } else if (phase === 'sync') {
    // copy into the texture of an FBO, then read 1 px of it: the CPU waits until the GPU did the copy
    const a = performance.now();
    copy(fbA.tex, canvas); read1(fbA);
    const b = performance.now();
    copy(fbB.tex, canvas); read1(fbB);
    const c = performance.now();
    read1(fbB);
    const d = performance.now();
    rec.syncWaitCopy.push(b - a); rec.syncCopy.push(c - b); rec.syncRtt.push(d - c);
    show(fbA.tex);
  } else if (phase === 'bitmap') {
    const a = performance.now();
    createImageBitmap(canvas).then((bm) => {
      const b = performance.now();
      T?.poll(); T?.begin('bmUp'); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bm); T?.end(); bm.close();
      rec.bmResolve.push(b - a); rec.bmUpload.push(performance.now() - b);
      show(tex);
    }).catch(() => { rec.bmErr++; });
  }
};

const S = () => ifr.contentWindow?.__probeStats;
const hooks = () => ifr.contentWindow?.__almaFluid;
const t0 = performance.now();
while (!(S()?.t?.length > 20) && performance.now() - t0 < 12000) await sleep(100);
const boot = { ms: performance.now() - t0, renderer: S()?.renderer, almaRenderer: hooks()?.renderer, err: S()?.err || null };
await sleep(DUR.warm);
for (const ph of ['none', 'copy', 'detail', 'sync', 'bitmap']) {
  phase = ph; rec.phaseT[ph] = [performance.now()]; rec.phaseEpoch[ph] = [Date.now()];
  await sleep(DUR[ph]);
  rec.phaseT[ph].push(performance.now()); rec.phaseEpoch[ph].push(Date.now());
}
phase = 'end';
await sleep(300); T?.poll();

// the iframe's clock is its own performance.now (same origin, but another document: time origins differ) —
// convert with the two documents' timeOrigin
const st = S(), off = ifr.contentWindow.performance.timeOrigin - performance.timeOrigin;
const et = st.t.map((x) => x + off);
const out = { renderer: R, boot, timerQuery: !!T, phases: {} };
for (const ph of ['none', 'copy', 'detail', 'sync', 'bitmap']) {
  const [a, b] = rec.phaseT[ph], ix = idxIn(et, a + 500, b); // the first 0.5 s of a phase is left out (transition)
  out.phases[ph] = {
    epoch: rec.phaseEpoch[ph],
    experience: cadence(ix.map((i) => et[i])),
    expFnMs: summary(ix.map((i) => st.fnMs[i])),
    expHookMs: summary(ix.map((i) => st.hookMs[i])),
    parentRaf: cadence(rafT.filter((t) => t >= a + 500 && t < b)),
  };
}
out.copy = { callMs: summary(rec.copyCall), drawCallMs: summary(rec.drawCall), gpuCopyMs: summary(T?.res.copy || []), gpuDrawMs: summary(T?.res.draw || []) };
out.detail = { gpuCopy1Ms: summary(T?.res.d_copy1 || []), gpuCopy2Ms: summary(T?.res.d_copy2 || []), gpuQuad7196Ms: summary(T?.res.d_quad || []) };
out.sync = { waitPlusCopyMs: summary(rec.syncWaitCopy), copyReadyMs: summary(rec.syncCopy), finishRoundTripMs: summary(rec.syncRtt) };
out.bitmap = { resolveMs: summary(rec.bmResolve), uploadCallMs: summary(rec.bmUpload), gpuUploadMs: summary(T?.res.bmUp || []), errors: rec.bmErr };
// sanity: the copied texture is not empty (read a few pixels of what the mixer drew)
const px = new Uint8Array(4 * 16); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
show(tex); gl.readPixels(0, 100, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
out.sanityPixels = Array.from(px.slice(0, 16));
window.probe.done(out);
````

<!-- f0-file: hap.js -->
````js
// F0 probe 2: VEATION's hap-worker.js as it is (workers with Node: fs reads, Snappy in JS, compressed upload in the
// worker's own WebGL, ImageBitmap to the main thread), playing a synthetic 7196x912 HAP / HAP Q at 30 then 60 fps.
// ?file=synth-hap1.mov|synth-hapy.mov&workers=4 (VEATION's hapNW() on this machine: max(2, min(4, 24 >> 2)) = 4)
import { cadence, summary, sleep, program, texture, quad, timers, HapSource } from './lib.js';

const q = new URLSearchParams(location.search);
const file = q.get('file') || 'synth-hap1.mov', nW = +(q.get('workers') || 4);
const PH = (q.get('phases') || '30:7000,60:7000').split(',').map((s) => s.split(':').map(Number));
const W = 7196, H = 912;
const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 243; cv.style.width = '1920px'; cv.style.height = '243px'; document.body.append(cv);
const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
const P = program(gl), T = timers(gl), tex = texture(gl, W, H);

const src = await new HapSource(window.probe.mediaDir + file, nW, 30).init();
const out = { file, workers: nW, ix: { fourcc: src.ix.fourcc, w: src.ix.width, h: src.ix.height, count: src.ix.count }, init: src.initReplies.map((r) => ({ ok: r.ok, s3tc: r.s3tc, err: r.err })), phases: {} };

const rafT = [];
let running = false;
const frame = (now) => {
  requestAnimationFrame(frame);
  rafT.push(now);
  if (!running) return;
  T?.poll();
  const c = src.take(now); src.maxCache = Math.max(src.maxCache || 0, src.cache.size);
  if (c) { T?.begin('up'); src.upload(gl, tex, c); T?.end(); }
  gl.viewport(0, 0, cv.width, cv.height); quad(gl, P, tex, [0, 0, 1, 1], [0, 0, cv.width, cv.height], cv.width, cv.height);
};
requestAnimationFrame(frame);

for (const [fps, ms] of PH) {
  // a fresh start of the clip at this rate; the first second is left out of the numbers (pipeline filling)
  const mark = { arrive: src.s.arrive.length, latency: src.s.latency.length, shownT: src.s.shownT.length, delay: src.s.delay.length, up: src.s.upMs.length, late: src.s.late, gpuUp: (T?.res.up || []).length };
  src.start(performance.now(), fps); running = true;
  const a = performance.now(), e0 = Date.now();
  await sleep(1000);
  const m = { arrive: src.s.arrive.length, latency: src.s.latency.length, shownT: src.s.shownT.length, delay: src.s.delay.length, up: src.s.upMs.length, late: src.s.late, gpuUp: (T?.res.up || []).length };
  const b = performance.now();
  await sleep(ms - 1000);
  const c = performance.now(), e1 = Date.now();
  const secs = (c - b) / 1000;
  const d = src.s.delay.slice(m.delay);
  const hist = { 0: 0, 1: 0, 2: 0, '3+': 0 }; for (const x of d) hist[x >= 3 ? '3+' : x]++;
  out.phases[fps] = {
    epoch: [e0, e1], seconds: +secs.toFixed(2),
    deliveredPerS: +((src.s.arrive.length - m.arrive) / secs).toFixed(1),
    shownPerS: +((src.s.shownT.length - m.shownT) / secs).toFixed(1),
    delayFrames: { ...summary(d), hist },
    latencyMs: summary(src.s.latency.slice(m.latency)),
    worker: { readMs: summary(src.s.tR.slice(m.latency)), snappyMs: summary(src.s.tD.slice(m.latency)), uploadMs: summary(src.s.tU.slice(m.latency)) },
    mainUploadCallMs: summary(src.s.upMs.slice(m.up)), mainUploadGpuMs: summary((T?.res.up || []).slice(m.gpuUp)),
    lateDropped: src.s.late - m.late, cachedMax: src.maxCache || 0,
    raf: cadence(rafT.filter((t) => t >= b && t < c)),
    shownCadence: cadence(src.s.shownT.slice(m.shownT)),
  };
  running = false;
  void a; void mark;
}
out.errors = src.s.errors.slice(0, 5);
src.close();
window.probe.done(out);
````

<!-- f0-file: composite.js -->
````js
// F0 probes 3 and 4: the mixer of plan §4.5 at XR Lab size, in ONE page = one output window.
//   experience — the REAL Alma liquid in an iframe (7196x912, ultra, logo on P1, 3 hands), copied in its draw's task
//   media      — one HAP layer from VEATION's worker (synthetic 7196x912 Hap1 at 60 fps), normal blend at 60 %
//   content FBO 7196x912 → out=slices: the Fx4 layout on 3840x2400 (P4 P1 P2 P3, one per 1920x1200 quadrant, 1:1)
//                        → out=content: the FBO 1:1 on a 7196x912 canvas (the off-screen Spout window of today)
// ?renderer=webgpu|webgl2|none &hap=synth-hap1.mov|none &out=slices|content &mixer=1|0 (0 = today's DOM page: the iframe only)
import { cadence, summary, sleep, program, texture, target, quad, timers, HapSource } from './lib.js';

const q = new URLSearchParams(location.search);
const R = q.get('renderer') || 'webgpu', HAP = q.get('hap') || 'synth-hap1.mov', OUT = q.get('out') || 'slices';
const MIXER = q.get('mixer') !== '0', OPACITY = +(q.get('opacity') || 0.6), HAPFPS = +(q.get('hapFps') || 60), NW = +(q.get('workers') || 4);
const HAP2 = q.get('hap2') || 'none', NW2 = +(q.get('workers2') || 2);
const CLOCK = q.get('clock') || 'frame'; // frame: the clip's playhead from the experience frame's rAF time (passed by the runtime); vsync: the parent's last rAF time; now: performance.now() in the hook
const WARM = +(q.get('warm') || 3000), MEASURE = +(q.get('measure') || 18000);
const W = 7196, H = 912, OW = innerWidth, OH = innerHeight;
const SLICES = [[0, 1912], [1912, 1692], [3604, 1920], [5524, 1672]]; // x, width in the content strip (P4 P1 P2 P3)

let ifr = null;
if (R !== 'none') {
  ifr = document.createElement('iframe');
  ifr.style.width = `${W}px`; ifr.style.height = `${H}px`; ifr.style.zIndex = '1';
  ifr.src = `/experiences/alma-fluid/index.html?renderer=${R}&hands=3`;
  document.body.append(ifr);
}
let gl = null, P = null, T = null, texExp = null, texHap = null, texHap2 = null, fbo = null, src = null, src2 = null, cv = null;
if (MIXER) {
  cv = document.createElement('canvas'); cv.width = OW; cv.height = OH; cv.style.width = `${OW}px`; cv.style.height = `${OH}px`; cv.style.zIndex = '2';
  document.body.append(cv);
  gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  P = program(gl); T = timers(gl);
  texExp = texture(gl, W, H); texHap = texture(gl, W, H); fbo = target(gl, W, H);
  if (HAP !== 'none') src = await new HapSource(window.probe.mediaDir + HAP, NW, HAPFPS).init();
  if (HAP2 !== 'none') { texHap2 = texture(gl, W, H); src2 = await new HapSource(window.probe.mediaDir + HAP2, NW2, HAPFPS).init(); }
}

const rec = { compT: [], hookMs: [], rafT: [], expFrames: 0 };
let measuring = false, haveExp = false, lastRaf = performance.now(), frameT = null;
const clipNow = () => (CLOCK === 'frame' && frameT != null ? frameT : CLOCK === 'vsync' || CLOCK === 'frame' ? lastRaf : performance.now());
const order = { sameAsParentRaf: 0, parentRafOlder: 0, parentRafNewer: 0 };
const tq = (tag, f) => { if (measuring && T) { T.begin(tag); f(); T.end(); } else f(); };

function composite(canvas) {
  const a = performance.now();
  T?.poll();
  if (canvas) { tq('expCopy', () => { gl.bindTexture(gl.TEXTURE_2D, texExp); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas); }); haveExp = true; }
  if (src) { const c = src.take(clipNow()); if (c) tq('hapUp', () => src.upload(gl, texHap, c)); }
  if (src2) { const c = src2.take(clipNow()); if (c) tq('hapUp2', () => src2.upload(gl, texHap2, c)); }
  // content: experience, then the clip over it (premultiplied normal blend at OPACITY)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb); gl.viewport(0, 0, W, H);
  tq('p1', () => { gl.disable(gl.BLEND); if (haveExp) quad(gl, P, texExp, [0, 1, 1, 0], [0, 0, W, H], W, H); else { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } });
  if (src && src.shown >= 0) tq('p2', () => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); quad(gl, P, texHap, [0, 1, 1, 0], [0, 0, W, H], W, H, OPACITY); gl.disable(gl.BLEND); });
  if (src2 && src2.shown >= 0) tq('p2b', () => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); quad(gl, P, texHap2, [0, 1, 1, 0], [0, 0, W, H], W, H, 0.5); gl.disable(gl.BLEND); });
  // out
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, OW, OH);
  tq('p3', () => {
    if (OUT === 'slices') {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      SLICES.forEach(([x, w], i) => {
        const qx = (i % 2) * 1920, qyTop = Math.floor(i / 2) * 1200; // quadrant, top-left origin
        const dx = qx + Math.round((1920 - w) / 2), dyTop = qyTop + Math.round((1200 - H) / 2);
        quad(gl, P, fbo.tex, [x / W, 0, (x + w) / W, 1], [dx, OH - dyTop - H, w, H], OW, OH);
      });
    } else quad(gl, P, fbo.tex, [0, 0, 1, 1], [0, 0, OW, OH], OW, OH);
  });
  if (measuring) { rec.compT.push(a); rec.hookMs.push(performance.now() - a); }
}

if (MIXER) window.__vtLayerFrame = (canvas, t) => {
  rec.expFrames++;
  if (t != null && ifr) { frameT = t + (ifr.contentWindow.performance.timeOrigin - performance.timeOrigin); if (measuring) { const d = lastRaf - frameT; if (Math.abs(d) < 1) order.sameAsParentRaf++; else if (d < 0) order.parentRafOlder++; else order.parentRafNewer++; } }
  composite(canvas);
};
(function f(t) { requestAnimationFrame(f); lastRaf = t; if (measuring) rec.rafT.push(t); if (MIXER && R === 'none') composite(null); })(performance.now());

const S = () => ifr?.contentWindow?.__probeStats;
const t0 = performance.now();
if (ifr) while (!(S()?.t?.length > 20) && performance.now() - t0 < 12000) await sleep(100);
const boot = { ms: +(performance.now() - t0).toFixed(0), renderer: S()?.renderer || null, almaRenderer: ifr?.contentWindow?.__almaFluid?.renderer || null };
// vsync clock: the frame boundaries fall half a frame away from the vsyncs (no aliasing between the two clocks)
const half = CLOCK !== 'now' ? 500 / HAPFPS : 0;
const tStart = CLOCK === 'frame' && frameT != null ? frameT : lastRaf;
if (src) src.start(tStart - half, HAPFPS);
if (src2) src2.start(tStart - half - (CLOCK === 'now' ? 777 : 47 * 1000 / HAPFPS), HAPFPS); // another point of the clip
await sleep(WARM);
const mark2 = src2 ? { arrive: src2.s.arrive.length, lat: src2.s.latency.length, delay: src2.s.delay.length, shown: src2.s.shownT.length } : null;
const mark = src ? { arrive: src.s.arrive.length, lat: src.s.latency.length, delay: src.s.delay.length, shown: src.s.shownT.length } : null;
const p0 = await window.probe.paints();
measuring = true;
const a = performance.now(), e0 = Date.now();
await sleep(MEASURE);
const b = performance.now(), e1 = Date.now();
measuring = false;
const snap = (x) => x && { arrive: x.s.arrive.length, lat: x.s.latency.length, delay: x.s.delay.length, shown: x.s.shownT.length };
const end1 = snap(src), end2 = snap(src2);
const p1 = await window.probe.paints();
await sleep(200); T?.poll();

const out = { clock: CLOCK, order, renderer: R, out: OUT, mixer: MIXER, size: [OW, OH], boot, epoch: [e0, e1], seconds: +((b - a) / 1000).toFixed(2) };
out.parentRaf = cadence(rec.rafT);
if (MIXER) {
  out.composite = cadence(rec.compT);
  out.hookCpuMs = summary(rec.hookMs);
  out.gpuMs = {}; for (const k of ['expCopy', 'hapUp', 'hapUp2', 'p1', 'p2', 'p2b', 'p3']) out.gpuMs[k] = summary(T?.res[k] || []);
}
if (ifr) {
  const st = S(), off = ifr.contentWindow.performance.timeOrigin - performance.timeOrigin;
  const idx = []; st.t.forEach((t, i) => { const x = t + off; if (x >= a && x < b) idx.push(i); });
  out.experience = cadence(idx.map((i) => st.t[i] + off));
  out.expFnMs = summary(idx.map((i) => st.fnMs[i]));
}
if (src) {
  const secs = (b - a) / 1000, d = src.s.delay.slice(mark.delay, end1.delay), hist = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const x of d) hist[x >= 3 ? '3+' : x]++;
  out.hap = {
    deliveredPerS: +((end1.arrive - mark.arrive) / secs).toFixed(1), shownPerS: +((end1.shown - mark.shown) / secs).toFixed(1),
    delayFrames: { ...summary(d), hist }, latencyMs: summary(src.s.latency.slice(mark.lat, end1.lat)),
    snappyMs: summary(src.s.tD.slice(mark.lat, end1.lat)), readMs: summary(src.s.tR.slice(mark.lat, end1.lat)), workerUploadMs: summary(src.s.tU.slice(mark.lat, end1.lat)),
    shownCadence: cadence(src.s.shownT.slice(mark.shown, end1.shown)),
    late: src.s.late, outside: src.s.outside || 0, errors: src.s.errors.slice(0, 3),
  };
  src.close();
}
if (src2) {
  const secs = (b - a) / 1000, d = src2.s.delay.slice(mark2.delay, end2.delay), hist = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const x of d) hist[x >= 3 ? '3+' : x]++;
  out.hap2 = { deliveredPerS: +((end2.arrive - mark2.arrive) / secs).toFixed(1), shownPerS: +((end2.shown - mark2.shown) / secs).toFixed(1), delayFrames: { ...summary(d), hist }, latencyMs: summary(src2.s.latency.slice(mark2.lat, end2.lat)), snappyMs: summary(src2.s.tD.slice(mark2.lat, end2.lat)), shownCadence: cadence(src2.s.shownT.slice(mark2.shown, end2.shown)), errors: src2.s.errors.slice(0, 3) };
  src2.close();
}
out.paintsInWindow = p1.n - p0.n;
window.probe.done(out);
````

<!-- f0-file: hap-worker.js -->
````js
/* VEATION — [R400] worker del PROXY LIVE (HAP / HAP Q / HAP Alpha).
   Diseño y medidas en docs/PROXY-LIVE.md; la decisión, en docs/adr/adr-0012-proxy-live-hap.md.

   Un fotograma recorre aquí todo su camino menos el último paso:
     disco (fs, sin IPC) → sección HAP → Snappy → textura comprimida en ESTE contexto WebGL → RGBA → ImageBitmap
   y el hilo principal sólo copia el ImageBitmap a la textura del clip (GPU→GPU, ~0,1 ms). Subir 16 MB de DXT desde el
   hilo principal costaba 10-16 ms por fotograma; aquí cuesta lo mismo en la GPU pero el editor no se entera.

   La ventana principal tiene `nodeIntegrationInWorker` por esto: `require('fs')` sólo existe en el worker.

   Mensajes (uno en vuelo por worker; lo garantiza el planificador de app.js):
     {t:'init', req}                     → {t:'init', req, ok, gl, s3tc, err}
     {t:'info', req, path}               → {t:'info', req, ix} | {t:'err', req, msg}
     {t:'frame', req, path, idx}         → {t:'frame', req, idx, bm, w, h, tR, tD, tU} | {t:'err', req, msg}
     {t:'close', req, path}              → {t:'close', req}   (cierra el descriptor: Windows no deja renombrar encima de un archivo abierto)

   ORIENTACIÓN (medida, no supuesta): la fila 0 de una textura HAP es la de ARRIBA de la imagen. Se dibuja SIN voltear y
   el resultado, subido como ImageBitmap, es la convención de `upTex` (52 dB contra la decodificación de FFmpeg; volteado,
   24 dB). Lo decide SÓLO este dibujo: `UNPACK_FLIP_Y_WEBGL` no actúa sobre un ImageBitmap (especificación de WebGL;
   medido en la red `r400-proxy-live`, que lo comprueba con marcas de esquina). */
'use strict';
const fs = require('fs');

/* ---------- Snappy (formato «raw») ----------
   FUSIONA las copias consecutivas con el mismo desplazamiento y las rellena por duplicación. En material de domo el 70 %
   de los bytes son bloques DXT negros repetidos (180.000 copias de 16 bytes por fotograma de 4096²): copiadas una a una
   costaban 20 ms por fotograma HAP Q; fusionadas, 7,9 ms. Byte a byte idéntico (verificado en 180 fotogramas). */
function snappyDecompress(src, p, end, dst, dOff) {
  let n = 0, sh = 0;
  for (;;) { if (p >= end) throw new Error('snappy: varint'); const c = src[p++]; n |= (c & 0x7f) << sh; if (!(c & 0x80)) break; sh += 7; if (sh > 28) throw new Error('snappy: varint'); }
  n >>>= 0;
  const oEnd = dOff + n; if (oEnd > dst.length) throw new Error('snappy: destination too short');
  let o = dOff, rO = 0, rOff = 0, rL = 0;                 // racha de copias pendiente
  while (p < end) {
    const tag = src[p++], t = tag & 3;
    if (t === 0) {
      if (rL) { flush(dst, rO, rOff, rL); rL = 0; }
      let len = tag >>> 2;
      if (len >= 60) { const nb = len - 59; len = 0; for (let i = 0; i < nb; i++) len |= src[p + i] << (8 * i); len >>>= 0; p += nb; }
      len += 1;
      if (p + len > end || o + len > oEnd) throw new Error('snappy: literal out of range');
      if (len < 32) { for (let i = 0; i < len; i++) dst[o + i] = src[p + i]; } else dst.set(src.subarray(p, p + len), o);
      p += len; o += len; continue;
    }
    let len, off;
    if (t === 1) { len = ((tag >>> 2) & 7) + 4; off = ((tag >>> 5) << 8) | src[p++]; }
    else if (t === 2) { len = (tag >>> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
    else { len = (tag >>> 2) + 1; off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; p += 4; }
    if (off === 0 || off > o - dOff || o + len > oEnd) throw new Error('snappy: copy out of range');
    if (rL && off === rOff && rO + rL === o) { rL += len; o += len; continue; }   // sigue la misma racha periódica
    if (rL) flush(dst, rO, rOff, rL);
    rO = o; rOff = off; rL = len; o += len;
  }
  if (rL) flush(dst, rO, rOff, rL);
  if (o !== oEnd) throw new Error('snappy: length ' + (o - dOff) + ' != ' + n);
  return n;
}
/* Rellena [o, o+L) con el patrón periódico de periodo `off` que empieza en o-off. Cada `copyWithin` duplica lo ya
   escrito, así que una racha de 16 KB son ~10 llamadas en vez de 16.000 vueltas de bucle. */
function flush(dst, o, off, L) {
  const s = o - off;
  if (L <= 48) { for (let i = 0; i < L; i++) dst[o + i] = dst[s + i]; return; }
  if (off >= L) { dst.copyWithin(o, s, s + L); return; }
  if (off < 8) {
    const k0 = Math.min(L, off * 8); for (let i = 0; i < k0; i++) dst[o + i] = dst[s + i];
    let d = k0; while (d < L) { const k = Math.min(L - d, d); dst.copyWithin(o + d, o, o + k); d += k; } return;
  }
  let d = 0; while (d < L) { const k = Math.min(L - d, off + d); dst.copyWithin(o + d, s, s + k); d += k; }
}

/* ---------- Secciones HAP (Vidvox/hap · documentation/HapVideoDRAFT.md) ----------
   Cabecera: 3 bytes de tamaño LE + 1 de tipo; si el tamaño es 0, siguen 4 bytes de tamaño (cabecera de 8). Un HAP Q de
   4096² SIN compresión mide 16.777.216 bytes, uno más de lo que caben en 24 bits: ahí la cabecera larga es obligatoria.
   Tipo = nibble alto (A sin compresión · B Snappy · C «ver Decode Instructions») + nibble bajo (formato de textura). */
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function sec(b, o, end) {
  if (o + 4 > end) throw new Error('hap: section header beyond the sample');
  let size = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); const type = b[o + 3]; let hl = 4;
  if (size === 0) { if (o + 8 > end) throw new Error('hap: long header beyond the sample'); size = u32le(b, o + 4); hl = 8; }
  if (o + hl + size > end) throw new Error('hap: section longer than the sample');
  return { size, type, hl };
}
const TEX = { 0xB: 'dxt1', 0xE: 'dxt5', 0xF: 'ycocg' };      // los tres que codifica FFmpeg (Hap1, Hap5, HapY)
function hapDecode(b, o, end, out) {
  const s = sec(b, o, end), data = o + s.hl, dEnd = data + s.size;
  if (s.type === 0x0D) throw new Error('hapm: HAP Q Alpha (HapM) is not supported');
  const comp = s.type >> 4, fmt = TEX[s.type & 15];
  if (!fmt) throw new Error('hap: format 0x' + s.type.toString(16) + ' is not supported');
  if (comp === 0xA) { if (s.size > out.length) throw new Error('hap: texture larger than expected'); out.set(b.subarray(data, dEnd), 0); return { fmt, len: s.size }; }
  if (comp === 0xB) return { fmt, len: snappyDecompress(b, data, dEnd, out, 0) };
  if (comp === 0xC) {
    const di = sec(b, data, dEnd); if (di.type !== 0x01) throw new Error('hap: the Decode Instructions container is missing');
    let q = data + di.hl; const qEnd = q + di.size; let comps = null, sizes = null, offs = null;
    while (q < qEnd) { const ss = sec(b, q, qEnd), sd = q + ss.hl;
      if (ss.type === 0x02) comps = b.subarray(sd, sd + ss.size);
      else if (ss.type === 0x03) { sizes = []; for (let i = 0; i + 4 <= ss.size; i += 4) sizes.push(u32le(b, sd + i)); }
      else if (ss.type === 0x04) { offs = []; for (let i = 0; i + 4 <= ss.size; i += 4) offs.push(u32le(b, sd + i)); }
      q = sd + ss.size; }
    if (!comps || !sizes || comps.length !== sizes.length || (offs && offs.length !== sizes.length)) throw new Error('hap: inconsistent chunk tables');
    const base = qEnd; let pos = base, w = 0;
    for (let i = 0; i < sizes.length; i++) {
      const cs = offs ? base + offs[i] : pos, ce = cs + sizes[i];
      if (ce > dEnd) throw new Error('hap: chunk outside the section');
      if (comps[i] === 0x0A) { if (w + sizes[i] > out.length) throw new Error('hap: texture larger than expected'); out.set(b.subarray(cs, ce), w); w += sizes[i]; }
      else if (comps[i] === 0x0B) w += snappyDecompress(b, cs, ce, out, w);
      else throw new Error('hap: chunk compressor 0x' + comps[i].toString(16));
      pos = ce; }
    return { fmt, len: w };
  }
  throw new Error('hap: compressor 0x' + comp.toString(16));
}

/* ---------- Índice del .mov ----------
   QuickTime/ISO: se recorren los átomos de primer nivel hasta el `moov` (FFmpeg lo escribe al FINAL), y de la pista de
   vídeo se sacan: fourcc y tamaño (stsd), tamaños (stsz), posiciones (stco/co64 + stsc) y el INSTANTE de cada muestra
   (stts acumulado, menos la edit list). El instante va por muestra y no como i/fps: un original de cadencia variable
   da un HAP de cadencia variable, y el fotograma correcto es el último cuyo instante ≤ t. */
const HAP_FOURCC = new Set(['Hap1', 'Hap5', 'HapY']);
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
function movIndex(fd, fileSize) {
  const rd = (o, l) => { const n = Math.max(0, Math.min(l, fileSize - o)); const bb = Buffer.alloc(n); if (n) fs.readSync(fd, bb, 0, n, o); return bb; };
  let off = 0, moov = null;
  while (off + 8 <= fileSize) {
    const h = rd(off, 16); let size = u32be(h, 0); const type = fourcc(h, 4);
    if (size === 1) size = u32be(h, 8) * 4294967296 + u32be(h, 12); else if (size === 0) size = fileSize - off;
    if (size < 8) break;
    if (type === 'moov') { if (size > 256 * 1024 * 1024) throw new Error('mov-bad: oversized moov'); moov = rd(off, size); break; }
    off += size; }
  if (!moov) throw new Error('no-moov: no moov atom (incomplete file?)');
  const kids = (s, e) => { const r = []; let p = s; while (p + 8 <= e) { let sz = u32be(moov, p); const ty = fourcc(moov, p + 4); let hl = 8;
    if (sz === 1) { sz = u32be(moov, p + 8) * 4294967296 + u32be(moov, p + 12); hl = 16; } else if (sz === 0) sz = e - p;
    if (sz < hl || p + sz > e) break; r.push({ ty, s: p + hl, e: p + sz }); p += sz; } return r; };
  const find = (s, e, ty) => kids(s, e).find(k => k.ty === ty);
  let movieTs = 600; { const mvhd = find(8, moov.length, 'mvhd'); if (mvhd) movieTs = u32be(moov, mvhd.s + (moov[mvhd.s] === 1 ? 20 : 12)) || 600; }
  for (const trak of kids(8, moov.length).filter(k => k.ty === 'trak')) {
    const mdia = find(trak.s, trak.e, 'mdia'); if (!mdia) continue;
    const hdlr = find(mdia.s, mdia.e, 'hdlr'); if (!hdlr || fourcc(moov, hdlr.s + 8) !== 'vide') continue;
    const mdhd = find(mdia.s, mdia.e, 'mdhd'); const ts = u32be(moov, mdhd.s + (moov[mdhd.s] === 1 ? 20 : 12)) || 1;
    const minf = find(mdia.s, mdia.e, 'minf'), stbl = minf && find(minf.s, minf.e, 'stbl'); if (!stbl) continue;
    const stsd = find(stbl.s, stbl.e, 'stsd'); const ent = stsd.s + 8;
    const fcc = fourcc(moov, ent + 4);
    const width = (moov[ent + 32] << 8) | moov[ent + 33], height = (moov[ent + 34] << 8) | moov[ent + 35];
    const stsz = find(stbl.s, stbl.e, 'stsz'); const fixed = u32be(moov, stsz.s + 4), count = u32be(moov, stsz.s + 8);
    const sizes = new Float64Array(count); for (let i = 0; i < count; i++) sizes[i] = fixed || u32be(moov, stsz.s + 12 + i * 4);
    const stco = find(stbl.s, stbl.e, 'stco'), co64 = find(stbl.s, stbl.e, 'co64'); const cOff = [];
    if (stco) { const n = u32be(moov, stco.s + 4); for (let i = 0; i < n; i++) cOff.push(u32be(moov, stco.s + 8 + i * 4)); }
    else if (co64) { const n = u32be(moov, co64.s + 4); for (let i = 0; i < n; i++) cOff.push(u32be(moov, co64.s + 8 + i * 8) * 4294967296 + u32be(moov, co64.s + 12 + i * 8)); }
    else throw new Error('mov-bad: no sample-offset table');
    const stsc = find(stbl.s, stbl.e, 'stsc'); const nsc = u32be(moov, stsc.s + 4); const sc = [];
    for (let i = 0; i < nsc; i++) sc.push([u32be(moov, stsc.s + 8 + i * 12), u32be(moov, stsc.s + 12 + i * 12)]);
    const offsets = new Float64Array(count); let si = 0, k = 0;
    for (let c = 0; c < cOff.length && si < count; c++) {
      while (k + 1 < sc.length && c + 1 >= sc[k + 1][0]) k++;
      let p = cOff[c]; for (let j = 0; j < sc[k][1] && si < count; j++) { offsets[si] = p; p += sizes[si]; si++; } }
    if (si < count) throw new Error('mov-bad: sample-offset table too short');
    const stts = find(stbl.s, stbl.e, 'stts'); const ne = u32be(moov, stts.s + 4);
    const pts = new Float64Array(count); let acc = 0, idx = 0, lastD = 0;
    for (let e2 = 0; e2 < ne && idx < count; e2++) { const n = u32be(moov, stts.s + 8 + e2 * 8), d = u32be(moov, stts.s + 12 + e2 * 8); lastD = d;
      for (let j = 0; j < n && idx < count; j++) { pts[idx++] = acc; acc += d; } }
    while (idx < count) { pts[idx++] = acc; acc += lastD; }
    /* Edit list: un hueco inicial (media_time = -1) retrasa todo; el primer tramo con media_time ≥ 0 dice dónde
       empieza la imagen. FFmpeg no lo escribe en un HAP sin `-ss`, pero un .mov de otra herramienta puede traerlo. */
    let shift = 0; const edts = find(trak.s, trak.e, 'edts'), elst = edts && find(edts.s, edts.e, 'elst');
    if (elst) { const v1 = moov[elst.s] === 1, n = u32be(moov, elst.s + 4); let p = elst.s + 8, delay = 0;
      for (let i = 0; i < n; i++) { const segD = v1 ? u32be(moov, p) * 4294967296 + u32be(moov, p + 4) : u32be(moov, p);
        const mt = v1 ? (u32be(moov, p + 8) | 0) * 4294967296 + u32be(moov, p + 12) : (u32be(moov, p + 4) | 0); p += v1 ? 20 : 12;
        if (mt === -1 || mt === -4294967296) { delay += segD / movieTs; continue; }
        shift = delay - mt / ts; break; } }
    const ptsS = new Float64Array(count); for (let i = 0; i < count; i++) ptsS[i] = pts[i] / ts + shift;
    const durS = acc / ts + shift;
    return { fourcc: fcc, width, height, count, pts: ptsS, dur: durS, fps: count > 1 ? (count - 1) / Math.max(1e-6, ptsS[count - 1] - ptsS[0]) : (ts / Math.max(1, lastD)), offsets, sizes };
  }
  throw new Error('not-hap: no video track');
}

/* ---------- Archivos abiertos ---------- */
const files = new Map();   // ruta → {fd, ix, usado}
function abrir(path) {
  let f = files.get(path);
  if (!f) {
    const fd = fs.openSync(path, 'r');
    try { const ix = movIndex(fd, fs.fstatSync(fd).size); if (!HAP_FOURCC.has(ix.fourcc)) throw new Error('not-hap: not HAP (' + ix.fourcc + ')'); f = { fd, ix, usado: 0 }; }
    catch (e) { try { fs.closeSync(fd); } catch (_) {} throw e; }
    files.set(path, f);
    if (files.size > 24) {   // un descriptor por proxy en uso; los que llevan rato sin pedirse se cierran
      const viejo = [...files.entries()].sort((a, b) => a[1].usado - b[1].usado)[0];
      if (viejo && viejo[0] !== path) { try { fs.closeSync(viejo[1].fd); } catch (_) {} files.delete(viejo[0]); } }
  }
  f.usado = performance.now();
  return f;
}

/* ---------- WebGL del worker ---------- */
let cv = null, gl = null, S3 = null, prog = null, uMode = null, uScale = null, vao = null, glErr = '';
const ctex = new Map();    // clave formato|ancho|alto → textura comprimida reservada (texStorage2D)
function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
function iniciarGL() {
  if (gl && !gl.isContextLost()) return true;
  ctex.clear(); gl = null; prog = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') { glErr = 'no-offscreen: OffscreenCanvas is not available'; return false; }
    cv = new OffscreenCanvas(4, 4);
    gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) { glErr = 'no-webgl2: WebGL2 is not available in the worker'; return false; }
    S3 = gl.getExtension('WEBGL_compressed_texture_s3tc');
    if (!S3) { glErr = 'no-s3tc: the GPU does not offer WEBGL_compressed_texture_s3tc'; return false; }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es
out vec2 v; void main(){ vec2 q=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); v=q; gl_Position=vec4(q*2.0-1.0,0.0,1.0); }`));
    /* modo 0 = DXT1 opaco · 1 = DXT5, que sale PREMULTIPLICADO · 2 = HAP Q (YCoCg escalado; ScaledCoCgYToRGBA de Vidvox, reescrito)
       [Mac 2026-10-26] El lienzo entrega premultiplicado y se DECLARA así (upTexHap con pm=true): en macOS transferToImageBitmap
       premultiplicaba igualmente (medido: [128,0,0,128] con premultipliedAlpha:false), y como el programa lo daba por recto,
       drawClip volvía a multiplicar. Lo semitransparente de un HAP Alpha salía a 64 en vez de 128 en Live y en NDI. */
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; in vec2 v; uniform sampler2D s; uniform int modo; uniform vec2 esc; out vec4 o;
void main(){ vec4 c=texture(s, v*esc);
  if(modo==2){ float k=c.b*(255.0/8.0)+1.0; float co=(c.r-128.0/255.0)/k, cg=(c.g-128.0/255.0)/k, y=c.a; o=vec4(y+co-cg, y+cg, y-co-cg, 1.0); }
  else if(modo==1) o=vec4(c.rgb*c.a,c.a);
  else o=vec4(c.rgb,1.0); }`));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    prog = p; uMode = gl.getUniformLocation(p, 'modo'); uScale = gl.getUniformLocation(p, 'esc'); vao = gl.createVertexArray();
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); glErr = 'ctx-lost: context lost'; });
    return true;
  } catch (e) { glErr = String(e && e.message || e); gl = null; return false; }
}
function texComp(fmt, tw, th) {
  const k = fmt + '|' + tw + '|' + th; let t = ctex.get(k); if (t) return t;
  if (ctex.size >= 3) { const [k0, t0] = ctex.entries().next().value; try { gl.deleteTexture(t0); } catch (_) {} ctex.delete(k0); }
  t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, tw, th);
  /* NEAREST: el lienzo mide lo mismo que la imagen, cada píxel lee su texel. Filtrar aquí mezclaría YCoCg entre bloques. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  ctex.set(k, t); return t;
}

let rb = null, out = null;    // búferes que se reutilizan: cero asignaciones por fotograma en régimen
function fotograma(m) {
  const f = abrir(m.path), ix = f.ix, idx = m.idx | 0;
  if (idx < 0 || idx >= ix.count) throw new Error('frame beyond the end of the file: ' + idx);
  const t0 = performance.now();
  const size = ix.sizes[idx]; if (!rb || rb.length < size) rb = Buffer.allocUnsafeSlow(Math.ceil(size * 1.25));
  const leidos = fs.readSync(f.fd, rb, 0, size, ix.offsets[idx]); if (leidos !== size) throw new Error('short read');
  const t1 = performance.now();
  const W = ix.width, H = ix.height, tw = (W + 3) & ~3, th = (H + 3) & ~3;
  const need = tw * th; if (!out || out.length < need) out = new Uint8Array(need);
  const r = hapDecode(rb, 0, size, out);
  const esperado = r.fmt === 'dxt1' ? need / 2 : need;
  if (r.len !== esperado) throw new Error('texture of ' + r.len + ' bytes; expected ' + esperado);
  const t2 = performance.now();
  if (!iniciarGL()) throw new Error(glErr || 'no WebGL');
  const fmt = r.fmt === 'dxt1' ? S3.COMPRESSED_RGB_S3TC_DXT1_EXT : S3.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  const t = texComp(fmt, tw, th);
  gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.compressedTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tw, th, fmt, out.subarray(0, r.len));
  if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(prog);
  gl.uniform1i(uMode, r.fmt === 'ycocg' ? 2 : (r.fmt === 'dxt5' ? 1 : 0)); gl.uniform2f(uScale, W / tw, H / th);
  gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  const bm = cv.transferToImageBitmap();
  const t3 = performance.now();
  return { bm, w: W, h: H, alfa: r.fmt === 'dxt5', tR: t1 - t0, tD: t2 - t1, tU: t3 - t2 };
}

if (typeof self !== 'undefined') self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.t === 'init') { const ok = iniciarGL(); postMessage({ t: 'init', req: m.req, ok, gl: !!gl, s3tc: !!S3, err: ok ? '' : glErr }); return; }
    if (m.t === 'info') { const ix = abrir(m.path).ix;
      postMessage({ t: 'info', req: m.req, ix: { fourcc: ix.fourcc, width: ix.width, height: ix.height, count: ix.count, pts: ix.pts, dur: ix.dur, fps: ix.fps } }); return; }
    if (m.t === 'frame') { const r = fotograma(m); postMessage({ t: 'frame', req: m.req, idx: m.idx, ...r }, [r.bm]); return; }
    if (m.t === 'close') { const f = files.get(m.path); if (f) { try { fs.closeSync(f.fd); } catch (_) {} files.delete(m.path); } postMessage({ t: 'close', req: m.req }); return; }
  } catch (err) { postMessage({ t: 'err', req: m.req, idx: m.idx, msg: String(err && err.message || err) }); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { snappyDecompress, hapDecode, movIndex };
````

<!-- f0-file: gen-hap.mjs -->
````js
// F0 probe: throwaway generator of a synthetic 7196x912 HAP (Hap1) or HAP Q (HapY) .mov, NOT black or flat.
// Content: animated smooth noise (fbm, colour palette) with dark regions, so Snappy sees real-ish material.
// The HAP frame packer, Snappy compressor and .mov writer are copied VERBATIM from VEATION's app.js
// (Immersive Studio Pro: snappyCompress/_snapFrag, hapSection, hapFrame, HAP_FMT, _atom..., movBuild, movFtyp).
// The DXT encoder is a simple CPU one written here (VEATION's runs on the GPU); its block layout is the same.
// usage: node gen-hap.mjs <hap|hapq> <frames> <out.mov> [chunks=4] [threads=4] [dark=0.3]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 7196, H = 912;

// ------------------------------------------------------------------ VEATION app.js (verbatim)
const HAP_FMT={
  hap : {fourcc:'Hap1', tex:'dxt1',  depth:24, bpb:8,  none:0xAB, snappy:0xBB, chunked:0xCB, label:'Hap1', bpp:0.5}, // RGB · DXT1/BC1
  hapq: {fourcc:'HapY', tex:'ycocg', depth:24, bpb:16, none:0xAF, snappy:0xBF, chunked:0xCF, label:'HapY', bpp:1  }, // scaled YCoCg · DXT5/BC3
};
function u8cat(list){ let n=0; for(const a of list)n+=a.length; const o=new Uint8Array(n); let p=0; for(const a of list){ o.set(a,p); p+=a.length; } return o; }
function snappyCompress(src){
  const n=src.length, out=new Uint8Array(32+n+Math.ceil(n/6)); let op=0,v=n;
  while(v>=128){ out[op++]=(v&127)|128; v=Math.floor(v/128); } out[op++]=v;
  for(let bs=0;bs<n;bs+=65536) op=_snapFrag(src,bs,Math.min(65536,n-bs),out,op);
  return out.subarray(0,op);
}
function _snapFrag(src,base,len,out,op){
  const end=base+len;
  const emitLit=(s,l)=>{ if(l<=0)return; const m=l-1;
    if(m<60) out[op++]=m<<2;
    else { let nb=0,x=m; while(x>0){ nb++; x>>>=8; } out[op++]=(59+nb)<<2; x=m; for(let i=0;i<nb;i++){ out[op++]=x&255; x>>>=8; } }
    out.set(src.subarray(s,s+l),op); op+=l; };
  const emitCopy=(off,l)=>{
    while(l>=68){ out[op++]=(63<<2)|2; out[op++]=off&255; out[op++]=(off>>>8)&255; l-=64; }
    if(l>64){ out[op++]=(59<<2)|2; out[op++]=off&255; out[op++]=(off>>>8)&255; l-=60; }
    if(l>=4&&l<=11&&off<2048){ out[op++]=1|((l-4)<<2)|(((off>>>8)&7)<<5); out[op++]=off&255; }
    else { out[op++]=2|((l-1)<<2); out[op++]=off&255; out[op++]=(off>>>8)&255; } };
  if(len<15){ emitLit(base,len); return op; }
  let tsz=256,shift=24; while(tsz<len&&tsz<16384){ tsz<<=1; shift--; }
  const tab=new Int32Array(tsz).fill(base), mask=tsz-1;
  const ld=i=>(src[i]|(src[i+1]<<8)|(src[i+2]<<16)|(src[i+3]<<24))>>>0;
  const hs=x=>(Math.imul(x,0x1e35a7bd)>>>shift)&mask;
  const limit=end-15;
  let ip=base+1, anchor=base, nextHash=hs(ld(ip)), done=false;
  while(!done){
    let skip=32, nextIp=ip, cand=base;
    for(;;){ ip=nextIp; const h=nextHash; nextIp=ip+(skip>>>5); skip++;
      if(nextIp>limit){ done=true; break; }
      nextHash=hs(ld(nextIp)); cand=tab[h]; tab[h]=ip;
      if(cand<ip && ld(ip)===ld(cand)) break; } // cand<ip: a zero offset would be an invalid copy tag
    if(done)break;
    emitLit(anchor,ip-anchor);
    for(;;){ const bip=ip; let m=4;
      while(ip+m<end && src[cand+m]===src[ip+m]) m++;
      ip+=m; emitCopy(bip-cand,m); anchor=ip;
      if(ip>limit){ done=true; break; }
      tab[hs(ld(ip-1))]=ip-1;
      const h=hs(ld(ip)); cand=tab[h]; tab[h]=ip;
      if(cand>=ip || ld(ip)!==ld(cand)) break; }
    if(done)break;
    nextHash=hs(ld(ip+1)); ip++;
  }
  emitLit(anchor,end-anchor);
  return op;
}
function hapSection(type,payload){ const n=payload.length;
  if(n<0x1000000){ const h=new Uint8Array(4); h[0]=n&255; h[1]=(n>>>8)&255; h[2]=(n>>>16)&255; h[3]=type; return [h,payload]; }
  const h=new Uint8Array(8); h[3]=type; h[4]=n&255; h[5]=(n>>>8)&255; h[6]=(n>>>16)&255; h[7]=(n>>>24)&255; return [h,payload]; }
function hapFrame(tex,fmt,chunks){
  const F=HAP_FMT[fmt], bpb=F.bpb;
  const nb=Math.floor(tex.length/bpb); // split on BLOCK boundaries so every chunk is whole blocks
  const want=Math.max(1,Math.min(64,chunks|0));
  const per=Math.max(1,Math.ceil(nb/want)), real=Math.ceil(nb/per);
  const comp=[];
  for(let i=0;i<real;i++){ const raw=tex.subarray(i*per*bpb, Math.min(tex.length,(i+1)*per*bpb));
    const c=snappyCompress(raw);
    comp.push(c.length<raw.length?{d:c,t:0x0B}:{d:raw,t:0x0A}); } // incompressible → store it raw, like the reference encoder
  if(real===1) return u8cat(hapSection(comp[0].t===0x0B?F.snappy:F.none, comp[0].d));
  const ct=new Uint8Array(real); for(let i=0;i<real;i++) ct[i]=comp[i].t;              // 0x02 compressor table
  const szb=new Uint8Array(real*4), dv=new DataView(szb.buffer);                       // 0x03 size table (COMPRESSED sizes)
  for(let i=0;i<real;i++) dv.setUint32(i*4,comp[i].d.length,true);
  const di=u8cat([].concat(hapSection(0x02,ct),hapSection(0x03,szb)));
  const inner=u8cat([].concat(hapSection(0x01,di), comp.map(c=>c.d)));                 // instructions, then the chunk data
  return u8cat(hapSection(F.chunked,inner));
}
function _fcc(s){ const u=new Uint8Array(4); for(let i=0;i<4;i++)u[i]=s.charCodeAt(i); return u; }
function _atom(type,parts){ let n=8; for(const p of parts)n+=p.length; const h=new Uint8Array(8); new DataView(h.buffer).setUint32(0,n>>>0); h.set(_fcc(type),4); return u8cat([h].concat(parts)); }
function _bytes(n,fill){ const b=new Uint8Array(n); const dv=new DataView(b.buffer); if(fill)fill(dv,b); return b; }
const _MATRIX=(()=>{ const b=new Uint8Array(36), dv=new DataView(b.buffer); dv.setUint32(0,0x00010000); dv.setUint32(16,0x00010000); dv.setUint32(32,0x40000000); return b; })();
function _hdlr(ctype,subtype,name){ const nm=new TextEncoder().encode(name);
  return _atom('hdlr',[_bytes(25+nm.length,(dv,b)=>{ b.set(_fcc(ctype),4); b.set(_fcc(subtype),8); b[24]=nm.length; b.set(nm,25); })]); }
function _dinf(){ return _atom('dinf',[_atom('dref',[_bytes(8,(dv)=>{dv.setUint32(4,1);}), _bytes(12,(dv,b)=>{ dv.setUint32(0,12); b.set(_fcc('url '),4); dv.setUint32(8,1); })])]); }
function _stts(entries){ return _atom('stts',[_bytes(8+entries.length*8,(dv)=>{ dv.setUint32(4,entries.length); entries.forEach((e,i)=>{ dv.setUint32(8+i*8,e[0]); dv.setUint32(12+i*8,e[1]); }); })]); }
function _stsc(entries){ return _atom('stsc',[_bytes(8+entries.length*12,(dv)=>{ dv.setUint32(4,entries.length); entries.forEach((e,i)=>{ dv.setUint32(8+i*12,e[0]); dv.setUint32(12+i*12,e[1]); dv.setUint32(16+i*12,e[2]); }); })]); }
function _stszTab(sizes){ return _atom('stsz',[_bytes(12+sizes.length*4,(dv)=>{ dv.setUint32(8,sizes.length); sizes.forEach((s,i)=>dv.setUint32(12+i*4,s)); })]); }
function _co64(offs){ return _atom('co64',[_bytes(8+offs.length*8,(dv)=>{ dv.setUint32(4,offs.length); offs.forEach((o,i)=>{ dv.setUint32(8+i*8,Math.floor(o/4294967296)); dv.setUint32(12+i*8,o>>>0); }); })]); }
function _mvhd(ts,dur,nextId){ return _atom('mvhd',[u8cat([_bytes(20,(dv)=>{ dv.setUint32(12,ts); dv.setUint32(16,dur); }), _bytes(4,(dv)=>dv.setUint32(0,0x00010000)), _bytes(2,(dv)=>dv.setUint16(0,0x0100)), new Uint8Array(10), _MATRIX, new Uint8Array(24), _bytes(4,(dv)=>dv.setUint32(0,nextId))])]); }
function _tkhd(id,dur,w,h,vol){ return _atom('tkhd',[u8cat([
  _bytes(24,(dv)=>{ dv.setUint32(0,0x00000003); dv.setUint32(12,id); dv.setUint32(20,dur); }), // flags 3 = enabled + in movie
  new Uint8Array(8), _bytes(8,(dv)=>{ dv.setUint16(4,vol); }), _MATRIX,
  _bytes(8,(dv)=>{ dv.setUint32(0,w*65536); dv.setUint32(4,h*65536); })])]); }
function _mdhd(ts,dur){ return _atom('mdhd',[_bytes(24,(dv)=>{ dv.setUint32(12,ts); dv.setUint32(16,dur); dv.setUint16(20,0x55C4); })]); } // 0x55C4 = 'und'
function _stsdVideo(fourcc,w,h,depth){ const cn=new TextEncoder().encode('Hap');
  const e=_bytes(86,(dv,b)=>{ dv.setUint32(0,86); b.set(_fcc(fourcc),4); dv.setUint16(14,1); dv.setUint32(28,0x200);
    dv.setUint16(32,w); dv.setUint16(34,h); dv.setUint32(36,0x00480000); dv.setUint32(40,0x00480000); dv.setUint16(48,1);
    b[50]=cn.length; b.set(cn,51); dv.setUint16(82,depth); dv.setInt16(84,-1); });
  return _atom('stsd',[_bytes(8,(dv)=>dv.setUint32(4,1)), e]); }
function movBuild(c){
  const TS=1000, nF=c.frames.length, durMs=Math.round(nF/c.fps*TS);
  const vStbl=_atom('stbl',[_stsdVideo(c.fourcc,c.w,c.h,c.depth), _stts([[nF,1]]), _stsc([[1,1,1]]), _stszTab(c.frames.map(f=>f.size)), _co64(c.frames.map(f=>f.off))]);
  const vTrak=_atom('trak',[_tkhd(1,durMs,c.w,c.h,0), _atom('mdia',[_mdhd(c.fps,nF), _hdlr('mhlr','vide','VideoHandler'),
    _atom('minf',[_atom('vmhd',[_bytes(12,(dv)=>dv.setUint32(0,1))]), _hdlr('dhlr','alis','DataHandler'), _dinf(), vStbl])])]);
  const parts=[_mvhd(TS,durMs,c.audio?3:2), vTrak];
  return _atom('moov',parts);
}
function movFtyp(){ return _atom('ftyp',[u8cat([_fcc('qt  '), _bytes(4,(dv)=>dv.setUint32(0,0x20050300)), _fcc('qt  ')])]); }

// ------------------------------------------------------------------ content (written here)
// value noise on a lattice, smoothstep-interpolated; fbm of 4 octaves. Evaluated on a 1/4 grid, bilinear inside blocks.
function hash(ix, iy, s) { let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) { let f = 0, a = 0.5; for (let o = 0; o < 4; o++) { f += a * vnoise(x, y, s + o); x *= 2.03; y *= 2.03; a *= 0.5; } return f / 0.9375; }

/** RGB field (Float32, 3 per sample) on the (W/4+1) x (H/4+1) grid for frame `f`. */
function field(f, dark) {
  const gw = (W >> 2) + 2, gh = (H >> 2) + 2, out = new Float32Array(gw * gh * 3), t = f / 60;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * 4, y = j * 4;
    const n = 0.6 * fbm(x / 260 + t * 0.6, y / 260, 11) + 0.4 * fbm(x / 170 - t * 0.35 + 100, y / 170 + 50, 23);
    const m = fbm(x / 700 + t * 0.12, y / 700 + 7, 37); // the dark regions
    const k = Math.min(1, Math.max(0, (m - dark) / 0.12)); const kk = k * k * (3 - 2 * k);
    const p = (n * 1.7 + t * 0.05) * 6.2831853;
    const o = (j * gw + i) * 3;
    out[o] = kk * (0.5 + 0.5 * Math.cos(p));
    out[o + 1] = kk * (0.5 + 0.5 * Math.cos(p + 2.1));
    out[o + 2] = kk * (0.5 + 0.5 * Math.cos(p + 4.2));
  }
  return { out, gw };
}

const pk565 = (r, g, b) => ((Math.round(Math.min(1, Math.max(0, r)) * 31) << 11) | (Math.round(Math.min(1, Math.max(0, g)) * 63) << 5) | Math.round(Math.min(1, Math.max(0, b)) * 31));
const up565 = (v) => { const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31; return [((r << 3) | (r >> 2)) / 255, ((g << 2) | (g >> 4)) / 255, ((b << 3) | (b >> 2)) / 255]; };

/** DXT1 colour block of 16 RGB (px: Float32Array(48)) into dst[o..o+8). Endpoints = brightest/darkest pixel. */
function colorBlock(px, dst, o) {
  let imx = 0, imn = 0, lmx = -1, lmn = 9;
  for (let k = 0; k < 16; k++) { const l = px[k * 3] * 0.299 + px[k * 3 + 1] * 0.587 + px[k * 3 + 2] * 0.114 + px[k * 3 + 2] * 1e-3 + px[k * 3] * 1e-4; if (l > lmx) { lmx = l; imx = k; } if (l < lmn) { lmn = l; imn = k; } }
  let c0 = pk565(px[imx * 3], px[imx * 3 + 1], px[imx * 3 + 2]), c1 = pk565(px[imn * 3], px[imn * 3 + 1], px[imn * 3 + 2]);
  if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
  let idx = 0;
  if (c0 !== c1) {
    const p0 = up565(c0), p1 = up565(c1), d0 = p0[0] - p1[0], d1 = p0[1] - p1[1], d2 = p0[2] - p1[2], dd = d0 * d0 + d1 * d1 + d2 * d2 || 1;
    for (let k = 0; k < 16; k++) {
      const t = ((px[k * 3] - p1[0]) * d0 + (px[k * 3 + 1] - p1[1]) * d1 + (px[k * 3 + 2] - p1[2]) * d2) / dd;
      const q = t > 5 / 6 ? 0 : t > 0.5 ? 2 : t > 1 / 6 ? 3 : 1;
      idx |= q << (2 * k);
    }
  }
  dst[o] = c0 & 255; dst[o + 1] = c0 >> 8; dst[o + 2] = c1 & 255; dst[o + 3] = c1 >> 8;
  dst[o + 4] = idx & 255; dst[o + 5] = (idx >>> 8) & 255; dst[o + 6] = (idx >>> 16) & 255; dst[o + 7] = (idx >>> 24) & 255;
}
/** BC3 alpha block of 16 values in [0,1] into dst[o..o+8) (8-value mode, as VEATION's alphaBlock). */
function alphaBlock(a, dst, o) {
  let mn = 1, mx = 0; for (let k = 0; k < 16; k++) { if (a[k] < mn) mn = a[k]; if (a[k] > mx) mx = a[k]; }
  const a0 = Math.round(mx * 255), a1 = Math.round(mn * 255);
  dst[o] = a0; dst[o + 1] = a1;
  let lo = 0, hi = 0;
  if (a0 !== a1) for (let k = 0; k < 16; k++) {
    const av = a[k] * 255; let bd = 1e9, bi = 0;
    for (let q = 0; q < 8; q++) { const pv = q === 0 ? a0 : q === 1 ? a1 : ((8 - q) * a0 + (q - 1) * a1) / 7; const d = Math.abs(av - pv); if (d < bd) { bd = d; bi = q; } }
    const bp = 3 * k;
    if (bp < 24) lo |= bi << bp; else hi |= bi << (bp - 24); // 24 is a multiple of 3: no index straddles the split
  }
  // lo = bits 0..23, hi = bits 24..47
  dst[o + 2] = lo & 255; dst[o + 3] = (lo >> 8) & 255; dst[o + 4] = (lo >> 16) & 255;
  dst[o + 5] = hi & 255; dst[o + 6] = (hi >> 8) & 255; dst[o + 7] = (hi >> 16) & 255;
}

function encodeFrame(fmt, f, dark) {
  const { out: F, gw } = field(f, dark);
  const bw = W >> 2, bh = H >> 2, bpb = fmt === 'hap' ? 8 : 16, tex = new Uint8Array(bw * bh * bpb);
  const px = new Float32Array(48), ys = new Float32Array(16), cc = new Float32Array(48);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    // bilinear inside the block between the 4 grid samples (+ a little grain so blocks are not all exact gradients)
    const o00 = (by * gw + bx) * 3, o10 = o00 + 3, o01 = o00 + gw * 3, o11 = o01 + 3;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const u = i / 4, v = j / 4, k = (j * 4 + i) * 3;
      for (let c = 0; c < 3; c++) {
        const a = F[o00 + c] + (F[o10 + c] - F[o00 + c]) * u, b = F[o01 + c] + (F[o11 + c] - F[o01 + c]) * u;
        px[k + c] = a + (b - a) * v;
      }
    }
    const o = (by * bw + bx) * bpb;
    if (fmt === 'hap') { colorBlock(px, tex, o); continue; }
    // scaled YCoCg (HapY), as VEATION's DXT_FS VAR 7
    let m = 0;
    for (let k = 0; k < 16; k++) { const r = px[k * 3], g = px[k * 3 + 1], b = px[k * 3 + 2]; ys[k] = (r + 2 * g + b) * 0.25; const co = (r - b) * 0.5, cg = (-r + 2 * g - b) * 0.25; cc[k * 3] = co; cc[k * 3 + 1] = cg; m = Math.max(m, Math.abs(co), Math.abs(cg)); }
    const mb = m * 255; let sc = 1; if (mb < 63) sc = 2; if (mb < 31) sc = 4;
    const bl = (sc - 1) * 8 / 255;
    for (let k = 0; k < 16; k++) { cc[k * 3] = Math.min(1, Math.max(0, cc[k * 3] * sc + 0.50196078)); cc[k * 3 + 1] = Math.min(1, Math.max(0, cc[k * 3 + 1] * sc + 0.50196078)); cc[k * 3 + 2] = bl; }
    alphaBlock(ys, tex, o); colorBlock(cc, tex, o + 8);
  }
  return tex;
}

// ------------------------------------------------------------------ threads + file
if (!isMainThread) {
  const { fmt, frames, k, n, chunks, dark } = workerData;
  for (let f = k; f < frames; f += n) {
    const tex = encodeFrame(fmt, f, dark);
    const hf = hapFrame(tex, fmt, chunks);
    parentPort.postMessage({ f, data: hf }, [hf.buffer]);
  }
} else {
  const [fmt = 'hap', framesS = '120', out = 'media/synthetic.mov', chunksS = '4', threadsS = '4', darkS = '0.3'] = process.argv.slice(2);
  const frames = +framesS, chunks = +chunksS, n = +threadsS, dark = +darkS, F = HAP_FMT[fmt];
  const t0 = Date.now();
  const fd = fs.openSync(out, 'w');
  const ftyp = movFtyp();
  fs.writeSync(fd, ftyp, 0, ftyp.length, 0);
  let pos = ftyp.length + 16; // mdat with a 64-bit header
  const table = [], pending = new Map(); let next = 0, total = 0;
  await new Promise((resolve, reject) => {
    let live = n;
    for (let k = 0; k < n; k++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { fmt, frames, k, n, chunks, dark } });
      w.on('message', ({ f, data }) => {
        pending.set(f, data);
        while (pending.has(next)) { const d = pending.get(next); pending.delete(next); fs.writeSync(fd, d, 0, d.length, pos); table.push({ size: d.length, off: pos }); pos += d.length; total += d.length; next++; }
      });
      w.on('error', reject);
      w.on('exit', () => { if (--live === 0) resolve(); });
    }
  });
  const mdatSize = pos - ftyp.length;
  const hdr = Buffer.alloc(16); hdr.writeUInt32BE(1, 0); hdr.write('mdat', 4, 'latin1'); hdr.writeUInt32BE(Math.floor(mdatSize / 4294967296), 8); hdr.writeUInt32BE(mdatSize >>> 0, 12);
  fs.writeSync(fd, hdr, 0, 16, ftyp.length);
  const moov = movBuild({ fourcc: F.fourcc, w: W, h: H, depth: F.depth, fps: 60, frames: table });
  fs.writeSync(fd, moov, 0, moov.length, pos);
  fs.closeSync(fd);
  const raw = (W * H) * F.bpp;
  console.log(JSON.stringify({ fmt, fourcc: F.fourcc, frames: table.length, file: out, bytes: pos + moov.length, perFrameMB: +(total / table.length / 1e6).toFixed(3), rawMB: +(raw / 1e6).toFixed(3), ratio: +(total / table.length / raw).toFixed(3), bitsPerPx: +((total / table.length) * 8 / (W * H)).toFixed(2), seconds: (Date.now() - t0) / 1000 }));
}
````

<!-- f0-file: disk.ps1 -->
````powershell
# F0 probe: the library disk WITHOUT the Windows file cache (FILE_FLAG_NO_BUFFERING): sequential MB/s and the time to read
# one frame-sized block (2.3 MB = a 7196x912 HAP frame of real-ish material; 4.8 MB = HAP Q), as the HAP worker would.
param([string]$File)
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Diagnostics;
public static class F0Disk {
  public static string Run(string path, int block) {
    const FileOptions NoBuffering = (FileOptions)0x20000000;
    int b = (block + 4095) & ~4095; byte[] buf = new byte[b];
    var times = new System.Collections.Generic.List<double>();
    long total = 0; var sw = Stopwatch.StartNew();
    using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, NoBuffering)) {
      long len = fs.Length;
      for (long off = 0; off + b <= len; off += b) {
        var t = Stopwatch.StartNew(); int n = fs.Read(buf, 0, b); t.Stop(); total += n; times.Add(t.Elapsed.TotalMilliseconds);
      }
    }
    sw.Stop(); times.Sort();
    double p50 = times[Math.Min(times.Count - 1, (int)(0.5 * times.Count))], p95 = times[Math.Min(times.Count - 1, (int)(0.95 * times.Count))];
    return String.Format("block {0:F2} MB: {1:F0} MB/s over {2:F0} MB; per block p50 {3:F2} ms, p95 {4:F2} ms, max {5:F2} ms", b / 1e6, total / 1e6 / sw.Elapsed.TotalSeconds, total / 1e6, p50, p95, times[times.Count - 1]);
  }
}
"@
[F0Disk]::Run($File, 2279000)
[F0Disk]::Run($File, 4733000)
````

<!-- f0-file: show.cjs -->
````js
// prints a result file compactly; GPU samples are averaged per phase (or over the measuring window)
const { cadence, summary } = { cadence: (ts) => { if (ts.length < 2) return { frames: ts.length }; const g = []; for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]); const s = [...g].sort((a, b) => a - b), p = (k) => +s[Math.min(s.length - 1, Math.floor(k / 100 * s.length))].toFixed(2); const dur = (ts[ts.length - 1] - ts[0]) / 1000; const bins = { le18: 0, '18to25': 0, '25to34': 0, '34to50': 0, gt50: 0 }; for (const x of g) { if (x <= 18) bins.le18++; else if (x <= 25) bins['18to25']++; else if (x <= 34) bins['25to34']++; else if (x <= 50) bins['34to50']++; else bins.gt50++; } return { frames: ts.length, fps: +((ts.length - 1) / dur).toFixed(2), p50: p(50), p95: p(95), p99: p(99), max: +s[s.length - 1].toFixed(2), bins }; }, summary: (a) => { if (!a.length) return { n: 0 }; const s = [...a].sort((x, y) => x - y), p = (k) => +s[Math.min(s.length - 1, Math.floor(k / 100 * s.length))].toFixed(2); return { n: a.length, p50: p(50), p95: p(95), max: +s[s.length - 1].toFixed(2) }; } };
const r = require('./results/' + process.argv[2] + '.json');
const x = r.result || {};
const util = (a, b) => { const s = r.gpu.samples.filter((g) => g.t >= a && g.t < b); if (!s.length) return null; const m = (k) => +(s.reduce((p, g) => p + g[k], 0) / s.length).toFixed(1); return { util: m('util'), utilMax: Math.max(...s.map((g) => g.util)), memMiB: m('memMiB'), memMax: Math.max(...s.map((g) => g.memMiB)), clk: m('clk'), mclk: m('mclk'), w: m('w'), ps: [...new Set(s.map((g) => g.ps))].join(','), n: s.length }; };
const out = { why: r.why, wallMs: r.wallMs, before: r.gpu.before, after: r.gpu.after, featureEnd: r.gpu.featureEnd && r.gpu.featureEnd.gpu_compositing + '/' + r.gpu.featureEnd.webgpu + '/' + r.gpu.featureEnd.webgl };
if (x.phases) for (const k in x.phases) x.phases[k].gpu = x.phases[k].epoch ? util(x.phases[k].epoch[0], x.phases[k].epoch[1]) : null;
if (x.epoch) { x.gpuDuring = util(x.epoch[0], x.epoch[1]); x.gpuIdleBefore = util(r.startedAt - 2000, r.startedAt + 800); }
if (r.paints && x.epoch) { const ts = r.paints.t.filter((t) => t >= x.epoch[0] && t < x.epoch[1]); x.paintCadence = cadence(ts); x.sendSharedMs = summary(r.paints.sendMs.slice(-ts.length)); x.spout = { ok: r.paints.ok, bad: r.paints.bad, lastErr: r.paints.lastErr, rect: r.paints.rect, fmt: r.paints.fmt }; }
console.log(JSON.stringify({ ...out, result: x }, (k, v) => (k === 'epoch' ? undefined : v), 1).replace(/\n\s+(?=[\]}"\d-])/g, ' '));
const c = r.console.filter((l) => !l.includes('Security') && !l.includes('powerPreference'));
if (c.length) console.log('console:', c.slice(-15).join('\n'));
````
