# Formatos de medios en el media server: MP4, WebM, imágenes y audio
> **Tipo:** estudio de viabilidad y diseño (sin código). **Fecha:** 2026-11-21. **Alcance:** qué hace falta para aceptar
> MP4 (H.264/H.265), WebM, imágenes (PNG/JPG/WebP), secuencias de imágenes, ProRes y audio suelto (WAV/MP3/AAC), además de
> HAP en MOV, que es lo único que entra hoy. Parte de `docs/plans/MEDIA-SERVER.md` §3–§4d y de `MEDIA-SERVER-MEDIDAS.md`.
> **Etiquetas:** **[código]** leído en este repo. **[binario]** comprobado en
> `node_modules/electron/dist/ffmpeg.dll` (Electron 44.7.0, Chromium 152). **[web]** confirmado con una fuente. **[estimado]**
> cuenta o conocimiento previo, no medido aquí. **[a medir]** no se puede saber sin ejecutar Electron en la máquina de la sala.
## 1. Recomendación
1. **MP4/MOV (H.264, y HEVC/VP9/AV1 donde la máquina los decodifique): WebCodecs `VideoDecoder` en un worker**, con demux propio (ampliar `engine/media/mov.js`). No `<video>`. Sin dependencias nuevas.
2. **Se reutilizan `HapPlayer` y el planificador**: el worker devuelve `ImageBitmap` por fotograma como `hap-worker.js`. Cambia el pool (un decodificador con estado por clip: afinidad clip→worker, varios fotogramas en vuelo).
3. **Imágenes primero** (lo más barato): clip `still`, una textura cargada una vez, sin pool; cambio mínimo en `playhead()`.
4. **Audio: se decodifica una vez a una caché PCM** y se sirve por el `/api/media/pcm` actual; audio page, worklet y sincronía no cambian. WAV se lee directo.
5. **Ventana auxiliar `media-helper`** (oculta): único sitio donde Node puede pedir a Chromium «¿se decodifica?», «dame un fotograma», «decodifica este audio». Hoy el motor no decodifica ninguna imagen comprimida (`png.js` sólo codifica, `thumb.js` sólo lee DXT).
6. **ProRes, DNx, DXV, Cineform, MPEG-2: ni se reproducen ni se convierten sin FFmpeg**; se rechazan con nombre del códec y sugerencia (§5).
7. **«Convert to HAP»** (fase tardía): VEATION (`Immersive Studio Pro/app.js`: `dxtEncodeCanvas`, `snappyCompress`, `hapFrame`, `movBuild`) ya exporta HAP con código propio; portarlo cubre HEVC sin hardware, vídeo > 4096 px, bounce, secuencias.
8. **Mayor riesgo: H.264 a 7196×912**, probablemente por software [estimado] (§2.3). El spike P0 lo decide antes de escribir código.
9. **Orden:** P0 medidas → P1 imágenes → P2 audio → P3 H.264/MP4 → P4 HEVC/VP9/AV1/WebM → P5 Convert to HAP.
10. **Para el director:** patentes H.264/AAC/HEVC si el software se vende (R1) y si se admite un `ffmpeg.exe` externo del cliente (§5.3).

## 2. Vídeo MP4/WebM
### 2.1 Qué trae Electron 44 [binario] [web]
- `ffmpeg.dll` de Electron 44.7.0 (3,1 MB) contiene las cadenas de los demuxers `mov,mp4,m4a,3gp,3g2,mj2`, `matroska,webm`,
  `ogg`, `wav`, `mp3` y de los códecs `h264`, `hevc`, `aac`, `mp3`, `vorbis`, `flac`, `opus`, `vp8`, `vp9`, `av1`, `alac`, `mjpeg`.
  Que aparezca una cadena no prueba que el decodificador esté compilado (`hevc` aparece una vez: probablemente sólo el
  analizador). **[a medir]** con `VideoDecoder.isConfigSupported` (P0).
- ProRes aparece en la tabla de etiquetas del demuxer MOV, no como decodificador. La compilación de Chromium no incluye el de
  FFmpeg. Tratarlo como **no decodificable**. **[binario, indicio]**
- Chromium: HEVC llegó a `<video>`/MSE/WebCodecs en M107 en Windows, **sólo por decodificador de hardware** (D3D11) [web]. No
  hay HEVC por software. Con la RTX 4060 (NVDEC) debería funcionar; en otra GPU puede no. `isConfigSupported` miente a veces:
  hay que decodificar una muestra real antes de dar el clip por bueno [web, WebKit bug 262950].
- Codec strings: H.264 `avc1.PPCCLL` (de `avcC`), HEVC `hev1.…`/`hvc1.…` (de `hvcC`; Chromium es quisquilloso con la cadena),
  VP9 `vp09.…` (de `vpcC`), AV1 `av01.…` (de `av1C`). El `description` del `VideoDecoderConfig` es el propio `avcC`/`hvcC`.

