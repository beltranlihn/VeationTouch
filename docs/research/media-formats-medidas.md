# Formatos de medios: medidas (P0 y P3)
> **Fecha:** 2026-11-21. **Máquina:** el PC de la sala de pruebas de Beltrán (24 hilos, NVIDIA GeForce RTX 4060 Laptop, controlador 621.24, ANGLE/D3D11), Electron 44.7.0 (Chromium 152), con Unreal y la app VEATION Touch abiertas. Sustituyen las estimaciones de `media-formats.md` §2.3 y §7. **No** se han repetido en el servidor de XR Lab: antes de dar un formato por soportado allí, repetir con `tests/probe/video-wide.mjs`.
> Fuentes de prueba generadas **fuera del repo** con FFmpeg 8.1 (libx264 `-preset veryfast -crf 24 -bf 2 -level 5.2`, `testsrc2`); las del repo (`tests/fixtures/media/`) son de pocos kB (origen en `make-h264.mjs`).

## 1. `VideoDecoder.isConfigSupported` (ventana oculta, 1 ejecución)
| Códec | 1920×1080 | 3840×2160 | 4096×2304 | **7196×912** | 8192×4320 |
|---|---|---|---|---|---|
| H.264 (`avc1.640033`, también `avc1.64002A`) hardware | sí | sí | sí | **no** | no |
| H.264 software | sí | sí | sí | **sí** | sí |
| HEVC (`hvc1.1.6.L153.B0`) hardware | sí | sí | sí | sí | sí |
| HEVC software | no | no | no | no | no |
| VP9 / AV1 (hardware y software) | sí | sí | sí | sí | sí |

- Confirma la estimación: **H.264 ancho completo cae a software** (NVDEC llega a 4096 de ancho); HEVC sólo por hardware; VP9 y AV1 entran siempre.
- `MAX_TEXTURE_SIZE` = 16384. `AudioDecoder`: AAC-LC, MP3, Opus sí (FLAC pide `description`). `VideoEncoder` H.264 y `AudioEncoder` AAC existen en Electron (no se usan: sólo se han mirado para los fixtures).

## 2. H.264 7196×912 por software (P3)
Mismo contenido (`testsrc2`, 17,7 Mb/s a 60 fps), reproducido en la página de salida real (ventana de salida, escala 0,25) 5–8 s:
| Ritmo | Mpx/s | Resultado |
|---|---|---|
| **30 fps** (GOP 30) | 197 | **limpio**: 30,0 fotogramas nuevos/s, 0 saltados, **0 tarde de 360**, latencia petición→bitmap 3,4 ms; CPU de la máquina entera ≈ 23 % durante la prueba (incluye el arranque de las ventanas) |
| 45 fps (GOP 45) | 295 | **se cae**: ~1,5–2 fotogramas/s mostrados, el 96 % tarde |
| 60 fps (GOP 60) | 394 | **se cae** igual (~2,7/s) |

Qué limita (medido aparte, en una página, sin el mezclador): el **decodificador solo** hace ~117 fps (8,6 ms/fotograma); decodificar **y** pasar a `ImageBitmap` (`createImageBitmap`, 3 ms por fotograma) 65–76 fps; el resto es la subida de 26 MB por fotograma (RGBA 7196×912) desde memoria de CPU a la textura, la cifra de «590 MB/s» de §2.3 que se confirma como el techo real. No es el decodificador.

**Decisión implementada** (`MediaEngine._checkVideo`): el vídeo decodificado por CPU se acepta con aviso («is decoded by the CPU … (38 fps at best)») y se **rechaza** por encima de 250 Mpx/s (7196×912: 38 fps) con el ritmo que sí funcionaría. El umbral queda entre lo medido limpio (197) y lo que se cae (295). **Pendiente:** la caída por encima del umbral es un precipicio (de 30 a ~2 fps), no una degradación suave; el reproductor no sabe mostrar «al ritmo del decodificador». Con el umbral en el import no se llega ahí, pero un clip aceptado cuando el PC está libre puede caerse con la CPU ocupada: repetir en XR Lab con Unreal abierto.

## 3. Audio AAC → caché PCM (P2/P3)
`h264-click.mp4` (AAC-LC mono 48 kHz, 5 ms de clic a **2,000 s** exactos): tras quitar el relleno del codificador (1024 muestras = 21,3 ms, la lista de edición) y alinear con el primer fotograma presentado, el clic está en el fotograma 96000 ± 48 (±1 ms) de la caché. La prueba (`tests/media-page.test.mjs`) **falla** si no se resta (queda en 97024). MP3 por `decodeAudioData` (48 kHz): decodifica y el clic cae donde toca (± 50 ms: el MP3 trae su propio retardo).

## 4. Sin medir todavía
GOP largos de 250 fotogramas y su tiempo de salto; el límite de decodificadores simultáneos; fuga de memoria tras 30 min de bucle; HEVC (P4); el servidor de XR Lab.
