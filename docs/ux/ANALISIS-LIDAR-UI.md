# Análisis del producto de referencia: LIDAR Visualization System (Lidar Tracker UI v1.4.3, Tolch)

Fecha del estudio: 14-11-2026. Documento de análisis; no se ha modificado código de VEATION Touch.
Complementa `docs/ux/PROPUESTA-UX.md` (en especial sus apartados 3.5 Mapping, 3.6 Sensors, 3.7 Calibrate, 3.8 Zones y 3.9 Outputs).

**Cómo leer las etiquetas de evidencia**

| Etiqueta | Significa |
|---|---|
| **[APP]** | Visto en la aplicación en ejecución (exploración propia, capturas en el apartado 8). |
| **[GUÍA]** | Leído en la guía integrada de la propia aplicación (botón `Guía`). Es documentación del fabricante: describe la intención, no siempre el comportamiento real. |
| **[VÍDEO]** | Visto en los tres vídeos (fotogramas en el apartado 8). |
| **[TOE]** | Leído en el proyecto de TouchDesigner `Data_Lidar_in.toe`, expandido con `toeexpand` de Derivative. |
| **[ARCH]** | Leído de forma estática en los archivos empaquetados de la aplicación instalada (sin ejecutar nada). El JavaScript está ofuscado: estos datos son los menos firmes. |
| **[INF]** | Inferencia nuestra. |

---

## 1. Resumen

### Qué es y para quién
Aplicación de escritorio para Windows (Electron + servidor Node en el mismo proceso + addon nativo en C++ + visor Three.js) que lee uno o varios LiDAR 2D, agrupa los puntos en *blobs*, los normaliza respecto a un área rectangular y los envía por OSC, UDP binario y textura Spout. Se vende por suscripción (20 USD/mes, prueba de 7 días con cuenta de Patreon o número de serie). **[APP][GUÍA]**

Está pensada para artistas visuales, VJ e instaladores de eventos que montan **una superficie** (pared LED, proyección o suelo) con **un sensor** y quieren tener algo funcionando en minutos; el fabricante la acompaña de un catálogo de más de 110 juegos web, un proyecto de TouchDesigner de recepción y un servidor MCP para asistentes de IA. Admite varios sensores, pero como añadido sobre ese modelo de una sola superficie. **[GUÍA][ARCH]**

### Su modelo mental
1. **Un único mundo métrico en 2D.** La zona central es siempre la misma escena: el plano de barrido visto de frente, con rejilla en metros, ejes y el sensor en el origen. Todo lo demás son **capas** sobre esa escena: nube de puntos, área de selección (ROI), zonas, máscaras, plantilla de la pantalla física y blobs. **[APP]**
2. **La pantalla física es fija; lo que se mueve es la nube.** La guía lo dice literalmente: la plantilla de referencia representa la pantalla real y lo que se rota y desplaza para encajar con ella es la nube del LiDAR. **[GUÍA]**
3. **Una herramienta = una capa manipulable.** La barra flotante `MODO INTERACCIÓN` decide qué capa responde al ratón; el resto queda visible pero inerte. Abrir una sección del panel lateral cambia de herramienta automáticamente. **[APP]**
4. **El ROI es el contrato de salida.** Sólo lo que cae dentro del rectángulo se procesa y se envía, normalizado de 0 a 1 respecto a ese rectángulo. La relación de aspecto y la resolución objetivo del ROI se ven siempre en la cabecera (`Canvas: 1920x1080 (1920x1012 Fit)`). **[APP][GUÍA]**
5. **Guardar es "guardar la instalación".** Un *template* contiene ROI, rotación, posición de las nubes, zonas, máscaras, grid warp, plantilla de pantalla y configuración de red. **[APP]**

### Lo que hace mejor que nosotros hoy
- **El trabajo se hace en el centro, no en el panel.** Se arrastra el ROI por sus tiradores, se dibujan zonas y máscaras sobre la escena, se arrastra el sensor, se arrastra la plantilla de pantalla. El panel sólo aporta números y botones de acción. Es exactamente lo que el director creativo echa en falta en VEATION Touch.
- **Cambio de herramienta visible en el lienzo**: al cambiar de sección cambia qué se puede agarrar, qué tiradores aparecen y qué capa se activa.
- **Aislamiento contra errores**: modos excluyentes, capas con tres estados (activa, fantasma al 20 % y bloqueada, oculta) y candado por objeto.
- **Plantilla de superficie física** con medidas reales y un botón `Alinear` que coloca la nube en su sitio según dónde está montado el sensor.
- **Calibración sobre la propia pared** con dianas numeradas, línea desde la mano hasta la diana, contador de muestras y cambio de color al capturar.
- **Simulador dentro del lienzo** (ratón o blobs automáticos) que dispara zonas y salidas igual que un sensor real.
- **Contenido como fondo de calibración**: imagen, webcam o textura Spout del show dentro del ROI para dibujar las zonas encima de los gráficos reales.
- **Deshacer/rehacer con nombre de acción**, templates con exportación JSON, guía con buscador y recorrido guiado sobre la interfaz real.
- **Conexión de sensores cuidada**: autodetección, presets de IP, ayuda para el driver USB, tarjetas de puntos/rev y Hz, consola de actividad.

### Dónde es débil
- **No hay modelo de sala**: es un plano 2D con N sensores, cada uno con su ROI y un rango de salida que el instalador reparte a mano (`Norm Out Range`). No existen muros, lienzo de salida ni `pixelRect`. **[GUÍA][ARCH]**
- **No hay sustracción de fondo**: lo estático se elimina sólo con máscaras dibujadas a mano. **[ARCH]**
- **No hay semántica de toque**: no existen eventos `down`/`up` por blob, ni corrección de contacto, ni filtro por tamaño físico; el marcador queda en el borde de la mano que mira al sensor. **[ARCH][VÍDEO]**
- **Seguimiento sencillo**: vecino más cercano, sin predicción ni interpolación; se emite a la cadencia del sensor. **[ARCH]**
- **TUIO se anuncia en la web pero no aparece** ni en la interfaz ni en la guía; en los archivos sólo hay una opción de configuración sin emisor. **[APP][GUÍA][ARCH]**
- **La textura Spout es el render del visor** (nubes, blobs y zonas), no una máscara limpia de toques. La textura en blanco y negro se construye en TouchDesigner a partir del OSC. **[GUÍA][TOE]**
- **Calibración de 4 puntos** convertida en una malla bilineal, sin informe de error ni repetición de un punto; depende de un teclado (`SPACE`, `ESC`). **[VÍDEO][ARCH]**
- **Interfaz densa e inconsistente**: mezcla español e inglés, acordeones anidados en un panel que tapa el lienzo, conmutadores cuyo estado no se distingue, documentación desalineada con la interfaz.
- **Dependencia de licencia en línea**: durante la exploración la aplicación volvió a la pantalla de serie/Patreon en mitad del trabajo (causa no determinada). **[APP]**
- **Sólo Windows y un único PC**; el control remoto desde el teléfono cubre sólo el ajuste de malla, no toda la aplicación. **[APP]**
- **RPLIDAR S2E sin confirmar**: la interfaz ofrece Slamtec por UDP en el puerto 8089, pero el preset se llama `RPLiDAR C1` y el S2E no se nombra en ningún sitio. **[APP]**

---

## 2. Inventario pantalla a pantalla

### 2.0 Pantalla de licencia **[APP]**
Tarjeta centrada sobre la interfaz desenfocada: título, campo `Serial` con máscara `LIDAR-XXXX-XXXX-XXXX`, casilla `Recordarme`, botón `Ingresar`, separador y botón rojo `VERIFICAR CON PATREON` (abre el navegador). No se introdujo nada; el propietario volvió a validar y la exploración continuó.

### 2.1 Ventana principal `LIDAR Control Panel` **[APP]**

**Cabecera (una fila):**
- Logotipo `LIDAR TRACKER`.
- Cronómetro de sesión.
- Píldoras de estado: `LIDAR: ON/OFF`, `OUT: ON/OFF`, `Blobs: n`, `Canvas: 1920x1080 (1920x1012 Fit)`.
- `Deshacer` y `Rehacer` (el tooltip nombra la acción que se va a deshacer).
- `Guardar Calib` (cian) y `Templates` (violeta).
- Botón de menú que abre o cierra el panel lateral.