### 2.2 Las dos opciones
| | (a) `HTMLVideoElement` → textura | (b) WebCodecs `VideoDecoder` + demux propio |
|---|---|---|
| Reloj | El del elemento. Se empuja con `currentTime` y `playbackRate` hacia el reloj del motor | El del motor: `playhead()` da el fotograma, nada se persigue |
| Exactitud de fotograma | ±1–2 fotogramas, sin garantía. `seeked` tarda 50–300 ms [estimado]; `requestVideoFrameCallback` informa, no manda | Exacta: se pide el fotograma `idx`; el reproductor sabe si llegó tarde (`late`, ya en Health) |
| Bucle | Hueco visible al saltar (el `loop` nativo tampoco es sin costura en todos los códecs) | Prefetch del salto, como `wrapTargets()` hoy |
| `bounce` (marcha atrás) | Imposible | Posible por GOP con caché (§2.5), con límites |
| `in`/`out`, `offset` de preroll | Un `seek` por cada lanzamiento | Se decodifica desde el keyframe anterior |
| Subida a textura | `texImage2D(video)` en el hilo principal, sin control del momento | `ImageBitmap` desde el worker; 0,1 ms en el principal (medido con HAP) |

**Veredicto: (b).** (a) incumple tres requisitos del contrato (reloj del motor, bucle sin costura, `bounce`) y no se puede
probar sin ventana. Se descarta también como plan B: mantener dos rutas duplica fallos. Si un códec no se decodifica, el clip
se rechaza al importar con un mensaje, no se degrada en silencio.

### 2.3 H.264 y HEVC a 7196×912: límites
- **Nivel H.264 (cuenta [estimado]):** 7196×912 son 450×57 = 25 650 macrobloques. El tope por fotograma de los niveles 5.1/5.2
  es 36 864 (= 4096×2304): **cabe**. Macrobloques por segundo: a 30 fps 770 k (cabe en 5.1: 983 k); a 60 fps 1,54 M (sólo 5.2:
  2,07 M). Anchura máxima legal 8688 px. O sea: es H.264 legal si el codificador lo etiqueta 5.2.
- **Hardware (NVDEC) [estimado, no confirmado por búsqueda]:** el decodificador H.264 de NVIDIA se anuncia con un máximo de
  4096×4096; el de HEVC y AV1, de 8192×8192. Con 7196 px de ancho, **H.264 probablemente supera el límite de hardware y
  Chromium cae a FFmpeg por software**; HEVC y VP9 caben. Chromium comprueba resoluciones al arrancar el decodificador D3D11 y,
  si falla, reintenta por software [web: «we'll end up initializing the decoder and failing on the first decode (which will
  trigger software fallback)»]. En WebCodecs se ve con `hardwareAcceleration: 'prefer-hardware'` frente a `'no-preference'`.
- **Software H.264 a esa resolución [estimado]:** 6,56 Mpx por fotograma = 394 Mpx/s a 60 fps. FFmpeg multihilo en un i9
  de 24 hilos suele dar varios cientos de Mpx/s con tasas de bits normales: **posible, pero ocupa CPU** que comparten
  Unreal, el motor y los workers HAP. Un fotograma I420 son 9,8 MB: a 60 fps, **590 MB/s de subida por CPU**, el 40–60 % del
  techo de 1–1,5 GB/s del proceso GPU (`MEDIDAS`, §3.2 del plan); dos capas en fundido lo agotan. Con HAP eran 197 MB/s.
- **Lo normal será menor:** un MP4 de móvil o de stock es 1080p o 4K (≤ 3840×2160): hardware, sin problema. El ancho
  completo del lienzo sólo lo hará quien renderice a 7196×912 en H.264, y a ese se le aconseja HAP o HEVC.
- **Perfiles raros:** High 10 / 4:2:2 / 4:4:4 no tienen hardware y el software de Chromium no los cubre todos [a medir].
  Se detectan en `avcC` (profile_idc 110/122/244) y se rechazan o avisan según el resultado de P0.

### 2.4 Diseño: demux, decodificación, entrega
**Demux (Node y worker, mismo código; `engine/media/mov.js` ampliado).** Hoy `parseVideo` ya saca `offsets`, `sizes`, `pts`,
`fps`, edit list y chunks. Falta:
- `stsd`: `avc1/avc3` + `avcC`, `hvc1/hev1` + `hvcC`, `vp09` + `vpcC`, `av01` + `av1C` (descripción, perfil, nivel, profundidad).
- `ctts` (desfase de composición: **sin él los fotogramas B salen mal ordenados**), `stss` (muestras sync = keyframes),
  `sdtp` opcional. `pts` = `dts + ctts`; el orden de presentación se obtiene ordenando.
- `tkhd`: la matriz de rotación (los móviles graban en vertical con rotación 90°); se aplica al colocar la capa, no en el decodificador.
- `mp4a` + `esds` → `AudioSpecificConfig` (para el audio, §3). `ftyp` con marcas `isom/mp42/qt  /M4V ` se acepta aunque la extensión sea `.mp4`.
- MP4 fragmentado (`moof`, de algunas cámaras/OBS): **fuera de v1** con mensaje claro; si se pide, `mp4box.js` (BSD-3-Clause
  [web]) lo resuelve. `mediabunny` es MPL-2.0: **no** (la regla de `CLAUDE.md` sólo admite MIT/BSD/Apache/ISC).
