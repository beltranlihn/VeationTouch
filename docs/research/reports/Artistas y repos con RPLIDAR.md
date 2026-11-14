# Referencias RPLIDAR: mucho A1 por USB, nada para S2E

**No existe, en lo que pudimos verificar, ningún repositorio abierto que combine RPLIDAR S2E por UDP, tracking de toques y salida TUIO/OSC.** Todo lo público en TouchDesigner gira en torno a sensores A1 por USB serie y a un CHOP en C++ de terceros. Lake Heckaman es una referencia real y citada en la comunidad, pero lo único que podemos atribuirle con seguridad es el vídeo "Slamtec RPLiDAR in TouchDesigner". Ese vídeo se apoya en un plugin escrito por otra persona, y no pudimos ver su contenido. Las piezas más útiles para Alma son tres: el hilo del foro de Derivative sobre los problemas con lidars Ethernet, el repo ZKM `lidar` como arquitectura (BSD) y los PDF oficiales del protocolo S2E. El código de usuario del SDK es la base de nuestro propio parser UDP en TypeScript. El tracking de blobs sobre scans RPLIDAR hay que escribirlo en casa.

Leyenda: **[V]** verificado en la fuente; **[NV]** no verificado (solo título, snippet o descripción secundaria).

## Tabla de referencias

