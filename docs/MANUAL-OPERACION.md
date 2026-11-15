# VEATION Touch — Manual de operación

Software de tracking táctil con LiDAR para muros interactivos. Alma Digital Studio.
Este manual explica cómo montar, calibrar y operar una sala. Los nombres de botones y pantallas están en
inglés, tal como aparecen en el software.

---

## 1. Qué hace

Cada muro tiene uno o más sensores **RPLIDAR S2E** montados arriba, con el plano del láser paralelo a la pared
y a 1,5–3 cm de ella. El software:

1. Recibe los datos de todos los sensores por la red.
2. Detecta las manos que tocan cada muro y les da un número (id) que se mantiene mientras dura el toque.
3. Traduce cada toque a la posición del contenido proyectado (píxeles).
4. Lo envía a TouchDesigner, Unreal o aplicaciones propias por **OSC**, **Triggers (OSC)**, **TUIO**,
   **WebSocket** o como **textura Spout** (máscara blanco y negro).

Se opera desde el ordenador de la sala o desde una **tablet o teléfono** dentro de la sala.

## 2. Instalación y arranque

1. Ejecutar `VEATION Touch Setup x.y.z.exe` en el servidor de la sala (instalación para todos los usuarios).
   El instalador añade la regla del cortafuegos de Windows para que las tablets puedan conectarse.
2. La app arranca y queda en la **bandeja del sistema** (junto al reloj). Cerrar la ventana no la detiene:
   el tracking sigue funcionando. Para salir del todo: icono de la bandeja → **Quit**.
3. Para que arranque con Windows: **System › Start with Windows**. Para una sala desatendida, configurar
   además el inicio de sesión automático de Windows.
4. Si el motor falla, se reinicia solo en 1–30 s (también si su memoria se dispara). Los registros están en la
   carpeta de datos (§13). Para vigilar la sala desde otro equipo: `http://<servidor>:8770/api/health`.

## 3. La pantalla

- **Arriba:** sala activa, estado de sensores y toques, modo de proyección (Off / Identify / Debug),
  **Show** (bloqueo) y **Connect device**.
- **Izquierda (abajo en el teléfono):** las herramientas, en el orden de montaje.
  Teclas **1–8** para cambiar de herramienta.

| Herramienta | Para qué |
|---|---|
| **Live** | Ver la sala en funcionamiento, salud del sistema, eventos, manos virtuales |
| **Room** | Muros: nombre, medidas, orden; redimensionar arrastrando los bordes ámbar |
| **Mapping** | Dónde cae cada muro en el lienzo de salida: rectángulo, esquinas o malla |
| **Sensors** | Sensores: red, posición, giro, fondo, auto-alineado, estado |
| **Calibrate** | Calibración por toques y verificación |
| **Zones** | Zonas de disparo y máscaras (zonas ignoradas) |
| **Outputs** | Destinos de los datos |
| **System** | Conectar dispositivos, salas, grabaciones, ajustes avanzados, registro |

- **Centro:** el espacio de trabajo de cada herramienta. Arrastrar para desplazar, rueda o pellizco para
  zoom, doble clic para encuadrar.
- **Deshacer / rehacer:** botones ↶ ↷ o **Ctrl+Z / Ctrl+Shift+Z**.

## 4. Conectar una tablet o un teléfono

1. En el ordenador: **Connect device** (o **System › Connect a phone or tablet**).
2. Elegir la red a la que está conectada la tablet (normalmente la Wi-Fi de la sala). La red de los
   sensores aparece marcada como *(sensors)*: no conectar la tablet a ella.
3. Escanear el código QR con la cámara de la tablet. Al conectarse aparece **Connected: …** en el panel.
4. El enlace lleva la clave de acceso de la instalación: compartirlo solo con operadores.

Si no abre:
- Comprobar que la tablet está en la misma red.
- Si aparece «No VEATION Touch firewall rule found», pulsar **Fix (administrator)** en el ordenador de la sala.
- Algunas Wi-Fi aíslan los dispositivos entre sí: usar el punto de acceso de la sala con el aislamiento desactivado.

## 5. Crear una sala

**Room › New room…** (o **System › Room profiles › + New**):
- Número de muros, ancho y alto de cada uno (alto = alto de la imagen proyectada).
- Lienzo: **Continuous strip** (un panorama continuo; ej. Barcelona XR Lab = 7196 × 912 px) o **Grid**
  (ej. 2×2 para un procesador de 4 salidas).
- Sensores: un S2E por muro con IPs consecutivas, simulados, o ninguno.