- WebM/Matroska: EBML propio (Segment → Cues, Clusters, SimpleBlock/BlockGroup). ~250 líneas. Fase P4, y sólo si el director lo pide.

**Índice por clip.** `describeMovie` devuelve hoy `{fourcc, width, height, fps, frames, duration}`. Para vídeo nativo se añade
`codec` (cadena WebCodecs), `kind:'video'`, `gop` (máximo y medio entre keyframes), `vfr` (relación entre el intervalo
máximo y el mínimo de `pts`), `rotation`, `profile`, `bitDepth`, `chroma`.

**Worker `ui/js/mixer/video-worker.js`** (módulo, con Node como `hap-worker.js`: `nodeIntegrationInWorker` ya está activo y
`fetch(file://)` no sirve [código]). Mensajes iguales a los del worker HAP: `init`, `info`, `frame {path, idx}`, `close`.
- `idx` es el fotograma de la **línea de tiempo del motor** (`floor(time·fps)`). El worker lo traduce a muestra con la tabla de
  `pts` (búsqueda binaria: la última muestra con `pts ≤ (idx+0,5)/fps`). Así el VFR de los móviles se reproduce a su fps medio
  sin romper `playhead()` (que sólo sabe de fps constante) y se avisa al importar.
- **Modo secuencial:** si `idx` es la muestra siguiente a la última entregada, se alimenta al decodificador desde el fichero
  (`fs.readSync`, ~0,5 ms por fotograma en NVMe [código/MEDIDAS]). La salida de WebCodecs ya viene en orden de presentación.
- **Salto (seek):** `reset()` + `configure()`, alimentar desde el keyframe ≤ destino, descartar lo anterior al destino. El
  coste es el largo del GOP: 30 fotogramas con hardware ≈ 100–150 ms [estimado]; 250 fotogramas por software, más de 1 s.
- **Dos carriles por clip:** el principal y el del salto de bucle (`wrapTo`). Un único decodificador no puede estar en dos sitios:
  el prefetch del bucle se haría a costa de reiniciar la reproducción. El carril del bucle decodifica sólo K+1 fotogramas del
  principio del segmento y descansa.
- **Contrapresión:** no alimentar mientras `decodeQueueSize + salidas retenidas ≥ L + K + 2`. Es la lección central de F0:
  sin ventana acotada, 93–134 decodificaciones/s y 6,9 GB de VRAM en dos segundos.
- **Entrega:** `VideoFrame` → `createImageBitmap(frame)` (copia GPU YUV→RGBA, una vez) → `frame.close()` **enseguida** (los
  `VideoFrame` de hardware son superficies de un grupo pequeño: retenerlos bloquea el decodificador) → `postMessage` del bitmap.
  A partir de ahí es el camino HAP: `texSubImage2D(bitmap)` en el mezclador. `optimizeForLatency: true`.
- **Reproductor:** `HapPlayer` ya habla `ix {count, fps, pts, width, height}`, `drive()`, `arrive()`, `park()`. Se usa tal cual
  con `ix.kind = 'video'`; los códigos fatales del regex de `FATAL` se amplían (`no-decoder`, `unsupported-config`).

**Pool.** `HapPool` reparte fotogramas sueltos al primer worker libre, con **un** fotograma en vuelo por worker. Un
decodificador con estado pide otro reparto: `VideoPool` (o un modo del actual) con **afinidad** clip→worker (un clip, un
worker, así el decodificador no se mueve), **profundidad** de 4–6 peticiones en vuelo por worker y orden creciente. Cada
clip reproduciéndose = un `VideoDecoder`; los aparcados cierran el suyo. Límite práctico de sesiones simultáneas: **[a medir]**.

### 2.5 Seeks, bucles, bounce
- `in=0`: el fotograma 0 es keyframe; el *preload* de `media.preload` evita que el preroll de 120 ms (`PREROLL_MS`) se quede corto con software. `in` a mitad: se decodifica desde el keyframe anterior.
- `loop`: carril de bucle (§2.4), sin hueco si el segmento empieza en keyframe. `hold`/`clear`: el último fotograma queda en la textura y el decodificador se cierra.
- `bounce`: un GOP hacia delante en bitmaps y se reproduce al revés; memoria = GOP × fotograma (1080p, GOP 30: 250 MB). Se limita a GOP ≤ 30 y se avisa (`Bounce needs a short GOP`).
- Saltos del operador: un seek; el hueco se tapa con el último fotograma y cuenta como `late`.
- Import: rechaza sin decodificador, tamaño/perfil fuera de límite, MP4 fragmentado (v1). Avisa de VFR, rotación, GOP > 60, 4:2:2/10 bits, HDR (sin *tone mapping*). **Sin canal alfa** en vídeo: para alfa, HAP Alpha o imagen.

## 3. Audio
### 3.1 Qué hay hoy [código]
`/api/media/pcm?clip&from&n` (sólo este ordenador) lee PCM crudo del `.mov` (`pcmRanges` + `fh.read`); `audio-media.js` lo
convierte (`decodePcm`), llena un anillo y un worklet lo reproduce con la posición que da `playhead()`. `fetchPcm` es inyectable.
`mov.js` marca `mp4a` como «will not play (AAC)». Los metadatos del medio guardan `audio.format` (codificación PCM o `null`).