**Zona central:** visor a pantalla completa con rejilla métrica (etiquetas `1m`…`15m` en los ejes), círculos de distancia opcionales, origen del sensor con ejes verde y naranja. Rueda para zoom en el cursor, botón derecho para desplazar.

**Barra flotante `MODO INTERACCIÓN`** (plegable a una pastilla que muestra la herramienta activa):

| Modo | Qué responde al ratón |
|---|---|
| `Todo` | Todas las capas. |
| `Pointcloud` | Arrastrar mueve el sensor (su nube) en X/Y. |
| `ROI` | Sólo el área de selección: mover, redimensionar, rotar. |
| `Zonas` | Sólo las zonas (hotspots). |
| `Máscaras` | Sólo los polígonos de máscara y sus vértices. |
| `Pantalla Ref` | Sólo la plantilla de la pantalla física. |
| `Grid Warp` | Sólo los nodos de la malla y las esquinas de keystone. |
| `Simulador` | Clic y arrastre generan un blob virtual; no se mueve ninguna geometría. |

Atajos numéricos según la guía (la guía lista 7 modos y la interfaz tiene 8). **[GUÍA]**

**Barra `VISIBILIDAD CAPAS 7 / 7`:** siete fichas (rejilla y ejes, ROI, hotspots, máscaras, pantalla de referencia, nubes de puntos, blobs). Clic alterna activa ↔ fantasma (20 % de opacidad y sin interacción); Mayús+clic o botón derecho la oculta. **[APP][GUÍA]**

**Panel lateral derecho** (unos 450 px, superpuesto al visor): fila con `Guía`, versión, `Salir (usuario)` y conmutador `Simple / Avanzado`; debajo, pestañas y secciones plegables.
- En **Simple**: `Lidar`, `Blob`, `Zones`, `Mapping`.
- En **Avanzado** se añaden `Input`, `IN/OUT` y ajustes (icono de engranaje), más secciones extra en cada pestaña.

### 2.2 Pestaña `Lidar` **[APP]**

**Tarjeta del sensor (`No LIDAR` cuando no hay ninguno):**
- Conmutador `USB / COM` | `Ethernet / IP`.
- USB: `DISPOSITIVO / PUERTO` (lista y campo manual), `BAUDRATE` (Auto, 115200, 256000, 460800 por defecto, 1000000), casillas `Recordar dispositivo` y `Auto-Conectar`, botones `Conectar` y `Auto-Detectar`, ayuda `¿No detecta tu RPLiDAR?` con `Driver USB (CP210x)`.
- Ethernet (`CONEXIÓN ETHERNET MANUAL`): presets `RPLiDAR C1` y `Hokuyo`; `IP Address` (192.168.0.7), `Port` (8089); `Protocol`: `UDP (RPLiDAR C1 / A2E)` o `TCP`; `Driver`: `Slamtec RPLiDAR`, Hokuyo UST-10LX/20LX, `POELIDAR (CPJRobot F1/T1/M1)`; botones `Conectar Ethernet IP` y `Open Web Admin (IP)`.
- Telemetría: `PUNTOS / REV`, `FPS / SCAN`, `VELOCIDAD` (`AUTO (15Hz)`).
- Consola `Actividad del Sensor` con marca de tiempo y contador de repeticiones (`LIDAR disconnected ×256`).

**`OFFSET ESPACIAL (METROS)`** (sólo Avanzado): X, Y y `Nudge` 0,05 m (flechas; Mayús ×10).

**`Zoom / Flip / Rotación / Velocidad`:**
- `POINT SIZE` 1–10 px (3).
- `ROTATION` 0–360° con deslizador y campo numérico.
- Zoom +, −, restablecer; `FLIP X`, `FLIP Y`.
- `VELOCIDAD DEL MOTOR (RPM)`: `Auto`, `600 (10Hz)`, `900 (15Hz)`, `1200 (20Hz)`.

**`Area Selection (ROI)`:**
- `Por Sensor` | `Global Unificado`.
- `ASPECT RATIO`: Free, 1:1, 16:9, 4:3, 3:2, 21:9, personalizado.
- `Select` (pasa a `Done / Cancel` mientras se dibuja), `Calibrate`, `Zoom`, `Clear`.
- `ROI Desbloqueado` / `ROI Bloqueado`; `Mostrar solo dentro del área`.
- Subsección `Escala Canvas LED / TouchDesigner`: `Estándar Objetivo` (4K, 2K, 1920 × 1080, 720p…, personalizado, sin escala) y `Modo de Ajuste` (`Ajustar Proporción (Fit)` o estirar).
- Lectura: `Pos: -809, 5459 mm`, `Size: 17257 × 9093 mm (1920 × 1012 px)`, `Canvas: 1920×1080 (1920×1012 Fit)`, `Angle: 0.0° | Ratio: 1.898:1`. Sin área: `No area selected`.

**`Referencia de superficie física`:**
- Botones `Referencia` (pasa a `Ref: ON`), `Etiquetas`, `↺ (0,0)`, `Alinear`.
- `ORIENTACIÓN DEL SENSOR`: `Hacia abajo (270° · Suelo)` por defecto, y arriba, izquierda, derecha, centro o ángulo libre.
- `POSICIÓN DEL SENSOR`: `Centro de la pantalla`, bordes, esquinas o personalizada.
- `ALTURA DEL SENSOR SOBRE LA PANTALLA (M)`: 0,3.
- `TAMAÑO DE PANTALLA (METROS)`: ancho 5, alto 2,5.
- Con `Ref: ON` aparece en el visor un rectángulo cian con cota (`5.00 × 2.50 m`) y un tirador para arrastrarlo.

### 2.3 Pestaña `Input` (Avanzado) **[APP]**
- `WEBCAM INPUT`: activar, elegir cámara, `SHOW VIDEO`, `FIT TO SELECTION`, opacidad 50 %.
- `BACKGROUND IMAGE`: `Load Image`, `Clear`; trae `Grid_test.png (1280×720)`; `SHOW IMAGE`, `FIT TO SELECTION`, opacidad. Activada, la imagen se dibuja dentro del ROI.
- `Spout Video Input`: activar, nombre del emisor (autodetección), lista de emisores, estado `Not connected`.
- `Preview`.

### 2.4 Pestaña `IN/OUT` (Avanzado) **[APP]**
- `Network Input (OSC)`: activar, `LISTENING PORT` 6060, `INFO`, IP del servidor, `OSC MONITOR (LAST 10 MSGS)`.
- `Network Output`: `ENABLE UDP`, `ENABLE OSC`, `ADDRESS` `/lidar/blob`, `HOTSPOT OSC PORT` 4444.
- `Targets (IP + UDP/OSC Ports)`: cinco filas con casilla, IP, puerto UDP 3333 y puerto OSC 3334; la primera es `127.0.0.1`.
- `Coordinate Normalization`, `View Options`, `Point Persistence (Trailing)`.
- `Output Window`: `TARGET MONITOR`, `Open Output Window`, pantalla completa, `Show Calibration Overlay`, `RESOLUTION` 1024 × 1024, estado `Output: Window Closed`.
- `Native Spout Output`.
- No hay controles de TUIO ni de WebSocket.

### 2.5 Pestaña `Blob` **[APP]**
- `ENABLE BLOB TRACKER`.
- `Visuals`: `SHOW BLOB VISUALS`, `SHOW BOUNDS (YELLOW)`, `SHOW CENTROID (RED)`, `SHOW VELOCITY (CYAN)`, `SHOW ID LABELS`.
- `Blob Parameters`:

| Control | Valor visto | Rango **[ARCH]** |
|---|---|---|
| `CLUSTER RADIUS` | 150 mm | 10–1000 mm |
| `MULTI-LIDAR MERGE DIST` | 400 mm | 0–1200 mm |
| `MIN POINTS` | 1 | 1–100 |
| `MAX POINTS` | 260 | 10–2000 |
| `MAX MOVEMENT` | 800 mm | 50–2000 mm |
| `SENSITIVITY` | 50 % | 0–100 % (el servidor no la usa) |
| `MIN RANGE / DEAD ZONE` | 0 mm | 0–1000 mm |
| `CENTROID SIZE` | 0.01 | 0,01–0,3 |
| `FILTER TYPE` | `EMA (Exponential Moving Avg)` | EMA, MA, Kalman 2D |
| `SMOOTHING` | 0 % | 0–100 % |
| `PERSISTENCE` | — | 0–2 s |

- Caja de estado (`Blobs: 0`, `Points in Blobs: -`), `Area Analysis`.
- `Simulation Mode`: `Enable Auto Simulation`, `Blob Count` (1–15), `Movement Pattern` (`Smooth Wander (Aleatorio)` y otros), `Speed`, `Size`; `Enable Mouse Simulation`.

### 2.6 Pestaña `Zones` **[APP]**
- `Draw Hotspot Zones`: texto `Click button, then draw on canvas`; `+ Rectangle`, `+ Circle`, `+ Polygon`; ayudas de teclado (ESC, DEL, doble clic, Ctrl+C/V); `Clear All Zones`.
- `Active Zones (n)`: por zona, color, nombre editable, tipo, ruta OSC derivada del nombre (`/Zone_1`), tecla asociada, candado, disparo de prueba, `ON`, `X`. Con un blob dentro aparece la insignia `1 active` y la zona se ilumina.
- `Máscaras de Ignorado (n)`: `+ Mask` (pasa a `Drawing...`), lista con casilla, candado, editar y borrar; `Borrar Seleccionada`, `Limpiar Todas`.
- `Zone Configuration`: `DEBOUNCE TIME` 500 ms, `DWELL TIME THRESHOLD` 1000 ms, `ENABLE HEATMAP` (globales, no por zona).
- `Event Log`: `ENTER`, `DWELL`, `TRIGGERED`, `EXIT` con hora, zona e id de blob (los simulados usan ids 90000+).
- `Statistics`, `Zone Presets`.

### 2.7 Pestaña `Mapping` **[APP]**
- `CHESSBOARD GRID`: `SHOW GRID` (dibuja un damero dentro del ROI) y `CELL SIZE` 0,05 m.
- `MODE`: `Keystone` | `Grid Warp` | `Add Row` | `Add Column`, con una línea de ayuda (`Grid Warp: Click and drag points to deform the grid`).
- `Grid Warp`: `ENABLE GRID MAPPING` (`Warp blob positions using a deformable grid`), `ROWS` y `COLUMNS` (3 × 3), `SHOW GRID OVERLAY`, `INTERPOLATION MODE` (`Bilinear`, `Perspective`).
- `Quick Actions` (± fila, ± columna), `Point Editor` (desplazamiento X/Y del nodo, paso de ajuste), `Stick Control` (joystick virtual), `Reset Grid`, `Reset Selected`.
- `Remote Calibration`: URL con token, `Copy`, `Open`, `QR Code`.
- La malla no llegó a verse en el visor principal sin sensor conectado; sí se vio en la página remota (2.10).

### 2.8 Ajustes (engranaje) **[APP]**
`AUTO-SAVE SETTINGS` (activado), `CONFIGURATION BACKUP` (`Export` / `Import` JSON), `Global Options`, `Full Configuration Presets`, `Keyboard Shortcuts`, `LIDAR Health & Diagnostics` (`Disconnected`, `Code: NO_DEVICE (0xFF)`), `SYSTEM STATUS`, `Reset All Settings to Defaults`.

### 2.9 Ventana `Lidar Output` **[APP]**
Segunda ventana destinada al monitor de proyección. Muestra un rectángulo con cuatro dianas numeradas en las esquinas (1 arriba-izquierda, 2 arriba-derecha, 3 abajo-derecha, 4 abajo-izquierda) y cuatro tiradores cuadrados en los lados; `Click for Fullscreen (F11)`; tamaño y relación de aspecto en píxeles. En calibración añade un aviso superior (`Área establecida (511×276cm, OK 0ms)`) y una línea inferior de estado (`[Auto] Point 1/4 - Move to point`).

### 2.10 Página remota para teléfono **[APP]**
`remotecalibration.html`, servida por la propia aplicación; se abre con el código QR. Sin token queda en sólo lectura.
- Lienzo con la malla (nodos circulares, esquinas más grandes) y los blobs en vivo.
- Arriba: menú, pantalla completa y botón `SPACE` (captura el punto de calibración sin ir al teclado).
- Abajo a la derecha: cruceta con joystick central.
- Barra inferior: deshacer, rehacer, `Grid`, `Key` (keystone), `Sel` (restablecer selección), `All` (restablecer todo).
- Menú: estado de conexión, selección, modo, tamaño de malla, selector de sensor, ± fila/columna, `Touch Mode` (el dedo crea un blob), `Fullscreen Test`, `Nudge Step`, zoom.
- Tarjeta de primer uso con cuatro frases y `Got it!`.

### 2.11 Diálogos **[APP]**
- `Calibration`: `Target monitor`, `Manual`, `Auto`, `Cancel`, y la nota de que la ventana se abrirá a pantalla completa en el monitor elegido.
- `GUARDAR TEMPLATE DE CALIBRACIÓN`: describe lo que se guarda, nombre propuesto `Calib_AAAA-MM-DD_HHMM`, casilla para descargar además un JSON.
- `TEMPLATES DE CALIBRACIÓN`: lista (vacía: `No hay templates guardados aún`), `Importar JSON`, `Exportar Actual`, `Guardar Actual...`.
- Panel de acompañamiento durante la calibración (abajo a la izquierda de la ventana principal): `TUTORIAL - AJUSTE`, botón `SKIP`, barra de progreso.

### 2.12 Guía integrada **[APP]**
Pantalla completa con buscador, 19 secciones en una barra lateral, botones `Primeros Pasos` y `Tour Completo` (recorrido con foco sobre la interfaz real, que avanza cuando el usuario acciona el control resaltado).

---

## 3. Flujos reconstruidos

### 3.1 Instalación y licencia
1. Instalador NSIS (300 MB); incluye el driver USB CP210x. **[ARCH]**
2. Primer arranque: pantalla de serie o `VERIFICAR CON PATREON`. **[APP]**
3. La sesión puede caducar o cerrarse con la aplicación abierta: se vuelve a la pantalla de licencia. **[APP]**

### 3.2 Conectar el sensor
1. Pestaña `Lidar` → `Auto-Detectar`, o elegir puerto COM y baudrate, o `Ethernet / IP` con un preset. **[APP]**
2. La píldora `LIDAR` pasa a verde; las tarjetas muestran puntos por vuelta y Hz; la consola registra los eventos. **[APP][GUÍA]**
3. Con `Recordar dispositivo` y `Auto-Conectar`, el sensor se reconecta al arrancar. **[APP]**
4. Varios sensores: `New Lidar` en la barra de sensores; cada uno recibe una pestaña con alias editable (doble clic) y un color fijo. **[GUÍA]**

### 3.3 Colocar y visualizar la nube
Montaje visto en los vídeos: un RPLIDAR C1 por USB en el borde superior de una pared LED de unos 6 × 1,5 m, centrado, sobre un brazo articulado, con el plano de barrido paralelo a la pared y mirando hacia abajo. La interfaz de configuración se muestra en la propia pared. **[VÍDEO]**

1. Girar la nube con `ROTATION` (317° en el vídeo) y, si hace falta, `FLIP X` / `FLIP Y` hasta que la nube coincida con la realidad. **[VÍDEO]**
2. Alternativa guiada: abrir `Referencia de superficie física`, escribir ancho y alto reales de la pantalla, elegir dónde está el sensor (por ejemplo, centro del borde superior mirando hacia abajo, a 0,3 m) y pulsar `Alinear`: el origen de la nube se traslada a la posición declarada del sensor y se aplica la rotación correspondiente. **[APP][GUÍA]**
3. Ajuste fino con el modo `Pointcloud` (arrastrar el anillo del sensor) o con flechas (`Nudge` 0,05 m). **[GUÍA]**