Después, en **Room**, ajustar nombres y medidas exactas (o arrastrar los bordes). Cada sala es un **perfil**:
se puede duplicar, exportar e importar desde **System**. Cada cambio guarda la versión anterior
(**System › Versions**, últimas 30).

## 6. Poner en marcha los sensores

Cada S2E nuevo viene con la IP **192.168.11.2**. El servidor necesita una dirección en esa red (ej. 192.168.11.5).

1. **Sensors › Discover**: busca los S2E que responden en la red y muestra IP, número de serie y firmware.
2. Si varios tienen la IP de fábrica, conectarlos **de uno en uno** y cambiar su IP
   (con RoboStudio de Slamtec; el botón **Change IP…** del software es experimental hasta probarlo en sala).
   Sugerencia XR Lab: 192.168.11.11 (P1) · .12 (P2) · .13 (P3) · .14 (P4).
3. **Add** asigna cada sensor encontrado a su muro. ¿Cuál es cuál? Agitar la mano delante de un sensor: su fila
   en la lista muestra **moving**.
4. Con la **sala vacía**, para cada sensor:
   - **Capture background**: aprende lo que ve sin nadie (suelo, muros vecinos, objetos fijos). Empieza tras una
     cuenta atrás de 5 s para que quien sostiene la tablet se aparte. Si algo se movió durante la captura, lo
     indica (con la posición) y pide repetirla: lo que quede en el fondo tapa los toques en ese punto.
   - **Auto-align (room empty)**: calcula la posición y el giro del sensor a partir del suelo y los muros
     vecinos, y mide el ancho real del muro. Si el ancho difiere del plano más de 3 cm, lo avisa.
     Revisar y pulsar **Apply**.
5. En el lienzo de **Sensors** los puntos blancos son lo que ve el láser; los grises, el fondo. La línea del
   suelo debe quedar sobre el borde inferior del muro.

**Nivelación del soporte:** el plano del S2E puede venir inclinado hasta 1,5° de fábrica (≈ 2,6 cm por metro).
El soporte debe permitir ajustar la inclinación en dos ejes.
- **Level check** (Sensors › Mounting), con la sala vacía: indica si el plano del láser **roza la pared** (dónde y a
  qué distancia del sensor, marcado en rojo en el lienzo) y si la **línea del suelo** se ve completa de esquina a
  esquina. Usa los datos en vivo (último medio segundo), así que se puede repetir justo después de cada ajuste del
  soporte: inclinar el sensor para separar el plano de la pared por ese lado hasta que salga en verde. Al terminar,
  volver a capturar el fondo (si el fondo guardado ya no coincide con lo que ve el sensor, el chequeo lo avisa).
- Lo que no puede ver: un plano demasiado **lejos** de la pared. Comprobar con una regla apoyada perpendicular a la
  pared en varios puntos que se detecta a 1,5–3 cm de la pared en todo el muro.

## 7. Mapping: el muro en los píxeles del contenido

**Mapping** muestra el lienzo de salida (ej. 7196 × 912) con la región de cada muro.
- **Rect:** región rectangular. Arrastrar para mover; esquinas para redimensionar; flechas 1 px (Shift 10 px).
- **Corners:** arrastrar las 4 esquinas de forma libre (corrige keystone).
- **Grid:** malla de nodos; arrastrar nodos, **+ Row / + Column** donde se hace clic, **Subdivide**. Cruceta
  de 1/5/20 px para ajustar desde la tablet.
- **Show pattern on walls** proyecta la retícula de cada muro con marcadores ámbar en las esquinas: ajustar
  hasta que coincidan con las esquinas físicas.
- **Content underlay:** subir un fotograma del contenido (PNG/JPEG) para verlo bajo el lienzo y bajo los muros
  en Zones. Botón **Content** para mostrarlo u ocultarlo.

El mapeo cambia dónde caen los toques en coordenadas de lienzo; nunca modifica la imagen.

## 8. Calibrar un muro (desde la tablet, dentro de la sala)

1. **Calibrate**, elegir el muro. La lista previa debe estar en verde: sensores funcionando, fondo capturado,
   proyección abierta.
2. Objetivos: 3 × 3 por defecto, entre 0,45 m y 1,9 m de altura (al alcance de la mano).
3. **Start calibration**. En el muro aparece un objetivo ámbar: tocarlo con la mano abierta y mantener
   0,7 s hasta que el anillo se complete; retirar la mano. Pasa solo al siguiente.
4. Resultado: error medio (RMS) y peor punto por sensor. Por debajo de ~10 mm es excelente.
   - **Redo worst point** repite el objetivo con más error.
   - **Apply & save** guarda la calibración.