### 3.2 Opciones para AAC
| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| A. `AudioDecoder` en el audio page, a demanda | El audio page recibe el índice y decodifica trozos de 0,5 s con 2 paquetes de precalentamiento | Sin disco extra; memoria mínima | Cambia la ruta caliente (`_fill`); riesgo de huecos al salto; AAC pide el estado del decodificador; sólo AAC/MP3/FLAC/Opus/Vorbis con demux propio de cada contenedor |
| B. `decodeAudioData` del archivo entero | Una vez, en la ventana de audio | Muy simple; entiende WAV/MP3/AAC/FLAC/OGG | Todo el audio en memoria (5 min estéreo 48 kHz = 115 MB; 1 h = 1,4 GB); remuestrea a la frecuencia del contexto |
| C. **Decodificar una vez a una caché PCM** (recomendada) | La ventana auxiliar decodifica con `AudioDecoder` (AAC del MP4) o `decodeAudioData` (audio suelto) y escribe `<datos>/audio-cache/<fingerprint>.pcm` (s16le, 48 kHz, canales del origen) | La ruta caliente, el worklet y la sincronía **no cambian**; el desfase del codificador AAC se resuelve una sola vez; latencia cero al lanzar; offline | Un archivo derivado por medio (11,5 MB/min en estéreo s16); hay que regenerarlo si falta (como las miniaturas) |

**Recomendación: C**, con A descartada y B sólo como motor interno para audio suelto de menos de 20 min.
- **Sincronía:** la caché empieza en el instante 0 del medio. Se aplica la `shift` de la lista de edición del audio y la del
  vídeo (ya calculadas en `mov.js`) y se rellena de silencio si el audio arranca más tarde. Un AAC típico trae 1024–2112
  muestras de relleno (21–44 ms): sin quitarlas, el audio va ese tiempo tarde. **La prueba tiene que fallar si no se quitan.**
- **Servicio:** `pcm()` en `engine/media/index.js` elige la fuente: PCM del `.mov` (hoy), WAV directo, o la caché. Cabeceras
  `X-VT-Encoding: s16le` ya soportadas. Mientras la caché no existe responde 409 (`copying`, ya tratado como «en silencio, reintenta»).
- **Quién decodifica:** la ventana `media-helper` (§5). Sin ella (motor sin Electron) los clips con AAC quedan en silencio con el
  aviso de hoy; no es una regresión.
- **WAV (y `.aif`) sin tocar Chromium:** lector RIFF en Node, ~60 líneas, que produce el mismo objeto `audio` que `parseSound`
  y reutiliza `pcmRanges`/`decodePcm` con los trozos como un único chunk. Nada de caché.
- **Audio suelto MP3/AAC/M4A/FLAC/OGG/Opus:** `decodeAudioData` en el helper (≤ 20 min; si no, «Audio longer than 20 min: use WAV»).

### 3.3 Clips sólo de audio
`media.kind = 'audio'`: no tiene `video`; se le da `fps` 30 y `frames = round(duración·30)` sintéticos para que `playhead()`,
`segmentOf` y los fundidos funcionen sin ramas. El mezclador no crea reproductor ni textura; `audio-media.js` ya funciona por
clip del transporte, no por imagen. La celda de la rejilla muestra una forma de onda (la hace el helper: 160×90, un PNG).
## 4. Imágenes, secuencias y convertir a HAP
### 4.1 Imagen fija
- **Formatos** (Chromium decodifica con `createImageBitmap`): PNG, JPEG, WebP, AVIF, GIF y BMP. TIFF, HEIC, PSD, EXR y RAW **no**:
  mensaje con sugerencia («Export it as PNG or JPEG»). SVG fuera de v1.
- **Transporte:** `still: true` en el medio. `playhead()`: `time = in`, `frame = 0`, `done = false` para `hold` y `clear`
  con `out` nulo (duración «infinita»). Si el clip fija `out` (p. ej. 8 s) se comporta como hoy: tras `out`, `done`. Con
  `end:'next'` en una columna de piloto automático se usa `out` o 10 s por defecto. Cambio de ~10 líneas y la prueba de
  `playhead()` nueva (la actual de `hold` no debe cambiar).
- **Carga:** worker `fs.readFile` → `new Blob` → `createImageBitmap(blob, {imageOrientation:'from-image', premultiplyAlpha:'premultiply',
  colorSpaceConversion:'default'})` → bitmap al principal → `texSubImage2D` **una vez**. Sin ventana de petición ni pool.
  `park()` no libera la textura (es lo único que hay) hasta expulsar el clip; entonces se recicla.
- **Mipmaps:** una foto de 12 000 px mostrada a 7196 px se ve con *aliasing*. Para fijas, textura con niveles y
  `generateMipmap` tras subirla (una vez, 26 MB → +33 %); filtro `LINEAR_MIPMAP_LINEAR`.
- **Tamaño máximo:** `MAX_TEXTURE_SIZE` en ANGLE/D3D11 con una RTX es 16 384 [estimado, leer `gl.getParameter` en P0]. Una imagen mayor
  se reduce al cargar con `resizeWidth/resizeHeight` (calidad `high`) hasta 16 384 o 64 Mpx (256 MB de RGBA), lo que llegue
  antes, y **se avisa**. 8 bits por canal: el 16 bits se reduce, con aviso. Canal alfa: se respeta (premultiplicado, la convención del mezclador).