### 3.4 Definir el área de interacción (ROI)
1. Abrir `Area Selection (ROI)`: el visor pasa solo al modo `ROI`. **[APP]**
2. Elegir `ASPECT RATIO` si la salida tiene una proporción fija. **[APP]**
3. `Select` y arrastrar un rectángulo. Aparecen tiradores redondos en las esquinas, cuadrados en los lados y un tirador de rotación arriba. `Done / Cancel` para terminar. **[APP]**
4. La lectura da posición y tamaño en milímetros, ángulo, proporción y los píxeles resultantes; la píldora `Canvas` de la cabecera se actualiza. **[APP]**
5. `Mostrar solo dentro del área` limpia la vista; `Zoom` encuadra el ROI; `ROI Bloqueado` lo protege (marco en ámbar, sin tirador de rotación). **[APP]**
6. `Escala Canvas LED / TouchDesigner` fija la resolución objetivo y el ajuste (Fit o Stretch). **[APP]**

### 3.5 Calibración por 4 puntos
1. Requisitos: tiene que existir un ROI (si no, diálogo `Área Requerida`); si ya hay blobs, aviso `Interferencia Detectada`. **[ARCH]**
2. `Calibrate` → diálogo con monitor de destino y `Manual` / `Auto`. **[APP]**
3. Se abre `Lidar Output` en el monitor elegido con el rectángulo y las cuatro dianas. En la ventana principal aparece el panel de acompañamiento. **[APP]**
4. Ajustar el rectángulo de dianas a una zona cómoda de alcanzar (tiradores de lado y de esquina; Mayús conserva la proporción). **[APP]**
5. Para cada diana, en orden horario desde arriba-izquierda **[VÍDEO]**:
   - Panel central: `Calibrating Point 2/4`, `Move hand to orange point`, `Auto-capture when close enough | SPACE for instant capture`, `ESC to cancel`.
   - Una línea une el cursor de la mano con la diana y muestra `Distance: 1216px (SPACE to capture)`.
   - Con la mano en la diana: `Capturing: 34 samples` y un anillo que se llena; unas 50 muestras en unos 3 s.
   - La diana pasa a verde; la siguiente ya estaba dibujada en gris.
6. Al terminar la cuarta, la ventana vuelve al visor sin resumen ni medida de error. **[VÍDEO]**
7. Verificación manual: se amplía el visor hasta que el rectángulo calibrado coincide con la pared física y se comprueba que el marcador naranja queda bajo la mano. **[VÍDEO]**

Parámetros leídos en los archivos **[ARCH][INF]**: captura automática cuando el blob está a menos de 100 px o 0,15 de distancia normalizada; mínimo 30 muestras, máximo 100; media recortada (descarta el 10 % por cada extremo); tiempo límite de 120 s. Los cuatro puntos promediados se convierten en las esquinas de la malla.

### 3.6 Mapeo fino (Keystone y Grid Warp)
1. Pestaña `Mapping` → `ENABLE GRID MAPPING`. La malla deforma las **coordenadas de los blobs**, no una imagen. **[APP]**
2. `Keystone`: arrastrar las 4 esquinas. `Grid Warp`: arrastrar cualquier nodo; selección múltiple con recuadro o Ctrl+clic. **[GUÍA]**
3. `Add Row` / `Add Column`: clic sobre la malla para insertar una fila o columna en esa posición; o ± desde `Quick Actions`. Tamaños de ejemplo: 4 × 4, 8 × 8, 16 × 16. **[APP][GUÍA]**
4. Ajuste fino con flechas, campos de desplazamiento o joystick; `Reset Selected` / `Reset Grid`. **[APP]**
5. Desde el teléfono, de pie frente a la pared, se mueven los nodos con el dedo o la cruceta mientras se ve dónde cae el cursor sobre la imagen real. **[GUÍA][APP]**
6. Referencias visuales: damero métrico, imagen de prueba, webcam o Spout de entrada dentro del ROI. **[APP]**

### 3.7 Ajuste del seguimiento
1. Pestaña `Blob` → activar el tracker y las ayudas visuales. **[APP]**
2. Recomendaciones del fabricante **[GUÍA]**: ruido o falsos positivos → subir `Min Points` a 15–30 o dibujar máscaras; intermitencia → subir `Persistence`; vibración → `Smoothing` 0,70–0,85.
3. Sin sensor: modo `Simulador` o `Enable Auto Simulation` con varios blobs. **[APP]**
4. No hay presets por caso de uso (manos, personas). **[ARCH]**

### 3.8 Zonas y máscaras
1. Pestaña `Zones` → `+ Rectangle`, `+ Circle` o `+ Polygon` y dibujar en el visor. **[APP]**
2. Renombrar la zona: el nombre genera las rutas OSC (`/Boton_Play`, `/Boton_Play/state`, `/Boton_Play/triggered`…). **[APP][GUÍA]**
3. Opcional: asociar una tecla (la aplicación la pulsa en Windows cuando se activa la zona), bloquear, probar con el botón de disparo. **[APP][ARCH]**
4. `+ Mask` y arrastrar para descartar columnas, cables o mobiliario. Hay que estar en el modo `Máscaras`: con el botón en `Drawing...` y el visor en otro modo, el arrastre no hace nada. **[APP]**
5. Comprobar en `Event Log`. **[APP]**

### 3.9 Salidas
1. Pestaña `IN/OUT` → `Network Output`: activar OSC y/o UDP, dirección base, destinos. **[APP]**
2. La píldora `OUT` de la cabecera enciende o corta toda la emisión. **[APP][GUÍA]**
3. `Native Spout Output`: emisor `LIDAR_Output` con el render del visor. **[APP][GUÍA]**
4. `Output Window` para el monitor de proyección. **[APP]**

### 3.10 Uso en TouchDesigner **[TOE]**
El proyecto `Data_Lidar_in.toe` contiene un componente `BLOB_IN` con:
1. Tres `OSC In DAT`: puerto **3334** (blobs), **4444** (zonas) y **5555** (resolución del ROI).
2. Callbacks en Python que mantienen cuatro tablas:
   - `blobs`: columnas `cmd`, `id`, `x`, `y` por sensor.
   - `blobs_count`: blobs por sensor.
   - `hotspots`: filas `/<zona>/count`, `/state`, `/triggered` (pulso de 200 ms), `/exit`.
   - `pixels`: `sensor`, `width_px`, `height_px`.
3. Un `Replicator` que crea un componente por blob con un `Circle TOP` de radio 0,02 situado en `(x − 0,5; 0,5 − y)`; todos se suman en un `Composite TOP` con la resolución que llega por `/selection/pixels`.
4. Una cadena `Fit → Blur → Threshold → Blur → Feedback → Level → Blur → Composite` que produce una **textura en blanco y negro de los toques, con estela**.
5. Salidas: la textura (TOP), las coordenadas como canales (CHOP, con `Trail`) y las zonas como canales; un `Window COMP` para pantalla completa.

En el vídeo 1 se ve además un `OSC In CHOP` con canales `LIDAR/BLOBS`, `LIDAR/BLOBS1`… (formato antiguo de un solo mensaje). **[VÍDEO]**

### 3.11 Guardado
- Autoguardado continuo y silencioso. **[APP]**
- `Guardar Calib` → template con nombre (y JSON opcional). `Templates` → cargar en caliente, exportar, importar, borrar. **[APP][GUÍA]**
- Presets por módulo (pantalla de referencia, malla, zonas) y copia completa desde ajustes. **[GUÍA]**

### 3.12 Varios sensores **[GUÍA]** (no probado: no había sensores)
- Vista `Merge`: todas las nubes en un mismo mundo, cada sensor con anillo de arrastre, color y etiqueta. Vista `Single`: aísla el sensor activo.
- Rotación, flip y desplazamiento por sensor; ROI por sensor o `Global Unificado` (una sola área sobre la nube fusionada).
- `Norm Out Range X/Y` por sensor para repartir un lienzo: sensor 1 `X: 0.0 → 0.5`, sensor 2 `X: 0.5 → 1.0`.
- Destinos de red por sensor; dirección OSC por sensor.
- La guía menciona como ejemplo "4 sensores en una sala 360°", resuelto con esta misma mecánica plana.
- En modo global las nubes se concatenan sin eliminar duplicados. **[ARCH]**