| Referencia | Qué es | Sensor / transporte | Licencia | Utilidad para Alma |
|---|---|---|---|---|
| [Vídeo "Slamtec RPLiDAR in TouchDesigner"](https://www.youtube.com/watch?v=fAvF2niosNA) (Lake Heckaman) | Tutorial citado como "walkthrough de Lake Heckaman" en el README del plugin y en el foro [V la atribución, NV el contenido] | A1M8 por USB serie (inferido) | n/a | Ver para mounting y calibración. No cubre Ethernet/S2E |
| [Vídeo "2025 Update: Slamtec LiDAR for TouchDesigner"](https://www.youtube.com/watch?v=l6noiFoRERY) | Tutorial actualizado: drivers, SlamtecCHOP, instancing y point cloud [NV: contenido por snippet; autoría no confirmada] | S3 según wiki HKU | n/a | Ver. Posible mención de red |
| [ALLTD "I turned my monitor into a touchscreen" P.II/III](https://alltd.org/tag/lidar) | Serie de conversión de scan a coordenadas táctiles [NV: autor y sensor] | Desconocido | n/a | Ver la parte de calibración |
| [lakeheckaman.com](https://lakeheckaman.com) / [Patreon water__shed](https://www.patreon.com/water__shed) | Web y Patreon de Heckaman [V]. Sin .tox ni post de LiDAR visible; la web dio 403 | n/a | n/a | Punto de contacto (ver abajo) |
| [thepelkus-too/SlamtecLidarTDCPPCHOP](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP) | CHOP C++ para TD; salida polar o cartesiana [V] | A1 por serie; algunos usuarios con problemas en S2 [V] | MIT [V] | Ejemplo simple de pipeline. Sin mantenimiento, sin red |
| [Ajasra/SlamtecCHOP](https://github.com/Ajasra/SlamtecCHOP) + [asset en Derivative](https://derivative.ca/community-post/asset/slamtec-rplidar-support/67156) | CHOP que soporta A1-S3; la ficha de Derivative dice que sirve para S2E con UDP/TCP [V]. El README de GitHub dice que la red es TODO [V]: contradicción | Serie y, según la ficha, UDP/TCP | Sin licencia visible | Estudiar el comportamiento, no reutilizar código |
| [Hilo foro Derivative "Slamtec RPLidar support"](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2) | Problemas reales con S2M1/A3M1 por Ethernet, crashes del DLL, hasta 8 lidars en una máquina [V] | S2E, S2M1, A3M1, A1 | n/a | **Muy alta**: lista de fallos que evitar |
| [zkmkarlsruhe/lidar](https://github.com/zkmkarlsruhe/lidar) | Tracking multi-lidar: nodos cliente envían por UDP (un puerto por sensor) a un servidor; salida OSC, WebSocket, MQTT; calibración contra pixel map y modo simulación [V] | C++17, Linux; modelos no indicados | BSD simplificada [V] | **Referencia de arquitectura** (ideas, no código) |
| [Hermeak1/__lidar_unity_](https://github.com/Hermeak1/__lidar_unity_) | App Windows, 1-4 RPLIDAR, scan a pantalla, calibración JSON por sensor, inyección de ratón [V] | SDK DLL; transporte no indicado | Ninguna detectada | Análogo funcional; UX de calibración multi-sensor |
| [JpHoooo/unity-tuio-rplidar](https://github.com/JpHoooo/unity-tuio-rplidar) | Unity consumiendo TUIO desde el toolkit de Slamtec [V] | A2M6 serie | Ninguna detectada | Confirma el patrón "TUIO como salida estándar" |
| [Slamtec RPLIDAR Interactive Toolkit](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2) | Software cerrado: multitouch, TUIO, emulación de ratón, Ethernet [V por búsqueda, PDF no abierto] | S3 listado; Ethernet | Propietaria | Competidor/referencia de producto: sensor a ~50 cm de la superficie |
| [Protocolo S2E](https://bucket-download.slamtec.com/29ed73b84370f1ff1e3c09022b79976b46c6558f/SLAMTEC_rplidarkit_protocol_S2E_v1.0_cn.pdf), [manual S2E](https://stgaws.robu.in/wp-content/uploads/2023/03/SLAMTEC_rplidarkit_usermanual_S2E_v1.1_en-1.pdf) | Formato UDP de scan, info y salud; IP 192.168.11.2, puerto 8089 [V] | S2E por UDP | Documentación del fabricante | **Base de nuestro parser** (el PDF no fue leído a fondo) |
| [vvvv: observable UDP socket](https://forum.vvvv.org/t/observable-udp-socket/24484) (antokhio, rama `feat/udp-lidar`) | Única conexión UDP cruda a S2E sin SDK [V]. Clave: el lidar es el servidor, hay que usar `Connect` o un EndPoint explícito | S2E por UDP | No verificada | Prueba de que el camino sin SDK funciona; estudiar el gist |
| [Futurewife "LIDAR Touch"](https://www.futurewife.tv/lidar-touch) | Producto comercial que convierte cualquier superficie en táctil [V] | No indicado | Comercial | Solo vigilancia de competencia |

Las demás referencias encontradas (kamiyam, timetzhang, yoonsscom, wrappers Unity de rplidar4net-unity y Rplidar-Unity, Only0nce/rplidar_s2e) no aportan nada a Alma. Los repos de touch están sin licencia, son seriales o dependen del DLL de Slamtec, y `rplidar_s2e` es una copia del nodo ROS sin UDP propio. El repo georgevpp-code/RPLidar-S1-Touchdesigner-multitouch empaqueta binarios de Slamtec sin licencia clara: no reutilizar. No se encontró plugin de Unreal ni repo en Node/TypeScript.

## Qué aprovechamos y qué evitamos

**Transporte.** Los problemas documentados en el foro (S2M1 y A3M1 por Ethernet que no se descubren, el lidar que no gira, "RPlidar is busy", crashes de TouchDesigner al abrir proyectos con el DLL) justifican hablar UDP directamente desde Electron y no depender de plugins ni SDK nativo. Vasily, autor de SlamtecCHOP, también prefiere unidades de red frente a serie y dice haber corrido hasta 8 en una máquina [V]. Eso respalda el modelo de un sensor por muro.

**Protocolo.** El camino realista es el PDF del protocolo S2E, más las cabeceras BSD-2 del SDK (`sl_lidar_protocol.h`, `handler_capsules.cpp`) como referencia de decodificación de cápsulas. Capturar el tráfico de RoboStudio con Wireshark y escribir un disector Lua sobre el puerto 8089 serviría además como fixture de pruebas. No hay disector publicado.

**Arquitectura.** ZKM lidar valida el diseño sensor, UDP, servidor, tracking y salida OSC/WebSocket. Conviene copiar sus ideas: un puerto por sensor, calibración contra un mapa de píxeles y un modo de simulación sin hardware. El código C++ no se reutiliza. El README no confirma soporte RPLIDAR.

**Calibración.** Hermeak1 (calibración JSON por sensor y mapeo por monitor) y el manual del Interactive Toolkit (introducir el tamaño real del área en mm, sensor a ~50 cm de la superficie) son los únicos modelos de UX. Ambos están pensados para PC, no para tablet.

**Tasa de refresco.** La wiki de HKU descarta el Hokuyo URG-04LX a 10 Hz para seguimiento de posición por lento [V]. El S2E también opera a unos 10 Hz, así que el diseño del tracker (predicción, suavizado, latencia percibida) debe validarse pronto con hardware real. Es una inferencia nuestra, no una afirmación de las fuentes sobre el S2E.

## Próximos pasos

1. **Ver los dos vídeos de Heckaman** (fAvF2niosNA y l6noiFoRERY) y anotar montaje, calibración, filtrado y mención de red. Hasta entonces, todo lo que se diga de su contenido es hipótesis.
2. **Contactar** a Lake Heckaman (Instagram @lake_heckaman o web/Patreon) para preguntar si tiene un .tox o un post de LiDAR y qué sensor usa, y a Vasily (Ajasra) para aclarar si la red UDP está en la versión actual. Se puede preguntar también a antokhio (vvvv) por la licencia del gist y de la rama `feat/udp-lidar`.
3. **Leer el PDF del protocolo S2E** y el gist `RPLidarUDPSocket.cs` antes de escribir el parser; verificar en esos documentos el framing, el checksum y los IDs de petición (aún no leídos).
4. **Estudiar ZKM lidar** (README y estructura de calibración y simulación) como referencia de arquitectura.
5. **Revisar las licencias pendientes**: creativetechnologylab/LiDAR-Sensor, gist vvvv y Ajasra. Sin licencia explícita, tratarlos como solo para aprender.

## Conclusión

Alma no parte de un componente reutilizable, sino de un vacío: el hueco entre "A1 por USB en TouchDesigner" y "S2E por red con tracking multimuro" está sin cubrir públicamente, de modo que el parser UDP y el tracker de blobs serán código propio. La decisión de salir de TouchDesigner no es solo de gusto; los fallos documentados con Ethernet y DLL la avalan. El riesgo principal que ninguna referencia resuelve es la latencia con un S2E a ~10 Hz sobre un muro grande, que habrá que medir antes de cerrar el diseño.