- **GIF/WebP/APNG animados:** primer fotograma, con aviso «Animated image: only the first frame plays. Export it as a video.».
- **Memoria:** 26 MB por imagen de 7196×912; 8 MB a 1080p. Las precargadas ya aparcan sólo con su primer fotograma: una fija
  ya *es* su primer fotograma, así que el *preload* es gratis.
- **Importación sin ventana:** las dimensiones salen de la cabecera en Node (PNG `IHDR`, JPEG `SOF`, WebP `VP8/VP8L/VP8X`,
  GIF, BMP, AVIF `ispe`): ~100 líneas en `engine/media/sniff.js`. Se rechaza lo que no se reconoce **sin necesitar Chromium**.

### 4.2 Secuencias de imágenes
Encajarían en `HapPlayer` (cada fotograma es independiente), pero PNG 7196×912 cuesta ~100–150 ms y JPEG ~30–40 ms por fotograma [estimado]: 4–5 workers para una capa a 30 fps, y miles de archivos que copiar y huellar. **Propuesta: sin secuencia nativa**; una carpeta de imágenes ofrece *Convert to HAP* (§4.3) y el clip resultante es HAP.

### 4.3 Convert to HAP: la ruta sin GPL
- VEATION ya tiene el codificador (`dxtEncodeCanvas`: codificación DXT en GPU; `snappyCompress`; `hapFrame` con trozos;
  `movBuild`: el MOV con audio PCM `sowt`) y es del mismo propietario. Se porta como en F1 se portó el decodificador.
- Entrada posible: todo lo que Chromium decodifica (H.264, HEVC con hardware, VP8/9, AV1, imágenes, secuencias). Salida: HAP
  o HAP Alpha (no HAP Q: Snappy a 60 fps pide dos workers, `MEDIDAS`).
- Se ejecuta en la ventana auxiliar: decodificar secuencialmente → fotograma a canvas → DXT en GPU → Snappy → disco.
  Tiempo [estimado]: 1–5× tiempo real. Disco: HAP pesa 10–30× un H.264 (1080p30 ≈ 30 MB/s → 9 GB por cada 5 min).
- Es **opcional** y va en la última fase: el flujo normal es reproducir tal cual.
- **Qué NO resuelve:** ProRes ni nada que Chromium no lea (§5).
## 5. ProRes y códecs que Chromium no decodifica
### 5.1 Qué se muestra al importar (texto exacto en inglés; el software es sólo inglés)
| Caso | Mensaje |
|---|---|
| ProRes / DNxHD-HR / Cineform / DXV / MPEG-2 / HAP Q Alpha, etc. en `.mov` o `.mxf` | `"clip.mov" is Apple ProRes, which VEATION Touch cannot play. Export it as H.264 or HAP.` |
| H.264/HEVC que esta máquina no decodifica | `"clip.mp4" is HEVC (H.265) and this computer has no decoder for it. Export it as H.264 or HAP.` |
| Mayor que el límite del decodificador | `"clip.mp4" is 8192×4320 H.264, larger than this GPU decodes (4096×4096). Export it smaller, as HEVC, or as HAP.` |
| Perfil no soportado | `"clip.mp4" is H.264 4:2:2 10-bit, which cannot be decoded here. Export it as 8-bit 4:2:0 (High profile) or HAP.` |
| MP4 fragmentado | `"clip.mp4" is a fragmented MP4. Export it with the index at the start (fast start) or as HAP.` |
| Formato de imagen no reconocido | `"photo.heic" is HEIC, which cannot be read. Export it as PNG or JPEG.` |
| Audio > 20 min no WAV | `"set.mp3" is longer than 20 min. Convert it to WAV.` |
| Avisos (se acepta) | `Variable frame rate: plays at 29.97 fps average.` · `Rotated clip (90°): shown upright.` · `Long GOP (250 frames): jumps and loops from the middle are slow. Export with a keyframe every second.` · `Bounce needs a short GOP.` · `Animated image: only the first frame plays.` · `Image larger than 16384 px: reduced.` |

Todas las listas de rechazados salen **en un solo mensaje al final**, como ya manda §4d.3.

### 5.2 Qué sugerir (en la documentación, sin automatizar)
FFmpeg: `ffmpeg -i in.mov -c:v hap -format hap -chunks 4 -c:a pcm_s16le out.mov` (HAP) o `-c:v libx264 -crf 18 -g 30 -pix_fmt yuv420p -movflags +faststart out.mp4` (keyframe por segundo a 30 fps). También Shutter Encoder, HandBrake y Adobe Media Encoder (con el exportador HAP). Resolume Alley sólo exporta DXV: no sirve.