---

## 4. Arquitectura y contrato de datos

### 4.1 Procesos
- Electron principal con **instancia única**; el servidor Node se carga **dentro del mismo proceso** (no hay proceso hijo ni supervisor). **[ARCH]**
- HTTP y WebSocket en el **mismo puerto, 59391 por defecto**, escuchando en todas las interfaces (`0.0.0.0`). Comprobado: el proceso escucha en `0.0.0.0:59391` y en UDP 6060. **[APP]**
- Clientes locales autorizados sin más; los remotos necesitan token. **[ARCH]**
- Addon nativo `lidar_addon.node`: lectura de sensores Slamtec y emisor/receptor Spout. El agrupamiento y el seguimiento son JavaScript. **[ARCH]**
- `win-key-sender.exe`: proceso auxiliar que pulsa teclas en Windows para las zonas con tecla asociada. **[ARCH]**
- Servidor MCP en el mismo puerto (`/sse`) con unas 20 herramientas: estado, instantánea de la escena, blobs simulados, zonas, máscaras, ROI, presets y generación de juegos. **[GUÍA][ARCH]**
- Hasta 16 ventanas de salida a pantalla completa, una por monitor, para el secuenciador de juegos. **[ARCH]**

### 4.2 Sensores
| Familia | Transporte | Notas |
|---|---|---|
| Slamtec RPLIDAR A1, A2, A3, S1, S2, C1 | Serie/USB por addon | Baudrates 115200 a 1000000; control de motor 0–1200 RPM. **[APP][GUÍA]** |
| Slamtec por red | UDP o TCP, puerto 8089 | Preset `RPLiDAR C1` en 192.168.0.7. En los archivos, el valor por defecto del servidor es 192.168.11.2:8089, que coincide con el del S2E. **[APP][ARCH]** |
| Hokuyo UST-10LX/20LX | TCP 10940, SCIP 2.0 | Driver en JavaScript; reconexión con espera creciente. **[APP][GUÍA][ARCH]** |
| POELIDAR CPJRobot | TCP/UDP 2105 | **[APP][ARCH]** |

**RPLIDAR S2E:** plausible pero **no confirmado**. La interfaz y los valores por defecto apuntan al protocolo UDP de Slamtec en el puerto 8089, que es el del S2E; el soporte real depende del addon binario, que no se ha analizado, y ni la web, ni la guía, ni la interfaz nombran el modelo. **[INF]**

### 4.3 Tubería de proceso **[ARCH]**
Puntos `[x, y]` en metros → descarte de tramas con menos de 20 puntos → transformación por sensor (rotar, voltear, trasladar) → filtro por ROI → máscaras → agrupamiento → seguimiento → descarte de blobs fuera del ROI o dentro de máscaras → zonas → normalización → grid warp → salidas.

- **Sin sustracción de fondo.**
- **Agrupamiento**: crecimiento de regiones por distancia con rejilla espacial, más fusión por distancia entre centroides.
- **Seguimiento**: vecino más cercano con umbral de movimiento; ids crecientes; persistencia en tramas; filtro EMA, media móvil o Kalman.
- **Sin eventos de toque**: no hay `down`/`up`, toque breve ni mantenido por blob; sólo eventos de zona.
- **Grid warp**: interpolación bilineal por celda; el modo keystone es bilineal sobre las 4 esquinas, no una homografía.

### 4.4 Coordenadas
- Mundo en metros, sensor en el origen. **[APP]**
- Salida normalizada 0–1 respecto al ROI, reasignable con `Norm Out Range`. **[GUÍA]**
- En TouchDesigner el fabricante dibuja en `0,5 − y`, de modo que **y = 0 es el borde superior** (convención de pantalla, como nuestro UV). **[TOE][INF]**
- Las coordenadas no se envían en píxeles; el tamaño en píxeles del ROI se anuncia aparte. **[ARCH][TOE]**
- La normalización usa la caja alineada con los ejes del ROI; la rotación del ROI no se aplicaría en ese paso. **[ARCH]** (pendiente de comprobar con sensor)

### 4.5 Contrato de salida

**OSC de blobs — UDP 3334** **[TOE][GUÍA][APP]**
```
/lidar/blob/<sensor>   count  id1 x1 y1  id2 x2 y2 ...
```
- `<sensor>`: número de puerto COM (`/lidar/blob/4`), `ip_puerto` con guiones bajos (`/lidar/blob/192_168_75_12_10940`), o `0` / `global` en modo unificado.
- Un mensaje por trama y sensor, sin *bundles*; `count = 0` cuando no hay nadie.
- Formatos antiguos que el receptor del fabricante aún acepta: `/LIDAR/BLOBS` y `/LIDAR-<n>/BLOBS`.
- `/lidar/sensor_alias <sensorId> <alias>` anuncia el alias. **[GUÍA]**

**OSC de zonas — UDP 4444** **[TOE][GUÍA]**
```
/hotspot/count  n            /hotspot/zones  n  (id, "/nombre")...
/<zona>            1 | 0     /<zona>/state     1 | 0
/<zona>/triggered            /<zona>/count     n
/<zona>/enter  blob_id x y   /<zona>/exit   blob_id dwell_time
/hotspot/enter | exit | triggered   id  "nombre"
```
El nombre de la zona, saneado, es la ruta. `triggered` es un pulso tras el tiempo de permanencia.

**OSC de resolución — UDP 5555, una vez por segundo** **[TOE]**
```
/selection/pixels            width height
/selection/pixels/<sensor>   width height
```

**UDP binario — puerto 3333** **[GUÍA][ARCH]**: `float32` con el número de blobs y, por blob, 16 bytes (`x`, `y`, `velocidad`, `id`, todos `float32` little-endian).

**OSC de entrada — UDP 6060** **[APP]** (la guía dice 5005 o 3333): inyección de puntos externos (`/lidar/input/point`) y, según la guía, cambio de template por control remoto.

**WebSocket — mismo puerto que la interfaz** **[ARCH]**: JSON `{type:"blobs", sensorId, count, blobs:[{id, x, y, smoothed_x, smoothed_y, width, height, area, size, angle, age, velocity_x, velocity_y, nx, ny …}]}` y nube binaria en `float32`. Lo usan la propia interfaz y los juegos web; no está documentado como salida para terceros.

**Spout** **[APP][GUÍA][ARCH]**: emisor `LIDAR_Output`, 1024 × 1024 por defecto, con el render del visor. El navegador envía cada fotograma al addon por WebSocket. También hay entrada Spout como fondo. No hay NDI ni Syphon.

**Teclado** **[APP][ARCH]**: tecla por zona.

**TUIO**: no encontrado como salida operativa. **[APP][GUÍA][ARCH]**

**Cadencia**: la del sensor (10–20 Hz), sin interpolación. La guía habla de 60 FPS para el render. **[ARCH][GUÍA]**

### 4.6 Persistencia **[ARCH][GUÍA]**
- Carpeta de datos de usuario con `Presets\{zones, blob, output, lidar, settings, templates}\<nombre>.json`, sensores recordados y un autoguardado por instancia; parte del estado de interfaz vive en el almacenamiento local del navegador.
- Claves principales de un template: modo de ROI, área de selección (por sensor y global), transformación, configuración de blobs, salidas (destinos, puertos, dirección), alias de sensores, zonas, máscaras, normalización, grid warp, Spout y parámetros de sensor.

### 4.7 Robustez **[ARCH][GUÍA]**
- Reconexión: conexión rápida a sensores recordados, tres reintentos (10, 20, 30 s), sondeo de puertos cada 60 s, vigilancia de conexión de 15 s; Hokuyo y POE reintentan con espera creciente.
- Registro local de telemetría que marca congelación cuando pasan más de 150 ms entre tramas.
- No hay proceso supervisor: si el servidor falla, cae toda la aplicación.

