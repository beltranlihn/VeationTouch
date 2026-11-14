# Construir un servidor LiDAR táctil propio, sin copyleft

**Resumen ejecutivo.** El sistema es viable con un stack 100 % permisivo: un motor en TypeScript dentro de un `utilityProcess` de Electron, que habla UDP directamente con los S2E mediante un driver propio escrito a partir del protocolo publicado por Slamtec, sin envolver el SDK en C++. Ese motor ejecuta el pipeline (fondo por bin angular, segmentación, centroide con corrección de contacto, fusión, tracker Kalman con Hungarian y One Euro) y emite OSC (un bundle por frame y muro), TUIO 1.1 (un puerto por muro) y WebSocket. El mismo proceso sirve por HTTP la SPA de calibración que se abre desde una tablet. El arranque automático debe hacerse en la sesión interactiva de Windows (auto-login más tarea programada), no como servicio, porque los servicios corren en sesión 0 y no pueden mostrar ventanas ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/services/interactive-services)). El hueco competitivo es claro: Laser's Track solo soporta Hokuyo, Augmenta documenta Hokuyo, Modulo Kinetic exige un media server con dongle, y ninguno documenta calibración desde móvil, perfiles por sala y panel de salud a la vez. Las incertidumbres críticas son físicas y solo se resuelven con el hardware: ruido real del S2E sobre piel y ropa oscura, crosstalk entre sensores que se miran a través de la sala, planitud del plano de escaneo a pocos centímetros de la pared y comportamiento ante desconexión del cable. En este informe, lo que lleva cita es un hecho de fuente; lo marcado **[Inferencia]** es razonamiento propio o una estimación, y debe validarse con el hardware real (sección 9).

## 1. El S2E es un servidor UDP simple que conviene programar a mano

### Hechos del sensor