### 5.3 ¿Se puede transcodificar ProRes sin GPL? Casi no
- **Sin FFmpeg ni libav\*: no existe una pieza MIT/BSD/Apache lista** (FFmpeg es LGPL con partes GPL; `libavcodec` incluye `prores`).
- **Decodificador propio:** ProRes está especificado en SMPTE RDD 36 (público): DCT por macrobloques con entropía Rice/Golomb
  y exp-Golomb. Un decodificador JS/WASM de 422/422 HQ/4444 son ~1 500 líneas y 2–3 semanas con pruebas, **más** una revisión
  legal de patentes de Apple [no verificada aquí]. Es una decisión de producto, no de P1.
- **`ffmpeg.exe` externo instalado por el cliente** (en `PATH`, nunca empaquetado, detectado al importar, invocado como
  proceso aparte para `ffmpeg -i x.mov -c:v hap …`), igual que el NDI Runtime que `CLAUDE.md` ya admite. Contradice «nada de FFmpeg
  en runtime» de este encargo; **requiere la decisión del director** y cambiar el párrafo de licencias. No se recomienda por defecto.
## 6. Cambios de importación (probe, validación, miniaturas)
**Probe.** Hoy `inspect()` (`import-worker.js`) es `movIndex` + `describeMovie` + huella + miniatura DXT, en un `worker_thread`
de Node. Nuevo: `sniffKind(head)` por bytes, no por extensión → `mov/mp4` (`ftyp`/`moov`), `webm` (EBML `1A45DFA3`), `image`
(PNG `89504E47`, JPEG `FFD8FF`, WebP `RIFF…WEBP`, GIF, BMP, AVIF), `wav` (`RIFF…WAVE`), `audio` (ID3/`FFFB`, `fLaC`, `OggS`, `ADTS`).
`describeMovie` se divide en `describeHap` (el actual) y `describeVideo` (códec nativo). El resultado lleva
`{kind, video?, audio?, image?, warnings}`.

**Lo que Node no puede saber:** si *esta* máquina decodifica el códec (§2.3). El motor pregunta al helper
(`media.canDecode {codec, width, height}` → `{ok, hardware, reason}`), con caché por `(codec, w, h)`. Sin helper: se acepta con el
aviso `Cannot check that this computer can decode "clip.mp4" (no desktop app).` y la comprobación se repite al lanzar el clip.

**Miniaturas.** Un MP4 no se puede decodificar en Node. Dos caminos considerados:
- *El UI decodifica un fotograma al soltar el archivo.* Funciona al importar (el `File` está en la página) pero **no regenera**
  una miniatura que falte, y el contrato §4d.4 dice que se regeneran si faltan. Descartado como único camino.
- ***El helper decodifica un fotograma y devuelve el PNG.*** (recomendado) El motor encarga `thumb {mediaId, frame}`;
  el helper decodifica la muestra (keyframe ≤ destino), reduce a 160×90 y 480 px y manda los PNG a una ruta local
  (`POST /api/media/thumb/<id>?w=160`, sólo este ordenador, límite de tamaño). Imágenes: `createImageBitmap` + `resize`. Audio: forma de onda.
- Sin helper: icono genérico por tipo (PNG fijo, con `png.js`) y se marca «no preview». La rejilla sigue siendo usable.
- Las miniaturas siguen en `<datos>/thumbs/<fingerprint>-<w>.png`: la caché y los teléfonos no notan nada.

**Biblioteca y show.**
- `library.js`: `isMovName` → `isMediaName(name)`; `rejectMessage` gana los códigos de §5.1; `sizeWarning` para imágenes.
- `show.js › normMedia`: hoy descarta lo que no sea HAP (`HAP_FORMATS[v.fourcc]`). Pasa a `kind` (`hap` por defecto, así los shows
  actuales no cambian) y `video.codec`; versión del esquema +1 con migración trivial. El `wire.js` compacto no lleva `kind==='hap'`.
- `index.js › importFiles`: el filtro `.mov` se cambia por el sniff; la copia, la huella (2 MB), el espacio, el reparto de
  celdas y «ya está en la biblioteca» **no cambian**. Los rechazos siguen en una sola lista.
- `server.js`: `POST /api/media/thumb/*` y `POST /api/media/audio-cache/*` (sólo local, `peerOf().local`).
- **Fuera de la biblioteca nada nuevo** (`copy siempre`, D7): una imagen de 40 MB o un MP4 de 2 GB se copian como un MOV.

**La ventana `media-helper`** (`app/main.js` + `app/media-helper.cjs`): `show:false`, `backgroundThrottling:false`,
`nodeIntegrationInWorker:true`, `sandbox:false` (como la de salida, `output-window.cjs`), navegación bloqueada fuera de
nuestro servidor. Hace trabajos por una cola que le manda el motor: `canDecode`, `thumb`, `audio-cache`, `convert` (P5).
Una ventana aparte, no la de salida, para que un fotograma 4K de miniatura no robe tiempo a los 60 fps.
## 7. Presupuesto de rendimiento y qué medir
### 7.1 Presupuesto (por capa, a 60 fps, 7196×912)
| | HAP (medido, `MEDIDAS`) | H.264/HEVC por hardware [estimado] | H.264 por software [estimado] | Imagen fija |
|---|---|---|---|---|
| Decodificación | ~11 ms/fotograma en un worker | < 3 ms/fotograma (en NVDEC; no usa CPU) | 8–25 ms/fotograma, varios hilos de Chromium | 0 tras cargar |
| Copia YUV→RGBA (`createImageBitmap`) | — | 1–3 ms de GPU | 1–3 ms + subida CPU 9,8 MB | — |
| Subida al proceso GPU | 197 MB/s | GPU→GPU: no cuenta | **590 MB/s** (40–60 % del techo) | 0 |
| Disco | 127–197 MB/s | 2–10 MB/s | 2–10 MB/s | 0 |
| VRAM | 130–260 MB | ≈ 130 MB + superficies del decodificador | ídem | 26–35 MB |