---

## 5. Patrones

### 5.1 Patrones que conviene adoptar
| Patrón | Por qué funciona |
|---|---|
| Lienzo central como lugar de trabajo; el panel sólo aporta valores y acciones | El operador mira la sala, no formularios. |
| Herramienta ↔ capa: cada modo deja manipulable una sola capa | Elimina arrastres accidentales en escenas con geometría superpuesta. |
| Abrir una sección del panel selecciona la herramienta | El lienzo siempre refleja la tarea en curso. |
| Capas con tres estados (activa, fantasma, oculta) y contador `7 / 7` | Contexto visible sin estorbar. |
| Candado por objeto con cambio de color y de cursor | Protege una instalación ya calibrada. |
| Plantilla de la superficie física con medidas reales y `Alinear` | Convierte "girar a ojo" en "declarar dónde está el sensor". |
| ROI con tiradores, proporción bloqueable y lectura en mm, píxeles y proporción | Une medida física y resolución de contenido. |
| Píldora de resolución efectiva en la cabecera | El dato que TouchDesigner necesita, siempre a la vista. |
| Dianas numeradas, la siguiente en gris, línea hasta la mano, contador de muestras, verde al capturar | El operador sabe qué hacer y cuándo ha terminado sin mirar al portátil. |
| Captura automática por proximidad con alternativa manual | Una sola persona puede calibrar. |
| Comprobaciones previas (hay ROI, no hay blobs) | Evita calibraciones inválidas. |
| Simulador en el propio lienzo, con blobs automáticos | Probar zonas y salidas sin hardware. |
| Contenido real como fondo (imagen, webcam, textura de entrada) | Las zonas se dibujan sobre los gráficos reales. |
| Nombre de zona = dirección OSC, visible en la fila | Sin tablas de correspondencia. |
| Tres mensajes por zona: estado continuo, valor directo, pulso | Encaja con botones de TouchDesigner, clips de Resolume y *cues*. |
| Mensaje periódico con la resolución del área | El receptor se autoconfigura. |
| Deshacer y rehacer con nombre de acción | Confianza para probar. |
| Template de instalación completo, exportable | Clonar una sala o volver a un estado bueno. |
| Guía con buscador y recorrido sobre la interfaz real | Formación sin salir de la aplicación. |
| Consola de actividad del sensor con contador de repeticiones | Diagnóstico sin abrir registros. |
| Proyecto de TouchDesigner de recepción listo para usar | Reduce a cero el coste de integración. |
| Mando remoto: cruceta, paso de ajuste, botón de captura | Ajuste fino con una mano, frente a la pared. |

### 5.2 Patrones que conviene evitar
- Mezclar idiomas en la misma pantalla.
- Conmutadores con forma de botón cuyo estado no se distingue del foco (`ENABLE GRID MAPPING`, `SHOW GRID OVERLAY`).
- Panel lateral que tapa el lienzo: `Zoom` encuadra el ROI detrás del panel.
- Acordeones dentro de acordeones y siete pestañas en 450 px.
- Herramienta armada en un modo distinto del necesario (`Drawing...` de máscaras con el visor en `Zonas`): no pasa nada y no se explica.
- Plegar una sección cambia de modo de forma poco predecible.
- Instrucción que dice "punto naranja" cuando la diana es cian; `Distance: 1216px` no significa nada para el operador.
- Calibración sin resultado: ni error residual, ni repetir un punto, ni invitación a verificar.
- Teclado obligatorio durante la calibración.
- Interfaz de configuración en la pantalla que ve el público.
- Tiempo de permanencia y antirrebote globales en lugar de por zona.
- Parámetros sin ayuda ni presets; un control (`SENSITIVITY`) que no hace nada.
- Datos obsoletos en pantalla (la píldora `Canvas` conserva el valor tras borrar el ROI; versión `1.0.0` y `localhost:3000` en el estado del sistema).
- Documentación desalineada con la interfaz (número de modos, atajos, parámetros que no existen, puertos distintos).
- Licencia en línea que puede interrumpir una sesión de trabajo.
- Emisión de datos a servidores externos activada por defecto (ver Anexo).
- Emojis como iconografía y densidad visual alta.

### 5.3 Huecos en los que VEATION Touch puede ganar
| Hueco del producto de referencia | Ventaja de VEATION Touch |
|---|---|
| Plano único; el reparto del lienzo entre sensores es manual | Modelo de sala: muros con medidas, lienzo de salida y `pixelRect` por muro; las coordenadas salen ya en el espacio del contenido. |
| S2E sin confirmar; orientado a USB | Driver propio para S2E por UDP, con vigilancia y reconexión probadas contra emulador. |
| Sin sustracción de fondo | Fondo aprendido por sensor; las máscaras quedan para excepciones. |
| Blobs sin semántica de toque | `down` / `up`, confirmación en 2 vueltas, puerta de tamaño, corrección de contacto, rechazo de cuerpos. |
| Emisión a la cadencia del sensor | Salida a 60 Hz con filtro One Euro y extrapolación. |
| Calibración bilineal de 4 puntos sin métrica | Homografía con 9 puntos, residuo RMS, peor punto y repetición. |
| TUIO ausente | TUIO 1.1 real, una fuente por muro. |
| Mando remoto limitado a la malla | La misma aplicación completa en tablet o teléfono. |
| Un solo proceso, sin supervisor | Motor separado con supervisor; funciona sin ventana. |
| Perfiles repartidos entre archivos y almacenamiento del navegador | Un JSON por sala, escritura atómica, 30 copias, migración de esquema. |
| Licencia en línea, sólo Windows | Funciona sin conexión; el motor es Node puro. |
| Textura Spout = captura del visor | Textura de máscara limpia, a la resolución del lienzo, como formato de salida. |
| Español e inglés mezclados | Inglés coherente y sistema visual de VEATION. |

Conviene no sobrevalorar un punto: **el producto de referencia sí tiene calibración desde el teléfono** y una mención expresa a salas de 4 sensores. La ventaja nuestra no es "tener tablet", sino que la tablet sea la aplicación entera y que la sala sea un objeto del modelo.

---

## 6. Recomendaciones concretas para VEATION Touch

### 6.1 El espacio de trabajo central por modo
Principio: **cada herramienta cambia lo que se ve y lo que se puede agarrar en el centro**; el panel lateral es secundario y nunca tapa el lienzo (se acopla y el lienzo se reencuadra).

| Modo | Vista central | Manipulación directa | Panel |
|---|---|---|---|
| `Room` | Planta de la sala y desplegado de muros | Arrastrar muros, puertas y sensores | Medidas |
| `Sensors` | Alzado de un muro con la nube cruda de sus sensores, rectángulo del muro como plantilla física | Arrastrar y girar el sensor; ver suelo, techo y laterales encajar en el rectángulo | IP, modo de barrido, Hz, salud, registro |
| `Mapping` | Dos vistas enlazadas: muro en metros ↔ lienzo en píxeles, con contenido de fondo | Esquinas, nodos de malla, puntos de control | Malla, interpolación, paso de ajuste |
| `Calibrate` | Modo foco: dianas en la proyección y espejo en la tablet | Tocar la pared; repetir un punto tocándolo en la lista | Progreso, residuos |
| `Zones` | Muro o lienzo con el contenido de fondo | Dibujar, mover, redimensionar, duplicar | Nombre, dirección, disparo, permanencia |
| `Tracking` | Nube + detecciones + rechazadas con su motivo | Ninguna; observación con manos reales o virtuales | Presets y parámetros con ayuda |
| `Outputs` | Monitor de señal: lo que sale por cada destino y vista previa de la textura | Enlazar destinos a muros o zonas | Formato, puerto, cadencia, prueba |
| `Live` | Sala completa, sólo lectura, bloqueada | Manos virtuales | Estado, eventos |