El S2E entrega **32.000 muestras/s a 10 Hz nominales con 0,1125° de resolución angular**, alcance de 30 m al 90 % de reflectividad y 10 m al 10 %, zona ciega de 0,05 m, exactitud de ±30 mm y planitud del campo de escaneo de ±1,5° ([Slamtec S2](http://www.slamtec.com/en/s2/spec)). Es láser de 905 nm clase 1, IP65, alimentación de 9 a 28 V (12 V típico) ([datasheet S2E v1.5](https://bucket-download.slamtec.com/837162e04b2bbba549e56cf8dfb621f44df100f6/SLAMTEC_rplidar_datasheet_S2E_v1.5_cn.pdf)). La corriente de arranque típica es de 1,2 A y hasta 1,5 A a 12 V; el manual avisa de que con tensión insuficiente la medida no es precisa, y recomienda precalentar más de 2 minutos para la mejor exactitud ([manual S2E](https://bucket-download.slamtec.com/5350555d005bfd7a8685fcea6e80e9edb764adb1/SLAMTEC_rplidarkit_usermanual_S2E_v1.0_en.pdf)). El código de modelo del datasheet v1.5 es S2M1-R2E, con pitch positivo de 0° a 1,5° ([datasheet S2E v1.5](https://bucket-download.slamtec.com/837162e04b2bbba549e56cf8dfb621f44df100f6/SLAMTEC_rplidar_datasheet_S2E_v1.5_cn.pdf)).

### Hechos del protocolo

El LiDAR es servidor UDP, por defecto en **192.168.11.2:8089**; el PC debe estar en esa subred con otra IP ([manual S2E](https://bucket-download.slamtec.com/5350555d005bfd7a8685fcea6e80e9edb764adb1/SLAMTEC_rplidarkit_usermanual_S2E_v1.0_en.pdf)). Las peticiones son `0xA5` + comando + tamaño + payload + checksum XOR; las respuestas llevan descriptor `0xA5 0x5A` ([protocolo S2E](https://bucket-download.slamtec.com/29ed73b84370f1ff1e3c09022b79976b46c6558f/SLAMTEC_rplidarkit_protocol_S2E_v1.0_cn.pdf)). Hay tres modos de escaneo (Standard, DenseBoost, Sensitivity). El modo **Sensitivity (HQ)** envía paquetes de 781 bytes con 96 nodos de 8 bytes (ángulo, distancia, calidad 0-255, flag de inicio), timestamp de 64 bits en µs y CRC32; DenseBoost "sacrifica calidad de señal" y no transmite ángulo por muestra ([protocolo LR001](https://bucket-download.slamtec.com/1cb3edd319c0fee6922fc5962e7765e887eccc36/LR001_SLAMTEC_lidar_protocol_v1.0_en.pdf)). Comandos útiles: STOP `0x25`, RESET `0x40`, EXPRESS_SCAN `0x82`, GET_HEALTH `0x52`, GET_INFO `0x50`, MOTOR_SPEED_CTRL `0xA8`. El timestamp HQ es el reloj interno del sensor, no el del host. El canal UDP del SDK oficial es un socket de datagramas sin keepalive ([sl_udp_channel.cpp](https://raw.githubusercontent.com/Slamtec/rplidar_sdk/master/sdk/src/sl_udp_channel.cpp)).

### Por qué driver propio en TypeScript

Hay tres opciones: addon N-API sobre el SDK, driver TypeScript con `node:dgram`, o sidecar en C++. No existe binding npm para el S2E: solo `node-rplidar`, orientado al RPLidar V1 por serie ([node-rplidar](https://gh.r-mj.com/Awk34/node-rplidar)); el wrapper Python `pyrplidarsdk` (MIT) soporta UDP pero solo publica ruedas Linux ([PyPI](https://pypi.org/project/pyrplidarsdk/)). La licencia del SDK oficial es ambigua: el LICENSE es BSD-2, pero el README dice a la vez "GPLv3" en la introducción y que las aplicaciones demo son GPLv3 ([LICENSE](https://raw.githubusercontent.com/Slamtec/rplidar_sdk/master/LICENSE), [README](https://raw.githubusercontent.com/Slamtec/rplidar_sdk/master/README.md)). **COPYLEFT: las demos (`ultra_simple`, `simple_grabber`, `frame_grabber`) son GPLv3; no copiarlas.** Además, el SDK compila en Windows con soluciones de Visual Studio 2010/2019 ([README](https://github.com/Slamtec/rplidar_sdk)).

**[Inferencia]** La recomendación es el driver TypeScript clean-room a partir del PDF de protocolo. A 4 sensores, el HQ equivale a unos 333 paquetes/s y ~2,1 Mbit/s por sensor (cálculo propio), trivial para Node. Elimina compilación nativa, rebuild por ABI de Electron y la duda de licencia, y da control total de timeouts y reconexión. El coste es cubrir a mano comportamientos no documentados; por eso el SDK y RoboStudio se usan solo como referencia de prueba. Si algo del protocolo (por ejemplo el comando de `setLidarIpConf`) no está en el PDF, se lee en `sl_lidarprotocol_codec.cpp` del SDK (BSD-2) sin copiar código. La configuración de IP de cada unidad se hace una a una en enlace aislado, porque todas salen con 192.168.11.2 (los documentos no prohíben varias en la misma red, pero no se verificó).

Hay dos contradicciones documentales que se resuelven en banco. El manual del Interactive Toolkit habla de modo TCP para LiDAR Ethernet, mientras que manual y datasheet del S2E dicen UDP 8089 ([Toolkit](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2)); se asume UDP. El paso a paso de Windows del manual pide poner el PC en 192.168.11.2, que choca con su propio aviso: es una errata aparente, y se usará otra IP (por ejemplo 192.168.11.5).

### La geometría del montaje (parámetros derivados)

**[Inferencia]** Con 0,1125°, la separación lateral entre muestras es r × 0,00196: unos 2 mm a 1 m, 4 mm a 2 m y 8 mm a 4 m; un dedo de 15 mm recibe unas 7, 4 y 2 muestras a esas distancias. La planitud de ±1,5° implica hasta ±78 mm de desviación del plano a 3 m (3000 × tan 1,5°), muy superior a una separación de 15-25 mm respecto a la pared. Esto convierte la calibración de inclinación por unidad, con jig de montaje, en requisito de instalación, no en detalle. Debajo del sensor (x≈0) hay una zona sin cobertura de unos centímetros. Slamtec solo documenta para su toolkit un offset de unos 50 cm entre LiDAR y el área interactiva ([Toolkit](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2)); no existe recomendación oficial de distancia plano-pared ni de montaje centro vs. esquina.

## 2. Arquitectura: un motor aislado, una interfaz servida por HTTP

### Hechos de Electron y Windows

Electron 43, 44 y 45 son las ramas soportadas en noviembre de 2026, todas con Node 24; la 45 (Chromium M156) salió el 20 de octubre de 2026 y tiene soporte hasta el 27 de abril de 2027 ([endoflife.date](https://endoflife.date/electron)). `utilityProcess.fork()` crea un proceso hijo con Node y puertos de mensajes, comunicado por `postMessage` / `process.parentPort`; los `MessagePortMain` pueden transferirse para que renderer y motor hablen directamente ([docs utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports)). La documentación no describe reinicio automático: hay que escribir el supervisor. Los eventos `'exit'` del proceso y `child-process-gone` de `app` detectan caídas; `app.requestSingleInstanceLock()` evita duplicados; `app.getAppMetrics()` da CPU y memoria por proceso ([API app](https://www.electronjs.org/docs/latest/api/app)). Un `crashReporter` con `uploadToServer: false` guarda minidumps locales, adecuado para operación offline ([crashReporter](https://www.electronjs.org/docs/latest/api/crash-reporter)). Un fix reciente de Electron corrige un crash al llamar `postMessage()` a un utilityProcess ya terminado, por lo que hay que proteger los envíos ([PR 53293](https://releases.electronjs.org/pr/53293)).

Como precedente de arquitectura, Bitfocus Companion (licencia MIT según su LICENSE.md) es un monorepo Node/TypeScript con paquetes separados de servidor, web UI, launcher, librería compartida y e2e, probado con Vitest ([LICENSE.md](https://raw.githubusercontent.com/bitfocus/companion/main/LICENSE.md), [DEVELOPER.md](https://raw.githubusercontent.com/bitfocus/companion/main/DEVELOPER.md)). Nota: la API de GitHub devolvió NOASSERTION para su licencia en otra consulta ([GitHub](https://github.com/bitfocus/companion)); se ha leído el LICENSE.md directamente, pero conviene confirmar antes de reutilizar código (solo se propone copiar el patrón).

### Topología recomendada

**[Inferencia]** Cuatro bloques:

| Bloque | Responsabilidad | Notas |
|---|---|---|
| Main (supervisor) | Tray, ventanas, ciclo de vida, config, reinicio del motor | Delgado; no toca datos de scan |
| Motor (`utilityProcess`) | Drivers UDP, pipeline, tracker, salidas OSC/TUIO, servidor HTTP/WS | Mismo código ejecutable como Node puro para tests |
| Renderer operador | UI de escritorio | Recibe nube decimada a 30 Hz por MessagePort |
| Renderer de proyección | Ventana sin marco en el display 3840×2400 | Cuadrantes de 1920×1200 por CSS/canvas |

La clave es que el servidor HTTP/WebSocket vive en el motor: si el renderer se cierra o falla, la tablet sigue funcionando. Para el repositorio se propone un monorepo con paquetes `core` (algoritmos puros, sin APIs de Electron), `drivers/*` (interfaz `SensorDriver`: `start/stop`, eventos `scan|status|error`), `protocol` (esquemas y tipos compartidos), `server`, `ui`, `app` y `sim` (simulador y reproductor de grabaciones). Un `ReplayDriver` que cumpla la misma interfaz permite regresión determinista, desarrollo de UI sin hardware y soak tests (modelo inspirado en Companion, citado arriba). Si el perfilado muestra puntos calientes, el siguiente escalón es WASM o un módulo Rust con napi-rs, que usa Node-API estable y no obliga a recompilar por versión de Electron ([napi-rs](https://github.com/napi-rs/napi-rs)); el sidecar `.exe` supervisado queda como última opción (todo esto sin medición previa).

**[Inferencia, validar]** Los datos de scan fluyen motor → renderer por puertos directos con `ArrayBuffer` transferido. No hay fuente que confirme copia cero, ni soporte de `SharedArrayBuffer` entre procesos; el volumen (menos de 1 MB/s por sensor tras decimar) lo hace poco crítico, pero hay que medirlo.

### Servidor web y stack de UI

Fastify, Hono, `ws` y `bonjour-service` son MIT ([Fastify](https://raw.githubusercontent.com/fastify/fastify/main/LICENSE), [Hono](https://raw.githubusercontent.com/honojs/hono/main/LICENSE), [ws](https://raw.githubusercontent.com/websockets/ws/master/LICENSE), [bonjour-service](https://raw.githubusercontent.com/onlxltd/bonjour-service/master/LICENSE)). uWebSockets.js es Apache-2.0 pero se instala desde etiquetas de GitHub y aporta binarios nativos sin necesidad a esta escala ([uWebSockets.js](https://github.com/uNetworking/uWebSockets.js)). **[Inferencia]** Fastify más `ws` sirven la SPA a la ventana de Electron y a la LAN, y un servidor de estado autoritativo (cliente envía intenciones, servidor valida contra esquema y difunde parches versionados) evita conflictos entre escritorio y tablet. El tema del frontend no se investigó; lo razonable es React con componentes MIT, render Canvas2D/WebGL (PixiJS o regl, licencias por verificar) con tasa limitada en tablet y un protocolo binario para nubes de puntos (todo sin verificar).

## 3. Pipeline de algoritmos y parámetros iniciales

Todo lo de esta sección es diseño propio salvo lo citado. Los números son **estimaciones de partida** que se afinan con grabaciones reales y un barrido paramétrico offline.

### Etapas y valores iniciales

| Etapa | Qué hace | Parámetros iniciales (estimados) |
|---|---|---|
| 1. Resampleo | Binado angular fijo (0,1125° o 0,225°), tablas sin/cos precalculadas, NaN en bins vacíos | Float32Array preasignados |
| 2. Filtro de calidad | Descartar rango ≤0, <0,05 m, calidad bajo umbral aprendido, rango más allá de diagonal de sala + margen | Umbral de calidad: tras histograma de intensidad en sitio |
| 3. Shadow/mixed pixel | Estilo `ScanShadowsFilter` de ROS (`laser_filters`, BSD-3-Clause) ([repo](https://github.com/ros-perception/laser_filters)) | `min_angle` ≈5°, `max_angle` ≈175°, ventana 2-3 |
| 4. Mediana temporal | Mediana de 3 muestras por bin | n=3 |
| 5. Fondo | Mediana de N=50-100 scans por bin, más dispersión (MAD o p5-p95). Primer plano si `B[i]-r[i] > max(T_min, k·S[i])` y solo si está más cerca que el fondo | T_min 30-40 mm, k≈4; bin "inestable" si S>30 mm; actualización lenta 0,01/frame solo tras 10-30 s en fondo y congelada cerca de tracks |
| 6. ROI | Transformar a marco del muro; conservar el rectángulo del muro con margen de 2-5 cm | Banda de profundidad 8-10 cm; polígono por sensor |
| 7. Segmentación | Ruptura por adyacencia angular (estilo Dietmayer), tolerando 1-2 bins inválidos | `T_d(r) = max(d_min, c·r·Δθ)`, c≈3-4, d_min 15-20 mm |
| 8. Filtro de tamaño | Aceptar blobs con cuerda 10-180 mm y ≥2 puntos; >180-200 mm = "objeto grande" (cuerpo) | Estimaciones; calibrar con sesiones reales |
| 9. Punto de contacto | Centroide del arco + desplazamiento R_mano ≈20 mm a lo largo del rayo sensor→centroide; con ≥5 puntos, ajuste de círculo de radio 25-35 mm | Corrección de sesgo por sensor antes de fusionar |
| 10. Fusión | Transformar con la pose 2D de cada sensor, fusionar pares de sensores distintos a menos de 30-50 mm con media ponderada por 1/r², unión (no intersección) | d_merge 30-50 mm |
| 11. Tracker | Hungarian + gating, Kalman a velocidad constante [x, y, vx, vy], ciclo de vida 2 de 3 para confirmar, coasting 3-5 frames (extensible si hay oclusión) | Puerta `max(150 mm, v·dt·2,5+80 mm)`; σa 5-10 m/s²; σ medida ≈8 mm + 3 mm/m |
| 12. Suavizado | One Euro por eje en milímetros sobre el stream medido (a 10 Hz) | fcmin≈1 Hz, β 0,005-0,02, dcutoff 1 Hz |
| 13. Salida a 60 Hz | Híbrido: interpolar si hay siguiente medida; extrapolar con velocidad amortiguada limitada a 100 ms; opción "latencia vs suavidad" | Interpolación por defecto para triggers; predicción para pintar; también salida cruda a 10 Hz |

Nota sobre el ROI: la banda de profundidad (8-10 cm) refiere a un plano a 2-3 cm de la pared; el margen del rectángulo del muro es de 2-5 cm.

### Evidencia que respalda las decisiones

Slamtec publica un flujo equivalente en su Interactive Toolkit: merge distance mayor de 30 mm, filtro tipo Kalman con parámetros Q y R que suaviza "a costa de latencia", y salida TUIO por el puerto 3333 ([Toolkit](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2)). Sobre el One Euro, la guía oficial de ajuste es poner β=0 con fcmin≈1 Hz, ajustar fcmin en reposo y subir β en pasos de 10 con movimiento rápido; hay implementaciones de referencia BSD/MIT en JS/TS ([Casiez](https://gery.casiez.net/1euro/)). El MIT LaserWall ya seguía varias manos con un escáner "siempre que no se ocluyan" ([LaserWall](https://paradiso.media.mit.edu/SpectrumWeb/captions/Laser.html)), y el sistema ISS 2011 con dos escáneres fusionaba el mismo toque visto por ambos en un solo evento TUIO ([ACM](https://unpaywall.org/10.1145%2F2076354.2076408)).

### Decisiones de diseño y su razonamiento

**[Inferencia]** A 10 Hz una mano rápida (2-3 m/s) se desplaza 20-30 cm entre scans, por eso la puerta de asociación es generosa y se apoya en la predicción de Kalman. El tiempo hasta "down" estará dominado por la confirmación de 2 frames (≈200 ms); emitir "down" en el primer frame reduce latencia pero genera toques fantasma. La edad media de una medida es media revolución (50 ms), y el sesgo de contacto (el sensor solo ve la cara cercana de la mano, 15-40 mm) lo absorbe en parte la homografía, pero no si depende de rango y ángulo, de ahí los puntos extra de verificación. Para oclusión, dos sensores por muro en esquinas superiores opuestas reducen mucho la sombra (un punto solo queda oculto a ambos si es colineal con los dos); con un solo sensor central, dos manos en la misma columna vertical se ocultan. La arquitectura soporta N sensores por muro, y con uno solo se compensa con coasting y marcado de "ocluido". El sistema marca tracks con "ocluido" si un clúster más cercano cubre su rumbo, en lugar de borrarlos.

Los eventos derivados son `down`, `move`, `up` y `hold` (inmóvil dentro de 15-20 mm durante 500 ms). Las zonas son polígonos con test punto-en-polígono, debounce de 2 frames, histéresis de 10-20 mm, cooldown opcional de 300 ms, y un contador de "simultaneidad" (toques de IDs distintos en una ventana de 1 s) para experiencias grupales. Un solo plano no distingue hover de toque; solo un segundo plano (segundo escáner apilado) lo resolvería y queda fuera de alcance. Las IDs de sesión son uint32 monótonas, con un índice "slot" reciclado (0-31) para apps que esperan pocos dedos.

El cómputo es trivial: unas 128.000 muestras/s en total para 4 sensores, microsegundos por muestra en JS. Lo importante es evitar asignaciones por frame (pools de tracks, arrays reutilizados) para no generar jitter por GC, y mantener el tracker como función pura de (stream con timestamps, configuración), con PRNG con semilla para RANSAC. Con ello, grabar los datagramas HQ crudos y reproducirlos da pruebas de regresión y barridos (métricas: cambios de ID, fragmentaciones, falsos toques/minuto en pared vacía, jitter en reposo).

Sobre sincronía entre sensores: no están sincronizados en fase de rotación (desfase de hasta 100 ms), así que cada detección lleva su timestamp (`t_scan_inicio + θ/2π · T_rot`, con reloj monótono del host en la llegada) y el Kalman admite actualizaciones asíncronas por sensor. El timestamp HQ del sensor sirve solo para corregir jitter relativo de ese sensor.

### Bibliotecas permisivas aprovechables

| Función | Paquete | Licencia (npm/GitHub) |
|---|---|---|
| OSC salida | `node-osc` 11.7.1 | Apache-2.0 |
| OSC alternativa con WebSocket | `osc-js` 2.4.1 | MIT (el campo GitHub es null; verificar LICENSE) |
| Hungarian | `munkres-js` 1.2.2 | Apache-2.0 OR BSD-3-Clause |
| One Euro | `1eurofilter` 1.3.0 | BSD-3-Clause (verificar LICENSE del repo) |
| Clustering | `density-clustering` | MIT |
| Homografía / álgebra | `perspective-transform`, `ml-matrix`, `gl-matrix` | MIT |
| Punto en polígono | `point-in-polygon` | MIT |
| mDNS / QR | `bonjour-service`, `qrcode` | MIT |

Fuente de todas las filas: metadatos del registro npm y de la API de GitHub consultados el 2026-11-14 (sin URL de página única; repos en [osc-js](https://github.com/adzialocha/osc-js), [node-osc](https://github.com/MylesBorins/node-osc), [munkres-js](https://github.com/addaleax/munkres-js), [OneEuroFilter](https://github.com/casiez/OneEuroFilter)); los archivos LICENSE no se leyeron directamente, así que hay que verificarlos antes de adoptar. **Trampas de licencia, marcadas como COPYLEFT o dudosas:** `osc` (osc.js) es "MIT OR GPL-2.0": si se usa, elegir MIT y documentarlo, pero además arrastra `serialport`; el paquete npm `tuio` (Tuio.js) es GPL; las librerías de referencia TUIO de Kaltenbrunner (`TUIO11_CPP` es LGPL-3.0, Java y TUIO20 aparentemente LGPL, el simulador GPL-2.0 según un índice de terceros) son copyleft ([TUIO11_CPP](https://github.com/mkalten/TUIO11_CPP)). Chataigne es GPL-3.0 ([repo](https://github.com/benkuper/Chataigne)) y Open Stage Control es GPLv3 ([framagit](https://framagit.org/jean-emmanuel/open-stage-control)): solo para aprender. El cliente de pharus de PIE (UnityTrackingClient) es CC-BY-SA-4.0, con share-alike ([repo](https://github.com/Playful-Interactive-Environments/UnityTrackingClient)). `LidarTracker` (FifthChat) no declara licencia: tratarlo como todos los derechos reservados y no copiar ([repo](https://github.com/FifthChat/LidarTracker)). **[Inferencia]** TUIO 1.1 es un perfil pequeño de OSC (`/tuio/2Dcur` con `source`, `alive`, `set`, `fseq`), por lo que un codificador propio sobre `node-osc` evita todas las bibliotecas TUIO copyleft. Los repositorios de TouchDesigner con licencia permisiva (por ejemplo `SlamtecLidarTDCPPCHOP`, MIT) son solo material de consulta ([repo](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP)). Para el SDK de Slamtec, la opción es pedir confirmación escrita de la licencia si se llegara a incluir.

## 4. Calibración de sala: sensor → muro → píxeles

### Modelo de coordenadas

**[Inferencia, diseño propio]** Se definen tres marcos: sensor (polar→cartesiano con offset angular y bandera de espejo), muro (origen arriba-izquierda, milímetros, x a lo ancho, y a lo alto) y salida (píxeles locales de 1920×1200 por proyector, más el offset 2×2 de 0 o 1920 / 0 o 1200 a la hora de emitir en el lienzo de 3840×2400). La escena física es 2D por muro, así que la pose de cada sensor es una transformación rígida (R(θ), t) más un flag de espejo, y el mapeo muro→píxel es una homografía.

### Pose del sensor

El plano de escaneo es paralelo a la pared, por lo que la pared "no se ve": el sensor solo ve lo que cruza el plano (suelo, techo, esquinas, marcos, manos). Se proponen dos vías complementarias: (a) correspondencias tocando posiciones conocidas (cuatro esquinas y centro) y resolviendo con Kabsch/Procrustes (`H = Σ q_i p_iᵀ`, SVD, `R = U·diag(1, det(UVᵀ))·Vᵀ`, `t = q̄ − R p̄`); (b) auto-ajuste con RANSAC de rectas sobre el fondo aprendido (200 iteraciones, inliers a 15 mm, ≥30 inliers) para hallar bordes del muro y refinar con ICP punto-recta contra un rectángulo de ancho y alto introducidos por el usuario. El flag de espejo se decide exigiendo que el sensor esté del lado de la sala.

### Homografía y verificación

La homografía se calcula por DLT con normalización de Hartley: matriz A de 2n×9, solución por SVD (un Jacobi propio de ~50 líneas o `ml-matrix`), `H = T_dst⁻¹ · reshape(h) · T_src`. Con 5 puntos o más se añade RANSAC (muestras de 4, umbral ≈8 px, 100-500 iteraciones, reajuste con inliers). Se propone una rejilla mínima de 3×3 objetivos y 4×4 para muros de más de 3 m. Si el RMS supera el objetivo (**6-10 mm en un muro de 4 m**, estimado), se añade corrección no lineal residual con spline de placa delgada o rejilla bilineal sobre la homografía, validada por leave-one-out para evitar sobreajuste. La verificación usa objetivos nuevos no empleados en el ajuste, un mapa de vectores de error (máximo, media y percentil 95 en mm), trazado libre y un test de estabilidad en reposo (desviación estándar durante 3 s). Estas fórmulas son estándar pero no se contrastaron en esta investigación con fuente primaria (OpenCV devolvió 403); `perspective-transform` (MIT) solo resuelve cuatro puntos, así que la versión con más puntos se implementa a mano.

### Referencias de la competencia

Laser's Track resuelve la configuración en cuatro pasos (definir pantallas y sensores, colocar la pose de cada sensor arrastrándola en una vista del mundo, dibujar rectángulos de inclusión y exclusión por sensor, activar salidas) ([Laser's Track](https://laserstrack.pages.dev/)). Augmenta usa una calibración de dos puntos con una vista Spout de la salida y validación caminando por la zona; recomienda además desactivar el fondo en instalaciones largas porque los datos pueden derivar con la temperatura ([guía Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)). LidarTracker solo pide arrastrar cuatro puntos para el área de escaneo ([Derivative](https://derivative.ca/community-post/asset/lidar-component-lidartracker)). El enfoque propuesto es más fuerte porque usa toques reales sobre objetivos proyectados, con residuo visible en mm.

## 5. Protocolo de salida: OSC primario, TUIO y WebSocket como compatibilidad

### Hechos de los estándares y receptores

OSC 1.0 es la única especificación publicada (la 1.1 nunca se publicó); un bundle lleva `#bundle`, un timetag NTP de 64 bits y elementos con tamaño; el timetag con 63 ceros y un 1 final significa "inmediato"; no hay sincronización de reloj; los mensajes de un bundle se despachan en orden de forma atómica ([OSC 1.1](https://opensoundcontrol.stanford.edu/spec-1_1.html), [OSC 1.0](https://opensoundcontrol.stanford.edu/spec-1_0.html)). Para evitar fragmentación IPv4 en Ethernet de 1500 MTU, la carga útil UDP máxima es de **1472 bytes** ([OneUptime](https://oneuptime.com/blog/post/2026-03-20-troubleshoot-udp-fragmentation/markdown)). TUIO 1.1 usa bundles `/tuio/2Dcur` (`source`, `alive`, `set s_id x y X Y m`, `fseq`) por UDP en el puerto 3333; el `source` es `aplicación@dirección`; TUIO 2.0 lo mueve a `/tuio2/frm` ([TUIO 1.1](https://www.tuio.org/?specification), [TUIO 2.0](https://www.tuio.org/?tuio20)).

Receptores: TouchDesigner tiene OSC In CHOP (canales por dirección), OSC In DAT (una fila por mensaje o por bundle con "Split Bundle into Messages"; FIFO con `Maximum Lines`) y TUIO In DAT (1.1 y 2.0) ([OSC In CHOP](https://docs.derivative.ca/OSC_In_CHOP), [OSC In DAT](https://docs.derivative.ca/OSC_In_DAT), [TUIO In DAT](https://docs.derivative.ca/TUIO_In_DAT)). Unreal tiene un plugin OSC nativo con servidor que recibe mensajes y bundles, eventos Blueprint y patrones de dirección ([Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/osc-plugin-overview-for-unreal-engine)), pero no soporta TUIO de forma nativa y no hay un plugin mantenido ([foro UE](https://forums.unrealengine.com/t/is-osc-tuio-supported-in-ue4/284511)). Los navegadores no reciben UDP; WebTransport es Baseline 2026 pero exige HTTP/3 y HTTPS ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)). Augmenta, el competidor de referencia, ofrece TUIO 1.1 estándar y WebSocket, y su plugin nativo de TouchDesigner usa un Client DAT sobre WebSocket ([Augmenta TD](https://docs.augmenta.tech/create-content/touchdesigner-native-plugin-(new-!))); en Unreal usa Live Link con un gestor que pasa eventos del hilo del worker al hilo de juego ([Augmenta Unreal](https://docs.augmenta.tech/create-content/unreal-engine)).

### Diseño propuesto (todo **[Inferencia / propuesta]**)

El esquema es "un bundle por frame y muro, timetag inmediato", UDP unicast por destino (broadcast/multicast solo opcional), sin TCP/SLIP en v1. Coordenadas normalizadas 0-1 relativas al muro (origen arriba-izquierda) más opcionalmente metros, para que cada receptor las mapee a su resolución. Con 40-60 bytes por toque caben unos 20 por datagrama; si se excede, se parte en varios bundles como hace TUIO 2.0.

| Mensaje (OSC) | Argumentos | Uso |
|---|---|---|
| `/alma/<wall>/frame` | seq:int, tsMs:int64, n:int | Cabecera del bundle |
| `/alma/<wall>/touch` | id, x, y, state, ageMs | Un mensaje por toque activo |
| `/alma/<wall>/alive` | ids... | Lista de vivos (patrón TUIO) |
| `/alma/<wall>/event/down` y `up` | id, x, y | Eventos discretos |
| `/alma/<wall>/zone/<name>/enter`, `exit`, `hold` | id | Triggers de zona |
| `/alma/<wall>/count` | n | Agregado |

Se añaden: TUIO 1.1 con un puerto por muro (3333-3336) y fuente `alma-wall1@host`, pensado como exportación secundaria porque pierde zonas y eventos; y un WebSocket con el mismo modelo de eventos en JSON por defecto (≈2-3 KB por frame con 30 toques) y una opción binaria (MessagePack o Float32) solo si hace falta. Un SDK cliente TypeScript (licencia MIT) con tipos generados desde el mismo esquema, reconexión automática y suscripción por muro, tasa y campos.

Para la adopción en los motores, se proponen dos entregables ligeros: un `.tox` de TouchDesigner (Python puro sobre WebSocket DAT u OSC In DAT, sin plugin C++) con `.toe` de ejemplo para el reparto 2×2 de 3840×2400, y un plugin de Unreal pequeño (C++/Blueprint, MIT o Apache) que enlaza el evento de bundle del plugin OSC de Epic, lo parsea una vez y expone `OnTouchDown/Move/Up`, `OnZoneEnter/Exit` y `GetTouches`. Manejar ~1800 eventos Blueprint por segundo (60 Hz × 30 toques) sería más pesado que parsear un bundle en C++ (razonamiento, sin medición). La documentación de Epic leída no confirma hilos ni límites de cola del plugin OSC, y falta confirmar si nDisplay requeriría replicar la entrada al clúster.

El panel de salidas sigue el modelo de Augmenta: lista de destinos, cada uno con protocolo, host:puerto, filtro de muros, tope de tasa (30/60 Hz), conjunto de campos, espacio de coordenadas (normalizado/píxeles/métrico), botón de prueba y LED de estado, y presets "TouchDesigner", "Unreal" y "Web". Prioridad posterior: MIDI, Art-Net/sACN y webhooks para triggers de zona, y Spout/NDI solo para depuración (no investigados; los binding NDI tienen licencias dispares y `vygr-labs/ndi-node` es GPL-3.0 ([ndi-node](https://github.com/vygr-labs/ndi-node))).

## 6. Interfaz de escritorio y tablet dentro de la sala

### Hechos de red y PWA

Open Stage Control demuestra el patrón de servidor que muestra su dirección y atiende a cualquier navegador de la LAN, e incluso tiene un QR en su changelog, pero está archivado y es GPLv3 ([changelog](https://openstagecontrol.ammd.net/docs/changelog)). Una PWA instalable en Chromium exige HTTPS o localhost ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)); por HTTP en la IP de la LAN la tablet no podrá instalarla. El aislamiento de clientes Wi-Fi es el obstáculo de red típico: en Meraki, WatchGuard o Peplink los clientes aislados no alcanzan hosts cableados ([Meraki](https://documentation.meraki.com/MR/Design_and_Configure/Firewall_and_Traffic_Shaping/Wireless_Client_Isolation), [WatchGuard](https://www.watchguard.com/help/docs/help-center/en-US/content/en-us/Fireware/wireless/ap_station_isolation_c.html)). Augmenta exige un router y no un switch para que los nodos obtengan IP y usa paneles secuenciales Input / Background / Processing / Output ([guía Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)).

### Diseño propuesto (**[Inferencia]**, sin fuente de UX específica)

El flujo es un asistente lineal de diez pasos, inspirado en Augmenta y Laser's Track: descubrir sensores (escaneo de subred o IP manual, con salud GET_HEALTH), asignar a muro, introducir dimensiones y región de proyección, capturar fondo con la sala vacía, alinear el plano (banda de offset), calibrar con objetivos, validar con trazado y mapa de error, dibujar zonas, configurar salidas, y guardar el perfil de sala (JSON versionado y exportable). Pantallas de escritorio: vista de sala con los cuatro muros y las poses de sensor arrastrables (patrón de Laser's Track), vista por muro con nube en vivo, tracks, zonas y máscaras de inclusión/exclusión, panel de salud (paquetes/s, edad del último scan, descartes, latencia de proceso p50/p99, RSS, retardo del event loop), salidas, grabación/reproducción y registros.

En la tablet, la calibración es la función principal: el muro proyecta un objetivo grande, la tablet muestra anillo de progreso e índice del objetivo, avanza sola cuando la posición se estabiliza (varianza bajo umbral durante ~0,5 s) con confirmación sonora o háptica, y ofrece Deshacer y un botón grande para avanzar manualmente. Tema oscuro de alto contraste. Un solo "bloqueo de operador" con token (el resto en solo lectura) que se libera por inactividad, y el estado de conexión siempre visible. El emparejamiento usa un PIN aleatorio mostrado en el servidor y un token firmado guardado en la tablet. En red: router o AP dedicado cableado al mismo switch que los sensores y el PC, aislamiento de clientes desactivado, reserva DHCP o mDNS, y QR más IP en pantalla como vía principal (mDNS puede bloquearse). Para la instalación PWA, la opción es HTTPS con certificado local o, más simple, "Añadir a pantalla de inicio" y pantalla completa; hay que probar iPad Safari y Android Chrome. i18n ES/CA/EN con catálogos ICU (por ejemplo i18next, sin verificar) y guía rápida ilustrada por idioma.

## 7. Robustez y despliegue en Windows

### Hechos

No existe reinicio automático nativo de `utilityProcess`; la detección se basa en `'exit'`, `child-process-gone` y `getAppMetrics()` (citas en sección 2). La API `app.setLoginItemSettings()` permite abrir al iniciar sesión, con clave StartupApproved visible en el Administrador de tareas ([API app](https://www.electronjs.org/docs/latest/api/app)). Los servicios corren en sesión 0 y Microsoft desaconseja los servicios interactivos; el patrón recomendado es un servicio más una app GUI en la sesión de usuario con IPC ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/services/interactive-services)). WinSW es MIT y define servicios en XML ([WinSW](https://github.com/winsw/winsw)). electron-builder con NSIS soporta instalación por máquina, macro `customInstall`, borrado de datos en desinstalación e instalaciones offline y actualizaciones diferenciales ([electron-builder NSIS](https://www.electron.build/nsis.html)). Firma: `signtool` (pfx o almacén), `hsm` y `pkcs11` (beta) o `azure` (Trusted/Artifact Signing, beta, requiere variables de entorno y rol); electron-updater rechaza actualizaciones NSIS con firmante distinto de `publisherName`; electron-builder indica que EV ya no da reputación inmediata en SmartScreen desde 2024 ([firma Windows](https://www.electron.build/docs/features/code-signing/code-signing-win)). La reputación SmartScreen con Azure Artifact Signing es discutida: la documentación de Electron la ve como la opción más barata y sin avisos, con disponibilidad limitada por país, y hay hilos anecdóticos de Microsoft Q&A sobre avisos renovados desde marzo-abril de 2026 ([Electron](https://electronjs.org/docs/latest/tutorial/code-signing), [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5855708/trusted-signing-regression-in-smartscreen-reputati)).

### Patrones recomendados (**[Inferencia]**, práctica de ingeniería sin fuente directa salvo lo citado)

Cadena de arranque: auto-login de una cuenta local dedicada → tarea programada "al iniciar sesión" con reinicio ante fallo (o `setLoginItemSettings`) → app en bandeja que arranca el motor sin ventana y abre la ventana de proyección en el display 3840×2400. Sin servicio de Windows, salvo que se quiera un motor "solo headless" sin ventana, y entonces seguiría el patrón de Microsoft.

| Capa | Patrón |
|---|---|
| Supervisor | Reinicio del motor con backoff 0,5 / 1 / 2 / 5 s hasta 30 s; cortacircuitos tras N caídas en M minutos → modo seguro (sensores desactivados, última configuración buena, error visible) |
| Heartbeat | Motor → main cada ~1 s con estadísticas por sensor; main reinicia si se pierden N latidos (un event loop colgado no emite `exit`) |
| Sensores | Máquina de estados conectando / transmitiendo / degradado / perdido; watchdog sin paquetes en N × periodo → STOP/RESET (espera 100 ms / ~1 s) → reenvío de scan y GET_HEALTH; un sensor caído solo invalida su zona de cobertura y se avisa de cobertura reducida |
| Detección de pérdida | Huecos por CRC32 y flag S del modo HQ |
| Config | Esquema validado (Zod/TypeBox/Ajv), escritura atómica (temporal + fsync + rename), copias rotativas, `schemaVersion` con migraciones, en fallo cargar copia y después modo seguro; perfiles por sala en `%ProgramData%` o userData, fuera del directorio de instalación para que sobrevivan a actualizaciones |
| Logs | pino o electron-log con rotación por tamaño/día, un archivo por proceso; minidumps locales |
| 24/7 | Arrays tipados reutilizados, colas acotadas (descarta la más antigua), RSS y heap en el heartbeat, reinicio programado opcional en ventana de mantenimiento, soak test con el simulador |
| Windows | `powerSaveBlocker`, `powercfg` sin suspensión/hibernación, aplazar Windows Update o usar Pro/IoT Enterprise LTSC (la edición Home está limitada), sin notificaciones, perfil de red Privado |
| Cortafuegos | Reglas de entrada creadas en `customInstall` con `netsh advfirewall` (puerto HTTP/WS, UDP de sensores y OSC, mDNS 5353), limitadas al perfil Privado y a la ruta del programa, y eliminadas al desinstalar |
| Actualización offline | Instalador NSIS versionado por USB, proveedor genérico de electron-updater sobre carpeta o recurso compartido (el firmante debe coincidir con `publisherName`), exportación/importación de perfiles |
| Firma | Azure Artifact Signing si la empresa es elegible; si no, OV con clave en token o HSM en la nube; no pagar EV esperando reputación inmediata. Para pocas instalaciones en PCs gestionados, el impacto de SmartScreen es bajo |

Hay que considerar un solo instancia con `requestSingleInstanceLock()`. Las ventanas se anclan al display 3840×2400 con `screen.getAllDisplays()` y eventos `display-added/removed`; `frame:false`, pantalla completa, `alwaysOnTop` y `show:false` hasta que esté lista (sin fuente en esta investigación; validar el escalado DPI en multi-pantalla). Importante: `app.disableHardwareAcceleration()` es desaconsejable para una salida WebGL. Electron Forge no se investigó.

## 8. Competidores y diferenciación

Los competidores relevantes, según las fuentes leídas, son los siguientes ([Laser's Track](https://laserstrack.pages.dev/), [Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide), [Modulo Kinetic](https://support.modulo-pi.com/modulo-kinetic-manual/v6/en/topic/interactivity-with-2d-lidars), [Toolkit Slamtec](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2), [LidarTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker), [Futurelab pharus](https://ars.electronica.art/futurelab/en/tag/pharus)):

| Producto | Qué hace | Sensores documentados | Salidas | Debilidad observada |
|---|---|---|---|---|
| Laser's Track (Windows, de pago) | Fusión de varios láseres, flujo de 4 pasos, simulador, watchdog | Hokuyo UST/URG; no lista RPLIDAR | Windows Touch, TUIO 1.1, OSC | Sin RPLIDAR; 200 USDT/mes o 2000 USDT perpetua por máquina, pago en USDT (Tron) |
| Augmenta | Nodos por sensor + Fusion, zonas, plugins TD/Unreal/Unity | Hokuyo UST-10LX; RPLIDAR no aparece en la guía legacy | OSC, TUIO 1.1, WebSocket | La guía leída es legacy y orientada a cámaras |
| Modulo Kinetic | Nodos Calibration 2D, Merge Tracking 2D, Trigger Area, Kalman | Hokuyo, Leuze, RPLIDAR S3, SICK TiM-561 | Dentro del media server | Requiere el media server completo y dongle |
| Interactive Toolkit (Slamtec) | Multitoque y TUIO por RPLIDAR | RPLIDAR serie y Ethernet | TUIO (3333), emulación de ratón | Herramienta cerrada Beta 1.2.3; licencia no encontrada |
| LidarTracker (TD) | Componente C++ con áreas, rango de trigger, calibración de 4 puntos | Hokuyo, Slamtec, EAI, SIMINICS | UDP, TUIO | Depende de TouchDesigner; sin licencia declarada |
| pharus (Ars Electronica) | Seguimiento de hasta 30 personas con láseres 2D | Láseres 2D | Datos tipo TUIO | Cerrado, sin repositorio público |

La comunidad de TouchDesigner reporta inestabilidad con el CHOP comunitario de RPLIDAR (un S2 que no conecta a 1.000.000 baudios y cierres de TD) ([foro Derivative](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)). No hay hoy un bridge LiDAR→TUIO permisivo y mantenido.

**[Inferencia]** La diferenciación defendible combina: RPLIDAR S2E nativo sobre Ethernet y sin dependencia de TouchDesigner; calibración desde tablet dentro de la sala; perfiles de sala exportables y reutilizables; grabación y reproducción con simulador; panel de salud y recuperación; matriz de salidas con WebSocket, OSC y TUIO más SDKs y componentes listos para TD/Unreal; y modelo comercial propio (licencia sin dependencia de pagos en cripto, ni dongle). Ninguna de las páginas leídas documenta grabación/reproducción ni perfiles por sala, pero esto es ausencia en lo leído, no prueba de ausencia en los productos.

## 9. Riesgos y lista de validación con el hardware

### Riesgos principales (**[Inferencia]** salvo indicación)

El crosstalk entre sensores no tiene datos para el S2E; la literatura general de LiDAR recomienda barreras físicas, evitar alineaciones frontales y esquemas de fase ([Ouster](https://ouster.com/sensor-docs/fw-user-manual/multi-sensor-synchronization)). Con cuatro muros rectangulares los planos se cruzan en las esquinas. Mitigaciones previstas: alturas o inclinaciones distintas, velocidades de motor diferentes para desincronizar, y rechazo por software de retornos en el ángulo donde está otro sensor. El segundo riesgo es mecánico: ±1,5° de planitud frente a 15-25 mm de separación. El tercero es la latencia: 10 Hz implica una edad media de medida de 50 ms y confirmación de ~200 ms. Cuarto: la zona sin cobertura bajo el sensor y la oclusión con un único sensor por muro. Quinto: reflejos o píxeles mixtos sobre pintura de proyección brillante, cristal o espejo (Slamtec afirma que detecta vidrio y 80.000 lux, afirmaciones de marketing no verificadas ([Core Electronics](https://core-electronics.com.au/rplidar-s2l-360-degree-laser-range-scanner-18m-range-2d-point-cloud-map-80000-lux-light-resistance-ip65-high-safety-for-human-eye.html.md))). Sexto: licencias (README del SDK ambiguo, paquetes duales). Séptimo: red de la sala (aislamiento Wi-Fi, mDNS) y SmartScreen/firma. Octavo: la deriva térmica, ya que la resolución es "sensible a la temperatura" según el manual.

### Qué validar con el hardware

| Prueba | Qué se busca | Criterio de aceptación (propuesto) |
|---|---|---|
| Conexión UDP 8089 y TCP | Confirmar UDP y descartar TCP; ¿hace falta Bonjour para descubrir? | Streaming estable en Windows con firewall activo |
| Cuatro S2E en una subred | Cambio de IP uno a uno, comportamiento con varios, discovery (nombre mDNS) | Cuatro streams concurrentes sin pérdida |
| Ruido de rango | Desviación en mm sobre piel, ropa oscura, ángulos rasantes, a 1/2/4 m | Define σ del Kalman y T_min |
| Planitud y pared | Variación del rango de fondo a lo largo de la pared; efecto de ±1,5° y del pitch R2E | Banda estable de pocos mm |
| Distancia plano-pared | Barrido 10-30 mm vs falsos toques | Sin falsos toques en pared vacía con 15-25 mm |
| Crosstalk | Esquinas y sensores enfrentados; efecto de velocidades distintas | Sin ghosts en pared vacía en 1 h |
| Desconexión de cable | ¿Sigue escaneando? ¿Hace falta nuevo comando? | Recuperación automática en menos de 10 s |
| Modos y motor | HQ vs DenseBoost; rango de RPM válido y ganancia de 15 Hz | Latencia vs resolución medidos |
| Paquetes perdidos | `SO_RCVBUF`, CRC32 y huecos en Windows a 4 sensores | Menos de 0,1 % de pérdida |
| Latencia extremo a extremo | Mano → LiDAR → proyección (cámara de alta velocidad) | Medir; objetivo a fijar |
| Calibración | RMS tras homografía, TPS necesaria, repetibilidad entre sesiones | RMS <6-10 mm (estimado) |
| Sesgo del contacto | Centroide vs círculo vs offset, según rango y ángulo | Corrección constante o por rango |
| Oclusión | Mapas de simulación vs medición con 4-15 personas | Cobertura aceptable con coasting |
| Zona bajo el sensor | Extensión real de la zona sin cobertura | Documentada y enmascarada |
| Deriva térmica | Precalentamiento de 2 min y deriva a horas | Reaprendizaje de fondo cada N horas |
| Salidas | OSC In DAT/CHOP, plugin OSC de Unreal, WebSocket en tablet | 60 Hz con 30 toques sin pérdidas |
| Tablet | Instalación PWA, Wi-Fi sin aislamiento, háptica | Calibración completa solo con la tablet |
| 24/7 | Soak de 72 h: memoria, CPU, reinicios | Sin crecimiento de RSS; recuperación de fallos inducidos |
| Windows | Autologin, firewall, actualizaciones, SmartScreen | Arranque sin intervención tras corte de luz |
| Vidrio y proyector | Reflejos de pintura y superficies lisas | Documentar materiales no válidos |

## 10. Plan por fases

La estimación de duración es **[Inferencia]** y depende del equipo; los hitos son lo importante.

| Fase | Entregable | Salida verificable |
|---|---|---|
| 0. Banco (1-2 semanas) | Un S2E en una mesa: cliente UDP mínimo en Node, volcado de HQ, medición de ruido, IP, desconexión, RoboStudio como referencia | Hoja de datos medidos que cierra las primeras filas de la tabla anterior |
| 1. Núcleo y simulador | Monorepo, `core`, `drivers/s2e`, `ReplayDriver`, grabación de datagramas, pipeline etapas 1-9, pruebas Vitest | Reproducción determinista y barrido paramétrico |
| 2. Un muro de punta a punta | Fusión, tracker, calibración por homografía, OSC + TUIO, UI de escritorio básica, supervisor | Dibujo en vivo en un muro con un sensor, latencia medida |
| 3. Tablet y cuatro muros | Servidor HTTP/WS, asistente de calibración remota, zonas, perfiles de sala, panel de salud, salida WebSocket y SDK, `.tox` y plugin Unreal | Barcelona XR Lab calibrado solo con tablet |
| 4. Endurecimiento | Instalador NSIS, firma, reglas de firewall, autoarranque, modo seguro, soak 72 h, actualización offline, documentación ES/CA/EN | Instalación en PC limpio, corte de luz y reinicio sin intervención |
| 5. Producto | Segundo sensor por muro, corrección TPS, optimización (WASM/Rust si se mide necesidad), MIDI/Art-Net/sACN, segundo plano para hover, licenciamiento comercial | Segunda sala distinta con solo un nuevo perfil |

Barcelona XR Lab (4 muros, 4 S2E, 3840×2400 en 2×2 de 1920×1200) es el caso de referencia. Cada muro tiene su tracker independiente (con N sensores internamente) y un multiplexor de salida; en el lienzo de 3840×2400 el sistema emite tanto el UV por muro como el UV global. La parte menos conocida del reparto es cómo se relacionan los cuatro muros con los cuatro cuadrantes (¿un muro por proyector?), y eso es un dato de la sala que no consta en las notas; se configura en el perfil de sala, no en el código.

## Conclusión

La investigación cambia la pregunta de "¿qué SDK envolver?" a "¿cuánto del comportamiento del S2E está sin documentar?". El protocolo publicado basta para un driver limpio en TypeScript, sin addon nativo ni dudas del README GPL/BSD, pero Slamtec no documenta heartbeat, reconexión, discovery ni ruido, de modo que la robustez del producto descansará en el watchdog y en pruebas de banco que ningún competidor publica para RPLIDAR. La segunda conclusión es que lo difícil no son los algoritmos (clustering, Hungarian, Kalman y One Euro son piezas conocidas y baratas de calcular) sino la física de instalación (plano a 15-25 mm de una pared con ±1,5° de tolerancia, crosstalk entre muros, ausencia de cobertura bajo el sensor) y la experiencia de calibración, que es donde un flujo con tablet y perfiles de sala puede superar a Laser's Track, Augmenta y Modulo.

Quedan tres decisiones abiertas con coste real: si instalar dos sensores por muro (la mejora de oclusión más fuerte, pero duplica el hardware), si aceptar la latencia de confirmación de ~200 ms o emitir "down" temprano con riesgo de fantasmas, y si el cliente TouchDesigner/Unreal se entrega como `.tox` y plugin propios (adopción alta, mantenimiento a cargo de Alma) o solo con documentación. Las tres se deciden mejor con los datos de la fase 0 que con más análisis previo.