Conclusión a priori: **HEVC y VP9 por hardware y las imágenes entran sin problema; H.264 de ancho completo es el caso que
puede no salir.** A 1080p/4K, todo por hardware, el coste es pequeño frente a HAP.

### 7.2 Qué hay que medir (spike P0, en la RTX 4060 con Unreal abierto **y** en el servidor de XR Lab)
Un `tests/probe/` con un HTML para la ventana de salida (no se lanza desde un test automático: necesita GPU real).
1. `VideoDecoder.isConfigSupported` para `avc1`, `hvc1`, `vp09`, `av01` a 1920×1080, 3840×2160, 4096×2304, 7196×912 y 8192×4320,
   con `prefer-hardware` y `prefer-software`. Registrar la GPU y el controlador. Repetir con la 2.ª GPU (Intel) por si Chromium elige mal en Optimus.
2. Decodificar de verdad 10 s de cada uno (fuentes generadas con FFmpeg **fuera** del repo, para medir): fps sostenidos,
   uso de CPU, VRAM, `VideoFrame` retenidos máximos antes de bloquear el decodificador, número de decodificadores a la vez (1, 2, 4, 8).
3. `createImageBitmap(VideoFrame)` y `texSubImage2D(bitmap)` a 7196×912 y a 1920×1080, en ms de GPU (`EXT_disjoint_timer_query_webgl2`
   como en F0) y en el hilo principal; con el mezclador completo y Unreal abierto.
4. Seek: latencia desde `reset()` hasta el primer fotograma del destino, para GOP de 1, 15, 30, 60 y 250, con hardware y software.
5. Bucle: hueco al salto con y sin carril de prefetch. Bounce con GOP 30.
6. HEVC: que `isConfigSupported` y una decodificación real coincidan. `MAX_TEXTURE_SIZE`; tiempo y memoria de `createImageBitmap` con PNG/JPEG de 7196×912, 16 384 px y 100 Mpx.
7. AAC: desfase real vídeo/audio de un MP4 de móvil, de FFmpeg y de Adobe tras la caché (clic a t = 2,000 s). Memoria tras 30 min de bucle.
**Puertas:** si H.264 a 7196×912 por software no sostiene 30 fps con una capa y CPU < 50 %, **se rechaza por encima del límite
del hardware** (mensaje de §5.1). Si HEVC por hardware falla en la máquina de la sala, P4 se queda en VP9/AV1 y HEVC se
ofrece sólo con «Convert to HAP».
## 8. Archivos a cambiar

| Área | Archivos | Cambio |
|---|---|---|
| Formato (motor) | `engine/media/mov.js` · `sniff.js`, `wav.js` (nuevos) · `probe.js` · `import-worker.js` | `avcC/hvcC/vpcC/av1C`, `ctts`, `stss`, rotación de `tkhd`, `esds`, marcas `ftyp`; `describeVideo`; tipo por bytes; cabeceras de imagen; lector WAV; despacho por `kind`; miniatura delegada al helper |
| Biblioteca y show | `library.js` · `show.js` · `transport.js` · `index.js` · `server.js` | `isMediaName`, mensajes de §5.1; `normMedia` con `kind`/`video.codec` y migración de versión; `still` en `playhead()` (la prueba actual de `hold`/`clear` intacta); `importFiles` por sniff, cola al helper, `pcm()` por fuente; rutas locales `POST` de miniatura y caché de audio |
| Salida | `ui/js/mixer/video-worker.js`, `still-player.js` (nuevos) · `hap-pool.js` o `video-pool.js` · `hap-player.js` · `media-layers.js`, `gl.js` | decodificador con estado y dos carriles; fijas con mipmaps; afinidad y profundidad; `FATAL` con códigos nuevos; reproductor por `kind`; rotación al colocar |
| Helper | `app/main.js`, `app/media-helper.cjs` (nuevo), `ui/js/helper/*.js` (nuevo) | ventana oculta y cola de trabajos |
| Interfaz | `ui/js/live/*` | arrastre y selector aceptan todo; iconos de tipo; avisos en el inspector |
| Docs y empaquetado | `CLAUDE.md`, `ARCHITECTURE.md`, `MEDIA-SERVER.md` §3.3/§4d.3, `docs/OSC.md` (si cita sólo HAP) · `package.json › build`, `tests/media-library.test.mjs` | el helper y sus imports dentro de `app.asar` |