Reglas transversales:
1. **Barra de herramientas del lienzo** con la herramienta activa siempre visible y atajos 1–8; cambiar de vista selecciona la herramienta, y al revés.
2. **Capas** con activa / fantasma / oculta, y contador.
3. **Candado** por muro, sensor, zona y máscara, además de un candado general de sala para el modo `Live`.
4. **Deshacer y rehacer** con nombre de acción; el servidor ya versiona el perfil por revisión, así que el historial puede apoyarse en ello.
5. **Manos virtuales disponibles en todos los modos**, no sólo en `Live`.
6. **Lectura siempre visible** en la cabecera: sensores, toques, salidas activas y resolución del lienzo.

### 6.2 Montaje de sensores
- Usar el rectángulo del muro (ya conocemos sus medidas) como plantilla física.
- `Place sensor`: elegir posición en un diagrama (centro del borde superior, esquina…) y altura sobre el muro; aplica la pose inicial en un paso, como `Alinear`.
- **Ir más allá: `Auto-fit`.** Ajustar automáticamente las líneas de suelo, techo y laterales de la nube a los bordes del rectángulo y proponer la pose; el operador sólo confirma. El producto de referencia no lo hace.
- Indicador de nivelación del plano (inclinación estimada a partir de la distancia al muro a lo largo del barrido).
- Consola de actividad por sensor con contador de repeticiones, y tarjetas de puntos por vuelta, Hz y paquetes por segundo.

### 6.3 Mapeo de sala: esquinas, malla y puntos
Tres niveles, de menor a mayor esfuerzo, que responden a lo pedido por el director creativo:
1. **`Corners`** — cuatro esquinas por muro (homografía). Arrastrar o capturar tocando.
2. **`Grid`** — malla N × M (de 2 × 2 a 16 × 16) sobre el muro: mover nodos, selección múltiple, insertar fila o columna con un clic sobre la malla, restablecer selección o todo. Interpolación bilineal o suave.
3. **`Points`** — puntos de control libres: tocar la pared en un sitio conocido del contenido y arrastrar el punto hasta donde debería estar. Sirve para corregir zonas concretas sin densificar toda la malla.

Detalles que marcan la diferencia:
- La malla deforma **coordenadas de toque**, no imagen; decirlo en la interfaz.
- **Contenido de fondo** dentro del muro: imagen o captura del contenido, y más adelante textura de entrada (Spout/NDI).
- **Mando en la tablet**: cruceta, paso de ajuste (1, 5, 20 mm), deshacer, y cursor en vivo de la mano del operador.
- Vista en píxeles enlazada con la vista en metros, con la resolución efectiva del muro.
- Presets de mapeo por muro, incluidos en el perfil.

### 6.4 Flujo de calibración
Conservar nuestro asistente (fondo → dianas → homografía → residuos) y añadir lo aprendido:
1. **Comprobaciones previas**: fondo capturado, sala vacía, sensores en línea.
2. **Calibración rápida de 4 esquinas** como primer paso (un minuto) y **refinado de 9 puntos** opcional.
3. **Rectángulo de dianas ajustable** a una zona alcanzable, con proporción bloqueable.
4. En la pared: diana activa en ámbar, siguiente en gris, hechas con marca; **anillo de progreso** durante los 0,7 s de captura; línea desde la mano hasta la diana; texto corto y coherente con los colores.
5. **Sin teclado**: captura automática, y botón `Capture` y `Back` en la tablet.
6. **Resultado**: residuo RMS, peor punto resaltado, `Redo point`, `Apply`.
7. **Verificación guiada** al terminar: cursor bajo la mano y cinco dianas de comprobación que se apagan al tocarlas, con el error medido en milímetros.
8. Sonido o vibración en la tablet al capturar.

### 6.5 Zonas y disparadores
- Dibujar sobre el contenido de fondo; rectángulo, círculo y polígono; duplicar con Ctrl+C/V.
- **La dirección OSC visible y editable en la fila de la zona**, derivada del nombre.
- Permanencia y antirrebote **por zona**; opción de estado invertido.
- Botón de disparo de prueba por zona y registro de eventos junto al lienzo.

### 6.6 Formatos de salida
Modelo propuesto: cada destino = **formato × ámbito × coordenadas × cadencia**.

| Formato | Contenido | Uso |
|---|---|---|
| `Touches (OSC)` | Contrato actual `/vt/...` | TouchDesigner, Unreal |
| `Triggers (OSC)` | Sólo zonas: estado, valor directo y pulso | Resolume, MadMapper, QLab, consolas |
| `TUIO 1.1` | Actual | Aplicaciones multitáctiles |
| `WebSocket` | Actual | Aplicaciones web propias |
| `Texture (mask)` | Blanco sobre negro, a la resolución del lienzo o por muro | Sistemas de partículas, fluidos, máscaras |
| `Keyboard` | Tecla por zona | Aplicaciones sin red |
| `LidarUI-compatible (OSC)` | Ver 6.7 | Estudios que migran |

**Textura de toques** — opciones: radio en metros, borde suave, estela con caída en milisegundos, intensidad por edad o tamaño, ámbito (lienzo completo o un muro), fondo negro o transparente, vista previa en `Outputs`.

Dos rutas, en este orden:
1. **Componente de TouchDesigner (`.tox`) propio** que construye la textura a partir de `/vt` o del WebSocket. No añade dependencias y es lo que el producto de referencia entrega en la práctica. Es inmediato.
2. **Emisor Spout nativo** en un proceso auxiliar. Spout2 tiene licencia BSD-2, compatible con nuestra regla de licencias. NDI exige aceptar la licencia de su SDK, que no es MIT/BSD/Apache/ISC: requiere una decisión expresa antes de incorporarlo.

Evitar la solución del producto de referencia para Spout (enviar cada fotograma del navegador al addon por WebSocket): es costosa y limita la resolución.

Añadir también un **mensaje de geometría** periódico (resolución del lienzo y `pixelRect` de cada muro) para que el receptor se autoconfigure.

### 6.7 Compatibilidad para que un estudio pueda cambiar
Ofrecer un tipo de destino **`LidarUI-compatible`**, desactivado por defecto y sin tocar el contrato público de `docs/OSC.md`:

| Puerto | Mensaje | Correspondencia en VEATION Touch |
|---|---|---|
| 3334 | `/lidar/blob/<n>  count (id x y)…` | Un mensaje por muro; `<n>` = índice o id del muro; `x, y` = UV del muro con origen arriba-izquierda. Variante `/lidar/blob/0` con el lienzo completo. |
| 4444 | `/<zona>`, `/<zona>/state`, `/<zona>/triggered`, `/<zona>/enter`, `/<zona>/exit`, `/hotspot/count`, `/hotspot/zones` | Zonas por nombre saneado. |
| 5555 | `/selection/pixels w h` y `/selection/pixels/<n>` | Resolución del lienzo y de cada `pixelRect`. |

Con esto, el proyecto `Data_Lidar_in.toe` del fabricante y los proyectos de sus usuarios recibirían datos de VEATION Touch sin cambios. Es la implementación independiente de un formato de mensajes, no reutilización de código. Antes de publicarlo conviene validarlo con un sensor real del producto de referencia, porque el signo del eje Y y el redondeo de ids proceden de inferencias.

### 6.8 Otras ideas a incorporar
- **Snapshots de sala con nombre** (`Save snapshot`) además de las copias automáticas, con exportación e importación del perfil.
- **Guía integrada con buscador** y recorrido guiado sobre la interfaz real; y un mini recorrido en la tablet.
- **Presets de seguimiento** (`Hands on wall`, `Bodies`, `Objects`) con ayuda en cada parámetro: el producto de referencia no los tiene.
- **Fondo de contenido** como capa propia en `Zones` y `Mapping`.
- **Cruceta y paso de ajuste** como componente común de tablet para mover sensor, nodos y zonas.
- **Servidor MCP**: no es prioritario, pero el motor ya expone órdenes; anotarlo como posible diferenciador futuro.

---

## 7. Licencia, términos y alcance de la inspección