5. **Verify**: 5 puntos nuevos; mide el error real del toque tal como lo reciben las aplicaciones.
   Peor punto por debajo de 25 mm = bien para manos.

En la tablet, la calibración ocupa toda la pantalla (modo foco) con botones grandes.

## 9. Zonas y máscaras

**Zones** muestra un muro (cambiar con P1, P2…).
- **Zone:** arrastrar sobre el muro para dibujar. Mover arrastrando, tiradores para redimensionar,
  **Ctrl+D** duplicar, **Supr** borrar, ajuste a 1/5/10 cm.
- Cada zona envía entrar / mantener / salir y su número de manos. **Hold after** = tiempo para «mantener»;
  **Release after** = tiempo sin manos para «salir». **Trigger address** = dirección para la salida Triggers.
- **Mask:** zonas ignoradas (puerta, lámpara, altavoz). Lo que caiga dentro nunca es un toque.

## 10. Salidas

**Outputs › + Add…** para añadir un destino:

| Tipo | Para qué | Puerto por defecto |
|---|---|---|
| **OSC** | Toques completos (id, posición, velocidad, tamaño, edad, down/up) — TouchDesigner, Unreal | 9000 |
| **Triggers** | Solo zonas: `/dirección 1` al entrar, `0` al salir — Resolume, MadMapper, QLab, mesas de luces | 7000 |
| **TUIO** | Estándar multitáctil | 3333 |
| **Texture** | Máscara blanco y negro de los toques por **Spout** (mismo ordenador) | — |
| **Webhook** | Eventos de zona (entrar / mantener / salir) como petición HTTP con JSON — control de show, domótica, servidores propios | URL |
| **Art-Net** | Un canal DMX por zona (255 mientras está activa) — mesas de luces y nodos DMX | 6454 |
| WebSocket | Apps web/Electron: `ws://<servidor>:8770/ws/data` y SDK en `/sdk/veation-touch.js` | — |

**Coordinates:** *Per wall* (0–1 de cada muro) o *Canvas* (0–1 del lienzo completo, sigue el Mapping).
**Send test** envía un mensaje de prueba. La lista completa de direcciones está en `docs/OSC.md`.

En TouchDesigner: *OSC In DAT* en el puerto (una fila por mensaje); para la textura, *Syphon Spout In TOP*
con el emisor «VEATION Touch».

## 11. Durante la función

- **Show** (arriba) bloquea la sala: nadie puede mover zonas, sensores ni el mapeo por accidente. Las salidas,
  la proyección y las pruebas siguen funcionando. Para desbloquear hay que confirmar.
- **Live › Health** muestra lo que necesita atención: sensores sin datos (con el motivo), sin fondo, sin
  calibrar, salidas con error, motor lento. «✓ All sensors scanning…» = todo bien.
- Si un sensor se desconecta, el software lo reintenta solo (aparece *offline* hasta que vuelven los datos).

## 12. Grabaciones

**System › Recordings › ● Record** graba los datos brutos de todos los sensores (máx. 10 min, ≈ 2–4 MB por
sensor y minuto). **Play** reproduce una grabación como si fuera la sala en directo (aparece **▶ REPLAY** arriba;
pulsarlo para volver a los sensores reales). Sirve para ajustar fondo, filtros, zonas y calibración fuera de la
sala, y para enviar un caso al equipo de desarrollo.

## 13. Carpeta de datos y copias

`%APPDATA%\VEATION Touch` (System › icono de la bandeja › Data folder):
- `profiles/` salas · `backups/` versiones anteriores · `recordings/` grabaciones · `logs/` registros
  (`engine.log`, `main.log`) · `settings.json` ajustes y clave de acceso.

Para llevar una sala a otro ordenador: **System › Export** y **Import**.

## 14. Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| Sensor *offline* | Cable / PoE, IP correcta en Sensors, **Restart**; **Discover** para ver si responde |
| Toques fantasma en un muro vacío | Recapturar el fondo con la sala vacía; máscara sobre el objeto; subir *Background margin* |
| Toques desplazados | Verify; recalibrar ese muro; revisar Mapping con *Show pattern on walls* |
| Toques que se cortan | Nivelar el soporte (plano demasiado lejos de la pared); *Keep through gaps* en System › Processing |
| La tablet no abre el enlace | §4: misma red, regla del cortafuegos, aislamiento de la Wi-Fi |
| TouchDesigner no recibe | Puerto y host en Outputs, **Send test**, cortafuegos del equipo receptor |