## 9. Riesgos
| # | Riesgo | Efecto | Mitigación |
|---|---|---|---|
| R1 | **Patentes** de H.264/AAC/HEVC: Electron ya distribuye `ffmpeg.dll` con esos códecs y el hardware decodifica HEVC con el controlador de la GPU | Si el software se licencia a terceros, puede haber obligaciones de *royalties* que ni este estudio ni el repo cubren | Consulta legal antes de vender; documentar que H.264/AAC vienen del Chromium de Electron |
| R2 | H.264 a lo ancho cae a software | CPU alta, subida 590 MB/s | P0; rechazar por encima del límite de hardware o aconsejar HEVC/HAP |
| R3 | `isConfigSupported` miente (HEVC) | Clip aceptado que luego no suena ni se ve | Decodificar una muestra real en `canDecode` |
| R5 | Seek lento con GOP largo | Lanzamientos y bucles con hueco | Avisos en el import; preload; «Convert to HAP» |
| R6 | VFR, edit lists y B-frames mal entendidos | Desfase de fotogramas | Fixture con `ctts` y VFR escrito a mano; la prueba compara contra el escritor |
| R8 | La caché de audio falta o está vieja | Clip sin sonido hasta regenerar | 409 conocido, regeneración en segundo plano, problema visible en Health |
## 10. Plan por fases y pruebas
Convención del proyecto: cada fase lleva su prueba y se pregunta si **sabe fallar**. Los fixtures se generan al ejecutar la
prueba (`tests/fixtures/media/`), no se descargan.
| Fase | Contenido | Pruebas (y cómo fallan) |
|---|---|---|
| **P0** Medidas (∥ P1) | Spike de §7.2; `docs/research/media-formats-medidas.md` con tabla y decisión de las puertas | No es código del producto; el informe sustituye las estimaciones de este documento |
| **P1** Imágenes | `sniff.js`, `still`, `still-player`, helper mínimo (miniaturas de imagen), mipmaps, límite 16 384, avisos, mensajes | `tests/media-image.test.mjs`: cabeceras PNG/JPEG/WebP/GIF/BMP/AVIF generadas por una función del test, con dimensión conocida (falla si se lee mal el `IHDR`); `playhead()` de `still` (falla si `hold` acaba); en Electron oculto: la esquina de una imagen con marcadores sale en su sitio y sin voltear; imagen de 20 000 px se reduce y avisa |
| **P2** Audio | `wav.js`, caché PCM por el helper, `pcm()` por fuente, clips `kind:'audio'`, forma de onda | WAV en Node: valores exactos (falla si el endian/bits se cruzan); AAC de fixture: la caché empieza en 0 y el clic está a 2,000 s ± 1 ms (**falla** sin descontar el relleno del codificador); audio-only en el transporte con fundido; `audio-media.test.mjs` sigue verde |
| **P3** H.264 en MP4 | `mov.js` ampliado, `describeVideo`, `video-worker`, pool con afinidad, reproductor, `canDecode`, miniaturas de vídeo | Demux: un MP4 sintético escrito en el test con `ctts`/`stss`/VFR/rotación; falla si se ignora `ctts` (orden de fotogramas) o `stss` (seek). En Electron: un H.264 pequeño con marcadores por fotograma (fixture binario de pocos kB, generado una vez fuera del repo y registrado con su origen) → fotograma exacto en seek, en bucle y en `bounce`; recuento de `VideoFrame` abiertos = 0 al aparcar; 10 min de bucle sin crecimiento de memoria; `late` = 0 a 1080p |
| **P4** HEVC, VP9, AV1, WebM | Cadenas de códec por contenedor; EBML mínimo; criterio de P0 | Igual que P3 por códec, saltando con mensaje de «not supported here» donde la máquina no decodifique (la prueba declara qué se saltó); EBML contra un escritor del test |
| **P5** Convert to HAP | Port del exportador de VEATION al helper; carpeta de imágenes → HAP; progreso y cancelación en la interfaz | El HAP que sale se lee con `describeMovie` + `decodeFrame` y se compara con la entrada (error < umbral DXT); falla si se pierde un fotograma o el audio se desplaza; cancelar no deja `.part`; secuencia de 30 PNG |
**Orden y esfuerzo [estimado]:** P0 1–2 días · P1 3–4 · P2 4–5 · P3 8–12 · P4 4–6 · P5 8–10. Hasta P2 el director ya tiene fotos y sonidos; con P3, los MP4 habituales. Cada fase termina con `npm test` y `npm run check` verdes, `CLAUDE.md`/`ARCHITECTURE.md` al día y la medida repetida en XR Lab antes de marcar un formato como soportado.

## 11. Lo que queda abierto
1. **Patentes** (R1) y `ffmpeg.exe` externo (§5.3): decisión del director.
2. **Límite real de NVDEC para H.264** y soporte de HEVC en este Electron: sólo P0 lo cierra; esta sesión no pudo ejecutar Electron.
3. **WebM con alfa:** el WebCodecs de VP9 no entrega alfa; la ruta es HAP Alpha. **Perfiles de color** (P3, CMYK): se convierten a sRGB en Chromium, sin verificar.
4. **Fuentes:** ficha npm de `mp4box.js` (BSD-3-Clause) y cronología HEVC de Chromium (M107) por búsqueda web; el resto es código del repo o cuentas. El tope de 4096 de NVDEC y los tiempos por software son conocimiento previo, **no verificados**.