### Qué dicen los términos
- **Carpeta de instalación**: sólo contiene las licencias de Electron, Chromium y el driver de Silicon Labs. No hay EULA ni archivo de licencia del producto.
- **`package.json` del paquete**: declara `"license": "MIT"` y autor "Lidar Visualization Team". No lo acompaña ningún texto de licencia, y el producto se vende por suscripción, así que no se ha tratado como una concesión real de derechos.
- **`tolchx.com/terms`** (actualizado el 14-11-2026): términos generales de la plataforma educativa. El material es propiedad intelectual de Tolch o se usa bajo licencia; se concede una licencia limitada de uso personal y educativo; se prohíbe redistribuir o revender. **No menciona ingeniería inversa ni descompilación.**
- **Página del producto**: no añade condiciones propias.

Conclusión aplicada: nada prohíbe expresamente inspeccionar, pero el producto es propietario. Se ha estudiado para entenderlo y **no se ha copiado código, recursos, shaders, iconos ni textos** al proyecto. Las pocas cadenas citadas en este documento son etiquetas de interfaz y direcciones de mensajes, necesarias para describir el producto y el formato de datos.

### Qué se inspeccionó
- La aplicación en ejecución: todas las pestañas, modos, diálogos, ventana de salida, guía (17 de 19 secciones leídas) y la página remota en sólo lectura.
- Los tres vídeos, fotograma a fotograma.
- El proyecto `.toe`, expandido a texto con la herramienta oficial de Derivative sobre una copia.
- El listado del `app.asar` y una selección de archivos propios de la aplicación (`frontend`, `server`, `electron`, `package.json`), extraídos como texto inerte en el scratchpad. El HTML es legible; **el JavaScript está ofuscado** y su comportamiento se reconstruyó leyendo sus tablas de cadenas y constantes, sin ejecutar nada. Todo lo marcado **[ARCH]** procede de ahí y debe tomarse como indicio.

### Qué no se inspeccionó
- El código de licencias y autenticación, la clave pública, los esquemas SQL.
- El addon nativo (`lidar_addon.node`) y los ejecutables: no se han desensamblado.
- La carpeta `Games` (juegos y recursos de terceros) y `node_modules`.
- El instalador no se ejecutó. No se introdujeron credenciales ni se usó el token de sesión.
- No se probó nada con sensores reales: no había ninguno conectado.

### Estado en que quedó la aplicación
Se crearon y se borraron un ROI, una zona y una máscara de prueba; se restauraron el modo `Todo`, el panel en `Simple` y el tamaño de ventana. El historial de deshacer conserva esas acciones y el encuadre del visor puede diferir ligeramente del inicial.

### Material temporal
- Archivos extraídos: `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-asar\` — se puede borrar tras la revisión.
- Una salida de herramienta guardada automáticamente contiene fragmentos desofuscados; conviene borrarla: `C:\Users\beltr\.claude\projects\C--Users-beltr-Desktop-Alma-Digital-Studio-Projects-Interactive-System-Veat\62424d24-2cee-4d4c-8abf-afa037fa5c1c\tool-results\b8yh20vcj.txt`

---

## 8. Capturas y fotogramas más informativos

### Capturas de la aplicación
Carpeta: `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\`

| Archivo | Qué muestra |
|---|---|
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\01_main_viewport_todo.jpg` | Ventana principal: cabecera, barra de modos, capas, visor. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\02_lidar_ethernet_panel.jpg` | Conexión Ethernet: presets, IP, puerto 8089, protocolo, driver. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\06_roi_drawn_handles_readout.jpg` | ROI con tiradores y lectura en mm, píxeles y proporción. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\35_roi_locked_zoomed.jpg` | ROI bloqueado (ámbar) y rejilla con cotas en metros. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\07_calibration_dialog.jpg` | Diálogo de calibración (monitor, Manual, Auto). |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\08_output_window_calibration_targets.jpg` | Ventana de salida con las cuatro dianas y el estado. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\09_calibration_coach_panel.jpg` | Panel de acompañamiento durante la calibración. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\12_simulated_blob_zone_active.jpg` | Blob simulado activando una zona; máscara al lado. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\13_zone_event_log.jpg` | Zonas, máscaras, configuración y registro de eventos. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\14_mapping_grid_warp_panel.jpg` | Pestaña Mapping: modos, malla, interpolación. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\15_inout_osc_input_targets.jpg` | Entrada OSC, salida de red y tabla de destinos. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\17_blob_parameters.jpg` | Parámetros del tracker. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\19_input_background_image_in_roi.jpg` | Imagen de prueba como fondo dentro del ROI. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\21_screen_reference_on.jpg` | Plantilla de superficie física activada. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\23_save_template_dialog.jpg` | Diálogo de guardado de template. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\36_remote_calibration_phone_grid.jpg` | Página remota en el teléfono: malla, cruceta, barra inferior. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\27_guide_multisensor.jpg` | Guía: varios sensores, Merge y Single. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-screens\29_guide_inout.jpg` | Guía: formatos y puertos de salida. |

En la misma carpeta hay otras 19 capturas (pestañas restantes y páginas de la guía), numeradas del 01 al 37.

### Fotogramas de los vídeos
Los nombres de la web no coinciden con el contenido: `video_3` es la calibración completa, `video_2` es el uso por el público y `video_1` es un montaje (TouchDesigner, panel de control del kiosco, sensor, calibración, visitantes).

| Archivo | Qué muestra |
|---|---|
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\calib_trio.jpg` | Calibración: punto 2/4 con distancia; captura con contador; diana 1 en verde. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\verify_trio.jpg` | Verificación: visor superpuesto a escala real y marcador bajo la mano. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\full_001.jpg` | Panel lateral en la pared LED: rotación 317, flip, zoom, área, Calibrate. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\full_010.jpg` | Visor antes de calibrar, con el sensor sobre su brazo encima de la pared. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\end_calib_10fps_sheet.jpg` | Fin de la calibración: vuelta al visor sin resumen. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_3\dense\track_10fps_sheet_01.jpg` | Mano deslizándose a 10 fps: retardo aparente de 0,1 a 0,25 s. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_1\dense\crop_td_osc.jpg` | TouchDesigner: canales `LIDAR/BLOBS` con número, id, x, y. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_1\dense\crop_lidarui_laptop_top.jpg` | Tarjeta de conexión: RPLidar C1/A3, COM4, 460800, puntos y FPS. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_1\dense\trio_sensor_kiosk_ide.jpg` | Montaje del sensor con webcam; panel `CONTROL DE KIOSK`; IDE. |
| `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-frames\video_2\dense\menu_5fps_sheet.jpg` | Uso por el público: menú radial activado por permanencia. |

Proyecto de TouchDesigner expandido: `C:\Users\beltr\AppData\Local\Temp\claude\48c7123ae0fc2e47\62424d24-2cee-4d4c-8abf-afa037fa5c1c\scratchpad\lidarui-toe\Data_Lidar_in.toe.dir\`

---

## Anexo. Avisos para el propietario sobre la aplicación instalada

No afectan al análisis, pero conviene conocerlos mientras la aplicación esté instalada en este equipo.

1. **Servidor abierto a la red local.** La aplicación escucha en todas las interfaces en el puerto 59391 (interfaz, WebSocket y servidor MCP) y en UDP 6060. **[APP]**
2. **Conexión saliente permanente.** Con la aplicación abierta se observó una conexión HTTPS establecida con `149.50.139.152:443`. **[APP]** Según la lectura de los archivos, además de la comprobación de versión y el registro de sesión de la licencia, existe una salida llamada "JP Editor", activada por defecto, que enviaría hasta 30 puntos normalizados a 30 fps junto con el nombre del equipo a un servidor del fabricante. **[ARCH]** No se ha verificado a nivel de paquetes. En una instalación para un cliente convendría bloquear ese tráfico o confirmar con el fabricante cómo desactivarlo.
3. **Cambios en ajustes de Windows.** La guía indica que, al iniciar, la aplicación desactiva los gestos táctiles de 3 y 4 dedos y el deslizamiento desde los bordes mediante el registro de Windows. **[GUÍA]** Si este equipo usa pantalla táctil, puede ser necesario reactivarlos a mano.
4. **Contenido de terceros.** El paquete incluye recursos de marcas de clientes del fabricante y documentación interna de desarrollo. No se han abierto.
